// The DM's `harm` and `mend` (DEBT S10): damage and healing by the rules, not by setting Hit Points.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const PLAYER = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
function field() {
  const s = newGame(5);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  s.encounter = null; s.settings.autoEngage = false;
  return s;
}

test("harm spends Temporary Hit Points first and respects Resistance", () => {
  const s = field(), f = s.entities.fighter;
  f.hp = f.maxHp = 30; f.tempHp = 5;
  const r = ok(apply(s, { type: "harm", actor: "fighter", amount: 8 }, DM));
  assert.deepEqual([f.tempHp, f.hp], [0, 27]);
  assert.equal(r.events.find((e) => e.type === "damage").temp, 5);
  f.resist = ["fire"];
  ok(apply(s, { type: "harm", actor: "fighter", amount: 10, dtype: "fire" }, DM));
  assert.equal(f.hp, 22, "Resistance halves it");
});

test("harm on a creature at 0 Hit Points is a failed death save; as much as the maximum kills", () => {
  const s = field(), r = s.entities.rogue;
  ok(apply(s, { type: "harm", actor: "rogue", amount: r.maxHp }, DM));       // instant: exactly the maximum from full is not massive damage
  assert.equal(r.hp, 0);
  assert.ok(r.cond.unconscious);
  ok(apply(s, { type: "harm", actor: "rogue", amount: 1 }, DM));
  assert.equal(r.death.f, 1);
  ok(apply(s, { type: "harm", actor: "rogue", amount: r.maxHp }, DM));
  assert.ok(r.dead);
  assert.match(apply(s, { type: "harm", actor: "rogue", amount: 1 }, DM).error, /dead/);
});

test("harm tests Concentration", () => {
  const s = field(), c = s.entities.cleric;
  Object.assign(c, { slots: { 1: 4 }, slotsMax: { 1: 4 }, hp: 30, maxHp: 30 });
  c.spells.push("shield-of-faith");
  ok(apply(s, { type: "cast", actor: "cleric", spell: "shield-of-faith", target: "fighter" }, DM));
  const r = ok(apply(s, { type: "harm", actor: "cleric", amount: 4 }, DM));
  assert.ok(r.events.some((e) => e.type === "concentration"));
});

test("mend heals, wakes a creature at 0, and does not raise the dead", () => {
  const s = field(), r = s.entities.rogue;
  r.hp = 3;
  ok(apply(s, { type: "mend", actor: "rogue", amount: 100 }, DM));
  assert.equal(r.hp, r.maxHp);
  ok(apply(s, { type: "harm", actor: "rogue", amount: r.maxHp }, DM));
  ok(apply(s, { type: "mend", actor: "rogue", amount: 2 }, DM));
  assert.deepEqual([r.hp, !!r.cond.unconscious], [2, false]);
  r.dead = true;
  assert.match(apply(s, { type: "mend", actor: "rogue", amount: 2 }, DM).error, /dead/);
});

test("harm and mend are the DM's, and take a positive whole number", () => {
  const s = field();
  assert.equal(apply(s, { type: "harm", actor: "fighter", amount: 1 }, PLAYER).ok, false);
  assert.equal(apply(s, { type: "mend", actor: "fighter", amount: 1 }, PLAYER).ok, false);
  for (const amount of [0, -3, 2.5, "4", undefined]) assert.equal(apply(s, { type: "harm", actor: "fighter", amount }, DM).ok, false);
  assert.equal(apply(s, { type: "mend", actor: "fighter", amount: 0 }, DM).ok, false);
});
