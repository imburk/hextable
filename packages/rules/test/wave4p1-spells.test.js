// Wave 4, part 1, of issue #786: Fly (assist), Feather Fall and Jump (kept manual, on purpose).
// Built to docs/specs/rules-expansion.md, "Build notes: wave 4 part 1". Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { apply, aloft } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
function field() {
  const s = newGame(5);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", 0, 0], ["fighter", -1, 0], ["rogue", 1, 0], ["cleric", 0, 1]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  const slots = { 1: 4, 2: 3, 3: 3, 4: 3 };
  Object.assign(s.entities.wizard, { slots: { ...slots }, slotsMax: { ...slots } });
  s.entities.wizard.spells.push("fly");
  return s;
}

test("tiers: Fly is assist; Feather Fall and Jump stay manual", () => {
  assert.equal(SPELLS.fly.def.tier, "assist");
  assert.equal(SPELLS["feather-fall"].def.tier, "manual");
  assert.equal(SPELLS.jump.def.tier, "manual");
});

test("Feather Fall's falling creatures must be ones the caster can see (SRD trigger)", () => {
  const text = JSON.stringify(SPELLS["feather-fall"].def.effects);
  assert.match(text, /creature the caster can see within 60 feet/);
});

test("Fly lends a Fly Speed of 60, and the creature falls when Concentration ends", () => {
  const s = field();
  const f = s.entities.fighter;
  ok(apply(s, { type: "cast", actor: "wizard", spell: "fly", slot: 3, targets: ["fighter"] }, DM));
  assert.equal(s.effects.length, 1);
  f.pos = { q: f.pos.q, r: f.pos.r, z: 30 };
  assert.ok(aloft(s, f), "the lent Fly Speed holds it up");
  const hp = f.hp;
  ok(apply(s, { type: "endEffect", actor: "wizard", effect: s.effects[0].id }, DM));
  assert.equal(f.pos.z, 0, "it fell to the ground when the spell ended");
  assert.ok(f.hp < hp, "and took fall damage");
});

test("Fly cast with a higher slot takes one more creature", () => {
  const s = field();
  const third = apply(structuredClone(s), { type: "cast", actor: "wizard", spell: "fly", slot: 3, targets: ["fighter", "rogue"] }, DM);
  assert.equal(third.ok, false, "a 3rd-level slot touches one creature");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "fly", slot: 4, targets: ["fighter", "rogue"] }, DM));
  assert.equal(s.effects.flatMap((fx) => fx.parts).filter((p) => p.modifier?.on === "speed.fly").length, 2);
});
