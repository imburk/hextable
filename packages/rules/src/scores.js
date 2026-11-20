// Making ability scores (docs/specs/ability-scores.md): the three SRD 5.2 methods, the background's increase, rerolls, and the
// record a sheet keeps of how its scores were made. Pure: no state of its own, no clock, no I/O. A roll takes any object that
// has an `rng` (the game's state, or `{ rng: keyedRng(hex) }` where there is no game), so the dice are the engine's dice.
//
// SRD 5.2, "Step 3: Ability Scores" (reference/srd52/srd52-flow.txt, lines 2792 to 2865) and the Background description (19502):
//   Standard Array 15, 14, 13, 12, 10, 8. Random Generation: four d6, the highest three added, six times.
//   Point Cost: 27 points, scores 8 to 15, costs below. After assigning, the background raises three listed abilities:
//   one by 2 and another by 1, or all three by 1, never above 20. The SRD has no rule for rerolling a score.
//
// A sheet's `abilities` stay the scores after the background and before feats (derive.js adds feats). `sheet.scores` is an optional
// record of how they were made; `checkScores` is what `validate` says about it. A sheet without one is not checked.
import { ABILITIES } from './content/schema.js';
import { roll } from './rng.js';

export const NAMES = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
export const STANDARD_ARRAY = Object.freeze([15, 14, 13, 12, 10, 8]);
export const POINT_COST = Object.freeze({ 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 });
export const POINT_BUDGET = 27;
export const METHODS = Object.freeze(['standard', 'pointcost', 'roll']);
// The SRD's Standard Array by Class table (line 2923): where it suggests the six numbers go.
export const ARRAY_BY_CLASS = Object.freeze({
  barbarian: { str: 15, dex: 13, con: 14, int: 10, wis: 12, cha: 8 },
  bard: { str: 8, dex: 14, con: 12, int: 13, wis: 10, cha: 15 },
  cleric: { str: 14, dex: 8, con: 13, int: 10, wis: 15, cha: 12 },
  druid: { str: 8, dex: 12, con: 14, int: 13, wis: 15, cha: 10 },
  fighter: { str: 15, dex: 14, con: 13, int: 8, wis: 10, cha: 12 },
  monk: { str: 12, dex: 15, con: 13, int: 10, wis: 14, cha: 8 },
  paladin: { str: 15, dex: 10, con: 13, int: 8, wis: 12, cha: 14 },
  ranger: { str: 12, dex: 15, con: 13, int: 8, wis: 14, cha: 10 },
  rogue: { str: 12, dex: 15, con: 13, int: 14, wis: 10, cha: 8 },
  sorcerer: { str: 10, dex: 13, con: 14, int: 8, wis: 12, cha: 15 },
  warlock: { str: 8, dex: 14, con: 13, int: 12, wis: 10, cha: 15 },
  wizard: { str: 8, dex: 12, con: 13, int: 15, wis: 14, cha: 10 },
});
// The four SRD backgrounds and the three abilities each lists (lines 19478, 19491, 19531, 19540). The pack has no background entries yet
// (DEBT), so this is a constant; a background's feat, skills and tool are not read from it.
export const BACKGROUNDS = Object.freeze({
  acolyte: { name: 'Acolyte', abilities: ['int', 'wis', 'cha'] },
  criminal: { name: 'Criminal', abilities: ['dex', 'con', 'int'] },
  sage: { name: 'Sage', abilities: ['con', 'int', 'wis'] },
  soldier: { name: 'Soldier', abilities: ['str', 'dex', 'con'] },
});
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const list = (names) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0] ?? '');
const sum = (a) => a.reduce((n, x) => n + x, 0);

// ---------- point cost ----------
// The points the scores cost, or null if a score is outside 8 to 15 (or is not a number). `scores` is { str, ... }.
export function pointsSpent(scores) {
  let n = 0;
  for (const a of ABILITIES) { const v = scores?.[a], c = Number.isInteger(v) ? POINT_COST[v] : undefined; if (c === undefined) return null; n += c; }
  return n;
}
export const pointsLeft = (scores) => { const n = pointsSpent(scores); return n === null ? null : POINT_BUDGET - n; };

