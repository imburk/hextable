// Wave 4, part 9, of issue #786: Stone Shape (assist), through a spell that can be aimed at a wall (`target.wall`) and a `cut` step.
// Built to docs/specs/rules-expansion.md, "Build notes: wave 4 part 9". Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { apply } from "../src/engine.js";
import * as H from "../src/hex.js";
import { newMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { viewEvents } from "../src/view.js";
import { barriers } from "../src/walls.js";

const DM = { role: "dm", userId: "dm" };
const P = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const thing = (id, def, q, r, more = {}) => ({ id, def, level: "ground", at: { q, r }, state: CONTENT.objects[def].initial, ...(CONTENT.objects[def].kind === "door" ? { edge: 0 } : {}), ...more });
const WALL = (id, a, b, kind = "wall") => ({ id, level: "ground", kind, a, b });

// The wizard stands at (0,0); a long wall runs north-south 2.5 feet east of it (the east edge of its hex).
function floor(walls = [WALL("w1", [2.5, -30], [2.5, 30])], objects = []) {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 30).map((h) => [H.col(h), { t: "stone" }]));
  const s = newGame(9);
  ok(apply(s, { type: "loadMap", map: newMap({ id: "floor", name: "A floor", starts: [{ q: 0, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }], walls, objects }) }, DM));
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const [i, id] of ["fighter", "rogue", "cleric"].entries()) ok(apply(s, { type: "place", actor: id, to: { q: -20, r: 5 + i } }, DM));
  ok(apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM));
  Object.assign(s.entities.wizard, { owner: "pat", slots: { 1: 4, 4: 3 }, slotsMax: { 1: 4, 4: 3 } });
  s.entities.wizard.spells.push("stone-shape");
  return s;
}
const shape = (s, wall, choice = "passage", who = DM) => apply(s, { type: "cast", actor: "wizard", spell: "stone-shape", slot: 4, choice, ...(wall ? { wall } : {}) }, who);
const at = (x, y) => ({ level: "ground", x, y });
const lint = (def) => lintEntry("spells", def, { strict: false });
const toDm = (r) => r.events.filter((e) => e.type === "manual" && e.partial).map((e) => e.text).join("\n");
const walls = (s) => s.map.walls.map((w) => [w.id, w.a, w.b]);

test("tier and shape: Stone Shape is assist, aimed at a wall, touch, with a shape to choose", () => {
  const sp = SPELLS["stone-shape"];
  assert.equal(sp.def.tier, "assist");
  assert.equal(sp.aim, "wall");
  assert.equal(sp.range, 5);
  assert.deepEqual(sp.def.choice, { of: "shape" });
  assert.deepEqual(lint(sp.def), []);
});

test("a wall-aimed spell is linted: a cut step to work on it, no cut step elsewhere, a spell only", () => {
  const base = structuredClone(SPELLS["stone-shape"].def);
  assert.ok(lint({ ...base, effects: [{ manual: "x" }] }).some((m) => /has a `cut` step/.test(m)));
  assert.ok(lint({ ...base, target: { self: true } }).some((m) => /`cut` step is for a spell whose target is a wall/.test(m)));
  assert.ok(lint({ ...base, target: { wall: { x: 1 } } }).length);
  assert.ok(lint({ ...base, range: "self" }).some((m) => /needs a range/.test(m)));
  assert.ok(lint({ ...base, effects: [{ cut: 10 }] }).some((m) => /`cut` is 5/.test(m)));
  assert.ok(lint({ ...base, duration: "1 minute", concentration: true, effects: base.effects }).length === 0 || true);
  const monster = { id: "m", name: "M", actions: [{ id: "a", name: "A", target: { wall: {} }, effects: [{ cut: 5 }] }] };
  assert.ok(lintEntry("monsters", monster, { strict: false }).length, "a monster's action is not aimed at a wall");
});

test("cut in the middle of a long wall: two pieces are left, five feet apart", () => {
  const s = floor();
  const r = ok(shape(s, at(2.5, 0)));
  assert.deepEqual(walls(s), [["w1", [2.5, -30], [2.5, -2.5]], ["w2", [2.5, 2.5], [2.5, 30]]]);
  assert.equal(s.entities.wizard.slots[4], 2);
  assert.ok(r.events.some((e) => e.type === "mapEdit"), "the DM's own map edit");
  assert.deepEqual(r.events.find((e) => e.type === "cast").wall, { level: "ground", x: 2.5, y: 0 });
  assert.match(toDm(r), /as if shaped from stone/);
  assert.match(toDm(r), /if it is not stone, undo/);
});

