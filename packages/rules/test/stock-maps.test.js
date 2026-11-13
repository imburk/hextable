// The stock maps (content/maps): each is a clean map document, the party can start on it, and
// every room can be reached through its doors.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, moveOptions } from "../src/engine.js";
import * as H from "../src/hex.js";
import { lintMap } from "../src/map.js";
import { STOCK_MAPS } from "../src/content/maps/index.js";
import { TILES } from "../src/content/terrain.js";
import { newGame } from "../src/scenario.js";
import { STEP_MAX, surfaces } from "../src/space.js";
import { barriers, center, objectDef } from "../src/walls.js";

const DM = { role: "dm", userId: "dm" };
const KINDS = ["tavern", "dungeon", "cave", "forest-road", "keep"];

// Where a creature can stand: a tile of walkable terrain with nothing solid on it.
const standable = (map, level, k) => {
  const t = level.tiles[k];
  return !!t && TILES[t.t].cost < Infinity && !barriers(map).solid(level.id, H.parse(k));
};
// The same map with every door open (a secret one found, a lock undone, a portcullis raised).
const withDoorsOpen = (map) => {
  const m = structuredClone(map);
  for (const o of m.objects) {
    const def = objectDef(o);
    if (def.kind !== "door") continue;
    o.state = Object.keys(def.states).find((s) => !def.states[s].blocks.length && !def.states[s].hidden);
  }
  return m;
};
// Every standing place (column and height) a walker can get to from `from`, as the engine walks:
// to a neighbouring surface at most STEP_MAX away in height, with no wall between.
function walk(map, from) {
  const B = barriers(map), seen = new Set([H.key(from)]), todo = [from];
  while (todo.length) {
    const cur = todo.pop(), here = surfaces(map, cur).find((s) => s.z === cur.z).level;
    for (const n of H.neighbors(cur)) for (const sf of surfaces(map, n)) {
      const k = H.key({ q: n.q, r: n.r, z: sf.z });
      if (seen.has(k) || Math.abs(sf.z - cur.z) > STEP_MAX || TILES[sf.tile.t].cost === Infinity || B.solid(sf.level.id, n)) continue;
      if (B.blocked(here.id, cur, n) || (sf.level !== here && B.blocked(sf.level.id, cur, n))) continue;
      seen.add(k); todo.push({ q: n.q, r: n.r, z: sf.z });
    }
  }
  return seen;
}

test("there are five stock maps with the ids the docs list", () => {
  assert.deepEqual(STOCK_MAPS.map((m) => m.id), KINDS);
  for (const m of STOCK_MAPS) { assert.equal(m.map.id, m.id); assert.ok(m.name && m.text); }
});

for (const { id, map } of STOCK_MAPS) {
  test(`${id}: a clean map document of plain data, with no creatures, of a size that plays on a phone`, () => {
    assert.deepEqual(lintMap(map), []);
    assert.deepEqual(JSON.parse(JSON.stringify(map)), map, "only data: no functions, no undefined");
    assert.ok(map.regions.length >= 4, "rooms to reveal");
    assert.ok(map.regions.every((r) => r.name), "every room is named");
    assert.ok(map.starts.length >= 5, "a start for each of five");
    const xs = [], ys = [];
    for (const l of map.levels) for (const k of Object.keys(l.tiles)) { const [x, y] = center(H.parse(k)); xs.push(x / 5); ys.push(y / 5); }
    const across = Math.max(Math.max(...xs) - Math.min(...xs), (Math.max(...ys) - Math.min(...ys)) / 0.866) + 1;
    assert.ok(across >= 20 && across <= 40, `${Math.round(across)} hexes across`);
  });

  test(`${id}: every start can be stood on and they are all in one place`, () => {
    const level = (st) => map.levels.find((l) => standable(map, l, `${st.q},${st.r}`));
    for (const st of map.starts) assert.ok(level(st), `start ${st.q},${st.r}`);
    const first = map.starts[0], l0 = level(first), reach = walk(map, { q: first.q, r: first.r, z: l0.z + (l0.tiles[`${first.q},${first.r}`].h ?? 0) });
    for (const st of map.starts) assert.ok([...reach].some((k) => k.split(",").slice(0, 2).join(",") === `${st.q},${st.r}`), `start ${st.q},${st.r} is cut off from the first`);
  });

  test(`${id}: every room can be reached from the start through its doors`, () => {
    const open = withDoorsOpen(map), first = open.starts[0];
    const l0 = open.levels.find((l) => l.tiles[`${first.q},${first.r}`]);
    const reach = walk(open, { q: first.q, r: first.r, z: l0.z + (l0.tiles[`${first.q},${first.r}`].h ?? 0) });
    const cols = new Set([...reach].map((k) => k.split(",").slice(0, 2).join(",")));
    for (const r of open.regions) {
      const level = open.levels.find((l) => l.id === r.level);
      const floor = r.hexes.filter((k) => standable(open, level, k));
      assert.ok(floor.length > 0, `${r.name} has floor`);
      assert.ok(floor.some((k) => reach.has(H.key({ ...H.parse(k), z: level.z + (level.tiles[k].h ?? 0) }))), `${r.name} cannot be reached`);
    }
    assert.ok(cols.size > 0);
  });

  test(`${id}: the engine loads it, sets the party down on it, and a pawn can move`, () => {
    const s = newGame(5);
    const r = apply(s, { type: "loadMap", map: structuredClone(map) }, DM);
    assert.ok(r.ok, r.error);
    assert.equal(s.map.id, id);
    assert.deepEqual(Object.values(s.entities).filter((e) => e.side !== "party"), [], "no monsters");
    for (const e of Object.values(s.entities)) assert.ok(moveOptions(s, e).size > 1, `${e.id} can move`);
  });
}

test("the maps use their features: locked and secret doors, a diagonal wall, two floors joined by stairs, a height change", () => {
  const by = Object.fromEntries(STOCK_MAPS.map((m) => [m.id, m.map]));
  const doors = (m, state) => m.objects.filter((o) => o.state === state);
  assert.ok(doors(by.tavern, "locked").length && doors(by.tavern, "secret").length);
  assert.ok(doors(by.dungeon, "locked").length && doors(by.dungeon, "secret").length);
  assert.ok(by.dungeon.regions.filter((r) => r.level === "ground").length >= 14, "six to eight rooms and their passages");
  assert.ok(by.dungeon.walls.some((w) => Math.abs(w.a[0] - w.b[0]) > 0.1 && Math.abs(w.a[1] - w.b[1]) > 0.1), "a wall on the diagonal");
  assert.ok(by.tavern.levels.length === 2 && by.keep.levels.length === 2);
  for (const m of [by.tavern, by.keep]) assert.ok(m.levels.some((l) => Object.values(l.tiles).some((t) => t.h)), "stairs");
  assert.ok(Object.values(by.cave.levels[0].tiles).some((t) => t.h >= 7.5) && Object.values(by.cave.levels[0].tiles).some((t) => t.t === "rock"));
  assert.ok(by["forest-road"].levels[0].tiles && Object.values(by["forest-road"].levels[0].tiles).some((t) => t.t === "water") && Object.values(by["forest-road"].levels[0].tiles).some((t) => t.t === "forest"));
});
