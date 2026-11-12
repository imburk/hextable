// Modifiers: one way for anything to change a roll or a number.
//
// A condition, a monster's trait, a spell's lasting effect, and later an item or a feature all
// say what they change as data: { on: hook, op, value?, when?, types? }. This file gathers the
// ones that apply to a creature at a hook and adds them up. The engine asks once per roll and
// gets back the total and the reasons, which is what the log shows.
// Design: docs/specs/rules-expansion.md, decision 3.
import { CONTENT } from './content/index.js';
import * as H from './hex.js';
import { apart } from './space.js';
import { canSee } from './sight.js';

// Things a creature can be that are not SRD conditions but work the same way.
const STATUSES = {
  // SRD Dodge: attacks have Disadvantage if the dodger can see the attacker; lost while Incapacitated or at Speed 0.
  dodging: { name: 'Dodging', visible: true,
    modifiers: [{ on: 'attack.received', op: 'disadvantage', when: ['attacker.seen', 'self.canDodge'] }, { on: 'save.dex', op: 'advantage', when: ['self.canDodge'] }] },
  disengaged: { name: 'Disengaged', visible: false, modifiers: [] },
  stable: { name: 'Stable', visible: false, modifiers: [] },
};
export const conditionDef = (id) => CONTENT.conditions[id] ?? STATUSES[id] ?? null;
export const conditionName = (id) => conditionDef(id)?.name ?? id;
// "is Prone", but "has Exhaustion".
export const conditionPhrase = (id) => `${conditionDef(id)?.levels ? 'has' : 'is'} ${conditionName(id)}`;

// Every condition a creature has, including those implied by another (Unconscious includes Prone).
export function conditionsOf(e) {
  const out = new Map();
  const add = (id, inst) => {
    if (out.has(id)) return;
    out.set(id, inst);
    for (const sub of conditionDef(id)?.includes ?? []) add(sub, inst);
  };
  for (const [id, inst] of Object.entries(e.cond ?? {})) if (inst) add(id, inst === true ? {} : inst);
  return out;
}
export const has = (e, id) => conditionsOf(e).has(id);
export const incapacitated = (e) => [...conditionsOf(e).keys()].some((id) => conditionDef(id)?.incapacitated);
// The condition that stops a creature acting, by name, for messages.
export const incapacitatedBy = (e) => { for (const id of Object.keys(e.cond ?? {})) if (e.cond[id] && (conditionDef(id)?.incapacitated || conditionDef(id)?.includes?.includes('incapacitated'))) return conditionName(id); return null; };
// Players may see these on a creature that is not theirs.
export const visibleConditions = (e) => Object.keys(e.cond ?? {}).filter((id) => e.cond[id] && conditionDef(id)?.visible);

const upright = (e) => !e.dead && e.hp > 0;

// Can the engine tell whether this situation holds? true, false, or null for "cannot judge yet".
// `sit` is { attacker, target, ranged, mode } with whatever is known.
export function judge(tag, sit, s) {
  const { attacker: a, target: t } = sit;
  const near = a && t ? apart(s, a, t) <= 1 : null;
  switch (tag) {
    case 'within5': return near;
    case 'beyond5': return near === null ? null : !near;
    case 'ranged': return sit.ranged ?? null;
    case 'melee': return sit.ranged === undefined ? null : !sit.ranged;
    case 'attack.advantage': return sit.mode === undefined ? null : sit.mode === 'adv';
    case 'attack.disadvantage': return sit.mode === undefined ? null : sit.mode === 'dis';
    case 'target.prone': return t ? has(t, 'prone') : null;
    case 'target.unconscious': return t ? has(t, 'unconscious') : null;
    // Who can see whom (sight.js). A thing on the map that attacks (a trap) has no eyes: it never
    // sees its target, and whether its target sees it changes nothing.
    case 'target.unseen': return a && t ? (a.object ? true : canSee(s, a, t) === 'no') : null;
    case 'attacker.unseen': return a && t ? (a.object ? false : canSee(s, t, a) === 'no') : null;
    // Engine-only tags, for the statuses above: not in the content vocabulary.
    case 'attacker.seen': return a && t ? (a.object ? true : canSee(s, t, a) !== 'no') : null;
    case 'self.canDodge': return sit.self ? !incapacitated(sit.self) && speedOf(s, sit.self) > 0 : null;      // `self`: whose modifier it is
    case 'target.halfCover': return sit.cover === undefined ? null : sit.cover === 'half';
    case 'target.threeQuartersCover': return sit.cover === undefined ? null : sit.cover === 'threeQuarters';
    case 'ally.adjacentToTarget':
      return a && t ? Object.values(s.entities).some((o) => o.id !== a.id && upright(o) && o.side === a.side && apart(s, o, t) <= 1) : null;
    case 'enemy.adjacent':
      return a ? Object.values(s.entities).some((o) => upright(o) && o.side !== a.side && apart(s, o, a) <= 1) : null;
    default: return null;
  }
}

