// The map document's entries (docs/specs/travel.md, Decision 3): what lintMap checks of them and of a
// start's `entry` and `level`, and the `entries` change of mapEdit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import * as H from "../src/hex.js";
import { EDITS, ENTRY_KINDS, lintMap, newMap } from "../src/map.js";
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
  bad({ entries: [{ id: "gate", name: "A", kind: "gate" }, { id: "gate", name: "B", kind: "gate" }, { id: "loft", name: "L", kind: "landing" }] }, 'Entry id "gate" is missing or used twice');
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
