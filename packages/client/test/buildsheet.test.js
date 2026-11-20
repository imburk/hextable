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
const { pickLimit, optionWhy, featPoints, KEEP, keptOf, bonusText, withoutBonus, subclassChoices, subclassNote, classTitle, missingText } = await import(pathToFileURL(join(tmp, 'buildsheet.js')));
const { standing } = await import(pathToFileURL(join(tmp, 'shared/scores.js')));
const { view } = await import(pathToFileURL(join(tmp, 'shared/view.js')));
const { rollsOfEvent, rerollInto, resultOf, tableRollRule, keptRoll } = await import(pathToFileURL(join(tmp, 'buildsheet.js')));
const { viewEvents } = await import(pathToFileURL(join(tmp, 'shared/view.js')));
const { keyedRng } = await import(pathToFileURL(join(tmp, 'shared/rng.js')));
const { freshScores, scoreBase, scoreBackground, scoreParts, scoresDraft, bgAbilities, METHOD_NAMES } = await import(pathToFileURL(join(tmp, 'buildsheet.js')));
const { featuresOf } = await import(pathToFileURL(join(tmp, 'shared/derive.js')));
const { loadPack, overlayOf, using } = await import(pathToFileURL(join(tmp, 'shared/content/registry.js')));
const { derive, validate } = await import(pathToFileURL(join(tmp, 'shared/derive.js')));
const { apply } = await import(pathToFileURL(join(tmp, 'shared/engine.js')));
const { newGame } = await import(pathToFileURL(join(tmp, 'shared/scenario.js')));
const { CONTENT } = await import(pathToFileURL(join(tmp, 'shared/content/index.js')));

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

test('the DM score bonus is said in words and can be taken off the kept fields (#498)', () => {
  assert.equal(bonusText({ cha: 2 }), 'DM bonus: +2 Charisma');
  assert.equal(bonusText({ str: 1, cha: 2 }), 'DM bonus: +1 Strength, +2 Charisma');
  assert.equal(bonusText(undefined), '');
  assert.equal(bonusText({}), '');
  const keep = { items: [{ id: 'i1', item: 'x' }], scoreBonus: { cha: 2 }, speed: 35 };
  const rest = withoutBonus(keep);
  assert.deepEqual(rest, { items: [{ id: 'i1', item: 'x' }], speed: 35 }, 'everything else is kept');
  assert.ok('scoreBonus' in keep, 'the original is not changed');
});

// ---------- homebrew subclasses (B5, docs/specs/homebrew-subclasses.md): invented fixtures only ----------
const oath = (id, name, cls, extra = {}) => ({ id: `hb-ember-folk-${id}`, name, class: cls, source: 'homebrew:ember-folk', checked: false, text: 'Paladins sworn to keep a hearth-fire burning.',
  features: [{ id: `hb-ember-folk-${id}-vow`, name: 'Hearth Vow', level: 3, tier: 'manual', checked: false, text: 'A vow the DM keeps track of.' }], ...extra });
const EMBER = loadPack({ format: 'hextable-pack', v: 1, pack: { id: 'ember-folk', name: 'Ember Folk', version: 1, license: 'Invented for the tests', attribution: 'Invented for the tests' },
  subclasses: [oath('oath-of-the-ember', 'Oath of the Ember', 'paladin'), oath('ash-oath', 'Ash & Oath', 'paladin'), oath('ember-college', 'College of Embers', 'bard')] });
assert.ok(EMBER.ok, JSON.stringify(EMBER.problems));
const OVER = overlayOf([EMBER.pack]);
const PAL = CONTENT.classes.paladin;
const palSheet = (subclass) => ({ name: 'Tavin', class: 'paladin', level: 5, subclass, abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 10, cha: 14 }, skills: ['athletics', 'persuasion'], choices: { 'fighting-style': 'defense' } });

