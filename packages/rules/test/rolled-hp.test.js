// Rolled Hit Points (#638): the settings hpMethod and hpRollLow, the sheet's hpRolls, the actions rollHp and rerollHp, rolls at level-up and for a character
// added above level 1, the seed's replay, forged rolls, undo, multiclass, and other Hit Point grants.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, SETTINGS, SETTING_TEXT } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { migrate } from "../src/migrate.js";
import { derive, validate } from "../src/derive.js";
import { viewEvents } from "../src/view.js";
import { keyedRng } from "../src/rng.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { rollLevel } from "../src/hitpoints.js";

const DM = { role: "dm", userId: "dm" }, ANA = { role: "player", userId: "ana" }, BEN = { role: "player", userId: "ben" };
const KEY = "0123456789abcdef".repeat(4);
const A = { str: 15, dex: 12, con: 14, int: 10, wis: 12, cha: 8 };      // Constitution +2
const fighter = (level, more = {}) => ({ name: "Brann", class: "fighter", level, ...(level >= 3 ? { subclass: "champion" } : {}), abilities: A, skills: ["athletics", "perception"],
  choices: { "fighting-style": "defense" }, armour: "chain-mail", weapons: ["longsword"], ...more });
const json = (x) => JSON.stringify(x);
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); return r; };
function table(settings = { hpMethod: "rolled" }) {
  const s = newGame(7); s.rng = keyedRng(KEY);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  s.settings.autoEngage = false;
  Object.assign(s.settings, settings);
  return s;
}
const add = (s, sheet, ctx = DM) => { const r = ok(apply(s, { type: "setSheet", sheet, at: { q: 0, r: 0, z: 0 } }, ctx)); return { id: r.events.find((e) => e.type === "spawned").id, r }; };
const hpOf = (s, id) => s.entities[id].maxHp;
const fixedHp = (level, con = 2) => 10 + con + (level - 1) * (6 + con);

test("two settings, the first of each the default; only the DM changes them; both have words", () => {
  assert.deepEqual(SETTINGS.hpMethod, ["fixed", "rolled"]);
  assert.deepEqual(SETTINGS.hpRollLow, ["keep", "reroll1", "fixedMin"]);
  for (const k of ["hpMethod", "hpRollLow"]) for (const v of SETTINGS[k]) assert.ok(SETTING_TEXT[k][v], `${k} ${v}`);
  const s = table({});
  ok(apply(s, { type: "setting", key: "hpMethod", value: "rolled" }, DM));
  const before = json(s);
  no(apply(s, { type: "setting", key: "hpMethod", value: "average" }, DM));
  no(apply(s, { type: "setting", key: "hpRollLow", value: "fixedMin" }, ANA));
  assert.equal(json(s), before);
});

test("a table saved before the setting is a fixed table: levels count the fixed value, and migrating again changes nothing", () => {
  const s = table({});
  const { id } = add(s, fighter(4));
  assert.equal(hpOf(s, id), fixedHp(4));
  const m = JSON.parse(json(s)); delete m.settings.hpMethod; delete m.settings.hpRollLow;
  const once = migrate(structuredClone(m)), twice = migrate(structuredClone(once));
  assert.equal(json(once), json(twice));
  assert.equal(once.settings.hpMethod, undefined, "absent means fixed");
  ok(apply(once, { type: "levelUp", actor: id, sheet: { ...once.entities[id].sheet, level: 5 } }, DM));
  assert.equal(hpOf(once, id), fixedHp(5));
  assert.equal(once.entities[id].sheet.hpRolls, undefined);
});

test("derive: level 1 is the die's highest, each later level is max(1, roll + Constitution), and the breakdown lists the rolls; a fixed table ignores them", () => {
  const sh = fighter(4, { hpRolls: { fighter: [1, 8, 3] } });
  assert.deepEqual(validate(sh), []);
  const r = derive(sh, { hp: "rolled" });
  assert.equal(r.record.hp, 12 + (1 + 2) + (8 + 2) + (3 + 2));
  assert.ok(r.why.hp.some((x) => /Rolled: 1, 8, 3 \(d10\)/.test(x)), r.why.hp.join("|"));
  assert.equal(derive(sh).record.hp, fixedHp(4), "no table said rolled: the fixed value");
  assert.equal(derive(sh, { hp: "fixed" }).record.hp, fixedHp(4));
  // at least 1 Hit Point a level
  const weak = derive(fighter(2, { abilities: { ...A, con: 3 }, hpRolls: { fighter: [1] } }), { hp: "rolled" }).record;
  assert.equal(weak.hp, Math.max(1, 10 - 4) + 1);
  // not rolled yet: the fixed value, said so
  const part = derive(fighter(3, { hpRolls: { fighter: [9, null] } }), { hp: "rolled" });
  assert.equal(part.record.hp, 12 + 11 + 8);
  assert.ok(part.why.hp.some((x) => /not rolled yet/.test(x)));
});

