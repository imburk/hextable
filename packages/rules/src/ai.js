// Monster brain. Returns the next action for a creature on its turn.
// This is the seam for smarter agents: anything that reads state and returns
// an action (a script, an LLM-driven DM, an AI character) plugs in the same way.
//
// It is called again after each action until it ends the turn. It is simple and deterministic:
// the same state always gives the same answer. Whoever calls it ends the turn if the engine
// refuses what it returns, so a refusal can never loop.
import { moveOptions, current, up, hostile, inFight, unblocked, FT, fromPool, actionSpent, areaTargets, hideProblem, ownerOf, awayHow } from './engine.js';
// Not re-exported by engine.js; imported from the module itself, as reactions.js and scenes.js import ownerOf.
import { commandedNow, steering } from './engine/shared.js';
import { actionProfile } from './effects.js';
import { incapacitatedBy } from './modifiers.js';
import { apart, apartAt, ground } from './space.js';
import { hiddenFrom } from './sight.js';
import { unknown } from './vision.js';

// Does this creature know where that one is? Not if it is hiding from it, unless Tremorsense
// pinpoints it: both on the ground and within range (it is still unseen, so attacks at it have Disadvantage).
export function aware(s, e, o) {
  if (!hiddenFrom(o, e)) return true;
  const t = e.senses?.tremorsense ?? 0;
  return t > 0 && apart(s, e, o) * FT <= t && !!ground(s.map, e.pos) && !!ground(s.map, o.pos);
}

export function aiStep(s, id, opts) {
  const e = s.entities[id], end = { type: 'endTurn', actor: id };
  // While an action waits for a player's reaction (reactions.js) nothing else can happen: no move,
  // not even ending the turn. The answer, from the player or the DM, carries the table on.
  if (!e || current(s) !== id || !up(e) || s.pending) return null;
  // A companion (a creature with a `bond`) is played by the companion brain (below). Everything after this line is the
  // monster AI as it was before the brain, for every creature with no bond (companions-brain-replay.test.js).
  if (e.bond) return companionStep(s, id, opts);
  // It does not act on creatures it has not found.
  const foes = Object.values(s.entities).filter((o) => up(o) && hostile(o, e) && inFight(s, o.id) && aware(s, e, o));
  // One whose stat block has Stealth may open the fight by hiding, if it is somewhere it can.
  const b = s.encounter.budget;
  if (s.encounter.round === 1 && !e.hiding && e.skillBonus?.stealth !== undefined && (e.features?.nimbleEscape ? b.bonus > 0 : b.action > 0) && !hideProblem(s, e)) return { type: 'hide', actor: id };
  if (!foes.length) return end;
  return e.actions ? withActions(s, e, foes) : withAttacks(s, e, foes);
}

// Move to the spot that brings it nearest to any foe, if that is nearer than where it stands.
function approach(s, e, foes) {
  const near = (pos) => Math.min(...foes.map((f) => apartAt(s, e, pos, f, f.pos)));       // between the nearest parts of the two, whatever their size
  let best = null;
  for (const [k, v] of moveOptions(s, e)) {
    if (!v.canStop) continue;
    const nd = near(v.h);
    if (!best || nd < best.nd || (nd === best.nd && v.cost < best.cost)) best = { k, nd, cost: v.cost, h: v.h };
  }
  return best && best.nd < near(e.pos) ? { type: 'move', actor: e.id, to: best.h } : null;
}

