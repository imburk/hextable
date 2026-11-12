// Quick entry: a character typed in by hand (task R5 of docs/specs/rules-expansion.md, engine side).
import assert from "node:assert/strict";
import { test } from "node:test";
import { PREGENS, SPELLS } from "../src/content/index.js";
import { lintRecord } from "../src/content/schema.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const ranger = () => ({
  name: "Shale", cls: "Ranger", level: 5, ac: 16, hp: 44, speed: 30, prof: 3, size: "medium",
  abil: { str: 12, dex: 18, con: 14, int: 10, wis: 16, cha: 8 }, saveProf: ["str", "dex"],
  skills: ["perception", "stealth", "survival"], expertise: ["survival"], tools: ["thieves-tools"],
  attacks: [{ id: "longbow", name: "Longbow", type: "ranged", bonus: 9, damage: "1d8+4", dtype: "piercing", range: [150, 600] },
    { id: "shortsword", name: "Shortsword", type: "melee", bonus: 7, damage: "1d6+4", dtype: "piercing", reach: 5, finesse: true }],
  castAbil: "wis", spells: ["cure-wounds"], slots: { 1: 4, 2: 2 }, gear: ["Longbow", "Studded Leather"], look: { color: "#3a7d44" },
});

test("the pregenerated characters are valid records, and a record says what is wrong with it", () => {
  for (const [id, p] of Object.entries(PREGENS)) assert.deepEqual(lintRecord(p, { spells: SPELLS }), [], id);
  assert.deepEqual(lintRecord(ranger(), { spells: SPELLS }), []);
  const bad = (change) => { const r = ranger(); change(r); return lintRecord(r, { spells: SPELLS }).join(" | "); };
  assert.match(bad((r) => { r.owner = "pat"; }), /"owner" is not something a character record has/);
  assert.match(bad((r) => { r.hidden = true; }), /"hidden" is not/);
  assert.match(bad((r) => { r.side = "foe"; }), /"side" is not/);
  assert.match(bad((r) => { r.hp = 0; }), /Hit Points/);
  assert.match(bad((r) => { delete r.abil.cha; }), /six ability scores/);
  assert.match(bad((r) => { r.attacks[0].damage = "lots"; }), /not dice/);
  assert.match(bad((r) => { r.attacks[1].id = "longbow"; }), /used once/);
  assert.match(bad((r) => { r.attacks[0].onHit = "prone"; }), /"onHit" is not something an attack has/);
  assert.match(bad((r) => { r.spells = ["wish-for-more-wishes"]; }), /not in the game/);
  assert.match(bad((r) => { r.expertise = ["arcana"]; }), /Expertise needs proficiency/);
  assert.match(bad((r) => { r.features = { godMode: true }; }), /features can be/);
  assert.match(bad((r) => { r.speed = 33; }), /multiple of 5/);
  assert.match(bad((r) => { r.name = () => "x"; }), /data only/);
  assert.deepEqual(lintRecord("Shale"), ["A character is a record."]);
});

test("the DM adds a typed-in character, who joins the party and plays like any other", () => {
  const s = newGame(21);
  assert.equal(apply(s, { type: "addCharacter", record: ranger() }, PAT).error, "Only the DM can add a character.");
  const res = ok(apply(s, { type: "addCharacter", record: ranger() }, DM)), id = res.events[0].id, e = s.entities[id];
  assert.equal(e.kind, "pc"); assert.equal(e.side, "party"); assert.equal(e.owner, null);
  assert.equal(e.maxHp, 44); assert.deepEqual(e.slotsMax, { 1: 4, 2: 2 });
  assert.ok(Object.values(s.entities).some((o) => o.id !== id && o.side === "party" && Math.abs(o.pos.q - e.pos.q) + Math.abs(o.pos.r - e.pos.r) <= 2));
  assert.equal(new Set(Object.values(s.entities).map((o) => `${o.pos.q},${o.pos.r}`)).size, Object.keys(s.entities).length);
  assert.equal(view(s, PAT).entities[id].hp, 44);                       // one of the party: players see the sheet
  ok(apply(s, { type: "claim", entity: id, user: "pat", userName: "Pat" }, PAT));
  ok(apply(s, { type: "check", actor: id, skill: "survival" }, PAT));
  // In a fight it takes its turn, shoots and casts.
  ok(apply(s, { type: "startEncounter", center: s.entities.m1.pos, radius: 30 }, DM));
  while (current(s) !== id) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  const shot = ok(apply(s, { type: "attack", actor: id, target: "m1", attack: "longbow" }, PAT));
  assert.equal(shot.events[0].total, shot.events[0].nat + 9);
});

test("a bad record adds nothing, and a sheet can be corrected without losing who plays it or how hurt it is", () => {
  const s = newGame(21), before = JSON.stringify(s), broken = ranger();
  broken.ac = "plate";
  assert.match(apply(s, { type: "addCharacter", record: broken }, DM).error, /can't be added. Its Armor Class/);
  assert.equal(JSON.stringify(s), before);
  const id = ok(apply(s, { type: "addCharacter", record: ranger() }, DM)).events[0].id;
  ok(apply(s, { type: "claim", entity: id, user: "pat", userName: "Pat" }, PAT));
  ok(apply(s, { type: "setHp", actor: id, hp: 30 }, DM));                // 14 down
  s.entities[id].slots[1] = 1;                                           // three first-level slots spent
  const where = { ...s.entities[id].pos }, better = { ...ranger(), level: 6, hp: 52, ac: 17, slots: { 1: 4, 2: 3 } };
  const res = ok(apply(s, { type: "editCharacter", actor: id, record: better }, DM)), e = s.entities[id];
  assert.deepEqual([e.level, e.ac, e.maxHp, e.hp, e.owner, e.ownerName], [6, 17, 52, 38, "pat", "Pat"]);
  assert.deepEqual(e.slots, { 1: 1, 2: 3 });
  assert.deepEqual(e.pos, where);
  assert.deepEqual(viewEvents(res.events, s, PAT), [{ type: "edited", id }]);
  assert.equal(apply(s, { type: "editCharacter", actor: "m1", record: better }, DM).error.includes("is not a character"), true);
  assert.equal(apply(s, { type: "editCharacter", actor: id, record: better }, PAT).error, "Only the DM can change a character.");
});

test("the DM can take a creature out of the game, but not in the middle of its fight", () => {
  const s = newGame(21);
  const id = ok(apply(s, { type: "addCharacter", record: ranger() }, DM)).events[0].id;
  assert.equal(apply(s, { type: "remove", actor: id }, PAT).error, "Only the DM can remove a creature.");
  ok(apply(s, { type: "remove", actor: id }, DM));
  assert.equal(s.entities[id], undefined);
  ok(apply(s, { type: "startEncounter", center: s.entities.m1.pos, radius: 30 }, DM));
  assert.match(apply(s, { type: "remove", actor: "m1" }, DM).error, /in the fight/);
});
