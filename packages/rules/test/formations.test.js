// Formations (#303): a leader's followers keep a slot behind it in its frame, captured as they stand
// when it starts leading, from a preset, or placed by hand; a formation with no room walks as the
// column and comes back where there is room. A player may lead with their own character.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, inFight } from "../src/engine.js";
import * as H from "../src/hex.js";
import { gridOf, SQUARE } from "../src/grid.js";
import { newMap } from "../src/map.js";
import { migrate } from "../src/migrate.js";
import { newGame } from "../src/scenario.js";
import { overlapAt, footprint } from "../src/space.js";
import { view, viewEvents } from "../src/view.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { captureSlots, frameOf, slotOf } from "../src/engine/world.js";
import { holds } from "../src/zones.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "refused"); if (re) assert.match(r.error, re); return r; };
const at = (s, id) => { const p = s.entities[id].pos; return { q: p.q, r: p.r }; };
const PARTY = ["fighter", "rogue", "cleric", "wizard"];

function game(map, places, { seed = 4 } = {}) {
  const s = newGame(seed);
  ok(apply(s, { type: "loadMap", map }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  ok(apply(s, { type: "claim", entity: "fighter", user: "pat", userName: "Pat" }, PAT));
  for (const [id, q, r] of places) s.entities[id].pos = { q, r, z: 0 };
  return s;
}
const tiles = (cells) => Object.fromEntries(cells.map((h) => [`${h.q},${h.r}`, { t: "stone" }]));
const field = () => newMap({ id: "field", name: "Open field", starts: [{ q: 0, r: 0 }],
  levels: [{ id: "ground", name: "Ground", z: 0, tiles: tiles(H.range({ q: 0, r: 0 }, 14)) }] });
// Two open fields joined by a passage one hex wide from q = -3 to q = 3 along r = 0.
const pinch = () => {
  const cells = [];
  for (let q = -14; q <= 14; q++) for (let r = -5; r <= 5; r++) if (Math.abs(q + r / 2) > 4 || r === 0) cells.push({ q, r });
  return newMap({ id: "pinch", name: "The pinch", starts: [{ q: -10, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles: tiles(cells) }] });
};
const squareField = () => {
  const cells = [];
  for (let q = 0; q < 24; q++) for (let r = 0; r < 24; r++) cells.push({ q, r });
  return newMap({ id: "sq", name: "A square yard", grid: "square", starts: [{ q: 2, r: 2 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles: tiles(cells) }] });
};
// Nobody on another's space, by footprints and heights.
function apartAll(s, ids = PARTY) {
  const G = gridOf(s.map), es = ids.map((id) => s.entities[id]);
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) assert.ok(!overlapAt(es[i], es[i].pos, es[j], es[j].pos, G), `${es[i].id} and ${es[j].id} share a space`);
}
// Where each follower stands, as a slot in the leader's frame facing `face`.
const slotsNow = (s, leader, face) => {
  const G = gridOf(s.map), F = frameOf(G, s.entities[leader].pos, face), out = {};
  for (const id of PARTY) if (id !== leader) { const sl = slotOf(G, F, s.entities[id].pos); out[id] = { back: Math.round(sl.back * 2) / 2 || 0, side: Math.round(sl.side * 2) / 2 || 0 }; }
  return out;
};

test("two abreast on hexes: each follower takes the place nearest its slot, none ahead, none on another", () => {
  const s = game(field(), [["fighter", 0, 0], ["rogue", -1, 0], ["cleric", -2, 0], ["wizard", -3, 0]]);
  const r = ok(apply(s, { type: "partyFollow", leader: "fighter", shape: "pairs" }, DM));
  assert.deepEqual(r.events.at(-1), { type: "formation", id: "fighter", shape: "pairs" });
  assert.deepEqual(s.entities.fighter.formation, { shape: "pairs" });
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 8, r: 0 } }, PAT));
  // Facing east: the first beside the leader (behind, as hexes go), then a pair behind.
  assert.deepEqual(["fighter", "rogue", "cleric", "wizard"].map((id) => at(s, id)), [{ q: 8, r: 0 }, { q: 7, r: 1 }, { q: 7, r: 0 }, { q: 6, r: 1 }]);
  assert.equal(s.entities.fighter.formation.face, 0);
  apartAll(s);
  // And the next walk the same, turned to the new way.
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 8, r: 6 } }, PAT));
  apartAll(s);
  for (const id of ["rogue", "cleric", "wizard"]) assert.ok(H.dist(at(s, id), at(s, "fighter")) <= 2, `${id} kept close`);
});

