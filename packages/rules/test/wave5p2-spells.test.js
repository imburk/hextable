// Wave 5, part 2, of issue #786: Daylight (assist: a lit sphere, `terrain.light`) and Enlarge/Reduce.
// Built to docs/specs/rules-expansion.md, "Build notes: wave 5 part 2". Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { apply } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { lightAt } from "../src/sight.js";
import { partyView } from "../src/vision.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const lint = (def) => lintEntry("spells", def, { strict: false });
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  for (let q = -16; q <= 40; q++) for (let r = -3; r <= 3; r++) s.map.levels[0].tiles[`${q},${r}`] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", 0, 0], ["fighter", -2, 0], ["rogue", -4, 2], ["cleric", -3, 0]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  const slots = { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 2 };
  for (const id of ["wizard", "cleric"]) Object.assign(s.entities[id], { slots: { ...slots }, slotsMax: { ...slots } });
  s.entities.wizard.spells.push("daylight", "enlarge-reduce");
  s.entities.cleric.spells.push("daylight");
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 40;
  return s;
}
const spawn = (s, id, q, r) => { ok(apply(s, { type: "spawn", monster: id, at: { q, r } }, DM)); return Object.values(s.entities).at(-1); };
const dark = (s) => { s.settings.sight = "light"; ok(apply(s, { type: "mapEdit", ops: [{ op: "level", level: { id: "ground", light: "dark" } }] }, DM)); };
const at = (q, r = 0) => ({ q, r, z: 0 });

test("Daylight: assist; lints; reads with no problem; terrain.light is refused where it makes no sense", () => {
  const d = SPELLS.daylight.def;
  assert.equal(d.tier, "assist");
  assert.deepEqual(lint(d), []);
  assert.deepEqual(readEntry("spell", d, {}).problems ?? [], []);
  assert.ok(lint({ ...d, terrain: { light: 7 } }).length, "feet in fives");
  assert.ok(lint({ ...d, terrain: { light: 125 } }).length, "at most 120");
  assert.ok(lint({ ...d, target: { self: true } }).length, "needs a sphere");
  assert.ok(lint({ ...d, duration: "instant", concentration: false, terrain: { light: 60, lasts: "nextTurnEnd" } }).length, "needs to last");
});

test("Daylight: Bright Light inside 60 feet of the point, Dim Light 60 feet beyond, dark past that; it ends with the effect", () => {
  const s = field();
  dark(s);
  ok(apply(s, { type: "cast", actor: "wizard", spell: "daylight", hex: { q: 6, r: 0 }, slot: 3 }, DM));
  const fx = s.effects.find((x) => x.name === "Daylight");
  assert.ok(fx?.terrain?.light === 60);
  assert.equal(fx.lasts, "1 hour");
  assert.ok(!fx.conc && !s.entities.wizard.conc, "no Concentration");
  assert.equal(lightAt(s, at(6 + 12)), "bright", "60 feet from the point");
  assert.equal(lightAt(s, at(6 + 13)), "dim", "65 feet");
  assert.equal(lightAt(s, at(6 + 24)), "dim", "120 feet");
  assert.equal(lightAt(s, at(6 + 25)), "dark", "125 feet");
  ok(apply(s, { type: "endEffect", actor: "wizard", effect: fx.id }, DM));
  assert.equal(lightAt(s, at(6 + 1)), "dark");
});

test("Daylight: the party's view follows the cast and the end (no stale cache)", () => {
  const s = field();
  dark(s);
  const g = spawn(s, "goblin-warrior", 8, 0);
  assert.ok(!partyView(s).creatures.has(g.id), "before");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "daylight", hex: { q: 8, r: 0 }, slot: 3 }, DM));
  assert.ok(partyView(s).creatures.has(g.id), "lit");
  ok(apply(s, { type: "endEffect", actor: "wizard", effect: s.effects.find((x) => x.name === "Daylight").id }, DM));
  assert.ok(!partyView(s).creatures.has(g.id), "after it ends");
});

test("Daylight: a caster the DM keeps hidden still lights the players' view (the cast is public)", () => {
  const s = field();
  dark(s);
  s.entities.cleric.hidden = true;
  const g = spawn(s, "goblin-warrior", 8, 0);
  ok(apply(s, { type: "cast", actor: "cleric", spell: "daylight", hex: { q: 8, r: 0 }, slot: 3 }, DM));
  assert.ok(partyView(s).creatures.has(g.id));
});

test("Daylight: a DM-hidden creature in the sphere stays hidden (the light shows, it does not find)", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 8, 0);
  s.entities[g.id].hidden = true;
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "daylight", hex: { q: 8, r: 0 }, slot: 3 }, DM));
  assert.ok(s.entities[g.id].hidden && !r.events.some((e) => e.type === "revealed"));
});
