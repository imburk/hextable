// The plain-language reader for spells (docs/specs/homebrew.md, Decision 6, row H3, task B3).
// Golden text: packages/rules/test/reader-golden.txt. After a deliberate change to a sentence, regenerate it with
//   READER_GOLDEN=update node --test packages/rules/test/reader.test.js
// and read the diff: every changed line is a changed reading the DM would approve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CONTENT } from '../src/content/index.js';
import {
  ABILITIES, AREA_SHAPES, BRANCHES, CAST_TIMES, CHOICES, CONDITIONS, HOOKS, OPS, REACTION_TRIGGERS, REMAINS, SPELL_KINDS, STEPS, SUMMON_ENDS, SUMMON_KINDS,
  SUMMON_ONE, SUMMON_TURNS, TAGS, TIERS,
} from '../src/content/schema.js';
import {
  ABILITY_WORDS, AREA_PLACE, AREA_WORDS, CAST_TIME_WORDS, CHOICE_WORDS, ENDS_ON, HOOK_WORDS, KIND_WORDS, OP_WORDS, READER_LIMITS, REACTION_WORDS, REMAINS_WORDS,
  STEP_SENTENCES, SUMMON_END_WORDS, SUMMON_KIND_WORDS, SUMMON_ONE_WORDS, SUMMON_TURN_WORDS, TAG_WORDS, TIER_WORDS, ZONE_ON_WORDS, JUDGED_ADVANTAGE_IF, JUDGED_ON, JUDGED_SOMETIMES, JUDGED_STEP_AFTER_ATTACK, readEntry as readStrictly, sha256,
} from '../src/content/reader.js';
// The invented spells below have ids and sources of their own, not a pack's: this file tries the reader's sentences, not strict mode's (reader-refused.test.js).
const readEntry = (kind, entry, ctx = {}) => readStrictly(kind, entry, { strict: false, ...ctx });

const GOLDEN = new URL('./reader-golden.txt', import.meta.url);
const spells = Object.values(CONTENT.spells);
const keysOf = (o) => Object.keys(o).sort();

// ---------- invented spells, written for this project, that together use every word the vocabulary has ----------
const base = (id, name, o) => ({ id: `hb-test-${id}`, name, source: 'homebrew: test', level: 1, school: 'evocation', classes: ['wizard'], time: 'action', range: 60,
  components: ['v', 's'], duration: 'instant', concentration: false, ritual: false, tier: 'auto', checked: false, text: `${name}, invented for the reader's tests.`, ...o });
export const EMBER_BURST = base('ember-burst', 'Ember Burst', { level: 3, range: 150, components: ['v', 's', 'm'], target: { area: { shape: 'sphere', size: 20 } },
  effects: [{ save: 'dex', half: true, onFail: [{ damage: '8d6', type: 'fire' }] }], higher: { slot: { damage: '1d6' } } });
export const WOLFSONG = base('wolfsong', 'Wolfsong', { level: 2, school: 'conjuration', range: 'self', duration: '1 hour', concentration: true, target: { self: true },
  effects: [{ manual: 'Summons three wolves that fight for you and obey spoken commands.' }], tier: 'manual' });
