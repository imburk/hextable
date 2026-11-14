// Attacks and a creature's turn (engine.js): attack, act (a monster's actions), dodge, reaction
// instructions, endTurn; and the attacks a turn allows (Multiattack, Extra Attack).
import { actionProfile } from '../effects.js';
import { effectsOf } from '../durations.js';
import { apart, FT } from '../space.js';
import { checkInstructions, reactionsOf } from '../reactions.js';
import { able, control, current, ent, fail, featOf, ft, inFight, need, up, walled } from './shared.js';
import { rollMode } from './rolls.js';
import { aimAction, showPlace } from './world.js';
import { SIZES } from '../content/schema.js';
import { canSee } from '../sight.js';
import { conditionName } from '../modifiers.js';
import { advanceTurn, checkEnd, damage, engage, finishTurn, resolveAttack, runAction, startEncounter } from './resolve.js';
import { unknown } from '../vision.js';
import { roll } from '../rng.js';

function checkRange(s, e, t, atk) {
  const d = apart(s, e, t);
  if (atk.type === 'melee') {
    if (d * FT > atk.reach) fail(`${t.name} is ${ft(d)} away. ${atk.name} reaches ${atk.reach} ft.`);
  } else if (d * FT > atk.range[1]) fail(`${t.name} is ${ft(d)} away. ${atk.name} reaches ${atk.range[1]} ft.`);
}

// ---------- a creature's own actions ----------
// A monster's actions are data, run by the effect runner as a spell's are (effects.js).

// Attacks left this turn from a Multiattack or from Extra Attack sit in `budget.attacks`: a list
// of alternatives, each a list of { action, left }, where `action` is an action id, a list of
// ids (any of them), or null (any attack). An attack spends from every alternative that allows
// it, and alternatives that do not are dropped, so the choice between them is made attack by
// attack. Returns whether `id` may be made from it; with `spend`, makes it.
const fits = (x, id) => x.left > 0 && (x.action === null || x.action === id || (Array.isArray(x.action) && x.action.includes(id)));
const width = (x) => (x.action === null ? Infinity : Array.isArray(x.action) ? x.action.length : 1);
export function fromPool(b, id, spend = false) {
  if (!b?.attacks) return false;
  const keep = b.attacks.filter((alt) => alt.some((x) => fits(x, id)));
  if (!keep.length) return false;
  if (!spend) return true;
  for (const alt of keep) alt.filter((x) => fits(x, id)).sort((x, y) => width(x) - width(y))[0].left--;      // the narrowest entry that allows it
  b.attacks = keep.filter((alt) => alt.some((x) => x.left > 0));
  if (!b.attacks.length) delete b.attacks;
  return true;
}
// How many attacks are left this turn (the most any alternative still allows).
export const attacksLeft = (b) => (b?.attacks ? Math.max(0, ...b.attacks.map((alt) => alt.reduce((n, x) => n + x.left, 0))) : 0);

// Can this action be used now, as far as its recharge and uses go? '' if so.
export function actionSpent(e, def) {
  if (def.recharge && e.spent?.[def.id]) return `${def.name} has not recharged.`;
  if (def.uses && (e.charges?.[def.id] ?? def.uses.n) < 1) return `${e.name} has no uses of ${def.name} left today.`;
  return '';
}

// Use an action: aim it, pay for it, run it. In a fight it costs the creature's action (or its
// Bonus Action, for one with `time: 'bonus'`), unless it is one of the attacks a Multiattack
// left this turn, which it spends instead.
function takeAction(s, e, def, a, ev) {
  const why = actionSpent(e, def);
  if (why) fail(why);
  const { targets, hexes, origin } = aimAction(s, e, def, a);
  const p = actionProfile(def);
  if (!s.encounter && p.harmful && targets !== null && !def.target.self) {          // roll initiative first
    showPlace(s, e, ev);
    if (def.target.creature) showPlace(s, targets[0], ev);
    return def.target.area ? startEncounter(s, e.pos, ev) : engage(s, e, targets[0], ev);
  }
  if (s.encounter) {
    const b = s.encounter.budget, time = def.time ?? 'action', pooled = time === 'action' && fromPool(b, def.id);
    need(s, e, pooled ? null : time);
    if (def.target.creature) for (const t of targets) inFight(s, t.id) || fail(`${t.name} is outside the battle.`);
    if (pooled) fromPool(b, def.id, true); else b[time]--;
  }
  if (def.recharge) (e.spent ??= {})[def.id] = true;
  if (def.uses) (e.charges ??= {})[def.id] = (e.charges[def.id] ?? def.uses.n) - 1;
  runAction(s, e, def, targets, hexes, origin, ev);
  checkEnd(s, ev);
}

