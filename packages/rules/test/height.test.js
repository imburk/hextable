// Height in play: climbing, ladders, flying, falling, distance in three axes (task M6 of docs/specs/maps-and-objects.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { aloft, apply, clear, current, moveOptions, rollMode } from "../src/engine.js";
import * as H from "../src/hex.js";
import { lintMap, newMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";
import { gap, rise } from "../src/space.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const types = (r) => r.events.map((e) => e.type);

// Open ground with: a 10 ft ledge of four hexes at 3..4,-1..0 (solid: nothing under it); a roof
// at 10 ft over the ground hex 2,1, joined to the ledge; a platform 15 ft up over -3,2 with a
// ladder; a rail and a wall running north-south west of the start; and a pit at 0,3.
function crag(over = {}) {
  const ground = Object.fromEntries(H.range({ q: 0, r: 0 }, 6).map((h) => [H.col(h), { t: "stone" }]));
  const ledge = {};
  for (const k of ["3,0", "4,0", "3,-1", "4,-1"]) { delete ground[k]; ledge[k] = { t: "stone" }; }
  ledge["2,1"] = { t: "stone" };
  return newMap({ id: "crag", name: "The crag", starts: [{ q: -1, r: 0 }],
    levels: [{ id: "ground", name: "Ground", z: 0, tiles: ground }, { id: "ledge", name: "Ledge", z: 10, tiles: ledge }, { id: "canopy", name: "Platform", z: 15, tiles: { "-3,2": { t: "stone" } } }],
    walls: [{ id: "rail", level: "ground", a: [-12.5, -2], b: [-12.5, 2], kind: "rail" }, { id: "wall", level: "ground", a: [-12.5, -6.4], b: [-12.5, -2.3], kind: "wall" }],
    objects: [{ id: "ladder", def: "ladder", level: "ground", at: { q: -3, r: 2 }, state: "there", to: { q: -3, r: 2, z: 15 } }, { id: "pit", def: "pit-trap", level: "ground", at: { q: 0, r: 3 }, state: "hidden" }], ...over });
}
function onCrag(over) {
  const s = newGame(12);
  ok(apply(s, { type: "loadMap", map: crag(over) }, DM));
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  const at = (id, q, r, z) => ok(apply(s, { type: "place", actor: id, to: z === undefined ? { q, r } : { q, r, z } }, DM));
  for (const [id, q, r] of [["fighter", 2, 0], ["rogue", -1, 0], ["cleric", -2, 3], ["wizard", -1, 1]]) s.entities[id].pos = { q, r, z: 0 };
  return { s, at };
}
const fightAs = (s, id) => { while (current(s) !== id) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); };

test("distance counts height, and how it counts is a table rule", () => {
  assert.deepEqual([0, 2.4, 2.5, 5, 7.5, 10, 12.5, 30].map(rise), [0, 0, 0, 1, 1, 2, 2, 6]);
  const a = { q: 0, r: 0, z: 0 }, b = { q: 3, r: 0, z: 20 };
  assert.equal(gap({ settings: { vertical: "max" } }, a, b), 4);
  assert.equal(gap({ settings: { vertical: "sum" } }, a, b), 7);
  assert.equal(gap({ settings: { vertical: "true" } }, a, b), 5);
  assert.equal(gap({ settings: {} }, a, b), 4);
  const s = newGame(1);
  assert.equal(apply(s, { type: "setting", key: "vertical", value: "diagonal" }, DM).error, "That setting can be: max, sum, true.");
  ok(apply(s, { type: "setting", key: "vertical", value: "sum" }, DM));
});

test("a face too high to step up is climbed, at double cost without a Climb Speed", () => {
  const { s } = onCrag(), e = s.entities.fighter;
  assert.equal(moveOptions(s, e).get("3,0,10").cost, 5 + 20);
  ok(apply(s, { type: "setSpeed", actor: "fighter", mode: "climb", feet: 30 }, DM));
  assert.equal(moveOptions(s, e).get("3,0,10").cost, 5 + 10);
  ok(apply(s, { type: "setSpeed", actor: "fighter", mode: "climb", feet: 0 }, DM));
  // In a fight a 30 ft Speed gets up a 10 ft face with a step to spare, and not twice.
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: -4, r: 0 } }, DM));
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, DM));
  fightAs(s, "fighter");
  const res = ok(apply(s, { type: "move", actor: "fighter", to: { q: 3, r: 0 } }, DM));
  assert.deepEqual(res.events[0].path, [{ q: 3, r: 0, z: 10 }]);
  assert.equal(s.encounter.budget.move, 5);
  assert.deepEqual([...moveOptions(s, e).keys()].sort(), ["2,1,10", "3,-1,10", "3,0,10", "4,-1,10", "4,0,10"].sort());        // one more step along the ledge or onto the roof, no climbing back down
  // With climbing switched off, the ledge is simply out of reach from below.
  const { s: flat } = onCrag();
  ok(apply(flat, { type: "setting", key: "climbing", value: "off" }, DM));
  assert.equal(moveOptions(flat, flat.entities.fighter).has("3,0,10"), false);
});

