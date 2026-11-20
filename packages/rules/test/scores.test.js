// Making ability scores (docs/specs/ability-scores.md, #557): the SRD's three methods, the background's increase, rerolls, the record a sheet
// keeps of how its scores were made, and what validate says about it. The numbers are those of reference/srd52/srd52-flow.txt lines 2792 to 2865.
import assert from "node:assert/strict";
import { test } from "node:test";
import { keyedRng, roll } from "../src/rng.js";
import { validate, derive } from "../src/derive.js";
import { ABILITIES } from "../src/content/schema.js";
import { CONTENT } from "../src/content/index.js";
import {
  STANDARD_ARRAY, POINT_COST, POINT_BUDGET, ARRAY_BY_CLASS, BACKGROUNDS, pointsSpent, pointsLeft, rollScore, rollScores, topThree, standing, mayReroll, rerollWhy,
  rerollOpen, ruleText, cleanRule, ruleProblem, applyBackground, backgroundProblem, checkScores, scoresLine, dmLine, setText, dayText, DEFAULT_RULE,
} from "../src/scores.js";

const KEY = "0123456789abcdef".repeat(4);
const at = (n) => { const s = { rng: keyedRng(KEY) }; for (let i = 0; i < n; i++) roll(s, "1d6"); return s; };
const NAMEDSHEET = (abilities, scores) => ({ name: "Kerrin", class: "fighter", level: 1, abilities, skills: ["athletics", "perception"], choices: { "fighting-style": "defense" }, ...(scores ? { scores } : {}) });
const base = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
const soldier = { id: "soldier", abilities: { str: 2, dex: 1 } };

test("the SRD's numbers: the array, the point costs and the budget", () => {
  assert.deepEqual([...STANDARD_ARRAY], [15, 14, 13, 12, 10, 8]);
  assert.deepEqual({ ...POINT_COST }, { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 });
  assert.equal(POINT_BUDGET, 27);
  assert.equal(POINT_COST[14], 7, "the SRD's own example: 14 costs 7");
});

test("the Standard Array by Class table: twelve classes, each a permutation of the array, the SRD's row for a Fighter and a Wizard", () => {
  assert.deepEqual(Object.keys(ARRAY_BY_CLASS).sort(), Object.keys(CONTENT.classes).sort());
  for (const [c, row] of Object.entries(ARRAY_BY_CLASS)) assert.deepEqual(ABILITIES.map((a) => row[a]).sort((x, y) => y - x), [...STANDARD_ARRAY], c);
  assert.deepEqual(ABILITIES.map((a) => ARRAY_BY_CLASS.fighter[a]), [15, 14, 13, 8, 10, 12]);
  assert.deepEqual(ABILITIES.map((a) => ARRAY_BY_CLASS.wizard[a]), [8, 12, 13, 15, 14, 10]);
});

test("the SRD backgrounds list their three abilities", () => {
  assert.deepEqual(BACKGROUNDS.acolyte.abilities, ["int", "wis", "cha"]);
  assert.deepEqual(BACKGROUNDS.criminal.abilities, ["dex", "con", "int"]);
  assert.deepEqual(BACKGROUNDS.sage.abilities, ["con", "int", "wis"]);
  assert.deepEqual(BACKGROUNDS.soldier.abilities, ["str", "dex", "con"]);
});

test("pointsSpent: 15, 14, 13, 12, 10 and 8 cost 9+7+5+4+2+0 = 27; all 8s cost nothing; outside 8 to 15 is null", () => {
  assert.equal(pointsSpent(base), 27);
  assert.equal(pointsLeft(base), 0);
  assert.equal(pointsSpent({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }), 0);
  assert.equal(pointsLeft({ str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 }), 27);
  assert.equal(pointsSpent({ ...base, str: 16 }), null);
  assert.equal(pointsSpent({ ...base, str: 7 }), null);
  assert.equal(pointsSpent({ ...base, str: "15" }), null);
  assert.equal(pointsSpent({ str: 15, dex: 15, con: 15, int: 8, wis: 8, cha: 8 }), 27, "three 15s are exactly 27 points");
  assert.equal(pointsSpent({ str: 15, dex: 15, con: 15, int: 9, wis: 8, cha: 8 }), 28, "one more point is over the budget");
});

