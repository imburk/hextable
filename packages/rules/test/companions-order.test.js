// Companions, amendment A1 (docs/specs/companions.md): the master's player chooses, per round, whether a companion on
// its master's count (an unridden Find Steed) acts straight before or straight after its master. The choice waits in
// `bond.orderNext` and is taken up at a round's start, never in the middle of one. With refusals, turns kept across
// fights with ties and joins, a twin run on a hidden foe's choice, old saves, and undo, redo, replay, save and load.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { gridOf } from "../src/grid.js";
import { initiativeSort, insertSlot, sideOf } from "../src/engine/world.js";
import { migrate } from "../src/migrate.js";

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
function spot(s, near, n = 0, r = 3) {
  const G = gridOf(s.map), out = [];
  for (const h of G.range(near, r)) if (apply(structuredClone(s), { type: "spawn", monster: "wolf", at: h }, DM).ok) out.push(h);
  return out[n];
}
const spawn = (s, monster, at, name) => ok(apply(s, { type: "spawn", monster, at, ...(name ? { name } : {}) }, DM)).events.find((e) => e.type === "spawned").id;
const bond = (s, actor, to, more = {}) => ok(apply(s, { type: "bond", actor, to, ...more }, DM));
const choose = (s, actor, id, order, ctx = DM) => ok(apply(s, { type: "companionOrder", actor, id, order }, ctx));
function table(grid, seed = 5) {
  const s = newGame(seed, grid ? { grid } : {});
  s.settings.autoEngage = false;
  ok(apply(s, { type: "claim", entity: "fighter", user: "u1", userName: "Ann" }, U1));
  ok(apply(s, { type: "claim", entity: "rogue", user: "u2", userName: "Bo" }, U2));
  return s;
}
const ids = (s) => s.encounter.order.map((o) => o.id);
const entry = (s, id) => s.encounter.order.find((o) => o.id === id);
const endTurn = (s) => ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
const toRound = (s, n, all = []) => { for (let i = 0; i < 200 && s.encounter && s.encounter.round < n; i++) all.push(...endTurn(s).events); return all; };
// Each master's group stands together: its `before` companions straight before it, its `after` ones straight behind.
function grouped(s, master, before, after) {
  const o = ids(s), i = o.indexOf(master);
  assert.ok(i >= 0, "the master is in the order");
  assert.deepEqual(o.slice(i - before.length, i), before, `before ${master}: ${o.join(" ")}`);
  assert.deepEqual(o.slice(i + 1, i + 1 + after.length), after, `after ${master}: ${o.join(" ")}`);
  for (const c of before) { assert.equal(entry(s, c).before, master); assert.equal(entry(s, c).after, undefined); assert.equal(entry(s, c).init, entry(s, master).init); }
  for (const c of after) { assert.equal(entry(s, c).after, master); assert.equal(entry(s, c).before, undefined); assert.equal(entry(s, c).init, entry(s, master).init); }
}
// A fighter with a steed (on its count, after it by default) and a goblin, the fight started.
function steedFight(grid, seed = 5) {
  const s = table(grid, seed), f = s.entities.fighter;
  const steed = spawn(s, "wolf", spot(s, f.pos, 0, 2), "Steed");
  bond(s, steed, "fighter", { turn: "after", kind: "steed" });
  spawn(s, "goblin-warrior", spot(s, f.pos, 5), "Gob");
  return { s, steed };
}

