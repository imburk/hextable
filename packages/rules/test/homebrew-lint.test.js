// Homebrew's gate: the budget, strict mode and lintEntry (docs/specs/homebrew.md, Decisions 1, 2 and 6; task B1, #380).
// The homebrew here is invented for these tests, made of existing steps and fields.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, PACKS } from "../src/content/index.js";
import { budget, budgetEntry, budgetTable, HOMEBREW_ENTRY_KINDS, HOMEBREW_LIMITS, lintEntry, lintPack } from "../src/content/schema.js";

const SRD = PACKS[0];
const P = "ember-folk", hb = (name) => `hb-${P}-${name}`, SRC = `homebrew:${P}`;
const bytes = (x) => Buffer.byteLength(JSON.stringify(x));

// One invented entry of each kind a homebrew pack may hold.
const spell = (over = {}) => ({
  id: hb("ember-burst"), name: "Ember Burst", source: SRC, level: 3, school: "evocation", classes: ["wizard"], time: "action", range: 150,
  components: ["v", "s"], duration: "instant", concentration: false, ritual: false, target: { area: { shape: "sphere", size: 20 } },
  effects: [{ save: "dex", half: true, onFail: [{ damage: "8d6", type: "fire" }] }], higher: { slot: { damage: "1d6" } },
  tier: "auto", checked: false, text: "A burst of embers fills a sphere.", ...over,
});
const monster = (over = {}) => ({
  id: hb("cinderling"), name: "Cinderling", source: SRC, size: "small", type: "elemental", cr: 0.25, xp: 50, pb: 2, ac: 13, hp: 9, speed: { walk: 30 },
  abilities: { str: 8, dex: 14, con: 10, int: 6, wis: 10, cha: 8 }, resist: ["fire"], vulnerable: ["cold"], immune: [],
  traits: [{ id: "glow", name: "Glow", text: "It sheds a faint light.", modifiers: [] }],
  actions: [{ id: "scorch", name: "Scorch", text: "A burning touch.", target: { creature: { reach: 5 } }, effects: [{ attack: "melee", kind: "weapon", bonus: 4, onHit: [{ damage: "1d6+2", type: "fire" }] }] }],
  tier: "auto", checked: false, text: "A small spirit of embers.", ...over,
});
const item = (over = {}) => ({ id: hb("ember-ring"), name: "Ember Ring", category: "ring", rarity: "uncommon", wear: "ring", tier: "auto", source: SRC, checked: false,
  text: "Warm to the touch.", grants: { modifiers: [{ on: "ac", op: "add", value: 1 }] }, ...over });
const feat = (over = {}) => ({ id: hb("ember-heart"), name: "Ember Heart", category: "general", tier: "auto", source: SRC, checked: false, text: "You grow hardier.",
  increase: { from: ["con"], points: 1, max: 20 }, ...over });
const object = (over = {}) => ({ id: hb("ember-brazier"), name: "Ember brazier", kind: "thing", source: SRC, tier: "auto", checked: false, text: "A brazier of embers.",
  states: { lit: { name: "lit", blocks: [], light: { bright: 10, dim: 10 } }, out: { name: "out", blocks: [] } }, initial: "lit",
  use: [{ id: "douse", name: "Douse", from: ["lit"], to: "out", time: "action" }], ...over });
const weapon = (over = {}) => ({ id: hb("ember-whip"), name: "Ember whip", category: "martial", kind: "melee", damage: "1d4", type: "fire", properties: ["finesse", "reach"],
  mastery: "slow", weight: 3, cost: "2 GP", source: SRC, checked: false, ...over });
