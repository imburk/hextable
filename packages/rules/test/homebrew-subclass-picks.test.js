// Homebrew subclasses, addition A of docs/specs/homebrew-subclasses.md: choices from a short list. A subclass feature may give skills from a list of skill ids
// (`skills: { n, from: [skills], expertise? }`, picked on the sheet's `choices` for the feature) and train weapons named by id (`proficiency.weapons`).
// The domain is invented for this test ("Domain of the Open Page", a pack "paper-folk"); no published subclass is used.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { CONTENT } from "../src/content/index.js";
import { loadPack, overlayOf, using } from "../src/content/registry.js";
import { lintEntry, lintPack } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { forPlayers } from "../src/content/packs.js";
import { importFgxml } from "../src/import-fgxml.js";
import { readFileSync } from "node:fs";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "it was refused"); if (re) assert.match(r.error, re); return r; };
const json = (x) => JSON.stringify(x);

// ---------- the invented pack ----------
const P = "paper-folk", hb = (n) => `hb-${P}-${n}`, SRC = `homebrew:${P}`;
const doc = (lists, id = P) => ({ format: "hextable-pack", v: 1, pack: { id, name: id, version: 1, license: "CC0, by the author", attribution: "Written for a test." }, ...lists });
const feature = (id, level, grants, more = {}) => ({ id: hb(id), name: id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()), level, tier: "auto", checked: false, text: `The ${id}, in the pack's own words.`, ...(grants ? { grants } : {}), ...more });
const LORE = ["arcana", "history", "nature", "religion"], NOTES = ["investigation", "medicine", "survival"];
const sub = (features, id = "domain-of-the-open-page") => ({ id: hb(id), name: "Domain of the Open Page", class: "cleric", source: SRC, checked: false, text: "Clerics who keep a library open to all.", features });
const OPEN = feature("open-page", 3, { skills: { n: 2, from: LORE, expertise: true } });
const NOTE = feature("field-notes", 6, { skills: { n: 1, from: NOTES } });
const DRILL = feature("page-drill", 3, { proficiency: { weapons: ["rapier", "whip"] } });
const DOMAIN = sub([OPEN, NOTE, DRILL]);
// A bard college of the same pack, for Expertise.
const BARD = { ...sub([feature("quiet-reading", 3, { skills: { n: 1, from: ["arcana", "history"] } })], "college-of-quiet-pages"), class: "bard", name: "College of Quiet Pages" };
const pack = (d) => { const r = loadPack(d); assert.ok(r.ok, (r.problems ?? []).join("; ")); return r.pack; };
const PAPER = pack(doc({ subclasses: [DOMAIN, BARD] })), ON = overlayOf([PAPER]);
const SUB = hb("domain-of-the-open-page");

// ---------- the characters ----------
const A = { str: 12, dex: 14, con: 14, int: 10, wis: 16, cha: 10 };
const SPELLS3 = ["guidance", "sacred-flame", "spare-the-dying", "bless", "healing-word", "command"];
const cleric = (level = 3, over = {}) => ({ name: "Sister Quill", class: "cleric", level, subclass: SUB, abilities: A, skills: ["insight", "medicine"], choices: { "divine-order": "protector", [hb("open-page")]: ["arcana", "religion"] },
  armour: "chain-mail", shield: true, weapons: ["mace"], spells: level >= 6 ? [...SPELLS3, "spirit-guardians", "lesser-restoration", "aid", "sanctuary"].slice(0, 11) : SPELLS3, ...over });
const choose = (open, note) => ({ "divine-order": "protector", [hb("open-page")]: open, ...(note ? { [hb("field-notes")]: note } : {}) });
const said = (sheet) => using(ON, () => validate(sheet));
const only = (sheet, re) => { const m = said(sheet); assert.equal(m.length, 1, m.join(" | ")); assert.match(m[0], re); return m[0]; };

// What the cleric needs at level 6 on this table, found by the gate itself.
const L6 = (over = {}) => cleric(6, { choices: choose(["arcana", "religion"], ["survival"]), ...over });

