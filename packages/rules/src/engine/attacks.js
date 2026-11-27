// Attacks and a creature's turn (engine.js): attack, act (a monster's actions), dodge, reaction
// instructions, endTurn; and the attacks a turn allows (Multiattack, Extra Attack).
import { actionProfile, loadOf, stepKind, walk, WORK } from '../effects.js';
import { effectsOf, startEffect } from '../durations.js';
import { apart, FT } from '../space.js';
import { checkHitChoices } from '../hitchoices.js';
import { canReact, checkInstructions, instruction, reactionsOf, underEffect } from '../reactions.js';
import { able, ask, control, current, ent, fail, featOf, ft, hostile, inFight, need, steering, tellDM, unblocked, up, walled } from './shared.js';
import { grantOf, rollMode, withGrant } from './rolls.js';
import { aimAction, holdsOf, shellRefusal, showPlace } from './world.js';
import { SIZES } from '../content/schema.js';
import { CONTENT, SPELLS } from '../content/index.js';
import { attackRefusal, freshAction, handsFull, isLoading, isUnarmed, steadiest } from '../weapons.js';
import { canSee } from '../sight.js';
import { conditionName, speedOf } from '../modifiers.js';
import { advanceTurn, checkEnd, confusedFoe, confusedOnly, damage, engage, findFor, finishTurn, heavyWeak, hitNamed, mountAct, resolveAttack, runAction, seesFor, sensesFor, startEncounter, strikeOption, strikesFirst, strikeStart, thenFight, unfind } from './resolve.js';
import { unknown } from '../vision.js';
import { roll } from '../rng.js';
import { handlers as featureHandlers } from './features.js';
import { isWeapon, weaponKey } from '../imbue.js';

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

// The part an action holds with (docs/specs/grapple-shove.md, Decision 7; SRD "Grappling", One Grapple per Hand): its Grappled step's `holds`
// creatures at most (1 if left out). While it holds that many, it can't be used on another creature until one is let go or escapes.
// Why `def` can't be used on `targets` ('' if it can); the monster AI asks this too, so it never picks an action the engine would refuse.
export function partRefusal(s, e, def, targets) {
  let n = 0;
  walk(def.effects, (st) => { if (st?.condition === 'grappled' && st.escape !== undefined) n = Math.max(n, st.holds ?? 1); });
  if (!n || !targets) return '';
  const mine = holdsOf(s, e).filter((x) => x.hold.with === def.id);
  if (mine.length < n) return '';
  const other = targets.find((t) => !mine.some((x) => x.t.id === t.id));
  return other ? `${e.name}'s ${def.name} holds ${mine.map((x) => x.t.name).join(', ')}; it can't be used on ${other.name} until ${mine.length === 1 ? 'it lets go' : 'one is let go'}.` : '';
}
function partFull(s, e, def, targets) {
  const why = partRefusal(s, e, def, targets);
  if (why) fail(why);
}

// Addition I (docs/specs/homebrew-subclasses.md, `reaction: { on: 'attacks', of, attack: 'melee' }`): `e` is about to make an attack (the action and the attack are paid for, the roll is not
// made). Each hostile creature in the fight whose feature `of` put a lasting effect on `e` (reactions.js, `underEffect`) may use its Reaction for one melee weapon attack against it first: it
// must be up and able to react, sense `e` (a creature its side does not know is there is never asked and never reacts), have `e` within the reach of a melee weapon attack of its own that is not
// an Unarmed Strike or a spell, with no wall between, and have its instruction not `never`. `ask` asks its player (the same waiting as every reaction), or tells the DM for the DM's creature.
// Nothing is changed by a reaction that is not offered, declined or answered `never`. Returns whether `e` can still make the attack (a reaction attack that drops it ends it).
function reactToAttacker(s, e, ev) {
  if (!s.encounter || e.object || !up(e) || !inFight(s, e.id)) return true;
  for (const t of Object.values(s.entities)) {
    if (t.id === e.id || t.object || t.actions || t.melded || !hostile(t, e) || !canReact(t) || !inFight(s, t.id)) continue;      // a creature merged with stone reacts to nothing
    for (const r of reactionsOf(t)) {
      if (r.kind !== 'feature' || r.on !== 'attacks' || !underEffect(s, t, r.reaction.of, e)) continue;
      const w = instruction(t, r, s);
      if (w === 'never') continue;
      const d = apart(s, t, e) * FT;
      const atk = steadiest(t, (t.attacks ?? []).filter((a) => a.type === 'melee' && !a.spell && !isUnarmed(a) && !handsFull(s, t, a) && d <= (a.reach ?? 5)), s);
      if (!atk || !unblocked(s, t, e) || !sensesFor(s, t, e)) continue;
      if (w === 'ask') {
        // An attacker the party is not told of is not named in the question.
        const a = ask(s, t, { trigger: 'attacks', ...(seesFor(s, t, e) ? { by: e.id } : {}) }, [{ reaction: r.id, name: r.name }]);
        if (a === null) { tellDM(t, r, `${e.name} is about to attack.`, ev); continue; }
        if (a.take !== r.id) continue;
      }
      const found = findFor(s, t, e, ev);                              // taken against a creature its senses found: the party is told first
      if (found) unfind(s, found);
      t.reactionUsed = true;
      ev.push({ type: 'reaction', id: t.id, reaction: r.id, name: r.name, trigger: 'attacks', against: e.id });
      resolveAttack(s, t, e, atk, ev, { reaction: r.id });
      if (!up(e)) return false;
      break;                                                           // one Reaction a round
    }
  }
  return true;
}

