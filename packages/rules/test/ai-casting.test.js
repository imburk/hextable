// Built spellcasters played by the AI cast damage and healing spells (docs/specs/ai-casting.md, stage AC1; #487).
// Every test builds its fight from a seed (the pregenerated party: Tavin the wizard with Fire Bolt, Magic Missile and Burning Hands;
// Odessa the cleric with Sacred Flame, Cure Wounds, Healing Word and Shield of Faith; Brenna the fighter and Pip the rogue) and places
// goblins by hand, on hexes and on squares, so each is a fixed fight that replays. The AI is called as the DM's auto-play calls it for a
// character set aside under `standIn`, and every step it sends is applied: a refusal is a failure.
import assert from "node:assert/strict";
import { test } from "node:test";
import { aiCastable, aiStep, casterStep } from "../src/ai.js";
import { SPELLS } from "../src/content/index.js";
import { aimArea, apply, current } from "../src/engine.js";
import { gridOf } from "../src/grid.js";
import { apart as apartFor } from "../src/space.js";
import { view, viewEvents } from "../src/view.js";
import { DM, GRIDS, U1, U2, U3, caughtBy, fits, goblinAt, json, ok, put, ring, scene, spawn, standIn, step, table } from "./ai-casting-kit.js";

const WIZARD = "wizard", CLERIC = "cleric", FIGHTER = "fighter";
const spellsOf = (id, s) => s.entities[id].spells;
// A cast action's spell, or the action's type.
const what = (a) => (a.type === "cast" ? a.spell : a.type);
const down = (s, id) => ok(apply(s, { type: "setHp", actor: id, hp: 0 }, DM));

test("the spells the casting AI casts, worked out from the pack's data and pinned: 30 damage and 4 healing spells", () => {
  const damage = [], heal = [];
  for (const sp of Object.values(SPELLS)) { const k = aiCastable(sp); if (k === "damage") damage.push(sp.id); else if (k === "heal") heal.push(sp.id); }
  const DAMAGE = ["fire-bolt", "sacred-flame", "magic-missile", "burning-hands", "acid-splash", "eldritch-blast", "poison-spray", "ray-of-frost", "vicious-mockery", "dissonant-whispers", "guiding-bolt", "inflict-wounds", "ray-of-sickness", "thunderwave", "blight", "vitriolic-sphere", "contagion", "flame-strike", "chain-lightning", "circle-of-death", "freezing-sphere", "harm", "finger-of-death", "befuddlement", "sunburst", "meteor-swarm", "scorching-ray", "shatter", "fireball", "lightning-bolt"];
  assert.deepEqual([...damage].sort(), [...DAMAGE].sort());
  assert.equal(damage.length, 30);
  assert.deepEqual([...heal].sort(), ["cure-wounds", "healing-word", "mass-cure-wounds", "mass-healing-word"]);
  assert.equal(heal.length, 4);
  // What it leaves alone: a spell that needs Concentration, a choice, a zone, a summon, a teleport, a reaction, or has a step the AI does not score.
  for (const id of ["bless", "hold-person", "shield-of-faith", "chromatic-orb", "moonbeam", "spirit-guardians", "web", "misty-step", "shield", "counterspell", "spare-the-dying", "revivify", "lesser-restoration", "dispel-magic", "hex", "find-familiar", "sleep", "command"]) {
    if (SPELLS[id]) assert.equal(aiCastable(SPELLS[id]), null, id);
  }
});

