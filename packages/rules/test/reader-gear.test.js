// The plain-language reader for weapons, armour and objects (docs/specs/homebrew.md, Decision 6, task B13, third part, #419).
// Golden text: packages/rules/test/reader-gear-golden.txt. After a deliberate change to a sentence, regenerate it with
//   READER_GOLDEN=update node --test packages/rules/test/reader-gear.test.js
// and read the diff: every changed line is a changed reading the DM would approve.
// The invented entries are in fixtures/reader-kinds-pack.json (a pack that loads in strict mode) and below. The truth tests PLAY the entries
// through derive() and apply() and hold what the reading says to what the engine does (reader-gear-truth.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CONTENT } from '../src/content/index.js';
import { loadPack } from '../src/content/registry.js';
import { ARMOUR_CATEGORIES, HOMEBREW_TYPES, MASTERIES, OBJECT_BLOCKS, OBJECT_KINDS, TIERS, TRIGGERS, USE_TIMES, WEAPON_PROPERTIES, lintEntry } from '../src/content/schema.js';
import {
  ARMOUR_CATEGORY_WORDS, ARMOUR_FIELDS, CHECK_FIELDS, FIND_FIELDS, KIND_NAMES, LIGHT_FIELDS, MASTERY_WORDS, OBJECT_BLOCK_WORDS, OBJECT_DC_FIELDS, OBJECT_FIELDS, OBJECT_KIND_WORDS, OBJECT_TIER_WORDS,
  READER_LIMITS, READ_KINDS, STATE_FIELDS, TRIGGER_FIELDS, TRIGGER_ON_WORDS, USE_FIELDS, USE_TIME_WORDS, WEAPON_CATEGORY_WORDS, WEAPON_FIELDS, WEAPON_KIND_WORDS, WEAPON_PROPERTY_WORDS, readEntry,
} from '../src/content/reader.js';

const GOLDEN = new URL('./reader-gear-golden.txt', import.meta.url);
const PACK = JSON.parse(readFileSync(new URL('./fixtures/reader-kinds-pack.json', import.meta.url), 'utf8'));
const keysOf = (o) => Object.keys(o).sort();
const read = (url) => readFileSync(new URL(url, import.meta.url), 'utf8');
const KINDS = [['weapon', 'weapons'], ['armour', 'armour'], ['object', 'objects']];
const readingOf = (kind, e) => { const r = readEntry(kind, e); return [`== ${kind} ${e.id}`, ...r.lines, ...r.doesNot.map((x) => `DM: ${x}`), ...r.problems.map((x) => `PROBLEM: ${x}`), ''].join('\n'); };
const goldenText = () => KINDS.flatMap(([kind, list]) => PACK[list].map((e) => readingOf(kind, e))).join('\n');

test('the invented pack loads in strict mode, with its weapons, armour and objects, and every field of every kind is used by one of them', () => {
  const r = loadPack(structuredClone(PACK));
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.ok(PACK.weapons.length >= 8 && PACK.armour.length >= 5 && PACK.objects.length >= 7);
  const used = (list) => new Set(list.flatMap((e) => Object.keys(e)));
  for (const [list, shape] of [['weapons', 'weapons'], ['armour', 'armour'], ['objects', 'objects']]) for (const k of keysOf(HOMEBREW_TYPES[shape])) assert.ok(used(PACK[list]).has(k), `${list}: no invented entry uses "${k}"`);
  const states = PACK.objects.flatMap((o) => Object.values(o.states)), uses = PACK.objects.flatMap((o) => o.use), trigs = PACK.objects.flatMap((o) => o.triggers ?? []);
  for (const [name, xs, shape] of [['state', states, 'state'], ['use', uses, 'use'], ['trigger', trigs, 'trigger'], ['check', uses.map((u) => u.check).filter(Boolean), 'check'],
    ['light', states.map((x) => x.light).filter(Boolean), 'light'], ['dc', PACK.objects.map((o) => o.dc).filter(Boolean), 'objectDc'], ['find', PACK.objects.map((o) => o.find).filter(Boolean), 'find']]) {
    for (const k of keysOf(HOMEBREW_TYPES[shape])) assert.ok(xs.some((x) => k in x), `no invented ${name} uses "${k}"`);
  }
  assert.deepEqual([...new Set(PACK.weapons.flatMap((w) => w.properties))].sort(), [...WEAPON_PROPERTIES].sort(), 'every weapon property is used');
  assert.deepEqual([...new Set(PACK.weapons.map((w) => w.mastery))].sort(), [...MASTERIES].sort(), 'every mastery is used');
  assert.deepEqual([...new Set(PACK.armour.map((a) => a.category))].sort(), [...ARMOUR_CATEGORIES].sort());
  assert.deepEqual([...new Set(PACK.objects.map((o) => o.kind))].sort(), [...OBJECT_KINDS].sort());
  assert.deepEqual([...new Set(trigs.map((t) => t.on))].sort(), [...TRIGGERS].sort());
  assert.deepEqual([...new Set(uses.map((u) => u.time))].sort(), [...USE_TIMES].sort());
  assert.deepEqual([...new Set(states.flatMap((x) => x.blocks))].sort(), [...OBJECT_BLOCKS].sort());
  assert.deepEqual([...new Set(PACK.objects.map((o) => o.tier))].sort(), ['assist', 'auto']);
});

