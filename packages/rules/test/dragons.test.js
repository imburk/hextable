// The 18 adult and ancient dragons' Multiattack (DEBT M1): three Rends, or two and a breath where
// the SRD offers one; the swap for a spell stays the DM's, in the action's text.
import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import { CONTENT } from "../src/content/index.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };

test("every adult and ancient dragon has a working Multiattack and none is left as text", () => {
  const dragons = Object.values(CONTENT.monsters).filter((m) => /^(adult|ancient)-.*-dragon$/.test(m.id));
  assert.equal(dragons.length, 20);
  for (const m of dragons) {
    assert.ok(m.actions.some((a) => a.id === "multiattack" && a.multiattack), m.id);
    assert.equal(m.traits.some((t) => t.id === "multiattack"), false, m.id);
  }
  const brass = CONTENT.monsters["adult-brass-dragon"].actions[0];
  assert.deepEqual(brass.multiattack, { or: [[{ action: "rend", times: 3 }], [{ action: "rend", times: 2 }, { action: "sleep-breath", times: 1 }]] });
  assert.match(brass.text, /Scorching Ray.*DM/);
});

test("an adult red dragon makes three Rends on its turn, and the AI uses them", () => {
  const s = newGame(5);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  const d = s.entities[ok(apply(s, { type: "spawn", monster: "adult-red-dragon", at: { q: 3, r: 0 } }, DM)).events[0].id];
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 500;
  d.spent = { "fire-breath": true };
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  for (let i = 0; i < 20 && current(s) !== d.id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  d.spent = { "fire-breath": true };
  delete d.charges;
  let attacks = 0;
  for (let i = 0; i < 30 && current(s) === d.id; i++) {
    const a = aiStep(s, d.id);
    if (!a || a.type === "endTurn") break;
    if (a.type === "act" && a.action === "fire-breath") break;
    attacks += ok(apply(s, a, DM)).events.filter((e) => e.type === "attack").length;
  }
  assert.equal(attacks, 3);
});
