// Companions, stage C9, first half (#411): Faithful Steed, and the Long Rest that ends a bond (Wild Companion's
// `ends: ['longRest']`, here for a familiar in its master's pocket). Every rule is from reference/srd52/srd52-flow.txt:
//   Faithful Steed (11982-11987): "You always have the Find Steed spell prepared. You can also cast the spell once without
//   expending a spell slot, and you regain the ability to do so when you finish a Long Rest."
//   Find Steed (26824-26853): a new casting replaces the old steed; the slot's level is the spell's level in the block.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { gridOf } from "../src/grid.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { lintPack } from "../src/content/schema.js";
import { PACKS } from "../src/content/index.js";
import { viewEvents } from "../src/view.js";
import { FT, gap } from "../src/space.js";

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
const A = { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 16 };
const paladin = (level) => ({ name: "Ka", class: "paladin", level, ...(level >= 3 ? { subclass: "devotion" } : {}), abilities: A, skills: ["athletics", "religion"],
  choices: { "fighting-style": "defense" }, armour: "chain-mail", weapons: ["longsword"] });
function spots(s, near, r = 3, monster = "wolf") {
  const G = gridOf(s.map), out = [];
  for (const h of G.range(near, r)) if (apply(structuredClone(s), { type: "spawn", monster, at: h }, DM).ok) out.push(h);
  return out;
}
// An open field, Ka (a paladin of the given level, played by Pat) at the centre.
function field(level) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.ka = makeEntity(derive(paladin(level)).record, { id: "ka", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  ok(apply(s, { type: "claim", entity: "ka", user: "pat", userName: "Pat" }, PAT));
  return s;
}
const steedAt = (s, i = 0) => ({ at: [spots(s, s.entities.ka.pos, 3).filter((h) => gridOf(s.map).dist(s.entities.ka.pos, h) <= 6)[i]] });
const faithful = (s, type = "fey", i = 0, extra = {}) => ({ type: "cast", actor: "ka", spell: "find-steed", via: "faithful-steed", summon: { type, ...steedAt(s, i) }, ...extra });
const steeds = (s) => Object.values(s.entities).filter((e) => e.bond?.kind === "steed");

test("Faithful Steed (11982-11987): entered as one use per Long Rest that casts Find Steed, always prepared", () => {
  const f = derive(paladin(5)).record.feats.find((x) => x.id === "faithful-steed");
  assert.equal(derive(paladin(4)).record.feats.some((x) => x.id === "faithful-steed"), false, "not before level 5");
  assert.deepEqual(f.uses, { max: 1, recharge: "long" });
  assert.deepEqual(f.freeCast, { spells: ["find-steed"] });
  assert.ok(derive(paladin(5)).record.spells.includes("find-steed"), "always prepared");
  assert.deepEqual(validate(paladin(5)), []);
  assert.deepEqual(lintPack(PACKS[0]), []);
});

test("Faithful Steed: the cast spends the use and no slot; the steed has the spell's own level and the chosen type", () => {
  const s = field(5), ka = s.entities.ka, slots = json(ka.slots);
  assert.equal(ka.uses["faithful-steed"], 1);
  const r = ok(apply(s, faithful(s), PAT));
  assert.equal(ka.uses["faithful-steed"], 0, "the use is spent");
  assert.equal(json(ka.slots), slots, "no spell slot is spent");
  const [st] = steeds(s);
  assert.equal(st.bond.to, "ka"); assert.equal(st.bond.source, "find-steed"); assert.equal(st.bond.slot, 2, "at its own level, 2");
  assert.equal(st.type, "fey", "the type is chosen at each casting");
  assert.equal(st.maxHp, 5 + 10 * 2, "Otherworldly Steed: 5 + 10 per spell level (26854-26905)");
  assert.equal(st.ac, 10 + 2);
  assert.ok(r.events.some((x) => x.type === "summoned"));
});

test("Faithful Steed: once per Long Rest, the second free cast is refused, a slot cast is still open, a Long Rest gives the use back", () => {
  const s = field(5), ka = s.entities.ka;
  ok(apply(s, faithful(s, "celestial"), PAT));
  refused(s, faithful(s, "fiend", 1), PAT, /no uses of Faithful Steed left/);
  // A spell slot still casts it (it is prepared), and replaces the steed.
  const old = steeds(s)[0].id;
  ok(apply(s, { type: "cast", actor: "ka", spell: "find-steed", slot: 2, summon: { type: "fiend", ...steedAt(s, 1) } }, PAT));
  assert.equal(ka.slots[2], 1, "the slot was spent");
  assert.equal(steeds(s).length, 1); assert.notEqual(steeds(s)[0].id, old, "replaced");
  assert.equal(steeds(s)[0].bond.slot, 2);
  assert.equal(ka.uses["faithful-steed"], 0, "a slot cast does not touch the use");
  ok(apply(s, { type: "rest" }, DM));
  assert.equal(ka.uses["faithful-steed"], 1, "back after a Long Rest");
  ok(apply(s, faithful(s, "fey", 2), PAT));
  assert.equal(ka.uses["faithful-steed"], 0);
});

test("Faithful Steed: a short rest does not give the use back; it is not for another spell, another type or a slot level", () => {
  const s = field(5), ka = s.entities.ka;
  ok(apply(s, faithful(s), PAT));
  ok(apply(s, { type: "shortRest" }, DM));
  assert.equal(ka.uses["faithful-steed"], 0, "a Short Rest does not refresh it");
  const t = field(5), k = t.entities.ka, before = json(k.slots);
  refused(t, { type: "cast", actor: "ka", spell: "bless", via: "faithful-steed", target: "ka" }, PAT, /can't cast that spell/);
  refused(t, faithful(t, "beast"), PAT, /creature type/);
  refused(t, faithful(t, "fey", 0, { slot: 2 }), PAT, /without a slot/);
  refused(t, { ...faithful(t), summon: { type: "fey", at: [{ q: 90, r: 90 }] } }, PAT);
  assert.equal(k.uses["faithful-steed"], 1); assert.equal(json(k.slots), before);
  // A paladin below level 5 has no such feature.
  const low = field(4);
  refused(low, faithful(low), PAT, /no feature/);
});

test("Faithful Steed in a fight: a Magic action, no slot; a turn's one slot cast stays free for another spell", () => {
  const s = field(5), ka = s.entities.ka;
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 5, r: 0 } }, DM));
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 12 }, DM));
  for (let i = 0; i < 20 && current(s) !== "ka"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  ok(apply(s, faithful(s), PAT));
  assert.equal(s.encounter.budget.action, 0, "it took the action");
  assert.equal(s.encounter.flags.slot, undefined, "no slot was spent, so the turn's slot is free");
  assert.equal(ka.uses["faithful-steed"], 0);
});

