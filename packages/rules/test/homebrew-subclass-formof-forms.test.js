// Homebrew subclasses, addition J of docs/specs/homebrew-subclasses.md, second part (#525): `formOf` with a rating for the types it adds alone (`typesMaxCr`) and
// with named forms (`forms`), and `inForm` on a feature's action ("while in a Wild Shape form"). The subclasses are invented for this test ("Circle of the Cairn" and
// its cousins, a pack "cairn-folk"); no published subclass is used.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { CONTENT } from "../src/content/index.js";
import { loadPack, overlayOf, using } from "../src/content/registry.js";
import { lintEntry, lintRecord } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { forPlayers } from "../src/content/packs.js";
import { view } from "../src/view.js";
import { effectsOf } from "../src/durations.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const KIM = { role: "player", userId: "kim" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "it was refused"); if (re) assert.match(r.error, re); return r; };
const json = (x) => JSON.stringify(x);

// ---------- the invented pack ----------
const P = "cairn-folk", hb = (n) => `hb-${P}-${n}`, SRC = `homebrew:${P}`;
const doc = (lists) => ({ format: "hextable-pack", v: 1, pack: { id: P, name: "Cairn Folk", version: 1, license: "CC0, by the author", attribution: "Written for a test." }, ...lists });
const feature = (id, level, grants, more = {}) => ({ id: hb(id), name: id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()), level, tier: "auto", checked: false, text: `The ${id}, in the pack's own words.`, ...(grants ? { grants } : {}), ...more });
const circle = (id, name, features) => ({ id: hb(id), name, class: "druid", source: SRC, checked: false, text: "Druids who stack a stone for every shape.", features });
const FO = (formOf, level = 3, id = "stone-shape") => feature(id, level, { formOf: { of: "wild-shape", ...formOf } });
const ELEMENTALS = ["air-elemental", "earth-elemental", "fire-elemental", "water-elemental"];

// A pack monster of the elemental type, for a form named from the pack itself.
const PEBBLE = { ...structuredClone(CONTENT.monsters["goblin-warrior"]), id: hb("pebble-sprite"), name: "Pebble Sprite", source: SRC, checked: false, type: "elemental", cr: 3, xp: 700 };

// Elementals as a type, up to CR 2 from level 6 and CR 5 from level 10: nothing at level 3 to 5 (a rating no level has reached adds no type yet).
const CAIRN = circle("circle-of-the-cairn", "Circle of the Cairn", [FO({ types: ["elemental"], typesMaxCr: { byLevel: { 6: 2, 10: 5 } } })]);
// A rating below the class's own for the type it adds: elementals up to CR 1/2 though beasts reach CR 1 at level 8.
const ASH = circle("circle-of-the-ash", "Circle of the Ash", [FO({ types: ["elemental"], typesMaxCr: 0.5 }, 3, "ash-shape")]);
// maxCr is every form's and typesMaxCr the added type's alone: beasts up to CR 3, elementals up to CR 5.
const BOTH = circle("circle-of-the-both", "Circle of the Both", [FO({ maxCr: 3, types: ["elemental"], typesMaxCr: 5 }, 3, "both-shape")]);
// Two features add the same type: one with a rating of its own below the feature's, one with none (so the feature's rating stands); and the reverse above it.
const TWICE = circle("circle-of-the-twice", "Circle of the Twice", [FO({ types: ["elemental"], typesMaxCr: 1 }, 3, "twice-a"), FO({ maxCr: 2, types: ["elemental"] }, 3, "twice-b")]);
const ABOVE = circle("circle-of-the-above", "Circle of the Above", [FO({ types: ["elemental"], typesMaxCr: 5 }, 3, "above-a"), FO({ maxCr: 2, types: ["elemental"] }, 3, "above-b")]);
// The four elementals by name.
const FOUR = circle("circle-of-the-four", "Circle of the Four", [FO({ forms: ELEMENTALS }, 3, "four-shape")]);
// The four by name, priced in the circle's own pool; a beast is Wild Shape's.
const STORE = hb("four-store");
const PRICED = circle("circle-of-the-priced", "Circle of the Priced", [
  feature("four-store", 3, undefined, { tier: "manual", uses: { max: 2, recharge: "long" } }),
  FO({ forms: ELEMENTALS, cost: { resource: STORE } }, 3, "priced-shape"),
]);
// A type with its own rating and a form by name on top of it, one price for both; a pack monster by name.
const MANY = circle("circle-of-the-many", "Circle of the Many", [
  feature("many-store", 3, undefined, { tier: "manual", uses: { max: 3, recharge: "long" } }),
  FO({ types: ["elemental"], typesMaxCr: 1, forms: ["fire-elemental", hb("pebble-sprite")], cost: { resource: hb("many-store"), n: 2 } }, 3, "many-shape"),
]);
// "While in a Wild Shape form": heal with a slot (1d8, and 1d8 a level above 1st); a free-of-cost one; one of a form of the circle's own.
const EMBER_SKIN = feature("ember-skin", 3, { action: { time: "bonus", target: { self: true }, form: { types: ["elemental"], maxCr: 1, fly: 0, hours: 1 } } }, { uses: { max: 1, recharge: "long" } });
const HEARTH = circle("circle-of-the-hearth", "Circle of the Hearth", [
  feature("hearth-mend", 3, { action: { time: "bonus", target: { self: true }, effects: [{ heal: "1d8" }], cost: { slot: 1, higher: { heal: "1d8" } }, inForm: "wild-shape" } }),
  feature("hearth-sip", 3, { action: { time: "bonus", target: { self: true }, effects: [{ heal: "1d4" }], inForm: "wild-shape" } }, { uses: { max: 2, recharge: "long" } }),
  EMBER_SKIN,
  feature("skin-sip", 3, { action: { time: "bonus", target: { self: true }, effects: [{ heal: "1d4" }], inForm: hb("ember-skin") } }),
]);
const ALL = [CAIRN, ASH, BOTH, TWICE, ABOVE, FOUR, PRICED, MANY, HEARTH];
const pack = (d) => { const r = loadPack(d); assert.ok(r.ok, (r.problems ?? []).join("; ")); return r.pack; };
const PACK = pack(doc({ subclasses: ALL, monsters: [PEBBLE] })), ON = overlayOf([PACK]);
const problems = (...subs) => (loadPack(doc({ subclasses: subs, monsters: [PEBBLE] })).problems ?? []).join("\n");
const one = (formOf, level = 3) => problems(circle("c-x", "Circle of X", [FO(formOf, level, "x-shape")]));