test("captured: the party keeps the shape it stood in when the leader started leading", () => {
  const s = game(field(), [["fighter", 0, 0], ["rogue", -1, 1], ["cleric", -1, 0], ["wizard", -2, 1]]);
  ok(apply(s, { type: "partyFollow", leader: "fighter" }, DM));
  const fm = s.entities.fighter.formation;
  assert.equal(fm.shape, "held");
  assert.deepEqual(Object.keys(fm.slots).sort(), ["cleric", "rogue", "wizard"]);
  const before = slotsNow(s, "fighter", fm.face);
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 9, r: 0 } }, PAT));
  assert.deepEqual(slotsNow(s, "fighter", s.entities.fighter.formation.face), before, "the same shape after the walk");
  // A preset chosen later replaces it; a second partyFollow without a shape keeps what the leader has.
  ok(apply(s, { type: "formation", leader: "fighter", shape: "wedge" }, PAT));
  ok(apply(s, { type: "partyFollow", leader: "fighter" }, DM));
  assert.equal(s.entities.fighter.formation.shape, "wedge");
  // The column is the trail, as it always was.
  ok(apply(s, { type: "formation", leader: "fighter", shape: "column" }, DM));
  assert.equal(s.entities.fighter.formation.slots, undefined);
});

test("a single file stood in is the column: walked by the trail in marching order, as before", () => {
  const s = game(field(), [["fighter", 0, 0], ["rogue", -1, 0], ["cleric", -2, 0], ["wizard", -3, 0]]);
  ok(apply(s, { type: "marchingOrder", order: ["fighter", "wizard", "rogue", "cleric"] }, DM));
  ok(apply(s, { type: "partyFollow", leader: "fighter" }, DM));
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 6, r: 0 } }, DM));
  assert.deepEqual(["fighter", "wizard", "rogue", "cleric"].map((id) => at(s, id).q), [6, 5, 4, 3]);
});

test("a passage one hex wide: the formation goes through as a column in marching order and opens out after", () => {
  const s = game(pinch(), [["fighter", -6, 0], ["rogue", -7, 0], ["cleric", -7, 1], ["wizard", -8, 1]]);
  ok(apply(s, { type: "marchingOrder", order: ["fighter", "cleric", "rogue", "wizard"] }, DM));
  ok(apply(s, { type: "partyFollow", leader: "fighter", shape: "pairs" }, DM));
  // Into the passage: single file behind the leader, in marching order, all on the passage's row.
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 2, r: 0 } }, DM));
  assert.deepEqual(["fighter", "cleric", "rogue", "wizard"].map((id) => at(s, id)), [2, 1, 0, -1].map((q) => ({ q, r: 0 })));
  apartAll(s);
  // Out the other side, where there is room: two abreast again.
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 10, r: 0 } }, DM));
  // The preset is dealt in marching order: the cleric beside the leader, then the rogue and the wizard.
  assert.deepEqual(["fighter", "cleric", "rogue", "wizard"].map((id) => at(s, id)), [{ q: 10, r: 0 }, { q: 9, r: 1 }, { q: 9, r: 0 }, { q: 8, r: 1 }]);
  for (const id of PARTY) assert.equal(s.entities[id].follow ?? "fighter", "fighter");
});