const FIXTURES = [
  EMBER_BURST,
  WOLFSONG,
  base('frost-lance', 'Frost Lance', { level: 0, range: 120, target: { creature: {} }, tier: 'assist',
    effects: [{ attack: 'ranged', kind: 'spell', onHit: [{ damage: '1d10', type: 'cold' }, { condition: 'prone' }, { move: 10, dir: 'away' }], onMiss: [{ manual: 'Frost coats the ground where it struck.' }] }],
    higher: { level: { 5: '2d10', 11: '3d10', 17: '4d10' } } }),
  base('grave-snap', 'Grave Snap', { range: 'touch', target: { creature: { count: 1 } },
    effects: [{ attack: 'melee', kind: 'weapon', bonus: 5, onHit: [{ damage: '2d6+3', type: 'necrotic', times: 2, onZero: [{ kill: true }], onKill: [{ remains: 'dust' }] },
      { damage: '1d6', type: 'poison', when: ['target.prone'] }] }] }),
  base('binding-chant', 'Binding Chant', { level: 2, school: 'enchantment', duration: '1 minute', concentration: true, target: { creature: { count: 2, within: 10 } },
    effects: [{ save: 'wis', dc: 14, advantageIf: ['target.fought'], onFail: [
      { condition: 'frightened', ends: { on: 'save', save: 'wis', at: 'damaged', orDamaged: true } },
      { condition: 'charmed', ends: { on: 'damaged', by: 'source' } },
      { condition: 'restrained', ends: { on: 'save', save: 'str', at: 'turnStart' } },
      { condition: 'blinded', ends: { on: 'save', save: 'con', at: 'turnEnd' } }],
    onSuccess: [{ modifier: { on: 'attack.roll', op: 'disadvantage' }, ends: { on: 'turnEnd', of: 'source' } }] }],
    higher: { slot: { targets: 1 } } }),
  base('quick-curse', 'Quick Curse', { target: { creature: {} }, effects: [{ condition: 'poisoned' }, { modifier: { on: 'ac', op: 'add', value: -2 } }, { condition: 'deafened', ends: { on: 'damaged' } }] }),
  base('dull-curse', 'Dull Curse', { target: { creature: {} }, effects: [{ modifier: { on: 'ac', op: 'add', value: -1 } }, { condition: 'deafened' }] }),
  base('stinging-mark', 'Stinging Mark', { target: { creature: {} },
    effects: [{ condition: 'grappled', ends: { on: 'turnEnd' } }, { condition: 'stunned' }, { modifier: { on: 'speed', op: 'set', value: 0 } }] }),
  // One modifier for every hook, and one for every op.
  base('many-blessings', 'Many Blessings', { level: 4, school: 'abjuration', duration: '10 minutes', concentration: true, target: { self: true }, choice: { of: 'skill', from: ['stealth', 'arcana'] },
    effects: [
      { modifier: { on: 'check', op: 'add', value: '1d4', scope: { skill: 'chosen' } } },
      { modifier: { on: 'check', op: 'advantage', scope: { skill: 'athletics' } } },
      { modifier: { on: 'check', op: 'floor', value: 10, when: ['check.proficient'] } },
      // The reader reads the whole vocabulary: a spell may not carry `proficient` (only a modifier step of a subclass feature's action may; homebrew-subclass-proficient.test.js), but its reading is held here.
      { modifier: { on: 'check', op: 'proficient', scope: { skill: 'chosen' } } }, { modifier: { on: 'check', op: 'proficient', scope: { tool: 'thieves-tools' } } },
      { modifier: { on: 'check', op: 'advantage', when: ['check.escape'] } },
      { modifier: { on: 'attack.roll', op: 'disadvantage', when: ['target.notGrappler'] } }, { modifier: { on: 'attack.roll', op: 'advantage', when: ['target.grappledBySelf'] } },
      { modifier: { on: 'save', op: 'add', value: 1, scope: { ability: 'wis' } } },
      { modifier: { on: 'save', op: 'advantage', scope: { condition: 'poisoned' } } },
      { modifier: { on: 'attack.roll', op: 'add', value: 2, when: ['melee', 'within5', 'attack.weapon', 'attack.weaponOrUnarmed', 'attack.str'] } },
      { modifier: { on: 'attack.received', op: 'disadvantage', when: ['ranged', 'beyond5', 'long.range'] } },
      { modifier: { on: 'attack.received', op: 'crit', when: ['target.prone', 'target.unconscious'] } },
      { modifier: { on: 'damage.dealt', op: 'add', value: '1d6', types: ['radiant'], once: 'turn', when: ['attack.hit', 'spell.cantrip', 'attack.spell'] } },
      { modifier: { on: 'damage.dealt', op: 'add', value: 2, spell: 'fire-bolt' } },
      { modifier: { on: 'damage.taken', op: 'resist', types: ['fire', 'cold'] } },
      { modifier: { on: 'damage.taken', op: 'vulnerable', types: ['thunder'] } },
      { modifier: { on: 'damage.taken', op: 'immune', types: ['poison'] } },
      { modifier: { on: 'damage.taken', op: 'add', value: -3, once: 'turn' } },
      { modifier: { on: 'ac', op: 'min', value: 16 } },
      { modifier: { on: 'ac', op: 'max', value: 20, when: ['target.halfCover', 'target.threeQuartersCover'] } },
      { modifier: { on: 'speed', op: 'add', value: 10 } },
      { modifier: { on: 'initiative', op: 'advantage' } },
      { modifier: { on: 'save.str', op: 'autoFail' } }, { modifier: { on: 'save.dex', op: 'autoSucceed' } }, { modifier: { on: 'save.con', op: 'disadvantage' } },
      { modifier: { on: 'save.int', op: 'add', value: { perLevel: -1 } } }, { modifier: { on: 'save.wis', op: 'advantage', uses: 1 } }, { modifier: { on: 'save.cha', op: 'advantage', stack: false } },
      { modifier: { on: 'save.death', op: 'advantage' } }, { modifier: { on: 'concentration', op: 'advantage', when: ['self.notIncapacitated'] } },
      { modifier: { on: 'spell.dc', op: 'add', value: 1 } }, { modifier: { on: 'spell.attack', op: 'add', value: 1 } }, { modifier: { on: 'hp.max', op: 'add', value: 5 } },
      { modifier: { on: 'carry', op: 'set', value: 2 } }, { modifier: { on: 'speed.fly', op: 'set', value: 30 } },
      { modifier: { on: 'd20', op: 'add', value: '1d6', onFail: true, cost: 'bardic-inspiration' } },
      { modifier: { on: 'opportunity', op: 'autoFail' } },
      { modifier: { on: 'attack.received', op: 'advantage', except: 'source', when: ['attack.advantage', 'attack.disadvantage', 'attacker.unseen', 'target.unseen', 'ally.adjacentToTarget', 'enemy.adjacent', 'target.seesSource', 'attack.opportunity', 'target.notFiend'] } },
    ] }),
  base('hunters-sting', 'Hunter\'s Sting', { level: 1, school: 'divination', duration: '1 hour', concentration: true, time: 'bonus', range: 90, target: { creature: {} },
    effects: [{ modifier: { on: 'damage.dealt', op: 'add', value: '1d6', types: ['chosen'], against: 'target' }, to: 'caster' }, { reveal: 'target' }],
    choice: { of: 'damageType' }, higher: { slot: { value: 1 } } }),
  base('shifting-step', 'Shifting Step', { level: 4, school: 'conjuration', range: 500, target: { self: true },
    effects: [{ teleport: 500, see: true, blocked: [{ damage: '4d6', type: 'force' }, { endConcentration: true }] }] }),
  base('mending-light', 'Mending Light', { school: 'abjuration', range: 'touch', target: { creature: {} }, choice: { of: 'condition', from: ['blinded', 'deafened'] },
    effects: [{ heal: '2d8', addMod: true, atLeast: 1 }, { tempHp: '1d4+4', atLeast: 2 }, { cure: ['poisoned', 'chosen'] }], higher: { slot: { heal: '1d6', tempHp: '1d4' } } }),
  base('gravity-well', 'Gravity Well', { level: 5, school: 'transmutation', duration: '1 minute', target: { area: { shape: 'cube', size: 10 } }, tier: 'assist',
    effects: [{ fall: 20 }, { fall: 5 }, { fall: 'surface' }, { move: 10, dir: 'toward', largest: 'large' }, { set: 'open' }, { reveal: 'self' }, { resource: 'x' }, { counter: 'spell' }],
    terrain: { difficult: true, obscured: 'heavy' } }),
  base('hail-burst', 'Hail Burst', { level: 4, range: 300, target: { area: { shape: 'cylinder', size: 20, height: 40 } }, terrain: { difficult: true, lasts: 'nextTurnEnd' },
    effects: [{ save: 'dex', half: true, onFail: [{ damage: '2d10', type: 'bludgeoning' }, { damage: '4d6', type: 'cold' }] }], higher: { slot: { damage: '1d10' } } }),
  base('wide-shapes', 'Wide Shapes', { range: 'self', target: { area: { shape: 'cone', size: 15, exceptCaster: true } }, effects: [{ damage: '3d6', type: 'thunder', times: 3 }] }),
  base('long-shapes', 'Long Shapes', { range: 'self', target: { area: { shape: 'line', size: 100, width: 10, choose: 3 } }, effects: [{ damage: '6d6', type: 'lightning' }],
    higher: { slot: { damage: '1d8', times: 1 } } }),
  base('far-line', 'Far Line', { range: 90, target: { area: { shape: 'line', size: 60 } }, effects: [{ damage: '2d6', type: 'acid' }] }),
  base('ten-cubes', 'Ten Cubes', { level: 7, range: 150, target: { area: { shape: 'cube', size: 10, count: 10 } }, effects: [{ save: 'dex', half: true, onFail: [{ damage: '7d10', type: 'fire' }] }] }),
  base('self-cube', 'Self Cube', { range: 'self', target: { area: { shape: 'cube', size: 15, types: ['undead', 'fiend'] } }, effects: [{ damage: '2d8', type: 'radiant' }] }),
  base('guarding-ring', 'Guarding Ring', { level: 3, range: 'self', duration: '10 minutes', concentration: true, target: { area: { shape: 'emanation', size: 10 } },
    zone: { on: ['turnStart', 'enter'], atCast: true, spare: true, once: 'turn' }, effects: [{ save: 'con', onFail: [{ damage: '2d8', type: 'psychic' }], onSuccess: [{ condition: 'incapacitated', ends: { on: 'turnEnd' } }] }] }),
  base('turning-ring', 'Turning Ring', { level: 3, range: 'self', duration: '10 minutes', concentration: true, target: { area: { shape: 'emanation', size: 10, types: ['undead'] } },
    zone: { on: ['enter'] }, effects: [{ save: 'wis', onFail: [{ damage: '2d8', type: 'radiant' }] }] }),
  base('mire', 'Mire', { level: 2, range: 120, duration: '1 hour', target: { area: { shape: 'sphere', size: 15 } }, zone: { on: ['turnEnd'] }, terrain: { obscured: 'light' },
    effects: [{ save: 'str', half: true, onFail: [{ damage: '1d6', type: 'acid' }, { condition: 'restrained' }], onSuccess: [{ condition: 'prone' }] }] }),
  base('hardy-shield', 'Hardy Shield', { time: 'reaction', range: 'self', duration: '1 round', target: { self: true }, reaction: { on: 'hit', blocks: ['magic-missile', 'hb-test-unknown'] },
    effects: [{ modifier: { on: 'ac', op: 'add', value: 5 }, ends: { on: 'turnStart' } }] }),
  base('rebuke', 'Rebuke', { time: 'reaction', target: { creature: {} }, reaction: { on: 'damaged' }, effects: [{ save: 'dex', half: true, onFail: [{ damage: '2d10', type: 'fire' }] }, { condition: 'invisible' }] }),
  base('unmake', 'Unmake', { level: 3, school: 'abjuration', time: 'reaction', target: { creature: {} }, reaction: { on: 'cast' }, effects: [{ counter: 'spell' }] }),
  base('loose-reaction', 'Loose Reaction', { time: 'reaction', target: { self: true }, effects: [{ tempHp: '2d4' }] }),
  base('call-beast', 'Call Beast', { level: 2, school: 'conjuration', range: 30, duration: '1 hour', concentration: true, target: { self: true },
    effects: [{ summon: 'form', forms: ['wolf', 'hb-test-hound'], types: ['beast', 'fey'], one: 'reform', over: { speed: { walk: 60, fly: 30 } },
      bond: { kind: 'familiar', turn: 'own', at0: 'vanish', ends: ['masterDies', 'longRest'], leash: 100, noAttack: true } }] }),
  base('raise-bones', 'Raise Bones', { level: 3, school: 'necromancy', range: 10, time: 'minute', target: { self: true },
    effects: [{ summon: 'zombie', on: 'corpse', count: { slot: 2, base: 1, above: 3 }, reassert: 4, bond: { kind: 'undead', turn: 'after', orders: 'command', range: 60, at0: 'dies' } }] }),
  base('steed-call', 'Steed Call', { level: 2, school: 'conjuration', range: 30, duration: 'until dispelled', time: '10 minutes', ritual: true, target: { self: true },
    effects: [{ summon: 'form', forms: { type: 'beast', cr: 0.5 }, variants: ['swift', 'sturdy'], one: 'replace', bond: { kind: 'steed', turn: 'after', at0: 'vanish', mount: 'controlled' } }] }),
  base('strange-hours', 'Strange Hours', { school: 'illusion', duration: 'special', time: '8 hours', concentration: true, range: 'self', target: { self: true }, tier: 'assist',
    effects: [{ save: 'int', half: true, onSuccess: [{ manual: 'The DM decides what the dreamer sees.' }] }, { modifier: { on: 'check', op: 'add', value: 2, scope: { ability: 'chosen' } } }],
    choice: { of: 'ability' }, kinds: ['utility'] }),
  base('mixed-dice', 'Mixed Dice', { target: { creature: {} }, effects: [{ damage: '2d6', type: 'chosen' }, { heal: '1d4+2' }], choice: { of: 'damageType' }, higher: { slot: { damage: '1d8', heal: '1d4' }, level: { 5: '3d6' } } }),
  base('dawn-roar', 'Dawn Roar', { level: 9, time: '24 hours', duration: '30 days', target: { creature: { count: 3, repeat: true } }, costly: true, components: ['v', 's', 'm'],
    effects: [{ damage: '4d4', type: 'slashing', onZero: [{ remains: 'frozen-statue' }] }, { damage: '+2', type: 'piercing' }], higher: { targets: { 5: 4, 11: 5 } } }),
  base('stray-hour', 'Stray Hour', { time: 'hour', duration: '12 hours', target: { self: true }, effects: [{ tempHp: '10' }] }),
  base('long-casts', 'Long Casts', { time: '12 hours', duration: '7 days', target: { self: true }, effects: [{ heal: '1d4' }] }),
];

