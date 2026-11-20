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

// A cell far from the party, so that the light rule has not made it out; and the sight rule set the way the DM sets it.
const farCell = (s) => { const l = s.map.levels[0]; const k = Object.keys(l.tiles).map((c) => c.split(",").map(Number)).sort((a, b) => Math.hypot(b[0], b[1]) - Math.hypot(a[0], a[1]))[0]; return { q: k[0], r: k[1] }; };
// (The starting valley is wholly in the light rule's memory at once, so the memory is emptied to leave cells not yet made out.)
const withSight = (rule) => { const s = newGame(5); ok(apply(s, { type: "setting", key: "sight", value: rule }, DM)); s.map.seen = { tiles: { [s.map.levels[0].id]: [] }, objects: {} }; return s; };

test("under each sight rule a player may ping only a cell the view would send them", () => {
  for (const rule of ["rooms", "los", "light"]) {
    const s = withSight(rule), at = farCell(s), lv = s.map.levels[0];
    const sent = (st) => !!view(st, { role: "player", userId: "pat" }).map.levels.find((l) => l.id === lv.id)?.tiles[`${at.q},${at.r}`];
    const before = json(s);
    const r = apply(s, { type: "ping", at }, PAT);
    assert.equal(r.ok, sent(s), `${rule}: a ping is accepted exactly when the view sends the cell`);
    if (!r.ok) assert.equal(r.error, "Pick a spot on the map.");
    assert.equal(json(s) === before || r.ok, true);
    ok(apply(s, { type: "ping", at }, DM));
  }
  // The light rule does refuse a cell not yet made out, and accepts it once the party has made it out.
  const s = withSight("light"), at = farCell(s), lv = s.map.levels[0];
  assert.equal(apply(s, { type: "ping", at }, PAT).ok, false);
  s.map.seen = { tiles: { [lv.id]: [`${at.q},${at.r}`] }, objects: {} };
  ok(apply(s, { type: "ping", at }, PAT));
});

test("a hidden floor is neither accepted nor measured for a player", () => {
  const s = newGame(5), at = cell(s), lv = s.map.levels[0], key = `${at.q},${at.r}`;
  s.map.levels.push({ id: "attic", name: "Attic", z: 10, tiles: { [key]: { t: "stone" }, "40,40": { t: "stone" } } });
  s.map.regions.push({ id: "hidden-attic", level: "attic", hexes: [key, "40,40"], revealed: false });
  assert.equal(ok(apply(s, { type: "ping", at: { ...at, z: 10 } }, PAT)).events[0].at.z, lv.z + (lv.tiles[key].h ?? 0), "the height is the ground's, not the attic's");
  assert.equal(apply(s, { type: "ping", at: { q: 40, r: 40 } }, PAT).ok, false, "a cell that exists only on the hidden floor is refused");
  assert.equal(ok(apply(s, { type: "ping", at: { ...at, z: 10 } }, DM)).events[0].at.z, 10, "the DM's own ping may be on the floor it names");
});

test("a ping while a reaction is awaited leaves the question as it was", () => {
  const s = newGame(5);
  s.pending = { n: 1, action: { type: "noop" }, ctx: { role: "dm" }, answers: [], ask: { reactor: "x" } };
  const was = json(s.pending);
  ok(apply(s, { type: "ping", at: cell(s) }, PAT));
  assert.equal(json(s.pending), was);
});