for (const grid of [null, "square"]) {
  test(`Faithful Steed: undo, redo and replay are exact${grid ? " (squares)" : " (hexes)"}`, () => {
    const build = () => { const s = grid ? newGame(7, { grid }) : newGame(7); for (const id of Object.keys(s.entities)) delete s.entities[id]; for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass"; s.settings.autoEngage = false;
      s.entities.ka = makeEntity(derive(paladin(5)).record, { id: "ka", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } }); return s; };
    const s = build(), h = createHistory({ limit: 50 }), states = [json(s)], done = [];
    const play = (a) => { const before = mark(s), r = ok(apply(s, a, DM)); h.record(before, s, describeStep(a, r.events, before, s)); done.push(a); states.push(json(s)); };
    const at = (i) => ({ at: [spots(s, s.entities.ka.pos, 3).filter((x) => gridOf(s.map).dist(s.entities.ka.pos, x) <= 6)[i]] });
    play({ type: "cast", actor: "ka", spell: "find-steed", via: "faithful-steed", summon: { type: "fey", ...at(0) } });
    play({ type: "cast", actor: "ka", spell: "find-steed", slot: 2, summon: { type: "fiend", ...at(1) } });
    play({ type: "rest" });
    play({ type: "cast", actor: "ka", spell: "find-steed", via: "faithful-steed", summon: { type: "celestial", ...at(2) } });
    for (let i = done.length - 1; i >= 0; i--) { h.undo(s); assert.equal(json(s), states[i], `undo ${i}`); }
    for (let i = 1; i <= done.length; i++) { h.redo(s); assert.equal(json(s), states[i], `redo ${i}`); }
    const again = build();
    for (const a of done) ok(apply(again, a, DM));
    assert.equal(json(again), states.at(-1), "replayed, the same");
  });
}

