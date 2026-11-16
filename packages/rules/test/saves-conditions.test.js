// Two faults found by the readers (#434, DEBT T57 (1) and (3)): a repeated save with no DC, and a condition step that finds
// the condition already on, or the creature at 0 Hit Points.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current } from "../src/engine.js";
import { condition } from "../src/engine/rolls.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
function exact(s, acts) {
  const start = json(s), h = createHistory(), states = [start];
  for (const a of acts) { const b = mark(s), r = ok(apply(s, a, DM)); h.record(b, s, describeStep(a, r.events, b, s)); states.push(json(s)); }
  const end = json(s);
  for (let n = acts.length - 1; n >= 0; n--) { h.undo(s); assert.equal(json(s), states[n], `undo ${n}`); }
  for (let n = 0; n < acts.length; n++) h.redo(s);
  assert.equal(json(s), end, "redo");
  const again = JSON.parse(start);
  for (const a of acts) ok(apply(again, a, DM));
  assert.equal(json(again), end, "replay");
}
function scene() {
  const s = newGame(5);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  apply(s, { type: "place", actor: "fighter", to: { q: 0, r: 1 } }, DM);
  const M = s.entities[ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 1 } }, DM)).events[0].id];
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 500;
  return { s, F: s.entities.fighter, M };
}
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) apply(s, { type: "endTurn", actor: current(s) }, DM); assert.equal(current(s), id); };
const grip = (extra = {}) => ({ id: "grip", name: "Grip", target: { creature: { reach: 5 } }, effects: [{ attack: "melee", kind: "weapon", bonus: 40, onHit: [{ condition: "restrained", ends: { on: "save", save: "str", at: "turnStart", ...extra } }] }] });

test("a repeated save with no DC is not rolled: the DM was told when the condition went on, and the condition stays until the DM ends it", () => {
  const { s, F, M } = scene();
  M.actions.push(grip());
  F.saveBonus = { str: 50 };
  assert.ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM).ok);
  turnOf(s, M.id);
  const told = ok(apply(s, { type: "act", actor: M.id, action: "grip", target: "fighter" }, DM));
  assert.ok(told.events.some((e) => e.type === "manual" && /has no DC entered, so the engine does not roll it\. The DM ends it/.test(e.text)));
  assert.equal(told.events.filter((e) => e.type === "manual" && /Nothing ends it yet/.test(e.text)).length, 0, "one note, not two");
  const saves = [];
  for (let i = 0; i < 12 && current(s) !== F.id; i++) saves.push(...ok(apply(s, { type: "endTurn", actor: current(s) }, DM)).events.filter((e) => e.type === "save"));
  assert.equal(current(s), F.id);
  assert.deepEqual(saves.filter((e) => e.id === F.id), [], "no save is rolled for the Restrained fighter at the start of its turn");
  assert.ok(F.cond.restrained, "still Restrained");
});

test("a repeated save that has its DC is still rolled at the time named", () => {
  const { s, F, M } = scene();
  M.actions.push(grip({ dc: 30 }));
  F.saveBonus = { str: 50 };
  assert.ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM).ok);
  turnOf(s, M.id);
  ok(apply(s, { type: "act", actor: M.id, action: "grip", target: "fighter" }, DM));
  const saves = [];
  for (let i = 0; i < 12 && current(s) !== F.id; i++) saves.push(...ok(apply(s, { type: "endTurn", actor: current(s) }, DM)).events.filter((e) => e.type === "save" && e.id === F.id));
  assert.equal(saves.length, 1); assert.equal(saves[0].dc, 30); assert.equal(saves[0].success, true);
  assert.equal(F.cond.restrained, undefined, "the save ended it");
});

test("a repeated save with no DC, or damage: no save is rolled, and damage to the creature still ends the condition", () => {
  const { s, F, M } = scene();
  M.actions.push(grip({ orDamaged: true }));
  assert.ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM).ok);
  turnOf(s, M.id);
  const told = ok(apply(s, { type: "act", actor: M.id, action: "grip", target: "fighter" }, DM));
  assert.ok(told.events.some((e) => e.type === "manual" && /does not roll it\. The DM ends it \(any damage it takes still ends it\)/.test(e.text)));
  assert.ok(F.cond.restrained);
  const hurt = ok(apply(s, { type: "harm", actor: "fighter", amount: 1 }, DM));
  assert.equal(hurt.events.some((e) => e.type === "save"), false);
  assert.equal(F.cond.restrained, undefined, "damage ended it");
});

test("a repeated save with no DC: undo, redo and replay are exact", () => {
  const { s, M } = scene();
  M.actions.push(grip({ orDamaged: true }));
  assert.ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM).ok);
  turnOf(s, M.id);
  const probe = structuredClone(s), acts = [{ type: "act", actor: M.id, action: "grip", target: "fighter" }];
  ok(apply(probe, acts[0], DM));
  for (let i = 0; i < 6; i++) { const a = { type: "endTurn", actor: current(probe) }; ok(apply(probe, a, DM)); acts.push(a); }
  acts.push({ type: "harm", actor: "fighter", amount: 1 });
  exact(s, acts);
});

// ---------- T57 (3): a condition step that finds the condition on, or the creature down ----------
// SRD: a condition is on a creature or it is not; being Restrained twice is Restrained. A creature at 0 Hit Points is
// still a creature, so the engine's refusal to put a condition on one is the DM's to settle, in words.
const gripTwice = () => {
  const { s, F, M } = scene();
  M.actions.push(grip({ dc: 30 }));
  assert.ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM).ok);
  turnOf(s, M.id);
  return { s, F, M, hit: () => ok(apply(s, { type: "act", actor: M.id, action: "grip", target: "fighter" }, DM)) };
};
test("a condition step on a creature that already has it: nothing is added, and the event says so", () => {
  const { s, F, hit } = gripTwice();
  F.saveBonus = { str: 50 };
  assert.equal(hit().events.some((e) => e.type === "note"), false, "the first time puts it on");
  const before = json(F.cond);
  s.encounter.budget.action = 2;
  const again = hit();
  assert.ok(again.events.some((e) => e.type === "note" && e.id === F.id && /^Already Restrained: nothing added$/.test(e.text)), JSON.stringify(again.events));
  assert.equal(json(F.cond), before, "the first Restrained is as it was");
});
test("a condition step on a creature at 0 Hit Points is handed to the DM in words; on a dead one it is a note", () => {
  const { s, F, hit } = gripTwice();
  F.hp = 0;
  const r = hit();
  assert.ok(r.events.some((e) => e.type === "manual" && e.partial && /at 0 Hit Points.*Restrained was not put on it\. The DM applies it/.test(e.text)), JSON.stringify(r.events));
  assert.equal(F.cond.restrained, undefined);
});
test("a condition step on a dead creature (an area that reaches it) is a note", () => {
  const { s, F, M } = gripTwice();
  const ev = [];
  F.dead = true; F.hp = 0;
  condition(s, F, "restrained", ev, { actor: M.id, src: { name: "Grip" } }, { condition: "restrained" });
  assert.deepEqual(ev.map((e) => e.type), ["note"]);
  assert.match(ev[0].text, /is dead: Restrained is not put on it/);
});
test("a condition step: undo, redo and replay are exact", () => {
  const { s } = gripTwice();
  s.encounter.budget.action = 2;
  exact(s, [{ type: "act", actor: current(s), action: "grip", target: "fighter" }, { type: "act", actor: current(s), action: "grip", target: "fighter" }]);
});