// ---------- rolling ----------
// A score: four d6, the lowest die set aside (the first of equal lowest). { faces: [4 numbers in the order rolled], dice: [{ sides, value, drop? }], total }.
// `dice` is the faces shape of docs/specs/dice.md; `faces` is what a sheet keeps.
export function rollScore(state) {
  const r = roll(state, '4d6'), faces = r.rolls.slice();
  const low = faces.indexOf(Math.min(...faces));
  return { faces, dice: faces.map((value, i) => ({ sides: 6, value, ...(i === low ? { drop: true } : {}) })), total: topThree(faces) };
}
// Six scores, one after the other from the same rng.
export const rollScores = (state) => ({ sets: Array.from({ length: 6 }, () => rollScore(state)) });
// The total of the highest three of four dice.
export const topThree = (faces) => sum(faces) - Math.min(...faces);

// ---------- the reroll rule ----------
// { reroll: 'none' | 'below' | 'each', below?: N, result: 'new' | 'higher' }. The SRD has none, so `none` and `new` are the defaults.
export const REROLLS = Object.freeze(['none', 'below', 'each']);
export const RESULTS = Object.freeze(['new', 'higher']);
export const BELOW = Object.freeze([10, 8, 9, 11, 12, 13, 14]);
export const DEFAULT_RULE = Object.freeze({ reroll: 'none', result: 'new' });
export const ruleProblem = (rule) => !(isObj(rule) && Object.keys(rule).every((k) => ['reroll', 'below', 'result'].includes(k)) && REROLLS.includes(rule.reroll) && RESULTS.includes(rule.result)
  && (rule.reroll === 'below' ? Number.isInteger(rule.below) && rule.below >= 4 && rule.below <= 18 : rule.below === undefined));
// A rule made safe: anything wrong gives the default.
export const cleanRule = (rule) => (ruleProblem(rule) ? { ...DEFAULT_RULE } : { reroll: rule.reroll, ...(rule.reroll === 'below' ? { below: rule.below } : {}), result: rule.result });
// Whether the rule lets a score whose first roll made `first` be rolled again (once; whether it already was is for the set to say).
export const rerollOpen = (rule, first) => !!rule && (rule.reroll === 'each' || (rule.reroll === 'below' && first < rule.below));
// A set is { dice: [4 faces], again?: [4 faces] }.
export const mayReroll = (set, rule) => !set.again && rerollOpen(rule, topThree(set.dice));
// Why a set cannot be rolled again, in words ('' if it can).
export function rerollWhy(set, rule) {
  if (set.again) return 'It has been rolled again already.';
  if (!rule || rule.reroll === 'none') return 'This rule does not allow a score to be rolled again.';
  const first = topThree(set.dice);
  return rerollOpen(rule, first) ? '' : `${first} is not below ${rule.below}.`;
}
// The score that stands: the first roll, or after a reroll the new roll, or the higher of the two if the rule says so.
export function standing(set, rule) {
  const first = topThree(set.dice);
  if (!set.again) return first;
  const again = topThree(set.again);
  return rule?.result === 'higher' ? Math.max(first, again) : again;
}
export function ruleText(rule) {
  const r = cleanRule(rule);
  if (r.reroll === 'none') return 'No score may be rolled again (the SRD\'s rule).';
  const which = r.reroll === 'each' ? 'Every score may be rolled again, once.' : `A score below ${r.below} may be rolled again, once.`;
  return `${which} ${r.result === 'higher' ? 'The higher of the two stands.' : 'The new roll stands, even if it is lower.'}`;
}

