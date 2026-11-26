// Effect steps: how a spell (and later a monster action, feature or item) does what it does.
//
// Content describes an effect as a list of steps from a closed vocabulary (content/schema.js).
// This file runs such a list. It knows nothing about any particular spell.
//
// Resolution is a stack of frames kept in the game state (state.stack), not a chain of
// function calls. Every loop counter and every "which branch am I in" lives in a frame as
// plain data, and the stack is always empty again when apply() returns. An action that stops to
// ask a player about a reaction (engine.js, apply, which also holds the react handler) is put back whole and run again from its start
// with the answer, so nothing here ever waits half-way.
// Design: docs/specs/rules-expansion.md, decisions 2 and 4.
import { BRANCHES, SIZES, SPELL_KINDS, SPELL_ROLLS, STEPS } from './content/schema.js';
import { roll } from './rng.js';
import { srcOf } from './homebrew.js';
import { effectsOf, useUp } from './durations.js';

// A target above a step's `largest` (#495). The note about it names the creature that acted (`actor`), so the player's view keeps it only where it
// keeps that creature's own events (view.js drops an event whose actor the party cannot see, as it drops the attack): a hidden wolf's Bite says nothing.
const tooBig = (t, step) => step.largest !== undefined && SIZES.indexOf(t.size ?? 'medium') > SIZES.indexOf(step.largest);
const cap = (x) => x[0].toUpperCase() + x.slice(1);
export const stepKind = (step) => STEPS.find((k) => k in step);
// Area shapes the engine can lay out on hexes (engine/world.js, layout()).
// The largest cube the engine places (feet): the gate's own most. A cube is placed by trying blocks, so it cannot be cut to the map.
export const CUBE_AIM_MAX = 1000;
export const AREAS = ['cone', 'sphere', 'cylinder', 'emanation', 'line', 'cube'];
// Can the engine aim this area? A sphere or cylinder needs somewhere within range to go off
// (`range`: the spell's range in feet, or an action's `area.range`); a Line with a range is a
// wall placed at a distance, which the DM places, unless it is `placed` (the wall spells: engine/world.js, layout).
export function aimable(area, range) {
  if (area.shape === 'cube' && area.size > CUBE_AIM_MAX) return false;   // too large to place by the engine: the DM places it (a `manual` step says so)
  if (!AREAS.includes(area.shape) || area.count > 1) return false;     // several shapes arranged by the caster: the DM
  if (area.shape === 'sphere' || area.shape === 'cylinder') return range > 0;
  if (area.shape === 'line') return area.placed ? range > 0 : !(range > 0);        // a placed Line is a wall put down within range (Wall of Fire)
  return true;
}

// Visit every step, including those inside branches. `path` names a step uniquely within its
// list ("0", "0.onFail.1"), and `inAttack` says whether it sits under an attack roll.
export function walk(steps, visit, path = '', inAttack = false) {
  steps.forEach((step, i) => {
    const at = `${path}${i}`;
    visit(step, at, inAttack);
    for (const b of BRANCHES) if (step[b]) walk(step[b], visit, `${at}.${b}.`, inAttack || 'attack' in step);
  });
}

// ---------- what a spell is, for the engine and the UI ----------

const DICE = /^(?:(\d+)d(\d+))?([+-]\d+)?$/;
// "3d6" plus n lots of "1d6" is "5d6". Null if the dice are of different sizes.
export function addDice(base, extra, n = 1) {
  const a = DICE.exec(base), b = DICE.exec(extra);
  if (!a || !b) return null;
  const sidesA = a[2] ? +a[2] : 0, sidesB = b[2] ? +b[2] : 0;
  if (sidesA && sidesB && sidesA !== sidesB) return null;
  const count = (a[1] ? +a[1] : 0) + (b[1] ? +b[1] : 0) * n, sides = sidesA || sidesB;
  const bonus = (a[3] ? +a[3] : 0) + (b[3] ? +b[3] : 0) * n;
  return `${count ? `${count}d${sides}` : ''}${bonus ? (bonus > 0 && count ? `+${bonus}` : `${bonus}`) : ''}` || '0';
}

// The steps as they apply to this caster and this slot: cantrips grow with character level,
// levelled spells with the slot spent. Returns { steps, unscaled } where `unscaled` says in
// words what could not be worked out, so the DM is told instead of the engine guessing.
export function scaleSteps(def, casterLevel = 0, slot = def.level) {
  const steps = structuredClone(def.effects);
  let unscaled = null;
  const first = (key) => { let found = null; walk(steps, (st) => { if (!found && key in st) found = st; }); return found; };
  const byLevel = def.higher?.level;
  if (byLevel) {
    const reached = Object.keys(byLevel).map(Number).filter((l) => l <= casterLevel).sort((x, y) => y - x)[0];
    const dmg = first('damage');
    if (reached !== undefined && dmg) dmg.damage = byLevel[reached];
  }
  const up = slot - def.level, bySlot = def.higher?.slot;
  if (up > 0 && bySlot) {
    for (const key of ['damage', 'heal', 'tempHp']) {
      if (!bySlot[key]) continue;
      // An attack the spell gives its caster (`arm`: Flame Blade) grows like a damage step of its own.
      const st = first(key) ?? (key === 'damage' ? first('arm')?.arm : null), sum = st && addDice(st[key], bySlot[key], up);
      if (sum) st[key] = sum; else unscaled = `the extra ${bySlot[key]} per slot level above ${def.level}`;
    }
    // A spell that does damage at the start of the creature's turns (Searing Smite: "All the damage increases by 1d6") grows that damage by the same dice.
    if (bySlot.damage) {
      const lead = first('damage');
      walk(steps, (st, at) => {
        if (!('eachTurn' in st)) return;
        const inner = st.eachTurn.find((x) => 'damage' in x);
        if (!inner || inner === lead) return;
        const sum = addDice(inner.damage, bySlot.damage, up);
        if (sum) inner.damage = sum; else unscaled = `the extra ${bySlot.damage} per slot level above ${def.level} on the damage at the start of each turn`;
      });
    }
    if (bySlot.times) { const st = first('damage'); if (st) st.times = (st.times || 1) + bySlot.times * up; }
    if (bySlot.value) { const st = first('modifier'); if (st && typeof st.modifier.value === 'number') st.modifier.value += bySlot.value * up; }
  }
  return { steps, unscaled };
}

