// Ground and air that a lasting spell changes: Difficult Terrain and Heavily or Lightly Obscured
// areas (Ice Storm's hail, Sleet Storm, Fog Cloud, Grease). Design: docs/specs/rules-expansion.md,
// build notes for #165.
//
// It is `fx.terrain` on a lasting effect (durations.js), made when the spell is cast (engine/casting.js):
//   { area, hexes: [col keys], origin, difficult?: true, obscured?: 'heavy' | 'light', silence?: true }
// laid out as the spell's area was, and gone when the effect ends. Movement reads difficultAt()
// (engine/world.js, moveOptions); sight reads obscuredAt() (sight.js, sees).
import { col, gridOf } from './grid.js';
import { FT, footprint, gap, sizeOf } from './space.js';

export const terrainsOf = (s) => (s.effects ?? []).filter((fx) => fx.terrain);

// Is a position (a hex at a height) inside this area? As zones.js holds a creature: the hexes it
// was laid out on, and the height of a cylinder, a cube or a sphere from where it went off.
function inside(s, t, pos) {
  if (!t.hexes.includes(col(pos))) return false;
  const o = t.origin, z = pos.z ?? 0, shape = t.area.shape, tall = t.area.height ?? t.area.size;
  if (shape === 'cylinder') return z > o.z - FT / 2 && z <= o.z + tall;
  if (shape === 'cube') return z >= o.z && z < o.z + t.area.size;
  if (shape === 'sphere') return gap(s, o, pos) <= t.area.size / FT;
  if (shape === 'line' && t.area.placed) return z >= o.z && z < o.z + (t.area.height ?? FT);
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
// Is this place inside a Sphere of Silence (the `silence` terrain: Silence)? No sound is made there, and a spell with a Verbal component cannot be cast from it.
export function silentAt(s, pos) {
  for (const fx of terrainsOf(s)) if (fx.terrain.silence && inside(s, fx.terrain, pos)) return true;
  return false;
}
// Is the creature entirely inside such a sphere (Silence: Immunity to Thunder damage, Deafened)? Every hex of its space, at its feet and at its head.
export function silentAll(s, t) {
  if (!t.pos) return false;
  const G = gridOf(s.map), z0 = t.pos.z ?? 0, z1 = z0 + Math.max(0, (sizeOf(t).height ?? FT) - 1);
  const cells = footprint(t, t.pos, G);
  return terrainsOf(s).some((fx) => fx.terrain.silence && cells.every((c) => inside(s, fx.terrain, { ...c, z: z0 }) && inside(s, fx.terrain, { ...c, z: z1 })));
}
