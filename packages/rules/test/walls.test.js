// Walls and doors (task M2 of docs/specs/maps-and-objects.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { PACKS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";
import { apply, clear, current, moveOptions, targetsFor, usesFor } from "../src/engine.js";
import * as H from "../src/hex.js";
import { lintMap, newMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";
import { viewEvents } from "../src/view.js";
import { barriers, center, crosses, edgeSegment } from "../src/walls.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };

// A stone floor cut in two by a north-south wall just east of hex 0,0, with a door in it between
// 0,0 (west) and 1,0 (east). The wall is a traced line; the door stands on its own short line.
function hall(over = {}) {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 5).map((h) => [H.col(h), { t: "stone" }]));
  return newMap({ id: "hall", name: "The divided hall", starts: [{ q: -2, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }],
    walls: [{ id: "north", level: "ground", a: [1.25, -100], b: [1.25, -1.5], kind: "wall" }, { id: "south", level: "ground", a: [1.25, 1.5], b: [1.25, 100], kind: "wall" }],
    objects: [{ id: "door", def: "door-wooden", level: "ground", at: { q: 0, r: 0 }, seg: { a: [1.25, -1.5], b: [1.25, 1.5] }, state: "closed" }], ...over });
}
function inHall(over) {
  const s = newGame(4);
  const r = apply(s, { type: "loadMap", map: hall(over) }, DM);
  assert.ok(r.ok, r.error);
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  apply(s, { type: "claim", entity: "fighter", user: "pat", userName: "Pat" }, PAT);
  for (const [id, q, r2] of [["fighter", 0, 0], ["rogue", -1, 0], ["cleric", -2, 1], ["wizard", -3, 1]]) assert.ok(apply(s, { type: "place", actor: id, to: { q, r: r2 } }, DM).ok);
  return s;
}
const west = (h) => center(h)[0] < 1.25;
const door = (s) => s.map.objects.find((o) => o.id === "door");
const ok = (r) => { assert.ok(r.ok, r.error); return r; };

test("hex centres are 5 ft apart and a hex edge lies midway between two of them", () => {
  assert.deepEqual(center({ q: 0, r: 0 }), [0, 0]);
  assert.deepEqual(center({ q: 1, r: 0 }), [5, 0]);
  for (let edge = 0; edge < 6; edge++) {
    const at = { q: 2, r: -1 }, n = { q: at.q + H.DIRS[edge][0], r: at.r + H.DIRS[edge][1] };
    const [a, b] = edgeSegment(at, edge), ca = center(at), cb = center(n);
    assert.ok(Math.abs(Math.hypot(cb[0] - ca[0], cb[1] - ca[1]) - 5) < 1e-9);
    assert.ok(Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) - 5 / Math.sqrt(3)) < 1e-9);
    assert.ok(crosses(ca, cb, a, b), `edge ${edge}`);
    // It blocks that one step and none of the hex's other five.
    for (let other = 0; other < 6; other++) if (other !== edge) assert.equal(crosses(ca, center({ q: at.q + H.DIRS[other][0], r: at.r + H.DIRS[other][1] }), a, b), false);
  }
  assert.equal(crosses([0, 0], [5, 0], [2.5, 0], [2.5, 4]), true);          // a wall that ends on the line still blocks it
  assert.equal(crosses([0, 0], [5, 0], [2.5, 0.01], [2.5, 4]), false);
});

test("nobody walks through a wall or a shut door", () => {
  const s = inHall(), e = s.entities.fighter;
  const reach = [...moveOptions(s, e).values()].map((n) => n.h);
  assert.ok(reach.length > 20);
  assert.ok(reach.every(west), "something east of the wall was in reach");
  assert.equal(apply(s, { type: "move", actor: "fighter", to: { q: 1, r: 0 } }, PAT).error, "Can't get there.");
  assert.equal(apply(s, { type: "move", actor: "fighter", to: { q: 3, r: -2 } }, PAT).error, "Can't get there.");
});

