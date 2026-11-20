// Travel W2 (docs/specs/travel.md, Decisions 1, 4, 5 and 11; build row W2): places of a world, one in play and the
// others parked (V1), the holding map, loadMap { node }, enter, leave, goTo, forgetPlace, nodeAdd, place { node },
// catching up, the parked cap, the fight refusal off battle maps, stale places, the state version and undo.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { apply, ACTION_TYPES, dawnsBetween, NOT_BATTLE, TRAVEL_LIMITS } from "../src/engine.js";
import { arrive, CREATURE_LINKS } from "../src/engine/travel.js";
import { holdingMap, lintMap } from "../src/map.js";
import { effectFate, pinOf, staleCheck } from "../src/places.js";
import { migrate, VERSION } from "../src/migrate.js";
import { view, viewEvents } from "../src/view.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { newGame } from "../src/scenario.js";
import keep from "../src/content/maps/keep.js";
import cave from "../src/content/maps/cave.js";
import tavern from "../src/content/maps/tavern.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
// Refused, with these words, and the game exactly as it was.
function refused(s, action, words, ctx = DM) {
  const before = json(s);
  const r = apply(s, action, ctx);
  assert.equal(r.ok, false, `${action.type} should be refused`);
  if (words) assert.match(r.error, words);
  assert.equal(json(s), before, `${action.type}: a refused action changes nothing`);
  return r;
}
const party = (s) => Object.values(s.entities).filter((e) => e.side === "party").map((e) => e.id).sort();
const DAY = 1440;

// The keep with a gate (Decision 3, as W1's test has it).
const GATE = [{ q: -13, r: 1 }, { q: -12, r: 1 }];
const keepMap = () => {
  const m = structuredClone(keep);
  m.entries = [{ id: "gate", name: "The gatehouse", kind: "gate" }];
  m.starts = [...m.starts, ...GATE.map((h) => ({ level: "ground", ...h, entry: "gate" }))];
  return m;
};
// A small world, as W3's index will hold it: a continent with three pins, a keep and a cave (battle maps), a port city
// (a navigation map) with a tavern under it, and a hermit's hut (a scene).
function world(s) {
  s.world = { id: "river-country", version: 1, hash: null, root: "continent", routes: [], tables: [], nodes: {
    continent: { id: "continent", kind: "nav", scale: "world", name: "The continent", pins: [
      { id: "p-keep", at: [100, 100], name: "The keep", to: "keep", entry: "gate" },
      { id: "p-cave", at: [200, 200], name: "The cave", to: "cave" },
      { id: "p-port", at: [300, 300], name: "The port city", to: "port" },
      { id: "p-hut", at: [400, 400], name: "A hut", to: "hermit" }] },
    keep: { id: "keep", kind: "map", scale: "tactical", parent: "continent", name: "The keep", entries: [{ id: "gate", name: "The gatehouse", kind: "gate" }] },
    cave: { id: "cave", kind: "map", scale: "tactical", parent: "continent", name: "The cave" },
    port: { id: "port", kind: "nav", scale: "city", parent: "continent", name: "The port city", pins: [{ id: "p-tavern", at: [10, 10], name: "A tavern", to: "tavern" }] },
    tavern: { id: "tavern", kind: "map", scale: "tactical", parent: "port", name: "A tavern" },
    hermit: { id: "hermit", kind: "scene", parent: "continent", name: "A hermit's hut" },
  } };
  s.place = null; s.parked = {}; s.journey = null;
  return s;
}
// The party at the keep's gate, from the valley.
function atKeep(seed = 5) {
  const s = world(newGame(seed));
  ok(apply(s, { type: "loadMap", node: "keep", map: keepMap(), entry: "gate" }, DM));
  return s;
}

test("the holding map is a plain clearing big enough for the group, linted, marked and named for nothing", () => {
  for (const n of [1, 4, 8, 30]) {
    const m = holdingMap(n);
    assert.deepEqual(lintMap(m), []);
    assert.equal(m.holding, true);
    assert.equal(m.id, "holding"); assert.equal(m.name, "Holding map");
    assert.deepEqual([m.walls, m.objects, m.regions, m.starts], [[], [], [], []]);
    assert.ok(Object.keys(m.levels[0].tiles).length >= Math.max(n * 9, 469));
  }
});

test("loadMap { node } from a map that is not a place: the old map goes as today, the party is set down at the entry, and the table is at the node", () => {
  const s = atKeep();
  assert.equal(s.place, "keep");
  assert.equal(s.map.id, "keep");
  assert.deepEqual(party(s), ["cleric", "fighter", "rogue", "wizard"]);
  assert.ok(!Object.values(s.entities).some((e) => e.side !== "party"), "the valley's goblins stayed with the valley");
  assert.deepEqual(Object.values(s.entities).slice(0, 2).map((e) => ({ q: e.pos.q, r: e.pos.r })).sort((a, b) => a.q - b.q), GATE);
  assert.equal(s.world.came.keep, "gate");
  assert.deepEqual(s.parked, {}, "the valley was not a place: nothing is parked");
});

test("leave the keep with a door open and a goblin tied up, come back: both as left (Done when 1)", () => {
  const s = atKeep();
  ok(apply(s, { type: "setObject", object: "o3", state: "open" }, DM));
  const gob = ok(apply(s, { type: "spawn", monster: "goblin-warrior", name: "Snagtooth", at: { q: -6, r: 2 } }, DM)).events[0].id;
  ok(apply(s, { type: "condition", actor: gob, condition: "restrained" }, DM));
  const was = structuredClone(s.entities[gob]);
  const r = ok(apply(s, { type: "loadMap", node: "cave", map: structuredClone(cave) }, DM));
  assert.ok(r.events.some((e) => e.type === "parked" && e.node === "keep"));
  assert.equal(s.place, "cave");
  assert.equal(s.entities[gob], undefined, "the goblin is not in play");
  assert.equal(s.parked.keep.entities[gob].name, "Snagtooth");
  assert.equal(s.parked.keep.since, s.clock);
  ok(apply(s, { type: "advanceTime", minutes: 120 }, DM));
  // Back: no map needed, the parked one is used.
  ok(apply(s, { type: "loadMap", node: "keep", entry: "gate" }, DM));
  assert.equal(s.place, "keep");
  assert.equal(s.map.objects.find((o) => o.id === "o3").state, "open", "the door is as left");
  assert.deepEqual(s.entities[gob], was, "the goblin is as left, tied up where it was");
  assert.ok(s.entities[gob].cond.restrained);
  assert.equal(s.parked.keep, undefined, "unparked");
  assert.ok(s.parked.cave, "and the cave is parked in its turn");
});

