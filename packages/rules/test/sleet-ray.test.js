// Pins two spell entries against SRD 5.2.1 (the wording of PR #113's second look): Sleet Storm's area and range,
// and Ray of Enfeeblement's failed-save effect on Strength-based attack rolls.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { apply, current } from "../src/engine.js";
import { modifiers } from "../src/modifiers.js";
import { holds, zonesOf } from "../src/zones.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
function field() {
  const s = newGame(5);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.encounter = null; s.settings.autoEngage = false;
  ok(apply(s, { type: "place", actor: "wizard", to: { q: -13, r: 0 } }, DM));
  Object.assign(s.entities.wizard, { slots: { 1: 4, 2: 3, 3: 3 }, slotsMax: { 1: 4, 2: 3, 3: 3 }, hp: 500, maxHp: 500 });
  s.entities.wizard.spells.push("ray-of-enfeeblement", "sleet-storm");
  return s;
}
const spawn = (s, q, r) => { const e = s.entities[ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 300; return e; };
const turnOf = (s, id) => { for (let i = 0; i < 60 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 14 }, DM));

test("Sleet Storm entry: a 20-foot-radius, 40-foot-tall cylinder, range 150 feet", () => {
  const d = SPELLS["sleet-storm"].def;
  assert.equal(d.range, 150);
  assert.deepEqual(d.target.area, { shape: "cylinder", size: 20, height: 40 });
});

test("Sleet Storm: the cast zone holds 20 feet out and 40 feet up, and nothing beyond", () => {
  const s = field();
  const near = spawn(s, -4, 0), edge = spawn(s, -4, 4), out = spawn(s, -4, 5), tall = spawn(s, -4, 1), high = spawn(s, -4, 2);
  fight(s); turnOf(s, "wizard");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "sleet-storm", hex: { q: -4, r: 0 } }, DM));
  const [fx] = zonesOf(s);
  assert.ok(fx, "a zone was made");
  assert.equal(fx.zone.area.size, 20);
  assert.equal(fx.zone.area.height, 40);
  const held = (e) => holds(s, fx, e);
  assert.equal(held(near), true, "at the centre");
  assert.equal(held(edge), true, "4 hexes (20 feet) out");
  assert.equal(held(out), false, "5 hexes (25 feet) out");
  tall.pos.z = 40; high.pos.z = 45;
  assert.equal(held(tall), true, "40 feet up");
  assert.equal(held(high), false, "45 feet up");
});

test("Sleet Storm: may be centred 150 feet away, not 155", () => {
  const far = (q) => { const s = field(); for (let i = 14; i <= 17; i++) s.map.levels[0].tiles[`${i},0`] = { t: "grass" };
    ok(apply(s, { type: "place", actor: "wizard", to: { q: -13, r: 0 } }, DM)); return apply(s, { type: "cast", actor: "wizard", spell: "sleet-storm", hex: { q, r: 0 } }, DM); };
  ok(far(17));
  assert.equal(far(18).ok, false, "31 hexes is 155 feet");
});

test("Ray of Enfeeblement: on a failed save, Disadvantage on Strength-based attack rolls only", () => {
  const d = SPELLS["ray-of-enfeeblement"].def;
  assert.equal(d.range, 60);
  assert.deepEqual(d.effects[0].onFail[0], { modifier: { on: "attack.roll", op: "disadvantage", when: ["attack.str"] } });
  const s = field(), a = spawn(s, -9, 0);
  a.abil.con = 1; a.saveBonus = { ...(a.saveBonus ?? {}), con: -10 };
  fight(s); turnOf(s, "wizard");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "ray-of-enfeeblement", target: a.id }, DM));
  const atk = (str) => modifiers(s, a, "attack.roll", { attack: "melee", target: s.entities.wizard, str }).disadvantage.length;
  assert.ok(atk(true) > 0, "a Strength attack");
  assert.equal(atk(false), 0, "a Dexterity attack");
  assert.equal(atk(undefined), 0, "an attack with no stated ability (a spell attack)");
});