// A spell's range in feet for this caster, grown by character level (`higher.range`: Spare the Dying's 15 feet is 30 at level 5, 60 at 11 and 120 at 17).
// Self and Touch have none to grow; the answer is in feet as `feet` gives them (Touch is 5), the spell's own where no level has been reached.
export function rangeAt(def, casterLevel = 0) {
  const byLevel = def.higher?.range;
  if (!byLevel || typeof def.range !== 'number') return feet(def.range);
  const reached = Object.keys(byLevel).map(Number).filter((l) => l <= casterLevel).sort((x, y) => y - x)[0];
  return reached === undefined ? def.range : byLevel[reached];
}

// How many creatures (or rays, darts, beams) a spell aims at for this caster and slot:
// `target.creature.count` (1 if not given), or the most reached in `higher.targets` by character
// level (Eldritch Blast's beams), plus `higher.slot.targets` for each slot level above its own.
// For an area with `choose`, how many of those caught the caster may pick.
export function targetCount(def, casterLevel = 0, slot = def.level) {
  const t = def.target;
  let n = t.creature?.count ?? t.area?.choose ?? 1;
  const byLevel = def.higher?.targets;
  if (byLevel) { const reached = Object.keys(byLevel).map(Number).filter((l) => l <= casterLevel).sort((x, y) => y - x)[0]; if (reached !== undefined) n = byLevel[reached]; }
  const up = slot - def.level;
  if (up > 0 && def.higher?.slot?.targets) n += def.higher.slot.targets * up;
  return n;
}

const feet = (range) => (range === 'self' ? 0 : range === 'touch' ? 5 : range);

// A short description of the first thing a spell does, for buttons and the character sheet.
// Rays, darts and beams (`repeat`) show how many there are, as more damage rolls do.
function summarise(def) {
  const step = def.effects[0], kind = stepKind(step), c = def.target?.creature, many = c?.repeat ? c.count ?? 1 : 1;
  const dmg = (list) => { const d = list?.find((x) => 'damage' in x); const n = (d?.times || 1) * many; return d ? `${d.damage}${n > 1 ? ` ×${n}` : ''} ${d.type}` : null; };
  const cond = (list) => list?.find((x) => 'condition' in x)?.condition;
  if (kind === 'attack') return { short: dmg(step.onHit) ?? 'attack', long: `${dmg(step.onHit) ?? 'no damage'}, ${step.kind === 'spell' ? 'spell attack' : 'attack'}` };
  if (kind === 'save') {
    const what = dmg(step.onFail) ?? (cond(step.onFail) ? `or ${cond(step.onFail)}` : 'or suffer the effect');
    return { short: dmg(step.onFail) ?? `${step.save.toUpperCase()} save`, long: `${what}, ${step.save.toUpperCase()} save${step.half ? ' for half' : ''}` };
  }
  if (kind === 'damage') return { short: dmg([step]), long: `${dmg([step])}, always hits` };
  if (kind === 'heal') return { short: `heal ${step.heal}`, long: `Heal ${step.heal}` };
  if (kind === 'tempHp') return { short: `${step.tempHp} temp HP`, long: `${step.tempHp} Temporary Hit Points` };
  if (kind === 'condition') return { short: step.condition, long: `Target is ${step.condition}` };
  if (kind === 'summon' && step.on === 'corpse') return { short: 'summon', long: `Raises ${step.count && step.count !== 1 ? 'corpses' : 'a corpse'} as undead under the caster's control for 24 hours` };
  if (kind === 'summon') return { short: 'summon', long: `Summons ${step.count && step.count !== 1 ? 'creatures' : 'a creature'} for ${def.duration === 'instant' ? 'as long as it lasts' : `up to ${def.duration}`}${def.concentration ? ', Concentration' : ''}` };
  if (kind === 'sense') return { short: `sense ${step.sense}`, long: `Senses ${step.sense === 'traps' ? 'traps' : 'magic'} within ${step.feet} feet (the DM is told, and tells the player)` };
  if (kind === 'stabilize') return { short: 'stabilise', long: 'A creature at 0 Hit Points becomes Stable' };
  if (kind === 'revive') return { short: 'revive', long: `Brings a creature that died within the last ${step.within === 1 ? 'minute' : `${step.within} minutes`} back to life with ${step.revive} Hit Point${step.revive === 1 ? '' : 's'}` };
  if (kind === 'dispel') return { short: 'end spells', long: `Ends spells of level ${step.dispel} or lower on it; a check against DC ${step.dc} plus the level for each higher one` };
  if (kind === 'eachTurn') return { short: 'each turn', long: `At the start of each of its turns for ${def.duration}${def.concentration ? ' (Concentration)' : ''}: ${step.eachTurn.map((x) => ('heal' in x ? `heal ${x.heal}${x.addMod ? ' + the spellcasting modifier' : ''}` : 'tempHp' in x ? `${x.tempHp}${x.addMod ? ' + the spellcasting modifier' : ''} Temporary Hit Points` : 'damage' in x ? `${x.damage} ${x.type} damage` : 'save' in x ? `a ${x.save.toUpperCase()} save` : 'the DM applies a part')).join(', ')}` };
  if (kind === 'ward') return { short: 'ward', long: `Attackers and damaging spells aimed at the target need a ${step.ward.toUpperCase()} save first; the ward ends when the target attacks, casts a spell or deals damage` };
  if (kind === 'command') return { short: 'command', long: 'The target follows a one-word command on its next turn' };
  if (kind === 'confuse') return { short: 'confused', long: `The target can take no Bonus Action or Reaction and acts at random on its turns for ${def.duration}${def.concentration ? ' (Concentration)' : ''}` };
  if (kind === 'arm') return { short: `${step.arm.damage} ${step.arm.type}`, long: `Gives the caster a melee spell attack for ${step.arm.damage}${step.arm.addMod ? ' plus the spellcasting modifier' : ''} ${step.arm.type} damage for as long as it lasts` };
  if (kind === 'light') return { short: `${step.light.bright} ft light`, long: `Sheds Bright Light for ${step.light.bright} feet and Dim Light for ${step.light.dim} feet more` };
  if (kind === 'cure') return { short: 'end a condition', long: `Ends ${step.cure.includes('chosen') ? 'a chosen condition' : step.cure.join(', ')}` };
  if (kind === 'modifier') {
    const m = step.modifier, what = m.on === 'ac' ? 'AC' : m.on;
    if (m.on === 'condition') return { short: `immune to ${m.scope.condition}`, long: `Immune to the ${cap(m.scope.condition)} condition for ${def.duration}${def.concentration ? ', Concentration' : ''}` };
    if (m.on === 'hp.zero') return { short: '1 HP instead of 0, once', long: `The first time it would drop to 0 Hit Points it drops to 1 instead, within ${def.duration}` };
    const text = m.op === 'baseAc' ? `base AC ${m.value.base} + ${m.value.ability.toUpperCase()}`
      : m.op === 'add' && typeof m.value === 'number' ? `${m.value > 0 ? '+' : ''}${m.value} ${what}`
      : m.op === 'add' && typeof m.value === 'string' ? `${m.value.startsWith('-') ? '' : '+'}${m.value} ${what}` : `${m.op} on ${what}`;
    return { short: text, long: `${text} for ${def.duration}${def.concentration ? ', Concentration' : ''}` };
  }
  return { short: 'DM applies', long: 'The DM applies the effect' };
}

