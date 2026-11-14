// The Universal VTT importer (task M12 of docs/specs/maps-and-objects.md).
// The fixture is written by hand to the field list in Arkenforge's description of the format; it was not exported by a real tool.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { apply, moveOptions } from "../src/engine.js";
import * as H from "../src/hex.js";
import { importUvtt } from "../src/import-uvtt.js";
import { MAP_LIMITS, lintMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";
import { center } from "../src/walls.js";

const DM = { role: "dm", userId: "dm" };
const fixture = () => JSON.parse(readFileSync(new URL("./fixtures/room.dd2vtt", import.meta.url), "utf8"));
const inside = (h) => { const [x, y] = center(h); return x < 40 && x > 10 && y > 5 && y < 25; };
const reach = (s, id) => [...moveOptions(s, s.entities[id]).values()].map((n) => n.h);

function play(json) {
  const { map } = importUvtt(json, { grid: "hex" });
  const s = newGame(4);
  const r = apply(s, { type: "loadMap", map }, DM);
  assert.ok(r.ok, r.error);
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  const start = H.fromWorld(25, 15, 5 / Math.sqrt(3));
  assert.ok(apply(s, { type: "place", actor: "fighter", to: start }, DM).ok);
  return s;
}

test("the imported map passes the linter and the engine loads it", () => {
  const { map, notes, image } = importUvtt(fixture(), { grid: "hex" });
  assert.deepEqual(lintMap(map), []);
  assert.ok(Array.isArray(notes) && notes.every((n) => typeof n === "string"));
  assert.ok(image.url.startsWith("data:image/png;base64,"));
  assert.deepEqual(image.size, [50, 30]);
  assert.equal(JSON.stringify(map).includes("iVBOR"), false, "the image must not be in the map document");
  const s = newGame(4);
  assert.ok(apply(s, { type: "loadMap", map }, DM).ok);
});

test("walls are in feet: one square is five feet", () => {
  const { map } = importUvtt(fixture(), { grid: "hex" });
  const w = map.walls.filter((x) => x.kind === "wall");
  assert.equal(w.length, 5);
  assert.deepEqual(w[0], { id: "w1", level: "ground", a: [40, 10], b: [40, 5], kind: "wall" });
  assert.deepEqual(w[1].b, [10, 5]);
  const rails = map.walls.filter((x) => x.kind === "rail");
  assert.deepEqual(rails.map((x) => [x.a, x.b]), [[[20, 15], [25, 15]]]);
});

test("a portal becomes a door in its state, on a hex that exists", () => {
  const { map } = importUvtt(fixture(), { grid: "hex" });
  assert.equal(map.objects.length, 1);
  const [d] = map.objects;
  assert.equal(d.def, "door-wooden");
  assert.equal(d.state, "closed");
  assert.deepEqual(d.seg, { a: [40, 10], b: [40, 20] });
  assert.ok(map.levels[0].tiles[H.col(d.at)]);
  assert.ok(Math.hypot(center(d.at)[0] - 40, center(d.at)[1] - 15) <= 5);
  const j = fixture(); j.portals[0].closed = false;
  assert.equal(importUvtt(j, { grid: "hex" }).map.objects[0].state, "open");
});

test("nobody walks through the imported wall; the open door lets them out", () => {
  const shut = play(fixture());
  const a = reach(shut, "fighter");
  assert.ok(a.length > 5 && a.every(inside), "something outside the room was in reach");
  const j = fixture(); j.portals[0].closed = false;
  const open = play(j);
  const b = reach(open, "fighter");
  assert.ok(b.some((h) => center(h)[0] > 40), "the open door let nobody out");
  assert.ok(b.length > a.length, "the open door should add hexes to what is in reach");
});

test("notes say what was read and what was left out", () => {
  const { notes } = importUvtt(fixture(), { grid: "hex" });
  const all = notes.join(" ");
  assert.match(all, /5 wall segments/);
  assert.match(all, /1 door/);
  assert.match(all, /1 light/);
  assert.match(all, /never line up/);
});

test("too many walls are merged along straight runs, and reported if still too many", () => {
  const j = fixture();
  j.objects_line_of_sight = [];
  const line = []; for (let i = 0; i <= MAP_LIMITS.walls + 10; i++) line.push({ x: i * 0.01, y: 1 });
  j.line_of_sight = [line];
  const r = importUvtt(j, { grid: "hex" });
  assert.equal(r.map.walls.length, 1);
  assert.deepEqual(lintMap(r.map), []);
  assert.match(r.notes.join(" "), /joined/);
  const zig = []; for (let i = 0; i <= MAP_LIMITS.walls + 10; i++) zig.push({ x: i * 0.01, y: i % 2 });
  j.line_of_sight = [zig];
  const z = importUvtt(j, { grid: "hex" });
  assert.match(z.notes.join(" "), /still more than the limit/);
});

test("something that is not a UVTT file is refused with a clear message", () => {
  assert.throws(() => importUvtt("{nope"), /not valid JSON/);
  assert.throws(() => importUvtt([1, 2]), /expected a JSON object/);
  assert.throws(() => importUvtt({ name: "a map" }), /no "resolution" section/);
  assert.throws(() => importUvtt({ resolution: { map_size: { x: 0, y: 4 } }, line_of_sight: [] }), /map_size/);
  const j = fixture(); delete j.line_of_sight;
  assert.throws(() => importUvtt(j), /no "line_of_sight" list/);
});

// ---------- squares (task S11 of docs/specs/square-grid.md) ----------
// The fixture square-room.dd2vtt is made by hand: 12 by 8 squares at 28 pixels a square, a real 336 by 224 PNG with its
// grid and walls drawn on, a door on one square side (shut), one on another (open), one two squares wide, and four lights.
import { SQUARE } from "../src/grid.js";
import { inSight } from "../src/sight.js";
import { col } from "../src/hex.js";

const sqText = () => readFileSync(new URL("./fixtures/square-room.dd2vtt", import.meta.url), "utf8");
const sqFile = () => JSON.parse(sqText());
const SQ = { grid: "square" };
const corner = (v) => Math.abs((v - 2.5) / 5 - Math.round((v - 2.5) / 5)) < 1e-9;       // a square's corner or side runs along 2.5 + 5k feet

function playSq(json, opts = SQ) {
  const { map } = importUvtt(json, opts);
  const s = newGame(4);
  const r = apply(s, { type: "loadMap", map }, DM);
  assert.ok(r.ok, r.error);
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  assert.ok(apply(s, { type: "place", actor: "fighter", to: { q: 3, r: 3 } }, DM).ok);
  return s;
}

test("squares: the map is a square map the size of the file, floored under the picture, and loads", () => {
  const { map, image, notes } = importUvtt(sqText(), SQ);
  assert.equal(map.grid, "square");
  assert.equal(map.cellFeet, 5);
  assert.deepEqual(lintMap(map), []);
  assert.equal(Object.keys(map.levels[0].tiles).length, 12 * 8);
  for (let q = 0; q < 12; q++) for (let r = 0; r < 8; r++) assert.ok(map.levels[0].tiles[`${q},${r}`], `${q},${r}`);
  assert.deepEqual(image.size, [60, 40]);
  assert.deepEqual(image.origin, [-2.5, -2.5]);
  assert.equal(image.pixelsPerGrid, 28);
  assert.equal(JSON.stringify(map).includes("iVBOR"), false);
  assert.ok(apply(newGame(4), { type: "loadMap", map }, DM).ok);
  assert.doesNotMatch(notes.join(" "), /never line up|hexes/);
});

test("squares: every wall end is on a corner or side of a square, and the picture's corner is a corner too", () => {
  const { map, image } = importUvtt(sqFile(), SQ);
  assert.equal(map.walls.filter((w) => w.kind === "wall").length, 8);
  for (const w of map.walls) for (const p of [w.a, w.b]) assert.ok(corner(p[0]) && corner(p[1]), `${w.id} ${p}`);
  assert.deepEqual(map.walls[0], { id: "w1", level: "ground", a: [37.5, 2.5], b: [2.5, 2.5], kind: "wall" });
  assert.ok(corner(image.origin[0]) && corner(image.origin[1]));
  assert.equal(image.size[0] / 12, 5);
});

test("squares: a door that is exactly one square side is an edge door, any other stays on its line", () => {
  const { map } = importUvtt(sqFile(), SQ);
  const [a, b, c] = map.objects.filter((o) => o.def === "door-wooden");
  assert.deepEqual(a, { id: "d1", def: "door-wooden", level: "ground", at: { q: 5, r: 3 }, edge: 0, state: "closed" });
  assert.deepEqual(b, { id: "d2", def: "door-wooden", level: "ground", at: { q: 8, r: 0 }, edge: 3, state: "open" });
  assert.equal(c.edge, undefined);
  assert.deepEqual(c.seg, { a: [12.5, 32.5], b: [22.5, 32.5] });
  assert.deepEqual(c.at, { q: 4, r: 7 });
  for (const o of map.objects) assert.ok(map.levels[0].tiles[col(o.at)]);
  // the side the door stands on is where the file's gap in the wall is: x = 6 squares, y from 3 to 4
  assert.deepEqual(SQUARE.edgeSegment(a.at, a.edge).sort(), [[27.5, 12.5], [27.5, 17.5]]);
});

test("squares: a door beside the picture's edge, or off by a hair, still stands on a tile of the floor", () => {
  const j = sqFile();
  j.portals = [{ bounds: [{ x: 0.0004, y: 2 }, { x: 0.0004, y: 3 }], closed: true }, { bounds: [{ x: 12, y: 2 }, { x: 12, y: 3 }], closed: true }, { bounds: [{ x: 20, y: 2 }, { x: 20, y: 3 }], closed: true }];
  const { map, notes } = importUvtt(j, SQ);
  const doors = map.objects.filter((o) => o.def === "door-wooden");
  assert.deepEqual(doors.map((o) => [o.at.q, o.at.r, o.edge]), [[0, 2, 2], [11, 2, 0], [19, 2, 0]]);
  for (const o of doors) assert.ok(map.levels[0].tiles[col(o.at)]);
  assert.deepEqual(lintMap(map), []);
  assert.match(notes.join(" "), /Added 1 square/);
});

test("squares: lights become braziers in the square they stand in, one to a square; the rest is said to be left out", () => {
  const { map, notes } = importUvtt(sqFile(), SQ);
  const l = map.objects.filter((o) => o.def === "brazier");
  assert.deepEqual(l.map((o) => [o.at.q, o.at.r, o.state]), [[3, 2, "lit"], [9, 5, "lit"]]);
  const all = notes.join(" ");
  assert.match(all, /2 lights became lit braziers/);
  assert.match(all, /Left out 2 lights: 1 with no usable position or outside the floor and 1 in a square that already had one/);
  assert.match(all, /3 doors \(1 open; 2 on a square side, 1 on a line\)/);
  assert.match(all, /1 segment from objects_line_of_sight/);
  assert.match(all, /coincide/);
});

test("squares: a wall stops walking and sight, and the doors do what the file says", () => {
  const shut = playSq(sqFile());
  const reachSq = (s) => [...moveOptions(s, s.entities.fighter).values()].map((n) => n.h);
  const a = reachSq(shut);
  assert.ok(a.length > 10);
  assert.ok(a.every((h) => h.q >= 1 && h.q <= 5 && h.r >= 1 && h.r <= 6), "something outside the left room was in reach");
  const map = shut.map, here = { q: 3, r: 3, z: 0 };
  assert.equal(inSight(map, here, { q: 8, r: 5, z: 0 }), false, "sight passed a wall");
  assert.equal(inSight(map, here, { q: 5, r: 4, z: 0 }), true);
  const j = sqFile(); j.portals[0].closed = false;
  const open = playSq(j), b = reachSq(open);
  assert.ok(b.some((h) => h.q >= 6), "the open door let nobody out");
  assert.ok(b.length > a.length);
  assert.equal(inSight(open.map, here, { q: 8, r: 3, z: 0 }), true, "an open door should let sight through");
});

test("squares: no option gives squares, the hex option gives the hex import", () => {
  const hx = importUvtt(fixture(), { grid: "hex" });
  assert.equal(hx.map.grid, "hex");
  assert.deepEqual(hx.map.walls[0], { id: "w1", level: "ground", a: [40, 10], b: [40, 5], kind: "wall" });
  assert.match(hx.notes.join(" "), /never line up/);
  const sq = importUvtt(fixture());
  assert.equal(sq.map.grid, "square");
  assert.equal(JSON.stringify(sq), JSON.stringify(importUvtt(fixture(), SQ)));
  assert.deepEqual(sq.map.walls[0].a, [37.5, 7.5]);
  assert.deepEqual(lintMap(sq.map), []);
  assert.equal(importUvtt(fixture(), { grid: "nonsense" }).map.grid, "square");
  assert.equal(importUvtt(fixture(), null).map.grid, "square");
});

test("squares: a picture that is not the size the file says is reported, and so is an origin off the grid", () => {
  const stretched = importUvtt(fixture(), SQ);           // the hand-made room.dd2vtt carries a 1 by 1 pixel picture
  assert.match(stretched.notes.join(" "), /picture is 1 by 1 pixels/);
  assert.doesNotMatch(stretched.notes.join(" "), /nothing needs aligning/);
  const j = sqFile(); j.resolution.map_origin = { x: 0.5, y: 0 };
  const off = importUvtt(j, SQ);
  assert.match(off.notes.join(" "), /not a whole number/);
  assert.deepEqual(off.image.origin, [0, -2.5]);
  const k = sqFile(); k.resolution.map_origin = { x: 2, y: 1 };
  const whole = importUvtt(k, SQ);
  assert.deepEqual(whole.image.origin, [7.5, 2.5]);
  assert.match(whole.notes.join(" "), /origin is 2, 1 squares/);
  const none = sqFile(); delete none.image;
  const n = importUvtt(none, SQ);
  assert.equal(n.image, null);
  assert.match(n.notes.join(" "), /no image/);
});

// ---------- hostile and malformed files ----------
const refused = (j, re, opts = SQ) => assert.throws(() => importUvtt(j, opts), (e) => e.name === "Error" || e.constructor.name === "UvttError" ? re.test(e.message) : false);
const both = (fn) => { fn(SQ); fn({ grid: "hex" }); };
const quick = (fn, ms = 3000) => { const t = Date.now(); const r = fn(); assert.ok(Date.now() - t < ms, `took ${Date.now() - t} ms`); return r; };

test("hostile: sizes and origins that would make a huge or endless loop are refused at once", () => {
  both((o) => {
    for (const [x, y] of [[1e9, 1], [1, 1e9], [1e308, 1e308], [Infinity, 4], [30000, 1], [200, 200]]) {
      const j = sqFile(); j.resolution.map_size = { x, y };
      quick(() => assert.throws(() => importUvtt(j, o), /squares|map_size|limit/));
    }
    for (const org of [{ x: 1e300, y: 0 }, { x: 0, y: -1e15 }, { x: 25000, y: 0 }, { x: "1", y: 0 }, { x: NaN, y: 0 }]) {
      const j = sqFile(); j.resolution.map_origin = org;
      quick(() => assert.throws(() => importUvtt(j, o), /origin|point/));
    }
  });
});

test("hostile: too much text, too many lines, points, doors are refused before they are read", () => {
  both((o) => {
    assert.throws(() => importUvtt(`{"x":"${"a".repeat(65e6)}"}`, o), /too big/);
    const many = sqFile(); many.line_of_sight = Array.from({ length: 50001 }, () => []);
    quick(() => assert.throws(() => importUvtt(many, o), /more than 50000 wall lines/));
    const pts = sqFile(); pts.line_of_sight = [Array.from({ length: 200001 }, (_, i) => ({ x: i % 7, y: i % 5 }))];
    quick(() => assert.throws(() => importUvtt(pts, o), /more than 200000 wall points/));
    const doors = sqFile(); doors.portals = Array.from({ length: 20001 }, () => ({ bounds: [{ x: 1, y: 1 }, { x: 2, y: 1 }] }));
    quick(() => assert.throws(() => importUvtt(doors, o), /more than 20000 doors/));
    const d2 = sqFile(); d2.portals = Array.from({ length: 2001 }, (_, i) => ({ bounds: [{ x: 1 + (i % 10), y: 1 }, { x: 2 + (i % 10), y: 1 }] }));
    quick(() => assert.throws(() => importUvtt(d2, o), /more than 2000 doors/));
  });
});

test("hostile: a file at the limits is read in bounded time and gives a map the linter accepts", () => {
  const j = sqFile();
  j.line_of_sight = [Array.from({ length: 199990 }, (_, i) => ({ x: (i % 2) * 11, y: 1 + (i % 6) * 0.5 }))];     // a zigzag that cannot be merged
  j.lights = Array.from({ length: 20000 }, (_, i) => ({ position: { x: (i % 12) + 0.5, y: (i % 8) + 0.5 } }));
  j.resolution.map_size = { x: 140, y: 140 };
  const r = quick(() => importUvtt(j, SQ), 8000);
  assert.ok(r.map.objects.length <= MAP_LIMITS.objects);
  assert.ok(lintMap(r.map).length > 0, "the wall limit should be reported as a problem, not a crash");
  assert.match(r.notes.join(" "), /still more than the limit/);
});

test("hostile: malformed pieces are skipped or refused and never throw anything but a plain refusal", () => {
  const bad = [NaN, Infinity, null, "5", {}, [], true, -0, 1e308, -1e308, 5e-324];
  both((o) => {
    for (const v of bad) {
      const j = sqFile();
      j.line_of_sight = [[{ x: v, y: 1 }, { x: 2, y: 2 }], [{ x: 1, y: 1 }, { x: 4, y: 1 }]];
      j.portals = [{ bounds: [{ x: v, y: 1 }, { x: 2, y: 1 }] }, { bounds: [{ x: 1, y: 1 }, { x: 1, y: 1 }] }, null, 7, { bounds: "no" }, { bounds: [{ x: 3, y: 3 }, { x: 4, y: 3 }], position: { x: v, y: v } }];
      j.lights = [null, 3, { position: { x: v, y: v } }, { position: null }, {}];
      j.objects_line_of_sight = [null, [], [null], [[1, 2]], [{ x: 1, y: 1 }, { x: 1, y: 1 }]];
      const r = importUvtt(j, o);
      assert.ok(r.map && Array.isArray(r.notes));
      assert.ok(r.map.walls.every((w) => [...w.a, ...w.b].every((n) => Number.isFinite(n))));
    }
    for (const field of ["line_of_sight", "portals", "objects_line_of_sight", "lights"]) {
      const j = sqFile(); j[field] = { not: "a list" };
      assert.throws(() => importUvtt(j, o), /must be a list|no "line_of_sight" list/);
    }
    for (const image of [5, null, {}, "data:image/png;base64,@@@@", "a b", "AAAA</>", "javascript:alert(1)", "", "=="]) {
      const j = sqFile(); j.image = image;
      const r = importUvtt(j, o);
      assert.equal(r.image, null);
      assert.match(r.notes.join(" "), /image/);
    }
    for (const res of [null, 5, [], { map_size: null }, { map_size: { x: "10", y: 4 } }, { map_size: { x: 10, y: 4 }, map_origin: 5 }, { map_size: { x: -1, y: 4 } }]) {
      const j = sqFile(); j.resolution = res;
      assert.throws(() => importUvtt(j, o), /Universal VTT|map_size|map_origin/);
    }
  });
});

test("hostile: nothing but a plain refusal comes out of random damage to a file", () => {
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const junk = [null, undefined, NaN, -1, 0, 1e20, "x", [], {}, [[]], true, { x: 1 }, [{ x: 1, y: 2 }]];
  const walk = (v, depth = 0) => {
    if (v && typeof v === "object") {
      const keys = Object.keys(v);
      if (keys.length && rnd(3) === 0) { const k = keys[rnd(keys.length)]; if (depth > 0 && rnd(4) === 0) delete v[k]; else v[k] = junk[rnd(junk.length)]; }
      for (const k of Object.keys(v)) if (rnd(2)) walk(v[k], depth + 1);
    }
  };
  let made = 0, refused = 0;
  for (let i = 0; i < 400; i++) {
    const j = fixture(); if (i % 2) Object.assign(j, JSON.parse(sqText()));
    walk(j); walk(j);
    for (const o of [SQ, { grid: "hex" }]) {
      try { const r = importUvtt(j, o); assert.ok(r.map && r.notes.every((n) => typeof n === "string")); made++; }
      catch (e) { assert.equal(e.constructor.name, "UvttError", `${e}`); refused++; }
    }
  }
  assert.ok(made > 50 && refused > 0, `${made} made, ${refused} refused`);
  for (const text of ["", "null", "[]", "5", '"x"', "{", "{}".repeat(10), "[".repeat(200000), "{\"a\":".repeat(100000)]) assert.throws(() => importUvtt(text, SQ), (e) => e.constructor.name === "UvttError");
});
