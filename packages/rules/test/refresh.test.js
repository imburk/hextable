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

test("refresh-all with nothing to refresh still succeeds", () => {
  const s = newGame(5), before = json(s);
  const r = ok(apply(s, { type: "refresh" }, DM));
  assert.deepEqual(r.events, []);
  assert.equal(json(s), before);
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
  ok(apply(s, { type: "editCharacter", actor: "rogue", record: structuredClone(PREGENS.rogue) }, DM));
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