// ---------- the sheet and derive ----------
test("a sheet with its picks is valid and derive gives the skills, with Expertise only where the feature says so", () => {
  using(ON, () => {
    assert.deepEqual(validate(cleric()), []);
    const r = derive(cleric()).record;
    assert.deepEqual(r.skills.sort(), ["arcana", "insight", "medicine", "religion"], "the class's two and the feature's two");
    assert.deepEqual(r.expertise.sort(), ["arcana", "religion"], "Expertise in the two the feature names");
    // At 6 the second feature adds one skill, without Expertise.
    assert.deepEqual(validate(L6()), []);
    const r6 = derive(L6()).record;
    assert.ok(r6.skills.includes("survival") && !r6.expertise.includes("survival"));
    assert.deepEqual(r6.expertise.sort(), ["arcana", "religion"]);
    // The sheet itself records only the picks, under the feature's id; nothing else changes shape.
    assert.deepEqual(Object.keys(cleric().choices).sort(), ["divine-order", hb("open-page")]);
  });
});

test("one pick may be given as a word, and the order of the picks does not matter", () => {
  using(ON, () => {
    const one = L6({ choices: choose(["religion", "arcana"], "medicine") });
    assert.deepEqual(validate(one), [], "medicine is the sheet's class skill here: a skill already held may be picked");
    const fine = L6({ choices: choose(["religion", "arcana"], "survival") });
    assert.deepEqual(validate(fine), []);
    const asWord = L6({ choices: { ...choose(["religion", "arcana"]), [hb("field-notes")]: "investigation" } });
    assert.deepEqual(validate(asWord), []);
    assert.ok(derive(asWord).record.skills.includes("investigation"));
    assert.deepEqual(derive(fine).record.skills, derive(L6({ choices: choose(["arcana", "religion"], ["survival"]) })).record.skills);
  });
});

test("a feature below its level asks nothing; a sheet with no pick for a feature it has is refused", () => {
  using(ON, () => {
    assert.deepEqual(validate(cleric(3)), [], "field-notes is level 6: no pick for it at 3");
    const m = validate(cleric(6, { choices: choose(["arcana", "religion"]), spells: cleric(6).spells }));
    assert.equal(m.length, 1);
    assert.equal(m[0], "Choose 1 skill for Field notes: Investigation, Medicine, Survival; none is chosen.");
  });
});

test("validate says each fault in a sentence: missing, too many, off the list, twice", () => {
  using(ON, () => {
    const o = (picks, more = {}) => cleric(3, { choices: { "divine-order": "protector", [hb("open-page")]: picks }, ...more });
    assert.equal(only(o(["arcana"]), /Choose 2 skills/), "Choose 2 skills for Open page: Arcana, History, Nature, Religion; 1 is chosen.");
    assert.equal(only(o([]), /Choose 2 skills/), "Choose 2 skills for Open page: Arcana, History, Nature, Religion; none is chosen.");
    assert.equal(only(o(["arcana", "history", "nature"]), /gives 2 skills/), "Open page gives 2 skills; 3 are chosen.");
    assert.equal(only(o(["arcana", "stealth"]), /not one of the skills/), "Open page: Stealth is not one of the skills it offers (Arcana, History, Nature, Religion).");
    assert.equal(only(o(["arcana", "arcana"]), /twice/), "Open page: Arcana is chosen twice.");
    assert.match(said(o(["arcana", "mugwump"])).join(" "), /"mugwump" is not one of the skills it offers/);
    // A second feature's pick must be on its own list too.
    const twice = L6({ choices: { ...choose(["arcana", "religion"]), [hb("field-notes")]: ["arcana"] } });
    assert.match(said(twice).join(" "), /Field notes: .*not one of the skills it offers/);
  });
});

