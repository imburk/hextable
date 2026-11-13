// Characters with more than one class (#175), by the SRD 5.2.1 rules ("Multiclassing", in Character
// Creation, and each class's "As a Multiclass Character"): prerequisites, the proficiencies a later class
// gives, Hit Points and Hit Point Dice, Proficiency Bonus by total level, features by class level, Extra
// Attack not stacking, the Multiclass Spellcaster table, spells prepared per class, and levelling up into
// a new class.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { migrate, VERSION } from "../src/migrate.js";
import { newGame } from "../src/scenario.js";
import { CONTENT } from "../src/content/index.js";
import { lintPack, lintRecord } from "../src/content/schema.js";
import { PACKS, SPELLS } from "../src/content/index.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); };

const PB = { str: 16, dex: 10, con: 14, int: 8, wis: 10, cha: 16 };
const paladinSpells = ["bless", "cure-wounds", "shield-of-faith", "aid", "find-steed", "lesser-restoration"];
const bardSpells = ["vicious-mockery", "minor-illusion", "mage-hand", "healing-word", "faerie-fire", "hold-person", "invisibility", "hypnotic-pattern", "dimension-door", "polymorph", "heroism", "shatter", "fear", "greater-invisibility"];
// The owner's party has a Paladin 6 / Bard 8: this one is made up, with SRD subclasses.
const palBard = (more = {}) => ({ name: "Vor", classes: [
  { class: "paladin", level: 6, subclass: "devotion", spells: paladinSpells },
  { class: "bard", level: 8, subclass: "lore", spells: bardSpells }],
  abilities: PB, skills: ["athletics", "religion", "performance", "persuasion", "insight", "history"], expertise: ["performance", "persuasion"],
  choices: { "fighting-style": "defense" }, armour: "chain-mail", shield: true, weapons: ["longsword"], ...more });
const paladin6 = { name: "Vor", class: "paladin", level: 6, subclass: "devotion", abilities: PB, skills: ["athletics", "religion"],
  choices: { "fighting-style": "defense" }, armour: "chain-mail", shield: true, weapons: ["longsword"], spells: paladinSpells };