test("rollScore: four d6, the lowest die dropped, the total the highest three; the rng moves four places", () => {
  const s = at(0), r = rollScore(s);
  assert.equal(s.rng.n, 4);
  assert.equal(r.faces.length, 4);
  assert.ok(r.faces.every((v) => v >= 1 && v <= 6));
  assert.equal(r.total, [...r.faces].sort((a, b) => b - a).slice(0, 3).reduce((n, v) => n + v, 0));
  assert.equal(r.dice.length, 4);
  assert.equal(r.dice.filter((d) => d.drop).length, 1);
  assert.equal(r.dice.find((d) => d.drop).value, Math.min(...r.faces));
  assert.ok(r.dice.every((d) => d.sides === 6));
  assert.ok(r.total >= 3 && r.total <= 18);
});

test("rollScore sets aside the first of equal lowest dice; the total is the same either way", () => {
  assert.equal(topThree([3, 3, 3, 3]), 9);
  assert.equal(topThree([1, 6, 1, 6]), 13);
  assert.equal(topThree([6, 6, 6, 6]), 18);
  assert.equal(topThree([1, 1, 1, 1]), 3);
  // Find a seed position whose four dice have a tie for lowest and check the mark falls on the first of them.
  let found = false;
  for (let n = 0; n < 400 && !found; n += 4) {
    const r = rollScore(at(n)), low = Math.min(...r.faces);
    if (r.faces.filter((v) => v === low).length > 1) { found = true; assert.equal(r.dice.findIndex((d) => d.drop), r.faces.indexOf(low)); }
  }
  assert.ok(found, "the seed had a tie to look at");
});

test("rollScores: six scores, the same from the same key, 24 rolls of the rng, different keys differ", () => {
  const a = at(0), b = at(0), x = rollScores(a), y = rollScores(b);
  assert.equal(x.sets.length, 6);
  assert.equal(a.rng.n, 24);
  assert.deepEqual(x.sets.map((s) => s.faces), y.sets.map((s) => s.faces));
  const other = rollScores({ rng: keyedRng("f".repeat(64)) });
  assert.notDeepEqual(x.sets.map((s) => s.faces), other.sets.map((s) => s.faces));
  // The old integer seed rolls the same way (a game state is a valid rng holder).
  const g = { rng: 7 }, h = { rng: 7 };
  assert.deepEqual(rollScores(g).sets.map((s) => s.faces), rollScores(h).sets.map((s) => s.faces));
});

test("rolled scores are spread as 4d6 drop lowest should be: a thousand scores average about 12.2 and stay 3 to 18", () => {
  const s = { rng: keyedRng("ab".repeat(32)) };
  let total = 0, lo = 99, hi = 0;
  for (let i = 0; i < 1000; i++) { const t = rollScore(s).total; total += t; lo = Math.min(lo, t); hi = Math.max(hi, t); }
  assert.ok(total / 1000 > 11.8 && total / 1000 < 12.7, `mean ${total / 1000}`);
  assert.ok(lo >= 3 && hi <= 18 && hi >= 17);
});

