// The plain-language reader for items and feats (docs/specs/homebrew.md, Decision 6, task B13, second part).
// Golden text: packages/rules/test/reader-items-golden.txt. After a deliberate change to a sentence, regenerate it with
//   READER_GOLDEN=update node --test packages/rules/test/reader-items.test.js
// and read the diff: every changed line is a changed reading the DM would approve.
// The invented entries are in fixtures/reader-kinds-pack.json (a pack that loads in strict mode) and below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CONTENT } from '../src/content/index.js';
import { loadPack } from '../src/content/registry.js';
import { GRANTS, HOMEBREW_TYPES, HOOKS, ITEM_CATEGORIES, ITEM_VARIANTS, ACTION_TIMES, FEAT_CATEGORIES, FEAT_FEATURES, RARITIES, TIERS, WEAR, lintEntry } from '../src/content/schema.js';
import {
  ACTION_TIME_WORDS, ACTIVATE_FIELDS, ANY_ABILITY_FIELDS, ATTUNE_FIELDS, AURA_FIELDS, BASE_FIELDS, CHARGES_FIELDS, FEAT_CATEGORY_WORDS, FEAT_FEATURE_WORDS, FEAT_FIELDS, FEAT_TIER_WORDS,
  FREECAST_COST_FIELDS, FREECAST_WORDS, GRANTS_CLASS_ONLY, GRANT_WORDS, INCREASE_FIELDS, ITEM_CATEGORY_WORDS, ITEM_FIELDS, ITEM_NO_GRANTS, ITEM_TIER_WORDS, ITEM_VARIANT_WORDS,
  PREREQUISITE_FIELDS, PROFICIENCIES_FIELDS, RARITY_WORDS, READER_LIMITS, READ_KINDS, SCROLL_STATS, SPELLPICK_FIELDS, WEAR_WORDS, readEntry,
} from '../src/content/reader.js';
import { apply, current, makeEntity, scrollStats } from '../src/engine.js';
import { derive } from '../src/derive.js';
import { newGame } from '../src/scenario.js';

const GOLDEN = new URL('./reader-items-golden.txt', import.meta.url);
const PACK = JSON.parse(readFileSync(new URL('./fixtures/reader-kinds-pack.json', import.meta.url), 'utf8'));
const keysOf = (o) => Object.keys(o).sort();
const read = (url) => readFileSync(new URL(url, import.meta.url), 'utf8');
const base = (id, name, tier, text) => ({ id: `hb-rk-${id}`, source: 'homebrew:rk', tier, checked: false, name, text });

// Entries that strict mode lets through but the reader flags (they can never work, or they hurt the user), or that need what loadPack does not
// give (DEBT T56 below), so they cannot be in the pack the hb tool reads clean.
const EXTRA_ITEMS = [
  { ...base('spite-coal', 'Spite Coal', 'assist', 'A coal that is never quite cold. Invented for the reader tests: it burns whoever uses it.'),
    category: 'wondrous', rarity: 'common', wear: 'carried', charges: { max: 2 },
    activate: [{ name: 'Shelter', time: 'action', spell: 'shield', self: true }, { name: 'Stoke', time: 'action', cost: 1, effects: [{ damage: '1d6', type: 'fire' }, { save: 'dex', dc: 12, onFail: [{ condition: 'prone' }] }] }, { name: 'Overstoke', time: 'action', cost: 3, effects: [{ heal: '1d4' }] }] },
];
const EXTRA_FEATS = [
  { ...base('borrowed-fire', 'Borrowed Fire', 'assist', 'A flame that is not yours to spend. Invented for the reader tests: it can never be cast.'),
    category: 'epic-boon', prerequisite: { level: 19 }, grants: { freeCast: { list: 'wizard', maxLevel: 2 } } },
  { ...base('hedge-druid', 'Hedge Druid', 'assist', 'A little of the wild, kept in a pocket. Invented for the reader tests: loadPack cannot take its cost (DEBT T56).'),
    category: 'general', prerequisite: { feature: 'fighting-style' },
    grants: { freeCast: { spells: ['find-familiar'], cost: { slot: true, uses: 'wild-shape' }, components: 'none', time: 'action', types: ['fey'], ends: ['longRest'] } } },
  { ...base('chain-pact', 'Chain Pact', 'assist', 'A bargain with small things. Invented for the reader tests: loadPack refuses extra forms.'),
    category: 'general', grants: { freeCast: { spells: ['find-familiar'], atWill: true, time: 'action', forms: ['imp', 'quasit'] } } },
];
const items = () => [...PACK.items, ...EXTRA_ITEMS];
const feats = () => [...PACK.feats, ...EXTRA_FEATS, CONTENT.feats['magic-initiate'], CONTENT.feats.skilled];
const readingOf = (kind, e) => { const r = readEntry(kind, e); return [`== ${kind} ${e.id}`, ...r.lines, ...r.doesNot.map((x) => `DM: ${x}`), ...r.problems.map((x) => `PROBLEM: ${x}`), ''].join('\n'); };
const goldenText = () => [...items().map((e) => readingOf('item', e)), ...feats().map((e) => readingOf('feat', e))].join('\n');

test('the invented pack loads in strict mode, with its items and feats', () => {
  const r = loadPack(structuredClone(PACK));
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.ok(PACK.items.length >= 8 && PACK.feats.length >= 4);
  for (const e of EXTRA_ITEMS) assert.deepEqual(lintEntry('items', e, { pack: 'rk', srd: CONTENT }), [], e.id);
  for (const e of EXTRA_FEATS) assert.deepEqual(lintEntry('feats', e, { pack: 'rk', srd: CONTENT }).filter((m) => !/cannot add familiar forms/.test(m)), [], e.id);
});

