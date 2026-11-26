// Aiming a spell at a wall (issue #823, DEBT W63 (4)): Stone Shape. Pure: plain data in, plain data out; it decides no rule.
// The engine's `aimWall` is the one that refuses a cast. This only says what to offer: the walls in the player's OWN view (`S.map.walls` is what the table sent:
// nothing the view lacks is in it) that are of kind `wall`, on the caster's level and within the spell's reach, nearest first. The cast takes `wall: { level, x, y }`, a
// point in map feet; a tap names the nearest point of the nearest lit wall.
import { gridOf, key as cellKey } from './shared/grid.js';
import { FT } from './shared/engine.js';
import { distToSegment } from './shared/walls.js';
import { footprint, under } from './shared/space.js';
import { rangeAt } from './shared/effects.js';

export const isWallAim = (sp) => sp?.aim === 'wall';
// The shape chosen for Stone Shape: only `passage` cuts a wall; any other shape names none.
export const wallNeeded = (sp, choice) => isWallAim(sp) && (choice ?? sp.def.choice?.from?.[0] ?? 'passage') !== 'other';
const MAX_LISTED = 8;
// The way in the words of a compass (north is up the map), from map feet (x east, y south).
const WINDS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
const windOf = (dx, dy) => (!dx && !dy ? '' : WINDS[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8]);
// A tap names a wall within this many feet of the tapped space's centre: the space beside the wall, and one more (a thumb is not a pencil).
export const FINGER = FT;

// The nearest point to `p` on the segment [a, b], rounded to a hundredth of a foot.
export function nearestOn(p, [a, b]) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy, t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return [Math.round((a[0] + t * dx) * 100) / 100, Math.round((a[1] + t * dy) * 100) / 100];
}
// The spaces along a wall, both sides of it (keys), kept to the level's own tiles.
function hexesAlong(G, level, [a, b]) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len, out = new Set(), steps = Math.max(1, Math.ceil(len / 2));
  for (let i = 0; i <= steps; i++) {
    const x = a[0] + (b[0] - a[0]) * i / steps, y = a[1] + (b[1] - a[1]) * i / steps;
    for (const s of [-1, 1]) { const h = G.cell(x + nx * s, y + ny * s); if (level.tiles[`${h.q},${h.r}`]) out.add(cellKey({ q: h.q, r: h.r })); }
  }
  return [...out];
}
// The walls `e` could aim `sp` at: [{ id, level, a, b, feet, near: [x, y], dir, length, hexes }], nearest first. `feet` is the distance the engine measures (from the edge of the caster's space).
export function wallsFor(S, e, sp) {
  if (!S?.map || !e?.pos || !isWallAim(sp) || e.cond?.blinded) return [];
  const G = gridOf(S.map), mine = under(S.map, e.pos);
  if (!mine) return [];
  const range = rangeAt(sp.def, e.level), spots = footprint(e, e.pos, G).map((h) => G.center(h)), out = [];
  const reach = (P) => Math.min(...spots.map((c) => Math.hypot(c[0] - P[0], c[1] - P[1]) - FT / 2));
  const from = G.center(e.pos);
  for (const w of S.map.walls ?? []) {
    if (w.level !== mine.level.id || w.kind !== 'wall') continue;
    // the point of the wall nearest the caster's space (the middle of the footprint is near enough to choose it; the distance is measured to the edge)
    const near = spots.map((c) => nearestOn(c, [w.a, w.b])).sort((p, q) => reach(p) - reach(q))[0], d = Math.max(0, reach(near));
    if (!(d <= range + 1e-9)) continue;
    out.push({ id: w.id, level: w.level, a: w.a, b: w.b, feet: Math.round(d / FT) * FT, near, dir: windOf(near[0] - from[0], near[1] - from[1]), length: Math.round(Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1])), hexes: hexesAlong(G, mine.level, [w.a, w.b]) });
  }
  return out.sort((x, y) => x.feet - y.feet || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

// The offered wall a tap on `hex` means, and the point it names: the nearest wall to the tapped space's centre within a finger's reach (`FINGER` feet), the point on it nearest that centre;
// a point beyond the caster's reach is moved to the one nearest the caster. null if no lit wall is that near.
export function wallAt(S, offers, hex, reach = Infinity, from = null) {
  if (!S?.map || !hex || !offers.length) return null;
  const c = gridOf(S.map).center(hex);
  const near = offers.map((o) => [distToSegment(c, [o.a, o.b]), o]).filter(([d]) => d <= FINGER + 1e-9).sort((x, y) => x[0] - y[0] || (x[1].id < y[1].id ? -1 : 1))[0];
  if (!near) return null;
  const o = near[1];
  let p = nearestOn(c, [o.a, o.b]);
  if (from && Math.hypot(p[0] - from[0], p[1] - from[1]) - FT / 2 > reach + 1e-9) p = o.near;
  return { id: o.id, point: p };
}

// The choices for the sheet's list (confirm.js option shape): the way to pick when a tap on the map is awkward.
export const wallLabel = (o) => `Wall ${o.feet ? `${o.feet} ft ` : 'beside you, '}${o.dir}`;
export const wallOptions = (offers, chosen) => offers.slice(0, MAX_LISTED).map((o) => ({ value: o.id, label: wallLabel(o), sub: `${o.length} ft of wall`, on: o.id === chosen, why: '' }));
// What is sent: the level and the point.
export const wallArg = (o, point) => ({ wall: { level: o.level, x: point[0], y: point[1] } });

export const stoneWords = (name, offers, chosen) => {
  if (!offers.length) return `${name}: no wall within reach`;
  const c = offers.find((o) => o.id === chosen);
  return c ? `${name}: the ${c.dir} wall${c.feet ? `, ${c.feet} ft off` : ''}. Tap another to swap it, then tap the die` : `${name}: tap ${offers.length === 1 ? 'the lit wall' : 'one of the lit walls'}, then the die`;
};
// What a spell row says when there is no wall to aim at (the Spells tab).
export const noWallWhy = (S, e, sp) => (isWallAim(sp) && !wallsFor(S, e, sp).length ? `No wall within ${rangeAt(sp.def, e.level)} ft that it works on.` : '');