// Use an action: aim it, pay for it, run it. In a fight it costs the creature's action (or its
// Bonus Action, for one with `time: 'bonus'`), unless it is one of the attacks a Multiattack
// left this turn, which it spends instead.
function takeAction(s, e, def, a, ev, ctx = null) {
  const why = actionSpent(e, def);
  if (why) fail(why);
  const { targets, hexes, origin } = aimAction(s, e, def, a, false, ctx);
  partFull(s, e, def, def.target.creature ? targets : null);
  const p = actionProfile(def);
  // Outside a fight a harmful action at others starts the fight and is not taken (the SRD's way): it is taken on the
  // creature's turn. With the table rule `strikeFirst` at 'all', one at a creature of another side lands first, then the
  // fight starts (resolve.js, strikesFirst and thenFight; E23 as amended by #585).
  let lands = null;
  if (!s.encounter && p.harmful && targets !== null && !def.target.self) {
    // Where the actor and its target stand is shown first, either way (review of #594, M2): so a creature in a place
    // the party has not seen is in the fight it starts. These reveals come before the act's events (outside what
    // thenFight marks unseen), as with the rule off and for a weapon attack.
    showPlace(s, e, ev);
    if (def.target.creature) showPlace(s, targets[0], ev);
    if (!strikesFirst(s, e, targets, 'act', ctx)) return def.target.area ? startEncounter(s, e.pos, ev) : engage(s, e, targets[0], ev);   // roll initiative first
    lands = strikeStart(s, ev);
  }
  if (s.encounter) {
    const b = s.encounter.budget, time = def.time ?? 'action', pooled = time === 'action' && fromPool(b, def.id);
    need(s, e, pooled ? null : time);
    if (def.target.creature) for (const t of targets) inFight(s, t.id) || fail(`${t.name} is outside the battle.`);
    if (pooled) fromPool(b, def.id, true); else b[time]--;
  }
  if (def.recharge) (e.spent ??= {})[def.id] = true;
  if (def.uses) (e.charges ??= {})[def.id] = (e.charges[def.id] ?? def.uses.n) - 1;
  if (s.encounter && isAttack(def) && !reactToAttacker(s, e, ev)) return checkEnd(s, ev);        // addition I: a creature under an effect of a foe's attacks
  runAction(s, e, def, targets, hexes, origin, ev);
  if (lands) thenFight(s, e, ev, lands, { area: !!def.target.area, target: targets[0] });
  checkEnd(s, ev);
}