// ---------- the vocabulary and the reader's words ----------
function inline(re, what) { const m = re.exec(read('../src/content/schema.js')); assert.ok(m, `schema.js: ${what} not found`); return m[1].match(/'([A-Za-z0-9-]+)'/g).map((x) => x.slice(1, -1)); }
test('every field of an item, a feat and what they hold has words in the reader', () => {
  assert.deepEqual(keysOf(ITEM_FIELDS), keysOf(HOMEBREW_TYPES.items), 'an item key with no words (or words for no key)');
  assert.deepEqual(keysOf(FEAT_FIELDS), keysOf(HOMEBREW_TYPES.feats), 'a feat key with no words');
  assert.deepEqual(keysOf(ACTIVATE_FIELDS), keysOf(HOMEBREW_TYPES.activate));
  assert.deepEqual([...ATTUNE_FIELDS].sort(), keysOf(HOMEBREW_TYPES.attune));
  assert.deepEqual([...BASE_FIELDS].sort(), keysOf(HOMEBREW_TYPES.base));
  assert.deepEqual([...CHARGES_FIELDS].sort(), keysOf(HOMEBREW_TYPES.charges));
  assert.deepEqual([...PREREQUISITE_FIELDS].sort(), keysOf(HOMEBREW_TYPES.prerequisite));
  assert.deepEqual([...ANY_ABILITY_FIELDS].sort(), keysOf(HOMEBREW_TYPES.anyAbility));
  assert.deepEqual([...INCREASE_FIELDS].sort(), keysOf(HOMEBREW_TYPES.increase));
  assert.deepEqual([...PROFICIENCIES_FIELDS].sort(), keysOf(HOMEBREW_TYPES.proficiencies));
  assert.deepEqual([...SPELLPICK_FIELDS].sort(), keysOf(HOMEBREW_TYPES.spellPick));
  assert.deepEqual([...AURA_FIELDS].sort(), keysOf(HOMEBREW_TYPES.aura));
  assert.deepEqual(keysOf(FREECAST_WORDS), keysOf(HOMEBREW_TYPES.freeCast), 'a freeCast key with no words');
  assert.deepEqual([...FREECAST_COST_FIELDS].sort(), keysOf(HOMEBREW_TYPES.freeCastCost));
  assert.deepEqual(keysOf(GRANT_WORDS), [...GRANTS].sort(), 'a grants key with no words');
  for (const k of keysOf(HOMEBREW_TYPES.grants)) assert.ok(GRANTS.includes(k), `${k} is a grants key`);
  assert.deepEqual(keysOf(ITEM_CATEGORY_WORDS), [...ITEM_CATEGORIES].sort());
  assert.deepEqual(keysOf(RARITY_WORDS), [...RARITIES].sort());
  assert.deepEqual(keysOf(WEAR_WORDS), [...WEAR].sort());
  assert.deepEqual(keysOf(ITEM_VARIANT_WORDS), [...ITEM_VARIANTS].sort());
  assert.deepEqual(keysOf(FEAT_CATEGORY_WORDS), [...FEAT_CATEGORIES].sort());
  assert.deepEqual(keysOf(FEAT_FEATURE_WORDS), [...FEAT_FEATURES].sort());
  assert.deepEqual(keysOf(ACTION_TIME_WORDS), [...ACTION_TIMES].sort());
  assert.deepEqual(keysOf(ITEM_TIER_WORDS), [...TIERS].sort());
  assert.deepEqual(keysOf(FEAT_TIER_WORDS), [...TIERS].sort());
  assert.ok(READ_KINDS.includes('item') && READ_KINDS.includes('feat'));
});

