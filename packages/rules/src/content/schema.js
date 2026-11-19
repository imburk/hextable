// The closed vocabulary of rules content, and the linter that holds content to it.
//
// Content packs are data. What that data is allowed to say is fixed here: the effect steps,
// the hooks a modifier can attach to, the operations, the situation tags. Adding to any of
// these lists is an engine change and needs the spec amended (docs/specs/rules-expansion.md);
// a content pull request cannot do it.
//
//   lintPack({ pack, spells, monsters, summons, pregens, conditions, objects }) -> [ "spells/fire-bolt: problem", ... ]
//   coverage({ spells, monsters })                -> { spells: { auto, assist, manual, unchecked, total }, ... }
//   lintPack(doc, { strict: true })               -> a homebrew pack: budget first, then the closed key lists and homebrew rules
//   lintEntry(kind, entry, { pack })              -> one entry, strict by default
//   budget(doc), budgetEntry, budgetTable, HOMEBREW_LIMITS (the end of this file; docs/specs/homebrew.md, Decision 2)

import { bake, castings, CASTER_AMOUNTS, isAmount, isByAmount, isCasterAmount } from '../summons.js';

export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const DAMAGE_TYPES = ['acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant', 'slashing', 'thunder'];
export const SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'];
export const SCHOOLS = ['abjuration', 'conjuration', 'divination', 'enchantment', 'evocation', 'illusion', 'necromancy', 'transmutation'];
export const CAST_TIMES = ['action', 'bonus', 'reaction', 'minute', '10 minutes', 'hour', '8 hours', '12 hours', '24 hours'];
export const MOVE_MODES = ['walk', 'climb', 'swim', 'fly', 'burrow'];
export const AREA_SHAPES = ['cone', 'sphere', 'line', 'cube', 'cylinder', 'emanation'];
export const TIERS = ['auto', 'assist', 'manual'];
// What a spell is for, in four words a player sorts by (docs/specs/table-ui.md, E12), in this fixed order.
// A spell may carry them by hand in `kinds`; `spellKinds` (effects.js) derives them from the steps otherwise.
export const SPELL_KINDS = ['damage', 'healing', 'control', 'utility'];
// How long something lasts: "instant", a count of rounds, minutes, hours or days, or one of two
// forms the engine cannot time ("until dispelled", "special").
export const isDuration = (x) => typeof x === 'string' && (/^(instant|until dispelled|special)$/.test(x) || /^[1-9]\d* (round|minute|hour|day)s?$/.test(x));
export const CONDITIONS = ['blinded', 'charmed', 'deafened', 'exhaustion', 'frightened', 'grappled', 'incapacitated', 'invisible',
  'paralyzed', 'petrified', 'poisoned', 'prone', 'restrained', 'stunned', 'unconscious'];

// What an effect can do. One key from this list names the step; the rest are its details.
export const STEPS = ['attack', 'save', 'damage', 'heal', 'tempHp', 'condition', 'modifier', 'move', 'fall', 'set', 'reveal', 'resource', 'counter', 'teleport', 'cure', 'kill', 'remains', 'endConcentration', 'summon', 'manual'];
// Lists of steps inside a step, run when something about it comes out a certain way.
// `blocked`: a teleport that cannot arrive (Dimension Door). On a damage step, `onZero`: the damage
// took its target from above 0 Hit Points to 0 (Disintegrate); `onKill`: it killed it (Cone of Cold).
export const BRANCHES = ['onHit', 'onMiss', 'onFail', 'onSuccess', 'blocked', 'onZero', 'onKill'];
// What is left of a creature a spell killed: a `remains` step records it on the body.
export const REMAINS = ['frozen-statue', 'dust'];
// Where a modifier can attach.
export const HOOKS = ['check', 'save', 'attack.roll', 'attack.received', 'damage.dealt', 'damage.taken', 'ac', 'speed', 'initiative',
  'save.str', 'save.dex', 'save.con', 'save.int', 'save.wis', 'save.cha', 'save.death', 'concentration',
  'spell.dc', 'spell.attack', 'hp.max', 'carry', 'speed.fly', 'd20',
  // `opportunity`: whether the creature can make Opportunity Attacks (`autoFail`: it can't; Staggering Blow).
  'opportunity'];
export const OPS = ['add', 'set', 'min', 'max', 'advantage', 'disadvantage', 'autoFail', 'autoSucceed', 'resist', 'vulnerable', 'immune', 'crit',
  // `floor`: a d20 rolled lower than `value` counts as `value` (Reliable Talent, on checks).
  'floor',
  // `proficient` (addition C of docs/specs/homebrew-subclasses.md): proficiency with the one skill or tool its `scope` names, for as long as the lasting effect it is part of
  // holds; the Proficiency Bonus, once, on a check that is not already proficient. Only a modifier step of a subclass feature's action may have it.
  'proficient'];
// Situations the engine knows how to test. All tags in a `when` list must hold.
export const TAGS = ['within5', 'beyond5', 'ranged', 'melee', 'attack.advantage', 'attack.disadvantage', 'target.prone', 'target.unconscious',
  'attacker.unseen', 'target.unseen', 'ally.adjacentToTarget', 'enemy.adjacent', 'long.range', 'target.halfCover', 'target.threeQuartersCover',
  'target.seesSource', 'attack.hit', 'attack.weapon', 'attack.weaponOrUnarmed', 'attack.str', 'attack.spell', 'self.notIncapacitated', 'spell.cantrip',
  // The source or its allies are fighting the target: a fight is on, the target is in it, and it is hostile to the source (Charm Monster).
  'target.fought',
  // An ability check that uses one of the creature's skill or tool proficiencies (Reliable Talent).
  'check.proficient',
  // The attack is an Opportunity Attack (Escape the Horde).
  'attack.opportunity',
  // The target is not a Fiend (Hurl Through Hell's damage).
  'target.notFiend',
  // Grapples (docs/specs/grapple-shove.md, Decisions 2, 5 and 7): the target is not one of the creatures that hold the attacker
  // (the Grappled condition's Disadvantage); the target is held by the attacker (the Grappler feat's Advantage); the check is
  // one made to escape a grapple (Powerful Build).
  'target.notGrappler', 'target.grappledBySelf', 'check.escape'];

// The SRD's creature types, for a target limited to some of them (Turn Undead: `area.types`).
export const CREATURE_TYPES = ['aberration', 'beast', 'celestial', 'construct', 'dragon', 'elemental', 'fey', 'fiend', 'giant', 'humanoid', 'monstrosity', 'ooze', 'plant', 'undead'];

// Things on a map (docs/specs/maps-and-objects.md).
// A door stands on a hex edge or a traced line; a thing stands in a hex; a pile is what lies on the ground in a
// cell: items dropped there (`contents` on the placed object, E17), picked up with `pickUp`, never used.
export const OBJECT_KINDS = ['door', 'thing', 'pile'];
export const OBJECT_BLOCKS = ['move', 'sight'];
export const USE_TIMES = ['free', 'action'];
export const TRIGGERS = ['enter', 'leave', 'near'];
// What sets off a reaction given in data (a spell's, a feature's or a monster trait's `reaction`;
// reactions.js). `hit`: its creature is hit by an attack roll. `cast`: it sees a hostile creature
// within the spell's range casting a spell (Counterspell). `damaged`: it takes damage from a hostile
// creature it can see within the spell's range (Hellish Rebuke). (Leaving reach, for the
// Opportunity Attack, is the engine's own and needs no data.) Features and traits use `hit` only.
export const REACTION_TRIGGERS = ['hit', 'cast', 'damaged'];
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
// `condition`: one condition a `cure` step ends (Lesser Restoration), from `from`.
export const CHOICES = { skill: Object.keys(SKILLS), ability: ABILITIES, damageType: DAMAGE_TYPES, condition: CONDITIONS.filter((c) => c !== 'exhaustion') };
function lintModifier(m, say, rolledOk = false) {      // `rolledOk`: the modifier is a step of a subclass feature's action (`{ rolled: true }`, `proficient`)
  if (!HOOKS.includes(m.on)) say(`modifier on unknown hook "${m.on}"`);
  if (!OPS.includes(m.op)) say(`modifier with unknown op "${m.op}"`);
  // A value is a number, { perLevel: n } for conditions that stack in levels, or for `add`
  // dice ("1d4", "-1d4") rolled each time the modifier applies.
  // `{ rolled: true }` (addition F of docs/specs/homebrew-subclasses.md): the number the damage step just before this one rolled; only a modifier step
  // of a subclass feature's action may have it (`rolledIn` checks the step before it).
  const rolled = !!m.value && typeof m.value === 'object' && !Array.isArray(m.value) && 'rolled' in m.value;
  if (rolled && !rolledOk) say('a modifier value of `{ rolled: true }` is for a modifier step of a subclass feature\'s action, right after its damage step');
  else if (rolled && !(Object.keys(m.value).length === 1 && m.value.rolled === true)) say('a modifier value that is the number rolled is `{ rolled: true }`');
  else if (rolled && m.op !== 'add') say('a modifier value of `{ rolled: true }` goes with the op "add"');
  const numeric = rolled || typeof m.value === 'number' || (m.value && typeof m.value.perLevel === 'number');
  const dice = m.op === 'add' && typeof m.value === 'string' && /^[+-]?\d+d\d+([+-]\d+)?$/.test(m.value);
  if (['add', 'set', 'min', 'max'].includes(m.op) && !numeric && !dice) say(`modifier op "${m.op}" needs a number in \`value\`${m.op === 'add' ? ' (or dice like 1d4)' : ''}`);
  if (m.types !== undefined && !(Array.isArray(m.types) && m.types.every((t) => DAMAGE_TYPES.includes(t) || t === 'chosen'))) say('`types` must be a list of damage types (or "chosen")');
  // `scope` limits a check or a save to one skill or ability; "chosen" is the caster's choice.
  if (m.scope !== undefined) {
    const sc = m.scope;
    // `scope.condition`: a save to avoid or end that condition (Protection from Poison). `scope.tool`: a check made with that tool (addition C: a tool is a kebab-case id such as thieves-tools).
    if (!sc || typeof sc !== 'object' || !Object.keys(sc).length || Object.keys(sc).some((k) => !['skill', 'ability', 'condition', 'tool'].includes(k))) say('`scope` gives a skill, an ability, a tool or a condition');
    else {
      if (sc.tool !== undefined && !((typeof sc.tool === 'string' && sc.tool.length <= 40 && ID.test(sc.tool)) || sc.tool === 'chosen')) say('`scope.tool` is a tool id in kebab-case, such as thieves-tools');
      if (sc.tool !== undefined && m.on !== 'check') say('`scope.tool` is for checks');
      // Nothing fills a chosen tool in but a feature's action that makes the choice (`choice: { of: 'tool', from }`, which `lintActionChoice` holds to it): not a spell, a monster, a feat's grant or an aura.
      if (sc.tool === 'chosen' && !rolledOk) say('`scope.tool: "chosen"` is for a modifier step of a subclass feature\'s action that has a `choice` of a tool: nothing else fills it in');
      if (sc.skill !== undefined && sc.tool !== undefined) say('`scope` names a skill or a tool, not both');
      if (sc.condition !== undefined && !(CONDITIONS.includes(sc.condition) && (m.on === 'save' || m.on.startsWith('save.')))) say('`scope.condition` names a condition, on a save');
      if (sc.skill !== undefined && !(Object.hasOwn(SKILLS, sc.skill) || sc.skill === 'chosen')) say(`unknown skill "${sc.skill}" in scope`);
      if (sc.ability !== undefined && !(ABILITIES.includes(sc.ability) || sc.ability === 'chosen')) say(`unknown ability "${sc.ability}" in scope`);
      if (!['check', 'save'].includes(m.on) && !m.on.startsWith('save.')) say('`scope` is for checks and saves');
    }
  }
  // `against: 'target'`: on a modifier a spell puts on its caster (`to: 'caster'`), it holds only
  // against the spell's target (Hex, Hunter's Mark).
  if (m.against !== undefined && m.against !== 'target') say('`against` is "target" or left out');
  // `uses: 1`: the first roll it applies to uses it up (Guiding Bolt, Vicious Mockery).
  if (m.uses !== undefined && m.uses !== 1) say('`uses` is 1 or left out');
  // `once: 'turn'`: it applies at most once a turn (the Resistance cantrip).
  // On damage.dealt (Divine Strike) it is once on each of the creature's own turns.
  if (m.once !== undefined && !(m.once === 'turn' && ['damage.taken', 'damage.dealt'].includes(m.on) && m.op === 'add')) say('`once: "turn"` is for an add on damage.taken or damage.dealt');
  // `onFail`: dice added only to a D20 Test that failed, where they could turn it (Bardic
  // Inspiration on `d20`, every D20 Test; Peerless Skill on `attack.roll`); `cost` names a feature
  // whose use it spends, only if it succeeds.
  if (m.onFail !== undefined && !(m.onFail === true && m.op === 'add' && ['d20', 'attack.roll', 'save'].includes(m.on))) say('`onFail` is true, on an add to d20, attack.roll or save');
  if (m.cost !== undefined && !(m.onFail === true && ID.test(m.cost))) say('`cost` names a feature, with onFail');
  if (m.on === 'd20' && !m.onFail) say('the d20 hook is for onFail dice');
  if (m.op === 'floor' && !(m.on === 'check' && isInt(m.value) && m.value >= 2 && m.value <= 20)) say('`floor` is on check, with a d20 value');
  if (m.on === 'opportunity' && m.op !== 'autoFail') say('the opportunity hook takes autoFail (no Opportunity Attacks)');
  // `except: 'source'`: on a modifier a creature puts on another, it does not hold for rolls the
  // source itself makes (Sundering Blow: "another creature"). `stack: false`: of several modifiers
  // of one name, only one applies to a roll (and only that one is used up).
  if (m.except !== undefined && !(m.except === 'source' && m.on === 'attack.received')) say('`except` is "source", on attack.received');
  if (m.stack !== undefined && m.stack !== false) say('`stack` is false or left out');
  // `spell`: it holds only for that spell's damage (Agonizing Blast).
  if (m.spell !== undefined && !(ID.test(m.spell) && m.on === 'damage.dealt')) say('`spell` names a spell, on damage.dealt');
  // `proficient` (addition C): proficiency with one skill or tool for as long as the effect lasts. It is nothing but that: no value, no condition, no limit of its own.
  if (m.op === 'proficient') {
    if (!rolledOk) say('the op `proficient` is for a modifier step of a subclass feature\'s action (a feat, an item, a spell, a monster or an always-on grant cannot give proficiency for a time)');
    if (m.on !== 'check') say('`proficient` is on check');
    const sc = m.scope, named = sc && typeof sc === 'object' ? ['skill', 'tool'].filter((k) => sc[k] !== undefined) : [];
    if (!(named.length === 1 && Object.keys(sc).length === 1)) say('`proficient` needs a `scope` that names one skill or one tool (and nothing else)');
    for (const k of Object.keys(m)) if (!['on', 'op', 'scope'].includes(k)) say(`\`proficient\` has no \`${k}\`: it gives proficiency with one skill or tool for as long as its effect lasts`);
  }
  lintWhen(m.when, say);
}
// A zone: the spell's area stays for its duration and its steps go off on a creature that enters
// it (`enter`), or starts or ends its turn there; `once: 'turn'` at most once a turn for each
// creature; `atCast` also on everyone in it as it appears; `spare` lets the caster name creatures
// it leaves alone. An Emanation moves with its caster; other shapes stay where they were laid out.
// A feature's action may carry one too (addition D of docs/specs/homebrew-subclasses.md): `lintZone(action, say, true)`. Its area is
// an Emanation, which moves with the holder, and it needs a duration (a spell's is always given; an action's may be left out).
function lintZone(e, say, action = false) {
  const z = e.zone;
  if (z === undefined) return;
  if (!z || typeof z !== 'object' || Array.isArray(z)) return say('`zone` must be an object');
  for (const k of Object.keys(z)) if (!['on', 'once', 'atCast', 'spare'].includes(k)) say(`\`zone.${k}\` is not something a zone has`);
  if (!(Array.isArray(z.on) && z.on.length && z.on.every((x) => ['enter', 'turnStart', 'turnEnd'].includes(x)) && new Set(z.on).size === z.on.length)) say('`zone.on` lists enter, turnStart and/or turnEnd');
  if (z.once !== undefined && z.once !== 'turn') say('`zone.once` is "turn" or left out');
  for (const k of ['atCast', 'spare']) if (z[k] !== undefined && z[k] !== true) say(`\`zone.${k}\` is true or left out`);
  if (!e.target?.area || e.target.area.count || e.target.area.choose) say('a zone needs a single area to lay out');
  if (e.duration === 'instant' || (action && e.duration === undefined)) say('a zone needs a duration');
  if (action && e.target?.area && e.target.area.shape !== 'emanation') say('the zone of a feature\'s action is an Emanation, which moves with its holder (a spell can lay out any shape)');
}

// `terrain`: the spell's area is Difficult Terrain (`difficult: true`) and/or Heavily or Lightly
// Obscured (`obscured: 'heavy' | 'light'`) while it lasts; an instant spell says how long with
// `lasts: 'nextTurnEnd'` (until the end of the caster's next turn: Ice Storm). An Emanation that
// moves with its caster cannot carry it yet.
function lintTerrain(e, say) {
  const t = e.terrain;
  if (t === undefined) return;
  if (!t || typeof t !== 'object' || !Object.keys(t).length) return say('`terrain` must be an object');
  for (const k of Object.keys(t)) if (!['difficult', 'obscured', 'lasts'].includes(k)) say(`\`terrain.${k}\` is not something terrain has`);
  if (t.difficult !== undefined && t.difficult !== true) say('`terrain.difficult` is true or left out');
  if (t.obscured !== undefined && !['heavy', 'light'].includes(t.obscured)) say('`terrain.obscured` is "heavy" or "light"');
  if (!t.difficult && !t.obscured) say('`terrain` makes the area difficult or obscured');
  if (!e.target?.area || e.target.area.count || e.target.area.choose || e.target.area.shape === 'emanation') say('`terrain` needs a single area that stays where it is laid out');
  if (e.duration === 'instant' ? t.lasts !== 'nextTurnEnd' : t.lasts !== undefined) say('`terrain.lasts` is "nextTurnEnd", for an instant spell only (otherwise it lasts as the spell does)');
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
  walkSteps(e.effects, (st) => { if ('damage' in st && st.type === 'chosen') used.add('damageType'); if (Array.isArray(st.cure) && st.cure.includes('chosen')) used.add('condition'); });
  const c = e.choice;
  if (c !== undefined) {
    if (!c || !Object.hasOwn(CHOICES, c.of)) return say(`\`choice.of\` is one of ${Object.keys(CHOICES).join(', ')}`);
    if (c.from !== undefined && !(Array.isArray(c.from) && c.from.length > 1 && c.from.every((x) => CHOICES[c.of].includes(x)))) say(`\`choice.from\` lists ${c.of} values`);
    if (!used.has(c.of)) say('a choice that no step uses');
  }
  for (const k of used) if (c?.of !== k) say(`a step uses the chosen ${k}, but the spell has no \`choice: { of: "${k}" }\``);
}
const seenCounter = (actions) => { let n = false; for (const a of actions ?? []) walkSteps(a.effects, (st) => { if (st && 'counter' in st) n = true; }); return n; };
function walkSteps(steps, visit) {
  for (const st of Array.isArray(steps) ? steps : []) { visit(st); for (const b of BRANCHES) if (st[b]) walkSteps(st[b], visit); }
}
// A creature's hold (docs/specs/grapple-shove.md, Decision 7), on a condition step of its action: `escape` (the escape DC, on a Grappled
// step), `largest` (the biggest size it holds), `holds` (how many creatures that action's part holds at once), `escapeDis` (Disadvantage
// on the checks to escape), and `whileHeld` (on another condition of the same action: it ends with the hold).
const HOLD_KEYS = ['escape', 'largest', 'holds', 'escapeDis', 'whileHeld'];
// `largest` also goes on any other condition step, in any kind of entry ("if the target is a Medium or smaller creature, it has the
// Prone condition", #495): a bigger target does not get the condition, and the table is told. It is not a hold's, so it is read here
// apart from the rest; a `whileHeld` step takes none, for the hold it follows has its own.
function lintHold(step, say, inMonster) {
  if (step.condition !== 'grappled' && step.largest !== undefined) {
    if (!SIZES.includes(step.largest)) say(`\`largest\` is one of ${SIZES.join(', ')}`);
    if (step.whileHeld !== undefined) say('a `whileHeld` step has no `largest`: the hold it follows has its own');
  }
  const used = HOLD_KEYS.filter((k) => step[k] !== undefined && !(k === 'largest' && step.condition !== 'grappled'));
  if (!used.length && !(inMonster && step.condition === 'grappled')) return;
  if (!inMonster) return say(`\`${used[0]}\` is for a creature's action`);
  if (step.condition === 'grappled') {
    if (step.whileHeld !== undefined) say('`whileHeld` goes on a condition that ends with the grapple, not on Grappled');
    if (step.ends !== undefined) say('a hold has no `ends`: the grapple decides when it ends');
    if (step.escape === undefined) { say('a Grappled step needs `escape`, the escape DC'); return; }
    if (!(isInt(step.escape) && step.escape >= 1 && step.escape <= 40)) say('`escape` is a whole number from 1 to 40');
    if (step.largest !== undefined && !SIZES.includes(step.largest)) say(`\`largest\` is one of ${SIZES.join(', ')}`);
    if (step.holds !== undefined && !(isInt(step.holds) && step.holds >= 1 && step.holds <= 20)) say('`holds` is a whole number from 1 to 20');
    if (step.escapeDis !== undefined && step.escapeDis !== true) say('`escapeDis` is true or left out');
  } else {
    for (const k of ['escape', 'holds', 'escapeDis']) if (step[k] !== undefined) say(`\`${k}\` is for a Grappled step`);
    if (step.whileHeld !== undefined && step.whileHeld !== true) say('`whileHeld` is true or left out');
    if (step.whileHeld !== undefined && step.ends !== undefined) say('a `whileHeld` step has no `ends`: the grapple decides when it ends');
  }
}
// A modifier step whose value is `{ rolled: true }` (addition F): it takes the number the step just before it rolled, so the step before must be a damage
// step of plain dice (`1d8`, no flat part, no `times`, no `when`: one die, rolled once, which both steps then share). One list at a time; the branches are
// their own lists. Null when it is whole, or the sentence of what is wrong. The engine checks the same before it pays (engine/features.js).
export const isRolled = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && 'rolled' in v;
export function rolledIn(steps) {
  if (!Array.isArray(steps)) return null;
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    if (!st || typeof st !== 'object' || !isRolled(st.modifier?.value)) continue;
    const b = steps[i - 1];
    if (!(b && typeof b === 'object' && 'damage' in b)) return 'a modifier whose value is `{ rolled: true }` takes the number the damage step just before it rolled, and the step before it is not a damage step';
    if (!(typeof b.damage === 'string' && /^[1-9]\d*d[1-9]\d*$/.test(b.damage)) || b.times !== undefined || b.when !== undefined) return 'a modifier whose value is `{ rolled: true }` takes the number the damage step just before it rolled, and that step must be plain dice (like 1d8, no flat part) with no `times` and no `when`';
  }
  return null;
}
// Under an `attack` step a Critical Hit doubles the dice of its damage, so the number rolled would be two dice: refused (`rolledProblem` below, `lintSteps`).
const ROLLED_IN_ATTACK = 'a modifier whose value is `{ rolled: true }` cannot be under an `attack` step: a Critical Hit doubles the dice it takes the number from, so it would be two dice, not the one';
// Every rule about where `{ rolled: true }` sits in a list of steps and its branches, for the engine to check data that skipped the gate (engine/features.js): null or a sentence.
export function rolledProblem(steps, inAttack = false) {
  const own = rolledIn(steps);
  if (own || !Array.isArray(steps)) return own;
  for (const st of steps) {
    if (!st || typeof st !== 'object') continue;
    if (inAttack && isRolled(st.modifier?.value)) return ROLLED_IN_ATTACK;
    for (const b of BRANCHES) if (Array.isArray(st[b])) { const p = rolledProblem(st[b], inAttack || 'attack' in st); if (p) return p; }
  }
  return null;
}
// Addition G (docs/specs/homebrew-subclasses.md): `target: { near: N }`, a second creature within N feet of the first target takes the damage steps the action
// BEGINS with: the leading run of damage steps, each plain (no `when`, no `onKill`, no `onZero`), rolled once and shared by the two. What comes after (a modifier on
// the holder, a push, a condition) is for the first target alone. `nearRun` is how many steps that run has; `nearProblem` is null when the list begins with one, or the
// sentence of what is wrong. The gate and the engine (engine/features.js, which checks before it pays) read the same two.
export function nearRun(steps) {
  let n = 0;
  if (Array.isArray(steps)) while (n < steps.length && steps[n] && typeof steps[n] === 'object' && 'damage' in steps[n]) n++;
  return n;
}
export function nearProblem(steps) {
  const n = nearRun(steps);
  if (!n) return 'a second target near the first takes the damage steps the action begins with, and its first step is not a damage step';
  for (let i = 0; i < n; i++) if (steps[i].when !== undefined || steps[i].onKill !== undefined || steps[i].onZero !== undefined) return 'a second target near the first takes the damage steps the action begins with, and those must have no `when`, `onKill` or `onZero`';
  return null;
}
function lintSteps(steps, say, seen = { manual: false }, under = false, inMonster = false) {
  if (!Array.isArray(steps) || !steps.length) { say('effects must be a non-empty list'); return seen; }
  { const p = rolledIn(steps); if (p) say(p); }
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
      // `advantageIf: [tags]`: the attack roll has Advantage when every tag holds ("with Advantage if the target is Grappled by the
      // bugbear", docs/specs/grapple-shove.md, Decision 7). For a creature's action: a spell attack takes its Advantage from modifiers.
      if (step.advantageIf !== undefined) {
        if (!(Array.isArray(step.advantageIf) && step.advantageIf.length)) say('`advantageIf` lists situation tags'); else lintWhen(step.advantageIf, say);
        if (!inMonster) say('`advantageIf` on an attack is for a creature\'s action');
      }
    }
    if (kind === 'save') {
      if (!ABILITIES.includes(step.save)) say(`save uses unknown ability "${step.save}"`);
      if (!step.onFail && !step.onSuccess) say('a save step needs onFail or onSuccess');
      if (step.dc !== undefined && !(isInt(step.dc) && step.dc > 0)) say('a save step\'s dc is a whole number');
      // `advantageIf: [tags]`: the target has Advantage on this save when every tag holds ("if you or your allies are fighting it").
      if (step.advantageIf !== undefined) { if (!(Array.isArray(step.advantageIf) && step.advantageIf.length)) say('`advantageIf` lists situation tags'); else lintWhen(step.advantageIf, say); }
    }
    if (kind === 'damage') {
      if (!isDice(step.damage)) say(`damage "${step.damage}" is not dice like 2d6+3`);
      if (!DAMAGE_TYPES.includes(step.type) && step.type !== 'chosen') say(`unknown damage type "${step.type}"`);
      if (step.times !== undefined && !(isInt(step.times) && step.times > 0)) say('`times` must be a positive whole number');
    }
    if (kind === 'heal' && !isDice(step.heal)) say(`heal "${step.heal}" is not dice like 2d8`);
    if (kind === 'tempHp' && !isDice(step.tempHp)) say(`tempHp "${step.tempHp}" is not dice like 2d4+4`);
    if ((kind === 'heal' || kind === 'tempHp') && step.addMod !== undefined && step.addMod !== true) say('`addMod` is true or left out');
    if ((kind === 'heal' || kind === 'tempHp') && step.atLeast !== undefined && !(isInt(step.atLeast) && step.atLeast > 0)) say('`atLeast` is the fewest Hit Points a heal (or Temporary Hit Points a tempHp step: Tireless) gives');
    if (kind === 'condition' && !CONDITIONS.includes(step.condition)) say(`unknown condition "${step.condition}"`);
    if (kind === 'condition') lintHold(step, say, inMonster);
    else for (const k of HOLD_KEYS) if (step[k] !== undefined && !(k === 'largest' && kind === 'move')) say(`\`${k}\` is for a condition step`);
    if (kind === 'move' && step.largest !== undefined && !SIZES.includes(step.largest)) say(`\`largest\` is one of ${SIZES.join(', ')}`);
    // What ends a condition or a modifier on its own: a turn boundary of the target or the source
    // ("until the end of your next turn"), or a repeat save.
    if (kind === 'condition' || kind === 'modifier') {
      const ends = step.ends;
      if (ends !== undefined) {
        if (!['turnStart', 'turnEnd', 'save', 'damaged'].includes(ends?.on)) say('`ends.on` must be turnStart, turnEnd, save or damaged');
        // `at: 'damaged'`: the save is repeated whenever the creature takes damage (Dominate Monster).
        if (ends?.on === 'save' && !(ABILITIES.includes(ends.save) && ['turnStart', 'turnEnd', 'damaged'].includes(ends.at))) say('a condition that ends on a save needs `save` (an ability) and `at` (turnStart, turnEnd or damaged)');
        // `by: 'source'` on `damaged`: only damage from the source or its allies ends it (Charm Monster).
        if (ends?.by !== undefined && !(ends.by === 'source' && ends.on === 'damaged')) say('`ends.by` is "source", on an ending `on: "damaged"`');
        if (ends?.of !== undefined && !['target', 'source'].includes(ends.of)) say('`ends.of` must be target or source');
        // `orDamaged: true`: it also ends when its creature takes any damage (Knock Out: a repeated save, or damage).
        if (ends?.orDamaged !== undefined && !(ends.orDamaged === true && ends.on === 'save')) say('`ends.orDamaged` is true, on an ending on a save');
      }
    }
    if (kind === 'modifier') {
      lintModifier(step.modifier ?? {}, say, seen.rolledOk === true);
      if (seen.inAttack && isRolled(step.modifier?.value)) say(ROLLED_IN_ATTACK);
      if (step.to !== undefined && step.to !== 'caster') say('a modifier step\'s `to` is "caster" or left out');
      if (step.modifier?.against !== undefined && step.to !== 'caster') say('`against: "target"` is for a modifier put on the caster (`to: "caster"`)');
    }
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
    // `counter: "spell"`: the spell that set this reaction off fails (Counterspell; only in a spell
    // whose reaction is `cast`).
    if (kind === 'counter') { seen.counter = true; if (step.counter !== 'spell') say('`counter` must be "spell"'); }
    if (kind === 'manual') { seen.manual = true; if (!isText(step.manual)) say('a manual step needs text saying what the DM applies'); }
    // `teleport: feet`: the creature it works on (the caster: only a spell aimed at its caster may
    // have one) goes to the place the caster names within that many feet; `see: true`, a place it
    // can see; `blocked`: steps run on it instead if that place turns out occupied.
    if (kind === 'teleport') {
      seen.teleport = true;
      if (!(isInt(step.teleport) && step.teleport > 0 && step.teleport % 5 === 0)) say('`teleport` must be a distance in feet, a multiple of 5');
      if (step.see !== undefined && step.see !== true) say('`see` is true or left out');
    }
    if (step.blocked !== undefined && kind !== 'teleport') say('`blocked` is for a teleport step');
    // `summon`: the caster makes creatures in unoccupied spaces it names, bound to it (docs/specs/companions.md,
    // Decision 2). What it names is checked against the pack in lintPack; its place in a spell in lintSpell.
    if (kind === 'summon') { (seen.summons ??= []).push(step); lintSummonStep(step, say); }
    if (step.plus !== undefined) say('`plus` (an amount added to dice) is for a summon block');
    // `cure: [conditions]`: the conditions end on the creature it works on (Heal); "chosen" is one
    // the caster picks from the spell's `choice: { of: 'condition', from }` (Lesser Restoration).
    // Exhaustion is not ended this way: a spell lowers it by levels.
    if (kind === 'cure' && !(Array.isArray(step.cure) && step.cure.length && new Set(step.cure).size === step.cure.length && step.cure.every((c) => c === 'chosen' || (CONDITIONS.includes(c) && c !== 'exhaustion')))) say('`cure` lists conditions (not exhaustion), or "chosen"');
    for (const b of ['onZero', 'onKill']) if (step[b] !== undefined && kind !== 'damage') say(`\`${b}\` is for a damage step`);
    // `kill: true`: the creature dies, a character at 0 Hit Points too; `remains`: what is left of
    // the body. Both only under a damage step's onZero or onKill, where the damage brought it there.
    if ((kind === 'kill' || kind === 'remains') && !under) say(`a \`${kind}\` step goes under a damage step's onZero or onKill`);
    if (kind === 'kill' && step.kill !== true) say('`kill` is true');
    // `endConcentration: true`: the creature loses Concentration on whatever it holds (Sleet Storm).
    if (kind === 'endConcentration' && step.endConcentration !== true) say('`endConcentration` is true');
    if (kind === 'remains' && !REMAINS.includes(step.remains)) say(`\`remains\` is one of ${REMAINS.join(', ')}`);
    const was = seen.inAttack;
    if (kind === 'attack') seen.inAttack = true;
    for (const branch of BRANCHES) if (step[branch]) lintSteps(step[branch], say, seen, under || branch === 'onZero' || branch === 'onKill', inMonster);
    seen.inAttack = was;
  }
  return seen;
}
// ---------- the summon step and summon blocks (docs/specs/companions.md, Decisions 1, 2 and 5) ----------
// What a bond made by a spell may say. The lists are Decision 1's (engine/companions.js keeps the same; a test
// holds them equal). Not yet run by the engine, so refused here rather than kept and not played: a turn of
// none (stages C5, C6), riding (C6). One per master (`one`) runs since C5c: `reform`, a new casting gives the one
// the master has a new form (Find Familiar), or `replace`, the new one replaces it (Find Steed). Commands with their range and corpses run since C5b
// (#340): `on: 'corpse'` (Decision 7) with `reassert`, the most creatures a casting takes back under control
// (Animate Dead's "up to four", two more per slot level; the C5b amendment), and a bond's `orders: 'command'`
// with its command `range` in feet.
export const SUMMON_KINDS = ['familiar', 'steed', 'summon', 'undead', 'object', 'servant', 'pet'];
export const SUMMON_TURNS = ['own', 'after'];
export const SUMMON_ENDS = ['masterDies', 'longRest'];
const SUMMON_STEP_KEYS = ['summon', 'forms', 'types', 'variants', 'count', 'reassert', 'on', 'over', 'one', 'bond'];
// One per master (C5c): a new casting while the master has one of this spell's creatures of the step's kind.
export const SUMMON_ONE = ['reform', 'replace'];
const SUMMON_BOND_KEYS = ['kind', 'turn', 'orders', 'range', 'at0', 'ends', 'leash', 'noAttack', 'mount'];
const SUMMON_LATER = { mount: 'a controlled mount is said in its `bond` (`mount: "controlled"`)' };
// A summon amount of creatures: a whole number from 1 to SUMMON_MOST, or { slot, base?, above? } (checked at every level in lintSpell).
const okCount = (c) => (isInt(c) && c >= 1 && c <= SUMMON_MOST)
  || (!!c && typeof c === 'object' && !Array.isArray(c) && isInt(c.slot) && c.slot > 0 && Object.keys(c).every((k) => ['slot', 'base', 'above'].includes(k))
    && (c.base === undefined || isInt(c.base)) && (c.above === undefined || isInt(c.above)));
