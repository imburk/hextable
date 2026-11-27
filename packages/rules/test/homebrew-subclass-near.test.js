// Homebrew subclasses, addition G of docs/specs/homebrew-subclasses.md: `target: { near }` (a second creature within so many feet of the first target takes the damage steps the
// action begins with, the roll shared) and a mode with a price of its own (`cost`) or none (`free`). The college is invented for this test ("College of the Silver Fan", a pack
// "silver-fan-folk"); no published subclass is used.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { CONTENT } from "../src/content/index.js";
import { loadPack, overlayOf, using } from "../src/content/registry.js";
import { lintEntry, lintRecord, nearProblem, nearRun, workOf } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { forPlayers } from "../src/content/packs.js";
import { modifiers } from "../src/modifiers.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "it was refused"); if (re) assert.match(r.error, re); return r; };
const json = (x) => JSON.stringify(x);

// ---------- the invented pack ----------
const P = "silver-fan-folk", hb = (n) => `hb-${P}-${n}`, SRC = `homebrew:${P}`;
const doc = (lists) => ({ format: "hextable-pack", v: 1, pack: { id: P, name: "Silver Fan Folk", version: 1, license: "CC0, by the author", attribution: "Written for a test." }, ...lists });
const feature = (id, level, grants, more = {}) => ({ id: hb(id), name: id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()), level, tier: "auto", checked: false, text: `The ${id}, in the pack's own words.`, ...(grants ? { grants } : {}), ...more });
const sub = (id, name, cls, features) => ({ id: hb(id), name, class: cls, source: SRC, checked: false, text: "Sworn to the silver fan.", features });
const STEP = { damage: { column: "bardic-die" }, type: "slashing" };
const till = { on: "turnStart" };
const AC = { modifier: { on: "ac", op: "add", value: { rolled: true } }, to: "caster", ends: till };
const D6 = { damage: "1d6", type: "slashing" };
const RESERVE = hb("fan-reserve");
const aim = { creature: { range: [5, 5] } };
// Flourish: after a weapon hit, one of six ways. Slash: the die to the creature hit and to a second creature within 5 feet of it. Guard: the die, and the same number added to the holder's
// Armor Class. Sweep: both. Master: a d6 and a second creature, for no die at all. Heavy: two dice. Reserve: a use of the Fan's own reserve instead of a die.
const FLOURISH = { action: { time: "free", after: "weaponHit", target: aim, cost: { resource: "bardic-inspiration" }, modes: [
  { id: "slash", name: "Slash", target: { near: 5 }, effects: [STEP] },
  { id: "guard", name: "Guard", effects: [STEP, AC] },
  { id: "sweep", name: "Sweep", target: { near: 5 }, effects: [STEP, AC] },
  { id: "master", name: "Master", free: true, target: { near: 5 }, effects: [D6] },
  { id: "heavy", name: "Heavy", cost: { resource: "bardic-inspiration", n: 2 }, effects: [STEP] },
  { id: "reserve", name: "Reserve", cost: { resource: RESERVE }, effects: [STEP] },
] } };
// Fan: no modes; the second creature may be 10 feet from the first; the first alone is knocked Prone.
const FAN = { action: { time: "free", after: "weaponHit", target: { ...aim, near: 10 }, cost: { resource: "bardic-inspiration" }, effects: [STEP, { condition: "prone" }] } };
// Burst: a Bonus Action that spends a spell slot (the lowest level 1, a d8 more for each level above), and burns a creature and one within 5 feet of it, one roll for both.
const BURST = { action: { time: "bonus", target: { creature: { range: [30, 30] }, near: 5 }, cost: { slot: 1, higher: { damage: "1d8" } }, effects: [{ damage: "1d8", type: "fire" }] } };
const SILVER = sub("college-of-the-silver-fan", "College of the Silver Fan", "bard", [
  feature("fan-flourish", 3, FLOURISH), feature("fan-sweep", 3, FAN), feature("fan-burst", 3, BURST),
  feature("fan-reserve", 3, undefined, { tier: "manual", uses: { max: 2, recharge: "long" } }),
]);
const pack = (d) => { const r = loadPack(d); assert.ok(r.ok, (r.problems ?? []).join("; ")); return r.pack; };
const PACK = pack(doc({ subclasses: [SILVER] })), ON = overlayOf([PACK]), OFF = overlayOf([]);
const problems = (...subs) => (loadPack(doc({ subclasses: subs })).problems ?? []).join("\n");
const one = (grants, more = {}) => problems(sub("college-x", "College of X", "bard", [feature("x-feature", 3, grants, more), feature("fan-reserve", 3, undefined, { tier: "manual", uses: { max: 2, recharge: "long" } })]));
const acts = (action) => ({ action: { time: "free", after: "weaponHit", target: aim, cost: { resource: "bardic-inspiration" }, effects: [STEP], ...action } });
const withModes = (...modes) => acts({ effects: undefined, modes });

// ---------- the table ----------
const A = { str: 10, dex: 14, con: 12, int: 10, wis: 10, cha: 18 };
const bard = (level = 5, over = {}) => ({ name: "Zaa", class: "bard", level, subclass: hb("college-of-the-silver-fan"), abilities: A,
  skills: ["performance", "persuasion", "insight"], expertise: ["performance", "persuasion"], weapons: ["dagger"], spells: ["vicious-mockery"], ...over });
const ID = (n) => hb(n);
const feat = (r, id) => r.feats.find((f) => f.id === id);

