// The geometry of a map's grid, behind one interface: every caller asks `gridOf(map)` and uses what
// it gets, so the rules never measure a map by a grid it was not drawn on. Design:
// docs/specs/square-grid.md, Decision 1 and "The geometry interface".
//
// `HEX` is today's hex code, moved and not rewritten (task S0): the functions of hex.js themselves,
// and constants copied as they stood in walls.js, sight.js and space.js. Replays depend on it
// returning exactly what that code returned, in the same order (grid.test.js pins it).
//
// `SQUARE` (task S5) has the same members, by the SRD's rules for playing on a grid (SRD 5.2.1,
// "Playing on a Grid", reference/srd52/srd52-flow.txt 1806-1829, and "Creature Size and Space",
// 1893-1943). The linter refuses square maps until task S6, so nothing plays on it yet.
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

// ---------- squares ----------
// A square position is { q, r, z } as a hex one is: `q` the column (east), `r` the row (south), `z`
// the height in feet; keys stay "q,r" (Decision 2). A square's centre is 5 feet from its four side
// neighbours ("Each square represents 5 feet", SRD 1810).
const SQ = Object.freeze;
// E, N, W, S cross a side; then NE, NW, SW, SE, the diagonals. This order is fixed once; replays
// depend on it (grid.test.js pins it).
const SQ_DIRS = SQ([[1, 0], [0, -1], [-1, 0], [0, 1], [1, -1], [-1, -1], [-1, 1], [1, 1]].map(SQ));
const SQ_R = FT / Math.SQRT2;            // centre to corner, feet
// Drawing units per foot are the same on both grids (Decision 8): on hexes neighbouring centres are
// √3 units and 5 feet apart.
const UNIT = S3 / FT;
const z0 = (n) => n + 0;                 // -0 is written 0, so a cell is the same cell however it was reached

