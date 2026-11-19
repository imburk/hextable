// Homebrew subclasses, addition J of docs/specs/homebrew-subclasses.md (#516): `formOf`, a feature of a subclass that changes the form of
// another feature (Wild Shape): the highest Challenge Rating (by class level), more creature types, more Temporary Hit Points, a price.
// The subclasses are invented for this test ("Circle of the Ember" and its cousins, a pack "ember-folk"); no published subclass is used.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, missingOf, validate } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { CONTENT } from "../src/content/index.js";
import { loadPack, overlayOf, using } from "../src/content/registry.js";
import { GRANTS, lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { forPlayers } from "../src/content/packs.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const KIM = { role: "player", userId: "kim" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "it was refused"); if (re) assert.match(r.error, re); return r; };
const json = (x) => JSON.stringify(x);

// ---------- the invented pack ----------
const P = "ember-folk", hb = (n) => `hb-${P}-${n}`, SRC = `homebrew:${P}`;
const doc = (lists) => ({ format: "hextable-pack", v: 1, pack: { id: P, name: "Ember Folk", version: 1, license: "CC0, by the author", attribution: "Written for a test." }, ...lists });
const feature = (id, level, grants, more = {}) => ({ id: hb(id), name: id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()), level, tier: "auto", checked: false, text: `The ${id}, in the pack's own words.`, ...(grants ? { grants } : {}), ...more });
const circle = (id, name, features, more = {}) => ({ id: hb(id), name, class: "druid", source: SRC, checked: false, text: "Druids who keep a hearth-fire in every shape.", features, ...more });
const SHAPE = (formOf) => feature("ember-shape", 3, { formOf: { of: "wild-shape", ...formOf } });

// Raises the rating by level (2 at 6, 3 at 10), adds elementals, and more Temporary Hit Points by level.
const EMBER = circle("circle-of-the-ember", "Circle of the Ember", [SHAPE({ maxCr: { byLevel: { 3: 1, 6: 2, 10: 3 } }, types: ["elemental"], tempHp: { byLevel: { 3: 2, 10: 4 } } })]);
// Lower than the class's own rating from level 3 on, so the class's stands.
const CINDER = circle("circle-of-the-cinder", "Circle of the Cinder", [feature("cinder-shape", 3, { formOf: { of: "wild-shape", maxCr: { byLevel: { 3: 0.25 } } } })]);
// An elemental form costs one use of the circle's own pool, not a use of Wild Shape.
const EMBERS = hb("ember-store");
const STORE = circle("circle-of-the-store", "Circle of the Store", [
  feature("ember-store", 3, undefined, { tier: "manual", uses: { max: 3, recharge: "long" } }),
  feature("store-shape", 3, { formOf: { of: "wild-shape", maxCr: 2, types: ["elemental"], cost: { resource: EMBERS } } }),
]);
// An elemental form costs two uses of Wild Shape itself.
const TWOFOLD = circle("circle-of-the-two", "Circle of the Two", [feature("twofold-shape", 3, { formOf: { of: "wild-shape", maxCr: 2, types: ["elemental"], cost: { resource: "wild-shape", n: 2 } } })]);
// A price on every form (no `types`).
const EVERY = circle("circle-of-the-every", "Circle of the Every", [
  feature("every-store", 3, undefined, { tier: "manual", uses: { max: 2, recharge: "long" } }),
  feature("every-shape", 3, { formOf: { of: "wild-shape", cost: { resource: hb("every-store") } } }),
]);
const ALL = [EMBER, CINDER, STORE, TWOFOLD, EVERY];
const pack = (d) => { const r = loadPack(d); assert.ok(r.ok, (r.problems ?? []).join("; ")); return r.pack; };
const PACK = pack(doc({ subclasses: ALL })), ON = overlayOf([PACK]), OFF = overlayOf([]);
const problems = (...subs) => (loadPack(doc({ subclasses: subs })).problems ?? []).join("\n");

