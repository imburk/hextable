// The engine's machinery for what actions do (engine.js): the attack roll, damage, falls, pushes
// and teleports, reactions that answer them, the kit lent to the effect runner (effects.js), and how
// a fight starts, passes from turn to turn and ends.
import * as H from '../hex.js';
import { d20Faces, die, roll } from '../rng.js';
import { SPELLS, TILES } from '../content/index.js';
import { begin, run, scaleSteps, sharedRolls, walk as walkSteps } from '../effects.js';
import { breakConcentration, concentrationCheck, concentrationLost, damaged, effectsOf, endEffect, fightOver, ROUND, roundStarted, startEffect, turnKey, turnStarted, useUp } from '../durations.js';
import { apart, footprint, FT, ground, hasColumn, landing, overlapAt, STEP_FREE, STEP_MAX, surfaces, unseenAt } from '../space.js';
import { concludeFight } from '../rewards.js';
import { entered, flushZones, snapshot, turnInZones } from '../zones.js';
import { canSee, COVER, coverOf } from '../sight.js';
import { barriers, objectDef } from '../walls.js';
import { canReact, instruction, reactionsOf } from '../reactions.js';
import { incapacitated, judge, modifiers, speedOf } from '../modifiers.js';
import { ARENA_RADIUS, ask, castAbilOf, current, dying, fail, fighters, hostile, inFight, living, mod, partyOf, rollDice, rolledOf, spellStats, tellDM, together, up } from './shared.js';
import { catchUp, fightPlace, fitsOn, initiativeSort, joinEncounter, lookAround, objectActor, objectName, objectStep, objectZ, reveal, rollInit, roomAt, showPlace, unfollow, unhide } from './world.js';
import { acOf, attackTypes, boundEffect, condition, cure, dealt, deathSave, heal, kill, modifier, recharge, renew, rerollSave, rescue, rollMode, savingThrow, settle, slotsFor, spellOffer, tempHp } from './rolls.js';
import { tryLand } from './sheets.js';

// ---------- objects, falls, pushes and teleports (the effect steps that move things) ----------

// Run a list of effect steps that come from a thing on the map against some creatures.
export function objectEffects(s, o, steps, targets, ev) {
  if (!targets.length) return;
  begin(s, { steps, actor: null, targets: targets.map((t) => t.id), shared: targets.length > 1 ? sharedRolls(s, steps) : null,
    src: { name: objectName(o), object: o.id, dc: o.dc?.save ?? objectDef(o).dc?.save ?? 10, range: 1000 } });
  resolve(s, ev);
}
// Falling: 1d6 Bludgeoning for every 10 feet, 20d6 at most, and Prone on landing unless it took no damage.
export function fall(s, t, feet, ev) {
  const dice = Math.min(20, Math.floor(feet / 10));
  ev.push({ type: 'fell', id: t.id, feet });
  if (!dice) return;
  const mark = ev.length;
  const r = roll(s, `${dice}d6`);
  damage(s, t, [{ amount: r.total, type: 'bludgeoning', dice: r.dice, bonus: r.bonus }], null, ev);
  if (ev.slice(mark).some((x) => x.type === 'damage' && x.amount > 0)) condition(s, t, 'prone', ev);
}
// Forced movement: shove a creature so many feet straight away from a point, or toward it. It
// stops at a wall, a drop, or anything in the way. It provokes nothing and sets nothing off.
function push(s, t, feet, dir, from, ev) {
  const B = barriers(s.map), path = [], sign = dir === 'toward' ? -1 : 1, o = H.toWorld(from);
  for (let i = 0; i < Math.floor(feet / FT); i++) {
    const here = ground(s.map, t.pos), d0 = H.dist(t.pos, from), w = H.toWorld(t.pos);
    if (!here) break;
    let best = null;
    for (const n of H.neighbors(t.pos)) {
      if (H.dist(n, from) !== d0 + sign || (inFight(s, t.id) && !s.encounter.arena[H.col(n)])) continue;
      const sf = surfaces(s.map, n).find((x) => Math.abs(x.z - t.pos.z) <= STEP_FREE);
      if (!sf || TILES[sf.tile.t].cost === Infinity || B.solid(sf.level.id, n) || B.blocked(here.level.id, t.pos, n) || (sf.level !== here.level && B.blocked(sf.level.id, t.pos, n))) continue;
      const h = { q: n.q, r: n.r, z: sf.z };
      if (living(s).some((c) => c.id !== t.id && overlapAt(c, c.pos, t, h)) || !fitsOn(s.map, t, h, B)) continue;
      const nw = H.toWorld(n), straight = ((nw.x - w.x) * (w.x - o.x) + (nw.z - w.z) * (w.z - o.z)) * sign;       // most nearly straight along the line from the source
      if (!best || straight > best.straight + 1e-9) best = { h, straight };
    }
    if (!best) break;
    const zonesBefore = snapshot(s);
    t.pos = best.h; path.push(best.h);
    entered(s, ev, KIT, zonesBefore);                                    // pushed into a zone: it goes off once this effect is done
  }
  if (!path.length) return;
  ev.push({ type: 'moved', id: t.id, path, forced: true });
  lookAround(s, ev, [t]);
}
// The effect step: `t` goes to `to` (from teleportSpot). Returns false if it could not go, which
// runs the step's `blocked` steps instead when it has them.
function teleport(s, t, step, to, ev) {
  const taken = (pos) => living(s).some((o) => o.id !== t.id && overlapAt(o, o.pos, t, pos));
  let at = to;
  if (taken(at)) {
    if (step.blocked) return false;
    // Something it did not know of stands there: the nearest unoccupied space instead (the SRD
    // lets it choose; the engine takes the nearest, the first found on each ring).
    at = null;
    for (let n = 1; n <= 6 && !at; n++) for (const h of H.range(to, n).filter((x) => H.dist(x, to) === n)) {
      const p = landing(s.map, h, to.z);
      if (p && Math.abs(p.z - to.z) <= STEP_MAX && !roomAt(s, t, p) && !taken(p)) { at = p; break; }
    }
    if (!at) { ev.push({ type: 'manual', actor: t.id, name: 'Teleport', text: `${t.name} cannot arrive where it meant to, and the engine found no unoccupied space near it. The DM places it.` }); return true; }
  }
  const zonesBefore = snapshot(s);
  t.pos = { ...at };
  if (t.follow && !inFight(s, t.id)) unfollow(s, t, ev);
  ev.push({ type: 'moved', id: t.id, path: [{ ...at }], teleport: true });
  entered(s, ev, KIT, zonesBefore);                                     // a zone it lands in works on it once this effect is done
  // A thing on the floor that goes off when stepped on (a pressure plate): the engine does not run
  // it from inside a spell, so the DM is told.
  for (const o of s.map.objects) {
    const def = objectDef(o);
    if (def.triggers?.some((x) => x.on === 'enter' && x.from.includes(o.state)) && Math.abs(objectZ(s, o) - at.z) <= STEP_MAX && footprint(t).some((f) => H.dist(f, o.at) === 0))
      ev.push({ type: 'manual', actor: t.id, name: objectName(o), partial: true, text: `${t.name} teleported onto ${objectName(o)}. Whether it goes off is the DM's call.` });
  }
  lookAround(s, ev, [t]);
  if (s.encounter?.arena[H.col(at)] && !inFight(s, t.id) && !t.dead) joinEncounter(s, t, ev);
  return true;
}

