// Walking together: following, marching order, catching up when a fight starts, and the engage distance.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, inFight } from "../src/engine.js";
import * as H from "../src/hex.js";
import { newMap } from "../src/map.js";
import { migrate } from "../src/migrate.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";
import { center } from "../src/walls.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const at = (s, id) => { const p = s.entities[id].pos; return { q: p.q, r: p.r }; };

// A game on a given map with the four heroes placed where asked.
function game(map, places, { engage = false } = {}) {
  const s = newGame(4);
  ok(apply(s, { type: "loadMap", map }, DM));
  if (!engage) ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  ok(apply(s, { type: "claim", entity: "fighter", user: "pat", userName: "Pat" }, PAT));
  // Out of the way first, so that nobody is standing where someone else is to go.
  const spare = Object.keys(map.levels[0].tiles).map(H.parse).filter((h) => !places.some(([, q, r]) => H.dist(h, { q, r }) < 2));
  places.forEach(([id], i) => ok(apply(s, { type: "place", actor: id, to: spare[i * 3] }, DM)));
  for (const [id, q, r] of places) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  return s;
}
const field = () => newMap({ id: "field", name: "Open field", starts: [{ q: 0, r: 0 }],
  levels: [{ id: "ground", name: "Ground", z: 0, tiles: Object.fromEntries(H.range({ q: 0, r: 0 }, 14).map((h) => [H.col(h), { t: "stone" }])) }] });
// One hex wide: a single row of floor.
const corridor = () => newMap({ id: "corridor", name: "The long passage", starts: [{ q: 0, r: 0 }],
  levels: [{ id: "ground", name: "Ground", z: 0, tiles: Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`${i - 12},0`, { t: "stone" }])) }] });
// A floor cut in two by a wall just east of 0,0, with a shut door in it (as in walls.test.js).
const hall = () => newMap({ id: "hall", name: "The divided hall", starts: [{ q: -2, r: 0 }],
  levels: [{ id: "ground", name: "Ground", z: 0, tiles: Object.fromEntries(H.range({ q: 0, r: 0 }, 5).map((h) => [H.col(h), { t: "stone" }])) }],
  walls: [{ id: "north", level: "ground", a: [1.25, -100], b: [1.25, -1.5], kind: "wall" }, { id: "south", level: "ground", a: [1.25, 1.5], b: [1.25, 100], kind: "wall" }],
  objects: [{ id: "door", def: "door-wooden", level: "ground", at: { q: 0, r: 0 }, seg: { a: [1.25, -1.5], b: [1.25, 1.5] }, state: "closed" }] });
const follows = (s, ...pairs) => { for (const [who, leader] of pairs) ok(apply(s, { type: "follow", actor: who, leader }, DM)); };

test("followers arrive in order behind the leader, each within 10 ft of the one ahead", () => {
  const s = game(field(), [["fighter", -6, 0], ["rogue", -7, 0], ["cleric", -8, 1], ["wizard", -9, 0]]);
  follows(s, ["rogue", "fighter"], ["cleric", "fighter"], ["wizard", "fighter"]);
  const r = ok(apply(s, { type: "move", actor: "fighter", to: { q: 6, r: -2 } }, PAT));
  assert.deepEqual(r.events.map((e) => [e.type, e.id]), [["moved", "fighter"], ["moved", "rogue"], ["moved", "cleric"], ["moved", "wizard"]]);
  const line = ["fighter", "rogue", "cleric", "wizard"].map((id) => at(s, id));
  for (let i = 1; i < line.length; i++) {
    assert.ok(H.dist(line[i], line[i - 1]) <= 2, `${i} is ${H.dist(line[i], line[i - 1])} hexes from the one ahead`);
    assert.ok(H.dist(line[i], line[0]) > H.dist(line[i - 1], line[0]) || i === 1, `${i} is not behind the one ahead`);
  }
  // Still following: the next walk takes them along again.
  assert.equal(s.entities.wizard.follow, "fighter");
});

test("through a passage one hex wide they string out in order", () => {
  const s = game(corridor(), [["fighter", 0, 0], ["rogue", -1, 0], ["cleric", -2, 0], ["wizard", -3, 0]]);
  follows(s, ["cleric", "fighter"], ["rogue", "fighter"], ["wizard", "fighter"]);       // marching order: cleric, rogue, wizard
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 10, r: 0 } }, PAT));
  assert.deepEqual(["fighter", "cleric", "rogue", "wizard"].map((id) => at(s, id).q), [10, 9, 8, 7]);
});

