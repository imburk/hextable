// Jack of All Trades (Bard, level 2), issue #732. SRD 5.2.1: "You can add half your Proficiency Bonus (round down) to any ability check you
// make that uses a skill proficiency you lack and that doesn't otherwise use your Proficiency Bonus." It is a modifier on `check` with the
// amount `{ prof: 0.5 }` and the situation tag `check.unskilled` (docs/specs/rules-expansion.md, "Build notes: Jack of All Trades").
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT } from "../src/content/index.js";
const CLASSES = CONTENT.classes;
import { lintEntry } from "../src/content/schema.js";
import { derive } from "../src/derive.js";
import { apply, makeEntity } from "../src/engine.js";
import { passive } from "../src/engine/rolls.js";
import { modifiers } from "../src/modifiers.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const A = { str: 10, dex: 14, con: 12, int: 10, wis: 10, cha: 18 };
const bard = (level, more = {}) => ({ name: "Zed", class: "bard", level, ...(level >= 3 ? { subclass: "lore" } : {}), abilities: A, skills: ["performance", "persuasion", "insight"], weapons: ["dagger"], spells: ["vicious-mockery"], ...more });
function table(sheet) {
  const s = newGame(3), d = derive(sheet);
  s.entities.hero = makeEntity(d.record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  return s;
}
const check = (s, what) => ok(apply(s, { type: "check", actor: "hero", ...what }, DM)).events.find((e) => e.type === "check");

test("the entry: auto, a modifier on checks worth half the Proficiency Bonus where no proficiency is used", () => {
  const f = CLASSES.bard.features.find((x) => x.id === "jack-of-all-trades");
  assert.equal(f.tier, "auto");
  assert.deepEqual(f.grants.modifiers, [{ on: "check", op: "add", value: { prof: 0.5 }, when: ["check.unskilled"] }]);
  assert.deepEqual(lintEntry("classes", CLASSES.bard, { strict: false }), []);
});

test("half the Proficiency Bonus, rounded down, at each Proficiency Bonus", () => {
  // Level 1 has no feature; then +2 gives 1, +3 gives 1, +4 gives 2, +5 gives 2, +6 gives 3.
  for (const [level, add] of [[1, 0], [2, 1], [5, 1], [9, 2], [13, 2], [17, 3]]) {
    const s = table(bard(level));
    assert.equal(check(s, { skill: "athletics" }).bonus, 0 + add, `Athletics (Strength 10) at level ${level}`);
    assert.equal(check(s, { skill: "stealth" }).bonus, 2 + add, `Stealth (Dexterity 14) at level ${level}`);
  }
});

test("not on a check that uses the Proficiency Bonus already, nor on one that names no skill", () => {
  const s = table(bard(9));                                   // Proficiency Bonus +4
  assert.equal(check(s, { skill: "insight" }).bonus, 0 + 4, "a skill it is proficient in");
  assert.equal(check(s, { skill: "persuasion" }).bonus, 4 + 4);
  assert.equal(check(s, { ability: "str" }).bonus, 0, "a plain ability check uses no skill");
  // A check made with a tool it is proficient with uses the bonus already, whatever the skill (an object's `use` rolls these: `abilityCheck`
  // tells the modifiers whether a proficiency was used). Where the engine was not told, the tag is not known to hold and nothing is added.
  const hero = s.entities.hero, add = (sit) => modifiers(s, hero, "check", { target: hero, ...sit }, "").add;
  assert.equal(add({ skill: "sleight-of-hand", ability: "dex", tool: "thieves-tools", proficient: true }), 0);
  assert.equal(add({ ability: "dex", tool: "thieves-tools", proficient: false }), 0, "a tool it lacks and no skill");
  assert.equal(add({ skill: "sleight-of-hand", ability: "dex", proficient: false }), 2);
  assert.equal(add({ skill: "sleight-of-hand", ability: "dex" }), 0);
});

test("Expertise is not touched, and a creature without the feature gets nothing", () => {
  const s = table(bard(9, { expertise: ["performance", "persuasion"] }));
  assert.equal(check(s, { skill: "performance" }).bonus, 4 + 8);
  const f = table({ name: "Fen", class: "fighter", level: 9, subclass: "champion", abilities: A, skills: ["athletics", "perception"], weapons: ["longsword"] });
  assert.equal(check(f, { skill: "stealth" }).bonus, 2);
});

test("a passive score counts it", () => {
  const s = table(bard(9));
  assert.equal(passive(s, s.entities.hero, "perception"), 10 + 0 + 2, "Wisdom 10, no Perception");
  assert.equal(passive(s, s.entities.hero, "insight"), 10 + 0 + 4, "proficient: the whole bonus and no half");
});

test("a multiclassed bard uses the character's Proficiency Bonus", () => {
  const s = table({ name: "Pal", classes: [{ class: "paladin", level: 6, subclass: "devotion" }, { class: "bard", level: 8, subclass: "lore" }], abilities: { str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 16 },
    skills: ["athletics", "persuasion", "insight"], weapons: ["longsword"], spells: [] });
  assert.equal(s.entities.hero.prof, 5);
  assert.equal(check(s, { skill: "stealth" }).bonus, 0 + 2);
  assert.equal(check(s, { skill: "athletics" }).bonus, 3 + 5);
});

test("the linter takes half a Proficiency Bonus and no other fraction", () => {
  const c = structuredClone(CLASSES.bard), f = c.features.find((x) => x.id === "jack-of-all-trades");
  f.grants.modifiers[0].value = { prof: 0.25 };
  assert.ok(lintEntry("classes", c, { strict: false }).some((p) => /prof is how many times/.test(p)));
  f.grants.modifiers[0].value = { prof: 0.5 };
  f.grants.modifiers[0].when = ["check.unskilful"];
  assert.ok(lintEntry("classes", c, { strict: false }).some((p) => /unknown situation tag/.test(p)));
});