// A creature that plays from its actions (one made from a pack monster).
// `lim.noAttack`: a companion that can't attack (`bond.noAttack`, companions.md C1) is offered no action with an attack
// roll and no Multiattack (the engine would refuse them). Absent for a monster, so nothing changes for one.
function withActions(s, e, foes, lim = {}) {
  const id = e.id, end = { type: 'endTurn', actor: id }, b = s.encounter.budget;
  // Nearest first, then the most hurt, then by id, so the order never depends on anything else.
  const order = [...foes].sort((x, y) => apart(s, e, x) - apart(s, e, y) || x.hp - y.hp || (x.id < y.id ? -1 : 1));
  const all = e.actions.map((def) => ({ def, p: actionProfile(def) })).filter((x) => x.p.harmful && !actionSpent(e, x.def) && (x.p.time === 'action' || b.bonus > 0) && !(lim.noAttack && rolled(x.p)));
  const reaches = (x, t) => x.p.aim === 'creature' && apart(s, e, t) * FT <= x.p.far && unblocked(s, e, t);
  const act = (x, extra) => ({ type: 'act', actor: id, action: x.def.id, ...extra });
  // The best attack it can make right now among `list`: at the nearest foe it can reach, melee
  // if that reaches, else ranged, else anything aimed at one creature.
  const strike = (list) => {
    for (const t of order) {
      const pick = list.find((x) => x.p.roll === 'melee' && reaches(x, t)) ?? list.find((x) => x.p.roll === 'ranged' && reaches(x, t)) ?? list.find((x) => reaches(x, t));
      if (pick) return act(pick, { target: t.id });
    }
    return null;
  };
  // Where to aim an area so that it catches the most foes and none of its own side (itself included).
  const aim = (x) => {
    let best = null;
    const spots = x.p.area.shape === 'emanation' ? [null] : order.map((t) => t.pos);
    for (const hex of spots) {
      const caught = areaTargets(s, e, x.def, hex);
      if (!caught || caught.some((t) => !hostile(t, e))) continue;
      const n = caught.filter((t) => up(t) && inFight(s, t.id)).length;
      if (n && (!best || n > best.n)) best = { n, extra: hex ? { hex: { q: hex.q, r: hex.r, z: hex.z } } : {} };
    }
    return best;
  };
  const areas = all.filter((x) => x.p.aim === 'area').map((x) => ({ x, at: aim(x) })).filter((z) => z.at).sort((p, q) => q.at.n - p.at.n);
  const meleeIn = (list) => list.some((x) => x.p.roll === 'melee');
  // A creature with a melee attack that reaches nobody yet walks in before it shoots.
  const closeIn = (list) => (meleeIn(list) && b.move >= FT && !order.some((t) => list.some((x) => x.p.roll === 'melee' && reaches(x, t))) ? approach(s, e, foes) : null);

  // In the middle of a Multiattack: make the next attack, moving first if nothing reaches.
  if (b.attacks) {
    const left = all.filter((x) => fromPool(b, x.def.id));
    const mv = closeIn(left);
    if (mv) return mv;
    const hit = strike(left.filter((x) => x.p.aim === 'creature'));
    if (hit) return hit;
    const area = areas.find((z) => left.includes(z.x));
    if (area) return act(area.x, area.at.extra);
    return end;                                      // whatever is left cannot reach anyone: it is lost
  }
  // A Bonus Action (a gaze, a nimbus) when it would catch two or more; then the turn goes on.
  const quick = areas.find((z) => z.x.p.time === 'bonus' && z.at.n >= 2);
  if (quick) return act(quick.x, quick.at.extra);
  if (b.action < 1) return end;
  const main = (list) => list.filter((x) => x.p.time === 'action');

  // A breath weapon or the like, when it would catch two or more.
  const big = areas.find((z) => z.x.p.time === 'action') ?? null;
  if (big?.at.n >= 2) return act(big.x, big.at.extra);
  const weapons = main(all).filter((x) => x.p.aim === 'creature' && (x.p.roll === 'melee' || x.p.roll === 'ranged'));
  const multi = lim.noAttack ? null : e.actions.find((def) => def.multiattack);
  if (multi) {
    const parts = main(all).filter((x) => actionProfile(multi).lists.some((l) => l.some((en) => (Array.isArray(en.action) ? en.action : [en.action]).includes(x.def.id))));
    const mv = closeIn(parts);
    if (mv) return mv;
    if (strike(parts.filter((x) => x.p.aim === 'creature'))) return { type: 'act', actor: id, action: multi.id };
  }
  const mv = closeIn(weapons);
  if (mv) return mv;
  const hit = strike(weapons);
  if (hit) return hit;
  // Nothing else reaches: an area that catches one, or a save aimed at one creature.
  if (big) return act(big.x, big.at.extra);
  const other = strike(main(all).filter((x) => x.p.aim === 'creature'));
  if (other) return other;
  if (meleeIn(weapons) && b.move < FT) return { type: 'dash', actor: id };
  return end;
}