for (const grid of GRIDS) {
  test(`${grid}: Tavin, set aside under standIn, one goblin at 60 ft and no hard fight: Fire Bolt, not Magic Missile`, () => {
    const s = scene(grid, (s) => goblinAt(s, WIZARD, 12), WIZARD);
    standIn(s, WIZARD);
    const { a } = step(s, WIZARD);
    assert.equal(a.type, "cast");
    assert.equal(a.spell, "fire-bolt");
    assert.equal(a.slot, undefined);
    assert.equal(s.entities[WIZARD].slots[1], 2, "no slot spent");
  });

  test(`${grid}: two goblins in a 15 ft cone of him and no ally in it: Burning Hands at the lowest slot; with Brenna in the cone it is not cast there`, () => {
    const place = (s, withBrenna) => {
      const w = s.entities[WIZARD], G = gridOf(s.map);
      const A = ring(s, WIZARD, 2).find((h) => fits(s, "goblin-warrior", h));
      const g1 = spawn(s, "goblin-warrior", A);
      const B = G.range(A, 1).filter((h) => G.dist(h, w.pos) >= 2 && G.dist(h, w.pos) <= 3 && G.dist(h, A) === 1 && fits(s, "goblin-warrior", h)).find((h) => { const t = structuredClone(s); spawn(t, "goblin-warrior", h); return caughtBy(t, WIZARD, "burning-hands", t.entities[g1].pos, SPELLS).length === 2; });
      assert.ok(B, "a second goblin in the cone");
      const g2 = spawn(s, "goblin-warrior", B);
      if (withBrenna) {
        // Brenna stands inside the cone, between Tavin and the goblins.
        const t = structuredClone(s);
        const inside = G.range(w.pos, 1).filter((h) => G.dist(h, w.pos) === 1 && !Object.values(s.entities).some((o) => o.pos.q === h.q && o.pos.r === h.r)).find((h) => { put(t, FIGHTER, h); return caughtBy(t, WIZARD, "burning-hands", s.entities[g1].pos, SPELLS).includes(FIGHTER); });
        assert.ok(inside, "a place for Brenna in the cone");
        put(s, FIGHTER, inside);
      }
      return { g1, g2 };
    };
    const s = scene(grid, (s) => place(s, false), WIZARD);
    standIn(s, WIZARD);
    const a = aiStep(s, WIZARD);
    assert.equal(what(a), "burning-hands");
    assert.equal(a.slot, undefined, "the lowest slot (level 1)");
    assert.equal(caughtBy(s, WIZARD, "burning-hands", a.hex, SPELLS).filter((id) => s.entities[id].side === "foe").length, 2, "it caught both");
    assert.ok(!caughtBy(s, WIZARD, "burning-hands", a.hex, SPELLS).some((id) => s.entities[id].side === "party"));
    const t = scene(grid, (s) => place(s, true), WIZARD);
    const b = aiStep(t, WIZARD);
    assert.ok(b, "he has a step");
    if (b.spell === "burning-hands") assert.ok(!caughtBy(t, WIZARD, "burning-hands", b.hex, SPELLS).some((id) => t.entities[id].side === "party"), "no ally in it");
    assert.equal(what(b), "fire-bolt", "the cone with Brenna in it is not cast: Fire Bolt");
  });

  test(`${grid}: a goblin beside him: Fire Bolt at Disadvantage is worth less than the dagger, so he stabs`, () => {
    const s = scene(grid, (s) => goblinAt(s, WIZARD, 1), WIZARD);
    const a = aiStep(s, WIZARD);
    assert.equal(a.type, "attack");
    assert.equal(a.attack, "dagger");
    // The same goblin a step away: no enemy within 5 ft, no Disadvantage, and the cantrip is worth more than the dagger he cannot reach.
    const t = scene(grid, (s) => goblinAt(s, WIZARD, 3), WIZARD);
    assert.equal(aiStep(t, WIZARD).spell, "fire-bolt");
  });

  test(`${grid}: a hard fight (three goblins, no two in one cone, against him alone): Magic Missile at the nearest goblin`, () => {
    const make = (s) => {
      for (const id of [FIGHTER, "rogue", CLERIC]) ok(apply(s, { type: "remove", actor: id }, DM));
      const near = goblinAt(s, WIZARD, 6), mid = goblinAt(s, WIZARD, 8, 8), far = goblinAt(s, WIZARD, 10, 16);
      return { near, mid, far };
    };
    const s = scene(grid, make, WIZARD);
    const foes = Object.keys(s.entities).filter((id) => s.entities[id].side === "foe");
    const near = foes.reduce((a, id) => (apartOf(s, id) < apartOf(s, a) ? id : a));
    const a = step(s, WIZARD).a;
    assert.equal(what(a), "magic-missile");
    assert.deepEqual(a.targets, [near, near, near]);
    assert.equal(a.slot, undefined);
  });
}
const apartOf = (s, id) => apartFor(s, s.entities[WIZARD], s.entities[id]);

