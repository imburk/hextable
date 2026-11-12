// A spell that marks or curses a hostile creature is hostile (Hex, Hunter's Mark): cast at a foe outside
// a fight it rolls initiative. Bless, Guidance, Shield of Faith and healing stay friendly.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { apply } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
function field() {
  const s = newGame(5);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.encounter = null; s.settings.autoEngage = false;
  ok(apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "cleric", to: { q: 1, r: 0 } }, DM));
  Object.assign(s.entities.wizard, { slots: { 1: 4 }, slotsMax: { 1: 4 } });
  s.entities.wizard.spells.push("hex", "hunters-mark", "bless");
  const goblin = s.entities[ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 3, r: 0 } }, DM)).events[0].id];
  return { s, goblin };
}

test("Hex and Hunter's Mark are hostile; Bless, Guidance, Shield of Faith and healing are not", () => {
  for (const id of ["hex", "hunters-mark"]) assert.equal(SPELLS[id].harmful, true, id);
  for (const id of ["bless", "guidance", "shield-of-faith", "cure-wounds", "healing-word", "false-life", "mage-armor"]) if (SPELLS[id]) assert.equal(SPELLS[id].harmful, false, id);
  // Hex's other part (Disadvantage on checks) was never what made it friendly.
  for (const [id, sp] of Object.entries(SPELLS)) if (sp.def.effects.some((st) => st.modifier?.against)) assert.equal(sp.harmful, true, id);
});

test("Hunter's Mark and Hex cast at a foe outside a fight start one", () => {
  for (const [spell, extra] of [["hunters-mark", {}], ["hex", { choice: "wis" }]]) {
    const { s, goblin } = field();
    assert.equal(s.encounter, null);
    const r = apply(s, { type: "cast", actor: "wizard", spell, target: goblin.id, ...extra }, DM);
    assert.ok(r.ok, r.error);
    assert.ok(s.encounter, `${spell} rolls initiative`);
  }
});

test("Bless on an ally outside a fight starts none", () => {
  const { s } = field();
  ok(apply(s, { type: "cast", actor: "wizard", spell: "bless", targets: ["cleric"] }, DM));
  assert.equal(s.encounter, null);
});