test("a Wand's charges come back for each dawn an away member missed, when the focus comes back to them (Done when 2)", () => {
  const s = atKeep();
  s.entities.wizard.sheet = { items: [{ id: "w", item: "wand-of-magic-missiles", charges: 0 }] };
  // Tavin stays at the keep; the others go to the cave.
  ok(apply(s, { type: "loadMap", node: "cave", map: structuredClone(cave), who: ["fighter", "rogue", "cleric"] }, DM));
  assert.deepEqual(Object.keys(s.parked.keep.entities), ["wizard"]);
  const t = ok(apply(s, { type: "advanceTime", minutes: 2 * DAY }, DM));
  assert.ok(!t.events.some((e) => e.type === "recharged" && e.id === "wizard"), "away: no dawn reaches Tavin");
  assert.equal(s.parked.keep.entities.wizard.sheet.items[0].charges, 0);
  const missed = dawnsBetween(s.parked.keep.since, s.clock);
  assert.equal(missed, 2);
  const g = ok(apply(s, { type: "goTo", node: "keep" }, DM));
  const w = g.events.find((e) => e.type === "recharged" && e.id === "wizard");
  assert.ok(w, "caught up on arrival");
  assert.equal(s.entities.wizard.sheet.items[0].charges, w.charges);
  if (w.charges < 7) assert.equal(w.rolls.length, missed, "one roll for each dawn missed");
  else assert.ok(w.rolls.length >= 1 && w.rolls.length <= missed, "one roll for each dawn missed, until full");
  assert.equal(w.charges, Math.min(7, w.rolls.reduce((a, b) => a + b, 0)));
  // The others, in the cave all along, had their dawns in play and get none again.
  assert.ok(!g.events.some((e) => e.type === "recharged" && e.id !== "wizard"));
});

test("a split party: the table cuts back and forth, each group exactly as it was (Done when 3)", () => {
  const s = atKeep();
  ok(apply(s, { type: "loadMap", node: "cave", map: structuredClone(cave), who: ["fighter", "rogue"] }, DM));
  assert.deepEqual(party(s), ["fighter", "rogue"]);
  assert.deepEqual(Object.keys(s.parked.keep.entities).sort(), ["cleric", "wizard"]);
  ok(apply(s, { type: "spawn", monster: "wolf", at: { q: s.entities.fighter.pos.q + 2, r: s.entities.fighter.pos.r } }, DM));      // something changed in the cave
  const cavePos = json(s.entities), keepPos = json(s.parked.keep.entities), clock = s.clock;
  for (let i = 0; i < 3; i++) {
    ok(apply(s, { type: "goTo", node: "keep" }, DM));
    assert.equal(s.place, "keep"); assert.equal(s.map.id, "keep");
    assert.deepEqual(party(s), ["cleric", "wizard"]);
    assert.equal(json(s.entities), keepPos);
    assert.equal(json(s.parked.cave.entities), cavePos);
    ok(apply(s, { type: "goTo", node: "cave" }, DM));
    assert.equal(json(s.entities), cavePos);
    assert.equal(json(s.parked.keep.entities), keepPos);
  }
  assert.equal(s.clock, clock, "cutting does not move the clock");
  refused(s, { type: "goTo", node: "cave" }, /already at The cave/);
  refused(s, { type: "goTo", node: "tavern" }, /Nobody and nothing is kept at A tavern/);
  refused(s, { type: "goTo", node: "nowhere" }, /no place "nowhere"/);
  refused(s, { type: "goTo", node: "keep" }, /Only the DM/, PAT);
});

test("startEncounter on a navigation node is refused and nothing changes; so is an attack that would start a fight (Done when 4)", () => {
  const s = atKeep();
  ok(apply(s, { type: "leave" }, DM));
  assert.equal(s.place, "continent");
  assert.equal(s.map.holding, true);
  assert.ok(Object.values(s.entities).every((e) => pinOf(s, e.id) === "p-keep"), "they stand at the pin that leads back to the keep");
  assert.ok(Object.values(s.entities).every((e) => !("pin" in e)), "a pin is not on the creature, which players are sent whole");
  const pv = json(view(s, PAT));
  for (const k of ["p-keep", "continent", "The continent"]) assert.ok(!pv.includes(k), `a player's view has no ${k}`);
  const r = refused(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, /This is not a battle map/);
  assert.equal(r.error, NOT_BATTLE);
  // A wolf the DM put on the holding map, and an attack at it.
  const wolf = ok(apply(s, { type: "spawn", monster: "wolf", at: { q: 3, r: 0 } }, DM)).events[0].id;
  s.entities.fighter.pos = { q: 2, r: 0, z: 0 };
  refused(s, { type: "attack", actor: "fighter", target: wolf, attack: s.entities.fighter.attacks?.[0]?.id ?? "longsword" }, /This is not a battle map/);
  refused(s, { type: "mapEdit", ops: [{ op: "forget" }] }, /not a battle map/);
  assert.equal(s.encounter, null);
});