// ---------- the background ----------
// The sentence for a background that cannot be, or '' (the shape: one ability +2 and another +1, or three at +1; an SRD one raises only its own three).
export function backgroundProblem(bg) {
  const shape = 'A background raises three abilities: one by 2 and another by 1, or all three by 1.';
  if (!isObj(bg) || !isObj(bg.abilities) || Object.keys(bg).some((k) => !['id', 'abilities'].includes(k))) return shape;
  const es = Object.entries(bg.abilities), n = es.map(([, v]) => v).sort().join();
  if (!es.every(([a, v]) => ABILITIES.includes(a) && Number.isInteger(v)) || !(n === '1,2' || n === '1,1,1')) return shape;
  if (bg.id !== undefined) {
    if (typeof bg.id !== 'string' || !Object.hasOwn(BACKGROUNDS, bg.id)) return 'The SRD backgrounds are acolyte, criminal, sage and soldier; leave the name out for another background.';
    const d = BACKGROUNDS[bg.id];
    if (es.some(([a]) => !d.abilities.includes(a))) return `${d.name} raises ${list(d.abilities.map((a) => NAMES[a]))}.`;
  }
  return '';
}
// The scores after a background's increase, none above 20. `bg` is { abilities: { int: 2, wis: 1 } } (or none).
export function applyBackground(base, bg) {
  const out = { ...base };
  if (isObj(bg?.abilities)) for (const [a, n] of Object.entries(bg.abilities)) if (ABILITIES.includes(a) && Number.isInteger(n)) out[a] = Math.min(20, out[a] + n);
  return out;
}