test("a shut door the leader opened and walked through is followed through", () => {
  const s = game(hall(), [["fighter", 0, 0], ["rogue", -1, 0], ["cleric", -2, 1], ["wizard", -3, 1]]);
  follows(s, ["rogue", "fighter"], ["cleric", "fighter"], ["wizard", "fighter"]);
  ok(apply(s, { type: "use", actor: "fighter", object: "door", verb: "open" }, PAT));
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 4, r: -1 } }, PAT));
  for (const id of ["fighter", "rogue", "cleric", "wizard"]) assert.ok(center(s.entities[id].pos)[0] > 1.25, `${id} is still west of the wall`);
  for (const id of ["rogue", "cleric", "wizard"]) assert.equal(s.entities[id].follow, "fighter");
});

test("a follower a wall keeps back stays where it is and stops following", () => {
  const s = game(hall(), [["fighter", 2, 0], ["rogue", -1, 0], ["cleric", -2, 1], ["wizard", -3, 1]]);
  follows(s, ["rogue", "fighter"]);
  const was = at(s, "rogue");
  const r = ok(apply(s, { type: "move", actor: "fighter", to: { q: 4, r: 0 } }, PAT));
  assert.deepEqual(at(s, "rogue"), was);
  assert.equal(s.entities.rogue.follow, undefined);
  assert.deepEqual(r.events.find((e) => e.type === "follow"), { type: "follow", id: "rogue", leader: null, was: "fighter", why: "couldn't keep up" });
  assert.deepEqual(viewEvents(r.events, s, PAT).find((e) => e.type === "follow")?.id, "rogue");
});

test("a character moved on its own stops following", () => {
  const s = game(field(), [["fighter", 0, 0], ["rogue", -1, 0], ["cleric", -2, 1], ["wizard", -3, 1]]);
  follows(s, ["fighter", "rogue"], ["cleric", "fighter"]);
  const r = ok(apply(s, { type: "move", actor: "fighter", to: { q: 3, r: 0 } }, PAT));
  assert.deepEqual(r.events[0], { type: "follow", id: "fighter", leader: null, was: "rogue" });
  assert.equal(s.entities.fighter.follow, undefined);
  assert.equal(s.entities.cleric.follow, "fighter");                     // whoever was behind it now follows it, as before
  assert.ok(r.events.some((e) => e.type === "moved" && e.id === "cleric"));
  assert.ok(!r.events.some((e) => e.type === "moved" && e.id === "rogue"));
});

test("a fight the leader walks into has its followers in the arena, with full movement on their first turn", () => {
  const s = game(field(), [["fighter", -10, 0], ["rogue", -11, 0], ["cleric", -12, 1], ["wizard", -14, 7]], { engage: true });
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 8, r: 0 } }, DM));
  follows(s, ["rogue", "fighter"], ["cleric", "rogue"]);
  const wizard = at(s, "wizard");
  const r = ok(apply(s, { type: "move", actor: "fighter", to: { q: 7, r: 0 } }, PAT));
  const start = r.events.findIndex((e) => e.type === "encounterStart");
  assert.ok(start > 0);
  for (const id of ["rogue", "cleric"]) {
    const i = r.events.findIndex((e) => e.type === "moved" && e.id === id);
    assert.ok(i > 0 && i < start, `${id} was brought up before initiative`);
    assert.ok(s.encounter.arena[H.col(s.entities[id].pos)], `${id} is in the arena`);
    assert.ok(inFight(s, id));
  }
  assert.deepEqual(at(s, "wizard"), wizard);                              // not following: left where it was
  assert.ok(!inFight(s, "wizard"));
  assert.equal(H.dist(at(s, "fighter"), { q: 8, r: 0 }), 2);
  for (const id of ["rogue", "cleric"]) assert.ok(H.dist(at(s, id), { q: 8, r: 0 }) > 2, `${id} came up behind, not past`);
  // Their first turn: all their movement.
  for (const id of ["rogue", "cleric"]) {
    for (let n = 0; current(s) !== id && n < 20; n++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    assert.equal(current(s), id);
    assert.equal(s.encounter.budget.move, s.entities[id].speed);
    ok(apply(s, { type: "endTurn", actor: id }, DM));
  }
});

