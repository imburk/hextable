// Rules engine. Pure game logic: no rendering, no network, no clock but the in-world one.
//
//   apply(state, action, ctx) -> { ok, error?, events }
//
// Everything that happens in the game goes through apply(). The engine validates the
// action against the rules, mutates state, and returns events. Renderers turn events
// into numbers or animations; the server broadcasts them; the timeline records them;
// an AI DM or AI character is just another caller of apply().
import * as H from './hex.js';
import { die, roll } from './rng.js';
import { CONTENT, SPELLS, TILES, MONSTERS } from './content/index.js';
import { begin, run, scaleSteps, sharedRolls } from './effects.js';
import { breakConcentration, concentrationCheck, concentrationLost, effectsOf, endEffect, fightOver, ROUND, roundStarted, startEffect, tick, turnEnded, turnStarted } from './durations.js';
import { FT, STEP_FREE, STEP_MAX, ground, hasColumn, landing, surfaces } from './space.js';
import { EDITS, lintMap } from './map.js';
import { barriers, center, distToSegment, objectDef, objectSegment } from './walls.js';
import { conditionDef, conditionName, conditionPhrase, incapacitated, incapacitatedBy, judge, modifiers, speedOf } from './modifiers.js';

export { FT };                       // feet per hex
export const ARENA_RADIUS = 6;       // hexes locked around the start of a fight
export const ENGAGE_RANGE = 2;       // walking this close to a hostile starts the fight
export const EXPLORE_BUDGET = 300;   // feet per tap while free roaming
export const mod = (score) => Math.floor((score - 10) / 2);

class RuleError extends Error {}
const fail = (msg) => { throw new RuleError(msg); };

export const up = (e) => !e.dead && e.hp > 0;
export const hostile = (a, b) => a.side !== b.side;
export const living = (s) => Object.values(s.entities).filter((e) => !e.dead);
export const inFight = (s, id) => !!s.encounter && s.encounter.order.some((o) => o.id === id);
export const current = (s) => (s.encounter ? s.encounter.order[s.encounter.turn]?.id ?? null : null);
export const spellStats = (e) => {
  const m = e.prof + mod(e.abil[e.castAbil] ?? 10);
  return { attack: m, dc: 8 + m };
};
const ent = (s, id) => s.entities[id] || fail('No such creature.');
const control = (e, ctx) =>
  ctx.role === 'dm' || (e.owner && e.owner === ctx.userId) || fail(`${e.name} isn't yours to control.`);
const fighters = (s) => (s.encounter ? s.encounter.order.map((o) => s.entities[o.id]).filter(Boolean) : []);
const ft = (hexes) => `${hexes * FT} ft`;

export function makeEntity(tpl, over = {}) {
  const t = structuredClone(tpl);
  if (over.pos && over.pos.z === undefined) over = { ...over, pos: { ...over.pos, z: 0 } };
  return {
    kind: 'npc', side: 'foe', owner: null, level: 0, saveProf: [], features: {}, attacks: [], spells: [],
    slots: {}, resist: [], vuln: [], immune: [], gear: [], ...t,
    maxHp: t.hp, slotsMax: { ...(t.slots || {}) }, uses: { secondWind: t.features?.secondWind || 0 },
    cond: {}, death: { s: 0, f: 0 }, dead: false, reactionUsed: false, ...over,
  };
}

// ---------- movement ----------

function occupancy(s) {
  const occ = new Map();
  for (const e of living(s)) { const k = H.key(e.pos); occ.set(k, [...(occ.get(k) || []), e]); }
  return occ;
}

// Map of hex key -> {cost, prev, canStop} that this creature can move to right now.
export function moveOptions(s, e) {
  if (!e || !up(e) || speedOf(s, e) === 0) return new Map();
  const enc = s.encounter, fighting = inFight(s, e.id);
  if (fighting && current(s) !== e.id) return new Map();
  const occ = occupancy(s), B = barriers(s.map);
  // One step: onto a surface in a neighbouring column, if the rise or drop can be walked.
  const reach = H.reachable(e.pos, fighting ? enc.budget.move : EXPLORE_BUDGET, (from) => {
    const out = [], here = ground(s.map, from)?.level;
    for (const n of H.neighbors(from)) {
      if (fighting && !enc.arena[H.col(n)]) continue;                     // the arena is locked
      for (const sf of surfaces(s.map, n)) {
        const rise = Math.abs(sf.z - from.z), terrain = TILES[sf.tile.t].cost;
        if (rise > STEP_MAX || terrain === Infinity || B.solid(sf.level.id, n)) continue;
        if (here && (B.blocked(here.id, from, n) || (sf.level !== here && B.blocked(sf.level.id, from, n)))) continue;   // a wall or a shut door
        const h = { q: n.q, r: n.r, z: sf.z };
        if ((occ.get(H.key(h)) || []).some((o) => hostile(o, e) && up(o))) continue;
        out.push({ h, cost: Math.max(terrain, rise > STEP_FREE ? 2 : 1) * FT });   // Difficult Terrain does not stack
      }
    }
    return out;
  });
  const here = H.key(e.pos);
  for (const [k, v] of reach) v.canStop = k !== here && !(occ.get(k) || []).some((o) => o.id !== e.id);
  return reach;
}

function threatsAt(s, e, pos) {
  return fighters(s).filter((o) =>
    o.id !== e.id && up(o) && hostile(o, e) && !o.reactionUsed && !incapacitated(o) &&
    o.attacks.some((a) => a.type === 'melee') && H.dist(o.pos, pos) <= 1 && clear(s, o.pos, pos));
}

// Is there nothing solid between two positions? A wall or a shut door stops attacks, spells and
// notice. This is the straight line between hex centres; cover and light come with the sight spec.
export function clear(s, a, b) {
  if (H.col(a) === H.col(b)) return true;
  const B = barriers(s.map), la = ground(s.map, a)?.level, lb = ground(s.map, b)?.level;
  return !((la && B.blocked(la.id, a, b, 'both')) || (lb && lb !== la && B.blocked(lb.id, a, b, 'both')));
}
const walled = (s, e, t) => clear(s, e.pos, t.pos) || fail(`There is a wall between ${e.name} and ${t.name}.`);