// ---------- the record on a sheet ----------
const KEYS = ['method', 'base', 'background', 'rolls', 'rule', 'by', 'at'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const faces4 = (d) => Array.isArray(d) && d.length === 4 && d.every((v) => Number.isInteger(v) && v >= 1 && v <= 6);
// What `validate` says about `sheet.scores` (nothing if there is none). Each is one plain sentence.
export function checkScores(sheet) {
  const r = sheet?.scores;
  if (r === undefined) return [];
  if (!isObj(r)) return ['The record of how the ability scores were made is { method, base, ... }.'];
  const out = [], say = (m) => out.push(m);
  for (const k of Object.keys(r)) if (!KEYS.includes(k)) say(`The record of how the ability scores were made has something it should not: "${String(k).slice(0, 30)}".`);
  if (!METHODS.includes(r.method)) return [...out, 'Its ability scores say they were made by a method this game does not have (standard, pointcost or roll).'];
  if (!(isObj(r.base) && ABILITIES.every((a) => Number.isInteger(r.base[a])))) return [...out, 'The record of how the ability scores were made needs a base number for each of the six abilities.'];
  const base = ABILITIES.map((a) => r.base[a]);
  if (r.method === 'standard' && [...base].sort((x, y) => y - x).join() !== STANDARD_ARRAY.join()) say('The Standard Array is 15, 14, 13, 12, 10 and 8, each used once.');
  if (r.method === 'pointcost') {
    const spent = pointsSpent(r.base);
    if (spent === null) say('With point cost every score is 8 to 15 before the background.');
    else if (spent > POINT_BUDGET) say(`These scores cost ${spent} points; point cost allows ${POINT_BUDGET}.`);
  }
  if (r.method === 'roll') {
    const sets = r.rolls;
    if (!(Array.isArray(sets) && sets.length === 6 && sets.every((s) => isObj(s) && Object.keys(s).every((k) => ['dice', 'again'].includes(k)) && faces4(s.dice) && (s.again === undefined || faces4(s.again))))) say('A rolled set is six groups of four d6, each die 1 to 6.');
    else {
      const rule = r.rule === undefined ? DEFAULT_RULE : r.rule;
      if (ruleProblem(rule)) say('Its reroll rule is none, below a number from 4 to 18, or each, and either the new roll or the higher of the two stands.');
      else {
        if (sets.some((s) => s.again && !rerollOpen(rule, topThree(s.dice)))) say('This rule does not allow that score to be rolled again.');
        const stands = sets.map((s) => standing(s, rule)).sort((x, y) => y - x).join(), placed = [...base].sort((x, y) => y - x).join();
        if (stands !== placed) say('The scores are not the totals of the highest three dice of each roll.');
      }
    }
    if (r.by !== undefined && !['table', 'device'].includes(r.by)) say('Its dice were rolled at the "table" or on a "device".');
    if (r.at !== undefined && !((Number.isSafeInteger(r.at) && r.at >= 0) || (typeof r.at === 'string' && DAY.test(r.at)))) say('Where its dice were rolled is dated as an event number or as YYYY-MM-DD.');
  } else if (r.rolls !== undefined || r.rule !== undefined || r.by !== undefined || r.at !== undefined) say('Only a rolled set keeps dice, a reroll rule and where it was rolled.');
  if (r.background !== undefined) {
    const bad = backgroundProblem(r.background);
    if (bad) say(bad);
  }
  if (!out.length) {
    const want = applyBackground(r.base, r.background);
    if (ABILITIES.some((a) => sheet.abilities?.[a] !== want[a])) say('The ability scores no longer match how they were made. Editing a score by hand clears this record.');
  }
  return out;
}

// ---------- words ----------
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayText = (d) => (typeof d === 'string' && DAY.test(d) ? `${+d.slice(8)} ${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : '');
const facesText = (f) => { const low = f.indexOf(Math.min(...f)); return `${f.filter((_, i) => i !== low).join(' ')}, ${f[low]} dropped`; };
// One rolled score as words: "14 (5 3 6, 2 dropped)", and a reroll "13 (6 4 3, 1 dropped), rolled again from 8 (3 2 2, 1 dropped); the new roll stands".
export function setText(set, rule) {
  const now = `${standing(set, rule)}`;
  if (!set.again) return `${now} (${facesText(set.dice)})`;
  const keepNew = standing(set, rule) === topThree(set.again), r = cleanRule(rule);
  const was = keepNew ? { d: set.dice, rest: 'rolled again from' } : { d: set.again, rest: 'rolled again, but the first stands over' };
  return `${now} (${facesText(keepNew ? set.again : set.dice)}), ${was.rest} ${topThree(was.d)} (${facesText(was.d)}); ${r.result === 'higher' ? 'the higher stands' : 'the new roll stands'}`;
}
const bgText = (bg) => {
  if (!bg) return '';
  const name = bg.id ? BACKGROUNDS[bg.id]?.name ?? bg.id : 'Another background';
  return `${name}: ${Object.entries(bg.abilities ?? {}).sort((x, y) => y[1] - x[1]).map(([a, n]) => `+${n} ${a.toUpperCase()}`).join(', ')}`;
};
// How a character's scores were made, in one short line ('' for a sheet with no record), for My characters and the lists.
export function scoresLine(sheet) {
  const r = sheet?.scores;
  if (!isObj(r) || checkScores(sheet).length) return '';
  const how = r.method === 'standard' ? 'Standard array' : r.method === 'pointcost' ? `Point cost, ${pointsSpent(r.base)} of ${POINT_BUDGET} points`
    : `Rolled ${r.by === 'table' ? 'at the table' : r.by === 'device' ? `on a device${dayText(r.at) ? `, ${dayText(r.at)}` : ''}` : ''}`.trim();
  return `${how}${r.background ? `. ${bgText(r.background)}` : ''}`;
}
// For the DM, under the scores: where a roll was made and how, with every die, and a plain "not witnessed" for a roll on a device. '' with no record.
// `table` is the table's own reroll rule when the caller has it: a sheet that rerolled more than that is said to have.
export function dmLine(sheet, table) {
  const r = sheet?.scores;
  if (!isObj(r) || checkScores(sheet).length) return '';
  const bg = r.background ? ` ${bgText(r.background)}.` : '';
  if (r.method === 'standard') return `Ability scores: the Standard Array.${bg}`;
  if (r.method === 'pointcost') return `Ability scores: point cost, ${pointsSpent(r.base)} of ${POINT_BUDGET} points.${bg}`;
  const rule = cleanRule(r.rule), sets = r.rolls.map((s) => setText(s, rule)).join('; ');
  const where = r.by === 'table' ? `Rolled at the table${Number.isInteger(r.at) ? ` (event ${r.at})` : ''}` : `Rolled on the player's device${dayText(r.at) ? ` on ${dayText(r.at)}` : ''}`;
  const more = table && r.rolls.some((s) => s.again && !rerollOpen(cleanRule(table), topThree(s.dice))) ? ' More rerolls than this table allows.' : '';
  const note = r.by === 'table' ? '' : ' Not witnessed: the table did not roll these.';
  return `${where}, under the rule "${ruleText(rule)}"${r.by === 'device' ? ' (set on that device)' : ''}: ${sets}.${note}${more}${bg}`;
}