test("nobody is put on the far side of a wall from the leader", () => {
  const map = field();
  // A wall along the south side of the row the leader walks (between r = 0 and r = 1), east of q = -3.
  map.walls.push({ id: "w", level: "ground", a: [-4, 0.75], b: [100, 0.75], kind: "wall" });
  const s = game(map, [["fighter", -4, 0], ["rogue", -5, 0], ["cleric", -5, -1], ["wizard", -6, 0]]);
  ok(apply(s, { type: "partyFollow", leader: "fighter", shape: "line" }, DM));
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 8, r: 0 } }, DM));
  for (const id of PARTY) assert.ok(s.entities[id].pos.r <= 0, `${id} stands north of the wall: ${JSON.stringify(at(s, id))}`);
  apartAll(s);
});

test("squares: four across, facing a diagonal; the frame turns with the leader", () => {
  const s = game(squareField(), [["fighter", 4, 4], ["rogue", 3, 4], ["cleric", 4, 3], ["wizard", 3, 3]]);
  ok(apply(s, { type: "partyFollow", leader: "fighter", shape: "line" }, DM));
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 12, r: 4 } }, DM));
  // Facing east: the leader second from the left of the row, one each side and one further right.
  const f = at(s, "fighter");
  assert.deepEqual(["rogue", "cleric", "wizard"].map((id) => [at(s, id).q - f.q, at(s, id).r - f.r]), [[0, 1], [0, -1], [0, 2]]);
  // Down a diagonal (south-east): the row is the diagonal row through the leader.
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 18, r: 10 } }, DM));
  const g = at(s, "fighter");
  assert.deepEqual(["rogue", "cleric", "wizard"].map((id) => [at(s, id).q - g.q, at(s, id).r - g.r]), [[-1, 1], [1, -1], [-2, 2]]);
  apartAll(s);
});

test("a Large follower takes a place its whole footprint fits, clear of the others", () => {
  for (const map of [field(), squareField()]) {
    const square = map.grid === "square", o = square ? 6 : 0;
    const s = game(map, [["fighter", o, o], ["rogue", o - 1, o], ["cleric", o - 3, o], ["wizard", o - 1, o - 1]]);
    s.entities.cleric.size = "large";
    assert.ok(footprint(s.entities.cleric, s.entities.cleric.pos, gridOf(s.map)).length > 1);
    ok(apply(s, { type: "partyFollow", leader: "fighter", shape: "pairs" }, DM));
    ok(apply(s, { type: "move", actor: "fighter", to: { q: o + 8, r: o } }, DM));
    apartAll(s);
    for (const id of ["rogue", "cleric", "wizard"]) assert.equal(s.entities[id].follow, "fighter", `${id} kept up on ${map.grid}`);
  }
});

test("a flyer keeps its height in the formation", () => {
  const s = game(field(), [["fighter", 0, 0], ["rogue", -1, 0], ["cleric", -2, 1], ["wizard", -2, 0]]);
  Object.assign(s.entities.wizard, { speeds: { fly: 30 }, hover: true });
  s.entities.wizard.pos.z = 10;
  ok(apply(s, { type: "partyFollow", leader: "fighter", shape: "pairs" }, DM));
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 8, r: 0 } }, DM));
  assert.equal(s.entities.wizard.pos.z, 10);
  assert.ok(H.dist(at(s, "wizard"), at(s, "fighter")) <= 2);
  apartAll(s);
});