test("there is no climbing up through a floor overhead, and a ladder joins two places", () => {
  const { s, at } = onCrag();
  at("fighter", 2, 1);                                                       // on the ground, under the roof
  assert.deepEqual(s.entities.fighter.pos, { q: 2, r: 1, z: 0 });
  assert.equal(moveOptions(s, s.entities.fighter).get("3,0,10").cost, 5 + 25);      // the ledge is beside it, but the roof is in the way: out from under it first
  at("fighter", 2, 1, 10);                                                   // on the roof: the ledge is a level step away
  assert.equal(moveOptions(s, s.entities.fighter).get("3,0,10").cost, 5);
  // The ladder: from its foot to the platform 15 ft above, as a climb.
  at("fighter", -3, 2, 0);
  const up = ok(apply(s, { type: "move", actor: "fighter", to: { q: -3, r: 2, z: 15 } }, DM));
  assert.deepEqual(up.events[0].path, [{ q: -3, r: 2, z: 15 }]);
  assert.equal(moveOptions(s, s.entities.fighter).get("-3,2").cost, 30);
  assert.match(lintMap(crag({ objects: [{ id: "ladder", def: "ladder", level: "ground", at: { q: -3, r: 2 }, state: "there" }] })).join(), /joins two places and needs `to`/);
});

test("from a ledge you can shoot down but not be reached with a sword", () => {
  const { s, at } = onCrag();
  at("rogue", 3, 0, 10);
  const gob = s.entities[ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 2, r: -1 } }, DM)).events[0].id];
  assert.equal(apply(s, { type: "attack", actor: gob.id, target: "rogue", attack: "scimitar" }, DM).error, "Pip is 10 ft away. Scimitar reaches 5 ft.");
  const bow = s.entities.rogue.attacks.find((a) => a.id === "shortbow");
  assert.deepEqual(rollMode(s, s.entities.rogue, gob, bow).dis, []);          // an enemy 10 ft below is not "within 5 ft"
  const shot = ok(apply(s, { type: "attack", actor: "rogue", target: gob.id, attack: "shortbow" }, DM));
  assert.equal(shot.events[0].type, "encounterStart");
});

test("a creature with a Fly Speed moves through the air, over rails, traps and low things, but not through walls or floors", () => {
  const { s, at } = onCrag(), e = s.entities.wizard;
  assert.equal(aloft(s, e), false);
  ok(apply(s, { type: "setSpeed", actor: "wizard", mode: "fly", feet: 60 }, DM));
  assert.equal(aloft(s, e), true);
  const up = ok(apply(s, { type: "move", actor: "wizard", to: { q: 0, r: 2, z: 15 } }, DM));
  assert.deepEqual(e.pos, { q: 0, r: 2, z: 15 });
  assert.equal(up.events[0].path.length, 3);                                  // rising as it goes: a diagonal step costs no more than a level one
  assert.deepEqual(types(ok(apply(s, { type: "search", actor: "wizard" }, DM))), ["check"]);      // still up there after doing something else
  assert.deepEqual(e.pos, { q: 0, r: 2, z: 15 });
  // Low over the hidden pit: nothing on the floor notices.
  ok(apply(s, { type: "move", actor: "wizard", to: { q: 0, r: 4, z: 5 } }, DM));
  assert.equal(s.map.objects.find((o) => o.id === "pit").state, "hidden");
  // West of the start a rail and a wall run along the same line. At 5 ft up the rail is no obstacle; the wall is, below 10 ft.
  at("wizard", -2, 0, 5);
  const low = moveOptions(s, e);
  assert.equal(low.get("-3,0,5").cost, 5);                                    // straight over the rail
  at("wizard", -2, -1, 5);
  const byWall = moveOptions(s, e);
  assert.ok(byWall.get("-3,-1,5").cost > 5);                                  // the wall is in the way: the only route is round or over
  at("wizard", -2, -1, 10);
  assert.equal(moveOptions(s, e).get("-3,-1,10").cost, 5);                    // above its top
  // Under the roof at 2,1 there is no rising through it.
  at("wizard", 2, 1, 0);
  assert.equal(moveOptions(s, e).has("2,1,5"), true);
  assert.equal(moveOptions(s, e).get("2,1,10").cost, 15);                     // onto the roof by going out, up and over, not straight up (which would be 10)
});