// The most creatures one casting makes (the cap of a master's companions, owner's question 7).
export const SUMMON_MOST = 30;
function lintSummonStep(st, say) {
  for (const k of Object.keys(st)) if (!SUMMON_STEP_KEYS.includes(k)) say(SUMMON_LATER[k] ? `a summon step: ${SUMMON_LATER[k]}` : `a summon step has no "${k}"`);
  if (st.forms !== undefined) {
    if (st.summon !== 'form') say('a summon step with `forms` says `summon: "form"`: the caster picks one');
    const f = st.forms;
    const list = Array.isArray(f) && f.length > 0 && f.length <= 40 && f.every((x) => ID.test(x ?? '')) && new Set(f).size === f.length;
    const filter = !!f && !Array.isArray(f) && typeof f === 'object' && Object.keys(f).length === 2 && CREATURE_TYPES.includes(f.type) && typeof f.cr === 'number' && f.cr >= 0;
    if (!list && !filter) say('`forms` lists pack monsters, or is { type, cr }');
  } else if (!ID.test(st.summon ?? '') || st.summon === 'form') say('`summon` names a summon block or a pack monster');
  if (st.types !== undefined && !(allOf(CREATURE_TYPES)(st.types) && st.types.length >= 1 && new Set(st.types).size === st.types.length)) say('`types` lists creature types the caster picks from');
  if (st.variants !== undefined && !(Array.isArray(st.variants) && st.variants.length >= 2 && st.variants.every((x) => ID.test(x ?? '')) && new Set(st.variants).size === st.variants.length)) say('`variants` lists the choices the caster picks from');
  if (st.on !== undefined && !['space', 'corpse'].includes(st.on)) say('`on` is "space" or "corpse"');
  if (st.count !== undefined) {
    if (st.on === undefined) say('`count` goes with `on`');
    if (!okCount(st.count)) say(`\`count\` is a whole number from 1 to ${SUMMON_MOST}, or { slot, base?, above? }`);
  }
  // On corpses (Decision 7): the caster names dead Medium or Small Humanoids, each made into the one creature the step
  // names, or its own creatures of this spell to take back under control (`reassert`, as many as `count` if left out).
  // Nothing to pick but the corpses: no forms, variants, types or `over`. The bond takes commands with a range.
  if (st.reassert !== undefined) {
    if (st.on !== 'corpse') say('`reassert` is for a summon step on corpses');
    if (!okCount(st.reassert)) say(`\`reassert\` is a whole number from 1 to ${SUMMON_MOST}, or { slot, base?, above? }`);
  }
  if (st.on === 'corpse') {
    for (const k of ['forms', 'types', 'variants', 'over']) if (st[k] !== undefined) say(`a summon step on corpses has no \`${k}\`: the caster names the corpses only`);
    if (st.bond && typeof st.bond === 'object' && st.bond.orders !== 'command') say('a summon step on corpses makes creatures that take commands (`orders: "command"`)');
  }
  // One per master (C5c): the step makes one creature in a space, and a new casting reforms (`reform`: the one the master
  // has takes the form picked, so the step picks forms) or replaces (`replace`) the one it has.
  if (st.one !== undefined) {
    if (!SUMMON_ONE.includes(st.one)) say(`\`one\` is ${SUMMON_ONE.join(' or ')}`);
    if (st.on === 'corpse') say('a summon step on corpses has no `one`: the caster names the corpses');
    else if (st.count !== undefined && st.count !== 1) say('a summon step with `one` makes one creature');
    if (st.one === 'reform' && st.forms === undefined) say('`one: "reform"` gives the creature a new form: the step lists `forms`');
  }
  // `over`: fields replaced on the made creature. Only its speeds so far (Phantom Steed's Speed 100).
  if (st.over !== undefined && !(st.over && typeof st.over === 'object' && Object.keys(st.over).length === 1 && st.over.speed
    && Object.keys(st.over.speed).length && Object.entries(st.over.speed).every(([m, v]) => MOVE_MODES.includes(m) && isInt(v) && v >= 0 && v % 5 === 0))) say('`over` replaces { speed: { walk, fly, ... } } on the made creature, in feet');
  const b = st.bond;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return say('a summon step needs `bond`: { kind, turn, orders?, range?, at0, ends?, leash?, noAttack? }');
  for (const k of Object.keys(b)) if (!SUMMON_BOND_KEYS.includes(k)) say(SUMMON_LATER[k] ? `a summon bond: ${SUMMON_LATER[k]}` : `a summon bond has no "${k}"`);
  if (!SUMMON_KINDS.includes(b.kind)) say(`a summon bond's kind is one of ${SUMMON_KINDS.join(', ')}`);
  if (!SUMMON_TURNS.includes(b.turn)) say(b.turn === 'none' ? 'a summon bond with no turn of its own comes with stages C5 and C6' : `a summon bond's turn is one of ${SUMMON_TURNS.join(', ')}`);
  if (b.orders !== undefined && !['free', 'command'].includes(b.orders)) say('a summon bond\'s orders are "free" or "command"');
  // A command reaches so many feet from the master (60 for Animate Dead, 120 for Create Undead): given with commands, and only then.
  if (b.orders === 'command' && !(isInt(b.range) && b.range > 0 && b.range % 5 === 0 && b.range <= 5280)) say('a summon bond that takes commands says how far they reach: `range` in feet, a multiple of 5');
  if (b.orders !== 'command' && b.range !== undefined) say('a summon bond\'s `range` is for one that takes commands (`orders: "command"`)');
  if (!['vanish', 'dies'].includes(b.at0)) say('a summon bond says what 0 Hit Points does: `at0` vanish or dies');
  if (b.ends !== undefined && !(allOf(SUMMON_ENDS)(b.ends) && b.ends.length && new Set(b.ends).size === b.ends.length)) say(`a summon bond's \`ends\` lists ${SUMMON_ENDS.join(', ')}`);
  if (b.leash !== undefined && !(isInt(b.leash) && b.leash > 0 && b.leash % 5 === 0 && b.leash <= 5280)) say('a summon bond\'s `leash` is feet, a multiple of 5');
  if (b.noAttack !== undefined && b.noAttack !== true) say('`noAttack` is true or left out');
  // `mount: 'controlled'`: the creature serves its master as a controlled mount (Find Steed: "it functions as a controlled
  // mount while you ride it"; docs/specs/companions.md, Decision 8, stage C6b). Free orders only: one that takes commands
  // is never a controlled mount (C6a, fix round 1, M3).
  if (b.mount !== undefined && b.mount !== 'controlled') say('a summon bond\'s `mount` is "controlled", or left out');
  if (b.mount !== undefined && b.orders === 'command') say('a summon bond that takes commands is never a controlled mount');
}

// A summon block: the monster format with summon amounts (summons.js). Baked at every spell level it can be
// cast at, with each variant and type, every result must pass the monster linter (cr null, XP 0). Class
// amounts ({ column }, { mod }, ...) are refused here, as summon amounts are in monsters.
const CLASS_AMOUNT_KEYS = ['column', 'mod', 'perLevel', 'byLevel', 'prof', 'die'];
const DUMMY_CASTER = { attack: 7, dc: 15, pb: 3, mod: 4 };
function walkValues(v, visit, path = '') {
  visit(v, path);
  if (Array.isArray(v)) v.forEach((x, i) => walkValues(x, visit, `${path}[${i}]`));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walkValues(x, visit, `${path}.${k}`);
}
function lintSummonBlock(e, say) {
  const fn = findFunction(e);
  if (fn) return say(`contains a function at ${fn}; content is data only`);
  if (!ID.test(e.id ?? '')) say(`id "${e.id}" must be kebab-case`);
  if (!(isInt(e.level) && e.level >= 1 && e.level <= 9)) say('`level` is the lowest spell level the block is cast at, 1 to 9');
  for (const k of ['variants', 'types']) if (e[k] !== undefined && !(Array.isArray(e[k]) && e[k].length >= 2 && e[k].every((x) => ID.test(x ?? '')) && new Set(e[k]).size === e[k].length)) say(`\`${k}\` lists the choices the block reads`);
  if (e.types !== undefined && !allOf(CREATURE_TYPES)(e.types)) say('`types` lists creature types');
  if (e.cr !== undefined || e.xp !== undefined) say('a summon block has no cr or xp of its own: baked, it is CR none, XP 0');
  walkValues(e, (v, path) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return;
    if (Object.keys(v).length && Object.keys(v).every((k) => CLASS_AMOUNT_KEYS.includes(k) || k === 'min')) say(`${path}: class amounts are for class features, not summon blocks`);
    if (isByAmount(v)) {
      const of = v.by === 'variant' ? e.variants : v.by === 'type' ? e.types : null;
      if (!of) say(`${path}: a summon amount by ${v.by} needs the block's ${v.by === 'type' ? 'types' : 'variants'}`);
      else for (const k of Object.keys(v)) if (k !== 'by' && !of.includes(k)) say(`${path}: "${k}" is not one of the block's ${v.by === 'type' ? 'types' : 'variants'}`);
    }
    if (isCasterAmount(v) && !CASTER_AMOUNTS.includes(v.caster)) say(`${path}: a caster amount is one of ${CASTER_AMOUNTS.join(', ')}`);
    if (v.only !== undefined) {
      const o = v.only;
      if (!o || typeof o !== 'object' || !Object.keys(o).length || !Object.keys(o).every((k) => ['variant', 'type', 'slot'].includes(k))) say(`${path}: \`only\` is { variant?, type?, slot? }`);
      else {
        if (o.variant !== undefined && !(Array.isArray(o.variant) && o.variant.length && o.variant.every((x) => (e.variants ?? []).includes(x)))) say(`${path}: \`only.variant\` lists the block's variants`);
        if (o.type !== undefined && !(Array.isArray(o.type) && o.type.length && o.type.every((x) => (e.types ?? []).includes(x)))) say(`${path}: \`only.type\` lists the block's types`);
        if (o.slot !== undefined && !(isInt(o.slot) && o.slot >= 1 && o.slot <= 9)) say(`${path}: \`only.slot\` is a spell level`);
      }
    }
  });
  if ((e.traits ?? []).some((t) => t.modifiers?.length || t.reaction)) say('a summon block\'s traits are text for now: the engine reads trait modifiers and reactions from pack monsters only');
  if (!(e.variants?.length || e.types?.length || e.level)) return;
  for (const c of castings(e)) {
    const label = `baked at level ${c.slot}${c.variant ? `, ${c.variant}` : ''}${c.type ? `, ${c.type}` : ''}`;
    let t;
    try { t = bake(e, { ...c, caster: DUMMY_CASTER }); } catch (err) { say(`${label}: ${err.message}`); continue; }
    lintMonster(t, (m) => say(`${label}: ${m}`), true);
  }
}
// The template a summon block bakes to, linted as a monster (its cr is null).
export function lintBaked(t) { const out = []; lintMonster(t, (m) => out.push(m), true); return out; }
// Summon amounts and `only` are for summon blocks: a monster (or a baked template) holds plain numbers.
function lintNoSummonAmounts(e, say) {
  walkValues(e, (v, path) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return;
    if (isAmount(v)) say(`${path}: summon amounts are for summon blocks`);
    else if (v.only !== undefined) say(`${path}: \`only\` is for summon blocks`);
  });
}

function lintTarget(target, say, nearOk = false) {
  if (!target || typeof target !== 'object') return say('needs a target');
  const kinds = ['self', 'creature', 'area'].filter((k) => k in target);
  if (kinds.length !== 1) return say('target needs exactly one of self, creature, area');
  // `near` (addition G): a second creature near the first target, for the action of a subclass's feature alone (`lintNear` holds the rest).
  if (target.near !== undefined && !nearOk) say('`near` (a second target near the first) is for the action of a subclass\'s feature, not a spell, a monster or an object');
  if (target.area) {
    if (!AREA_SHAPES.includes(target.area.shape)) say(`unknown area shape "${target.area.shape}"`);
    if (!(target.area.size > 0)) say('an area needs a size in feet');
    // How far away a monster's sphere or cylinder may be centred (a spell's range says it for a spell).
    if (target.area.range !== undefined && !(isInt(target.area.range) && target.area.range > 0 && target.area.range % 5 === 0)) say('an area\'s range is feet, a multiple of 5');
    // A Line's width in feet (5 when not given); `exceptCaster` for "each creature other than you".
    if (target.area.width !== undefined && !(target.area.shape === 'line' && isInt(target.area.width) && target.area.width > 0 && target.area.width % 5 === 0)) say('`width` is for a line: feet, a multiple of 5');
    if (target.area.exceptCaster !== undefined && target.area.exceptCaster !== true) say('`exceptCaster` is true or left out');
    // `types`: only creatures of these types in the area are affected (Turn Undead's Undead).
    if (target.area.types !== undefined && !(allOf(CREATURE_TYPES)(target.area.types) && target.area.types.length)) say('`types` lists creature types');
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

// A saving throw is made by the creatures a spell affects. A spell aimed at its caster that has a
// save step is almost always wrong, so the linter flags it. Each exception here has a one-line
// reason; an exception that no longer applies is flagged too, so this list cannot go stale.
const SELF_SAVE_EXCEPTIONS = {
  'contact-other-plane': 'flagged, awaiting review: the SRD save is the caster\'s own, so this may be a valid self-save rather than an error',
};
function lintSelfSave(e, say) {
  let hasSave = false;
  walkSteps(e.effects, (st) => { if ('save' in st) hasSave = true; });
  const selfSave = Boolean(e.target?.self) && hasSave;
  const exempt = Object.hasOwn(SELF_SAVE_EXCEPTIONS, e.id);
  if (selfSave && !exempt) say('a spell aimed at its caster has a saving throw step; the save belongs to the creatures it affects, so aim it at them (or list it in SELF_SAVE_EXCEPTIONS with a reason)');
  if (exempt && !selfSave) say('is in SELF_SAVE_EXCEPTIONS but is no longer a self-targeted spell with a save; remove it from the list');
}

function lintSpell(e, say) {
  lintCommon(e, say);
  if (!(isInt(e.level) && e.level >= 0 && e.level <= 9)) say('level must be 0 to 9');
  if (!SCHOOLS.includes(e.school)) say(`unknown school "${e.school}"`);
  if (!CAST_TIMES.includes(e.time)) say(`unknown casting time "${e.time}"`);
  if (!(e.range === 'self' || e.range === 'touch' || e.range > 0)) say('range must be "self", "touch" or a number of feet');
  if (!allOf(['v', 's', 'm'])(e.components)) say('components must be a list drawn from v, s, m');
  // `costly`: its Material component has a cost given in the spell or is consumed by it (Subtle Spell keeps such a component).
  if (e.costly !== undefined && !(e.costly === true && e.components?.includes('m'))) say('`costly: true` is for a spell whose Material component has a cost or is consumed');
  if (!isDuration(e.duration)) say('duration must be \"instant\", a number of rounds, minutes, hours or days (\"10 minutes\"), \"until dispelled\" or \"special\"');
  if (typeof e.concentration !== 'boolean' || typeof e.ritual !== 'boolean') say('concentration and ritual must be true or false');
  if (!Array.isArray(e.classes)) say('classes must be a list');
  lintTarget(e.target, say);
  lintHigher(e, say);
  lintChoice(e, say);
  lintZone(e, say);
  lintTerrain(e, say);
  if (e.reaction !== undefined) {
    // A spell cast as a Reaction by standing instruction: { on, blocks? }. `blocks` names spells
    // whose being aimed at the caster also sets it off, and which then do the caster no damage
    // while it lasts (Shield and Magic Missile). One set off by being hit is aimed at its caster;
    // one set off by another creature (`cast`, `damaged`) is aimed at that one creature.
    const r = e.reaction;
    if (e.time !== 'reaction') say('`reaction` is for a spell cast as a Reaction');
    if (!r || typeof r !== 'object' || !Object.keys(r).every((k) => ['on', 'blocks'].includes(k)) || !REACTION_TRIGGERS.includes(r.on)) say(`\`reaction\` is { on: ${REACTION_TRIGGERS.join(' | ')}, blocks? }`);
    if (r?.blocks !== undefined && !(Array.isArray(r.blocks) && r.blocks.length && r.blocks.every((x) => ID.test(x)))) say('`reaction.blocks` lists spell ids');
    if (r?.on === 'hit' && !e.target?.self) say('a reaction spell set off by a hit is aimed at its caster');
    if (r && r.on !== 'hit') {
      if (!(e.target?.creature && (e.target.creature.count ?? 1) === 1)) say(`a reaction spell set off by \`${r.on}\` is aimed at the one creature that set it off`);
      if (r.blocks !== undefined) say('`reaction.blocks` is for a spell set off by a hit');
      if (typeof e.range !== 'number') say(`a reaction spell set off by \`${r.on}\` needs a range in feet`);
    }
  }
  lintSelfSave(e, say);
  // `kinds`: what the spell is for, tagged by hand (E12, amended 15 November 2026): one to four of SPELL_KINDS,
  // no repeats, in the fixed order of SPELL_KINDS.
  if (e.kinds !== undefined) {
    const k = e.kinds;
    if (!(Array.isArray(k) && k.length >= 1 && k.length <= SPELL_KINDS.length && k.every((x) => SPELL_KINDS.includes(x))
      && new Set(k).size === k.length && k.every((x, i) => i === 0 || SPELL_KINDS.indexOf(k[i - 1]) < SPELL_KINDS.indexOf(x)))) {
      say(`\`kinds\` is a list of one to four of ${SPELL_KINDS.join(', ')}, no repeats, in that order`);
    }
  }
  const seen = lintSteps(e.effects, say);
  if (seen.counter && e.reaction?.on !== 'cast') say('a `counter` step is for a spell cast as a Reaction to a spell being cast');
  if (seen.teleport && !(e.target?.self && e.effects.some((st) => 'teleport' in st))) say('a `teleport` step is for a spell aimed at its caster, in its own list of steps');
  if (e.tier === 'auto' && seen.manual) say('marked auto but contains a manual step');
  if (e.tier === 'manual' && !seen.manual) say('marked manual but has no manual step');
  // A summon step works from the caster, on spaces it names within the spell's range: one, in the spell's own
  // list of steps (not under a roll), in a spell aimed at its caster with a range in feet.
  if (seen.summons) {
    if (seen.summons.length > 1 || !e.effects.some((st) => 'summon' in st)) say('a spell has one summon step, in its own list of steps');
    if (!e.target?.self) say('a spell with a summon step is aimed at its caster (`target: { self: true }`); the spaces are named when it is cast');
    if (!(isInt(e.range) && e.range > 0)) say('a spell with a summon step needs a range in feet');
    if (e.reaction !== undefined || e.zone !== undefined) say('a summon step is not for a reaction or a zone');
    // A `count` that grows with the slot makes 1 to SUMMON_MOST creatures at every level the spell can be cast at.
    for (const field of ['count', 'reassert']) {
      const c = seen.summons[0][field];
      if (c && typeof c === 'object' && isInt(e.level)) for (let l = Math.max(1, e.level); l <= 9; l++) {
        const n = (c.base ?? 0) + c.slot * (l - (c.above ?? 0));
        if (!(isInt(n) && n >= 1 && n <= SUMMON_MOST)) { say(`a summon step's \`${field}\` makes ${n} creatures at level ${l}: it must be 1 to ${SUMMON_MOST} at every level the spell is cast at`); break; }
      }
    }
  }
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
    for (const k of Object.keys(h.slot ?? {})) if (!['damage', 'heal', 'tempHp', 'times', 'targets', 'value'].includes(k)) say(`\`higher.slot.${k}\` is not something a spell can grow by`);
    for (const k of ['damage', 'heal', 'tempHp']) if (h.slot[k] !== undefined && !isDice(h.slot[k])) say(`\`higher.slot.${k}\` must be dice`);
    for (const k of ['times', 'targets', 'value']) if (h.slot[k] !== undefined && !(isInt(h.slot[k]) && h.slot[k] > 0)) say(`\`higher.slot.${k}\` must be a positive whole number`);
    if (h.slot.targets !== undefined && !e.target?.creature && !e.target?.area?.choose) say('`higher.slot.targets` is for a spell aimed at creatures');
  }
}
const SENSES = ['darkvision', 'blindsight', 'tremorsense', 'truesight'];
// A senses map gives a range in feet, a multiple of 5, for some of the four special senses.
const validSenses = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.entries(v).every(([k, f]) => SENSES.includes(k) && isInt(f) && f >= 0 && f <= 1000 && f % 5 === 0);
// The animals the SRD sells as mounts ("Mounts and Other Animals", SRD 5.2.1 22627-22680): Camel, Elephant, Draft
// Horse, Riding Horse, Mastiff, Mule, Pony, Warhorse. "Domesticated horses, mules, and similar creatures" are trained
// to accept a rider; "appropriate anatomy" for any other creature is the DM's (who may send `mount` for it).
export const MOUNTS = ['camel', 'elephant', 'draft-horse', 'riding-horse', 'mastiff', 'mule', 'pony', 'warhorse'];
// `baked`: a template made from a summon block (summons.js), whose CR is none (`cr: null`) and XP 0.
function lintMonster(e, say, baked = false) {
  lintCommon(e, say);
  lintNoSummonAmounts(e, say);
  if (!SIZES.includes(e.size)) say(`unknown size "${e.size}"`);
  if (!isText(e.type)) say('needs a creature type');
  if (baked ? !(e.cr === null && e.xp === 0) : !(typeof e.cr === 'number' && e.cr >= 0)) say(baked ? 'a baked summon block has cr null and xp 0' : 'cr must be a number');
  if (!(isInt(e.xp) && e.xp >= 0)) say('xp must be a whole number of Experience Points');
  for (const k of ['ac', 'hp', 'pb']) if (!(isInt(e[k]) && e[k] > 0)) say(`${k} must be a positive whole number`);
  if (!e.speed || !Object.keys(e.speed).length || !Object.entries(e.speed).every(([m, v]) => MOVE_MODES.includes(m) && v >= 0)) say(`speed must give feet for one or more of: ${MOVE_MODES.join(', ')}`);
  if (!e.abilities || !ABILITIES.every((a) => isInt(e.abilities[a]))) say('abilities must give all six scores');
  for (const k of ['resist', 'vulnerable', 'immune']) if (!allOf(DAMAGE_TYPES)(e[k])) say(`${k} must be a list of damage types`);
  if (e.senses !== undefined && !validSenses(e.senses)) say(`senses must give whole feet, in multiples of 5, for only: ${SENSES.join(', ')}`);
  // `saves` is the SAVE column of the stat block: a whole-number bonus for the abilities whose saving throw differs from the plain modifier.
  if (e.saves !== undefined && !(e.saves && typeof e.saves === 'object' && !Array.isArray(e.saves) && Object.keys(e.saves).length > 0 && Object.entries(e.saves).every(([k, v]) => ABILITIES.includes(k) && isInt(v) && v >= -10 && v <= 30))) say(`saves must give a whole-number bonus for one or more of: ${ABILITIES.join(', ')}`);
  // `initiative` is the stat block's Initiative modifier, which can differ from Dexterity (it adds Proficiency for some monsters).
  if (e.initiative !== undefined && !(isInt(e.initiative) && e.initiative >= -10 && e.initiative <= 40)) say('initiative must be a whole number, the stat block\'s Initiative modifier');
  // `languages` is the stat block's Languages line, one piece of text per language or ability to speak (an empty list: none). Data only: the engine does not use it.
  if (e.languages !== undefined && !(Array.isArray(e.languages) && e.languages.length <= 12 && e.languages.every((x) => isText(x) && x.length <= 120))) say('languages must be a list of short texts (empty for none)');
  if (e.skills !== undefined && !(e.skills && Object.entries(e.skills).every(([k, v]) => Object.hasOwn(SKILLS, k) && isInt(v)))) say('skills must give a whole-number bonus for each skill named');
  // `mount: 'trained'`: an animal trained to accept a rider, so a rider on its side controls it (SRD "Controlling a
  // Mount"; docs/specs/companions.md, Decision 8). Only the eight the SRD sells as mounts carry it (MOUNTS).
  if (e.mount !== undefined && e.mount !== 'trained') say('mount is "trained" (an animal trained to accept a rider), or left out');
  if (e.mount !== undefined && !baked && !MOUNTS.includes(e.id)) say(`mount: "trained" is only for the animals the SRD sells as mounts (${MOUNTS.join(', ')})`);
  const ids = new Set();
  for (const t of e.traits ?? []) {
    const sub = (m) => say(`trait ${t.id}: ${m}`);
    if (!ID.test(t.id ?? '')) sub('id must be kebab-case');
    if (!isText(t.name) || !isText(t.text)) sub('needs a name and text');
    if (!Array.isArray(t.modifiers)) sub('needs a modifiers list (it may be empty)');
    else for (const m of t.modifiers) lintModifier(m, sub);
    // A Reaction the engine takes by standing instruction: { on: 'hit', ac, attack?, manual? }.
    // `ac` is added to its Armor Class against the attack that hit (Parry); `attack` limits it to
    // melee or ranged attack rolls; `manual` is the rest of it, told to the DM when it is taken.
    if (t.reaction !== undefined) {
      const r = t.reaction;
      if (!r || typeof r !== 'object' || !Object.keys(r).every((k) => ['on', 'ac', 'attack', 'manual'].includes(k))) sub('reaction is { on: "hit", ac, attack?, manual? }');
      else {
        if (r.on !== 'hit') sub('reaction.on is "hit"');
        if (!(isInt(r.ac) && r.ac > 0 && r.ac <= 10)) sub('reaction.ac is a whole number from 1 to 10');
        if (r.attack !== undefined && !['melee', 'ranged'].includes(r.attack)) sub('reaction.attack is "melee" or "ranged"');
        if (r.manual !== undefined && !isText(r.manual)) sub('reaction.manual is text for the DM');
      }
    }
    // `dragFree: true` (docs/specs/grapple-shove.md, Decision 7): it needn't spend extra movement to move a creature it is grappling (Abduct).
    if (t.dragFree !== undefined && t.dragFree !== true) sub('dragFree is true or left out');
    // `masterHeal: { within }` (#464, C9c; the Otherworldly Steed's Life Bond): when its master regains Hit Points from a spell
    // of level 1 or higher while within `within` feet of it, it regains the same number (engine/rolls.js, heal).
    if (t.masterHeal !== undefined && !(t.masterHeal && Object.keys(t.masterHeal).length === 1 && isInt(t.masterHeal.within) && t.masterHeal.within > 0 && t.masterHeal.within <= 120 && t.masterHeal.within % 5 === 0)) sub('masterHeal is { within: feet }');
  }
  if (seenCounter(e.actions)) say('a `counter` step is for a spell cast as a Reaction to a spell being cast');
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
    // A creature's action says how far it reaches (`reach`, melee) or shoots (`range`): with neither the engine cannot tell who it can
    // aim at (a spell has its range on the spell, so this is for a creature's action only; #421).
    if (a.target?.creature && typeof a.target.creature === 'object' && a.target.creature.reach === undefined && a.target.creature.range === undefined) sub('a creature target needs `reach` (feet, for a melee attack) or `range` ([normal, long] feet)');
    const seen = lintSteps(a.effects, sub, undefined, false, true);
    // A creature's action has no spell attack bonus and no spellcasting modifier of its own (a spell takes them from its caster; the engine
    // gives an action neither), so a spell attack roll and a heal or Temporary Hit Points that add a modifier would have no number (#421).
    if (Array.isArray(a.effects)) walkSteps(a.effects, (st) => {
      if (st && 'attack' in st && st.kind === 'spell') sub('a creature\'s action has no spell attack bonus: make it a weapon attack with the bonus the stat block gives (`kind: "weapon"`, `bonus`)');
      if (st && ('heal' in st || 'tempHp' in st) && st.addMod !== undefined) sub('a creature\'s action has no spellcasting modifier to add: give the whole amount in the dice (`addMod` is for a spell)');
    });
    // A condition that ends with the grapple needs a hold in the same action to end with.
    if (Array.isArray(a.effects)) {
      let held = false, tied = false;
      walkSteps(a.effects, (st) => { if (st?.condition === 'grappled' && st.escape !== undefined) held = true; if (st?.whileHeld) tied = true; });
      if (tied && !held) sub('`whileHeld` needs a Grappled step with `escape` in the same action');
    }
    if (e.tier === 'auto' && seen.manual) sub('the monster is marked auto but this action has a manual step');
    if (seen.summons) sub('a summon step is for a spell (a creature\'s action that summons is the DM\'s for now)');
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
    if (t.effects !== undefined) { const seen = lintSteps(t.effects, sub); manual ||= seen.manual; if (seen.counter) sub('a `counter` step is for a spell cast as a Reaction to a spell being cast'); }
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
    if (u.effects !== undefined) { const seen = lintSteps(u.effects, sub); manual ||= seen.manual; if (seen.counter) sub('a `counter` step is for a spell cast as a Reaction to a spell being cast'); }
    if (u.to === undefined && u.effects === undefined) sub('needs effects or a state to go to');
  }
  if (e.tier === 'auto' && manual) say('marked auto but contains a manual step');
  // A pile is only what lies there: nothing hidden, nothing in the way, no light, no triggers, no uses (taking
  // from it is the `pickUp` action), and one state.
  if (e.kind === 'pile') {
    if (states.length !== 1) say('a pile has one state');
    if (states.some((st) => e.states[st]?.hidden || e.states[st]?.blocks?.length || e.states[st]?.light)) say('a pile hides nothing, blocks nothing and gives no light');
    if (e.use.length || e.triggers !== undefined || e.find !== undefined || e.dc !== undefined) say('a pile has no uses, triggers, find or DCs: it is picked up with `pickUp`');
  }
}

// ---------- equipment: weapons and armour (content/srd52/equipment.js) ----------
export const WEAPON_PROPERTIES = ['ammunition', 'finesse', 'heavy', 'light', 'loading', 'reach', 'thrown', 'two-handed', 'versatile'];
export const MASTERIES = ['cleave', 'graze', 'nick', 'push', 'sap', 'slow', 'topple', 'vex'];
export const ARMOUR_CATEGORIES = ['light', 'medium', 'heavy', 'shield'];
function lintWeapon(e, say) {
  if (!ID.test(e.id ?? '') || !isText(e.name) || !isText(e.source)) say('needs a kebab-case id, a name and a source');
  if (typeof e.checked !== 'boolean') say('needs `checked: true` or `checked: false`');
  if (!['simple', 'martial'].includes(e.category)) say('category is simple or martial');
  if (!['melee', 'ranged'].includes(e.kind)) say('kind is melee or ranged');
  if (!(isDice(e.damage) || /^\d+$/.test(e.damage ?? ''))) say(`damage "${e.damage}" is not dice`);
  if (!DAMAGE_TYPES.includes(e.type)) say(`unknown damage type "${e.type}"`);
  if (!allOf(WEAPON_PROPERTIES)(e.properties)) say(`properties are drawn from ${WEAPON_PROPERTIES.join(', ')}`);
  const has = (p) => e.properties?.includes(p);
  if ((has('thrown') || has('ammunition') || e.kind === 'ranged') !== (Array.isArray(e.range) && e.range.length === 2 && e.range.every((n) => isInt(n) && n > 0) && e.range[0] <= e.range[1])) say('a ranged, thrown or ammunition weapon has a range [normal, long], and no other has');
  if (has('versatile') !== isDice(e.versatile ?? '')) say('a versatile weapon gives its two-handed damage in `versatile`, and no other does');
  if (!MASTERIES.includes(e.mastery)) say(`mastery is one of ${MASTERIES.join(', ')}`);
  if (findFunction(e)) say('content is data only');
}
function lintArmour(e, say) {
  if (!ID.test(e.id ?? '') || !isText(e.name) || !isText(e.source)) say('needs a kebab-case id, a name and a source');
  if (typeof e.checked !== 'boolean') say('needs `checked: true` or `checked: false`');
  if (!ARMOUR_CATEGORIES.includes(e.category)) say(`category is one of ${ARMOUR_CATEGORIES.join(', ')}`);
  if (!(isInt(e.ac) && e.ac > 0 && e.ac <= 20)) say('ac is a whole number');
  if (e.dex !== undefined && !(e.dex === 'full' || (isInt(e.dex) && e.dex >= 0))) say('dex is "full" or the most Dexterity adds');
  if (e.category === 'shield' && e.dex !== undefined) say('a shield adds no Dexterity');
  if (e.strength !== undefined && !(isInt(e.strength) && e.strength > 0)) say('strength is the score needed');
  if (e.stealth !== undefined && e.stealth !== 'disadvantage') say('stealth is "disadvantage" or left out');
  if (findFunction(e)) say('content is data only');
}

// ---------- classes (content/srd52/classes/*.js) ----------
// A class is its table and its features, level 1 to 20, with one subclass. A feature says what it
// does in `text` and, where the vocabulary can say it exactly, in `grants`. Those `derive()` turns
// into the record the engine plays (content/derive.js). Design: docs/specs/rules-expansion.md, R7.
export const RESTS = ['short', 'long'];
export const ACTION_TIMES = ['action', 'bonus', 'reaction', 'free'];
export const BONUS_ACTS = ['dash', 'disengage', 'hide'];
export const GRANTS = ['modifiers', 'aura', 'cure', 'freeCast', 'conditionImmune', 'metamagic', 'metamagicMax', 'exchange', 'restore', 'action', 'reaction', 'ac', 'armouredAc', 'speed', 'speeds', 'senses', 'saves', 'extraAttack', 'sneak', 'rangedAttack', 'spells',
  'martialArts', 'hp', 'bonusActs', 'expertise', 'skills', 'abilityBonus', 'cantrips', 'proficiency', 'recover', 'resist', 'critOn', 'spellLists',
  // Since the magic items (#189): a score that becomes a number unless already as high (Amulet of Health), a bonus to
  // Armor Class while wearing no armour and holding no Shield (Bracers of Defense), a sense gained or its range increased
  // (Goggles of Night).
  'setAbility', 'bareAc', 'senseRange',
  // Since the martial classes' levels 7 to 15 (#224): movement with another feature's action (Instinctive Pounce), a
  // choice on a hit (Brutal Strike), staying up at 0 Hit Points (Relentless Rage), something done on rolling Initiative
  // (Persistent Rage, Uncanny Metabolism, Perfect Focus), and another feature's lasting effect that needs no renewing
  // (Persistent Rage).
  'moveWith', 'brutal', 'relentless', 'initiative', 'persist',
  // A failed saving throw rolled again for a use of a feature (Indomitable, Disciplined Survivor), and
  // what a missed attack roll gives against that target (Studied Attacks).
  'reroll', 'missed',
  // Evasion; moving along walls and across water (Acrobatic Movement); conditions ended at the end of
  // its turns (Self-Restoration); another feature's reaction against any damage type (Deflect Energy);
  // another feature used without a Bonus Action after a different one (Fleet Step).
  'evasion', 'surfaces', 'selfCure', 'allTypes', 'fleet',
  // Sneak Attack dice traded for effects (Cunning Strike and the features that add to it), and how many
  // magic items it may be attuned to (Use Magic Device).
  'cunning', 'attune',
  // Since the casters' levels 7 to 15 (#232): an ability modifier added to one damage roll of a school's spells
  // (Empowered Evocation), and maximum damage at a growing cost (Overchannel).
  'empowered', 'overchannel',
  // A modifier an attacker gets against the creature it hit, to the end of the turn (Multiattack Defense); another
  // creature hurt by a mark's extra damage (Superior Hunter's Prey); Concentration on a spell that damage does not
  // break (Relentless Hunter); Exhaustion lowered by a Short Rest (Tireless).
  'afterHit', 'markSpread', 'steadfast', 'restExhaustion',
  // A spell's range made longer (Eldritch Spear) and a push on its hits (Repelling Blast).
  'spellRange', 'repel',
  // Since #464 (docs/specs/companions.md, amendment C9c): one of its attacks given up for its familiar's Reaction attack
  // (Pact of the Chain), and what it gives the familiar that spell makes (Investment of the Chain Master).
  'forgoAttack', 'invest',
  // Since #516 (docs/specs/homebrew-subclasses.md, addition J): what a subclass's feature changes about another feature's form (Wild Shape):
  // the highest Challenge Rating, more creature types, more Temporary Hit Points, and a price in another pool.
  'formOf',
  // What the holder does sets something off (addition H of docs/specs/homebrew-subclasses.md): taking the Attack action, and an Opportunity Attack that hits.
  'triggers'];
