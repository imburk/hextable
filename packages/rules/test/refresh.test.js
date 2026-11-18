// `refresh` (DEBT C17, #476): a character made again from its own stored sheet, so one saved before a content change picks up
// what the content gained; and the one keep-list (sheets.js `carryPlay`) every remake, `editCharacter` included, uses.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, ACTION_TYPES } from "../src/engine.js";
import { PREGENS } from "../src/content/index.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { viewEvents } from "../src/view.js";
import { describeStep, mark } from "../src/history.js";
import { SHEETS } from "./fixtures/sheets.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (s) => JSON.stringify(s);
const druid = (level = 2) => ({ name: "Ven", class: "druid", level, abilities: { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 }, skills: ["nature", "perception"],
  choices: { "primal-order": "warden" }, armour: "leather-armor", shield: true, weapons: ["quarterstaff"], spells: ["produce-flame", "cure-wounds"], gear: ["Quarterstaff"] });
const has = (e, id) => (e.feats ?? []).some((f) => f.id === id);

// A druid as a game saved before Wild Companion was entered holds it: no such feature on the record.
const oldDruid = () => {
  const s = newGame(5, { party: [{ sheet: druid() }, { sheet: SHEETS.fighter }] });
  const v = s.entities.pc1;
  v.feats = v.feats.filter((f) => f.id !== "wild-companion");
  return s;
};

test("an old-save druid has no Wild Companion; refresh gives it, and what play did to the druid stays", () => {
  const s = oldDruid(), v = s.entities.pc1;
  assert.ok(!has(v, "wild-companion"), "the old save lacks it");
  // What play has left on the druid.
  ok(apply(s, { type: "harm", actor: "pc1", amount: 4, dtype: "fire" }, DM));
  ok(apply(s, { type: "condition", actor: "pc1", condition: "prone" }, DM));
  ok(apply(s, { type: "setSpeed", actor: "pc1", mode: "fly", feet: 30 }, DM));
  ok(apply(s, { type: "give", actor: "pc1", item: "Rope" }, DM));
  Object.assign(v, { tempHp: 5, tempFx: "fx1", follow: "pc2", march: 1, light: { bright: 20, dim: 20 }, hiding: { dc: 14 }, stealthNoted: ["pc2"], away: true });
  v.slots[1] = v.slotsMax[1] - 1; v.uses["wild-shape"] = 1;
  const keep = ["hp", "cond", "tempHp", "tempFx", "follow", "march", "light", "hiding", "stealthNoted", "away", "speedSet", "gear", "slots", "pos", "owner"];
  const was = Object.fromEntries(keep.map((k) => [k, structuredClone(v[k])]));
  assert.deepEqual(was.gear, ["Quarterstaff", "Rope"]);
  const r = ok(apply(s, { type: "refresh", actor: "pc1" }, DM));
  assert.deepEqual(r.events, [{ type: "edited", id: "pc1" }]);
  const e = s.entities.pc1;
  assert.ok(has(e, "wild-companion"), "the refreshed druid has Wild Companion");
  for (const k of keep) assert.deepEqual(e[k], was[k], `${k} stays`);
  assert.equal(e.speeds.fly, 30, "the DM's fly Speed is laid over the sheet again");
  assert.equal(e.uses["wild-shape"], 1, "the spent use of Wild Shape stays spent");
  assert.deepEqual(e.sheet, druid());
  assert.equal(json(s.entities.pc2), json(newGame(5, { party: [{ sheet: druid() }, { sheet: SHEETS.fighter }] }).entities.pc2), "nobody else is touched");
});

test("refresh gives a character what the content gained since: Unarmed Strike, for a fighter whose record lacks it", () => {
  const s = newGame(5, { party: [{ sheet: SHEETS.fighter }] });
  const f = s.entities.pc1, strikes = (e) => e.attacks.filter((a) => /unarmed/i.test(a.id ?? a.name)).length;
  f.attacks = f.attacks.filter((a) => !/unarmed/i.test(a.id ?? a.name));
  assert.equal(strikes(f), 0);
  ok(apply(s, { type: "refresh", actor: "pc1" }, DM));
  assert.equal(strikes(s.entities.pc1), 1);
});

test("refresh is allowed in a fight", () => {
  const s = oldDruid();
  ok(apply(s, { type: "startEncounter", center: { q: 2, r: 0 }, radius: 10 }, DM));
  assert.ok(s.encounter);
  ok(apply(s, { type: "refresh", actor: "pc1" }, DM));
  assert.ok(has(s.entities.pc1, "wild-companion"));
  ok(apply(s, { type: "refresh" }, DM));
});