test("opening a door lets everyone through, and closing it shuts them out again", () => {
  const s = inHall();
  assert.deepEqual(usesFor(s, s.entities.fighter).map((u) => [u.object, u.verb, u.why]), [["door", "open", ""]]);
  assert.deepEqual(usesFor(s, s.entities.cleric), []);
  const opened = ok(apply(s, { type: "use", actor: "fighter", object: "door", verb: "open" }, PAT));
  assert.deepEqual(opened.events, [{ type: "object", object: "door", name: "Wooden door", state: "open", stateName: "open", actor: "fighter", verb: "open" }]);
  assert.deepEqual(viewEvents(opened.events, s, PAT), opened.events);
  assert.equal(door(s).state, "open");
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 2, r: 0 } }, PAT));
  ok(apply(s, { type: "move", actor: "rogue", to: { q: 1, r: 0 } }, DM));                       // not the one who opened it
  assert.ok([...moveOptions(s, s.entities.cleric).values()].some((n) => !west(n.h)));
  ok(apply(s, { type: "use", actor: "rogue", object: "door", verb: "close" }, DM));
  assert.ok([...moveOptions(s, s.entities.cleric).values()].every((n) => west(n.h)));
  assert.ok([...moveOptions(s, s.entities.fighter).values()].every((n) => !west(n.h)));
});

test("a door is used from beside it, in a way it allows, by someone who may", () => {
  const s = inHall(), before = JSON.stringify(s);
  assert.equal(apply(s, { type: "use", actor: "cleric", object: "door", verb: "open" }, DM).error, "Odessa is too far from the wooden door.");
  assert.equal(apply(s, { type: "use", actor: "fighter", object: "door", verb: "close" }, PAT).error, "The wooden door is closed.");
  assert.equal(apply(s, { type: "use", actor: "fighter", object: "door", verb: "eat" }, PAT).error, "The wooden door can't be used that way.");
  assert.equal(apply(s, { type: "use", actor: "fighter", object: "nope", verb: "open" }, PAT).error, "No such object.");
  assert.equal(apply(s, { type: "use", actor: "rogue", object: "door", verb: "open" }, PAT).error, "Pip isn't yours to control.");
  assert.equal(apply(s, { type: "setObject", object: "door", state: "open" }, PAT).error, "Only the DM can set objects.");
  assert.equal(JSON.stringify(s), before);
});

test("a lock needs its key, or tools and a check against a DC players never see", () => {
  const s = inHall();
  assert.equal(apply(s, { type: "use", actor: "fighter", object: "door", verb: "lock" }, PAT).error, "The wooden door has no lock.");
  ok(apply(s, { type: "mapEdit", ops: [{ op: "object", object: { ...door(s), key: "Iron key", dc: { pick: 18 } } }] }, DM));
  assert.equal(apply(s, { type: "use", actor: "fighter", object: "door", verb: "lock" }, PAT).error, "Brenna doesn't have the key.");
  ok(apply(s, { type: "give", actor: "fighter", item: "iron key" }, DM));
  ok(apply(s, { type: "use", actor: "fighter", object: "door", verb: "lock" }, PAT));
  assert.equal(door(s).state, "locked");
  assert.equal(apply(s, { type: "use", actor: "fighter", object: "door", verb: "open" }, PAT).error, "The wooden door is locked.");
  assert.ok([...moveOptions(s, s.entities.fighter).values()].every((n) => west(n.h)));
  // Picking it: the fighter has no tools; the rogue has, and rolls Dexterity with them against the door's DC.
  assert.equal(apply(s, { type: "use", actor: "fighter", object: "door", verb: "pick" }, PAT).error, "Brenna needs Thieves' Tools for that.");
  ok(apply(s, { type: "place", actor: "rogue", to: { q: 0, r: -1 } }, DM));
  const tryIt = (want) => { for (let seed = 1; seed < 200; seed++) { const c = structuredClone(s); c.rng = seed; const r = ok(apply(c, { type: "use", actor: "rogue", object: "door", verb: "pick" }, DM)); if (r.events[0].success === want) return { c, r }; } throw new Error("no such roll"); };
  const failed = tryIt(false), picked = tryIt(true);
  assert.equal(door(failed.c).state, "locked");
  assert.deepEqual(failed.r.events.map((e) => e.type), ["check"]);
  assert.equal(failed.r.events[0].total, failed.r.events[0].roll + 5);                      // Dexterity +3, proficient with the tools +2
  assert.equal(failed.r.events[0].dc, 18);
  assert.equal(JSON.stringify(viewEvents(failed.r.events, failed.c, PAT)).includes("18"), false);      // players never see the DC
  assert.equal(viewEvents(failed.r.events, failed.c, PAT)[0].success, false);
  assert.equal(door(picked.c).state, "closed");
  assert.deepEqual(picked.r.events.map((e) => e.type), ["check", "object"]);
  ok(apply(s, { type: "use", actor: "fighter", object: "door", verb: "unlock" }, PAT));
  ok(apply(s, { type: "give", actor: "fighter", item: "Iron key", take: true }, DM));
  assert.equal(apply(s, { type: "use", actor: "fighter", object: "door", verb: "lock" }, PAT).error, "Brenna doesn't have the key.");
});