// ---------- encounters (joining one, rollInit and fightPlace are in world.js) ----------

export function startEncounter(s, center, ev, radius = ARENA_RADIUS, walked = null) {
  const arena = {};
  for (const h of H.range(center, radius)) if (hasColumn(s.map, h)) arena[H.col(h)] = 1;    // a fight locks whole columns, every level
  catchUp(s, arena, walked, ev);                         // those walking with the party are with it
  // Whatever is somewhere the party has not seen stays out of it until that place is revealed.
  const who = living(s).filter((e) => arena[H.col(e.pos)] && (e.side === 'party' || !unseenAt(s.map, e.pos)));
  if (!who.length) fail('Nobody is close enough to fight here.');
  for (const e of who) { e.reactionUsed = false; reveal(s, e, ev); }   // nobody fights unseen
  s.encounter = {
    id: ++s.seq, center, radius, arena, round: 1, turn: -1, budget: null, flags: {},
    order: null, where: fightPlace(s, center),
  };
  const faces = {};
  s.encounter.order = initiativeSort(who.map((e) => rollInit(s, e, faces)));
  ev.push({ type: 'encounterStart', fight: s.encounter.id, where: s.encounter.where, center, radius, order: s.encounter.order.map((o) => ({ ...o, ...faces[o.id] })) });
  advanceTurn(s, ev);
}

// Start a fight big enough to hold both the attacker and a distant target.
export function engage(s, e, t, ev, walked = null) {
  const a = H.toWorld(e.pos), b = H.toWorld(t.pos), d = apart(s, e, t);
  startEncounter(s, H.fromWorld((a.x + b.x) / 2, (a.z + b.z) / 2), ev, Math.max(ARENA_RADIUS, Math.ceil(d / 2) + 1), walked);
}

export function endEncounter(s, ev, result) {
  for (const e of fighters(s)) {
    delete e.cond.dodging; delete e.cond.disengaged; e.reactionUsed = false;
    if (up(e)) delete e.cond.prone;                       // nothing stops you standing once the fight is over
  }
  ev.push({ type: 'encounterEnd', result, rounds: s.encounter.round, fight: s.encounter.id });
  fightOver(s, ev);
  concludeFight(s, ev, result, s.encounter, fighters(s), tryLand);      // XP and loot for a fight won or ended (rewards.js)
  s.encounter = null;
}

export function checkEnd(s, ev) {
  if (!s.encounter) return;
  const f = fighters(s);
  // A party lying at 0 Hit Points is down, not beaten: the fight goes on while anyone is still rolling.
  const foes = f.some((e) => e.side === 'foe' && up(e)), party = partyOf(f).some((e) => up(e) || dying(e));
  if (!foes || !party) endEncounter(s, ev, !foes ? 'victory' : 'defeat');
}