// Conditions the SRD treats as a benefit to whoever has them: putting one on a creature is not hostile.
export const BENEFICIAL_CONDITIONS = ['invisible'];

// What a spell is for, in four words a player sorts by (docs/specs/table-ui.md, E12): `damage`, `healing`,
// `control` and `utility` (SPELL_KINDS, kept in content/schema.js). A spell may be more than one. A spell's own
// `kinds`, tagged by hand from its SRD text (E12, amended 15 November 2026), wins; without one they are worked
// out from its effect steps:
//   damage   a damage, fall or kill step; a modifier on the damage it or its caster deals (Hex, Divine Favor)
//   healing  a heal, Temporary Hit Points or cure step
//   control  a harmful condition, forced movement, a counter, difficult terrain, a modifier that hinders
//   utility  a helpful modifier or condition (Invisible), a teleport, a reveal; and a spell with steps
//            that none of the others fit
// An untagged spell whose only steps are `manual` (the DM applies it, its words in the step's text), perhaps
// behind an attack roll or a save, gets no kind: the engine cannot tell what it is for and does not guess. Every
// SRD spell is tagged or derives a kind; a homebrew spell may still have none, and the client shows such a spell
// under every kind, marked as not known.
export { SPELL_KINDS, SPELL_ROLLS };
function hinders(m) {
  const neg = (typeof m.value === 'number' && m.value < 0) || (typeof m.value === 'string' && m.value.startsWith('-'));
  if (m.on.startsWith('attack.received')) return m.op === 'advantage' || m.op === 'crit';
  if (m.on.startsWith('damage.taken')) return m.op === 'vulnerable' || (m.op === 'add' && !neg);
  if (['disadvantage', 'autoFail'].includes(m.op)) return true;
  if (m.op === 'set' && m.on === 'speed') return true;
  return m.op === 'add' && neg;
}
export function spellKinds(def) {
  if (Array.isArray(def.kinds)) return SPELL_KINDS.filter((x) => def.kinds.includes(x));
  return derivedKinds(def);
}
// The roll a spell turns on: 'attack', 'save:<ability>' or 'none' (docs/specs/rules-expansion.md, "A spell's roll"). A spell's own `roll` wins; otherwise
// the steps say it (an attack step, else the first save step), and a spell whose steps have no roll and no manual step is 'none'. Null when the
// steps cannot say (a manual step may hide a roll): the screen shows nothing then.
export function spellRoll(def) {
  if (SPELL_ROLLS.includes(def?.roll)) return def.roll;
  if (!Array.isArray(def?.effects)) return null;
  let attack = false, save = null, manual = false;
  walk(def.effects, (st) => { if ('attack' in st) attack = true; else if ('save' in st) save ??= `save:${st.save}`; else if ('manual' in st) manual = true; });
  const found = attack ? 'attack' : save;
  return found && SPELL_ROLLS.includes(found) ? found : manual ? null : 'none';
}
// The kinds read from a spell's steps alone, as if it carried no tag.
export function derivedKinds(def) {
  const k = new Set();
  let steps = false;
  walk(def.effects, (st, at) => {
    if (at.includes('.blocked.')) return;                 // what befalls the caster when a teleport is blocked
    const kind = stepKind(st);
    if (!['manual', 'save', 'attack'].includes(kind)) steps = true;     // a roll whose result the DM applies says nothing of what the spell is for
    if (kind === 'damage' || kind === 'fall' || kind === 'kill') k.add('damage');
    else if (kind === 'heal' || kind === 'tempHp' || kind === 'cure' || kind === 'revive') k.add('healing');
    else if (kind === 'condition') k.add(BENEFICIAL_CONDITIONS.includes(st.condition) ? 'utility' : 'control');
    else if (kind === 'move' || kind === 'counter') k.add('control');
    else if (kind === 'teleport' || kind === 'reveal' || kind === 'dispel') k.add('utility');
    else if (kind === 'modifier') {
      const m = st.modifier;
      k.add(m.on.startsWith('damage.dealt') ? 'damage' : hinders(m) ? 'control' : 'utility');
    }
  });
  if (def.terrain) k.add('control');
  if (!k.size && steps) k.add('utility');
  return SPELL_KINDS.filter((x) => k.has(x));
}

