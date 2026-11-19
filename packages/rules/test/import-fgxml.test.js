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
  assert.equal(report.imported.shield, true, "the report keeps the Shield (a Shield id of a sheet would be kept as the id; Fantasy Grounds data gives only true)");
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

test("a score above 20 is kept as a DM bonus and reported; the engine plays the score the sheet shows (#498)", () => {
  const xml = fixture("cleric").replace('<score type="number">16</score>', '<score type="number">24</score>');
  const { character, report } = importFgxml(xml);
  assert.equal(character.abilities.wis, 20, "the typed score stays at the cap");
  assert.deepEqual(character.scoreBonus, { wis: 4 });
  const a = report.adjustments.find((x) => x.what === "WIS score");
  assert.equal(a.from, "24");
  assert.match(a.why, /^Wisdom 24 on the sheet: \+4 kept as a DM bonus; check what gives it/);
  assert.equal(report.loadable, true, report.problems.join("; "));
  assert.equal(derive(character).record.abil.wis, 24);
  assert.ok(!report.numbers.some((n) => n.what === "Spell save DC"), "the save DC now matches the sheet's own");
  // Taking the bonus off the sheet is the DM's way to remove it.
  const { scoreBonus, ...without } = character;
  assert.deepEqual(validate(without), []);
  assert.equal(derive(without).record.abil.wis, 20);
  // The engine takes the sheet with its bonus.
  const s = newGame(7);
  assert.ok(apply(s, { type: "setSheet", sheet: character }, DM).ok);
  assert.equal(Object.values(s.entities).find((x) => x.name === "Mira Testwell").abil.wis, 24);
});

test("a score of 31 or more keeps +10 and says what is left out; a score of 20 or less has no bonus (#498)", () => {
  const big = importFgxml(fixture("cleric").replace('<score type="number">16</score>', '<score type="number">33</score>'));
  assert.deepEqual(big.character.scoreBonus, { wis: 10 });
  assert.match(big.report.adjustments.find((x) => x.what === "WIS score").why, /at most \+10, so 3 more is not kept/);
  assert.equal(big.report.loadable, true, big.report.problems.join("; "));
  const none = importFgxml(fixture("cleric"));
  assert.equal(none.character.scoreBonus, undefined);
});

test("a score bonus is only what the engine does not already derive: an item that raises the score is not counted twice (#498)", () => {
  const xml = fixture("cleric").replace('<strength><score type="number">14</score>', '<strength><score type="number">32</score>').replace("</inventorylist>", '<id-00090><name type="string">Belt of Giant Strength (storm)</name><type type="string">Wondrous Item</type><rarity type="string">Legendary</rarity><carried type="number">2</carried><attune type="number">1</attune></id-00090></inventorylist>');
  const { character, report } = importFgxml(xml);
  assert.equal(report.loadable, true, report.problems.join("; "));
  assert.deepEqual(character.items, [{ id: "i1", item: "belt-of-giant-strength-storm", equipped: true, attuned: true }], "the belt is attuned as the sheet says");
  assert.equal(derive(character).record.abil.str, 30);
  assert.deepEqual(character.scoreBonus, { str: 1 });
  assert.ok(report.adjustments.some((x) => /already counts 29/.test(x.why) && /trimmed from \+3 to \+1/.test(x.why)), "what the engine already counts, and the trim, are reported");
});

test("a Belt of Giant Strength the engine applies adds no bonus of its own; only the rest of the sheet's score does (#498)", () => {
  const belt = (n, score) => fixture("cleric").replace('<strength><score type="number">14</score>', `<strength><score type="number">${score}</score>`).replace("</inventorylist>", `<id-00090><name type="string">Belt of Giant Strength (${n})</name><type type="string">Wondrous Item</type><rarity type="string">Rare</rarity><carried type="number">2</carried><attune type="number">1</attune></id-00090></inventorylist>`);
  // Hill giant: Strength 21 while worn. A sheet total of 21 is the belt alone: no bonus. 22 is one more than the engine derives.
  const same = importFgxml(belt("hill", 21));
  assert.equal(same.character.scoreBonus, undefined);
  assert.equal(derive(same.character).record.abil.str, 21);
  assert.match(same.report.adjustments.find((x) => x.what === "STR score").why, /no DM bonus is needed\. The engine already counts 21/);
  const more = importFgxml(belt("hill", 22));
  assert.deepEqual(more.character.scoreBonus, { str: 1 });
  assert.equal(derive(more.character).record.abil.str, 22, "the sheet's own total, not 23");
  assert.match(more.report.adjustments.find((x) => x.what === "STR score").why, /Strength 22 on the sheet: \+1 kept as a DM bonus.*The engine already counts 21/);
});

