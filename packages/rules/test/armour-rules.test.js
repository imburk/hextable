// Armour and saves the engine used to leave out (issue #434): Stealth Disadvantage from armour.
// SRD 5.2.1, Equipment, "Armor": "Stealth. If the table shows 'Disadvantage' in the Stealth column for an armor
// type, the wearer has Disadvantage on Dexterity (Stealth) checks."
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, makeEntity, passive } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { CONTENT } from "../src/content/index.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
const A = { str: 16, dex: 14, con: 14, int: 8, wis: 12, cha: 10 };
const fighter = (more = {}) => ({ name: "Ka", class: "fighter", level: 1, abilities: A, skills: ["athletics", "perception"], choices: { "fighting-style": "defense" }, armour: "chain-mail", weapons: ["longsword"], ...more });

function table(sheet, seed = 11) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  s.entities.hero.sheet = structuredClone(sheet);
  return s;
}
const stealth = (s) => ok(apply(s, { type: "check", actor: "hero", skill: "stealth" }, DM)).events.find((e) => e.type === "check");

// Undo, redo and a replay from the start give the same state.
function exact(s, acts) {
  const start = json(s), h = createHistory(), states = [start];
  for (const a of acts) { const b = mark(s), r = ok(apply(s, a, DM)); h.record(b, s, describeStep(a, r.events, b, s)); states.push(json(s)); }
  const end = json(s);
  for (let n = acts.length - 1; n >= 0; n--) { h.undo(s); assert.equal(json(s), states[n], `undo ${n}`); }
  for (let n = 0; n < acts.length; n++) h.redo(s);
  assert.equal(json(s), end, "redo");
  const again = JSON.parse(start);
  for (const a of acts) ok(apply(again, a, DM));
  assert.equal(json(again), end, "replay");
}

test("the armour table's Stealth column is in the data: exactly the SRD's armour has it", () => {
  const dis = Object.values(CONTENT.armour).filter((a) => a.stealth === "disadvantage").map((a) => a.id).sort();
  assert.deepEqual(dis, ["chain-mail", "half-plate-armor", "padded-armor", "plate-armor", "ring-mail", "scale-mail", "splint-armor"]);
  for (const id of ["leather-armor", "studded-leather-armor", "hide-armor", "chain-shirt", "breastplate", "shield"]) assert.equal(CONTENT.armour[id].stealth, undefined, id);
});

test("Stealth Disadvantage: a check in armour with it rolls two dice and takes the lower; armour without it rolls one", () => {
  const worn = table(fighter()), bare = table(fighter({ armour: "leather-armor" }));
  const a = stealth(worn), b = stealth(bare);
  assert.equal(a.mode, "dis", "chain mail");
  assert.deepEqual(a.why, ["Chain Mail"]);
  assert.equal(a.roll, Math.min(...a.rolls));
  assert.equal(b.mode, undefined, "leather armour");
  // Other skills are not touched.
  assert.equal(ok(apply(worn, { type: "check", actor: "hero", skill: "athletics" }, DM)).events[0].mode, undefined);
  // Passive Stealth is 5 lower with Disadvantage.
  assert.equal(passive(bare, bare.entities.hero, "stealth") - passive(worn, worn.entities.hero, "stealth"), 5);
});

test("Stealth Disadvantage reaches the Hide action", () => {
  const s = table(fighter({ armour: "plate-armor", abilities: { ...A, str: 17 } }));
  const h = ok(apply(s, { type: "hide", actor: "hero" }, DM)).events.find((e) => e.type === "check");
  assert.equal(h.mode, "dis");
  assert.equal(h.skill, "stealth");
});

test("a magic suit made from Plate Armor keeps the base armour's Stealth Disadvantage; Elven Chain over Chain Shirt has none", () => {
  const magic = (base) => fighter({ armour: undefined, items: [{ id: "i1", item: "armor-plus-1", base, equipped: true }] });
  assert.equal(stealth(table(magic("plate-armor"))).mode, "dis");
  assert.equal(stealth(table(magic("leather-armor"))).mode, undefined);
});

test("a sheet with no armour on it, only a Shield, has no Disadvantage", () => {
  const s = table(fighter({ armour: undefined, shield: true }));
  assert.equal(stealth(s).mode, undefined);
});

test("a starter with no sheet lists Chain Mail in its gear: one die is rolled and the DM is told, in words, to apply it if worn", () => {
  const s = newGame(3);
  const r = ok(apply(s, { type: "check", actor: "fighter", skill: "stealth" }, DM));
  assert.equal(r.events.find((e) => e.type === "check").mode, undefined);
  const note = r.events.find((e) => e.type === "manual");
  assert.equal(note.partial, true);
  assert.match(note.text, /Chain Mail.*Disadvantage on Dexterity \(Stealth\).*cannot tell worn from carried/);
  assert.equal(ok(apply(s, { type: "check", actor: "rogue", skill: "stealth" }, DM)).events.some((e) => e.type === "manual"), false, "Leather Armor has no Disadvantage");
  assert.equal(ok(apply(s, { type: "check", actor: "fighter", skill: "athletics" }, DM)).events.some((e) => e.type === "manual"), false);
});

test("Stealth Disadvantage: undo, redo and replay are exact", () => {
  exact(table(fighter()), [{ type: "check", actor: "hero", skill: "stealth" }, { type: "hide", actor: "hero" }, { type: "check", actor: "hero", skill: "stealth", dc: 12 }]);
});

// ---------- item 2: the Strength column ----------
// SRD "Armor": "Strength. If the table shows a Strength score in the Strength column for an armor type, that armor
// reduces the wearer's speed by 10 feet unless the wearer has a Strength score equal to or higher than the listed score."
// The engine already did this (derive.js); this pins it, and the data, through setSheet.
test("the Strength column: Chain Mail 13, Splint 15, Plate 15; speed is 10 feet less below it", () => {
  assert.deepEqual(Object.values(CONTENT.armour).filter((a) => a.strength).map((a) => [a.id, a.strength]).sort(), [["chain-mail", 13], ["plate-armor", 15], ["splint-armor", 15]]);
  const speed = (armour, str) => {
    const s = newGame(2);
    const id = ok(apply(s, { type: "setSheet", sheet: fighter({ armour, abilities: { ...A, str } }) }, DM)).events.find((e) => e.type === "spawned").id;
    return s.entities[id].speed;
  };
  assert.equal(speed("chain-mail", 12), 20); assert.equal(speed("chain-mail", 13), 30);
  assert.equal(speed("plate-armor", 14), 20); assert.equal(speed("plate-armor", 15), 30);
  assert.equal(speed("ring-mail", 8), 30, "Ring Mail has no Strength score");
  assert.equal(speed("leather-armor", 8), 30);
});