// ---------- the characters and the table ----------
const A = { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 };
const druid = (level, c = "circle-of-the-cairn") => ({ name: "Ven", class: "druid", level, ...(level >= 3 ? { subclass: hb(c) } : {}), abilities: A,
  skills: ["nature", "perception"], choices: { "primal-order": "warden", ...(level >= 7 ? { "elemental-fury": "primal-strike" } : {}), ...(level >= 10 ? { "natures-ward": "polar" } : {}) },
  armour: "leather-armor", shield: true, weapons: ["quarterstaff"], spells: ["produce-flame", "cure-wounds"] });
const form = (sheet) => derive(sheet).record.feats.find((f) => f.id === "wild-shape").action.form;
function field(sheet, hp) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (!["rogue", "m1"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  s.entities.hero.sheet = structuredClone(sheet);
  if (hp !== undefined) s.entities.hero.hp = hp;
  ok(apply(s, { type: "claim", entity: "hero", user: "pat", userName: "Pat" }, PAT));
  ok(apply(s, { type: "place", actor: "rogue", to: { q: -3, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "m1", to: { q: 4, r: 0 } }, DM));
  return s;
}
const shape = (s, to, id = "wild-shape") => apply(s, { type: "feature", actor: "hero", feature: id, ...(to ? { form: to } : {}) }, DM);
const use = (s, id, more = {}) => apply(s, { type: "feature", actor: "hero", feature: id, ...more }, DM);

// ---------- the pack loads, and is read ----------
test("the invented circles load in strict mode and are read as subclasses", () => {
  for (const e of ALL) assert.deepEqual(lintEntry("subclasses", e, { pack: P, srd: CONTENT }), [], e.id);
  for (const e of ALL) assert.deepEqual(readEntry("subclasses", e, { spells: [] }).problems, [], e.id);
});

test("the reading says a rating for the added types alone, the named forms, the price they share, and `inForm`", () => {
  const lines = (c) => readEntry("subclasses", c, { spells: [] }).lines.join("\n");
  assert.match(lines(CAIRN), /adds elemental creatures to the forms it may take/);
  assert.match(lines(CAIRN), /lets the forms of those added types alone be of a Challenge Rating that grows with the class level \(2 from level 6 and 5 from level 10\), whatever the feature's own limit is, and adds none of them before the first of those levels/);
  assert.match(lines(ASH), /lets the forms of those added types alone be of Challenge Rating 1\/2 or lower, whatever the feature's own limit is/);
  assert.match(lines(FOUR), /adds "air-elemental", "earth-elemental", "fire-elemental" and "water-elemental" to the forms it may take, each by name, of any type and any Challenge Rating/);
  assert.match(lines(PRICED), /A form it names spends 1 use of the feature "hb-cairn-folk-four-store" instead of a use of "wild-shape"/);
  assert.match(lines(MANY), /A form of a type it adds or one it names spends 2 uses of the feature "hb-cairn-folk-many-store"/);
  assert.match(lines(HEARTH), /It can be used only while the holder is in a form that the feature "wild-shape" gave; otherwise it is refused and nothing is spent\. Only a holder who has the feature "wild-shape" gets anything from this\./);
});

// ---------- the gate ----------
test("the gate refuses a typesMaxCr that is not whole, each with a sentence, and leaves `maxCr` meaning every form", () => {
  assert.equal(one({ types: ["elemental"], typesMaxCr: 5 }), "");
  assert.equal(one({ types: ["elemental"], typesMaxCr: { byLevel: { 6: 0.125, 10: 5 } } }), "", "fractions of eighths");
  assert.equal(one({ maxCr: 3, types: ["elemental"] }), "", "maxCr with types is as it was");
  assert.match(one({ typesMaxCr: 5 }), /formOf changes something/);
  assert.match(one({ maxCr: 2, typesMaxCr: 5 }), /formOf.typesMaxCr is the rating of the types the grant adds, so it needs `types` \(maxCr is the rating of every form\)/);
  assert.match(one({ types: ["elemental"], typesMaxCr: 31 }), /formOf.typesMaxCr: 31 is not allowed; a number from 0 to 30/);
  assert.match(one({ types: ["elemental"], typesMaxCr: 0.3 }), /formOf.typesMaxCr: 0.3 is not allowed/);
  assert.match(one({ types: ["elemental"], typesMaxCr: { byLevel: { 3: 2, 99: 3 } } }), /formOf.typesMaxCr is a Challenge Rating/);
  assert.match(one({ types: ["elemental"], typesMaxCr: { byLevel: { 3: 2.3 } } }), /formOf.typesMaxCr.byLevel.3: 2.3 is not allowed/);
  assert.match(one({ types: ["elemental"], typesMaxCr: { perLevel: 1 } }), /formOf.typesMaxCr is a Challenge Rating/);
  assert.match(one({ types: ["elemental"], typesMaxCr: "5" }), /formOf.typesMaxCr must be a number or an object/);
});

test("the gate refuses named forms that are not whole, each with a sentence, checked against the SRD and the pack", () => {
  assert.equal(one({ forms: ELEMENTALS }), "");
  assert.equal(one({ forms: [hb("pebble-sprite")] }), "", "a monster of the pack");
  assert.equal(one({ types: ["elemental"], typesMaxCr: 1, forms: ["fire-elemental"] }), "", "a form of a type the grant adds is the one above that type's own rating");
  assert.match(one({ forms: [] }), /formOf.forms lists monsters by id, from 1 to 20, each once/);
  assert.match(one({ forms: ["air-elemental", "air-elemental"] }), /formOf.forms lists monsters by id, from 1 to 20, each once/);
  assert.match(one({ forms: ["Air Elemental"] }), /forms must be a list of kebab-case names|formOf.forms lists monsters by id/);
  assert.match(one({ forms: Array.from({ length: 21 }, (_, i) => `form-${i}`) }), /forms: a list of 21; the most is 20/);
  assert.match(one({ forms: "air-elemental" }), /forms must be a list of kebab-case names/);
  assert.match(one({ forms: ["air-elemantal"] }), /feature hb-cairn-folk-x-shape: formOf.forms names "air-elemantal", which is not a monster of the SRD or of this pack/);
  assert.match(one({ forms: [hb("no-such-thing")] }), /formOf.forms names "hb-cairn-folk-no-such-thing", which is not a monster of the SRD or of this pack/);
  assert.match(one({ forms: ["hb-other-pack-thing"] }), /formOf.forms names "hb-other-pack-thing", which is not a monster of the SRD or of this pack/);
  assert.match(one({ forms: ["wolf"] }), /formOf.forms names "wolf", a beast, a type Wild Shape already takes/);
  // a priced named form follows the same price rules as a priced type
  assert.match(one({ forms: ELEMENTALS, cost: { resource: "wild-companion" } }), /a cost names "wild-companion", which is not a feature with uses/);
  assert.equal(problems(circle("c-x", "Circle of X", [feature("x-pool", 3, undefined, { tier: "manual", uses: { max: 2, recharge: "long" } }), FO({ forms: ELEMENTALS, cost: { resource: hb("x-pool") } })])), "");
});

test("the gate refuses `inForm` that is not whole, each with a sentence; a feat or an item cannot say it", () => {
  const act = (more = {}) => ({ action: { time: "bonus", target: { self: true }, effects: [{ heal: "1d4" }], inForm: "wild-shape", ...more } });
  const mine = (grants, more = {}) => problems(circle("c-x", "Circle of X", [feature("x-feature", 3, grants, more)]));
  assert.equal(mine(act()), "");
  assert.match(mine(act({ inForm: "wild-shaep" })), /a grant names "wild-shaep", which is neither a feature of the Druid nor of this subclass/);
  assert.match(mine(act({ inForm: "wild-companion" })), /feature hb-cairn-folk-x-feature: inForm names "wild-companion", which does not take a form/);
  assert.match(mine(act({ inForm: "Wild Shape" })), /action inForm names the feature whose form the holder must be in \(a feature id\)/);
  assert.match(mine(act({ inForm: 3 })), /action inForm names the feature whose form the holder must be in/);
  assert.match(mine(act({ time: "reaction" })), /an action with `inForm` is used by its holder: a Reaction is taken by a standing instruction, which does not look at a form/);
  assert.match(mine({ action: { time: "bonus", target: { self: true }, form: { types: ["elemental"], maxCr: 1, fly: 0, hours: 1 }, inForm: "wild-shape" } }, { uses: { max: 1, recharge: "long" } }),
    /an action that takes a form cannot also say `inForm`: it is how a form is taken/);
  // beside a slot cost, a mode, a price, a use of its own: nothing else is refused
  assert.equal(mine(act({ cost: { slot: 2 } })), "");
  assert.equal(mine(act({ cost: { resource: "wild-shape" } })), "");
  const feat = { id: hb("form-feat"), name: "Form Feat", category: "general", tier: "assist", source: SRC, checked: false, text: "t", grants: act() };
  assert.match((loadPack(doc({ feats: [feat] })).problems ?? []).join("\n"), /a feat or an item cannot say `inForm`: only a feature of a subclass can name the form feature of its class/);
  const item = { id: hb("form-ring"), name: "Form Ring", category: "wondrous", rarity: "rare", wear: "carried", tier: "assist", source: SRC, checked: false, text: "t", grants: act() };
  assert.match((loadPack(doc({ items: [item] })).problems ?? []).join("\n"), /a feat or an item cannot say `inForm`/);
});

// ---------- derive: what goes on the record ----------
test("derive: a rating of the added type's own is put in by the druid's level, and the class's own rating is left as it was", () => {
  using(ON, () => {
    assert.deepEqual(form(druid(3)), { types: ["beast"], maxCr: 0.25, fly: 0, hours: 1, tempHp: 3 }, "no level of the circle's rating is reached: no type is added, and the record is the class's");
    assert.deepEqual(form(druid(5)), { types: ["beast"], maxCr: 0.5, fly: 0, hours: 2, tempHp: 5 });
    assert.deepEqual(form(druid(6)), { types: ["beast", "elemental"], maxCr: 0.5, fly: 0, hours: 3, tempHp: 6, typeMaxCr: { elemental: 2 } });
    assert.deepEqual(form(druid(10)), { types: ["beast", "elemental"], maxCr: 1, fly: 1, hours: 5, tempHp: 10, typeMaxCr: { elemental: 5 } });
    assert.deepEqual(validate(druid(10)), []);
    assert.deepEqual(form(druid(10, "circle-of-the-ash")).typeMaxCr, { elemental: 0.5 }, "lower than the feature's own CR 1: the type's alone is kept");
    assert.deepEqual(form(druid(10, "circle-of-the-both")), { types: ["beast", "elemental"], maxCr: 3, fly: 1, hours: 5, tempHp: 10, typeMaxCr: { elemental: 5 } }, "maxCr is every form's");
    assert.deepEqual(form(druid(10, "circle-of-the-twice")).typeMaxCr, undefined, "one grant gives no rating of its own and the feature's CR 2 is higher than the other's CR 1");
    assert.deepEqual(form(druid(10, "circle-of-the-above")).typeMaxCr, { elemental: 5 }, "a rating higher than the feature's own stands");
    assert.deepEqual(form(druid(10, "circle-of-the-twice")).types, ["beast", "elemental"]);
  });
  // The SRD circle's record has no key it never had.
  const plain = derive({ ...druid(10), subclass: "land" }).record.feats.find((f) => f.id === "wild-shape").action.form;
  assert.deepEqual(Object.keys(plain).sort(), ["fly", "hours", "maxCr", "tempHp", "types"]);
});

test("derive: named forms are on the record, and the price names them; a price with types and forms names both", () => {
  using(ON, () => {
    assert.deepEqual(form(druid(6, "circle-of-the-four")), { types: ["beast"], maxCr: 0.5, fly: 0, hours: 3, tempHp: 6, forms: ELEMENTALS });
    assert.deepEqual(form(druid(6, "circle-of-the-priced")).cost, { resource: STORE, n: 1, forms: ELEMENTALS });
    const many = form(druid(6, "circle-of-the-many"));
    assert.deepEqual(many.cost, { resource: hb("many-store"), n: 2, types: ["elemental"], forms: ["fire-elemental", hb("pebble-sprite")] });
    assert.deepEqual(many.typeMaxCr, { elemental: 1 });
    assert.equal(many.maxCr, 0.5);
    assert.equal(form(druid(6, "circle-of-the-four")).cost, undefined);
  });
});

test("derive: the class's content is not changed, a record keeps its form after a lint, and a feature's `inForm` is on its action", () => {
  const before = json(CONTENT.classes.druid);
  using(ON, () => {
    for (const c of ["circle-of-the-cairn", "circle-of-the-many", "circle-of-the-hearth"]) derive(druid(10, c));
    const r = derive(druid(6, "circle-of-the-hearth")).record;
    assert.equal(r.feats.find((f) => f.id === hb("hearth-mend")).action.inForm, "wild-shape");
    for (const c of ["circle-of-the-many", "circle-of-the-hearth"]) assert.deepEqual(lintRecord(derive(druid(10, c)).record, { spells: CONTENT.spells }), [], `the record of a character who has the keys still passes the record lint (${c})`);
  });
  assert.equal(json(CONTENT.classes.druid), before);
});

// ---------- the engine: a rating of an added type's own ----------
test("a rating for the added type alone: the elementals of a level 10 druid take CR 5 while the beasts stay at CR 1", () => {
  using(ON, () => {
    const s = field(druid(10)), e = s.entities.hero;
    assert.equal(e.uses["wild-shape"], 3);
    ok(shape(s, "earth-elemental")); assert.equal(e.form.block, "earth-elemental"); assert.equal(e.uses["wild-shape"], 2, "one use of Wild Shape");
    ok(shape(s, "air-elemental"));                                                   // a Fly Speed a level 10 druid has
    ok(shape(s, "brown-bear"));
    const before = json(s);
    no(shape(s, "ankylosaurus"), /At Ven's level Wild Shape takes forms of Challenge Rating 1 or lower; the Ankylosaurus is 3\./);
    assert.equal(json(s), before, "a refused form changes nothing");
  });
});

test("a type whose rating no level has reached adds nothing; at level 6 its own rating holds and the beasts keep the class's", () => {
  using(ON, () => {
    no(shape(field(druid(5)), "azer-sentinel"), /takes the form of a beast; the Azer Sentinel is not one\./);
    const s = field(druid(6)), e = s.entities.hero;
    ok(shape(s, "azer-sentinel")); assert.equal(e.uses["wild-shape"], 2);
    const before = json(s);
    no(shape(s, "fire-elemental"), /At Ven's level Wild Shape takes elemental forms of Challenge Rating 2 or lower; the Fire Elemental is 5\./);
    no(shape(s, "gargoyle"), /can't take a form with a Fly Speed/);
    no(shape(s, "goblin-warrior"), /takes the form of a beast or elemental; the Goblin Warrior is not one\./);
    // the beasts keep the class's rating (CR 1/2 at level 6): the type's rating does not lift them
    no(shape(s, "allosaurus"), /Challenge Rating 1\/2 or lower; the Allosaurus is 2\./);
    assert.equal(json(s), before);
  });
});

test("a rating below the feature's own for the added type: the type is held to it, the beasts are not", () => {
  using(ON, () => {
    const s = field(druid(10, "circle-of-the-ash"));
    ok(shape(s, "magmin"));
    no(shape(s, "azer-sentinel"), /takes elemental forms of Challenge Rating 1\/2 or lower; the Azer Sentinel is 2\./);
    ok(shape(s, "brown-bear"));
  });
});

test("`maxCr` and `typesMaxCr` together, and two grants of one type", () => {
  using(ON, () => {
    const s = field(druid(10, "circle-of-the-both"));
    ok(shape(s, "ankylosaurus"));                      // beasts up to CR 3
    ok(shape(s, "fire-elemental"));                    // the added type up to CR 5
    // a grant with a rating of its own below another's plain one: the feature's CR 2 stands for the type
    const t = field(druid(10, "circle-of-the-twice"));
    no(shape(t, "fire-elemental"), /At Ven's level Wild Shape takes forms of Challenge Rating 2 or lower; the Fire Elemental is 5\./);
    ok(shape(t, "azer-sentinel"));
    // above it, the type's own rating stands
    ok(shape(field(druid(10, "circle-of-the-above")), "fire-elemental"));
  });
});

// ---------- the engine: named forms ----------
test("named forms: the four elementals are taken at any rating, the others of the type are not, and a Fly Speed is still the class's", () => {
  using(ON, () => {
    const s = field(druid(10, "circle-of-the-four")), e = s.entities.hero;
    e.uses["wild-shape"] = 6;
    for (const id of ELEMENTALS) { ok(shape(s, id)); assert.equal(e.form.block, id); }
    assert.equal(e.uses["wild-shape"], 2, "a use for each");
    const before = json(s);
    no(shape(s, "azer-sentinel"), /takes the form of a beast, or of the Air Elemental, the Earth Elemental, the Fire Elemental, the Water Elemental; the Azer Sentinel is not one\./);
    assert.equal(json(s), before);
    // a level 6 druid has no Fly Speed in a form, and the air elemental by name flies
    const low = field(druid(6, "circle-of-the-four"));
    no(shape(low, "air-elemental"), /can't take a form with a Fly Speed/);
    ok(shape(low, "fire-elemental"));
    // the SRD circle takes none of them
    no(shape(field({ ...druid(10), subclass: "land" }), "fire-elemental"), /takes the form of a beast; the Fire Elemental is not one/);
  });
});

test("named forms with a price: the pool is spent for a named form and Wild Shape's for a beast; too few is refused before anything is paid", () => {
  using(ON, () => {
    const s = field(druid(10, "circle-of-the-priced")), e = s.entities.hero;
    assert.equal(e.uses[STORE], 2);
    ok(shape(s, "fire-elemental")); assert.equal(e.uses[STORE], 1); assert.equal(e.uses["wild-shape"], 3);
    ok(shape(s, "wolf")); assert.equal(e.uses[STORE], 1); assert.equal(e.uses["wild-shape"], 2);
    ok(shape(s, "water-elemental")); assert.equal(e.uses[STORE], 0); assert.equal(e.uses["wild-shape"], 2);
    ok(shape(s, null));
    const before = json(s);
    no(shape(s, "fire-elemental"), /Ven has 0 uses of Four store left; the form of a Fire Elemental costs 1\./);
    assert.equal(json(s), before);
    ok(shape(s, "wolf")); assert.equal(e.uses["wild-shape"], 1);
  });
});

test("a price for a type and for named forms: one price covers both, and a type's own rating still holds", () => {
  using(ON, () => {
    const s = field(druid(10, "circle-of-the-many")), e = s.entities.hero, pool = hb("many-store");
    assert.equal(e.uses[pool], 3);
    ok(shape(s, "magmin")); assert.equal(e.uses[pool], 1, "a type it adds: 2 uses");
    ok(shape(s, "wolf")); assert.equal(e.uses[pool], 1); assert.equal(e.uses["wild-shape"], 2);
    no(shape(s, "azer-sentinel"), /takes elemental forms of Challenge Rating 1 or lower; the Azer Sentinel is 2\./);
    no(shape(s, "fire-elemental"), /Ven has 1 use of Many store left; the form of a Fire Elemental costs 2\./);
    e.uses[pool] = 2;
    ok(shape(s, "fire-elemental")); assert.equal(e.uses[pool], 0, "a form named, over the type's rating: 2 uses");
    e.uses[pool] = 2;
    ok(shape(s, hb("pebble-sprite"))); assert.equal(e.uses[pool], 0, "a monster of the pack, named");
  });
});

test("in a fight a refused named form spends no Bonus Action, and an accepted one spends it as ever", () => {
  using(ON, () => {
    const s = field(druid(10, "circle-of-the-priced")), e = s.entities.hero;
    ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
    for (let i = 0; i < 20 && current(s) !== "hero"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    e.uses[STORE] = 0;
    const bonus = s.encounter.budget.bonus, before = json(s);
    no(shape(s, "fire-elemental"), /costs 1/);
    assert.equal(json(s), before); assert.equal(s.encounter.budget.bonus, bonus);
    e.uses[STORE] = 1;
    ok(shape(s, "fire-elemental")); assert.equal(s.encounter.budget.bonus, bonus - 1);
  });
});

// ---------- `inForm` ----------
test("`inForm`: refused with a sentence and nothing paid while the holder is in no form; used in a Wild Shape form", () => {
  using(ON, () => {
    const s = field(druid(6, "circle-of-the-hearth"), 1), e = s.entities.hero;
    assert.equal(e.slots[1], 4);
    const before = json(s);
    no(use(s, hb("hearth-mend")), /Hearth mend is used while Ven is in a Wild Shape form\./);
    assert.equal(json(s), before, "a refused use changes nothing: no slot, no use");
    no(use(s, hb("hearth-sip")), /Hearth sip is used while Ven is in a Wild Shape form\./);
    assert.equal(json(s), before);
    ok(shape(s, "wolf"));
    const r = ok(use(s, hb("hearth-mend")));
    assert.equal(e.slots[1], 3, "the slot is spent");
    assert.ok(e.hp > 1, "healed");
    assert.ok(r.events.some((x) => x.type === "heal"));
    // a larger slot, named
    ok(use(s, hb("hearth-mend"), { slot: 2 })); assert.equal(e.slots[2], 2);
    // leave the form: refused again, and the sip's use is whole
    ok(shape(s, null));
    const left = json(s);
    no(use(s, hb("hearth-sip")), /is used while Ven is in a Wild Shape form\./);
    assert.equal(json(s), left); assert.equal(e.uses[hb("hearth-sip")], 2);
    ok(shape(s, "wolf"));
    ok(use(s, hb("hearth-sip"))); assert.equal(e.uses[hb("hearth-sip")], 1);
  });
});

test("`inForm` in a fight: a refusal spends no Bonus Action, and a use spends it", () => {
  using(ON, () => {
    const s = field(druid(6, "circle-of-the-hearth"), 1);
    ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
    for (let i = 0; i < 20 && current(s) !== "hero"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    const bonus = s.encounter.budget.bonus, before = json(s);
    no(use(s, hb("hearth-mend")), /is used while Ven is in a Wild Shape form\./);
    assert.equal(json(s), before); assert.equal(s.encounter.budget.bonus, bonus);
    ok(shape(s, "wolf")); assert.equal(s.encounter.budget.bonus, bonus - 1);
    no(use(s, hb("hearth-mend")), /Bonus Action/i);
    for (let i = 0; i < 20; i++) { ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); if (current(s) === "hero") break; }
    ok(use(s, hb("hearth-mend"))); assert.equal(s.encounter.budget.bonus, s.encounter.budget.bonus);
  });
});

test("`inForm` names the feature that gave the form: a form from another feature does not count, and that feature's own form does", () => {
  using(ON, () => {
    const s = field(druid(6, "circle-of-the-hearth"), 1), e = s.entities.hero;
    ok(shape(s, "magmin", hb("ember-skin")));
    assert.equal(effectsOf(s).find((x) => x.id === e.form.fx).feature, hb("ember-skin"));
    const before = json(s);
    no(use(s, hb("hearth-mend")), /Hearth mend is used while Ven is in a Wild Shape form \(the Magmin form is from something else\)\./);
    assert.equal(json(s), before);
    ok(use(s, hb("skin-sip"))); assert.ok(e.hp > 1);
    ok(shape(s, "wolf"));
    no(use(s, hb("skin-sip")), /Skin sip is used while Ven is in a Ember skin form/);
    ok(use(s, hb("hearth-mend")));
  });
});

test("`inForm` with the data wrong (it skipped the gate): refused before anything is paid, with a sentence", () => {
  using(ON, () => {
    const s = field(druid(6, "circle-of-the-hearth"), 1), e = s.entities.hero;
    ok(shape(s, "wolf"));
    e.feats.find((f) => f.id === hb("hearth-mend")).action.inForm = 7;
    const before = json(s);
    no(use(s, hb("hearth-mend")), /cannot be used: its data for "while in a form" is wrong/);
    assert.equal(json(s), before);
  });
});

// ---------- the overlay removed, replay, and what players are sent ----------
test("the overlay removed: the forms are the class's again; back: the circle's", () => {
  const s = newGame(5, { party: [{ sheet: druid(2) }] });
  let hero;
  using(ON, () => {
    hero = ok(apply(s, { type: "setSheet", sheet: druid(10) }, DM)).events.find((x) => x.type === "spawned").id;
    assert.deepEqual(s.entities[hero].feats.find((f) => f.id === "wild-shape").action.form.typeMaxCr, { elemental: 5 });
  });
  ok(apply(s, { type: "refresh", actor: hero }, DM));
  assert.equal(s.entities[hero].feats.find((f) => f.id === "wild-shape").action.form.typeMaxCr, undefined);
  using(ON, () => {
    ok(apply(s, { type: "refresh", actor: hero }, DM));
    assert.deepEqual(s.entities[hero].feats.find((f) => f.id === "wild-shape").action.form.typeMaxCr, { elemental: 5 });
  });
});

test("what players are sent: the party's own record carries the keys, an enemy in a form shows only the creature, and the pack copy holds the grants as written", () => {
  using(ON, () => {
    const seen = (sheet, into) => {
      const s = field(sheet);
      ok(shape(s, into));
      s.entities.foe = { ...structuredClone(s.entities.hero), id: "foe", side: "foe", kind: "npc", owner: null, pos: { q: -1, r: 1, z: 0 } };
      return { party: view(s, KIM).entities.hero, foe: view(s, PAT).entities.foe };
    };
    const mine = seen(druid(10), "fire-elemental"), named = seen(druid(10, "circle-of-the-four"), "fire-elemental");
    assert.deepEqual(mine.party.feats.find((f) => f.id === "wild-shape").action.form.typeMaxCr, { elemental: 5 });
    assert.deepEqual(named.party.feats.find((f) => f.id === "wild-shape").action.form.forms, ELEMENTALS);
    for (const x of [mine, named]) {
      assert.equal(x.foe.tpl, "fire-elemental"); assert.equal(x.foe.name, "Fire Elemental");
      const sent = json(x.foe);
      for (const word of ["feats", "uses", "cost", "formOf", "wild-shape", "typeMaxCr", "forms", "inForm", "sheet", "hb-cairn-folk", "Circle"]) assert.equal(sent.includes(word), false, `an enemy shows no "${word}"`);
    }
    assert.deepEqual(Object.keys(mine.foe).sort(), Object.keys(named.foe).sort());
  });
  const withNotes = { ...CAIRN, id: hb("circle-with-notes"), name: "Circle of the Notes", dmNotes: "A note.", features: [{ ...FO({ forms: ["fire-elemental"] }, 3, "note-shape"), dmNotes: "Quiet." }, feature("note-mend", 3, { action: { time: "bonus", target: { self: true }, effects: [{ heal: "1d4" }], inForm: "wild-shape" } })] };
  const data = doc({ subclasses: [withNotes] });
  pack(data);
  const sub = forPlayers(data).data.subclasses.find((x) => x.id === withNotes.id);
  assert.equal(sub.dmNotes, undefined); assert.equal(sub.features[0].dmNotes, undefined);
  assert.deepEqual(sub.features[0].grants, { formOf: { of: "wild-shape", forms: ["fire-elemental"] } });
  assert.equal(sub.features[1].grants.action.inForm, "wild-shape");
});

test("an SRD-only game is unchanged with the pack lent: the class's own record and no key it never had", () => {
  const plain = (l) => derive({ ...druid(l), subclass: "land" }).record;
  for (const l of [2, 6, 10, 14]) {
    const before = json(plain(l));
    using(ON, () => assert.equal(json(plain(l)), before, `a level ${l} druid of the SRD circle`));
    const f = plain(l).feats.find((x) => x.id === "wild-shape").action.form;
    assert.equal(f.typeMaxCr, undefined); assert.equal(f.forms, undefined); assert.equal(f.cost, undefined);
  }
});
