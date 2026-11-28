// Legendary Resistance, stage L2b: asking the DM (docs/specs/legendary.md, Decisions 6, 7 and 9; tests 9 and 12's question part).
import { test } from "node:test";
import assert from "node:assert/strict";
import { apply } from "../src/engine.js";
import { RESISTANCE, mayAsk } from "../src/reactions.js";
import { newGame } from "../src/scenario.js";
import { viewPrompt, viewEvents } from "../src/view.js";
import { describeStep } from "../src/history.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (s, a, ctx = DM) => { const r = apply(s, a, ctx); assert.ok(r.ok, `${a.type}: ${r.error}`); return r; };
const clone = (s) => structuredClone(s);

// A dragon "Verdigris" (3 uses, immune to poison) beside the party; the wizard knows Hold Monster. The dragon is made weak so that every save fails.
function game({ on = true, how = "ask", monster = "adult-green-dragon" } = {}) {
  const s = newGame(5);
  ok(s, { type: "setting", key: "autoEngage", value: false });
  const f = s.entities.fighter.pos;
  ok(s, { type: "spawn", monster, at: { q: f.q + 3, r: f.r }, name: "Verdigris" });
  ok(s, { type: "setting", key: "legendaryResistance", value: on });                   // L4b: absent means on, so `on: false` sets it to false
  const d = Object.values(s.entities).find((e) => e.name === "Verdigris");
  d.saveBonus = { str: -60, dex: -60, con: -60, int: -60, wis: -60, cha: -60 };
  const w = s.entities.wizard;
  w.spells = [...(w.spells ?? []), "hold-monster", "fireball"]; w.slots = { ...w.slots, 3: 2, 5: 2 }; w.slotsMax = { ...w.slotsMax, 3: 2, 5: 2 };
  if (how) ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: how } });
  ok(s, { type: "startEncounter", center: s.entities.fighter.pos });
  s.encounter.turn = s.encounter.order.findIndex((o) => o.id === "wizard");
  return { s, d };
}
const hold = (d) => ({ type: "cast", actor: "wizard", spell: "hold-monster", target: d.id, slot: 5 });
const saves = (r) => r.events.filter((e) => e.type === "save");
const strip = (r) => JSON.stringify(r.events);

test("9: under `ask`, Hold Monster stops at the dragon's failed save; the DM spends a use and the dragon succeeds", () => {
  const { s, d } = game();
  const before = clone(s);
  const r = ok(s, hold(d));
  assert.ok(s.pending, "the table is waiting");
  assert.equal(s.pending.ask.reactor, d.id);
  assert.equal(s.pending.ask.trigger, "save");
  assert.deepEqual(s.pending.ask.options.map((o) => o.reaction), [RESISTANCE]);
  assert.equal(r.events.length, 1); assert.equal(r.events[0].type, "reactionAsked");
  assert.equal(r.events[0].to, null, "asked of the DM");
  assert.deepEqual(s.entities.wizard.slots, before.entities.wizard.slots, "nothing was spent yet");
  assert.equal(d.legend.resisted, 0);
  const ans = ok(s, { type: "react", prompt: s.pending.n, take: RESISTANCE });
  const D = s.entities[d.id];
  assert.equal(s.pending, undefined);
  const sv = saves(ans).find((e) => e.id === d.id);
  assert.deepEqual([sv.success, sv.resisted], [true, true]);
  assert.equal(D.cond.paralyzed, undefined);
  assert.equal(D.legend.resisted, 1);
});

test("9: a decline applies Paralyzed, and nothing is spent", () => {
  const { s, d } = game();
  ok(s, hold(d));
  const ans = ok(s, { type: "react", prompt: s.pending.n, take: null });
  const sv = saves(ans).find((e) => e.id === d.id);
  assert.equal(sv.success, false); assert.equal(sv.resisted, undefined);
  assert.ok(s.entities[d.id].cond.paralyzed);
  assert.equal(s.entities[d.id].legend.resisted, 0);
  assert.equal(ans.events.some((e) => e.type === "manual" && e.name === "Legendary Resistance"), false, "no note: the DM was asked");
});

