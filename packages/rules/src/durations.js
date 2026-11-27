// Things that last: a spell's lasting effect, how long it runs, what ends it, and Concentration.
//
// A lasting effect is a record in state.effects:
//   { id, name, spell, source, conc, lasts, until, parts, level?, aimed? }
//   aimed: for a spell cast at creatures or at its caster, the ids it was aimed at and could affect (state version 31): where no part is on any of
//          them (the DM applies the spell), Dispel Magic takes the spell to be on each.
//   level: for a spell, the level it was cast at (the slot's, or the spell's own; 0 for a cantrip): what Dispel Magic reads (state version 31).
//          A spell's effect without one (a bound effect, one from before version 31 the migration could not read) counts at the spell's own level.
//   until: null (only the DM ends it) | { clock } (world time, in minutes)
//          | { enc, round } (in a fight: the start of the source's turn in that round)
//   parts: what it put on creatures, so ending it takes exactly that off again:
//          { target, cond, ends?, dc?, born? }, { target, modifier, ends?, dc?, born?, against? }
//          { target, confuse: { had } } (a `confuse` step: Confusion; `had` is what its Reaction was before),
//          { target, turn: { steps, src } } (an `eachTurn` step: what the effect runs on the creature at the start of each of its turns, effects.js `turnSteps`;
//          never sent to players), { target, meld: true } (a `meld` step: Meld into Stone; the creature's `melded` mark names this effect, and ending the effect
//          brings it out of the stone: see `ON.meldEnd`), { target, light: true } (a light it gave to carry), { target, size: { was, now } } (a size it gave: Enlarge/Reduce), or { target, temp: true }, or { target, summon: true }, or { target, bond: true } (stage C5b: what keeps a
//          raised creature under control). `born` names the turn it was made in (turnKey).
// A `summon` part is the creature a spell made (docs/specs/companions.md, Decision 4): its bond names the
// effect (`bond.fx`), and once the part has ended, or the effect has, the creature vanishes ('ended'). Ending
// the part takes nothing off here: the creature leaves the map in settleBonds (engine/resolve.js), after the
// action, as every bonded creature does. If the creature goes first (0 Hit Points), its part ends with it and
// an effect that held nothing else ends too (vanish).
// A part with `ends.on: 'damaged'` ends when its creature takes damage (damaged()).
// A part with its own turn boundary (`ends.on` turnStart or turnEnd) keeps to it: "until the end
// of your next turn" outlasts a spell's "1 round" (Guiding Bolt), and the effect stays until it
// ends. A spell with no duration of its own whose parts carry such an ending (Ray of Frost) gets
// an effect anyway, `bound`, that ends when its parts do.
// Ending an effect removes its parts. Design: docs/specs/rules-expansion.md.
import { has, incapacitated } from './modifiers.js';
import { submerged } from './space.js';
import { leaveForm } from './forms.js';
import { homebrewBlock, srcOf } from './homebrew.js';

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

// Is anyone under the surface of water now (space.js `submerged`)?
const anyUnder = (s) => Object.values(s.entities ?? {}).some((e) => !e.dead && submerged(s, e));
export const effectsOf = (s) => (s.effects ??= []);
const inFight = (s, id) => !!s.encounter && s.encounter.order.some((o) => o.id === id);

export function startEffect(s, { name, spell, source, conc, duration, level }) {
  const minutes = durationMinutes(duration);
  const fx = {
    id: `fx${++s.seq}`, name, spell, source, conc: !!conc, lasts: duration, parts: [], ...(Number.isInteger(level) ? { level } : {}),
    until: minutes === null ? null
      : inFight(s, source) ? { enc: s.encounter.id, round: s.encounter.round + Math.round(minutes / ROUND) }
      : { clock: s.clock + minutes },
  };
  // Made by a creature that carries a homebrew block: it is remembered, so that the effect's saves, and what is sent of it, stay told as the
  // creature's even when it has left the map or lost the block (view.js, homebrew.js). Who ran the creature (`by`; null: the DM) is put to
  // it at the end of the action (engine.js, stampHomebrew): the rules of who runs it are in engine/shared.js, which this module may not import.
  if (homebrewBlock(s.entities[source])) fx.hbSrc = { id: source };
  effectsOf(s).push(fx);
  return fx;
}

// Things this module cannot do itself because they need the engine's placing and zones (engine/resolve.js sets them when it loads): a creature merged
// with stone comes out of it (`meldEnd(s, ev, creature, melded)`), at the place it went in or the nearest one free.
export const ON = { meldEnd: null, sizeEnd: null, breath: null };

