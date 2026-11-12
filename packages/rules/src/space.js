// Space: where things can stand. A map is a stack of levels, each a sheet of hexes at a base
// height in feet. A position is { q, r, z } with z in feet. Design: docs/specs/maps-and-objects.md
import * as H from './hex.js';
import { SIZES } from './content/sizes.js';

export const FT = 5;            // feet per hex
export const STEP_FREE = 2.5;   // a rise or drop up to this is ordinary walking
export const STEP_MAX = 5;      // up to this it is Difficult Terrain; more needs climbing

// Every surface in a hex column, lowest first: [{ level, tile, z }].
export function surfaces(map, h) {
  const k = H.col(h), out = [];
  for (const level of map.levels) {
    const tile = level.tiles[k];
    if (tile) out.push({ level, tile, z: level.z + (tile.h ?? 0) });
  }
  return out.sort((a, b) => a.z - b.z);
}
export const hasColumn = (map, h) => map.levels.some((l) => l.tiles[H.col(h)]);

// The surface a position stands on, or null if it is in the air (or off the map).
export const ground = (map, pos) => surfaces(map, pos).find((sf) => sf.z === (pos.z ?? 0)) ?? null;

// The position on the surface in this column nearest a height: the hex's own z if it has one,
// otherwise `hint`. Null if the column is empty. This is how a tap without a height is read.
export function landing(map, hex, hint = 0) {
  const want = hex.z ?? hint;
  let best = null;
  for (const sf of surfaces(map, hex)) if (!best || Math.abs(sf.z - want) < Math.abs(best.z - want)) best = sf;
  return best ? { q: hex.q, r: hex.r, z: best.z } : null;
}

// Every tile of the map with where it is: [{ q, r, z, tile, level }].
export function allTiles(map) {
  const out = [];
  for (const level of map.levels) for (const k in level.tiles) { const h = H.parse(k), tile = level.tiles[k]; out.push({ q: h.q, r: h.r, z: level.z + (tile.h ?? 0), tile, level }); }
  return out;
}

// The surface under a position: what it stands on, or the nearest one below it if it is in the air.
export function under(map, pos) {
  let best = null;
  for (const sf of surfaces(map, pos)) if (sf.z <= (pos.z ?? 0)) best = sf;
  return best;
}

// ---------- regions ----------
// A region is a named set of hexes on one level (a room, a corridor) that players are sent only
// once it is revealed. Hexes in no region are always sent.
const regionIndex = new WeakMap();
export function regionAt(map, levelId, h) {
  const sig = map.regions.map((r) => `${r.id}:${r.level}:${r.hexes.length}`).join();
  let had = regionIndex.get(map);
  if (!had || had.sig !== sig) {
    had = { sig, at: new Map() };
    for (const r of map.regions) for (const k of r.hexes) had.at.set(`${r.level}|${k}`, r);
    regionIndex.set(map, had);
  }
  return had.at.get(`${levelId}|${H.col(h)}`) ?? null;
}
// May players be sent this hex of this level?
export const shown = (map, levelId, h) => { const r = regionAt(map, levelId, h); return !r || !!r.revealed; };
// Is this position somewhere the players have not seen yet?
export const unseenAt = (map, pos) => { const sf = under(map, pos); return !!sf && !shown(map, sf.level.id, pos); };
// A creature the players are not told about: the DM hid it, or it is somewhere they have not seen.
export const concealed = (map, e) => !!e && e.side !== 'party' && (!!e.hidden || unseenAt(map, e.pos));

// ---------- distance ----------
// How many hexes of height a difference in feet counts as: under 5 ft is none.
export const rise = (dz) => Math.floor((Math.abs(dz) + 2.49) / FT);
// Distance between two positions in hexes, counting height. How the two combine is a table rule
// (settings.vertical): 'max' counts a diagonal as one, 'sum' adds them, 'true' measures the straight line.
export function gap(s, a, b) {
  const h = H.dist(a, b), v = rise((a.z ?? 0) - (b.z ?? 0)), rule = s?.settings?.vertical ?? 'max';
  return rule === 'sum' ? h + v : rule === 'true' ? Math.round(Math.hypot(h, v)) : Math.max(h, v);
}
// How high a wall stands above the floor of its level, and how tall a creature is, in feet.
export const WALL_HEIGHT = 10, HEADROOM = 5;

// ---------- size ----------
// A creature fills a footprint of hexes, anchored on the hex of its position, and stands so high.
const TRIANGLE = [[0, 0], [1, 0], [0, 1]];
const SHAPES = { 1: [[0, 0]], 3: TRIANGLE, 7: [[0, 0], ...H.DIRS] };
SHAPES[12] = [...new Map(TRIANGLE.flatMap(([q, r]) => [[q, r], ...H.DIRS.map(([dq, dr]) => [q + dq, r + dr])]).map((o) => [`${o}`, o])).values()];
export const sizeOf = (e) => SIZES[e?.size] ?? SIZES.medium;
export const shapeOf = (e) => SHAPES[sizeOf(e).hexes];
// The hexes a creature fills when it stands at `pos` (its own position if none is given).
export const footprint = (e, pos = e.pos) => shapeOf(e).map(([dq, dr]) => ({ q: pos.q + dq, r: pos.r + dr, z: pos.z ?? 0 }));
// Would two creatures be in each other's space, one at `pa` and the other at `pb`?
export function overlapAt(a, pa, b, pb) {
  const za = pa.z ?? 0, zb = pb.z ?? 0;
  if (za >= zb + sizeOf(b).height || zb >= za + sizeOf(a).height) return false;
  const sa = shapeOf(a), sb = shapeOf(b);
  if (sa.length === 1 && sb.length === 1) return pa.q === pb.q && pa.r === pb.r;
  return sa.some(([aq, ar]) => sb.some(([bq, br]) => pa.q + aq === pb.q + bq && pa.r + ar === pb.r + br));
}
// Distance in hexes between two creatures, one at `pa` and the other at `pb`: between the nearest
// parts of them, across and up, combined by the table rule for height.
export function apartAt(s, a, pa, b, pb) {
  const sa = shapeOf(a), sb = shapeOf(b);
  let h = Infinity;
  if (sa.length === 1 && sb.length === 1) h = H.dist(pa, pb);
  else for (const [aq, ar] of sa) for (const [bq, br] of sb) h = Math.min(h, H.dist({ q: pa.q + aq, r: pa.r + ar }, { q: pb.q + bq, r: pb.r + br }));
  const za = pa.z ?? 0, zb = pb.z ?? 0;
  // The lower creature reaches up by its own height: only what lies above its head counts.
  const v = rise(zb >= za ? Math.max(0, zb - (za + sizeOf(a).height - FT)) : Math.max(0, za - (zb + sizeOf(b).height - FT)));
  const rule = s?.settings?.vertical ?? 'max';
  return rule === 'sum' ? h + v : rule === 'true' ? Math.round(Math.hypot(h, v)) : Math.max(h, v);
}
export const apart = (s, a, b) => apartAt(s, a, a.pos, b, b.pos);
