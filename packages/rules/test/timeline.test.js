import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { newGame } from "../src/scenario.js";
import { capTimeline, TIMELINE_CAP } from "../src/timeline.js";

const DM = { role: "dm", userId: "dm" };
const json = (s) => JSON.stringify(s);

// What the table server and the solo transport do for each action.
function play(s, h, action, cap) {
  const before = mark(s);
  const res = apply(s, action, DM);
  assert.ok(res.ok, `${action.type}: ${res.error}`);
  const dropped = capTimeline(s.timeline, cap);
  h.record(before, s, describeStep(action, res.events, before, s), dropped);
  return dropped;
}
// A mixed run: rolls (a timeline entry each), a chronicle now and then, time passing.
const script = (n) => Array.from({ length: n }, (_, i) =>
  i % 7 === 3 ? { type: "chronicle", title: `Event ${i}` }
    : i % 5 === 0 ? { type: "advanceTime", minutes: 10 }
      : { type: "check", actor: ["fighter", "rogue", "cleric", "wizard"][i % 4], skill: "athletics" });
const chron = (s) => s.timeline.filter((e) => e.type === "chronicle");
const others = (s) => s.timeline.filter((e) => e.type !== "chronicle");

test("the default cap is 5000", () => assert.equal(TIMELINE_CAP, 5000));

test("capTimeline keeps every chronicle entry and the newest others, in order", () => {
  const t = [{ type: "a", n: 1 }, { type: "chronicle", n: 2 }, { type: "a", n: 3 }, { type: "b", n: 4 }, { type: "chronicle", n: 5 }, { type: "a", n: 6 }];
  const dropped = capTimeline(t, 2);
  assert.deepEqual(t.map((e) => e.n), [2, 4, 5, 6]);
  assert.deepEqual(dropped.map((d) => [d.i, d.e.n]), [[0, 1], [2, 3]]);
  assert.deepEqual(capTimeline(t, 2), [], "at the cap nothing more goes");
  assert.deepEqual(capTimeline(t, 0).map((d) => d.e.n), [4, 6]);
  assert.deepEqual(t.map((e) => e.n), [2, 5], "with a cap of 0 only chronicle entries remain");
  assert.deepEqual(capTimeline(undefined, 3), []);
});

test("the cap holds while a game is played, chronicle entries all survive", () => {
  const s = newGame(7), h = createHistory(), cap = 12;
  const all = [];
  for (const a of script(120)) {
    play(s, h, a, cap);
    if (a.type === "chronicle") all.push(a.title);
    assert.ok(others(s).length <= cap);
  }
  const wrote = chron(s).map((e) => e.title).filter((t) => t.startsWith("Event"));
  assert.deepEqual(wrote, all, "every chronicle entry is still there, in order");
});

test("undo and redo across the cap boundary give back exactly the same game", () => {
  const s = newGame(11), h = createHistory(), cap = 9;
  for (const a of script(40)) play(s, h, a, cap);              // well past the cap before we start looking
  const snaps = [json(s)];
  for (const a of script(25).map((a, i) => (i % 6 === 0 ? { type: "chronicle", title: `Late ${i}` } : a))) {
    play(s, h, a, cap);
    snaps.push(json(s));
  }
  assert.ok(others(s).length <= cap);
  // Back through every recorded step: each undo is the game as it was, dropped entries and all.
  for (let i = snaps.length - 2; i >= Math.max(0, snaps.length - 1 - 25); i--) {
    assert.ok(h.undo(s));
    assert.equal(json(s), snaps[i], `undo to step ${i}`);
  }
  for (let i = 1; i < snaps.length && h.listRedo().length; i++) {
    assert.ok(h.redo(s));
    assert.equal(json(s), snaps[i], `redo to step ${i}`);
  }
});

test("undo works when older steps were recorded before later steps dropped entries", () => {
  const s = newGame(3), h = createHistory(), cap = 4;
  for (const a of script(30)) play(s, h, a, cap);
  const at = json(s);
  play(s, h, { type: "chronicle", title: "x" }, cap);
  play(s, h, { type: "check", actor: "fighter", skill: "athletics" }, cap);
  h.undo(s); h.undo(s);
  assert.equal(json(s), at);
  h.redo(s); h.redo(s); h.undo(s); h.undo(s);
  assert.equal(json(s), at);
});

test("a game replayed from its seed is the same game; only the timeline is shorter", () => {
  const acts = script(150), cap = 10;
  const full = newGame(99), capped = newGame(99), h = createHistory();
  for (const a of acts) { assert.ok(apply(full, a, DM).ok); play(capped, h, a, cap); }
  const strip = (s) => json({ ...s, timeline: null });
  assert.equal(strip(capped), strip(full), "same dice, same state");
  // The capped timeline is the full one with the oldest non-chronicle entries removed.
  const want = [], keep = full.timeline.filter((e) => e.type !== "chronicle").slice(-cap);
  for (const e of full.timeline) if (e.type === "chronicle" || keep.includes(e)) want.push(e);
  assert.deepEqual(capped.timeline, want);
  assert.ok(full.timeline.length > capped.timeline.length);
});

test("a history saved with a single splice still restores, and a list of splices does too", () => {
  const s = newGame(5), h = createHistory(), cap = 3;
  for (const a of script(20)) play(s, h, a, cap);
  const at = json(s);
  play(s, h, { type: "check", actor: "rogue", skill: "stealth" }, cap);
  const h2 = createHistory();
  assert.equal(h2.restore(JSON.parse(json(h.dump()))), true);
  h2.undo(s);
  assert.equal(json(s), at);
});
