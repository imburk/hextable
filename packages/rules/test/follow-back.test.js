// A leader may walk back into the place of one that follows it; the follower gives way (#671).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import * as H from "../src/hex.js";
import { gridOf } from "../src/grid.js";
import { newMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";
import { overlapAt } from "../src/space.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const tiles = (cells) => Object.fromEntries(cells.map((h) => [`${h.q},${h.r}`, { t: "stone" }]));
const field = () => newMap({ id: "field", name: "Open field", starts: [{ q: 0, r: 0 }],
  levels: [{ id: "ground", name: "Ground", z: 0, tiles: tiles(H.range({ q: 0, r: 0 }, 14)) }] });
function game(places) {
  const s = newGame(4);
  ok(apply(s, { type: "loadMap", map: field() }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  for (const [id, q, r] of places) s.entities[id].pos = { q, r, z: 0 };
  return s;
}
const mv = (s, id, q, r) => apply(s, { type: "move", actor: id, to: { q, r } }, DM);
const alone = (s) => { const G = gridOf(s.map), es = ["fighter", "rogue", "cleric", "wizard"].map((i) => s.entities[i]);
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) assert.ok(!overlapAt(es[i], es[i].pos, es[j], es[j].pos, G), `${es[i].id}/${es[j].id} share a space`); };
const P = ["rogue", "cleric", "wizard"];

test("a leader walks back onto its follower, which gives way", () => {
  const s = game([["fighter", 0, 0], ["rogue", -1, 0], ["cleric", 5, 5], ["wizard", 6, 6]]);
  ok(apply(s, { type: "follow", actor: "rogue", leader: "fighter" }, DM));
  ok(mv(s, "fighter", 3, 0));
  assert.equal(s.entities.rogue.follow, "fighter");
  const r = ok(mv(s, "fighter", 2, 0)); // one step back, onto the hex behind (where the rogue now stands)
  assert.ok(r);
  assert.deepEqual({ q: s.entities.fighter.pos.q, r: s.entities.fighter.pos.r }, { q: 2, r: 0 });
  alone(s);
  assert.equal(s.entities.rogue.follow, "fighter");
});

test("a chain of three follows and each gives way", () => {
  const s = game([["fighter", 0, 0], ["rogue", -1, 0], ["cleric", -2, 0], ["wizard", -3, 0]]);
  ok(apply(s, { type: "follow", actor: "rogue", leader: "fighter" }, DM));
  ok(apply(s, { type: "follow", actor: "cleric", leader: "rogue" }, DM));
  ok(apply(s, { type: "follow", actor: "wizard", leader: "cleric" }, DM));
  ok(mv(s, "fighter", 4, 0)); alone(s);
  for (let q = 3; q >= -3; q--) { ok(mv(s, "fighter", q, 0)); alone(s); assert.deepEqual({ q: s.entities.fighter.pos.q, r: s.entities.fighter.pos.r }, { q, r: 0 }); }
  for (const id of P) assert.ok(s.entities[id].follow, `${id} still follows`);
});

test("a non-following ally still blocks the leader", () => {
  const s = game([["fighter", 0, 0], ["rogue", 1, 0], ["cleric", 8, 8], ["wizard", 9, 9]]);
  const before = JSON.stringify(s);
  const r = mv(s, "fighter", 1, 0);
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(s), before, "a refused move changes nothing");
});

test("in a fight a follower's place is still taken", () => {
  const s = game([["fighter", 0, 0], ["rogue", 1, 0], ["cleric", 8, 8], ["wizard", 9, 9]]);
  ok(apply(s, { type: "follow", actor: "rogue", leader: "fighter" }, DM));
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 } }, DM));
  s.encounter.order = ["fighter", ...s.encounter.order.filter((x) => x !== "fighter")]; s.encounter.turn = 0;
  const before = JSON.stringify(s);
  const r = apply(s, { type: "move", actor: "fighter", to: { q: 1, r: 0 } }, DM);
  assert.equal(r.ok, false);
  assert.equal(JSON.stringify(s), before);
});
