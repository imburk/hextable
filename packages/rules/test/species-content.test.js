// The nine SRD species as data, job SP2 of docs/specs/species.md: each entry lints, derives the traits the vocabulary can say, and
// enters the rest as `manual` features that keep their uses, so using one spends a use (and a Bonus Action where it is one) and tells
// the DM. No `manual` text may say the engine does what it does not.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { lintPack, lintRecord } from "../src/content/schema.js";
import { CONTENT, PACKS } from "../src/content/index.js";
import { species } from "../src/content/srd52/species.js";
import { modifiers, speedOf } from "../src/modifiers.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "refused"); if (re) assert.match(r.error, re); return r; };
const A = { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 8 };
const fighter = (level, sp, more = {}) => ({ name: "Brann", class: "fighter", level, ...(level >= 3 ? { subclass: "champion" } : {}), abilities: A, skills: ["athletics", "perception"],
  choices: { "fighting-style": "defense" }, armour: "chain-mail", weapons: ["longsword"], species: sp, ...more });
const feat = (r, id) => r.feats.find((f) => f.id === id);
const allFeatures = (sp) => [...sp.features, ...(sp.lineage?.options ?? []).flatMap((o) => o.features)];

test("the nine SRD species are entered, lint clean, checked, Humanoid, with the SRD's sizes and Speeds", () => {
  assert.deepEqual(lintPack(PACKS[0]), []);
  assert.deepEqual(Object.keys(CONTENT.species), ["dragonborn", "dwarf", "elf", "gnome", "goliath", "halfling", "human", "orc", "tiefling"]);
  const shape = Object.fromEntries(species.map((s) => [s.id, [s.sizes.join("/"), s.speed, s.ability?.join("/") ?? "", s.lineage?.options.map((o) => o.id).join(",") ?? ""]]));
  assert.deepEqual(shape, {
    dragonborn: ["medium", 30, "", "black,blue,brass,bronze,copper,gold,green,red,silver,white"],
    dwarf: ["medium", 30, "", ""],
    elf: ["medium", 30, "int/wis/cha", "drow,high-elf,wood-elf"],
    gnome: ["small", 30, "int/wis/cha", "forest-gnome,rock-gnome"],
    goliath: ["medium", 35, "", "cloud,fire,frost,hill,stone,storm"],
    halfling: ["small", 30, "", ""],
    human: ["medium/small", 30, "", ""],
    orc: ["medium", 30, "", ""],
    tiefling: ["medium/small", 30, "int/wis/cha", "abyssal,chthonic,infernal"],
  });
  for (const s of species) {
    assert.equal(s.type, "humanoid", s.id);
    assert.equal(s.checked, true, s.id);
    assert.equal(s.source, "SRD 5.2.1");
    for (const f of allFeatures(s)) assert.equal(f.checked, true, `${s.id} ${f.id}`);
  }
  // Every species has a trait the engine cannot play yet, so every one is manual (a species is no higher than its lowest feature).
  assert.deepEqual(species.map((s) => s.tier), Array(9).fill("manual"));
});

test("the Draconic Ancestors table: each dragon's Breath Weapon and Resistance carry its damage type", () => {
  const types = { black: "acid", blue: "lightning", brass: "fire", bronze: "lightning", copper: "acid", gold: "fire", green: "poison", red: "fire", silver: "cold", white: "cold" };
  for (const o of CONTENT.species.dragonborn.lineage.options) {
    const t = types[o.id], T = t[0].toUpperCase() + t.slice(1);
    const [bw, dr] = o.features;
    assert.deepEqual(dr.grants, { resist: [t] }, o.id);
    assert.equal(bw.name, `Breath Weapon (${T})`);
    assert.match(bw.text, new RegExp(`1d10 ${T} damage`));
    assert.match(bw.text, /15-foot Cone or a 30-foot Line 5 feet wide/);
    assert.match(bw.text, /DC 8 \+ Constitution modifier \+ Proficiency Bonus/);
    assert.match(bw.text, /2d10 from character level 5, 3d10 from 11, 4d10 from 17/);
    assert.deepEqual(bw.uses, { max: { prof: 1 }, recharge: "long" });
    const r = derive(fighter(1, { id: "dragonborn", lineage: o.id })).record;
    assert.deepEqual(r.resist, [t]);
  }
});