test("a player leads with their own character and sets the formation while leading; refused actions change nothing", () => {
  const s = game(field(), [["fighter", 0, 0], ["rogue", -1, 0], ["cleric", -2, 1], ["wizard", -2, 0]]);
  const g = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 9, r: -6 } }, DM)).events[0].id;
  const hid = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 4, r: 5 }, hidden: true }, DM)).events[0].id;
  const before = JSON.stringify(s);
  // Not while nobody follows; not with someone else's character; no such shape; places only for followers.
  no(apply(s, { type: "formation", leader: "fighter", shape: "pairs" }, PAT), /isn't leading anyone/);
  no(apply(s, { type: "partyFollow", leader: "rogue" }, PAT), /isn't yours to control/);
  no(apply(s, { type: "partyFollow", leader: "fighter", shape: "blob" }, PAT), /No such formation/);
  const noSuch = apply(s, { type: "partyFollow", leader: "nobody" }, PAT).error;
  assert.equal(apply(s, { type: "partyFollow", leader: g }, PAT).error, noSuch);
  assert.equal(apply(s, { type: "partyFollow", leader: hid }, PAT).error, noSuch);
  assert.equal(JSON.stringify(s), before);

  const r = ok(apply(s, { type: "partyFollow", leader: "fighter", shape: "pairs" }, PAT));
  assert.deepEqual(r.events.filter((e) => e.type === "follow").map((e) => e.id).sort(), ["cleric", "rogue", "wizard"]);
  const mid = JSON.stringify(s);
  // Places by hand: for a follower, in range, in half steps. Anything else the same refusal for any id.
  const notFollowing = apply(s, { type: "formation", leader: "fighter", slots: { nobody: { back: 1, side: 0 } } }, PAT).error;
  assert.match(notFollowing, /Only those following/);
  for (const id of [g, hid, "fighter"]) assert.equal(apply(s, { type: "formation", leader: "fighter", slots: { [id]: { back: 1, side: 0 } } }, PAT).error, notFollowing);
  for (const bad of [{ back: -1, side: 0 }, { back: 1, side: 13 }, { back: 0.3, side: 0 }, { back: 1 }, { back: "1", side: 0 }, null])
    no(apply(s, { type: "formation", leader: "fighter", slots: { rogue: bad } }, PAT), /A place is/);
  no(apply(s, { type: "formation", leader: "fighter", shape: "pairs", slots: { rogue: { back: 1, side: 0 } } }, PAT), /not both/);
  no(apply(s, { type: "formation", leader: "fighter", slots: {} }, PAT));
  no(apply(s, { type: "formation", leader: "rogue", shape: "line" }, PAT), /isn't yours/);
  assert.equal(JSON.stringify(s), mid);
  // From the preset, one moved by hand: the others keep their preset places.
  const c = ok(apply(s, { type: "formation", leader: "fighter", slots: { wizard: { back: 2, side: -1 } } }, PAT));
  assert.deepEqual(s.entities.fighter.formation.slots, { rogue: { back: 0, side: 1 }, cleric: { back: 1, side: 0 }, wizard: { back: 2, side: -1 } });
  assert.deepEqual(viewEvents(c.events, s, PAT), [{ type: "formation", id: "fighter", shape: "custom", slots: s.entities.fighter.formation.slots }]);
  assert.deepEqual(view(s, PAT).entities.fighter.formation, s.entities.fighter.formation);
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 6, r: 0 } }, PAT));
  apartAll(s);
  // The DM can always take over.
  ok(apply(s, { type: "partyFollow", leader: "rogue", shape: "column" }, DM));
  assert.equal(s.entities.fighter.follow, "rogue");
  // In a fight nobody falls into line.
  ok(apply(s, { type: "startEncounter", center: at(s, "fighter") }, DM));
  const inside = JSON.stringify(s);
  no(apply(s, { type: "formation", leader: "rogue", shape: "pairs" }, DM), /middle of a fight/);
  assert.equal(JSON.stringify(s), inside);
});