test('the Subclass list: the SRD subclass, then this table\'s homebrew ones of the class, by name; none of another class', () => {
  assert.deepEqual(subclassChoices(PAL, 5, undefined), [['', 'Choose a subclass'], ['devotion', 'Oath of Devotion']], 'an SRD-only game is unchanged');
  assert.deepEqual(subclassChoices(PAL, 2, undefined)[0], ['', 'None yet (level 3)']);
  using(OVER, () => {
    assert.deepEqual(subclassChoices(PAL, 5, 'devotion'), [['', 'Choose a subclass'], ['devotion', 'Oath of Devotion'], ['hb-ember-folk-ash-oath', 'Ash & Oath (homebrew)'], ['hb-ember-folk-oath-of-the-ember', 'Oath of the Ember (homebrew)']]);
    assert.deepEqual(subclassChoices(CONTENT.classes.bard, 5, undefined).map((o) => o[1]), ['Choose a subclass', 'College of Lore', 'College of Embers (homebrew)']);
    assert.equal(subclassChoices(CONTENT.classes.fighter, 5, undefined).length, 2, 'no homebrew subclass of the fighter');
  });
});

test('a sheet whose subclass pack is not loaded keeps its id in the list, and says so; a loaded one says where it is from', () => {
  const id = 'hb-ember-folk-oath-of-the-ember';
  assert.deepEqual(subclassChoices(PAL, 5, id).at(-1), [id, `${id} (not loaded at this table)`]);
  assert.match(subclassNote(PAL, id), /not loaded at this table.*plays without its features/);
  assert.equal(subclassNote(PAL, 'devotion'), '');
  assert.equal(subclassNote(PAL, undefined), '');
  using(OVER, () => {
    assert.deepEqual(subclassChoices(PAL, 5, id).filter((o) => o[0] === id), [[id, 'Oath of the Ember (homebrew)']], 'listed once');
    assert.match(subclassNote(PAL, id), /^Homebrew subclass of this table, from the pack ember-folk\. Paladins sworn/);
    assert.match(subclassChoices(PAL, 5, 'hb-ember-folk-ember-college').at(-1)[1], /not a Paladin subclass here/, 'a loaded subclass of another class is shown as that');
    assert.equal(subclassNote(PAL, 'hb-ember-folk-ember-college'), '');
  });
  assert.match(subclassChoices(PAL, 5, 'nonsense').at(-1)[1], /not a Paladin subclass here/);
});

test('a header says "subclass not loaded" for a sheet the page cannot play with its subclass, as the engine reads the sheet (missingOf), and for nothing else', () => {
  const sheet = palSheet('hb-ember-folk-oath-of-the-ember');
  assert.equal(classTitle({ cls: 'Paladin (Oath of the Ember)', sheet }), 'Paladin (subclass not loaded)', 'a record made with the pack, shown without it');
  assert.equal(classTitle({ cls: 'Paladin (subclass not loaded)', sheet }), 'Paladin (subclass not loaded)', 'a record made without it says it once');
  assert.equal(classTitle({ cls: 'Paladin (Oath of Devotion)', sheet: palSheet('devotion') }), 'Paladin (Oath of Devotion)');
  assert.equal(classTitle({ cls: 'Paladin' , sheet: { ...palSheet(undefined), level: 2 } }), 'Paladin', 'below level 3 there is no subclass to miss');
  assert.equal(classTitle({ cls: 'Fighter' }), 'Fighter', 'a hand-typed character has no sheet');
  assert.equal(classTitle({ cls: 'Paladin 5', sheet: 'not a sheet' }), 'Paladin 5', 'a sheet that cannot be read changes nothing');
  assert.equal(classTitle(null), '');
  const multi = { name: 'Tavin', classes: [{ class: 'paladin', level: 5, subclass: 'hb-ember-folk-oath-of-the-ember' }, { class: 'bard', level: 3, subclass: 'lore' }], abilities: palSheet().abilities, skills: [] };
  assert.equal(classTitle({ cls: 'Paladin (Oath of the Ember) / Bard (College of Lore)', sheet: multi }), 'Paladin (Oath of the Ember) / Bard (College of Lore) (subclass not loaded)');
  using(OVER, () => assert.equal(classTitle({ cls: 'Paladin (Oath of the Ember)', sheet }), 'Paladin (Oath of the Ember)', 'loaded: as the record says'));
  assert.equal(missingText({ name: 'Tavin', sheet }), 'Tavin: its subclass "hb-ember-folk-oath-of-the-ember" is not loaded at this table, so its subclass features and spells are absent until its pack is added again. Refresh from sheet brings them back then.');
  assert.equal(missingText({ name: 'Tavin', sheet: palSheet('devotion') }), '');
  const stale = { name: 'Tavin', cls: 'Paladin (subclass not loaded)', sheet };
  assert.equal(missingText(stale).includes('is not loaded'), true, 'the pack is still away');
  using(OVER, () => assert.equal(missingText(stale), 'Tavin was made while its subclass was not loaded, and the table has it again. Refresh from sheet brings the subclass features and spells in.', 'the pack is back, the record is not remade'));
  assert.equal(missingText({ name: 'Tavin', cls: 'Paladin (Oath of Devotion)', sheet: palSheet('devotion') }), '');
  assert.equal(missingText({ name: 'Tavin' }), '');
});

