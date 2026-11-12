import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import { apply, current, moveOptions } from "../src/engine.js";
import * as H from "../src/hex.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const bytes = (s) => JSON.stringify(s);

// Take an action and record it, as the server and the solo transport do.
function act(s, h, action, ctx = DM) {
  const before = mark(s);
  const res = apply(s, action, ctx);
  assert.ok(res.ok, `${action.type}: ${res.error}`);
  h.record(before, s, describeStep(action, res.events, before, s));
  return res;
}
const freeHex = (s, id) => H.parse([...moveOptions(s, s.entities[id])].find(([, v]) => v.canStop)[0]);
// The fighter beside the first goblin, with no fight starting on its own.
function besideGoblin(s, h) {
  act(s, h, { type: "setting", key: "autoEngage", value: false });
  const g = s.entities.m1.pos;
  const spot = H.neighbors(g).find((n) => apply(structuredClone(s), { type: "place", actor: "fighter", to: n }, DM).ok);
  act(s, h, { type: "place", actor: "fighter", to: spot });
}

test("undo then redo gives back byte-identical states, dice seed, clock and timeline included", () => {
  const s = newGame(5), h = createHistory();
  const start = bytes(s);
  act(s, h, { type: "move", actor: "fighter", to: freeHex(s, "fighter") });
  act(s, h, { type: "advanceTime", minutes: 10 });
  act(s, h, { type: "chronicle", title: "The party sets out" });
  besideGoblin(s, h);
  act(s, h, { type: "attack", actor: "fighter", target: "m1", attack: "longsword" });
  const end = bytes(s);
  assert.notEqual(end, start);

  const n = h.list().length;
  for (let i = 0; i < n; i++) assert.ok(h.undo(s));
  assert.equal(bytes(s), start);
  assert.equal(h.undo(s), null);
  assert.deepEqual(h.list(), []);
  for (let i = 0; i < n; i++) assert.ok(h.redo(s));
  assert.equal(bytes(s), end);
  assert.equal(h.redo(s), null);
});

test("the dice seed comes back: the same action taken again rolls the same, and redo is identical", () => {
  const s = newGame(9), h = createHistory();
  besideGoblin(s, h);
  const swing = { type: "attack", actor: "fighter", target: "m1", attack: "longsword" };
  const first = act(s, h, swing).events, after = bytes(s);
  const rng = s.rng;

  const { label } = h.undo(s);
  assert.equal(label, `${s.entities.fighter.name} attacked ${s.entities.m1.name}`);
  assert.notEqual(s.rng, rng);
  h.redo(s);
  assert.equal(bytes(s), after, "redo does not re-roll");

  h.undo(s);
  const again = act(s, h, swing).events;
  assert.deepEqual(again, first);
  assert.equal(bytes(s), after);
});

test("a whole fight played by the AI can be undone back to the start and redone to the end", () => {
  const s = newGame(3), h = createHistory({ limit: 10000, maxBytes: Infinity });
  const start = bytes(s);
  act(s, h, { type: "startEncounter", center: s.entities.m1.pos, radius: 30 });
  for (let i = 0; i < 400 && s.encounter; i++) {
    const id = current(s), action = aiStep(s, id) ?? { type: "endTurn", actor: id };
    const before = mark(s);
    let res = apply(s, action, DM), done = action;
    if (!res.ok) { done = { type: "endTurn", actor: id }; res = apply(s, done, DM); }
    h.record(before, s, describeStep(done, res.events, before, s));
  }
  const end = bytes(s), n = h.list().length;
  assert.ok(n > 10);
  while (h.undo(s));
  assert.equal(bytes(s), start);
  assert.equal(h.listRedo().length, n);
  while (h.redo(s));
  assert.equal(bytes(s), end);
});

test("the oldest step is dropped past the limit, and a new action clears what could be redone", () => {
  const s = newGame(5), h = createHistory({ limit: 3 });
  for (const m of [10, 20, 30, 40, 50]) act(s, h, { type: "advanceTime", minutes: m });
  assert.deepEqual(h.list(), ["50 minutes passed", "40 minutes passed", "30 minutes passed"]);
  const clock = s.clock;
  while (h.undo(s));
  assert.equal(s.clock, clock - 120, "only the last three came back");
  assert.equal(h.listRedo().length, 3);
  h.redo(s);
  act(s, h, { type: "rest" });
  assert.deepEqual(h.listRedo(), []);
  assert.deepEqual(h.list(), ["The long rest", "30 minutes passed"]);
});

test("a byte budget also drops the oldest steps", () => {
  const s = newGame(5), h = createHistory({ maxBytes: 2000 });
  for (let i = 0; i < 20; i++) act(s, h, { type: "chronicle", title: `Entry ${i} ${"x".repeat(60)}` });
  assert.ok(h.bytes <= 2000);
  assert.ok(h.list().length < 20 && h.list().length > 0);
  assert.match(h.list()[0], /Entry 19/);
});

test("undo takes back the timeline entries the action added, and nothing else", () => {
  const s = newGame(5), h = createHistory();
  const n = s.timeline.length;
  act(s, h, { type: "advanceTime", minutes: 60 });
  assert.equal(s.timeline.length, n + 1);
  // A seat changes hands in between: not undoable, and not taken back by undoing something else.
  apply(s, { type: "claim", entity: "rogue", user: "u1", userName: "Pat" }, DM);
  h.undo(s);
  assert.equal(s.timeline.length, n + 1);
  assert.equal(s.timeline.at(-1).type, "claimed");
  assert.equal(s.entities.rogue.owner, "u1");
  h.redo(s);
  assert.deepEqual(s.timeline.slice(-2).map((e) => e.type), ["time", "claimed"]);
});

test("steps are named in plain words; players are told only of steps they could see", () => {
  const s = newGame(5), h = createHistory();
  const names = () => h.list()[0];
  act(s, h, { type: "move", actor: "fighter", to: freeHex(s, "fighter") });
  assert.equal(names(), `${s.entities.fighter.name} moved`);
  act(s, h, { type: "mapEdit", ops: [{ op: "tile", level: "ground", at: { q: 0, r: 0 }, tile: { t: "stone" } }] });
  assert.equal(names(), "The map was edited");

  const step = (action) => { const before = mark(s), res = apply(s, action, DM); assert.ok(res.ok, res.error); return describeStep(action, res.events, before, s); };
  const spot = H.range({ q: 0, r: 0 }, 3).find((x) => apply(structuredClone(s), { type: "spawn", monster: "wolf", at: x }, DM).ok);
  const hidden = step({ type: "spawn", monster: "wolf", at: spot, hidden: true, name: "Greyjaw" });
  assert.deepEqual(hidden, { label: "Greyjaw was added", shown: null });
  const seen = step({ type: "advanceTime", minutes: 10 });
  assert.deepEqual(seen, { label: "10 minutes passed", shown: "10 minutes passed" });
});
