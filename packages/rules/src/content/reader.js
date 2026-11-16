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
// throws) gets a short plain answer and never a throw. Spells, monsters, items and feats are read; weapons, armour and objects are the
// rest of task B13.
import { ABILITIES, ACTION_TIMES, AREA_SHAPES, ARMOUR_CATEGORIES, BONUS_ACTS, BRANCHES, CAST_TIMES, CHOICES, CONDITIONS, CREATURE_TYPES, DAMAGE_TYPES, FEAT_CATEGORIES, FEAT_FEATURES,
  GRANTS, HOOKS, ITEM_CATEGORIES, ITEM_VARIANTS, OPS, RARITIES, REACTION_TRIGGERS, REMAINS, SCHOOLS, SKILLS, SPELL_KINDS, STEPS, SUMMON_ENDS, SUMMON_KINDS, SUMMON_ONE, SUMMON_TURNS, TAGS,
  TIERS, WEAPON_PROPERTIES, WEAR, WEAR_ONE, isDuration, lintEntry } from './schema.js';
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
// What the engine can tell of each tag, where it is asked (modifiers.js `judge`; a test PLAYS every tag in every place through
// `apply()` and holds these tables equal to what the engine does, so the reading cannot drift from it again, #430).
// `judge(tag, sit)` answers true, false or "cannot tell" (null), from the pieces of `sit` the caller has: a place that does not
// supply a piece cannot judge the tags that need it.
//  - a STEP's `when` (effects.js exec) and a save's `advantageIf` are asked with the caster, the target and, only below an attack's
//    `onHit` or `onMiss`, how the roll went (Advantage or Disadvantage). A step that cannot be judged is NOT run: the DM is told.
//  - a MODIFIER's `when` (modifiers.js `modifiers`) is asked with whatever its hook's caller knows. A modifier whose tag cannot be
//    judged is skipped, without a word to anybody: it never takes effect.
const WHERE = ['within5', 'beyond5', 'target.prone', 'target.unconscious', 'attacker.unseen', 'target.unseen', 'ally.adjacentToTarget', 'enemy.adjacent', 'target.fought', 'target.notFiend'];
export const JUDGED_STEP = WHERE;
export const JUDGED_STEP_AFTER_ATTACK = [...WHERE, 'attack.advantage', 'attack.disadvantage'];
export const JUDGED_ADVANTAGE_IF = WHERE;
// Modifier hooks by what their caller supplies.
//   attack hooks: the attacker, the target, whether it is ranged, a spell's, an Opportunity Attack, and (for a character's attack,
//                 which names its ability, and for a spell's) whether it uses Strength.
//   damage hook:  the attacker, the target, and whether it came from a hit, a weapon, a cantrip.
//   holder hooks: only the creature itself (as the "target"), which the modifier is on.
//   bare hooks:   nothing but the creature the modifier is on.
const SEES = ['target.prone', 'target.unconscious', 'attacker.unseen', 'target.unseen', 'ally.adjacentToTarget', 'enemy.adjacent', 'target.fought', 'target.notFiend', 'within5', 'beyond5', 'self.notIncapacitated'];
export const ATTACK_HOOKS = ['attack.roll', 'attack.received'];
export const DAMAGE_HOOKS = ['damage.dealt'];
export const HOLDER_HOOKS = ['check', 'save', 'save.str', 'save.dex', 'save.con', 'save.int', 'save.wis', 'save.cha', 'save.death', 'concentration', 'd20', 'ac', 'damage.taken'];
export const BARE_HOOKS = ['speed', 'speed.fly', 'initiative', 'spell.dc', 'spell.attack', 'opportunity'];
// Hooks nothing calls `modifiers()` for: a trait's modifier there changes nothing (`hp.max` is applied by the step that puts it on, whatever its `when` says).
export const UNREAD_HOOKS = ['hp.max', 'carry'];
export const JUDGED_ON = {
  ...Object.fromEntries(ATTACK_HOOKS.map((h) => [h, [...SEES, 'ranged', 'melee', 'attack.spell', 'attack.opportunity', 'attack.str']])),
  ...Object.fromEntries(DAMAGE_HOOKS.map((h) => [h, [...SEES, 'attack.hit', 'attack.weapon', 'spell.cantrip']])),
  ...Object.fromEntries(HOLDER_HOOKS.map((h) => [h, ['target.prone', 'target.unconscious', 'target.notFiend', 'self.notIncapacitated', ...(h === 'check' ? ['check.proficient'] : [])]])),
  ...Object.fromEntries(BARE_HOOKS.map((h) => [h, ['self.notIncapacitated']])),
  ...Object.fromEntries(UNREAD_HOOKS.map((h) => [h, []])),
};
// Judged only some of the time. At the attack hooks `attack.str` is known for a character's attack (it says which ability it uses) and for a
// spell's (never Strength), and never for a creature's own action. At `damage.dealt`, the damage of a character's attack from its sheet knows
// whether it was ranged and which ability it used; the damage of a spell or of a creature's action (effects.js) knows neither.
export const JUDGED_SOMETIMES = { 'attack.roll': ['attack.str'], 'attack.received': ['attack.str'], 'damage.dealt': ['ranged', 'melee', 'attack.str'] };
// Judged, but never true there: a creature making a Death Saving Throw is at 0 Hit Points and so Incapacitated.
export const NEVER_TRUE = { 'save.death': ['self.notIncapacitated'] };
// A modifier that adds dice only to a roll that failed (`onFail`: Bardic Inspiration) is asked again when the roll has failed (rolls.js `rescue`), with
// the creature alone as the "target": of the tags above, only these can hold then.
export const ON_FAIL_JUDGED = ['target.prone', 'target.unconscious', 'target.notFiend', 'self.notIncapacitated'];
// Tags that, at a hook where the creature itself is the "target", are about that creature.
export const SELF_TAG_WORDS = { 'target.prone': 'it is Prone', 'target.unconscious': 'it is Unconscious', 'target.notFiend': 'it is not a Fiend' };
// Kept for the older name: the tags no place can judge at all.
export const UNJUDGED_TAGS = TAGS.filter((t) => !JUDGED_STEP_AFTER_ATTACK.includes(t) && !Object.values(JUDGED_ON).some((l) => l.includes(t)));

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
// An author's string inside the reading's own sentence: always between quotation marks, and with none of its own, so that nothing the author wrote can end
// the quotation and carry on as the reading's voice (Decision 6: the author's words are quoted, never in the reading's own sentences; #430).
const plain = (s, n) => clean(s, n).replace(/["\u201c\u201d\u201e\u00ab\u00bb]/g, "'");
const qt = (s, n) => `"${plain(s, n)}"`;
// An id or key shown in a sentence: as written if it is a plain id, otherwise not at all.
const shown = (k) => (typeof k === 'string' && k.length <= 40 && /^[A-Za-z0-9_.-]+$/.test(k) ? `"${k}"` : 'an unreadable name');
const list = (xs, and = 'and') => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${and} ${xs.at(-1)}`);
const cond = (id) => (typeof id === 'string' && Object.hasOwn(CONTENT.conditions, id) && typeof CONTENT.conditions[id].name === 'string' ? CONTENT.conditions[id].name : shown(id));
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const signed = (v) => (typeof v === 'number' ? (v >= 0 ? `+${v}` : `${v}`) : /^[+-]/.test(v) ? v : `+${v}`);
const nameOf = (lookup, id) => (typeof id === 'string' && Object.hasOwn(CONTENT[lookup] ?? {}, id) && typeof CONTENT[lookup][id].name === 'string' ? qt(CONTENT[lookup][id].name, 60) : shown(id));
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
      const kk = /^[A-Za-z0-9_.-]{1,40}$/.test(k) ? k : '(odd key)';          // a key the author chose is never put into a sentence as it is
      const x = copy(v[k], depth + 1, path ? `${path}.${kk}` : kk);
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

//   ctx (all optional):
//     pack     the id of the homebrew pack the entry belongs to. With it (or, without it, an id in the entry's own `source`, "homebrew:<pack>", or an id
//              that begins "hb-") the reader asks strict mode (`lintEntry`) whether a table would load the entry, and an entry it would REFUSE is
//              read as before, but its first line says so, `refused` is true and `refusals` holds the checker's sentences. An SRD entry is not asked.
//     strict   false: do not ask (an entry made only to try the reader's sentences, whose id and source are not a pack's).
//     spells, weapons, armour   ids an item may name (see `lintEntry`).
//   Returns also `refused`: true or false when strict mode was asked, null when it was not; and `refusals`: strict mode's sentences, up to 20.
export function readEntry(kind, entry, ctx = {}) {
  try {
    return refusal(kind, entry, ctx ?? {}, readOrThrow(kind, entry));
  } catch {
    return { kind: (typeof kind === 'string' && Object.hasOwn(KIND_NAMES, kind) ? KIND_NAMES[kind] : typeof kind === 'string' ? kind.slice(0, 20) : ''), title: '(unreadable entry)', tier: null, lines: ['The reader could not read this entry. It cannot be approved.'], doesNot: [], numbers: [], text: null, problems: ['The entry could not be read.'], hash: null, refused: null, refusals: [] };
  }
}
const PLURAL = { spell: 'spells', monster: 'monsters', item: 'items', feat: 'feats' };
// Would a table load this entry? Strict mode's answer (schema.js `lintEntry`), asked for homebrew only.
function refusal(kind, entry, ctx, r) {
  r.refused = null; r.refusals = [];
  const k = typeof kind === 'string' && Object.hasOwn(KIND_NAMES, kind) ? KIND_NAMES[kind] : null;
  if (!k || !READ_KINDS.includes(k) || ctx.strict === false || !isObj(entry)) return r;
  let pack = typeof ctx.pack === 'string' ? ctx.pack : null;
  if (!pack && typeof entry.source === 'string') pack = /^homebrew:([a-z0-9]+(-[a-z0-9]+)*)$/.exec(entry.source)?.[1] ?? null;
  if (!pack && typeof entry.id === 'string' && entry.id.startsWith('hb-')) pack = /^hb-([a-z0-9]+)-/.exec(entry.id)?.[1] ?? 'unknown';
  if (!pack) return r;
  const problems = lintEntry(PLURAL[k], entry, { pack, srd: CONTENT, ...(ctx.spells ? { spells: ctx.spells } : {}), ...(ctx.weapons ? { weapons: ctx.weapons } : {}), ...(ctx.armour ? { armour: ctx.armour } : {}) });
  r.refused = problems.length > 0;
  r.refusals = problems.slice(0, READER_LIMITS.problems).map((x) => cap(String(x), 300));
  if (r.refused) r.lines.unshift(`REFUSED: this entry breaks the rules a table checks (${problems.length} problem${problems.length === 1 ? '' : 's'}, listed apart from this reading), so a table would not load it and it cannot be approved. What follows is how the engine would read it if it were loaded.`);
  return r;
}

// The kinds of entry (the pack's list names, and the singular) and which of them are read so far.
export const KIND_NAMES = { spell: 'spell', spells: 'spell', monster: 'monster', monsters: 'monster', item: 'item', items: 'item', feat: 'feat', feats: 'feat',
  weapon: 'weapon', weapons: 'weapon', armour: 'armour', armor: 'armour', object: 'object', objects: 'object' };
export const READ_KINDS = ['spell', 'monster', 'item', 'feat'];
const IS_THE = { spell: 'a spell', monster: 'a monster', item: 'an item', feat: 'a feat', weapon: 'a weapon', armour: 'armour', object: 'an object' };

function readOrThrow(kind, entry) {
  const problems = [];
  const k = typeof kind === 'string' && Object.hasOwn(KIND_NAMES, kind) ? KIND_NAMES[kind] : null;
  if (!k || !READ_KINDS.includes(k)) {
    const say = k ? `The reader does not read ${k === 'armour' ? 'armour' : `${k}s`} yet; this kind of entry is not read.` : 'The reader does not know this kind of entry.';
    return { kind: k ?? clean(typeof kind === 'string' ? kind : '', 20), title: '(not read)', tier: null, lines: [say], doesNot: [], numbers: [], text: null, problems: [], hash: null, refused: null, refusals: [] };
  }
  const { value: e, over } = tidy(entry, problems);
  if (over || !isObj(e)) {
    const why = over ? 'This entry is too large or too deeply nested to read. It cannot be approved.' : `This is not ${IS_THE[k]} entry (it is not an object). It cannot be approved.`;
    return { kind: k, title: '(unreadable entry)', tier: null, lines: [why], doesNot: [], numbers: [], text: null, problems: [...problems, why], hash: null, refused: null, refusals: [] };
  }
  const R = k === 'monster' ? new MonsterReading(e, problems) : k === 'item' ? new ItemReading(e, problems) : k === 'feat' ? new FeatReading(e, problems) : new Reading(e, problems);
  if (k === 'monster') R.monster(); else if (k === 'item') R.item(); else if (k === 'feat') R.feat(); else R.spell();
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
    this.itm = false;                   // reading an item's use or a feat's action (steps run on the user alone, with no spell stats of their own)
    this.words = null;                  // how the step sentences name the actor and the spell, for a monster, an item or a feat
    this.saveDcs = [];                  // the DC of each save the steps being read sit under (a number, or null), the innermost last
    this.base = 0;                      // extra indent, for the steps of an action under its heading
    this.manualSteps = 0;
    this.never = 0;                     // parts the reading says never take effect (a modifier whose `when` the engine can never judge there)
    this.afterAtk = 0;                  // how many attack branches (`onHit`, `onMiss`) the steps being read sit under
    this.pre = '';                      // path prefix of the numbers an action holds (`actions.0.`)
  }
  line(text, depth = 0) {
    if (this.lines.length >= READER_LIMITS.lines) { this.cut++; return; }
    this.lines.push(`${'  '.repeat(Math.min(depth + this.base, 12))}${cap(this.voice(text), READER_LIMITS.line)}`);
  }
  dm(text) { if (this.doesNot.length < READER_LIMITS.lines) this.doesNot.push(cap(this.voice(text), READER_LIMITS.line)); }
  // The step sentences were written for a spell's caster; a creature's action, an item's use and a feat's action are said in their own words.
  voice(text) {
    const w = this.words;
    if (!w) return text;
    // Never inside quotes: that is the author's own text.
    return text.split(/("[^"]*")/).map((part, i) => (i % 2 ? part : part.replace(/\b([Tt])he caster\b/g, (m, c) => (c === 'T' ? cap1(w.who) : w.who)).replace(/\b([Tt])he spell\b/g, (m, c) => (c === 'T' ? cap1(w.spell) : w.spell)).replace(/\ba spell\b(?! attack)/g, w.aSpell))).join('');
  }
  bad(text) { if (this.problems.length < READER_LIMITS.problems) this.problems.push(cap(text, READER_LIMITS.line)); }
  num(at, value, unit) { if (this.numbers.length < READER_LIMITS.numbers) this.numbers.push({ at, value, unit }); }
  odd(obj, known, where) {
    for (const k of Object.keys(obj)) if (!known.includes(k)) this.bad(`${where} has a key ${shown(k)} the engine does not use.`);
  }
  // The name inside a sentence: quoted. (`title` is the name on its own, for the page to show beside the reading.)
  titleQ() { const n = this.def.name; return typeof n === 'string' && n.trim() ? qt(n, READER_LIMITS.title) : '(no name)'; }
  title() { const n = this.def.name; return typeof n === 'string' && n.trim() ? clean(n, READER_LIMITS.title) : '(no name)'; }
  // The tier sentence, true to what the reading above says: an auto entry that hands parts to the DM, or has parts that never take effect, says so.
  tierSentence(tier, words) {
    const dm = this.doesNot.length > 0, nv = this.never > 0;
    if (tier === 'auto' && (dm || nv)) {
      this.line(`Tier: auto, but ${list([dm ? 'the engine hands the parts listed for the DM to the DM' : null, nv ? 'the engine never applies the parts said above never to take effect, and tells nobody' : null].filter(Boolean))}.`);
    } else {
      this.line(words[tier]);
      if (nv) this.line('Parts of this entry never take effect, as said above: the engine does not apply them and tells nobody.');
    }
  }
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
    this.bad(`Step ${at}: a creature's action has no spellcasting modifier, so \`addMod\` gives an amount that is not a number.`);
    this.line('The engine has no spellcasting modifier for a creature\'s action: adding it gives an amount that is not a number, so the engine applies none of it and tells the DM. This entry should not be approved.', 1);
    this.dm(`The healing of step ${at}: it adds a modifier the engine does not have: applying the amount.`);
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
    this.line(`${this.titleQ()} (${bits.join(', ')}).`);
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
      this.line(`It is cast as a Reaction, by the caster's standing instruction for it (never, always, or ask${this.acGain() ? ', or only when it turns a hit into a miss' : ''}; the default is never, so nothing happens until the player sets it), ${REACTION_WORDS[r.on]}.`);
      if (Array.isArray(r.blocks) && r.blocks.length) this.line(`Being aimed at by ${list(r.blocks.slice(0, 10).map((x) => nameOf('spells', x)), 'or')} also sets it off, and while it lasts that spell does the caster no damage.`);
      return;
    }
    if (CAST_TIMES.includes(d.time)) this.line(`It takes ${CAST_TIME_WORDS[d.time]} to cast, so it cannot be cast during a fight.`);
  }

  // Does the spell raise the caster's Armor Class (so that its Reaction offers "only when it turns a hit into a miss")? reactions.js `acGain`.
  acGain() { let g = false; this.walk((st) => { if (isObj(st.modifier) && st.modifier.on === 'ac' && ['add', 'set', 'min'].includes(st.modifier.op)) g = true; }); return g; }
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
        // engine/world.js `aimAction`: up to `choose` of those caught are picked (`targets`), as for a spell; with more caught and no pick the action is refused.
        this.num(`${this.pre}target.area.choose`, a.choose, 'creatures');
        this.line(`Of those caught, the creature picks up to ${a.choose}; only they are affected. With more caught and no pick the engine refuses the action and asks for one; the monster AI picks the nearest foes, then the most hurt, and never an ally.`);
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
        let steps = 0; this.walk((st) => { if (key in st) steps++; });
        const only = steps > 1 ? ` It grows only the first ${key === 'damage' ? 'damage' : key === 'heal' ? 'healing' : 'Temporary Hit Points'} step (${f.st[key]}${key === 'damage' && DAMAGE_TYPES.includes(f.st.type) ? ` ${f.st.type}` : ''}); the other ${steps - 1} stay${steps === 2 ? 's' : ''} as written.` : '';
        if (ok) this.line(`Cast with a higher slot, ${signed(s[key])}${key === 'heal' ? ' healing' : key === 'tempHp' ? ' Temporary Hit Points' : ''} ${per}.${only}`);
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
    this.tierSentence(d.tier, TIER_WORDS);
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
      this.step(st, at, depth, i === 0 ? who : this.again(who), { ...o, afterDamage: prev === 'damage', afterKill: steps.slice(0, i).some((x) => isObj(x) && 'kill' in x) });
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
  // A step's `when` (effects.js exec): every tag must hold, or the step is skipped; one the engine cannot judge hands the step to the DM.
  // What a step can judge is JUDGED_STEP, and below an attack's `onHit` or `onMiss` also Advantage and Disadvantage (a test plays each).
  whenOf(when, at) {
    if (when === undefined) return '';
    if (!Array.isArray(when)) { this.bad(`Step ${at}: \`when\` is not a list of tags.`); return ' (with an unreadable condition)'; }
    const tags = when.filter((t) => typeof t === 'string' && Object.hasOwn(TAG_WORDS, t));
    if (tags.length !== when.length) this.bad(`Step ${at}: \`when\` names a situation the engine does not know.`);
    const judged = this.afterAtk > 0 ? JUDGED_STEP_AFTER_ATTACK : JUDGED_STEP;
    const un = tags.filter((t) => !judged.includes(t));
    let text = ` This happens only if ${list(tags.map((t) => TAG_WORDS[t]))}.`;
    if (un.length) {
      this.dm(`Deciding whether ${list(un.map((t) => TAG_WORDS[t]))}, each time step ${at} runs.`);
      const how = un.some((t) => t === 'attack.advantage' || t === 'attack.disadvantage') ? ' (the engine knows how an attack roll went only for the steps under that attack\'s hit or miss)' : '';
      text += ` The engine cannot tell whether ${list(un.map((t) => TAG_WORDS[t]))}${how}, so it does not run this step itself: unless an earlier condition already fails, it tells the DM, who applies the step if it holds.`;
    }
    return text;
  }
  // How a condition or modifier put on a creature ends (rolls.js condition and modifier, durations.js boundary and damaged).
  ending(st, at, what) {
    const e = st.ends;
    if (e !== undefined && !isObj(e)) this.bad(`Step ${at}: \`ends\` is not an object.`);
    const ends = isObj(e) && ENDS_ON.includes(e.on) ? e : null;
    if (isObj(e)) this.odd(e, ['on', 'of', 'save', 'at', 'by', 'orDamaged', ...(this.mon || this.itm ? ['dc'] : [])], `Step ${at}: \`ends\``);
    if (isObj(e) && (this.mon || this.itm) && e.dc !== undefined) { if (isInt(e.dc)) this.num(`${at}.ends.dc`, e.dc, 'DC'); else this.bad(`Step ${at}: the ending's DC is not a whole number.`); }
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
      if (this.itm) {
        // engine/rolls.js `endingDc`: the ending's own `dc`, else the step's own; an item's steps have no spell save DC to fall back on.
        const own = isInt(e.dc) ? e.dc : null, base = `It makes ${/^[AEIOU]/.test(ab) ? 'an' : 'a'} ${ab} saving throw ${atw}`, more = ends.orDamaged === true ? '; any damage it takes would also end it' : '';
        if (own === null) { this.dm(`Ending what step ${at} puts on a creature: its repeated save has no DC, so only the DM can end it.`); return `${base}, and a success would end it${more}. But no DC is entered for that save: the engine tells the DM when the condition is put on, and the DM ends it. The engine still rolls the save at the time named, but with no DC to meet it shows a failure every time and never ends the condition.`; }
        return `${base}, against DC ${own}; a success ends it${more}.`;
      }
      if (this.mon) {
        // engine/resolve.js `runAction` and rolls.js `endingDc`: the repeated save is against the ending's own DC (`ends.dc`), else the DC of the
        // innermost save above it that has one; with neither, the engine tells the DM and does not roll it.
        const own = isInt(e.dc) ? e.dc : null, above = [...this.saveDcs].reverse().find((x) => x !== null) ?? null, dc = own ?? above;
        const base = `It makes ${/^[AEIOU]/.test(ab) ? 'an' : 'a'} ${ab} saving throw ${atw}`, more = ends.orDamaged === true ? '; any damage it takes would also end it' : '';
        if (dc === null) {
          this.dm(`Ending what step ${at} puts on a creature: its repeated save has no DC anywhere (neither \`ends.dc\` nor a save above it), so only the DM can end it.`);
          return `${base}, and a success would end it${more}. But no DC is entered for that save: the engine tells the DM when the condition is put on, and the DM ends it. The engine still rolls the save at the time named, but with no DC to meet it shows a failure every time and never ends the condition.`;
        }
        return `${base}, against DC ${dc} (${own !== null ? 'the entry\'s own DC for it' : 'the DC of the save that put it on'}); a success ends it${more}.`;
      }
      text = `It makes ${/^[AEIOU]/.test(ab) ? 'an' : 'a'} ${ab} saving throw ${atw}, against the caster's spell save DC; a success ends it${ends.orDamaged === true ? '. Any damage it takes also ends it' : ''}${this.fx === 'spell' ? '. It also ends with the spell' : ''}.`;
    } else {
      text = `It ends when it takes damage${ends.by === 'source' ? ' from the caster or the caster\'s side' : ''}${this.fx === 'spell' ? ', or with the spell' : ''}.`;
      if (this.fx === 'bound') text += ' Nothing else ends it: it stays through the end of a fight and a rest until then, or until the DM ends it.';
    }
    return text;
  }
}