// Investment of the Chain Master's `invest` (C9c): the keys it may hold, and the damage types it may turn into others.
export const INVEST_KEYS = ['spell', 'speed', 'damage', 'saveDc', 'bonusAttack', 'ward'];
const LEVELS = 20;
// A number that grows with the class: a plain number, a column of the class table, an ability
// modifier with a least value, or so many times the class level.
// `{ mod, min, die }` is so many of that die as the modifier (Sear Undead), for dice only;
// `{ byLevel: { level: value } }` is the value for the highest class level reached (Divine Strike).
// `{ prof: n }` is n times the character's Proficiency Bonus (Alert's Initiative).
function lintAmount(x, cls, say, what, diceOk = false) {
  if (isInt(x)) return;
  if (x && typeof x === 'object' && Object.keys(x).length && Object.keys(x).every((k) => ['column', 'mod', 'min', 'perLevel', 'die', 'byLevel', 'prof'].includes(k))) {
    if (x.prof !== undefined && !(isInt(x.prof) && x.prof >= 1 && x.prof <= 2)) say(`${what}: prof is how many times the Proficiency Bonus, 1 or 2`);
    if (x.column !== undefined && !Object.hasOwn(cls.table ?? {}, x.column)) say(`${what}: no column "${x.column}" in the class table`);
    if (x.mod !== undefined && !ABILITIES.includes(x.mod)) say(`${what}: mod is an ability`);
    if (x.perLevel !== undefined && !isInt(x.perLevel)) say(`${what}: perLevel is a whole number`);
    if (x.min !== undefined && !isInt(x.min)) say(`${what}: min is a whole number`);
    if (x.die !== undefined && !(diceOk && x.mod !== undefined && [4, 6, 8, 10, 12].includes(x.die))) say(`${what}: die (4 to 12) goes with mod, for dice`);
    if (x.byLevel !== undefined && !(x.byLevel && typeof x.byLevel === 'object' && Object.keys(x.byLevel).length
      && Object.entries(x.byLevel).every(([l, v]) => isInt(+l) && +l >= 1 && +l <= LEVELS && (isInt(v) || (diceOk && isDice(v)))))) say(`${what}: byLevel gives a ${diceOk ? 'number or dice' : 'number'} for class levels`);
    if ([x.column, x.mod, x.perLevel, x.byLevel, x.prof].filter((v) => v !== undefined).length !== 1) say(`${what}: give one of column, mod, perLevel, byLevel, prof`);
    return;
  }
  say(`${what} is a number, { column }, { mod, min } , { perLevel }, { byLevel } or { prof }`);
}
const amountish = (v) => !!v && typeof v === 'object' && ['column', 'mod', 'perLevel', 'byLevel', 'prof'].some((k) => v[k] !== undefined);
// A modifier's value in a class feature may grow with the class ({ column }) or be an ability
// modifier ({ mod, min }); derive() puts in the number. For the linter it stands for a number.
// A heal or tempHp step may add the class level (`addLevel`), which derive() also bakes in.
function bakeValues(list, cls, say) {
  const out = structuredClone(list);
  const fix = (m) => {
    if (!m || !amountish(m.value)) return;
    lintAmount(m.value, cls, say, 'modifier value', m.op === 'add');
    m.value = m.value.byLevel && Object.values(m.value.byLevel).some((v) => typeof v === 'string') ? '1d6' : 1;
  };
  for (const x of out) {
    fix(x); fix(x.modifier);
    if (x.addLevel !== undefined && x.addLevel !== true) say('addLevel is true or left out');
    // A heal or tempHp step may roll a die from the class table ({ column }) and add an ability's
    // modifier (`addMod: "wis"`); a save step's DC may be the class's own, 8 + Proficiency Bonus +
    // an ability modifier (`dc: "wis"`). derive() bakes all three into plain dice and numbers.
    for (const k of ['heal', 'tempHp', 'damage']) if (x[k] && typeof x[k] === 'object') { lintAmount(x[k], cls, say, k, true); x[k] = '1d6'; }
    if (typeof x.addMod === 'string') { if (!ABILITIES.includes(x.addMod)) say('addMod is true or an ability'); x.addMod = true; }
    if ('save' in x && typeof x.dc === 'string') { if (!ABILITIES.includes(x.dc)) say('a save step\'s dc in a class feature is a number or an ability'); x.dc = 10; }
    for (const b of ['onHit', 'onMiss', 'onFail', 'onSuccess']) if (Array.isArray(x[b])) x[b] = bakeValues(x[b], cls, say);
  }
  return out;
}
// `invest` (C9c, Investment of the Chain Master): what the familiar `spell` makes for this caster is given.
//   speed: { feet, of }        a Speed of `feet` in one way of moving of `of`, chosen at each casting (Fly or Swim 40)
//   damage: { from, to }       damage of a type in `from` it deals may be of one type of `to` instead, chosen at the casting
//   saveDc: true               a save it forces uses its master's spell save DC
//   bonusAttack: true          a Bonus Action of its master's has it take the Attack action (`attack` with `familiar` and `via`)
//   ward: true                 when it takes damage, its master's Reaction gives it Resistance to that damage (reactions.js)
// Every key but `spell` is optional; at least one is there. Null if it is whole, or what is wrong.
export function investProblem(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x) || !Object.keys(x).every((k) => INVEST_KEYS.includes(k))) return `invest is { ${INVEST_KEYS.join(', ')} }, each but spell optional`;
  if (!ID.test(x.spell ?? '')) return 'invest names its spell';
  if (Object.keys(x).length < 2) return 'invest gives the familiar something besides naming its spell';
  const s = x.speed;
  if (s !== undefined && !(s && Object.keys(s).length === 2 && isInt(s.feet) && s.feet > 0 && s.feet <= 120 && s.feet % 5 === 0
    && Array.isArray(s.of) && s.of.length >= 1 && s.of.length <= 4 && s.of.every((m) => ['fly', 'swim', 'climb', 'burrow'].includes(m)) && new Set(s.of).size === s.of.length)) return 'invest.speed is { feet, of: [fly | swim | climb | burrow] }';
  const d = x.damage;
  if (d !== undefined && !(d && Object.keys(d).length === 2 && allOf(DAMAGE_TYPES)(d.from) && d.from.length && allOf(DAMAGE_TYPES)(d.to) && d.to.length
    && new Set([...d.from, ...d.to]).size === d.from.length + d.to.length)) return 'invest.damage is { from: [types], to: [other types] }';
  for (const k of ['saveDc', 'bonusAttack', 'ward']) if (x[k] !== undefined && x[k] !== true) return `invest.${k} is true or left out`;
  return null;
}
// A feature's action may cost a pool (`resource`, `n` uses of it), a spell slot (`slot`: its lowest level; the holder picks the level when using it, and any
// higher slot will do), or both (addition E of docs/specs/homebrew-subclasses.md). `higher`: what one level of slot above `slot` adds to the action's first
// step of that kind, as a spell's `higher.slot` does (`damage`, `heal` or `tempHp` dice, `times` more damage rolls, `value` more to a modifier's number).
const SLOT_COST_KEYS = ['resource', 'n', 'slot', 'higher'], SLOT_GROWS = ['damage', 'heal', 'tempHp', 'times', 'value'];
const SLOT_NOT_WITH = ['modes', 'form', 'gain', 'pool', 'cure', 'renew', 'orSlot'];
function lintActionCost(a, say) {
  const c = a.cost;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return say('cost is { resource, n?, slot?, higher? }');
  for (const k of Object.keys(c)) if (!SLOT_COST_KEYS.includes(k)) say(`cost: "${k}" is not something a cost has`);
  if (c.resource === undefined && c.slot === undefined) return say('cost is { resource, n? } or { slot, higher? }, or both');
  if (c.resource !== undefined && !ID.test(c.resource ?? '')) say('cost.resource names a feature, in kebab-case');
  if (c.n !== undefined && !(c.resource !== undefined && isInt(c.n) && c.n > 0)) say('cost.n is a number of uses, with a resource');
  if (c.slot === undefined) { if (c.higher !== undefined) say('cost.higher is for a cost with a `slot`'); return; }
  if (!(isInt(c.slot) && c.slot >= 1 && c.slot <= 9)) return say('cost.slot is the lowest spell slot level that pays for it, from 1 to 9');
  // What a slot pays for is one plain action: its own steps, grown by the level of the slot. Not a form, a pool, a mode, a Reaction or a restored use (the slot of `orSlot` is the same argument).
  for (const k of SLOT_NOT_WITH) if (a[k] !== undefined) say(`an action with a slot cost cannot also have \`${k}\`${k === 'orSlot' ? ': a slot is spent for its cost or to restore a use, not both' : ''}`);
  if (a.time === 'reaction') say('an action with a slot cost is used by an action, a Bonus Action or a free use, not by a Reaction');
  if (!(Array.isArray(a.effects) && a.effects.length)) say('an action with a slot cost has `effects`: the steps the slot pays for');
  if (c.higher === undefined) return;
  const h = c.higher;
  if (!h || typeof h !== 'object' || Array.isArray(h) || !Object.keys(h).length) return say('cost.higher is { damage?, heal?, tempHp?, times?, value? }, what each slot level above the lowest adds');
  for (const k of Object.keys(h)) if (!SLOT_GROWS.includes(k)) say(`cost.higher.${k} is not something a slot level can add (${SLOT_GROWS.join(', ')})`);
  for (const k of ['damage', 'heal', 'tempHp']) if (h[k] !== undefined && !isDice(h[k])) say(`cost.higher.${k} must be dice`);
  for (const k of ['times', 'value']) if (h[k] !== undefined && !(isInt(h[k]) && h[k] > 0 && h[k] <= (k === 'times' ? 10 : 40))) say(`cost.higher.${k} must be a positive whole number${k === 'times' ? ' up to 10' : ' up to 40'}`);
  // It grows the step `scaleSteps` grows: the FIRST step of that kind, in the same order (a step, then its branches), and says in a sentence what it cannot grow, instead of a
  // note to the DM on every use. Dice grow by dice of the same size (`addDice`); a modifier's number must be a plain number.
  if (Array.isArray(a.effects)) {
    const first = (key) => { let found = null; walkSteps(a.effects, (st) => { if (!found && st && typeof st === 'object' && key in st) found = st; }); return found; };
    const grows = (base, extra) => {
      const x = typeof base === 'string' && base ? DICE_GROWS.exec(base) : null, y = DICE_GROWS.exec(extra);
      return !!x && !!y && !(x[2] && y[2] && x[2] !== y[2]);
    };
    for (const k of ['damage', 'heal', 'tempHp']) {
      if (h[k] === undefined || !isDice(h[k])) continue;
      const st = first(k);
      if (!st) say(`cost.higher.${k} grows a ${k} step, and the action has none`);
      else if (!grows(st[k], h[k])) say(`cost.higher.${k} adds ${h[k]} to the first ${k} step, whose amount is ${typeof st[k] === 'string' ? `"${st[k]}"` : 'not plain dice'}: it can only add dice of the same size to plain dice`);
    }
    if (h.times !== undefined && !first('damage')) say('cost.higher.times repeats a damage step, and the action has none');
    if (h.value !== undefined) {
      const st = first('modifier');
      if (!st) say('cost.higher.value adds to a modifier step\'s number, and the action has none');
      else if (typeof st.modifier?.value !== 'number') say('cost.higher.value adds to the number of the first modifier step, and that one has no plain number');
    }
  }
}
const DICE_GROWS = /^(?:(\d+)d(\d+))?([+-]\d+)?$/;
// A mode of a feature's action may have a price of its own (`cost: { resource, n? }`, in place of the action's) or none (`free: true`), and may aim a second
// target (`target: { near }`, in place of the action's own `near`): addition G of docs/specs/homebrew-subclasses.md. `lintModeOwn` checks one mode's three keys.
const MODE_KEYS = ['id', 'name', 'effects', 'target', 'cost', 'free'];
const isNearFeet = (n) => isInt(n) && n >= 5 && n <= 60 && n % 5 === 0;
function lintModeOwn(m, a, say) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return;
  const at = typeof m.id === 'string' ? `mode ${m.id}: ` : 'a mode: ';
  if (m.free !== undefined && m.free !== true) say(`${at}\`free\` is true or left out`);
  if (m.cost !== undefined) {
    const c = m.cost;
    if (!(c && typeof c === 'object' && !Array.isArray(c) && Object.keys(c).every((k) => ['resource', 'n'].includes(k)) && ID.test(c.resource ?? '') && (c.n === undefined || (isInt(c.n) && c.n > 0)))) say(`${at}cost is { resource, n? }: the pool this mode spends instead of the action's own price`);
  }
  if (m.free === true && m.cost !== undefined) say(`${at}a mode costs nothing (\`free\`) or has a price of its own (\`cost\`), not both`);
  if ((m.free !== undefined || m.cost !== undefined) && (a.orCost !== undefined || a.orSlot !== undefined)) say(`${at}a mode with a price of its own (or none) cannot be on an action with \`orCost\` or \`orSlot\`: those are about the action's own price`);
  if (m.target !== undefined && !(m.target && typeof m.target === 'object' && !Array.isArray(m.target) && Object.keys(m.target).length === 1 && 'near' in m.target)) say(`${at}a mode's target is { near }, and nothing else: who the action is aimed at is the action's`);
  else if (m.target !== undefined && !isNearFeet(m.target.near)) say(`${at}near is feet, a multiple of 5, 5 to 60`);
}
// `near` (addition G), on the action's `target` or on a mode's: the second creature takes the damage the action begins with. One place for every refusal of it.
function lintNear(a, cls, say) {
  const modes = Array.isArray(a.modes) ? a.modes.filter((m) => m && typeof m === 'object' && !Array.isArray(m)) : [];
  const own = a.target && typeof a.target === 'object' ? a.target.near : undefined, aimed = modes.filter((m) => m.target !== undefined && typeof m.target === 'object' && m.target && 'near' in m.target);
  if (own === undefined && !aimed.length) return;
  if (cls === FEAT_CLASS) return say('a feat or an item cannot have a second target near the first (`near`): only a feature of a subclass can');
  if (a.pool !== undefined || a.gain !== undefined || a.form !== undefined) return say('a second target near the first (`near`) is for an action that does steps, not a pool of healing, an extra action or a form');
  const c = a.target?.creature;
  if (!c || typeof c !== 'object') return say('a second target near the first (`near`) needs a creature to be the first: the action is aimed at one creature, not at the holder or at an area');
  if (c.count !== undefined && c.count !== 1) say('a second target near the first (`near`) is for an action with one target: `count` and `within` are how an action names several');
  if (c.repeat !== undefined || c.within !== undefined) say('a second target near the first (`near`) is for an action with one target: `repeat` and `within` are how an action names several');
  if (own !== undefined && !isNearFeet(own)) say('near is feet, a multiple of 5, 5 to 60');
  if (own !== undefined && aimed.length) say('`near` is said on the action or on its modes, not both');
  const lists = own !== undefined ? (modes.length ? modes.map((m) => m.effects) : [a.effects]) : aimed.map((m) => m.effects);
  for (const l of lists) { const p = Array.isArray(l) ? nearProblem(l) : null; if (p) { say(p); break; } }
}
// `choice: { of: 'skill' | 'tool', from? }` on a feature's action: the holder names a skill or a tool when it uses the feature (`choice: 'arcana'` on the `feature` action), and the
// modifier steps that say `scope: { skill: 'chosen' }` or `{ tool: 'chosen' }` take it. A `proficient` step lasts: its action needs a duration.
function lintActionChoice(a, cls, say) {
  const lists = Array.isArray(a?.modes) ? a.modes.map((m) => m?.effects) : [a?.effects];
  let chosenSkill = false, chosenTool = false, lends = false;
  for (const l of lists) walkSteps(l, (st) => {
    const sc = st?.modifier?.scope;
    if (sc?.skill === 'chosen') chosenSkill = true;
    if (sc?.tool === 'chosen') chosenTool = true;
    if (st?.modifier?.op === 'proficient') lends = true;
  });
  if (lends && (!a.duration || a.duration === 'instant')) say('an action with a `proficient` step lends proficiency for a time, so it needs a duration that is not `instant`');
  if (lends && !(a.target && a.target.self === true)) say('an action with a `proficient` step is aimed at its holder (`target: { self: true }`): the skill or tool picked is the holder\'s, and lending proficiency to another creature is not said');
  const c = a?.choice;
  if (c === undefined) {
    if (chosenSkill || chosenTool) say(`a step uses the chosen ${chosenSkill ? 'skill' : 'tool'}, but the action has no \`choice: { of: "${chosenSkill ? 'skill' : 'tool'}" }\``);
    return;
  }
  if (cls === FEAT_CLASS) say('a feat or an item cannot ask its holder to choose a skill or tool when it is used: only a feature of a subclass can');
  if (!c || typeof c !== 'object' || Array.isArray(c) || Object.keys(c).some((k) => !['of', 'from'].includes(k)) || !['skill', 'tool'].includes(c.of)) return say('an action\'s `choice` is { of: "skill" or "tool", from? }');
  if (c.of === 'tool' && c.from === undefined) say('an action\'s `choice` of a tool needs `from`, the tool ids it offers: the engine has no list of tools to take any from');
  if (a.renew !== undefined || a.zone !== undefined) say(`an action with a \`choice\` cannot also have \`${a.renew !== undefined ? 'renew' : 'zone'}\`: ${a.renew !== undefined ? 'a use that extends the effect it made has no new choice to take' : 'the zone runs the action\'s steps later, on each creature that enters, and not on the holder\'s pick'}`);
  const fine = c.of === 'skill' ? (x) => Object.hasOwn(SKILLS, x) : (x) => typeof x === 'string' && x.length <= 40 && ID.test(x);
  if (c.from !== undefined && !(Array.isArray(c.from) && c.from.length > 1 && new Set(c.from).size === c.from.length && c.from.every(fine))) say(`an action's \`choice.from\` lists two or more different ${c.of === 'skill' ? 'skills' : 'tool ids in kebab-case, such as thieves-tools'}`);
  if (c.of === 'skill' ? !chosenSkill : !chosenTool) say(`an action's \`choice\` of a ${c.of} that no step uses (a modifier with \`scope: { ${c.of}: "chosen" }\` takes it)`);
  if (c.of === 'skill' ? chosenTool : chosenSkill) say(`a step uses the chosen ${c.of === 'skill' ? 'tool' : 'skill'}, but the action's choice is of a ${c.of}`);
  if (a.form !== undefined || a.gain !== undefined || a.pool !== undefined || a.time === 'reaction' || (!Array.isArray(a.effects) && !Array.isArray(a.modes))) say('an action with a `choice` needs plain `effects` or `modes`: it cannot also take a form, gain an action or be a pool or a Reaction');
}
function lintGrants(g, cls, say) {
  if (!g || typeof g !== 'object' || Array.isArray(g)) return say('grants must be an object');
  for (const k of Object.keys(g)) if (!GRANTS.includes(k)) say(`"${k}" is not something a feature can grant`);
  if (g.modifiers !== undefined) { if (!Array.isArray(g.modifiers) || !g.modifiers.length) say('modifiers is a list'); else for (const m of bakeValues(g.modifiers, cls, say)) lintModifier(m, say); }
  // An aura: an Emanation of `range` feet from its holder, giving it and its allies there
  // `modifiers` and Immunity to the conditions in `immune`, while the holder is not Incapacitated.
  if (g.aura !== undefined) {
    const au = g.aura;
    if (!au || typeof au !== 'object' || !Object.keys(au).every((k) => ['range', 'modifiers', 'immune'].includes(k))) say('aura is { range, modifiers?, immune? }');
    else {
      // A range may grow with the class (`{ byLevel }`: Aura Expansion makes the Paladin's auras 30 feet at 18).
      const feet = (n) => isInt(n) && n > 0 && n % 5 === 0;
      if (amountish(au.range)) { lintAmount(au.range, cls, say, 'aura.range'); if (au.range.byLevel === undefined || !Object.values(au.range.byLevel).every(feet)) say('aura.range grows by { byLevel } in feet, multiples of 5'); }
      else if (!feet(au.range)) say('aura.range is feet, a multiple of 5');
      if (au.modifiers !== undefined) { if (!Array.isArray(au.modifiers) || !au.modifiers.length) say('aura.modifiers is a list'); else for (const m of bakeValues(au.modifiers, cls, say)) lintModifier(m, say); }
      if (au.immune !== undefined && !(allOf(CONDITIONS)(au.immune) && au.immune.length)) say('aura.immune lists conditions');
      if (!au.modifiers && !au.immune) say('an aura gives modifiers or immunities');
    }
  }
  if (g.action !== undefined && !(g.action && typeof g.action === 'object' && !Array.isArray(g.action))) say('action is { time, target, effects, ... }');
  else if (g.action !== undefined) {
    const a = g.action;
    for (const k of Object.keys(a ?? {})) if (!['time', 'target', 'effects', 'duration', 'cost', 'renew', 'noSpells', 'gain', 'pool', 'firstAttack', 'unless', 'endsWhenIncapacitated', 'cure', 'modes', 'form', 'orCost', 'acts', 'after', 'orSlot', 'zone', 'inForm', 'choice'].includes(k)) say(`action: "${k}" is not something a feature's action has`);
    // `after: 'hit'`: used on a creature its creature hit with an attack roll this turn, once a turn; `orSlot`: with
    // its uses spent, a spell slot (a Pact Magic slot for a Warlock) restores one (Hurl Through Hell; addition E of docs/specs/homebrew-subclasses.md for any caster).
    // `after: 'weaponHit'` (addition F): the same, after a hit with a weapon (a spell attack and an Unarmed Strike are not one).
    if (a?.after !== undefined && !(['hit', 'weaponHit'].includes(a.after) && a.target?.creature)) say('action after is "hit" or "weaponHit", on a creature');
    // A feature's `after` is a hit on the creature the action is aimed at: a pool of healing or an extra action (`pool`, `gain`) has no creature to have hit.
    if (a?.after !== undefined && (a.pool !== undefined || a.gain !== undefined)) say('an action with `after` follows a hit on the creature it is aimed at, and cannot also have `pool` or `gain`: neither has a creature to have hit');
    if (a?.orSlot !== undefined && !(a.orSlot === true)) say('action orSlot is true or left out');
    // `inForm: <feature id>` (#525, addition J): the action is used only while its holder is in a form that feature gave (Combat Wild Shape: "while in a Wild Shape form").
    if (a?.inForm !== undefined) {
      if (!(typeof a.inForm === 'string' && ID.test(a.inForm))) say('action inForm names the feature whose form the holder must be in (a feature id)');
      if (cls === FEAT_CLASS) say('a feat or an item cannot say `inForm`: only a feature of a subclass can name the form feature of its class');
      if (a.form !== undefined) say('an action that takes a form cannot also say `inForm`: it is how a form is taken');
      if (a.time === 'reaction') say('an action with `inForm` is used by its holder: a Reaction is taken by a standing instruction, which does not look at a form');
    }
    // `choice` and the proficiency a feature's action lends for a time (addition C of docs/specs/homebrew-subclasses.md).
    lintActionChoice(a, cls, say);
    // `acts`: the feature's action also takes these actions (Patient Defense with a Focus Point: Disengage and Dodge).
    if (a?.acts !== undefined && !(Array.isArray(a.acts) && a.acts.length && allOf(['dash', 'disengage', 'dodge'])(a.acts) && new Set(a.acts).size === a.acts.length && a.target?.self)) say('action acts lists dash, disengage or dodge, on the creature itself');
    if (a?.unless !== undefined && a.unless !== 'heavy') say('action unless is "heavy" (not usable in Heavy armor) or left out');
    if (!ACTION_TIMES.includes(a?.time)) say(`action time is one of ${ACTION_TIMES.join(', ')}`);
    if (a?.duration !== undefined && !isDuration(a.duration)) say('action duration is a duration');
    if (a?.cost !== undefined) {
      lintActionCost(a, say);
      if (a.cost && typeof a.cost === 'object' && a.cost.slot !== undefined && cls === FEAT_CLASS) say('a feat or an item cannot have a slot cost: only a feature of a subclass can');
    }
    // `orCost`: paid from another pool when the feature's own uses are gone; `with`: only for a character that has that feature.
    if (a?.orCost !== undefined && !(a.orCost && ID.test(a.orCost.resource ?? '') && isInt(a.orCost.n) && a.orCost.n > 0 && Object.keys(a.orCost).every((k) => ['resource', 'n', 'with'].includes(k)) && (a.orCost.with === undefined || ID.test(a.orCost.with)))) say('orCost is { resource, n, with? }');
    if (a?.gain !== undefined) {
      const gn = a.gain;
      if (!gn || !Object.keys(gn).every((k) => ['action', 'attacks'].includes(k))) say('gain gives an action or attacks');
      if (gn?.action !== undefined && gn.action !== 1) say('gain.action is 1');
      if (gn?.attacks !== undefined) { if (!ID.test(gn.attacks.with ?? '')) say('gain.attacks is { with: attack id, n }'); lintAmount(gn.attacks.n, cls, say, 'gain.attacks.n'); }
    } else if (a?.form) {
      // A form (Wild Shape; forms.js): the creature takes the shape of a pack monster of one of
      // `types`, of Challenge Rating up to `maxCr`, with a Fly Speed only if `fly` is 1, for
      // `hours` hours, gaining `tempHp` Temporary Hit Points. Each may grow with the class.
      const fm = a.form, num = (x, ok) => (typeof x === 'number' ? ok(x) : x && typeof x === 'object' && x.byLevel && Object.keys(x).length === 1
        && Object.entries(x.byLevel).every(([l, v]) => isInt(+l) && +l >= 1 && +l <= LEVELS && typeof v === 'number' && ok(v)));
      if (!(fm && typeof fm === 'object' && Object.keys(fm).every((k) => ['types', 'maxCr', 'fly', 'hours', 'tempHp'].includes(k)))) say('form is { types, maxCr, fly, hours, tempHp? }');
      else {
        if (!(allOf(CREATURE_TYPES)(fm.types) && fm.types.length)) say('form.types lists creature types');
        if (!num(fm.maxCr, (v) => v >= 0 && v <= 30)) say('form.maxCr is a Challenge Rating, or one by level');
        if (!num(fm.fly, (v) => v === 0 || v === 1)) say('form.fly is 0 or 1, or one by level');
        if (!num(fm.hours, (v) => isInt(v) && v >= 1 && v <= 24)) say('form.hours is whole hours, or by level');
        if (fm.tempHp !== undefined) lintAmount(fm.tempHp, cls, say, 'form.tempHp');
      }
      if (!a.target?.self || a.effects !== undefined) say('a form is taken by its creature itself, with no effects');
    } else if (a?.pool) {
      if (!a.target?.creature) say('a pool of healing is aimed at a creature');
      // `cure`: the pool may also remove these conditions, `cost` points each (Lay On Hands' Poisoned).
      if (a.cure !== undefined && !(a.cure && allOf(CONDITIONS)(a.cure.conditions) && a.cure.conditions.length && isInt(a.cure.cost) && a.cure.cost > 0 && Object.keys(a.cure).length === 2)) say('cure is { conditions, cost }');
    } else if (a) {
      if (a.cure !== undefined) say('cure is for a pool of healing');
      // In class content a target's count may grow with the class ({ mod, min }: Abjure Foes); derive() puts in the number.
      const count = a.target?.creature?.count;
      if (amountish(count)) lintAmount(count, cls, say, 'target count');
      lintTarget(amountish(count) ? { ...a.target, creature: { ...a.target.creature, count: 1 } } : a.target, say, true);
      // `modes`: the feature does one of these, chosen when it is used ({ id, name, effects }), in place of `effects`.
      if (a.modes !== undefined) {
        if (a.effects !== undefined) say('an action has effects or modes, not both');
        if (!(Array.isArray(a.modes) && a.modes.length >= 2)) say('modes lists two or more');
        else for (const m of a.modes) {
          if (!(m && ID.test(m.id ?? '') && isText(m.name) && Object.keys(m).every((k) => MODE_KEYS.includes(k)))) say('a mode is { id, name, effects, target?, cost?, free? }');
          lintModeOwn(m, a, say);
          if (lintSteps(bakeValues(m?.effects, cls, say), say, { manual: false, rolledOk: cls !== FEAT_CLASS }).counter) say('a `counter` step is for a spell cast as a Reaction to a spell being cast');
        }
      } else {
        const seen = Array.isArray(a.effects) || a.zone === undefined ? lintSteps(bakeValues(a.effects, cls, say), say, { manual: false, rolledOk: cls !== FEAT_CLASS }) : {};      // a zone's missing `effects` is said below
        if (seen.counter) say('a `counter` step is for a spell cast as a Reaction to a spell being cast');
        // A zone's steps go off on one creature at a time, whenever it enters or starts or ends its turn there: not a creature made or moved by the holder.
        if (a.zone !== undefined && (seen.summons || seen.teleport)) say('the steps of a zone run on each creature that enters it: a summon or teleport step cannot be one of them');
        // An attack roll in a zone has no reach or range to check against: the steps run on the creature the zone caught, so an `attack` step is refused (a save step does the work).
        if (a.zone !== undefined) { let reuses = false; walkSteps(a.effects, (st) => { if (st && typeof st === 'object' && isRolled(st.modifier?.value)) reuses = true; }); if (reuses) say('the steps of a zone run on each creature that enters it: a modifier of `{ rolled: true }` cannot be one of them'); }
        if (a.zone !== undefined) { let rolls = false; walkSteps(a.effects, (st) => { if (st && typeof st === 'object' && 'attack' in st) rolls = true; }); if (rolls) say('the steps of a zone run on each creature that enters it, with no reach or range to roll an attack against: an attack step cannot be one of them (a save does the work)'); }
      }
    }
    lintNear(a, cls, say);
    for (const k of ['renew', 'noSpells', 'pool', 'firstAttack', 'endsWhenIncapacitated']) if (a?.[k] !== undefined && a[k] !== true) say(`action ${k} is true or left out`);
    // `zone` (addition D of docs/specs/homebrew-subclasses.md): the action's Emanation stays for its duration, moves with the holder, and its
    // `effects` go off on a creature that enters it or starts or ends its turn there, as a spell's zone (zones.js). Only a subclass's feature has one.
    if (a?.zone !== undefined) {
      if (cls === FEAT_CLASS) say('a feat or an item cannot carry a zone: only a feature of a subclass can');
      lintZone(a, say, true);
      if (a.time === 'reaction') say('a zone is set up by an action, a Bonus Action or a free use, not by a Reaction');
      if (!(Array.isArray(a.effects) && a.effects.length)) say('an action with a zone has `effects`: the steps that go off on each creature');
      for (const k of ['modes', 'form', 'gain', 'pool', 'cure', 'renew', 'after', 'firstAttack', 'acts', 'noSpells', 'orSlot']) {
        if (a[k] !== undefined) say(`an action with a zone cannot also have \`${k}\`: the zone runs the action's own \`effects\` and nothing else`);
      }
    }
  }
  if (g.reaction !== undefined) {
    // A Reaction taken by standing instruction that cuts the damage of the attack that hit:
    // { on: 'hit', cut: 'half' | { dice, add? }, seen?, types? }. `add` lists amounts that grow
    // with the class ({ mod }, { perLevel }); derive() bakes them into the dice. `seen`: only
    // against an attacker its creature can see. `types`: only if the attack deals one of them.
    const r = g.reaction;
    // Or `{ on: 'saveFailed', conditions, range }`: it or an ally within range fails a save against
    // an effect that would apply one of these conditions, and the save is rolled again with Advantage (Countercharm).
    if (r?.on === 'saveFailed') {
      if (!(allOf(CONDITIONS)(r.conditions) && r.conditions.length && isInt(r.range) && r.range > 0 && r.range % 5 === 0 && Object.keys(r).length === 3)) say('a saveFailed reaction is { on, conditions, range }');
    // Or `{ on: 'damaged', attack: 'melee', within }`: it takes damage from a hostile creature within
    // `within` feet, and makes one melee attack against it (Retaliation).
    } else if (r?.on === 'damaged' && r.resist !== undefined) {
      // Or `{ on: 'damaged', resist: true }`: it takes damage, and gains Resistance to that type to the end of the turn (Superior Hunter's Defense).
      if (!(r.resist === true && Object.keys(r).length === 2)) say('a damaged reaction that resists is { on, resist: true }');
    } else if (r?.on === 'damaged') {
      if (!(r.attack === 'melee' && isInt(r.within) && r.within > 0 && r.within % 5 === 0 && Object.keys(r).length === 3)) say('a damaged reaction is { on, attack: "melee", within }');
    // Or `{ on: 'attacks', of, attack: 'melee' }` (#537, addition I of homebrew-subclasses.md): a hostile creature under the lasting effect of this holder's feature `of` makes an attack,
    // and the holder makes one melee weapon attack against it first. Only a subclass's feature may state one.
    } else if (r?.on === 'attacks') {
      const why = attacksReactionProblem(r);
      if (why) say(why);
      if (cls === FEAT_CLASS) say('a feat or an item cannot state a reaction to a creature under its effect (`attacks`): only a feature of a subclass can');
    } else if (!r || typeof r !== 'object' || !Object.keys(r).every((k) => ['on', 'cut', 'seen', 'types'].includes(k))) say('reaction is { on, cut, seen?, types? }');
    else {
      if (r.on !== 'hit') say('reaction.on is "hit" (a feature that cuts the damage of a hit)');
      if (r.cut !== 'half' && !(r.cut && typeof r.cut === 'object' && isDice(r.cut.dice) && Object.keys(r.cut).every((k) => ['dice', 'add'].includes(k)))) say('reaction.cut is "half" or { dice, add? }');
      if (r.cut?.add !== undefined) { if (!Array.isArray(r.cut.add)) say('reaction.cut.add is a list'); else for (const x of r.cut.add) lintAmount(x, cls, say, 'reaction.cut.add'); }
      if (r.seen !== undefined && r.seen !== true) say('reaction.seen is true or left out');
      if (r.types !== undefined && !(allOf(DAMAGE_TYPES)(r.types) && r.types.length)) say('reaction.types lists damage types');
    }
  }
  // `freeCast`: for one of the feature's uses, cast a spell with no slot as a Magic action: any
  // spell of a class's list up to a level ({ list, maxLevel }), or one of these ({ spells }).
  if (g.freeCast !== undefined) for (const m of freeCastProblems(g.freeCast)) say(m);
  // `metamagic`: a Metamagic option known, by its id, its cost from a pool (engine/casting.js, metamagicFor);
  // `metamagicMax`: so many options a spell while the feature `while` names has its effect going.
  if (g.metamagic !== undefined && !(g.metamagic && ['careful', 'distant', 'empowered', 'extended', 'heightened', 'quickened', 'seeking', 'subtle', 'transmuted', 'twinned'].includes(g.metamagic.id)
    && isInt(g.metamagic.cost) && g.metamagic.cost > 0 && ID.test(g.metamagic.pool ?? '') && Object.keys(g.metamagic).length === 3)) say('metamagic is { id, cost, pool }');
  if (g.metamagicMax !== undefined && !(g.metamagicMax && isInt(g.metamagicMax.n) && g.metamagicMax.n >= 2 && ID.test(g.metamagicMax.while ?? ''))) say('metamagicMax is { n, while }');
  // `exchange`: the feature's points buy spell slots by level (`costs`, from class level `minLevel`) and are bought by them.
  if (g.exchange !== undefined && !(g.exchange && Object.keys(g.exchange).length === 2 && ['costs', 'minLevel'].every((k) => g.exchange[k] && typeof g.exchange[k] === 'object'
    && Object.entries(g.exchange[k]).every(([l, v]) => isInt(+l) && +l >= 1 && +l <= 9 && isInt(v) && v > 0)))) say('exchange is { costs, minLevel } by slot level');
  // `restore`: on a Short Rest, points back to another feature's pool, at most `max`, for one use.
  if (g.restore !== undefined) { if (!(g.restore && ID.test(g.restore.of ?? '') && g.restore.max !== undefined && Object.keys(g.restore).length === 2)) say('restore is { of, max }'); else lintAmount(g.restore.max, cls, say, 'restore.max'); }
  // `cure`: more conditions another feature's pool may remove, at that pool's cost (Restoring Touch).
  if (g.cure !== undefined && !(g.cure && ID.test(g.cure.of ?? '') && allOf(CONDITIONS)(g.cure.conditions) && g.cure.conditions.length && Object.keys(g.cure).length === 2)) say('cure is { of: feature id, conditions }');
  if (g.ac !== undefined && !(g.ac && isInt(g.ac.base) && allOf(ABILITIES)(g.ac.abilities) && typeof g.ac.shield === 'boolean')) say('ac is { base, abilities, shield }');
  for (const k of ['armouredAc', 'rangedAttack', 'extraAttack', 'expertise', 'cantrips']) if (g[k] !== undefined && !(isInt(g[k]) && g[k] > 0 && g[k] <= 5)) say(`${k} is a small whole number`);
  if (g.speed !== undefined) { lintAmount(g.speed.add, cls, say, 'speed.add'); if (!['heavy', 'armour', undefined].includes(g.speed.unless)) say('speed.unless is heavy or armour'); }
  // `speeds`: climb and/or swim equal to Speed, or feet for climb, swim or fly ({ swim: 40 }: Ring of Swimming).
  if (g.speeds !== undefined && !(Array.isArray(g.speeds) ? allOf(['climb', 'swim'])(g.speeds) && g.speeds.length
    : g.speeds && typeof g.speeds === 'object' && Object.keys(g.speeds).length && Object.entries(g.speeds).every(([m, v]) => ['climb', 'swim', 'fly'].includes(m) && isInt(v) && v > 0 && v % 5 === 0 && v <= 300))) say('speeds lists climb and/or swim (equal to Speed), or gives feet for climb, swim or fly');
  if (g.setAbility !== undefined && !(g.setAbility && typeof g.setAbility === 'object' && Object.keys(g.setAbility).length && Object.entries(g.setAbility).every(([a, v]) => ABILITIES.includes(a) && isInt(v) && v >= 1 && v <= 30))) say('setAbility gives scores (1 to 30) for abilities');
  if (g.bareAc !== undefined && !(isInt(g.bareAc) && g.bareAc > 0 && g.bareAc <= 5)) say('bareAc is a small whole number');
  if (g.senseRange !== undefined && !validSenses(g.senseRange)) say('senseRange gives feet for special senses');
  if (g.senses !== undefined && !validSenses(g.senses)) say('senses gives feet for special senses');
  if (g.saves !== undefined && !(g.saves === 'all' || allOf(ABILITIES)(g.saves))) say('saves lists abilities, or is "all"');
  for (const k of ['sneak', 'martialArts']) if (g[k] !== undefined) lintAmount(g[k], cls, say, k);
  if (g.spells !== undefined && !(Array.isArray(g.spells) && g.spells.every((x) => ID.test(x)))) say('spells lists spell ids');
  if (g.hp !== undefined) lintAmount(g.hp, cls, say, 'hp');
  if (g.bonusActs !== undefined && !(allOf(BONUS_ACTS)(g.bonusActs) && g.bonusActs.length)) say(`bonusActs lists ${BONUS_ACTS.join(', ')}`);
  // `skills`: so many more, from the class's list or any (picked on the sheet's `skills`), or (#544, addition A of homebrew-subclasses.md) from a short list of skill ids,
  // picked on the sheet's `choices` for the feature, with `expertise: true` to have Expertise in them too. Only a subclass's feature may name a list.
  if (g.skills !== undefined) {
    const s = g.skills;
    if (s && typeof s === 'object' && Array.isArray(s.from)) {
      if (cls === FEAT_CLASS) say('a feat or an item cannot give skills from a list: only a feature of a subclass can');
      else if (!(isInt(s.n) && s.n > 0 && s.n <= 5 && Object.keys(s).every((k) => ['n', 'from', 'expertise'].includes(k)) && allOf(Object.keys(SKILLS))(s.from) && new Set(s.from).size === s.from.length && s.from.length >= 2 && s.n <= s.from.length)) say('skills from a list is { n, from: [skills], expertise? }: n is 1 to 5, the list has 2 or more different skills and at least n of them');
      else if (s.expertise !== undefined && s.expertise !== true) say('skills.expertise is true or left out');
    } else if (!(s && isInt(s.n) && s.n > 0 && ['class', 'any'].includes(s.from))) say('skills is { n, from: class | any }, or { n, from: [skills] }');
    else if (s.expertise !== undefined) say('skills.expertise is for skills chosen from a list');
  }
  if (g.abilityBonus !== undefined && !(g.abilityBonus && Object.entries(g.abilityBonus).every(([k, v]) => (ABILITIES.includes(k) && isInt(v)) || (k === 'max' && isInt(v))))) say('abilityBonus gives numbers for abilities and a max');
  // `proficiency.weapons`: `martial`, or (#544) weapons named by id, up to 12 (the id is checked against the SRD's and the pack's weapons for a subclass, in `lintSubclass`). Only a subclass's feature may name one.
  if (g.proficiency !== undefined) {
    const named = (x) => typeof x === 'string' && x !== 'martial';
    const ws = g.proficiency?.weapons;
    if (!(g.proficiency && Object.keys(g.proficiency).every((k) => ['weapons', 'armour'].includes(k)) && (ws === undefined || (Array.isArray(ws) && ws.every((x) => x === 'martial' || (named(x) && ID.test(x))) && new Set(ws).size === ws.length && ws.length <= 12)) && allOf(ARMOUR_CATEGORIES)(g.proficiency.armour ?? []))) say('proficiency gives weapons (martial, or up to 12 different weapons named by id) and armour categories');
    else if (ws?.some(named) && cls === FEAT_CLASS) say('a feat or an item cannot name the weapons it trains: only a feature of a subclass can');
  }
  if (g.recover !== undefined && !(g.recover && g.recover.levels === 'half-up' && isInt(g.recover.max))) say('recover is { levels: "half-up", max }');
  if (g.resist !== undefined && !allOf(DAMAGE_TYPES)(g.resist)) say('resist lists damage types');
  if (g.conditionImmune !== undefined && !(allOf(CONDITIONS)(g.conditionImmune) && g.conditionImmune.length)) say('conditionImmune lists conditions');
  if (g.spellLists !== undefined && !(Array.isArray(g.spellLists) && g.spellLists.length && g.spellLists.every((x) => ID.test(x)))) say('spellLists names classes whose spell lists it opens');
  if (g.critOn !== undefined && !(isInt(g.critOn) && g.critOn >= 15 && g.critOn <= 19)) say('critOn is the lowest d20 roll that is a Critical Hit');
  // `moveWith: { of }`: starting that feature's lasting effect with its action (not extending it) also
  // gives up to half the creature's Speed of movement in that turn (Instinctive Pounce with Rage).
  if (g.moveWith !== undefined && !(g.moveWith && ID.test(g.moveWith.of ?? '') && Object.keys(g.moveWith).length === 1)) say('moveWith is { of: feature id }');
  // `brutal`: once on its turn, after using the feature `after` that turn (Reckless Attack), the
  // creature gives up Advantage on one Strength attack roll that has no Disadvantage; on a hit it deals
  // `dice` more of the attack's type and one of `options` happens to the target (Brutal Strike; a
  // later feature adds options). An option is { id, name, effects, unique? }; `unique`: a target has
  // only the most recent one.
  if (g.brutal !== undefined) {
    const b = g.brutal;
    if (!b || typeof b !== 'object' || Array.isArray(b) || !Object.keys(b).every((k) => ['after', 'dice', 'options'].includes(k))) say('brutal is { after?, dice?, options }');
    else {
      if (b.after !== undefined && !ID.test(b.after)) say('brutal.after names a feature');
      if (b.dice !== undefined && !isDice(b.dice)) say('brutal.dice is dice');
      if ((b.after === undefined) !== (b.dice === undefined)) say('brutal gives after and dice together (the feature itself), or neither (more options)');
      if (!(Array.isArray(b.options) && b.options.length)) say('brutal.options lists options');
      else for (const o of b.options) {
        if (!(o && ID.test(o.id ?? '') && isText(o.name) && Object.keys(o).every((k) => ['id', 'name', 'effects', 'unique'].includes(k)))) { say('a brutal option is { id, name, effects, unique? }'); continue; }
        if (o.unique !== undefined && o.unique !== true) say('a brutal option\'s unique is true or left out');
        lintSteps(bakeValues(o.effects, cls, say), say);
      }
    }
  }
  // `relentless`: dropping to 0 Hit Points without dying outright while the feature `while` has its
  // effect going, the creature makes a Constitution save, DC `dc` and `step` more for each earlier use
  // since its last rest; on a success its Hit Points become `hp` (Relentless Rage).
  if (g.relentless !== undefined) {
    const r = g.relentless;
    if (!(r && ID.test(r.while ?? '') && isInt(r.dc) && r.dc > 0 && isInt(r.step) && r.step >= 0 && r.hp !== undefined && Object.keys(r).length === 4)) say('relentless is { while, dc, step, hp }');
    else lintAmount(r.hp, cls, say, 'relentless.hp');
  }
  // `initiative`: when the creature rolls Initiative, the feature named in `regain` gets back all its
  // uses (or, with `upTo`, as many as make it that many), and with `heal` the creature regains that
  // many Hit Points (`addLevel`: plus its class level). With uses of its own, it spends one, and only
  // when it gives something back. `unless`: not if that other feature was used on this roll.
  if (g.initiative !== undefined) {
    const x = g.initiative;
    if (!(x && ID.test(x.regain ?? '') && Object.keys(x).every((k) => ['regain', 'upTo', 'heal', 'addLevel', 'unless'].includes(k)))) say('initiative is { regain, upTo?, heal?, addLevel?, unless? }');
    else {
      if (x.upTo !== undefined && !(isInt(x.upTo) && x.upTo > 0)) say('initiative.upTo is a whole number');
      if (x.heal !== undefined) lintAmount(x.heal, cls, say, 'initiative.heal', true);
      if (x.addLevel !== undefined && !(x.addLevel === true && x.heal !== undefined)) say('initiative.addLevel is true, with heal');
      if (x.unless !== undefined && !ID.test(x.unless)) say('initiative.unless names a feature');
    }
  }
  // `persist: { of, endsOn }`: that feature's lasting effect lasts its whole duration without being
  // extended, and ends early only when its creature has the condition `endsOn` (Persistent Rage).
  // `reroll: { cost, add? }`: when the creature fails a saving throw, it rolls it again, adding `add`
  // (an amount: Indomitable's Fighter level), for one use of the feature `cost`, and must use the new
  // roll. Taken by standing instruction (reactions.js, `always` or `never`) where the new roll could succeed.
  if (g.reroll !== undefined) {
    if (!(g.reroll && ID.test(g.reroll.cost ?? '') && Object.keys(g.reroll).every((k) => ['cost', 'add'].includes(k)))) say('reroll is { cost, add? }');
    else if (g.reroll.add !== undefined) lintAmount(g.reroll.add, cls, say, 'reroll.add');
  }
  // `missed: { modifier, ends }`: when the creature misses with an attack roll, it gains this modifier,
  // against that target only, until `ends` (Studied Attacks: Advantage on its next attack roll, to the
  // end of its next turn).
  if (g.missed !== undefined) {
    const x = g.missed;
    if (!(x && x.modifier && x.ends && Object.keys(x).length === 2 && ['turnStart', 'turnEnd'].includes(x.ends.on) && Object.keys(x.ends).length === 1)) say('missed is { modifier, ends: { on: turnStart | turnEnd } }');
    else { lintModifier(x.modifier, say); if (!x.modifier.on.startsWith('attack.roll')) say('missed gives a modifier on attack.roll'); }
  }
  // `evasion: true`: an effect that lets it make a Dexterity save for half damage does none on a
  // success and half on a failure, while it is not Incapacitated (Evasion).
  if (g.evasion !== undefined && g.evasion !== true) say('evasion is true');
  // `surfaces: true`: while it wears no armour and holds no Shield, it moves across water without
  // falling in, and may not stop there (Acrobatic Movement; vertical surfaces are the DM's).
  if (g.surfaces !== undefined && g.surfaces !== true) say('surfaces is true');
  // `selfCure: { conditions }`: at the end of each of its turns, one of these conditions it has ends
  // (the first of the list it has: Self-Restoration).
  if (g.selfCure !== undefined && !(g.selfCure && allOf(CONDITIONS)(g.selfCure.conditions) && g.selfCure.conditions.length && Object.keys(g.selfCure).length === 1)) say('selfCure is { conditions }');
  // `allTypes: { of }`: that feature's reaction is taken against an attack of any damage type (Deflect Energy).
  if (g.allTypes !== undefined && !(g.allTypes && ID.test(g.allTypes.of ?? '') && Object.keys(g.allTypes).length === 1)) say('allTypes is { of: feature id }');
  // `fleet: { of }`: after a Bonus Action that is not that feature, the creature may use it without
  // spending a Bonus Action, once a turn (Fleet Step with Step of the Wind).
  if (g.fleet !== undefined && !(g.fleet && ID.test(g.fleet.of ?? '') && Object.keys(g.fleet).length === 1)) say('fleet is { of: feature id }');
  // `cunning`: when its Sneak Attack deals damage, the creature may give up Sneak Attack dice (`cost`
  // each) for effects on the target after the damage (Cunning Strike), up to `max` effects (1 unless a
  // feature says 2: Improved Cunning Strike). An option is { id, name, cost, effects?, duration?,
  // needs?, size?, keepHidden? }: `duration`, a lasting effect for its steps (Poison's minute);
  // `needs`, gear it must carry (a Poisoner's Kit); `size`, the largest target it works on (Trip);
  // `keepHidden`, the attack does not end its hiding if it ends its turn behind Three-Quarters or Total
  // Cover from every enemy (Stealth Attack). A save step's `dc` may be an ability: 8 + Proficiency + it.
  if (g.cunning !== undefined) {
    const x = g.cunning;
    if (!(x && typeof x === 'object' && Object.keys(x).every((k) => ['max', 'options'].includes(k)) && (x.max !== undefined || x.options !== undefined))) say('cunning is { max?, options? }');
    else {
      if (x.max !== undefined && !(isInt(x.max) && x.max >= 1 && x.max <= 3)) say('cunning.max is 1 to 3');
      if (x.options !== undefined) {
        if (!(Array.isArray(x.options) && x.options.length)) say('cunning.options lists options');
        else for (const o of x.options) {
          if (!(o && ID.test(o.id ?? '') && isText(o.name) && isInt(o.cost) && o.cost >= 1 && o.cost <= 10 && Object.keys(o).every((k) => ['id', 'name', 'cost', 'effects', 'duration', 'needs', 'size', 'keepHidden'].includes(k)))) { say('a cunning option is { id, name, cost, effects?, duration?, needs?, size?, keepHidden? }'); continue; }
          if (o.effects === undefined && !o.keepHidden) say(`cunning option ${o.id} has effects or keepHidden`);
          if (o.effects !== undefined) lintSteps(bakeValues(o.effects, cls, say), say);
          if (o.duration !== undefined && !isDuration(o.duration)) say('a cunning option\'s duration is a duration');
          if (o.needs !== undefined && !ID.test(o.needs)) say('a cunning option\'s needs names gear');
          if (o.size !== undefined && !SIZES.includes(o.size)) say('a cunning option\'s size is a size');
          if (o.keepHidden !== undefined && o.keepHidden !== true) say('keepHidden is true');
        }
      }
    }
  }
  // `empowered: { school, list, ability }`: a spell of that school on that class's list adds the ability's
  // modifier to one of its damage rolls, the caster's pick (`cast` with `empower`: Empowered Evocation).
  if (g.empowered !== undefined && !(g.empowered && SCHOOLS.includes(g.empowered.school) && ID.test(g.empowered.list ?? '') && ABILITIES.includes(g.empowered.ability) && Object.keys(g.empowered).length === 3)) say('empowered is { school, list, ability }');
  // `overchannel: { list, maxSlot, die }`: a damaging spell of that list cast with a slot up to `maxSlot` may deal
  // its dice at their highest (`cast` with `overchannel: true`); from the second use before a Long Rest the caster
  // takes `die`s of Necrotic damage per slot level, one more each time, ignoring Resistance and Immunity.
  if (g.overchannel !== undefined && !(g.overchannel && ID.test(g.overchannel.list ?? '') && isInt(g.overchannel.maxSlot) && g.overchannel.maxSlot >= 1 && g.overchannel.maxSlot <= 9
    && [4, 6, 8, 10, 12].includes(g.overchannel.die) && Object.keys(g.overchannel).length === 3)) say('overchannel is { list, maxSlot, die }');
  // `afterHit: { modifier }`: a creature that hits it with an attack roll gets this modifier (on attack.roll), against
  // it only, until the end of the current turn (Multiattack Defense).
  if (g.afterHit !== undefined) {
    if (!(g.afterHit && g.afterHit.modifier && Object.keys(g.afterHit).length === 1)) say('afterHit is { modifier }');
    else { lintModifier(g.afterHit.modifier, say); if (g.afterHit.modifier.on !== 'attack.roll') say('afterHit gives a modifier on attack.roll'); }
  }
  // `markSpread: { spell, range }`: once a turn, when its attack damages a creature its `spell` marks (a modifier
  // the spell put on its caster against that creature), it may deal the mark's extra damage to another creature it
  // can see within `range` feet of the first (`attack` with `prey`: Superior Hunter's Prey).
  if (g.markSpread !== undefined && !(g.markSpread && ID.test(g.markSpread.spell ?? '') && isInt(g.markSpread.range) && g.markSpread.range > 0 && g.markSpread.range % 5 === 0 && Object.keys(g.markSpread).length === 2)) say('markSpread is { spell, range }');
  // `steadfast: { spell }`: taking damage does not make it save to keep Concentration on that spell (Relentless Hunter).
  if (g.steadfast !== undefined && !(g.steadfast && ID.test(g.steadfast.spell ?? '') && Object.keys(g.steadfast).length === 1)) say('steadfast is { spell }');
  // `spellRange: { spell, perLevel }`: that spell's range is longer by so many feet per class level (Eldritch Spear).
  if (g.spellRange !== undefined && !(g.spellRange && ID.test(g.spellRange.spell ?? '') && isInt(g.spellRange.perLevel) && g.spellRange.perLevel > 0 && Object.keys(g.spellRange).length === 2)) say('spellRange is { spell, perLevel }');
  // `repel: { spell, feet }`: a Large or smaller creature that spell hits with an attack roll may be pushed up to
  // `feet` straight away (`cast` with `repel`: Repelling Blast).
  if (g.repel !== undefined && !(g.repel && ID.test(g.repel.spell ?? '') && isInt(g.repel.feet) && g.repel.feet > 0 && g.repel.feet % 5 === 0 && Object.keys(g.repel).length === 2)) say('repel is { spell, feet }');
  // `restExhaustion: 'short'`: each Short Rest it finishes lowers its Exhaustion by 1 (Tireless).
  if (g.restExhaustion !== undefined && g.restExhaustion !== 'short') say('restExhaustion is "short"');
  // `forgoAttack: { spell }` (C9c, Pact of the Chain): when it takes the Attack action it may give up one of its attacks
  // so that its familiar made by `spell` makes one attack with its Reaction (`attack` with `familiar` and `via`).
  if (g.forgoAttack !== undefined && !(g.forgoAttack && ID.test(g.forgoAttack.spell ?? '') && Object.keys(g.forgoAttack).length === 1)) say('forgoAttack is { spell }');
  if (g.invest !== undefined) { const why = investProblem(g.invest); if (why) say(why); }
  if (g.attune !== undefined && !(isInt(g.attune) && g.attune >= 4 && g.attune <= 6)) say('attune is how many magic items it may be attuned to, 4 to 6');
  if (g.persist !== undefined && !(g.persist && ID.test(g.persist.of ?? '') && g.persist.endsOn === 'unconscious' && Object.keys(g.persist).length === 2)) say('persist is { of, endsOn: "unconscious" }');
  if (g.formOf !== undefined) { const why = formOfProblem(g.formOf, cls); if (why) say(why); }
  if (g.triggers !== undefined) triggersProblems(g.triggers, cls, say);
}
// `reaction: { on: 'attacks', of, attack: 'melee' }` (#537, addition I of homebrew-subclasses.md): when a hostile creature under the lasting effect of the holder's feature `of` makes an attack,
// the holder's Reaction is one melee weapon attack against it (Soul of Vengeance). Null if it is whole, or what is wrong. Which feature `of` may name is checked in the subclass (`lintSubclass`).
export const ATTACKS_REACTION_KEYS = ['on', 'of', 'attack'];
export function attacksReactionProblem(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r) || Object.keys(r).length !== 3 || !ATTACKS_REACTION_KEYS.every((k) => Object.hasOwn(r, k)) || !ID.test(r.of ?? '') || r.attack !== 'melee') return 'an attacks reaction is { on: "attacks", of: a feature id, attack: "melee" }';
  return null;
}
// `triggers: { attackAction?, opportunityHit? }` (#534, addition H of homebrew-subclasses.md): what the holder does sets something off. Only a subclass's feature has one.
//   attackAction: { modifiers }   when it takes the Attack action on its turn in a fight: these modifiers go on it until the end of that turn, once a turn (Blade Flourish)
//   opportunityHit: { move: 'half' }   when its Opportunity Attack hits: up to half its Speed to move, without provoking (Relentless Avenger); spent with a `move` of its own
export const TRIGGER_KEYS = ['attackAction', 'opportunityHit'];
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export function triggersProblems(x, cls, say) {
  if (!isObj(x) || !Object.keys(x).length) return say('triggers is { attackAction?, opportunityHit? }, with at least one');
  for (const k of Object.keys(x)) if (!TRIGGER_KEYS.includes(k)) say(`"${k}" is not a trigger a feature can state (${TRIGGER_KEYS.join(', ')})`);
  const a = x.attackAction, o = x.opportunityHit;
  if (a !== undefined) {
    if (!isObj(a) || !Object.keys(a).every((k) => k === 'modifiers')) say('triggers.attackAction is { modifiers }');
    else if (!Array.isArray(a.modifiers) || !a.modifiers.length || a.modifiers.length > 5) say('triggers.attackAction.modifiers is a list of 1 to 5 modifiers');
    else for (const [i, m] of bakeValues(a.modifiers, cls, say).entries()) {
      if (!isObj(m)) { say('a modifier of triggers.attackAction is { on, op, value, ... }'); continue; }
      lintModifier(m, say);
      // Feet are whole numbers: not dice, nor a column of the class table that holds dice (the bard's Bardic Inspiration die), however the linter stood the amount in.
      const raw = a.modifiers[i]?.value, col = raw && typeof raw === 'object' ? cls?.table?.[raw.column] : undefined;
      if (typeof m.on === 'string' && m.on.startsWith('speed') && (typeof m.value !== 'number' || (raw && typeof raw === 'object' && raw.die !== undefined) || (Array.isArray(col) && !col.every((v) => v === null || typeof v === 'number'))))
        say('a Speed modifier of triggers.attackAction is a number of feet (dice, and a class table of dice, are not feet)');
      for (const k of ['against', 'except', 'uses', 'onFail', 'cost']) if (m[k] !== undefined) say(`a modifier of triggers.attackAction lasts for the turn and is the holder's own: \`${k}\` is not for it`);
    }
  }
  if (o !== undefined && !(isObj(o) && Object.keys(o).length === 1 && o.move === 'half')) say('triggers.opportunityHit is { move: "half" }');
}
// `formOf: { of, maxCr?, types?, typesMaxCr?, forms?, tempHp?, cost? }` (#516 and #525, addition J of homebrew-subclasses.md): a feature of a subclass changes the form
// of the feature `of` (Wild Shape: a feature whose action has a `form`), as the class's own `form` says it, and at the class's own level:
//   maxCr      the highest Challenge Rating of a form (a number, or `{ byLevel }`); the higher of this and the feature's own stands
//   types      creature types the feature may also take the form of (not one it already takes)
//   typesMaxCr the highest Challenge Rating of a form of those `types` alone (a number, or `{ byLevel }`): the rating of an added type, in place of the feature's own;
//              only with `types` (#525; `maxCr` keeps its meaning of every form)
//   forms      named forms (monster ids of the SRD or of the pack) the feature may also take, whatever their type and Challenge Rating (#525)
//   tempHp     Temporary Hit Points more on taking a form (an amount of the class: a number, `{ perLevel }`, `{ byLevel }`, `{ column }`)
//   cost       `{ resource, n? }`: what a form of one of the `types` or `forms` it adds spends (n uses of that pool, 1 if n is left out), in place of a use of the feature itself;
//              with neither `types` nor `forms`, what every form spends
// At least one of maxCr, types, forms, tempHp or cost. Null if it is whole, or what is wrong.
export const FORM_OF_KEYS = ['of', 'maxCr', 'types', 'typesMaxCr', 'forms', 'tempHp', 'cost'];
export function formOfProblem(x, cls) {
  if (!x || typeof x !== 'object' || Array.isArray(x) || !Object.keys(x).every((k) => FORM_OF_KEYS.includes(k))) return `formOf is { ${FORM_OF_KEYS.join(', ')} }, with only of required`;
  if (!ID.test(x.of ?? '')) return 'formOf names the feature whose form it changes (of: a feature id)';
  if (Object.keys(x).filter((k) => k !== 'typesMaxCr').length < 2) return 'formOf changes something: maxCr, types, tempHp or cost, or forms';
  const cr = (v) => typeof v === 'number' && v >= 0 && v <= 30 && Number.isInteger(v * 8);
  const crOk = (r) => cr(r) || (r && typeof r === 'object' && !Array.isArray(r) && Object.keys(r).length === 1 && r.byLevel && typeof r.byLevel === 'object'
    && Object.keys(r.byLevel).length > 0 && Object.entries(r.byLevel).every(([l, v]) => isInt(+l) && String(+l) === l && +l >= 1 && +l <= LEVELS && cr(v)));
  if (x.maxCr !== undefined && !crOk(x.maxCr)) return 'formOf.maxCr is a Challenge Rating (a whole number, or a fraction in eighths), or { byLevel } of them';
  if (x.types !== undefined && !(Array.isArray(x.types) && x.types.length && allOf(CREATURE_TYPES)(x.types) && new Set(x.types).size === x.types.length)) return 'formOf.types lists creature types, each once';
  if (x.typesMaxCr !== undefined) {
    if (!crOk(x.typesMaxCr)) return 'formOf.typesMaxCr is a Challenge Rating (a whole number, or a fraction in eighths), or { byLevel } of them';
    if (x.types === undefined) return 'formOf.typesMaxCr is the rating of the types the grant adds, so it needs `types` (maxCr is the rating of every form)';
  }
  if (x.forms !== undefined && !(Array.isArray(x.forms) && x.forms.length && x.forms.length <= 20 && x.forms.every((m) => typeof m === 'string' && ID.test(m)) && new Set(x.forms).size === x.forms.length)) return 'formOf.forms lists monsters by id, from 1 to 20, each once';
  if (x.tempHp !== undefined) {
    let why = null;
    lintAmount(x.tempHp, cls, (m) => { why ??= m; }, 'formOf.tempHp');
    if (why) return why;
    // More Temporary Hit Points: every number it states (a number, a perLevel, a byLevel's values) is at least 1.
    const t = x.tempHp, low = typeof t === 'number' ? t < 1 : t && typeof t === 'object' && (t.perLevel < 1 || (t.byLevel && Object.values(t.byLevel).some((v) => v < 1)));
    if (low) return 'formOf.tempHp is at least 1 in every number it gives (a number, a perLevel, a value of byLevel)';
  }
  if (x.cost !== undefined && !(x.cost && typeof x.cost === 'object' && !Array.isArray(x.cost) && Object.keys(x.cost).every((k) => ['resource', 'n'].includes(k)) && ID.test(x.cost.resource ?? '')
    && (x.cost.n === undefined || (isInt(x.cost.n) && x.cost.n > 0 && x.cost.n <= 10)))) return 'formOf.cost is { resource, n? }, n from 1 to 10';
  return null;
}
// A freeCast of named spells may also say (#232): `atWill` (no uses), `self` (on its caster only), `dark` (only in
// Dim Light or Darkness), `sureSave` (its caster succeeds on the spell's saves), `maxTemp` (Temporary Hit Point
// dice at their highest) and `time: 'action'` (cast as a Magic action whatever its casting time).
const FREE_CAST_FLAGS = ['atWill', 'self', 'dark', 'sureSave', 'maxTemp'];
// And (#414, docs/specs/companions.md, amendment C9b), each optional and only on a freeCast of named spells: `forms` (extra
// pack monsters its caster may choose for a summon of forms), plus the keys below as they are built.
const FREE_CAST_LISTS = {
  ends: (v) => Array.isArray(v) && v.length >= 1 && v.length <= SUMMON_ENDS.length && v.every((x) => SUMMON_ENDS.includes(x)) && new Set(v).size === v.length,
  types: (v) => Array.isArray(v) && v.length >= 1 && v.length <= CREATURE_TYPES.length && v.every((x) => CREATURE_TYPES.includes(x)) && new Set(v).size === v.length,
  forms: (v) => Array.isArray(v) && v.length >= 1 && v.length <= 20 && v.every((id) => typeof id === 'string' && ID.test(id)) && new Set(v).size === v.length,
};
const validFreeCastCost = (c) => !!c && typeof c === 'object' && !Array.isArray(c) && Object.keys(c).length === 2 && c.slot === true && typeof c.uses === 'string' && ID.test(c.uses);
// What is wrong with a freeCast, one sentence for each thing, naming the key (never throws, whatever it is given).
const FC_WHAT = {
  forms: 'is a list of 1 to 20 pack monster ids, no repeats', types: 'is a list of 1 to 14 different creature types', ends: 'is a list of masterDies and/or longRest, no repeats',
  cost: 'is { slot: true, uses: <feature id> }', components: 'is "none"', time: 'is "action"',
};
function freeCastProblems(x) {
  const base = 'freeCast is { list, maxLevel } or { spells }';
  if (!x || typeof x !== 'object' || Array.isArray(x)) return [base];
  if (Object.keys(x).length === 2 && ID.test(x.list ?? '') && isInt(x.maxLevel) && x.maxLevel >= 1 && x.maxLevel <= 9) return [];
  if (!(Array.isArray(x.spells) && x.spells.length > 0 && x.spells.every((id) => typeof id === 'string' && ID.test(id)))) return [base];
  const out = [];
  for (const k of Object.keys(x)) {
    const v = x[k];
    if (k === 'spells') continue;
    if (FREE_CAST_FLAGS.includes(k)) { if (v !== true) out.push(`freeCast ${k} is true or left out`); }
    else if (k === 'time') { if (v !== 'action') out.push(`freeCast ${k} ${FC_WHAT[k]}`); }
    else if (Object.hasOwn(FREE_CAST_LISTS, k)) { if (!FREE_CAST_LISTS[k](v)) out.push(`freeCast ${k} ${FC_WHAT[k]}`); }
    else if (k === 'cost') { if (!validFreeCastCost(v)) out.push(`freeCast ${k} ${FC_WHAT[k]}`); }
    else if (k === 'components') { if (v !== 'none') out.push(`freeCast ${k} ${FC_WHAT[k]}`); }
    else out.push(`freeCast has no "${k}"`);
  }
  if (x.cost !== undefined && x.atWill !== undefined) out.push('freeCast cost and atWill are two answers to what the cast spends: say one');
  return out;
}
const validFreeCast = (x) => freeCastProblems(x).length === 0;
function lintFeature(f, cls, say, ids) {
  const sub = (m) => say(`feature ${typeof f?.id === 'string' ? f.id : '(without an id)'}: ${m}`);
  if (!f || !ID.test(f.id ?? '') || ids.has(f.id)) return sub('needs a kebab-case id used once in the class');
  ids.add(f.id);
  if (!isText(f.name) || !isText(f.text)) sub('needs a name and text');
  if (!(isInt(f.level) && f.level >= 1 && f.level <= LEVELS)) sub('level is 1 to 20');
  if (!TIERS.includes(f.tier)) sub(`tier is one of ${TIERS.join(', ')}`);
  if (typeof f.checked !== 'boolean') sub('needs `checked`');
  if (f.uses !== undefined) {
    const u = f.uses;
    if (!u || typeof u !== 'object') sub('uses is { max, recharge, short? }');
    else {
      lintAmount(u.max, cls, sub, 'uses.max');
      const rest = (x) => RESTS.includes(x);
      if (!(rest(u.recharge) || (u.recharge && typeof u.recharge === 'object' && Object.entries(u.recharge).every(([l, r]) => isInt(+l) && +l >= 1 && +l <= LEVELS && rest(r))))) sub('uses.recharge is short or long, or by level');
      if (u.short !== undefined && !(isInt(u.short) && u.short > 0)) sub('uses.short is how many come back on a Short Rest');
    }
  }
  if (f.grants !== undefined) lintGrants(f.grants, cls, sub);
  // Skills from a list are picked on the sheet's `choices` for the feature, which a feature with options already uses for its option: so a feature has one or the other, and an option has no list (#544).
  if (Array.isArray(f.grants?.skills?.from) && f.options !== undefined) sub('skills from a list are picked on the same sheet entry as an option: a feature with options cannot also give them');
  if (f.grants?.action?.cost && !f.grants.action.cost.resource && f.grants.action.cost.slot === undefined) sub('a cost names a resource');
  // `feat: "any"`: the feature is a place for a feat of the player's choice, of any category, whose
  // prerequisites the character meets (Ability Score Improvement, Epic Boon). The feat is the sheet's
  // (derive.js, sheet `feats`); the feature grants nothing itself.
  if (f.feat !== undefined && !(f.feat === 'any' && f.grants === undefined && f.options === undefined && f.uses === undefined)) sub('feat is "any", on a feature that grants nothing else');
  // `pick`: so many different options are chosen (Metamagic: 2), as a list; otherwise one.
  // Or a column of the class table (Eldritch Invocations: `{ column: 'invocations' }`), each level's count below the options'.
  if (f.pick !== undefined && !(Array.isArray(f.options) && (isInt(f.pick) ? f.pick >= 2 && f.pick < f.options.length
    : f.pick && Object.keys(f.pick).length === 1 && Array.isArray(cls.table?.[f.pick.column]) && cls.table[f.pick.column].every((n) => n === null || (isInt(n) && n < f.options.length))))) sub('pick is how many options are chosen (2 or more and fewer than there are), or { column }');
  if (f.options !== undefined) {
    if (!Array.isArray(f.options) || f.options.length < 2) sub('options lists two or more choices');
    else for (const o of f.options) {
      const os = (m) => sub(`option ${o?.id}: ${m}`);
      if (!ID.test(o?.id ?? '') || !isText(o.name) || !isText(o.text) || !TIERS.includes(o.tier)) os('needs an id, a name, text and a tier');
      if (o?.grants !== undefined) lintGrants(o.grants, cls, os);
      if (Array.isArray(o?.grants?.skills?.from)) os('an option cannot give skills from a list: the sheet\'s one choice for the feature is the option');
      // `requires` (#232): a class level, another option of this feature, or a spell the character knows (an Eldritch
      // Invocation's prerequisite). `uses`: the option's own uses, as a feature's (Gift of the Depths' Water Breathing).
      if (o?.requires !== undefined && !(o.requires && typeof o.requires === 'object' && Object.keys(o.requires).length && Object.keys(o.requires).every((k) => ['level', 'option', 'spell'].includes(k))
        && (o.requires.level === undefined || (isInt(o.requires.level) && o.requires.level >= 1 && o.requires.level <= LEVELS))
        && (o.requires.option === undefined || f.options.some((x) => x?.id === o.requires.option && x !== o)) && (o.requires.spell === undefined || ID.test(o.requires.spell)))) os('requires gives a level, another option of the feature, or a spell');
      if (o?.uses !== undefined && !(o.uses && isInt(o.uses.max) && o.uses.max > 0 && RESTS.includes(o.uses.recharge) && Object.keys(o.uses).length === 2)) os('uses is { max, recharge }');
      if (o?.grants?.freeCast && !o.uses && !o.grants.freeCast.atWill && !o.grants.freeCast.cost) os('a freeCast needs uses, atWill or a cost');
      if (o?.grants?.freeCast?.cost && o.uses) os('a freeCast with a cost spends that, and has no uses of its own');
      // `feat`: the option is that feat (a Fighting Style feat); it grants what the feat grants (lintPack checks it is one).
      if (o?.feat !== undefined && !(o.feat === o.id && o.grants === undefined)) os('an option that is a feat has the feat\'s id and no grants of its own');
    }
  }
  // A feature that only adds steps to another's (`with`: Sear Undead in Turn Undead) grants nothing of its own.
  if (f.grants?.freeCast && !f.uses && !f.grants.freeCast.atWill && !f.grants.freeCast.cost) sub('a freeCast needs uses, atWill or a cost');
  if (f.grants?.freeCast?.cost && f.uses) sub('a freeCast with a cost spends that, and has no uses of its own');
  // A feature whose whole effect is an aura's range growing at its level (Aura Expansion) grants nothing itself.
  if (f.tier === 'auto' && !f.grants && !f.options && !f.uses && !f.feat && !['spellcasting', 'pact-magic'].includes(f.id) && !withRefs(cls).has(f.id) && !byLevelAt(cls).has(f.level)) sub('marked auto but grants nothing');
  // A manual feature may still have its cost enforced: an action whose only steps are manual.
  const costOnly = (g) => Object.keys(g).length === 1 && g.action?.effects?.every((st) => 'manual' in st);
  if (f.tier === 'manual' && f.grants && !costOnly(f.grants)) sub('marked manual but grants something');
}
// The class levels at which an aura's range grows (`{ byLevel }`): a feature there may be that change (Aura Expansion).
function byLevelAt(cls) {
  const out = new Set();
  for (const f of [...(cls.features ?? []), ...(cls.subclass?.features ?? [])]) for (const l of Object.keys(f.grants?.aura?.range?.byLevel ?? {})) out.add(+l);
  return out;
}
// The features a class's steps name in `with` (a step kept only for a character that has that feature).
function withRefs(cls) {
  const out = new Set();
  const visit = (steps) => { for (const st of Array.isArray(steps) ? steps : []) { if (st?.with !== undefined) out.add(st.with); for (const b of ['onHit', 'onMiss', 'onFail', 'onSuccess']) visit(st?.[b]); } };
  for (const f of [...(cls.features ?? []), ...(cls.subclass?.features ?? [])]) for (const g of [f.grants, ...(f.options ?? []).map((o) => o.grants)]) {
    visit(g?.action?.effects); for (const m of g?.action?.modes ?? []) visit(m.effects);
  }
  return out;
}
const tableRow = (row) => Array.isArray(row) && row.length === LEVELS;
function lintClass(e, say) {
  if (!ID.test(e.id ?? '') || !isText(e.name) || !isText(e.source) || !isText(e.text)) say('needs a kebab-case id, a name, a source and text');
  if (typeof e.checked !== 'boolean') say('needs `checked`');
  if (![6, 8, 10, 12].includes(e.hitDie)) say('hitDie is 6, 8, 10 or 12');
  if (!(allOf(ABILITIES)(e.saves) && e.saves.length === 2)) say('saves lists two abilities');
  if (!allOf(ABILITIES)(e.primary)) say('primary lists abilities');
  if (!allOf(ARMOUR_CATEGORIES)(e.armour)) say('armour lists armour categories');
  if (!allOf(['simple', 'martial', 'martial-light', 'martial-finesse-or-light'])(e.weapons) || !e.weapons.length) say('weapons lists simple, martial, martial-light or martial-finesse-or-light');
  if (e.tools !== undefined && !isText(e.tools)) say('tools is text');
  const sk = e.skills;
  if (!(sk && isInt(sk.choose) && sk.choose > 0 && (sk.from === 'any' || (Array.isArray(sk.from) && sk.from.every((x) => Object.hasOwn(SKILLS, x)) && sk.from.length >= sk.choose)))) say('skills is { choose, from: [skills] | "any" }');
  for (const [k, row] of Object.entries(e.table ?? {})) {
    if (!ID.test(k)) say(`table column "${k}" must be kebab-case`);
    if (!tableRow(row) || !row.every((v) => v === null || isInt(v) || isDice(v))) say(`table column "${k}" has 20 entries, numbers, dice or null`);
  }
  const c = e.casting;
  if (c !== null) {
    if (!c || !ABILITIES.includes(c.ability) || !['prepared', 'pact'].includes(c.kind)) say('casting is null or { ability, kind: prepared | pact, ... }');
    else {
      if (!tableRow(c.cantrips) || !c.cantrips.every((n) => isInt(n) && n >= 0)) say('casting.cantrips has 20 numbers');
      if (!tableRow(c.prepared) || !c.prepared.every((n) => isInt(n) && n >= 0)) say('casting.prepared has 20 numbers');
      if (c.kind === 'prepared' && !(tableRow(c.slots) && c.slots.every((r) => Array.isArray(r) && r.length <= 9 && r.every((n) => isInt(n) && n > 0)))) say('casting.slots has 20 rows of slots by spell level');
      if (c.kind === 'pact' && !(tableRow(c.slots) && tableRow(c.slotLevel) && c.slots.every((n) => isInt(n) && n > 0) && c.slotLevel.every((n) => isInt(n) && n >= 1 && n <= 5))) say('pact casting has 20 slot counts and 20 slot levels');
      if (c.from !== undefined && !isInt(c.from)) say('casting.from is the level spellcasting starts');
    }
  }
  // Multiclassing, optional (SRD "Multiclassing" and each class's "As a Multiclass Character"): the scores a
  // character needs to take or keep the class (`all` of them, or `any` one, at 13 or more), the armour
  // and weapon training and skill picks it gives when it is not the first class, and how its levels
  // count for the Multiclass Spellcaster table (`full`, `half` rounded up, `pact` apart, or null).
  // Left out, the class cannot be part of a character with several classes.
  const mc = e.multiclass;
  if (mc === undefined) { /* not multiclassable */ } else if (!mc || typeof mc !== 'object' || !Object.keys(mc).every((k) => ['requires', 'armour', 'weapons', 'skills', 'tools', 'caster'].includes(k))) say('multiclass is { requires, armour, weapons, skills?, tools?, caster }');
  else {
    const rq = mc.requires, keys = rq && typeof rq === 'object' ? Object.keys(rq) : [];
    if (!(keys.length === 1 && ['all', 'any'].includes(keys[0]) && allOf(ABILITIES)(rq[keys[0]]) && rq[keys[0]].length)) say('multiclass.requires is { all: [abilities] } or { any: [abilities] }');
    if (!allOf(ARMOUR_CATEGORIES)(mc.armour)) say('multiclass.armour lists armour categories');
    if (!allOf(['simple', 'martial'])(mc.weapons)) say('multiclass.weapons lists simple or martial');
    if (mc.skills !== undefined && !(isInt(mc.skills?.choose) && mc.skills.choose > 0 && ['any', 'class'].includes(mc.skills.from))) say('multiclass.skills is { choose, from: "any" | "class" }');
    if (mc.tools !== undefined && !isText(mc.tools)) say('multiclass.tools is text');
    if (![null, 'full', 'half', 'pact'].includes(mc.caster)) say('multiclass.caster is full, half, pact or null');
    if ((mc.caster === null) !== (e.casting === null) || (mc.caster === 'pact') !== (e.casting?.kind === 'pact')) say('multiclass.caster must agree with casting');
  }
  const ids = new Set();
  if (!Array.isArray(e.features) || !e.features.length) say('needs features');
  for (const f of e.features ?? []) lintFeature(f, e, say, ids);
  const sc = e.subclass;
  if (!sc || !ID.test(sc.id ?? '') || !isText(sc.name) || !isText(sc.text) || typeof sc.checked !== 'boolean') say('needs a subclass with an id, a name, text and `checked`');
  else {
    for (const f of sc.features ?? []) lintFeature(f, e, (m) => say(`subclass ${sc.id}: ${m}`), ids);
    if (sc.spells !== undefined && !Object.entries(sc.spells).every(([l, list]) => isInt(+l) && +l >= 1 && +l <= LEVELS && Array.isArray(list) && list.every((x) => ID.test(x)))) say('subclass spells are lists of spell ids by class level');
  }
  const known = new Set([...(e.features ?? []), ...(sc?.features ?? [])].map((f) => f?.id));
  for (const id of withRefs(e)) if (!known.has(id)) say(`a step comes \`with\` "${id}", which is not a feature of this class`);
  if (findFunction(e)) say('content is data only');
}