test("a skill the character already has may be picked: no second proficiency, and the Expertise is given once", () => {
  using(ON, () => {
    // From the background (a sheet's extraSkills) and from the class's own list, and the feature's own pick of the same skill twice over.
    const bg = cleric(3, { extraSkills: ["nature"], choices: { "divine-order": "protector", [hb("open-page")]: ["nature", "arcana"] } });
    assert.deepEqual(validate(bg), []);
    const r = derive(bg).record;
    assert.equal(r.skills.filter((k) => k === "nature").length, 1, "one proficiency");
    assert.deepEqual(r.expertise.slice().sort(), ["arcana", "nature"], "Expertise in it, once");
    const cls = cleric(3, { skills: ["history", "medicine"], choices: { "divine-order": "protector", [hb("open-page")]: ["history", "arcana"] } });
    assert.deepEqual(validate(cls), []);
    const rc = derive(cls).record;
    assert.equal(rc.skills.filter((k) => k === "history").length, 1);
    assert.deepEqual(rc.expertise.slice().sort(), ["arcana", "history"]);
    // The same skill named twice in one feature is still a fault; a pick off the list still is.
    assert.match(validate(cleric(3, { skills: ["history", "medicine"], choices: { "divine-order": "protector", [hb("open-page")]: ["history", "history"] } })).join(" "), /History is chosen twice/);
  });
});

test("a sheet from another system, which lists every skill the character has, validates once the picks are named", () => {
  using(ON, () => {
    // Its class picks are History and Religion, and the domain's two are the same: the sheet holds them once, in `skills`.
    const fg = cleric(3, { skills: ["history", "religion"], choices: { "divine-order": "protector" } });
    assert.match(validate(fg).join(" "), /Choose 2 skills for Open page/, "the picks are asked for, not read from `skills`");
    const named = { ...fg, choices: { ...fg.choices, [hb("open-page")]: ["history", "religion"] } };
    assert.deepEqual(validate(named), []);
    const r = derive(named).record;
    assert.deepEqual(r.skills.slice().sort(), ["history", "religion"], "no skill twice");
    assert.deepEqual(r.expertise.slice().sort(), ["history", "religion"], "doubled once, not twice");
    // And a sheet whose own expertise names one of them as well gives it once.
    const bard = { name: "Ink", class: "bard", level: 3, subclass: hb("college-of-quiet-pages"), abilities: { str: 8, dex: 14, con: 12, int: 12, wis: 10, cha: 16 }, skills: ["performance", "persuasion", "history"],
      expertise: ["history"], choices: { [hb("quiet-reading")]: ["history"] }, spells: ["vicious-mockery", "minor-illusion", "healing-word", "faerie-fire", "hold-person", "dissonant-whispers"], armour: "leather-armor", weapons: ["dagger"] };
    assert.deepEqual(validate(bard), []);
    const rb = derive(bard).record;
    assert.equal(rb.skills.filter((k) => k === "history").length, 1);
    assert.deepEqual(rb.expertise, ["history"]);
  });
});

test("the same sheet without the pack: nothing is asked and nothing is given, and the DM is told what is missing", () => {
  const sheet = cleric();
  assert.deepEqual(validate(sheet), [], "an unloaded homebrew id is accepted");
  const d = derive(sheet);
  assert.deepEqual(d.record.skills.sort(), ["insight", "medicine"]);
  assert.deepEqual(d.record.expertise, []);
  assert.equal(d.missing.length, 1);
});

test("a pick the sheet names that is off the list is not applied by derive, and a surplus pick is cut at n", () => {
  using(ON, () => {
    const r = derive(cleric(3, { choices: { "divine-order": "protector", [hb("open-page")]: ["stealth", "nature", "arcana", "religion"] } })).record;
    assert.deepEqual(r.skills.sort(), ["arcana", "insight", "medicine", "nature"].sort(), "stealth is skipped; two of the list count");
    assert.deepEqual(r.expertise.sort(), ["arcana", "nature"]);
  });
});