function saveSentence({ st, at, depth, Who, say }) {
  const ab = ABILITY_WORDS[st.save];
  if (!ab) this.bad(`Step ${at}: the save names no ability.`);
  let dc = '';
  if (st.dc !== undefined) { if (isInt(st.dc)) { this.num(`${at}.dc`, st.dc, 'DC'); dc = ` against DC ${st.dc}`; } else this.bad(`Step ${at}: the save's DC is not a whole number.`); }
  say(`${Who} makes ${ab ? `${/^[AEIOU]/.test(ab) ? 'an' : 'a'} ${ab} saving throw` : 'a saving throw of an unreadable ability'}${dc}.`);
  if (this.itm && st.dc === undefined) { this.line('No DC is written in for this save, and an item\'s own steps have no spell save DC: the engine does not roll it, it tells the DM, who applies it.', depth); this.dm(`The save of step ${at}: it has no DC.`); }
  if (st.advantageIf !== undefined) {
    const tags = Array.isArray(st.advantageIf) ? st.advantageIf.filter((t) => typeof t === 'string' && Object.hasOwn(TAG_WORDS, t)) : [];
    const un = tags.filter((t) => !JUDGED_ADVANTAGE_IF.includes(t));
    this.line(`It has Advantage on this save if ${list(tags.map((t) => TAG_WORDS[t]))}${un.length ? `. The engine cannot tell whether ${list(un.map((t) => TAG_WORDS[t]))}: it rolls the save without that Advantage and tells the DM, who decides` : ''}.`, depth);
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
    this.line(`On a failure it takes ${list(fail.map((x) => `${x.damage} ${x.type === 'chosen' ? 'damage of the chosen type' : `${x.type} damage`}`))}; on a success, half.${st.save === 'dex' ? ' A creature with Evasion (and not Incapacitated) takes none on a success and half on a failure.' : ''}`, depth);
    return;
  }
  if (half && st.save === 'dex') this.line('A creature with Evasion (and not Incapacitated) takes none of that damage on a success and half of it on a failure; whatever else a failure does still happens.', depth);
  if (st.onFail !== undefined) { this.line('On a failure:', depth); this.steps(st.onFail, `${at}.onFail`, depth + 1, this.it()); }
  if (half) this.line('On a success, the failure steps run at half: their damage is halved, a roll among them is still made, and nothing else in them happens.', depth);
  else if (st.half === true) this.line('It says half on a success, but it has no failure steps to halve: a success runs the success steps.', depth);
  if (succ !== undefined) {
    if (half) { this.line('The entry also lists steps for a success, but the engine never runs them: a success already runs the failure steps at half.', depth); this.bad(`Step ${at}: success steps beside half are never run.`); }
    else { this.line('On a success:', depth); this.steps(succ, `${at}.onSuccess`, depth + 1, this.it()); }
  }
  if (st.onFail === undefined && succ === undefined) this.bad(`Step ${at}: a save with nothing on a failure or a success.`);
}