test("the reroll rule: none by default; below N judges the first roll; each; the result that stands", () => {
  const set = { dice: [2, 3, 3, 1] };                                 // 8
  const none = DEFAULT_RULE, below = { reroll: "below", below: 10, result: "new" }, each = { reroll: "each", result: "higher" };
  assert.equal(topThree(set.dice), 8);
  assert.equal(mayReroll(set, none), false);
  assert.equal(mayReroll(set, below), true);
  assert.equal(mayReroll({ dice: [5, 3, 6, 2] }, below), false, "14 is not below 10");
  assert.equal(mayReroll({ dice: [4, 3, 3, 1] }, below), false, "10 is not below 10");
  assert.equal(mayReroll({ dice: [4, 3, 2, 1] }, below), true, "9 is");
  assert.equal(mayReroll({ dice: [6, 6, 6, 1] }, each), true);
  assert.equal(mayReroll({ ...set, again: [6, 5, 4, 1] }, each), false, "once only");
  assert.equal(rerollWhy({ dice: [5, 3, 6, 2] }, below), "14 is not below 10.");
  assert.equal(rerollWhy(set, none), "This rule does not allow a score to be rolled again.");
  assert.equal(rerollWhy({ ...set, again: [1, 1, 1, 1] }, each), "It has been rolled again already.");
  assert.equal(rerollWhy(set, below), "");
  assert.equal(rerollOpen(null, 3), false);
  // The new roll stands even when lower; under `higher` the larger stands, and a tie is the same number.
  const worse = { dice: [2, 3, 3, 1], again: [1, 1, 2, 1] };            // 8 then 4
  assert.equal(standing(worse, { ...below, result: "new" }), 4);
  assert.equal(standing(worse, { ...below, result: "higher" }), 8);
  const better = { dice: [2, 3, 3, 1], again: [6, 6, 5, 1] };           // 8 then 17
  assert.equal(standing(better, { ...below, result: "new" }), 17);
  assert.equal(standing(better, { ...below, result: "higher" }), 17);
  assert.equal(standing(set, below), 8, "no reroll: the first stands");
  assert.equal(standing({ dice: [2, 3, 3, 1], again: [3, 3, 2, 1] }, each), 8);
});

test("a rule is checked and made safe; its words say which result stands", () => {
  assert.equal(ruleProblem(DEFAULT_RULE), false);
  assert.equal(ruleProblem({ reroll: "below", below: 10, result: "new" }), false);
  assert.equal(ruleProblem({ reroll: "below", result: "new" }), true);
  assert.equal(ruleProblem({ reroll: "each", below: 10, result: "new" }), true);
  assert.equal(ruleProblem({ reroll: "sometimes", result: "new" }), true);
  assert.equal(ruleProblem({ reroll: "none", result: "best" }), true);
  assert.deepEqual(cleanRule({ reroll: "sometimes" }), { reroll: "none", result: "new" });
  assert.deepEqual(cleanRule(undefined), { reroll: "none", result: "new" });
  assert.equal(ruleText(DEFAULT_RULE), "No score may be rolled again (the SRD's rule).");
  assert.equal(ruleText({ reroll: "below", below: 10, result: "new" }), "A score below 10 may be rolled again, once. The new roll stands, even if it is lower.");
  assert.equal(ruleText({ reroll: "each", result: "higher" }), "Every score may be rolled again, once. The higher of the two stands.");
});

test("a background: +2 and +1, or +1 to three; an SRD one raises only its own abilities; never above 20", () => {
  assert.deepEqual(applyBackground(base, soldier), { ...base, str: 17, dex: 15 });
  assert.deepEqual(applyBackground(base, { id: "soldier", abilities: { str: 1, dex: 1, con: 1 } }), { ...base, str: 16, dex: 15, con: 14 });
  assert.equal(applyBackground({ ...base, str: 19 }, soldier).str, 20, "capped at 20");
  assert.equal(applyBackground({ ...base, str: 20 }, { abilities: { str: 1, dex: 1, con: 1 } }).str, 20);
  assert.deepEqual(applyBackground(base, undefined), base);
  assert.equal(backgroundProblem(soldier), "");
  assert.equal(backgroundProblem({ abilities: { int: 2, cha: 1 } }), "", "another background: any abilities, same shape");
  assert.equal(backgroundProblem({ id: "acolyte", abilities: { str: 2, dex: 1 } }), "Acolyte raises Intelligence, Wisdom and Charisma.");
  assert.equal(backgroundProblem({ id: "soldier", abilities: { str: 2, dex: 1, con: 1 } }).startsWith("A background raises"), true, "+2 +1 +1 is not allowed");
  for (const bad of [{ abilities: { str: 3 } }, { abilities: { str: 2 } }, { abilities: { str: 1, dex: 1 } }, { abilities: { str: 2, dex: 2 } }, { abilities: { luck: 2, dex: 1 } }, {}, null, { abilities: { str: 2, dex: 1 }, extra: 1 }]) {
    assert.match(backgroundProblem(bad), /^A background raises three abilities/, JSON.stringify(bad));
  }
  assert.match(backgroundProblem({ id: "noble", abilities: { str: 2, dex: 1 } }), /SRD backgrounds are acolyte, criminal, sage and soldier/);
});

