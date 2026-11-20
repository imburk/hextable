// Space: where things can stand. A map is a stack of levels, each a sheet of hexes at a base
// height in feet. A position is { q, r, z } with z in feet. Design: docs/specs/maps-and-objects.md
import { HEX, gridOf, col, parse } from './grid.js';
import { SIZES } from './content/sizes.js';

export const FT = 5;            // feet per hex
export const STEP_FREE = 2.5;   // a rise or drop up to this is ordinary walking
export const STEP_MAX = 5;      // up to this it is Difficult Terrain; more needs climbing

// Every surface in a hex column, lowest first: [{ level, tile, z }].
export function surfaces(map, h) {
  const k = col(h), out = [];
  for (const level of map.levels) {
    const tile = level.tiles[k];
    if (tile) out.push({ level, tile, z: level.z + (tile.h ?? 0) });
  }
  return out.sort((a, b) => a.z - b.z);
}
export const hasColumn = (map, h) => map.levels.some((l) => l.tiles[col(h)]);

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
  for (const level of map.levels) for (const k in level.tiles) { const h = parse(k), tile = level.tiles[k]; out.push({ q: h.q, r: h.r, z: level.z + (tile.h ?? 0), tile, level }); }
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
  return had.at.get(`${levelId}|${col(h)}`) ?? null;
}
// May players be sent this hex of this level?
export const shown = (map, levelId, h) => { const r = regionAt(map, levelId, h); return !r || !!r.revealed; };
// Is this position somewhere the players have not seen yet?
export const unseenAt = (map, pos) => { const sf = under(map, pos); return !!sf && !shown(map, sf.level.id, pos); };
// A creature the players are not told about: the DM hid it, it took the Hide action and nobody in
// the party has found it, or it is somewhere they have not seen.
export const concealed = (map, e) => !!e && e.side !== 'party' && (!!e.hidden || !!e.hiding || unseenAt(map, e.pos));

// ---------- shop areas ----------
// Is a creature inside a shop area (docs/specs/shops.md, Decision 4)? It is when any cell of its footprint, by
// its size on the map's grid, is a cell of the area, and the creature stands on the area's level: the surface under
// its anchor cell is on that level (a flyer counts by the surface under it), and so is the surface under that cell,
// so a Large pawn on a loft whose edge overhangs the floor below does not drop a floor into the shop there. A Large
// pawn half in the doorway is in. `area` is the area's record or its id on this map; no map, an id the map does not
// have, or a creature off the map is not inside.
export function inArea(map, area, e) {
  if (!map) return false;
  const a = typeof area === 'string' ? (map.areas ?? []).find((x) => x?.id === area) : area;
  if (!a || !Array.isArray(a.hexes) || !e?.pos) return false;
  const level = under(map, e.pos)?.level.id;
  if (level === undefined || level !== a.level) return false;
  const cells = new Set(a.hexes);
  return footprint(e, e.pos, gridOf(map)).some((c) => cells.has(col(c)) && under(map, c)?.level.id === level);
}

// ---------- distance ----------
// How many hexes of height a difference in feet counts as: under 5 ft is none.
export const rise = (dz) => Math.floor((Math.abs(dz) + 2.49) / FT);
// How far apart two cells are, in cells, when reach or range is measured (a 5-foot reach is 1).
// On hexes it is the grid's own count. On squares it is the table rule `squareRange`: 'real' (the
// default) measures centre to centre for real and rounds down to a whole cell, so the 8 squares
// around a creature are within 5 feet but three squares diagonally are 20 feet, not 15; 'srd'
// counts squares as the SRD does, a diagonal like a side (SRD 5.2.1 1826-1829). Worked out in whole
// numbers, so it is the same on every machine.
export const SQUARE_RANGES = ['real', 'srd'];
function realCells(a, b) {
  const dq = a.q - b.q, dr = a.r - b.r, d2 = dq * dq + dr * dr;
  let n = Math.floor(Math.sqrt(d2));
  while (n * n > d2) n--;
  while ((n + 1) * (n + 1) <= d2) n++;
  return n;
}
export const measure = (s, G) => (G.kind === 'square' && (s?.settings?.squareRange ?? 'real') === 'real' ? realCells : G.dist);
// Distance between two positions in cells, counting height. How the two combine is a table rule
// (settings.vertical): 'max' counts a diagonal as one, 'sum' adds them, 'true' measures the straight line.
export function gap(s, a, b) {
  const h = measure(s, gridOf(s?.map))(a, b), v = rise((a.z ?? 0) - (b.z ?? 0)), rule = s?.settings?.vertical ?? 'max';
  return rule === 'sum' ? h + v : rule === 'true' ? Math.round(Math.hypot(h, v)) : Math.max(h, v);
}
// How high a wall stands above the floor of its level, and how tall a creature is, in feet.
export const WALL_HEIGHT = 10, HEADROOM = 5;