// Addition H (docs/specs/homebrew-subclasses.md, `triggers.attackAction`): `e` has just taken the Attack action on its own turn in a fight (the action is spent; called at
// the two places that spend it, below). Each feature of it that states the trigger puts its modifiers on it until the end of the turn, once a turn for the feature (the mark is
// `trig:<feature>:<creature>`, not the `after:` one a feature's own `after:` action uses, so a second Attack action in the turn, Action Surge, adds nothing). What a Speed modifier raises is also added to the
// walking feet left (`budget.move` is set at the turn's start and does not follow Speed), as Instinctive Pounce adds its half. Nothing is read from data that is not
// whole: the gate checks it, and a record that skipped the gate is told to the DM and left alone, before anything changes.
// A modifier that adds, sets or bounds a number carries a finite one (a Speed, only feet; an `add` elsewhere may also be dice such as 1d4); data made by hand may not.
const DICE = /^[+-]?\d+d\d+([+-]\d+)?$/;
const numberOk = (m) => !['add', 'set', 'min', 'max'].includes(m.op) || Number.isFinite(m.value) || (m.op === 'add' && !m.on.startsWith('speed') && typeof m.value === 'string' && DICE.test(m.value));
function attackActionTaken(s, e, ev) {
  const enc = s.encounter;
  if (!enc || current(s) !== e.id || e.object) return;
  for (const f of e.feats ?? []) {
    const t = f.triggers?.attackAction;
    if (!t) continue;
    const mods = Array.isArray(t.modifiers) ? t.modifiers : null;
    if (!mods?.length || mods.length > 5 || !mods.every((m) => m && typeof m === 'object' && !Array.isArray(m) && typeof m.on === 'string' && typeof m.op === 'string' && numberOk(m))) {
      ev.push({ type: 'manual', actor: e.id, name: f.name, partial: true, text: `${e.name} took the Attack action, which ${f.name} follows, but its data is wrong (its modifiers are not a list of modifiers with their numbers in). The DM can apply it.` });
      continue;
    }
    const mark = `trig:${f.id}:${e.id}`;
    if (enc.flags[mark]) continue;
    enc.flags[mark] = true;
    const before = speedOf(s, e);
    const fx = startEffect(s, { name: f.name, spell: null, source: e.id, conc: false, duration: 'special' });
    Object.assign(fx, { bound: true, feature: f.id });
    for (const m of mods) fx.parts.push({ target: e.id, modifier: structuredClone(m), ends: { on: 'turnEnd', who: e.id } });
    ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: e.id, conc: false, lasts: 'until the end of the current turn', targets: [e.id] });
    const gain = speedOf(s, e) - before;
    if (gain > 0 && enc.budget) enc.budget.move += gain;
  }
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
  const m = rollMode(s, e, t, atk), heavy = heavyWeak(e, atk);
  if (heavy) m.dis.push(heavy);
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

// An action that makes an attack roll, or a Multiattack: what a creature that can't attack can't use.
function isAttack(def) {
  if (def.multiattack) return true;
  let hit = false;
  walk(def.effects ?? [], (st) => { if (stepKind(st) === 'attack') hit = true; });
  return hit;
}