test("cantrips over the known count are taken in the sheet's order, and the report counts what was used (#498)", () => {
  const G = "Spells (Wizard)";
  const row = (n, i) => `<id-${String(200 + i).padStart(5, "0")}><name type="string">${n}</name><group type="string">${G}</group><level type="number">0</level><prepared type="number">1</prepared><school type="string">Evocation</school></id-${String(200 + i).padStart(5, "0")}>`;
  const extra = ["Prestidigitation", "Acid Splash"].map(row).join("");
  const xml = fixture("wizard-overflow").replace(/(<level type="number">0<\/level><prepared type="number">)0/g, "$11").replace("</powers>", `${extra}</powers>`);
  const { character, report } = importFgxml(xml);
  assert.deepEqual(character.spells.filter((id) => ["fire-bolt", "mage-hand", "light", "prestidigitation", "acid-splash"].includes(id)), ["fire-bolt", "mage-hand", "light"], "Fire Bolt, Mage Hand, Light come first on the sheet; alphabetical would have taken Acid Splash");
  const a = report.adjustments.find((x) => x.what === "cantrips");
  assert.deepEqual([a.from, a.to], ["5 listed, 3 known", "3 used"]);
});

test("a spell both classes of a multiclass sheet may prepare is kept by both, not lost to the later one (#498)", () => {
  // Command is on the Paladin and the Bard list. The Paladin group lists it first, and the Bard's own group lists it too.
  const xml = fixture("paladin-bard-one-group").replace(">Bless<", ">Command<").replace("</powers>", '<id-00300><name type="string">Command</name><group type="string">Spells (Bard)</group><level type="number">1</level><prepared type="number">1</prepared><school type="string">Enchantment</school></id-00300></powers>');
  const { character, report } = importFgxml(xml);
  assert.equal(report.loadable, true, report.problems.join("; "));
  assert.ok(character.classes[0].spells.includes("command"), "the Paladin has it");
  assert.ok(character.classes[1].spells.includes("command"), "and the Bard, whose own group lists it");
});

test("the group a Bard's spells are read from is named exactly: 'Spells Known' or the class name, not any group with 'spell' in it (#498)", () => {
  const bard = fixture("bard-known");
  assert.equal(importFgxml(bard.replaceAll("Spells Known", "Magic Initiate Spells")).character.spells, undefined, "a feat's group is not a class's spells");
  assert.equal(importFgxml(bard.replaceAll("Spells Known", "Spell Notes")).character.spells, undefined);
  assert.ok(importFgxml(bard.replaceAll("Spells Known", "Bard")).character.spells.includes("sleep"), "a bare class name is that class's");
  assert.equal(importFgxml(bard.replaceAll("Spells Known", "Wizard")).character.spells, undefined, "another class's bare name is not the Bard's");
});

