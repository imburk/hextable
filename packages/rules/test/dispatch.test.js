import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTION_TYPES, apply, buildHandlers } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

// The names every object has, a type that is not a string, and no type at all: none is an action.
const NOT_ACTIONS = [
  "toString", "constructor", "valueOf", "__proto__", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable",
  "toLocaleString", "__defineGetter__", "__lookupGetter__", "nonsense", "",
  5, null, undefined, true, ["move"], { move: 1 }, { toString: 1 },
];

test("an action type that is not in the table is refused as unknown, and changes nothing", () => {
  const unknown = apply(newGame(5), { type: "nonsense" }, { role: "dm" });
  assert.equal(unknown.ok, false);
  for (const role of ["dm", "player"]) {
    for (const type of NOT_ACTIONS) {
      const s = newGame(5), before = JSON.stringify(s);
      const r = apply(s, { type, actor: "fighter" }, { role, userId: "u1" });
      assert.equal(r.ok, false, `${typeof type}:${JSON.stringify(type)} (${role})`);
      assert.match(r.error, /^Unknown action: /);
      assert.deepEqual(r.events, []);
      assert.deepEqual(Object.keys(r).sort(), Object.keys(unknown).sort(), "the same shape as any unknown action");
      assert.equal(JSON.stringify(s), before, `${typeof type}:${JSON.stringify(type)} (${role}) changed the state`);
    }
  }
});

test("an action with no type, or no action, is refused and changes nothing", () => {
  for (const action of [{}, { actor: "fighter" }, null, undefined, "move", 5, []]) {
    const s = newGame(5), before = JSON.stringify(s);
    const r = apply(s, action, { role: "dm" });
    assert.equal(r.ok, false);
    assert.match(r.error, /^Unknown action: /);
    assert.equal(JSON.stringify(s), before);
  }
});

test("the unknown-action message for a plain name is unchanged", () => {
  assert.equal(apply(newGame(5), { type: "toString" }).error, "Unknown action: toString");
  assert.equal(apply(newGame(5), { type: "nonsense" }).error, "Unknown action: nonsense");
});

test("a real action still runs, and ACTION_TYPES lists exactly the handled types", () => {
  assert.equal(apply(newGame(5), { type: "rest" }).ok, true);
  assert.equal(new Set(ACTION_TYPES).size, ACTION_TYPES.length);
  assert.ok(ACTION_TYPES.includes("react") && ACTION_TYPES.includes("move"));
  for (const bad of ["toString", "constructor", "__proto__", "hasOwnProperty"]) assert.ok(!ACTION_TYPES.includes(bad));
});

test("two modules defining one action type fail at load, naming both", () => {
  const f = () => {};
  assert.throws(() => buildHandlers([{ move: f, a: f }, { b: f, move: f }], ["movement", "attacks"]), /"move".*movement.*attacks/);
  const t = buildHandlers([{ a: f }, { b: f }], ["x", "y"]);
  assert.deepEqual([...t.keys()], ["a", "b"]);
  assert.equal(t.get("toString"), undefined);
});
