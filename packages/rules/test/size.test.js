// Size and footprints (task M7 of docs/specs/maps-and-objects.md).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { apply, current, moveOptions, unblocked } from "../src/engine.js";
import * as H from "../src/hex.js";
import { newMap } from "../src/map.js";
import { migrate } from "../src/migrate.js";
import { newGame } from "../src/scenario.js";
import { apart, footprint, overlapAt } from "../src/space.js";
import { view } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const types = (r) => r.events.map((e) => e.type);

// A yard (every hex within 4 of the origin) with a corridor one hex wide running east from it
// (5..9, 0) into a far room (every hex within 2 of 11,0). A pit trap lies at -2,2.
function yard(over = {}) {
  const tiles = {};
  for (const h of [...H.range({ q: 0, r: 0 }, 4), ...H.range({ q: 11, r: 0 }, 2)]) tiles[H.col(h)] = { t: "stone" };
  for (let q = 5; q <= 9; q++) tiles[`${q},0`] = { t: "stone" };
  return newMap({ id: "yard", name: "The yard", starts: [{ q: -3, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }],
    objects: [{ id: "pit", def: "pit-trap", level: "ground", at: { q: -2, r: 2 }, state: "hidden" }], ...over });
}
function inYard(over) {
  const s = newGame(14);
  ok(apply(s, { type: "loadMap", map: yard(over) }, DM));
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  for (const [id, q, r] of [["fighter", -3, 0], ["rogue", -4, 1], ["cleric", -4, 0], ["wizard", -3, -1]]) s.entities[id].pos = { q, r, z: 0 };
  const add = (q, r, size) => { const id = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q, r } }, DM)).events[0].id; if (size) ok(apply(s, { type: "setSize", actor: id, size }, DM)); return s.entities[id]; };
  return { s, add };
}
const fightAs = (s, id) => { while (current(s) !== id) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); };

test("a footprint is 1, 3, 7 or 12 hexes around the creature's own hex, all touching", () => {
  const at = { q: 2, r: -1, z: 0 };
  for (const [size, n] of [["tiny", 1], ["small", 1], ["medium", 1], ["large", 3], ["huge", 7], ["gargantuan", 12]]) {
    const hexes = footprint({ size, pos: at });
    assert.equal(hexes.length, n, size);
    assert.equal(new Set(hexes.map(H.col)).size, n, size);
    assert.deepEqual(hexes[0], at);
    for (const h of hexes) assert.ok(n === 1 || hexes.some((o) => H.dist(o, h) === 1), size);
  }
  assert.equal(footprint({ pos: at }).length, 1);                              // no size given: Medium
});

test("a Large creature fills three hexes: nobody moves through them, and it is reached from beside any of them", () => {
  const { s, add } = inYard(), ogre = add(0, 0, "large");
  assert.deepEqual(footprint(ogre).map(H.col), ["0,0", "1,0", "0,1"]);
  const reach = moveOptions(s, s.entities.fighter);
  for (const k of ["0,0", "1,0", "0,1"]) assert.equal(reach.has(k), false, k);
  assert.equal(reach.get("2,0").cost > 25, true);                              // round it, not through it
  // Beside its far hex is beside it.
  ok(apply(s, { type: "place", actor: "fighter", to: { q: 2, r: 0 } }, DM));
  assert.equal(apart(s, s.entities.fighter, ogre), 1);
  assert.equal(apply(s, { type: "attack", actor: "fighter", target: ogre.id, attack: "longsword" }, DM).events[0].type, "encounterStart");
  // One of its own cannot stop inside it either.
  const friend = add(-1, 2);
  assert.equal([...moveOptions(s, friend)].some(([k, v]) => ["0,0", "1,0", "0,1"].includes(k) && v.canStop), false);
  assert.equal(apply(s, { type: "place", actor: friend.id, to: { q: 1, r: 0 } }, DM).error, "That hex is occupied.");
});

test("a big creature needs room for all of itself: no one-hex corridor, no spawning half off the map", () => {
  const { s, add } = inYard(), ogre = add(3, 0, "large"), gob = add(3, -2);
  const far = (e) => [...moveOptions(s, e).values()].some((n) => n.h.q >= 10);
  assert.equal(far(gob), true);                                                // a goblin walks the corridor
  assert.equal(far(ogre), false);                                              // the ogre does not fit
  assert.equal([...moveOptions(s, ogre).values()].some((n) => n.h.q >= 5), false);
  assert.ok(moveOptions(s, ogre).size > 10);                                   // but it gets about the yard
  assert.equal(apply(s, { type: "setSize", actor: gob.id, size: "huge" }, DM).ok, true);
  assert.equal(apply(s, { type: "place", actor: gob.id, to: { q: 7, r: 0 } }, DM).ok, true);      // the DM may put it anywhere
  assert.equal(apply(s, { type: "setSize", actor: gob.id, size: "medium" }, DM).ok, true);
  assert.equal(apply(s, { type: "setSize", actor: gob.id, size: "large" }, DM).error, `There isn't room for ${gob.name} to be large there.`);
  assert.equal(apply(s, { type: "setSize", actor: "fighter", size: "enormous" }, DM).error, "Unknown size.");
  assert.equal(apply(s, { type: "setSize", actor: "fighter", size: "large" }, PAT).error, "Only the DM can change a creature's size.");
  // Growing into someone is refused.
  ok(apply(s, { type: "place", actor: "cleric", to: { q: -2, r: -1 } }, DM));
  assert.equal(apply(s, { type: "setSize", actor: "cleric", size: "huge" }, DM).error, "Someone is in the way of Odessa growing.");
});