// One sentence maker per step kind (STEPS). `this` is the Reading. A test holds the keys equal to STEPS.
export const STEP_SENTENCES = {
  attack({ st, at, depth, who, say }) {
    const kind = st.kind === 'weapon' ? 'weapon' : st.kind === 'spell' ? 'spell' : null;
    if (!['melee', 'ranged'].includes(st.attack) || !kind) this.bad(`Step ${at}: the attack is not melee or ranged, spell or weapon.`);
    let bonus = '';
    if (kind === 'weapon') { if (isInt(st.bonus)) { this.num(`${at}.bonus`, st.bonus, 'to hit'); bonus = ` with ${signed(st.bonus)} to hit`; } else this.bad(`Step ${at}: a weapon attack has no whole-number bonus.`); }
    say(`The caster makes a ${st.attack === 'melee' ? 'melee' : 'ranged'} ${kind ?? ''} attack roll${bonus} against ${who}.`.replace('  ', ' '));
    if (this.itm && kind === 'spell') {
      // effects.js: a spell attack takes its bonus from the spell's caster (`src.attack`); an item's own steps have none (a spell the item casts does).
      this.line('The engine has no spell attack bonus for an item\'s own steps, so it makes no roll: it tells the DM, who rolls it and says whether it hits, and it counts as a miss meanwhile. A weapon attack with a bonus written in would be rolled.', depth);
      this.dm(`The attack of step ${at}: it is a spell attack, which has no bonus in an item's own steps: rolling it and saying whether it hits.`);
    }
    if (this.mon && kind === 'spell') {
      // effects.js: a spell attack takes its bonus from the spell's caster (`src.attack`); a creature's action has none.
      this.bad(`Step ${at}: a creature's action has no spell attack bonus for the engine to use.`);
      this.line('The engine has no spell attack bonus for a creature\'s action, so it makes no roll: it tells the DM, who rolls it and says whether it hits, and it counts as a miss meanwhile. The entry should be a weapon attack with a bonus.', depth);
      this.dm(`The attack of step ${at}: it is a spell attack, which has no bonus in a creature's action: rolling it and saying whether it hits.`);
    }
    // effects.js `exec`: the branch of an attack carries how the roll went (`mode`) into every step below it, so a `when` on Advantage or Disadvantage can be judged there.
    this.afterAtk++;
    try {
      if (st.onHit !== undefined) { this.line('On a hit:', depth); this.steps(st.onHit, `${at}.onHit`, depth + 1, this.it()); }
      if (st.onMiss !== undefined) { this.line('On a miss:', depth); this.steps(st.onMiss, `${at}.onMiss`, depth + 1, this.it()); }
    } finally { this.afterAtk--; }
    if (st.onHit === undefined && st.onMiss === undefined) this.bad(`Step ${at}: an attack with nothing on a hit or a miss.`);
  },
  // A save's DC is kept while its branches are read, for an ending that repeats it (`ending`, above).
  save(o) { this.saveDcs.push(isInt(o.st.dc) ? o.st.dc : null); try { return saveSentence.call(this, o); } finally { this.saveDcs.pop(); } },
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
    say(`${Who} regains ${isDice(st.heal) ? st.heal : '(unreadable dice)'}${st.addMod === true && !this.mon && !this.itm ? ' plus the caster\'s spellcasting ability modifier' : ''} Hit Points${least}${st.addMod === true && this.mon ? ', plus a modifier the engine does not have here' : ''}${st.addMod === true && this.itm ? ', plus 0: an item\'s own steps have no spellcasting modifier to add' : ''}.`);
    if (this.mon && st.addMod === true) this.noMod(at);
  },
  tempHp({ st, at, Who, say }) {
    if (!isDice(st.tempHp)) this.bad(`Step ${at}: the Temporary Hit Points are not dice.`); else this.num(`${at}.tempHp`, st.tempHp, 'dice');
    const least = isInt(st.atLeast) ? (this.num(`${at}.atLeast`, st.atLeast, 'Temporary Hit Points'), `, at least ${st.atLeast}`) : '';
    say(`${Who} gains ${isDice(st.tempHp) ? st.tempHp : '(unreadable dice)'}${st.addMod === true && !this.mon && !this.itm ? ' plus the caster\'s spellcasting ability modifier' : ''} Temporary Hit Points${least}${st.addMod === true && this.mon ? ', plus a modifier the engine does not have here' : ''}${st.addMod === true && this.itm ? ', plus 0: an item\'s own steps have no spellcasting modifier to add' : ''}; they replace what it has only if they are more${this.fx ? ', and they vanish when the spell ends' : ''}.`);
    if (this.mon && st.addMod === true) this.noMod(at);
  },
  condition({ st, at, depth, Who, say }) {
    if (!CONDITIONS.includes(st.condition)) { this.bad(`Step ${at}: the condition is not one the engine knows.`); say(`${Who} gets a condition the engine does not know.`); return; }
    say(`${Who} has the ${cond(st.condition)} condition. (The engine does nothing for a creature that already has it, is at 0 Hit Points, or is immune to it.)`);
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
  remains({ st, at, say, o }) {
    if (!REMAINS.includes(st.remains)) this.bad(`Step ${at}: \`remains\` is not one the engine knows.`);
    const left = REMAINS_WORDS[st.remains] ?? 'something unreadable';
    // effects.js: a body that is not dead has no remains: the DM is told. Certainly dead under `onKill`, or after a `kill` step in the same list.
    if (/\.onKill\.\d+$/.test(at) || o.afterKill) return say(`What is left of its body is ${left}.`);
    say(`If it is dead, what is left of its body is ${left}. If it is not dead (a character at 0 Hit Points is not), the engine leaves it as it is and tells the DM, who applies the rest.`);
    this.dm(`Step ${at}: what is left of a body that is not dead.`);
  },
  endConcentration({ Who, say }) { say(`${Who} loses Concentration on whatever it is concentrating on.`); },
  summon({ st, at, depth, say }) { summonLines.call(this, st, at, depth, say); },
  manual({ st, at, say }) {
    this.hasManual = true; this.manualSteps++;
    const text = typeof st.manual === 'string' && st.manual.trim() ? plain(st.manual, READER_LIMITS.quote) : null;
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
    if (types && ['resist', 'vulnerable', 'immune'].includes(op)) noun = types.every((t) => t === 'the chosen type') ? 'damage of the chosen type' : `${list(types, 'or')} damage`;
    else if (!types && ['resist', 'vulnerable', 'immune'].includes(op)) noun = 'all damage';
  }
  let v = '';
  if (['add', 'set', 'min', 'max', 'floor'].includes(op)) {
    const val = m.value;
    if (typeof val === 'number') { this.num(`${at}.value`, val, 'modifier'); v = op === 'add' ? signed(val) : `${val}${['speed', 'speed.fly'].includes(hook) ? ' feet' : ''}`; if (op === 'add' && ['speed', 'speed.fly'].includes(hook)) v += ' feet'; }
    else if (isObj(val) && typeof val.perLevel === 'number') { this.num(`${at}.value.perLevel`, val.perLevel, 'per level'); v = `${signed(val.perLevel)} for each level of it`; }
    else if (op === 'add' && typeof val === 'string' && MOD_DICE.test(val)) { this.num(`${at}.value`, val, 'dice'); v = signed(val); }
    // A feature's value may be an amount that grows with the class or the character (derive.js `amount`, put in when the feature is made).
    else if (isObj(val) && isInt(val.prof)) { this.num(`${at}.value.prof`, val.prof, 'times the Proficiency Bonus'); v = val.prof === 1 ? 'the Proficiency Bonus' : `${val.prof} times the Proficiency Bonus`; }
    else if (isObj(val) && typeof val.mod === 'string' && ABILITIES.includes(val.mod)) { if (isInt(val.min)) this.num(`${at}.value.min`, val.min, 'least'); v = `the ${ABILITY_WORDS[val.mod]} modifier${isInt(val.min) ? ` (at least ${val.min})` : ''}`; }
    else if (isObj(val) && isObj(val.byLevel)) { for (const [l, x] of Object.entries(val.byLevel)) if (typeof x === 'number' || isDice(x)) this.num(`${at}.value.byLevel.${l}`, x, 'by class level'); v = `an amount that grows with the class level (${list(Object.entries(val.byLevel).slice(0, 20).map(([l, x]) => `${x} from level ${l}`))})`; }
    else if (isObj(val) && typeof val.column === 'string') v = 'an amount from the class table';
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
    const tags = Array.isArray(m.when) ? m.when.filter((t) => typeof t === 'string' && Object.hasOwn(TAG_WORDS, t)) : [];
    if (!Array.isArray(m.when) || tags.length !== m.when.length) this.bad(`${at}: \`when\` names a situation the engine does not know.`);
    const hook = typeof m.on === 'string' ? m.on : '';
    const own = HOLDER_HOOKS.includes(hook);                       // the creature itself is the "target" there: its own state is what is asked
    const word = (t) => (own && SELF_TAG_WORDS[t]) || TAG_WORDS[t];
    bits.push(`it holds only when ${list(tags.map(word))}`);
    if (hook === 'hp.max') {
      // rolls.js `modifier`: the Hit Point maximum changes when the modifier is put on, and nothing asks its `when`.
      if (!this.inTrait && tags.length && m.op === 'add') bits.push('the engine does not ask that when it changes the Hit Point maximum: it changes it whatever the situation is');
    } else if (hook === 'carry') {
      if (!this.inTrait && tags.length) { this.never++; bits.push('the engine never applies this, since nothing reads carrying capacity'); }
    } else if (Object.hasOwn(JUDGED_ON, hook)) {
      const judged = m.onFail === true ? JUDGED_ON[hook].filter((t) => ON_FAIL_JUDGED.includes(t)) : JUDGED_ON[hook];
      // `attack.str`: known only when the attack says which ability it uses (a character's) or is a spell's. A creature's own attack never does.
      const sometimes = (JUDGED_SOMETIMES[hook] ?? []).filter((t) => tags.includes(t));
      const dead = tags.filter((t) => (NEVER_TRUE[hook] ?? []).includes(t));
      const never = tags.filter((t) => !judged.includes(t) || (sometimes.includes(t) && this.mon && this.inTrait));
      if (dead.length) {
        this.never++;
        bits.push(`the engine never applies this: a creature making a Death Saving Throw is at 0 Hit Points, so ${list(dead.map(word))} cannot hold`);
      }
      if (never.length) {
        this.never++;
        bits.push(`the engine never applies this: at ${HOOK_WORDS[hook]} it cannot tell whether ${list(never.map(word))}, and it skips a modifier it cannot be sure of, without telling anyone`);
      } else if (sometimes.length && !this.inTrait) {
        bits.push(hook === 'damage.dealt'
          ? `the engine can tell whether ${list(sometimes.map(word))} only for the damage of an attack a character makes from its own sheet; for the damage of a spell or of a creature's action it cannot, and there it skips the modifier without telling anyone`
          : `the engine can tell whether ${list(sometimes.map(word))} only for a character's attack (which names its ability) and a spell's attack roll; for a creature's own action it cannot, and there it skips the modifier without telling anyone`);
      }
    }
  }
  if (m.on === 'hp.max' && m.op === 'add' && !this.inTrait) bits.push('current Hit Points move with the maximum, and back when it ends');
  return bits.length ? bits.map((b) => `${cap1(b)}.`).join(' ') : null;
}
// A summon step (docs/specs/companions.md): who is made, how many, and the bond.
function summonLines(st, at, depth, say) {
  const what = st.forms !== undefined
    ? (Array.isArray(st.forms) ? `one form the caster picks from ${list(st.forms.slice(0, 40).map((x) => nameOf('monsters', x)), 'or')}`
      : isObj(st.forms) ? `a ${CREATURE_TYPES.includes(st.forms.type) ? cap1(st.forms.type) : 'creature of an unknown type'} of challenge rating exactly ${typeof st.forms.cr === 'number' ? st.forms.cr : '?'}, which the caster picks` : 'an unreadable form')
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
    this.kind = 'monster'; this.mon = true; this.actor = 'the creature'; this.words = { who: 'the creature', spell: 'the action', aSpell: 'an action' };
    this.later = [];            // lines that follow the title line
    this.textOnly = 0;
    this.id = def.id;
  }

  monster() {
    const d = this.def;
    this.odd(d, Object.keys(MONSTER_FIELDS), 'The monster');
    const bits = HEADER.map((f) => this[{ size: 'fSize', type: 'fType', cr: 'fCr', xp: 'fXp' }[f]]()).filter(Boolean);
    this.line(`${this.titleQ()} (${bits.join(', ')}).`);
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
    return CREATURE_TYPES.includes(lower) ? lower : qt(t, 40).toLowerCase();
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
  }
  // The passive Perception the engine works out (engine/rolls.js `passive`): 10, plus the skill bonus (else the Wisdom modifier), plus what its traits add to
  // Perception checks, 5 more with Advantage and 5 less with Disadvantage (dice are not rolled for a passive score). A modifier with a `when` holds only
  // sometimes, so it is left out of the number and said.
  passivePerception() {
    const sk = this.def.skills;
    let score = 10 + (isObj(sk) && isInt(sk.perception) ? sk.perception : this.mod('wis')), adv = false, dis = false, maybe = false;
    for (const t of Array.isArray(this.def.traits) ? this.def.traits : []) for (const m of isObj(t) && Array.isArray(t.modifiers) ? t.modifiers : []) {
      if (!isObj(m) || m.on !== 'check' || m.onFail === true || m.spell !== undefined) continue;
      const sc = isObj(m.scope) ? m.scope : {};
      if ((sc.skill !== undefined && sc.skill !== 'perception') || (sc.ability !== undefined && sc.ability !== 'wis') || sc.condition !== undefined) continue;
      if (Array.isArray(m.when) && m.when.length) { maybe = true; continue; }
      if (m.op === 'add') { const v = typeof m.value === 'number' ? m.value : isObj(m.value) && typeof m.value.perLevel === 'number' ? m.value.perLevel : 0; score += v; }
      else if (m.op === 'advantage') adv = true;
      else if (m.op === 'disadvantage') dis = true;
    }
    if (adv && !dis) score += 5; else if (dis && !adv) score -= 5;
    return { score, adv, dis, maybe };
  }
  fSenses() {
    const s = this.def.senses;
    if (s !== undefined && !isObj(s)) { this.bad('The monster\'s senses are not a list of ranges.'); return; }
    const names = Object.keys(s ?? {});
    if (s) this.odd(s, Object.keys(SENSE_WORDS), 'Its senses');
    const ok = names.filter((k) => Object.hasOwn(SENSE_WORDS, k) && isInt(s[k]) && s[k] >= 0);
    if (ok.length !== names.length) this.bad('A sense is not a range in feet for darkvision, blindsight, tremorsense or truesight.');
    for (const k of ok) this.num(`senses.${k}`, s[k], 'feet');
    const pp = this.passivePerception();
    this.line(`Senses: ${list([...ok.map((k) => `${k} ${s[k]} feet`), `passive Perception ${pp.score}`])}.`);
    if (pp.adv || pp.dis) this.line(`The passive Perception counts ${pp.adv && !pp.dis ? 'the Advantage a trait gives on Perception checks as 5 more' : pp.dis && !pp.adv ? 'the Disadvantage a trait gives on Perception checks as 5 less' : 'Advantage and Disadvantage on Perception checks from its traits as cancelling out'}, as the engine does.`);
    if (pp.maybe) this.line('A trait that changes its Perception checks only in some situations is not counted in that number; it changes the number only while the situation holds.');
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
    this.line(v.length ? `Languages (shown to the DM only; the engine does nothing with them): ${v.slice(0, 12).map((x) => qt(x, 120)).join(', ')}.` : 'Languages: none.');
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
    const name = typeof t.name === 'string' && t.name.trim() ? qt(t.name, 60) : '(no name)';
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
      const m = typeof r.manual === 'string' && r.manual.trim() ? plain(r.manual, READER_LIMITS.quote) : null;
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
    return a && typeof a.name === 'string' && a.name.trim() ? qt(a.name, 60) : shown(id);
  }
  action(a, i) {
    const at = `actions.${i}`;
    if (!isObj(a)) { this.bad(`${at} is not an action.`); return this.line('(An action the reader cannot read.)'); }
    this.odd(a, Object.keys(ACTION_FIELDS), `Action ${i + 1}`);
    const name = typeof a.name === 'string' && a.name.trim() ? qt(a.name, 60) : '(no name)';
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
      this.line('The engine cannot aim this action: using it is refused with a sentence, and the monster AI skips it. This entry should not be approved.');
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
          if (!o) this.bad(`${p}: names ${typeof id === 'string' ? qt(id, 40) : '?'}, which is not one of this creature's actions.`);
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
  // Will the monster AI use it, and when? (ai.js `withActions`: it considers only harmful actions that are not spent, and picks in this order: a Bonus Action
  // area that would catch two or more foes; an action area that would catch two or more; a Multiattack whose attacks reach a foe; a weapon attack, the nearest foe
  // it can reach, melee before ranged; an area that would catch one; any other action aimed at one creature. A Bonus Action aimed at creatures is never picked.
  // An area without `choose` is not aimed where an ally would be caught. A test plays each of these.)
  aiLine(a) {
    let p = null;
    try { p = actionProfile(structuredClone(a)); } catch { p = null; }
    if (!p || !p.harmful || !['creature', 'area', 'multi'].includes(p.aim)) return this.line('The monster AI never picks this action by itself: the DM sends it.');
    const bonus = p.time === 'bonus';
    if (p.aim === 'multi') return this.line('The monster AI uses this Multiattack on its own turn when one of its attacks can reach a foe (it walks up first if none can).');
    if (p.aim === 'creature') {
      if (bonus) return this.line('The monster AI never uses a Bonus Action that is aimed at creatures: it uses a Bonus Action only for an area that would catch two or more foes. The DM sends this one.');
      return this.line(p.roll === 'melee' || p.roll === 'ranged'
        ? 'The monster AI uses this action on its own turns: it makes the attack at the nearest foe it can reach (a melee attack before a ranged one).'
        : 'The monster AI uses this action on its own turns, but only when it has no weapon attack that reaches a foe: then it aims it at the nearest foe it can reach.');
    }
    const choose = isObj(a.target?.area) && isInt(a.target.area.choose);
    const side = choose ? 'it picks the foes (up to that many) and never an ally' : 'it never aims it where one of its own side would be caught';
    return this.line(bonus
      ? `The monster AI uses this Bonus Action on its own turn only when the area would catch two or more foes; ${side}. Otherwise it does not use it, and the DM sends it.`
      : `The monster AI uses this action on its own turn when the area would catch two or more foes (or, when nothing else reaches a foe, one); ${side}.`);
  }

  // ----- the end -----
  fTier() {
    const t = this.def.tier;
    if (!TIERS.includes(t)) return this.bad('The tier is not auto, assist or manual.');
    const n = this.doesNot.length;
    this.tierSentence(t, MONSTER_TIER_WORDS);
    if (t !== 'auto') {
      this.line(n ? `Why: ${this.textOnly ? `${this.textOnly} trait${this.textOnly > 1 ? 's' : ''} only the DM runs; ` : ''}${n} thing${n > 1 ? 's' : ''} the DM does by hand, listed below.` : 'Why: the reader finds nothing the DM must do by hand in the entry itself; the entry\'s tier says its description holds more.');
      this.line('The author\'s description is shown beside this reading; whatever it says beyond the lines above, the DM runs.');
      this.dm('Whatever the description says beyond the lines above.');
    }
  }
  fChecked() { this.line(this.def.checked === true ? 'Marked as checked against the rules text.' : 'Not checked against any rulebook.'); }
}

