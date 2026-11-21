// Rolled Hit Points (issue #638). SRD 5.2, "Gaining a Level": a new level adds the class's Hit Die roll or its fixed value (half the die, plus 1), plus the
// Constitution modifier, at least 1 Hit Point for the level. A table may roll. Level 1 of the first class stays the die's highest number.
//
// The sheet keeps the rolls: `sheet.hpRolls = { "<class id>": [r, r, null, ...] }`, one entry for each level that adds Hit Points in that class (the first
// class from its level 2, any other from its level 1). An entry is the number of the die that stands (1 to the die's sides), or null (not rolled yet: derive.js
// counts the fixed value and says so). The engine alone writes it (engine/characters.js), from the game's seeded dice, so a game replays; derive.js reads it
// only where the table's method is `rolled` (`derive(sheet, { hp: 'rolled' })`), so a table on the fixed method ignores it. Pure: no state of its own.
import { roll } from './rng.js';

export const HP_METHODS = Object.freeze(['fixed', 'rolled']);
// What a roll of 1, or a low roll, does at a rolled table (the SRD has neither rule): keep the roll; roll a 1 again once (the new roll stands); take the fixed value
// if the roll is lower.
export const HP_LOW = Object.freeze(['keep', 'reroll1', 'fixedMin']);

const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const fixedOf = (die) => die / 2 + 1;
export const isRolled = (settings) => settings?.hpMethod === 'rolled';
export const lowRule = (settings) => (HP_LOW.includes(settings?.hpRollLow) ? settings.hpRollLow : 'keep');

// One level's die under the table's rule: { dice: [{ sides, value, drop? }], value }. A first roll of 1 that is rolled again is shown dropped.
export function rollLevel(state, die, rule) {
  const first = roll(state, `1d${die}`).rolls[0], dice = [{ sides: die, value: first }];
  let value = first;
  if (rule === 'reroll1' && first === 1) { dice[0].drop = true; value = roll(state, `1d${die}`).rolls[0]; dice.push({ sides: die, value }); }
  if (rule === 'fixedMin' && value < fixedOf(die)) { dice.at(-1).low = true; value = fixedOf(die); }
  return { dice, value };
}

// The levels of a class that add Hit Points: all of them but the first character level.
export const levelsOwed = (level, first) => Math.max(0, (level | 0) - (first ? 1 : 0));
// The class level an entry of hpRolls stands for.
export const levelOfEntry = (index, first) => index + (first ? 2 : 1);

// What validate() says about `sheet.hpRolls` (nothing if there is none). `ks` is derive.js's `classesOf(sheet)`.
export function checkHpRolls(sheet, ks) {
  const r = sheet?.hpRolls;
  if (r === undefined) return [];
  if (!isObj(r)) return ['The Hit Point rolls are { class: [roll, ...] }.'];
  const out = [];
  for (const [id, list] of Object.entries(r)) {
    const i = ks.findIndex((k) => k.c?.id === id), k = ks[i];
    if (!k) { out.push(`There are Hit Point rolls for "${String(id).slice(0, 30)}", which this sheet does not have as a class.`); continue; }
    if (!Array.isArray(list) || list.length > levelsOwed(k.level, i === 0)) { out.push(`The ${k.c.name} Hit Point rolls are a list with one entry for each level after the first.`); continue; }
    if (!list.every((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= k.c.hitDie))) out.push(`A ${k.c.name} Hit Point roll is a whole number from 1 to ${k.c.hitDie}, or null where it has not been rolled.`);
  }
  return out;
}

// The rolls a sheet holds for a class, cut to the levels it now has (a class that lost levels loses the rolls of those levels), padded with null to `n`.
export const rollsFor = (sheet, id, n) => Array.from({ length: n }, (_, j) => { const v = sheet?.hpRolls?.[id]?.[j]; return Number.isInteger(v) ? v : null; });
// Whether the rolls on `sheet` are exactly those of `held` where they count: what the engine checks of a sheet sent by a client. `ks` is classesOf(sheet).
export function sameRolls(sheet, held, ks) {
  return ks.every((k, i) => { const n = levelsOwed(k.level, i === 0), id = k.c?.id; return JSON.stringify(rollsFor(sheet, id, n)) === JSON.stringify(rollsFor(held, id, n)); })
    && Object.keys(sheet?.hpRolls ?? {}).every((id) => ks.some((k) => k.c?.id === id));
}
