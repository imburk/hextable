// The plain-language reader: what an entry does, in words, worked out from the data the engine runs
// (docs/specs/homebrew.md, Decision 6, row H3, task B3).
//
//   readEntry(kind, entry, ctx) -> { kind, title, tier, lines, doesNot, numbers, text, problems, hash }
//
// The DM approves this reading, never the data (Decision 8). So each sentence here says what effects.js and the cast
// handler (engine/casting.js) do with a field, and a field the engine ignores or hands to the DM is said to be so.
// The sentences are this project's own. Nothing the author wrote (name, `text`, a manual step) is mixed into them:
// the name is the title, a manual step's words are quoted after "the DM does this", and `text` is returned on its
// own, beside the reading, capped in length.
//
// `lines`     the reading, in the order the engine works: what it is, each step in the order it runs (nested steps
//             indented two spaces a level), how it is aimed, how it grows, how long it lasts, the tier.
// `doesNot`   what the DM does by hand: each manual step's words, and each part the engine hands over.
// `numbers`   every number the entry holds, with where it is: { at, value, unit }.
// `problems`  what the reader could not read (wrong types, odd keys, too big); empty for an entry the linter passes.
// `hash`      SHA-256 of the entry's canonical JSON (keys sorted), or null for one too big to read.
//
// Pure and bounded: no I/O, no clock, no randomness; a hostile entry (huge, deep, odd keys, wrong types, a getter that
// throws) gets a short plain answer and never a throw. Only spells are read so far; other kinds are task B13.
import { ABILITIES, AREA_SHAPES, BRANCHES, CAST_TIMES, CHOICES, CONDITIONS, CREATURE_TYPES, DAMAGE_TYPES, HOOKS, OPS, REACTION_TRIGGERS, REMAINS, SCHOOLS,
  SKILLS, SPELL_KINDS, STEPS, SUMMON_ENDS, SUMMON_KINDS, SUMMON_ONE, SUMMON_TURNS, TAGS, TIERS, isDuration } from './schema.js';
// index.js first: it loads effects.js whole (effects.js reached first would meet a cycle through durations.js).
import { CONTENT } from './index.js';
import { actionProfile, aimable, BENEFICIAL_CONDITIONS, spellKinds, WORK } from '../effects.js';

// ---------- limits ----------
export const READER_LIMITS = { depth: 24, nodes: 5000, string: 4000, quote: 600, title: 80, text: 2000, lines: 400, line: 900, problems: 20, numbers: 1000 };
const FORBIDDEN = ['__proto__', 'constructor', 'prototype'];

// ---------- words for the closed lists (a test holds each list and its words equal) ----------
export const ABILITY_WORDS = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
export const CAST_TIME_WORDS = { action: 'action', bonus: 'Bonus Action', reaction: 'Reaction', minute: '1 minute', '10 minutes': '10 minutes', hour: '1 hour',
  '8 hours': '8 hours', '12 hours': '12 hours', '24 hours': '24 hours' };
export const AREA_WORDS = {
  sphere: (a) => `a ${a.size}-foot sphere`,
  cylinder: (a) => `a cylinder ${a.size} feet in radius and ${a.height ?? a.size} feet high`,
  cone: (a) => `a ${a.size}-foot cone`,
  line: (a) => `a line ${a.size} feet long and ${a.width ?? 5} feet wide`,
  cube: (a) => `a ${a.size}-foot cube`,
  emanation: (a) => `a ${a.size}-foot emanation`,
};
// Where the engine lays each shape out (engine/world.js, aimArea).
export const AREA_PLACE = {
  sphere: (range) => (range > 0 ? `is centred on a point the caster picks within ${range} feet` : 'is centred on the caster\'s own space'),
  cylinder: (range) => (range > 0 ? `is centred on a point the caster picks within ${range} feet` : 'is centred on the caster\'s own space'),
  cone: () => 'spreads from the caster in a direction the caster picks',
  line: () => 'runs from the caster in a direction the caster picks',
  cube: (range) => (range > 0 ? `is placed at a point the caster picks within ${range} feet` : 'is laid out from the caster in a direction the caster picks'),
  emanation: () => 'reaches out from the caster all round',
};
export const REMAINS_WORDS = { 'frozen-statue': 'a frozen statue', dust: 'a pile of dust' };
export const REACTION_WORDS = {
  hit: 'when an attack roll hits the caster',
  cast: 'when the caster sees a hostile creature within the spell\'s range casting a spell; it is aimed at that creature',
  damaged: 'when a hostile creature the caster can see within the spell\'s range damages the caster; it is aimed at that creature',
};
export const SUMMON_KIND_WORDS = { familiar: 'familiar', steed: 'steed', summon: 'summoned creature', undead: 'undead servant', object: 'animated object', servant: 'servant', pet: 'pet' };
export const SUMMON_TURN_WORDS = { own: 'It rolls Initiative and takes its own turns.', after: 'It acts on the caster\'s count, right after (or before) the caster\'s turn.' };
export const SUMMON_END_WORDS = { masterDies: 'when the caster dies', longRest: 'when the caster finishes a Long Rest' };
export const SUMMON_ONE_WORDS = {
  reform: 'If the caster already has one from this spell, casting it again gives that one the new form instead of making another.',
  replace: 'If the caster already has one from this spell, casting it again replaces that one.',
};
export const CHOICE_WORDS = { skill: 'a skill', ability: 'an ability', damageType: 'a damage type', condition: 'a condition' };
export const KIND_WORDS = { damage: 'damage', healing: 'healing', control: 'control', utility: 'utility' };
export const TIER_WORDS = {
  auto: 'Tier: auto. The engine rolls and applies all of this.',
  assist: 'Tier: assist. The engine applies the steps above; the DM applies the rest of the description.',
  manual: 'Tier: manual. The DM applies this spell; the engine only shows the description.',
};
// What ends a lasting condition or modifier (`ends.on`; schema.js lintSteps).
export const ENDS_ON = ['turnStart', 'turnEnd', 'save', 'damaged'];
// When a zone goes off (`zone.on`; schema.js lintZone).
export const ZONE_ON_WORDS = { enter: 'enters the area (or the area reaches it)', turnStart: 'starts its turn there', turnEnd: 'ends its turn there' };

// Where a modifier attaches: a noun for the thing it changes.
export const HOOK_WORDS = {
  check: 'ability checks', save: 'saving throws', 'attack.roll': 'its attack rolls', 'attack.received': 'attack rolls made against it',
  'damage.dealt': 'the damage it deals', 'damage.taken': 'damage it takes', ac: 'its Armor Class', speed: 'its Speed', initiative: 'its Initiative',
  'save.str': 'Strength saving throws', 'save.dex': 'Dexterity saving throws', 'save.con': 'Constitution saving throws', 'save.int': 'Intelligence saving throws',
  'save.wis': 'Wisdom saving throws', 'save.cha': 'Charisma saving throws', 'save.death': 'Death Saving Throws', concentration: 'saving throws to keep Concentration',
  'spell.dc': 'its spell save DC', 'spell.attack': 'its spell attack rolls', 'hp.max': 'its Hit Point maximum', carry: 'its carrying capacity',
  'speed.fly': 'its Fly Speed', d20: 'a D20 Test it fails', opportunity: 'Opportunity Attacks',
};
// What a modifier does to that thing. `v` is the value in words, `h` the hook's noun.
export const OP_WORDS = {
  add: (v, h) => `${v} to ${h}`,
  set: (v, h) => `${h} set to ${v}`,
  min: (v, h) => `${h} of at least ${v}`,
  max: (v, h) => `${h} of at most ${v}`,
  advantage: (v, h) => `Advantage on ${h}`,
  disadvantage: (v, h) => `Disadvantage on ${h}`,
  autoFail: (v, h) => `automatic failure on ${h}`,
  autoSucceed: (v, h) => `automatic success on ${h}`,
  resist: (v, h) => `Resistance to ${h}`,
  vulnerable: (v, h) => `Vulnerability to ${h}`,
  immune: (v, h) => `Immunity to ${h}`,
  crit: (v, h) => `a Critical Hit on every hit, among ${h}`,
  floor: (v, h) => `any d20 roll lower than ${v} counting as ${v} on ${h}`,
};
// Situations the engine tests (`when`, `advantageIf`).
export const TAG_WORDS = {
  within5: 'the two are within 5 feet of each other', beyond5: 'the two are more than 5 feet apart', ranged: 'it is a ranged attack', melee: 'it is a melee attack',
  'attack.advantage': 'the attack roll has Advantage', 'attack.disadvantage': 'the attack roll has Disadvantage', 'target.prone': 'the target is Prone',
  'target.unconscious': 'the target is Unconscious', 'attacker.unseen': 'the target cannot see the attacker', 'target.unseen': 'the attacker cannot see the target',
  'ally.adjacentToTarget': 'an ally of the attacker is within 5 feet of the target', 'enemy.adjacent': 'an enemy is within 5 feet of the attacker',
  'long.range': 'the attack is at long range', 'target.halfCover': 'the target has Half Cover', 'target.threeQuartersCover': 'the target has Three-Quarters Cover',
  'target.seesSource': 'the target can see the caster', 'attack.hit': 'the damage comes from an attack roll that hit', 'attack.weapon': 'the attack is made with a weapon',
  'attack.str': 'the attack uses Strength', 'attack.spell': 'it is a spell\'s attack roll', 'self.notIncapacitated': 'it is not Incapacitated',
  'spell.cantrip': 'the damage is a cantrip\'s', 'target.fought': 'the caster\'s side is fighting the target', 'check.proficient': 'the check uses one of its proficiencies',
  'attack.opportunity': 'it is an Opportunity Attack', 'target.notFiend': 'the target is not a Fiend',
};
// Tags the engine's judge has no test for (modifiers.js, judge: they fall to `default: return null`). A step that
// needs one is handed to the DM every time; a modifier that needs one never applies. A test reads modifiers.js.
export const UNJUDGED_TAGS = ['long.range', 'target.seesSource'];

