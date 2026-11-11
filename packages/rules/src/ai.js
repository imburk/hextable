// Monster brain. Returns the next action for a creature on its turn.
// This is the seam for smarter agents: anything that reads state and returns
// an action (a script, an LLM-driven DM, an AI character) plugs in the same way.
import * as H from './hex.js';
import { moveOptions, current, up, hostile, inFight, FT } from './engine.js';

export function aiStep(s, id) {
  const e = s.entities[id], end = { type: 'endTurn', actor: id };
  if (!e || current(s) !== id || !up(e)) return null;
  const b = s.encounter.budget;
  const foes = Object.values(s.entities).filter((o) => up(o) && hostile(o, e) && inFight(s, o.id));
  if (!foes.length) return end;
  const near = (pos) => Math.min(...foes.map((f) => H.dist(pos, f.pos)));
  const target = foes.reduce((a, f) => (H.dist(e.pos, f.pos) < H.dist(e.pos, a.pos) || (H.dist(e.pos, f.pos) === H.dist(e.pos, a.pos) && f.hp < a.hp) ? f : a));
  const melee = e.attacks.find((a) => a.type === 'melee'), ranged = e.attacks.find((a) => a.type === 'ranged');
  const d = H.dist(e.pos, target.pos);

  if (b.action > 0 && melee && d <= 1) return { type: 'attack', actor: id, target: target.id, attack: melee.id };
  if (melee && d > 1 && b.move >= FT) {
    let best = null;
    for (const [k, v] of moveOptions(s, e)) {
      if (!v.canStop) continue;
      const nd = near(H.parse(k));
      if (!best || nd < best.nd || (nd === best.nd && v.cost < best.cost)) best = { k, nd, cost: v.cost };
    }
    if (best && best.nd < near(e.pos)) return { type: 'move', actor: id, to: H.parse(best.k) };
  }
  if (b.action > 0 && ranged && d * FT <= ranged.range[1]) return { type: 'attack', actor: id, target: target.id, attack: ranged.id };
  if (b.action > 0 && melee && d > 1 && b.move < FT) return { type: 'dash', actor: id };
  return end;
}
