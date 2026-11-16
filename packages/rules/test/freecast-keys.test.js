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

test("freeCast forms, homebrew strict: the key has a type and a length ceiling", () => {
  assert.deepEqual(lintStrict({ ...BASE, forms: FORMS }), []);
  assert.ok(lintStrict({ ...BASE, forms: "imp" }).some((m) => /forms/.test(m)));
  assert.ok(lintStrict({ ...BASE, forms: Array.from({ length: 21 }, (_, i) => `m-${i}`) }).length > 0);
  assert.ok(lintStrict({ ...BASE, forms: ["imp"], nonsense: true }).length > 0);
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
