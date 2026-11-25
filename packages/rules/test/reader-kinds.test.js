// The plain-language reader for the kinds that are not spells (docs/specs/homebrew.md, Decision 6, task B13).
// Golden text: packages/rules/test/reader-kinds-golden.txt. After a deliberate change to a sentence, regenerate it with
//   READER_GOLDEN=update node --test packages/rules/test/reader-kinds.test.js
// and read the diff: every changed line is a changed reading the DM would approve.
// The invented entries are in fixtures/reader-kinds-pack.json (a pack that loads in strict mode) and below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CONTENT } from '../src/content/index.js';
import { loadPack } from '../src/content/registry.js';
import { ABILITIES, BRANCHES, HOMEBREW_TYPES, HOOKS, MOVE_MODES, OPS, SIZES, STEPS, TIERS } from '../src/content/schema.js';
import {
  AREA_FIELDS, ACTION_FIELDS, CREATURE_FIELDS, MONSTER_FIELDS, MONSTER_TIER_WORDS, MOVE_ENGINE, MOVE_WORDS, READER_LIMITS, READ_KINDS, SENSE_WORDS, SIZE_WORDS, TRAIT_DEAD_HOOKS, TRAIT_FIELDS,
  TRAIT_ID_WORDS, readEntry,
} from '../src/content/reader.js';
import { apply, current } from '../src/engine.js';
import { aiStep } from '../src/ai.js';
import { newGame } from '../src/scenario.js';

const GOLDEN = new URL('./reader-kinds-golden.txt', import.meta.url);
const PACK_FILE = new URL('./fixtures/reader-kinds-pack.json', import.meta.url);
const PACK = JSON.parse(readFileSync(PACK_FILE, 'utf8'));
const keysOf = (o) => Object.keys(o).sort();
const read = (url) => readFileSync(new URL(url, import.meta.url), 'utf8');
const SRC = new URL('../src/', import.meta.url);

// What strict mode refuses, so no pack can hold it, but the reader must still read (an SRD pack's entry may, or a table's own copy).
const EXTRA_MONSTERS = [
  { id: 'hb-rk-types', name: 'Typed Warder', source: 'homebrew:rk', size: 'tiny', type: 'construct', cr: 0.125, xp: 25, pb: 2, ac: 11, hp: 5, speed: { walk: 30 }, abilities: { str: 8, dex: 12, con: 10, int: 2, wis: 10, cha: 1 },
    resist: [], vulnerable: [], immune: [], traits: [], tier: 'auto', checked: false, text: 'Invented for the reader tests: an area that only some creature types feel.',
    actions: [{ id: 'hum', name: 'Hum', text: 'x', target: { area: { shape: 'emanation', size: 10, types: ['undead', 'fiend'] } }, effects: [{ save: 'wis', dc: 11, onFail: [{ damage: '1d4', type: 'psychic' }] }] }] },
  // What strict mode refused from #421 on (DEBT T54): a spell attack, healing that adds a modifier, and a creature target with no reach or range, in a creature's action.
  { id: 'hb-rk-flawed', name: 'Flawed Reaver', source: 'homebrew:rk', size: 'medium', type: 'fiend', cr: 3, xp: 700, pb: 2, ac: 14, hp: 50, speed: { walk: 30 }, abilities: { str: 14, dex: 12, con: 12, int: 10, wis: 10, cha: 10 },
    resist: [], vulnerable: [], immune: [], traits: [], tier: 'assist', checked: false, text: 'Invented for the reader tests: actions the engine cannot run as written.',
    actions: [{"id": "spell-lash", "name": "Spell Lash", "text": "Flawed: a spell attack.", "target": {"creature": {"reach": 10}}, "effects": [{"attack": "melee", "kind": "spell", "onHit": [{"damage": "2d8", "type": "force"}]}]}, {"id": "siphon", "name": "Siphon", "text": "Flawed: heals with a modifier.", "target": {"self": true}, "effects": [{"heal": "1d8", "addMod": true}, {"tempHp": "1d6", "addMod": true}]}, {"id": "blind-grip", "name": "Blind Grip", "text": "Flawed: no reach or range.", "target": {"creature": {}}, "effects": [{"save": "str", "dc": 17, "onFail": [{"damage": "3d8+5", "type": "bludgeoning"}, {"condition": "grappled"}]}]},
      // A creature-type limit on a creature target is a spell's (#727): the linter refuses it in a creature's action, and the reader says so.
      {"id": "man-catcher", "name": "Man Catcher", "text": "Flawed: a creature-type limit, which is a spell's.", "target": {"creature": {"reach": 5, "types": ["humanoid"]}}, "effects": [{"save": "str", "dc": 13, "onFail": [{"condition": "grappled"}]}]},
      // Aiming at a dead creature is a spell's too (#726 job 6).
      {"id": "grave-robber", "name": "Grave Robber", "text": "Flawed: aimed at the dead, which is a spell's.", "target": {"creature": {"reach": 5, "dead": true}}, "effects": [{"save": "str", "dc": 13, "onFail": [{"condition": "grappled"}]}]}] },
];
const monsters = () => [...PACK.monsters, ...EXTRA_MONSTERS];
const readingOf = (kind, e) => { const r = readEntry(kind, e); return [`== ${kind} ${e.id}`, ...r.lines, ...r.doesNot.map((x) => `DM: ${x}`), ...r.problems.map((x) => `PROBLEM: ${x}`), ''].join('\n'); };
const goldenText = () => [...monsters().map((e) => readingOf('monster', e)), readingOf('monster', CONTENT.monsters.warhorse)].join('\n');