const sqCenter = (h) => [FT * h.q, FT * h.r];
const sqCell = (x, y) => ({ q: z0(Math.round(x / FT)), r: z0(Math.round(y / FT)) });
// Every square at most `n` steps from `c`: (2n + 1)² of them, column by column from the west and
// north to south in each column (the order hex.js's `range` walks its axes).
function sqRange(c, n) {
  const out = [];
  for (let dq = -n; dq <= n; dq++) for (let dr = -n; dr <= n; dr++) out.push({ q: c.q + dq, r: c.r + dr });
  return out;
}
// Steps by the shortest route. A diagonal costs what a side step does (SRD 1817-1823), and range
// is counted the same way (1826-1829): the larger of the two offsets.
const sqDist = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r));
// Drawing units, as hex.js's `toWorld` and `fromWorld`: `size` scales both alike (with the default
// size 1, side neighbours are √3 units apart, as hex neighbours are).
const sqToWorld = (h, size = 1) => ({ x: size * S3 * h.q, z: size * S3 * h.r });
const sqFromWorld = (x, z, size = 1) => ({ q: z0(Math.round(x / (size * S3))), r: z0(Math.round(z / (size * S3))) });
// The four corners, in order around (south-east, south-west, north-west, north-east, the way the
// hex corners go round), `inset` of the way out from the centre. At inset 1 they are ±2.5 feet.
function sqCorners(h, inset = 1) {
  const [x, y] = sqCenter(h), d = (FT / 2) * inset;
  return [[x + d, y + d], [x - d, y + d], [x - d, y - d], [x + d, y - d]];
}
// The side between `at` and its side neighbour in direction `edge` (0 to 3), worked out as the hex
// side is: from the middle of the two centres, half a side each way across the step.
function sqEdgeSegment(at, edge) {
  const a = sqCenter(at), [dq, dr] = SQ_DIRS[edge], b = sqCenter({ q: at.q + dq, r: at.r + dr });
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, half = FT / 2;
  const px = -(b[1] - a[1]) / FT, py = (b[0] - a[0]) / FT;
  return [[mx + px * half, my + py * half], [mx - px * half, my - py * half]];
}
const sqEdgeOf = (a, b) => SQ_DIRS.slice(0, 4).findIndex(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);
// The two squares a diagonal step passes between (the one along the column first, then the one
// along the row), for the rule that a diagonal can't cross a wall's corner or a terrain feature
// that fills its space (SRD 1824-1825). A side step, or anything that is not one step, passes
// between none.
function sqBeside(a, b) {
  const dq = b.q - a.q, dr = b.r - a.r;
  if (Math.abs(dq) !== 1 || Math.abs(dr) !== 1) return [];
  return [{ q: a.q + dq, r: a.r }, { q: a.q, r: a.r + dr }];
}
// Footprints from the SRD's Creature Size and Space table (1893-1943): Tiny, Small and Medium 1
// square (Tiny creatures share it, four to a square, as they share a hex), Large 2 by 2, Huge 3 by 3,
// Gargantuan 4 by 4. A creature's position is its north-west square; the offsets go row by row from
// the north, west to east in each row.
const SIDE = { tiny: 1, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4 };
const SQ_SHAPES = Object.fromEntries([1, 2, 3, 4].map((n) => [n, SQ(Array.from({ length: n * n }, (_, i) => SQ([i % n, Math.floor(i / n)])))]));
const sqFootprint = (size) => SQ_SHAPES[Object.hasOwn(SIDE, size) ? SIDE[size] : SIDE.medium];
// A point's offset from `origin`'s centre along and across the direction to `aim`'s, in feet; null
// if `aim` is `origin`.
function frame(origin, aim) {
  const [ox, oy] = sqCenter(origin), [ax, ay] = sqCenter(aim), dx = ax - ox, dy = ay - oy, dl = Math.hypot(dx, dy);
  if (!dl) return null;
  const ux = dx / dl, uy = dy / dl;
  return (h) => { const [x, y] = sqCenter(h), vx = x - ox, vy = y - oy; return { t: vx * ux + vy * uy, cross: vx * uy - vy * ux }; };
}
const EPS = 1e-6;
// A cone of `n` squares (5n feet long) from `origin` toward `aim` (Decision 6): the squares whose
// centres lie inside the SRD's cone, whose "width at any point along its length is equal to that
// point's distance from the point of origin" (SRD 33026-33039), out to its length along the aim.
// The origin's own square is out. Empty if `aim` is `origin`.
function sqCone(origin, aim, n) {
  const at = frame(origin, aim);
  if (!at) return [];
  const L = FT * n;
  // A point inside lies at most √(1 + 1/4) of the length away, so a little more than n squares.
  return sqRange(origin, Math.ceil(n * 1.2)).filter((h) => {
    if (h.q === origin.q && h.r === origin.r) return false;
    const { t, cross } = at(h);
    return t > EPS && t <= L + EPS && Math.abs(cross) <= t / 2 + EPS;
  });
}
// The squares in a straight band, as hex.js's `band`: centres between `from` and `to` feet along the
// direction (from < t ≤ to) and no more than `half` feet to either side (a centre exactly on the edge
// counts on one side only). Empty if `aim` is `origin`.
function sqBand(origin, aim, from, to, half) {
  const at = frame(origin, aim);
  if (!at) return [];
  const n = Math.ceil((Math.max(Math.abs(from), Math.abs(to)) + half) / FT) + 1;
  return sqRange(origin, n).filter((h) => {
    const { t, cross } = at(h), side = Math.abs(cross);
    return t > from + EPS && t <= to + EPS && (side < half - EPS || (side <= half + EPS && cross > 0));
  });
}
const sqAlong = (origin, aim, h) => { const at = frame(origin, aim); return at ? at(h).t : 0; };
// The squares from `a` to `b` inclusive, in order, if they lie on one of the four grid lines (the
// eight directions); otherwise null.
function sqStraight(a, b) {
  const dq = b.q - a.q, dr = b.r - a.r;
  if (!(dq === 0 || dr === 0 || Math.abs(dq) === Math.abs(dr))) return null;
  const n = sqDist(a, b), out = [];
  for (let i = 0; i <= n; i++) out.push({ q: a.q + Math.sign(dq) * i, r: a.r + Math.sign(dr) * i });
  return out;
}
// Every square whose centre lies in the rectangle from (x0, y0) to (x1, y1) in feet, edges included,
// row by row from the north, west to east in each row (as `HEX.cellsIn`).
function sqCellsIn(x0, y0, x1, y1) {
  const out = [];
  for (let r = Math.floor(y0 / FT) - 1; r <= Math.ceil(y1 / FT) + 1; r++)
    for (let q = Math.floor(x0 / FT) - 1; q <= Math.ceil(x1 / FT) + 1; q++) {
      const cx = FT * q, cy = FT * r;
      if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) out.push({ q, r });
    }
  return out;
}

