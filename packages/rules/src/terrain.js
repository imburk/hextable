// Ground and air that a lasting spell changes: Difficult Terrain and Heavily or Lightly Obscured
// areas (Ice Storm's hail, Sleet Storm, Fog Cloud, Grease). Design: docs/specs/rules-expansion.md,
// build notes for #165.
//
// It is `fx.terrain` on a lasting effect (durations.js), made when the spell is cast (engine.js):
//   { area, hexes: [col keys], origin, difficult?: true, obscured?: 'heavy' | 'light' }
// laid out as the spell's area was, and gone when the effect ends. Movement reads difficultAt()
// (engine.js, moveOptions); sight reads obscuredAt() (sight.js, sees).
import * as H from './hex.js';
import { FT, gap } from './space.js';

export const terrainsOf = (s) => (s.effects ?? []).filter((fx) => fx.terrain);

// Is a position (a hex at a height) inside this area? As zones.js holds a creature: the hexes it
// was laid out on, and the height of a cylinder, a cube or a sphere from where it went off.
function inside(s, t, pos) {
  if (!t.hexes.includes(H.col(pos))) return false;
  const o = t.origin, z = pos.z ?? 0, shape = t.area.shape, tall = t.area.height ?? t.area.size;
  if (shape === 'cylinder') return z > o.z - FT / 2 && z <= o.z + tall;
  if (shape === 'cube') return z >= o.z && z < o.z + t.area.size;
  if (shape === 'sphere') return gap(s, o, pos) <= t.area.size / FT;
  return true;
}
// Is this place Difficult Terrain because of a spell? (It is or it is not: it does not stack.)
export function difficultAt(s, pos) {
  for (const fx of terrainsOf(s)) if (fx.terrain.difficult && inside(s, fx.terrain, pos)) return true;
  return false;
}
// How obscured a spell makes this place: 'heavy', 'light' or null.
export function obscuredAt(s, pos) {
  let out = null;
  for (const fx of terrainsOf(s)) {
    const o = fx.terrain.obscured;
    if (!o || !inside(s, fx.terrain, pos)) continue;
    if (o === 'heavy') return 'heavy';
    out = 'light';
  }
  return out;
}