// For Expertise: the bard has two Expertise picks of its own, and may put one on a skill the college gave.
const BARDS = ON;
const QB = (more = {}) => ({ name: "Ink", class: "bard", level: 3, subclass: hb("college-of-quiet-pages"), abilities: { str: 8, dex: 14, con: 12, int: 12, wis: 10, cha: 16 }, skills: ["performance", "persuasion", "stealth"],
  choices: { [hb("quiet-reading")]: ["history"] }, spells: ["vicious-mockery", "minor-illusion", "healing-word", "faerie-fire", "hold-person", "dissonant-whispers"], armour: "leather-armor", weapons: ["dagger"], ...more });
test("Expertise chosen on the sheet may be in a skill a feature gave", () => {
  using(BARDS, () => {
    assert.deepEqual(validate(QB()), []);
    assert.deepEqual(validate(QB({ expertise: ["history", "stealth"] })), [], "history came from the college");
    const r = derive(QB({ expertise: ["history", "stealth"] })).record;
    assert.deepEqual(r.expertise.sort(), ["history", "stealth"]);
    assert.ok(r.skills.includes("history"));
    assert.match(validate(QB({ expertise: ["history", "arcana"] })).join(" "), /Expertise needs proficiency in the same skill/, "arcana was on the list but not picked");
  });
});

test("skills from a list carry through a second class, under its own feature id", () => {
  using(ON, () => {
    const sheet = { name: "Vor", classes: [{ class: "cleric", level: 3, subclass: SUB, spells: SPELLS3 }, { class: "fighter", level: 2 }], abilities: { ...A, str: 14 },
      skills: ["insight", "medicine"], choices: { "divine-order": "protector", "fighting-style": "defense", [hb("open-page")]: ["arcana", "religion"] }, armour: "chain-mail", weapons: ["mace"] };
    assert.deepEqual(validate(sheet), []);
    assert.deepEqual(derive(sheet).record.expertise.sort(), ["arcana", "religion"]);
  });
});

// ---------- named weapons ----------
// A cleric who took Thaumaturge has no martial weapons and no heavy armour, so the named weapons are what trains it.
const thau = (over = {}) => cleric(3, { choices: { "divine-order": "thaumaturge", [hb("open-page")]: ["arcana", "religion"] }, armour: undefined, shield: false, ...over });
test("proficiency.weapons names weapons: the sheet may carry them, derive trains them and no other", () => {
  using(ON, () => {
    assert.deepEqual(validate(thau({ weapons: ["mace", "rapier", "whip"] })), []);
    const why = derive(thau({ weapons: ["mace", "rapier", "whip"] })).why.attacks;
    for (const id of ["rapier", "whip"]) assert.ok(!why[id].includes("not proficient") && why[id].includes("Proficiency +2"), JSON.stringify(why[id]));
    assert.equal(derive(thau({ weapons: ["mace", "longsword"] })).why.attacks.longsword.includes("not proficient"), true, "a martial weapon not named stays untrained");
    assert.equal(derive(thau({ weapons: ["scimitar"] })).why.attacks.scimitar.includes("not proficient"), true);
  });
  assert.equal(derive({ ...thau({ weapons: ["rapier"] }), subclass: undefined, level: 2, choices: { "divine-order": "thaumaturge" } }).why.attacks.rapier.includes("not proficient"), true, "without the subclass, as before");
  using(ON, () => assert.equal(derive(thau({ level: 2, subclass: undefined, weapons: ["rapier"], choices: { "divine-order": "thaumaturge" } })).why.attacks.rapier.includes("not proficient"), true, "below the level the feature is gained"));
});

// ---------- the gate ----------
const gate = (features, extra = {}) => lintEntry("subclasses", { ...sub(features), ...extra }, { pack: P, srd: CONTENT });
const refused = (features, re, extra) => { const m = gate(features, extra); assert.ok(m.length, "it was refused"); assert.match(m.join(" | "), re); return m; };