test("initiativeSort and insertSlot put a before entry straight before its master, its group whole", () => {
  const order = [
    { id: "a", init: 12, dex: 14 }, { id: "b1", init: 12, dex: 20, before: "a" }, { id: "x", init: 12, dex: 14 },
    { id: "b", init: 18, dex: 10 }, { id: "c1", init: 12, dex: 3, after: "a" }, { id: "b2", init: 12, dex: 9, before: "a" },
    { id: "orphan", init: 15, dex: 8, before: "gone" },
  ];
  assert.deepEqual(initiativeSort(order).map((o) => o.id), ["b", "orphan", "b1", "b2", "a", "c1", "x"]);
  // A creature outranking the master goes before the master's whole group, not between a before companion and it.
  insertSlot(order, { id: "y", init: 13, dex: 1 });
  assert.deepEqual(order.map((o) => o.id), ["b", "orphan", "y", "b1", "b2", "a", "c1", "x"]);
  insertSlot(order, { id: "b3", init: 0, dex: 0, before: "a" });
  insertSlot(order, { id: "c2", init: 0, dex: 0, after: "a" });
  assert.deepEqual(order.map((o) => o.id), ["b", "orphan", "y", "b1", "b2", "b3", "a", "c1", "c2", "x"]);
  assert.equal(sideOf({ bond: { to: "a", turn: "after" } }), "after", "a bond without the field is after");
  assert.equal(sideOf({ bond: { to: "a", turn: "after", order: "before" } }), "before");
});

