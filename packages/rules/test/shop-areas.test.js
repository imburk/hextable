// Shop areas on the map (docs/specs/shops.md, Decision 4; task P3a): the optional `areas` list of the map
// document, what lintMap checks of it, the `areas` change of mapEdit, `inArea`, and what players are sent of an
// area (review point 9). Stores themselves are P3: the view rule is tested on shop records shaped as Decision 3
// says, through `viewShopArea`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import * as H from "../src/hex.js";
import { EDITS, MAP_FORMAT, MAP_LIMITS, lintMap, migrateMap, newMap } from "../src/map.js";
import { inArea } from "../src/space.js";
import { view, viewEvents, viewShopArea } from "../src/view.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" }, KIM = { role: "player", userId: "kim" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };

// A hex field with a loft over its middle and a back room (a region not yet revealed) east of q = 3.
// The market area "OUTFITTER-CANARY" spans the street and the back room; the stall lies on the loft.
const field = (over = {}) => {
  const tiles = {}, loft = {};
  for (const h of H.range({ q: 0, r: 0 }, 5)) tiles[H.key(h)] = { t: "grass" };
  for (const h of H.range({ q: 0, r: 0 }, 1)) loft[H.key(h)] = { t: "stone" };
  const back = Object.keys(tiles).filter((k) => +k.split(",")[0] >= 4);
  return newMap({
    id: "field", name: "Field",
    levels: [{ id: "ground", name: "Ground", z: 0, tiles }, { id: "loft", name: "Loft", z: 10, tiles: loft }],
    regions: [{ id: "back", name: "The back room", level: "ground", hexes: back }],
    areas: [
      { id: "OUTFITTER-CANARY", name: "Canary market", level: "ground", hexes: ["2,0", "3,0", "4,0", "5,0"] },
      { id: "stall", name: "The stall", level: "loft", hexes: ["0,0"] },
    ],
    starts: [{ q: -4, r: 0 }],
    ...over,
  });
};
const bad = (over, want) => {
  const got = lintMap(field(over));
  assert.ok(got.some((x) => x.includes(want)), `wanted "${want}", got ${JSON.stringify(got)}`);
  assert.ok(!got.some((x) => x.includes("undefined") || x.includes("[object")), `a sentence, not a stringified value: ${JSON.stringify(got)}`);
};

test("a map with shop areas is clean, the field is optional, and the format stays 2", () => {
  assert.deepEqual(lintMap(field()), []);
  const { areas, ...plain } = field();
  assert.deepEqual(lintMap(plain), []);
  assert.equal(MAP_FORMAT, 2);
  // Migration keeps the areas as they are and stamps nothing new.
  const m = migrateMap(structuredClone(field()));
  assert.equal(m.format, 2);
  assert.deepEqual(m.areas, field().areas);
  // Areas may overlap a region, several regions, and each other (three stalls in one square).
  assert.deepEqual(lintMap(field({ areas: [...field().areas, { id: "b", name: "B", level: "ground", hexes: ["3,0", "-1,0"] }] })), []);
});

test("an older build reads a map with areas: its linter knows nothing of the field and does not refuse it", () => {
  // The linter before P3a checked only the fields it knew; an unknown top-level field is ignored, as `areas` was.
  // So a map with areas loads there as the same format-2 map without them.
  assert.deepEqual(lintMap({ ...field(), somethingLater: [{ id: "x" }] }), []);
  const s = newGame(5);
  ok(apply(s, { type: "loadMap", map: field() }, DM));
  assert.deepEqual(s.map.areas, field().areas);
});

