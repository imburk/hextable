// The geometry interface (task S0 of docs/specs/square-grid.md): `HEX` returns exactly what the
// hex code returned before it existed, the same values in the same order, because replays depend on
// the order of neighbours, ranges and paths. "Today" here is hex.js itself, and copies of the
// constants and helpers as they stood in walls.js, sight.js, space.js, import-uvtt.js and the
// editor when the interface was introduced: once callers move onto `HEX`, comparing `HEX` with
// those modules would compare it with itself.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as H from "../src/hex.js";
import * as GRID from "../src/grid.js";
import { HEX, gridOf } from "../src/grid.js";
import { SIZES } from "../src/content/sizes.js";
import { footprint, shapeOf } from "../src/space.js";
import { center as wallsCenter, edgeSegment as wallsEdgeSegment } from "../src/walls.js";
import { newGame } from "../src/scenario.js";
import { newMap } from "../src/map.js";

// ---------- today's code, copied ----------
const FT = 5, S3 = Math.sqrt(3);
const oldCenter = (h) => [FT * (h.q + h.r / 2), FT * (S3 / 2) * h.r];                     // walls.js
function oldEdgeSegment(at, edge) {                                                          // walls.js
  const a = oldCenter(at), [dq, dr] = H.DIRS[edge], b = oldCenter({ q: at.q + dq, r: at.r + dr });
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, half = FT / (2 * S3);
  const px = -(b[1] - a[1]) / FT, py = (b[0] - a[0]) / FT;
  return [[mx + px * half, my + py * half], [mx - px * half, my - py * half]];
}
const CORNER = (FT / S3) * 0.9;                                                              // sight.js
const CORNERS = [0, 1, 2, 3, 4, 5].map((i) => { const a = (Math.PI / 180) * (30 + 60 * i); return [CORNER * Math.cos(a), CORNER * Math.sin(a)]; });
const TRIANGLE = [[0, 0], [1, 0], [0, 1]];                                                   // space.js
const SHAPES = { 1: [[0, 0]], 3: TRIANGLE, 7: [[0, 0], ...H.DIRS] };
SHAPES[12] = [...new Map(TRIANGLE.flatMap(([q, r]) => [[q, r], ...H.DIRS.map(([dq, dr]) => [q + dq, r + dr])]).map((o) => [`${o}`, o])).values()];
const oldEdgeOf = (a, b) => H.DIRS.findIndex(([dq, dr]) => a.q + dq === b.q && a.r + dr === b.r);   // editor.js
const SIZE = FT / S3;                                                                        // import-uvtt.js, view.js
function oldTiles(x0, y0, x1, y1, pad) {                                                     // import-uvtt.js
  const tiles = [];
  const rMin = Math.floor((y0 - pad) / (FT * S3 / 2)) - 1, rMax = Math.ceil((y1 + pad) / (FT * S3 / 2)) + 1;
  for (let r = rMin; r <= rMax; r++) {
    const qMin = Math.floor((x0 - pad) / FT - r / 2) - 1, qMax = Math.ceil((x1 + pad) / FT - r / 2) + 1;
    for (let q = qMin; q <= qMax; q++) {
      const cx = FT * (q + r / 2), cy = FT * (S3 / 2) * r;
      if (cx >= x0 - pad && cx <= x1 + pad && cy >= y0 - pad && cy <= y1 + pad) tiles.push({ q, r });
    }
  }
  return tiles;
}

const O = { q: 0, r: 0 };
const CELLS = H.range(O, 8);
const NEAR = H.range(O, 3);

test("gridOf gives HEX for every map, and there is no SQUARE yet", () => {
  assert.equal(gridOf(newGame(1).map), HEX);
  assert.equal(gridOf(newMap()), HEX);
  assert.equal(gridOf({ grid: "square" }), HEX);
  assert.equal(gridOf(undefined), HEX);
  assert.equal(GRID.SQUARE, undefined);
  assert.equal(HEX.kind, "hex");
  assert.deepEqual(HEX.word, { one: "hex", many: "hexes" });
  assert.equal(HEX.EDGES, 6);
  assert.ok(Object.isFrozen(HEX));
});

test("HEX's hex.js members and the grid-free helpers are hex.js's own functions", () => {
  for (const k of ["DIRS", "neighbors", "dist", "range", "toWorld", "fromWorld", "cone", "band", "along", "col", "key", "parse", "reachable", "pathTo"])
    assert.equal(HEX[k], H[k], k);
  for (const k of ["col", "key", "parse", "reachable", "pathTo"]) assert.equal(GRID[k], H[k], k);
  assert.deepEqual(HEX.DIRS, [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]);
});

test("dist, neighbors and range over range({0,0}, 8): the same values in the same order", () => {
  assert.equal(CELLS.length, 217);
  for (const a of CELLS) {
    assert.deepEqual(HEX.neighbors(a), H.neighbors(a));
    for (const b of CELLS) assert.equal(HEX.dist(a, b), H.dist(a, b));
  }
  for (const c of CELLS) for (let n = 0; n <= 8; n++) assert.deepEqual(HEX.range(c, n), H.range(c, n));
});