// The hero in a dark-less grass field with Gob beside it (1,0), Bo beside Gob (2,0: 10 feet from the hero), and Cy 15 feet from Gob (4,0); each of 300 Hit Points and Armor Class 1,
// so that only a natural 1 misses. No fight yet.
function field(sheet = bard(), { seed = 7 } = {}) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  s.entities.hero.sheet = structuredClone(sheet);
  ok(apply(s, { type: "claim", entity: "hero", user: "pat", userName: "Pat" }, PAT));
  for (const [key, at, name] of [["gob", { q: 1, r: 0 }, "Gob"], ["bo", { q: 2, r: 0 }, "Bo"], ["cy", { q: 4, r: 0 }, "Cy"]]) {
    s[key] = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at, name }, DM)).events[0].id;
    Object.assign(s.entities[s[key]], { hp: 300, maxHp: 300, ac: 1 });
  }
  return s;
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 5 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 60 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const swing = (s) => { s.encounter.budget.action = 1; return ok(apply(s, { type: "attack", actor: "hero", attack: "dagger", target: s.gob }, PAT)).events.find((x) => x.type === "attack"); };
// A fight on the hero's turn in which the hero has hit Gob with its dagger (the seed is changed until it hits: a natural 1 misses).
function hitFight(sheet = bard(), { from = 1, tweak } = {}) {
  for (let seed = from; seed < from + 60; seed++) {
    const s = field(sheet, { seed });
    tweak?.(s);
    fight(s); turnOf(s, "hero");
    if (swing(s).hit) return s;
  }
  throw new Error("no seed hit");
}
const use = (s, f, more = {}, ctx = PAT) => apply(s, { type: "feature", actor: "hero", feature: ID(f), target: s.gob, ...more }, ctx);
const flourish = (s, mode, more = {}, ctx = PAT) => use(s, "fan-flourish", { mode, ...more }, ctx);
const acOf = (s, t) => { const m = modifiers(s, t, "ac", { target: t }); return (m.set ?? t.ac) + m.add; };
const dealt = (r, id) => r.events.filter((x) => x.type === "damage" && x.target === id);
const hpOf = (s, id) => s.entities[id].hp;
const pool = (s) => s.entities.hero.uses["bardic-inspiration"];