test("a long stay on a navigation node: every pass after an action finds nothing to do on the holding map", () => {
  const s = atKeep();
  ok(apply(s, { type: "leave" }, DM));
  const ents = () => json(Object.values(s.entities).map(({ id, pos, hp, cond, pin }) => ({ id, pos, hp, cond, pin })));
  const before = ents();
  for (const a of [{ type: "advanceTime", minutes: 600 }, { type: "rest" }, { type: "shortRest" }, { type: "advanceTime", minutes: 3 * DAY }, { type: "setting", key: "sight", value: "los" }, { type: "advanceTime", minutes: 30 }]) {
    const r = ok(apply(s, a, DM));
    for (const e of r.events) assert.ok(["time", "rest", "map", "region", "placeStale"].includes(e.type) || e.type === "recharged", `${a.type}: ${e.type}`);
  }
  assert.equal(ents().replace(/"hp":\d+/g, ""), before.replace(/"hp":\d+/g, ""), "nobody moved, fell or changed");
});

test("enter and leave: a pin leads down, at its entry; leaving climbs to the pin that leads back; a scene and a navigation node hold their creatures on a holding map", () => {
  const s = atKeep();
  ok(apply(s, { type: "leave" }, DM));
  assert.equal(s.parked.keep.map.id, "keep", "the keep is parked though nobody is there: it holds its doors");
  refused(s, { type: "enter", pin: "p-tavern" }, /has no pin "p-tavern"/);
  refused(s, { type: "enter", pin: "p-cave" }, /must come with the action/);
  ok(apply(s, { type: "enter", pin: "p-port" }, DM));
  assert.equal(s.place, "port");
  assert.ok(s.map.holding);
  assert.ok(Object.values(s.entities).every((e) => pinOf(s, e.id) === null), "into a navigation node at no pin");
  assert.equal(s.parked.continent, undefined, "a navigation node nobody stays at is let go");
  ok(apply(s, { type: "enter", pin: "p-tavern", map: structuredClone(tavern), who: ["fighter", "rogue"] }, DM));
  assert.equal(s.place, "tavern");
  assert.deepEqual(party(s), ["fighter", "rogue"]);
  assert.deepEqual(Object.keys(s.parked.port.entities).sort(), ["cleric", "wizard"], "the others wait in the port city");
  ok(apply(s, { type: "leave" }, DM));
  assert.equal(s.place, "port");
  assert.deepEqual(party(s), ["cleric", "fighter", "rogue", "wizard"]);
  assert.equal(pinOf(s, "fighter"), "p-tavern");
  assert.equal(s.parked.tavern.map.id, "tavern");
  // A scene node.
  ok(apply(s, { type: "leave" }, DM));
  ok(apply(s, { type: "enter", pin: "p-hut", who: ["cleric"] }, DM));
  assert.equal(s.place, "hermit"); assert.ok(s.map.holding);
  refused(s, { type: "leave", who: ["nobody"] }, /No such creature/);
  refused(s, { type: "enter", pin: "p-keep" }, /not a navigation map/);
});

test("undo of an arrival restores both places exactly; redo gives the same again; a rest pin is kept across it", () => {
  const s = atKeep();
  ok(apply(s, { type: "setObject", object: "o3", state: "open" }, DM));
  const h = createHistory();
  const rest = { type: "rest" }, m0 = mark(s), r0 = ok(apply(s, rest, DM));
  h.record(m0, s, describeStep(rest, r0.events, m0, s)); h.track(rest, r0.events, m0, s);
  const before = json(s);
  const action = { type: "loadMap", node: "cave", map: structuredClone(cave), who: ["fighter", "rogue"] };
  const m = mark(s), r = ok(apply(s, action, DM));
  const step = describeStep(action, r.events, m, s);
  assert.equal(step.label, "Brenna and Pip went to The cave");
  assert.equal(step.shown, "Brenna and Pip moved on");
  h.record(m, s, step); h.track(action, r.events, m, s);
  assert.deepEqual(h.pins(), { fight: false, rest: true }, "going to a place keeps the rest pin");
  const after = json(s);
  h.undo(s);
  assert.equal(json(s), before, "both places exactly as before");
  h.redo(s);
  assert.equal(json(s), after);
  // And a goTo.
  const g = { type: "goTo", node: "keep" }, mg = mark(s), rg = ok(apply(s, g, DM));
  assert.deepEqual(describeStep(g, rg.events, mg, s), { label: "The table cut to The keep", shown: "The table cut to another place" });
  h.record(mg, s, describeStep(g, rg.events, mg, s));
  h.undo(s);
  assert.equal(json(s), after);
});

test("a valley table is unchanged by the migration but for the four new fields and its version (Done when 6)", () => {
  assert.equal(VERSION, 27);
  const old = newGame(5); old.version = 25;
  const was = structuredClone(old);
  migrate(old);
  const { world: w, place, parked, journey, ...rest } = old;
  assert.deepEqual({ w, place, parked, journey }, { w: null, place: null, parked: {}, journey: null });
  const { strikeFirst, ...settings } = rest.settings;          // version 27 (#585) adds the table rule `strikeFirst`: "casts" where `autoEngage` was on, else "off"
  assert.equal(strikeFirst, "casts");
  assert.equal(json({ ...rest, settings, version: 25 }), json(was));
  assert.deepEqual(Object.keys(old).slice(-4), ["world", "place", "parked", "journey"]);
  const again = json(old); migrate(old); assert.equal(json(old), again, "migrating again changes nothing");
  // A state at the current version made by newGame (no fields) is left as it is.
  const fresh = newGame(5), f = json(fresh); migrate(fresh); assert.equal(json(fresh), f);
  // One that is not whole is put back to empty.
  const bad = newGame(5); Object.assign(bad, { world: [], place: "keep", parked: { keep: { map: 3 } } });
  migrate(bad);
  assert.deepEqual([bad.world, bad.place, bad.parked], [null, null, {}]);
  // A parked place survives a save and a load.
  const s = atKeep(); ok(apply(s, { type: "loadMap", node: "cave", map: structuredClone(cave), who: ["fighter"] }, DM));
  const loaded = migrate(JSON.parse(json(s)));
  assert.equal(json(loaded), json(s));
});

