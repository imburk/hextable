// Species, job SP1 of docs/specs/species.md (S1): the species kind and its linter, the sheet's `species`, `speciesFeatures`, `why.species`,
// the size and Speed rules, `type` on the record and the creature, and a species whose entry is not loaded.
// The species here are invented for this test ("Stonefolk", "Glimmerkin"); no published species is used, and the SRD's are not entered yet (SP2).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, creatureType, current, makeEntity } from "../src/engine.js";
import { derive, featuresOf, missingOf, missingSpeciesOf, speciesFeatures, speciesOf, validate } from "../src/derive.js";
import { lintPack, lintRecord } from "../src/content/schema.js";
import { CONTENT } from "../src/content/index.js";
import { modifiers } from "../src/modifiers.js";
import { newGame } from "../src/scenario.js";
import { viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "refused"); if (re) assert.match(r.error, re); return r; };

// ---------- the invented species ----------
const stonefolk = {
  id: "stonefolk", name: "Stonefolk", source: "Written for a test", checked: false, tier: "auto", type: "humanoid", sizes: ["medium"], speed: 25,
  text: "Slow, hardy people of the deep halls.",
  features: [
    { id: "darkvision", name: "Darkvision", level: 1, tier: "auto", checked: false, text: "You see in the dark out to 60 feet.", grants: { senses: { darkvision: 60 } } },
    { id: "stone-blood", name: "Stone Blood", level: 1, tier: "auto", checked: false, text: "Resistance to Poison damage, and Advantage on saves to avoid or end Poisoned.",
      grants: { resist: ["poison"], modifiers: [{ on: "save", op: "advantage", scope: { condition: "poisoned" } }] } },
    { id: "deep-toughness", name: "Deep Toughness", level: 1, tier: "auto", checked: false, text: "One more Hit Point each level.", grants: { hp: { perLevel: 1 } } },
    { id: "surge", name: "Surge", level: 1, tier: "auto", checked: false, text: "A Bonus Action: Dash, and gain Temporary Hit Points equal to your Proficiency Bonus.",
      uses: { max: { prof: 1 }, recharge: "short" },
      grants: { action: { time: "bonus", cost: { resource: "surge" }, target: { self: true }, acts: ["dash"], effects: [{ tempHp: { prof: 1 } }] } } },
    { id: "old-craft", name: "Old Craft", level: 1, tier: "auto", checked: false, text: "A craft of the halls: Advantage on Intelligence or on Wisdom saves.",
      options: [
        { id: "lore", name: "Lore", tier: "auto", text: "Advantage on Intelligence saves.", grants: { modifiers: [{ on: "save.int", op: "advantage" }] } },
        { id: "patience", name: "Patience", tier: "auto", text: "Advantage on Wisdom saves.", grants: { modifiers: [{ on: "save.wis", op: "advantage" }] } },
      ] },
  ],
  lineage: { name: "Stone Line", options: [
    { id: "granite", name: "Granite", text: "Granite-skinned.", features: [
      { id: "granite-skin", name: "Granite Skin", level: 3, tier: "auto", checked: false, text: "From level 3, Resistance to Bludgeoning damage.", grants: { resist: ["bludgeoning"] } }] },
    { id: "basalt", name: "Basalt", text: "Basalt-eyed.", features: [
      { id: "basalt-sight", name: "Basalt Sight", level: 3, tier: "auto", checked: false, text: "From level 3, Darkvision out to 120 feet.", grants: { senses: { darkvision: 120 } } },
      { id: "basalt-burst", name: "Basalt Burst", level: 5, tier: "auto", checked: false, text: "From level 5, once per Long Rest, a Bonus Action that spends a use of Surge too: more Temporary Hit Points.",
        uses: { max: 1, recharge: "long" }, grants: { action: { time: "bonus", cost: { resource: "basalt-burst" }, target: { self: true }, effects: [{ tempHp: "+5" }] } } }] },
  ] },
};
// Not a Humanoid, of two sizes, with an ability for its spells (none yet: those are S2).
const glimmerkin = { id: "glimmerkin", name: "Glimmerkin", source: "Written for a test", checked: false, tier: "auto", type: "fey", sizes: ["small", "medium"], speed: 30,
  ability: ["int", "wis", "cha"], text: "Small bright folk of the woods.", features: [] };