test('the keys the linters themselves list for an item and a feat are the ones the reader has words for', () => {
  const itemKeys = inline(/for \(const k of Object\.keys\(e\)\) if \(!\[([^\]]*)\]\.includes\(k\)\) say\(`"\$\{k\}" is not something an item has`\)/, 'the item keys');
  const featKeys = inline(/for \(const k of Object\.keys\(e\)\) if \(!\[([^\]]*)\]\.includes\(k\)\) say\(`"\$\{k\}" is not something a feat has`\)/, 'the feat keys');
  assert.deepEqual(keysOf(ITEM_FIELDS), [...itemKeys].sort());
  assert.deepEqual(keysOf(FEAT_FIELDS), [...featKeys].sort());
  const noGrants = inline(/for \(const k of Object\.keys\(e\.grants \?\? \{\}\)\) if \(\[([^\]]*)\]\.includes\(k\)\) say\(`an item does not grant/, 'the keys an item does not grant');
  assert.deepEqual([...ITEM_NO_GRANTS].sort(), [...noGrants].sort());
  const use = inline(/Object\.keys\(u\)\.every\(\(k\) => \[([^\]]*)\]\.includes\(k\)\)\) \{ us\('a use is/, 'the keys of a use');
  assert.deepEqual(keysOf(ACTIVATE_FIELDS), [...use].sort());
});

// A value for every grants key that the feat linter takes, so each key's words are run on the least a key can hold.
export const SAMPLES = {
  modifiers: [{ on: 'ac', op: 'add', value: 1 }], aura: { range: 10, immune: ['charmed'] }, cure: { of: 'lay-on-hands', conditions: ['poisoned'] }, freeCast: { spells: ['shield'], atWill: true },
  conditionImmune: ['charmed'], metamagic: { id: 'quickened', cost: 2, pool: 'sorcery-points' }, metamagicMax: { n: 2, while: 'innate-sorcery' }, exchange: { costs: { 1: 2, 2: 3 }, minLevel: { 1: 2, 2: 3 } },
  restore: { of: 'rage', max: 2 }, action: { time: 'bonus', target: { self: true }, effects: [{ modifier: { on: 'ac', op: 'add', value: 1 }, ends: { on: 'turnEnd' } }], duration: '1 minute', cost: { resource: 'rage', n: 1 } },
  reaction: { on: 'hit', cut: 'half' }, ac: { base: 13, abilities: ['dex'], shield: true }, armouredAc: 1, speed: { add: 10 }, speeds: { climb: 20 }, senses: { darkvision: 60 }, saves: ['dex'], extraAttack: 1, sneak: 2,
  rangedAttack: 2, spells: ['shield'], martialArts: 6, hp: 2, bonusActs: ['dash'], expertise: 1, skills: { n: 1, from: 'any' }, abilityBonus: { str: 1, max: 20 }, cantrips: 1,
  proficiency: { weapons: ['martial'], armour: ['heavy'] }, recover: { levels: 'half-up', max: 5 }, resist: ['fire'], critOn: 19, spellLists: ['wizard'], setAbility: { str: 19 }, bareAc: 1, senseRange: { darkvision: 30 },
  moveWith: { of: 'rage' }, brutal: { after: 'reckless-attack', dice: '1d10', options: [{ id: 'shove', name: 'Shove', effects: [{ condition: 'prone' }] }] }, relentless: { while: 'rage', dc: 10, step: 5, hp: 5 },
  initiative: { regain: 'rage', upTo: 2, heal: 5 }, persist: { of: 'rage', endsOn: 'unconscious' }, reroll: { cost: 'indomitable', add: 3 }, missed: { modifier: { on: 'attack.roll', op: 'advantage' }, ends: { on: 'turnEnd' } },
  evasion: true, surfaces: true, selfCure: { conditions: ['charmed'] }, allTypes: { of: 'deflect-attacks' }, fleet: { of: 'step-of-the-wind' },
  cunning: { max: 2, options: [{ id: 'trip', name: 'Trip', cost: 1, effects: [{ condition: 'prone' }] }] }, attune: 4, empowered: { school: 'evocation', list: 'wizard', ability: 'int' },
  overchannel: { list: 'wizard', maxSlot: 5, die: 12 }, afterHit: { modifier: { on: 'attack.roll', op: 'disadvantage' } }, markSpread: { spell: 'hunters-mark', range: 30 }, steadfast: { spell: 'hunters-mark' },
  restExhaustion: 'short', spellRange: { spell: 'eldritch-blast', perLevel: 5 }, repel: { spell: 'eldritch-blast', feet: 10 },
  formOf: { of: 'wild-shape', maxCr: 2, types: ['elemental'], tempHp: 2, cost: { resource: 'wild-shape', n: 2 } },
  triggers: { attackAction: { modifiers: [{ on: 'speed', op: 'add', value: 10 }] }, opportunityHit: { move: 'half' } },
  swap: [{ id: 'slot-for-inspiration', give: { slot: true }, get: { resource: 'bardic-inspiration' } }],
  forgoAttack: { spell: 'find-familiar' }, invest: { spell: 'find-familiar', speed: { feet: 40, of: ['fly', 'swim'] }, damage: { from: ['piercing'], to: ['radiant'] }, saveDc: true, bonusAttack: true, ward: true },
};
const featWith = (k, v) => ({ ...base('t', 'T', 'assist', 'x'), category: 'general', grants: { [k]: structuredClone(v) } });
test('each grants key: a sample the feat linter takes, read with words, no problem; an item refuses exactly the class-only keys', () => {
  assert.deepEqual(keysOf(SAMPLES), [...GRANTS].sort());
  for (const k of GRANTS) {
    assert.deepEqual(lintEntry('feats', featWith(k, SAMPLES[k]), { strict: false }), [], `the feat linter takes ${k}`);
    const r = readEntry('feat', featWith(k, SAMPLES[k]));
    assert.deepEqual(r.problems, [], `${k} reads without a problem`);
    assert.ok(r.lines.length >= 7, `${k} has a line of its own`);
    assert.ok(r.lines.some((l) => l.startsWith('  ')), `${k} is read under the grants line`);
    const asItem = { ...base('t', 'T', 'assist', 'x'), category: 'wondrous', rarity: 'rare', wear: 'carried', grants: { [k]: structuredClone(SAMPLES[k]) } };
    const refused = lintEntry('items', asItem, { strict: false }).some((m) => /does not grant/.test(m));
    assert.equal(refused, ITEM_NO_GRANTS.includes(k), `${k}: the item linter ${refused ? 'refuses' : 'takes'} it`);
    if (refused) assert.ok(readEntry('item', asItem).problems.length > 0, `${k} on an item is a problem`);
  }
});

// ---------- the golden readings use every field and shape ----------
test('the golden items and feats use every field, grant and freeCast key the linters allow', () => {
  const fields = { item: new Set(), feat: new Set() }, activate = new Set(), attune = new Set(), baseK = new Set(), charges = new Set(), prereq = new Set(), anyAb = new Set(), inc = new Set(), prof = new Set(), pick = new Set();
  const grants = new Set(), fc = new Set(), aura = new Set(), cats = new Set(), rar = new Set(), wear = new Set(), vars = new Set(), times = new Set(), fcCost = new Set(), fcat = new Set(), featFeature = new Set();
  for (const e of items()) {
    for (const k of Object.keys(e)) fields.item.add(k);
    cats.add(e.category); rar.add(e.rarity); wear.add(e.wear); if (e.variant) vars.add(e.variant);
    if (isObject(e.attune)) for (const k of Object.keys(e.attune)) attune.add(k); else if (e.attune) attune.add('true');
    for (const k of Object.keys(e.base ?? {})) baseK.add(k);
    for (const k of Object.keys(e.charges ?? {})) charges.add(k);
    for (const u of e.activate ?? []) { for (const k of Object.keys(u)) activate.add(k); times.add(u.time); }
    for (const k of Object.keys(e.grants ?? {})) grants.add(k);
    for (const k of Object.keys(e.grants?.aura ?? {})) aura.add(k);
  }
  for (const e of feats()) {
    for (const k of Object.keys(e)) fields.feat.add(k);
    fcat.add(e.category);
    for (const k of Object.keys(e.prerequisite ?? {})) prereq.add(k);
    if (e.prerequisite?.feature) featFeature.add(e.prerequisite.feature);
    for (const k of Object.keys(e.prerequisite?.abilities ?? {})) anyAb.add(k);
    for (const k of Object.keys(e.increase ?? {})) inc.add(k);
    for (const k of Object.keys(e.proficiencies ?? {})) prof.add(k);
    for (const k of Object.keys(e.spellPick ?? {})) pick.add(k);
    for (const k of Object.keys(e.grants ?? {})) grants.add(k);
    for (const k of Object.keys(e.grants?.freeCast ?? {})) fc.add(k);
    for (const k of Object.keys(e.grants?.freeCast?.cost ?? {})) fcCost.add(k);
    for (const k of Object.keys(e.grants?.aura ?? {})) aura.add(k);
  }
  assert.deepEqual([...fields.item].sort(), keysOf(HOMEBREW_TYPES.items), 'every item key');
  assert.deepEqual([...fields.feat].sort(), keysOf(HOMEBREW_TYPES.feats), 'every feat key (spellPick through the SRD Magic Initiate)');
  assert.deepEqual([...activate].sort(), keysOf(HOMEBREW_TYPES.activate));
  assert.deepEqual([...attune].sort(), ['by', 'spellcaster', 'true']);
  assert.deepEqual([...baseK].sort(), keysOf(HOMEBREW_TYPES.base));
  assert.deepEqual([...charges].sort(), keysOf(HOMEBREW_TYPES.charges));
  assert.deepEqual([...prereq].sort(), keysOf(HOMEBREW_TYPES.prerequisite));
  assert.deepEqual([...anyAb].sort(), keysOf(HOMEBREW_TYPES.anyAbility));
  assert.deepEqual([...inc].sort(), keysOf(HOMEBREW_TYPES.increase));
  assert.deepEqual([...prof].sort(), keysOf(HOMEBREW_TYPES.proficiencies));
  assert.deepEqual([...pick].sort(), keysOf(HOMEBREW_TYPES.spellPick));
  assert.deepEqual([...aura].sort(), keysOf(HOMEBREW_TYPES.aura));
  assert.deepEqual([...fc].sort(), keysOf(HOMEBREW_TYPES.freeCast), 'every freeCast key');
  assert.deepEqual([...fcCost].sort(), keysOf(HOMEBREW_TYPES.freeCastCost));
  for (const k of keysOf(HOMEBREW_TYPES.grants)) assert.ok(grants.has(k), `a golden entry grants ${k}`);
  assert.ok(grants.has('freeCast') && grants.has('spells'));
  assert.deepEqual([...cats].sort(), ['armor', 'potion', 'ring', 'scroll', 'weapon', 'wondrous'], 'the item categories the golden entries use');
  assert.ok(['common', 'uncommon', 'rare', 'legendary', 'varies'].every((x) => rar.has(x)));
  assert.ok(['eyes', 'armour', 'weapon', 'carried', 'ring'].every((x) => wear.has(x)));
  assert.deepEqual([...vars].sort(), [...ITEM_VARIANTS].sort());
  assert.deepEqual([...times].sort(), ['action', 'bonus', 'reaction']);
  assert.deepEqual([...fcat].sort(), [...FEAT_CATEGORIES].sort());
  assert.deepEqual([...featFeature].sort(), [...FEAT_FEATURES].sort());
  assert.deepEqual(new Set(items().map((e) => e.tier)), new Set(TIERS));
});
const isObject = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

test('the golden readings match reader-items-golden.txt', () => {
  const text = goldenText();
  if (process.env.READER_GOLDEN === 'update') writeFileSync(GOLDEN, text);
  assert.equal(text, readFileSync(GOLDEN, 'utf8'), 'a reading changed: if on purpose, regenerate with READER_GOLDEN=update and read the diff');
});

// ---------- every SRD item and feat ----------
// Every number the entry holds, found without the reader: numeric leaves, and strings with a digit (dice, durations), none from ids, names or author text.
const NOT_NUMBERS = ['id', 'name', 'source', 'text', 'manual', 'action', 'when', 'advantageIf', 'set', 'resource', 'spell', 'checked', 'spells', 'of', 'while', 'after', 'list'];
function numbersIn(v, path, out) {
  if (typeof v === 'number') out.push(`${path}=${v}`);
  else if (typeof v === 'string') { if (/\d/.test(v) && /^[\d dx+-]+$|^\d+ \w+$/.test(v)) out.push(`${path}=${v}`); }
  else if (Array.isArray(v)) v.forEach((x, i) => numbersIn(x, `${path}.${i}`, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!NOT_NUMBERS.includes(k)) numbersIn(x, path ? `${path}.${k}` : k, out);
  return out;
}
const sameText = (r, e) => r.text === e.text.replace(/\s+/g, ' ').trim().slice(0, READER_LIMITS.text) + (e.text.length > READER_LIMITS.text ? '…' : '');
// Numbers the reading keeps apart from the entry's: what a Spell Scroll ignores is still the entry's.
function everyNumberIsSaid(r, label) {
  const text = r.lines.join('\n');
  for (const n of r.numbers) if (Number.isInteger(n.value) && n.value !== 1 && n.value !== 0 && n.unit !== 'ignored') assert.ok(text.includes(String(n.value)), `${label}: ${n.at} (${n.value}) is said in the reading`);
}
for (const [kind, lookup] of [['item', 'items'], ['feat', 'feats']]) {
  test(`every SRD ${kind} reads without a problem, and its numbers are the entry's`, () => {
    const all = Object.values(CONTENT[lookup]);
    assert.ok(all.length >= 17);
    let auto = 0;
    for (const e of all) {
      const r = readEntry(kind, e);
      assert.equal(r.kind, kind);
      assert.ok(r.lines.length >= 4, `${e.id} has a reading`);
      assert.deepEqual(r.problems, [], `${e.id} reads without problems`);
      assert.deepEqual(r.numbers.map((n) => `${n.at}=${n.value}`).sort(), numbersIn(e, '', []).sort(), `${e.id}: the numbers list is every number in the entry`);
      everyNumberIsSaid(r, e.id);
      assert.equal(r.tier, e.tier);
      assert.equal(r.title, e.name);
      assert.ok(sameText(r, e));
      if (e.tier === 'auto') auto++;
    }
    assert.ok(auto >= 6, `the auto SRD ${kind}s (${auto})`);
  });
}

