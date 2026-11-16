// The page's store of a table's homebrew packs (packmanager.js): data kept by hash, asked for once, one overlay installed while the table is open,
// no monster for a player. The client imports the rules as ./shared, so the test lays the two side by side in a temporary folder.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'packmanager-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
// a small stand-in for the page: enough of a node to see what text and which classes the manager builds
globalThis.document = { createElement: (tag) => { const n = { tag, className: '', textContent: '', children: [], style: {}, dataset: {}, attrs: {}, append(...k) { for (const c of k) this.children.push(typeof c === 'string' ? { tag: '#text', textContent: c, children: [] } : c); }, setAttribute(k, v) { this.attrs[k] = v; } }; return n; } };
const textOf = (n) => (n.children.length ? n.children.map(textOf).join(' ') : n.textContent);
const { createPackStore, documentOf, countWords, isRead, UNREAD_SAY, readingNode, refusalNode } = await import(pathToFileURL(join(tmp, 'packmanager.js')));
const { answersPack } = await import(pathToFileURL(join(tmp, 'transport.js')));
const { SPELLS, MONSTERS, CONTENT } = await import(pathToFileURL(join(tmp, 'shared/content/index.js')));
const { hashOf } = await import(pathToFileURL(join(tmp, 'shared/content/packs.js')));
const { installed } = await import(pathToFileURL(join(tmp, 'shared/content/registry.js')));

const SAMPLE = JSON.parse(readFileSync(join(here, '../../rules/test/fixtures/sample-pack.json'), 'utf8'));
const SPELL = 'hb-sample-ember-dart';
// what a player is sent of the sample pack, and what the DM is
const forPlayer = (d) => ({ id: d.pack.id, name: d.pack.name, version: d.pack.version, spells: d.spells, items: [], feats: [], weapons: [], armour: [], objects: [] });
const withMonster = () => {
  const d = structuredClone(SAMPLE);
  d.monsters = [{ ...structuredClone(CONTENT.monsters['goblin-warrior']), id: 'hb-sample-ashling', name: 'Ashling', source: 'homebrew:sample', checked: false, text: 'SECRETSTATS' }];
  return d;
};

function make(dm) {
  const asks = []; let changes = 0;
  const store = createPackStore({ ask: (id) => asks.push(id), changed: () => changes++, isDM: () => dm });
  return { store, asks, changes: () => changes };
}

test('a player asks for a hash it lacks once, keeps the data by hash, installs one overlay, and lets it go when the pack goes', () => {
  const { store, asks } = make(false), data = forPlayer(SAMPLE), hash = hashOf(data);
  try {
  assert.equal(SPELLS[SPELL], undefined);
  store.packs({ packs: [{ id: 'sample', name: 'Sample Pack', version: 1, hash }] });
  assert.deepEqual(asks, ['sample']);
  assert.equal(store.waiting(), true);
  store.packs({ packs: [{ id: 'sample', name: 'Sample Pack', version: 1, hash }] });
  assert.deepEqual(asks, ['sample'], 'not asked twice for the same hash');
  assert.equal(store.packData({ id: 'sample', version: 1, hash, data }), true);
  assert.equal(store.waiting(), false);
  assert.ok(SPELLS[SPELL], 'the page\'s lookups have the spell');
  assert.ok(installed());
  assert.equal(store.entryOf(SPELL).pack.name, 'Sample Pack');
  // the same hash again later needs no new ask
  store.packs({ packs: [{ id: 'sample', name: 'Sample Pack', version: 1, hash }] });
  assert.deepEqual(asks, ['sample']);
  store.packs({ packs: [] });
  assert.equal(SPELLS[SPELL], undefined);
  assert.equal(installed(), null);
  assert.equal(store.peek().data.length, 0, 'the data is let go with the pack');
  } finally { store.clear(); }
});

test('data nobody listed is dropped; data whose hash is not the listed one is dropped and asked for once more', () => {
  const { store, asks } = make(false), data = forPlayer(SAMPLE), hash = hashOf(data);
  try {
    assert.equal(store.packData({ id: 'sample', version: 1, hash, data }), false, 'an unasked frame is not kept');
    assert.equal(store.peek().data.length, 0);
    store.packs({ packs: [{ id: 'sample', name: 'Sample Pack', version: 1, hash }] });
    assert.deepEqual(asks, ['sample']);
    // a frame that claims the listed hash over other data: the claim is not believed
    assert.equal(store.packData({ id: 'sample', version: 1, hash, data: { ...data, name: 'Other' } }), false);
    assert.equal(SPELLS[SPELL], undefined);
    assert.deepEqual(asks, ['sample', 'sample'], 'asked again, once');
    assert.equal(store.packData({ id: 'sample', version: 1, hash, data: { ...data, name: 'Other' } }), false);
    assert.deepEqual(asks, ['sample', 'sample'], 'not a third time');
    // a frame for an id the list does not name, or with another hash than the list's
    assert.equal(store.packData({ id: 'other', version: 1, hash, data }), false);
    assert.equal(store.packData({ id: 'sample', version: 1, hash: hashOf({ ...data, name: 'X' }), data: { ...data, name: 'X' } }), false);
    assert.equal(store.peek().data.length, 0);
    assert.equal(store.packData({ id: 'sample', version: 1, hash, data }), true, 'the right data is kept');
    assert.ok(SPELLS[SPELL]);
  } finally { store.clear(); }
});

