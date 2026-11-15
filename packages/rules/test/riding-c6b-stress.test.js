// Riding, stage C6b: the stress loop of riding.test.js (fix round 2) extended with what C6b adds. Three warhorses and
// four riders mounting, dismounting, dashing and moving; the wizard's Thunderwave pushing whoever it catches and its
// Misty Step out of the saddle; the DM harming, stunning, mending, knocking riders and mounts Prone (falling off),
// killing or removing a mount (a new one comes at the next round), and setting riders aside (stepping away, Dodge).
// After every action: nobody overlaps anyone but its own rider or mount, and every ride is whole. Over every round:
// every creature that was up and in the fight all round had exactly one turn's worth (its own turn, or for a mount
// its budget on a rider's turn), never none and never two. 2,400 rounds on hexes and on the square room. Fix round 1 of #363: the DM's `place` is in the mix (M1).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { apart, overlapAt } from "../src/space.js";
import { gridOf } from "../src/grid.js";
import { squareRoom } from "./fixtures/square-room.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
const ROUNDS = 2400;
const SPOTS = {
  hex: { fighter: { q: -6, r: 2 }, rogue: { q: -7, r: 3 }, cleric: { q: -7, r: 2 }, wizard: { q: -8, r: 3 }, goblin: { q: 2, r: 2 } },
  square: { fighter: { q: 3, r: 3 }, rogue: { q: 1, r: 12 }, cleric: { q: 2, r: 12 }, wizard: { q: 3, r: 12 }, goblin: { q: 11, r: 11 } },
};
const CENTER = { hex: { q: -2, r: 2 }, square: { q: 7, r: 7 } };
function beside(s, id, monster) {
  const G = gridOf(s.map), e = s.entities[id];
  for (const h of G.range(e.pos, 3).sort((a, b) => G.dist(a, e.pos) - G.dist(b, e.pos) || a.q - b.q || a.r - b.r)) {
    const t = structuredClone(s), r = apply(t, { type: "spawn", monster, at: h }, DM);
    if (!r.ok || apart(t, e, t.entities[r.events.find((x) => x.type === "spawned").id]) > 1) continue;
    const id2 = ok(apply(s, { type: "spawn", monster, at: h }, DM)).events.find((x) => x.type === "spawned").id;
    s.entities[id2].side = "party";
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

function stress(grid, rounds) {
  const s = newGame(9);
  if (grid === "square") ok(apply(s, { type: "loadMap", map: squareRoom() }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  for (const id of ["m1", "m2", "m3", "m4", "m5", "m6"]) if (s.entities[id]) ok(apply(s, { type: "remove", actor: id }, DM));
  const P = SPOTS[grid], riders = ["fighter", "rogue", "cleric", "wizard"];
  for (const id of riders) s.entities[id].pos = { ...P[id], z: 0 };
  s.entities.wizard.spells.push("thunderwave", "misty-step");
  let horses = [beside(s, "fighter", "warhorse"), beside(s, "cleric", "warhorse"), beside(s, "wizard", "warhorse")];
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: P.goblin }, DM));
  let x = 4242;
  const rnd = (n) => { x = (x * 1103515245 + 12345) % 2147483648; return Math.floor(x / 65536) % n; };
  const worth = new Map(), present = new Map();   // key `${fight}:${round}` -> Map(id -> turns' worth), Set of ids up and in the fight all round
  let lastKey = null, budgetSeen = null, done = 0, bad = [], stats = { fell: 0, pushed: 0, teleported: 0, gone: 0, apart: 0, actions: 0, refused: 0 };
  const key = () => `${s.encounter.id}:${s.encounter.round}`;
  const credit = (k, id) => { if (!worth.has(k)) worth.set(k, new Map()); worth.get(k).set(id, (worth.get(k).get(id) ?? 0) + 1); };
  const upNow = () => new Set(s.encounter.order.map((o) => o.id).filter((id) => { const e = s.entities[id]; return e && !e.dead && e.hp > 0 && !e.away; }));
  const finished = [];
  const after = (r) => {
    stats.actions++;
    const w = whole(s);
    if (w && bad.length < 5) bad.push(`${w} after ${json(r.events.map((e) => e.type))}`);
    for (const ev of r.events) {
      if (ev.type === "dismounted") { if (ev.fell) stats.fell++; if (ev.why === "pushed") stats.pushed++; if (ev.why === "teleport") stats.teleported++; if (ev.why === "gone") stats.gone++; if (ev.why === "apart") stats.apart++; }
      if (ev.type === "turn" && s.encounter && !ev.someone) credit(`${s.encounter.id}:${ev.round}`, ev.id);
    }
    if (!s.encounter) return;
    const b = s.encounter.budget?.mount, m = s.entities[current(s)]?.riding?.on;
    if (b && b !== budgetSeen && m && (b.move > 0 || b.action > 0)) credit(key(), m);
    budgetSeen = b ?? null;
    const k = key();
    if (k !== lastKey) {
      if (lastKey && lastKey.split(":")[0] === String(s.encounter.id)) { finished.push(lastKey); done++; }
      lastKey = k; present.set(k, upNow());
    } else { const now = upNow(), p = present.get(k); for (const id of [...p]) if (!now.has(id)) p.delete(id); }
  };
  const act = (a) => { const r = apply(s, a, DM); if (r.ok) after(r); else stats.refused++; return r; };
  const start = () => { budgetSeen = null; ok(act({ type: "startEncounter", center: CENTER[grid], radius: 7 })); lastKey = key(); present.set(lastKey, upNow()); };
  start();
  while (done < rounds) {
    if (!s.encounter) {
      for (const id of riders) { const e = s.entities[id]; if (e.dead) ok(apply(s, { type: "setHp", actor: id, hp: 10 }, DM)); else if (e.hp <= 0) ok(apply(s, { type: "mend", actor: id, amount: 50 }, DM)); if (e.away) apply(s, { type: "stepBack", actor: id }, DM); }
      // The goblin that keeps the fight going may have died (a Thunderwave): another, far off.
      if (!Object.values(s.entities).some((x) => x.side === "foe" && !x.dead && x.hp > 0)) apply(s, { type: "spawn", monster: "goblin-warrior", at: P.goblin }, DM);
      start(); continue;
    }
    const cur = current(s), e = s.entities[cur];
    // A mount killed or removed is replaced at the next round's start, beside a rider.
    horses = horses.map((h) => (s.entities[h] && !s.entities[h].dead ? h : h));
    if (s.encounter.turn === 0) horses = horses.map((h, i) => (s.entities[h] && !s.entities[h].dead ? h : beside(s, riders[i], "warhorse") ?? h));
    // The DM, now and then, on anyone's turn.
    const who = riders[rnd(4)], d = rnd(40), w = s.entities[who], hz = horses[rnd(3)];
    // A dead rider is brought back only where nobody stands on its body (the DM's setHp does not look: DEBT).
    if (w?.dead) { if (!Object.values(s.entities).some((o) => o.id !== who && !o.dead && overlapAt(o, o.pos, w, w.pos, gridOf(s.map)))) act({ type: "setHp", actor: who, hp: 10 }); }
    else if (w) {
      if (d === 0) act({ type: "harm", actor: who, amount: w.hp });
      else if (d === 1) act({ type: "condition", actor: who, condition: "stunned" });
      else if (d === 2 || d === 3) act({ type: "condition", actor: who, condition: "stunned", on: false });
      else if (d >= 4 && d <= 6 && w.hp <= 0) act({ type: "mend", actor: who, amount: 20 });
      else if (d === 7) act({ type: "condition", actor: who, condition: "prone" });
      else if (d === 8 && s.entities[hz] && !s.entities[hz].dead) act({ type: "condition", actor: hz, condition: "prone" });
      else if (d === 9 && rnd(4) === 0 && s.entities[hz] && !s.entities[hz].dead) act(rnd(2) ? { type: "harm", actor: hz, amount: 500 } : { type: "remove", actor: hz });
      else if (d === 10 && !w.away && rnd(3) === 0) act({ type: "stepAway", actor: who, how: "dodge" });
      else if (d === 11 && w.away) act({ type: "stepBack", actor: who });
      else if (d === 12 && w.riding) act({ type: "dismount", actor: who });
      // The DM sets one half of a pair (or anyone) down a cell or two away: refused onto the other half (fix round 1 of
      // #363, M1), else the ride ends; never an overlap.
      else if (d === 13 && rnd(2)) { const id = rnd(2) && s.entities[hz] && !s.entities[hz].dead ? hz : who, p = s.entities[id].pos; act({ type: "place", actor: id, to: { q: p.q + rnd(5) - 2, r: p.r + rnd(5) - 2 } }); }
    }
    if (!s.encounter || current(s) !== cur) continue;
    if (riders.includes(cur) && e && rnd(3)) {
      const c = rnd(7);
      if (!e.riding && c < 3) { for (const h of horses) if (s.entities[h] && act({ type: "mount", actor: cur, mount: h }).ok) break; }
      else if (e.riding && c === 0) act({ type: "dismount", actor: cur });
      else if (e.riding && c === 1) act({ type: "dash", actor: e.riding.on });
      else if (e.riding && c === 2) { const p = e.pos; act({ type: "move", actor: cur, to: { q: p.q + (rnd(3) - 1), r: p.r + (rnd(3) - 1) } }); }
      if (cur === "wizard" && (c >= 3 || rnd(2))) {
        s.entities.wizard.slots[1] = 4; s.entities.wizard.slots[2] = 4;
        // Thunderwave aimed at the nearest horse (it pushes whoever fails), Misty Step anywhere near.
        const G = gridOf(s.map), p = e.pos, near = horses.map((h) => s.entities[h]).filter((h) => h && !h.dead).sort((a, b) => G.dist(a.pos, p) - G.dist(b.pos, p))[0];
        const aim = near ? G.neighbors(p).sort((a, b) => G.dist(a, near.pos) - G.dist(b, near.pos) || a.q - b.q || a.r - b.r)[0] : { q: p.q + 1, r: p.r };
        act(c === 6 ? { type: "cast", actor: "wizard", spell: "misty-step", hex: { q: p.q + rnd(9) - 4, r: p.r + rnd(9) - 4 } } : { type: "cast", actor: "wizard", spell: "thunderwave", hex: aim });
      }
    }
    if (!s.encounter || current(s) !== cur) continue;
    act({ type: "endTurn", actor: cur });
  }
  let lost = 0, doubled = 0;
  for (const k of finished) for (const id of present.get(k) ?? []) {
    const n = worth.get(k)?.get(id) ?? 0;
    if (n === 0) { lost++; if (bad.length < 8) bad.push(`${k} ${id}: none`); }
    if (n > 1) { doubled++; if (bad.length < 8) bad.push(`${k} ${id}: ${n}`); }
  }
  return { lost, doubled, bad, finished, stats };
}

for (const grid of ["hex", "square"]) {
  test(`${grid}: C6b stress, ${ROUNDS} rounds with pushes, teleports, falls, a mount killed or removed, and the DM's harm, stuns and mends: one turn's worth a round for every creature, and no pair left overlapping`, () => {
    const { lost, doubled, bad, finished, stats } = stress(grid, ROUNDS);
    assert.deepEqual(bad.filter((b) => / overlap| not whole/.test(b)), [], "nobody overlaps; every ride whole");
    assert.equal(lost, 0, `lost: ${bad.join("; ")}`);
    assert.equal(doubled, 0, `doubled: ${bad.join("; ")}`);
    assert.ok(finished.length >= ROUNDS);
    // How much of each the seeded loop reaches (the hex valley is roomier, so riders and horses part more often there).
    for (const [k, n] of grid === "hex" ? [["fell", 10], ["pushed", 1], ["teleported", 1], ["apart", 1]] : [["fell", 20], ["gone", 2], ["pushed", 1], ["teleported", 1], ["apart", 1]]) assert.ok(stats[k] >= n, `the loop exercised ${k}: ${json(stats)}`);
  });
}