test('what the engine makes of a character with the pack away is what the header shows: the record says "subclass not loaded" and the DM is told', () => {
  const s = newGame(11), DM = { role: 'dm', userId: 'dm' };
  let id;
  using(OVER, () => { const r = apply(s, { type: 'setSheet', sheet: palSheet('hb-ember-folk-oath-of-the-ember') }, DM); assert.ok(r.ok, r.error); id = r.events.findLast((x) => x.type === 'spawned').id; });
  assert.equal(s.entities[id].cls, 'Paladin (Oath of the Ember)');
  assert.equal(classTitle(s.entities[id]), 'Paladin (subclass not loaded)', 'the pack has gone: the old record still names it, the header does not');
  const r = apply(s, { type: 'refresh', actor: id }, DM); assert.ok(r.ok, r.error);
  assert.equal(s.entities[id].cls, 'Paladin (subclass not loaded)');
  assert.equal(classTitle(s.entities[id]), 'Paladin (subclass not loaded)');
  assert.deepEqual(validate(palSheet('hb-ember-folk-oath-of-the-ember')), []);
  assert.ok(derive(palSheet('hb-ember-folk-oath-of-the-ember')).missing.length === 1);
});

// ---------- ability scores (docs/specs/ability-scores.md, #557): the pure part of the score section ----------
const SC_SHEET = (abilities, scores) => ({ name: 'Kerrin', class: 'fighter', level: 1, abilities, skills: ['athletics', 'perception'], choices: { 'fighting-style': 'defense' }, ...(scores ? { scores } : {}) });
const SC_DICE = [[5, 3, 6, 2], [4, 4, 4, 1], [6, 6, 5, 3], [2, 3, 3, 1], [4, 5, 3, 3], [6, 2, 4, 1]];        // 14 12 17 8 12 12
const AB = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

test('a fresh draft is "enter by hand": nothing is placed, no background, the rule is the SRD\'s', () => {
  const sc = freshScores();
  assert.equal(sc.method, 'hand');
  assert.deepEqual(METHOD_NAMES, { standard: 'Standard array', pointcost: 'Point cost', roll: 'Roll', hand: 'Enter by hand' });
  assert.deepEqual(sc.rule, { reroll: 'none', result: 'new' });
  assert.deepEqual(freshScores({ reroll: 'below', below: 10, result: 'higher' }).rule, { reroll: 'below', below: 10, result: 'higher' });
  assert.deepEqual(freshScores({ reroll: 'sometimes' }).rule, { reroll: 'none', result: 'new' }, 'a damaged stored rule gives the default');
  assert.equal(scoreBackground(sc), null);
});