// ====================================================================================================
// Items and feats (task B13, second part). Read from what the engine does with them: `derive.js` (`itemFeature`, `featFeature`: a
// worn or attuned item's `grants`, and a chosen feat's, become features of the character, whose modifiers `modifiers.js` reads;
// `validate`/`checkFeats`: where an item is worn, attunement, a feat's prerequisites), `engine/features.js` (`use`, `planItem`,
// `useItem`: a use of an item), `engine/rests.js` (attuning on a Short Rest, charges at dawn), `engine/casting.js` (a spell cast
// from an item; a spell cast through a feature's `freeCast`) and `effects.js` (what a step does with no spell behind it).
// ====================================================================================================
export const ITEM_FIELDS = {
  id: 'skip', name: 'skip', source: 'skip', text: 'skip', category: 'header', rarity: 'header', wear: 'fWear', attune: 'fAttune', base: 'fBase', bonus: 'fBonus', damageType: 'fDamageType',
  properties: 'fProperties', trained: 'fTrained', variant: 'fVariant', grants: 'fGrants', charges: 'fCharges', activate: 'fActivate', tier: 'fTier', checked: 'fChecked',
};
export const FEAT_FIELDS = {
  id: 'skip', name: 'skip', source: 'skip', text: 'skip', category: 'header', prerequisite: 'fPrerequisite', repeatable: 'fRepeatable', increase: 'fIncrease', proficiencies: 'fProficiencies',
  spellPick: 'fSpellPick', grants: 'fGrants', tier: 'fTier', checked: 'fChecked',
};
export const ACTIVATE_FIELDS = { name: 'head', time: 'head', cost: 'charges', consumed: 'gone', spell: 'spell', level: 'spell', upTo: 'spell', self: 'spell', dc: 'spell', effects: 'steps' };
export const ATTUNE_FIELDS = ['by', 'spellcaster'];
export const BASE_FIELDS = ['armour', 'weapon'];
export const CHARGES_FIELDS = ['max', 'regain'];
export const PREREQUISITE_FIELDS = ['abilities', 'feature', 'level'];
export const ANY_ABILITY_FIELDS = ['any', 'min'];
export const INCREASE_FIELDS = ['from', 'max', 'points'];
export const PROFICIENCIES_FIELDS = ['n'];
export const SPELLPICK_FIELDS = ['abilities', 'cantrips', 'level1', 'lists'];
export const AURA_FIELDS = ['immune', 'modifiers', 'range'];
export const FREECAST_COST_FIELDS = ['slot', 'uses'];
export const ITEM_CATEGORY_WORDS = { armor: 'armor', potion: 'potion', ring: 'ring', rod: 'rod', scroll: 'scroll', staff: 'staff', wand: 'wand', weapon: 'weapon', wondrous: 'wondrous item' };
export const RARITY_WORDS = { common: 'common', uncommon: 'uncommon', rare: 'rare', 'very-rare': 'very rare', legendary: 'legendary', artifact: 'artifact', varies: 'of varying rarity,' };
export const WEAR_WORDS = {
  feet: 'worn on the feet', hands: 'worn on the hands', wrists: 'worn on the wrists', armour: 'worn as armor', head: 'worn on the head', cloak: 'worn as a cloak', shield: 'held as a Shield',
  weapon: 'held as a weapon', ring: 'worn on a finger', neck: 'worn on the neck', waist: 'worn at the waist', body: 'worn on the body', eyes: 'worn over the eyes', orbit: 'orbiting the head',
  carried: 'carried',
};
export const ITEM_VARIANT_WORDS = {
  damageType: 'The sheet that holds it picks a damage type; each "chosen" damage type in its changes below is that type.',
  spell: 'It is a scroll of one spell, which the sheet that holds it names. Only a creature whose class spell list has that spell can read it; a spell above the level it can cast takes an ability check against DC 10 plus the spell\'s level, and on a failure the spell is lost with the scroll. Reading it needs a use below.',
};
export const FEAT_CATEGORY_WORDS = { origin: 'an Origin feat', general: 'a General feat', 'fighting-style': 'a Fighting Style feat', 'epic-boon': 'an Epic Boon feat' };
export const FEAT_FEATURE_WORDS = { 'fighting-style': 'a Fighting Style feature', spellcasting: 'a Spellcasting feature' };
export const ACTION_TIME_WORDS = { action: 'an action', bonus: 'a Bonus Action', reaction: 'a Reaction', free: 'no action' };
export const ITEM_TIER_WORDS = {
  auto: 'Tier: auto. The engine applies everything above.',
  assist: 'Tier: assist. The engine applies what is listed above as applied by the engine; the DM applies the rest of the description.',
  manual: 'Tier: manual. The DM applies this item; the engine only shows the description.',
};
export const FEAT_TIER_WORDS = {
  auto: 'Tier: auto. The engine applies everything above.',
  assist: 'Tier: assist. The engine applies what is listed above as applied by the engine; the DM applies the rest of the description.',
  manual: 'Tier: manual. The DM applies this feat; the engine only shows the description.',
};
// The keys the item linter refuses in an item's `grants` (a class's own: lintItem). A test holds this equal to the linter's refusals.
export const ITEM_NO_GRANTS = ['action', 'reaction', 'extraAttack', 'sneak', 'martialArts', 'freeCast', 'metamagic', 'metamagicMax', 'exchange', 'restore', 'recover', 'cure', 'skills', 'expertise', 'cantrips',
  'spellLists', 'spells', 'proficiency', 'hp'];
// Where the engine looks for a grant, apart from what a feature does for a class: features of a class only (derive.js reads them through `classFeatures`, or by the class a feature belongs to,
// and a feat's or an item's feature belongs to none), so a feat or an item that holds the key changes nothing. A test runs derive to hold this to the engine.
export const GRANTS_CLASS_ONLY = ['attune', 'spells', 'spellLists', 'cantrips'];

// What the freeCast keys say, one sentence for each. `v` is the value, `fc` the freeCast. A test holds the keys equal to HOMEBREW_TYPES.freeCast.
export const FREECAST_WORDS = {
  list: (v, fc) => `Any spell on the ${CONTENT.classes?.[v]?.name ?? shown(v)} spell list${isInt(fc?.maxLevel) ? `, of level ${fc.maxLevel} or lower` : ''}, prepared or not, with no slot; it is cast as a Magic action.`,
  maxLevel: (v) => `The highest spell level is ${v}.`,
  spells: (v) => `Only ${list((Array.isArray(v) ? v : []).slice(0, 30).map((x) => nameOf('spells', x)), 'or')}, each at its own level and its own casting time, with no slot.`,
  atWill: () => 'Nothing is spent: it can be cast as often as the holder likes.',
  cost: (v) => `Each cast spends either a spell slot, as an ordinary cast would (the caster says which), or one use of the holder's feature ${shown(v?.uses)}. With none of those uses left, only the slot is left.`,
  self: () => 'It can be cast on the holder alone.',
  dark: () => 'It works only while the holder stands in Dim Light or Darkness.',
  sureSave: () => 'The holder succeeds on every saving throw the spell asks of it.',
  maxTemp: () => 'Temporary Hit Point dice the spell rolls count at their highest.',
  time: () => 'It is cast as a Magic action, whatever its own casting time.',
  forms: (v) => `The holder may also choose ${list((Array.isArray(v) ? v : []).slice(0, 20).map((x) => nameOf('monsters', x)), 'or')} as a form for a creature the spell makes.`,
  types: (v) => `A creature the spell makes may be only of the type ${list((Array.isArray(v) ? v : []).map((x) => (CREATURE_TYPES.includes(x) ? cap1(x) : 'an unreadable type')), 'or')}.`,
  ends: (v) => `The bond with a creature the spell makes also ends ${list((Array.isArray(v) ? v : []).map((x) => SUMMON_END_WORDS[x] ?? 'at an unreadable time'), 'or')}.`,
  components: () => 'The spell\'s Material component is left out: a costly one hides nothing and gives nothing to see.',
};

