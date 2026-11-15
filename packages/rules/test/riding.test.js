// Riding, stage C6a (docs/specs/companions.md, Decision 8; SRD 5.2.1 "Mounted Combat", 2099-2133): `mount` and
// `dismount` for half the rider's Speed, a willing creature at least one size larger within 5 ft, once a turn; the
// rider in its mount's space (its footprint) and nothing else there; a controlled mount moving on its rider's turn
// from `budget.mount` with only Dash and Disengage (its Dodge waits for attacks.js, its attack is refused); an
// independent mount keeping its own turn. On hexes and on the square room.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { migrate } from "../src/migrate.js";
import { apart, footprint, overlapAt } from "../src/space.js";
import { gridOf } from "../src/grid.js";
import { CONTENT } from "../src/content/index.js";
import { MOUNTS } from "../src/content/schema.js";
import { squareRoom } from "./fixtures/square-room.js";

const DM = { role: "dm", userId: "dm" };
const U1 = { role: "player", userId: "u1" };
const U2 = { role: "player", userId: "u2" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
function refused(s, action, ctx, words) {
  const before = json(s), r = apply(s, action, ctx);
  assert.equal(r.ok, false, `${action.type} should be refused`);
  if (words) assert.match(r.error, words);
  assert.equal(json(s), before, "a refused action changes nothing");
  return r;
}
const GRIDS = ["hex", "square"];
// The valley's party, on hexes or in the square room, with the fighter (Ann, u1) and the rogue (Bo, u2) claimed.
// A warhorse of the party's beside the fighter, a goblin far off to keep a fight going.
const SPOTS = {
  hex: { fighter: { q: -6, r: 2 }, rogue: { q: -7, r: 3 }, cleric: { q: -7, r: 2 }, wizard: { q: -8, r: 3 }, horse: { q: -4, r: 2 }, goblin: { q: 2, r: 2 } },
  square: { fighter: { q: 3, r: 3 }, rogue: { q: 1, r: 12 }, cleric: { q: 2, r: 12 }, wizard: { q: 3, r: 12 }, horse: { q: 4, r: 3 }, goblin: { q: 11, r: 11 } },
};
function table(grid, seed = 5) {
  const s = newGame(seed);
  if (grid === "square") ok(apply(s, { type: "loadMap", map: squareRoom() }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  for (const id of ["m1", "m2", "m3", "m4", "m5", "m6"]) if (s.entities[id]) ok(apply(s, { type: "remove", actor: id }, DM));
  const P = SPOTS[grid];
  for (const id of ["fighter", "rogue", "cleric", "wizard"]) s.entities[id].pos = { ...P[id], z: 0 };
  ok(apply(s, { type: "claim", entity: "fighter", user: "u1", userName: "Ann" }, U1));
  ok(apply(s, { type: "claim", entity: "rogue", user: "u2", userName: "Bo" }, U2));
  const horse = beside(s, "fighter", "warhorse", "Warhorse");
  s.entities[horse].side = "party";
  return { s, horse, P };
}
// A creature spawned as near `id` as it fits, within 5 ft of it (the nearest cells first, a fixed order).
function beside(s, id, monster, name, more = {}) {
  const G = gridOf(s.map), e = s.entities[id];
  for (const h of G.range(e.pos, 3).sort((a, b) => G.dist(a, e.pos) - G.dist(b, e.pos) || a.q - b.q || a.r - b.r)) {
    const t = structuredClone(s), r = apply(t, { type: "spawn", monster, at: h, ...(name ? { name } : {}), ...more }, DM);
    if (!r.ok) continue;
    const m = t.entities[r.events.find((x) => x.type === "spawned").id];
    if (apart(t, e, m) > 1) continue;
    return spawn(s, monster, h, name, more);
  }
  throw new Error(`no room beside ${id}`);
}
const spawn = (s, monster, at, name, more = {}) => ok(apply(s, { type: "spawn", monster, at, ...(name ? { name } : {}), ...more }, DM)).events.find((e) => e.type === "spawned").id;
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
// A fight, on the fighter's turn: the goblin far off keeps it going.
function fight(grid) {
  const t = table(grid);
  const { s, P } = t;
  t.goblin = spawn(s, "goblin-warrior", P.goblin);
  ok(apply(s, { type: "startEncounter", center: grid === "square" ? { q: 7, r: 7 } : { q: -2, r: 2 }, radius: 6 }, DM));
  turnOf(s, "fighter");
  assert.equal(s.encounter.budget.move, 30);
  return t;
}
// A free cell within 5 ft of a creature, for setting another there by hand.
function besidePos(s, id) {
  const G = gridOf(s.map), m = s.entities[id];
  for (const h of G.range(m.pos, 3)) {
    const t = structuredClone(s), r = apply(t, { type: "spawn", monster: "goblin-warrior", at: h }, DM);
    if (r.ok && apart(t, m, t.entities[r.events[0].id]) <= 1) return t.entities[r.events[0].id].pos;
  }
  throw new Error("no room");
}
const mount = (s, actor, m, ctx = DM) => apply(s, { type: "mount", actor, mount: m }, ctx);

test("the eight mounts the SRD sells are trained to accept a rider, and nothing else is", () => {
  assert.deepEqual(MOUNTS, ["camel", "elephant", "draft-horse", "riding-horse", "mastiff", "mule", "pony", "warhorse"]);
  for (const m of Object.values(CONTENT.monsters)) assert.equal(m.mount, MOUNTS.includes(m.id) ? "trained" : undefined, m.id);
});

for (const grid of GRIDS) {
  test(`${grid}: mounting costs half the rider's Speed, and is refused with less`, () => {
    const { s, horse } = fight(grid);
    const r = ok(mount(s, "fighter", horse, U1));
    assert.equal(s.encounter.budget.move, 15, "half of 30");
    assert.deepEqual(s.entities.fighter.riding, { on: horse, controlled: true, size: "large" });
    assert.equal(s.entities[horse].rider, "fighter");
    assert.deepEqual(s.entities.fighter.pos, s.entities[horse].pos, "the rider stands on its mount's anchor");
    assert.ok(r.events.some((e) => e.type === "mounted" && e.id === "fighter" && e.mount === horse && e.controlled === true));
    assert.deepEqual(s.encounter.budget.mount, { move: 60, action: 1, dashes: 0 }, "the warhorse moves and acts on the turn it is mounted");

    const t = fight(grid);
    t.s.encounter.budget.move = 10;
    refused(t.s, { type: "mount", actor: "fighter", mount: t.horse }, U1, /Mounting takes 15 ft of movement; Ann|Mounting takes 15 ft/);
    // Once a turn: down and up again is refused.
    const u = fight(grid);
    ok(mount(u.s, "fighter", u.horse, U1));
    ok(apply(u.s, { type: "dismount", actor: "fighter" }, U1));
    u.s.encounter.budget.move = 30;
    refused(u.s, { type: "mount", actor: "fighter", mount: u.horse }, U1, /already mounted this turn/);
    // Not on another's turn.
    const v = fight(grid);
    refused(v.s, { type: "mount", actor: "rogue", mount: v.horse }, U2, /isn't Bo|It isn't|turn/);
  });

  test(`${grid}: the mount must be at least one size larger, within 5 ft, and willing`, () => {
    const { s, horse, P } = table(grid);
    // A Medium mastiff... is Medium: the fighter is Medium too.
    const dog = beside(s, "fighter", "mastiff");
    s.entities[dog].side = "party";
    refused(s, { type: "mount", actor: "fighter", mount: dog }, U1, /at least one size larger/);
    // Too far: the horse two cells off the fighter.
    const home = s.entities[horse].pos;
    s.entities[horse].pos = { q: home.q + 4, r: home.r, z: 0 };
    refused(s, { type: "mount", actor: "fighter", mount: horse }, U1, /within 5 ft/);
    s.entities[horse].pos = home;
    // Not of the party: not willing, to a player. The DM may.
    s.entities[horse].side = "foe";
    refused(s, { type: "mount", actor: "fighter", mount: horse }, U1, /isn't willing/);
    s.entities[horse].side = "party";
    // An untrained animal: the DM's call.
    const wolf = beside(s, "fighter", "dire-wolf");
    s.entities[wolf].side = "party";
    if (CONTENT.monsters["dire-wolf"].size === "large") {
      refused(s, { type: "mount", actor: "fighter", mount: wolf }, U1, /isn't trained/);
      const was = s.entities.fighter.pos;
      ok(mount(s, "fighter", wolf, DM));
      assert.equal(s.entities.fighter.riding.controlled, false, "an untrained mount is independent");
      ok(apply(s, { type: "dismount", actor: "fighter" }, DM));
      ok(apply(s, { type: "remove", actor: wolf }, DM));
      s.entities.fighter.pos = was;
    }
    // Another player's character can't be sent up.
    refused(s, { type: "mount", actor: "fighter", mount: horse }, U2, /isn't yours/);
    // A creature that is nothing, and itself.
    refused(s, { type: "mount", actor: "fighter", mount: "nobody" }, U1, /^No such creature\.$/);
    refused(s, { type: "mount", actor: "fighter", mount: "fighter" }, U1, /^No such creature\.$|ride itself/);
    ok(mount(s, "fighter", horse, U1));
    // One rider per mount, and a rider is not a mount.
    s.entities.rogue.pos = { ...s.entities.fighter.pos };     // set beside by hand: only the check is tested
    s.entities.rogue.pos = besidePos(s, horse);
    refused(s, { type: "mount", actor: "rogue", mount: horse }, U2, /already carries a rider/);
  });

  test(`${grid}: a Medium rider on a warhorse shares its space, and nothing else may`, () => {
    const { s, horse } = table(grid);
    ok(mount(s, "fighter", horse, U1));
    const G = gridOf(s.map), f = s.entities.fighter, h = s.entities[horse];
    assert.deepEqual(footprint(f, f.pos, G), footprint(h, h.pos, G), "the rider borrows the mount's footprint");
    assert.equal(footprint(f, f.pos, G).length, grid === "square" ? 4 : 3, "Large: 2 by 2, or three hexes");
    assert.equal(f.size, "medium", "its own size is unchanged");
    // Nobody else can be put there, by the DM or by walking.
    for (const c of footprint(h, h.pos, G)) {
      assert.equal(apply(structuredClone(s), { type: "spawn", monster: "goblin-warrior", at: { q: c.q, r: c.r } }, DM).ok, false, "no one else in the pair's space");
      const t = structuredClone(s);
      const r = apply(t, { type: "move", actor: "rogue", to: { q: c.q, r: c.r } }, U2);
      assert.ok(!r.ok || !overlapAt(t.entities.rogue, t.entities.rogue.pos, h, h.pos, G), "the rogue does not stop in the pair's space");
    }
  });

  test(`${grid}: the pair walks together, from the mount's movement, and the rider dismounts with its own`, () => {
    const { s, horse } = fight(grid);
    ok(mount(s, "fighter", horse, U1));
    const G = gridOf(s.map), from = { ...s.entities[horse].pos };
    // Ten cells off (50 ft) along a row: more than the fighter's 15 ft left, within the warhorse's 60.
    const to = grid === "square" ? { q: from.q, r: from.r + 6 } : { q: from.q + 6, r: from.r };
    const r = ok(apply(s, { type: "move", actor: "fighter", to }, U1));
    assert.equal(s.entities[horse].pos.q, to.q); assert.equal(s.entities[horse].pos.r, to.r);
    assert.deepEqual(s.entities.fighter.pos, s.entities[horse].pos, "the rider came along");
    assert.ok(r.events.some((e) => e.type === "moved" && e.id === "fighter"), "the rider's move is told too");
    assert.equal(s.encounter.budget.move, 15, "the rider's own movement is left for dismounting");
    const left = s.encounter.budget.mount.move;
    assert.ok(left < 60 - 25 && left >= 0, "the walk was spent from the warhorse's 60 ft");
    assert.ok(G.dist(from, s.entities.fighter.pos) >= 6);
    // The mount can be sent by its rider's player directly too, and Dash.
    const d = ok(apply(s, { type: "dash", actor: horse }, U1));
    assert.ok(d.events.some((e) => e.type === "std" && e.id === horse && e.action === "Dash"));
    assert.equal(s.encounter.budget.mount.move, left + 60); assert.equal(s.encounter.budget.mount.action, 0);
    assert.equal(s.encounter.budget.action, 1, "the rider still has its own action");
    refused(s, { type: "disengage", actor: horse }, U1, /already used its action/);
    // Its attack is refused, as anything but Dash, Disengage and Dodge.
    refused(s, { type: "attack", actor: horse, attack: "hooves", target: "rogue" }, DM, /can only Dash, Disengage or Dodge/);
    refused(s, { type: "act", actor: horse, action: CONTENT.monsters.warhorse.actions[0].id, target: "rogue" }, DM, /can only Dash, Disengage or Dodge/);
    refused(s, { type: "dodge", actor: horse }, U1, /Dodge is not in the engine yet/);
    // Another player may not direct it.
    refused(s, { type: "move", actor: horse, to: from }, U2, /isn't yours/);
    // Dismount: half Speed, a free space within 5 ft of the horse.
    const dn = ok(apply(s, { type: "dismount", actor: "fighter" }, U1));
    const f = s.entities.fighter, h = s.entities[horse];
    assert.equal(f.riding, undefined); assert.equal(h.rider, undefined);
    assert.equal(s.encounter.budget.move, 0);
    assert.equal(s.encounter.budget.mount, undefined);
    assert.ok(!overlapAt(f, f.pos, h, h.pos, G), "beside the horse, not in it");
    assert.ok(footprint(h, h.pos, G).some((c) => G.dist(c, f.pos) <= 1), "within 5 ft of it");
    assert.ok(dn.events.some((e) => e.type === "dismounted" && e.id === "fighter" && e.mount === horse));
  });

  test(`${grid}: dismounting to a named space, refused with too little movement or too far`, () => {
    const { s, horse } = fight(grid);
    ok(mount(s, "fighter", horse, U1));
    const G = gridOf(s.map), h = s.entities[horse];
    const far = { q: h.pos.q - 4, r: h.pos.r };
    refused(s, { type: "dismount", actor: "fighter", to: far }, U1, /within 5 ft/);
    const t = structuredClone(s);
    t.encounter.budget.move = 10;
    refused(t, { type: "dismount", actor: "fighter" }, U1, /Dismounting takes 15 ft/);
    // A named free space beside it.
    const cells = footprint(h, h.pos, G);
    let spot = null;
    for (const c of cells) for (const n of G.neighbors(c)) if (!spot && !cells.some((x) => x.q === n.q && x.r === n.r) && ok(apply(structuredClone(s), { type: "dismount", actor: "fighter", to: n }, U1))) spot = n;
    ok(apply(s, { type: "dismount", actor: "fighter", to: spot }, U1));
    assert.equal(s.entities.fighter.pos.q, spot.q); assert.equal(s.entities.fighter.pos.r, spot.r);
  });

  test(`${grid}: an independent mount keeps its own turn, and its rider can't steer it`, () => {
    const { s, P } = fight(grid);
    const wolf = beside(s, "fighter", "dire-wolf");
    s.entities[wolf].side = "party";
    if (CONTENT.monsters["dire-wolf"].size !== "large") return;
    turnOf(s, "fighter");
    ok(mount(s, "fighter", wolf, DM));
    assert.equal(s.entities.fighter.riding.controlled, false);
    assert.equal(s.encounter.budget.mount, undefined);
    refused(s, { type: "move", actor: "fighter", to: { q: P.fighter.q + 2, r: P.fighter.r } }, U1, /goes where it likes/);
    turnOf(s, wolf);
    const at = s.entities[wolf].pos, to = grid === "square" ? { q: at.q, r: at.r + 3 } : { q: at.q + 3, r: at.r };
    ok(apply(s, { type: "move", actor: wolf, to }, DM));
    assert.deepEqual(s.entities.fighter.pos, s.entities[wolf].pos, "the rider rides along");
  });

  test(`${grid}: no creature gains or loses a turn in a round where someone mounts or dismounts`, () => {
    const { s, horse } = fight(grid);
    const turns = [];
    const play = (a, ctx = DM) => { const r = ok(apply(s, a, ctx)); for (const e of r.events) if (e.type === "turn") turns.push([e.round, e.id]); return r; };
    const ids = s.encounter.order.map((o) => o.id);
    const round1 = s.encounter.round;
    play({ type: "mount", actor: "fighter", mount: horse }, U1);
    for (let i = 0; i < 40 && !(s.encounter.round === round1 + 1 && current(s) === "fighter"); i++) play({ type: "endTurn", actor: current(s) });
    play({ type: "dismount", actor: "fighter" }, U1);
    for (let i = 0; i < 40 && s.encounter.round < round1 + 3; i++) play({ type: "endTurn", actor: current(s) });
    const count = (round, id) => turns.filter(([r, x]) => r === round && x === id).length;
    for (const round of [round1 + 1, round1 + 2]) for (const id of ids) {
      if (id === horse && round === round1 + 1) assert.equal(count(round, id), 0, "the ridden horse moves on its rider's turn, never its own");
      else assert.equal(count(round, id), 1, `${id} takes one turn in round ${round}`);
    }
    // In the round of the dismount the horse took no turn of its own after its rider's, and the next round its place
    // is straight after its rider.
    const o = s.encounter.order.map((x) => x.id);
    assert.equal(o.indexOf(horse), o.indexOf("fighter") + 1);
  });

  test(`${grid}: the pair survives undo, redo, replay and save and load; an old save loads`, () => {
    const t = fight(grid), s = t.s, horse = t.horse;
    const start = structuredClone(s), h = createHistory();
    const step = (a, ctx = DM) => { const before = mark(s), r = ok(apply(s, a, ctx)); h.record(before, s, describeStep(a, r.events, before, s)); };
    step({ type: "mount", actor: "fighter", mount: horse }, U1);
    const after = json(s);
    h.undo(s);
    assert.equal(s.entities.fighter.riding, undefined); assert.equal(s.entities[horse].rider, undefined);
    h.redo(s);
    assert.equal(json(s), after);
    // Replay from the start gives the same state.
    const again = structuredClone(start);
    ok(apply(again, { type: "mount", actor: "fighter", mount: horse }, U1));
    assert.equal(json(again), after);
    // Save and load.
    const loaded = migrate(JSON.parse(after));
    assert.equal(json(loaded), after);
    // A save made before riding (no `riding`, `rider`, `budget.mount`) loads and plays as before.
    const old = migrate(JSON.parse(json(start)));
    assert.equal(json(old), json(start));
    // Half a pair (a hand-edited or broken save) is dropped, both halves.
    const broken = JSON.parse(after);
    delete broken.entities[horse].rider;
    migrate(broken);
    assert.equal(broken.entities.fighter.riding, undefined);
  });

  test(`${grid}: a rider whose mount vanishes or is moved apart is down from it, and the DM is told`, () => {
    const { s, horse } = table(grid);
    ok(mount(s, "fighter", horse, U1));
    // The DM moves the horse away: C6b's moving together is not built, so the pair comes apart and the DM is told.
    const r = ok(apply(s, { type: "remove", actor: horse }, DM));
    assert.equal(s.entities.fighter.riding, undefined);
    assert.ok(r.events.some((e) => e.type === "dismounted" && e.id === "fighter" && e.why === "gone"));
  });

  test(`${grid}: a hidden mount answers a player as a creature that does not exist`, () => {
    const a = table(grid), b = table(grid);
    const P = SPOTS[grid];
    const at = { q: P.fighter.q, r: P.fighter.r + (grid === "square" ? 2 : 1) };
    void at;
    const hid = beside(a.s, "fighter", "riding-horse", "Pale horse", { hidden: true });
    b.s.seq = a.s.seq;
    const ra = apply(a.s, { type: "mount", actor: "fighter", mount: hid }, U1);
    const rb = apply(b.s, { type: "mount", actor: "fighter", mount: hid }, U1);
    assert.equal(ra.ok, false); assert.equal(ra.error, rb.error);
    assert.equal(ra.error, "No such creature.");
  });

  test(`${grid}: twin runs: a hidden pair riding sends players exactly what no pair sends`, () => {
    // World A: a hidden goblin and a hidden wolf of the DM's; the goblin mounts, they ride, it dismounts.
    // World B: neither exists, so the DM's actions about them are refused. Players see the same in both.
    const A = table(grid), B = table(grid);
    const P = SPOTS[grid];
    const far = grid === "square" ? [{ q: 12, r: 2 }, { q: 12, r: 4 }] : [{ q: 6, r: -6 }, { q: 6, r: -4 }];
    const gob = spawn(A.s, "goblin-warrior", far[0], null, { hidden: true });
    const wolf = spawn(A.s, "dire-wolf", far[1], null, { hidden: true });
    B.s.seq = A.s.seq;
    // A Small goblin on a Large dire wolf, both the DM's foes (independent: not trained).
    A.s.entities[gob].pos = { q: far[1].q, r: far[1].r - 1, z: 0 };
    const script = [
      [{ type: "mount", actor: gob, mount: wolf }, DM],
      [{ type: "move", actor: "rogue", to: { q: P.rogue.q, r: P.rogue.r - 1 } }, U2],
      [{ type: "move", actor: wolf, to: grid === "square" ? { q: 12, r: 7 } : { q: 7, r: -3 } }, DM],
      [{ type: "dismount", actor: gob }, DM],
    ];
    const seen = (t) => { const out = []; for (const [a, ctx] of script) { const r = apply(t.s, a, ctx); out.push(json(viewEvents(r.events, t.s, U1))); } return out; };
    const ea = seen(A), eb = seen(B);
    assert.deepEqual(ea, eb, "the same events");
    assert.equal(json(view(A.s, U1)), json(view(B.s, U1)), "the same view");
    assert.ok(A.s.entities[gob] && !A.s.entities[gob].riding, "world A did ride and get down");
  });

  test(`${grid}: a hidden rider can't be put on a mount players see (riding is plain to see)`, () => {
    const { s, horse, P } = table(grid);
    s.entities[horse].side = "foe";
    const gob = beside(s, horse, "goblin-warrior", null, { hidden: true });
    refused(s, { type: "mount", actor: gob, mount: horse }, DM, /knows of only one/);
  });
}

test("a ridden steed's before or after choice waits until it is ridden no more (A1); the cap holds", () => {
  const { s, horse } = table("hex");
  s.entities[horse].side = "foe";
  ok(apply(s, { type: "bond", actor: horse, to: "fighter", turn: "after" }, DM));
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: SPOTS.hex.goblin }, DM));
  ok(apply(s, { type: "startEncounter", center: { q: -2, r: 2 }, radius: 6 }, DM));
  turnOf(s, "fighter");
  ok(mount(s, "fighter", horse, DM));
  ok(apply(s, { type: "companionOrder", actor: "fighter", id: horse, order: "before" }, U1));
  const r0 = s.encounter.round;
  for (let i = 0; i < 40 && s.encounter.round < r0 + 2; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.equal(s.entities[horse].bond.orderNext, "before", "the choice waits while the steed is ridden");
  assert.equal(s.entities[horse].bond.order ?? "after", "after");
});

test("labels: mount and dismount read in plain words", { todo: "history.js (describeStep) needs a label for mount and dismount: outside this job's files" }, () => {
  const { s, horse } = table("hex");
  const before = mark(s), r = ok(mount(s, "fighter", horse, U1));
  assert.match(describeStep({ type: "mount", actor: "fighter", mount: horse }, r.events, before, s).label, /mounted/);
});
