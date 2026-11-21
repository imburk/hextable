// Rolls and what they do to a creature (engine.js): healing, Temporary Hit Points, Advantage and
// Disadvantage, saving throws, conditions and modifiers, damage parts, checks, death saves, and the
// lasting effects an action leaves behind.
import { d20Faces, die, negate, roll } from '../rng.js';
import { SKILLS } from '../content/schema.js';
import { CONTENT, SPELLS } from '../content/index.js';
import { walk as walkSteps } from '../effects.js';
import { concentrationLost, effectsOf, endEffect, startEffect, turnKey, useUp } from '../durations.js';
import { apart, FT } from '../space.js';
import { canSee, COVER, coverOf, sees } from '../sight.js';
import { canReact, instruction, reactionsOf } from '../reactions.js';
import { bounded, conditionDef, conditionName, conditionPhrase, immuneTo, incapacitated, modifiers, untrainedGear } from '../modifiers.js';
import { derive } from '../derive.js';
import { current, hostile, inFight, living, mod, rollDice, rolledOf, up } from './shared.js';

// A `kill` step: the creature dies, a character at 0 Hit Points as well (Disintegrate).
export function kill(s, t, ev) {
  if (t.dead) return;
  t.dead = true; t.hp = 0;
  ev.push({ type: 'died', id: t.id });
  concentrationLost(s, ev, t, `${t.name} died`);
}
// A `cure` step: the conditions listed end on `t`, whatever put them there (a lasting effect's part
// that held one is ended with it). One it does not have is passed over.
export function cure(s, t, list, ev) {
  for (const c of list) {
    if (!t.cond[c]) continue;
    const fxId = t.cond[c].effect;
    delete t.cond[c];
    ev.push({ type: 'condEnd', id: t.id, cond: c });
    const fx = fxId && effectsOf(s).find((x) => x.id === fxId);
    if (!fx) continue;
    for (const p of fx.parts) if (p.target === t.id && p.cond === c) p.ended = true;
    if (fx.parts.every((p) => p.ended)) endEffect(s, ev, fx, `${t.name} was cured`);
  }
}

// A Death Saving Throw: a d20, with what modifiers add to saves (`save.death`, and `save` for any
// saving throw, such as Bless). A 1 or a 20 on the die counts as itself whatever is added.
export function deathSave(s, e, ev) {
  const m = modifiers(s, e, 'save.death', { target: e }, ''), all = modifiers(s, e, 'save', { target: e }, '');
  const adv = [...m.advantage, ...all.advantage], dis = [...m.disadvantage, ...all.disadvantage];
  const mode = adv.length && !dis.length ? 'adv' : dis.length && !adv.length ? 'dis' : 'normal';
  const r1 = die(s, 20), r2 = mode === 'normal' ? null : die(s, 20);
  const d = mode === 'adv' ? Math.max(r1, r2) : mode === 'dis' ? Math.min(r1, r2) : r1;
  const more = rollDice(s, [...m.dice, ...all.dice]), total = d + m.add + all.add + more.total;
  if (d === 20) { e.hp = 1; delete e.cond.unconscious; e.death = { s: 0, f: 0 }; }
  else if (d === 1) e.death.f += 2;
  else if (total >= 10) e.death.s++;
  else e.death.f++;
  if (e.death.f >= 3) e.dead = true;
  else if (e.death.s >= 3) { e.cond.stable = {}; e.death = { s: 0, f: 0 }; }   // both counts reset on becoming Stable
  ev.push({ type: 'deathSave', id: e.id, roll: d, ...(total !== d ? { total } : {}), ...(r2 === null ? {} : { rolls: [r1, r2], mode }), ...(more.extra.length ? { extra: more.extra } : {}),
    dice: [...d20Faces(r1, r2, d), ...more.dice], bonus: m.add + all.add, s: e.death.s, f: e.death.f, dead: e.dead, stable: !!e.cond.stable, hp: e.hp });
}

// ---------- healing, rolls and their results ----------

// `r`, if given, is the roll the amount came from, for the event's dice.
// An amount of healing or Temporary Hit Points that is not a finite number (an action with no modifier to add: #421) is never applied:
// Hit Points would become NaN. The DM is told instead. Returns true if it was not applied.
const noAmount = (t, amount, what, ev, f) => {
  if (Number.isFinite(amount)) return false;
  ev.push({ type: 'manual', actor: f?.actor ?? t.id, name: f?.src?.name ?? what, partial: true, text: `${what} for ${t.name} has no amount the engine can work out, so none was applied. The DM applies it.` });
  return true;
};
// `f`, from an effect step, is its frame: a spell's healing says which spell (`f.src.spell`), for spellHealed below.
export function heal(s, t, amount, ev, r = null, f = null) {
  if (noAmount(t, amount, 'Healing', ev, f)) return;
  const was = Math.max(0, t.hp);
  if (t.hp <= 0) { delete t.cond.unconscious; delete t.cond.stable; t.death = { s: 0, f: 0 }; }
  t.hp = Math.min(t.maxHp, t.hp + amount);
  ev.push({ type: 'heal', target: t.id, amount, hp: t.hp, ...rolledOf(r, amount) });
  // In a fight a revived creature stays Prone until its turn, when standing costs half its Speed.
  // Outside one, movement isn't budgeted, so it simply gets up.
  if (t.cond.prone && !inFight(s, t.id)) { delete t.cond.prone; ev.push({ type: 'stood', id: t.id }); }
  if (f) spellHealed(s, t, t.hp - was, f, ev);
}

