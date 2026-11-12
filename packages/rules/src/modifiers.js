// Modifiers: one way for anything to change a roll or a number.
//
// A condition, a monster's trait, and later an item, a feature or a spell's lasting effect all
// say what they change as data: { on: hook, op, value?, when?, types? }. This file gathers the
// ones that apply to a creature at a hook and adds them up. The engine asks once per roll and
// gets back the total and the reasons, which is what the log shows.
// Design: docs/specs/rules-expansion.md, decision 3.
import { CONTENT } from './content/index.js';
import * as H from './hex.js';

// Things a creature can be that are not SRD conditions but work the same way.
const STATUSES = {
  dodging: { name: 'Dodging', visible: true,
    modifiers: [{ on: 'attack.received', op: 'disadvantage' }, { on: 'save.dex', op: 'advantage' }] },
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
  const near = a && t ? H.dist(a.pos, t.pos) <= 1 : null;
  switch (tag) {
    case 'within5': return near;
    case 'beyond5': return near === null ? null : !near;
    case 'ranged': return sit.ranged ?? null;
    case 'melee': return sit.ranged === undefined ? null : !sit.ranged;
    case 'attack.advantage': return sit.mode === undefined ? null : sit.mode === 'adv';
    case 'attack.disadvantage': return sit.mode === undefined ? null : sit.mode === 'dis';
    case 'target.prone': return t ? has(t, 'prone') : null;
    case 'target.unconscious': return t ? has(t, 'unconscious') : null;
    case 'ally.adjacentToTarget':
      return a && t ? Object.values(s.entities).some((o) => o.id !== a.id && upright(o) && o.side === a.side && H.dist(o.pos, t.pos) <= 1) : null;
    case 'enemy.adjacent':
      return a ? Object.values(s.entities).some((o) => upright(o) && o.side !== a.side && H.dist(o.pos, a.pos) <= 1) : null;
    default: return null;
  }
}

// Where a creature's modifiers come from, each with the name to show as the reason.
function* sources(e) {
  for (const [id, inst] of conditionsOf(e)) {
    const def = conditionDef(id);
    if (def) yield { name: def.name, modifiers: def.modifiers, level: inst.level ?? 1, condition: id };
  }
  for (const trait of CONTENT.monsters[e.tpl]?.traits ?? []) yield { name: trait.name, modifiers: trait.modifiers, level: 1 };
}

// Everything that applies to creature `e` at `hook` in this situation, added up:
//   { add, set, advantage: [reasons], disadvantage: [reasons], autoFail, autoSucceed, crit,
//     resist, vulnerable, immune }   (the last three: true for all damage, or a list of types)
// `side` says which end of an attack `e` is on, for wording the reasons as the log always has
// ("target prone"). Pass '' where there are no sides, such as a saving throw ("Restrained").
export function modifiers(s, e, hook, sit = {}, side = 'attacker') {
  const out = { add: 0, set: null, advantage: [], disadvantage: [], autoFail: false, autoSucceed: false, crit: false,
    resist: [], vulnerable: [], immune: [] };
  for (const src of sources(e)) {
    for (const m of src.modifiers) {
      if (m.on !== hook) continue;
      if (!(m.when ?? []).every((tag) => judge(tag, sit, s) === true)) continue;      // not known to hold: not applied
      const value = typeof m.value === 'object' ? m.value.perLevel * src.level : m.value;
      const reason = src.condition && side ? `${side} ${src.condition}` : src.name;
      if (m.op === 'add') out.add += value;
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
export function speedOf(s, e) {
  const m = modifiers(s, e, 'speed');
  return Math.max(0, m.set !== null ? m.set : (e.speed ?? 0) + m.add);
}