test('standard array: the numbers placed so far, the six scores with 8 for the unplaced, a sentence for what is missing, and no record until all six are on', () => {
  const sc = freshScores(); sc.method = 'standard';
  sc.std.str = 15; sc.std.dex = 14;
  assert.deepEqual(scoreBase(sc), { str: 15, dex: 14, con: null, int: null, wis: null, cha: null });
  let p = scoreParts(sc);
  assert.equal(p.scores, null);
  assert.deepEqual(p.problems, ['Place all six numbers (4 still to place).']);
  assert.equal(p.abilities.con, 8);
  Object.assign(sc.std, { con: 13, int: 12, wis: 10, cha: 8 });
  p = scoreParts(sc);
  assert.deepEqual(p.problems, []);
  assert.deepEqual(p.scores, { method: 'standard', base: { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 } });
  assert.deepEqual(validate(SC_SHEET(p.abilities, p.scores)), []);
});

test('the background choices: +2 and +1, or +1 to each; an SRD one offers its three abilities, another any; unfinished is false', () => {
  const sc = freshScores(); sc.method = 'standard'; Object.assign(sc.std, { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 });
  assert.deepEqual(bgAbilities('soldier'), ['str', 'dex', 'con']);
  assert.deepEqual(bgAbilities('other'), AB);
  Object.assign(sc.bg, { id: 'soldier', mode: 'twoone' });
  assert.equal(scoreBackground(sc), false);
  assert.deepEqual(scoreParts(sc).problems, ['Choose which abilities the background raises.']);
  Object.assign(sc.bg, { plus2: 'str', plus1: 'dex' });
  assert.deepEqual(scoreBackground(sc), { id: 'soldier', abilities: { str: 2, dex: 1 } });
  let p = scoreParts(sc);
  assert.deepEqual([p.abilities.str, p.abilities.dex, p.abilities.con], [17, 15, 13]);
  assert.deepEqual(validate(SC_SHEET(p.abilities, p.scores)), []);
  Object.assign(sc.bg, { plus1: 'cha' });                                // Soldier does not raise Charisma
  assert.equal(scoreBackground(sc), false);
  sc.bg.mode = 'all';
  assert.deepEqual(scoreBackground(sc), { id: 'soldier', abilities: { str: 1, dex: 1, con: 1 } });
  Object.assign(sc.bg, { id: 'other', mode: 'all', all: ['int', 'wis', 'cha'] });
  assert.deepEqual(scoreBackground(sc), { abilities: { int: 1, wis: 1, cha: 1 } });
  sc.bg.all = ['int', 'int', 'cha'];
  assert.equal(scoreBackground(sc), false, 'three different abilities');
  Object.assign(sc.bg, { mode: 'twoone', plus2: 'cha', plus1: 'int' });
  p = scoreParts(sc);
  assert.deepEqual(p.scores.background, { abilities: { cha: 2, int: 1 } });
  assert.deepEqual(validate(SC_SHEET(p.abilities, p.scores)), []);
  sc.bg.plus1 = 'cha';
  assert.equal(scoreBackground(sc), false, 'the same ability twice');
});

test('point cost: the draft starts at 8 everywhere, its record is valid, and a record that costs more than the budget is refused', () => {
  const sc = freshScores(); sc.method = 'pointcost';
  assert.deepEqual(scoreBase(sc), Object.fromEntries(AB.map((a) => [a, 8])));
  assert.deepEqual(scoreParts(sc).problems, []);
  Object.assign(sc.pts, { str: 15, dex: 15, con: 15 });
  const p = scoreParts(sc);
  assert.deepEqual(validate(SC_SHEET(p.abilities, p.scores)), []);
  assert.equal(scoreParts({ ...sc, pts: { ...sc.pts, int: 9 } }).scores.base.int, 9);
  assert.match(validate(SC_SHEET(p.abilities, { ...p.scores, base: { ...p.scores.base, int: 9 } })).join(' '), /cost 28 points|no longer match/);
});