// Brutal Strike (`brutal` on a built character's features): on its own turn, after the feature named
// in `after` that turn (Reckless Attack), once a turn, on an attack using Strength that has no
// Disadvantage. Returns the option to apply ({ id, name, dice, effects, unique? }), or refuses.
function brutalFor(s, e, t, atk, id) {
  const fs = (e.feats ?? []).filter((f) => f.brutal), base = fs.find((f) => f.brutal.dice);
  base || fail(`${e.name} has no Brutal Strike.`);
  const options = fs.flatMap((f) => f.brutal.options);
  const o = (typeof id === 'string' && options.find((x) => x.id === id)) || fail(`Choose a ${base.name} effect: ${options.map((x) => x.name).join(', ')}.`);
  const flags = s.encounter.flags;
  current(s) === e.id || fail(`${base.name} is used on ${e.name}'s turn.`);
  flags[`${base.brutal.after}:${e.id}`] || fail(`${base.name} needs ${featOf(e, base.brutal.after)?.name ?? base.brutal.after} this turn.`);
  !flags[`brutal:${e.id}`] || fail(`${e.name} has already used ${base.name} this turn.`);
  atk.abil === 'str' || fail(`${base.name} is for an attack using Strength.`);
  const m = rollMode(s, e, t, atk);
  !m.dis.length || fail(`That attack roll has Disadvantage (${m.dis.join(', ')}), so ${base.name} can't be used on it.`);
  return { ...structuredClone(o), dice: base.brutal.dice };
}

// Cunning Strike (`cunning` on a built character's features): Cunning Strike effects for this attack,
// each named once, at most as many as its features allow, on an attack that can deal Sneak Attack on a
// turn it has not yet, with Sneak Attack dice enough to pay for them, the gear they need, a target of
// the size they need, and (Stealth Attack) made while hidden. Returns the options, or refuses.
const slug = (x) => String(x).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function cunningFor(s, e, t, atk, list) {
  const fs = (e.feats ?? []).filter((f) => f.cunning), options = fs.flatMap((f) => f.cunning.options ?? []);
  options.length || fail(`${e.name} has no Cunning Strike.`);
  const max = Math.max(1, ...fs.map((f) => f.cunning.max ?? 1));
  (Array.isArray(list) && list.length && list.every((x) => typeof x === 'string') && new Set(list).size === list.length) || fail('Name the Cunning Strike effects, each once.');
  list.length <= max || fail(`${e.name} can add ${max === 1 ? 'one Cunning Strike effect' : `${max} Cunning Strike effects`} to an attack.`);
  const chosen = list.map((id) => structuredClone(options.find((o) => o.id === id) ?? fail(`Choose Cunning Strike effects from: ${options.map((o) => o.name).join(', ')}.`)));
  const m = /^(\d+)d\d+$/.exec(e.features?.sneak ?? '');
  (m && !atk.spell && (atk.finesse || atk.type === 'ranged')) || fail('Cunning Strike goes with Sneak Attack, which needs a Finesse or Ranged weapon.');
  !s.encounter.flags[`sneak:${e.id}`] || fail(`${e.name} has already dealt Sneak Attack this turn.`);
  const cost = chosen.reduce((n, o) => n + o.cost, 0);
  // At least one die must be left to roll: an effect is added "when you deal Sneak Attack damage".
  cost < +m[1] || fail(`Those effects cost ${cost} Sneak Attack dice; ${e.name}'s Sneak Attack is ${e.features.sneak}, and at least one die must be left to deal Sneak Attack damage.`);
  for (const o of chosen) {
    if (o.needs) e.gear?.some((g) => slug(g) === o.needs) || fail(`${o.name} needs ${o.needs === 'poisoners-kit' ? "a Poisoner's Kit" : o.needs} on ${e.name}'s person.`);
    if (o.size) SIZES.indexOf(t.size ?? 'medium') <= SIZES.indexOf(o.size) || fail(`${o.name} works on a creature of ${o.size[0].toUpperCase() + o.size.slice(1)} size or smaller.`);
    if (o.keepHidden) e.hiding || fail(`${o.name} is for an attack made while hidden.`);
  }
  return chosen;
}

