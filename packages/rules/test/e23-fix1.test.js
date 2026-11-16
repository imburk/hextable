// Fix round 1 of #373 (the independent review), on hexes and the square room:
//   M1: a reaction whose trigger says "that you can see" (Counterspell: "when you see a creature within 60 feet of
//       yourself casting a spell", SRD 25599-25601) is never offered or taken by a party creature against a creature the
//       party does not know of (the DM's hidden switch included). Twin runs: with the caster hidden, every player's events
//       and view are those of a world where the wizard has no Counterspell. Shield ("when you are hit by an attack roll",
//       30659-30660) needs no sight and is unchanged. In a fight, a hiding caster's Verbal component gives it away first
//       (an existing rule), and then it may be countered.
//   L1: apply()'s record keeps an event's own `unseen` with the creatures still unknown at the end (engine.js `record`):
//       with a hidden mage and a hiding goblin in the Fireball's area, the recorded view of every event equals the live view.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as E from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { viewEvents, view } from "../src/view.js";
import { squareRoom } from "./fixtures/square-room.js";
import { kit, DM, U3, PLAYERS, GRIDS, SPOTS, WARD, json, ok } from "./e23-kit.js";

const { apply, current } = E;
const K = kit({ apply, current, makeEntity: E.makeEntity, derive, newGame, squareRoom });
// The world without Counterspell: the same wizard, its sheet without the spell.
function noCounter(grid, opts) {
  const s = K.table(grid, { ...opts, ward: { shield: "never" } });
  const w = s.entities.wizard, sheet = { ...WARD, spells: WARD.spells.filter((x) => x !== "counterspell") };
  s.entities.wizard = { ...E.makeEntity(derive(sheet).record, { id: "wizard", kind: "pc", side: "party", pos: w.pos }), owner: w.owner, ownerName: w.ownerName, hp: w.hp, maxHp: w.maxHp };
  s.entities.wizard.sheet = structuredClone(sheet);
  return s;
}
// A player's view with what the wizard knows and has set taken out (the one thing the two worlds differ in by design).
const strip = (v) => { const w = v.entities?.wizard; if (w) for (const k of ["spells", "sheet", "reactions"]) delete w[k]; if (v.reactions) delete v.reactions.wizard; return v; };
const seen = (s, r) => PLAYERS.map((u) => json([viewEvents(r.events, s, u), strip(view(s, u))]));

for (const grid of GRIDS) {
  for (const how of ["always", "ask"]) {
    test(`${grid}: M1, Counterspell ${how}: a hidden caster is not countered, and players see what they would if the wizard had none`, () => {
      for (const name of ["attack", "area", "conc"]) {
        const A = K.table(grid, { hidden: true, ward: { counterspell: how } }), B = noCounter(grid, { hidden: true });
        const slots = json(A.entities.wizard.slots);
        assert.deepEqual(PLAYERS.map((u) => json(strip(view(A, u)))), PLAYERS.map((u) => json(strip(view(B, u)))), "the tables look the same");
        const ra = ok(apply(A, K.CASTS[name](grid), DM)), rb = ok(apply(B, K.CASTS[name](grid), DM));
        assert.ok(!A.pending && A.encounter, `${name}: nobody was asked; the fight started`);
        assert.ok(!ra.events.some((e) => e.type === "reaction" || e.type === "reactionAsked" || e.type === "countered"), `${name}: ${json(ra.events.map((e) => e.type))}`);
        assert.equal(json(A.entities.wizard.slots), slots, "no slot spent");
        assert.equal(A.entities.wizard.reactionUsed, false, "no Reaction spent");
        assert.deepEqual(seen(A, ra), seen(B, rb), `${name}: every player, events and view`);
      }
    });
  }

  test(`${grid}: M1, the same caster not hidden is countered as before; Shield answers a hidden caster's hit (it needs no sight)`, () => {
    let countered = false;
    for (let seed = 1; seed <= 30 && !countered; seed++) {
      const s = K.table(grid, { seed, ward: { counterspell: "always" } }), r = ok(apply(s, K.CASTS.attack(grid), DM));
      assert.ok(r.events.some((e) => e.type === "reaction" && e.reaction === "counterspell"));
      countered = r.events.some((e) => e.type === "countered");
    }
    assert.ok(countered);
    let shielded = false;
    for (let seed = 1; seed <= 30 && !shielded; seed++) {
      const s = K.table(grid, { seed, hidden: true, ward: { shield: "always" } });
      const r = ok(apply(s, { type: "cast", actor: "mage", spell: "fire-bolt", target: "wizard" }, DM));
      shielded = r.events.some((e) => e.type === "reaction" && e.reaction === "shield");
    }
    assert.ok(shielded, "Shield against the hidden mage's hit");
  });

  test(`${grid}: M1 in a fight: a hiding caster in the order is given away by its Verbal component, then may be countered`, () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = K.table(grid, { seed, autoEngage: false, ward: { counterspell: "always" } });
      ok(apply(s, { type: "startEncounter", center: SPOTS[grid].fighter, radius: 9 }, DM));
      for (let i = 0; i < 20 && current(s) !== "mage"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
      s.entities.mage.hiding = { dc: 30 };
      const r = ok(apply(s, K.CASTS.attack(grid), DM));
      const out = r.events.findIndex((e) => e.type === "unhidden" && e.id === "mage"), re = r.events.findIndex((e) => e.type === "reaction" && e.reaction === "counterspell");
      assert.ok(out >= 0 && re > out, `found first, then countered: ${json(r.events.map((e) => e.type))}`);
      // Under the Wand (no components) there is nothing to see being cast: no Counterspell, and it stays hidden.
      const t = K.table(grid, { seed, autoEngage: false, ward: { counterspell: "always" } });
      ok(apply(t, { type: "startEncounter", center: SPOTS[grid].fighter, radius: 9 }, DM));
      for (let i = 0; i < 20 && current(t) !== "mage"; i++) ok(apply(t, { type: "endTurn", actor: current(t) }, DM));
      t.entities.mage.hiding = { dc: 30 };
      const w = ok(apply(t, K.CASTS.item(grid), DM));
      assert.ok(!w.events.some((e) => e.type === "reaction" || e.type === "reactionAsked"));
      assert.ok(t.entities.mage.hiding);
      return;
    }
  });

  test(`${grid}: L1: a hidden mage's Fireball catching a hiding goblin: the record tells every player what the live view told`, () => {
    const s = K.table(grid, { hidden: true });
    const F = SPOTS[grid].fighter, at = grid === "hex" ? { q: F.q, r: F.r - 2 } : { q: F.q, r: F.r - 2 };
    const g = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at }, DM)).events.find((e) => e.type === "spawned").id;
    s.entities[g].hiding = { dc: 30 };
    const tl = s.timeline.length, r = ok(apply(s, K.CASTS.area(grid), DM));
    assert.ok(r.events.find((e) => e.type === "cast").targets.includes(g), "the goblin is in the area");
    assert.ok(s.entities[g].hiding, "and still hiding after");
    for (const u of PLAYERS) {
      const live = viewEvents(r.events, s, u), told = viewEvents(s.timeline.slice(tl), s, u).map(({ t, ...e }) => e);
      assert.deepEqual(told, live, `${u.userId}: the record as the live view`);
      assert.ok(!told.some((e) => e.type === "cast"), "no cast event naming the hidden mage");
    }
    assert.deepEqual([...s.timeline.find((e, i) => i >= tl && e.type === "cast").unseen].sort(), ["mage", g].sort(), "both kept");
  });
}
