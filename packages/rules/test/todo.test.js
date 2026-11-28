// The DM's to-do tray (#675): a card for every `manual` event, kept in the state; the abilities the DM runs; Done; set Armor Class;
// and what players are told (docs/specs/dm-todo.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import { typedGame } from "./fixtures/typed.js";
import { view, viewWaiting } from "../src/view.js";
import { createHistory, mark } from "../src/history.js";
import { derive } from "../src/derive.js";
import { noteManual } from "../src/todo.js";
import { makeEntity } from "../src/engine.js";
import { acOf } from "../src/engine/rolls.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
// The starters hand-typed (fixtures/typed.js), as when these tests were written: a built wizard's Mage Armor is the engine's own (#672, #674),
// and these tests need a spell the engine hands to the DM.
function field() {
  const s = typedGame(5);
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

const A = { str: 10, dex: 16, con: 12, int: 16, wis: 14, cha: 10 };
function built() {
  const s = field();
  const sheet = { name: "Vex", class: "wizard", level: 1, abilities: A, skills: ["arcana", "history"], spells: ["light", "mage-armor"] };
  const e = makeEntity(derive(sheet).record, { id: "vex", kind: "pc", side: "party", owner: "pat", ownerName: "Pat", pos: { q: 3, r: 3, z: 0 } });
  e.sheet = structuredClone(sheet);
  s.entities.vex = e;
  return s;
}

test("Mage Armor on a built character, which the engine applies whole, makes no card and no 'waiting for the DM'", () => {
  const s = built();
  ok(apply(s, { type: "cast", actor: "vex", spell: "mage-armor", targets: ["vex"] }, DM));
  assert.equal(acOf(s, s.entities.vex), 16, "the engine applied it");
  assert.deepEqual(cards(s), []);
  assert.equal(view(s, PAT).waiting, undefined);
});

test("Mage Armor on a hand-typed creature (the engine cannot) makes one card, not two, and the caster waits", () => {
  const s = field();
  Object.assign(s.entities.wizard, { owner: "pat", ownerName: "Pat" });
  s.entities.wizard.spells.push("mage-armor");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "mage-armor", targets: ["wizard"] }, DM));
  assert.equal(cards(s).length, 1);
  assert.deepEqual(view(s, PAT).waiting, [{ id: "wizard", name: "Mage Armor" }]);
});

test("a note for a part the engine left out (partial) makes a DM card but does not make the caster wait", () => {
  const s = built();
  s.todo = { n: 1, cards: [{ n: 1, t: 0, kind: "manual", actor: "vex", name: "Mage Armor", text: "x", ids: ["vex"], partial: true }] };
  assert.equal(view(s, PAT).waiting, undefined);
});

test("setAc moves a built character's acBase with it, so Mage Armor still gives the better base; in a form only the form's number is set", () => {
  const s = built(), e = s.entities.vex;
  const base = e.acBase, ac = e.ac;
  ok(apply(s, { type: "setAc", actor: "vex", ac: ac + 2 }, DM));
  assert.equal(e.acBase, base + 2);
  ok(apply(s, { type: "cast", actor: "vex", spell: "mage-armor", targets: ["vex"] }, DM));
  assert.equal(acOf(s, e), 16, "Mage Armor still gives 16: the better of its 13 + Dexterity and the new base");
  const t = built(), f = t.entities.vex;
  f.form = { block: "wolf" }; f.ac = 13;
  ok(apply(t, { type: "setAc", actor: "vex", ac: 14 }, DM));
  assert.equal(f.ac, 14);
  assert.equal(f.acBase, base, "a form's number is not the character's base");
});

test("setAc on a foe tells players nothing of its number", () => {
  const s = field();
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 2, r: 0 } }, DM));
  const g = Object.values(s.entities).find((e) => e.side === "foe");
  const r = ok(apply(s, { type: "setAc", actor: g.id, ac: 23 }, DM));
  assert.ok(!JSON.stringify(r.events).includes("23"));
});

test("a 'You run' card comes when the creature is added and at its first turn, not again; it goes when the creature dies or is removed", () => {
  const s = field();
  ok(apply(s, { type: "spawn", monster: "mage", at: { q: 4, r: 0 } }, DM));
  const id = Object.values(s.entities).find((e) => e.tpl === "mage").id;
  ok(apply(s, { type: "todoDone", all: true }, DM));
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  let turns = 0;
  for (let i = 0; i < 40 && turns < 3; i++) {
    const cur = s.encounter?.order[s.encounter.turn]?.id;
    if (!cur) break;
    if (cur === id) { turns++; if (turns === 1) { assert.ok(cards(s).some((c) => c.actor === id), "a card at its first turn"); ok(apply(s, { type: "todoDone", all: true }, DM)); } else assert.ok(!cards(s).some((c) => c.actor === id), "not again"); }
    if (!apply(s, { type: "endTurn", actor: cur }, DM).ok) break;
  }
  assert.ok(turns >= 2);
  s.todo.cards.push({ n: 900, t: 0, kind: "run", actor: id, name: "Mage", runs: [], why: "added" });
  ok(apply(s, { type: "harm", actor: id, amount: 9999 }, DM));
  assert.ok(!cards(s).some((c) => c.kind === "run" && c.actor === id), "gone with its death");
});