test("refusals change nothing: a bad order, a creature that is not bonded, another's companion, one with its own count, a stranger's player", () => {
  const s = table(null), f = s.entities.fighter;
  const steed = spawn(s, "wolf", spot(s, f.pos, 0, 2), "Steed");
  const loose = spawn(s, "wolf", spot(s, f.pos, 1, 2), "Loose");
  const pet = spawn(s, "wolf", spot(s, f.pos, 2, 2), "Pet");
  const roller = spawn(s, "wolf", spot(s, f.pos, 3, 2), "Roller");
  bond(s, steed, "fighter", { turn: "after", kind: "steed" });
  bond(s, pet, "rogue", { turn: "after" });
  bond(s, roller, "fighter", { turn: "own" });
  for (const order of ["first", undefined, null, 1, "After"]) refused(s, { type: "companionOrder", actor: "fighter", id: steed, order }, U1, /after its master or straight before/);
  refused(s, { type: "companionOrder", actor: "fighter", id: loose, order: "before" }, U1, /is not .*'s companion/);
  refused(s, { type: "companionOrder", actor: "fighter", id: loose, order: "before" }, DM, /no one's companion/);   // the DM is told which
  refused(s, { type: "companionOrder", actor: "fighter", id: pet, order: "before" }, U1, /not Fighter's companion|not .*'s companion/);
  refused(s, { type: "companionOrder", actor: "fighter", id: roller, order: "before" }, U1, /rolls its own Initiative/);
  refused(s, { type: "companionOrder", actor: "fighter", id: steed, order: "before" }, U2);          // the rogue's player
  refused(s, { type: "companionOrder", actor: "rogue", id: steed, order: "before" }, U2, /companion/);  // its own master, another's steed
  refused(s, { type: "companionOrder", actor: "fighter", id: "nobody", order: "before" }, U1);
  refused(s, { type: "companionOrder", actor: "fighter", order: "before" }, U1, /Name the companion/);
  refused(s, { type: "companionOrder", actor: steed, id: steed, order: "before" }, U1, /not .*'s companion/);
  // The master's player and the DM may; outside a fight it is the order at once.
  const r = choose(s, "fighter", steed, "before", U1);
  assert.deepEqual(s.entities[steed].bond.order, "before");
  assert.equal(s.entities[steed].bond.orderNext, undefined);
  assert.deepEqual(r.events, [{ type: "companionOrder", id: steed, by: "fighter", order: "before" }]);
  choose(s, "fighter", steed, "after", DM);
  assert.equal(s.entities[steed].bond.order, "after");
});

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";

  test(`a choice in the middle of a round changes nothing until the next round's start${on}`, () => {
    const { s, steed } = steedFight(grid);
    ok(apply(s, { type: "startEncounter", center: s.entities.fighter.pos, radius: 6 }, DM));
    grouped(s, "fighter", [], [steed]);
    // Made at every point of round 1 (before the master's turn, in it, in the steed's, after both), nothing moves.
    const all = [];
    const n = ids(s).length;
    for (let k = 0; k < n; k++) {
      const before = json(s.encounter), r = choose(s, "fighter", steed, k % 2 ? "after" : "before", U1);
      assert.equal(json(s.encounter), before, "the order is as it was");
      assert.equal(s.entities[steed].bond.order ?? "after", "after", "this round's order stands");
      assert.deepEqual(viewEvents(r.events, s, U1), [{ type: "companionOrder", id: steed, by: "fighter", order: k % 2 ? "after" : "before", next: true }]);
      if (k < n - 1) all.push(...endTurn(s).events);
    }
    choose(s, "fighter", steed, "before", U1);
    assert.equal(s.entities[steed].bond.orderNext, "before");
    assert.equal(s.encounter.round, 1);
    all.push(...endTurn(s).events);
    assert.equal(s.encounter.round, 2);
    assert.equal(s.entities[steed].bond.order, "before");
    assert.equal(s.entities[steed].bond.orderNext, undefined);
    grouped(s, "fighter", [steed], []);
    // Back to after, chosen and taken back within one round: nothing waits.
    choose(s, "fighter", steed, "after", U1);
    assert.equal(s.entities[steed].bond.orderNext, "after");
    choose(s, "fighter", steed, "before", U1);
    assert.equal(s.entities[steed].bond.orderNext, undefined);
    toRound(s, 3, all);
    grouped(s, "fighter", [steed], []);
    choose(s, "fighter", steed, "after", U1);
    toRound(s, 4, all);
    grouped(s, "fighter", [], [steed]);
    // The turns: once each a round, the steed straight before the fighter in rounds 2 and 3, straight after in 1 and 4.
    const by = {};
    for (const e of all) if (e.type === "turn" && e.id) (by[e.round] ??= []).push(e.id);
    for (const [round, who] of Object.entries(by)) assert.equal(new Set(who).size, who.length, `round ${round}: ${who.join(" ")}`);
    for (const round of [2, 3]) assert.equal(by[round][by[round].indexOf("fighter") - 1], steed, `round ${round}: before`);
    assert.equal(by[1][by[1].indexOf("fighter") + 1], steed);
  });

  test(`a choice made before the fight sets where it starts; a companion joining in the middle of a round joins by this round's choice${on}`, () => {
    const { s, steed } = steedFight(grid);
    choose(s, "fighter", steed, "before", U1);
    const r = ok(apply(s, { type: "startEncounter", center: s.entities.fighter.pos, radius: 6 }, DM));
    grouped(s, "fighter", [steed], []);
    const st = viewEvents(r.events, s, U1).find((e) => e.type === "encounterStart").order.find((o) => o.id === steed);
    assert.equal(st.before, "fighter", "the party's own: before is sent");
    assert.equal(view(s, U2).encounter.order.find((o) => o.id === steed).before, "fighter");
    // A second steed-like companion, out of the fight, chosen before; it joins in the master's turn, mid-round, and is
    // put straight before the master's group, after the turn: so it waits for the next round, and nothing else moved.
    const late = spawn(s, "wolf", spot(s, s.entities.m5.pos, 0, 1), "Late");
    bond(s, late, "fighter", { turn: "after", kind: "pet" });
    choose(s, "fighter", late, "before", U1);
    assert.equal(s.entities[late].bond.orderNext, "before", "in a fight the choice waits even for one not in it");
    toRound(s, 2);
    assert.equal(s.entities[late].bond.order, "before", "taken up at the round's start, in the fight or not");
    for (let i = 0; i < 20 && current(s) !== "fighter"; i++) endTurn(s);
    const was = ids(s);
    const j = ok(apply(s, { type: "move", actor: late, to: spot(s, s.entities.fighter.pos, 4) }, DM));
    assert.deepEqual(ids(s).filter((x) => x !== late), was, "nothing else moved");
    grouped(s, "fighter", [steed, late], []);
    assert.deepEqual({ ...j.events.find((e) => e.type === "joined"), init: 0 }, { type: "joined", id: late, init: 0, before: "fighter" });
    const all = toRound(s, 4);
    const turns = (round) => all.filter((e) => e.type === "turn" && e.round === round).map((e) => e.id);
    assert.ok(!turns(2).includes(late), "joined behind the turn going on: its place this round is past");
    assert.deepEqual(turns(3).slice(turns(3).indexOf("fighter") - 2, turns(3).indexOf("fighter") + 1), [steed, late, "fighter"]);
  });

  test(`a foe's before is not sent; the party's own is${on}`, () => {
    const s = table(grid), f = s.entities.fighter;
    const theirs = spawn(s, "wolf", spot(s, s.entities.m1.pos, 0), "Dread Steed");
    bond(s, theirs, "m1", { turn: "after", kind: "steed" });
    choose(s, "m1", theirs, "before");
    const late = spawn(s, "wolf", spot(s, s.entities.m5.pos, 0, 1), "Late Steed");
    bond(s, late, "m1", { turn: "after", kind: "steed" });
    choose(s, "m1", late, "before");
    const mine = spawn(s, "wolf", spot(s, f.pos, 0, 1), "Steed");
    bond(s, mine, "fighter", { turn: "after", kind: "steed" });
    const r = ok(apply(s, { type: "startEncounter", center: { q: -1, r: 0 }, radius: 7 }, DM));
    grouped(s, "m1", [theirs], []);
    for (let i = 0; i < 30 && current(s) === late; i++) endTurn(s);
    const j = ok(apply(s, { type: "move", actor: late, to: spot(s, s.entities.m1.pos, 3) }, DM));
    grouped(s, "m1", [theirs, late], []);
    const c = ok(apply(s, { type: "companionOrder", actor: "m1", id: theirs, order: "after" }, DM));
    for (const u of [U1, U2]) {
      const v = view(s, u).encounter.order;
      for (const t of [theirs, late]) assert.deepEqual(v.find((o) => o.id === t), { id: t }, "a foe's companion: no before, no count");
      const st = viewEvents(r.events, s, u).find((e) => e.type === "encounterStart").order;
      assert.deepEqual(st.find((o) => o.id === theirs), { id: theirs });
      assert.deepEqual(viewEvents(j.events, s, u).find((e) => e.type === "joined"), { type: "joined", id: late });
      assert.deepEqual(viewEvents(c.events, s, u), [], "a foe's choice is never told");
      assert.ok(!json(viewEvents(s.timeline, s, u)).includes('"before":"m1"'));
      assert.ok(!json(view(s, u)).includes('"before":"m1"'));
      assert.ok(!json(view(s, u)).includes("orderNext"));
    }
    assert.equal(view(s, DM).encounter.order.find((o) => o.id === late).before, "m1", "the DM sees it");
  });
}

// Every creature that is up from a round's start to its end takes exactly one turn in it, those that join in the middle
// at most one; no creature is twice in the order; each master's group stands together on its count, on the side its
// bond says from each round's start.
test("random fights with before and after choices, ties and joins: no double or lost turn, hex and square", () => {
  const lcg = (seed) => { let x = seed; return (n) => { x = (x * 1103515245 + 12345) % 2147483648; return Math.floor(x / 65536) % n; }; };
  let fights = 0, flips = 0, joins = 0;
  for (const grid of [null, "square"]) for (let seed = 1; seed <= 24; seed++) {
    const rnd = lcg(seed * 13 + (grid ? 7 : 0)), s = table(grid, seed), f = s.entities.fighter, pool = [];
    const mk = (mon, name, c, n, r = 4) => { const at = spot(s, c, n, r); if (!at) return null; const id = spawn(s, mon, at, name); pool.push(id); s.entities[id].initBonus = rnd(6) - 2; return id; };
    const boss = mk("goblin-warrior", "Boss", f.pos, 5);
    const masters = ["fighter", boss];
    const comps = [];
    for (let i = 0; i < 4; i++) {
      const m = masters[i % 2], p = mk("wolf", `C${i}`, i % 2 ? s.entities[boss].pos : f.pos, i, 3);
      if (p) { bond(s, p, m, { turn: "after", kind: i < 2 ? "steed" : "pet" }); comps.push(p); if (rnd(2)) choose(s, m, p, "before"); }
    }
    // Out of the fight to come, bonded: they join later, by walking in.
    const away = [0, 1].map((n) => { const p = mk("wolf", `W${n}`, s.entities.m5.pos, n, 2); if (p) { bond(s, p, masters[n], { turn: "after" }); comps.push(p); } return p; }).filter(Boolean);
    // Ties: everyone on few counts, so masters tie with others on count and Dexterity.
    for (const id of ["fighter", "rogue", "wizard", "cleric"]) s.entities[id].initBonus = rnd(3);
    const r0 = apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM);
    if (!r0.ok) continue;
    fights++;
    let round = s.encounter.round, upAtStart = new Set(ids(s).filter((id) => s.entities[id]?.hp > 0)), turns = [];
    const take = (evs) => { for (const e of evs) if (e.type === "turn" && e.id) {
      if (e.round !== round) {
        for (const id of upAtStart) if (s.entities[id]?.hp > 0) assert.equal(turns.filter((x) => x === id).length, 1, `${grid ?? "hex"} seed ${seed} round ${round}: ${id} once: ${turns.join(" ")}`);
        assert.equal(new Set(turns).size, turns.length, `${grid ?? "hex"} seed ${seed} round ${round}: ${turns.join(" ")}`);
        round = e.round; turns = []; upAtStart = new Set(ids(s).filter((id) => s.entities[id]?.hp > 0));
      }
      turns.push(e.id);
    } };
    take(r0.events);
    let seenRound = s.encounter.round;
    for (let step = 0; step < 90 && s.encounter; step++) {
      const op = rnd(12);
      let r = null;
      if (op <= 3) {                                                       // a choice, any time
        const c = comps[rnd(comps.length)], e = s.entities[c];
        if (e?.bond) { r = choose(s, e.bond.to, c, rnd(2) ? "before" : "after", e.side === "party" ? U1 : DM); flips++; }
      } else if (op === 4) { const w = away.find((x) => !ids(s).includes(x)); if (w) { r = apply(s, { type: "move", actor: w, to: spot(s, f.pos, 6 + rnd(6), 5) }, DM); if (r.ok && ids(s).includes(w)) joins++; } }
      else if (op === 5 && rnd(3) === 0) { const at = spot(s, f.pos, 6 + rnd(8), 5); if (at) { r = apply(s, { type: "spawn", monster: "goblin-warrior", at, name: `G${step}` }, DM); joins++; } }
      if (!r) r = endTurn(s);
      if (r.ok) take(r.events);
      if (!s.encounter) break;
      const o = ids(s);
      assert.equal(new Set(o).size, o.length, "no creature twice in the order");
      for (const m of masters) {
        if (!o.includes(m)) continue;
        const bef = s.encounter.order.filter((x) => x.before === m).map((x) => x.id), aft = s.encounter.order.filter((x) => x.after === m).map((x) => x.id);
        grouped(s, m, bef, aft);
      }
      // At a round's start every companion of the party placed beside its master stands on the side its bond says.
      if (s.encounter.round !== seenRound) {
        seenRound = s.encounter.round;
        for (const x of s.encounter.order) if (x.after === "fighter" || x.before === "fighter") assert.equal(x.before ? "before" : "after", sideOf(s.entities[x.id]), `${x.id} on its bond's side`);
      }
    }
  }
  assert.ok(fights > 30 && flips > 100 && joins > 10, `the harness ran: ${fights} fights, ${flips} choices, ${joins} joins`);
});

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";
  // Two runs of one fight that differ only in a hidden foe's steed choice: players get the same events, view and record.
  const twin = (setup, steps) => {
    const run = (order) => {
      const s = table(grid), log = [];
      const ctx = setup(s, order);
      log.push(ok(apply(s, { type: "startEncounter", center: s.entities.fighter.pos, radius: 6 }, DM)));
      for (let i = 0; i < steps && s.encounter; i++) { if (ctx.at?.[i]) log.push(ctx.at[i](s)); log.push(endTurn(s)); }
      return { s, ctx, seen: [U1, U2].map((u) => log.map((r) => json(viewEvents(r.events, s, u)))), view: [U1, U2].map((u) => json(view(s, u))), tl: json(viewEvents(s.timeline, s, U1)), seq: s.seq };
    };
    const A = run("before"), B = run("after");
    assert.deepEqual(A.seen, B.seen, "the events players get");
    assert.deepEqual(A.view, B.view, "their view");
    assert.equal(A.tl, B.tl, "the record");
    assert.equal(A.seq, B.seq);
    return A;
  };

  test(`a hiding foe's steed choice, made before the fight: players get the same as with the other choice${on}`, () => {
    const A = twin((s, order) => {
      const mage = spawn(s, "goblin-warrior", spot(s, s.entities.fighter.pos, 6, 4), "Mage");
      s.entities[mage].hiding = true;
      const steed = spawn(s, "wolf", spot(s, s.entities.fighter.pos, 1, 2), "Steed");
      bond(s, steed, mage, { turn: "after", kind: "steed" });
      choose(s, mage, steed, order);
      return { mage, steed };
    }, 14);
    assert.ok(!entry(A.s, A.ctx.steed).before && !entry(A.s, A.ctx.steed).after, "not beside a master the party does not know of");
  });

  test(`a foe's steed placed while both were seen, its master hiding later: the choice does not move it until the party knows of both again${on}`, () => {
    const A = twin((s, order) => {
      const mage = spawn(s, "goblin-warrior", spot(s, s.entities.fighter.pos, 6, 4), "Mage");
      s.entities[mage].initBonus = 4;
      const steed = spawn(s, "wolf", spot(s, s.entities.fighter.pos, 1, 2), "Steed");
      bond(s, steed, mage, { turn: "after", kind: "steed" });
      // In round 1 the mage slips out of sight; then its DM makes the choice, which only the DM learns of.
      return { mage, steed, at: {
        1: (x) => { x.entities[mage].hiding = true; return ok(apply(x, { type: "companionOrder", actor: mage, id: steed, order }, DM)); },
        5: (x) => ok(apply(x, { type: "companionOrder", actor: mage, id: steed, order }, DM)),
      } };
    }, 20);
    const { mage, steed } = A.ctx;
    assert.ok(A.s.encounter.round >= 3, "rounds went by");
    assert.equal(A.s.entities[steed].bond.order, "before", "its bond has the choice");
    assert.equal(entry(A.s, steed).after, mage, "but its place waits while the party does not know of the mage");
    // Once the party knows of the mage, the steed changes sides at the next round's start, and not before.
    delete A.s.entities[mage].hiding;
    const r = A.s.encounter.round;
    endTurn(A.s);
    if (A.s.encounter.round === r) assert.equal(entry(A.s, steed).after, mage, "not in the middle of a round");
    toRound(A.s, r + 1);
    assert.equal(entry(A.s, steed).before, mage);
  });
}