test("a sheet with no scores record is not checked and plays as before", () => {
  assert.deepEqual(checkScores(NAMEDSHEET(base)), []);
  assert.deepEqual(validate(NAMEDSHEET(base)), []);
});

test("standard array: a record that agrees passes; one that is not the array says so", () => {
  const rec = { method: "standard", base, background: soldier };
  assert.deepEqual(validate(NAMEDSHEET({ str: 17, dex: 15, con: 13, int: 12, wis: 10, cha: 8 }, rec)), []);
  assert.deepEqual(checkScores(NAMEDSHEET({ ...base, str: 17, dex: 15 }, { method: "standard", base: { ...base, str: 14 }, background: soldier })), ["The Standard Array is 15, 14, 13, 12, 10 and 8, each used once."]);
  const order = { str: 8, dex: 10, con: 12, int: 13, wis: 14, cha: 15 };
  assert.deepEqual(checkScores(NAMEDSHEET(order, { method: "standard", base: order })), [], "any order of the six numbers");
});

test("point cost: 8 to 15 and at most 27 points; fewer than 27 is allowed", () => {
  const rec = { method: "pointcost", base };
  assert.deepEqual(checkScores(NAMEDSHEET(base, rec)), []);
  const cheap = { str: 12, dex: 12, con: 12, int: 8, wis: 8, cha: 8 };
  assert.deepEqual(checkScores(NAMEDSHEET(cheap, { method: "pointcost", base: cheap })), []);
  const high = { ...base, str: 16 };
  assert.deepEqual(checkScores(NAMEDSHEET(high, { method: "pointcost", base: high })), ["With point cost every score is 8 to 15 before the background."]);
  const over = { str: 15, dex: 15, con: 15, int: 9, wis: 8, cha: 8 };
  assert.deepEqual(checkScores(NAMEDSHEET(over, { method: "pointcost", base: over })), ["These scores cost 28 points; point cost allows 27."]);
});

