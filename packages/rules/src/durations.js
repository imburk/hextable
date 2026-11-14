// Things that last: a spell's lasting effect, how long it runs, what ends it, and Concentration.
//
// A lasting effect is a record in state.effects:
//   { id, name, spell, source, conc, lasts, until, parts }
//   until: null (only the DM ends it) | { clock } (world time, in minutes)
//          | { enc, round } (in a fight: the start of the source's turn in that round)
//   parts: what it put on creatures, so ending it takes exactly that off again:
//          { target, cond, ends?, dc?, born? }, { target, modifier, ends?, dc?, born?, against? }
//          or { target, temp: true }. `born` names the turn it was made in (turnKey).
// A part with `ends.on: 'damaged'` ends when its creature takes damage (damaged()).
// A part with its own turn boundary (`ends.on` turnStart or turnEnd) keeps to it: "until the end
// of your next turn" outlasts a spell's "1 round" (Guiding Bolt), and the effect stays until it
// ends. A spell with no duration of its own whose parts carry such an ending (Ray of Frost) gets
// an effect anyway, `bound`, that ends when its parts do.
// Ending an effect removes its parts. Design: docs/specs/rules-expansion.md.
import { has, incapacitated } from './modifiers.js';
import { leaveForm } from './forms.js';

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
  // A Hit Point maximum it raised comes down again; current Hit Points stay within it.
  if (p.hpMax && t && !t.dead) { t.maxHp -= p.hpMax; t.hp = Math.min(t.hp, t.maxHp); ev.push({ type: 'maxHp', id: t.id, maxHp: t.maxHp, hp: t.hp }); }
  // A form it held ends: what the form replaced is put back (forms.js).
  if (p.form && t?.form?.fx === fx.id) { leaveForm(t); ev.push({ type: 'form', id: t.id, form: null }); }
  // Temporary Hit Points that came from this effect vanish with it (those from elsewhere since stay).
  if (p.temp && t?.tempFx === fx.id) { const lost = t.tempHp ?? 0; t.tempHp = 0; delete t.tempFx; if (lost) ev.push({ type: 'tempHp', id: t.id, amount: -lost, tempHp: 0 }); }
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

// The turn now being taken, as a part records it: a part made in a creature's turn does not end
// at the end of that same turn ("until the end of its next turn").
export const turnKey = (s) => (s.encounter ? `${s.encounter.id}:${s.encounter.round}:${s.encounter.turn}` : null);
const ownTiming = (p) => !p.ended && (p.ends?.on === 'turnStart' || p.ends?.on === 'turnEnd');

// An effect's time ran out: it ends, except parts that keep their own turn boundary.
function expire(s, ev, fx) {
  if (!fx.parts.some(ownTiming)) return endEffect(s, ev, fx, 'its time ran out');
  for (const p of fx.parts) if (!ownTiming(p)) endPart(s, ev, fx, p);
  fx.until = null; fx.bound = true;
}

// The world clock moved: end whatever has run out.
export function tick(s, ev) {
  for (const fx of [...effectsOf(s)]) if (fx.until?.clock !== undefined && fx.until.clock <= s.clock + EPS) expire(s, ev, fx);
}

// A new round began. Effects timed in rounds normally end on their source's turn; this catches
// those whose source no longer takes turns.
export function roundStarted(s, ev) {
  const enc = s.encounter;
  for (const fx of [...effectsOf(s)]) if (fx.until?.enc === enc.id && enc.round > fx.until.round) expire(s, ev, fx);
  tick(s, ev);
}

// `who`: the creature whose turn it was when the part was made ("until the end of the current turn":
// Multiattack Defense, Superior Hunter's Defense).
const whose = (fx, p) => (p.ends.of === 'source' ? fx.source : p.ends.who ?? p.target);