// The healing hook (#464): what happens when a creature regains Hit Points from a spell of level 1 or higher. `gained` is the
// number it regained (what its maximum let it take). Built: Life Bond (the Otherworldly Steed, SRD 26875-26877: "When you
// regain Hit Points from a level 1+ spell, the steed regains the same number of Hit Points if you're within 5 feet of it"),
// a companion's trait `masterHeal: { within }`. Blessed Healer (DEBT C8), healing another creature with a slot, would be
// read here too; it is not built.
function spellHealed(s, t, gained, f, ev) {
  const sp = typeof f.src?.spell === 'string' && Object.hasOwn(SPELLS, f.src.spell) ? SPELLS[f.src.spell] : null;
  if (!sp || !(sp.level >= 1) || !(gained > 0)) return;
  for (const x of Object.values(s.entities)) {
    if (x.bond?.to !== t.id || x.id === t.id || x.dead || !(x.hp > 0)) continue;
    const block = (Object.hasOwn(CONTENT.summons, x.tpl ?? '') ? CONTENT.summons[x.tpl] : null) ?? (Object.hasOwn(CONTENT.monsters, x.tpl ?? '') ? CONTENT.monsters[x.tpl] : null);
    const tr = (block?.traits ?? []).find((y) => y.masterHeal);
    if (!tr || apart(s, t, x) * FT > tr.masterHeal.within) continue;
    // Said by name for the party's own: a foe's bond is not told to players (docs/specs/companions.md, Decision 10).
    if (x.side === 'party') ev.push({ type: 'note', id: x.id, text: `${tr.name}: ${t.name} regained ${gained} Hit Points from ${sp.name}` });
    heal(s, x, gained, ev, { by: t.id });
  }
}

const UNSEEN = { dark: 'in darkness', 'out of sight': 'out of sight', hidden: 'hidden', obscured: 'heavily obscured' };
// Temporary Hit Points: they do not add up. A creature keeps the larger of what it has and what
// it is given (the SRD lets it choose; nobody would choose fewer). From a lasting effect, they
// vanish when it ends. They never wake a creature at 0 Hit Points.
export function tempHp(s, t, amount, ev, f = null, r = null) {
  if (t.dead) return;
  if (noAmount(t, amount, 'Temporary Hit Points', ev, f)) return;
  const had = t.tempHp ?? 0;
  if (amount <= had) return ev.push({ type: 'tempHp', id: t.id, amount: 0, tempHp: had, kept: true, ...rolledOf(r, 0) });
  const fx = f?.src.fx ? effectsOf(s).find((x) => x.id === f.src.fx) : null;
  t.tempHp = amount;
  if (fx) { t.tempFx = fx.id; fx.parts.push({ target: t.id, temp: true }); } else delete t.tempFx;
  ev.push({ type: 'tempHp', id: t.id, amount, tempHp: amount, ...rolledOf(r, amount) });
}

// Advantage and Disadvantage for an attack, with the reasons. Any of each cancels to a normal roll.
// Conditions and traits supply theirs as data (modifiers.js); the two rules written out here
// belong to ranged attacks themselves. Also returns `add` (a bonus or penalty to the roll) and
// `crit` (a hit is critical whatever the die shows).
export function rollMode(s, e, t, atk) {
  const d = apart(s, e, t), ranged = atk.type === 'ranged';
  // A built character's attack says which ability it uses (`abil`), for Rage and Reckless Attack.
  const sit = { attacker: e, target: t, ranged, spell: !!atk.spell, opportunity: !!atk.opportunity, ...(atk.abil ? { str: atk.abil === 'str', ability: atk.abil } : atk.spell ? { str: false } : {}) };
  const theirs = modifiers(s, t, 'attack.received', sit, 'target'), mine = modifiers(s, e, 'attack.roll', sit, 'attacker');
  const adv = [...theirs.advantage, ...mine.advantage], dis = [...theirs.disadvantage, ...mine.disadvantage];
  if (ranged && d * FT > atk.range[0]) dis.push('long range');
  // SRD Ranged Attacks in Close Combat: only an enemy within 5 feet who can see the attacker and is not Incapacitated counts.
  if (ranged && !e.object && living(s).some((o) => up(o) && hostile(o, e) && !incapacitated(o) && apart(s, o, e) <= 1 && canSee(s, o, e) !== 'no')) dis.push('enemy within 5 ft');
  // SRD Unseen Attackers and Targets. Blinded and Invisible say so in their own data (as "attacker
  // blinded" and the like); darkness, something in the way, or hiding are said here. A trap has no eyes.
  if (!e.object) {
    const mine = sees(s, e, t), theirs = sees(s, t, e), own = ['blinded', 'invisible'];
    if (mine.see === 'no' && !own.includes(mine.why)) dis.push(`target ${UNSEEN[mine.why]}`);
    if (theirs.see === 'no' && !own.includes(theirs.why)) adv.push(`attacker ${UNSEEN[theirs.why]}`);
  }
  // A bonus to rolls against the target (Sundering Blow's +5) adds to the roll as the attacker's own do.
  return { mode: adv.length && !dis.length ? 'adv' : dis.length && !adv.length ? 'dis' : 'normal', adv, dis, add: mine.add + theirs.add, dice: [...mine.dice, ...theirs.dice], crit: theirs.crit, used: [...mine.used, ...theirs.used] };
}

