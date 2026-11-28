// Manual spells B1 (#899): Raise Dead, Resurrection and True Resurrection are `revive` steps with their own limits, and the first two leave a penalty of -4
// on D20 Tests that shrinks by 1 at each Long Rest. docs/specs/rules-expansion.md, "Build notes: manual spells B1". Numbers: reference/srd52/srd52-flow.txt.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { derive } from "../src/derive.js";
import { apply, makeEntity } from "../src/engine.js";
import { modifiers } from "../src/modifiers.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
const DAY = 1440, YEAR = 365 * DAY;
const cleric = { name: "Pia", class: "cleric", level: 17, subclass: "life", abilities: { str: 10, dex: 10, con: 14, int: 10, wis: 20, cha: 10 }, skills: ["insight", "medicine"],
  spells: ["raise-dead", "resurrection", "true-resurrection", "bless"] };

function table(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (id !== "fighter") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  s.entities.pia = makeEntity(derive(cleric).record, { id: "pia", kind: "pc", side: "party", owner: "pat", ownerName: "Pat", pos: { q: 0, r: 0, z: 0 } });
  s.entities.pia.sheet = structuredClone(cleric);
  s.entities.fighter.pos = { q: 1, r: 0, z: 0 };
  return s;
}
const slain = (s, id) => { ok(apply(s, { type: "harm", actor: id, amount: 9999, dtype: "necrotic" }, DM)); assert.equal(s.entities[id].dead, true); };
const cast = (s, spell) => apply(s, { type: "cast", actor: "pia", spell, target: "fighter" }, DM);
const d20 = (s, id) => ["attack.roll", "check", "save", "initiative"].map((h) => modifiers(s, s.entities[id], h, { target: s.entities[id] }, "").add);
const dead = (s, time) => { s.clock = 100; slain(s, "fighter"); s.clock = 100 + time; };

test("the entries: revive steps with their own limits, assist, and the linter holds them", () => {
  const want = { "raise-dead": [1, 10, "day"], resurrection: ["max", 100, "year"], "true-resurrection": ["max", 200, "year"] };
  for (const [id, [hp, within, unit]] of Object.entries(want)) {
    const def = SPELLS[id].def;
    assert.deepEqual(def.effects[0], { revive: hp, within, unit }, id);
    assert.equal(def.tier, "assist"); assert.equal(def.checked, true); assert.equal(def.target.creature.dead, true);
    assert.deepEqual(lintEntry("spells", def, { strict: false }), [], id);
  }
  assert.deepEqual(SPELLS["raise-dead"].def.effects[2], { modifier: { on: "d20", op: "add", value: -4, fades: "longRest" } });
  assert.deepEqual(SPELLS.resurrection.def.effects[2], SPELLS["raise-dead"].def.effects[2]);
  assert.ok(!JSON.stringify(SPELLS["true-resurrection"].def.effects).includes("fades"), "True Resurrection has no penalty in the SRD text");
  assert.deepEqual(SPELLS["true-resurrection"].def.effects[1], { cure: ["poisoned", "curses"] });
  const lint = (patch) => lintEntry("spells", { ...structuredClone(SPELLS.resurrection.def), ...patch }, { strict: false });
  for (const bad of [{ revive: "all", within: 1 }, { revive: "max", within: 1, unit: "week" }, { revive: "max", within: 366, unit: "day" }, { revive: "max", within: 501, unit: "year" }, { revive: "max", within: 1441 }]) assert.ok(lint({ effects: [bad] }).length, json(bad));
  assert.deepEqual(lint({ effects: [{ revive: "max", within: 1440 }] }).filter((p) => /revive/.test(p)), []);
  // A fade needs a number to add, and is not for onFail dice.
  const mod = (m) => lint({ effects: [SPELLS.resurrection.def.effects[0], { modifier: m }] });
  assert.deepEqual(mod({ on: "d20", op: "add", value: -4, fades: "longRest" }), []);
  for (const bad of [{ on: "d20", op: "add", value: -4, fades: "shortRest" }, { on: "d20", op: "set", value: -4, fades: "longRest" }, { on: "d20", op: "add", value: "1d4", fades: "longRest" }, { on: "d20", op: "add", value: 0, fades: "longRest" }, { on: "d20", op: "advantage" }]) assert.ok(mod(bad).length, json(bad));
});

