// Monster brain. Returns the next action for a creature on its turn.
// This is the seam for smarter agents: anything that reads state and returns
// an action (a script, an LLM-driven DM, an AI character) plugs in the same way.
import * as H from './hex.js';
import { moveOptions, current, up, hostile, inFight, unblocked, FT } from './engine.js';
import { apart, apartAt } from './space.js';

export function aiStep(s, id) {
  const e = s.entities[id], end = { type: 'endTurn', actor: id };
  if (!e || current(s) !== id || !up(e)) return null;
  const b = s.encounter.budget;
  const foes = Object.values(s.entities).filter((o) => up(o) && hostile(o, e) && inFight(s, o.id));
  if (!foes.length) return end;
  const open = (t) => unblocked(s, e, t);                    // no wall or shut door in the way
  const near = (pos) => Math.min(...foes.map((f) => apartAt(s, e, pos, f, f.pos)));       // between the nearest parts of the two, whatever their size
  const target = foes.reduce((a, f) => (apart(s, e, f) < apart(s, e, a) || (apart(s, e, f) === apart(s, e, a) && f.hp < a.hp) ? f : a));
  const melee = e.attacks.find((a) => a.type === 'melee'), ranged = e.attacks.find((a) => a.type === 'ranged');
  const d = apart(s, e, target);

  if (b.action > 0 && melee && d <= 1 && open(target)) return { type: 'attack', actor: id, target: target.id, attack: melee.id };
  if (melee && d > 1 && b.move >= FT) {
    let best = null;
    for (const [k, v] of moveOptions(s, e)) {
      if (!v.canStop) continue;
      const nd = near(v.h);
      if (!best || nd < best.nd || (nd === best.nd && v.cost < best.cost)) best = { k, nd, cost: v.cost, h: v.h };
    }
    if (best && best.nd < near(e.pos)) return { type: 'move', actor: id, to: best.h };
  }
  if (b.action > 0 && ranged && d * FT <= ranged.range[1] && open(target)) return { type: 'attack', actor: id, target: target.id, attack: ranged.id };
  if (b.action > 0 && melee && d > 1 && b.move < FT) return { type: 'dash', actor: id };
  return end;
}