// ---------- a homebrew subclass of an SRD class (docs/specs/homebrew-subclasses.md, Decision 1; stage B1) ----------
// A subclass entry names the SRD class it belongs to (`class`) and holds what an SRD class's `subclass` object holds: `spells` by
// class level (always prepared) and `features`, in the class feature vocabulary. It is linted INSIDE its class: each feature goes to
// `lintFeature` with the class's own table and features around it, so an amount may name a column of the class table
// (`{ column: 'bardic-die' }`) and a cost the class's pools (`channel-divinity`). The class's own features are not linted again.
// The prefix of its ids, its source, `checked` and its name are the homebrew rules (`lintRules`), not this function's.
// What the linter reads of the SRD comes from `ctx.srd` or the reference the registry gave (`useSrdReference`): `classTable` (or
// `classes`), `feats` and `spells`. `ctx.spell(id)` says what a spell id is: { level }, null (not a spell of the SRD or the pack) or
// undefined (cannot be told here).
const SUBCLASS_FIRST = 3;
const SUBCLASS_NOTES = 500;                       // letters of `dmNotes` (homebrew.md, Decision 5)
const classTableOf = (ref) => ref?.classTable ?? ref?.classes;
// The SRD's subclasses by id, as `{ id, name, class }`, read from a table of classes (a homebrew one's id and name may not be theirs).
export function srdSubclassesOf(classes) {
  const out = {};
  for (const c of Object.values(classes ?? {})) if (c?.subclass?.id) out[c.subclass.id] = { id: c.subclass.id, name: c.subclass.name, class: c.id };
  return out;
}
// The highest spell level of the slots a class has at a class level (0 when it has none yet).
function highestSlot(cls, level) {
  const c = cls.casting;
  if (!c) return 0;
  if (c.kind === 'pact') return c.slotLevel?.[level - 1] ?? 0;
  return c.slots?.[level - 1]?.length ?? 0;
}
// The features a feature's grants name (`cost`: a pool, `ref`: any feature): [what, id].
function featureRefs(g) {
  const out = [];
  if (!g || typeof g !== 'object') return out;
  const add = (what, id) => { if (typeof id === 'string') out.push([what, id]); };
  const a = g.action;
  add('cost', a?.cost?.resource); add('cost', a?.orCost?.resource); add('ref', a?.orCost?.with);
  for (const m of Array.isArray(a?.modes) ? a.modes : []) add('cost', m?.cost?.resource);
  for (const list of [a?.effects, ...(Array.isArray(a?.modes) ? a.modes.map((m) => m?.effects) : [])]) walkSteps(list, (st) => { if (st && typeof st === 'object') add('ref', st.with); });
  add('ref', g.moveWith?.of); add('ref', g.restore?.of); add('ref', g.persist?.of); add('ref', g.fleet?.of);
  add('ref', g.metamagicMax?.while); add('ref', g.relentless?.while);
  add('cost', g.freeCast?.cost?.uses); add('cost', g.reroll?.cost); add('cost', g.metamagic?.pool);
  add('ref', g.initiative?.regain); add('ref', g.initiative?.unless); add('ref', g.brutal?.after);
  add('ref', g.formOf?.of); add('cost', g.formOf?.cost?.resource); add('ref', a?.inForm);
  if (g.reaction?.on === 'attacks') add('ref', g.reaction.of);
  return out;
}
// Every modifier (an object with a hook, an op and a number) in a list of features: in grants, auras and the steps of actions.
function modifiersIn(features) {
  const out = [], stack = grantsOf(features);
  while (stack.length) {
    const v = stack.pop();
    if (Array.isArray(v)) { for (const x of v) if (x && typeof x === 'object') stack.push(x); continue; }
    if (typeof v.on === 'string' && typeof v.op === 'string' && typeof v.value === 'number') out.push(v);
    for (const k of Object.keys(v)) if (v[k] && typeof v[k] === 'object') stack.push(v[k]);
  }
  return out;
}
// The grants of a list of features, options included.
const grantsOf = (features) => features.flatMap((f) => [f?.grants, ...(Array.isArray(f?.options) ? f.options.map((o) => o?.grants) : [])]).filter((g) => g && typeof g === 'object');
function lintSubclass(e, say, ctx = {}) {
  const ref = ctx.srd ?? SRD_REF, table = classTableOf(ref);
  if (!ID.test(e.id ?? '') || !isText(e.name) || !isText(e.text)) say('needs a kebab-case id, a name and text');
  if (!isText(e.source)) say('needs a source');
  if (typeof e.checked !== 'boolean') say('needs `checked`');
  if (findFunction(e)) say('content is data only');
  const cls = typeof e.class === 'string' && table && Object.hasOwn(table, e.class) ? table[e.class] : null;
  if (!cls) {
    if (typeof e.class === 'string' && e.class.startsWith('hb-')) say(`class "${e.class}" is a homebrew class: a subclass is of an SRD class (a homebrew class is not possible yet)`);
    else if (!table) say('cannot be checked: the SRD classes are not known to the linter');
    else say(`class ${typeof e.class === 'string' ? `"${e.class}"` : 'is missing; it'} is not an SRD class (one of ${Object.keys(table).join(', ')})`);
    return;
  }
  const features = Array.isArray(e.features) ? e.features : [];
  if (!features.length) say('needs features');
  for (const [what, x] of [['', e], ...(Array.isArray(e.features) ? e.features : []).map((f) => [`feature ${typeof f?.id === 'string' ? f.id : '(without an id)'}: `, f])]) {
    if (x && typeof x.dmNotes === 'string' && letters(x.dmNotes) > SUBCLASS_NOTES) say(`${what}the notes for the DM are ${letters(x.dmNotes)} letters long; the most is ${SUBCLASS_NOTES}`);
  }
  const host = { ...cls, subclass: e }, ids = new Set(), optionIds = new Set();
  for (const f of features) {
    lintFeature(f, host, say, ids);
    if (!f || typeof f !== 'object') continue;
    if (isInt(f.level) && f.level >= 1 && f.level < SUBCLASS_FIRST) say(`feature ${f.id}: level is ${SUBCLASS_FIRST} to ${LEVELS} (a subclass comes at class level ${SUBCLASS_FIRST}; move an older feature to ${SUBCLASS_FIRST} or later)`);
    for (const o of Array.isArray(f.options) ? f.options : []) {
      if (!o || typeof o !== 'object') continue;
      if (optionIds.has(o.id)) say(`feature ${f.id}: option ${o.id} is used twice in the subclass`);
      optionIds.add(o.id);
      if (o.feat === undefined) continue;
      // An option that is a feat is a Fighting Style feat of the SRD, or (#550, addition B of the survey) one of this same pack: `ctx.feat` tells which.
      if (typeof o.feat === 'string' && o.feat.startsWith('hb-')) {
        const at = `feature ${f.id}: option ${o.id}`, ft = ctx.feat ? ctx.feat(o.feat) : undefined;
        if (ft === false) say(`${at} names the feat "${o.feat}" of another pack: an option can only be a feat of this same pack`);
        else if (ft === null) say(`${at} names the feat "${o.feat}", which is not a feat of this pack: add it to the pack's feats`);
        else if (ft && typeof ft === 'object') {
          if (ft.category !== 'fighting-style') say(`${at} names the feat "${o.feat}", which is not a Fighting Style feat (its category is ${typeof ft.category === 'string' ? ft.category : 'missing'}): an option can only be one`);
          if (ft.increase !== undefined || ft.proficiencies !== undefined || ft.spellPick !== undefined) say(`${at} names the feat "${o.feat}", which gives ability points, skills or spells to choose: an option gives only what the feat's \`grants\` give, so the character would lose them`);
          if (ft.prerequisite && (ft.prerequisite.level !== undefined || ft.prerequisite.abilities !== undefined)) say(`${at} names the feat "${o.feat}", which has a level or ability prerequisite: an option is not checked against one`);
          if (ft.category === 'fighting-style' && (ft.name !== o.name || ft.tier !== o.tier)) say(`${at} has another name or tier than the feat ${typeof ft.name === 'string' ? ft.name : o.feat}`);
        }
        continue;
      }
      const ft = ref?.feats && typeof o.feat === 'string' && Object.hasOwn(ref.feats, o.feat) ? ref.feats[o.feat] : null;
      if (!ref?.feats) say(`feature ${f.id}: option ${o.id} is a feat, which cannot be checked here: the SRD feats are not known to the linter`);
      else if (!ft || ft.category !== 'fighting-style') say(`feature ${f.id}: option ${o.id} is a feat that is not a Fighting Style feat of the SRD (an option is also a Fighting Style feat of the same pack)`);
      else if (ft.name !== o.name || ft.tier !== o.tier) say(`feature ${f.id}: option ${o.id} has another name or tier than the feat ${ft.name}`);
    }
  }
  for (const id of optionIds) if (ids.has(id)) say(`"${id}" is the id of a feature and of an option: an id names one thing`);
  for (const id of [...ids, ...optionIds]) if (id === e.id) say(`"${id}" is the id of the subclass itself and of one of its features: an id names one thing`);
  // `{ rolled: true }` takes the number of the damage step before it, so it is held to what a literal number of the same modifier is, at the most the dice can roll
  // (40, or 120 for a speed), and to one target (several creatures would each roll their own number; a second target is addition G).
  for (const f of features) {
    for (const g of [f?.grants, ...(Array.isArray(f?.options) ? f.options.map((o) => o?.grants) : [])]) {
      const a = g && typeof g === 'object' ? g.action : null;
      if (!a || typeof a !== 'object') continue;
      const found = [];
      const look = (list) => { if (!Array.isArray(list)) return; list.forEach((st, i) => {
        if (!st || typeof st !== 'object') return;
        if (isRolled(st.modifier?.value)) found.push([st.modifier, list[i - 1]?.damage]);
        for (const b of BRANCHES) look(st[b]);
      }); };
      look(a.effects); for (const m of Array.isArray(a.modes) ? a.modes : []) look(m?.effects);
      if (!found.length) continue;
      const sub = (m) => say(`feature ${typeof f.id === 'string' ? f.id : '(without an id)'}: ${m}`);
      for (const [m, dice] of found) {
        // The die is a plain one, or the class's own column ({ column }: the largest die of the class table, at its highest level); anything else the dice check above says.
        const dice1 = typeof dice === 'string' ? [dice] : dice && typeof dice === 'object' && typeof dice.column === 'string' ? (cls?.table?.[dice.column] ?? []).filter((x) => typeof x === 'string') : [];
        const mostOf = (t) => { const d = /^(\d+)d(\d+)$/.exec(t); return d ? +d[1] * +d[2] : 0; };
        const top = dice1.reduce((a, t) => (mostOf(t) > mostOf(a) ? t : a), dice1[0] ?? ''), most = mostOf(top), limit = SPEED_HOOKS.includes(m.on) ? 120 : 40;
        if (most > limit) sub(`a modifier on "${m.on}" takes the number ${top} rolls, up to ${most}; ${SPEED_HOOKS.includes(m.on) ? 'a speed may go up to 120' : 'only a speed may go past 40 (up to 120)'}, as for a number written out`);
      }
      const c = a.target?.creature?.count;
      if (a.target?.area || (c !== undefined && c !== 1)) sub('a modifier of `{ rolled: true }` is for an action with one target: several creatures would each roll their own number, and the modifier would be put once for each (a second creature near the first, `near`, shares the one roll: that is the way to a second target)');
      if (a.cost?.higher && (a.cost.higher.damage !== undefined || a.cost.higher.times !== undefined)) sub('a modifier of `{ rolled: true }` takes the number of a damage step that a slot would grow (`cost.higher` damage or times), so the number could pass what is checked here');
    }
  }
  // A number in a modifier may pass 40 only on a speed (a Fly Speed of 60); on any other hook it is held to the 40 a feat's is.
  for (const m of modifiersIn(features)) if (!SPEED_HOOKS.includes(m.on) && Math.abs(m.value) > 40) say(`a modifier on "${m.on}" has the value ${m.value}; only a speed may go past 40 (up to 120)`);
  // What a cost, `with`, `of` or `while` names is a feature of the class or of this subclass (a cost: one with uses).
  const own = [...cls.features ?? [], ...features];
  const known = new Set(own.flatMap((f) => [f?.id, ...(Array.isArray(f?.options) ? f.options.map((o) => o?.id) : [])]));
  const pools = new Set(own.flatMap((f) => [...(f?.uses ? [f.id] : []), ...(Array.isArray(f?.options) ? f.options.filter((o) => o?.uses).map((o) => o.id) : [])]));
  for (const g of grantsOf(features)) for (const [what, id] of featureRefs(g)) {
    if (what === 'cost' && !pools.has(id)) say(`a cost names "${id}", which is not a feature with uses of the ${cls.name} or of this subclass`);
    else if (what === 'ref' && !known.has(id)) say(`a grant names "${id}", which is neither a feature of the ${cls.name} nor of this subclass`);
  }
  // `proficiency.weapons` names weapons of the SRD or of this pack (#544).
  if (ctx.weapon) for (const f of features) for (const g of [f?.grants, ...(Array.isArray(f?.options) ? f.options.map((o) => o?.grants) : [])]) {
    const ws = g && typeof g === 'object' && g.proficiency && typeof g.proficiency === 'object' ? g.proficiency.weapons : undefined;
    if (Array.isArray(ws)) for (const id of ws) if (typeof id === 'string' && id !== 'martial' && ctx.weapon(id) === false) say(`feature ${typeof f.id === 'string' ? f.id : '(without an id)'}: proficiency names "${id}", which is not a weapon of the SRD or of this pack`);
  }
  // `formOf` changes the form of a feature that takes one (Wild Shape); it adds no creature type the feature already takes, and a subclass gives one price for a feature's forms.
  const priced = new Set();
  for (const f of features) {
    const fo = f?.grants?.formOf;
    if (!fo || typeof fo !== 'object' || typeof fo.of !== 'string' || !known.has(fo.of)) continue;
    const base = own.find((x) => x?.id === fo.of), F = base?.grants?.action?.form;
    if (!F) { say(`feature ${f.id}: formOf names "${fo.of}", which does not take a form (a form is what Wild Shape gives)`); continue; }
    if (Array.isArray(fo.types)) for (const t of fo.types) if (Array.isArray(F.types) && F.types.includes(t)) say(`feature ${f.id}: formOf.types lists "${t}", a type ${base.name} already takes`);
    // A named form is a monster of the SRD or of this pack, of a type the feature does not already take (else the name changes nothing). A form of a type the same grant adds is allowed: it is how a type with a rating of its own has one form above it.
    if (Array.isArray(fo.forms) && ctx.monster) for (const id of fo.forms) {
      if (typeof id !== 'string') continue;
      const m = ctx.monster(id);
      if (m === null) say(`feature ${f.id}: formOf.forms names "${id}", which is not a monster of the SRD or of this pack`);
      else if (m && typeof m.type === 'string' && Array.isArray(F.types) && F.types.includes(m.type)) say(`feature ${f.id}: formOf.forms names "${id}", a ${m.type}, a type ${base.name} already takes`);
    }
    if (fo.cost !== undefined) {
      if (priced.has(fo.of)) say(`feature ${f.id}: formOf gives ${base.name} a second price: a subclass has one price for its forms`);
      priced.add(fo.of);
      // The pool the price names is one the character has by the level this feature gives the price, and holds as many uses as the price asks (where its maximum is a plain number).
      const owner = own.find((x) => x?.id === fo.cost.resource || (Array.isArray(x?.options) && x.options.some((o) => o?.id === fo.cost.resource)));
      const pool = owner?.id === fo.cost.resource ? owner : owner?.options?.find((o) => o?.id === fo.cost.resource), name = owner?.name ?? fo.cost.resource;
      if (owner && isInt(owner.level) && isInt(f.level) && owner.level > f.level) say(`feature ${f.id}: formOf prices the forms in ${name}, which the ${cls.name} gains at level ${owner.level}, after this feature's level ${f.level}: a character would have a price for a pool it lacks`);
      const max = pool?.uses?.max;
      if (isInt(max) && isInt(fo.cost.n) && fo.cost.n > max) say(`feature ${f.id}: formOf prices the forms at ${fo.cost.n} uses of ${name}, which has ${max}: no form could ever be taken`);
    }
  }
  // `reaction: { on: 'attacks', of }` (#537): the feature `of` is one whose action lasts and is aimed at a creature, which is what puts an effect on a creature for the holder to react to.
  for (const f of features) for (const g of [f?.grants, ...(Array.isArray(f?.options) ? f.options.map((o) => o?.grants) : [])]) {
    const id = g && typeof g === 'object' && g.reaction?.on === 'attacks' ? g.reaction.of : undefined;
    if (typeof id !== 'string' || !known.has(id)) continue;
    const base = own.find((x) => x?.id === id) ?? own.flatMap((x) => (Array.isArray(x?.options) ? x.options : [])).find((o) => o?.id === id), a = base?.grants?.action;
    if (!(a && typeof a === 'object' && typeof a.duration === 'string' && a.duration !== 'instant' && a.target?.creature && a.time !== 'reaction')) say(`feature ${f.id}: reaction.of names "${id}", which has no action that lasts and is aimed at a creature (what the reaction answers is a lasting effect that action puts on a creature)`);
  }
  // `inForm` on a feature's action (#525): the holder must be in a form of the feature it names, which must be one that takes a form (Wild Shape).
  for (const f of features) for (const g of [f?.grants, ...(Array.isArray(f?.options) ? f.options.map((o) => o?.grants) : [])]) {
    const id = g && typeof g === 'object' ? g.action?.inForm : undefined;
    if (typeof id !== 'string' || !known.has(id)) continue;
    if (!own.find((x) => x?.id === id)?.grants?.action?.form) say(`feature ${f.id}: inForm names "${id}", which does not take a form (a form is what Wild Shape gives)`);
  }
  // Always-prepared spells, by class level (3 to 20): the class must cast, and a spell must be one a caster of that level has slots for.
  const sp = e.spells;
  if (sp === undefined) return;
  if (!sp || typeof sp !== 'object' || Array.isArray(sp)) return say('spells are lists of spell ids by class level');
  if (Object.keys(sp).length && !cls.casting) say(`the ${cls.name} has no Spellcasting, so spells given to a subclass of it would never be prepared: leave them out`);
  for (const [l, list] of Object.entries(sp)) {
    const lv = +l;
    if (!(isInt(lv) && String(lv) === l && lv >= SUBCLASS_FIRST && lv <= LEVELS)) { say(`spells: "${l}" is not a class level from ${SUBCLASS_FIRST} to ${LEVELS}`); continue; }
    if (!(Array.isArray(list) && list.length && list.every((x) => typeof x === 'string' && ID.test(x)))) { say(`spells: class level ${l} is a list of spell ids`); continue; }
    if (new Set(list).size !== list.length) say(`spells: class level ${l} names a spell twice`);
    if (!cls.casting) continue;
    const top = highestSlot(cls, lv);
    for (const id of list) {
      const sd = ctx.spell?.(id);
      if (sd === null) say(`spells: class level ${l}: "${id}" is not a spell of the SRD or of this pack`);
      else if (sd && typeof sd.level === 'number' && sd.level > top) say(`spells: class level ${l}: "${id}" is a level ${sd.level} spell, and a ${cls.name} of level ${l} has slots up to level ${top}`);
    }
  }
}
// What a spell id is, for the spells a subclass names: a spell of the pack (`pack`: a Map or Set of its spells' ids, or none given) or of the SRD
// (not an id of any homebrew: the lookups hold a table's homebrew while it is installed).
function spellLookup(ref, packId, pack) {
  return (id) => {
    if (id.startsWith('hb-')) {
      if (pack) return (pack instanceof Map ? pack.get(id) : pack.has(id) ? {} : undefined) ?? null;
      return packId && !id.startsWith(`hb-${packId}-`) ? null : undefined;
    }
    if (!ref?.spells) return undefined;
    return Object.hasOwn(ref.spells, id) ? ref.spells[id] : null;
  };
}