test("stale places: 9 days 23 hours is not stale, 10 days is; the DM alone is told; going there asks first (Done when 7)", () => {
  const s = atKeep();
  ok(apply(s, { type: "setObject", object: "o3", state: "open" }, DM));
  ok(apply(s, { type: "loadMap", node: "cave", map: structuredClone(cave) }, DM));
  const r1 = ok(apply(s, { type: "advanceTime", minutes: 10 * DAY - 60 }, DM));
  assert.ok(!r1.events.some((e) => e.type === "placeStale"));
  assert.equal(s.parked.keep.stale, null);
  const r2 = ok(apply(s, { type: "advanceTime", minutes: 60 }, DM));
  const st = r2.events.find((e) => e.type === "placeStale");
  assert.deepEqual(st, { type: "placeStale", node: "keep", name: "The keep", days: 10 });
  assert.equal(s.parked.keep.stale, s.clock);
  assert.equal(TRAVEL_LIMITS.staleMinutes, 14400);
  // Told once: the next clock move says nothing more.
  assert.ok(!ok(apply(s, { type: "advanceTime", minutes: 60 }, DM)).events.some((e) => e.type === "placeStale"));
  // The DM alone: not in any player's events, nor their view.
  assert.deepEqual(viewEvents(r2.events, s, PAT).filter((e) => e.type === "placeStale"), []);
  const v = json(view(s, PAT));
  for (const k of ['"parked"', '"world"', '"place"', "Snag", "The keep", '"stale"']) assert.ok(!v.includes(k), `a player's view has no ${k}`);
  // Going there without an answer is refused with the question, and nothing changes; so is a wrong answer.
  refused(s, { type: "goTo", node: "keep" }, /The keep has been left for 10 days\. Keep it as it was, put it back as prepared, or edit it first/);
  refused(s, { type: "loadMap", node: "keep" }, /has been left for 10 days/);
  refused(s, { type: "goTo", node: "keep", stale: "burn" }, /"stale" can be: keep, reset, edit/);
  // Nothing resets by itself: thirty days on, the door is still open.
  ok(apply(s, { type: "advanceTime", minutes: 30 * DAY }, DM));
  assert.equal(s.parked.keep.map.objects.find((o) => o.id === "o3").state, "open");
});

test("keep clears the mark and starts the ten days again; edit goes there as left", () => {
  const s = atKeep();
  ok(apply(s, { type: "loadMap", node: "cave", map: structuredClone(cave) }, DM));
  ok(apply(s, { type: "advanceTime", minutes: 10 * DAY }, DM));
  assert.ok(s.parked.keep.stale);
  const k = ok(apply(s, { type: "keepPlace", node: "keep" }, DM));
  assert.deepEqual(viewEvents(k.events, s, PAT), []);
  assert.equal(s.parked.keep.stale, null); assert.equal(s.parked.keep.kept, s.clock);
  ok(apply(s, { type: "advanceTime", minutes: 10 * DAY - 1 }, DM));
  assert.equal(s.parked.keep.stale, null, "the ten days count from the keep");
  ok(apply(s, { type: "advanceTime", minutes: 1 }, DM));
  assert.ok(s.parked.keep.stale, "and run out again");
  // Going with `stale: 'edit'`: as left, the mark cleared.
  const doors = json(s.parked.keep.map);
  ok(apply(s, { type: "goTo", node: "keep", stale: "edit" }, DM));
  assert.equal(s.place, "keep"); assert.equal(json(s.map), doors);
  // And `keep` on the way in.
  ok(apply(s, { type: "goTo", node: "cave" }, DM));
  ok(apply(s, { type: "advanceTime", minutes: 10 * DAY }, DM));
  ok(apply(s, { type: "loadMap", node: "keep", stale: "keep" }, DM));
  assert.equal(s.place, "keep");
  refused(s, { type: "keepPlace", node: "keep" }, /Nothing is kept at The keep/);
});

test("reset rebuilds the place from the pack and sets the party down at its entry; refused for a place made at the table", () => {
  const s = atKeep();
  ok(apply(s, { type: "setObject", object: "o3", state: "open" }, DM));
  const gob = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: -6, r: 2 } }, DM)).events[0].id;
  ok(apply(s, { type: "loadMap", node: "cave", map: structuredClone(cave), who: ["fighter", "rogue", "cleric"] }, DM));
  ok(apply(s, { type: "advanceTime", minutes: 11 * DAY }, DM));
  refused(s, { type: "resetPlace", node: "keep" }, /prepared map of The keep did not come with the action/);
  const r = ok(apply(s, { type: "resetPlace", node: "keep", map: keepMap() }, DM));
  const told = r.events.find((e) => e.type === "placeReset");
  assert.match(told.text, /The keep was put back as the world pack has it: 1 creature not of the party, 0 lasting effects and every change to its map/);
  assert.deepEqual(viewEvents(r.events, s, PAT), []);
  const rec = s.parked.keep;
  assert.equal(rec.map.objects.find((o) => o.id === "o3").state, "closed", "the door is as prepared");
  assert.equal(rec.entities[gob], undefined);
  assert.deepEqual(Object.keys(rec.entities), ["wizard"]);
  assert.deepEqual({ q: rec.entities.wizard.pos.q, r: rec.entities.wizard.pos.r }, GATE[0], "Tavin is at the gate, the entry the party came by");
  assert.equal(rec.stale, null); assert.equal(rec.since, s.clock);
  // `stale: 'reset'` on the way in does the same.
  ok(apply(s, { type: "setting", key: "sight", value: "rooms" }, DM));
  ok(apply(s, { type: "goTo", node: "keep" }, DM));
  ok(apply(s, { type: "setObject", object: "o3", state: "open" }, DM));
  ok(apply(s, { type: "goTo", node: "cave" }, DM));
  ok(apply(s, { type: "advanceTime", minutes: 10 * DAY }, DM));
  refused(s, { type: "goTo", node: "keep", stale: "reset" }, /did not come with the action/);
  ok(apply(s, { type: "goTo", node: "keep", stale: "reset", map: keepMap() }, DM));
  assert.equal(s.map.objects.find((o) => o.id === "o3").state, "closed");
  // A place made at the table has nothing to go back to.
  ok(apply(s, { type: "nodeAdd", node: { name: "The old mill", kind: "map", parent: "continent" }, map: structuredClone(tavern) }, DM));
  assert.ok(s.parked["the-old-mill"]);
  refused(s, { type: "resetPlace", node: "the-old-mill", map: structuredClone(tavern) }, /made at the table/);
});

