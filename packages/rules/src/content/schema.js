// The closed vocabulary of rules content, and the linter that holds content to it.
//
// Content packs are data. What that data is allowed to say is fixed here: the effect steps,
// the hooks a modifier can attach to, the operations, the situation tags. Adding to any of
// these lists is an engine change and needs the spec amended (docs/specs/rules-expansion.md);
// a content pull request cannot do it.
//
//   lintPack({ pack, spells, monsters, pregens, conditions, objects }) -> [ "spells/fire-bolt: problem", ... ]
//   coverage({ spells, monsters })                -> { spells: { auto, assist, manual, unchecked, total }, ... }

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const DAMAGE_TYPES = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
export const SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];
export const SCHOOLS = ['abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion', 'necromancy', 'transmutation'];
export const CAST_TIMES = ['action', 'bonus', 'reaction', 'minute', '10 minutes', 'hour', '8 hours', '12 hours', '24 hours'];
export const MOVE_MODES = ['walk', 'climb', 'swim', 'fly', 'burrow'];
export const AREA_SHAPES = ['cone', 'sphere', 'line', 'cube', 'cylinder', 'emanation'];
export const TIERS = ['auto', 'assist', 'manual'];
// How long something lasts: "instant", a count of rounds, minutes, hours or days, or one of two
// forms the engine cannot time ("until dispelled", "special").
export const isDuration = (x) => typeof x === 'string' && (/^(instant|until dispelled|special)$/.test(x) || /^[1-9]\d* (round|minute|hour|day)s?$/.test(x));
export const CONDITIONS = ['blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled', 'incapacitated', 'invisible',
  'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious'];

// What an effect can do. One key from this list names the step; the rest are its details.
export const STEPS = ['attack', 'save', 'damage', 'heal', 'condition', 'modifier', 'move', 'fall', 'set', 'reveal', 'resource', 'manual'];
// Where a modifier can attach.
export const HOOKS = ['check', 'attack.roll', 'attack.received', 'damage.dealt', 'damage.taken', 'ac', 'speed', 'initiative',
  'save.str', 'save.dex', 'save.con', 'save.int', 'save.wis', 'save.cha', 'save.death', 'concentration',
  'spell.dc', 'spell.attack', 'hp.max', 'carry'];
export const OPS = ['add', 'set', 'min', 'max', 'advantage', 'disadvantage', 'autoFail', 'autoSucceed', 'resist', 'vulnerable', 'immune', 'crit'];
// Situations the engine knows how to test. All tags in a `when` list must hold.
export const TAGS = ['within5', 'beyond5', 'ranged', 'melee', 'attack.advantage', 'attack.disadvantage', 'target.prone', 'target.unconscious',
  'attacker.unseen', 'ally.adjacentToTarget', 'enemy.adjacent', 'long.range'];

// Things on a map (docs/specs/maps-and-objects.md).
export const OBJECT_KINDS = ['door', 'thing'];       // a door stands on a hex edge or a traced line; a thing stands in a hex
export const OBJECT_BLOCKS = ['move', 'sight'];
export const USE_TIMES = ['free', 'action'];
export const TRIGGERS = ['enter', 'leave', 'near'];   // a creature steps onto a thing's hex, steps off it, or comes within so many feet
export const SKILLS = { acrobatics: 'dex', 'animal-handling': 'wis', arcana: 'int', athletics: 'str', deception: 'cha', history: 'int',
  insight: 'wis', intimidation: 'cha', investigation: 'int', medicine: 'wis', nature: 'int', perception: 'wis', performance: 'cha',
  persuasion: 'cha', religion: 'int', 'sleight-of-hand': 'dex', stealth: 'dex', survival: 'wis' };

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DICE = /^(\d+d\d+)?([+-]\d+)?$/;
const isDice = (x) => typeof x === 'string' && x.length > 0 && DICE.test(x);
const isInt = Number.isInteger;
const isText = (x) => typeof x === 'string' && x.trim().length > 0;
const oneOf = (list) => (x) => list.includes(x);
const allOf = (list) => (xs) => Array.isArray(xs) && xs.every((x) => list.includes(x));

// Data means data: nothing callable anywhere inside an entry.
function findFunction(value, path = '') {
  if (typeof value === 'function') return path || '(top)';
  if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) { const hit = findFunction(v, `${path}.${k}`); if (hit) return hit; }
  return null;
}