// A failed save against an effect that would put one of some conditions on a creature: an ally
// within range with a feature reaction on `saveFailed` for those conditions (Countercharm) and a
// standing instruction of `always` takes its Reaction to have the save rolled again with Advantage.
// `onFail` is the steps the failure would run. Returns the new save, or null.
export function rerollSave(s, t, abil, dc, onFail, from, ev) {
  const conds = (onFail ?? []).filter((x) => 'condition' in x).map((x) => x.condition);
  if (!conds.length) return null;
  for (const o of living(s)) {
    if (o.side !== t.side || !canReact(o)) continue;
    const r = reactionsOf(o).find((x) => x.on === 'saveFailed' && x.reaction.conditions.some((c) => conds.includes(c)) && instruction(o, x) === 'always');
    if (!r || (o.id !== t.id && apart(s, o, t) * FT > r.reaction.range)) continue;
    o.reactionUsed = true;
    ev.push({ type: 'reaction', id: o.id, reaction: r.id, name: r.name, trigger: 'saveFailed', against: t.id });
    return savingThrow(s, t, abil, dc, null, from, null, r.name, ev, conds);
  }
  return null;
}

// The spell slot levels this creature could cast this reaction spell with now: it knows it, is
// not barred from spells (Rage), and has not spent a spell slot already this turn (SRD: one a
// turn). A cantrip needs none: [0]. Empty if it cannot.
export function slotsFor(s, e, sp) {
  if (untrainedGear(e).length) return [];                      // armour worn without training bars spellcasting (SRD "Armor Training")
  if (effectsOf(s).some((fx) => fx.source === e.id && fx.noSpells)) return [];
  if (sp.level === 0) return [0];
  if (s.encounter && (current(s) === e.id ? s.encounter.flags.slot : s.encounter.flags[`slot:${e.id}`])) return [];
  const out = [];
  for (let l = sp.level; l <= 9; l++) if ((e.slots?.[l] ?? 0) > 0) out.push(l);
  return out;
}
// What a player is offered for a reaction spell: its id and name, and the slot levels it can use.
export const spellOffer = (r, slots, extra = {}) => ({ reaction: r.id, name: r.name, ...extra, ...(slots[0] > 0 ? { slots } : {}) });

// The damage types an attack deals, as far as its data says.
export function attackTypes(atk) { return atk.dtypes ?? (atk.dtype ? [atk.dtype] : []); }
// Rage goes on while its creature keeps fighting: an attack roll against an enemy, or making an
// enemy save, carries it to the end of its next turn again (its parts are made new this turn).
export function renew(s, e, t) {
  if (!e || !t || !hostile(e, t) || !s.encounter) return;
  const now = turnKey(s);
  for (const fx of effectsOf(s)) if (fx.renew && fx.source === e.id) for (const p of fx.parts) if (!p.ended && p.ends?.on === 'turnEnd') p.born = now;
}

// Armor Class after anything that changes it.
// A `baseAc` modifier (Mage Armor: 13 + Dexterity) replaces the base of an unarmoured character's Armor Class when it is better than the base its
// own way of working it out gives (`acBase`, from derive: SRD "If you have multiple ways to calculate your Armor Class, you can benefit from only
// one at a time"); what is added to the base (a Shield, a magic item, a feature) stays. A creature with no `acBase` (a monster, a hand-typed
// record) is not known to wear nothing, so the modifier is never put on it (`modifier`, below) and nothing here changes its number.
// The base of a character's Armor Class (derive's `acBase`). A character saved before the record kept it has it worked out again from its sheet,
// with whatever content is lent at that moment (a table's homebrew, when called inside `using`). The answer is trusted only if that derive finds
// nothing missing and comes to the very `ac` and armour the creature has: a sheet with homebrew gear whose pack is not lent, or one the DM has
// edited by hand, gives null (not a built character as far as Mage Armor can tell; refreshing the character writes `acBase` for good). A null or a
// throw is never kept, so a later call with the content lent is asked again. A kept answer is for one sheet and the `ac` and armour it matched:
// sheet.items edited in place (vanishUnseen and the pocket dimension empty it, engine/resolve.js) leave the sheet object the same, which is why
// the match is checked on every use, not only when it was made.
const BASES = new WeakMap();
export function acBaseOf(t) {
  if (Number.isInteger(t.acBase)) return t.acBase;
  if (t.kind !== 'pc' || !t.sheet || typeof t.sheet !== 'object') return null;
  const had = BASES.get(t.sheet);
  if (had && had.ac === t.ac && had.armour === (t.armour ?? 'none')) return had.base;
  try {
    const d = derive(t.sheet);
    if (d.missing?.length || !Number.isInteger(d.record.acBase) || d.record.ac !== t.ac || (d.record.armour ?? 'none') !== (t.armour ?? 'none')) return null;
    BASES.set(t.sheet, { ac: t.ac, armour: t.armour ?? 'none', base: d.record.acBase });
    return d.record.acBase;
  } catch { return null; }
}
export function acNow(s, t) {
  const m = modifiers(s, t, 'ac', { target: t });
  let ac = m.set ?? t.ac;
  const own = m.baseAc === null ? null : acBaseOf(t), base = own !== null && !t.form && (t.armour ?? 'none') === 'none' && m.baseAc > own;
  if (base) ac += m.baseAc - own;
  const now = bounded(m, ac + m.add);
  // The names of what made it differ from the creature's own number, for the sheet ("AC 15: Mage Armor").
  const why = now === t.ac ? [] : [...new Set([...(base ? [m.baseAcFrom] : []), ...m.from])];
  return { ac: now, why };
}
export const acOf = (s, t) => acNow(s, t).ac;
// The Armor Class to show: the DM has the whole state and works it out; a player is sent `acNow` (and `acWhy`) where it is not the creature's own number (view.js).
export const acShown = (s, e, dm) => (dm ? acNow(s, e) : { ac: e.acNow ?? e.ac, why: e.acWhy ?? [] });

