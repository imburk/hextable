// The plain-language reader for subclasses (docs/specs/homebrew-subclasses.md, Decision 2 and stage B3).
// Golden text: packages/rules/test/reader-subclass-golden.txt. After a deliberate change to a sentence, regenerate it with
//   READER_GOLDEN=update node --test packages/rules/test/reader-subclass.test.js
// and read the diff: every changed line is a changed reading the DM would approve.
// Every subclass here is invented for these tests (a pack "ember-folk"); no published subclass is used. The SRD's own twelve, made homebrew, are
// read too, to hold the reading to what the linter allows.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { CONTENT } from '../src/content/index.js';
import { loadPack } from '../src/content/registry.js';
import { GRANTS, HOMEBREW_TYPES, TIERS, lintEntry } from '../src/content/schema.js';
import {
  GRANT_WORDS, KIND_NAMES, READER_LIMITS, READ_KINDS, SUBCLASS_FEATURE_FIELDS, SUBCLASS_FIELDS, SUBCLASS_OPTION_FIELDS, SUBCLASS_RECHARGE_WORDS, SUBCLASS_REQUIRES_FIELDS, SUBCLASS_TIER_WORDS,
  SUBCLASS_USES_FIELDS, readEntry,
} from '../src/content/reader.js';
import { apply, makeEntity } from '../src/engine.js';
import { derive, validate } from '../src/derive.js';
import { newGame } from '../src/scenario.js';

const DM = { role: 'dm', userId: 'dm' };
const GOLDEN = new URL('./reader-subclass-golden.txt', import.meta.url);
const P = 'ember-folk', hb = (n) => `hb-${P}-${n}`, SRC = `homebrew:${P}`;
const keysOf = (o) => Object.keys(o).sort();
const doc = (lists) => ({ format: 'hextable-pack', v: 1, pack: { id: P, name: 'Ember Folk', version: 1, license: 'CC0, by the author', attribution: 'Written for a test.' }, ...lists });
const feat = (id) => CONTENT.feats[id];
const fs = (id) => ({ id, name: feat(id).name, tier: feat(id).tier, text: feat(id).text, feat: id });