// ---------- the gate and the reading ----------
test("the pack loads in strict mode, its entries lint, and `near`, `free` and a mode's `cost` are read in words", () => {
  assert.deepEqual(lintEntry("subclasses", SILVER, { pack: P, srd: CONTENT }), []);
  const read = readEntry("subclasses", SILVER, { spells: [] });
  assert.deepEqual(read.problems, []);
  const lines = read.lines.join("\n");
  assert.match(lines, /In the "Slash" way, a second creature within 5 feet of the first target may be named as well, by the holder \(a second name in `targets`\)\. It must be another creature than the holder and the first target; nothing says it must be a foe, so an ally may be named\. It takes the damage steps the action begins with, rolled once for the two of them \(the same roll, not a new one\), and nothing else: every step after those is done to the first target alone\./);
  assert.match(lines, /The "Master" way costs nothing: it spends no use of anything, whatever the action costs otherwise\./);
  assert.match(lines, /The "Heavy" way spends 2 uses of the holder's feature "bardic-inspiration" instead of what the action costs otherwise\./);
  assert.match(lines, /The "Reserve" way spends 1 use of the holder's feature "hb-silver-fan-folk-fan-reserve" instead of/);
  assert.match(lines, /^ *A second creature within 10 feet of the first target may be named as well/m, "on the action itself");
  assert.equal(nearRun([D6, D6, AC, D6]), 2); assert.equal(nearRun("not a list"), 0);
  assert.equal(nearProblem([D6, AC]), null);
});

test("the gate refuses `near` where it is not allowed, a sentence for each", () => {
  const modes2 = (m) => withModes({ id: "a", name: "A", effects: [STEP] }, m);
  assert.equal(one(acts({ target: { ...aim, near: 5 } })), "", "on the action");
  assert.equal(one(modes2({ id: "b", name: "B", target: { near: 5 }, effects: [STEP] })), "", "on a mode");
  // what it needs of the action
  assert.match(one(acts({ target: { self: true, near: 5 } })), /needs a creature to be the first: the action is aimed at one creature, not at the holder or at an area/);
  assert.match(one(acts({ after: undefined, target: { area: { shape: "sphere", size: 10, range: 30 }, near: 5 } })), /needs a creature to be the first/);
  assert.match(one(acts({ target: { creature: { range: [5, 5], count: 2 }, near: 5 } })), /is for an action with one target: `count` and `within` are how an action names several/);
  assert.match(one(acts({ target: { creature: { range: [5, 5], within: 5 }, near: 5 } })), /`repeat` and `within` are how an action names several/);
  assert.match(one(acts({ target: { creature: { range: [5, 5], repeat: true }, near: 5 } })), /`repeat` and `within`/);
  assert.match(one(acts({ target: { ...aim, near: 7 } })), /near is feet, a multiple of 5/);
  assert.match(one(acts({ target: { ...aim, near: 0 } })), /a whole number from 5 to 60/);
  assert.match(one(acts({ target: { ...aim, near: 65 } })), /near/, "past the most a table may ask for");
  assert.equal(one(acts({ target: { ...aim, near: 60 } })), "", "60 is the most");
  assert.match(one(acts({ pool: true, effects: undefined, target: { ...aim, near: 5 } })), /is for an action that does steps, not a pool of healing, an extra action or a form/);
  assert.match(one(acts({ after: undefined, gain: { action: 1 }, effects: undefined, target: { self: true, near: 5 } })), /is for an action that does steps/);
  // what it needs of the steps: the action begins with damage, plain
  assert.match(one(acts({ target: { ...aim, near: 5 }, effects: [{ condition: "prone" }, STEP] })), /takes the damage steps the action begins with, and its first step is not a damage step/);
  assert.match(one(acts({ target: { ...aim, near: 5 }, effects: [{ save: "dex", dc: 12, onFail: [STEP] }] })), /its first step is not a damage step/);
  assert.match(one(acts({ target: { ...aim, near: 5 }, effects: [{ ...STEP, when: ["melee"] }] })), /must have no `when`, `onKill` or `onZero`/);
  assert.match(one(acts({ target: { ...aim, near: 5 }, effects: [{ ...STEP, onKill: [{ heal: "1d4" }] }] })), /must have no `when`, `onKill` or `onZero`/);
  assert.match(one(acts({ target: { ...aim, near: 5 }, effects: [{ ...STEP, onZero: [{ condition: "prone" }] }] })), /must have no `when`, `onKill` or `onZero`/);
  assert.equal(one(acts({ target: { ...aim, near: 5 }, effects: [STEP, { damage: "1d4", type: "fire" }, { condition: "prone" }] })), "", "a run of damage steps");
  // on the action, every mode must begin so; on a mode, that mode
  assert.match(one({ action: { ...withModes({ id: "a", name: "A", effects: [STEP] }, { id: "b", name: "B", effects: [{ condition: "prone" }] }).action, target: { ...aim, near: 5 } } }), /its first step is not a damage step/);
  assert.match(one(modes2({ id: "b", name: "B", target: { near: 5 }, effects: [{ condition: "prone" }] })), /its first step is not a damage step/);
  // a mode's own target
  assert.match(one(modes2({ id: "b", name: "B", target: { near: 7 }, effects: [STEP] })), /mode b: near is feet, a multiple of 5/);
  assert.match(one(modes2({ id: "b", name: "B", target: { creature: aim.creature }, effects: [STEP] })), /mode b: a mode's target is \{ near \}, and nothing else: who the action is aimed at is the action's/);
  assert.match(one(modes2({ id: "b", name: "B", target: { near: 5, self: true }, effects: [STEP] })), /a mode's target is \{ near \}, and nothing else/);
  assert.match(one({ action: { ...modes2({ id: "b", name: "B", target: { near: 5 }, effects: [STEP] }).action, target: { ...aim, near: 5 } } }), /`near` is said on the action or on its modes, not both/);
  assert.match(one({ action: { ...modes2({ id: "b", name: "B", target: { near: 5 }, effects: [STEP] }).action, target: { self: true } } }), /needs a creature to be the first/, "a mode's near on an action of the holder alone");
  // a zone is an area, and near needs a creature
  const zone = { time: "bonus", duration: "1 minute", target: { area: { shape: "emanation", size: 10 }, near: 5 }, zone: { on: ["enter"] }, effects: [STEP] };
  assert.match(one({ action: zone }), /needs a creature to be the first/);
});

test("`near` is for a subclass's feature: a feat, an item, a spell, a monster and an object are refused", () => {
  const why = /a second target near the first \(`near`\)|`near` \(a second target near the first\)/;
  const plain = { action: { time: "bonus", target: { creature: { reach: 5 }, near: 5 }, effects: [STEP2()] } };
  function STEP2() { return { damage: "1d8", type: "slashing" }; }
  const feats = { id: hb("near-feat"), name: "Near Feat", category: "general", tier: "assist", source: SRC, checked: false, text: "t", grants: plain };
  assert.match((loadPack(doc({ feats: [feats] })).problems ?? []).join("\n"), /a feat or an item cannot have a second target near the first \(`near`\): only a feature of a subclass can/);
  const item = { id: hb("near-ring"), name: "Near Ring", category: "wondrous", rarity: "rare", wear: "carried", tier: "assist", source: SRC, checked: false, text: "t", grants: plain };
  assert.match((loadPack(doc({ items: [item] })).problems ?? []).join("\n"), /a feat or an item cannot have a second target near the first/);
  const spell = { id: hb("near-spell"), name: "Near Spell", source: SRC, level: 1, school: "evocation", classes: ["bard"], time: "action", range: 30, components: ["v"], duration: "instant", concentration: false, ritual: false,
    target: { creature: { count: 1 }, near: 5 }, effects: [{ damage: "1d8", type: "fire" }], tier: "auto", checked: false, text: "t" };
  assert.match((loadPack(doc({ spells: [spell] })).problems ?? []).join("\n"), why);
  const monster = { id: hb("near-beast"), name: "Near Beast", source: SRC, size: "medium", type: "beast", cr: 1, xp: 200, pb: 2, ac: 12, hp: 20, speed: { walk: 30 }, senses: {}, abilities: A, initiative: 1, languages: [], skills: {}, saves: {},
    actions: [{ id: "bite", name: "Bite", text: "t", time: "action", target: { creature: { reach: 5 }, near: 5 }, effects: [{ attack: "melee", kind: "weapon", bonus: 4, onHit: [{ damage: "1d6", type: "piercing" }] }] }], traits: [], tier: "auto", checked: false, text: "t" };
  assert.match((loadPack(doc({ monsters: [monster] })).problems ?? []).join("\n"), why);
});

test("the gate refuses a mode's price: `cost`, `free` and what they cannot sit beside", () => {
  const mode = (m) => withModes({ id: "a", name: "A", effects: [STEP] }, { id: "b", name: "B", effects: [STEP], ...m });
  assert.equal(one(mode({ free: true })), "");
  assert.equal(one(mode({ cost: { resource: "bardic-inspiration" } })), "");
  assert.equal(one(mode({ cost: { resource: "bardic-inspiration", n: 2 } })), "");
  assert.equal(one(mode({ cost: { resource: RESERVE } })), "", "a pool of the subclass itself");
  assert.match(one(mode({ free: false })), /mode b: `free` is true or left out/);
  assert.match(one(mode({ free: "yes" })), /mode b: `free` is true or left out/);
  assert.match(one(mode({ cost: { resource: "bardic-inspiration", n: 0 } })), /mode b: cost is \{ resource, n\? \}: the pool this mode spends instead of the action's own price/);
  assert.match(one(mode({ cost: { n: 1 } })), /mode b: cost is \{ resource, n\? \}/);
  assert.match(one(mode({ cost: { resource: "bardic-inspiration", slot: 1 } })), /mode b: cost is \{ resource, n\? \}/);
  assert.match(one(mode({ cost: "bardic-inspiration" })), /mode b: cost is \{ resource, n\? \}/);
  assert.match(one(mode({ cost: { resource: "bardic-inspiration" }, free: true })), /mode b: a mode costs nothing \(`free`\) or has a price of its own \(`cost`\), not both/);
  assert.match(one(mode({ cost: { resource: "channel-divinity" } })), /a cost names "channel-divinity", which is not a feature with uses of the Bard or of this subclass/, "another class's pool");
  assert.match(one(mode({ cost: { resource: hb("nothing") } })), /a cost names "hb-silver-fan-folk-nothing", which is not a feature with uses/);
  assert.match(one(mode({ colour: "red" })), /a mode is \{ id, name, effects, target\?, cost\?, free\? \}/);
  assert.match(one({ action: { ...mode({ free: true }).action, orCost: { resource: "bardic-inspiration", n: 1 } } }), /a mode with a price of its own \(or none\) cannot be on an action with `orCost` or `orSlot`/);
  assert.match(one({ action: { ...mode({ cost: { resource: RESERVE } }).action, orSlot: true } }), /cannot be on an action with `orCost` or `orSlot`/);
  assert.equal(one({ action: { ...withModes({ id: "a", name: "A", effects: [STEP] }, { id: "b", name: "B", effects: [STEP] }).action, orSlot: true } }), "", "orSlot beside modes with no price of their own is as it was");
  assert.match(one({ action: { ...mode({ free: true }).action, cost: { slot: 1 } } }), /an action with a slot cost cannot also have `modes`/);
});

test("the work estimate counts the second creature's damage steps on top of the first creature's, and no dice more (the roll is shared)", () => {
  const entry = (target) => ({ ...sub("college-x", "College of X", "bard", [feature("x-feature", 3, acts({ target, effects: [{ damage: "1d6", type: "fire", times: 5 }, { condition: "prone" }, { condition: "frightened" }] }))]) });
  const alone = workOf("subclasses", entry(aim)), near = workOf("subclasses", entry({ ...aim, near: 5 }));
  assert.equal(alone.work, 5 + 1 + 1);
  assert.equal(near.work, 5 + 1 + 1 + 5, "the damage run of the second creature: the step of five rolls");
  assert.equal(near.dice, alone.dice, "one roll for the two creatures");
  // a mode's own near counts for that mode alone
  const modes = workOf("subclasses", sub("college-x", "College of X", "bard", [feature("x-feature", 3, withModes({ id: "a", name: "A", effects: [D6, D6] }, { id: "b", name: "B", target: { near: 5 }, effects: [D6, D6] }))]));
  assert.equal(modes.work, 4, "two steps and, for the mode with near, two more");
});

// ---------- derive, the record and what players are sent ----------
test("derive: the record's action carries the modes' price, `free` and `near` as data; the class's content and an SRD-only sheet are not changed", () => {
  const before = json(CONTENT.classes.bard);
  using(ON, () => {
    assert.deepEqual(validate(bard()), []);
    const r = derive(bard()).record;
    const a = feat(r, ID("fan-flourish")).action;
    assert.deepEqual(a.modes.map((m) => [m.id, m.free, m.cost, m.target]), [
      ["slash", undefined, undefined, { near: 5 }], ["guard", undefined, undefined, undefined], ["sweep", undefined, undefined, { near: 5 }], ["master", true, undefined, { near: 5 }],
      ["heavy", undefined, { resource: "bardic-inspiration", n: 2 }, undefined], ["reserve", undefined, { resource: RESERVE }, undefined]]);
    assert.deepEqual(a.modes[0].effects[0], { damage: "1d8", type: "slashing" }, "the Bardic die at level 5, put in");
    assert.equal(feat(r, ID("fan-sweep")).action.target.near, 10);
    assert.deepEqual(lintRecord(r, { spells: CONTENT.spells }), []);
    // a record whose mode names a pool the character does not have is refused, as an action's own cost is
    const bad = structuredClone(r); feat(bad, ID("fan-flourish")).action.modes[5].cost.resource = "nothing-here";
    assert.match(lintRecord(bad, { spells: CONTENT.spells }).join("\n"), /its mode reserve costs "nothing-here", which it does not have/);
  });
  assert.equal(json(CONTENT.classes.bard), before);
  const lore = { ...bard(), subclass: "lore", skills: ["performance", "persuasion", "insight", "history", "arcana", "deception"] };
  const plain = derive(lore).record;
  using(ON, () => assert.equal(json(derive(lore).record), json(plain)));
  for (const c of Object.values(CONTENT.classes)) for (const f of [...c.features, ...(c.subclass?.features ?? [])]) {
    assert.ok(!json(f.grants?.action ?? {}).includes('"near":') && !json(f.grants?.action ?? {}).includes('"free":true'), `${c.id}/${f.id}`);
    for (const m of f.grants?.action?.modes ?? []) assert.equal(m.cost, undefined, `${c.id}/${f.id}/${m.id}`);
  }
});

test("what players are sent: the pack's copy carries the data; the view, the events and the flags are the kinds a use always makes", () => {
  const copy = forPlayers(doc({ subclasses: [{ ...SILVER, dmNotes: "The DM's own note." }] })).data.subclasses[0];
  assert.equal(copy.dmNotes, undefined);
  const modes = copy.features[0].grants.action.modes;
  assert.deepEqual(modes[0].target, { near: 5 }); assert.equal(modes[3].free, true); assert.deepEqual(modes[4].cost, { resource: "bardic-inspiration", n: 2 });
  assert.deepEqual(copy.features[1].grants.action.target, { creature: { range: [5, 5] }, near: 10 });
  using(ON, () => {
    const s = hitFight();
    const flagsBefore = Object.keys(view(s, PAT).encounter.flags);
    const used = ok(flourish(s, "sweep", { targets: [s.gob, s.bo] }));
    const kinds = used.events.map((x) => x.type);
    assert.deepEqual(kinds.filter((k) => !["std", "damage", "effectStart"].includes(k)), [], `only the kinds a feature makes: ${kinds}`);
    assert.deepEqual(viewEvents(used.events, s, PAT).map((x) => x.type), kinds, "both known creatures' damage is sent");
    const flagsAfter = Object.keys(view(s, PAT).encounter.flags);
    assert.deepEqual(flagsAfter.filter((k) => !flagsBefore.includes(k)), [`after:${ID("fan-flourish")}:hero`], "the one mark a use of `after` always makes, and no flag that names the second creature");
    assert.ok(!flagsAfter.some((k) => k.includes(s.bo)), "no flag for the second creature");
    const sent = (v) => Object.keys(v).filter((k) => k !== 'acNow' && k !== 'acWhy').sort(); // sent only while something changes the AC (#674)
    assert.deepEqual(sent(view(s, PAT).entities.hero), sent(view(field({ ...bard(), subclass: "lore", skills: ["performance", "persuasion", "insight", "history", "arcana", "deception"] }), PAT).entities.hero), "the hero is sent the same fields as one of an SRD subclass");
  });
});

// ---------- played ----------
test("a second creature near the first takes the same damage roll, and the first creature's steps after it are for the first alone", () => {
  using(ON, () => {
    const seen = new Set();
    for (let from = 1; from <= 400; from += 61) {
      const s = hitFight(bard(), { from });
      const base = acOf(s, s.entities.hero), dice = pool(s), gob = hpOf(s, s.gob), bo = hpOf(s, s.bo), cy = hpOf(s, s.cy);
      const r = ok(flourish(s, "sweep", { targets: [s.gob, s.bo] }));
      const [d1, d2] = [dealt(r, s.gob), dealt(r, s.bo)];
      assert.equal(d1.length, 1); assert.equal(d2.length, 1);
      assert.equal(d1[0].amount, d2[0].amount, `from seed ${from}: one roll, shared`);
      assert.deepEqual(d1[0].dice, d2[0].dice, "the very dice");
      assert.equal(d1[0].dice.length, 1); assert.equal(d1[0].dice[0].sides, 8);
      assert.equal(gob - hpOf(s, s.gob), d1[0].amount); assert.equal(bo - hpOf(s, s.bo), d1[0].amount);
      assert.equal(hpOf(s, s.cy), cy, "a creature that was not named is untouched");
      // the modifier is put once, with the number rolled: not once for each creature
      assert.equal(acOf(s, s.entities.hero) - base, d1[0].amount, "the Armor Class goes up by the number rolled, once");
      assert.equal(s.effects.filter((x) => x.name === "Fan flourish").length, 1);
      assert.equal(pool(s), dice - 1, "one die for both creatures");
      assert.ok(r.events.indexOf(d1[0]) < r.events.indexOf(d2[0]), "the first creature first");
      seen.add(d1[0].amount);
    }
    assert.ok(seen.size > 1, "the number differs from one roll to another");
  });
});

test("Slash: no second creature named is as before; the second need not be in reach, nor hit; the first creature is the one the hit is checked on", () => {
  using(ON, () => {
    const s = hitFight();
    // Bo stands 10 feet from the hero: out of the 5 feet the action reaches, and never hit; it is Gob's neighbour
    assert.ok(!s.encounter.flags[`whit:hero:${s.bo}`] && s.encounter.flags[`whit:hero:${s.gob}`]);
    const bo = hpOf(s, s.bo);
    const alone = ok(flourish(s, "slash"));
    assert.equal(dealt(alone, s.bo).length, 0); assert.equal(hpOf(s, s.bo), bo, "near is optional: named by the holder or not at all");
    assert.equal(dealt(alone, s.gob).length, 1);
    const t = hitFight();
    const r = ok(flourish(t, "slash", { targets: [t.gob, t.bo] }));
    assert.equal(dealt(r, t.bo).length, 1);
    assert.equal(acOf(t, t.entities.hero), t.entities.hero.ac, "Slash has no Armor Class step");
  });
});

test("`target` alone (the creature as before) and `targets` of one are the first creature only; the first of two is the target", () => {
  using(ON, () => {
    const s = hitFight();
    const r = ok(use(s, "fan-flourish", { mode: "slash", target: undefined, targets: [s.gob] }));
    assert.equal(dealt(r, s.gob).length, 1);
    const t = hitFight();
    const q = ok(apply(t, { type: "feature", actor: "hero", feature: ID("fan-flourish"), mode: "slash", targets: [t.gob, t.bo] }, PAT));
    assert.equal(dealt(q, t.gob).length, 1); assert.equal(dealt(q, t.bo).length, 1);
  });
});

test("the second creature's checks are all before anything is paid, each with a sentence, and nothing changes", () => {
  using(ON, () => {
    const s = hitFight();
    const refuse = (more, re, label) => { const before = json(s); no(flourish(s, "slash", more), re); assert.equal(json(s), before, `${label}: nothing changed`); };
    refuse({ targets: [s.gob, s.cy] }, /Cy is more than 5 ft from Gob\./, "15 feet from the first");
    refuse({ targets: [s.gob, s.gob] }, /can't target the same creature twice/, "the first again");
    refuse({ targets: [s.gob, "hero"] }, /needs a second creature other than Zaa/, "the holder");
    refuse({ targets: [s.gob, s.bo, s.cy] }, /reaches a creature and one more within 5 ft of it/, "three");
    refuse({ targets: [s.gob, "nobody"] }, /No such creature/, "nobody");
    refuse({ targets: [s.gob, 7] }, /No such creature/, "not an id");
    // a mode that has no near: two creatures are more than its one target
    { const before = json(s); no(flourish(s, "guard", { targets: [s.gob, s.bo] }), /has one target/); assert.equal(json(s), before); }
    // no mode named: the DM is handed it, and a second creature cannot be named
    { const before = json(s); no(use(s, "fan-flourish", { targets: [s.gob, s.bo] }), /Choose what Fan flourish does before naming a second creature: Slash, Guard, Sweep, Master, Heavy, Reserve\./); assert.equal(json(s), before); }
    // a dead creature
    s.entities[s.bo].dead = true; s.entities[s.bo].hp = 0;
    refuse({ targets: [s.gob, s.bo] }, /Bo is dead/, "a dead creature");
    // the pool is empty: the same refusal as ever
    s.entities.hero.uses["bardic-inspiration"] = 0;
    refuse({ targets: [s.gob, s.cy] }, /Cy is more than 5 ft|has no uses of Bardic Inspiration left/, "no die and too far");
    s.entities[s.bo].dead = false; s.entities[s.bo].hp = 300;
    refuse({ targets: [s.gob, s.bo] }, /has no uses of Bardic Inspiration left/, "no die");
  });
});

test("a creature outside the battle cannot be the second creature", () => {
  using(ON, () => {
    const s = hitFight();
    const late = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 1 }, name: "Late" }, DM)).events[0].id;
    // however it came to be outside the battle (the DM's tools put it there), it is not a target
    s.encounter.order = s.encounter.order.filter((o) => o.id !== late);
    const before = json(s);
    no(flourish(s, "slash", { targets: [s.gob, late] }), /Late is outside the battle/);
    assert.equal(json(s), before);
  });
});

test("a creature the party is not told of is, to a player, no creature at all; the DM may name it, and its damage is not sent to players", () => {
  using(ON, () => {
    const s = hitFight();
    const lurker = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 1 }, name: "Lurker", hidden: true }, DM)).events[0].id;
    Object.assign(s.entities[lurker], { hp: 300, maxHp: 300, ac: 1, hidden: true });
    assert.equal(view(s, PAT).entities[lurker], undefined, "unknown to the party");
    const before = json(s);
    const a = no(flourish(s, "slash", { targets: [s.gob, lurker] })), b = no(flourish(s, "slash", { targets: [s.gob, "nobody"] }));
    assert.equal(a.error, b.error, "a hidden creature gets the very answer a creature that is not there gets");
    assert.equal(a.error, "No such creature.");
    assert.equal(json(s), before);
    const r = ok(flourish(s, "slash", { targets: [s.gob, lurker] }, DM));
    assert.equal(dealt(r, lurker).length, 1, "the DM may");
    assert.ok(!json(viewEvents(r.events, s, PAT)).includes(`"${lurker}"`), "the players are not sent a word of the hidden creature's damage");
    assert.ok(!json(view(s, PAT)).includes(`"${lurker}"`) && !json(view(s, PAT)).includes(`:${lurker}`));
  });
});

