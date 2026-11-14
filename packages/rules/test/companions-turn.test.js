// Companions, stage C2 (docs/specs/companions.md): a companion's turn straight after its master's (`after` in the
// fight order), a summon kept by a lasting effect, and a bond that ends at its master's Long Rest. With what
// players are sent of all of it, twin runs against an unbonded creature, and undo, redo and replay.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { gridOf } from "../src/grid.js";
import { initiativeSort } from "../src/engine/world.js";
import { startEffect } from "../src/durations.js";
import { BOND_MAX } from "../src/engine/companions.js";
import { aiStep } from "../src/ai.js";

const DM = { role: "dm", userId: "dm" };
const U1 = { role: "player", userId: "u1" };
const U2 = { role: "player", userId: "u2" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (s) => JSON.stringify(s);
function refused(s, action, ctx, words) {
  const before = json(s), r = apply(s, action, ctx);
  assert.equal(r.ok, false, `${action.type} should be refused`);
  if (words) assert.match(r.error, words);
  assert.equal(json(s), before, "a refused action changes nothing");
  return r;
}
// Free cells near a position, where a creature can be added (the n-th of them).
function spot(s, near, n = 0, r = 3) {
  const G = gridOf(s.map), out = [];
  for (const h of G.range(near, r)) if (apply(structuredClone(s), { type: "spawn", monster: "wolf", at: h }, DM).ok) out.push(h);
  return out[n];
}
const spawn = (s, monster, at, name) => ok(apply(s, { type: "spawn", monster, at, ...(name ? { name } : {}) }, DM)).events.find((e) => e.type === "spawned").id;
const bond = (s, actor, to, more = {}) => ok(apply(s, { type: "bond", actor, to, ...more }, DM));
function table(grid, seed = 5) {
  const s = newGame(seed, grid ? { grid } : {});
  s.settings.autoEngage = false;                  // the DM starts the fights here
  ok(apply(s, { type: "claim", entity: "fighter", user: "u1", userName: "Ann" }, U1));
  ok(apply(s, { type: "claim", entity: "rogue", user: "u2", userName: "Bo" }, U2));
  return s;
}
const ids = (s) => s.encounter.order.map((o) => o.id);
// Every `after` entry stands straight behind its master, its master's companions together in the order given.
function behindMaster(s, master, comps) {
  const o = ids(s), i = o.indexOf(master);
  assert.ok(i >= 0, "the master is in the order");
  assert.deepEqual(o.slice(i + 1, i + 1 + comps.length), comps, `behind ${master}: ${o.join(" ")}`);
  for (const c of comps) {
    const e = s.encounter.order.find((x) => x.id === c);
    assert.equal(e.after, master);
    assert.equal(e.init, s.encounter.order[i].init, "on the master's count");
  }
}
// Who took a turn in which round, from the events.
function turnsOf(events) {
  const by = {};
  for (const e of events) if (e.type === "turn" && e.id) (by[e.round] ??= []).push(e.id);
  return by;
}
const endTurn = (s) => ok(apply(s, { type: "endTurn", actor: current(s) }, DM));

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";

  test(`initiativeSort puts each after entry behind its master, keeps ties as they stood, and is the old sort without any${on}`, () => {
    const order = [
      { id: "a", init: 12, dex: 14 }, { id: "c1", init: 12, dex: 20, after: "a" }, { id: "x", init: 12, dex: 14 },
      { id: "b", init: 18, dex: 10 }, { id: "c2", init: 12, dex: 3, after: "a" }, { id: "orphan", init: 15, dex: 8, after: "gone" },
      { id: "c3", init: 12, dex: 9, after: "a" },
    ];
    assert.deepEqual(initiativeSort(order).map((o) => o.id), ["b", "orphan", "a", "c1", "c2", "c3", "x"]);
    // The tie between a and x is kept whichever stood first.
    const xFirst = [{ id: "x", init: 12, dex: 14 }, { id: "c1", init: 12, dex: 20, after: "a" }, { id: "a", init: 12, dex: 14 }, { id: "b", init: 18, dex: 10 }];
    assert.deepEqual(initiativeSort(xFirst).map((o) => o.id), ["b", "x", "a", "c1"]);
    // Without after entries: exactly the plain stable sort, over many random orders with ties.
    let seed = 7;
    const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    for (let k = 0; k < 300; k++) {
      const o = Array.from({ length: 1 + rnd(12) }, (_, i) => ({ id: `e${i}`, init: rnd(6), dex: rnd(3) }));
      const plain = [...o].sort((a, b) => b.init - a.init || b.dex - a.dex).map((x) => x.id);
      assert.deepEqual(initiativeSort(o.map((x) => ({ ...x }))).map((x) => x.id), plain);
    }
  });

  test(`three after companions stay behind their master through a whole fight with ties and joins${on}`, () => {
    const s = table(grid), f = s.entities.fighter;
    const comps = [0, 1, 2].map((n) => spawn(s, "wolf", spot(s, f.pos, n), `Hound ${n + 1}`));
    for (const c of comps) bond(s, c, "fighter", { turn: "after" });
    spawn(s, "goblin-warrior", spot(s, f.pos, 5), "Gob");
    const fourth = spawn(s, "wolf", spot(s, s.entities.m5.pos, 0), "Hound 4");     // far off, out of the fight
    bond(s, fourth, "fighter", { turn: "after" });
    const all = [];
    const r0 = ok(apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM));
    assert.ok(!ids(s).includes(fourth));
    all.push(...r0.events);
    behindMaster(s, "fighter", comps);
    // A tie: another creature on the fighter's count and Dexterity, standing before it in the order.
    const fi = ids(s).indexOf("fighter"), other = s.encounter.order.find((o) => !comps.includes(o.id) && o.id !== "fighter" && !o.after);
    Object.assign(other, { init: s.encounter.order[fi].init, dex: s.encounter.order[fi].dex });
    const cur = current(s);
    initiativeSort(s.encounter.order); s.encounter.turn = ids(s).indexOf(cur);
    behindMaster(s, "fighter", comps);
    // Rounds go by; foes join, and a fourth companion, made later, joins behind the other three.
    for (let i = 0; i < 60 && s.encounter; i++) {
      if (i === 5) all.push(...ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: spot(s, f.pos, 6), name: "Late Gob" }, DM)).events);
      if (i === 9) {
        all.push(...ok(apply(s, { type: "move", actor: fourth, to: spot(s, f.pos, 7) }, DM)).events);
      }
      if (i === 14) all.push(...ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: spot(s, f.pos, 8), name: "Later Gob" }, DM)).events);
      all.push(...endTurn(s).events);
      behindMaster(s, "fighter", ids(s).includes(fourth) ? [...comps, fourth] : comps);
    }
    // Every round, each creature had one turn at most, and the companions came straight after their master.
    for (const [round, who] of Object.entries(turnsOf(all))) {
      assert.equal(new Set(who).size, who.length, `round ${round}: nobody has two turns: ${who.join(" ")}`);
      const i = who.indexOf("fighter");
      if (i >= 0 && i + 3 < who.length) assert.deepEqual(who.slice(i + 1, i + 4), comps, `round ${round}`);
    }
    assert.ok(ids(s).includes(fourth), "the fourth companion joined");
  });

  test(`a companion made in its master's turn acts next${on}`, () => {
    const s = table(grid), f = s.entities.fighter;
    spawn(s, "goblin-warrior", spot(s, f.pos, 5), "Gob");
    const w = spawn(s, "wolf", spot(s, s.entities.m5.pos, 0), "Owl");     // outside the fight, the fighter's, brought in on its turn
    bond(s, w, "fighter", { turn: "after", kind: "summon" });
    ok(apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM));
    for (let i = 0; i < 20 && current(s) !== "fighter"; i++) endTurn(s);
    assert.equal(current(s), "fighter");
    const j = ok(apply(s, { type: "move", actor: w, to: spot(s, f.pos, 4) }, DM));
    const joined = j.events.find((e) => e.type === "joined");
    assert.deepEqual({ ...joined, init: undefined }, { type: "joined", id: w, init: undefined, after: "fighter" }, "no roll: its master's count");
    assert.equal(current(s), "fighter", "the turn stays with the master");
    const next = endTurn(s).events.find((e) => e.type === "turn");
    assert.equal(next.id, w, "it acts straight after its master");
    // A creature already in the fight, bonded in its master's turn while its own is still to come, moves behind it at once.
    const s2 = table(grid);
    const late = spawn(s2, "wolf", spot(s2, s2.entities.fighter.pos, 2), "Pup");
    bond(s2, late, "fighter");                                            // the fighter's, with a turn of its own
    spawn(s2, "goblin-warrior", spot(s2, s2.entities.fighter.pos, 5), "Gob");
    ok(apply(s2, { type: "startEncounter", center: s2.entities.fighter.pos, radius: 6 }, DM));
    for (let i = 0; i < 20 && current(s2) !== "fighter"; i++) endTurn(s2);
    const wasAfter = ids(s2).indexOf(late) > s2.encounter.turn;
    bond(s2, late, null);
    bond(s2, late, "fighter", { turn: "after" });
    if (wasAfter) behindMaster(s2, "fighter", [late]);
    else assert.ok(!s2.encounter.order.find((o) => o.id === late).after, "its turn this round is had already: it moves at the next round");
    const all = [];
    for (let i = 0; i < 16 && s2.encounter; i++) all.push(...endTurn(s2).events);
    behindMaster(s2, "fighter", [late]);
    for (const who of Object.values(turnsOf(all))) assert.equal(new Set(who).size, who.length, "nobody has two turns in a round");
  });

  test(`a companion whose master is not in the fight rolls its own Initiative, and goes behind its master when the master joins${on}`, () => {
    const s = table(grid), f = s.entities.fighter;
    const w = spawn(s, "wolf", spot(s, f.pos, 0), "Hound");
    bond(s, w, "fighter", { turn: "after" });
    // The fighter far off: the fight is round its wolf and the others.
    ok(apply(s, { type: "move", actor: "fighter", to: spot(s, s.entities.m5.pos, 1) }, DM));
    spawn(s, "goblin-warrior", spot(s, s.entities.rogue.pos, 4), "Gob");
    const r = ok(apply(s, { type: "startEncounter", center: s.entities.rogue.pos, radius: 4 }, DM));
    assert.ok(!ids(s).includes("fighter"));
    const start = r.events.find((e) => e.type === "encounterStart").order.find((o) => o.id === w);
    assert.ok(start.dice && !start.after, "it rolled");
    const note = r.events.find((e) => e.type === "note" && e.id === w);
    assert.match(note.text, /rolls its own Initiative/);
    assert.ok(viewEvents(r.events, s, U2).some((e) => e.type === "note" && e.id === w), "the party's own: told in the open");
    // The fighter comes back into the fight; within a round its wolf is behind it, and nobody had two turns.
    const all = [...ok(apply(s, { type: "move", actor: "fighter", to: spot(s, s.entities.rogue.pos, 2) }, DM)).events];
    assert.ok(ids(s).includes("fighter"));
    for (let i = 0; i < 2 * ids(s).length + 2 && s.encounter; i++) all.push(...endTurn(s).events);
    behindMaster(s, "fighter", [w]);
    for (const who of Object.values(turnsOf(all))) assert.equal(new Set(who).size, who.length, "nobody has two turns in a round");
  });

  test(`after is not sent for a foe; the party's own after is${on}`, () => {
    const s = table(grid), f = s.entities.fighter;
    const mine = spawn(s, "wolf", spot(s, f.pos, 0, 1), "Hound");
    bond(s, mine, "fighter", { turn: "after" });
    const theirs = [spawn(s, "wolf", spot(s, s.entities.m1.pos, 0), "Pet A"), spawn(s, "wolf", spot(s, s.entities.m1.pos, 1), "Pet B")];
    for (const t of theirs) bond(s, t, "m1", { turn: "after" });
    const late = spawn(s, "wolf", spot(s, s.entities.m5.pos, 0, 1), "Pet C");          // out of the fight to come
    bond(s, late, "m1", { turn: "after" });
    const r = ok(apply(s, { type: "startEncounter", center: { q: -1, r: 0 }, radius: 7 }, DM));
    assert.ok(!ids(s).includes(late));
    behindMaster(s, "m1", theirs);
    behindMaster(s, "fighter", [mine]);
    for (let i = 0; i < 30 && current(s) === late; i++) endTurn(s);
    const j = ok(apply(s, { type: "move", actor: late, to: spot(s, s.entities.m1.pos, 3) }, DM));
    for (const u of [U1, U2]) {
      const v = view(s, u).encounter.order;
      for (const t of [...theirs, late]) assert.deepEqual(v.find((o) => o.id === t), { id: t }, "a foe's companion: no after, no count");
      assert.equal(v.find((o) => o.id === mine).after, "fighter");
      const st = viewEvents(r.events, s, u).find((e) => e.type === "encounterStart").order;
      for (const t of theirs) assert.deepEqual(st.find((o) => o.id === t), { id: t });
      assert.equal(st.find((o) => o.id === mine).after, "fighter");
      assert.deepEqual(viewEvents(j.events, s, u).find((e) => e.type === "joined"), { type: "joined", id: late });
      assert.ok(!json(viewEvents(s.timeline, s, u)).includes('"after":"m1"'));
      assert.ok(!json(view(s, u)).includes('"after":"m1"'));
    }
    assert.equal(view(s, DM).encounter.order.find((o) => o.id === late).after, "m1", "the DM sees it");
  });

  test(`ending the effect removes the summoned creature and its place in the order${on}`, () => {
    const s = table(grid), f = s.entities.fighter;
    const w = spawn(s, "wolf", spot(s, f.pos, 0), "Spirit"), x = spawn(s, "wolf", spot(s, f.pos, 1), "Spirit Two");
    for (const id of [w, x]) bond(s, id, "fighter", { turn: "after", kind: "summon" });
    const fx = startEffect(s, { name: "Summon Thing", spell: null, source: "fighter", conc: true, duration: "1 hour" });
    fx.parts.push({ target: w, summon: true }, { target: x, summon: true });
    for (const id of [w, x]) s.entities[id].bond.fx = fx.id;
    spawn(s, "goblin-warrior", spot(s, f.pos, 5), "Gob");
    ok(apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM));
    behindMaster(s, "fighter", [w, x]);
    // The first one drops to 0: it vanishes, and the effect goes on holding the other.
    const h = ok(apply(s, { type: "harm", actor: w, amount: 999 }, DM));
    assert.ok(!s.entities[w] && !ids(s).includes(w));
    assert.ok(s.effects.includes(fx), "the effect holds the other still");
    assert.equal(h.events.find((e) => e.type === "vanished").why, "hp0");
    // Its turn: ending the effect then takes the other, passes the turn, and its place goes.
    for (let i = 0; i < 20 && current(s) !== x; i++) endTurn(s);
    assert.equal(current(s), x);
    const r = ok(apply(s, { type: "endEffect", effect: fx.id }, U1));
    assert.ok(!s.entities[x], "the creature is gone");
    assert.ok(!ids(s).includes(x), "and its place in the order");
    assert.ok(!s.effects.includes(fx));
    const told = viewEvents(r.events, s, U1);
    assert.deepEqual(told.find((e) => e.type === "vanished"), { type: "vanished", id: x, name: "Spirit Two", why: "ended" });
    assert.ok(told.some((e) => e.type === "turn" && e.id && e.id !== x), "the turn passed on");
    // Concentration lost the same way, outside a fight: the master drops to 0.
    const s3 = table(grid), y = spawn(s3, "wolf", spot(s3, s3.entities.fighter.pos, 2), "Spirit Three");
    void s3;
    bond(s3, y, "fighter", { turn: "after", kind: "summon" });
    const fy = startEffect(s3, { name: "Summon Thing", spell: null, source: "fighter", conc: true, duration: "1 hour" });
    fy.parts.push({ target: y, summon: true }); s3.entities[y].bond.fx = fy.id;
    const r3 = ok(apply(s3, { type: "harm", actor: "fighter", amount: 999 }, DM));
    assert.ok(!s3.entities[y], "a master at 0 loses Concentration, and the summon with it");
    assert.equal(r3.events.find((e) => e.type === "vanished").why, "ended");
  });

  test(`a companion whose bond ends at its master's Long Rest vanishes when its master finishes one${on}`, () => {
    const s = table(grid), f = s.entities.fighter;
    const w = spawn(s, "wolf", spot(s, f.pos, 0), "Fey Cat"), x = spawn(s, "wolf", spot(s, f.pos, 1), "Rogue's Cat");
    bond(s, w, "fighter", { kind: "familiar" }); bond(s, x, "rogue", { kind: "familiar" });
    s.entities[w].bond.ends = ["longRest"]; s.entities[x].bond.ends = ["longRest"];
    // A master who can't finish a Long Rest (at 0 Hit Points) keeps it.
    s.entities.rogue.hp = 0;
    const r = ok(apply(s, { type: "rest" }, DM));
    assert.ok(!s.entities[w]);
    assert.ok(s.entities[x], "the rogue did not finish a Long Rest");
    assert.deepEqual(viewEvents(r.events, s, U1).find((e) => e.type === "vanished"), { type: "vanished", id: w, name: "Fey Cat", why: "rest" });
    ok(apply(s, { type: "shortRest" }, DM));
    assert.ok(s.entities[x], "a Short Rest is not a Long Rest");
  });
}

