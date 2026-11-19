// Homebrew subclasses, stage B2 of docs/specs/homebrew-subclasses.md: `derive` and the sheet.
// The subclasses here are the spec's invented "Oath of the Ember" (pack "ember-folk") and, for a second class, an invented
// "College of the Lantern" and "Circle of the Hearth" (pack "lamp-folk"). No published subclass is used.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import { classesOf, derive, missingOf, subclassOf, validate } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { CONTENT } from "../src/content/index.js";
import { loadPack, overlayOf, using } from "../src/content/registry.js";
import { viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); return r; };
const json = (x) => JSON.stringify(x);

// ---------- the invented packs ----------
const doc = (id, lists) => ({ format: "hextable-pack", v: 1, pack: { id, name: id, version: 1, license: "CC0, by the author", attribution: "Written for a test." }, ...lists });
const E = "ember-folk", L = "lamp-folk";
const eh = (n) => `hb-${E}-${n}`, lh = (n) => `hb-${L}-${n}`;
const OATH = eh("oath-of-the-ember"), COLLEGE = lh("college-of-the-lantern"), CIRCLE = lh("circle-of-the-hearth");
const ward = { id: eh("ember-ward"), name: "Ember Ward", source: `homebrew:${E}`, level: 2, school: "abjuration", classes: ["paladin"], time: "action", range: 60, components: ["v", "s"], duration: "instant",
  concentration: false, ritual: false, target: { area: { shape: "sphere", size: 10 } }, effects: [{ save: "dex", half: true, onFail: [{ damage: "3d6", type: "fire" }] }], tier: "auto", checked: false, text: "A ring of embers." };
const oath = { id: OATH, name: "Oath of the Ember", class: "paladin", source: `homebrew:${E}`, checked: false, text: "Paladins sworn to keep a hearth-fire burning.",
  spells: { 3: ["burning-hands", "shield-of-faith"], 5: [eh("ember-ward")] },
  features: [
    { id: eh("kindle"), name: "Kindle", level: 3, tier: "auto", checked: false, text: "Spend Channel Divinity to wreathe one foe in sparks: you have Advantage on attack rolls against it for 1 minute.",
      grants: { action: { time: "bonus", cost: { resource: "channel-divinity" }, duration: "1 minute", target: { creature: { range: [30, 30] } },
        effects: [{ modifier: { on: "attack.roll", op: "advantage", against: "target" }, to: "caster" }] } } },
    { id: eh("hearth-aura"), name: "Hearth Aura", level: 7, tier: "auto", checked: false, text: "You and allies in your aura have Resistance to Cold damage.",
      grants: { aura: { range: { byLevel: { 7: 10, 18: 30 } }, modifiers: [{ on: "damage.taken", op: "resist", types: ["cold"] }] } } },
    { id: eh("ash-memory"), name: "Ash Memory", level: 15, tier: "manual", checked: false, text: "Once per Long Rest you may ask the DM one question about what the fire saw.", uses: { max: 1, recharge: "long" } },
  ] };
// A bard college, whose feature spends the bard's own pool (a column of the bard's table), and a cleric domain whose feature spends Channel Divinity.
const college = { id: COLLEGE, name: "College of the Lantern", class: "bard", source: `homebrew:${L}`, checked: false, text: "Bards who sing by lamplight.",
  spells: { 3: ["faerie-fire"] },
  features: [{ id: lh("lantern-song"), name: "Lantern Song", level: 3, tier: "auto", checked: false, text: "Spend Bardic Inspiration to mend a friend with lamplight.",
    grants: { action: { time: "bonus", cost: { resource: "bardic-inspiration" }, target: { creature: { range: [30, 30] } }, effects: [{ heal: { column: "bardic-die" } }] } } }] };
const circle = { id: CIRCLE, name: "Circle of the Hearth", class: "cleric", source: `homebrew:${L}`, checked: false, text: "Clerics who keep a shared fire.",
  features: [{ id: lh("shared-fire"), name: "Shared Fire", level: 3, tier: "auto", checked: false, text: "Spend Channel Divinity to light one foe: you have Advantage against it for 1 minute.",
    grants: { action: { time: "bonus", cost: { resource: "channel-divinity" }, duration: "1 minute", target: { creature: { range: [30, 30] } }, effects: [{ modifier: { on: "attack.roll", op: "advantage", against: "target" }, to: "caster" }] } } }] };
