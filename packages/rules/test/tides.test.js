// Swimming, stage E3 of docs/specs/fly-swim-control.md (#849): water that rises and falls. The tile arithmetic of tides.js, the DM's `water` action,
// who is carried when the water changes, and a tide that steps each round of a fight.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { lintMap, newMap } from "../src/map.js";
import { setSurface } from "../src/tides.js";
import { waterAt, submerged } from "../src/space.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "it was refused"); if (re) assert.match(r.error, re); return r; };
const json = (x) => JSON.stringify(x);

const mapOf = (tiles, extra = {}) => newMap({ id: "cave", name: "Cave", starts: [{ q: 0, r: 0 }], levels: [{ id: "g", name: "G", z: 0, tiles }], ...extra });
const flat = () => mapOf({ "0,0": { t: "stone" }, "1,0": { t: "water", depth: 10 }, "2,0": { t: "stone", h: 5 } });

test("setSurface: rise over stone, over water, back down to dry; `dry` is kept once", () => {
  const m = flat(), lv = m.levels[0];
  const up = setSurface(m, "g", ["0,0"], 5).tiles["0,0"];
  assert.deepEqual(up, { t: "water", h: 5, depth: 5, dry: { t: "stone" } });
  lv.tiles["0,0"] = up;                                           // (a copy of the map in play would be used; this is arithmetic only)
  const higher = setSurface(m, "g", ["0,0"], 15).tiles["0,0"];
  assert.deepEqual(higher, { t: "water", h: 15, depth: 15, dry: { t: "stone" } }, "the first dry tile is the one kept");
  assert.deepEqual(setSurface(m, "g", ["0,0"], 0).tiles["0,0"], { t: "stone" }, "at the floor it is its dry tile again, with no dry key");
  assert.deepEqual(setSurface(m, "g", ["0,0"], -5).tiles["0,0"], { t: "stone" });
  // over water: the bed is the floor
  assert.deepEqual(setSurface(m, "g", ["1,0"], 5).tiles["1,0"], { t: "water", h: 5, depth: 15, dry: { t: "water", depth: 10 } });
  // a drained water tile becomes its bed
  assert.deepEqual(setSurface(m, "g", ["1,0"], -10).tiles["1,0"], { t: "stone", h: -10, dry: { t: "water", depth: 10 } });
  assert.deepEqual(setSurface(m, "g", ["1,0"], -20, { bed: "grass" }).tiles["1,0"].t, "grass");
  assert.equal(lintMap(m).length, 0);
});
test("setSurface refuses what makes no sense", () => {
  const m = flat();
  assert.match(setSurface(m, "g", ["0,0"], 7).problem, /multiple of 5/);
  assert.match(setSurface(m, "g", ["0,0"], 300).problem, /deepest/);
  assert.match(setSurface(m, "g", ["9,9"], 5).problem, /no tile/);
  assert.match(setSurface(m, "x", ["0,0"], 5).problem, /no level/);
  assert.match(setSurface(m, "g", ["1,0"], -10, { bed: "water" }).problem, /bed/);
});
test("the linter accepts a `dry` tile, checks it as a tile, and refuses one inside one", () => {
  const m = flat();
  m.levels[0].tiles["0,0"] = { t: "water", h: 5, depth: 5, dry: { t: "stone" } };
  assert.deepEqual(lintMap(m), []);
  m.levels[0].tiles["0,0"] = { t: "water", h: 5, depth: 5, dry: { t: "mud-pie" } };
  assert.match(lintMap(m)[0], /dry tile/);
  m.levels[0].tiles["0,0"] = { t: "water", h: 5, depth: 5, dry: { t: "stone", dry: { t: "stone" } } };
  assert.match(lintMap(m)[0], /inside a dry tile/);
});

// A row of stone, a creature standing on each of the first cells.
function room() {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (id !== "fighter") delete s.entities[id];
  const tiles = {};
  for (let q = -4; q <= 6; q++) for (let r = -2; r <= 2; r++) tiles[`${q},${r}`] = { t: "stone" };
  ok(apply(s, { type: "loadMap", map: mapOf(tiles) }, DM));
  s.settings.autoEngage = false;
  Object.assign(s.entities.fighter, { pos: { q: 0, r: 0, z: 0 }, hp: 500, maxHp: 500 });
  return s;
}
const big0 = (s, id) => { s.entities[id].pos = { q: 4, r: 1, z: 0 }; ok(apply(s, { type: "setSize", actor: id, size: "large" }, DM)); };
const cellsOf = (...qs) => qs.map((q) => `${q},0`);