test('the reading says what the engine does, for the SRD\'s own items and feats', () => {
  const has = (kind, id, re) => assert.ok(readEntry(kind, CONTENT[`${kind}s`][id]).lines.some((l) => re.test(l)), `${id}: ${re}`);
  has('item', 'wand-of-magic-missiles', /It holds up to 7 charges/);
  has('item', 'wand-of-magic-missiles', /rolls 1d6\+1 for each dawn/);
  has('item', 'potion-of-healing', /regains 2d4\+2 Hit Points/);
  has('item', 'potion-of-healing', /gone from the sheet/);
  has('item', 'belt-of-dwarvenkind', /needs attunement/);
  has('item', 'armor-plus-1', /\+1 Armor Class/);
  has('item', 'ring-of-swimming', /Speeds: swim 40 feet/);      // the engine moves a creature by a swim speed since #836: no line that it does not
  has('item', 'spell-scroll', /DC 13 and \+5 up to level 2/);
  has('feat', 'alert', /The Proficiency Bonus to its Initiative/);
  has('feat', 'magic-initiate', /up to 2 cantrips and 1 level 1 spell/);
  has('feat', 'archery', /\+2 to the holder's attack rolls with ranged weapons/);
  assert.deepEqual(readEntry('item', CONTENT.items['ring-of-swimming']).doesNot.includes('Moving the holder by its swim speed.'), false);
  assert.deepEqual(SCROLL_STATS.map(([n]) => scrollStats(n)), SCROLL_STATS.map(([, dc, attack]) => ({ dc, attack })), 'the scroll table is the engine\'s');
});

// ---------- what the engine does, said (the readings stay true) ----------
const DM = { role: 'dm', userId: 'dm' };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const A = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 };
const fighter = (extra = {}) => ({ name: 'Brenna', class: 'fighter', level: 5, subclass: 'champion', abilities: A, skills: ['athletics', 'perception'], choices: { 'fighting-style': 'defense' }, weapons: ['longbow'], ...extra });
function field(sheet, seed = 7) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (!['m1', 'rogue'].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = 'grass';
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: 'hero', kind: 'pc', side: 'party', pos: { q: 0, r: 0, z: 0 }, owner: 'pat', ownerName: 'Pat' });
  s.entities.hero.sheet = structuredClone(sheet);
  ok(apply(s, { type: 'place', actor: 'm1', to: { q: 3, r: 0 } }, DM));
  return s;
}
// Lend entries to the content lookups for one call.
function lend(kind, entries, fn) {
  const put = [];
  for (const e of entries) { CONTENT[kind][e.id] = e; put.push(e.id); }
  try { return fn(); } finally { for (const id of put) delete CONTENT[kind][id]; }
}
const itemSheet = (id, extra = {}, entry = {}) => fighter({ items: [{ id: 'i1', item: id, equipped: true, ...entry }], ...extra });

