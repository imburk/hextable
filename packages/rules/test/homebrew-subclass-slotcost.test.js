// Homebrew subclasses, addition E of docs/specs/homebrew-subclasses.md: a feature's action may cost a spell slot (`cost: { slot: lowest }`, the holder
// picks the level, `cost.higher` grows the steps with it), and `orSlot` restores a spent use with a slot for any caster, not only for Pact Magic.
// The subclasses are invented for this test ("Oath of the Lantern", "the Lantern Patron", a pack "lantern-folk"); no published subclass is used.
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
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "it was refused"); if (re) assert.match(r.error, re); return r; };
const json = (x) => JSON.stringify(x);

// ---------- the invented pack ----------
const P = "lantern-folk", hb = (n) => `hb-${P}-${n}`, SRC = `homebrew:${P}`;
const doc = (lists) => ({ format: "hextable-pack", v: 1, pack: { id: P, name: "Lantern Folk", version: 1, license: "CC0, by the author", attribution: "Written for a test." }, ...lists });
const feature = (id, level, grants, more = {}) => ({ id: hb(id), name: id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()), level, tier: "auto", checked: false, text: `The ${id}, in the pack's own words.`, ...(grants ? { grants } : {}), ...more });
const sub = (id, name, cls, features) => ({ id: hb(id), name, class: cls, source: SRC, checked: false, text: "Sworn to keep a lamp lit.", features });
// Mend: heal 1d8 with a 1st-level slot, and 1d8 more for each level above. Flare: 2d6 radiant at 30 feet with a slot of 2nd level or higher (1d6 more a level) and a use of its own.
// Ward: Temporary Hit Points for Channel Divinity and a slot. Relight: a use of its own that a slot of any level restores. Plain: no slot at all.
// Volley: one fire bolt, one more a level. Surge: a modifier whose number grows.
const MEND = { action: { time: "bonus", target: { self: true }, effects: [{ heal: "1d8" }], cost: { slot: 1, higher: { heal: "1d8" } } } };
const FLARE = { action: { time: "action", target: { creature: { range: [30, 30] } }, effects: [{ damage: "2d6", type: "radiant" }], cost: { slot: 2, higher: { damage: "1d6" } } } };
const WARD = { action: { time: "bonus", target: { self: true }, effects: [{ tempHp: "1d6" }], cost: { resource: "channel-divinity", slot: 1, higher: { tempHp: "1d6" } } } };
const RELIGHT = { action: { time: "bonus", target: { self: true }, effects: [{ tempHp: "2d4" }], orSlot: true } };
const PLAIN = { action: { time: "bonus", target: { self: true }, effects: [{ heal: "1d4" }] } };
const VOLLEY = { action: { time: "action", target: { creature: { range: [30, 30] } }, effects: [{ damage: "1d4", type: "fire" }], cost: { slot: 1, higher: { times: 1 } } } };
const LANTERN = sub("oath-of-the-lantern", "Oath of the Lantern", "paladin", [
  feature("lantern-mend", 3, MEND),
  feature("lantern-flare", 3, FLARE, { uses: { max: 2, recharge: "long" } }),
  feature("lantern-ward", 3, WARD),
  feature("lantern-relight", 3, RELIGHT, { uses: { max: 1, recharge: "long" } }),
  feature("lantern-plain", 3, PLAIN),
  feature("lantern-volley", 3, VOLLEY),
]);
const PATRON = sub("the-lantern-patron", "The Lantern Patron", "warlock", [feature("patron-mend", 3, MEND)]);
const pack = (d) => { const r = loadPack(d); assert.ok(r.ok, (r.problems ?? []).join("; ")); return r.pack; };
const PACK = pack(doc({ subclasses: [LANTERN, PATRON] })), ON = overlayOf([PACK]), OFF = overlayOf([]);
const problems = (...subs) => (loadPack(doc({ subclasses: subs })).problems ?? []).join("\n");
const one = (grants, more = {}, cls = "paladin") => problems(sub("oath-x", "Oath of X", cls, [feature("x-feature", 3, grants, more)]));

// ---------- the table ----------
const A = { str: 16, dex: 10, con: 14, int: 12, wis: 14, cha: 16 };
const paladin = (level = 9, over = {}) => ({ name: "Sir Wick", class: "paladin", level, subclass: hb("oath-of-the-lantern"), abilities: A, skills: ["athletics", "religion"], choices: { "fighting-style": "defense" },
  armour: "chain-mail", shield: true, weapons: ["longsword"], spells: ["bless", "cure-wounds", "aid", "find-steed"].slice(0, level >= 5 ? 3 : 2), ...over });