// The ending a step gives its condition or modifier, as the part keeps it: with the DC it is rolled against (the ending's own,
// `ends.dc`: an entry says it for a creature's action, and runAction fills it in from the save that put the condition on when
// it does not; else the DC of the effect, a spell's save DC). A repeated save with no DC anywhere could never succeed, so it is
// not rolled at all: the DM is told, once, now, and the part carries no ending (the DM ends it). `told` is true then.
function ending(s, step, f, ev, t) {
  if (!step?.ends) return { told: false, part: {} };
  const dc = step.ends.dc ?? step.dc ?? f?.src.dc;
  if (step.ends.on === 'save' && !Number.isFinite(dc)) {
    // `orDamaged`: damage to it still ends it, with no save (an ending on damage, which durations.js runs).
    const dmg = step.ends.orDamaged === true;
    ev.push({ type: 'manual', actor: f?.actor ?? t.id, name: f?.src.name ?? t.name, partial: true, text: `${t.name}'s ${step.ends.save?.toUpperCase()} save to end this has no DC entered, so the engine does not roll it. The DM ends it${dmg ? ' (any damage it takes still ends it)' : ''}.` });
    return { told: true, part: dmg ? { ends: { on: 'damaged', ...(step.ends.by !== undefined ? { by: step.ends.by } : {}) }, born: turnKey(s) } : {} };
  }
  return { told: false, part: { ends: step.ends, dc, born: turnKey(s) } };
}

// Put a condition on a creature. What the condition does is data (content/srd52/conditions.js).
// `f` is the effect frame that caused it, if any, and `step` the step. If the frame belongs to
// a lasting effect the condition is tied to it and ends when it does; otherwise only the DM
// (or standing up, for Prone) ends it, and the DM is told so.
// `ended`: a grapple's hold (`grip`): the engine ends it and runs what `also` hands the DM for a Grappled condition with no hold
// (the Disadvantage is a modifier for a hold; a holder drags what it holds when it walks, movement.js), so the DM is told neither.
export function condition(s, t, id, ev, f = null, step = null, level = undefined, ended = false) {
  if (!up(t) || t.cond[id]) return;
  if (immuneTo(s, t, id)) return ev.push({ type: 'note', id: t.id, text: `Immune to ${conditionName(id)}` });
  // An instant spell's effect that exists only to hold the endings of its other steps (`bound`) cannot end a condition
  // whose step names no ending: tied to it, the condition would never end and no one would say so. It is kept off the
  // effect instead, and the DM is told below that nothing ends it (T32).
  const held = f?.src.fx ? effectsOf(s).find((x) => x.id === f.src.fx) : null;
  // The ending of a step is judged first: a repeated save with no DC is not an ending the engine can run (the DM is told here).
  const end = ending(s, step, f, ev, t);
  const fx = held && !(held.bound && step && (!step.ends || (end.told && !end.part.ends))) ? held : null;
  t.cond[id] = { ...(f ? { source: f.actor } : {}), ...(level ? { level } : {}), ...(fx ? { effect: fx.id } : {}) };
  if (fx) fx.parts.push({ target: t.id, cond: id, ...end.part });
  ev.push({ type: 'cond', id: t.id, cond: id });
  const def = conditionDef(id), name = conditionName(id);
  const rest = def?.also && !ended ? ` The engine applies what it can; the DM applies the rest: ${def.also}` : '';
  const nothing = fx || id === 'prone' || end.told || ended ? '' : ' Nothing ends it yet: the DM removes it.';
  if (rest || nothing) ev.push({ type: 'manual', actor: f?.actor ?? t.id, name: f?.src.name ?? name, partial: true, text: `${t.name} ${conditionPhrase(id)}.${rest}${nothing}` });
  concentrationLost(s, ev, t, `${t.name} ${conditionPhrase(id)}`);
}