export function advanceTurn(s, ev) {
  const enc = s.encounter;
  for (let guard = 0; guard < enc.order.length * 2 + 2; guard++) {
    enc.turn++;
    if (enc.turn >= enc.order.length) { enc.turn = 0; enc.round++; s.clock += ROUND; roundStarted(s, ev); }
    const e = s.entities[enc.order[enc.turn].id];
    if (!e || e.dead) continue;
    if (e.hp <= 0) {
      if (!e.cond.stable) { deathSave(s, e, ev); checkEnd(s, ev); if (!s.encounter) return; }   // the last of the party may have died or become Stable
      if (e.hp <= 0) continue;
    }
    enc.flags = {};
    turnStarted(s, ev, e, KIT);                                          // what ends "at the start of its turn" ends before it acts
    turnInZones(s, ev, KIT, e, 'turnStart');                            // a zone it starts its turn in (Web)
    const speed = speedOf(s, e), can = incapacitated(e) ? 0 : 1;        // an incapacitated creature gets its turn but cannot act
    enc.budget = { move: speed, action: can, bonus: can, dashes: 0 };     // `move` is walking feet left; other ways of moving are worked out from it
    e.reactionUsed = false;
    delete e.cond.dodging;
    ev.push({ type: 'turn', id: e.id, round: enc.round });
    recharge(s, e, ev);
    if (e.cond.prone && speed > 0) {                                     // with a Speed of 0 it stays down
      delete e.cond.prone;
      enc.budget.move -= Math.floor(speed / 2 / FT) * FT;
      ev.push({ type: 'stood', id: e.id });
    }
    return;
  }
  endEncounter(s, ev, 'stalemate');
}

// ---------- damage and attacks ----------

// `amount` is a number of `dtype` damage, or a list of { amount, type } parts that land together
// (one hit that does slashing and fire): each part is resisted on its own and logged on its own,
// but the creature takes them as one instance of damage, so a dying creature fails one death
// save for it (two on a critical hit), and Concentration is tested once, against the total.
// Temporary Hit Points are lost first (SRD); `raw` (the DM setting Hit Points) leaves them alone.
// `cut` is a reaction that cuts this damage (Uncanny Dodge: { half }, Deflect Attacks: { less }),
// taken with the other adjustments, before Resistance (SRD "Order of Application").
// `pierce`: the damage ignores Resistance and Immunity (Overchannel's Necrotic damage to its caster).
export function damage(s, t, amount, dtype, ev, { crit = false, raw = false, cut = null, pierce = false } = {}) {
  const parts = Array.isArray(amount) ? amount : [{ amount, type: dtype }];
  const m = modifiers(s, t, 'damage.taken', { target: t });
  // A Reaction that gives Resistance to the damage being taken (Superior Hunter's Defense): the type it resists now.
  const braced = pierce ? null : braceAgainst(s, t, parts, m, ev);
  const dying = t.hp <= 0, before = t.hp;
  // Amounts added to or taken off the damage (the Resistance cantrip's 1d4) come first, then
  // Resistance and Vulnerability (SRD "Order of Application"). Each applies once to the
  // instance, on its first part of a type it names; one marked `once` at most once a turn.
  const adjust = parts.map(() => 0), noted = parts.map(() => []);
  for (const x of m.taken) {
    const i = parts.findIndex((p) => p.amount > 0 && (!x.types || x.types.includes(p.type)));
    if (i < 0) continue;
    const flag = `once:${x.key}`;
    if (x.once && s.encounter?.flags[flag]) continue;
    if (x.once && s.encounter) s.encounter.flags[flag] = true;
    const r = typeof x.value === 'string' ? rollDice(s, [{ dice: x.value, name: x.name }]).total : x.value;
    adjust[i] += r; noted[i].push({ name: x.name, ...(typeof x.value === 'string' ? { dice: x.value } : {}), roll: r });
  }
  const base = parts.map((p, i) => Math.max(0, p.amount + adjust[i]));
  if (cut) {
    const all = base.reduce((a, n) => a + n, 0);
    let less = cut.half ? all - Math.floor(all / 2) : Math.min(all, cut.less);
    for (let i = 0; i < base.length && less > 0; i++) { const n = Math.min(base[i], less); base[i] -= n; less -= n; if (n) noted[i].push({ name: cut.name, roll: -n }); }
  }
  let total = 0, lost = 0;
  for (const [pi, p] of parts.entries()) {
    const applies = (fromModifiers, own) => fromModifiers === true || fromModifiers.includes(p.type) || own.includes(p.type);
    // SRD order: Resistance (halved, rounded down), then Vulnerability (doubled); each counts once.
    const resisted = !pierce && (applies(m.resist, t.resist) || p.type === braced), vulnerable = applies(m.vulnerable, t.vuln);
    let n = base[pi];
    if (!pierce && applies(m.immune, t.immune)) n = 0;
    else { if (resisted) n = Math.floor(n / 2); if (vulnerable) n *= 2; }
    const ref = cut ? base[pi] : p.amount;                 // after a reaction's cut, Resistance is judged against what was left
    const note = n === 0 && ref > 0 ? 'immune' : resisted && vulnerable && ref > 0 ? 'resisted and vulnerable' : n < ref ? 'resisted' : n > ref ? 'vulnerable' : undefined;
    total += n;
    const soak = raw ? 0 : Math.min(t.tempHp ?? 0, n);
    if (soak) t.tempHp -= soak;
    lost += n - soak;
    if (!dying) t.hp = Math.max(0, t.hp - (n - soak));
    ev.push({ type: 'damage', target: t.id, amount: n, dtype: p.type, hp: dying ? 0 : t.hp, note, ...(noted[pi].length ? { adjusted: noted[pi] } : {}), ...(soak ? { temp: soak, tempHp: t.tempHp } : {}), ...rolledOf(p, n) });
  }
  if (t.tempFx && !(t.tempHp > 0)) delete t.tempFx;
  if (total > 0) damaged(s, ev, t, parts.find((p) => typeof p.by === 'string')?.by ?? null, KIT);      // "until it takes any damage" (Turn Undead); a save on damage (Dominate Monster)
  // Relentless Rage: dropping to 0 Hit Points without dying outright while raging, a Constitution save keeps it up.
  if (!dying && t.hp <= 0 && lost - before < t.maxHp) relentless(s, t, ev);
  if (dying) {                                            // already dying
    if (total > 0) { t.death.f += crit ? 2 : 1; delete t.cond.stable; if (t.death.f >= 3 || total >= t.maxHp) t.dead = true; }   // as much as the maximum kills outright
    if (t.dead) ev.push({ type: 'died', id: t.id });
    return;
  }
  if (t.hp > 0) {
    if (!(total > 0)) return undefined;
    const kept = concentrationCheck(s, ev, t, total, KIT);
    // Taking damage from a creature it can see may set off a reaction (Hellish Rebuke).
    const by = parts.find((p) => typeof p.by === 'string')?.by;
    if (by) reactAgainst(s, t, s.entities[by], 'damaged', ev, `${t.name} takes damage from ${s.entities[by]?.name ?? 'someone'}.`);
    return kept;
  }
  if (t.kind === 'pc' && lost - before < t.maxHp) {       // otherwise: instant death from massive damage
    t.cond.unconscious = {}; t.cond.prone = {}; t.death = { s: 0, f: 0 };
    ev.push({ type: 'down', id: t.id });
  } else { t.dead = true; ev.push({ type: 'died', id: t.id }); }
  concentrationLost(s, ev, t, `${t.name} went down`);
}