// ---------- small helpers ----------
const isInt = Number.isInteger;
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
const DICE = /^(\d+d\d+)?([+-]\d+)?$/;
const isDice = (x) => typeof x === 'string' && x.length > 0 && x.length < 40 && DICE.test(x);
const MOD_DICE = /^[+-]?\d+d\d+([+-]\d+)?$/;
const cap = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);
// Author text for display: no control characters, one line, capped.
// eslint-disable-next-line no-control-regex
const clean = (s, n) => cap(String(s).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim(), n);
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// An id or key shown in a sentence: as written if it is a plain id, otherwise not at all.
const shown = (k) => (typeof k === 'string' && k.length <= 40 && /^[A-Za-z0-9_.-]+$/.test(k) ? `"${k}"` : 'an unreadable name');
const list = (xs, and = 'and') => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${and} ${xs.at(-1)}`);
const cond = (id) => CONTENT.conditions[id]?.name ?? (typeof id === 'string' ? id : '?');
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const signed = (v) => (typeof v === 'number' ? (v >= 0 ? `+${v}` : `${v}`) : /^[+-]/.test(v) ? v : `+${v}`);
const nameOf = (lookup, id) => (typeof id === 'string' && Object.hasOwn(CONTENT[lookup] ?? {}, id) && typeof CONTENT[lookup][id].name === 'string' ? CONTENT[lookup][id].name : shown(id));
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
const feetOf = (range) => (range === 'self' ? 0 : range === 'touch' ? 5 : range);

// ---------- a bounded, inert copy of the input ----------
// Own enumerable string keys only, no forbidden key, no function, depth and node count bounded, long strings cut.
// Everything after this works on the copy, so a getter or a Proxy is touched once, here, inside a try.
function tidy(input, problems) {
  let nodes = 0, over = false;
  const say = (m) => { if (problems.length < READER_LIMITS.problems) problems.push(m); };
  const copy = (v, depth, path) => {
    if (++nodes > READER_LIMITS.nodes) { over = true; return undefined; }
    if (v === null || typeof v === 'boolean') return v;
    if (typeof v === 'number') { if (!Number.isFinite(v)) say(`${path || 'the entry'} is not a finite number.`); return Number.isFinite(v) ? v : null; }
    if (typeof v === 'string') { if (v.length > READER_LIMITS.string) { say(`${path || 'the entry'} is a string of ${v.length} characters; the reader keeps ${READER_LIMITS.string}.`); return v.slice(0, READER_LIMITS.string); } return v; }
    if (typeof v === 'function') { say(`${path || 'the entry'} is a function; content is data only.`); return undefined; }
    if (typeof v !== 'object') { say(`${path || 'the entry'} is not data the reader knows (${typeof v}).`); return undefined; }
    if (depth >= READER_LIMITS.depth) { over = true; return undefined; }
    if (Array.isArray(v)) {
      const n = Math.min(v.length, READER_LIMITS.nodes);
      const out = [];
      for (let i = 0; i < n && !over; i++) out.push(copy(v[i], depth + 1, `${path}[${i}]`));
      if (v.length > n) over = true;
      return out;
    }
    const out = {};
    for (const k of Object.keys(v)) {
      if (over) break;
      if (FORBIDDEN.includes(k)) { say(`${path || 'the entry'} has a key ${shown(k)}, which no entry may have.`); continue; }
      const x = copy(v[k], depth + 1, path ? `${path}.${k}` : k);
      if (x !== undefined) out[k] = x;
    }
    return out;
  };
  const value = copy(input, 0, '');
  return { value, over };
}

// ---------- canonical JSON and SHA-256 (pure; no crypto module, so it runs in the browser too) ----------
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : canonical(x))).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v) ?? 'null';
}
const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d,
  0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
export function sha256(text) {
  const bytes = new TextEncoder().encode(text), n = bytes.length;
  const padded = new Uint8Array(((n + 9 + 63) >> 6) << 6);
  padded.set(bytes); padded[n] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, Math.floor(n / 0x20000000)); dv.setUint32(padded.length - 4, (n << 3) >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), W = new Uint32Array(64);
  const rot = (x, r) => (x >>> r) | (x << (32 - r));
  for (let o = 0; o < padded.length; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rot(W[i - 15], 7) ^ rot(W[i - 15], 18) ^ (W[i - 15] >>> 3), s1 = rot(W[i - 2], 17) ^ rot(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
      const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return [...H].map((x) => x.toString(16).padStart(8, '0')).join('');
}

// ---------- the reading ----------
// Keys the engine reads, per object; any other key is said to be unused (strict lint, task B1, refuses them).
const SPELL_KEYS = ['id', 'name', 'source', 'level', 'school', 'classes', 'time', 'range', 'components', 'costly', 'duration', 'concentration', 'ritual', 'target', 'effects',
  'higher', 'tier', 'checked', 'text', 'kinds', 'choice', 'terrain', 'zone', 'reaction'];
const STEP_KEYS = {
  attack: ['kind', 'bonus'], save: ['half', 'dc', 'advantageIf'], damage: ['type', 'times'], heal: ['addMod', 'atLeast'], tempHp: ['addMod', 'atLeast'], condition: ['ends'],
  modifier: ['ends', 'to'], move: ['dir', 'largest'], fall: [], set: ['of'], reveal: [], resource: [], counter: [], teleport: ['see'], cure: [], kill: [], remains: [],
  endConcentration: [], manual: [], summon: ['forms', 'types', 'variants', 'count', 'reassert', 'on', 'over', 'one', 'bond'],
};
const MOD_KEYS = ['on', 'op', 'value', 'types', 'scope', 'against', 'uses', 'once', 'onFail', 'cost', 'except', 'stack', 'spell', 'when'];

export function readEntry(kind, entry, ctx = {}) {
  void ctx;
  try {
    return readOrThrow(kind, entry);
  } catch {
    return { kind: (typeof kind === 'string' && Object.hasOwn(KIND_NAMES, kind) ? KIND_NAMES[kind] : typeof kind === 'string' ? kind.slice(0, 20) : ''), title: '(unreadable entry)', tier: null, lines: ['The reader could not read this entry. It cannot be approved.'], doesNot: [], numbers: [], text: null, problems: ['The entry could not be read.'], hash: null };
  }
}

// The kinds of entry (the pack's list names, and the singular) and which of them are read so far.
export const KIND_NAMES = { spell: 'spell', spells: 'spell', monster: 'monster', monsters: 'monster', item: 'item', items: 'item', feat: 'feat', feats: 'feat',
  weapon: 'weapon', weapons: 'weapon', armour: 'armour', armor: 'armour', object: 'object', objects: 'object' };
export const READ_KINDS = ['spell', 'monster'];
const IS_THE = { spell: 'a spell', monster: 'a monster', item: 'an item', feat: 'a feat', weapon: 'a weapon', armour: 'armour', object: 'an object' };

function readOrThrow(kind, entry) {
  const problems = [];
  const k = typeof kind === 'string' && Object.hasOwn(KIND_NAMES, kind) ? KIND_NAMES[kind] : null;
  if (!k || !READ_KINDS.includes(k)) {
    const say = k ? `The reader does not read ${k === 'armour' ? 'armour' : `${k}s`} yet; this kind of entry is not read.` : 'The reader does not know this kind of entry.';
    return { kind: k ?? clean(typeof kind === 'string' ? kind : '', 20), title: '(not read)', tier: null, lines: [say], doesNot: [], numbers: [], text: null, problems: [], hash: null };
  }
  const { value: e, over } = tidy(entry, problems);
  if (over || !isObj(e)) {
    const why = over ? 'This entry is too large or too deeply nested to read. It cannot be approved.' : `This is not ${IS_THE[k]} entry (it is not an object). It cannot be approved.`;
    return { kind: k, title: '(unreadable entry)', tier: null, lines: [why], doesNot: [], numbers: [], text: null, problems: [...problems, why], hash: null };
  }
  const R = k === 'monster' ? new MonsterReading(e, problems) : new Reading(e, problems);
  if (k === 'monster') R.monster(); else R.spell();
  return R.result(sha256(canonical(e)));
}

class Reading {
  constructor(def, problems) {
    this.def = def;
    this.lines = [];
    this.doesNot = [];
    this.numbers = [];
    this.problems = problems;
    this.cut = 0;
    this.kind = 'spell';
    this.actor = 'the caster';          // who acts in a step's sentence: a monster's action is its creature's
    this.mon = false;                   // reading a monster (its actions' steps, not a spell's)
    this.base = 0;                      // extra indent, for the steps of an action under its heading
    this.manualSteps = 0;
    this.pre = '';                      // path prefix of the numbers an action holds (`actions.0.`)
  }
  line(text, depth = 0) {
    if (this.lines.length >= READER_LIMITS.lines) { this.cut++; return; }
    this.lines.push(`${'  '.repeat(Math.min(depth + this.base, 12))}${cap(this.voice(text), READER_LIMITS.line)}`);
  }
  dm(text) { if (this.doesNot.length < READER_LIMITS.lines) this.doesNot.push(cap(this.voice(text), READER_LIMITS.line)); }
  // The step sentences were written for a spell's caster; a creature's action is said in its own words.
  voice(text) {
    if (!this.mon) return text;
    // Never inside quotes: that is the author's own text.
    return text.split(/("[^"]*")/).map((part, i) => (i % 2 ? part : part.replace(/\b([Tt])he caster\b/g, (m, c) => (c === 'T' ? 'The creature' : 'the creature')).replace(/\bthe spell\b/g, 'the action').replace(/\ba spell\b(?! attack)/g, 'an action'))).join('');
  }
  bad(text) { if (this.problems.length < READER_LIMITS.problems) this.problems.push(cap(text, READER_LIMITS.line)); }
  num(at, value, unit) { if (this.numbers.length < READER_LIMITS.numbers) this.numbers.push({ at, value, unit }); }
  odd(obj, known, where) {
    for (const k of Object.keys(obj)) if (!known.includes(k)) this.bad(`${where} has a key ${shown(k)} the engine does not use.`);
  }
  title() { const n = this.def.name; return typeof n === 'string' && n.trim() ? clean(n, READER_LIMITS.title) : '(no name)'; }
  // The subject of a step inside a branch.
  it() { return this.aim === 'self' ? this.actor : 'it'; }
  result(hash) {
    if (this.cut) this.lines.push(`… and ${this.cut} more lines not shown.`);
    const d = this.def;
    return {
      kind: this.kind, title: this.title(), tier: TIERS.includes(d.tier) ? d.tier : null,
      lines: this.lines, doesNot: this.doesNot, numbers: this.numbers, text: typeof d.text === 'string' ? clean(d.text, READER_LIMITS.text) : null, problems: this.problems, hash,
    };
  }

  // `addMod` in a creature's action (effects.js: `step.addMod ? src.healMod : 0`; a creature's action has no `healMod`).
  noMod(at) {
    this.bad(`Step ${at}: a creature's action has no spellcasting modifier, so \`addMod\` makes the amount not a number.`);
    this.line('The engine has no spellcasting modifier for a creature\'s action: adding it makes the amount not a number, and the creature\'s Hit Points with it. This entry should not be approved.', 1);
    this.dm(`The healing of step ${at}: it adds a modifier the engine does not have.`);
  }

  // ----- the spell as a whole -----
  spell() {
    const d = this.def;
    this.odd(d, SPELL_KEYS, 'The spell');
    this.header();
    this.casting();
    const t = isObj(d.target) ? d.target : null;
    if (!t) this.bad('The spell has no target the reader can read.');
    const aim = this.aimOf(t);
    this.aim = aim;
    // A spell that lasts makes a lasting effect; an instant one makes a bound effect only if a step ends on a turn, a save or damage.
    this.lasting = d.duration !== 'instant' || this.bound();
    this.fx = d.duration !== 'instant' ? 'spell' : this.lasting ? 'bound' : null;
    this.choice();
    const steps = Array.isArray(d.effects) ? d.effects : null;
    if (!steps || !steps.length) this.bad('The spell has no list of steps the reader can read.');
    if (aim === 'none') {
      this.line(`The engine cannot lay out this area (${this.noneWhy}), so it has nobody to apply the steps to: it hands each step below to the DM.`);
      this.dm('Every step of this spell: the engine cannot lay out its area.');
    }
    if (d.zone !== undefined) this.zone(aim);
    let who = d.zone !== undefined ? 'that creature' : this.subject(t);
    const first = steps?.[0];
    // A first step whose sentence does not speak of the target: name the target first.
    const silent = isObj(first) && (['manual', 'set', 'resource', 'counter', 'summon'].some((x) => x in first) || ('reveal' in first && first.reveal !== 'target') || ('modifier' in first && first.to === 'caster'));
    if (who !== 'the caster' && d.zone === undefined && silent) { this.line(`It is aimed at ${who}.`); who = who.startsWith('each ') ? 'each of them' : 'the target'; }
    if (steps) this.steps(steps, 'effects', 0, who, { top: true });
    this.aiming(t, aim);
    this.terrain(aim);
    this.higher();
    this.duration();
    this.tierLine();
    this.line(d.checked === true ? 'Marked as checked against the rules text.' : 'Not checked against any rulebook.');
  }

  header() {
    const d = this.def, bits = [];
    const lvl = isInt(d.level) && d.level >= 0 && d.level <= 9 ? d.level : null;
    if (lvl === null) this.bad('The spell\'s level is not a whole number from 0 to 9.'); else this.num('level', d.level, 'spell level');
    const school = SCHOOLS.includes(d.school) ? d.school : null;
    if (!school) this.bad('The spell\'s school is not one the engine knows.');
    bits.push(lvl === 0 ? `${school ?? 'unknown school'} cantrip` : `level ${lvl ?? '?'} ${school ?? 'spell of an unknown school'}`);
    if (d.range === 'self' || d.range === 'touch') bits.push(d.range);
    else if (typeof d.range === 'number' && d.range > 0) { bits.push(`${d.range} feet`); this.num('range', d.range, 'feet'); } else { bits.push('unreadable range'); this.bad('The spell\'s range is not self, touch or feet.'); }
    if (CAST_TIMES.includes(d.time)) { bits.push(CAST_TIME_WORDS[d.time]); const m = /^(\d+) /.exec(d.time); if (m) this.num('time', d.time, 'casting time'); } else { bits.push('unreadable casting time'); this.bad('The spell\'s casting time is not one the engine knows.'); }
    if (isDuration(d.duration)) { bits.push(d.duration); if (/^\d/.test(d.duration)) this.num('duration', d.duration, 'duration'); } else { bits.push('unreadable duration'); this.bad('The spell\'s duration is not one the engine knows.'); }
    if (d.concentration === true) bits.push('concentration');
    this.line(`${this.title()} (${bits.join(', ')}).`);
    const comps = Array.isArray(d.components) ? d.components.filter((c) => ['v', 's', 'm'].includes(c)) : [];
    if (!Array.isArray(d.components) || comps.length !== d.components.length) this.bad('The spell\'s components are not a list of v, s and m.');
    const cw = { v: 'Verbal', s: 'Somatic', m: 'Material' };
    if (comps.length) this.line(`Components: ${list(comps.map((c) => cw[c]))}${comps.includes('v') ? ' (speaking it gives away a hidden caster)' : ''}${d.costly === true ? '; the Material component has a cost or is used up, so Subtle Spell cannot hide the casting' : ''}.`);
    else this.line('Components: none.');
    if (typeof d.concentration !== 'boolean' || typeof d.ritual !== 'boolean') this.bad('concentration and ritual are not both true or false.');
    if (d.ritual === true) this.line('It is marked as a ritual. The engine has no ritual casting: casting it as a ritual is the DM\'s.');
    if (Array.isArray(d.classes) && d.classes.length) this.line(`On the spell lists of: ${list(d.classes.slice(0, 20).map((c) => (typeof c === 'string' && ID.test(c) ? c : 'an unreadable class')))}.`);
    if (d.kinds !== undefined && !(Array.isArray(d.kinds) && d.kinds.every((x) => SPELL_KINDS.includes(x)))) this.bad('`kinds` is not a list of damage, healing, control and utility.');
    const kinds = this.structOk() ? spellKinds(d) : [];
    this.line(kinds.length ? `Sorted under: ${list(kinds.map((x) => KIND_WORDS[x]))}.` : 'Sorted under no kind: the engine cannot tell what it is for, so the list shows it under every kind.');
  }

  casting() {
    const d = this.def;
    if (d.time === 'action' || d.time === 'bonus') return;
    if (d.time === 'reaction') {
      const r = d.reaction;
      if (!isObj(r)) {
        this.line('It is cast as a Reaction, but it names nothing that sets it off. The engine does not cast it; the DM applies it.');
        return this.dm('Casting it: a Reaction with nothing named to set it off.');
      }
      this.odd(r, ['on', 'blocks'], 'The reaction');
      if (!REACTION_TRIGGERS.includes(r.on)) return this.bad('The reaction names no trigger the engine knows.');
      this.line(`It is cast as a Reaction, by the caster's standing instruction for it, ${REACTION_WORDS[r.on]}.`);
      if (Array.isArray(r.blocks) && r.blocks.length) this.line(`Being aimed at by ${list(r.blocks.slice(0, 10).map((x) => nameOf('spells', x)), 'or')} also sets it off, and while it lasts that spell does the caster no damage.`);
      return;
    }
    if (CAST_TIMES.includes(d.time)) this.line(`It takes ${CAST_TIME_WORDS[d.time]} to cast, so it cannot be cast during a fight.`);
  }

  structOk() {
    let ok = true, n = 0;
    const visit = (steps, depth) => {
      if (!Array.isArray(steps) || depth > READER_LIMITS.depth) { ok = false; return; }
      for (const st of steps) {
        if (++n > READER_LIMITS.nodes || !isObj(st)) { ok = false; return; }
        if (isObj(st.modifier) && typeof st.modifier.on !== 'string') ok = false;
        for (const b of BRANCHES) if (st[b] !== undefined) visit(st[b], depth + 1);
      }
    };
    visit(this.def.effects, 0);
    return ok;
  }
  // Every step, depth first, in the order effects.js walks them.
  walk(visit) {
    const go = (steps, path, depth) => {
      if (!Array.isArray(steps) || depth > READER_LIMITS.depth) return;
      steps.forEach((st, i) => { if (!isObj(st)) return; visit(st, `${path}.${i}`); for (const b of BRANCHES) if (Array.isArray(st[b])) go(st[b], `${path}.${i}.${b}`, depth + 1); });
    };
    go(this.def.effects, 'effects', 0);
  }
  bound() {
    let b = false;
    this.walk((st) => { if (isObj(st.ends) && ['turnStart', 'turnEnd', 'save', 'damaged'].includes(st.ends.on)) b = true; });
    return b;
  }

  aimOf(t) {
    if (!t) return 'none';
    const kinds = ['self', 'creature', 'area'].filter((k) => k in t);
    if (kinds.length !== 1) { this.bad('The target names none, or more than one, of self, creature and area.'); this.noneWhy = 'the target is unreadable'; return 'none'; }
    this.odd(t, ['self', 'creature', 'area'], 'The target');
    if (t.self) return 'self';
    if (t.creature) { if (!isObj(t.creature)) { this.bad('`target.creature` is not an object.'); t.creature = {}; } return 'creature'; }
    const a = t.area;
    if (!isObj(a) || !AREA_SHAPES.includes(a.shape) || !(typeof a.size === 'number' && a.size > 0)) { this.bad('The area has no shape the engine knows, or no size in feet.'); this.noneWhy = 'its shape or size is unreadable'; return 'none'; }
    this.odd(a, ['shape', 'size', 'height', 'width', 'exceptCaster', 'types', 'choose', 'count', ...(this.mon ? ['range'] : [])], 'The area');
    const range = feetOf(this.def.range);
    // A spell's sphere is centred within its range, at least 1 foot; a creature's action goes off only where its own `range` says.
    const within = !this.mon && ['sphere', 'cylinder'].includes(a.shape) ? Math.max(1, typeof range === 'number' ? range : 0) : range;
    if (aimable(a, within)) return 'area';
    this.noneWhy = a.count > 1 ? `the caster arranges ${a.count} of these shapes` : a.shape === 'line' ? 'a line placed at a distance is the DM\'s to place'
      : this.mon && ['sphere', 'cylinder'].includes(a.shape) ? `a ${a.shape} goes off at a point within its range, and this one names no range` : a.shape === 'cube' ? 'a cube that large cannot be placed by the engine' : 'it cannot be aimed with this range';
    return 'none';
  }
  // Who the first step speaks of.
  subject(t) {
    if (!t || this.aim === 'none') return 'each creature affected';
    if (t.self) return 'the caster';
    if (t.area) return `each creature in ${AREA_WORDS[t.area.shape](t.area)}`;
    const c = t.creature, n = isInt(c.count) ? c.count : 1;
    const where = this.def.range === 'touch' ? 'the caster touches' : typeof this.def.range === 'number' ? `within ${this.def.range} feet` : 'in range';
    if (c.repeat === true) return n > 1 ? `each of up to ${n} targets (rays, darts or beams) ${where === 'the caster touches' ? 'the caster touches' : where}` : `one target ${where}`;
    return n > 1 ? `each of up to ${n} creatures ${where}` : `one creature ${where}`;
  }

  // How it is aimed, said after the steps.
  aiming(t, aim) {
    const d = this.def;
    if (!t) return;
    if (t.creature && !this.mon) {
      const c = t.creature;
      if (c.count !== undefined) { if (isInt(c.count)) this.num('target.creature.count', c.count, 'creatures'); else this.bad('`target.creature.count` is not a whole number.'); }
      if (c.within !== undefined) { if (isInt(c.within)) this.num('target.creature.within', c.within, 'feet'); else this.bad('`target.creature.within` is not feet.'); }
      this.odd(c, ['count', 'repeat', 'within'], 'The creature target');
      const harmful = this.harmful();
      const bits = [];
      bits.push(c.repeat === true ? 'The caster picks a creature for each one, and may pick one creature more than once' : 'The caster picks the creatures, each one only once');
      if (harmful) bits.push('none of them can be the caster, since the spell does harm');
      if (isInt(c.within)) bits.push(`every target after the first must be within ${c.within} feet of the first`);
      bits.push('a wall between the caster and a creature keeps it from being picked');
      this.line(`${bits.join('; ')}.`);
      if (this.damageOutside() && ((isInt(c.count) && c.count > 1) || this.def.higher?.slot?.targets || this.def.higher?.targets) && c.repeat !== true) this.line('Damage that is not behind an attack roll is rolled once, and every target takes the same roll.');
      if (c.repeat === true && this.damageOutside()) this.line('Each ray, dart or beam rolls its own damage.');
    }
    if (t.area && aim !== 'none') {
      const a = t.area;
      this.num(`${this.pre}target.area.size`, a.size, 'feet');
      if (a.height !== undefined) { if (a.shape === 'cylinder' && typeof a.height === 'number') this.num(`${this.pre}target.area.height`, a.height, 'feet'); else this.bad('`height` is for a cylinder, in feet.'); }
      if (a.width !== undefined) { if (isInt(a.width)) this.num(`${this.pre}target.area.width`, a.width, 'feet'); else this.bad('`width` is not feet.'); }
      const range = typeof d.range === 'number' ? d.range : 0;
      const bits = [`The ${a.shape} ${AREA_PLACE[a.shape](range)}`];
      bits.push(a.exceptCaster === true || (d.zone !== undefined && a.shape === 'emanation') ? 'it catches every creature in it except the caster' : 'it catches every creature in it, the caster too if the caster is in it');
      bits.push('a wall between the area\'s origin and a creature keeps that creature out');
      this.line(`${bits.join('; ')}.`);
      if (isInt(a.choose) && this.mon) {
        // engine/world.js `aimArea` never reads `choose` (engine/casting.js does, for a spell): every creature in the area is affected.
        this.num(`${this.pre}target.area.choose`, a.choose, 'creatures');
        this.line(`The entry says the creature picks up to ${a.choose} of those caught, but the engine does not do that for a creature's action: every creature caught is affected. The DM leaves out any it should not.`);
        this.dm(`Leaving out all but ${a.choose} of the creatures caught, as the entry's \`choose\` says: the engine does not.`);
      } else if (isInt(a.choose)) { this.num(`${this.pre}target.area.choose`, a.choose, 'creatures'); this.line(`Of those caught, the caster picks up to ${a.choose} creatures; only they are affected.`); }
      if (a.types !== undefined) {
        const ts = Array.isArray(a.types) ? a.types.filter((x) => CREATURE_TYPES.includes(x)) : [];
        const only = ts.length ? list(ts.map(cap1), 'or') : 'some creature types';
        if (d.zone === undefined) this.line(`The entry limits the area to ${only}: of the creatures caught, only those are affected.`);
        else {
          this.line(`The entry limits the area to ${only}: of the creatures caught when it is cast, only those are affected. A creature of another type that enters the area later, or starts or ends its turn there, is affected all the same: the engine does not apply the limit to a zone, and says so to the DM (once for each creature in a round), who undoes it.`);
          this.dm('Undoing what a zone does to a creature of another type than its `types`, when the engine tells the DM it went off on one.');
        }
      }
      if (d.zone === undefined && this.damageOutside()) this.line('Damage that is not behind an attack roll is rolled once, and every creature caught takes the same roll.');
    }
    if (t.area && aim === 'none') {
      const a = t.area;
      if (isObj(a)) {
        if (typeof a.size === 'number') this.num(`${this.pre}target.area.size`, a.size, 'feet');
        if (typeof a.height === 'number') this.num(`${this.pre}target.area.height`, a.height, 'feet');
        if (isInt(a.width)) this.num(`${this.pre}target.area.width`, a.width, 'feet');
        if (isInt(a.count)) this.num(`${this.pre}target.area.count`, a.count, 'shapes');
        if (isInt(a.choose)) this.num(`${this.pre}target.area.choose`, a.choose, 'creatures');
        if (AREA_SHAPES.includes(a.shape) && a.size > 0) this.line(`The area is ${isInt(a.count) && a.count > 1 ? `${a.count} of ${AREA_WORDS[a.shape](a)}, arranged by the caster` : AREA_WORDS[a.shape](a)}; the DM decides who is caught.`);
      }
    }
    if (this.mon) return;
    if (t.self && d.zone === undefined && !this.def.effects?.some?.((st) => isObj(st) && 'summon' in st)) this.line('It is aimed at the caster alone.');
    if (this.anySave(true)) this.line('Saving throws are against the caster\'s spell save DC.');
    if (this.anyAttack()) this.line('Spell attack rolls use the caster\'s spell attack bonus; a ranged one reaches as far as the spell\'s range, a melee one 5 feet. A Critical Hit doubles the damage dice behind it.');
  }
  harmful() {
    let h = false;
    this.walk((st) => {
      const k = STEPS.find((x) => x in st);
      if (k === 'attack' || k === 'save' || k === 'damage' || k === 'fall' || (k === 'condition' && !BENEFICIAL_CONDITIONS.includes(st.condition))) h = true;
      if (k === 'modifier' && isObj(st.modifier) && st.modifier.against) h = true;
    });
    return h;
  }
  damageOutside() {
    let found = false;
    const go = (steps, inAttack, depth) => {
      if (!Array.isArray(steps) || depth > READER_LIMITS.depth) return;
      for (const st of steps) { if (!isObj(st)) continue; if ('damage' in st && !inAttack) found = true; for (const b of BRANCHES) go(st[b], inAttack || 'attack' in st, depth + 1); }
    };
    go(this.def.effects, false, 0);
    return found;
  }
  anySave(noDc) { let f = false; this.walk((st) => { if ('save' in st && (!noDc || st.dc === undefined)) f = true; if (isObj(st.ends) && st.ends.on === 'save' && noDc) f = true; }); return f; }
  anyAttack() { let f = false; this.walk((st) => { if ('attack' in st && st.kind === 'spell') f = true; }); return f; }

  choice() {
    const c = this.def.choice;
    if (c === undefined) return;
    if (!isObj(c) || !Object.hasOwn(CHOICES, c.of)) return this.bad('The choice is not of a skill, an ability, a damage type or a condition.');
    this.odd(c, ['of', 'from'], 'The choice');
    const from = Array.isArray(c.from) ? c.from.filter((x) => CHOICES[c.of].includes(x)) : null;
    const word = (x) => (c.of === 'ability' ? ABILITY_WORDS[x] : c.of === 'condition' ? cond(x) : c.of === 'skill' ? x.replace(/-/g, ' ') : x);
    this.line(`When casting it, the caster chooses ${CHOICE_WORDS[c.of]}${from ? ` (${list(from.map(word), 'or')})` : ''}; each step below that says "chosen" uses that choice.`);
  }

  zone(aim) {
    const z = this.def.zone;
    if (!isObj(z) || !Array.isArray(z.on)) return this.bad('The zone is not an object with a list `on`.');
    this.odd(z, ['on', 'once', 'atCast', 'spare'], 'The zone');
    const a = this.def.target?.area;
    if (aim !== 'area' || !isObj(a)) {
      this.line('The entry asks for an area that stays, but the engine cannot lay this area out, so no zone is made: the DM runs it.');
      return this.dm('The lasting area: the engine cannot lay it out.');
    }
    const when = z.on.filter((x) => Object.hasOwn(ZONE_ON_WORDS, x)).map((x) => ZONE_ON_WORDS[x]);
    const moves = a.shape === 'emanation' ? 'It moves with the caster and never affects the caster.' : 'It stays where it was laid out.';
    this.line(`${cap1(AREA_WORDS[a.shape](a))} stays for as long as the spell lasts. ${moves}`);
    this.line(z.atCast === true ? 'As it appears, the steps below run on each creature in it.' : 'As it appears it affects nobody.');
    this.line(`From then on, the steps below run on a creature each time it ${list(when, 'or')}${z.once === 'turn' ? ', at most once a turn for each creature' : ''}.${this.damageOutside() ? ' Each creature rolls its own damage.' : ''}`);
    if (z.spare === true) this.line('When casting it, the caster may name creatures the area leaves alone.');
  }

  terrain(aim) {
    const t = this.def.terrain;
    if (t === undefined) return;
    if (!isObj(t)) return this.bad('`terrain` is not an object.');
    this.odd(t, ['difficult', 'obscured', 'lasts'], 'The terrain');
    if (aim !== 'area') {
      this.line('The entry changes the ground in its area, but the engine cannot lay the area out: the DM marks it.');
      return this.dm('The changed ground: the engine cannot lay out the area.');
    }
    const what = [t.difficult === true ? 'Difficult Terrain' : null, t.obscured === 'heavy' ? 'Heavily Obscured' : t.obscured === 'light' ? 'Lightly Obscured' : null].filter(Boolean);
    if (!what.length) return this.bad('`terrain` makes the area neither difficult nor obscured.');
    this.line(`The area is ${list(what)} ${t.lasts === 'nextTurnEnd' ? 'until the end of the caster\'s next turn' : 'for as long as the spell lasts'}.`);
  }

  // What grows with the slot or the caster's level (effects.js scaleSteps, targetCount).
  higher() {
    const h = this.def.higher;
    if (h === undefined) return;
    if (!isObj(h)) return this.bad('`higher` is not an object.');
    this.odd(h, ['level', 'targets', 'slot'], '`higher`');
    const firstOf = (key) => { let f = null; this.walk((st, at) => { if (!f && key in st) f = { st, at }; }); return f; };
    const lvl = this.def.level;
    if (isObj(h.level)) {
      const dmg = firstOf('damage'), keys = Object.keys(h.level).filter((x) => /^\d+$/.test(x)).sort((a, b) => a - b);
      const parts = [];
      for (const l of keys) {
        this.num(`higher.level.${l}:key`, +l, 'character level');
        const v = h.level[l];
        if (isDice(v)) { this.num(`higher.level.${l}`, v, 'dice'); parts.push(`${v} at character level ${l}`); } else this.bad(`\`higher.level.${l}\` is not dice.`);
      }
      if (parts.length) this.line(dmg ? `As the caster gains levels, the first damage step (${dmg.st.damage}) becomes ${list(parts)}.` : `The entry grows damage by character level (${list(parts)}), but it has no damage step: nothing grows.`);
    }
    if (isObj(h.targets)) {
      const keys = Object.keys(h.targets).filter((x) => /^\d+$/.test(x)).sort((a, b) => a - b), parts = [];
      for (const l of keys) {
        this.num(`higher.targets.${l}:key`, +l, 'character level');
        const v = h.targets[l];
        if (isInt(v)) { this.num(`higher.targets.${l}`, v, 'targets'); parts.push(`${v} at character level ${l}`); } else this.bad(`\`higher.targets.${l}\` is not a whole number.`);
      }
      if (parts.length) this.line(`As the caster gains levels, the number of targets becomes ${list(parts)}.`);
    }
    if (h.slot !== undefined) {
      const s = h.slot;
      if (!isObj(s)) return this.bad('`higher.slot` is not an object.');
      this.odd(s, ['damage', 'heal', 'tempHp', 'times', 'targets', 'value'], '`higher.slot`');
      const above = isInt(lvl) ? (lvl === 0 ? 'above 0' : `above ${ordinal(lvl)}`) : 'above its own';
      const per = `for each level ${above}`;
      for (const key of ['damage', 'heal', 'tempHp']) {
        if (s[key] === undefined) continue;
        if (!isDice(s[key])) { this.bad(`\`higher.slot.${key}\` is not dice.`); continue; }
        this.num(`higher.slot.${key}`, s[key], 'dice');
        const f = firstOf(key);
        const word = { damage: 'damage', heal: 'healing', tempHp: 'Temporary Hit Points' }[key];
        if (!f) { this.line(`The entry adds ${s[key]} ${word} per slot level, but it has no ${key} step: nothing grows.`); continue; }
        const sides = (x) => (/d(\d+)/.exec(x)?.[1] ?? null);
        const ok = !sides(f.st[key]) || !sides(s[key]) || sides(f.st[key]) === sides(s[key]);
        if (ok) this.line(`Cast with a higher slot, ${signed(s[key])}${key === 'heal' ? ' healing' : key === 'tempHp' ? ' Temporary Hit Points' : ''} ${per}.`);
        else { this.line(`Cast with a higher slot, the entry adds ${s[key]} per slot level to ${f.st[key]}, but those are different dice: the engine does not add them, the DM does.`); this.dm(`The extra ${s[key]} per slot level: different dice from ${f.st[key]}.`); }
      }
      if (s.times !== undefined) { if (isInt(s.times)) { this.num('higher.slot.times', s.times, 'rolls'); this.line(`Cast with a higher slot, the first damage step is rolled ${s.times} more time${s.times > 1 ? 's' : ''} ${per}.`); } else this.bad('`higher.slot.times` is not a whole number.'); }
      if (s.targets !== undefined) { if (isInt(s.targets)) { this.num('higher.slot.targets', s.targets, 'targets'); this.line(`Cast with a higher slot, ${s.targets} more target${s.targets > 1 ? 's' : ''} ${per}.`); } else this.bad('`higher.slot.targets` is not a whole number.'); }
      if (s.value !== undefined) {
        if (!isInt(s.value)) this.bad('`higher.slot.value` is not a whole number.');
        else {
          this.num('higher.slot.value', s.value, 'modifier');
          let f = null; this.walk((st) => { if (!f && 'modifier' in st) f = st; });
          if (f && isObj(f.modifier) && typeof f.modifier.value === 'number') this.line(`Cast with a higher slot, the first modifier (${signed(f.modifier.value)}) grows by ${s.value} ${per}.`);
          else this.line(`The entry grows a modifier's number by ${s.value} per slot level, but its first modifier has no plain number: nothing grows.`);
        }
      }
    }
  }

  duration() {
    const d = this.def;
    if (!isDuration(d.duration)) return;
    if (d.duration === 'instant') {
      if (this.fx === 'bound') this.line('It is instant, but what its steps put on creatures stays until its own ending, as said above; a step that names no ending is the DM\'s to end.');
      else this.line('It is instant: nothing it does is kept as a lasting effect.');
    } else if (/^\d/.test(d.duration)) this.line(`It lasts up to ${d.duration}. The engine times it, and when it ends, so does everything it put on creatures.`);
    else { this.line(`It lasts ${d.duration === 'special' ? 'for a special time' : 'until dispelled'}. The engine cannot time that; the DM ends it.`); this.dm(`Ending the spell: it lasts ${d.duration === 'special' ? 'for a special time' : 'until dispelled'}.`); }
    if (d.concentration === true && d.duration !== 'instant') this.line('It needs Concentration: it also ends if the caster loses Concentration or begins concentrating on another spell.');
    if (d.concentration === true && d.duration === 'instant') this.line('It is marked Concentration, but it is instant, so there is nothing to concentrate on.');
  }

  tierLine() {
    const d = this.def;
    if (!TIERS.includes(d.tier)) return this.bad('The tier is not auto, assist or manual.');
    if (d.tier === 'auto' && this.doesNot.length) this.line('Tier: auto, but the engine hands the parts listed for the DM to the DM.');
    else this.line(TIER_WORDS[d.tier]);
    if (d.tier !== 'auto') {
      this.line('When it is cast, the DM is shown the author\'s description (unless a step has already handed something to the DM) to apply what the steps do not.');
      this.dm('Whatever the description says beyond the steps above.');
    }
  }

  // ----- steps -----
  steps(steps, path, depth, who, o = {}) {
    if (!Array.isArray(steps)) { this.bad(`${path} is not a list of steps.`); return; }
    if (depth > READER_LIMITS.depth) { this.bad(`${path} is nested too deeply.`); return; }
    if (!steps.length) this.bad(`${path} is an empty list of steps.`);
    steps.forEach((st, i) => {
      const at = `${path}.${i}`;
      const prev = i > 0 && isObj(steps[i - 1]) ? STEPS.find((k) => k in steps[i - 1]) : null;
      this.step(st, at, depth, i === 0 ? who : this.again(who), { ...o, afterDamage: prev === 'damage' });
    });
  }
  // The subject of a step after the first in its list.
  again(who) {
    if (who === 'the caster' || who === 'it' || who === 'that creature' || who === 'the target') return who;
    return who.startsWith('each ') ? 'each of them' : 'it';
  }

  step(st, at, depth, who, o) {
    if (!isObj(st)) { this.bad(`${at} is not a step.`); this.line('(A step the reader cannot read.)', depth); return; }
    const kinds = STEPS.filter((k) => k in st);
    if (kinds.length !== 1) { this.bad(`${at} names ${kinds.length ? 'several steps' : 'no step'}; each step names exactly one.`); this.line('(A step the reader cannot read.)', depth); return; }
    const kind = kinds[0];
    this.odd(st, [kind, 'when', ...STEP_KEYS[kind], ...BRANCHES], `Step ${at}`);
    for (const b of BRANCHES) if (st[b] !== undefined && !this.branchOk(kind, b)) this.bad(`Step ${at} has \`${b}\`, which a ${kind} step does not run.`);
    const Who = cap1(who);
    const when = this.whenOf(st.when, at);
    const say = (text) => this.line(`${text}${when}`, depth);
    const S = STEP_SENTENCES[kind];
    S.call(this, { st, at, depth, who, Who, say, o });
  }
  branchOk(kind, b) {
    return (b === 'onHit' || b === 'onMiss') ? kind === 'attack' : (b === 'onFail' || b === 'onSuccess') ? kind === 'save' : b === 'blocked' ? kind === 'teleport' : kind === 'damage';
  }
  // A step's `when` (effects.js exec): every tag must hold, or the step is skipped; one the engine cannot judge hands it to the DM.
  whenOf(when, at) {
    if (when === undefined) return '';
    if (!Array.isArray(when)) { this.bad(`Step ${at}: \`when\` is not a list of tags.`); return ' (with an unreadable condition)'; }
    const tags = when.filter((t) => Object.hasOwn(TAG_WORDS, t));
    if (tags.length !== when.length) this.bad(`Step ${at}: \`when\` names a situation the engine does not know.`);
    const un = tags.filter((t) => UNJUDGED_TAGS.includes(t));
    if (un.length) this.dm(`Deciding whether ${list(un.map((t) => TAG_WORDS[t]))}, each time step ${at} runs.`);
    return ` This happens only if ${list(tags.map((t) => TAG_WORDS[t]))}${un.length ? '; the engine cannot tell that, so it asks the DM each time' : ''}.`;
  }
  // How a condition or modifier put on a creature ends (rolls.js condition and modifier, durations.js boundary and damaged).
  ending(st, at, what) {
    const e = st.ends;
    if (e !== undefined && !isObj(e)) this.bad(`Step ${at}: \`ends\` is not an object.`);
    const ends = isObj(e) && ENDS_ON.includes(e.on) ? e : null;
    if (isObj(e)) this.odd(e, ['on', 'of', 'save', 'at', 'by', 'orDamaged', ...(this.mon ? ['dc'] : [])], `Step ${at}: \`ends\``);
    if (isObj(e) && this.mon && e.dc !== undefined) { if (isInt(e.dc)) this.num(`${at}.ends.dc`, e.dc, 'DC'); else this.bad(`Step ${at}: the ending's DC is not a whole number.`); }
    if (!this.fx) {
      if (what === 'modifier') return null;
      return `Nothing in the engine ends it${ends ? ' (its ending is not kept, since the spell does not last)' : ''}: the DM removes it.`;
    }
    const whose = ends?.of === 'source' ? 'the caster\'s' : 'its';
    let text;
    if (!ends && this.fx === 'bound') {
      // rolls.js: an instant spell's effect holds only what ends by itself; a condition or a modifier that names no ending is
      // kept off it, and the engine says so to the DM as it is put on (a modifier used up by use, `uses`, does end).
      if (what === 'modifier' && Number.isInteger(st.modifier?.uses)) return 'It ends when it is used up.';
      if (what === 'modifier') { this.dm(`The modifier of step ${at}: nothing in the spell ends it.`); return 'Nothing in the spell ends it, so the engine does not keep it: the DM applies it and ends it.'; }
      this.dm(`Ending what step ${at} puts on a creature: nothing ends it on its own.`);
      return 'Nothing in the engine ends it: the DM removes it.';
    }
    if (!ends) text = this.fx === 'spell' ? 'It lasts as long as the spell.' : 'Nothing ends it on its own: the DM ends it.';
    else if (ends.on === 'turnStart' || ends.on === 'turnEnd') text = `It ends at the ${ends.on === 'turnStart' ? 'start' : 'end'} of ${whose} next turn, or when the fight ends${this.fx === 'spell' ? ', even if the spell\'s time runs out first; ending the spell early ends it too' : ''}.`;
    else if (ends.on === 'save') {
      const ab = ABILITY_WORDS[ends.save] ?? 'unreadable';
      const atw = ends.at === 'turnStart' ? 'at the start of each of its turns' : ends.at === 'turnEnd' ? 'at the end of each of its turns' : ends.at === 'damaged' ? 'each time it takes damage' : 'at an unreadable time';
      if (this.mon) {
        // rolls.js condition: the repeated save's DC is `step.dc ?? src.dc`. A condition step cannot hold `dc` (the linter), and a
        // creature's action has no `src.dc`, so the engine rolls the save against no DC and it never succeeds (DEBT T34).
        this.dm(`Ending what step ${at} puts on a creature: its repeated save has no DC the engine reads, so only the DM can end it.`);
        return `It would make ${/^[AEIOU]/.test(ab) ? 'an' : 'a'} ${ab} saving throw ${atw}, and a success would end it${ends.orDamaged === true ? '; any damage it takes would also end it' : ''}. But the engine rolls that save against no DC${ends.dc !== undefined ? ` (the entry's own DC for it, ${ends.dc}, is not read)` : ''}, so it never succeeds: the DM ends it.`;
      }
      text = `It makes ${/^[AEIOU]/.test(ab) ? 'an' : 'a'} ${ab} saving throw ${atw}, against the caster's spell save DC; a success ends it${ends.orDamaged === true ? '. Any damage it takes also ends it' : ''}${this.fx === 'spell' ? '. It also ends with the spell' : ''}.`;
    } else {
      text = `It ends when it takes damage${ends.by === 'source' ? ' from the caster or the caster\'s side' : ''}${this.fx === 'spell' ? ', or with the spell' : ''}.`;
      if (this.fx === 'bound') text += ' Nothing else ends it: it stays through the end of a fight and a rest until then, or until the DM ends it.';
    }
    return text;
  }
}