const pack = (d) => { const r = loadPack(d); assert.ok(r.ok, (r.problems ?? []).join("; ")); return r.pack; };
const EMBER = pack(doc(E, { spells: [ward], subclasses: [oath] })), LAMP = pack(doc(L, { subclasses: [college, circle] }));
const BOTH = overlayOf([EMBER, LAMP]), ONE = overlayOf([EMBER]), NONE = overlayOf([]);

// ---------- the characters ----------
const A = { str: 16, dex: 10, con: 14, int: 12, wis: 14, cha: 16 };
const paladin = (level, over = {}) => ({ name: "Sir Ember", class: "paladin", level, subclass: OATH, abilities: A, skills: ["athletics", "religion"], choices: { "fighting-style": "defense" },
  armour: "chain-mail", shield: true, weapons: ["longsword"], spells: ["bless", "cure-wounds", "aid", "find-steed"].slice(0, level >= 9 ? 4 : level >= 5 ? 3 : level >= 3 ? 3 : 2), ...over });
const bardSpells = ["vicious-mockery", "minor-illusion", "mage-hand", "healing-word", "hold-person", "invisibility", "hypnotic-pattern", "dimension-door", "polymorph", "heroism", "shatter", "fear", "greater-invisibility"];
const palBard = (more = {}) => ({ name: "Vor", classes: [
  { class: "paladin", level: 6, subclass: OATH, spells: ["bless", "cure-wounds", "shield-of-faith", "aid", "find-steed", "lesser-restoration"] },
  { class: "bard", level: 8, subclass: COLLEGE, spells: bardSpells }],
  abilities: A, skills: ["athletics", "religion", "performance"], expertise: ["performance"],
  choices: { "fighting-style": "defense" }, armour: "chain-mail", shield: true, weapons: ["longsword"], ...more });
const ids = (r) => r.feats.map((f) => f.id);
const feat = (r, id) => r.feats.find((f) => f.id === id);

// ---------- subclassOf ----------
test("subclassOf: the SRD subclass, a loaded homebrew one of that class, or none", () => {
  const k = (sub, cls = "paladin") => ({ c: CONTENT.classes[cls], level: 5, subclass: sub });
  assert.equal(subclassOf(k("devotion")), CONTENT.classes.paladin.subclass, "the SRD one, with no pack at all");
  assert.equal(subclassOf(k(undefined)), null);
  assert.equal(subclassOf(k(OATH)), null, "not loaded: none");
  assert.equal(subclassOf({ c: null, level: 5, subclass: OATH }), null);
  using(ONE, () => {
    assert.equal(subclassOf(k(OATH)).name, "Oath of the Ember");
    assert.equal(subclassOf(k(OATH, "bard")), null, "of the wrong class: none");
    assert.equal(subclassOf(k("constructor")), null, "an object's own keys are not subclasses");
    assert.equal(subclassOf(k("devotion")), CONTENT.classes.paladin.subclass);
    assert.equal(subclassOf(classesOf(paladin(5))[0]).id, OATH);
  });
});

