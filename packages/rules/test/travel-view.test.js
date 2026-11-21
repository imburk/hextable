// Travel W4 (docs/specs/travel.md, Decisions 4, 5 and 12; build row W4): what players are sent of a world, by allow list. The place in play
// is sent to every player alike; a player whose characters are parked is marked `watching`; the atlas has only the places they know, by ids
// they were given; in-character talk of a parked group stays at its place; no DM-only canary reaches a player.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import { knownOf, playerNode, showPlace, showRoute } from "../src/known.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";
import keep from "../src/content/maps/keep.js";
import cave from "../src/content/maps/cave.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };       // the fighter and the rogue
const SAM = { role: "player", userId: "sam" };       // the cleric and the wizard
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
function refused(s, action, words, ctx = DM) {
  const before = json(s);
  const r = apply(s, action, ctx);
  assert.equal(r.ok, false, `${action.type} should be refused`);
  if (words) assert.match(r.error, words);
  assert.equal(json(s), before, "a refused action changes nothing");
  return r;
}
const GATE = [{ q: -13, r: 1 }, { q: -12, r: 1 }];
const keepMap = () => {
  const m = structuredClone(keep);
  m.entries = [{ id: "gate", name: "The gatehouse", kind: "gate" }];
  m.starts = [...m.starts, ...GATE.map((h) => ({ level: "ground", ...h, entry: "gate" }))];
  return m;
};
// A world with a place nobody visits or is shown, called by a canary.
function world(s) {
  s.world = { id: "river-country", name: "The river country", version: 1, hash: null, root: "continent", routes: [
    { id: "road", from: "keep", to: { node: "cave" }, mode: "foot", miles: 12, encounters: { table: "road-table", every: 240, roll: "engine" }, wayside: ["forest-road"] },
    { id: "secret-road", from: "keep", to: { node: "secret-lair" }, mode: "foot", miles: 3 }], tables: [], nodes: {
    continent: { id: "continent", kind: "nav", scale: "world", name: "The continent", image: "a1", pins: [
      { id: "p-keep", at: [100, 100], name: "The keep", to: "keep", entry: "gate" },
      { id: "p-cave", at: [200, 200], name: "The cave", to: "cave" },
      { id: "p-lair", at: [500, 500], name: "Hidden pin", to: "secret-lair" }] },
    keep: { id: "keep", kind: "map", scale: "tactical", parent: "continent", name: "The keep", entries: [{ id: "gate", name: "The gatehouse", kind: "gate" }, { id: "roof", name: "The roof", kind: "roof" }] },
    cave: { id: "cave", kind: "map", scale: "tactical", parent: "continent", name: "The cave" },
    "secret-lair": { id: "secret-lair", kind: "map", scale: "tactical", parent: "continent", name: "CANARYNAME the lair" },
  } };
  s.place = null; s.parked = {}; s.journey = null;
  s.entities.fighter.owner = "pat"; s.entities.rogue.owner = "pat";
  s.entities.cleric.owner = "sam"; s.entities.wizard.owner = "sam";
  return s;
}
// Everything a player could be sent, as text: the view and the events they were told.
function sentTo(ctx, s, events = []) { return json({ v: view(s, ctx), e: viewEvents(events, s, ctx) }); }
const CANARIES = ['"secret-lair"', "CANARY", '"p-lair"', '"secret-road"', '"p-keep"', '"p-cave"', '"continent"', '"road-table"', "forest-road"];

// The party at the keep, then split: the fighter and the rogue to the cave (in play), the cleric and the wizard at the keep (parked).
function split() {
  const s = world(newGame(5));
  ok(apply(s, { type: "loadMap", node: "keep", map: keepMap(), entry: "gate" }, DM));
  ok(apply(s, { type: "loadMap", node: "cave", map: structuredClone(cave), who: ["fighter", "rogue"] }, DM));
  return s;
}

test("with no world every player is sent what they were sent before: no atlas, no away, no watching", () => {
  const s = newGame(5);
  const was = json(view(s, PAT));
  for (const k of ["atlas", "away", "watching"]) assert.equal(view(s, PAT)[k], undefined);
  s.world = { id: "w", name: "W", version: 1, hash: null, root: "a", routes: [], tables: [], nodes: { a: { id: "a", kind: "nav", name: "A", pins: [] } } };
  assert.equal(json(view(s, PAT)), was, "a world the table is not at changes nothing a player is sent");
  ok(apply(s, { type: "say", as: null, text: "hello", userName: "Pat" }, PAT));
  assert.equal(s.known, undefined, "a table that never stood at a place keeps no record of known ones");
});

