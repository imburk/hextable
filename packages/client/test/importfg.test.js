// The import report's part for a homebrew subclass (B5, DEBT T84): the importer's own `report.imported.homebrewSubclasses` is shown, in the summary, the
// "Mapped" line and the saved text. The client matches nothing: these tests run the real importer with an invented pack (the Oath of the Ember) and check
// that what it said reaches the words. Fixture: packages/rules/test/fixtures/fgxml-paladin-ember.xml (invented). Not looked at in a browser here: the smoke pass does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'importfg-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const imp = (f) => import(pathToFileURL(join(tmp, f)));
const { homebrewSubclassLines, subclassShown, reportText } = await imp('importfg.js');
const { importFgxml } = await imp('shared/import-fgxml.js');
const { loadPack, overlayOf, using } = await imp('shared/content/registry.js');

const xml = readFileSync(join(here, '../../rules/test/fixtures/fgxml-paladin-ember.xml'), 'utf8');
const OATH = 'hb-ember-folk-oath-of-the-ember';
const pack = (subclasses) => { const r = loadPack({ format: 'hextable-pack', v: 1, pack: { id: 'ember-folk', name: 'Ember Folk', version: 1, license: 'Invented for the tests', attribution: 'Invented for the tests' }, subclasses }); assert.ok(r.ok, JSON.stringify(r.problems)); return r.pack; };
const oath = { id: OATH, name: 'Oath of the Ember', class: 'paladin', source: 'homebrew:ember-folk', checked: false, text: 'Paladins sworn to keep a hearth-fire burning.',
  features: [{ id: 'hb-ember-folk-vow', name: 'Hearth Vow', level: 3, tier: 'manual', checked: false, text: 'A vow.' }] };

test('with the pack loaded the report names the matched homebrew subclass in plain words, and the summary shows its name, not its id', () => {
  const { character, report } = using(overlayOf([pack([oath])]), () => importFgxml(xml));
  assert.equal(character.subclass, OATH);
  const lines = homebrewSubclassLines(report);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^Paladin: the sheet's "Ember" matched the table's homebrew subclass Oath of the Ember \(pack ember-folk\)\.$/);
  assert.equal(subclassShown(report, character.subclass), 'Oath of the Ember');
  const text = reportText(report, character);
  assert.match(text, /Built as: level \d+ paladin \(Oath of the Ember\)\./);
  assert.match(text, /Homebrew subclass: Paladin: the sheet's "Ember" matched/);
  assert.equal(text.includes(OATH), false, 'the id is not in the saved words');
});

test('without the pack there is nothing to say, and the SRD subclass is shown as words as before', () => {
  const { character, report } = importFgxml(xml);
  assert.deepEqual(homebrewSubclassLines(report), []);
  assert.equal(subclassShown(report, character.subclass), 'Devotion');
  assert.doesNotMatch(reportText(report, character), /Homebrew subclass/);
});

test('anything that is not the importer\'s shape is left out, never shown half-made', () => {
  assert.deepEqual(homebrewSubclassLines(undefined), []);
  assert.deepEqual(homebrewSubclassLines({ imported: { homebrewSubclasses: 'x' } }), []);
  assert.deepEqual(homebrewSubclassLines({ imported: { homebrewSubclasses: [null, 7, { name: 3, text: 'x' }, { name: 'N', text: 'matched N' }] } }), ['it matched N.']);
  assert.equal(subclassShown({ imported: { homebrewSubclasses: [{ id: 'a', name: 5 }] } }, 'a'), 'A', 'a name that is not text is not used');
  assert.equal(subclassShown({}, undefined), '');
});