// Everything the engine and the UI need to know about a spell, worked out once from its data.
export function spellProfile(def) {
  let harmful = false, heals = false, healStep = null;
  walk(def.effects, (st) => {
    const k = stepKind(st);
    if (k === 'attack' || k === 'save' || k === 'damage' || k === 'fall' || (k === 'condition' && !BENEFICIAL_CONDITIONS.includes(st.condition))) harmful = true;
    if (k === 'modifier' && st.modifier.against) harmful = true;     // a mark or curse that works only against its target (Hex, Hunter's Mark) is cast at a foe
    if (k === 'heal') { heals = true; healStep ??= st; }
  });
  const t = def.target, tp = def.effects.find((st) => 'teleport' in st), sm = def.effects.find((st) => 'summon' in st);
  // A spell's sphere or cylinder goes off within its range (a Self one, on the caster's own hex).
  const within = t.area && ['sphere', 'cylinder'].includes(t.area.shape) ? Math.max(1, feet(def.range)) : feet(def.range);
  const aim = t.self ? 'self' : t.area ? (aimable(t.area, within) ? 'area' : 'none') : 'creature';
  return {
    id: def.id, name: def.name, level: def.level, time: def.time, range: feet(def.range),
    aim,                                           // 'creature' | 'area' | 'self' | 'none' (nothing the engine can aim)
    ...(aim === 'area' ? { area: { ...t.area } } : {}),
    ...(aim === 'creature' ? { count: t.creature.count ?? 1, ...(t.creature.repeat ? { repeat: true } : {}), ...(t.creature.within ? { within: t.creature.within } : {}),
      // The creature types it works on (Hold Person: Humanoid); one of another type is an invalid target, and the cast does nothing to it.
      ...(t.creature.types ? { types: [...t.creature.types] } : {}),
      // Aimed at a dead creature, and at no other (Revivify).
      ...(t.creature.dead ? { dead: true } : {}) } : {}),
    harmful, heals: heals && !harmful,
    heal: healStep ? { dice: healStep.heal, addMod: !!healStep.addMod } : null,
    turn: def.time === 'action' || def.time === 'bonus',   // can be cast on a turn in a fight
    kinds: spellKinds(def),                        // what it is for: damage, healing, control, utility
    roll: spellRoll(def),                          // what it turns on: 'attack', 'save:dex' and so on, 'none', or null when not known
    // A teleport: the `cast` action names the destination in `hex` (docs/specs/rules-expansion.md).
    ...(tp ? { teleport: { feet: tp.teleport, see: !!tp.see } } : {}),
    // A summon: the `cast` action names its choices and a space for each creature in `summon` (engine/casting.js).
    ...(sm ? { summon: { of: sm.summon, count: sm.count ?? 1, ...(sm.variants ? { variants: [...sm.variants] } : {}), ...(sm.types ? { types: [...sm.types] } : {}),
      ...(sm.forms ? { forms: structuredClone(sm.forms) } : {}), kind: sm.bond?.kind ?? null,
      // On corpses (stage C5b): the cast names corpses or the caster's own creatures of the spell, `summon: { ids }`.
      ...(sm.on === 'corpse' ? { on: 'corpse', reassert: structuredClone(sm.reassert ?? sm.count ?? 1) } : {}) } } : {}),
    ...summarise(def),
    def,
  };
}

// Everything the engine, the AI and the UI need to know about a creature's action (a monster's
// Bite, a dragon's breath, its Multiattack), worked out from its data.
export function actionProfile(a) {
  if (a.multiattack) {
    const lists = Array.isArray(a.multiattack) ? [a.multiattack] : a.multiattack.or;
    const most = Math.max(...lists.map((l) => l.reduce((n, x) => n + x.times, 0)));
    return { id: a.id, name: a.name, aim: 'multi', harmful: true, short: `${most} attacks`, long: `${most} attacks this turn`, lists };
  }
  let harmful = false;
  walk(a.effects, (st) => { const k = stepKind(st); if (k === 'attack' || k === 'save' || k === 'damage' || k === 'condition' || k === 'fall' || k === 'move') harmful = true; });
  const t = a.target, first = a.effects[0], kind = stepKind(first);
  const aim = t.self ? 'self' : t.area ? (aimable(t.area, t.area.range ?? 0) ? 'area' : 'none') : 'creature';
  const reach = t.creature?.reach ?? null, range = t.creature?.range ?? null;
  return {
    id: a.id, name: a.name, aim, harmful,
    ...(aim === 'area' ? { area: { ...t.area }, range: t.area.range ?? 0 } : {}),
    ...(aim === 'creature' ? { reach, range: range ? [...range] : null, far: reach ?? range[1] } : {}),
    roll: kind === 'attack' ? first.attack : kind === 'save' ? 'save' : null,         // 'melee' | 'ranged' | 'save' | null
    ...(kind === 'attack' ? { bonus: first.bonus } : {}),
    ...(kind === 'save' ? { save: first.save, dc: first.dc } : {}),
    time: a.time ?? 'action',
    ...(a.recharge ? { recharge: [...a.recharge] } : {}), ...(a.uses ? { uses: { ...a.uses } } : {}),
    ...summarise({ effects: a.effects, duration: 'instant' }),
  };
}

// ---------- the work ceiling (DEBT T35) ----------
//
// The gate (content/schema.js) refuses heavy homebrew, but the engine does not trust whatever it is given:
// an entry that skipped the gate, or a saved state, must not stall the process or grow the state without end.
// One action may run at most WORK.steps effect steps (every step, and every `times` repeat of a damage step),
// roll WORK.dice dice for damage and healing, write WORK.events events, and a Multiattack makes at most
// WORK.attacks attacks. These count work, not time, so a replay gives the same answer on any machine. They sit far
// above the SRD pack's heaviest action (docs/specs/homebrew.md, build notes on the engine's own ceilings, has the
// measured numbers): no SRD action comes near them.
// Past a ceiling apply() refuses the action and puts the game back as it was (engine.js, apply), or, where it
// could not take a copy, stops it with a `manual` event that says what was not applied.
export const WORK = Object.freeze({ steps: 1000, events: 1500, dice: 1200, attacks: 20 });
export class WorkLimit extends Error {
  constructor(limit, what, who = null) { super(`${what ?? 'This action'} would ${limit} in one action, which is more than the engine allows.`); this.limit = limit; this.what = what; this.who = who; }
}
const meter = { on: false, steps: 0, dice: 0, what: null, who: null };
// apply() starts the count for one action and stops it however the action ends.
export function startWork() { meter.on = true; meter.steps = 0; meter.dice = 0; meter.what = null; meter.who = null; }
export function stopWork() { meter.on = false; }
const LIMITS = { steps: (n) => `run more than ${n.toLocaleString('en-US')} steps`, dice: (n) => `roll more than ${n.toLocaleString('en-US')} dice`, events: (n) => `write more than ${n.toLocaleString('en-US')} events` };
function spend(kind, n) {
  if (!meter.on) return;
  meter[kind] += n;
  if (meter[kind] > WORK[kind]) throw new WorkLimit(LIMITS[kind](WORK[kind]), meter.what, meter.who);
}
// Called with the events an action has written so far.
export function checkEvents(ev) { if (meter.on && ev.length > WORK.events) throw new WorkLimit(LIMITS.events(WORK.events), meter.what, meter.who); }
const diceIn = (expr) => { const m = /^\s*(\d+)d/.exec(String(expr)); return m ? +m[1] : 0; };
const timesOf = (step) => { const n = Math.ceil(Number(step.times || 1)); return n >= 1 ? n : 0; };
// What a list of steps may do at most for one target, counting every branch and every repeat: { steps, dice }. Used
// by apply() to decide whether to keep a copy of the game before the action (engine/world.js, mayBeHeavy).
export function loadOf(steps) {
  let n = 0, dice = 0;
  for (const st of Array.isArray(steps) ? steps : []) {
    n++;
    if (st && typeof st === 'object') {
      if ('damage' in st) { const t = timesOf(st); n += t; dice += diceIn(st.damage) * t; }
      for (const k of ['heal', 'tempHp']) if (k in st) dice += diceIn(st[k]);
      for (const b of BRANCHES) if (Array.isArray(st[b])) { const r = loadOf(st[b]); n += r.steps; dice += r.dice; }
    }
  }
  return { steps: n, dice };
}

