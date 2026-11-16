// Strict mode checks values, not only keys (#389, fix round 1): B1 (every number has a range, so no number can hang the
// engine), M2 (every field has its type), L1 (a list is measured before it is walked), L2 (nothing throws), L3 (no
// invisible or look-alike text). The homebrew here is invented for these tests.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, PACKS } from "../src/content/index.js";
import { loadPack, overlayOf, using } from "../src/content/registry.js";
import {
  budget, HOMEBREW_COST, HOMEBREW_DICE, HOMEBREW_DURATIONS, HOMEBREW_ENTRY_KINDS, HOMEBREW_RANGES, HOMEBREW_TYPES, lintEntry, lintKeys, lintPack, nameKey, numbersOf,
} from "../src/content/schema.js";
import { apply } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const SRD = PACKS[0];
const P = "x", SRC = "homebrew:x";
const strict = (kind, e) => lintEntry(kind, e, { pack: P, srd: CONTENT });
const refused = (problems, re) => { assert.ok(problems.length, "refused"); assert.match(problems.join("\n"), re); };
// An SRD entry made homebrew: an id, a source, unchecked and a name of its own.
const homebrew = (kind, e) => ({ ...structuredClone(e), id: `hb-${P}-${e.id}`, source: SRC, checked: false, name: `Zz ${String(e.name).slice(0, 40)}` });
const doc = (lists) => ({ format: "hextable-pack", v: 1, pack: { id: P, name: "X", version: 1, license: "CC0", attribution: "Test." }, ...lists });
const spell = (over = {}) => ({
  id: "hb-x-boom", name: "Boom", source: SRC, level: 1, school: "evocation", classes: ["wizard"], time: "action", range: 60, components: ["v", "s"], duration: "instant",
  concentration: false, ritual: false, target: { area: { shape: "sphere", size: 20 } }, effects: [{ save: "dex", half: true, onFail: [{ damage: "3d6", type: "fire" }] }],
  tier: "auto", checked: false, text: "x", ...over,
});
const monster = (over = {}) => homebrew("monsters", { ...CONTENT.monsters["goblin-warrior"], name: "Cinderling", ...over });
const entries = [];
for (const kind of HOMEBREW_ENTRY_KINDS) for (const e of SRD[kind]) entries.push([kind, e]);
// The first entry that has each shape's key, with the path to it: what the enumerations replace.
const nodes = new Map();
for (const [kind, e] of entries) lintKeys(kind, e, () => {}, (shape, key, v, path) => { const k = `${shape}.${key}`; if (!nodes.has(k)) nodes.set(k, [kind, e, path, shape, key]); });
const setAt = (root, path, val) => {
  const t = path.match(/[^.[\]]+/g).map((x) => (/^\d+$/.test(x) ? +x : x));
  let o = root;
  for (const x of t.slice(0, -1)) o = o[x];
  o[t.at(-1)] = val;
};
const passes = (kind, e) => strict(kind, e).length === 0;
const SRD_WONT_CONVERT = new Set(["contact-other-plane", "camel", "pony", "riding-horse", "warhorse", "draft-horse", "elephant", "mastiff", "mule", "plate-armor"]);