// A creature with flat attack records only (a monster from a game saved without its template).
function withAttacks(s, e, foes) {
  const id = e.id, end = { type: 'endTurn', actor: id }, b = s.encounter.budget;
  const open = (t) => unblocked(s, e, t);                    // no wall or shut door in the way
  const target = foes.reduce((a, f) => (apart(s, e, f) < apart(s, e, a) || (apart(s, e, f) === apart(s, e, a) && f.hp < a.hp) ? f : a));
  const melee = e.attacks.find((a) => a.type === 'melee'), ranged = e.attacks.find((a) => a.type === 'ranged');
  const d = apart(s, e, target);
  const can = b.action > 0 || !!b.attacks;
  if (can && melee && d <= 1 && open(target)) return { type: 'attack', actor: id, target: target.id, attack: melee.id };
  if (melee && d > 1 && b.move >= FT) { const mv = approach(s, e, foes); if (mv) return mv; }
  if (can && ranged && d * FT <= ranged.range[1] && open(target)) return { type: 'attack', actor: id, target: target.id, attack: ranged.id };
  if (b.action > 0 && melee && d > 1 && b.move < FT) return { type: 'dash', actor: id };
  return end;
}

// ---------- the companion brain (docs/specs/companions.md, Decision 9; stage C7) ----------
// What a companion does when nobody steers it. It reads the state and returns an ordinary action, sent by whoever calls
// it (the DM's auto-play) through apply() like any other: it never changes the state. It is deterministic: the same
// state gives the same answer (no dice; ties broken by distance, cost, then the order moveOptions lists places in).
//
// SRD 5.2.1 (reference/srd52/srd52-flow.txt):
//   Animate Dead (24057-24062), Create Undead (25686-25690): "If you issue no commands, the creature takes the Dodge
//     action and moves only to avoid harm. Once given an order, the creature continues to follow it until its task is
//     complete." Animate Objects (24101-24103): "If you issue no commands, the creature takes the Dodge action and moves
//     only to avoid harm."
//   Summon Dragon (31262-31266), Giant Insect (27436-27440): "It obeys your verbal commands (no action required by you).
//     If you don't issue any, it takes the Dodge action and uses its movement to avoid danger."
//   Find Familiar (26789-26790): "Your familiar acts independently of you, but it obeys your commands."
//   Find Steed (26844-26846): "If you have the Incapacitated condition, the steed takes its turn immediately after yours
//     and acts independently, focusing on protecting you."
//   Mounted Combat (2122-2124): "an independent mount ... retains its place in the Initiative order and moves and acts
//     as it likes."
//   Incapacitated (33653-33656): "You can't take any action, Bonus Action, or Reaction. ... Speechless. You can't speak."
//
// Who plays a companion's turn, `brainMode(s, e, opts)`:
//   'player'  its player does (the master's player, there and able to command it): the brain waits (null);
//   'dm'      the DM does, by hand: a standing order (the brain does not guess what "guard the door" means), or a turn
//             the DM's own master commanded, or a commanded turn whose player is not there to play it;
//   'guard'   it takes the Dodge action and moves only to avoid harm: a creature under `orders: 'command'` with no
//             command and no standing order (the lock), or a summon or animated object whose master can't speak;
//   'protect' Find Steed whose master is Incapacitated (or down) and who is not steering it;
//   'free'    played as the monster AI plays a creature, against its foes only, never with an attack for `noAttack`
//             (with nothing else to do, such a one guards): `bond.auto`, a companion nobody plays (the master is the
//             DM's, or its player left), one whose master's player is offline (`opts.offline(userId)`, the client's
//             lobby) or has stepped away (E20), and a familiar or pet whose master is Incapacitated.
// A foe's companion never takes its master into account where the party does not know of the master: it plays as an
// unbonded creature would (no 'protect', no 'guard' for a master who can't speak, no leash), so that what the party
// sees it do says nothing of a hidden master.
const QUIET = new Set(['summon', 'object']);                           // "If you don't issue any [commands], it takes the Dodge action"
const masterOf = (s, e) => (typeof e.bond?.to === 'string' && Object.hasOwn(s.entities, e.bond.to) ? s.entities[e.bond.to] : null);
export function brainMode(s, e, opts = {}) {
  const b = e?.bond;
  if (!b) return null;
  const m = masterOf(s, e), who = ownerOf(s, e);
  const knowsMaster = !!m && (e.side === 'party' || !unknown(s, m));
  const cant = knowsMaster && (!up(m) || !!incapacitatedBy(m));                     // it can give no commands: down, dead, or Incapacitated (Speechless)
  const gone = !!who && ((typeof opts.offline === 'function' && opts.offline(who) === true) || (!!m && !!awayHow(s, m)));
  if (b.orders === 'command') {
    if (commandedNow(s, e)) return who && !gone ? 'player' : 'dm';
    if (typeof b.standing === 'string' && b.standing) return 'dm';
    return 'guard';
  }
  if (b.source === 'find-steed' && cant && !steering(s, e)) return 'protect';
  if (b.auto !== true && who && !gone && !cant) return 'player';
  return cant && QUIET.has(b.kind) ? 'guard' : 'free';
}
// Does the DM's auto-play play this creature's turn? Every creature with no bond, as before; a companion when the brain
// plays it (not when it waits for its player or for the DM's hand). The client asks this (app.js, idled()).
export function autoPlays(s, id, opts) {
  const e = s?.entities?.[id];
  if (!e) return false;
  if (!e.bond) return true;
  const m = brainMode(s, e, opts);
  return m === 'guard' || m === 'protect' || m === 'free';
}
// What it knows: a party companion acts only on what the party knows (hidden-information.md): creatures the players are
// not told of are not in the state it reads, so it neither steps away from one nor is kept off its space (a move onto
// it is stopped and reveals it, by the engine's own rule). A foe's companion knows what the monster AI knows.
function knownTo(s, e) {
  if (e.side !== 'party') return s;
  return { ...s, entities: Object.fromEntries(Object.entries(s.entities).filter(([, o]) => !unknown(s, o))) };
}
export function companionStep(s, id, opts = {}) {
  const e = s.entities[id];
  if (!e || !e.bond || current(s) !== id || !up(e) || s.pending) return null;
  const mode = brainMode(s, e, opts);
  if (mode !== 'guard' && mode !== 'protect' && mode !== 'free') return null;
  const k = knownTo(s, e), m = masterOf(s, e);
  const foes = Object.values(k.entities).filter((o) => up(o) && hostile(o, e) && inFight(k, o.id) && aware(k, e, o));
  const leash = typeof e.bond.leash === 'number' && m && (e.side === 'party' || !unknown(s, m)) ? { m, feet: e.bond.leash } : null;
  if (mode === 'guard') return guard(k, e, foes, leash);
  if (mode === 'protect') return protect(k, e, m, foes);
  // 'free': as a monster plays, but never an attack for one that can't attack.
  const end = { type: 'endTurn', actor: id }, b = k.encounter.budget, noAttack = e.bond.noAttack === true;
  if (k.encounter.round === 1 && !e.hiding && e.skillBonus?.stealth !== undefined && (e.features?.nimbleEscape ? b.bonus > 0 : b.action > 0) && !hideProblem(k, e)) return { type: 'hide', actor: id };
  if (!foes.length) return end;
  const a = e.actions ? withActions(k, e, foes, { noAttack }) : noAttack ? end : withAttacks(k, e, foes);
  return noAttack && a.type === 'endTurn' ? guard(k, e, foes, leash) : a;
}
const rolled = (p) => p.roll === 'melee' || p.roll === 'ranged' || p.aim === 'multi';