const readingOf = (e) => { const r = readEntry('spell', e); return [`== ${e.id}`, ...r.lines, ...r.doesNot.map((x) => `DM: ${x}`), ...r.problems.map((x) => `PROBLEM: ${x}`), ''].join('\n'); };
const goldenText = () => FIXTURES.map(readingOf).join('\n');

// ---------- the vocabulary and the reader's words ----------
test('every word the vocabulary has has a sentence in the reader', () => {
  assert.deepEqual(keysOf(STEP_SENTENCES), [...STEPS].sort(), 'a step kind with no sentence (or a sentence for no step)');
  assert.deepEqual(keysOf(AREA_WORDS), [...AREA_SHAPES].sort());
  assert.deepEqual(keysOf(AREA_PLACE), [...AREA_SHAPES].sort());
  assert.deepEqual(keysOf(HOOK_WORDS), [...HOOKS].sort());
  assert.deepEqual(keysOf(OP_WORDS), [...OPS].sort());
  assert.deepEqual(keysOf(TAG_WORDS), [...TAGS].sort());
  assert.deepEqual(keysOf(REMAINS_WORDS), [...REMAINS].sort());
  assert.deepEqual(keysOf(REACTION_WORDS), [...REACTION_TRIGGERS].sort());
  assert.deepEqual(keysOf(CAST_TIME_WORDS), [...CAST_TIMES].sort());
  assert.deepEqual(keysOf(ABILITY_WORDS), [...ABILITIES].sort());
  assert.deepEqual(keysOf(CHOICE_WORDS), keysOf(CHOICES));
  assert.deepEqual(keysOf(KIND_WORDS), [...SPELL_KINDS].sort());
  assert.deepEqual(keysOf(TIER_WORDS), [...TIERS].sort());
  assert.deepEqual(keysOf(SUMMON_KIND_WORDS), [...SUMMON_KINDS].sort());
  assert.deepEqual(keysOf(SUMMON_TURN_WORDS), [...SUMMON_TURNS].sort());
  assert.deepEqual(keysOf(SUMMON_END_WORDS), [...SUMMON_ENDS].sort());
  assert.deepEqual(keysOf(SUMMON_ONE_WORDS), [...SUMMON_ONE].sort());
  for (const c of CONDITIONS) assert.equal(typeof CONTENT.conditions[c]?.name, 'string', `condition ${c} has a name`);
  // The lists schema.js keeps inline: the reader's copies must match what lintSteps and lintZone accept.
  const schema = readFileSync(new URL('../src/content/schema.js', import.meta.url), 'utf8');
  assert.match(schema, new RegExp(`\\[${ENDS_ON.map((x) => `'${x}'`).join(', ')}\\]\\.includes\\(ends\\?\\.on\\)`), 'ends.on in lintSteps');
  assert.match(schema, new RegExp(`\\[${Object.keys(ZONE_ON_WORDS).map((x) => `'${x}'`).join(', ')}\\]\\.includes\\(x\\)`), 'zone.on in lintZone');
});

