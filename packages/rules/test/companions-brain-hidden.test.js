// Companions C7 (#366): what the companion brain does must not tell a player of a hidden master, a hidden target, or
// what a hidden creature can see. Twin runs on hexes and on the square room: the same script in two worlds that differ
// only in a creature the party does not know of gives every player the same events and the same view after every
// action, until an existing reveal rule fires.
//   1. A party skeleton (never commanded) steps away from a goblin beside it. A goblin that took the Hide action stands
//      on the cell it steps to in one world and far off in the other: the brain chooses the same step in both (it acts
//      on what the party knows), and in the first the move stops and finds the goblin, by the engine's own rule.
//   2. A foe's wolf bonded to a hidden goblin master, Stunned (the brain would have a summon whose master can't speak
//      take the Dodge action), against the same wolf with no bond: the same, all fight long.
//   3. A foe's Find Steed whose hidden caster is Stunned (the brain would bring it to protect her), against the same
//      block spawned by the DM with no bond: the same.
import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep, autoPlays, brainMode } from "../src/ai.js";
import { apply, current } from "../src/engine.js";
import { view, viewEvents } from "../src/view.js";
import { DM, U1, U2, U3, GRIDS, CENTER, SPOTS, ok, json, cellsNear, near, spawn, spawned, table, turnOf } from "./c7-brain-kit.js";

const PLAYERS = [U1, U2, U3];
// Outside the fight's arena (radius 6 round CENTER): the valley's open ground to the east, the square room's corridor.
const OUTSIDE = { hex: { q: 7, r: -1 }, square: { q: 20, r: 3 } };
const seen = (s, r) => PLAYERS.map((u) => json([viewEvents(r.events, s, u), view(s, u)]));
// Every turn: a creature the brain or the monster AI plays is played (`only`: just those ids), anyone else ends its turn.
function run(s, steps, only = null) {
  const out = [];
  for (let i = 0; i < steps && s.encounter; i++) {
    if (s.pending) { const r = ok(apply(s, { type: "react", prompt: s.pending.n, take: null }, DM)); out.push({ a: "react", v: seen(s, r) }); continue; }
    const id = current(s), e = s.entities[id];
    const plays = e.kind === "npc" && (!only || only.includes(id)) && autoPlays(s, id);
    const a = (plays && aiStep(s, id)) || { type: "endTurn", actor: id };
    let r = apply(s, a, DM);
    if (!r.ok) r = ok(apply(s, { type: "endTurn", actor: id }, DM));
    out.push({ a, v: seen(s, r), events: r.events });
  }
  return out;
}

