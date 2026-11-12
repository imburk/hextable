// The `min` and `max` ops and the hooks nothing read (DEBT S7): Barkskin, Aid, Hex, Hunter's
// Mark, Divine Favor, spell.dc and spell.attack.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";
import { spellProfile } from "../src/effects.js";
import { apply, current, spellStats } from "../src/engine.js";
import { modifiers } from "../src/modifiers.js";
import { newGame } from "../src/scenario.js";
import { viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PLAYER = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", 0, 0], ["fighter", 1, 0], ["rogue", 0, 1], ["cleric", 1, -1]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  for (const id of ["wizard", "fighter", "cleric"]) Object.assign(s.entities[id], { slots: { 1: 4, 2: 3, 3: 3 }, slotsMax: { 1: 4, 2: 3, 3: 3 } });
  return s;
}
const spawn = (s, monster, q, r) => { const e = s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 300; return e; };
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const fresh = (s) => { s.encounter.budget.action = 1; s.encounter.budget.bonus = 1; s.encounter.flags = {}; delete s.encounter.budget.attacks; };

test("Barkskin: Armor Class at least 17, and a higher one stays", () => {
  const s = field();
  ok(apply(s, { type: "place", actor: "rogue", to: { q: -3, r: 3 } }, DM));
  const g = spawn(s, "goblin-warrior", 0, 1);                           // beside the wizard and the fighter
  s.entities.cleric.spells.push("barkskin");
  ok(apply(s, { type: "cast", actor: "cleric", spell: "barkskin", target: "wizard" }, DM));
  ok(apply(s, { type: "cast", actor: "cleric", spell: "barkskin", target: "fighter", slot: 2 }, DM));
  assert.equal(modifiers(s, s.entities.wizard, "ac").min, 17);
  fight(s); turnOf(s, g.id);
  const rend = g.actions.find((a) => a.effects?.[0]?.attack === "melee").id;
  const atk = (t) => { fresh(s); return ok(apply(s, { type: "act", actor: g.id, action: rend, target: t }, DM)).events.find((e) => e.type === "attack"); };
  assert.equal(atk("wizard").ac, 17);
  assert.equal(atk("fighter").ac, s.entities.fighter.ac);
});

test("Aid raises the Hit Point maximum and current Hit Points, more with a higher slot, and takes it back", () => {
  const s = field(), w = s.entities.wizard, f = s.entities.fighter;
  s.entities.cleric.spells.push("aid");
  const [wMax, fMax] = [w.maxHp, f.maxHp];
  w.hp = wMax - 3;
  ok(apply(s, { type: "cast", actor: "cleric", spell: "aid", targets: ["wizard", "fighter"], slot: 3 }, DM));
  assert.deepEqual([w.maxHp, w.hp, f.maxHp, f.hp], [wMax + 10, wMax + 7, fMax + 10, fMax + 10]);
  ok(apply(s, { type: "advanceTime", minutes: 481 }, DM));
  assert.deepEqual([w.maxHp, w.hp, f.maxHp, f.hp], [wMax, wMax, fMax, fMax]);
});

test("Hex: extra necrotic damage on the caster's hits against the target only, and Disadvantage on checks of the chosen ability", () => {
  const s = field(), a = spawn(s, "goblin-warrior", 3, 0), b = spawn(s, "goblin-warrior", 3, 2);
  s.entities.wizard.spells.push("hex");
  for (const g of [a, b]) g.ac = 1;
  fight(s); turnOf(s, "wizard");
  assert.match(apply(s, { type: "cast", actor: "wizard", spell: "hex", target: a.id }, DM).error, /Choose an ability/);
  ok(apply(s, { type: "cast", actor: "wizard", spell: "hex", target: a.id, choice: "str" }, DM));
  assert.equal(modifiers(s, a, "check", { ability: "str" }).disadvantage.length, 1);
  assert.equal(modifiers(s, a, "check", { ability: "dex" }).disadvantage.length, 0);
  const bolt = (t) => { fresh(s); return ok(apply(s, { type: "cast", actor: "wizard", spell: "fire-bolt", target: t }, DM)).events; };
  let ev = null;
  for (let i = 0; i < 10 && !ev?.some((e) => e.type === "damage"); i++) ev = bolt(a.id);
  assert.deepEqual(ev.filter((e) => e.type === "damage").map((e) => e.dtype), ["fire", "necrotic"]);
  assert.equal(viewEvents(ev, s, PLAYER).filter((e) => e.type === "damage").length, 2, "players see both parts of the damage");
  ev = null;
  for (let i = 0; i < 10 && !ev?.some((e) => e.type === "damage"); i++) ev = bolt(b.id);
  assert.deepEqual(ev.filter((e) => e.type === "damage").map((e) => e.dtype), ["fire"]);
});

test("Hunter's Mark and Divine Favor: extra damage on a hit; Divine Favor only with weapons", () => {
  const s = field(), g = spawn(s, "goblin-warrior", 2, 0);
  g.ac = 1;
  const f = s.entities.fighter;
  f.spells.push("divine-favor", "hunters-mark", "fire-bolt");
  f.castAbil = "wis";
  ok(apply(s, { type: "cast", actor: "fighter", spell: "divine-favor" }, DM));
  fight(s); turnOf(s, "fighter");
  ok(apply(s, { type: "cast", actor: "fighter", spell: "hunters-mark", target: g.id }, DM));
  let ev = null;
  for (let i = 0; i < 10 && !ev?.some((e) => e.type === "damage"); i++) { fresh(s); ev = ok(apply(s, { type: "attack", actor: "fighter", target: g.id, attack: f.attacks.find((a) => a.type === "melee").id }, DM)).events; }
  assert.deepEqual(ev.filter((e) => e.type === "damage").map((e) => e.dtype).slice(1).sort(), ["force", "radiant"]);
  ev = null;
  for (let i = 0; i < 10 && !ev?.some((e) => e.type === "damage"); i++) { fresh(s); ev = ok(apply(s, { type: "cast", actor: "fighter", spell: "fire-bolt", target: g.id }, DM)).events; }
  assert.deepEqual(ev.filter((e) => e.type === "damage").map((e) => e.dtype), ["fire", "force"], "a spell attack is not a weapon: no radiant");
});

test("spell.dc and spell.attack modifiers change a caster's numbers", () => {
  const s = field(), w = s.entities.wizard;
  const def = { id: "test-focus", name: "Test Focus", source: "test", level: 1, school: "abjuration", classes: [], time: "action", range: "self",
    components: ["v"], duration: "1 minute", concentration: false, ritual: false, target: { self: true },
    effects: [{ modifier: { on: "spell.dc", op: "add", value: 2 } }, { modifier: { on: "spell.attack", op: "max", value: 3 } }], tier: "auto", checked: false, text: "Test." };
  assert.deepEqual(lintPack({ pack: { id: "t", name: "t", license: "x", attribution: "x" }, spells: [def] }), []);
  SPELLS[def.id] = spellProfile(def);
  w.spells.push(def.id);
  const before = spellStats(w, s);
  ok(apply(s, { type: "cast", actor: "wizard", spell: def.id }, DM));
  assert.deepEqual(spellStats(w, s), { dc: before.dc + 2, attack: Math.min(3, before.attack) });
  delete SPELLS[def.id];
});