// A feature reaction `{ on: 'damaged', resist: true }` (Superior Hunter's Defense): when its creature
// takes damage it may take its Reaction for Resistance to that damage, and to any other of that type
// until the end of the current turn (a part that ends then, `ends.who`). Not for a type it already
// resists or is immune to; damage of several types at once is the player's pick, so the DM is told and
// nothing is spent. Its instruction decides (always, never, or ask its player). Returns the type, or null.
function braceAgainst(s, t, parts, m, ev) {
  if (t.object || !canReact(t)) return null;
  const r = reactionsOf(t).find((x) => x.kind === 'feature' && x.on === 'damaged' && x.reaction.resist);
  if (!r) return null;
  const w = instruction(t, r);
  if (w === 'never') return null;
  const has = (list, own, ty) => list === true || list.includes(ty) || (own ?? []).includes(ty);
  const types = [...new Set(parts.filter((p) => p.amount > 0).map((p) => p.type))].filter((ty) => !has(m.resist, t.resist, ty) && !has(m.immune, t.immune, ty));
  if (!types.length) return null;
  if (types.length > 1) {
    ev.push({ type: 'manual', actor: t.id, name: r.name, partial: true, text: `${t.name} takes ${types.join(' and ')} damage at once. ${r.name} gives Resistance to one type the player picks; if taken, the DM applies it and marks the Reaction used.` });
    return null;
  }
  if (w === 'ask') {
    const a = ask(s, t, { trigger: 'damaged', dtype: types[0] }, [{ reaction: r.id, name: r.name }]);
    if (a === null) { tellDM(t, r, `${t.name} takes ${types[0]} damage.`, ev); return null; }
    if (a.take !== r.id) return null;
  }
  t.reactionUsed = true;
  ev.push({ type: 'reaction', id: t.id, reaction: r.id, name: r.name, trigger: 'damaged', dtype: types[0] });
  if (s.encounter) {
    const fx = startEffect(s, { name: r.name, spell: null, source: t.id, conc: false, duration: 'special' });
    fx.bound = true;
    fx.parts.push({ target: t.id, modifier: { on: 'damage.taken', op: 'resist', types: [types[0]] }, ends: { on: 'turnEnd', who: current(s) } });
    ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: t.id, conc: false, lasts: 'until the end of the current turn', targets: [t.id] });
  }
  return types[0];
}

// When a creature hits one with `afterHit` (Multiattack Defense) with an attack roll, the attacker gets
// that modifier against it until the end of the current turn, once a turn.
function afterHit(s, e, t, ev) {
  if (!s.encounter || e.object || t.object) return;
  for (const f of t.feats ?? []) {
    if (!f.afterHit) continue;
    const now = current(s);
    if (effectsOf(s).some((fx) => fx.feature === f.id && fx.source === t.id && fx.parts.some((p) => !p.ended && p.target === e.id && p.ends?.who === now))) continue;
    const fx = startEffect(s, { name: f.name, spell: null, source: t.id, conc: false, duration: 'special' });
    Object.assign(fx, { bound: true, feature: f.id });
    fx.parts.push({ target: e.id, modifier: structuredClone(f.afterHit.modifier), against: t.id, ends: { on: 'turnEnd', who: now } });
    ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: t.id, conc: false, lasts: 'until the end of the current turn', targets: [e.id] });
  }
}