const sets = [[5, 3, 6, 2], [4, 4, 4, 1], [6, 6, 5, 3], [2, 3, 3, 1], [4, 5, 3, 3], [6, 2, 4, 1]];   // 14 12 17 8 12 12
const rolled = (extra = {}) => ({ method: "roll", base: { str: 17, dex: 14, con: 12, int: 12, wis: 12, cha: 8 }, rolls: sets.map((dice) => ({ dice })), by: "device", at: "2026-11-19", ...extra });
test("a rolled record: six groups of four d6, the scores are their highest three, with or without a background", () => {
  const r = rolled();
  assert.deepEqual(r.rolls.map((s) => topThree(s.dice)), [14, 12, 17, 8, 12, 12]);
  assert.deepEqual(validate(NAMEDSHEET(r.base, r)), []);
  assert.deepEqual(validate(NAMEDSHEET({ ...r.base, str: 19, dex: 15 }, { ...r, background: soldier })), []);
  assert.deepEqual(checkScores(NAMEDSHEET({ ...r.base, int: 13 }, { ...r, base: { ...r.base, int: 13 } })), ["The scores are not the totals of the highest three dice of each roll."]);
  const sheet = (rolls) => NAMEDSHEET(r.base, { ...r, rolls });
  for (const bad of [r.rolls.slice(1), [...r.rolls.slice(1), { dice: [1, 2, 3] }], [...r.rolls.slice(1), { dice: [1, 2, 3, 7] }], [...r.rolls.slice(1), { dice: [1, 2, 3, 0] }], [...r.rolls.slice(1), { dice: [1, 2, 3, 1.5] }], [...r.rolls.slice(1), { dice: [1, 2, 3, 4], extra: 1 }], "six"]) {
    assert.deepEqual(checkScores(sheet(bad)), ["A rolled set is six groups of four d6, each die 1 to 6."], JSON.stringify(bad));
  }
  assert.deepEqual(checkScores(NAMEDSHEET(r.base, { ...r, by: "elsewhere" })), ['Its dice were rolled at the "table" or on a "device".']);
  assert.deepEqual(checkScores(NAMEDSHEET(r.base, { ...r, at: "19 Nov" })), ["Where its dice were rolled is dated as an event number or as YYYY-MM-DD."]);
  assert.deepEqual(checkScores(NAMEDSHEET(r.base, { ...r, by: "table", at: 120 })), []);
});

test("a rerolled score is recorded with both rolls, and which result stands is worked out from the rule", () => {
  // The 8 (set 4) rolled again: 17 (new stands) or kept 17 (higher stands).
  const again = [6, 6, 5, 1], second = sets.map((dice, i) => (i === 3 ? { dice, again } : { dice }));
  const newRule = { reroll: "below", below: 10, result: "new" }, highRule = { ...newRule, result: "higher" };
  const baseNew = { str: 17, dex: 14, con: 12, int: 17, wis: 12, cha: 12 };
  assert.deepEqual(checkScores(NAMEDSHEET(baseNew, { ...rolled(), base: baseNew, rolls: second, rule: newRule })), []);
  assert.deepEqual(checkScores(NAMEDSHEET(baseNew, { ...rolled(), base: baseNew, rolls: second, rule: highRule })), []);
  // A worse reroll: under `new` the 4 stands, under `higher` the 8 does.
  const worse = sets.map((dice, i) => (i === 3 ? { dice, again: [1, 1, 2, 1] } : { dice }));
  const b4 = { str: 17, dex: 14, con: 12, int: 4, wis: 12, cha: 12 }, b8 = { ...b4, int: 8 };
  assert.deepEqual(checkScores(NAMEDSHEET(b4, { ...rolled(), base: b4, rolls: worse, rule: newRule })), []);
  assert.deepEqual(checkScores(NAMEDSHEET(b8, { ...rolled(), base: b8, rolls: worse, rule: highRule })), []);
  assert.deepEqual(checkScores(NAMEDSHEET(b8, { ...rolled(), base: b8, rolls: worse, rule: newRule })), ["The scores are not the totals of the highest three dice of each roll."]);
  // A rule that does not allow it: none, or a first roll that was not below N.
  assert.deepEqual(checkScores(NAMEDSHEET(baseNew, { ...rolled(), base: baseNew, rolls: second })), ["This rule does not allow that score to be rolled again."]);
  assert.deepEqual(checkScores(NAMEDSHEET(baseNew, { ...rolled(), base: baseNew, rolls: second, rule: { reroll: "none", result: "new" } })), ["This rule does not allow that score to be rolled again."]);
  assert.deepEqual(checkScores(NAMEDSHEET(baseNew, { ...rolled(), base: baseNew, rolls: second, rule: { reroll: "below", below: 8, result: "new" } })), ["This rule does not allow that score to be rolled again."], "8 is not below 8");
  assert.deepEqual(checkScores(NAMEDSHEET(baseNew, { ...rolled(), base: baseNew, rolls: second, rule: { reroll: "each", result: "new" } })), []);
  assert.match(checkScores(NAMEDSHEET(baseNew, { ...rolled(), base: baseNew, rolls: second, rule: { reroll: "below", result: "new" } }))[0], /^Its reroll rule is none, below a number from 4 to 18, or each/);
});