test('each branch is read under exactly the step kinds that run it (effects.js exec)', () => {
  const src = readFileSync(new URL('../src/effects.js', import.meta.url), 'utf8');
  for (const b of BRANCHES) assert.ok(src.includes(`'${b}'`), `effects.js runs ${b}`);
  for (const b of BRANCHES) {
    const e = base('branch', 'Branch', { target: { creature: {} }, effects: [{ [b === 'onHit' || b === 'onMiss' ? 'attack' : b === 'onFail' || b === 'onSuccess' ? 'save' : b === 'blocked' ? 'teleport' : 'damage']: b === 'onHit' || b === 'onMiss' ? 'melee' : b === 'onFail' || b === 'onSuccess' ? 'dex' : b === 'blocked' ? 30 : '1d6', kind: 'spell', type: 'fire', [b]: [{ damage: '1d4', type: 'cold' }] }] });
    const r = readEntry('spell', e);
    assert.ok(r.lines.some((l) => /^ {2}It takes 1d4 cold damage/.test(l) || /^ {2}The caster takes 1d4 cold damage/.test(l)), `branch ${b} is read: ${r.lines.join(' | ')}`);
  }
});

test('every tag the reader says the engine can judge somewhere has a case in modifiers.js (reader-when.test.js plays each, in each place)', () => {
  const src = readFileSync(new URL('../src/modifiers.js', import.meta.url), 'utf8');
  const somewhere = new Set([...JUDGED_STEP_AFTER_ATTACK, ...JUDGED_ADVANTAGE_IF, ...Object.values(JUDGED_ON).flat(), ...Object.values(JUDGED_SOMETIMES).flat()]);
  for (const t of somewhere) assert.ok(src.includes(`case '${t}'`), `modifiers.js judges ${t}`);
  assert.deepEqual(TAGS.filter((t) => !somewhere.has(t)).sort(), ['long.range', 'target.halfCover', 'target.seesSource', 'target.threeQuartersCover'], 'the tags no place can judge');
});