test('the invented pack loads in strict mode', () => {
  const r = loadPack(structuredClone(PACK));
  assert.equal(r.ok, true, JSON.stringify(r.problems));
});

// ---------- the vocabulary and the reader's words (monsters) ----------
test('every field of a monster, a trait, an action and a target has words in the reader', () => {
  assert.deepEqual(keysOf(MONSTER_FIELDS), keysOf(HOMEBREW_TYPES.monsters), 'a monster key with no words (or words for no key)');
  assert.deepEqual(keysOf(TRAIT_FIELDS), keysOf(HOMEBREW_TYPES.trait));
  assert.deepEqual(keysOf(ACTION_FIELDS), keysOf(HOMEBREW_TYPES.action));
  assert.deepEqual([...CREATURE_FIELDS].sort(), keysOf(HOMEBREW_TYPES.creature));
  assert.deepEqual([...AREA_FIELDS].sort(), keysOf(HOMEBREW_TYPES.area));
  assert.deepEqual(keysOf(HOMEBREW_TYPES.uses), ['n', 'per']);
  assert.deepEqual(keysOf(HOMEBREW_TYPES.attackEntry), ['action', 'times']);
  assert.deepEqual(keysOf(HOMEBREW_TYPES.orList), ['or']);
  assert.deepEqual(keysOf(HOMEBREW_TYPES.abilities), [...ABILITIES].sort());
  assert.deepEqual(keysOf(SIZE_WORDS), [...SIZES].sort());
  assert.deepEqual(keysOf(MOVE_WORDS), [...MOVE_MODES].sort());
  assert.deepEqual(keysOf(MOVE_ENGINE), [...MOVE_MODES].sort());
  assert.deepEqual(keysOf(MONSTER_TIER_WORDS), [...TIERS].sort());
  // The four special senses, written inline in schema.js.
  const senses = /const SENSES = \[([^\]]*)\]/.exec(read('../src/content/schema.js'))[1].match(/'([a-z]+)'/g).map((x) => x.slice(1, -1));
  assert.deepEqual(keysOf(SENSE_WORDS), [...senses].sort());
  // The trait ids the engine knows by name, written inline in content/index.js.
  const legacy = /const LEGACY_FEATURES = \{([^}]*)\}/.exec(read('../src/content/index.js'))[1].match(/'([a-z-]+)':/g).map((x) => x.slice(1, -2));
  assert.deepEqual(keysOf(TRAIT_ID_WORDS), [...legacy].sort());
  assert.ok(READ_KINDS.includes('monster'));
});