test("a hand-typed character has no sheet: refused with a sentence, nothing changes", () => {
  const s = newGame(5), before = json(s);
  const r = apply(s, { type: "refresh", actor: "rogue" }, DM);
  assert.match(r.error, /typed in by hand and has no sheet/);
  assert.equal(json(s), before);
});

test("a character in a form is refused, and so is a monster or a missing creature; nothing changes", () => {
  const s = oldDruid();
  s.entities.pc1.form = { name: "Cat" };
  let before = json(s);
  assert.match(apply(s, { type: "refresh", actor: "pc1" }, DM).error, /in the form of a Cat\. Leave the form first/);
  assert.match(apply(s, { type: "refresh", actor: "m1" }, DM).error, /not a character/);
  assert.ok(apply(s, { type: "refresh", actor: "nobody" }, DM).error);
  assert.equal(json(s), before);
  // Refresh-all skips it with a note and goes on to the others.
  const r = ok(apply(s, { type: "refresh" }, DM));
  assert.equal(r.events.filter((x) => x.type === "manual").length, 1);
  assert.match(r.events.find((x) => x.type === "manual").text, /form of a Cat/);
});

test("a sheet that no longer validates is refused with the problem named", () => {
  const s = oldDruid(), before = json(s);
  s.entities.pc1.sheet.class = "no-such-class"; const was = json(s);
  const r = apply(s, { type: "refresh", actor: "pc1" }, DM);
  assert.match(r.error, /Ven's sheet can't be played as it is\. \S/);
  assert.equal(json(s), was);
  assert.notEqual(was, before);
});

test("refresh-all: a bad sheet is skipped with one note, none of it changes, the others are refreshed; hand-typed ones are left alone", () => {
  const s = newGame(5, { party: [{ sheet: druid() }, { sheet: SHEETS.fighter }, { pregen: "rogue" }] });
  s.entities.pc1.feats = s.entities.pc1.feats.filter((f) => f.id !== "wild-companion");
  s.entities.pc2.sheet.weapons = ["no-such-weapon"];
  s.entities.pc2.hp -= 2;
  const bad = json(s.entities.pc2), rogue = json(s.entities.rogue);
  const r = ok(apply(s, { type: "refresh" }, DM));
  assert.ok(has(s.entities.pc1, "wild-companion"), "the good sheet is refreshed");
  assert.equal(json(s.entities.pc2), bad, "the bad one is exactly as it was");
  assert.equal(json(s.entities.rogue), rogue, "a hand-typed one is left alone");
  assert.deepEqual(r.events.filter((x) => x.type === "edited"), [{ type: "edited", id: "pc1" }]);
  const notes = r.events.filter((x) => x.type === "manual");
  assert.equal(notes.length, 1);
  assert.deepEqual([notes[0].actor, notes[0].partial], ["pc2", true]);
  assert.match(notes[0].text, /^Not refreshed from its sheet\. /);
  // For the DM alone: a player's view of the same events has no such note, nor anything of the skip.
  assert.deepEqual(viewEvents(r.events, s, DM).filter((x) => x.type === "manual").length, 1);
  assert.deepEqual(viewEvents(r.events, s, PAT), [{ type: "edited", id: "pc1" }], "a player is told of the refreshed character only");
  assert.ok(!json(viewEvents(r.events, s, PAT)).includes("Not refreshed"));
});

test("refresh-all with no party character that has a sheet is refused, and so is an actor that is not a name", () => {
  const s = newGame(5), before = json(s);
  assert.equal(apply(s, { type: "refresh" }, DM).error, "No party character has a sheet to refresh from.");
  assert.match(apply(s, { type: "refresh", actor: ["fighter"] }, DM).error, /Name the character/);
  assert.match(apply(s, { type: "refresh", actor: null }, DM).error, /Name the character/);
  assert.equal(json(s), before);
});

test("a stored sheet that makes validate throw is a problem with the sheet, not a crash: one actor refused, refresh-all skips it", () => {
  const s = newGame(5, { party: [{ sheet: druid() }, { sheet: SHEETS.fighter }] });
  s.entities.pc1.feats = s.entities.pc1.feats.filter((f) => f.id !== "wild-companion");
  s.entities.pc2.sheet.skills = 5;                                         // validate: skills.includes is not a function
  const bad = json(s.entities.pc2), all = json(s);
  assert.match(apply(s, { type: "refresh", actor: "pc2" }, DM).error, /^Its sheet could not be read: \S/);
  assert.equal(json(s), all);
  const r = ok(apply(s, { type: "refresh" }, DM));
  assert.ok(has(s.entities.pc1, "wild-companion"), "the other character is refreshed");
  assert.equal(json(s.entities.pc2), bad);
  const m = r.events.filter((x) => x.type === "manual");
  assert.equal(m.length, 1);
  assert.match(m[0].text, /^Not refreshed from its sheet\. Its sheet could not be read: /);
});

