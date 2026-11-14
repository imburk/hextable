// Maps as documents, levels and heights (task M1 of docs/specs/maps-and-objects.md).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { apply, moveOptions } from "../src/engine.js";
import * as H from "../src/hex.js";
import { lintMap, newMap, MAP_FORMAT } from "../src/map.js";
import { migrate, VERSION } from "../src/migrate.js";
import { newGame } from "../src/scenario.js";
import { ground, landing, surfaces } from "../src/space.js";
import { viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PLAYER = { role: "player", userId: "pat" };
const sheet = (hexes, tile = { t: "stone" }) => Object.fromEntries(hexes.map((h) => [H.col(h), { ...tile }]));

// A hall on the ground, a floor 10 ft above it, and a stair of four steps (2.5 ft each) between them.
export function tower() {
  const ground = sheet(H.range({ q: 0, r: 0 }, 3));
  for (const [q, h] of [[4, 2.5], [5, 5], [6, 7.5]]) ground[`${q},0`] = { t: "stone", h };
  const upper = sheet(H.range({ q: 8, r: 0 }, 1));
  for (const h of H.range({ q: 0, r: 0 }, 1)) upper[H.col(h)] = { t: "stone" };       // a gallery over the hall
  return newMap({ id: "tower", name: "The tower", starts: [{ q: 0, r: 0 }],
    levels: [{ id: "ground", name: "Ground floor", z: 0, tiles: ground }, { id: "upper", name: "Upper floor", z: 10, tiles: upper }] });
}
export function onTower() {
  const s = newGame(3);
  const r = apply(s, { type: "loadMap", map: tower() }, DM);
  assert.ok(r.ok, r.error);
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  apply(s, { type: "setting", key: "climbing", value: "off" }, DM);          // these tests are about floors and stairs; climbing has its own
  return s;
}

test("a hex key names a column at height 0 and an exact position above or below it", () => {
  assert.equal(H.key({ q: 2, r: -1 }), "2,-1");
  assert.equal(H.key({ q: 2, r: -1, z: 0 }), "2,-1");
  assert.equal(H.key({ q: 2, r: -1, z: 10 }), "2,-1,10");
  assert.equal(H.col({ q: 2, r: -1, z: 10 }), "2,-1");
  assert.deepEqual(H.parse("2,-1,-7.5"), { q: 2, r: -1, z: -7.5 });
  assert.deepEqual(H.parse("2,-1"), { q: 2, r: -1 });
});

test("the starting valley is a valid one-level map document and every creature has a height", () => {
  const s = newGame(11);
  assert.equal(s.version, VERSION);
  assert.equal(s.map.format, MAP_FORMAT);
  assert.deepEqual(lintMap(s.map), []);
  assert.equal(s.map.levels.length, 1);
  for (const e of Object.values(s.entities)) { assert.equal(e.pos.z, 0, e.id); assert.ok(ground(s.map, e.pos), e.id); }
});

test("a table saved before maps were documents loads with its tiles, its looks and its positions", () => {
  const saved = JSON.parse(readFileSync(new URL("./fixtures/table-v1.json", import.meta.url), "utf8")).state;
  const count = Object.keys(saved.map.tiles).length, lift = saved.map.tiles["0,0"].h, where = { ...saved.entities.fighter.pos };
  const s = migrate(structuredClone(saved));
  assert.equal(s.version, VERSION);
  assert.deepEqual(lintMap(s.map), []);
  assert.equal(Object.keys(s.map.levels[0].tiles).length, count);
  assert.equal(s.map.levels[0].tiles["0,0"].lift, lift);
  assert.equal(s.map.levels[0].tiles["0,0"].h, undefined);                  // the old heights were looks, never rules
  assert.deepEqual(s.entities.fighter.pos, { ...where, z: 0 });
  assert.deepEqual(migrate(structuredClone(s)), s);                          // running it again changes nothing
  const cur = s.encounter.order[s.encounter.turn].id;
  assert.ok(apply(s, { type: "endTurn", actor: cur }, DM).ok);
});

test("the linter says what is wrong with a map", () => {
  const bad = (change, word) => { const m = tower(); change(m); const out = lintMap(m); assert.ok(out.some((x) => x.includes(word)), `${word}: ${out}`); };
  assert.deepEqual(lintMap(tower()), []);
  assert.deepEqual(lintMap("nope"), ["It is not a map document."]);
  bad((m) => { m.format = 9; }, "format");
  bad((m) => { m.levels[1].id = "ground"; }, "used twice");
  bad((m) => { m.levels[0].tiles["0,0"].t = "lava"; }, "unknown terrain");
  bad((m) => { m.levels[0].tiles["a,b"] = { t: "stone" }; }, "not a hex");
  bad((m) => { m.levels[0].z = "high"; }, "no height");
  bad((m) => { m.starts = [{ q: 99, r: 99 }]; }, "nothing to stand on");
  bad((m) => { m.levels = []; }, "no levels");
  bad((m) => { m.cellFeet = 10; }, "5 feet");
});

test("loading a map sets the party down at its start and leaves the old place's creatures behind", () => {
  const s = newGame(3);
  const res = apply(s, { type: "loadMap", map: tower() }, DM);
  assert.ok(res.ok, res.error);
  assert.equal(s.map.id, "tower");
  const all = Object.values(s.entities);
  assert.deepEqual(all.map((e) => e.side), ["party", "party", "party", "party"]);
  assert.equal(new Set(all.map((e) => H.key(e.pos))).size, 4);
  for (const e of all) { assert.ok(ground(s.map, e.pos)); assert.ok(H.dist(e.pos, { q: 0, r: 0 }) <= 1); assert.equal(e.pos.z, 0); }
  assert.deepEqual(viewEvents(res.events, s, PLAYER), [{ type: "map", map: "tower", name: "The tower" }]);
});

test("a map that cannot be played is refused and nothing changes; only the DM may change the map", () => {
  const s = newGame(3), before = JSON.stringify(s), broken = tower();
  broken.levels[0].tiles["0,0"].t = "lava";
  const res = apply(s, { type: "loadMap", map: broken }, DM);
  assert.equal(res.ok, false);
  assert.match(res.error, /unknown terrain/);
  assert.equal(apply(s, { type: "loadMap", map: tower() }, PLAYER).ok, false);
  assert.equal(apply(s, { type: "loadMap", map: { ...tower(), levels: [{ id: "g", name: "g", z: 0, tiles: { "0,0": { t: "stone" } } }] } }, DM).error, "That map has no room for the party at its start.");
  assert.equal(JSON.stringify(s), before);
  apply(s, { type: "startEncounter", center: s.entities.m1.pos, radius: 30 }, DM);
  assert.match(apply(s, { type: "loadMap", map: tower() }, DM).error, /middle of a fight/);
});

test("the map a table plays on is its own copy", () => {
  const doc = tower(), s = newGame(3);
  apply(s, { type: "loadMap", map: doc }, DM);
  s.map.levels[0].tiles["0,0"].t = "water";
  assert.equal(doc.levels[0].tiles["0,0"].t, "stone");
});

test("two floors over the same hex are two different places", () => {
  const s = onTower();
  assert.deepEqual(surfaces(s.map, { q: 0, r: 0 }).map((sf) => [sf.level.id, sf.z]), [["ground", 0], ["upper", 10]]);
  assert.deepEqual(landing(s.map, { q: 0, r: 0 }), { q: 0, r: 0, z: 0 });
  assert.deepEqual(landing(s.map, { q: 0, r: 0 }, 9), { q: 0, r: 0, z: 10 });
  assert.equal(landing(s.map, { q: 40, r: 40 }), null);
  const e = s.entities.fighter;
  assert.ok(apply(s, { type: "place", actor: "fighter", to: { q: 1, r: 0, z: 10 } }, DM).ok);
  assert.deepEqual(e.pos, { q: 1, r: 0, z: 10 });
  // Someone stands directly below; neither is in the other's way.
  assert.ok(apply(s, { type: "place", actor: "rogue", to: { q: 1, r: 0, z: 0 } }, DM).ok);
  assert.deepEqual(s.entities.rogue.pos, { q: 1, r: 0, z: 0 });
  // From the gallery there is no walking down a 10 ft drop: only the gallery is in reach.
  const reach = [...moveOptions(s, e).values()].map((n) => n.h);
  assert.ok(reach.length > 1);
  assert.ok(reach.every((h) => h.z === 10), JSON.stringify(reach));
});

test("stairs are tiles that rise a step at a time, and a tap without a height finds the floor you can reach", () => {
  const s = onTower(), e = s.entities.fighter;
  apply(s, { type: "place", actor: "fighter", to: { q: 3, r: 0 } }, DM);
  const up = apply(s, { type: "move", actor: "fighter", to: { q: 8, r: 0 } }, DM);
  assert.ok(up.ok, up.error);
  assert.deepEqual(e.pos, { q: 8, r: 0, z: 10 });
  assert.deepEqual(up.events[0].path.map((h) => h.z), [2.5, 5, 7.5, 10, 10]);
  // Under the gallery, a tap on a hex that has two floors goes to the one on this level.
  apply(s, { type: "place", actor: "rogue", to: { q: 2, r: 0 } }, DM);
  apply(s, { type: "place", actor: "cleric", to: { q: -3, r: 0 } }, DM);
  apply(s, { type: "place", actor: "wizard", to: { q: -3, r: 1 } }, DM);
  assert.ok(apply(s, { type: "move", actor: "rogue", to: { q: 0, r: 0 } }, DM).ok);
  assert.equal(s.entities.rogue.pos.z, 0);
  assert.equal(apply(s, { type: "move", actor: "rogue", to: { q: 0, r: 0, z: 10 } }, DM).error, "Can't get there.");
});

test("a step of more than 2.5 ft is Difficult Terrain, and a fight locks every level of its hexes", () => {
  const s = onTower(), map = s.map;
  map.levels[0].tiles["4,0"].h = 5;                                        // one tall step instead of two small ones
  map.levels[0].tiles["5,0"].h = 5;
  apply(s, { type: "place", actor: "fighter", to: { q: 3, r: 0 } }, DM);
  assert.ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 2 } }, DM).ok);
  const r = apply(s, { type: "startEncounter", center: { q: 3, r: 0 }, radius: 4 }, DM);
  assert.ok(r.ok, r.error);
  while (s.encounter.order[s.encounter.turn].id !== "fighter") apply(s, { type: "endTurn", actor: s.encounter.order[s.encounter.turn].id }, DM);
  const options = moveOptions(s, s.entities.fighter);
  assert.equal(options.get("4,0,5").cost, 10);                             // the tall step
  assert.equal(options.get("5,0,5").cost, 15);                             // then level going
  assert.ok(s.encounter.arena["0,0"]);
  assert.equal(Object.keys(s.encounter.arena).some((k) => k.split(",").length > 2), false);
  const budget = s.encounter.budget.move;
  assert.ok(apply(s, { type: "move", actor: "fighter", to: { q: 5, r: 0 } }, DM).ok);
  assert.equal(s.encounter.budget.move, budget - 15);
});