test("a wall or a shut door stops attacks, spells and notice; an open door and a window do not", () => {
  const s = inHall();
  const gob = s.entities[ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 } }, DM)).events[0].id];
  assert.equal(clear(s, s.entities.fighter.pos, gob.pos), false);
  assert.equal(apply(s, { type: "attack", actor: "fighter", target: gob.id, attack: "longsword" }, PAT).error, `There is a wall between Brenna and ${gob.name}.`);
  ok(apply(s, { type: "place", actor: "wizard", to: { q: -1, r: 1 } }, DM));
  assert.equal(apply(s, { type: "cast", actor: "wizard", spell: "fire-bolt", target: gob.id }, DM).error, `There is a wall between Tavin and ${gob.name}.`);
  assert.equal(targetsFor(s, s.entities.fighter, { attack: "longsword" }).includes(gob.id), false);
  // Walking up to the wall with a goblin just behind it starts nothing.
  apply(s, { type: "setting", key: "autoEngage", value: true }, DM);
  ok(apply(s, { type: "move", actor: "rogue", to: { q: 0, r: -1 } }, DM));
  assert.equal(s.encounter, null);
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  // A window in place of the door: still no way through, but it can be shot through.
  ok(apply(s, { type: "mapEdit", ops: [{ op: "unobject", id: "door" }, { op: "wall", wall: { level: "ground", a: [1.25, -1.5], b: [1.25, 1.5], kind: "window" } }] }, DM));
  assert.deepEqual(s.map.walls.map((w) => w.id), ["north", "south", "w1"]);
  assert.ok([...moveOptions(s, s.entities.fighter).values()].every((n) => west(n.h)));
  assert.equal(clear(s, s.entities.fighter.pos, gob.pos), true);
  const shot = ok(apply(s, { type: "attack", actor: "fighter", target: gob.id, attack: "longsword" }, PAT));
  assert.equal(shot.events[0].type, "encounterStart");
});

test("in a fight the first thing handled on a turn is free and the next takes the action", () => {
  const s = inHall();
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: -3, r: -1 } }, DM));
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 5 }, DM));
  if (current(s) === "fighter") ok(apply(s, { type: "endTurn", actor: "fighter" }, DM));
  assert.equal(apply(s, { type: "use", actor: "fighter", object: "door", verb: "open" }, PAT).error, "It isn't Brenna's turn.");
  while (current(s) !== "fighter") ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  ok(apply(s, { type: "use", actor: "fighter", object: "door", verb: "open" }, PAT));
  assert.equal(s.encounter.budget.action, 1);
  assert.equal(usesFor(s, s.entities.fighter)[0].why, "");
  ok(apply(s, { type: "use", actor: "fighter", object: "door", verb: "close" }, PAT));
  assert.equal(s.encounter.budget.action, 0);
  assert.equal(usesFor(s, s.entities.fighter)[0].why, "Brenna has already used an action this turn.");
  assert.equal(apply(s, { type: "use", actor: "fighter", object: "door", verb: "open" }, PAT).error, "Brenna has already used an action this turn.");
  assert.equal(door(s).state, "closed");
});