const armour = (over = {}) => ({ id: hb("ember-mail"), name: "Ember mail", category: "medium", ac: 14, dex: 2, weight: 20, cost: "50 GP", source: SRC, checked: false, ...over });
const ENTRY = { spells: spell, monsters: monster, items: item, feats: feat, objects: object, weapons: weapon, armour };
const doc = (lists, head = {}) => ({ format: "hextable-pack", v: 1, pack: { id: P, name: "Ember Folk", version: 1, license: "CC0, by the author", attribution: "Written for a test.", ...head }, ...lists });
const EMBER = doc(Object.fromEntries(HOMEBREW_ENTRY_KINDS.map((k) => [k, [ENTRY[k]()]])));
const strict = (kind, e) => lintEntry(kind, e, { pack: P, srd: CONTENT });
const refused = (problems, re) => { assert.ok(problems.length, "refused"); assert.match(problems.join("\n"), re); };
// A problem is a sentence for the DM: what it is about, then plain words.
const plain = (problems) => { for (const p of problems) assert.match(p, /^[a-z]+(\/[^:]+)?: ["`a-zA-Z]/, p); };

// ---------- the SRD pack ----------
test("lintPack on the SRD pack is unchanged, and the SRD pack passes strict mode's key lists", () => {
  assert.deepEqual(lintPack(SRD), []);
  assert.deepEqual(lintPack(SRD, {}), []);
  assert.deepEqual(lintPack(SRD, { keys: true }), []);
  // Every SRD entry of every homebrew kind, one by one: the key lists cover every key the SRD uses.
  for (const kind of HOMEBREW_ENTRY_KINDS) for (const e of SRD[kind]) assert.deepEqual(lintEntry(kind, e, { strict: false, keys: true }), [], `${kind}/${e.id}`);
  // Not strict, lintEntry is the kind's own linter.
  assert.deepEqual(lintEntry("spells", CONTENT.spells["fire-bolt"], { strict: false }), []);
  assert.match(lintEntry("spells", { ...CONTENT.spells["fire-bolt"], level: 12 }, { strict: false }).join(), /spells\/fire-bolt: level must be 0 to 9/);
  // No SRD id starts with the reserved "hb-" (Decision 1), so a prefixed homebrew id can never be an SRD id.
  for (const [kind, list] of Object.entries(SRD)) if (Array.isArray(list)) for (const e of list) assert.ok(!String(e?.id).startsWith("hb-"), `${kind}/${e?.id}`);
  // Every SRD entry is well inside the budget of one entry (the limits are set so a generous table is never near them).
  for (const kind of HOMEBREW_ENTRY_KINDS) for (const e of SRD[kind]) assert.deepEqual(budgetEntry(kind, e), [], `${kind}/${e.id}`);
});

test("an invented entry of each of the seven kinds passes strict mode, alone and as a pack", () => {
  for (const kind of HOMEBREW_ENTRY_KINDS) assert.deepEqual(strict(kind, ENTRY[kind]()), [], kind);
  assert.deepEqual(budget(EMBER), []);
  assert.deepEqual(lintPack(EMBER, { strict: true, srd: { pack: "srd52", ...CONTENT } }), []);
  // The other kinds are not homebrew.
  assert.match(lintEntry("classes", SRD.classes[0], { pack: P }).join(), /classes cannot be homebrew/);
  refused(lintPack({ ...EMBER, classes: [] }, { strict: true }), /"classes" cannot be homebrew/);
  // Fix round 1 (L2): lintEntry never throws; a missing pack id or an unknown kind is a sentence, as the other refusals are.
  refused(lintEntry("spells", spell()), /ctx\.pack/);
  refused(lintEntry("dragons", {}), /unknown kind/);
});

// ---------- strict mode refusals (the spec's row H1) ----------
test("an extra key anywhere, a function, a prototype key, an SRD id or an id without the pack prefix is refused in a plain sentence", () => {
  const cases = [
    [spell({ glow: true }), /"glow" is not something a spell has/],
    [spell({ effects: [{ save: "dex", half: true, onFail: [{ damage: "8d6", type: "fire", owner: "dm" }] }] }), /effects\[0\]\.onFail\[0\]: "owner" is not something a damage step has/],
    [spell({ target: { area: { shape: "sphere", size: 20, colour: "red" } } }), /target\.area: "colour" is not something an area has/],
    [spell({ effects: [{ save: "dex", onFail: [{ condition: "prone", ends: { on: "turnEnd", later: 1 } }] }] }), /"later" is not something an ending has/],
    [spell({ effects: [{ modifier: { on: "ac", op: "add", value: 1, hidden: true } }], target: { self: true } }), /"hidden" is not something a modifier has/],
    [spell({ effects: [{ save: "dex", bond: { kind: "pet" }, onFail: [{ damage: "1d6", type: "fire" }] }] }), /"bond" is not something a save step has/],
    [spell({ zone: { on: ["enter"], extra: 1 }, duration: "1 minute", concentration: true }), /zone\.extra/],
    [monster({ secret: "x" }), /"secret" is not something a monster has/],
    [monster({ abilities: { str: 8, dex: 14, con: 10, int: 6, wis: 10, cha: 8, luck: 3 } }), /abilities: "luck" is not something ability scores has/],
    [monster({ traits: [{ id: "glow", name: "Glow", text: "x", modifiers: [{ on: "ac", op: "add", value: 1, x: 1 }] }] }), /traits\[0\]\.modifiers\[0\]: "x" is not something a modifier has/],
    [monster({ actions: [{ ...monster().actions[0], owner: "pat" }] }), /actions\[0\]: "owner" is not something an action has/],
    [item({ grants: { modifiers: [{ on: "ac", op: "add", value: 1, sneaky: 1 }] } }), /grants\.modifiers\[0\]: "sneaky" is not something a modifier has/],
    [item({ activate: [{ time: "action", effects: [{ heal: "2d4", extra: 1 }] }] }), /activate\[0\]\.effects\[0\]: "extra" is not something a heal step has/],
    [object({ states: { lit: { name: "lit", blocks: [], shade: 1 }, out: { name: "out", blocks: [] } } }), /states\.lit: "shade" is not something a state has/],
    [object({ use: [{ id: "douse", name: "Douse", from: ["lit"], to: "out", time: "action", check: { ability: "str", dc: 10, roll: 1 } }] }), /use\[0\]\.check: "roll" is not something a check has/],
    [weapon({ hidden: true }), /"hidden" is not something a weapon has/],
    [armour({ hidden: true }), /"hidden" is not something armour has/],
    [feat({ increase: { from: ["con"], points: 1, max: 20, more: 1 } }), /"more" is not something a feat has|increase/],
    [{ ...spell(), cast() {} }, /a function at cast is not data/],
    [JSON.parse(JSON.stringify(spell()).replace('"text"', '"__proto__":{"admin":true},"text"')), /a key "__proto__", which no content may have/],
    [spell({ effects: [{ save: "dex", onFail: [{ damage: "1d6", type: "fire", constructor: 1 }] }] }), /a key "constructor"/],
    [monster({ traits: [{ id: "glow", name: "Glow", text: "x", modifiers: [], prototype: {} }] }), /a key "prototype"/],
    [spell({ id: "fire-bolt" }), /"fire-bolt" is the id of an SRD entry, and homebrew cannot replace it: give it an id that starts "hb-ember-folk-"/],
    [spell({ id: "ember-burst" }), /a homebrew id is "hb-ember-folk-" followed by a kebab-case name/],
    [spell({ id: "hb-frost-kin-ember-burst" }), /hb-ember-folk-/],
    [spell({ checked: true }), /homebrew is not checked against any rulebook: `checked` must be false/],
    [spell({ source: "SRD 5.2.1" }), /its source must be "homebrew:ember-folk"/],
    [monster({ hover: "yes" }), /hover is true or left out/],
  ];
  for (const [e, re] of cases) {
    const kind = Object.keys(ENTRY).find((k) => ENTRY[k]().id === e.id || e.name === ENTRY[k]().name) ?? "spells";
    const problems = strict(kind, e);
    refused(problems, re);
    plain(problems);
    // The same entry in a pack is refused by lintPack in strict mode with the same sentence.
    refused(lintPack(doc({ [kind]: [e] }), { strict: true, srd: CONTENT }), re);
  }
  // A pack header with a key it does not have, a pack claiming the SRD pack's id.
  refused(lintPack(doc({}, { owner: "x" }), { strict: true }), /"owner" is not something a pack has/);
  refused(lintPack(doc({}, { id: "srd52" }), { strict: true, srd: { pack: "srd52" } }), /the SRD pack's id/);
});

test("a control character in any text is refused: text is plain text", () => {
  refused(strict("spells", spell({ text: "Embers\u0007" })), /control character/);
  refused(strict("spells", spell({ name: "Ember‮Burst\u001b[31m" })), /control character/);
  assert.deepEqual(strict("spells", spell({ text: "Embers.\nThey burn." })), [], "a new line is plain text");
});

// ---------- the budget: bounded on hostile input ----------
test("a pack with a 10,000-deep nested onHit is refused in bounded time with no stack overflow", () => {
  let deep = { damage: "1d4", type: "fire" };
  for (let i = 0; i < 10000; i++) deep = { attack: "melee", kind: "spell", onHit: [deep] };
  const bomb = doc({ spells: [spell({ effects: [deep] })] });
  const t0 = performance.now();
  refused(budget(bomb), /steps nest deeper than 6 levels/);
  refused(lintPack(bomb, { strict: true }), /deeper than 6/);
  refused(strict("spells", spell({ effects: [deep] })), /deeper than 6/);
  // Deep nesting that is not steps, a hundred thousand levels: refused at the document's depth.
  let nest = []; for (let i = 0; i < 100000; i++) nest = [nest];
  refused(budget(doc({ spells: [spell({ classes: nest })] })), /nests deeper than 16 levels/);
  let obj = {}; for (let i = 0; i < 100000; i++) obj = { a: obj };
  refused(budget(doc({}, { name: obj })), /nests deeper than 16/);
  // A cycle and a wide list stop at the limits too.
  const loop = spell(); loop.target = { area: loop };
  refused(budget(doc({ spells: [loop] })), /deeper|bytes/);
  refused(budget(doc({ spells: [spell({ classes: new Array(1000000).fill("wizard") })] })), /8,192 bytes/);
  assert.ok(performance.now() - t0 < 5000, "bounded: well under the time a hostile pack could cost");
  // Not data at all.
  refused(budget(doc({ spells: [spell({ when: new Date(0) })] })), /not plain data/);
  refused(budget(doc({ spells: [spell({ level: 10n })] })), /a bigint/);
  refused(budget(doc({ spells: [spell({ level: Infinity })] })), /not one JSON can hold/);
  refused(budget(Object.create({ x: 1 })), /not a pack document/);
  assert.deepEqual(budget([]), ["pack: is not a pack document"]);
});

// ---------- every limit at, and one past, its value ----------
// Pads `e`'s text fields (each up to the text limit) so that `measure()` is exactly `want` bytes.
function padTo(e, fields, want, measure) {
  for (const [obj, key] of fields) obj[key] = "x";
  let need = want - measure();
  for (const [obj, key] of fields) { const n = Math.min(need, HOMEBREW_LIMITS.text - 1); obj[key] += "x".repeat(n); need -= n; }
  assert.equal(measure(), want, "padded exactly");
  return e;
}
test("limits: bytes of one entry (8 KB), at and one past", () => {
  const m = monster({ traits: [1, 2, 3, 4, 5, 6].map((i) => ({ id: `t${i}`, name: "Trait", text: "", modifiers: [] })) });
  const fields = [[m, "text"], ...m.traits.map((t) => [t, "text"])];
  padTo(m, fields, HOMEBREW_LIMITS.entryBytes, () => bytes(m));
  assert.equal(HOMEBREW_LIMITS.entryBytes, 8192);
  assert.deepEqual(budgetEntry("monsters", m), []);
  assert.deepEqual(budget(doc({ monsters: [m] })), []);
  assert.deepEqual(strict("monsters", m), []);
  m.text += "x";
  refused(budgetEntry("monsters", m), /over 8,192 bytes as JSON; the most for one entry is 8,192/);
  refused(budget(doc({ monsters: [m] })), /monsters\/hb-ember-folk-cinderling: it is over 8,192 bytes/);
  // Bytes are UTF-8 bytes of the JSON, so a letter outside ASCII counts for more than one.
  const s = spell({ text: "é".repeat(100) });
  assert.equal(bytes(s), bytes(spell({ text: "" })) + 200);
});

test("limits: the pack document (256 KB), at and one past", () => {
  const n = 160, list = Array.from({ length: n }, (_, i) => spell({ id: hb(`burst-${i}`) }));
  const d = doc({ spells: list });
  padTo(d, list.map((e) => [e, "text"]), HOMEBREW_LIMITS.packBytes, () => bytes(d));
  assert.equal(HOMEBREW_LIMITS.packBytes, 262144);
  assert.deepEqual(budget(d), []);
  list[n - 1].text += "x";
  refused(budget(d), /pack: it is over 262,144 bytes as JSON; the most for a pack is 262,144/);
  refused(lintPack(d, { strict: true }), /over 262,144 bytes/);
});

test("limits: entries in a pack (200), packs on a table (4), at and one past", () => {
  const many = (k) => doc({ weapons: Array.from({ length: k }, (_, i) => weapon({ id: hb(`whip-${i}`) })) });
  assert.deepEqual(budget(many(200)), []);
  assert.deepEqual(lintPack(many(200), { strict: true }), []);
  refused(budget(many(201)), /more than 200 entries/);
  // All kinds together.
  const mixed = doc({ weapons: many(150).weapons, armour: Array.from({ length: 51 }, (_, i) => armour({ id: hb(`mail-${i}`) })) });
  refused(budget(mixed), /more than 200 entries/);
  assert.deepEqual(budgetTable([1, 2, 3, 4]), []);
  refused(budgetTable([1, 2, 3, 4, 5]), /a table may have 4 homebrew packs; this would make 5/);
});

test("limits: letters of a text (1,500), of a name (60), of any other string (200), at and one past", () => {
  const ok = (e) => { assert.deepEqual(budgetEntry("spells", e), []); assert.deepEqual(strict("spells", e), []); };
  ok(spell({ text: "x".repeat(1500) }));
  refused(budgetEntry("spells", spell({ text: "x".repeat(1501) })), /the text at text is 1,501 letters long; the most is 1,500/);
  // Letters, not bytes or UTF-16 units: 1,500 letters outside the basic plane pass.
  ok(spell({ text: "\u{1F525}".repeat(1500) }));
  refused(budgetEntry("spells", spell({ text: "\u{1F525}".repeat(1501) })), /1,501 letters/);
  // A manual step's text is text.
  const manual = (t) => spell({ tier: "manual", effects: [{ manual: t }] });
  ok(manual("y".repeat(1500)));
  refused(budgetEntry("spells", manual("y".repeat(1501))), /effects\[0\]\.manual is 1,501 letters/);
  ok(spell({ name: "N".repeat(60) }));
  refused(budgetEntry("spells", spell({ name: "N".repeat(61) })), /the name at name is 61 letters long; the most is 60/);
  refused(budget(doc({}, { name: "N".repeat(61) })), /pack: the name at pack\.name is 61 letters/);
  assert.deepEqual(budgetEntry("spells", spell({ classes: ["c".repeat(200)] })), []);
  refused(budgetEntry("spells", spell({ classes: ["c".repeat(201)] })), /a piece of text at classes\[0\] is 201 letters long; the most is 200/);
  refused(budgetEntry("spells", spell({ ["k".repeat(201)]: 1 })), /a key is 201 letters long/);
});

test("limits: steps in one entry (40) and depth of nested steps (6), at and one past", () => {
  const flat = (n) => spell({ effects: Array.from({ length: n }, () => ({ damage: "1d4", type: "fire" })) });
  assert.deepEqual(budgetEntry("spells", flat(40)), []);
  // Fix round 2: a list of steps has its own ceiling in strict mode (HOMEBREW_LENGTHS, 20), so the strict half is at 20 and one past.
  const one = (n) => ({ ...flat(n), target: { creature: { count: 1 } } });   // an area spell's steps run once for each creature in it (the work ceiling)
  assert.deepEqual(strict("spells", one(20)), []);
  refused(strict("spells", one(21)), /a list of 21; the most is 20/);
  refused(budgetEntry("spells", flat(41)), /it has 41 effect steps; the most for one entry is 40/);
  // Nested steps count: 20 saves each with one damage step under it is 40.
  const nested = (n) => spell({ effects: Array.from({ length: n }, () => ({ save: "dex", onFail: [{ damage: "1d4", type: "fire" }] })) });
  assert.deepEqual(budgetEntry("spells", nested(20)), []);
  refused(budgetEntry("spells", nested(21)), /42 effect steps/);
  // A monster's steps are all its actions' steps.
  const acts = (n) => monster({ actions: Array.from({ length: n }, (_, i) => ({ ...monster().actions[0], id: `a${i}` })) });
  assert.deepEqual(budgetEntry("monsters", acts(20)), []);
  refused(budgetEntry("monsters", acts(21)), /42 effect steps/);
  const chain = (levels) => { let st = { damage: "1d4", type: "fire" }; for (let i = 1; i < levels; i++) st = { save: "dex", onFail: [st] }; return spell({ effects: [st] }); };
  assert.deepEqual(budgetEntry("spells", chain(6)), []);
  assert.deepEqual(strict("spells", chain(6)), []);
  refused(budgetEntry("spells", chain(7)), /its steps nest deeper than 6 levels/);
});

test("limits: depth of the whole document (16), at and one past", () => {
  // The document is level 1, a kind's list 2, an entry 3: `classes` at 4, then lists inside it.
  const nestTo = (level) => { let v = []; for (let l = level; l > 4; l--) v = [v]; return v; };
  assert.deepEqual(budget(doc({ spells: [spell({ classes: nestTo(16) })] })), []);
  refused(budget(doc({ spells: [spell({ classes: nestTo(17) })] })), /nests deeper than 16 levels/);
  // lintEntry measures an entry as it sits in a pack.
  assert.deepEqual(budgetEntry("spells", spell({ classes: nestTo(16) })), []);
  refused(budgetEntry("spells", spell({ classes: nestTo(17) })), /deeper than 16/);
});

test("a pack over its budget is not linted: only the budget's sentences come back", () => {
  const d = doc({ spells: [spell({ name: "N".repeat(61), level: "three" })] });
  const problems = lintPack(d, { strict: true });
  assert.deepEqual(problems, budget(d));
  assert.doesNotMatch(problems.join(), /level must be/);
  plain(problems);
});

// ---------- the registry's seam (part C of #380) ----------
test("loadPack uses the budget and strict mode: the interim guard is gone", async () => {
  const { loadPack, HOMEBREW_KINDS } = await import("../src/content/registry.js");
  assert.deepEqual(HOMEBREW_KINDS, HOMEBREW_ENTRY_KINDS, "the registry and the linter agree on the kinds");
  const r = loadPack(EMBER);
  assert.ok(r.ok, r.problems?.join("; "));
  assert.deepEqual([...r.pack.ids].sort(), HOMEBREW_ENTRY_KINDS.map((k) => ENTRY[k]().id).sort());
  const no = (d, re) => { const x = loadPack(d); assert.equal(x.ok, false); assert.match(x.problems.join("\n"), re); plain(x.problems); };
  no(doc({ spells: [spell({ glow: true })] }), /"glow" is not something a spell has/);
  no(doc({ spells: [spell({ id: "fire-bolt" })] }), /is the id of an SRD entry/);
  no(doc({ spells: [spell({ source: "SRD 5.2.1" })] }), /its source must be "homebrew:ember-folk"/);
  no(doc({ spells: [spell({ text: "x".repeat(1501) })] }), /1,501 letters/);
  no(doc({ weapons: Array.from({ length: 201 }, (_, i) => weapon({ id: hb(`w-${i}`) })) }), /more than 200 entries/);
  // A depth bomb as JSON text: parsed, then refused by the budget before anything recursive sees it.
  no(`{"format":"hextable-pack","v":1,"pack":{"id":"ember-folk","name":"E","license":"L","attribution":"A"},"spells":[${"[".repeat(50000)}${"]".repeat(50000)}]}`, /nests deeper than 16/);
  no(`{"format":"hextable-pack","v":1,"constructor":{"x":1}}`, /"constructor"/);
});