// What a weapon id is, for the weapons a subclass trains (#544): true for a weapon of the SRD or (`ids`, the pack's weapon ids) of the pack, false for an id that is neither (an id of any
// other homebrew is not), undefined when it cannot be told (no SRD reference; a homebrew id and no pack to look in).
function weaponLookup(ref, packId, ids) {
  return (id) => {
    if (id.startsWith('hb-')) { if (ids) return ids.has(id); return packId && !id.startsWith(`hb-${packId}-`) ? false : undefined; }
    if (!ref?.weapons) return undefined;
    return Object.hasOwn(ref.weapons, id);
  };
}

// What a feat id is, for the Fighting Style feat an option of a subclass may be (#550): the feat's record in the pack (`feats`: a Map by id, or a list of feats), `false` for a homebrew id
// of another pack, `null` for an id of this pack that is not among the pack's feats, undefined when it cannot be told (no list of the pack's feats, or no pack id to tell the packs by).
function featLookup(packId, feats) {
  const map = feats instanceof Map ? feats : Array.isArray(feats) ? new Map(feats.filter((x) => x && typeof x === 'object').map((x) => [x.id, x])) : null;
  return (id) => {
    if (packId && !id.startsWith(`hb-${packId}-`)) return false;
    return map ? map.get(id) ?? null : undefined;
  };
}

// What a monster id is, for the forms a subclass names (#525): the monster's record in the pack (`pack`: a Map of its monsters by id) or in the SRD; null for an id that is neither
// (an id of any other homebrew is not: the lookups hold a table's homebrew while it is installed); undefined when it cannot be told (a homebrew id and no pack to look in).
function monsterLookup(ref, packId, pack) {
  return (id) => {
    if (id.startsWith('hb-')) {
      if (pack) return pack.get(id) ?? null;
      return packId && !id.startsWith(`hb-${packId}-`) ? null : undefined;
    }
    if (!ref?.monsters) return undefined;
    return Object.hasOwn(ref.monsters, id) ? ref.monsters[id] : null;
  };
}

// ---------- feats (content/srd52/feats.js) ----------
// A feat (SRD "Feats"): its category, prerequisite, whether it can be taken again, and what it gives:
// ability score points to place (`increase`), skill or tool proficiencies to pick (`proficiencies`),
// spells to pick (`spellPick`), and what a class feature can grant (`grants`). The choices are the
// sheet's (derive.js, sheet `feats`). Design: docs/specs/rules-expansion.md, "Feats" amendment.
export const FEAT_CATEGORIES = ['origin', 'general', 'fighting-style', 'epic-boon'];
// A feature named in a prerequisite: a Fighting Style feature, or the Spellcasting feature.
export const FEAT_FEATURES = ['fighting-style', 'spellcasting'];
// What a feat's grants are linted against: a class with no table, so an amount is a number, an ability modifier or `{ prof }`.
const FEAT_CLASS = { id: 'feat', table: {}, features: [], subclass: { features: [] } };
function lintFeatDef(e, say) {
  if (!ID.test(e.id ?? '') || !isText(e.name) || !isText(e.source) || !isText(e.text)) say('needs a kebab-case id, a name, a source and text');
  for (const k of Object.keys(e)) if (!['id', 'name', 'category', 'prerequisite', 'repeatable', 'tier', 'source', 'checked', 'text', 'increase', 'proficiencies', 'spellPick', 'grants'].includes(k)) say(`"${k}" is not something a feat has`);
  if (typeof e.checked !== 'boolean') say('needs `checked`');
  if (!TIERS.includes(e.tier)) say(`tier is one of ${TIERS.join(', ')}`);
  if (!FEAT_CATEGORIES.includes(e.category)) say(`category is one of ${FEAT_CATEGORIES.join(', ')}`);
  const pr = e.prerequisite;
  if (pr !== undefined) {
    if (!pr || typeof pr !== 'object' || !Object.keys(pr).length || !Object.keys(pr).every((k) => ['level', 'abilities', 'feature'].includes(k))) say('prerequisite is { level?, abilities?, feature? }');
    else {
      if (pr.level !== undefined && !(isInt(pr.level) && pr.level >= 1 && pr.level <= LEVELS)) say('prerequisite.level is a character level');
      if (pr.abilities !== undefined && !(pr.abilities && Object.keys(pr.abilities).length === 2 && allOf(ABILITIES)(pr.abilities.any) && pr.abilities.any.length && isInt(pr.abilities.min) && pr.abilities.min > 1 && pr.abilities.min <= 20)) say('prerequisite.abilities is { any: [abilities], min }');
      if (pr.feature !== undefined && !FEAT_FEATURES.includes(pr.feature)) say(`prerequisite.feature is one of ${FEAT_FEATURES.join(', ')}`);
    }
  }
  if (e.repeatable !== undefined && !(e.repeatable === true || (e.repeatable === 'list' && e.spellPick))) say('repeatable is true, or "list" for a feat that picks a spell list');
  const inc = e.increase;
  if (inc !== undefined && !(inc && Object.keys(inc).length === 3 && allOf(ABILITIES)(inc.from) && inc.from.length && new Set(inc.from).size === inc.from.length
    && isInt(inc.points) && inc.points >= 1 && inc.points <= 2 && [20, 30].includes(inc.max))) say('increase is { from: [abilities], points: 1 or 2, max: 20 or 30 }');
  if (e.proficiencies !== undefined && !(e.proficiencies && Object.keys(e.proficiencies).length === 1 && isInt(e.proficiencies.n) && e.proficiencies.n >= 1 && e.proficiencies.n <= 5)) say('proficiencies is { n }');
  const sp = e.spellPick;
  if (sp !== undefined && !(sp && Object.keys(sp).length === 4 && Array.isArray(sp.lists) && sp.lists.length && sp.lists.every((x) => ID.test(x)) && allOf(ABILITIES)(sp.abilities) && sp.abilities.length
    && isInt(sp.cantrips) && sp.cantrips >= 0 && sp.cantrips <= 4 && isInt(sp.level1) && sp.level1 >= 0 && sp.level1 <= 2)) say('spellPick is { lists, abilities, cantrips, level1 }');
  if (e.grants !== undefined) lintGrants(e.grants, FEAT_CLASS, say);
  const gives = e.increase || e.proficiencies || e.spellPick || e.grants;
  if (e.tier === 'auto' && !gives) say('marked auto but gives nothing');
  if (e.tier === 'manual' && gives) say('marked manual but gives something');
  if (findFunction(e)) say('content is data only');
}

// ---------- magic items (content/srd52/magic-items.js) ----------
// A magic item (SRD "Magic Items"): what it is, whether it needs Attunement and from whom, where it must
// be worn or held for its magic, the mundane item it is made from, its bonus, and what it grants while
// active (worn or held, and attuned if it needs it). `activate` describes its uses, run by the `use` action with
// `item` (engine/features.js, E18): effect steps on the effect runner; a spell cast from it goes through the
// cast path (engine/casting.js, castFromItem; #284), `upTo` the highest level extra charges raise it to (one
// charge a level past the use's own) and `self` that it targets only its user.
// Design: docs/specs/rules-expansion.md, "Magic items" amendment.
export const ITEM_CATEGORIES = ['armor', 'potion', 'ring', 'rod', 'scroll', 'staff', 'wand', 'weapon', 'wondrous'];
export const RARITIES = ['common', 'uncommon', 'rare', 'very-rare', 'legendary', 'artifact', 'varies'];
// Where an item is worn or held. The SRD lets a creature wear one of each of the first six at a time ("Multiple
// Items of the Same Kind"), one Shield, and up to three Ioun Stones orbiting its head.
export const WEAR = ['feet', 'hands', 'wrists', 'armour', 'head', 'cloak', 'shield', 'weapon', 'ring', 'neck', 'waist', 'body', 'eyes', 'orbit', 'carried'];
export const WEAR_ONE = ['feet', 'hands', 'wrists', 'armour', 'head', 'cloak', 'shield'];
export const ITEM_VARIANTS = ['damageType', 'spell'];
function lintItem(e, say, ctx = {}) {
  if (!ID.test(e.id ?? '') || !isText(e.name) || !isText(e.source) || !isText(e.text)) say('needs a kebab-case id, a name, a source and text');
  for (const k of Object.keys(e)) if (!['id', 'name', 'category', 'rarity', 'attune', 'wear', 'base', 'bonus', 'damageType', 'properties', 'trained', 'mithral', 'grants', 'variant', 'charges', 'activate', 'tier', 'source', 'checked', 'text'].includes(k)) say(`"${k}" is not something an item has`);
  if (typeof e.checked !== 'boolean') say('needs `checked`');
  if (!TIERS.includes(e.tier)) say(`tier is one of ${TIERS.join(', ')}`);
  if (!ITEM_CATEGORIES.includes(e.category)) say(`category is one of ${ITEM_CATEGORIES.join(', ')}`);
  if (!RARITIES.includes(e.rarity)) say(`rarity is one of ${RARITIES.join(', ')}`);
  if (!WEAR.includes(e.wear)) say(`wear is one of ${WEAR.join(', ')}`);
  const at = e.attune;
  if (at !== undefined && !(at === true || (at && typeof at === 'object' && Object.keys(at).length === 1 && ((Array.isArray(at.by) && at.by.length && at.by.every((x) => ID.test(x))) || at.spellcaster === true)))) say('attune is true, { by: [class ids] } or { spellcaster: true }');
  const b = e.base;
  if (b !== undefined) {
    const list = (v, ids) => v === 'any' || (Array.isArray(v) && v.length && v.every((x) => !ids || ids.has(x)));
    if (!b || typeof b !== 'object' || Object.keys(b).length !== 1) say('base is { weapon } or { armour }');
    else if (b.weapon !== undefined) { if (!(list(b.weapon, ctx.weapons) || b.weapon === 'melee')) say('base.weapon is "any", "melee" or weapon ids of the pack'); if (e.wear !== 'weapon') say('a weapon is worn as a weapon'); }
    else if (b.armour !== undefined) { if (!list(b.armour, ctx.armour)) say('base.armour is "any" or armour ids of the pack'); if (e.wear !== 'armour') say('armour is worn as armour'); }
    else say('base is { weapon } or { armour }');
  }
  if (e.bonus !== undefined && !(isInt(e.bonus) && e.bonus >= 1 && e.bonus <= 3 && (b || e.wear === 'shield'))) say('bonus is 1 to 3, on a weapon, armour or a Shield');
  if (e.damageType !== undefined && !(DAMAGE_TYPES.includes(e.damageType) && b?.weapon)) say('damageType is a damage type, on a weapon');
  if (e.properties !== undefined && !(allOf(WEAPON_PROPERTIES)(e.properties) && e.properties.length && b?.weapon)) say('properties are weapon properties, on a weapon');
  if (e.trained !== undefined && !(e.trained === true && b?.armour)) say('trained is true, on armour');
  if (e.mithral !== undefined && !(e.mithral === true && b?.armour)) say('mithral is true, on armour');
  if (e.variant !== undefined && !ITEM_VARIANTS.includes(e.variant)) say(`variant is one of ${ITEM_VARIANTS.join(', ')}`);
  if (e.charges !== undefined && !(e.charges && isInt(e.charges.max) && e.charges.max > 0 && e.charges.max <= 50 && Object.keys(e.charges).every((k) => ['max', 'regain'].includes(k)) && (e.charges.regain === undefined || isDice(e.charges.regain)))) say('charges is { max, regain? }');
  if (e.grants !== undefined) {
    lintGrants(e.grants, FEAT_CLASS, say);
    for (const k of Object.keys(e.grants ?? {})) if (['action', 'reaction', 'extraAttack', 'sneak', 'martialArts', 'freeCast', 'metamagic', 'metamagicMax', 'exchange', 'restore', 'recover', 'cure', 'skills', 'expertise', 'cantrips', 'spellLists', 'spells', 'proficiency', 'hp', 'formOf', 'triggers'].includes(k)) say(`an item does not grant "${k}" (a class feature's)`);
    const chosen = JSON.stringify(e.grants).includes('"chosen"');
    if (chosen !== (e.variant === 'damageType' && !!e.grants)) say('a modifier\'s "chosen" damage type goes with variant "damageType"');
  }
  if (e.activate !== undefined) {
    if (!Array.isArray(e.activate) || !e.activate.length) say('activate is a list of uses');
    else for (const u of e.activate) {
      const us = (m) => say(`activate: ${m}`);
      if (!u || typeof u !== 'object' || !Object.keys(u).every((k) => ['name', 'time', 'cost', 'consumed', 'spell', 'level', 'upTo', 'self', 'dc', 'effects'].includes(k))) { us('a use is { name?, time, cost?, consumed?, spell?, level?, upTo?, self?, dc?, effects? }'); continue; }
      if (!ACTION_TIMES.includes(u.time)) us(`time is one of ${ACTION_TIMES.join(', ')}`);
      if (u.cost !== undefined && !(isInt(u.cost) && u.cost > 0 && e.charges)) us('cost is charges, on an item with charges');
      if (u.consumed !== undefined && u.consumed !== true) us('consumed is true or left out');
      if (u.spell !== undefined && !(ID.test(u.spell) && (!ctx.spells || ctx.spells.has(u.spell)))) us(`spell "${u.spell}" is not in the pack`);
      if (u.level !== undefined && !(isInt(u.level) && u.level >= 1 && u.level <= 9 && u.spell)) us('level is a spell level, with a spell');
      if (u.upTo !== undefined && !(isInt(u.upTo) && u.upTo > (u.level ?? 1) && u.upTo <= 9 && u.spell && u.cost)) us('upTo is a higher spell level that more charges reach, with a spell and a cost');
      if (u.self !== undefined && !(u.self === true && u.spell)) us('self is true, with a spell');
      if (u.dc !== undefined && !(isInt(u.dc) && u.dc >= 5 && u.dc <= 30 && u.spell)) us('dc is a save DC, with a spell');
      if ((u.spell === undefined) === (u.effects === undefined)) us('a use casts a spell or has effects');
      if (u.effects !== undefined) lintSteps(u.effects, us);
      if (u.name !== undefined && !isText(u.name)) us('name is text');
    }
  }
  // A use whose steps the engine runs (a potion's healing) or a spell it casts (#284) is something it applies.
  const runs = (e.activate ?? []).some((u) => u?.spell || (Array.isArray(u?.effects) && u.effects.some((st) => st && !('manual' in st))));
  const gives = e.grants || e.bonus || e.base || e.wear === 'shield' || runs;
  if (e.tier === 'auto' && !gives) say('marked auto but gives nothing the engine applies');
  if (e.tier === 'manual' && (e.grants || e.bonus)) say('marked manual but gives something');
  if (findFunction(e)) say('content is data only');
}