// A familiar's attack through its master's feature (docs/specs/companions.md, amendment C9c):
//   { type: 'attack', actor: master, familiar: id, via: feature id, target, attack: the familiar's action id }
// `via` a feature with `forgoAttack` (Pact of the Chain, SRD 16627-16631: "when you take the Attack action, you can forgo one
// of your own attacks to allow your familiar to make one attack of its own with its Reaction"): one attack of the master's
// Attack action is spent (one left this turn, or the action itself, which starts the Attack action), and the familiar's
// Reaction. `via` a feature with `invest.bonusAttack` (Investment of the Chain Master, 16521-16535: "As a Bonus Action, you can
// command the familiar to take the Attack action"): the master's Bonus Action, and the familiar makes one attack at once (the
// Attack action's one attack; a Multiattack is another action). Either way it is the master's turn in a fight, the familiar
// is the master's, made by the feature's spell, up, able to act, in the fight, and the attack is one of its actions that makes
// an attack roll, aimed as any is. A familiar "can't attack" (`noAttack`) save in these two ways. Everything is checked first.
function familiarAttack(s, a, ctx, ev) {
  const m = ent(s, a.actor);
  // The familiar named, as `dismiss` names one: to a player a creature the party does not know of is no creature at all.
  typeof a.familiar === 'string' || fail('Name the familiar ({ familiar }).');
  const f = Object.hasOwn(s.entities, a.familiar) ? s.entities[a.familiar] : null;
  // One in its master's pocket dimension is said so to the DM, and to players for the party's own (whose pocket they are sent).
  const pocketed = !f && m.pocket && typeof m.pocket === 'object' && Object.hasOwn(m.pocket, a.familiar);
  if (pocketed && (ctx.role === 'dm' || m.side === 'party')) fail('That familiar is in its pocket dimension.');
  (f && (ctx.role === 'dm' || !unknown(s, f))) || fail('No such creature.');
  control(s, m, ctx);
  const via = typeof a.via === 'string' ? featOf(m, a.via) : null;
  const forgo = via?.forgoAttack ?? null, quick = via?.invest?.bonusAttack ? via.invest : null;
  (forgo || quick) || fail(`Say which feature of ${m.name}'s lets the familiar attack (\`via\`).`);
  f.bond?.to === m.id || fail(`${f.name} is not bonded to ${m.name}.`);
  const spell = (forgo ?? quick).spell;
  (f.bond.kind === 'familiar' && f.bond.source === spell) || fail(`${f.name} is bonded to ${m.name}, but is not a familiar from ${SPELLS[spell]?.name ?? spell}, which ${via.name} needs.`);
  (a.brutal === undefined && a.cunning === undefined && a.prey === undefined && a.onHit === undefined) || fail(`Brutal Strike, Cunning Strike, Superior Hunter's Prey and choices after a hit are not for a familiar's attack.`);
  noStrikeFields(a);                                                // its attacks are a pack monster's actions
  s.encounter || fail(`${via.name} works in a fight. Start one first.`);
  need(s, m, quick ? 'bonus' : null);
  up(f) || fail(`${f.name} is down.`);
  able(f);
  inFight(s, f.id) || fail(`${f.name} is outside the battle.`);
  if (forgo) canReact(f) || fail(`${f.name} has already used its Reaction.`);
  const def = f.actions?.find((x) => x.id === a.attack && !x.multiattack && isAttack(x)) || fail(`${f.name} has no such attack.`);
  const why = actionSpent(f, def);
  if (why) fail(why);
  const b = s.encounter.budget, pooled = !!forgo && fromPool(b, null);
  if (forgo && !pooled) b.action >= 1 || fail(`${m.name} has no attack of the Attack action left to give up.`);
  const { targets } = aimAction(s, f, def, { target: a.target }, false, ctx);
  for (const t of targets) inFight(s, t.id) || fail(`${t.name} is outside the battle.`);
  if (quick) b.bonus--;
  else if (pooled) fromPool(b, null, true);
  else {
    b.action--;
    if (b.loaded) { b.loaded = b.loaded.filter((k) => !k.startsWith('action:')); if (!b.loaded.length) delete b.loaded; }      // a new action loads afresh
    if (m.features?.extraAttack) b.attacks = [[{ action: null, left: m.features.extraAttack }]];      // the Attack action's other attacks
    attackActionTaken(s, m, ev);
  }
  if (forgo) {
    f.reactionUsed = true;
    ev.push({ type: 'reaction', id: f.id, reaction: 'familiar-attack', name: 'Attack with its Reaction', trigger: 'forgo' });
  }
  // Said by name for the party's own; a foe's bond is not told (Decision 10), and its attack shows for itself.
  if (m.side === 'party') ev.push({ type: 'note', id: m.id, text: forgo ? `${via.name}: ${m.name} gives up an attack, and ${f.name} attacks with its Reaction` : `${via.name}: ${m.name} commands ${f.name} to take the Attack action` });
  if (def.recharge) (f.spent ??= {})[def.id] = true;
  if (def.uses) (f.charges ??= {})[def.id] = (f.charges[def.id] ?? def.uses.n) - 1;
  runAction(s, f, def, targets, null, null, ev);
  checkEnd(s, ev);
}

// Fields only the Unarmed Strike reads: a pack monster's action has none of them (its stat block says how it grapples).
// `use: <feature id>` on an attack (docs/specs/on-hit.md, Decision 8): a feature whose action has `withAttack` (Sacred Weapon), used when its creature takes the
// Attack action, on the attack that takes it: in a fight, a weapon's own attack (not an Unarmed Strike or a pooled, Bonus Action or Flurry attack), the Damage
// option. The feature's own price and the weapon's fit are checked when it is used (a refusal then puts the whole attack back). Returns the feature's id.
function useWithAttack(s, e, a, atk, option, flurry, bonusTime, pooled) {
  const f = typeof a.use === 'string' ? featOf(e, a.use) : null;
  (f?.action?.withAttack) || fail(`${e.name} has no feature that is used with the Attack action by that name.`);
  isWeapon(atk) || fail(`${f.name} changes a weapon: attack with a weapon.`);
  option === 'damage' || fail(`${f.name} goes with a weapon attack that does damage.`);
  !(flurry || bonusTime || pooled) || fail(`${f.name} is used when ${e.name} takes the Attack action: it goes with the attack that takes the action, not a later one, a Bonus Action one or a Flurry of Blows one.`);
  const melee = (f.action.effects ?? []).find((st) => st.imbue)?.imbue;
  if (melee?.melee && CONTENT.weapons[atk.weapon]?.kind !== 'melee') fail(`${f.name} changes a Melee weapon; ${atk.name} is not one.`);
  return f.id;
}