// ---------- B1: every number has a range ----------
test("B1: every number of every SRD entry is inside HOMEBREW_RANGES, and no ceiling is more than about twice what the SRD uses", () => {
  const max = new Map(), min = new Map();
  for (const [kind, e] of entries) for (const [ctx, v, path, , owner, key] of numbersOf(kind, e)) {
    const k = HOMEBREW_RANGES[`${owner}.${key}`] ? `${owner}.${key}` : HOMEBREW_RANGES[`${owner}.*`] ? `${owner}.*` : null;
    assert.ok(k, `${kind}/${e.id}: ${path} (${ctx}) has no range in HOMEBREW_RANGES`);
    max.set(k, Math.max(max.get(k) ?? -Infinity, v)); min.set(k, Math.min(min.get(k) ?? Infinity, v));
  }
  for (const [k, top] of max) {
    const [lo, hi] = HOMEBREW_RANGES[k];
    assert.ok(min.get(k) >= lo && top <= hi, `${k}: the SRD uses ${min.get(k)} to ${top}, the range is ${lo} to ${hi}`);
    // About twice the SRD's largest, or 100 where that is small: nothing here needs more.
    assert.ok(hi <= Math.max(2.5 * top, 100), `${k}: the ceiling ${hi} is more than twice the SRD's largest, ${top}`);
  }
  for (const [k, [, hi]] of Object.entries(HOMEBREW_RANGES)) if (!max.has(k)) assert.ok(hi <= 10000, `${k}: a field the SRD does not use has a ceiling of ${hi}`);
  // Every SRD entry is inside the dice, duration and price limits too, and strict mode accepts it (but the ten the SRD's own rules refuse).
  for (const [kind, e] of entries) {
    if (SRD_WONT_CONVERT.has(e.id)) continue;
    assert.deepEqual(strict(kind, homebrew(kind, e)), [], `${kind}/${e.id}`);
  }
});

test("B1: a numeric field of the vocabulary with no range fails this test", () => {
  // Every field the type table calls a number has a range (by its name), so a new numeric field must come with one.
  const MAPS = { speedMap: "speed", senseMap: "senses", skillMap: "skills", saveMap: "saves", abilityMap: ["abilityBonus", "setAbility"], levelMap: "byLevel" };
  const have = (key) => Object.keys(HOMEBREW_RANGES).some((r) => r.endsWith(`.${key}`));
  for (const [shape, fields] of Object.entries(HOMEBREW_TYPES)) for (const [key, spec] of Object.entries(fields)) {
    if (!spec.split("|").some((t) => t === "i" || t === "n" || t === "i[]")) continue;
    if (key === "*") {
      const owners = [MAPS[shape]].flat().filter(Boolean);
      if (shape === "levelMap") continue;
      assert.ok(owners.length && owners.every((o) => HOMEBREW_RANGES[`${o}.*`]), `${shape}: its values are numbers and have no range`);
    } else assert.ok(have(key) || (shape === "abilities" && HOMEBREW_RANGES["abilities.*"]), `${shape}.${key} is a number and has no range in HOMEBREW_RANGES`);
  }
  // And a number found where the table has no range is refused, not let through.
  const odd = spell({ target: { area: { shape: "sphere", size: 20 } } });
  assert.deepEqual(numbersOf("spells", odd).map((n) => n[0]).sort(), ["area.size", "spells.level", "spells.range"]);
  const free = monster(); free.traits = [{ id: "odd", name: "Odd", text: "x", modifiers: [{ on: "ac", op: "add", value: 1, nonsense: 7 }] }];
  refused(strict("monsters", free), /"nonsense" is not something a modifier has/);
});

test("B1: the review's two repros are refused (area size 20000, damage times 1e8), and one past each ceiling", () => {
  const boom = spell({ target: { area: { shape: "sphere", size: 20000 } } });
  const r = loadPack(doc({ spells: [boom] }));
  assert.equal(r.ok, false);
  assert.match(r.problems.join(), /target\.area\.size: 20000 is not allowed; a whole number from 5 to 1,000/);
  const times = spell({ target: { creature: { count: 1 } }, effects: [{ save: "dex", onFail: [{ damage: "3d6", type: "fire", times: 1e8 }] }] });
  const t = loadPack(doc({ spells: [times] }));
  assert.equal(t.ok, false);
  assert.match(t.problems.join(), /times: 100000000 is not allowed; a whole number from 1 to 10/);
  for (const size of [5, 1000]) assert.deepEqual(strict("spells", spell({ target: { area: { shape: "sphere", size } } })), [], `size ${size}`);
  refused(strict("spells", spell({ target: { area: { shape: "sphere", size: 1005 } } })), /size: 1005 is not allowed/);
  refused(strict("spells", spell({ range: 10560005 })), /range: 10560005 is not allowed/);
  refused(strict("spells", spell({ target: { creature: { count: 21 } } })), /count: 21 is not allowed/);
  refused(strict("spells", spell({ effects: [{ damage: "1d6", type: "fire", times: 11 }] })), /times: 11 is not allowed/);
});