test("a player is sent the places they know, by ids they were given, and never the pack's", () => {
  const s = world(newGame(5));
  ok(apply(s, { type: "loadMap", node: "keep", map: keepMap(), entry: "gate" }, DM));
  const a = view(s, PAT).atlas;
  assert.equal(a.name, "The river country");
  assert.deepEqual(Object.keys(a.nodes), ["pl1", "pl2"], "the continent above the keep, in the order they were known");
  assert.equal(a.here, "pl2");
  assert.deepEqual(a.nodes.pl2, { id: "pl2", name: "The keep", kind: "map", scale: "tactical", parent: "pl1", entries: [{ id: "ent1", name: "The gatehouse", kind: "gate" }] });
  assert.deepEqual(a.nodes.pl1.pins, [{ id: "pin1", name: "The keep", at: [100, 100], to: "pl2", entry: "ent1" }], "only the pin that leads to a place they know");
  assert.equal(a.nodes.pl1.image, "a1");
  assert.deepEqual(a.markers.map((m) => m.ids.sort()), [["cleric", "fighter", "rogue", "wizard"]]);
  assert.equal(a.markers[0].node, "pl2");
  const text = sentTo(PAT, s);
  for (const c of CANARIES) assert.ok(!text.includes(c), c);
  // The roof is neither arrived by nor a gate: not sent.
  assert.ok(!text.includes("The roof"));
  // Ids hold as places are added.
  ok(apply(s, { type: "loadMap", node: "cave", map: structuredClone(cave) }, DM));
  const b = view(s, PAT).atlas;
  assert.deepEqual(Object.keys(b.nodes), ["pl1", "pl2", "pl3"]);
  assert.equal(b.nodes.pl2.name, "The keep");
  assert.equal(b.nodes.pl3.name, "The cave");
  assert.equal(b.here, "pl3");
  assert.deepEqual(b.markers.map((m) => m.node), ["pl3"], "the party left the keep: nobody is there");
});

test("the DM shows a place or a route; a route is sent only between places they know", () => {
  const s = world(newGame(5));
  ok(apply(s, { type: "loadMap", node: "keep", map: keepMap(), entry: "gate" }, DM));
  assert.equal(showRoute(s, { route: "road" }), null);
  assert.deepEqual(view(s, PAT).atlas.routes, [], "the cave is not known: the road is not sent");
  assert.equal(showPlace(s, { node: "cave" }), null);
  const r = view(s, PAT).atlas.routes;
  assert.equal(r.length, 1);
  assert.deepEqual(r[0], { id: "rt1", from: { node: "pl2" }, to: { node: "pl3" }, mode: "foot", miles: 12 }, "no encounters, table or wayside");
  assert.ok(!sentTo(PAT, s).includes("road-table"));
  assert.match(showPlace(s, { node: "nowhere" }), /no place/);
  assert.match(showRoute(s, { route: "nowhere" }), /no route/);
  assert.match(showPlace(s, { node: "keep", pin: "x" }), /no pin/);
  assert.equal(playerNode(s, "secret-lair"), null);
  assert.deepEqual(knownOf(s).routes, ["road"]);
  // A route never shown stays unsent, though both its ends were known.
  showPlace(s, { node: "secret-lair" });
  assert.equal(view(s, PAT).atlas.routes.length, 1);
});