function endPart(s, ev, fx, p) {
  if (p.ended) return;
  p.ended = true;
  const t = s.entities[p.target];
  if (p.cond && t?.cond[p.cond]?.effect === fx.id) { delete t.cond[p.cond]; ev.push({ type: 'condEnd', id: t.id, cond: p.cond }); }
  // A Hit Point maximum it raised comes down again; current Hit Points stay within it.
  if (p.hpMax && t && !t.dead) { t.maxHp -= p.hpMax; t.hp = Math.min(t.hp, t.maxHp); ev.push({ type: 'maxHp', id: t.id, maxHp: t.maxHp, hp: t.hp }); }
  // A form it held ends: what the form replaced is put back (forms.js).
  if (p.form && t?.form?.fx === fx.id) {
    // The size the form puts back (`form.kept.size`) already carries every change of size made under it or before it (engine/world.js `resize`); those changes are in the creature's own size from now on.
    const formSize = t.size;
    leaveForm(t);
    for (const x of effectsOf(s)) for (const q of x.parts) if (q.under === fx.id) delete q.under;
    ev.push({ type: 'form', id: t.id, form: null });
    if (t.size !== formSize) ev.push({ type: 'size', id: t.id, size: t.size });
  }
  // Confusion ends on it (a `confuse` step): its Reaction comes back as it was, unless another Confusion still holds it.
  if (p.confuse && t && !t.dead && !effectsOf(s).some((x) => x.parts.some((q) => q !== p && q.confuse && !q.ended && q.target === t.id))) t.reactionUsed = !!p.confuse.had;
  // The stone lets go of a creature merged with it (a `meld` step: Meld into Stone): its mark goes, and it comes out where it went in.
  if (p.meld && t?.melded?.fx === fx.id) { const m = t.melded; delete t.melded; if (!t.dead) ON.meldEnd?.(s, ev, t, m); }
  // A size it gave goes back (a `resize` step: Enlarge/Reduce): what it was, if the creature is still the size the effect left it; engine/world.js `sizeEnd` says whether there is room.
  if (p.size && t) ON.sizeEnd?.(s, ev, t, p.size.was, p.size.now, fx.name);
  // A light it gave goes out (a `light` step: Light).
  if (p.light && t?.light?.fx === fx.id) { delete t.light; ev.push({ type: 'light', id: t.id, bright: 0, dim: 0 }); }
  // An action a spell gave it goes (an `arm` step: Flame Blade).
  if (p.arm && t?.actions) { t.actions = t.actions.filter((x) => !(x.id === p.arm && x.armed === fx.id)); if (ev) ev.push({ type: 'note', id: t.id, text: `${fx.name}: ${t.name} no longer has it` }); }
  // Temporary Hit Points that came from this effect vanish with it (those from elsewhere since stay).
  if (p.temp && t?.tempFx === fx.id) { const lost = t.tempHp ?? 0; t.tempHp = 0; delete t.tempFx; if (lost) ev.push({ type: 'tempHp', id: t.id, amount: -lost, tempHp: 0 }); }
}
// Is a creature held by Confusion (a `confuse` part, not ended)? Its Reaction is then spent, as the fight begins or it joins one (resolve.js, world.js).
export const confusedNow = (s, e) => effectsOf(s).some((fx) => fx.parts.some((p) => p.confuse && !p.ended && p.target === e.id));
const targetsOf = (fx) => [...new Set(fx.parts.map((p) => p.target))];
// Does the lasting effect its bond names still keep this creature? (a `summon` part on it, not ended: on the map; or a
// `bond` part, Animate Dead's and Create Undead's 24 hours of control, Decision 7: under its master's control. What
// follows when it does not is settleBonds', engine/resolve.js: a summon vanishes, a creature held by a bond part stays
// and is freed, a foe.)
export const holds = (s, e) => effectsOf(s).some((fx) => fx.id === e.bond?.fx && fx.parts.some((p) => (p.summon === true || p.bond === true) && p.target === e.id && !p.ended));

export function endEffect(s, ev, fx, why) {
  if (!effectsOf(s).includes(fx)) return;
  s.effects = s.effects.filter((x) => x !== fx);
  for (const p of fx.parts) endPart(s, ev, fx, p);
  ev.push({ type: 'effectEnd', fx: fx.id, name: fx.name, source: fx.source, targets: targetsOf(fx), why });
}
// The ward a creature has from a spell (the `ward` step: Sanctuary) ends when it makes an attack roll, casts a spell or deals damage.
export function endWards(s, ev, id, why) {
  for (const fx of [...effectsOf(s)]) if (fx.parts.some((p) => !p.ended && p.ward && p.target === id)) endEffect(s, ev, fx, why);
}
// An effect whose every part has ended has nothing left to do.
// `ends.keeps` (Heat Metal): a part that ended with it leaves the spell standing, though nothing is left on any creature.
const spent = (fx) => fx.parts.length > 0 && fx.parts.every((p) => p.ended && !p.ends?.keeps);

