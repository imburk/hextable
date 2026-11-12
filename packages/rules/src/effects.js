// Effect steps: how a spell (and later a monster action, feature or item) does what it does.
//
// Content describes an effect as a list of steps from a closed vocabulary (content/schema.js).
// This file runs such a list. It knows nothing about any particular spell.
//
// Resolution is a stack of frames kept in the game state (state.stack), not a chain of
// function calls. Every loop counter and every "which branch am I in" lives in a frame as
// plain data. Nothing pauses yet, so the stack is always empty again when apply() returns,
// but because nothing is held in a JavaScript call stack, a later change can stop between two
// steps to ask a player something, save or send the state, and carry on from the same place.
// Design: docs/specs/rules-expansion.md, decisions 2 and 4.
import { STEPS } from './content/schema.js';
import { roll } from './rng.js';

const BRANCHES = ['onHit', 'onMiss', 'onFail', 'onSuccess'];
export const stepKind = (step) => STEPS.find((k) => k in step);
// Area shapes the engine can lay out on hexes (engine.js, layout()).
export const AREAS = ['cone', 'sphere', 'cylinder', 'emanation', 'line', 'cube'];
// Can the engine aim this area? A sphere or cylinder needs somewhere within range to go off
// (`range`: the spell's range in feet, or an action's `area.range`); a Line with a range is a
// wall placed at a distance, which the DM places.
export function aimable(area, range) {
  if (!AREAS.includes(area.shape) || area.count > 1) return false;     // several shapes arranged by the caster: the DM
  if (area.shape === 'sphere' || area.shape === 'cylinder') return range > 0;
  if (area.shape === 'line') return !(range > 0);
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
      const st = first(key), sum = st && addDice(st[key], bySlot[key], up);
      if (sum) st[key] = sum; else unscaled = `the extra ${bySlot[key]} per slot level above ${def.level}`;
    }
    if (bySlot.times) { const st = first('damage'); if (st) st.times = (st.times || 1) + bySlot.times * up; }
  }
  return { steps, unscaled };
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
  if (kind === 'modifier') {
    const m = step.modifier, what = m.on === 'ac' ? 'AC' : m.on;
    const text = m.op === 'add' && typeof m.value === 'number' ? `${m.value > 0 ? '+' : ''}${m.value} ${what}`
      : m.op === 'add' && typeof m.value === 'string' ? `${m.value.startsWith('-') ? '' : '+'}${m.value} ${what}` : `${m.op} on ${what}`;
    return { short: text, long: `${text} for ${def.duration}${def.concentration ? ', Concentration' : ''}` };
  }
  return { short: 'DM applies', long: 'The DM applies the effect' };
}

// Conditions the SRD treats as a benefit to whoever has them: putting one on a creature is not hostile.
export const BENEFICIAL_CONDITIONS = ['invisible'];

