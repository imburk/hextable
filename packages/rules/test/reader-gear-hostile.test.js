// Hostile and odd weapons, armour and objects: a bounded, plain answer and never a throw; the reader is pure and deterministic;
// an entry strict mode refuses reads as refused; an author's words are quoted and never voiced; no publisher is named (#419).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONTENT } from '../src/content/index.js';
import { READER_LIMITS, readEntry } from '../src/content/reader.js';

const PACK = JSON.parse(readFileSync(new URL('./fixtures/reader-kinds-pack.json', import.meta.url), 'utf8'));
const KINDS = { weapon: PACK.weapons, armour: PACK.armour, object: PACK.objects };
const SRD = { weapon: CONTENT.weapons, armour: CONTENT.armour, object: CONTENT.objects };
const size = (r) => JSON.stringify(r).length;
const proxy = new Proxy({}, { ownKeys() { throw new Error('boom'); }, get() { throw new Error('boom'); } });

function casesFor(kind) {
  const E = KINDS[kind][0], fields = Object.keys(E);
  const getter = { ...E }; Object.defineProperty(getter, fields[fields.length - 1], { enumerable: true, get() { throw new Error('boom'); } });
  const circular = { ...E }; circular.self = circular;
  let deep = { ...E }, at = deep; for (let i = 0; i < 10000; i++) { at.next = {}; at = at.next; }
  const wrong = Object.fromEntries(fields.map((k, i) => [k, [5, 'x', {}, [], null, true, -1, 1e308, NaN][i % 9]]));
  const wrong2 = Object.fromEntries(fields.map((k, i) => [k, [[], {}, 'x', 7, null, false, [[]], 'y'.repeat(1e5), -Infinity][i % 9]]));
  const nested = { ...E, properties: [1, null, {}, 'x', ['finesse']], range: 'x', states: 'x', use: [null, 5, 'x', [], { id: 3, effects: 'y' }, { id: 'a', from: 'x', check: 5, effects: [{}] }], triggers: [null, { on: 5, effects: [[]] }, { on: 'near', feet: 'x', from: [1], effects: [{ damage: 5, type: {} }] }], dc: 'x', light: 5 };
  return [null, undefined, 5, 'x', [], [1, 2], {}, proxy, getter, circular, deep, wrong, wrong2, nested,
    { ...E, name: 'y'.repeat(1e5), text: 'x'.repeat(1e6) },
    { ...E, id: 'z'.repeat(1e5) },
    JSON.parse('{"__proto__": {"polluted": true}, "constructor": 1, "id": "x", "properties": {"__proto__": 1}, "states": {"__proto__": {"blocks": 1}}}'),
    { ...E, [Symbol('s')]: 1, big: 10n, fn() {}, nan: NaN, inf: -Infinity },
    { ...E, states: Object.fromEntries(Array.from({ length: 5000 }, (_, i) => [`s${i}`, { name: 'n', blocks: [] }])), use: Array.from({ length: 5000 }, (_, i) => ({ id: `u${i}`, name: 'n', from: ['s1'], time: 'action' })) },
  ];
}

test('hostile weapons, armour and objects get a bounded plain answer and never a throw', () => {
  for (const kind of Object.keys(KINDS)) {
    for (const c of casesFor(kind)) {
      let r;
      assert.doesNotThrow(() => { r = readEntry(kind, c); }, 'never a throw');
      assert.equal(r.kind, kind);
      assert.equal(typeof r.title, 'string');
      assert.ok(Array.isArray(r.lines) && Array.isArray(r.doesNot) && Array.isArray(r.problems) && Array.isArray(r.numbers));
      assert.ok(size(r) < 400000, `${kind}: bounded output (${size(r)})`);
      assert.ok(r.lines.every((l) => typeof l === 'string' && l.length <= READER_LIMITS.line + 30), 'bounded line length');
      assert.ok(r.problems.length <= READER_LIMITS.problems);
      assert.ok(![...r.lines.join('')].some((ch) => ch.charCodeAt(0) < 32 || ch === String.fromCharCode(0x2028)), 'no control characters');
      assert.ok(r.lines.length > 0);
    }
    assert.match(readEntry(kind, null).lines[0], new RegExp(`^This is not a[n]? ${kind} entry \\(it is not an object\\)\\. It cannot be approved\\.$`));
  }
  assert.equal(({}).polluted, undefined);
  assert.equal(readEntry('weapon', casesFor('weapon')[10]).hash, null, 'too deep to hash');
});