// A creature with `relentless` (Relentless Rage) has dropped to 0 Hit Points while the feature it
// names has its effect going: a Constitution save, DC `dc` plus `step` for each use since its last
// rest (counted in its `uses` under the feature's id; rests.js clears it), and on a success its Hit
// Points become `hp`.
function relentless(s, t, ev) {
  const f = (t.feats ?? []).find((x) => x.relentless);
  if (!f || !effectsOf(s).some((fx) => fx.source === t.id && fx.feature === f.relentless.while)) return;
  const r = f.relentless, n = t.uses?.[f.id] ?? 0, dc = r.dc + r.step * n;
  (t.uses ??= {})[f.id] = n + 1;
  const { used, ...sv } = savingThrow(s, t, 'con', dc, null, null, null, null, ev);
  ev.push({ type: 'save', id: t.id, abil: 'con', dc, ...sv, against: f.name });
  useUp(s, ev, used ?? []);
  if (!sv.success) return;
  t.hp = Math.min(t.maxHp, r.hp);
  ev.push({ type: 'std', id: t.id, action: f.name });
  ev.push({ type: 'heal', target: t.id, amount: t.hp, hp: t.hp });
}

// A creature that missed with an attack roll and has `missed` (Studied Attacks) gains its modifier
// against that target, on a lasting effect bound to it, until `ends` (in a fight: there are no turns
// outside one, and an attack roll starts one).
function studied(s, e, t, ev) {
  if (!s.encounter || e.object) return;
  for (const f of e.feats ?? []) {
    if (!f.missed) continue;
    const fx = startEffect(s, { name: f.name, spell: null, source: e.id, conc: false, duration: 'special' });
    fx.bound = true;
    fx.parts.push({ target: e.id, modifier: structuredClone(f.missed.modifier), against: t.id, ends: { ...f.missed.ends }, born: turnKey(s) });
    ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: e.id, conc: false, lasts: 'until its parts end', targets: [e.id] });
  }
}

// The d20 part of an attack: roll, compare with Armor Class, record it. Returns { hit, crit, mode }.
// `forgo`: the attacker gives up any Advantage on this roll (Brutal Strike).
// `keepHidden`: the attack does not end its hiding yet (Stealth Attack; resolveAttack decides).
function rollToHit(s, e, t, atk, ev, extra = {}, { forgo = false, keepHidden = false } = {}) {
  let { mode, adv, dis, add, dice, crit: sureCrit, used } = rollMode(s, e, t, extra.opportunity ? { ...atk, opportunity: true } : atk);
  if (forgo && mode === 'adv') { mode = 'normal'; adv = []; }
  if (!keepHidden) unhide(s, e, ev, 'attack');                                           // an attack roll gives away where it is, hit or miss
  const r1 = die(s, 20), r2 = mode === 'normal' ? null : die(s, 20);
  const nat = mode === 'adv' ? Math.max(r1, r2) : mode === 'dis' ? Math.min(r1, r2) : r1;
  const more = rollDice(s, dice);
  const bonus = atk.bonus + add + more.total;
  // Cover adds to Armor Class: 2 for half, 5 for three-quarters.
  const cover = e.object ? 'none' : coverOf(s, e, t, living(s)), ac = acOf(s, t) + (COVER[cover] ?? 0);
  // Improved Critical: a weapon attack scores a Critical Hit, and so hits, on a lower roll (`critOn`).
  const critRoll = nat === 20 || (!atk.spell && e.critOn && nat >= e.critOn);
  let hit = nat !== 1 && (critRoll || nat + bonus >= ac), ac2 = ac, cut = null;
  // A die that may turn a miss into a hit (Bardic Inspiration, Peerless Skill); never a natural 1.
  const lift = !hit && nat !== 1 ? rescue(s, e, 'attack.roll', ac - (nat + bonus), ev) : null;
  if (lift?.success) hit = true;
  const lifted = lift?.add ?? 0;
  // The target may react to being hit (reactions.js): Shield raises its Armor Class against this
  // very attack, so the roll is compared again; Uncanny Dodge and Deflect Attacks cut the damage.
  if (hit) {
    const r = reactToHit(s, t, e, atk, { total: nat + bonus + lifted, ac, critRoll }, ev);
    if (r?.ac) { ac2 = acOf(s, t) + (COVER[cover] ?? 0); hit = critRoll || nat + bonus + lifted >= ac2; }
    if (r?.acAdd) { ac2 = ac + r.acAdd; hit = critRoll || nat + bonus + lifted >= ac2; }
    if (r?.cut) cut = r.cut;
  }
  const crit = hit && (critRoll || sureCrit);
  ev.push({ type: 'attack', actor: e.id, target: t.id, name: atk.name, rolls: r2 ? [r1, r2] : [r1], nat,
    total: nat + bonus + lifted, ac: ac2, mode, why: mode === 'adv' ? adv : mode === 'dis' ? dis : [], hit, crit, ...(lift ? { rescued: { name: lift.name, dice: lift.dice, add: lift.add } } : {}), ...(cover !== 'none' ? { cover } : {}), ...(more.extra.length ? { extra: more.extra } : {}),
    dice: [...d20Faces(r1, r2, nat), ...more.dice], bonus: atk.bonus + add, ...extra });
  useUp(s, ev, used);
  if (!hit) studied(s, e, t, ev);
  else afterHit(s, e, t, ev);
  if (s.encounter) s.encounter.flags[`attacked:${e.id}`] = true;           // Reckless Attack is decided before the first attack roll of a turn
  renew(s, e, t);
  return { hit, crit, mode, ...(cut ? { cut } : {}) };
}

// ---------- reactions (asking a player is ask() in shared.js) ----------