test("validate: rolls are for the sheet's classes, one entry a level after the first, a whole number on the die", () => {
  const bad = (h) => validate(fighter(3, { hpRolls: h })).join("|");
  assert.match(bad({ wizard: [3] }), /does not have as a class/);
  assert.match(bad({ fighter: [3, 4, 5] }), /one entry for each level/);
  assert.match(bad({ fighter: [11, 2] }), /whole number from 1 to 10/);
  assert.match(bad({ fighter: [0, 2] }), /whole number from 1 to 10/);
  assert.match(bad({ fighter: [1.5, 2] }), /whole number/);
  assert.match(bad([1, 2]), /Hit Point rolls are/);
  assert.deepEqual(validate(fighter(3, { hpRolls: { fighter: [10, null] } })), []);
});

test("a character added above level 1 at a rolled table: the game rolls every level after the first, once, from the seed, and tells everyone", () => {
  const a = table(), b = table();
  const { id, r } = add(a, fighter(4), DM), q = add(b, fighter(4), DM).r;
  const ev = r.events.find((e) => e.type === "hpRolled");
  assert.ok(ev); assert.equal(ev.levels.length, 3); assert.deepEqual(ev.levels.map((x) => x.level), [2, 3, 4]);
  for (const l of ev.levels) { assert.equal(l.dice.length, 1); assert.equal(l.dice[0].sides, 10); assert.equal(l.hp, Math.max(1, l.value + 2)); }
  assert.equal(json(r.events), json(q.events), "the same seed, the same rolls");
  assert.deepEqual(a.entities[id].sheet.hpRolls.fighter, ev.levels.map((x) => x.value));
  assert.equal(hpOf(a, id), 12 + ev.total);
  assert.equal(a.entities[id].hp, hpOf(a, id));
  assert.equal(a.rng.n, 3);
  // everyone sees it, dice and all
  const seen = viewEvents(r.events, a, { role: "player", userId: "ben" }).find((e) => e.type === "hpRolled");
  assert.deepEqual(seen.levels, ev.levels);
  // refreshing the character from its sheet gives the same Hit Points and rolls nothing
  const n = a.rng.n;
  ok(apply(a, { type: "refresh", actor: id }, DM));
  assert.equal(hpOf(a, id), 12 + ev.total); assert.equal(a.rng.n, n);
});

test("a level-1 character at a rolled table rolls nothing; the roll comes with the first level gained", () => {
  const s = table();
  const { id, r } = add(s, fighter(1));
  assert.equal(r.events.some((e) => e.type === "hpRolled"), false); assert.equal(s.rng.n, 0);
  assert.equal(hpOf(s, id), 12);
  const up = ok(apply(s, { type: "levelUp", actor: id, sheet: { ...s.entities[id].sheet, level: 2 } }, DM));
  const ev = up.events.find((e) => e.type === "hpRolled");
  assert.equal(ev.levels.length, 1); assert.equal(ev.levels[0].level, 2);
  assert.equal(hpOf(s, id), 12 + Math.max(1, ev.levels[0].value + 2));
  assert.deepEqual(s.entities[id].sheet.hpRolls, { fighter: [ev.levels[0].value] });
  // and the next level adds one more, keeping the first
  const up2 = ok(apply(s, { type: "levelUp", actor: id, sheet: { ...s.entities[id].sheet, level: 3, subclass: "champion" } }, DM));
  const ev2 = up2.events.find((e) => e.type === "hpRolled");
  assert.equal(ev2.levels.length, 1); assert.equal(ev2.levels[0].level, 3);
  assert.deepEqual(s.entities[id].sheet.hpRolls.fighter, [ev.levels[0].value, ev2.levels[0].value]);
  assert.equal(hpOf(s, id), 12 + Math.max(1, ev.levels[0].value + 2) + Math.max(1, ev2.levels[0].value + 2));
});