test("Resistance is each creature's own: the roll is shared, the damage taken is not", () => {
  using(ON, () => {
    const s = hitFight(bard(), { tweak: (t) => { t.entities[t.bo].resist = ["slashing"]; } });
    const base = acOf(s, s.entities.hero);
    const r = ok(flourish(s, "sweep", { targets: [s.gob, s.bo] }));
    const [g, b] = [dealt(r, s.gob)[0], dealt(r, s.bo)[0]];
    assert.deepEqual(g.dice, b.dice, "one roll");
    assert.equal(b.amount, Math.floor(g.amount / 2), "half to the one that resists");
    assert.equal(acOf(s, s.entities.hero) - base, g.amount, "and the number added is the number rolled, whole");
  });
});

test("Master: no price at all, even with the pool empty; its own die, the second creature, the same roll", () => {
  using(ON, () => {
    const s = hitFight();
    s.entities.hero.uses["bardic-inspiration"] = 0;
    const r = ok(flourish(s, "master", { targets: [s.gob, s.bo] }));
    assert.equal(pool(s), 0);
    const [g, b] = [dealt(r, s.gob)[0], dealt(r, s.bo)[0]];
    assert.equal(g.dice.length, 1); assert.equal(g.dice[0].sides, 6, "the d6 of the mode, not the Bardic die");
    assert.deepEqual(g.dice, b.dice); assert.equal(g.amount, b.amount);
    // the other modes of the same action still cost a die, and are refused with none
    const t = hitFight();
    t.entities.hero.uses["bardic-inspiration"] = 0;
    const before = json(t);
    no(flourish(t, "slash"), /has no uses of Bardic Inspiration left/); assert.equal(json(t), before);
    // and it is still once a turn, still after a weapon hit
    no(flourish(s, "master"), /has already used Fan flourish this turn/);
    const u = field(); fight(u); turnOf(u, "hero");
    no(flourish(u, "master"), /has not hit Gob with a weapon this turn/);
  });
});

