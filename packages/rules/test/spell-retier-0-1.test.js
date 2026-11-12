// The spell re-tiering pass, levels 0 and 1 (docs/DEBT.md, Spells): Chromatic Orb and Grease.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
function field() {
  const s = newGame(5);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.encounter = null; s.settings.autoEngage = false;
  ok(apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM));
  Object.assign(s.entities.wizard, { slots: { 1: 4, 2: 3 }, slotsMax: { 1: 4, 2: 3 } });
  s.entities.wizard.spells.push("chromatic-orb", "grease");
  return s;
}
const spawn = (s, q, r) => { const e = s.entities[ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 300; return e; };
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };

test("Chromatic Orb: a spell attack for 3d8 of the chosen type, more with a higher slot", () => {
  const sp = SPELLS["chromatic-orb"];
  assert.equal(sp.def.tier, "assist");
  for (let seed = 1, hit = false; seed < 200 && !hit; seed++) {
    const s = field(); s.rng = seed;
    const g = spawn(s, 3, 0);
    ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM)); turnOf(s, "wizard");
    assert.match(apply(s, { type: "cast", actor: "wizard", spell: "chromatic-orb", target: g.id }, DM).error, /Choose a damage type/);
    const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "chromatic-orb", target: g.id, choice: "cold", slot: 2 }, DM));
    const d = r.events.find((e) => e.type === "damage");
    if (!d) continue;
    hit = true;
    assert.equal(d.dtype, "cold");
    assert.ok(d.amount >= 4 && d.amount <= 32, "4d8 with a level 2 slot");
    assert.ok(r.events.some((e) => e.type === "manual" && /leaps|leap/.test(e.text)), "the DM is told about the leap");
  }
  assert.equal(apply(field(), { type: "cast", actor: "wizard", spell: "chromatic-orb", target: "wizard", choice: "radiant" }, DM).ok, false, "radiant is not one of the six");
});

test("Grease: a zone; creatures in it make a Dexterity save or fall Prone, as it appears and when entering or ending a turn there", () => {
  const sp = SPELLS.grease;
  assert.deepEqual([sp.def.tier, sp.def.zone.on, sp.def.zone.atCast], ["assist", ["enter", "turnEnd"], true]);
  const s = field();
  const a = spawn(s, 4, 0), b = spawn(s, 4, 4);
  for (const g of [a, b]) g.abil.dex = 1;
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }, DM)); turnOf(s, "wizard");
  const cast = ok(apply(s, { type: "cast", actor: "wizard", spell: "grease", hex: { q: 4, r: 0 } }, DM));
  assert.ok(cast.events.some((e) => e.type === "save" && e.id === a.id), "a creature in it as it appears saves");
  assert.equal(cast.events.some((e) => e.type === "save" && e.id === b.id), false);
  assert.ok(s.effects.find((x) => x.name === "Grease").zone.hexes.length >= 4);
});
