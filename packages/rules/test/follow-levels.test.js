// Followers keep with their leader across a change of height (#728): up and down steps, up a ledge the leader climbs, and onto a
// floor above another. Seen in play: the leader went up stone steps onto a platform and both followers stopped on the ground
// below, still following, with nothing said. A place at the foot of a ledge is beside the leader on the map and a climb away from
// it: it is no place in the leader's formation, and standing there is not keeping up (engine/movement.js, `formation` and `march`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import { gridOf } from "../src/grid.js";
import { newMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";
import { overlapAt } from "../src/space.js";
import { createHistory, describeStep, mark } from "../src/history.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
const FOLLOWERS = ["rogue", "cleric"];
const GRIDS = ["hex", "square"];

// A yard 20 by 9 with a platform 10 feet up on its east side (q >= 12). `steps`: three steps of 2.5 feet lead up to it along r = 4.
// `floors`: the platform is a floor of its own level, and the yard runs on under it (a balcony).
function yard(grid, { steps = true, floors = false } = {}) {
  const ground = {}, upper = {};
  for (let q = 0; q < 20; q++) for (let r = 0; r < 9; r++) {
    const k = `${q},${r}`, rise = steps && r === 4 ? { 9: 2.5, 10: 5, 11: 7.5 }[q] : undefined;
    if (q >= 12 && floors) { upper[k] = { t: "stone" }; ground[k] = { t: "stone" }; }
    else ground[k] = { t: "stone", ...(q >= 12 ? { h: 10 } : rise ? { h: rise } : {}) };
  }
  return newMap({ id: "yard", name: "A yard", ...(grid === "square" ? { grid: "square" } : {}), starts: [{ q: 2, r: 4 }],
    levels: [{ id: "ground", name: "Ground", z: 0, tiles: ground }, ...(floors ? [{ id: "upper", name: "Upper", z: 10, tiles: upper }] : [])] });
}
// The fighter leads; the rogue and the cleric follow it from the places given.
function game(map, places) {
  const s = newGame(4);
  ok(apply(s, { type: "loadMap", map }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  for (const id of Object.keys(s.entities)) if (!["fighter", ...FOLLOWERS].includes(id)) delete s.entities[id];
  for (const [id, q, r] of places) s.entities[id].pos = { q, r, z: 0 };
  for (const id of FOLLOWERS) ok(apply(s, { type: "follow", actor: id, leader: "fighter" }, DM));
  return s;
}
const LINE = [["fighter", 5, 4], ["rogue", 4, 4], ["cleric", 3, 4]];
const ABREAST = [["fighter", 5, 4], ["rogue", 4, 3], ["cleric", 4, 5]];
const z = (s, id) => s.entities[id].pos.z;
const move = (s, to) => ok(apply(s, { type: "move", actor: "fighter", to }, DM));
// Everyone still follows, nobody shares a space, and each follower is within `far` cells of the leader.
function together(s, far, what) {
  const G = gridOf(s.map), l = s.entities.fighter;
  for (const id of FOLLOWERS) {
    const f = s.entities[id];
    assert.equal(f.follow, "fighter", `${id} still follows (${what})`);
    assert.ok(G.dist(f.pos, l.pos) <= far, `${id} is within ${far} cells of the leader (${what}): ${json(f.pos)} and ${json(l.pos)}`);
    assert.ok(!overlapAt(f, f.pos, l, l.pos, G), `${id} is not on the leader (${what})`);
  }
  assert.ok(!overlapAt(s.entities.rogue, s.entities.rogue.pos, s.entities.cleric, s.entities.cleric.pos, G), `the followers stand apart (${what})`);
}

for (const grid of GRIDS) for (const [shape, places] of [["in a line", LINE], ["abreast", ABREAST]]) {
  test(`${grid}, ${shape}: two followers go up the steps with their leader, across the platform, and down again`, () => {
    const s = game(yard(grid), places);
    move(s, { q: 8, r: 4 });
    together(s, 3, "at the foot of the steps");
    // Up the steps and well onto the platform: everyone is up there.
    move(s, { q: 15, r: 4, z: 10 });
    together(s, 3, "on the platform");
    for (const id of FOLLOWERS) assert.equal(z(s, id), 10, `${id} is on the platform, not on the ground below`);
    // Along the platform's edge, where the places beside and behind the leader on the map are the ground 10 feet below.
    for (const to of [{ q: 12, r: 1, z: 10 }, { q: 12, r: 7, z: 10 }, { q: 13, r: 2, z: 10 }]) {
      move(s, to);
      together(s, 3, `at the edge, ${json(to)}`);
      for (const id of FOLLOWERS) assert.equal(z(s, id), 10, `${id} stays up at the edge (${json(to)})`);
    }
    // Down the steps and away.
    move(s, { q: 11, r: 4, z: 7.5 });
    move(s, { q: 5, r: 4, z: 0 });
    together(s, 3, "down again");
    for (const id of FOLLOWERS) assert.equal(z(s, id), 0, `${id} came down`);
  });

  test(`${grid}, ${shape}: one long walk from the yard up onto the platform brings both followers up`, () => {
    const s = game(yard(grid), places);
    move(s, { q: 16, r: 2, z: 10 });
    together(s, 3, "after one walk");
    for (const id of FOLLOWERS) assert.equal(z(s, id), 10, id);
  });

  test(`${grid}, ${shape}: a ledge with no steps, which the leader climbs: the followers climb it too`, () => {
    const s = game(yard(grid, { steps: false }), places);
    move(s, { q: 11, r: 4 });
    const r = move(s, { q: 13, r: 4, z: 10 });
    for (const id of FOLLOWERS) {
      assert.equal(s.entities[id].follow, "fighter", `${id} still follows`);
      assert.equal(z(s, id), 10, `${id} climbed after the leader; it did not stop at the foot of the ledge`);
    }
    together(s, 3, "on the ledge");
    assert.equal(r.events.filter((e) => e.type === "follow" && e.leader === null).length, 0, "nobody was dropped");
  });

  test(`${grid}, ${shape}: a floor above another: nobody is put under the balcony the leader stands on`, () => {
    const s = game(yard(grid, { floors: true }), places);
    move(s, { q: 14, r: 4, z: 10 });
    for (const id of FOLLOWERS) assert.equal(z(s, id), 10, `${id} is on the upper floor`);
    together(s, 3, "on the upper floor");
    // And the other way: the leader walks in under the balcony, and the followers do not stay on top of it.
    move(s, { q: 8, r: 4, z: 0 });
    move(s, { q: 14, r: 6, z: 0 });
    for (const id of FOLLOWERS) assert.equal(z(s, id), 0, `${id} is under the balcony with the leader`);
    together(s, 3, "under the balcony");
  });
}

for (const grid of GRIDS) test(`${grid}: a follower that cannot get up after its leader stops following and the table is told why`, () => {
  const s = game(yard(grid, { steps: false }), LINE);
  move(s, { q: 11, r: 4 });
  // The cleric cannot climb: with climbing switched off for the table nobody could, so it is held where it stands instead.
  s.entities.cleric.cond.restrained = { source: null };
  const r = move(s, { q: 13, r: 4, z: 10 });
  assert.equal(z(s, "rogue"), 10);
  assert.equal(s.entities.rogue.follow, "fighter");
  assert.equal(s.entities.cleric.follow, undefined, "it no longer shows as following");
  const told = r.events.filter((e) => e.type === "follow" && e.leader === null && e.id === "cleric");
  assert.equal(told.length, 1);
  assert.ok(told[0].why, "and the event says why");
});

test("undo, redo and a replay of a walk up the steps give the same state", () => {
  const s = game(yard("hex"), ABREAST);
  const acts = [{ type: "move", actor: "fighter", to: { q: 15, r: 4, z: 10 } }, { type: "move", actor: "fighter", to: { q: 12, r: 1, z: 10 } }, { type: "move", actor: "fighter", to: { q: 5, r: 4, z: 0 } }];
  const start = json(s), h = createHistory(), states = [start];
  for (const a of acts) { const b = mark(s), r = ok(apply(s, a, DM)); h.record(b, s, describeStep(a, r.events, b, s)); states.push(json(s)); }
  const end = json(s);
  for (let n = acts.length - 1; n >= 0; n--) { h.undo(s); assert.equal(json(s), states[n], `undo ${n}`); }
  for (let n = 0; n < acts.length; n++) h.redo(s);
  assert.equal(json(s), end, "redo");
  const again = JSON.parse(start);
  for (const a of acts) ok(apply(again, a, DM));
  assert.equal(json(again), end, "replay");
});