const warlock = (over = {}) => ({ name: "Mor", class: "warlock", level: 5, subclass: hb("the-lantern-patron"), abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 18 }, skills: ["arcana", "deception"],
  spells: ["eldritch-blast", "chill-touch", "hex", "hold-person"], choices: { "eldritch-invocations": ["agonizing-blast-eldritch-blast", "eldritch-mind", "armor-of-shadows", "repelling-blast-eldritch-blast", "fiendish-vigor"] }, ...over });
// A paladin 5 / cleric 3: the Multiclass Spellcaster table gives caster level 3 + 3 = 6, so 3rd-level slots a paladin 5 has none of.
const multi = () => ({ name: "Vor", classes: [{ class: "paladin", level: 5, subclass: hb("oath-of-the-lantern"), spells: ["bless", "cure-wounds", "aid"] },
  { class: "cleric", level: 3, subclass: "life", spells: ["guidance", "sacred-flame", "spare-the-dying", "bless", "healing-word", "command"] }],
  abilities: A, skills: ["athletics", "religion"], choices: { "fighting-style": "defense", "divine-order": "protector" }, armour: "chain-mail", shield: true, weapons: ["longsword"] });
const ID = (n) => hb(n);
const feat = (r, id) => r.feats.find((f) => f.id === id);

// The hero in a grass field with a goblin 20 feet off (300 Hit Points), the hero at 1 Hit Point so that healing shows. No fight yet unless asked.
function field(sheet = paladin(), { foe = [4, 0], hp = 1 } = {}) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  s.entities.hero.sheet = structuredClone(sheet);
  s.entities.hero.hp = hp;
  ok(apply(s, { type: "claim", entity: "hero", user: "pat", userName: "Pat" }, PAT));
  if (foe) {
    s.gob = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: foe[0], r: foe[1] }, name: "Gob" }, DM)).events[0].id;
    Object.assign(s.entities[s.gob], { hp: 300, maxHp: 300 });
  }
  return s;
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 60 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const use = (s, f, more = {}, ctx = PAT) => apply(s, { type: "feature", actor: "hero", feature: ID(f), ...more }, ctx);
const slots = (s) => json(s.entities.hero.slots);

