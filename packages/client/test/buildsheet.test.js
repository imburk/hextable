// The build screen's pure part: how many options a feature that picks from a list allows (`pickLimit`), a number
// (Metamagic) or by the class table (Eldritch Invocations, #232). The client imports the rules as ./shared, so the test lays
// the two side by side in a temporary folder, as actionpanel.test.js does. Not looked at in a browser.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'buildsheet-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const { pickLimit, optionWhy, featPoints, KEEP, keptOf } = await import(pathToFileURL(join(tmp, 'buildsheet.js')));
const { featuresOf } = await import(pathToFileURL(join(tmp, 'shared/derive.js')));

const of = (sheet, id) => featuresOf(sheet).find((x) => x.f.id === id && !x.option);
test('pickLimit: the Invocations column for a warlock, a plain number for Metamagic', () => {
  const wl = (level) => ({ name: 'Mor', class: 'warlock', level, abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 18 } });
  assert.deepEqual([1, 2, 5, 7, 9, 12, 15, 18].map((l) => pickLimit(of(wl(l), 'eldritch-invocations'))), [1, 3, 5, 6, 7, 8, 9, 10]);
  assert.equal(pickLimit(of({ name: 'Jed', class: 'sorcerer', level: 2, abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 18 } }, 'metamagic')), 2);
});

test('optionWhy: an invocation\'s prerequisite (a level, another option, a cantrip) is said in words and cleared once met', () => {
  const sheet = { name: 'Mor', class: 'warlock', level: 5, abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 18 } };
  const x = of(sheet, 'eldritch-invocations'), opt = (id) => x.f.options.find((o) => o.id === id);
  const withReq = x.f.options.filter((o) => o.requires);
  assert.ok(withReq.length > 0, 'the pack has invocations with prerequisites');
  for (const o of withReq) {
    const q = o.requires;
    if (q.level !== undefined) assert.equal(optionWhy({ ...x, cls: { ...x.cls, level: q.level - 1 } }, o, [], ['eldritch-blast']), `Needs Warlock level ${q.level}.`);
    if (q.option !== undefined) assert.match(optionWhy({ ...x, cls: { ...x.cls, level: 20 } }, o, [], ['eldritch-blast']), /^Needs /);
    if (q.option !== undefined) assert.equal(optionWhy({ ...x, cls: { ...x.cls, level: 20 } }, o, [q.option], ['eldritch-blast', q.spell].filter(Boolean)), '');
    if (q.spell !== undefined) assert.match(optionWhy({ ...x, cls: { ...x.cls, level: 20 } }, o, q.option ? [q.option] : [], []), /among the spells/);
  }
  assert.equal(optionWhy(x, opt('armor-of-shadows'), [], []), '', 'no prerequisite, no reason');
});

test('featPoints: +2 to one ability or +1 to two (an Ability Score Improvement), +1 to one (a feat of one point)', () => {
  const two = { from: ['str', 'dex', 'con', 'int', 'wis', 'cha'], points: 2, max: 20 }, one = { from: ['str', 'dex'], points: 1, max: 20 };
  assert.deepEqual(featPoints(two, 'dex'), { dex: 2 });
  assert.deepEqual(featPoints(two, 'dex', 'con'), { dex: 1, con: 1 });
  assert.deepEqual(featPoints(two, 'dex', 'dex'), { dex: 2 }, 'the same ability twice is +2');
  assert.deepEqual(featPoints(one, 'str', 'dex'), { str: 1 });
  assert.equal(featPoints(two, ''), undefined);
});

test('editing a character keeps every sheet field the screen has no control for, the DM score bonus too (#498)', async () => {
  const { importFgxml } = await import(pathToFileURL(join(tmp, 'shared/import-fgxml.js')));
  const { validate, derive } = await import(pathToFileURL(join(tmp, 'shared/derive.js')));
  const { readFileSync } = await import('node:fs');
  const xml = readFileSync(join(here, '../../rules/test/fixtures/fgxml-cleric.xml'), 'utf8').replace('<score type="number">16</score>', '<score type="number">24</score>');
  const { character } = importFgxml(xml);
  assert.deepEqual(character.scoreBonus, { wis: 4 });
  // What the screen controls itself; every other field of an imported sheet must be in KEEP or an edit would drop it.
  const own = ['name', 'class', 'subclass', 'level', 'abilities', 'skills', 'expertise', 'choices', 'feats', 'armour', 'shield', 'weapons', 'spells', 'look'];
  assert.deepEqual(Object.keys(character).filter((k) => !own.includes(k) && !KEEP.includes(k)), [], 'a field of the sheet the screen would lose');
  assert.deepEqual(keptOf(character).scoreBonus, { wis: 4 });
  assert.notEqual(keptOf(character).scoreBonus, character.scoreBonus, 'a copy, not the sheet\'s own object');
  assert.equal(keptOf({ name: 'x' }).scoreBonus, undefined);
  // Put back on a sheet the way Save does, it still validates and plays the same score.
  const back = { ...character, scoreBonus: undefined, ...keptOf(character) };
  assert.deepEqual(validate(back), []);
  assert.equal(derive(back).record.abil.wis, 24);
});