// ---------- running steps ----------

// { total, dice, bonus }: the faces go on the damage event (docs/specs/dice.md).
// `max`: every die shows its highest number and none is rolled (Overchannel: "deal maximum damage");
// the faces say so (`max: true`), so the log does not pass them off as rolled.
const maxRoll = (expr, crit) => {
  const m = /^(?:(\d+)d(\d+))?\s*([+-]?\s*\d+)?$/.exec(String(expr).trim());
  const n = (m?.[1] ? +m[1] : 0) * (crit ? 2 : 1), sides = +m?.[2] || 0, bonus = m?.[3] ? +m[3].replace(/\s/g, '') : 0;
  return { total: Math.max(0, n * sides + bonus), bonus, dice: Array.from({ length: n }, () => ({ sides, value: sides, max: true })) };
};
const rollDamage = (s, step, crit, max = false) => {
  let total = 0, bonus = 0;
  const dice = [];
  const each = diceIn(step.damage) * (crit ? 2 : 1);
  for (let i = 0; i < (step.times || 1); i++) { spend('steps', 1); spend('dice', each); const r = max ? maxRoll(step.damage, crit) : roll(s, step.damage, { crit }); total += r.total; bonus += r.bonus; dice.push(...r.dice); }
  return { total, dice, bonus };
};

// In an area, damage is rolled once and shared by everyone caught in it. Returns
// { path: total } for every damage step that is not under an attack roll. `max`: see rollDamage.
export function sharedRolls(s, steps, max = false) {
  const shared = {};
  walk(steps, (step, at, inAttack) => { if ('damage' in step && !inAttack) shared[at] = rollDamage(s, step, false, max); });
  return shared;
}

// Begin resolving `steps` from `actor` against each of `targets` in turn. `src` is
// { name, dc, attack, healMod } for events and rolls; `shared` comes from sharedRolls().
export function begin(s, { steps, actor, targets, src, shared = null }) {
  (s.stack ??= []).push(targets === null
    ? { kind: 'seq', steps, path: '', i: 0, actor, target: null, src, shared }       // nothing to aim at: the DM applies it
    : { kind: 'each', steps, t: 0, actor, targets, src, shared });
}

// A creature's turn starts: the steps its lasting effects run then (an `eachTurn` step put a part on it: Heroism, Regenerate; engine/rolls.js `eachTurn`),
// run on it by the effect's source, with the numbers the cast had. A creature that is dead has none. Run on top of whatever is on the stack, as a reaction is.
export function turnSteps(s, ev, kit, e) {
  if (e.dead) return;
  for (const fx of [...effectsOf(s)]) {
    for (const p of [...fx.parts]) {
      if (p.ended || !p.turn || p.target !== e.id || !effectsOf(s).includes(fx) || e.dead) continue;
      const floor = s.stack?.length ?? 0;
      begin(s, { steps: structuredClone(p.turn.steps), actor: s.entities[fx.source] ? fx.source : e.id, targets: [e.id], src: { ...structuredClone(p.turn.src), turn: true, fxEnd: fx.id } });
      run(s, ev, kit, floor);
    }
  }
}

// Run until the stack is empty. `kit` is the engine's own machinery: rollToHit, savingThrow,
// damage, heal, condition, judge. Passing it in keeps this file free of the engine's internals.
// `floor` is how many frames were already on the stack when this run began: a reaction resolved
// inside another effect (Shield, cast while an attack step is running) runs only its own frames,
// and the frames below carry on when control returns to them.
export function run(s, ev, kit, floor = 0) {
  const stack = s.stack ?? [];
  while (stack.length > floor) {
    const f = stack.at(-1);
    if (f.kind === 'each') {
      if (f.t >= f.targets.length) { stack.pop(); continue; }
      // `told` is shared by the targets of one effect, so a manual step's text is shown once, not once per target.
      // `n`: which of the targets this is (the second ray of Scorching Ray is 1), for Empowered Evocation.
      stack.push({ kind: 'seq', steps: f.steps, path: '', i: 0, actor: f.actor, n: f.t, target: f.targets[f.t++], src: f.src, shared: f.shared, told: (f.told ??= {}) });
      continue;
    }
    if (f.i >= f.steps.length) { stack.pop(); continue; }
    const index = f.i++;
    meter.what = f.src?.name ?? meter.what;
    meter.who = f.target ?? null;
    spend('steps', 1);
    exec(s, ev, kit, f, f.steps[index], `${f.path}${index}`);
    checkEvents(ev);
  }
  if (!floor) delete s.stack;
}