// What a Spell Scroll gives its spell: up to this level, the save DC and the attack bonus (engine/features.js, SCROLL_STATS). A test holds it to the engine's.
export const SCROLL_STATS = [[2, 13, 5], [4, 15, 7], [6, 17, 9], [8, 18, 10], [9, 19, 11]];
const abilList = (xs, and = 'or') => list((Array.isArray(xs) ? xs : []).slice(0, 6).map((x) => ABILITY_WORDS[x] ?? 'an unreadable ability'), and);
const conds = (xs) => list((Array.isArray(xs) ? xs : []).slice(0, 15).map((c) => (CONDITIONS.includes(c) ? `the ${cond(c)} condition` : 'a condition the reader cannot read')));
const featureNote = (id) => `Only a holder who has the feature ${shown(id)} gets anything from this.`;
const feetWord = (v) => (isInt(v) ? `${v} feet` : 'an unreadable number of feet');
const amountWord = (v) => (typeof v === 'number' ? String(v) : isObj(v) && isInt(v.perLevel) ? `${v.perLevel} for each level of the class` : isObj(v) && v.prof !== undefined ? `${v.prof} times the Proficiency Bonus` : isObj(v) && isObj(v.byLevel) ? 'a number that grows with the class level' : isObj(v) && typeof v.column === 'string' ? 'a number from the class table' : isObj(v) && typeof v.mod === 'string' ? `the ${ABILITY_WORDS[v.mod] ?? 'unreadable'} modifier${isInt(v.min) ? ` (at least ${v.min})` : ''}` : 'an unreadable amount');
// Every number in an amount ({ perLevel }, { prof }, { byLevel }, { min }, a plain number), found where the entry holds it.
function amountNums(R, v, at, unit) {
  if (typeof v === 'number') return R.num(at, v, unit);
  if (!isObj(v)) return;
  for (const k of ['perLevel', 'prof', 'min']) if (typeof v[k] === 'number') R.num(`${at}.${k}`, v[k], unit);
  if (isObj(v.byLevel)) for (const [l, x] of Object.entries(v.byLevel)) { if (typeof x === 'number' || isDice(x)) R.num(`${at}.byLevel.${l}`, x, unit); }
}
// Every number and dice string under a value, as the test finds them (not ids, names or text).
const NOT_NUMBERS_HERE = ['id', 'name', 'source', 'text', 'manual', 'action', 'when', 'advantageIf', 'set', 'resource', 'spell', 'checked', 'spells', 'of', 'while', 'after', 'regain', 'list'];
function deepNums(R, v, at, unit, depth = 0) {
  if (depth > READER_LIMITS.depth) return;
  if (typeof v === 'number') R.num(at, v, unit);
  else if (typeof v === 'string') { if (/\d/.test(v) && isDice(v)) R.num(at, v, 'dice'); }
  else if (Array.isArray(v)) v.forEach((x, i) => deepNums(R, x, `${at}.${i}`, unit, depth + 1));
  else if (isObj(v)) for (const [k, x] of Object.entries(v)) if (!NOT_NUMBERS_HERE.includes(k)) deepNums(R, x, `${at}.${k}`, unit, depth + 1);
}