test("the map can be edited in play, and an edit that breaks it changes nothing", () => {
  const s = inHall(), before = JSON.stringify(s);
  const no = (ops, word) => { const r = apply(s, { type: "mapEdit", ops }, DM); assert.equal(r.ok, false); assert.match(r.error, word); assert.equal(JSON.stringify(s), before); };
  no([{ op: "explode" }], /Unknown map change/);
  no([{ op: "wall", wall: { level: "attic", a: [0, 0], b: [1, 1] } }], /level that does not exist/);
  no([{ op: "wall", wall: { level: "ground", a: [0, 0], b: [1, 1], kind: "hedge" } }], /unknown kind/);
  no([{ op: "tile", level: "ground", at: { q: 0, r: 0 }, tile: null }], /door|Brenna/);
  no([{ op: "tile", level: "ground", at: { q: -1, r: 0 }, tile: null }], /Pip would be left with nowhere to stand/);
  no([{ op: "object", object: { def: "door-wooden", level: "ground", at: { q: 2, r: 2 } } }], /needs a hex edge or a line/);
  no([{ op: "object", object: { def: "dragon", level: "ground", at: { q: 2, r: 2 } } }], /unknown kind/);
  no([{ op: "unwall", id: "nope" }], /no wall/);
  assert.equal(apply(s, { type: "mapEdit", ops: [{ op: "unwall", id: "north" }] }, PAT).error, "Only the DM can change the map.");
  // A good edit: a second door on a hex edge, a new floor above, a tile painted.
  ok(apply(s, { type: "mapEdit", ops: [
    { op: "object", object: { def: "door-wooden", level: "ground", at: { q: -2, r: 0 }, edge: 0 } },
    { op: "level", level: { id: "loft", name: "Loft", z: 10 } },
    { op: "tile", level: "loft", at: { q: 0, r: 0 }, tile: { t: "stone" } },
    { op: "tile", level: "ground", at: { q: 9, r: 0 }, tile: { t: "grass" } }] }, DM));
  assert.deepEqual(s.map.objects.at(-1), { def: "door-wooden", level: "ground", at: { q: -2, r: 0 }, edge: 0, id: "o1", state: "closed" });
  assert.deepEqual(lintMap(s.map), []);
  assert.equal(barriers(s.map).blocked("ground", { q: -2, r: 0 }, { q: -1, r: 0 }), true);
  assert.equal(barriers(s.map).blocked("ground", { q: -2, r: 0 }, { q: -2, r: 1 }), false);
});

test("the linter holds object definitions and placed objects to the vocabulary", () => {
  assert.deepEqual(lintPack(PACKS[0]), []);
  const pack = (change) => { const o = structuredClone(PACKS[0].objects[0]); change(o); return lintPack({ pack: PACKS[0].pack, objects: [o] }).join(" | "); };
  assert.match(pack((o) => { o.kind = "gate"; }), /kind must be/);
  assert.match(pack((o) => { o.states.open.blocks = ["sound"]; }), /needs `blocks`/);
  assert.match(pack((o) => { o.initial = "ajar"; }), /initial/);
  assert.match(pack((o) => { o.use[0].to = "ajar"; }), /`to` must be one of its states/);
  assert.match(pack((o) => { o.use[0].time = "week"; }), /time must be/);
  assert.match(pack((o) => { o.use[4].check.skill = "lockpicking"; }), /unknown skill/);
  assert.match(pack((o) => { o.use[0].run = () => 1; }), /contains a function/);
  const map = (change) => { const m = hall(); change(m); return lintMap(m).join(" | "); };
  assert.match(map((m) => { m.objects[0].state = "ajar"; }), /state its kind does not have/);
  assert.match(map((m) => { m.objects.push({ ...m.objects[0] }); }), /used twice/);
  assert.match(map((m) => { m.walls[0].a = [1, "x"]; }), /needs two points/);
  assert.match(map((m) => { m.objects[0].at = { q: 40, r: 0 }; }), /not on a hex of its level/);
});