function exec(s, ev, kit, f, step, at) {
  const t = f.target === null ? null : s.entities[f.target];
  const kind = stepKind(step);
  const handOver = (text) => ev.push({ type: 'manual', actor: f.actor, name: f.src.name, text });
  const branch = (name, extra = {}) => {
    if (step[name]) s.stack.push({ kind: 'seq', steps: step[name], path: `${at}.${name}.`, i: 0, actor: f.actor, target: f.target, src: f.src, shared: f.shared,
      crit: f.crit, mode: f.mode, half: f.half, evade: f.evade, told: f.told, hit: f.hit, weapon: f.weapon, n: f.n, ...extra });
  };

  if (kind === 'manual') {
    if (f.told) { if (f.told[at]) return; f.told[at] = true; }
    return handOver(step.manual);
  }
  // The source is a creature, or a thing on the map (a trap), for which the engine lends a stand-in.
  const e = f.actor === null ? kit.objectActor(s, f.src.object) : s.entities[f.actor];
  if (!e || (f.target !== null && !t)) return;
  if (f.src.turn && t?.dead) return;  // a turn's steps (eachTurn) stop when an earlier one killed the creature
  if (t === null) return handOver(`The engine has nobody to apply this part of ${f.src.name} to. ${kit.whyNobody?.(f.src) ?? ''}The DM applies it.`);
  for (const tag of step.when ?? []) {
    const ok = kit.judge(tag, { attacker: e, target: t, mode: f.mode }, s);
    if (ok === null) return handOver(`Part of ${f.src.name} depends on "${tag}", which the engine cannot judge yet. The DM applies it if it holds.`);
    if (!ok) return;
  }

  if (kind === 'attack') {
    const atk = step.kind === 'spell'
      ? { name: f.src.name, type: step.attack, spell: true, bonus: f.src.attack ?? step.bonus, ...(step.attack === 'melee' ? { reach: 5 } : { range: [f.src.range, f.src.range] }) }
      : { name: f.src.name, type: step.attack, bonus: step.bonus, ...(step.attack === 'melee' ? { reach: f.src.reach ?? 5 } : { range: f.src.rangeBand ?? [f.src.range, f.src.range] }) };
    // The damage types under the hit, for a reaction that cares (Deflect Attacks).
    atk.dtypes = (step.onHit ?? []).filter((x) => 'damage' in x).map((x) => x.type);
    // `advantageIf`: Advantage on this roll when every tag holds (a creature's "with Advantage if the target is Grappled by it"); rollToHit judges it.
    if (step.advantageIf) atk.advantageIf = step.advantageIf;
    // A touch spell the caster's familiar delivers (`src.via`, engine/casting.js; stage C5c): the roll is made from its space.
    if (step.kind === 'spell' && typeof f.src.via === 'string') atk.via = f.src.via;
    // Sanctuary: a warded target makes its attacker save first; a spell cast at it was dealt with when it was cast (`src.wardDone`, engine/casting.js), so its attack roll is not saved against again. The warded creature's own attack roll ends its ward.
    if (!f.src.wardDone && kit.wardCheck(s, e, t, ev, 'attack')) return;
    kit.endWards(s, ev, e.id, `${e.name} made an attack roll`);
    const r = kit.rollToHit(s, e, t, atk, ev, f.src.tag ?? {});         // `tag` marks the attack event, as an Opportunity Attack for one
    // `cut`: a reaction cut this attack's damage (Uncanny Dodge). It holds for the damage steps
    // right under the hit, not for those under a save the hit calls for.
    return branch(r.hit ? 'onHit' : 'onMiss', { crit: r.crit, mode: r.mode, half: false, hit: r.hit, weapon: step.kind === 'weapon', ...(r.cut ? { cut: r.cut } : {}) });
  }
  if (kind === 'save') {
    const dc = step.dc ?? f.src.dc;
    if (dc === undefined) return handOver(`${f.src.name} calls for a ${step.save.toUpperCase()} save with no DC entered. The DM applies it.`);
    kit.renew?.(s, e, t);                                               // making an enemy save keeps a Rage going
    // Careful Spell: a creature its caster protects succeeds, and takes nothing where it would take half.
    // `sure`: creatures that succeed on this effect's saves without rolling (Contact Patron: its caster).
    if (f.src.sure?.includes(t.id)) {
      ev.push({ type: 'save', id: t.id, abil: step.save, dc, success: true, sure: true, ...srcOf(s, f.actor, f.src?.fx) });
      return step.half ? branch('onFail', { half: true }) : branch('onSuccess', { half: false });
    }
    if (f.src.careful?.includes(t.id)) {
      ev.push({ type: 'save', id: t.id, abil: step.save, dc, success: true, careful: true, ...srcOf(s, f.actor, f.src?.fx) });
      return step.half ? undefined : branch('onSuccess', { half: false });
    }
    // The conditions a failure would bring, for a modifier on saves to avoid one (Protection from Poison).
    const about = (step.onFail ?? []).filter((x) => 'condition' in x).map((x) => x.condition);
    // Advantage the step itself gives in a situation (Charm Monster: "if you or your allies are fighting it").
    let adv = null;
    if (step.advantageIf) {
      const holds = step.advantageIf.map((tag) => kit.judge(tag, { attacker: e, target: t }, s));
      if (holds.includes(null)) handOver(`${t.name} may have Advantage on this save against ${f.src.name} ("${step.advantageIf.join('", "')}"), which the engine cannot judge. The DM decides.`);
      else if (holds.every(Boolean)) adv = 'fighting the caster\'s side';
    }
    let { used, ...sv } = kit.savingThrow(s, t, step.save, dc, null, f.src.origin ?? e, f.src.heightened === t.id ? 'Heightened Spell' : null, adv, ev, about);      // cover is judged from where the effect starts
    ev.push({ type: 'save', id: t.id, abil: step.save, dc, ...sv, ...srcOf(s, f.actor, f.src?.fx) });
    useUp(s, ev, used ?? []);                                            // a single-use modifier the save took ends now, after it
    // A failed save against Charmed or Frightened may be rolled again (Countercharm).
    if (!sv.success && kit.rerollSave) {
      const again = kit.rerollSave(s, t, step.save, dc, step.onFail, f.src.origin ?? e, ev);
      if (again) { const { used: u2, ...sv2 } = again; sv = sv2; ev.push({ type: 'save', id: t.id, abil: step.save, dc, ...sv, reroll: true, ...srcOf(s, f.actor, f.src?.fx) }); useUp(s, ev, u2 ?? []); }
    }

    // Evasion: a Dexterity save for half damage does none on a success and half on a failure (the
    // failure's other effects still happen).
    const evade = step.save === 'dex' && step.half && step.onFail && kit.evades?.(t);
    if (evade) ev.push({ type: 'note', id: t.id, text: sv.success ? 'Evasion: no damage' : 'Evasion: half damage' });
    if (!sv.success) return branch('onFail', { half: false, ...(evade ? { evade: true } : {}) });
    if (evade) return;
    if (step.half && step.onFail) return branch('onFail', { half: true });      // same effect, half the damage
    return branch('onSuccess', { half: false });
  }
  if (kind === 'damage') {
    // Damage steps that follow one another land together: a hit's slashing and its fire are one
    // instance of damage (one death-save failure, one Concentration save). A later step whose
    // `when` cannot be judged is left to run on its own, which hands it to the DM.
    // A shared roll from before faces were kept is a bare number.
    // `src.max`: dice at their highest (Overchannel). `src.empower`: a number added to one damage roll,
    // the step at `path` (and with `n`, only for that target: one ray of several), once (Empowered
    // Evocation); a shared roll had it added when it was rolled (engine/casting.js).
    const amount = (st, path) => { let r0 = f.shared?.[path];
      if (r0 === undefined) {
        r0 = rollDamage(s, st, !!f.crit, !!f.src.max);
        const emp = f.src.empower;
        if (emp && !emp.done && emp.path === path && (emp.n === undefined || emp.n === f.n)) { emp.done = true; r0 = { ...r0, total: r0.total + emp.add, bonus: r0.bonus + emp.add }; ev.push({ type: 'note', id: f.actor, text: `${emp.name}: +${emp.add} damage` }); }
      }
      const r = typeof r0 === 'number' ? { total: r0 } : r0;
      f.rolled = r.total;                                        // `{ rolled: true }` (below): the number this roll made, before a save halves it or a Resistance cuts it
      return { amount: f.half || f.evade ? Math.floor(r.total / 2) : r.total, ...(r.dice ? { dice: r.dice, bonus: r.bonus } : {}), by: f.actor ?? null }; };
    const holds = (st) => { let r = true; for (const tag of st.when ?? []) { const ok = kit.judge(tag, { attacker: e, target: t, mode: f.mode }, s); if (ok === null) return null; if (!ok) r = false; } return r; };
    const parts = [{ ...amount(step, at), type: step.type }], landed = [[step, at]];
    while (f.i < f.steps.length && stepKind(f.steps[f.i]) === 'damage') {
      const next = f.steps[f.i], ok = holds(next);
      if (ok === null) break;
      if (ok) { parts.push({ ...amount(next, `${f.path}${f.i}`), type: next.type }); landed.push([next, `${f.path}${f.i}`]); }
      f.i++;
    }
    // A spell a reaction blocks does it no damage (Shield against Magic Missile).
    if (f.src.blocked?.includes(t.id)) return;
    const cut = f.cut;
    if (cut?.less !== undefined) delete f.cut;                             // a reduction is taken off the attack's damage once
    const wasUp = !t.dead && t.hp > 0, wasAlive = !t.dead;
    kit.damage(s, t, kit.dealt(s, e, t, parts, { hit: !!f.hit, weapon: !!f.weapon, cantrip: !!f.src.cantrip, ...(f.src.spell ? { spellId: f.src.spell } : {}) }, !!f.crit), null, ev, { crit: !!f.crit, ...(cut ? { cut } : {}) });
    // What this damage does to a creature it brought to 0 Hit Points (`onZero`) or killed
    // (`onKill`), whatever the save did to the amount. The stack runs the last pushed first.
    for (const [name, now] of [['onKill', wasAlive && t.dead], ['onZero', wasUp && t.hp <= 0]]) {
      if (!now) continue;
      for (const [st, path] of landed) if (st[name]) s.stack.push({ kind: 'seq', steps: st[name], path: `${path}.${name}.`, i: 0, actor: f.actor, target: f.target, src: f.src, shared: f.shared, told: f.told, half: false });
    }
    return;
  }
  // The spell that set this reaction off fails (Counterspell). Only a reaction to a spell being
  // cast has one to stop (engine/resolve.js, castReaction marks its source `counters`).
  if (kind === 'counter') {
    if (!f.src.counters) return handOver(`${f.src.name} would stop a spell, but no spell is being cast for the engine to stop. The DM applies it.`);
    f.src.countered = true;
    return;
  }
  if (f.half) return;                                                 // a successful save halves damage and skips the rest
  // Creatures made in the spaces the cast named, bound to the caster (docs/specs/companions.md, Decision 2).
  // The spell is aimed at its caster, so the target is the caster; the cast checked every choice and space.
  if (kind === 'summon') return kit.summon ? kit.summon(s, t, step, f.src, ev) : handOver(`${f.src.name} summons a creature, which the engine cannot make here. The DM adds it.`);
  // Teleport the target (the caster) to the place the cast named, checked when it was cast.
  if (kind === 'teleport') {
    if (!f.src.to) return handOver(`${f.src.name} names no destination, so the engine cannot teleport ${t.name}. The DM moves it, up to ${step.teleport} ft${step.see ? ' to a space it can see' : ''}.`);
    if (!kit.teleport(s, t, step, f.src.to, ev)) branch('blocked');
    return;
  }
  if (kind === 'heal' || kind === 'tempHp') {
    // `src.maxTemp`: Temporary Hit Point dice at their highest, none rolled (Fiendish Vigor).
    spend('dice', diceIn(step[kind]));
    const r = kind === 'tempHp' && f.src.maxTemp ? maxRoll(step[kind], false) : roll(s, step[kind]), add = step.addMod ? f.src.healMod : 0, rolled = { dice: r.dice, bonus: r.bonus + add, by: f.actor ?? null };
    const n = Math.max(step.atLeast ?? -Infinity, r.total + add);      // "minimum of 1 Hit Point regained"
    return kind === 'heal' ? kit.heal(s, t, n, ev, rolled, f) : kit.tempHp(s, t, n, ev, f, rolled);
  }
  if (kind === 'condition') {
    // A creature's hold (docs/specs/grapple-shove.md, Decision 7): Grappled with an escape DC is a hold the engine keeps (`grip`);
    // another condition of the same action with `whileHeld` goes on only if the grappler holds the target, and ends with that hold.
    if (step.escape !== undefined && step.condition === 'grappled') return kit.hold(s, e, t, f.src, step, ev);
    if (step.whileHeld) return kit.heldCondition(s, e, t, step, f, ev);
    // `largest` ("if the target is a Medium or smaller creature, it has the Prone condition"): a bigger target is passed over and the
    // table is told (docs/specs/grapple-shove.md, the amendment of #495). A hold's own `largest` is read in `hold` above and says nothing.
    if (tooBig(t, step)) return ev.push({ type: 'note', id: t.id, actor: f.actor, text: `${t.name} is bigger than ${cap(step.largest)}, so ${f.src.name} does not give it the ${cap(step.condition)} condition` });
    return kit.condition(s, t, step.condition, ev, f, step);
  }
  if (kind === 'cure') return kit.cure(s, t, step.cure, ev);
  if (kind === 'stabilize') return kit.stabilise(s, t, ev, f);
  if (kind === 'sense') return kit.sense(s, t, step, f, ev);
  if (kind === 'dispel') return kit.dispel(s, t, step, ev, f);
  if (kind === 'revive') return kit.revive(s, t, step, ev, f);
  if (kind === 'endSpell') return kit.endSpell(s, f, ev);
  if (kind === 'arm') return kit.arm(s, t, step, f, ev) || handOver(`${f.src.name} gives ${t.name} an attack for as long as it lasts, which the engine has no lasting effect to hang on (or no spell attack bonus to give it). The DM resolves the attack: a melee spell attack for ${step.arm.damage}${step.arm.addMod ? ' plus the spellcasting modifier' : ''} ${step.arm.type} damage.`);
  if (kind === 'confuse') return kit.confuse(s, t, step, f, ev) || handOver(`${f.src.name} confuses ${t.name}, which the engine has no lasting effect to hang on. The DM runs it: no Bonus Actions or Reactions, and a d10 for its behaviour at the start of each of its turns.`);
  if (kind === 'command') return kit.command(s, t, step, f, ev) || handOver(`${f.src.name} gives ${t.name} a command for its next turn, which the engine has no lasting effect to hang on. The DM applies it: ${step.command}.`);
  if (kind === 'ward') return kit.ward(s, t, step, f, ev) || handOver(`${f.src.name} wards ${t.name}, which the engine has no lasting effect or save DC to hang on. The DM runs it: a creature that targets the warded creature with an attack roll or a damaging spell makes a ${step.ward.toUpperCase()} save or loses it.`);
  if (kind === 'eachTurn') return kit.eachTurn(s, t, step, f, ev) || handOver(`${f.src.name} does something at the start of each of the creature's turns, but it has no lasting effect for the engine to hang that on. The DM applies it on each turn.`);
  if (kind === 'light') return kit.shine(s, t, step, ev, f) || handOver(`${f.src.name} makes a light, but there is no lasting effect for the engine to hang it on. The DM hands it out with setLight and puts it out.`);
  if (kind === 'kill') return kit.kill(s, t, ev);
  if (kind === 'endConcentration') return kit.breakConcentration(s, ev, t.id, `${t.name} lost Concentration to ${f.src.name}`);
  if (kind === 'remains') {
    if (!t.dead) return handOver(`${t.name} is not dead, so ${f.src.name} leaves no remains of it. The DM applies the rest.`);
    t.remains = step.remains;
    return ev.push({ type: 'remains', id: t.id, remains: step.remains });
  }
  if (kind === 'modifier') {
    // `value: { rolled: true }` (addition F of docs/specs/homebrew-subclasses.md): the number the damage step just before rolled, taken as it is, so the
    // modifier put on is a plain number from here on. The gate (schema.js `rolledIn`) and `feature` (before it pays) see that a damage step comes before it.
    if (step.modifier?.value && typeof step.modifier.value === 'object' && 'rolled' in step.modifier.value) {
      if (!Number.isFinite(f.rolled)) return handOver(`${f.src.name} adds the number its damage rolled, but no damage was rolled before this step, so the engine does not know the number. The DM applies it.`);
      if (kit.modifier(s, t, { ...step.modifier, value: f.rolled }, ev, f, step)) return;
    } else if (kit.modifier(s, t, step.modifier, ev, f, step)) return;
    const bound = f.src.fx && effectsOf(s).find((x) => x.id === f.src.fx)?.bound;
    return handOver(bound
      ? `${f.src.name} changes a number, but nothing in it says when that ends, and the engine keeps only what ends by itself. The DM applies it and ends it.`
      : `${f.src.name} changes a number for a while, but it has no duration for the engine to hang that on. The DM applies it.`);
  }
  if (kind === 'imbue') return kit.imbue(s, t, step, f, ev) || handOver(`${f.src.name} changes what a weapon does for a while, but no weapon of ${t.name}'s was named for it (or it has no lasting effect to hang that on). The DM applies it.`);
  if (kind === 'fall') return kit.fall(s, t, step.fall, ev);
  // `largest`: only a creature of that size or smaller is moved (Repelling Blast: Large).
  if (kind === 'move') {
    if (tooBig(t, step)) return ev.push({ type: 'note', id: t.id, actor: f.actor, text: `${t.name} is bigger than ${cap(step.largest)}, so ${f.src.name} does not ${step.dir === 'toward' ? 'pull' : 'push'} it` });
    return kit.push(s, t, step.move, step.dir, e.pos, ev);
  }
  if (kind === 'set' || kind === 'reveal') {
    if (kind === 'reveal' && step.reveal === 'target') return kit.reveal(s, t, ev);
    if (kit.objectStep(s, f.src.object, kind === 'set' ? step.of ?? 'self' : step.reveal, kind === 'set' ? step.set : null, ev)) return;
    return handOver(`Part of ${f.src.name} works something on the map, but the engine found nothing for it to work. The DM applies it.`);
  }
  handOver(`The engine cannot apply this part of ${f.src.name} yet (${kind}). The DM applies it.`);
}
