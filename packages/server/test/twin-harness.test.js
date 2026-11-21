// The twin-world harness itself (twin.js): it passes a table that hides what it should, and it names the first difference when
// a table does not.
import assert from "node:assert/strict";
import { test } from "node:test";
import { describe, firstDifference, twin, twinRun } from "./twin.js";

const SCENARIO = {
  setup(w) { w.must({ type: "setting", key: "autoEngage", value: false }); w.state.entities.fighter.owner = w.ids.Pat; },
  steps: [
    { by: "Pat", act: { type: "say", as: "fighter", text: "Hello" } },
    { by: "dm", act: { type: "advanceTime", minutes: 5 } },
    { by: "Sam", act: { type: "move", actor: "fighter", to: { q: 0, r: 0 } } },     // refused: not Sam's
  ],
};
const spawn = (hidden) => (w) => w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 5, r: 3 }, name: "Grishnak", hidden });

test("a hidden creature changes nothing any player is sent", () => {
  twin(SCENARIO, spawn(true));
});

test("a creature in plain sight is told apart, and the report names the player, the message and the path", () => {
  const { diffs } = twinRun(SCENARIO, spawn(false));
  assert.ok(diffs.length > 0, "a visible goblin must make a difference");
  assert.ok(["Pat", "Sam"].includes(diffs[0].who));
  const text = describe(diffs);
  assert.match(text, /first difference: message #\d+/);
  assert.match(text, /path:/);
  assert.throws(() => twin(SCENARIO, spawn(false)), /twin: /);
});

test("a hidden thing may be put in part-way, with a plain counterpart", () => {
  twin(SCENARIO, { at: 1, hide: spawn(true), plain: () => {} });
});

test("firstDifference gives a path", () => {
  assert.deepEqual(firstDifference({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] }), { path: "a[1].b", a: 2, b: 3 });
  assert.equal(firstDifference({ a: 1 }, { a: 1 }), null);
});