function lintWhen(when, say) {
  if (when === undefined) return;
  if (!Array.isArray(when)) return say('`when` must be a list of tags');
  for (const t of when) if (!TAGS.includes(t)) say(`unknown situation tag "${t}"`);
}
function lintModifier(m, say) {
  if (!HOOKS.includes(m.on)) say(`modifier on unknown hook "${m.on}"`);
  if (!OPS.includes(m.op)) say(`modifier with unknown op "${m.op}"`);
  // A value is a number, or { perLevel: n } for conditions that stack in levels.
  const numeric = typeof m.value === 'number' || (m.value && typeof m.value.perLevel === 'number');
  if (['add', 'set', 'min', 'max'].includes(m.op) && !numeric) say(`modifier op "${m.op}" needs a number in \`value\``);
  if (m.types !== undefined && !(Array.isArray(m.types) && m.types.every((t) => DAMAGE_TYPES.includes(t)))) say('`types` must be a list of damage types');
  lintWhen(m.when, say);
}
function lintSteps(steps, say, seen = { manual: false }) {
  if (!Array.isArray(steps) || !steps.length) { say('effects must be a non-empty list'); return seen; }
  for (const step of steps) {
    const kinds = STEPS.filter((k) => k in step);
    if (kinds.length !== 1) { say(`each effect step needs exactly one of: ${STEPS.join(', ')} (found ${kinds.length ? kinds.join(' and ') : 'none'})`); continue; }
    const kind = kinds[0];
    lintWhen(step.when, say);
    if (kind === 'attack') {
      if (!['melee', 'ranged'].includes(step.attack)) say('attack must be "melee" or "ranged"');
      if (!['weapon', 'spell'].includes(step.kind)) say('an attack step needs kind "weapon" or "spell"');
      if (step.kind === 'weapon' && !isInt(step.bonus)) say('a weapon attack needs a whole-number bonus');
      if (!step.onHit && !step.onMiss) say('an attack step needs onHit or onMiss');
    }
    if (kind === 'save') {
      if (!ABILITIES.includes(step.save)) say(`save uses unknown ability "${step.save}"`);
      if (!step.onFail && !step.onSuccess) say('a save step needs onFail or onSuccess');
    }
    if (kind === 'damage') {
      if (!isDice(step.damage)) say(`damage "${step.damage}" is not dice like 2d6+3`);
      if (!DAMAGE_TYPES.includes(step.type)) say(`unknown damage type "${step.type}"`);
      if (step.times !== undefined && !(isInt(step.times) && step.times > 0)) say('`times` must be a positive whole number');
    }
    if (kind === 'heal' && !isDice(step.heal)) say(`heal "${step.heal}" is not dice like 2d8`);
    if (kind === 'condition') {
      if (!CONDITIONS.includes(step.condition)) say(`unknown condition "${step.condition}"`);
      const ends = step.ends;
      if (ends !== undefined) {
        if (!['turnStart', 'turnEnd', 'save'].includes(ends?.on)) say('`ends.on` must be turnStart, turnEnd or save');
        if (ends?.on === 'save' && !(ABILITIES.includes(ends.save) && ['turnStart', 'turnEnd'].includes(ends.at))) say('a condition that ends on a save needs `save` (an ability) and `at` (turnStart or turnEnd)');
        if (ends?.of !== undefined && !['target', 'source'].includes(ends.of)) say('`ends.of` must be target or source');
      }
    }
    if (kind === 'modifier') lintModifier(step.modifier ?? {}, say);
    if (kind === 'move') {
      if (!(isInt(step.move) && step.move > 0 && step.move % 5 === 0)) say('`move` must be a distance in feet, a multiple of 5');
      if (!['away', 'toward'].includes(step.dir)) say('a move step needs `dir`: away or toward');
    }
    if (kind === 'fall' && !(step.fall === 'surface' || (isInt(step.fall) && step.fall > 0))) say('`fall` must be a number of feet or "surface"');
    if (kind === 'set') {
      if (!ID.test(step.set ?? '')) say('`set` must name a state');
      if (step.of !== undefined && !['self', 'link'].includes(step.of)) say('`of` must be self or link');
    }
    if (kind === 'reveal' && !['self', 'link', 'target'].includes(step.reveal)) say('`reveal` must be self, link or target');
    if (kind === 'manual') { seen.manual = true; if (!isText(step.manual)) say('a manual step needs text saying what the DM applies'); }
    for (const branch of ['onHit', 'onMiss', 'onFail', 'onSuccess']) if (step[branch]) lintSteps(step[branch], say, seen);
  }
  return seen;
}
function lintTarget(target, say) {
  if (!target || typeof target !== 'object') return say('needs a target');
  const kinds = ['self', 'creature', 'area'].filter((k) => k in target);
  if (kinds.length !== 1) return say('target needs exactly one of self, creature, area');
  if (target.area) {
    if (!AREA_SHAPES.includes(target.area.shape)) say(`unknown area shape "${target.area.shape}"`);
    if (!(target.area.size > 0)) say('an area needs a size in feet');
  }
  if (target.creature) {
    const c = target.creature;
    if (c.reach !== undefined && !(c.reach > 0)) say('reach must be a number of feet');
    if (c.range !== undefined && !(Array.isArray(c.range) && c.range.length === 2 && c.range.every((n) => n > 0) && c.range[0] <= c.range[1])) say('range must be [normal, long] in feet');
  }
}
function lintCommon(e, say) {
  if (!ID.test(e.id ?? '')) say(`id "${e.id}" must be kebab-case`);
  if (!isText(e.name)) say('needs a name');
  if (!isText(e.source)) say('needs a source');
  if (!isText(e.text)) say('needs text describing what it does');
  if (!TIERS.includes(e.tier)) say(`tier must be one of ${TIERS.join(', ')}`);
  if (typeof e.checked !== 'boolean') say('needs `checked: true` or `checked: false`');
  const fn = findFunction(e);
  if (fn) say(`contains a function at ${fn}; content is data only`);
}