// The wizard is placed by hand far out on the right, beyond where the leader's own walk would spot
// anything lying in wait (2 hexes), so the goblin is still unknown when the wizard comes.
for (const sight of ["rooms", "los"]) test(`a hidden creature where a slot lands (sight ${sight}): the shape is laid out as if it were not there, and the one sent there finds it`, () => {
  const setup = () => {
    const s = game(field(), [["fighter", 0, 0], ["rogue", -1, 0], ["cleric", -2, 1], ["wizard", -2, 0]]);
    ok(apply(s, { type: "setting", key: "sight", value: sight }, DM));
    ok(apply(s, { type: "partyFollow", leader: "fighter", shape: "pairs" }, DM));
    ok(apply(s, { type: "formation", leader: "fighter", slots: { wizard: { back: 2, side: 3 } } }, DM));
    return s;
  };
  const plain = setup();
  ok(apply(plain, { type: "move", actor: "fighter", to: { q: 8, r: 0 } }, DM));
  const spot = at(plain, "wizard");
  assert.ok(spot.r >= 3, JSON.stringify(spot));
  const s = setup();
  const g = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: spot, hidden: true }, DM)).events[0].id;
  const r = ok(apply(s, { type: "move", actor: "fighter", to: { q: 8, r: 0 } }, DM));
  for (const id of ["fighter", "rogue", "cleric"]) assert.deepEqual(at(s, id), at(plain, id), id);
  assert.equal(H.dist(at(s, "wizard"), spot), 1);
  const found = r.events.findIndex((e) => e.type === "revealed" && e.id === g);
  assert.ok(found > r.events.findIndex((e) => e.type === "moved" && e.id === "wizard"), "found by the wizard, on arriving");
  assert.ok(!s.entities[g].hidden);
  apartAll(s, [...PARTY, g]);
});

test("undo and redo are exact, and a replay walks the same", () => {
  const run = () => {
    const s = game(pinch(), [["fighter", -6, 0], ["rogue", -7, 0], ["cleric", -7, 1], ["wizard", -8, 1]]), h = createHistory();
    const act = (a, ctx = DM) => { const before = mark(s); const res = ok(apply(s, a, ctx)); h.record(before, s, describeStep(a, res.events, before, s)); return res; };
    const start = JSON.stringify(s);
    act({ type: "partyFollow", leader: "fighter" }, PAT);
    act({ type: "formation", leader: "fighter", shape: "line" }, PAT);
    act({ type: "move", actor: "fighter", to: { q: -10, r: 3 } }, PAT);
    act({ type: "formation", leader: "fighter", slots: { rogue: { back: 1, side: 1 } } }, PAT);
    act({ type: "move", actor: "fighter", to: { q: 2, r: 0 } }, PAT);
    act({ type: "move", actor: "fighter", to: { q: 11, r: -2 } }, PAT);
    return { s, h, start };
  };
  const a = run(), b = run();
  assert.equal(JSON.stringify(a.s), JSON.stringify(b.s), "the same actions walk the same");
  const end = JSON.stringify(a.s);
  assert.deepEqual(a.h.list().slice().reverse(), ["The party fell in behind Brenna Ironfoot", "The party walks behind Brenna Ironfoot four across",
    "Brenna Ironfoot moved", "The places behind Brenna Ironfoot were changed", "Brenna Ironfoot moved", "Brenna Ironfoot moved"].map((l) => l.replace(/Brenna Ironfoot/g, a.s.entities.fighter.name)));
  while (a.h.undo(a.s));
  assert.equal(JSON.stringify(a.s), a.start);
  while (a.h.redo(a.s));
  assert.equal(JSON.stringify(a.s), end);
});

test("saved tables: no formation walks as the column; a broken one is dropped; migrate is idempotent", () => {
  const s = game(field(), [["fighter", 0, 0], ["rogue", -1, 0], ["cleric", -1, 1], ["wizard", -2, 1]]);
  // An old table: followers set, no formation. It walks as the column did.
  for (const [i, id] of ["rogue", "cleric", "wizard"].entries()) Object.assign(s.entities[id], { follow: "fighter", march: i });
  const old = structuredClone(s);
  migrate(old);
  assert.equal(old.entities.fighter.formation, undefined);
  ok(apply(old, { type: "move", actor: "fighter", to: { q: 8, r: 0 } }, DM));
  for (const id of ["rogue", "cleric", "wizard"]) assert.equal(old.entities[id].pos.r, 0, `${id} is in the column`);
  // Broken formations are dropped, whole ones kept, and a second migration changes nothing.
  const t = structuredClone(s);
  t.entities.fighter.formation = { shape: "held", slots: { rogue: { back: 1, side: 0.25 } } };
  t.entities.rogue.formation = { shape: "pairs", face: 2 };
  t.entities.cleric.formation = { shape: "blob" };
  t.entities.wizard.formation = { shape: "custom", slots: { rogue: { back: 2, side: -1 } }, face: 3 };
  migrate(t);
  assert.equal(t.entities.fighter.formation, undefined);
  assert.equal(t.entities.cleric.formation, undefined);
  assert.deepEqual(t.entities.rogue.formation, { shape: "pairs", face: 2 });
  assert.deepEqual(t.entities.wizard.formation, { shape: "custom", slots: { rogue: { back: 2, side: -1 } }, face: 3 });
  const once = JSON.stringify(t);
  migrate(t);
  assert.equal(JSON.stringify(t), once);
});