test("in a fight, flying and walking share the turn's movement", () => {
  const { s, at } = onCrag(), e = s.entities.wizard;
  ok(apply(s, { type: "setSpeed", actor: "wizard", mode: "fly", feet: 60 }, DM));
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: -4, r: 0 } }, DM));
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, DM));
  fightAs(s, "wizard");
  ok(apply(s, { type: "move", actor: "wizard", to: { q: -1, r: 1, z: 20 } }, DM));          // 20 ft straight up
  assert.equal(s.encounter.budget.move, 10);
  ok(apply(s, { type: "move", actor: "wizard", to: { q: 3, r: 1, z: 20 } }, DM));           // 20 ft more: 40 of the 60 flown
  assert.equal(s.encounter.budget.move, -10);                                              // nothing left to walk with
  const left = [...moveOptions(s, e).values()].map((n) => n.cost);
  assert.equal(Math.max(...left), 20);
  assert.equal(apply(s, { type: "move", actor: "wizard", to: { q: 3, r: 1, z: 0 } }, DM).ok, true);    // 20 ft down to the ground uses it up
  assert.deepEqual([...moveOptions(s, e).keys()], ["3,1"]);
});

test("whatever cannot stay up falls: a flyer knocked Prone, a creature set down in mid-air, but not one that hovers", () => {
  const { s, at } = onCrag(), e = s.entities.wizard;
  ok(apply(s, { type: "setSpeed", actor: "wizard", mode: "fly", feet: 60 }, DM));
  at("wizard", 0, 0, 30);
  const hp = e.hp;
  const res = ok(apply(s, { type: "condition", actor: "wizard", condition: "prone" }, DM));
  assert.deepEqual(types(res), ["cond", "fell", "damage"]);
  assert.equal(res.events[1].feet, 30);
  assert.deepEqual(e.pos, { q: 0, r: 0, z: 0 });
  const dealt = res.events[2].amount;
  assert.ok(dealt >= 3 && dealt <= 18 && e.hp === Math.max(0, hp - dealt));               // 3d6
  // A fighter has no wings.
  const dropped = ok(apply(s, { type: "place", actor: "fighter", to: { q: 1, r: 1, z: 20 } }, DM));
  assert.deepEqual(types(dropped).slice(0, 3), ["placed", "fell", "damage"]);
  assert.equal(s.entities.fighter.pos.z, 0);
  assert.ok(s.entities.fighter.cond.prone);
  // One that hovers stays put when knocked Prone.
  ok(apply(s, { type: "setSpeed", actor: "cleric", mode: "fly", feet: 30, hover: true }, DM));
  at("cleric", -2, 2, 10);
  assert.deepEqual(types(ok(apply(s, { type: "condition", actor: "cleric", condition: "prone" }, DM))).includes("fell"), false);
  assert.equal(s.entities.cleric.pos.z, 10);
  // Taking the Fly Speed away drops it.
  assert.deepEqual(types(ok(apply(s, { type: "setSpeed", actor: "cleric", mode: "fly", feet: 0 }, DM))).slice(0, 2), ["speed", "fell"]);
});

test("a floor that gives way drops whoever stood on it, if there is somewhere to land", () => {
  const { s, at } = onCrag();
  at("rogue", 2, 1, 10);
  const res = ok(apply(s, { type: "mapEdit", ops: [{ op: "tile", level: "ledge", at: { q: 2, r: 1 }, tile: null }] }, DM));
  assert.deepEqual(types(res).slice(0, 3), ["mapEdit", "fell", "damage"]);
  assert.deepEqual(s.entities.rogue.pos, { q: 2, r: 1, z: 0 });
  assert.equal(apply(s, { type: "mapEdit", ops: [{ op: "tile", level: "ground", at: { q: 2, r: 1 }, tile: null }] }, DM).error, "Pip would be left with nowhere to stand.");
});

test("a floor is in the way of an attack or a spell; open air is not; areas have height", () => {
  const { s, at } = onCrag();
  const under = { q: 2, r: 1, z: 0 }, onRoof = { q: 2, r: 1, z: 10 }, beside = { q: 1, r: 1, z: 0 }, above = { q: 1, r: 1, z: 20 };
  assert.equal(clear(s, under, onRoof), false);
  assert.equal(clear(s, beside, above), true);
  assert.equal(clear(s, beside, onRoof), true);                               // from the ground beside it, up over the edge
  assert.equal(clear(s, under, { q: 3, r: 0, z: 10 }), false);                // from under the roof to the ledge beside it
  // Burning Hands (a 15 ft cone) reaches the goblin on the ground in front, not the one 20 ft overhead.
  at("wizard", -1, 1); at("fighter", -4, 2);
  const low = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 0, r: 1 } }, DM)).events[0].id;
  const high = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 1 } }, DM)).events[0].id;
  ok(apply(s, { type: "setSpeed", actor: high, mode: "fly", feet: 30, hover: true }, DM));
  ok(apply(s, { type: "place", actor: high, to: { q: 1, r: 1, z: 20 } }, DM));
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, DM));
  fightAs(s, "wizard");
  const cast = ok(apply(s, { type: "cast", actor: "wizard", spell: "burning-hands", hex: { q: 1, r: 1 } }, DM));
  assert.deepEqual(cast.events[0].targets, [low]);
  // Nor can the fighter below reach it with a sword, though it is "in the next hex".
  at("fighter", 0, 2);
  assert.equal(apply(s, { type: "attack", actor: "fighter", target: high, attack: "longsword" }, DM).error.includes("20 ft away"), true);
});