// ---------- a level 7 paladin with the example ----------
test("a level 7 paladin with the example has its features and its always-prepared spells, inside `using`", () => {
  using(ONE, () => {
    const sheet = paladin(7);
    assert.deepEqual(validate(sheet), []);
    const d = derive(sheet), r = d.record;
    assert.deepEqual(d.missing, []);
    assert.equal(r.cls, "Paladin (Oath of the Ember)");
    assert.ok(ids(r).includes(eh("kindle")) && ids(r).includes(eh("hearth-aura")), "Kindle at 3 and Hearth Aura at 7");
    assert.ok(!ids(r).includes(eh("ash-memory")), "Ash Memory is level 15");
    const kindle = feat(r, eh("kindle"));
    assert.equal(kindle.tier, "auto");
    assert.equal(kindle.action.cost.resource, "channel-divinity");
    assert.ok(feat(r, "channel-divinity"), "the parent class's pool it spends is there");
    assert.deepEqual(feat(r, eh("hearth-aura")).aura.range, 10, "the aura's range by class level 7");
    for (const id of ["burning-hands", "shield-of-faith", eh("ember-ward")]) assert.ok(r.spells.includes(id), `${id} is always prepared at 7`);
    // By class level: at level 3 the level 5 spell is not yet there, and Hearth Aura is not.
    const at3 = derive(paladin(3)).record;
    assert.ok(at3.spells.includes("burning-hands") && !at3.spells.includes(eh("ember-ward")) && !ids(at3).includes(eh("hearth-aura")));
    // At 15 the manual feature comes with its uses.
    const at15 = derive(paladin(15, { spells: ["bless", "cure-wounds", "aid", "find-steed", "lesser-restoration"] })).record;
    assert.deepEqual(feat(at15, eh("ash-memory")).uses, { max: 1, recharge: "long" });
    // A creature made from it starts with the feature's use.
    const s = newGame(5, { party: [{ sheet: paladin(15, { spells: ["bless", "cure-wounds", "aid", "find-steed", "lesser-restoration"] }) }] });
    assert.equal(s.entities.pc1.uses[eh("ash-memory")], 1);
    assert.equal(s.entities.pc1.sheet.subclass, OATH, "the id is on the sheet");
  });
});

test("the same sheet with the pack not loaded: valid, derives without the subclass, and says what is missing", () => {
  const sheet = paladin(7);
  assert.deepEqual(validate(sheet), [], "a level 7 sheet cannot be valid without a subclass: an unloaded homebrew id is accepted");
  const d = derive(sheet);
  assert.deepEqual(d.missing, [{ kind: "subclass", id: OATH, class: "paladin" }]);
  assert.deepEqual(missingOf(sheet), d.missing);
  assert.equal(d.record.cls, "Paladin (subclass not loaded)");
  assert.ok(!ids(d.record).includes(eh("kindle")) && !ids(d.record).includes(eh("hearth-aura")), "its features are absent");
  assert.ok(ids(d.record).includes("channel-divinity"), "the class's own stay");
  assert.ok(!d.record.spells.includes("burning-hands") && !d.record.spells.includes("shield-of-faith"), "so are its spells");
  assert.equal(d.record.level, 7);
  // Below level 3 nothing is missing yet; an SRD sheet is never missing anything.
  assert.deepEqual(missingOf(paladin(2)), []);
  assert.deepEqual(derive({ ...paladin(7), subclass: "devotion" }).missing, []);
});

// ---------- several classes ----------
test("a paladin 6 / bard 8 with a homebrew subclass on each class, from two packs", () => {
  using(BOTH, () => {
    const sheet = palBard();
    assert.deepEqual(validate(sheet), []);
    const d = derive(sheet), r = d.record;
    assert.deepEqual(d.missing, []);
    assert.equal(r.cls, "Paladin 6 / Bard 8", "too long with both subclass names: the class names alone, as for SRD subclasses");
    assert.deepEqual(r.classes, [{ id: "paladin", level: 6, subclass: OATH }, { id: "bard", level: 8, subclass: COLLEGE }]);
    assert.ok(ids(r).includes(eh("kindle")) && !ids(r).includes(eh("hearth-aura")) && ids(r).includes(lh("lantern-song")), ids(r).join());
    for (const id of ["burning-hands", eh("ember-ward"), "faerie-fire"]) assert.ok(r.spells.includes(id), id);
    // The bard's feature heals by the bard's die, at the bard's level (8: d8), not the paladin's.
    assert.equal(feat(r, lh("lantern-song")).action.effects[0].heal, "1d8", "baked from the bard's table at bard level 8 (d8)");
    assert.equal(feat(r, lh("lantern-song")).action.cost.resource, "bardic-inspiration");
  });
  // Each class's subclass must be of that class: the college on the paladin and the oath on the bard are refused.
  using(BOTH, () => {
    const swapped = palBard({ classes: [{ ...palBard().classes[0], subclass: COLLEGE }, { ...palBard().classes[1], subclass: OATH }] });
    const p = validate(swapped);
    assert.ok(p.some((m) => m === `${COLLEGE} is a Bard subclass, not a Paladin one.`), p.join(" | "));
    assert.ok(p.some((m) => m === `${OATH} is a Paladin subclass, not a Bard one.`), p.join(" | "));
  });
  // One pack gone: that class loses its subclass, the other keeps its own, and only the missing one is named.
  using(ONE, () => {
    const d = derive(palBard());
    assert.deepEqual(d.missing, [{ kind: "subclass", id: COLLEGE, class: "bard" }]);
    assert.ok(ids(d.record).includes(eh("kindle")) && !ids(d.record).includes(lh("lantern-song")));
  });
});