// ---------- a Long Rest ends a bond with `ends: ['longRest']`, in the pocket too ----------
// Wild Companion (9205-9211): "the familiar is Fey and disappears when you finish a Long Rest." No pack spell sets
// `ends: ['longRest']` until Wild Companion is entered, so these tests set it on the familiar's bond by hand, as the
// C1/C2 tests do. A Long Rest is finished by its master whether the familiar is on the map or in the pocket dimension.
const wizard = { name: "Ven", class: "wizard", level: 5, abilities: { str: 10, dex: 14, con: 14, int: 16, wis: 12, cha: 10 }, skills: [], armour: "leather-armor", weapons: ["quarterstaff"], spells: ["find-familiar"] };
function wizTable(grid) {
  const s = grid ? newGame(5, { grid }) : newGame(5);
  s.settings.autoEngage = false;
  const free = spots(s, s.entities.fighter.pos, 2)[0];
  s.entities.ven = makeEntity(derive(wizard).record, { id: "ven", kind: "pc", side: "party", pos: { ...free, z: 0 } });
  ok(apply(s, { type: "claim", entity: "ven", user: "pat", userName: "Pat" }, PAT));
  return s;
}
function owl(s, ends) {
  const at = spots(s, s.entities.ven.pos, 2).filter((h) => gap(s, s.entities.ven.pos, h) * FT <= 10).at(-1);
  const id = ok(apply(s, { type: "cast", actor: "ven", spell: "find-familiar", slot: 1, summon: { form: "owl", type: "fey", at: [at] } }, PAT)).events.find((e) => e.type === "summoned").id;
  if (ends) s.entities[id].bond.ends = ends;
  return id;
}