// One sentence maker per step kind (STEPS). `this` is the Reading. A test holds the keys equal to STEPS.
export const STEP_SENTENCES = {
  attack({ st, at, depth, who, say }) {
    const kind = st.kind === 'weapon' ? 'weapon' : st.kind === 'spell' ? 'spell' : null;
    if (!['melee', 'ranged'].includes(st.attack) || !kind) this.bad(`Step ${at}: the attack is not melee or ranged, spell or weapon.`);
    let bonus = '';
    if (kind === 'weapon') { if (isInt(st.bonus)) { this.num(`${at}.bonus`, st.bonus, 'to hit'); bonus = ` with ${signed(st.bonus)} to hit`; } else this.bad(`Step ${at}: a weapon attack has no whole-number bonus.`); }
    say(`The caster makes a ${st.attack === 'melee' ? 'melee' : 'ranged'} ${kind ?? ''} attack roll${bonus} against ${who}.`.replace('  ', ' '));
    if (this.mon && kind === 'spell') {
      // effects.js: a spell attack takes its bonus from the spell's caster (`src.attack`); a creature's action has none.
      this.bad(`Step ${at}: a creature's action has no spell attack bonus for the engine to use.`);
      this.line('The engine has no spell attack bonus for a creature\'s action, so this roll has no total and never counts as a hit by the numbers. The entry should be a weapon attack with a bonus.', depth);
      this.dm(`The attack of step ${at}: it is a spell attack, which has no bonus in a creature's action.`);
    }
    if (st.onHit !== undefined) { this.line('On a hit:', depth); this.steps(st.onHit, `${at}.onHit`, depth + 1, this.it()); }
    if (st.onMiss !== undefined) { this.line('On a miss:', depth); this.steps(st.onMiss, `${at}.onMiss`, depth + 1, this.it()); }
    if (st.onHit === undefined && st.onMiss === undefined) this.bad(`Step ${at}: an attack with nothing on a hit or a miss.`);
  },
  save({ st, at, depth, Who, say }) {
    const ab = ABILITY_WORDS[st.save];
    if (!ab) this.bad(`Step ${at}: the save names no ability.`);
    let dc = '';
    if (st.dc !== undefined) { if (isInt(st.dc)) { this.num(`${at}.dc`, st.dc, 'DC'); dc = ` against DC ${st.dc}`; } else this.bad(`Step ${at}: the save's DC is not a whole number.`); }
    say(`${Who} makes ${ab ? `${/^[AEIOU]/.test(ab) ? 'an' : 'a'} ${ab} saving throw` : 'a saving throw of an unreadable ability'}${dc}.`);
    if (st.advantageIf !== undefined) {
      const tags = Array.isArray(st.advantageIf) ? st.advantageIf.filter((t) => Object.hasOwn(TAG_WORDS, t)) : [];
      const un = tags.filter((t) => UNJUDGED_TAGS.includes(t));
      this.line(`It has Advantage on this save if ${list(tags.map((t) => TAG_WORDS[t]))}${un.length ? '; the engine cannot tell that, so the DM decides' : ''}.`, depth);
      if (un.length) this.dm(`Deciding Advantage on the save of step ${at}.`);
    }
    const fail = Array.isArray(st.onFail) ? st.onFail : null, succ = st.onSuccess;
    const half = st.half === true && fail;
    // The plain case: a failure deals damage, a success half of it.
    const simple = half && succ === undefined && fail.length > 0 && fail.every((x) => isObj(x) && STEPS.filter((k) => k in x).length === 1 && 'damage' in x && isDice(x.damage)
      && (DAMAGE_TYPES.includes(x.type) || x.type === 'chosen') && x.when === undefined && x.times === undefined && BRANCHES.every((b) => x[b] === undefined)
      && Object.keys(x).every((k) => ['damage', 'type'].includes(k)));
    if (simple) {
      fail.forEach((x, i) => this.num(`${at}.onFail.${i}.damage`, x.damage, 'dice'));
      this.line(`On a failure it takes ${list(fail.map((x) => `${x.damage} ${x.type === 'chosen' ? 'damage of the chosen type' : `${x.type} damage`}`))}; on a success, half.`, depth);
      return;
    }
    if (st.onFail !== undefined) { this.line('On a failure:', depth); this.steps(st.onFail, `${at}.onFail`, depth + 1, this.it()); }
    if (half) this.line('On a success, the failure steps run at half: their damage is halved, a roll among them is still made, and nothing else in them happens.', depth);
    else if (st.half === true) this.line('It says half on a success, but it has no failure steps to halve: a success runs the success steps.', depth);
    if (succ !== undefined) {
      if (half) { this.line('The entry also lists steps for a success, but the engine never runs them: a success already runs the failure steps at half.', depth); this.bad(`Step ${at}: success steps beside half are never run.`); }
      else { this.line('On a success:', depth); this.steps(succ, `${at}.onSuccess`, depth + 1, this.it()); }
    }
    if (st.onFail === undefined && succ === undefined) this.bad(`Step ${at}: a save with nothing on a failure or a success.`);
  },
  damage({ st, at, depth, Who, say, o }) {
    if (!isDice(st.damage)) this.bad(`Step ${at}: the damage is not dice like 2d6+3.`); else this.num(`${at}.damage`, st.damage, 'dice');
    const type = st.type === 'chosen' ? 'damage of the chosen type' : DAMAGE_TYPES.includes(st.type) ? `${st.type} damage` : 'damage of an unreadable type';
    if (st.type !== 'chosen' && !DAMAGE_TYPES.includes(st.type)) this.bad(`Step ${at}: the damage type is not one the engine knows.`);
    let times = '';
    if (st.times !== undefined) { if (isInt(st.times) && st.times > 0) { this.num(`${at}.times`, st.times, 'rolls'); if (st.times > 1) times = `, rolled ${st.times} times and added up`; } else this.bad(`Step ${at}: \`times\` is not a positive whole number.`); }
    say(`${Who} takes ${isDice(st.damage) ? st.damage : '(unreadable dice)'} ${type}${times}.${o.afterDamage ? ' It lands together with the damage before it, as one instance of damage.' : ''}`);
    if (st.onZero !== undefined) { this.line('If this damage drops it to 0 Hit Points:', depth); this.steps(st.onZero, `${at}.onZero`, depth + 1, this.it()); }
    if (st.onKill !== undefined) { this.line('If this damage kills it:', depth); this.steps(st.onKill, `${at}.onKill`, depth + 1, this.it()); }
  },
  heal({ st, at, Who, say }) {
    if (!isDice(st.heal)) this.bad(`Step ${at}: the healing is not dice.`); else this.num(`${at}.heal`, st.heal, 'dice');
    const least = isInt(st.atLeast) ? (this.num(`${at}.atLeast`, st.atLeast, 'Hit Points'), `, and at least ${st.atLeast}`) : '';
    say(`${Who} regains ${isDice(st.heal) ? st.heal : '(unreadable dice)'}${st.addMod === true && !this.mon ? ' plus the caster\'s spellcasting ability modifier' : ''} Hit Points${least}${st.addMod === true && this.mon ? ', plus a modifier the engine does not have here' : ''}.`);
    if (this.mon && st.addMod === true) this.noMod(at);
  },
  tempHp({ st, at, Who, say }) {
    if (!isDice(st.tempHp)) this.bad(`Step ${at}: the Temporary Hit Points are not dice.`); else this.num(`${at}.tempHp`, st.tempHp, 'dice');
    const least = isInt(st.atLeast) ? (this.num(`${at}.atLeast`, st.atLeast, 'Temporary Hit Points'), `, at least ${st.atLeast}`) : '';
    say(`${Who} gains ${isDice(st.tempHp) ? st.tempHp : '(unreadable dice)'}${st.addMod === true && !this.mon ? ' plus the caster\'s spellcasting ability modifier' : ''} Temporary Hit Points${least}${st.addMod === true && this.mon ? ', plus a modifier the engine does not have here' : ''}; they replace what it has only if they are more${this.fx ? ', and they vanish when the spell ends' : ''}.`);
    if (this.mon && st.addMod === true) this.noMod(at);
  },
  condition({ st, at, depth, Who, say }) {
    if (!CONDITIONS.includes(st.condition)) { this.bad(`Step ${at}: the condition is not one the engine knows.`); say(`${Who} gets a condition the engine does not know.`); return; }
    say(`${Who} has the ${cond(st.condition)} condition.`);
    const prone = st.condition === 'prone' && !this.fx;
    const end = prone ? 'It ends when the creature stands up, as Prone always does.' : this.ending(st, at, 'condition');
    if (end) this.line(end, depth + 1);
    if (st.condition === 'prone' && this.fx) this.line('The creature can also stand up out of it, as from any Prone.', depth + 1);
    if (!this.fx && !prone) this.dm(`Removing the ${cond(st.condition)} condition that step ${at} puts on.`);
    if (CONTENT.conditions[st.condition]?.also) this.line(`The engine applies part of what ${cond(st.condition)} does; the DM applies the rest.`, depth + 1);
  },
  modifier({ st, at, depth, Who, say }) {
    const m = st.modifier;
    if (!isObj(m)) { this.bad(`Step ${at}: the modifier is not an object.`); say(`${Who} gets a modifier the reader cannot read.`); return; }
    this.odd(m, MOD_KEYS, `Step ${at}: the modifier`);
    const holder = st.to === 'caster' ? 'The caster' : Who;
    say(`${holder} gets ${modPhrase.call(this, m, `${at}.modifier`)}.`);
    const extra = modExtras.call(this, m, `${at}.modifier`, st.to === 'caster');
    if (extra) this.line(extra, depth + 1);
    if (!this.fx) {
      this.line('The spell does not last, so the engine has nothing to hang this on: the DM applies it.', depth + 1);
      return this.dm(`The modifier of step ${at}: the spell does not last.`);
    }
    const end = this.ending(st, at, 'modifier');
    if (end) this.line(end, depth + 1);
  },
  move({ st, at, Who, say }) {
    if (!(isInt(st.move) && st.move > 0)) this.bad(`Step ${at}: \`move\` is not feet.`); else this.num(`${at}.move`, st.move, 'feet');
    if (!['away', 'toward'].includes(st.dir)) this.bad(`Step ${at}: \`dir\` is not away or toward.`);
    const size = typeof st.largest === 'string' && ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'].includes(st.largest) ? `If it is ${cap1(st.largest)} or smaller, it` : null;
    say(`${size ?? Who} is ${st.dir === 'toward' ? 'pulled' : 'pushed'} ${st.move} feet straight ${st.dir === 'toward' ? 'toward' : 'away from'} the caster; it stops at a wall, a drop or anything in the way.`);
  },
  fall({ st, at, Who, say }) {
    if (st.fall === 'surface') {
      say(`${Who} falls to the surface below it, taking 1d6 bludgeoning damage for each 10 feet of the drop (up to 20d6), and lands Prone if that hurt it. One already standing on a surface does not fall; one that is riding or being ridden, or has no surface under it, is left to the DM, who is told.`);
      return;
    }
    if (!(isInt(st.fall) && st.fall > 0)) { this.bad(`Step ${at}: \`fall\` is not feet or "surface".`); return say(`${Who} falls an unreadable distance.`); }
    this.num(`${at}.fall`, st.fall, 'feet');
    const dice = Math.min(20, Math.floor(st.fall / 10));
    say(dice ? `${Who} falls ${st.fall} feet, taking ${dice}d6 bludgeoning damage, and lands Prone if that hurt it.` : `${Who} falls ${st.fall} feet, too short a fall to hurt it.`);
  },
  set({ st, at, say }) {
    say(`This step would set a map object to the state ${shown(st.set)}; a spell has no object for it to work on, so the DM applies it.`);
    this.dm(`Step ${at}: setting a map object's state.`);
  },
  reveal({ st, at, Who, say }) {
    if (st.reveal === 'target') return say(`${Who} is revealed: it is no longer hidden.`);
    say('This step would reveal a map object; a spell has no object for it to work on, so the DM applies it.');
    this.dm(`Step ${at}: revealing a map object.`);
  },
  resource({ at, say }) {
    say('This step would spend or give a resource; the engine cannot do that in a spell, so the DM applies it.');
    this.dm(`Step ${at}: a resource.`);
  },
  counter({ at, say }) {
    if (this.def.reaction?.on === 'cast') return say('The spell whose casting set off this reaction fails.');
    say('This step would stop a spell, but no spell is being cast for the engine to stop: the DM applies it.');
    this.dm(`Step ${at}: stopping a spell.`);
  },
  teleport({ st, at, depth, Who, say }) {
    if (!(isInt(st.teleport) && st.teleport > 0)) this.bad(`Step ${at}: \`teleport\` is not feet.`); else this.num(`${at}.teleport`, st.teleport, 'feet');
    say(`${Who} teleports up to ${st.teleport} feet to a space the caster names when casting${st.see === true ? ', one the caster can see' : ''}. With no space named, the DM moves it.`);
    if (st.blocked !== undefined) { this.line('If that space turns out to be taken:', depth); this.steps(st.blocked, `${at}.blocked`, depth + 1, this.it()); }
  },
  cure({ st, at, Who, say }) {
    const ids = Array.isArray(st.cure) ? st.cure : [];
    const names = ids.map((c) => (c === 'chosen' ? 'the condition chosen when casting' : CONDITIONS.includes(c) ? `the ${cond(c)} condition` : null));
    if (!ids.length || names.includes(null)) this.bad(`Step ${at}: \`cure\` is not a list of conditions.`);
    say(`${Who} is rid of ${list(names.filter(Boolean)) || 'no condition the reader can read'}.`);
  },
  kill({ Who, say }) { say(`${Who} dies, even a character at 0 Hit Points.`); },
  remains({ st, at, say }) {
    if (!REMAINS.includes(st.remains)) this.bad(`Step ${at}: \`remains\` is not one the engine knows.`);
    say(`What is left of its body is ${REMAINS_WORDS[st.remains] ?? 'something unreadable'}.`);
  },
  endConcentration({ Who, say }) { say(`${Who} loses Concentration on whatever it is concentrating on.`); },
  summon({ st, at, depth, say }) { summonLines.call(this, st, at, depth, say); },
  manual({ st, at, say }) {
    this.hasManual = true; this.manualSteps++;
    const text = typeof st.manual === 'string' && st.manual.trim() ? clean(st.manual, READER_LIMITS.quote) : null;
    if (!text) this.bad(`Step ${at}: a manual step with no text.`);
    say(`The engine does not do this; the DM does this: "${text ?? '(no text)'}"`);
    this.dm(`"${text ?? '(no text)'}"`);
  },
};