test("lintMap refuses a bad id, level or cell with a sentence, and holds the limits", () => {
  const two = (a) => ({ areas: [field().areas[1], a] });
  bad({ areas: "market" }, '"areas" must be a list.');
  bad({ areas: [null] }, "A shop area is not a record.");
  bad({ areas: [["2,0"]] }, "A shop area is not a record.");
  bad(two({ name: "The forge", level: "ground", hexes: ["2,0"] }), 'The shop area "The forge" has no id.');
  bad(two({ level: "ground", hexes: ["2,0"] }), "A shop area has no id.");
  bad(two({ id: 7, level: "ground", hexes: ["2,0"] }), "A shop area has no id.");
  bad(two({ id: "stall", name: "Again", level: "loft", hexes: ["0,0"] }), 'Shop area id "stall" is used twice.');
  bad(two({ id: "f", level: "ground", hexes: ["2,0"] }), 'Shop area "f" has no name.');
  bad(two({ id: "f", name: "F", level: "attic", hexes: ["2,0"] }), 'Shop area "f" is on a level that does not exist: "attic".');
  bad(two({ id: "f", name: "F", hexes: ["2,0"] }), 'Shop area "f" names no level.');
  bad(two({ id: "f", name: "F", level: "ground", hexes: [] }), 'Shop area "f" has no hexes.');
  bad(two({ id: "f", name: "F", level: "ground" }), 'Shop area "f" has no hexes.');
  bad(two({ id: "f", name: "F", level: "ground", hexes: ["9,9"] }), 'Shop area "f" includes "9,9", which is not a hex of its level.');
  bad(two({ id: "f", name: "F", level: "loft", hexes: ["3,0"] }), 'Shop area "f" includes "3,0", which is not a hex of its level.');
  bad(two({ id: "f", name: "F", level: "ground", hexes: ["two,0"] }), "which is not a hex of its level");
  bad(two({ id: "f", name: "F", level: "ground", hexes: ["constructor"] }), "which is not a hex of its level");
  bad(two({ id: "f", name: "F", level: "ground", hexes: [{ q: 2, r: 0 }] }), 'Shop area "f" includes something that is not a hex of its level.');
  bad(two({ id: "f", name: "F", level: "ground", hexes: ["2,0", "2,0"] }), 'Shop area "f" names 2,0 twice.');
  bad({ areas: Array.from({ length: MAP_LIMITS.areas + 1 }, (_, i) => ({ id: `a${i}`, name: `A${i}`, level: "ground", hexes: ["0,0"] })) }, `It has more than ${MAP_LIMITS.areas} shop areas.`);
  bad(two({ id: "f", name: "F", level: "ground", hexes: Array.from({ length: MAP_LIMITS.tiles + 1 }, () => "0,0") }), `Shop area "f" has more than ${MAP_LIMITS.tiles} hexes.`);
  // On a square map the sentences say squares.
  const sq = newMap({ id: "sq", name: "Sq", grid: "square", levels: [{ id: "ground", name: "Ground", z: 0, tiles: { "0,0": { t: "grass" } } }], areas: [{ id: "f", name: "F", level: "ground", hexes: ["1,0"] }] });
  assert.ok(lintMap(sq).includes('Shop area "f" includes "1,0", which is not a square of its level.'));
});