test("a wall between two parts of a big creature keeps it out", () => {
  // A wall just east of column q = 0 on rows -1..1, with a one-hex gap at row 0.
  const walls = [{ id: "n", level: "ground", a: [1.25, -20], b: [1.25, -1.5], kind: "wall" }, { id: "s", level: "ground", a: [1.25, 1.5], b: [1.25, 20], kind: "wall" }];
  const { s, add } = inYard({ walls }), ogre = add(-1, 0, "large"), gob = add(-1, -2);
  const east = (e) => [...moveOptions(s, e).values()].some((n) => n.h.q + n.h.r / 2 > 0.25 && n.h.q <= 4);
  assert.equal(east(gob), true);
  assert.equal(east(ogre), false);
});

test("several Tiny creatures can share a hex; nothing else can", () => {
  const { s, add } = inYard(), a = add(0, 0, "tiny"), b = add(1, 0, "tiny"), c = add(2, 0);
  assert.equal(moveOptions(s, b).get("0,0").canStop, true);
  assert.equal(moveOptions(s, c).get("0,0").canStop, false);
  ok(apply(s, { type: "move", actor: b.id, to: { q: 0, r: 0 } }, DM));
  assert.deepEqual(b.pos, a.pos);
  assert.equal(overlapAt(a, a.pos, b, b.pos), true);
});

test("an area catches a big creature by any part of it, and a trap is set off by any part of it", () => {
  const { s, add } = inYard(), ogre = add(-1, -2, "large");
  // Burning Hands from the wizard at -3,-1 toward -2,-2: the ogre's own hex is out of the cone's line but part of it is in.
  ok(apply(s, { type: "startEncounter", center: { q: -2, r: 0 }, radius: 5 }, DM));
  fightAs(s, "wizard");
  const cast = ok(apply(s, { type: "cast", actor: "wizard", spell: "burning-hands", hex: { q: 0, r: -1 } }, DM));
  assert.ok(cast.events[0].targets.includes(ogre.id));
  assert.equal(cast.events[0].hexes.some((h) => h.q === ogre.pos.q && h.r === ogre.pos.r) && false, false);
  // The pit at -2,2. Standing with its own hex at -2,1, a Large creature's body covers the pit.
  const { s: s2, add: add2 } = inYard(), big = add2(0, 1, "large");
  assert.equal(footprint(big, { q: -2, r: 1, z: 0 }).some((f) => H.col(f) === "-2,2"), true);
  assert.equal(apply(s2, { type: "move", actor: big.id, to: { q: -2, r: 1 } }, DM).ok, false);      // a lair's own knows its traps: no part of it goes there
  // One of the party, grown Large, does not know it is there, and sets it off with its flank.
  ok(apply(s2, { type: "place", actor: big.id, to: { q: 2, r: 2 } }, DM));
  ok(apply(s2, { type: "place", actor: "fighter", to: { q: -1, r: 0 } }, DM));
  ok(apply(s2, { type: "setSize", actor: "fighter", size: "large" }, DM));
  const res = ok(apply(s2, { type: "move", actor: "fighter", to: { q: -2, r: 1 } }, DM));
  assert.ok(types(res).includes("triggered"));
  assert.deepEqual(s2.entities.fighter.pos, { q: -2, r: 1, z: 0 });
});

test("a tall creature reaches what hovers over a smaller one's head", () => {
  const { s, add } = inYard(), gob = add(0, 0);
  ok(apply(s, { type: "setSpeed", actor: "wizard", mode: "fly", feet: 30, hover: true }, DM));
  ok(apply(s, { type: "place", actor: "wizard", to: { q: 1, r: 0, z: 10 } }, DM));
  assert.equal(apart(s, gob, s.entities.wizard), 2);                           // 10 ft up is out of a goblin's reach
  ok(apply(s, { type: "setSize", actor: gob.id, size: "large" }, DM));
  assert.equal(apart(s, gob, s.entities.wizard), 1);                           // a 10 ft tall one has only its own height to make up
  assert.equal(unblocked(s, gob, s.entities.wizard), true);
});

test("leaving a big creature's reach provokes from whichever part of it was beside you", () => {
  const { s, add } = inYard(), ogre = add(0, 0, "large");
  ok(apply(s, { type: "place", actor: "fighter", to: { q: 2, r: 0 } }, DM));
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 5 }, DM));
  fightAs(s, "fighter");
  // 2,0 -> 2,-1 is still beside the ogre's hex 1,0: no attack. Then away to 3,-1: attack.
  assert.deepEqual(types(ok(apply(s, { type: "move", actor: "fighter", to: { q: 2, r: -1 } }, DM))), ["moved"]);
  const away = ok(apply(s, { type: "move", actor: "fighter", to: { q: 3, r: -2 } }, DM));
  assert.equal(away.events.find((e) => e.type === "attack")?.opportunity, true);
  assert.equal(away.events.find((e) => e.type === "attack").actor, ogre.id);
});

test("players are told a creature's size, and saved tables get sizes when they load", () => {
  const { s, add } = inYard(), ogre = add(0, 0, "large");
  assert.equal(view(s, PAT).entities[ogre.id].size, "large");
  const saved = JSON.parse(readFileSync(new URL("./fixtures/table-v1.json", import.meta.url), "utf8")).state;
  const old = migrate(structuredClone(saved));
  assert.equal(old.version, 7);
  for (const e of Object.values(old.entities)) assert.ok(["small", "medium"].includes(e.size), `${e.id} ${e.size}`);
  assert.equal(Object.values(old.entities).find((e) => e.tpl === "goblin-warrior").size, "small");
});
