// Line of sight and cover (tasks S1 and S2 of docs/specs/sight.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, clear, current, unblocked } from "../src/engine.js";
import * as H from "../src/hex.js";
import { newMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";
import { coverOf, sightline } from "../src/sight.js";
import { viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };

// An open stone floor with whatever walls are given. The fighter is Pat's.
function floor(walls = []) {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 6).map((h) => [H.col(h), { t: "stone" }]));
  const s = newGame(31);
  ok(apply(s, { type: "loadMap", map: newMap({ id: "f", name: "Floor", starts: [{ q: -5, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }], walls }) }, DM));
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  apply(s, { type: "claim", entity: "fighter", user: "pat", userName: "Pat" }, PAT);
  for (const [id, q, r] of [["fighter", -2, 0], ["rogue", -5, 2], ["cleric", -5, 3], ["wizard", -4, 3]]) s.entities[id].pos = { q, r, z: 0 };
  const add = (q, r) => s.entities[ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q, r } }, DM)).events[0].id];
  return { s, add };
}
const wall = (kind, y0, y1, id = `${kind}${y0}`) => ({ id, level: "ground", a: [1.25, y0], b: [1.25, y1], kind });       // a north-south line just east of hex 0,0
const fightAs = (s, id) => { while (current(s) !== id) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); };

test("on open ground there is no cover, and a wall right across is total cover", () => {
  const { s, add } = floor(), gob = add(2, 0);
  assert.equal(coverOf(s, s.entities.fighter, gob), "none");
  assert.deepEqual(sightline(s.map, s.entities.fighter.pos, gob.pos), { centre: true, corners: 6, low: false });
  const { s: shut, add: add2 } = floor([wall("wall", -100, 100)]), behind = add2(2, 0);
  assert.equal(coverOf(shut, shut.entities.fighter, behind), "total");
  assert.equal(unblocked(shut, shut.entities.fighter, behind), false);
  assert.equal(apply(shut, { type: "attack", actor: "fighter", target: behind.id, attack: "javelin" }, PAT).error, `There is a wall between Brenna and ${behind.name}.`);
});

test("a low wall gives half cover, which is +2 to Armor Class, and the attack says so", () => {
  const { s, add } = floor([wall("rail", -100, 100)]), gob = add(2, 0);
  assert.equal(coverOf(s, s.entities.fighter, gob), "half");
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, DM));
  fightAs(s, "fighter");
  const res = ok(apply(s, { type: "attack", actor: "fighter", target: gob.id, attack: "javelin" }, PAT)), atk = res.events[0];
  assert.equal(atk.cover, "half");
  assert.equal(atk.ac, 15 + 2);
  assert.equal(viewEvents(res.events, s, PAT)[0].cover, "half");            // the player is told why it was harder
  // With the table rule off, the same shot is at the goblin's own Armor Class.
  ok(apply(s, { type: "setting", key: "cover", value: "off" }, DM));
  assert.equal(coverOf(s, s.entities.fighter, gob), "none");
});

test("a gap in a wall shows what is behind it: fully from straight on, partly from the side", () => {
  const gap = [wall("wall", -100, -2.2, "n"), wall("wall", 2.2, 100, "s")];               // a doorway between 0,0 and 1,0
  const { s, add } = floor(gap), inDoor = add(1, 0), aside = add(2, -3);
  assert.equal(coverOf(s, s.entities.fighter, inDoor), "none");
  // From well off to one side the doorway shows only part of whoever stands in it; it is still a target.
  s.entities.fighter.pos = { q: -1, r: -3, z: 0 };
  const side = coverOf(s, s.entities.fighter, inDoor);
  assert.ok(["half", "threeQuarters"].includes(side), side);
  assert.equal(unblocked(s, s.entities.fighter, inDoor), true);
  // And the one standing off behind the wall cannot be seen from there at all.
  assert.equal(coverOf(s, s.entities.fighter, aside), "total");
  assert.equal(clear(s, s.entities.fighter.pos, aside.pos), false);
});

test("a creature standing in the line of fire gives half cover, unless the table says otherwise", () => {
  const { s, add } = floor(), far = add(3, 0), between = add(1, 0);
  assert.equal(coverOf(s, s.entities.fighter, far, Object.values(s.entities)), "half");
  assert.equal(coverOf(s, s.entities.fighter, between, Object.values(s.entities)), "none");
  ok(apply(s, { type: "setting", key: "creatureCover", value: "off" }, DM));
  assert.equal(coverOf(s, s.entities.fighter, far, Object.values(s.entities)), "none");
  assert.equal(apply(s, { type: "setting", key: "cover", value: "maybe" }, DM).error, "That setting can be: on, off.");
});

test("cover helps a Dexterity save against a spell, and a line of sight passes over a wall from high enough", () => {
  const { s, add } = floor([wall("rail", -100, 100)]), gob = add(1, 0);
  s.entities.wizard.pos = { q: 0, r: 0, z: 0 };
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, DM));
  fightAs(s, "wizard");
  const cast = ok(apply(s, { type: "cast", actor: "wizard", spell: "burning-hands", hex: { q: 1, r: 0 } }, DM));
  const save = cast.events.find((e) => e.type === "save" && e.id === gob.id);
  assert.equal(save.cover, "half");
  assert.equal(save.total, save.roll + 2 + 2);                               // Dexterity +2, half cover +2
  // A wall 10 ft high: from the ground it is total cover; from 15 ft up beside it, the far side is in view.
  const { s: high, add: add2 } = floor([wall("wall", -100, 100)]), below = add2(3, 0);
  assert.equal(clear(high, { q: -2, r: 0, z: 0 }, below.pos), false);
  assert.equal(clear(high, { q: 0, r: 0, z: 15 }, below.pos), true);
});
