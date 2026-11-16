// A feature's `freeCast` keys (#414; docs/specs/companions.md, amendment C9b): forms, types, ends, cost and components.
// Every rule is from reference/srd52/srd52-flow.txt:
//   Pact of the Chain (16619-16631): "You learn the Find Familiar spell and can cast it as a Magic action without expending a
//   spell slot. When you cast the spell, you choose one of the normal forms for your familiar or one of the following special
//   forms: Imp, Pseudodragon, Quasit, Skeleton, Sphinx of Wonder, Sprite, or Venomous Snake."
//   Wild Companion (9205-9211): "As a Magic action, you can expend a spell slot or a use of Wild Shape to cast the Find Familiar
//   spell without Material components. When you cast the spell in this way, the familiar is Fey and disappears when you finish
//   a Long Rest."
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT } from "../src/content/index.js";
import { loadPack, overlayOf, using } from "../src/content/registry.js";
import { lintEntry, lintPack } from "../src/content/schema.js";
import { PACKS } from "../src/content/index.js";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { gridOf } from "../src/grid.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { HOMEBREW_FORM } from "../src/summons.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (s) => JSON.stringify(s);
function refused(s, action, ctx, words) {
  const before = json(s), r = apply(s, action, ctx);
  assert.equal(r.ok, false, `${action.type} should be refused`);
  if (words) assert.match(r.error, words);
  assert.equal(json(s), before, "a refused action changes nothing");
  return r;
}
function spots(s, near, r = 3, monster = "wolf") {
  const G = gridOf(s.map), out = [];
  for (const h of G.range(near, r)) if (apply(structuredClone(s), { type: "spawn", monster, at: h }, DM).ok) out.push(h);
  return out;
}
const FORMS = ["imp", "pseudodragon", "quasit", "skeleton", "sphinx-of-wonder", "sprite", "venomous-snake"];

// ---------- the linter: shapes of a freeCast, as a feat's grants (the kind's own linter) and as a homebrew entry (strict) ----------
const feat = (freeCast) => ({ id: "hb-t-f", name: "F", category: "general", tier: "assist", source: "homebrew:t", checked: false, text: "t", grants: { spells: ["find-familiar"], freeCast } });
const lint = (freeCast) => lintEntry("feats", feat(freeCast), { strict: false });
const lintStrict = (freeCast) => lintEntry("feats", feat(freeCast), { pack: "t", srd: CONTENT });
const BASE = { spells: ["find-familiar"], atWill: true, time: "action" };

test("freeCast forms: a list of 1 to 20 pack monster ids, no repeats, only on a freeCast of named spells", () => {
  assert.deepEqual(lint({ ...BASE, forms: FORMS }), []);
  assert.deepEqual(lint({ ...BASE, forms: ["imp"] }), []);
  for (const bad of [[], "imp", ["Imp"], ["imp", "imp"], [1], null, {}, Array.from({ length: 21 }, (_, i) => `m${i}`), [""]])
    assert.ok(lint({ ...BASE, forms: bad }).length > 0, `refused: ${json(bad)}`);
  assert.ok(lint({ list: "wizard", maxLevel: 1, forms: ["imp"] }).length > 0, "not on a { list, maxLevel }");
  assert.ok(lint({ ...BASE, forms: FORMS, extra: true }).length > 0, "nothing else");
});

test("freeCast forms, homebrew strict: refused altogether for now, with a plain sentence; the SRD pack keeps its own", () => {
  const SAME = "A homebrew feature cannot add familiar forms yet.";
  for (const forms of [FORMS, ["imp"], "imp", [], ["adult-black-dragon"]]) assert.ok(lintStrict({ ...BASE, forms }).includes(`feats/hb-t-f: ${SAME}`), json(forms));
  assert.ok(lintStrict({ ...BASE, forms: FORMS, nonsense: true }).length > 0);
  assert.deepEqual(lintStrict({ ...BASE }), [], "the same feature without forms is fine");
  assert.deepEqual(lintPack(PACKS[0]), [], "Pact of the Chain keeps its seven");
});

