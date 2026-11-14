// Words in the engine (docs/specs/square-grid.md, task S13e, E9): a message that names the grid
// says "square" on a square map and "hex" on a hex map, and on a hex map it is the same text as
// before. The messages are provoked one by one, on both grids.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import { SETTING_TEXT } from "../src/engine/dm.js";
import { lintMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";
import { squareRoom } from "./fixtures/square-room.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const said = (r) => { assert.equal(r.ok, false); return r.error; };
const noHex = (text) => assert.doesNotMatch(text, /\bhex/i, text);

function inRoom() {
  const s = newGame(14);
  ok(apply(s, { type: "loadMap", map: squareRoom() }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  s.entities.fighter.pos = { q: 1, r: 1, z: 0 };
  s.entities.rogue.pos = { q: 3, r: 3, z: 0 };
  return s;
}
const edit = (s, op) => said(apply(s, { type: "mapEdit", ops: [op] }, DM));

test("on a square map, a creature that cannot be put on an occupied square says square", () => {
  const s = inRoom();
  const e1 = said(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 1 } }, DM));
  assert.equal(e1, "That square is occupied.");
  const e2 = said(apply(s, { type: "place", actor: "rogue", to: { q: 1, r: 1 } }, DM));
  assert.equal(e2, "That square is occupied.");
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 6, r: 6 } }, DM));
  ok(apply(s, { type: "startEncounter", center: { q: 7, r: 7 }, radius: 6 }, DM));
  while (s.encounter.order[s.encounter.turn].id !== "fighter") ok(apply(s, { type: "endTurn", actor: s.encounter.order[s.encounter.turn].id }, DM));
  const e3 = said(apply(s, { type: "move", actor: "fighter", to: { q: 3, r: 3 } }, DM));
  noHex(e3);
});

test("on a square map, the map's own problems and edits say square and squares", () => {
  const bad = squareRoom();
  bad.levels[0].tiles["x"] = { t: "stone" };
  bad.starts.push({ q: "a", r: 0 });
  bad.objects[0].at = { q: 99, r: 99 };
  bad.objects[1].edge = undefined;
  bad.regions.push({ id: "r1", name: "A", level: "ground", hexes: [] }, { id: "r2", name: "B", level: "ground", hexes: ["99,99"] });
  const problems = lintMap(bad);
  assert.ok(problems.length > 0);
  problems.forEach(noHex);
  const two = squareRoom();
  two.regions.push({ id: "a", name: "A", level: "ground", hexes: ["1,1"] }, { id: "b", name: "B", level: "ground", hexes: ["1,1"] });
  const p2 = lintMap(two);
  assert.deepEqual(p2, ["Square 1,1 is in two regions."]);
  const flat = squareRoom(); flat.objects[1].edge = undefined; flat.objects[0].edge = 0;
  const p3 = lintMap(flat);
  assert.equal(p3.length, 2);
  p3.forEach(noHex);
  assert.match(p3.join(" "), /needs a square edge or a line/);
  assert.match(p3.join(" "), /stands in a square, not on an edge/);
  const s = inRoom();
  assert.equal(edit(s, { op: "tile", level: "ground" }), "A tile needs a level and a square.");
  assert.equal(edit(s, { op: "region", region: {} }), "A region needs a record with squares.");
});

test("the table rule texts for square maps name no hex", () => {
  for (const group of Object.values(SETTING_TEXT)) for (const t of Object.values(group)) noHex(t);
});

test("on a hex map every message is the one it always was", () => {
  const s = newGame(14);
  assert.equal(said(apply(s, { type: "spawn", monster: "goblin-warrior", at: { ...s.entities.fighter.pos } }, DM)), "That hex is occupied.");
  assert.equal(said(apply(s, { type: "place", actor: "rogue", to: { ...s.entities.fighter.pos } }, DM)), "That hex is occupied.");
  assert.equal(edit(s, { op: "tile", level: "ground" }), "A tile needs a level and a hex.");
  assert.equal(edit(s, { op: "region", region: {} }), "A region needs a record with hexes.");
  const two = structuredClone(s.map);
  two.regions = [{ id: "a", name: "A", level: two.levels[0].id, hexes: ["0,0"] }, { id: "b", name: "B", level: two.levels[0].id, hexes: ["0,0"] }];
  assert.ok(lintMap(two).includes("Hex 0,0 is in two regions."));
  const none = structuredClone(s.map);
  none.regions = [{ id: "a", name: "A", level: none.levels[0].id, hexes: [] }];
  assert.deepEqual(lintMap(none), ['Region "a" has no hexes.']);
  const start = structuredClone(s.map); start.starts = [{ q: "x" }];
  assert.deepEqual(lintMap(start), ["A start is not a hex."]);
});
