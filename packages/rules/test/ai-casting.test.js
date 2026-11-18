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
import { DM, GRIDS, U1, U2, U3, caughtBy, fits, goblinAt, json, ok, put, ring, scene, spawn, standIn, step } from "./ai-casting-kit.js";

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
    // A hard fight by count: four goblins against four.
    const hard = (s) => { for (const nth of [0, 6, 12, 18]) goblinAt(s, CLERIC, 8, nth); };
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