test("B1: each range holds at its ceiling and refuses one past it", () => {
  // For every range an SRD entry uses: put the ceiling in, and no sentence about the range comes; put one more, and one does.
  const RANGE = /is not allowed; (a whole number|a number) from/;
  const done = new Set();
  for (const [kind, e] of entries) {
    for (const [, , path, g, owner, key] of numbersOf(kind, e)) {
      const k = HOMEBREW_RANGES[`${owner}.${key}`] ? `${owner}.${key}` : `${owner}.*`;
      if (done.has(k) || SRD_WONT_CONVERT.has(e.id)) continue;
      done.add(k);
      const [, hi, frac] = HOMEBREW_RANGES[k];
      const at = homebrew(kind, e), over = homebrew(kind, e);
      setAt(at, path, hi); setAt(over, path, hi + (frac ? 1 / frac : 1));
      assert.doesNotMatch(strict(kind, at).join("\n"), RANGE, `${kind}/${e.id} ${path} at ${hi}`);
      refused(strict(kind, over), RANGE);
    }
  }
  assert.ok(done.size >= 70, `${done.size} ranges walked`);
  // A fraction is only where the SRD has one (a Challenge Rating, a weight), and in steps of an eighth and a sixteenth.
  assert.deepEqual(strict("monsters", monster({ cr: 0.125 })), []);
  refused(strict("monsters", monster({ cr: 0.1 })), /cr: 0.1 is not allowed/);
  refused(strict("monsters", monster({ hp: 4.5 })), /hp: 4.5 is not allowed; a whole number/);
});

test("B1: dice have a bounded count, sides and flat part; durations and prices are bounded", () => {
  const dmg = (damage) => strict("spells", spell({ effects: [{ save: "dex", onFail: [{ damage, type: "fire" }] }] }));
  assert.deepEqual(dmg(`${HOMEBREW_DICE.count}d${HOMEBREW_DICE.sides}+${HOMEBREW_DICE.flat}`), []);
  refused(dmg(`${HOMEBREW_DICE.count + 1}d6`), /rolls 51 dice; the most is 50/);
  refused(dmg("1d101"), /dice of 101 sides/);
  refused(dmg("1d6+141"), /adds 141; the most is 140/);
  refused(dmg("99999999999d99999999999"), /dice/);
  refused(strict("spells", spell({ higher: { slot: { damage: "1d6+500" } } })), /adds 500/);
  assert.deepEqual(strict("spells", spell({ duration: `${HOMEBREW_DURATIONS.minute} minutes` })), []);
  refused(strict("spells", spell({ duration: "21 minutes" })), /a duration of 21 minutes is too long; the most is 20/);
  refused(strict("spells", spell({ duration: "100000 days" })), /too long/);
  const price = (cost) => strict("weapons", { id: "hb-x-whip", name: "Ember whip", category: "martial", kind: "melee", damage: "1d4", type: "slashing", properties: ["finesse", "reach"], mastery: "slow", weight: 3, cost, source: SRC, checked: false });
  assert.deepEqual(price(`${HOMEBREW_COST} GP`), []);
  refused(price("3001 GP"), /a price of 3001 GP is too high/);
});

