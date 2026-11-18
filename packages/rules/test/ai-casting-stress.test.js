// Built spellcasters played by the AI (docs/specs/ai-casting.md, stage AC1; #487): a stress loop on hexes and on the square room. The whole
// party is set aside under `standIn` and every turn is played by aiStep, as the DM's auto-play will play it (stage AC2), against goblins and a
// pack Mage that are played by it too. Between fights the party is mended and its slots come back; during them the DM, now and then, drops
// someone to 0 Hit Points or to a quarter of them, so that the healing steps come up. 200 rounds a grid (2,400 with HEXTABLE_STRESS=full).
// After every action every creature's slots are 0 or more. Every turn the AI plays: it has a step (no stall), the turn ends within 25 steps
// (no endless loop), and nothing it sends is refused (the engine refuses nothing the AI sends: a refusal would waste the turn). No spell it casts
// needs Concentration, and none of its casts ends a Concentration spell its caster keeps up (the cleric's Shield of Faith).
import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import { SPELLS } from "../src/content/index.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { gridOf } from "../src/grid.js";
import { squareRoom } from "./fixtures/square-room.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
const FULL = process.env.HEXTABLE_STRESS === "full";
const ROUNDS = Number(process.env.AC_ROUNDS ?? (FULL ? 2400 : 200));
const STEPS_MOST = 25, ACTIONS_MOST = 400;
const SPOTS = {
  hex: { fighter: { q: -6, r: 2 }, rogue: { q: -7, r: 3 }, cleric: { q: -7, r: 2 }, wizard: { q: -8, r: 3 }, foes: { q: 2, r: 2 } },
  square: { fighter: { q: 3, r: 3 }, rogue: { q: 4, r: 3 }, cleric: { q: 3, r: 4 }, wizard: { q: 2, r: 3 }, foes: { q: 10, r: 10 } },
};
const CENTER = { hex: { q: -2, r: 2 }, square: { q: 7, r: 7 } };
const PARTY = ["fighter", "rogue", "cleric", "wizard"];
const SLOTS = { 1: 4, 2: 3, 3: 3 };

