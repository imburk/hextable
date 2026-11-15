// Every creature that is up and stays up acts exactly once a round (issue #320, from the round-3 review of
// #317): a creature taken back in while one moved to the end of the round is taking its turn there, the old
// form of the stepped-back record from a save, the place given back the round after, a stepped-back creature
// that dies, is bonded, freed or set aside again, undo and redo with `place`, and a seeded stress that checks
// nobody has two turns and nobody loses one.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, AWAY, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { gridOf } from "../src/grid.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { migrate } from "../src/migrate.js";
import { readFileSync } from "node:fs";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (s) => JSON.stringify(s);
const ids = (s) => s.encounter.order.map((o) => o.id);
const lcg = (seed) => { let x = seed; return (n) => { x = (x * 1103515245 + 12345) % 2147483648; return Math.floor(x / 65536) % n; }; };

// A table with the four heroes; the DM starts the fights.
function table(grid, seed = 5) {
  const s = newGame(seed, grid ? { grid } : {});
  s.settings.autoEngage = false;
  return s;
}
// Add a creature on the first free cell near a place from the n-th cell on (a refused spawn changes nothing).
function spawn(s, monster, near, n = 0, name) {
  const cells = [...gridOf(s.map).range(near, 4)];
  for (let i = 0; i < cells.length; i++) {
    const r = apply(s, { type: "spawn", monster, at: cells[(n + i) % cells.length], ...(name ? { name } : {}) }, DM);
    if (r.ok) return r.events.find((e) => e.type === "spawned").id;
  }
  return null;
}
// Turns taken, from the events: a turn set aside part-way and taken up again is not a second one.
function logTurns(turns, evs) {
  evs.forEach((e, i) => { if (e.type === "turn" && e.id && !(evs[i + 1]?.type === "awayTurn" && evs[i + 1].how === "resumed")) (turns[e.round] ??= []).push(e.id); });
}
// The order `rogue A B wizard fighter cleric` on fixed counts, the rogue's turn first.
function six(grid) {
  const s = table(grid), f = s.entities.fighter;
  const A = spawn(s, "goblin-warrior", f.pos, 5, "A"), B = spawn(s, "goblin-warrior", f.pos, 9, "B");
  ok(apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM));
  const counts = { rogue: 30, [A]: 25, [B]: 22, wizard: 15, fighter: 5, cleric: 3 };
  s.encounter.order = s.encounter.order.filter((o) => o.id in counts);
  for (const o of s.encounter.order) o.init = counts[o.id];
  s.encounter.order.sort((a, b) => b.init - a.init); s.encounter.turn = 0;
  assert.deepEqual(ids(s), ["rogue", A, B, "wizard", "fighter", "cleric"]);
  const turns = {};
  const act = (a) => { const r = ok(apply(s, a, DM)); logTurns(turns, r.events); return r; };
  const et = () => act({ type: "endTurn", actor: current(s) });
  return { s, A, B, turns, act, et };
}
// B held from its turn; the rogue moved to the end of round 1 (`how`) and back, so it takes that turn there.
function heldWhileAtEnd(grid, how = "end") {
  const t = six(grid), { s, B, act, et } = t;
  act({ type: "stepAway", actor: B, how: "hold" });
  act({ type: "stepAway", actor: "rogue", how });
  act({ type: "stepBack", actor: "rogue" });
  while (current(s) !== "rogue") et();
  assert.equal(s.encounter.round, 1);
  return t;
}

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";

  for (const how of ["end", "endKeep"]) test(`a creature taken back in while one moved to the end (${how}) takes its turn: it is seated behind it there${on} (M1)`, () => {
    const { s, A, B, turns, act, et } = heldWhileAtEnd(grid, how);
    act({ type: "stepBack", actor: B });
    assert.deepEqual(ids(s), [A, "wizard", "fighter", "cleric", "rogue", B]);
    assert.equal(current(s), "rogue");
    while (s.encounter.round === 1) et();
    assert.deepEqual(turns[1], [A, "wizard", "fighter", "cleric", B], "the rogue's turn, begun at the start and taken up at the end, is one");
    while (s.encounter.round === 2) et();
    // Round 2: B has its own place back; the rogue too, unless it keeps the place at the end.
    assert.deepEqual(turns[2], how === "end" ? ["rogue", A, B, "wizard", "fighter", "cleric"] : [A, B, "wizard", "fighter", "cleric", "rogue"]);
  });

  test(`two taken back in one after the other behind creatures moved to the end: each acts once${on}`, () => {
    const { s, A, B, turns, act, et } = six(grid);
    act({ type: "stepAway", actor: B, how: "hold" });
    act({ type: "stepAway", actor: "wizard", how: "hold" });
    act({ type: "stepAway", actor: "rogue", how: "end" });
    act({ type: "stepBack", actor: "rogue" });
    act({ type: "stepAway", actor: A, how: "end" });                         // on its own turn: the rest of it waits at the end
    assert.deepEqual(ids(s).slice(-2), ["rogue", A]);
    act({ type: "stepBack", actor: A });
    while (current(s) !== "rogue") et();
    act({ type: "stepBack", actor: B });                                     // behind the rogue, before A
    assert.deepEqual(ids(s).slice(-3), ["rogue", B, A]);
    et();
    act({ type: "stepBack", actor: "wizard" });                              // B's turn: behind B, still before A
    assert.deepEqual(ids(s).slice(-4), ["rogue", B, "wizard", A]);
    while (s.encounter.round === 1) et();
    assert.deepEqual(turns[1], [A, "fighter", "cleric", B, "wizard"], "the rogue and A only take their turns up again");
    assert.ok(!s.encounter.moved, "no record left");
  });

  test(`a placed creature's own place is given back at the next round's start${on}`, () => {
    const { s, A, B, turns, act, et } = six(grid);
    act({ type: "stepAway", actor: B, how: "hold" });
    while (current(s) !== "fighter") et();
    act({ type: "stepBack", actor: B });
    assert.equal(s.encounter.moved[B].placed, true);
    assert.deepEqual(ids(s), ["rogue", A, "wizard", "fighter", B, "cleric"]);
    while (s.encounter.round === 1) et();
    assert.deepEqual(ids(s), ["rogue", A, B, "wizard", "fighter", "cleric"]);
    assert.ok(!s.encounter.moved);
    while (s.encounter.round === 2) et();
    assert.deepEqual(turns[2], ["rogue", A, B, "wizard", "fighter", "cleric"]);
  });

  // A creature taken back in, then something happens to it before its turn comes.
  const cases = {
    dies: (s, A, B) => ok(apply(s, { type: "harm", actor: B, amount: 9999 }, DM)),
    "is bonded": (s, A, B) => ok(apply(s, { type: "bond", actor: B, to: A, turn: "after" }, DM)),
    "is bonded and freed": (s, A, B) => { ok(apply(s, { type: "bond", actor: B, to: A, turn: "after" }, DM)); ok(apply(s, { type: "bond", actor: B, to: null }, DM)); },
    ...Object.fromEntries(AWAY.map((how) => [`is set aside again (${how})`, (s, A, B) => ok(apply(s, { type: "stepAway", actor: B, how }, DM))])),
  };
  for (const [what, doIt] of Object.entries(cases)) for (const atEnd of [false, true]) {
    test(`a creature taken back in ${atEnd ? "behind one moved to the end " : ""}that ${what} before its turn: one turn at most, its place back next round${on}`, () => {
      const t = atEnd ? heldWhileAtEnd(grid) : six(grid), { s, A, B, turns, act, et } = t;
      if (!atEnd) { act({ type: "stepAway", actor: B, how: "hold" }); while (current(s) !== "wizard") et(); }
      act({ type: "stepBack", actor: B });
      doIt(s, A, B);
      while (s.encounter.round === 1) et();
      const mine = turns[1].filter((x) => x === B).length, e = s.entities[B];
      const held = what.includes("(hold)");
      assert.equal(mine, e.dead || held ? 0 : 1, `${turns[1].join(" ")}`);
      for (const id of [A, "wizard", "fighter", "cleric"]) assert.equal(turns[1].filter((x) => x === id).length, 1, id);
      while (s.encounter.round === 2) et();
      const t2 = turns[2];
      assert.equal(new Set(t2).size, t2.length, t2.join(" "));
      if (e.dead) assert.ok(!t2.includes(B));
      else if (what === "is bonded") assert.equal(ids(s)[ids(s).indexOf(A) + 1], B, "behind its master");
      else if (!what.includes("end")) assert.deepEqual(ids(s).slice(0, 3), ["rogue", A, B], "its place back");
      assert.ok(Object.values(s.encounter.moved ?? {}).every((m) => !m.after && !m.placed), "no seat left from round 1");
    });
  }

  test(`undo and redo with \`place\` give back exactly the recorded states, the record too${on} (#320 item 2)`, () => {
    for (const seed of [6, 17]) {
      const s = table(grid, seed), f = s.entities.fighter, rnd = lcg(seed * 3 + (grid ? 1 : 0));
      ok(apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM));
      const cells = [...gridOf(s.map).range(f.pos, 4)], h = createHistory({ limit: 200 }), states = [json(s)];
      for (let i = 0; i < 40 && s.encounter; i++) {
        const live = Object.keys(s.entities).filter((id) => !s.entities[id].dead), op = rnd(8), to = cells[rnd(cells.length)];
        const a = op === 0 ? { type: "spawn", monster: "wolf", at: to } : op <= 2 ? { type: "place", actor: live[live.length - 1 - rnd(2)], to } : { type: "endTurn", actor: current(s) };
        const before = mark(s), r = apply(s, a, DM);
        if (!r.ok) continue;
        h.record(before, s, describeStep(a, r.events, before, s));
        states.push(json(s));
      }
      const n = states.length - 1;
      assert.ok(n >= 30);
      for (let i = 1; i <= 30; i++) { h.undo(s); assert.equal(json(s), states[n - i], `undo ${i}`); }
      for (let i = 29; i >= 0; i--) { h.redo(s); assert.equal(json(s), states[n - i], `redo to ${n - i}`); }
    }
  });
}