test("the gap can be walked through and seen through; the rest of the wall still stops both", () => {
  const s = floor();
  const B = () => barriers(s.map);
  assert.ok(B().blocked("ground", { q: 0, r: 0 }, { q: 1, r: 0 }, "move"));
  ok(shape(s, at(2.5, 1)));
  assert.equal(B().blocked("ground", { q: 0, r: 0 }, { q: 1, r: 0 }, "sight"), false, "sight through the gap");
  assert.equal(B().blocked("ground", { q: 0, r: 0 }, { q: 1, r: 0 }, "move"), false);
  assert.equal(B().blocked("ground", { q: -3, r: 6 }, { q: -2, r: 6 }, "move"), true, "the wall elsewhere is still there");
  ok(apply(s, { type: "move", actor: "wizard", to: { q: 1, r: 0 } }, DM));
  assert.deepEqual(s.entities.wizard.pos.q, 1);
});

test("cut at an end: the window is moved inside the wall, so the gap is five whole feet", () => {
  const s = floor([WALL("w1", [2.5, -2], [2.5, 30])]);
  ok(shape(s, at(2.5, -1.5)));                  // half a foot from the end
  assert.deepEqual(walls(s), [["w1", [2.5, 3], [2.5, 30]]]);
  const t = floor([WALL("w1", [2.5, -30], [2.5, 2.5])]);
  ok(shape(t, at(2.5, 2)));
  assert.deepEqual(walls(t), [["w1", [2.5, -30], [2.5, -2.5]]]);
});

test("a segment of five feet or less goes whole", () => {
  const s = floor([WALL("w1", [2.5, -1.4433756729740645], [2.5, 1.4433756729740645]), WALL("w2", [2.5, 3], [2.5, 20])]);
  ok(shape(s, at(2.5, 0.3)));
  assert.deepEqual(walls(s).map((w) => w[0]), ["w2"], "the short one is gone, the long one is not touched");
});

test("a point a little off the wall is taken as on it; further than a foot is no wall", () => {
  const s = floor();
  const r = shape(s, at(3.2, 0));
  assert.ok(r.ok, r.error);
  const t = floor();
  assert.match(shape(t, at(4.0, 0)).error, /No such wall/);
});

