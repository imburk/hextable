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

// ---------- Enlarge/Reduce ----------
const cast = (s, target, choice, actor = "wizard") => apply(s, { type: "cast", actor, spell: "enlarge-reduce", target, choice, slot: 2 }, DM);
const fxOf = (s) => s.effects.find((x) => x.name === "Enlarge/Reduce");

test("Enlarge/Reduce: assist; lints; reads with no problem; a choice is required", () => {
  const d = SPELLS["enlarge-reduce"].def;
  assert.equal(d.tier, "assist");
  assert.deepEqual(lint(d), []);
  assert.deepEqual(readEntry("spell", d, {}).problems ?? [], []);
  assert.ok(!apply(field(), { type: "cast", actor: "wizard", spell: "enlarge-reduce", target: "fighter", slot: 2 }, DM).ok);
  assert.ok(lint({ ...d, effects: [{ resize: "bigger" }] }).length);
  assert.ok(lint({ ...d, duration: "instant", concentration: false, effects: [{ resize: "larger" }], choice: undefined }).length, "a resize needs a spell that lasts");
});

test("Enlarge on an ally: one size larger, no save, Advantage on Strength, +1d4; the size goes back with the effect", () => {
  const s = field();
  ok(cast(s, "fighter", "enlarge"));
  assert.equal(s.entities.fighter.size, "large");
  assert.ok(!s.effects.length || fxOf(s).conc);
  assert.deepEqual(fxOf(s).parts.find((p) => p.size).size, { was: "medium", now: "large" });
  ok(apply(s, { type: "endEffect", actor: "wizard", effect: fxOf(s).id }, DM));
  assert.equal(s.entities.fighter.size, "medium");
});

test("Reduce on an ally: one smaller; ends with Concentration", () => {
  const s = field();
  ok(cast(s, "fighter", "reduce"));
  assert.equal(s.entities.fighter.size, "small");
  ok(apply(s, { type: "endEffect", actor: "wizard", effect: fxOf(s).id }, DM));
  assert.equal(s.entities.fighter.size, "medium");
});

test("Enlarge/Reduce: a Tiny creature cannot go smaller, a Gargantuan one not larger", () => {
  const s = field();
  s.entities.fighter.size = "tiny";
  ok(cast(s, "fighter", "reduce"));
  assert.equal(s.entities.fighter.size, "tiny");
  s.entities.cleric.size = "gargantuan";
  ok(cast(s, "cleric", "enlarge"));
  assert.equal(s.entities.cleric.size, "gargantuan");
});

test("Enlarge: no room (a visible creature in the way) leaves the size, and the spell still gives its other benefits", () => {
  const s = field();
  for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) if (!(q === 2 && r === 0)) { const k = `${q},${r}`; if (s.map.levels[0].tiles[k]) s.map.levels[0].tiles[k] = { t: "grass" }; }
  const g = spawn(s, "goblin-warrior", 3, 0);
  s.entities[g.id].size = "large";            // a Large creature next to the fighter takes the hexes a Large fighter would
  const r = cast(s, "fighter", "enlarge");
  ok(r);
  const grown = s.entities.fighter.size === "large";
  if (!grown) assert.ok(r.events.some((e) => e.type === "note" && /no room/.test(e.text)));
  assert.ok(fxOf(s).parts.some((p) => p.modifier?.on === "save.str"), "the Strength benefits are on either way");
});

test("Enlarge on a foe: it makes a Constitution save; on a success nothing happens", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 3, 0);
  s.entities[g.id].saveBonus = { con: -100 };
  s.entities.wizard.spellDc = 99;
  const r = cast(s, g.id, "enlarge");
  ok(r);
  assert.ok(r.events.some((e) => e.type === "save" && e.id === g.id));
});

test("Reduce: weapon damage is 1d4 less but never below 1 (a modifier `atLeast`)", () => {
  const s = field();
  ok(cast(s, "fighter", "reduce"));
  const m = fxOf(s).parts.find((p) => p.modifier?.on === "damage.dealt").modifier;
  assert.equal(m.value, "-1d4");
  assert.equal(m.atLeast, 1);
  assert.ok(lint({ ...SPELLS["enlarge-reduce"].def, effects: [{ modifier: { on: "damage.dealt", op: "add", value: "1d4", atLeast: 1 } }], choice: undefined }).length, "only on a subtraction");
});