test('a roll: nothing without it, the rolled scores placed by their place in the list, a reroll under each rule, the sheet record valid', () => {
  const sc = freshScores(); sc.method = 'roll';
  assert.deepEqual(scoreParts(sc).problems, ['Roll the dice first.']);
  sc.roll = { rolls: SC_DICE.map((dice) => ({ dice })), rule: { reroll: 'below', below: 10, result: 'higher' }, by: 'device', at: '2026-11-19' };
  assert.deepEqual(scoreParts(sc).problems, ['Place all six numbers (6 still to place).']);
  AB.forEach((a, i) => { sc.place[a] = i; });
  assert.deepEqual(scoreBase(sc), { str: 14, dex: 12, con: 17, int: 8, wis: 12, cha: 12 });
  let p = scoreParts(sc);
  assert.deepEqual(p.problems, []);
  assert.deepEqual(p.scores.rolls[0], { dice: [5, 3, 6, 2] });
  assert.deepEqual(p.scores.rule, { reroll: 'below', below: 10, result: 'higher' });
  assert.deepEqual([p.scores.by, p.scores.at], ['device', '2026-11-19']);
  assert.deepEqual(validate(SC_SHEET(p.abilities, p.scores)), []);
  // The 8 (roll 4) rolled again to 4: `higher` keeps the 8; the same draft under `new` makes it a 4.
  sc.roll.rolls[3].again = [1, 1, 2, 1];
  assert.equal(scoreBase(sc).int, 8);
  p = scoreParts(sc);
  assert.deepEqual(validate(SC_SHEET(p.abilities, p.scores)), []);
  sc.roll.rule = { reroll: 'below', below: 10, result: 'new' };
  assert.equal(scoreBase(sc).int, 4);
  p = scoreParts(sc);
  assert.deepEqual(validate(SC_SHEET(p.abilities, p.scores)), []);
  assert.deepEqual(p.scores.rolls[3], { dice: [2, 3, 3, 1], again: [1, 1, 2, 1] });
  // The record is a copy: changing the draft later does not change a sheet already made.
  p.scores.rolls[0].dice[0] = 1;
  assert.equal(sc.roll.rolls[0].dice[0], 5);
});

test('a saved sheet opens on its own method; a sheet with no record, or one that no longer agrees, opens on "enter by hand"', () => {
  const base = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8 };
  const std = scoresDraft(SC_SHEET({ str: 17, dex: 15, con: 13, int: 12, wis: 10, cha: 8 }, { method: 'standard', base, background: { id: 'soldier', abilities: { str: 2, dex: 1 } } }));
  assert.equal(std.method, 'standard');
  assert.equal(std.saved, true);
  assert.deepEqual(std.std, base);
  assert.deepEqual([std.bg.id, std.bg.mode, std.bg.plus2, std.bg.plus1], ['soldier', 'twoone', 'str', 'dex']);
  const all = scoresDraft(SC_SHEET({ str: 16, dex: 15, con: 14, int: 12, wis: 10, cha: 8 }, { method: 'pointcost', base, background: { id: 'soldier', abilities: { str: 1, dex: 1, con: 1 } } }));
  assert.deepEqual([all.method, all.bg.mode, all.bg.all], ['pointcost', 'all', ['str', 'dex', 'con']]);
  assert.equal(scoresDraft(SC_SHEET(base)).method, 'hand');
  assert.equal(scoresDraft(SC_SHEET({ ...base, str: 18 }, { method: 'standard', base })).method, 'hand', 'a record the scores contradict is not trusted');
  // A rolled one: the places are found again from the scores, by roll, each roll used once (three 12s are three different rolls).
  const rb = { str: 14, dex: 12, con: 17, int: 8, wis: 12, cha: 12 };
  const r = scoresDraft(SC_SHEET(rb, { method: 'roll', base: rb, rolls: SC_DICE.map((dice) => ({ dice })), by: 'table', at: 41 }));
  assert.equal(r.method, 'roll');
  assert.deepEqual([r.roll.by, r.roll.at], ['table', 41]);
  assert.deepEqual(AB.map((a) => r.place[a]), [0, 1, 2, 3, 4, 5]);
  assert.equal(new Set(AB.map((a) => r.place[a])).size, 6);
  const p = scoreParts(r);
  assert.deepEqual(p.problems, []);
  assert.deepEqual([p.scores.by, p.scores.at], ['table', 41], 'where it was rolled is kept when a sheet is edited');
});