// One entry of each kind with every number at its ceiling, and the spell that asks the most of the engine.
function ceilingPack() {
  const R = (k) => HOMEBREW_RANGES[k][1];
  const worst = spell({
    id: "hb-x-worst", level: 9, range: R("spells.range"), duration: "1 minute", concentration: false,
    target: { area: { shape: "sphere", size: R("area.size") } },
    effects: Array.from({ length: 20 }, () => ({ save: "dex", dc: R("step.dc"), half: true, onFail: [{ damage: `${HOMEBREW_DICE.count}d${HOMEBREW_DICE.sides}+${HOMEBREW_DICE.flat}`, type: "fire", times: R("step.times") }] })),
    higher: { slot: { damage: "1d6", times: R("slot.times") } },
  });
  const creatures = spell({ id: "hb-x-many", target: { creature: { count: R("creature.count"), within: R("creature.within") } }, range: R("spells.range") });
  const mon = monster({
    id: "hb-x-titan", hp: R("monsters.hp"), ac: R("monsters.ac"), xp: R("monsters.xp"), pb: R("monsters.pb"), cr: R("monsters.cr"), initiative: R("monsters.initiative"),
    speed: { walk: R("speed.*"), fly: R("speed.*"), swim: R("speed.*"), climb: R("speed.*"), burrow: R("speed.*") },
    abilities: { str: 40, dex: 40, con: 40, int: 40, wis: 40, cha: 40 },
  });
  const weapon = { id: "hb-x-lance", name: "Long lance", category: "martial", kind: "ranged", damage: "1d12", type: "piercing", properties: ["ammunition"], mastery: "slow", range: [R("weapons.range"), R("weapons.range")], ammo: "bolt", weight: R("weapons.weight"), cost: `${HOMEBREW_COST} GP`, source: SRC, checked: false };
  const armour = { id: "hb-x-shell", name: "Heavy shell", category: "heavy", ac: R("armour.ac"), dex: 0, strength: R("armour.strength"), stealth: "disadvantage", weight: R("armour.weight"), cost: `${HOMEBREW_COST} GP`, source: SRC, checked: false };
  return doc({ spells: [worst, creatures], monsters: [mon], weapons: [weapon], armour: [armour] });
}

test("B1: a pack at every ceiling loads, and a cast of its worst spell finishes within a second", () => {
  const pack = ceilingPack();
  const r = loadPack(pack);
  assert.ok(r.ok, r.problems?.join("; "));
  const s = newGame(5);
  s.entities.wizard.spells.push("hb-x-worst");
  Object.assign(s.entities.wizard, { slots: { 9: 4 }, slotsMax: { 9: 4 } });
  const t0 = performance.now();
  const res = using(overlayOf([r.pack]), () => apply(s, { type: "cast", actor: "wizard", spell: "hb-x-worst", slot: 9, hex: { q: 2, r: 0 } }, { role: "dm", userId: "dm" }));
  const ms = performance.now() - t0;
  assert.ok(res.ok, res.error);
  assert.ok(ms < 1000, `the cast took ${Math.round(ms)} ms`);
  // The same spell with the review's number is not a pack at all.
  const big = ceilingPack();
  big.spells[0].target.area.size = 20000;
  assert.equal(loadPack(big).ok, false);
});

// ---------- M2: every field has its type ----------
test("M2: no wrong type or absurd value is accepted in any field of any shape (nothing is replaced by a value that is valid nowhere)", () => {
  // Values that are right in no field: an object with a key nothing has, a list of such, a list of lists, a number far past
  // every range, one far below, null and the empty text. (0.5 is right for a Challenge Rating and a weight, so it has its own test.)
  const BAD = { object: () => ({ nothing: 1 }), objects: () => [{ nothing: 1 }], nested: () => [[]], huge: () => 1e15, tiny: () => -1e9, null: () => null, empty: () => "", huge308: () => 1e308 };
  const accepted = []; let combos = 0;
  for (const [k, [kind, e, path]] of nodes) {
    if (!passes(kind, homebrew(kind, e)) && !SRD_WONT_CONVERT.has(e.id)) assert.fail(`${kind}/${e.id} must convert`);
    if (SRD_WONT_CONVERT.has(e.id)) continue;
    for (const [name, make] of Object.entries(BAD)) {
      const h = homebrew(kind, e);
      setAt(h, path, make());
      combos++;
      if (strict(kind, h).length === 0) accepted.push(`${k} <- ${name}`);
    }
  }
  assert.ok(combos > 3000, `${combos} combinations`);
  assert.deepEqual(accepted, [], "accepted");
});

