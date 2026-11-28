// Magic Resistance (#914): `{ on: "save", op: "advantage", magic: true }` is Advantage on a saving throw against a spell or another magical effect, and on nothing else
// (docs/specs/rules-expansion.md, "Build notes: Magic Resistance"). The save's source is said by whoever rolls it (engine/rolls.js `savingThrow`, last parameter).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current } from "../src/engine.js";
import { CONTENT } from "../src/content/index.js";
import { lintBaked } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const MR = { id: "magic-resistance", name: "Magic Resistance", modifiers: [{ on: "save", op: "advantage", magic: true }] };
const saves = (r) => r.events.filter((e) => e.type === "save" || e.type === "concentration");
const notes = (r) => r.events.filter((e) => e.type === "manual" && e.unsure !== undefined);
const adv = (e) => e.mode === "adv" && e.why.includes("Magic Resistance");
// A game in a fight with the creature `id` holding the trait, and the turn passed to `who`.
function fight(over = {}, who = "cleric", holder = "fighter") {
  const s = newGame(3);
  s.settings.autoEngage = false;
  s.entities[holder].feats = [...(s.entities[holder].feats ?? []), MR];
  Object.assign(s.entities.wizard, { slots: { 1: 4, 2: 3, 3: 3 }, slotsMax: { 1: 4, 2: 3, 3: 3 } });
  s.entities.wizard.spells.push("moonbeam");
  Object.assign(s, over);
  ok(apply(s, { type: "startEncounter", center: { q: -6, r: 2 }, radius: 60 }, DM));
  for (let i = 0; i < 12 && current(s) !== who; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.equal(current(s), who);
  return s;
}

test("a spell's save gets the Advantage: a cantrip's save", () => {
  const s = fight();
  const r = ok(apply(s, { type: "cast", actor: "cleric", spell: "sacred-flame", target: "fighter" }, DM));
  const [sv] = saves(r);
  assert.ok(sv && adv(sv), JSON.stringify(sv));
  assert.deepEqual(notes(r), []);
});

test("a creature without the trait gets none from the same spell", () => {
  const s = fight({}, "cleric", "rogue");
  const r = ok(apply(s, { type: "cast", actor: "cleric", spell: "sacred-flame", target: "fighter" }, DM));
  assert.ok(saves(r).length === 1 && saves(r)[0].mode === undefined);
});

test("a zone's save gets it too, when the creature starts its turn in the zone", () => {
  const s = fight({}, "wizard");
  const at = s.entities.fighter.pos;
  ok(apply(s, { type: "cast", actor: "wizard", spell: "moonbeam", hex: at }, DM));
  let seen = [];
  for (let i = 0; i < 12 && !seen.length; i++) { const r = ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); seen = saves(r).filter((e) => e.id === "fighter"); }
  assert.ok(seen.length && seen.every(adv), "Moonbeam's save at the creature's turn");
});

test("the DM's called save: magic true gets it, false does not, and one not said gets none and a note, once", () => {
  const s = fight();
  const call = (over) => ok(apply(s, { type: "save", who: "fighter", ability: "dex", dc: 40, ...over }, DM));
  assert.ok(adv(saves(call({ magic: true }))[0]));
  const no = call({ magic: false });
  assert.equal(saves(no)[0].mode, undefined);
  assert.deepEqual(notes(no), []);
  const unsaid = call({});
  assert.equal(saves(unsaid)[0].mode, undefined);
  assert.equal(notes(unsaid).length, 1);
  assert.equal(notes(unsaid)[0].partial, true, "a note for the DM alone");
  assert.match(notes(unsaid)[0].text, /Magic Resistance/);
  // Two creatures, one without the trait: a note only for the one that has it; and none when nobody does.
  const two = call({ who: ["fighter", "rogue"] });
  assert.equal(notes(two).length, 1);
  const none = ok(apply(s, { type: "save", who: "rogue", ability: "dex", dc: 40 }, DM));
  assert.deepEqual(notes(none), []);
  assert.throws(() => { throw new Error(apply(s, { type: "save", who: "fighter", ability: "dex", dc: 5, magic: "yes" }, DM).error); }, /true or false/);
});

test("a breath weapon is not magic (a monster's action is not told apart from one that is), so no Advantage and a note", () => {
  const s = newGame(3);
  s.settings.autoEngage = false;
  const id = ok(apply(s, { type: "spawn", monster: "red-dragon-wyrmling", at: { q: -4, r: 2 } }, DM)).events.find((e) => e.type === "spawned").id;
  s.entities.fighter.feats = [MR];
  Object.assign(s.entities[id], { hp: 500, maxHp: 500 });
  ok(apply(s, { type: "startEncounter", center: { q: -6, r: 2 }, radius: 8 }, DM));
  for (let i = 0; i < 12 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  const breath = s.entities[id].actions.find((a) => /breath/.test(a.id));
  const r = ok(apply(s, { type: "act", actor: id, action: breath.id, hex: s.entities.fighter.pos, target: "fighter" }, DM));
  const mine = saves(r).filter((e) => e.id === "fighter");
  assert.ok(mine.length, "the fighter saved against the breath");
  assert.ok(mine.every((e) => e.mode === undefined), "no Advantage");
  assert.equal(notes(r).length, 1, "told once");
});

test("Concentration is not covered: it comes from damage", () => {
  const s = fight({}, "cleric", "cleric");
  ok(apply(s, { type: "cast", actor: "cleric", spell: "shield-of-faith", target: "cleric" }, DM));
  const r = ok(apply(s, { type: "harm", actor: "cleric", amount: 8, dtype: "fire" }, DM));
  const c = r.events.filter((e) => e.type === "concentration");
  assert.equal(c.length, 1);
  assert.equal(c[0].mode, undefined);
  assert.deepEqual(notes(r), []);
});

test("the 34 monsters with Magic Resistance carry the modifier, and the text no longer says the DM applies it", () => {
  const traits = Object.values(CONTENT.monsters).flatMap((m) => m.traits.filter((t) => t.id === "magic-resistance").map((t) => [m.id, t]));
  assert.equal(traits.length, 34);
  for (const [id, t] of traits) {
    assert.deepEqual(t.modifiers, [{ on: "save", op: "advantage", magic: true }], id);
    assert.match(t.text, /^(The \w+ has )?Advantage on saving throws against spells and other magical effects\.$/, id);
  }
  // The Rakshasa's Greater Magic Resistance is another trait (it succeeds outright), and stays the DM's.
  const g = CONTENT.monsters.rakshasa.traits.find((t) => t.id === "greater-magic-resistance");
  assert.deepEqual(g.modifiers, []);
});

test("the linter takes the form and nothing near it; the reader says it in words", () => {
  const say = (m) => lintBaked({ ...structuredClone(CONTENT.monsters.archmage), traits: [{ id: "x", name: "X", modifiers: [m], text: "t" }] }).filter((x) => /magic|modifier/i.test(x));
  assert.deepEqual(say({ on: "save", op: "advantage", magic: true }), []);
  assert.deepEqual(say({ on: "save.wis", op: "advantage", magic: true }), []);
  assert.ok(say({ on: "save", op: "disadvantage", magic: true }).length);
  assert.ok(say({ on: "save", op: "advantage", magic: false }).length);
  assert.ok(say({ on: "attack.roll", op: "advantage", magic: true }).length);
  assert.ok(say({ on: "save", op: "advantage", magic: true, scope: { ability: "wis" } }).length);
  const text = JSON.stringify(readEntry("monster", CONTENT.monsters.archmage));
  assert.match(text, /Advantage on saving throws against spells and other magical effects/);
});