// A hold on `t` (docs/specs/grapple-shove.md, Decision 2): `hold` is { by, with, escape, range, escapeDis? }. The first puts the
// Grappled condition on (`condition`, which says when it is immune or down and puts nothing on); another adds to its list, since
// one creature may be held by more than one grappler. `source` always names the first hold's grappler. A Grappled condition with
// no holds is one the DM put on (or a monster's, from a game saved before holds): the engine does not end it and adds nothing to
// it, and the DM is told. Returns true when the hold was put on.
export function grip(s, t, hold, ev) {
  const g = t.cond.grappled, by = s.entities[hold.by], name = by?.name ?? 'someone';
  if (g && !Array.isArray(g.holds)) {
    ev.push({ type: 'manual', actor: hold.by, name: 'Grapple', partial: true,
      text: `${t.name} is already Grappled by a grapple the engine does not keep (the DM's). ${name}'s grapple is not added to it: the DM decides whether ${t.name} is now held by ${name} too, and ends both by hand.` });
    return false;
  }
  if (g) {
    if (g.holds.some((h) => h.by === hold.by)) return false;
    g.holds.push({ ...hold });
    ev.push({ type: 'hold', id: t.id, by: hold.by });
    return true;
  }
  condition(s, t, 'grappled', ev, null, null, undefined, true);
  if (!t.cond.grappled) return false;                                     // immune, or down: condition() said so where it says anything
  t.cond.grappled.source = hold.by;
  t.cond.grappled.holds = [{ ...hold }];
  const c = ev.findLast((x) => x.type === 'cond' && x.id === t.id && x.cond === 'grappled');
  if (c) c.by = hold.by;
  return true;
}

// Attach a modifier to a creature for as long as a lasting effect runs. Returns false if there
// is no lasting effect to carry it, in which case the step is handed to the DM.
// A step with `to: 'caster'` puts the modifier on the caster instead, and one whose modifier says
// `against: 'target'` holds only against this target (Hex's extra damage). A Hit Point maximum
// raised or lowered (`hp.max`) moves current Hit Points with it, and back when the effect ends.
export function modifier(s, t, mod_, ev, f, step = {}) {
  const fx = f?.src.fx ? effectsOf(s).find((x) => x.id === f.src.fx) : null;
  if (!fx) return false;
  // A bound effect (an instant spell's) holds only what ends: by its own `ends`, or by use (`uses`). Another modifier
  // would stay on forever, so it is handed to the DM (effects.js says so).
  if (fx.bound && !step.ends && !Number.isInteger(mod_.uses)) return false;
  const holder = step.to === 'caster' ? s.entities[f.actor] : t;
  if (!holder) return false;
  // `baseAc` (Mage Armor, "a willing creature who isn't wearing armor"): put on only where the engine knows the creature wears no armour and how it
  // works its Armor Class out (a built character, `acBase`, not in a form). Any other creature is the DM's: it is told, and nothing is put on.
  if (mod_.op === 'baseAc' && !(acBaseOf(holder) !== null && !holder.form && (holder.armour ?? 'none') === 'none')) {
    ev.push({ type: 'manual', actor: f.actor ?? holder.id, name: f.src.name, partial: true, text: `${holder.name} ${holder.form ? 'is in a form' : (holder.armour ?? 'none') !== 'none' ? 'is wearing armor' : holder.sheet ? 'has a sheet the engine could not work its Armor Class out from' : 'is not a built character, so the engine does not know whether it wears armor or how its Armor Class is worked out'}. The engine did not change its Armor Class: the DM decides whether ${f.src.name} works and sets the number.` });
    return true;
  }
  const end = ending(s, step, f, ev, t);
  if (fx.bound && end.told && !end.part.ends && !Number.isInteger(mod_.uses)) return false;       // nothing could end it: the DM applies it and ends it
  const { against, except, ...m } = mod_;
  const part = { target: holder.id, modifier: m, ...(against === 'target' ? { against: t.id } : {}), ...(except === 'source' && f.actor ? { except: f.actor } : {}), ...end.part };
  if (m.on === 'hp.max' && m.op === 'add' && typeof m.value === 'number' && !holder.dead) {
    holder.maxHp += m.value;
    holder.hp = m.value > 0 && holder.hp > 0 ? holder.hp + m.value : Math.min(holder.hp, holder.maxHp);
    part.hpMax = m.value;
    ev.push({ type: 'maxHp', id: holder.id, maxHp: holder.maxHp, hp: holder.hp });
  }
  fx.parts.push(part);
  return true;
}

// A `stabilize` step (Spare the Dying): a creature at 0 Hit Points that is not dead becomes Stable, as when its third Death Saving Throw succeeds
// (both counts start again). Any other creature is left as it is, and the table is told why.
export function stabilise(s, t, ev, f = null) {
  const why = t.dead ? 'is dead' : t.hp > 0 ? 'is not at 0 Hit Points' : t.cond.stable ? 'is Stable already' : null;
  if (why) return ev.push({ type: 'note', id: t.id, ...(f?.actor ? { actor: f.actor } : {}), text: `${t.name} ${why}, so ${f?.src.name ?? 'the spell'} does nothing.` });
  t.cond.stable = {}; t.death = { s: 0, f: 0 };
  ev.push({ type: 'cond', id: t.id, cond: 'stable' });
}