test("Heavy: two dice from the pool, and refused with one left; Reserve: a pool of its own, the Bardic dice untouched", () => {
  using(ON, () => {
    const s = hitFight();
    const dice = pool(s);
    ok(flourish(s, "heavy"));
    assert.equal(pool(s), dice - 2, "two uses of the pool named by the mode, not one of the action's");
    const t = hitFight();
    t.entities.hero.uses["bardic-inspiration"] = 1;
    const before = json(t);
    no(flourish(t, "heavy"), /has no uses of Bardic Inspiration left/);
    assert.equal(json(t), before, "nothing paid, the hit still counts");
    ok(flourish(t, "slash"), "one die is enough for another mode");
    const u = hitFight();
    const dd = pool(u), reserve = () => u.entities.hero.uses[RESERVE];
    assert.equal(reserve(), 2);
    ok(flourish(u, "reserve"));
    assert.equal(reserve(), 1); assert.equal(pool(u), dd, "the Bardic dice are untouched");
    const v = hitFight();
    v.entities.hero.uses[RESERVE] = 0;
    const b2 = json(v);
    no(flourish(v, "reserve"), /has no uses of Fan reserve left/);
    assert.equal(json(v), b2);
  });
});

test("an action with `near` on the action itself: any mode or none, 10 feet; the rest of the steps are the first creature's alone", () => {
  using(ON, () => {
    const s = hitFight();
    s.entities[s.cy].pos = { q: 3, r: 0, z: 0 };            // 10 feet from Gob, 15 from the hero
    const dice = pool(s), r = ok(use(s, "fan-sweep", { targets: [s.gob, s.cy] }));
    assert.equal(dealt(r, s.cy).length, 1); assert.equal(dealt(r, s.gob)[0].amount, dealt(r, s.cy)[0].amount);
    assert.ok(s.entities[s.gob].cond.prone, "the first creature is knocked Prone");
    assert.ok(!s.entities[s.cy].cond.prone, "the second creature is not: only the damage is its");
    assert.equal(pool(s), dice - 1);
    // 15 feet is past 10
    const t = hitFight();
    const before = json(t);
    no(use(t, "fan-sweep", { targets: [t.gob, t.cy] }), /Cy is more than 10 ft from Gob/);
    assert.equal(json(t), before);
  });
});