// A modifier in words: what it changes and how.
function modPhrase(m, at) {
  const hook = HOOKS.includes(m.on) ? m.on : null, op = OPS.includes(m.op) ? m.op : null;
  if (!hook) this.bad(`${at}: the modifier's hook is not one the engine knows.`);
  if (!op) this.bad(`${at}: the modifier's op is not one the engine knows.`);
  if (!hook || !op) return 'a change the reader cannot read';
  if (hook === 'opportunity' && op === 'autoFail') return 'no Opportunity Attacks (it cannot make them)';
  if (op === 'crit') return `${OP_WORDS.crit('', HOOK_WORDS[hook])}`;
  let noun = HOOK_WORDS[hook];
  // What a check or save is scoped to.
  if (isObj(m.scope)) {
    const sc = m.scope;
    if (sc.skill !== undefined) noun = `${sc.skill === 'chosen' ? 'checks with the chosen skill' : typeof sc.skill === 'string' && Object.hasOwn(SKILLS, sc.skill) ? `${cap1(sc.skill.replace(/-/g, ' '))} checks` : 'checks with an unreadable skill'}`;
    else if (sc.ability !== undefined) noun = `${sc.ability === 'chosen' ? 'the chosen ability\'s' : ABILITY_WORDS[sc.ability] ?? 'an unreadable ability\'s'} ${hook === 'check' ? 'checks' : 'saving throws'}`;
    if (sc.condition !== undefined) noun = `${noun} to avoid or end the ${cond(sc.condition)} condition`;
  } else if (m.scope !== undefined) this.bad(`${at}: \`scope\` is not an object.`);
  if (['resist', 'vulnerable', 'immune'].includes(op) || (hook.startsWith('damage') && Array.isArray(m.types))) {
    const types = Array.isArray(m.types) ? m.types.map((t) => (t === 'chosen' ? 'the chosen type' : DAMAGE_TYPES.includes(t) ? t : 'an unreadable type')) : null;
    if (types && ['resist', 'vulnerable', 'immune'].includes(op)) noun = `${list(types, 'or')} damage`;
    else if (!types && ['resist', 'vulnerable', 'immune'].includes(op)) noun = 'all damage';
  }
  let v = '';
  if (['add', 'set', 'min', 'max', 'floor'].includes(op)) {
    const val = m.value;
    if (typeof val === 'number') { this.num(`${at}.value`, val, 'modifier'); v = op === 'add' ? signed(val) : `${val}${['speed', 'speed.fly'].includes(hook) ? ' feet' : ''}`; if (op === 'add' && ['speed', 'speed.fly'].includes(hook)) v += ' feet'; }
    else if (isObj(val) && typeof val.perLevel === 'number') { this.num(`${at}.value.perLevel`, val.perLevel, 'per level'); v = `${signed(val.perLevel)} for each level of it`; }
    else if (op === 'add' && typeof val === 'string' && MOD_DICE.test(val)) { this.num(`${at}.value`, val, 'dice'); v = signed(val); }
    else { this.bad(`${at}: the modifier's value is not a number${op === 'add' ? ' or dice' : ''}.`); v = '(an unreadable amount)'; }
  }
  if (op === 'add' && hook.startsWith('damage') && Array.isArray(m.types) && hook === 'damage.dealt') return `${v} ${list(m.types.map((t) => (t === 'chosen' ? 'damage of the chosen type' : `${t} damage`)), 'or')} added to the damage it deals`;
  return OP_WORDS[op](v, noun);
}
// The rest of a modifier's fields, in one sentence.
function modExtras(m, at, toCaster) {
  const bits = [];
  if (m.against === 'target') bits.push(toCaster ? 'it holds only against the spell\'s target' : 'it holds only against the spell\'s target');
  if (m.uses === 1) { this.num(`${at}.uses`, 1, 'use'); bits.push(this.inTrait ? 'a trait has no use to spend, so it applies every time' : 'the first roll it applies to uses it up'); }
  if (m.once === 'turn') bits.push('it applies at most once a turn');
  if (m.onFail === true) bits.push('the dice are added only to a roll that failed, where they could turn it');
  if (typeof m.cost === 'string') bits.push(`it spends a use of ${shown(m.cost)} when it turns a roll`);
  if (m.except === 'source') bits.push('it does not hold for rolls the caster makes');
  if (m.stack === false) bits.push('several of the same name do not add up');
  if (typeof m.spell === 'string') bits.push(`it holds only for the damage of ${nameOf('spells', m.spell)}`);
  if (m.when !== undefined) {
    const tags = Array.isArray(m.when) ? m.when.filter((t) => Object.hasOwn(TAG_WORDS, t)) : [];
    if (!Array.isArray(m.when) || tags.length !== m.when.length) this.bad(`${at}: \`when\` names a situation the engine does not know.`);
    const un = tags.filter((t) => UNJUDGED_TAGS.includes(t));
    bits.push(`it holds only when ${list(tags.map((t) => TAG_WORDS[t]))}${un.length ? ', which the engine cannot tell, so the engine never applies it' : ''}`);
    if (un.length) this.dm(`${at}: the modifier needs ${list(un.map((t) => TAG_WORDS[t]))}, which the engine cannot tell.`);
  }
  if (m.on === 'hp.max' && m.op === 'add' && !this.inTrait) bits.push('current Hit Points move with the maximum, and back when it ends');
  return bits.length ? bits.map((b) => `${cap1(b)}.`).join(' ') : null;
}
// A summon step (docs/specs/companions.md): who is made, how many, and the bond.
function summonLines(st, at, depth, say) {
  const what = st.forms !== undefined
    ? (Array.isArray(st.forms) ? `one form the caster picks from ${list(st.forms.slice(0, 40).map((x) => nameOf('monsters', x)), 'or')}`
      : isObj(st.forms) ? `a ${cap1(String(st.forms.type))} of challenge rating exactly ${typeof st.forms.cr === 'number' ? st.forms.cr : '?'}, which the caster picks` : 'an unreadable form')
    : Object.hasOwn(CONTENT.summons, st.summon) ? nameOf('summons', st.summon) : nameOf('monsters', st.summon);
  if (isObj(st.forms) && typeof st.forms.cr === 'number') this.num(`${at}.forms.cr`, st.forms.cr, 'challenge rating');
  const amount = (c, field) => {
    if (c === undefined) return null;
    if (isInt(c)) { this.num(`${at}.${field}`, c, 'creatures'); return `${c}`; }
    if (isObj(c) && isInt(c.slot)) {
      this.num(`${at}.${field}.slot`, c.slot, 'creatures per slot level');
      if (isInt(c.base)) this.num(`${at}.${field}.base`, c.base, 'creatures');
      if (isInt(c.above)) this.num(`${at}.${field}.above`, c.above, 'slot level');
      return `${c.base ? `${c.base} plus ` : ''}${c.slot} for each slot level${c.above ? ` above ${c.above}` : ''}`;
    }
    this.bad(`Step ${at}: \`${field}\` is not a number of creatures.`);
    return 'an unreadable number of';
  };
  const n = amount(st.count, 'count');
  if (st.on === 'corpse') {
    say(`The caster raises corpses it names (dead Small or Medium Humanoids), as many as ${n ?? '1'}, each as ${what}, under the caster's control.`);
    const r = amount(st.reassert, 'reassert');
    this.line(`Instead, the caster may take back control of ${r ?? n ?? '1'} of its own creatures from this spell.`, depth + 1);
  } else say(`The caster makes ${n && n !== '1' ? `creatures (as many as ${n})` : 'a creature'} in unoccupied space it names within the spell's range: ${what}.`);
  if (Array.isArray(st.types)) this.line(`The caster picks its creature type from ${list(st.types.filter((x) => CREATURE_TYPES.includes(x)).map(cap1), 'or')}.`, depth + 1);
  if (Array.isArray(st.variants)) this.line(`The caster picks one of ${list(st.variants.slice(0, 20).map(shown), 'or')}.`, depth + 1);
  if (SUMMON_ONE.includes(st.one)) this.line(SUMMON_ONE_WORDS[st.one], depth + 1);
  if (isObj(st.over) && isObj(st.over.speed)) {
    const sp = Object.entries(st.over.speed).filter(([, v]) => isInt(v));
    for (const [mode, v] of sp) this.num(`${at}.over.speed.${mode}`, v, 'feet');
    this.line(`Its Speed is replaced: ${list(sp.map(([mode, v]) => `${mode} ${v} feet`))}.`, depth + 1);
  }
  const b = st.bond;
  if (!isObj(b)) { this.bad(`Step ${at}: a summon step without a bond.`); return; }
  this.odd(b, ['kind', 'turn', 'orders', 'range', 'at0', 'ends', 'leash', 'noAttack', 'mount'], `Step ${at}: the bond`);
  const bits = [];
  bits.push(`It is the caster's ${SUMMON_KIND_WORDS[b.kind] ?? 'companion of an unreadable kind'}.`);
  if (SUMMON_TURNS.includes(b.turn)) bits.push(SUMMON_TURN_WORDS[b.turn]); else this.bad(`Step ${at}: the bond's turn is not one the engine runs.`);
  if (b.orders === 'command') {
    if (isInt(b.range)) this.num(`${at}.bond.range`, b.range, 'feet');
    bits.push(`It acts on commands the caster gives within ${isInt(b.range) ? b.range : '?'} feet; when not commanded, it follows its standing order.`);
  } else bits.push('The caster\'s player runs it.');
  bits.push(b.at0 === 'dies' ? 'At 0 Hit Points it dies.' : b.at0 === 'vanish' ? 'At 0 Hit Points it vanishes.' : 'What 0 Hit Points does to it is unreadable.');
  if (Array.isArray(b.ends)) { const ws = b.ends.filter((x) => SUMMON_ENDS.includes(x)).map((x) => SUMMON_END_WORDS[x]); if (ws.length) bits.push(`The bond ends ${list(ws, 'or')}.`); }
  if (isInt(b.leash)) { this.num(`${at}.bond.leash`, b.leash, 'feet'); bits.push(`It vanishes if it ends up more than ${b.leash} feet from the caster.`); }
  if (b.noAttack === true) bits.push('It cannot attack.');
  if (b.mount === 'controlled') bits.push('The caster can ride it as a controlled mount.');
  if (this.fx === 'spell') bits.push('It lasts as long as the spell.');
  this.line(bits.join(' '), depth + 1);
  void SUMMON_KINDS;
}

