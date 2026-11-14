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
function table(grid) {
  const s = newGame(5, grid ? { grid } : {});
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