test("the gate takes the three shapes and refuses a list that cannot be picked", () => {
  assert.deepEqual(gate([OPEN, NOTE, DRILL]), []);
  assert.deepEqual(gate([feature("a", 3, { skills: { n: 1, from: ["arcana", "history"] } })]), [], "one of two");
  assert.deepEqual(gate([feature("a", 3, { skills: { n: 2, from: ["arcana", "history"] } })]), [], "as many as there are: allowed, the sheet then names them all");
  refused([feature("a", 3, { skills: { n: 3, from: ["arcana", "history"] } })], /at least n of them/);
  refused([feature("a", 3, { skills: { n: 0, from: ["arcana", "history"] } })], /n is 1 to 5/);
  refused([feature("a", 3, { skills: { n: 1, from: ["arcana"] } })], /2 or more different skills/);
  refused([feature("a", 3, { skills: { n: 1, from: ["arcana", "arcana"] } })], /2 or more different skills/);
  refused([feature("a", 3, { skills: { n: 1, from: ["arcana", "juggling"] } })], /skills from a list is/);
  refused([feature("a", 3, { skills: { n: 1, from: ["arcana", "history"], extra: 1 } })], /skills from a list is/);
  refused([feature("a", 3, { skills: { n: 1, from: ["arcana", "history"], expertise: false } })], /expertise is true or left out/);
  refused([feature("a", 3, { skills: { n: 1, from: "any", expertise: true } })], /expertise is for skills chosen from a list/);
  refused([feature("a", 3, { skills: { n: 1, from: "class", expertise: true } })], /expertise is for skills chosen from a list/);
});

test("a feature with options cannot also give skills from a list, and an option cannot", () => {
  const opts = [{ id: hb("o1"), name: "One", text: "First.", tier: "manual" }, { id: hb("o2"), name: "Two", text: "Second.", tier: "manual" }];
  refused([feature("a", 3, { skills: { n: 1, from: ["arcana", "history"] } }, { options: opts })], /a feature with options cannot also give them/);
  refused([feature("a", 3, undefined, { options: [{ ...opts[0], tier: "auto", grants: { skills: { n: 1, from: ["arcana", "history"] } } }, opts[1]] })], /an option cannot give skills from a list/);
});

test("a feat or an item cannot give skills from a list or name the weapons it trains", () => {
  const feat = (grants) => ({ id: hb("lore-feat"), name: "Lore Feat", category: "general", tier: "auto", source: SRC, checked: false, text: "A little lore.", grants });
  const item = (grants) => ({ id: hb("lore-ring"), name: "Lore Ring", category: "wondrous", rarity: "rare", attune: true, wear: "ring", tier: "auto", source: SRC, checked: false, text: "A ring.", grants });
  for (const [kind, make] of [["feats", feat], ["items", item]]) {
    const skills = lintEntry(kind, make({ skills: { n: 1, from: ["arcana", "history"] } }), { pack: P, srd: CONTENT }).join(" | ");
    assert.match(skills, /cannot give skills from a list|does not grant "skills"/, kind);
    const weapons = lintEntry(kind, make({ proficiency: { weapons: ["rapier"] } }), { pack: P, srd: CONTENT }).join(" | ");
    assert.match(weapons, /cannot name the weapons it trains|does not grant "proficiency"/, kind);
  }
  assert.deepEqual(lintEntry("feats", feat({ proficiency: { weapons: ["martial"] } }), { pack: P, srd: CONTENT }), [], "martial stays as it was for a feat");
});