// ---------- hidden information: twin runs, bonded against unbonded ----------

// What players get of a run: every action's events, the view after each, the record, and the counter.
function seenBy(s, results) {
  return [U1, U2].map((u) => ({ ev: results.map((r) => json(viewEvents(r.events, s, u))), view: json(view(s, u)), tl: json(viewEvents(s.timeline, s, u)) }));
}
const hide = (s, id) => ok(apply(s, { type: "reveal", actor: id, hidden: true }, DM));

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";

  test(`a foe's after companion whose hidden master is not in the fight: players get just what an unbonded creature gives${on}`, () => {
    const run = (bonded) => {
      const s = table(grid), f = s.entities.fighter, out = [];
      const mage = spawn(s, "goblin-warrior", spot(s, s.entities.m5.pos, 0, 1), "Hidden Mage");
      hide(s, mage);
      const pet = spawn(s, "wolf", spot(s, f.pos, 1, 2), "Grey Pet");
      if (bonded) bond(s, pet, mage, { turn: "after", kind: "summon" });
      out.push(ok(apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM)));
      assert.ok(!ids(s).includes(mage) && ids(s).includes(pet));
      for (let i = 0; i < 3 * ids(s).length && s.encounter; i++) {
        if (i === 4) out.push(ok(apply(s, { type: "move", actor: mage, to: spot(s, s.entities.m5.pos, 2, 1) }, DM)));
        out.push(endTurn(s));
      }
      return { s, seen: seenBy(s, out), seq: s.seq, dm: out.flatMap((r) => r.events) };
    };
    const A = run(true), B = run(false);
    assert.deepEqual(A.seen, B.seen);
    assert.equal(A.seq, B.seq);
    assert.ok(A.dm.some((e) => e.type === "manual" && e.partial && /rolls its own Initiative/.test(e.text)), "the DM is told why it rolled");
    assert.ok(!B.dm.some((e) => /rolls its own Initiative/.test(e.text ?? "")));
  });

  test(`a hidden companion that vanishes at its hidden master's Long Rest: players get what an unbonded one gives, and the husk is no one's${on} (#313 L2)`, () => {
    const run = (bonded) => {
      const s = table(grid);
      const mage = spawn(s, "goblin-warrior", spot(s, s.entities.m5.pos, 0, 1), "Hidden Mage");
      const imp = spawn(s, "wolf", spot(s, s.entities.m5.pos, 1, 2), "Hidden Imp");
      if (bonded) { bond(s, imp, mage, { kind: "familiar" }); s.entities[imp].bond.ends = ["longRest"]; }
      hide(s, mage); hide(s, imp);
      const r = ok(apply(s, { type: "rest", ids: [mage, imp] }, DM));
      const t = ok(apply(s, { type: "advanceTime", minutes: 30 }, DM));
      return { s, mage, imp, r, seen: seenBy(s, [r, t]), seq: s.seq };
    };
    const A = run(true), B = run(false);
    assert.deepEqual(A.seen, B.seen);
    assert.equal(A.seq, B.seq);
    const husk = A.s.entities[A.imp];
    assert.ok(husk.dead && husk.hidden && husk.vanished === "rest");
    assert.equal(husk.bond, undefined, "the husk keeps no bond");
    // So it does not count toward its master's companions: the master can itself be bonded now.
    const other = spawn(A.s, "goblin-warrior", spot(A.s, A.s.entities.m1.pos, 0), "Boss");
    bond(A.s, A.mage, other);
    // And a master with BOND_MAX husks is not full.
    assert.ok(BOND_MAX > 1);
  });

  test(`a hidden summon whose hidden master's effect ends: players get what an unbonded creature gives${on}`, () => {
    const run = (bonded) => {
      const s = table(grid);
      const mage = spawn(s, "goblin-warrior", spot(s, s.entities.m5.pos, 0, 1), "Hidden Mage");
      const spirit = spawn(s, "wolf", spot(s, s.entities.m5.pos, 1, 2), "Hidden Spirit");
      if (bonded) bond(s, spirit, mage, { kind: "summon", turn: "after" });
      hide(s, mage); hide(s, spirit);
      const fx = startEffect(s, { name: "Summon Thing", spell: null, source: mage, conc: true, duration: "1 hour" });
      fx.parts.push({ target: spirit, summon: true }, { target: "fighter", cond: "frightened" });
      s.entities.fighter.cond.frightened = { source: mage, effect: fx.id };
      if (bonded) s.entities[spirit].bond.fx = fx.id;
      const r = ok(apply(s, { type: "endEffect", effect: fx.id }, DM));
      const t = ok(apply(s, { type: "advanceTime", minutes: 30 }, DM));
      return { s, spirit, r, seen: seenBy(s, [r, t]), seq: s.seq };
    };
    const A = run(true), B = run(false);
    assert.deepEqual(A.seen, B.seen);
    assert.equal(A.seq, B.seq);
    assert.ok(A.r.events.some((e) => e.type === "vanished" && e.why === "ended"), "it did vanish");
    assert.ok(A.s.entities[A.spirit].dead && A.s.entities[A.spirit].vanished === "ended");
    assert.ok(!json(A.seen).includes(A.spirit), "no id of it reaches a player");
  });
}