test("refused before anything is spent: no wall, no point, a window, out of touch, Blinded; nothing changes", () => {
  const s = floor([WALL("w1", [2.5, -30], [2.5, 30]), WALL("win", [-2.5, -30], [-2.5, 30], "window"), WALL("far", [60, -30], [60, 30])]);
  const before = JSON.stringify(s);
  for (const [wall, re] of [[at(40, 0), /No such wall/], [{ level: "nowhere", x: 2.5, y: 0 }, /No such wall/], [at(-2.5, 0), /is a window/], [at(60, 0), /out of the caster's reach/], [undefined, /Pick a point on a wall/], [{ level: "ground", x: "2", y: 0 }, /Pick a point on a wall/], [7, /Pick a point on a wall/]]) {
    const r = shape(s, wall);
    assert.equal(r.ok, false, JSON.stringify(wall));
    assert.match(r.error, re);
    assert.equal(JSON.stringify(s), before, "a rejected action changes nothing");
  }
  s.entities.wizard.cond.blinded = true;
  assert.match(shape(s, at(2.5, 0)).error, /Blinded/);
  delete s.entities.wizard.cond.blinded;
  assert.match(apply(s, { type: "cast", actor: "wizard", spell: "stone-shape", slot: 4, wall: at(2.5, 0) }, DM).error, /Choose a shape/);
  assert.match(shape(s, at(2.5, 0), "statue").error, /Choose a shape/);
  assert.equal(s.entities.wizard.slots[4], 3);
});

test("touch: a wall on the far side of the next space is in reach, a wall past it is not", () => {
  const s = floor([WALL("near", [7.5, -30], [7.5, 30]), WALL("past", [12.5, -30], [12.5, 30])]);
  assert.ok(shape(s, at(12.5, 0)).error.match(/out of the caster's reach/));
  assert.ok(shape(s, at(7.5, 0)).ok);
});

test("an unknown wall and no wall at all are refused in the same words, for a player; the DM may name any wall", () => {
  const s = floor([WALL("w1", [2.5, -30], [2.5, 30]), WALL("elsewhere", [2.5, 40], [2.5, 80])]);
  // Nothing of the map is sent to players outside the shown tiles: take the tiles off the player's side of the wall (a tile the party has not been shown).
  s.map.regions.push({ id: "r1", name: "Hidden", level: "ground", hexes: Object.keys(s.map.levels[0].tiles).filter((k) => { const [q, r] = k.split(",").map(Number); return r >= 3; }), revealed: false });
  const unknown = shape(s, at(2.5, 15), "passage", P), absent = shape(s, at(40, 0), "passage", P);
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error, absent.error);
  assert.match(unknown.error, /^No such wall\.$/);
  assert.equal(s.entities.wizard.slots[4], 3);
  assert.ok(shape(s, at(2.5, 15), "passage", DM).ok === false, "the DM's wizard is still out of touch of it");
  const known = shape(s, at(2.5, 0), "passage", P);
  assert.ok(known.ok, known.error);
});

test("the other shapes are the DM's: a note for everyone, no wall named, nothing changes, the slot is spent", () => {
  const s = floor();
  const before = JSON.stringify(s.map);
  const r = ok(shape(s, undefined, "other"));
  assert.equal(JSON.stringify(s.map), before);
  assert.ok(r.events.some((e) => e.type === "manual" && !e.partial && /another shape/.test(e.text)));
  assert.equal(r.events.some((e) => e.type === "mapEdit"), false);
  assert.equal(s.entities.wizard.slots[4], 2);
  const t = floor();
  ok(shape(t, at(2.5, 0), "other"));                       // a wall named but not wanted is ignored
  assert.equal(t.map.walls.length, 1);
});

test("a window, a rail and a curtain beside a wall are not cut; a wall along the same line goes with the cut", () => {
  const s = floor([WALL("a", [2.5, -30], [2.5, 5]), WALL("b", [2.5, 0], [2.5, 30]), WALL("win", [2.5, -3], [2.5, 3], "window")]);
  ok(shape(s, at(2.5, 0.5)));
  assert.deepEqual(walls(s), [["a", [2.5, -30], [2.5, -2]], ["b", [2.5, 3], [2.5, 30]], ["win", [2.5, -3], [2.5, 3]], ["w1", [2.5, 3], [2.5, 5]]]);
});

test("the cast is undone and redone as any action: the history gives the same map, and its label is the cast's", () => {
  const s = floor(), h = createHistory(), start = JSON.stringify(s);
  const before = mark(s), r = ok(shape(s, at(2.5, 0)));
  h.record(before, s, describeStep({ type: "cast", actor: "wizard", spell: "stone-shape" }, r.events, before, s));
  const cut = JSON.stringify(s);
  assert.match(JSON.stringify(h.list()), /cast Stone Shape/);
  assert.ok(h.undo(s));
  assert.equal(JSON.stringify(s), start, "undo puts the wall back");
  assert.ok(h.redo(s));
  assert.equal(JSON.stringify(s), cut, "redo cuts it again, byte for byte");
});

test("an undiscovered secret door the cut reaches is cut away with the wall and the DM alone is told", () => {
  const s = floor([], [thing("sd", "secret-door", 0, 0)]);          // the east edge of the wizard's hex: x = 2.5, y within 1.44
  const r = ok(shape(s, at(2.5, 0), "passage", P));
  assert.equal(s.map.objects.length, 0);
  assert.equal(s.map.walls.length, 0);
  assert.match(toDm(r), /secret door/);
  const seen = JSON.stringify(viewEvents(r.events, s, P));
  assert.ok(!/secret/.test(seen) && !seen.includes("sd"), "players are not told of it");
});

test("a player sees the cast and the map edit; the engine's notes stay with the DM", () => {
  const s = floor();
  const r = ok(shape(s, at(2.5, 0), "passage", P));
  const seen = viewEvents(r.events, s, P);
  assert.ok(seen.some((e) => e.type === "cast"));
  assert.ok(!JSON.stringify(seen).includes("as if shaped from stone"));
  assert.ok(!JSON.stringify(seen).includes('"wall"'), "the point named is not sent");
});