// ---------- the vocabulary and the reader's words ----------
function inline(re, what) { const m = re.exec(read('../src/content/schema.js')); assert.ok(m, `schema.js: ${what} not found`); return m[1].match(/'([A-Za-z0-9-]+)'/g).map((x) => x.slice(1, -1)); }
test('every field of a weapon, armour and an object, and everything they list, has words in the reader', () => {
  assert.deepEqual(keysOf(WEAPON_FIELDS), keysOf(HOMEBREW_TYPES.weapons), 'a weapon key with no words (or words for no key)');
  assert.deepEqual(keysOf(ARMOUR_FIELDS), keysOf(HOMEBREW_TYPES.armour), 'an armour key with no words');
  assert.deepEqual(keysOf(OBJECT_FIELDS), keysOf(HOMEBREW_TYPES.objects), 'an object key with no words');
  assert.deepEqual([...STATE_FIELDS].sort(), keysOf(HOMEBREW_TYPES.state));
  assert.deepEqual([...LIGHT_FIELDS].sort(), keysOf(HOMEBREW_TYPES.light));
  assert.deepEqual([...USE_FIELDS].sort(), keysOf(HOMEBREW_TYPES.use));
  assert.deepEqual([...CHECK_FIELDS].sort(), keysOf(HOMEBREW_TYPES.check));
  assert.deepEqual([...TRIGGER_FIELDS].sort(), keysOf(HOMEBREW_TYPES.trigger));
  assert.deepEqual([...OBJECT_DC_FIELDS].sort(), keysOf(HOMEBREW_TYPES.objectDc));
  assert.deepEqual([...FIND_FIELDS].sort(), keysOf(HOMEBREW_TYPES.find));
  assert.deepEqual(keysOf(WEAPON_PROPERTY_WORDS), [...WEAPON_PROPERTIES].sort(), 'a weapon property with no words');
  assert.deepEqual(keysOf(MASTERY_WORDS), [...MASTERIES].sort(), 'a mastery with no words');
  assert.deepEqual(keysOf(ARMOUR_CATEGORY_WORDS), [...ARMOUR_CATEGORIES].sort());
  assert.deepEqual(keysOf(OBJECT_KIND_WORDS), [...OBJECT_KINDS].sort());
  assert.deepEqual(keysOf(OBJECT_BLOCK_WORDS), [...OBJECT_BLOCKS].sort());
  assert.deepEqual(keysOf(TRIGGER_ON_WORDS), [...TRIGGERS].sort());
  assert.deepEqual(keysOf(USE_TIME_WORDS), [...USE_TIMES].sort());
  assert.deepEqual(keysOf(OBJECT_TIER_WORDS), [...TIERS].sort());
  assert.deepEqual(keysOf(WEAPON_KIND_WORDS), ['melee', 'ranged']);
  assert.deepEqual(keysOf(WEAPON_CATEGORY_WORDS), ['martial', 'simple']);
  for (const k of ['weapon', 'armour', 'object']) assert.ok(READ_KINDS.includes(k));
  // No kind a pack can hold is "not read yet".
  for (const k of new Set(Object.values(KIND_NAMES))) assert.ok(READ_KINDS.includes(k), `${k} is read`);
});

