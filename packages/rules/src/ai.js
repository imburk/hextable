// Monster brain. Returns the next action for a creature on its turn.
// This is the seam for smarter agents: anything that reads state and returns
// an action (a script, an LLM-driven DM, an AI character) plugs in the same way.
//
// It is called again after each action until it ends the turn. It is simple and deterministic:
// the same state always gives the same answer. Whoever calls it ends the turn if the engine
// refuses what it returns, so a refusal can never loop.
import { moveOptions, current, up, hostile, inFight, unblocked, FT, fromPool, actionSpent, areaTargets, hideProblem } from './engine.js';
import { actionProfile } from './effects.js';
import { apart, apartAt, ground } from './space.js';
import { hiddenFrom } from './sight.js';

// Does this creature know where that one is? Not if it is hiding from it, unless Tremorsense
// pinpoints it: both on the ground and within range (it is still unseen, so attacks at it have Disadvantage).
export function aware(s, e, o) {
  if (!hiddenFrom(o, e)) return true;
  const t = e.senses?.tremorsense ?? 0;
  return t > 0 && apart(s, e, o) * FT <= t && !!ground(s.map, e.pos) && !!ground(s.map, o.pos);
}

export function aiStep(s, id) {
  const e = s.entities[id], end = { type: 'endTurn', actor: id };
  if (!e || current(s) !== id || !up(e)) return null;
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
function withActions(s, e, foes) {
  const id = e.id, end = { type: 'endTurn', actor: id }, b = s.encounter.budget;
  // Nearest first, then the most hurt, then by id, so the order never depends on anything else.
  const order = [...foes].sort((x, y) => apart(s, e, x) - apart(s, e, y) || x.hp - y.hp || (x.id < y.id ? -1 : 1));
  const all = e.actions.map((def) => ({ def, p: actionProfile(def) })).filter((x) => x.p.harmful && !actionSpent(e, x.def) && (x.p.time === 'action' || b.bonus > 0));
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
  const multi = e.actions.find((def) => def.multiattack);
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