test("a second class's Channel Divinity cost is renamed as for an SRD subclass: a Cleric taken after a Paladin", () => {
  using(BOTH, () => {
    const sheet = { name: "Vor", classes: [{ class: "paladin", level: 5, subclass: OATH, spells: ["bless", "cure-wounds", "aid"] }, { class: "cleric", level: 3, subclass: CIRCLE, spells: ["guidance", "sacred-flame", "toll-the-dead", "bless", "healing-word", "command"] }],
      abilities: A, skills: ["athletics", "religion", "insight", "medicine"], choices: { "fighting-style": "defense", "divine-order": "protector" }, armour: "chain-mail", shield: true, weapons: ["longsword"] };
    const bad = validate(sheet);
    const d = derive(sheet);
    assert.ok(ids(d.record).includes(eh("kindle")) && ids(d.record).includes(lh("shared-fire")), `both: ${bad.join(" | ")}`);
    assert.equal(feat(d.record, eh("kindle")).action.cost.resource, "channel-divinity", "the first class's id is never changed");
    assert.equal(feat(d.record, lh("shared-fire")).action.cost.resource, "cleric-channel-divinity", "the later class spends its own pool");
    assert.ok(feat(d.record, "cleric-channel-divinity"));
  });
});

// ---------- validate's sentences ----------
test("validate: the sentences name the SRD subclass and the table's, and a subclass of the wrong class is refused", () => {
  // No overlay: as before.
  const bare = paladin(5, { subclass: undefined });
  assert.deepEqual(validate(bare), ["A level 5 Paladin has a subclass: choose Oath of Devotion."]);
  assert.deepEqual(validate({ ...bare, subclass: "no-such" }), ["The Paladin subclass in the SRD is Oath of Devotion (devotion).", "A level 5 Paladin has a subclass: choose Oath of Devotion."]);
  assert.deepEqual(validate({ ...bare, subclass: "devotion" }), []);
  using(ONE, () => {
    assert.deepEqual(validate(bare), ["A level 5 Paladin has a subclass: choose Oath of Devotion or one of this table's (Oath of the Ember)."]);
    assert.deepEqual(validate({ ...bare, subclass: OATH }), []);
    assert.deepEqual(validate({ ...bare, subclass: "devotion" }), []);
    // A subclass of another class.
    const wrong = validate({ ...bare, subclass: "oath-of-ash" });
    assert.deepEqual(validate({ ...bare, subclass: lh("lantern-song") }), [], "an hb- id that no loaded pack has is a subclass this table does not have: accepted");
    assert.ok(wrong.some((m) => /The Paladin subclass in the SRD is Oath of Devotion \(devotion\)\. This table also has Oath of the Ember \(hb-ember-folk-oath-of-the-ember\)\./.test(m)), wrong.join(" | "));
    const bard = { name: "Zaa", class: "bard", level: 3, subclass: OATH, abilities: A, skills: ["performance", "persuasion", "insight"], weapons: ["dagger"], spells: ["vicious-mockery", "minor-illusion", "mage-hand", "healing-word"] };
    const p = validate(bard);
    assert.equal(p[0], `${OATH} is a Paladin subclass, not a Bard one.`);
    assert.ok(p.some((m) => /^A level 3 Bard has a subclass: choose College of Lore\./.test(m)), p.join(" | "));
    // A non-text id, and an `hb-` id of no pack that is spelled wrong, are not the subclass of anything.
    assert.ok(validate({ ...bare, subclass: 5 }).length);
    assert.ok(validate({ ...bare, subclass: "constructor" }).length);
  });
  using(BOTH, () => assert.match(validate(bare)[0], /choose Oath of Devotion or one of this table's \(Oath of the Ember\)\.$/));
  // Below level 3 a homebrew id is accepted as the SRD's id is.
  using(ONE, () => assert.deepEqual(validate(paladin(2)), []));
});

test("setSheet: the wrong class is refused with nothing changed; the right one is made; a missing pack is made with the DM told", () => {
  const s = newGame(5, { party: [{ sheet: paladin(2, { subclass: undefined }) }] });
  const before = json(s);
  using(ONE, () => {
    const wrong = { name: "Zaa", class: "bard", level: 3, subclass: OATH, abilities: A, skills: ["performance", "persuasion", "insight"], weapons: ["dagger"], spells: ["vicious-mockery", "minor-illusion", "mage-hand", "healing-word"] };
    no(apply(s, { type: "setSheet", sheet: wrong }, DM), /is a Paladin subclass, not a Bard one/);
    assert.equal(json(s), before, "a rejected action changes nothing");
    const r = ok(apply(s, { type: "setSheet", sheet: paladin(5) }, DM));
    assert.ok(!r.events.some((e) => e.type === "manual"), "nothing to tell: the pack is loaded");
    const made = s.entities[r.events.find((e) => e.type === "spawned").id];
    assert.ok(ids(made).includes(eh("kindle")) && made.spells.includes("burning-hands"));
    assert.equal(made.sheet.subclass, OATH);
  });
  // The pack is not loaded: a new character with the id is made without the features, and the DM is told.
  const r = ok(apply(s, { type: "setSheet", sheet: paladin(5, { name: "Sir Cinder" }) }, DM));
  const made = s.entities[r.events.find((e) => e.type === "spawned").id];
  assert.equal(made.sheet.subclass, OATH);
  assert.ok(!ids(made).includes(eh("kindle")));
  const told = r.events.filter((e) => e.type === "manual");
  assert.equal(told.length, 1);
  assert.deepEqual(told[0], { type: "manual", actor: made.id, name: "Sir Cinder", partial: true, text: `Sir Cinder: its subclass "${OATH}" is not loaded at this table, so its subclass features and spells are absent until its pack is added again.` });
  assert.equal(viewEvents(r.events, s, PAT).filter((e) => e.type === "manual").length, 0, "a player is not told");
});

// ---------- the overlay removed and back: refresh ----------
test("the overlay removed: refresh keeps the id, drops the features and tells the DM only; the overlay back: refresh restores them, and spent uses are kept", () => {
  const sheet = paladin(15, { spells: ["bless", "cure-wounds", "aid", "find-steed", "lesser-restoration"] });
  const s = newGame(5, { party: [{ sheet: paladin(2, { subclass: undefined }) }] });
  let hero;
  using(ONE, () => {
    const r = ok(apply(s, { type: "setSheet", sheet }, DM));
    hero = r.events.find((e) => e.type === "spawned").id;
    assert.ok(ids(s.entities[hero]).includes(eh("ash-memory")));
    // Play has spent Ash Memory and one of Kindle's Channel Divinity uses, and hurt the paladin.
    s.entities[hero].uses[eh("ash-memory")] = 0;
    s.entities[hero].uses["channel-divinity"] -= 1;
    ok(apply(s, { type: "harm", actor: hero, amount: 6, dtype: "fire" }, DM));
  });
  const spentCD = s.entities[hero].uses["channel-divinity"], hp = s.entities[hero].hp;
  // The pack is gone (nothing is lent to the content lookups).
  const gone = ok(apply(s, { type: "refresh", actor: hero }, DM));
  const e = s.entities[hero];
  assert.equal(e.sheet.subclass, OATH, "the character keeps the id");
  assert.deepEqual(e.sheet, sheet, "and the sheet is what it was");
  assert.ok(!ids(e).includes(eh("kindle")) && !ids(e).includes(eh("hearth-aura")) && !ids(e).includes(eh("ash-memory")), "the features are absent");
  assert.ok(!e.spells.includes("burning-hands") && !e.spells.includes(eh("ember-ward")), "and the spells");
  assert.equal(e.cls, "Paladin (subclass not loaded)");
  assert.equal(e.hp, hp, "play state stays");
  assert.equal(e.uses["channel-divinity"], spentCD, "the class's own spent use stays spent");
  const told = gone.events.filter((x) => x.type === "manual");
  assert.equal(told.length, 1);
  assert.equal(told[0].partial, true);
  assert.equal(told[0].actor, hero);
  assert.match(told[0].text, new RegExp(`its subclass "${OATH}" is not loaded at this table`));
  assert.equal(viewEvents(gone.events, s, PAT).filter((x) => x.type === "manual").length, 0, "the DM alone");
  assert.equal(viewEvents(gone.events, s, DM).filter((x) => x.type === "manual").length, 1);
  // Every remake from the sheet says it again: a refresh of everyone, and a rest that remakes it.
  const all = ok(apply(s, { type: "refresh" }, DM));
  assert.equal(all.events.filter((x) => x.type === "manual" && x.actor === hero).length, 1);
  // The pack comes back: refresh brings the features back; the spent uses are kept by id.
  using(ONE, () => {
    const back = ok(apply(s, { type: "refresh", actor: hero }, DM));
    assert.ok(!back.events.some((x) => x.type === "manual"), "nothing to tell now");
    const h = s.entities[hero];
    assert.ok(ids(h).includes(eh("kindle")) && ids(h).includes(eh("hearth-aura")) && ids(h).includes(eh("ash-memory")));
    assert.ok(h.spells.includes("burning-hands") && h.spells.includes(eh("ember-ward")));
    assert.equal(h.cls, "Paladin (Oath of the Ember)");
    assert.equal(h.uses[eh("ash-memory")], 0, "Ash Memory is still spent");
    assert.equal(h.uses["channel-divinity"], spentCD);
    assert.equal(h.hp, hp);
    // And a refresh that finds the pack present changes nothing further.
    const same = json(h);
    ok(apply(s, { type: "refresh", actor: hero }, DM));
    assert.equal(json(s.entities[hero]), same);
  });
});

test("levelUp remakes a character whose pack is missing, and tell the DM", () => {
  const s = newGame(5, { party: [{ sheet: paladin(2, { subclass: undefined }) }] });
  let hero;
  using(ONE, () => { hero = ok(apply(s, { type: "setSheet", sheet: paladin(5) }, DM)).events.find((e) => e.type === "spawned").id; });
  const up = structuredClone(s.entities[hero].sheet);
  up.level = 6;
  up.spells = [...up.spells, "lesser-restoration"];
  const r = ok(apply(s, { type: "levelUp", actor: hero, sheet: up }, DM));
  assert.equal(r.events.filter((e) => e.type === "manual" && e.actor === hero).length, 1);
  assert.equal(s.entities[hero].sheet.subclass, OATH);
  assert.ok(!ids(s.entities[hero]).includes(eh("kindle")));
});

// ---------- an SRD-only game is unchanged ----------
test("an SRD-only sheet derives as before, with nothing missing and no event", () => {
  const sheet = paladin(7, { subclass: "devotion" });
  const plain = derive(sheet), withPack = using(BOTH, () => derive(sheet));
  assert.deepEqual(plain.missing, []);
  assert.equal(json(withPack.record), json(plain.record), "a pack lent to the lookups changes nothing for a sheet that does not name it");
  assert.equal(plain.record.cls, "Paladin (Oath of Devotion)");
  assert.deepEqual(validate(sheet), []);
  const s = newGame(5, { party: [{ sheet }] });
  const r = ok(apply(s, { type: "refresh", actor: "pc1" }, DM));
  assert.deepEqual(r.events, [{ type: "edited", id: "pc1" }]);
});