test("the record must agree with the scores; a score typed over it is refused with what to do", () => {
  const rec = { method: "standard", base, background: soldier };
  const sheet = NAMEDSHEET({ str: 18, dex: 15, con: 13, int: 12, wis: 10, cha: 8 }, rec);
  assert.deepEqual(validate(sheet), ["The ability scores no longer match how they were made. Editing a score by hand clears this record."]);
  delete sheet.scores;
  assert.deepEqual(validate(sheet), [], "with the record cleared the sheet plays");
  // A rolled 18 with the Soldier's +2 shows 20; a score typed as 21 is not 20 and the record says it no longer matches.
  const hi = { str: 18, dex: 10, con: 12, int: 8, wis: 10, cha: 8 };
  const rolls = [[6, 6, 6, 1], [4, 3, 3, 1], [4, 4, 4, 1], [2, 3, 3, 1], [4, 3, 3, 1], [2, 3, 3, 1]].map((dice) => ({ dice }));
  assert.deepEqual(validate(NAMEDSHEET({ ...hi, str: 20, dex: 11 }, { ...rolled(), base: hi, rolls, background: soldier })), []);
  const over = { ...hi, str: 19 };
  assert.deepEqual(checkScores(NAMEDSHEET({ ...over, dex: 11 }, { ...rolled(), base: over, rolls: rolls.map((s, i) => (i === 0 ? { dice: [6, 6, 6, 1] } : s)), background: soldier })), ["The scores are not the totals of the highest three dice of each roll."]);
  assert.deepEqual(checkScores(NAMEDSHEET({ ...hi, str: 21, dex: 11 }, { ...rolled(), base: hi, rolls, background: soldier })), ["The ability scores no longer match how they were made. Editing a score by hand clears this record."]);
});

test("the record's own shape: unknown method, unknown key, no base, a background of the wrong shape, dice on a method that has none", () => {
  const ok = { method: "standard", base };
  assert.match(checkScores(NAMEDSHEET(base, { ...ok, method: "pick" }))[0], /^Its ability scores say they were made by a method this game does not have/);
  assert.match(checkScores(NAMEDSHEET(base, { ...ok, secret: 1 }))[0], /has something it should not: "secret"/);
  assert.match(checkScores(NAMEDSHEET(base, { method: "standard" }))[0], /needs a base number for each of the six abilities/);
  assert.match(checkScores(NAMEDSHEET(base, { method: "standard", base: { ...base, str: "15" } }))[0], /needs a base number/);
  assert.match(checkScores(NAMEDSHEET(base, "standard"))[0], /^The record of how the ability scores were made is/);
  assert.equal(checkScores(NAMEDSHEET(base, { ...ok, background: { abilities: { str: 2 } } }))[0].startsWith("A background raises three abilities"), true);
  assert.deepEqual(checkScores(NAMEDSHEET(base, { ...ok, by: "device" })), ["Only a rolled set keeps dice, a reroll rule and where it was rolled."]);
  // Through validate, in the sheet's own list of problems.
  assert.ok(validate(NAMEDSHEET(base, { ...ok, method: "pick" })).some((m) => /method this game does not have/.test(m)));
});

test("a sheet with a record derives as one without: the record changes nothing about the numbers", () => {
  const plain = NAMEDSHEET({ str: 17, dex: 15, con: 13, int: 12, wis: 10, cha: 8 }), withRec = { ...plain, scores: { method: "standard", base, background: soldier } };
  assert.deepEqual(validate(withRec), []);
  assert.deepEqual(derive(withRec).record, derive(plain).record);
});