test("why an effect ended is not told in words that name a creature it was on that players do not know of (#313 L1)", async () => {
  const s = table(), w = spawn(s, "wolf", spot(s, s.entities.m1.pos, 0), "Zorblax");
  const fx = startEffect(s, { name: "Hex", spell: null, source: "wizard", conc: true, duration: "1 hour" });
  fx.parts.push({ target: w, cond: "poisoned" }, { target: "fighter", cond: "prone" });
  s.entities[w].cond.poisoned = { source: "wizard", effect: fx.id }; s.entities.fighter.cond.prone = { effect: fx.id };
  hide(s, w);
  const r = ok(apply(s, { type: "remove", actor: w }, DM));
  const end = viewEvents(r.events, s, U1).find((e) => e.type === "effectEnd");
  assert.ok(end, "the end is told: it was on the fighter");
  assert.equal(end.source, "wizard");
  assert.ok(!json(viewEvents(r.events, s, U1)).includes("Zorblax"), "the hidden creature is not named");
  assert.equal(end.why, "it ended");
  assert.deepEqual(end.targets, ["fighter"]);
  // Words that name nobody they do not know of are kept; the DM gets them all.
  const ev = [{ type: "effectEnd", fx: "fx9", name: "Hex", source: "wizard", targets: ["fighter", "m1"], why: "its time ran out" }];
  hide(s, "m1");
  assert.equal(viewEvents(ev, s, U1)[0].why, "its time ran out");
  assert.equal(viewEvents([{ ...ev[0], why: "Goblin Warrior 1 took damage" }], s, U1)[0].why, "it ended");
  assert.equal(viewEvents([{ ...ev[0], why: "Goblin Warrior 1 took damage" }], s, DM)[0].why, "Goblin Warrior 1 took damage");
});