function lintSpell(e, say) {
  lintCommon(e, say);
  if (!(isInt(e.level) && e.level >= 0 && e.level <= 9)) say('level must be 0 to 9');
  if (!SCHOOLS.includes(e.school)) say(`unknown school "${e.school}"`);
  if (!CAST_TIMES.includes(e.time)) say(`unknown casting time "${e.time}"`);
  if (!(e.range === 'self' || e.range === 'touch' || e.range > 0)) say('range must be "self", "touch" or a number of feet');
  if (!allOf(['v', 's', 'm'])(e.components)) say('components must be a list drawn from v, s, m');
  if (!isDuration(e.duration)) say('duration must be \"instant\", a number of rounds, minutes, hours or days (\"10 minutes\"), \"until dispelled\" or \"special\"');
  if (typeof e.concentration !== 'boolean' || typeof e.ritual !== 'boolean') say('concentration and ritual must be true or false');
  if (!Array.isArray(e.classes)) say('classes must be a list');
  lintTarget(e.target, say);
  const seen = lintSteps(e.effects, say);
  if (e.tier === 'auto' && seen.manual) say('marked auto but contains a manual step');
  if (e.tier === 'manual' && !seen.manual) say('marked manual but has no manual step');
}
function lintMonster(e, say) {
  lintCommon(e, say);
  if (!SIZES.includes(e.size)) say(`unknown size "${e.size}"`);
  if (!isText(e.type)) say('needs a creature type');
  if (!(typeof e.cr === 'number' && e.cr >= 0)) say('cr must be a number');
  for (const k of ['ac', 'hp', 'pb']) if (!(isInt(e[k]) && e[k] > 0)) say(`${k} must be a positive whole number`);
  if (!e.speed || !Object.keys(e.speed).length || !Object.entries(e.speed).every(([m, v]) => MOVE_MODES.includes(m) && v >= 0)) say(`speed must give feet for one or more of: ${MOVE_MODES.join(', ')}`);
  if (!e.abilities || !ABILITIES.every((a) => isInt(e.abilities[a]))) say('abilities must give all six scores');
  for (const k of ['resist', 'vulnerable', 'immune']) if (!allOf(DAMAGE_TYPES)(e[k])) say(`${k} must be a list of damage types`);
  if (e.skills !== undefined && !(e.skills && Object.entries(e.skills).every(([k, v]) => Object.hasOwn(SKILLS, k) && isInt(v)))) say('skills must give a whole-number bonus for each skill named');
  const ids = new Set();
  for (const t of e.traits ?? []) {
    const sub = (m) => say(`trait ${t.id}: ${m}`);
    if (!ID.test(t.id ?? '')) sub('id must be kebab-case');
    if (!isText(t.name) || !isText(t.text)) sub('needs a name and text');
    if (!Array.isArray(t.modifiers)) sub('needs a modifiers list (it may be empty)');
    else for (const m of t.modifiers) lintModifier(m, sub);
  }
  if (!Array.isArray(e.actions) || !e.actions.length) say('needs one or more actions');
  for (const a of e.actions ?? []) {
    const sub = (m) => say(`action ${a.id}: ${m}`);
    if (!ID.test(a.id ?? '')) sub('id must be kebab-case');
    if (ids.has(a.id)) sub('duplicate action id');
    ids.add(a.id);
    if (!isText(a.name) || !isText(a.text)) sub('needs a name and text');
    lintTarget(a.target, sub);
    const seen = lintSteps(a.effects, sub);
    if (e.tier === 'auto' && seen.manual) sub('the monster is marked auto but this action has a manual step');
  }
}