test("the same game replays: the same actions on the same seed give the same state", () => {
  using(ON, () => {
    const run = () => {
      const s = hitFight();
      ok(flourish(s, "sweep", { targets: [s.gob, s.bo] }));
      return json(s);
    };
    assert.equal(run(), run());
  });
});

test("the overlay away: the hero's record loses the feature on `refresh`, and a game with no pack plays as it did", () => {
  using(ON, () => { const s = hitFight(); assert.ok(flourish(s, "slash", { targets: [s.gob, s.bo] }).ok); });
  using(OFF, () => {
    const t = hitFight(bard(3, { subclass: "lore", skills: ["performance", "persuasion", "insight", "history", "arcana", "deception"] }));
    no(use(t, "fan-flourish", { mode: "slash" }), /no such feature/);
  });
});

// ---------- data that skipped the gate ----------
test("data that skipped the gate is refused before anything is paid, with a sentence", () => {
  using(ON, () => {
    const act = (s, f = "fan-flourish") => s.entities.hero.feats.find((x) => x.id === ID(f)).action;
    const trial = (change, re, label, more = { mode: "slash", targets: undefined }, f = "fan-flourish") => {
      const s = hitFight();
      change(act(s, f), s);
      const before = json(s);
      const r = no(use(s, f, more.mode === undefined ? { targets: [s.gob, s.bo] } : { mode: more.mode, targets: [s.gob, s.bo] }), re);
      assert.doesNotMatch(r.error, /Cannot read|undefined is not/);
      assert.equal(json(s), before, `${label}: nothing paid`);
    };
    trial((a) => { a.modes[0].effects = [{ condition: "prone" }, STEP]; }, /its data is wrong \(a second target near the first takes the damage steps the action begins with, and its first step is not a damage step\)/, "the lead is not damage");
    trial((a) => { a.modes[0].effects = [{ ...STEP, when: ["melee"] }]; }, /must have no `when`, `onKill` or `onZero`/, "a when in the lead");
    trial((a) => { a.modes[0].target.near = 7; }, /its data for a second target near the first is wrong/, "near that is not feet");
    trial((a) => { a.target = { creature: { range: [5, 5], count: 2 } }; }, /its data for a second target near the first is wrong/, "several targets and near");
    trial((a) => { a.modes[3].cost = { resource: "bardic-inspiration" }; }, /its Master mode is both free and priced/, "free and priced", { mode: "master" });
    trial((a) => { a.modes[4].cost = { resource: undefined }; }, /the price of its Heavy mode is not a pool and a number of uses/, "a price with no pool", { mode: "heavy" });
    trial((a) => { a.modes[4].cost = { resource: "bardic-inspiration", n: 0 }; }, /the price of its Heavy mode is not a pool and a number of uses/, "a price of no uses", { mode: "heavy" });
    trial((a) => { a.orSlot = true; }, /its Master mode has a price of its own \(or none\), and the action also has orCost or orSlot/, "orSlot", { mode: "master" });
    trial((a) => { a.orCost = { resource: "bardic-inspiration", n: 1 }; }, /its Heavy mode has a price of its own/, "orCost", { mode: "heavy" });
  });
});