test("the words: one line for a list, a fuller one for the DM, saying plainly that a roll on a device was not witnessed", () => {
  assert.equal(dayText("2026-11-19"), "19 Nov 2026");
  assert.equal(dayText("nonsense"), "");
  assert.equal(scoresLine(NAMEDSHEET(base)), "");
  assert.equal(scoresLine(NAMEDSHEET(base, { method: "standard", base })), "Standard array");
  assert.equal(scoresLine(NAMEDSHEET(base, { method: "pointcost", base })), "Point cost, 27 of 27 points");
  assert.equal(scoresLine(NAMEDSHEET({ str: 17, dex: 15, con: 13, int: 12, wis: 10, cha: 8 }, { method: "standard", base, background: soldier })), "Standard array. Soldier: +2 STR, +1 DEX");
  assert.equal(scoresLine(NAMEDSHEET(rolled().base, rolled())), "Rolled on a device, 19 Nov 2026");
  assert.equal(scoresLine(NAMEDSHEET(rolled().base, rolled({ by: "table", at: 41 }))), "Rolled at the table");
  assert.equal(scoresLine(NAMEDSHEET({ ...base, str: 99 }, { method: "standard", base })), "", "a record that disagrees is not described");
  const line = dmLine(NAMEDSHEET(rolled().base, rolled()));
  assert.match(line, /^Rolled on the player's device on 19 Nov 2026, under the rule "No score may be rolled again \(the SRD's rule\)\." \(set on that device\): 14 \(5 3 6, 2 dropped\); 12 \(4 4 4, 1 dropped\)/);
  assert.match(line, /Not witnessed: the table did not roll these\.$/);
  assert.match(dmLine(NAMEDSHEET(rolled().base, rolled({ by: "table", at: 41 }))), /^Rolled at the table \(event 41\)/);
  assert.doesNotMatch(dmLine(NAMEDSHEET(rolled().base, rolled({ by: "table", at: 41 }))), /Not witnessed/);
  assert.equal(dmLine(NAMEDSHEET(base)), "");
  assert.equal(dmLine(NAMEDSHEET(base, { method: "standard", base })), "Ability scores: the Standard Array.");
  assert.equal(dmLine(NAMEDSHEET(base, { method: "pointcost", base })), "Ability scores: point cost, 27 of 27 points.");
});

test("a reroll shows in the DM's line: both rolls, which stands, and a table that allows fewer is told", () => {
  const rule = { reroll: "below", below: 10, result: "higher" };
  const worse = sets.map((dice, i) => (i === 3 ? { dice, again: [1, 1, 2, 1] } : { dice }));
  const b8 = { ...rolled().base };
  const sheet = NAMEDSHEET(b8, rolled({ rolls: worse, rule }));
  assert.deepEqual(checkScores(sheet), []);
  assert.equal(setText(worse[3], rule), "8 (2 3 3, 1 dropped), rolled again, but the first stands over 4 (1 2 1, 1 dropped); the higher stands");
  const better = { dice: [2, 3, 3, 1], again: [6, 6, 5, 1] };
  assert.equal(setText(better, { ...rule, result: "new" }), "17 (6 6 5, 1 dropped), rolled again from 8 (2 3 3, 1 dropped); the new roll stands");
  const line = dmLine(sheet);
  assert.match(line, /A score below 10 may be rolled again, once\. The higher of the two stands\./);
  assert.match(line, /8 \(2 3 3, 1 dropped\), rolled again, but the first stands over 4/);
  assert.doesNotMatch(line, /More rerolls/);
  assert.match(dmLine(sheet, { reroll: "none", result: "new" }), /More rerolls than this table allows\./);
  assert.match(dmLine(sheet, { reroll: "each", result: "new" }), /^((?!More rerolls).)*$/);
  assert.doesNotMatch(dmLine(sheet, { reroll: "below", below: 9, result: "new" }), /More rerolls/, "8 is below 9");
  assert.match(dmLine(sheet, { reroll: "below", below: 8, result: "new" }), /More rerolls/, "8 is not below 8");
});