// Where a creature's modifiers come from, each with the name to show as the reason.
function* sources(s, e) {
  for (const fx of s?.effects ?? []) {
    for (const p of fx.parts) if (p.modifier && !p.ended && p.target === e.id) yield { name: fx.name, modifiers: [p.modifier], level: 1, key: fx.id };
  }
  for (const [id, inst] of conditionsOf(e)) {
    const def = conditionDef(id);
    if (def) yield { name: def.name, modifiers: def.modifiers, level: inst.level ?? 1, condition: id };
  }
  for (const trait of CONTENT.monsters[e.tpl]?.traits ?? []) yield { name: trait.name, modifiers: trait.modifiers, level: 1 };
}

// Dice in a modifier's value: "1d4" (Bless) or "-1d4" (Bane). Rolled each time it applies, by the
// caller that makes the roll; never here, so that asking what applies changes nothing.
export const DICE_VALUE = /^[+-]?\d+d\d+([+-]\d+)?$/;
// Does a modifier's `scope` hold for this roll? `scope.skill` or `scope.ability` limits a check
// (or a save) to one skill or ability; `sit.skill` and `sit.ability` say what the roll is.
function inScope(m, sit) {
  if (!m.scope) return true;
  if (m.scope.skill !== undefined && m.scope.skill !== sit.skill) return false;
  if (m.scope.ability !== undefined && m.scope.ability !== sit.ability) return false;
  return true;
}

// Everything that applies to creature `e` at `hook` in this situation, added up:
//   { add, set, advantage: [reasons], disadvantage: [reasons], autoFail, autoSucceed, crit,
//     resist, vulnerable, immune,   (the last three: true for all damage, or a list of types)
//     dice: [{ dice, name }],       dice to roll and add when the roll is made
//     taken: [{ value, types, name, once, key }] }   for damage.taken: an amount (or dice) added
//                                   to damage of those types (all, if none), at most once a turn if `once`
// `side` says which end of an attack `e` is on, for wording the reasons as the log always has
// ("target prone"). Pass '' where there are no sides, such as a saving throw ("Restrained").
export function modifiers(s, e, hook, sit = {}, side = 'attacker') {
  const out = { add: 0, set: null, advantage: [], disadvantage: [], autoFail: false, autoSucceed: false, crit: false,
    resist: [], vulnerable: [], immune: [], dice: [], taken: [] };
  for (const src of sources(s, e)) {
    for (const m of src.modifiers) {
      if (m.on !== hook) continue;
      if (!(m.when ?? []).every((tag) => judge(tag, { ...sit, self: e }, s) === true)) continue;      // not known to hold: not applied
      if (!inScope(m, sit)) continue;
      const value = typeof m.value === 'object' ? m.value.perLevel * src.level : m.value;
      const reason = src.condition && side ? `${side} ${src.condition}` : src.name;
      if (m.op === 'add' && hook === 'damage.taken') out.taken.push({ value, types: m.types ?? null, name: src.name, once: m.once === 'turn', key: `${src.key ?? src.name}:${e.id}` });
      else if (m.op === 'add' && typeof value === 'string') out.dice.push({ dice: value, name: src.name });
      else if (m.op === 'add') out.add += value;
      else if (m.op === 'set') out.set = out.set === null ? value : Math.min(out.set, value);
      else if (m.op === 'advantage') out.advantage.push(reason);
      else if (m.op === 'disadvantage') out.disadvantage.push(reason);
      else if (m.op === 'autoFail') out.autoFail = true;
      else if (m.op === 'autoSucceed') out.autoSucceed = true;
      else if (m.op === 'crit') out.crit = true;
      else if (m.op === 'resist' || m.op === 'vulnerable' || m.op === 'immune') {
        if (!m.types) out[m.op] = true; else if (out[m.op] !== true) out[m.op].push(...m.types);
      }
    }
  }
  return out;
}

// A creature's Speed after everything that changes it. Never below 0.
// `mode` is walk (the default), climb, swim, fly or burrow; a creature without that way of moving has 0.
export function speedOf(s, e, mode = 'walk') {
  const base = mode === 'walk' ? e.speed ?? 0 : e.speeds?.[mode] ?? 0, m = modifiers(s, e, 'speed');
  return base > 0 ? Math.max(0, m.set !== null ? m.set : base + m.add) : 0;
}
