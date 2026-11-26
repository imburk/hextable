// Wave 5, part 1, of issue #786: Darkvision (auto, through the `senses` hook), Remove Curse (assist, the `curses` cure word) and Produce Flame.
// Built to docs/specs/rules-expansion.md, "Build notes: wave 5 part 1". Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { apply, current } from "../src/engine.js";
import { concentrating } from "../src/durations.js";
import { newGame } from "../src/scenario.js";
import { canSee } from "../src/sight.js";
import { sensesOf } from "../src/modifiers.js";
import { partyView } from "../src/vision.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const lint = (def) => lintEntry("spells", def, { strict: false });
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  for (let q = -16; q <= 17; q++) s.map.levels[0].tiles[`${q},0`] = { t: "grass" };           // a row long enough for 150 feet
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", 0, 0], ["fighter", -2, 0], ["rogue", -4, 4], ["cleric", -3, 0]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  const slots = { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 2 };
  for (const id of ["wizard", "cleric"]) Object.assign(s.entities[id], { slots: { ...slots }, slotsMax: { ...slots } });
  s.entities.wizard.spells.push("darkvision", "remove-curse", "bestow-curse");
  s.entities.cleric.spells.push("remove-curse", "bestow-curse");
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 40;
  return s;
}
const spawn = (s, id, q, r) => { ok(apply(s, { type: "spawn", monster: id, at: { q, r } }, DM)); return Object.values(s.entities).at(-1); };
const dark = (s) => { s.settings.sight = "light"; ok(apply(s, { type: "mapEdit", ops: [{ op: "level", level: { id: "ground", light: "dark" } }] }, DM)); };

test("tiers: Darkvision is auto; its entry lints and reads, and the senses cap is 240", () => {
  assert.equal(SPELLS.darkvision.def.tier, "auto");
  assert.deepEqual(lint(SPELLS.darkvision.def), []);
  assert.deepEqual(readEntry("spell", SPELLS.darkvision.def, {}).problems ?? [], []);
  const m = (value) => lint({ ...SPELLS.darkvision.def, effects: [{ modifier: { on: "senses", op: "set", value, scope: { sense: "darkvision" } } }] });
  assert.deepEqual(m(240), []);
  assert.ok(m(245).length);
});

test("Darkvision: the target sees a creature in the dark out to 150 feet and no further; the effect ends with endEffect", () => {
  const s = field();
  dark(s);
  ok(apply(s, { type: "place", actor: "wizard", to: { q: -14, r: 0 } }, DM));
  const near = spawn(s, "goblin-warrior", 14, 0), far = spawn(s, "goblin-warrior", 17, 0);     // 140 and 155 feet (the wizard stands at -14)
  assert.equal(canSee(s, s.entities.wizard, s.entities[near.id]), "no");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "darkvision", target: "wizard", slot: 2 }, DM));
  const fx = s.effects.find((x) => x.name === "Darkvision");
  assert.ok(fx);
  assert.equal(fx.lasts, "8 hours");
  assert.equal(sensesOf(s, s.entities.wizard).darkvision, 150);
  assert.equal(s.entities.wizard.senses?.darkvision, undefined, "the creature's own senses are not changed");
  assert.notEqual(canSee(s, s.entities.wizard, s.entities[near.id]), "no");
  assert.equal(canSee(s, s.entities.wizard, s.entities[far.id]), "no");
  assert.equal(canSee(s, s.entities.fighter, s.entities[near.id]), "no", "another creature gets nothing");
  ok(apply(s, { type: "endEffect", actor: "wizard", effect: fx.id }, DM));
  assert.equal(canSee(s, s.entities.wizard, s.entities[near.id]), "no");
});

test("Darkvision: a creature's own longer Darkvision wins, and a shorter one is lengthened to 150", () => {
  const s = field();
  s.entities.cleric.senses = { darkvision: 60 };
  s.entities.fighter.senses = { darkvision: 200 };
  for (const [t, q, r] of [["cleric", 1, 0], ["fighter", 0, 1]]) { ok(apply(s, { type: "place", actor: t, to: { q, r } }, DM)); ok(apply(s, { type: "cast", actor: "wizard", spell: "darkvision", target: t, slot: 2 }, DM)); }
  assert.equal(sensesOf(s, s.entities.cleric).darkvision, 150);
  assert.equal(sensesOf(s, s.entities.fighter).darkvision, 200);
});

test("Darkvision: the party's view follows the cast and the end of the effect (no stale cache)", () => {
  const s = field();
  dark(s);
  const g = spawn(s, "goblin-warrior", 6, 0);
  assert.ok(!partyView(s).creatures.has(g.id), "before");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "darkvision", target: "wizard", slot: 2 }, DM));
  assert.ok(partyView(s).creatures.has(g.id), "after the cast");
  ok(apply(s, { type: "endEffect", actor: "wizard", effect: s.effects.find((x) => x.name === "Darkvision").id }, DM));
  assert.ok(!partyView(s).creatures.has(g.id), "after it ends");
});

