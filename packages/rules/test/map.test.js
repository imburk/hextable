// The map document's entries (docs/specs/travel.md, Decision 3): what lintMap checks of them and of a
// start's `entry` and `level`, and the `entries` change of mapEdit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import * as H from "../src/hex.js";
import { EDITS, ENTRY_KINDS, lintMap, migrateMap, newMap } from "../src/map.js";
import { migrate } from "../src/migrate.js";
import { view } from "../src/view.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };

// A small field with a loft above part of it, and a chest to stand for a circle.
const field = (over = {}) => {
  const tiles = {}, loft = {};
  for (const h of H.range({ q: 0, r: 0 }, 5)) tiles[H.key(h)] = { t: "grass" };
  for (const h of H.range({ q: 0, r: 0 }, 1)) loft[H.key(h)] = { t: "stone" };
  return newMap({
    id: "field", name: "Field",
    levels: [{ id: "ground", name: "Ground", z: 0, tiles }, { id: "loft", name: "Loft", z: 10, tiles: loft }],
    objects: [{ id: "o1", def: "chest", level: "ground", at: { q: 3, r: 0 }, state: "closed" }],
    entries: [{ id: "gate", name: "The gate", kind: "gate" }, { id: "loft", name: "The loft", kind: "landing" }],
    starts: [{ q: -4, r: 0 }, { q: 4, r: 0, entry: "gate" }, { level: "loft", q: 0, r: 0, entry: "loft" }],
    ...over,
  });
};

test("a map with entries, starts that name them and a start on a level is clean", () => {
  assert.deepEqual(lintMap(field()), []);
  assert.deepEqual(ENTRY_KINDS, ["gate", "dock", "circle", "landing", "near", "far", "other"]);
  // A map without entries is as clean as it was: the field is optional.
  const { entries, ...plain } = field({ starts: [{ q: -4, r: 0 }] });
  assert.deepEqual(lintMap(plain), []);
});

test("lintMap refuses entries that do not hang together", () => {
  const bad = (over, words) => {
    const p = lintMap(field(over));
    assert.ok(p.some((x) => x.includes(words)), `${JSON.stringify(over)}: ${p.join(" | ") || "clean"}`);
  };
  const starts = field().starts;
  bad({ entries: "gate" }, '"entries" must be a list');
  bad({ entries: [{ id: "gate", name: "A", kind: "gate" }, { id: "gate", name: "B", kind: "gate" }, { id: "loft", name: "L", kind: "landing" }] }, 'Entry id "gate" is used twice');
  bad({ entries: [{ name: "The back door", kind: "gate" }, ...field().entries] }, 'The entry "The back door" has no id.');
  bad({ entries: [{ kind: "gate" }, ...field().entries] }, "An entry has no id.");
  assert.ok(!lintMap(field({ entries: [{ kind: "gate" }, ...field().entries] })).some((x) => x.includes("undefined")), "no message says undefined");
  bad({ entries: ["gate", ...field().entries] }, "An entry is not a record.");
  bad({ entries: [null, ...field().entries] }, "An entry is not a record.");
  bad({ entries: Array.from({ length: 101 }, (_, i) => ({ id: `e${i}`, name: `E${i}`, kind: "other" })) }, "It has more than 100 entries.");
  bad({ starts: [...starts, { q: 1, r: 1, entry: 5 }] }, 'belongs to an entry that does not exist: "5"');
  bad({ entries: [{ id: "gate", kind: "gate" }, { id: "loft", name: "L", kind: "landing" }] }, 'Entry "gate" has no name');
  bad({ entries: [{ id: "gate", name: "G", kind: "door" }, { id: "loft", name: "L", kind: "landing" }] }, 'Entry "gate" has kind "door"');
  bad({ entries: [...field().entries, { id: "well", name: "The well", kind: "other" }] }, 'Entry "well" has no start');
  bad({ starts: [...starts, { q: 1, r: 1, entry: "dock" }] }, 'belongs to an entry that does not exist: "dock"');
  // A circle names its object, which must be on the map; nothing else names one.
  const circle = (en) => ({ entries: [...field().entries, en], starts: [...starts, { q: 2, r: 0, entry: "c" }] });
  bad(circle({ id: "c", name: "The circle", kind: "circle" }), 'Entry "c" is a circle and names no object');
  bad(circle({ id: "c", name: "The circle", kind: "circle", object: "o9" }), 'Entry "c" is a circle and names no object');
  assert.deepEqual(lintMap(field(circle({ id: "c", name: "The circle", kind: "circle", object: "o1" }))), []);
  bad(circle({ id: "c", name: "The circle", kind: "gate", object: "o1" }), "only a circle does");
  // A start on a level: the level must exist and have a tile there.
  bad({ starts: [...starts, { level: "attic", q: 0, r: 0 }] }, 'on a level that does not exist: "attic"');
  bad({ starts: [...starts, { level: "loft", q: 3, r: 0 }] }, "The start at 3,0 has nothing to stand on");
});