test('the lists the linters themselves hold are the ones the reader has words for', () => {
  assert.deepEqual([...MASTERIES].sort(), keysOf(MASTERY_WORDS));
  assert.deepEqual(inline(/if \(!\[([^\]]*)\]\.includes\(e\.category\)\) say\('category is simple or martial'\)/, 'the weapon categories').sort(), keysOf(WEAPON_CATEGORY_WORDS));
  assert.deepEqual(inline(/if \(!\[([^\]]*)\]\.includes\(e\.kind\)\) say\('kind is melee or ranged'\)/, 'the weapon kinds').sort(), keysOf(WEAPON_KIND_WORDS));
  const tags = inline(/Object\.keys\(v\.light\)\.every\(\(k\) => \[([^\]]*)\]\.includes\(k\)\)/, 'the keys of a light');
  assert.deepEqual([...tags].sort(), [...LIGHT_FIELDS].sort());
  const dcs = inline(/Object\.entries\(e\.dc\)\.every\(\(\[k, n\]\) => \[([^\]]*)\]\.includes\(k\)/, 'the keys of dc');
  assert.deepEqual([...dcs].sort(), [...OBJECT_DC_FIELDS].sort());
  const keys = inline(/objects: \{ what: 'an object', keys: \[([^\]]*)\]/, 'the object keys');
  assert.deepEqual([...keys].sort(), keysOf(OBJECT_FIELDS));
  for (const [kind, shape] of [['weapons', 'weapons'], ['armour', 'armour']]) {
    const m = new RegExp(`${kind}: \\{ what: '[^']*', keys: \\[([^\\]]*)\\]`).exec(read('../src/content/schema.js'));
    assert.ok(m, `${kind}: the strict key list is in schema.js`); assert.deepEqual(m[1].match(/'([A-Za-z0-9-]+)'/g).map((x) => x.slice(1, -1)).sort(), keysOf(HOMEBREW_TYPES[shape]), `${kind}: the strict keys`);
  }
});

// ---------- golden text ----------
test('the golden readings match reader-gear-golden.txt', () => {
  const text = goldenText();
  if (process.env.READER_GOLDEN === 'update') writeFileSync(GOLDEN, text);
  assert.equal(text, readFileSync(GOLDEN, 'utf8'), 'a reading changed: if on purpose, regenerate with READER_GOLDEN=update and read the diff');
  for (const [kind, list] of KINDS) for (const e of PACK[list]) {
    const r = readEntry(kind, e);
    assert.deepEqual(r.problems, [], `${e.id} reads without a problem`);
    assert.equal(r.refused, false, `${e.id} is not refused`);
  }
});

// ---------- every SRD weapon, armour and object ----------
const NOT_NUMBERS = ['id', 'name', 'source', 'text', 'manual', 'action', 'when', 'advantageIf', 'set', 'resource', 'spell', 'checked', 'spells', 'of', 'while', 'after', 'list', 'from', 'to', 'initial', 'ammo', 'type', 'kind', 'category', 'properties', 'mastery', 'stealth', 'reveal', 'tool'];
// Every number the entry holds, found without the reader: numeric leaves, dice and prices written as text.
function numbersIn(v, path, out, key = '') {
  if (typeof v === 'number') out.push(`${path}=${v}`);
  else if (typeof v === 'string') { if (['damage', 'versatile', 'cost', 'heal', 'tempHp', 'regain'].includes(key) || (/\d/.test(v) && /^[\d dx+-]+$/.test(v) && !NOT_NUMBERS.includes(key))) out.push(`${path}=${v}`); }
  else if (Array.isArray(v)) v.forEach((x, i) => numbersIn(x, `${path}.${i}`, out, key));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!NOT_NUMBERS.includes(k)) numbersIn(x, path ? `${path}.${k}` : k, out, k);
  return out;
}
const sameText = (r, e) => (e.text === undefined ? r.text === null : r.text === e.text.replace(/\s+/g, ' ').trim().slice(0, READER_LIMITS.text) + (e.text.length > READER_LIMITS.text ? '…' : ''));
for (const [kind, lookup] of KINDS) {
  test(`every SRD ${kind} reads without a problem, and its numbers are the entry's`, () => {
    const all = Object.values(CONTENT[lookup]);
    assert.ok(all.length >= 13);
    for (const e of all) {
      const r = readEntry(kind, e);
      assert.equal(r.kind, kind);
      assert.ok(r.lines.length >= 4, `${e.id} has a reading`);
      assert.deepEqual(r.problems, [], `${e.id} reads without a problem`);
      assert.equal(r.title, e.name);
      assert.equal(r.refused, null, 'an SRD entry is not asked of strict mode');
      assert.ok(sameText(r, e), `${e.id}: the author's text is returned as it is`);
      assert.deepEqual(r.numbers.map((n) => `${n.at}=${n.value}`).sort(), numbersIn(e, '', []).sort(), `${e.id}: the numbers list is every number in the entry`);
      const text = r.lines.join('\n');
      for (const n of r.numbers) if (Number.isInteger(n.value) && n.value !== 1 && n.value !== 0) assert.ok(text.includes(String(n.value)), `${e.id}: ${n.at} (${n.value}) is said in the reading`);
      if (kind !== 'object') assert.equal(r.tier, null, 'weapons and armour have no tier');
      else assert.equal(r.tier, e.tier);
    }
  });
}
