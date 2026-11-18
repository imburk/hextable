// Helpers shared by the casting AI's tests (stage AC1, #487; docs/specs/ai-casting.md, Testing).
// The replays play a fight with the casters' spells put away, to show that every creature with no spells chooses
// exactly as it did before the casting AI: `putAwaySpells` takes every creature's `spells` list and returns what it took,
// `bringBackSpells` puts it back (so the end state is the recorded one).
import assert from "node:assert/strict";
import { aiStep } from "../src/ai.js";
import { aimArea, apply, current } from "../src/engine.js";
import { gridOf } from "../src/grid.js";
import { apart } from "../src/space.js";
import { DM, GRIDS, U1, U2, U3, ok, table, spawn } from "./c7-brain-kit.js";

export function putAwaySpells(s) {
  const kept = {};
  for (const e of Object.values(s.entities)) if (e.spells?.length) { kept[e.id] = e.spells; e.spells = []; }
  return kept;
}
export function bringBackSpells(s, kept) {
  for (const [id, spells] of Object.entries(kept)) s.entities[id].spells = spells;
}

// ---------- scenes ----------
export { GRIDS, DM, U1, U2, U3, ok, spawn };
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
