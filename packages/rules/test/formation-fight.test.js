// E-P4: a fight starts in formation. Followers brought up by `catchUp` stand on their formation places
// (in the frame of the way the leader last faced) when those are free, else where the trail puts them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import * as H from "../src/hex.js";
import { newMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const at = (s, id) => { const p = s.entities[id].pos; return { q: p.q, r: p.r }; };
const tiles = (cells) => Object.fromEntries(cells.map((h) => [`${h.q},${h.r}`, { t: "stone" }]));
const field = () => newMap({ id: "field", name: "Open field", starts: [{ q: 0, r: 0 }],
  levels: [{ id: "ground", name: "Ground", z: 0, tiles: tiles(H.range({ q: 0, r: 0 }, 20)) }] });
const REST = ["rogue", "cleric", "wizard"];
const PINNED = [{ q: 4, r: 1 }, { q: 3, r: 0 }, { q: 2, r: 1 }];       // the rogue's place taken: it takes the next nearest

const squareField = () => {
  const cells = [];
  for (let q = 0; q < 30; q++) for (let r = 0; r < 30; r++) cells.push({ q, r });
  return newMap({ id: "sq", name: "A square yard", grid: "square", starts: [{ q: 2, r: 2 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles: tiles(cells) }] });
};
// The fighter leads in `shape`, walking from `from` to `to`; then the others are put 9 cells back, outside the arena, and a
// fight starts at the leader. `fight: false` stops before it (what the same party walked into is the oracle for the places).
function setup(shape, { edit = () => {}, mid = () => {}, map = field, from = [0, 0], to = [4, 0], back = [-10, 0], fight = true } = {}) {
  const s = newGame(4);
  ok(apply(s, { type: "loadMap", map: map() }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  ok(apply(s, { type: "claim", entity: "fighter", user: "pat", userName: "Pat" }, PAT));
  const [fq, fr] = from;
  for (const [id, dq] of [["fighter", 0], ["rogue", -1], ["cleric", -2], ["wizard", -3]]) s.entities[id].pos = { q: fq + dq, r: fr, z: 0 };
  ok(apply(s, { type: "partyFollow", leader: "fighter", shape }, DM));
  ok(apply(s, { type: "move", actor: "fighter", to: { q: to[0], r: to[1] } }, DM));
  edit(s);
  if (!fight) return { s };
  const [bq, br] = back;
  REST.forEach((id, i) => { s.entities[id].pos = { q: to[0] + bq, r: to[1] + br + i, z: 0 }; });
  mid(s);
  const r = ok(apply(s, { type: "startEncounter", center: at(s, "fighter") }, DM));
  return { s, r };
}
const cells = (s) => REST.map((id) => at(s, id));
// Where the party stood when it had just walked there: the places a fight should set them on.
const walkedPlaces = (shape, o = {}) => cells(setup(shape, { ...o, fight: false }).s);
test("two abreast: followers stand on their pair places when the fight starts", () => {
  const { s, r } = setup("pairs");
  assert.equal(s.entities.fighter.formation.face, 0);
  const plain = setup("column").s;
  const place = REST.map((id) => at(s, id));
  assert.deepEqual(new Set(place.map((p) => `${p.q},${p.r}`)).size, 3);
  assert.ok(r.events.some((e) => e.type === "moved" && e.caughtUp));
  for (const id of REST) assert.ok(H.dist(at(s, id), at(s, "fighter")) <= 2, `${id} is close`);
  // not the column's places
  assert.notDeepEqual(place, REST.map((id) => at(plain, id)));
});

test("two abreast matches the places the same party took when it walked", () => {
  const walkedTo = (() => {
    const s = newGame(4);
    ok(apply(s, { type: "loadMap", map: field() }, DM));
    ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
    for (const [id, q, r] of [["fighter", 0, 0], ["rogue", -1, 0], ["cleric", -2, 0], ["wizard", -3, 0]]) s.entities[id].pos = { q, r, z: 0 };
    ok(apply(s, { type: "partyFollow", leader: "fighter", shape: "pairs" }, DM));
    ok(apply(s, { type: "move", actor: "fighter", to: { q: 4, r: 0 } }, DM));
    return REST.map((id) => at(s, id));
  })();
  const { s } = setup("pairs");
  assert.deepEqual(REST.map((id) => at(s, id)), walkedTo);
});

test("a line: four across, the places the party took when it walked", () => {
  const { s } = setup("line"), want = walkedPlaces("line"), l = at(s, "fighter");
  assert.deepEqual(cells(s), want);
  const off = cells(s).filter((p) => p.r !== l.r);
  assert.ok(off.length >= 2, "abreast, not in file");
  assert.equal(new Set(cells(s).concat([l]).map((p) => `${p.q},${p.r}`)).size, 4);
  assert.notDeepEqual(cells(s), cells(setup("column").s));
});

test("a held formation puts followers where they stood", () => {
  const { s } = setup("held", { edit: (s) => { s.entities.rogue.pos = { q: 3, r: 1, z: 0 }; s.entities.cleric.pos = { q: 3, r: 0, z: 0 }; s.entities.wizard.pos = { q: 2, r: 1, z: 0 };
    ok(apply(s, { type: "partyFollow", leader: "fighter", shape: "held" }, DM)); } });
  const l = s.entities.fighter.pos;
  assert.equal(s.entities.fighter.formation.shape, "held");
  assert.deepEqual(REST.map((id) => at(s, id)), [{ q: 3, r: 1 }, { q: 3, r: 0 }, { q: 2, r: 1 }].map((p) => p), `around ${l.q},${l.r}`);
});

test("a blocked slot: the follower falls back to today's place", () => {
  const open = setup("pairs").s;
  const target = at(open, "cleric");
  const blocked = setup("pairs", { mid: (s) => { ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: target }, DM)); } });
  assert.notDeepEqual(at(blocked.s, "cleric"), target);
  for (const id of ["rogue", "wizard"]) assert.ok(H.dist(at(blocked.s, id), at(blocked.s, "fighter")) <= 3);
  const ids = ["fighter", ...REST];
  assert.equal(new Set(ids.map((id) => `${at(blocked.s, id).q},${at(blocked.s, id).r}`)).size, 4);
});