test("old saves and records without the fields: a companion acts after its master, and its bond stays as it was", () => {
  for (const grid of [null, "square"]) {
    const { s, steed } = steedFight(grid);
    ok(apply(s, { type: "startEncounter", center: s.entities.fighter.pos, radius: 6 }, DM));
    endTurn(s);
    assert.ok(!("order" in s.entities[steed].bond) && !("orderNext" in s.entities[steed].bond), "a bond made by the DM has neither");
    // As written by C2: no order fields anywhere. Loaded, it plays as after, round after round, and nothing is added.
    const saved = json(s), loaded = JSON.parse(saved);
    migrate(loaded);
    assert.equal(json(loaded), saved);
    toRound(loaded, 5);
    grouped(loaded, "fighter", [], [steed]);
    assert.ok(!("order" in loaded.entities[steed].bond) && !("orderNext" in loaded.entities[steed].bond));
    // A pending choice in an old record of the A1 form with an explicit after, or a null orderNext: after.
    loaded.entities[steed].bond.orderNext = null;
    toRound(loaded, 6);
    grouped(loaded, "fighter", [], [steed]);
  }
});

for (const grid of [null, "square"]) {
  test(`undo, redo and replay give back exactly what choices did, and a save in the middle of a fight loads byte-exact${grid ? " (squares)" : " (hexes)"}`, () => {
    const build = () => steedFight(grid);
    const { s, steed } = build();
    const acts = [
      { type: "companionOrder", actor: "fighter", id: steed, order: "before" },
      { type: "startEncounter", center: s.entities.fighter.pos, radius: 6 },
      { type: "companionOrder", actor: "fighter", id: steed, order: "after" },
      ...Array(4).fill({ type: "endTurn" }),
      { type: "companionOrder", actor: "fighter", id: steed, order: "before" },
      ...Array(8).fill({ type: "endTurn" }),
      { type: "companionOrder", actor: "fighter", id: steed, order: "after" },
      ...Array(6).fill({ type: "endTurn" }),
    ];
    const h = createHistory(), states = [json(s)], done = [], labels = [];
    let saved = null, savedAt = -1;
    for (const a0 of acts) {
      if (!s.encounter && a0.type === "endTurn") break;
      const a = a0.type === "endTurn" ? { ...a0, actor: current(s) } : a0;
      const before = mark(s), r = ok(apply(s, a, DM));
      const step = describeStep(a, r.events, before, s);
      h.record(before, s, step);
      labels.push(step);
      done.push(a); states.push(json(s));
      if (a.type === "companionOrder" && s.encounter && s.entities[steed].bond.orderNext && !saved) { saved = json(s); savedAt = done.length; }
    }
    assert.ok(saved, "a save with a choice waiting");
    for (let i = done.length - 1; i >= 0; i--) { h.undo(s); assert.equal(json(s), states[i], `undo ${i}`); }
    for (let i = 1; i <= done.length; i++) { h.redo(s); assert.equal(json(s), states[i], `redo ${i}`); }
    const again = build().s;
    for (const a of done) ok(apply(again, a, DM));
    assert.equal(json(again), states.at(-1), "replayed, the same");
    // Saved with a choice waiting, loaded, and played on with the same actions: the same state, byte for byte.
    const loaded = JSON.parse(saved);
    migrate(loaded);
    assert.equal(json(loaded), saved, "loads unchanged");
    for (const a of done.slice(savedAt)) ok(apply(loaded, a, DM));
    assert.equal(json(loaded), states.at(-1), "played on from the save, the same");
  });
}