test("only the DM can send it", () => {
  const s = oldDruid(), before = json(s);
  assert.match(apply(s, { type: "refresh", actor: "pc1" }, PAT).error, /Only the DM/);
  assert.match(apply(s, { type: "refresh" }, PAT).error, /Only the DM/);
  assert.equal(json(s), before);
  assert.ok(ACTION_TYPES.includes("refresh"));
});

test("history names it", () => {
  const s = oldDruid(), m = mark(s);
  const r = ok(apply(s, { type: "refresh", actor: "pc1" }, DM));
  assert.equal(describeStep({ type: "refresh", actor: "pc1" }, r.events, m, s).label, "Refreshed from sheet");
  assert.equal(describeStep({ type: "refresh" }, r.events, m, s).label, "Refreshed from sheet");
});

test("editCharacter keeps the same list as every remake: the seven fields it dropped, and stealthNoted, away, vanished, speedSet", () => {
  const s = newGame(5);
  const r = s.entities.rogue;
  ok(apply(s, { type: "setSpeed", actor: "rogue", mode: "fly", feet: 40, hover: true }, DM));
  const fields = { tempHp: 5, tempFx: "fx1", follow: "fighter", march: 1, light: { bright: 20, dim: 20 }, hiding: { dc: 18 }, hidden: true, stealthNoted: ["m1"], away: true, vanished: { why: "test" } };
  Object.assign(r, structuredClone(fields), { xp: 900 });
  const speedSet = structuredClone(r.speedSet);
  assert.ok(speedSet, "the DM's grant is recorded");
  // The record as the form sends it back: what the creature shows, the DM's fly Speed included.
  ok(apply(s, { type: "editCharacter", actor: "rogue", record: { ...structuredClone(PREGENS.rogue), speeds: { fly: 40 } } }, DM));
  const e = s.entities.rogue;
  for (const [k, v] of Object.entries(fields)) assert.deepEqual(e[k], v, `${k} stays`);
  assert.deepEqual(e.speedSet, speedSet);
  assert.equal(e.speeds.fly, 40);
  assert.equal(e.hover, true);
  assert.equal(e.xp, 900, "XP earned is kept, as a remake keeps it");
});

test("editCharacter and a remake from a sheet keep the same fields: one list, tried on every field both name", () => {
  // A built character, edited with its own record and then made again from its sheet, ends the same.
  const mk = () => { const s = newGame(5, { party: [{ sheet: SHEETS.fighter }] }); Object.assign(s.entities.pc1, { tempHp: 3, light: { bright: 10, dim: 10 }, hiding: { dc: 12 }, march: 2, stealthNoted: ["m1"], vanished: { why: "x" }, xp: 700 }); return s; };
  const a = mk(), b = mk();
  ok(apply(a, { type: "editCharacter", actor: "pc1", record: derive(SHEETS.fighter).record }, DM));
  ok(apply(b, { type: "refresh", actor: "pc1" }, DM));
  delete b.entities.pc1.sheet;
  assert.equal(json(a.entities.pc1), json(b.entities.pc1));
});

// ---------- a creature at 0 Hit Points or dead stays so, whatever its new maximum ----------
const down = (s, id, extra = {}) => {
  const e = s.entities[id];
  e.maxHp = e.maxHp - 2; e.hp = 0;                                         // a stored maximum below the sheet's (an old save), at 0
  Object.assign(e, { cond: { unconscious: { by: "x" } }, death: { s: 1, f: 1 } }, extra);
  return e;
};

test("a character at 0 Hit Points stays at 0 through setSheet, refresh and editCharacter, even when its new maximum is higher", () => {
  for (const how of ["setSheet", "refresh", "editCharacter", "refresh-all"]) {
    const s = newGame(5, { party: [{ sheet: SHEETS.fighter }] });
    down(s, "pc1");
    const act = { setSheet: { type: "setSheet", actor: "pc1", sheet: SHEETS.fighter }, refresh: { type: "refresh", actor: "pc1" }, "refresh-all": { type: "refresh" },
      editCharacter: { type: "editCharacter", actor: "pc1", record: derive(SHEETS.fighter).record } }[how];
    ok(apply(s, act, DM));
    const e = s.entities.pc1;
    assert.equal(e.hp, 0, `${how}: still at 0`);
    assert.ok(e.maxHp > 0 && e.cond.unconscious, `${how}: still unconscious`);
    assert.deepEqual(e.death, { s: 1, f: 1 }, `${how}: death saves kept`);
  }
});