for (const grid of [null, "square"]) {
  test(`undo and redo give back exactly what the order and a summon's end did, and the same actions replay the same${grid ? " (squares)" : " (hexes)"}`, () => {
    const build = () => {
      const s = table(grid), f = s.entities.fighter;
      const a = spawn(s, "wolf", spot(s, f.pos, 0, 2), "Hound A"), b = spawn(s, "wolf", spot(s, s.entities.m5.pos, 0, 1), "Hound B");
      for (const id of [a, b]) bond(s, id, "fighter", { turn: "after", kind: "summon" });
      const fx = startEffect(s, { name: "Summon Thing", spell: null, source: "fighter", conc: true, duration: "1 hour" });
      fx.parts.push({ target: a, summon: true }); s.entities[a].bond.fx = fx.id;
      spawn(s, "goblin-warrior", spot(s, f.pos, 5), "Gob");
      return { s, a, b, fx: fx.id, near: spot(s, f.pos, 7) };
    };
    const { s, b, fx, near } = build();
    const acts = [
      { type: "startEncounter", center: s.entities.fighter.pos, radius: 6 },
      { type: "endTurn", actor: null }, { type: "endTurn", actor: null },
      { type: "move", actor: b, to: near },
      { type: "endTurn", actor: null },
      { type: "endEffect", effect: fx },
      { type: "endTurn", actor: null }, { type: "endTurn", actor: null }, { type: "endTurn", actor: null },
    ];
    const h = createHistory(), states = [json(s)], done = [];
    for (const a0 of acts) {
      const a = a0.type === "endTurn" ? { ...a0, actor: current(s) } : a0;
      const before = mark(s), r = ok(apply(s, a, DM));
      h.record(before, s, describeStep(a, r.events, before, s));
      done.push(a); states.push(json(s));
    }
    for (let i = acts.length - 1; i >= 0; i--) { h.undo(s); assert.equal(json(s), states[i], `undo ${i}`); }
    for (let i = 1; i <= acts.length; i++) { h.redo(s); assert.equal(json(s), states[i], `redo ${i}`); }
    const again = build().s;
    for (const a of done) ok(apply(again, a, DM));
    assert.equal(json(again), states.at(-1), "replayed, the same");
  });
}