test("a slot held by a creature the party can see only once the fight starts: the same as a visible blocker", () => {
  const target = at(setup("pairs").s, "cleric");
  const run = (hidden) => setup("pairs", { mid: (s) => { ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: target, hidden }, DM)); } });
  const hid = run(true), vis = run(false);
  assert.deepEqual(REST.map((id) => at(hid.s, id)), REST.map((id) => at(vis.s, id)));
  const seen = (x) => viewEvents(x.r.events, x.s, PAT).filter((e) => e.type === "moved" || e.type === "found" || e.type === "manual").map((e) => JSON.stringify(e));
  assert.deepEqual(seen(hid), seen(vis));
  assert.ok(!seen(hid).some((e) => /found|manual/.test(e)));
  // the fight start shows everyone in the arena, as it always has: the same event for a creature anywhere in it
  assert.ok(hid.r.events.some((e) => e.type === "revealed"));
});

test("no formation, a column, or no facing yet: the trail, as before", () => {
  const col = setup("column"), none = setup("pairs", { mid: (s) => { delete s.entities.fighter.formation; } });
  assert.deepEqual(cells(none.s), cells(col.s));
  // A leader that never walked has no facing: the same places as the column's, from the same start.
  const run = (shape) => {
    const s = newGame(4);
    ok(apply(s, { type: "loadMap", map: field() }, DM));
    ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
    for (const [id, q, r] of [["fighter", 0, 0], ["rogue", -8, 0], ["cleric", -8, 1], ["wizard", -8, 2]]) s.entities[id].pos = { q, r, z: 0 };
    ok(apply(s, { type: "partyFollow", leader: "fighter", shape }, DM));
    if (shape === "pairs") assert.equal(s.entities.fighter.formation.face, undefined);
    ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 } }, DM));
    return cells(s);
  };
  assert.deepEqual(run("pairs"), run("column"));
});

test("a held single-file shape is the column", () => {
  const edit = (s) => { for (const [id, q] of [["rogue", 3], ["cleric", 2], ["wizard", 1]]) s.entities[id].pos = { q, r: 0, z: 0 };
    ok(apply(s, { type: "partyFollow", leader: "fighter", shape: "held" }, DM)); };
  const held = setup("held", { edit }), col = setup("column", { edit });
  assert.ok(held.s.entities.fighter.formation.slots);
  assert.deepEqual(cells(held.s), cells(col.s));
});

test("a square grid, facing diagonally: the places the party took when it walked", () => {
  const o = { map: squareField, from: [10, 10], to: [14, 14], back: [-9, 0] };
  const { s } = setup("pairs", o);
  assert.equal(s.entities.fighter.formation.face % 2, 1, "a diagonal face");
  assert.deepEqual(cells(s), walkedPlaces("pairs", o));
  assert.notDeepEqual(cells(s), cells(setup("column", o).s));
});

test("a mount's rider and a Grappled follower keep today's places", () => {
  const rider = (s) => { const h = ok(apply(s, { type: "spawn", monster: "warhorse", at: { q: 10, r: 0 } }, DM)).events[0].id;
    s.entities[h].pos = { ...s.entities.rogue.pos }; s.entities.rogue.riding = { on: h, controlled: true, size: "large" }; s.entities[h].rider = "rogue"; };
  const a = setup("pairs", { mid: rider }), b = setup("column", { mid: rider });
  assert.deepEqual(at(a.s, "rogue"), at(b.s, "rogue"));
  const grab = (s) => ok(apply(s, { type: "condition", actor: "cleric", condition: "grappled" }, DM));
  const c = setup("pairs", { mid: grab }), d = setup("column", { mid: grab });
  assert.deepEqual(at(c.s, "cleric"), at(d.s, "cleric"));
  assert.equal(!!c.s.entities.cleric.follow, !!d.s.entities.cleric.follow);
});