test("a dead character stays dead at 0 through setSheet, refresh and editCharacter", () => {
  for (const how of ["setSheet", "refresh", "editCharacter"]) {
    const s = newGame(5, { party: [{ sheet: SHEETS.fighter }] });
    down(s, "pc1", { dead: true });
    const act = { setSheet: { type: "setSheet", actor: "pc1", sheet: SHEETS.fighter }, refresh: { type: "refresh", actor: "pc1" },
      editCharacter: { type: "editCharacter", actor: "pc1", record: derive(SHEETS.fighter).record } }[how];
    ok(apply(s, act, DM));
    assert.equal(s.entities.pc1.hp, 0, `${how}: hp`);
    assert.equal(s.entities.pc1.dead, true, `${how}: dead`);
  }
});

test("a hurt character above 0 keeps its damage and is never below 1", () => {
  const s = newGame(5, { party: [{ sheet: SHEETS.fighter }] });
  const e = s.entities.pc1, max = e.maxHp;
  e.hp = max - 3;
  ok(apply(s, { type: "refresh", actor: "pc1" }, DM));
  assert.equal(s.entities.pc1.hp, max - 3);
  s.entities.pc1.hp = 1; s.entities.pc1.maxHp = max + 40;                   // 41 down: the sheet's maximum less the damage is below 1
  ok(apply(s, { type: "refresh", actor: "pc1" }, DM));
  assert.equal(s.entities.pc1.hp, 1);
});

// ---------- editCharacter: the record the DM types wins over old play state ----------
test("editCharacter: a Speed grant stays only for a way of moving the record leaves as the creature has it", () => {
  const s = newGame(5), rec = () => structuredClone(PREGENS.rogue);
  ok(apply(s, { type: "setSpeed", actor: "rogue", mode: "walk", feet: 0 }, DM));
  ok(apply(s, { type: "setSpeed", actor: "rogue", mode: "fly", feet: 40, hover: true }, DM));
  assert.equal(s.entities.rogue.speed, 0);
  // The form sends back what it shows: walk 0, fly 40. Both grants stay.
  const shown = { ...rec(), speed: 0, speeds: { fly: 40 } };
  ok(apply(s, { type: "editCharacter", actor: "rogue", record: shown }, DM));
  assert.deepEqual([s.entities.rogue.speed, s.entities.rogue.speeds.fly, s.entities.rogue.hover], [0, 40, true]);
  assert.deepEqual(s.entities.rogue.speedSet, { walk: 0, fly: 40, hover: true });
  // The DM types a walking Speed of 35: the record wins for walking, the fly grant (left alone) stays.
  ok(apply(s, { type: "editCharacter", actor: "rogue", record: { ...rec(), speed: 35, speeds: { fly: 40 } } }, DM));
  assert.equal(s.entities.rogue.speed, 35);
  assert.deepEqual(s.entities.rogue.speedSet, { fly: 40, hover: true });
  // And a record with no flying Speed drops that grant and its hover.
  ok(apply(s, { type: "editCharacter", actor: "rogue", record: { ...rec(), speed: 35 } }, DM));
  assert.equal(s.entities.rogue.speeds.fly, undefined);
  assert.equal(s.entities.rogue.hover, undefined);
  assert.equal(s.entities.rogue.speedSet, undefined);
});

test("editCharacter: a condition the new record is immune to ends, with an event; the others stay", () => {
  const s = newGame(5), r = s.entities.rogue;
  r.cond.poisoned = { by: "x" }; r.cond.prone = {};
  const res = ok(apply(s, { type: "editCharacter", actor: "rogue", record: { ...structuredClone(PREGENS.rogue), conditionImmune: ["poisoned"] } }, DM));
  assert.equal(s.entities.rogue.cond.poisoned, undefined);
  assert.ok(s.entities.rogue.cond.prone);
  assert.deepEqual(res.events.filter((x) => x.type === "condEnd"), [{ type: "condEnd", id: "rogue", cond: "poisoned" }]);
});

test("editCharacter: a lower level in the record takes the record's XP, not the larger old one; the same or a higher level keeps the larger", () => {
  const s = newGame(5), r = s.entities.rogue;
  Object.assign(r, { level: 5, xp: 6500 });
  ok(apply(s, { type: "editCharacter", actor: "rogue", record: { ...structuredClone(PREGENS.rogue), level: 1 } }, DM));
  assert.equal(s.entities.rogue.level, 1);
  assert.equal(s.entities.rogue.xp, 0, "level 1 starts at 0 XP");
  s.entities.rogue.xp = 400;
  ok(apply(s, { type: "editCharacter", actor: "rogue", record: { ...structuredClone(PREGENS.rogue), level: 1 } }, DM));
  assert.equal(s.entities.rogue.xp, 400, "the same level keeps what was earned");
});
