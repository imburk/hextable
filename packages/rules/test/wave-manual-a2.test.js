// Issue #861 (part of #786): Earthquake, Storm of Vengeance and Tsunami were `manual`; their opening save is now the engine's, the rest stays the DM's.
// Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { apply, current } from "../src/engine.js";
import { has } from "../src/modifiers.js";
import { difficultAt } from "../src/terrain.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const lint = (def) => lintEntry("spells", def, { strict: false });

function field() {
  const s = newGame(5);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  // a map wide enough for creatures at 90 and 110 feet (18 and 22 hexes of 5 feet) and past 300 feet
  for (let q = -80; q <= 80; q++) for (let r = -80; r <= 80; r++) if (Math.abs(q + r) <= 80) s.map.levels[0].tiles[`${q},${r}`] = { t: "grass" };
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
const fight = (s, radius = 12) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius }, DM));
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

const fxOf = (s, spell) => s.effects.find((x) => x.spell === spell);
const terrainAt = (s, q, r) => difficultAt(s, { q, r, z: 0 });

test("Earthquake: a creature at 90 feet that fails is Prone and loses Concentration, one that saves is not, one at 110 feet is untouched, and the ground is Difficult Terrain", () => {
  const s = field();
  strong(s.entities.wizard);
  // 90 feet is 18 hexes, 110 feet 22: the ring of 100 feet from the point aimed at (the caster stands at 0,0 and aims at itself)
  const inA = spawn(s, "goblin-warrior", 18, 0), inB = spawn(s, "goblin-warrior", 17, 1), out = spawn(s, "goblin-warrior", 22, 0);
  weak(inA); strong(inB); weak(out);
  fight(s, 30); turnOf(s, "wizard");
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "earthquake", slot: 8, hex: { q: 0, r: 0 } }, DM));
  assert.ok(has(inA, "prone"), JSON.stringify(r.events.map((e) => e.type)));
  assert.ok(!has(inB, "prone"));
  assert.ok(!has(out, "prone") && out.hp === 500, "outside 100 feet: no save, no Prone");
  assert.ok(!r.events.some((e) => e.type === "save" && e.id === out.id));
  assert.ok(fxOf(s, "earthquake").conc, "the caster concentrates");
  assert.equal(terrainAt(s, 3, 0), true, "Difficult Terrain inside");
  assert.equal(terrainAt(s, 25, 0), false, "none outside");
});

test("Earthquake: the Prone is held by the spell and clears when it ends (the entry says the DM keeps it)", () => {
  const s = field(); strong(s.entities.wizard);
  const g = spawn(s, "goblin-warrior", 6, 0); weak(g);
  fight(s); turnOf(s, "wizard");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "earthquake", slot: 8, hex: { q: 6, r: 0 } }, DM));
  assert.ok(has(g, "prone"));
  ok(apply(s, { type: "endEffect", actor: "wizard", effect: fxOf(s, "earthquake").id }, DM));
  assert.ok(!has(g, "prone"));
  assert.match(SPELLS.earthquake.def.effects.find((x) => x.manual).manual, /clears when the spell ends/);
});

test("Earthquake: the caster is in the area and saves too: a failure ends its own Concentration and the whole spell, terrain included", () => {
  const s = field(); weak(s.entities.wizard);
  const g = spawn(s, "goblin-warrior", 6, 0); weak(g);
  fight(s); turnOf(s, "wizard");
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "earthquake", slot: 8, hex: { q: 6, r: 0 } }, DM));
  const sv = r.events.find((e) => e.type === "save" && e.id === "wizard");
  assert.ok(sv && sv.success === false, "the caster failed its own save: " + JSON.stringify(sv));
  assert.ok(!fxOf(s, "earthquake"), "the spell ended at once");
  assert.equal(terrainAt(s, 6, 0), false, "and its terrain with it");
  assert.match(SPELLS.earthquake.def.text, /caster is in the circle and saves too/);
});

test("Earthquake breaks the Concentration of a creature that fails", () => {
  const s = field(); strong(s.entities.wizard);
  const g = spawn(s, "goblin-warrior", 6, 0); weak(g);
  s.effects.push({ id: "fx-test", name: "Bless", spell: "bless", source: g.id, conc: true, parts: [] });
  fight(s); turnOf(s, "wizard");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "earthquake", slot: 8, hex: { q: 6, r: 0 } }, DM));
  assert.ok(!s.effects.some((fx) => fx.id === "fx-test"), "its Concentration ended");
});

test("Storm of Vengeance: a creature that fails takes Thunder damage and is Deafened (until the spell ends), one that saves is not, one outside is untouched", () => {
  const s = field(); strong(s.entities.wizard);
  const g = spawn(s, "goblin-warrior", 6, 0), h = spawn(s, "goblin-warrior", 7, 0), out = spawn(s, "goblin-warrior", 70, 0); weak(g); strong(h); weak(out);
  fight(s); turnOf(s, "wizard");
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "storm-of-vengeance", slot: 9, hex: { q: 6, r: 0 } }, DM));
  assert.ok(has(g, "deafened"), JSON.stringify(r.events.map((e) => e.type)));
  const d = r.events.find((e) => e.type === "damage" && e.target === g.id);
  assert.equal(d.dtype, "thunder"); assert.ok(g.hp < 500 && g.hp >= 500 - 12);
  assert.ok(!has(h, "deafened") && h.hp === 500);
  assert.ok(!has(out, "deafened") && out.hp === 500, "outside 300 feet");
  assert.ok(fxOf(s, "storm-of-vengeance").conc);
  ok(apply(s, { type: "endEffect", actor: "wizard", effect: fxOf(s, "storm-of-vengeance").id }, DM));
  assert.ok(!has(g, "deafened"), "Deafened ends with the spell");
});

test("Tsunami: a creature in the wall takes 6d10 Bludgeoning, exactly half on a successful Strength save; one outside is untouched", () => {
  const s = field();
  s.settings.strikeFirst = "all";   // a minute-long cast cannot be made in a fight: the cast lands, then the fight starts (E23)
  const g = spawn(s, "goblin-warrior", 4, 0), h = spawn(s, "goblin-warrior", 4, 1), out = spawn(s, "goblin-warrior", 4, 30); weak(g); strong(h);
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "tsunami", slot: 8, hex: { q: 4, r: 0 } }, DM));
  const dmg = (id) => r.events.find((e) => e.type === "damage" && e.target === id);
  const dg = dmg(g.id), dh = dmg(h.id);
  assert.ok(dg && dh, JSON.stringify(r.events.map((e) => e.type)));
  assert.equal(dg.dtype, "bludgeoning");
  const total = dg.dice.reduce((n, d) => n + d.value, 0);
  assert.equal(dg.dice.length, 6); assert.equal(dg.amount, total, "full damage on a failure");
  assert.equal(dh.rolled, total); assert.equal(dh.amount, Math.floor(total / 2), "exactly half on a success");
  const saved = r.events.find((e) => e.type === "save" && e.id === h.id);
  assert.ok(saved && saved.success !== false, JSON.stringify(saved));
  assert.ok(!dmg(out.id) && out.hp === 500, "outside the wall");
  assert.ok(fxOf(s, "tsunami").conc);
  assert.match(SPELLS.tsunami.def.text, /100 feet high/); assert.match(SPELLS.tsunami.def.effects.find((x) => x.manual).manual, /100 feet high/);
});