test("named weapons: an SRD id, an id of the pack, nothing else; and they are listed once and few", () => {
  refused([feature("a", 3, { proficiency: { weapons: ["lightsaber"] } })], /names "lightsaber", which is not a weapon of the SRD or of this pack/);
  assert.deepEqual(gate([feature("a", 3, { proficiency: { weapons: [hb("quill-blade")] } })]), [], "an id of the pack cannot be told without the pack's weapons: the whole pack is checked below");
  assert.match(lintEntry("subclasses", sub([feature("a", 3, { proficiency: { weapons: [hb("quill-blade")] } })]), { pack: P, srd: CONTENT, weapons: [] }).join(" "), /not a weapon of the SRD or of this pack/, "with the pack's weapons given, and none");
  refused([feature("a", 3, { proficiency: { weapons: ["hb-other-folk-blade"] } })], /not a weapon of the SRD or of this pack/);
  refused([feature("a", 3, { proficiency: { weapons: ["rapier", "rapier"] } })], /proficiency gives weapons/);
  refused([feature("a", 3, { proficiency: { weapons: ["Rapier"] } })], /proficiency gives weapons/);
  refused([feature("a", 3, { proficiency: { weapons: [5] } })], /proficiency gives weapons/);
  refused([feature("a", 3, { proficiency: { weapons: Array.from({ length: 13 }, (_, i) => `w${i}`) } })], /proficiency gives weapons/);
  assert.deepEqual(gate([feature("a", 3, { proficiency: { weapons: ["martial", "rapier"] } })]), [], "martial and a named weapon together");
  assert.deepEqual(gate([feature("a", 3, { proficiency: { armour: ["heavy"], weapons: ["whip"] } })]), []);
  // In an option too.
  refused([feature("a", 3, undefined, { options: [{ id: hb("o1"), name: "One", text: "First.", tier: "auto", grants: { proficiency: { weapons: ["lightsaber"] } } }, { id: hb("o2"), name: "Two", text: "Second.", tier: "manual" }] })], /not a weapon of the SRD or of this pack/);
});

test("a weapon of the pack itself may be named, in a whole pack and by the pack's manager", () => {
  const blade = { id: hb("quill-blade"), name: "Quill Blade", category: "martial", kind: "melee", damage: "1d6", type: "piercing", properties: ["finesse", "light"], mastery: "nick", weight: 2, cost: "10 GP", source: SRC, checked: false };
  const quill = sub([feature("quill-drill", 3, { proficiency: { weapons: [hb("quill-blade")] } })], "domain-of-the-quill");
  const d = doc({ weapons: [blade], subclasses: [quill] });
  assert.deepEqual(lintPack(d, { strict: true, srd: CONTENT }), []);
  const loaded = pack(d);
  using(overlayOf([loaded]), () => {
    const sheet = { ...cleric(3), subclass: hb("domain-of-the-quill"), choices: { "divine-order": "thaumaturge" }, armour: undefined, shield: false, weapons: ["mace", hb("quill-blade")] };
    assert.deepEqual(validate(sheet), []);
    assert.ok(!derive(sheet).why.attacks[hb("quill-blade")].includes("not proficient"));
  });
  const away = doc({ subclasses: [quill] });
  assert.match(lintPack(away, { strict: true, srd: CONTENT }).join(" | "), /not a weapon of the SRD or of this pack/, "without the weapon in the pack");
});