// Saves written by the code from before C2 (dbceeb5), where a creature taken back in keeps `moved[x].after` all
// round and is seated straight behind its anchor on every turn. Loaded at each turn of round 1 after it came back,
// and played on: each save gives the turns still owed, no more and no fewer (review of #321, B1).
const OLD = JSON.parse(readFileSync(new URL("./fixtures/old-stepback-saves.json", import.meta.url), "utf8")).saves;
function oldSave(key, i) {
  const { grid, base, at } = OLD[key], { d, ents } = at[i];
  const s = { ...structuredClone(base), ...structuredClone(d), entities: { ...structuredClone(base.entities), ...structuredClone(ents) } };
  s.map = newGame(5, grid ? { grid } : {}).map; s.timeline = [];
  return migrate(s);
}
function playOn(s) {
  const turns = {};
  while (s.encounter.round < 3) logTurns(turns, ok(apply(s, { type: "endTurn", actor: current(s) }, DM)).events);
  return turns;
}
test("old saves with a creature taken back in after another, loaded at each turn of the round: the turns still owed, once each (B1)", () => {
  const { A, B } = OLD["hex-own"];
  const owed = { wizard: [B, "fighter", "cleric"], [B]: ["fighter", "cleric"], fighter: ["cleric"], cleric: [] };
  OLD["hex-own"].at.forEach(({ cur }, i) => {
    const s = oldSave("hex-own", i);
    assert.equal(current(s), cur);
    assert.deepEqual(s.encounter.moved[B], { after: "wizard", keep: false, round: 1 }, "the old form");
    assert.deepEqual(ids(s), ["rogue", A, "wizard", B, "fighter", "cleric"]);
    const turns = playOn(s);
    assert.deepEqual(turns[1] ?? [], owed[cur], `saved on ${cur}'s turn`);
    assert.deepEqual(turns[2], ["rogue", A, B, "wizard", "fighter", "cleric"], "its own place back next round");
    assert.ok(!s.encounter.moved);
  });
  // Seated once at the first settle, then kept where it stands.
  const s = oldSave("hex-own", 0);
  ok(apply(s, { type: "endTurn", actor: "wizard" }, DM));
  assert.deepEqual(s.encounter.moved[B], { keep: false, round: 1, placed: true });
});