// `opts.strict`: the gate for a homebrew pack (docs/specs/homebrew.md, Decision 2): the budget first (and nothing else
// if it fails), then the closed key lists, the homebrew id, source and `checked` rules, on top of the lint below.
// `opts.keys`: the closed key lists alone (the SRD pack passes them). Without options, as it always was.
export function lintPack(doc, opts = {}) {
  if (!opts.strict) return lintPackCore(doc, opts);
  // Strict mode never throws, whatever it is given: what it cannot read it refuses in a sentence.
  try { return lintPackCore(doc, opts); } catch { return ['pack: could not be checked, because something in it is not the shape a pack has']; }
}
function lintPackCore(doc, opts) {
  if (opts.strict) { const over = budget(doc, opts.limits); if (over.length) return over; }
  const { pack, spells = [], monsters = [], summons, pregens = [], conditions = [], objects = [], classes = [], weapons = [], armour = [], feats, items, multiclass, advancement, subclasses } = doc;
  const problems = [];
  const strict = opts.strict || opts.keys ? strictOptions(doc, opts, problems) : null;
  if (strict && problems.length) return problems;               // the document's own shape is wrong: nothing below can be read
  if (!pack || !ID.test(pack.id ?? '') || !isText(pack.name) || !isText(pack.license) || !isText(pack.attribution)) problems.push('pack: needs id, name, license and attribution');
  // What a subclass reads of the pack and of the SRD: a spell id is a spell of this pack (with its level) or of the SRD.
  const subclassCtx = { srd: opts.srd, feat: featLookup(pack?.id, Array.isArray(feats) ? feats : []), weapon: weaponLookup(opts.srd ?? SRD_REF, pack?.id, new Set((Array.isArray(weapons) ? weapons : []).filter((w) => w && typeof w === 'object').map((w) => w.id))), spell: spellLookup(opts.srd ?? SRD_REF, pack?.id, new Map((Array.isArray(spells) ? spells : []).filter((x) => x && typeof x === 'object').map((x) => [x.id, x]))),
    monster: monsterLookup(opts.srd ?? SRD_REF, pack?.id, new Map((Array.isArray(monsters) ? monsters : []).filter((x) => x && typeof x === 'object').map((x) => [x.id, x]))) };
  const itemCtx = { weapons: new Set(weapons.map((w) => w.id)), armour: new Set(armour.filter((a) => a.category !== 'shield').map((a) => a.id)), spells: spells.length ? new Set(spells.map((x) => x.id)) : null };
  for (const [kind, list, lint] of [['spells', spells, lintSpell], ['monsters', monsters, lintMonster], ['summons', summons ?? [], lintSummonBlock], ['conditions', conditions, lintCondition], ['objects', objects, lintObject], ['classes', classes, lintClass], ['weapons', weapons, lintWeapon], ['armour', armour, lintArmour], ['feats', feats ?? [], lintFeatDef], ['items', items ?? [], (e, say) => lintItem(e, say, itemCtx)],
    ['subclasses', subclasses ?? [], (e, say) => lintSubclass(e, say, subclassCtx)]]) {
    const seen = new Set();
    for (const e of list) {
      const say = (m) => problems.push(`${kind}/${shortId(e)}: ${m}`);
      if (!e || typeof e !== 'object') { problems.push(`${kind}: an entry is not an object`); continue; }
      if (seen.has(e.id)) say('duplicate id');
      seen.add(e.id);
      if (strict && lintShape(kind, e, say, strict) && strict.homebrew) continue;
      lint(e, say);
      if (strict) lintRules(kind, e, say, strict);
    }
  }
  const spellIds = new Set(spells.map((s) => s.id));
  // A feature or an option id is used once in the pack: not by another feature or option of any subclass, and not by any entry of the pack (a spell, a feat,
  // an item, a subclass ...): an id names one thing, and a feature's uses and a feat's free casts are kept by id.
  const taken = new Map();
  for (const [kind, list] of [['spells', spells], ['monsters', monsters], ['items', items ?? []], ['feats', feats ?? []], ['objects', objects], ['weapons', weapons], ['armour', armour], ['subclasses', subclasses ?? []]]) {
    for (const x of Array.isArray(list) ? list : []) if (x && typeof x === 'object' && typeof x.id === 'string' && !taken.has(x.id)) taken.set(x.id, `${kind}/${x.id}`);
  }
  const ownedBy = new Map();
  for (const sc of Array.isArray(subclasses) ? subclasses : []) {
    if (!sc || typeof sc !== 'object') continue;
    for (const f of Array.isArray(sc.features) ? sc.features : []) for (const x of [f, ...(Array.isArray(f?.options) ? f.options : [])]) {
      if (!x || typeof x !== 'object' || typeof x.id !== 'string' || (x !== f && x.feat !== undefined)) continue;
      if (taken.has(x.id)) problems.push(`subclasses/${shortId(sc)}: "${x.id}" is also the id of ${taken.get(x.id)}; a feature or option id is used once in the pack`);
      else if (ownedBy.has(x.id) && ownedBy.get(x.id) !== sc.id) problems.push(`subclasses/${shortId(sc)}: "${x.id}" is also used in ${ownedBy.get(x.id)}; a feature or option id is used once in the pack`);
      else ownedBy.set(x.id, sc.id);
    }
  }
  // What a summon step names is in the pack: a summon block or a pack monster (not both of one id), with the
  // block's own variants and types; forms are pack monsters.
  // (Checked when the pack's summon blocks are given: spells linted alone are not.)
  const blocks = new Map((summons ?? []).map((b) => [b.id, b])), beasts = new Map(monsters.map((m) => [m.id, m]));
  for (const b of summons ?? []) if (beasts.has(b.id)) problems.push(`summons/${b.id}: a pack monster has the same id`);
  if (summons !== undefined) for (const sp of spells) {
    walkSteps(sp.effects, (st) => {
      if (!st || !('summon' in st)) return;
      const say = (m) => problems.push(`spells/${sp.id}: ${m}`);
      if (st.forms !== undefined) {
        if (Array.isArray(st.forms)) for (const id of st.forms) if (!beasts.has(id)) say(`a form is not a pack monster: "${id}"`);
        if (st.variants !== undefined) say('a summon of forms has no variants');
        return;
      }
      const b = blocks.get(st.summon), m = beasts.get(st.summon);
      if (!b && !m) return say(`summons "${st.summon}", which is neither a summon block nor a pack monster`);
      const same = (x, y) => JSON.stringify([...(x ?? [])].sort()) === JSON.stringify([...(y ?? [])].sort());
      if (b) {
        if (!same(st.variants, b.variants)) say(`the summon step's variants must be the block's: ${(b.variants ?? []).join(', ') || 'none'}`);
        if (!same(st.types, b.types)) say(`the summon step's types must be the block's: ${(b.types ?? []).join(', ') || 'none'}`);
        if (sp.level < b.level) say(`the block "${b.id}" is cast at level ${b.level} or higher`);
      } else if (st.variants !== undefined) say('a pack monster has no variants to pick from');
    });
  }
  // Spells a class always has prepared must be in the pack, and a cost must name a feature with uses.
  for (const c of classes) {
    const say = (m) => problems.push(`classes/${c?.id ?? '?'}: ${m}`);
    const all = [...(c.features ?? []), ...(c.subclass?.features ?? [])], grants = [];
    for (const f of all) { if (f.grants) grants.push(f.grants); for (const o of f.options ?? []) if (o.grants) grants.push(o.grants); }
    for (const g of grants) for (const id of g.spells ?? []) if (!spellIds.has(id)) say(`grants a spell that is not in the pack: "${id}"`);
    for (const list of Object.values(c.subclass?.spells ?? {})) for (const id of list) if (!spellIds.has(id)) say(`subclass spell not in the pack: "${id}"`);
    // An option that is a feat (a Fighting Style) names a feat of the pack, with its name and tier.
    // (Checked when the pack's feats are given: a class linted alone is not.)
    const featIds = new Map((feats ?? []).map((x) => [x.id, x]));
    if (feats) for (const f of all) for (const o of f.options ?? []) if (o.feat !== undefined) {
      const ft = featIds.get(o.feat);
      if (!ft) say(`option ${o.id} of ${f.id} names a feat that is not in the pack: "${o.feat}"`);
      else if (ft.name !== o.name || ft.tier !== o.tier) say(`option ${o.id} of ${f.id} has another name or tier than the feat ${ft.name}`);
    }
    const pools = new Set(all.filter((f) => f.uses).map((f) => f.id));
    for (const g of grants) if (g.action?.cost?.resource !== undefined && !pools.has(g.action.cost.resource)) say(`a cost names "${g.action.cost.resource}", which is not a feature with uses`);
    // A freeCast's extra keys (#414) need what they change: a summon step of forms, of types, and pack monsters for the forms.
    if (spells.length) for (const g of grants) {
      const fc = g.freeCast;
      if (!validFreeCast(fc) || !fc.spells) continue;           // the feature's own linter says what is wrong with its shape
      const steps = [];
      for (const id of fc.spells) walkSteps(spells.find((x) => x.id === id)?.effects, (st) => { if (st && typeof st === 'object' && 'summon' in st) steps.push(st); });
      if (fc.types !== undefined && !steps.some((st) => Array.isArray(st.types) && fc.types.some((x) => st.types.includes(x)))) say('a freeCast with `types` needs a spell with a summon step that offers one of them');
      if (fc.cost !== undefined && !pools.has(fc.cost.uses)) say(`a freeCast cost names "${fc.cost.uses}", which is not a feature with uses`);
      if (fc.ends !== undefined && !steps.some((st) => st.bond)) say('a freeCast with `ends` needs a spell with a summon step that has a bond');
      if (fc.forms !== undefined) {
        if (!steps.some((st) => st.forms !== undefined)) say('a freeCast with `forms` needs a spell with a summon step of forms');
        if (monsters.length) for (const id of fc.forms) if (!beasts.has(id)) say(`a freeCast form is not a pack monster: "${id}"`);
      }
    }
  }
  // A feat's spell lists are classes of the pack.
  const classIds = new Set(classes.map((c) => c.id));
  for (const ft of feats ?? []) for (const l of ft.spellPick?.lists ?? []) if (!classIds.has(l)) problems.push(`feats/${ft.id}: spell list "${l}" is not a class of the pack`);
  // The Multiclass Spellcaster table: 20 rows of slots by spell level.
  if (multiclass !== undefined && !(multiclass && tableRow(multiclass.slots) && multiclass.slots.every((r) => Array.isArray(r) && r.length >= 1 && r.length <= 9 && r.every((n) => isInt(n) && n > 0)) && typeof multiclass.checked === 'boolean'))
    problems.push('multiclass: the Multiclass Spellcaster table is 20 rows of slots by spell level, with `checked`');
  // The Character Advancement table: levels 1 to 20 in order, XP rising from 0, Proficiency Bonus +2 to +6 never falling.
  if (advancement !== undefined) {
    const rows = advancement?.levels;
    const good = tableRow(rows) && typeof advancement.checked === 'boolean' && rows.every((r, i) => r && Object.keys(r).length === 3 && r.level === i + 1 && isInt(r.xp) && isInt(r.prof) && r.prof >= 2 && r.prof <= 6
      && (i === 0 ? r.xp === 0 && r.prof === 2 : r.xp > rows[i - 1].xp && r.prof >= rows[i - 1].prof));
    if (!good) problems.push('advancement: the Character Advancement table is levels 1 to 20 of { level, xp, prof }, XP rising from 0, with `checked`');
  }
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
  'attacks', 'castAbil', 'spells', 'slots', 'features', 'gear', 'resist', 'vuln', 'immune', 'look',
  // Made by derive() from a sheet (derive.js): features as the engine plays them, the Hit Die, what is worn.
  'feats', 'hitDie', 'armour', 'shield', 'critOn', 'bonusActs', 'pact', 'conditionImmune',
  // A character with more than one class (derive.js): its classes and levels, its Hit Dice by size,
  // and the spellcasting ability of each spell whose class's differs from `castAbil`.
  'classes', 'hitDice', 'spellAbil'];
// `abil` (the ability it uses), `weapon` (its equipment id) and `time: 'bonus'` (a Bonus Action
// attack, the Monk's Unarmed Strike) come from derive().
const ATTACK_FIELDS = ['id', 'name', 'type', 'bonus', 'damage', 'dtype', 'reach', 'range', 'finesse', 'abil', 'weapon', 'time', 'dc'];
// A feature in a record: what derive() made of a class feature, its numbers put in.
const FEAT_FIELDS = ['id', 'name', 'tier', 'text', 'uses', 'modifiers', 'action', 'recover', 'reaction', 'aura', 'freeCast', 'metamagic', 'metamagicMax', 'exchange', 'restore',
  'moveWith', 'brutal', 'relentless', 'initiative', 'reroll', 'missed', 'evasion', 'surfaces', 'selfCure', 'fleet', 'cunning',
  'empowered', 'overchannel', 'afterHit', 'markSpread', 'steadfast', 'restExhaustion', 'spellRange', 'repel', 'forgoAttack', 'invest', 'triggers'];
function lintFeat(f, say) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return say('A feature is a record.');
  for (const k of Object.keys(f)) if (!FEAT_FIELDS.includes(k)) say(`"${k}" is not something a feature has.`);
  if (!ID.test(f.id ?? '') || !isText(f.name) || f.name.length > 60) say('A feature needs a kebab-case id and a name.');
  if (!TIERS.includes(f.tier)) say(`Feature ${f.name}: its tier is auto, assist or manual.`);
  if (f.text !== undefined && !(typeof f.text === 'string' && f.text.length <= 1200)) say(`Feature ${f.name}: its text is up to 1200 letters.`);
  const sub = (m) => say(`Feature ${f.name}: ${m}`);
  if (f.uses !== undefined && !(f.uses && Number.isInteger(f.uses.max) && f.uses.max >= 0 && f.uses.max <= 200 && RESTS.includes(f.uses.recharge) && (f.uses.short === undefined || (Number.isInteger(f.uses.short) && f.uses.short > 0)))) sub('its uses are { max, recharge: short | long, short? }.');
  if (f.modifiers !== undefined) { if (!Array.isArray(f.modifiers) || f.modifiers.length > 10) sub('its modifiers are a list.'); else for (const m of f.modifiers) lintModifier(m, sub); }
  if (f.action !== undefined) {
    const a = f.action;
    if (!a || !ACTION_TIMES.includes(a.time)) sub('its action has a time.');
    else if (a.form) {
      const fm = a.form;
      if (!(fm && allOf(CREATURE_TYPES)(fm.types) && typeof fm.maxCr === 'number' && [0, 1].includes(fm.fly) && isInt(fm.hours) && fm.hours >= 1 && fm.hours <= 24
        && (fm.tempHp === undefined || (isInt(fm.tempHp) && fm.tempHp >= 0 && fm.tempHp <= 100)))) sub('its form is { types, maxCr, fly, hours, tempHp? }.');
    } else if (!a.gain && !a.pool) {
      lintTarget(a.target, sub, true);
      // An action that takes other actions may have no steps left for this character (Patient Defense below level 10).
      if (a.modes === undefined) { if (!(a.acts && Array.isArray(a.effects) && !a.effects.length)) lintSteps(a.effects, sub, { manual: false, rolledOk: true }); }
      else if (!(Array.isArray(a.modes) && a.modes.length >= 2 && a.modes.length <= 10 && a.modes.every((m) => m && ID.test(m.id ?? '') && isText(m.name)))) sub('its modes are a list of { id, name, effects, target?, cost?, free? }.');
      else for (const m of a.modes) { lintModeOwn(m, a, sub); lintSteps(m.effects, sub, { manual: false, rolledOk: true }); }
    }
    if (a?.cost !== undefined) lintActionCost(a, (m) => sub(`${m}.`));
    // A record's `near` is held to what the gate holds a pack's to (the record may have been made by another build): a creature to be the first, one target, 5 to 60 feet, and damage to begin with.
    if (a && typeof a === 'object') lintNear(a, null, (m) => sub(`${m}.`));
    if (a && typeof a === 'object') lintActionChoice(a, null, (m) => sub(`${m}.`));
    if (a?.gain?.attacks !== undefined && !(ID.test(a.gain.attacks.with ?? '') && isInt(a.gain.attacks.n) && a.gain.attacks.n > 0 && a.gain.attacks.n <= 5)) sub('it gains attacks { with, n }.');
    if (a?.duration !== undefined && !isDuration(a.duration)) sub('its duration is a duration.');
    if (a?.cure !== undefined && !(a.pool && a.cure && allOf(CONDITIONS)(a.cure.conditions) && isInt(a.cure.cost) && a.cure.cost > 0)) sub('its cure is { conditions, cost }, on a pool.');
  }
  if (f.recover !== undefined && !(f.recover && f.recover.levels === 'half-up' && isInt(f.recover.max))) sub('it recovers { levels: half-up, max }.');
  if (f.freeCast !== undefined && !(validFreeCast(f.freeCast) && (f.uses || f.freeCast.atWill || f.freeCast.cost) && !(f.freeCast.cost && f.uses))) sub('its freeCast is { list, maxLevel } or { spells }, with uses, atWill or a cost (a cost and no uses).');
  if (f.metamagic !== undefined && !(f.metamagic && typeof f.metamagic.id === 'string' && isInt(f.metamagic.cost) && f.metamagic.cost > 0 && f.metamagic.cost <= 10 && ID.test(f.metamagic.pool ?? ''))) sub('its metamagic is { id, cost, pool }.');
  if (f.metamagicMax !== undefined && !(f.metamagicMax && isInt(f.metamagicMax.n) && f.metamagicMax.n >= 2 && f.metamagicMax.n <= 3 && ID.test(f.metamagicMax.while ?? ''))) sub('its metamagicMax is { n, while }.');
  if (f.exchange !== undefined && !(f.uses && f.exchange && ['costs', 'minLevel'].every((k) => f.exchange[k] && Object.values(f.exchange[k]).every((v) => isInt(v) && v > 0)))) sub('its exchange is { costs, minLevel }, with uses.');
  if (f.restore !== undefined && !(f.uses && f.restore && ID.test(f.restore.of ?? '') && isInt(f.restore.max) && f.restore.max >= 0 && f.restore.max <= 20)) sub('its restore is { of, max }, with uses.');
  if (f.action?.orCost !== undefined && !(ID.test(f.action.orCost.resource ?? '') && isInt(f.action.orCost.n) && f.action.orCost.n > 0)) sub('its orCost is { resource, n }.');
  if (f.aura !== undefined) {
    const au = f.aura;
    if (!(au && Object.keys(au).every((k) => ['range', 'modifiers', 'immune'].includes(k)) && isInt(au.range) && au.range > 0 && au.range <= 300 && au.range % 5 === 0
      && (au.immune === undefined || (allOf(CONDITIONS)(au.immune) && au.immune.length)) && (au.modifiers === undefined || (Array.isArray(au.modifiers) && au.modifiers.length <= 10)))) sub('its aura is { range, modifiers?, immune? }.');
    else for (const m of au.modifiers ?? []) lintModifier(m, sub);
  }
  if (f.moveWith !== undefined && !(f.moveWith && ID.test(f.moveWith.of ?? ''))) sub('its moveWith is { of }.');
  if (f.brutal !== undefined) {
    const b = f.brutal;
    if (!(b && (b.dice === undefined || isDice(b.dice)) && (b.after === undefined || ID.test(b.after)) && Array.isArray(b.options) && b.options.length && b.options.length <= 10
      && b.options.every((o) => o && ID.test(o.id ?? '') && isText(o.name)))) sub('its brutal is { after?, dice?, options }.');
    else for (const o of b.options) lintSteps(o.effects, sub);
  }
  if (f.relentless !== undefined && !(f.relentless && ID.test(f.relentless.while ?? '') && isInt(f.relentless.dc) && isInt(f.relentless.step) && isInt(f.relentless.hp) && f.relentless.hp > 0 && f.relentless.hp <= 100)) sub('its relentless is { while, dc, step, hp }.');
  if (f.initiative !== undefined && !(f.initiative && ID.test(f.initiative.regain ?? '') && (f.initiative.upTo === undefined || isInt(f.initiative.upTo))
    && (f.initiative.heal === undefined || isDice(f.initiative.heal)) && (f.initiative.unless === undefined || ID.test(f.initiative.unless)))) sub('its initiative is { regain, upTo?, heal?, unless? }.');
  for (const k of ['evasion', 'surfaces']) if (f[k] !== undefined && f[k] !== true) sub(`its ${k} is true.`);
  if (f.cunning !== undefined) {
    const x = f.cunning;
    if (!(x && (x.max === undefined || (isInt(x.max) && x.max >= 1 && x.max <= 3)) && (x.options === undefined || (Array.isArray(x.options) && x.options.length <= 10 && x.options.every((o) => o && ID.test(o.id ?? '') && isText(o.name) && isInt(o.cost)))))) sub('its cunning is { max?, options? }.');
    else for (const o of x.options ?? []) if (o.effects) lintSteps(o.effects, sub);
  }
  if (f.selfCure !== undefined && !(f.selfCure && allOf(CONDITIONS)(f.selfCure.conditions) && f.selfCure.conditions.length)) sub('its selfCure is { conditions }.');
  if (f.afterHit !== undefined) { if (!(f.afterHit && f.afterHit.modifier?.on === 'attack.roll')) sub('its afterHit is { modifier } on attack.roll.'); else lintModifier(f.afterHit.modifier, sub); }
  if (f.markSpread !== undefined && !(f.markSpread && ID.test(f.markSpread.spell ?? '') && isInt(f.markSpread.range) && f.markSpread.range > 0 && f.markSpread.range <= 300)) sub('its markSpread is { spell, range }.');
  if (f.steadfast !== undefined && !(f.steadfast && ID.test(f.steadfast.spell ?? ''))) sub('its steadfast is { spell }.');
  if (f.restExhaustion !== undefined && f.restExhaustion !== 'short') sub('its restExhaustion is "short".');
  if (f.spellRange !== undefined && !(f.spellRange && ID.test(f.spellRange.spell ?? '') && isInt(f.spellRange.add) && f.spellRange.add > 0 && f.spellRange.add <= 600)) sub('its spellRange is { spell, add }.');
  if (f.repel !== undefined && !(f.repel && ID.test(f.repel.spell ?? '') && isInt(f.repel.feet) && f.repel.feet > 0 && f.repel.feet <= 30)) sub('its repel is { spell, feet }.');
  if (f.forgoAttack !== undefined && !(f.forgoAttack && ID.test(f.forgoAttack.spell ?? ''))) sub('its forgoAttack is { spell }.');
  if (f.invest !== undefined && investProblem(f.invest)) sub(`${investProblem(f.invest)}.`);
  if (f.empowered !== undefined && !(f.empowered && SCHOOLS.includes(f.empowered.school) && ID.test(f.empowered.list ?? '') && ABILITIES.includes(f.empowered.ability))) sub('its empowered is { school, list, ability }.');
  if (f.overchannel !== undefined && !(f.overchannel && ID.test(f.overchannel.list ?? '') && isInt(f.overchannel.maxSlot) && f.overchannel.maxSlot >= 1 && f.overchannel.maxSlot <= 9 && [4, 6, 8, 10, 12].includes(f.overchannel.die))) sub('its overchannel is { list, maxSlot, die }.');
  if (f.fleet !== undefined && !(f.fleet && ID.test(f.fleet.of ?? ''))) sub('its fleet is { of }.');
  if (f.action?.acts !== undefined && !(Array.isArray(f.action.acts) && allOf(['dash', 'disengage', 'dodge'])(f.action.acts))) sub('its action acts lists dash, disengage or dodge.');
  if (f.reroll !== undefined && !(f.reroll && ID.test(f.reroll.cost ?? '') && (f.reroll.add === undefined || (isInt(f.reroll.add) && f.reroll.add >= 0 && f.reroll.add <= 30)))) sub('its reroll is { cost, add? }.');
  if (f.missed !== undefined) { if (!(f.missed && f.missed.modifier && ['turnStart', 'turnEnd'].includes(f.missed.ends?.on))) sub('its missed is { modifier, ends }.'); else lintModifier(f.missed.modifier, sub); }
  if (f.triggers !== undefined) triggersProblems(f.triggers, FEAT_CLASS, (m) => sub(`its ${m}.`));
  if (f.reaction?.on === 'saveFailed') {
    const r = f.reaction;
    if (!(allOf(CONDITIONS)(r.conditions) && r.conditions.length && isInt(r.range) && r.range > 0 && r.range <= 300)) sub('its saveFailed reaction is { on, conditions, range }.');
  } else if (f.reaction?.on === 'damaged' && f.reaction.resist !== undefined) {
    if (!(f.reaction.resist === true && Object.keys(f.reaction).length === 2)) sub('its damaged reaction that resists is { on, resist: true }.');
  } else if (f.reaction?.on === 'damaged') {
    const r = f.reaction;
    if (!(r.attack === 'melee' && isInt(r.within) && r.within > 0 && r.within <= 30 && Object.keys(r).length === 3)) sub('its damaged reaction is { on, attack: "melee", within }.');
  } else if (f.reaction?.on === 'attacks') {
    if (attacksReactionProblem(f.reaction)) sub('its attacks reaction is { on: "attacks", of: a feature id, attack: "melee" }.');
  } else if (f.reaction !== undefined) {
    const r = f.reaction;
    if (!(r && r.on === 'hit' && (r.cut === 'half' || (r.cut && isDice(r.cut.dice) && Object.keys(r.cut).length === 1))
      && Object.keys(r).every((k) => ['on', 'cut', 'seen', 'types'].includes(k)) && (r.seen === undefined || r.seen === true)
      && (r.types === undefined || (allOf(DAMAGE_TYPES)(r.types) && r.types.length)))) sub('its reaction is { on, cut: "half" | { dice }, seen?, types? }.');
  }
  if (findFunction(f)) sub('it is data only.');
}
// extraAttack: the Attack action makes 1 + n attacks (Extra Attack at Fighter 5 is 1, at 11 is 2, at 20 is 3).
const FEATURES = { secondWind: (v) => isInt(v) && v >= 0 && v <= 10, sneak: isDice, extraAttack: (v) => isInt(v) && v >= 1 && v <= 3 };
export function lintRecord(r, { spells = {} } = {}) {
  const bad = [], say = (m) => bad.push(m);
  if (!r || typeof r !== 'object' || Array.isArray(r)) return ['A character is a record.'];
  if (findFunction(r)) return ['A character is data only.'];
  for (const k of Object.keys(r)) if (!RECORD_FIELDS.includes(k)) say(`"${k}" is not something a character record has.`);
  if (r.conditionImmune !== undefined && !(allOf(CONDITIONS)(r.conditionImmune) && r.conditionImmune.length)) say('Its condition immunities are a list of conditions.');
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
    if (a.abil !== undefined && !['str', 'dex'].includes(a.abil)) sub('it uses Strength or Dexterity.');
    if (a.dc !== undefined && !['unarmed-strike', 'unarmed-strike-bonus'].includes(a.id)) sub('only an Unarmed Strike has a save DC.');
    else if (a.dc !== undefined && !within(a.dc, 1, 40)) sub('its save DC is a whole number from 1 to 40.');
    if (a.weapon !== undefined && !ID.test(a.weapon)) sub('its weapon is an id.');
    if (a.time !== undefined && a.time !== 'bonus') sub('its time is "bonus" or left out.');
  }
  if ((r.attacks?.length ?? 0) - (r.attacks?.some((a) => a?.id === 'unarmed-strike') ? 1 : 0) > 12) say('Twelve attacks at most.');   // the Unarmed Strike every built character has (#440) is not counted
  if (r.castAbil !== undefined && !ABILITIES.includes(r.castAbil)) say('Its spellcasting ability is an ability.');
  if (r.spells !== undefined && !list(r.spells, (x) => typeof x === 'string' && Object.hasOwn(spells, x), 400)) say('It knows a spell that is not in the game.');
  if (r.spells?.length && !r.castAbil) say('A character with spells needs a spellcasting ability.');
  if (r.slots !== undefined && !(r.slots && typeof r.slots === 'object' && Object.entries(r.slots).every(([l, n]) => within(+l, 1, 9) && within(n, 0, 9)))) say('Its spell slots are a number for each level 1 to 9.');
  if (r.features !== undefined && !(r.features && typeof r.features === 'object' && Object.entries(r.features).every(([k, v]) => Object.hasOwn(FEATURES, k) && FEATURES[k](v)))) say(`Its features can be: ${Object.keys(FEATURES).join(', ')}.`);
  if (r.gear !== undefined && !list(r.gear, (x) => typeof x === 'string' && x.length > 0 && x.length <= 60, 60)) say('Its gear is a list of short names.');
  for (const k of ['resist', 'vuln', 'immune']) if (r[k] !== undefined && !list(r[k], oneOf(DAMAGE_TYPES))) say(`${k} must be damage types.`);
  if (r.feats !== undefined) {
    if (!Array.isArray(r.feats) || r.feats.length > 60) say('Its features are a list.');
    else { const seen = new Set(); for (const f of r.feats) { lintFeat(f, say); if (seen.has(f?.id)) say(`Feature ${f?.name} is listed twice.`); seen.add(f?.id); } }
    const pools = new Set((Array.isArray(r.feats) ? r.feats : []).filter((f) => f?.uses).map((f) => f.id));
    for (const f of Array.isArray(r.feats) ? r.feats : []) if (f?.action?.cost?.resource !== undefined && !pools.has(f.action.cost.resource)) say(`Feature ${f.name} costs "${f.action.cost.resource}", which it does not have.`);
    for (const f of Array.isArray(r.feats) ? r.feats : []) for (const m of Array.isArray(f?.action?.modes) ? f.action.modes : []) if (m?.cost?.resource !== undefined && !pools.has(m.cost.resource)) say(`Feature ${f.name}: its mode ${m.id} costs "${m.cost.resource}", which it does not have.`);
  }
  if (r.hitDie !== undefined && ![6, 8, 10, 12].includes(r.hitDie)) say('Its Hit Die is d6, d8, d10 or d12.');
  if (r.classes !== undefined && !(Array.isArray(r.classes) && r.classes.length >= 2 && r.classes.length <= 12 && r.classes.every((c) => c && ID.test(c.id ?? '') && within(c.level, 1, 19) && (c.subclass === undefined || ID.test(c.subclass)))
    && r.classes.reduce((n, c) => n + c.level, 0) === r.level)) say('Its classes are a list of { id, level, subclass? } whose levels add up to its level.');
  if (r.hitDice !== undefined && !(r.hitDice && typeof r.hitDice === 'object' && Object.entries(r.hitDice).every(([d, n]) => ['6', '8', '10', '12'].includes(d) && within(n, 1, 20))
    && Object.values(r.hitDice).reduce((a, b) => a + b, 0) === r.level)) say('Its Hit Dice are a count for each size, d6 to d12, adding up to its level.');
  if (r.spellAbil !== undefined && !(r.spellAbil && typeof r.spellAbil === 'object' && Object.entries(r.spellAbil).every(([id, a]) => (r.spells ?? []).includes(id) && ABILITIES.includes(a)))) say('Its spells\' abilities name spells it has and abilities.');
  if (r.armour !== undefined && !['none', 'light', 'medium', 'heavy'].includes(r.armour)) say('What it wears is none, light, medium or heavy armour.');
  for (const k of ['shield', 'pact']) if (r[k] !== undefined && r[k] !== true) say(`${k} is true or left out.`);
  if (r.critOn !== undefined && !within(r.critOn, 15, 19)) say('Its Critical Hit range starts at 15 to 19.');
  if (r.bonusActs !== undefined && !(Array.isArray(r.bonusActs) && r.bonusActs.every((x) => BONUS_ACTS.includes(x)))) say(`Its Bonus Action options are ${BONUS_ACTS.join(', ')}.`);
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

// How many of each class's features (its subclass's included) work fully, partly, or are text for
// the DM. A feature with options counts as its own tier.
export function featureCoverage(classes) {
  const out = {};
  for (const c of classes) {
    const row = out[c.id] = { auto: 0, assist: 0, manual: 0, unchecked: 0, total: 0 };
    for (const f of [...c.features, ...(c.subclass?.features ?? [])]) { row[f.tier]++; row.total++; if (f.checked !== true) row.unchecked++; }
  }
  return out;
}

// ---------- homebrew: the budget, strict mode and lintEntry (docs/specs/homebrew.md, Decisions 1, 2 and 6; task B1) ----------
// A homebrew pack is untrusted input. `budget(doc)` runs first: one walk with its own stack (no recursion), which stops
// at the first container nested too deep and at the most bytes a pack may have, so a hostile document is refused in
// time bounded by the limits, whatever its size or shape. Only a document within the budget is linted, strictly:
// every object has a closed list of keys, ids carry the pack's prefix, nothing claims to be checked against a rulebook.

// The kinds a homebrew pack may hold (Decision 1), in the order a pack lists them.
// `subclasses`: a subclass of an SRD class (docs/specs/homebrew-subclasses.md, Decision 1, stage B1).
export const HOMEBREW_ENTRY_KINDS = ['spells', 'monsters', 'items', 'feats', 'objects', 'weapons', 'armour', 'subclasses'];
// The owner's limits (Decision 2; confirmed in #380). `packs` is per table, the rest per pack.
export const HOMEBREW_LIMITS = Object.freeze({
  packs: 4,                 // packs on one table
  packBytes: 256 * 1024,    // the pack document, as JSON (UTF-8 bytes)
  entries: 200,             // entries in one pack, all kinds together
  entryBytes: 8 * 1024,     // one entry, as JSON
  subclassBytes: 16 * 1024, // one subclass, as JSON: it holds up to 12 features (the largest SRD subclass is under 4 KB; homebrew-subclasses.md, question 2)
  text: 1500,               // letters of a `text` (and of a manual step's text)
  name: 60,                 // letters of a `name`
  string: 200,              // letters of any other string, keys included
  steps: 40,                // effect steps in one entry, nested ones included
  stepDepth: 6,             // lists of steps inside steps (`onHit` inside `onFail` ...), the entry's own list being 1
  depth: 16,                // objects and lists inside each other, the document being 1
});
const BAD_KEYS = ['__proto__', 'constructor', 'prototype'];
const TEXT_KEYS = ['text', 'manual', 'dmNotes'];
const NEWLINE_KEYS = ['text', 'dmNotes'];       // the only places a line break may be
const STEP_LISTS = ['effects', ...BRANCHES];
// Characters no name, id or text may hold (by Unicode property: Cc, Cf, Zs, Zl, Zp, Co, Cn and lone surrogates, a few invisible
// letters and marks; the only blank allowed is U+0020, and the line break in `text` and `dmNotes`): control characters (C0, DEL, C1; a line break only in `text` and `dmNotes`), the
// soft hyphen, bidirectional controls (U+061C, U+200E/F, U+202A-E, U+2066-9), zero-width characters (U+200B-D, U+2060-4, U+FEFF,
// U+180E), line and paragraph separators, other invisible format characters, tag characters (U+E0000-E007F) and a lone
// surrogate. Written with escapes so the source shows what is refused.
const CONTROL = /(?! )[\p{Cc}\p{Cf}\p{Zs}\p{Zl}\p{Zp}\p{Co}\p{Cn}\p{Cs}\u034f\ufffc\u17b4\u17b5\u115f\u1160\u3164\uffa0\u2800\u180b-\u180d\ufe00-\ufe0f\u{e0100}-\u{e01ef}]/u;
const CONTROL_NL = /(?![ \n])[\p{Cc}\p{Cf}\p{Zs}\p{Zl}\p{Zp}\p{Co}\p{Cn}\p{Cs}\u034f\ufffc\u17b4\u17b5\u115f\u1160\u3164\uffa0\u2800\u180b-\u180d\ufe00-\ufe0f\u{e0100}-\u{e01ef}]/u;
// A name is Latin-script only for now: letters (A-Z, the accented letters of Latin-1, Latin Extended-A and the Latin
// Extended Additional block), digits, single spaces inside it and ' - , . ( ) & : ! ? / + and the typographic apostrophe (the SRD's own names use + and U+2019). No combining mark survives NFC.
const NAME_OK = /^[A-Za-z0-9\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u00ff\u0100-\u017f\u1e00-\u1eff'\u2019+\-,.()&:!?/]+(?: [A-Za-z0-9\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u00ff\u0100-\u017f\u1e00-\u1eff'\u2019+\-,.()&:!?/]+)*$/;
export const nameProblem = (s) => (NAME_OK.test(s.normalize('NFC')) ? null : 'a name holds only Latin letters (with accents), digits, single spaces and the marks \' \u2019 + - , . ( ) & : ! ? /');
const badChar = (s, key) => (NEWLINE_KEYS.includes(key) ? CONTROL_NL : CONTROL).test(s);
const letters = (s) => { let n = 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c < 0xdc00 || c > 0xdfff || i === 0 || s.charCodeAt(i - 1) < 0xd800 || s.charCodeAt(i - 1) > 0xdbff) n++; } return n; };
// UTF-8 bytes of a string as JSON writes it (quotes and escapes included).
function jsonBytes(s) {
  const j = JSON.stringify(s);
  let n = 0;
  for (let i = 0; i < j.length; i++) {
    const c = j.charCodeAt(i);
    if (c < 0x80) n += 1; else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < j.length && j.charCodeAt(i + 1) >= 0xdc00 && j.charCodeAt(i + 1) <= 0xdfff) { n += 4; i++; } else n += 3;
  }
  return n;
}
const plainObject = (x) => { const p = Object.getPrototypeOf(x); return p === Object.prototype || p === null; };
const shortId = (e) => (e && typeof e === 'object' && typeof e.id === 'string' ? (e.id.length > 80 ? `${e.id.slice(0, 80)}...` : e.id) : '?');
const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const at = (path) => (path ? ` at ${path}` : '');

// Walks one value with an explicit stack. `level` is the nesting of the value's container (the pack document is 1,
// an entry is 3). Says what is over a limit; returns the JSON bytes counted (it stops counting past `room`).
function scan(root, level, limits, say, room, base = '') {
  let bytes = 0, steps = 0, over = false;
  const stack = [[root, level, base, 0, base || null]];
  while (stack.length && !over) {
    const [v, lv, path, sd, key] = stack.pop();
    if (v === undefined) { bytes += 4; continue; }                       // in a list JSON writes null; an object's is skipped below
    if (v === null || typeof v === 'boolean') { bytes += v ? 4 : v === null ? 4 : 5; continue; }
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) { say(`a number${at(path)} is not one JSON can hold`); continue; }
      bytes += String(v).length; continue;
    }
    if (typeof v === 'string') {
      bytes += jsonBytes(v);
      const n = letters(v), most = TEXT_KEYS.includes(key) ? limits.text : key === 'name' ? limits.name : limits.string;
      if (n > most) say(`${key === 'name' ? 'the name' : TEXT_KEYS.includes(key) ? 'the text' : 'a piece of text'}${at(path)} is ${thousands(n)} letters long; the most is ${thousands(most)}`);
      if (key === 'name' && !badChar(v, key)) { const np = nameProblem(v); if (np) say(`the name${at(path)} is not allowed: ${np}`); }
      if (badChar(v, key)) say(`the text${at(path)} has a control character, or an invisible or direction-changing one (or a line break outside \`text\`); text is plain text`);
      continue;
    }
    if (typeof v !== 'object') { say(`${typeof v === 'function' ? 'a function' : `a ${typeof v}`}${at(path)} is not data; content is data only`); continue; }
    if (!Array.isArray(v) && !plainObject(v)) { say(`something${at(path)} is not plain data (only objects, lists, text, numbers, true, false and null)`); continue; }
    if (lv > limits.depth) { say(`it nests deeper than ${limits.depth} levels${at(path)}`); continue; }
    if (Array.isArray(v)) {
      // A list is measured before it is walked: each element takes at least two bytes of JSON, so a length the room cannot
      // hold is refused at once (an in-memory array can be `new Array(1e9)`), and a list with gaps is not data.
      if (bytes + 2 * v.length > room + 2) { bytes = room + 1; over = true; continue; }          // the caller says the bytes are over
      if (Object.keys(v).length !== v.length) { say(`a list${at(path)} has gaps in it; a list is a run of values`); continue; }
      const list = STEP_LISTS.includes(key), d = list ? sd + 1 : sd;
      if (list && d > limits.stepDepth) { say(`its steps nest deeper than ${limits.stepDepth} levels${at(path)}`); continue; }
      if (list) steps += v.length;
      bytes += 2 + Math.max(0, v.length - 1);
      for (let i = v.length - 1; i >= 0; i--) stack.push([v[i], lv + 1, `${path}[${i}]`, d, list ? null : key]);
    } else {
      const keys = Object.keys(v).filter((k) => v[k] !== undefined);
      bytes += 2 + Math.max(0, keys.length - 1);
      for (let i = keys.length - 1; i >= 0; i--) {
        const k = keys[i], p = path ? `${path}.${k}` : k;
        bytes += jsonBytes(k) + 1;
        if (BAD_KEYS.includes(k)) { say(`it has a key "${k}"${at(path)}, which no content may have`); continue; }
        if (letters(k) > limits.string) say(`a key${at(path)} is ${thousands(letters(k))} letters long; the most is ${thousands(limits.string)}`);
        if (CONTROL.test(k)) say(`a key${at(path)} has a character that cannot be shown or that hides what it says`);
        stack.push([v[k], lv + 1, p, sd, k]);
      }
    }
    if (bytes > room) over = true;
  }
  return { bytes, steps, over };
}

