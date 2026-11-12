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
  const { map } = importUvtt(json);
  const s = newGame(4);
  const r = apply(s, { type: "loadMap", map }, DM);
  assert.ok(r.ok, r.error);
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  const start = H.fromWorld(25, 15, 5 / Math.sqrt(3));
  assert.ok(apply(s, { type: "place", actor: "fighter", to: start }, DM).ok);
  return s;
}

test("the imported map passes the linter and the engine loads it", () => {
  const { map, notes, image } = importUvtt(fixture());
  assert.deepEqual(lintMap(map), []);
  assert.ok(Array.isArray(notes) && notes.every((n) => typeof n === "string"));
  assert.ok(image.url.startsWith("data:image/png;base64,"));
  assert.deepEqual(image.size, [50, 30]);
  assert.equal(JSON.stringify(map).includes("iVBOR"), false, "the image must not be in the map document");
  const s = newGame(4);
  assert.ok(apply(s, { type: "loadMap", map }, DM).ok);
});

test("walls are in feet: one square is five feet", () => {
  const { map } = importUvtt(fixture());
  const w = map.walls.filter((x) => x.kind === "wall");
  assert.equal(w.length, 5);
  assert.deepEqual(w[0], { id: "w1", level: "ground", a: [40, 10], b: [40, 5], kind: "wall" });
  assert.deepEqual(w[1].b, [10, 5]);
  const rails = map.walls.filter((x) => x.kind === "rail");
  assert.deepEqual(rails.map((x) => [x.a, x.b]), [[[20, 15], [25, 15]]]);
});

test("a portal becomes a door in its state, on a hex that exists", () => {
  const { map } = importUvtt(fixture());
  assert.equal(map.objects.length, 1);
  const [d] = map.objects;
  assert.equal(d.def, "door-wooden");
  assert.equal(d.state, "closed");
  assert.deepEqual(d.seg, { a: [40, 10], b: [40, 20] });
  assert.ok(map.levels[0].tiles[H.col(d.at)]);
  assert.ok(Math.hypot(center(d.at)[0] - 40, center(d.at)[1] - 15) <= 5);
  const j = fixture(); j.portals[0].closed = false;
  assert.equal(importUvtt(j).map.objects[0].state, "open");
});

test("nobody walks through the imported wall; the open door lets them out", () => {
  const shut = play(fixture());
  const a = reach(shut, "fighter");
  assert.ok(a.length > 5 && a.every(inside), "something outside the room was in reach");
  const j = fixture(); j.portals[0].closed = false;
  const open = play(j);
  const b = reach(open, "fighter");
  assert.ok(b.some((h) => center(h)[0] > 40), "the open door let nobody out");
  assert.ok(!b.some((h) => center(h)[0] < 40 && (center(h)[1] < 5 || center(h)[0] < 10)), "walked through a wall of the room");
});

test("notes say what was read and what was left out", () => {
  const { notes } = importUvtt(fixture());
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
  const r = importUvtt(j, {});
  assert.equal(r.map.walls.length, 1);
  assert.deepEqual(lintMap(r.map), []);
  assert.match(r.notes.join(" "), /joined/);
  const zig = []; for (let i = 0; i <= MAP_LIMITS.walls + 10; i++) zig.push({ x: i * 0.01, y: i % 2 });
  j.line_of_sight = [zig];
  const z = importUvtt(j);
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