// ---------- objects ----------
const objectOf = (s, id) => s.map.objects.find((o) => o.id === id) || fail('No such object.');
export const objectName = (o) => o.name ?? objectDef(o).name;
// Close enough to use it: beside a door's line, or on or next to a thing's hex, on its level.
function nearObject(s, e, o) {
  const level = s.map.levels.find((l) => l.id === o.level), z = level.z + (level.tiles[H.col(o.at)]?.h ?? 0);
  if (!ground(s.map, e.pos) || Math.abs(e.pos.z - z) > STEP_MAX) return false;
  const seg = objectSegment(o);
  return seg ? distToSegment(center(e.pos), seg) <= FT + 1e-9 : H.dist(e.pos, o.at) <= 1;     // within 5 ft
}
const hasKey = (e, key) => e.gear.some((g) => String(g).toLowerCase() === key.toLowerCase());
function setObject(s, o, state, ev, by = null, verb = null) {
  const def = objectDef(o);
  if (!objectSegment(o) && def.states[state].blocks.includes('move')) {
    const level = s.map.levels.find((l) => l.id === o.level), z = level.z + (level.tiles[H.col(o.at)]?.h ?? 0);
    !living(s).some((c) => H.col(c.pos) === H.col(o.at) && c.pos.z === z) || fail(`Someone is standing where the ${objectName(o).toLowerCase()} would be.`);
  }
  o.state = state;
  ev.push({ type: 'object', object: o.id, name: objectName(o), state, stateName: def.states[state].name, ...(by ? { actor: by.id } : {}), ...(verb ? { verb } : {}) });
}
// What this creature could do right now with the objects in reach: [{ object, name, verb, label, time, why }].
export function usesFor(s, e) {
  const out = [];
  if (!e || !up(e)) return out;
  for (const o of s.map.objects) {
    if (!nearObject(s, e, o)) continue;
    for (const u of objectDef(o).use) {
      if (!u.from.includes(o.state) || (u.key && !o.key)) continue;         // a door with no lock offers no locking
      let why = '';
      const stopped = incapacitatedBy(e);
      if (stopped) why = `${e.name} is ${stopped} and can't act.`;
      else if (s.encounter && inFight(s, e.id)) {
        if (current(s) !== e.id) why = `It isn't ${e.name}'s turn.`;
        else if (!(u.time === 'free' && !s.encounter.flags.interact) && s.encounter.budget.action < 1) why = `${e.name} has already used an action this turn.`;
      }
      if (!why && u.key && !hasKey(e, o.key)) why = `${e.name} doesn't have the key.`;
      out.push({ object: o.id, name: objectName(o), verb: u.id, label: u.name, time: u.time, why });
    }
  }
  return out;
}


// ---------- hidden creatures ----------
// `hidden` is a DM switch: players are not told the creature exists (see view.js). The engine's
// part is to lift it the moment the party would find out for themselves.
function reveal(s, e, ev) {
  if (!e.hidden) return;
  delete e.hidden;
  ev.push({ type: 'revealed', id: e.id });
}

// ---------- encounters ----------

const initiativeSort = (order) => order.sort((a, b) => b.init - a.init || b.dex - a.dex);
function rollInit(s, e) {
  const m = modifiers(s, e, 'initiative'), two = (m.advantage.length > 0) !== (m.disadvantage.length > 0);
  const r1 = die(s, 20), r2 = two ? die(s, 20) : null;
  const d = !two ? r1 : m.advantage.length ? Math.max(r1, r2) : Math.min(r1, r2);
  return { id: e.id, init: d + mod(e.abil.dex) + m.add, dex: e.abil.dex };
}

function startEncounter(s, center, ev, radius = ARENA_RADIUS) {
  const arena = {};
  for (const h of H.range(center, radius)) if (hasColumn(s.map, h)) arena[H.col(h)] = 1;    // a fight locks whole columns, every level
  const who = living(s).filter((e) => arena[H.col(e.pos)]);
  if (!who.length) fail('Nobody is close enough to fight here.');
  for (const e of who) { e.reactionUsed = false; reveal(s, e, ev); }   // nobody fights unseen
  s.encounter = {
    id: ++s.seq, center, radius, arena, round: 1, turn: -1, budget: null, flags: {},
    order: initiativeSort(who.map((e) => rollInit(s, e))),
  };
  ev.push({ type: 'encounterStart', center, radius, order: s.encounter.order.map((o) => ({ ...o })) });
  advanceTurn(s, ev);
}

// Start a fight big enough to hold both the attacker and a distant target.
function engage(s, e, t, ev) {
  const a = H.toWorld(e.pos), b = H.toWorld(t.pos), d = H.dist(e.pos, t.pos);
  startEncounter(s, H.fromWorld((a.x + b.x) / 2, (a.z + b.z) / 2), ev, Math.max(ARENA_RADIUS, Math.ceil(d / 2) + 1));
}

function joinEncounter(s, e, ev) {
  const enc = s.encounter, cur = current(s);
  reveal(s, e, ev);
  e.reactionUsed = false;
  const slot = rollInit(s, e);
  enc.order.push(slot);
  initiativeSort(enc.order);
  enc.turn = enc.order.findIndex((o) => o.id === cur);
  ev.push({ type: 'joined', id: e.id, init: slot.init });
}

function endEncounter(s, ev, result) {
  for (const e of fighters(s)) {
    delete e.cond.dodging; delete e.cond.disengaged; e.reactionUsed = false;
    if (up(e)) delete e.cond.prone;                       // nothing stops you standing once the fight is over
  }
  ev.push({ type: 'encounterEnd', result, rounds: s.encounter.round });
  fightOver(s, ev);
  s.encounter = null;
}

function checkEnd(s, ev) {
  if (!s.encounter) return;
  const f = fighters(s);
  const foes = f.some((e) => e.side === 'foe' && up(e)), party = f.some((e) => e.side === 'party' && up(e));
  if (!foes || !party) endEncounter(s, ev, !foes ? 'victory' : 'defeat');
}

function deathSave(s, e, ev) {
  const d = die(s, 20);
  if (d === 20) { e.hp = 1; delete e.cond.unconscious; e.death = { s: 0, f: 0 }; }
  else if (d === 1) e.death.f += 2;
  else if (d >= 10) e.death.s++;
  else e.death.f++;
  if (e.death.f >= 3) e.dead = true;
  else if (e.death.s >= 3) e.cond.stable = {};
  ev.push({ type: 'deathSave', id: e.id, roll: d, s: e.death.s, f: e.death.f, dead: e.dead, stable: !!e.cond.stable, hp: e.hp });
}