for (const grid of [null, "square"]) {
  test(`a Long Rest takes a familiar bound by it from the pocket dimension, and only that one, and only when its master rests${grid ? " (squares)" : " (hexes)"}`, () => {
    const s = wizTable(grid), id = owl(s, ["longRest"]);
    ok(apply(s, { type: "dismiss", actor: "ven", id }, PAT));
    assert.ok(s.entities.ven.pocket[id], "in the pocket");
    // A rest the master is not part of leaves it there.
    ok(apply(s, { type: "rest", ids: ["fighter"] }, DM));
    assert.ok(s.entities.ven.pocket?.[id], "its master did not rest");
    // A Short Rest does not end it.
    ok(apply(s, { type: "shortRest" }, DM));
    assert.ok(s.entities.ven.pocket?.[id], "a Short Rest is not a Long Rest");
    const r = ok(apply(s, { type: "rest" }, DM));
    assert.equal(s.entities.ven.pocket, undefined, "gone from the pocket, and an empty pocket leaves no field");
    assert.equal(s.entities[id], undefined, "and not on the map");
    const v = r.events.find((e) => e.type === "vanished" && e.id === id);
    assert.deepEqual(v, { type: "vanished", id, name: v.name, why: "rest", seen: true, party: true, pocket: true });
    assert.ok(viewEvents(r.events, s, PAT).some((e) => e.type === "vanished" && e.id === id && e.why === "rest"), "the party is told");
    // A familiar with no such end stays in its pocket through the Long Rest, with its Hit Points as they were.
    const t = wizTable(grid), keep = owl(t);
    t.entities[keep].hp = 1;
    ok(apply(t, { type: "dismiss", actor: "ven", id: keep }, PAT));
    ok(apply(t, { type: "rest" }, DM));
    assert.equal(t.entities.ven.pocket[keep].hp, 1, "Find Familiar's own familiar is not bound to a rest");
  });

  test(`a Long Rest takes a bound familiar on the map as before; a recalled one is not left over${grid ? " (squares)" : " (hexes)"}`, () => {
    const s = wizTable(grid), id = owl(s, ["longRest"]);
    const r = ok(apply(s, { type: "rest" }, DM));
    assert.equal(s.entities[id], undefined);
    assert.ok(r.events.some((e) => e.type === "vanished" && e.id === id && e.why === "rest" && !e.pocket));
    const t = wizTable(grid), back = owl(t, ["longRest"]);
    ok(apply(t, { type: "dismiss", actor: "ven", id: back }, PAT));
    ok(apply(t, { type: "recall", actor: "ven", id: back, at: { ...spots(t, t.entities.ven.pos, 2).find((h) => gap(t, t.entities.ven.pos, h) * FT <= 30) } }, PAT));
    assert.ok(t.entities[back], "recalled");
    ok(apply(t, { type: "rest" }, DM));
    assert.equal(t.entities[back], undefined); assert.equal(t.entities.ven.pocket, undefined);
  });

  test(`a Long Rest that ends a pocketed familiar: undo, redo and replay are exact${grid ? " (squares)" : " (hexes)"}`, () => {
    const build = () => { const s = wizTable(grid); owl(s, ["longRest"]); return s; };
    const s = build(), id = Object.values(s.entities).find((e) => e.bond)?.id, h = createHistory({ limit: 50 }), states = [json(s)], done = [];
    const play = (a, ctx = DM) => { const before = mark(s), r = ok(apply(s, a, ctx)); h.record(before, s, describeStep(a, r.events, before, s)); done.push([a, ctx]); states.push(json(s)); };
    play({ type: "dismiss", actor: "ven", id }, PAT);
    play({ type: "rest" });
    for (let i = done.length - 1; i >= 0; i--) { h.undo(s); assert.equal(json(s), states[i], `undo ${i}`); }
    for (let i = 1; i <= done.length; i++) { h.redo(s); assert.equal(json(s), states[i], `redo ${i}`); }
    const again = build();
    for (const [a, c] of done) ok(apply(again, a, c));
    assert.equal(json(again), states.at(-1), "replayed, the same");
  });
}

test("a Long Rest by a foe master with a bound familiar in its pocket tells the party nothing", () => {
  const s = newGame(5);
  s.settings.autoEngage = false;
  const mage = ok(apply(s, { type: "spawn", monster: "mage", at: spots(s, s.entities.fighter.pos, 5)[2] }, DM)).events.find((e) => e.type === "spawned").id;
  const owlId = ok(apply(s, { type: "spawn", monster: "owl", at: spots(s, s.entities[mage].pos, 2)[0] }, DM)).events.find((e) => e.type === "spawned").id;
  ok(apply(s, { type: "bond", actor: owlId, to: mage, kind: "familiar" }, DM));
  s.entities[owlId].bond.source = "find-familiar"; s.entities[owlId].bond.ends = ["longRest"];
  ok(apply(s, { type: "dismiss", actor: mage, id: owlId }, DM));
  assert.ok(s.entities[mage].pocket[owlId]);
  const r = ok(apply(s, { type: "rest", ids: [mage] }, DM));
  assert.equal(s.entities[mage].pocket, undefined);
  const ev = r.events.find((e) => e.type === "vanished" && e.id === owlId);
  assert.ok(ev && !ev.seen && !ev.party, "not marked for players");
  assert.equal(viewEvents(r.events, s, PAT).some((e) => e.type === "vanished" && e.id === owlId), false);
});

// ---------- Pact of the Chain, the casting part (16619-16631) ----------
// "You learn the Find Familiar spell and can cast it as a Magic action without expending a spell slot. When you cast the
// spell, you choose one of the normal forms for your familiar or one of the following special forms: Imp, Pseudodragon,
// Quasit, Skeleton, Sphinx of Wonder, Sprite, or Venomous Snake."
const warlock = (inv = ["pact-of-the-chain"]) => ({ name: "Mor", class: "warlock", level: 5, subclass: undefined, abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 18 }, skills: ["arcana", "deception"],
  spells: ["eldritch-blast", "chill-touch", "hex"], choices: { "eldritch-invocations": inv } });