// One sentence maker per key of `grants` (GRANTS; a test holds the keys equal). `this` is the reading. `v` is the value, `at` its place in the entry.
export const GRANT_WORDS = {
  modifiers(v, at) {
    if (!Array.isArray(v) || !v.length) return this.bad(`${at} is not a list of modifiers.`);
    this.line('Changes to rolls and numbers:', 1);
    v.forEach((m, j) => this.grantMod(m, `${at}.${j}`));
  },
  aura(v, at) {
    if (!isObj(v)) return this.bad(`${at} is not an aura.`);
    this.odd(v, AURA_FIELDS, 'The aura');
    const r = v.range;
    if (isInt(r)) this.num(`${at}.range`, r, 'feet'); else if (isObj(r) && isObj(r.byLevel)) for (const [l, x] of Object.entries(r.byLevel)) { if (isInt(x)) this.num(`${at}.range.byLevel.${l}`, x, 'feet'); } else this.bad(`${at}.range is not feet.`);
    this.line(`An aura ${isInt(r) ? `${r} feet` : 'of a range that grows with the class level'} out from the holder. The holder, and every creature on the holder's side in range with no Total Cover between, get what is listed below, for as long as the holder is up and not Incapacitated. Two of the same aura do not add up.`, 1);
    if (Array.isArray(v.modifiers)) v.modifiers.forEach((m, j) => this.grantMod(m, `${at}.modifiers.${j}`, 2));
    else if (v.modifiers !== undefined) this.bad(`${at}.modifiers is not a list.`);
    if (v.immune !== undefined) { if (Array.isArray(v.immune) && v.immune.length && v.immune.every((c) => CONDITIONS.includes(c))) this.line(`Immunity to ${conds(v.immune)}: a creature in the aura is not given ${v.immune.length > 1 ? 'any of them' : 'it'}.`, 2); else this.bad(`${at}.immune is not a list of conditions.`); }
    if (v.modifiers === undefined && v.immune === undefined) this.bad(`${at} gives neither modifiers nor immunities.`);
  },
  cure(v) {
    if (!isObj(v) || !Array.isArray(v.conditions)) return this.bad('`cure` is not { of, conditions }.');
    this.line(`Adds ${conds(v.conditions)} to what the holder's pool of healing ${shown(v.of)} can remove, at that pool's own cost. ${featureNote(v.of)}`, 1);
  },
  freeCast(v, at) { this.freeCastLines(v, at); },
  conditionImmune(v) {
    if (!Array.isArray(v) || !v.length || !v.every((c) => CONDITIONS.includes(c))) return this.bad('`conditionImmune` is not a list of conditions.');
    this.line(`Immune to ${conds(v)}: the engine never gives the holder ${v.length > 1 ? 'any of them' : 'that condition'}.`, 1);
  },
  metamagic(v, at) {
    if (!isObj(v)) return this.bad(`${at} is not { id, cost, pool }.`);
    if (isInt(v.cost)) this.num(`${at}.cost`, v.cost, 'points'); else this.bad(`${at}.cost is not a whole number.`);
    this.line(`Teaches the holder the Metamagic option ${shown(v.id)}: a spell may carry it for ${isInt(v.cost) ? v.cost : '?'} point${v.cost === 1 ? '' : 's'} of the pool ${shown(v.pool)}.`, 1);
  },
  metamagicMax(v, at) {
    if (!isObj(v) || !isInt(v.n)) return this.bad(`${at} is not { n, while }.`);
    this.num(`${at}.n`, v.n, 'options');
    this.line(`A spell may carry up to ${v.n} Metamagic options while the holder's feature ${shown(v.while)} has its effect going.`, 1);
  },
  exchange(v, at) {
    if (!isObj(v) || !isObj(v.costs) || !isObj(v.minLevel)) return this.bad(`${at} is not { costs, minLevel }.`);
    for (const [l, x] of Object.entries(v.costs)) if (isInt(x)) this.num(`${at}.costs.${l}`, x, 'points');
    for (const [l, x] of Object.entries(v.minLevel)) if (isInt(x)) this.num(`${at}.minLevel.${l}`, x, 'class level');
    this.line(`Lets the holder trade the feature's points for spell slots and the other way round. A slot of level ${list(Object.keys(v.costs).slice(0, 9))} costs ${list(Object.values(v.costs).slice(0, 9).map(String))} points, and it can be made from the class level ${list(Object.values(v.minLevel).slice(0, 9).map(String))}.`, 1);
  },
  restore(v, at) {
    if (!isObj(v)) return this.bad(`${at} is not { of, max }.`);
    amountNums(this, v.max, `${at}.max`, 'points');
    this.line(`On a Short Rest, for one use of this feature, the pool ${shown(v.of)} gets back up to ${amountWord(v.max)} points. ${featureNote(v.of)}`, 1);
  },
  action(v, at) { this.actionLines(v, at); },
  reaction(v, at) {
    if (!isObj(v)) return this.bad(`${at} is not a reaction.`);
    const dm = (x) => this.dm(x);
    if (v.on === 'saveFailed') {
      if (isInt(v.range)) this.num(`${at}.range`, v.range, 'feet');
      return this.line(`A Reaction, taken by a standing instruction: when the holder or an ally within ${isInt(v.range) ? v.range : '?'} feet fails a saving throw against an effect that would apply ${conds(v.conditions)}, the save is rolled again with Advantage.`, 1);
    }
    if (v.on === 'damaged' && v.resist === true) return this.line('A Reaction, taken by a standing instruction: when the holder takes damage, it gains Resistance to that type of damage to the end of the turn.', 1);
    if (v.on === 'damaged') {
      if (isInt(v.within)) this.num(`${at}.within`, v.within, 'feet');
      return this.line(`A Reaction, taken by a standing instruction: when a hostile creature within ${isInt(v.within) ? v.within : '?'} feet damages the holder, the holder makes one melee attack against it.`, 1);
    }
    if (v.on !== 'hit') { dm(`The reaction at ${at}.`); return this.bad(`${at}: a reaction is set off by a hit, a failed save or damage.`); }
    let cut = 'half';
    if (v.cut !== 'half') {
      if (isObj(v.cut) && isDice(v.cut.dice)) { this.num(`${at}.cut.dice`, v.cut.dice, 'dice'); cut = `${v.cut.dice}${Array.isArray(v.cut.add) && v.cut.add.length ? ' plus an amount that grows with the class' : ''}`; if (Array.isArray(v.cut.add)) v.cut.add.forEach((x, j) => amountNums(this, x, `${at}.cut.add.${j}`, 'amount')); } else this.bad(`${at}.cut is not "half" or { dice, add }.`);
    }
    this.line(`A Reaction, taken by a standing instruction: when an attack roll hits the holder${v.seen === true ? ' and the holder can see the attacker' : ''}${Array.isArray(v.types) && v.types.length ? `, if it deals ${list(v.types.filter((t) => DAMAGE_TYPES.includes(t)), 'or')} damage` : ''}, the damage is cut by ${cut === 'half' ? 'half' : cut}.`, 1);
  },
  ac(v, at) {
    if (!isObj(v) || !isInt(v.base)) return this.bad(`${at} is not { base, abilities, shield }.`);
    this.num(`${at}.base`, v.base, 'Armor Class');
    this.line(`While wearing no armor${v.shield === true ? '' : ' and holding no Shield'}, Armor Class is ${v.base} plus the ${abilList(v.abilities, 'and')} modifier${Array.isArray(v.abilities) && v.abilities.length > 1 ? 's' : ''}, if that is more than the plain 10 plus Dexterity.`, 1);
  },
  armouredAc(v, at) { if (!isInt(v)) return this.bad(`${at} is not a whole number.`); this.num(at, v, 'Armor Class'); this.line(`+${v} Armor Class while the holder wears armor.`, 1); },
  speed(v, at) {
    if (!isObj(v)) return this.bad(`${at} is not { add, unless }.`);
    amountNums(this, v.add, `${at}.add`, 'feet');
    this.line(`${amountWord(v.add)} feet added to the holder's Speed${v.unless === 'heavy' ? ', except in heavy armor' : v.unless === 'armour' ? ', except in any armor' : ''}.`, 1);
  },
  speeds(v, at) {
    if (Array.isArray(v)) {
      this.line(`A ${list(v.filter((m) => ['climb', 'swim'].includes(m)))} speed equal to the holder's Speed.`, 1);
      if (v.includes('swim')) { this.line('The engine does not move a creature by a swim speed: it stays on the sheet, and the DM lets it swim by hand.', 2); this.dm('Moving the holder by its swim speed.'); }
      return;
    }
    if (!isObj(v)) return this.bad(`${at} is not a list or a table of speeds.`);
    const ok = Object.entries(v).filter(([m, x]) => ['climb', 'swim', 'fly'].includes(m) && isInt(x));
    for (const [m, x] of ok) this.num(`${at}.${m}`, x, 'feet');
    this.line(`Speeds: ${list(ok.map(([m, x]) => `${m} ${x} feet`))}, each at least that, never less than the holder already has.`, 1);
    if (ok.some(([m]) => m === 'swim')) { this.line('The engine does not move a creature by a swim speed: it stays on the sheet, and the DM lets it swim by hand.', 2); this.dm('Moving the holder by its swim speed.'); }
  },
  senses(v, at) {
    if (!isObj(v)) return this.bad(`${at} is not a table of senses.`);
    const ok = Object.entries(v).filter(([k, x]) => Object.hasOwn(SENSE_WORDS, k) && isInt(x));
    for (const [k, x] of ok) this.num(`${at}.${k}`, x, 'feet');
    this.line(`Senses: ${list(ok.map(([k, x]) => `${k} ${x} feet`))}; a sense the holder already has at a longer range stays as it is.`, 1);
  },
  saves(v, at) {
    if (v === 'all') return this.line('Proficiency in every saving throw.', 1);
    if (!Array.isArray(v)) return this.bad(`${at} is not "all" or a list of abilities.`);
    this.line(`Proficiency in ${abilList(v, 'and')} saving throws.`, 1);
  },
  extraAttack(v, at) { if (!isInt(v)) return this.bad(`${at} is not a whole number.`); this.num(at, v, 'attacks'); this.line(`${v} more attack${v === 1 ? '' : 's'} when the holder takes the Attack action (the most of any feature, not the sum).`, 1); },
  sneak(v, at) { amountNums(this, v, at, 'dice'); this.line(`Sneak Attack damage of ${amountWord(v)}d6.`, 1); },
  rangedAttack(v, at) { if (!isInt(v)) return this.bad(`${at} is not a whole number.`); this.num(at, v, 'to hit'); this.line(`+${v} to the holder's attack rolls with ranged weapons (not thrown ones).`, 1); },
  spells(v, at) {
    if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) return this.bad(`${at} is not a list of spell ids.`);
    this.line(`Names ${list(v.slice(0, 30).map((x) => nameOf('spells', x)))} among the spells a class always has prepared. A feat or an item belongs to no class, so the engine adds nothing from it.`, 1);
    this.dm(`Letting the holder cast ${list(v.slice(0, 30).map((x) => nameOf('spells', x)))}: the engine does not add them.`);
  },
  martialArts(v, at) { amountNums(this, v, at, 'die'); this.line(`A martial arts die of ${amountWord(v)} for unarmed strikes while the holder wears no armor and holds no Shield.`, 1); },
  hp(v, at) { amountNums(this, v, at, 'Hit Points'); this.line(`${amountWord(v)} Hit Points added to the holder's maximum.`, 1); },
  bonusActs(v) {
    if (!Array.isArray(v) || !v.length || !v.every((x) => BONUS_ACTS.includes(x))) return this.bad('`bonusActs` is not a list of dash, disengage and hide.');
    this.line(`The holder may ${list(v, 'or')} as a Bonus Action.`, 1);
  },
  expertise(v, at) { if (!isInt(v)) return this.bad(`${at} is not a whole number.`); this.num(at, v, 'skills'); this.line(`Expertise in ${v} more skill${v === 1 ? '' : 's'} the holder is already proficient in, chosen on its sheet.`, 1); },
  skills(v, at) {
    if (!isObj(v) || !isInt(v.n)) return this.bad(`${at} is not { n, from }.`);
    this.num(`${at}.n`, v.n, 'skills');
    this.line(`${v.n} more skill${v.n === 1 ? '' : 's'}, chosen on the holder's sheet from ${v.from === 'any' ? 'any skill' : 'its class\'s list'}.`, 1);
  },
  abilityBonus(v, at) {
    if (!isObj(v)) return this.bad(`${at} is not a table of ability bonuses.`);
    const ok = Object.entries(v).filter(([k, x]) => (ABILITIES.includes(k) || k === 'max') && isInt(x));
    for (const [k, x] of ok) this.num(`${at}.${k}`, x, k === 'max' ? 'score' : 'points');
    const gains = ok.filter(([k]) => k !== 'max');
    this.line(`${list(gains.map(([k, x]) => `${signed(x)} ${ABILITY_WORDS[k]}`))}, ${isInt(v.max) ? `up to a score of ${v.max}` : 'up to 30'}; a score already higher is left as it is.`, 1);
  },
  cantrips(v, at) {
    if (!isInt(v)) return this.bad(`${at} is not a whole number.`);
    this.num(at, v, 'cantrips');
    this.line(`${v} more cantrip${v === 1 ? '' : 's'} known by a class that knows cantrips. A feat or an item belongs to no class, so the engine adds none.`, 1);
    this.dm('Giving the holder the extra cantrips: the engine does not add them.');
  },
  proficiency(v) {
    if (!isObj(v)) return this.bad('`proficiency` is not { weapons, armour }.');
    const bits = [];
    if (Array.isArray(v.weapons) && v.weapons.length) bits.push('martial weapons');
    if (Array.isArray(v.armour) && v.armour.length) bits.push(`${list(v.armour.filter((c) => ARMOUR_CATEGORIES.includes(c)))} armor`);
    this.line(`Training with ${list(bits) || 'nothing the reader can read'}.`, 1);
  },
  recover(v, at) {
    if (!isObj(v) || !isInt(v.max)) return this.bad(`${at} is not { levels, max }.`);
    this.num(`${at}.max`, v.max, 'levels');
    this.line(`On a Short Rest, the holder gets back spell slots whose levels add up to half its class level, rounded up, none above level ${v.max}.`, 1);
  },
  resist(v) {
    if (!Array.isArray(v) || !v.every((t) => DAMAGE_TYPES.includes(t))) return this.bad('`resist` is not a list of damage types.');
    this.line(`Resistance to ${list(v)} damage: such damage is halved.`, 1);
  },
  critOn(v, at) { if (!isInt(v)) return this.bad(`${at} is not a whole number.`); this.num(at, v, 'd20 roll'); this.line(`The holder's attack rolls are Critical Hits on a roll of ${v} or more.`, 1); },
  spellLists(v) { this.line(`Opens the spell list${Array.isArray(v) && v.length > 1 ? 's' : ''} of ${list((Array.isArray(v) ? v : []).slice(0, 20).map(shown))} to a class's spell picks. A feat or an item belongs to no class, so the engine adds nothing.`, 1); this.dm('Opening those spell lists: the engine does not.'); },
  setAbility(v, at) {
    if (!isObj(v)) return this.bad(`${at} is not a table of scores.`);
    const ok = Object.entries(v).filter(([k, x]) => ABILITIES.includes(k) && isInt(x));
    for (const [k, x] of ok) this.num(`${at}.${k}`, x, 'score');
    this.line(`${list(ok.map(([k, x]) => `${ABILITY_WORDS[k]} becomes ${x}`))}, unless it is already as high.`, 1);
  },
  bareAc(v, at) { if (!isInt(v)) return this.bad(`${at} is not a whole number.`); this.num(at, v, 'Armor Class'); this.line(`+${v} Armor Class while the holder wears no armor and holds no Shield.`, 1); },
  senseRange(v, at) {
    if (!isObj(v)) return this.bad(`${at} is not a table of senses.`);
    const ok = Object.entries(v).filter(([k, x]) => Object.hasOwn(SENSE_WORDS, k) && isInt(x));
    for (const [k, x] of ok) this.num(`${at}.${k}`, x, 'feet');
    this.line(`${cap1(list(ok.map(([k, x]) => `${k}: ${x} feet`)))} added to the range of the holder's own sense of that kind, or the whole range of it for a holder who has none.`, 1);
  },
  moveWith(v) { this.line(`When the holder starts the effect of the feature ${shown(v?.of)} with its action, it also gets up to half its Speed of movement that turn. ${featureNote(v?.of)}`, 1); },
  brutal(v, at) {
    if (!isObj(v) || !Array.isArray(v.options)) return this.bad(`${at} is not { after, dice, options }.`);
    if (v.dice !== undefined) { if (isDice(v.dice)) this.num(`${at}.dice`, v.dice, 'dice'); else this.bad(`${at}.dice is not dice.`); }
    deepNums(this, v.options, `${at}.options`, 'amount');
    const names = v.options.filter(isObj).map((o) => (typeof o.name === 'string' && o.name.trim() ? qt(o.name, 40) : 'an unnamed option'));
    this.line(`Gives a hit one more effect: ${v.after !== undefined ? `once a turn, after the feature ${shown(v.after)} was used that turn, the holder may give up Advantage on one Strength attack roll; on a hit it deals ${isDice(v.dice) ? v.dice : '(unreadable dice)'} more damage of the attack's type and` : 'the holder may add to the options of its Brutal Strike:'} one of ${list(names, 'or')} happens to the target. The engine runs it only for a holder who has that feature.`, 1);
  },
  relentless(v, at) {
    if (!isObj(v) || !isInt(v.dc) || !isInt(v.step)) return this.bad(`${at} is not { while, dc, step, hp }.`);
    this.num(`${at}.dc`, v.dc, 'DC'); this.num(`${at}.step`, v.step, 'DC');
    amountNums(this, v.hp, `${at}.hp`, 'Hit Points');
    this.line(`When the holder would drop to 0 Hit Points without dying outright, while its feature ${shown(v.while)} has its effect going, it makes a Constitution saving throw against DC ${v.dc}, ${v.step} more for each earlier use since its last rest. On a success it is left with ${amountWord(v.hp)} Hit Points instead. ${featureNote(v.while)}`, 1);
  },
  initiative(v, at) {
    if (!isObj(v)) return this.bad(`${at} is not { regain }.`);
    if (isInt(v.upTo)) this.num(`${at}.upTo`, v.upTo, 'uses');
    if (v.heal !== undefined) amountNums(this, v.heal, `${at}.heal`, 'Hit Points');
    this.line(`When the holder rolls Initiative, the feature ${shown(v.regain)} gets back ${isInt(v.upTo) ? `uses up to ${v.upTo}` : 'all its uses'}${v.heal !== undefined ? ` and the holder regains ${amountWord(v.heal)} Hit Points${v.addLevel === true ? ' plus its class level' : ''}` : ''}. ${featureNote(v.regain)}`, 1);
  },
  persist(v) { this.line(`The lasting effect of the feature ${shown(v?.of)} lasts its whole time without being renewed, and ends early only when the holder is Unconscious. ${featureNote(v?.of)}`, 1); },
  reroll(v, at) {
    if (!isObj(v)) return this.bad(`${at} is not { cost }.`);
    if (v.add !== undefined) amountNums(this, v.add, `${at}.add`, 'bonus');
    this.line(`When the holder fails a saving throw it may roll it again${v.add !== undefined ? `, adding ${amountWord(v.add)}` : ''}, for one use of the feature ${shown(v.cost)}, and must keep the new roll. ${featureNote(v.cost)}`, 1);
  },
  missed(v) { this.line(`When the holder misses with an attack roll, it gets a modifier against that target only, until the ${isObj(v) && isObj(v.ends) && v.ends.on === 'turnStart' ? 'start' : 'end'} of its next turn: ${isObj(v) && isObj(v.modifier) && HOOKS.includes(v.modifier.on) && OPS.includes(v.modifier.op) ? modPhrase.call(this, v.modifier, 'grants.missed.modifier') : 'a change the reader cannot read'}.`, 1); },
  evasion() { this.line('A Dexterity save for half damage does no damage on a success and half on a failure, while the holder is not Incapacitated.', 1); },
  surfaces() { this.line('While the holder wears no armor and holds no Shield, it moves across water without falling in, and may not stop there. Vertical surfaces are the DM\'s.', 1); this.dm('Letting the holder run up a vertical surface.'); },
  selfCure(v) { this.line(`At the end of each of the holder's turns, one of ${conds(isObj(v) ? v.conditions : [])} it has ends (the first of the list).`, 1); },
  allTypes(v) { this.line(`The Reaction of the feature ${shown(v?.of)} is taken against an attack of any damage type. ${featureNote(v?.of)}`, 1); },
  fleet(v) { this.line(`After a Bonus Action that is not the feature ${shown(v?.of)}, the holder may use that feature without spending a Bonus Action, once a turn. ${featureNote(v?.of)}`, 1); },
  cunning(v, at) {
    if (!isObj(v)) return this.bad(`${at} is not { max, options }.`);
    if (isInt(v.max)) this.num(`${at}.max`, v.max, 'effects');
    this.line(`Changes Cunning Strike: when the holder's Sneak Attack deals damage it may give up Sneak Attack dice for effects${isInt(v.max) ? `, up to ${v.max} at once` : ''}${Array.isArray(v.options) ? `; it adds ${v.options.length} option${v.options.length === 1 ? '' : 's'} listed in the entry` : ''}. The engine runs it only for a holder who has Sneak Attack.`, 1);
    if (Array.isArray(v.options)) v.options.forEach((o, j) => { if (isObj(o)) { if (isInt(o.cost)) this.num(`${at}.options.${j}.cost`, o.cost, 'dice'); if (o.duration !== undefined && /\d/.test(String(o.duration))) this.num(`${at}.options.${j}.duration`, o.duration, 'duration'); if (Array.isArray(o.effects)) deepNums(this, o.effects, `${at}.options.${j}.effects`, 'amount'); } });
  },
  attune(v, at) {
    if (!isInt(v)) return this.bad(`${at} is not a whole number.`);
    this.num(at, v, 'items');
    this.line(`Raises the number of magic items the holder may be attuned to to ${v}. Only a class feature does this in the engine: a feat or an item changes nothing.`, 1);
    this.dm(`Letting the holder attune to ${v} items.`);
  },
  empowered(v) { this.line(`A spell of the ${isObj(v) ? shown(v.school) : '?'} school on the ${isObj(v) ? shown(v.list) : '?'} list adds the holder's ${isObj(v) ? ABILITY_WORDS[v.ability] ?? 'unreadable' : '?'} modifier to one of its damage rolls, the caster's pick.`, 1); },
  overchannel(v, at) {
    if (!isObj(v)) return this.bad(`${at} is not { list, maxSlot, die }.`);
    this.num(`${at}.maxSlot`, v.maxSlot, 'slot level'); this.num(`${at}.die`, v.die, 'die');
    this.line(`A damaging spell on the ${shown(v.list)} list, cast with a slot up to level ${v.maxSlot}, may deal its dice at their highest. From the second use before a Long Rest the holder takes d${v.die}s of Necrotic damage for each slot level, one more each time.`, 1);
  },
  afterHit(v) { this.line(`A creature that hits the holder with an attack roll gets ${isObj(v) && isObj(v.modifier) && HOOKS.includes(v.modifier.on) && OPS.includes(v.modifier.op) ? modPhrase.call(this, v.modifier, 'grants.afterHit.modifier') : 'a change the reader cannot read'} against the holder, to the end of the current turn.`, 1); },
  markSpread(v, at) {
    if (!isObj(v)) return this.bad(`${at} is not { spell, range }.`);
    this.num(`${at}.range`, v.range, 'feet');
    this.line(`Once a turn, when the holder's attack damages a creature marked by ${nameOf('spells', v.spell)}, it may deal the mark's extra damage to another creature it can see within ${v.range} feet of the first.`, 1);
  },
  steadfast(v) { this.line(`Taking damage does not make the holder save to keep Concentration on ${nameOf('spells', v?.spell)}.`, 1); },
  restExhaustion() { this.line('Each Short Rest the holder finishes lowers its Exhaustion by 1.', 1); },
  spellRange(v, at) {
    if (!isObj(v)) return this.bad(`${at} is not { spell, perLevel }.`);
    this.num(`${at}.perLevel`, v.perLevel, 'feet');
    this.line(`The range of ${nameOf('spells', v.spell)} is longer by ${v.perLevel} feet for each class level.`, 1);
  },
  repel(v, at) {
    if (!isObj(v)) return this.bad(`${at} is not { spell, feet }.`);
    this.num(`${at}.feet`, v.feet, 'feet');
    this.line(`A Large or smaller creature that ${nameOf('spells', v.spell)} hits with an attack roll may be pushed up to ${v.feet} feet straight away.`, 1);
  },
};