test("a portal arrival goes in with the place kept as left, the mark cleared and the DM told (Done when 7, last part)", () => {
  const s = atKeep();
  ok(apply(s, { type: "setObject", object: "o3", state: "open" }, DM));
  ok(apply(s, { type: "loadMap", node: "cave", map: structuredClone(cave) }, DM));
  ok(apply(s, { type: "advanceTime", minutes: 12 * DAY }, DM));
  assert.ok(s.parked.keep.stale);
  // What W8's `travel` step will call: no `stale` answer can come with a spell the DM was not at the table for.
  const ev = [];
  arrive(s, {}, ev, { to: "keep", ids: ["fighter", "rogue", "cleric", "wizard"], entry: "gate", portal: true });
  assert.equal(s.place, "keep");
  assert.equal(s.map.objects.find((o) => o.id === "o3").state, "open", "kept as left");
  const told = ev.find((e) => e.type === "placeKept");
  assert.equal(told.how, "portal");
  assert.deepEqual(viewEvents(ev, s, PAT).filter((e) => e.type === "placeKept"), []);
});

test("what players are sent: never a parked place, its creatures, the world's ids or the travel events", () => {
  const s = atKeep();
  for (const id of ["fighter", "rogue", "cleric", "wizard"]) s.entities[id].owner = "pat";
  const canary = ok(apply(s, { type: "spawn", monster: "goblin-warrior", name: "Canary the Goblin", at: { q: -6, r: 2 } }, DM)).events[0].id;
  const r = ok(apply(s, { type: "loadMap", node: "cave", map: structuredClone(cave), who: ["fighter", "rogue"] }, DM));
  assert.ok(s.parked.keep.entities[canary]);
  const sent = viewEvents(r.events, s, PAT);
  assert.ok(!sent.some((e) => ["parked", "arrived", "cut", "relocated", "placeStale", "nodeAdded"].includes(e.type)));
  assert.ok(sent.some((e) => e.type === "map"), "the new map is told, as loadMap tells it");
  const v = view(s, PAT), text = json(v);
  for (const k of ["Canary", canary, "cleric", "wizard", "Greywatch", '"keep"', "river-country", "continent", "parked", '"world"']) assert.ok(!text.includes(k), `no ${k} in a player's view`);
  assert.deepEqual(Object.keys(v.entities).sort(), ["fighter", "rogue"]);
  const g = ok(apply(s, { type: "goTo", node: "keep" }, DM));
  const tg = json(viewEvents(g.events, s, PAT));
  assert.ok(!tg.includes("cave") && !tg.includes("Hollow"), "the place left is not named");
  // A player cannot send the travel actions.
  for (const a of [{ type: "goTo", node: "cave" }, { type: "enter", pin: "p-keep" }, { type: "leave" }, { type: "loadMap", node: "cave" }, { type: "forgetPlace", node: "cave" },
    { type: "keepPlace", node: "cave" }, { type: "resetPlace", node: "cave" }, { type: "nodeAdd", node: { name: "X", kind: "scene" } }, { type: "place", who: ["cleric"], node: "cave" }]) refused(s, a, /Only the DM/, PAT);
});

test("forgetPlace drops a parked place, refused while the party is there; the parked cap refuses a seventeenth battle place", () => {
  const s = atKeep();
  ok(apply(s, { type: "loadMap", node: "cave", map: structuredClone(cave), who: ["fighter"] }, DM));
  refused(s, { type: "forgetPlace", node: "keep" }, /Pip, Odessa, Tavin are at The keep|are at The keep/);
  refused(s, { type: "forgetPlace", node: "tavern" }, /Nothing is kept at A tavern/);
  ok(apply(s, { type: "goTo", node: "keep" }, DM));
  ok(apply(s, { type: "place", who: ["fighter"], node: "keep", entry: "gate" }, DM));
  assert.deepEqual(Object.keys(s.parked.cave.entities), []);
  const f = ok(apply(s, { type: "forgetPlace", node: "cave" }, DM));
  assert.equal(s.parked.cave, undefined);
  assert.equal(describeStep({ type: "forgetPlace", node: "cave" }, f.events, s, s).shown, null);
  // Sixteen battle places parked: a seventeenth is refused.
  for (let i = 0; i < TRAVEL_LIMITS.parked; i++) ok(apply(s, { type: "nodeAdd", node: { name: `Room ${i}`, kind: "map" }, map: structuredClone(tavern) }, DM));
  refused(s, { type: "nodeAdd", node: { name: "One too many", kind: "map" }, map: structuredClone(tavern) }, /Sixteen places hold changes/);
  refused(s, { type: "leave" }, /Sixteen places hold changes/);              // leaving would park the keep: a seventeenth
  ok(apply(s, { type: "forgetPlace", node: "room-0" }, DM));
  ok(apply(s, { type: "leave" }, DM));
});

