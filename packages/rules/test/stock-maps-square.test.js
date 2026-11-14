// The stock map on squares (content/maps/undercroft.js, row S12): a clean map document, a start for five,
// every room reachable through its doors, and corridors 5 and 10 feet wide. The five hex maps have their
// own tests in stock-maps.test.js.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, moveOptions } from "../src/engine.js";
import { SQUARE } from "../src/grid.js";
import { lintMap } from "../src/map.js";
import { ALL_STOCK_MAPS, SQUARE_STOCK_MAPS, STOCK_MAPS } from "../src/content/maps/index.js";
import { TILES } from "../src/content/terrain.js";
import { newGame } from "../src/scenario.js";
import { landing } from "../src/space.js";
import { barriers, objectDef } from "../src/walls.js";

const DM = { role: "dm", userId: "dm" };
const map = SQUARE_STOCK_MAPS[0].map;
const level = map.levels[0];
const cell = (k) => { const [q, r] = k.split(",").map(Number); return { q, r }; };
const standable = (m, k) => { const t = m.levels[0].tiles[k]; return !!t && TILES[t.t].cost < Infinity && !barriers(m).solid("ground", cell(k)); };
// The same map with its doors open: all of them, or only the plain ones (not a secret panel, not a locked door).
const withDoorsOpen = (m, plainOnly = false) => {
  const o = structuredClone(m);
  for (const d of o.objects) {
    const def = objectDef(d);
    if (def.kind !== "door" || (plainOnly && ["secret", "locked"].includes(d.state))) continue;
    d.state = Object.keys(def.states).find((s) => !def.states[s].blocks.length && !def.states[s].hidden);
  }
  return o;
};
// The squares a walker reaches by side steps (a subset of what the engine allows), with no wall in the way.
function walk(m, from) {
  const B = barriers(m), seen = new Set([`${from.q},${from.r}`]), todo = [from];
  while (todo.length) {
    const c = todo.pop();
    for (const n of SQUARE.neighbors(c).slice(0, 4)) {
      const k = `${n.q},${n.r}`;
      if (seen.has(k) || !standable(m, k) || B.blocked("ground", c, n)) continue;
      seen.add(k); todo.push(n);
    }
  }
  return seen;
}

test("the square stock map is listed with the five hex maps, which stay as they were", () => {
  assert.deepEqual(STOCK_MAPS.map((m) => m.id), ["tavern", "dungeon", "cave", "forest-road", "keep"]);
  assert.ok(STOCK_MAPS.every((m) => m.map.grid === "hex"));
  assert.deepEqual(ALL_STOCK_MAPS.map((m) => m.id), ["tavern", "dungeon", "cave", "forest-road", "keep", "undercroft"]);
  const m = SQUARE_STOCK_MAPS[0];
  assert.ok(m.name && m.text);
  assert.equal(m.map.id, m.id);
  assert.equal(map.grid, "square");
});

test("undercroft: a clean map of plain data, no creatures, rooms to reveal, a start for five, a size that plays on a phone", () => {
  assert.deepEqual(lintMap(map), []);
  assert.deepEqual(JSON.parse(JSON.stringify(map)), map, "only data");
  assert.ok(map.regions.length >= 4 && map.regions.every((r) => r.name), "rooms to reveal, each named");
  assert.ok(map.starts.length >= 5);
  const ks = Object.keys(level.tiles).map(cell);
  const wide = Math.max(...ks.map((c) => c.q)) - Math.min(...ks.map((c) => c.q)) + 1, tall = Math.max(...ks.map((c) => c.r)) - Math.min(...ks.map((c) => c.r)) + 1;
  assert.ok(Math.max(wide, tall) >= 20 && Math.max(wide, tall) <= 40, `${wide} by ${tall} squares`);
  assert.equal(new Set(map.starts.map((s) => `${s.q},${s.r}`)).size, map.starts.length, "no two starts on one square");
  assert.ok(map.levels.every((l) => l.light) && map.regions.some((r) => r.light === "dark") && map.regions.some((r) => r.light === "bright"), "light");
});

