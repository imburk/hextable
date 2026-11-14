// Attacks and a creature's turn (engine.js): attack, act (a monster's actions), dodge, reaction
// instructions, endTurn; and the attacks a turn allows (Multiattack, Extra Attack).
import { actionProfile } from '../effects.js';
import { turnEnded } from '../durations.js';
import { apart, FT } from '../space.js';
import { turnInZones } from '../zones.js';
import { checkInstructions, reactionsOf } from '../reactions.js';
import { able, control, current, ent, fail, ft, inFight, need, up, walled } from './shared.js';
import { aimAction, showPlace } from './world.js';
import { advanceTurn, checkEnd, engage, KIT, resolveAttack, runAction, startEncounter } from './resolve.js';

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

export const handlers = {

  // { type: 'attack', actor, target, attack }. A creature with actions (made from a pack
  // monster) attacks with the action of that id; others with their flat attack records.
  attack(s, a, ctx, ev) {
    const e = ent(s, a.actor), t = ent(s, a.target); control(e, ctx);
    const def = e.actions?.find((x) => x.id === a.attack && !x.multiattack);
    if (def) {
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
    if (flurry) { if (--b.bonusAttacks.left <= 0) delete b.bonusAttacks; }
    else if (bonusTime) b.bonus--;
    else if (pooled) fromPool(b, atk.id, true);
    else {
      b.action--;
      // Extra Attack: the Attack action makes more than one attack. The rest wait in the budget.
      if (e.features.extraAttack) b.attacks = [[{ action: null, left: e.features.extraAttack }]];
    }
    resolveAttack(s, e, t, atk, ev);
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
    delete e.cond.disengaged;
    turnInZones(s, ev, KIT, e, 'turnEnd');                              // a zone it ends its turn in (Moonbeam, Spirit Guardians)
    checkEnd(s, ev);
    if (!s.encounter) return;
    turnEnded(s, ev, e, KIT);
    if (s.encounter) advanceTurn(s, ev);
  },
};

