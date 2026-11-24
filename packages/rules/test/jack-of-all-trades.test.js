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
import { newMap } from "../src/map.js";
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

// #736 item 5. An escape left to the engine takes the skill with the better chance (`escapeSkill`, engine/features.js), and the half
// Proficiency Bonus counts in that: Strength 16 and no Athletics is +3 and 2 more, 5; Dexterity 10 with Acrobatics is +4.
test("escaping a grapple: the engine's choice of skill counts the half Proficiency Bonus", () => {
  const abilities = { ...A, str: 16, dex: 10 }, skills = ["acrobatics", "persuasion", "insight"];
  const held = (sheet) => {
    const s = table(sheet);
    s.entities.hero.cond.grappled = { source: "holder", holds: [{ by: "holder", with: "hand", escape: 12, range: 5 }] };
    return ok(apply(s, { type: "escape", actor: "hero" }, DM)).events.find((e) => e.type === "check");
  };
  const b = held(bard(9, { abilities, skills }));
  assert.equal(b.skill, "athletics", "Athletics at 3 + 2 beats Acrobatics at 0 + 4");
  assert.equal(b.bonus, 5);
  // The same scores and skills without the feature: Acrobatics at +4 beats Athletics at +3.
  const f = held({ name: "Wyn", class: "wizard", level: 9, subclass: "evoker", abilities, skills: ["acrobatics", "arcana"], spells: ["fire-bolt"] });
  assert.equal(f.skill, "acrobatics");
  assert.equal(f.bonus, 4);
  // A tie goes to Athletics, as before: Strength 14 is 2 + 2 against Acrobatics 0 + 4.
  const tie = held(bard(9, { abilities: { ...abilities, str: 14 }, skills }));
  assert.equal(tie.skill, "athletics");
  assert.equal(tie.bonus, 4);
});

// #736 item 6. A lock is picked with Dexterity (Sleight of Hand) and Thieves' Tools (the object's `use`, through `apply`). SRD 5.2.1, Tool
// Proficiency: with the tool the Proficiency Bonus is added; with the skill as well, Advantage too. Jack of All Trades adds its half only
// where neither proficiency is used.
test("picking a lock through apply: the tool, the skill, both, and neither", () => {
  const pick = (more) => {
    const s = table(bard(9, { gear: ["Thieves' Tools"], ...more }));
    const tiles = {};
    for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) tiles[`${q},${r}`] = { t: "stone" };
    ok(apply(s, { type: "loadMap", map: newMap({ id: "room", name: "A room", starts: [{ q: 0, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }],
      objects: [{ id: "box", def: "chest", level: "ground", at: { q: 1, r: 0 }, state: "locked" }] }) }, DM));
    s.entities.hero.pos = { q: 0, r: 0, z: 0 };
    return ok(apply(s, { type: "use", actor: "hero", object: "box", verb: "pick" }, DM)).events.find((e) => e.type === "check");
  };
  const neither = pick({});
  assert.equal(neither.bonus, 2 + 2, "Dexterity 14, and half of +4: no proficiency is used");
  assert.equal(neither.mode, undefined);
  const tool = pick({ tools: ["thieves-tools"] });
  assert.equal(tool.bonus, 2 + 4, "the tool's Proficiency Bonus, and no half on top");
  assert.equal(tool.mode, undefined, "no Advantage without the skill");
  const skill = pick({ skills: ["performance", "persuasion", "sleight-of-hand"] });
  assert.equal(skill.bonus, 2 + 4);
  assert.equal(skill.mode, undefined, "no Advantage without the tool proficiency");
  const both = pick({ tools: ["thieves-tools"], skills: ["performance", "persuasion", "sleight-of-hand"] });
  assert.equal(both.bonus, 2 + 4, "the Proficiency Bonus once");
  assert.equal(both.mode, "adv");
  assert.deepEqual(both.why, ["tool and skill"]);
  assert.deepEqual([both.tool, both.skill], ["thieves-tools", "sleight-of-hand"]);
});
