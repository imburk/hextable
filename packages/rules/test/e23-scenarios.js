// Scripts recorded on main before #372 (fixtures/e23-main-replay.json) and replayed by e23-replay.test.js: with
// `strikeFirst` off (#585: the SRD's way, which plays these scripts as main did before #372) and `autoEngage` off, and for casts and attacks E23 does not touch, and for moves with nothing hidden, this branch must give
// the very events and states main gave. `scenarios(K)` takes the kit built on either code (e23-kit.js).
import { DM, U1, U3, SPOTS, GRIDS } from "./e23-kit.js";

const step = (q, r) => ({ q, r });
export function scenarios(K) {
  const out = [];
  for (const grid of GRIDS) {
    const casts = Object.entries(K.CASTS);
    // autoEngage off: every one of the E23 casts starts the fight and is not cast, as on main.
    for (const [name, f] of casts) out.push({ name: `${grid} off ${name}`, make: () => K.table(grid, { autoEngage: false, strikeFirst: false }), acts: [[f(grid), DM], ["end", 6]] });
    // autoEngage on, casts E23 leaves alone: a player's cast at a foe, the DM casting a party member's spell at a foe,
    // and a foe's attack (not a cast).
    out.push({ name: `${grid} on player cast`, make: () => K.table(grid, { strikeFirst: false }), acts: [[{ type: "cast", actor: "wizard", spell: "fire-bolt", target: "mage" }, U3], ["end", 6]] });
    out.push({ name: `${grid} on dm party cast`, make: () => K.table(grid, { strikeFirst: false }), acts: [[{ type: "cast", actor: "wizard", spell: "fire-bolt", target: "priest" }, DM], ["end", 6]] });
    const C = SPOTS[grid].cleric;
    out.push({ name: `${grid} on dm attack`, make: () => K.table(grid, { strikeFirst: false }), acts: [[{ type: "place", actor: "priest", to: step(C.q + 1, C.r) }, DM], [{ type: "attack", actor: "priest", target: "cleric", attack: "mace" }, DM], ["end", 6]] });
    // Moves with nothing hidden: a leader with two followers, in peace, with autoEngage off and on (the walk that comes
    // near the casters starts a fight), and moves in that fight.
    const F = SPOTS[grid].fighter, d = grid === "hex" ? [[2, 0], [3, -1], [5, -1], [-1, 1]] : [[2, -1], [4, -2], [5, 0], [1, 1]];
    const walk = d.map(([dq, dr]) => [{ type: "move", actor: "fighter", to: step(F.q + dq, F.r + dr) }, U1]);
    const follow = [[{ type: "follow", actor: "rogue", leader: "fighter" }, DM], [{ type: "follow", actor: "wizard", leader: "fighter" }, U3]];
    for (const on of [false, true]) out.push({ name: `${grid} moves autoEngage ${on}`, make: () => K.table(grid, { autoEngage: on, strikeFirst: false }), acts: [...follow, ...walk, ["until", "fighter"], ...walk] });
  }
  return out;
}
// Run one: every action's events and the state after it, as JSON. `refused` steps are kept with their error.
export function run(M, sc) {
  const s = sc.make(), rec = [];
  for (const [a, ctx] of sc.acts) {
    if (a === "until") { for (let i = 0; i < 20 && s.encounter && M.current(s) !== ctx; i++) { const r = M.apply(s, { type: "endTurn", actor: M.current(s) }, DM); rec.push(JSON.stringify([r.ok, r.error ?? null, r.events])); } continue; }
    if (a === "end") { for (let i = 0; i < ctx && s.encounter; i++) { const r = M.apply(s, { type: "endTurn", actor: M.current(s) }, DM); rec.push(JSON.stringify([r.ok, r.error ?? null, r.events])); } continue; }
    const r = M.apply(s, a, ctx);
    rec.push(JSON.stringify([r.ok, r.error ?? null, r.events]));
  }
  rec.push(JSON.stringify(s));
  return rec;
}