function lintCondition(e, say) {
  if (!CONDITIONS.includes(e.id)) say(`"${e.id}" is not one of the conditions`);
  if (!isText(e.name) || !isText(e.source) || !isText(e.text)) say('needs a name, a source and text');
  if (typeof e.visible !== 'boolean') say('needs `visible: true` or `visible: false`');
  if (typeof e.checked !== 'boolean') say('needs `checked: true` or `checked: false`');
  if (e.also !== undefined && !isText(e.also)) say('`also` must be text saying what the engine does not apply');
  if (e.levels !== undefined && !(isInt(e.levels) && e.levels > 1)) say('`levels` must be a whole number above 1');
  if (e.includes !== undefined && !allOf(CONDITIONS)(e.includes)) say('`includes` must be a list of conditions');
  if (!Array.isArray(e.modifiers)) say('needs a modifiers list (it may be empty)');
  else for (const m of e.modifiers) {
    lintModifier(m, say);
    if (m.value?.perLevel !== undefined && !e.levels) say('a perLevel value needs the condition to have `levels`');
  }
  const fn = findFunction(e);
  if (fn) say(`contains a function at ${fn}; content is data only`);
}

// A check an object asks for: an ability, optionally a skill or a tool, and a default DC.
function lintCheck(c, say) {
  if (!c || !ABILITIES.includes(c.ability)) return say('a check needs an ability');
  if (c.skill !== undefined && !Object.hasOwn(SKILLS, c.skill)) say(`unknown skill "${c.skill}"`);
  if (c.tool !== undefined && !ID.test(c.tool)) say('a tool must be a kebab-case id');
  if (!(isInt(c.dc) && c.dc > 0)) say('a check needs a whole-number DC');
}
function lintObject(e, say) {
  lintCommon(e, say);
  if (!OBJECT_KINDS.includes(e.kind)) say(`kind must be one of ${OBJECT_KINDS.join(', ')}`);
  const states = e.states && typeof e.states === 'object' && !Array.isArray(e.states) ? Object.keys(e.states) : [];
  if (!states.length) say('needs states');
  for (const st of states) {
    const v = e.states[st];
    if (!ID.test(st)) say(`state "${st}" must be kebab-case`);
    if (!v || !isText(v.name)) say(`state "${st}" needs a name`);
    if (!allOf(OBJECT_BLOCKS)(v?.blocks)) say(`state "${st}" needs \`blocks\`, a list drawn from ${OBJECT_BLOCKS.join(', ')}`);
    if (v?.hidden !== undefined && typeof v.hidden !== 'boolean') say(`state "${st}": hidden must be true or false`);
  }
  if (!states.includes(e.initial)) say('`initial` must be one of its states');
  if (e.dc !== undefined && !(e.dc && typeof e.dc === 'object' && Object.entries(e.dc).every(([k, n]) => ['save', 'find'].includes(k) && isInt(n) && n > 0))) say('`dc` may give whole numbers for save and find');
  const anyHidden = states.some((st) => e.states[st]?.hidden);
  if (anyHidden && !(e.find && states.includes(e.find.to) && !e.states[e.find.to]?.hidden && isInt(e.dc?.find))) say('something with a hidden state needs `find: { to }` naming the state it is found in, and `dc.find`');
  if (!anyHidden && e.find !== undefined) say('`find` is only for something with a hidden state');
  let manual = false;
  for (const [i, t] of (e.triggers ?? []).entries()) {
    const sub = (m) => say(`trigger ${i}: ${m}`);
    if (e.kind !== 'thing') sub('only a thing in a hex can have triggers');
    if (!TRIGGERS.includes(t?.on)) { sub(`\`on\` must be one of ${TRIGGERS.join(', ')}`); continue; }
    if (!(Array.isArray(t.from) && t.from.length && t.from.every((x) => states.includes(x)))) sub('`from` must list the states it fires in');
    if (t.to !== undefined && !states.includes(t.to)) sub('`to` must be one of its states');
    if (t.on === 'near' && !(isInt(t.feet) && t.feet > 0 && t.feet % 5 === 0)) sub('a near trigger needs `feet`, a multiple of 5');
    if (t.who !== undefined && !['any', 'party'].includes(t.who)) sub('`who` must be any or party');
    if (t.area !== undefined && !(isInt(t.area) && t.area > 0 && t.area % 5 === 0)) sub('`area` must be a radius in feet, a multiple of 5');
    if (t.effects !== undefined) manual ||= lintSteps(t.effects, sub).manual;
    if (t.effects === undefined && t.to === undefined) sub('needs effects or a state to go to');
  }
  if (!Array.isArray(e.use)) return say('needs a `use` list (it may be empty)');
  const ids = new Set();
  for (const u of e.use) {
    const sub = (m) => say(`use ${u?.id}: ${m}`);
    if (!u || !ID.test(u.id ?? '') || ids.has(u.id)) { sub('id must be kebab-case and used once'); continue; }
    ids.add(u.id);
    if (!isText(u.name)) sub('needs a name');
    if (!(Array.isArray(u.from) && u.from.length && u.from.every((x) => states.includes(x)))) sub('`from` must list one or more of its states');
    if (u.to !== undefined && !states.includes(u.to)) sub('`to` must be one of its states');
    if (!USE_TIMES.includes(u.time)) sub(`time must be one of ${USE_TIMES.join(', ')}`);
    if (u.key !== undefined && typeof u.key !== 'boolean') sub('key must be true or false');
    if (u.check !== undefined) lintCheck(u.check, sub);
    if (u.effects !== undefined) manual ||= lintSteps(u.effects, sub).manual;
    if (u.to === undefined && u.effects === undefined) sub('needs effects or a state to go to');
  }
  if (e.tier === 'auto' && manual) say('marked auto but contains a manual step');
}