// The most bytes one entry of a kind may be: a subclass holds many features, so it has twice the room of the others.
const entryBytesOf = (kind, L) => (kind === 'subclasses' ? L.subclassBytes : L.entryBytes);
// The budget of one homebrew pack document (a parsed object). Returns plain sentences, [] when it is within every limit.
export function budget(doc, limits = HOMEBREW_LIMITS) {
  const L = { ...HOMEBREW_LIMITS, ...limits }, problems = [], MOST = 20;
  const push = (m) => { if (problems.length < MOST) problems.push(m); };
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || !plainObject(doc)) return ['pack: is not a pack document'];
  const keys = Object.keys(doc).filter((k) => doc[k] !== undefined);
  let bytes = 2 + Math.max(0, keys.length - 1), entries = 0, stop = false;
  for (const k of keys) {
    bytes += jsonBytes(k) + 1;
    if (BAD_KEYS.includes(k)) { push(`pack: it has a key "${k}", which no content may have`); continue; }
    const v = doc[k];
    if (!Array.isArray(v)) {
      const r = scan(v, 2, L, (m) => push(`pack: ${m}`), L.packBytes - bytes, k);
      bytes += r.bytes;
      if (r.over) { stop = true; break; }
      continue;
    }
    if (letters(k) > L.string) { push(`pack: a key is ${thousands(letters(k))} letters long; the most is ${thousands(L.string)}`); continue; }
    entries += v.length;
    if (entries > L.entries) { push(`pack: it has more than ${thousands(L.entries)} entries; the most a pack may have is ${thousands(L.entries)}`); stop = true; break; }
    bytes += 2 + Math.max(0, v.length - 1);
    for (const e of v) {
      const label = `${k}/${shortId(e)}`;
      const most = entryBytesOf(k, L);
      const r = scan(e, 3, L, (m) => push(`${label}: ${m}`), Math.min(L.packBytes - bytes, most));
      bytes += r.bytes;
      if (r.bytes > most) push(`${label}: it is over ${thousands(most)} bytes as JSON; the most for one entry is ${thousands(most)}`);
      if (r.steps > L.steps) push(`${label}: it has ${r.steps} effect steps; the most for one entry is ${L.steps}`);
      if (bytes > L.packBytes) { stop = true; break; }
    }
    if (stop) break;
  }
  if (bytes > L.packBytes) push(`pack: it is over ${thousands(L.packBytes)} bytes as JSON; the most for a pack is ${thousands(L.packBytes)}`);
  return problems;
}
// The budget of one entry alone (lintEntry), measured as it would be inside a pack (an entry is nested at level 3).
export function budgetEntry(kind, entry, limits = HOMEBREW_LIMITS) {
  const L = { ...HOMEBREW_LIMITS, ...limits }, problems = [], label = `${kind}/${shortId(entry)}`;
  const most = entryBytesOf(kind, L);
  const r = scan(entry, 3, L, (m) => { if (problems.length < 20) problems.push(`${label}: ${m}`); }, most);
  if (r.bytes > most) problems.push(`${label}: it is over ${thousands(most)} bytes as JSON; the most for one entry is ${thousands(most)}`);
  if (r.steps > L.steps) problems.push(`${label}: it has ${r.steps} effect steps; the most for one entry is ${L.steps}`);
  return problems;
}
// How many packs a table may have: `packs` is the table's list after the change.
export function budgetTable(packs, limits = HOMEBREW_LIMITS) {
  const most = { ...HOMEBREW_LIMITS, ...limits }.packs, n = Array.isArray(packs) ? packs.length : NaN;
  if (!Number.isInteger(n)) return ['table: packs must be a list'];
  return n > most ? [`table: a table may have ${most} homebrew packs; this would make ${n}`] : [];
}

// ---------- strict mode: the closed key lists ----------
// Every key an object of each shape may have. Written from the linter above and from what the engine reads; a test
// holds every SRD entry of the seven kinds to them (so they are never stricter than the vocabulary), and docs/specs
// homebrew.md, Decision 6, has shapes.js derive them in B2. A shape of `null` keys has its keys checked by the
// linter already (a map of skills, of states, of levels); its values are walked for the shapes below.
const STEP_KEYS = {
  attack: ['kind', 'bonus', 'advantageIf', 'onHit', 'onMiss'], save: ['dc', 'half', 'advantageIf', 'onFail', 'onSuccess'], damage: ['type', 'times', 'onZero', 'onKill'],
  heal: ['addMod', 'atLeast'], tempHp: ['addMod', 'atLeast'], condition: ['ends', ...HOLD_KEYS], modifier: ['ends', 'to'], move: ['dir', 'largest'], fall: [], set: ['of'],
  reveal: [], resource: [], counter: [], teleport: ['see', 'blocked'], cure: [], kill: [], remains: [], endConcentration: [],
  summon: SUMMON_STEP_KEYS.filter((k) => k !== 'summon'), manual: [],
};
// Why a key a reader might expect is not one (the sentence follows "is not something ... has").
const NOT_HERE = {
  'subclasses.casting': 'a subclass cannot give its class spellcasting (spell slots need a spellcasting table the class entry does not have)',
  'subclasses.subclass': 'a subclass is of an SRD class, and has no subclass of its own',
  'feature.feat': 'a subclass has no feat slot (a feat of the player\'s choice is a class feature)',
  'feature.casting': 'a subclass cannot give its class spellcasting',
};
const AMOUNT_KEYS = ['perLevel', 'column', 'mod', 'min', 'die', 'byLevel', 'prof'];
const SHAPES = {
  spells: { what: 'a spell', keys: ['id', 'name', 'source', 'level', 'school', 'classes', 'time', 'range', 'components', 'duration', 'concentration', 'ritual', 'target', 'effects', 'higher', 'tier', 'checked', 'text', 'kinds', 'choice', 'costly', 'terrain', 'zone', 'reaction'] },
  monsters: { what: 'a monster', keys: ['id', 'name', 'source', 'size', 'type', 'cr', 'xp', 'pb', 'ac', 'hp', 'speed', 'senses', 'abilities', 'initiative', 'languages', 'skills', 'resist', 'vulnerable', 'immune', 'conditionImmune', 'saves', 'hover', 'mount', 'traits', 'actions', 'tier', 'checked', 'text'] },
  items: { what: 'an item', keys: ['id', 'name', 'category', 'rarity', 'attune', 'wear', 'base', 'bonus', 'damageType', 'properties', 'trained', 'mithral', 'grants', 'variant', 'charges', 'activate', 'tier', 'source', 'checked', 'text'] },
  feats: { what: 'a feat', keys: ['id', 'name', 'category', 'prerequisite', 'repeatable', 'tier', 'source', 'checked', 'text', 'increase', 'proficiencies', 'spellPick', 'grants'] },
  objects: { what: 'an object', keys: ['id', 'name', 'kind', 'source', 'tier', 'checked', 'text', 'states', 'initial', 'use', 'triggers', 'find', 'dc', 'connects'] },
  weapons: { what: 'a weapon', keys: ['id', 'name', 'category', 'kind', 'damage', 'type', 'properties', 'mastery', 'range', 'versatile', 'ammo', 'twoHandedUnlessMounted', 'weight', 'cost', 'source', 'checked'] },
  armour: { what: 'armour', keys: ['id', 'name', 'category', 'ac', 'dex', 'stealth', 'strength', 'weight', 'cost', 'source', 'checked'] },
  // A subclass of an SRD class (docs/specs/homebrew-subclasses.md, Decision 2): what an SRD class's `subclass` holds, with the class it belongs to.
  subclasses: { what: 'a subclass', keys: ['id', 'name', 'class', 'source', 'checked', 'text', 'spells', 'features', 'dmNotes'] },
  feature: { what: 'a subclass feature', keys: ['id', 'name', 'level', 'tier', 'checked', 'text', 'uses', 'grants', 'options', 'pick', 'dmNotes'] },
  option: { what: 'an option of a subclass feature', keys: ['id', 'name', 'text', 'tier', 'grants', 'requires', 'uses', 'feat'] },
  featureUses: { what: 'a feature\'s uses', keys: ['max', 'recharge', 'short'] },
  requires: { what: 'what an option requires', keys: ['level', 'option', 'spell'] },
  spellMap: { what: 'spells by class level', keys: null },
  target: { what: 'a target', keys: ['self', 'creature', 'area', 'near'] },
  area: { what: 'an area', keys: ['shape', 'size', 'range', 'width', 'height', 'exceptCaster', 'types', 'choose', 'count'] },
  creature: { what: 'a creature target', keys: ['count', 'repeat', 'within', 'reach', 'range'] },
  modifier: { what: 'a modifier', keys: ['on', 'op', 'value', 'types', 'scope', 'against', 'uses', 'once', 'onFail', 'cost', 'except', 'stack', 'spell', 'when'] },
  value: { what: 'a modifier value', keys: [...AMOUNT_KEYS, 'rolled'] },
  scope: { what: 'a scope', keys: ['skill', 'ability', 'condition', 'tool'] },
  ends: { what: 'an ending', keys: ['on', 'of', 'by', 'save', 'at', 'dc', 'orDamaged'] },
  higher: { what: 'casting higher', keys: ['level', 'targets', 'slot'] },
  slot: { what: 'casting with a higher slot', keys: ['damage', 'heal', 'tempHp', 'times', 'targets', 'value'] },
  choice: { what: 'a choice', keys: ['of', 'from'] },
  zone: { what: 'a zone', keys: ['on', 'once', 'atCast', 'spare'] },
  terrain: { what: 'terrain', keys: ['difficult', 'obscured', 'lasts'] },
  reaction: { what: 'a reaction', keys: ['on', 'blocks', 'ac', 'attack', 'manual'] },
  bond: { what: 'a summon bond', keys: SUMMON_BOND_KEYS },
  count: { what: 'a summon count', keys: ['slot', 'base', 'above'] },
  over: { what: 'what a summon replaces', keys: ['speed'] },
  forms: { what: 'summon forms', keys: ['type', 'cr'] },
  trait: { what: 'a trait', keys: ['id', 'name', 'text', 'modifiers', 'reaction', 'dragFree'] },
  action: { what: 'an action', keys: ['id', 'name', 'text', 'time', 'target', 'effects', 'uses', 'recharge', 'multiattack'] },
  uses: { what: 'uses', keys: ['per', 'n'] },
  attackEntry: { what: 'a multiattack entry', keys: ['action', 'times'] },
  orList: { what: 'a multiattack', keys: ['or'] },
  abilities: { what: 'ability scores', keys: ABILITIES },
  state: { what: 'a state', keys: ['name', 'blocks', 'hidden', 'light'] },
  light: { what: 'light', keys: ['bright', 'dim'] },
  objectDc: { what: 'DCs', keys: ['save', 'find'] },
  find: { what: '`find`', keys: ['to'] },
  trigger: { what: 'a trigger', keys: ['on', 'from', 'to', 'feet', 'who', 'area', 'effects'] },
  use: { what: 'a use', keys: ['id', 'name', 'from', 'to', 'time', 'key', 'check', 'effects'] },
  check: { what: 'a check', keys: ['ability', 'skill', 'tool', 'dc'] },
  activate: { what: 'an item use', keys: ['name', 'time', 'cost', 'consumed', 'spell', 'level', 'upTo', 'self', 'dc', 'effects'] },
  attune: { what: 'attunement', keys: ['by', 'spellcaster'] },
  base: { what: 'a base item', keys: ['weapon', 'armour'] },
  charges: { what: 'charges', keys: ['max', 'regain'] },
  prerequisite: { what: 'a prerequisite', keys: ['level', 'abilities', 'feature'] },
  anyAbility: { what: 'an ability prerequisite', keys: ['any', 'min'] },
  increase: { what: 'an ability increase', keys: ['from', 'points', 'max'] },
  proficiencies: { what: 'proficiencies', keys: ['n'] },
  spellPick: { what: 'a spell pick', keys: ['lists', 'abilities', 'cantrips', 'level1'] },
  grants: { what: 'grants', keys: GRANTS },
  freeCast: { what: 'a freeCast', keys: ['list', 'maxLevel', 'spells', ...FREE_CAST_FLAGS, 'time', ...Object.keys(FREE_CAST_LISTS), 'cost', 'components'] },
  freeCastCost: { what: 'a freeCast cost', keys: ['slot', 'uses'] },
  aura: { what: 'an aura', keys: ['range', 'modifiers', 'immune'] },
  formOf: { what: 'a form grant', keys: FORM_OF_KEYS },
  triggers: { what: 'a trigger list', keys: TRIGGER_KEYS },
  attackTrigger: { what: 'the trigger on taking the Attack action', keys: ['modifiers'] },
  hitTrigger: { what: 'the trigger after an Opportunity Attack hits', keys: ['move'] },
  formCost: { what: 'the price of a form', keys: ['resource', 'n'] },
  map: { what: 'a map', keys: null },
  speedMap: { what: 'speeds', keys: null }, senseMap: { what: 'senses', keys: null }, skillMap: { what: 'skills', keys: null }, saveMap: { what: 'saves', keys: null },
  abilityMap: { what: 'ability scores', keys: null }, levelMap: { what: 'a table by level', keys: null },
  open: { what: 'a value', keys: null },
};
// The shape of a child: by its parent's shape and its key. A list's items take the shape given for the list.
const CHILD = {
  spells: { target: 'target', effects: 'steps', higher: 'higher', choice: 'choice', zone: 'zone', terrain: 'terrain', reaction: 'reaction' },
  monsters: { speed: 'speedMap', senses: 'senseMap', skills: 'skillMap', saves: 'saveMap', abilities: 'abilities', traits: 'trait[]', actions: 'action[]' },
  items: { attune: 'attune', base: 'base', charges: 'charges', grants: 'grants', activate: 'activate[]' },
  feats: { prerequisite: 'prerequisite', increase: 'increase', proficiencies: 'proficiencies', spellPick: 'spellPick', grants: 'grants' },
  objects: { states: 'states', find: 'find', dc: 'objectDc', triggers: 'trigger[]', use: 'use[]' },
  subclasses: { spells: 'spellMap', features: 'feature[]' },
  feature: { uses: 'featureUses', grants: 'grants', options: 'option[]' },
  option: { grants: 'grants', requires: 'requires', uses: 'featureUses' },
  featureUses: { max: 'value' },
  target: { creature: 'creature', area: 'area' },
  modifier: { value: 'value', scope: 'scope' },
  value: { byLevel: 'levelMap' },
  higher: { level: 'levelMap', targets: 'levelMap', slot: 'slot' },
  trait: { modifiers: 'modifier[]', reaction: 'reaction' },
  action: { target: 'target', effects: 'steps', uses: 'uses', multiattack: 'multiattack' },
  state: { light: 'light' },
  trigger: { effects: 'steps' }, use: { check: 'check', effects: 'steps' }, activate: { effects: 'steps' },
  prerequisite: { abilities: 'anyAbility' },
  grants: { modifiers: 'modifier[]', aura: 'aura', abilityBonus: 'abilityMap', setAbility: 'abilityMap', senses: 'senseMap', senseRange: 'senseMap', freeCast: 'freeCast', formOf: 'formOf', triggers: 'triggers' },
  triggers: { attackAction: 'attackTrigger', opportunityHit: 'hitTrigger' },
  attackTrigger: { modifiers: 'modifier[]' },
  freeCast: { cost: 'freeCastCost' },
  formOf: { maxCr: 'value', typesMaxCr: 'value', tempHp: 'value', cost: 'formCost' },
  aura: { range: 'value', modifiers: 'modifier[]' },
  bond: {}, over: { speed: 'speedMap' },
};
// Inside a shape the linter closes in its own way (grants' many parts, a map's values), steps and modifiers are still
// found by their key and held to their lists.
const BY_KEY = { effects: 'steps', modifiers: 'modifier[]', modifier: 'modifier', target: 'target', zone: 'zone', choice: 'choice' };

// `visit(shape, key, value, path, owner)` (optional) is called for every key of every shape the walk meets; a step's shape
// is `step.<kind>`. The value checks of strict mode ride on it.
export function lintKeys(kind, entry, say, visit) {
  const stack = [[entry, kind, '']];
  while (stack.length) {
    const [v, shape, path] = stack.pop();
    if (v === null || typeof v !== 'object') continue;
    const where = path ? `${path}: ` : '';
    if (shape.endsWith('[]')) { if (Array.isArray(v)) v.forEach((x, i) => { visit?.(shape, i, x, `${path}[${i}]`, v); stack.push([x, shape.slice(0, -2), `${path}[${i}]`]); }); continue; }
    if (shape === 'steps') {
      if (!Array.isArray(v)) continue;
      v.forEach((st, i) => {
        if (!st || typeof st !== 'object' || Array.isArray(st)) { visit?.('step[]', i, st, `${path}[${i}]`, v); return; }
        const p = `${path}[${i}]`, kinds = STEPS.filter((k) => Object.hasOwn(st, k));
        if (kinds.length !== 1) return;                       // the linter says so already
        const allowed = ['when', kinds[0], ...STEP_KEYS[kinds[0]]];
        for (const k of Object.keys(st)) {
          if (BAD_KEYS.includes(k)) { say(`${p}: has a key "${k}", which no content may have`); continue; }
          if (!allowed.includes(k)) { say(`${p}: "${k}" is not something a ${kinds[0]} step has`); continue; }
          visit?.(`step.${kinds[0]}`, k, st[k], `${p}.${k}`, st);
          const child = BRANCHES.includes(k) ? 'steps' : kinds[0] === 'summon' ? { bond: 'bond', count: 'count', reassert: 'count', over: 'over', forms: Array.isArray(st.forms) ? 'open' : 'forms' }[k] ?? 'open'
            : k === 'modifier' ? 'modifier' : k === 'ends' ? 'ends' : 'open';
          stack.push([st[k], child, `${p}.${k}`]);
        }
      });
      continue;
    }
    if (shape === 'multiattack') { stack.push([v, Array.isArray(v) ? 'attackEntry[]' : 'orList', path]); continue; }
    if (shape === 'orList' || shape === 'states') {
      for (const k of Object.keys(v)) { if (BAD_KEYS.includes(k)) { say(`${where}has a key "${k}", which no content may have`); continue; }
        if (shape === 'orList' && k !== 'or') { say(`${where}"${k}" is not something a multiattack has`); continue; }
        if (shape === 'orList') { visit?.('orList', k, v[k], `${path}.${k}`, v); if (Array.isArray(v.or)) v.or.forEach((l, i) => stack.push([l, 'attackEntry[]', `${path}.or[${i}]`])); } else { visit?.('states', k, v[k], `${path ? `${path}.` : ''}states.${k}`, v); stack.push([v[k], 'state', `${path ? `${path}.` : ''}states.${k}`]); } }
      continue;
    }
    const S = SHAPES[shape];
    for (const k of Object.keys(v)) {
      if (BAD_KEYS.includes(k)) { say(`${where}has a key "${k}", which no content may have`); continue; }
      if (S.keys && !Array.isArray(v) && !S.keys.includes(k)) { say(`${where}"${k}" is not something ${S.what} has${NOT_HERE[`${shape}.${k}`] ? `: ${NOT_HERE[`${shape}.${k}`]}` : ''}`); continue; }
      const p = Array.isArray(v) ? `${path}[${k}]` : path ? `${path}.${k}` : k;
      visit?.(shape, k, v[k], p, v);
      const child = CHILD[shape]?.[k] ?? (S.keys === null || shape === 'grants' || shape === 'open' ? BY_KEY[k] ?? 'open' : 'open');
      stack.push([v[k], child === 'states' ? 'states' : child, child === 'states' ? path : p]);
    }
  }
}
// Values the linter above leaves unchecked because the SRD pack's are known good; a homebrew pack's are not.
function lintUnchecked(kind, e, say) {
  const size = (n) => n === undefined || (typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 10000);
  if (kind === 'monsters' && e.hover !== undefined && e.hover !== true) say('hover is true or left out');
  if (kind === 'weapons' || kind === 'armour') {
    if (!size(e.weight)) say('weight is pounds, a number from 0 to 10,000');
    if (e.cost !== undefined && !(size(e.cost) || (typeof e.cost === 'string' && /^(\d{1,6}|\d{1,3}(,\d{3})+) (CP|SP|EP|GP|PP)$/.test(e.cost)))) say('cost is a number or a price like "5 GP"');
  }
  if (kind === 'weapons' && e.ammo !== undefined && !ID.test(e.ammo)) say('ammo names a kind of ammunition, in kebab-case');
  if (kind === 'weapons' && e.twoHandedUnlessMounted !== undefined && e.twoHandedUnlessMounted !== true) say('twoHandedUnlessMounted is true or left out');
  const steps = [];
  const lists = kind === 'spells' ? [e.effects] : kind === 'monsters' ? (e.actions ?? []).map((a) => a?.effects)
    : kind === 'objects' ? [...(e.use ?? []), ...(e.triggers ?? [])].map((u) => u?.effects) : kind === 'items' ? (e.activate ?? []).map((u) => u?.effects)
    : kind === 'subclasses' ? grantsOf(Array.isArray(e.features) ? e.features : []).flatMap((g) => [g.action?.effects, ...(Array.isArray(g.action?.modes) ? g.action.modes.map((m) => m?.effects) : [])]) : [];
  for (const l of lists) walkSteps(l, (st) => { if (st && typeof st === 'object') steps.push(st); });
  for (const st of steps) {
    if (st.half !== undefined && typeof st.half !== 'boolean') say('a save step\'s `half` is true or false');
    if (st.largest !== undefined && !SIZES.includes(st.largest)) say(`a move or condition step's \`largest\` is one of ${SIZES.join(', ')}`);
  }
  const area = kind === 'spells' ? [e.target?.area] : kind === 'monsters' ? (e.actions ?? []).map((a) => a?.target?.area) : [];
  for (const a of area) if (a?.height !== undefined && !(isInt(a.height) && a.height > 0 && a.height % 5 === 0)) say('an area\'s height is feet, a multiple of 5');
}

// ---------- strict mode: values (fix round 1 of #389: the numbers, the types, the characters) ----------
// Strict mode checks what a value IS, not only which key it sits under. Every number in an entry has a whole-number range
// in HOMEBREW_RANGES, found by the name of the object that holds it and its key ("area.size", "step.times", "speed.*"); a
// number with no range is refused. The ceilings are written from what play needs: about twice the largest value the SRD
// pack uses for that field (a test computes the SRD's maxima and holds every SRD entry inside them), and for a field the
// SRD never uses, what a table could want. The engine itself still trusts a number it is handed by other means (DEBT).
const FEET = [5, 1000];
export const HOMEBREW_RANGES = Object.freeze({
  // creatures
  'abilities.*': [1, 40], 'abilityBonus.*': [0, 10], 'abilityBonus.max': [1, 40], 'setAbility.*': [1, 40],
  'monsters.ac': [1, 50], 'monsters.cr': [0, 60, 8], 'monsters.hp': [1, 1400], 'monsters.initiative': [-10, 40], 'monsters.pb': [2, 18], 'monsters.xp': [0, 310000],
  'saves.*': [-10, 30], 'skills.*': [-10, 40], 'senses.*': [0, 300], 'senseRange.*': [0, 150], 'speed.*': [0, 300], 'speeds.*': [0, 100],
  'action.recharge': [2, 6], 'uses.n': [1, 10], 'multiattack.times': [1, 10], 'or.times': [1, 10], 'reaction.ac': [1, 10],
  'forms.cr': [0, 60, 8],
  // spells
  'spells.level': [0, 9], 'spells.range': [1, 10560000],
  'area.size': FEET, 'area.range': FEET, 'area.height': [5, 100], 'area.width': [5, 100], 'area.choose': [2, 20], 'area.count': [2, 20],
  'creature.count': [1, 20], 'creature.range': [5, 1200], 'creature.reach': [0, 120], 'creature.within': [5, 100], 'target.near': [5, 60],
  'targets.#': [1, 20], 'slot.targets': [1, 20], 'slot.times': [1, 10], 'slot.value': [1, 40],
  'count.slot': [1, 9], 'count.base': [0, 30], 'count.above': [0, 30], 'reassert.slot': [1, 9], 'reassert.base': [0, 30], 'reassert.above': [0, 30],
  'bond.range': [5, 1000], 'bond.leash': [5, 1000], 'freeCast.maxLevel': [1, 9],
  // steps and modifiers
  'step.bonus': [-10, 40], 'step.dc': [1, 50], 'step.escape': [1, 40], 'step.holds': [1, 20], 'step.times': [1, 10], 'step.atLeast': [1, 100], 'step.move': [5, 120], 'step.fall': [1, 100], 'step.teleport': [5, 1000],
  'modifier.value': [-40, 40], 'modifier.uses': [1, 1], 'value.perLevel': [1, 10], 'value.min': [0, 20], 'value.prof': [1, 4], 'byLevel.#': [-40, 40],
  'ends.dc': [1, 50],
  // items, feats, objects, weapons, armour
  'items.bonus': [1, 3], 'charges.max': [1, 50], 'activate.cost': [1, 20], 'activate.dc': [5, 30], 'activate.level': [1, 9], 'activate.upTo': [1, 9],
  'increase.max': [20, 30], 'increase.points': [1, 2], 'prerequisite.level': [1, 20], 'proficiencies.n': [1, 5], 'spellPick.cantrips': [0, 4], 'spellPick.level1': [0, 2],
  'grants.armouredAc': [0, 10], 'grants.bareAc': [0, 10], 'grants.rangedAttack': [0, 10], 'aura.range': [5, 100],
  'light.bright': [0, 100], 'light.dim': [0, 100], 'dc.save': [1, 50], 'dc.find': [1, 50], 'check.dc': [1, 50], 'trigger.feet': [5, 100], 'trigger.area': [5, 100],
  'weapons.range': [1, 1200], 'weapons.weight': [0, 40, 16], 'weapons.cost': [0, 3000], 'armour.ac': [1, 20], 'armour.dex': [0, 10], 'armour.strength': [1, 30],
  'armour.weight': [0, 130, 16], 'armour.cost': [0, 3000],
  // a subclass's features: a subclass comes at class level 3 (SRD 5.2), and `uses.max` may be a number or an amount (`max.*`)
  'features.level': [3, 20], 'features.pick': [2, 12], 'requires.level': [3, 20], 'uses.max': [1, 20], 'uses.short': [1, 20], 'max.min': [0, 20], 'max.perLevel': [1, 10], 'max.prof': [1, 4],
  // the numbers of such an amount in a step (`damage: { mod: 'wis', min: 1, die: 6 }`)
  'damage.min': [0, 20], 'heal.min': [0, 20], 'tempHp.min': [0, 20], 'damage.die': [4, 12], 'heal.die': [4, 12], 'tempHp.die': [4, 12],
  // a subclass's `formOf` (#516): a Challenge Rating (a fraction of eighths, as a monster's), more Temporary Hit Points
  'formOf.maxCr': [0, 30, 8], 'formOf.typesMaxCr': [0, 30, 8], 'formOf.tempHp': [1, 100],
  'damage.perLevel': [1, 10], 'heal.perLevel': [1, 10], 'tempHp.perLevel': [1, 10], 'damage.prof': [1, 4], 'heal.prof': [1, 4], 'tempHp.prof': [1, 4],
});
// Where a subclass's number may go further than the range every kind has: the SRD's own Draconic Sorcerer sets a Fly Speed of 60 by a modifier (a speed).
// (A modifier of a subclass may reach 120 here, but `lintSubclass` holds every hook but a speed to 40, as a feat's are.)
const SUBCLASS_RANGES = Object.freeze({ 'modifier.value': [-120, 120] });
const SPEED_HOOKS = ['speed', 'speed.fly'];
// A Challenge Rating of a subclass's `formOf` by level (`byLevel` takes whole numbers elsewhere) may be a fraction of eighths, as the plain one's is (`formOf.maxCr`).
const FORM_CR = Object.freeze([0, 30, 8]), FORM_CR_PATH = /\.formOf\.(maxCr|typesMaxCr)\.byLevel\.\d+$/;
// What a `grants` may hold beyond the fields above (a feature's grants are many shapes; none needs a big number).
const GRANTS_ANY = [-100, 100];
// Dice written as a string, one roll: how many, how many sides, and the flat part. The SRD pack's largest, measured over every
// dice string of every entry (homebrew-dice.test.js computes them): 26 dice (the Ancient Red Dragon's 26d6), 12 sides (Poison
// Spray's d12) and a flat 70 (Heal). The ceilings are about twice those (#408: the sides were 100, eight times the SRD's, and
// the cause of "50d100"). What one use rolls in all is the work estimate's to hold (HOMEBREW_WORK.dice, below).
export const HOMEBREW_DICE = Object.freeze({ count: 50, sides: 24, flat: 140 });
export const HOMEBREW_DURATIONS = Object.freeze({ round: 12, minute: 20, hour: 48, day: 60 });
export const HOMEBREW_COST = 3000;                // gold pieces: the dearest thing the SRD sells costs 1,500 GP
const COIN_GP = { CP: 0.01, SP: 0.1, EP: 0.5, GP: 1, PP: 10 };
// The length a list may have, by the name of the object that holds it and its key (`*.step` for any owner). About twice the
// SRD's longest (and never under 8 for a short list); a list with no ceiling is refused. Lists in a feature's grants take GRANTS_LEN.
export const HOMEBREW_LENGTHS = Object.freeze({
  '*.step': 20, '*.blocks': 2, 'area.types': 14, 'freeCast.forms': 20, 'formOf.forms': 20, 'freeCast.spells': 30, 'freeCast.types': 14, 'freeCast.ends': 2, 'monsters.action': 10, 'monsters.trait': 20, 'monsters.reaction': 4, 'action.multiattack': 6, 'multiattack.or': 6, 'multiattack.action': 8, 'or.action': 8,
  'abilities.any': 6, 'action.recharge': 2, 'attune.by': 8, 'aura.modifier': 8, 'base.armour': 20, 'base.weapon': 20, 'bond.ends': 2, 'choice.from': 24, 'creature.range': 2,
  'grants.conditionImmune': 14, 'grants.modifier': 8, 'grants.resist': 13, 'grants.speeds': 3, 'increase.from': 6, 'items.activate': 10, 'items.properties': 9, 'modifier.types': 14,
  'modifier.when': 8, 'monsters.conditionImmune': 14, 'monsters.immune': 13, 'monsters.languages': 10, 'monsters.resist': 13, 'monsters.vulnerable': 13, 'objects.trigger': 6,
  // a subclass: 12 features, 13 options to a feature (the SRD's own Fiendish Resilience has 12), 5 spells at a class level (homebrew-subclasses.md, question 2)
  'subclasses.features': 12, 'features.options': 13, 'spells.#': 5,
  'objects.use': 12, 'reaction.blocks': 8, 'spellPick.abilities': 6, 'spellPick.lists': 8, 'spells.classes': 8, 'spells.components': 3, 'spells.kinds': 4, 'step.advantageIf': 4,
  'step.cure': 14, 'step.forms': 40, 'step.types': 14, 'step.variants': 14, 'step.when': 4, 'trait.modifier': 8, 'trigger.from': 20, 'use.from': 20, 'weapons.properties': 9, 'weapons.range': 2, 'zone.on': 3,
});
const GRANTS_LEN = 30;
// The work one use of an entry may cause (see workOf): the most steps run, the creatures a table is taken to have, and the
// most attacks of one Multiattack. The SRD's own largest are printed in the build note of fix round 2. The steps ceiling is
// measured, not a multiple of the SRD's: the heaviest accepted cast and monster turn at a table of 30 stay well under a second
// and a megabyte (a test in homebrew-values.test.js); it lets an area spell hold 20 steps of work.
// `dice`: the most dice faces one use may roll (#408; diceOf counts them as the engine does). The engine refuses an action over
// 1,200 (effects.js, WORK.dice); this is three quarters of that, so a use the gate admits has a quarter to spare. This file cannot
// import effects.js (it imports this one), so a test (homebrew-dice.test.js) compares the two sets of ceilings and fails if the
// gate's passes the engine's: steps 600 of 1,000, dice 900 of 1,200, attacks 14 of 20, events measured.
export const HOMEBREW_WORK = Object.freeze({ steps: 600, creatures: 30, attacks: 14, dice: 900 });
const NAME_ALIAS = { modifiers: 'modifier', traits: 'trait', actions: 'action', triggers: 'trigger' };
const nameOf = (k) => (STEP_LISTS.includes(k) ? 'step' : /^\d+$/.test(k) ? '#' : NAME_ALIAS[k] ?? k);
const rangeOf = (owner, key, inGrants) => HOMEBREW_RANGES[`${owner}.${key}`] ?? HOMEBREW_RANGES[`${owner}.*`] ?? (inGrants ? GRANTS_ANY : undefined);
// The numbers of an entry with the name that finds their range: [context, value, path, inGrants].
export function numbersOf(kind, entry) {
  const out = [], stack = [];
  for (const k of Object.keys(entry)) stack.push([entry[k], kind, k, k, false]);
  while (stack.length) {
    const [v, owner, key, path, g] = stack.pop();
    if (typeof v === 'number') out.push([`${owner}.${nameOf(key)}`, v, path, g, owner, nameOf(key)]);
    else if (Array.isArray(v)) v.forEach((x, i) => stack.push([x, owner, key, `${path}[${i}]`, g]));
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) stack.push([v[k], nameOf(key), k, `${path}.${k}`, g || key === 'grants']);
  }
  return out;
}
// The lists of an entry with the name that finds their ceiling: [context, length, path, inGrants, owner, key].
export function arraysOf(kind, entry) {
  const out = [], stack = [];
  for (const k of Object.keys(entry)) stack.push([entry[k], kind, k, k, false]);
  while (stack.length) {
    const [v, owner, key, path, g] = stack.pop();
    if (Array.isArray(v)) { out.push([`${owner}.${nameOf(key)}`, v.length, path, g, owner, nameOf(key)]); v.forEach((x, i) => stack.push([x, owner, key, `${path}[${i}]`, g])); }
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) stack.push([v[k], nameOf(key), k, `${path}.${k}`, g || key === 'grants']);
  }
  return out;
}
export const lengthOf = (owner, key, inGrants) => HOMEBREW_LENGTHS[`${owner}.${key}`] ?? HOMEBREW_LENGTHS[`*.${key}`] ?? (inGrants ? GRANTS_LEN : undefined);
// ----- the work of one use -----
// The worst-case number of steps one use of an entry can run: every branch taken, a damage step `times` over, a spell's or an
// action's steps once for each creature it can reach (its chosen creatures or count, or the table's creatures for an area), a
// monster's worst single action or worst Multiattack (entries times their counts, an alternative taking the dearest).
const isN = (x) => typeof x === 'number' && Number.isFinite(x);
function listWork(list, more = 0) {
  let n = 0;
  if (!Array.isArray(list)) return 0;
  for (const st of list) {
    if (!st || typeof st !== 'object') continue;
    let kids = 0;
    for (const b of BRANCHES) kids += listWork(st[b], more);
    n += (1 + kids) * ('damage' in st ? Math.max(1, (isN(st.times) ? st.times : 1) + more) : 1);
  }
  return n;
}
function targetsOf(t) {
  if (!t || typeof t !== 'object' || t.self) return 1;
  if (t.area) return isN(t.area.choose) ? t.area.choose : HOMEBREW_WORK.creatures;
  return isN(t.creature?.count) ? t.creature.count : 1;
}
const actionWork = (a) => (a && typeof a === 'object' && !a.multiattack ? targetsOf(a.target) * listWork(a.effects) : 0);
const attackEntries = (m) => (Array.isArray(m) ? [m] : m && Array.isArray(m.or) ? m.or.filter(Array.isArray) : []);
// What a monster's Multiattack makes: [attacks, steps] of its dearest alternative.
function multiWork(ma, byId) {
  let attacks = 0, steps = 0;
  for (const list of attackEntries(ma)) {
    let a = 0, w = 0;
    for (const en of list) {
      if (!en || typeof en !== 'object') continue;
      const times = isN(en.times) ? Math.max(1, en.times) : 1;
      const names = Array.isArray(en.action) ? en.action : [en.action];
      a += times; w += times * Math.max(1, ...names.map((id) => (typeof id === 'string' && byId.has(id) ? actionWork(byId.get(id)) : 1)));
    }
    attacks = Math.max(attacks, a); steps = Math.max(steps, w);
  }
  return [attacks, steps];
}
// { work, attacks, what } for an entry of any kind (0 where it runs no steps).
export function workOf(kind, e) {
  let work = 0, attacks = 0, what = '', dice = 0, diceWhat = '';
  const take = (n, w) => { if (n > work) { work = n; what = w; } };
  const takeDice = (n, w) => { if (n > dice) { dice = n; diceWhat = w; } };
  if (kind === 'spells') {
    // Estimated at the top: a 9th-level slot (each level above the spell's adds `higher.slot.targets` creatures and
    // `higher.slot.times` repeats) and, for a cantrip, character level 20 (`higher.targets` by level).
    const up = e.level >= 1 && e.level < 9 && e.higher?.slot ? 9 - e.level : 0, hs = e.higher?.slot ?? {};
    const levelTargets = Math.max(0, ...Object.values(e.higher?.targets && typeof e.higher.targets === 'object' ? e.higher.targets : {}).filter(isN));
    let targets = targetsOf(e.target);
    if (!(e.target?.area && !isN(e.target.area.choose))) targets = Math.max(targets + up * (isN(hs.targets) ? hs.targets : 0), levelTargets);
    take(targets * listWork(e.effects, up * (isN(hs.times) ? hs.times : 0)), 'cast at its highest level');
    const steps = scaledSteps(e, up);
    takeDice(diceFor(steps, targets, !!e.target?.area || (targets > 1 && !e.target?.creature?.repeat)), 'cast at its highest level');
    // A zone goes off for one creature at a time, rolling for each: a creature that moves into it (as many as the table has
    // when the zone itself moves onto them), or two ticks in one end of turn (the end of one creature's, the start of the next).
    if (e.zone && typeof e.zone === 'object') takeDice((Array.isArray(e.zone.on) && e.zone.on.includes('enter') ? HOMEBREW_WORK.creatures : 2) * diceFor(steps, 1, false), 'zone, going off');
  }
  else if (kind === 'monsters' && Array.isArray(e.actions)) {
    const byId = new Map(e.actions.filter((a) => a && typeof a.id === 'string').map((a) => [a.id, a]));
    for (const a of e.actions) {
      if (!a || typeof a !== 'object') continue;
      take(actionWork(a), `action "${a.id}"`);
      // Each attack of a Multiattack is an action of its own to the engine, so it is the dearest attack that counts.
      if (!a.multiattack) takeDice(diceFor(a.effects, targetsOf(a.target), !!a.target?.area), `action "${a.id}"`);
      if (a.multiattack) { const [n, w] = multiWork(a.multiattack, byId); attacks = Math.max(attacks, n); take(w, `Multiattack "${a.id}"`); }
    }
  } else if (kind === 'objects') for (const u of [...(Array.isArray(e.use) ? e.use : []), ...(Array.isArray(e.triggers) ? e.triggers : [])]) {
    take((u?.area ? HOMEBREW_WORK.creatures : 1) * listWork(u?.effects), 'use');
    takeDice(diceFor(u?.effects, u?.area ? HOMEBREW_WORK.creatures : 1, !!u?.area), 'use');
  }
  else if (kind === 'items') for (const u of Array.isArray(e.activate) ? e.activate : []) { take(listWork(u?.effects), 'use'); takeDice(diceFor(u?.effects, 1, false), 'use'); }
  // A subclass: each action of each feature and option (and each mode of one), as a creature's action is.
  else if (kind === 'subclasses') for (const f of Array.isArray(e.features) ? e.features : []) for (const g of [f?.grants, ...(Array.isArray(f?.options) ? f.options.map((o) => o?.grants) : [])]) {
    const a = g && typeof g === 'object' ? g.action : null;
    if (!a || typeof a !== 'object') continue;
    // A slot that pays for it (addition E): estimated at a 9th-level slot, as a spell's is, so a use the gate admits at the lowest level cannot pass the ceiling at the highest.
    const slot = a.cost && typeof a.cost === 'object' && isInt(a.cost.slot) && a.cost.slot >= 1 && a.cost.slot < 9 && a.cost.higher && typeof a.cost.higher === 'object' ? { up: 9 - a.cost.slot, hs: a.cost.higher } : null;
    const grownEffects = slot && Array.isArray(a.effects) ? scaledSteps({ effects: a.effects, higher: { slot: slot.hs } }, slot.up) : a.effects;
    for (const steps of [a.effects, ...(Array.isArray(a.modes) ? a.modes.map((m) => m?.effects) : [])]) {
      const grown = slot && steps === a.effects ? grownEffects : steps;
      // A second creature near the first (addition G) takes the damage steps the action begins with, on top of the first target's work (the roll is shared: no dice more).
      const mode = Array.isArray(a.modes) ? a.modes.find((m) => m?.effects === steps) : null, near = mode?.target?.near ?? a.target?.near;
      const second = near !== undefined ? listWork(grown?.slice?.(0, nearRun(grown)), slot && steps === a.effects && isN(slot.hs.times) ? slot.up * slot.hs.times : 0) : 0;
      take(targetsOf(a.target) * listWork(grown, slot && steps === a.effects && isN(slot.hs.times) ? slot.up * slot.hs.times : 0) + second, `action of the feature "${shortId(f)}"`);
      takeDice(diceFor(grown, targetsOf(a.target), !!a.target?.area), `action of the feature "${shortId(f)}"`);
    }
    // A zone goes off for one creature at a time, as a spell's does (above): one that moves into it, or two ticks in one end of turn.
    if (a.zone && typeof a.zone === 'object' && Array.isArray(a.effects)) takeDice((Array.isArray(a.zone.on) && a.zone.on.includes('enter') ? HOMEBREW_WORK.creatures : 2) * diceFor(grownEffects, 1, false), `zone of the feature "${shortId(f)}", going off`);
  }
  return { work, attacks, what, dice, diceWhat };
}