test("9: the same dice either way up to the save: a decline plays as `never` does", () => {
  const a = game(), b = game({ how: "never" });
  ok(a.s, hold(a.d));
  const ans = ok(a.s, { type: "react", prompt: a.s.pending.n, take: null });
  const direct = ok(b.s, hold(b.d));
  const norm = (r) => JSON.stringify(r.events.filter((e) => e.type !== "reactionAnswered"));
  assert.equal(norm(ans), norm(direct));
  a.s.entities[a.d.id].reactions = b.s.entities[b.d.id].reactions;
  assert.deepStrictEqual(a.s.entities, b.s.entities);
  assert.equal(a.s.rng?.seed ?? JSON.stringify(a.s.rng), b.s.rng?.seed ?? JSON.stringify(b.s.rng));
});

test("9: the answer is checked: an old prompt, and a player who is not the controller, are refused with the question left waiting", () => {
  const { s, d } = game();
  ok(s, hold(d));
  const n = s.pending.n, snap = clone(s);
  assert.equal(apply(s, { type: "react", prompt: n + 1, take: RESISTANCE }, DM).ok, false);
  assert.equal(apply(s, { type: "react", prompt: n, take: RESISTANCE }, PAT).ok, false);
  assert.equal(apply(s, { type: "react", prompt: n, take: "shield" }, DM).ok, false);
  assert.deepStrictEqual(s, snap);
  assert.equal(apply(s, hold(d), DM).ok, false, "the table waits for the answer");
});

test("9: `matters` asks only when it cannot tell: a `manual` failure is asked, one that changes nothing and one that matters are not", () => {
  const { s, d } = game({ how: null });
  let r = ok(s, { type: "save", who: d.id, ability: "con", dc: 12, damage: { dice: "4d6", type: "poison" } });
  assert.equal(s.pending, undefined); assert.equal(saves(r)[0].success, false);
  r = ok(s, { type: "save", who: d.id, ability: "wis", dc: 12, condition: "paralyzed" });
  assert.equal(s.pending, undefined); assert.equal(saves(r)[0].resisted, true, "spent by itself");
  r = ok(s, { type: "save", who: d.id, ability: "wis", dc: 12 });
  assert.ok(s.pending, "a called save with nothing the engine can read is asked");
  r = ok(s, { type: "react", prompt: s.pending.n, take: RESISTANCE });
  assert.equal(saves(r)[0].resisted, true);
  assert.equal(s.entities[d.id].legend.resisted, 2);
});

test("9: a creature with several saves is asked once for each, in order, and each answer is kept", () => {
  const { s, d } = game();
  const f = s.entities.fighter.pos;
  let placed = false;
  for (const [dq, dr] of [[1, 0], [0, 1], [-1, 1], [2, 0], [0, 2], [-1, 2], [2, -1], [1, -1], [0, -1]]) {
    if (apply(s, { type: "spawn", monster: "unicorn", at: { q: f.q + 3 + dq, r: f.r + dr }, name: "Second" }, DM).ok) { placed = true; break; }
  }
  assert.ok(placed, "a second legendary creature stands beside the dragon");
  const e2 = Object.values(s.entities).find((e) => e.name === "Second");
  e2.saveBonus = { ...d.saveBonus };
  ok(s, { type: "reactions", actor: e2.id, set: { [RESISTANCE]: "ask" } });
  ok(s, { type: "cast", actor: "wizard", spell: "fireball", hex: { q: f.q + 3, r: f.r }, slot: 3 });
  const asked = [];
  while (s.pending) { asked.push(s.pending.ask.reactor); ok(s, { type: "react", prompt: s.pending.n, take: asked.length === 1 ? RESISTANCE : null }); }
  assert.equal(asked.length, 2); assert.notEqual(asked[0], asked[1]);
  assert.equal(s.entities[asked[0]].legend.resisted, 1);
  assert.equal(s.entities[asked[1]].legend.resisted, 0);
});