test('the golden readings use every step, branch, shape, hook, op, tag and condition ending', () => {
  const used = { steps: new Set(), branches: new Set(), shapes: new Set(), hooks: new Set(), ops: new Set(), tags: new Set(), ends: new Set(), zone: new Set(), times: new Set() };
  const go = (steps) => { for (const st of steps) {
    used.steps.add(STEPS.find((k) => k in st));
    if (st.modifier) { used.hooks.add(st.modifier.on); used.ops.add(st.modifier.op); for (const t of st.modifier.when ?? []) used.tags.add(t); }
    for (const t of [...(st.when ?? []), ...(st.advantageIf ?? [])]) used.tags.add(t);
    if (st.ends) used.ends.add(st.ends.on);
    for (const b of BRANCHES) if (st[b]) { used.branches.add(b); go(st[b]); }
  } };
  for (const f of FIXTURES) { go(f.effects); if (f.target.area) used.shapes.add(f.target.area.shape); for (const z of f.zone?.on ?? []) used.zone.add(z); used.times.add(f.time); }
  assert.deepEqual([...used.steps].sort(), [...STEPS].sort());
  assert.deepEqual([...used.branches].sort(), [...BRANCHES].sort());
  assert.deepEqual([...used.shapes].sort(), [...AREA_SHAPES].sort());
  assert.deepEqual([...used.hooks].sort(), [...HOOKS].sort());
  assert.deepEqual([...used.ops].sort(), [...OPS].sort());
  assert.deepEqual([...used.tags].sort(), [...TAGS].sort());
  assert.deepEqual([...used.ends].sort(), [...ENDS_ON].sort());
  assert.deepEqual([...used.zone].sort(), keysOf(ZONE_ON_WORDS));
  assert.deepEqual([...used.times].sort(), [...CAST_TIMES].sort());
});