function noStrikeFields(a) {
  ((a.option ?? 'damage') === 'damage' && a.shove === undefined && !a.grab) || fail('Grapple and Shove are options of the Unarmed Strike, and Punch and Grab goes with it.');
}

// The option an Unarmed Strike is used for (SRD "Unarmed Strike": Damage, Grapple or Shove; docs/specs/grapple-shove.md, Decision 1).
// Checked before anything is spent or started. Returns 'damage', 'grapple' or 'shove'. Punch and Grab (`grab`, the Grappler feat)
// is checked here as far as it can be outside a fight; what needs the fight's budget (its own turn, the Attack action, once a turn)
// is checked when the attack is spent (grabFor).
const OPTIONS = ['damage', 'grapple', 'shove'];
function optionOf(s, e, t, atk, a) {
  const o = a.option ?? 'damage';
  (typeof o === 'string' && OPTIONS.includes(o)) || fail('Choose an option for the Unarmed Strike: damage, grapple or shove.');
  (o === 'damage' || isUnarmed(atk)) || fail('Grapple and Shove are options of the Unarmed Strike.');
  (o === 'damage' || (a.brutal === undefined && a.cunning === undefined && a.prey === undefined)) || fail(`Brutal Strike, Cunning Strike and Superior Hunter's Prey need a hit, so they go with the Damage option.`);
  (o === 'shove' ? a.shove !== undefined : a.shove === undefined) || fail(o === 'shove' ? 'Choose what the Shove does: push the target 5 feet away, or knock it Prone.' : 'A Shove option goes with the Shove.');
  if (a.grab !== undefined) {
    a.grab === true || fail('Punch and Grab is `grab: true`.');
    o === 'damage' || fail('Punch and Grab goes with the Damage option: on a hit, the target is grappled as well.');
    isUnarmed(atk) || fail('Punch and Grab goes with an Unarmed Strike.');
    (e.feats ?? []).some((f) => f.id === 'feat-grappler') || fail(`${e.name} doesn't have the Grappler feat, which Punch and Grab comes from.`);
  }
  if (o === 'shove') (a.shove === 'push' || a.shove === 'prone') || fail('A Shove pushes the target ("push") or knocks it Prone ("prone").');
  if (o !== 'damage' || a.grab) {
    const what = o === 'shove' ? 'shove' : 'grapple';
    SIZES.indexOf(t.size ?? 'medium') <= SIZES.indexOf(e.size ?? 'medium') + 1 || fail(`${e.name} can ${what} a creature no more than one size larger than itself; ${t.name} is ${t.size ?? 'medium'}.`);
  }
  if (o === 'grapple' || a.grab) {
    !(t.cond.grappled?.holds ?? []).some((h) => h.by === e.id) || fail(`${e.name} is already grappling ${t.name}.`);
    const hands = handsFull(s, e, atk, true);
    if (hands) fail(hands);
  }
  return o;
}
// Punch and Grab in a fight (SRD Grappler: "When you hit a creature with an Unarmed Strike as part of the Attack action on your
// turn ... only once per turn"): on its own turn, from the Attack action or the attacks it left, not used yet this turn.
function grabFor(s, e, pooled, flurry, bonusTime) {
  current(s) === e.id || fail('Punch and Grab is used on your own turn.');
  !(flurry || bonusTime) || fail('Punch and Grab goes with an Unarmed Strike of the Attack action, not a Bonus Action one.');
  !s.encounter.flags[`grab:${e.id}`] || fail('Punch and Grab is used once a turn, and it has been used this turn.');
  return true;
}