// ---------- `rolled` with several targets (the refusal F left until G) ----------
test("`{ rolled: true }`: a second creature near the first shares the one roll and is allowed; several creatures by `count` or an area are still refused, with the reason", () => {
  // allowed with near, on the action or on a mode (the pack above loads, with Sweep)
  assert.equal(one(acts({ target: { ...aim, near: 5 }, effects: [STEP, AC] })), "");
  // several targets by `count`: the modifier would be put once for each
  assert.match(one(acts({ target: { creature: { range: [5, 5], count: 2 } }, effects: [STEP, AC] })), /is for an action with one target: several creatures would each roll their own number, and the modifier would be put once for each \(a second creature near the first, `near`, shares the one roll/);
  assert.match(one(acts({ after: undefined, target: { area: { shape: "sphere", size: 10, range: 30 } }, effects: [STEP, AC] })), /is for an action with one target/);
  // the engine, from a record that reaches two creatures by `count`, as before
  using(ON, () => {
    const s = hitFight();
    const f = s.entities.hero.feats.find((x) => x.id === ID("fan-flourish"));
    f.action.target = { creature: { range: [5, 5], count: 2 } };
    f.action.modes = f.action.modes.filter((m) => m.id === "guard" || m.id === "heavy");
    s.entities[s.bo].pos = { q: 0, r: 1, z: 0 };            // in reach
    s.encounter.flags[`whit:hero:${s.bo}`] = true;
    const before = json(s);
    no(flourish(s, "guard", { targets: [s.gob, s.bo] }), /it reaches 2 creatures, which would each roll their own/);
    assert.equal(json(s), before);
  });
});

// ---------- the review of #532 ----------
// A list inside a list, an object or a number in a field that names creatures: to a player, an id that is nothing, answered the same and changing nothing (the first target too).
test("H1: an id that is not a string, or a list of ids that is not flat, is 'No such creature.' to a player, for the first target and the second, and changes nothing", () => {
  using(ON, () => {
    const s = hitFight();
    const lurker = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 1 }, name: "Lurker", hidden: true }, DM)).events[0].id;
    Object.assign(s.entities[lurker], { hp: 300, maxHp: 300, ac: 1, hidden: true });
    const bad = (x) => [[[x]], { id: x }, 7, [x, [x]], [s.gob, [x]], [s.gob, { id: x }], [s.gob, 7], [s.gob, [x, x]]];
    const before = json(s);
    for (const x of [lurker, s.bo, "nobody"]) for (const v of bad(x)) {
      for (const [label, more] of [["targets", { targets: v }], ["target", { target: v }]]) {
        if (label === "target" && Array.isArray(v) && v.length === 2 && v[0] === s.gob) continue;
        const r = no(flourish(s, "slash", { target: undefined, ...more }), /^No such creature\.$/);
        assert.equal(r.error, "No such creature.", `${label}: ${json(v)}`);
        assert.equal(json(s), before, `${label} ${json(v)}: nothing changed`);
      }
    }
    // the engine's own guard, for whoever is not filtered by the dispatch (the DM): a list inside a list is no creature
    const dm = flourish(s, "slash", { targets: [s.gob, [s.bo]] }, DM);
    no(dm, /No such creature/); assert.equal(json(s), before);
  });
});

