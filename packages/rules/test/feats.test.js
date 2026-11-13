// Feats (SRD 5.2.1 "Feats", #189): the pack's feats, the places a sheet has for one, their prerequisites
// and choices, and what each feat the engine runs does through apply().
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, featChoices, featSlots, validate } from "../src/derive.js";
import { importFgxml } from "../src/import-fgxml.js";
import { CONTENT, PACKS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); };
const srd = PACKS[0];
const A = { str: 15, dex: 14, con: 14, int: 12, wis: 10, cha: 8 };
const fighter = (level, feats, more = {}) => ({ name: "Brenna", class: "fighter", level, ...(level >= 3 ? { subclass: "champion" } : {}), abilities: A,
  skills: ["athletics", "perception"], choices: { "fighting-style": "defense", ...(level >= 7 ? { "additional-fighting-style": "archery" } : {}) },
  armour: "chain-mail", weapons: ["longsword", "longbow"], ...(feats ? { feats } : {}), ...more });
const wizard = (level, feats, more = {}) => ({ name: "Tavin", class: "wizard", level, ...(level >= 3 ? { subclass: "evoker" } : {}), abilities: { ...A, int: 16, str: 8 },
  skills: ["arcana", "history"], weapons: ["dagger"], spells: ["fire-bolt", "magic-missile"], ...(feats ? { feats } : {}), ...more });
const problems = (sheet) => validate(sheet).join("\n");