test("a slot beyond the arena's edge is not used", () => {
  const { s } = setup("pairs", { mid: (s) => { ok(apply(s, { type: "formation", leader: "fighter", slots: { wizard: { back: 9, side: 0 } } }, DM)); } });
  const l = at(s, "fighter"), w = at(s, "wizard");
  assert.notDeepEqual(w, { q: l.q - 9, r: l.r });
  assert.ok(H.dist(w, l) <= 6, "in the arena");
});

test("a slot cell with a ledge above it: the follower's own level wins the tie", () => {
  const stacked = () => newMap({ id: "stack", name: "Two levels", starts: [{ q: 0, r: 0 }], levels: [
    { id: "ground", name: "Ground", z: 0, tiles: tiles(H.range({ q: 0, r: 0 }, 20)) },
    { id: "ledge", name: "Ledge", z: 5, tiles: tiles([{ q: 3, r: 0 }]) }] });
  const { s } = setup("pairs", { map: stacked });
  assert.deepEqual(at(s, "cleric"), { q: 3, r: 0 });
  assert.equal(s.entities.cleric.pos.z, 0);
});

// Cells the party has not seen: a region not yet revealed holds the rogue's place (the first set down, before the party looks around).
const pocketed = (s, extra) => {
  const hole = at(setup("pairs").s, "rogue");
  s.map.regions = [{ id: "pocket", name: "A pocket", level: "ground", hexes: [H.col(hole)] }];
  extra?.(s, hole);
  return hole;
};
test("an unseen cell is never a slot: the first follower down is placed the same with a hidden creature there or none", () => {
  const run = (spawn) => setup("pairs", { mid: (s) => pocketed(s, (s, hole) => { if (spawn) ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: hole, hidden: true }, DM)); }) });
  const none = run(false), hid = run(true), hole = at(setup("pairs").s, "rogue");
  assert.notDeepEqual(at(none.s, "rogue"), hole);
  assert.deepEqual(at(hid.s, "rogue"), at(none.s, "rogue"));
  // The rogue's walk is the same event for the players. (Once it arrives it looks around and the pocket is seen, so what
  // the others do after that rests on a creature the fight start shows anyway, as the next test says.)
  const first = (x) => JSON.stringify(viewEvents(x.r.events, x.s, PAT).find((e) => e.type === "moved" && e.id === "rogue"));
  assert.equal(first(hid), first(none));
});

test("a hidden creature on a seen slot: the fight start shows it in either case", () => {
  const hole = at(setup("pairs").s, "cleric");
  const none = setup("pairs"), hid = setup("pairs", { mid: (s) => { ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: hole, hidden: true }, DM)); } });
  assert.deepEqual(at(none.s, "cleric"), hole);
  assert.notDeepEqual(at(hid.s, "cleric"), hole);
  const g = Object.values(hid.s.entities).find((e) => e.side !== "party");
  assert.ok(hid.r.events.some((e) => e.type === "revealed" && e.id === g.id), "revealed at the start of the fight, as everyone in the arena is");
  assert.ok(!hid.s.entities[g.id].hidden);
});

test("two followers whose places are taken: the outcome is fixed and nobody shares a cell", () => {
  const hole = at(setup("pairs").s, "rogue");
  const a = setup("pairs", { mid: (s) => { ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: hole }, DM)); } });
  const b = setup("pairs", { mid: (s) => { ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: hole }, DM)); } });
  assert.deepEqual(cells(a.s), cells(b.s), "replays exactly");
  const all = [at(a.s, "fighter"), ...cells(a.s)].map((p) => `${p.q},${p.r}`);
  assert.equal(new Set(all).size, 4);
  assert.deepEqual(cells(a.s), PINNED);
});

test("a fight that cannot start leaves the game as it was", () => {
  const { s } = setup("pairs", { fight: false });
  REST.forEach((id, i) => { s.entities[id].pos = { q: -2, r: i, z: 0 }; });
  s.map = { ...s.map, holding: true };
  const was = JSON.stringify(s);
  assert.equal(apply(s, { type: "startEncounter", center: at(s, "fighter") }, DM).ok, false);
  assert.equal(JSON.stringify(s), was);
  assert.equal(apply(s, { type: "startEncounter", center: { q: 40, r: 40 } }, DM).ok, false);
  assert.equal(JSON.stringify(s), was);
});

test("a follower that is not following is left where it was", () => {
  const { s } = setup("pairs", { mid: (s) => { ok(apply(s, { type: "follow", actor: "wizard", leader: null }, DM)); } });
  assert.equal(s.entities.wizard.follow ?? null, null);
  assert.deepEqual(at(s, "wizard"), { q: -6, r: 2 });
});