test("center, cell, toWorld and fromWorld over range({0,0}, 8)", () => {
  for (const h of CELLS) {
    const c = HEX.center(h);
    assert.deepEqual(c, oldCenter(h));
    assert.deepEqual(c, wallsCenter(h));
    assert.deepEqual(HEX.cell(...c), H.fromWorld(c[0], c[1], SIZE));
    const back = HEX.cell(...c);            // hex.js may give -0 for 0, as it always has
    assert.ok(back.q === h.q && back.r === h.r);
    const w = HEX.toWorld(h);
    assert.deepEqual(w, H.toWorld(h));
    assert.deepEqual(HEX.fromWorld(w.x, w.z), H.fromWorld(w.x, w.z));
  }
  // Points between centres land where hex.js puts them.
  for (let x = -40; x <= 40; x += 0.7) for (let y = -40; y <= 40; y += 0.9) assert.deepEqual(HEX.cell(x, y), H.fromWorld(x, y, SIZE));
});

test("corners, cornerReach and edgeSegment over range({0,0}, 8)", () => {
  assert.equal(HEX.cornerReach, 5 / Math.sqrt(3));
  for (const h of CELLS) {
    const c = oldCenter(h);
    assert.deepEqual(HEX.corners(h, 0.9), CORNERS.map(([dx, dy]) => [c[0] + dx, c[1] + dy]));
    const full = HEX.corners(h);
    assert.equal(full.length, 6);
    for (const p of full) assert.ok(Math.abs(Math.hypot(p[0] - c[0], p[1] - c[1]) - HEX.cornerReach) < 1e-9);
    for (let e = 0; e < 6; e++) {
      assert.deepEqual(HEX.edgeSegment(h, e), oldEdgeSegment(h, e));
      assert.deepEqual(HEX.edgeSegment(h, e), wallsEdgeSegment(h, e));
      // The side's two ends are two of the cell's corners.
      for (const p of HEX.edgeSegment(h, e)) assert.ok(full.some((k) => Math.hypot(k[0] - p[0], k[1] - p[1]) < 1e-9));
    }
  }
});

test("edgeOf, beside and straight over every pair in range({0,0}, 8)", () => {
  for (const a of CELLS) for (const b of CELLS) {
    assert.equal(HEX.edgeOf(a, b), oldEdgeOf(a, b));
    assert.deepEqual(HEX.beside(a, b), []);
    const dq = b.q - a.q, dr = b.r - a.r, run = HEX.straight(a, b);
    if (!(dq === 0 || dr === 0 || dq + dr === 0)) { assert.equal(run, null); continue; }
    // The editor's stairs: the cells between the ends, i = 1 to n - 1.
    const n = H.dist(a, b), between = [];
    for (let i = 1; i < n; i++) between.push({ q: a.q + Math.sign(dq) * i, r: a.r + Math.sign(dr) * i });
    assert.equal(run.length, n + 1);
    assert.deepEqual(run[0], { q: a.q, r: a.r });
    assert.deepEqual(run.at(-1), { q: b.q, r: b.r });
    assert.deepEqual(run.slice(1, -1), between);
  }
});

test("footprint: today's 1, 3, 7 and 12 shapes, the same arrays space.js used", () => {
  for (const size of [...Object.keys(SIZES), "nonsense", undefined]) {
    const want = SHAPES[(SIZES[size] ?? SIZES.medium).hexes];
    assert.deepEqual(HEX.footprint(size), want, String(size));
    assert.deepEqual(shapeOf({ size }), want, String(size));
    for (const h of NEAR) assert.deepEqual(footprint({ size, pos: h }), want.map(([dq, dr]) => ({ q: h.q + dq, r: h.r + dr, z: 0 })));
  }
  assert.deepEqual(Object.keys(SIZES).map((s) => HEX.footprint(s).length), [1, 1, 1, 3, 7, 12]);
});

test("cone, band and along over pairs in range({0,0}, 8)", () => {
  for (const o of NEAR) for (const aim of CELLS) {
    for (let n = 1; n <= 4; n++) assert.deepEqual(HEX.cone(o, aim, n), H.cone(o, aim, n));
    assert.equal(HEX.along(o, aim, o), H.along(o, aim, o));
    for (const h of NEAR) assert.equal(HEX.along(o, aim, h), H.along(o, aim, h));
    assert.deepEqual(HEX.band(o, aim, 2.5, 32.5, 2.5), H.band(o, aim, 2.5, 32.5, 2.5));
    assert.deepEqual(HEX.band(o, aim, -2.5, 12.5, 7.5), H.band(o, aim, -2.5, 12.5, 7.5));
  }
});

test("cellsIn is the UVTT importer's tiling, in the same order", () => {
  for (const [x0, y0, w, h] of [[0, 0, 50, 40], [-12.5, 7, 33, 21], [3, -9, 5, 5], [0, 0, 0, 0], [101.3, 47.9, 120, 75]]) {
    const pad = FT / 2;
    assert.deepEqual(HEX.cellsIn(x0 - pad, y0 - pad, x0 + w + pad, y0 + h + pad), oldTiles(x0, y0, x0 + w, y0 + h, pad));
    assert.deepEqual(HEX.cellsIn(x0, y0, x0 + w, y0 + h), oldTiles(x0, y0, x0 + w, y0 + h, 0));
  }
});