test("with the engage distance at 30 ft the walker stops 30 ft out and the fight starts there", () => {
  const s = game(field(), [["fighter", -10, 0], ["rogue", -11, 3], ["cleric", -12, 3], ["wizard", -13, 3]], { engage: true });
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 8, r: 0 } }, DM));
  assert.equal(apply(s, { type: "setting", key: "engageRange", value: 20 }, DM).ok, false);
  ok(apply(s, { type: "setting", key: "engageRange", value: 30 }, DM));
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 7, r: 0 } }, PAT));
  assert.deepEqual(at(s, "fighter"), { q: 2, r: 0 });
  assert.ok(s.encounter && inFight(s, "fighter"));
  assert.ok(s.encounter.order.some((o) => s.entities[o.id].tpl === "goblin-warrior"));
});

test("a player can't make someone else's character follow, and a refused follow changes nothing", () => {
  const s = game(field(), [["fighter", 0, 0], ["rogue", -1, 0], ["cleric", -2, 1], ["wizard", -3, 1]]);
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 9, r: 0 } }, DM));
  ok(apply(s, { type: "follow", actor: "rogue", leader: "fighter" }, DM));
  const before = JSON.stringify(s);
  assert.equal(apply(s, { type: "follow", actor: "cleric", leader: "fighter" }, PAT).error, "Odessa isn't yours to control.".replace("Odessa", s.entities.cleric.name));
  assert.equal(apply(s, { type: "follow", actor: "fighter", leader: "rogue" }, PAT).ok, false);                    // round in a circle
  const monster = Object.values(s.entities).find((e) => e.tpl === "goblin-warrior").id;
  const noSuch = apply(s, { type: "follow", actor: "fighter", leader: "nobody" }, PAT).error;
  assert.equal(apply(s, { type: "follow", actor: "fighter", leader: monster }, PAT).error, noSuch);          // a monster can't be followed, and nothing says it is there
  assert.equal(apply(s, { type: "follow", actor: "fighter", leader: "fighter" }, PAT).ok, false);
  assert.equal(apply(s, { type: "follow", actor: "fighter", leader: null }, PAT).ok, false);                 // not following anyone
  assert.equal(apply(s, { type: "marchingOrder", order: ["rogue", "fighter"] }, PAT).ok, false);
  assert.equal(apply(s, { type: "partyFollow", leader: "fighter" }, PAT).ok, false);
  assert.equal(JSON.stringify(s), before);
  // Their own character they may.
  ok(apply(s, { type: "follow", actor: "fighter", leader: "cleric" }, PAT));
  assert.equal(view(s, PAT).entities.fighter.follow, "cleric");
});

test("following is refused in a fight", () => {
  const s = game(field(), [["fighter", 0, 0], ["rogue", -1, 0], ["cleric", -2, 1], ["wizard", -3, 1]]);
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 } }, DM));
  const before = JSON.stringify(s);
  assert.equal(apply(s, { type: "follow", actor: "rogue", leader: "fighter" }, DM).ok, false);
  assert.equal(JSON.stringify(s), before);
});

test("the DM moves the whole party with one tap, in the marching order", () => {
  const s = game(corridor(), [["fighter", 0, 0], ["rogue", -1, 0], ["cleric", -2, 0], ["wizard", -3, 0]]);
  const order = ok(apply(s, { type: "marchingOrder", order: ["fighter", "wizard", "rogue", "cleric"] }, DM));
  assert.deepEqual(order.events, [{ type: "marchingOrder", order: ["fighter", "wizard", "rogue", "cleric"] }]);
  ok(apply(s, { type: "partyFollow", leader: "fighter" }, DM));
  for (const id of ["rogue", "cleric", "wizard"]) assert.equal(s.entities[id].follow, "fighter");
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 10, r: 0 } }, DM));
  assert.deepEqual(["fighter", "wizard", "rogue", "cleric"].map((id) => at(s, id).q), [10, 9, 8, 7]);
});

test("the starting valley has the engage distance at 10 ft, and saved tables get it", () => {
  assert.equal(newGame().settings.engageRange, 10);
  const old = newGame(); delete old.settings.engageRange; old.version = 8;
  assert.equal(migrate(old).settings.engageRange, 10);
  assert.equal(old.version, 10);
});
