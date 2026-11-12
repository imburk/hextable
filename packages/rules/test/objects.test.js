// Objects with states, triggers and links; hidden things (task M4 of docs/specs/maps-and-objects.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, PACKS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";
import { apply, current, moveOptions, usesFor } from "../src/engine.js";
import * as H from "../src/hex.js";
import { lintMap, newMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";
import { edgeSegment } from "../src/walls.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const types = (r) => r.events.map((e) => e.type);
const obj = (s, id) => s.map.objects.find((o) => o.id === id);

// A definition that is not in the pack, held to the same linter.
function define(def) {
  assert.deepEqual(lintPack({ pack: PACKS[0].pack, objects: [def] }), [], def.id);
  CONTENT.objects[def.id] = def;
}
// An open stone floor with the given objects on it; the fighter is Pat's and stands at -2,0.
function floor(objects = [], walls = []) {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 6).map((h) => [H.col(h), { t: "stone" }]));
  const s = newGame(8);
  ok(apply(s, { type: "loadMap", map: newMap({ id: "floor", name: "A floor", starts: [{ q: -4, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }], walls, objects }) }, DM));
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  apply(s, { type: "claim", entity: "fighter", user: "pat", userName: "Pat" }, PAT);
  ok(apply(s, { type: "place", actor: "fighter", to: { q: -2, r: 0 } }, DM));
  return s;
}
// Run `act` on copies of the state with different dice until `want` holds; returns that state and result.
function until(s, act, want) {
  for (let seed = 1; seed < 400; seed++) {
    const c = structuredClone(s); c.rng = seed;
    const r = act(c);
    if (want(r, c)) return { s: c, r };
  }
  throw new Error("no seed gave the wanted outcome");
}
const thing = (id, def, q, r, more = {}) => ({ id, def, level: "ground", at: { q, r }, state: CONTENT.objects[def].initial, ...more });
const sent = (s, res) => JSON.stringify([view(s, PAT), viewEvents(res?.events ?? [], s, PAT)]);