test("a note made again comes up as new and counts; its text is capped", () => {
  const s = field();
  const ev = { type: "manual", actor: "wizard", name: "Thing", text: "x".repeat(900), partial: true };
  noteManual(s, ev); noteManual(s, ev);
  const c = cards(s);
  assert.equal(c.length, 1);
  assert.equal(c[0].count, 2);
  assert.equal(c[0].n, 1, "its identity stays, so Done on it works");
  assert.equal(c[0].up, 2, "it comes up as new");
  assert.equal(c[0].text.length, 700);
  assert.ok(c[0].text.endsWith("…"), "cut text says so");
  ok(apply(s, { type: "todoDone", n: 1 }, DM));
  assert.deepEqual(cards(s), []);
});

function caster(spells) {
  const s = field();
  const sheet = { name: "Wyn", class: "wizard", level: 5, abilities: { ...A, int: 18 }, skills: ["arcana", "history"], spells };
  const e = makeEntity(derive(sheet).record, { id: "wyn", kind: "pc", side: "party", owner: "pat", ownerName: "Pat", pos: { q: 3, r: 3, z: 0 } });
  e.sheet = structuredClone(sheet);
  s.entities.wyn = e;
  return s;
}

test("an assist spell with work left for the DM and no manual step (Haste, Charm Person) makes a card, and its caster does not wait; Mage Armor and Light make none", () => {
  const h = caster(["haste", "mage-armor", "light"]);
  ok(apply(h, { type: "cast", actor: "wyn", spell: "haste", targets: ["wyn"] }, DM));
  const hc = cards(h).filter((c) => c.name === "Haste");
  assert.equal(hc.length, 1, "Haste leaves the lethargy to the DM");
  assert.ok(!hc[0].waits);
  assert.equal(view(h, PAT).waiting, undefined);
  // Charm Person: Hold Person was the example until #727 made it `auto` (its Humanoid limit is applied), so it leaves the DM nothing.
  const p = caster(["charm-person"]);
  ok(apply(p, { type: "spawn", monster: "bandit", at: { q: 6, r: 3 } }, DM));
  const g = Object.values(p.entities).find((e) => e.side === "foe").id;
  ok(apply(p, { type: "startEncounter", center: { q: 4, r: 3 }, radius: 8 }, DM));
  for (let i = 0; i < 12 && p.encounter.order[p.encounter.turn].id !== "wyn"; i++) ok(apply(p, { type: "endTurn", actor: p.encounter.order[p.encounter.turn].id }, DM));
  ok(apply(p, { type: "cast", actor: "wyn", spell: "charm-person", target: g }, DM));
  assert.ok(cards(p).some((c) => c.name === "Charm Person"), "Charm Person");
  const m = caster(["mage-armor", "light"]);
  ok(apply(m, { type: "cast", actor: "wyn", spell: "mage-armor", targets: ["wyn"] }, DM));
  ok(apply(m, { type: "cast", actor: "wyn", spell: "light", target: "wyn" }, DM));
  assert.deepEqual(cards(m), [], "applied whole, nothing for the DM");
});

test("L4b: a creature with a legendary block is run by the engine: its card lists only the manual options and Spellcasting, no trait", async () => {
  const { runsOf } = await import("../src/todo.js");
  const { CONTENT } = await import("../src/content/index.js");
  const aboleth = runsOf({ id: "x", tpl: "aboleth", side: "foe" });
  assert.deepEqual(aboleth.map((x) => x.name), ["Psychic Drain"], "the manual option, not the Lash (which the engine plays) and not the traits");
  assert.ok(aboleth[0].text.length > 10);
  for (const tpl of ["kraken", "tarrasque", "balor"]) assert.deepEqual(runsOf({ id: "x", tpl, side: "foe" }), [], `${tpl}: no manual option and no Spellcasting: no card`);
  assert.ok(CONTENT.monsters["kraken"].legendary);
  assert.ok(runsOf({ id: "x", tpl: "adult-green-dragon", side: "foe" }).some((x) => /Spellcasting/.test(x.name)), "Spellcasting is still text");
  assert.ok(!runsOf({ id: "x", tpl: "lich", side: "foe" }).some((x) => /^Legendary/.test(x.name)));
  // A trait still written as text, with no block, keeps today's card.
  const orig = CONTENT.monsters["goblin-warrior"], old = structuredClone(orig);
  old.traits = [...old.traits, { id: "legendary-actions", name: "Legendary Actions", modifiers: [], text: "3 uses." }];
  CONTENT.monsters["goblin-warrior"] = old;
  try { assert.deepEqual(runsOf({ id: "x", tpl: "goblin-warrior", side: "foe" }).map((x) => x.name), ["Legendary Actions"]); } finally { CONTENT.monsters["goblin-warrior"] = orig; }
});
