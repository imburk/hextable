// Companions C7 (#366), shared by companions-brain-stress.test.js (hexes) and companions-brain-stress-square.test.js
// (the square room), so that the two grids run side by side: the turn-order stress loop of riding-c6b-stress.test.js, extended with the DM's auto-play. Beside
// the four riders and three warhorses (mounting, dismounting, dashing, pushed by Thunderwave, Misty Step, Prone, killed,
// removed, set aside, the DM's harm, stuns and mends), the table has a never-commanded skeleton (locked), a zombie its
// master sometimes commands (for this turn, or with an order that stands), a Find Steed whose master is often Stunned,
// a familiar set to `auto`, a DM pet wolf, an unbonded brown bear the fighter may ride (an independent mount), and
// goblins. Every creature the DM's auto-play plays (`autoPlays`, as the client asks) is played by aiStep; the others by
// a stand-in for their player or for the DM's hand.
// After every action: nobody overlaps anyone but its own rider or mount. Every turn the auto-play takes: the brain always
// has a step (no stall), the turn ends within 25 steps (no endless loop), and nothing it sends is refused. Every round:
// every creature up and in the fight all round has exactly one turn's worth (no double turn, none lost). 2,400 rounds on
// hexes and on the square room.
import assert from "node:assert/strict";
import { aiStep, autoPlays, brainMode } from "../src/ai.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { apart, overlapAt } from "../src/space.js";
import { gridOf } from "../src/grid.js";
import { squareRoom } from "./fixtures/square-room.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
export const ROUNDS = Number(process.env.C7_ROUNDS ?? 2400);
const SPOTS = {
  hex: { fighter: { q: -6, r: 2 }, rogue: { q: -7, r: 3 }, cleric: { q: -7, r: 2 }, wizard: { q: -8, r: 3 }, goblin: { q: 2, r: 2 } },
  square: { fighter: { q: 3, r: 3 }, rogue: { q: 1, r: 12 }, cleric: { q: 2, r: 12 }, wizard: { q: 3, r: 12 }, goblin: { q: 11, r: 11 } },
};
const CENTER = { hex: { q: -2, r: 2 }, square: { q: 7, r: 7 } };
const idOf = (r) => r.events.find((x) => x.type === "spawned" || x.type === "summoned").id;
function beside(s, id, monster, side = "party", most = 1) {
  const G = gridOf(s.map), e = s.entities[id];
  for (const h of G.range(e.pos, most + 2).sort((a, b) => G.dist(a, e.pos) - G.dist(b, e.pos) || a.q - b.q || a.r - b.r)) {
    const t = structuredClone(s), r = apply(t, { type: "spawn", monster, at: h }, DM);
    if (!r.ok || apart(t, e, t.entities[idOf(r)]) > most) continue;
    const id2 = idOf(ok(apply(s, { type: "spawn", monster, at: h }, DM)));
    s.entities[id2].side = side;
    return id2;
  }
  return null;
}
function whole(s) {
  const G = gridOf(s.map), alive = Object.values(s.entities).filter((e) => !e.dead && !e.vanished);
  for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) if (overlapAt(alive[i], alive[i].pos, alive[j], alive[j].pos, G)) return `${alive[i].id} and ${alive[j].id} overlap`;
  for (const e of alive) {
    if (e.riding && (s.entities[e.riding.on]?.rider !== e.id || json(s.entities[e.riding.on].pos) !== json(e.pos))) return `${e.id}'s ride is not whole`;
    if (e.rider !== undefined && s.entities[e.rider]?.riding?.on !== e.id) return `${e.id}'s rider is not whole`;
  }
  return null;
}