class GrantReading extends Reading {
  constructor(def, problems) {
    super(def, problems);
    this.hasUse = false;
  }
  // The `grants` of an entry: each key in the order of GRANTS.
  fGrants() {
    const g = this.def.grants;
    if (g === undefined) return;
    if (!isObj(g)) return this.bad('`grants` is not an object.');
    this.odd(g, GRANTS, 'What it grants');
    const keys = GRANTS.filter((k) => Object.hasOwn(g, k));
    if (!keys.length) return this.bad('`grants` holds nothing.');
    this.line(this.kind === 'item' ? 'While it is active, the holder gets what follows (the engine makes these a feature of the holder, as for a feat).' : 'The feat gives its holder what follows (the engine makes these a feature of the holder).');
    for (const k of keys) {
      if (this.kind === 'item' && ITEM_NO_GRANTS.includes(k)) { this.bad(`An item does not grant "${k}": it is a class's own.`); this.line(`It holds "${k}", which an item cannot give. The engine does not apply it.`, 1); continue; }
      GRANT_WORDS[k].call(this, g[k], `grants.${k}`);
    }
  }
  // A modifier a grant gives.
  grantMod(m, at, depth = 1) {
    if (!isObj(m)) { this.bad(`${at} is not a modifier.`); return this.line('(A modifier the reader cannot read.)', depth); }
    this.odd(m, MOD_KEYS, `The modifier at ${at}`);
    this.inTrait = true;
    try {
      const phrase = modPhrase.call(this, m, at);
      this.line(`${cap1(phrase)}.`, depth);
      const extra = modExtras.call(this, m, at, false);
      if (extra) this.line(extra, depth + 1);
    } finally { this.inTrait = false; }
    if (this.kind === 'item' && m.on === 'ac' && m.op === 'add' && typeof m.value === 'number' && m.when === undefined && m.types === undefined) this.line('A flat bonus like this is put straight into the Armor Class shown on the sheet.', depth + 1);
    if (TRAIT_DEAD_HOOKS.includes(m.on)) {
      this.line(`The engine never reads ${HOOK_WORDS[m.on]} from a feature, so this changes nothing.`, depth + 1);
      this.dm(`The modifier at ${at}: the engine does not read this hook from a feature.`);
    }
  }
  // `freeCast`: cast spells through the feature (engine/casting.js, castSpell with `via`).
  freeCastLines(v, at) {
    if (!isObj(v)) return this.bad(`${at} is not a freeCast.`);
    this.odd(v, Object.keys(FREECAST_WORDS), 'The freeCast');
    const named = Array.isArray(v.spells), byList = typeof v.list === 'string';
    if (!named && !byList) return this.bad(`${at} names neither a list of spells nor a spell list with a highest level.`);
    if (named && byList) this.bad(`${at} names both a spell list and spells.`);
    if (isInt(v.maxLevel)) this.num(`${at}.maxLevel`, v.maxLevel, 'spell level'); else if (byList) this.bad(`${at}.maxLevel is not a spell level.`);
    this.line(`Lets the holder cast spells without a slot, through this ${this.kind}, with the cast action naming it (a "via" cast). The save DC and attack bonus are the holder's own spellcasting ones; a holder with no spellcasting uses a modifier of 0.`, 1);
    const asAction = byList || v.time === 'action';
    for (const k of Object.keys(FREECAST_WORDS)) {
      if (v[k] === undefined) continue;
      if (k === 'maxLevel') continue;                                            // said with the list
      if (k === 'list') { this.line(FREECAST_WORDS.list(v.list, v), 2); continue; }
      if (k === 'spells') { this.line(FREECAST_WORDS.spells(v.spells), 2); continue; }
      if (k === 'cost') { if (isObj(v.cost)) { this.odd(v.cost, FREECAST_COST_FIELDS, 'The freeCast cost'); this.line(FREECAST_WORDS.cost(v.cost), 2); } else this.bad(`${at}.cost is not { slot, uses }.`); continue; }
      if (k === 'forms' || k === 'types' || k === 'ends') { if (!Array.isArray(v[k])) this.bad(`${at}.${k} is not a list.`); else this.line(FREECAST_WORDS[k](v[k]), 2); continue; }
      this.line(FREECAST_WORDS[k](v[k]), 2);
    }
    if (named && !asAction) this.line('A spell that takes longer than a turn to cast cannot be cast in a fight, and a Reaction spell is cast only by the holder\'s standing instruction for it.', 2);
    if (v.cost !== undefined && v.atWill !== undefined) this.bad(`${at}: cost and atWill are two answers to what the cast spends.`);
    if (v.cost === undefined && v.atWill === undefined) {
      if (this.kind === 'feat') {
        this.line('Each cast spends one use of the feat itself. A feat has no uses of its own, so the engine finds none left: every cast is refused ("no uses of it left"). Only the spell pick of Magic Initiate gives its feat a use.', 2);
        this.bad(`${at}: with neither atWill nor a cost, a feat's freeCast can never be cast.`);
        this.dm('Letting the holder cast through this feat: the engine refuses every cast.');
      } else this.line('Each cast spends one use of the feature itself.', 2);
    }
  }
  // `action`: a use the feature gives (engine/features.js, `feature`).
  actionLines(v, at) {
    if (!isObj(v)) return this.bad(`${at} is not an action.`);
    this.odd(v, ['time', 'target', 'effects', 'duration', 'cost', 'renew', 'noSpells', 'gain', 'pool', 'firstAttack', 'unless', 'endsWhenIncapacitated', 'cure', 'modes', 'form', 'orCost', 'acts', 'after', 'orSlot'], 'The action');
    if (!ACTION_TIMES.includes(v.time)) this.bad(`${at}.time is not one the engine knows.`);
    this.line(`Gives the holder an action to use with the feature action. It takes ${ACTION_TIME_WORDS[v.time] ?? 'an unreadable time'}${v.time === 'reaction' ? '; the engine does not take Reactions from features, so using it is refused and the DM applies it' : ''}.`, 1);
    if (isObj(v.cost)) { if (isInt(v.cost.n)) this.num(`${at}.cost.n`, v.cost.n, 'uses'); this.line(`It spends ${isInt(v.cost.n) ? v.cost.n : 1} use${v.cost.n > 1 ? 's' : ''} of the holder's feature ${shown(v.cost.resource)}. ${featureNote(v.cost.resource)}`, 2); }
    if (v.duration !== undefined) { if (isDuration(v.duration)) { this.line(`What it does lasts ${v.duration === 'instant' ? 'no time' : `up to ${v.duration}`}.`, 2); if (/^\d/.test(v.duration)) this.num(`${at}.duration`, v.duration, 'duration'); } else this.bad(`${at}.duration is not a duration.`); }
    for (const k of ['form', 'gain', 'pool', 'modes', 'orCost', 'acts', 'after', 'orSlot', 'cure', 'unless', 'renew', 'noSpells', 'firstAttack', 'endsWhenIncapacitated']) if (v[k] !== undefined) deepNums(this, v[k], `${at}.${k}`, 'amount');
    if (v.form !== undefined) this.line('It lets the holder take the shape of a creature of the pack, as the entry limits it.', 2);
    if (v.gain !== undefined) this.line('It gives the holder an extra action, or extra attacks, as the entry says.', 2);
    if (v.pool === true) this.line('It spends points from a pool of healing on a creature.', 2);
    if (Array.isArray(v.modes)) this.line(`It does one of ${v.modes.length} things, picked when it is used.`, 2);
    if (v.acts !== undefined) this.line('It also takes the actions named in the entry.', 2);
    if (v.after === 'hit') this.line('It follows a hit the holder made this turn, once a turn.', 2);
    const groups = Array.isArray(v.effects) ? [[v.effects, `${at}.effects`]] : Array.isArray(v.modes) ? v.modes.filter(isObj).map((m, j) => [m.effects, `${at}.modes.${j}.effects`]) : [];
    for (const [steps, path] of groups) this.stepsUnder(steps, path, isObj(v.target) && v.target.self ? 'the holder' : 'the target', v.duration, 2);
  }
  // Steps read in the words of an item's use or a feature's action.
  stepsUnder(steps, path, who, duration, depth = 0) {
    if (!Array.isArray(steps)) return;
    const saved = { def: this.def, aim: this.aim, fx: this.fx, lasting: this.lasting, base: this.base, words: this.words };
    this.words = this.kind === 'item' ? { who: 'the user', spell: 'the use', aSpell: 'a use' } : { who: 'the holder', spell: 'the action', aSpell: 'an action' };
    this.def = { effects: steps, range: 0, duration: 'instant', tier: saved.def.tier };
    this.aim = who === 'the holder' ? 'self' : 'creature';
    this.lasting = this.bound(); this.fx = isDuration(duration) && duration !== 'instant' ? 'spell' : this.lasting ? 'bound' : null;
    this.base = depth;
    try { this.steps(steps, path, 0, who, { top: true }); } finally { Object.assign(this, saved); }
  }
  fChecked() { this.line(this.def.checked === true ? 'Marked as checked against the rules text.' : 'Not checked against any rulebook.'); }
  fTier() {
    const t = this.def.tier;
    if (!TIERS.includes(t)) return this.bad('The tier is not auto, assist or manual.');
    const words = this.kind === 'item' ? ITEM_TIER_WORDS : FEAT_TIER_WORDS;
    this.tierSentence(t, words);
    if (t !== 'auto') {
      this.line(`The author's description is shown beside this reading; whatever it says beyond the lines above, the DM applies.`);
      this.dm('Whatever the description says beyond the lines above.');
    }
  }
  run() {
    const order = Object.entries(this.fields).filter(([, how]) => how !== 'skip' && how !== 'header').map(([, how]) => how);
    for (const how of order) this[how]();
  }
}