// A `light` step (Light): `t` carries a light for as long as the lasting effect that ran the step does, and it goes out with it (durations.js, endPart).
// `replaces`: the caster casting it again ends the earlier one ("The spell ends if you cast it again"). A creature carries one light in the engine (`setLight`): one it
// already carries, from elsewhere, is not put out or taken for this one, and the DM is told. Returns false where there is no lasting effect to hang it on.
export function shine(s, t, step, ev, f) {
  const fx = f?.src.fx ? effectsOf(s).find((x) => x.id === f.src.fx) : null;
  if (!fx || fx.bound) return false;
  if (step.replaces) for (const old of [...effectsOf(s)]) if (old !== fx && old.spell === fx.spell && old.source === fx.source) endEffect(s, ev, old, `${f.src.name} was cast again`);
  if (t.light) {
    ev.push({ type: 'manual', actor: f.actor ?? t.id, name: f.src.name, partial: true, text: `${t.name} already carries a light, and the engine keeps one light for a creature. It did not add ${f.src.name}'s: the DM tracks both, and sets the larger with setLight if they should show.` });
    return true;
  }
  t.light = { bright: step.light.bright, dim: step.light.dim, fx: fx.id };
  fx.parts.push({ target: t.id, light: true });
  ev.push({ type: 'light', id: t.id, bright: step.light.bright, dim: step.light.dim, name: f.src.name });
  return true;
}

// Extra damage a creature deals, from its `damage.dealt` modifiers: a modifier with `types` adds a
// part of that type (Hex's 1d6 necrotic), one without is added to the first part. Extra dice are
// doubled on a critical hit like the rest. `sit` says whether it came from a hit and a weapon.
export function dealt(s, e, t, parts, sit, crit) {
  if (!e || e.object) return parts;
  const m = modifiers(s, e, 'damage.dealt', { attacker: e, target: t, ...sit }, 'attacker');
  if (!m.dealt.length) return parts;
  const out = parts.map((p) => ({ ...p }));
  for (const x of m.dealt) {
    // `once`: once on each of its own turns (Divine Strike, Primal Strike); outside a fight there are no turns.
    if (x.once && s.encounter) {
      if (current(s) !== e.id || s.encounter.flags[`once:${x.key}`]) continue;
      s.encounter.flags[`once:${x.key}`] = true;
    }
    const neg = typeof x.value === 'string' && x.value.startsWith('-');
    const r = typeof x.value === 'string' ? roll(s, x.value.replace(/^[+-]/, ''), { crit }) : null;
    const n = r ? r.total * (neg ? -1 : 1) : x.value;
    const dice = r ? (neg ? negate(r.dice) : r.dice) : [], bonus = r ? r.bonus * (neg ? -1 : 1) : x.value;
    if (x.types) out.push({ amount: Math.max(0, n), type: x.types.length > 1 ? bestType(s, t, x.types) : x.types[0], from: x.name, dice, bonus, by: e.id });
    else if (out.length) {
      const p = out[0];
      p.amount = Math.max(0, p.amount + n);
      if (p.dice) { p.dice = [...p.dice, ...dice]; p.bonus = (p.bonus ?? 0) + bonus; }
    }
  }
  return out;
}

// A die added to a D20 Test that failed (`onFail` modifiers: a Bardic Inspiration die on the
// creature, `d20`; Peerless Skill, `attack.roll`, paid from a feature's uses only if it succeeds).
// Used only where it could turn the failure (`short`, how much the roll fell short, is no more
// than the dice can make), as a player would; the first that fits is rolled. Returns
// { add, name, dice, success } or null.
const diceMax = (d) => { const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(d); return m ? +m[1] * +m[2] + (+m[3] || 0) : 0; };
export function rescue(s, t, hook, short, ev) {
  if (!t || t.object || !(short > 0)) return null;
  const list = [...modifiers(s, t, 'd20', { target: t }, '').rescue, ...modifiers(s, t, hook, { target: t }, '').rescue];
  for (const x of list) {
    if (typeof x.value !== 'string' || diceMax(x.value) < short) continue;
    if (x.cost && !((t.uses?.[x.cost] ?? 0) > 0)) continue;
    const r = roll(s, x.value), success = r.total >= short;
    if (x.part) useUp(s, ev, [x.part]);                      // a die given is spent when it is rolled
    if (x.cost && success) t.uses[x.cost]--;                 // Peerless Skill: not spent on a failure
    return { add: r.total, name: x.name, dice: r.dice, success };
  }
  return null;
}

// Of the damage types a creature may choose among (Divine Strike: Necrotic or Radiant), the one
// that hurts the target most: one it is Vulnerable to, then one it does not resist, then the first.
function bestType(s, t, types) {
  if (!t) return types[0];
  const m = modifiers(s, t, 'damage.taken', { target: t });
  const has = (list, own, k) => list === true || list.includes(k) || (own ?? []).includes(k);
  const worth = (k) => (has(m.immune, t.immune, k) ? 0 : has(m.resist, t.resist, k) ? 1 : 2) * (has(m.vulnerable, t.vuln, k) ? 2 : 1);
  return types.reduce((a, k) => (worth(k) > worth(a) ? k : a), types[0]);
}