export function stress(grid, rounds) {
  const s = newGame(9);
  if (grid === "square") ok(apply(s, { type: "loadMap", map: squareRoom() }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  for (const id of Object.keys(s.entities)) if (/^m\d+$/.test(id)) ok(apply(s, { type: "remove", actor: id }, DM));
  const P = SPOTS[grid], riders = ["fighter", "rogue", "cleric", "wizard"];
  for (const id of riders) s.entities[id].pos = { ...P[id], z: 0 };
  for (const id of riders) s.entities[id].hp = s.entities[id].maxHp = 60;      // the goblin is played by the monster AI now: the party lasts
  for (const [id, u] of [["cleric", "u2"], ["wizard", "u3"]]) ok(apply(s, { type: "claim", entity: id, user: u, userName: u }, { role: "player", userId: u }));
  s.entities.wizard.spells.push("thunderwave", "misty-step", "find-familiar");
  s.entities.cleric.spells.push("find-steed"); s.entities.cleric.slots[2] = 1;
  let horses = [beside(s, "fighter", "warhorse"), beside(s, "cleric", "warhorse"), beside(s, "wizard", "warhorse")];
  // The companions.
  const skel = beside(s, "rogue", "skeleton", "party", 3);
  ok(apply(s, { type: "bond", actor: skel, to: "cleric", kind: "undead", orders: "command" }, DM));
  const zombie = beside(s, "wizard", "zombie", "party", 3);
  ok(apply(s, { type: "bond", actor: zombie, to: "wizard", kind: "undead", orders: "command" }, DM));
  const wolf = beside(s, "rogue", "wolf", "party", 3);
  ok(apply(s, { type: "bond", actor: wolf, to: "rogue", kind: "pet" }, DM));
  const bear = beside(s, "fighter", "brown-bear", "party", 3);
  const G0 = gridOf(s.map), free = (id, monster) => {
    const e = s.entities[id];
    return G0.range(e.pos, 4).sort((a, b) => G0.dist(a, e.pos) - G0.dist(b, e.pos) || a.q - b.q || a.r - b.r).find((h) => { const t = structuredClone(s); return apply(t, { type: "spawn", monster, at: h }, DM).ok; });
  };
  let steed = null, owl = null;
  // Between fights the companions that fell come back: the undead and the wolf raised by the DM, the steed and the
  // familiar summoned again.
  const restore = () => {
    for (const id of [skel, zombie, wolf]) { const c = s.entities[id]; if (c?.dead) apply(s, { type: "setHp", actor: id, hp: 10 }, DM); else if (c && c.hp <= 0) apply(s, { type: "mend", actor: id, amount: 10 }, DM); }
    if (!s.entities[steed]) {
      s.entities.cleric.slots[2] = 1;
      const at = free("cleric", "warhorse"), r = at && apply(s, { type: "cast", actor: "cleric", spell: "find-steed", slot: 2, summon: { type: "celestial", at: [at] } }, DM);
      if (r?.ok) { horses = horses.filter((h) => h !== steed); steed = idOf(r); horses.push(steed); }
    }
    if (!s.entities[owl]) {
      const at = free("wizard", "owl"), r = at && apply(s, { type: "cast", actor: "wizard", spell: "find-familiar", summon: { form: "owl", type: "fey", at: [at] } }, DM);
      if (r?.ok) { owl = idOf(r); ok(apply(s, { type: "companion", actor: owl, auto: true }, DM)); }
    }
  };
  restore();
  assert.ok(steed && owl, "the steed and the familiar are summoned");
  const goblinAt = { ...P.goblin };
  const tough = () => {
    const G = gridOf(s.map), at = G.range(goblinAt, 3).sort((a, b) => G.dist(a, goblinAt) - G.dist(b, goblinAt) || a.q - b.q || a.r - b.r).find((h) => apply(structuredClone(s), { type: "spawn", monster: "goblin-warrior", at: h }, DM).ok);
    const g = idOf(ok(apply(s, { type: "spawn", monster: "goblin-warrior", at }, DM))); s.entities[g].hp = s.entities[g].maxHp = 400;
  };
  tough();
  let x = 4243;
  const rnd = (n) => { x = (x * 1103515245 + 12345) % 2147483648; return Math.floor(x / 65536) % n; };
  const worth = new Map(), present = new Map();
  let lastKey = null, budgetSeen = null, done = 0;
  const bad = [], stats = { actions: 0, refused: 0, brainTurns: 0, brainSteps: 0, stalls: 0, loops: 0, brainRefused: 0, monsterRefused: 0, modes: {}, waits: {}, commands: {}, fights: 0, rode: 0 };
  const key = () => `${s.encounter.id}:${s.encounter.round}`;
  const credit = (k, id) => { if (!worth.has(k)) worth.set(k, new Map()); worth.get(k).set(id, (worth.get(k).get(id) ?? 0) + 1); };
  const upNow = () => new Set(s.encounter.order.map((o) => o.id).filter((id) => { const e = s.entities[id]; return e && !e.dead && e.hp > 0 && !e.away; }));
  const finished = [];
  const after = (r) => {
    stats.actions++;
    const w = whole(s);
    if (w && bad.length < 5) bad.push(`${w} after ${json(r.events.map((e) => e.type))}`);
    for (const ev of r.events) if (ev.type === "turn" && s.encounter && !ev.someone) credit(`${s.encounter.id}:${ev.round}`, ev.id);
    if (!s.encounter) return;
    const b = s.encounter.budget?.mount, m = s.entities[current(s)]?.riding?.on;
    if (b && b !== budgetSeen && m && (b.move > 0 || b.action > 0)) { credit(key(), m); stats.rode++; }
    budgetSeen = b ?? null;
    const k = key();
    if (k !== lastKey) {
      if (lastKey && lastKey.split(":")[0] === String(s.encounter.id)) { finished.push(lastKey); done++; }
      lastKey = k; present.set(k, upNow());
    } else { const now = upNow(), p = present.get(k); for (const id of [...p]) if (!now.has(id)) p.delete(id); }
  };
  const act = (a) => { const r = apply(s, a, DM); if (r.ok) after(r); else stats.refused++; return r; };
  const answer = () => { if (s.pending) act({ type: "react", prompt: s.pending.n, take: rnd(2) ? null : s.pending.ask.options[0]?.reaction ?? null }); };
  const start = () => { budgetSeen = null; stats.fights++; ok(act({ type: "startEncounter", center: CENTER[grid], radius: 7 })); lastKey = key(); present.set(lastKey, upNow()); };
  // The DM's auto-play of one turn, as the client does it.
  const autoTurn = (id) => {
    stats.brainTurns++;
    const mode = s.entities[id].bond ? brainMode(s, s.entities[id]) : "monster";
    stats.modes[mode] = (stats.modes[mode] ?? 0) + 1;
    for (let n = 0; n < 25; n++) {
      if (!s.encounter || current(s) !== id) return;
      if (s.pending) { answer(); continue; }
      const a = aiStep(s, id);
      if (!a && !(s.entities[id]?.hp > 0)) { stats.downMidTurn = (stats.downMidTurn ?? 0) + 1; act({ type: "endTurn", actor: id }); return; }   // it dropped in its own turn (an Opportunity Attack): the DM ends it, as for any monster
      if (!a) { stats.stalls++; if (bad.length < 8) bad.push(`stall: ${id} (${mode})`); act({ type: "endTurn", actor: id }); return; }
      stats.brainSteps++;
      const r = act(a);
      if (!r.ok) {
        // The monster AI's own refusals (a creature with no bond) are as before C7 and are counted apart; the brain's
        // (a companion's) must be none.
        if (mode === "monster") stats.monsterRefused++; else { stats.brainRefused++; if (bad.length < 8) bad.push(`refused ${json(a)}: ${r.error}`); }
        act({ type: "endTurn", actor: id }); return;
      }
      if (a.type === "endTurn") return;                     // its turn is over (with everyone else set aside, the next may be its own again)
    }
    if (s.encounter && current(s) === id) { stats.loops++; if (bad.length < 8) bad.push(`loop: ${id} (${mode})`); act({ type: "endTurn", actor: id }); }
  };
  start();
  while (done < rounds) {
    if (!s.encounter) {
      for (const id of riders) { const e = s.entities[id]; if (e.dead) apply(s, { type: "setHp", actor: id, hp: 10 }, DM); else if (e.hp <= 0) ok(apply(s, { type: "mend", actor: id, amount: 50 }, DM)); if (e.away) apply(s, { type: "stepBack", actor: id }, DM); }
      for (const id of riders) if (s.entities[id].cond.stunned) apply(s, { type: "condition", actor: id, condition: "stunned", on: false }, DM);
      if (!Object.values(s.entities).some((o) => o.side === "foe" && !o.dead && o.hp > 0)) tough();
      restore();
      start(); continue;
    }
    if (s.pending) { answer(); continue; }
    const cur = current(s), e = s.entities[cur];
    if (s.encounter.turn === 0 && s.encounter.round % 4 === 1) horses = horses.map((h, i) => (s.entities[h] && !s.entities[h].dead ? h : i < 3 ? beside(s, riders[i], "warhorse") ?? h : h));
    // The DM, now and then, on anyone's turn.
    const who = riders[rnd(4)], d = rnd(40), w = s.entities[who], hz = horses[rnd(horses.length)];
    if (w?.dead) { if (!Object.values(s.entities).some((o) => o.id !== who && !o.dead && overlapAt(o, o.pos, w, w.pos, gridOf(s.map)))) act({ type: "setHp", actor: who, hp: 10 }); }
    else if (w) {
      if (d === 0) act({ type: "harm", actor: who, amount: w.hp });
      else if (d === 1) act({ type: "condition", actor: who, condition: "stunned" });
      else if (d === 14 && !s.entities.cleric.dead) act({ type: "condition", actor: "cleric", condition: "stunned" });     // the steed's master, often
      else if (d === 16) { for (const id of [skel, zombie, wolf]) if (s.entities[id]?.dead) act({ type: "setHp", actor: id, hp: 10 }); }
      else if (d === 2 || d === 3) act({ type: "condition", actor: who, condition: "stunned", on: false });
      else if (d >= 4 && d <= 6 && w.hp <= 0) act({ type: "mend", actor: who, amount: 20 });
      else if (d === 7) act({ type: "condition", actor: who, condition: "prone" });
      else if (d === 8 && s.entities[hz] && !s.entities[hz].dead) act({ type: "condition", actor: hz, condition: "prone" });
      else if (d === 9 && rnd(4) === 0 && s.entities[hz] && !s.entities[hz].dead && hz !== steed) act(rnd(2) ? { type: "harm", actor: hz, amount: 500 } : { type: "remove", actor: hz });
      else if (d === 10 && !w.away && rnd(3) === 0) act({ type: "stepAway", actor: who, how: "dodge" });
      else if (d === 11 && w.away) act({ type: "stepBack", actor: who });
      else if (d === 12 && w.riding) act({ type: "dismount", actor: who });
      else if (d === 13 && rnd(2)) { const id = rnd(2) && s.entities[hz] && !s.entities[hz].dead ? hz : who, p = s.entities[id].pos; act({ type: "place", actor: id, to: { q: p.q + rnd(5) - 2, r: p.r + rnd(5) - 2 } }); }
      else if (d === 15 && s.entities[owl]) act({ type: "companion", actor: owl, auto: rnd(2) === 0 });
    }
    if (!s.encounter || current(s) !== cur || s.pending) continue;
    if (e.kind === "npc" && autoPlays(s, cur)) { autoTurn(cur); continue; }
    if (e.bond) { const m = brainMode(s, e); stats.waits[m] = (stats.waits[m] ?? 0) + 1; assert.equal(aiStep(s, cur), null, `${cur} (${m}) is not the brain's`); }
    // A stand-in for a player or for the DM's hand.
    if (riders.includes(cur) && rnd(3)) {
      const c = rnd(8);
      if (!e.riding && c < 3) { for (const h of [...horses, bear]) if (s.entities[h] && act({ type: "mount", actor: cur, mount: h }).ok) break; }
      else if (e.riding && c === 0) act({ type: "dismount", actor: cur });
      else if (e.riding && c === 1) act({ type: "dash", actor: e.riding.on });
      else if (e.riding && c === 2) { const p = e.pos; act({ type: "move", actor: cur, to: { q: p.q + (rnd(3) - 1), r: p.r + (rnd(3) - 1) } }); }
      // A master commands its undead: for this turn only, or with an order that stands, or clearing it.
      if (cur === "cleric" && c === 7 && s.entities[skel]) act({ type: "command", actor: "cleric", ids: [skel], ...(rnd(3) === 0 ? { order: rnd(2) ? "hold the line" : null } : {}) });
      if (cur === "wizard" && c >= 4 && s.entities[zombie]) { const k = act({ type: "command", actor: "wizard", ids: [zombie], ...(rnd(2) ? { order: rnd(2) ? "guard the door" : null } : {}) }).ok ? "ok" : "no"; stats.commands[k] = (stats.commands[k] ?? 0) + 1; }
      if (cur === "wizard" && c === 3) {
        s.entities.wizard.slots[1] = 4; s.entities.wizard.slots[2] = 4;
        const G = gridOf(s.map), p = e.pos, near = horses.map((h) => s.entities[h]).filter((h) => h && !h.dead).sort((a, b) => G.dist(a.pos, p) - G.dist(b.pos, p))[0];
        const aim = near ? G.neighbors(p).sort((a, b) => G.dist(a, near.pos) - G.dist(b, near.pos) || a.q - b.q || a.r - b.r)[0] : { q: p.q + 1, r: p.r };
        act(rnd(4) === 0 ? { type: "cast", actor: "wizard", spell: "misty-step", hex: { q: p.q + rnd(9) - 4, r: p.r + rnd(9) - 4 } } : { type: "cast", actor: "wizard", spell: "thunderwave", hex: aim });
      }
    } else if (e.bond && rnd(2)) {
      // A companion the auto-play leaves to its player or to the DM's hand: a Dodge or a step.
      const p = e.pos;
      act(rnd(2) ? { type: "dodge", actor: cur } : { type: "move", actor: cur, to: { q: p.q + (rnd(3) - 1), r: p.r + (rnd(3) - 1) } });
    }
    if (!s.encounter || current(s) !== cur || s.pending) continue;
    act({ type: "endTurn", actor: cur });
  }
  let lost = 0, doubled = 0;
  for (const k of finished) for (const id of present.get(k) ?? []) {
    const n = worth.get(k)?.get(id) ?? 0;
    if (n === 0) { lost++; if (bad.length < 12) bad.push(`${k} ${id}: none`); }
    if (n > 1) { doubled++; if (bad.length < 12) bad.push(`${k} ${id}: ${n}`); }
  }
  return { lost, doubled, bad, finished, stats };
}


// What every run must show.
export function check(grid) {
  const json = (x) => JSON.stringify(x);
  const { lost, doubled, bad, finished, stats } = stress(grid, ROUNDS);
    if (process.env.C7_DEBUG) console.log(grid, json(stats), bad);
    assert.deepEqual(bad.filter((b) => / overlap| not whole/.test(b)), [], "nobody overlaps; every ride whole");
    assert.equal(stats.stalls, 0, `stalls: ${bad.join("; ")}`);
    assert.equal(stats.loops, 0, `endless turns: ${bad.join("; ")}`);
    assert.equal(stats.brainRefused, 0, `refused: ${bad.join("; ")}`);
    assert.equal(lost, 0, `lost: ${bad.join("; ")}`);
    assert.equal(doubled, 0, `doubled: ${bad.join("; ")}`);
    assert.ok(finished.length >= ROUNDS);
    // What the loop reached: each of the brain's ways of playing, and the monster AI.
    for (const m of ["guard", "protect", "free", "monster"]) assert.ok((stats.modes[m] ?? 0) >= 5, `the loop played '${m}': ${json(stats.modes)}`);
    for (const m of ["player", "dm"]) assert.ok((stats.waits[m] ?? 0) >= 5, `companions left to their player or the DM: ${json(stats.waits)}`);
    assert.ok(stats.rode >= 10, `rides: ${stats.rode}`);
}