test("setting off: nothing changes: no copy asked for, no state, no event, whatever the instruction", () => {
  const { s, d } = game({ on: false });
  assert.equal(mayAsk(s), false);
  const r = ok(s, hold(d));
  assert.equal(s.pending, undefined); assert.equal(s.asked, undefined);
  assert.equal(r.events.some((e) => e.type === "reactionAsked" || (e.type === "manual" && e.name === "Legendary Resistance")), false);
  assert.equal(s.entities[d.id].legend.resisted, 0);
});

test("mayAsk: on while a creature has a use left under `ask` or `matters`, off under `always`, `never`, with none left, or with the setting off", () => {
  const { s, d } = game({ how: "ask" });
  assert.equal(mayAsk(s), true);
  ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "matters" } }); assert.equal(mayAsk(s), true);
  ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "always" } }); assert.equal(mayAsk(s), false);
  ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "never" } }); assert.equal(mayAsk(s), false);
  ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "ask" } });
  d.legend.resisted = 3; assert.equal(mayAsk(s), false);
  d.legend.resisted = 0; ok(s, { type: "setting", key: "legendaryResistance", value: false }); assert.equal(mayAsk(s), false);
});

// ---------- what players are sent, and the record (Decision 9; test 12) ----------
test("12: the DM is sent the question; a player who does not run the creature is told only that the table waits, never what for", () => {
  const { s, d } = game();
  ok(s, hold(d));
  const dm = viewPrompt(s, DM);
  assert.equal(dm.reactor, d.id); assert.equal(dm.trigger, "save");
  assert.deepEqual(viewPrompt(s, PAT), { waiting: true });
  const sent = JSON.stringify([viewPrompt(s, PAT), viewEvents([{ type: "reactionAsked", id: d.id, n: s.pending.n, to: null, ask: s.pending.ask }], s, PAT)]);
  for (const bad of ["Legendary", "legendary", "save", d.id]) assert.ok(!sent.includes(bad), `${bad} was sent: ${sent}`);
});

test("12: a dragon the party does not know of: the table does not seem to wait for anything", () => {
  const { s, d } = game();
  d.hidden = true;
  const r = ok(s, { type: "save", who: d.id, ability: "wis", dc: 12 });
  assert.equal(r.ok, true);
  assert.ok(s.pending, "the DM is asked");
  assert.equal(viewPrompt(s, PAT), null);
  assert.ok(viewPrompt(s, DM));
});

test("12: the answer is told to nobody but the DM's record; players' record says only what the action did", () => {
  const { s, d } = game();
  ok(s, hold(d));
  const before = clone(s), n = s.pending.n;
  const ans = ok(s, { type: "react", prompt: n, take: RESISTANCE });
  const step = describeStep({ type: "react", prompt: n, take: RESISTANCE }, ans.events, before, s);
  assert.match(step.label, /Legendary Resistance spent/);
  assert.ok(!/Legendary|reaction/.test(step.shown ?? ""), `shown: ${step.shown}`);
});

test("12: a player who runs a party legendary creature is asked with the DC of the save, and the total and the uses left; others are not", () => {
  const { s, d } = game();
  s.entities[d.id].side = "party"; s.entities[d.id].owner = "pat";
  const r = ok(s, { type: "save", who: d.id, ability: "wis", dc: 14, condition: "paralyzed" }, { role: "dm", userId: "dm" });
  assert.ok(s.pending, `asked: ${JSON.stringify(r)}`);
  const own = viewPrompt(s, PAT);
  assert.equal(own.dc, 14); assert.equal(own.left, 3); assert.equal(typeof own.total, "number");
  assert.equal(viewPrompt(s, { role: "player", userId: "sam" })?.dc, undefined);
  assert.equal(viewPrompt(s, DM).dc, 14);
});