test("the water action: rise, fall, by, refusals that change nothing", () => {
  const s = room(), before = json(s);
  const w = (a, who = DM) => apply(s, { type: "water", level: "g", ...a }, who);
  no(w({ cells: ["0,0"], surface: 5 }, { role: "player", userId: "p" }), /DM/);
  for (const a of [{ cells: ["0,0"], surface: 7 }, { cells: ["0,0"], surface: 500 }, { cells: ["99,99"], surface: 5 }, { cells: ["0,0"] }, { cells: ["0,0"], surface: 5, by: 5 },
    { cells: ["0,0"], by: 5, rise: { by: 5, to: 10 } }, { surface: 5 }, { cells: ["0,0"], surface: 5, rise: { by: 0, to: 10 } }, { cells: ["0,0"], surface: 5, rise: { by: -5, to: 10 } },
    { cells: ["0,0"], surface: 5, bed: "water" }, { level: "nope", cells: ["0,0"], surface: 5 }, { cells: ["0,0"], surface: 0 }, { tide: "T9", stop: true }, { region: "none", surface: 5 }]) no(w(a), undefined);
  assert.equal(json(s), before, "every refusal left the game as it was");
  ok(w({ cells: cellsOf(0, 1), surface: 10 }));
  assert.equal(s.map.levels[0].tiles["0,0"].depth, 10);
  assert.equal(waterAt(s.map, { q: 1, r: 0, z: 5 }).z, 10);
  ok(w({ cells: cellsOf(0, 1), by: -5 }));
  assert.equal(s.map.levels[0].tiles["0,0"].h, 5);
  ok(w({ cells: cellsOf(0, 1), by: -5 }));
  assert.deepEqual(s.map.levels[0].tiles["0,0"], { t: "stone" });
  assert.deepEqual(lintMap(s.map), []);
});

test("rising water lifts a creature standing on a cell it covers; one under the surface stays; a Large one by its whole footprint", () => {
  const s = room();
  apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 3, r: 0 } }, DM);
  const gob = Object.values(s.entities).find((e) => e.id !== "fighter");
  Object.assign(gob, { pos: { q: 1, r: 0, z: 0 }, hp: 500, maxHp: 500 });
  const w = (a) => ok(apply(s, { type: "water", level: "g", ...a }, DM));
  const r = w({ cells: cellsOf(0, 1, 2), surface: 10 });
  assert.deepEqual(s.entities.fighter.pos, { q: 0, r: 0, z: 10 });
  assert.equal(r.events.filter((e) => e.type === "moved" && e.water).length, 2);
  assert.equal(submerged(s, s.entities.fighter), false, "it swims at the surface");
  s.entities.fighter.pos.z = 5;                                   // put it under the surface
  w({ cells: cellsOf(0, 1, 2), surface: 15 });
  assert.equal(s.entities.fighter.pos.z, 5, "a creature under the old surface stays where it is, deeper now");
  assert.equal(s.entities.fighter.pos.z < 15, true);
  assert.equal(s.entities[gob.id].pos.z, 15, "the one at the old surface rose with it");
  // a Large creature: lifted when its anchor is held up
  w({ cells: cellsOf(0, 1, 2), surface: 0 });                     // all dry again
  big0(s, gob.id);
  const big = s.entities[gob.id];
  const edge = JSON.parse(json(big.pos));
  w({ cells: ["4,1"], surface: 5 });
  assert.equal(big.pos.z, 5, "a Large creature whose anchor cell floods is lifted");
  assert.deepEqual({ q: big.pos.q, r: big.pos.r }, { q: edge.q, r: edge.r });
});

test("falling water brings a creature down with it, no fall damage; a prone one too; one above the water lands", () => {
  const s = room();
  const w = (a) => ok(apply(s, { type: "water", level: "g", ...a }, DM));
  w({ cells: cellsOf(0, 1), surface: 15 });
  assert.equal(s.entities.fighter.pos.z, 15);
  ok(apply(s, { type: "condition", actor: "fighter", condition: "prone", on: true }, DM));
  const hp = s.entities.fighter.hp;
  w({ cells: cellsOf(0, 1), by: -5 });
  assert.equal(s.entities.fighter.pos.z, 10);
  w({ cells: cellsOf(0, 1), surface: 0 });
  assert.equal(s.entities.fighter.pos.z, 0);
  assert.equal(s.entities.fighter.hp, hp, "the water lowered it: no fall");
  assert.ok(s.entities.fighter.cond.prone);
  // under the surface and now above it
  w({ cells: cellsOf(0, 1), surface: 20 });
  s.entities.fighter.pos.z = 15;
  w({ cells: cellsOf(0, 1), surface: 5 });
  assert.equal(s.entities.fighter.pos.z, 5);
  assert.equal(s.entities.fighter.hp, hp);
  // draining deep water: the bed
  w({ cells: cellsOf(0, 1), surface: 0 });
});