export const SQUARE = Object.freeze({
  kind: 'square',
  word: Object.freeze({ one: 'square', many: 'squares' }),
  DIRS: SQ_DIRS,
  EDGES: 4,
  neighbors: (h) => SQ_DIRS.map(([dq, dr]) => ({ q: h.q + dq, r: h.r + dr })),
  dist: sqDist,
  range: sqRange,
  center: sqCenter,
  cell: sqCell,
  toWorld: sqToWorld,
  fromWorld: sqFromWorld,
  corners: sqCorners,
  cornerReach: SQ_R,
  edgeSegment: sqEdgeSegment,
  edgeOf: sqEdgeOf,
  beside: sqBeside,
  footprint: sqFootprint,
  cone: sqCone,
  band: sqBand,
  along: sqAlong,
  straight: sqStraight,
  cellsIn: sqCellsIn,
  col: H.col, key: H.key, parse: H.parse, reachable: H.reachable, pathTo: H.pathTo,
});

// ---------- areas of effect on squares (task S7) ----------
// Which squares an area covers (docs/specs/square-grid.md, Decision 6 and the S7 build notes). The
// owner's rule: a square is in an area when its centre is inside the real shape. For a Sphere, a
// Cylinder and an Emanation the table rule `areaFill` may instead count squares as the SRD counts
// range (1826-1829): `fill` is 'round' (centres inside, the default) or 'grid' (counted).
//
// Worked in half-squares (2.5 ft), where every point used here is whole numbers: a square's centre
// is (2q, 2r), its corners odd, and the middle of a creature's space (a corner of squares when it
// is 2 by 2 or 4 by 4) whole too. Every test is then whole-number arithmetic on exact values, so no
// tolerance decides a square on the edge and turning or mirroring an aim turns or mirrors the area
// exactly. A point is [x, y]; a creature's space is the box { q0, r0, q1, r1 } of its squares.
export const boxOf = (cells) => ({ q0: Math.min(...cells.map((c) => c.q)), r0: Math.min(...cells.map((c) => c.r)), q1: Math.max(...cells.map((c) => c.q)), r1: Math.max(...cells.map((c) => c.r)) });
// The middle of a box of squares, in half-squares.
export const boxMiddle = (b) => [b.q0 + b.q1, b.r0 + b.r1];
const inBox = (b, h) => h.q >= b.q0 && h.q <= b.q1 && h.r >= b.r0 && h.r <= b.r1;
// The squares of a Sphere or a Cylinder's base of radius `n` squares centred on square `c`.
export function squareDisc(c, n, fill) {
  return fill === 'grid' ? sqRange(c, n) : sqRange(c, n).filter((h) => (h.q - c.q) ** 2 + (h.r - c.r) ** 2 <= n * n);
}
// The squares of an Emanation `n` squares out from a creature's space (the box `b`), which is not in
// it: 'round', those whose centres are within 5n feet of the space in a straight line; 'grid', those
// within n squares of it counted as range is.
export function squareAround(b, n, fill) {
  const out = [];
  for (let q = b.q0 - n; q <= b.q1 + n; q++) for (let r = b.r0 - n; r <= b.r1 + n; r++) {
    const h = { q, r };
    if (inBox(b, h)) continue;
    if (fill === 'grid') { out.push(h); continue; }
    const ex = Math.max(0, 2 * b.q0 - 1 - 2 * q, 2 * q - 2 * b.q1 - 1), ey = Math.max(0, 2 * b.r0 - 1 - 2 * r, 2 * r - 2 * b.r1 - 1);
    if (ex * ex + ey * ey <= 4 * n * n) out.push(h);
  }
  return out;
}
// The squares round point `p` (half-squares) that a shape reaching `reach` half-squares from it may
// touch.
const around = (p, reach) => sqRange({ q: Math.floor(p[0] / 2), r: Math.floor(p[1] / 2) }, Math.ceil(reach / 2) + 1);
// A Cone from point `p` toward the centre of square `aim`, `len` feet long: the squares whose centres
// lie inside it (as wide at each point as that point is far from `p`, SRD 33026-33039), leaving out
// the squares of `skip` (the box of the space it starts from: its point of origin is not in it).
// Empty if `aim`'s centre is `p`.
export function squareCone(p, aim, len, skip) {
  const dx = 2 * aim.q - p[0], dy = 2 * aim.r - p[1], dd = dx * dx + dy * dy, L = len / (FT / 2);
  if (!dd) return [];
  return around(p, L * 1.2).filter((h) => {
    if (skip && inBox(skip, h)) return false;
    const vx = 2 * h.q - p[0], vy = 2 * h.r - p[1], a = vx * dx + vy * dy, c = vx * dy - vy * dx;
    return a > 0 && 4 * c * c <= a * a && a * a <= L * L * dd;
  });
}
// A straight strip from point `p` toward the centre of square `aim`: the squares whose centres lie
// beyond the edge of the box `from` (where the aim leaves it), at most `len` feet past that edge,
// and no more than `half` feet to either side of the middle line (a centre exactly on a side counts
// on one side only, the left of the aim, as `band` does). A Line, and the length of a Cube's side.
// Empty if `aim`'s centre is `p`.
export function squareStrip(p, aim, from, len, half) {
  const dx = 2 * aim.q - p[0], dy = 2 * aim.r - p[1], dd = dx * dx + dy * dy, L = len / (FT / 2), w = half / (FT / 2);
  if (!dd) return [];
  // The edge: the furthest corner of the box along the aim (times the aim's length, whole numbers).
  const edge = Math.max(...[2 * from.q0 - 1, 2 * from.q1 + 1].flatMap((x) => [2 * from.r0 - 1, 2 * from.r1 + 1].map((y) => (x - p[0]) * dx + (y - p[1]) * dy)));
  return around(p, L + w + Math.sqrt(edge * edge / dd) + 2).filter((h) => {
    const vx = 2 * h.q - p[0], vy = 2 * h.r - p[1], a = vx * dx + vy * dy - edge, c = vx * dy - vy * dx;
    return a > 0 && a * a <= L * L * dd && (c * c < w * w * dd || (c * c === w * w * dd && c > 0));
  });
}
// How far along the aim from `p` a square's centre is, in feet (for a tilted Line's height).
export function squareAlong(p, aim, h) {
  const dx = 2 * aim.q - p[0], dy = 2 * aim.r - p[1], dd = dx * dx + dy * dy;
  return dd ? ((2 * h.q - p[0]) * dx + (2 * h.r - p[1]) * dy) / Math.sqrt(dd) * (FT / 2) : 0;
}
// A Cube on squares stands square to the grid, `n` squares a side. `from` is the point (half-squares)
// it is thrown from and `toward` the direction it goes, [dx, dy]; `fits(b)` says whether a block
// (a box) may be used. Of the blocks that may, the one whose middle lies at the smallest angle to
// `toward` from `from` (the first, in a fixed order, if two tie). Null if none may.
export function squareBlock(from, toward, n, q0, q1, r0, r1, fits) {
  let best = null, bestA = 0, bestN = 1;
  const [tx, ty] = toward;
  for (let q = q0; q <= q1; q++) for (let r = r0; r <= r1; r++) {
    const b = { q0: q, r0: r, q1: q + n - 1, r1: r + n - 1 };
    if (!fits(b)) continue;
    const [mx, my] = boxMiddle(b), wx = mx - from[0], wy = my - from[1], ww = wx * wx + wy * wy, a = wx * tx + wy * ty;
    // The cosine of the angle is a / √(ww · |toward|²): compare a·|a| / ww exactly, as whole numbers.
    const better = !best || (ww === 0 ? bestN !== 0 : bestN === 0 ? false : a * Math.abs(a) * bestN > bestA * Math.abs(bestA) * ww);
    if (better) { best = b; bestA = a; bestN = ww; }
  }
  return best && sqRange({ q: best.q0, r: best.r0 }, n - 1).filter((h) => inBox(best, h));
}

// The grid a map is drawn on (Decision 1): squares if the map says so, hexes otherwise (every map
// before format 2 is a hex map). The linter refuses square maps until task S6, so no map in play
// is square yet.
export const gridOf = (map) => (map?.grid === 'square' ? SQUARE : HEX);

// Grid-free helpers, so that a caller needs one import.
export const { col, key, parse, reachable, pathTo } = H;
