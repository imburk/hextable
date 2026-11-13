import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, PREGENS, SPELLS } from "../src/content/index.js";
import { lintRecord } from "../src/content/schema.js";
import { derive, validate, proficiencyFor } from "../src/derive.js";

import { SHEETS } from "./fixtures/sheets.js";

const sameAttack = (a, b) => ["type", "bonus", "damage", "dtype", "reach", "range"].every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));

test("the four pregens rebuilt as sheets derive to their hand-typed numbers", () => {
  for (const [id, sheet] of Object.entries(SHEETS)) {
    assert.deepEqual(validate(sheet), [], id);
    const { record } = derive(sheet), typed = PREGENS[id];
    assert.deepEqual(lintRecord(record, { spells: SPELLS }), [], id);
    for (const k of ["name", "cls", "level", "ac", "hp", "speed", "prof", "abil", "saveProf", "castAbil", "slots"]) assert.deepEqual(record[k], typed[k], `${id} ${k}`);
    assert.deepEqual([...record.skills].sort(), [...typed.skills].sort(), `${id} skills`);
    assert.deepEqual(record.expertise, typed.expertise ?? [], `${id} expertise`);
    assert.deepEqual([...(record.spells ?? [])].sort(), [...(typed.spells ?? [])].sort(), `${id} spells`);
    // Every hand-typed attack is among the derived ones, with the same numbers. The derived record
    // also lists the other ways to use the same weapons (a thrown Dagger, a Javelin in melee).
    for (const a of typed.attacks) assert.ok(record.attacks.some((b) => b.name.startsWith(a.name) && sameAttack(a, b) && !!a.finesse === !!b.finesse), `${id} ${a.name}`);
  }
  assert.equal(derive(SHEETS.rogue).record.features.sneak, PREGENS.rogue.features.sneak);
  assert.deepEqual(derive(SHEETS.rogue).record.tools, ["thieves-tools"]);
  assert.equal(derive(SHEETS.fighter).record.feats.find((f) => f.id === "second-wind").uses.max, PREGENS.fighter.features.secondWind);
});

test("Proficiency Bonus by level is the SRD's Character Advancement table", () => {
  assert.deepEqual(Array.from({ length: 20 }, (_, i) => proficiencyFor(i + 1)), [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6]);
});

const fighter = (level, more = {}) => ({ ...SHEETS.fighter, level, ...(level >= 3 ? { subclass: "champion" } : {}), ...more });
test("a Fighter 1 to 5 matches hand-worked numbers at each level", () => {
  // Hit Points: 10 + 2 at level 1, then 6 + 2 a level (SRD Fixed Hit Points by Class).
  const want = { 1: [12, 2, undefined], 2: [20, 2, undefined], 3: [28, 2, undefined], 4: [36, 2, undefined], 5: [44, 3, 1] };
  for (const [l, [hp, prof, extra]] of Object.entries(want)) {
    const { record } = derive(fighter(+l));
    assert.deepEqual(validate(fighter(+l)), [], `level ${l}`);
    assert.equal(record.hp, hp, `hp at ${l}`); assert.equal(record.prof, prof); assert.equal(record.features?.extraAttack, extra);
    assert.equal(record.attacks.find((a) => a.id === "longsword").bonus, 3 + prof);
    assert.equal(record.feats.find((f) => f.id === "second-wind").action.effects[0].heal, `1d10+${l}`);
  }
  assert.equal(derive(fighter(3)).record.critOn, 19);
  assert.equal(derive(fighter(3)).record.cls, "Fighter (Champion)");
  assert.equal(derive(fighter(4)).record.feats.find((f) => f.id === "second-wind").uses.max, 3);
  assert.equal(derive(fighter(2)).record.feats.find((f) => f.id === "action-surge").uses.recharge, "short");
  assert.equal(derive(fighter(11)).record.features.extraAttack, 2);
  assert.equal(derive(fighter(20)).record.features.extraAttack, 3);
});

