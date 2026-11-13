// The Fantasy Grounds character importer (issue #142). The fixtures are made up for the test, in the format's shape;
// they hold only SRD names and invented ones. The words SENTINEL-... in them stand for descriptive text, which must never come out.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import { characterName, importFgxml, parseXml } from "../src/import-fgxml.js";
import { newGame } from "../src/scenario.js";
import { derive, validate } from "../src/derive.js";

const DM = { role: "dm", userId: "dm" };
const fixture = (n) => readFileSync(new URL(`./fixtures/fgxml-${n}.xml`, import.meta.url), "utf8");
const names = (list) => list.map((x) => x.name);

test("a single-class caster imports as a sheet the engine loads", () => {
  const { character, report } = importFgxml(fixture("cleric"));
  assert.equal(report.ok, true);
  assert.equal(report.loadable, true, report.problems.join("; "));
  assert.deepEqual(validate(character), []);
  assert.deepEqual([character.class, character.level, character.subclass, character.armour, character.shield, character.weapons], ["cleric", 5, "life", "chain-mail", true, ["mace"]]);
  assert.deepEqual(character.abilities, { str: 14, dex: 10, con: 14, int: 10, wis: 16, cha: 12 });
  assert.deepEqual([...character.skills, ...character.extraSkills].sort(), ["history", "insight", "medicine", "religion"]);
  assert.deepEqual(character.senses, { darkvision: 60 });
  // Oath and domain spells the subclass always has are not listed twice; Fireball is not a Cleric spell; Mirror Shard is invented.
  assert.deepEqual(character.spells.sort(), ["guidance", "sacred-flame", "spiritual-weapon"]);
  assert.deepEqual(names(report.spells).sort(), ["Fireball", "Mirror Shard"]);
  const r = derive(character).record;
  assert.equal(r.hp, 38);
  assert.deepEqual(report.numbers.map((n) => [n.what, n.sheet, n.engine]), [["Hit Points", 40, 38]]);
  assert.deepEqual(report.languages, ["Common", "Dwarvish"]);
  assert.deepEqual([report.state.hpCurrent, report.state.slotsUsed], [33, { 1: 1 }]);
  // The engine takes it as it is.
  const s = newGame(7);
  const res = apply(s, { type: "setSheet", sheet: character }, DM);
  assert.ok(res.ok, res.error);
  const e = Object.values(s.entities).find((x) => x.name === "Mira Testwell");
  assert.equal(e.level, 5);
});

test("a stand-in is listed when a sheet needs a value to load that a 2014 sheet does not have", () => {
  const { report } = importFgxml(fixture("cleric"));
  assert.deepEqual(report.adjustments.map((a) => a.what), ["Divine Order"]);
  assert.equal(report.adjustments[0].to, "Protector", "the order the sheet's heavy armour needs");
});

test("a multiclass sheet builds every SRD class, the first class taken first (#175)", () => {
  const { character, report } = importFgxml(fixture("multiclass"));
  assert.equal(report.loadable, true, report.problems.join("; "));
  assert.deepEqual(character.classes, [{ class: "fighter", level: 3, subclass: "champion" }, { class: "wizard", level: 2, spells: ["magic-missile", "shield"] }]);
  assert.equal(character.class, undefined);
  assert.deepEqual(report.multiclass, [], "nothing left unbuilt");
  assert.ok(!report.ruleDifferences.some((d) => d.name === "Total level"));
  assert.deepEqual(report.spells, [], "the wizard's spells are the wizard's");
  const gaps = Object.fromEntries(report.numbers.map((n) => [n.what, [n.sheet, n.engine]]));
  assert.equal(gaps["Proficiency Bonus"], undefined, "+3 at level 5, as the sheet");
  assert.equal(gaps["Level 1 spell slots"], undefined, "a wizard's own slots: the only class that casts");
  // Fighter 10 + 2 at level 1, 6 + 2 at levels 2 and 3, then the Wizard's 4 + 2 twice.
  assert.deepEqual(gaps["Hit Points"], [44, 40]);
  const r = derive(character).record;
  assert.deepEqual([r.level, r.prof, r.hp, r.saveProf, r.slots, r.castAbil, r.cls], [5, 3, 40, ["str", "con"], { 1: 3 }, "int", "Fighter (Champion) 3 / Wizard 2"]);
  assert.deepEqual(report.imported.classes, [{ class: "fighter", level: 3, subclass: "champion" }, { class: "wizard", level: 2, subclass: null }]);
  assert.ok(apply(newGame(7), { type: "setSheet", sheet: character }, DM).ok);
  // Listed the other way round, the saving throws still say the Fighter came first.
  const swapped = fixture("multiclass").replace(/<id-00001><name type="string">Fighter<\/name>(.*?)<\/id-00001>\s*<id-00002><name type="string">Wizard<\/name>(.*?)<\/id-00002>/s,
    '<id-00001><name type="string">Wizard</name>$2</id-00001><id-00002><name type="string">Fighter</name>$1</id-00002>');
  assert.notEqual(swapped, fixture("multiclass"));
  assert.deepEqual(importFgxml(swapped).character.classes.map((x) => x.class), ["fighter", "wizard"]);
});

