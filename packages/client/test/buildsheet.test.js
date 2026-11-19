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