function advanceTurn(s, ev) {
  const enc = s.encounter;
  for (let guard = 0; guard < enc.order.length * 2 + 2; guard++) {
    enc.turn++;
    if (enc.turn >= enc.order.length) { enc.turn = 0; enc.round++; s.clock += ROUND; roundStarted(s, ev); }
    const e = s.entities[enc.order[enc.turn].id];
    if (!e || e.dead) continue;
    if (e.hp <= 0) {
      if (!e.cond.stable) deathSave(s, e, ev);
      if (e.hp <= 0) continue;
    }
    enc.flags = {};
    turnStarted(s, ev, e, KIT);                                          // what ends "at the start of its turn" ends before it acts
    const speed = speedOf(s, e), can = incapacitated(e) ? 0 : 1;        // an incapacitated creature gets its turn but cannot act
    enc.budget = { move: speed, action: can, bonus: can };
    e.reactionUsed = false;
    delete e.cond.dodging;
    ev.push({ type: 'turn', id: e.id, round: enc.round });
    if (e.cond.prone && speed > 0) {                                     // with a Speed of 0 it stays down
      delete e.cond.prone;
      enc.budget.move -= Math.floor(speed / 2 / FT) * FT;
      ev.push({ type: 'stood', id: e.id });
    }
    return;
  }
  endEncounter(s, ev, 'stalemate');
}

// ---------- damage, healing, attacks ----------

function damage(s, t, amount, dtype, ev, { crit = false } = {}) {
  let n = amount;
  const m = modifiers(s, t, 'damage.taken', { target: t });
  const applies = (fromModifiers, own) => fromModifiers === true || fromModifiers.includes(dtype) || own.includes(dtype);
  if (applies(m.immune, t.immune)) n = 0;
  else if (applies(m.resist, t.resist)) n = Math.floor(n / 2);
  else if (applies(m.vulnerable, t.vuln)) n *= 2;
  const note = n === 0 && amount > 0 ? 'immune' : n < amount ? 'resisted' : n > amount ? 'vulnerable' : undefined;
  if (t.hp <= 0) {                                        // already dying
    if (n > 0) { t.death.f += crit ? 2 : 1; delete t.cond.stable; if (t.death.f >= 3) t.dead = true; }
    ev.push({ type: 'damage', target: t.id, amount: n, dtype, hp: 0, note });
    if (t.dead) ev.push({ type: 'died', id: t.id });
    return;
  }
  const before = t.hp;
  t.hp = Math.max(0, before - n);
  ev.push({ type: 'damage', target: t.id, amount: n, dtype, hp: t.hp, note });
  if (t.hp > 0) return concentrationCheck(s, ev, t, n, KIT);
  if (t.kind === 'pc' && n - before < t.maxHp) {          // otherwise: instant death from massive damage
    t.cond.unconscious = {}; t.cond.prone = {}; t.death = { s: 0, f: 0 };
    ev.push({ type: 'down', id: t.id });
  } else { t.dead = true; ev.push({ type: 'died', id: t.id }); }
  concentrationLost(s, ev, t, `${t.name} went down`);
}

function heal(s, t, amount, ev) {
  if (t.hp <= 0) { delete t.cond.unconscious; delete t.cond.stable; t.death = { s: 0, f: 0 }; }
  t.hp = Math.min(t.maxHp, t.hp + amount);
  ev.push({ type: 'heal', target: t.id, amount, hp: t.hp });
  // In a fight a revived creature stays Prone until its turn, when standing costs half its Speed.
  // Outside one, movement isn't budgeted, so it simply gets up.
  if (t.cond.prone && !inFight(s, t.id)) { delete t.cond.prone; ev.push({ type: 'stood', id: t.id }); }
}

function checkRange(e, t, atk) {
  const d = H.dist(e.pos, t.pos);
  if (atk.type === 'melee') {
    if (d * FT > atk.reach) fail(`${t.name} is ${ft(d)} away. ${atk.name} reaches ${atk.reach} ft.`);
  } else if (d * FT > atk.range[1]) fail(`${t.name} is ${ft(d)} away. ${atk.name} reaches ${atk.range[1]} ft.`);
}

// Advantage and Disadvantage for an attack, with the reasons. Any of each cancels to a normal roll.
// Conditions and traits supply theirs as data (modifiers.js); the two rules written out here
// belong to ranged attacks themselves. Also returns `add` (a bonus or penalty to the roll) and
// `crit` (a hit is critical whatever the die shows).
export function rollMode(s, e, t, atk) {
  const d = H.dist(e.pos, t.pos), ranged = atk.type === 'ranged';
  const sit = { attacker: e, target: t, ranged };
  const theirs = modifiers(s, t, 'attack.received', sit, 'target'), mine = modifiers(s, e, 'attack.roll', sit, 'attacker');
  const adv = [...theirs.advantage, ...mine.advantage], dis = [...theirs.disadvantage, ...mine.disadvantage];
  if (ranged && d * FT > atk.range[0]) dis.push('long range');
  if (ranged && living(s).some((o) => up(o) && hostile(o, e) && H.dist(o.pos, e.pos) <= 1 && clear(s, o.pos, e.pos))) dis.push('enemy within 5 ft');
  return { mode: adv.length && !dis.length ? 'adv' : dis.length && !adv.length ? 'dis' : 'normal', adv, dis, add: mine.add, crit: theirs.crit };
}

// The d20 part of an attack: roll, compare with Armor Class, record it. Returns { hit, crit, mode }.
function rollToHit(s, e, t, atk, ev, extra = {}) {
  const { mode, adv, dis, add, crit: sureCrit } = rollMode(s, e, t, atk);
  const r1 = die(s, 20), r2 = mode === 'normal' ? null : die(s, 20);
  const nat = mode === 'adv' ? Math.max(r1, r2) : mode === 'dis' ? Math.min(r1, r2) : r1;
  const bonus = atk.bonus + add;
  const ac = acOf(s, t);
  const hit = nat !== 1 && (nat === 20 || nat + bonus >= ac);
  const crit = hit && (nat === 20 || sureCrit);
  ev.push({ type: 'attack', actor: e.id, target: t.id, name: atk.name, rolls: r2 ? [r1, r2] : [r1], nat,
    total: nat + bonus, ac, mode, why: mode === 'adv' ? adv : mode === 'dis' ? dis : [], hit, crit, ...extra });
  return { hit, crit, mode };
}

