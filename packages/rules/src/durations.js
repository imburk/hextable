// Things that last: a spell's lasting effect, how long it runs, what ends it, and Concentration.
//
// A lasting effect is a record in state.effects:
//   { id, name, spell, source, conc, lasts, until, parts }
//   until: null (only the DM ends it) | { clock } (world time, in minutes)
//          | { enc, round } (in a fight: the start of the source's turn in that round)
//   parts: what it put on creatures, so ending it takes exactly that off again:
//          { target, cond, ends?, dc? } or { target, modifier }
// Ending an effect removes its parts. Design: docs/specs/rules-expansion.md.
import { incapacitated } from './modifiers.js';

export const ROUND = 0.1;                 // one round is six seconds; the world clock counts minutes
const EPS = 1e-6;                         // rounds are added as 0.1, which does not sum exactly
const DURATION = /^(\d+) (round|minute|hour|day)s?$/;
const MINUTES = { round: ROUND, minute: 1, hour: 60, day: 1440 };

// "1 minute" -> 1, "10 rounds" -> 1, "instant" -> 0, "until dispelled" -> null (cannot be timed).
export function durationMinutes(text) {
  if (text === 'instant') return 0;
  const m = DURATION.exec(text);
  return m ? +m[1] * MINUTES[m[2]] : null;
}

export const effectsOf = (s) => (s.effects ??= []);
const inFight = (s, id) => !!s.encounter && s.encounter.order.some((o) => o.id === id);

export function startEffect(s, { name, spell, source, conc, duration }) {
  const minutes = durationMinutes(duration);
  const fx = {
    id: `fx${++s.seq}`, name, spell, source, conc: !!conc, lasts: duration, parts: [],
    until: minutes === null ? null
      : inFight(s, source) ? { enc: s.encounter.id, round: s.encounter.round + Math.round(minutes / ROUND) }
      : { clock: s.clock + minutes },
  };
  effectsOf(s).push(fx);
  return fx;
}

function endPart(s, ev, fx, p) {
  if (p.ended) return;
  p.ended = true;
  const t = s.entities[p.target];
  if (p.cond && t?.cond[p.cond]?.effect === fx.id) { delete t.cond[p.cond]; ev.push({ type: 'condEnd', id: t.id, cond: p.cond }); }
}
const targetsOf = (fx) => [...new Set(fx.parts.map((p) => p.target))];

export function endEffect(s, ev, fx, why) {
  if (!effectsOf(s).includes(fx)) return;
  s.effects = s.effects.filter((x) => x !== fx);
  for (const p of fx.parts) endPart(s, ev, fx, p);
  ev.push({ type: 'effectEnd', fx: fx.id, name: fx.name, source: fx.source, targets: targetsOf(fx), why });
}
// An effect whose every part has ended has nothing left to do.
const spent = (fx) => fx.parts.length > 0 && fx.parts.every((p) => p.ended);

// The world clock moved: end whatever has run out.
export function tick(s, ev) {
  for (const fx of [...effectsOf(s)]) if (fx.until?.clock !== undefined && fx.until.clock <= s.clock + EPS) endEffect(s, ev, fx, 'its time ran out');
}

// A new round began. Effects timed in rounds normally end on their source's turn; this catches
// those whose source no longer takes turns.
export function roundStarted(s, ev) {
  const enc = s.encounter;
  for (const fx of [...effectsOf(s)]) if (fx.until?.enc === enc.id && enc.round > fx.until.round) endEffect(s, ev, fx, 'its time ran out');
  tick(s, ev);
}

const whose = (fx, p) => (p.ends.of === 'source' ? fx.source : p.target);

function boundary(s, ev, e, kit, when) {
  const enc = s.encounter;
  for (const fx of [...effectsOf(s)]) {
    if (when === 'turnStart' && fx.until?.enc === enc?.id && fx.source === e.id && enc.round >= fx.until.round) { endEffect(s, ev, fx, 'its time ran out'); continue; }
    for (const p of fx.parts) {
      if (p.ended || !p.ends) continue;
      if (p.ends.on === when && whose(fx, p) === e.id) endPart(s, ev, fx, p);
      else if (p.ends.on === 'save' && p.ends.at === when && p.target === e.id) {
        const sv = kit.savingThrow(s, e, p.ends.save, p.dc);
        ev.push({ type: 'save', id: e.id, abil: p.ends.save, dc: p.dc, ...sv, against: fx.name });
        if (sv.success) endPart(s, ev, fx, p);
      }
    }
    if (spent(fx)) endEffect(s, ev, fx, 'nothing is left of it');
  }
}
export const turnStarted = (s, ev, e, kit) => boundary(s, ev, e, kit, 'turnStart');
export const turnEnded = (s, ev, e, kit) => boundary(s, ev, e, kit, 'turnEnd');

// The fight is ending (call before the encounter is cleared). Whatever was counted in rounds
// carries on by the clock, and whatever was waiting for a turn boundary ends now.
export function fightOver(s, ev) {
  const enc = s.encounter;
  for (const fx of [...effectsOf(s)]) {
    if (fx.until?.enc === enc.id) fx.until = { clock: s.clock + Math.max(0, fx.until.round - enc.round) * ROUND };
    for (const p of fx.parts) if (!p.ended && (p.ends?.on === 'turnStart' || p.ends?.on === 'turnEnd')) endPart(s, ev, fx, p);
    if (spent(fx)) endEffect(s, ev, fx, 'the fight ended');
  }
  tick(s, ev);
}

// ---------- Concentration ----------

export const concentrating = (s, id) => effectsOf(s).filter((fx) => fx.conc && fx.source === id);
export function breakConcentration(s, ev, id, why) {
  for (const fx of concentrating(s, id)) endEffect(s, ev, fx, why);
}
// Damage to someone concentrating: a Constitution save, DC 10 or half the damage if higher, at most 30.
export function concentrationCheck(s, ev, t, amount, kit) {
  const held = concentrating(s, t.id);
  if (!held.length || amount <= 0) return;
  const dc = Math.min(30, Math.max(10, Math.floor(amount / 2)));
  const sv = kit.savingThrow(s, t, 'con', dc, 'concentration');
  ev.push({ type: 'concentration', id: t.id, dc, ...sv, name: held.map((fx) => fx.name).join(', ') });
  if (!sv.success) breakConcentration(s, ev, t.id, `${t.name} lost Concentration`);
}
// Anything that stops a creature acting also ends what it was concentrating on.
export function concentrationLost(s, ev, t, why) {
  if (t.dead || t.hp <= 0 || incapacitated(t)) breakConcentration(s, ev, t.id, why);
}
