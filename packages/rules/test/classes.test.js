import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CONTENT, PACKS } from "../src/content/index.js";
import { featureCoverage, lintPack } from "../src/content/schema.js";

const [srd] = PACKS;
const C = CONTENT.classes;
const lintClass = (c) => lintPack({ pack: srd.pack, spells: srd.spells, classes: [c] });
const clone = (x) => structuredClone(x);

test("twelve classes, each with its SRD subclass, all checked and linted", () => {
  assert.deepEqual(Object.keys(C).sort(), ["barbarian", "bard", "cleric", "druid", "fighter", "monk", "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard"]);
  assert.deepEqual(Object.fromEntries(Object.values(C).map((c) => [c.id, c.subclass.id])), {
    barbarian: "berserker", bard: "lore", cleric: "life", druid: "land", fighter: "champion", monk: "open-hand",
    paladin: "devotion", ranger: "hunter", rogue: "thief", sorcerer: "draconic", warlock: "fiend", wizard: "evoker" });
  for (const c of Object.values(C)) assert.equal(c.checked, true, c.id);
  assert.deepEqual(lintPack(srd), []);
  const cov = featureCoverage(srd.classes);
  for (const [id, row] of Object.entries(cov)) assert.equal(row.unchecked, 0, id);
});

test("class files are data only: no imports, no functions", () => {
  const dir = fileURLToPath(new URL("../src/content/srd52/classes/", import.meta.url));
  const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
  assert.equal(files.length, 12);
  for (const f of [...files.map((x) => dir + x), fileURLToPath(new URL("../src/content/srd52/equipment.js", import.meta.url))]) {
    const code = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "").replace(/"(?:[^"\\]|\\.)*"/g, '""');
    for (const banned of [/\bimport\b/, /\bfunction\b/, /=>/, /\brequire\b/, /\bnew\b/, /`/]) assert.equal(banned.test(code), false, `${f} contains ${banned}`);
  }
});

test("class tables match the SRD's", () => {
  const row = (c, k) => C[c].table[k];
  assert.deepEqual(row("barbarian", "rages"), [2, 2, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 6, 6, 6, 6]);
  assert.deepEqual(row("barbarian", "rage-damage"), [2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4]);
  assert.deepEqual(row("rogue", "sneak-attack").filter((_, i) => i % 2 === 0), ["1d6", "2d6", "3d6", "4d6", "5d6", "6d6", "7d6", "8d6", "9d6", "10d6"]);
  assert.deepEqual(row("fighter", "second-wind"), [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
  assert.deepEqual(row("monk", "martial-arts")[16], "1d12");
  assert.deepEqual(row("monk", "unarmored-movement")[17], 30);
  assert.deepEqual(C.wizard.casting.prepared.at(-1), 25);
  assert.deepEqual(C.wizard.casting.slots[19], [4, 3, 3, 3, 3, 2, 2, 1, 1]);
  assert.deepEqual(C.cleric.casting.slots[4], [4, 3, 2]);
  assert.deepEqual(C.paladin.casting.slots[19], [4, 3, 3, 3, 2]);
  assert.deepEqual(C.ranger.casting.slots[0], [2]);
  assert.deepEqual(C.warlock.casting.slots, [1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4]);
  assert.deepEqual(C.warlock.casting.slotLevel.slice(0, 10), [1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  assert.deepEqual(C.sorcerer.casting.cantrips.slice(0, 4), [4, 4, 4, 5]);
  assert.deepEqual(Object.fromEntries(Object.values(C).map((c) => [c.id, c.hitDie])), { barbarian: 12, bard: 8, cleric: 8, druid: 8, fighter: 10, monk: 8, paladin: 10, ranger: 10, rogue: 8, sorcerer: 6, warlock: 8, wizard: 6 });
  assert.deepEqual(C.rogue.skills.choose, 4);
  assert.deepEqual(C.ranger.saves, ["str", "dex"]);
});

test("equipment tables match the SRD's", () => {
  const W = CONTENT.weapons, A = CONTENT.armour;
  assert.equal(srd.weapons.length, 38); assert.equal(srd.armour.length, 13);
  assert.deepEqual([W.longsword.damage, W.longsword.versatile, W.longsword.mastery], ["1d8", "1d10", "sap"]);
  assert.deepEqual([W.longbow.range, W.longbow.properties], [[150, 600], ["ammunition", "heavy", "two-handed"]]);
  assert.deepEqual([A["chain-mail"].ac, A["chain-mail"].strength, A["chain-mail"].dex], [16, 13, undefined]);
  assert.deepEqual([A["half-plate-armor"].ac, A["half-plate-armor"].dex], [15, 2]);
});

test("the linter catches broken classes", () => {
  const cases = [
    [(c) => { c.hitDie = 7; }, /hitDie/],
    [(c) => { c.features[0].grants = { flying: true }; }, /not something a feature can grant/],
    [(c) => { c.features.find((f) => f.id === "action-surge").uses.max = { column: "nope" }; }, /no column "nope"/],
    [(c) => { c.features.find((f) => f.id === "tactical-shift").tier = "auto"; }, /marked auto but grants nothing/],
    [(c) => { c.features.find((f) => f.id === "second-wind").grants.action.cost = { resource: "rage" }; }, /not a feature with uses/],
    [(c) => { c.table["second-wind"].pop(); }, /20 entries/],
    [(c) => { c.features.push(clone(c.features[0])); }, /used once/],
    [(c) => { c.features.find((f) => f.id === "extra-attack").grants.spells = ["wish-for-more-wishes"]; }, /not in the pack/],
  ];
  for (const [change, want] of cases) { const c = clone(C.fighter); change(c); assert.match(lintClass(c).join("\n"), want); }
  assert.deepEqual(lintClass(clone(C.fighter)), []);
});
