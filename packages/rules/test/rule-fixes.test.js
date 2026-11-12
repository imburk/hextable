// Rules the engine got wrong (docs/DEBT.md, W1 to W9), each checked against the SRD 5.2 text.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };

// ---------- W1: Long Rest ----------

test("W1: a Long Rest restores Hit Points, slots and features, and lowers Exhaustion by one level", () => {
  const s = newGame(3), { fighter, wizard } = s.entities;
  fighter.hp = 3; fighter.uses.secondWind = 0;
  wizard.slots[1] = 0;
  ok(apply(s, { type: "condition", actor: "fighter", condition: "exhaustion", level: 3 }, DM));
  ok(apply(s, { type: "condition", actor: "wizard", condition: "exhaustion", level: 1 }, DM));
  ok(apply(s, { type: "rest" }, DM));
  assert.equal(fighter.hp, fighter.maxHp);
  assert.equal(fighter.uses.secondWind, fighter.features.secondWind);
  assert.deepEqual(wizard.slots, wizard.slotsMax);
  assert.equal(fighter.cond.exhaustion.level, 2);
  assert.equal(wizard.cond.exhaustion, undefined);
});

test("W1: a Long Rest does not end other conditions", () => {
  const s = newGame(3);
  ok(apply(s, { type: "condition", actor: "rogue", condition: "poisoned" }, DM));
  ok(apply(s, { type: "rest" }, DM));
  assert.ok(s.entities.rogue.cond.poisoned);
});

test("W1: the dead stay dead, and a creature at 0 Hit Points can't take a Long Rest", () => {
  const s = newGame(3), { fighter, rogue, cleric } = s.entities;
  fighter.dead = true; fighter.hp = 0;
  Object.assign(rogue, { hp: 0, cond: { unconscious: {}, prone: {}, stable: {} }, death: { s: 0, f: 0 } });
  Object.assign(cleric, { hp: 0, cond: { unconscious: {}, prone: {} }, death: { s: 1, f: 1 } });
  cleric.slots[1] = 0;
  const r = ok(apply(s, { type: "rest" }, DM));
  assert.equal(fighter.dead, true);
  assert.equal(fighter.hp, 0);
  assert.equal(rogue.hp, 1);                                    // Stable: 1 Hit Point after 1d4 hours, nothing more
  assert.equal(cleric.hp, 0);                                   // dying: left to the DM
  assert.equal(cleric.slots[1], 0);
  assert.ok(r.events.some((e) => e.type === "manual" && e.actor === "cleric"));
});