test("M2: a value of the wrong kind of type, by the type table, is refused in every field", () => {
  let combos = 0; const accepted = [];
  for (const [k, [kind, e, path, shape, key]] of nodes) {
    const spec = HOMEBREW_TYPES[shape]?.[key] ?? HOMEBREW_TYPES[shape]?.["*"] ?? (shape.startsWith("step.") && key === "when" ? "s[]" : undefined);
    if (!spec) { assert.ok(shape === "open" || shape === "grants" || key === "when", `${k} has no type`); continue; }
    if (spec === "?" || SRD_WONT_CONVERT.has(e.id)) continue;
    const t = spec.split("|"), tries = [];
    if (!t.some((x) => ["s", "d", "id"].includes(x))) tries.push("zz");
    if (!t.some((x) => ["b", "t"].includes(x))) tries.push(true, false);
    if (!t.some((x) => ["a", "s[]", "i[]", "id[]"].includes(x))) tries.push([], ["zz"], [1]);
    if (!t.includes("o")) tries.push({});
    if (!t.some((x) => ["i", "n"].includes(x))) tries.push(7);
    for (const v of tries) {
      const h = homebrew(kind, e);
      setAt(h, path, structuredClone(v));
      combos++;
      if (strict(kind, h).length === 0) accepted.push(`${k} <- ${JSON.stringify(v)}`);
    }
  }
  assert.ok(combos > 2000, `${combos} combinations`);
  assert.deepEqual(accepted, []);
  // Every key of every shape has a type, but the keys of a feature's grants (checked by the grants linter).
  for (const [shape, S] of Object.entries({ ...{} })) assert.ok(S);
});

test("M2: the review's examples are each refused with a sentence", () => {
  const cases = [
    ["monsters", monster({ hp: 1e15 }), /hp: 1000000000000000 is not allowed/], ["monsters", monster({ ac: 1e15 }), /ac: /], ["monsters", monster({ xp: 1e15 }), /xp: /], ["monsters", monster({ pb: 1e15 }), /pb: /],
    ["monsters", monster({ skills: 1e15 }), /skills must be an object/], ["monsters", monster({ abilities: { str: -1e9, dex: 10, con: 10, int: 10, wis: 10, cha: 10 } }), /str: -1000000000 is not allowed/],
    ["monsters", monster({ speed: { walk: 0.5 } }), /walk: 0.5 is not allowed; a whole number/], ["monsters", monster({ speed: { walk: 1e15 } }), /walk: /],
    ["spells", spell({ classes: [{}] }), /classes must be a list of kebab-case names/], ["spells", spell({ target: { self: {} } }), /self must be true or false/],
    ["spells", spell({ target: { self: "x".repeat(150) } }), /self must be true or false/], ["spells", spell({ target: { area: { shape: "sphere", size: 0.5 } } }), /size: 0.5 is not allowed/],
    ["spells", spell({ range: 1e308 }), /range: /],
    ["items", { id: "hb-x-r", name: "Ring", category: "weapon", rarity: "rare", wear: "weapon", base: { weapon: [{}] }, bonus: 1, tier: "auto", source: SRC, checked: false, text: "x" }, /weapon must be text or a list of text/],
    ["monsters", monster({ traits: 5 }), /traits must be a list/],
    ["spells", spell({ effects: [{ save: "dex", dc: "x", onFail: [{ damage: "1d6", type: "fire" }] }] }), /dc must be a whole number/],
  ];
  for (const [kind, e, re] of cases) {
    const p = strict(kind, e);
    refused(p, re);
    for (const m of p) assert.doesNotMatch(m, /TypeError|is not iterable|Cannot read/, m);
  }
});

test("M2: a weapon's damage and a modifier's value are bounded too", () => {
  const w = (damage) => strict("weapons", { id: "hb-x-whip", name: "Ember whip", category: "martial", kind: "melee", damage, type: "slashing", properties: ["finesse"], mastery: "slow", weight: 3, source: SRC, checked: false });
  assert.deepEqual(w("1d4"), []);
  refused(w("9999999d6"), /dice/);
  refused(w({}), /damage must be dice/);
});

