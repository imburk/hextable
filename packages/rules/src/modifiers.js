// Modifiers: one way for anything to change a roll or a number.
//
// A condition, a monster's trait, a spell's lasting effect, and later an item or a feature all
// say what they change as data: { on: hook, op, value?, when?, types? }. This file gathers the
// ones that apply to a creature at a hook and adds them up. The engine asks once per roll and
// gets back the total and the reasons, which is what the log shows.
// Design: docs/specs/rules-expansion.md, decision 3.
import { CONTENT } from './content/index.js';
import * as H from './hex.js';
import { apart, FT } from './space.js';
import { canSee, coverOf } from './sight.js';

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
    case 'attack.hit': return sit.hit === undefined ? null : sit.hit;              // the damage comes from an attack roll that hit
    case 'attack.weapon': return sit.weapon === undefined ? null : sit.weapon;     // ... made with a weapon
    case 'attack.str': return sit.str === undefined ? null : sit.str;              // an attack using Strength (Rage, Reckless Attack)
    case 'attack.spell': return sit.spell === undefined ? null : sit.spell;        // the attack roll of a spell (Innate Sorcery)
    case 'spell.cantrip': return sit.cantrip === undefined ? null : sit.cantrip;   // damage from a cantrip (Potent Spellcasting)
    case 'self.notIncapacitated': return sit.self ? !incapacitated(sit.self) : null; // whose modifier it is (Danger Sense)
    case 'target.unconscious': return t ? has(t, 'unconscious') : null;
    // "If you or your allies are fighting it": a fight is on, the target is in it, and it is hostile to the source.
    case 'target.fought': return a && t ? !!s.encounter && s.encounter.order.some((o) => o.id === t.id) && a.side !== t.side : null;
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

// Auras (a built character's feature with `aura`: Aura of Protection, Aura of Courage): what
// reaches creature `e` from its own auras and those of its allies. An aura is an Emanation of
// `range` feet from its holder, inactive while the holder is Incapacitated (or down or dead), and
// blocked by total cover. Of several auras from features of one id (two paladins), `e` has the one
// that adds most, which is the one a creature would choose. Each is { name, modifiers?, immune? }.
export function aurasOn(s, e) {
  if (!s?.entities || !e?.pos) return [];
  const best = new Map();
  for (const o of Object.values(s.entities)) {
    if (!o.feats || !o.pos || o.dead || !(o.hp > 0) || incapacitated(o)) continue;
    if (o.id !== e.id && (o.side !== e.side || e.dead)) continue;
    for (const f of o.feats) {
      if (!f.aura) continue;
      if (o.id !== e.id && (apart(s, o, e) * FT > f.aura.range || coverOf(s, o, e) === 'total')) continue;
      const worth = (f.aura.modifiers ?? []).reduce((n, m) => n + (typeof m.value === 'number' ? m.value : 0), 0);
      const had = best.get(f.id);
      if (!had || worth > had.worth) best.set(f.id, { name: f.name, modifiers: f.aura.modifiers ?? [], immune: f.aura.immune ?? [], worth, from: o.id });
    }
  }
  return [...best.values()];
}
// Is a creature immune to a condition: its own immunity (a monster's), or an ally's aura (Aura of Courage)?
export const immuneTo = (s, e, id) => !!e.conditionImmune?.includes(id) || aurasOn(s, e).some((a) => a.immune.includes(id));

// Where a creature's modifiers come from, each with the name to show as the reason.
function* sources(s, e) {
  for (const fx of s?.effects ?? []) {
    // `against`: the modifier holds only against that creature (Hex, Hunter's Mark: the marked target).
    for (const p of fx.parts) if (p.modifier && !p.ended && p.target === e.id) yield { name: fx.name, modifiers: [p.modifier], level: 1, key: fx.id, against: p.against, part: p };
  }
  const auras = aurasOn(s, e);
  for (const [id, inst] of conditionsOf(e)) {
    const def = conditionDef(id);
    // A condition an aura makes it immune to has no effect while it is in the aura (Aura of Courage).
    if (def && !auras.some((a) => a.immune.includes(id))) yield { name: def.name, modifiers: def.modifiers, level: inst.level ?? 1, condition: id };
  }
  for (const a of auras) if (a.modifiers.length) yield { name: a.name, modifiers: a.modifiers, level: 1 };
  for (const trait of CONTENT.monsters[e.tpl]?.traits ?? []) yield { name: trait.name, modifiers: trait.modifiers, level: 1 };
  // A form's stat block brings its traits (a wolf's Pack Tactics in Wild Shape; forms.js).
  for (const trait of CONTENT.monsters[e.form?.block]?.traits ?? []) yield { name: trait.name, modifiers: trait.modifiers, level: 1 };
  // A built character's features that are always on (Danger Sense, Feral Instinct), as derive() made them.
  for (const f of e.feats ?? []) if (f.modifiers) yield { name: f.name, modifiers: f.modifiers, level: 1 };
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
  // A save to avoid or end a condition: `sit.conditions` are those the save is about.
  if (m.scope.condition !== undefined && !(sit.conditions ?? []).includes(m.scope.condition)) return false;
  return true;
}