const PACT = "eldritch-invocations-pact-of-the-chain";
function pactField(inv) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.mor = makeEntity(derive(warlock(inv)).record, { id: "mor", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  ok(apply(s, { type: "claim", entity: "mor", user: "pat", userName: "Pat" }, PAT));
  return s;
}
const pactCast = (s, form, extra = {}) => ({ type: "cast", actor: "mor", spell: "find-familiar", via: PACT, summon: { form, type: "fiend", at: [spots(s, s.entities.mor.pos, 2)[0]] }, ...extra });

test("Pact of the Chain: a normal form, cast through the pact with no slot and no use spent, as a Magic action, any number of times", () => {
  const s = pactField(), mor = s.entities.mor, slots = json(mor.slots), uses = json(mor.uses);
  assert.ok(mor.spells.includes("find-familiar"), "learned");
  const r = ok(apply(s, pactCast(s, "owl"), PAT));
  assert.equal(json(mor.slots), slots, "no spell slot (nor Pact Magic slot) is spent");
  assert.equal(json(mor.uses), uses, "at will: no use is spent");
  const owl = s.entities[r.events.find((e) => e.type === "summoned").id];
  assert.equal(owl.type, "fiend", "the spell's type choice stands");
  assert.equal(owl.bond.source, "find-familiar"); assert.equal(owl.bond.to, "mor");
  // Cast again, it takes the new form (one familiar), still free.
  ok(apply(s, { type: "cast", actor: "mor", spell: "find-familiar", via: PACT, summon: { form: "cat", type: "fey" } }, PAT));
  assert.equal(json(mor.slots), slots);
  assert.equal(Object.values(s.entities).filter((e) => e.bond?.kind === "familiar").length, 1);
});

test("Pact of the Chain: in a fight it is a Magic action (the hour it takes does not matter), and takes no spell slot of the turn", () => {
  const s = pactField();
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 5, r: 0 } }, DM));
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 12 }, DM));
  for (let i = 0; i < 20 && current(s) !== "mor"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  refused(s, { type: "cast", actor: "mor", spell: "find-familiar", slot: 1, summon: { form: "owl", type: "fey", at: [spots(s, s.entities.mor.pos, 2)[0]] } }, PAT, /takes longer than a turn/);
  ok(apply(s, pactCast(s, "owl"), PAT));
  assert.equal(s.encounter.budget.action, 0); assert.equal(s.encounter.flags.slot, undefined);
});

test("Pact of the Chain: not without the pact; a rejected cast changes nothing", () => {
  const none = pactField(["eldritch-mind"]);
  refused(none, pactCast(none, "owl"), PAT, /no feature that casts spells that way/);
  const s = pactField();
  refused(s, pactCast(s, "no-such-monster"), PAT, /Choose a form/);
  refused(s, pactCast(s, "wolf"), PAT, /Choose a form/);
  refused(s, pactCast(s, "owl", { slot: 1 }), PAT, /without a slot/);
  refused(s, pactCast(s, "owl", { spell: "hex" }), PAT, /can't cast that spell/);
});

test("Pact of the Chain's seven extra forms: the warlock with the pact may pick them (#414), a wizard is still refused", () => {
  // The wizard is refused as the SRD needs. The warlock was refused until #414 (`freeCast.forms`; companions.md, C9b); the full
  // play is in freecast-keys.test.js.
  const wiz = wizTable();
  for (const form of ["imp", "pseudodragon", "quasit", "skeleton", "sphinx-of-wonder", "sprite", "venomous-snake"]) {
    const at = spots(wiz, wiz.entities.ven.pos, 2)[0];
    refused(wiz, { type: "cast", actor: "ven", spell: "find-familiar", slot: 1, summon: { form, type: "fiend", at: [at] } }, PAT, /Choose a form/);
    const s = pactField();
    ok(apply(s, pactCast(s, form), PAT));
  }
});