// ---- Remove Curse ----
const spawnHp = (s, monster, q, r) => { const e = s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 300; return e; };
const near = (s) => { ok(apply(s, { type: "place", actor: "cleric", to: { q: -2, r: 1 } }, DM)); };
const unsaved = (e) => { e.abil.wis = 1; e.saveBonus = { ...(e.saveBonus ?? {}), wis: -20 }; };
const turnOf = (s, id) => { for (let i = 0; i < 60 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); };
// The caster's turn, a new one if it has spent its action on this one.
const cast = (s, by, payload) => {
  turnOf(s, by);
  let r = apply(s, { type: "cast", actor: by, slot: 3, ...payload }, DM);
  if (!r.ok && /already used an action/.test(r.error)) { ok(apply(s, { type: "endTurn", actor: by }, DM)); turnOf(s, by); r = apply(s, { type: "cast", actor: by, slot: 3, ...payload }, DM); }
  return ok(r);
};
const curse = (s, by, e, choice) => cast(s, by, { spell: "bestow-curse", target: e.id, choice });
const cursed = (s, id) => s.effects.filter((fx) => fx.name === "Bestow Curse" && fx.parts.some((p) => !p.ended && p.target === id));
const removeCurse = (s, target) => cast(s, "cleric", { spell: "remove-curse", target });

test("tiers: Remove Curse is assist; the entry lints and reads; `curses` is a cure word", () => {
  assert.equal(SPELLS["remove-curse"].def.tier, "assist");
  assert.deepEqual(lint(SPELLS["remove-curse"].def), []);
  assert.deepEqual(readEntry("spell", SPELLS["remove-curse"].def, {}).problems ?? [], []);
  assert.deepEqual(lint({ ...SPELLS["remove-curse"].def, effects: [{ cure: ["curses", "curses"] }] }).length > 0, true, "a word once");
  assert.deepEqual(lint({ ...SPELLS["remove-curse"].def, effects: [{ cure: ["curses", "poisoned"] }] }), []);
});

test("Remove Curse: every Bestow Curse on the creature ends (two casters), a curse on another creature stays, and the DM is told about the rest", () => {
  const s = field();
  const sk = spawnHp(s, "skeleton", -1, 1), other = spawnHp(s, "skeleton", 1, -1);
  unsaved(sk); unsaved(other); near(s);
  Object.assign(s.entities.fighter, { slots: { 3: 1 }, slotsMax: { 3: 1 } }); s.entities.fighter.spells = ["bestow-curse"];
  ok(apply(s, { type: "place", actor: "fighter", to: { q: 2, r: -1 } }, DM));
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 14 }, DM));
  curse(s, "cleric", sk, "str");
  curse(s, "wizard", sk, "dodge");
  cast(s, "fighter", { spell: "bestow-curse", target: other.id, choice: "attacks" });
  assert.equal(cursed(s, sk.id).length, 2);
  const r = removeCurse(s, sk.id);
  assert.equal(cursed(s, sk.id).length, 0, "both ended");
  assert.equal(cursed(s, other.id).length, 1, "another creature's curse is left alone");
  assert.equal(r.events.filter((e) => e.type === "effectEnd" && e.name === "Bestow Curse").length, 2);
  assert.equal(r.events.filter((e) => e.type === "manual" && /^Remove Curse:/.test(e.text)).length, 1, "the cursed item and other curses are the DM's");
});

test("Remove Curse: the caster's Concentration on a curse ends with it, and a creature with no curse is passed over", () => {
  const s = field();
  const sk = spawnHp(s, "skeleton", -1, 1);
  unsaved(sk); near(s);
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 14 }, DM));
  curse(s, "wizard", sk, "str");
  assert.ok(concentrating(s, "wizard").length, "the wizard concentrates on the curse");
  removeCurse(s, sk.id);
  assert.ok(!concentrating(s, "wizard").length, "and no longer does");
  const r = removeCurse(s, "fighter");
  assert.ok(!r.events.some((e) => e.type === "effectEnd"));
});

test("Greater Restoration's `curse` still ends one curse, the oldest", () => {
  const s = field();
  s.entities.cleric.spells.push("greater-restoration");
  const sk = spawnHp(s, "skeleton", -1, 1);
  unsaved(sk); near(s);
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 14 }, DM));
  curse(s, "cleric", sk, "str");
  curse(s, "wizard", sk, "dodge");
  assert.equal(cursed(s, sk.id).length, 2);
  cast(s, "cleric", { spell: "greater-restoration", target: sk.id, slot: 5, choice: "curse" });
  assert.equal(cursed(s, sk.id).length, 1);
});
