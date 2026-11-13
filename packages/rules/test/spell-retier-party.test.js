// The party-spells pass (issue #159): the spells the owner's party prepares, raised as far as the vocabulary allows.
// Shining Smite moved from manual to assist; the rest of the working set was read against the SRD and left where it is.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { apply, current } from "../src/engine.js";
import { modifiers } from "../src/modifiers.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
function field() {
  const s = newGame(5);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.encounter = null; s.settings.autoEngage = false;
  ok(apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM));
  Object.assign(s.entities.wizard, { slots: { 1: 4, 2: 3, 3: 3, 4: 2 }, slotsMax: { 1: 4, 2: 3, 3: 3, 4: 2 }, hp: 500, maxHp: 500 });
  s.entities.wizard.spells.push("shining-smite");
  return s;
}
const spawn = (s, q, r) => { const e = s.entities[ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 300; return e; };
const turnOf = (s, id) => { for (let i = 0; i < 60 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };

test("Shining Smite: assist, with the damage and the Advantage run by the engine and the trigger and the light left to the DM", () => {
  const d = SPELLS["shining-smite"].def;
  assert.deepEqual([d.tier, d.checked, d.level, d.time, d.concentration, d.duration], ["assist", true, 2, "bonus", true, "1 minute"]);
  assert.deepEqual(d.higher, { slot: { damage: "1d6" } });
});

test("Shining Smite: 2d6 radiant to the target, a level 2 slot spent, and attack rolls against it have Advantage", () => {
  const s = field(), g = spawn(s, 1, 0);
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 14 }, DM)); turnOf(s, "wizard");
  const w = s.entities.wizard, hp0 = g.hp;
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "shining-smite", target: g.id }, DM));
  const dmg = r.events.find((e) => e.type === "damage" && e.target === g.id);
  assert.ok(dmg, "damage event");
  assert.equal(dmg.dtype, "radiant");
  assert.ok(hp0 - g.hp >= 2 && hp0 - g.hp <= 12, `2d6 is 2 to 12 (took ${hp0 - g.hp})`);
  assert.equal(w.slots[2], 2, "one level 2 slot spent");
  assert.ok(r.events.some((e) => e.type === "manual" && /Bright Light/.test(e.text)), "the DM is told about the light and Invisible");
  const m = modifiers(s, g, "attack.received", { attacker: w });
  assert.ok(m.advantage, "attacks against the target have Advantage");
});

test("Shining Smite: a level 3 slot adds 1d6, so 3d6", () => {
  const s = field(), g = spawn(s, 1, 0);
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 14 }, DM)); turnOf(s, "wizard");
  const hp0 = g.hp;
  ok(apply(s, { type: "cast", actor: "wizard", spell: "shining-smite", target: g.id, slot: 3 }, DM));
  assert.equal(s.entities.wizard.slots[3], 2);
  assert.ok(hp0 - g.hp >= 3 && hp0 - g.hp <= 18, `3d6 is 3 to 18 (took ${hp0 - g.hp})`);
});