function stress(grid, rounds) {
  const s = newGame(9);
  if (grid === "square") ok(apply(s, { type: "loadMap", map: squareRoom() }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  ok(apply(s, { type: "setting", key: "away", value: "standIn" }, DM));
  for (const id of Object.keys(s.entities)) if (/^m\d+$/.test(id)) ok(apply(s, { type: "remove", actor: id }, DM));
  for (const id of PARTY) { const e = s.entities[id]; e.pos = { ...SPOTS[grid][id], z: 0 }; e.hp = e.maxHp = 30; }
  // Two casters with more to cast than the pregenerated spell lists: a level 5 wizard and cleric with level 3 slots.
  Object.assign(s.entities.wizard, { level: 5, slots: { ...SLOTS } }); s.entities.wizard.spells.push("scorching-ray", "shatter", "fireball", "thunderwave");
  Object.assign(s.entities.cleric, { level: 5, slots: { ...SLOTS } }); s.entities.cleric.spells.push("guiding-bolt", "inflict-wounds", "mass-healing-word", "spiritual-weapon");
  let x = 7919;
  const rnd = (n) => { x = (x * 1103515245 + 12345) % 2147483648; return Math.floor(x / 65536) % n; };
  const stats = { actions: 0, turns: 0, steps: 0, casts: 0, refused: 0, stalls: 0, loops: 0, fights: 0, downMidTurn: 0, spells: {}, monsterRefused: 0, whileHolding: 0 };
  const bad = [];
  let done = 0, round = null;
  const idOf = (r) => r.events.find((e) => e.type === "spawned").id;
  const spawnFoes = () => {
    const G = gridOf(s.map), base = SPOTS[grid].foes;
    const cells = G.range(base, 4).sort((a, b) => G.dist(a, base) - G.dist(b, base) || a.q - b.q || a.r - b.r);
    for (const monster of ["goblin-warrior", "goblin-warrior", "goblin-warrior", "mage"]) {
      const at = cells.find((h) => apply(structuredClone(s), { type: "spawn", monster, at: h }, DM).ok);
      const id = idOf(ok(apply(s, { type: "spawn", monster, at }, DM)));
      s.entities[id].hp = s.entities[id].maxHp = 12 + rnd(40);
    }
  };
  const act = (a, mine) => {
    const r = apply(s, a, DM);
    stats.actions++;
    if (r.ok) for (const e of Object.values(s.entities)) for (const [l, n] of Object.entries(e.slots ?? {})) if (n < 0) bad.push(`${e.id} has ${n} level ${l} slots after ${json(a)}`);
    return r;
  };
  const answer = () => act({ type: "react", prompt: s.pending.n, take: null });
  const autoTurn = (id) => {
    stats.turns++;
    for (let n = 0; n < STEPS_MOST; n++) {
      if (!s.encounter || current(s) !== id) return;
      if (s.pending) { answer(); continue; }
      const e = s.entities[id], a = aiStep(s, id);
      if (!a && !(e?.hp > 0)) { stats.downMidTurn++; act({ type: "endTurn", actor: id }); return; }       // a character at 0 is not played by it; the DM ends the turn
      if (!a) { stats.stalls++; if (bad.length < 8) bad.push(`stall: ${id}`); act({ type: "endTurn", actor: id }); return; }
      stats.steps++;
      const mineAct = e.side === "party";
      const held = new Set((s.effects ?? []).filter((fx) => fx.source === id && fx.conc).map((fx) => fx.id));
      const r = act(a);
      if (!r.ok) {
        if (mineAct) { stats.refused++; if (bad.length < 8) bad.push(`refused ${json(a)}: ${r.error}`); } else stats.monsterRefused++;
        act({ type: "endTurn", actor: id });
        return;
      }
      if (a.type === "cast" && mineAct) {
        stats.casts++; stats.spells[a.spell] = (stats.spells[a.spell] ?? 0) + 1;
        if (held.size) stats.whileHolding++;
        if (SPELLS[a.spell].def.concentration && bad.length < 8) bad.push(`${id} cast a Concentration spell: ${a.spell}`);
        const dropped = r.events.filter((ev) => ev.type === "effectEnd" && ev.source === id && held.has(ev.fx) && /began concentrating/.test(ev.why ?? ""));
        if (dropped.length && bad.length < 8) bad.push(`${id}'s ${a.spell} ended ${json(dropped.map((d) => d.name))}`);
      }
      if (a.type === "endTurn") return;
    }
    if (s.encounter && current(s) === id) { stats.loops++; if (bad.length < 8) bad.push(`loop: ${id}`); act({ type: "endTurn", actor: id }); }
  };
  const start = () => {
    for (const id of Object.keys(s.entities)) if (s.entities[id].side === "foe") apply(s, { type: "remove", actor: id }, DM);
    for (const id of PARTY) {
      const e = s.entities[id];
      if (e.away) apply(s, { type: "stepBack", actor: id }, DM);
      e.pos = { ...SPOTS[grid][id], z: 0 };
      if (e.dead) ok(apply(s, { type: "setHp", actor: id, hp: 10 }, DM));
      if (e.hp <= 0) ok(apply(s, { type: "mend", actor: id, amount: 30 }, DM));
      ok(apply(s, { type: "mend", actor: id, amount: e.maxHp }, DM));
      for (const c of ["prone", "stunned"]) if (e.cond[c]) apply(s, { type: "condition", actor: id, condition: c, on: false }, DM);
    }
    Object.assign(s.entities.wizard, { slots: { ...SLOTS } }); Object.assign(s.entities.cleric, { slots: { ...SLOTS } });
    spawnFoes();
    stats.fights++;
    // The cleric keeps Shield of Faith up on the fighter for the fight (cast before it, by the DM); the AI must never end it by a cast of its own.
    ok(apply(s, { type: "cast", actor: "cleric", spell: "shield-of-faith", target: "fighter" }, DM));
    ok(apply(s, { type: "startEncounter", center: CENTER[grid], radius: 8 }, DM));
    for (const id of PARTY) { const r = apply(s, { type: "stepAway", actor: id }, DM); if (!r.ok && bad.length < 8) bad.push(`stepAway ${id}: ${r.error}`); }
    round = `${s.encounter.id}:${s.encounter.round}`;
  };
  start();
  while (done < rounds && bad.length < 8) {
    if (!s.encounter) { start(); continue; }
    if (s.pending) { answer(); continue; }
    if (stats.actions > ACTIONS_MOST * rounds) { bad.push(`the run did not end: ${stats.actions} actions`); break; }
    const key = `${s.encounter.id}:${s.encounter.round}`;
    if (key !== round) { done++; round = key; }
    // The DM, now and then, on anyone's turn: someone to 0 Hit Points, or to a quarter of them.
    const d = rnd(30), who = PARTY[rnd(4)], w = s.entities[who];
    if (w && !w.dead) { if (d === 0 && w.hp > 0) act({ type: "setHp", actor: who, hp: 0 }); else if (d === 1 && w.hp > 0) act({ type: "setHp", actor: who, hp: 5 }); }
    if (!s.encounter) continue;
    autoTurn(current(s));
  }
  return { stats, bad };
}

for (const grid of ["hex", "square"]) {
  test(`${grid}: AC1 stress, ${ROUNDS} rounds of the party set aside under standIn and played by the AI: nothing refused, no stall, no endless turn, no slot below zero, no Concentration ended by a cast`, () => {
    const { stats, bad } = stress(grid, ROUNDS);
    if (process.env.AC_DEBUG) console.log(grid, json(stats));
    assert.deepEqual(bad, []);
    assert.equal(stats.refused, 0);
    assert.equal(stats.stalls, 0);
    assert.equal(stats.loops, 0);
    assert.equal(stats.monsterRefused, 0, "nor by the monster AI");
    assert.ok(stats.casts > 20, `the casters cast: ${stats.casts}`);
    assert.ok(stats.whileHolding > 0, "some casts were made while the caster kept a Concentration spell up");
    assert.ok(Object.keys(stats.spells).length >= 5, `more than a few spells: ${json(stats.spells)}`);
  });
}