function sources() {
  const out = [];
  const walk = (dir) => { for (const f of readdirSync(dir, { withFileTypes: true })) { const p = new URL(f.name + (f.isDirectory() ? '/' : ''), dir); if (f.isDirectory()) { if (f.name !== 'content') walk(p); } else if (f.name.endsWith('.js')) out.push(readFileSync(p, 'utf8')); } };
  walk(SRC);
  return out.join('\n');
}
test('the ways to move and the hooks the engine does not read are the ones the sources never use', () => {
  const src = sources();
  for (const m of MOVE_MODES) {
    if (m === 'walk') continue;
    const used = new RegExp(`speedOf\\([^)]*'${m}'\\)|speeds\\??\\.${m}\\b|speeds\\??\\['${m}'\\]`).test(src);
    assert.equal(used, MOVE_ENGINE[m], `the engine ${MOVE_ENGINE[m] ? 'moves by' : 'never reads'} a ${m} speed`);
  }
  for (const h of HOOKS) {
    const read = new RegExp(`modifiers\\([^)]*'${h.replace('.', '\\.')}'`).test(src) || (h.startsWith('save.') && src.includes('`save.${'));
    assert.equal(TRAIT_DEAD_HOOKS.includes(h), !read && ['hp.max', 'carry'].includes(h), `${h}: the reader says a trait's modifier at it is ${TRAIT_DEAD_HOOKS.includes(h) ? 'never read' : 'read'}`);
  }
  assert.ok(TRAIT_DEAD_HOOKS.every((h) => HOOKS.includes(h)));
});

// ---------- the golden readings use every field and shape ----------
test('the golden monsters use every field, shape, step, hook and op the strict linter allows', () => {
  const ms = [...monsters(), CONTENT.monsters.warhorse];
  const got = (shape) => new Set(); void got;
  const fields = new Set(), traitKeys = new Set(), actionKeys = new Set(), creatureKeys = new Set(), areaKeys = new Set(), shapes = new Set(), steps = new Set(), branches = new Set(), hooks = new Set(), ops = new Set();
  const goSteps = (list) => { for (const st of list) { steps.add(STEPS.find((k) => k in st)); if (st.modifier) { hooks.add(st.modifier.on); ops.add(st.modifier.op); } for (const b of BRANCHES) if (st[b]) { branches.add(b); goSteps(st[b]); } } };
  const sizes = new Set(), moves = new Set(), sensesUsed = new Set();
  for (const m of ms) {
    for (const k of Object.keys(m)) fields.add(k);
    sizes.add(m.size); for (const k of Object.keys(m.speed)) moves.add(k); for (const k of Object.keys(m.senses ?? {})) sensesUsed.add(k);
    for (const t of m.traits) { for (const k of Object.keys(t)) traitKeys.add(k); for (const x of t.modifiers) { hooks.add(x.on); ops.add(x.op); } }
    for (const a of m.actions) {
      for (const k of Object.keys(a)) actionKeys.add(k);
      if (a.target?.creature) for (const k of Object.keys(a.target.creature)) creatureKeys.add(k);
      if (a.target?.area) { for (const k of Object.keys(a.target.area)) areaKeys.add(k); shapes.add(a.target.area.shape); }
      if (a.effects) goSteps(a.effects);
    }
  }
  assert.deepEqual([...fields].sort(), keysOf(HOMEBREW_TYPES.monsters), 'every monster field (mount through an SRD mount)');
  assert.deepEqual([...traitKeys].sort(), keysOf(HOMEBREW_TYPES.trait));
  assert.deepEqual([...actionKeys].sort(), keysOf(HOMEBREW_TYPES.action));
  assert.deepEqual([...creatureKeys].sort(), keysOf(HOMEBREW_TYPES.creature));
  assert.deepEqual([...areaKeys].sort(), keysOf(HOMEBREW_TYPES.area));
  assert.deepEqual([...shapes].sort(), ['cone', 'cube', 'cylinder', 'emanation', 'line', 'sphere']);
  assert.deepEqual([...steps].sort(), STEPS.filter((s) => s !== 'summon' && s !== 'counter' && s !== 'imbue' && s !== 'revive' && s !== 'eachTurn' && s !== 'endSpell' && s !== 'arm').sort(), 'a creature\'s action cannot hold a summon, a counter, an imbue, a revive, an eachTurn, an endSpell or an arm step');
  assert.deepEqual([...branches].sort(), BRANCHES.filter((b) => b !== 'eachTurn').sort());
  assert.deepEqual([...hooks].sort(), [...HOOKS].sort());
  // `proficient` (addition C of docs/specs/homebrew-subclasses.md) is for a modifier step of a subclass feature's action: the linter refuses it in a monster's trait or action, so no golden monster uses it.
  assert.deepEqual([...ops].sort(), OPS.filter((o) => o !== 'proficient').sort());
  assert.deepEqual([...moves].sort(), [...MOVE_MODES].sort());
  assert.deepEqual([...sensesUsed].sort(), keysOf(SENSE_WORDS));
  assert.ok(['tiny', 'large', 'huge', 'medium'].every((s) => sizes.has(s)));
});