for (const grid of [null, "square"]) {
  test(`a master joining after its companion has had its turn: the companion moves behind it at the next round, not twice in one${grid ? " (squares)" : " (hexes)"}`, () => {
    const s = table(grid), f = s.entities.fighter;
    const w = spawn(s, "wolf", spot(s, f.pos, 0), "Hound");
    bond(s, w, "fighter", { turn: "after" });
    s.entities[w].initBonus = 60;                                        // first in every round
    s.entities.fighter.initBonus = -60;                                  // last when it comes
    ok(apply(s, { type: "move", actor: "fighter", to: spot(s, s.entities.m5.pos, 1) }, DM));
    spawn(s, "goblin-warrior", spot(s, s.entities.rogue.pos, 4), "Gob");
    const all = [...ok(apply(s, { type: "startEncounter", center: s.entities.rogue.pos, radius: 4 }, DM)).events];
    assert.equal(ids(s)[0], w);
    all.push(...endTurn(s).events);                                       // its turn is had
    const round = s.encounter.round;
    all.push(...ok(apply(s, { type: "move", actor: "fighter", to: spot(s, s.entities.rogue.pos, 2) }, DM)).events);
    assert.ok(!s.encounter.order.find((o) => o.id === w).after, "not now: it would act twice this round");
    assert.equal(ids(s)[0], w);
    for (let i = 0; i < 12 && s.encounter.round === round; i++) all.push(...endTurn(s).events);
    behindMaster(s, "fighter", [w]);
    const by = turnsOf(all);
    assert.deepEqual(by[round].filter((x) => x === w), [w], "one turn in the round the master joined");
    for (let i = 0; i < ids(s).length; i++) all.push(...endTurn(s).events);
    const next = turnsOf(all)[round + 1];
    assert.equal(next[next.indexOf("fighter") + 1], w, "then straight after its master");
    // Bonded while it is its own turn: it stays put for now.
    const s2 = table(grid), p = spawn(s2, "wolf", spot(s2, s2.entities.fighter.pos, 0), "Pup");
    bond(s2, p, "fighter"); s2.entities[p].initBonus = 60;
    spawn(s2, "goblin-warrior", spot(s2, s2.entities.fighter.pos, 5), "Gob");
    ok(apply(s2, { type: "startEncounter", center: s2.entities.fighter.pos, radius: 6 }, DM));
    assert.equal(current(s2), p);
    const before = ids(s2);
    bond(s2, p, null); bond(s2, p, "fighter", { turn: "after" });
    assert.deepEqual(ids(s2), before, "the creature whose turn it is stays where it is");
    assert.equal(current(s2), p);
  });
}