test("the pack's objects pass the linter, and the linter knows the new steps and triggers", () => {
  assert.deepEqual(lintPack(PACKS[0]), []);
  const bad = (id, change) => { const o = structuredClone(CONTENT.objects[id]); change(o); return lintPack({ pack: PACKS[0].pack, objects: [o] }).join(" | "); };
  assert.match(bad("pit-trap", (o) => { o.triggers[0].on = "touch"; }), /`on` must be one of enter, leave, near/);
  assert.match(bad("pit-trap", (o) => { o.triggers[0].from = ["armed"]; }), /`from` must list the states/);
  assert.match(bad("pit-trap", (o) => { o.triggers[0].effects[0].onFail[0].fall = -5; }), /`fall` must be/);
  assert.match(bad("pit-trap", (o) => { delete o.find; }), /hidden state needs `find/);
  assert.match(bad("pit-trap", (o) => { o.triggers[0].effects.push({ manual: "The DM decides." }); }), /marked auto but contains a manual step/);
  assert.match(bad("pit-trap", (o) => { o.triggers[0].effects.push({ set: "Open!" }); }), /`set` must name a state/);
  assert.match(bad("pit-trap", (o) => { o.triggers[0].effects.push({ reveal: "everything" }); }), /`reveal` must be/);
  assert.match(bad("pit-trap", (o) => { o.triggers[0].effects.push({ move: 7, dir: "away" }); }), /multiple of 5/);
  assert.match(bad("secret-door", (o) => { o.triggers = [{ on: "enter", from: ["secret"], to: "open" }]; }), /only a thing in a hex can have triggers/);
  assert.match(bad("lever", (o) => { o.find = { to: "up" }; }), /only for something with a hidden state/);
  const s = floor([thing("lever", "lever", 0, 0, { links: [{ object: "ghost", when: "down", sets: "raised" }] })].slice(0, 0));
  const map = structuredClone(s.map);
  map.objects.push(thing("lever", "lever", 0, 0, { links: [{ object: "ghost", when: "down", sets: "raised" }] }));
  assert.match(lintMap(map).join(), /linked to something that is not on the map/);
});

test("a hidden pit is not sent to players, stops whoever steps on it, and drops them unless they leap clear", () => {
  const s0 = floor([thing("pit", "pit-trap", 1, 0)]);
  assert.equal(view(s0, PAT).map.objects.length, 0);
  assert.equal(sent(s0).includes("pit"), false);
  assert.equal(sent(s0).toLowerCase().includes("trap"), false);
  const walk = (c) => apply(c, { type: "move", actor: "fighter", to: { q: 3, r: 0 } }, PAT);
  const failed = until(s0, walk, (r) => r.events.some((e) => e.type === "fell"));
  assert.deepEqual(types(failed.r), ["moved", "triggered", "object", "save", "fell", "damage", "cond"]);
  assert.deepEqual(failed.s.entities.fighter.pos, { q: 1, r: 0, z: 0 });                 // the walk ended on the trap, not at 3,0
  assert.equal(failed.r.events.at(-1).cond, "prone");
  assert.equal(failed.r.events.find((e) => e.type === "fell").feet, 10);
  assert.equal(failed.r.events.find((e) => e.type === "save").dc, 15);
  assert.equal(obj(failed.s, "pit").state, "open");
  const seen = viewEvents(failed.r.events, failed.s, PAT);
  assert.deepEqual(seen.map((e) => e.type), ["moved", "triggered", "object", "save", "fell", "damage", "cond"]);
  assert.deepEqual(view(failed.s, PAT).map.objects.map((o) => [o.id, o.state]), [["pit", "open"]]);
  // Leaping clear: no fall, but the pit is open now and the walk still ended there.
  const leapt = until(s0, walk, (r) => r.events.some((e) => e.type === "save" && e.success));
  assert.deepEqual(types(leapt.r), ["moved", "triggered", "object", "save"]);
  assert.equal(leapt.s.entities.fighter.hp, s0.entities.fighter.hp);
  assert.deepEqual(leapt.s.entities.fighter.pos, { q: 1, r: 0, z: 0 });
});

test("a trap that has been spotted is walked around, and monsters walk around their own", () => {
  const s = floor([thing("pit", "pit-trap", 1, 0)]);
  ok(apply(s, { type: "setObject", object: "pit", state: "found" }, DM));
  assert.deepEqual(view(s, PAT).map.objects.map((o) => [o.id, o.state]), [["pit", "found"]]);
  const res = ok(apply(s, { type: "move", actor: "fighter", to: { q: 3, r: 0 } }, PAT));
  assert.deepEqual(types(res), ["moved"]);
  assert.deepEqual(s.entities.fighter.pos, { q: 3, r: 0, z: 0 });
  assert.equal(res.events[0].path.some((h) => h.q === 1 && h.r === 0), false);
  // Stepping onto it on purpose is still allowed, and still sets it off.
  const dare = structuredClone(s);
  assert.ok(types(ok(apply(dare, { type: "move", actor: "fighter", to: { q: 1, r: 0 } }, PAT))).includes("triggered"));
  // A hidden one: the goblin whose lair it is does not step on it; the party's rogue would.
  ok(apply(s, { type: "setObject", object: "pit", state: "hidden" }, DM));
  const gob = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 0, r: 0 } }, DM)).events[0].id;
  assert.equal(moveOptions(s, s.entities[gob]).has("1,0"), false);
  assert.equal(moveOptions(s, s.entities.rogue).has("1,0"), true);
});

test("an arrow trap attacks from where it stands, and players see the outcome but not the roll", () => {
  const s0 = floor([thing("arrow", "arrow-trap", 0, 0)]);
  const walk = (c) => apply(c, { type: "move", actor: "fighter", to: { q: 2, r: 0 } }, PAT);
  const hit = until(s0, walk, (r) => r.events.some((e) => e.type === "attack" && e.hit && !e.crit));
  assert.deepEqual(types(hit.r), ["moved", "triggered", "object", "attack", "damage"]);
  const atk = hit.r.events.find((e) => e.type === "attack");
  assert.equal(atk.actor, null);
  assert.equal(atk.name, "Arrow trap");
  assert.equal(atk.total, atk.nat + 6);
  assert.equal(atk.mode, "normal");                                                     // nobody "beside" a trap gives it Disadvantage
  const theirs = viewEvents(hit.r.events, hit.s, PAT).find((e) => e.type === "attack");
  assert.deepEqual(Object.keys(theirs).sort(), ["ac", "actor", "crit", "hit", "mode", "name", "target", "type", "why"]);
  assert.equal(obj(hit.s, "arrow").state, "sprung");
  // Sprung, it does nothing more.
  ok(apply(hit.s, { type: "place", actor: "fighter", to: { q: -2, r: 0 } }, DM));
  assert.deepEqual(types(ok(apply(hit.s, { type: "move", actor: "fighter", to: { q: 2, r: 0 } }, PAT))), ["moved"]);
  const miss = until(s0, walk, (r) => r.events.some((e) => e.type === "attack" && !e.hit));
  assert.deepEqual(types(miss.r), ["moved", "triggered", "object", "attack"]);
});

test("a lever works what it is linked to, and the chain is checked before anything moves", () => {
  define({ id: "test-block", name: "Stone block", kind: "thing", source: "test", tier: "auto", checked: false, text: "A block that drops into its hex.",
    states: { up: { name: "raised", blocks: [] }, down: { name: "down", blocks: ["move"] } }, initial: "up", use: [] });
  const gate = { id: "gate", def: "portcullis", level: "ground", at: { q: 2, r: 0 }, edge: 0, state: "lowered" };
  const lever = thing("lever", "lever", -1, 0, { links: [{ object: "gate", when: "down", sets: "raised" }, { object: "gate", when: "up", sets: "lowered" }, { object: "block", when: "down", sets: "down" }] });
  const s = floor([gate, lever, thing("block", "test-block", 4, 0)]);
  assert.deepEqual(usesFor(s, s.entities.fighter).map((u) => [u.object, u.verb]), [["lever", "pull"]]);
  const pull = ok(apply(s, { type: "use", actor: "fighter", object: "lever", verb: "pull" }, PAT));
  assert.deepEqual(pull.events.map((e) => [e.object, e.state, e.actor]), [["lever", "down", "fighter"], ["gate", "raised", undefined], ["block", "down", undefined]]);
  assert.equal(moveOptions(s, s.entities.fighter).has("4,0"), false);                    // the block fills its hex
  assert.equal(JSON.stringify(view(s, PAT).map).includes("links"), false);              // what a lever is wired to is not sent
  const back = ok(apply(s, { type: "use", actor: "fighter", object: "lever", verb: "push" }, PAT));
  assert.deepEqual(back.events.map((e) => [e.object, e.state]), [["lever", "up"], ["gate", "lowered"]]);
  // With someone standing where the block would drop, nothing at all happens.
  ok(apply(s, { type: "setObject", object: "block", state: "up" }, DM));
  ok(apply(s, { type: "place", actor: "rogue", to: { q: 4, r: 0 } }, DM));
  const before = JSON.stringify(s);
  assert.equal(apply(s, { type: "use", actor: "fighter", object: "lever", verb: "pull" }, PAT).error, "Someone is standing where the stone block would be.");
  assert.equal(JSON.stringify(s), before);
});

test("a secret door is a wall to the players until it is found", () => {
  const [a, b] = edgeSegment({ q: 0, r: 0 }, 0);
  const plate = thing("plate", "pressure-plate", -1, 1, { links: [{ object: "sd", when: "pressed", sets: "open" }] });
  const s = floor([{ id: "sd", def: "secret-door", level: "ground", at: { q: 0, r: 0 }, edge: 0, state: "secret" }, plate]);
  const v = view(s, PAT);
  assert.deepEqual(v.map.objects, []);
  assert.deepEqual(v.map.walls.map((w) => [w.id, w.kind, w.level]), [["w0", "wall", "ground"]]);
  assert.ok(Math.abs(v.map.walls[0].a[0] - Math.min(a[0], b[0])) < 1e-9 || Math.abs(v.map.walls[0].a[0] - Math.max(a[0], b[0])) < 1e-9);
  for (const word of ["secret", '"sd"', "plate", "Pressure"]) assert.equal(sent(s).includes(word), false, word);
  ok(apply(s, { type: "place", actor: "fighter", to: { q: 0, r: 0 } }, DM));
  assert.deepEqual(usesFor(s, s.entities.fighter), []);
  assert.deepEqual(apply(s, { type: "use", actor: "fighter", object: "sd", verb: "open" }, PAT), apply(s, { type: "use", actor: "fighter", object: "zz", verb: "open" }, PAT));
  // Found (here by the DM; searching comes with checks): now it is a door like any other.
  const found = ok(apply(s, { type: "setObject", object: "sd", state: "closed" }, DM));
  assert.deepEqual(viewEvents(found.events, s, PAT).map((e) => [e.type, e.object, e.stateName]), [["object", "sd", "closed"]]);
  assert.deepEqual(view(s, PAT).map.walls, []);
  assert.deepEqual(usesFor(s, s.entities.fighter).map((u) => u.verb), ["open"]);
  // Or it is opened by the plate nobody noticed: stepping on it presses it, stepping off releases it.
  ok(apply(s, { type: "setObject", object: "sd", state: "secret" }, DM));
  ok(apply(s, { type: "place", actor: "fighter", to: { q: -1, r: 0 } }, DM));              // from here the only two-step way to -1,2 is over the plate
  const step = ok(apply(s, { type: "move", actor: "fighter", to: { q: -1, r: 2 } }, PAT));
  assert.deepEqual(step.events.filter((e) => e.type === "object").map((e) => [e.object, e.state]), [["plate", "pressed"], ["sd", "open"], ["plate", "found"]]);
  assert.deepEqual(s.entities.fighter.pos, { q: -1, r: 2, z: 0 });                         // a plate does not stop a walk
});

test("effects can shove a creature, reveal what is linked and set a state; a use can carry effects", () => {
  define({ id: "test-glyph", name: "Warding glyph", kind: "thing", source: "test", tier: "auto", checked: false, text: "Hurls back whoever crosses it and shows the way.",
    states: { live: { name: "glowing", blocks: [] }, spent: { name: "dark", blocks: [] } }, initial: "live",
    use: [{ id: "touch", name: "Touch", from: ["spent"], time: "action", effects: [{ heal: "1d4" }, { set: "live" }] }],
    triggers: [{ on: "enter", from: ["live"], effects: [{ move: 15, dir: "away" }, { reveal: "link" }, { set: "spent" }] }] });
  const wall = { id: "w", level: "ground", a: [-12.5, -20], b: [-12.5, 20], kind: "wall" };       // just west of q = -2 on row 0
  const s = floor([thing("glyph", "test-glyph", 0, 0, { links: [{ object: "pit", when: "spent", sets: "found" }] }), thing("pit", "pit-trap", 3, 3)], [wall]);
  ok(apply(s, { type: "place", actor: "fighter", to: { q: -1, r: 0 } }, DM));
  const res = ok(apply(s, { type: "move", actor: "fighter", to: { q: 0, r: 0 } }, PAT));
  // The glyph stands in the hex the fighter entered, so "away" has no direction: nothing to shove along.
  assert.equal(obj(s, "glyph").state, "spent");
  assert.equal(obj(s, "pit").state, "found");
  assert.deepEqual(types(res).filter((t) => t !== "moved"), ["triggered", "object", "object"]);
  // From beside it: shoved straight back, and stopped by the wall after two hexes of the three.
  ok(apply(s, { type: "setObject", object: "glyph", state: "live" }, DM));
  define({ ...CONTENT.objects["test-glyph"], id: "test-ward", triggers: [{ on: "near", feet: 5, from: ["live"], effects: [{ move: 15, dir: "away" }] }] });
  ok(apply(s, { type: "mapEdit", ops: [{ op: "unobject", id: "glyph" }, { op: "object", object: thing("ward", "test-ward", 1, 0) }] }, DM));
  ok(apply(s, { type: "place", actor: "fighter", to: { q: -1, r: 0 } }, DM));
  const shoved = ok(apply(s, { type: "move", actor: "fighter", to: { q: 0, r: 0 } }, PAT));
  const forced = shoved.events.find((e) => e.forced);
  assert.deepEqual(forced.path.map((h) => [h.q, h.r]), [[-1, 0], [-2, 0]]);
  assert.deepEqual(s.entities.fighter.pos, { q: -2, r: 0, z: 0 });
  // A use with effects: touching the spent ward heals a little and relights it.
  ok(apply(s, { type: "setObject", object: "ward", state: "spent" }, DM));
  ok(apply(s, { type: "place", actor: "fighter", to: { q: 0, r: 0 } }, DM));
  s.entities.fighter.hp = 5;
  const touch = ok(apply(s, { type: "use", actor: "fighter", object: "ward", verb: "touch" }, PAT));
  assert.deepEqual(types(touch), ["heal", "object"]);
  assert.equal(obj(s, "ward").state, "live");
});

test("in a fight a trap ends the move where it is sprung and the movement spent stays spent", () => {
  const s = floor([thing("pit", "pit-trap", 0, 0)]);
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 5, r: 0 } }, DM));
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, DM));
  while (current(s) !== "fighter") ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  const res = ok(apply(s, { type: "move", actor: "fighter", to: { q: 2, r: 0 } }, PAT));
  assert.ok(types(res).includes("triggered"));
  assert.deepEqual(s.entities.fighter.pos, { q: 0, r: 0, z: 0 });
  assert.equal(s.encounter.budget.move, 30 - 10);
});