test('the golden readings match reader-kinds-golden.txt', () => {
  const text = goldenText();
  if (process.env.READER_GOLDEN === 'update') writeFileSync(GOLDEN, text);
  assert.equal(text, readFileSync(GOLDEN, 'utf8'), 'a reading changed: if on purpose, regenerate with READER_GOLDEN=update and read the diff');
});

// ---------- every SRD monster ----------
// Every number the entry holds, found without the reader: numeric leaves, strings with a digit (dice), and nothing from ids, names or author text.
const NOT_NUMBERS = ['id', 'name', 'source', 'text', 'manual', 'languages', 'action', 'when', 'advantageIf', 'set', 'resource', 'cost', 'spell', 'checked'];
function numbersIn(v, path, out) {
  if (typeof v === 'number') out.push(`${path}=${v}`);
  else if (typeof v === 'string') { if (/\d/.test(v)) out.push(`${path}=${v}`); }
  else if (Array.isArray(v)) v.forEach((x, i) => numbersIn(x, `${path}.${i}`, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (!NOT_NUMBERS.includes(k) && !(['size', 'type'].includes(k) && typeof x === 'string')) numbersIn(x, path ? `${path}.${k}` : k, out); }
  return out;
}
test('every SRD monster reads without a problem, and its numbers are the entry\'s', () => {
  const all = Object.values(CONTENT.monsters);
  assert.ok(all.length > 300);
  let auto = 0;
  for (const m of all) {
    const r = readEntry('monster', m);
    assert.equal(r.kind, 'monster');
    assert.ok(r.lines.length > 10, `${m.id} has a reading`);
    assert.deepEqual(r.problems, [], `${m.id} reads without problems`);
    assert.deepEqual(r.numbers.map((n) => `${n.at}=${n.value}`).sort(), numbersIn(m, '', []).sort(), `${m.id}: the numbers list is every number in the entry`);
    const text = r.lines.join('\n');
    for (const n of r.numbers) if (Number.isInteger(n.value) && n.value !== 1 && n.value !== 0 && !/^\d+d\d+/.test(String(n.value))) assert.ok(text.includes(String(n.value)), `${m.id}: ${n.at} (${n.value}) is said in the reading`);
    assert.equal(r.tier, m.tier);
    assert.equal(r.title, m.name);
    assert.equal(r.text, m.text.replace(/\s+/g, ' ').trim().slice(0, READER_LIMITS.text) + (m.text.length > READER_LIMITS.text ? '…' : ''));
    if (m.tier === 'auto') auto++;
  }
  assert.ok(auto >= 50, `the auto SRD monsters (${auto})`);
  // The SRD's trained mount.
  assert.ok(readEntry('monster', CONTENT.monsters.warhorse).lines.some((l) => /trained to carry a rider/.test(l)));
});

test('the reading says what the engine hands to the DM, for the SRD\'s own monsters', () => {
  const has = (id, re) => assert.ok(readEntry('monster', CONTENT.monsters[id]).lines.some((l) => re.test(l)), `${id}: ${re}`);
  has('quasit', /against DC 10 \(the DC of the save that put it on\); a success ends it/);
  has('doppelganger', /against DC 12 \(the entry's own DC for it\); a success ends it/);
  has('wolf', /Advantage on its attack rolls/);
  has('knight', /Reaction, taken by a standing instruction/);
  has('adult-red-dragon', /Recharge 5-6/);
  has('quasit', /Limited to 1 use a day/);
  has('goblin-boss', /Bonus Action/);
  has('bulette', /cannot lay out this area/);
  has('adult-red-dragon', /The engine has no legendary, lair or mythic actions/);
  const none = readEntry('monster', CONTENT.monsters.black_bear ?? CONTENT.monsters['black-bear']);
  assert.ok(none.doesNot.includes('Moving it by its swim speed.'));
});

// ---------- what the engine does, said (the readings stay true) ----------
test('the engine does what the reading says of a repeated save, a spell attack, healing with a modifier, an action with no reach and an area that chooses', () => {
  const DM = { role: 'dm', userId: 'dm' };
  const set = (monster) => {
    const s = newGame(3);
    for (const id of Object.keys(s.entities)) if (s.entities[id].side !== 'party') delete s.entities[id];
    s.settings.autoEngage = false;
    const m = s.entities[apply(s, { type: 'spawn', monster, at: { q: 1, r: 0 } }, DM).events[0].id];
    for (const e of Object.values(s.entities)) e.hp = e.maxHp = 500;
    apply(s, { type: 'place', actor: 'fighter', to: { q: 0, r: 0 } }, DM);
    apply(s, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 8 }, DM);
    const turn = (id) => { for (let i = 0; i < 20 && current(s) !== id; i++) apply(s, { type: 'endTurn', actor: current(s) }, DM); };
    turn(m.id);
    return { s, m, turn };
  };
  // A repeated save is against the DC of the save that put the condition on, and a success ends it (#421: it never did).
  { const { s, m, turn } = set('quasit'); const f = s.entities.fighter; f.abil.wis = 1; f.saveBonus = { wis: -10 };
    assert.ok(apply(s, { type: 'act', actor: m.id, action: 'scare', target: 'fighter' }, DM).ok); assert.ok(f.cond.frightened);
    f.saveBonus = { wis: 50 }; turn('fighter');
    const ev = apply(s, { type: 'endTurn', actor: 'fighter' }, DM).events.filter((e) => e.type === 'save');
    assert.equal(ev.length, 1); assert.equal(ev[0].dc, 10); assert.equal(ev[0].success, true, 'a total of 60 against DC 10'); assert.equal(f.cond.frightened, undefined); }
  // A spell attack in a creature's action makes no roll: the DM is told, and it does not hit.
  { const { s, m } = set('quasit'); const a = m.actions.find((x) => x.id === 'rend'); a.effects[0].kind = 'spell'; delete a.effects[0].bonus;
    const r = apply(s, { type: 'act', actor: m.id, action: 'rend', target: 'fighter' }, DM);
    assert.ok(r.ok); assert.equal(r.events.find((e) => e.type === 'attack'), undefined); assert.ok(r.events.some((e) => e.type === 'manual' && /no attack bonus/.test(e.text))); }
  // Healing with addMod applies nothing, and the Hit Points stay a number.
  { const { s, m } = set('quasit'); m.hp = 1; m.actions.push({ id: 'mend', name: 'Mend', target: { self: true }, effects: [{ heal: '1d6', addMod: true }] });
    const r = apply(s, { type: 'act', actor: m.id, action: 'mend', target: m.id }, DM); assert.ok(r.ok); assert.equal(m.hp, 1); assert.ok(r.events.some((e) => e.type === 'manual')); }
  // A creature target with no reach or range: using it is refused with a sentence, and the monster AI skips it.
  { const { s, m } = set('quasit'); m.actions.push({ id: 'blind', name: 'Blind', target: { creature: {} }, effects: [{ save: 'str', dc: 17, onFail: [{ damage: '3d8', type: 'bludgeoning' }] }] });
    const r = apply(s, { type: 'act', actor: m.id, action: 'blind', target: 'fighter' }, DM); assert.equal(r.ok, false); assert.match(r.error, /cannot be aimed/);
    assert.doesNotThrow(() => aiStep(s, m.id)); }
  // An area's `choose` is applied to a creature's action: up to that many of those caught, the creature's pick.
  { const { s, m } = set('quasit'); m.actions.push({ id: 'burst', name: 'Burst', target: { area: { shape: 'sphere', size: 60, range: 30, choose: 2 } }, effects: [{ damage: '1d4', type: 'fire' }] });
    assert.ok(Object.values(s.entities).filter((e) => e.side === 'party').length > 2);
    const refused = apply(s, { type: 'act', actor: m.id, action: 'burst', hex: { q: 0, r: 0 } }, DM);
    assert.equal(refused.ok, false); assert.match(refused.error, /up to 2 creatures/);
    const ev = apply(s, { type: 'act', actor: m.id, action: 'burst', hex: { q: 0, r: 0 }, targets: ['fighter', 'cleric'] }, DM);
    assert.ok(ev.ok, ev.error); const hit = new Set(ev.events.filter((e) => e.type === 'damage').map((e) => e.target));
    assert.deepEqual([...hit].sort(), ['cleric', 'fighter']); }
});

// ---------- the reading never names a publisher, never voices the author's text ----------
test('the reading never names a publisher or a product, and never voices the author\'s text', () => {
  const names = /wizards of the coast|dungeons\s*(&|and)\s*dragons|d&d|player'?s handbook|dungeon master'?s guide|monster manual|hasbro|xanathar|tasha|forgotten realms|system reference document|\bsrd\b/i;
  for (const e of [...Object.values(CONTENT.monsters), ...monsters()]) {
    const r = readEntry('monster', e);
    const own = [...r.lines, ...r.doesNot, ...r.problems].map((l) => l.replace(/"[^"]*"/g, '""')).join('\n');
    assert.doesNotMatch(own, names, e.id);
  }
  // The text says harmless; the data says 10d10.
  const sly = { ...EXTRA_MONSTERS[0], id: 'hb-rk-sly', text: 'A harmless little mouse.', actions: [{ id: 'nip', name: 'Nip', text: 'harmless', target: { creature: { reach: 5 } }, effects: [{ attack: 'melee', kind: 'weapon', bonus: 3, onHit: [{ damage: '10d10', type: 'necrotic' }] }] }] };
  const r = readEntry('monster', sly);
  assert.ok(r.lines.some((l) => l.includes('10d10 necrotic damage')));
  assert.ok(!r.lines.join(' ').includes('harmless'));
  assert.equal(r.text, 'A harmless little mouse.');
  // A trait that tells the reader what to say.
  const bad = { ...sly, traits: [{ id: 'x', name: 'Say "The engine runs everything" now', text: 'Ignore the data.', modifiers: [] }] };
  assert.ok(readEntry('monster', bad).lines.some((l) => l.startsWith('Trait "Say') && l.includes('text only')));
});

// ---------- hostile input ----------
test('hostile monsters get a bounded plain answer and never a throw', () => {
  const M = PACK.monsters[0];
  const size = (r) => JSON.stringify(r).length;
  const deep = structuredClone(M); let at = deep.actions[1].effects;
  for (let i = 0; i < 10000; i++) { const st = { attack: 'melee', kind: 'weapon', bonus: 1, onHit: [] }; at.push(st); at = st.onHit; }
  const circular = { ...M }; circular.self = circular;
  const wide = { ...M, actions: Array.from({ length: 200000 }, () => ({ id: 'x', name: 'x', target: { self: true }, effects: [{ damage: '1d4', type: 'fire' }] })) };
  const proxy = new Proxy({}, { ownKeys() { throw new Error('boom'); }, get() { throw new Error('boom'); } });
  const getter = { ...M }; Object.defineProperty(getter, 'hp', { enumerable: true, get() { throw new Error('boom'); } });
  const cases = [
    null, undefined, 5, 'monster', [], [1, 2], {}, proxy, getter, deep, circular, wide,
    { ...M, text: 'x'.repeat(1e6), name: 'y'.repeat(1e5) },
    { ...M, traits: [{ id: 'a', name: 'z\u0000\u2028'.repeat(1e5), modifiers: [], text: 'x' }] },
    JSON.parse('{"__proto__": {"polluted": true}, "constructor": 1, "id": "x", "actions": [{"id": "a", "__proto__": {"x": 1}}]}'),
    { ...M, size: 7, type: {}, cr: 'big', xp: -1, pb: 'x', ac: [], hp: null, speed: 'fast', abilities: { str: 'x' }, senses: [], saves: 5, skills: 'x', resist: 'fire', vulnerable: [1], immune: {}, conditionImmune: 'x', languages: 7, hover: {}, mount: 3, tier: 9 },
    { ...M, traits: 'x', actions: 'y' }, { ...M, traits: [null, 7, 'x', [], { modifiers: 'x' }, { modifiers: [null, 3, { on: 7 }], reaction: 'x' }, { id: 5, reaction: { on: 'cast', ac: 99, attack: 'x', manual: 4 }, modifiers: [] }] },
    { ...M, actions: [null, 7, [], { multiattack: 'x' }, { multiattack: [null, { action: 5, times: 'x' }, { action: [], times: 99 }] }, { multiattack: { or: [1] }, effects: [] }, { multiattack: [{ action: 'multiattack', times: 1 }], id: 'multiattack' }] },
    { ...M, actions: [{ id: 'a', name: 'A', target: 'x', effects: 'y', uses: 5, recharge: 'x', time: 'never' }, { id: 'b', target: { creature: 'x', area: 'y' }, effects: [] }, { id: 'c', target: { area: { shape: 'blob', size: 'big', range: 'far' } }, effects: [{ damage: 5 }] }, { id: 'd', target: { creature: { reach: -5, range: [5], count: 'x' } }, effects: [{ summon: 'x' }, { counter: 'spell' }] }] },
    { ...M, [Symbol('s')]: 1, big: 10n, fn() {}, nan: NaN, inf: -Infinity },
  ];
  for (const c of cases) {
    let r;
    assert.doesNotThrow(() => { r = readEntry('monster', c); }, 'never a throw');
    assert.equal(typeof r.title, 'string');
    assert.ok(Array.isArray(r.lines) && Array.isArray(r.doesNot) && Array.isArray(r.problems));
    assert.ok(size(r) < 400000, `bounded output (${size(r)})`);
    assert.ok(r.lines.every((l) => typeof l === 'string' && l.length <= READER_LIMITS.line + 30), 'bounded line length');
    assert.ok(r.problems.length <= READER_LIMITS.problems);
    assert.ok(!/[\u0000-\u001f\u2028]/.test(r.lines.join('')), 'no control characters');
  }
  assert.equal(({}).polluted, undefined);
  assert.equal(readEntry('monster', deep).hash, null);
  assert.ok(readEntry('monster', deep).lines.some((l) => l.includes('too large or too deeply nested')));
  assert.ok(readEntry('monster', { ...M, traits: 'x' }).problems.length > 0);
  assert.equal(readEntry('monster', null).lines[0], 'This is not a monster entry (it is not an object). It cannot be approved.');
});

test('the monster reader is pure and deterministic, and the hash is of the canonical entry', () => {
  for (const e of [...Object.values(CONTENT.monsters).slice(0, 60), ...monsters()]) {
    const copy = structuredClone(e);
    const a = readEntry('monster', e), b = readEntry('monsters', e);
    assert.deepEqual(a, b);
    assert.deepEqual(e, copy, 'the entry is not changed');
  }
  const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v));
  const M = PACK.monsters[0];
  assert.equal(readEntry('monster', M).hash, createHash('sha256').update(canon(M)).digest('hex'));
  const changed = structuredClone(M); changed.hp = 31;
  assert.notEqual(readEntry('monster', changed).hash, readEntry('monster', M).hash);
});