test('the engine does what the reading says of an item\'s use: its steps fall on the user, a save with no DC and a spell attack go to the DM, healing adds nothing, and the last charge is told to the DM', () => {
  const coal = { ...EXTRA_ITEMS[0], id: 'hb-t-coal', grants: undefined };
  delete coal.grants;
  const gaps = { ...PACK.items.find((x) => x.id === 'hb-rk-hollow-spore-flask'), id: 'hb-t-flask' };
  const mend = { ...base('mend', 'Mend', 'auto', 'x'), id: 'hb-t-mend', category: 'wondrous', rarity: 'common', wear: 'carried', activate: [{ time: 'action', effects: [{ heal: '1d4', addMod: true }] }] };
  lend('items', [coal, gaps, mend], () => {
    // Harm in a non-potion's steps lands on the user.
    { const s = field(itemSheet('hb-t-coal')); const r = ok(apply(s, { type: 'use', actor: 'hero', item: 'i1', which: 1 }, DM));
      const hurt = r.events.find((e) => e.type === 'damage'); assert.equal(hurt?.target, 'hero', 'the damage falls on the user');
      assert.ok(s.entities.hero.hp < s.entities.hero.maxHp);
      // A charge spent; the second use costs 3 of 2: refused.
      const left = r.events.find((e) => e.type === 'item'); assert.equal(left.charges, 1);
      const again = apply(s, { type: 'use', actor: 'hero', item: 'i1', which: 2 }, DM); assert.equal(again.ok, false); assert.match(again.error, /charge/);
      // The last charge: the DM is told what it does is theirs.
      const last = ok(apply(s, { type: 'use', actor: 'hero', item: 'i1', which: 1 }, DM));
      assert.equal(last.events.find((e) => e.type === 'item').charges, 0);
      assert.ok(last.events.some((e) => e.type === 'manual' && /no charges left/.test(e.text))); }
    // A save with no DC, a spell attack and a repeated save with no DC: handed to the DM.
    { const s = field(itemSheet('hb-t-flask')); const r = ok(apply(s, { type: 'use', actor: 'hero', item: 'i1', target: 'hero' }, DM));
      const text = r.events.filter((e) => e.type === 'manual').map((e) => e.text).join('\n');
      assert.match(text, /no attack bonus/); assert.match(text, /save with no DC/); assert.equal(r.events.find((e) => e.type === 'attack'), undefined);
      assert.equal(s.entities.hero.sheet.items?.some((x) => x.id === 'i1'), undefined, 'the flask is gone once used'); }
    // Healing that adds the modifier adds 0.
    { const s = field(itemSheet('hb-t-mend')); s.entities.hero.hp = 1; 
      const r = ok(apply(s, { type: 'use', actor: 'hero', item: 'i1' }, DM)); const heal = r.events.find((e) => e.type === 'heal');
      assert.ok(heal && heal.amount >= 1 && heal.amount <= 4, 'only the die, and no modifier'); }
  });
});