test("place { node }: anywhere in the atlas, from play or a parked place, and a creature out of a parked place catches up", () => {
  const s = atKeep();
  s.entities.wizard.sheet = { items: [{ id: "w", item: "wand-of-magic-missiles", charges: 0 }] };
  ok(apply(s, { type: "place", who: ["wizard"], node: "continent", pin: "p-cave" }, DM));
  assert.equal(s.entities.wizard, undefined);
  assert.equal(pinOf(s, "wizard"), "p-cave");
  assert.ok(s.parked.continent.map.holding);
  ok(apply(s, { type: "advanceTime", minutes: DAY }, DM));
  const r = ok(apply(s, { type: "place", actor: "wizard", node: "keep", entry: "gate" }, DM));
  assert.ok(s.entities.wizard);
  assert.equal(pinOf(s, "wizard"), null);
  assert.ok(r.events.some((e) => e.type === "recharged" && e.id === "wizard"), "the dawn it missed");
  assert.equal(s.parked.continent, undefined, "a navigation node left with nobody holds nothing");
  refused(s, { type: "place", who: ["wizard"], node: "tavern" }, /Nobody has been to A tavern yet/);
  refused(s, { type: "place", who: ["wizard"], node: "keep", pin: "p-keep" }, /not a navigation map/);
  refused(s, { type: "place", who: ["wizard"], node: "continent", entry: "gate" }, /not a battle map/);
  refused(s, { type: "place", who: ["wizard"], node: "continent", pin: "nope" }, /no pin "nope"/);
  refused(s, { type: "place", who: ["wizard", "wizard"], node: "continent" }, /once/);
});

test("nodeAdd: a scene, a battle place with its map, and the map in play made a place (here)", () => {
  const s = world(newGame(5));
  refused(s, { type: "goTo", node: "keep" }, /not a place of the world/);
  refused(s, { type: "nodeAdd", node: { name: "", kind: "map" } }, /needs a name/);
  refused(s, { type: "nodeAdd", node: { name: "X", kind: "nav" } }, /atlas editor/);
  refused(s, { type: "nodeAdd", node: { name: "X", kind: "map" } }, /needs its map/);
  refused(s, { type: "nodeAdd", node: { name: "X", kind: "map", parent: "nowhere" }, map: structuredClone(cave) }, /no place "nowhere"/);
  ok(apply(s, { type: "nodeAdd", node: { name: "The valley", kind: "map", parent: "continent" }, here: true }, DM));
  assert.equal(s.place, "the-valley");
  assert.equal(s.world.nodes["the-valley"].added, true);
  ok(apply(s, { type: "nodeAdd", node: { name: "The valley", kind: "scene" } }, DM));
  assert.ok(s.world.nodes["the-valley-2"], "a clash gets -2");
  // Now the valley is kept when the party leaves it: its goblins stay.
  ok(apply(s, { type: "loadMap", node: "cave", map: structuredClone(cave) }, DM));
  assert.ok(Object.values(s.parked["the-valley"].entities).some((e) => e.name === "Goblin Warrior 1"));
  // A world made from nothing.
  const t = newGame(5);
  ok(apply(t, { type: "nodeAdd", node: { name: "Home", kind: "map" }, here: true }, DM));
  assert.equal(t.world.nodes.home.kind, "map");
  assert.equal(t.place, "home");
});

test("plain loadMap with no node does exactly what it did, world or not: the map in play is then no place", () => {
  const s = atKeep();
  ok(apply(s, { type: "loadMap", map: structuredClone(cave) }, DM));
  assert.equal(s.place, null);
  const plain = newGame(5);
  ok(apply(plain, { type: "loadMap", map: structuredClone(cave) }, DM));
  assert.deepEqual(Object.values(s.entities).map((e) => e.pos), Object.values(plain.entities).map((e) => e.pos));
  assert.equal(plain.place, undefined, "a table without a world gets no new field");
  assert.equal(plain.world, undefined); assert.equal(plain.parked, undefined);
});

test("effects across places: what goes with the movers, what stays, what ends", () => {
  const here = { a: { id: "a" }, b: { id: "b" } }, movers = new Set(["a"]);
  const fx = (o) => ({ id: "fx", parts: [], ...o });
  assert.equal(effectFate(fx({ source: "a", parts: [{ target: "a" }] }), movers, here), "go");
  assert.equal(effectFate(fx({ source: "b", parts: [{ target: "b" }] }), movers, here), "stay");
  assert.equal(effectFate(fx({ source: "a", parts: [{ target: "b" }] }), movers, here), "end", "Bless from one who goes on one who stays");
  assert.equal(effectFate(fx({ source: "a", parts: [{ target: "b", ended: true }] }), movers, here), "go", "a part that ended holds nothing");
  assert.equal(effectFate(fx({ source: "a", zone: { follows: "a" } }), movers, here), "go", "Spirit Guardians goes with its caster");
  assert.equal(effectFate(fx({ source: "a", zone: { hexes: [] } }), movers, here), "stay", "a zone laid on the cells stays");
  assert.equal(effectFate(fx({ source: "a", conc: true, zone: { hexes: [] } }), movers, here), "end", "unless its caster concentrates on it");
  assert.equal(effectFate(fx({ source: "b", terrain: true, parts: [{ target: "a" }] }), movers, here), "end", "or holds one who goes");
});

test("companions go with their master, a mount with its rider; a follower of one who goes stops following", () => {
  const s = atKeep();
  const wolf = ok(apply(s, { type: "spawn", monster: "wolf", at: { q: -10, r: 1 } }, DM)).events[0].id;
  ok(apply(s, { type: "bond", actor: wolf, to: "rogue", kind: "pet" }, DM));
  ok(apply(s, { type: "follow", actor: "cleric", leader: "rogue" }, DM));
  refused(s, { type: "loadMap", node: "cave", map: structuredClone(cave), who: [wolf] }, /goes with Pip/);
  const r = ok(apply(s, { type: "loadMap", node: "cave", map: structuredClone(cave), who: ["rogue"] }, DM));
  assert.ok(s.entities[wolf], "the wolf went with Pip");
  assert.equal(s.parked.keep.entities.cleric.follow, undefined, "Odessa stopped following");
  assert.ok(r.events.some((e) => e.type === "follow" && e.id === "cleric" && e.leader === null));
});