test("Armor Class by the SRD's rules: armour, Dexterity caps, Shield, Defense, Unarmored Defense", () => {
  const ac = (s) => derive(s).record.ac;
  assert.equal(ac({ ...SHEETS.fighter, choices: { "fighting-style": "defense" } }), 19);              // Chain Mail 16, Shield 2, Defense 1
  assert.equal(ac({ ...SHEETS.fighter, armour: "half-plate-armor", abilities: { ...SHEETS.fighter.abilities, dex: 18 } }), 19);   // 15 + Dex max 2 + Shield
  assert.equal(ac({ ...SHEETS.fighter, armour: undefined, shield: false }), 11);                       // 10 + Dex 1
  const barb = { name: "Ug", class: "barbarian", level: 1, abilities: { str: 16, dex: 14, con: 16, int: 8, wis: 12, cha: 10 }, skills: ["athletics", "survival"], weapons: ["greataxe"] };
  assert.equal(ac(barb), 15);                                                                           // 10 + Dex 2 + Con 3
  assert.equal(ac({ ...barb, shield: true }), 17);                                                      // a Shield still adds
  assert.equal(ac({ ...barb, armour: "hide-armor" }), 14);                                              // armour replaces it
  const monk = { name: "Lo", class: "monk", level: 1, abilities: { str: 10, dex: 16, con: 14, int: 8, wis: 15, cha: 10 }, skills: ["acrobatics", "insight"], weapons: ["quarterstaff"] };
  assert.equal(ac(monk), 15);                                                                           // 10 + Dex 3 + Wis 2
  assert.equal(ac({ ...monk, shield: true }), 13);                                                      // no Unarmored Defense with a Shield, and no Shield training
  const { record: m } = derive(monk);
  assert.deepEqual(m.attacks.find((a) => a.id === "unarmed-strike"), { id: "unarmed-strike", name: "Unarmed Strike", type: "melee", bonus: 5, damage: "1d6+3", dtype: "bludgeoning", reach: 5, abil: "dex" });
  assert.equal(m.attacks.find((a) => a.id === "unarmed-strike-bonus").time, "bonus");
  assert.equal(m.attacks.find((a) => a.id === "quarterstaff").damage, "1d6+3");                        // a Monk weapon with Dexterity
  assert.equal(derive({ ...monk, level: 2 }).record.speed, 40);                                         // Unarmored Movement
  assert.equal(derive({ ...barb, level: 5, subclass: "berserker" }).record.speed, 40);                  // Fast Movement
  assert.equal(derive({ ...barb, level: 5, subclass: "berserker", armour: "chain-mail" }).record.speed, 30);
});

test("attacks: finesse, thrown, versatile, reach, Archery, proficiency", () => {
  const r = derive({ ...SHEETS.fighter, shield: false, weapons: ["longsword", "glaive", "longbow", "dagger"] }).record;
  const at = (id) => r.attacks.find((a) => a.id === id);
  assert.equal(at("longsword-two-handed").damage, "1d10+3");
  assert.equal(at("glaive").reach, 10);
  assert.equal(at("longbow").bonus, 1 + 2 + 2);                // Dex 1, Proficiency 2, Archery 2
  assert.equal(at("dagger").bonus, 5);                         // finesse: the better of Str 3 and Dex 1
  assert.deepEqual(at("dagger-thrown").range, [20, 60]);
  const wiz = derive({ ...SHEETS.wizard, weapons: ["longsword"] }).record;
  assert.equal(wiz.attacks[0].bonus, -1);                      // Str -1, not proficient
  assert.match(validate({ ...SHEETS.wizard, weapons: ["longsword"] }).join(" "), /not proficient with the Longsword/);
});