// ====================================================================================================
// Monsters (task B13). Read from what `makeEntity` and the action code make of an entry: `legacyMonster` (content/index.js)
// is what a creature is made from, `MONSTER_ACTIONS` its actions, `modifiers.js` (`sources`) its traits' modifiers,
// `reactions.js` its trait reactions, `engine/attacks.js` (`act`, `takeAction`, Multiattack) how an action is used.
// ====================================================================================================
export const SIZE_WORDS = { tiny: 'Tiny', small: 'Small', medium: 'Medium', large: 'Large', huge: 'Huge', gargantuan: 'Gargantuan' };
export const MOVE_WORDS = { walk: 'walk', climb: 'climb', swim: 'swim', fly: 'fly', burrow: 'burrow' };
// Which of the ways to move the engine moves a creature by (engine/world.js reads walk, fly and climb; nothing reads swim or burrow).
export const MOVE_ENGINE = { walk: true, climb: true, swim: false, fly: true, burrow: false };
// What the engine does with each special sense (sight.js reads three; ai.js reads tremorsense).
export const SENSE_WORDS = {
  darkvision: 'it sees in the dark as in dim light, out to that range',
  blindsight: 'it sees what is in that range without light or sight',
  tremorsense: 'only the monster AI uses it: it knows where a hidden creature on the ground within that range is',
  truesight: 'it sees what is in that range through the dark and through what hides it',
};
// A trait id the engine knows by name (content/index.js, LEGACY_FEATURES): it gives the creature a flag.
export const TRAIT_ID_WORDS = {
  'nimble-escape': 'The engine knows this id: it lets the creature Disengage or Hide as a Bonus Action (and the monster AI Hides with it in the first round).',
  'pack-tactics': 'The engine knows this id, but sets a flag nothing reads: only the modifiers above do anything.',
};
// Every key of a monster, in the order the reading takes them. 'skip': not part of the reading (the title, or kept apart); 'header': in the title line.
export const MONSTER_FIELDS = {
  id: 'skip', name: 'skip', source: 'skip', size: 'header', type: 'header', cr: 'header', xp: 'header', ac: 'fAc', hp: 'fHp', pb: 'fPb', speed: 'fSpeed', hover: 'fHover',
  abilities: 'fAbilities', initiative: 'fInitiative', saves: 'fSaves', skills: 'fSkills', senses: 'fSenses', resist: 'fResist', vulnerable: 'fVulnerable', immune: 'fImmune',
  conditionImmune: 'fConditionImmune', languages: 'fLanguages', mount: 'fMount', traits: 'fTraits', actions: 'fActions', tier: 'fTier', checked: 'fChecked', text: 'skip',
};
export const TRAIT_FIELDS = { id: 'skip', name: 'skip', text: 'skip', modifiers: 'modifiers', reaction: 'reaction' };
export const ACTION_FIELDS = { id: 'skip', name: 'skip', text: 'skip', time: 'head', target: 'aim', effects: 'steps', uses: 'limits', recharge: 'limits', multiattack: 'multi' };
export const CREATURE_FIELDS = ['count', 'repeat', 'within', 'reach', 'range'];
export const AREA_FIELDS = ['shape', 'size', 'range', 'width', 'height', 'exceptCaster', 'types', 'choose', 'count'];
export const MONSTER_TIER_WORDS = {
  auto: 'Tier: auto. The engine runs every trait and action of this creature as listed above.',
  assist: 'Tier: assist. The engine runs what is listed above as run by the engine; the DM runs the rest.',
  manual: 'Tier: manual. The entry says the DM runs most of this creature; the engine runs only what is listed above as run by the engine.',
};
// Traits the engine does not read the hook of when a creature has it from a trait (modifiers.js `sources` yields a trait's modifiers to
// `modifiers()`, which no code calls for these: a Hit Point maximum is changed only by a step, and nothing reads carrying capacity).
export const TRAIT_DEAD_HOOKS = ['hp.max', 'carry'];
const HEADER = ['size', 'type', 'cr', 'xp'];
const LEGENDARY = /legendary[ -]actions?|lair|mythic/i;
const crText = (cr) => ({ 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' }[cr] ?? String(cr));
const abilMod = (n) => Math.floor((n - 10) / 2);
const diceAvg = (d) => {
  const m = /^(?:(\d+)d(\d+))?([+-]\d+)?$/.exec(d);
  return m ? (m[1] ? (+m[1] * (+m[2] + 1)) / 2 : 0) + (m[3] ? +m[3] : 0) : 0;
};
const fmt = (x) => (Number.isInteger(x) ? String(x) : x.toFixed(1));
// The damage a list of steps deals outright: each plain damage step, times its `times`. A step behind a `when` is left out.
const damageOf = (steps) => (Array.isArray(steps) ? steps.reduce((n, st) => n + (isObj(st) && isDice(st.damage) && st.when === undefined ? diceAvg(st.damage) * (isInt(st.times) && st.times > 0 ? st.times : 1) : 0), 0) : 0);
function averageOf(a) {
  const first = Array.isArray(a?.effects) && isObj(a.effects[0]) ? a.effects[0] : null;
  if (!first) return null;
  if ('attack' in first) return { avg: damageOf(first.onHit), on: 'it hits' };
  if ('save' in first) return { avg: damageOf(first.onFail), on: 'the save fails' };
  if ('damage' in first) return { avg: damageOf(a.effects), on: 'it takes effect' };
  return null;
}

class MonsterReading extends Reading {
  constructor(def, problems) {
    super(def, problems);
    this.kind = 'monster'; this.mon = true; this.actor = 'the creature';
    this.later = [];            // lines that follow the title line
    this.textOnly = 0;
    this.id = def.id;
  }

  monster() {
    const d = this.def;
    this.odd(d, Object.keys(MONSTER_FIELDS), 'The monster');
    const bits = HEADER.map((f) => this[{ size: 'fSize', type: 'fType', cr: 'fCr', xp: 'fXp' }[f]]()).filter(Boolean);
    this.line(`${this.title()} (${bits.join(', ')}).`);
    for (const l of this.later) this.line(l);
    for (const [f, how] of Object.entries(MONSTER_FIELDS)) if (how !== 'skip' && how !== 'header') this[how]();
  }

  // ----- the title line -----
  fSize() {
    const w = SIZE_WORDS[this.def.size];
    if (!w) { this.bad('The monster\'s size is not one the engine knows.'); return 'of an unreadable size'; }
    return w;
  }
  fType() {
    const t = this.def.type;
    if (typeof t !== 'string' || !t.trim()) { this.bad('The monster has no creature type.'); return 'of no type'; }
    const lower = t.trim().toLowerCase();
    if (!CREATURE_TYPES.includes(lower)) this.later.push(`Its creature type is not one the engine knows (${shown(t)}): a limit to a creature type (an area, a summoning spell) never matches it.`);
    return clean(t, 40).toLowerCase();
  }
  fCr() {
    const c = this.def.cr;
    if (typeof c !== 'number' || !(c >= 0)) { this.bad('The monster\'s challenge rating is not a number from 0 up.'); return 'an unreadable challenge rating'; }
    this.num('cr', c, 'challenge rating');
    this.later.push('The engine uses the challenge rating only to match a summoning spell that names an exact rating; it does not set any number from it.');
    return `challenge rating ${crText(c)}`;
  }
  fXp() {
    const x = this.def.xp;
    if (!isInt(x) || x < 0) { this.bad('The monster\'s Experience Points are not a whole number.'); return 'unreadable XP'; }
    this.num('xp', x, 'XP');
    return `${x} XP when defeated`;
  }

  // ----- the sheet -----
  fAc() {
    const v = this.def.ac;
    if (!isInt(v) || v < 1) return this.bad('The monster\'s Armor Class is not a positive whole number.');
    this.num('ac', v, 'Armor Class');
    this.line(`Armor Class ${v}: one fixed number. Modifiers from its traits and from effects on it change it for an attack.`);
  }
  fHp() {
    const v = this.def.hp;
    if (!isInt(v) || v < 1) return this.bad('The monster\'s Hit Points are not a positive whole number.');
    this.num('hp', v, 'Hit Points');
    this.line(`Hit Points ${v}: one fixed number. The entry holds no Hit Dice, so the engine never rolls its Hit Points.`);
  }
  fPb() {
    const v = this.def.pb;
    if (!isInt(v) || v < 1) return this.bad('The monster\'s Proficiency Bonus is not a positive whole number.');
    this.num('pb', v, 'Proficiency Bonus');
    this.line(`Proficiency Bonus +${v}. The saves and skills below carry their own bonuses, so the engine uses this one only where a rule asks for it.`);
  }
  fSpeed() {
    const s = this.def.speed;
    if (!isObj(s) || !Object.keys(s).length) return this.bad('The monster has no speeds the reader can read.');
    this.odd(s, Object.keys(MOVE_WORDS), 'Its speeds');
    const ok = Object.entries(s).filter(([m, v]) => Object.hasOwn(MOVE_WORDS, m) && typeof v === 'number' && v >= 0);
    if (ok.length !== Object.keys(s).length) this.bad('A speed is not feet for walk, climb, swim, fly or burrow.');
    for (const [m, v] of ok) this.num(`speed.${m}`, v, 'feet');
    this.line(`Speed: ${list(ok.map(([m, v]) => `${MOVE_WORDS[m]} ${v} feet`)) || 'none the reader can read'}.`);
    for (const [m, v] of ok) if (!MOVE_ENGINE[m] && v > 0) {
      this.line(`The engine does not move a creature by a ${m} speed: it stays on the sheet, and the DM lets it ${m} by hand.`);
      this.dm(`Moving it by its ${m} speed.`);
    }
    if (ok.some(([m, v]) => m === 'climb' && v > 0)) this.line('It climbs by its climb speed only where the table allows climbing.');
    if (!(s.walk > 0) && !(s.fly > 0)) this.line('It has no walking or flying speed, so the engine will not let it move.');
  }
  fHover() {
    const h = this.def.hover;
    if (h === undefined) return;
    if (!h) return this.line('It does not hover.');
    if (this.def.speed?.fly > 0) this.line('It hovers: it stays aloft even when Prone or Incapacitated.');
    else this.line('It is marked as hovering, but it has no fly speed, so that does nothing.');
  }
  fAbilities() {
    const a = this.def.abilities;
    if (!isObj(a)) return this.bad('The monster has no ability scores the reader can read.');
    this.odd(a, ABILITIES, 'Its ability scores');
    const parts = ABILITIES.map((k) => {
      if (!isInt(a[k])) { this.bad(`The ${ABILITY_WORDS[k]} score is not a whole number.`); return `${ABILITY_WORDS[k]} unreadable`; }
      this.num(`abilities.${k}`, a[k], 'score');
      return `${ABILITY_WORDS[k]} ${a[k]} (${signed(abilMod(a[k]))})`;
    });
    this.line(`Ability scores: ${parts.join(', ')}.`);
  }
  mod(k) { const v = this.def.abilities?.[k]; return isInt(v) ? abilMod(v) : 0; }
  fInitiative() {
    const v = this.def.initiative;
    if (v === undefined) return this.line(`Initiative uses its Dexterity modifier (${signed(this.mod('dex'))}).`);
    if (!isInt(v)) return this.bad('The monster\'s Initiative is not a whole number.');
    this.num('initiative', v, 'Initiative');
    this.line(`Initiative ${signed(v)}: the entry's own number, used in place of its Dexterity modifier.`);
  }
  fSaves() {
    const s = this.def.saves;
    if (s === undefined) return this.line('Saving throws: each is its plain ability modifier.');
    if (!isObj(s)) return this.bad('The monster\'s saves are not a list of bonuses.');
    this.odd(s, ABILITIES, 'Its saves');
    const ok = ABILITIES.filter((k) => Object.hasOwn(s, k) && isInt(s[k]));
    if (ok.length !== Object.keys(s).length) this.bad('A save is not a whole-number bonus for one of the six abilities.');
    for (const k of ok) this.num(`saves.${k}`, s[k], 'save bonus');
    this.line(`Saving throws: ${list(ok.map((k) => `${ABILITY_WORDS[k]} ${signed(s[k])}`)) || 'none the reader can read'}. The engine uses each as the whole bonus for that save, in place of the ability modifier; every other save is the plain modifier.`);
  }
  fSkills() {
    const s = this.def.skills;
    if (s !== undefined && !isObj(s)) return this.bad('The monster\'s skills are not a list of bonuses.');
    const names = Object.keys(s ?? {});
    const ok = names.filter((k) => Object.hasOwn(SKILLS, k) && isInt(s[k]));
    if (ok.length !== names.length) this.bad('A skill is not a whole-number bonus for one of the eighteen skills.');
    for (const k of ok) this.num(`skills.${k}`, s[k], 'skill bonus');
    this.line(ok.length ? `Skills: ${list(ok.map((k) => `${cap1(k.replace(/-/g, ' '))} ${signed(s[k])}`))}. The engine uses each as the whole bonus for that skill's checks, in place of the ability modifier; any other skill is the plain modifier.` : 'Skills: none listed; each check is the plain ability modifier.');
    this.perception = 10 + (isInt(s?.perception) ? s.perception : this.mod('wis'));
  }
  fSenses() {
    const s = this.def.senses;
    if (s !== undefined && !isObj(s)) { this.bad('The monster\'s senses are not a list of ranges.'); return; }
    const names = Object.keys(s ?? {});
    if (s) this.odd(s, Object.keys(SENSE_WORDS), 'Its senses');
    const ok = names.filter((k) => Object.hasOwn(SENSE_WORDS, k) && isInt(s[k]) && s[k] >= 0);
    if (ok.length !== names.length) this.bad('A sense is not a range in feet for darkvision, blindsight, tremorsense or truesight.');
    for (const k of ok) this.num(`senses.${k}`, s[k], 'feet');
    this.line(`Senses: ${list([...ok.map((k) => `${k} ${s[k]} feet`), `passive Perception ${this.perception ?? 10 + this.mod('wis')}`])}.`);
    for (const k of ok) if (s[k] > 0) this.line(`Its ${k}: ${SENSE_WORDS[k]}.`);
  }
  types(key, label, what) {
    const v = this.def[key];
    if (v === undefined) return false;
    if (!Array.isArray(v) || !v.every((x) => DAMAGE_TYPES.includes(x))) { this.bad(`\`${key}\` is not a list of damage types.`); return true; }
    if (v.length) this.line(`${label} ${list(v)}: ${what}.`);
    return v.length > 0;
  }
  fResist() {
    const any = [this.types('resist', 'Resistant to', 'damage of these types is halved'), Array.isArray(this.def.vulnerable) && this.def.vulnerable.length, Array.isArray(this.def.immune) && this.def.immune.length].some(Boolean);
    if (!any) this.line('No damage resistances, vulnerabilities or immunities.');
  }
  fVulnerable() { this.types('vulnerable', 'Vulnerable to', 'damage of these types is doubled'); }
  fImmune() { this.types('immune', 'Immune to', 'damage of these types does nothing to it'); }
  fConditionImmune() {
    const v = this.def.conditionImmune;
    if (v === undefined) return;
    if (!Array.isArray(v) || !v.length || !v.every((x) => CONDITIONS.includes(x))) return this.bad('`conditionImmune` is not a list of conditions.');
    this.line(`Immune to the ${list(v.map(cond))} condition${v.length > 1 ? 's' : ''}: the engine never gives it ${v.length > 1 ? 'any of them' : 'that condition'}.`);
  }
  fLanguages() {
    const v = this.def.languages;
    if (v === undefined) return;
    if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) return this.bad('`languages` is not a list of text.');
    this.line(v.length ? `Languages (shown to the DM only; the engine does nothing with them): ${v.slice(0, 12).map((x) => `"${clean(x, 120)}"`).join(', ')}.` : 'Languages: none.');
  }
  fMount() {
    const v = this.def.mount;
    if (v === undefined) return;
    if (v !== 'trained') return this.bad('`mount` is "trained" or left out.');
    this.line('It is trained to carry a rider: a rider on its side controls it as a mount.');
  }

  // ----- traits -----
  fTraits() {
    const ts = this.def.traits;
    if (ts === undefined) return;
    if (!Array.isArray(ts)) return this.bad('The monster\'s traits are not a list.');
    ts.forEach((t, i) => this.trait(t, i));
  }
  trait(t, i) {
    const at = `traits.${i}`;
    if (!isObj(t)) { this.bad(`${at} is not a trait.`); return this.line('(A trait the reader cannot read.)'); }
    this.odd(t, Object.keys(TRAIT_FIELDS), `Trait ${i + 1}`);
    const name = typeof t.name === 'string' && t.name.trim() ? `"${clean(t.name, 60)}"` : '(no name)';
    const mods = Array.isArray(t.modifiers) ? t.modifiers : null;
    if (!mods) this.bad(`${at} has no list of modifiers (it may be empty).`);
    const runs = (mods?.length ?? 0) > 0 || t.reaction !== undefined || Object.hasOwn(TRAIT_ID_WORDS, t.id);
    this.line(`Trait ${name}: ${runs ? 'the engine runs this.' : 'text only. The engine does nothing with it; the DM runs it.'}`);
    if (!runs) { this.textOnly++; this.dm(`The trait ${name}: text only.`); }
    (mods ?? []).forEach((m, j) => this.traitMod(m, `${at}.modifiers.${j}`));
    if (t.reaction !== undefined) this.traitReaction(t.reaction, `${at}.reaction`);
    if (Object.hasOwn(TRAIT_ID_WORDS, t.id)) this.line(TRAIT_ID_WORDS[t.id], 1);
    if (LEGENDARY.test(`${t.id} ${t.name}`)) {
      this.line('The engine has no legendary, lair or mythic actions. Whatever this trait describes, the DM runs.', 1);
      this.dm(`Legendary, lair or mythic actions of the trait ${name}.`);
    }
  }
  traitMod(m, at) {
    if (!isObj(m)) { this.bad(`${at} is not a modifier.`); return this.line('(A modifier the reader cannot read.)', 1); }
    this.odd(m, MOD_KEYS, `The modifier at ${at}`);
    this.inTrait = true;
    try {
      const phrase = modPhrase.call(this, m, at);
      this.line(`${cap1(phrase)}.`, 1);
      const extra = modExtras.call(this, m, at, false);
      if (extra) this.line(extra, 2);
    } finally { this.inTrait = false; }
    if (TRAIT_DEAD_HOOKS.includes(m.on)) {
      this.line(`The engine never reads ${HOOK_WORDS[m.on]} from a trait, so this changes nothing.`, 2);
      this.dm(`The modifier at ${at}: the engine does not read this hook from a trait.`);
    }
  }
  traitReaction(r, at) {
    if (!isObj(r)) return this.bad(`${at} is not a reaction.`);
    this.odd(r, ['on', 'ac', 'attack', 'manual'], 'The reaction');
    if (r.on !== 'hit') this.bad(`${at}: a trait's reaction is set off by a hit.`);
    if (!isInt(r.ac) || r.ac < 1 || r.ac > 10) this.bad(`${at}: \`ac\` is not a whole number from 1 to 10.`); else this.num(`${at}.ac`, r.ac, 'Armor Class');
    if (r.attack !== undefined && !['melee', 'ranged'].includes(r.attack)) this.bad(`${at}: \`attack\` is melee or ranged.`);
    const kind = r.attack === 'melee' || r.attack === 'ranged' ? ` ${r.attack}` : '';
    this.line(`Reaction, taken by a standing instruction (never, only when it turns a hit into a miss, always, or ask; the default is "only when it turns a hit into a miss"): when a${kind} attack roll hits it, it adds ${isInt(r.ac) ? r.ac : '(unreadable)'} to its Armor Class against that attack. It spends the creature's Reaction.`, 1);
    if (r.manual !== undefined) {
      const m = typeof r.manual === 'string' && r.manual.trim() ? clean(r.manual, READER_LIMITS.quote) : null;
      if (!m) this.bad(`${at}: \`manual\` is not text.`);
      this.line(`The rest of it is the DM's: "${m ?? '(no text)'}"`, 1);
      this.dm(`"${m ?? '(no text)'}"`);
    }
  }

  // ----- actions -----
  fActions() {
    const as = this.def.actions;
    if (!Array.isArray(as) || !as.length) return this.bad('The monster has no list of actions the reader can read.');
    this.byId = new Map();
    as.forEach((a, i) => { if (isObj(a) && typeof a.id === 'string' && !this.byId.has(a.id)) this.byId.set(a.id, a); });
    as.forEach((a, i) => this.action(a, i));
  }
  nameOfAction(id) {
    const a = typeof id === 'string' ? this.byId.get(id) : null;
    return a && typeof a.name === 'string' && a.name.trim() ? `"${clean(a.name, 60)}"` : shown(id);
  }
  action(a, i) {
    const at = `actions.${i}`;
    if (!isObj(a)) { this.bad(`${at} is not an action.`); return this.line('(An action the reader cannot read.)'); }
    this.odd(a, Object.keys(ACTION_FIELDS), `Action ${i + 1}`);
    const name = typeof a.name === 'string' && a.name.trim() ? `"${clean(a.name, 60)}"` : '(no name)';
    const time = a.time === undefined || a.time === 'action' ? 'an action' : a.time === 'bonus' ? 'a Bonus Action' : null;
    if (!time) this.bad(`${at}: \`time\` is "action" or "bonus".`);
    this.line(`Action ${name}: ${time ?? 'of an unreadable kind'}. In a fight it spends the creature's ${a.time === 'bonus' ? 'Bonus Action' : 'action'}.`);
    this.base = 1;
    try {
      this.limits(a, at);
      if (a.multiattack !== undefined) this.multi(a, at);
      else this.single(a, at);
      this.aiLine(a);
    } finally { this.base = 0; }
  }
  // Recharge and daily uses (engine/attacks.js `actionSpent`, `takeAction`; rolls.js `recharge`; rests.js).
  limits(a, at) {
    if (a.recharge !== undefined) {
      const r = a.recharge;
      if (Array.isArray(r) && r.length === 2 && isInt(r[0]) && r[0] >= 2 && r[0] <= 6 && r[1] === 6) {
        this.num(`${at}.recharge.0`, r[0], 'recharge'); this.num(`${at}.recharge.1`, r[1], 'recharge');
        this.line(`Recharge ${r[0]}-6: once used it is spent. At the start of each of its turns the engine rolls a d6, and on ${r[0]} or more it is ready again. The DM readies it too by giving it a Long Rest.`);
      } else this.bad(`${at}: \`recharge\` is [from 2 to 6, 6].`);
    }
    if (a.uses !== undefined) {
      const u = a.uses;
      if (isObj(u) && u.per === 'day' && isInt(u.n) && u.n > 0) {
        this.num(`${at}.uses.n`, u.n, 'uses');
        this.odd(u, ['per', 'n'], 'The uses');
        this.line(`Limited to ${u.n} use${u.n > 1 ? 's' : ''} a day: the engine counts them and refuses it when none are left. They come back when the DM gives it a Long Rest.`);
      } else this.bad(`${at}: \`uses\` is { per: "day", n }.`);
    }
    if (a.recharge !== undefined && a.uses !== undefined) this.bad(`${at}: an action has recharge or uses, not both.`);
  }
  // One action that is not a Multiattack: its target, then its steps (the same sentences as a spell's), then what the dice come to.
  single(a, at) {
    const t = isObj(a.target) ? a.target : null;
    if (!t) this.bad(`${at} has no target the reader can read.`);
    const saved = { def: this.def, aim: this.aim, fx: this.fx, lasting: this.lasting, pre: this.pre };
    const area = isObj(t?.area) ? t.area : null;
    this.pre = `${at}.`;
    this.def = { effects: Array.isArray(a.effects) ? a.effects : [], range: typeof area?.range === 'number' ? area.range : 0, duration: 'instant', tier: saved.def.tier };
    try {
      this.aim = this.aimOf(t);
      this.lasting = this.bound(); this.fx = this.lasting ? 'bound' : null;
      let who = this.whoOf(t, a, at);
      if (area && area.range !== undefined) { if (isInt(area.range)) this.num(`${at}.target.area.range`, area.range, 'feet'); else this.bad(`${at}: the area's \`range\` is not feet.`); }
      const steps = Array.isArray(a.effects) && a.effects.length ? a.effects : null;
      if (!steps) { this.bad(`${at} has no list of steps the reader can read.`); this.line('(No steps the reader can read.)'); }
      if (this.aim === 'none') {
        this.line(`The engine cannot lay out this area (${this.noneWhy ?? 'it is unreadable'}), so it has nobody to apply the steps to: it hands each step below to the DM.`);
        this.dm(`Every step of the action ${this.nameOfAction(a.id)}: the engine cannot lay out its area.`);
        who = 'each creature affected';
      }
      if (t?.self) this.line('It affects the creature itself.');
      if (isObj(t?.creature)) this.creatureAim(t.creature, at, steps);
      if (steps) this.steps(steps, `${at}.effects`, 0, who, { top: true });
      if (!isObj(t?.creature)) this.aiming(t, this.aim);
      for (const st of steps ?? []) if (isObj(st) && ('summon' in st || 'counter' in st)) this.bad(`${at}: a creature's action cannot hold a ${'summon' in st ? 'summon' : 'counter'} step.`);
      const av = averageOf(a);
      if (av && av.avg > 0) this.line(`Worked out from the dice, not a promise: the damage averages ${fmt(av.avg)} when ${av.on}.`);
    } finally { Object.assign(this, saved); }
  }
  // Who the first step speaks of.
  whoOf(t, a, at) {
    if (!t) return 'it';
    if (t.self) return 'the creature';
    if (t.area && this.aim === 'area') return `each creature in ${AREA_WORDS[t.area.shape](t.area)}`;
    if (t.creature) return isObj(t.creature) && isInt(t.creature.count) && t.creature.count > 1 ? 'each target' : 'the target';
    return 'each creature affected';
  }
  // A creature target: how many, how far (engine/world.js `aimAction`, `creatures`; effects.js `actionProfile`).
  creatureAim(c, at, steps) {
    this.odd(c, CREATURE_FIELDS, 'The creature target');
    const n = isInt(c.count) && c.count > 0 ? c.count : 1;
    if (c.count !== undefined) { if (isInt(c.count) && c.count > 0) this.num(`${at}.target.creature.count`, c.count, 'creatures'); else this.bad(`${at}: \`count\` is not a whole number.`); }
    if (c.within !== undefined) { if (isInt(c.within)) this.num(`${at}.target.creature.within`, c.within, 'feet'); else this.bad(`${at}: \`within\` is not feet.`); }
    const reach = typeof c.reach === 'number' && c.reach > 0 ? c.reach : null;
    const band = Array.isArray(c.range) && c.range.length === 2 && c.range.every((x) => typeof x === 'number' && x > 0) ? c.range : null;
    if (c.reach !== undefined) { if (reach) this.num(`${at}.target.creature.reach`, reach, 'feet'); else this.bad(`${at}: \`reach\` is not feet.`); }
    if (c.range !== undefined) { if (band) { this.num(`${at}.target.creature.range.0`, band[0], 'feet'); this.num(`${at}.target.creature.range.1`, band[1], 'feet'); } else this.bad(`${at}: \`range\` is not [normal, long] in feet.`); }
    const first = Array.isArray(steps) && isObj(steps[0]) ? steps[0] : null;
    const bits = [`It is aimed at ${n > 1 ? `up to ${n} creatures` : 'one creature'}`];
    if (reach) bits.push(`within ${reach} feet`);
    else if (band) bits.push(`within ${band[1]} feet`);
    else {
      bits.push('with no reach or range given');
      this.bad(`${at}: a creature target has neither \`reach\` nor \`range\`, which the engine needs to aim it.`);
    }
    this.line(`${bits.join(' ')}. The target cannot be the creature itself, and a wall between them keeps it from being picked${c.repeat === true ? '; the same creature may be picked more than once' : ''}${isInt(c.within) ? `; every target after the first must be within ${c.within} feet of the first` : ''}.`);
    if (!reach && !band) {
      this.line('The engine cannot aim this action: using it, and the monster AI looking at it, fail with an error instead of a refusal. This entry should not be approved.');
      this.dm(`The action at ${at}: it has neither a reach nor a range.`);
    }
    if (first && 'attack' in first) {
      if (first.attack === 'melee') this.line(`Its melee attack reaches ${reach ?? 5} feet.`);
      else if (band) this.line(`Its ranged attack is at normal range up to ${band[0]} feet and long range up to ${band[1]}; at long range the roll has Disadvantage.`);
      else if (reach) this.line(`Its ranged attack reaches ${reach} feet, with no long range.`);
    }
    if (n > 1 && this.damageOutside()) this.line('Damage that is not behind an attack roll is rolled once, and every target takes the same roll.');
  }
  // A Multiattack, as engine/attacks.js `act` runs it.
  multi(a, at) {
    if (a.effects !== undefined || a.target !== undefined) this.bad(`${at}: a Multiattack has no target and no steps of its own.`);
    if (a.recharge !== undefined || a.uses !== undefined) this.bad(`${at}: a Multiattack has no recharge or uses.`);
    const ma = a.multiattack;
    const lists = Array.isArray(ma) ? [ma] : isObj(ma) && Array.isArray(ma.or) && Object.keys(ma).length === 1 ? ma.or : null;
    if (!lists || !lists.length || (!Array.isArray(ma) && lists.length < 2)) return this.bad(`${at}: the Multiattack is not a list of { action, times } or { or: [list, list, ...] }.`);
    this.line('It is made only in a fight. It gives the attacks below, made one at a time, each at a target chosen when it is made; attacks not made by the end of the turn are lost. Each is a use of the action it names and costs no further action.');
    let most = 0, avg = 0;
    lists.forEach((l, li) => {
      const here = Array.isArray(ma) ? `${at}.multiattack` : `${at}.multiattack.or.${li}`;
      if (!Array.isArray(l) || !l.length) return this.bad(`${here} is not a list of attacks.`);
      if (!Array.isArray(ma)) this.line(`Alternative ${li + 1} of ${lists.length}: the attacks of this list only.`);
      let n = 0, sum = 0;
      l.forEach((x, j) => {
        const p = `${here}.${j}`;
        if (!isObj(x)) return this.bad(`${p} is not an attack entry.`);
        this.odd(x, ['action', 'times'], 'A Multiattack entry');
        const times = isInt(x.times) && x.times > 0 && x.times <= 10 ? x.times : null;
        if (times === null) this.bad(`${p}: \`times\` is a whole number from 1 to 10.`); else { this.num(`${p}.times`, times, 'attacks'); n += times; }
        const ids = Array.isArray(x.action) ? x.action : [x.action];
        if (!ids.length || !ids.every((id) => typeof id === 'string')) return this.bad(`${p}: \`action\` is an action id or a list of ids.`);
        let best = 0;
        for (const id of ids) {
          const o = this.byId.get(id);
          if (!o) this.bad(`${p}: names "${typeof id === 'string' ? id.slice(0, 40) : '?'}", which is not one of this creature's actions.`);
          else if (o === a || o.multiattack !== undefined) this.bad(`${p}: a Multiattack cannot name another Multiattack.`);
          else if (o.time === 'bonus' || o.recharge !== undefined || o.uses !== undefined) this.bad(`${p}: names ${this.nameOfAction(id)}, which is a Bonus Action or has a recharge or uses.`);
          const v = o ? averageOf(o)?.avg ?? 0 : 0;
          if (v > best) best = v;
        }
        this.line(`${times ?? '?'} attack${times === 1 ? '' : 's'} with ${ids.length > 1 ? `any of ${list(ids.map((id) => this.nameOfAction(id)), 'or')}` : this.nameOfAction(ids[0])}.`, Array.isArray(ma) ? 0 : 1);
        sum += (times ?? 0) * best;
      });
      if (n > WORK.attacks) this.line(`That is ${n} attacks; the engine allows at most ${WORK.attacks} from one Multiattack, and refuses it.`, 1);
      most = Math.max(most, n); avg = Math.max(avg, sum);
    });
    if (avg > 0) this.line(`Worked out from the dice, not a promise: if every attack hits, the damage averages ${fmt(avg)}${lists.length > 1 ? ' for the biggest alternative' : ''}.`);
  }
  // Will the monster AI use it? (ai.js picks a harmful action of aim creature, area or multi that is not spent.)
  aiLine(a) {
    let p = null;
    try { p = actionProfile(structuredClone(a)); } catch { p = null; }
    if (p && p.harmful && ['creature', 'area', 'multi'].includes(p.aim)) this.line('The monster AI uses this action on its own turns.');
    else this.line('The monster AI never picks this action by itself: the DM sends it.');
  }

  // ----- the end -----
  fTier() {
    const t = this.def.tier;
    if (!TIERS.includes(t)) return this.bad('The tier is not auto, assist or manual.');
    const n = this.doesNot.length;
    if (t === 'auto' && n) this.line('Tier: auto, but the engine hands the parts listed for the DM to the DM.');
    else this.line(MONSTER_TIER_WORDS[t]);
    if (t !== 'auto') {
      this.line(n ? `Why: ${this.textOnly ? `${this.textOnly} trait${this.textOnly > 1 ? 's' : ''} only the DM runs; ` : ''}${n} thing${n > 1 ? 's' : ''} the DM does by hand, listed below.` : 'Why: the reader finds nothing the DM must do by hand in the entry itself; the entry\'s tier says its description holds more.');
      this.line('The author\'s description is shown beside this reading; whatever it says beyond the lines above, the DM runs.');
      this.dm('Whatever the description says beyond the lines above.');
    }
  }
  fChecked() { this.line(this.def.checked === true ? 'Marked as checked against the rules text.' : 'Not checked against any rulebook.'); }
}
