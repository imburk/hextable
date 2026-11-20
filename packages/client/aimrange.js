// Aiming an area (issue #600): how far the caster reaches, drawn as the edge of the reach on the map, and whether a spot is inside it.
// Pure: it reads a game state and the grid and returns plain data. It decides nothing; the engine's own check (`aimArea` in the rules) stays the one that refuses a cast.
// It counts as `aimArea` does: the spot's landing height, `gap` in feet, and on squares from the nearest of the caster's squares.
import { gridOf, key as cellKey } from './shared/grid.js';
import { FT } from './shared/engine.js';
import { gap, landing, footprint, hasColumn } from './shared/space.js';

// How far a spot is from the caster, in feet, as the engine counts it for an area aimed at a spot.
export function aimFeet(S, e, hex) {
  const G = gridOf(S.map), at = hex.z !== undefined ? hex : landing(S.map, hex, e.pos.z) ?? hex;
  const d = G.kind === 'square' ? Math.min(...footprint(e, e.pos, G).map((f) => gap(S, at, f))) : gap(S, at, e.pos);
  return d * FT;
}
// Is the spot within `range` feet? A range of 0 is not aimed at a spot (a cone, a line, a Self cube): every spot is "in".
export const inReach = (S, e, hex, range) => !(range > 0) || aimFeet(S, e, hex) <= range;

let memo = null;
// The cells on the edge of the caster's reach: the cells within `range` that have a neighbour on the map outside it (the map's own edge is not the edge of a reach), as "q,r" keys.
// Kept for the same caster place, range, map and rule, so a pointer moving about does not work it out again.
export function reachEdge(S, e, range) {
  if (!(range > 0)) return [];
  const G = gridOf(S.map), id = `${e.id}|${e.pos.q},${e.pos.r},${e.pos.z ?? 0}|${range}|${S.settings?.vertical ?? ''}`;
  if (memo && memo.map === S.map && memo.id === id) return memo.edge;
  const n = Math.ceil(range / FT), inside = new Set();
  for (const h of G.range(e.pos, n)) if (hasColumn(S.map, h) && inReach(S, e, h, range)) inside.add(cellKey(h));
  const edge = [];
  for (const k of inside) {
    const [q, r] = k.split(',').map(Number);
    if (G.neighbors({ q, r }).some((m) => !inside.has(cellKey(m)) && hasColumn(S.map, m))) edge.push(k);
  }
  memo = { map: S.map, id, edge };
  return edge;
}

// The words for a spot out of reach.
export const farWords = (name, feet, range) => `${name}: that is ${feet} ft away, and it reaches ${range} ft`;
