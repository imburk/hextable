// Monsters' saving throw bonuses (DEBT M10): the SAVE column of the stat block.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CONTENT, legacyMonster, MONSTERS, PACKS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";
import { apply, current, makeEntity, mod } from "../src/engine.js";
import { migrate } from "../src/migrate.js";
import { newGame } from "../src/scenario.js";
import { view } from "../src/view.js";

const srd = PACKS[0];
const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const withMonster = (change) => { const m = structuredClone(srd.monsters[0]); change(m); return lintPack({ ...srd, monsters: [m] }).join(" | "); };

// A cleric's Sacred Flame (a Dexterity save) at a creature next to it; returns the save the creature made.
function dexSave(tpl, patch = {}, seed = 7) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  ok(apply(s, { type: "place", actor: "cleric", to: { q: 0, r: 0 } }, DM));
  const id = ok(apply(s, { type: "spawn", monster: tpl, at: { q: 1, r: 0 } }, DM)).events[0].id;
  Object.assign(s.entities[id], patch);
  s.entities[id].hp = s.entities[id].maxHp = 500;
  s.entities.cleric.spells.push("sacred-flame");
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }, DM));
  for (let i = 0; i < 40 && current(s) !== "cleric"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  const r = ok(apply(s, { type: "cast", actor: "cleric", spell: "sacred-flame", target: id }, DM));
  return { sv: r.events.find((e) => e.type === "save"), e: s.entities[id] };
}

test("the linter accepts a saves map of whole numbers for abilities and rejects anything else", () => {
  assert.equal(withMonster((m) => { m.saves = { dex: 3 }; }), "");
  assert.equal(withMonster((m) => { m.saves = { str: -1, dex: 3, con: 0, int: 8, wis: 6, cha: 4 }; }), "");
  assert.equal(withMonster((m) => { delete m.saves; }), "");
  for (const bad of [{}, { luck: 3 }, { dex: 3.5 }, { dex: "3" }, { dex: 99 }, [3], null, 3]) assert.match(withMonster((m) => { m.saves = bad; }), /saves must give/, JSON.stringify(bad));
});

test("a monster with a listed save uses it in place of the modifier", () => {
  const { sv, e } = dexSave("aboleth");                                  // Dex 9 (modifier -1), SAVE +3 in the SRD
  assert.deepEqual(e.saveBonus, { dex: 3, con: 6, int: 8, wis: 6 });
  assert.equal(mod(e.abil.dex), -1);
  assert.equal(sv.total - sv.roll, 3);
  const { sv: forced } = dexSave("aboleth", { saveBonus: { dex: 11 } });
  assert.equal(forced.total - forced.roll, 11);                          // whatever the creature carries is what it adds
});

test("a monster without one falls back to the ability modifier, and a creature's Proficiency still counts", () => {
  const wolf = dexSave("wolf");                                          // Dex 15: +2, no SAVE of its own
  assert.deepEqual(wolf.e.saveBonus, {});
  assert.equal(wolf.sv.total - wolf.sv.roll, 2);
  const ab = dexSave("aboleth", { saveBonus: { wis: 6 } });             // a save listed for another ability changes nothing here
  assert.equal(ab.sv.total - ab.sv.roll, -1);
  const prof = dexSave("wolf", { saveProf: ["dex"] });                   // the old path: modifier plus Proficiency Bonus
  assert.equal(prof.sv.total - prof.sv.roll, 2 + prof.e.prof);
  assert.deepEqual(makeEntity({ name: "Plain", hp: 1 }).saveBonus, {});
});

test("saves reach the engine from the pack, only where the SRD lists them", () => {
  assert.equal(legacyMonster({ ...structuredClone(srd.monsters[0]), saves: undefined }).saveBonus, undefined);
  assert.deepEqual(MONSTERS.aboleth.saveBonus, { dex: 3, con: 6, int: 8, wis: 6 });
  assert.equal(MONSTERS.wolf.saveBonus, undefined);
  // Every listed save differs from the plain modifier, and by the monster's Proficiency Bonus (the SRD's Saving Throw proficiency).
  for (const m of Object.values(CONTENT.monsters)) for (const [a, v] of Object.entries(m.saves ?? {})) assert.equal(v - mod(m.abilities[a]), m.pb, `${m.id} ${a}`);
});

test("saved creatures get their saves when a table loads, and keep any they already have", () => {
  const s = newGame(3);
  const id = ok(apply(s, { type: "spawn", monster: "aboleth", at: { q: 1, r: 1 } }, DM)).events[0].id;
  delete s.entities[id].saveBonus;
  for (const e of Object.values(s.entities)) delete e.saveBonus;
  migrate(s);
  assert.deepEqual(s.entities[id].saveBonus, { dex: 3, con: 6, int: 8, wis: 6 });
  assert.deepEqual(s.entities.fighter.saveBonus, {});
  s.entities[id].saveBonus = { str: 1 };
  assert.deepEqual(migrate(s).entities[id].saveBonus, { str: 1 });
  const old = migrate(JSON.parse(readFileSync(new URL("./fixtures/table-v1.json", import.meta.url), "utf8")).state);
  for (const e of Object.values(old.entities)) assert.equal(typeof e.saveBonus, "object", e.id);
});

test("a player's view of a monster does not carry its saves", () => {
  const s = newGame(5);
  const id = ok(apply(s, { type: "spawn", monster: "aboleth", at: { q: 1, r: 1 } }, DM)).events[0].id;
  assert.deepEqual(s.entities[id].saveBonus, { dex: 3, con: 6, int: 8, wis: 6 });
  const v = view(s, { role: "player", userId: "pat" }).entities[id];
  assert.ok(v, "the player sees the aboleth");
  assert.ok(!("saveBonus" in v));
});