test("a sheet that flags more spells prepared than the class prepares: the first in the sheet's order fill the count, and the report says which (#498)", () => {
  const { character, report } = importFgxml(fixture("wizard-overflow"));
  assert.equal(report.loadable, true, report.problems.join("; "));
  // Sheet order (Sleep, Shield, Mage Armor, Detect Magic, Magic Missile), not alphabetical and not highest level first; 5 are prepared at level 2.
  assert.deepEqual(character.spells.filter((id) => !["fire-bolt", "light", "mage-hand"].includes(id)), ["sleep", "shield", "mage-armor", "detect-magic", "magic-missile"]);
  assert.deepEqual(character.spells.filter((id) => ["fire-bolt", "light", "mage-hand"].includes(id)).sort(), ["fire-bolt", "light", "mage-hand"]);
  assert.ok(!character.spells.includes("burning-hands"), "a spell not flagged is not taken");
  const list = report.spells.find((x) => x.name === "Prepared spells");
  assert.deepEqual(list.items, ["Thunderwave", "Find Familiar", "Feather Fall"]);
  assert.match(list.why, /prepares 5\. The first 5 in the sheet's order were taken: Sleep, Shield, Mage Armor, Detect Magic, Magic Missile\. Left out: Thunderwave, Find Familiar, Feather Fall\. The DM can change them/);
  // What is not an SRD spell, not on the list or too high a level keeps its own line, and is not counted as left.
  assert.deepEqual(names(report.spells).filter((n) => n !== "Prepared spells").sort(), ["Cure Wounds", "Invisibility", "Moon Dart"]);
  assert.ok(!list.items.includes("Moon Dart") && !list.items.includes("Cure Wounds") && !list.items.includes("Invisibility"));
  assert.equal(report.imported.prepared, 5);
});

test("always-prepared spells of the subclass do not count against the prepared count, and keep their place (#498)", () => {
  // The cleric fixture, with a Life domain's Bless and Cure Wounds always prepared, and 12 more flagged beyond the 9 a level 5 cleric prepares.
  const extra = ["Healing Word", "Shield of Faith", "Command", "Detect Magic", "Lesser Restoration", "Protection from Evil and Good", "Sanctuary", "Aid", "Create Food and Water", "Dispel Magic", "Revivify", "Spirit Guardians"]
    .map((n, i) => `<id-${String(100 + i).padStart(5, "0")}><name type="string">${n}</name><group type="string">Spells (Cleric)</group><level type="number">1</level><prepared type="number">1</prepared><school type="string">Evocation</school></id-${String(100 + i).padStart(5, "0")}>`).join("");
  const { character, report } = importFgxml(fixture("cleric").replace("</powers>", `${extra}</powers>`));
  assert.equal(report.loadable, true, report.problems.join("; "));
  const leveled = character.spells.filter((id) => !["guidance", "sacred-flame"].includes(id));
  assert.equal(leveled.length, 9, "the class's own count, the always-prepared ones on top");
  assert.ok(!leveled.includes("bless") && !leveled.includes("cure-wounds"), "the domain gives those; they are not listed twice");
  assert.equal(leveled[0], "spiritual-weapon", "the first flagged spell in the sheet's order that the class can take");
  assert.ok(report.spells.some((x) => x.name === "Prepared spells" && /Left out: /.test(x.why)));
});

test("a Bard whose own group is empty reads the spells from the group the sheet keeps them in (#498)", () => {
  const { character, report } = importFgxml(fixture("bard-known"));
  assert.equal(report.loadable, true, report.problems.join("; "));
  assert.deepEqual([...character.spells].sort(), ["faerie-fire", "healing-word", "heroism", "minor-illusion", "sleep", "thunderwave", "vicious-mockery"]);
  const a = report.adjustments.find((x) => x.what === "spells");
  assert.match(a.why, /no spells under "Spells \(Bard\)"; the 8 spells it keeps in "Spells Known" were read as the Bard's/);
  assert.deepEqual(names(report.spells), ["Bardic Trick"], "an invented spell is a note");
  assert.deepEqual(character.scoreBonus, { cha: 2 }, "Charisma 22 on the same sheet");
});

test("a multiclass sheet that keeps all its spells under the first class's group: the other class takes the ones on its list, and the report says so (#498)", () => {
  const { character, report } = importFgxml(fixture("paladin-bard-one-group"));
  assert.equal(report.loadable, true, report.problems.join("; "));
  const [paladin, bard] = character.classes;
  // Bless, Searing Smite and Divine Favor are Paladin-only; Heroism, Command and Shield of Faith are on the Paladin list too (and Heroism and Command on the Bard's) so they stay with the group's class.
  assert.deepEqual(paladin.spells, ["bless", "searing-smite", "divine-favor"], "its count of 3 filled in the sheet's order");
  assert.deepEqual(bard.spells.filter((id) => !["vicious-mockery", "minor-illusion"].includes(id)), ["faerie-fire", "healing-word", "sleep", "thunderwave", "bane"], "its count of 5, in the sheet's order");
  assert.deepEqual(bard.spells.filter((id) => ["vicious-mockery", "minor-illusion"].includes(id)).sort(), ["minor-illusion", "vicious-mockery"], "cantrips go with it, flagged or not");
  assert.ok(!bard.spells.includes("heroism") && !bard.spells.includes("command"), "a spell on both lists stays with the group's class");
  const moved = report.spells.find((x) => x.name === "Spells moved to the Bard");
  assert.deepEqual(moved.items, ["Faerie Fire", "Healing Word", "Sleep", "Thunderwave", "Bane", "Dissonant Whispers", "Vicious Mockery", "Minor Illusion"]);
  assert.match(moved.why, /no spells under "Spells \(Bard\)" and keeps 8 spells on the Bard list in "Spells \(Paladin\)"/);
  assert.deepEqual(report.spells.find((x) => x.name === "Prepared Paladin spells").items, ["Heroism", "Command", "Shield of Faith"]);
  assert.deepEqual(report.spells.find((x) => x.name === "Prepared Bard spells").items, ["Dissonant Whispers"]);
  assert.ok(!report.spells.some((x) => x.name === "Cure Wounds"), "an unflagged spell is simply not taken");
});

test("a multiclass sheet whose casting class has its own spells moves nothing (#498)", () => {
  const { report } = importFgxml(fixture("multiclass"));
  assert.ok(!report.spells.some((x) => /moved/.test(x.name)));
});

test("a Bard with no spells anywhere on the sheet imports none, as before (#498)", () => {
  const xml = fixture("bard-known").replace(/<id-\d+><name type="string">[^<]*<\/name><group type="string">Spells Known<\/group>.*?<\/id-\d+>\n/g, "");
  const { character, report } = importFgxml(xml);
  assert.equal(character.spells, undefined);
  assert.equal(report.adjustments.some((x) => x.what === "spells"), false);
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