test("a watcher is sent exactly what a player of the group in play is sent; no DM-only canary reaches one (Decision 12)", () => {
  const s = split();
  const gob = ok(apply(s, { type: "spawn", monster: "goblin-warrior", name: "Snagtooth", at: { q: s.entities.fighter.pos.q + 3, r: s.entities.fighter.pos.r } }, DM)).events[0].id;
  ok(apply(s, { type: "reveal", actor: gob, hidden: true }, DM));            // a hidden creature in the place in play
  // The keep's own creatures, in the parked place: never sent to anyone.
  s.parked.keep.entities.cleric.cond = { ...(s.parked.keep.entities.cleric.cond ?? {}), poisoned: { source: "keepgob" } };
  s.parked.keep.entities.keepgob = { ...structuredClone(s.entities[gob]), id: "keepgob", name: "Tied-up Keepgob" };
  const note = ok(apply(s, { type: "note", to: "pat", text: "DMSECRETNOTE" }, DM)).events;
  const events = [...ok(apply(s, { type: "advanceTime", minutes: 5 }, DM)).events, ...ok(apply(s, { type: "say", as: "fighter", text: "Hello" }, PAT)).events];
  assert.equal(json(viewEvents(note, s, SAM)), "[]", "a note to one player goes to that player: a watcher is not added to it");
  assert.match(json(viewEvents(note, s, PAT)), /DMSECRETNOTE/);
  const pat = view(s, PAT), sam = view(s, SAM);
  assert.equal(pat.watching, undefined);
  assert.deepEqual(sam.watching, { mode: "live", at: ["pl2"] });
  const strip = (v) => { const { watching, away, handouts, reactions, prompt, ...rest } = v; return rest; };
  assert.equal(json(strip(sam)), json(strip(pat)), "the same map, creatures and fight");
  assert.equal(json(viewEvents(events, s, SAM)), json(viewEvents(events, s, PAT)), "the same events");
  assert.ok(viewEvents(events, s, SAM).some((e) => e.text === "Hello"));
  // The place in play is the cave; both are sent the party of the cave and the cave's map, not the keep's.
  assert.deepEqual(Object.keys(sam.entities).sort(), ["fighter", "rogue"]);
  for (const ctx of [PAT, SAM]) {
    const text = sentTo(ctx, s, events);
    for (const c of [...CANARIES, gob, "Snagtooth", "keepgob", "Keepgob", "DMSECRETNOTE"]) if (!(c === "DMSECRETNOTE" && ctx === PAT)) assert.ok(!text.includes(c), `${c} reached ${ctx.userId}`);
  }
  // Away: each is sent the other group's characters as read-only sheets, with who they are near scrubbed.
  assert.deepEqual(Object.keys(pat.away).sort(), ["cleric", "wizard"]);
  assert.equal(pat.away.cleric.node, "pl2");
  assert.equal(pat.away.cleric.record.cond.poisoned.source, "someone");
  assert.deepEqual(Object.keys(sam.away).sort(), ["cleric", "wizard"], "a watcher's own characters are away sheets too");
  assert.deepEqual(sam.atlas.markers.map((m) => [m.node, m.ids.sort()]).sort(), [["pl2", ["cleric", "wizard"]], ["pl3", ["fighter", "rogue"]]]);
  // Nothing of the parked place: its map is not in the view.
  assert.equal(sam.map.id, "cave");
  // The DM is sent the state.
  assert.equal(view(s, DM), s);
});

test("a line said in character in the place in play is heard by every player; a parked group's reaches its own players and the DM", () => {
  const s = split();
  const said = (ctx, as, text) => ok(apply(s, { type: "say", as, text, userName: "x" }, ctx)).events;
  const here = said(PAT, "fighter", "From the cave");
  assert.equal(here[0].node, "cave");
  for (const ctx of [PAT, SAM]) assert.deepEqual(viewEvents(here, s, ctx).map((e) => [e.text, e.node]), [["From the cave", "pl3"]]);
  const far = said(SAM, "cleric", "From the keep");
  assert.equal(far[0].far, true);
  assert.equal(far[0].node, "keep");
  assert.deepEqual(viewEvents(far, s, SAM).map((e) => [e.text, e.node]), [["From the keep", "pl2"]]);
  assert.deepEqual(viewEvents(far, s, PAT), [], "the cave's players do not hear the keep");
  assert.equal(viewEvents(far, s, DM), far);
  assert.ok(!json(viewEvents(far, s, SAM)).includes('"to"') && !json(viewEvents(far, s, SAM)).includes("far"), "who it was for is not sent");
  // Out of character: everyone, from anywhere.
  const oc = said(SAM, null, "Out of character");
  for (const ctx of [PAT, SAM]) assert.equal(viewEvents(oc, s, ctx)[0].text, "Out of character");
  // A character that is not theirs, parked or not, is refused the same way.
  refused(s, { type: "say", as: "wizard", text: "x" }, /speak only as your own/, PAT);
  refused(s, { type: "say", as: "keepgob", text: "x" }, /speak only as your own/, SAM);
});