function boundary(s, ev, e, kit, when) {
  const enc = s.encounter, now = turnKey(s);
  for (const fx of [...effectsOf(s)]) {
    if (when === 'turnStart' && fx.until?.enc === enc?.id && fx.source === e.id && enc.round >= fx.until.round) { expire(s, ev, fx); if (!effectsOf(s).includes(fx)) continue; }
    for (const p of fx.parts) {
      if (p.ended || !p.ends) continue;
      if (p.ends.on === when && whose(fx, p) === e.id && !(when === 'turnEnd' && p.born === now)) endPart(s, ev, fx, p);
      else if (p.ends.on === 'save' && p.ends.at === when && p.target === e.id) {
        const { used, ...sv } = kit.savingThrow(s, e, p.ends.save, p.dc, null, null, null, null, null, p.cond ? [p.cond] : null);
        ev.push({ type: 'save', id: e.id, abil: p.ends.save, dc: p.dc, ...sv, against: fx.name });
        useUp(s, ev, used ?? []);
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

// A creature took damage, from `by` (a creature's id, or null): what was to end when it did ends
// (`ends.on: 'damaged'`: Turn Undead's and Abjure Foes' Frightened, "until it takes any damage";
// with `by: 'source'`, only damage from the effect's source or its allies: Charm Monster), and a
// save repeated whenever it takes damage is made (`ends: { on: 'save', at: 'damaged' }`: Dominate Monster).
export function damaged(s, ev, t, by = null, kit = null) {
  const side = (id) => s.entities[id]?.side;
  for (const fx of [...effectsOf(s)]) {
    for (const p of fx.parts) {
      if (p.ended || p.target !== t.id || !p.ends) continue;
      if ((p.ends.on === 'damaged' || p.ends.orDamaged) && (p.ends.by !== 'source' || (by !== null && side(by) !== undefined && side(by) === side(fx.source)))) endPart(s, ev, fx, p);
      else if (p.ends.on === 'save' && p.ends.at === 'damaged' && kit && !t.dead) {
        const { used, ...sv } = kit.savingThrow(s, t, p.ends.save, p.dc, null, null, null, null, null, p.cond ? [p.cond] : null);
        ev.push({ type: 'save', id: t.id, abil: p.ends.save, dc: p.dc, ...sv, against: fx.name });
        useUp(s, ev, used ?? []);
        if (sv.success) endPart(s, ev, fx, p);
      }
    }
    if (spent(fx)) endEffect(s, ev, fx, `${t.name} took damage`);
  }
}

// Parts used up (a modifier with `uses: 1` that has just applied: Guiding Bolt's Advantage).
export function useUp(s, ev, parts) {
  for (const p of parts) {
    const fx = effectsOf(s).find((x) => x.parts.includes(p));
    if (!fx || p.ended) continue;
    endPart(s, ev, fx, p);
    if (spent(fx)) endEffect(s, ev, fx, 'it was used');
  }
}

// ---------- Concentration ----------

export const concentrating = (s, id) => effectsOf(s).filter((fx) => fx.conc && fx.source === id);
export function breakConcentration(s, ev, id, why) {
  for (const fx of concentrating(s, id)) endEffect(s, ev, fx, why);
}
// Damage to someone concentrating: a Constitution save, DC 10 or half the damage if higher, at most 30.
export function concentrationCheck(s, ev, t, amount, kit) {
  // Relentless Hunter (`steadfast: { spell }`): damage can't break Concentration on that spell.
  const held = concentrating(s, t.id).filter((fx) => !(t.feats ?? []).some((f) => f.steadfast && f.steadfast.spell === fx.spell));
  if (!held.length || amount <= 0) return;
  const dc = Math.min(30, Math.max(10, Math.floor(amount / 2)));
  const { used, ...sv } = kit.savingThrow(s, t, 'con', dc, 'concentration');
  ev.push({ type: 'concentration', id: t.id, dc, ...sv, name: held.map((fx) => fx.name).join(', ') });
  useUp(s, ev, used ?? []);
  if (!sv.success) breakConcentration(s, ev, t.id, `${t.name} lost Concentration`);
}
// Anything that stops a creature acting also ends what it was concentrating on.
export function concentrationLost(s, ev, t, why) {
  if (!(t.dead || t.hp <= 0 || incapacitated(t))) return;
  breakConcentration(s, ev, t.id, why);
  // Rage ends on being Incapacitated; `fragile: 'unconscious'` only on being Unconscious (Persistent Rage), or down or dead.
  const ends = (fx) => fx.fragile === true || t.dead || t.hp <= 0 || has(t, fx.fragile);
  for (const fx of effectsOf(s).filter((x) => x.fragile && x.source === t.id && ends(x))) endEffect(s, ev, fx, why);
}