for (const grid of GRIDS) {
  test(`${grid}: a party skeleton steps away on what the party knows: a hiding goblin on its cell changes nothing until the move finds it`, () => {
    const make = (onCell) => {
      const s = table(grid);
      ok(apply(s, { type: "setting", key: "unseenTurns", value: "quiet" }, DM));
      const skel = near(s, "cleric", "skeleton", { name: "Skeleton" }, { min: 2, max: 3 });
      ok(apply(s, { type: "bond", actor: skel, to: "cleric", kind: "undead", orders: "command" }, DM));
      near(s, skel, "goblin-warrior", { name: "Goblin" });
      return { s, skel, place: (cell) => { const g = spawn(s, "goblin-warrior", cell, { name: "Lurker" }); s.entities[g].hiding = { dc: 30 }; return g; } };
    };
    // Where the skeleton steps with no lurker near: found in a world with the lurker far off (in the arena, hiding).
    const probe = make();
    probe.place(cellsNear(probe.s, probe.skel, "goblin-warrior", { min: 4, max: 5 }).find(Boolean));
    ok(apply(probe.s, { type: "startEncounter", center: CENTER[grid], radius: 7 }, DM));
    turnOf(probe.s, probe.skel);
    ok(apply(probe.s, aiStep(probe.s, probe.skel), DM));                                      // the Dodge action
    const step = aiStep(probe.s, probe.skel);
    assert.equal(step.type, "move");
    const target = step.to;
    // World A: the lurker on that cell. World B: the lurker far off, as in the probe.
    const A = make(), B = make();
    const ga = A.place(target), gb = B.place(cellsNear(B.s, B.skel, "goblin-warrior", { min: 4, max: 5 }).find(Boolean));
    assert.equal(ga, gb, "the same ids in both worlds");
    const startA = ok(apply(A.s, { type: "startEncounter", center: CENTER[grid], radius: 7 }, DM));
    const startB = ok(apply(B.s, { type: "startEncounter", center: CENTER[grid], radius: 7 }, DM));
    assert.ok(A.s.encounter.order.some((o) => o.id === ga) && A.s.entities[ga].hiding, "the lurker is in the fight, hiding");
    assert.deepEqual(seen(A.s, startA), seen(B.s, startB), "the fight starts the same for every player");
    // Up to the skeleton's turn and through its Dodge: every action the same for every player.
    for (const w of [A, B]) w.log = [];
    for (let i = 0; i < 80 && current(A.s) !== A.skel; i++) {
      const id = current(A.s);
      assert.equal(current(B.s), id);
      const ra = ok(apply(A.s, { type: "endTurn", actor: id }, DM)), rb = ok(apply(B.s, { type: "endTurn", actor: id }, DM));
      assert.deepEqual(seen(A.s, ra), seen(B.s, rb), `${id}'s turn`);
    }
    assert.equal(current(B.s), B.skel);
    const da = aiStep(A.s, A.skel), db = aiStep(B.s, B.skel);
    assert.deepEqual(da, db);
    assert.deepEqual(seen(A.s, ok(apply(A.s, da, DM))), seen(B.s, ok(apply(B.s, db, DM))), "the Dodge");
    // The step: the brain chooses the same cell in both worlds (it does not know of the lurker).
    const ma = aiStep(A.s, A.skel), mb = aiStep(B.s, B.skel);
    assert.deepEqual(ma, mb, "the same step");
    assert.deepEqual(ma.to, target);
    // In A the move stops beside the lurker and finds it: the reveal a move onto a hiding creature's cell gives.
    const ra = ok(apply(A.s, ma, DM));
    assert.ok(ra.events.some((e) => (e.type === "unhidden" && e.id === ga) || (e.type === "revealed" && e.id === ga)), `found: ${json(ra.events.map((e) => e.type))}`);
    assert.ok(!A.s.entities[ga].hiding, "no longer hiding");
  });

  test(`${grid}: a foe's companion with a hidden, Stunned master plays as the same creature with no master: players see the same all fight`, () => {
    const make = (bonded) => {
      const s = table(grid);
      const mage = spawn(s, "goblin-warrior", OUTSIDE[grid], { name: "Gob Mage" });
      ok(apply(s, { type: "reveal", actor: mage, hidden: true }, DM));
      const wolf = near(s, "fighter", "wolf", { name: "Wolf" }, { min: 2, max: 3 });
      const r = bonded ? ok(apply(s, { type: "bond", actor: wolf, to: mage, kind: "summon" }, DM)) : null;
      if (r) assert.deepEqual(PLAYERS.map((u) => viewEvents(r.events, s, u)), [[], [], []], "the DM's bond of a foe tells no player");
      ok(apply(s, { type: "condition", actor: mage, condition: "stunned" }, DM));
      return { s, wolf, mage };
    };
    const A = make(true), B = make(false);
    assert.deepEqual(PLAYERS.map((u) => json(view(A.s, u))), PLAYERS.map((u) => json(view(B.s, u))));
    const fa = ok(apply(A.s, { type: "startEncounter", center: CENTER[grid], radius: 7 }, DM)), fb = ok(apply(B.s, { type: "startEncounter", center: CENTER[grid], radius: 7 }, DM));
    assert.ok(!A.s.encounter.order.some((o) => o.id === A.mage), "the master is outside the fight");
    assert.ok(A.s.encounter.order.some((o) => o.id === A.wolf), "the wolf is in it");
    assert.deepEqual(seen(A.s, fa), seen(B.s, fb));
    turnOf(A.s, A.wolf); turnOf(B.s, B.wolf);
    assert.equal(brainMode(A.s, A.s.entities[A.wolf]), "free", "its master unknown to the party, it plays as an unbonded creature");
    const ra = run(A.s, 60, [A.wolf]), rb = run(B.s, 60, [B.wolf]);
    assert.ok(ra.some((x) => x.a.type === "act" || x.a.type === "attack"), "the wolf fought");
    assert.deepEqual(ra.map((x) => x.v), rb.map((x) => x.v), "every player's events and view after every action");
    // With the master known to the party (revealed), the same wolf takes the Dodge action instead: the difference the
    // twin hides is real.
    const C = make(true);
    ok(apply(C.s, { type: "reveal", actor: C.mage, hidden: false }, DM));
    ok(apply(C.s, { type: "startEncounter", center: CENTER[grid], radius: 7 }, DM));
    turnOf(C.s, C.wolf);
    assert.equal(brainMode(C.s, C.s.entities[C.wolf]), "guard");
  });

  test(`${grid}: a foe's Find Steed whose hidden caster is Stunned does not go to her: players see what the DM's unbonded steed gives`, () => {
    const make = (cast) => {
      const s = table(grid);
      const mage = structuredClone(s.entities.cleric);
      Object.assign(mage, { id: "mage", name: "Mira", side: "foe", owner: null, ownerName: null, pos: { ...SPOTS[grid].cleric, z: 0 } });
      s.entities.cleric.pos = { ...SPOTS[grid].far, z: 0 };
      mage.spells.push("find-steed"); mage.slots[2] = 1;
      s.entities.mage = mage;
      ok(apply(s, { type: "reveal", actor: "mage", hidden: true }, DM));
      const at = cellsNear(s, "mage", "warhorse", { min: 2, max: 3 })[0];
      const r = cast ? ok(apply(s, { type: "cast", actor: "mage", spell: "find-steed", slot: 2, summon: { type: "celestial", at: [at] } }, DM))
        : ok(apply(s, { type: "spawn", monster: "otherworldly-steed", at, slot: 2, kind: "celestial", caster: "mage" }, DM));
      if (!cast) s.entities.mage.slots[2]--;
      ok(apply(s, { type: "place", actor: "mage", to: OUTSIDE[grid] }, DM));                 // she goes off, out of the arena
      ok(apply(s, { type: "condition", actor: "mage", condition: "stunned" }, DM));
      return { s, steed: spawned(r), r };
    };
    const A = make(true), B = make(false);
    assert.equal(A.steed, B.steed);
    assert.deepEqual(seen(A.s, A.r), seen(B.s, B.r), "summoned by a caster they do not know of: as the DM's spawn");
    const fa = ok(apply(A.s, { type: "startEncounter", center: CENTER[grid], radius: 7 }, DM)), fb = ok(apply(B.s, { type: "startEncounter", center: CENTER[grid], radius: 7 }, DM));
    assert.deepEqual(seen(A.s, fa), seen(B.s, fb));
    assert.ok(A.s.encounter.order.some((o) => o.id === A.steed) && !A.s.encounter.order.some((o) => o.id === "mage"), "the steed fights; its caster is away");
    turnOf(A.s, A.steed); turnOf(B.s, B.steed);
    assert.equal(brainMode(A.s, A.s.entities[A.steed]), "free", "not 'protect': the party does not know of its master");
    const ra = run(A.s, 60, [A.steed]), rb = run(B.s, 60, [B.steed]);
    assert.deepEqual(ra.map((x) => x.v), rb.map((x) => x.v), "every player's events and view after every action");
  });
}