// The Cliff Keep: an inlet 10 feet deep (bed -10), a causeway at 0, side ledges at -5, a dais at +5. The tide starts at the bed and rises 5 a round to 5.
const keep = () => {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (id !== "fighter") delete s.entities[id];
  const tiles = { "-4,0": { t: "stone" }, "-3,0": { t: "stone" }, "-1,0": { t: "stone", h: -5 }, "1,0": { t: "stone", h: -5 }, "5,0": { t: "stone" }, "6,0": { t: "stone" }, "7,0": { t: "stone", h: 5 } };
  for (let q = -2; q <= 4; q++) tiles[`${q},0`] ??= { t: "stone", h: -10 };
  tiles["0,0"] = { t: "stone" };                                  // the causeway
  tiles["-1,0"] = { t: "stone", h: -5 }; tiles["1,0"] = { t: "stone", h: -5 };
  tiles["3,0"] = { t: "stone", h: 5 };                            // the dais
  ok(apply(s, { type: "loadMap", map: mapOf(tiles) }, DM));
  s.settings.autoEngage = false;
  const foe = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: -4, r: 0 } }, DM)).events.find((e) => e.type === "spawned").id;
  Object.assign(s.entities[foe], { pos: { q: -4, r: 0, z: 0 }, hp: 5000, maxHp: 5000 });
  Object.assign(s.entities.fighter, { pos: { q: 0, r: 0, z: 0 }, hp: 500, maxHp: 500 });
  return s;
};
const wet = (s, q) => s.map.levels[0].tiles[`${q},0`].t === "water";
const through = (s, round) => { for (let i = 0; i < 40 && s.encounter.round < round; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); };

test("a tide steps each round of a fight to its end and stops; the Cliff Keep shape", () => {
  const s = keep();
  ok(apply(s, { type: "water", level: "g", cells: cellsOf(-2, -1, 0, 1, 2, 3, 4), rise: { by: 5, to: 5 } }, DM));
  assert.equal(s.tides[0].at, -10, "it starts at the lowest floor");
  assert.equal(s.tides[0].map, "cave");
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, DM));
  assert.equal(wet(s, 2), false, "a tide does not move before the round turns");
  through(s, 2);
  assert.equal(wet(s, 2), true, "round 2: the inlet has water (-5)");
  assert.equal(wet(s, -1), false, "the ledges (-5) are at the water, dry");
  assert.equal(s.entities.fighter.pos.z, 0);
  through(s, 3);
  assert.equal(wet(s, -1), true, "round 3: the ledges are under");
  assert.equal(wet(s, 1), true);
  assert.equal(wet(s, 0), false, "the causeway (0) is at the surface");
  assert.equal(s.entities.fighter.pos.z, 0);
  through(s, 4);
  assert.equal(wet(s, 0), true, "round 4: the causeway is under");
  assert.equal(s.entities.fighter.pos.z, 5, "the fighter on it is lifted to the surface");
  assert.equal(wet(s, 3), false, "the dais (+5) stays dry");
  assert.equal(s.tides, undefined, "the tide reached its end and was removed");
  through(s, 6);
  assert.equal(wet(s, 0), true);
  assert.deepEqual(lintMap(s.map), []);
});
test("a tide can be stopped, does not move outside a fight, and a falling tide drains to the bed", () => {
  const s = keep();
  ok(apply(s, { type: "water", level: "g", cells: cellsOf(-2, 2), surface: 0, rise: { by: -5, to: -10 } }, DM));
  ok(apply(s, { type: "advanceTime", minutes: 10 }, DM));
  assert.equal(s.tides[0].at, 0, "outside a fight nothing moves");
  ok(apply(s, { type: "water", tide: "T1", stop: true }, DM));
  assert.equal(s.tides, undefined);
  no(apply(s, { type: "water", tide: "T1", stop: true }, DM), /no such tide/);
  ok(apply(s, { type: "water", level: "g", cells: cellsOf(-2, 2), surface: 0, rise: { by: -5, to: -10 } }, DM));
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, DM));
  through(s, 3);
  assert.equal(s.tides, undefined);
  assert.equal(s.map.levels[0].tiles["2,0"].t, "stone");
  assert.equal(s.map.levels[0].tiles["2,0"].h, -10);
});
