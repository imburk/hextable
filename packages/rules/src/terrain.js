// Ground and air that a lasting spell changes: Difficult Terrain and Heavily or Lightly Obscured
// areas (Ice Storm's hail, Sleet Storm, Fog Cloud, Grease). Design: docs/specs/rules-expansion.md,
// build notes for #165.
//
// It is `fx.terrain` on a lasting effect (durations.js), made when the spell is cast (engine/casting.js):
//   { area, hexes: [col keys], origin, difficult?: true, obscured?: 'heavy' | 'light', silence?: true, globe?: true, shell?: true, follows?: id }
// laid out as the spell's area was, and gone when the effect ends. Movement reads difficultAt()
// (engine/world.js, moveOptions); sight reads obscuredAt() (sight.js, sees).
import { boxOf, col, gridOf, squareAround } from './grid.js';
import { FT, footprint, gap, rise, sizeOf } from './space.js';

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

// ---------- Globe of Invulnerability and Antilife Shell (docs/specs/rules-expansion.md, "Build notes: wave 3b part 1") ----------
// Globe: `terrain.globe`, an Emanation that stays where it was laid out: `hexes` are its columns (the caster's own space too), `origin` the caster's place.
// Shell: `terrain.shell`, an Emanation that moves with its caster: `follows` is the caster, and it keeps no hexes.
export const globesOf = (s) => terrainsOf(s).filter((fx) => fx.terrain.globe);
export const shellsOf = (s) => terrainsOf(s).filter((fx) => fx.terrain.shell && s.entities[fx.terrain.follows] && !s.entities[fx.terrain.follows].dead);
// Is a creature, standing at `pos` (its own place if none), in this globe: any hex of its space is one of the globe's columns, and within its height of where it went off.
export function inGlobe(s, fx, t, pos = t.pos) {
  if (!pos) return false;
  const T = fx.terrain, keys = new Set(T.hexes);
  return footprint(t, pos, gridOf(s.map)).some((f) => keys.has(col(f))) && rise((pos.z ?? 0) - (T.origin.z ?? 0)) <= T.area.size / FT;
}
// Is a creature, standing at `pos`, within the shell: within its Emanation of the caster's space (the caster is at its centre, so it is in it). `from` is the place the caster
// is taken to stand (its own, if none): the shell as it stood before a move. As zones.js `holds` measures an Emanation that follows a creature.
export function inShell(s, fx, t, pos = t.pos, from) {
  const c = s.entities[fx.terrain.follows];
  if (!c || !pos) return false;
  const at = from ?? c.pos, n = fx.terrain.area.size / FT, G = gridOf(s.map), cp = { ...at };
  if (G.kind === 'square') {
    const keys = new Set(squareAround(boxOf(footprint(c, at, G)), n, s.settings?.areaFill ?? 'round').map(col));
    return footprint(t, pos, G).some((f) => keys.has(col(f))) && rise((pos.z ?? 0) - (at.z ?? 0)) <= n;
  }
  return footprint(t, pos, G).some((f) => G.dist(f, cp) <= n) && gap(s, cp, pos) <= n;
}