test("a multiclass sheet with a class not in the SRD builds the SRD one and reports the other", () => {
  const xml = fixture("multiclass").replace('<name type="string">Wizard</name>', '<name type="string">Artificer</name>');
  const { character, report } = importFgxml(xml);
  assert.equal(report.loadable, true, report.problems.join("; "));
  assert.deepEqual([character.class, character.level], ["fighter", 3]);
  assert.deepEqual(names(report.multiclass), ["Artificer 2"]);
  assert.ok(report.ruleDifferences.some((d) => d.name === "Total level"));
});

test("a multiclass sheet whose scores miss a class's prerequisite does not load, and says why", () => {
  const xml = fixture("multiclass").replace("<intelligence><score type=\"number\">14</score>", "<intelligence><score type=\"number\">12</score>");
  const { character, report } = importFgxml(xml);
  assert.equal(report.loadable, false);
  assert.ok(report.problems.some((p) => /Wizard and another class needs Intelligence of 13/.test(p)), report.problems.join("; "));
  assert.equal(character.classes.length, 2);
});

test("what is not in the pack is carried by name only, never with the sheet's text", () => {
  const out = importFgxml(fixture("cleric"));
  const { report } = out;
  assert.deepEqual(names(report.feats), ["Sparkly Footwork", "Alert"]);
  assert.match(report.feats[0].why, /not in SRD 5\.2/);
  assert.match(report.feats[1].why, /SRD 5\.2 feat/);
  assert.deepEqual(names(report.magicItems), ["Ring of Invented Warding"]);
  assert.deepEqual(names(report.features), ["Destroy Undead", "Invented Flourish"]);
  assert.ok(report.ruleDifferences.some((d) => d.name === "Destroy Undead" && /Sear Undead/.test(d.why)));
  const all = JSON.stringify(out);
  assert.equal(all.includes("SENTINEL"), false, "no description text, and no long name, is copied");
  assert.ok(report.gear.some((g) => /long entry/.test(g.name)));
  assert.equal(report.counts.feats, 2);
  assert.equal(report.counts.magicItems, 1);
});

test("the player's name is dropped, whether it is in brackets or in parentheses, and never kept", () => {
  assert.equal(characterName("Mira Testwell [Zed]"), "Mira Testwell");
  assert.equal(characterName("Orrin Testfield (Zed)"), "Orrin Testfield");
  assert.equal(characterName("  Plain Name "), "Plain Name");
  assert.equal(characterName("Nested [Zed] Name [Pat]"), "Nested [Zed] Name");
  const a = importFgxml(fixture("cleric")), b = importFgxml(fixture("multiclass"));
  assert.equal(a.character.name, "Mira Testwell");
  assert.equal(b.character.name, "Orrin Testfield");
  assert.equal(JSON.stringify(a).includes("Zed") || JSON.stringify(b).includes("Zed"), false);
});

test("malformed or unsuitable input gives a report with an error, never an exception", () => {
  const bad = [
    "", "   ", "not xml at all", "<root><character></root>", "<root><character><name>x</name></character>", "<root></character>", "<a/><b/>",
    "<root><character name='x></character></root>", "<!DOCTYPE root [<!ENTITY x 'y'>]><root><character/></root>", "<root><!-- open comment", "<root><![CDATA[ open",
    "<root><character><classes/></character></root>", "<root><other/></root>", '<root><character><classes><id-1><name>Artificer</name><level>3</level></id-1></classes></character></root>',
    undefined, null, 42, {}, "<root>" + "<a>".repeat(200),
  ];
  for (const x of bad) {
    const { character, report } = importFgxml(x);
    assert.equal(character, null, String(x).slice(0, 30));
    assert.equal(report.ok, false);
    assert.equal(typeof report.error, "string");
    assert.ok(report.problems.length > 0);
  }
  // The reader's own limits.
  assert.throws(() => parseXml("<a>" + "x".repeat(100) + "</a>", { chars: 50 }), /too big/);
  assert.throws(() => parseXml("<a><b><c/></b></a>", { depth: 1 }), /nested/);
  assert.equal(importFgxml("<root>" + "<a/>".repeat(10) + "</root>", { limits: { nodes: 5 } }).report.ok, false);
});