test("mapEdit sets entries beside starts, checks them whole, and a bad change leaves the map as it was", () => {
  const s = newGame(5);
  const at = Object.values(s.entities).find((e) => e.side === "party").pos;
  const before = structuredClone(s.map);
  // An entry with no start is refused, and nothing changes.
  const r = apply(s, { type: "mapEdit", ops: [{ op: "entries", entries: [{ id: "gate", name: "The gate", kind: "gate" }] }] }, DM);
  assert.ok(!r.ok);
  assert.match(r.error, /Entry "gate" has no start/);
  assert.deepEqual(s.map, before);
  // Given with a start, it is kept.
  ok(apply(s, { type: "mapEdit", ops: [
    { op: "entries", entries: [{ id: "gate", name: "The gate", kind: "gate" }] },
    { op: "starts", starts: [...s.map.starts, { q: at.q, r: at.r, entry: "gate" }] },
  ] }, DM));
  assert.deepEqual(s.map.entries, [{ id: "gate", name: "The gate", kind: "gate" }]);
  assert.equal(s.map.starts.at(-1).entry, "gate");
  // Taking the entries away while a start still names one is refused; taking both is not, and leaves no field.
  assert.ok(!apply(s, { type: "mapEdit", ops: [{ op: "entries", entries: [] }] }, DM).ok);
  ok(apply(s, { type: "mapEdit", ops: [{ op: "entries", entries: null }, { op: "starts", starts: before.starts }] }, DM));
  assert.ok(!("entries" in s.map));
  assert.deepEqual(s.map, before);
});

test("removing a level takes the starts placed on it", () => {
  const m = field();
  // The loft entry loses its only start: the edit alone leaves a map the linter refuses.
  assert.equal(EDITS.unlevel(m, { id: "loft" }), undefined);
  assert.ok(!m.starts.some((st) => st.level === "loft"));
  assert.ok(lintMap(m).some((x) => x.includes('Entry "loft" has no start')));
  EDITS.entries(m, { entries: m.entries.filter((en) => en.id !== "loft") });
  assert.deepEqual(lintMap(m), []);
});

test("unlevel through mapEdit: refused while an entry would be left with no start, and done with the entries in the same change", () => {
  const s = newGame(5);
  ok(apply(s, { type: "loadMap", map: field() }, DM));
  const before = structuredClone(s);
  const r = apply(s, { type: "mapEdit", ops: [{ op: "unlevel", id: "loft" }] }, DM);
  assert.ok(!r.ok);
  assert.match(r.error, /Entry "loft" has no start/);
  assert.deepEqual(s, before, "nothing changed");
  ok(apply(s, { type: "mapEdit", ops: [{ op: "unlevel", id: "loft" }, { op: "entries", entries: field().entries.filter((en) => en.id !== "loft") }] }, DM));
  assert.deepEqual(s.map.levels.map((l) => l.id), ["ground"]);
  assert.deepEqual(s.map.starts, [{ q: -4, r: 0 }, { q: 4, r: 0, entry: "gate" }]);
  assert.deepEqual(s.map.entries.map((en) => en.id), ["gate"]);
});

test("a start whose level is gone is read by its cell: such a map loads, and a saved table with one still loads", () => {
  // A level removed before unlevel took its starts with it.
  const stale = () => field({ entries: undefined, starts: [{ level: "attic", q: -4, r: 0 }, { q: 4, r: 0 }] });
  assert.deepEqual(migrateMap(stale()).starts, [{ q: -4, r: 0 }, { q: 4, r: 0 }]);
  const s = newGame(5);
  ok(apply(s, { type: "loadMap", map: stale() }, DM));
  assert.deepEqual(Object.values(s.entities).find((e) => e.side === "party").pos, { q: -4, r: 0, z: 0 });
  // The same start in a saved table's map: the load drops the stale level, and the map can be edited.
  const saved = structuredClone(s);
  saved.map.starts[0].level = "attic";
  const back = migrate(saved);
  assert.deepEqual(back.map.starts[0], { q: -4, r: 0 });
  assert.deepEqual(lintMap(back.map), []);
  ok(apply(back, { type: "mapEdit", ops: [{ op: "tile", level: "ground", at: { q: 5, r: -5 }, tile: { t: "grass" } }] }, DM));
});

test("a player is sent no entries and no start's entry (canary)", () => {
  const s = newGame(5);
  const m = field();
  m.entries = m.entries.map((en) => ({ ...en, name: `CANARY-${en.id}` }));
  ok(apply(s, { type: "loadMap", map: m, entry: "gate" }, DM));
  const v = view(s, { role: "player", userId: "pat" });
  assert.ok(!("entries" in v.map), "no entries");
  for (const st of v.map.starts ?? []) assert.ok(!("entry" in st), "no start names an entry");
  const sent = JSON.stringify(v);
  assert.ok(!sent.includes("CANARY"), "no entry name");
  assert.ok(!/"entr(y|ies)"/.test(sent), "no entry field anywhere");
});