// A spell of the pack, for the first subclass to always prepare.
const WARD = {
  id: hb('ember-ward'), name: 'Ember Ward', source: SRC, level: 2, school: 'abjuration', classes: ['paladin'], time: 'action', range: 60, components: ['v', 's'], duration: 'instant',
  concentration: false, ritual: false, target: { area: { shape: 'sphere', size: 10 } }, effects: [{ save: 'dex', half: true, onFail: [{ damage: '3d6', type: 'fire' }] }],
  tier: 'auto', checked: false, text: 'A ring of embers.',
};
const OATH = {
  id: hb('oath-of-the-ember'), name: 'Oath of the Ember', class: 'paladin', source: SRC, checked: false, text: 'Paladins sworn to keep a hearth-fire burning.',
  spells: { 3: ['burning-hands', 'shield-of-faith'], 5: [hb('ember-ward')] },
  features: [
    { id: hb('kindle'), name: 'Kindle', level: 3, tier: 'auto', checked: false, text: 'Spend Channel Divinity to wreathe one foe in sparks: you have Advantage on attack rolls against it for 1 minute.',
      grants: { action: { time: 'bonus', cost: { resource: 'channel-divinity' }, duration: '1 minute', target: { creature: { range: [30, 30] } },
        effects: [{ modifier: { on: 'attack.roll', op: 'advantage', against: 'target' }, to: 'caster' }] } } },
    { id: hb('hearth-aura'), name: 'Hearth Aura', level: 7, tier: 'auto', checked: false, text: 'You and allies in your aura have Resistance to Cold damage.',
      grants: { aura: { range: { byLevel: { 7: 10, 18: 30 } }, modifiers: [{ on: 'damage.taken', op: 'resist', types: ['cold'] }] } } },
    { id: hb('cinder-step'), name: 'Cinder Step', level: 9, tier: 'assist', checked: false, text: 'You leave a trail of warm ash; the DM decides what it lights.',
      uses: { max: 2, recharge: 'short' }, grants: { modifiers: [{ on: 'speed', op: 'add', value: 10 }] } },
    { id: hb('ash-memory'), name: 'Ash Memory', level: 15, tier: 'manual', checked: false, text: 'Once per Long Rest you may ask the DM one question about what the fire saw.', uses: { max: 1, recharge: 'long' } },
  ],
};
const LANTERN = {
  id: hb('college-of-the-lantern'), name: 'College of the Lantern', class: 'bard', source: SRC, checked: false, text: 'Bards who carry a light into dark places.',
  spells: { 3: ['faerie-fire'], 5: ['light'] },
  features: [
    { id: hb('lantern-lore'), name: 'Lantern Lore', level: 3, tier: 'auto', checked: false, text: 'You learn three more skills of your choice.', grants: { skills: { n: 3, from: 'any' } } },
    { id: hb('dazzling-glow'), name: 'Dazzling Glow', level: 3, tier: 'assist', checked: false, text: 'Spend Bardic Inspiration to dazzle a creature; the DM decides how long.',
      uses: { max: { mod: 'cha', min: 1 }, recharge: 'long', short: 1 },
      grants: { action: { time: 'bonus', cost: { resource: 'bardic-inspiration' }, target: { creature: { range: [60, 60] } }, effects: [{ save: 'wis', onFail: [{ condition: 'blinded', ends: { on: 'turnEnd' } }, { manual: 'Dazzling Glow: the creature squints against the light.' }] }] } } },
    { id: hb('borrowed-tune'), name: 'Borrowed Tune', level: 6, tier: 'manual', checked: false, text: 'Spend Bardic Inspiration to hum a tune a friend half remembers; the DM says what comes back to them.',
      grants: { action: { time: 'bonus', cost: { resource: 'bardic-inspiration' }, target: { self: true }, effects: [{ manual: 'Borrowed Tune: a friend remembers something.' }] } } },
    { id: hb('wick-choice'), name: 'Wick Choice', level: 14, tier: 'assist', checked: false, text: 'Choose two wicks to trim; the DM plays what the engine cannot.', pick: 2, uses: { max: 1, recharge: { 14: 'long', 18: 'short' } },
      options: [
        { id: hb('wick-slow'), name: 'Slow Wick', tier: 'manual', text: 'A flame that burns a long time.' },
        { id: hb('wick-bright'), name: 'Bright Wick', tier: 'auto', text: 'A flame that lights a path.', requires: { level: 15 }, grants: { modifiers: [{ on: 'initiative', op: 'add', value: 2 }] } },
        { id: hb('wick-spark'), name: 'Spark Wick', tier: 'auto', text: 'A flame you can throw once a rest.', requires: { option: hb('wick-slow'), spell: 'produce-flame' }, uses: { max: 1, recharge: 'short' },
          grants: { freeCast: { spells: ['produce-flame'], time: 'action' } } },
      ] },
  ],
};
const BANNER = {
  id: hb('banner-knight'), name: 'Banner Knight', class: 'fighter', source: SRC, checked: false, text: 'Fighters who carry a standard and never lower it.',
  features: [
    { id: hb('raised-standard'), name: 'Raised Standard', level: 3, tier: 'auto', checked: false, text: 'You and your allies near the standard are quicker to act.', grants: { aura: { range: 10, modifiers: [{ on: 'initiative', op: 'add', value: 1 }] } } },
    { id: hb('steady-grip'), name: 'Steady Grip', level: 4, tier: 'manual', checked: false, text: 'Your grip on the pole never slips, the DM says when it matters.' },
    { id: hb('second-colours'), name: 'Second Colours', level: 7, tier: 'assist', checked: false, text: 'Pick a second style; the DM plays what the engine cannot.',
      options: [fs('archery'), fs('defense'), fs('great-weapon-fighting')] },
  ],
};
const PACK = doc({ spells: [WARD], subclasses: [OATH, LANTERN, BANNER] });
const subs = () => [OATH, LANTERN, BANNER];
const read = (e, ctx = { spells: [hb('ember-ward')] }) => readEntry('subclasses', e, ctx);
const readingOf = (e) => { const r = read(e); return [`== subclass ${e.id}`, ...r.lines, ...r.doesNot.map((x) => `DM: ${x}`), ...r.problems.map((x) => `PROBLEM: ${x}`), ''].join('\n'); };
const goldenText = () => subs().map(readingOf).join('\n');
const text = (e, ctx) => read(e, ctx).lines.join('\n');