test("undercroft: doors stand on square sides, with a secret one, a locked one and a portcullis", () => {
  const doors = map.objects.filter((o) => objectDef(o).kind === "door");
  assert.ok(doors.length >= 5);
  for (const d of doors) {
    assert.ok(Number.isInteger(d.edge) && d.edge >= 0 && d.edge <= 3, `${d.id} is on one of four sides`);
    const [a, b] = SQUARE.edgeSegment(d.at, d.edge), here = level.tiles[`${d.at.q},${d.at.r}`], over = level.tiles[`${d.at.q + SQUARE.DIRS[d.edge][0]},${d.at.r + SQUARE.DIRS[d.edge][1]}`];
    assert.ok(here && over, `${d.id} has a square on each side`);
    assert.ok(Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) - 5) < 1e-9, "a door is one side, 5 ft");
  }
  assert.ok(doors.some((d) => d.def === "secret-door" && d.state === "secret"));
  assert.ok(doors.some((d) => d.state === "locked" && d.key));
  assert.ok(doors.some((d) => d.def === "portcullis"));
});

test("undercroft: there are corridors 5 and 10 feet wide, and the walls run on square sides and corners", () => {
  const width = (id) => {
    const r = map.regions.find((x) => x.id === id), cs = r.hexes.map(cell);
    const along = new Set(cs.map((c) => c.q)).size > new Set(cs.map((c) => c.r)).size ? "r" : "q";     // the long way runs along the other axis
    return new Set(cs.map((c) => c[along])).size;
  };
  for (const id of ["narrow", "north", "east", "vault-pass"]) assert.equal(width(id), 1, `${id} is one square wide`);
  for (const id of ["gallery", "wide"]) assert.equal(width(id), 2, `${id} is two squares wide`);
  for (const w of map.walls) {
    const horizontal = w.a[1] === w.b[1], vertical = w.a[0] === w.b[0];
    assert.ok(horizontal !== vertical, `${w.id} is straight`);
    for (const p of [w.a, w.b]) assert.ok(p.every((n) => Math.abs(((n + 2.5) / 5) - Math.round((n + 2.5) / 5)) < 1e-9), `${w.id} ends on a corner`);
    assert.ok([w.a, w.b].every((p) => p.every((n) => Math.abs(n / 5 - Math.round(n / 5)) > 0.49)), `${w.id}'s ends are square corners`);
  }
});

test("undercroft: every start can be stood on, they are in one place, and every room can be reached once the doors are open", () => {
  for (const s of map.starts) assert.ok(standable(map, `${s.q},${s.r}`), `start ${s.q},${s.r}`);
  const shut = walk(withDoorsOpen(map, true), map.starts[0]);
  for (const s of map.starts) assert.ok(walk(map, map.starts[0]).has(`${s.q},${s.r}`), "the starts are together");
  const open = withDoorsOpen(map), got = walk(open, map.starts[0]);
  for (const r of map.regions) assert.ok(r.hexes.filter((k) => standable(open, k)).some((k) => got.has(k)), `${r.name} cannot be reached`);
  // And the doors matter: with the secret panel and the lock still shut, the cache and the strongroom are out of reach.
  for (const id of ["cache", "strong"]) assert.ok(!map.regions.find((r) => r.id === id).hexes.some((k) => shut.has(k)), `${id} is behind a door that is shut`);
  assert.ok(map.regions.find((r) => r.id === "armory").hexes.some((k) => shut.has(k)), "the armory is reached through the plain doors, the portcullis and the arches");
});

test("undercroft: the engine loads it, sets the party down on the starts in order, and a pawn can move", () => {
  const s = newGame(5);
  const r = apply(s, { type: "loadMap", map: structuredClone(map) }, DM);
  assert.ok(r.ok, r.error);
  assert.equal(s.map.id, "undercroft");
  assert.equal(s.map.grid, "square");
  assert.deepEqual(Object.values(s.entities).filter((e) => e.side !== "party"), [], "no monsters");
  const party = Object.values(s.entities);
  party.forEach((e, i) => assert.deepEqual(e.pos, landing(map, map.starts[i], 0), `${e.id} on start ${i}`));
  for (const e of party) assert.ok(moveOptions(s, e).size > 1, `${e.id} can move`);
});