// The turn now being taken, as a part records it: a part made in a creature's turn does not end
// at the end of that same turn ("until the end of its next turn"). Named by the fight, the round and
// whose turn it is, not by its place in the order: a creature has one turn a round, and its place can
// move while the turn goes on (stepping away, a creature joining the fight; engine/resolve.js).
// Before the first turn of a fight (`turn: -1`) it is the place.
export const turnKey = (s) => (s.encounter ? `${s.encounter.id}:${s.encounter.round}:${s.encounter.order[s.encounter.turn]?.id ?? s.encounter.turn}` : null);
// Is this stamp the turn now being taken? Before state version 22 a stamp named the place in the order
// (`fight:round:index`); migrate.js rewrites those, and one that comes back unmigrated (an undo step or
// a copy kept from before) is still read as the turn at that place. No creature's id is only digits.
const OLD = /^-?\d+$/;
export function thisTurn(s, key) {
  if (typeof key !== 'string' || !s.encounter) return false;
  if (key === turnKey(s)) return true;
  const last = key.slice(key.lastIndexOf(':') + 1);
  return OLD.test(last) && !s.entities[last] && key === `${s.encounter.id}:${s.encounter.round}:${s.encounter.turn}`;
}
// A stamp of the fight going on in the old form, named by creature as now: the creature at that place
// in the order as it stands (migrate.js). Anything else is returned as it is.
export function restamp(enc, key) {
  if (!enc || typeof key !== 'string') return key;
  const m = /^(-?\d+):(-?\d+):(-?\d+)$/.exec(key);
  if (!m || Number(m[1]) !== enc.id) return key;
  const id = enc.order?.[Number(m[3])]?.id;
  return id ? `${m[1]}:${m[2]}:${id}` : key;
}
const ownTiming = (p) => !p.ended && (p.ends?.on === 'turnStart' || p.ends?.on === 'turnEnd');

// An effect's time ran out: it ends, except parts that keep their own turn boundary.
function expire(s, ev, fx) {
  if (!fx.parts.some(ownTiming)) return endEffect(s, ev, fx, 'its time ran out');
  for (const p of fx.parts) if (!ownTiming(p)) endPart(s, ev, fx, p);
  fx.until = null; fx.bound = true;
}

// The world clock moved: end whatever has run out.
export function tick(s, ev) {
  // Everyone under water holds its breath through the time that passed since the clock was last looked at (engine/rolls.js `breathe`). `breathAt` is that moment, kept
  // from one look to the next. It is written only once a game has had a creature under water (a table that never swims has no new field: its state is what it was), and it is
  // optional (no state version): a game with none works the first advance out from the `time` or `rest` event it just made, and from nothing else (that one is counted from now).
  if (Number.isFinite(s.clock) && (Number.isFinite(s.breathAt) || anyUnder(s))) {
    const told = ev.findLast?.((x) => x?.type === 'time' || x?.type === 'rest');
    const from = Number.isFinite(s.breathAt) ? s.breathAt : told?.type === 'time' ? s.clock - told.minutes : told?.short === true ? s.clock - 60 : told ? s.clock - 480 : s.clock;
    const dt = s.clock - from;
    s.breathAt = s.clock;
    if (dt > EPS) ON.breath?.(s, ev, null, Math.round(dt * 60), false);
  }
  // A whole form (Polymorph) ends on the creature when it has no Temporary Hit Points left, however they went (a rest clears them; damage ends it as it soaks).
  for (const e of Object.values(s.entities)) {
    const fx = e.form?.whole === true && !(e.tempHp > 0) ? effectsOf(s).find((x) => x.id === e.form.fx) : null;
    if (fx) endEffect(s, ev, fx, `${e.name} has no Temporary Hit Points left`);
  }
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
      if (p.ends.on === when && whose(fx, p) === e.id && !(when === 'turnEnd' && thisTurn(s, p.born))) endPart(s, ev, fx, p);
      else if (p.ends.on === 'save' && p.ends.at === when && p.target === e.id) {
        const { used, ...sv } = kit.savingThrow(s, e, p.ends.save, p.dc, null, null, null, null, null, p.cond ? [p.cond] : null);
        ev.push({ type: 'save', id: e.id, abil: p.ends.save, dc: p.dc, ...sv, against: fx.name, ...srcOf(s, fx.source, fx.id) });
        useUp(s, ev, used ?? []);
        if (sv.success) endPart(s, ev, fx, p);
      }
    }
    if (spent(fx)) endEffect(s, ev, fx, 'nothing is left of it');
  }
}
// A turn boundary is also where a swimmer's breath is looked at (`secs` 0: surfacing is noticed here), and where a game with no `breathAt` yet takes the clock as it is, so that
// the first round of a fight counts.
const watch = (s, ev, e, turnEnd) => { if (!Number.isFinite(s.breathAt) && Number.isFinite(s.clock) && anyUnder(s)) s.breathAt = s.clock; ON.breath?.(s, ev, e, 0, turnEnd); };
export const turnStarted = (s, ev, e, kit) => { boundary(s, ev, e, kit, 'turnStart'); watch(s, ev, e, false); };
export const turnEnded = (s, ev, e, kit) => { boundary(s, ev, e, kit, 'turnEnd'); watch(s, ev, e, true); };

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
        ev.push({ type: 'save', id: t.id, abil: p.ends.save, dc: p.dc, ...sv, against: fx.name, ...srcOf(s, fx.source, fx.id) });
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