test("an AI-played fight with after companions on both sides: everyone plays, the order holds, and no foe's after reaches a player", () => {
  for (const grid of [null, "square"]) for (const seed of [3, 5, 11]) {
    const s = table(grid, seed), f = s.entities.fighter;
    const mage = spawn(s, "goblin-warrior", spot(s, f.pos, 3, 3), "Gob Mage");
    const theirs = [0, 1].map((n) => spawn(s, "wolf", spot(s, s.entities[mage].pos, n, 2), `Pet ${n}`));
    for (const t of theirs) bond(s, t, mage, { turn: "after", kind: "summon" });
    const mine = spawn(s, "wolf", spot(s, f.pos, 0, 2), "Hound");
    bond(s, mine, "fighter", { turn: "after" });
    ok(apply(s, { type: "startEncounter", center: f.pos, radius: 5 }, DM));
    const sent = [];
    for (let i = 0; i < 120 && s.encounter; i++) {
      const id = current(s), e = s.entities[id];
      const step = e.side === "party" && e.kind === "pc" ? { type: "endTurn", actor: id } : aiStep(s, id) ?? { type: "endTurn", actor: id };
      let r = apply(s, step, DM);
      if (!r.ok) r = ok(apply(s, { type: "endTurn", actor: id }, DM));
      sent.push(json(viewEvents(r.events, s, U1)), json(view(s, U1)));
      if (!s.encounter) break;
      for (const [m, cs] of [[mage, theirs], ["fighter", [mine]]]) {
        const live = cs.filter((c) => ids(s).includes(c));
        if (ids(s).includes(m) && live.length) behindMaster(s, m, live);
      }
    }
    const all = sent.join("\n");
    assert.ok(!all.includes(`"after":"${mage}"`), "a foe's after reached a player");
  }
});

// ---------- review of #317 ----------

// Turns of a round from the events: a turn set aside part-way and taken up again is not a second one.
const realTurns = (evs, round) => evs.filter((e, i) => e.type === "turn" && e.id && e.round === round && !(evs[i + 1]?.type === "awayTurn" && evs[i + 1].how === "resumed")).map((e) => e.id);

for (const grid of [null, "square"]) for (const how of ["end", "endKeep"]) {
  test(`a master set aside to the end of the round (${how}), tied with another, and a creature joins: its companion still has one turn${grid ? " (squares)" : " (hexes)"} (B1)`, () => {
    const s = table(grid), f = s.entities.fighter;
    const g1 = spawn(s, "goblin-warrior", spot(s, f.pos, 5), "Master"), g2 = spawn(s, "goblin-warrior", spot(s, f.pos, 6), "Twin");
    const pet = spawn(s, "wolf", spot(s, f.pos, 7), "Pet");
    bond(s, pet, g1, { turn: "after" });
    const all = [...ok(apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM)).events];
    // Master and Twin on one count and Dexterity, Master first; the rogue before them, the rest after.
    const O = s.encounter.order, set = (id, o) => Object.assign(O.find((x) => x.id === id), o);
    set(g1, { init: 12, dex: 14 }); set(g2, { init: 12, dex: 14 }); set(pet, { init: 12 });
    for (const id of ["rogue", "wizard", "fighter", "cleric"]) set(id, { init: id === "rogue" ? 20 : 3, dex: 10 });
    const ai = O.findIndex((x) => x.id === g1), bi = O.findIndex((x) => x.id === g2);
    if (bi < ai) [O[ai], O[bi]] = [O[bi], O[ai]];
    const cur = current(s); initiativeSort(O); s.encounter.turn = ids(s).indexOf(cur);
    assert.deepEqual(ids(s).slice(0, 4), ["rogue", g1, pet, g2]);
    while (current(s) !== g1) all.push(...endTurn(s).events);
    all.push(...ok(apply(s, { type: "stepAway", actor: g1, how }, DM)).events);
    while (current(s) !== g2) all.push(...endTurn(s).events);              // its companion has had its turn
    all.push(...ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: spot(s, f.pos, 9), name: "Late" }, DM)).events);
    const round = s.encounter.round;
    while (s.encounter.round === round) all.push(...endTurn(s).events);
    const t = realTurns(all, round);
    assert.equal(new Set(t).size, t.length, `two turns in round ${round}: ${t.join(" ")}`);
    assert.equal(t.filter((x) => x === pet).length, 1);
  });
}