// ---------- size ----------
// A creature fills a footprint of hexes, anchored on the hex of its position, and stands so high.
// The shape is the grid's (`G.footprint`). Every caller in packages/rules/src and the client
// passes the map's grid, `gridOf(map)`, and a test (square-moving.test.js) reads the source and
// fails on a call that leaves it out, so no rules code measures a square map in hexes (task S6).
// The hex default stays for the hex tests that call these directly.
export const sizeOf = (e) => SIZES[e?.size] ?? SIZES.medium;
// A rider (`riding`, docs/specs/companions.md, Decision 8; stage C6a) stands in its mount's space: its position is the
// mount's anchor and its footprint is the mount's shape, kept on the ride as `riding.size` (the engine keeps it in
// step with the mount after every action: engine/resolve.js, settleRiders). So reach, range, areas and the overlap
// check all measure a rider by the whole mount, on hexes and on squares alike, and two creatures share a space only
// through riding. Its own size (`sizeOf`) is unchanged: what it can grapple, how tall it is.
export const shapeOf = (e, G = HEX) => G.footprint(e?.riding && SIZES[e.riding.size] ? e.riding.size : e?.size);
// The cells a creature fills when it stands at `pos` (its own position if none is given).
export const footprint = (e, pos = e.pos, G = HEX) => shapeOf(e, G).map(([dq, dr]) => ({ q: pos.q + dq, r: pos.r + dr, z: pos.z ?? 0 }));
// Are these two a riding pair, a rider and the mount it rides (each naming the other)? They share one space (stage
// C6a), so neither is ever in the other's way: not when the pair moves, is pushed, grows or shrinks (stage C6b, DEBT
// W13). Everyone else still sees both as occupying it.
export const paired = (a, b) => !!a && !!b && a !== b && ((a.riding?.on === b.id && b.rider === a.id) || (b.riding?.on === a.id && a.rider === b.id));
// Would two creatures be in each other's space, one at `pa` and the other at `pb`? Never the two of a riding pair while
// they stand on one anchor, as riding has them; anywhere else they are two creatures like any (fix round 1 of #363, M1:
// the DM's `place` of one half onto another cell of the other is refused as occupied, as before C6b).
export function overlapAt(a, pa, b, pb, G = HEX) {
  if (paired(a, b) && pa.q === pb.q && pa.r === pb.r && (pa.z ?? 0) === (pb.z ?? 0)) return false;
  const za = pa.z ?? 0, zb = pb.z ?? 0;
  if (za >= zb + sizeOf(b).height || zb >= za + sizeOf(a).height) return false;
  const sa = shapeOf(a, G), sb = shapeOf(b, G);
  if (sa.length === 1 && sb.length === 1) return pa.q === pb.q && pa.r === pb.r;
  return sa.some(([aq, ar]) => sb.some(([bq, br]) => pa.q + aq === pb.q + bq && pa.r + ar === pb.r + br));
}
// Distance in cells between two creatures, one at `pa` and the other at `pb`: between the nearest
// parts of them, across (as reach and range are measured, `measure`) and up, combined by the table
// rule for height. The grid is the map's unless given.
export function apartAt(s, a, pa, b, pb, G = gridOf(s?.map)) {
  const sa = shapeOf(a, G), sb = shapeOf(b, G);
  const dist = measure(s, G);
  let h = Infinity;
  if (sa.length === 1 && sb.length === 1) h = dist(pa, pb);
  else for (const [aq, ar] of sa) for (const [bq, br] of sb) h = Math.min(h, dist({ q: pa.q + aq, r: pa.r + ar }, { q: pb.q + bq, r: pb.r + br }));
  const za = pa.z ?? 0, zb = pb.z ?? 0;
  // The lower creature reaches up by its own height: only what lies above its head counts.
  const v = rise(zb >= za ? Math.max(0, zb - (za + sizeOf(a).height - FT)) : Math.max(0, za - (zb + sizeOf(b).height - FT)));
  const rule = s?.settings?.vertical ?? 'max';
  return rule === 'sum' ? h + v : rule === 'true' ? Math.round(Math.hypot(h, v)) : Math.max(h, v);
}
export const apart = (s, a, b) => apartAt(s, a, a.pos, b, b.pos, gridOf(s?.map));