test("with the table rule watching: off, a watcher is sent the band alone and the talk, and the record shows no more", () => {
  const s = split();
  ok(apply(s, { type: "setting", key: "watching", value: "off" }, DM));
  refused(s, { type: "setting", key: "watching", value: "maybe" }, /can be/);
  const gob = ok(apply(s, { type: "spawn", monster: "goblin-warrior", name: "Snagtooth", at: { q: s.entities.fighter.pos.q + 3, r: s.entities.fighter.pos.r } }, DM)).events[0].id;
  const sam = view(s, SAM);
  assert.deepEqual(sam.watching, { mode: "off", at: ["pl2"] });
  assert.deepEqual([sam.entities, sam.encounter, sam.scene, sam.map.levels, sam.map.objects, sam.prompt], [{}, null, null, [], [], null]);
  assert.ok(sam.atlas && sam.away.cleric, "the band and their own sheets");
  const mine = ok(apply(s, { type: "say", as: null, text: "chatter", userName: "Pat" }, PAT)).events;
  const inChar = ok(apply(s, { type: "say", as: "fighter", text: "In the cave" }, PAT)).events;
  const moved = ok(apply(s, { type: "advanceTime", minutes: 5 }, DM)).events;
  assert.deepEqual(viewEvents([...mine, ...inChar, ...moved], s, SAM).map((e) => e.text), ["chatter"], "the talk and nothing else");
  assert.ok(!sentTo(SAM, s, [...mine, ...inChar, { type: "spawned", id: gob }]).includes(gob));
  // A player of the group in play is sent the scene as ever, and a player with a character in play is not a watcher.
  assert.equal(Object.keys(view(s, PAT).entities).length > 2, true);
  s.entities.fighter.owner = "sam";
  assert.equal(view(s, SAM).watching, undefined, "a player with characters in two groups gets the view as a member");
});

test("a player's place, pin and entry ids are the ones they were given; any other is refused as a place that does not exist, and nothing changes", () => {
  const s = world(newGame(5));
  ok(apply(s, { type: "loadMap", node: "keep", map: keepMap(), entry: "gate" }, DM));
  const nothing = /There is no such place\./;
  for (const a of [{ type: "goTo", node: "pl9" }, { type: "goTo", node: "cave" }, { type: "goTo", node: "secret-lair" }, { type: "enter", pin: "p-lair" }, { type: "enter", pin: "pin9" },
    { type: "loadMap", node: "cave" }, { type: "cast", actor: "cleric", spell: "light", node: "pl7", entry: "ent1" }, { type: "enter", pin: ["pin1"] }, { type: "enter", pin: "__proto__" }]) refused(s, a, nothing, PAT);
  // The same answer for an id the world has and one it does not.
  assert.equal(apply(s, { type: "goTo", node: "pl3" }, PAT).error, apply(s, { type: "goTo", node: "zzz" }, PAT).error);
  // An id they were given gets past the translation and meets the rule that is already there (W5 opens it to players).
  refused(s, { type: "goTo", node: "pl1" }, /Only the DM/, PAT);
  // The DM names places by the pack's ids as ever; a table with no world answers as before.
  ok(apply(s, { type: "loadMap", node: "cave", map: structuredClone(cave) }, DM));
  const plain = newGame(5);
  refused(plain, { type: "goTo", node: "pl1" }, /Only the DM/, PAT);
});

test("what is known only grows, is part of the state, and an undone arrival leaves no id behind", () => {
  const s = world(newGame(5));
  const before = structuredClone(s);
  ok(apply(s, { type: "loadMap", node: "keep", map: keepMap(), entry: "gate" }, DM));
  assert.deepEqual(knownOf(s).nodes, ["continent", "keep"]);
  const after = structuredClone(s);
  assert.equal(before.known, undefined);
  assert.equal(view(after, PAT).atlas.nodes.pl2.name, "The keep");
  assert.equal(view(before, PAT).atlas, undefined);
  ok(apply(s, { type: "loadMap", node: "cave", map: structuredClone(cave) }, DM));
  assert.deepEqual(knownOf(s).nodes, ["continent", "keep", "cave"]);
  assert.deepEqual(knownOf(s).pins.continent, ["p-keep", "p-cave"]);
  // Another world starts the lists again.
  s.world.id = "other";
  ok(apply(s, { type: "advanceTime", minutes: 1 }, DM));
  assert.deepEqual(knownOf(s).nodes, ["continent", "cave"], "the party is at the cave; the keep (parked) is known too once the world's own parked record says so");
});