// A weapon attack by a creature whose attacks are still flat records (monsters and
// hand-entered characters). Spells resolve through effect steps instead.
function resolveAttack(s, e, t, atk, ev, extra = {}) {
  const { hit, crit, mode } = rollToHit(s, e, t, atk, ev, extra);
  if (!hit) return;
  let total = roll(s, atk.damage, { crit }).total;
  const notes = [];
  if (atk.bonusOnAdv && mode === 'adv') total += roll(s, atk.bonusOnAdv, { crit }).total;
  const sneakKey = `sneak:${e.id}`;
  if (e.features.sneak && !atk.spell && (atk.finesse || atk.type === 'ranged') && !s.encounter?.flags[sneakKey] && mode !== 'dis') {
    const flank = living(s).some((o) => o.id !== e.id && up(o) && hostile(o, t) && H.dist(o.pos, t.pos) <= 1);
    if (mode === 'adv' || flank) {
      total += roll(s, e.features.sneak, { crit }).total;
      if (s.encounter) s.encounter.flags[sneakKey] = true;
      notes.push('Sneak Attack');
    }
  }
  if (notes.length) ev.push({ type: 'note', id: e.id, text: notes.join(', ') });
  damage(s, t, total, atk.dtype, ev, { crit });
  if (atk.onHit === 'prone') condition(s, t, 'prone', ev);
}

// Armor Class after anything that changes it.
function acOf(s, t) {
  const m = modifiers(s, t, 'ac', { target: t });
  return (m.set ?? t.ac) + m.add;
}

// Put a condition on a creature. What the condition does is data (content/srd52/conditions.js).
// `f` is the effect frame that caused it, if any, and `step` the step. If the frame belongs to
// a lasting effect the condition is tied to it and ends when it does; otherwise only the DM
// (or standing up, for Prone) ends it, and the DM is told so.
function condition(s, t, id, ev, f = null, step = null, level = undefined) {
  if (!up(t) || t.cond[id]) return;
  const fx = f?.src.fx ? effectsOf(s).find((x) => x.id === f.src.fx) : null;
  t.cond[id] = { ...(f ? { source: f.actor } : {}), ...(level ? { level } : {}), ...(fx ? { effect: fx.id } : {}) };
  if (fx) fx.parts.push({ target: t.id, cond: id, ...(step?.ends ? { ends: step.ends, dc: step.dc ?? f.src.dc } : {}) });
  ev.push({ type: 'cond', id: t.id, cond: id });
  const def = conditionDef(id), name = conditionName(id);
  const rest = def?.also ? ` The engine applies what it can; the DM applies the rest: ${def.also}` : '';
  const ending = fx || id === 'prone' ? '' : ' Nothing ends it yet: the DM removes it.';
  if (rest || ending) ev.push({ type: 'manual', actor: f?.actor ?? t.id, name: f?.src.name ?? name, partial: true, text: `${t.name} ${conditionPhrase(id)}.${rest}${ending}` });
  concentrationLost(s, ev, t, `${t.name} ${conditionPhrase(id)}`);
}

// Attach a modifier to a creature for as long as a lasting effect runs. Returns false if there
// is no lasting effect to carry it, in which case the step is handed to the DM.
function modifier(s, t, mod_, ev, f) {
  const fx = f?.src.fx ? effectsOf(s).find((x) => x.id === f.src.fx) : null;
  if (!fx) return false;
  fx.parts.push({ target: t.id, modifier: mod_ });
  return true;
}

// `extra` names a second hook to gather modifiers from, such as 'concentration'.
function savingThrow(s, t, abil, dc, extra = null) {
  const m = modifiers(s, t, `save.${abil}`, { target: t }, '');
  if (extra) {
    const x = modifiers(s, t, extra, { target: t }, '');
    m.add += x.add; m.advantage.push(...x.advantage); m.disadvantage.push(...x.disadvantage);
    m.autoFail ||= x.autoFail; m.autoSucceed ||= x.autoSucceed;
  }
  if (m.autoFail) return { roll: 0, total: 0, success: false };
  if (m.autoSucceed) return { roll: 0, total: dc, success: true };
  const mode = m.advantage.length && !m.disadvantage.length ? 'adv' : m.disadvantage.length && !m.advantage.length ? 'dis' : 'normal';
  const r1 = die(s, 20), r2 = mode === 'normal' ? null : die(s, 20);
  const r = mode === 'adv' ? Math.max(r1, r2) : mode === 'dis' ? Math.min(r1, r2) : r1;
  const total = r + mod(t.abil[abil]) + (t.saveProf.includes(abil) ? t.prof : 0) + m.add;
  return { roll: r, total, success: total >= dc, ...(r2 === null ? {} : { rolls: [r1, r2], mode, why: mode === 'adv' ? m.advantage : m.disadvantage }) };
}

// Hexes an area spell would cover if aimed at `aim`.
// A cone opens from the caster toward `aim`. A sphere or cylinder is centred on `aim`, which must
// be within the spell's range. An emanation surrounds the caster and needs no aim.
export function areaHexes(s, e, sp, aim) {
  if (!sp.area) return [];
  const n = sp.area.size / FT, shape = sp.area.shape;
  let hexes = [];
  if (shape === 'emanation') hexes = H.range(e.pos, n).filter((h) => H.key(h) !== H.key(e.pos));
  else if (!aim) return [];
  else if (shape === 'cone') hexes = H.cone(e.pos, aim, n);
  else if (shape === 'sphere' || shape === 'cylinder') hexes = H.range(aim, n);
  return hexes.filter((h) => hasColumn(s.map, h));
}

// Why this creature can't take an action/bonus action right now ('' if it can).
export function blocked(s, e, time = 'action') {
  if (!up(e)) return `${e.name} is down.`;
  const stopped = incapacitatedBy(e);
  if (stopped) return `${e.name} is ${stopped} and can't act.`;
  if (!s.encounter) return '';
  if (!inFight(s, e.id)) return `${e.name} is outside the battle. Move into the arena to join.`;
  if (current(s) !== e.id) return `It isn't ${e.name}'s turn.`;
  if (s.encounter.budget[time] < 1) return `${e.name} has already used ${time === 'bonus' ? 'a Bonus Action' : 'an action'} this turn.`;
  return '';
}
const need = (s, e, time) => { const why = blocked(s, e, time); if (why) fail(why); };
// Refuse if a condition stops this creature acting at all, in or out of a fight.
const able = (e) => { const by = incapacitatedBy(e); if (by) fail(`${e.name} is ${by} and can't act.`); };

// Creature ids a given attack or spell could legally target right now (range only).
export function targetsFor(s, e, { attack, spell }) {
  const out = [];
  for (const t of living(s)) {
    if (!clear(s, e.pos, t.pos)) continue;
    const d = H.dist(e.pos, t.pos) * FT;
    if (attack) {
      const atk = e.attacks.find((a) => a.id === attack);
      if (t.id !== e.id && d <= (atk.type === 'melee' ? atk.reach : atk.range[1])) out.push(t.id);
    } else {
      const sp = SPELLS[spell];
      if (sp.aim !== 'creature') continue;
      if (sp.harmful ? t.id !== e.id && d <= sp.range : d <= sp.range) out.push(t.id);
    }
  }
  return out;
}