// ---------- review of #335 ----------

test("a player is refused in the same words for a seen creature bonded to a hidden master and for an unbonded one (M1)", () => {
  for (const grid of [null, "square"]) {
    const run = (bonded) => {
      const s = table(grid), f = s.entities.fighter;
      const mage = spawn(s, "goblin-warrior", spot(s, f.pos, 6, 4), "Mage");
      s.entities[mage].hiding = true;
      const wolf = spawn(s, "wolf", spot(s, f.pos, 1, 2), "Wolf");
      // Both states hold the same ids and the same seq: the twin only lacks the bond.
      if (bonded) bond(s, wolf, mage, { turn: "after", kind: "steed" });
      else { bond(s, wolf, mage, { turn: "after", kind: "steed" }); bond(s, wolf, null); }
      const out = [];
      for (const order of ["before", "after", "sideways"]) {
        const before = json(s), r = apply(s, { type: "companionOrder", actor: "fighter", id: wolf, order }, U1);
        assert.equal(r.ok, false);
        assert.equal(json(s), before, "a refused action changes nothing");
        out.push(r.error, json(r.events ?? []));
      }
      return out;
    };
    const A = run(true), B = run(false);
    assert.deepEqual(A, B, "the same refusal and the same events");
    assert.match(A[0], /is not .*'s companion/);
  }
});

test("an id that names no creature's own record (constructor, __proto__, toString) is refused, not thrown, and changes nothing (L1)", () => {
  const s = table(null);
  for (const id of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) for (const ctx of [U1, DM]) {
    refused(s, { type: "companionOrder", actor: "fighter", id, order: "before" }, ctx, /No such creature/);
  }
});

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";

  // newRound's second followMasters (A1): a master set aside last round blocks the first call, which runs before the
  // places moved for that round are given back; the second, after them, lets the choice take effect at this round's start.
  test(`a master set aside every round: its steed's choice still takes effect at the next round's start${on} (review of #335, M2)`, () => {
    const { s, steed } = steedFight(grid);
    ok(apply(s, { type: "startEncounter", center: s.entities.fighter.pos, radius: 6 }, DM));
    if (current(s) === "fighter") endTurn(s);
    ok(apply(s, { type: "stepAway", actor: "fighter", how: "end" }, DM));
    choose(s, "fighter", steed, "before");
    const all = toRound(s, 2);
    assert.equal(entry(s, steed).before, "fighter", "before its master from round 2");
    assert.equal(entry(s, steed).after, undefined);
    toRound(s, 4, all);
    assert.equal(entry(s, steed).before, "fighter");
    const by = {};
    for (const e of all) if (e.type === "turn" && e.id) (by[e.round] ??= []).push(e.id);
    for (const [round, who] of Object.entries(by)) assert.equal(new Set(who).size, who.length, `round ${round}: ${who.join(" ")}`);
    for (const round of [2, 3]) assert.ok(by[round].indexOf(steed) < by[round].indexOf("fighter"), `round ${round}: the steed first, its master moved to the end`);
  });

  test(`a hiding foe master set aside to the end and revealed: its steed, on its own count until then, takes its master's at the next round's start${on} (review of #335, M2)`, () => {
    const s = table(grid), f = s.entities.fighter;
    const boss = spawn(s, "goblin-warrior", spot(s, f.pos, 6, 4), "Boss");
    const w = spawn(s, "wolf", spot(s, f.pos, 1, 4), "Wolf");
    bond(s, w, boss, { turn: "after", kind: "steed" });
    s.entities[boss].hiding = true;
    ok(apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM));
    entry(s, boss).init = 30;
    assert.ok(!entry(s, w).after, "it rolled its own count: the party does not know of its master");
    for (let n = 0; n < 30 && current(s) !== boss; n++) endTurn(s);
    ok(apply(s, { type: "stepAway", actor: boss, how: "end" }, DM));
    delete s.entities[boss].hiding;
    const all = [];
    const r = s.encounter.round;
    for (let i = 0; i < 40 && s.encounter.round === r; i++) all.push(...endTurn(s).events);
    assert.ok(!entry(s, w).after || s.encounter.round > r, "not in the middle of the round its master was set aside in");
    assert.equal(entry(s, w).after, boss, "at the next round's start it is on its master's count");
    assert.equal(entry(s, w).init, entry(s, boss).init);
    toRound(s, r + 3, all);
    const by = {};
    for (const e of all) if (e.type === "turn" && e.id) (by[e.round] ??= []).push(e.id);
    for (const [round, who] of Object.entries(by)) assert.equal(new Set(who).size, who.length, `round ${round}: ${who.join(" ")}`);
    // Its master, set aside, is moved to the end each round; the steed keeps its count and acts first.
    assert.equal(by[r + 1][0], w);
    assert.equal(by[r + 1].at(-1), boss);
  });
}