// `extra` names a second hook to gather modifiers from, such as 'concentration'. The result carries
// `used`, the single-use parts the save took: the caller leaves it out of its event and passes it to useUp.
// `from` is the creature or the point the effect comes from: cover against it helps a Dexterity save.
// `about`: the conditions the save is to avoid or end, for a modifier scoped to one (Protection from Poison).
export function savingThrow(s, t, abil, dc, extra = null, from = null, dis = null, adv = null, ev = null, about = null) {
  const sit = { target: t, ability: abil, ...(about?.length ? { conditions: about } : {}) };
  const m = modifiers(s, t, `save.${abil}`, sit, '');
  if (dis) m.disadvantage.push(dis);                       // Disadvantage from the caster's side (Heightened Spell)
  if (adv) m.advantage.push(adv);                          // Advantage on a reroll (Countercharm)
  const cover = abil === 'dex' && from && !from.object ? coverOf(s, from, t, living(s)) : 'none';
  m.add += COVER[cover] ?? 0;
  // `save` applies to every saving throw (Bless, Bane); `extra` names one more hook, such as 'concentration'.
  for (const hook of ['save', ...(extra ? [extra] : [])]) {
    const x = modifiers(s, t, hook, sit, '');
    m.add += x.add; m.advantage.push(...x.advantage); m.disadvantage.push(...x.disadvantage); m.dice.push(...x.dice); m.used.push(...x.used);
    m.autoFail ||= x.autoFail; m.autoSucceed ||= x.autoSucceed;
  }
  // A single-use modifier is spent by this save. `used` goes back to the caller, which records
  // the save and then ends what it used up (durations.useUp), so the log reads in that order.
  const used = m.used;
  if (m.autoFail) return { roll: 0, total: 0, success: false, used };
  if (m.autoSucceed) return { roll: 0, total: dc, success: true, used };
  const mode = m.advantage.length && !m.disadvantage.length ? 'adv' : m.disadvantage.length && !m.advantage.length ? 'dis' : 'normal';
  const r1 = die(s, 20), r2 = mode === 'normal' ? null : die(s, 20);
  const r = mode === 'adv' ? Math.max(r1, r2) : mode === 'dis' ? Math.min(r1, r2) : r1;
  const more = rollDice(s, m.dice);
  // A monster's stat block gives its save outright (`saveBonus`); anyone else adds Proficiency to the modifier for a saving throw they are proficient in.
  const base = t.saveBonus?.[abil] ?? mod(t.abil[abil]) + (t.saveProf.includes(abil) ? t.prof : 0);
  let total = r + base + m.add + more.total;
  // A failed save rolled again for a use of a feature (`reroll`: Indomitable adds the Fighter level;
  // Disciplined Survivor for a Focus Point), by its standing instruction, where the new roll could
  // succeed. The new d20 (or two, with Advantage or Disadvantage) stands; other dice are kept.
  let again = null, faces = d20Faces(r1, r2, r);
  if (ev && total < dc) {
    const mine = reactionsOf(t);
    const f = (t.feats ?? []).find((x) => x.reroll && (t.uses?.[x.reroll.cost] ?? 0) > 0 && instruction(t, mine.find((y) => y.id === x.id)) !== 'never'
      && 20 + base + m.add + more.total + (x.reroll.add ?? 0) >= dc);
    if (f) {
      t.uses[f.reroll.cost]--;
      const n1 = die(s, 20), n2 = mode === 'normal' ? null : die(s, 20), n = mode === 'adv' ? Math.max(n1, n2) : mode === 'dis' ? Math.min(n1, n2) : n1, add = f.reroll.add ?? 0;
      again = { name: f.name, was: r, ...(add ? { add } : {}), n, rolls: n2 === null ? null : [n1, n2] };
      total = n + base + m.add + more.total + add;
      faces = d20Faces(n1, n2, n);
    }
  }
  // A die that may turn a failure (Bardic Inspiration), with `ev` to say what was spent.
  const lift = ev && total < dc ? rescue(s, t, 'save', dc - total, ev) : null;
  if (lift) total += lift.add;
  const { n: rolled = r, rolls: rolledTwo = r2 === null ? null : [r1, r2], ...rerolled } = again ?? {};
  return { roll: rolled, total, success: total >= dc, ...(again ? { reroll: rerolled } : {}), ...(lift ? { rescued: { name: lift.name, dice: lift.dice, add: lift.add } } : {}), dice: [...faces, ...more.dice], bonus: base + m.add, ...(cover !== 'none' && cover !== 'total' ? { cover } : {}), ...(rolledTwo === null ? {} : { rolls: rolledTwo, mode, why: mode === 'adv' ? m.advantage : m.disadvantage }), ...(more.extra.length ? { extra: more.extra } : {}), used };
}

