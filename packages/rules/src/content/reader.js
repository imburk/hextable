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
import { aimable, BENEFICIAL_CONDITIONS, spellKinds } from '../effects.js';

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
    return { kind: String(kind).slice(0, 20), title: '(unreadable entry)', tier: null, lines: ['The reader could not read this entry. It cannot be approved.'], doesNot: [], numbers: [], text: null, problems: ['The entry could not be read.'], hash: null };
  }
}

function readOrThrow(kind, entry) {
  const problems = [];
  const k = typeof kind === 'string' ? kind : '';
  if (k !== 'spell' && k !== 'spells') {
    return { kind: clean(k, 20), title: '(not read)', tier: null, lines: ['The reader reads spells only so far; this kind of entry is not read yet.'], doesNot: [], numbers: [], text: null, problems: [], hash: null };
  }
  const { value: e, over } = tidy(entry, problems);
  if (over || !isObj(e)) {
    const why = over ? 'This entry is too large or too deeply nested to read. It cannot be approved.' : 'This is not a spell entry (it is not an object). It cannot be approved.';
    return { kind: 'spell', title: '(unreadable entry)', tier: null, lines: [why], doesNot: [], numbers: [], text: null, problems: [...problems, why], hash: null };
  }
  const R = new Reading(e, problems);
  R.spell();
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
  }
  line(text, depth = 0) {
    if (this.lines.length >= READER_LIMITS.lines) { this.cut++; return; }
    this.lines.push(`${'  '.repeat(Math.min(depth, 12))}${cap(text, READER_LIMITS.line)}`);
  }
  dm(text) { if (this.doesNot.length < READER_LIMITS.lines) this.doesNot.push(cap(text, READER_LIMITS.line)); }
  bad(text) { if (this.problems.length < READER_LIMITS.problems) this.problems.push(cap(text, READER_LIMITS.line)); }
  num(at, value, unit) { if (this.numbers.length < READER_LIMITS.numbers) this.numbers.push({ at, value, unit }); }
  odd(obj, known, where) {
    for (const k of Object.keys(obj)) if (!known.includes(k)) this.bad(`${where} has a key ${shown(k)} the engine does not use.`);
  }
  title() { const n = this.def.name; return typeof n === 'string' && n.trim() ? clean(n, READER_LIMITS.title) : '(no name)'; }
  // The subject of a step inside a branch.
  it() { return this.aim === 'self' ? 'the caster' : 'it'; }
  result(hash) {
    if (this.cut) this.lines.push(`… and ${this.cut} more lines not shown.`);
    const d = this.def;
    return {
      kind: 'spell', title: this.title(), tier: TIERS.includes(d.tier) ? d.tier : null,
      lines: this.lines, doesNot: this.doesNot, numbers: this.numbers, text: typeof d.text === 'string' ? clean(d.text, READER_LIMITS.text) : null, problems: this.problems, hash,
    };
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
    // A spell that lasts makes a lasting effect; an instant one makes a bound effect only if a step ends on a turn or a save.
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
    this.walk((st) => { if (isObj(st.ends) && ['turnStart', 'turnEnd', 'save'].includes(st.ends.on)) b = true; });
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
    this.odd(a, ['shape', 'size', 'height', 'width', 'exceptCaster', 'types', 'choose', 'count'], 'The area');
    const range = feetOf(this.def.range);
    const within = ['sphere', 'cylinder'].includes(a.shape) ? Math.max(1, typeof range === 'number' ? range : 0) : range;
    if (aimable(a, within)) return 'area';
    this.noneWhy = a.count > 1 ? `the caster arranges ${a.count} of these shapes` : a.shape === 'line' ? 'a line placed at a distance is the DM\'s to place' : 'it cannot be aimed with this range';
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
    if (t.creature) {
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
      this.num('target.area.size', a.size, 'feet');
      if (a.height !== undefined) { if (a.shape === 'cylinder' && typeof a.height === 'number') this.num('target.area.height', a.height, 'feet'); else this.bad('`height` is for a cylinder, in feet.'); }
      if (a.width !== undefined) { if (isInt(a.width)) this.num('target.area.width', a.width, 'feet'); else this.bad('`width` is not feet.'); }
      const range = typeof d.range === 'number' ? d.range : 0;
      const bits = [`The ${a.shape} ${AREA_PLACE[a.shape](range)}`];
      bits.push(a.exceptCaster === true || (d.zone !== undefined && a.shape === 'emanation') ? 'it catches every creature in it except the caster' : 'it catches every creature in it, the caster too if the caster is in it');
      bits.push('a wall between the area\'s origin and a creature keeps that creature out');
      this.line(`${bits.join('; ')}.`);
      if (isInt(a.choose)) { this.num('target.area.choose', a.choose, 'creatures'); this.line(`Of those caught, the caster picks up to ${a.choose} creatures; only they are affected.`); }
      if (a.types !== undefined) {
        const ts = Array.isArray(a.types) ? a.types.filter((x) => CREATURE_TYPES.includes(x)) : [];
        this.line(`The entry limits the area to ${ts.length ? list(ts.map(cap1), 'or') : 'some creature types'}, but the engine does not apply that limit to a spell: every creature caught is affected. The DM leaves out the others.`);
        this.dm('Leaving out the creatures of other types in the area: the engine applies a spell area\'s `types` to no one.');
      }
      if (d.zone === undefined && this.damageOutside()) this.line('Damage that is not behind an attack roll is rolled once, and every creature caught takes the same roll.');
    }
    if (t.area && aim === 'none') {
      const a = t.area;
      if (isObj(a)) {
        if (typeof a.size === 'number') this.num('target.area.size', a.size, 'feet');
        if (typeof a.height === 'number') this.num('target.area.height', a.height, 'feet');
        if (isInt(a.width)) this.num('target.area.width', a.width, 'feet');
        if (isInt(a.count)) this.num('target.area.count', a.count, 'shapes');
        if (isInt(a.choose)) this.num('target.area.choose', a.choose, 'creatures');
        if (AREA_SHAPES.includes(a.shape) && a.size > 0) this.line(`The area is ${isInt(a.count) && a.count > 1 ? `${a.count} of ${AREA_WORDS[a.shape](a)}, arranged by the caster` : AREA_WORDS[a.shape](a)}; the DM decides who is caught.`);
      }
    }
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
      if (this.fx === 'bound') this.line('It is instant, but what its steps put on creatures stays until each part\'s own ending, as said above.');
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
    if (isObj(e)) this.odd(e, ['on', 'of', 'save', 'at', 'by', 'orDamaged'], `Step ${at}: \`ends\``);
    if (!this.fx) {
      if (what === 'modifier') return null;
      return `Nothing in the engine ends it${ends ? ' (its ending is not kept, since the spell does not last)' : ''}: the DM removes it.`;
    }
    const whose = ends?.of === 'source' ? 'the caster\'s' : 'its';
    let text;
    if (!ends) text = this.fx === 'spell' ? 'It lasts as long as the spell.' : 'Nothing ends it on its own: the DM ends it.';
    else if (ends.on === 'turnStart' || ends.on === 'turnEnd') text = `It ends at the ${ends.on === 'turnStart' ? 'start' : 'end'} of ${whose} next turn, or when the fight ends${this.fx === 'spell' ? ', even if the spell\'s time runs out first; ending the spell early ends it too' : ''}.`;
    else if (ends.on === 'save') {
      const ab = ABILITY_WORDS[ends.save] ?? 'unreadable';
      const atw = ends.at === 'turnStart' ? 'at the start of each of its turns' : ends.at === 'turnEnd' ? 'at the end of each of its turns' : ends.at === 'damaged' ? 'each time it takes damage' : 'at an unreadable time';
      text = `It makes ${/^[AEIOU]/.test(ab) ? 'an' : 'a'} ${ab} saving throw ${atw}, against the caster's spell save DC; a success ends it${ends.orDamaged === true ? '. Any damage it takes also ends it' : ''}${this.fx === 'spell' ? '. It also ends with the spell' : ''}.`;
    } else {
      text = `It ends when it takes damage${ends.by === 'source' ? ' from the caster or the caster\'s side' : ''}${this.fx === 'spell' ? ', or with the spell' : ''}.`;
    }
    if (this.fx === 'bound' && !ends) { this.dm(`Ending what step ${at} puts on a creature: nothing ends it on its own.`); }
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
    say(`${Who} regains ${isDice(st.heal) ? st.heal : '(unreadable dice)'}${st.addMod === true ? ' plus the caster\'s spellcasting ability modifier' : ''} Hit Points${least}.`);
  },
  tempHp({ st, at, Who, say }) {
    if (!isDice(st.tempHp)) this.bad(`Step ${at}: the Temporary Hit Points are not dice.`); else this.num(`${at}.tempHp`, st.tempHp, 'dice');
    const least = isInt(st.atLeast) ? (this.num(`${at}.atLeast`, st.atLeast, 'Temporary Hit Points'), `, at least ${st.atLeast}`) : '';
    say(`${Who} gains ${isDice(st.tempHp) ? st.tempHp : '(unreadable dice)'}${st.addMod === true ? ' plus the caster\'s spellcasting ability modifier' : ''} Temporary Hit Points${least}; they replace what it has only if they are more${this.fx ? ', and they vanish when the spell ends' : ''}.`);
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
      say(`${Who} falls to the surface below. The engine records the fall but deals no damage for it: the DM works out the height and the damage.`);
      return this.dm(`The damage of the fall in step ${at}.`);
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
    this.hasManual = true;
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
  if (m.uses === 1) { this.num(`${at}.uses`, 1, 'use'); bits.push('the first roll it applies to uses it up'); }
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
  if (m.on === 'hp.max' && m.op === 'add') bits.push('current Hit Points move with the maximum, and back when it ends');
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