test("random fights with joins, bonds, frees, kills and stepping away: nobody has two turns in a round", () => {
  const lcg = (seed) => { let x = seed; return (n) => { x = (x * 1103515245 + 12345) % 2147483648; return Math.floor(x / 65536) % n; }; };
  // Seeds 1 to 30 on each grid, and those the reviews of #317 found (as the seed of this harness's own fights).
  for (const grid of [null, "square"]) for (const seed of [...Array.from({ length: 30 }, (_, i) => i + 1), 36, 48, 129, 187, 326, 340, 488]) {
    const rnd = lcg(seed * 7 + (grid ? 1 : 0)), s = table(grid, seed), f = s.entities.fighter, pool = [];
    const mk = (mon, name, c, n) => { const at = spot(s, c, n, 4); if (!at) return null; const id = spawn(s, mon, at, name); pool.push(id); s.entities[id].initBonus = rnd(20) - 8; return id; };
    const boss = mk("goblin-warrior", "Boss", f.pos, 5);
    for (let i = 0; i < 3; i++) { const p = mk("wolf", `P${i}`, f.pos, i); if (p && rnd(2)) bond(s, p, "fighter", { turn: "after" }); }
    for (let i = 0; i < 2; i++) { const p = mk("wolf", `F${i}`, s.entities.m5.pos, i); if (p && rnd(2)) bond(s, p, boss, { turn: rnd(2) ? "after" : "own" }); }
    const r0 = apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM);
    if (!r0.ok) continue;
    // A turn passed untaken from early on, so that stepping back in after another (heldBack) comes up often.
    if (rnd(2)) { const id = ["rogue", "wizard", "cleric"][rnd(3)]; if (current(s) !== id) ok(apply(s, { type: "stepAway", actor: id, how: "hold" }, DM)); }
    const turns = {};
    const note = (evs) => evs.forEach((e, i) => { if (e.type === "turn" && e.id && !(evs[i + 1]?.type === "awayTurn" && evs[i + 1].how === "resumed")) (turns[e.round] ??= []).push(e.id); });
    note(r0.events);
    for (let step = 0; step < 120 && s.encounter; step++) {
      const op = rnd(24), live = pool.filter((id) => s.entities[id] && !s.entities[id].dead), pick = () => live[rnd(live.length)];
      let a = null;
      if (op === 0) mk("goblin-warrior", `G${step}`, f.pos, 6 + rnd(6));
      else if (op <= 2) { const id = pick(), m = rnd(2) ? "fighter" : boss; if (id && id !== m && s.entities[m] && !s.entities[m].bond) a = { type: "bond", actor: id, to: m, turn: rnd(3) ? "after" : "own" }; }
      else if (op === 3) { const id = pick(); if (id && s.entities[id].bond) a = { type: "bond", actor: id, to: null }; }
      else if (op === 4) { const id = pick(); if (id && !ids(s).includes(id)) a = { type: "move", actor: id, to: spot(s, f.pos, rnd(10), 4) }; }
      else if (op === 5) { const id = pick(); if (id) a = { type: "harm", actor: id, amount: 9999 }; }
      else if (op >= 18) {
        const who = [...pool, "fighter", "rogue", "wizard", "cleric"].filter((id) => s.entities[id] && !s.entities[id].dead && ids(s).includes(id)), id = who[rnd(who.length)];
        if (id) a = s.entities[id].away ? { type: "stepBack", actor: id } : { type: "stepAway", actor: id, how: ["end", "endKeep", "hold", "dodge"][rnd(4)] };
      }
      const r = a ? apply(s, a, DM) : apply(s, { type: "endTurn", actor: current(s) }, DM);
      if (r.ok) note(r.events);
      else if (!a) break;
      if (!s.encounter) break;
      const o = ids(s);
      assert.equal(new Set(o).size, o.length, "no creature twice in the order");
      for (const e of s.encounter.order) if (e.after && o.includes(e.after)) assert.equal(e.init, s.encounter.order.find((x) => x.id === e.after).init);
    }
    for (const [round, who] of Object.entries(turns)) assert.equal(new Set(who).size, who.length, `${grid ?? "hex"} seed ${seed} round ${round}: ${who.join(" ")}`);
  }
});

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";
  const twin = (setup, steps) => {
    const run = (bonded) => {
      const s = table(grid), log = [];
      const ctx = setup(s, bonded);
      log.push(ok(apply(s, { type: "startEncounter", center: s.entities.fighter.pos, radius: 6 }, DM)));
      for (let i = 0; i < steps && s.encounter; i++) { if (ctx.at?.[i]) log.push(ctx.at[i](s)); log.push(endTurn(s)); }
      return { s, ctx, seen: [U1, U2].map((u) => log.map((r) => json(viewEvents(r.events, s, u)))), view: [U1, U2].map((u) => json(view(s, u))), tl: json(viewEvents(s.timeline, s, U1)), seq: s.seq };
    };
    const A = run(true), B = run(false);
    assert.deepEqual(A.seen, B.seen, "the events players get");
    assert.deepEqual(A.view, B.view, "their view");
    assert.equal(A.tl, B.tl, "the record");
    assert.equal(A.seq, B.seq);
    return A;
  };

  test(`a seen companion of a master hiding in the fight keeps its own count: players get what an unbonded creature gives${on} (M1)`, () => {
    const A = twin((s, bonded) => {
      const mage = spawn(s, "goblin-warrior", spot(s, s.entities.fighter.pos, 6, 4), "Mage");
      s.entities[mage].hiding = true; s.entities[mage].initBonus = 30;
      const pet = spawn(s, "wolf", spot(s, s.entities.fighter.pos, 1, 2), "Pet"); s.entities[pet].initBonus = -10;
      if (bonded) bond(s, pet, mage, { turn: "after", kind: "summon" });
      return { mage, pet };
    }, 14);
    const { mage, pet } = A.ctx;
    assert.ok(ids(A.s).includes(mage), "the mage is in the fight, hiding");
    assert.ok(!A.s.encounter.order.find((o) => o.id === pet).after, "not behind a master the party does not know of");
    // Once the party knows of the mage, the pet goes behind it (now, or at the next round).
    ok(apply(A.s, { type: "reveal", actor: mage, hidden: false }, DM));
    for (let i = 0; i < ids(A.s).length + 1 && A.s.encounter; i++) endTurn(A.s);
    behindMaster(A.s, mage, [pet]);
  });

  test(`a seen companion whose hiding master joins the fight later keeps its own count${on} (M1)`, () => {
    twin((s, bonded) => {
      const mage = spawn(s, "goblin-warrior", spot(s, s.entities.m5.pos, 0, 1), "Mage");
      s.entities[mage].hiding = true; s.entities[mage].initBonus = 30;
      const pet = spawn(s, "wolf", spot(s, s.entities.fighter.pos, 1, 2), "Pet"); s.entities[pet].initBonus = -10;
      if (bonded) bond(s, pet, mage, { turn: "after", kind: "summon" });
      return { mage, pet, at: { 1: (x) => ok(apply(x, { type: "move", actor: mage, to: spot(x, x.entities.fighter.pos, 8, 4) }, DM)) } };
    }, 14);
  });

  test(`a hiding companion of a seen master keeps its own count: its unseen turn does not sit behind the master${on} (M1)`, () => {
    const A = twin((s, bonded) => {
      const boss = spawn(s, "goblin-warrior", spot(s, s.entities.fighter.pos, 6, 4), "Boss"); s.entities[boss].initBonus = 12;
      const pet = spawn(s, "wolf", spot(s, s.entities.fighter.pos, 1, 2), "Pet"); s.entities[pet].initBonus = -10;
      if (bonded) bond(s, pet, boss, { turn: "after", kind: "summon" });
      s.entities[pet].hiding = true;
      return { boss, pet };
    }, 14);
    assert.ok(!A.s.encounter.order.find((o) => o.id === A.ctx.pet).after);
    assert.ok(A.s.timeline.some((e) => e.type === "manual" && e.partial && /does not know of it or of its master/.test(e.text)), "the DM is told why");
  });
}