test("every field on a creature that names another creature is one a move between places looks after", () => {
  // Reads the engine for `x.<field> = ... y.id` (one creature's id put on another): each such field must be one listed in
  // engine/travel.js (CREATURE_LINKS), or one known not to name a creature.
  const NOT_CREATURES = ["tempFx", "fx", "option", "attuning", "subclass", "armour", "reform", "invest", "uninvested", "id", "imported"];
  const src = new URL("../src/", import.meta.url), files = [];
  const walk = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) { if (f.isDirectory()) { if (f.name !== "content") walk(new URL(`${f.name}/`, d)); } else if (f.name.endsWith(".js")) files.push(new URL(f.name, d)); } };
  walk(src);
  const found = new Set();
  for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/\.([a-zA-Z]+)\s*=\s*\{?\s*[a-zA-Z]*:?\s*[a-zA-Z]+\.id\b/g)) found.add(m[1]);
  const unknown = [...found].filter((k) => !CREATURE_LINKS.includes(k) && !NOT_CREATURES.includes(k));
  assert.deepEqual(unknown, [], "a new field names a creature: say in engine/travel.js what a move between places does with it");
  for (const k of ["follow", "bond", "riding", "rider"]) assert.ok(found.has(k), `${k} is still set from a creature's id`);
});

test("every new action has a label, belongs to one module, and the hidden-ids walk finds `who`", () => {
  for (const t of ["enter", "leave", "goTo", "forgetPlace", "keepPlace", "resetPlace", "nodeAdd"]) assert.ok(ACTION_TYPES.includes(t), t);
  const s = atKeep();
  for (const t of ["enter", "leave", "goTo", "forgetPlace", "keepPlace", "resetPlace", "nodeAdd"]) {
    const d = describeStep({ type: t }, [], s, s);
    assert.ok(!/\(an action\)$/.test(d.label), `${t} has a label: ${d.label}`);
  }
  // A player naming a creature the party does not know of in `who` gets the answer an id that is nothing gets.
  const gob = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: -6, r: 2 }, hidden: true }, DM)).events[0].id;
  const a = refused(s, { type: "place", who: [gob], node: "cave" }, null, PAT), b = refused(s, { type: "place", who: ["m999"], node: "cave" }, null, PAT);
  assert.equal(a.error, b.error);
});

test("staleCheck is pure over the parked places: a holding map never goes stale", () => {
  const s = { clock: 20 * DAY, parked: { nav: { map: holdingMap(1), entities: {}, since: 0, kept: null, stale: null } } };
  const ev = [];
  staleCheck(s, ev);
  assert.deepEqual(ev, []);
});

test("a creature put into a parked place counts what it misses from when it was put there, not from when the place was left", () => {
  const s = atKeep();
  s.entities.wizard.sheet = { items: [{ id: "w", item: "wand-of-magic-missiles", charges: 0 }] };
  ok(apply(s, { type: "loadMap", node: "cave", map: structuredClone(cave) }, DM));
  ok(apply(s, { type: "advanceTime", minutes: 2 * DAY }, DM));
  ok(apply(s, { type: "place", who: ["wizard"], node: "keep", entry: "gate" }, DM));
  assert.equal(s.parked.keep.sinceOf.wizard, s.clock);
  s.parked.keep.entities.wizard.sheet.items[0].charges = 0;                  // spent: it filled at the dawns it had in play
  ok(apply(s, { type: "advanceTime", minutes: DAY }, DM));
  const g = ok(apply(s, { type: "goTo", node: "keep" }, DM));
  const w = g.events.filter((e) => e.type === "recharged" && e.id === "wizard");
  assert.equal(w.length, 1);
  assert.equal(w[0].rolls.length, 1, "one dawn missed at the keep, not three");
});

test("undo size: an arrival's step holds the map left and the map arrived at, no more (Risks, measured in W2)", () => {
  const s = atKeep(), h = createHistory();
  const bytes = [];
  for (const a of [{ type: "loadMap", node: "cave", map: structuredClone(cave) }, { type: "goTo", node: "keep" }, { type: "goTo", node: "cave" }]) {
    const was = h.bytes, m = mark(s), r = ok(apply(s, a, DM));
    h.record(m, s, describeStep(a, r.events, m, s));
    bytes.push(h.bytes - was);
  }
  const maps = json(keep).length + json(cave).length;
  for (const b of bytes) assert.ok(b < maps + 40000, `a step of ${b} bytes for maps of ${maps}`);
});

// ---------- review of #580 ----------

test("M1: nobody walks on a holding map, and a player's walk near a foe they cannot see is refused exactly as one far from it", () => {
  const s = atKeep();
  for (const id of ["fighter", "rogue", "cleric", "wizard"]) s.entities[id].owner = "pat";
  ok(apply(s, { type: "leave" }, DM));
  const taken = new Set(Object.values(s.entities).map((e) => `${e.pos.q},${e.pos.r}`));
  const free = (list) => list.find((h) => !taken.has(`${h.q},${h.r}`));
  const at = free([{ q: 0, r: 3 }, { q: 1, r: 3 }, { q: -1, r: 4 }, { q: 2, r: 2 }]), to = free([{ q: 0, r: 2 }, { q: 1, r: 2 }, { q: -1, r: 3 }]);
  s.entities.fighter.pos = { ...free([{ q: 0, r: 1 }, { q: 1, r: 1 }, { q: -1, r: 2 }]), z: 0 };
  const near = structuredClone(s);
  ok(apply(near, { type: "spawn", monster: "wolf", at, hidden: true }, DM));
  const far = structuredClone(s);
  ok(apply(far, { type: "spawn", monster: "wolf", at: { q: -11, r: 0 }, hidden: true }, DM));
  const walk = { type: "move", actor: "fighter", to };
  const a = refused(near, walk, /Nobody walks here/, PAT), b = refused(far, walk, /Nobody walks here/, PAT), c = refused(structuredClone(s), walk, /Nobody walks here/, PAT);
  assert.equal(a.error, b.error); assert.equal(b.error, c.error);
  refused(near, walk, /Nobody walks here/, DM);
});

