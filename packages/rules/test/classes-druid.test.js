// Druid features (SRD 5.2.1) at the levels the party plays, and the form mechanism they use
// (forms.js: Wild Shape lays a Beast's stat block over the druid and puts it back after), with
// Elemental Fury, Nature's Ward (condition Immunity from a feature) and the migration to version 17.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { migrate, VERSION } from "../src/migrate.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";
import { lintPack } from "../src/content/schema.js";

const DM = { role: "dm", userId: "dm" }, PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); };
const A = { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 };
const druid = (level, fury = "primal-strike", more = {}) => ({ name: "Ven", class: "druid", level, ...(level >= 3 ? { subclass: "land" } : {}), abilities: A,
  skills: ["nature", "perception"], choices: { "primal-order": "warden", ...(level >= 7 ? { "elemental-fury": fury } : {}), ...(level >= 10 ? { "natures-ward": "polar" } : {}) },
  armour: "leather-armor", shield: true, weapons: ["quarterstaff"], spells: ["produce-flame", "cure-wounds"], ...more });

function field(sheet) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (!["rogue", "m1"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  ok(apply(s, { type: "claim", entity: "hero", user: "pat", userName: "Pat" }, PAT));
  ok(apply(s, { type: "place", actor: "rogue", to: { q: -3, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "m1", to: { q: 2, r: 0 } }, DM));
  s.entities.m1.hp = s.entities.m1.maxHp = 300;
  return s;
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 20 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const shape = (s, form, ctx = DM) => apply(s, { type: "feature", actor: "hero", feature: "wild-shape", ...(form ? { form } : {}) }, ctx);

test("the druid's features at their levels, Wild Shape's limits by level", () => {
  const f = (l, id) => derive(druid(l)).record.feats.find((x) => x.id === id);
  assert.deepEqual(f(2, "wild-shape").action.form, { types: ["beast"], maxCr: 0.25, fly: 0, hours: 1, tempHp: 2 });
  assert.deepEqual(f(8, "wild-shape").action.form, { types: ["beast"], maxCr: 1, fly: 1, hours: 4, tempHp: 8 });
  assert.deepEqual(f(14, "wild-shape").action.form, { types: ["beast"], maxCr: 1, fly: 1, hours: 7, tempHp: 14 });
  assert.deepEqual([2, 6, 14, 17].map((l) => f(l, "wild-shape").uses.max), [2, 3, 3, 4]);
  assert.ok(validate({ ...druid(10), choices: { "primal-order": "warden", "elemental-fury": "primal-strike" } }).some((p) => /Nature's Ward/.test(p)));
  assert.deepEqual(validate(druid(15)), []);
  assert.deepEqual(derive(druid(14)).record.slots, { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 });
});

test("Wild Shape: a Bonus Action and a use; the Beast's body, the druid's mind, Hit Points and Temporary Hit Points", () => {
  const s = field(druid(14)), e = s.entities.hero;
  const before = structuredClone(e);
  e.hp = 50;
  fight(s); turnOf(s, "hero");
  const r = ok(shape(s, "brown-bear"));
  assert.equal(s.encounter.budget.bonus, 0);
  assert.equal(e.uses["wild-shape"], 2);
  assert.equal(e.size, "large"); assert.equal(e.ac, 11); assert.equal(e.speed, 40); assert.deepEqual(e.speeds, { climb: 30 });
  assert.deepEqual([e.abil.str, e.abil.dex, e.abil.con, e.abil.int, e.abil.wis, e.abil.cha], [17, 12, 15, 12, 16, 10]);
  assert.equal(e.hp, 50, "Hit Points kept"); assert.equal(e.tempHp, 14, "Temporary Hit Points equal to Druid level");
  assert.deepEqual(e.attacks, []); assert.ok(e.actions.some((a) => a.id === "bite"));
  assert.equal(e.saveBonus.wis, 3 + 5, "own Wisdom save proficiency and Proficiency Bonus");
  assert.equal(e.saveBonus.str, 3, "the bear's Strength, no proficiency");
  assert.ok(r.events.some((x) => x.type === "form" && x.form === "brown-bear"));
  assert.deepEqual(viewEvents(r.events, s, { role: "player", userId: "kim" }).find((x) => x.type === "form"), { type: "form", id: "hero", form: "brown-bear", name: "Brown Bear" });
  // A bear acts with its own attacks, and casts no spells.
  s.encounter.budget.action = 1;
  ok(apply(s, { type: "act", actor: "hero", action: "multiattack" }, DM));
  no(apply(s, { type: "cast", actor: "hero", spell: "cure-wounds", target: "hero" }, DM), /can't cast spells in the form of a Brown Bear/);
  no(apply(s, { type: "levelUp", actor: "hero", sheet: druid(15) }, DM));
  // Leaving: a Bonus Action, no use. Everything is as it was but the damage.
  turnOf(s, "m1"); turnOf(s, "hero");
  ok(shape(s, null));
  assert.equal(e.form, undefined);
  for (const k of ["size", "ac", "speed", "speeds", "abil", "attacks", "senses", "resist", "saveBonus", "skillBonus"]) assert.deepEqual(e[k], before[k], k);
  assert.equal(e.actions, undefined);
  assert.equal(e.uses["wild-shape"], 2);
  ok(apply(s, { type: "cast", actor: "hero", spell: "cure-wounds", target: "hero" }, DM));
});

test("Wild Shape is refused for a form beyond the druid's level, and changes nothing", () => {
  const s = field(druid(4)), snap = JSON.stringify(s);
  no(shape(s, "brown-bear"), /Challenge Rating 1\/2 or lower; the Brown Bear is 1/);
  no(shape(s, "eagle"), /Fly Speed/);
  no(shape(s, "goblin-warrior"), /form of a beast; the Goblin Warrior is not one/);
  no(shape(s, "nope"), /No such creature/);
  assert.equal(JSON.stringify(s), snap);
  // A screen that sends no form: the use and the Bonus Action are spent and the DM runs the form, as before it was built.
  const hand = ok(shape(s, null));
  assert.ok(hand.events.some((x) => x.type === "manual" && /No choice was sent/.test(x.text)));
  assert.equal(s.entities.hero.form, undefined);
  s.entities.hero.uses["wild-shape"] = 2;
  ok(shape(s, "ape"));
  const eight = field(druid(8));
  ok(apply(eight, { type: "feature", actor: "hero", feature: "wild-shape", form: "giant-bat" }, DM));
  assert.equal(eight.entities.hero.speeds.fly, 60);
  eight.entities.hero.uses["wild-shape"] = 0;
  no(shape(eight, "wolf"), /no uses of Wild Shape/);
});

test("Wild Shape ends on Incapacitated, on 0 Hit Points, when its hours run out, and on a new form", () => {
  const s = field(druid(6)), e = s.entities.hero, ac = e.ac;
  e.uses["wild-shape"] = 10;
  ok(shape(s, "wolf"));
  ok(shape(s, "ape"));
  assert.equal(e.form.block, "ape"); assert.equal(s.effects.filter((fx) => fx.feature === "wild-shape").length, 1);
  ok(apply(s, { type: "condition", actor: "hero", condition: "stunned" }, DM));
  assert.equal(e.form, undefined); assert.equal(e.ac, ac);
  ok(apply(s, { type: "condition", actor: "hero", condition: "stunned", on: false }, DM));
  ok(shape(s, "wolf"));
  ok(apply(s, { type: "advanceTime", minutes: 179 }, DM));
  assert.equal(e.form.block, "wolf", "three hours at level 6");
  ok(apply(s, { type: "advanceTime", minutes: 2 }, DM));
  assert.equal(e.form, undefined);
  ok(shape(s, "wolf"));
  e.tempHp = 0;
  ok(apply(s, { type: "harm", actor: "hero", amount: e.hp }, DM));
  assert.equal(e.form, undefined);
  assert.equal(e.size, "medium");
});

test("a form is plain to other players and the druid's own record is the player's", () => {
  const s = field(druid(6));
  ok(shape(s, "wolf", PAT));
  assert.equal(view(s, { role: "player", userId: "kim" }).entities.hero.form.block, "wolf", "a party member's record is the party's");
  // An enemy in a form shows only as the Beast (seenRecord; #169); the AI's druid enemies are not built, so a copy stands in.
  s.entities.foe = { ...structuredClone(s.entities.hero), id: "foe", side: "foe", kind: "npc", owner: null, pos: { q: -1, r: 1, z: 0 } };
  assert.equal(view(s, PAT).entities.foe?.tpl, "wolf");
  assert.equal(view(s, PAT).entities.foe?.name, "Wolf");
});

test("migration to version 17: a form is kept with its effect, put back without one, dropped if broken", () => {
  assert.equal(VERSION, 17);
  const s = field(druid(6)), e = s.entities.hero, ac = e.ac;
  ok(shape(s, "wolf"));
  const keep = structuredClone(s); keep.version = 16; migrate(keep);
  assert.equal(keep.version, 17); assert.equal(keep.entities.hero.form.block, "wolf");
  const lost = structuredClone(s); lost.version = 16; lost.effects = [];
  migrate(lost);
  assert.equal(lost.entities.hero.form, undefined); assert.equal(lost.entities.hero.ac, ac);
  const bad = structuredClone(s); bad.version = 16; bad.entities.hero.form = { block: 3 };
  migrate(bad);
  assert.equal(bad.entities.hero.form, undefined);
  void e;
});

test("Primal Strike: once on each of the druid's turns, a Beast form's bite too; Potent Spellcasting adds Wisdom to cantrips", () => {
  const s = field(druid(15));
  ok(apply(s, { type: "place", actor: "m1", to: { q: 1, r: 0 } }, DM));
  fight(s); turnOf(s, "hero");
  s.entities.m1.resist = ["cold", "fire"];
  s.entities.hero.attacks.find((a) => a.id === "quarterstaff").bonus = 50;
  const r = ok(apply(s, { type: "attack", actor: "hero", attack: "quarterstaff", target: "m1" }, DM));
  const extra = r.events.filter((x) => x.type === "damage" && x.dtype !== "bludgeoning");
  assert.equal(extra.length, 1); assert.equal(extra[0].dtype, "lightning", "not one the goblin resists");
  assert.equal(extra[0].dice.length >= 2, true, "2d8 at 15");
  turnOf(s, "m1"); turnOf(s, "hero");
  ok(shape(s, "wolf"));
  s.entities.hero.actions.find((a) => a.id === "bite").effects[0].bonus = 50;
  const b = ok(apply(s, { type: "act", actor: "hero", action: "bite", target: "m1" }, DM));
  assert.equal(b.events.filter((x) => x.type === "damage" && x.dtype === "lightning").length, 1, "a Beast form's attack");
  const p = derive(druid(7, "potent-spellcasting")).record.feats.find((f) => f.id === "elemental-fury-potent-spellcasting");
  assert.deepEqual(p.modifiers, [{ on: "damage.dealt", op: "add", value: 3, when: ["spell.cantrip"] }]);
});

test("Nature's Ward: immune to Poisoned, and Resistance by the land", () => {
  const { record } = derive(druid(10));
  assert.deepEqual(record.conditionImmune, ["poisoned"]);
  assert.deepEqual(record.resist, ["cold"]);
  const s = field(druid(10));
  no(apply(s, { type: "condition", actor: "hero", condition: "poisoned" }, DM), /immune to Poisoned/);
  assert.equal(derive(druid(9)).record.conditionImmune, undefined);
});

test("the linter takes a form and condition immunity, and refuses bad ones", () => {
  const cls = (grants) => ({ id: "x", name: "X", source: "S", text: "t", checked: false, hitDie: 8, primary: ["str"], saves: ["str", "con"], armour: [], weapons: ["simple"],
    skills: { choose: 1, from: ["athletics"] }, table: {}, casting: null, features: [{ id: "f", name: "F", level: 1, tier: "auto", checked: false, text: "t", grants }],
    subclass: { id: "s", name: "S", text: "t", checked: false, features: [] } });
  const lint = (g) => lintPack({ pack: { id: "p", name: "P", license: "L", attribution: "A" }, classes: [cls(g)] });
  const form = { types: ["beast"], maxCr: { byLevel: { 1: 0.25 } }, fly: 0, hours: 1, tempHp: { perLevel: 1 } };
  assert.deepEqual(lint({ action: { time: "bonus", target: { self: true }, form } }), []);
  assert.ok(lint({ action: { time: "bonus", target: { self: true }, form: { ...form, types: ["robot"] } } }).some((p) => /form.types/.test(p)));
  assert.ok(lint({ action: { time: "bonus", target: { self: true }, form: { ...form, fly: 2 } } }).some((p) => /form.fly/.test(p)));
  assert.ok(lint({ action: { time: "bonus", target: { self: true }, form, effects: [{ manual: "x" }] } }).some((p) => /no effects/.test(p)));
  assert.deepEqual(lint({ conditionImmune: ["poisoned"] }), []);
  assert.ok(lint({ conditionImmune: ["grumpy"] }).some((p) => /conditionImmune/.test(p)));
});