const base = {

  // { type: 'attack', actor, target, attack }. A creature with actions (made from a pack
  // monster) attacks with the action of that id; others with their flat attack records.
  // With `familiar` and `via`: the master's familiar attacks (familiarAttack, above).
  attack(s, a, ctx, ev) {
    if (a.familiar !== undefined) return familiarAttack(s, a, ctx, ev);
    const e = ent(s, a.actor), t = ent(s, a.target); control(s, e, ctx);
    !e.bond?.noAttack || fail(`${e.name} can't attack.`);          // a familiar (docs/specs/companions.md, Decision 1)
    const foe = confusedFoe(s, e);                                    // Confusion (resolve.js `confusedOn`): on this turn its one attack is at the creature the dice chose
    foe === null || foe === t.id || fail(`${e.name} is Confused: its attack this turn is at ${s.entities[foe]?.name ?? 'the creature the dice chose'}.`);
    const def = e.actions?.find((x) => x.id === a.attack && !x.multiattack);
    if (def) {
      noStrikeFields(a);
      a.use === undefined || fail('A feature used with the Attack action goes with a weapon attack.');
      a.onHit === undefined || fail('A choice after a hit goes with a weapon or an Unarmed Strike attack.');
      (a.brutal === undefined && a.cunning === undefined && a.prey === undefined) || fail(`Brutal Strike, Cunning Strike and Superior Hunter's Prey go with a weapon or an Unarmed Strike.`);
      up(e) || fail(`${e.name} is down.`);
      able(e);
      return takeAction(s, e, def, { target: a.target }, ev, ctx);
    }
    const atk = e.attacks.find((x) => x.id === a.attack) || fail('Unknown attack.');
    up(e) || fail(`${e.name} is down.`);
    able(e);
    const early = attackRefusal(s, e, atk);                          // hands, before a fight is started by it
    if (early) fail(early);
    !t.dead || fail(`${t.name} is already dead.`);
    e.id !== t.id || fail("A creature can't attack itself.");
    checkRange(s, e, t, atk);
    walled(s, e, t);
    if (atk.type === 'melee') { const why = shellRefusal(s, e, t, atk.reach); if (why) fail(why); }          // Antilife Shell: no reaching through it
    const option = optionOf(s, e, t, atk, a);
    a.use === undefined || s.encounter || fail('A feature used with the Attack action is used on a turn in a fight.');
    a.onHit === undefined || (s.encounter && option === 'damage') || fail('A choice named for a hit goes with a damaging attack on a turn in a fight.');
    // Outside a fight the attack starts the fight and is not made (the SRD's way): it is made on the attacker's turn. With
    // the table rule `strikeFirst` at 'all', an attack at a creature of another side is made first, a plain one (what needs a
    // turn in a fight is refused before anything changes), then the fight starts (resolve.js, thenFight; #585).
    const first = !s.encounter && strikesFirst(s, e, [t], 'attack', ctx);
    if (first) (a.brutal === undefined && a.cunning === undefined && a.prey === undefined && !a.grab) || fail('Brutal Strike, Cunning Strike, Superior Hunter\'s Prey and Punch and Grab go with an attack on a turn in a fight. An attack made before the fight starts is a plain one.');
    showPlace(s, e, ev); showPlace(s, t, ev);
    if (!s.encounter && !first) return engage(s, e, t, ev);       // roll initiative first
    if (first) {
      const lands = strikeStart(s, ev);
      if (option !== 'damage') strikeOption(s, e, t, atk, option, a.shove, ev);
      else resolveAttack(s, e, t, atk, ev);
      thenFight(s, e, ev, lands, { target: t });
      return checkEnd(s, ev);
    }
    const b = s.encounter.budget;
    // Attacks a feature gave this turn (Flurry of Blows) come first; then a Bonus Action attack
    // (the Monk's Unarmed Strike); then those Extra Attack left; then the Attack action.
    const flurry = b.bonusAttacks?.with === atk.id && b.bonusAttacks.left > 0, bonusTime = !flurry && atk.time === 'bonus';
    let pooled = !flurry && !bonusTime && fromPool(b, atk.id);
    const refusal = attackRefusal(s, e, atk, pooled);
    if (refusal) fail(refusal);
    // A Loading weapon already fired this action, with the Attack action's other attacks left and another action to use (Action Surge):
    // the shot is the new action's, and what is left of the old action's attacks goes on beside the new one's.
    const surged = pooled && isLoading(atk) && b.loaded?.includes(`action:${atk.id}`) && freshAction(b);
    if (surged) pooled = false;
    const slot = flurry || bonusTime ? 'bonus' : 'action';
    need(s, e, flurry || pooled ? null : bonusTime ? 'bonus' : 'action');
    inFight(s, t.id) || fail(`${t.name} is outside the battle.`);
    const using = a.use === undefined ? null : useWithAttack(s, e, a, atk, option, flurry, bonusTime, pooled);
    const named = hitNamed(s, e, atk, a.onHit, bonusTime ? 1 : 0);      // what to do if it hits (on-hit.md, Decision 1): checked before anything is spent
    const brutal = a.brutal === undefined ? null : brutalFor(s, e, t, atk, a.brutal);
    const cunning = a.cunning === undefined ? null : cunningFor(s, e, t, atk, a.cunning);
    const prey = a.prey === undefined ? null : preyFor(s, e, t, a.prey);
    const grab = !!a.grab && grabFor(s, e, pooled, flurry, bonusTime);
    if (flurry) { if (--b.bonusAttacks.left <= 0) delete b.bonusAttacks; }
    else if (bonusTime) b.bonus--;
    else if (pooled) fromPool(b, atk.id, true);
    else {
      b.action--;
      if (b.loaded) { b.loaded = b.loaded.filter((k) => !k.startsWith('action:')); if (!b.loaded.length) delete b.loaded; }      // a new action loads afresh
      // Extra Attack: the Attack action makes more than one attack. The rest wait in the budget.
      if (e.features.extraAttack) b.attacks = [[{ action: null, left: e.features.extraAttack + (surged ? b.attacks[0][0].left : 0) }]];
      attackActionTaken(s, e, ev);
    }
    // Sacred Weapon and the like: "When you take the Attack action", paid and imbued before the roll, so this first attack has it.
    if (using) { featureHandlers.feature(s, { type: 'feature', actor: e.id, feature: using }, ctx, ev, { withAttack: true, weapon: weaponKey(atk) }); }
    if (isLoading(atk)) (b.loaded ??= []).push(`${slot}:${atk.id}`);
    if (brutal) s.encounter.flags[`brutal:${e.id}`] = true;
    if (option === 'damage' && !reactToAttacker(s, e, ev)) return checkEnd(s, ev);              // addition I: a creature under an effect of a foe's attacks
    const from = ev.length;
    if (option !== 'damage') strikeOption(s, e, t, atk, option, a.shove, ev);
    else {
      resolveAttack(s, e, t, atk, ev, {}, { brutal, cunning, onHit: named });
      // Punch and Grab: the Grapple option too, only if the Damage hit, and only then is it used for the turn.
      const last = ev.slice(from).findLast((x) => x.type === 'attack' && x.actor === e.id && x.target === t.id);
      if (grab && last?.hit) {
        s.encounter.flags[`grab:${e.id}`] = true;
        if (up(t) && up(e)) strikeOption(s, e, t, atk, 'grapple', undefined, ev);
        else ev.push({ type: 'note', id: t.id, text: `Punch and Grab: ${t.name} is down, so there is no grapple` });
      }
    }
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
    const e = ent(s, a.actor); control(s, e, ctx);
    const def = e.actions?.find((x) => x.id === a.action) || fail(`${e.name} has no such action.`);
    { const foe = confusedFoe(s, e); if (s.encounter?.flags?.[`confused:${e.id}`] && current(s) === e.id && !(foe !== null && foe === a.target && isAttack(def))) confusedOnly(s, e, 'take that action'); }
    noStrikeFields(a);
    !e.bond?.noAttack || !isAttack(def) || fail(`${e.name} can't attack.`);
    up(e) || fail(`${e.name} is down.`);
    able(e);
    if (!def.multiattack) return takeAction(s, e, def, a, ev, ctx);
    // Multiattack spends the action and leaves the attacks it gives in the budget, to be made
    // one at a time, each at a target chosen when it is made. What is not made by the end of
    // the turn is lost.
    s.encounter || fail(`${def.name} is for a fight. Make one of ${e.name}'s attacks to start one.`);
    // The most attacks one Multiattack may give (effects.js, WORK): more is refused before anything is spent. The SRD's largest is 7.
    for (const list of Array.isArray(def.multiattack) ? [def.multiattack] : def.multiattack.or) {
      const n = list.reduce((sum, x) => sum + (Number(x.times) || 0), 0);
      n <= WORK.attacks || fail(`${def.name} would make ${n.toLocaleString('en-US')} attacks; the engine allows at most ${WORK.attacks} from one Multiattack.`);
    }
    // A Multiattack whose attack could never be made (it alone is over the ceiling) is refused as a whole, before the action is
    // spent, not attack by attack.
    for (const list of Array.isArray(def.multiattack) ? [def.multiattack] : def.multiattack.or) for (const x of list) for (const id of Array.isArray(x.action) ? x.action : [x.action]) {
      const part = e.actions.find((y) => y.id === id && !y.multiattack);
      if (!part) continue;
      const load = loadOf(part.effects);
      load.dice <= WORK.dice || fail(`${def.name} is made of ${part.name}, which rolls ${load.dice.toLocaleString('en-US')} dice in one attack; the engine allows at most ${WORK.dice.toLocaleString('en-US')} dice in one action, so the Multiattack is not made and nothing is spent.`);
      load.steps <= WORK.steps || fail(`${def.name} is made of ${part.name}, which runs ${load.steps.toLocaleString('en-US')} steps in one attack; the engine allows at most ${WORK.steps.toLocaleString('en-US')}, so the Multiattack is not made and nothing is spent.`);
    }
    need(s, e, 'action');
    const b = s.encounter.budget;
    b.action--;
    b.attacks = (Array.isArray(def.multiattack) ? [def.multiattack] : def.multiattack.or).map((list) => list.map((x) => ({ action: structuredClone(x.action), left: x.times })));
    ev.push({ type: 'std', id: e.id, action: def.name });
  },
  dodge(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(s, e, ctx);
    confusedOnly(s, e, 'Dodge');
    s.encounter || fail('Dodge only matters in a fight.');
    if (steering(s, e)) return mountAct(s, e, a, 'Dodge', ev);          // a controlled mount: from its own action, on its rider's turn (C6a)
    need(s, e, 'action');
    s.encounter.budget.action--; e.cond.dodging = {};
    ev.push({ type: 'std', id: e.id, action: 'Dodge' });
  },
  // { type: 'reactions', actor, set: { [reaction id]: when } }: standing instructions for a
  // creature's reactions (reactions.js), set by whoever controls it at any time, even off its turn.
  // Private to its controller and the DM: the event is the DM's alone (view.js).
  reactions(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(s, e, ctx);
    const bad = checkInstructions(e, a.set);
    if (bad) fail(bad);
    const mine = reactionsOf(e), out = { ...(e.reactions ?? {}) };
    // A reaction whose default depends on who runs the creature (`dfltPlayer`) keeps what was set, whatever it is, so that a claim or a
    // release does not turn a choice into the other default.
    for (const [k, w] of Object.entries(a.set)) { const r = mine.find((x) => x.id === k); if (w === r.dflt && !r.dfltPlayer) delete out[k]; else out[k] = w; }
    if (Object.keys(out).length) e.reactions = out; else delete e.reactions;
    ev.push({ type: 'reactionsSet', id: e.id, set: { ...a.set } });
  },
  // { type: 'hitChoices', actor, set: { [choice id]: when } }: standing instructions for what a creature may do after its attack hits (hitchoices.js; docs/specs/on-hit.md,
  // Decision 5): ask, crit, always or never. Set by whoever controls it at any time. Private to its controller and the DM (view.js).
  hitChoices(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(s, e, ctx);
    const bad = checkHitChoices(e, a.set);
    if (bad) fail(bad);
    const out = { ...(e.hitChoices ?? {}) };
    for (const [k, w] of Object.entries(a.set)) out[k] = w;      // kept whatever it is, so a claim or a release does not turn a choice into the other default
    if (Object.keys(out).length) e.hitChoices = out; else delete e.hitChoices;
    ev.push({ type: 'hitChoicesSet', id: e.id, set: { ...a.set } });
  },
  endTurn(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(s, e, ctx);
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

// `attack` and `act` take the DM's `adv` ('advantage' | 'disadvantage'): a source of Advantage or Disadvantage on the attack rolls the actor
// makes in the action, combined with the others by the SRD's rule (rolls.js, withGrant). A player sending it is refused, changing nothing.
const granted = (fn) => (s, a, ctx, ev) => {
  const mode = grantOf(a, ctx);
  if (!mode) return fn(s, a, ctx, ev);
  a.familiar === undefined || fail("A familiar's attack takes no Advantage or Disadvantage from the DM.");
  return withGrant(s, ent(s, a.actor), mode, ev, () => fn(s, a, ctx, ev));
};
export const handlers = { ...base, attack: granted(base.attack), act: granted(base.act) };