// ---------- the characters and the table ----------
const A = { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 };
const druid = (level, subclass = hb("circle-of-the-ember"), more = {}) => ({ name: "Ven", class: "druid", level, ...(level >= 3 ? { subclass } : {}), abilities: A,
  skills: ["nature", "perception"], choices: { "primal-order": "warden", ...(level >= 7 ? { "elemental-fury": "primal-strike" } : {}), ...(level >= 10 ? { "natures-ward": "polar" } : {}) },
  armour: "leather-armor", shield: true, weapons: ["quarterstaff"], spells: ["produce-flame", "cure-wounds"], ...more });
const land = (level) => druid(level, "land");
const form = (sheet) => derive(sheet).record.feats.find((f) => f.id === "wild-shape").action.form;

function field(sheet) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (!["rogue", "m1"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  s.entities.hero.sheet = structuredClone(sheet);
  ok(apply(s, { type: "claim", entity: "hero", user: "pat", userName: "Pat" }, PAT));
  ok(apply(s, { type: "place", actor: "rogue", to: { q: -3, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "m1", to: { q: 2, r: 0 } }, DM));
  return s;
}
const shape = (s, to, ctx = DM) => apply(s, { type: "feature", actor: "hero", feature: "wild-shape", ...(to ? { form: to } : {}) }, ctx);
const leave = (s) => ok(shape(s, null));

// ---------- the grant is a closed, checked word ----------
test("the pack of invented circles loads in strict mode, and the entry is read as a subclass", () => {
  assert.ok(GRANTS.includes("formOf"));
  for (const e of ALL) assert.deepEqual(lintEntry("subclasses", e, { pack: P, srd: CONTENT }), [], e.id);
  for (const e of ALL) assert.deepEqual(readEntry("subclasses", e, { spells: [] }).problems, [], e.id);
});

test("what a circle's formOf says is read in words: the rating by level, the types, the Temporary Hit Points, the price", () => {
  const lines = readEntry("subclasses", EMBER, { spells: [] }).lines.join("\n");
  assert.match(lines, /Changes the form of the feature "wild-shape"/);
  assert.match(lines, /Challenge Rating that grows with the class level \(1 from level 3, 2 from level 6 and 3 from level 10\), where that is higher than they already may be/);
  assert.match(lines, /adds elemental creatures to the forms it may take/);
  assert.match(lines, /gives a number that grows with the class level more Temporary Hit Points on taking a form/);
  const store = readEntry("subclasses", STORE, { spells: [] }).lines.join("\n");
  assert.match(store, /A form of a type it adds spends 1 use of the feature "hb-ember-folk-ember-store" instead of a use of "wild-shape"/);
  assert.match(readEntry("subclasses", TWOFOLD, { spells: [] }).lines.join("\n"), /spends 2 uses of the feature "wild-shape"/);
  assert.match(readEntry("subclasses", EVERY, { spells: [] }).lines.join("\n"), /Every form spends 1 use/);
  // A feat holds the key and changes nothing, and the reading says so.
  const featText = readEntry("feat", { id: "hb-t-f", name: "F", category: "general", tier: "assist", source: "homebrew:t", checked: false, text: "t", grants: { formOf: { of: "wild-shape", maxCr: 2 } } }).lines.join("\n");
  assert.match(featText, /A feat or an item belongs to no class, so the engine adds nothing/);
});

test("the gate refuses a formOf that is not whole, each with a sentence", () => {
  const one = (formOf, level = 3) => problems(circle("c-x", "Circle of X", [feature("x-shape", level, { formOf })]));
  assert.equal(one({ of: "wild-shape", maxCr: 2 }), "");
  // the feature is absent, or the class lacks it
  assert.match(one({ of: "wild-shaep", maxCr: 2 }), /names "wild-shaep", which is neither a feature of the Druid nor of this subclass/);
  assert.match(problems({ ...circle("c-x", "Circle of X", [feature("x-shape", 3, { formOf: { of: "wild-shape", maxCr: 2 } })]), class: "paladin" }), /names "wild-shape", which is neither a feature of the Paladin nor of this subclass/);
  assert.match(one({ of: "wild-companion", maxCr: 2 }), /"wild-companion", which does not take a form/);
  // the shape
  assert.match(one({ of: "wild-shape" }), /formOf changes something: maxCr, types, tempHp or cost/);
  assert.match(one({ maxCr: 2 }), /formOf names the feature whose form it changes/);
  assert.match(one({ of: "wild-shape", fly: 1 }), /"fly" is not something a form grant has/);
  assert.match(one({ of: "wild-shape", hours: 3 }), /"hours" is not something a form grant has/);
  assert.match(one({ of: "wild-shape", types: ["robot"] }), /formOf.types lists creature types, each once/);
  assert.match(one({ of: "wild-shape", types: ["elemental", "elemental"] }), /formOf.types lists creature types, each once/);
  assert.match(one({ of: "wild-shape", types: [] }), /formOf.types lists creature types/);
  assert.match(one({ of: "wild-shape", types: ["beast"] }), /formOf.types lists "beast", a type Wild Shape already takes/);
  // the rating
  assert.match(one({ of: "wild-shape", maxCr: 31 }), /formOf.maxCr: 31 is not allowed; a number from 0 to 30/);
  assert.match(one({ of: "wild-shape", maxCr: 0.3 }), /formOf.maxCr: 0.3 is not allowed; a number from 0 to 30/);
  assert.match(one({ of: "wild-shape", maxCr: { byLevel: { 3: 2, 99: 3 } } }), /formOf.maxCr is a Challenge Rating/);
  assert.match(one({ of: "wild-shape", maxCr: { byLevel: { 3: 2.3 } } }), /formOf.maxCr.byLevel.3: 2.3 is not allowed/);
  assert.match(one({ of: "wild-shape", maxCr: { perLevel: 1 } }), /formOf.maxCr is a Challenge Rating/);
  assert.match(one({ of: "wild-shape", maxCr: "2" }), /formOf.maxCr must be a number or an object/);
  assert.equal(one({ of: "wild-shape", maxCr: { byLevel: { 3: 0.125, 6: 0.5, 10: 4 } } }), "", "fractions of eighths are Challenge Ratings");
  // the Temporary Hit Points are a number or an amount of the class, never dice
  assert.match(one({ of: "wild-shape", tempHp: "1d6" }), /formOf.tempHp must be a whole number or an object/);
  assert.match(one({ of: "wild-shape", tempHp: { column: "nothing" } }), /no column "nothing" in the class table/);
  assert.equal(one({ of: "wild-shape", tempHp: { perLevel: 2 } }), "");
  // the price names a pool of this class or subclass, with at most 10 uses, and a subclass gives one
  assert.match(one({ of: "wild-shape", cost: { resource: "wild-companion" } }), /a cost names "wild-companion", which is not a feature with uses/);
  assert.match(one({ of: "wild-shape", cost: { resource: "channel-divinity" } }), /a cost names "channel-divinity"/);
  assert.match(one({ of: "wild-shape", cost: { resource: "wild-shape", n: 11 } }), /formOf.cost is { resource, n\? }, n from 1 to 10/);
  assert.match(one({ of: "wild-shape", cost: { resource: "wild-shape", n: 0 } }), /formOf.cost is { resource, n\? }/);
  assert.match(one({ of: "wild-shape", cost: { resource: "wild-shape", also: 1 } }), /"also" is not something the price of a form has/);
  assert.match(problems(circle("c-x", "Circle of X", [feature("a-shape", 3, { formOf: { of: "wild-shape", cost: { resource: "wild-shape" } } }), feature("b-shape", 4, { formOf: { of: "wild-shape", cost: { resource: "wild-shape", n: 2 } } })])),
    /gives Wild Shape a second price: a subclass has one price for its forms/);
  assert.equal(problems(circle("c-x", "Circle of X", [feature("a-shape", 3, { formOf: { of: "wild-shape", maxCr: 2 } }), feature("b-shape", 4, { formOf: { of: "wild-shape", tempHp: 3 } })])), "", "two grants, one price at most");
  // a subclass feature may be below level 3 only as the gate already says
  assert.match(one({ of: "wild-shape", maxCr: 2 }, 2), /a whole number from 3 to 20/);
});

test("only a subclass's feature may change a form: a homebrew feat or item that holds the key is refused", () => {
  const feat = { id: hb("form-feat"), name: "Form Feat", category: "general", tier: "assist", source: SRC, checked: false, text: "t", grants: { formOf: { of: "wild-shape", maxCr: 2 } } };
  assert.match((loadPack(doc({ feats: [feat] })).problems ?? []).join("\n"), /Only a subclass's feature can change the form of a class feature \(formOf\)/);
  const item = { id: hb("form-ring"), name: "Form Ring", category: "wondrous", rarity: "rare", wear: "carried", tier: "assist", source: SRC, checked: false, text: "t", grants: { formOf: { of: "wild-shape", maxCr: 2 } } };
  assert.match((loadPack(doc({ items: [item] })).problems ?? []).join("\n"), /Only a subclass's feature can change the form of a class feature \(formOf\)/);
});

// ---------- derive: where the level-dependent values live ----------
test("derive: the rating and the Temporary Hit Points go by the druid's level, as the class's own do; the higher rating stands; the types are added", () => {
  using(ON, () => {
    // Level 3: the class's own is CR 1/4, 2 Temporary Hit Points a level... (3 at level 3); the circle gives CR 1, 2 more, and elementals.
    assert.deepEqual(form(land(3)), { types: ["beast"], maxCr: 0.25, fly: 0, hours: 1, tempHp: 3 });
    assert.deepEqual(form(druid(3)), { types: ["beast", "elemental"], maxCr: 1, fly: 0, hours: 1, tempHp: 5 });
    assert.deepEqual(validate(druid(3)), []);
    assert.deepEqual(form(druid(6)), { types: ["beast", "elemental"], maxCr: 2, fly: 0, hours: 3, tempHp: 8 });
    assert.deepEqual(form(druid(8)), { types: ["beast", "elemental"], maxCr: 2, fly: 1, hours: 4, tempHp: 10 }, "the class's CR 1 is lower than the circle's 2");
    assert.deepEqual(form(druid(10)), { types: ["beast", "elemental"], maxCr: 3, fly: 1, hours: 5, tempHp: 14 });
    // The class's own limit is higher: it stands (CR 1 at level 8 against the circle's 1/4).
    assert.deepEqual(form(druid(8, hb("circle-of-the-cinder"))), form(land(8)));
    assert.equal(form(druid(3, hb("circle-of-the-cinder"))).maxCr, 0.25);
    // A price is on the form, naming the types it covers (the ones the circle added), the pool and how many.
    assert.deepEqual(form(druid(6, hb("circle-of-the-store"))).cost, { resource: EMBERS, n: 1, types: ["elemental"] });
    assert.deepEqual(form(druid(6, hb("circle-of-the-two"))).cost, { resource: "wild-shape", n: 2, types: ["elemental"] });
    assert.deepEqual(form(druid(6, hb("circle-of-the-every"))).cost, { resource: hb("every-store"), n: 1 }, "no types: every form");
    // Nothing else of the form moved (its flying, its hours), and the class's content is never written to.
    assert.equal(form(druid(6, hb("circle-of-the-store"))).hours, 3);
  });
});

test("derive: the class's content is not changed by a circle, and the record's other features are as the class gives them", () => {
  const before = json(CONTENT.classes.druid);
  using(ON, () => { derive(druid(10)); derive(druid(6, hb("circle-of-the-store"))); });
  assert.equal(json(CONTENT.classes.druid), before);
  using(ON, () => {
    const mine = derive(druid(6)).record, theirs = derive(land(6)).record;
    const ws = (r) => r.feats.find((f) => f.id === "wild-shape");
    assert.deepEqual({ ...ws(mine), action: { ...ws(mine).action, form: null } }, { ...ws(theirs), action: { ...ws(theirs).action, form: null } }, "Wild Shape itself: its uses and its action are the class's");
    assert.ok(mine.feats.some((f) => f.id === hb("ember-shape")) && !theirs.feats.some((f) => f.id === hb("ember-shape")), "the circle's own feature is the character's");
  });
});

test("derive: a circle's rating goes by the druid levels, not the character's (a druid 4 / fighter 3)", () => {
  using(ON, () => {
    const multi = { name: "Ven", classes: [{ class: "druid", level: 4, subclass: hb("circle-of-the-ember") }, { class: "fighter", level: 3, subclass: "champion" }],
      abilities: A, skills: ["nature", "perception", "athletics"], choices: { "primal-order": "warden", "fighting-style": "defense" }, armour: "leather-armor", shield: true, weapons: ["quarterstaff"], spells: ["produce-flame", "cure-wounds"] };
    assert.equal(form(multi).maxCr, 1, "the level 3 entry, not the level 6 entry the character's seven levels would reach");
    assert.equal(form(multi).tempHp, 4 + 2, "the class's own 4 and the circle's 2");
  });
});

test("an SRD-only game is unchanged: no circle, no `cost`, the class's own form, with the pack's overlay in or out", () => {
  const same = (l) => ({ types: ["beast"], maxCr: [0, 0, 0.25, 0.25, 0.5, 0.5, 0.5, 1][l] ?? 1 });
  for (const l of [2, 4, 8, 14, 20]) {
    const plain = derive(land(l)).record;
    using(ON, () => assert.equal(json(derive(land(l)).record), json(plain), `a level ${l} druid of the SRD circle is made the same with the pack lent`));
    const f = plain.feats.find((x) => x.id === "wild-shape").action.form;
    assert.deepEqual(Object.keys(f).sort(), ["fly", "hours", "maxCr", "tempHp", "types"]);
    assert.equal(f.cost, undefined);
    assert.deepEqual(f.types, ["beast"]);
    if (l <= 8) assert.equal(f.maxCr, same(l).maxCr);
  }
  assert.deepEqual(form(land(14)), { types: ["beast"], maxCr: 1, fly: 1, hours: 7, tempHp: 14 });
});

// ---------- the engine: shapeShift ----------
test("a circle's forms are played: an elemental at the circle's rating, the Temporary Hit Points more, one use of Wild Shape; the SRD circle refuses the same form", () => {
  using(ON, () => {
    const s = field(druid(6)), e = s.entities.hero;
    assert.equal(e.uses["wild-shape"], 3);
    const r = ok(shape(s, "azer-sentinel"));
    assert.equal(e.form.block, "azer-sentinel");
    assert.equal(e.uses["wild-shape"], 2, "one use of Wild Shape");
    assert.equal(e.tempHp, 6 + 2, "the class's Temporary Hit Points (the druid level) and the circle's 2");
    assert.ok(r.events.some((x) => x.type === "form" && x.form === "azer-sentinel"));
    leave(s);
    // A beast within the circle's higher rating, which the class alone does not reach at level 6 (CR 1/2).
    ok(shape(s, "allosaurus")); assert.equal(e.uses["wild-shape"], 1); leave(s);
    // Past the circle's rating: refused with the number the character has, and nothing changes.
    const before = json(s);
    no(shape(s, "ankylosaurus"), /At Ven's level Wild Shape takes forms of Challenge Rating 2 or lower; the Ankylosaurus is 3\./);
    assert.equal(json(s), before, "a refused form changes nothing");
    // A type the feature does not take (the circle adds elementals only), and a Fly Speed a level 6 druid does not have.
    no(shape(s, "goblin-warrior"), /takes the form of a beast or elemental; the Goblin Warrior is not one/);
    no(shape(s, "gargoyle"), /can't take a form with a Fly Speed/);
    assert.equal(json(s), before);

    const srd = field(land(6));
    no(shape(srd, "azer-sentinel"), /takes the form of a beast; the Azer Sentinel is not one/);
    no(shape(srd, "allosaurus"), /Challenge Rating 1\/2 or lower; the Allosaurus is 2/);
    assert.equal(srd.entities.hero.uses["wild-shape"], 3);
  });
});

test("a circle raises the rating at its own level: a bear at level 3 for the circle, not for the SRD circle", () => {
  using(ON, () => {
    const s = field(druid(3));
    ok(shape(s, "brown-bear")); assert.equal(s.entities.hero.tempHp, 3 + 2);
    no(shape(field(land(3)), "brown-bear"), /Challenge Rating 1\/4 or lower; the Brown Bear is 1/);
    // The Cinder circle's lower rating leaves the class's own: a level 8 druid takes a CR 1 form and not a CR 2.
    const c = field(druid(8, hb("circle-of-the-cinder")));
    no(shape(c, "polar-bear"), /Challenge Rating 1 or lower; the Polar Bear is 2/);
    ok(shape(c, "brown-bear"));
  });
});

test("a price in another pool: an elemental form spends that pool and not Wild Shape's uses; a beast form is the class's", () => {
  using(ON, () => {
    const s = field(druid(6, hb("circle-of-the-store"))), e = s.entities.hero;
    assert.equal(e.uses[EMBERS], 3); assert.equal(e.uses["wild-shape"], 3);
    ok(shape(s, "azer-sentinel"));
    assert.equal(e.uses[EMBERS], 2, "one use of the circle's pool"); assert.equal(e.uses["wild-shape"], 3, "and none of Wild Shape");
    ok(shape(s, "wolf"));                                           // a change of form in one action; a beast is the class's: a use of Wild Shape
    assert.equal(e.uses[EMBERS], 2); assert.equal(e.uses["wild-shape"], 2);
    ok(shape(s, "azer-sentinel")); ok(shape(s, "magmin"));
    assert.equal(e.uses[EMBERS], 0); assert.equal(e.uses["wild-shape"], 2);
    // The pool is empty: refused with its name and the price, nothing changes, and Wild Shape's uses are not the way round it.
    leave(s);
    const before = json(s);
    no(shape(s, "azer-sentinel"), /Ven has 0 uses of Ember store left; the form of a Azer Sentinel costs 1\./);
    assert.equal(json(s), before);
    ok(shape(s, "wolf")); assert.equal(e.uses["wild-shape"], 1, "a beast still costs Wild Shape's");
  });
});

test("a price of two uses of Wild Shape itself: an elemental form costs two, a beast one, and too few is refused", () => {
  using(ON, () => {
    const s = field(druid(6, hb("circle-of-the-two"))), e = s.entities.hero;
    assert.equal(e.uses["wild-shape"], 3);
    ok(shape(s, "azer-sentinel")); assert.equal(e.uses["wild-shape"], 1);
    leave(s);
    const before = json(s);
    no(shape(s, "azer-sentinel"), /Ven has 1 use of Wild Shape left; the form of a Azer Sentinel costs 2\./);
    assert.equal(json(s), before);
    ok(shape(s, "wolf")); assert.equal(e.uses["wild-shape"], 0);
    leave(s);
    no(shape(s, "wolf"), /Ven has no uses of Wild Shape left\./);
  });
});

test("a price on every form: a beast costs that pool too", () => {
  using(ON, () => {
    const s = field(druid(6, hb("circle-of-the-every"))), e = s.entities.hero;
    ok(shape(s, "wolf"));
    assert.equal(e.uses[hb("every-store")], 1); assert.equal(e.uses["wild-shape"], 3);
    ok(shape(s, "wolf")); assert.equal(e.uses[hb("every-store")], 0);
    leave(s);
    no(shape(s, "wolf"), /Ven has 0 uses of Every store left; the form of a Wolf costs 1\./);
  });
});

test("in a fight a refused form spends no Bonus Action, and an accepted one spends it as ever", () => {
  using(ON, () => {
    const s = field(druid(6, hb("circle-of-the-two"))), e = s.entities.hero;
    ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
    for (let i = 0; i < 20 && current(s) !== "hero"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    assert.equal(current(s), "hero");
    e.uses["wild-shape"] = 1;
    const bonus = s.encounter.budget.bonus, before = json(s);
    no(shape(s, "azer-sentinel"), /costs 2/);
    assert.equal(json(s), before); assert.equal(s.encounter.budget.bonus, bonus);
    ok(shape(s, "wolf"));
    assert.equal(s.encounter.budget.bonus, bonus - 1);
  });
});

// ---------- the overlay removed and back ----------
test("the overlay removed: forms are the class's own again; the overlay back: the circle's", () => {
  const s = newGame(5, { party: [{ sheet: druid(2, undefined) }] });
  let hero;
  using(ON, () => {
    hero = ok(apply(s, { type: "setSheet", sheet: druid(6) }, DM)).events.find((x) => x.type === "spawned").id;
    assert.deepEqual(s.entities[hero].feats.find((f) => f.id === "wild-shape").action.form, { types: ["beast", "elemental"], maxCr: 2, fly: 0, hours: 3, tempHp: 8 });
  });
  const gone = ok(apply(s, { type: "refresh", actor: hero }, DM));
  const classOwn = form(land(6));
  assert.deepEqual(s.entities[hero].feats.find((f) => f.id === "wild-shape").action.form, classOwn);
  assert.deepEqual(classOwn, { types: ["beast"], maxCr: 0.5, fly: 0, hours: 3, tempHp: 6 });
  assert.equal(gone.events.filter((x) => x.type === "manual").length, 1, "the DM is told the subclass is missing, as for any subclass");
  assert.deepEqual(missingOf(s.entities[hero].sheet).map((m) => m.id), [hb("circle-of-the-ember")]);
  s.entities[hero].pos = { q: 0, r: 0, z: 0 };
  no(apply(s, { type: "feature", actor: hero, feature: "wild-shape", form: "azer-sentinel" }, DM), /takes the form of a beast; the Azer Sentinel is not one/);
  using(ON, () => {
    ok(apply(s, { type: "refresh", actor: hero }, DM));
    assert.deepEqual(s.entities[hero].feats.find((f) => f.id === "wild-shape").action.form, { types: ["beast", "elemental"], maxCr: 2, fly: 0, hours: 3, tempHp: 8 });
    ok(apply(s, { type: "feature", actor: hero, feature: "wild-shape", form: "azer-sentinel" }, DM));
  });
});

// ---------- what players are sent ----------
test("what a player is sent about another's form is what it was: the event and an enemy's form are the same with a circle as without", () => {
  using(ON, () => {
    const seen = (sheet) => {
      const s = field(sheet);
      const r = ok(shape(s, "wolf"));
      const ev = viewEvents(r.events, s, KIM).find((x) => x.type === "form");
      // An enemy in a form shows only as the creature it has become (seenRecord).
      s.entities.foe = { ...structuredClone(s.entities.hero), id: "foe", side: "foe", kind: "npc", owner: null, pos: { q: -1, r: 1, z: 0 } };
      const foe = view(s, PAT).entities.foe;
      return { ev, foe, party: view(s, KIM).entities.hero.form };
    };
    const mine = seen(druid(6, hb("circle-of-the-ember"))), theirs = seen(land(6));
    assert.deepEqual(mine.ev, { type: "form", id: "hero", form: "wolf", name: "Wolf" });
    assert.deepEqual(mine.ev, theirs.ev);
    assert.equal(mine.foe?.tpl, "wolf"); assert.equal(mine.foe?.name, "Wolf");
    assert.equal(json(Object.keys(mine.foe).sort()), json(Object.keys(theirs.foe).sort()), "the same fields of an enemy in a form");
    assert.equal(json(mine.foe.feats ?? null), json(theirs.foe.feats ?? null), "an enemy's features are not sent either way");
    assert.deepEqual(Object.keys(mine.party).sort(), Object.keys(theirs.party).sort());
    assert.equal(json(mine.foe).includes("azer"), false);
    assert.equal(json(mine.foe).includes("cost"), false, "no price in what an enemy shows");
  });
});

test("a player's pack copy is what B1 sent: the circle with its features, no `dmNotes`; the grant adds no field to it", async () => {
    const withNotes = { ...EMBER, id: hb("circle-with-notes"), name: "Circle of the Notes", dmNotes: "A note for the DM.", features: [{ ...SHAPE({ maxCr: 2 }), id: hb("note-shape"), dmNotes: "Keep it quiet." }] };
  const data = doc({ subclasses: [withNotes] });
  pack(data);
  const { data: copy } = forPlayers(data);
  const sub = copy.subclasses.find((x) => x.id === withNotes.id);
  assert.ok(sub, "a player is sent the subclass");
  assert.equal(sub.dmNotes, undefined); assert.equal(sub.features[0].dmNotes, undefined);
  assert.deepEqual(sub.features[0].grants, { formOf: { of: "wild-shape", maxCr: 2 } });
});