test('the engine does what the reading says of wearing, attuning and a Reaction use', () => {
  const lens = PACK.items.find((x) => x.id === 'hb-rk-emberglass-lens'), bell = PACK.items.find((x) => x.id === 'hb-rk-mourning-bell');
  lend('items', [{ ...bell, id: 'hb-t-bell' }, { ...lens, id: 'hb-t-lens', activate: [lens.activate[0]] }], () => {
    // Not attuned: the use is refused (an item that needs it does nothing until then).
    { const s = field(itemSheet('hb-t-bell')); const r = apply(s, { type: 'use', actor: 'hero', item: 'i1' }, DM); assert.equal(r.ok, false); assert.match(r.error, /must be attuned/); }
    // Attuned but a Reaction: refused, the DM applies it.
    { const s = field(itemSheet('hb-t-bell', {}, { attuned: true })); const r = apply(s, { type: 'use', actor: 'hero', item: 'i1' }, DM); assert.equal(r.ok, false); assert.match(r.error, /Reaction/); }
    // Not worn: refused.
    { const s = field(fighter({ items: [{ id: 'i1', item: 'hb-t-lens', attuned: true }] })); const r = apply(s, { type: 'use', actor: 'hero', item: 'i1' }, DM); assert.equal(r.ok, false); assert.match(r.error, /must be worn/); }
    // Attuning is done on a Short Rest and never in a fight.
    { const s = field(fighter({ items: [{ id: 'i1', item: 'hb-t-bell' }] })); ok(apply(s, { type: 'attune', actor: 'hero', item: 'i1' }, DM));
      assert.equal(s.entities.hero.sheet.items[0].attuned, undefined, 'not yet');
      ok(apply(s, { type: 'shortRest' }, DM)); assert.equal(s.entities.hero.sheet.items[0].attuned, true);
      ok(apply(s, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 8 }, DM));
      const r = apply(s, { type: 'attune', actor: 'hero', item: 'i1', end: true }, DM); assert.equal(r.ok, false); assert.match(r.error, /fight/); }
  });
});

test('the engine does what the reading says of charges at dawn, and of "once a dawn" in an item\'s own text', () => {
  const wand = { ...base('wand', 'Wand', 'assist', 'x'), id: 'hb-t-wand', category: 'wand', rarity: 'common', wear: 'carried', charges: { max: 4, regain: '1d3' }, activate: [{ time: 'action', cost: 1, spell: 'magic-missile', level: 1 }] };
  const wheel = { ...base('wheel', 'Wheel', 'assist', 'You may turn it once a dawn.'), id: 'hb-t-wheel', category: 'wondrous', rarity: 'common', wear: 'carried' };
  assert.ok(readEntry('item', wheel).lines.some((l) => /once a dawn/.test(l)));
  lend('items', [wand, wheel], () => {
    const s = field(fighter({ items: [{ id: 'i1', item: 'hb-t-wand', charges: 1 }, { id: 'i2', item: 'hb-t-wheel' }] }));
    const r = ok(apply(s, { type: 'advanceTime', minutes: 24 * 60 }, DM));
    const back = r.events.find((e) => e.type === 'recharged'); assert.ok(back && back.charges > 1 && back.charges <= 4 && back.dice === '1d3');
    assert.ok(r.events.some((e) => e.type === 'manual' && /once a dawn/.test(e.text)), 'the DM is told to restore the "once a dawn" use');
  });
});