test("lintPack never throws on a malformed freeCast, and each bad shape is told with its own key", () => {
  const edit = (fn) => { const doc = structuredClone(PACKS[0]); fn(doc.classes.find((c) => c.id === "druid").features.find((f) => f.id === "wild-companion").grants.freeCast); return lintPack(doc); };
  const cases = [["types", "fey", /freeCast types/], ["types", 5, /freeCast types/], ["types", null, /freeCast types/], ["types", ["elf"], /freeCast types/],
    ["forms", 5, /freeCast forms/], ["forms", null, /freeCast forms/], ["forms", {}, /freeCast forms/], ["forms", ["Imp"], /freeCast forms/],
    ["cost", null, /freeCast cost/], ["cost", "slot", /freeCast cost/], ["cost", { slot: true }, /freeCast cost/], ["ends", "longRest", /freeCast ends/], ["ends", ["x"], /freeCast ends/],
    ["components", "all", /freeCast components/], ["time", "bonus", /freeCast time/], ["atWill", true, /two answers/], ["nope", 1, /no "nope"/]];
  for (const [k, v, re] of cases) {
    let r;
    assert.doesNotThrow(() => { r = edit((fc) => { fc[k] = v; }); }, `${k}: ${json(v)}`);
    assert.ok(r.some((m) => re.test(m)), `${k}: ${json(v)} -> ${r.join(" | ")}`);
  }
  assert.doesNotThrow(() => edit((fc) => { delete fc.spells; }));
});

test("freeCast cost, homebrew strict: it must name a feature with uses in the SRD pack", () => {
  assert.deepEqual(lintStrict({ spells: ["find-familiar"], cost: { slot: true, uses: "wild-shape" } }), []);
  assert.deepEqual(lintStrict({ spells: ["find-familiar"], cost: { slot: true, uses: "rage" } }), []);
  for (const uses of ["no-such-feature", "wild-companion", "hb-t-f"])
    assert.ok(lintStrict({ spells: ["find-familiar"], cost: { slot: true, uses } }).some((m) => /not a feature with uses/.test(m)), uses);
});

test("freeCast forms, across the pack: it needs a spell with a summon step of forms, and pack monsters", () => {
  assert.deepEqual(lintPack(PACKS[0]), []);
  const withForms = (forms, spells = ["find-familiar"]) => {
    const doc = structuredClone(PACKS[0]);
    const f = doc.classes.find((c) => c.id === "warlock").features.find((x) => x.id === "eldritch-invocations").options.find((o) => o.id === "pact-of-the-chain");
    f.grants.freeCast = { ...f.grants.freeCast, spells, forms };
    return lintPack(doc);
  };
  assert.deepEqual(withForms(["imp"]), []);
  assert.ok(withForms(["not-a-monster"]).some((m) => /not a pack monster/.test(m)));
  assert.ok(withForms(["imp"], ["hex"]).some((m) => /summon step of forms/.test(m)), "a spell that summons nothing");
});

// ---------- play: Pact of the Chain's seven forms ----------
const warlock = (inv = ["pact-of-the-chain"]) => ({ name: "Mor", class: "warlock", level: 5, abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 18 }, skills: ["arcana", "deception"],
  spells: ["eldritch-blast", "chill-touch", "hex"], choices: { "eldritch-invocations": inv } });