test("a follow captures where the newcomer stands; a fight still brings everyone up", () => {
  const s = game(field(), [["fighter", -10, 0], ["rogue", -11, 1], ["cleric", -12, 1], ["wizard", -14, 7]]);
  ok(apply(s, { type: "follow", actor: "rogue", leader: "fighter" }, DM));
  assert.equal(s.entities.fighter.formation.shape, "held");
  assert.deepEqual(Object.keys(s.entities.fighter.formation.slots), ["rogue"]);
  ok(apply(s, { type: "follow", actor: "cleric", leader: "fighter" }, DM));
  assert.deepEqual(Object.keys(s.entities.fighter.formation.slots).sort(), ["cleric", "rogue"]);
  ok(apply(s, { type: "setting", key: "autoEngage", value: true }, DM));
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 8, r: 0 } }, DM));
  const r = ok(apply(s, { type: "move", actor: "fighter", to: { q: 7, r: 0 } }, DM));
  assert.ok(r.events.some((e) => e.type === "encounterStart"));
  for (const id of ["rogue", "cleric"]) assert.ok(inFight(s, id), `${id} was brought up`);
  assert.ok(!inFight(s, "wizard"));
  assert.ok(current(s));
});

test("captureSlots rounds to half cells and never puts a slot ahead of the leader", () => {
  const G = gridOf(newMap({ id: "x", name: "x", grid: "square", starts: [{ q: 0, r: 0 }], levels: [{ id: "g", name: "g", z: 0, tiles: { "0,0": { t: "stone" } } }] }));
  assert.equal(G, SQUARE);
  // Facing away from the middle of those following (south), right is west; one standing ahead is taken as beside.
  const { face, slots } = captureSlots(G, { pos: { q: 5, r: 5 } }, [{ id: "a", pos: { q: 4, r: 5 } }, { id: "b", pos: { q: 6, r: 4 } }]);
  assert.deepEqual(G.neighbors({ q: 0, r: 0 })[face], { q: 0, r: 1 });
  assert.deepEqual(slots, { a: { back: 0, side: 1 }, b: { back: 1, side: -1 } });
  const ahead = captureSlots(G, { pos: { q: 5, r: 5 } }, [{ id: "a", pos: { q: 5, r: 7 } }], 1);       // facing north, a is 2 behind
  assert.deepEqual(ahead.slots, { a: { back: 2, side: 0 } });
  assert.deepEqual(captureSlots(G, { pos: { q: 5, r: 5 } }, [{ id: "a", pos: { q: 5, r: 3 } }], 1).slots, { a: { back: 0, side: 0 } });
});