test("L1: the second creature may be an ally", () => {
  using(ON, () => {
    const s = hitFight(bard(), { tweak: (t) => { t.entities[t.bo].side = "party"; } });
    const r = ok(flourish(s, "slash", { targets: [s.gob, s.bo] }));
    assert.equal(dealt(r, s.bo).length, 1, "the ally takes it: the feature says another creature, and nothing asks for a foe");
    assert.deepEqual(dealt(r, s.bo)[0].dice, dealt(r, s.gob)[0].dice);
  });
});

test("L2: the engine holds `near` to 5 to 60 feet and to a creature to be the first, as the gate does; L3: a record's `near` is linted", () => {
  using(ON, () => {
    const act = (s) => s.entities.hero.feats.find((x) => x.id === ID("fan-flourish")).action;
    for (const [change, label] of [[(a) => { a.modes[0].target.near = 65; }, "65"], [(a) => { a.modes[0].target.near = 0; }, "0"], [(a) => { a.target = { self: true }; }, "the holder"], [(a) => { a.target = { area: { shape: "sphere", size: 10, range: 30 } }; }, "an area"]]) {
      const s = hitFight();
      change(act(s));
      const before = json(s);
      const r = flourish(s, "slash", { targets: [s.gob, s.bo] });
      no(r); assert.doesNotMatch(r.error, /Cannot read|undefined is not/, label);
      assert.equal(json(s), before, `${label}: nothing paid`);
    }
    const r1 = derive(bard()).record;
    feat(r1, ID("fan-flourish")).action.modes[0].target.near = 65;
    assert.match(lintRecord(r1, { spells: CONTENT.spells }).join("\n"), /near is feet, a multiple of 5, 5 to 60/);
    const r2 = derive(bard()).record;
    feat(r2, ID("fan-flourish")).action.modes[0].effects = [{ condition: "prone" }];
    assert.match(lintRecord(r2, { spells: CONTENT.spells }).join("\n"), /its first step is not a damage step/, "the leading-damage check, on a record");
    const r3 = derive(bard()).record;
    feat(r3, ID("fan-sweep")).action.target = { self: true, near: 10 };
    assert.match(lintRecord(r3, { spells: CONTENT.spells }).join("\n"), /needs a creature to be the first/);
  });
});

test("L4: a critical weapon hit does not double the flourish's dice, on either creature", () => {
  using(ON, () => {
    let crit = null;
    for (let seed = 1; seed < 800 && !crit; seed++) {
      const s = field(bard(), { seed });
      fight(s); turnOf(s, "hero");
      if (swing(s).crit) crit = s;
    }
    assert.ok(crit, "a critical hit was found");
    const r = ok(flourish(crit, "slash", { targets: [crit.gob, crit.bo] }));
    for (const id of [crit.gob, crit.bo]) { const d = dealt(r, id)[0]; assert.equal(d.dice.length, 1, "one die, not two"); assert.equal(d.dice[0].sides, 8); }
  });
});

test("L4: a mode's own pool pays while the action's pool is empty; and the action's pool is not touched", () => {
  using(ON, () => {
    const s = hitFight();
    s.entities.hero.uses["bardic-inspiration"] = 0;
    ok(flourish(s, "reserve"));
    assert.equal(s.entities.hero.uses[RESERVE], 1); assert.equal(pool(s), 0);
  });
});

test("L4: a spell slot cost beside `near`: the slot grows the damage, both creatures take the same grown roll", () => {
  using(ON, () => {
    assert.deepEqual(lintEntry("subclasses", SILVER, { pack: P, srd: CONTENT }), []);
    const s = hitFight();
    const slots = { ...s.entities.hero.slots };
    const r = ok(apply(s, { type: "feature", actor: "hero", feature: ID("fan-burst"), targets: [s.gob, s.bo], slot: 3 }, PAT));
    const [g, b] = [dealt(r, s.gob)[0], dealt(r, s.bo)[0]];
    assert.equal(g.dice.length, 3, "1d8 at level 1, and a d8 more for each level above: 3d8 at level 3");
    assert.deepEqual(g.dice, b.dice); assert.equal(g.amount, b.amount);
    assert.equal(s.entities.hero.slots[3], slots[3] - 1);
    // the second creature still has to be near the first
    const t = hitFight();
    const before = json(t);
    no(apply(t, { type: "feature", actor: "hero", feature: ID("fan-burst"), targets: [t.gob, t.cy] }, PAT), /Cy is more than 5 ft from Gob/);
    assert.equal(json(t), before, "no slot spent");
  });
});