// The Dodge action, then away from any foe within 5 feet, then the end of its turn. "Moves only to avoid harm": it moves
// only while a foe it knows of stands within 5 feet of it, and only to a place farther from every foe than where it
// is (the farthest it can reach; then the cheapest). It never goes past its leash (it would vanish).
function guard(s, e, foes, leash) {
  const id = e.id, b = s.encounter.budget, end = { type: 'endTurn', actor: id };
  if (b.action > 0 && !e.cond?.dodging) return { type: 'dodge', actor: id };
  if (!foes.some((f) => apart(s, e, f) <= 1)) return end;
  const near = (pos) => Math.min(...foes.map((f) => apartAt(s, e, pos, f, f.pos)));
  const here = near(e.pos);
  let best = null;
  for (const [, v] of moveOptions(s, e)) {
    if (!v.canStop || (leash && apartAt(s, e, v.h, leash.m, leash.m.pos) * FT > leash.feet)) continue;
    const d = near(v.h);
    if (d > here && (!best || d > best.d || (d === best.d && v.cost < best.cost))) best = { d, cost: v.cost, h: v.h };
  }
  return best ? { type: 'move', actor: id, to: best.h } : end;
}

// Find Steed with its master Incapacitated: to its master's side if it is not there, placed to reach a foe beside her if
// it can; then an attack on a foe within 5 feet of its master (the nearest to it, then the most hurt, then by id); with
// none, the Dodge action. A steed carrying its master does not move: it would only carry her about.
function protect(s, e, m, foes) {
  const id = e.id, b = s.encounter.budget, end = { type: 'endTurn', actor: id };
  const close = foes.filter((f) => apart(s, m, f) <= 1).sort((x, y) => apart(s, e, x) - apart(s, e, y) || x.hp - y.hp || (x.id < y.id ? -1 : 1));
  const moves = (e.actions ?? []).map((def) => ({ def, p: actionProfile(def) })).filter((x) => x.p.harmful && x.p.time === 'action' && x.p.aim === 'creature' && !actionSpent(e, x.def));
  const reach = Math.max(FT, ...moves.filter((x) => x.p.roll === 'melee').map((x) => x.p.far));
  if (b.action > 0) {
    for (const t of close) {
      const x = moves.find((x) => x.p.roll === 'melee' && apart(s, e, t) * FT <= x.p.far && unblocked(s, e, t)) ?? moves.find((x) => apart(s, e, t) * FT <= x.p.far && unblocked(s, e, t));
      if (x) return { type: 'act', actor: id, action: x.def.id, target: t.id };
      const w = !e.actions && (e.attacks ?? []).find((a) => (a.type === 'melee' ? apart(s, e, t) <= 1 : apart(s, e, t) * FT <= (a.range?.[1] ?? 0)) && unblocked(s, e, t));
      if (w) return { type: 'attack', actor: id, target: t.id, attack: w.id };
    }
  }
  if (e.rider !== m.id && b.move >= FT) {
    const score = (pos) => [apartAt(s, e, pos, m, m.pos) <= 1 ? 0 : 1, close.some((f) => apartAt(s, e, pos, f, f.pos) * FT <= reach) ? 0 : 1, apartAt(s, e, pos, m, m.pos)];
    const less = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    const here = score(e.pos);
    let best = null;
    for (const [, v] of moveOptions(s, e)) {
      if (!v.canStop) continue;
      const sc = score(v.h);
      if (less(sc, here) < 0 && (!best || less(sc, best.sc) < 0 || (less(sc, best.sc) === 0 && v.cost < best.cost))) best = { sc, cost: v.cost, h: v.h };
    }
    if (best) return { type: 'move', actor: id, to: best.h };
  }
  if (b.action > 0 && !e.cond?.dodging) return { type: 'dodge', actor: id };
  return end;
}