for (const grid of GRIDS) {
  // Brenna at 0 Hit Points; Odessa's turn; one goblin at 60 ft that her mace cannot reach.
  const odessa = (setup) => scene(grid, (s) => { goblinAt(s, CLERIC, 12); setup?.(s); }, CLERIC);
  const brennaAt = (s, d) => { const h = ring(s, CLERIC, d).find((c) => !Object.values(s.entities).some((o) => o.pos.q === c.q && o.pos.r === c.r) && fits(s, "goblin-warrior", c)); assert.ok(h, `a place ${d} cells from Odessa`); put(s, FIGHTER, h); down(s, FIGHTER); };

  test(`${grid}: Odessa with Brenna at 0 Hit Points 40 ft away: Healing Word (Bonus Action) on Brenna, then Sacred Flame, in one turn`, () => {
    const s = odessa((s) => brennaAt(s, 8));
    standIn(s, CLERIC);
    const first = step(s, CLERIC).a;
    assert.deepEqual(first, { type: "cast", actor: CLERIC, spell: "healing-word", target: FIGHTER });
    assert.ok(s.entities[FIGHTER].hp > 0, "Brenna is up");
    assert.equal(s.entities[CLERIC].slots[1], 1);
    const second = step(s, CLERIC).a;
    assert.equal(second.spell, "sacred-flame", "one slot a turn: a cantrip, not Cure Wounds");
    assert.equal(s.entities[CLERIC].slots[1], 1);
  });

  test(`${grid}: Brenna at 0 beside her and no Healing Word: Cure Wounds with no move; 20 ft away: a move, then Cure Wounds`, () => {
    const noWord = (s) => { s.entities[CLERIC].spells = s.entities[CLERIC].spells.filter((x) => x !== "healing-word"); };
    const near = odessa((s) => { noWord(s); brennaAt(s, 1); });
    const a = step(near, CLERIC).a;
    assert.deepEqual(a, { type: "cast", actor: CLERIC, spell: "cure-wounds", target: FIGHTER });
    const far = odessa((s) => { noWord(s); brennaAt(s, 4); });
    const m = step(far, CLERIC).a;
    assert.equal(m.type, "move");
    assert.ok(apartFor(far, far.entities[CLERIC], far.entities[FIGHTER]) <= 1, "it ends beside her");
    const c = step(far, CLERIC).a;
    assert.deepEqual(c, { type: "cast", actor: CLERIC, spell: "cure-wounds", target: FIGHTER });
  });

  test(`${grid}: the kept slot: one level 1 slot and a healing spell in a hard fight is not spent on Guiding Bolt, but is on Healing Word for a downed ally; one slot a turn`, () => {
    const sheet = (slots, spells) => (s) => { s.entities[CLERIC].spells = spells; s.entities[CLERIC].slots = { 1: slots }; };
    // A hard fight by count: five goblins against four.
    const hard = (s) => { for (const nth of [0, 5, 10, 15, 20]) goblinAt(s, CLERIC, 8, nth); };
    const lone = scene(grid, (s) => { sheet(1, ["guiding-bolt", "healing-word"])(s); hard(s); }, CLERIC);
    const none = aiStep(lone, CLERIC);
    assert.ok(!none || !(none.type === "cast"), `the last slot is kept: ${json(none)}`);
    // The same with two slots: one is spent.
    const two = scene(grid, (s) => { sheet(2, ["guiding-bolt", "healing-word"])(s); hard(s); }, CLERIC);
    assert.equal(aiStep(two, CLERIC).spell, "guiding-bolt");
    // A downed ally: the kept slot is for her.
    const ally = scene(grid, (s) => { sheet(1, ["guiding-bolt", "healing-word"])(s); hard(s); brennaAt(s, 6); }, CLERIC);
    assert.equal(aiStep(ally, CLERIC).spell, "healing-word");
    // One slot a turn: after Healing Word the level 1 slot is spent, so a cantrip, not Guiding Bolt.
    const turn = scene(grid, (s) => { sheet(2, ["sacred-flame", "guiding-bolt", "healing-word"])(s); hard(s); brennaAt(s, 6); }, CLERIC);
    assert.equal(step(turn, CLERIC).a.spell, "healing-word");
    assert.equal(step(turn, CLERIC).a.spell, "sacred-flame");
  });

  test(`${grid}: a Concentration spell already running (Odessa's Shield of Faith on Brenna) stays running through her turns`, () => {
    const s = odessa();
    ok(apply(s, { type: "cast", actor: CLERIC, spell: "shield-of-faith", target: FIGHTER }, DM));
    const going = () => (s.effects ?? []).some((fx) => fx.spell === "shield-of-faith" && fx.source === CLERIC && fx.parts.some((p) => !p.ended));
    assert.ok(going(), "it is running");
    const sent = [];
    for (let turns = 0; turns < 3; turns++) {
      for (let i = 0; i < 40 && current(s) !== CLERIC; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
      for (let n = 0; n < 8 && s.encounter && current(s) === CLERIC; n++) { const { a } = step(s, CLERIC); sent.push(a); if (a.type === "endTurn") break; }
      assert.ok(going(), `still running after her turn ${turns + 1}`);
    }
    assert.ok(sent.every((a) => a.spell !== "shield-of-faith"), "it never casts another Concentration spell");
  });
}

const PLAYERS = [U1, U2, U3];
const seen = (s, r) => PLAYERS.map((u) => json([viewEvents(r.events, s, u), view(s, u)]));
for (const grid of GRIDS) {
  test(`${grid}: hidden information: a goblin the party does not know of beside the cone's best spot changes nothing the AI chooses or any player sees, until the cast finds it`, () => {
    const make = (hereAtCone) => {
      const s = table(grid);
      ok(apply(s, { type: "setting", key: "unseenTurns", value: "quiet" }, DM));
      const w = s.entities[WIZARD], G = gridOf(s.map);
      const A = ring(s, WIZARD, 2).find((h) => fits(s, "goblin-warrior", h));
      const g1 = spawn(s, "goblin-warrior", A);
      const B = G.range(A, 1).filter((h) => G.dist(h, w.pos) >= 2 && G.dist(h, w.pos) <= 3 && fits(s, "goblin-warrior", h)).find((h) => { const t = structuredClone(s); spawn(t, "goblin-warrior", h); return caughtBy(t, WIZARD, "burning-hands", t.entities[g1].pos, SPELLS).length === 2; });
      const g2 = spawn(s, "goblin-warrior", B);
      // The lurker: in the cone behind the two in one world, far off in the other.
      const inCone = G.range(A, 2).filter((h) => fits(s, "goblin-warrior", h)).find((h) => { const t = structuredClone(s); spawn(t, "goblin-warrior", h); return caughtBy(t, WIZARD, "burning-hands", t.entities[g1].pos, SPELLS).length === 3; });
      assert.ok(inCone, "a place in the cone for the lurker");
      const far = ring(s, WIZARD, 10).find((h) => fits(s, "goblin-warrior", h));
      const lurker = spawn(s, "goblin-warrior", hereAtCone ? inCone : far, { name: "Lurker" });
      s.entities[lurker].hiding = { dc: 30 };
      return { s, g1, g2, lurker };
    };
    const A = make(true), B = make(false);
    assert.equal(A.lurker, B.lurker, "the same ids in both worlds");
    const fa = ok(apply(A.s, { type: "startEncounter", center: A.s.entities[WIZARD].pos, radius: 24 }, DM)), fb = ok(apply(B.s, { type: "startEncounter", center: B.s.entities[WIZARD].pos, radius: 24 }, DM));
    assert.ok(A.s.encounter.order.some((o) => o.id === A.lurker) && A.s.entities[A.lurker].hiding, "the lurker is in the fight, hiding");
    assert.deepEqual(seen(A.s, fa), seen(B.s, fb), "the fight starts the same for every player");
    for (let i = 0; i < 80 && current(A.s) !== WIZARD; i++) {
      const id = current(A.s);
      assert.equal(current(B.s), id);
      assert.deepEqual(seen(A.s, ok(apply(A.s, { type: "endTurn", actor: id }, DM))), seen(B.s, ok(apply(B.s, { type: "endTurn", actor: id }, DM))), `${id}'s turn`);
    }
    assert.equal(current(B.s), WIZARD);
    const a = aiStep(A.s, WIZARD), b = aiStep(B.s, WIZARD);
    assert.deepEqual(a, b, "the same first action in both worlds");
    assert.equal(a.spell, "burning-hands");
    assert.deepEqual(PLAYERS.map((u) => json(view(A.s, u))), PLAYERS.map((u) => json(view(B.s, u))), "every player sees the same before it");
    const ra = ok(apply(A.s, a, DM)), rb = ok(apply(B.s, b, DM));
    // In A the cone catches the lurker as the engine's area rule has it (the AI did not know it was there); in B it is far off.
    assert.ok(A.s.entities[A.lurker].hp < 10 || A.s.entities[A.lurker].dead, "the lurker was caught by the cone in A");
    assert.equal(B.s.entities[B.lurker].hp, 10, "and not in B");
    assert.ok(ra.events.some((e) => e.type === "damage" && (e.id === A.lurker || e.target === A.lurker)), json(ra.events.filter((e) => e.type === "damage")));
  });
}

test("determinism: the same state gives the same answer on two copies, and the AI changes nothing it reads", () => {
  for (const grid of GRIDS) {
    for (const [id, make] of [
      [WIZARD, (s) => { goblinAt(s, WIZARD, 2); goblinAt(s, WIZARD, 2, 1); goblinAt(s, WIZARD, 9); }],
      [CLERIC, (s) => { goblinAt(s, CLERIC, 8); put(s, FIGHTER, ring(s, CLERIC, 3)[0]); down(s, FIGHTER); }],
    ]) {
      const s = scene(grid, make, id), before = json(s);
      const one = aiStep(structuredClone(s), id), two = aiStep(structuredClone(s), id), here = aiStep(s, id);
      assert.deepEqual(one, two);
      assert.deepEqual(one, here);
      assert.equal(json(s), before, "the state it reads is unchanged");
    }
  }
});

test("who is played by the casting AI, and what stops it", () => {
  const s = scene("hex", (s) => goblinAt(s, WIZARD, 12), WIZARD);
  const e = s.entities[WIZARD], foes = Object.values(s.entities).filter((o) => o.side === "foe");
  assert.equal(casterStep(s, e, foes)?.spell, "fire-bolt");
  const was = (f) => { const t = structuredClone(s); f(t, t.entities[WIZARD]); return casterStep(t, t.entities[WIZARD], foes.map((o) => t.entities[o.id])); };
  assert.equal(was((t, w) => { w.spells = []; }), null, "no spells");
  assert.equal(was((t, w) => { w.actions = [{ id: "x" }]; }), null, "a creature with actions is played from them");
  assert.equal(was((t, w) => { w.form = { name: "Wolf" }; }), null, "not in a form");
  assert.equal(was((t, w) => { t.effects = [{ id: "fx1", source: WIZARD, name: "Rage", noSpells: true, parts: [] }]; }), null, "not under an effect that stops spells");
  assert.equal(was((t, w) => { w.cond.stunned = true; }), null, "not Incapacitated");
  assert.equal(was((t) => { t.encounter.budget.action = 0; }), null, "no action left");
  assert.equal(was((t) => { t.encounter.budget.attacks = [[{ action: null, left: 1 }]]; }), null, "in the middle of an Attack action");
  assert.equal(was((t) => { t.encounter.flags[`surge:${WIZARD}`] = true; t.encounter.flags[`magic:${WIZARD}`] = true; }), null, "Action Surge's action can't cast a spell after a Magic action");
  assert.equal(was((t, w) => { w.spells = ["magic-missile"]; }), null, "a slot spell with no hard fight is not worth a slot");
  assert.equal(was((t, w) => { w.spells = ["magic-missile"]; w.slots = { 1: 0 }; }), null, "no slot");
  // A companion that can't attack casts no spell with an attack roll (Fire Bolt) but may cast one without (Magic Missile in a hard fight).
  assert.equal(casterStep(s, e, foes, { noAttack: true }), null);
  const hard = structuredClone(s);
  for (const id of ["fighter", "rogue", CLERIC]) hard.entities[id].hp = 0;
  const hf = Object.values(hard.entities).filter((o) => o.side === "foe");
  assert.equal(casterStep(hard, hard.entities[WIZARD], hf, { noAttack: true })?.spell, "magic-missile");
  assert.equal(casterStep(hard, hard.entities[WIZARD], hf)?.spell, "magic-missile");
});

for (const grid of GRIDS) {
  test(`${grid}: a badly hurt ally is healed by a Bonus Action spell with a spare slot, by an action spell only if it heals more than the damage; the last slot is kept`, () => {
    const hurt = (spells, slots) => scene(grid, (s) => { goblinAt(s, CLERIC, 8); s.entities.rogue.hp = 2; put(s, "rogue", ring(s, CLERIC, 1).find((h) => fits(s, "goblin-warrior", h))); s.entities[CLERIC].spells = spells; s.entities[CLERIC].slots = { 1: slots }; }, CLERIC);
    assert.deepEqual(aiStep(hurt(["sacred-flame", "healing-word"], 2), CLERIC), { type: "cast", actor: CLERIC, spell: "healing-word", target: "rogue" });
    assert.equal(aiStep(hurt(["sacred-flame", "healing-word"], 1), CLERIC).spell, "sacred-flame", "the last slot is kept for a creature at 0: a cantrip");
    assert.deepEqual(aiStep(hurt(["sacred-flame", "cure-wounds"], 2), CLERIC), { type: "cast", actor: CLERIC, spell: "cure-wounds", target: "rogue" }, "8 Hit Points back beat a cantrip");
    assert.equal(aiStep(hurt(["sacred-flame", "cure-wounds"], 1), CLERIC).spell, "sacred-flame");
  });
}

// Every spell on the list, cast alone by a high-level caster with every slot, in a fight where it is worth a slot: the AI sends it and the engine
// accepts it (a refusal would waste the turn). The foes stand where the spell can be aimed: beside the caster for a Touch spell, beyond the
// radius of a sphere (it would catch the caster, who is not a candidate there), near for a cone or a cube from the caster.
const SQUARE_ROOM = 11;                                          // the room is 15 squares wide: a sphere with a radius of more than 9 squares does not fit
for (const grid of GRIDS) {
  test(`${grid}: every spell the AI casts is accepted by the engine when it casts it`, () => {
    const ids = Object.values(SPELLS).filter((sp) => aiCastable(sp)).map((sp) => sp.id);
    const cast = [], skipped = [];
    for (const id of ids) {
      const sp = SPELLS[id], kind = aiCastable(sp);
      const round = sp.area && ["sphere", "cylinder"].includes(sp.area.shape) && sp.range > 0;
      const d = sp.aim === "creature" && sp.range <= 5 ? 1 : round ? sp.area.size / 5 + 1 : 3;
      if (grid === "square" && d > SQUARE_ROOM) { skipped.push(id); continue; }
      const s = scene(grid, (s) => {
        const w = s.entities[WIZARD];
        Object.assign(w, { level: 17, spells: [id], slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 }, attacks: [] });
        for (const o of [FIGHTER, "rogue", CLERIC]) ok(apply(s, { type: "remove", actor: o }, DM));
        for (let n = 0; n < 4; n++) goblinAt(s, WIZARD, d);
        if (kind === "heal") s.entities[WIZARD].hp = 1;
      }, WIZARD);
      const a = aiStep(s, WIZARD);
      assert.equal(a?.type, "cast", `${id} is cast (foes ${d} cells off)`);
      assert.equal(a.spell, id);
      const r = apply(s, a, DM);
      assert.ok(r.ok, `${id}: ${json(a)} was refused: ${r.error}`);
      cast.push(id);
    }
    assert.equal(cast.length + skipped.length, ids.length);
    assert.deepEqual(skipped, grid === "square" ? ["circle-of-death", "freezing-sphere", "sunburst"] : [], "only what does not fit the room is left out");
  });
}