// Everything the engine and the UI need to know about a spell, worked out once from its data.
export function spellProfile(def) {
  let harmful = false, heals = false, healStep = null;
  walk(def.effects, (st) => {
    const k = stepKind(st);
    if (k === 'attack' || k === 'save' || k === 'damage' || k === 'fall' || (k === 'condition' && !BENEFICIAL_CONDITIONS.includes(st.condition))) harmful = true;
    if (k === 'heal') { heals = true; healStep ??= st; }
  });
  const t = def.target;
  // A spell's sphere or cylinder goes off within its range (a Self one, on the caster's own hex).
  const within = t.area && ['sphere', 'cylinder'].includes(t.area.shape) ? Math.max(1, feet(def.range)) : feet(def.range);
  const aim = t.self ? 'self' : t.area ? (aimable(t.area, within) ? 'area' : 'none') : 'creature';
  return {
    id: def.id, name: def.name, level: def.level, time: def.time, range: feet(def.range),
    aim,                                           // 'creature' | 'area' | 'self' | 'none' (nothing the engine can aim)
    ...(aim === 'area' ? { area: { ...t.area } } : {}),
    ...(aim === 'creature' ? { count: t.creature.count ?? 1, ...(t.creature.repeat ? { repeat: true } : {}), ...(t.creature.within ? { within: t.creature.within } : {}) } : {}),
    harmful, heals: heals && !harmful,
    heal: healStep ? { dice: healStep.heal, addMod: !!healStep.addMod } : null,
    turn: def.time === 'action' || def.time === 'bonus',   // can be cast on a turn in a fight
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

// ---------- running steps ----------

const rollDamage = (s, step, crit) => {
  let total = 0;
  for (let i = 0; i < (step.times || 1); i++) total += roll(s, step.damage, { crit }).total;
  return total;
};

// In an area, damage is rolled once and shared by everyone caught in it. Returns
// { path: total } for every damage step that is not under an attack roll.
export function sharedRolls(s, steps) {
  const shared = {};
  walk(steps, (step, at, inAttack) => { if ('damage' in step && !inAttack) shared[at] = rollDamage(s, step, false); });
  return shared;
}

// Begin resolving `steps` from `actor` against each of `targets` in turn. `src` is
// { name, dc, attack, healMod } for events and rolls; `shared` comes from sharedRolls().
export function begin(s, { steps, actor, targets, src, shared = null }) {
  (s.stack ??= []).push(targets === null
    ? { kind: 'seq', steps, path: '', i: 0, actor, target: null, src, shared }       // nothing to aim at: the DM applies it
    : { kind: 'each', steps, t: 0, actor, targets, src, shared });
}

// Run until the stack is empty. `kit` is the engine's own machinery: rollToHit, savingThrow,
// damage, heal, condition, judge. Passing it in keeps this file free of the engine's internals.
export function run(s, ev, kit) {
  const stack = s.stack ?? [];
  while (stack.length) {
    const f = stack.at(-1);
    if (f.kind === 'each') {
      if (f.t >= f.targets.length) { stack.pop(); continue; }
      // `told` is shared by the targets of one effect, so a manual step's text is shown once, not once per target.
      stack.push({ kind: 'seq', steps: f.steps, path: '', i: 0, actor: f.actor, target: f.targets[f.t++], src: f.src, shared: f.shared, told: (f.told ??= {}) });
      continue;
    }
    if (f.i >= f.steps.length) { stack.pop(); continue; }
    const index = f.i++;
    exec(s, ev, kit, f, f.steps[index], `${f.path}${index}`);
  }
  delete s.stack;
}

function exec(s, ev, kit, f, step, at) {
  const t = f.target === null ? null : s.entities[f.target];
  const kind = stepKind(step);
  const handOver = (text) => ev.push({ type: 'manual', actor: f.actor, name: f.src.name, text });
  const branch = (name, extra = {}) => {
    if (step[name]) s.stack.push({ kind: 'seq', steps: step[name], path: `${at}.${name}.`, i: 0, actor: f.actor, target: f.target, src: f.src, shared: f.shared,
      crit: f.crit, mode: f.mode, half: f.half, told: f.told, ...extra });
  };

  if (kind === 'manual') {
    if (f.told) { if (f.told[at]) return; f.told[at] = true; }
    return handOver(step.manual);
  }
  // The source is a creature, or a thing on the map (a trap), for which the engine lends a stand-in.
  const e = f.actor === null ? kit.objectActor(s, f.src.object) : s.entities[f.actor];
  if (!e || (f.target !== null && !t)) return;                       // someone left the table mid-effect
  if (t === null) return handOver(`The engine has nobody to apply this part of ${f.src.name} to. The DM applies it.`);
  for (const tag of step.when ?? []) {
    const ok = kit.judge(tag, { attacker: e, target: t, mode: f.mode }, s);
    if (ok === null) return handOver(`Part of ${f.src.name} depends on "${tag}", which the engine cannot judge yet. The DM applies it if it holds.`);
    if (!ok) return;
  }

  if (kind === 'attack') {
    const atk = step.kind === 'spell'
      ? { name: f.src.name, type: step.attack, spell: true, bonus: f.src.attack, ...(step.attack === 'melee' ? { reach: 5 } : { range: [f.src.range, f.src.range] }) }
      : { name: f.src.name, type: step.attack, bonus: step.bonus, ...(step.attack === 'melee' ? { reach: f.src.reach ?? 5 } : { range: f.src.rangeBand ?? [f.src.range, f.src.range] }) };
    const r = kit.rollToHit(s, e, t, atk, ev, f.src.tag ?? {});         // `tag` marks the attack event, as an Opportunity Attack for one
    return branch(r.hit ? 'onHit' : 'onMiss', { crit: r.crit, mode: r.mode, half: false });
  }
  if (kind === 'save') {
    const dc = step.dc ?? f.src.dc;
    if (dc === undefined) return handOver(`${f.src.name} calls for a ${step.save.toUpperCase()} save with no DC entered. The DM applies it.`);
    const sv = kit.savingThrow(s, t, step.save, dc, null, f.src.origin ?? e);      // cover is judged from where the effect starts
    ev.push({ type: 'save', id: t.id, abil: step.save, dc, ...sv });
    if (!sv.success) return branch('onFail', { half: false });
    if (step.half && step.onFail) return branch('onFail', { half: true });      // same effect, half the damage
    return branch('onSuccess', { half: false });
  }
  if (kind === 'damage') {
    // Damage steps that follow one another land together: a hit's slashing and its fire are one
    // instance of damage (one death-save failure, one Concentration save). A later step whose
    // `when` cannot be judged is left to run on its own, which hands it to the DM.
    const amount = (st, path) => { const n = f.shared?.[path] ?? rollDamage(s, st, !!f.crit); return f.half ? Math.floor(n / 2) : n; };
    const holds = (st) => { let r = true; for (const tag of st.when ?? []) { const ok = kit.judge(tag, { attacker: e, target: t, mode: f.mode }, s); if (ok === null) return null; if (!ok) r = false; } return r; };
    const parts = [{ amount: amount(step, at), type: step.type }];
    while (f.i < f.steps.length && stepKind(f.steps[f.i]) === 'damage') {
      const next = f.steps[f.i], ok = holds(next);
      if (ok === null) break;
      if (ok) parts.push({ amount: amount(next, `${f.path}${f.i}`), type: next.type });
      f.i++;
    }
    return kit.damage(s, t, parts, null, ev, { crit: !!f.crit });
  }
  if (f.half) return;                                                 // a successful save halves damage and skips the rest
  if (kind === 'heal') return kit.heal(s, t, roll(s, step.heal).total + (step.addMod ? f.src.healMod : 0), ev);
  if (kind === 'tempHp') return kit.tempHp(s, t, roll(s, step.tempHp).total + (step.addMod ? f.src.healMod : 0), ev, f);
  if (kind === 'condition') return kit.condition(s, t, step.condition, ev, f, step);
  if (kind === 'modifier') {
    if (kit.modifier(s, t, step.modifier, ev, f)) return;
    return handOver(`${f.src.name} changes a number for a while, but it has no duration for the engine to hang that on. The DM applies it.`);
  }
  if (kind === 'fall') return kit.fall(s, t, step.fall, ev);
  if (kind === 'move') return kit.push(s, t, step.move, step.dir, e.pos, ev);
  if (kind === 'set' || kind === 'reveal') {
    if (kind === 'reveal' && step.reveal === 'target') return kit.reveal(s, t, ev);
    if (kit.objectStep(s, f.src.object, kind === 'set' ? step.of ?? 'self' : step.reveal, kind === 'set' ? step.set : null, ev)) return;
    return handOver(`Part of ${f.src.name} works something on the map, but the engine found nothing for it to work. The DM applies it.`);
  }
  handOver(`The engine cannot apply this part of ${f.src.name} yet (${kind}). The DM applies it.`);
}