// ---------- the reading ----------
test("the reading says the list, the Expertise and the weapons; a player is sent the grants as written", () => {
  using(ON, () => {
    const text = () => readEntry("subclasses", CONTENT.subclasses[SUB]).lines.join("\n");
    const read = text();
    assert.match(read, /2 skills, chosen on the holder's sheet from Arcana, History, Nature or Religion; one the holder already has may be chosen, and gives no second proficiency/);
    assert.match(read, /Expertise in them: the Proficiency Bonus is doubled/);
    assert.match(read, /1 skill, chosen on the holder's sheet from Investigation, Medicine or Survival/);
    assert.match(read, /Training with the "Rapier" and "Whip", which it names/);
    // A player's copy of the pack has the same subclass entry: the data holds ids and numbers, as every subclass does.
    const { data: mine } = forPlayers(doc({ subclasses: [DOMAIN, BARD] }));
    assert.equal(json(mine.subclasses[0].features[0].grants), json(OPEN.grants), "the picks' shape is in what a player is sent, as the rest of the feature is");
  });
});

// ---------- in a game ----------
test("setSheet in a game: the picks make the character, and a sheet missing one is refused with its sentence", () => {
  using(ON, () => {
    const s = newGame(5, { party: [{ sheet: cleric() }] });
    const pc = s.entities.pc1;
    assert.deepEqual([...pc.skills].sort(), ["arcana", "insight", "medicine", "religion"]);
    assert.deepEqual([...pc.expertise].sort(), ["arcana", "religion"]);
    assert.deepEqual(pc.sheet.choices[hb("open-page")], ["arcana", "religion"], "the sheet keeps the picks as given");
    const before = json(s);
    no(apply(s, { type: "setSheet", sheet: cleric(3, { choices: { "divine-order": "protector", [hb("open-page")]: ["arcana"] } }) }, DM), /Choose 2 skills for Open page/);
    assert.equal(json(s), before, "a refused action changes nothing");
    ok(apply(s, { type: "setSheet", sheet: cleric(3, { name: "Sister Ink", choices: { "divine-order": "protector", [hb("open-page")]: ["nature", "history"] } }) }, DM));
  });
});

test("a game with the picks replays to the same state, and a refresh keeps them", () => {
  using(ON, () => {
    const a = newGame(5, { party: [{ sheet: cleric() }] }), b = newGame(5, { party: [{ sheet: cleric() }] });
    assert.equal(json(a), json(b));
    ok(apply(a, { type: "refresh", id: "pc1" }, DM));
    assert.deepEqual([...a.entities.pc1.expertise].sort(), ["arcana", "religion"]);
  });
});

// ---------- nothing else changes ----------
test("an SRD character and a sheet of the SRD's own are validated and derived as before", () => {
  const rogue = { name: "Wren", class: "rogue", level: 3, subclass: "thief", abilities: { str: 8, dex: 16, con: 12, int: 12, wis: 12, cha: 14 }, skills: ["acrobatics", "deception", "stealth", "sleight-of-hand"], expertise: ["stealth", "sleight-of-hand"], armour: "leather-armor", weapons: ["shortsword"] };
  assert.deepEqual(validate(rogue), []);
  const r = derive(rogue).record;
  assert.deepEqual(r.expertise.sort(), ["sleight-of-hand", "stealth"]);
  assert.deepEqual(derive(rogue).missing, []);
  using(ON, () => assert.equal(json(derive(rogue).record), json(r), "the overlay changes nothing for it"));
});

// ---------- the importer names the picks a sheet already holds ----------
test("an imported sheet whose skills hold exactly the feature's n of its list gets them as the picks, and loads", () => {
  // The cleric fixture (History, Insight, Medicine, Religion) with its domain renamed to the invented one: History and Religion are two of the list.
  // The domain gives Expertise, so the importer reads only the skills the sheet marks at proficiency 2 (#548).
  const xml = readFileSync(new URL("./fixtures/fgxml-cleric.xml", import.meta.url), "utf8").replace("Life Domain", "Domain of the Open Page")
    .replace(/(<name type="string">(?:History|Religion)<\/name><prof type="number">)1/g, "$12");
  const { character, report } = using(ON, () => importFgxml(xml));
  assert.equal(report.loadable, true, report.problems.join("; "));
  assert.equal(character.subclass, SUB);
  assert.deepEqual(character.choices[hb("open-page")], ["history", "religion"]);
  using(ON, () => {
    assert.deepEqual(validate(character), []);
    const r = derive(character).record;
    assert.deepEqual(r.skills.slice().sort(), ["history", "insight", "medicine", "religion"], "the same four skills as the sheet");
    assert.deepEqual(r.expertise.slice().sort(), ["history", "religion"]);
    assert.ok(apply(newGame(7), { type: "setSheet", sheet: character }, DM).ok);
  });
  // Without the pack it is the stand-in, as before, and no pick is invented.
  const bare = importFgxml(xml);
  assert.equal(bare.character.choices?.[hb("open-page")], undefined);
  // A sheet that holds only one of the list gets no pick (the DM names the other).
  const one = using(ON, () => importFgxml(xml.replace(/<name type="string">History<\/name><prof type="number">2<\/prof>/, '<name type="string">History</name><prof type="number">0</prof>')));
  assert.equal(one.character.choices?.[hb("open-page")], undefined);
  using(ON, () => assert.match(validate(one.character).join(" "), /Choose 2 skills for Open page/));
});