test("mapEdit sets the areas whole, a bad change leaves the map as it was, and none takes them away", () => {
  const s = newGame(5);
  const { areas: _, ...plain } = field();
  ok(apply(s, { type: "loadMap", map: plain }, DM));
  assert.ok(!("areas" in s.map));
  const before = structuredClone(s);
  const r = apply(s, { type: "mapEdit", ops: [{ op: "areas", areas: [{ id: "f", name: "F", level: "ground", hexes: ["9,9"] }] }] }, DM);
  assert.ok(!r.ok);
  assert.match(r.error, /^That change can't be made\. Shop area "f" includes "9,9", which is not a hex of its level\.$/);
  assert.deepEqual(s, before, "nothing changed");
  // A player cannot change them.
  assert.ok(!apply(s, { type: "mapEdit", ops: [{ op: "areas", areas: field().areas }] }, PAT).ok);
  ok(apply(s, { type: "mapEdit", ops: [{ op: "areas", areas: field().areas }] }, DM));
  assert.deepEqual(s.map.areas, field().areas);
  ok(apply(s, { type: "mapEdit", ops: [{ op: "areas", areas: [] }] }, DM));
  assert.ok(!("areas" in s.map));
  ok(apply(s, { type: "mapEdit", ops: [{ op: "areas", areas: field().areas }] }, DM));
  ok(apply(s, { type: "mapEdit", ops: [{ op: "areas", areas: null }] }, DM));
  assert.ok(!("areas" in s.map));
});

test("removing a tile takes it out of an area, an area left empty goes, and removing a level takes its areas", () => {
  const m = field();
  EDITS.tile(m, { level: "ground", at: { q: 2, r: 0 } });
  assert.deepEqual(m.areas[0].hexes, ["3,0", "4,0", "5,0"]);
  assert.deepEqual(lintMap(m), []);
  EDITS.tile(m, { level: "loft", at: { q: 0, r: 0 } });
  assert.deepEqual(m.areas.map((a) => a.id), ["OUTFITTER-CANARY"]);
  assert.deepEqual(lintMap(m), []);
  const n = field();
  EDITS.unlevel(n, { id: "loft" });
  assert.deepEqual(n.areas.map((a) => a.id), ["OUTFITTER-CANARY"]);
  const o = field({ areas: [field().areas[1]] });
  EDITS.unlevel(o, { id: "loft" });
  assert.ok(!("areas" in o));
  assert.deepEqual(lintMap(o), []);
});

test("inArea: any cell of the footprint on the area's level; a Large pawn with one cell in is inside on hexes", () => {
  const m = field(), market = m.areas[0];
  const at = (q, r, size = "medium", z = 0) => ({ pos: { q, r, z }, size });
  assert.equal(inArea(m, market, at(2, 0)), true);
  assert.equal(inArea(m, "OUTFITTER-CANARY", at(3, 0)), true, "by id");
  assert.equal(inArea(m, market, at(1, 0)), false, "the cell beside it");
  // Large on hexes fills its cell, the one east and the one south-east: anchored at 1,0 it touches 2,0.
  assert.equal(inArea(m, market, at(1, 0, "large")), true);
  assert.equal(inArea(m, market, at(1, -1, "large")), false, "1,-1 / 2,-1 / 1,0: no cell of the area");
  // The level counts: the stall is on the loft at 0,0; a pawn on the ground below is not in it, one on the loft is.
  assert.equal(inArea(m, "stall", at(0, 0)), false);
  assert.equal(inArea(m, "stall", at(0, 0, "medium", 10)), true);
  assert.equal(inArea(m, "OUTFITTER-CANARY", at(0, 0, "large", 10)), false, "on the loft, over no market cell");
  // A rider is measured by its mount's shape.
  assert.equal(inArea(m, market, { pos: { q: 1, r: 0, z: 0 }, size: "medium", riding: { on: "x", size: "large" } }), true);
  // An id the map does not have, a map with no areas, a creature off the map: not inside.
  assert.equal(inArea(m, "nowhere", at(2, 0)), false);
  assert.equal(inArea(field({ areas: undefined }), "stall", at(0, 0, "medium", 10)), false);
  assert.equal(inArea(m, market, { size: "medium" }), false);
});

test("inArea on squares: a Large pawn (2 by 2 from its north-west square) with one square in is inside", () => {
  const tiles = {};
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) tiles[`${q},${r}`] = { t: "stone" };
  const m = newMap({ id: "sq", name: "Sq", grid: "square", levels: [{ id: "ground", name: "Ground", z: 0, tiles }], areas: [{ id: "shop", name: "Shop", level: "ground", hexes: ["2,2"] }] });
  assert.deepEqual(lintMap(m), []);
  const at = (q, r, size) => ({ pos: { q, r, z: 0 }, size });
  assert.equal(inArea(m, "shop", at(1, 1, "large")), true, "1,1 / 2,1 / 1,2 / 2,2");
  assert.equal(inArea(m, "shop", at(1, 1, "medium")), false);
  assert.equal(inArea(m, "shop", at(0, 0, "large")), false);
  assert.equal(inArea(m, "shop", at(2, 2, "medium")), true);
  // A Huge one fills 3 by 3: from 0,0 it reaches 2,2.
  assert.equal(inArea(m, "shop", at(0, 0, "huge")), true);
});

