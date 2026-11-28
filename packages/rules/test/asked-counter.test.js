// #878: a question put to the DM alone does not move the number a player's next question carries.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apply } from "../src/engine.js";
import { RESISTANCE } from "../src/reactions.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (s, a, ctx = DM) => { const r = apply(s, a, ctx); assert.ok(r.ok, `${a.type}: ${r.error}`); return r; };

// A dragon on `ask` that fails every save: the DM is asked about its Legendary Resistance.
function dragonGame() {
  const s = newGame(5);
  ok(s, { type: "setting", key: "autoEngage", value: false });
  const f = s.entities.fighter.pos;
  ok(s, { type: "spawn", monster: "adult-green-dragon", at: { q: f.q + 3, r: f.r }, name: "Verdigris" });
  ok(s, { type: "setting", key: "legendaryResistance", value: true });
  const d = Object.values(s.entities).find((e) => e.name === "Verdigris");
  d.saveBonus = { str: -60, dex: -60, con: -60, int: -60, wis: -60, cha: -60 };
  ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "ask" } });
  return { s, d };
}

test("a question to the DM is numbered from its own counter, negative, and leaves `asked` alone", () => {
  const { s, d } = dragonGame();
  const r = ok(s, { type: "save", who: d.id, ability: "wis", dc: 14, condition: "paralyzed" });
  assert.equal(s.pending.n, -1);
  assert.equal(s.askedDM, 1);
  assert.equal(s.asked ?? 0, 0, "the players' counter did not move");
  assert.equal(r.events.find((e) => e.type === "reactionAsked").n, -1);
  ok(s, { type: "react", prompt: -1, take: null });
  assert.equal(s.pending, undefined);
  const r2 = ok(s, { type: "save", who: d.id, ability: "wis", dc: 14, condition: "paralyzed" });
  assert.equal(s.pending.n, -2);
  assert.equal(r2.events.find((e) => e.type === "reactionAsked").n, -2);
  assert.equal(s.asked ?? 0, 0);
});

test("an answer under a stale or wrong number is still refused", () => {
  const { s, d } = dragonGame();
  ok(s, { type: "save", who: d.id, ability: "wis", dc: 14, condition: "paralyzed" });
  for (const prompt of [1, 0, -2]) {
    const r = apply(s, { type: "react", prompt, take: null }, DM);
    assert.equal(r.ok, false);
    assert.ok(s.pending, "still waiting");
  }
});
