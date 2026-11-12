// Temporary Hit Points (DEBT C5, S5) and a Long Rest for monsters (DEBT M3).
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";
import { spellProfile } from "../src/effects.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PLAYER = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  ok(apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM));
  Object.assign(s.entities.wizard, { slots: { 1: 4, 2: 3, 3: 3 }, slotsMax: { 1: 4, 2: 3, 3: 3 } });
  s.entities.wizard.spells.push("false-life");
  return s;
}
const spawn = (s, monster, q, r) => s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id];

test("False Life: 2d4+4 Temporary Hit Points, 5 more per slot level", () => {
  const s = field(), w = s.entities.wizard;
  assert.equal(SPELLS["false-life"].def.tier, "auto");
  const res = ok(apply(s, { type: "cast", actor: "wizard", spell: "false-life" }, DM));
  const ev = res.events.find((e) => e.type === "tempHp");
  assert.ok(w.tempHp >= 6 && w.tempHp <= 12, `${w.tempHp}`);
  assert.equal(ev.amount, w.tempHp);
  w.tempHp = 0;
  ok(apply(s, { type: "cast", actor: "wizard", spell: "false-life", slot: 3 }, DM));
  assert.ok(w.tempHp >= 16 && w.tempHp <= 22, `${w.tempHp}`);
  assert.equal(w.hp, w.maxHp, "not healing: Hit Points are unchanged");
});

test("damage takes Temporary Hit Points first; they do not add up; healing does not restore them", () => {
  const s = field(), w = s.entities.wizard, g = spawn(s, "goblin-warrior", 1, 0);
  w.hp = w.maxHp = 20; w.tempHp = 5;
  g.hp = g.maxHp = 300;
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, DM));
  for (let i = 0; i < 30 && current(s) !== g.id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  let res, hit;
  for (let i = 0; i < 20; i++) {
    res = ok(apply(s, { type: "act", actor: g.id, action: g.actions.find((a) => a.effects?.[0]?.attack?.startsWith?.("melee") || a.effects?.[0]?.attack === "melee").id, target: "wizard" }, DM));
    hit = res.events.find((e) => e.type === "damage");
    if (hit) break;
    w.tempHp = 5; g.spent = {}; s.encounter.budget.action = 1; s.encounter.budget.attacks = undefined;
  }
  assert.ok(hit, "the goblin hit");
  const soak = Math.min(5, hit.amount);
  assert.equal(hit.temp, soak);
  assert.equal(w.tempHp, 5 - soak);
  assert.equal(w.hp, 20 - (hit.amount - soak));
  assert.equal("temp" in viewEvents(res.events, s, PLAYER).find((e) => e.type === "damage"), false, "players are sent the damage, not how it was soaked");
  // Not cumulative: the larger stays.
  s.encounter = null;
  w.tempHp = 10;
  const kept = ok(apply(s, { type: "cast", actor: "wizard", spell: "false-life" }, DM)).events.find((e) => e.type === "tempHp");
  assert.equal(kept.kept, true);
  assert.equal(w.tempHp, 10);
  // Healing restores Hit Points only.
  w.hp = 10;
  ok(apply(s, { type: "setHp", actor: "wizard", hp: 15 }, DM));
  assert.equal(w.tempHp, 10);
  // The DM setting Hit Points lower leaves Temporary Hit Points alone.
  ok(apply(s, { type: "setHp", actor: "wizard", hp: 12 }, DM));
  assert.deepEqual([w.hp, w.tempHp], [12, 10]);
  // A player sees their own Temporary Hit Points.
  s.entities.wizard.owner = "pat";
  assert.equal(view(s, PLAYER).entities.wizard.tempHp, 10);
  // A Long Rest ends them.
  ok(apply(s, { type: "rest" }, DM));
  assert.equal(w.tempHp, 0);
});

test("Temporary Hit Points do not wake a creature at 0, and soak massive damage before it counts", () => {
  const s = field(), w = s.entities.wizard;
  w.hp = 10; w.maxHp = 10; w.tempHp = 15;
  // 30 damage: 15 soaked, 15 to Hit Points: 5 past 0, which is less than the maximum, so down, not dead.
  ok(apply(s, { type: "setHp", actor: "wizard", hp: 10 }, DM));
  const spell = { id: "test-blast", name: "Test Blast", source: "test", level: 1, school: "evocation", classes: [], time: "action", range: 60,
    components: ["v"], duration: "instant", concentration: false, ritual: false, target: { creature: { count: 1 } },
    effects: [{ damage: "10d1+20", type: "force" }], tier: "auto", checked: false, text: "Thirty force." };
  assert.deepEqual(lintPack({ pack: { id: "t", name: "t", license: "x", attribution: "x" }, spells: [spell] }), []);
  SPELLS[spell.id] = spellProfile(spell);
  s.entities.cleric.spells.push(spell.id);
  Object.assign(s.entities.cleric, { slots: { 1: 2 }, slotsMax: { 1: 2 } });
  ok(apply(s, { type: "place", actor: "cleric", to: { q: 2, r: 0 } }, DM));
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, DM));
  for (let i = 0; i < 30 && current(s) !== "cleric"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  // A friendly blast: the engine refuses a harmful spell on an ally only if it is itself; fine here.
  ok(apply(s, { type: "cast", actor: "cleric", spell: spell.id, target: "wizard" }, DM));
  assert.equal(w.dead, false);
  assert.equal(w.hp, 0);
  assert.ok(w.cond.unconscious);
  assert.equal(w.tempHp, 0);
  delete SPELLS[spell.id];
});

test("Temporary Hit Points from a lasting effect vanish when it ends", () => {
  const s = field(), w = s.entities.wizard;
  const spell = { id: "test-ward", name: "Test Ward", source: "test", level: 1, school: "abjuration", classes: [], time: "action", range: "self",
    components: ["v"], duration: "1 minute", concentration: true, ritual: false, target: { self: true },
    effects: [{ tempHp: "+7" }], tier: "auto", checked: false, text: "Seven temporary hit points while it lasts." };
  assert.deepEqual(lintPack({ pack: { id: "t", name: "t", license: "x", attribution: "x" }, spells: [spell] }), []);
  SPELLS[spell.id] = spellProfile(spell);
  w.spells.push(spell.id);
  ok(apply(s, { type: "cast", actor: "wizard", spell: spell.id }, DM));
  assert.equal(w.tempHp, 7);
  const res = ok(apply(s, { type: "advanceTime", minutes: 2 }, DM));
  assert.equal(w.tempHp, 0);
  assert.ok(res.events.some((e) => e.type === "tempHp" && e.id === "wizard" && e.tempHp === 0));
  delete SPELLS[spell.id];
});

test("a Long Rest the DM gives monsters restores their uses per day and spent recharges", () => {
  const s = field(), d = spawn(s, "young-red-dragon", 6, 0);
  d.spent = { "fire-breath": true };
  d.charges = { something: 0 };
  d.hp = 3;
  ok(apply(s, { type: "rest" }, DM));
  assert.equal(d.hp, 3, "a rest of the party leaves monsters as they were");
  assert.match(apply(s, { type: "rest", ids: [] }, DM).error, /Name who rests/);
  ok(apply(s, { type: "rest", ids: [d.id, "wizard"] }, DM));
  assert.equal(d.hp, d.maxHp);
  assert.equal(d.spent, undefined);
  assert.equal(d.charges, undefined);
});
