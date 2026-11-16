// Every built character can make an Unarmed Strike (issue #440, DEBT T60 (10)).
// SRD 5.2 "Unarmed Strike", Damage: "You make an attack roll against the target. Your bonus to the roll equals your Strength
// modifier plus your Proficiency Bonus. On a hit, the target takes Bludgeoning damage equal to 1 plus your Strength modifier."
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { aiStep } from "../src/ai.js";
import { opportunityAttack } from "../src/reactions.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const fighter = (abilities, weapons, more = {}) => ({ name: "Fi", class: "fighter", level: 5, subclass: "champion", abilities,
  skills: ["athletics", "perception"], choices: { "fighting-style": "defense" }, weapons, ...more });
const STR16 = { str: 16, dex: 14, con: 14, int: 10, wis: 8, cha: 8 };
const STR8 = { str: 8, dex: 16, con: 14, int: 10, wis: 8, cha: 8 };
const punch = (sh) => derive(sh).record.attacks.filter((a) => a.id === "unarmed-strike");

function field(sh, gap = 1) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sh).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  const foe = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 } }, DM)).events[0].id;
  Object.assign(s.entities[foe], { hp: 500, maxHp: 500, ac: 1 });
  s.foe = foe;
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  for (let i = 0; i < 6 && current(s) !== "hero"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  s.entities[foe].pos = { q: gap, r: 0, z: 0 };
  return s;
}

test("a built character with no weapon listed has one Unarmed Strike: Strength modifier plus Proficiency Bonus, 1 plus Strength", () => {
  const a = punch(fighter(STR16, []));
  assert.deepEqual(a, [{ id: "unarmed-strike", name: "Unarmed Strike", type: "melee", bonus: 6, damage: "+4", dtype: "bludgeoning", reach: 5, abil: "str" }]);
  const w = punch(fighter(STR8, ["rapier"]));                      // Strength 8 (-1): +2 to hit, 1 - 1 = 0 damage, Dexterity unused
  assert.equal(w[0].bonus, 2);
  assert.equal(w[0].damage, "+0");
  assert.equal(w[0].abil, "str");
});

test("it is last, there is one, and a sheet that lists it, or a Monk, is built as before", () => {
  const ids = derive(fighter(STR16, ["longsword", "javelin"])).record.attacks.map((a) => a.id);
  assert.equal(ids.at(-1), "unarmed-strike");
  assert.equal(ids.filter((i) => i === "unarmed-strike").length, 1);
  assert.equal(punch(fighter(STR16, ["longsword", "unarmed-strike"])).length, 1);
  const monk = derive({ name: "Mo", class: "monk", level: 5, subclass: "open-hand", abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 14, cha: 8 }, skills: ["acrobatics", "insight"], weapons: [] }).record.attacks;
  assert.deepEqual(monk.find((a) => a.id === "unarmed-strike"), { id: "unarmed-strike", name: "Unarmed Strike", type: "melee", bonus: 6, damage: "1d8+3", dtype: "bludgeoning", reach: 5, abil: "dex" });
  assert.equal(monk.filter((a) => a.id.startsWith("unarmed")).length, 2, "the strike and the Bonus Action one, nothing more");
});

test("a Shield and a Greatsword fighter punches in a fight; the Greatsword is still refused", () => {
  const s = field(fighter(STR16, ["greatsword"], { shield: true }));
  const r = ok(apply(s, { type: "attack", actor: "hero", target: s.foe, attack: "unarmed-strike" }, DM));
  const roll = r.events.find((e) => e.type === "attack"), dmg = r.events.find((e) => e.type === "damage");
  assert.equal(roll.bonus, 6);
  assert.equal(roll.total, roll.nat + 6);
  assert.equal(dmg.dtype, "bludgeoning");
  assert.equal(dmg.amount, 4);
  const before = JSON.stringify(s), bad = apply(s, { type: "attack", actor: "hero", target: s.foe, attack: "greatsword" }, DM);
  assert.equal(bad.ok, false);
  assert.equal(JSON.stringify(s), before, "nothing changed");
});

test("a lone Loading weapon: the Extra Attack goes on the punch", () => {
  const s = field(fighter(STR16, ["light-crossbow"]), 2);
  ok(apply(s, { type: "attack", actor: "hero", target: s.foe, attack: "light-crossbow" }, DM));
  s.entities[s.foe].pos = { q: 1, r: 0, z: 0 };
  ok(apply(s, { type: "attack", actor: "hero", target: s.foe, attack: "unarmed-strike" }, DM));
});

test("undo, redo and replay give the same bytes", () => {
  const s = field(fighter(STR16, ["greatsword"], { shield: true }));
  const acts = [{ type: "attack", actor: "hero", target: s.foe, attack: "unarmed-strike" }, { type: "attack", actor: "hero", target: s.foe, attack: "unarmed-strike" }];
  const h = createHistory(), start = JSON.stringify(s), copy = structuredClone(s), out = [];
  for (const a of acts) { const b = mark(s), r = ok(apply(s, a, DM)); h.record(b, s, describeStep(a, r.events, b, s)); out.push(r.events); }
  const end = JSON.stringify(s);
  for (let i = 0; i < acts.length; i++) assert.ok(h.undo(s));
  assert.equal(JSON.stringify(s), start);
  for (let i = 0; i < acts.length; i++) assert.ok(h.redo(s));
  assert.equal(JSON.stringify(s), end);
  assert.deepEqual(acts.map((a) => ok(apply(copy, a, DM)).events), out);
  assert.equal(JSON.stringify(copy), end);
});

test("AI: with any allowed weapon attack it does what it did; with none it punches rather than Dodges", () => {
  // An archer 3 hexes off shoots (it does not walk in to punch).
  const t = field(fighter(STR16, ["longbow"]), 3);
  assert.equal(aiStep(t, "hero").attack, "longbow");
  // A sword fighter swings the sword.
  assert.equal(aiStep(field(fighter(STR16, ["longsword"])), "hero").attack, "longsword");
  // Shield and Greatsword only: the punch, not Dodge.
  assert.deepEqual(aiStep(field(fighter(STR16, ["greatsword"], { shield: true })), "hero").attack, "unarmed-strike");
  // No weapon at all and a foe beside it: the punch.
  assert.equal(aiStep(field(fighter(STR16, [])), "hero").attack, "unarmed-strike");
  // An Opportunity Attack with a Shield and a Greatsword is the punch.
  assert.equal(opportunityAttack(field(fighter(STR16, ["greatsword"], { shield: true })).entities.hero).id, "unarmed-strike");
});
