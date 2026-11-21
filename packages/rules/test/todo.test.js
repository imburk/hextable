// The DM's to-do tray (#675): a card for every `manual` event, kept in the state; the abilities the DM runs; Done; set Armor Class;
// and what players are told (docs/specs/dm-todo.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { view, viewWaiting } from "../src/view.js";
import { createHistory, mark } from "../src/history.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
function field() {
  const s = newGame(5);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  s.encounter = null; s.settings.autoEngage = false;
  return s;
}
const cards = (s) => s.todo?.cards ?? [];

test("a cast the engine hands to the DM leaves a card: who, what, the creatures named", () => {
  const s = field();
  s.entities.wizard.spells.push("mage-armor");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "mage-armor", targets: ["wizard"] }, DM));
  const c = cards(s).find((x) => x.name === "Mage Armor");
  assert.ok(c, "a card");
  assert.equal(c.kind, "manual");
  assert.equal(c.actor, "wizard");
  assert.ok(c.text.length > 0);
  assert.ok(c.ids.includes("wizard"));
});

test("the same note made again adds to its card instead of piling up", () => {
  const s = field();
  s.entities.wizard.spells.push("mage-armor");
  s.entities.wizard.slots = { 1: 4 }; s.entities.wizard.slotsMax = { 1: 4 };
  ok(apply(s, { type: "cast", actor: "wizard", spell: "mage-armor", targets: ["wizard"] }, DM));
  const n = cards(s).length;
  ok(apply(s, { type: "cast", actor: "wizard", spell: "mage-armor", targets: ["wizard"] }, DM));
  assert.equal(cards(s).length, n);
  assert.equal(cards(s).find((x) => x.name === "Mage Armor").count, 2);
});

test("Done removes one card or all; only the DM; a card already done is refused; undo gives it back", () => {
  const s = field();
  s.entities.wizard.spells.push("mage-armor");
  const h = createHistory();
  const before = mark(s);
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "mage-armor", targets: ["wizard"] }, DM));
  h.record(before, s, "cast");
  const n = cards(s)[0].n;
  assert.equal(apply(s, { type: "todoDone", n }, PAT).ok, false);
  assert.ok(cards(s).length);
  const b2 = mark(s);
  ok(apply(s, { type: "todoDone", n }, DM));
  h.record(b2, s, "done");
  assert.equal(cards(s).find((x) => x.n === n), undefined);
  assert.equal(apply(s, { type: "todoDone", n }, DM).ok, false);
  h.undo(s);
  assert.ok(cards(s).find((x) => x.n === n), "undo brings the card back");
  ok(apply(s, { type: "todoDone", all: true }, DM));
  assert.equal(cards(s).length, 0);
  assert.ok(r.events.length);
});

test("a monster with Spellcasting or Legendary Actions gets a 'You run' card when added and when its turn starts", () => {
  const s = field();
  ok(apply(s, { type: "spawn", monster: "mage", at: { q: 4, r: 0 } }, DM));
  const c = cards(s).filter((x) => x.kind === "run");
  assert.equal(c.length, 1);
  assert.ok(c[0].runs.some((x) => x.name === "Spellcasting"));
  ok(apply(s, { type: "todoDone", n: c[0].n }, DM));
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 4, r: 2 } }, DM));
  assert.equal(cards(s).length, 0, "a goblin runs nothing by hand");
  const id = Object.values(s.entities).find((e) => e.tpl === "mage").id;
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  for (let i = 0; i < 12 && !cards(s).some((x) => x.kind === "run" && x.actor === id); i++) {
    const cur = s.encounter?.order[s.encounter.turn]?.id;
    if (!cur) break;
    const r = apply(s, { type: "endTurn", actor: cur }, DM);
    if (!r.ok) break;
  }
  assert.ok(cards(s).some((x) => x.kind === "run" && x.actor === id), "a card at the start of its turn");
  assert.equal(cards(s).filter((x) => x.kind === "run" && x.actor === id).length, 1, "one open card for one creature");
});

test("setAc sets a creature's Armor Class; DM only; bounds; changes nothing when refused", () => {
  const s = field();
  ok(apply(s, { type: "setAc", actor: "wizard", ac: 15 }, DM));
  assert.equal(s.entities.wizard.ac, 15);
  const was = JSON.stringify(s);
  for (const [a, ctx] of [[{ type: "setAc", actor: "wizard", ac: 15 }, DM], [{ type: "setAc", actor: "wizard", ac: 99 }, DM], [{ type: "setAc", actor: "wizard", ac: 1.5 }, DM], [{ type: "setAc", actor: "wizard", ac: 12 }, PAT], [{ type: "setAc", actor: "nobody", ac: 12 }, DM]]) {
    assert.equal(apply(s, a, ctx).ok, false);
  }
  assert.equal(JSON.stringify(s), was);
});

test("players are never sent the tray; the caster is told only that their own spell waits, with no DM words and no card number", () => {
  const s = field();
  Object.assign(s.entities.wizard, { owner: "pat", ownerName: "Pat" });
  s.entities.wizard.spells.push("mage-armor");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "mage-armor", targets: ["wizard"] }, DM));
  // a DM-only note about the wizard that is not named for anything the wizard has
  s.todo.cards.push({ n: 99, t: 0, kind: "manual", actor: "wizard", name: "Secret trap", text: "the DM's words", ids: ["wizard"], partial: true });
  const v = view(s, PAT);
  assert.equal(Object.hasOwn(v, "todo"), false);
  assert.ok(!JSON.stringify(v).includes("the DM's words") && !JSON.stringify(v).includes("Secret trap"));
  assert.deepEqual(v.waiting, [{ id: "wizard", name: "Mage Armor" }]);
  assert.deepEqual(viewWaiting(s, { role: "player", userId: "sam" }), []);
  assert.deepEqual(viewWaiting(s, DM), []);
  assert.equal(view(s, DM), s, "the DM is given the state itself, cards and all");
});
