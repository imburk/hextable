// Issue #599: `ping` points out a cell to everyone at the table. It changes no state, is not an undo step and is not kept on the timeline.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import { createHistory, describeStep, mark, undoable } from "../src/history.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";
import { surfaces } from "../src/space.js";

const DM = { role: "dm", userId: "dm" }, PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
const cell = (s) => { const l = s.map.levels[0], k = Object.keys(l.tiles)[0].split(",").map(Number); return { q: k[0], r: k[1] }; };

test("a ping changes nothing: no state, no timeline entry, no undo step", () => {
  const s = newGame(5), at = cell(s), before = json(s), n = s.timeline.length;
  const r = ok(apply(s, { type: "ping", at, userName: "Pat" }, PAT));
  assert.deepEqual(r.events.map((e) => [e.type, e.from, e.name, e.at.q, e.at.r]), [["ping", "pat", "Pat", at.q, at.r]]);
  assert.equal(json(s), before);
  assert.equal(s.timeline.length, n);
  assert.equal(undoable({ type: "ping" }), false);
  assert.equal(describeStep({ type: "ping" }, r.events, mark(s), s).label, "A spot was pointed out");
});

test("the DM pings too, signed DM; a player's name is cut to 40 characters", () => {
  const s = newGame(5), at = cell(s);
  assert.equal(ok(apply(s, { type: "ping", at }, DM)).events[0].name, "DM");
  assert.equal(ok(apply(s, { type: "ping", at, userName: "x".repeat(90) }, PAT)).events[0].name.length, 40);
  assert.equal(ok(apply(s, { type: "ping", at }, PAT)).events[0].name, "A player");
});

test("a cell off the map, a bad cell, or no user is refused and changes nothing", () => {
  const s = newGame(5), before = json(s);
  for (const at of [{ q: 9999, r: 9999 }, { q: 1.5, r: 0 }, { q: "0", r: 0 }, null, 3, [], {}, { q: NaN, r: 0 }, undefined]) {
    const r = apply(s, { type: "ping", at }, PAT);
    assert.equal(r.ok, false, json(at));
    assert.equal(json(s), before);
  }
  assert.equal(apply(s, { type: "ping", at: cell(s) }, { role: "player" }).ok, false);
  assert.equal(json(s), before);
});

test("a player may not ping a cell in a region not yet revealed; the DM may", () => {
  const s = newGame(5), at = cell(s);
  const lv = s.map.levels[0];
  s.map.regions.push({ id: "secret", level: lv.id, hexes: [`${at.q},${at.r}`], revealed: false });
  const before = json(s);
  assert.equal(apply(s, { type: "ping", at }, PAT).error, "Pick a spot on the map.");
  assert.equal(apply(s, { type: "ping", at: { q: 9999, r: 0 } }, PAT).error, "Pick a spot on the map.");
  ok(apply(s, { type: "ping", at }, DM));
  assert.equal(json(s), before);
  s.map.regions[s.map.regions.length - 1].revealed = true;
  ok(apply(s, { type: "ping", at }, PAT));
});

test("a ping is allowed while a reaction is awaited", () => {
  const s = newGame(5);
  s.pending = { n: 1, action: { type: "noop" }, ctx: {}, answers: [], ask: {} };
  ok(apply(s, { type: "ping", at: cell(s) }, PAT));
});

test("the view tells everyone the ping: sender, name, cell, and nothing else", () => {
  const s = newGame(5), at = cell(s);
  const ev = ok(apply(s, { type: "ping", at, userName: "Pat" }, PAT)).events;
  for (const who of [DM, PAT, { role: "player", userId: "kim" }]) {
    const seen = viewEvents(ev, s, who);
    assert.equal(seen.length, 1);
    assert.deepEqual(Object.keys(seen[0]).sort(), ["at", "from", "name", "type"]);
    assert.deepEqual(seen[0].at, ev[0].at);
  }
});

test("a ping does not disturb the undo history", () => {
  const s = newGame(5), h = createHistory();
  const was = mark(s);
  ok(apply(s, { type: "setting", key: "pace", value: "flow" }, DM));
  h.record(was, s, "pace");
  ok(apply(s, { type: "ping", at: cell(s) }, PAT));
  assert.equal(h.list().length, 1);
});