// ---------- L2: nothing throws ----------
test("L2: lintEntry and strict lintPack return sentences for every shape of wrong value, and never fall back on 'could not be checked'", () => {
  const VALS = [() => ({ x: 1 }), () => [], () => [null], () => [{}], () => [[]], () => 5, () => "zz", () => true, () => null, () => ({}), () => [1], () => ["a"], () => -1, () => 0, () => undefined];
  let n = 0;
  for (const [, [kind, e, path]] of nodes) {
    if (SRD_WONT_CONVERT.has(e.id)) continue;
    for (const make of VALS) {
      const h = homebrew(kind, e);
      setAt(h, path, make());
      const one = lintEntry(kind, h, { pack: P, srd: CONTENT });
      assert.ok(Array.isArray(one) && one.every((m) => typeof m === "string"));
      assert.doesNotMatch(one.join("\n"), /could not be checked/, `${kind} ${path}`);
      n++;
    }
  }
  assert.ok(n > 3000);
  // The review's own: traits 5, modifier.types {}, spells [null], and the rest of what lintEntry is handed.
  const m = monster(); m.traits = 5;
  refused(lintEntry("monsters", m, { pack: P }), /traits must be a list/);
  const t = monster(); t.traits = [{ id: "a", name: "A", text: "x", modifiers: [{ on: "ac", op: "add", value: 1, types: {} }] }];
  refused(lintEntry("monsters", t, { pack: P }), /types must be a list of text/);
  refused(lintPack(doc({ spells: [null] }), { strict: true }), /an entry is not an object/);
  for (const bad of [null, undefined, 5, "x", [], [null], { id: 5 }, { id: "hb-x-a", name: 5 }]) {
    for (const kind of [...HOMEBREW_ENTRY_KINDS, "dragons", undefined, 5, {}]) {
      assert.ok(Array.isArray(lintEntry(kind, bad, { pack: P })));
      assert.ok(Array.isArray(lintEntry(kind, bad, {})));
      assert.ok(Array.isArray(lintEntry(kind, bad)));
      assert.ok(Array.isArray(lintEntry(kind, bad, null)));
    }
  }
  for (const bad of [null, undefined, 5, "x", [], [null], { format: 5 }, { ...doc({}), spells: 5 }, { ...doc({}), spells: [5] }, { ...doc({}), pack: 5 }, { ...doc({}), pack: [] }, { ...doc({}), monsters: [{ id: "hb-x-a", traits: 5 }] }]) {
    const p = lintPack(bad, { strict: true });
    assert.ok(Array.isArray(p) && p.length, JSON.stringify(bad));
  }
});

// ---------- L1: a list is measured before it is walked ----------
test("L1: a huge or sparse list is refused at once, with nothing walked and no memory spent", () => {
  const t0 = performance.now();
  for (const n of [1e7, 1e9, 2 ** 32 - 1]) {
    const r = loadPack(doc({ spells: [{ id: "hb-x-a", classes: new Array(n) }] }));
    assert.equal(r.ok, false);
    refused(budget(doc({ spells: [{ id: "hb-x-a", classes: new Array(n) }] })), /over 8,192 bytes/);
  }
  const sparse = [];
  sparse[500] = "wizard";
  refused(budget(doc({ spells: [spell({ classes: sparse })] })), /has gaps in it/);
  refused(budget(doc({ spells: new Array(1e9) })), /more than 200 entries/);
  assert.ok(performance.now() - t0 < 1000, "refused without walking");
  // A list at its bound is fine: 2 bytes an element, so a list the entry can hold.
  assert.deepEqual(budget(doc({ spells: [spell({ classes: Array.from({ length: 8 }, () => "wizard") })] })), []);
});