test('a player page holds no monster, even if one arrives: only the lists a player is sent are kept and built', () => {
  const { store } = make(false), d = withMonster(), hash = hashOf(forPlayer(d)), data = { ...forPlayer(d), monsters: d.monsters };
  store.packs({ packs: [{ id: 'sample', name: 'Sample Pack', version: 1, hash }] });
  assert.equal(store.packData({ id: 'sample', version: 1, hash, data }), true);
  assert.ok(SPELLS[SPELL]);
  assert.equal(MONSTERS['hb-sample-ashling'], undefined);
  assert.doesNotMatch(JSON.stringify(store.peek()), /SECRETSTATS|Ashling|ashling/);
  store.clear();
});

test('the DM page holds the whole pack, monsters too, and takes it out again; Try it\'s outside() puts the overlay back', () => {
  const { store } = make(true), d = withMonster(), hash = hashOf(d);
  store.packs({ packs: [{ id: 'sample', name: 'Sample Pack', version: 1, hash }] });
  store.packData({ id: 'sample', version: 1, hash, data: d });
  assert.ok(MONSTERS['hb-sample-ashling'] && SPELLS[SPELL]);
  const o = installed();
  assert.equal(store.outside(() => [installed(), SPELLS[SPELL]]).join(), ',');
  assert.equal(installed(), o); assert.ok(SPELLS[SPELL]);
  store.clear();
  assert.equal(MONSTERS['hb-sample-ashling'], undefined);
});

test('an update swaps the overlay for the new data, and a bad pack is refused without installing', () => {
  const { store } = make(true), d1 = structuredClone(SAMPLE), d2 = structuredClone(SAMPLE);
  d2.pack.version = 2; d2.spells[0].name = 'Ember Dart Plus';
  store.packs({ packs: [{ id: 'sample', name: 'Sample Pack', version: 1, hash: hashOf(d1) }] }); store.packData({ id: 'sample', version: 1, hash: hashOf(d1), data: d1 });
  assert.equal(SPELLS[SPELL].name, 'Ember Dart');
  store.packs({ packs: [{ id: 'sample', name: 'Sample Pack', version: 2, hash: hashOf(d2) }] }); store.packData({ id: 'sample', version: 2, hash: hashOf(d2), data: d2 });
  assert.equal(SPELLS[SPELL].name, 'Ember Dart Plus');
  const bad = structuredClone(SAMPLE); bad.spells[0].effects = 'nonsense';
  store.packs({ packs: [{ id: 'sample', name: 'Sample Pack', version: 3, hash: hashOf(bad) }] }); store.packData({ id: 'sample', version: 3, hash: hashOf(bad), data: bad });
  assert.equal(installed(), null);
  assert.equal(store.list()[0].trouble !== null, true);
  assert.equal(store.waiting(), false, 'a refused pack does not hold updates');
  store.clear();
});

test('documentOf leaves a monster out of a player\'s document, and counts are in words', () => {
  const d = withMonster();
  assert.equal(documentOf({ ...forPlayer(d), monsters: d.monsters }, false).monsters, undefined);
  assert.equal(documentOf(d, true), d);
  assert.deepEqual(countWords({ spells: [1], monsters: [1, 2] }), ['1 spell', '2 monsters']);
});

test('an error frame answers a pack message only when it is about packs', () => {
  assert.equal(answersPack({ error: 'The homebrew was refused: x', problems: ['x'] }), true);
  assert.equal(answersPack({ error: 'In use', blockers: ['a'] }), true);
  assert.equal(answersPack({ error: "Only the DM can change the table's packs." }), true);
  assert.equal(answersPack({ error: 'Too many requests. Wait a moment and try again.' }), true);
  assert.equal(answersPack({ error: 'It is not your turn.' }), false);
  assert.equal(answersPack({ error: 'Nobody is there.' }), false);
});

test('the kinds the reader cannot read are the ones the reader says it cannot read, and the line to say so is one sentence', () => {
  for (const k of ['spells', 'monsters']) assert.equal(isRead(k), true);
  for (const k of ['items', 'feats', 'weapons', 'armour', 'objects']) assert.equal(isRead(k), false);
  assert.equal(isRead('nonsense'), false);
  assert.equal(UNREAD_SAY, 'The game cannot read this kind back yet; you are adding it unread.');
});

test('a monster reading is shown as text: its lines, the lines the DM does by hand under their own heading, and any problems', async () => {
  const { readEntry } = await import(pathToFileURL(join(tmp, 'shared/content/reader.js')));
  const r = readEntry('monster', withMonster().monsters[0]);
  const node = readingNode({ ...r, doesNot: ['Moving it by its burrow speed.'], problems: ['<b>x</b> could not be read'] });
  const all = textOf(node);
  assert.match(all, /The DM does these by hand/);
  assert.match(all, /Moving it by its burrow speed\./);
  assert.match(all, /<b>x<\/b> could not be read/);          // set as text, never as markup
  assert.ok(node.children.every((c) => c.tag !== 'b'));
  assert.ok(node.children.filter((c) => c.className === 'pm-line').length >= 5);
});

test('a refusal about a finished fight\'s conclusion says where to look; other blockers get no such hint', () => {
  const hint = (b) => textOf(refusalNode({ error: 'in use', blockers: b }));
  assert.match(hint(['conclusion.foes: hb-sample-ashling']), /Close the last fight.s summary first/);
  assert.doesNotMatch(hint(['entities.m3 (Ashling): hb-sample-ashling']), /summary first/);
});