// Cast a spell as a Reaction: the Reaction and a slot are spent (the lowest it can use, unless
// its player chose), and its steps run at once on `targets` (the caster, or the creature that set
// it off), inside whatever action set it off (on the effect stack, above the frames already there,
// which carry on afterwards). Returns the source its steps ran with: a Counterspell that worked
// marks it `countered`.
export function castReaction(s, e, sp, slot, trigger, against, ev, targets = [e.id]) {
  e.reactionUsed = true;
  if (slot > 0) {
    e.slots[slot]--;
    if (s.encounter) { if (current(s) === e.id) s.encounter.flags.slot = true; else s.encounter.flags[`slot:${e.id}`] = true; }
  }
  ev.push({ type: 'reaction', id: e.id, reaction: sp.id, name: sp.name, trigger, ...(against ? { against } : {}) });
  if (sp.def.components?.includes('v')) unhide(s, e, ev, 'spell');
  ev.push({ type: 'cast', actor: e.id, spell: sp.id, name: sp.name, hexes: null, targets: [...targets], reaction: true, ...(slot > sp.level ? { slot } : {}) });
  const { steps, unscaled } = scaleSteps(sp.def, e.level, slot || sp.level);
  let fx = null;
  if (sp.def.duration !== 'instant') {
    fx = startEffect(s, { name: sp.name, spell: sp.id, source: e.id, conc: sp.def.concentration, duration: sp.def.duration });
    ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: e.id, conc: fx.conc, lasts: fx.lasts, targets: [...targets] });
  }
  const st = spellStats(e, s, sp.id), depth = s.stack?.length ?? 0;
  const src = { name: sp.name, dc: st.dc, attack: st.attack, range: sp.range, healMod: mod(e.abil[castAbilOf(e, sp.id)] ?? 10), ...(fx ? { fx: fx.id } : {}), ...(trigger === 'cast' ? { counters: true } : {}) };
  begin(s, { steps, actor: e.id, targets: [...targets], src });
  run(s, ev, KIT, depth);
  if (sp.def.tier !== 'auto') ev.push({ type: 'manual', actor: e.id, name: sp.name, text: sp.def.text, partial: true });
  if (unscaled) ev.push({ type: 'manual', actor: e.id, name: sp.name, partial: true, text: `Cast with a level ${slot} slot. The engine could not add ${unscaled}; the DM does.` });
  return src;
}

// `t` was hit by `e`'s attack roll. Its reactions for a hit that its instructions let fire and it
// can take now are gathered. If any says `ask`, a player is asked which (if any) to take, with
// the roll and its Armor Class; otherwise the first is taken, as in part 1. Returns { ac: true }
// if its Armor Class may have changed (Shield), { acAdd } to add to it against this attack only
// (Parry), { cut } to cut the attack's damage, or null.
function reactToHit(s, t, e, atk, roll_, ev) {
  if (!canReact(t) || t.object) return null;
  const offers = [];
  for (const r of reactionsOf(t)) {
    if (r.on !== 'hit') continue;
    const w = instruction(t, r);
    if (w === 'never') continue;
    let o, slots = null;
    if (r.kind === 'spell') {
      slots = slotsFor(s, t, SPELLS[r.id]);
      if (!slots.length) continue;
      o = spellOffer(r, slots, r.ac ? { ac: r.ac } : {});
    } else if (r.kind === 'trait') {
      if (r.attack && atk.type !== r.attack) continue;                                  // Parry: "a melee attack roll"
      o = { reaction: r.id, name: r.name, ac: r.ac };
    } else if (r.kind === 'feature') {
      const x = r.reaction;
      if (x.seen && (e.object || canSee(s, t, e) === 'no')) continue;                  // "an attacker that you can see"
      if (x.types && !attackTypes(atk).some((d) => x.types.includes(d))) continue;      // Deflect Attacks: Bludgeoning, Piercing or Slashing
      o = { reaction: r.id, name: r.name };
    } else continue;
    if (w === 'miss' && (roll_.critRoll || roll_.total >= roll_.ac + (r.ac ?? 0))) continue;     // it would hit anyway
    offers.push({ r, w, o, slots });
  }
  let chosen = offers.find((x) => x.w !== 'ask') ?? null, slot;
  if (offers.some((x) => x.w === 'ask')) {
    const seen = !e.object && canSee(s, t, e) !== 'no';
    const a = ask(s, t, { trigger: 'hit', ...(seen ? { by: e.id } : {}), attack: atk.name, total: roll_.total, ac: roll_.ac, ...(roll_.critRoll ? { crit: true } : {}) }, offers.map((x) => x.o));
    if (a === null) for (const x of offers) { if (x.w === 'ask') tellDM(t, x.r, `${t.name} is hit by ${e.object ? 'a trap' : e.name}'s attack.`, ev); }
    else { chosen = offers.find((x) => x.r.id === a.take) ?? null; slot = a.slot; }
  }
  if (!chosen) return null;
  const { r } = chosen, against = e.object ? {} : { against: e.id };
  if (r.kind === 'spell') {
    castReaction(s, t, SPELLS[r.id], slot ?? chosen.slots[0], 'hit', e.object ? null : e.id, ev);
    return { ac: true };
  }
  t.reactionUsed = true;
  if (r.kind === 'trait') {
    ev.push({ type: 'reaction', id: t.id, reaction: r.id, name: r.name, trigger: 'hit', ...against });
    if (r.manual) ev.push({ type: 'manual', actor: t.id, name: r.name, text: r.manual, partial: true });
    return { acAdd: r.ac };
  }
  const x = r.reaction;
  let cut;
  if (x.cut === 'half') cut = { half: true, name: r.name };
  else { const rr = roll(s, x.cut.dice); cut = { less: Math.max(0, rr.total), name: r.name, dice: rr.dice, bonus: rr.bonus }; }
  ev.push({ type: 'reaction', id: t.id, reaction: r.id, name: r.name, trigger: 'hit', ...against, ...(cut.less !== undefined ? { amount: cut.less, dice: cut.dice, bonus: cut.bonus, by: t.id } : {}) });
  if (r.tier !== 'auto') ev.push({ type: 'manual', actor: t.id, name: r.name, text: r.text, partial: true });
  return { cut: cut.half ? { half: true, name: r.name } : { less: cut.less, name: r.name } };
}

