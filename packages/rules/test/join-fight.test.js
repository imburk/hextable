// #671 (PB-2): a new game's party follows the first hero, and a fight that starts with party members outside it can be
// joined in one action: they walk in, roll Initiative and take their turns, by the SRD (a creature that arrives joins).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { moveOptions } from "../src/engine/world.js";

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

test("joinFight: a hero too far to get in stays out and is told so, in a note the screen can show", () => {
  const s = newGame(7);
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  const [a, b] = party(s);
  b.pos = { q: -13, r: 4, z: 0 };
  ok(apply(s, { type: "startEncounter", center: { q: 2, r: -1 } }, DM));
  assert.ok(!inOrder(s, b.id));
  const r = ok(apply(s, { type: "joinFight", who: [b.id] }, DM));
  assert.ok(!inOrder(s, b.id));
  assert.ok(r.events.some((e) => e.type === "note" && e.id === b.id && e.why === "joinFight"));
  assert.deepEqual(b.pos, { q: -13, r: 4, z: 0 }, "it did not move");
});

test("joinFight works from a hero standing apart, whatever the ground (the rogue's start is outside the arena)", () => {
  let fights = 0;
  for (const seed of [7919, 15838, 23757, 31676, 39595, 47514]) {
    const s = newGame(seed, { follow: true });
    ok(apply(s, { type: "follow", actor: "rogue", leader: null }, DM));
    for (let i = 0; i < 20 && !s.encounter; i++) apply(s, { type: "move", actor: "fighter", to: { q: 2, r: -1, z: 0 } }, DM);
    if (!s.encounter) continue;
    fights++;
    assert.ok(!inOrder(s, "rogue"));
    ok(apply(s, { type: "joinFight" }, DM));
    assert.ok(inOrder(s, "rogue"), `seed ${seed}`);
  }
  assert.ok(fights >= 4, `${fights} fights`);
});

// ---- review of #693: where they land, and who is refused ----
const grassy = (seed = 7) => {
  const s = newGame(seed);
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  for (const id of Object.keys(s.entities)) if (/^m\d+$/.test(id)) ok(apply(s, { type: "remove", actor: id }, DM));
  for (const [id, q, r] of [["wizard", 0, 0], ["fighter", -2, 0], ["cleric", -1, 1], ["rogue", -9, 3]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  return s;
};
const spawnAt = (s, monster, q, r) => { const e = s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id]; return e; };
const turnOf = (s, id) => { for (let i = 0; i < 40 && s.encounter.order[s.encounter.turn].id !== id; i++) ok(apply(s, { type: "endTurn", actor: s.encounter.order[s.encounter.turn].id }, DM)); };
const landing = (s) => { const c = structuredClone(s); ok(apply(c, { type: "joinFight", who: ["rogue"] }, DM)); return { ...c.entities.rogue.pos }; };

test("joinFight: nobody lands in a lasting zone at the nearest place", () => {
  const s = grassy();
  spawnAt(s, "goblin-warrior", 4, 0);
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, DM));
  const spot = landing(s);
  Object.assign(s.entities.wizard, { slots: { 1: 4, 2: 3, 3: 3 }, slotsMax: { 1: 4, 2: 3, 3: 3 } });
  s.entities.wizard.spells.push("moonbeam");
  turnOf(s, "wizard");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "moonbeam", hex: { q: spot.q, r: spot.r } }, DM));
  const fx = s.effects.find((x) => x.name === "Moonbeam");
  assert.ok(fx.zone.hexes.includes(`${spot.q},${spot.r}`), "the zone covers the place they would have taken");
  ok(apply(s, { type: "joinFight", who: ["rogue"] }, DM));
  assert.ok(inOrder(s, "rogue"));
  const p = s.entities.rogue.pos;
  assert.ok(!fx.zone.hexes.includes(`${p.q},${p.r}`), "it landed outside the zone");
});

test("joinFight: a hidden monster does not change where they land", () => {
  const plain = grassy(), withHidden = grassy();
  for (const s of [plain, withHidden]) spawnAt(s, "goblin-warrior", 4, 0);
  const lurker = spawnAt(withHidden, "goblin-warrior", -6, 7);
  for (const s of [plain, withHidden]) ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, DM));
  lurker.hidden = true;
  assert.deepEqual(landing(withHidden), landing(plain));
  lurker.hidden = false; lurker.hiding = true;
  assert.deepEqual(landing(withHidden), landing(plain), "hiding too");
});

test("joinFight: a hero who cannot act and is named gets the note and stays put", () => {
  const s = grassy();
  spawnAt(s, "goblin-warrior", 4, 0);
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, DM));
  s.entities.rogue.hp = 0;
  const unnamed = apply(s, { type: "joinFight" }, DM);
  assert.equal(unnamed.ok, false, "the fallen are left be when nobody is named");
  const r = ok(apply(s, { type: "joinFight", who: ["rogue"] }, DM));
  assert.ok(r.events.some((e) => e.type === "note" && e.id === "rogue" && e.why === "joinFight"));
  assert.ok(!inOrder(s, "rogue"));
  assert.deepEqual(s.entities.rogue.pos, { q: -9, r: 3, z: 0 });
});

test("joinFight: a mounted hero comes with the mount, both in the fight", () => {
  const s = grassy();
  spawnAt(s, "goblin-warrior", 4, 0);
  const horse = spawnAt(s, "warhorse", -9, 4);
  horse.side = "party";
  ok(apply(s, { type: "mount", actor: "rogue", mount: horse.id }, DM));
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, DM));
  assert.ok(!inOrder(s, "rogue") && !inOrder(s, horse.id));
  const r = ok(apply(s, { type: "joinFight" }, DM));
  assert.ok(inOrder(s, horse.id) && inOrder(s, "rogue"));
  const moves = r.events.filter((e) => e.type === "moved");
  assert.deepEqual(moves.find((e) => e.id === "rogue").path, moves.find((e) => e.id === horse.id).path, "one route for the pair");
  assert.deepEqual(s.entities.rogue.pos, horse.pos);
});

test("joinFight: a hero whose own walk is over 60 ft stays out, though an exploring walk would reach and its leader stands at the place", () => {
  const s = grassy();
  for (const [id, q, r] of [["fighter", -12, 1], ["wizard", -11, 0], ["cleric", -11, 1], ["rogue", 13, -5]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  spawnAt(s, "goblin-warrior", -8, 1);
  ok(apply(s, { type: "startEncounter", center: { q: -12, r: 1 }, radius: 6 }, DM));
  assert.ok(!inOrder(s, "rogue"));
  const reach = [...moveOptions(s, s.entities.rogue)].filter(([, v]) => s.encounter.arena[`${v.h.q},${v.h.r}`] && v.canStop);
  assert.ok(reach.length && Math.min(...reach.map(([, v]) => v.cost)) > 60, "an exploring walk reaches the arena, over 60 ft of it");
  const r = ok(apply(s, { type: "joinFight", who: ["rogue"] }, DM));
  assert.ok(!inOrder(s, "rogue"));
  assert.ok(r.events.some((e) => e.type === "note" && e.id === "rogue" && e.why === "joinFight"));
});