test("an old save taken while a creature moved to the end takes its turn, with one taken back in behind it: that one acts too (M1, B1)", () => {
  const { A, B } = OLD["hex-end"], s = oldSave("hex-end", 0);
  assert.equal(current(s), "rogue");
  assert.deepEqual(ids(s), [A, "wizard", "fighter", "cleric", B, "rogue"], "as the old code left it: behind the turn");
  const turns = playOn(s);
  assert.deepEqual(turns[1], [B]);
  assert.deepEqual(turns[2], ["rogue", A, B, "wizard", "fighter", "cleric"]);
});

test("an old record whose anchor is gone: behind the turn going on, or where it stands if the turn is its own", () => {
  const { B } = OLD["hex-own"];
  for (const [i, owed] of [[0, [B, "fighter", "cleric"]], [1, ["fighter", "cleric"]]]) {
    const s = oldSave("hex-own", i);
    s.encounter.moved[B].after = "nobody";                                   // the anchor's entry gone from the order
    assert.deepEqual(playOn(s)[1] ?? [], owed);
  }
});

// Seeded random fights: joins, bonds, frees, kills, every way of stepping away, stepping back, and `place`. In
// every round nobody has two turns, and everybody who was in the order and up when it began, stayed up and in
// the order, and was not held at the end of it, has one. A refused action changes nothing.
test("random fights with joins, bonds, frees, kills, stepping away (every way), stepping back and place: one turn each a round, none lost", () => {
  const up = (s, id) => { const e = s.entities[id]; return !!e && !e.dead && e.hp > 0 && ids(s).includes(id); };
  let rounds = 0;
  for (const grid of [null, "square"]) for (let seed = 1; seed <= 14; seed++) {
    const rnd = lcg(seed * 11 + (grid ? 1 : 0)), s = table(grid, seed), f = s.entities.fighter, pool = [];
    const mk = (mon, n) => { const id = spawn(s, mon, f.pos, n); if (id) { pool.push(id); s.entities[id].initBonus = rnd(20) - 8; } return id; };
    const boss = mk("goblin-warrior", 5);
    for (let i = 0; i < 3; i++) { const p = mk("wolf", i * 3); if (p && rnd(2)) ok(apply(s, { type: "bond", actor: p, to: rnd(2) ? "fighter" : boss, turn: "after" }, DM)); }
    const r0 = apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM);
    if (!r0.ok) continue;
    const cells = [...gridOf(s.map).range(f.pos, 4)];
    const turns = {}, held = {};
    let round = s.encounter.round, owed = new Set(ids(s).filter((id) => up(s, id))), off = new Set();
    const note = (evs) => {
      logTurns(turns, evs);
      for (const e of evs) {
        if (e.type === "awayTurn" && e.how === "hold") (held[e.round] ??= new Set()).add(e.id);
        if (e.type === "turnMoved" && e.to === "next") held[e.round]?.delete(e.id);
      }
    };
    const close = () => {
      const t = turns[round] ?? [];
      assert.equal(new Set(t).size, t.length, `${grid ?? "hex"} seed ${seed} round ${round}, two turns: ${t.join(" ")}`);
      for (const id of owed) if (!off.has(id) && !held[round]?.has(id)) assert.ok(t.includes(id), `${grid ?? "hex"} seed ${seed} round ${round}: ${id} lost its turn (${t.join(" ")})`);
      rounds++;
    };
    note(r0.events);
    for (let step = 0; step < 90 && s.encounter; step++) {
      const op = rnd(24), live = pool.filter((id) => s.entities[id] && !s.entities[id].dead), pick = () => live[rnd(live.length)];
      const fighting = [...pool, "fighter", "rogue", "wizard", "cleric"].filter((id) => s.entities[id] && !s.entities[id].dead && ids(s).includes(id));
      let a = null;
      if (op === 0) mk("goblin-warrior", rnd(40));
      else if (op <= 2) { const id = pick(), m = rnd(2) ? "fighter" : boss; if (id && id !== m && s.entities[m] && !s.entities[m].bond) a = { type: "bond", actor: id, to: m, turn: rnd(3) ? "after" : "own" }; }
      else if (op === 3) { const id = pick(); if (id && s.entities[id].bond) a = { type: "bond", actor: id, to: null }; }
      else if (op === 4) { const id = pick(); if (id) a = { type: "harm", actor: id, amount: 9999 }; }
      else if (op <= 6) { const id = pick(); if (id) a = { type: "place", actor: id, to: cells[rnd(cells.length)] }; }
      else if (op >= 16) {
        const id = fighting[rnd(fighting.length)];
        if (id) a = s.entities[id].away ? { type: "stepBack", actor: id } : { type: "stepAway", actor: id, how: AWAY[rnd(AWAY.length)] };
      }
      const before = json(s), r = a ? apply(s, a, DM) : apply(s, { type: "endTurn", actor: current(s) }, DM);
      if (!r.ok) { assert.equal(json(s), before, `refused ${a?.type ?? "endTurn"} changed nothing`); if (!a) break; continue; }
      note(r.events);
      if (!s.encounter) break;
      // A round over is checked; the new one owes a turn to everyone up and in the order at its start.
      if (s.encounter.round !== round) {
        if (s.encounter.round === round + 1) close();
        round = s.encounter.round;
        owed = new Set(ids(s).filter((id) => up(s, id))); off = new Set();
      }
      for (const id of owed) if (!up(s, id)) off.add(id);                     // down, dead or gone in this round: owed nothing
      const o = ids(s);
      assert.equal(new Set(o).size, o.length, "no creature twice in the order");
    }
  }
  assert.ok(rounds > 100, `rounds checked: ${rounds}`);
});
