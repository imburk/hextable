// Weapon properties in the SRD 5.2 weapons section (issue #435), and what the engine does with each, through apply().
// Step 1 of the job: these tests show TODAY's behaviour, property by property. Later commits change the ones for Heavy,
// Loading and Two-Handed to the SRD's rule and leave the rest as they are.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { aiStep } from "../src/ai.js";
import { opportunityAttack, reactionsOf } from "../src/reactions.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { newGame } from "../src/scenario.js";

// Issue #441: the AI and the Opportunity Attack do not pick a Heavy weapon swung with Disadvantage when another allowed weapon will do.
const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const sheet = (abilities, weapons, more = {}) => ({ name: "Fi", class: "fighter", level: more.level ?? 5, ...((more.level ?? 5) >= 3 ? { subclass: "champion" } : {}), abilities,
  skills: ["athletics", "perception"], choices: { "fighting-style": "defense" }, weapons, ...more });
const STRONG = { str: 16, dex: 14, con: 14, int: 10, wis: 8, cha: 8 };
const WEAK = { str: 8, dex: 16, con: 14, int: 10, wis: 8, cha: 8 };       // Strength below 13, Dexterity 13 or more
const CLUMSY = { str: 16, dex: 8, con: 14, int: 10, wis: 8, cha: 8 };     // Dexterity below 13

// A fighter beside (or `gap` hexes from) a hard-to-kill goblin, in a fight, on the fighter's turn.
function field(sh, { gap = 1, foeAc = 1 } = {}) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sh).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  const foe = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 } }, DM)).events[0].id;
  Object.assign(s.entities[foe], { hp: 500, maxHp: 500, ac: foeAc });
  s.foe = foe;
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  for (let i = 0; i < 6 && current(s) !== "hero"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.equal(current(s), "hero");
  s.entities[foe].pos = { q: gap, r: 0, z: 0 };         // moved after the fight began, so far shots can be tried
  return s;
}
const bytes = (s) => JSON.stringify(s);
// Play `actions` as the DM with history kept; then undo them all (the state is byte for byte the start), redo them
// (byte for byte the end) and replay them on a copy of the start (the same events and the same end). Returns the events.
function exact(s, actions) {
  const h = createHistory(), start = bytes(s), copy = structuredClone(s), out = [];
  for (const a of actions) {
    const before = mark(s), r = apply(s, a, DM);
    assert.ok(r.ok, r.error);
    h.record(before, s, describeStep(a, r.events, before, s));
    out.push(r.events);
  }
  const end = bytes(s);
  for (let i = 0; i < actions.length; i++) assert.ok(h.undo(s));
  assert.equal(bytes(s), start, "undone");
  for (let i = 0; i < actions.length; i++) assert.ok(h.redo(s));
  assert.equal(bytes(s), end, "redone");
  const again = actions.map((a) => { const r = apply(copy, a, DM); assert.ok(r.ok, r.error); return r.events; });
  assert.deepEqual(again, out, "replayed events");
  assert.equal(bytes(copy), end, "replayed state");
  return out;
}
// The turn of the creature `id`, played by the AI, every action sent is allowed.
function aiTurn(s, id) {
  const sent = [];
  for (let i = 0; i < 30 && current(s) === id && !s.pending; i++) {
    const a = aiStep(s, id) ?? { type: "endTurn", actor: id };
    const r = apply(s, a, DM);
    assert.ok(r.ok, `${a.type} ${a.attack ?? ""} refused: ${r.error}`);
    sent.push(a);
  }
  return sent;
}


const swung = (sent) => sent.filter((a) => a.type === "attack").map((a) => a.attack);

test("AI: Strength 8 with a Greatsword and a Rapier swings the Rapier, never the Greatsword", () => {
  const s = field(sheet(WEAK, ["greatsword", "rapier"]));
  const sent = aiTurn(s, "hero");
  assert.ok(swung(sent).length >= 2 && swung(sent).every((a) => a === "rapier"), JSON.stringify(sent));
});

test("AI: Strength 13 keeps the first weapon it holds (the Greatsword); so does a weapon that is not Heavy", () => {
  const s = field(sheet({ ...WEAK, str: 13 }, ["greatsword", "rapier"]));
  assert.ok(swung(aiTurn(s, "hero")).every((a) => a === "greatsword"));
  const t = field(sheet(WEAK, ["longsword", "rapier"]));
  assert.ok(swung(aiTurn(t, "hero")).every((a) => a === "longsword"));
});

test("AI: with only a Heavy weapon it still swings it (Disadvantage and all), and does not punch", () => {
  const s = field(sheet(WEAK, ["greatsword"]));
  const sent = aiTurn(s, "hero");
  assert.ok(swung(sent).length >= 2 && swung(sent).every((a) => a === "greatsword"), JSON.stringify(sent));
});

test("AI: a Heavy ranged weapon with Dexterity under 13 gives way to another ranged weapon", () => {
  const s = field(sheet(CLUMSY, ["heavy-crossbow", "shortbow"]), { gap: 3 });
  assert.ok(swung(aiTurn(s, "hero")).every((a) => a === "shortbow"));
  const t = field(sheet(CLUMSY, ["heavy-crossbow"]), { gap: 3 });
  assert.ok(swung(aiTurn(t, "hero")).every((a) => a === "heavy-crossbow"));
});

test("Opportunity Attack: not a Heavy weapon its wielder is weak with if another will do; the punch is no other weapon", () => {
  assert.equal(opportunityAttack(field(sheet(WEAK, ["greatsword", "rapier"])).entities.hero, field(sheet(WEAK, ["greatsword", "rapier"]))).id, "rapier");
  const strong = field(sheet({ ...WEAK, str: 13 }, ["greatsword", "rapier"]));
  assert.equal(opportunityAttack(strong.entities.hero, strong).id, "greatsword");
  const only = field(sheet(WEAK, ["greatsword"]));
  assert.equal(opportunityAttack(only.entities.hero, only).id, "greatsword");
});

test("AI: a Heavy weapon the creature is weak with is still undone and replayed exactly", () => {
  const s = field(sheet(WEAK, ["greatsword", "rapier"]));
  const a = aiStep(s, "hero");
  assert.equal(a.attack, "rapier");
  exact(s, [a]);
});