// ---------- fix round 1 (review of #488) ----------
for (const grid of GRIDS) {
  test(`${grid}: after it has cast, a caster does not walk toward the foes (amendment 2.1)`, () => {
    const s = scene(grid, (s) => goblinAt(s, WIZARD, 12), WIZARD);
    assert.equal(step(s, WIZARD).a.spell, "fire-bolt");
    assert.deepEqual(aiStep(s, WIZARD), { type: "endTurn", actor: WIZARD }, "no move toward the goblin with the dagger");
    const t = scene(grid, (s) => { for (const n of [0, 1, 2]) goblinAt(s, WIZARD, 2, n); }, WIZARD);
    assert.equal(step(t, WIZARD).a.spell, "burning-hands");
    assert.deepEqual(aiStep(t, WIZARD), { type: "endTurn", actor: WIZARD });
  });

  test(`${grid}: a cantrip out of range is cast from the farthest place that reaches, not from beside the foe (amendment 2.2)`, () => {
    const s = scene(grid, (s) => { s.entities[WIZARD].spells = ["poison-spray"]; goblinAt(s, WIZARD, 7); }, WIZARD);
    const g = Object.keys(s.entities).find((id) => s.entities[id].side === "foe");
    const m = step(s, WIZARD).a;
    assert.equal(m.type, "move");
    assert.equal(apartFor(s, s.entities[WIZARD], s.entities[g]), 6, "30 ft, the cantrip's range, and no nearer");
    assert.equal(step(s, WIZARD).a.spell, "poison-spray");
  });
}
test("hex: no place in reach this turn from which Sacred Flame reaches: the cleric ends her turn, she does not Dash into melee", () => {
  const s = scene("hex", (s) => { for (const id of [FIGHTER, "rogue", "wizard"]) ok(apply(s, { type: "remove", actor: id }, DM)); s.entities[CLERIC].speed = 10; goblinAt(s, CLERIC, 16); }, CLERIC);
  assert.deepEqual(aiStep(s, CLERIC), { type: "endTurn", actor: CLERIC });
});

