// Homebrew subclasses, stage B1 of docs/specs/homebrew-subclasses.md: the kind, the gate and the lookup.
// The subclass here is the spec's invented "Oath of the Ember" of an invented pack, "ember-folk". No published subclass is used.
// `derive` does not read a homebrew subclass yet (stage B2); these tests are about what a pack may hold and how it is found.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { modifiers } from "../src/modifiers.js";
import { newGame } from "../src/scenario.js";
import { CONTENT, HOMEBREW_LOOKUPS, PACKS } from "../src/content/index.js";
import { forPlayers, hashOf, packForPlayer, PLAYER_PACK_KINDS } from "../src/content/packs.js";
import { HOMEBREW_ENTRY_KINDS, HOMEBREW_LENGTHS, HOMEBREW_LIMITS, budget, budgetEntry, lintEntry, lintPack, nameKey, srdSubclassesOf } from "../src/content/schema.js";
import { HOMEBREW_KINDS, install, loadPack, overlayOf, uninstall, using } from "../src/content/registry.js";

const DM = { role: "dm", userId: "dm" };
const P = "ember-folk", hb = (name) => `hb-${P}-${name}`, SRC = `homebrew:${P}`;
const doc = (lists, head = {}) => ({ format: "hextable-pack", v: 1, pack: { id: P, name: "Ember Folk", version: 1, license: "CC0, by the author", attribution: "Written for a test.", ...head }, ...lists });
const bytes = (x) => Buffer.byteLength(JSON.stringify(x));

