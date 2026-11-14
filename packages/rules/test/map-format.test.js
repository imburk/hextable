// Map format 2 and state version 21 (docs/specs/square-grid.md, task S4; Decisions 3 and 4): a map
// says which grid it is drawn on (`grid`) and how big a cell is (`cellFeet`, once `hexFeet`). Every
// map made before is a hex map and plays as it did. Square maps are refused until task S6.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { apply, current, moveOptions } from "../src/engine.js";
import { lintMap, migrateMap, newMap, MAP_FORMAT } from "../src/map.js";
import { migrate, VERSION } from "../src/migrate.js";
import { newGame } from "../src/scenario.js";
import { view } from "../src/view.js";
import { STOCK_MAPS } from "../src/content/maps/index.js";

const DM = { role: "dm", userId: "dm" };
const HEADER = ["format", "id", "name", "grid", "cellFeet"];
const fixture = (f) => JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8"));
const tavern = () => structuredClone(STOCK_MAPS.find((m) => m.id === "tavern").map);
// A map as a build before this change wrote it: format 1, `hexFeet`, no `grid`.
const formatOne = (doc) => { const { format, id, name, grid, cellFeet, ...rest } = structuredClone(doc); return { format: 1, id, name, hexFeet: cellFeet, ...rest }; };
const stand = (s, id) => [...moveOptions(s, s.entities[id])].find(([, o]) => o.canStop)[1].h;
const isHexHeader = (map) => {
  assert.deepEqual(Object.keys(map).slice(0, 5), HEADER);
  assert.deepEqual([map.format, map.grid, map.cellFeet, "hexFeet" in map], [2, "hex", 5, false]);
};

test("a new map, the valley and every stock map are format 2 hex maps of 5-foot cells", () => {
  assert.equal(MAP_FORMAT, 2);
  assert.equal(VERSION, 21);
  for (const map of [newMap(), newGame(1).map, ...STOCK_MAPS.map((m) => m.map).filter((x) => x.grid === "hex")]) {
    isHexHeader(map);
    assert.deepEqual(lintMap(map), map.id === "map" ? ["It has no tiles."] : [], map.id);
  }
});

test("migrateMap: a format 1 document becomes format 2 on hexes, with nothing else changed", () => {
  const now = tavern(), old = formatOne(now);
  assert.deepEqual(lintMap(old)[0], "Its format is 1; this game reads format 2.");
  const doc = migrateMap(structuredClone(old));
  isHexHeader(doc);
  assert.deepEqual(doc, now);
  assert.deepEqual(lintMap(doc), []);
  assert.deepEqual(migrateMap(structuredClone(doc)), doc, "running it again changes nothing");
  // A format 1 map was played on hexes whatever else it said, and its size was `hexFeet`.
  const odd = migrateMap({ ...structuredClone(old), grid: "square", cellFeet: 10 });
  assert.equal(odd.grid, "hex");
  assert.equal(odd.cellFeet, 5);
  // A document from before format 1 (one sheet of tiles) comes up to format 2 as well.
  const sheet = migrateMap({ radius: 1, tiles: { "0,0": { t: "grass", h: 0.5 } } });
  isHexHeader(sheet);
  assert.deepEqual(lintMap(sheet), []);
  // A newer format than this build reads is left alone, and refused by its format.
  const later = { ...structuredClone(now), format: 3 };
  assert.equal(migrateMap(later), later);
  assert.equal(later.format, 3);
  assert.deepEqual(lintMap(later)[0], "Its format is 3; this game reads format 2.");
  for (const x of [null, undefined, 7, "map", []]) assert.equal(migrateMap(x), x);
});

test("the linter: a square map is accepted since task S6; the grid, cell size and door edges are checked", () => {
  // The tavern read as squares: only its doors on hex edges 4 and 5 are wrong (a square has 4 sides).
  const sq = { ...tavern(), grid: "square" };
  assert.ok(lintMap(sq).length > 0 && lintMap(sq).every((p) => /^Object "o\d+" has an edge that is not 0 to 3\.$/.test(p)), lintMap(sq).join(" "));
  assert.deepEqual(lintMap({ ...tavern(), grid: "octagon" }), ['Its grid is "octagon"; it can be hex or square.']);
  assert.deepEqual(lintMap({ ...tavern(), grid: undefined }), ['Its grid is "undefined"; it can be hex or square.']);
  assert.deepEqual(lintMap({ ...tavern(), cellFeet: 10 }), ["A hex must be 5 feet."]);
  const { cellFeet, ...none } = tavern();
  assert.deepEqual(lintMap(none), ["A hex must be 5 feet."]);
  const door = tavern(), d = door.objects.find((o) => o.edge !== undefined);
  d.edge = 5;
  assert.deepEqual(lintMap(door), []);
  d.edge = 6;
  assert.deepEqual(lintMap(door), [`Object "${d.id}" has an edge that is not 0 to 5.`]);
});