export function lintPack({ pack, spells = [], monsters = [], pregens = [], conditions = [], objects = [] }) {
  const problems = [];
  if (!pack || !ID.test(pack.id ?? '') || !isText(pack.name) || !isText(pack.license) || !isText(pack.attribution)) problems.push('pack: needs id, name, license and attribution');
  for (const [kind, list, lint] of [['spells', spells, lintSpell], ['monsters', monsters, lintMonster], ['conditions', conditions, lintCondition], ['objects', objects, lintObject]]) {
    const seen = new Set();
    for (const e of list) {
      const say = (m) => problems.push(`${kind}/${e?.id ?? '?'}: ${m}`);
      if (!e || typeof e !== 'object') { problems.push(`${kind}: an entry is not an object`); continue; }
      if (seen.has(e.id)) say('duplicate id');
      seen.add(e.id);
      lint(e, say);
    }
  }
  const spellIds = new Set(spells.map((s) => s.id));
  for (const p of pregens) {
    const say = (m) => problems.push(`pregens/${p?.id ?? '?'}: ${m}`);
    if (!ID.test(p.id ?? '')) say('id must be kebab-case');
    for (const id of p.spells ?? []) if (!spellIds.has(id)) say(`knows a spell that is not in the pack: "${id}"`);
    for (const k of ['skills', 'expertise']) if (p[k] !== undefined && !(Array.isArray(p[k]) && p[k].every((x) => Object.hasOwn(SKILLS, x)))) say(`${k} must be a list of skills`);
    if (p.expertise?.some((x) => !(p.skills ?? []).includes(x))) say('expertise needs proficiency in the same skill');
    if (p.tools !== undefined && !(Array.isArray(p.tools) && p.tools.every((x) => ID.test(x)))) say('tools must be a list of kebab-case ids');
    const fn = findFunction(p);
    if (fn) say(`contains a function at ${fn}; content is data only`);
  }
  return problems;
}

// How much of each kind is entered, at which tier, and how much is still unchecked against the SRD.
export function coverage(kinds) {
  const out = {};
  for (const [kind, list] of Object.entries(kinds)) {
    out[kind] = { total: list.length, auto: 0, assist: 0, manual: 0, unchecked: 0 };
    for (const e of list) {
      if (TIERS.includes(e.tier)) out[kind][e.tier]++;
      else if (kind === 'conditions') out[kind][e.also ? 'assist' : 'auto']++;      // a condition with a leftover is partly applied
      if (e.checked !== true) out[kind].unchecked++;
    }
  }
  return out;
}