// A reaction spell whose trigger is another creature (`cast`: Counterspell; `damaged`: Hellish
// Rebuke) that `t` would take now against `e`: hostile, within the spell's range, seen, and with a
// slot to cast it with. Its instruction decides, or its player when it says `ask`. Casts it and
// returns its source (see castReaction), or returns null.
export function reactAgainst(s, t, e, on, ev, why) {
  if (!canReact(t) || t.object || !e || e.object || e.id === t.id || !hostile(t, e) || !up(e)) return null;
  for (const r of reactionsOf(t)) {
    if (r.on !== on) continue;
    if (r.kind === 'feature' && r.reaction.attack) { if (strikeBack(s, t, e, r, ev, why)) return {}; continue; }
    if (r.kind !== 'spell') continue;
    const w = instruction(t, r);
    if (w === 'never') continue;
    const sp = SPELLS[r.id], slots = slotsFor(s, t, sp);
    if (!slots.length || apart(s, t, e) * FT > (typeof sp.range === 'number' ? sp.range : 0) || canSee(s, t, e) === 'no') continue;
    let slot = slots[0];
    if (w === 'ask') {
      const a = ask(s, t, { trigger: on, by: e.id }, [spellOffer(r, slots)]);
      if (a === null) { tellDM(t, r, why, ev); continue; }
      if (a.take !== r.id) return null;
      slot = a.slot ?? slot;
    }
    return castReaction(s, t, sp, slot, on, e.id, ev, [e.id]);
  }
  return null;
}

// A feature reaction that answers damage with a melee attack (Retaliation: `{ on: 'damaged', attack:
// 'melee', within }`): `t` took damage from `e`, within `within` feet. Its instruction decides, or its
// player when it says `ask`. It attacks with its first melee attack, as an Opportunity Attack is made.
// Returns true if it was taken.
function strikeBack(s, t, e, r, ev, why) {
  const x = r.reaction, atk = (t.attacks ?? []).find((a) => a.type === 'melee');
  if (!atk || t.actions || apart(s, t, e) * FT > x.within) return false;
  if (atk.reach !== undefined && apart(s, t, e) * FT > atk.reach) return false;
  const w = instruction(t, r);
  if (w === 'never') return false;
  if (w === 'ask') {
    const a = ask(s, t, { trigger: 'damaged', by: e.id }, [{ reaction: r.id, name: r.name }]);
    if (a === null) { tellDM(t, r, why, ev); return false; }
    if (a.take !== r.id) return false;
  }
  t.reactionUsed = true;
  ev.push({ type: 'reaction', id: t.id, reaction: r.id, name: r.name, trigger: 'damaged', against: e.id });
  resolveAttack(s, t, e, atk, ev, { reaction: r.id });
  return true;
}

// A weapon attack by a creature whose attacks are still flat records (monsters and
// hand-entered characters). Spells resolve through effect steps instead.
// `brutal`: a Brutal Strike option chosen for this attack ({ id, name, dice, effects, unique? },
// attacks.js, brutalFor): Advantage is given up, and a hit deals `dice` more and then runs the option.
// `cunning`: Cunning Strike options chosen for this attack (attacks.js, cunningFor): their cost in Sneak
// Attack dice is taken off before the dice are rolled, and their steps run after the damage, only if
// Sneak Attack is dealt. One that keeps its creature hidden (Stealth Attack) holds off the attack's
// unhiding to the end of the turn (attacks.js, endTurn); if it is not paid for, the attack unhides it.
export function resolveAttack(s, e, t, atk, ev, extra = {}, { brutal = null, cunning = null } = {}) {
  const keepHidden = !!e.hiding && !!cunning?.some((o) => o.keepHidden);
  const { hit, crit, mode, cut } = rollToHit(s, e, t, atk, ev, extra, { forgo: !!brutal, keepHidden });
  if (!hit) { if (keepHidden) unhide(s, e, ev, 'attack'); return; }
  const rs = [roll(s, atk.damage, { crit })];
  const notes = [];
  if (brutal) { rs.push(roll(s, brutal.dice, { crit })); notes.push(`Brutal Strike: ${brutal.name}`); }
  if (atk.bonusOnAdv && mode === 'adv') rs.push(roll(s, atk.bonusOnAdv, { crit }));
  const sneakKey = `sneak:${e.id}`;
  let paid = null;
  if (e.features.sneak && !atk.spell && (atk.finesse || atk.type === 'ranged') && !s.encounter?.flags[sneakKey] && mode !== 'dis') {
    const flank = living(s).some((o) => o.id !== e.id && up(o) && !incapacitated(o) && hostile(o, t) && apart(s, o, t) <= 1);     // an ally who is not Incapacitated
    if (mode === 'adv' || flank) {
      // Cunning Strike: the dice its effects cost are taken off before the roll.
      const cost = (cunning ?? []).reduce((a, o) => a + o.cost, 0), m = /^(\d+)d(\d+)$/.exec(e.features.sneak);
      rs.push(roll(s, cost && m ? `${+m[1] - cost}d${m[2]}` : e.features.sneak, { crit }));   // cunningFor leaves at least one die
      if (s.encounter) s.encounter.flags[sneakKey] = true;
      notes.push('Sneak Attack', ...(cunning ?? []).map((o) => `Cunning Strike: ${o.name}`));
      paid = cunning;
    }
  }
  if (cunning && !paid) notes.push('No Sneak Attack, so no Cunning Strike');
  if (keepHidden) { if (paid && s.encounter) s.encounter.flags[`stealth:${e.id}`] = true; else unhide(s, e, ev, 'attack'); }
  if (notes.length) ev.push({ type: 'note', id: e.id, text: notes.join(', ') });
  const r = together(...rs);
  damage(s, t, dealt(s, e, t, [{ amount: r.total, type: atk.dtype, dice: r.dice, bonus: r.bonus, by: e.id }], { hit: true, weapon: !atk.spell, ranged: atk.type === 'ranged', ...(atk.abil ? { str: atk.abil === 'str' } : {}) }, crit), null, ev, { crit, ...(cut ? { cut } : {}) });
  if (atk.onHit === 'prone') condition(s, t, 'prone', ev);
  if (brutal && !t.dead) strikeEffect(s, e, t, brutal, ev);
  for (const o of paid ?? []) if (o.effects && !t.dead) strikeEffect(s, e, t, o, ev);
}