const PACT = "eldritch-invocations-pact-of-the-chain";
const wizardSheet = { name: "Ven", class: "wizard", level: 5, abilities: { str: 10, dex: 14, con: 14, int: 16, wis: 12, cha: 10 }, skills: [], armour: "leather-armor", weapons: ["quarterstaff"], spells: ["find-familiar"] };
function table(id, sheet, grid) {
  const s = grid ? newGame(7, { grid }) : newGame(7);
  for (const k of Object.keys(s.entities)) delete s.entities[k];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities[id] = makeEntity(derive(sheet).record, { id, kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  ok(apply(s, { type: "claim", entity: id, user: "pat", userName: "Pat" }, PAT));
  return s;
}
const pactField = (inv, grid) => table("mor", warlock(inv), grid);
const near = (s, id, i = 0) => spots(s, s.entities[id].pos, 2)[i];
const pactCast = (s, form, extra = {}) => ({ type: "cast", actor: "mor", spell: "find-familiar", via: PACT, summon: { form, type: "fiend", at: [near(s, "mor")] }, ...extra });
const familiars = (s) => Object.values(s.entities).filter((e) => e.bond?.kind === "familiar");

test("Pact of the Chain (16619-16631): a warlock with the pact may pick each of the seven special forms, through the pact", () => {
  for (const form of FORMS) {
    const s = pactField(), mor = s.entities.mor, slots = json(mor.slots);
    const r = ok(apply(s, pactCast(s, form), PAT));
    const f = s.entities[r.events.find((e) => e.type === "summoned").id];
    assert.equal(f.tpl, form); assert.equal(f.type, "fiend", "the spell's type choice stands"); assert.equal(f.bond.to, "mor");
    assert.equal(json(mor.slots), slots, "no slot");
    assert.equal(familiars(s).length, 1);
  }
});

test("Pact of the Chain: the extra forms also come with a slot cast of the same spell by the same warlock, and the normal forms stay", () => {
  const s = pactField(), mor = s.entities.mor, lvl = Object.keys(mor.slots).find((k) => mor.slots[k] > 0);
  ok(apply(s, { type: "cast", actor: "mor", spell: "find-familiar", slot: +lvl, summon: { form: "quasit", type: "fey", at: [near(s, "mor")] } }, PAT));
  assert.equal(familiars(s)[0].tpl, "quasit");
  ok(apply(s, { type: "cast", actor: "mor", spell: "find-familiar", via: PACT, summon: { form: "owl", type: "fey" } }, PAT));
  assert.equal(familiars(s)[0].tpl, "owl", "a normal form, as before; the new casting reforms the one familiar");
});

test("the seven extra forms are for the warlock with the pact only: not a wizard, not a warlock without the pact, not any other monster", () => {
  const wiz = table("ven", wizardSheet);
  for (const form of FORMS) refused(wiz, { type: "cast", actor: "ven", spell: "find-familiar", slot: 1, summon: { form, type: "fiend", at: [near(wiz, "ven")] } }, PAT, /Choose a form/);
  const none = pactField(["eldritch-mind"]);
  assert.ok(none.entities.mor.spells.includes("find-familiar") === false, "no pact, no spell");
  refused(none, pactCast(none, "imp"), PAT, /no feature that casts spells that way/);
  const s = pactField();
  refused(s, pactCast(s, "wolf"), PAT, /Choose a form/);
  refused(s, pactCast(s, "goblin-warrior"), PAT, /Choose a form/);
  refused(s, pactCast(s, "no-such-monster"), PAT, /Choose a form/);
});

test("freeCast forms: a homebrew monster is never a form, even if the feature lists it (#403 first)", () => {
  const hb = { ...structuredClone(CONTENT.monsters.owl), id: "hb-ember-folk-owlet", name: "Ember owlet", source: "homebrew:ember-folk", checked: false, text: "An ember beast." };
  const pack = { format: "hextable-pack", v: 1, pack: { id: "ember-folk", name: "ember-folk", version: 1, license: "CC0, by the author", attribution: "Written for a test." }, monsters: [hb] };
  const r = loadPack(pack); assert.ok(r.ok, r.problems?.join("; "));
  using(overlayOf([r.pack]), () => {
    const s = pactField();
    s.entities.mor.feats.find((f) => f.id === PACT).freeCast.forms.push(hb.id);
    refused(s, pactCast(s, hb.id), PAT, new RegExp(HOMEBREW_FORM));
    ok(apply(s, pactCast(s, "imp"), PAT));
  });
});

for (const grid of [null, "square"]) {
  test(`freeCast forms: undo, redo and replay are exact${grid ? " (squares)" : " (hexes)"}`, () => {
    const s = pactField(undefined, grid), h = createHistory({ limit: 50 }), states = [json(s)], done = [];
    const play = (a) => { const before = mark(s), r = ok(apply(s, a, DM)); h.record(before, s, describeStep(a, r.events, before, s)); done.push(a); states.push(json(s)); };
    const at = near(s, "mor");
    play({ type: "cast", actor: "mor", spell: "find-familiar", via: PACT, summon: { form: "imp", type: "fiend", at: [at] } });
    play({ type: "cast", actor: "mor", spell: "find-familiar", via: PACT, summon: { form: "sprite", type: "fey" } });
    play({ type: "cast", actor: "mor", spell: "find-familiar", via: PACT, summon: { form: "skeleton", type: "fiend" } });
    for (let i = done.length - 1; i >= 0; i--) { h.undo(s); assert.equal(json(s), states[i], `undo ${i}`); }
    for (let i = 1; i <= done.length; i++) { h.redo(s); assert.equal(json(s), states[i], `redo ${i}`); }
    const again = pactField(undefined, grid);
    for (const a of done) ok(apply(again, a, DM));
    assert.equal(json(again), states.at(-1), "replayed, the same");
    assert.equal(familiars(again)[0].tpl, "skeleton");
  });
}

// ---------- types ----------
test("freeCast types: a list of 1 to 14 different creature types, only on a freeCast of named spells", () => {
  assert.deepEqual(lint({ ...BASE, types: ["fey"] }), []);
  assert.deepEqual(lint({ ...BASE, types: ["celestial", "fey", "fiend"] }), []);
  for (const bad of [[], "fey", ["Fey"], ["fey", "fey"], ["elf"], [1], null, {}])
    assert.ok(lint({ ...BASE, types: bad }).length > 0, `refused: ${json(bad)}`);
  assert.ok(lint({ list: "wizard", maxLevel: 1, types: ["fey"] }).length > 0);
  assert.deepEqual(lintStrict({ ...BASE, types: ["fey"] }), []);
  assert.ok(lintStrict({ ...BASE, types: "fey" }).some((m) => /types/.test(m)));
  assert.ok(lintStrict({ ...BASE, types: Array.from({ length: 15 }, () => "fey") }).length > 0);
});

test("freeCast types, across the pack: the spell's summon step must offer one of them", () => {
  const withTypes = (types) => {
    const doc = structuredClone(PACKS[0]);
    const f = doc.classes.find((c) => c.id === "warlock").features.find((x) => x.id === "eldritch-invocations").options.find((o) => o.id === "pact-of-the-chain");
    f.grants.freeCast = { ...f.grants.freeCast, types };
    return lintPack(doc);
  };
  assert.deepEqual(withTypes(["fey"]), []);
  assert.ok(withTypes(["undead"]).some((m) => /summon step that offers/.test(m)));
});

// A feature that says `types` is hand-set on the pact's record here (no pack feature uses it until Wild Companion is entered below).
const fey = (s) => { s.entities.mor.feats.find((f) => f.id === PACT).freeCast.types = ["fey"]; return s; };
test("freeCast types: through the feature the creature is of that type, by default or by choice; any other type is refused; a slot cast keeps the spell's own", () => {
  const s = fey(pactField()), mor = s.entities.mor;
  refused(s, pactCast(s, "owl"), PAT, /Choose its creature type: fey/);   // pactCast names "fiend"
  const at = near(s, "mor");
  const r = ok(apply(s, { type: "cast", actor: "mor", spell: "find-familiar", via: PACT, summon: { form: "owl", at: [at] } }, PAT));
  assert.equal(s.entities[r.events.find((e) => e.type === "summoned").id].type, "fey", "the one type is the default");
  ok(apply(s, { type: "cast", actor: "mor", spell: "find-familiar", via: PACT, summon: { form: "cat", type: "fey" } }, PAT));
  assert.equal(familiars(s)[0].type, "fey");
  refused(s, { type: "cast", actor: "mor", spell: "find-familiar", via: PACT, summon: { form: "cat", type: "celestial" } }, PAT, /Choose its creature type/);
  const lvl = Object.keys(mor.slots).find((k) => mor.slots[k] > 0);
  ok(apply(s, { type: "cast", actor: "mor", spell: "find-familiar", slot: +lvl, summon: { form: "cat", type: "fiend" } }, PAT));
  assert.equal(familiars(s)[0].type, "fiend", "by a slot the spell's own choice stands");
});

test("freeCast types: undo, redo and replay are exact", () => {
  const build = () => fey(pactField());
  const s = build(), h = createHistory({ limit: 50 }), states = [json(s)], done = [];
  const play = (a) => { const before = mark(s), r = ok(apply(s, a, DM)); h.record(before, s, describeStep(a, r.events, before, s)); done.push(a); states.push(json(s)); };
  play({ type: "cast", actor: "mor", spell: "find-familiar", via: PACT, summon: { form: "owl", at: [near(s, "mor")] } });
  play({ type: "cast", actor: "mor", spell: "find-familiar", via: PACT, summon: { form: "imp", type: "fey" } });
  for (let i = done.length - 1; i >= 0; i--) { h.undo(s); assert.equal(json(s), states[i], `undo ${i}`); }
  for (let i = 1; i <= done.length; i++) { h.redo(s); assert.equal(json(s), states[i], `redo ${i}`); }
  const again = build();
  for (const a of done) ok(apply(again, a, DM));
  assert.equal(json(again), states.at(-1));
});

// ---------- ends ----------
test("freeCast ends: a list of masterDies and/or longRest, no repeats, only on a freeCast of named spells", () => {
  assert.deepEqual(lint({ ...BASE, ends: ["longRest"] }), []);
  assert.deepEqual(lint({ ...BASE, ends: ["masterDies", "longRest"] }), []);
  for (const bad of [[], "longRest", ["shortRest"], ["longRest", "longRest"], ["masterDies", "longRest", "masterDies"], null, [1]])
    assert.ok(lint({ ...BASE, ends: bad }).length > 0, `refused: ${json(bad)}`);
  assert.ok(lint({ list: "wizard", maxLevel: 1, ends: ["longRest"] }).length > 0);
  assert.deepEqual(lintStrict({ ...BASE, ends: ["longRest"] }), []);
  assert.ok(lintStrict({ ...BASE, ends: "longRest" }).some((m) => /ends/.test(m)));
  assert.ok(lintStrict({ ...BASE, ends: ["masterDies", "longRest", "x"] }).length > 0);
});

test("freeCast ends, across the pack: the spell must have a summon step with a bond", () => {
  const withEnds = (spells) => {
    const doc = structuredClone(PACKS[0]);
    const f = doc.classes.find((c) => c.id === "warlock").features.find((x) => x.id === "eldritch-invocations").options.find((o) => o.id === "pact-of-the-chain");
    f.grants.freeCast = { ...f.grants.freeCast, spells, ends: ["longRest"] };
    return lintPack(doc);
  };
  assert.deepEqual(withEnds(["find-familiar"]), []);
  assert.ok(withEnds(["hex"]).some((m) => /summon step that has a bond/.test(m)));
});

const longRest = (s) => { s.entities.mor.feats.find((f) => f.id === PACT).freeCast.ends = ["longRest"]; return s; };
test("freeCast ends: the bond the cast makes ends at the caster's Long Rest, on the map or in the pocket; a slot cast does not add it", () => {
  const s = longRest(pactField()), mor = s.entities.mor;
  const id = ok(apply(s, pactCast(s, "owl"), PAT)).events.find((e) => e.type === "summoned").id;
  assert.deepEqual(s.entities[id].bond.ends, ["longRest"]);
  const r = ok(apply(s, { type: "rest" }, DM));
  assert.ok(r.events.some((e) => e.type === "vanished" && e.id === id && e.why === "rest"));
  assert.equal(s.entities[id], undefined);
  // In the pocket.
  const t = longRest(pactField());
  const id2 = ok(apply(t, pactCast(t, "imp"), PAT)).events.find((e) => e.type === "summoned").id;
  ok(apply(t, { type: "dismiss", actor: "mor", id: id2 }, PAT));
  assert.ok(t.entities.mor.pocket?.[id2], "in the pocket");
  const r2 = ok(apply(t, { type: "rest" }, DM));
  assert.ok(r2.events.some((e) => e.type === "vanished" && e.id === id2 && e.pocket === true));
  assert.equal(t.entities.mor.pocket?.[id2], undefined);
  // A new casting by a slot reforms it with the spell's own endings; a Short Rest does not end the pact one.
  const u = longRest(pactField()), m = u.entities.mor, lvl = Object.keys(m.slots).find((k) => m.slots[k] > 0);
  const id3 = ok(apply(u, pactCast(u, "owl"), PAT)).events.find((e) => e.type === "summoned").id;
  ok(apply(u, { type: "shortRest" }, DM));
  assert.ok(u.entities[id3], "a Short Rest leaves it");
  ok(apply(u, { type: "cast", actor: "mor", spell: "find-familiar", slot: +lvl, summon: { form: "cat", type: "fey" } }, PAT));
  assert.deepEqual(familiars(u)[0].bond.ends, []);
  assert.equal(CONTENT.spells["find-familiar"].effects[0].bond.ends, undefined, "the spell's data is untouched");
});

test("freeCast ends: undo, redo and replay are exact", () => {
  const build = () => longRest(pactField());
  const s = build(), h = createHistory({ limit: 50 }), states = [json(s)], done = [];
  const play = (a) => { const before = mark(s), r = ok(apply(s, a, DM)); h.record(before, s, describeStep(a, r.events, before, s)); done.push(a); states.push(json(s)); };
  play({ type: "cast", actor: "mor", spell: "find-familiar", via: PACT, summon: { form: "owl", type: "fey", at: [near(s, "mor")] } });
  play({ type: "rest" });
  for (let i = done.length - 1; i >= 0; i--) { h.undo(s); assert.equal(json(s), states[i], `undo ${i}`); }
  for (let i = 1; i <= done.length; i++) { h.redo(s); assert.equal(json(s), states[i], `redo ${i}`); }
  const again = build();
  for (const a of done) ok(apply(again, a, DM));
  assert.equal(json(again), states.at(-1));
});

// ---------- components ----------
test("freeCast components: only 'none', only on a freeCast of named spells", () => {
  assert.deepEqual(lint({ ...BASE, components: "none" }), []);
  for (const bad of ["all", "m", true, null, ["none"]]) assert.ok(lint({ ...BASE, components: bad }).length > 0, `refused: ${json(bad)}`);
  assert.ok(lint({ list: "wizard", maxLevel: 1, components: "none" }).length > 0);
  assert.deepEqual(lintStrict({ ...BASE, components: "none" }), []);
  assert.ok(lintStrict({ ...BASE, components: 1 }).some((m) => /components/.test(m)));
});

// Find Figure's Material component is costly (10 GP of incense), so Subtle Spell cannot hide it and a Counterspell may answer it.
// The waiver lifts that: no Material component, nothing left to see. (The engine keeps no components otherwise; this is all it changes.)
const sorcSheet = { name: "Jed", class: "sorcerer", level: 15, subclass: "draconic", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 18 }, skills: ["arcana", "insight"],
  choices: { metamagic: ["subtle", "quickened"], "elemental-affinity": "fire", "metamagic-10": ["heightened", "twinned"] }, spells: ["fire-bolt", "counterspell"] };
test("freeCast components 'none': a Subtle cast of a costly spell through the feature cannot be Counterspelled; without the waiver it can", () => {
  const tryCast = (components) => {
    const s = table("jed", sorcSheet);
    s.entities.jed.feats.push({ id: "gift", name: "Gift", tier: "auto", freeCast: { spells: ["find-familiar"], atWill: true, time: "action", ...(components ? { components } : {}) } });
    const foe = s.entities.foe = makeEntity(derive({ ...sorcSheet, name: "Foe" }).record, { id: "foe", kind: "npc", side: "foe", pos: { q: -2, r: 0, z: 0 } });
    foe.reactions = { counterspell: "always" };
    const r = ok(apply(s, { type: "cast", actor: "jed", spell: "find-familiar", via: "gift", metamagic: ["subtle"] }, PAT));
    return r.events.some((x) => x.type === "reaction" && x.id === "foe" && x.reaction === "counterspell");
  };
  assert.equal(tryCast(undefined), true, "the costly Material component is there to see");
  assert.equal(tryCast("none"), false, "no Material component, nothing to see");
});

// ---------- cost ----------
test("freeCast cost: exactly { slot: true, uses: <feature id> }, with no uses of its own and no atWill; the strict lists type it", () => {
  const COST = { slot: true, uses: "wild-shape" };
  assert.deepEqual(lint({ spells: ["find-familiar"], cost: COST }), []);
  assert.deepEqual(lint({ spells: ["find-familiar"], cost: COST, time: "action", components: "none" }), []);
  for (const bad of [{}, { slot: true }, { uses: "wild-shape" }, { slot: false, uses: "wild-shape" }, { slot: true, uses: "Wild Shape" }, { slot: true, uses: "x", more: 1 }, "slot", null, [], { slot: 1, uses: "x" }])
    assert.ok(lint({ spells: ["find-familiar"], cost: bad }).length > 0, `refused: ${json(bad)}`);
  assert.ok(lint({ list: "wizard", maxLevel: 1, cost: COST }).length > 0, "not on a { list, maxLevel }");
  assert.ok(lint({ spells: ["find-familiar"], cost: COST, atWill: true }).length > 0, "a cost and atWill are two answers to what it spends");
  assert.deepEqual(lintStrict({ spells: ["find-familiar"], cost: COST }), []);
  assert.ok(lintStrict({ spells: ["find-familiar"], cost: { slot: "yes", uses: "x" } }).some((m) => /cost/.test(m)));
  assert.ok(lintStrict({ spells: ["find-familiar"], cost: { slot: true, uses: "x", y: 1 } }).length > 0);
});

test("freeCast cost, across the pack: it names a feature of the class that has uses, and a class feature with a cost has none of its own", () => {
  const edit = (fn) => { const doc = structuredClone(PACKS[0]); fn(doc.classes.find((c) => c.id === "druid").features.find((f) => f.id === "wild-companion")); return lintPack(doc); };
  assert.deepEqual(edit(() => {}), []);
  assert.ok(edit((f) => { f.grants.freeCast.cost.uses = "wild-companion"; }).some((m) => /not a feature with uses/.test(m)));
  assert.ok(edit((f) => { f.grants.freeCast.cost.uses = "no-such"; }).some((m) => /not a feature with uses/.test(m)));
  assert.ok(edit((f) => { f.uses = { max: 1, recharge: "long" }; }).length > 0, "no uses of its own");
  assert.ok(edit((f) => { delete f.grants.freeCast.cost; }).some((m) => /needs uses, atWill or a cost/.test(m)));
});

// ---------- Wild Companion (Druid 2), played ----------
const druidSheet = (level = 2) => ({ name: "Ven", class: "druid", level, abilities: { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 }, skills: ["nature", "perception"],
  choices: { "primal-order": "warden" }, armour: "leather-armor", shield: true, weapons: ["quarterstaff"], spells: ["produce-flame", "cure-wounds"] });
const WC = "wild-companion";
const druidField = (grid, level) => table("ven", druidSheet(level), grid);
const wc = (s, pay, extra = {}, summon) => ({ type: "cast", actor: "ven", spell: "find-familiar", via: WC, ...(pay ? { pay } : {}), summon: summon ?? { form: "owl", at: [near(s, "ven")] }, ...extra });
const summonedId = (r) => r.events.find((e) => e.type === "summoned").id;

test("Wild Companion (9205-9211) is entered: a Magic action that spends a slot or a Wild Shape use, no Material, Fey, until a Long Rest", () => {
  const f = derive(druidSheet(2)).record.feats.find((x) => x.id === WC);
  assert.deepEqual(f.freeCast, { spells: ["find-familiar"], time: "action", cost: { slot: true, uses: "wild-shape" }, types: ["fey"], ends: ["longRest"], components: "none" });
  assert.equal(f.uses, undefined);
  assert.equal(derive(druidSheet(2)).record.feats.find((x) => x.id === "wild-shape").uses.max, 2);
  assert.deepEqual(lintPack(PACKS[0]), []);
});

test("Wild Companion: paying with a slot spends that slot and no Wild Shape use; the familiar is Fey with no type named, and ends at a Long Rest", () => {
  const s = druidField(), ven = s.entities.ven, wsBefore = ven.uses["wild-shape"], slots1 = ven.slots[1];
  const r = ok(apply(s, wc(s, "slot"), PAT));
  assert.equal(ven.slots[1], slots1 - 1); assert.equal(ven.uses["wild-shape"], wsBefore); assert.equal(ven.uses[WC], undefined);
  const fam = s.entities[summonedId(r)];
  assert.equal(fam.type, "fey"); assert.equal(fam.tpl, "owl"); assert.deepEqual(fam.bond.ends, ["longRest"]); assert.equal(fam.bond.to, "ven");
  const rest = ok(apply(s, { type: "rest" }, DM));
  assert.ok(rest.events.some((e) => e.type === "vanished" && e.id === fam.id && e.why === "rest"));
  assert.equal(s.entities[fam.id], undefined);
  assert.equal(ven.uses["wild-shape"], 2, "Wild Shape is back at the Long Rest, too");
});

test("Wild Companion: paying with a use of Wild Shape spends that use and no slot, never both", () => {
  const s = druidField(), ven = s.entities.ven, slots = json(ven.slots), ws = ven.uses["wild-shape"];
  ok(apply(s, wc(s, "uses", {}, { form: "cat", type: "fey", at: [near(s, "ven")] }), PAT));
  assert.equal(ven.uses["wild-shape"], ws - 1); assert.equal(json(ven.slots), slots);
  assert.equal(familiars(s)[0].type, "fey");
  // The spell's slot level is not a thing to name with a use.
  refused(s, wc(s, "uses", { slot: 1 }), PAT, /not both/);
});

test("Wild Companion: the caster must say what it spends; a rejected cast changes nothing", () => {
  const s = druidField(), ven = s.entities.ven;
  refused(s, wc(s), PAT, /Choose what Wild Companion spends/);
  refused(s, wc(s, "both"), PAT, /Choose what Wild Companion spends/);
  refused(s, wc(s, "slot", { slot: 0 }), PAT, /needs a spell slot/);
  refused(s, wc(s, "slot", { slot: 5 }), PAT, /no level 5 spell slots|needs a spell slot/);
  refused(s, wc(s, "slot", {}, { form: "owl", type: "fiend", at: [near(s, "ven")] }), PAT, /Choose its creature type: fey/);
  refused(s, wc(s, "slot", {}, { form: "wolf", at: [near(s, "ven")] }), PAT, /Choose a form/);
  refused(s, wc(s, "slot", {}, { form: "imp", at: [near(s, "ven")] }), PAT, /Choose a form/);
  refused(s, wc(s, "slot", { spell: "cure-wounds", target: "ven" }), PAT, /can't cast that spell/);
  ven.uses["wild-shape"] = 0;
  refused(s, wc(s, "uses"), PAT, /no uses of Wild Shape left/);
  ok(apply(s, wc(s, "slot"), PAT));                 // a slot still pays with no use left
  ven.slots[1] = 0; ven.slots[2] = 0;
  refused(s, wc(s, "slot", {}, { form: "cat" }), PAT, /no level 1 spell slots/);
  // A feature with no cost takes no `pay`; a druid below 2 has no such feature.
  const pact = pactField();
  refused(pact, pactCast(pact, "owl", { pay: "slot" }), PAT, /leave out "pay"/);
  refused(druidField(null, 1), wc(druidField(null, 1), "slot"), PAT, /no feature that casts spells that way/);
});

test("Wild Companion: no Find Familiar by a slot is needed or known; one familiar, a new casting reforms it and gives it the Long Rest ending", () => {
  const s = druidField(), ven = s.entities.ven;
  assert.equal(ven.spells.includes("find-familiar"), false, "the druid does not know the spell");
  const id = summonedId(ok(apply(s, wc(s, "slot"), PAT)));
  ok(apply(s, wc(s, "uses", {}, { form: "cat" }), PAT));
  assert.equal(familiars(s).length, 1); assert.equal(familiars(s)[0].id, id); assert.equal(familiars(s)[0].tpl, "cat"); assert.deepEqual(familiars(s)[0].bond.ends, ["longRest"]);
});

test("Wild Companion in a fight: a Magic action; a slot is the turn's one slot, a Wild Shape use is not a slot", () => {
  const mk = () => { const s = druidField(); ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 5, r: 0 } }, DM)); ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 12 }, DM));
    for (let i = 0; i < 20 && current(s) !== "ven"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); return s; };
  const a = mk();
  ok(apply(a, wc(a, "slot"), PAT));
  assert.equal(a.encounter.budget.action, 0); assert.equal(a.encounter.flags.slot, true, "the slot is the turn's slot");
  const b = mk();
  ok(apply(b, wc(b, "uses"), PAT));
  assert.equal(b.encounter.budget.action, 0); assert.equal(b.encounter.flags.slot, undefined, "no slot");
  const c = mk();
  c.encounter.flags.slot = true;
  refused(c, wc(c, "slot"), PAT, /Only one spell slot/);
  ok(apply(c, wc(c, "uses"), PAT));
});

