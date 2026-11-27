// Issue #861 (part of #786): Earthquake, Storm of Vengeance and Tsunami were `manual`; their opening save is now the engine's, the rest stays the DM's.
// Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { apply, current } from "../src/engine.js";
import { has } from "../src/modifiers.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const lint = (def) => lintEntry("spells", def, { strict: false });

function field() {
  const s = newGame(5);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", 0, 0], ["fighter", -2, 0], ["rogue", -4, 4], ["cleric", -3, 0]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  const slots = { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 };
  Object.assign(s.entities.wizard, { slots: { ...slots }, slotsMax: { ...slots } });
  s.entities.wizard.spells.push("earthquake", "tsunami", "storm-of-vengeance");
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 500;
  return s;
}
const spawn = (s, monster, q, r) => { const e = s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 500; e.ac = 1; return e; };
const hasCond = (e, c) => has(e, c);
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 12 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
// Every creature fails (or makes) its save: the engine rolls from the seed, so a creature with a very low or very high save bonus decides it.
const ABIL = ["str", "dex", "con", "int", "wis", "cha"];
const weak = (e) => { e.saveBonus = Object.fromEntries(ABIL.map((k) => [k, -50])); };
const strong = (e) => { e.saveBonus = Object.fromEntries(ABIL.map((k) => [k, 50])); };

test("the three entries are assist, checked, lint clean and say what stays the DM's", () => {
  for (const id of ["earthquake", "storm-of-vengeance", "tsunami"]) {
    const def = SPELLS[id].def;
    assert.equal(def.tier, "assist", id); assert.equal(def.checked, true, id);
    assert.deepEqual(lint(def), [], id);
    const m = def.effects.find((x) => "manual" in x);
    assert.ok(m && /only the (opening|first)/i.test(m.manual), id);
    assert.match(def.text, /Only that/, id);
  }
});

test("Earthquake: a creature that fails is Prone and loses Concentration, one that saves is not, and the ground is Difficult Terrain", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 6, 0), h = spawn(s, "goblin-warrior", 7, 0); strong(s.entities.wizard);
  weak(g); strong(h);
  fight(s); turnOf(s, "wizard");
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "earthquake", slot: 8, hex: { q: 6, r: 0 } }, DM));
  assert.ok(hasCond(g, "prone"), JSON.stringify(r.events.map((e) => e.type)));
  assert.ok(!hasCond(h, "prone"));
  assert.ok(s.effects.some((fx) => fx.spell === "earthquake" && fx.conc), "the caster concentrates");
  const fx = s.effects.find((x) => x.spell === "earthquake");
  assert.ok(/"difficult":true/.test(JSON.stringify(fx)), JSON.stringify(fx));
});

test("Earthquake breaks the Concentration of a creature that fails", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 6, 0); weak(g);
  s.effects.push({ id: "fx-test", name: "Bless", spell: "bless", source: g.id, conc: true, parts: [] });
  fight(s); turnOf(s, "wizard");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "earthquake", slot: 8, hex: { q: 6, r: 0 } }, DM));
  assert.ok(!s.effects.some((fx) => fx.id === "fx-test"), "its Concentration ended");
});

test("Storm of Vengeance: a creature that fails takes Thunder damage and is Deafened, one that saves is not", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 6, 0), h = spawn(s, "goblin-warrior", 7, 0); strong(s.entities.wizard); weak(g); strong(h);
  fight(s); turnOf(s, "wizard");
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "storm-of-vengeance", slot: 9, hex: { q: 6, r: 0 } }, DM));
  assert.ok(hasCond(g, "deafened"), JSON.stringify(r.events.map((e) => e.type)));
  assert.ok(g.hp < 500 && g.hp >= 500 - 12);
  const d = r.events.find((e) => e.type === "damage" && e.target === g.id);
  assert.equal(d.dtype, "thunder");
  assert.ok(!hasCond(h, "deafened")); assert.equal(h.hp, 500);
  assert.ok(s.effects.some((fx) => fx.spell === "storm-of-vengeance" && fx.conc));
});

test("Tsunami: a creature in the wall takes 6d10 Bludgeoning, half on a successful Strength save", () => {
  const s = field();
  s.settings.strikeFirst = "all";   // a minute-long cast cannot be made in a fight: the cast lands, then the fight starts (E23)
  const g = spawn(s, "goblin-warrior", 4, 0), h = spawn(s, "goblin-warrior", 4, 1); weak(g); strong(h);
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "tsunami", slot: 8, hex: { q: 4, r: 0 } }, DM));
  const dg = r.events.find((e) => e.type === "damage" && e.target === g.id), dh = r.events.find((e) => e.type === "damage" && e.target === h.id);
  assert.ok(dg, JSON.stringify(r.events.map((e) => e.type)));
  assert.equal(dg.dtype, "bludgeoning");
  assert.ok(dg.amount >= 6 && dg.amount <= 60);
  assert.ok(dh && dh.amount <= 30, "half on a success");
  assert.ok(s.effects.some((fx) => fx.spell === "tsunami" && fx.conc));
});