function field(sheet) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (!["m1"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  ok(apply(s, { type: "place", actor: "m1", to: { q: 3, r: 0 } }, DM));
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 200;
  return s;
}

test("the pack holds exactly the SRD's feats, by category, each checked and linted", () => {
  const by = (c) => srd.feats.filter((f) => f.category === c).map((f) => f.name);
  assert.deepEqual(by("origin"), ["Alert", "Magic Initiate", "Savage Attacker", "Skilled"]);
  assert.deepEqual(by("general"), ["Ability Score Improvement", "Grappler"]);
  assert.deepEqual(by("fighting-style"), ["Archery", "Defense", "Great Weapon Fighting", "Two-Weapon Fighting"]);
  assert.deepEqual(by("epic-boon"), ["Boon of Combat Prowess", "Boon of Dimensional Travel", "Boon of Fate", "Boon of Irresistible Offense", "Boon of Spell Recall", "Boon of the Night Spirit", "Boon of Truesight"]);
  assert.ok(srd.feats.every((f) => f.checked));
  assert.deepEqual(lintPack(srd), []);
  // Numbers compared with the SRD text.
  const F = CONTENT.feats;
  assert.deepEqual(F["ability-score-improvement"].increase, { from: ["str", "dex", "con", "int", "wis", "cha"], points: 2, max: 20 });
  assert.deepEqual(F.grappler.prerequisite, { level: 4, abilities: { any: ["str", "dex"], min: 13 } });
  assert.deepEqual(F["boon-of-spell-recall"].increase.from, ["int", "wis", "cha"]);
  assert.ok(srd.feats.filter((f) => f.category === "epic-boon").every((f) => f.prerequisite.level === 19 && f.increase.max === 30 && f.increase.points === 1));
  assert.deepEqual(srd.feats.filter((f) => f.repeatable).map((f) => f.id), ["magic-initiate", "skilled", "ability-score-improvement"]);
});

test("the linter refuses a broken feat, and a Fighting Style option that does not match its feat", () => {
  const withFeat = (change) => { const f = structuredClone(CONTENT.feats.grappler); change(f); return lintPack({ ...srd, feats: [f] }).join("\n"); };
  assert.match(withFeat((f) => { f.category = "heroic"; }), /category is one of/);
  assert.match(withFeat((f) => { f.increase.max = 25; }), /increase is/);
  assert.match(withFeat((f) => { f.prerequisite.feature = "rage"; }), /prerequisite.feature/);
  assert.match(withFeat((f) => { f.repeatable = "list"; }), /repeatable is true, or "list"/);
  assert.match(withFeat((f) => { f.tier = "manual"; }), /marked manual but gives something/);
  assert.match(withFeat((f) => { f.grants = { flying: true }; }), /not something a feature can grant/);
  assert.match(withFeat((f) => { f.grants = { modifiers: [{ on: "initiative", op: "add", value: { prof: 3 } }] }; }), /prof is how many times/);
  const cls = structuredClone(CONTENT.classes.fighter);
  cls.features.find((f) => f.id === "fighting-style").options[0].tier = "manual";
  assert.match(lintPack({ ...srd, classes: [cls] }).join("\n"), /another name or tier than the feat Archery/);
});

test("a sheet with no feats derives exactly as before; places for a feat follow the class levels", () => {
  const plain = fighter(8), none = derive(plain).record;
  assert.deepEqual(derive({ ...plain, feats: [] }).record, none);
  assert.deepEqual(none.abil, A, "the scores typed in stand");
  assert.deepEqual(featSlots(fighter(8)).map((x) => x.at), ["background", "species", "ability-score-improvement-4", "ability-score-improvement-6", "ability-score-improvement-8"]);
  assert.deepEqual(featSlots(fighter(19)).map((x) => x.at).slice(-2), ["ability-score-improvement-16", "epic-boon"]);
  const multi = { ...wizard(1), classes: [{ class: "wizard", level: 4, spells: ["fire-bolt"] }, { class: "fighter", level: 4 }], class: undefined, level: undefined, spells: undefined };
  delete multi.class; delete multi.level; delete multi.spells;
  assert.deepEqual(featSlots(multi).map((x) => x.at).slice(2), ["ability-score-improvement-4", "fighter-ability-score-improvement-4"]);
});

test("Ability Score Improvement: +2 to one score or +1 to two, never above 20, from level 4", () => {
  const r = derive(fighter(4, [{ id: "ability-score-improvement", at: "ability-score-improvement-4", abilities: { str: 2 } }])).record;
  assert.equal(r.abil.str, 17);
  assert.equal(r.attacks.find((a) => a.id === "longsword").bonus, 3 + 2, "Strength 17: +3, and the Proficiency Bonus");
  assert.deepEqual(derive(fighter(4, [{ id: "ability-score-improvement", at: "ability-score-improvement-4", abilities: { str: 1, con: 1 } }])).record.abil.con, 15);
  assert.equal(problems(fighter(4, [{ id: "ability-score-improvement", at: "ability-score-improvement-4", abilities: { str: 2 } }])), "");
  assert.match(problems(fighter(4, [{ id: "ability-score-improvement", at: "ability-score-improvement-4", abilities: { str: 3 } }])), /\+2 to one ability score or \+1 to two/);
  assert.match(problems(fighter(4, [{ id: "ability-score-improvement", at: "ability-score-improvement-4", abilities: { str: 1, dex: 1, con: 1 } }])), /\+2 to one ability score or \+1 to two/);
  assert.match(problems(fighter(4, [{ id: "ability-score-improvement", at: "ability-score-improvement-4", abilities: { str: 2 } }], { abilities: { ...A, str: 19 } })), /can't raise Strength above 20 \(it is 19\)/);
  // Two of them stack, in order; the second is judged against the first's result.
  const two = fighter(6, [{ id: "ability-score-improvement", at: "ability-score-improvement-4", abilities: { str: 2 } }, { id: "ability-score-improvement", at: "ability-score-improvement-6", abilities: { str: 2 } }], { abilities: { ...A, str: 17 } });
  assert.match(problems(two), /can't raise Strength above 20 \(it is 19\)/);
  assert.match(problems(fighter(4, [{ id: "ability-score-improvement", at: "background" }])), /Background: Origin feat takes an Origin feat; Ability Score Improvement is a General feat/);
  assert.match(problems(fighter(3, [{ id: "ability-score-improvement", at: "ability-score-improvement-4" }])), /not a place this character has/);
  // Left unchosen: it adds nothing, and the sheet is valid (a sheet imported from elsewhere).
  assert.equal(problems(fighter(4, [{ id: "ability-score-improvement", at: "ability-score-improvement-4" }])), "");
  assert.deepEqual(derive(fighter(4, [{ id: "ability-score-improvement", at: "ability-score-improvement-4" }])).record.abil, A);
});

test("a feat is taken once unless repeatable; prerequisites are the SRD's", () => {
  assert.match(problems(fighter(4, [{ id: "alert", at: "background" }, { id: "alert", at: "ability-score-improvement-4" }])), /Alert can be taken only once/);
  assert.equal(problems(fighter(4, [{ id: "skilled", at: "background", skills: ["stealth"] }, { id: "skilled", at: "ability-score-improvement-4", skills: ["insight"] }])), "");
  assert.match(problems(fighter(4, [{ id: "alert", at: "background" }, { id: "skilled", at: "background" }])), /Two feats are taken at Background/);
  // Grappler: Strength or Dexterity 13, judged before its own point.
  assert.equal(problems(fighter(4, [{ id: "grappler", at: "ability-score-improvement-4", abilities: { str: 1 } }])), "");
  assert.equal(derive(fighter(4, [{ id: "grappler", at: "ability-score-improvement-4", abilities: { str: 1 } }])).record.abil.str, 16);
  assert.match(problems(fighter(4, [{ id: "grappler", at: "ability-score-improvement-4" }], { abilities: { ...A, str: 12, dex: 12 } })), /Grappler needs Strength or Dexterity of 13 or more/);
  assert.match(problems(fighter(4, [{ id: "grappler", at: "ability-score-improvement-4", abilities: { con: 1 } }])), /Grappler raises Strength or Dexterity/);
  // Fighting Style feats need a Fighting Style feature, and are not taken twice.
  assert.match(problems(wizard(4, [{ id: "archery", at: "ability-score-improvement-4" }])), /Archery needs the Fighting Style feature/);
  assert.match(problems(fighter(4, [{ id: "defense", at: "ability-score-improvement-4" }])), /Defense is already this character's Fighting Style/);
  assert.equal(problems(fighter(4, [{ id: "archery", at: "ability-score-improvement-4" }])), "");
  // Epic Boons: level 19, and Spell Recall a Spellcasting feature.
  assert.match(problems(fighter(16, [{ id: "boon-of-fate", at: "ability-score-improvement-16" }])), /Boon of Fate needs level 19; Ability Score Improvement \(level 16\) comes at level 16/);
  assert.match(problems(fighter(19, [{ id: "boon-of-spell-recall", at: "epic-boon" }])), /needs the Spellcasting feature/);
  assert.equal(problems(wizard(19, [{ id: "boon-of-spell-recall", at: "epic-boon", abilities: { int: 1 } }])), "");
  assert.match(problems(fighter(4, [{ id: "no-such-feat", at: "background" }])), /no feat "no-such-feat"/);
  assert.match(problems(fighter(4, [{ id: "alert", at: "background", colour: "red" }])), /A feat is \{ id, at \}/);
});

test("an Epic Boon raises a score past 20, to 30; Boon of Truesight gives Truesight 60 ft", () => {
  const sheet = fighter(19, [{ id: "ability-score-improvement", at: "ability-score-improvement-16", abilities: { str: 2 } }, { id: "boon-of-truesight", at: "epic-boon", abilities: { str: 1 } }], { abilities: { ...A, str: 18 } });
  assert.equal(problems(sheet), "");
  const r = derive(sheet).record;
  assert.equal(r.abil.str, 21);
  assert.equal(r.senses.truesight, 60);
  assert.ok(derive(sheet).why.abil.some((w) => /Boon of Truesight: Str \+1/.test(w)));
  assert.match(problems(fighter(19, [{ id: "boon-of-truesight", at: "epic-boon", abilities: { str: 1 } }], { abilities: { ...A, str: 30 } })), /each 1 to 20/);
});

test("Skilled: three skills or tools, ones not already had; Expertise may build on them", () => {
  const sheet = fighter(1, [{ id: "skilled", at: "background", skills: ["stealth", "insight"], tools: ["thieves-tools"] }]);
  assert.equal(problems(sheet), "");
  const r = derive(sheet).record;
  assert.ok(r.skills.includes("stealth") && r.skills.includes("insight") && r.tools.includes("thieves-tools"));
  assert.match(problems(fighter(1, [{ id: "skilled", at: "background", skills: ["stealth", "insight", "arcana", "history"] }])), /gives 3 skills or tools; 4 chosen/);
  assert.match(problems(fighter(1, [{ id: "skilled", at: "background", skills: ["athletics"] }])), /already proficient in Athletics/);
  assert.match(problems(fighter(1, [{ id: "alert", at: "background", skills: ["stealth"] }])), /Alert gives no skills or tools/);
});

test("Alert adds the Proficiency Bonus to Initiative, through apply()", () => {
  const roll = (feats) => {
    const s = field(fighter(5, feats)); s.rng = 4242;
    ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
    return s.encounter.order.find((o) => o.id === "hero").init;
  };
  assert.equal(roll([{ id: "alert", at: "background" }]) - roll(undefined), 3, "level 5: +3");
  assert.deepEqual(derive(fighter(5, [{ id: "alert", at: "background" }])).record.feats.find((f) => f.id === "feat-alert").modifiers, [{ on: "initiative", op: "add", value: 3 }]);
});

test("Fighting Style feats: Defense taken at an Ability Score Improvement adds 1 AC in armour; the class's choice works as before", () => {
  const plain = derive(fighter(4)).record.ac;
  const s = field(fighter(4, [{ id: "archery", at: "ability-score-improvement-4" }]));
  const shot = s.entities.hero.attacks.find((a) => a.id === "longbow").bonus;
  assert.equal(shot, derive(fighter(4)).record.attacks.find((a) => a.id === "longbow").bonus + 2, "Archery +2");
  assert.equal(plain, 16 + 1, "chain mail 16, Defense +1 from the class's Fighting Style");
  const champion = derive(fighter(7)).record;
  assert.ok(champion.feats.some((f) => f.id === "additional-fighting-style-archery" && f.tier === "auto"));
});

test("Magic Initiate: a non-caster casts its cantrip and, once per Long Rest, its level 1 spell with no slot", () => {
  const mi = { id: "magic-initiate", at: "background", list: "wizard", ability: "int", spells: ["fire-bolt", "light", "magic-missile"] };
  assert.equal(problems(fighter(1, [mi])), "");
  const r = derive(fighter(1, [mi])).record;
  assert.deepEqual([r.castAbil, r.spells], ["int", ["fire-bolt", "light", "magic-missile"]]);
  assert.deepEqual(r.slots, {});
  const s = field(fighter(1, [mi])), e = s.entities.hero;
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  for (let i = 0; i < 20 && current(s) !== "hero"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  ok(apply(s, { type: "cast", actor: "hero", spell: "fire-bolt", target: "m1" }, DM));
  no(apply(s, { type: "cast", actor: "hero", spell: "magic-missile", target: "m1" }, DM), /no level 1 spell slots|needs a spell slot/);
  s.encounter.budget.action = 1;
  const hp = s.entities.m1.hp;
  ok(apply(s, { type: "cast", actor: "hero", spell: "magic-missile", target: "m1", via: "feat-magic-initiate" }, DM));
  assert.ok(s.entities.m1.hp < hp);
  assert.equal(e.uses["feat-magic-initiate"], 0);
  s.encounter.budget.action = 1;
  no(apply(s, { type: "cast", actor: "hero", spell: "magic-missile", target: "m1", via: "feat-magic-initiate" }, DM), /no uses of Magic Initiate/);
  // Choices: the list's spells only, two cantrips and one level 1 spell, and a different list when taken again.
  assert.match(problems(fighter(1, [{ ...mi, spells: ["cure-wounds"] }])), /Cure Wounds is not on the Wizard spell list/);
  assert.match(problems(fighter(1, [{ ...mi, spells: ["fire-bolt", "light", "mage-hand"] }])), /gives 2 cantrips and 1 level 1 spell/);
  assert.match(problems(fighter(1, [{ ...mi, list: "bard" }])), /takes its spells from the Cleric, Druid, Wizard list/);
  assert.match(problems(fighter(4, [mi, { ...mi, at: "ability-score-improvement-4", spells: ["mage-hand"] }])), /taken again only with another spell list/);
  assert.equal(problems(fighter(4, [mi, { id: "magic-initiate", at: "ability-score-improvement-4", list: "cleric", ability: "wis", spells: ["guidance"] }])), "");
  // A wizard's own spell taught again by the feat is cast with the better ability.
  const w = derive(wizard(1, [{ ...mi, ability: "cha" }])).record;
  assert.equal(w.castAbil, "int");
  assert.equal(w.spellAbil?.["fire-bolt"], undefined, "Intelligence 16 beats Charisma 8");
  assert.equal(w.spellAbil?.light, "cha");
});

test("levelUp takes the new place's feat; a refused feat changes nothing", () => {
  const s = newGame(3);
  const id = ok(apply(s, { type: "setSheet", sheet: fighter(3) }, DM)).events.find((x) => x.type === "spawned").id;
  const before = structuredClone(s.entities[id]);
  no(apply(s, { type: "levelUp", actor: id, sheet: fighter(4, [{ id: "boon-of-fate", at: "ability-score-improvement-4" }]) }, DM), /Boon of Fate needs level 19/);
  no(apply(s, { type: "levelUp", actor: id, sheet: fighter(4, [{ id: "ability-score-improvement", at: "ability-score-improvement-4", abilities: { str: 6 } }]) }, DM), /\+2 to one/);
  assert.deepEqual(s.entities[id], before, "a rejected level-up changes nothing");
  ok(apply(s, { type: "levelUp", actor: id, sheet: fighter(4, [{ id: "ability-score-improvement", at: "ability-score-improvement-4", abilities: { str: 1, con: 1 } }]) }, DM));
  const e = s.entities[id];
  assert.deepEqual([e.abil.str, e.abil.con], [16, 15]);
  assert.ok(e.feats.some((f) => f.id === "feat-ability-score-improvement"));
  assert.equal(e.sheet.feats.length, 1);
  // Built from class at level 1 with an Origin feat.
  const id2 = ok(apply(s, { type: "setSheet", sheet: fighter(1, [{ id: "alert", at: "background" }]) }, DM)).events.find((x) => x.type === "spawned").id;
  assert.ok(s.entities[id2].feats.some((f) => f.id === "feat-alert"));
});

test("featChoices offers, for each place, the feats the character could take there and what is left to choose", () => {
  const ch = featChoices(fighter(4, [{ id: "skilled", at: "background" }]));
  const bg = ch.find((x) => x.at === "background"), asi = ch.find((x) => x.at === "ability-score-improvement-4");
  assert.deepEqual(bg.offer, ["alert", "magic-initiate", "savage-attacker", "skilled"], "Origin feats only");
  assert.deepEqual([bg.taken.id, bg.open], ["skilled", ["skills"]]);
  assert.ok(asi.offer.includes("ability-score-improvement") && asi.offer.includes("grappler") && asi.offer.includes("archery"));
  assert.ok(!asi.offer.includes("defense"), "already the Fighting Style");
  assert.ok(!asi.offer.includes("boon-of-fate"), "level 19");
  assert.equal(asi.taken, null);
});

test("the importer puts an SRD feat on the sheet by name and flags a 5.2 version; others stay notes", () => {
  const xml = readFileSync(new URL("./fixtures/fgxml-cleric.xml", import.meta.url), "utf8");
  const { character, report } = importFgxml(xml);
  assert.deepEqual(character.feats, [{ id: "alert", at: "background" }]);
  assert.equal(report.feats.find((f) => f.name === "Alert").feat, "alert");
  assert.ok(report.ruleDifferences.some((d) => d.name === "Alert" && /^5\.2 version/.test(d.why)));
  assert.match(report.feats.find((f) => f.name === "Sparkly Footwork").why, /not in SRD 5\.2/);
  assert.deepEqual(validate(character), []);
  // A score over 20 is reported, not passed off as derived.
  const high = importFgxml(xml.replace(/(<wisdom>\s*<score type="number">)\d+/, "$123")).report;
  assert.ok(high.adjustments.some((a) => a.what === "WIS score" && a.from === "23" && /Epic Boon/.test(a.why)), JSON.stringify(high.adjustments));
});