for (const grid of [null, "square"]) {
  test(`Wild Companion: undo, redo and replay are exact${grid ? " (squares)" : " (hexes)"}`, () => {
    const s = druidField(grid), h = createHistory({ limit: 50 }), states = [json(s)], done = [];
    const play = (a) => { const before = mark(s), r = ok(apply(s, a, DM)); h.record(before, s, describeStep(a, r.events, before, s)); done.push(a); states.push(json(s)); };
    play(wc(s, "slot"));
    play({ type: "dismiss", actor: "ven", id: familiars(s)[0].id });
    play(wc(s, "uses", {}, { form: "cat" }));
    play({ type: "rest" });
    assert.equal(familiars(s).length, 0);
    for (let i = done.length - 1; i >= 0; i--) { h.undo(s); assert.equal(json(s), states[i], `undo ${i}`); }
    for (let i = 1; i <= done.length; i++) { h.redo(s); assert.equal(json(s), states[i], `redo ${i}`); }
    const again = druidField(grid);
    for (const a of done) ok(apply(again, a, DM));
    assert.equal(json(again), states.at(-1), "replayed, the same");
  });
}

test("Wild Companion: the familiar in the pocket dimension also disappears at the Long Rest", () => {
  const s = druidField(), id = summonedId(ok(apply(s, wc(s, "slot"), PAT)));
  ok(apply(s, { type: "dismiss", actor: "ven", id }, PAT));
  assert.ok(s.entities.ven.pocket?.[id]);
  const r = ok(apply(s, { type: "rest" }, DM));
  assert.ok(r.events.some((e) => e.type === "vanished" && e.id === id && e.pocket === true));
  assert.equal(s.entities.ven.pocket?.[id], undefined);
});

