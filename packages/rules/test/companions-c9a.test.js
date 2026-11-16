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