test("a fixed table rolls nothing and ignores any hpRolls", () => {
  const s = table({});
  const { id, r } = add(s, fighter(3, { hpRolls: { fighter: [10, 10] } }));
  assert.equal(r.events.some((e) => e.type === "hpRolled"), false); assert.equal(s.rng.n, 0);
  assert.equal(hpOf(s, id), fixedHp(3));
  assert.equal(s.entities[id].sheet.hpRolls, undefined, "rolls that came with a new character are not kept");
});

test("rolls that come with a new character were not made here: the table rolls its own", () => {
  const s = table();
  const { id } = add(s, fighter(3, { hpRolls: { fighter: [10, 10] } }));
  assert.notDeepEqual(s.entities[id].sheet.hpRolls.fighter, [10, 10].map(() => 0));
  assert.equal(s.rng.n >= 2, true);
});

test("forged rolls are refused and change nothing: an edited sheet or a level-up may not add or change one", () => {
  const s = table(), { id } = add(s, fighter(3));
  const held = s.entities[id].sheet.hpRolls.fighter, forged = held.map((v) => (v === 10 ? 9 : 10));
  const before = json(s);
  no(apply(s, { type: "setSheet", actor: id, sheet: { ...s.entities[id].sheet, hpRolls: { fighter: forged } } }, DM), /cannot be changed/);
  no(apply(s, { type: "levelUp", actor: id, sheet: { ...s.entities[id].sheet, level: 4, hpRolls: { fighter: [...held, 10] } } }, DM), /cannot be changed/);
  no(apply(s, { type: "levelUp", actor: id, sheet: { ...s.entities[id].sheet, level: 4, hpRolls: { fighter: [10, 10, 10] } } }, DM), /cannot be changed/);
  no(apply(s, { type: "setSheet", actor: id, sheet: { ...s.entities[id].sheet, hpRolls: { fighter: [0, 1] } } }, DM));
  no(apply(s, { type: "setSheet", actor: id, sheet: fighter(3) }, ANA), /Only the DM/);
  assert.equal(json(s), before, "nothing changed, not even the rng");
  // a sheet that sends none keeps the character's own; one sent as it is is accepted
  const { hpRolls, ...bare } = s.entities[id].sheet;
  ok(apply(s, { type: "setSheet", actor: id, sheet: { ...bare, name: "Brann the Bold" } }, DM));
  assert.deepEqual(s.entities[id].sheet.hpRolls.fighter, held);
  assert.equal(hpOf(s, id), 12 + held.reduce((n, v) => n + Math.max(1, v + 2), 0));
  // a lower level drops the rolls of the levels it no longer has
  ok(apply(s, { type: "setSheet", actor: id, sheet: { ...bare, level: 2, subclass: undefined } }, DM));
  assert.deepEqual(s.entities[id].sheet.hpRolls.fighter, [held[0]]);
});