test('the invented subclasses load in strict mode, as a pack', () => {
  const r = loadPack(structuredClone(PACK));
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  for (const e of subs()) assert.deepEqual(lintEntry('subclasses', e, { pack: P, srd: CONTENT, spells: [hb('ember-ward')] }), [], e.id);
});

test('subclasses are a kind the reader reads, by either name', () => {
  assert.ok(READ_KINDS.includes('subclass'));
  assert.equal(KIND_NAMES.subclass, 'subclass'); assert.equal(KIND_NAMES.subclasses, 'subclass');
  for (const k of new Set(Object.values(KIND_NAMES))) assert.ok(READ_KINDS.includes(k), `${k} is read`);
  for (const name of ['subclass', 'subclasses']) {
    const r = read(OATH, { spells: [hb('ember-ward')] }); const q = readEntry(name, OATH, { spells: [hb('ember-ward')] });
    assert.equal(q.kind, 'subclass'); assert.deepEqual(q, r);
  }
  assert.notEqual(read(OATH).lines[0], 'The reader does not read subclasss yet; this kind of entry is not read.');
});

// ---------- the vocabulary and the reader's words ----------
test('every key of a subclass, a feature, an option, uses and a prerequisite has words in the reader, and the reader names no key the linter lacks', () => {
  assert.deepEqual(keysOf(SUBCLASS_FIELDS), keysOf(HOMEBREW_TYPES.subclasses));
  assert.deepEqual([...SUBCLASS_FEATURE_FIELDS].sort(), keysOf(HOMEBREW_TYPES.feature));
  assert.deepEqual([...SUBCLASS_OPTION_FIELDS].sort(), keysOf(HOMEBREW_TYPES.option));
  assert.deepEqual([...SUBCLASS_USES_FIELDS].sort(), keysOf(HOMEBREW_TYPES.featureUses));
  assert.deepEqual([...SUBCLASS_REQUIRES_FIELDS].sort(), keysOf(HOMEBREW_TYPES.requires));
  assert.deepEqual(keysOf(SUBCLASS_TIER_WORDS), [...TIERS].sort());
  assert.deepEqual(keysOf(SUBCLASS_RECHARGE_WORDS), ['long', 'short']);
  assert.deepEqual(keysOf(GRANT_WORDS), [...GRANTS].sort(), 'every grant a feature may hold has a sentence');
});

test('the golden subclasses use every key, tier, kind of uses and kind of prerequisite the linter allows', () => {
  const seen = { sub: new Set(), feat: new Set(), opt: new Set(), uses: new Set(), req: new Set(), tier: new Set(), grants: new Set(), recharge: new Set() };
  for (const e of subs()) {
    Object.keys(e).forEach((k) => seen.sub.add(k));
    for (const f of e.features) {
      Object.keys(f).forEach((k) => seen.feat.add(k)); seen.tier.add(f.tier);
      Object.keys(f.grants ?? {}).forEach((k) => seen.grants.add(k));
      const us = [f.uses, ...(f.options ?? []).map((o) => o.uses)].filter(Boolean);
      for (const u of us) { Object.keys(u).forEach((k) => seen.uses.add(k)); seen.recharge.add(typeof u.recharge === 'string' ? u.recharge : 'byLevel'); seen.recharge.add(typeof u.max === 'number' ? 'number' : 'amount'); }
      for (const o of f.options ?? []) { Object.keys(o).forEach((k) => seen.opt.add(k)); seen.tier.add(o.tier); Object.keys(o.requires ?? {}).forEach((k) => seen.req.add(k)); Object.keys(o.grants ?? {}).forEach((k) => seen.grants.add(k)); }
    }
  }
  // `dmNotes` is for the DM alone and is not read; every other key must be in a golden entry.
  for (const [seenSet, all, what] of [[seen.sub, keysOf(HOMEBREW_TYPES.subclasses), 'subclass'], [seen.feat, keysOf(HOMEBREW_TYPES.feature), 'feature'], [seen.opt, keysOf(HOMEBREW_TYPES.option), 'option'],
    [seen.uses, keysOf(HOMEBREW_TYPES.featureUses), 'uses'], [seen.req, keysOf(HOMEBREW_TYPES.requires), 'requires']]) {
    for (const k of all) if (k !== 'dmNotes') assert.ok(seenSet.has(k), `a golden ${what} has ${k}`);
  }
  assert.deepEqual([...seen.tier].sort(), [...TIERS].sort());
  assert.deepEqual([...seen.recharge].sort(), ['amount', 'byLevel', 'long', 'number', 'short']);
  for (const k of ['action', 'aura', 'modifiers', 'skills', 'freeCast']) assert.ok(seen.grants.has(k), `a golden subclass grants ${k}`);
});

