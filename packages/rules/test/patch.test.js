import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPatch, createReceiver, diff, snapshot } from "../src/patch.js";

const base = () => ({ clock: 480, settings: { autoEngage: true }, encounter: null, entities: { a: { id: "a", hp: 5, pos: { q: 0, r: 0 } }, b: { id: "b", hp: 9 } } });
const roundTrip = (from, to) => {
  const patch = JSON.parse(JSON.stringify(diff(snapshot(from), snapshot(to), to)));
  return { patch, result: applyPatch(structuredClone(from), patch) };
};

test("no change is an empty patch", () => {
  assert.deepEqual(roundTrip(base(), base()).patch, {});
});

test("a patch carries only what changed and rebuilds the new state exactly", () => {
  const to = base();
  to.clock = 490; to.entities.a.pos.q = 3; delete to.entities.b; to.entities.c = { id: "c", hp: 1 };
  to.encounter = { round: 1, order: [{ id: "a" }] };
  const { patch, result } = roundTrip(base(), to);
  assert.deepEqual(Object.keys(patch).sort(), ["clock", "encounter", "entities"]);
  assert.deepEqual(patch.entities, { a: to.entities.a, b: null, c: to.entities.c });
  assert.deepEqual(result, to);
});

test("a fight ending, a field vanishing and a field appearing all survive the trip", () => {
  const from = base(); from.encounter = { round: 4 }; from.rng = 12345;
  const to = base(); to.extra = [1, 2];
  const { patch, result } = roundTrip(from, to);
  assert.equal(patch.encounter, null);
  assert.deepEqual(patch.gone, ["rng"]);
  assert.deepEqual(result, to);
  assert.equal("rng" in result, false);
});

test("the receiver applies patches in order and asks once for a sync when one is missing", () => {
  let asked = 0;
  const r = createReceiver(() => asked++);
  assert.equal(r.receive({ seq: 4, patch: { clock: 1 } }), null);               // a patch with nothing to apply it to
  assert.equal(asked, 1);
  assert.deepEqual(r.receive({ seq: 7, state: base(), events: [] }).state, base());

  const u = r.receive({ seq: 8, patch: { clock: 500 }, events: [{ type: "time" }] });
  assert.equal(u.state.clock, 500);
  assert.deepEqual(u.events, [{ type: "time" }]);

  assert.equal(r.receive({ seq: 10, patch: { clock: 520 } }), null);             // 9 went missing
  assert.equal(r.receive({ seq: 11, patch: { clock: 530 } }), null);             // still waiting: no second request
  assert.equal(asked, 2);
  assert.equal(r.state.clock, 500);

  const full = base(); full.clock = 530;
  assert.equal(r.receive({ seq: 11, state: full, events: [] }).state.clock, 530);
  assert.equal(r.receive({ seq: 12, patch: { clock: 540 } }).state.clock, 540);
  assert.equal(r.receive({ seq: 12, patch: { clock: 999 } }), null);             // a repeat is not applied
  assert.equal(asked, 3);
});

test("during a fight only the fields that moved are sent, not the locked hexes again", () => {
  const arena = Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`${i},0`, 1]));
  const from = base(); from.encounter = { id: 11, round: 1, turn: 0, arena, budget: { move: 30, action: 1, bonus: 1 }, order: [{ id: "a" }, { id: "b" }] };
  const to = structuredClone(from); to.encounter.turn = 1; to.encounter.budget.move = 10;
  const { patch, result } = roundTrip(from, to);
  assert.deepEqual(patch, { within: { encounter: { turn: 1, budget: { move: 10, action: 1, bonus: 1 } } } });
  assert.deepEqual(result, to);

  // A different fight is sent whole, as is one starting or ending.
  const other = structuredClone(to); other.encounter.id = 12;
  assert.equal(roundTrip(to, other).patch.encounter.id, 12);
  assert.deepEqual(roundTrip(to, other).result, other);
  assert.equal(roundTrip(to, base()).patch.encounter, null);
  assert.deepEqual(roundTrip(base(), to).result, to);
});