// ---------- rolling at the table (#578): the sheet reads the engine's own events ----------
const TABLE = () => { const g = newGame(7); g.rng = keyedRng('0123456789abcdef'.repeat(4)); return g; };
const DMX = { role: 'dm', userId: 'dm' }, ANAX = { role: 'player', userId: 'ana' };
const AA = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const setRule = (g, reroll, result = 'new', below) => { for (const [key, value] of [['scoreReroll', reroll], ['scoreRerollResult', result], ...(below ? [['scoreRerollBelow', below]] : [])]) assert.ok(apply(g, { type: 'setting', key, value }, DMX).ok); };

test('a roll at the table: the events become the draft\'s rolls, by: table, with the event number, and the sheet validates', () => {
  const g = TABLE(); setRule(g, 'each', 'higher');
  const r = apply(g, { type: 'rollAbilityScores' }, ANAX); assert.ok(r.ok, r.error);
  const ev = viewEvents(r.events, g, ANAX).find((e) => e.type === 'scoresRolled');
  const rolls = rollsOfEvent(ev);
  assert.equal(rolls.length, 6);
  assert.ok(rolls.every((x) => x.dice.length === 4 && x.dice.every((d) => d >= 1 && d <= 6) && x.again === undefined));
  const heard = { by: ev.by, at: ev.at, rolls };
  const sc = freshScores(); sc.method = 'roll';
  const kept = keptRoll(view(g, ANAX), heard);          // a player's view holds no record: the events are all there is
  assert.deepEqual([kept.by, kept.at, kept.rule], ['table', ev.at, { reroll: 'each', result: 'higher' }]);
  Object.assign(sc, { roll: kept, place: Object.fromEntries(AA.map((a, i) => [a, i])) });
  const p = scoreParts(sc, '2026-11-20');
  assert.deepEqual(p.problems, []);
  assert.deepEqual([p.scores.by, p.scores.at], ['table', ev.at], 'a table roll keeps its event number, not a day');
  assert.deepEqual(validate({ ...SC_SHEET(p.abilities, p.scores) }), []);
});

test('a roll with no event number (the DM reopens the sheet) keeps no date, and the DM\'s view finds the record by its own id', () => {
  const g = TABLE(); const r = apply(g, { type: 'rollAbilityScores' }, DMX); assert.ok(r.ok);
  const kept = keptRoll(g, null);                          // no event heard: the DM's record under 'dm'
  assert.equal(kept.by, 'table'); assert.equal(kept.at, undefined);
  const sc = freshScores(); sc.method = 'roll'; Object.assign(sc, { roll: kept, place: Object.fromEntries(AA.map((a, i) => [a, i])) });
  assert.equal(scoreParts(sc, '2026-11-20').scores.at, undefined);
  assert.equal(keptRoll(view(g, ANAX), null), null, 'a player with no events heard has no roll to show');
  assert.equal(keptRoll(g, { by: 'someone-else', at: 1, rolls: [] }), null, 'a record that is not this roller\'s is not shown');
});

test('a reroll: the event is written into the rolls, the sheet agrees with the engine on which result stands, and a refusal changes nothing', () => {
  for (const [result, label] of [['new', 'new'], ['higher', 'higher']]) {
    const g = TABLE(); setRule(g, 'each', result);
    let r = apply(g, { type: 'rollAbilityScores' }, ANAX); assert.ok(r.ok);
    const ev = viewEvents(r.events, g, ANAX)[0], heard = { by: ev.by, at: ev.at, rolls: rollsOfEvent(ev) };
    for (let i = 0; i < 6; i++) {
      r = apply(g, { type: 'rerollAbilityScore', index: i }, ANAX); assert.ok(r.ok, r.error);
      const re = viewEvents(r.events, g, ANAX).find((e) => e.type === 'scoreRerolled');
      rerollInto(heard.rolls, re); heard.result = resultOf(re) ?? heard.result;
      const sc = freshScores(); sc.method = 'roll';
      sc.roll = keptRoll(view(g, ANAX), heard);
      assert.equal(standing(sc.roll.rolls[i], sc.roll.rule), re.total, `${label}: score ${i} stands as the engine says`);
    }
    assert.ok(heard.rolls.every((x) => x.again));
    const again = apply(g, { type: 'rerollAbilityScore', index: 0 }, ANAX);
    assert.equal(again.ok, false);
    assert.match(again.error, /rolled again already/);
  }
});