// Superior Hunter's Prey (`markSpread: { spell, range }`): `a.prey` names another creature, seen and within
// `range` feet of the target, that takes the mark's extra damage too if this attack damages the target.
// The target must be marked by this creature's `spell` now (a modifier it put on its caster against the
// target), once a turn. Returns { o, f, mod } or refuses.
function preyFor(s, e, t, id) {
  const f = (e.feats ?? []).find((x) => x.markSpread) || fail(`${e.name} can't spread a mark's damage.`);
  const sp = f.markSpread.spell;
  const part = effectsOf(s).filter((fx) => fx.source === e.id && fx.spell === sp).flatMap((fx) => fx.parts).find((p) => !p.ended && p.target === e.id && p.against === t.id && p.modifier?.on === 'damage.dealt');
  part || fail(`${f.name} works on a creature ${e.name} has marked; ${t.name} is not.`);
  !s.encounter.flags[`prey:${e.id}`] || fail(`${e.name} has already used ${f.name} this turn.`);
  const o = typeof id === 'string' ? s.entities[id] : null;
  (o && !o.dead && o.id !== t.id && o.id !== e.id && !unknown(s, o)) || fail(`Name another creature for ${f.name}.`);
  canSee(s, e, o) !== 'no' || fail(`${e.name} can't see ${o.name}.`);
  apart(s, t, o) * FT <= f.markSpread.range || fail(`${o.name} is more than ${f.markSpread.range} ft from ${t.name}.`);
  inFight(s, o.id) || fail(`${o.name} is outside the battle.`);
  return { o, f, mod: part.modifier };
}

