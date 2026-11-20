// Companions C7 (#366): a fight played by the companion brain comes back exactly under undo and redo, a replay of its
// actions from the start, and a save and load in the middle; and saves made by main's code before C7 load and play on
// with the brain (fixtures/c7-companion-saves.json: a never-commanded skeleton's turn and a Find Steed's turn with its
// master Stunned, on hexes and on the square room). On hexes and squares.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { aiStep, autoPlays, brainMode } from "../src/ai.js";
import { apply, current } from "../src/engine.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { migrate } from "../src/migrate.js";
import { DM, U2, U3, GRIDS, ok, json, cellsNear, near, spawned, table, fight } from "./c7-brain-kit.js";

const SAVES = JSON.parse(readFileSync(new URL("./fixtures/c7-companion-saves.json", import.meta.url), "utf8")).saves;

// A table with every kind of companion the brain plays: a never-commanded skeleton, a Find Steed whose master is
// Stunned, a familiar set to `auto`, a DM pet, goblins beside them.
function full(grid) {
  const s = table(grid);
  const skel = near(s, "cleric", "skeleton", {}, { min: 2, max: 3 });
  ok(apply(s, { type: "bond", actor: skel, to: "cleric", kind: "undead", orders: "command" }, DM));
  s.entities.cleric.spells.push("find-steed"); s.entities.cleric.slots[2] = 1;
  const steed = spawned(ok(apply(s, { type: "cast", actor: "cleric", spell: "find-steed", slot: 2, summon: { type: "celestial", at: [cellsNear(s, "cleric", "warhorse", { min: 3, max: 4 })[0]] } }, U2)));
  s.entities.wizard.spells.push("find-familiar");
  const owl = spawned(ok(apply(s, { type: "cast", actor: "wizard", spell: "find-familiar", summon: { form: "owl", type: "fey", at: [cellsNear(s, "wizard", "owl")[0]] } }, U3)));
  ok(apply(s, { type: "companion", actor: owl, auto: true }, U3));
  const wolf = near(s, "rogue", "wolf", {}, { min: 1, max: 2 });
  ok(apply(s, { type: "bond", actor: wolf, to: "rogue", kind: "pet" }, DM));
  near(s, skel, "goblin-warrior"); near(s, "cleric", "goblin-warrior");
  return { s, skel, steed, owl, wolf };
}
// The DM's auto-play over the whole table: the brain or the monster AI for whatever it plays, a party character ends its
// turn; a reaction waiting is declined. Every action goes through `send`.
function play(s, send, max) {
  for (let i = 0; i < max && s.encounter; i++) {
    if (s.pending) { send({ type: "react", prompt: s.pending.n, take: null }); continue; }
    const id = current(s), e = s.entities[id];
    const a = e.kind === "npc" && autoPlays(s, id) ? aiStep(s, id) : null;
    if (!send(a ?? { type: "endTurn", actor: id }, a)) send({ type: "endTurn", actor: id });
  }
}

for (const grid of GRIDS) {
  test(`${grid}: a brain-played fight: undo and redo, a replay from the start, and a save and load in the middle all give the same`, () => {
    const { s } = full(grid);
    fight(s, grid);
    ok(apply(s, { type: "condition", actor: "cleric", condition: "stunned" }, DM));
    const start = json(s), acts = [], h = createHistory(), states = [];
    let saved = null, refused = 0;
    const send = (a, chosen = null) => {
      const before = mark(s), r = apply(s, a, DM);
      if (!r.ok) { refused++; return false; }
      h.record(before, s, describeStep(a, r.events, before, s));
      acts.push({ a, chosen }); states.push(json(s));
      if (acts.length === 25) saved = { at: acts.length, state: json(s) };
      return true;
    };
    play(s, send, 120);
    assert.ok(acts.length > 40, `the fight went on: ${acts.length}`);
    const end = json(s);
    // Undo the last 5 steps one at a time, each giving the state before it; redo all 5.
    for (let n = 1; n <= 5; n++) { h.undo(s); assert.equal(json(s), states[states.length - 1 - n], `undo ${n}`); }
    for (let n = 5; n >= 1; n--) h.redo(s);
    assert.equal(json(s), end, "redo");
    // Replay from the start: the same actions give the same state.
    const again = JSON.parse(start);
    for (const { a } of acts) ok(apply(again, a, DM));
    assert.equal(json(again), end, "replay");
    // Saved after 25 actions and loaded: the rest of the actions give the same state; the brain chooses the same.
    assert.ok(saved, "saved in the middle");
    const loaded = migrate(JSON.parse(saved.state));
    assert.equal(json(loaded), saved.state, "a save loads unchanged");
    for (const { a, chosen } of acts.slice(saved.at)) {
      if (chosen) assert.deepEqual(aiStep(loaded, current(loaded)), chosen, "the brain chooses the same after loading");
      ok(apply(loaded, a, DM));
    }
    assert.equal(json(loaded), end, "save and load");
    assert.equal(refused, 0, "the brain sent nothing the engine refused");
  });
}

test("saves made by main's code before C7 load unchanged and the brain plays on from them, on hexes and squares", () => {
  assert.equal(SAVES.length, 4);
  for (const { grid, at, state } of SAVES) {
    const raw = json(state), s = migrate(JSON.parse(raw));
    const { packs, scoreRolls, world, place, parked, journey, markets, shops, ...rest } = s;                     // version 24 (#390) raises the version and adds `packs: []`; nothing else changes
    assert.deepEqual(packs, []); assert.deepEqual(scoreRolls, {});   // version 25 (#557) adds `scoreRolls`
    assert.deepEqual({ world, place, parked, journey }, { world: null, place: null, parked: {}, journey: null });   // version 26 (#579) adds the places of a world
    assert.deepEqual({ markets, shops }, { markets: [], shops: [] });                 // version 27 (#596) adds the markets and shops, empty
    assert.equal(json({ ...rest, version: state.version }), raw, `${grid} ${at}: loads unchanged`);
    const id = current(s), e = s.entities[id];
    assert.equal(brainMode(s, e), e.bond.kind === "undead" ? "guard" : "protect", `${grid} ${at}`);
    assert.ok(autoPlays(s, id));
    let refused = 0, steps = 0;
    play(s, (a) => { steps++; const r = apply(s, a, DM); if (!r.ok) refused++; return r.ok; }, 60);
    assert.equal(refused, 0, `${grid} ${at}: nothing refused in ${steps} steps`);
  }
});
