// Helpers shared by the casting AI's tests (stage AC1, #487; docs/specs/ai-casting.md, Testing).
// The replays play a fight with the casters' spells put away, to show that every creature with no spells chooses as the recorded fights
// have it: `putAwaySpells` takes every creature's `spells` list and returns what it took, `bringBackSpells` puts it back (so the end state
// is the recorded one). `playAll` plays every creature by aiStep; `playMonsters` leaves the party passive (monsters byte-identical to main).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { aiStep } from "../src/ai.js";
import { aimArea, apply, current } from "../src/engine.js";
import { gridOf } from "../src/grid.js";
import { newGame } from "../src/scenario.js";
import { apart } from "../src/space.js";
import { DM, GRIDS, U1, U2, U3, ok, table, spawn } from "./c7-brain-kit.js";
import { squareRoom } from "./fixtures/square-room.js";

export function putAwaySpells(s) {
  const kept = {};
  for (const e of Object.values(s.entities)) if (e.spells?.length) { kept[e.id] = e.spells; e.spells = []; }
  return kept;
}
export function bringBackSpells(s, kept) {
  for (const [id, spells] of Object.entries(kept)) s.entities[id].spells = spells;
}

// ---------- scenes ----------
export { GRIDS, DM, U1, U2, U3, ok, spawn, table };
export const json = (x) => JSON.stringify(x);
// The cells at exactly `d` cells from a creature, in a fixed order.
export function ring(s, id, d) {
  const G = gridOf(s.map), e = s.entities[id];
  return G.range(e.pos, d).filter((h) => G.dist(h, e.pos) === d).sort((a, b) => a.q - b.q || a.r - b.r);
}
export const fits = (s, monster, h) => apply(structuredClone(s), { type: "spawn", monster, at: h }, DM).ok;
const taken = (s, h) => Object.values(s.entities).some((e) => !e.dead && e.pos.q === h.q && e.pos.r === h.r);
// A goblin at the first free cell at `d` cells from `id` that is not `not`'s (cells already used by the scene).
export function goblinAt(s, id, d, nth = 0) {
  const spots = ring(s, id, d).filter((h) => fits(s, "goblin-warrior", h));
  assert.ok(spots[nth], `room for a goblin ${d} cells from ${id}`);
  return spawn(s, "goblin-warrior", spots[nth], { name: "Goblin" });
}
export function put(s, id, h) { assert.ok(!taken(s, h), `${json(h)} is free`); s.entities[id].pos = { q: h.q, r: h.r, z: 0 }; }
// The party as table() makes it (Brenna the fighter, Pip the rogue, Odessa the cleric, Tavin the wizard, claimed), the rest of the
// scene put right by `make(s)`, then a fight round `id` with a radius that takes in everyone, and it is `id`'s turn.
export function scene(grid, make, id) {
  const s = table(grid);
  make?.(s);
  ok(apply(s, { type: "startEncounter", center: s.entities[id].pos, radius: 24 }, DM));
  for (let i = 0; i < 80 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.equal(current(s), id);
  return s;
}
// Set aside under `standIn`, as the DM would hand a character to the AI (stepAway, E20).
export function standIn(s, id) {
  ok(apply(s, { type: "setting", key: "away", value: "standIn" }, DM));
  ok(apply(s, { type: "stepAway", actor: id }, DM));
}
// What the AI sends next, applied by the DM as the DM's auto-play does; the step and its result.
export function step(s, id) {
  const a = aiStep(s, id);
  assert.ok(a, "the AI has a step");
  const r = apply(s, a, DM);
  assert.ok(r.ok, `${json(a)} was refused: ${r.error}`);
  return { a, r };
}
// Who an area cast with `a` would catch in `s`, by the engine's own rule.
export function caughtBy(s, id, spell, hex, SP) {
  const sp = SP[spell];
  return aimArea(s, s.entities[id], sp.name, sp.area, sp.range, hex).targets.map((t) => t.id);
}
export { apart };

// ---------- the recorded fights (companions-brain-replay.test.js, ai-casting-replay.test.js) ----------
export const sha = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
// The fixed fights of companions-brain-replay.test.js: the hex valley, the square valley and the square room, seeded, every creature played by aiStep.
export function scenarios() {
  const list = [];
  for (const seed of [1, 2, 3]) list.push({ name: `hex valley seed ${seed}`, make: () => { const s = newGame(seed); ok(apply(s, { type: "startEncounter", center: s.entities.m1.pos, radius: 30 }, DM)); return s; } });
  list.push({ name: "hex valley seed 5, sight los", make: () => { const s = newGame(5); ok(apply(s, { type: "setting", key: "sight", value: "los" }, DM)); ok(apply(s, { type: "startEncounter", center: s.entities.m1.pos, radius: 30 }, DM)); return s; } });
  for (const seed of [1, 7]) list.push({ name: `square valley seed ${seed}`, make: () => { const s = newGame(seed, { grid: "square" }); ok(apply(s, { type: "startEncounter", center: s.entities.m1.pos, radius: 30 }, DM)); return s; } });
  list.push({ name: "square-room", make: () => {
    const s = newGame(9);
    ok(apply(s, { type: "loadMap", map: squareRoom() }, DM));
    for (const id of Object.keys(s.entities)) if (/^m\d+$/.test(id)) ok(apply(s, { type: "remove", actor: id }, DM));
    const P = { fighter: [3, 3], rogue: [4, 3], cleric: [3, 4], wizard: [2, 3] };
    for (const [id, [q, r]] of Object.entries(P)) s.entities[id].pos = { q, r, z: 0 };
    for (const [m, q, r] of [["goblin-warrior", 9, 9], ["goblin-warrior", 10, 8], ["wolf", 8, 10], ["skeleton", 11, 9]]) ok(apply(s, { type: "spawn", monster: m, at: { q, r } }, DM));
    ok(apply(s, { type: "startEncounter", center: { q: 7, r: 7 }, radius: 9 }, DM));
    return s;
  } });
  return list;
}
// Play a fight out with aiStep for every creature: a refused step is recorded and the turn ended.
export function playAll(s, max = 3000) {
  const actions = [];
  for (let i = 0; i < max && s.encounter; i++) {
    const id = current(s), step = aiStep(s, id) ?? { type: "endTurn", actor: id };
    actions.push(step);
    const r = apply(s, step, DM);
    if (!r.ok) { actions.push({ refused: r.error }); apply(s, { type: "endTurn", actor: id }, DM); }
  }
  return actions;
}

// The same fights with every party creature passive (it ends its turn) and every other creature played by aiStep: what the monster
// AI chooses. A party creature is not played because a party creature reads the party's copy of the state and breaks ties between foes by
// id (ai-casting.md, Decision 2 and amendment 4), so its choices differ from main's by design; a monster's must not (fixtures/ai-casting-monsters.json,
// recorded on main before AC1).
export function playMonsters(s, max = 3000) {
  const actions = [];
  for (let i = 0; i < max && s.encounter; i++) {
    const id = current(s), e = s.entities[id];
    const step = (e.side === "party" ? null : aiStep(s, id)) ?? { type: "endTurn", actor: id };
    actions.push(step);
    const r = apply(s, step, DM);
    if (!r.ok) { actions.push({ refused: r.error }); apply(s, { type: "endTurn", actor: id }, DM); }
  }
  return actions;
}
// What a fight came to, in a form that does not move with the state's version: every creature's Hit Points, and whether it is dead.
export const endOf = (s) => Object.fromEntries(Object.values(s.entities).map((e) => [e.id, [e.hp, e.dead ? 1 : 0]]));
