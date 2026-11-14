// The geometry of a map's grid, behind one interface: every caller asks `gridOf(map)` and uses what
// it gets, so the rules never measure a map by a grid it was not drawn on. Design:
// docs/specs/square-grid.md, Decision 1 and "The geometry interface".
//
// Only `HEX` exists yet (task S0). It is today's hex code, moved and not rewritten: the functions
// of hex.js themselves, and constants copied as they stood in walls.js, sight.js and space.js.
// Replays depend on it returning exactly what that code returned, in the same order
// (grid.test.js pins it).
//
// This module imports nothing but hex.js and the size table, so that any rules module can import
// it without a cycle.
import * as H from './hex.js';
import { SIZES } from './content/sizes.js';

const FT = 5;                     // feet per cell; space.js FT
const S3 = Math.sqrt(3);
const R = FT / S3;                // centre to corner, feet

// A cell's centre in map coordinates: feet, x to the east, y to the south (as walls.js `center`).
const center = (h) => [FT * (h.q + h.r / 2), FT * (S3 / 2) * h.r];

// The side between `at` and its neighbour in direction `edge` (an index into DIRS), as a segment
// (as walls.js `edgeSegment`).
function edgeSegment(at, edge) {
  const a = center(at), [dq, dr] = H.DIRS[edge], b = center({ q: at.q + dq, r: at.r + dr });
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, half = FT / (2 * S3);
  const px = -(b[1] - a[1]) / FT, py = (b[0] - a[0]) / FT;
  return [[mx + px * half, my + py * half], [mx - px * half, my - py * half]];
}

// The six corners, as offsets from the centre, `inset` of the way out (sight.js uses 0.9, "a little
// inside the true corner"). Worked out as sight.js did, so the points are the same to the last bit.
const offsets = new Map();
function cornerOffsets(inset) {
  let o = offsets.get(inset);
  if (!o) {
    const r = R * inset;
    o = [0, 1, 2, 3, 4, 5].map((i) => { const a = (Math.PI / 180) * (30 + 60 * i); return [r * Math.cos(a), r * Math.sin(a)]; });
    offsets.set(inset, o);
  }
  return o;
}
const corners = (h, inset = 1) => { const c = center(h); return cornerOffsets(inset).map(([dx, dy]) => [c[0] + dx, c[1] + dy]); };

// Footprints (content/sizes.js `hexes`): 1 the cell; 3 the cell and two neighbours that touch each
// other; 7 the cell and all six neighbours; 12 the triangle and every cell around it (as space.js).
const TRIANGLE = [[0, 0], [1, 0], [0, 1]];
const SHAPES = { 1: [[0, 0]], 3: TRIANGLE, 7: [[0, 0], ...H.DIRS] };
SHAPES[12] = [...new Map(TRIANGLE.flatMap(([q, r]) => [[q, r], ...H.DIRS.map(([dq, dr]) => [q + dq, r + dr])]).map((o) => [`${o}`, o])).values()];
// The offsets a creature of this size fills, anchored at [0, 0]; an unknown size is Medium.
const footprint = (size) => SHAPES[(SIZES[size] ?? SIZES.medium).hexes];

// The side index from `a` to its neighbour `b`, or -1 (as the editor's `edgeOf`).
const edgeOf = (a, b) => H.DIRS.findIndex(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);

// The cells from `a` to `b` inclusive, in order, if they lie on one of the three grid directions;
// otherwise null (the editor's stairs).
function straight(a, b) {
  const dq = b.q - a.q, dr = b.r - a.r;
  if (!(dq === 0 || dr === 0 || dq + dr === 0)) return null;
  const n = H.dist(a, b), out = [];
  for (let i = 0; i <= n; i++) out.push({ q: a.q + Math.sign(dq) * i, r: a.r + Math.sign(dr) * i });
  return out;
}

// Every cell whose centre lies in the rectangle from (x0, y0) to (x1, y1) in feet, edges included,
// row by row from the north and west to east in each row (the UVTT importer's tiling).
function cellsIn(x0, y0, x1, y1) {
  const out = [], row = FT * S3 / 2;
  const rMin = Math.floor(y0 / row) - 1, rMax = Math.ceil(y1 / row) + 1;
  for (let r = rMin; r <= rMax; r++) {
    const qMin = Math.floor(x0 / FT - r / 2) - 1, qMax = Math.ceil(x1 / FT - r / 2) + 1;
    for (let q = qMin; q <= qMax; q++) {
      const cx = FT * (q + r / 2), cy = FT * (S3 / 2) * r;
      if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) out.push({ q, r });
    }
  }
  return out;
}

export const HEX = Object.freeze({
  kind: 'hex',
  word: Object.freeze({ one: 'hex', many: 'hexes' }),
  DIRS: H.DIRS,
  EDGES: 6,
  neighbors: H.neighbors,
  dist: H.dist,
  range: H.range,
  center,
  cell: (x, y) => H.fromWorld(x, y, R),
  toWorld: H.toWorld,
  fromWorld: H.fromWorld,
  corners,
  cornerReach: R,
  edgeSegment,
  edgeOf,
  beside: () => [],
  footprint,
  cone: H.cone,
  band: H.band,
  along: H.along,
  straight,
  cellsIn,
  col: H.col, key: H.key, parse: H.parse, reachable: H.reachable, pathTo: H.pathTo,
});

// The grid a map is drawn on. Every map is on hexes until square maps exist (task S4 onward).
export const gridOf = (map) => HEX;

// Grid-free helpers, so that a caller needs one import.
export const { col, key, parse, reachable, pathTo } = H;