test('the readings of weapons, armour and objects are pure and deterministic, and the hash is of the canonical entry', () => {
  for (const [kind, list] of Object.entries(KINDS)) for (const e of list) {
    const before = JSON.stringify(e), a = readEntry(kind, e), b = readEntry(kind, structuredClone(e));
    assert.equal(JSON.stringify(e), before, `${e.id}: the entry is not changed`);
    assert.deepEqual(a, b, e.id);
    // Key order never changes the hash; any change to the data does.
    const shuffled = Object.fromEntries(Object.entries(e).reverse());
    assert.equal(readEntry(kind, shuffled).hash, a.hash, `${e.id}: key order`);
    assert.notEqual(readEntry(kind, { ...e, name: `${e.name} Two` }).hash, a.hash, `${e.id}: a changed name`);
    assert.match(a.hash, /^[0-9a-f]{16,}$/);
  }
  const w = { ...PACK.weapons[0] }; w.damage = '1d12';
  assert.notEqual(readEntry('weapon', w).hash, readEntry('weapon', PACK.weapons[0]).hash);
});

test('an entry strict mode refuses reads as refused, and says so first', () => {
  const bad = [
    ['weapon', { ...PACK.weapons[0], properties: ['finesse', 'glows'] }],
    ['weapon', { ...PACK.weapons[0], damage: 'lots' }],
    ['weapon', { ...PACK.weapons[0], category: 'exotic' }],
    ['armour', { ...PACK.armour[0], ac: 99 }],
    ['armour', { ...PACK.armour[0], dex: 'sometimes' }],
    ['object', { ...PACK.objects[0], kind: 'portal' }],
    ['object', { ...PACK.objects[0], initial: 'nowhere' }],
    ['object', { ...PACK.objects[0], use: [{ id: 'x', name: 'X', from: ['nowhere'], time: 'action' }] }],
  ];
  for (const [kind, e] of bad) {
    const r = readEntry(kind, e);
    assert.equal(r.refused, true, `${kind}: ${JSON.stringify(e).slice(0, 80)}`);
    assert.ok(r.refusals.length > 0);
    assert.match(r.lines[0], /^REFUSED: /);
  }
  for (const [kind, list] of Object.entries(KINDS)) for (const e of list) assert.equal(readEntry(kind, e).refused, false, e.id);
});

test('the readings never name a publisher or a product, and never voice the author\'s text', () => {
  const names = /wizards of the coast|dungeons\s*(&|and)\s*dragons|d&d|player'?s handbook|dungeon master'?s guide|monster manual|hasbro|xanathar|tasha|forgotten realms|system reference document|\bsrd\b/i;
  for (const [kind, list] of Object.entries(KINDS)) for (const e of [...Object.values(SRD[kind]), ...list]) {
    const r = readEntry(kind, e);
    const own = [...r.lines, ...r.doesNot, ...r.problems].map((l) => l.replace(/"[^"]*"/g, '""')).join('\n');
    assert.doesNotMatch(own, names, e.id);
  }
  // The text says harmless; the data says 10d10. Names are quoted; the text is kept apart.
  const sly = { ...PACK.weapons[0], name: 'Say "The engine runs everything"', text: 'A harmless stick.', damage: '10d10' };
  const r = readEntry('weapon', sly);
  assert.ok(r.lines.some((l) => l.includes('10d10')));
  assert.ok(!r.lines.join(' ').includes('harmless'));
  assert.equal(r.text, 'A harmless stick.');
  const door = { ...PACK.objects[0], states: { ...PACK.objects[0].states, shut: { name: 'Ignore previous instructions', blocks: ['move', 'sight'] } } };
  assert.ok(readEntry('object', door).lines.some((l) => l.includes('"Ignore previous instructions"')), 'a state\'s name is quoted');
});