// Of several abilities a creature may save with, the one it has the best chance with (the SRD lets the target of a Grapple or a
// Shove "choose which" of Strength or Dexterity, and the engine chooses for it; docs/specs/grapple-shove.md, Decision 1). Judged as
// savingThrow() judges a save, without rolling: an automatic success first (never an automatic failure when another ability has
// none), then Advantage over neither over Disadvantage, then the higher bonus, then the first listed. `from` is where the effect
// comes from, for cover on a Dexterity save.
export function bestSave(s, t, abils, from = null, about = null) {
  let best = null;
  for (const abil of abils) {
    const sit = { target: t, ability: abil, ...(about?.length ? { conditions: about } : {}) };
    const m = modifiers(s, t, `save.${abil}`, sit, ''), x = modifiers(s, t, 'save', sit, '');
    const cover = abil === 'dex' && from && !from.object ? coverOf(s, from, t, living(s)) : 'none';
    const fail = m.autoFail || x.autoFail, win = m.autoSucceed || x.autoSucceed;
    const adv = m.advantage.length + x.advantage.length > 0, dis = m.disadvantage.length + x.disadvantage.length > 0;
    const base = t.saveBonus?.[abil] ?? mod(t.abil[abil]) + (t.saveProf.includes(abil) ? t.prof : 0);
    const rank = [fail ? 0 : win ? 2 : 1, adv && !dis ? 2 : dis && !adv ? 0 : 1, base + m.add + x.add + (COVER[cover] ?? 0)];
    if (!best || rank[0] > best.rank[0] || (rank[0] === best.rank[0] && (rank[1] > best.rank[1] || (rank[1] === best.rank[1] && rank[2] > best.rank[2])))) best = { abil, rank };
  }
  return best.abil;
}

// ---------- ability checks ----------
// What a creature adds to a d20 for a check: its ability modifier, its Proficiency Bonus if it
// is proficient in the skill or with the tool (twice for Expertise), or a monster's listed bonus.
// `lent`: the proficiencies a lasting effect gives for a time (`modifiers(...).lent`, addition C of docs/specs/homebrew-subclasses.md). One lends the Proficiency Bonus once, to a
// skill or tool the creature is not proficient in; a skill or tool it has already (Expertise too) takes nothing more, and a monster's listed bonus stands as it is.
export function checkBonus(e, { ability, skill, tool }, lent = []) {
  if (skill && e.skillBonus?.[skill] !== undefined) return e.skillBonus[skill];
  let b = mod(e.abil[ability ?? SKILLS[skill]] ?? 10);
  const own = skill && e.skills?.includes(skill);
  if (own || (skill && lent.some((x) => x.skill === skill))) b += e.prof * (own && e.expertise?.includes(skill) ? 2 : 1);
  else if (tool && (e.tools?.includes(tool) || lent.some((x) => x.tool === tool))) b += e.prof;
  return b;
}
// A passive score: 10 plus the bonus, 5 more with Advantage, 5 less with Disadvantage.
// Dice from modifiers (Guidance) are not rolled for a passive score: it is not a roll.
// `dis` adds reasons for Disadvantage that are not modifiers, such as Dim Light.
export function passive(s, e, skill, dis = []) {
  const m = modifiers(s, e, 'check', { target: e, skill, ability: SKILLS[skill] }, '');
  m.disadvantage = [...m.disadvantage, ...dis];
  return 10 + checkBonus(e, { skill }, m.lent) + m.add + (m.advantage.length && !m.disadvantage.length ? 5 : 0) - (m.disadvantage.length && !m.advantage.length ? 5 : 0);
}
// At the start of its turn a creature rolls for each spent action with a recharge.
export function recharge(s, e, ev) {
  for (const def of e.actions ?? []) {
    if (!def.recharge || !e.spent?.[def.id]) continue;
    const d = die(s, 6), ready = d >= def.recharge[0];
    if (ready) delete e.spent[def.id];
    ev.push({ type: 'recharge', id: e.id, action: def.id, name: def.name, roll: d, ready, dice: [{ sides: 6, value: d }], bonus: 0 });
  }
}

// Something with no duration of its own whose steps end at a turn boundary ("Blinded until the
// end of the mephit's next turn", Ray of Frost's slowing) needs an effect to hang that on: one
// `bound` to its parts, which ends when they do. Null if no step has an `ends`.
export function boundEffect(s, name, source, steps, spell = null) {
  let timed = false;
  walkSteps(steps, (st) => { if (st.ends && (st.ends.on === 'turnStart' || st.ends.on === 'turnEnd' || st.ends.on === 'save' || st.ends.on === 'damaged')) timed = true; });
  if (!timed) return null;
  const fx = startEffect(s, { name, spell, source, conc: false, duration: 'special' });
  fx.bound = true;
  return fx;
}
// After the steps ran: a bound effect that put nothing on anyone is dropped unannounced; one that
// did is announced with what it holds.
export function settle(s, ev, fx, targets) {
  if (!fx.parts.length) { s.effects = effectsOf(s).filter((x) => x !== fx); return; }
  ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: fx.source, conc: false, lasts: 'until its parts end', targets: [...new Set(fx.parts.map((p) => p.target))] });
  void targets;
}