// ---------- the golden readings ----------
test('the golden readings match reader-subclass-golden.txt', () => {
  const got = goldenText();
  if (process.env.READER_GOLDEN === 'update') { writeFileSync(GOLDEN, got); return; }
  assert.equal(got, readFileSync(GOLDEN, 'utf8'), 'the readings changed: if on purpose, regenerate (READER_GOLDEN=update) and read the diff');
});

test('a subclass is read as the spec says: title, spells by class level, each feature in level order, tiers, the numbers, not checked', () => {
  const r = read(OATH);
  assert.equal(r.kind, 'subclass'); assert.equal(r.title, 'Oath of the Ember'); assert.equal(r.tier, null, 'the entry has no tier of its own');
  assert.deepEqual(r.problems, []); assert.equal(r.refused, false); assert.deepEqual(r.refusals, []);
  assert.match(r.lines[0], /^"Oath of the Ember", a Paladin subclass\.$/);
  assert.match(r.lines.join('\n'), /Class level 3: "Burning Hands" and "Shield of Faith"\.\n.*Class level 5: "Ember Ward"|Class level 5: "hb-ember-folk-ember-ward"/);
  const heads = r.lines.filter((l) => /^Level \d+:/.test(l));
  assert.deepEqual(heads.map((l) => +/^Level (\d+)/.exec(l)[1]), [3, 7, 9, 15], 'in level order');
  assert.match(heads[0], /^Level 3: "Kindle" \(tier auto: the engine plays all of it\)\.$/);
  assert.match(heads[2], /"Cinder Step" \(tier assist: /);
  assert.match(heads[3], /"Ash Memory" \(tier manual: /);
  assert.match(r.lines.join('\n'), /It has 1 use, which all come back on a Long Rest\./);
  assert.match(r.lines.join('\n'), /It has 2 uses, which all come back on a Short Rest or a Long Rest\./);
  assert.match(r.lines.join('\n'), /It spends 1 use of the holder's feature "channel-divinity"\./);
  assert.match(r.lines.join('\n'), /The engine does not do this; the DM does this: "Once per Long Rest you may ask the DM one question about what the fire saw\."/);
  assert.ok(r.doesNot.some((x) => x.includes('Once per Long Rest you may ask the DM')), 'a manual feature\'s text is the DM\'s');
  assert.match(r.lines.join('\n'), /2 of 4 features are played entirely by the engine \(2 auto, 1 assist, 1 manual\)\./);
  assert.equal(r.lines.at(-2) === 'Not checked against any rulebook.' || r.lines.includes('Not checked against any rulebook.'), true);
  assert.ok(r.numbers.some((n) => n.at === 'features.0.level' && n.value === 3 && n.unit === 'class level'));
  assert.ok(r.numbers.some((n) => n.at === 'features.3.uses.max' && n.value === 1 && n.unit === 'uses'));
  assert.ok(r.numbers.some((n) => n.at === 'spells.5' && n.value === 5));
  assert.match(r.hash, /^[0-9a-f]{64}$/);
  assert.equal(read(structuredClone(OATH)).hash, r.hash, 'the same entry, the same hash');
  assert.notEqual(read({ ...OATH, name: 'Oath of Another Ember' }).hash, r.hash);
});

test('a feature level that is not one of the class\'s usual subclass levels is said, and allowed', () => {
  const t = text(BANNER);
  const usual = [...new Set(CONTENT.classes.fighter.subclass.features.map((f) => f.level))].sort((a, b) => a - b);
  assert.deepEqual(usual, [3, 7, 10, 15, 18]);
  assert.match(t, /"Steady Grip" comes in at class level 4\. The Fighter's own subclass features come in at class levels 3, 7, 10, 15 and 18, so this is not a level a Fighter subclass usually gives something at\. The engine allows it\./);
  assert.equal((t.match(/comes in at class level/g) ?? []).length, 1, 'only for the level that is not usual');
});

test('the Oath\'s level 9 is not a Paladin subclass level, and the reading says so once', () => {
  assert.equal((text(OATH).match(/comes in at class level 9/g) ?? []).length, 1);
});

test('a feature that hands a part to the DM is not called fully auto, in its heading and in the count', () => {
  const e = structuredClone(OATH);
  e.features[0].grants.action.effects.push({ manual: 'Kindle: the sparks gutter in rain.' });
  const r = read(e);
  assert.match(r.lines.find((l) => l.startsWith('Level 3:')), /\(tier auto, but the engine hands the parts listed for the DM to the DM\)/);
  assert.match(r.lines.join('\n'), /1 of 4 features is played entirely by the engine/);
  assert.ok(r.doesNot.some((x) => x.includes('the sparks gutter in rain')));
});

test('a feature with uses and no action is spent by hand and its text goes to the DM, as engine/features.js does', () => {
  const t = text(OATH);
  assert.equal((t.match(/Using it spends one use\. It has no action of its own, so the engine sends its text to the DM, who applies it\./g) ?? []).length, 2, 'Cinder Step and Ash Memory, and no other');
  // The engine: a feature with uses and no action spends the use and hands its text to the DM.
  const sheet = { name: 'Sir Ember', class: 'paladin', level: 3, subclass: 'devotion', abilities: { str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 14 }, skills: ['athletics', 'religion'], choices: { 'fighting-style': 'defense' }, armour: 'chain-mail', shield: true, weapons: ['longsword'] };
  const { record } = derive(sheet);
  const f = OATH.features[3];
  record.feats.push({ id: f.id, name: f.name, tier: f.tier, text: f.text, uses: { ...f.uses } });
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (id !== 'fighter' && id !== 'rogue') delete s.entities[id];
  s.entities.hero = makeEntity(record, { id: 'hero', kind: 'pc', side: 'party', pos: { q: 0, r: 0, z: 0 } });
  assert.equal(s.entities.hero.uses[f.id], 1);
  const r = apply(s, { type: 'feature', actor: 'hero', feature: f.id }, DM);
  assert.ok(r.ok, r.error);
  assert.equal(s.entities.hero.uses[f.id], 0, 'a use is spent');
  assert.ok(r.events.some((ev) => ev.type === 'manual' && String(ev.text).includes('Once per Long Rest')), 'its text goes to the DM');
  const again = apply(s, { type: 'feature', actor: 'hero', feature: f.id }, DM);
  assert.equal(again.ok, false, 'no use is left');
});

// ---------- recharge and short, as engine/rests.js and derive.js do ----------
test('what the reading says of the rest that brings uses back is what a Short Rest and a Long Rest do', () => {
  const sheet = { name: 'Sir Ember', class: 'paladin', level: 3, subclass: 'devotion', abilities: { str: 16, dex: 10, con: 14, int: 10, wis: 12, cha: 14 }, skills: ['athletics', 'religion'], choices: { 'fighting-style': 'defense' }, armour: 'chain-mail', shield: true, weapons: ['longsword'] };
  const cases = [
    { uses: { max: 2, recharge: 'short' }, afterShort: 2, afterLong: 2, say: /which all come back on a Short Rest or a Long Rest/ },
    { uses: { max: 3, recharge: 'long' }, afterShort: 0, afterLong: 3, say: /which all come back on a Long Rest\./ },
    { uses: { max: 3, recharge: 'long', short: 1 }, afterShort: 1, afterLong: 3, say: /Where they come back on a Long Rest, 1 of them also comes back on a Short Rest\./ },
  ];
  for (const c of cases) {
    const e = structuredClone(OATH);
    e.features = [{ ...e.features[3], uses: c.uses }];
    e.spells = undefined;
    assert.match(text(e), c.say, JSON.stringify(c.uses));
    const { record } = derive(sheet);
    record.feats.push({ id: e.features[0].id, name: 'X', tier: 'manual', text: 'x', uses: { ...c.uses } });
    const s = newGame(7);
    for (const id of Object.keys(s.entities)) if (id !== 'fighter' && id !== 'rogue') delete s.entities[id];
    s.entities.hero = makeEntity(record, { id: 'hero', kind: 'pc', side: 'party', pos: { q: 0, r: 0, z: 0 } });
    const id = e.features[0].id;
    s.entities.hero.uses[id] = 0;
    assert.ok(apply(s, { type: 'shortRest', ids: ['hero'] }, DM).ok);
    assert.equal(s.entities.hero.uses[id], c.afterShort, `after a Short Rest ${JSON.stringify(c.uses)}`);
    s.entities.hero.uses[id] = 0;
    assert.ok(apply(s, { type: 'rest', ids: ['hero'] }, DM).ok);
    assert.equal(s.entities.hero.uses[id], c.afterLong, `after a Long Rest ${JSON.stringify(c.uses)}`);
  }
});

// ---------- grants are said as a feat's are ----------
test('a feature\'s grants are said with the same sentences as the same grants in a feat', () => {
  for (const [e, i] of [[OATH, 0], [OATH, 1], [LANTERN, 0], [LANTERN, 1]]) {
    const g = e.features[i].grants;
    const asFeat = readEntry('feat', { id: hb('probe'), name: 'Probe', source: SRC, category: 'general', tier: 'auto', checked: false, text: 'x', grants: g }, { strict: false });
    const from = asFeat.lines.findIndex((l) => l.startsWith('The feat gives its holder')) + 1;
    const featLines = asFeat.lines.slice(from, asFeat.lines.findIndex((l) => /^Tier:/.test(l)));
    const own = read(e).lines;
    const start = own.findIndex((l) => l.startsWith(`Level ${e.features[i].level}: "${e.features[i].name}"`));
    for (const l of featLines.filter((x) => !/A feat or an item belongs to no class/.test(x))) assert.ok(own.slice(start).includes(l), `${e.features[i].name}: "${l}" is said as a feat says it`);
  }
});

test('the grants only a class feature can give are not said to do nothing', () => {
  const e = structuredClone(OATH);
  e.features = [{ id: hb('z'), name: 'Z', level: 3, tier: 'auto', checked: false, text: 'z', grants: { spells: ['bless'], cantrips: 1, spellLists: ['cleric'], attune: 4 } }];
  e.spells = undefined;
  const r = read(e);
  assert.doesNotMatch(r.lines.join('\n'), /belongs to no class|a feat or an item changes nothing/);
  assert.deepEqual(r.doesNot, [], 'nothing is handed over: the engine does these for a class feature');
});

// ---------- options and pick ----------
test('options: one choice, or a list picked; a prerequisite is checked by the engine only for a list', () => {
  const t = text(LANTERN);
  assert.match(t, /The player chooses up to 2 different options of 3\./);
  assert.match(t, /Needs class level 15\. A sheet that picks it without that is refused\./);
  assert.match(t, /Needs the option "Slow Wick" chosen with it and the spell "Produce Flame" among the spells the class knows\. A sheet that picks it without that is refused\./);
  const one = text(BANNER);
  assert.match(one, /The player chooses one of 3 options; a sheet that does not choose is refused\./);
  assert.match(one, /It is the feat "Archery": the character gets what that feat grants\./);
  const single = structuredClone(LANTERN); delete single.features[3].pick;
  const t2 = text(single);
  assert.match(t2, /The engine checks this only for a feature whose player picks a list, so for a single choice the DM sees to it\./);
  assert.ok(read(single).doesNot.some((x) => /prerequisite/.test(x)));
  // And so the engine does for a list of options (an SRD feature that picks a list, the Warlock's Eldritch Invocations): one whose prerequisite is not met is refused.
  const lock = (inv) => ({ name: 'Wick', class: 'warlock', level: 3, subclass: 'fiend', abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 16 }, skills: ['arcana', 'deception'], choices: { 'eldritch-invocations': inv, 'pact-magic': undefined },
    spells: ['eldritch-blast', 'chill-touch', 'hex', 'burning-hands'] });
  assert.ok(validate(lock(['ascendant-step'])).some((x) => /needs Warlock level 5/.test(x)), 'a level 5 option at level 3 is refused');
  assert.ok(!validate(lock(['devils-sight'])).some((x) => /needs /.test(x)), 'a level 2 option at level 3 is not');
  const col = structuredClone(LANTERN); col.features[3].pick = { column: 'bardic-die' };
  assert.match(text(col, { strict: false }), /as many different options of 3 as the column "bardic-die" of the class table gives/);
});

// ---------- spells ----------
test('spells: by class level, with names; for a class with no Spellcasting the engine prepares none, and the reading says so', () => {
  const t = text(LANTERN);
  assert.match(t, /Class level 3: "Faerie Fire"\./);
  assert.match(t, /Class level 5: "Light"\./);
  assert.match(t, /do not count against the number the class prepares; a spell the table does not have is left out/);
  const fighter = structuredClone(BANNER); fighter.spells = { 3: ['bless'] };
  const r = read(fighter, { strict: false });
  assert.match(r.lines.join('\n'), /The Fighter has no Spellcasting, so the engine never prepares these spells\./);
  assert.ok(r.doesNot.some((x) => /the class has no Spellcasting/.test(x)));
  assert.match(text(BANNER), /It names no spells the class always has prepared\./);
});

// ---------- strict mode ----------
test('an entry strict mode would refuse is read, with the refusal said first', () => {
  const bad = structuredClone(OATH); bad.features[0].id = 'channel-divinity';
  const r = read(bad);
  assert.equal(r.refused, true);
  assert.match(r.lines[0], /^REFUSED: /);
  assert.ok(r.refusals.length && r.refusals.some((x) => /a feature id is "hb-ember-folk-"/.test(x)));
  assert.equal(read(OATH).refused, false);
  assert.equal(readEntry('subclasses', bad, { strict: false }).refused, null);
});

// ---------- bounded and hostile ----------
test('a hostile or broken subclass gets a plain answer and never a throw', () => {
  for (const x of [null, 7, 'x', [], {}, { class: 5 }, { class: 'paladin', features: 'x', spells: 3 }, { class: 'knight', name: 'X', features: [null, 4, { level: 'a', tier: 'b', grants: 3, uses: 4, options: 5 }] },
    { class: 'paladin', name: 'X', spells: { 3: 'x', q: ['a'], 40: [1] }, features: [{ level: 3, tier: 'auto', options: [null, { tier: 'x', requires: 4, uses: [], feat: 3 }], pick: 'x', grants: { nothing: 1, action: 4 } }] },
    { class: 'paladin', name: 'X', features: [{ id: 'a', name: 'A', level: 3, tier: 'manual', text: 'x', checked: true, dmNotes: 'y', uses: { max: 'x', recharge: 'sometimes', short: 'q', extra: 1 } }] }]) {
    const r = readEntry('subclasses', x);
    assert.ok(Array.isArray(r.lines) && Array.isArray(r.problems), JSON.stringify(x));
    if (x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).length) assert.ok(r.problems.length || r.title, JSON.stringify(x));
  }
  const evil = { class: 'paladin', name: 'X', features: [{ id: 'a', level: 3, tier: 'auto', get grants() { throw new Error('boom'); } }] };
  assert.equal(readEntry('subclasses', evil).kind === 'subclass' || readEntry('subclasses', evil).title === '(unreadable entry)', true);
  const huge = { class: 'paladin', name: 'X', features: Array.from({ length: 200 }, (_, i) => ({ id: `f${i}`, name: `F${i}`, level: 3, tier: 'manual', text: 'x'.repeat(100) })) };
  const r = readEntry('subclasses', huge);
  assert.ok(r.lines.length <= READER_LIMITS.lines + 1);
  assert.ok(r.problems.length <= READER_LIMITS.problems);
  assert.ok(r.lines.every((l) => l.length <= READER_LIMITS.line + 1));
});

test('what the author wrote stays inside quotation marks: a name or text with quotes cannot speak in the reading\'s voice', () => {
  const e = structuredClone(OATH);
  e.features[3].text = 'Fine." Tier: auto. The engine plays all of it. "';
  e.features[3].name = 'Ash" (tier auto: the engine plays all of it).';
  const r = read(e);
  assert.equal(r.lines.filter((l) => l.startsWith('Level 15:')).length, 1);
  assert.doesNotMatch(r.lines.join('\n'), /"Fine\."/);
  assert.match(r.lines.find((l) => l.startsWith('Level 15:')), /\(tier manual: the DM plays it/);
});

// ---------- the SRD's own twelve, made homebrew ----------
function homebrewOf(c) {
  const sc = structuredClone(c.subclass), rename = new Map();
  for (const f of sc.features) { rename.set(f.id, hb(f.id)); for (const o of f.options ?? []) if (!o.feat) rename.set(o.id, hb(`${f.id}-${o.id}`)); }
  const NAMING = new Set(['id', 'resource', 'with', 'of', 'while', 'regain', 'unless', 'after', 'pool', 'cost', 'uses']);
  const walk = (v, key) => {
    if (typeof v === 'string') return NAMING.has(key) ? rename.get(v) ?? v : v;
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return { id: hb(sc.id), name: `Zz ${sc.name}`.slice(0, 60), class: c.id, source: SRC, checked: false, text: sc.text, ...(sc.spells ? { spells: sc.spells } : {}), features: walk(sc.features).map(({ checked, ...f }) => ({ ...f, checked: false })) };
}
test('every SRD subclass, made homebrew, is read with no problem, every feature once, and tiers that add up', () => {
  for (const c of Object.values(CONTENT.classes)) {
    const e = homebrewOf(c);
    const r = read(e, {});
    assert.deepEqual(r.problems, [], c.id);
    assert.equal(r.refused, false, `${c.id}: ${r.refusals.join('; ')}`);
    const heads = r.lines.filter((l) => /^Level \d+: /.test(l));
    assert.equal(heads.length, e.features.length, c.id);
    for (const f of e.features) assert.ok(heads.some((l) => l.includes(`"${f.name}"`)), `${c.id}: ${f.name}`);
    const counted = /(\d+) of (\d+) features? (?:is|are) played entirely by the engine \((\d+) auto, (\d+) assist, (\d+) manual\)/.exec(r.lines.join('\n'));
    assert.ok(counted, c.id);
    assert.equal(+counted[2], e.features.length);
    assert.equal(+counted[3] + +counted[4] + +counted[5], e.features.length);
    for (const t of TIERS) assert.equal(+counted[3 + TIERS.indexOf(t)], e.features.filter((f) => f.tier === t).length, `${c.id} ${t}`);
    // A manual feature's own words are the DM's.
    for (const f of e.features.filter((x) => x.tier === 'manual')) assert.ok(r.doesNot.some((x) => x.includes(f.name.slice(0, 20))), `${c.id}: ${f.name} is the DM's`);
    // The SRD's own subclass levels are the usual ones: nothing is flagged.
    assert.doesNotMatch(r.lines.join('\n'), /comes in at class level/, c.id);
    // Every number the reading records is a number in the entry.
    for (const n of r.numbers) assert.ok(typeof n.value === 'number' || typeof n.value === 'string', `${c.id}: ${n.at}`);
  }
});