// ----- the dice of one use (#408) -----
// The engine counts the dice faces an action rolls for damage and healing (effects.js, `spend('dice', ...)`: the leading count of
// each roll, a damage step's once for each repeat, an attack's doubled for a critical hit) and refuses an action over a ceiling.
// So the estimate counts the same: `own` is dice outside an attack roll, which an area (or several creatures at once) rolls once
// and shares; `each` is dice under an attack roll (doubled, as a critical hit does) and healing, which are rolled for each creature.
const diceCount = (x) => { const m = typeof x === 'string' ? /^\s*(\d+)d/.exec(x) : null; return m ? +m[1] : 0; };
function listDice(list, atk = false) {
  let own = 0, each = 0;
  if (!Array.isArray(list)) return { own, each };
  for (const st of list) {
    if (!st || typeof st !== 'object') continue;
    if ('damage' in st) { const d = diceCount(st.damage) * Math.max(1, isN(st.times) ? Math.ceil(st.times) : 1); if (atk) each += 2 * d; else own += d; }
    for (const k of ['heal', 'tempHp']) if (k in st) each += diceCount(st[k]);
    const inner = atk || 'attack' in st;
    for (const b of BRANCHES) { const r = listDice(st[b], inner); own += r.own; each += r.each; }
  }
  return { own, each };
}
// A spell's steps as cast at a 9th-level slot by a level 20 caster: the first damage, heal and temporary Hit Points step grow by
// `higher.slot` for each level above the spell's, the first damage step repeats more, and a cantrip's first damage step is
// its dice for character level 20 (effects.js, scaleSteps, which finds the first step of a kind the same way).
function scaledSteps(e, up) {
  const steps = structuredClone(Array.isArray(e.effects) ? e.effects : []);
  const first = (list, key) => {
    for (const st of list) {
      if (!st || typeof st !== 'object') continue;
      if (key in st) return st;
      for (const b of BRANCHES) if (Array.isArray(st[b])) { const f = first(st[b], key); if (f) return f; }
    }
    return null;
  };
  const byLevel = e.higher?.level && typeof e.higher.level === 'object' ? e.higher.level : null;
  if (byLevel) {
    const reached = Object.keys(byLevel).map(Number).filter((l) => l <= 20).sort((x, y) => y - x)[0], dmg = first(steps, 'damage');
    if (reached !== undefined && dmg && typeof byLevel[reached] === 'string') dmg.damage = byLevel[reached];
  }
  const hs = e.higher?.slot && typeof e.higher.slot === 'object' ? e.higher.slot : null;
  if (up > 0 && hs) {
    for (const k of ['damage', 'heal', 'tempHp']) { const st = typeof hs[k] === 'string' ? first(steps, k) : null; if (st) st[k] = `${diceCount(st[k]) + diceCount(hs[k]) * up}d6`; }
    const st = isN(hs.times) ? first(steps, 'damage') : null;
    if (st) st.times = (isN(st.times) ? st.times : 1) + hs.times * up;
  }
  return steps;
}
// The dice one use rolls on `n` creatures: shared damage once, the rest for each creature; or all of it for each.
const diceFor = (steps, n, shared) => { const { own, each } = listDice(steps); return shared ? own + n * each : n * (own + each); };
const DICE_STR = /^([+-]?)(?:(\d+)d(\d+))?(?:([+-]\d+))?$/;
// A dice string's count, sides and flat part within the limits, or a sentence.
function diceProblem(s) {
  const m = DICE_STR.exec(s);
  if (!m || !s.length || !/d|^[+-]\d+$/.test(s)) return null;
  const D = HOMEBREW_DICE;
  if (m[2] !== undefined && (+m[2] < 1 || +m[2] > D.count)) return `"${s}" rolls ${thousands(+m[2])} dice; the most is ${D.count}`;
  if (m[3] !== undefined && (+m[3] < 2 || +m[3] > D.sides)) return `"${s}" has dice of ${thousands(+m[3])} sides; they have 2 to ${D.sides}`;
  const flat = m[4] !== undefined ? Math.abs(+m[4]) : m[2] === undefined ? Math.abs(+s) : 0;
  if (flat > D.flat) return `"${s}" adds ${thousands(flat)}; the most is ${D.flat}`;
  return null;
}
function lintNumbers(kind, e, say) {
  for (const [ctx, n, path, g, owner, key] of arraysOf(kind, e)) {
    const most = lengthOf(owner, key, g);
    if (most === undefined) say(`${path}: a list is not allowed here (no length is set for "${ctx}")`);
    else if (n > most) say(`${path}: a list of ${n}; the most is ${most}`);
  }
  if (kind === 'monsters' && Array.isArray(e.traits) && Array.isArray(e.actions)) {
    const reactions = e.traits.filter((t) => t?.reaction).length + e.actions.filter((a) => a?.time === 'reaction').length;
    if (reactions > HOMEBREW_LENGTHS['monsters.reaction']) say(`it has ${reactions} reactions; the most is ${HOMEBREW_LENGTHS['monsters.reaction']}`);
  }
  const { work, attacks, what, dice, diceWhat } = workOf(kind, e);
  if (attacks > HOMEBREW_WORK.attacks) say(`its Multiattack makes ${thousands(attacks)} attacks; the most is ${HOMEBREW_WORK.attacks}`);
  else if (work > HOMEBREW_WORK.steps) say(`one use (its ${what}) can run ${thousands(work)} steps, counting every branch, every repeat and every creature it reaches (up to ${HOMEBREW_WORK.creatures} at a table); the most is ${HOMEBREW_WORK.steps}`);
  else if (dice > HOMEBREW_WORK.dice) say(`one use (its ${diceWhat}) can roll ${thousands(dice)} dice, counting every repeat, the double dice of a critical hit and every creature that rolls its own (up to ${HOMEBREW_WORK.creatures} at a table); the most is ${thousands(HOMEBREW_WORK.dice)}`);
  for (const [ctx, v, path, g, owner, key] of numbersOf(kind, e)) {
    const r = (kind === 'subclasses' && (FORM_CR_PATH.test(path) ? FORM_CR : SUBCLASS_RANGES[`${owner}.${key}`])) || rangeOf(owner, key, g);
    if (!r) { say(`${path}: a number is not allowed here (no range is set for "${ctx}")`); continue; }
    const [lo, hi, frac] = r;
    if (!(frac ? Number.isInteger(v * frac) : Number.isInteger(v)) || v < lo || v > hi) say(`${path}: ${v} is not allowed; ${frac ? 'a number' : 'a whole number'} from ${thousands(lo)} to ${thousands(hi)}`);
  }
  const stack = Object.values(e);
  while (stack.length) {
    const v = stack.pop();
    if (typeof v === 'string') {
      const d = diceProblem(v), du = /^([1-9]\d*) (round|minute|hour|day)s?$/.exec(v), c = /^([\d,]{1,12}) (CP|SP|EP|GP|PP)$/.exec(v);
      if (d) say(`dice ${d}`);
      if (du && +du[1] > HOMEBREW_DURATIONS[du[2]]) say(`a duration of ${thousands(+du[1])} ${du[2]}s is too long; the most is ${HOMEBREW_DURATIONS[du[2]]}`);
      if (c) { const gp = +c[1].replace(/,/g, '') * COIN_GP[c[2]]; if (gp > HOMEBREW_COST) say(`a price of ${c[1]} ${c[2]} is ${thousands(Math.round(gp))} gold pieces; the most is ${thousands(HOMEBREW_COST)} gold pieces`); }
    } else if (Array.isArray(v)) for (const x of v) stack.push(x);
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) stack.push(v[k]);
  }
}

// The type of every field, by the shape that holds it (the shapes of SHAPES; a step's is `step.<kind>`):
//   b true or false, t true, s text, id a kebab-case name of at most 60 letters, id[] a list of them, i a number (its range is in HOMEBREW_RANGES), n a number (a fraction may be), d dice, o an object,
//   a a list, s[] a list of text, i[] a list of numbers, '|' either; '*' is the type of every key of a map; '?' is checked by the
//   kind's own linter alone (a feature's grants have many shapes).
const WORDS = { id: 'a kebab-case name', 'id[]': 'a list of kebab-case names', b: 'true or false', t: 'true', s: 'text', i: 'a whole number', n: 'a number', d: 'dice like 2d6+3', o: 'an object', a: 'a list', 's[]': 'a list of text', 'i[]': 'a list of numbers', 'o[]': 'a list of objects' };
const isId = (x) => typeof x === 'string' && x.length <= 60 && ID.test(x);
const fits = (spec, v) => spec.split('|').some((t) => (t === 'id' ? isId(v) : t === 'id[]' ? Array.isArray(v) && v.every(isId) : t === 'b' ? typeof v === 'boolean' : t === 't' ? v === true : t === 's' ? typeof v === 'string' : t === 'i' || t === 'n' ? typeof v === 'number'
  : t === 'd' ? typeof v === 'string' && (DICE.test(v) || /^\d{1,3}$/.test(v)) && v.length > 0 : t === 'o' ? !!v && typeof v === 'object' && !Array.isArray(v) : t === 'a' ? Array.isArray(v)
  : t === 's[]' ? Array.isArray(v) && v.every((x) => typeof x === 'string') : t === 'i[]' ? Array.isArray(v) && v.every((x) => typeof x === 'number') : t === '?'));
const describe = (spec) => spec.split('|').map((t) => WORDS[t] ?? t).join(' or ');
export const HOMEBREW_TYPES = Object.freeze({
  spells: { id: 's', name: 's', source: 's', level: 'i', school: 's', classes: 'id[]', time: 's', range: 'i|s', components: 'id[]', duration: 's', concentration: 'b', ritual: 'b', target: 'o', effects: 'a', higher: 'o', tier: 's', checked: 'b', text: 's', kinds: 's[]', choice: 'o', costly: 'b', terrain: 'o', zone: 'o', reaction: 'o' },
  monsters: { id: 's', name: 's', source: 's', size: 's', type: 's', cr: 'n', xp: 'i', pb: 'i', ac: 'i', hp: 'i', speed: 'o', senses: 'o', abilities: 'o', initiative: 'i', languages: 's[]', skills: 'o', resist: 's[]', vulnerable: 's[]', immune: 's[]', conditionImmune: 's[]', saves: 'o', hover: '?', mount: 's', traits: 'a', actions: 'a', tier: 's', checked: 'b', text: 's' },
  items: { id: 's', name: 's', category: 's', rarity: 's', attune: 'b|o', wear: 's', base: 'o', bonus: 'i', damageType: 's', properties: 's[]', trained: 'b', mithral: 'b', grants: 'o', variant: 's', charges: 'o', activate: 'a', tier: 's', source: 's', checked: 'b', text: 's' },
  feats: { id: 's', name: 's', category: 's', prerequisite: 'o', repeatable: 's|b', tier: 's', source: 's', checked: 'b', text: 's', increase: 'o', proficiencies: 'o', spellPick: 'o', grants: 'o' },
  objects: { id: 's', name: 's', kind: 's', source: 's', tier: 's', checked: 'b', text: 's', states: 'o', initial: 's', use: 'a', triggers: 'a', find: 'o', dc: 'o', connects: 'b' },
  weapons: { id: 's', name: 's', category: 's', kind: 's', damage: 'd', type: 's', properties: 's[]', mastery: 's', range: 'i[]', versatile: 'd', ammo: 's', twoHandedUnlessMounted: '?', weight: 'n', cost: 's|i', source: 's', checked: 'b' },
  armour: { id: 's', name: 's', category: 's', ac: 'i', dex: 'i|s', stealth: 's', strength: 'i', weight: 'n', cost: 's|i', source: 's', checked: 'b' },
  subclasses: { id: 's', name: 's', class: 's', source: 's', checked: 'b', text: 's', spells: 'o', features: 'a', dmNotes: 's' },
  feature: { id: 's', name: 's', level: 'i', tier: 's', checked: 'b', text: 's', uses: 'o', grants: 'o', options: 'a', pick: 'i|o', dmNotes: 's' },
  option: { id: 's', name: 's', text: 's', tier: 's', grants: 'o', requires: 'o', uses: 'o', feat: 's' },
  featureUses: { max: 'i|o', recharge: 's|o', short: 'i' },
  requires: { level: 'i', option: 's', spell: 's' },
  spellMap: { '*': 's[]' },
  target: { self: 'b', creature: 'o', area: 'o', near: 'i' },
  area: { shape: 's', size: 'i', range: 'i', width: 'i', height: 'i', exceptCaster: 'b', types: 's[]', choose: 'i', count: 'i' },
  creature: { count: 'i', repeat: 'b', within: 'i', reach: 'i', range: 'i[]' },
  modifier: { on: 's', op: 's', value: 'i|s|o', types: 's[]', scope: 'o', against: 's', uses: 'i', once: 's', onFail: 'b', cost: 's', except: 's', stack: 'b', spell: 's', when: 's[]' },
  value: { perLevel: 'i', column: 's', mod: 's', min: 'i', die: 's', byLevel: 'o', prof: 'i' },
  scope: { skill: 's', ability: 's', condition: 's', tool: 's' },
  ends: { on: 's', of: 's', by: 's', save: 's', at: 's', dc: 'i', orDamaged: 'b' },
  higher: { level: 'o', targets: 'o', slot: 'o' },
  slot: { damage: 'd', heal: 'd', tempHp: 'd', times: 'i', targets: 'i', value: 'i' },
  choice: { of: 's', from: 's[]' },
  zone: { on: 's[]', once: 's', atCast: 'b', spare: 'b' },
  terrain: { difficult: 'b', obscured: 's', lasts: 's' },
  reaction: { on: 's', blocks: 's[]', ac: 'i', attack: 's', manual: 's' },
  bond: { kind: 's', turn: 's', orders: 's', range: 'i', at0: 's', ends: 's[]', leash: 'i', noAttack: 'b', mount: 's' },
  count: { slot: 'i', base: 'i', above: 'i' },
  over: { speed: 'o' },
  forms: { type: 's', cr: 'n' },
  trait: { id: 'id', name: 's', text: 's', modifiers: 'a', reaction: 'o', dragFree: 'b' },
  action: { id: 'id', name: 's', text: 's', time: 's', target: 'o', effects: 'a', uses: 'o', recharge: 'i[]', multiattack: 'a|o' },
  uses: { per: 's', n: 'i' },
  attackEntry: { action: 's|s[]', times: 'i' },
  orList: { or: 'a' },
  abilities: { str: 'i', dex: 'i', con: 'i', int: 'i', wis: 'i', cha: 'i' },
  state: { name: 's', blocks: 's[]', hidden: 'b', light: 'o' },
  light: { bright: 'i', dim: 'i' },
  objectDc: { save: 'i', find: 'i' },
  find: { to: 's' },
  trigger: { on: 's', from: 's[]', to: 's', feet: 'i', who: 's', area: 'i', effects: 'a' },
  use: { id: 'id', name: 's', from: 's[]', to: 's', time: 's', key: 'b', check: 'o', effects: 'a' },
  check: { ability: 's', skill: 's', tool: 'id', dc: 'i' },
  activate: { name: 's', time: 's', cost: 'i', consumed: 'b', spell: 'id', level: 'i', upTo: 'i', self: 'b', dc: 'i', effects: 'a' },
  attune: { by: 's[]', spellcaster: 'b' },
  base: { weapon: 's|s[]', armour: 's|s[]' },
  charges: { max: 'i', regain: 'd' },
  prerequisite: { level: 'i', abilities: 'o', feature: 's' },
  anyAbility: { any: 's[]', min: 'i' },
  increase: { from: 's[]', points: 'i', max: 'i' },
  proficiencies: { n: 'i' },
  spellPick: { lists: 's[]', abilities: 's[]', cantrips: 'i', level1: 'i' },
  freeCast: { list: 'id', maxLevel: 'i', spells: 'id[]', atWill: 'b', self: 'b', dark: 'b', sureSave: 'b', maxTemp: 'b', time: 's', forms: 'id[]', types: 's[]', ends: 's[]', cost: 'o', components: 's' },
  freeCastCost: { slot: 't', uses: 'id' },
  triggers: { attackAction: 'o', opportunityHit: 'o' }, attackTrigger: { modifiers: 'a' }, hitTrigger: { move: 's' },
  formOf: { of: 'id', maxCr: 'n|o', types: 's[]', typesMaxCr: 'n|o', forms: 'id[]', tempHp: 'i|o', cost: 'o' },
  formCost: { resource: 'id', n: 'i' },
  grants: { modifiers: 'a', aura: 'o', abilityBonus: 'o', setAbility: 'o', senses: 'o', senseRange: 'o', speeds: 'o|s[]', resist: 's[]', conditionImmune: 's[]', armouredAc: 'i', bareAc: 'i', rangedAttack: 'i', spells: 's[]', bonusActs: 's[]', saves: 's|s[]' },
  aura: { range: 'i|o', modifiers: 'a', immune: 's[]' },
  speedMap: { '*': 'i' }, senseMap: { '*': 'i' }, skillMap: { '*': 'i' }, saveMap: { '*': 'i' }, abilityMap: { '*': 'i' }, levelMap: { '*': 'i|d' },
  states: { '*': 'o' }, 'trait[]': { '*': 'o' }, 'action[]': { '*': 'o' }, 'modifier[]': { '*': 'o' }, 'trigger[]': { '*': 'o' }, 'use[]': { '*': 'o' }, 'activate[]': { '*': 'o' }, 'attackEntry[]': { '*': 'o' }, 'feature[]': { '*': 'o' }, 'option[]': { '*': 'o' },
  'step.attack': { attack: 's', kind: 's', bonus: 'i', advantageIf: 's[]', onHit: 'a', onMiss: 'a' },
  'step.save': { save: 's', dc: 'i', half: 'b', advantageIf: 's[]', onFail: 'a', onSuccess: 'a' },
  'step.damage': { damage: 'd', type: 's', times: 'i', onZero: 'a', onKill: 'a' },
  'step.heal': { heal: 'd', addMod: 'b', atLeast: 'i' }, 'step.tempHp': { tempHp: 'd', addMod: 'b', atLeast: 'i' },
  'step.condition': { condition: 's', ends: 'o', escape: 'i', largest: 's', holds: 'i', escapeDis: 'b', whileHeld: 'b' }, 'step.modifier': { modifier: 'o', ends: 'o', to: 's' },
  'step.move': { move: 'i', dir: 's', largest: 's' }, 'step.fall': { fall: 'i|s' }, 'step.set': { set: 's', of: 's' }, 'step.reveal': { reveal: 's' }, 'step.resource': { resource: 's' },
  'step.counter': { counter: 's' }, 'step.teleport': { teleport: 'i', see: 'b', blocked: 'a' }, 'step.cure': { cure: 's[]' }, 'step.kill': { kill: 'b' }, 'step.remains': { remains: 's' },
  'step[]': { '*': 'o' },
  'step.endConcentration': { endConcentration: 'b' }, 'step.manual': { manual: 's' },
  'step.summon': { summon: 's', forms: 'o|s[]', types: 's[]', variants: 's[]', count: 'i|o', reassert: 'o', on: 's', over: 'o', one: 's', bond: 'o' },
});
// The check a key gets while the key lists are walked: its type, in words, or null.
function typeProblem(shape, key, value) {
  const T = HOMEBREW_TYPES[shape];
  const spec = T?.[key] ?? T?.['*'] ?? (shape.startsWith('step.') && key === 'when' ? 's[]' : undefined);
  if (!spec || spec === '?' || fits(spec, value)) return null;
  return `must be ${describe(spec)}`;
}

const PACK_DOC_KEYS = ['format', 'v', 'pack', ...HOMEBREW_ENTRY_KINDS];
// The sentence for a key of a pack document that is not a kind of homebrew (the registry says the same; `classes` has its own).
export const packKeyProblem = (k) => (k === 'classes'
  ? 'pack: "classes" cannot be homebrew: a homebrew class is not possible yet; a subclass of an SRD class is (`subclasses`)'
  : `pack: "${k}" cannot be homebrew (the kinds are ${HOMEBREW_ENTRY_KINDS.join(', ')})`);
const PACK_HEAD_KEYS = ['id', 'name', 'version', 'license', 'attribution'];
// What strict mode needs for a pack: the document's own shape checked, and the options for each entry.
function strictOptions(doc, opts, problems) {
  const homebrew = !!opts.strict, id = doc?.pack?.id;
  if (homebrew) {
    for (const k of Object.keys(doc)) if (!PACK_DOC_KEYS.includes(k)) problems.push(packKeyProblem(k));
    for (const k of HOMEBREW_ENTRY_KINDS) if (doc[k] !== undefined && !Array.isArray(doc[k])) problems.push(`${k}: must be a list`);
    if (doc.format !== 'hextable-pack' || doc.v !== 1) problems.push('pack: format must be "hextable-pack", v 1');
    const head = doc.pack;
    if (head && typeof head === 'object') {
      for (const k of Object.keys(head)) if (!PACK_HEAD_KEYS.includes(k)) problems.push(`pack: "${k}" is not something a pack has (it has ${PACK_HEAD_KEYS.join(', ')})`);
      if (head.version !== undefined && !(isInt(head.version) && head.version >= 1)) problems.push('pack: version is a whole number from 1');
    }
    for (const k of HOMEBREW_ENTRY_KINDS) if (Array.isArray(doc[k])) doc[k].forEach((x) => { if (!x || typeof x !== 'object' || Array.isArray(x)) problems.push(`${k}: an entry is not an object`); });
    if (typeof id === 'string' && (id === SRD_PACK_ID || (opts.srd ?? SRD_REF)?.pack === id)) problems.push(`pack: "${id}" is the SRD pack's id`);
  }
  return { homebrew, pack: id, srd: opts.srd };
}
// The SRD pack id a homebrew pack may not take, and the SRD's entries (their ids and names): `useSrdReference` is called by
// registry.js with the content lookups, so a caller of lintPack or lintEntry passes nothing and still gets the rule.
const SRD_PACK_ID = 'srd52';
let SRD_REF = null;
export function useSrdReference(ref) { SRD_REF = ref; }
const CONFUSABLE = { '\u0430': 'a', '\u0435': 'e', '\u043e': 'o', '\u0440': 'p', '\u0441': 'c', '\u0443': 'y', '\u0445': 'x', '\u0456': 'i', '\u0458': 'j', '\u0455': 's', '\u04bb': 'h', '\u0501': 'd',
  '\u0391': 'a', '\u0392': 'b', '\u0395': 'e', '\u0397': 'h', '\u0399': 'i', '\u039a': 'k', '\u039c': 'm', '\u039d': 'n', '\u039f': 'o', '\u03a1': 'p', '\u03a4': 't', '\u03a7': 'x', '\u03b9': 'i', '\u03bf': 'o', '\u03bd': 'v', '\u0131': 'i' };
// A name as it reads: NFKD, marks removed, case folded, look-alike letters made Latin, and only letters and digits kept ("Fire-ball", "Fire_ball" and "F\u00edreball" are "fireball").
export const nameKey = (s) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\u00df/g, 'ss').replace(/[\u0391-\u03bf\u0430-\u0501\u0131]/g, (c) => CONFUSABLE[c] ?? c).replace(/[^\p{L}\p{Nd}]/gu, '');
const SRD_POOLS = new WeakMap();
function srdPools(classes) {
  let pools = SRD_POOLS.get(classes);
  if (!pools) {
    pools = new Set();
    for (const c of Object.values(classes)) for (const f of [...(c.features ?? []), ...(c.subclass?.features ?? [])]) { if (f.uses) pools.add(f.id); for (const o of f.options ?? []) if (o.uses) pools.add(o.id); }
    SRD_POOLS.set(classes, pools);
  }
  return pools;
}
// What homebrew subclasses are held against: the SRD's own, read from its classes (and from `ref.subclasses`, but never a homebrew id in it).
function subclassReference(ref) {
  const out = srdSubclassesOf(classTableOf(ref));
  for (const [id, v] of Object.entries(ref?.subclasses ?? {})) if (!id.startsWith('hb-')) out[id] = v;
  return out;
}
const SRD_NAMES = new WeakMap();
function srdNames(table) {
  let names = SRD_NAMES.get(table);
  if (!names) { names = new Set(); for (const id of Object.keys(table)) if (typeof table[id]?.name === 'string') names.add(nameKey(table[id].name)); SRD_NAMES.set(table, names); }
  return names;
}
// What strict mode checks of an entry's shape: the key lists, the type of every value and, for homebrew, every number and
// every dice string. When it says anything, the kind's own linter is not run: it reads what the types now vouch for.
function lintShape(kind, e, say, { homebrew }) {
  if (!HOMEBREW_ENTRY_KINDS.includes(kind)) { if (homebrew) say(`${kind} cannot be homebrew`); return 0; }
  let bad = 0;                                                   // wrong types and numbers: what the kind's linter must not be given
  lintKeys(kind, e, say, (shape, key, value, path) => {
    // Extra familiar forms are not for homebrew yet (#414): a feature that adds forms could make any SRD monster a familiar.
    if (homebrew && shape === 'freeCast' && key === 'forms') { bad++; say('A homebrew feature cannot add familiar forms yet.'); return; }
    // Nor what changes a familiar or lets it attack (#464): a feat could otherwise arm any caster's familiar.
    if (homebrew && shape === 'grants' && (key === 'invest' || key === 'forgoAttack')) { bad++; say('A homebrew feature cannot change a familiar or let it attack yet.'); return; }
    // Nor may a feat or an item change what a class feature's form is (#516): `formOf` is for the features of a subclass.
    if (homebrew && shape === 'grants' && key === 'formOf' && kind !== 'subclasses') { bad++; say('Only a subclass\'s feature can change the form of a class feature (formOf).'); return; }
    // Nor may a feat or an item state a trigger on what its holder does (#534): `triggers` is for the features of a subclass.
    if (homebrew && shape === 'grants' && key === 'triggers' && kind !== 'subclasses') { bad++; say('Only a subclass\'s feature can state a trigger on what its holder does (triggers).'); return; }
    // The spells of a subclass are by class level: a whole number from 3 to 20.
    if (shape === 'spellMap' && !/^(?:[3-9]|1\d|20)$/.test(String(key))) { bad++; say(`spells: "${String(key).slice(0, 20)}" is not a class level from ${SUBCLASS_FIRST} to ${LEVELS}`); return; }
    // A subclass's damage, healing or Temporary Hit Points may be an amount of its class (`{ column: 'bardic-die' }`, `{ mod, min, die }`): the feature linter checks it
    // against the class's table. Nothing else may carry one: the engine reads dice there.
    if (kind === 'subclasses' && (shape === 'step.damage' || shape === 'step.heal' || shape === 'step.tempHp') && key === shape.slice(5) && value && typeof value === 'object' && !Array.isArray(value)) return;
    // And a save step's DC may be an ability of the class (`dc: 'wis'`: 8 + Proficiency Bonus + its modifier), which the feature linter checks.
    if (kind === 'subclasses' && shape === 'step.save' && key === 'dc' && typeof value === 'string') return;
    // A heal or Temporary Hit Points step may add an ability's modifier (`addMod: 'wis'`), as a class feature's may.
    if (kind === 'subclasses' && (shape === 'step.heal' || shape === 'step.tempHp') && key === 'addMod' && typeof value === 'string') return;
    const t = typeProblem(shape, key, value); if (t) { bad++; say(`${path} ${t}`); }
  });
  if (homebrew && !bad) lintNumbers(kind, e, (m) => { bad++; say(m); });
  return bad;
}
// The homebrew rules for an entry that passed its kind's linter: id, source, `checked` and the name (Decision 1).
function lintRules(kind, e, say, { homebrew, pack, srd }) {
  if (!homebrew || !HOMEBREW_ENTRY_KINDS.includes(kind)) return;
  const ref = srd ?? SRD_REF;
  lintUnchecked(kind, e, say);
  // A freeCast's cost names a feature that has uses: one of the SRD's (a homebrew feat has none of its own).
  const cu = e.grants?.freeCast?.cost?.uses;
  if (kind === 'feats' && typeof cu === 'string' && !(ref?.classes && srdPools(ref.classes).has(cu))) say(`its freeCast cost names "${cu}", which is not a feature with uses in the SRD`);
  const prefix = `hb-${pack}-`;
  // The SRD's subclasses live inside its classes, so its reference for them is read from the classes (and never holds a homebrew id).
  const table = kind === 'subclasses' ? subclassReference(ref) : ref?.[kind];
  if (kind === 'subclasses') for (const f of Array.isArray(e.features) ? e.features : []) {
    const wrong = (x) => typeof x !== 'string' || !x.startsWith(prefix) || !ID.test(x.slice(prefix.length));
    if (f && typeof f === 'object' && f.checked !== false && typeof f.checked === 'boolean') say(`feature ${shortId(f)}: homebrew is not checked against any rulebook: \`checked\` must be false`);
    if (f && typeof f === 'object' && typeof f.id === 'string' && wrong(f.id)) say(`feature ${shortId(f)}: a feature id is "${prefix}" followed by a kebab-case name, so it can never be the id of a class feature (whose uses and choices it would share)`);
    for (const o of Array.isArray(f?.options) ? f.options : []) if (o && typeof o === 'object' && o.feat === undefined && wrong(o.id)) say(`feature ${shortId(f)}: option ${shortId(o)}: an option id is "${prefix}" followed by a kebab-case name`);
  }
  if (typeof e.id !== 'string' || !e.id.startsWith(prefix) || !ID.test(e.id.slice(prefix.length))) {
    const taken = typeof e.id === 'string' && table && Object.hasOwn(table, e.id);
    say(taken ? `"${e.id}" is the id of an SRD entry, and homebrew cannot replace it: give it an id that starts "${prefix}"`
      : `a homebrew id is "${prefix}" followed by a kebab-case name, like "${prefix}ember-burst"`);
  }
  if (e.checked !== false) say('homebrew is not checked against any rulebook: `checked` must be false');
  if (e.source !== `homebrew:${pack}`) say(`its source must be "homebrew:${pack}"`);
  if (typeof e.name === 'string' && table && srdNames(table).has(nameKey(e.name))) say(`the name "${e.name}" is the name of an SRD ${kind === 'armour' ? 'armour' : kind === 'subclasses' ? 'subclass' : kind.replace(/s$/, '')}: give it a name of its own, so nobody takes it for the SRD's`);
}

// One entry of one kind, by the linter of its kind (Decision 6). Strict by default: then the entry's budget first (and
// nothing else if it fails), the closed key lists, and the homebrew rules for `ctx.pack`, the homebrew pack's id.
//   ctx: { strict = true, pack, srd: { spells: { id: ... }, ... } (the SRD's ids, for a plainer sentence),
//          spells, weapons, armour (ids an item may name: Sets or lists), keys (the key lists alone, not strict),
//          limits }
// Only checks of one entry: what lintPack checks across a pack (duplicate ids, what a summon names) is not done here.
const ENTRY_LINTERS = {
  spells: lintSpell, monsters: (e, say) => lintMonster(e, say), summons: lintSummonBlock, conditions: lintCondition, objects: lintObject, classes: lintClass,
  weapons: lintWeapon, armour: lintArmour, feats: lintFeatDef, items: lintItem,
  subclasses: (e, say, c) => lintSubclass(e, say, { srd: c?.srd, feat: featLookup(c?.pack, c?.feats), weapon: weaponLookup(c?.srd ?? SRD_REF, c?.pack, c?.weapons), spell: spellLookup(c?.srd ?? SRD_REF, c?.pack, c?.spells), monster: monsterLookup(c?.srd ?? SRD_REF, c?.pack, undefined) }),
};
const asSet = (x) => (x === undefined || x === null ? undefined : x instanceof Set ? x : new Set(x));
export function lintEntry(kind, entry, ctx = {}) {
  // Never throws, whatever it is given (a wrong kind, no pack, an entry that is not the shape it must be): sentences.
  try { return lintEntryCore(kind, entry, ctx ?? {}); } catch { return [`${typeof kind === 'string' ? kind : 'entry'}/${shortId(entry)}: could not be checked, because something in it is not the shape an entry has`]; }
}
function lintEntryCore(kind, entry, ctx) {
  if (typeof kind !== 'string' || !Object.hasOwn(ENTRY_LINTERS, kind)) return [`lintEntry: unknown kind (one of ${Object.keys(ENTRY_LINTERS).join(', ')})`];
  const strict = ctx.strict ?? true;
  if (strict && !HOMEBREW_ENTRY_KINDS.includes(kind)) return [`${kind}/${shortId(entry)}: ${kind} cannot be homebrew`];
  if (strict && !(typeof ctx.pack === 'string' && ID.test(ctx.pack))) return [`${kind}/${shortId(entry)}: strict mode needs the homebrew pack's id (ctx.pack)`];
  if (strict) { const over = budgetEntry(kind, entry, ctx.limits); if (over.length) return over; }
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [`${kind}: an entry is not an object`];
  const problems = [], say = (m) => problems.push(`${kind}/${shortId(entry)}: ${m}`);
  const o = { homebrew: strict, pack: ctx.pack, srd: ctx.srd };
  if ((strict || ctx.keys) && lintShape(kind, entry, say, o) && strict) return problems;
  ENTRY_LINTERS[kind](entry, say, { feats: ctx.feats, weapons: asSet(ctx.weapons), armour: asSet(ctx.armour), spells: asSet(ctx.spells) ?? null, srd: ctx.srd, pack: ctx.pack });
  if (strict || ctx.keys) lintRules(kind, entry, say, o);
  return problems;
}