// ---------- a character saved before this change ----------
// The codebase has no remake at load (migrate.js bumps shapes only; #232 left a warlock saved before it as it was): a record keeps the
// features it was made with. The DM's `setSheet` with the character's own sheet remakes it, keeping its place, damage and spent uses.
test("a druid or warlock made before Wild Companion and the seven forms: the DM's setSheet with its own sheet gives them", () => {
  const old = druidField(), ven = old.entities.ven;
  ven.sheet = druidSheet(); ven.feats = ven.feats.filter((f) => f.id !== WC);             // a record as main made it
  refused(old, wc(old, "slot"), PAT, /no feature that casts spells that way/);
  ven.uses["wild-shape"] = 1;
  ok(apply(old, { type: "setSheet", actor: "ven", sheet: structuredClone(ven.sheet) }, DM));
  assert.equal(old.entities.ven.uses["wild-shape"], 1, "what was spent stays spent");
  ok(apply(old, wc(old, "uses"), PAT));
  const w = pactField(), mor = w.entities.mor;
  mor.sheet = { ...warlock(), subclass: "fiend" }; mor.feats.find((f) => f.id === PACT).freeCast = { spells: ["find-familiar"], atWill: true, time: "action" };
  refused(w, pactCast(w, "imp"), PAT, /Choose a form/);
  ok(apply(w, { type: "setSheet", actor: "mor", sheet: structuredClone(mor.sheet) }, DM));
  ok(apply(w, pactCast(w, "imp"), PAT));
});