test("what each species derives: Darkvision, Resistances, save Advantage, Hit Points, Speed and size", () => {
  const d = (sp, level = 5, more) => { const sh = fighter(level, sp, more); assert.deepEqual(validate(sh), [], sp.id); const out = derive(sh); assert.deepEqual(lintRecord(out.record), []); return out; };
  const plain = derive(fighter(5, undefined)).record;
  // Dwarf: 120 ft, Poison, Advantage against Poisoned, +1 Hit Point a level.
  const dw = d({ id: "dwarf" });
  assert.deepEqual(dw.record.senses, { darkvision: 120 });
  assert.deepEqual(dw.record.resist, ["poison"]);
  assert.equal(dw.record.hp, plain.hp + 5);
  assert.ok(dw.why.hp.includes("Dwarven Toughness +5"));
  assert.deepEqual(feat(dw.record, "species-dwarven-resilience").modifiers, [{ on: "save", op: "advantage", scope: { condition: "poisoned" } }]);
  assert.equal(d({ id: "dwarf" }, 1).record.hp, derive(fighter(1, undefined)).record.hp + 1);
  // Elf: 60 ft, a Drow's 120; a Wood Elf's 35 ft; Fey Ancestry.
  assert.deepEqual(d({ id: "elf", lineage: "high-elf", ability: "int" }).record.senses, { darkvision: 60 });
  assert.deepEqual(d({ id: "elf", lineage: "drow", ability: "cha" }).record.senses, { darkvision: 120 });
  const wood = d({ id: "elf", lineage: "wood-elf", ability: "wis" });
  assert.equal(wood.record.speed, 35);
  assert.deepEqual(feat(wood.record, "species-fey-ancestry").modifiers, [{ on: "save", op: "advantage", scope: { condition: "charmed" } }]);
  // Gnome: Small, Advantage on Intelligence, Wisdom and Charisma saves.
  const gn = d({ id: "gnome", lineage: "forest-gnome", ability: "wis" });
  assert.equal(gn.record.size, "small");
  assert.deepEqual(feat(gn.record, "species-gnomish-cunning").modifiers.map((m) => m.on), ["save.int", "save.wis", "save.cha"]);
  // Goliath: 35 ft, no Darkvision; Large Form from level 5 only.
  const go = d({ id: "goliath", lineage: "hill" });
  assert.equal(go.record.speed, 35);
  assert.equal(go.record.senses, undefined);
  assert.ok(feat(go.record, "species-large-form"));
  assert.equal(feat(d({ id: "goliath", lineage: "hill" }, 4).record, "species-large-form"), undefined);
  assert.deepEqual(feat(go.record, "species-hill-hills-tumble").uses, { max: 3, recharge: "long" });
  // Halfling: Small, Brave.
  const ha = d({ id: "halfling" });
  assert.equal(ha.record.size, "small");
  assert.deepEqual(feat(ha.record, "species-brave").modifiers, [{ on: "save", op: "advantage", scope: { condition: "frightened" } }]);
  // Human: Medium or Small; Skillful is one more skill.
  assert.equal(d({ id: "human" }, 5, { skills: ["athletics", "perception", "insight"] }).record.size, "medium");
  assert.equal(d({ id: "human" }, 5, { skills: ["athletics", "perception", "insight"], size: "small" }).record.size, "small");
  assert.ok(validate(fighter(5, { id: "human" })).some((p) => /chooses 3 skills/.test(p)), "Skillful's skill is counted");
  // Orc: 120 ft; Adrenaline Rush at the Proficiency Bonus.
  const orc = d({ id: "orc" });
  assert.deepEqual(orc.record.senses, { darkvision: 120 });
  assert.deepEqual(feat(orc.record, "species-adrenaline-rush").uses, { max: 3, recharge: "short" });
  assert.deepEqual(feat(orc.record, "species-adrenaline-rush").action.effects, [{ tempHp: "+3" }]);
  // Tiefling: a legacy's Resistance; Medium or Small.
  assert.deepEqual(d({ id: "tiefling", lineage: "abyssal", ability: "cha" }).record.resist, ["poison"]);
  assert.deepEqual(d({ id: "tiefling", lineage: "chthonic", ability: "cha" }).record.resist, ["necrotic"]);
  assert.deepEqual(d({ id: "tiefling", lineage: "infernal", ability: "cha" }, 5, { size: "small" }).record.resist, ["fire"]);
  // Lineage spells come at character levels 3 and 5, each with one casting without a slot a Long Rest.
  const t2 = derive(fighter(2, { id: "tiefling", lineage: "infernal", ability: "int" })).record;
  assert.ok(feat(t2, "species-infernal-fire-bolt"));
  assert.equal(feat(t2, "species-infernal-hellish-rebuke"), undefined);
  const t5 = derive(fighter(5, { id: "tiefling", lineage: "infernal", ability: "int" })).record;
  assert.deepEqual(feat(t5, "species-infernal-hellish-rebuke").uses, { max: 1, recharge: "long" });
  assert.deepEqual(feat(t5, "species-infernal-darkness").uses, { max: 1, recharge: "long" });
  assert.deepEqual(feat(derive(fighter(5, { id: "gnome", lineage: "forest-gnome", ability: "int" })).record, "species-forest-gnome-speak-with-animals").uses, { max: 3, recharge: "long" });
});

