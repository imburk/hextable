// Travel W1 (docs/specs/travel.md, Decision 3): a map's entries, `loadMap { entry }`, arrivals in
// marching order, and a start's height from its level (P18).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import * as H from "../src/hex.js";
import { gridOf, key, parse } from "../src/grid.js";
import { STOCK_MAPS } from "../src/content/maps/index.js";
import keep from "../src/content/maps/keep.js";
import { TILES } from "../src/content/terrain.js";
import { newGame } from "../src/scenario.js";
import { ground, landing, STEP_MAX } from "../src/space.js";
import { barriers } from "../src/walls.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const party = (s) => Object.values(s.entities).filter((e) => e.side === "party");

// Greywatch with two entries: the gatehouse, and the roof of the lord's chamber on the upper floor (z 10,
// over the kitchen). The roof's starts give no `z`: their level gives it. The first is under the Lord's
// chest, where nobody can stand, and is passed over.
const GATE = [{ q: -13, r: 1 }, { q: -12, r: 1 }];
const ROOF = [{ q: -1, r: -6 }, { q: 0, r: -6 }, { q: 1, r: -6 }, { q: 0, r: -5 }, { q: 1, r: -5 }, { q: 2, r: -5 }];
const keepWithEntries = () => {
  const m = structuredClone(keep);
  m.entries = [{ id: "gate", name: "The gatehouse", kind: "gate" }, { id: "roof", name: "The chamber roof", kind: "landing" }];
  m.starts = [...m.starts, ...GATE.map((h) => ({ level: "ground", ...h, entry: "gate" })), ...ROOF.map((h) => ({ level: "upper", ...h, entry: "roof" }))];
  return m;
};

test("the keep sets the party down at its gate, at its roof, and at its default starts with no entry named", () => {
  const map = keepWithEntries();
  // The gate: its two starts, then the spiral out from the first.
  const g = newGame(5);
  assert.equal(party(g).length, 4, "the starter party is four");
  ok(apply(g, { type: "loadMap", map, entry: "gate" }, DM));
  const gp = party(g).map((e) => e.pos);
  assert.deepEqual(gp.slice(0, 2), GATE.map((h) => ({ ...h, z: 0 })));
  for (const p of gp.slice(2)) assert.ok(H.dist(p, GATE[0]) <= 2 && p.z === 0, `${key(p)} beside the gate`);
  assert.equal(new Set(gp.map(key)).size, gp.length);
  // The roof: on the upper floor (z 10) though no start gives a z; the chest's cell is passed over.
  const r = newGame(5);
  ok(apply(r, { type: "loadMap", map, entry: "roof" }, DM));
  assert.deepEqual(party(r).map((e) => e.pos), ROOF.slice(1, 1 + party(r).length).map((h) => ({ ...h, z: 10 })));
  // No entry: the starts that belong to none, exactly where the plain keep puts them.
  const d = newGame(5), plain = newGame(5);
  ok(apply(d, { type: "loadMap", map }, DM));
  ok(apply(plain, { type: "loadMap", map: structuredClone(keep) }, DM));
  assert.deepEqual(party(d).map((e) => e.pos), party(plain).map((e) => e.pos));
  assert.deepEqual(party(d).map((e) => e.pos), keep.starts.slice(0, party(d).length).map((h) => ({ ...h, z: 0 })));
});

test("a start on a level gets its height from the level (P18); one with its own z keeps it", () => {
  const map = structuredClone(keep);
  map.starts = [{ level: "upper", q: 0, r: -6 }, { q: 1, r: -6 }, { q: 2, r: -5, z: 10 }];
  const s = newGame(3);
  ok(apply(s, { type: "loadMap", map }, DM));
  const [a, b, c] = party(s).map((e) => e.pos);
  assert.equal(a.z, 10, "the level's height");
  assert.equal(b.z, 0, "no level and no z: the ground, as before");
  assert.equal(c.z, 10, "its own z");
});