test('the golden readings match reader-golden.txt', () => {
  const text = goldenText();
  if (process.env.READER_GOLDEN === 'update') writeFileSync(GOLDEN, text);
  assert.equal(text, readFileSync(GOLDEN, 'utf8'), 'a reading changed: if on purpose, regenerate with READER_GOLDEN=update and read the diff');
});

test('a changed template changes the golden text', () => {
  const before = goldenText(), was = HOOK_WORDS.ac;
  try { HOOK_WORDS.ac = 'Armour Class (changed)'; assert.notEqual(goldenText(), before); } finally { HOOK_WORDS.ac = was; }
  assert.equal(goldenText(), before);
});

// ---------- Decision 6's two examples ----------
test('Ember Burst reads as Decision 6 says', () => {
  const r = readEntry('spell', EMBER_BURST);
  const want = ['"Ember Burst" (level 3 evocation, 150 feet, action, instant).', 'Each creature in a 20-foot sphere makes a Dexterity saving throw.',
    'On a failure it takes 8d6 fire damage; on a success, half.', 'Cast with a higher slot, +1d6 for each level above 3rd.',
    'Tier: auto. The engine rolls and applies all of this.', 'Not checked against any rulebook.'];
  let i = 0;
  for (const l of r.lines) if (l === want[i]) i++;
  assert.equal(i, want.length, `Decision 6's sentences in order, in:\n${r.lines.join('\n')}`);
  assert.deepEqual(r.doesNot, []);
  assert.equal(r.title, 'Ember Burst');
  assert.equal(r.tier, 'auto');
});