// Everything that applies to creature `e` at `hook` in this situation, added up:
//   { add, set, advantage: [reasons], disadvantage: [reasons], autoFail, autoSucceed, crit,
//     resist, vulnerable, immune,   (the last three: true for all damage, or a list of types)
//     dice: [{ dice, name }],       dice to roll and add when the roll is made
//     min, max,                     the least and the most the number may be (Barkskin: AC at least 17)
//     dealt: [{ value, types, name }]   for damage.dealt: extra damage of those types, or added to the damage
//     used: [parts]                 single-use modifiers that applied, for the roll's maker to use up
//     taken: [{ value, types, name, once, key }] }   for damage.taken: an amount (or dice) added
//                                   to damage of those types (all, if none), at most once a turn if `once`
// `side` says which end of an attack `e` is on, for wording the reasons as the log always has
// ("target prone"). Pass '' where there are no sides, such as a saving throw ("Restrained").
export function modifiers(s, e, hook, sit = {}, side = 'attacker') {
  const out = { add: 0, set: null, advantage: [], disadvantage: [], autoFail: false, autoSucceed: false, crit: false,
    resist: [], vulnerable: [], immune: [], dice: [], taken: [], dealt: [], min: null, max: null, used: [], rescue: [] };
  for (const src of sources(s, e)) {
    if (src.against && sit.target?.id !== src.against) continue;
    for (const m of src.modifiers) {
      if (m.on !== hook) continue;
      if (!(m.when ?? []).every((tag) => judge(tag, { ...sit, self: e }, s) === true)) continue;      // not known to hold: not applied
      if (!inScope(m, sit)) continue;
      const value = typeof m.value === 'object' ? m.value.perLevel * src.level : m.value;
      const reason = src.condition && side ? `${side} ${src.condition}` : src.name;
      // `onFail`: dice added only after the roll failed (Bardic Inspiration, Peerless Skill); the
      // roll's maker decides (engine/rolls.js, rescue), so nothing is added or used up here.
      if (m.onFail) { out.rescue.push({ value, name: src.name, ...(src.part ? { part: src.part } : {}), ...(m.cost ? { cost: m.cost } : {}) }); continue; }
      if (m.uses && src.part) out.used.push(src.part);         // one use: the roll that takes it ends it (durations.useUp)
      if (m.op === 'add' && hook === 'damage.dealt') out.dealt.push({ value, types: m.types ?? null, name: src.name, ...(m.once === 'turn' ? { once: true, key: `${src.name}:${e.id}` } : {}) });
      else if (m.op === 'add' && hook === 'damage.taken') out.taken.push({ value, types: m.types ?? null, name: src.name, once: m.once === 'turn', key: `${src.key ?? src.name}:${e.id}` });
      else if (m.op === 'add' && typeof value === 'string') out.dice.push({ dice: value, name: src.name });
      else if (m.op === 'add') out.add += value;
      else if (m.op === 'set') out.set = out.set === null ? value : Math.min(out.set, value);
      else if (m.op === 'min') out.min = out.min === null ? value : Math.max(out.min, value);
      else if (m.op === 'max') out.max = out.max === null ? value : Math.min(out.max, value);
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

// A number kept within what `min` and `max` modifiers allow.
export const bounded = (m, n) => Math.min(m.max ?? Infinity, Math.max(m.min ?? -Infinity, n));

// A creature's Speed after everything that changes it. Never below 0.
// `mode` is walk (the default), climb, swim, fly or burrow; a creature without that way of moving has 0.
export function speedOf(s, e, mode = 'walk') {
  let base = mode === 'walk' ? e.speed ?? 0 : e.speeds?.[mode] ?? 0;
  // A Fly Speed something gives for a while (Dragon Wings: `speed.fly` set 60), if it is more than its own.
  if (mode === 'fly') { const f = modifiers(s, e, 'speed.fly'); if (f.set !== null) base = Math.max(base, f.set); }
  const m = modifiers(s, e, 'speed');
  return base > 0 ? Math.max(0, bounded(m, m.set !== null ? m.set : base + m.add)) : 0;
}