// ---------- the gate ----------
test("the pack loads in strict mode, its entries lint, and a slot cost is read in words", () => {
  assert.deepEqual(lintEntry("subclasses", LANTERN, { pack: P, srd: CONTENT }), []);
  const read = readEntry("subclasses", LANTERN, { spells: [] });
  assert.deepEqual(read.problems, []);
  const lines = read.lines.join("\n");
  assert.match(lines, /It also spends a spell slot of level 1 or higher \(a Pact Magic slot for a Warlock\): the lowest one the holder has left, unless a level is named when using it\. It is refused, and nothing is spent, if no slot of that level or higher is left\. A slot spent this way is not spent to cast a spell, so it is outside the rule that only one spell slot can be spent to cast a spell on a turn\./);
  assert.doesNotMatch(lines, /which the holder picks/);
  assert.match(lines, /\+1d8 healing for each level of the slot above 1 \(to the first healing step, 1d8 at level 1\)\./);
  assert.match(lines, /\+1d6 damage for each level of the slot above 2/);
  assert.match(lines, /The first damage step is rolled 1 more time for each level of the slot above 1\./);
  assert.match(lines, /spends 1 use of the holder's feature "channel-divinity"/);
  assert.match(lines, /With its uses spent, the holder may spend a spell slot instead \(a Pact Magic slot for a Warlock\), and the use comes back\./);
  assert.ok(read.numbers.some((n) => n.unit === "slot level" && n.value === 2), "the lowest level is a number to check against the source");
});

test("the gate refuses a slot cost that is not whole, each with a sentence", () => {
  const cost = (c, more = {}) => one({ action: { ...MEND.action, cost: c, ...more } });
  assert.equal(cost({ slot: 1 }), "");
  assert.equal(cost({ slot: 9, higher: { heal: "1d8" } }), "");
  assert.equal(cost({ resource: "channel-divinity", n: 1, slot: 2 }), "");
  for (const bad of [0, 10, "1", true, -1]) assert.match(cost({ slot: bad }), /cost.slot is the lowest spell slot level that pays for it, from 1 to 9/, String(bad));
  assert.match(cost({ slot: 1.5 }), /1.5 is not allowed|cost.slot is the lowest/, "a fraction is refused by the strict number check");
  assert.match(cost({}), /cost is { resource, n\? } or { slot, higher\? }, or both/);
  assert.match(cost({ higher: { heal: "1d8" } }), /cost is { resource, n\? } or { slot, higher\? }, or both/);
  assert.match(cost({ resource: "channel-divinity", higher: { heal: "1d8" } }), /cost.higher is for a cost with a `slot`/);
  assert.match(cost({ slot: 1, n: 2 }), /cost.n is a number of uses, with a resource/);
  assert.match(cost({ slot: 1, level: 2 }), /cost: "level" is not something a cost has/);
  assert.match(cost({ slot: 1, resource: "Not An Id" }), /cost.resource names a feature, in kebab-case/);
  assert.match(cost([1]), /cost is { resource, n\?, slot\?, higher\? }/);
  // what grows
  assert.match(cost({ slot: 1, higher: {} }), /cost.higher is { damage\?, heal\?, tempHp\?, times\?, value\? }/);
  assert.match(cost({ slot: 1, higher: { targets: 1 } }), /cost.higher.targets is not something a slot level can add/);
  assert.match(cost({ slot: 1, higher: { heal: 3 } }), /cost.higher.heal must be dice/);
  assert.match(cost({ slot: 1, higher: { heal: "1d8x" } }), /cost.higher.heal must be dice/);
  assert.match(cost({ slot: 1, higher: { times: 0 } }), /cost.higher.times must be a positive whole number up to 10/);
  assert.match(cost({ slot: 1, higher: { value: 41 } }), /cost.higher.value must be a positive whole number up to 40/);
  assert.match(cost({ slot: 1, higher: { damage: "1d6" } }), /cost.higher.damage grows a damage step, and the action has none/);
  assert.match(cost({ slot: 1, higher: { tempHp: "1d6" } }), /cost.higher.tempHp grows a tempHp step, and the action has none/);
  assert.match(cost({ slot: 1, higher: { times: 1 } }), /cost.higher.times repeats a damage step, and the action has none/);
  assert.match(cost({ slot: 1, higher: { value: 1 } }), /cost.higher.value adds to a modifier step's number, and the action has none/);
  // it must grow the step `scaleSteps` grows: the first of its kind, so a later numeric modifier does not do, and nothing is left for a note on every use
  const mods = [{ modifier: { on: "ac", op: "add", value: "1d4" } }, { modifier: { on: "speed", op: "add", value: 5 } }];
  assert.match(cost({ slot: 1, higher: { value: 1 } }, { duration: "1 minute", effects: mods }), /cost.higher.value adds to the number of the first modifier step, and that one has no plain number/);
  assert.equal(cost({ slot: 1, higher: { value: 1 } }, { duration: "1 minute", effects: [mods[1], mods[0]] }), "", "the first one is the plain number");
  assert.match(cost({ slot: 1, higher: { heal: "1d6" } }), /cost.higher.heal adds 1d6 to the first heal step, whose amount is "1d8": it can only add dice of the same size to plain dice/);
  assert.match(cost({ slot: 1, higher: { heal: "1d8" } }, { effects: [{ heal: { mod: "cha", min: 1 } }] }), /whose amount is not plain dice/);
  assert.match(cost({ slot: 1, higher: { damage: "1d6" } }, { target: { creature: { range: [30, 30] } }, effects: [{ damage: { column: "x" }, type: "fire" }] }), /cost.higher.damage adds 1d6 to the first damage step, whose amount is not plain dice/);
  // the first of the kind is the one checked, even when a later one would grow
  assert.match(cost({ slot: 1, higher: { heal: "1d8" } }, { effects: [{ heal: "1d6" }, { heal: "1d8" }] }), /whose amount is "1d6"/);
  assert.equal(cost({ slot: 1, higher: { heal: "1d8" } }, { effects: [{ heal: "1d8+2" }] }), "", "dice with a flat part grow");
  // a step of the kind inside a branch is found, as `scaleSteps` finds it
  assert.equal(cost({ slot: 1, higher: { damage: "1d6" } }, { target: { creature: { range: [30, 30] } }, effects: [{ save: "dex", dc: "cha", onFail: [{ damage: "2d6", type: "fire" }] }] }), "");
  assert.equal(cost({ slot: 1, higher: { value: 1 } }, { duration: "1 minute", effects: [{ modifier: { on: "ac", op: "add", value: 1 } }] }), "");
});

test("what a slot cost cannot go with, and where it may not be", () => {
  const withKey = (k, v) => one({ action: { ...MEND.action, [k]: v } });
  for (const [k, v] of [["renew", true], ["pool", true], ["gain", { action: 1 }], ["orSlot", true], ["cure", { conditions: ["poisoned"], cost: 1 }], ["form", { types: ["beast"], maxCr: 1, fly: 0, hours: 1 }]]) {
    assert.match(withKey(k, v), new RegExp(`an action with a slot cost cannot also have \`${k}\``), k);
  }
  assert.match(withKey("orSlot", true), /a slot is spent for its cost or to restore a use, not both/);
  assert.match(one({ action: { ...MEND.action, effects: undefined, modes: [{ id: "a", name: "A", effects: [{ heal: "1d8" }] }, { id: "b", name: "B", effects: [{ heal: "1d8" }] }] } }), /an action with a slot cost cannot also have `modes`/);
  assert.match(withKey("time", "reaction"), /an action with a slot cost is used by an action, a Bonus Action or a free use, not by a Reaction/);
  assert.match(one({ action: { ...MEND.action, effects: [] } }), /an action with a slot cost has `effects`: the steps the slot pays for/);
  // only a subclass's feature may have one
  const plain = { action: { ...MEND.action } };
  const feat = { id: hb("slot-feat"), name: "Slot Feat", category: "general", tier: "assist", source: SRC, checked: false, text: "t", grants: plain };
  assert.match((loadPack(doc({ feats: [feat] })).problems ?? []).join("\n"), /a feat or an item cannot have a slot cost: only a feature of a subclass can/);
  const item = { id: hb("slot-ring"), name: "Slot Ring", category: "wondrous", rarity: "rare", wear: "carried", tier: "assist", source: SRC, checked: false, text: "t", grants: plain };
  assert.match((loadPack(doc({ items: [item] })).problems ?? []).join("\n"), /a feat or an item cannot have a slot cost: only a feature of a subclass can/);
  // a feat with a cost of its own pool is as it was
  assert.equal((loadPack(doc({ feats: [{ ...feat, id: hb("pool-feat"), grants: { action: { ...MEND.action, cost: { resource: "channel-divinity" } } } }] })).problems ?? []).join("\n"), "");
  // an option of a subclass's feature may have one
  const opt = (id) => ({ id: hb(id), name: id, text: "An option.", tier: "auto", grants: MEND });
  assert.equal(problems(sub("oath-y", "Oath of Y", "paladin", [feature("y-pick", 3, undefined, { tier: "assist", options: [opt("y-one"), opt("y-two")] })])), "");
});

test("the work of a slot cost is counted at the highest slot: a use that is too much at a 9th-level slot is refused, though it passes at the lowest", () => {
  const big = (higher) => one({ action: { time: "action", target: { creature: { range: [30, 30] } }, effects: [{ damage: "50d6", type: "fire", times: 10 }], cost: higher ? { slot: 1, higher } : { slot: 1 } } });
  assert.equal(big(), "", "500 dice at the lowest slot is under the ceiling");
  assert.match(big({ damage: "10d6" }), /dice|the most is/, "grown by 8 levels it is not");
  assert.match(big({ times: 2 }), /dice|steps|the most is/);
});

test("a zone's dice are counted at the highest slot too", () => {
  const zone = (higher) => one({ action: { time: "bonus", duration: "1 minute", target: { area: { shape: "emanation", size: 10 } }, zone: { on: ["enter"] }, effects: [{ save: "wis", dc: "cha", onFail: [{ damage: "2d6", type: "fire" }] }], cost: { slot: 1, higher } } });
  assert.equal(zone({ damage: "1d6" }), "", "a zone that grows a little is fine");
  assert.match(zone({ damage: "40d6" }), /dice|the most is/, "322d6 for each creature that enters at a 9th-level slot is not");
});

test("a zone may cost a slot", () => {
  const zone = (effects) => one({ action: { time: "bonus", duration: "1 minute", target: { area: { shape: "emanation", size: 10 } }, zone: { on: ["enter"] }, effects, cost: { slot: 1 } } });
  assert.equal(zone([{ save: "wis", dc: "cha", onFail: [{ damage: "2d6", type: "fire" }] }]), "", "a zone may cost a slot");
});

// ---------- derive, the reading and what players are sent ----------
test("derive: the record's action carries the cost; the class's content and an SRD-only sheet are not changed", () => {
  const before = json(CONTENT.classes.paladin);
  using(ON, () => {
    assert.deepEqual(validate(paladin()), []);
    const r = derive(paladin()).record;
    assert.deepEqual(feat(r, ID("lantern-mend")).action.cost, { slot: 1, higher: { heal: "1d8" } });
    assert.deepEqual(feat(r, ID("lantern-ward")).action.cost, { resource: "channel-divinity", slot: 1, higher: { tempHp: "1d6" } });
    assert.equal(feat(r, ID("lantern-relight")).action.orSlot, true);
    assert.deepEqual(lintRecord(r, { spells: CONTENT.spells }), []);
  });
  assert.equal(json(CONTENT.classes.paladin), before);
  for (const sheet of [{ ...paladin(9), subclass: "devotion" }, { ...paladin(5), subclass: "devotion" }]) {
    const plain = derive(sheet).record;
    using(ON, () => assert.equal(json(derive(sheet).record), json(plain)));
    for (const f of plain.feats) assert.equal(f.action?.cost?.slot, undefined, f.id);
  }
  for (const c of Object.values(CONTENT.classes)) for (const f of [...c.features, ...(c.subclass?.features ?? [])]) assert.equal(f.grants?.action?.cost?.slot, undefined, `${c.id}/${f.id}`);
});

test("what players are sent: the pack's copy carries the cost as data, and the view and the events are the kinds a use always makes", () => {
  const withNotes = { ...LANTERN, dmNotes: "The DM's own note." };
  const copy = forPlayers(doc({ subclasses: [withNotes] })).data.subclasses[0];
  assert.equal(copy.dmNotes, undefined);
  assert.deepEqual(copy.features[0].grants.action.cost, { slot: 1, higher: { heal: "1d8" } });
  using(ON, () => {
    const keys = (s) => Object.keys(view(s, PAT).entities.hero).sort();
    const srd = field({ ...paladin(), subclass: "devotion" });
    const s = field();
    assert.deepEqual(keys(s), keys(srd), "a hero with the pack's subclass is sent the same fields of a creature as one of an SRD subclass");
    fight(s); turnOf(s, "hero");
    const used = ok(use(s, "lantern-mend", { slot: 2 }));
    assert.deepEqual(used.events.map((x) => x.type), ["std", "std", "heal"], "the kinds a feature that heals makes (its own, one for the slot spent, the heal): no new event type");
    assert.deepEqual(viewEvents(used.events, s, PAT).map((x) => x.type), ["std", "std", "heal"]);
    assert.deepEqual(keys(s), keys(srd));
    assert.deepEqual(view(s, PAT).entities.hero.slots, s.entities.hero.slots, "the slots the player is sent are the creature's own, as they were");
  });
});

// ---------- the cost played ----------
test("a slot pays for the action, and the amount grows with the slot: the lowest, a higher one, and a level named", () => {
  using(ON, () => {
    const s = field();
    fight(s); turnOf(s, "hero");
    const e = s.entities.hero, st = slots(s), bonus = s.encounter.budget.bonus;
    assert.deepEqual(e.slots, { 1: 4, 2: 3, 3: 2 });
    // no level named: the lowest the action allows, 1d8
    const low = ok(use(s, "lantern-mend"));
    const heal = low.events.find((x) => x.type === "heal");
    assert.equal(heal.dice.length, 1, "1d8"); assert.ok(heal.dice.every((d) => d.sides === 8));
    assert.equal(heal.amount, e.hp - 1);
    assert.deepEqual(e.slots, { 1: 3, 2: 3, 3: 2 }, "a level 1 slot is spent");
    assert.equal(s.encounter.budget.bonus, bonus - 1, "and the Bonus Action");
    assert.match(low.events.find((x) => x.type === "std").action, /Lantern mend: spent a level 1 spell slot/);
    // a higher slot: one more d8 a level
    e.hp = 1; s.encounter.budget.bonus = 1;
    const mid = ok(use(s, "lantern-mend", { slot: 3 })).events.find((x) => x.type === "heal");
    assert.equal(mid.dice.length, 3, "3d8 with a level 3 slot"); assert.ok(mid.dice.every((d) => d.sides === 8));
    assert.deepEqual(e.slots, { 1: 3, 2: 3, 3: 1 });
    // a level named that is the lowest
    e.hp = 1; s.encounter.budget.bonus = 1;
    assert.equal(ok(use(s, "lantern-mend", { slot: 1 })).events.find((x) => x.type === "heal").dice.length, 1);
    assert.deepEqual(e.slots, { 1: 2, 2: 3, 3: 1 });
    assert.notEqual(slots(s), st);
    // the lowest level of Flare is 2: with a slot of 2 the damage is 2d6, with 3 it is 3d6
    const d2 = ok(use(s, "lantern-flare", { target: s.gob })).events.find((x) => x.type === "damage");
    assert.equal(d2.dice.length, 2); assert.equal(d2.dtype, "radiant");
    assert.deepEqual(e.slots, { 1: 2, 2: 2, 3: 1 }, "the lowest slot it can use (level 2), as none was named");
    assert.equal(e.uses[ID("lantern-flare")], 1, "and the feature's own use");
    s.encounter.budget.action = 1;
    const d3 = ok(use(s, "lantern-flare", { target: s.gob, slot: 3 })).events.find((x) => x.type === "damage");
    assert.equal(d3.dice.length, 3, "2d6 + 1d6"); assert.ok(d3.dice.every((d) => d.sides === 6));
    assert.deepEqual(e.slots, { 1: 2, 2: 2, 3: 0 });
    assert.equal(e.uses[ID("lantern-flare")], 0);
  });
});

test("with no level named, the lowest slot the creature has at or above the action's is spent; a higher one named is its own", () => {
  using(ON, () => {
    const s = field();
    fight(s); turnOf(s, "hero");
    const e = s.entities.hero;
    e.slots[1] = 0; e.slots[2] = 0;
    const heal = ok(use(s, "lantern-mend")).events.find((x) => x.type === "heal");
    assert.equal(heal.dice.length, 3, "only a level 3 slot is left, so that is the one, and it heals 3d8");
    assert.deepEqual(e.slots, { 1: 0, 2: 0, 3: 1 });
  });
});

test("a multiclass caster's slots are the table's: a paladin 5 / cleric 3 has 3rd-level slots and spends one, 3d8", () => {
  using(ON, () => {
    assert.deepEqual(validate(multi()), []);
    const s = field(multi());
    fight(s); turnOf(s, "hero");
    const e = s.entities.hero;
    assert.deepEqual(e.slots, { 1: 4, 2: 3, 3: 3 });
    const heal = ok(use(s, "lantern-mend", { slot: 3 })).events.find((x) => x.type === "heal");
    assert.equal(heal.dice.length, 3);
    assert.deepEqual(e.slots, { 1: 4, 2: 3, 3: 2 });
    // a paladin 5 alone has none of level 3
    const alone = field(paladin(5));
    fight(alone); turnOf(alone, "hero");
    const before = json(alone);
    no(use(alone, "lantern-mend", { slot: 3 }), /has no level 3 spell slots left/);
    assert.equal(json(alone), before);
  });
});

test("Pact Magic: a Warlock's slots are one level, spent as a spell's are, and the event says Pact Magic", () => {
  using(ON, () => {
    assert.deepEqual(validate(warlock()), []);
    const s = field(warlock());
    fight(s); turnOf(s, "hero");
    const e = s.entities.hero;
    assert.equal(e.pact, true); assert.deepEqual(e.slots, { 3: 2 });
    // the level of the only slot it has is spent with none named: 3d8
    const r = ok(use(s, "patron-mend"));
    assert.equal(r.events.find((x) => x.type === "heal").dice.length, 3);
    assert.deepEqual(e.slots, { 3: 1 });
    assert.match(r.events.find((x) => x.type === "std").action, /spent a level 3 Pact Magic slot/);
    // a level it has no slot of
    e.hp = 1; s.encounter.budget.bonus = 1;
    const before = json(s);
    no(use(s, "patron-mend", { slot: 1 }), /has no level 1 spell slots left|no spell slot/);
    assert.equal(json(s), before);
    // and one short rest brings the Pact slots back, as they always do
    e.slots[3] = 0;
    no(use(s, "patron-mend"), /has no spell slot of level 1 or higher left for Patron mend/);
    assert.equal(json(s).includes('"slots":{"3":0}'), true);
  });
});

test("a slot cost beside Channel Divinity or a use: both are paid together, and a refusal on either pays neither", () => {
  using(ON, () => {
    const s = field();
    fight(s); turnOf(s, "hero");
    const e = s.entities.hero, cd = e.uses["channel-divinity"];
    const ward = ok(use(s, "lantern-ward", { slot: 2 }));
    assert.equal(ward.events.find((x) => x.type === "tempHp").amount > 0, true);
    assert.equal(e.uses["channel-divinity"], cd - 1, "Channel Divinity");
    assert.equal(e.slots[2], 2, "and a level 2 slot");
    // no Channel Divinity left: refused, the slot stays
    s.encounter.budget.bonus = 1; e.uses["channel-divinity"] = 0; e.tempHp = 0;
    let before = json(s);
    no(use(s, "lantern-ward", { slot: 2 }), /no uses of Channel Divinity left/);
    assert.equal(json(s), before);
    // no slot left: refused, Channel Divinity stays
    e.uses["channel-divinity"] = 2; e.slots = { 1: 0, 2: 0, 3: 0 };
    before = json(s);
    no(use(s, "lantern-ward"), /has no spell slot of level 1 or higher left for Lantern ward/);
    assert.equal(json(s), before);
    // the feature's own use spent: refused, the slot stays
    e.slots = { 1: 4, 2: 3, 3: 2 }; e.uses[ID("lantern-flare")] = 0;
    before = json(s);
    no(use(s, "lantern-flare", { target: s.gob }), /no uses of Lantern flare left/);
    assert.equal(json(s), before);
  });
});

test("a refused use changes nothing: no slot, no use, no action, no event, whatever the reason", () => {
  using(ON, () => {
    const s = field();
    fight(s); turnOf(s, "hero");
    const e = s.entities.hero;
    let snap = json(s);
    const refused = (r, re) => { no(r, re); assert.equal(json(s), snap, "the state is exactly as it was"); };
    // the level asked for
    refused(use(s, "lantern-flare", { target: s.gob, slot: 1 }), /needs a spell slot of level 2 or higher/);
    for (const bad of [10, 0, 2.5, "2", true]) refused(use(s, "lantern-mend", { slot: bad }), /needs a spell slot of level 1 or higher/);
    refused(use(s, "lantern-mend", { slot: 4 }), /has no level 4 spell slots left/);
    // not the holder's to use
    refused(use(s, "lantern-mend", {}, { role: "player", userId: "kim" }), /./);
    // a target out of reach, and none named
    s.entities[s.gob].pos = { q: 12, r: 0, z: 0 }; snap = json(s);
    refused(use(s, "lantern-flare", { target: s.gob }), /./);
    refused(use(s, "lantern-flare"), /./);
    // a slot named for a feature that costs none
    refused(use(s, "lantern-plain", { slot: 1 }), /Lantern plain is not paid for with a spell slot/);
    // no Bonus Action
    s.encounter.budget.bonus = 0; snap = json(s);
    refused(use(s, "lantern-mend"), /Bonus Action/i);
    // no slot of any level at or above the lowest
    s.encounter.budget.bonus = 1; e.slots = { 1: 0, 2: 0, 3: 0 }; snap = json(s);
    refused(use(s, "lantern-mend"), /has no spell slot of level 1 or higher left for Lantern mend/);
    refused(use(s, "lantern-mend", { slot: 1 }), /has no spell slot of level 1 or higher left for Lantern mend/);
    // down
    e.slots = { 1: 4, 2: 3, 3: 2 }; e.hp = 0; snap = json(s);
    refused(use(s, "lantern-mend"), /./);
    // a record whose data skipped the gate: a cost with no steps to pay for is refused with a sentence, nothing changes
    e.hp = 1; feat(e, ID("lantern-mend")).action.effects = []; snap = json(s);
    refused(use(s, "lantern-mend"), /costs a spell slot, but its data gives no plain steps for the slot to pay for\. The DM can apply it\./);
    for (const k of ["modes", "form", "pool", "renew", "orSlot", "gain"]) { feat(e, ID("lantern-mend")).action = { ...MEND.action, [k]: k === "modes" ? [{ id: "a", name: "A", effects: [{ heal: "1d8" }] }] : true }; snap = json(s); refused(use(s, "lantern-mend"), /costs a spell slot, but its data gives no plain steps|is a Reaction|./); }
  });
});

test("outside a fight a slot is spent just the same, and a rest brings it back", () => {
  using(ON, () => {
    const s = field();
    const e = s.entities.hero;
    const heal = ok(use(s, "lantern-mend", { slot: 2 })).events.find((x) => x.type === "heal");
    assert.equal(heal.dice.length, 2);
    assert.equal(e.slots[2], 2);
    ok(apply(s, { type: "rest", kind: "long" }, DM));
    assert.deepEqual(e.slots, { 1: 4, 2: 3, 3: 2 });
  });
});

test("a repeated damage step grows by `times`: one more bolt a level", () => {
  using(ON, () => {
    const s = field();
    fight(s); turnOf(s, "hero");
    const hits = ok(use(s, "lantern-volley", { target: s.gob, slot: 3 })).events.filter((x) => x.type === "damage");
    assert.equal(hits.length, 1, "the repeats of one damage step are one damage, as a spell's are");
    assert.equal(hits[0].dice.length, 3, "1d4 rolled 3 times: once, and 2 more for the two levels above");
    assert.deepEqual(s.entities.hero.slots, { 1: 4, 2: 3, 3: 1 });
  });
});

test("a zone that costs a slot: the slot is spent, and the zone steps are the grown ones", () => {
  const AURA = { action: { time: "bonus", duration: "1 minute", target: { area: { shape: "emanation", size: 10 } }, zone: { on: ["enter"] }, effects: [{ damage: "1d6", type: "fire" }], cost: { slot: 1, higher: { damage: "1d6" } } } };
  const ZONED = pack(doc({ subclasses: [sub("oath-of-the-lantern", "Oath of the Lantern", "paladin", [feature("lantern-glow", 3, AURA)])] }));
  using(overlayOf([ZONED]), () => {
    const s = field(paladin(), { foe: [2, 0] });
    fight(s); turnOf(s, "hero");
    ok(use(s, "lantern-glow", { slot: 3 }));
    assert.equal(s.entities.hero.slots[3], 1);
    const fx = s.effects.find((x) => x.zone);
    assert.equal(fx.zone.steps[0].damage, "3d6", "the zone's steps are grown by the slot: 1d6 and two more");
  });
});

test("orSlot for any caster: with the use spent, a slot of any level restores it, a Pact Magic slot for a Warlock as before", () => {
  using(ON, () => {
    const s = field();
    fight(s); turnOf(s, "hero");
    const e = s.entities.hero;
    assert.equal(e.pact, undefined);
    // a use left: a slot is not needed, and not taken
    let before = json(s);
    no(use(s, "lantern-relight", { slot: 2 }), /has a use of Lantern relight left; a spell slot restores it only once it is spent/);
    assert.equal(json(s), before);
    // spent: refused with the way out named; then with a slot named
    e.uses[ID("lantern-relight")] = 0; before = json(s);
    no(use(s, "lantern-relight"), /no uses of Lantern relight left\. A spell slot can restore it: name the slot\./);
    assert.equal(json(s), before);
    no(use(s, "lantern-relight", { slot: 4 }), /has no spell slot of level 4 to spend/);
    no(use(s, "lantern-relight", { slot: "2" }), /has no spell slot of level 2 to spend/);
    assert.equal(json(s), before);
    const r = ok(use(s, "lantern-relight", { slot: 2 }));
    assert.equal(e.slots[2], 2); assert.equal(e.uses[ID("lantern-relight")], 0, "the use is not given back: the slot paid for this one");
    assert.ok(r.events.some((x) => x.type === "tempHp"));
    assert.match(r.events.find((x) => x.type === "std").action, /restored with a level 2 spell slot/);
    // a creature with no slots at all
    const none = field({ ...paladin(2), subclass: hb("oath-of-the-lantern") });
    assert.equal(feat(none.entities.hero, ID("lantern-relight")), undefined, "level 2 has no subclass yet");
  });
  // Hurl Through Hell, the Warlock's own: unchanged (classes-warlock.test.js holds the rest); here, the sentences for a Pact Magic slot
  const hurl = [...CONTENT.classes.warlock.features, ...(CONTENT.classes.warlock.subclass?.features ?? [])].find((f) => f.id === "hurl-through-hell");
  assert.equal(hurl.grants.action.orSlot, true);
});

test("an SRD-only game is as it was: the same features, the same state, the same view", () => {
  const sheet = { ...paladin(9), subclass: "devotion" };
  const run = () => { const s = field(sheet); fight(s); turnOf(s, "hero"); return s; };
  const a = run();
  using(ON, () => { const b = run(); assert.equal(json(b), json(a)); });
  const lay = ok(apply(a, { type: "feature", actor: "hero", feature: "lay-on-hands", target: "hero", amount: 1 }, PAT));
  assert.equal(lay.events.some((x) => x.type === "heal"), true);
  no(apply(a, { type: "feature", actor: "hero", feature: "lay-on-hands", target: "hero", amount: 1, slot: 1 }, PAT), /not paid for with a spell slot/);
});

// ---------- replay ----------
test("replay: the same actions from the same seed give the same state and the same events, a slot spent and all", () => {
  const run = () => {
    const out = [];
    using(ON, () => {
      const s = field();
      fight(s); turnOf(s, "hero");
      out.push(...ok(use(s, "lantern-mend", { slot: 3 })).events);
      s.encounter.budget.action = 1;
      out.push(...ok(use(s, "lantern-flare", { target: s.gob, slot: 2 })).events);
      out.push(s);
    });
    return out;
  };
  const a = run(), b = run();
  assert.deepEqual(a, b);
  assert.ok(a.some((e) => e.type === "heal") && a.some((e) => e.type === "damage"));
});

test("the overlay away: the feature is not there to use, and the slots are the creature's own", () => {
  const s = newGame(5, { party: [{ sheet: { ...paladin(4), subclass: "devotion" } }] });
  let hero;
  using(ON, () => { hero = ok(apply(s, { type: "setSheet", sheet: paladin() }, DM)).events.find((x) => x.type === "spawned").id; });
  assert.ok(feat(s.entities[hero], ID("lantern-mend")).action.cost.slot);
  ok(apply(s, { type: "refresh", actor: hero }, DM));
  assert.equal(feat(s.entities[hero], ID("lantern-mend")), undefined);
  using(OFF, () => no(apply(s, { type: "feature", actor: hero, feature: ID("lantern-mend") }, DM), /no such feature/));
});