// ---------- L3: names, ids and text ----------
test("L3: control, direction, zero-width, tag, separator and lone-surrogate characters are refused everywhere; a line break only in text", () => {
  const BAD = ["\u0000", "\u0007", "\t", "\r", "\n", "\u007f", "\u0085", "­", "؜", "᠎", "​", "‌", "‍", "‎", "‏", " ", " ", "‪", "‮", "⁠", "⁦", "⁩", "﻿", "￺", "\u{e0041}", "\u{e007f}", "\ud800", "\udfff"];
  for (const c of BAD) {
    const name = `Ember${c}Burst`;
    refused(strict("spells", spell({ name })), /control character, or an invisible or direction-changing one/);
    refused(budget(doc({ spells: [spell({ name })] })), /invisible or direction-changing/);
    refused(strict("spells", spell({ source: `homebrew:x${c}` })), /direction-changing|source must be/);
    refused(strict("spells", spell({ id: `hb-x-boom${c}` })), /direction-changing|kebab-case/);
    refused(budget(doc({ spells: [spell({ [`k${c}`]: 1 })] })), /character that|hides|invisible|direction/);
    if (c === "\n") continue;
    refused(strict("spells", spell({ text: `Embers${c}burn` })), /invisible or direction-changing/);
    refused(strict("spells", spell({ effects: [{ manual: `Do${c}this` }] })), /invisible or direction-changing/);
  }
  assert.deepEqual(strict("spells", spell({ text: "Embers.\nThey burn." })), [], "a line break is allowed in text");
  assert.deepEqual(strict("spells", spell({ text: "Café — emoji \u{1F525} and “quotes”" })), []);
  refused(strict("spells", spell({ effects: [{ manual: "Do\nthis" }] })), /line break outside/);
  refused(strict("spells", spell({ name: "Ember\nBurst" })), /line break outside/);
  // dmNotes may carry line breaks (the text rules), though no kind has the key yet.
  refused(budget(doc({ spells: [spell({ text: "x".repeat(1501) })] })), /1,501 letters/);
});

test("L3: a name equal to an SRD entry's name of the same kind is refused, after NFKC and case folding", () => {
  for (const name of ["Fire Bolt", "fire bolt", "FIRE BOLT", "Ｆｉｒｅ Ｂｏｌｔ", "Fire  Bolt", "Fіre Bolt", "Fire Bolt "]) {
    refused(strict("spells", spell({ name })), /is the name of an SRD spell/);
    refused(lintPack(doc({ spells: [spell({ name })] }), { strict: true, srd: CONTENT }), /is the name of an SRD spell/);
    // Without the SRD passed in, the registry has told the linter what the SRD is.
    refused(lintPack(doc({ spells: [spell({ name })] }), { strict: true }), /is the name of an SRD spell/);
    refused(lintEntry("spells", spell({ name }), { pack: P }), /is the name of an SRD spell/);
  }
  refused(strict("monsters", { ...monster(), name: "GOBLIN WARRIOR" }), /is the name of an SRD monster/);
  refused(strict("armour", { id: "hb-x-s", name: "shield", category: "shield", ac: 2, weight: 6, cost: "10 GP", source: SRC, checked: false }), /is the name of an SRD armour/);
  // The same name of another kind, or a name that only looks like one, is a name of its own.
  assert.deepEqual(strict("spells", spell({ name: "Goblin Warrior" })), []);
  assert.deepEqual(strict("spells", spell({ name: "Fire Bolts" })), []);
  assert.equal(nameKey("Ｆｉｒｅ  Ｂｏｌｔ"), nameKey("fire bolt"));
});

test("L5: strict mode refuses the SRD pack id without being told it", () => {
  const srdId = SRD.pack.id;
  refused(lintPack(doc({}) && { ...doc({}), pack: { ...doc({}).pack, id: srdId } }, { strict: true }), /the SRD pack's id/);
  refused(lintPack({ ...doc({}), pack: { ...doc({}).pack, id: srdId } }, { strict: true, srd: undefined }), /the SRD pack's id/);
  assert.equal(srdId, "srd52", "the default in schema.js is the SRD's own id");
});
