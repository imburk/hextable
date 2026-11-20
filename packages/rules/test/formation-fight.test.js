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

// The fighter leads east (face 0) in `shape`; then the others are put 9 hexes back, outside the arena, and a fight starts at the leader.
function setup(shape, { edit = () => {}, mid = () => {} } = {}) {
  const s = newGame(4);
  ok(apply(s, { type: "loadMap", map: field() }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  ok(apply(s, { type: "claim", entity: "fighter", user: "pat", userName: "Pat" }, PAT));
  for (const [id, q, r] of [["fighter", 0, 0], ["rogue", -1, 0], ["cleric", -2, 0], ["wizard", -3, 0]]) s.entities[id].pos = { q, r, z: 0 };
  ok(apply(s, { type: "partyFollow", leader: "fighter", shape }, DM));
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 4, r: 0 } }, DM));
  edit(s);
  for (const [id, q, r] of [["rogue", -6, 0], ["cleric", -6, 1], ["wizard", -6, 2]]) s.entities[id].pos = { q, r, z: 0 };
  mid(s);
  const r = ok(apply(s, { type: "startEncounter", center: at(s, "fighter") }, DM));
  return { s, r };
}
const slotCell = (s, back, side) => {   // the cell for a slot of the fighter, facing east on the hex grid
  const l = s.entities.fighter.pos;
  return { q: l.q - back, r: l.r + side };
};

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

test("a line: four across", () => {
  const { s } = setup("line");
  const rows = REST.map((id) => at(s, id));
  const l = at(s, "fighter");
  for (const p of rows) assert.ok(H.dist(p, l) <= 3 && p.q <= l.q + 1);
  assert.equal(new Set(rows.concat([l]).map((p) => `${p.q},${p.r}`)).size, 4);
  // abreast, not in file: more than one of them stands off the leader's own row
  assert.ok(rows.filter((p) => p.r !== l.r).length >= 2);
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

test("a slot held by a creature the party cannot see: the players see what a visible blocker would show", () => {
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

test("no formation, a column, no facing yet: today's behaviour", () => {
  const col = setup("column"), none = setup("pairs", { mid: (s) => { delete s.entities.fighter.formation; } });
  assert.deepEqual(REST.map((id) => at(none.s, id)), REST.map((id) => at(col.s, id)));
  // a leader that never walked has no facing: the trail as before
  const s = newGame(4);
  ok(apply(s, { type: "loadMap", map: field() }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  for (const [id, q, r] of [["fighter", 0, 0], ["rogue", -8, 0], ["cleric", -8, 1], ["wizard", -8, 2]]) s.entities[id].pos = { q, r, z: 0 };
  ok(apply(s, { type: "partyFollow", leader: "fighter", shape: "pairs" }, DM));
  assert.equal(s.entities.fighter.formation.face, undefined);
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 } }, DM));
});

test("a follower that is not following keeps its place outside the fight; a rejected action changes nothing", () => {
  const { s } = setup("pairs", { mid: (s) => { ok(apply(s, { type: "follow", actor: "wizard", leader: null }, DM)); } });
  assert.equal(s.entities.wizard.follow ?? null, null);
  assert.deepEqual(at(s, "wizard"), { q: -6, r: 2 });
  const t = newGame(4);
  ok(apply(t, { type: "loadMap", map: field() }, DM));
  const was = JSON.stringify(t);
  assert.equal(apply(t, { type: "startEncounter", center: { q: 40, r: 40 } }, DM).ok, false);
  assert.equal(JSON.stringify(t), was);
});