test("an unknown entry and one nobody can stand at are refused, and nothing changes", () => {
  const map = keepWithEntries();
  // The well's one start is the Lord's chest.
  map.entries.push({ id: "well", name: "The well", kind: "other" });
  map.starts.push({ level: "upper", q: -1, r: -6, entry: "well" });
  for (const [entry, words] of [["dock", 'That map has no entry "dock".'], ["well", "Nobody can stand at The well."], [7, 'That map has no entry "7".']]) {
    const s = newGame(5), before = structuredClone(s);
    const r = apply(s, { type: "loadMap", map, entry }, DM);
    assert.ok(!r.ok, `${entry} is refused`);
    assert.equal(r.error, words);
    assert.deepEqual(s, before, `${entry}: nothing changed`);
  }
  // A map with no entries has none to name.
  const s = newGame(5), before = structuredClone(s);
  assert.equal(apply(s, { type: "loadMap", map: structuredClone(keep), entry: "gate" }, DM).error, 'That map has no entry "gate".');
  assert.deepEqual(s, before);
});

test("arrivals come in marching order: the order set by the DM, and a column's leader first", () => {
  const map = keepWithEntries();
  const s = newGame(5), ids = party(s).map((e) => e.id), back = [...ids].reverse();
  ok(apply(s, { type: "marchingOrder", order: back }, DM));
  ok(apply(s, { type: "loadMap", map, entry: "gate" }, DM));
  assert.deepEqual(s.entities[back[0]].pos, { ...GATE[0], z: 0 }, "the first in the order is through the gate first");
  assert.deepEqual(s.entities[back[1]].pos, { ...GATE[1], z: 0 });
  // The party falls in behind its last member: it leads, with no place of its own in the order.
  const t = newGame(5), lead = party(t).at(-1).id;
  ok(apply(t, { type: "partyFollow", leader: lead }, DM));
  ok(apply(t, { type: "loadMap", map, entry: "roof" }, DM));
  assert.deepEqual(t.entities[lead].pos, { ...ROOF[1], z: 10 }, "the leader comes first");
  const rest = party(t).filter((e) => e.id !== lead).sort((a, b) => a.march - b.march);
  rest.forEach((e, i) => assert.deepEqual(e.pos, { ...ROOF[i + 2], z: 10 }, `${e.id} in its place`));
});

test("a map whose every start has an entry sets the party down at its first entry when none is named", () => {
  const map = keepWithEntries();
  map.starts = map.starts.filter((st) => st.entry);
  map.entries.reverse();                                  // the roof is now the first entry
  const s = newGame(5);
  ok(apply(s, { type: "loadMap", map }, DM));
  assert.deepEqual(party(s).map((e) => e.pos), ROOF.slice(1, 1 + party(s).length).map((h) => ({ ...h, z: 10 })));
});

// loadMap as it was before W1 (#154), to hold every stock map to: the party in its own order on the
// starts in order, then the spiral out from the first.
function before(map, n) {
  const walkable = (p) => p && TILES[ground(map, p).tile.t].cost < Infinity;
  const first = map.starts[0] ?? parse(Object.keys(map.levels[0].tiles)[0]);
  const start = landing(map, first, first.z ?? 0), spots = [], taken = new Set(), B = barriers(map), G = gridOf(map);
  const take = (p) => { spots.push(p); taken.add(key(p)); };
  for (const st of map.starts) {
    if (spots.length >= n) break;
    const p = landing(map, st, st.z ?? 0), level = p && ground(map, p)?.level;
    if (walkable(p) && level && !B.solid(level.id, p) && !taken.has(key(p))) take(p);
  }
  for (let d = 0; d < 12 && spots.length < n; d++) for (const h of G.range(start, d)) {
    const p = G.dist(h, start) === d ? landing(map, h, start.z) : null;
    if (walkable(p) && Math.abs(p.z - start.z) <= STEP_MAX && spots.length < n && !taken.has(key(p))) take(p);
  }
  return spots;
}

for (const { id, map } of STOCK_MAPS) {
  test(`${id}: loads as before W1, for a party of 1, 5 and 8`, () => {
    for (const n of [1, 5, 8]) {
      const s = newGame(5);
      const pcs = party(s);
      for (const e of pcs.slice(n)) delete s.entities[e.id];
      for (let i = pcs.length; i < n; i++) s.entities[`x${i}`] = { ...structuredClone(pcs[0]), id: `x${i}` };
      ok(apply(s, { type: "loadMap", map: structuredClone(map) }, DM));
      assert.deepEqual(party(s).map((e) => e.pos), before(map, n), `${id} with ${n}`);
    }
  });
}