test('the engine does what the reading says of a feat\'s freeCast and of grants only a class feature uses', () => {
  const featsFor = (fc, id) => ({ id: `hb-t-${id}`, name: 'Gift', category: 'general', tier: 'auto', source: 'homebrew:t', checked: false, text: 't', grants: { freeCast: fc } });
  const cast = (fc, id) => lend('feats', [featsFor(fc, id)], () => {
    const s = field(fighter({ feats: [{ id: `hb-t-${id}`, at: 'ability-score-improvement-4' }] }));
    return apply(s, { type: 'cast', actor: 'hero', spell: 'fireball', via: `feat-hb-t-${id}`, hex: { q: 3, r: 0 } }, DM);
  });
  // No atWill and no cost: a feat has no uses, so every cast is refused.
  const refused = cast({ spells: ['fireball'] }, 'a'); assert.equal(refused.ok, false); assert.match(refused.error, /no uses of Gift left/);
  assert.ok(readEntry('feat', EXTRA_FEATS[0]).problems.some((p) => /can never be cast/.test(p)));
  // At will: it casts, with a holder who casts no spells.
  const free = cast({ spells: ['fireball'], atWill: true }, 'b'); assert.ok(free.ok, free.error);
  // Class-only grants change nothing for a feat.
  const none = derive(fighter()).record;
  for (const k of GRANTS_CLASS_ONLY) {
    const e = { id: 'hb-t-cls', name: 'Cls', category: 'general', tier: 'assist', source: 'homebrew:t', checked: false, text: 't', grants: { [k]: structuredClone(SAMPLES[k]) } };
    lend('feats', [e], () => {
      const d = derive(fighter({ feats: [{ id: 'hb-t-cls', at: 'ability-score-improvement-4' }] }));
      const rec = d.record;
      assert.deepEqual({ spells: rec.spells, castAbil: rec.castAbil, slots: rec.slots }, { spells: none.spells, castAbil: none.castAbil, slots: none.slots }, `${k} adds nothing to the spells`);
    });
    assert.ok(readEntry('feat', { id: 'hb-t-cls', name: 'Cls', category: 'general', tier: 'assist', source: 'homebrew:t', checked: false, text: 't', grants: { [k]: structuredClone(SAMPLES[k]) } }).lines.some((l) => /belongs to no class|Only a class feature/.test(l)), `${k} is said to change nothing`);
  }
  // `attune` from a feat does not lift the limit of three.
  const items3 = ['a', 'b', 'c', 'd'].map((x, i) => ({ id: `i${i}`, item: 'belt-of-dwarvenkind', attuned: true }));
  void items3;
});

test('the engine as the reading says: loadPack cannot take a feat\'s freeCast cost or forms, though the entry linter can (DEBT T56)', () => {
  const doc = (e) => ({ ...structuredClone(PACK), monsters: [], items: [], feats: [e] });
  const hedge = EXTRA_FEATS.find((e) => e.id === 'hb-rk-hedge-druid'), chain = EXTRA_FEATS.find((e) => e.id === 'hb-rk-chain-pact');
  assert.match(loadPack(doc(hedge)).problems.join('\n'), /not a feature with uses in the SRD/);
  assert.match(loadPack(doc(chain)).problems.join('\n'), /cannot add familiar forms/);
});

