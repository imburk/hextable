import assert from "node:assert/strict";
import { test } from "node:test";
import { createRng, rollDie } from "./rng.ts";

test("the same seed gives the same rolls", () => {
  const a = createRng(42);
  const b = createRng(42);
  const rollsA = Array.from({ length: 50 }, () => rollDie(a, 20));
  const rollsB = Array.from({ length: 50 }, () => rollDie(b, 20));
  assert.deepEqual(rollsA, rollsB);
});

test("different seeds give different rolls", () => {
  const a = createRng(1);
  const b = createRng(2);
  const rollsA = Array.from({ length: 50 }, () => rollDie(a, 20));
  const rollsB = Array.from({ length: 50 }, () => rollDie(b, 20));
  assert.notDeepEqual(rollsA, rollsB);
});

test("a d20 stays within 1 to 20 and reaches both ends", () => {
  const rng = createRng(7);
  const rolls = Array.from({ length: 5000 }, () => rollDie(rng, 20));
  assert.equal(Math.min(...rolls), 1);
  assert.equal(Math.max(...rolls), 20);
});

test("a die with no sides is rejected", () => {
  assert.throws(() => rollDie(createRng(1), 0), RangeError);
  assert.throws(() => rollDie(createRng(1), 2.5), RangeError);
});