test("the reader handles entities, CDATA, comments and self-closing tags, and defines no entities", () => {
  const n = parseXml('<?xml version="1.0"?><!-- c --><r a="1 &amp; 2"><b>x &lt; y &#65;&#x42;</b><c/><d><![CDATA[<raw>]]></d><e>&bogus;</e></r>');
  assert.equal(n.attrs.a, "1 & 2");
  assert.equal(n.kids[0].text, "x < y AB");
  assert.equal(n.kids[2].text, "<raw>");
  assert.equal(n.kids[3].text, "&bogus;", "an entity that was never defined is left alone");
  assert.equal(n.kids[1].kids.length, 0);
});

test("a class the engine has no subclass for is loaded with the SRD stand-in, and says so", () => {
  const xml = fixture("cleric").replace("Life Domain", "Invented Domain");
  const { character, report } = importFgxml(xml);
  assert.equal(character.subclass, "life");
  assert.deepEqual(names(report.subclass), ["Invented Domain"]);
  assert.ok(report.adjustments.some((a) => a.what === "subclass" && /NOT this character's/.test(a.why)));
  const none = importFgxml(xml, { substituteSubclass: false });
  assert.equal(none.character.subclass, undefined);
  assert.equal(none.report.loadable, false, "without the stand-in the sheet cannot load, and the report says so");
});

test("scores above 20 and speeds the engine cannot hold are adjusted and reported", () => {
  const xml = fixture("cleric").replace('<score type="number">16</score>', '<score type="number">24</score>');
  const { character, report } = importFgxml(xml);
  assert.equal(character.abilities.wis, 20);
  assert.ok(report.adjustments.some((a) => a.what === "WIS score" && a.from === "24"));
  assert.equal(report.loadable, true);
});

test("a sheet that lists Metamagic more than once imports with each option once, and reports what it left out", () => {
  // A level 10 Sorcerer made from the cleric fixture: Metamagic three times in the features, the options in the powers,
  // one of them twice, and five options for the four places Metamagic has at level 10.
  const xml = fixture("cleric")
    .replace('<name type="string">Cleric</name>\n\t\t\t\t<level type="number">5</level>\n\t\t\t\t<specialization type="string">Life Domain</specialization>',
      '<name type="string">Sorcerer</name>\n\t\t\t\t<level type="number">10</level>\n\t\t\t\t<specialization type="string">Draconic Sorcery</specialization>')
    .replace('<level type="number">5</level>', '<level type="number">10</level>')
    .replace(/<featurelist>[\s\S]*<\/featurelist>/, '<featurelist>' + [2, 10, 10].map((l, i) => `<id-0000${i + 1}><name type="string">Metamagic</name><level type="number">${l}</level></id-0000${i + 1}>`).join('') + '</featurelist>')
    .replace(/<powers>[\s\S]*<\/powers>/, '<powers>' + ["Quickened", "Quickened", "Subtle", "Twinned", "Careful", "Distant"]
      .map((n, i) => `<id-0000${i + 1}><name type="string">Metamagic (${n} Spell)</name><group type="string">Class Features</group></id-0000${i + 1}>`).join('') + '</powers>');
  const { character, report } = importFgxml(xml);
  assert.equal(report.loadable, true, report.problems.join("; "));
  assert.deepEqual(validate(character), []);
  const picked = [...character.choices.metamagic, ...character.choices["metamagic-10"]];
  assert.equal(picked.length, 4);
  assert.equal(new Set(picked).size, 4, "no option twice");
  assert.deepEqual(names(report.features.filter((f) => /^Metamagic: /.test(f.name))), ["Metamagic: Twinned Spell"], "the fifth option is reported");
  assert.ok(apply(newGame(7), { type: "setSheet", sheet: character }, DM).ok);
  // Named nowhere: Metamagic is left unchosen (the engine allows it) and the report says so.
  const bare = importFgxml(xml.replace(/<powers>[\s\S]*<\/powers>/, "<powers></powers>"));
  assert.equal(bare.report.loadable, true, bare.report.problems.join("; "));
  assert.equal(bare.character.choices?.metamagic, undefined);
  assert.ok(bare.report.features.some((f) => f.name === "Metamagic (level 10)" && /left unchosen/.test(f.why)));
  assert.ok(apply(newGame(7), { type: "setSheet", sheet: bare.character }, DM).ok);
});