test("rollHp rolls what is still to roll: a character on the table before it rolled; the DM, or the player who runs it; the log shows each die to everyone", () => {
  const s = table({}), { id } = add(s, fighter(4));
  s.entities[id].owner = "ana";
  no(apply(s, { type: "rollHp", actor: id }, ANA), /fixed Hit Point value/);
  ok(apply(s, { type: "setting", key: "hpMethod", value: "rolled" }, DM));
  assert.equal(hpOf(s, id), fixedHp(4), "turning the setting on changes nobody");
  no(apply(s, { type: "rollHp", actor: id }, BEN), /isn't yours/);
  const before = json(s);
  const r = ok(apply(s, { type: "rollHp", actor: id }, ANA));
  const ev = r.events.find((e) => e.type === "hpRolled");
  assert.equal(ev.by, "ana"); assert.equal(ev.levels.length, 3); assert.equal(ev.why, "pending");
  assert.equal(hpOf(s, id), 12 + ev.total);
  assert.equal(s.rng.n, 3);
  assert.deepEqual(viewEvents(r.events, s, { role: "player", userId: "ben" }).find((e) => e.type === "hpRolled").levels, ev.levels);
  const n = json(s);
  no(apply(s, { type: "rollHp", actor: id }, ANA), /no Hit Point levels left/);
  no(apply(s, { type: "rollHp", actor: id }, DM), /no Hit Point levels left/);
  assert.equal(json(s), n, "nothing left: nothing changes");
  assert.notEqual(before, n);
  // the DM rolls for a player's character that has a level pending
  const t = table({}), c = add(t, fighter(2)).id; t.entities[c].owner = "ana";
  ok(apply(t, { type: "setting", key: "hpMethod", value: "rolled" }, DM));
  assert.equal(ok(apply(t, { type: "rollHp", actor: c }, DM)).events.find((e) => e.type === "hpRolled").levels.length, 1);
});

test("rerollHp is the DM's: one level, under the table's rule, with the old and new in the log; a player cannot", () => {
  const s = table(), { id } = add(s, fighter(3));
  const held = [...s.entities[id].sheet.hpRolls.fighter];
  const before = json(s);
  no(apply(s, { type: "rerollHp", actor: id, class: "fighter", level: 2 }, ANA), /Only the DM/);
  no(apply(s, { type: "rerollHp", actor: id, class: "fighter", level: 1 }, DM), /levels 2 to 3/);
  no(apply(s, { type: "rerollHp", actor: id, class: "fighter", level: 4 }, DM));
  no(apply(s, { type: "rerollHp", actor: id, class: "wizard", level: 2 }, DM));
  assert.equal(json(s), before);
  const r = ok(apply(s, { type: "rerollHp", actor: id, class: "fighter", level: 3 }, DM));
  const ev = r.events.find((e) => e.type === "hpRerolled");
  assert.equal(ev.from, held[1]); assert.equal(ev.levels.length, 1); assert.equal(ev.levels[0].level, 3);
  assert.deepEqual(s.entities[id].sheet.hpRolls.fighter, [held[0], ev.levels[0].value]);
  assert.equal(hpOf(s, id), 12 + Math.max(1, held[0] + 2) + Math.max(1, ev.levels[0].value + 2));
});

test("hpRollLow: reroll1 rolls a 1 again once and the new roll stands; fixedMin takes the fixed value over a lower roll", () => {
  const seen = { one: false, low: false };
  for (let n = 1; n < 400 && !(seen.one && seen.low); n++) {
    const st = { rng: keyedRng(n.toString(16).padStart(64, "0")) }, st2 = structuredClone(st);
    const first = rollLevel(structuredClone(st), 10, "keep");
    const re = rollLevel(st, 10, "reroll1"), fm = rollLevel(st2, 10, "fixedMin");
    if (first.value === 1) {
      seen.one = true;
      assert.equal(re.dice.length, 2); assert.equal(re.dice[0].drop, true); assert.equal(re.value, re.dice[1].value);
    } else { assert.equal(re.dice.length, 1); assert.equal(re.value, first.value); }
    if (first.value < 6) { seen.low = true; assert.equal(fm.value, 6); assert.equal(fm.dice[0].low, true); } else assert.equal(fm.value, first.value);
  }
  assert.ok(seen.one && seen.low);
  // at the table: with fixedMin no level is below the fixed value, and the sheet keeps what stood
  for (let k = 0; k < 8; k++) {
    const s = table({ hpMethod: "rolled", hpRollLow: "fixedMin" }); s.rng = keyedRng(String(k).padStart(64, "0"));
    const { id } = add(s, fighter(6));
    assert.ok(s.entities[id].sheet.hpRolls.fighter.every((v) => v >= 6 && v <= 10));
  }
});

test("replay and undo: the same seed and actions give the same game; undo puts back the Hit Points, the sheet's rolls and the rng", () => {
  const a = table(), b = table();
  for (const g of [a, b]) { const { id } = add(g, fighter(1)); ok(apply(g, { type: "levelUp", actor: id, sheet: { ...g.entities[id].sheet, level: 2 } }, DM)); }
  assert.equal(json(a), json(b));
  const s = table(), { id } = add(s, fighter(1)), snap = json(s);
  const h = createHistory(), m = mark(s), action = { type: "levelUp", actor: id, sheet: { ...s.entities[id].sheet, level: 2 } };
  const r = ok(apply(s, action, DM));
  h.record(m, s, describeStep(action, r.events, m, s));
  assert.notEqual(json(s), snap);
  assert.ok(h.undo(s), "the level-up can be undone");
  assert.equal(json(s), snap, "hit points, sheet rolls and rng all back");
});

test("multiclass: a class's rolls are its own die; its first level adds Hit Points; only the first class gets the die's highest at level 1", () => {
  const sh = { name: "Mix", classes: [{ class: "fighter", level: 3, subclass: "champion" }, { class: "wizard", level: 2 }], abilities: { ...A, int: 13 }, skills: ["athletics", "perception"],
    choices: { "fighting-style": "defense" }, hpRolls: { fighter: [5, 6], wizard: [4, null] } };
  assert.deepEqual(validate(sh), []);
  const r = derive(sh, { hp: "rolled" });
  assert.equal(r.record.hp, 12 + (5 + 2) + (6 + 2) + (4 + 2) + (4 + 2));      // wizard d6: 4 rolled, the other the fixed 4
  assert.ok(r.why.hp.some((x) => /Rolled for Wizard: 4 \(d6\)/.test(x)));
  assert.match(validate({ ...sh, hpRolls: { wizard: [7, 1] } }).join("|"), /whole number from 1 to 6/);
  // at the table: a new multiclass character rolls both classes' levels
  const s = table(), { id, r: res } = add(s, { ...sh, hpRolls: undefined });
  const ev = res.events.find((e) => e.type === "hpRolled");
  assert.deepEqual(ev.levels.map((x) => `${x.class}${x.level}`), ["fighter2", "fighter3", "wizard1", "wizard2"]);
  assert.deepEqual(ev.levels.map((x) => x.die), [10, 10, 6, 6]);
  assert.equal(s.entities[id].sheet.hpRolls.wizard.length, 2);
  // gaining a level in a new class rolls that one level
  const up = ok(apply(s, { type: "levelUp", actor: id, sheet: { ...s.entities[id].sheet, classes: [{ class: "fighter", level: 3, subclass: "champion" }, { class: "wizard", level: 3, subclass: "evoker" }] } }, DM));
  assert.deepEqual(up.events.find((e) => e.type === "hpRolled").levels.map((x) => `${x.class}${x.level}`), ["wizard3"]);
});

test("other Hit Point grants still add on top of the rolls (Dwarven Toughness: 1 a level)", () => {
  const sh = fighter(3, { species: { id: "dwarf" }, hpRolls: { fighter: [7, 9] } });
  assert.deepEqual(validate(sh), []);
  assert.equal(derive(sh, { hp: "rolled" }).record.hp, 12 + 9 + 11 + 3);
  assert.ok(derive(sh, { hp: "rolled" }).why.hp.some((x) => /Dwarven Toughness \+3/.test(x)));
  const s = table(), { id } = add(s, fighter(3, { species: { id: "dwarf" } }));
  const rolls = s.entities[id].sheet.hpRolls.fighter;
  assert.equal(hpOf(s, id), 12 + rolls.reduce((n, v) => n + Math.max(1, v + 2), 0) + 3);
});

test("rollHp and rerollHp are refused for what cannot have them, changing nothing", () => {
  const s = table(), { id } = add(s, fighter(2));
  s.entities.dummy = { ...structuredClone(s.entities[id]), id: "dummy", kind: "npc", sheet: undefined };
  const before = json(s);
  no(apply(s, { type: "rollHp", actor: "dummy" }, DM), /not a character/);
  no(apply(s, { type: "rollHp", actor: "nobody" }, DM));
  no(apply(s, { type: "rerollHp", actor: id, class: "fighter", level: 2.5 }, DM));
  assert.equal(json(s), before);
});

test("the real edit flow: a rolled level 5 fighter edited down to level 3, to a lower level in another class, with hpRolls in the sent sheet; values are still never changed", () => {
  const s = table(), { id } = add(s, fighter(5));
  const held = [...s.entities[id].sheet.hpRolls.fighter], sent = structuredClone(s.entities[id].sheet);
  assert.equal(held.length, 4);
  // down to level 3: the client sends the held rolls back whole; the engine cuts them
  const down = { ...sent, level: 3 };
  const r = ok(apply(s, { type: "setSheet", actor: id, sheet: down }, DM));
  assert.equal(r.events.some((e) => e.type === "hpRolled"), false);
  assert.deepEqual(s.entities[id].sheet.hpRolls.fighter, held.slice(0, 2));
  assert.equal(hpOf(s, id), 12 + held.slice(0, 2).reduce((n, v) => n + Math.max(1, v + 2), 0));
  // a value changed on a level still owed is refused, even with a longer list
  const before = json(s);
  no(apply(s, { type: "setSheet", actor: id, sheet: { ...sent, level: 3, hpRolls: { fighter: [held[0] === 10 ? 9 : 10, held[1], held[2], held[3]] } } }, DM), /cannot be changed/);
  assert.equal(json(s), before);
  // another class: the fighter's rolls are cut away, nothing is kept for a class it does not have
  const wiz = { name: "Brann", class: "wizard", level: 2, abilities: A, skills: ["arcana", "history"], hpRolls: sent.hpRolls };
  const w = ok(apply(s, { type: "setSheet", actor: id, sheet: wiz }, DM));
  assert.equal(w.events.some((e) => e.type === "hpRolled"), false);
  assert.equal(s.entities[id].sheet.hpRolls, undefined);
  assert.equal(hpOf(s, id), 6 + 2 + 4 + 2, "pending: the fixed value until rolled");
  // levelUp with a longer list than the new level owes is accepted when it only has to be cut
  const t = table(), c = add(t, fighter(4)).id, long = t.entities[c].sheet;
  ok(apply(t, { type: "levelUp", actor: c, sheet: { ...long, level: 5, hpRolls: { fighter: [...long.hpRolls.fighter, null, 7, 7] } } }, DM));
});

test("switching hpMethod tells only the DM, in a manual line, and changes nobody until they are rebuilt; the rolls come back when switched back", () => {
  const s = table({}), { id } = add(s, fighter(3));
  const on = ok(apply(s, { type: "setting", key: "hpMethod", value: "rolled" }, DM));
  const line = on.events.find((e) => e.type === "manual");
  assert.ok(line && line.partial && /next time they are rebuilt/.test(line.text));
  assert.equal(viewEvents(on.events, s, { role: "player", userId: "ana" }).some((e) => e.type === "manual"), false);
  assert.equal(ok(apply(s, { type: "setting", key: "hpMethod", value: "rolled" }, DM)).events.length, 0, "no change, no line");
  assert.equal(hpOf(s, id), fixedHp(3));
  ok(apply(s, { type: "rollHp", actor: id }, DM));
  const rolledHp = hpOf(s, id), rolls = [...s.entities[id].sheet.hpRolls.fighter];
  ok(apply(s, { type: "setting", key: "hpMethod", value: "fixed" }, DM));
  ok(apply(s, { type: "refresh", actor: id }, DM));
  assert.equal(hpOf(s, id), fixedHp(3));
  assert.deepEqual(s.entities[id].sheet.hpRolls.fighter, rolls, "kept");
  ok(apply(s, { type: "setting", key: "hpMethod", value: "rolled" }, DM));
  ok(apply(s, { type: "refresh", actor: id }, DM));
  assert.equal(hpOf(s, id), rolledHp);
});

test("trimRolls only cuts: classes and levels the sheet no longer has; a build screen's 'mine' sheet is cut the same way", async () => {
  const { trimRolls } = await import("../src/hitpoints.js");
  const { classesOf } = await import("../src/derive.js");
  const sh = fighter(5, { hpRolls: { fighter: [3, 4, 5, 6], wizard: [2] } });
  const cut = trimRolls({ ...sh, level: 3 }, classesOf({ ...sh, level: 3 }));
  assert.deepEqual(cut.hpRolls, { fighter: [3, 4] });
  assert.deepEqual(validate({ ...cut }), []);
  assert.equal(trimRolls({ ...sh, level: 1 }, classesOf({ ...sh, level: 1 })).hpRolls, undefined);
  assert.equal(trimRolls({ name: "x" }, []).hpRolls, undefined);
  assert.match(validate({ ...sh, level: 3 }).join("|"), /does not have|one entry/, "validate itself still refuses what was not cut");
});

test("derive counts the levels still to roll (unrolledHp): 0 at a fixed table, the nulls and missing entries at a rolled one", () => {
  const sh = fighter(4, { hpRolls: { fighter: [5, null] } });
  assert.equal(derive(sh).unrolledHp, 0);
  assert.equal(derive(sh, { hp: "rolled" }).unrolledHp, 2);
  assert.equal(derive(fighter(4, { hpRolls: { fighter: [5, 6, 7] } }), { hp: "rolled" }).unrolledHp, 0);
  assert.equal(derive(fighter(1), { hp: "rolled" }).unrolledHp, 0);
});