// ---------- actions ----------

// The engine's machinery, lent to the effect runner (effects.js) so it need not know our internals.
const KIT = { rollToHit, savingThrow, damage, heal, condition, modifier, judge };

const handlers = {
  move(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    up(e) || fail(`${e.name} can't move.`);
    speedOf(s, e) > 0 || fail(`${e.name} can't move: its Speed is 0.`);
    const fighting = inFight(s, e.id);
    if (fighting && current(s) !== e.id) fail(`It isn't ${e.name}'s turn.`);
    const reach = moveOptions(s, e);
    // A tap names a hex; if it gives no height, the nearest surface this creature can stop on.
    const column = [...reach.values()].filter((n) => H.col(n.h) === H.col(a.to) && (a.to.z === undefined || n.h.z === a.to.z))
      .sort((x, y) => (y.canStop - x.canStop) || Math.abs(x.h.z - e.pos.z) - Math.abs(y.h.z - e.pos.z))[0];
    const to = column?.h ?? landing(s.map, a.to, e.pos.z);
    to || fail("There's nothing there to stand on.");
    let tk = H.key(to), node = reach.get(tk);
    // Walking onto a hex where something unseen is standing: stop beside it and find out what it
    // is. Refusing the move would tell the player something is there without saying what.
    const lurker = fighting ? null : living(s).find((o) => o.hidden && hostile(o, e) && H.key(o.pos) === tk);
    if (lurker) {
      if (H.dist(e.pos, lurker.pos) <= 1) return reveal(s, lurker, ev);      // already beside it: no move, but it is found
      const beside = [...reach.keys()].filter((k) => reach.get(k).canStop && H.dist(reach.get(k).h, to) === 1 && Math.abs(reach.get(k).h.z - to.z) <= STEP_MAX)
        .sort((x, y) => reach.get(x).cost - reach.get(y).cost)[0];
      if (!beside) fail("Can't get there.");
      tk = beside; node = reach.get(tk);
    }
    if (!node || !node.canStop) {
      if (fighting && !s.encounter.arena[H.col(to)]) fail("The arena is locked until the fight ends.");
      if (node) fail('That hex is occupied.');
      fail(fighting ? `Too far. ${e.name} has ${s.encounter.budget.move} ft of movement left.` : "Can't get there.");
    }
    let seg = [], prev = e.pos;
    const flush = () => { if (seg.length) ev.push({ type: 'moved', id: e.id, path: seg }); seg = []; };
    for (const step of H.pathTo(reach, tk)) {
      if (fighting && s.encounter && !e.cond.disengaged) {
        for (const o of threatsAt(s, e, prev)) {
          if (H.dist(o.pos, step) <= 1) continue;
          flush();
          o.reactionUsed = true;
          resolveAttack(s, o, e, o.attacks.find((x) => x.type === 'melee'), ev, { opportunity: true });
          if (!up(e)) break;
        }
        if (!up(e)) break;
      }
      const k = H.key(step);
      if (fighting && s.encounter) s.encounter.budget.move -= reach.get(k).cost - reach.get(H.key(prev)).cost;
      e.pos = step; seg.push(step); prev = step;
      if (fighting) continue;
      // Anything lying in wait this close is spotted, whether or not a fight follows.
      for (const o of living(s)) if (o.hidden && hostile(o, e) && H.dist(o.pos, e.pos) <= ENGAGE_RANGE && clear(s, o.pos, e.pos)) { flush(); reveal(s, o, ev); }
      const free = !living(s).some((o) => o.id !== e.id && H.key(o.pos) === k);
      if (s.encounter && s.encounter.arena[H.col(step)] && free) { flush(); joinEncounter(s, e, ev); break; }
      if (!s.encounter && s.settings.autoEngage && free &&
          living(s).some((o) => up(o) && hostile(o, e) && H.dist(o.pos, e.pos) <= ENGAGE_RANGE && clear(s, o.pos, e.pos))) {
        flush(); startEncounter(s, e.pos, ev); break;
      }
    }
    flush();
    if (lurker) reveal(s, lurker, ev);
    checkEnd(s, ev);
  },

  attack(s, a, ctx, ev) {
    const e = ent(s, a.actor), t = ent(s, a.target); control(e, ctx);
    const atk = e.attacks.find((x) => x.id === a.attack) || fail('Unknown attack.');
    up(e) || fail(`${e.name} is down.`);
    able(e);
    !t.dead || fail(`${t.name} is already dead.`);
    e.id !== t.id || fail("A creature can't attack itself.");
    checkRange(e, t, atk);
    walled(s, e, t);
    if (!s.encounter) return engage(s, e, t, ev);                 // roll initiative first
    need(s, e, 'action');
    inFight(s, t.id) || fail(`${t.name} is outside the battle.`);
    s.encounter.budget.action--;
    resolveAttack(s, e, t, atk, ev);
    checkEnd(s, ev);
  },

  // { type: 'cast', actor, spell, target? | hex?, slot? }
  cast(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    const sp = SPELLS[a.spell];
    (sp && e.spells.includes(a.spell)) || fail(`${e.name} doesn't know that spell.`);
    up(e) || fail(`${e.name} is down.`);
    able(e);
    if (sp.time === 'reaction') fail(`${sp.name} is cast as a Reaction. The engine does not handle that yet; the DM applies it.`);
    if (!sp.turn && s.encounter) fail(`${sp.name} takes longer than a turn to cast, so it can't be cast during a fight.`);

    // Who or what it is aimed at.
    let targets = [], hexes = null;
    if (sp.aim === 'area') {
      const shape = sp.area.shape;
      if (shape === 'cone') (a.hex && H.dist(a.hex, e.pos) > 0) || fail(`Pick a direction for ${sp.name}.`);
      else if (shape !== 'emanation') {
        a.hex || fail(`Pick where ${sp.name} goes off.`);
        const d = H.dist(a.hex, e.pos);
        if (d * FT > sp.range) fail(`That is ${ft(d)} away. ${sp.name} reaches ${sp.range} ft.`);
      }
      hexes = areaHexes(s, e, sp, a.hex);
      const keys = new Set(hexes.map(H.key));
      const origin = shape === 'cone' || shape === 'emanation' ? e.pos : landing(s.map, a.hex, e.pos.z) ?? e.pos;
      targets = living(s).filter((t) => keys.has(H.col(t.pos)) && clear(s, origin, t.pos));      // a wall shelters what is behind it
    } else if (sp.aim === 'creature') {
      const t = ent(s, a.target);
      !t.dead || fail(`${t.name} is dead.`);
      if (sp.harmful && t.id === e.id) fail(`${sp.name} needs another target.`);
      const d = H.dist(e.pos, t.pos);
      if (d * FT > sp.range) fail(`${t.name} is ${ft(d)} away. ${sp.name} reaches ${sp.range === 5 ? 'touch (5 ft)' : sp.range + ' ft'}.`);
      walled(s, e, t);
      targets = [t];
    } else if (sp.aim === 'self') targets = [e];

    // What it costs.
    const slot = sp.level > 0 ? (a.slot ?? sp.level) : 0;
    if (sp.level > 0) {
      (Number.isInteger(slot) && slot >= sp.level && slot <= 9) || fail(`${sp.name} needs a spell slot of level ${sp.level} or higher.`);
      e.slots[slot] > 0 || fail(`${e.name} has no level ${slot} spell slots left.`);
    }
    const aimed = sp.aim === 'area' || sp.aim === 'creature';
    if (!s.encounter && sp.harmful && aimed) return sp.aim === 'area' ? startEncounter(s, e.pos, ev) : engage(s, e, targets[0], ev);
    if (s.encounter) {
      need(s, e, sp.time);
      if (sp.level > 0 && s.encounter.flags.slot) fail('Only one spell slot can be spent per turn.');
      if (sp.aim === 'creature') inFight(s, targets[0].id) || fail(`${targets[0].name} is outside the battle.`);
      s.encounter.budget[sp.time]--;
      if (sp.level > 0) s.encounter.flags.slot = true;
    }
    if (sp.level > 0) e.slots[slot]--;
    for (const t of targets) reveal(s, t, ev);         // caught in the area: no longer unseen

    // What it does: run its effect steps.
    const st = spellStats(e), { steps, unscaled } = scaleSteps(sp.def, e.level, slot);
    ev.push({ type: 'cast', actor: e.id, spell: a.spell, name: sp.name, hexes, targets: targets.map((t) => t.id), ...(slot > sp.level ? { slot } : {}) });
    // A spell that lasts becomes an effect: it is timed, it can hold conditions and modifiers on
    // creatures, and ending it takes them off. Concentrating on a new spell ends the old one.
    let fx = null;
    if (sp.def.duration !== 'instant') {
      if (sp.def.concentration) breakConcentration(s, ev, e.id, `${e.name} began concentrating on ${sp.name}`);
      fx = startEffect(s, { name: sp.name, spell: a.spell, source: e.id, conc: sp.def.concentration, duration: sp.def.duration });
      ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: e.id, conc: fx.conc, lasts: fx.lasts, targets: targets.map((t) => t.id) });
    }
    const before = ev.length;
    begin(s, {
      steps, actor: e.id, targets: sp.aim === 'none' ? null : targets.map((t) => t.id),
      src: { name: sp.name, dc: st.dc, attack: st.attack, range: sp.range, healMod: mod(e.abil[e.castAbil] ?? 10), ...(fx ? { fx: fx.id } : {}) },
      shared: sp.aim === 'area' ? sharedRolls(s, steps) : null,
    });
    run(s, ev, KIT);

    // Whatever the engine did not do, it says, so nothing is quietly skipped.
    const note = (text) => ev.push({ type: 'manual', actor: e.id, name: sp.name, text, partial: true });
    const toldAlready = ev.slice(before).some((x) => x.type === 'manual' && !x.partial);
    if (sp.def.tier !== 'auto' && !toldAlready) note(sp.def.text);
    if (unscaled) note(`Cast with a level ${slot} slot. The engine could not add ${unscaled}; the DM does.`);
    if (fx && fx.until === null) note(`${sp.name} lasts ${sp.def.duration}. The engine cannot time that; the DM ends it.`);
    checkEnd(s, ev);
  },

  dash(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    s.encounter || fail('Dash only matters in a fight. Just move.');
    need(s, e, 'action');
    s.encounter.budget.action--; s.encounter.budget.move += speedOf(s, e);
    ev.push({ type: 'std', id: e.id, action: 'Dash' });
  },
  disengage(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    s.encounter || fail('Disengage only matters in a fight.');
    const time = e.features.nimbleEscape ? 'bonus' : 'action';
    need(s, e, time);
    s.encounter.budget[time]--; e.cond.disengaged = {};
    ev.push({ type: 'std', id: e.id, action: 'Disengage' });
  },
  dodge(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    s.encounter || fail('Dodge only matters in a fight.');
    need(s, e, 'action');
    s.encounter.budget.action--; e.cond.dodging = {};
    ev.push({ type: 'std', id: e.id, action: 'Dodge' });
  },
  secondWind(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    e.uses.secondWind > 0 || fail(`${e.name} has no uses of Second Wind left.`);
    need(s, e, 'bonus');
    e.hp < e.maxHp || fail(`${e.name} is already at full Hit Points.`);
    if (s.encounter) s.encounter.budget.bonus--;
    e.uses.secondWind--;
    ev.push({ type: 'std', id: e.id, action: 'Second Wind' });
    heal(s, e, roll(s, `1d10+${e.level}`).total, ev);
  },
  endTurn(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    (s.encounter && current(s) === e.id) || fail(`It isn't ${e.name}'s turn.`);
    delete e.cond.disengaged;
    turnEnded(s, ev, e, KIT);
    if (s.encounter) advanceTurn(s, ev);
  },

  // Do something with an object in reach: open a door, pull a lever. { type: 'use', actor, object, verb }
  use(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    up(e) || fail(`${e.name} is down.`);
    able(e);
    const o = objectOf(s, a.object), def = objectDef(o), name = objectName(o), the = `The ${name.toLowerCase()}`;
    const u = def.use.find((x) => x.id === a.verb) || fail(`${the} can't be used that way.`);
    nearObject(s, e, o) || fail(`${e.name} is too far from the ${name.toLowerCase()}.`);
    u.from.includes(o.state) || fail(`${the} is ${def.states[o.state].name}.`);
    if (u.key) {
      o.key || fail(`${the} has no lock.`);
      hasKey(e, o.key) || fail(`${e.name} doesn't have the key.`);
    }
    // In a fight the first thing handled on a turn is free; anything more, or anything slow, takes the action.
    if (s.encounter && inFight(s, e.id)) {
      current(s) === e.id || fail(`It isn't ${e.name}'s turn.`);
      if (u.time === 'free' && !s.encounter.flags.interact) s.encounter.flags.interact = true;
      else { need(s, e, 'action'); s.encounter.budget.action--; }
    }
    if (u.check) {
      const c = u.check, dc = o.dc?.[u.id] ?? c.dc, what = `${c.ability.toUpperCase()}${c.skill ? ` (${c.skill})` : ''}${c.tool ? ` with ${c.tool}` : ''}`;
      ev.push({ type: 'std', id: e.id, action: `${u.name}: ${name}` });
      ev.push({ type: 'manual', actor: e.id, name, partial: true, text: `${e.name} tries to ${u.name.toLowerCase()} (${name}). That is a ${what} check against DC ${dc}. The engine does not roll checks yet: the DM rolls it and sets the ${name.toLowerCase()}.` });
      return;
    }
    if (u.to) setObject(s, o, u.to, ev, e, u.id);
  },

  // ----- table management -----
  claim(s, a, ctx, ev) {
    const e = ent(s, a.entity);
    if (ctx.role !== 'dm') {
      (e.kind === 'pc' && !e.owner) || fail(`${e.name} is already taken.`);
      a.user === ctx.userId || fail('You can only claim a character for yourself.');
      !Object.values(s.entities).some((o) => o.owner === ctx.userId) || fail('You already have a character.');
    }
    e.owner = a.user || null; e.ownerName = a.userName || null;
    ev.push({ type: 'claimed', id: e.id, userName: e.ownerName });
  },
  // Hand a character back so someone else can play it. Players can release their own; the DM, anyone's.
  release(s, a, ctx, ev) {
    const e = ent(s, a.entity);
    e.owner || fail(`Nobody is playing ${e.name}.`);
    ctx.role === 'dm' || e.owner === ctx.userId || fail(`${e.name} isn't yours to give up.`);
    e.owner = null; e.ownerName = null;
    ev.push({ type: 'released', id: e.id });
  },

  // ----- DM only -----
  startEncounter(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can call for initiative.');
    !s.encounter || fail('A fight is already under way.');
    startEncounter(s, a.center, ev, a.radius || ARENA_RADIUS);
  },
  endEncounter(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can end the fight.');
    s.encounter || fail('There is no fight to end.');
    endEncounter(s, ev, 'ended');
  },
  spawn(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can add creatures.');
    const tpl = MONSTERS[a.monster] || fail('Unknown monster.');
    const at = landing(s.map, a.at);
    (at && TILES[ground(s.map, at).tile.t].cost < Infinity) || fail("A creature can't stand there.");
    !living(s).some((o) => H.key(o.pos) === H.key(at)) || fail('That hex is occupied.');
    const id = `m${++s.seq}`;
    const n = Object.values(s.entities).filter((o) => o.tpl === a.monster).length + 1;
    s.entities[id] = makeEntity(tpl, { id, tpl: a.monster, name: a.name || `${tpl.name} ${n}`, pos: at, ...(a.hidden ? { hidden: true } : {}) });
    ev.push({ type: 'spawned', id });
    if (s.encounter?.arena[H.col(at)]) joinEncounter(s, s.entities[id], ev);
  },
  place(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can place creatures.');
    const e = ent(s, a.actor);
    const to = landing(s.map, a.to, e.pos.z) || fail("There's nothing there to stand on.");
    !living(s).some((o) => o.id !== e.id && H.key(o.pos) === H.key(to)) || fail('That hex is occupied.');
    e.pos = to;
    ev.push({ type: 'placed', id: e.id, to });
    if (s.encounter?.arena[H.col(to)] && !inFight(s, e.id) && !e.dead) joinEncounter(s, e, ev);
  },
  // Put an object into one of its states. { type: 'setObject', object, state }
  setObject(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can set objects.');
    const o = objectOf(s, a.object);
    Object.hasOwn(objectDef(o).states, a.state) || fail(`The ${objectName(o).toLowerCase()} has no such state.`);
    o.state !== a.state || fail(`The ${objectName(o).toLowerCase()} is already ${objectDef(o).states[a.state].name}.`);
    setObject(s, o, a.state, ev);
  },
  // Change the map in play: tiles, levels, walls, objects. { type: 'mapEdit', ops: [{ op, ... }] }
  // The changes are made to a copy and the copy is checked whole, so a bad edit changes nothing.
  mapEdit(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can change the map.');
    (Array.isArray(a.ops) && a.ops.length > 0 && a.ops.length <= 2000) || fail('Nothing to change.');
    const map = structuredClone(s.map);
    for (const op of a.ops) {
      const edit = (op && Object.hasOwn(EDITS, op.op) && EDITS[op.op]) || fail(`Unknown map change: ${op?.op}`);
      const problem = edit(map, op);
      if (problem) fail(problem);
    }
    const problems = lintMap(map);
    problems.length === 0 || fail(`That change can't be made. ${problems[0]}`);
    const B = barriers(map);
    for (const e of living(s)) {
      const sf = ground(map, e.pos);
      (sf && !B.solid(sf.level.id, e.pos)) || fail(`${e.name} would be left with nowhere to stand.`);
    }
    s.map = map;
    ev.push({ type: 'mapEdit', count: a.ops.length });
  },
  // Hand a creature an item, or take one away. { type: 'give', actor, item, take? }
  give(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can hand out items.');
    const e = ent(s, a.actor), item = String(a.item ?? '').trim();
    (item && item.length <= 80) || fail('Name the item.');
    if (a.take) {
      const i = e.gear.findIndex((g) => String(g).toLowerCase() === item.toLowerCase());
      i >= 0 || fail(`${e.name} has no ${item}.`);
      e.gear.splice(i, 1);
    } else e.gear.push(item);
    ev.push({ type: 'gear', id: e.id, item, ...(a.take ? { taken: true } : {}) });
  },
  // Play on a different map. The party is set down at its start; the creatures of the old
  // place stay behind with it. { type: 'loadMap', map }
  loadMap(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can change the map.');
    !s.encounter || fail("The map can't change in the middle of a fight.");
    const problems = lintMap(a.map);
    problems.length === 0 || fail(`That map can't be used. ${problems[0]}`);
    const map = structuredClone(a.map);
    const walkable = (p) => p && TILES[ground(map, p).tile.t].cost < Infinity;
    const first = map.starts[0] ?? H.parse(Object.keys(map.levels[0].tiles)[0]);
    const start = landing(map, first, first.z ?? 0);
    const party = Object.values(s.entities).filter((e) => e.side === 'party'), spots = [];
    for (let n = 0; n < 12 && spots.length < party.length; n++) {
      for (const h of H.range(start, n)) {
        const p = H.dist(h, start) === n ? landing(map, h, start.z) : null;
        if (walkable(p) && Math.abs(p.z - start.z) <= STEP_MAX && spots.length < party.length) spots.push(p);
      }
    }
    spots.length === party.length || fail("That map has no room for the party at its start.");
    const leaving = new Set(Object.values(s.entities).filter((e) => e.side !== 'party').map((e) => e.id));
    for (const fx of [...effectsOf(s)]) if (leaving.has(fx.source) || fx.parts.some((p) => leaving.has(p.target))) endEffect(s, ev, fx, 'the party moved on');
    for (const id of leaving) delete s.entities[id];
    s.map = map;
    party.forEach((e, i) => { e.pos = spots[i]; });
    ev.push({ type: 'map', map: map.id, name: map.name });
  },
  // Hide a creature from the players, or show it to them. { type: 'reveal', actor, hidden: true|false }
  reveal(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can hide or reveal creatures.');
    const e = ent(s, a.actor);
    if (a.hidden) {
      e.side !== 'party' || fail("A party member can't be hidden from the party.");
      !e.hidden || fail(`${e.name} is already hidden.`);
      !inFight(s, e.id) || fail(`${e.name} is in the fight and can't be hidden.`);
      e.hidden = true;
      ev.push({ type: 'concealed', id: e.id });
    } else {
      e.hidden || fail(`${e.name} isn't hidden.`);
      reveal(s, e, ev);
    }
  },
  // End a lasting effect early: its caster dropping Concentration, or the DM. { type: 'endEffect', effect }
  endEffect(s, a, ctx, ev) {
    const fx = effectsOf(s).find((x) => x.id === a.effect) || fail('No such effect.');
    const src = s.entities[fx.source], own = !!src?.owner && src.owner === ctx.userId;
    ctx.role === 'dm' || own || fail(`${fx.name} isn't yours to end.`);
    endEffect(s, ev, fx, own || !src ? `${src?.name ?? 'its caster'} ended it` : 'the DM ended it');
  },
  // Put a condition on a creature or take it off. { type: 'condition', actor, condition, on: true|false, level? }
  condition(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can set conditions.');
    const e = ent(s, a.actor), def = conditionDef(a.condition);
    (def && CONTENT.conditions[a.condition]) || fail('Unknown condition.');
    if (a.on === false) {
      e.cond[a.condition] || fail(`${e.name} isn't ${def.name}.`);
      delete e.cond[a.condition];
      ev.push({ type: 'condEnd', id: e.id, cond: a.condition });
      return;
    }
    up(e) || fail(`${e.name} is down.`);
    const level = def.levels ? Math.max(1, Math.min(def.levels, a.level | 0 || 1)) : undefined;
    if (e.cond[a.condition]) {
      (def.levels && e.cond[a.condition].level !== level) || fail(`${e.name} is already ${def.name}.`);
      e.cond[a.condition].level = level;
      ev.push({ type: 'cond', id: e.id, cond: a.condition, level });
      return;
    }
    condition(s, e, a.condition, ev, null, null, level);
  },
  setHp(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can set Hit Points.');
    const e = ent(s, a.actor), hp = Math.max(0, Math.min(e.maxHp, a.hp | 0));
    if (hp > e.hp) { e.dead = false; heal(s, e, hp - e.hp, ev); } else if (hp < e.hp) damage(s, e, e.hp - hp, 'untyped', ev);
    checkEnd(s, ev);
  },
  rest(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can call a rest.');
    !s.encounter || fail("You can't rest in the middle of a fight.");
    for (const e of Object.values(s.entities).filter((x) => x.side === 'party')) {
      Object.assign(e, { hp: e.maxHp, dead: false, cond: {}, death: { s: 0, f: 0 }, slots: { ...e.slotsMax } });
      e.uses.secondWind = e.features.secondWind || 0;
    }
    s.clock += 480;
    ev.push({ type: 'rest' });
    tick(s, ev);
  },
  advanceTime(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can advance time.');
    !s.encounter || fail('Time moves in rounds during a fight.');
    a.minutes > 0 || fail('Time only moves forward.');
    s.clock += a.minutes;
    ev.push({ type: 'time', minutes: a.minutes });
    tick(s, ev);
  },
  chronicle(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can write to the chronicle.');
    String(a.title || '').trim() || fail('Give the event a title.');
    ev.push({ type: 'chronicle', title: String(a.title).trim(), text: a.text || '', tags: a.tags || [] });
  },
  setting(s, a, ctx) {
    ctx.role === 'dm' || fail('Only the DM can change table settings.');
    a.key in s.settings || fail('Unknown setting.');
    s.settings[a.key] = a.value;
  },
};