test('the rule a table roll is kept under: the table\'s now, and "every score" if rerolls already made would not fit a narrower one', () => {
  assert.deepEqual(tableRollRule({ scoreReroll: 'below', scoreRerollBelow: 11 }, [{ dice: [1, 2, 3, 1] }]), { reroll: 'below', below: 11, result: 'new' });
  assert.deepEqual(tableRollRule(undefined, [{ dice: [6, 6, 6, 6] }]), { reroll: 'none', result: 'new' });
  const high = [{ dice: [6, 6, 6, 6], again: [1, 1, 1, 1] }];       // rolled again at 18 while the table said each; the table now says none
  assert.deepEqual(tableRollRule({ scoreReroll: 'none' }, high, 'higher'), { reroll: 'each', result: 'higher' });
  assert.equal(resultOf({ stands: 'old', from: { total: 15 }, to: { total: 9 } }), 'higher');
  assert.equal(resultOf({ stands: 'new', from: { total: 15 }, to: { total: 9 } }), 'new');
  assert.equal(resultOf({ stands: 'new', from: { total: 9 }, to: { total: 15 } }), undefined, 'a better new roll says nothing about which result stands');
});

test('after a reload: the page\'s own id finds the DM\'s record under an online user id, and a player\'s own past events (the history) give the kept roll; another member\'s are not ours (#578)', () => {
  const g = TABLE(); const OND = { role: 'dm', userId: 'u-dm' }, BENX = { role: 'player', userId: 'ben' };
  const a = apply(g, { type: 'rollAbilityScores' }, OND); assert.ok(a.ok, a.error);
  const b = apply(g, { type: 'rollAbilityScores' }, ANAX); assert.ok(b.ok, b.error);
  const c = apply(g, { type: 'rollAbilityScores' }, BENX); assert.ok(c.ok, c.error);
  // The online DM, no event heard yet (a reload): the record under their own id, not Ana's or Ben's.
  const dm = keptRoll(g, null, 'u-dm');
  assert.deepEqual(dm.rolls.map((x) => x.dice), g.scoreRolls['u-dm'].sets.map((x) => x.dice));
  assert.equal(keptRoll(g, null, 'nobody'), null, 'no record under an id that has not rolled: no kept roll');
  // The same DM, told the history: the event number comes back.
  const evs = viewEvents(a.events, g, OND), heardDm = { by: 'u-dm', at: evs[0].at, rolls: rollsOfEvent(evs[0]) };
  assert.equal(keptRoll(g, heardDm, 'u-dm').at, evs[0].at);
  // A player: no record in their view; the history holds their own full event and bare ones for others.
  const hist = viewEvents([...a.events, ...b.events, ...c.events], g, ANAX);
  assert.deepEqual(hist.filter((e) => e.sets).map((e) => e.by), ['ana'], 'only Ana\'s own roll is whole');
  const mine = hist.find((e) => e.sets && e.by === 'ana'), pv = view(g, ANAX);
  const kept = keptRoll(pv, { by: mine.by, at: mine.at, rolls: rollsOfEvent(mine) }, 'ana');
  assert.deepEqual([kept.by, kept.at], ['table', mine.at]);
  assert.deepEqual(kept.rolls.map((x) => x.dice), g.scoreRolls.ana.sets.map((x) => x.dice));
  assert.equal(keptRoll(pv, null, 'ana'), null, 'nothing heard, nothing shown: the sheet does not guess');
});