test("spellcasting: slots, always-prepared spells, pact magic", () => {
  const cl = derive({ ...SHEETS.cleric, level: 5, subclass: "life" }).record;
  assert.deepEqual(cl.slots, { 1: 4, 2: 3, 3: 2 });
  for (const id of ["aid", "bless", "cure-wounds", "lesser-restoration", "mass-healing-word", "revivify"]) assert.ok(cl.spells.includes(id), id);
  assert.ok(!cl.spells.includes("aura-of-life"));
  const wl = { name: "Vex", class: "warlock", level: 5, subclass: "fiend", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 17 }, skills: ["arcana", "deception"], spells: ["eldritch-blast", "hex"] };
  assert.deepEqual(validate(wl), []);
  assert.deepEqual([derive(wl).record.slots, derive(wl).record.pact], [{ 3: 2 }, true]);
  const pal = { name: "Sir", class: "paladin", level: 2, abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 10, cha: 14 }, skills: ["athletics", "religion"], choices: { "fighting-style": "defense" }, armour: "chain-mail", shield: true, weapons: ["longsword"] };
  assert.deepEqual(validate(pal), []);
  assert.ok(derive(pal).record.spells.includes("divine-smite"));
  assert.equal(derive(pal).record.feats.find((f) => f.id === "lay-on-hands").uses.max, 10);
});

test("validate says what is wrong in plain words", () => {
  const v = (more) => validate({ ...SHEETS.fighter, ...more }).join(" | ");
  assert.match(validate({ ...SHEETS.fighter, class: "necromancer" })[0], /Choose a class/);
  assert.match(v({ level: 3 }), /has a subclass: choose Champion/);
  assert.match(v({ skills: ["perception"] }), /chooses 2 skills/);
  assert.match(v({ skills: ["perception", "stealth"] }), /from the Fighter list/);
  assert.match(v({ choices: {} }), /Choose an option for Fighting Style/);
  assert.match(v({ expertise: ["athletics"] }), /Expertise in 0 skills/);
  assert.match(v({ abilities: { ...SHEETS.fighter.abilities, str: 25 } }), /each 1 to 20/);
  assert.match(validate({ ...SHEETS.wizard, armour: "chain-mail" }).join(" "), /no training with heavy armour/);
  assert.match(validate({ ...SHEETS.wizard, spells: ["fire-bolt", "cure-wounds"] }).join(" "), /Cure Wounds is not on the Wizard spell list/);
  assert.match(validate({ ...SHEETS.wizard, spells: ["fireball"] }).join(" "), /level 3; a level 1 Wizard casts spells up to level 1/);
  assert.match(validate({ ...SHEETS.wizard, spells: ["fire-bolt", "ray-of-frost", "light", "mage-hand"] }).join(" "), /knows 3 cantrips; 4 chosen/);
  assert.match(validate({ ...SHEETS.fighter, spells: ["fire-bolt"] }).join(" "), /no Spellcasting feature/);
  assert.deepEqual(validate({ ...SHEETS.cleric, armour: "chain-shirt", choices: { "divine-order": "thaumaturge" }, spells: ["sacred-flame", "light", "guidance", "thaumaturgy"] }), []);    // Thaumaturge: a fourth cantrip
  assert.match(validate({ ...SHEETS.cleric, choices: { "divine-order": "thaumaturge" } }).join(" "), /no training with heavy armour/);
});

test("every class derives a playable record at every level", () => {
  for (const c of Object.values(CONTENT.classes)) {
    for (let level = 1; level <= 20; level++) {
      const choices = {};
      let picks = 0;      // features that pick from one list (Metamagic at 2, 10, 17) take different options (#154)
      for (const f of [...c.features, ...c.subclass.features]) if (f.options) choices[f.id] = f.options[f.pick ? picks++ : f.id === "additional-fighting-style" ? 1 : 0].id;
      const sheet = { name: "Test", class: c.id, level, ...(level >= 3 ? { subclass: c.subclass.id } : {}), abilities: { str: 14, dex: 14, con: 14, int: 14, wis: 14, cha: 14 },
        skills: [], choices, weapons: ["dagger"] };
      const want = c.skills.choose + [...c.features, ...c.subclass.features].filter((f) => f.level <= level && f.grants?.skills).reduce((n, f) => n + f.grants.skills.n, 0);
      sheet.skills = (c.skills.from === "any" ? Object.keys(CONTENT.spells).length && ["acrobatics", "arcana", "athletics", "deception", "history", "insight", "medicine"] : c.skills.from).slice(0, want);
      assert.deepEqual(validate(sheet), [], `${c.id} ${level}`);
      const { record } = derive(sheet);
      assert.deepEqual(lintRecord(record, { spells: SPELLS }), [], `${c.id} ${level}`);
    }
  }
});
