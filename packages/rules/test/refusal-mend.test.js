// Review R3 (#617), round 2: how a refusal puts the game back (engine.js, mend/back), and what the settle phase may not do.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, mend } from "../src/engine.js";
import { RuleError } from "../src/engine/shared.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const json = (x) => JSON.stringify(x);
const copy = (s) => structuredClone({ ...s, timeline: null });

test("mend keeps the identity of what was not replaced, and the JSON is the copy's", () => {
  const s = newGame(5), snap = copy(s), ent = s.entities.fighter, list = ent.cond, before = json(s);
  ent.hp = 1; ent.cond.extra = true; s.seed = 99; s.entities.ghost = { id: "ghost" };
  mend(s, snap);
  assert.equal(json(s), before);
  assert.equal(s.entities.fighter, ent);
  assert.equal(ent.cond, list);
});

test("an object left at two paths (a.pos = b.pos) is restored to each creature's own values", () => {
  const s = newGame(5), snap = copy(s), a = s.entities.fighter, b = s.entities.wizard, before = json(s);
  const pa = { ...a.pos }, pb = { ...b.pos };
  assert.notDeepEqual(pa, pb);
  a.pos = b.pos;                                    // one live object at two paths
  mend(s, snap);
  assert.equal(json(s), before);
  assert.deepEqual(a.pos, pa); assert.deepEqual(b.pos, pb);
  assert.notEqual(a.pos, b.pos);
});

test("a shared array is restored to each owner's own contents", () => {
  const s = newGame(5), a = s.entities.fighter, b = s.entities.wizard;
  a.tags = ["x"]; b.tags = ["y", "z"];
  const snap = copy(s), before = json(s);
  a.tags = b.tags;                                  // shared
  a.tags.push("w");
  mend(s, snap);
  assert.equal(json(s), before);
  assert.deepEqual(a.tags, ["x"]); assert.deepEqual(b.tags, ["y", "z"]);
  assert.notEqual(a.tags, b.tags);
});

test("an own __proto__ key is restored as data and pollutes nothing; a missing timeline key is not added", () => {
  const s = { seed: 1, entities: {} }, snap = copy(s);
  delete snap.timeline;
  s.entities = JSON.parse('{"__proto__": {"x": 1}, "a": 1}');
  snap.entities = JSON.parse('{"a": 1}');
  mend(s, snap);
  assert.equal(json(s), json({ seed: 1, entities: { a: 1 } }));
  assert.equal(Object.hasOwn(s, "timeline"), false);
  const t = { entities: { a: 1 } }, snap2 = { entities: JSON.parse('{"a": 1, "__proto__": {"y": 2}}') };
  mend(t, snap2);
  assert.equal(Object.hasOwn(t.entities, "__proto__"), true);
  assert.equal({}.y, undefined);
  assert.equal(Object.getPrototypeOf(t.entities), Object.prototype);
});

// A RuleError out of the settle phase is no refusal of the action (the handler has run and changed the game). It must not leave that
// half-applied unnoticed: the game goes back byte for byte and the crash is thrown, as for any other throw in that phase.
test("a RuleError thrown in the settle phase restores the game and throws (a crash), never returns half-applied", () => {
  const s = newGame(5);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  const wiz = s.entities.wizard;
  let value = wiz.pos;
  Object.defineProperty(wiz, "pos", { configurable: true, enumerable: true, get() { if (/at gravity \(/.test(new Error().stack)) throw new RuleError("settle refusal"); return value; }, set(v) { value = v; } });
  const before = json(s), tl = s.timeline.length;
  assert.throws(() => apply(s, { type: "setting", key: "autoEngage", value: false }, DM), /settle phase refused.*settle refusal/);
  assert.equal(json(s), before);
  assert.equal(s.timeline.length, tl);
  assert.equal(s.stack, undefined);
});