// What a choice made for a hit does to its target after the damage (a Brutal Strike option): its
// steps, on a lasting effect bound to its parts when they have an ending. `unique`: an earlier one
// of the same option on that target, from anyone, ends first ("only the most recent one").
// With `duration` (a Cunning Strike's Poison), its steps hang on a lasting effect of that length, dropped
// if they put nothing on the target. The DC of a save that ends what it did is its own save's.
export function strikeEffect(s, e, t, o, ev) {
  if (o.unique) for (const fx of [...effectsOf(s)]) if (fx.option === o.id && fx.parts.some((p) => p.target === t.id && !p.ended)) endEffect(s, ev, fx, `a new ${o.name}`);
  const steps = structuredClone(o.effects);
  let fx = null, dc;
  walkSteps(steps, (x) => { if (dc === undefined && 'save' in x && typeof x.dc === 'number') dc = x.dc; });
  if (o.duration) {
    fx = startEffect(s, { name: o.name, spell: null, source: e.id, conc: false, duration: o.duration });
    ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: e.id, conc: false, lasts: fx.lasts, targets: [t.id] });
  } else fx = boundEffect(s, o.name, e.id, steps);
  if (fx) fx.option = o.id;
  const depth = s.stack?.length ?? 0;
  begin(s, { steps, actor: e.id, targets: [t.id], src: { name: o.name, ...(dc !== undefined ? { dc } : {}), ...(fx ? { fx: fx.id } : {}) } });
  if (depth) run(s, ev, KIT, depth); else resolve(s, ev);
  if (fx?.bound) settle(s, ev, fx, [t]);
  else if (fx && !fx.parts.length) endEffect(s, ev, fx, 'it took no hold');
}

// Run an action's effect steps against its targets. Costs are the caller's. `tag` marks the
// attack event (an Opportunity Attack).
export function runAction(s, e, def, targets, hexes, origin, ev, tag = null) {
  showPlace(s, e, ev);
  for (const t of targets ?? []) if (t.id !== e.id) { if (def.target.creature) showPlace(s, t, ev); else reveal(s, t, ev); }
  const c = def.target.creature;
  // An attack roll says what it is in its own event; anything else (a breath, a gaze) is announced.
  if (!('attack' in def.effects[0])) ev.push({ type: 'act', actor: e.id, action: def.id, name: def.name, hexes, targets: (targets ?? []).map((t) => t.id) });
  const steps = structuredClone(def.effects), fx = boundEffect(s, def.name, e.id, steps);
  begin(s, {
    steps, actor: e.id, targets: targets === null ? null : targets.map((t) => t.id),
    src: { name: def.name, ...(c ? { reach: c.reach, rangeBand: c.range, range: c.range?.[1] ?? c.reach } : {}), ...(origin ? { origin } : {}), ...(tag ? { tag } : {}), ...(fx ? { fx: fx.id } : {}) },
    shared: def.target.area && targets ? sharedRolls(s, def.effects) : null,
  });
  resolve(s, ev);
  if (fx) settle(s, ev, fx, targets ?? []);
}

// ---------- actions ----------

// Run the effect stack to the end, then whatever zones went off while it ran (zones.js).
export function resolve(s, ev) { run(s, ev, KIT); flushZones(s, ev, KIT); }

// The engine's machinery, lent to the effect runner (effects.js) so it need not know our internals.
// Evasion (a built character's `evasion`): only while it is not Incapacitated.
const evades = (t) => !t.object && !incapacitated(t) && (t.feats ?? []).some((f) => f.evasion);

export const KIT = { evades, rollToHit, savingThrow, rerollSave, damage, dealt, heal, tempHp, condition, modifier, judge, objectActor, objectStep, fall, push, reveal, renew, teleport, cure, kill, breakConcentration };