test("companions bonded in the fight stand behind the master in the order they joined; a freed one keeps its place and count (L1, L2)", () => {
  for (const grid of [null, "square"]) {
    const s = table(grid), f = s.entities.fighter;
    const a = spawn(s, "wolf", spot(s, f.pos, 0, 2), "A"), b = spawn(s, "wolf", spot(s, f.pos, 1, 2), "B");
    s.entities[b].initBonus = 40; s.entities[a].initBonus = -10;
    spawn(s, "goblin-warrior", spot(s, f.pos, 5), "G");
    bond(s, a, "fighter", { turn: "after" }); bond(s, b, "fighter");
    ok(apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM));
    bond(s, b, null); bond(s, b, "fighter", { turn: "after" });
    while (s.encounter.round < 2) endTurn(s);
    behindMaster(s, "fighter", [a, b]);
    const count = s.encounter.order.find((o) => o.id === a).init, at = ids(s).indexOf(a);
    bond(s, a, null);
    const o = s.encounter.order.find((x) => x.id === a);
    assert.ok(!o.after);
    assert.equal(o.init, count, "it keeps the count");
    assert.equal(ids(s).indexOf(a), at, "and its place");
  }
});

test("a creature back from stepping away is put behind the companions of the creature whose turn it is, not between them (L4)", () => {
  for (const grid of [null, "square"]) {
    const s = table(grid), f = s.entities.fighter;
    const p = spawn(s, "wolf", spot(s, f.pos, 0, 2), "Pup"), q = spawn(s, "wolf", spot(s, f.pos, 1, 2), "Pip Two");
    for (const id of [p, q]) bond(s, id, "fighter", { turn: "after" });
    spawn(s, "goblin-warrior", spot(s, f.pos, 5), "G");
    s.entities.rogue.initBonus = 60;
    ok(apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM));
    assert.equal(current(s), "rogue");
    ok(apply(s, { type: "stepAway", actor: "rogue", how: "hold" }, DM));   // from its next turn, which passes untaken
    endTurn(s);
    for (let i = 0; i < 30 && !(current(s) === "fighter" && s.encounter.held?.rogue === s.encounter.round); i++) endTurn(s);
    assert.equal(current(s), "fighter");
    ok(apply(s, { type: "stepBack", actor: "rogue" }, DM));
    const o = ids(s), i = o.indexOf("fighter");
    assert.deepEqual(o.slice(i, i + 4), ["fighter", p, q, "rogue"], `${o.join(" ")} ${json(s.encounter.moved)} ${json(s.encounter.held)}`);
  }
});

// ---------- review of #317, round 2 ----------

// A creature taken back in after stepping away is seated once; what C2 later changes round its anchor does not carry it along.
for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";
  const turnLog = (s) => { const turns = []; return { turns, et: () => { const r = endTurn(s); r.events.forEach((e) => { if (e.type === "turn" && e.id) turns.push(`${e.round}:${e.id}`); }); } }; };
  const once = (turns, round) => { const t = turns.filter((x) => x.startsWith(`${round}:`)); assert.equal(new Set(t).size, t.length, `two turns in round ${round}: ${t.join(" ")}`); return t; };

  test(`bonding the creature a stepped-back one sits behind gives nobody a second turn${on} (round 2, B1)`, () => {
    const s = table(grid), f = s.entities.fighter;
    const M = spawn(s, "goblin-warrior", spot(s, f.pos, 5), "M"), W = spawn(s, "wolf", spot(s, f.pos, 0), "W"), K = spawn(s, "goblin-warrior", spot(s, f.pos, 8), "K");
    ok(apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM));
    const counts = { rogue: 30, [M]: 25, [K]: 22, wizard: 15, [W]: 10, fighter: 5, cleric: 3 };
    for (const o of s.encounter.order) o.init = counts[o.id];
    s.encounter.order.sort((a, b) => b.init - a.init); s.encounter.turn = 0;
    const { turns, et } = turnLog(s);
    ok(apply(s, { type: "stepAway", actor: "rogue", how: "hold" }, DM));
    while (s.encounter.round < 2) et();
    while (current(s) !== K) et();
    ok(apply(s, { type: "bond", actor: W, to: M, turn: "after" }, DM));     // W has its turn still to come, behind K's place: it waits
    while (current(s) !== W) et();
    ok(apply(s, { type: "stepBack", actor: "rogue" }, DM));                  // seated behind W, the creature whose turn it is
    while (s.encounter.round === 2) et();
    const t = once(turns, 2);
    assert.deepEqual(t.map((x) => x.slice(2)), [M, K, "wizard", W, "rogue", "fighter", "cleric"]);
    while (s.encounter.round === 3) et();
    once(turns, 3);
    behindMaster(s, M, [W]);
  });

  test(`freeing a companion with a stepped-back creature seated behind its group gives it no second turn${on} (round 2, B2)`, () => {
    const s = table(grid), f = s.entities.fighter;
    const w = spawn(s, "wolf", spot(s, f.pos, 0), "Wolf"), g = spawn(s, "goblin-warrior", spot(s, f.pos, 1), "Gob");
    bond(s, w, "fighter", { turn: "after" });
    ok(apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM));
    const O = s.encounter.order;
    O.find((x) => x.id === g).init = 25; O.find((x) => x.id === "fighter").init = 20; O.find((x) => x.id === w).init = 20;
    initiativeSort(O); s.encounter.turn = 0;
    assert.equal(current(s), g);
    const { turns, et } = turnLog(s);
    ok(apply(s, { type: "stepAway", actor: g, how: "hold" }, DM));
    while (s.encounter.round < 2 || current(s) !== "fighter") et();
    ok(apply(s, { type: "stepBack", actor: g }, DM));                        // behind the fighter and its wolf
    assert.deepEqual(ids(s).slice(0, 3), ["fighter", w, g]);
    et(); et();                                                              // the wolf's turn, then the goblin's
    bond(s, w, null);                                                        // the wolf is freed: nothing moves
    assert.deepEqual(ids(s).slice(0, 3), ["fighter", w, g]);
    while (s.encounter.round === 2) et();
    assert.deepEqual(once(turns, 2).filter((x) => x === `2:${w}`), [`2:${w}`]);
  });
}