// ---------- the reading never names a publisher, never voices the author's text ----------
test('the reading never names a publisher or a product, and never voices the author\'s text', () => {
  const names = /wizards of the coast|dungeons\s*(&|and)\s*dragons|d&d|player'?s handbook|dungeon master'?s guide|monster manual|hasbro|xanathar|tasha|forgotten realms|system reference document|\bsrd\b/i;
  for (const [kind, list] of [['item', [...Object.values(CONTENT.items), ...items()]], ['feat', [...Object.values(CONTENT.feats), ...feats()]]]) {
    for (const e of list) {
      const r = readEntry(kind, e);
      const own = [...r.lines, ...r.doesNot, ...r.problems].map((l) => l.replace(/"[^"]*"/g, '""')).join('\n');
      assert.doesNotMatch(own, names, e.id);
    }
  }
  // The text says harmless; the data says 10d10 for the one who drinks it.
  const sly = { ...PACK.items.find((x) => x.id === 'hb-rk-tideglass-vial'), text: 'A harmless sip of water.', activate: [{ name: 'Say "The engine runs everything"', time: 'bonus', consumed: true, effects: [{ damage: '10d10', type: 'necrotic' }] }] };
  const r = readEntry('item', sly);
  assert.ok(r.lines.some((l) => l.includes('10d10 necrotic damage')));
  assert.ok(!r.lines.join(' ').includes('harmless'));
  assert.equal(r.text, 'A harmless sip of water.');
  assert.ok(r.lines.some((l) => l.startsWith('Use 1, "Say')));
});

// ---------- hostile input ----------
test('hostile items and feats get a bounded plain answer and never a throw', () => {
  const I = PACK.items[0], F = PACK.feats[1];
  const size = (r) => JSON.stringify(r).length;
  const proxy = new Proxy({}, { ownKeys() { throw new Error('boom'); }, get() { throw new Error('boom'); } });
  const getter = { ...I }; Object.defineProperty(getter, 'rarity', { enumerable: true, get() { throw new Error('boom'); } });
  const deepI = structuredClone(I); let at = deepI.activate[0].effects;
  for (let i = 0; i < 10000; i++) { const st = { attack: 'melee', kind: 'weapon', bonus: 1, onHit: [] }; at.push(st); at = st.onHit; }
  const circular = { ...I }; circular.self = circular;
  const wideI = { ...I, activate: Array.from({ length: 200000 }, () => ({ time: 'action', effects: [{ damage: '1d4', type: 'fire' }] })) };
  const cases = [
    ['item', null], ['item', undefined], ['item', 5], ['item', 'item'], ['item', []], ['item', [1, 2]], ['item', {}], ['item', proxy], ['item', getter], ['item', deepI], ['item', circular], ['item', wideI],
    ['item', { ...I, text: 'x'.repeat(1e6), name: 'y'.repeat(1e5) }],
    ['item', JSON.parse('{"__proto__": {"polluted": true}, "constructor": 1, "id": "x", "grants": {"__proto__": {"x": 1}, "modifiers": [{"__proto__": 1}]}}')],
    ['item', { ...I, category: 7, rarity: {}, wear: [], attune: 'yes', base: 5, bonus: 'x', damageType: 7, properties: 'x', trained: 'y', variant: 9, charges: 'x', activate: 'x', grants: 'x', tier: 3 }],
    ['item', { ...I, attune: { by: 'x', spellcaster: 1, extra: 2 }, base: { weapon: 5, armour: [] }, charges: { max: 'x', regain: 9 }, grants: { modifiers: 'x', aura: 5, senses: 'x', speeds: 3, saves: 7, abilityBonus: [], setAbility: 'x' } }],
    ['item', { ...I, activate: [null, 7, 'x', [], { time: 'never' }, { time: 'action', cost: -3, spell: 5, level: 'x', upTo: {}, self: 3, dc: 'x', effects: 'y' }, { time: 'action', effects: [] }, { time: 'action' }, { time: 'action', consumed: 'y', effects: [{ manual: 5 }] }] }],
    ['item', { ...I, grants: { modifiers: [null, 7, 'x', { on: 5 }, { on: 'ac', op: 'add', value: {} }], aura: { range: 'x', modifiers: 'y', immune: [1] }, freeCast: 5, action: 'x', reaction: [], cunning: 'x', brutal: 5, relentless: [] } }],
    ['item', { ...I, [Symbol('s')]: 1, big: 10n, fn() {}, nan: NaN, inf: -Infinity }],
    ['feat', null], ['feat', undefined], ['feat', 5], ['feat', []], ['feat', {}], ['feat', proxy],
    ['feat', { ...F, text: 'x'.repeat(1e6), name: 'y'.repeat(1e5) }],
    ['feat', { ...F, category: 7, prerequisite: 'x', repeatable: {}, increase: 'x', proficiencies: [], spellPick: 5, grants: 'x', tier: 9 }],
    ['feat', { ...F, prerequisite: { level: 'x', abilities: { any: 'x', min: {} }, feature: 5, extra: 1 }, increase: { from: 'x', points: 'y', max: [] }, proficiencies: { n: 'x' }, spellPick: { lists: 'x', abilities: 3, cantrips: 'y', level1: [] } }],
    ['feat', { ...F, grants: { freeCast: { spells: 'x', list: 5, maxLevel: 'y', cost: 3, forms: 7, types: 'z', ends: {}, atWill: 'maybe' } } }],
    ['feat', { ...F, grants: { freeCast: { spells: [1, null], cost: { uses: 5 }, forms: [1], types: [{}], ends: [[]] }, action: { time: 'x', effects: 'y', modes: 5, cost: 'z' }, reaction: { on: 7, cut: {} } } }],
    ['feat', { ...F, grants: Object.fromEntries(GRANTS.map((k) => [k, k.length % 2 ? 'x' : 5])) }],
    ['feat', { ...F, grants: Object.fromEntries(GRANTS.map((k) => [k, null])) }],
    ['feat', { ...F, grants: Object.fromEntries(GRANTS.map((k) => [k, {}])) }],
    ['feat', { ...F, grants: Object.fromEntries(GRANTS.map((k) => [k, []])) }],
    ['feat', { ...F, grants: Object.fromEntries(GRANTS.map((k) => [k, { of: 5, while: [], cost: {}, options: 'x', conditions: 3, modifier: 5, add: {}, max: 'x', n: [], effects: 5, hp: 'x', dc: 'x' }])) }],
  ];
  for (const [kind, c] of cases) {
    let r;
    assert.doesNotThrow(() => { r = readEntry(kind, c); }, 'never a throw');
    assert.equal(r.kind, kind);
    assert.equal(typeof r.title, 'string');
    assert.ok(Array.isArray(r.lines) && Array.isArray(r.doesNot) && Array.isArray(r.problems) && Array.isArray(r.numbers));
    assert.ok(size(r) < 400000, `bounded output (${size(r)})`);
    assert.ok(r.lines.every((l) => typeof l === 'string' && l.length <= READER_LIMITS.line + 30), 'bounded line length');
    assert.ok(r.problems.length <= READER_LIMITS.problems);
    assert.ok(![...r.lines.join('')].some((c) => c.charCodeAt(0) < 32 || c === String.fromCharCode(0x2028)), 'no control characters');
  }
  assert.equal(({}).polluted, undefined);
  assert.equal(readEntry('item', deepI).hash, null);
  assert.ok(readEntry('item', deepI).lines.some((l) => l.includes('too large or too deeply nested')));
  assert.ok(readEntry('feat', { ...F, grants: 'x' }).problems.length > 0);
  assert.equal(readEntry('item', null).lines[0], 'This is not an item entry (it is not an object). It cannot be approved.');
  assert.equal(readEntry('feat', null).lines[0], 'This is not a feat entry (it is not an object). It cannot be approved.');
});

test('the item and feat readers are pure and deterministic, and the hash is of the canonical entry', () => {
  for (const [kind, list] of [['item', [...Object.values(CONTENT.items), ...items()]], ['feat', [...Object.values(CONTENT.feats), ...feats()]]]) {
    for (const e of list) {
      const copy = structuredClone(e);
      const a = readEntry(kind, e), b = readEntry(`${kind}s`, e);
      assert.deepEqual(a, b);
      assert.deepEqual(e, copy, 'the entry is not changed');
    }
  }
  const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v));
  const I = PACK.items[0];
  assert.equal(readEntry('item', I).hash, createHash('sha256').update(canon(I)).digest('hex'));
  const changed = structuredClone(I); changed.charges.max = 5;
  assert.notEqual(readEntry('item', changed).hash, readEntry('item', I).hash);
});
void HOOKS; void current;
