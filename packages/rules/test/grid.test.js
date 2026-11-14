// The geometry interface (task S0 of docs/specs/square-grid.md): `HEX` returns exactly what the
// hex code returned before it existed, the same values in the same order, because replays depend on
// the order of neighbours, ranges and paths. "Today" here is hex.js itself, and copies of the
// constants and helpers as they stood in walls.js, sight.js, space.js, import-uvtt.js and the
// editor when the interface was introduced: once callers move onto `HEX`, comparing `HEX` with
// those modules would compare it with itself.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
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

test("gridOf gives HEX for every map but one that says it is square (S5: SQUARE exists)", () => {
  assert.equal(gridOf(newGame(1).map), HEX);
  assert.equal(gridOf(newMap()), HEX);
  assert.equal(gridOf({ grid: "square" }), GRID.SQUARE);
  assert.equal(gridOf(undefined), HEX);
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

// Task S2: every rules module takes its geometry from grid.js. Only grid.js wraps hex.js, and the
// valley generator (scenario.js) keeps it, since the valley is a hex map whatever comes later.
test("hex.js is imported only by grid.js and scenario.js", () => {
  const src = fileURLToPath(new URL("../src/", import.meta.url));
  const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : d.name.endsWith(".js") ? [join(dir, d.name)] : []));
  const importers = files(src)
    .filter((f) => /\b(?:import|export)\b[^;]*?\bfrom\s*['"][./]*(?:[^'"]*\/)?hex\.js['"]|\bimport\s*\(\s*['"][^'"]*\bhex\.js['"]/.test(readFileSync(f, "utf8")))
    .map((f) => relative(src, f).split("\\").join("/"))
    .sort();
  assert.deepEqual(importers, ["grid.js", "scenario.js"]);
});

// ---------- SQUARE (task S5) ----------
// Property tests on the square geometry, by the SRD's rules for a grid (reference/srd52/srd52-flow.txt:
// "Each square represents 5 feet" 1810; a diagonal costs as a side step 1817-1823; corners 1824-1825;
// ranges by the shortest route 1826-1829; Creature Size and Space 1893-1943). The linter refuses
// square maps until S6, so these test the geometry alone.
const SQ = GRID.SQUARE;
const near = (a, b) => Math.abs(a - b) < 1e-9;
const samePoint = (p, k) => near(p[0], k[0]) && near(p[1], k[1]);
const SQ_CELLS = SQ.range(O, 8);

test("SQUARE has every member HEX has, in the same order, and is never what a playable map gets", async () => {
  assert.deepEqual(Object.keys(SQ), Object.keys(HEX));
  for (const k of Object.keys(HEX)) assert.equal(typeof SQ[k], typeof HEX[k], k);
  assert.ok(Object.isFrozen(SQ));
  assert.equal(SQ.kind, "square");
  assert.deepEqual(SQ.word, { one: "square", many: "squares" });
  assert.equal(SQ.EDGES, 4);
  // E, N, W, S (across a side), then NE, NW, SW, SE.
  assert.deepEqual(SQ.DIRS, [[1, 0], [0, -1], [-1, 0], [0, 1], [1, -1], [-1, -1], [-1, 1], [1, 1]]);
  for (const k of ["col", "key", "parse", "reachable", "pathTo"]) assert.equal(SQ[k], H[k], k);
  // gridOf follows the map: the valley and the stock maps are hex maps. Since task S6 the linter
  // no longer refuses a square map (square-moving.test.js plays one).
  const { lintMap } = await import("../src/map.js");
  const { STOCK_MAPS } = await import("../src/content/maps/index.js");
  for (const m of [newGame(1).map, ...STOCK_MAPS.map((x) => x.map)]) {
    assert.equal(gridOf(m), HEX, m.id);
    assert.ok(!lintMap({ ...structuredClone(m), grid: "square" }).includes("Square maps come in a later version."), m.id);
  }
  assert.equal(gridOf({ grid: "hex" }), HEX);
  assert.equal(gridOf({}), HEX);
  assert.equal(gridOf(null), HEX);
});

test("SQUARE neighbors and dist: 8 neighbours, and dist is the number of steps between them by breadth-first search", () => {
  for (const h of SQ_CELLS) {
    const ns = SQ.neighbors(h);
    assert.equal(ns.length, 8);
    assert.equal(new Set(ns.map(H.col)).size, 8);
    ns.forEach((n, i) => {
      assert.deepEqual(n, { q: h.q + SQ.DIRS[i][0], r: h.r + SQ.DIRS[i][1] });
      assert.equal(SQ.dist(h, n), 1);
      assert.equal(i < SQ.EDGES, n.q === h.q || n.r === h.r, "the first EDGES cross a side");
    });
  }
  // Breadth-first over neighbours, from several starts, out to 10 steps.
  for (const start of [O, { q: 3, r: -2 }, { q: -5, r: 7 }]) {
    const steps = new Map([[H.col(start), 0]]);
    let frontier = [start];
    for (let d = 1; d <= 10; d++) {
      const next = [];
      for (const h of frontier) for (const n of SQ.neighbors(h)) if (!steps.has(H.col(n))) { steps.set(H.col(n), d); next.push(n); }
      frontier = next;
    }
    for (const [k, d] of steps) assert.equal(SQ.dist(start, H.parse(k)), d, k);
    assert.equal(steps.size, 21 * 21);
  }
  // A diagonal costs a step, as a side does: 6 squares diagonally is 6, as the SRD's Speed 30 is 6 squares.
  assert.equal(SQ.dist(O, { q: 6, r: 6 }), 6);
  assert.equal(SQ.dist(O, { q: -6, r: 2 }), 6);
  for (const a of SQ.range(O, 3)) for (const b of SQ_CELLS) assert.equal(SQ.dist(a, b), SQ.dist(b, a));
});

test("SQUARE range(c, n) is exactly the cells with dist <= n, (2n + 1)² of them, in a fixed order", () => {
  for (const c of [O, { q: 4, r: -3 }]) for (let n = 0; n <= 8; n++) {
    const got = SQ.range(c, n);
    assert.equal(got.length, (2 * n + 1) ** 2);
    assert.equal(new Set(got.map(H.col)).size, got.length);
    for (const h of got) assert.ok(SQ.dist(c, h) <= n);
    for (const h of SQ.range(c, n + 2)) assert.equal(got.some((g) => g.q === h.q && g.r === h.r), SQ.dist(c, h) <= n);
  }
  // The order: column by column from the west, north to south in each.
  assert.deepEqual(SQ.range(O, 1), [{ q: -1, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: -1 }, { q: 0, r: 0 }, { q: 0, r: 1 }, { q: 1, r: -1 }, { q: 1, r: 0 }, { q: 1, r: 1 }]);
});

test("SQUARE center and cell: centres are 5 feet apart, cell(center(h)) is h, and every point of a square is in it", () => {
  for (const h of SQ_CELLS) {
    const c = SQ.center(h);
    assert.deepEqual(c, [5 * h.q, 5 * h.r]);
    assert.deepEqual(SQ.cell(...c), { q: h.q, r: h.r });         // strictly: no -0
    for (const [dx, dy] of [[2.4, 0], [-2.4, 2.4], [0, -2.4], [1.1, -2.2], [-2.49, -2.49]]) assert.deepEqual(SQ.cell(c[0] + dx, c[1] + dy), { q: h.q, r: h.r });
    for (const n of SQ.neighbors(h)) {
      const d = Math.hypot(SQ.center(n)[0] - c[0], SQ.center(n)[1] - c[1]);
      assert.ok(near(d, SQ.edgeOf(h, n) >= 0 ? 5 : 5 * Math.SQRT2));
    }
    // Drawing units: the centre times the one scale both grids use (√3/5 units a foot), and back.
    const w = SQ.toWorld(h);
    assert.ok(near(w.x, c[0] * Math.sqrt(3) / 5) && near(w.z, c[1] * Math.sqrt(3) / 5));
    assert.deepEqual(SQ.fromWorld(w.x, w.z), { q: h.q, r: h.r });
    assert.deepEqual(SQ.fromWorld(w.x + 0.8, w.z - 0.8), { q: h.q, r: h.r });
    assert.deepEqual(SQ.fromWorld(...Object.values(SQ.toWorld(h, 5 / Math.sqrt(3))), 5 / Math.sqrt(3)), { q: h.q, r: h.r });
    assert.ok(near(SQ.toWorld(h, 5 / Math.sqrt(3)).x, c[0]));
  }
  // Hex neighbours are √3 drawing units apart; square side neighbours too, so the camera and models fit both.
  assert.ok(near(SQ.toWorld({ q: 1, r: 0 }).x, HEX.toWorld({ q: 1, r: 0 }).x));
});

test("SQUARE corners are the four at ±2.5 feet, in order around; cornerReach is 5/√2", () => {
  assert.equal(SQ.cornerReach, 5 / Math.SQRT2);
  for (const h of SQ_CELLS) {
    const [x, y] = SQ.center(h), k = SQ.corners(h);
    assert.deepEqual(k, [[x + 2.5, y + 2.5], [x - 2.5, y + 2.5], [x - 2.5, y - 2.5], [x + 2.5, y - 2.5]]);
    // In order around: each corner to the next is a side, 5 feet, along one axis.
    for (let i = 0; i < 4; i++) {
      const a = k[i], b = k[(i + 1) % 4];
      assert.ok(near(Math.hypot(a[0] - b[0], a[1] - b[1]), 5));
      assert.ok(a[0] === b[0] || a[1] === b[1]);
      assert.ok(near(Math.hypot(a[0] - x, a[1] - y), SQ.cornerReach));
    }
    // A little inside the true corner, as sight.js takes them on hexes.
    for (const [p, q] of SQ.corners(h, 0.9).map((p, i) => [p, k[i]])) assert.ok(near(p[0] - x, 0.9 * (q[0] - x)) && near(p[1] - y, 0.9 * (q[1] - y)));
  }
});

test("SQUARE edgeSegment is the side two squares share, edgeOf its index, -1 for a diagonal", () => {
  for (const h of SQ_CELLS) for (let e = 0; e < SQ.EDGES; e++) {
    const n = { q: h.q + SQ.DIRS[e][0], r: h.r + SQ.DIRS[e][1] }, seg = SQ.edgeSegment(h, e);
    assert.equal(seg.length, 2);
    assert.ok(near(Math.hypot(seg[0][0] - seg[1][0], seg[0][1] - seg[1][1]), 5));
    // Both ends are corners of both squares, and the side's middle is halfway between the centres.
    for (const p of seg) { assert.ok(SQ.corners(h).some((k) => samePoint(p, k))); assert.ok(SQ.corners(n).some((k) => samePoint(p, k))); }
    const mid = [(seg[0][0] + seg[1][0]) / 2, (seg[0][1] + seg[1][1]) / 2], c = SQ.center(h), d = SQ.center(n);
    assert.ok(samePoint(mid, [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2]));
    // Seen from the other square it is the same side.
    const back = SQ.edgeSegment(n, SQ.edgeOf(n, h));
    assert.ok(seg.every((p) => back.some((k) => samePoint(p, k))));
    assert.equal(SQ.edgeOf(h, n), e);
    assert.equal(SQ.edgeOf(n, h), (e + 2) % 4);
  }
  for (const h of SQ.range(O, 2)) for (const b of SQ_CELLS) {
    const i = SQ.DIRS.findIndex(([dq, dr]) => h.q + dq === b.q && h.r + dr === b.r);
    assert.equal(SQ.edgeOf(h, b), i >= 0 && i < 4 ? i : -1);
  }
  // The east side of the origin square.
  assert.deepEqual(SQ.edgeSegment(O, 0), [[2.5, 2.5], [2.5, -2.5]]);
});

test("SQUARE beside: a diagonal step passes between the two squares beside it; a side step between none", () => {
  for (const a of SQ.range(O, 3)) for (const b of SQ.range(O, 5)) {
    const got = SQ.beside(a, b), dq = b.q - a.q, dr = b.r - a.r;
    if (Math.abs(dq) === 1 && Math.abs(dr) === 1) {
      assert.deepEqual(got, [{ q: a.q + dq, r: a.r }, { q: a.q, r: a.r + dr }]);
      // Each is a side neighbour of both ends, and the two meet only at the corner the step crosses.
      for (const c of got) { assert.ok(SQ.edgeOf(a, c) >= 0); assert.ok(SQ.edgeOf(b, c) >= 0); }
      const corner = [(SQ.center(a)[0] + SQ.center(b)[0]) / 2, (SQ.center(a)[1] + SQ.center(b)[1]) / 2];
      for (const c of [a, b, ...got]) assert.ok(SQ.corners(c).some((k) => samePoint(k, corner)));
    } else assert.deepEqual(got, []);
  }
});

test("SQUARE footprint: 1, 1, 1, 4, 9, 16 squares (2 by 2, 3 by 3, 4 by 4) from the north-west square", () => {
  assert.deepEqual(Object.keys(SIZES).map((s) => SQ.footprint(s).length), [1, 1, 1, 4, 9, 16]);
  for (const size of Object.keys(SIZES)) {
    const f = SQ.footprint(size), n = Math.sqrt(f.length);
    assert.deepEqual(f[0], [0, 0], size);
    assert.equal(new Set(f.map(String)).size, f.length);
    for (const [dq, dr] of f) assert.ok(dq >= 0 && dq < n && dr >= 0 && dr < n, size);
  }
  assert.deepEqual(SQ.footprint("large"), [[0, 0], [1, 0], [0, 1], [1, 1]]);
  assert.deepEqual(SQ.footprint("nonsense"), SQ.footprint("medium"));
  assert.deepEqual(SQ.footprint(undefined), [[0, 0]]);
});

test("SQUARE cone: the SRD's cone, as wide as it is far; 15 ft is 7 squares aimed along a side and 6 diagonally", () => {
  const counts = (n) => SQ.DIRS.map(([dq, dr]) => SQ.cone(O, { q: dq, r: dr }, n).length);
  assert.deepEqual(counts(3), [7, 7, 7, 7, 6, 6, 6, 6]);
  assert.deepEqual(counts(6), [24, 24, 24, 24, 20, 20, 20, 20]);
  assert.deepEqual(counts(12), [84, 84, 84, 84, 72, 72, 72, 72]);
  const col = (cells) => cells.map(H.col).sort();
  assert.deepEqual(col(SQ.cone(O, { q: 1, r: 0 }, 3)), ["1,0", "2,-1", "2,0", "2,1", "3,-1", "3,0", "3,1"].sort());
  assert.deepEqual(col(SQ.cone(O, { q: 1, r: 1 }, 3)), ["1,1", "1,2", "2,1", "2,2", "1,3", "3,1"].sort());
  // Aimed at a far square on the same line, the same cone; the origin's square is never in it.
  assert.deepEqual(SQ.cone(O, { q: 9, r: 0 }, 3), SQ.cone(O, { q: 1, r: 0 }, 3));
  for (const aim of SQ_CELLS) for (const c of SQ.cone({ q: 1, r: 1 }, aim, 4)) assert.ok(!(c.q === 1 && c.r === 1));
  assert.deepEqual(SQ.cone(O, O, 3), []);
  // Each square in it has its centre in the shape: along the aim at most the length, across at most half that.
  for (const aim of SQ.range(O, 4)) for (const c of SQ.cone(O, aim, 6)) {
    const t = SQ.along(O, aim, c);
    assert.ok(t > 0 && t <= 30 + 1e-6);
  }
});

test("SQUARE band and along work in feet from square centres", () => {
  const E = { q: 1, r: 0 }, SE = { q: 1, r: 1 };
  for (const h of SQ_CELLS) {
    assert.ok(near(SQ.along(O, E, h), 5 * h.q));
    assert.ok(near(SQ.along(O, SE, h), (5 * h.q + 5 * h.r) / Math.SQRT2));
  }
  assert.equal(SQ.along(O, O, { q: 3, r: 3 }), 0);
  // A 5-foot-wide line east is the row it runs along, one square wide.
  assert.deepEqual(SQ.band(O, E, 0, 30, 2.5), [1, 2, 3, 4, 5, 6].map((q) => ({ q, r: 0 })));
  // A 15-foot cube in front is 3 by 3.
  assert.deepEqual(SQ.band(O, E, 0, 15, 7.5).map(H.col).sort(), ["1,-1", "1,0", "1,1", "2,-1", "2,0", "2,1", "3,-1", "3,0", "3,1"].sort());
  assert.deepEqual(SQ.band(O, O, 0, 15, 7.5), []);
  for (const h of SQ.band({ q: 2, r: -1 }, { q: 5, r: 3 }, 0, 40, 2.5)) assert.ok(SQ.along({ q: 2, r: -1 }, { q: 5, r: 3 }, h) <= 40 + 1e-6);
});

test("SQUARE straight runs along any of the eight directions, and cellsIn is every centre in a rectangle, row by row", () => {
  for (const a of SQ.range(O, 2)) for (const b of SQ_CELLS) {
    const dq = b.q - a.q, dr = b.r - a.r, run = SQ.straight(a, b);
    if (!(dq === 0 || dr === 0 || Math.abs(dq) === Math.abs(dr))) { assert.equal(run, null); continue; }
    assert.equal(run.length, SQ.dist(a, b) + 1);
    assert.deepEqual(run[0], { q: a.q, r: a.r });
    assert.deepEqual(run.at(-1), { q: b.q, r: b.r });
    for (let i = 1; i < run.length; i++) assert.equal(SQ.dist(run[i - 1], run[i]), 1);
  }
  for (const [x0, y0, x1, y1] of [[0, 0, 50, 40], [-12.5, 7, 20.5, 28], [3, -9, 8, -4], [0, 0, 0, 0], [101.3, 47.9, 221.3, 122.9]]) {
    const got = SQ.cellsIn(x0, y0, x1, y1), want = [];
    for (let r = -50; r <= 50; r++) for (let q = -50; q <= 50; q++) if (5 * q >= x0 && 5 * q <= x1 && 5 * r >= y0 && 5 * r <= y1) want.push({ q, r });
    assert.deepEqual(got, want);
  }
  assert.equal(SQ.cellsIn(0, 0, 50, 40).length, 11 * 9);
});