test("a format 1 map file loads through loadMap once migrated, as the editor loads a file; a rejected load changes nothing", () => {
  const file = JSON.stringify(formatOne(tavern()));
  // Sent as it is, a format 1 document is migrated by loadMap itself (task S6), as the editor would.
  const s = newGame(4), r = newGame(4);
  const raw = apply(s, { type: "loadMap", map: JSON.parse(file) }, DM);
  assert.ok(raw.ok, raw.error);
  assert.deepEqual(raw.events, apply(r, { type: "loadMap", map: tavern() }, DM).events);
  assert.deepEqual(s, r);
  // A map that does not lint is refused, and the table is untouched.
  const before = JSON.stringify(s);
  const sq = apply(s, { type: "loadMap", map: { ...tavern(), grid: "square" } }, DM);
  assert.match(sq.error, /^That map can't be used\. Object "o\d+" has an edge that is not 0 to 3\.$/);
  assert.equal(JSON.stringify(s), before);
  // The editor's "Open a map file": migrateMap, then loadMap. It loads and plays as the stock tavern does.
  const t = newGame(4), u = newGame(4);
  const a = apply(t, { type: "loadMap", map: migrateMap(JSON.parse(file)) }, DM);
  const b = apply(u, { type: "loadMap", map: tavern() }, DM);
  assert.ok(a.ok, a.error);
  assert.deepEqual(a.events, b.events);
  assert.deepEqual(t, u);
  isHexHeader(t.map);
  const to = stand(t, "fighter");
  assert.ok(apply(t, { type: "move", actor: "fighter", to }, DM).ok);
  // Editing it keeps it a format 2 hex map.
  assert.ok(apply(t, { type: "mapEdit", ops: [{ op: "starts", starts: [to] }] }, DM).ok);
  isHexHeader(t.map);
});

test("players are sent the grid and the cell size with the rest of the map header", () => {
  const s = newGame(2);
  assert.ok(apply(s, { type: "claim", entity: "fighter", user: "pat" }, DM).ok);
  for (const ctx of [DM, { role: "player", userId: "pat" }]) {
    const map = view(s, ctx).map;
    assert.deepEqual(Object.keys(map).slice(0, 5), HEADER, ctx.role);
    assert.deepEqual([map.format, map.grid, map.cellFeet, "hexFeet" in map], [2, "hex", 5, false], ctx.role);
  }
});

// What a version 20 state becomes: the same apart from its version and its map's header.
function sameButHeader(was, now) {
  assert.equal(was.version, 20);
  assert.deepEqual([was.map.format, was.map.hexFeet, "grid" in was.map], [1, 5, false]);
  assert.equal(now.version, 21);
  isHexHeader(now.map);
  assert.deepEqual(lintMap(now.map), []);
  const strip = (s) => { const c = structuredClone(s); delete c.version; for (const k of ["format", "grid", "cellFeet", "hexFeet"]) delete c.map[k]; return c; };
  assert.deepEqual(strip(now), strip(was));
}

test("the version 20 tables saved before #224 and #232 migrate to version 21 on hexes, otherwise unchanged, and play", () => {
  for (const f of ["v20-barbarian-224.json", "v20-casters-232.json"]) {
    const was = fixture(f), s = migrate(structuredClone(was));
    sameButHeader(was, s);
    assert.deepEqual(migrate(structuredClone(s)), s, `${f}: migrating again changes nothing`);
    const pc = Object.values(s.entities).find((e) => e.kind === "pc"), to = stand(s, pc.id);
    const r = apply(s, { type: "move", actor: pc.id, to }, DM);
    assert.ok(r.ok, `${f}: ${r.error}`);
    const foe = Object.values(s.entities).find((e) => e.side !== "party");
    assert.ok(apply(s, { type: "startEncounter", center: foe.pos, radius: 10 }, DM).ok, f);
    assert.ok(Object.keys(s.encounter.arena).length > 0, f);
  }
});

test("the version 1 table (fixtures/table-v1.json, before maps were documents) comes up to version 21 on hexes and plays", () => {
  const s = migrate(fixture("table-v1.json").state);
  assert.equal(s.version, 21);
  isHexHeader(s.map);
  assert.deepEqual(lintMap(s.map), []);
  assert.equal(s.map.id, "valley");
  const r = apply(s, { type: "endTurn", actor: current(s) }, DM);
  assert.ok(r.ok, r.error);
});
