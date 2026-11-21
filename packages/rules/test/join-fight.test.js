// #671 (PB-2): a new game's party follows the first hero, and a fight that starts with party members outside it can be
// joined in one action: they walk in, roll Initiative and take their turns, by the SRD (a creature that arrives joins).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const party = (s) => Object.values(s.entities).filter((e) => e.side === "party");
const inOrder = (s, id) => s.encounter.order.some((o) => o.id === id);

test("newGame without follow leaves the heroes apart; with it they follow the first hero, in marching order", () => {
  assert.ok(party(newGame(7)).every((e) => e.follow === undefined));
  const s = newGame(7, { follow: true }), [lead, ...rest] = party(s);
  assert.equal(lead.follow, undefined);
  assert.deepEqual(rest.map((e) => e.follow), rest.map(() => lead.id));
  assert.equal(s.timeline.length, newGame(7).timeline.length, "the chronicle is not touched");
  assert.equal(s.seq, newGame(7).seq);
  assert.equal(newGame(7, { follow: true, grid: "square" }).entities[rest[0].id].follow, lead.id, "on squares too");
});

test("a lone hero has nobody to follow, and a new game is made all the same", () => {
  const s = newGame(7, { follow: true, party: [{ pregen: "wizard" }] });
  assert.equal(party(s).length, 1);
});

test("walking toward the goblins takes the party in: all four are in the fight", () => {
  const s = newGame(7, { follow: true });
  const lead = party(s)[0];
  for (let i = 0; i < 12 && !s.encounter; i++) ok(apply(s, { type: "move", actor: lead.id, to: { q: 2, r: -1 } }, DM));
  assert.ok(s.encounter, "a fight started");
  for (const e of party(s)) assert.ok(inOrder(s, e.id), `${e.name} is in the fight`);
});

test("joinFight: one who stood apart walks in, rolls Initiative and is in the order", () => {
  const s = newGame(7, { follow: true });
  const [lead, rogue] = party(s);
  ok(apply(s, { type: "follow", actor: rogue.id, leader: null }, DM));
  for (let i = 0; i < 12 && !s.encounter; i++) ok(apply(s, { type: "move", actor: lead.id, to: { q: 2, r: -1 } }, DM));
  assert.ok(s.encounter);
  assert.ok(!inOrder(s, rogue.id), "the rogue was left outside");
  const before = s.encounter.order.length, from = { ...rogue.pos };
  const r = ok(apply(s, { type: "joinFight" }, DM));
  assert.ok(inOrder(s, rogue.id));
  assert.equal(s.encounter.order.length, before + 1);
  assert.ok(r.events.some((e) => e.type === "joined" && e.id === rogue.id && typeof e.init === "number"), "it rolled Initiative");
  assert.ok(r.events.some((e) => e.type === "moved" && e.id === rogue.id), "it walked in");
  assert.notDeepEqual(rogue.pos, from);
  const again = apply(s, { type: "joinFight" }, DM);
  assert.equal(again.ok, false, "nobody is left outside");
});

test("joinFight: who names the ones to bring; the turn in progress does not move", () => {
  const s = newGame(7);
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  const [a, b, c] = party(s);
  b.pos = { q: a.pos.q - 7, r: a.pos.r, z: 0 }; c.pos = { q: a.pos.q - 7, r: a.pos.r + 1, z: 0 };       // two stand outside the arena, in reach of it
  ok(apply(s, { type: "startEncounter", center: a.pos }, DM));
  const cur = s.encounter.order[s.encounter.turn].id;
  const out = party(s).filter((e) => !inOrder(s, e.id));
  assert.ok(out.length >= 2, `${out.length} outside`);
  const pick = out[0];
  ok(apply(s, { type: "joinFight", who: [pick.id] }, DM));
  assert.ok(inOrder(s, pick.id));
  assert.equal(s.encounter.order[s.encounter.turn].id, cur);
  for (const e of out.slice(1)) assert.ok(!inOrder(s, e.id), "only those named");
});

test("joinFight is the DM's, needs a fight, and a refusal changes nothing", () => {
  const s = newGame(7, { follow: true });
  ok(apply(s, { type: "claim", entity: party(s)[0].id, user: "pat", userName: "Pat" }, PAT));
  const none = apply(s, { type: "joinFight" }, DM);
  assert.equal(none.ok, false);
  assert.match(none.error, /no fight/);
  const copy = structuredClone(s);
  assert.equal(apply(s, { type: "joinFight" }, PAT).ok, false);
  assert.deepEqual(s, copy);
});
