// Space: where things can stand. A map is a stack of levels, each a sheet of hexes at a base
// height in feet. A position is { q, r, z } with z in feet. Design: docs/specs/maps-and-objects.md
import * as H from './hex.js';

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
