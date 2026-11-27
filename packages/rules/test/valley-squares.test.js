// The starter valley on squares (docs/specs/square-grid.md, Decision 7, row S12): the same place as the
// hex valley, made beside it. The hex valley stays what it was: newGame(seed) is byte for byte main's.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import { apply, current } from "../src/engine.js";
import { HEX, SQUARE } from "../src/grid.js";
import { lintMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";
import { typedGame } from "./fixtures/typed.js";        // the digests are of a valley whose starters were hand-typed (#672)
import { TILES } from "../src/content/terrain.js";

const DM = { role: "dm", userId: "dm" };
const sha = (s) => createHash("sha256").update(JSON.stringify(s)).digest("hex");

// The digest of JSON.stringify(newGame(seed)) as the hex valley made it before the square valley existed
// (taken from origin/main, 14 November 2026; re-taken on 19 November 2026 for #495: the valley's wolf now carries `largest` on its Prone step and its new text in its copy of the action. Nothing else about the valley changed).
const MAIN = {
  1: "e83c37a8ec42ce400f79ccb6a0e79a1e78e0eb3c46c97a94040d98b75e9c57f9",
  2: "3201f116c585a28b38a16120a9c0fc0e4d78d5038348cf5c60fd29e6b535e3cc",
  3: "1520d4ec33ca0b2dff870a5debd008ec375cafaad9403890da15784a9c305409",
  5: "42ab84f4c5a7231c3892b41106024b7204cf27c6e8bf317f263e997a06e801f7",
  7: "82bbe3185f47a9267d2cf880ae56c1aa73e5af44cab2a7bf6400555482ad5a0f",
  11: "ab4a42b391fa8d07353597e413203533d8ca3c316a213e16958e3f9ab7290e75",
  42: "725f928ecff3999b008209610460b1d951d0edc60991e01e6fd1998e44f969fa",
  12345: "8b50231da8d5eb6a15f48d958f28c1bbb687c5609a42634f51969d6849fc8c2b",
  987654321: "840a2473430014cbe33db6d95c6bdd27fb536fc3b6392a30f43b3f8fa356aa96",
};

// The digests were taken at state version 21; the version has moved since (22, #300) and nothing else.
const asMain = (s) => { const { packs, scoreRolls, ...rest } = s; return { ...rest, version: 21 }; };   // `packs: []` (24, #390) and `scoreRolls` (25, #557) are new too
test("the default valley is the hex valley, byte for byte what main made, for several seeds", () => {
  for (const [seed, digest] of Object.entries(MAIN)) {
    assert.equal(sha(asMain(typedGame(Number(seed)))), digest, `seed ${seed}`);
    assert.equal(sha(asMain(typedGame(Number(seed), {}))), digest, `seed ${seed} with empty options`);
    assert.equal(sha(asMain(typedGame(Number(seed), { grid: "hex" }))), digest, `seed ${seed} asked for hexes`);
  }
  assert.equal(sha(asMain(typedGame())), MAIN[7], "the default seed");
  assert.equal(newGame(7).map.grid, "hex");
});

const squares = (seed = 7) => newGame(seed, { grid: "square" });
const creatures = (s) => Object.values(s.entities);
const tileAt = (s, p) => s.map.levels[0].tiles[`${p.q},${p.r}`];

test("the square valley is a clean square map of the valley's size", () => {
  const s = squares();
  assert.deepEqual(lintMap(s.map), []);
  assert.equal(s.map.grid, "square");
  assert.equal(s.map.id, "valley-squares");
  assert.deepEqual(JSON.parse(JSON.stringify(s.map)), s.map, "plain data");
  const ks = Object.keys(s.map.levels[0].tiles).map((k) => k.split(",").map(Number));
  const across = Math.max(...ks.map((k) => k[0])) - Math.min(...ks.map((k) => k[0])) + 1;
  assert.ok(across >= 25 && across <= 31, `${across} squares across (the hex valley is 27 hexes across)`);
  assert.deepEqual(s.map.starts, [{ q: s.entities.fighter.pos.q, r: s.entities.fighter.pos.r }]);
});

test("it is the hex valley's place: the same heroes, foes, numbers, dice, clock, settings and chronicle", () => {
  for (const seed of [1, 7, 42]) {
    const h = newGame(seed), s = squares(seed);
    assert.deepEqual(Object.keys(s.entities), Object.keys(h.entities));
    for (const id of Object.keys(h.entities)) assert.deepEqual({ ...s.entities[id], pos: 0 }, { ...h.entities[id], pos: 0 }, id);
    for (const k of ["version", "rng", "seq", "clock", "encounter", "conclusion", "scene", "effects", "handouts", "timeline", "settings"]) assert.deepEqual(s[k], h[k], k);
  }
});

test("every square takes the terrain under its centre on the hex valley, so trees, rocks, water and the ruin keep their places", () => {
  const h = newGame(7), s = squares(7);
  const hexTiles = h.map.levels[0].tiles, here = (id) => s.entities[id].pos;
  const standing = new Set(creatures(s).map((e) => `${e.pos.q},${e.pos.r}`));
  let n = 0;
  for (const [k, t] of Object.entries(s.map.levels[0].tiles)) {
    if (standing.has(k)) continue;
    const [q, r] = k.split(",").map(Number), [x, y] = SQUARE.center({ q, r }), under = hexTiles[HEX.col(HEX.cell(x, y))];
    assert.ok(under, `${k} lies on the hex valley`);
    assert.equal(t.t, under.t, k);
    n++;
  }
  assert.ok(n > 400);
  const kinds = {};
  for (const t of Object.values(s.map.levels[0].tiles)) kinds[t.t] = (kinds[t.t] ?? 0) + 1;
  for (const t of ["grass", "forest", "rock", "stone", "water"]) assert.ok(kinds[t] > 5, `some ${t}`);
  // The pond lies south of the clearing (about 30 ft south of the middle) and the ruin north, as on the hex valley.
  const pond = Object.entries(s.map.levels[0].tiles).filter(([, t]) => t.t === "water").map(([k]) => k.split(",").map(Number));
  assert.ok(pond.length > 5 && pond.every(([q, r]) => r >= 4 && Math.abs(q) <= 4), "the pond is south of the middle");
  assert.ok(here("m5").r < -5 && here("m6").r < -5, "the skeletons are at the ruin in the north");
});

test("the first fight is laid out as on the hex valley: each foe is as far from the party as it was", () => {
  const h = newGame(7), s = squares(7);
  for (const id of ["m1", "m2", "m3", "m4", "m5", "m6"]) {
    const feet = (g, e) => { const [x1, y1] = g.center(e.pos), [x2, y2] = g.center(g === HEX ? h.entities.fighter.pos : s.entities.fighter.pos); return Math.hypot(x1 - x2, y1 - y2); };
    const a = feet(HEX, h.entities[id]), b = feet(SQUARE, s.entities[id]);
    assert.ok(Math.abs(a - b) <= 8, `${id}: ${a.toFixed(1)} ft on hexes, ${b.toFixed(1)} ft on squares`);
  }
});

test("every hero and foe stands on a legal square of its own", () => {
  for (const seed of [1, 7, 42, 987654321]) {
    const s = squares(seed), seen = new Set();
    for (const e of creatures(s)) {
      const t = tileAt(s, e.pos);
      assert.ok(t && TILES[t.t].cost < Infinity, `${e.id} stands on ground`);
      assert.equal(e.pos.z, 0);
      const k = `${e.pos.q},${e.pos.r}`;
      assert.ok(!seen.has(k), `${e.id} shares a square`);
      seen.add(k);
    }
    assert.equal(creatures(s).length, 10);
  }
});

// The squares a walker can reach by side steps over walkable ground.
const reach = (s, from) => {
  const seen = new Set([`${from.q},${from.r}`]), todo = [from];
  while (todo.length) {
    const c = todo.pop();
    for (const n of SQUARE.neighbors(c).slice(0, 4)) {
      const k = `${n.q},${n.r}`, t = s.map.levels[0].tiles[k];
      if (seen.has(k) || !t || TILES[t.t].cost === Infinity) continue;
      seen.add(k); todo.push(n);
    }
  }
  return seen;
};

test("the party can walk to every foe", () => {
  for (const seed of [1, 7, 42]) {
    const s = squares(seed), got = reach(s, s.entities.fighter.pos);
    for (const e of creatures(s)) assert.ok(got.has(`${e.pos.q},${e.pos.r}`), `${e.id} can be reached`);
  }
});

test("the engine moves a hero on it and starts the first fight", () => {
  const s = squares(7), f = s.entities.fighter, from = { ...f.pos };
  const r = apply(s, { type: "move", actor: "fighter", to: { q: from.q + 1, r: from.r - 1, z: 0 } }, DM);
  assert.ok(r.ok, r.error);
  assert.notDeepEqual(s.entities.fighter.pos, from);
  const w = squares(7), fight = apply(w, { type: "startEncounter", center: w.entities.m1.pos, radius: 12 }, DM);
  assert.ok(fight.ok, fight.error);
  assert.ok(w.encounter, "the fight is on");
});

// Let the monster AI play every creature to the end. The AI's own choice must never be refused.
function play(s, max = 3000) {
  let end = null, steps = 0;
  for (; steps < max && s.encounter; steps++) {
    const id = current(s), step = aiStep(s, id);
    const res = apply(s, step ?? { type: "endTurn", actor: id }, DM);
    assert.ok(res.ok, `${id} was refused ${JSON.stringify(step)}: ${res.error}`);
    end = res.events.find((e) => e.type === "encounterEnd") ?? end;
  }
  return { end, steps };
}

test("a seeded fight on the square valley runs to its end through the monster AI without a refused action", () => {
  for (const seed of [1, 2, 3, 7, 11]) {
    const s = squares(seed);
    assert.ok(apply(s, { type: "startEncounter", center: s.entities.m1.pos, radius: 30 }, DM).ok);
    const { end, steps } = play(s);
    assert.ok(end, `seed ${seed}: the fight ended`);
    assert.ok(["victory", "defeat"].includes(end.result), end.result);
    assert.ok(steps > 10 && !s.encounter, `seed ${seed}`);
  }
});

test("the same seed plays the same fight on the square valley twice", () => {
  const run = () => { const s = squares(3); apply(s, { type: "startEncounter", center: s.entities.m1.pos, radius: 30 }, DM); play(s); return sha(s); };
  assert.equal(run(), run());
});