test('a manual spell quotes its manual text and says the DM does this', () => {
  const r = readEntry('spell', WOLFSONG);
  assert.equal(r.lines[0], '"Wolfsong" (level 2 conjuration, self, action, 1 hour, concentration).');
  assert.ok(r.lines.includes('The engine does not do this; the DM does this: "Summons three wolves that fight for you and obey spoken commands."'));
  assert.ok(r.lines.includes(TIER_WORDS.manual));
  assert.ok(r.doesNot.includes('"Summons three wolves that fight for you and obey spoken commands."'));
  for (const s of spells.filter((x) => x.tier === 'manual')) {
    const rr = readEntry('spell', s);
    assert.ok(rr.lines.some((l) => /the DM does this: "/.test(l)), `${s.id} quotes its manual step`);
    assert.ok(rr.doesNot.some((l) => l.startsWith('"')), `${s.id} lists its manual text for the DM`);
  }
});

// ---------- every SRD spell ----------
// Every number the entry holds, found without the reader: numeric leaves, strings with a digit (dice, "10 minutes"),
// and the character levels that key `higher.level` and `higher.targets`. Ids and author text are not numbers.
const NOT_NUMBERS = ['id', 'name', 'source', 'text', 'manual', 'summon', 'variants', 'blocks', 'set', 'spell', 'cost', 'classes', 'kinds', 'checked', 'resource'];
function numbersIn(v, path, out) {
  if (typeof v === 'number') out.push(`${path}=${v}`);
  else if (typeof v === 'string') { if (/\d/.test(v)) out.push(`${path}=${v}`); }
  else if (Array.isArray(v)) { if (!/\.forms$/.test(path)) v.forEach((x, i) => numbersIn(x, `${path}.${i}`, out)); }
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) {
    if (NOT_NUMBERS.includes(k)) continue;
    const at = path ? `${path}.${k}` : k;
    if (/^higher\.(level|targets)$/.test(path)) out.push(`${at}:key=${+k}`);
    numbersIn(x, at, out);
  }
  return out;
}
test('every SRD spell reads without a problem, and its numbers are the entry\'s', () => {
  let auto = 0;
  for (const s of spells) {
    const r = readEntry('spell', s);
    assert.ok(r.lines.length > 3, `${s.id} has a reading`);
    assert.deepEqual(r.problems, [], `${s.id} reads without problems`);
    assert.deepEqual(r.numbers.map((n) => `${n.at}=${n.value}`).sort(), numbersIn(s, '', []).sort(), `${s.id}: the numbers list is every number in the entry`);
    const all = r.lines.join('\n');
    for (const n of r.numbers) if (n.value !== 1 && !(n.at === 'level' && n.value === 0)) assert.ok(all.includes(String(n.value)), `${s.id}: ${n.at} (${n.value}) is said in the reading`);
    if (s.tier === 'auto') { auto++; assert.ok(!r.lines.some((l) => l.startsWith('Tier: auto, but')), `${s.id} is auto and the reading hands nothing to the DM: ${r.doesNot.join(' | ')}`); }
    assert.equal(r.text, s.text.replace(/\s+/g, ' ').trim().slice(0, READER_LIMITS.text) + (s.text.length > READER_LIMITS.text ? '…' : ''));
  }
  assert.ok(auto >= 45, `the auto SRD spells (${auto})`);
});

test('the reading never names a publisher or a product, and never voices the author\'s text', () => {
  const names = /wizards of the coast|dungeons\s*(&|and)\s*dragons|d&d|player'?s handbook|dungeon master'?s guide|monster manual|hasbro|xanathar|tasha|forgotten realms|system reference document|\bsrd\b/i;
  for (const e of [...spells, ...FIXTURES]) {
    const r = readEntry('spell', e);
    const own = [...r.lines, ...r.doesNot].map((l) => l.replace(/"[^"]*"/g, '""')).join('\n');
    assert.doesNotMatch(own, names, e.id);
  }
  // Security point 15: the text says harmless, the data says 10d10.
  const sly = base('sly', 'Sly', { target: { creature: {} }, effects: [{ damage: '10d10', type: 'necrotic' }], text: 'A harmless little tickle.' });
  const r = readEntry('spell', sly);
  assert.ok(r.lines.some((l) => l.includes('10d10 necrotic damage')));
  assert.ok(!r.lines.join(' ').includes('harmless'));
  assert.equal(r.text, 'A harmless little tickle.');
});

// ---------- what the engine does, said ----------
test('the reading says what the engine hands to the DM', () => {
  const dm = (e) => readEntry('spell', e);
  const has = (r, re) => assert.ok(r.lines.some((l) => re.test(l)), `${re} in:\n${r.lines.join('\n')}`);
  // An area's creature types: applied to the creatures a spell catches when it is cast, and to a zone's later comers (#425).
  const r1 = dm(FIXTURES.find((f) => f.id === 'hb-test-self-cube'));
  has(r1, /of the creatures caught, only those are affected/); assert.equal(r1.doesNot.length, 0);
  const r1z = dm(FIXTURES.find((f) => f.id === 'hb-test-turning-ring'));
  has(r1z, /enters the area later, or starts or ends its turn there, is left alone/); assert.equal(r1z.doesNot.length, 0);
  // A line with a range, ten cubes: no layout, every step to the DM.
  for (const id of ['hb-test-far-line', 'hb-test-ten-cubes']) { const r = dm(FIXTURES.find((f) => f.id === id)); has(r, /cannot lay out this area/); }
  // An instant spell made lasting by one step's ending (here, damage) keeps only what ends: the engine says so for the rest.
  const r2 = dm(FIXTURES.find((f) => f.id === 'hb-test-quick-curse'));
  has(r2, /does not keep it: the DM applies it and ends it/); has(r2, /Nothing in the engine ends it: the DM removes it/); has(r2, /It ends when it takes damage\./);
  // No step with an ending: no lasting effect at all, so a modifier has nothing to hang on.
  const r2b = dm(FIXTURES.find((f) => f.id === 'hb-test-dull-curse'));
  has(r2b, /nothing to hang this on: the DM applies it/); has(r2b, /Nothing in the engine ends it: the DM removes it/);
  // A fall to "surface", a map object step, a resource, a counter outside a reaction to a cast.
  const r3 = dm(FIXTURES.find((f) => f.id === 'hb-test-gravity-well'));
  for (const re of [/falls to the surface below it, taking 1d6 bludgeoning damage/, /set a map object/, /reveal a map object/, /spend or give a resource/, /no spell is being cast/]) has(r3, re);
  // A Reaction with nothing to set it off; a duration the engine cannot time; a tag it cannot judge.
  has(dm(FIXTURES.find((f) => f.id === 'hb-test-loose-reaction')), /names nothing that sets it off/);
  has(dm(FIXTURES.find((f) => f.id === 'hb-test-steed-call')), /cannot time that; the DM ends it/);
  has(dm(FIXTURES.find((f) => f.id === 'hb-test-many-blessings')), /The engine never applies this: at its attack rolls it cannot tell whether the attack is made with a weapon \(an Unarmed Strike is not\)/);
  has(dm(FIXTURES.find((f) => f.id === 'hb-test-mixed-dice')), /different dice: the engine does not add them, the DM does/);
  // Half with success steps: those never run.
  const r4 = dm(FIXTURES.find((f) => f.id === 'hb-test-mire'));
  has(r4, /the engine never runs them/);
  // Not auto: the description goes to the DM.
  has(dm(FIXTURES.find((f) => f.id === 'hb-test-gravity-well')), /the DM is shown the author's description/);
  // The auto SRD spells: nothing in the reading for the DM.
  for (const s of spells.filter((x) => x.tier === 'auto')) assert.deepEqual(dm(s).doesNot, [], s.id);
});

// ---------- hostile input ----------
test('hostile input gets a bounded plain answer and never a throw', () => {
  const size = (r) => JSON.stringify(r).length;
  const deep = { ...EMBER_BURST, effects: [] };
  let at = deep.effects;
  for (let i = 0; i < 10000; i++) { const st = { attack: 'melee', kind: 'spell', onHit: [] }; at.push(st); at = st.onHit; }
  const circular = { ...EMBER_BURST }; circular.self = circular;
  const wide = { ...EMBER_BURST, effects: Array.from({ length: 200000 }, () => ({ damage: '1d4', type: 'fire' })) };
  const many = { ...EMBER_BURST, effects: Array.from({ length: 2000 }, () => ({ damage: '1d4', type: 'fire', zz: 1 })) };
  const proxy = new Proxy({}, { ownKeys() { throw new Error('boom'); }, get() { throw new Error('boom'); } });
  const getter = { ...EMBER_BURST }; Object.defineProperty(getter, 'range', { enumerable: true, get() { throw new Error('boom'); } });
  const cases = [
    null, undefined, 5, 'spell', [], [1, 2], { }, proxy, getter, deep, circular, wide, many,
    { ...EMBER_BURST, text: 'x'.repeat(1e6), name: 'y'.repeat(1e5) },
    { ...EMBER_BURST, effects: [{ manual: 'z\u0000\u2028'.repeat(1e5) }] },
    JSON.parse('{"__proto__": {"polluted": true}, "constructor": 1, "id": "x", "effects": [{"damage": "1d6", "type": "fire", "__proto__": {"x": 1}}]}'),
    { ...EMBER_BURST, level: 'three', range: -5, time: 7, duration: {}, school: null, components: 'vsm', target: { area: { shape: 'blob', size: 'big' } } },
    { ...EMBER_BURST, effects: 'boom' }, { ...EMBER_BURST, effects: [null, 7, 'x', [], { damage: 5 }, { damage: '1d6', heal: '1d6' }] },
    { ...EMBER_BURST, effects: [{ modifier: 'x' }, { modifier: { on: 7, op: [] } }, { save: 'luck', onFail: 'x' }, { summon: 7, bond: 'x' }, { cure: 'x' }, { condition: 'sad', ends: 5 }] },
    { ...EMBER_BURST, higher: { level: { 5: 7, x: '1d6' }, slot: { damage: 9, times: 'x' } }, zone: 7, terrain: [], reaction: 'x', choice: { of: '__proto__' } },
    { ...EMBER_BURST, [Symbol('s')]: 1, big: 10n, fn() {}, nan: NaN, inf: -Infinity },
  ];
  for (const c of cases) {
    const t0 = process.hrtime.bigint();
    let r;
    assert.doesNotThrow(() => { r = readEntry('spell', c); });
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    assert.ok(ms < 2000, `bounded time (${ms} ms)`);
    assert.ok(Array.isArray(r.lines) && r.lines.length >= 1 && r.lines.length <= READER_LIMITS.lines + 1, 'bounded lines');
    assert.ok(size(r) < 400000, `bounded output (${size(r)})`);
    assert.ok(r.lines.every((l) => typeof l === 'string' && l.length <= READER_LIMITS.line + 30), 'bounded line length');
    assert.ok(r.problems.length <= READER_LIMITS.problems);
    assert.ok(!/[\u0000-\u001f\u2028]/.test(r.lines.join('')), 'no control characters');
  }
  assert.equal(({}).polluted, undefined);
  assert.ok(readEntry('spell', deep).lines[0].includes('too large or too deeply nested'));
  assert.equal(readEntry('spell', deep).hash, null);
  assert.ok(readEntry('spell', many).problems.length > 0);
  // Every kind is read now (reader-kinds.test.js, reader-gear.test.js); a kind the reader does not know says so in one line.
  assert.equal(readEntry('weapon', EMBER_BURST).kind, 'weapon'); assert.notEqual(readEntry('weapon', EMBER_BURST).lines[0], 'The reader does not read weapons yet; this kind of entry is not read.');
  assert.equal(readEntry('gizmo', EMBER_BURST).lines[0], 'The reader does not know this kind of entry.');
  assert.equal(readEntry(undefined, EMBER_BURST).title, '(not read)');
});

// ---------- pure, deterministic, and the hash ----------
test('the reader is pure and deterministic, and the hash is SHA-256 of the canonical entry', () => {
  for (const e of [...spells.slice(0, 40), ...FIXTURES]) {
    const copy = structuredClone(e);
    const a = readEntry('spell', e), b = readEntry('spell', e);
    assert.deepEqual(a, b);
    assert.deepEqual(e, copy, 'the entry is not changed');
  }
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  const long = 'é∑'.repeat(5000);
  assert.equal(sha256(long), createHash('sha256').update(long).digest('hex'));
  const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v));
  assert.equal(readEntry('spell', EMBER_BURST).hash, createHash('sha256').update(canon(EMBER_BURST)).digest('hex'));
  const shuffled = Object.fromEntries(Object.entries(EMBER_BURST).reverse());
  assert.equal(readEntry('spell', shuffled).hash, readEntry('spell', EMBER_BURST).hash, 'key order does not change the hash');
  const changed = structuredClone(EMBER_BURST); changed.effects[0].onFail[0].damage = '8d8';
  assert.notEqual(readEntry('spell', changed).hash, readEntry('spell', EMBER_BURST).hash, 'one character changes the hash');
});