test("under watching: off a parked group's in-character line is still heard by the players of that group, and not by the group in play", () => {
  const s = split();
  const KIM = { role: "player", userId: "kim" };
  s.entities.fighter.owner = "pat";
  s.parked.keep.entities.wizard.owner = "kim";                    // the keep's group has two players: Sam (cleric) and Kim (wizard)
  ok(apply(s, { type: "setting", key: "watching", value: "off" }, DM));
  const far = ok(apply(s, { type: "say", as: "cleric", text: "KEEPLINE" }, SAM)).events;
  assert.deepEqual(viewEvents(far, s, SAM).map((e) => e.text), ["KEEPLINE"], "the speaker hears it");
  assert.deepEqual(viewEvents(far, s, KIM).map((e) => e.text), ["KEEPLINE"], "and so does the other player there");
  assert.deepEqual(viewEvents(far, s, PAT), [], "the group in play does not");
  assert.deepEqual(view(s, KIM).watching, { mode: "off", at: ["pl2"] });
  // The place in play's in-character line is not told to an off watcher; out of character still is.
  const here = ok(apply(s, { type: "say", as: "fighter", text: "CAVELINE" }, PAT)).events;
  assert.deepEqual(viewEvents(here, s, SAM), []);
});

test("a parked group's lines are capped like a scene's, and a full scene gives a bad speaker the answer it always did", () => {
  const s = split();
  s.parked.keep.said = 5000;
  refused(s, { type: "say", as: "cleric", text: "flood" }, /gone on long enough/, SAM);
  ok(apply(s, { type: "say", as: "fighter", text: "the cave is another count" }, PAT));
  s.parked.keep.said = 4999;
  ok(apply(s, { type: "say", as: "cleric", text: "last one" }, SAM));
  assert.equal(s.parked.keep.said, 5000);
  refused(s, { type: "say", as: "cleric", text: "one more" }, /gone on long enough/, SAM);
  // A scene in play that is full: the old order of checks, whatever the speaker.
  ok(apply(s, { type: "scene", scene: { title: "S" } }, DM));
  s.scene.said = 5000;
  refused(s, { type: "say", as: "wizard", text: "x" }, /This scene has gone on long enough/, PAT);
  refused(s, { type: "say", as: "nobody", text: "x" }, /This scene has gone on long enough/, PAT);
});

test("a new version of the same world (another hash) starts what the players know again", () => {
  const s = world(newGame(5));
  s.world.hash = "a".repeat(64);
  ok(apply(s, { type: "loadMap", node: "keep", map: keepMap(), entry: "gate" }, DM));
  showPlace(s, { node: "cave" });
  assert.deepEqual(knownOf(s).nodes, ["continent", "keep", "cave"]);
  s.world.hash = "b".repeat(64);
  assert.equal(knownOf(s), null, "the old lists name nothing in the new content");
  assert.equal(view(s, PAT).atlas, undefined);
  ok(apply(s, { type: "advanceTime", minutes: 1 }, DM));
  assert.deepEqual(knownOf(s).nodes, ["continent", "keep"], "only what the party stands in");
  assert.equal(view(s, PAT).atlas.nodes.pl2.name, "The keep");
});