export const handlers = {

  // { type: 'attack', actor, target, attack }. A creature with actions (made from a pack
  // monster) attacks with the action of that id; others with their flat attack records.
  attack(s, a, ctx, ev) {
    const e = ent(s, a.actor), t = ent(s, a.target); control(e, ctx);
    const def = e.actions?.find((x) => x.id === a.attack && !x.multiattack);
    if (def) {
      (a.brutal === undefined && a.cunning === undefined && a.prey === undefined) || fail(`Brutal Strike, Cunning Strike and Superior Hunter's Prey go with a weapon or an Unarmed Strike.`);
      up(e) || fail(`${e.name} is down.`);
      able(e);
      return takeAction(s, e, def, { target: a.target }, ev);
    }
    const atk = e.attacks.find((x) => x.id === a.attack) || fail('Unknown attack.');
    up(e) || fail(`${e.name} is down.`);
    able(e);
    !t.dead || fail(`${t.name} is already dead.`);
    e.id !== t.id || fail("A creature can't attack itself.");
    checkRange(s, e, t, atk);
    walled(s, e, t);
    showPlace(s, e, ev); showPlace(s, t, ev);
    if (!s.encounter) return engage(s, e, t, ev);                 // roll initiative first
    const b = s.encounter.budget;
    // Attacks a feature gave this turn (Flurry of Blows) come first; then a Bonus Action attack
    // (the Monk's Unarmed Strike); then those Extra Attack left; then the Attack action.
    const flurry = b.bonusAttacks?.with === atk.id && b.bonusAttacks.left > 0, bonusTime = !flurry && atk.time === 'bonus';
    const pooled = !flurry && !bonusTime && fromPool(b, atk.id);
    need(s, e, flurry || pooled ? null : bonusTime ? 'bonus' : 'action');
    inFight(s, t.id) || fail(`${t.name} is outside the battle.`);
    const brutal = a.brutal === undefined ? null : brutalFor(s, e, t, atk, a.brutal);
    const cunning = a.cunning === undefined ? null : cunningFor(s, e, t, atk, a.cunning);
    const prey = a.prey === undefined ? null : preyFor(s, e, t, a.prey);
    if (flurry) { if (--b.bonusAttacks.left <= 0) delete b.bonusAttacks; }
    else if (bonusTime) b.bonus--;
    else if (pooled) fromPool(b, atk.id, true);
    else {
      b.action--;
      // Extra Attack: the Attack action makes more than one attack. The rest wait in the budget.
      if (e.features.extraAttack) b.attacks = [[{ action: null, left: e.features.extraAttack }]];
    }
    if (brutal) s.encounter.flags[`brutal:${e.id}`] = true;
    const from = ev.length;
    resolveAttack(s, e, t, atk, ev, {}, { brutal, cunning });
    // Superior Hunter's Prey: when the attack damaged the marked target, the mark's extra damage to the other one.
    if (prey && ev.slice(from).some((x) => x.type === 'damage' && x.target === t.id && x.amount > 0) && !prey.o.dead) {
      s.encounter.flags[`prey:${e.id}`] = true;
      const r = roll(s, prey.mod.value), type = prey.mod.types?.[0] ?? 'force';
      ev.push({ type: 'note', id: e.id, text: `${prey.f.name}: ${prey.mod.value} ${type} to ${prey.o.name}` });
      damage(s, prey.o, [{ amount: r.total, type, dice: r.dice, bonus: r.bonus, by: e.id }], null, ev);
    }
    checkEnd(s, ev);
  },

  // { type: 'act', actor, action, target? | hex? }: a creature uses one of its actions (a
  // monster's Bite, Fire Breath or Multiattack). Its effect steps run like a spell's.
  act(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    const def = e.actions?.find((x) => x.id === a.action) || fail(`${e.name} has no such action.`);
    up(e) || fail(`${e.name} is down.`);
    able(e);
    if (!def.multiattack) return takeAction(s, e, def, a, ev);
    // Multiattack spends the action and leaves the attacks it gives in the budget, to be made
    // one at a time, each at a target chosen when it is made. What is not made by the end of
    // the turn is lost.
    s.encounter || fail(`${def.name} is for a fight. Make one of ${e.name}'s attacks to start one.`);
    need(s, e, 'action');
    const b = s.encounter.budget;
    b.action--;
    b.attacks = (Array.isArray(def.multiattack) ? [def.multiattack] : def.multiattack.or).map((list) => list.map((x) => ({ action: structuredClone(x.action), left: x.times })));
    ev.push({ type: 'std', id: e.id, action: def.name });
  },
  dodge(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    s.encounter || fail('Dodge only matters in a fight.');
    need(s, e, 'action');
    s.encounter.budget.action--; e.cond.dodging = {};
    ev.push({ type: 'std', id: e.id, action: 'Dodge' });
  },
  // { type: 'reactions', actor, set: { [reaction id]: when } }: standing instructions for a
  // creature's reactions (reactions.js), set by whoever controls it at any time, even off its turn.
  // Private to its controller and the DM: the event is the DM's alone (view.js).
  reactions(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    const bad = checkInstructions(e, a.set);
    if (bad) fail(bad);
    const mine = reactionsOf(e), out = { ...(e.reactions ?? {}) };
    for (const [k, w] of Object.entries(a.set)) { if (w === mine.find((r) => r.id === k).dflt) delete out[k]; else out[k] = w; }
    if (Object.keys(out).length) e.reactions = out; else delete e.reactions;
    ev.push({ type: 'reactionsSet', id: e.id, set: { ...a.set } });
  },
  endTurn(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    (s.encounter && current(s) === e.id) || fail(`It isn't ${e.name}'s turn.`);
    // Self-Restoration (`selfCure`): its player picks which of the conditions it has ends (`cure`).
    // With only one there is nothing to pick; with several and no pick, the DM is told.
    const sc = (e.feats ?? []).find((f) => f.selfCure), can = sc ? sc.selfCure.conditions.filter((c) => e.cond[c]) : [];
    if (a.cure !== undefined) {
      sc || fail(`${e.name} has nothing that ends a condition at the end of its turn.`);
      (typeof a.cure === 'string' && can.includes(a.cure)) || fail(can.length ? `${sc.name} can end ${can.map(conditionName).join(' or ')} on ${e.name} now.` : `${e.name} has none of the conditions ${sc.name} ends.`);
    }
    if (finishTurn(s, e, ev, a.cure)) advanceTurn(s, ev);
  },
};