export function apply(s, action, ctx = { role: 'dm' }) {
  const ev = [];
  try {
    // To anyone but the DM a hidden creature does not exist. Answering "it's 40 ft away" or
    // "it isn't yours" to a guessed id would confirm that it does.
    if (ctx.role !== 'dm') for (const k of ['actor', 'target', 'entity']) if (s.entities[action[k]]?.hidden) fail('No such creature.');
    const h = handlers[action.type] || fail(`Unknown action: ${action.type}`);
    h(s, action, ctx, ev);
  } catch (err) {
    delete s.stack;                                  // never leave half an effect behind
    if (err instanceof RuleError) return { ok: false, error: err.message, events: [] };
    throw err;
  }
  for (const e of ev) if (e.type !== 'moved') s.timeline.push({ t: s.clock, ...e });
  return { ok: true, events: ev };
}

// ---------- the timeline: what an AI DM or AI character reads ----------

export function clockText(minutes) {
  const day = Math.floor(minutes / 1440) + 1, m = Math.floor(minutes % 1440);
  return `Day ${day}, ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// recall(state, {since, until, types, about, tags, limit}) -> matching timeline entries, oldest first.
export function recall(s, { since = -Infinity, until = Infinity, types, about, tags, limit = 200 } = {}) {
  return s.timeline.filter((e) =>
    e.t >= since && e.t <= until &&
    (!types || types.includes(e.type)) &&
    (!about || [e.id, e.actor, e.target].includes(about)) &&
    (!tags || (e.tags || []).some((t) => tags.includes(t)))).slice(-limit);
}
