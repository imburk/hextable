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
import { SPELLS, TILES, MONSTERS } from './content/srd52.js';

export const FT = 5;                 // feet per hex
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
  if (!e || !up(e)) return new Map();
  const enc = s.encounter, fighting = inFight(s, e.id);
  if (fighting && current(s) !== e.id) return new Map();
  const occ = occupancy(s);
  const reach = H.reachable(e.pos, fighting ? enc.budget.move : EXPLORE_BUDGET, (h) => {
    const k = H.key(h), tile = s.map.tiles[k];
    if (!tile) return Infinity;
    if (fighting && !enc.arena[k]) return Infinity;                       // the arena is locked
    if ((occ.get(k) || []).some((o) => hostile(o, e) && up(o))) return Infinity;
    return TILES[tile.t].cost * FT;
  });
  const here = H.key(e.pos);
  for (const [k, v] of reach) v.canStop = k !== here && !(occ.get(k) || []).some((o) => o.id !== e.id);
  return reach;
}

function threatsAt(s, e, pos) {
  return fighters(s).filter((o) =>
    o.id !== e.id && up(o) && hostile(o, e) && !o.reactionUsed &&
    o.attacks.some((a) => a.type === 'melee') && H.dist(o.pos, pos) <= 1);
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
const rollInit = (s, e) => ({ id: e.id, init: die(s, 20) + mod(e.abil.dex), dex: e.abil.dex });

function startEncounter(s, center, ev, radius = ARENA_RADIUS) {
  const arena = {};
  for (const h of H.range(center, radius)) if (s.map.tiles[H.key(h)]) arena[H.key(h)] = 1;
  const who = living(s).filter((e) => arena[H.key(e.pos)]);
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
  else if (e.death.s >= 3) e.cond.stable = true;
  ev.push({ type: 'deathSave', id: e.id, roll: d, s: e.death.s, f: e.death.f, dead: e.dead, stable: !!e.cond.stable, hp: e.hp });
}

function advanceTurn(s, ev) {
  const enc = s.encounter;
  for (let guard = 0; guard < enc.order.length * 2 + 2; guard++) {
    enc.turn++;
    if (enc.turn >= enc.order.length) { enc.turn = 0; enc.round++; s.clock += 0.1; }
    const e = s.entities[enc.order[enc.turn].id];
    if (!e || e.dead) continue;
    if (e.hp <= 0) {
      if (!e.cond.stable) deathSave(s, e, ev);
      if (e.hp <= 0) continue;
    }
    enc.flags = {};
    enc.budget = { move: e.speed, action: 1, bonus: 1 };
    e.reactionUsed = false;
    delete e.cond.dodging;
    ev.push({ type: 'turn', id: e.id, round: enc.round });
    if (e.cond.prone) {
      delete e.cond.prone;
      enc.budget.move -= Math.floor(e.speed / 2 / FT) * FT;
      ev.push({ type: 'stood', id: e.id });
    }
    return;
  }
  endEncounter(s, ev, 'stalemate');
}

// ---------- damage, healing, attacks ----------

function damage(s, t, amount, dtype, ev, { crit = false } = {}) {
  let n = amount;
  if (t.immune.includes(dtype)) n = 0;
  else if (t.resist.includes(dtype)) n = Math.floor(n / 2);
  else if (t.vuln.includes(dtype)) n *= 2;
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
  if (t.hp > 0) return;
  if (t.kind === 'pc' && n - before < t.maxHp) {          // otherwise: instant death from massive damage
    t.cond.unconscious = true; t.cond.prone = true; t.death = { s: 0, f: 0 };
    ev.push({ type: 'down', id: t.id });
  } else { t.dead = true; ev.push({ type: 'died', id: t.id }); }
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

// Advantage and Disadvantage from the situation. Any of each cancels to a normal roll.
export function rollMode(s, e, t, atk) {
  const d = H.dist(e.pos, t.pos), ranged = atk.type === 'ranged', adv = [], dis = [];
  if (t.cond.unconscious) adv.push('target unconscious');
  if (t.cond.prone) (d <= 1 ? adv : dis).push('target prone');
  if (e.features.packTactics && living(s).some((o) => o.id !== e.id && up(o) && !hostile(o, e) && H.dist(o.pos, t.pos) <= 1))
    adv.push('Pack Tactics');
  if (t.cond.dodging) dis.push('target dodging');
  if (e.cond.prone) dis.push('attacker prone');
  if (ranged && d * FT > atk.range[0]) dis.push('long range');
  if (ranged && living(s).some((o) => up(o) && hostile(o, e) && H.dist(o.pos, e.pos) <= 1)) dis.push('enemy within 5 ft');
  return { mode: adv.length && !dis.length ? 'adv' : dis.length && !adv.length ? 'dis' : 'normal', adv, dis };
}

function resolveAttack(s, e, t, atk, ev, extra = {}) {
  const { mode, adv, dis } = rollMode(s, e, t, atk);
  const r1 = die(s, 20), r2 = mode === 'normal' ? null : die(s, 20);
  const nat = mode === 'adv' ? Math.max(r1, r2) : mode === 'dis' ? Math.min(r1, r2) : r1;
  const hit = nat !== 1 && (nat === 20 || nat + atk.bonus >= t.ac);
  const crit = hit && (nat === 20 || (!!t.cond.unconscious && H.dist(e.pos, t.pos) <= 1));
  ev.push({ type: 'attack', actor: e.id, target: t.id, name: atk.name, rolls: r2 ? [r1, r2] : [r1], nat,
    total: nat + atk.bonus, ac: t.ac, mode, why: mode === 'adv' ? adv : mode === 'dis' ? dis : [], hit, crit, ...extra });
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
  if (atk.onHit === 'prone' && up(t) && !t.cond.prone) { t.cond.prone = true; ev.push({ type: 'cond', id: t.id, cond: 'prone' }); }
}

function savingThrow(s, t, abil, dc) {
  if (t.cond.unconscious && (abil === 'str' || abil === 'dex')) return { roll: 0, total: 0, success: false };
  const r = die(s, 20), total = r + mod(t.abil[abil]) + (t.saveProf.includes(abil) ? t.prof : 0);
  return { roll: r, total, success: total >= dc };
}

// Hexes an area spell would cover if aimed at `aim`.
export function areaHexes(s, e, sp, aim) {
  if (!sp.area || !aim) return [];
  const hexes = sp.area.shape === 'cone' ? H.cone(e.pos, aim, sp.area.size / FT) : [];
  return hexes.filter((h) => s.map.tiles[H.key(h)]);
}

// Why this creature can't take an action/bonus action right now ('' if it can).
export function blocked(s, e, time = 'action') {
  if (!up(e)) return `${e.name} is down.`;
  if (!s.encounter) return '';
  if (!inFight(s, e.id)) return `${e.name} is outside the battle. Move into the arena to join.`;
  if (current(s) !== e.id) return `It isn't ${e.name}'s turn.`;
  if (s.encounter.budget[time] < 1) return `${e.name} has already used ${time === 'bonus' ? 'a Bonus Action' : 'an action'} this turn.`;
  return '';
}
const need = (s, e, time) => { const why = blocked(s, e, time); if (why) fail(why); };

// Creature ids a given attack or spell could legally target right now (range only).
export function targetsFor(s, e, { attack, spell }) {
  const out = [];
  for (const t of living(s)) {
    const d = H.dist(e.pos, t.pos) * FT;
    if (attack) {
      const atk = e.attacks.find((a) => a.id === attack);
      if (t.id !== e.id && d <= (atk.type === 'melee' ? atk.reach : atk.range[1])) out.push(t.id);
    } else {
      const sp = SPELLS[spell];
      if (sp.area) continue;
      if (sp.kind === 'heal' ? d <= sp.range : t.id !== e.id && d <= sp.range) out.push(t.id);
    }
  }
  return out;
}

// ---------- actions ----------

const handlers = {
  move(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    up(e) || fail(`${e.name} can't move.`);
    const fighting = inFight(s, e.id);
    if (fighting && current(s) !== e.id) fail(`It isn't ${e.name}'s turn.`);
    const reach = moveOptions(s, e);
    let tk = H.key(a.to), node = reach.get(tk);
    // Walking onto a hex where something unseen is standing: stop beside it and find out what it
    // is. Refusing the move would tell the player something is there without saying what.
    const lurker = fighting ? null : living(s).find((o) => o.hidden && hostile(o, e) && H.key(o.pos) === tk);
    if (lurker) {
      if (H.dist(e.pos, lurker.pos) <= 1) return reveal(s, lurker, ev);      // already beside it: no move, but it is found
      const beside = H.neighbors(a.to).map(H.key).filter((k) => reach.get(k)?.canStop)
        .sort((x, y) => reach.get(x).cost - reach.get(y).cost)[0];
      if (!beside) fail("Can't get there.");
      tk = beside; node = reach.get(tk);
    }
    if (!node || !node.canStop) {
      if (!s.map.tiles[tk]) fail("There's nothing there to stand on.");
      if (fighting && !s.encounter.arena[tk]) fail("The arena is locked until the fight ends.");
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
      if (fighting && s.encounter) s.encounter.budget.move -= TILES[s.map.tiles[k].t].cost * FT;
      e.pos = step; seg.push(step); prev = step;
      if (fighting) continue;
      // Anything lying in wait this close is spotted, whether or not a fight follows.
      for (const o of living(s)) if (o.hidden && hostile(o, e) && H.dist(o.pos, e.pos) <= ENGAGE_RANGE) { flush(); reveal(s, o, ev); }
      const free = !living(s).some((o) => o.id !== e.id && H.key(o.pos) === k);
      if (s.encounter && s.encounter.arena[k] && free) { flush(); joinEncounter(s, e, ev); break; }
      if (!s.encounter && s.settings.autoEngage && free &&
          living(s).some((o) => up(o) && hostile(o, e) && H.dist(o.pos, e.pos) <= ENGAGE_RANGE)) {
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
    !t.dead || fail(`${t.name} is already dead.`);
    e.id !== t.id || fail("A creature can't attack itself.");
    checkRange(e, t, atk);
    if (!s.encounter) return engage(s, e, t, ev);                 // roll initiative first
    need(s, e, 'action');
    inFight(s, t.id) || fail(`${t.name} is outside the battle.`);
    s.encounter.budget.action--;
    resolveAttack(s, e, t, atk, ev);
    checkEnd(s, ev);
  },

  cast(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    const sp = SPELLS[a.spell];
    (sp && e.spells.includes(a.spell)) || fail(`${e.name} doesn't know that spell.`);
    up(e) || fail(`${e.name} is down.`);
    const harmful = sp.kind !== 'heal';
    let targets = [], hexes = null;
    if (sp.area) {
      (a.hex && H.dist(a.hex, e.pos) > 0) || fail(`Pick a direction for ${sp.name}.`);
      hexes = areaHexes(s, e, sp, a.hex);
      const keys = new Set(hexes.map(H.key));
      targets = living(s).filter((t) => keys.has(H.key(t.pos)));
    } else {
      const t = ent(s, a.target);
      !t.dead || fail(`${t.name} is dead.`);
      if (harmful && t.id === e.id) fail(`${sp.name} needs another target.`);
      const d = H.dist(e.pos, t.pos);
      if (d * FT > sp.range) fail(`${t.name} is ${ft(d)} away. ${sp.name} reaches ${sp.range === 5 ? 'touch (5 ft)' : sp.range + ' ft'}.`);
      targets = [t];
    }
    if (sp.level > 0 && !(e.slots[sp.level] > 0)) fail(`${e.name} has no level ${sp.level} spell slots left.`);
    if (!s.encounter && harmful) return sp.area ? startEncounter(s, e.pos, ev) : engage(s, e, targets[0], ev);
    if (s.encounter) {
      need(s, e, sp.time);
      if (sp.level > 0 && s.encounter.flags.slot) fail('Only one spell slot can be spent per turn.');
      for (const t of targets) inFight(s, t.id) || sp.area || fail(`${t.name} is outside the battle.`);
      s.encounter.budget[sp.time]--;
      if (sp.level > 0) s.encounter.flags.slot = true;
    }
    if (sp.level > 0) e.slots[sp.level]--;
    for (const t of targets) reveal(s, t, ev);         // caught in the area: no longer unseen
    const st = spellStats(e);
    ev.push({ type: 'cast', actor: e.id, spell: a.spell, name: sp.name, hexes, targets: targets.map((t) => t.id) });
    if (sp.kind === 'attack') {
      resolveAttack(s, e, targets[0], { name: sp.name, type: 'ranged', spell: true, bonus: st.attack, damage: sp.damage, dtype: sp.dtype, range: [sp.range, sp.range] }, ev);
    } else if (sp.kind === 'auto') {
      let total = 0;
      for (let i = 0; i < (sp.darts || 1); i++) total += roll(s, sp.damage).total;
      damage(s, targets[0], total, sp.dtype, ev);
    } else if (sp.kind === 'save') {
      const full = sp.area ? roll(s, sp.damage).total : null;     // one roll for everyone in an area
      for (const t of targets) {
        const sv = savingThrow(s, t, sp.save, st.dc);
        ev.push({ type: 'save', id: t.id, abil: sp.save, dc: st.dc, ...sv });
        const dmg = full ?? roll(s, sp.damage).total;
        if (!sv.success) damage(s, t, dmg, sp.dtype, ev);
        else if (sp.half) damage(s, t, Math.floor(dmg / 2), sp.dtype, ev);
      }
    } else if (sp.kind === 'heal') {
      heal(s, targets[0], roll(s, sp.heal).total + mod(e.abil[e.castAbil]), ev);
    }
    checkEnd(s, ev);
  },

  dash(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    s.encounter || fail('Dash only matters in a fight. Just move.');
    need(s, e, 'action');
    s.encounter.budget.action--; s.encounter.budget.move += e.speed;
    ev.push({ type: 'std', id: e.id, action: 'Dash' });
  },
  disengage(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    s.encounter || fail('Disengage only matters in a fight.');
    const time = e.features.nimbleEscape ? 'bonus' : 'action';
    need(s, e, time);
    s.encounter.budget[time]--; e.cond.disengaged = true;
    ev.push({ type: 'std', id: e.id, action: 'Disengage' });
  },
  dodge(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    s.encounter || fail('Dodge only matters in a fight.');
    need(s, e, 'action');
    s.encounter.budget.action--; e.cond.dodging = true;
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
    advanceTurn(s, ev);
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
    s.map.tiles[H.key(a.at)] && TILES[s.map.tiles[H.key(a.at)].t].cost < Infinity || fail("A creature can't stand there.");
    !living(s).some((o) => H.key(o.pos) === H.key(a.at)) || fail('That hex is occupied.');
    const id = `m${++s.seq}`;
    const n = Object.values(s.entities).filter((o) => o.tpl === a.monster).length + 1;
    s.entities[id] = makeEntity(tpl, { id, tpl: a.monster, name: a.name || `${tpl.name} ${n}`, pos: a.at, ...(a.hidden ? { hidden: true } : {}) });
    ev.push({ type: 'spawned', id });
    if (s.encounter?.arena[H.key(a.at)]) joinEncounter(s, s.entities[id], ev);
  },
  place(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can place creatures.');
    const e = ent(s, a.actor);
    s.map.tiles[H.key(a.to)] || fail("There's nothing there to stand on.");
    !living(s).some((o) => o.id !== e.id && H.key(o.pos) === H.key(a.to)) || fail('That hex is occupied.');
    e.pos = a.to;
    ev.push({ type: 'placed', id: e.id, to: a.to });
    if (s.encounter?.arena[H.key(a.to)] && !inFight(s, e.id) && !e.dead) joinEncounter(s, e, ev);
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
  },
  advanceTime(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can advance time.');
    !s.encounter || fail('Time moves in rounds during a fight.');
    a.minutes > 0 || fail('Time only moves forward.');
    s.clock += a.minutes;
    ev.push({ type: 'time', minutes: a.minutes });
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