test("Raise Dead on a body dead for longer than the old limit and shorter than its own: it works", () => {
  const s = table(); dead(s, 5 * DAY);
  const slots = s.entities.pia.slots[5];
  const r = ok(cast(s, "raise-dead"));
  const f = s.entities.fighter;
  assert.deepEqual([f.dead, f.hp, f.diedAt], [false, 1, undefined]);
  assert.equal(s.entities.pia.slots[5], slots - 1);
  assert.ok(r.events.some((e) => e.type === "note" && e.text === "Raise Dead: Brenna returns to life"));
  assert.deepEqual(d20(s, "fighter"), [-4, -4, -4, -4]);
});

test("Raise Dead on a body dead for longer than 10 days: nothing happens to it, and the state is compared whole", () => {
  const s = table(); dead(s, 10 * DAY + 5);
  const before = structuredClone(s);
  const r = ok(cast(s, "raise-dead"));
  assert.ok(r.events.some((e) => e.type === "note" && /more than 10 days ago/.test(e.text)));
  // The slot is spent, the clock may move with the casting time and the DM gets a card for the manual step; everything else is as it was.
  const norm = (x) => { const y = structuredClone(x); delete y.clock; delete y.seq; delete y.log; delete y.timeline; delete y.todo; delete y.history; delete y.undo; delete y.redo; if (!y.effects?.length) delete y.effects; delete y.entities.pia.slots; delete y.entities.pia.spent; delete y.entities.pia.concentrating; return y; };
  const a = norm(before), b = norm(s);
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (json(a[k]) !== json(b[k])) assert.fail(`differs at ${k}`);
  assert.equal(s.entities.fighter.dead, true);
  assert.equal(s.entities.pia.slots[5], before.entities.pia.slots[5] - 1);
  assert.equal((s.effects ?? []).length, 0);
});

test("Resurrection: a century, all its Hit Points, a penalty; True Resurrection: two centuries, all its Hit Points, none", () => {
  const s = table(); dead(s, 99 * YEAR);
  ok(cast(s, "resurrection"));
  const f = s.entities.fighter;
  assert.deepEqual([f.dead, f.hp === f.maxHp, f.maxHp > 1], [false, true, true]);
  assert.deepEqual(d20(s, "fighter"), [-4, -4, -4, -4]);
  const t = table(); dead(t, 101 * YEAR);
  ok(cast(t, "resurrection"));
  assert.equal(t.entities.fighter.dead, true, "101 years is past a century");
  const u = table(); dead(u, 199 * YEAR);
  ok(cast(u, "true-resurrection"));
  assert.deepEqual([u.entities.fighter.dead, u.entities.fighter.hp === u.entities.fighter.maxHp], [false, true]);
  assert.deepEqual(d20(u, "fighter"), [0, 0, 0, 0]);
  const v = table(); dead(v, 201 * YEAR);
  ok(cast(v, "true-resurrection"));
  assert.equal(v.entities.fighter.dead, true);
});

test("the revival ends Poisoned", () => {
  const s = table(); dead(s, 3 * DAY);
  s.entities.fighter.cond.poisoned = {};
  ok(cast(s, "raise-dead"));
  assert.equal(s.entities.fighter.cond.poisoned, undefined);
});

test("the penalty: -4, up by 1 at each Long Rest the creature finishes, gone at 0", () => {
  const s = table(); dead(s, DAY);
  ok(cast(s, "raise-dead"));
  const seen = [];
  for (let i = 0; i < 5; i++) {
    seen.push(d20(s, "fighter")[1]);
    ok(apply(s, { type: "rest" }, DM));
  }
  assert.deepEqual(seen, [-4, -3, -2, -1, 0]);
  assert.equal((s.effects ?? []).length, 0, "nothing is left of the effect at 0");
  // It does apply to an actual check, an attack and a save: the number is in the roll's bonus.
  const t = table(); dead(t, DAY);
  const bonus = () => modifiers(t, t.entities.fighter, "save", { target: t.entities.fighter, ability: "wis" }, "").add;
  const b0 = bonus();
  ok(cast(t, "raise-dead"));
  assert.equal(bonus(), b0 - 4);
});

test("a creature that did not finish the Long Rest keeps its penalty", () => {
  const s = table(); dead(s, DAY);
  ok(cast(s, "raise-dead"));
  ok(apply(s, { type: "rest", ids: ["pia"] }, DM));
  assert.equal(d20(s, "fighter")[1], -4);
});