// ---- the arrival line (#650) ----
test("a group's arrival is told to the DM whole, and to a player as the place they were given and the party's own, nothing of how it came", () => {
  const s = world(newGame(5));
  const ev = ok(apply(s, { type: "loadMap", node: "keep", map: keepMap(), entry: "gate" }, DM)).events;
  const dm = ev.find((e) => e.type === "arrived");
  assert.equal(dm.node, "keep");
  assert.equal(viewEvents(ev, s, DM), ev, "the DM is sent the events as they are");
  for (const ctx of [PAT, SAM]) {
    const told = viewEvents(ev, s, ctx).filter((e) => e.type === "arrived");
    assert.equal(told.length, 1);
    assert.deepEqual(told[0], { type: "arrived", node: "pl2", name: "The keep", ids: dm.ids }, "the id they were given and the atlas's name; no entry, pin or from");
    assert.equal(told[0].node, view(s, ctx).atlas.here, "the place the atlas says they are at");
  }
  // A later move of a few of the party: the same line, with who went; the others are told it too.
  const more = ok(apply(s, { type: "loadMap", node: "cave", map: structuredClone(cave), who: ["fighter", "rogue"] }, DM)).events;
  assert.deepEqual(viewEvents(more, s, SAM).filter((e) => e.type === "arrived").map((e) => [e.node, e.name, e.ids.sort()]), [["pl3", "The cave", ["fighter", "rogue"]]]);
  // From the record later, with the group parked elsewhere, the line is the same.
  ok(apply(s, { type: "goTo", node: "keep" }, DM));
  assert.equal(json(viewEvents(more, s, PAT).filter((e) => e.type === "arrived")), json([{ type: "arrived", node: "pl3", name: "The cave", ids: ["fighter", "rogue"] }]));
});

test("an arrival at a place a player was not given, or by a group they may not know of, is no event for them; a watcher with watching: off gets nothing", () => {
  const s = world(newGame(5));
  const ev = ok(apply(s, { type: "loadMap", node: "keep", map: keepMap(), entry: "gate" }, DM)).events;
  // The place is not one they know of (the lists name nothing: a new version of the world).
  const old = s.world.hash;
  s.world.hash = "c".repeat(64);
  assert.equal(knownOf(s), null);
  assert.deepEqual(viewEvents(ev, s, PAT).filter((e) => e.type === "arrived"), []);
  assert.equal(viewEvents(ev, s, DM).filter((e) => e.type === "arrived").length, 1, "the DM always");
  s.world.hash = old;
  // The pack's own id of a place the players are not given is never in the event: a DM-only place arrived at without being known leaves no id.
  const forged = [{ type: "arrived", node: "secret-lair", name: "CANARYNAME the lair", ids: ["fighter"] }];
  assert.deepEqual(viewEvents(forged, s, PAT), []);
  // A group none of whom the players may know of (a creature that is not of the party and cannot be seen) is not told.
  const gob = ok(apply(s, { type: "spawn", monster: "goblin-warrior", name: "Snagtooth", at: { q: s.entities.fighter.pos.q + 3, r: s.entities.fighter.pos.r } }, DM)).events[0].id;
  ok(apply(s, { type: "reveal", actor: gob, hidden: true }, DM));
  const withGob = [{ type: "arrived", node: "keep", name: "The keep", ids: [gob, "fighter"] }, { type: "arrived", node: "keep", name: "The keep", ids: [gob] }];
  const told = viewEvents(withGob, s, PAT);
  assert.deepEqual(told.map((e) => e.ids), [["fighter"]], "the hidden creature is not named; a group of nobody they know is no line");
  assert.ok(!json(told).includes(gob));
  // A watcher whose characters are in another place, with watching off, is sent nothing of the place in play.
  const t = split();
  ok(apply(t, { type: "setting", key: "watching", value: "off" }, DM));
  const arrival = ok(apply(t, { type: "loadMap", node: "continent", who: ["fighter"] }, DM)).events;
  assert.ok(arrival.some((e) => e.type === "arrived" && e.node === "continent"));
  assert.deepEqual(view(t, SAM).watching, { mode: "off", at: ["pl2"] }, "Sam's characters are at the keep");
  assert.deepEqual(viewEvents(arrival, t, SAM), [], "nothing of the place in play");
  assert.deepEqual(viewEvents(arrival, t, PAT).filter((e) => e.type === "arrived").map((e) => [e.node, e.name, e.ids]), [["pl1", "The continent", ["fighter"]]]);
  // Under watching: live a watcher is told as the players there are.
  ok(apply(t, { type: "setting", key: "watching", value: "live" }, DM));
  assert.equal(json(viewEvents(arrival, t, SAM)), json(viewEvents(arrival, t, PAT)));
});