test("no manual trait claims what the engine does: each tells the DM, grants nothing but a cost-only action, and an assist trait names its manual part", () => {
  for (const s of species) for (const f of allFeatures(s)) {
    if (f.tier === "auto") { assert.ok(f.grants, `${s.id} ${f.id} plays`); continue; }
    assert.match(f.text, /\bDM\b/, `${s.id} ${f.id} says what the DM does`);
    assert.match(f.text, /\bengine\b[^.]*\b(not|no|cannot|keeps the 1)\b/, `${s.id} ${f.id} says what the engine does not do`);
    if (f.tier === "manual" && f.grants) {
      assert.deepEqual(Object.keys(f.grants), ["action"]);
      assert.ok(f.grants.action.effects.every((st) => Object.keys(st).join() === "manual"), `${s.id} ${f.id}: a cost-only action`);
    }
  }
  // The assist traits: what the engine plays is data, the rest a manual step or a sentence.
  const lf = CONTENT.species.goliath.features.find((f) => f.id === "large-form");
  assert.equal(lf.tier, "assist");
  assert.ok(lf.grants.action.effects.some((st) => "manual" in st && /size/.test(st.manual)));
});

// ---------- in play ----------
function field(sheet) {
  const s = newGame(11);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  const id = ok(apply(s, { type: "setSheet", sheet, at: { q: 0, r: 0, z: 0 } }, DM)).events.find((e) => e.type === "spawned").id;
  s.entities.foe = makeEntity(derive(fighter(1, undefined, { name: "Foe" })).record, { id: "foe", kind: "npc", side: "foe", pos: { q: 3, r: 0, z: 0 } });
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  for (let i = 0; i < 6 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.equal(current(s), id);
  return { s, id };
}
const told = (r) => r.events.filter((e) => e.type === "manual").map((e) => e.text).join(" | ");

test("in play: a manual Bonus Action trait spends the Bonus Action and a use and tells the DM (Stonecunning)", () => {
  const { s, id } = field(fighter(5, { id: "dwarf" }));
  assert.equal(s.entities[id].uses["species-stonecunning"], 3);
  const r = ok(apply(s, { type: "feature", actor: id, feature: "species-stonecunning" }, DM));
  assert.match(told(r), /Tremorsense out to 60 feet/);
  assert.equal(s.entities[id].uses["species-stonecunning"], 2);
  no(apply(s, { type: "feature", actor: id, feature: "species-stonecunning" }, DM), /Bonus Action/);
});

test("in play: Adrenaline Rush Dashes and gives Temporary Hit Points; Relentless Endurance and a Breath Weapon spend their uses and tell the DM", () => {
  const { s, id } = field(fighter(5, { id: "orc" }));
  const move = s.encounter.budget.move;
  ok(apply(s, { type: "feature", actor: id, feature: "species-adrenaline-rush" }, DM));
  assert.equal(s.entities[id].tempHp, 3);
  assert.equal(s.entities[id].uses["species-adrenaline-rush"], 2);
  assert.equal(s.encounter.budget.move, move + 30);
  const re = ok(apply(s, { type: "feature", actor: id, feature: "species-relentless-endurance" }, DM));
  assert.match(told(re), /the DM sets the Hit Points to 1/);
  assert.equal(s.entities[id].uses["species-relentless-endurance"], 0);
  no(apply(s, { type: "feature", actor: id, feature: "species-relentless-endurance" }, DM));
  const db = field(fighter(5, { id: "dragonborn", lineage: "green" }));
  const bw = ok(apply(db.s, { type: "feature", actor: db.id, feature: "species-green-breath-weapon" }, DM));
  assert.match(told(bw), /1d10 Poison damage/);
  assert.equal(db.s.entities[db.id].uses["species-green-breath-weapon"], 2);
});

test("in play: Large Form gives Advantage on Strength checks and 10 feet of Speed and hands the size to the DM; Powerful Build helps an escape", () => {
  const { s, id } = field(fighter(5, { id: "goliath", lineage: "cloud" }));
  const before = speedOf(s, s.entities[id]);
  assert.deepEqual(modifiers(s, s.entities[id], "check", { ability: "str" }).advantage, []);
  const r = ok(apply(s, { type: "feature", actor: id, feature: "species-large-form" }, DM));
  assert.match(told(r), /The engine does not change a creature's size/);
  assert.equal(speedOf(s, s.entities[id]), before + 10);
  assert.deepEqual(modifiers(s, s.entities[id], "check", { ability: "str" }).advantage, ["Large Form"]);
  assert.equal(s.entities[id].uses["species-large-form"], 0);
  // The Bonus Action is spent: Cloud's Jaunt waits for the next turn.
  no(apply(s, { type: "feature", actor: id, feature: "species-cloud-clouds-jaunt" }, DM), /Bonus Action/);
  assert.deepEqual(modifiers(s, s.entities[id], "check", { ability: "dex", escape: true }).advantage, ["Powerful Build"]);
  assert.deepEqual(modifiers(s, s.entities[id], "check", { ability: "dex" }).advantage, []);
});

test("in play: a lineage spell's casting without a slot is spent once a Long Rest, and the DM is told", () => {
  const { s, id } = field(fighter(5, { id: "elf", lineage: "high-elf", ability: "int" }));
  const r = ok(apply(s, { type: "feature", actor: id, feature: "species-high-elf-misty-step" }, DM));
  assert.match(told(r), /Misty Step/);
  assert.equal(s.entities[id].uses["species-high-elf-misty-step"], 0);
  no(apply(s, { type: "feature", actor: id, feature: "species-high-elf-misty-step" }, DM));
  ok(apply(s, { type: "endEncounter" }, DM));
  ok(apply(s, { type: "rest" }, DM));
  assert.equal(s.entities[id].uses["species-high-elf-misty-step"], 1);
  // A cantrip feature has no uses: there is nothing to spend.
  no(apply(s, { type: "feature", actor: id, feature: "species-high-elf-prestidigitation" }, DM), /always on/);
});