test("M3: a parked place's creatures, effects and map are brought up to date by the migration as the place in play's are; one that cannot be read is let go and the DM told", () => {
  const s = atKeep();
  ok(apply(s, { type: "loadMap", node: "cave", map: structuredClone(cave), who: ["fighter"] }, DM));
  const old = JSON.parse(json(s));
  old.version = 22;
  const w = old.parked.keep.entities.wizard;
  w.cond.prone = true; delete w.speeds; delete w.pos.z;                 // as a version 2-5 save had them
  migrate(old);
  const m = old.parked.keep.entities.wizard;
  assert.deepEqual(m.cond.prone, {}, "a condition is a record");
  assert.deepEqual(m.speeds, {}); assert.equal(m.pos.z, 0);
  assert.equal(old.version, VERSION);
  // A record that cannot be read.
  const bad = JSON.parse(json(s));
  bad.parked.ruin = { map: "x" };
  const n = bad.timeline.length;
  migrate(bad);
  assert.equal(bad.parked.ruin, undefined);
  assert.ok(bad.parked.keep, "the others are kept");
  const note = bad.timeline[n];
  assert.equal(note.type, "manual"); assert.match(note.text, /ruin/); assert.equal(note.partial, true);
  assert.deepEqual(viewEvents([note], bad, PAT), [], "the DM's alone");
});

test("L1: the cap counts parked places only: a first visit from a navigation node with sixteen parked is allowed, from a battle place it is not", () => {
  const s = atKeep();
  for (let i = 0; i < TRAVEL_LIMITS.parked; i++) ok(apply(s, { type: "nodeAdd", node: { name: `Room ${i}`, kind: "map" }, map: structuredClone(tavern) }, DM));
  refused(s, { type: "loadMap", node: "cave", map: structuredClone(cave) }, /Sixteen places hold changes/);    // the keep would be the seventeenth parked
  ok(apply(s, { type: "forgetPlace", node: "room-0" }, DM));
  ok(apply(s, { type: "leave" }, DM));                                       // the keep parked: sixteen
  ok(apply(s, { type: "enter", pin: "p-cave", map: structuredClone(cave) }, DM));   // in play, not parked: still sixteen
  assert.equal(s.place, "cave");
  assert.equal(Object.values(s.parked).filter((r) => !r.map.holding).length, 16);
});

test("L2: a move's label names to players only the party they know of, and tells them nothing of a move of no party member", () => {
  const s = atKeep();
  const gob = ok(apply(s, { type: "spawn", monster: "goblin-warrior", name: "Sneak", at: { q: -6, r: 2 }, hidden: true }, DM)).events[0].id;
  const a = { type: "place", who: [gob], node: "continent" }, m = mark(s), r = ok(apply(s, a, DM));
  const d = describeStep(a, r.events, m, s);
  assert.match(d.label, /Sneak was placed at The continent/);
  assert.equal(d.shown, null);
  const e = { type: "loadMap", node: "cave", map: structuredClone(cave), who: ["rogue"] }, me = mark(s), re = ok(apply(s, e, DM));
  assert.equal(describeStep(e, re.events, me, s).shown, "Pip moved on");
});

test("L5: what is left of the lasting effects of a place let go ends, told as ended", () => {
  const s = atKeep();
  ok(apply(s, { type: "leave" }, DM));
  s.effects.push({ id: "fx90", name: "Something lingering", spell: null, source: null, conc: false, lasts: "1 hour", until: { clock: s.clock + 60 }, parts: [] });
  const r = ok(apply(s, { type: "enter", pin: "p-port" }, DM));
  assert.ok(r.events.some((e) => e.type === "effectEnd" && e.fx === "fx90"));
  assert.equal(s.parked.continent, undefined);
  // forgetPlace too.
  ok(apply(s, { type: "place", who: ["wizard"], node: "keep", entry: "gate" }, DM));
  ok(apply(s, { type: "goTo", node: "keep" }, DM));
  ok(apply(s, { type: "goTo", node: "port" }, DM));
  ok(apply(s, { type: "place", who: ["wizard"], node: "port" }, DM));
  s.parked.keep.effects.push({ id: "fx91", name: "Left behind", spell: null, source: null, conc: false, lasts: "1 hour", until: { clock: s.clock + 60 }, parts: [] });
  const f = ok(apply(s, { type: "forgetPlace", node: "keep" }, DM));
  assert.ok(f.events.some((e) => e.type === "effectEnd" && e.fx === "fx91"));
});

test("an effect ended by forgetPlace or resetPlace is told to its source's player without the place's name or id", () => {
  for (const how of ["forget", "reset"]) {
    const s = atKeep();
    s.world.nodes.keep.name = "The Canary Vault";
    s.entities.wizard.owner = "pat";
    ok(apply(s, { type: "loadMap", node: "cave", map: structuredClone(cave), who: ["fighter", "rogue", "cleric"] }, DM));
    if (how === "forget") ok(apply(s, { type: "place", who: ["wizard"], node: "cave" }, DM));
    const rec = s.parked.keep;
    rec.effects.push({ id: "fx95", name: "Alarm", spell: "alarm", source: "wizard", conc: false, lasts: "8 hours", until: { clock: s.clock + 480 }, parts: [], zone: { hexes: [] } });
    // The wizard, gone or still there, is the source; the player must hear only that it ended.
    const r = ok(apply(s, how === "forget" ? { type: "forgetPlace", node: "keep" } : { type: "resetPlace", node: "keep", map: keepMap() }, DM));
    assert.ok(r.events.some((e) => e.type === "effectEnd" && e.fx === "fx95"), how);
    for (const st of [s, { ...s, entities: { ...s.entities, ...(s.parked.keep?.entities ?? {}) } }]) {
      const told = json(viewEvents(r.events, st, PAT));
      for (const k of ["Canary", "Vault", '"keep"', "Greywatch"]) assert.ok(!told.includes(k), `${how}: no ${k} in a player's events`);
    }
    if (how === "forget") assert.ok(viewEvents(r.events, s, PAT).some((e) => e.type === "effectEnd"), "the wizard's player is told it ended");
  }
});
