// Helpers shared by the companion brain's tests (stage C7, #366): a table on the valley (hexes) or the square room with
// the fighter (u1), the cleric (u2) and the wizard (u3) claimed, places near a creature, and the DM's auto-play of one
// turn as the client does it (app.js, idled()).
import assert from "node:assert/strict";
import { aiStep } from "../src/ai.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { apart } from "../src/space.js";
import { gridOf } from "../src/grid.js";
import { squareRoom } from "./fixtures/square-room.js";

export const DM = { role: "dm", userId: "dm" };
export const U1 = { role: "player", userId: "u1" }, U2 = { role: "player", userId: "u2" }, U3 = { role: "player", userId: "u3" };
export const ok = (r) => { assert.ok(r.ok, r.error); return r; };
export const json = (x) => JSON.stringify(x);
export const GRIDS = ["hex", "square"];
// Places that stand clear of each other on each map (the riding tests' places, the paladin and the wizard apart).
export const SPOTS = {
  hex: { fighter: { q: -8, r: 3 }, rogue: { q: -7, r: 3 }, cleric: { q: -4, r: 2 }, wizard: { q: -8, r: 5 }, far: { q: 2, r: 2 } },
  square: { fighter: { q: 1, r: 12 }, rogue: { q: 2, r: 12 }, cleric: { q: 6, r: 6 }, wizard: { q: 3, r: 12 }, far: { q: 12, r: 1 } },
};
export const CENTER = { hex: { q: -4, r: 2 }, square: { q: 7, r: 7 } };
export const spawned = (r) => r.events.find((e) => e.type === "spawned" || e.type === "summoned").id;
export const spawn = (s, monster, at, more = {}) => spawned(ok(apply(s, { type: "spawn", monster, at, ...more }, DM)));
// The cells within `d` (cells, by `apart`) of a creature where a `monster` can be spawned, nearest first, in a fixed order.
export function cellsNear(s, id, monster, { min = 1, max = 1 } = {}) {
  const G = gridOf(s.map), e = s.entities[id], out = [];
  for (const h of G.range(e.pos, max + 2).sort((a, b) => G.dist(a, e.pos) - G.dist(b, e.pos) || a.q - b.q || a.r - b.r)) {
    const t = structuredClone(s), r = apply(t, { type: "spawn", monster, at: h }, DM);
    if (!r.ok) continue;
    const d = apart(t, e, t.entities[spawned(r)]);
    if (d >= min && d <= max) out.push(h);
  }
  return out;
}
export const near = (s, id, monster, more = {}, range = {}) => { const h = cellsNear(s, id, monster, range)[0]; assert.ok(h, `room near ${id}`); return spawn(s, monster, h, more); };
export const turnOf = (s, id) => { for (let i = 0; i < 80 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
export function table(grid, seed = 5) {
  const s = newGame(seed);
  if (grid === "square") ok(apply(s, { type: "loadMap", map: squareRoom() }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  for (const id of Object.keys(s.entities)) if (/^m\d+$/.test(id)) ok(apply(s, { type: "remove", actor: id }, DM));
  for (const id of ["fighter", "rogue", "cleric", "wizard"]) s.entities[id].pos = { ...SPOTS[grid][id], z: 0 };
  ok(apply(s, { type: "claim", entity: "fighter", user: "u1", userName: "Ann" }, U1));
  ok(apply(s, { type: "claim", entity: "cleric", user: "u2", userName: "Bo" }, U2));
  ok(apply(s, { type: "claim", entity: "wizard", user: "u3", userName: "Cy" }, U3));
  return s;
}
export const fight = (s, grid) => ok(apply(s, { type: "startEncounter", center: CENTER[grid], radius: 7 }, DM));
// The DM's auto-play for one turn, as the client does it: the brain's steps through apply() until the turn ends. Every
// step must be accepted (the brain never sends what the engine refuses).
export function autoTurn(s, id, max = 20) {
  const sent = [];
  for (let n = 0; n < max && s.encounter && current(s) === id; n++) {
    if (s.pending) { ok(apply(s, { type: "react", prompt: s.pending.n, take: null }, DM)); continue; }
    const a = aiStep(s, id);
    assert.ok(a, `the brain has a step for ${id}`);
    const r = apply(s, a, DM);
    assert.ok(r.ok, `${json(a)} was refused: ${r.error}`);
    sent.push({ a, r });
  }
  if (process.env.C7_DEBUG) console.log(id, json(sent.map((x) => [x.a, x.r.events.map((e) => e.type)])));
  assert.ok(!s.encounter || current(s) !== id, "the turn ended");
  return sent;
}