const PACK = { pack: { id: "test-species", name: "Test species", license: "CC0", attribution: "Written for a test." }, species: [stonefolk, glimmerkin] };
const GONE = "hb-ember-folk-ash-born";

// The species are put into the pack's lookup for one test and taken out after it (the SRD has none yet).
function withSpecies(fn) {
  for (const sp of PACK.species) CONTENT.species[sp.id] = sp;
  try { return fn(); } finally { for (const sp of PACK.species) delete CONTENT.species[sp.id]; }
}
const A = { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 8 };
const fighter = (level, more = {}) => ({ name: "Brann", class: "fighter", level, ...(level >= 3 ? { subclass: "champion" } : {}), abilities: A, skills: ["athletics", "perception"],
  choices: { "fighting-style": "defense" }, armour: "chain-mail", weapons: ["longsword"], ...more });
const stone = (level, lineage = "granite", more = {}) => fighter(level, { species: { id: "stonefolk", lineage, choices: { "old-craft": "lore" } }, ...more });
const feat = (r, id) => r.feats.find((f) => f.id === id);

// ---------- the linter ----------
test("lintSpecies: the invented species pass; each refusal has its sentence", () => {
  assert.deepEqual(lintPack(PACK), []);
  const bad = (change) => { const sp = structuredClone(stonefolk); change(sp); return lintPack({ pack: PACK.pack, species: [sp] }).join(" | "); };
  assert.match(bad((s) => { s.languages = ["common"]; }), /"languages" is not something a species has/);
  assert.match(bad((s) => { s.type = "elf"; }), /type is a creature type/);
  assert.match(bad((s) => { s.sizes = ["large"]; }), /sizes lists small, medium or both/);
  assert.match(bad((s) => { s.sizes = []; }), /sizes lists small, medium or both/);
  assert.match(bad((s) => { s.speed = 33; }), /speed is its Speed in feet, a multiple of 5/);
  assert.match(bad((s) => { s.ability = ["int", "int"]; }), /ability lists the abilities its spells may use, each once/);
  assert.match(bad((s) => { delete s.features; }), /features is a list/);
  // A species has no class table: an amount by column is refused.
  assert.match(bad((s) => { s.features[2].grants.hp = { column: "x" }; }), /feature deep-toughness: hp: no column "x" in the class table/);
  // What derive could not play for a species is refused, not dropped.
  assert.match(bad((s) => { s.features[0].grants.spells = ["light"]; }), /feature darkvision: a species' spells wait on innate spells \(S2\)/);
  assert.match(bad((s) => { s.features[0].grants.cantrips = 1; }), /a species' cantrips wait on innate spells/);
  assert.match(bad((s) => { s.features[0].grants.freeCast = { spells: ["light"] }; s.features[0].uses = { max: 1, recharge: "long" }; }), /free casting waits on innate spells/);
  assert.match(bad((s) => { s.features[0].grants.skills = { n: 1, from: "class" }; }), /a species has no class list/);
  assert.match(bad((s) => { s.features[0] = { id: "versatile", name: "Versatile", level: 1, tier: "auto", checked: false, text: "A feat.", feat: "any" }; }), /waits on the Origin feat place \(S4\)/);
  assert.match(bad((s) => { s.features[0].grants.skills = { n: 1, from: ["insight", "perception"] }; }), /a species cannot give skills from a list/);
  assert.match(bad((s) => { s.features[3].grants.action.cost.resource = "nothing"; }), /feature surge: a cost names "nothing", which is not a feature with uses of this species/);
  assert.match(bad((s) => { s.features.push({ ...s.features[0] }); }), /feature darkvision: needs a kebab-case id used once in the species/);
  assert.match(bad((s) => { s.features[0].tier = "manual"; delete s.features[0].grants; }), /tier is auto, but a feature is manual: a species is no higher than its lowest feature/);
  // A lineage.
  assert.match(bad((s) => { s.lineage.options.pop(); }), /lineage.options lists two or more choices/);
  assert.match(bad((s) => { s.lineage.colour = "grey"; }), /"colour" is not something a lineage has/);
  assert.match(bad((s) => { s.lineage.options[0].spells = []; }), /lineage granite: "spells" is not something a lineage option has/);
  assert.match(bad((s) => { s.lineage.options[1].id = "granite"; }), /lineage granite: needs a kebab-case id used once in the lineage/);
  assert.match(bad((s) => { s.lineage.options[0].features[0].id = "darkvision"; }), /lineage granite: feature darkvision: needs a kebab-case id used once in the species \(a lineage option's feature ids are not the species' own\)/);
  assert.match(bad((s) => { s.lineage.options[0].features[0].tier = "manual"; delete s.lineage.options[0].features[0].grants; }), /a species is no higher than its lowest feature/);
  // A lineage feature may spend its own uses or the species'; not another lineage's.
  assert.equal(bad((s) => { s.lineage.options[1].features[1].grants.action.cost.resource = "surge"; }), "");
  assert.match(bad((s) => { s.lineage.options[0].features.push({ ...structuredClone(s.lineage.options[1].features[1]), id: "granite-burst" }); }), /lineage granite: feature granite-burst: a cost names "basalt-burst"/);
  assert.match(bad((s) => { s.dmNotes = "x".repeat(501); }), /dmNotes is text of at most 500 letters/);
  // An option's tier counts as a feature's.
  assert.match(bad((s) => { s.features[4].options[1].tier = "manual"; delete s.features[4].options[1].grants; }), /tier is auto, but a feature is manual: a species is no higher than its lowest feature/);
  // Two ids that come out the same in the record: a feature "x-y" beside feature "x"'s option "y"; a lineage "a"'s feature "b" beside the species' feature "a-b".
  const lore = { id: "old-craft-lore", name: "Old Lore", level: 1, tier: "auto", checked: false, text: "Advantage on Intelligence saves.", grants: { modifiers: [{ on: "save.int", op: "advantage" }] } };
  assert.match(bad((s) => { s.features.push(lore); }), /feature old-craft's option lore and feature old-craft-lore would both be "species-old-craft-lore" in a character's record: rename one/);
  assert.match(bad((s) => { s.features.push({ ...lore, id: "granite-granite-skin" }); }), /feature granite-granite-skin and lineage granite's feature granite-skin would both be "species-granite-granite-skin" in a character's record: rename one/);
  // Only with the lineage option that makes it: Basalt's features are not Granite's.
  assert.equal(bad((s) => { s.features.push({ ...lore, id: "granite-basalt-sight" }); }), "");
  assert.match(bad((s) => { s.lineage.options[0].features.push({ ...lore, id: "granite-skin-x" }); s.lineage.options[0].features[0].options = [{ id: "x", name: "X", tier: "auto", text: "X.", grants: { resist: ["fire"] } }, { id: "z", name: "Z", tier: "auto", text: "Z.", grants: { resist: ["cold"] } }]; }),
    /lineage granite's feature granite-skin's option x and lineage granite's feature granite-skin-x would both be "species-granite-granite-skin-x"/);
  // A pack with no species lints as before.
  assert.deepEqual(lintPack({ pack: PACK.pack }), []);
});

// ---------- derive ----------
test("a level 5 Stonefolk fighter: Resistance, Darkvision, save Advantage, Hit Points per level, the species' Speed and size, a use-limited Bonus Action, the lineage's level 3 feature", () => {
  withSpecies(() => {
    const plain = derive(fighter(5)), { record: r, why, missing } = derive(stone(5));
    assert.deepEqual(validate(stone(5)), []);
    assert.deepEqual(lintRecord(r), []);
    assert.deepEqual(missing, []);
    assert.deepEqual(r.senses, { darkvision: 60 });
    assert.deepEqual(r.resist, ["poison", "bludgeoning"]);
    assert.equal(r.hp, plain.record.hp + 5, "one Hit Point a character level");
    assert.ok(why.hp.includes("Deep Toughness +5"));
    assert.equal(r.speed, 25);
    assert.deepEqual(why.speed, ["25 ft (Stonefolk)"]);
    assert.equal(r.size, "medium");
    assert.equal(r.type, undefined, "a Humanoid's record names no type");
    assert.deepEqual(why.species, ["Stonefolk (Stone Line: Granite)", "Medium, Speed 25 ft"]);
    // The features, first in the record, under their own ids; the option chosen; the class's after them.
    assert.deepEqual(r.feats.slice(0, 7).map((f) => f.id), ["species-darkvision", "species-stone-blood", "species-deep-toughness", "species-surge", "species-old-craft", "species-old-craft-lore", "species-granite-granite-skin"]);
    assert.deepEqual(r.feats.slice(7).map((f) => f.id), plain.record.feats.map((f) => f.id));
    assert.deepEqual(feat(r, "species-stone-blood").modifiers, [{ on: "save", op: "advantage", scope: { condition: "poisoned" } }]);
    assert.deepEqual(feat(r, "species-old-craft-lore").modifiers, [{ on: "save.int", op: "advantage" }]);
    const surge = feat(r, "species-surge");
    assert.deepEqual(surge.uses, { max: 3, recharge: "short" }, "the Proficiency Bonus at character level 5");
    assert.equal(surge.action.cost.resource, "species-surge", "the cost names the feature's own record id");
    assert.deepEqual(surge.action.effects, [{ tempHp: "+3" }]);
    // speciesFeatures and featuresOf
    assert.deepEqual(speciesFeatures(stone(5)).map((x) => x.key), ["darkvision", "stone-blood", "deep-toughness", "surge", "old-craft", "old-craft", "granite-skin"]);
    assert.equal(featuresOf(stone(5))[0].f.id, "species-darkvision");
    assert.equal(speciesOf(stone(5)).id, "stonefolk");
  });
});

test("a flat amount with a modifier added bakes to one number: \"+5\", not \"+3+2\"", () => {
  const sp = structuredClone(stonefolk);
  sp.features[3].grants.action.effects = [{ tempHp: { prof: 1 }, addMod: "con" }];
  assert.deepEqual(lintPack({ pack: PACK.pack, species: [sp] }), []);
  CONTENT.species.stonefolk = sp;
  try {
    const r = derive(stone(5)).record;
    assert.deepEqual(feat(r, "species-surge").action.effects, [{ tempHp: "+5" }], "3 (Proficiency Bonus) + 2 (Constitution)");
    assert.deepEqual(lintRecord(r), []);
  } finally { delete CONTENT.species.stonefolk; }
});

test("the lineage's features come at their character level, and the Proficiency Bonus and per-level numbers go by the character's level, across classes", () => {
  withSpecies(() => {
    const at2 = derive(stone(2)).record;
    assert.equal(feat(at2, "species-granite-granite-skin"), undefined, "not before level 3");
    assert.deepEqual(at2.resist, ["poison"]);
    const basalt = derive(stone(5, "basalt")).record;
    assert.deepEqual(basalt.senses, { darkvision: 120 }, "the larger range wins");
    assert.deepEqual(feat(basalt, "species-basalt-basalt-burst").uses, { max: 1, recharge: "long" });
    assert.equal(feat(basalt, "species-basalt-basalt-burst").action.cost.resource, "species-basalt-basalt-burst");
    assert.equal(feat(derive(stone(4, "basalt")).record, "species-basalt-basalt-burst"), undefined);
    // A fighter 3 / rogue 2 is character level 5.
    const multi = { name: "Brann", classes: [{ class: "fighter", level: 3, subclass: "champion" }, { class: "rogue", level: 2 }], abilities: { ...A, dex: 14 }, skills: ["athletics", "perception", "stealth"],
      expertise: [], choices: { "fighting-style": "defense" }, armour: "chain-mail", weapons: ["longsword"], species: { id: "stonefolk", lineage: "basalt", choices: { "old-craft": "patience" } } };
    assert.deepEqual(validate(multi), []);
    const m = derive(multi).record;
    assert.deepEqual(feat(m, "species-surge").uses, { max: 3, recharge: "short" });
    assert.ok(feat(m, "species-basalt-basalt-burst"), "level 5 by the sum of the class levels");
    assert.ok(derive(multi).why.hp.includes("Deep Toughness +5"));
  });
});

test("a species that is not a Humanoid gives the record and the creature its type; the size is one of the species' sizes", () => {
  withSpecies(() => {
    const kin = (more = {}) => fighter(1, { species: { id: "glimmerkin", ability: "wis" }, ...more });
    assert.deepEqual(validate(kin()), []);
    const { record: r, why } = derive(kin());
    assert.equal(r.type, "fey");
    assert.equal(r.size, "small", "the first of its sizes");
    assert.equal(derive(kin({ size: "medium" })).record.size, "medium");
    assert.deepEqual(why.species, ["Glimmerkin", "Small, Speed 30 ft", "Creature type: Fey", "Spellcasting ability for its spells: Wisdom"]);
    assert.deepEqual(lintRecord(r), []);
    assert.equal(creatureType(makeEntity(r, { id: "k", kind: "pc", side: "party" })), "fey");
    // In a game: made with it, and remade as a Humanoid without it.
    const s = newGame(3);
    const id = ok(apply(s, { type: "setSheet", sheet: kin() }, DM)).events.find((e) => e.type === "spawned").id;
    assert.equal(s.entities[id].type, "fey");
    assert.equal(creatureType(s.entities[id]), "fey");
    ok(apply(s, { type: "setSheet", actor: id, sheet: fighter(1, { name: "Brann" }) }, DM));
    assert.equal(s.entities[id].type, undefined);
    assert.equal(creatureType(s.entities[id]), "humanoid");
  });
  assert.match(lintRecord({ ...derive(fighter(1)).record, type: "humanoid" }).join(), /Its creature type is one of .*or left out for a Humanoid/);
  assert.match(lintRecord({ ...derive(fighter(1)).record, type: "robot" }).join(), /Its creature type is one of/);
});

// ---------- validate ----------
test("validate: the species' sentences", () => {
  withSpecies(() => {
    const v = (sp, more = {}) => validate(fighter(3, { species: sp, ...more }));
    assert.deepEqual(v({ id: "stonefolk", lineage: "granite", choices: { "old-craft": "lore" } }), []);
    assert.ok(v({ id: "stonefolk", choices: { "old-craft": "lore" } }).includes("Choose the Stone Line of the Stonefolk: Granite, Basalt."));
    assert.ok(v({ id: "stonefolk", lineage: "marble", choices: { "old-craft": "lore" } }).includes('The Stonefolk\'s Stone Line is one of Granite, Basalt; "marble" is not.'));
    assert.ok(v({ id: "stonefolk", lineage: "granite" }).includes("Choose an option for Old Craft: Lore, Patience."));
    assert.ok(v({ id: "stonefolk", lineage: "granite", choices: { "old-craft": "luck" } }).includes('Old Craft has no option "luck".'));
    assert.ok(v({ id: "stonefolk", lineage: "granite", choices: { "old-craft": "lore", "surge": "x" } }).includes('The Stonefolk (Granite) has no feature "surge" with options to choose.'));
    assert.ok(v({ id: "stonefolk", lineage: "granite", choices: { "old-craft": 3 } }).includes("Its species' choices name options."));
    assert.ok(v({ id: "stonefolk", lineage: "granite", ability: "int", choices: { "old-craft": "lore" } }).includes("The Stonefolk has no spellcasting ability to choose."));
    assert.ok(v({ id: "glimmerkin" }).includes("Choose the ability the Glimmerkin's spells use: Intelligence, Wisdom, Charisma."));
    assert.ok(v({ id: "glimmerkin", ability: "str" }).includes('The Glimmerkin\'s spells use Intelligence, Wisdom, Charisma; "str" is not one of them.'));
    assert.ok(v({ id: "glimmerkin", ability: "wis", lineage: "x" }).includes("The Glimmerkin has no lineage to choose."));
    // The size and the Speed.
    assert.ok(v({ id: "stonefolk", lineage: "granite", choices: { "old-craft": "lore" } }, { size: "small" }).includes("A Stonefolk is Medium."));
    assert.ok(v({ id: "stonefolk", lineage: "granite", choices: { "old-craft": "lore" } }, { speed: 30 }).includes("Speed comes from the species: a Stonefolk has 25 ft. Take the sheet's own Speed out."));
    // The shape, an unknown id, and a homebrew id of the wrong shape.
    assert.ok(v("stonefolk").includes("Its species is { id, lineage?, ability?, choices? }: the species, its lineage, the ability its spells use, and its features' choices."));
    assert.ok(v({ id: "stonefolk", lineage: "granite", spells: [] }).some((p) => p.startsWith("Its species is { id")));
    assert.ok(v({ id: "dwarf" }).includes("There is no species \"dwarf\" in the game: choose Stonefolk (stonefolk), Glimmerkin (glimmerkin)."));
    assert.ok(v({ id: "hb-Bad" }).some((p) => p.startsWith("Its species is not the id of a homebrew species")));
  });
  assert.ok(validate(fighter(1, { species: { id: "dwarf" } })).includes('There is no species "dwarf" in the game (no species is entered yet).'));
  // Without a species, as before.
  assert.ok(validate(fighter(1, { size: "large" })).includes("Its size is Small or Medium."));
  assert.deepEqual(validate(fighter(1, { speed: 35, size: "small" })), []);
});

// ---------- in play ----------
function field(sheet) {
  const s = newGame(11);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  const id = ok(apply(s, { type: "setSheet", sheet, at: { q: 0, r: 0, z: 0 } }, DM)).events.find((e) => e.type === "spawned").id;
  s.entities.foe = makeEntity(derive(fighter(1, { name: "Foe" })).record, { id: "foe", kind: "npc", side: "foe", pos: { q: 3, r: 0, z: 0 } });
  return { s, id };
}
test("in play: the Bonus Action spends its uses and Dashes, Resistance halves Poison, the save Advantage holds against Poisoned only", () => {
  withSpecies(() => {
    const { s, id } = field(stone(5));
    const e = s.entities[id];
    assert.equal(e.uses["species-surge"], 3);
    ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
    for (let i = 0; i < 6 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    assert.equal(current(s), id);
    const move = s.encounter.budget.move;
    ok(apply(s, { type: "feature", actor: id, feature: "species-surge" }, DM));
    assert.equal(s.entities[id].uses["species-surge"], 2);
    assert.equal(s.entities[id].tempHp, 3);
    assert.equal(s.encounter.budget.move, move + 25, "a Dash of its Speed");
    no(apply(s, { type: "feature", actor: id, feature: "species-surge" }, DM), /Bonus Action/);
    // Resistance: 10 Poison is 5; Advantage on a save against Poisoned, not on another Constitution save.
    const hp = s.entities[id].hp;
    ok(apply(s, { type: "harm", actor: id, amount: 13, dtype: "poison" }, DM));
    assert.equal(s.entities[id].hp, hp - (6 - 3), "13 halved is 6, after 3 Temporary Hit Points");
    assert.deepEqual(modifiers(s, s.entities[id], "save", { ability: "con", conditions: ["poisoned"] }).advantage, ["Stone Blood"]);
    assert.deepEqual(modifiers(s, s.entities[id], "save", { ability: "con", conditions: ["frightened"] }).advantage, []);
    assert.deepEqual(modifiers(s, s.entities[id], "save.int", { ability: "int" }).advantage, ["Lore"]);
  });
});

test("the uses spent stay spent when the character is made again from its sheet, and come back on a Short Rest", () => {
  withSpecies(() => {
    const { s, id } = field(stone(5));
    s.entities[id].uses["species-surge"] = 1;
    ok(apply(s, { type: "refresh", actor: id }, DM));
    assert.equal(s.entities[id].uses["species-surge"], 1);
    ok(apply(s, { type: "setSheet", actor: id, sheet: stone(6) }, DM));
    assert.equal(s.entities[id].uses["species-surge"], 1, "the same maximum at level 6");
    ok(apply(s, { type: "shortRest" }, DM));
    assert.equal(s.entities[id].uses["species-surge"], 3, "recharge: short");
  });
});

// ---------- a species whose entry is not loaded ----------
test("a species that is not loaded: the sheet keeps the id, there are no traits, `why.species` and a DM-only event say so", () => {
  const sheet = fighter(5, { species: { id: GONE, lineage: "cinder", choices: { anything: "x" } }, speed: 35 });
  assert.deepEqual(validate(sheet), [], "the character must still load; nothing in it is checked against a species it cannot see");
  const { record: r, why, missing } = derive(sheet);
  assert.deepEqual(missing, [{ kind: "species", id: GONE }]);
  assert.deepEqual(missingSpeciesOf(sheet), [{ kind: "species", id: GONE }]);
  assert.deepEqual(missingOf(sheet), [], "missingOf stays about subclasses");
  assert.deepEqual(why.species, [`Species "${GONE}": its entry is not loaded at this table, so it gives no traits.`]);
  assert.ok(!r.feats.some((f) => f.id.startsWith("species-")));
  assert.equal(r.speed, 35, "the sheet's own Speed stands");
  assert.equal(r.senses, undefined);
  const s = newGame(5);
  const made = ok(apply(s, { type: "setSheet", sheet }, DM)), id = made.events.find((e) => e.type === "spawned").id;
  const told = made.events.filter((e) => e.type === "manual");
  assert.deepEqual(told, [{ type: "manual", actor: id, name: "Brann", partial: true, text: `Brann: its species "${GONE}" is not loaded at this table, so it has none of its species traits until its pack is added again.` }]);
  assert.deepEqual(s.entities[id].sheet.species.id, GONE, "the id is kept");
  assert.ok(!viewEvents(made.events, s, { role: "player", userId: "pat" }).some((e) => e.type === "manual"), "a player is not sent the event");
  // Every making of it from its sheet tells the DM again.
  assert.equal(ok(apply(s, { type: "refresh", actor: id }, DM)).events.filter((e) => e.type === "manual" && /species/.test(e.text)).length, 1);
  // With its entry loaded (here under a plain id standing in for the pack's), the traits come.
  const back = { ...stonefolk, id: GONE };
  CONTENT.species[GONE] = back;
  try {
    const sh = fighter(5, { species: { id: GONE, lineage: "granite", choices: { "old-craft": "lore" } } });
    assert.deepEqual(validate(sh), []);
    ok(apply(s, { type: "setSheet", actor: id, sheet: sh }, DM));
    assert.deepEqual(s.entities[id].resist, ["poison", "bludgeoning"]);
    assert.equal(s.entities[id].speed, 25);
  } finally { delete CONTENT.species[GONE]; }
});

test("a sheet without a species derives as before, and nothing is entered in the SRD yet", () => {
  assert.deepEqual(Object.keys(CONTENT.species), []);
  const r = derive(fighter(5));
  assert.equal(r.why.species, undefined);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(speciesFeatures(fighter(5)), []);
  assert.equal(speciesOf(fighter(5)), null);
});