test("players are sent a formation's places only for the party", () => {
  const s = game(field(), [["fighter", 0, 0], ["rogue", -1, 0], ["cleric", -2, 1], ["wizard", -2, 0]]);
  const g = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 5, r: 5 }, hidden: true }, DM)).events[0].id;
  ok(apply(s, { type: "partyFollow", leader: "fighter" }, DM));
  s.entities.fighter.formation.slots[g] = { back: 1, side: 1 };                // as if a party member had become one of theirs
  s.entities.fighter.formation.slots.gone = { back: 2, side: 0 };              // or a creature since removed
  const seen = view(s, PAT).entities.fighter.formation;
  assert.deepEqual(Object.keys(seen.slots).sort(), ["cleric", "rogue", "wizard"]);
  assert.equal(view(s, DM).entities.fighter.formation.slots[g].back, 1);
  const ev = viewEvents([{ type: "formation", id: "fighter", shape: "held", slots: s.entities.fighter.formation.slots }], s, PAT);
  assert.deepEqual(Object.keys(ev[0].slots).sort(), ["cleric", "rogue", "wizard"]);
});

// ---------- review of #310: what a careful walker does not stop on ----------
// Both grids: the party two abreast, walking east 8 cells. `edit` changes the map or the state
// before the walk; the plain walk says where everyone would have ended.
// A spell cast outside a fight starts one: cast it on the caster's turn, then end the fight (the zone outlasts it).
function castInFight(s, a) {
  const p = s.entities[a.actor].pos, foe = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: p.q - 3, r: p.r + 3 } }, DM)).events[0].id;
  ok(apply(s, { type: "startEncounter", center: p, radius: 12 }, DM));
  for (let i = 0; i < 20 && current(s) !== a.actor; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  ok(apply(s, a, DM));
  ok(apply(s, { type: "endEncounter" }, DM));
  delete s.entities[foe];                                                      // out of the way: it was only there for the fight
}
const GRIDS = [["hex", field, 0], ["square", squareField, 8]];
function walkOver(make, o, edit = () => {}, far = false) {
  const s = game(make(), [["fighter", o, o], ["rogue", o - 1, o], ["cleric", o - 2, o], ["wizard", o - 3, o]]);
  ok(apply(s, { type: "partyFollow", leader: "fighter", shape: "pairs" }, DM));
  if (far) ok(apply(s, { type: "formation", leader: "fighter", slots: { wizard: { back: 2, side: 4 } } }, DM));   // well clear of the leader's way
  edit(s);
  const r = ok(apply(s, { type: "move", actor: "fighter", to: { q: o + 8, r: o } }, DM));
  return { s, r };
}
for (const [grid, make, o] of GRIDS) {
  const plain = walkOver(make, o).s;
  const followers = ["rogue", "cleric", "wizard"];

  test(`a spotted trap where a slot lands is not stood on; one not found is no part of the choice (${grid})`, () => {
    for (const id of followers) {
      const spot = at(plain, id);
      const trap = (state) => (s) => { s.map.objects.push({ id: "pit", def: "pit-trap", level: "ground", at: spot, state }); s.settings.passiveFind = "off"; };
      const { s, r } = walkOver(make, o, trap("found"));
      assert.ok(!r.events.some((e) => e.type === "triggered"), `${id}'s place: nobody springs the spotted pit`);
      for (const x of PARTY) assert.notDeepEqual(at(s, x), spot, `${x} is not on the pit`);
      for (const x of followers) assert.equal(s.entities[x].follow, "fighter");
      apartAll(s);
      // Covered (not found): everyone goes where they would have, and it springs as on any walk. (Not
      // on the leader's own way, where the leader springs it first.)
      if (spot.r === o) continue;
      const hid = walkOver(make, o, trap("hidden"));
      for (const x of PARTY) assert.deepEqual(at(hid.s, x), at(plain, x), `${x}, hidden pit at ${id}'s place`);
      assert.ok(hid.r.events.some((e) => e.type === "triggered" && e.id === id));
    }
  });

  test(`deep water is never a place, and difficult ground is walked as any other (${grid})`, () => {
    const water = walkOver(make, o, (s) => { s.map.levels[0].tiles[H.col(at(plain, "rogue"))] = { t: "water" }; s.map.levels[0].tiles[H.col(at(plain, "wizard"))] = { t: "water" }; });
    for (const x of PARTY) assert.notEqual(water.s.map.levels[0].tiles[H.col(at(water.s, x))].t, "water", `${x} is not in the water`);
    for (const x of followers) assert.equal(water.s.entities[x].follow, "fighter");
    apartAll(water.s);
    const rough = walkOver(make, o, (s) => { for (const t of Object.values(s.map.levels[0].tiles)) t.t = "forest"; });
    for (const x of followers) assert.deepEqual(at(rough.s, x), at(plain, x), `${x} keeps its place on difficult ground`);
  });

  test(`a Web the party knows of is not stood in; Spirit Guardians round one who stays behind is kept out of (${grid})`, () => {
    const farPlain = walkOver(make, o, () => {}, true).s, spot = at(farPlain, "wizard");
    assert.ok(Math.abs(spot.r - o) >= 4, JSON.stringify(spot));
    const { s, r } = walkOver(make, o, (s) => {
      const w = s.entities.rogue; w.spells.push("web"); w.slots = { ...w.slots, 2: 1 }; w.slotsMax = { ...w.slotsMax, 2: 1 };
      castInFight(s, { type: "cast", actor: "rogue", spell: "web", hex: spot });
    }, true);
    const web = s.effects.find((fx) => fx.zone);
    assert.ok(web, "the web is there");
    assert.ok(holds(s, web, { ...s.entities.wizard, pos: { ...spot, z: 0 } }), "the wizard's place is in the web");
    for (const x of PARTY) assert.ok(!holds(s, web, s.entities[x]), `${x} is not in the web`);
    assert.ok(!r.events.some((e) => e.type === "save"), "nobody had to save against it");
    for (const x of followers) assert.equal(s.entities[x].follow, "fighter");

    const sg = walkOver(make, o, (s) => {
      const c = s.entities.cleric; c.spells.push("spirit-guardians"); c.slots = { ...c.slots, 3: 1 }; c.slotsMax = { ...c.slotsMax, 3: 1 };
      ok(apply(s, { type: "follow", actor: "cleric", leader: null }, DM));
      c.pos = { q: spot.q + 1, r: spot.r, z: 0 };
      castInFight(s, { type: "cast", actor: "cleric", spell: "spirit-guardians", slot: 3, choice: "radiant", spare: [] });
    }, true);
    const g = sg.s.effects.find((fx) => fx.zone);
    assert.ok(g, "the guardians are there");
    assert.ok(holds(sg.s, g, { ...sg.s.entities.wizard, pos: { ...spot, z: 0 } }), "the wizard's place is in the guardians' reach");
    for (const x of ["fighter", "rogue", "wizard"]) assert.ok(!holds(sg.s, g, sg.s.entities[x]), `${x} is kept out of the guardians`);
    assert.equal(sg.s.entities.wizard.follow, "fighter");
  });

  test(`one who is down or cannot move stays put; the others keep their places (${grid})`, () => {
    for (const stop of [(s) => { s.entities.cleric.hp = 0; }, (s) => { s.entities.cleric.cond.grappled = {}; s.entities.cleric.speed = 0; }]) {
      const { s } = walkOver(make, o, stop);
      assert.notDeepEqual(at(s, "cleric"), at(plain, "cleric"), "the cleric did not walk");
      for (const x of ["rogue", "wizard"]) assert.deepEqual(at(s, x), at(plain, x), `${x} kept its slot`);
    }
  });
}

test("a follower who stops following, or dies, loses its place in a held formation", () => {
  const s = game(field(), [["fighter", 0, 0], ["rogue", -1, 1], ["cleric", -1, 0], ["wizard", -2, 1]]);
  ok(apply(s, { type: "partyFollow", leader: "fighter" }, DM));
  ok(apply(s, { type: "follow", actor: "rogue", leader: null }, DM));
  assert.deepEqual(Object.keys(s.entities.fighter.formation.slots).sort(), ["cleric", "wizard"]);
  s.entities.wizard.dead = true;
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 6, r: 0 } }, DM));
  assert.deepEqual(Object.keys(s.entities.fighter.formation.slots), ["cleric"]);
});