// A spell of the pack, for the subclass to always prepare.
const ward = (over = {}) => ({
  id: hb("ember-ward"), name: "Ember Ward", source: SRC, level: 2, school: "abjuration", classes: ["paladin"], time: "action", range: 60, components: ["v", "s"], duration: "instant",
  concentration: false, ritual: false, target: { area: { shape: "sphere", size: 10 } }, effects: [{ save: "dex", half: true, onFail: [{ damage: "3d6", type: "fire" }] }],
  tier: "auto", checked: false, text: "A ring of embers.", ...over,
});
// JSON has no `undefined`: a key given as undefined is left out, as a pack read from JSON would have it.
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
// The spec's example, built the way the spec writes it.
const oath = (over = {}) => clean({
  id: hb("oath-of-the-ember"), name: "Oath of the Ember", class: "paladin", source: SRC, checked: false,
  text: "Paladins sworn to keep a hearth-fire burning.",
  spells: { 3: ["burning-hands", "shield-of-faith"], 5: [hb("ember-ward")] },
  features: [
    { id: hb("kindle"), name: "Kindle", level: 3, tier: "auto", checked: false,
      text: "Spend Channel Divinity to wreathe one foe in sparks: you have Advantage on attack rolls against it for 1 minute.",
      grants: { action: { time: "bonus", cost: { resource: "channel-divinity" }, duration: "1 minute", target: { creature: { range: [30, 30] } },
        effects: [{ modifier: { on: "attack.roll", op: "advantage", against: "target" }, to: "caster" }] } } },
    { id: hb("hearth-aura"), name: "Hearth Aura", level: 7, tier: "auto", checked: false, text: "You and allies in your aura have Resistance to Cold damage.",
      grants: { aura: { range: { byLevel: { 7: 10, 18: 30 } }, modifiers: [{ on: "damage.taken", op: "resist", types: ["cold"] }] } } },
    { id: hb("ash-memory"), name: "Ash Memory", level: 15, tier: "manual", checked: false, text: "Once per Long Rest you may ask the DM one question about what the fire saw.", uses: { max: 1, recharge: "long" } },
  ],
  ...over,
});
const EMBER = (sub = {}) => doc({ spells: [ward()], subclasses: [oath(sub)] });
const lint = (e, ctx = {}) => lintEntry("subclasses", e, { pack: P, srd: CONTENT, spells: [hb("ember-ward")], ...ctx });
const refused = (problems, re) => { assert.ok(problems.length, "refused"); assert.match(problems.join("\n"), re); };
const no = (d, re) => { const r = loadPack(d); assert.equal(r.ok, false, "refused"); assert.match(r.problems.join("\n"), re); return r.problems; };
// A problem is a sentence for the DM: what it is about, then plain words.
const plain = (problems) => { for (const p of problems) assert.match(p, /^[a-z]+(\/[^:]+)?: ["`a-zA-Z]/, p); };
const feature = (n, over = {}) => ({ id: hb(`f-${n}`), name: `Feature ${n}`, level: 3 + (n % 15), tier: "manual", checked: false, text: "The DM decides.", ...over });

// ---------- the kind and the example ----------
test("subclasses is a homebrew kind, found by the registry and sent to players; the SRD's own subclasses stay inside their classes", () => {
  assert.equal(HOMEBREW_ENTRY_KINDS.at(-1), "subclasses");
  assert.deepEqual(HOMEBREW_KINDS, HOMEBREW_ENTRY_KINDS, "the registry and the linter agree on the kinds");
  assert.deepEqual(Object.keys(CONTENT.subclasses), [], "empty for the SRD");
  assert.equal(HOMEBREW_LOOKUPS.subclasses.length, 1);
  assert.equal(HOMEBREW_LOOKUPS.subclasses[0][0], CONTENT.subclasses);
  assert.ok(PLAYER_PACK_KINDS.includes("subclasses") && !PLAYER_PACK_KINDS.includes("monsters"));
  assert.equal(PACKS[0].subclasses, undefined, "the SRD pack has none");
  for (const c of Object.values(CONTENT.classes)) assert.ok(c.subclass.id && c.subclass.features.length, `${c.id} keeps its own subclass`);
  const srd = srdSubclassesOf(CONTENT.classes);
  assert.equal(Object.keys(srd).length, 12);
  assert.deepEqual(srd[CONTENT.classes.paladin.subclass.id], { id: CONTENT.classes.paladin.subclass.id, name: CONTENT.classes.paladin.subclass.name, class: "paladin" });
});

test("the spec's example loads: it passes strict mode alone and as a pack, and joins CONTENT.subclasses for the length of a call", () => {
  assert.deepEqual(lint(oath()), []);
  assert.deepEqual(lintPack(EMBER(), { strict: true }), []);
  assert.deepEqual(budget(EMBER()), []);
  const r = loadPack(EMBER());
  assert.ok(r.ok, r.problems?.join("; "));
  assert.deepEqual([...r.pack.ids].sort(), [hb("ember-ward"), hb("oath-of-the-ember")]);
  const ov = overlayOf([r.pack]);
  assert.equal(CONTENT.subclasses[hb("oath-of-the-ember")], undefined);
  using(ov, () => {
    const sc = CONTENT.subclasses[hb("oath-of-the-ember")];
    assert.equal(sc.name, "Oath of the Ember");
    assert.equal(sc.class, "paladin");
    assert.deepEqual(sc.spells[5], [hb("ember-ward")]);
    assert.equal(sc.features.length, 3);
    assert.equal(CONTENT.classes.paladin.subclass.id, "devotion", "the class keeps its SRD subclass");
  });
  assert.deepEqual(Object.keys(CONTENT.subclasses), [], "taken out again");
  install(ov);
  try { assert.ok(CONTENT.subclasses[hb("oath-of-the-ember")]); } finally { uninstall(ov); }
  assert.deepEqual(Object.keys(CONTENT.subclasses), []);
});

test("a pack of subclasses alone loads; two packs on a table may each have one; one id in two packs is refused", () => {
  assert.ok(loadPack(doc({ subclasses: [oath({ spells: undefined })] })).ok);
  const other = (id) => doc({ subclasses: [oath({ id: `hb-${id}-oath`, name: "Oath of the Hearth", spells: undefined, source: `homebrew:${id}`, features: [{ ...feature(1), id: `hb-${id}-f` }] })] }, { id });
  const a = loadPack(other("one")), b = loadPack(other("two"));
  assert.ok(a.ok && b.ok, [...(a.problems ?? []), ...(b.problems ?? [])].join());
  using(overlayOf([a.pack, b.pack]), () => assert.deepEqual(Object.keys(CONTENT.subclasses).sort(), ["hb-one-oath", "hb-two-oath"]));
});

// ---------- each refusal of Decision 1 has a sentence ----------
test("a `classes` key in a pack says a homebrew class is not possible yet and a subclass of an SRD class is", () => {
  const d = { ...EMBER(), classes: [] };
  refused(lintPack(d, { strict: true }), /"classes" cannot be homebrew: a homebrew class is not possible yet; a subclass of an SRD class is \(`subclasses`\)/);
  const p = no(d, /a homebrew class is not possible yet; a subclass of an SRD class is \(`subclasses`\)/);
  plain(p);
  assert.match(lintEntry("classes", CONTENT.classes.paladin, { pack: P }).join(), /classes cannot be homebrew/);
});

test("the class is an SRD class id: a homebrew class id, an unknown one and none are refused in words", () => {
  refused(lint(oath({ class: hb("knight") })), /class "hb-ember-folk-knight" is a homebrew class: a subclass is of an SRD class/);
  refused(lint(oath({ class: "knight" })), /class "knight" is not an SRD class \(one of barbarian, bard,/);
  refused(lint(oath({ class: undefined })), /class is missing; it is not an SRD class/);
  refused(lint(oath({ class: 5 })), /class must be text/);
  no(EMBER({ class: hb("knight") }), /is a homebrew class/);
  for (const c of Object.keys(CONTENT.classes)) assert.deepEqual(lint(oath({ class: c, spells: undefined, features: [feature(1)] })), [], c);
});

test("every feature and option id carries the pack's prefix and is used once in the pack", () => {
  refused(lint(oath({ features: [{ ...feature(1), id: "channel-divinity" }] })), /feature channel-divinity: a feature id is "hb-ember-folk-" followed by a kebab-case name, so it can never be the id of a class feature/);
  refused(lint(oath({ features: [{ ...feature(1), id: "hb-other-pack-kindle" }] })), /a feature id is "hb-ember-folk-" followed by/);
  const opts = [{ id: hb("a"), name: "A", text: "x", tier: "manual" }, { id: "b", name: "B", text: "x", tier: "manual" }];
  refused(lint(oath({ features: [feature(1, { options: opts })] })), /option b: an option id is "hb-ember-folk-" followed by a kebab-case name/);
  // Used once: a feature twice in one subclass, an option that is also a feature, a feature in two subclasses of a pack.
  refused(lint(oath({ features: [feature(1), feature(1)] })), /needs a kebab-case id used once/);
  refused(lint(oath({ features: [feature(1), feature(2, { options: [{ id: hb("f-1"), name: "A", text: "x", tier: "manual" }, { id: hb("z"), name: "Z", text: "x", tier: "manual" }] })] })), /is the id of a feature and of an option/);
  const second = oath({ id: hb("oath-two"), name: "Oath of the Hearth", spells: undefined, features: [feature(1)] });
  refused(lintPack(doc({ spells: [ward()], subclasses: [oath({ features: [feature(1)] }), second] }), { strict: true }), /"hb-ember-folk-f-1" is also used in hb-ember-folk-oath-of-the-ember; a feature or option id is used once in the pack/);
  no(doc({ subclasses: [oath({ spells: undefined, features: [feature(1)] }), second] }), /is also used in/);
});

test("`feat: \"any\"` and `casting` are refused: a subclass has no feat slot and gives no spellcasting", () => {
  const p = lintPack(doc({ spells: [ward()], subclasses: [oath({ features: [{ ...feature(1), tier: "auto", feat: "any" }] })] }), { strict: true });
  refused(p, /"feat" is not something a subclass feature has: a subclass has no feat slot/);
  plain(p);
  const c = lintPack(doc({ spells: [ward()], subclasses: [oath({ casting: { ability: "wis", kind: "prepared" } })] }), { strict: true });
  refused(c, /"casting" is not something a subclass has: a subclass cannot give its class spellcasting/);
  plain(c);
  no(EMBER({ casting: null }), /cannot give its class spellcasting/);
});

test("a cost, `with`, `of` or `while` names a feature of the parent class or of this subclass, and a cost one with uses", () => {
  const act = (cost) => ({ action: { time: "bonus", cost: { resource: cost }, target: { self: true }, effects: [{ manual: "x" }] } });
  // Another class's pool, a feature of this class that has no uses, and a name that is nothing.
  refused(lint(oath({ features: [{ ...feature(1), grants: act("wild-shape") }] })), /a cost names "wild-shape", which is not a feature with uses of the Paladin or of this subclass/);
  refused(lint(oath({ features: [{ ...feature(1), grants: act("bardic-inspiration") }] })), /a cost names "bardic-inspiration"/);
  refused(lint(oath({ features: [{ ...feature(1), grants: act("nothing-at-all") }] })), /a cost names "nothing-at-all"/);
  refused(lint(oath({ features: [{ ...feature(1), grants: { moveWith: { of: "wild-shape" } } }] })), /a grant names "wild-shape", which is neither a feature of the Paladin nor of this subclass/);
  refused(lint(oath({ features: [{ ...feature(1), grants: { relentless: { while: "rage", dc: 10, step: 5, hp: 1 } } }] })), /a grant names "rage"/);
  // The parent class's pool is fine (the spec's example spends Channel Divinity); so is a pool of the subclass itself.
  assert.deepEqual(lint(oath({ features: [{ ...feature(1), grants: act("channel-divinity") }] })), []);
  const pool = { ...feature(1), uses: { max: 2, recharge: "long" } };
  assert.deepEqual(lint(oath({ features: [pool, { ...feature(2), grants: act(hb("f-1")) }] })), []);
  // A cost naming a feature of the class that has uses is another class's pool when the class is another.
  assert.deepEqual(lint(oath({ class: "druid", spells: undefined, features: [{ ...feature(1), grants: act("wild-shape") }] })), []);
  no(EMBER({ features: [{ ...feature(1), grants: act("wild-shape") }] }), /a cost names "wild-shape"/);
});

test("a feature's amounts name the parent class's table columns, because the subclass is linted inside its class", () => {
  const bard = (extra) => oath({ class: "bard", spells: undefined, features: [{ ...feature(1), tier: "auto", grants: { action: { time: "bonus", cost: { resource: "bardic-inspiration" }, target: { creature: { range: [30, 30] } },
    effects: [{ heal: { column: "bardic-die" } }, ...extra] } } }] });
  assert.deepEqual(lint(bard([])), []);
  refused(lint(oath({ features: [{ ...feature(1), tier: "auto", grants: { action: { time: "bonus", target: { self: true }, effects: [{ heal: { column: "bardic-die" } }] } } }] })), /no column "bardic-die" in the class table/);
});

test("spells: the class must cast, a spell must be no higher than the slots of that class level, and each must exist", () => {
  // Too high: a 3rd-level spell for a Paladin of level 3 (slots up to 1st level), and the same spell at level 9 (slots up to 3rd? 5th).
  refused(lint(oath({ spells: { 3: ["fireball"] } })), /class level 3: "fireball" is a level 3 spell, and a Paladin of level 3 has slots up to level 1/);
  assert.deepEqual(lint(oath({ spells: { 9: ["fireball"] } })), []);
  refused(lint(oath({ spells: { 5: ["hb-ember-folk-ember-ward", "fireball"] } })), /"fireball" is a level 3 spell, and a Paladin of level 5 has slots up to level 2/);
  // A spell the pack does not have, one of the SRD that is not there, and one of another pack.
  refused(lint(oath({ spells: { 5: [hb("missing")] } })), /"hb-ember-folk-missing" is not a spell of the SRD or of this pack/);
  refused(lint(oath({ spells: { 5: ["hb-other-pack-ward"] } })), /"hb-other-pack-ward" is not a spell of the SRD or of this pack/);
  refused(lint(oath({ spells: { 5: ["not-a-spell"] } })), /"not-a-spell" is not a spell of the SRD or of this pack/);
  // Levels 3 to 20 only, whole, with lists of spell ids.
  refused(lint(oath({ spells: { 2: ["burning-hands"] } })), /"2" is not a class level from 3 to 20/);
  refused(lint(oath({ spells: { 21: ["burning-hands"] } })), /"21" is not a class level from 3 to 20/);
  refused(lint(oath({ spells: { 3: [] } })), /class level 3 is a list of spell ids/);
  refused(lint(oath({ spells: { 3: ["burning-hands", "burning-hands"] } })), /names a spell twice/);
  // A cantrip is level 0, and a spell need not be on the class's list (as in the SRD).
  assert.deepEqual(lint(oath({ spells: { 3: ["fire-bolt"] } })), []);
  // The pack's own spell is found in a pack, with its level: too high there too.
  const high = doc({ spells: [ward({ level: 3 })], subclasses: [oath()] });
  refused(lintPack(high, { strict: true }), /class level 5: "hb-ember-folk-ember-ward" is a level 3 spell, and a Paladin of level 5 has slots up to level 2/);
  // Pact Magic: a Warlock's slots are one level, by class level.
  assert.deepEqual(lint(oath({ class: "warlock", spells: { 3: ["burning-hands"], 5: ["fireball"] }, features: [feature(1)] })), []);
  refused(lint(oath({ class: "warlock", spells: { 3: ["fireball"] }, features: [feature(1)] })), /a Warlock of level 3 has slots up to level 2/);
});

test("spells on a Fighter or other non-caster subclass are refused: derive would never prepare them", () => {
  const p = lint(oath({ class: "fighter", spells: { 3: ["burning-hands"] }, features: [feature(1)] }));
  refused(p, /the Fighter has no Spellcasting, so spells given to a subclass of it would never be prepared: leave them out/);
  plain(p);
  for (const c of Object.values(CONTENT.classes)) {
    const r = lint(oath({ class: c.id, spells: { 3: ["fire-bolt"] }, features: [feature(1)] }));
    if (c.casting) assert.deepEqual(r, [], c.id); else assert.match(r.join(), /has no Spellcasting/, c.id);
  }
  no(doc({ subclasses: [oath({ class: "rogue", features: [feature(1)] })] }), /the Rogue has no Spellcasting/);
});

test("a name that is an SRD subclass's, or an SRD subclass's id, is refused; a name of its own is not", () => {
  const real = Object.values(CONTENT.classes).find((c) => c.id === "paladin").subclass;
  refused(lint(oath({ name: real.name })), new RegExp(`the name "${real.name}" is the name of an SRD subclass: give it a name of its own`));
  refused(lint(oath({ name: real.name.toUpperCase() })), /is the name of an SRD subclass/);
  refused(lint(oath({ id: real.id })), new RegExp(`"${real.id}" is the id of an SRD entry, and homebrew cannot replace it`));
  for (const c of Object.values(CONTENT.classes)) refused(lint(oath({ class: c.id, name: c.subclass.name, spells: undefined, features: [feature(1)] })), /is the name of an SRD subclass/, c.id);
  // The check does not depend on the reference given, and a homebrew subclass of another pack's name is not an SRD name.
  refused(lintEntry("subclasses", oath({ name: real.name }), { pack: P, srd: { spells: CONTENT.spells, classes: CONTENT.classes } }), /is the name of an SRD subclass/);
  refused(lintEntry("subclasses", oath({ name: real.name }), { pack: P, spells: [hb("ember-ward")] }), /is the name of an SRD subclass/);
  no(EMBER({ name: real.name }), /is the name of an SRD subclass/);
  assert.equal(nameKey("Oath of the Ember"), "oathoftheember");
  refused(lint(oath({ source: "SRD 5.2.1" })), /its source must be "homebrew:ember-folk"/);
  refused(lint(oath({ checked: true })), /`checked` must be false/);
});

test("an unknown grant, hook, op or tag is refused, and the feature is entered as manual instead", () => {
  const g = (grants) => lintPack(doc({ spells: [ward()], subclasses: [oath({ features: [{ ...feature(1), tier: "auto", grants }] })] }), { strict: true });
  refused(g({ teleportAnywhere: true }), /"teleportAnywhere" is not something grants has/);
  refused(g({ modifiers: [{ on: "rolls", op: "add", value: 1 }] }), /on is one of|hook/);
  refused(g({ modifiers: [{ on: "check", op: "conjure", value: 1 }] }), /op is one of|op/);
  refused(g({ modifiers: [{ on: "attack.roll", op: "advantage", when: ["target.on-fire"] }] }), /when|tag/);
  refused(g({ action: { time: "bonus", target: { self: true }, effects: [{ summonGlory: 1 }] } }), /summonGlory|exactly one/);
  // As manual, with the text for the DM, and a cost-only action that still spends the Channel Divinity use, it loads.
  const manual = { ...feature(1), tier: "manual", text: "Something the vocabulary cannot say.", grants: { action: { time: "bonus", cost: { resource: "channel-divinity" }, target: { self: true }, effects: [{ manual: "The DM applies it." }] } } };
  assert.deepEqual(lint(oath({ features: [manual] })), []);
  assert.ok(loadPack(doc({ spells: [ward()], subclasses: [oath({ features: [manual] })] })).ok);
  // Tiers stay honest: auto that grants nothing, and manual that grants something other than a cost-only action.
  refused(lint(oath({ features: [{ ...feature(1), tier: "auto" }] })), /marked auto but grants nothing/);
  refused(lint(oath({ features: [{ ...feature(1), tier: "manual", grants: { evasion: true } }] })), /marked manual but grants something/);
});

test("what homebrew feats may not do, a subclass's feature may not either: familiar forms, Investment and the Chain's attack", () => {
  const g = (grants) => lintPack(doc({ spells: [ward()], subclasses: [oath({ features: [{ ...feature(1), tier: "auto", grants }] })] }), { strict: true });
  refused(g({ freeCast: { spells: ["find-familiar"], forms: [hb("x")], atWill: true } }), /cannot add familiar forms/);
  refused(g({ invest: { spell: "find-familiar", ward: true } }), /cannot change a familiar or let it attack/);
  refused(g({ forgoAttack: { spell: "find-familiar" } }), /cannot change a familiar or let it attack/);
});

test("an option that is a feat is a Fighting Style feat of the SRD, with its name and tier; any other is refused", () => {
  const style = CONTENT.feats.archery ?? Object.values(CONTENT.feats).find((f) => f.category === "fighting-style");
  const opt = (o = {}) => ({ id: style.id, name: style.name, text: style.text, tier: style.tier, feat: style.id, ...o });
  const withOptions = (options) => oath({ class: "paladin", spells: undefined, features: [feature(1, { options })] });
  assert.deepEqual(lint(withOptions([opt(), opt({ id: "blessed-warrior", feat: "blessed-warrior", name: "Blessed Warrior" })])).filter((x) => !/blessed-warrior/.test(x)), []);
  // A feat of the pack is allowed since #550 (addition B; homebrew-subclass-style.test.js): with the pack's feats given, one the pack lacks is refused.
  refused(lint(withOptions([opt(), { id: hb("x"), name: "X", text: "x", tier: "manual", feat: hb("x") }]), { feats: [] }), /option hb-ember-folk-x names the feat "hb-ember-folk-x", which is not a feat of this pack: add it to the pack's feats/);
  refused(lint(withOptions([opt({ name: "Another" }), { id: hb("y"), name: "Y", text: "x", tier: "manual" }])), /has another name or tier than the feat/);
  const goodOnly = withOptions([opt(), { id: hb("y"), name: "Y", text: "x", tier: "manual" }]);
  assert.deepEqual(lint(goodOnly), []);
  assert.ok(loadPack(doc({ spells: [ward()], subclasses: [goodOnly] })).ok);
});

// ---------- the limits ----------
test("the limits: an entry of a subclass may be 16 KB (others stay 8 KB); 12 features, 13 options, 5 spells a level, 40 steps", () => {
  assert.equal(HOMEBREW_LIMITS.subclassBytes, 16 * 1024);
  assert.equal(HOMEBREW_LIMITS.entryBytes, 8 * 1024);
  assert.deepEqual([HOMEBREW_LENGTHS["subclasses.features"], HOMEBREW_LENGTHS["features.options"], HOMEBREW_LENGTHS["spells.#"]], [12, 13, 5]);
  // Bytes: a subclass of about 12 KB passes, where a feat of the same size would not; past 16 KB is refused.
  const padded = (n) => oath({ spells: undefined, features: Array.from({ length: 12 }, (_, i) => feature(i, { text: "x".repeat(n) })) });
  assert.equal(bytes(padded(900)) > HOMEBREW_LIMITS.entryBytes && bytes(padded(900)) < HOMEBREW_LIMITS.subclassBytes, true);
  assert.deepEqual(budgetEntry("subclasses", padded(900)), []);
  assert.deepEqual(budget(doc({ subclasses: [padded(900)] })), []);
  assert.match(budgetEntry("feats", { ...padded(900), id: "hb-x-y" }).join(), /is over 8,192 bytes as JSON; the most for one entry is 8,192/);
  assert.ok(loadPack(doc({ subclasses: [padded(900)] })).ok);
  const big = padded(1400);
  assert.ok(bytes(big) > HOMEBREW_LIMITS.subclassBytes);
  refused(budgetEntry("subclasses", big), /is over 16,384 bytes as JSON; the most for one entry is 16,384/);
  refused(budget(doc({ subclasses: [big] })), /subclasses\/hb-ember-folk-oath-of-the-ember: it is over 16,384 bytes as JSON/);
  refused(lintPack(doc({ subclasses: [big] }), { strict: true }), /16,384 bytes/);
  // The exact edge: a subclass of exactly 16,384 bytes passes, one byte more is refused (the last feature's text is made as long as the room allows).
  const exact = padded(1300), last = exact.features.at(-1);
  last.text = "x".repeat(1300 + HOMEBREW_LIMITS.subclassBytes - bytes(exact));
  assert.ok(last.text.length <= 1500);
  assert.equal(bytes(exact), HOMEBREW_LIMITS.subclassBytes);
  assert.deepEqual(budgetEntry("subclasses", exact), []);
  last.text += "x";
  refused(budgetEntry("subclasses", exact), /is over 16,384 bytes/);
});

test("12 features pass and 13 are refused; 13 options pass and 14 are refused; 5 spells at a class level pass and 6 are refused", () => {
  const n = (k) => Array.from({ length: k }, (_, i) => feature(i));
  assert.deepEqual(lintPack(doc({ subclasses: [oath({ spells: undefined, features: n(12) })] }), { strict: true }), []);
  refused(lintPack(doc({ subclasses: [oath({ spells: undefined, features: n(13) })] }), { strict: true }), /features: a list of 13; the most is 12/);
  const options = (k) => Array.from({ length: k }, (_, i) => ({ id: hb(`o-${i}`), name: `Option ${i}`, text: "x", tier: "manual" }));
  const withOpts = (k, more = {}) => oath({ spells: undefined, features: [feature(1, { options: options(k), ...more })] });
  assert.deepEqual(lintPack(doc({ subclasses: [withOpts(13)] }), { strict: true }), []);
  refused(lintPack(doc({ subclasses: [withOpts(14)] }), { strict: true }), /features\[0\]\.options: a list of 14; the most is 13/);
  assert.deepEqual(lintPack(doc({ subclasses: [withOpts(13, { pick: 12 })] }), { strict: true }), []);
  const five = ["burning-hands", "shield-of-faith", "bless", "command", "cure-wounds"], six = [...five, "heroism"];
  assert.deepEqual(lintPack(doc({ subclasses: [oath({ spells: { 3: five } })] }), { strict: true }), []);
  refused(lintPack(doc({ subclasses: [oath({ spells: { 3: six } })] }), { strict: true }), /spells\.3: a list of 6; the most is 5/);
  no(doc({ subclasses: [oath({ spells: { 3: six } })] }), /a list of 6; the most is 5/);
});

test("steps count over all the features of a subclass: 40 pass, 41 are refused; steps nest as deep as the document's 16 levels allow", () => {
  const step = () => ({ manual: "x" });
  const action = (k) => ({ action: { time: "action", target: { self: true }, effects: Array.from({ length: k }, step) } });
  // 4 features of 10 steps (the list limit is 20 to a list): 40 in all.
  const split = (k, per) => Array.from({ length: k }, (_, i) => feature(i, { grants: action(per) }));
  assert.deepEqual(budget(doc({ subclasses: [oath({ spells: undefined, features: split(4, 10) })] })), []);
  refused(budget(doc({ subclasses: [oath({ spells: undefined, features: split(4, 10).concat(split(5, 1).slice(4).map((f) => ({ ...f, id: hb("last") }))) })] })), /it has 41 effect steps; the most for one entry is 40/);
  refused(budgetEntry("subclasses", oath({ spells: undefined, features: split(3, 14) })), /it has 42 effect steps/);
  const nest = (d) => { let steps = [{ manual: "x" }]; for (let i = 1; i < d; i++) steps = [{ save: "wis", onFail: steps }]; return steps; };
  const deep = (d) => oath({ spells: undefined, features: [feature(1, { grants: { action: { time: "action", target: { self: true }, effects: nest(d) } } })] });
  // Inside a feature's grants the document's own depth of 16 is reached before the 6 levels of steps: 4 lists of steps pass, a fifth is refused.
  assert.deepEqual(budgetEntry("subclasses", deep(4)), []);
  refused(budgetEntry("subclasses", deep(5)), /it nests deeper than 16 levels/);
});

test("no functions, no prototype keys and plain text, as for every entry; `dmNotes` is allowed on the subclass and a feature", () => {
  refused(budget(doc({ subclasses: [oath({ ["__proto__"]: 1 })] })), /key "__proto__"/);
  refused(budgetEntry("subclasses", JSON.parse(`{"id":"x","name":"X","features":[{"constructor":1}]}`)), /key "constructor"/);
  refused(budgetEntry("subclasses", oath({ text: "bad\u0007text" })), /control character/);
  refused(budgetEntry("subclasses", oath({ name: "N".repeat(61) })), /the name at name is 61 letters long; the most is 60/);
  const noted = oath({ dmNotes: "Remember the owner's table.", features: [feature(1, { dmNotes: "A note\nover two lines." })] });
  assert.deepEqual(lint(clean({ ...noted, spells: undefined })), []);
  refused(lint(oath({ features: [feature(1, { colour: "red" })] })), /"colour" is not something a subclass feature has/);
  refused(lint(oath({ colour: "red" })), /"colour" is not something a subclass has/);
  refused(lint(oath({ features: [feature(1, { options: [{ id: hb("a"), name: "A", text: "x", tier: "manual", dmNotes: "no" }, { id: hb("b"), name: "B", text: "x", tier: "manual" }] })] })), /"dmNotes" is not something an option of a subclass feature has/);
  refused(lint(oath({ features: [feature(1, { level: 2 })] })), /features\[0\]\.level: 2 is not allowed; a whole number from 3 to 20/);
  refused(lint(oath({ features: [feature(1, { level: 21 })] })), /level/);
  // Not strict (the linter alone), the same refusal says why.
  refused(lint(oath({ features: [feature(1, { level: 2 })] }), { strict: false }), /level is 3 to 20 \(a subclass comes at class level 3; move an older feature to 3 or later\)/);
  refused(lint(oath({ features: [] })), /needs features/);
});

// ---------- the SRD's own subclasses, held to the same shapes ----------
// An SRD subclass made homebrew: ids prefixed (and every reference to its own features renamed), unchecked, a name of its own.
function homebrewOf(c, more = {}) {
  const sc = structuredClone(c.subclass), rename = new Map();
  for (const f of sc.features) { rename.set(f.id, hb(f.id)); for (const o of f.options ?? []) if (!o.feat) rename.set(o.id, hb(`${f.id}-${o.id}`)); }
  // Only where a feature is named (an id, a cost, a `with`, `of` or `while`): a damage type that is also an option's id stays a damage type.
  const NAMING = new Set(["id", "resource", "with", "of", "while", "regain", "unless", "after", "pool", "cost", "uses"]);
  const walk = (v, key) => {
    if (typeof v === "string") return NAMING.has(key) ? rename.get(v) ?? v : v;
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return { id: hb(sc.id), name: `Zz ${sc.name}`.slice(0, 60), class: c.id, source: SRC, checked: false, text: sc.text, ...(sc.spells ? { spells: sc.spells } : {}), features: walk(sc.features).map(({ checked, ...f }) => ({ ...f, checked: false })), ...more };
}
test("every SRD subclass, made homebrew, passes strict mode (the key lists, ranges and lengths are never stricter than the vocabulary)", () => {
  const measured = [];
  for (const c of Object.values(CONTENT.classes)) {
    const e = homebrewOf(c);
    const p = lint(e, { spells: undefined });
    assert.deepEqual(p, [], c.id);
    measured.push(bytes(e));
    assert.deepEqual(budgetEntry("subclasses", e), [], c.id);
  }
  assert.ok(Math.max(...measured) < HOMEBREW_LIMITS.entryBytes, "the SRD's own subclasses are inside even the 8 KB of other kinds");
});

// ---------- what players are sent ----------
test("a player's copy of a pack has the subclasses, with no dmNotes at any depth; the DM's copy keeps them", () => {
  const NOTE = "Secret: the oath is a lie.";
  const noted = oath({ dmNotes: NOTE, features: [feature(1, { dmNotes: NOTE, grants: { action: { time: "action", target: { self: true }, effects: [{ manual: "x", dmNotes: NOTE }] } } })] });
  const data = doc({ spells: [ward()], subclasses: [noted], monsters: [] });
  const out = packForPlayer(data);
  assert.deepEqual(Object.keys(out).sort(), ["armour", "feats", "id", "items", "name", "objects", "spells", "subclasses", "version", "weapons"]);
  assert.equal(out.subclasses.length, 1);
  assert.equal(out.subclasses[0].id, hb("oath-of-the-ember"));
  assert.equal(out.subclasses[0].features[0].id, hb("f-1"));
  assert.equal(JSON.stringify(out).includes(NOTE) || JSON.stringify(out).includes("dmNotes"), false);
  assert.equal(JSON.stringify(data).includes(NOTE), true, "the DM's own copy is untouched");
  // A pack with none sends no `subclasses` at all (so its player copy and hash are what they always were); a subclass no character takes is sent too, as an unused spell is.
  assert.equal("subclasses" in packForPlayer(doc({ spells: [ward()] })), false);
  assert.equal("subclasses" in packForPlayer(doc({ spells: [ward()], subclasses: [] })), false);
  assert.deepEqual(Object.keys(packForPlayer(doc({ spells: [ward()] }))).sort(), ["armour", "feats", "id", "items", "name", "objects", "spells", "version", "weapons"]);
  const { data: copy, hash } = forPlayers(data);
  assert.equal(hash, hashOf(copy));
  assert.notEqual(hash, hashOf(data));
  // The copy a player holds is itself a pack that loads: the subclass's spells are in it.
  const loaded = loadPack({ format: "hextable-pack", v: 1, pack: { id: P, name: "Ember Folk", version: 1, license: "CC0, by the author", attribution: "Written for a test." }, spells: copy.spells, subclasses: copy.subclasses });
  assert.ok(loaded.ok, loaded.problems?.join("; "));
});

// ---------- survey item 8: a feature's Channel Divinity option that gives an edge against one chosen creature ----------
test("survey item 8: a feature's action with `to: \"caster\"` and `against: \"target\"` gives Advantage against the chosen foe only, for its duration", () => {
  const f = oath().features[0];
  assert.deepEqual(lint(oath()), [], "it is a valid subclass feature");
  // `derive` does not read a homebrew subclass yet (B2). The record is made as `derive` makes a feature's record: the grants' action, copied (this one has no amounts to bake).
  const sheet = { name: "Sir Ember", class: "paladin", level: 3, subclass: "devotion", abilities: { str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 14 }, skills: ["athletics", "religion"], choices: { "fighting-style": "defense" }, armour: "chain-mail", weapons: ["longsword"] };
  const { record } = derive(sheet);
  record.feats.push({ id: f.id, name: f.name, tier: f.tier, text: f.text, action: structuredClone(f.grants.action) });
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (id !== "fighter" && id !== "rogue") delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  delete s.entities.fighter;
  assert.ok(apply(s, { type: "place", actor: "rogue", to: { q: -4, r: 0 } }, DM).ok);
  const spawn = (at) => { const r = apply(s, { type: "spawn", monster: "goblin-warrior", at }, DM); assert.ok(r.ok, r.error); s.entities[r.events[0].id].hp = s.entities[r.events[0].id].maxHp = 500; return r.events[0].id; };
  const foe = spawn({ q: 2, r: 0 }), other = spawn({ q: 3, r: 1 });
  const hero = s.entities.hero, uses = hero.uses["channel-divinity"];
  assert.ok(uses >= 1, "the paladin has Channel Divinity to spend");
  assert.ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM).ok);
  for (let i = 0; i < 20 && current(s) !== "hero"; i++) assert.ok(apply(s, { type: "endTurn", actor: current(s) }, DM).ok);
  const edge = (id) => modifiers(s, hero, "attack.roll", { target: s.entities[id] }).advantage;
  assert.deepEqual(edge(foe), [], "before: no edge");
  const r = apply(s, { type: "feature", actor: "hero", feature: f.id, target: foe }, DM);
  assert.ok(r.ok, r.error);
  assert.equal(hero.uses["channel-divinity"], uses - 1, "the Channel Divinity use is spent: a cost naming the parent class's pool");
  assert.equal(s.encounter.budget.bonus, 0, "a Bonus Action");
  assert.equal(edge(foe).length, 1, "Advantage on attack rolls against the chosen creature");
  assert.deepEqual(edge(other), [], "and against no other");
  const again = apply(s, { type: "feature", actor: "hero", feature: f.id, target: other }, DM);
  assert.equal(again.ok, false, "one Bonus Action a turn");
  // It is a lasting effect with the action's duration: it is on the holder, bound to the target, and ends with the duration.
  const lasting = JSON.stringify(s.effects ?? {});
  assert.match(lasting, new RegExp(`"against":"${foe}"`), "bound to the target");
  assert.match(lasting, /"name":"Kindle"/);
});

// ---------- fix round 1 (review of #503) ----------
test("a subclass's action has the same work and dice estimate as a homebrew spell's steps, refused in the same words", () => {
  const steps = Array.from({ length: 20 }, () => ({ damage: "50d6", type: "fire", times: 10 }));
  const target = { area: { shape: "sphere", size: 60 } };
  const asSpell = ward({ level: 3, target, effects: [{ save: "dex", half: true, onFail: steps }] });
  const spellWords = lint0("spells", asSpell);
  assert.match(spellWords, /can run [\d,]+ steps, counting every branch.*the most is 600/);
  const big = oath({ spells: undefined, features: [{ ...feature(1), tier: "auto", grants: { action: { time: "action", target, effects: [{ save: "dex", half: true, onFail: steps }] } } }] });
  const words = lint(big).join("\n");
  assert.match(words, /one use \(its action of the feature "hb-ember-folk-f-1"\) can run [\d,]+ steps, counting every branch, every repeat and every creature it reaches \(up to 30 at a table\); the most is 600/);
  no(doc({ subclasses: [big] }), /can run [\d,]+ steps/);
  // The dice: few steps, many dice; and a mode and an option's action count too.
  const dice = (grants) => oath({ spells: undefined, features: [{ ...feature(1), tier: "auto", grants }] });
  const rolls = [{ damage: "40d6", type: "fire", times: 2 }, { damage: "40d6", type: "cold", times: 2 }];
  refused(lint(dice({ action: { time: "action", target: { creature: { count: 20, range: [30, 30] } }, effects: [{ attack: "ranged", kind: "spell", bonus: 5, onHit: rolls }] } })), /can roll [\d,]+ dice/);
  refused(lint(dice({ action: { time: "action", target: { self: true }, modes: [{ id: "a", name: "A", effects: [{ manual: "x" }] }, { id: "b", name: "B", effects: steps }] } })), /can run [\d,]+ steps|can roll [\d,]+ dice/);
  refused(lint(oath({ spells: undefined, features: [feature(1, { options: [{ id: hb("o1"), name: "O1", tier: "auto", text: "x", grants: { action: { time: "action", target, effects: [{ save: "dex", half: true, onFail: steps }] } } }, { id: hb("o2"), name: "O2", tier: "manual", text: "x" }] })] })), /can run [\d,]+ steps/);
  // A modest action (the spec's Kindle) is far inside it.
  assert.deepEqual(lint(oath()), []);
});
function lint0(kind, e) { return lintEntry(kind, e, { pack: P, srd: CONTENT }).join("\n"); }

test("a feature may not claim `checked: true`", () => {
  refused(lint(oath({ features: [feature(1, { checked: true })] })), /feature hb-ember-folk-f-1: homebrew is not checked against any rulebook: `checked` must be false/);
  no(EMBER({ features: [feature(1, { checked: true })] }), /`checked` must be false/);
});

test("a modifier of a subclass may pass 40 only on a speed, up to 120; elsewhere it is held to 40, as a feat's is", () => {
  const mod = (on, value) => oath({ spells: undefined, features: [{ ...feature(1), tier: "auto", grants: { modifiers: [{ on, op: "set", value }] } }] });
  const action = (on, value) => oath({ spells: undefined, features: [{ ...feature(1), tier: "auto", grants: { action: { time: "bonus", duration: "1 minute", target: { self: true }, effects: [{ modifier: { on, op: "add", value } }] } } }] });
  const aura = (on, value) => oath({ spells: undefined, features: [{ ...feature(1), tier: "auto", grants: { aura: { range: 10, modifiers: [{ on, op: "add", value }] } } }] });
  for (const [on, v, ok] of [["speed.fly", 60, true], ["speed", 120, true], ["speed", 121, false], ["speed", 40, true], ["attack.roll", 40, true], ["attack.roll", 41, false], ["ac", 100, false], ["damage.dealt", 100, false], ["check", -41, false]]) {
    for (const make of [mod, action, aura]) {
      const p = lint(make(on, v));
      if (ok) assert.deepEqual(p, [], `${make.name} ${on} ${v}`);
      else refused(p, /only a speed may go past 40 \(up to 120\)|a whole number from -?40 to 40|from -120 to 120|not allowed/);
    }
  }
  refused(lint(mod("ac", 100)), /a modifier on "ac" has the value 100; only a speed may go past 40 \(up to 120\)/);
  refused(lint(mod("speed", 121)), /from -120 to 120/);
  // As a feat's: 40.
  const feat = { id: hb("ember-heart"), name: "Ember Heart", category: "general", tier: "auto", source: SRC, checked: false, text: "x", grants: { modifiers: [{ on: "ac", op: "add", value: 100 }] } };
  refused(lintEntry("feats", feat, { pack: P, srd: CONTENT }), /from -40 to 40/);
});

test("a feature or option id is used once in the whole pack: not a spell's, a feat's, an item's, a subclass's or the subclass's own id", () => {
  const feat = { id: hb("ember-heart"), name: "Ember Heart", category: "general", tier: "auto", source: SRC, checked: false, text: "x", increase: { from: ["con"], points: 1, max: 20 } };
  const item = { id: hb("ember-ring"), name: "Ember Ring", category: "ring", rarity: "uncommon", wear: "ring", tier: "auto", source: SRC, checked: false, text: "x", grants: { modifiers: [{ on: "ac", op: "add", value: 1 }] } };
  const second = oath({ id: hb("oath-two"), name: "Oath of the Hearth", spells: undefined, features: [feature(9)] });
  const pack = (f, extra = {}) => doc({ spells: [ward()], feats: [feat], items: [item], subclasses: [oath({ features: [f] }), second], ...extra });
  for (const [what, id, re] of [["a spell", hb("ember-ward"), /is also the id of spells\/hb-ember-folk-ember-ward/], ["a feat", hb("ember-heart"), /is also the id of feats\/hb-ember-folk-ember-heart/],
    ["an item", hb("ember-ring"), /is also the id of items\/hb-ember-folk-ember-ring/], ["another subclass", hb("oath-two"), /is also the id of subclasses\/hb-ember-folk-oath-two/],
    ["the subclass itself", hb("oath-of-the-ember"), /is also the id of subclasses\/hb-ember-folk-oath-of-the-ember/], ["a feature of another subclass", hb("f-9"), /"hb-ember-folk-f-9" is also used in hb-ember-folk-oath-of-the-ember/]]) {
    const p = lintPack(pack(feature(1, { id })), { strict: true });
    assert.match(p.join("\n"), re, what);
    no(pack(feature(1, { id })), /a feature or option id is used once in the pack/);
  }
  // An option too.
  const withOption = feature(1, { options: [{ id: hb("ember-ward"), name: "A", text: "x", tier: "manual" }, { id: hb("z"), name: "Z", text: "x", tier: "manual" }] });
  refused(lintPack(pack(withOption), { strict: true }), /"hb-ember-folk-ember-ward" is also the id of spells/);
  // The entry alone: its own id.
  refused(lint(oath({ features: [feature(1, { id: hb("oath-of-the-ember") })] })), /is the id of the subclass itself and of one of its features/);
  assert.deepEqual(lintPack(pack(feature(1)), { strict: true }), []);
});

test("`dmNotes` of a subclass or a feature is at most 500 letters", () => {
  assert.deepEqual(lint(clean({ ...oath({ dmNotes: "n".repeat(500), features: [feature(1, { dmNotes: "n".repeat(500) })] }), spells: undefined })), []);
  refused(lint(oath({ dmNotes: "n".repeat(501) })), /the notes for the DM are 501 letters long; the most is 500/);
  refused(lint(oath({ features: [feature(1, { dmNotes: "n".repeat(501) })] })), /feature hb-ember-folk-f-1: the notes for the DM are 501 letters long; the most is 500/);
  no(EMBER({ dmNotes: "n".repeat(1500) }), /notes for the DM are 1500 letters/);
});

test("every refusal is a plain sentence: a non-text id, a feature with no id, a spells key that is not a class level", () => {
  const cases = [
    [oath({ id: { a: 1 } }), /id must be text/],
    [oath({ features: [{ ...feature(1), id: undefined }] }), /features\[0\]\.id must be text/],
    [oath({ features: [clean({ ...feature(1), id: undefined })] }), /feature \(without an id\): needs a kebab-case id/],
    [oath({ spells: { "1e1": ["burning-hands"] } }), /spells: "1e1" is not a class level from 3 to 20/],
    [oath({ spells: { "03": ["burning-hands"] } }), /spells: "03" is not a class level from 3 to 20/],
    [oath({ spells: { x: ["burning-hands"] } }), /spells: "x" is not a class level from 3 to 20/],
    [oath({ features: [{ ...feature(1), tier: "auto", grants: { action: -1 } }] }), /feature hb-ember-folk-f-1: action is \{ time, target, effects/],
  ];
  for (const [e, re] of cases) {
    const alone = lintEntry("subclasses", e, { pack: P, srd: CONTENT, spells: [hb("ember-ward")] }), packed = lintPack(doc({ spells: [ward()], subclasses: [e] }), { strict: true });
    for (const p of [alone, packed]) {
      refused(p, re);
      const text = p.join("\n");
      assert.doesNotMatch(text, /\[object Object\]|undefined|no length is set|NaN/, text);
    }
  }
});

test("a pack without subclasses is sent to players, and hashed for them, byte for byte as before (the hash is main's)", () => {
  const sample = JSON.parse(readFileSync(new URL("./fixtures/sample-pack.json", import.meta.url), "utf8"));
  const kinds = JSON.parse(readFileSync(new URL("./fixtures/reader-kinds-pack.json", import.meta.url), "utf8"));
  // Measured on main before this change: the player hash of each fixture pack.
  assert.equal(forPlayers(sample).hash.slice(0, 10), "629e7b1fec");      // re-measured for #674: the sample pack gained a Stabilize step and a Light step; and for #726 job 5: a Dispel step on Spotter's Eye, and a Revive step in Ember Recall (#762)
  assert.equal(forPlayers(kinds).hash.slice(0, 10), "1040f94f12");
  assert.equal(hashOf(sample).slice(0, 10), "233ac5958c", "and the DM's whole-pack hash");
  assert.equal(Object.hasOwn(forPlayers(sample).data, "subclasses"), false);
});
