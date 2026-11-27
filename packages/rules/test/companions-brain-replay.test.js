// Companions C7 (#366): the companion brain must leave the monster AI exactly as it was for every creature with no
// bond. Fixed fights on the hex valley, the square valley and the square room, every creature played by aiStep, were
// recorded on main before C7 (fixtures/c7-ai-replay.json: a digest of every action chosen and of the end state). The
// same fights played now must choose the same actions, byte for byte, and end in the same state.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import * as E from "../src/engine.js";
import { typedGame as newGame } from "./fixtures/typed.js";        // recorded when the starters were hand-typed: the game is made that way here (#672)
const { current } = E;
// #630: a fight is numbered by `fightSeq` and no longer by the creature counter `seq`, which it took a number from when this was recorded. So that the recording still
// checks everything else byte for byte, the fight counter is made to read as that counter did (set to `seq` before an action) and `seq` is moved on by the one it used to take.
const apply = (s, a, ctx) => {
  s.fightSeq = s.seq;
  const r = E.apply(s, a, ctx);
  if (r.ok && s.fightSeq === s.seq + 1) s.seq++;
  return r;
};
import { squareRoom } from "./fixtures/square-room.js";
import { bringBackSpells, putAwaySpells } from "./ai-casting-kit.js";

const FIX = JSON.parse(readFileSync(new URL("./fixtures/c7-ai-replay.json", import.meta.url), "utf8"));
const sha = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
function scenarios() {
  const DM = { role: "dm", userId: "dm" };
  const ok = (r) => { if (!r.ok) throw new Error(r.error); return r; };
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
function playAll(s, max = 3000) {
  const DM = { role: "dm", userId: "dm" }, actions = [];
  for (let i = 0; i < max && s.encounter; i++) {
    const id = current(s), step = aiStep(s, id) ?? { type: "endTurn", actor: id };
    actions.push(step);
    const r = apply(s, step, DM);
    if (!r.ok) { actions.push({ refused: r.error }); apply(s, { type: "endTurn", actor: id }, DM); }
  }
  return actions;
}

test("the monster AI is byte-identical to main for creatures with no bond: the recorded fights choose the same actions and end the same", () => {
  const list = scenarios();
  assert.equal(list.length, FIX.runs.length);
  for (const [i, sc] of list.entries()) {
    // The casting AI (ai-casting.md, AC1) plays the pregenerated casters' spells since this was recorded, so they cast and the fight goes
    // another way. Played with their spells put away (and put back for the end state) every creature with no spells chooses as recorded;
    // ai-casting-replay.test.js records the fights with the spells.
    const want = FIX.runs[i], s = sc.make(), kept = putAwaySpells(s), actions = playAll(s);
    bringBackSpells(s, kept);
    delete s.timeline;
    assert.equal(sc.name, want.name);
    assert.equal(actions.length, want.steps, `${sc.name}: steps`);
    assert.equal(actions.filter((a) => a.refused).length, want.refused, `${sc.name}: refused`);
    assert.equal(sha(actions), want.actions, `${sc.name}: the actions chosen`);
    // Recorded at version 23; the version has moved (24, #390; 25, #557) and `packs: []` and `scoreRolls: {}` are new; nothing else in the state.
    const { packs, scoreRolls, fightSeq, ...rest } = s;      // (`fightSeq` is taken out: see `apply` above)
    // `diedAt` (#762, Revivify) is new on a creature that died since this was recorded: taken off, as the fields above are.
    const entities = Object.fromEntries(Object.entries(rest.entities).map(([k, e]) => { const { diedAt, ...more } = e; return [k, more]; }));
    // #836 (swimming): the map is format 3 and each water tile has `depth: 10`; both are put back as they were (format 2, no depth) before hashing.
    const map = JSON.parse(JSON.stringify(rest.map, (k, v) => (k === "depth" && v === 10 ? undefined : v))); map.format = 2;
    assert.equal(sha({ ...rest, map, entities, version: 23 }), want.state, `${sc.name}: the end state`);
    assert.equal(!s.encounter, want.ended);
  }
});