for (const grid of GRIDS) {
  test(`${grid}: slots (amendment 1): a level 17 wizard alone against one goblin casts a cantrip; against three, of the slot spells within a quarter of the best it casts the lowest`, () => {
    const big = (spells) => (s) => {
      Object.assign(s.entities[WIZARD], { level: 17, spells, slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 } });
      for (const id of [FIGHTER, "rogue", CLERIC]) ok(apply(s, { type: "remove", actor: id }, DM));
    };
    const one = scene(grid, (s) => { big(["finger-of-death", "fire-bolt", "fireball"])(s); goblinAt(s, WIZARD, 5); }, WIZARD);
    assert.equal(aiStep(one, WIZARD).spell, "fire-bolt");
    const three = scene(grid, (s) => { big(["scorching-ray", "magic-missile"])(s); s.entities[WIZARD].attacks = []; for (const n of [0, 2, 4]) goblinAt(s, WIZARD, 6, n); }, WIZARD);
    const a = aiStep(three, WIZARD);
    assert.equal(a.spell, "magic-missile", "Scorching Ray scores more (13.7 against 10.5) but Magic Missile is within a quarter of it and a lower slot");
    assert.equal(a.slot, undefined);
    // Three foes able to act against one outnumber it; one foe Incapacitated does not count.
    const stunned = structuredClone(three);
    for (const id of Object.keys(stunned.entities)) if (stunned.entities[id].side === "foe") stunned.entities[id].cond.stunned = true;
    assert.equal(aiStep(stunned, WIZARD)?.type === "cast" && aiStep(stunned, WIZARD).spell, false, "foes that cannot act do not make a hard fight");
  });

  test(`${grid}: a party creature breaks a tie between foes by id, never by their Hit Points; a monster's rule is as ever`, () => {
    const hp = (a, b) => scene(grid, (s) => { goblinAt(s, FIGHTER, 1); goblinAt(s, FIGHTER, 1); const ids = Object.keys(s.entities).filter((id) => s.entities[id].side === "foe"); s.entities[ids[0]].hp = a; s.entities[ids[1]].hp = b; }, FIGHTER);
    const x = aiStep(hp(7, 3), FIGHTER), y = aiStep(hp(3, 7), FIGHTER);
    assert.equal(x.type, "attack");
    assert.equal(x.target, y.target, "the same foe whichever has fewer Hit Points");
    assert.equal(x.target, Object.keys(hp(7, 3).entities).filter((id) => hp(7, 3).entities[id].side === "foe")[0]);
  });

  test(`${grid}: close combat is read from what the party knows: an unseen caster is assumed seen by the foe beside it`, () => {
    const s = scene(grid, (s) => goblinAt(s, WIZARD, 1), WIZARD);
    ok(apply(s, { type: "condition", actor: WIZARD, condition: "invisible" }, DM));
    assert.equal(aiStep(s, WIZARD).attack, "dagger", "the party cannot know whether the goblin sees an Invisible wizard: it assumes it does");
  });
}

test("sight los: a stand-in fighter does not walk toward a foe behind a shut door it cannot know of; the same fight under rooms does", () => {
  const make = (sight) => {
    const s = table("square");
    ok(apply(s, { type: "setting", key: "sight", value: sight }, DM));
    put(s, FIGHTER, { q: 12, r: 10 });
    spawn(s, "goblin-warrior", { q: 20, r: 10 }, { name: "Goblin" });
    ok(apply(s, { type: "startEncounter", center: { q: 14, r: 10 }, radius: 12 }, DM));
    for (let i = 0; i < 80 && current(s) !== FIGHTER; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    return s;
  };
  assert.deepEqual(aiStep(make("los"), FIGHTER), { type: "endTurn", actor: FIGHTER });
  assert.equal(aiStep(make("rooms"), FIGHTER).type, "move");
});