test("players are sent no area through the map, and of a store only the cells in tiles they are sent", () => {
  const s = newGame(5);
  ok(apply(s, { type: "loadMap", map: field() }, DM));
  for (const [id, user] of [["fighter", "pat"], ["rogue", "kim"]]) ok(apply(s, { type: "claim", entity: id, user, userName: user }, { role: "player", userId: user }));
  // Nothing of any area is in what a player is sent: not the field, not an id, not a name.
  const sent = (who, res) => JSON.stringify([view(s, who), viewEvents(res?.events ?? [], s, who)]);
  for (const who of [PAT, KIM]) {
    const v = view(s, who);
    assert.ok(!("areas" in v.map), "the map document sent to players has no areas");
    assert.ok(!sent(who).includes("CANARY") && !sent(who).includes("Canary market") && !sent(who).includes("The stall"));
  }
  // A mapEdit of the areas tells players nothing of them either.
  const res = ok(apply(s, { type: "mapEdit", ops: [{ op: "areas", areas: [...field().areas, { id: "CANARY-2", name: "Canary two", level: "ground", hexes: ["-1,0"] }] }] }, DM));
  assert.ok(!sent(PAT, res).includes("CANARY") && !sent(PAT, res).includes("Canary"));
  // The DM sees every area.
  assert.equal(view(s, DM).map.areas.length, 3);

  // A store as Decision 3 shapes it: `shown` 'none', 'all' or user ids; `at: { area }`.
  const store = (shown, area = "OUTFITTER-CANARY", kind = "store") => ({ id: "s1", kind, name: "The Outfitter", shown, at: { area } });
  // Not shown (a new store), or shown to someone else: nothing.
  assert.equal(viewShopArea(s, store("none"), PAT), undefined);
  assert.equal(viewShopArea(s, store(["kim"]), PAT), undefined);
  assert.equal(viewShopArea(s, store(["kim"]), { role: "player" }), undefined, "a viewer with no user id");
  // A loot package has no shop area; an area not on this map is nothing.
  assert.equal(viewShopArea(s, store("all", "OUTFITTER-CANARY", "loot"), PAT), undefined);
  assert.equal(viewShopArea(s, store("all", "gone"), PAT), undefined);
  assert.equal(viewShopArea(s, { ...store("all"), at: undefined }, PAT), undefined);
  // Shown: the cells in tiles this player is sent. The back room is not revealed, so 4,0 and 5,0 are not sent.
  assert.deepEqual(viewShopArea(s, store(["kim"]), KIM), { level: "ground", hexes: ["2,0", "3,0"] });
  assert.deepEqual(viewShopArea(s, store("all"), PAT), { level: "ground", hexes: ["2,0", "3,0"] });
  assert.ok(!JSON.stringify(viewShopArea(s, store("all"), PAT)).includes("CANARY"), "never the area's id or name");
  ok(apply(s, { type: "mapEdit", ops: [{ op: "region", region: { ...s.map.regions[0], revealed: true } }] }, DM));
  assert.deepEqual(viewShopArea(s, store("all"), PAT), { level: "ground", hexes: ["2,0", "3,0", "4,0", "5,0"] });
  // An area wholly in tiles a player is not sent: nothing, not an empty outline.
  ok(apply(s, { type: "mapEdit", ops: [{ op: "region", region: { ...s.map.regions[0], revealed: false } }, { op: "areas", areas: [{ id: "deep", name: "Deep", level: "ground", hexes: ["4,0", "5,0"] }] }] }, DM));
  assert.equal(viewShopArea(s, store("all", "deep"), PAT), undefined);
});