class ItemReading extends GrantReading {
  constructor(def, problems) { super(def, problems); this.kind = 'item'; this.itm = true; this.fields = ITEM_FIELDS; }
  item() {
    const d = this.def;
    this.odd(d, Object.keys(ITEM_FIELDS), 'The item');
    const cat = ITEM_CATEGORY_WORDS[d.category], rar = RARITY_WORDS[d.rarity];
    if (!cat) this.bad('The item\'s category is not one the engine knows.');
    if (!rar) this.bad('The item\'s rarity is not one the engine knows.');
    this.line(`${this.titleQ()} (${rar ?? 'unreadable rarity'} ${cat ?? 'item of an unreadable category'}).`);
    this.run();
    this.dawnText();
  }
  fWear() {
    const w = this.def.wear;
    if (!WEAR.includes(w)) return this.bad('The item\'s `wear` is not one the engine knows.');
    if (w === 'carried') return this.line('It works from the holder\'s person: it need not be put on or held.');
    this.line(`It is ${WEAR_WORDS[w]}. It works only while the holder's sheet marks it as equipped, and gives nothing before.${WEAR_ONE.includes(w) ? ' A sheet that wears two for that place is refused.' : ''}${w === 'orbit' ? ' Up to 3 can orbit a head at once.' : ''}`);
  }
  fAttune() {
    const a = this.def.attune;
    if (a === undefined) return this.line('It needs no attunement: it works as soon as it is worn, held or carried as above.');
    let who = 'any creature';
    if (isObj(a)) {
      this.odd(a, ATTUNE_FIELDS, 'The attunement');
      if (Array.isArray(a.by)) who = `only a ${list(a.by.slice(0, 20).map((c) => (typeof c === 'string' && ID.test(c) ? CONTENT.classes?.[c]?.name ?? shown(c) : 'an unreadable class')), 'or')}`;
      else if (a.spellcaster === true) who = 'only a spellcaster';
      else this.bad('The attunement is not `by` classes or `spellcaster`.');
    } else if (a !== true) this.bad('`attune` is true, { by } or { spellcaster }.');
    this.line(`It needs attunement: ${who} can attune to it. The holder asks for it, never in a fight, and it is done on its next Short Rest; ending it works the same way. A creature is attuned to three items at most, and to one copy of an item. Until the holder is attuned it works as the plain base item at most: no bonus and nothing from its grants.`);
  }
  fBase() {
    const b = this.def.base;
    if (b === undefined) return;
    if (!isObj(b)) return this.bad('`base` is not { weapon } or { armour }.');
    this.odd(b, BASE_FIELDS, 'The base');
    const what = (v, lookup) => (v === 'any' ? 'any one the sheet picks' : v === 'melee' ? 'any melee weapon the sheet picks' : Array.isArray(v) ? list(v.slice(0, 40).map((x) => nameOf(lookup, x)), 'or') : 'something unreadable');
    if (b.weapon !== undefined) this.line(`It is a weapon made from ${what(b.weapon, 'weapons')}, and the sheet says which. It attacks as that weapon does; a holder not proficient with it attacks without the Proficiency Bonus.`);
    if (b.armour !== undefined) this.line(`It is armor made from ${what(b.armour, 'armour')}, and the sheet says which. The holder must be trained in that kind of armor to wear it, or the sheet is refused${this.def.trained === true ? ' (this item says it is worn as if trained)' : ''}.`);
  }
  fBonus() {
    const n = this.def.bonus;
    if (n === undefined) return;
    if (!isInt(n)) return this.bad('`bonus` is not a whole number.');
    this.num('bonus', n, 'bonus');
    if (isObj(this.def.base) && this.def.base.weapon !== undefined) this.line(`+${n} to attack rolls and to damage rolls with it, while it is active.`);
    else if (isObj(this.def.base) && this.def.base.armour !== undefined || this.def.wear === 'shield') this.line(`+${n} Armor Class, while it is active, on top of what the armor or Shield gives.`);
    else this.bad('A bonus goes with a weapon, armor or a Shield.');
  }
  fDamageType() {
    const t = this.def.damageType;
    if (t === undefined) return;
    if (!DAMAGE_TYPES.includes(t)) return this.bad('The damage type is not one the engine knows.');
    this.line(`Its damage is ${t} damage, in place of the weapon's own type, while it is active.`);
  }
  fProperties() {
    const p = this.def.properties;
    if (p === undefined) return;
    if (!Array.isArray(p) || !p.every((x) => WEAPON_PROPERTIES.includes(x))) return this.bad('`properties` is not a list of weapon properties.');
    this.line(`It has the weapon properties ${list(p)}, while it is active.`);
  }
  fTrained() {
    if (this.def.trained === undefined) return;
    if (this.def.trained !== true) return this.bad('`trained` is true or left out.');
    this.line('Its wearer counts as trained in the category of its armor while it is worn.');
  }
  fVariant() {
    const v = this.def.variant;
    if (v === undefined) return;
    if (!ITEM_VARIANTS.includes(v)) return this.bad('The variant is not one the engine knows.');
    this.line(ITEM_VARIANT_WORDS[v]);
    if (v === 'spell' && !(Array.isArray(this.def.activate) && this.def.activate.length)) this.bad('A scroll has no use to read it with.');
  }
  fCharges() {
    const c = this.def.charges;
    if (c === undefined) return;
    if (!isObj(c) || !isInt(c.max)) return this.bad('`charges` is not { max, regain }.');
    this.odd(c, CHARGES_FIELDS, 'The charges');
    this.num('charges.max', c.max, 'charges');
    this.line(`It holds up to ${c.max} charges, and starts full.`);
    if (c.regain !== undefined) {
      if (!isDice(c.regain)) this.bad('`charges.regain` is not dice.'); else this.num('charges.regain', c.regain, 'dice');
      this.line(`At dawn (6 in the morning) the engine rolls ${isDice(c.regain) ? c.regain : '(unreadable dice)'} for each dawn that has passed and adds it back, up to ${c.max}. That happens when a rest or the DM moves the clock past dawn, to an item that has been used; the clock moving round by round in a fight is not watched.`);
    } else { this.line('No charge comes back by itself: the engine never restores them.'); this.dm('Giving charges back to it.'); }
    this.line('When a use spends its last charge the engine tells the DM; what that does (an item may crumble or not) is the DM\'s.');
    this.dm('What happens when its last charge is spent.');
  }
  // The engine reads a sentence of the author's own text here: at dawn it tells the DM of an item whose text says so (engine/rests.js, dawn).
  dawnText() {
    const t = this.def.text;
    if (typeof t === 'string' && /once a dawn|until the next dawn/i.test(t) && !this.def.charges) {
      this.line('Its description speaks of a use "once a dawn" or "until the next dawn". The engine does not count such uses: each dawn it only tells the DM to restore them.');
      this.dm('Restoring its uses each dawn.');
    }
  }
  fActivate() {
    const us = this.def.activate;
    if (us === undefined) return this.line('It has nothing to use: its magic works while it is active.');
    if (!Array.isArray(us) || !us.length) return this.bad('`activate` is not a list of uses.');
    us.forEach((u, i) => this.use(u, i));
  }
  // One use (engine/features.js, planItem, useItem, itemSpell).
  use(u, i) {
    const at = `activate.${i}`, d = this.def;
    if (!isObj(u)) { this.bad(`${at} is not a use.`); return this.line('(A use the reader cannot read.)'); }
    this.odd(u, Object.keys(ACTIVATE_FIELDS), `Use ${i + 1}`);
    const label = typeof u.name === 'string' && u.name.trim() ? qt(u.name, 60) : d.variant === 'spell' ? '"Read"' : u.spell ? '"Cast"' : d.category === 'potion' ? '"Drink"' : '"Use"';
    if (!ACTION_TIMES.includes(u.time)) this.bad(`${at}.time is not one the engine knows.`);
    const sp = typeof u.spell === 'string' ? CONTENT.spells[u.spell] : null;
    const scroll = d.variant === 'spell';
    const time = sp ? sp.time : u.time;
    const inFight = time === 'free' || time === 'reaction' ? '' : ` In a fight it is done on the user's own turn and spends ${ACTION_TIME_WORDS[time] ?? 'an action'}${time === 'action' ? ' (a Magic action)' : ''}.`;
    if (scroll) this.line(`Use ${i + 1}, ${label}: reading the scroll. It takes the casting time of the spell the sheet names, not the time the entry names; in a fight that must be a spell cast in a turn, and not a Reaction. The item must be active, and the user up.`);
    else this.line(`Use ${i + 1}, ${label}: takes ${sp ? `the spell's own casting time (${CAST_TIME_WORDS[time] ?? time}), not the time the entry names` : ACTION_TIME_WORDS[time] ?? 'an unreadable time'}.${inFight} The item must be active, and the user up.`);
    if (!sp && u.time === 'reaction') { this.line('The engine does not take a Reaction from an item: using it is refused, and the DM applies it.', 1); this.dm(`Use ${i + 1}: it is a Reaction.`); }
    if (sp && sp.time === 'reaction') { this.line('That spell is cast as a Reaction, which the engine does not do from an item: using it is refused, and the DM applies it.', 1); this.dm(`Use ${i + 1}: the spell is cast as a Reaction.`); }
    // Charges.
    const max = isObj(d.charges) && isInt(d.charges.max) ? d.charges.max : null;
    if (u.cost !== undefined) {
      if (!(isInt(u.cost) && u.cost > 0)) this.bad(`${at}.cost is not a whole number of charges.`);
      else {
        this.num(`${at}.cost`, u.cost, 'charges');
        if (max === null) this.bad(`${at}: it costs charges, but the item has none.`);
        else if (u.cost > max) this.bad(`${at}: it costs ${u.cost} charges, but the item holds ${max}, so it can never be used.`);
        this.line(`It spends ${u.cost} charge${u.cost === 1 ? '' : 's'}, and is refused when fewer are left.`, 1);
      }
    } else if (max !== null) this.line('It spends no charge.', 1);
    if (u.consumed !== undefined) { if (u.consumed === true) this.line('The item is gone from the sheet once it is used.', 1); else this.bad(`${at}.consumed is true or left out.`); }
    // A Spell Scroll: the cast path takes the scroll's own spell; whatever else the use says is not run (engine/features.js, useItem: `if (spell) return itemSpell`).
    if (scroll) {
      this.line(`It casts the scroll's spell with no slot and no Material component; the Verbal and Somatic components stay, so a reader can be countered, and a Verbal one gives a hidden reader away. The save DC and the attack bonus come from the spell's level: ${SCROLL_STATS.map(([n, dc, atk], j) => `DC ${dc} and +${atk} ${j === SCROLL_STATS.length - 1 ? 'at level' : 'up to level'} ${n}`).join('; ')}.`, 1);
      if (u.spell !== undefined || u.level !== undefined || u.upTo !== undefined || u.self !== undefined || u.dc !== undefined || u.effects !== undefined) {
        this.line('Whatever else this use names (a spell, a level, a DC, steps) is never run: reading the scroll casts the spell on the sheet, and nothing more.', 1);
        for (const k of ['level', 'upTo', 'dc']) if (isInt(u[k])) this.num(`${at}.${k}`, u[k], 'ignored');
        if (u.effects !== undefined) deepNums(this, u.effects, `${at}.effects`, 'ignored');
      }
      return;
    }
    // A spell.
    if (u.spell !== undefined) {
      const lvl = isInt(u.level) ? u.level : sp?.level;
      const name = nameOf('spells', u.spell);
      if (isInt(u.level)) this.num(`${at}.level`, u.level, 'spell level');
      this.line(`It casts ${name}${isInt(lvl) ? ` at level ${lvl}` : ''}: no slot and no components${u.self === true ? ', on the user alone' : ''}. ${isInt(u.dc) ? `The save DC is ${u.dc}.` : 'The save DC is the user\'s own spell save DC (a user with no spellcasting: 8 plus the Proficiency Bonus).'} The attack bonus is the user's own (the Proficiency Bonus with no spellcasting). It is cast as at the lowest caster level, through the usual casting rules, so it can be countered.`, 1);
      if (isInt(u.dc)) this.num(`${at}.dc`, u.dc, 'DC');
      if (u.self !== undefined && u.self !== true) this.bad(`${at}.self is true or left out.`);
      if (u.upTo !== undefined) {
        if (isInt(u.upTo)) { this.num(`${at}.upTo`, u.upTo, 'spell level'); this.line(`Each charge more than the use's own raises the level by one, up to level ${u.upTo}.`, 1); } else this.bad(`${at}.upTo is not a spell level.`);
      }
      if (!sp) { this.line('The engine does not know that spell yet (it must come with the pack): until it does, using this is refused.', 1); }
      if (typeof u.dc !== 'number' && u.dc !== undefined) this.bad(`${at}.dc is not a whole number.`);
    }
    // Steps.
    if (u.effects !== undefined) {
      this.hasUse = true;
      if (!Array.isArray(u.effects) || !u.effects.length) return this.bad(`${at}.effects is not a list of steps.`);
      const potion = d.category === 'potion';
      this.line(potion ? 'Its steps run on the user, or on a creature within 5 feet that the user gives it to (a potion may be given). Nothing else can be aimed at.' : 'Its steps run on the user alone: the engine has no way to aim an item\'s steps at anyone else.', 1);
      const saved = { def: this.def };
      const harm = (() => { const o = { def: { effects: u.effects } }; let h = false; const go = (xs, depth) => { if (!Array.isArray(xs) || depth > 24) return; for (const st of xs) { if (!isObj(st)) continue; const k = STEPS.find((x) => x in st); if (k === 'attack' || k === 'save' || k === 'damage' || k === 'fall' || (k === 'condition' && !BENEFICIAL_CONDITIONS.includes(st.condition))) h = true; for (const b of BRANCHES) go(st[b], depth + 1); } }; go(o.def.effects, 0); return h; })();
      void saved;
      if (harm && !potion) { this.line('Some of these steps do harm, and they run on the user: it would hurt the user, not an enemy. The DM should not approve it unless that is meant.', 1); this.bad(`${at}: harmful steps run on the user of the item.`); }
      this.stepsUnder(u.effects, `${at}.effects`, potion ? 'the creature it is used on' : 'the user', 'instant', 1);
    }
    if (u.spell === undefined && u.effects === undefined) this.bad(`${at} casts a spell or has steps.`);
  }
}

class FeatReading extends GrantReading {
  constructor(def, problems) { super(def, problems); this.kind = 'feat'; this.fields = FEAT_FIELDS; }
  feat() {
    const d = this.def;
    this.odd(d, Object.keys(FEAT_FIELDS), 'The feat');
    const cat = FEAT_CATEGORY_WORDS[d.category];
    if (!cat) this.bad('The feat\'s category is not one the engine knows.');
    this.line(`${this.titleQ()} (${cat ?? 'a feat of an unreadable category'}).`);
    this.line('A character takes it in a place for a feat of its kind (an Origin place takes only an Origin feat), and the engine checks that when the sheet is checked.');
    this.run();
  }
  fPrerequisite() {
    const p = this.def.prerequisite;
    if (p === undefined) return this.line('It has no prerequisite.');
    if (!isObj(p)) return this.bad('`prerequisite` is not { level, abilities, feature }.');
    this.odd(p, PREREQUISITE_FIELDS, 'The prerequisite');
    const bits = [];
    if (p.level !== undefined) { if (isInt(p.level)) { this.num('prerequisite.level', p.level, 'level'); bits.push(`a place that comes at level ${p.level} or later`); } else this.bad('`prerequisite.level` is not a whole number.'); }
    if (p.abilities !== undefined) {
      const a = p.abilities;
      if (isObj(a) && isInt(a.min) && Array.isArray(a.any)) { this.odd(a, ANY_ABILITY_FIELDS, 'The ability prerequisite'); this.num('prerequisite.abilities.min', a.min, 'score'); bits.push(`${abilList(a.any)} of ${a.min} or more, counted before this feat adds anything`); } else this.bad('`prerequisite.abilities` is not { any, min }.');
    }
    if (p.feature !== undefined) { if (Object.hasOwn(FEAT_FEATURE_WORDS, p.feature)) bits.push(`${FEAT_FEATURE_WORDS[p.feature]} the character already has`); else this.bad('`prerequisite.feature` is not one the engine knows.'); }
    this.line(`Prerequisite: ${bits.join('; ') || 'none the reader can read'}. A sheet that does not meet it is refused.`);
  }
  fRepeatable() {
    const r = this.def.repeatable;
    if (r === undefined) return this.line('It can be taken only once.');
    if (r === true) return this.line('It can be taken again, as often as the character has places for it.');
    if (r === 'list') return this.line('It can be taken again, but only with another spell list each time.');
    this.bad('`repeatable` is true or "list".');
  }
  fIncrease() {
    const n = this.def.increase;
    if (n === undefined) return;
    if (!isObj(n) || !Array.isArray(n.from) || !isInt(n.points) || !isInt(n.max)) return this.bad('`increase` is not { from, points, max }.');
    this.odd(n, INCREASE_FIELDS, 'The increase');
    this.num('increase.points', n.points, 'points'); this.num('increase.max', n.max, 'score');
    this.line(`Raises ability scores: ${n.points === 2 ? '+2 to one score or +1 to each of two' : '+1 to one score'}, from ${n.from.length === 6 ? 'any ability' : abilList(n.from)}, none above ${n.max}. The player chooses when taking it.`);
  }
  fProficiencies() {
    const p = this.def.proficiencies;
    if (p === undefined) return;
    if (!isObj(p) || !isInt(p.n)) return this.bad('`proficiencies` is not { n }.');
    this.odd(p, PROFICIENCIES_FIELDS, 'The proficiencies');
    this.num('proficiencies.n', p.n, 'proficiencies');
    this.line(`The player picks up to ${p.n} skills or tools the character is not yet proficient in, and the character gains that proficiency.`);
  }
  fSpellPick() {
    const s = this.def.spellPick;
    if (s === undefined) return;
    if (!isObj(s) || !Array.isArray(s.lists) || !isInt(s.cantrips) || !isInt(s.level1)) return this.bad('`spellPick` is not { lists, abilities, cantrips, level1 }.');
    this.odd(s, SPELLPICK_FIELDS, 'The spell pick');
    this.num('spellPick.cantrips', s.cantrips, 'cantrips'); this.num('spellPick.level1', s.level1, 'level 1 spells');
    this.line(`The player picks a spell list (${list(s.lists.slice(0, 20).map((x) => CONTENT.classes?.[x]?.name ?? shown(x)), 'or')}), one of ${abilList(s.abilities)} to cast with, and up to ${s.cantrips} cantrip${s.cantrips === 1 ? '' : 's'} and ${s.level1} level 1 spell${s.level1 === 1 ? '' : 's'} from that list. The holder knows them and casts them with that ability. Each level 1 spell can be cast once before a Long Rest with no slot.`);
    if (!Array.isArray(s.lists) || s.lists.some((x) => typeof x !== 'string')) this.bad('`spellPick.lists` is not a list of class ids.');
  }
}
