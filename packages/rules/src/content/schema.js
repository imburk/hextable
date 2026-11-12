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
export const STEPS = ['attack', 'save', 'damage', 'heal', 'tempHp', 'condition', 'modifier', 'move', 'fall', 'set', 'reveal', 'resource', 'manual'];
// Where a modifier can attach.
export const HOOKS = ['check', 'save', 'attack.roll', 'attack.received', 'damage.dealt', 'damage.taken', 'ac', 'speed', 'initiative',
  'save.str', 'save.dex', 'save.con', 'save.int', 'save.wis', 'save.cha', 'save.death', 'concentration',
  'spell.dc', 'spell.attack', 'hp.max', 'carry'];
export const OPS = ['add', 'set', 'min', 'max', 'advantage', 'disadvantage', 'autoFail', 'autoSucceed', 'resist', 'vulnerable', 'immune', 'crit'];
// Situations the engine knows how to test. All tags in a `when` list must hold.
export const TAGS = ['within5', 'beyond5', 'ranged', 'melee', 'attack.advantage', 'attack.disadvantage', 'target.prone', 'target.unconscious',
  'attacker.unseen', 'target.unseen', 'ally.adjacentToTarget', 'enemy.adjacent', 'long.range', 'target.halfCover', 'target.threeQuartersCover',
  'target.seesSource'];

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
// A spell's choice made when it is cast (`choice: { of, from? }`); a modifier names it as "chosen".
export const CHOICES = { skill: Object.keys(SKILLS), ability: ABILITIES, damageType: DAMAGE_TYPES };
function lintModifier(m, say) {
  if (!HOOKS.includes(m.on)) say(`modifier on unknown hook "${m.on}"`);
  if (!OPS.includes(m.op)) say(`modifier with unknown op "${m.op}"`);
  // A value is a number, { perLevel: n } for conditions that stack in levels, or for `add`
  // dice ("1d4", "-1d4") rolled each time the modifier applies.
  const numeric = typeof m.value === 'number' || (m.value && typeof m.value.perLevel === 'number');
  const dice = m.op === 'add' && typeof m.value === 'string' && /^[+-]?\d+d\d+([+-]\d+)?$/.test(m.value);
  if (['add', 'set', 'min', 'max'].includes(m.op) && !numeric && !dice) say(`modifier op "${m.op}" needs a number in \`value\`${m.op === 'add' ? ' (or dice like 1d4)' : ''}`);
  if (m.types !== undefined && !(Array.isArray(m.types) && m.types.every((t) => DAMAGE_TYPES.includes(t) || t === 'chosen'))) say('`types` must be a list of damage types (or "chosen")');
  // `scope` limits a check or a save to one skill or ability; "chosen" is the caster's choice.
  if (m.scope !== undefined) {
    const sc = m.scope;
    if (!sc || typeof sc !== 'object' || !Object.keys(sc).length || Object.keys(sc).some((k) => k !== 'skill' && k !== 'ability')) say('`scope` gives a skill or an ability');
    else {
      if (sc.skill !== undefined && !(Object.hasOwn(SKILLS, sc.skill) || sc.skill === 'chosen')) say(`unknown skill "${sc.skill}" in scope`);
      if (sc.ability !== undefined && !(ABILITIES.includes(sc.ability) || sc.ability === 'chosen')) say(`unknown ability "${sc.ability}" in scope`);
      if (!['check', 'save'].includes(m.on) && !m.on.startsWith('save.')) say('`scope` is for checks and saves');
    }
  }
  // `once: 'turn'`: it applies at most once a turn (the Resistance cantrip).
  if (m.once !== undefined && !(m.once === 'turn' && m.on === 'damage.taken' && m.op === 'add')) say('`once: "turn"` is for an add on damage.taken');
  lintWhen(m.when, say);
}
// Every "chosen" in a spell's steps needs a `choice` of the right kind.
function lintChoice(e, say) {
  const used = new Set();
  walkSteps(e.effects, (st) => {
    const m = st.modifier;
    if (!m) return;
    if (m.scope?.skill === 'chosen') used.add('skill');
    if (m.scope?.ability === 'chosen') used.add('ability');
    if (m.types?.includes('chosen')) used.add('damageType');
  });
  const c = e.choice;
  if (c !== undefined) {
    if (!c || !Object.hasOwn(CHOICES, c.of)) return say(`\`choice.of\` is one of ${Object.keys(CHOICES).join(', ')}`);
    if (c.from !== undefined && !(Array.isArray(c.from) && c.from.length > 1 && c.from.every((x) => CHOICES[c.of].includes(x)))) say(`\`choice.from\` lists ${c.of} values`);
    if (!used.has(c.of)) say('a choice that no step uses');
  }
  for (const k of used) if (c?.of !== k) say(`a step uses the chosen ${k}, but the spell has no \`choice: { of: "${k}" }\``);
}
function walkSteps(steps, visit) {
  for (const st of Array.isArray(steps) ? steps : []) { visit(st); for (const b of ['onHit', 'onMiss', 'onFail', 'onSuccess']) if (st[b]) walkSteps(st[b], visit); }
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
    if (kind === 'tempHp' && !isDice(step.tempHp)) say(`tempHp "${step.tempHp}" is not dice like 2d4+4`);
    if ((kind === 'heal' || kind === 'tempHp') && step.addMod !== undefined && step.addMod !== true) say('`addMod` is true or left out');
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
    // How far away a monster's sphere or cylinder may be centred (a spell's range says it for a spell).
    if (target.area.range !== undefined && !(isInt(target.area.range) && target.area.range > 0 && target.area.range % 5 === 0)) say('an area\'s range is feet, a multiple of 5');
    // A Line's width in feet (5 when not given); `exceptCaster` for "each creature other than you".
    if (target.area.width !== undefined && !(target.area.shape === 'line' && isInt(target.area.width) && target.area.width > 0 && target.area.width % 5 === 0)) say('`width` is for a line: feet, a multiple of 5');
    if (target.area.exceptCaster !== undefined && target.area.exceptCaster !== true) say('`exceptCaster` is true or left out');
    // `choose`: up to so many creatures of the caster's choice in the area. `count`: so many of
    // these shapes, which the caster arranges (Fire Storm's ten cubes); the engine lays out one.
    for (const k of ['choose', 'count']) if (target.area[k] !== undefined && !(isInt(target.area[k]) && target.area[k] > 1 && target.area[k] <= 20)) say(`\`${k}\` is a whole number from 2 to 20`);
  }
  if (target.creature) {
    const c = target.creature;
    // `count`: up to so many creatures (1 if not given). `repeat`: the count is of rays, darts or
    // beams, and one creature may take several. `within`: every target after the first is within
    // so many feet of the first (Chain Lightning).
    if (c.count !== undefined && !(isInt(c.count) && c.count >= 1 && c.count <= 20)) say('`count` is a whole number from 1 to 20');
    if (c.repeat !== undefined && c.repeat !== true) say('`repeat` is true or left out');
    if (c.within !== undefined && !(isInt(c.within) && c.within > 0 && c.within % 5 === 0)) say('`within` is feet, a multiple of 5');
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
  lintHigher(e, say);
  lintChoice(e, say);
  const seen = lintSteps(e.effects, say);
  if (e.tier === 'auto' && seen.manual) say('marked auto but contains a manual step');
  if (e.tier === 'manual' && !seen.manual) say('marked manual but has no manual step');
}
// What grows when a spell is cast higher: `level` (a cantrip's damage dice by character level),
// `targets` (how many it aims at by character level), and `slot`, per slot level above its own:
// `damage` or `heal` dice added, `times` more damage rolls, `targets` more creatures.
function lintHigher(e, say) {
  const h = e.higher;
  if (h === undefined) return;
  if (!h || typeof h !== 'object') return say('`higher` must be an object');
  for (const k of Object.keys(h)) if (!['level', 'targets', 'slot'].includes(k)) say(`\`higher.${k}\` is not something a spell can grow by`);
  const byLevel = (x, ok) => x && typeof x === 'object' && Object.entries(x).every(([l, v]) => isInt(+l) && +l >= 1 && +l <= 20 && ok(v));
  if (h.level !== undefined && !byLevel(h.level, isDice)) say('`higher.level` gives dice by character level');
  if (h.targets !== undefined && !byLevel(h.targets, (v) => isInt(v) && v >= 1 && v <= 20)) say('`higher.targets` gives a number of targets by character level');
  if (h.targets !== undefined && !e.target?.creature) say('`higher.targets` is for a spell aimed at creatures');
  if (h.slot !== undefined) {
    for (const k of Object.keys(h.slot ?? {})) if (!['damage', 'heal', 'tempHp', 'times', 'targets'].includes(k)) say(`\`higher.slot.${k}\` is not something a spell can grow by`);
    for (const k of ['damage', 'heal', 'tempHp']) if (h.slot[k] !== undefined && !isDice(h.slot[k])) say(`\`higher.slot.${k}\` must be dice`);
    for (const k of ['times', 'targets']) if (h.slot[k] !== undefined && !(isInt(h.slot[k]) && h.slot[k] > 0)) say(`\`higher.slot.${k}\` must be a positive whole number`);
    if (h.slot.targets !== undefined && !e.target?.creature && !e.target?.area?.choose) say('`higher.slot.targets` is for a spell aimed at creatures');
  }
}
const SENSES = ['darkvision', 'blindsight', 'tremorsense', 'truesight'];
// A senses map gives a range in feet, a multiple of 5, for some of the four special senses.
const validSenses = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.entries(v).every(([k, f]) => SENSES.includes(k) && isInt(f) && f >= 0 && f <= 1000 && f % 5 === 0);
function lintMonster(e, say) {
  lintCommon(e, say);
  if (!SIZES.includes(e.size)) say(`unknown size "${e.size}"`);
  if (!isText(e.type)) say('needs a creature type');
  if (!(typeof e.cr === 'number' && e.cr >= 0)) say('cr must be a number');
  for (const k of ['ac', 'hp', 'pb']) if (!(isInt(e[k]) && e[k] > 0)) say(`${k} must be a positive whole number`);
  if (!e.speed || !Object.keys(e.speed).length || !Object.entries(e.speed).every(([m, v]) => MOVE_MODES.includes(m) && v >= 0)) say(`speed must give feet for one or more of: ${MOVE_MODES.join(', ')}`);
  if (!e.abilities || !ABILITIES.every((a) => isInt(e.abilities[a]))) say('abilities must give all six scores');
  for (const k of ['resist', 'vulnerable', 'immune']) if (!allOf(DAMAGE_TYPES)(e[k])) say(`${k} must be a list of damage types`);
  if (e.senses !== undefined && !validSenses(e.senses)) say(`senses must give whole feet, in multiples of 5, for only: ${SENSES.join(', ')}`);
  if (e.skills !== undefined && !(e.skills && Object.entries(e.skills).every(([k, v]) => Object.hasOwn(SKILLS, k) && isInt(v)))) say('skills must give a whole-number bonus for each skill named');
  const ids = new Set();
  for (const t of e.traits ?? []) {
    const sub = (m) => say(`trait ${t.id}: ${m}`);
    if (!ID.test(t.id ?? '')) sub('id must be kebab-case');
    if (!isText(t.name) || !isText(t.text)) sub('needs a name and text');
    if (!Array.isArray(t.modifiers)) sub('needs a modifiers list (it may be empty)');
    else for (const m of t.modifiers) lintModifier(m, sub);
  }
  if (e.conditionImmune !== undefined && !(allOf(CONDITIONS)(e.conditionImmune) && e.conditionImmune.length > 0)) say('conditionImmune must be a list of conditions');
  if (!Array.isArray(e.actions) || !e.actions.length) say('needs one or more actions');
  for (const a of e.actions ?? []) {
    const sub = (m) => say(`action ${a.id}: ${m}`);
    if (!ID.test(a.id ?? '')) sub('id must be kebab-case');
    if (ids.has(a.id)) sub('duplicate action id');
    ids.add(a.id);
    if (!isText(a.name) || !isText(a.text)) sub('needs a name and text');
    lintUses(a, sub);
    if (a.multiattack !== undefined) {
      // Multiattack: an action whose effect is to make other actions of the same creature.
      if (a.effects !== undefined || a.target !== undefined) sub('a multiattack action has no target and no effects of its own');
      if (a.recharge !== undefined || a.uses !== undefined) sub('a multiattack action has no recharge or uses');
      lintMultiattack(a.multiattack, e.actions, a.id, sub);
      continue;
    }
    lintTarget(a.target, sub);
    const seen = lintSteps(a.effects, sub);
    if (e.tier === 'auto' && seen.manual) sub('the monster is marked auto but this action has a manual step');
  }
}
// How often an action can be used: `recharge: [min, 6]` (rolled at the start of each of its turns
// once spent) or `uses: { per: 'day', n }`. `time: 'bonus'` makes it a Bonus Action.
function lintUses(a, say) {
  if (a.time !== undefined && !['action', 'bonus'].includes(a.time)) say('time must be "action" or "bonus"');
  if (a.recharge !== undefined && !(Array.isArray(a.recharge) && a.recharge.length === 2 && isInt(a.recharge[0]) && a.recharge[0] >= 2 && a.recharge[0] <= 6 && a.recharge[1] === 6)) say('recharge must be [min, 6] with min 2 to 6');
  if (a.uses !== undefined && !(a.uses && a.uses.per === 'day' && isInt(a.uses.n) && a.uses.n > 0 && a.uses.n <= 10 && Object.keys(a.uses).length === 2)) say('uses must be { per: "day", n } with n 1 to 10');
  if (a.recharge !== undefined && a.uses !== undefined) say('an action has recharge or uses, not both');
}
// `multiattack` is a list of { action, times }, where `action` is the id of another action of
// the same creature or a list of ids ("any of these"); or { or: [list, list, ...] }, alternatives
// of which the creature makes one.
export function lintMultiattack(ma, actions, self, say) {
  const lists = Array.isArray(ma) ? [ma] : ma && Array.isArray(ma.or) && Object.keys(ma).length === 1 ? ma.or : null;
  if (!lists || !lists.length || (!Array.isArray(ma) && lists.length < 2)) return say('multiattack must be a list of { action, times } or { or: [list, list, ...] }');
  for (const list of lists) {
    if (!Array.isArray(list) || !list.length) { say('each multiattack list needs one or more entries'); continue; }
    for (const entry of list) {
      if (!entry || typeof entry !== 'object' || Object.keys(entry).some((k) => k !== 'action' && k !== 'times')) { say('a multiattack entry is { action, times }'); continue; }
      if (!(isInt(entry.times) && entry.times > 0 && entry.times <= 10)) say('`times` must be a whole number from 1 to 10');
      const ids = Array.isArray(entry.action) ? entry.action : [entry.action];
      if (!ids.length) say('a multiattack entry names an action');
      for (const id of ids) {
        const other = actions.find((x) => x.id === id);
        if (!other) say(`multiattack names "${id}", which is not one of this creature's actions`);
        else if (id === self || other.multiattack) say(`multiattack cannot name another multiattack ("${id}")`);
        else if (other.time === 'bonus') say(`multiattack cannot name "${id}", which is a Bonus Action`);
        else if (other.recharge || other.uses) say(`multiattack cannot name "${id}", which has a recharge or uses: the SRD says "if available" there, which stays text`);
      }
    }
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
    // Light it gives in that state: Bright Light to `bright` feet, Dim Light `dim` feet beyond (docs/specs/sight.md).
    if (v?.light !== undefined && !(v.light && typeof v.light === 'object' && Object.keys(v.light).every((k) => ['bright', 'dim'].includes(k)) && [v.light.bright, v.light.dim].every((n) => isInt(n) && n >= 0 && n % 5 === 0 && n <= 600) && v.light.bright + v.light.dim > 0)) say(`state "${st}": light must be { bright, dim }, feet in multiples of 5`);
    if (v?.light !== undefined && e.kind !== 'thing') say(`state "${st}": only a thing in a hex can give light`);
  }
  if (!states.includes(e.initial)) say('`initial` must be one of its states');
  if (e.connects !== undefined && (typeof e.connects !== 'boolean' || e.kind !== 'thing')) say('`connects` is true or false, and only a thing in a hex can join two places');
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
    if (false) say('');
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

// ---------- a character typed in by hand (quick entry) ----------
// A finished record with its numbers already worked out, the same shape as a pregenerated
// character. Only the fields listed here are accepted, so a record can never carry anything
// else into the game (an owner, a side, a hidden flag). Returns a list of problems.
const RECORD_FIELDS = ['name', 'cls', 'level', 'size', 'ac', 'hp', 'speed', 'speeds', 'senses', 'hover', 'prof', 'abil', 'saveProf', 'skills', 'expertise', 'tools',
  'attacks', 'castAbil', 'spells', 'slots', 'features', 'gear', 'resist', 'vuln', 'immune', 'look'];
const ATTACK_FIELDS = ['id', 'name', 'type', 'bonus', 'damage', 'dtype', 'reach', 'range', 'finesse'];
// extraAttack: the Attack action makes 1 + n attacks (Extra Attack at Fighter 5 is 1, at 11 is 2, at 20 is 3).
const FEATURES = { secondWind: (v) => isInt(v) && v >= 0 && v <= 10, sneak: isDice, extraAttack: (v) => isInt(v) && v >= 1 && v <= 3 };
export function lintRecord(r, { spells = {} } = {}) {
  const bad = [], say = (m) => bad.push(m);
  if (!r || typeof r !== 'object' || Array.isArray(r)) return ['A character is a record.'];
  if (findFunction(r)) return ['A character is data only.'];
  for (const k of Object.keys(r)) if (!RECORD_FIELDS.includes(k)) say(`"${k}" is not something a character record has.`);
  const within = (v, lo, hi) => isInt(v) && v >= lo && v <= hi;
  const list = (v, ok, max = 40) => Array.isArray(v) && v.length <= max && v.every(ok);
  if (!(isText(r.name) && r.name.length <= 40)) say('It needs a name of up to 40 letters.');
  if (r.cls !== undefined && !(isText(r.cls) && r.cls.length <= 40)) say('Its class is a short piece of text.');
  if (!within(r.level, 1, 20)) say('Its level is 1 to 20.');
  if (r.size !== undefined && !SIZES.includes(r.size)) say(`Its size is one of ${SIZES.join(', ')}.`);
  if (!within(r.ac, 1, 40)) say('Its Armor Class is 1 to 40.');
  if (!within(r.hp, 1, 999)) say('Its Hit Points are 1 to 999.');
  if (!(within(r.speed, 0, 300) && r.speed % 5 === 0)) say('Its Speed is a multiple of 5 feet.');
  if (r.speeds !== undefined && !(r.speeds && typeof r.speeds === 'object' && Object.entries(r.speeds).every(([m, v]) => MOVE_MODES.includes(m) && m !== 'walk' && within(v, 5, 300) && v % 5 === 0))) say(`Its other speeds are multiples of 5 feet for climb, swim, fly or burrow.`);
  if (r.senses !== undefined && !validSenses(r.senses)) say(`Its senses are feet, in multiples of 5, for ${SENSES.join(', ')}.`);
  if (r.hover !== undefined && typeof r.hover !== 'boolean') say('Hover is true or false.');
  if (!within(r.prof, 2, 9)) say('Its Proficiency Bonus is 2 to 9.');
  if (!(r.abil && typeof r.abil === 'object' && Object.keys(r.abil).length === 6 && ABILITIES.every((a) => within(r.abil[a], 1, 30)))) say('It needs all six ability scores, each 1 to 30.');
  if (r.saveProf !== undefined && !list(r.saveProf, oneOf(ABILITIES))) say('Its saving throw proficiencies are abilities.');
  for (const k of ['skills', 'expertise']) if (r[k] !== undefined && !list(r[k], (x) => Object.hasOwn(SKILLS, x))) say(`Its ${k} must be skills.`);
  if (r.expertise?.some?.((x) => !(r.skills ?? []).includes(x))) say('Expertise needs proficiency in the same skill.');
  if (r.tools !== undefined && !list(r.tools, (x) => typeof x === 'string' && ID.test(x))) say('Its tools are kebab-case ids such as thieves-tools.');
  const ids = new Set();
  if (r.attacks !== undefined && !Array.isArray(r.attacks)) say('Its attacks are a list.');
  for (const a of Array.isArray(r.attacks) ? r.attacks.slice(0, 13) : []) {
    const sub = (m) => say(`Attack "${a?.name ?? a?.id}": ${m}`);
    if (!a || typeof a !== 'object') { say('An attack is a record.'); continue; }
    for (const k of Object.keys(a)) if (!ATTACK_FIELDS.includes(k)) sub(`"${k}" is not something an attack has.`);
    if (!ID.test(a.id ?? '') || ids.has(a.id)) sub('it needs a kebab-case id used once.');
    ids.add(a.id);
    if (!(isText(a.name) && a.name.length <= 40)) sub('it needs a name.');
    if (!['melee', 'ranged'].includes(a.type)) sub('it is melee or ranged.');
    if (!within(a.bonus, -5, 30)) sub('its bonus to hit is a whole number.');
    if (!isDice(a.damage)) sub(`its damage "${a.damage}" is not dice like 1d8+3.`);
    if (!DAMAGE_TYPES.includes(a.dtype)) sub(`unknown damage type "${a.dtype}".`);
    if (a.type === 'melee' && !(within(a.reach, 5, 30) && a.reach % 5 === 0)) sub('a melee attack needs a reach in feet.');
    if (a.type === 'ranged' && !(Array.isArray(a.range) && a.range.length === 2 && a.range.every((n) => within(n, 5, 2000)) && a.range[0] <= a.range[1])) sub('a ranged attack needs a range of [normal, long] in feet.');
    if (a.finesse !== undefined && typeof a.finesse !== 'boolean') sub('finesse is true or false.');
  }
  if ((r.attacks?.length ?? 0) > 12) say('Twelve attacks at most.');
  if (r.castAbil !== undefined && !ABILITIES.includes(r.castAbil)) say('Its spellcasting ability is an ability.');
  if (r.spells !== undefined && !list(r.spells, (x) => typeof x === 'string' && Object.hasOwn(spells, x), 400)) say('It knows a spell that is not in the game.');
  if (r.spells?.length && !r.castAbil) say('A character with spells needs a spellcasting ability.');
  if (r.slots !== undefined && !(r.slots && typeof r.slots === 'object' && Object.entries(r.slots).every(([l, n]) => within(+l, 1, 9) && within(n, 0, 9)))) say('Its spell slots are a number for each level 1 to 9.');
  if (r.features !== undefined && !(r.features && typeof r.features === 'object' && Object.entries(r.features).every(([k, v]) => Object.hasOwn(FEATURES, k) && FEATURES[k](v)))) say(`Its features can be: ${Object.keys(FEATURES).join(', ')}.`);
  if (r.gear !== undefined && !list(r.gear, (x) => typeof x === 'string' && x.length > 0 && x.length <= 60, 60)) say('Its gear is a list of short names.');
  for (const k of ['resist', 'vuln', 'immune']) if (r[k] !== undefined && !list(r[k], oneOf(DAMAGE_TYPES))) say(`${k} must be damage types.`);
  if (r.look !== undefined && !(r.look && Object.keys(r.look).every((k) => k === 'color') && /^#[0-9a-fA-F]{6}$/.test(r.look.color ?? ''))) say('Its look is a colour like #c8553d.');
  return bad;
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
