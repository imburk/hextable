// Riders on monster attacks that the vocabulary can say since modifiers carry turn boundaries and single uses:
// "Disadvantage on the next attack roll it makes before the end of its next turn" (Ettin, Fire Giant),
// "Speed decreases by 10 feet until the end of its next turn" (Frost Giant, Merfolk Skirmisher, Steam Mephit),
// "the next attack roll made against the target has Advantage" (Worg).
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT } from "../src/content/index.js";
import { apply, current } from "../src/engine.js";
import { modifiers } from "../src/modifiers.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", 0, 0], ["fighter", 1, 0], ["rogue", 0, 1], ["cleric", 1, -1]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  return s;
}
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
// Spawn a monster beside the fighter, sure to hit, and have it use `action` until one hits.
function hitWith(tpl, action, { target = "fighter", at = { q: 2, r: 0 }, seed = 5 } = {}) {
  const s = field(seed);
  const m = s.entities[ok(apply(s, { type: "spawn", monster: tpl, at }, DM)).events[0].id];
  m.hp = m.maxHp = 500; m.actions.find((a) => a.id === action).effects[0].bonus = 100;
  s.entities[target].ac = 1; s.entities[target].hp = s.entities[target].maxHp = 500;
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }, DM));
  turnOf(s, m.id);
  for (let i = 0; i < 20; i++) {
    s.encounter.budget.action = 1; delete s.encounter.budget.attacks; s.encounter.flags = {};
    const ev = ok(apply(s, { type: "act", actor: m.id, action, target }, DM)).events;
    if (ev.some((e) => e.type === "damage")) return { s, m, t: s.entities[target], ev };
  }
  assert.fail("never hit");
}

test("an Ettin's Morningstar gives the target Disadvantage on its next attack roll, once", () => {
  const { s, t } = hitWith("ettin", "morningstar");
  assert.equal(modifiers(s, t, "attack.roll", {}, "attacker").disadvantage.length, 1);
  assert.equal(modifiers(s, t, "attack.roll", {}, "attacker").used.length, 1, "a single use, spent by the roll");
  assert.equal(modifiers(s, s.entities.wizard, "attack.roll", {}, "attacker").disadvantage.length, 0);
});

test("a Fire Giant's Hammer Throw pushes and gives the same Disadvantage", () => {
  const { s, t, ev } = hitWith("fire-giant", "hammer-throw", { at: { q: 5, r: 0 } });
  assert.equal(modifiers(s, t, "attack.roll", {}, "attacker").disadvantage.length, 1);
  assert.ok(ev.some((e) => e.type === "damage"));
  assert.ok(CONTENT.monsters["fire-giant"].actions.every((a) => !JSON.stringify(a.effects ?? []).includes("manual")));
});

test("a Frost Giant's Great Bow takes 10 feet off the target's Speed, which ends with the target's next turn", () => {
  const { s, t } = hitWith("frost-giant", "great-bow", { at: { q: 6, r: 0 } });
  assert.equal(modifiers(s, t, "speed").add, -10);
  turnOf(s, t.id);                                                                   // its next turn starts: still slowed
  assert.equal(modifiers(s, t, "speed").add, -10);
  ok(apply(s, { type: "endTurn", actor: t.id }, DM));                                // and its end lifts it
  assert.equal(modifiers(s, t, "speed").add, 0);
});

test("a Merfolk Skirmisher's Ocean Spear, thrown or in hand, slows the target by 10 feet until its next turn ends", () => {
  for (const action of ["ocean-spear", "ocean-spear-thrown"]) {
    const { s, t } = hitWith("merfolk-skirmisher", action);
    assert.equal(modifiers(s, t, "speed").add, -10, action);
    assert.ok(CONTENT.monsters["merfolk-skirmisher"].actions.every((a) => !JSON.stringify(a.effects ?? []).includes("manual")));
  }
});