function field(sheet) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (!["m1"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  s.entities.hero.sheet = structuredClone(sheet);
  ok(apply(s, { type: "place", actor: "m1", to: { q: 3, r: 0 } }, DM));
  return s;
}

test("the Multiclass Spellcaster table and each class's multiclass rules are entered as the SRD gives them", () => {
  assert.deepEqual(lintPack(PACKS[0]), []);
  const T = CONTENT.multiclass.slots;
  assert.deepEqual([T[0], T[2], T[4], T[10], T[16], T[19]], [[2], [4, 2], [4, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]]);
  const mc = (id) => CONTENT.classes[id].multiclass;
  assert.deepEqual(mc("fighter").requires, { any: ["str", "dex"] }, "Strength or Dexterity");
  assert.deepEqual(mc("paladin").requires, { all: ["str", "cha"] }, "Strength and Charisma");
  assert.deepEqual([mc("paladin").caster, mc("ranger").caster, mc("bard").caster, mc("warlock").caster, mc("fighter").caster], ["half", "half", "full", "pact", null]);
  assert.deepEqual([mc("paladin").armour, mc("paladin").weapons], [["light", "medium", "shield"], ["martial"]]);
  assert.deepEqual([mc("rogue").skills, mc("bard").skills, mc("ranger").skills], [{ choose: 1, from: "class" }, { choose: 1, from: "any" }, { choose: 1, from: "class" }]);
});

test("Paladin 6 / Bard 8 built from class: Hit Points, Hit Dice, Proficiency Bonus, slots, features and resources", () => {
  assert.deepEqual(validate(palBard()), []);
  const { record: r, why } = derive(palBard());
  assert.deepEqual(lintRecord(r, { spells: SPELLS }), []);
  assert.equal(r.level, 14);
  assert.equal(r.cls, "Paladin 6 / Bard 8");
  assert.deepEqual(r.classes, [{ id: "paladin", level: 6, subclass: "devotion" }, { id: "bard", level: 8, subclass: "lore" }]);
  // Hit Points: Paladin 10 + 2 at level 1, then (6 + 2) for 5 more Paladin levels, then (5 + 2) for 8 Bard levels.
  assert.equal(r.hp, 12 + 5 * 8 + 8 * 7);
  assert.deepEqual(why.hp, ["10 at level 1", "6 for each of 5 Paladin levels after the first", "5 for each of 8 Bard levels", "Constitution +2 a level"]);
  assert.deepEqual(r.hitDice, { 8: 8, 10: 6 });
  assert.equal(r.prof, 5, "by total level 14");
  // Slots: all 8 Bard levels and half the 6 Paladin levels, 11, on the Multiclass Spellcaster table.
  assert.deepEqual(r.slots, { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 });
  assert.equal(r.castAbil, "cha"); assert.equal(r.spellAbil, undefined, "both cast with Charisma");
  assert.deepEqual(r.saveProf, ["wis", "cha"], "the first class's saving throws only");
  const f = (id) => r.feats.find((x) => x.id === id);
  assert.equal(f("lay-on-hands").uses.max, 30, "5 x Paladin level 6, not total level");
  assert.equal(f("channel-divinity").uses.max, 2);
  assert.deepEqual(f("bardic-inspiration").uses, { max: 3, recharge: "short" }, "Charisma modifier, back on a Short Rest from Bard level 5");
  assert.equal(f("bardic-inspiration").action.effects[0].modifier.value, "1d8", "the Bardic die at Bard level 8");
  assert.equal(f("aura-of-protection").aura.range, 10);
  assert.deepEqual(r.features, { extraAttack: 1 });
  // A feature both classes have keeps its own: the Bard's Spellcasting and Ability Score Improvements by the class's name.
  for (const id of ["spellcasting", "bard-spellcasting", "ability-score-improvement-4", "bard-ability-score-improvement-4", "bard-ability-score-improvement-8"]) assert.ok(f(id), id);
  assert.ok(!f("aura-of-devotion") && !f("ability-score-improvement-8") && !f("magical-secrets"), "nothing above each class's own level");
  assert.ok(f("magical-discoveries") && f("countercharm") && f("font-of-inspiration"));
  assert.equal(new Set(r.feats.map((x) => x.id)).size, r.feats.length);
  // Spells: each class's own, and those the Paladin subclass always has.
  for (const id of [...paladinSpells, ...bardSpells, "protection-from-evil-and-good", "shield-of-faith", "aid", "zone-of-truth"]) assert.ok(r.spells.includes(id), id);
});

test("spells prepared per class, by that class's level and its own spell level limit", () => {
  const sheet = (p, b) => palBard({ classes: [{ class: "paladin", level: 6, subclass: "devotion", spells: p }, { class: "bard", level: 8, subclass: "lore", spells: b }] });
  // A Paladin 6 prepares 6, up to level 2, though the slots go to level 6.
  assert.ok(validate(sheet([...paladinSpells, "command"], bardSpells)).some((p) => /level 6 Paladin prepares 6 spells; 7 chosen/.test(p)));
  assert.ok(validate(sheet(["revivify"], bardSpells)).some((p) => /Revivify is level 3; a level 6 Paladin casts spells up to level 2/.test(p)));
  assert.ok(validate(sheet(["vicious-mockery"], bardSpells)).some((p) => /level 6 Paladin knows 0 cantrips/.test(p)));
  // A Bard 8 prepares 12 up to level 4, with 3 cantrips; a Paladin spell is not on its list.
  assert.ok(validate(sheet(paladinSpells, [...bardSpells, "animate-objects"])).some((p) => /Animate Objects is level 5; a level 8 Bard/.test(p)));
  assert.ok(validate(sheet(paladinSpells, [...bardSpells.slice(3), "shield-of-faith"])).some((p) => /Shield of Faith is not on the Bard spell list/.test(p)));
  assert.ok(validate(sheet(paladinSpells, [...bardSpells, "prestidigitation"])).some((p) => /knows 3 cantrips; 4 chosen/.test(p)));
  assert.ok(validate(palBard({ spells: ["bless"] })).some((p) => /keeps "spells" in each of its classes/.test(p)));
});

test("each spell is cast with its own class's ability", () => {
  const sheet = { name: "Ilse", classes: [{ class: "wizard", level: 3, subclass: "evoker", spells: ["fire-bolt", "ray-of-frost", "mage-hand", "magic-missile"] }, { class: "cleric", level: 2, spells: ["sacred-flame", "guidance", "light", "bless"] }],
    abilities: { str: 8, dex: 14, con: 12, int: 16, wis: 14, cha: 10 }, skills: ["arcana", "history"], choices: { "divine-order": "thaumaturge" } };
  assert.deepEqual(validate(sheet), []);
  const r = derive(sheet).record;
  assert.equal(r.castAbil, "int");
  assert.deepEqual(r.spellAbil, { "sacred-flame": "wis", guidance: "wis", light: "wis", bless: "wis" });
  assert.deepEqual(r.slots, { 1: 4, 2: 3, 3: 2 }, "caster level 5");
  const s = field(sheet);
  s.entities.m1.hp = s.entities.m1.maxHp = 300;
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  for (let i = 0; i < 10 && current(s) !== "hero"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  const save = ok(apply(s, { type: "cast", actor: "hero", spell: "sacred-flame", target: "m1" }, DM)).events.find((e) => e.type === "save");
  assert.equal(save.dc, 8 + 3 + 2, "Proficiency +3 (level 5) and Wisdom +2, not Intelligence +3");
  s.encounter.budget.action = 1;
  const hit = ok(apply(s, { type: "cast", actor: "hero", spell: "fire-bolt", target: "m1" }, DM)).events.find((e) => e.type === "attack");
  assert.equal(hit.bonus, 3 + 3, "Intelligence +3 for the Wizard's cantrip");
});

test("a later class gives only its multiclass training; Extra Attack does not stack; one Spellcasting class keeps its own slots", () => {
  const A = { str: 15, dex: 14, con: 14, int: 15, wis: 10, cha: 14 };
  const wf = { name: "Kel", classes: [{ class: "wizard", level: 1, spells: ["fire-bolt", "mage-hand", "light", "magic-missile"] }, { class: "fighter", level: 1 }], abilities: A, skills: ["arcana", "history"], choices: { "fighting-style": "defense" }, weapons: ["longsword"] };
  assert.deepEqual(validate(wf), []);
  assert.deepEqual(validate({ ...wf, armour: "chain-shirt", shield: true }), []);
  assert.ok(validate({ ...wf, armour: "plate-armor" }).some((p) => /no training with heavy armour/.test(p)), "a Fighter taken later gives no heavy armour");
  const r = derive(wf).record;
  assert.deepEqual(r.saveProf, ["int", "wis"]);
  assert.equal(r.attacks.find((a) => a.id === "longsword").bonus, 2 + 2, "martial weapons from the Fighter");
  assert.deepEqual(r.slots, { 1: 2 }, "only the Wizard casts: its own table at Wizard level 1");
  assert.equal(r.hp, 6 + 2 + 6 + 2, "Wizard 6 + 2 at level 1, Fighter 6 + 2 after");
  const fp = { name: "Bran", classes: [{ class: "fighter", level: 5, subclass: undefined }, { class: "paladin", level: 5, subclass: "devotion", spells: ["bless"] }], abilities: A, skills: ["athletics", "history"],
    choices: { "fighting-style": "defense", "paladin-fighting-style": "great-weapon-fighting" }, armour: "chain-mail", weapons: ["longsword"] };
  fp.classes[0] = { class: "fighter", level: 5, subclass: "champion" };
  assert.deepEqual(validate(fp), []);
  const q = derive(fp).record;
  assert.deepEqual(q.features, { extraAttack: 1 }, "Extra Attack from two classes is still one extra attack");
  assert.deepEqual(q.slots, { 1: 4, 2: 2 }, "the Paladin's own slots at Paladin level 5");
  assert.equal(q.hitDice, undefined, "both d10: one pool");
  const pr = { name: "Twin", classes: [{ class: "paladin", level: 2, spells: ["bless"] }, { class: "ranger", level: 2, spells: ["cure-wounds"] }], abilities: { ...A, wis: 14, dex: 14 },
    skills: ["athletics", "religion", "survival"], choices: { "fighting-style": "defense", "ranger-fighting-style": "archery" }, armour: "chain-mail", weapons: ["longsword"] };
  assert.deepEqual(validate(pr), []);
  assert.deepEqual(derive(pr).record.slots, { 1: 3 }, "half of 2 and half of 2, rounded up: caster level 2");
});

test("prerequisites: 13 in the primary ability of every class; a sheet that misses one is refused", () => {
  assert.ok(validate(palBard({ abilities: { ...PB, str: 12 } })).some((p) => /levels in Paladin and another class needs Strength and Charisma of 13 or more/.test(p)));
  assert.ok(validate(palBard({ abilities: { ...PB, cha: 12 } })).some((p) => /Bard and another class needs Charisma of 13/.test(p)));
  const f = (str, dex) => validate({ name: "F", classes: [{ class: "fighter", level: 1 }, { class: "rogue", level: 1 }], abilities: { str, dex, con: 12, int: 10, wis: 10, cha: 10 }, skills: ["athletics", "acrobatics", "stealth"], choices: { "fighting-style": "defense" } });
  assert.ok(!f(8, 14).some((p) => /Fighter and another class/.test(p)), "Strength or Dexterity");
  assert.ok(f(8, 12).some((p) => /Fighter and another class needs Strength or Dexterity of 13/.test(p)));
  assert.ok(validate(palBard({ classes: [{ class: "paladin", level: 14, subclass: "devotion" }, { class: "bard", level: 8, subclass: "lore" }] })).some((p) => /add up to 1 to 20/.test(p)));
  assert.ok(validate(palBard({ classes: [{ class: "paladin", level: 6, subclass: "devotion" }, { class: "paladin", level: 2 }] })).some((p) => /listed twice/.test(p)));
  assert.ok(validate(palBard({ classes: [{ class: "paladin", level: 6, subclass: "devotion" }] })).some((p) => /2 to 12/.test(p)));
  assert.ok(validate(palBard({ class: "paladin" })).some((p) => /keeps "class" in each/.test(p)));
  // Pact Magic beside Spellcasting is not built: refused, said plainly.
  assert.ok(validate({ name: "W", classes: [{ class: "warlock", level: 1 }, { class: "sorcerer", level: 1 }], abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 16 }, skills: ["arcana", "deception"] })
    .some((p) => /Pact Magic beside another class's Spellcasting is not built/.test(p)));
});

test("levelUp into a second class: one level in a new class at the end, its prerequisites, Hit Dice and spent uses kept", () => {
  const s = field(paladin6), e = s.entities.hero;
  e.hp -= 10; e.hd = 4; e.uses["lay-on-hands"] = 10;
  const up = { name: "Vor", classes: [{ class: "paladin", level: 6, subclass: "devotion", spells: paladinSpells }, { class: "bard", level: 1, spells: ["vicious-mockery", "minor-illusion", "healing-word", "faerie-fire", "heroism", "dissonant-whispers"] }],
    abilities: PB, skills: ["athletics", "religion", "performance"], choices: { "fighting-style": "defense" }, armour: "chain-mail", shield: true, weapons: ["longsword"] };
  assert.deepEqual(validate(up), []);
  // Refused, and nothing changes: two levels at once, the classes out of order, a single-class sheet of another class, a missed prerequisite.
  const snap = JSON.stringify(s);
  no(apply(s, { type: "levelUp", actor: "hero", sheet: { ...up, classes: [up.classes[0], { ...up.classes[1], level: 2 }] } }, DM), /one level/);
  no(apply(s, { type: "levelUp", actor: "hero", sheet: { ...up, classes: [up.classes[1], up.classes[0]] } }, DM), /order taken/);
  no(apply(s, { type: "levelUp", actor: "hero", sheet: { ...paladin6, class: "bard", level: 7 } }, DM), /keeps the class/);
  no(apply(s, { type: "levelUp", actor: "hero", sheet: { ...up, abilities: { ...PB, cha: 12 } } }, DM), /Charisma of 13/);
  no(apply(s, { type: "levelUp", actor: "hero", sheet: "junk" }, DM));
  assert.equal(JSON.stringify(s), snap);
  const maxHp = e.maxHp;
  ok(apply(s, { type: "levelUp", actor: "hero", sheet: up }, DM));
  const f = s.entities.hero;
  assert.equal(f.level, 7); assert.equal(f.prof, 3);
  assert.equal(f.maxHp, maxHp + 5 + 2, "a Bard level: 5 + Constitution 2");
  assert.equal(f.maxHp - f.hp, 10, "damage taken stays");
  assert.deepEqual(f.hdBy, { 8: 1, 10: 4 }, "the spent d10s stay spent; the new d8 is whole");
  assert.equal(f.hd, 5);
  assert.equal(f.uses["lay-on-hands"], 10);
  assert.equal(f.uses["bardic-inspiration"], 3);
  assert.deepEqual(f.slots, { 1: 4, 2: 3 }, "caster level 3 + 1 = 4");
  assert.equal(f.sheet.classes[1].class, "bard");
  // And one more Paladin level: the classes stay in order.
  const up2 = { ...up, classes: [{ ...up.classes[0], level: 7 }, up.classes[1]] };
  ok(apply(s, { type: "levelUp", actor: "hero", sheet: up2 }, DM));
  assert.ok(s.entities.hero.feats.some((x) => x.id === "aura-of-devotion"));
});

test("a Short Rest spends the largest Hit Dice first; a Long Rest gives them all back", () => {
  const s = field(palBard()), e = s.entities.hero;
  assert.deepEqual([e.hd, e.hdBy], [14, { 8: 8, 10: 6 }]);
  e.hp = 20;
  const r = ok(apply(s, { type: "shortRest", spend: { hero: 7 } }, DM));
  assert.deepEqual(e.hdBy, { 8: 7, 10: 0 });
  assert.equal(e.hd, 7);
  const sides = r.events.filter((x) => x.type === "heal" && x.target === "hero").map((x) => x.dice[0].sides);
  assert.deepEqual(sides, [10, 10, 10, 10, 10, 10, 8]);
  ok(apply(s, { type: "rest" }, DM));
  assert.deepEqual([e.hd, e.hdBy], [14, { 8: 8, 10: 6 }]);
});

test("migration to version 18: single-class characters load unchanged; Hit Dice by size are made to agree with hd", () => {
  assert.equal(VERSION, 18);
  const s = field(paladin6);
  const old = structuredClone(s); old.version = 17;
  const before = structuredClone(old.entities);
  migrate(old);
  assert.equal(old.version, 18);
  assert.deepEqual(old.entities, before, "nothing about a saved character changes");
  const m = field(palBard());
  delete m.entities.hero.hdBy; m.entities.hero.hd = 9; m.version = 17;
  migrate(m);
  assert.deepEqual(m.entities.hero.hdBy, { 8: 8, 10: 1 }, "5 spent, the d10s first");
  assert.equal(m.entities.hero.hd, 9);
  migrate(m);
  assert.deepEqual(m.entities.hero.hdBy, { 8: 8, 10: 1 }, "safe to run again");
});

test("setSheet builds a Paladin 6 / Bard 8 into the party, and a rejected sheet changes nothing", () => {
  const s = newGame(7), snap = JSON.stringify(s);
  no(apply(s, { type: "setSheet", sheet: palBard({ abilities: { ...PB, str: 10 } }) }, DM), /Strength and Charisma of 13/);
  assert.equal(JSON.stringify(s), snap);
  ok(apply(s, { type: "setSheet", sheet: palBard() }, DM));
  const e = Object.values(s.entities).find((x) => x.name === "Vor");
  assert.equal(e.maxHp, 108);
  assert.deepEqual(e.sheet.classes.map((x) => x.class), ["paladin", "bard"]);
});
