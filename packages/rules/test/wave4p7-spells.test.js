// Wave 4, part 7, of issue #786: Greater Restoration (assist; a choice of the affliction it ends).
// Built to docs/specs/rules-expansion.md, "Build notes: wave 4 part 7". Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { AFFLICTIONS, CHOICES, lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const lint = (def) => lintEntry("spells", def, { strict: false });
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", 0, 0], ["fighter", -2, 0], ["rogue", -4, 4], ["cleric", -1, 0]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  const slots = { 1: 4, 2: 3, 3: 3, 4: 3, 5: 4, 6: 2 };
  Object.assign(s.entities.cleric, { slots: { ...slots }, slotsMax: { ...slots } });
  s.entities.cleric.spells.push("greater-restoration", "bestow-curse");
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 300;
  return s;
}
const cast = (s, choice, target = "fighter") => apply(s, { type: "cast", actor: "cleric", spell: "greater-restoration", target, slot: 5, ...(choice ? { choice } : {}) }, DM);
// The engine's own note for an assist spell (the spell's text) is left out: these are the spell's `manual` steps.
const manualsOf = (r) => r.events.filter((e) => e.type === "manual" && /^Greater Restoration \(/.test(e.text)).map((e) => e.text);

test("tier assist; the entry lints and reads; the six afflictions are its choice", () => {
  const d = SPELLS["greater-restoration"].def;
  assert.equal(d.tier, "assist");
  assert.equal(d.costly, true);
  assert.deepEqual(d.choice, { of: "affliction" });
  assert.deepEqual(CHOICES.affliction, AFFLICTIONS);
  assert.deepEqual(lint(d), []);
  const r = readEntry("spell", d, {});
  assert.deepEqual(r.problems ?? [], []);
  assert.match(JSON.stringify(r), /which affliction it ends/);
});

test("lint: ifChoice and the cure words are for the right spells", () => {
  const d = SPELLS["greater-restoration"].def;
  assert.ok(lint({ ...d, choice: undefined }).length, "no choice");
  assert.ok(lint({ ...d, choice: { of: "condition" } }).length, "wrong choice kind");
  assert.ok(lint({ ...d, effects: [{ cure: ["nonsense"] }] }).length);
  assert.ok(lint({ ...d, effects: [{ cure: ["curse"], ifChoice: ["fire"] }] }).length, "a value outside the list");
});

test("a choice is needed, must be one of the six, and a refused cast changes nothing", () => {
  const s = field();
  const before = JSON.stringify(s);
  for (const c of [undefined, "fire", "poisoned", "hit-points"]) assert.equal(cast(s, c).ok, false, String(c));
  assert.equal(JSON.stringify(s), before);
});

test("Exhaustion: one level at a time; the condition ends at level 1", () => {
  const s = field();
  ok(apply(s, { type: "condition", actor: "fighter", condition: "exhaustion", level: 3 }, DM));
  assert.equal(s.entities.fighter.cond.exhaustion.level, 3);
  const r = ok(cast(s, "exhaustion"));
  assert.equal(s.entities.fighter.cond.exhaustion.level, 2);
  assert.deepEqual(manualsOf(r), []);
  ok(cast(s, "exhaustion"));
  assert.equal(s.entities.fighter.cond.exhaustion.level, 1);
  const last = ok(cast(s, "exhaustion"));
  assert.equal(s.entities.fighter.cond.exhaustion, undefined);
  assert.ok(last.events.some((e) => e.type === "condEnd" && e.cond === "exhaustion"));
  assert.equal(s.entities.cleric.slots[5], 1);
  // nothing to end: the slot is still spent, nothing else happens
  ok(cast(s, "exhaustion"));
  assert.equal(s.entities.cleric.slots[5], 0);
});

test("Charmed and Petrified: only the chosen one ends", () => {
  const s = field();
  for (const c of ["charmed", "petrified", "poisoned"]) ok(apply(s, { type: "condition", actor: "fighter", condition: c }, DM));
  ok(cast(s, "charmed"));
  assert.deepEqual(Object.keys(s.entities.fighter.cond).sort(), ["petrified", "poisoned"]);
  ok(cast(s, "petrified"));
  assert.deepEqual(Object.keys(s.entities.fighter.cond), ["poisoned"]);
});

const spawn = (s, monster, q, r) => { const e = s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 300; return e; };
const unsaved = (e) => { e.abil.wis = 1; e.saveBonus = { ...(e.saveBonus ?? {}), wis: -20 }; };
const curseOn = (s, e, choice) => ok(apply(s, { type: "cast", actor: "cleric", spell: "bestow-curse", target: e.id, slot: 3, choice }, DM));
const cursedNow = (s, id) => s.effects.some((fx) => fx.name === "Bestow Curse" && fx.parts.some((p) => !p.ended && p.target === id));
const turnOfCleric = (s) => { for (let i = 0; i < 60 && current(s) !== "cleric"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); };
function inFight(s) { ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 14 }, DM)); turnOfCleric(s); }
const nextTurn = (s) => { ok(apply(s, { type: "endTurn", actor: "cleric" }, DM)); turnOfCleric(s); };

test("a curse: Bestow Curse on the creature ends whole, and the engine hands the rest to the DM", () => {
  const s = field();
  const sk = spawn(s, "skeleton", -1, 1);
  unsaved(sk);
  inFight(s);
  curseOn(s, sk, "str");
  assert.ok(cursedNow(s, sk.id));
  nextTurn(s);
  const r = ok(cast(s, "curse", sk.id));
  assert.equal(s.effects.some((fx) => fx.name === "Bestow Curse"), false);
  assert.ok(r.events.some((e) => e.type === "effectEnd" && e.name === "Bestow Curse"));
  const m = manualsOf(r);
  assert.equal(m.length, 1);
  assert.match(m[0], /cursed magic item/);
});

test("a curse on another creature is left alone", () => {
  const s = field();
  const sk = spawn(s, "skeleton", -1, 1);
  unsaved(sk);
  inFight(s);
  curseOn(s, sk, "dodge");
  nextTurn(s);
  ok(cast(s, "curse", "fighter"));
  assert.ok(cursedNow(s, sk.id));
});

test("ability score and Hit Point maximum: the engine ends nothing and tells the DM, naming only that option", () => {
  for (const [c, re, other] of [["ability-score", /ability score/, /Hit Point maximum/], ["hit-point-maximum", /Hit Point maximum/, /ability score/]]) {
    const s = field();
    ok(apply(s, { type: "condition", actor: "fighter", condition: "charmed" }, DM));
    const before = JSON.stringify(s.entities.fighter);
    const r = ok(cast(s, c));
    assert.equal(JSON.stringify(s.entities.fighter), before, c);
    const m = manualsOf(r);
    assert.equal(m.length, 1);
    assert.match(m[0], re);
    assert.doesNotMatch(m[0], other);
  }
});

test("another creature's curse choice does not leak steps: Lesser Restoration still takes its own choice", () => {
  const d = SPELLS["lesser-restoration"].def;
  assert.deepEqual(lint(d), []);
  assert.deepEqual(SPELLS["bestow-curse"].def.choice, { of: "curse" });
});
