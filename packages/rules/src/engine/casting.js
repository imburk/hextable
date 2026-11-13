// Casting (engine.js): the cast action, Metamagic, Counterspell and other spells that answer a
// spell, teleport destinations, and ending a lasting effect.
import * as H from '../hex.js';
import { SPELLS } from '../content/index.js';
import { BRANCHES, CHOICES } from '../content/schema.js';
import { begin, scaleSteps, sharedRolls, targetCount, walk as walkSteps } from '../effects.js';
import { breakConcentration, durationMinutes, effectsOf, endEffect, startEffect, turnKey } from '../durations.js';
import { FT, gap, landing, overlapAt, unseenAt } from '../space.js';
import { canSee, hiddenFrom } from '../sight.js';
import { unknown } from '../vision.js';
import { canReact, instruction, reactionsOf } from '../reactions.js';
import { able, ask, castAbilOf, control, ent, fail, featOf, ft, inFight, living, mod, need, spellStats, tellDM, up } from './shared.js';
import { aimArea, creatures, reveal, roomAt, showPlace, unhide } from './world.js';
import { boundEffect, settle, slotsFor, spellOffer } from './rolls.js';
import { castReaction, checkEnd, engage, reactAgainst, resolve, startEncounter } from './resolve.js';

// ---------- teleportation ----------
// SRD Rules Glossary, Teleportation: the creature disappears and reappears elsewhere without
// moving through the space between, spends no movement and provokes no Opportunity Attack. If the
// destination is occupied it appears instead in the nearest unoccupied space of its choice; a spell
// may say otherwise (`blocked`, Dimension Door). The spell says whether the destination must be seen.
// Does `e` know `o` is there? A creature it cannot know of does not stop it choosing a space.
const knownTo = (s, e, o) => !hiddenFrom(o, e) && !(e.side === 'party' && (o.hidden || unknown(s, o)));
// A creature-shaped stand-in at a position, for asking whether that space can be seen.
const spotOf = (e, pos) => ({ pos, size: e.size, cond: {}, side: e.side });
// Where a teleport step takes `e` when its caster names `hex`: checked before anything is spent.
// `hex.z` asks for a height (in the air, say); otherwise the surface in that column nearest `e`.
// A player may name only a place the party has been shown, and is told nothing about any other.
export function teleportSpot(s, e, step, hex, name, player = false) {
  (hex && Number.isInteger(hex.q) && Number.isInteger(hex.r)) || fail(`Pick where ${name} takes ${e.name}.`);
  const to = (Number.isFinite(hex.z) ? { q: hex.q, r: hex.r, z: hex.z } : landing(s.map, hex, e.pos.z)) || fail("There's nothing there to stand on.");
  if (player && unseenAt(s.map, to)) fail(`Pick a place the party has seen for ${name}.`);
  H.key(to) !== H.key(e.pos) || fail(`${e.name} is already there.`);
  const d = gap(s, e.pos, to);
  d * FT <= step.teleport || fail(`That is ${ft(d)} away. ${name} reaches ${step.teleport} ft.`);
  const why = roomAt(s, e, to);
  if (why) fail(why);
  if (step.see && canSee(s, e, spotOf(e, to)) === 'no') fail(`${e.name} can't see that space.`);
  !living(s).some((o) => o.id !== e.id && overlapAt(o, o.pos, e, to) && knownTo(s, e, o)) || fail('That space is occupied.');
  return to;
}

// Targets of a spell that a reaction keeps from taking its damage (Shield against Magic Missile):
// one that has the blocking spell going already, or casts it now by its instruction (or its
// player's answer). Returns their ids.
function blockSpell(s, caster, spellId, targets, ev) {
  const out = [];
  for (const t of new Set(targets)) {
    const has = (r) => r.blocks?.includes(spellId);
    const going = effectsOf(s).some((fx) => fx.source === t.id && SPELLS[fx.spell]?.def.reaction?.blocks?.includes(spellId) && fx.parts.some((p) => !p.ended));
    if (going) { out.push(t.id); continue; }
    if (!canReact(t) || t.id === caster.id) continue;
    const r = reactionsOf(t).find((x) => x.kind === 'spell' && has(x) && instruction(t, x) !== 'never');
    const sp = r && SPELLS[r.id], slots = sp ? slotsFor(s, t, sp) : [];
    if (!slots.length) continue;
    let slot = slots[0];
    if (instruction(t, r) === 'ask') {
      const seen = canSee(s, t, caster) !== 'no';
      const a = ask(s, t, { trigger: 'targeted', spell: spellId, ...(seen ? { by: caster.id } : {}) }, [spellOffer(r, slots)]);
      if (a === null) { tellDM(t, r, `${t.name} is targeted by ${SPELLS[spellId]?.name ?? 'a spell'}.`, ev); continue; }
      if (a.take !== r.id) continue;
      slot = a.slot ?? slot;
    }
    castReaction(s, t, sp, slot, 'targeted', caster.id, ev);
    out.push(t.id);
  }
  return out;
}

// `e` is casting `sp`. Anyone who would counter it (Counterspell) gets the chance, in the order
// the table lists them, until one does. Returns the id of the creature that countered it, or null.
// Only a spell with Verbal, Somatic or Material components can be seen being cast (SRD).
function counterWindow(s, e, sp, ev) {
  if (!(sp.def.components ?? []).some((c) => ['v', 's', 'm'].includes(c))) return null;
  for (const o of living(s)) {
    const src = reactAgainst(s, o, e, 'cast', ev, `${e.name} is casting a spell.`);
    if (src?.countered) return o.id;
  }
  return null;
}
// Put the caster's choice where a spell's steps say "chosen".
function chooseIn(steps, of, value) {
  const visit = (list) => { for (const st of list) {
    const m = st.modifier;
    if (m?.scope && of !== 'damageType') for (const k of ['skill', 'ability']) if (m.scope[k] === 'chosen' && k === of) m.scope[k] = value;
    if (m?.types && of === 'damageType') m.types = m.types.map((t) => (t === 'chosen' ? value : t));
    if ('damage' in st && st.type === 'chosen' && of === 'damageType') st.type = value;
    if (Array.isArray(st.cure) && of === 'condition') st.cure = st.cure.map((c) => (c === 'chosen' ? value : c));
    for (const b of BRANCHES) if (st[b]) visit(st[b]);
  } };
  visit(steps);
}
// Of the creatures an area catches, those the caster picks (an area with `choose`): `ids`, or all
// of them if that is no more than it may pick.
function chosen(e, name, caught, ids, most) {
  if (ids === undefined) {
    caught.length <= most || fail(`${name} affects up to ${most} creatures of ${e.name}'s choice in the area. Pick them.`);
    return caught;
  }
  (Array.isArray(ids) && ids.length <= most && new Set(ids).size === ids.length) || fail(`${name} affects up to ${most} different creatures.`);
  return ids.map((id) => caught.find((t) => t.id === id) || fail(`That creature is not in the area of ${name}.`));
}

// ---------- Metamagic ----------
// The options a creature knows are its features that grant `metamagic: { id, cost, pool }`
// (Sorcerer; content/srd52/classes/sorcerer.js); `a.metamagic` names those used on this casting,
// paid for from the pool (Sorcery Points). One a spell, or more while a feature with
// `metamagicMax: { n, while }` is in its `while` feature's effect (Sorcery Incarnate during Innate
// Sorcery). What each does is the engine's, by its id; Empowered and Seeking are decided after a
// roll, which the engine does not offer, so they are refused here and the DM applies them.
const TRANSMUTE = ['acid', 'cold', 'fire', 'lightning', 'poison', 'thunder'];
const METAMAGIC = ['careful', 'distant', 'extended', 'heightened', 'quickened', 'subtle', 'transmuted', 'twinned'];
function metamagicFor(s, e, sp, a, slot) {
  const none = { list: [], names: [], has: {}, cost: 0 };
  (a.metamagic === undefined || (Array.isArray(a.metamagic) && a.metamagic.every((x) => typeof x === 'string'))) || fail('Name the Metamagic options used.');
  for (const k of ['careful', 'heightened', 'transmute']) if (a[k] !== undefined && !(a.metamagic ?? []).includes(k === 'transmute' ? 'transmuted' : k)) fail(`"${k}" goes with that Metamagic option.`);
  if (a.metamagic === undefined) return none;
  const ids = a.metamagic;
  (Array.isArray(ids) && ids.length > 0 && new Set(ids).size === ids.length) || fail('Name the Metamagic options used.');
  const known = (e.feats ?? []).filter((f) => f.metamagic);
  const opts = ids.map((id) => known.find((f) => f.metamagic.id === id)?.metamagic ?? fail(`${e.name} doesn't know that Metamagic option.`));
  for (const o of opts) METAMAGIC.includes(o.id) || fail(`${nice(o.id)} Spell is decided after a roll; the engine does not offer that, so the DM applies it.`);
  const extra = (e.feats ?? []).filter((f) => f.metamagicMax && effectsOf(s).some((fx) => fx.source === e.id && fx.feature === f.metamagicMax.while));
  const max = Math.max(1, ...extra.map((f) => f.metamagicMax.n));
  ids.length <= max || fail(max === 1 ? 'One Metamagic option a spell.' : `${max} Metamagic options a spell at most.`);
  const pool = opts[0].pool, cost = opts.reduce((n, o) => n + o.cost, 0);
  (e.uses[pool] ?? 0) >= cost || fail(`${e.name} has ${e.uses[pool] ?? 0} Sorcery Points; that costs ${cost}.`);
  const has = Object.fromEntries(ids.map((id) => [id, true]));
  const out = { list: ids, names: ids.map((id) => `${nice(id)} Spell`), has, cost, pool };
  let saves = false, types = [];
  walkSteps(sp.def.effects, (st) => { if ('save' in st) saves = true; if ('damage' in st) types.push(st.type); });
  if (has.careful) {
    (saves) || fail('Careful Spell is for a spell that calls for saving throws.');
    const n = Math.max(1, mod(e.abil.cha));
    (Array.isArray(a.careful) && a.careful.length >= 1 && a.careful.length <= n && new Set(a.careful).size === a.careful.length) || fail(`Careful Spell protects up to ${n} creature${n === 1 ? '' : 's'}: name them.`);
    a.careful.includes(e.id) && fail('Careful Spell protects other creatures, not the caster.');
  }
  if (has.heightened) { saves || fail('Heightened Spell is for a spell that calls for saving throws.'); typeof a.heightened === 'string' || fail('Name the target Heightened Spell picks.'); }
  if (has.quickened) sp.time === 'action' || fail('Quickened Spell is for a spell cast as an action.');
  if (has.distant) {
    const r = sp.def.range;
    out.range = r === 'touch' ? 30 : typeof r === 'number' && r >= 5 ? sp.range * 2 : fail('Distant Spell is for a spell with a range of Touch or of 5 feet or more.');
  }
  if (has.extended) {
    const m = durationMinutes(sp.def.duration);
    (m !== null && m >= 1) || fail('Extended Spell is for a spell that lasts 1 minute or longer.');
    const twice = Math.min(1440, m * 2);
    out.duration = twice % 60 === 0 ? `${twice / 60} hour${twice === 60 ? '' : 's'}` : `${twice} minutes`;
  }
  if (has.transmuted) {
    types.some((t) => TRANSMUTE.includes(t)) || fail('Transmuted Spell is for a spell that deals Acid, Cold, Fire, Lightning, Poison or Thunder damage.');
    (TRANSMUTE.includes(a.transmute) && !types.includes(a.transmute)) || fail(`Choose the damage type Transmuted Spell makes it: ${TRANSMUTE.filter((t) => !types.includes(t)).join(', ')}.`);
  }
  if (has.twinned) targetCount(sp.def, e.level, Math.max(slot, sp.level) + 1) > targetCount(sp.def, e.level, Math.max(slot, sp.level)) || fail('Twinned Spell is for a spell that targets another creature at a higher level.');
  return out;
}
const nice = (id) => id[0].toUpperCase() + id.slice(1);

export const handlers = {

  // { type: 'cast', actor, spell, target? | hex?, slot? }
  cast(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    const sp = SPELLS[a.spell];
    // Cast through a feature (`a.via`, a feature with `freeCast`: Divine Intervention): any spell
    // of its list up to its level, prepared or not, with no slot, as part of the feature's action,
    // for one of its uses. A feature that names its spells (`freeCast.spells`: Magic Initiate's level 1
    // spell) casts one of them at its own level and casting time, with no slot, for one of its uses.
    const via = a.via !== undefined ? (featOf(e, a.via)?.freeCast ? featOf(e, a.via) : fail(`${e.name} has no feature that casts spells that way.`)) : null;
    if (via) {
      const fc = via.freeCast;
      (sp && (fc.spells ? fc.spells.includes(a.spell) : (sp.def.classes ?? []).includes(fc.list) && sp.level <= fc.maxLevel)) || fail(`${via.name} can't cast that spell.`);
      (e.uses[via.id] ?? 0) > 0 || fail(`${e.name} has no uses of ${via.name} left.`);
      a.slot === undefined || fail(`${via.name} casts a spell at its own level, without a slot.`);
    } else (sp && e.spells.includes(a.spell)) || fail(`${e.name} doesn't know that spell.`);
    up(e) || fail(`${e.name} is down.`);
    able(e);
    if (sp.time === 'reaction') fail(sp.def.reaction
      ? `${sp.name} is cast as a Reaction, by ${e.name}'s standing instruction for it (set it with the reactions on the sheet).`
      : `${sp.name} is cast as a Reaction. The engine does not handle that yet; the DM applies it.`);
    !e.form || fail(`${e.name} can't cast spells in the form of a ${e.form.name}.`);
    const raging = effectsOf(s).find((fx) => fx.source === e.id && fx.noSpells);
    if (raging) fail(`${e.name} can't cast spells during ${raging.name}.`);
    const asAction = !!via?.freeCast.list;                // Divine Intervention: the spell is the feature's Magic action
    if (!sp.turn && s.encounter && !asAction) fail(`${sp.name} takes longer than a turn to cast, so it can't be cast during a fight.`);
    let time = asAction ? 'action' : sp.time;

    // A choice made in casting (Guidance's skill, Resistance's damage type): `a.choice`.
    const pick = sp.def.choice;
    if (pick) (pick.from ?? CHOICES[pick.of]).includes(a.choice) || fail(`Choose ${pick.of === 'damageType' ? 'a damage type' : `a${pick.of === 'ability' ? 'n' : ''} ${pick.of}`} for ${sp.name}.`);
    // A zone may spare creatures the caster names (Spirit Guardians): `a.spare`.
    const zoneDef = sp.def.zone;
    if (a.spare !== undefined) {
      zoneDef?.spare || fail(`${sp.name} spares nobody by choice.`);
      (Array.isArray(a.spare) && a.spare.length <= 100 && a.spare.every((id) => typeof id === 'string' && s.entities[id])) || fail('Name the creatures it spares.');
    }
    // Who or what it is aimed at. A spell aimed at creatures takes `target` (one) or `targets`.
    const slot = sp.level > 0 ? (a.slot ?? sp.level) : 0;
    const mm = metamagicFor(s, e, sp, a, slot);
    const range = mm.range ?? sp.range;
    const most = targetCount(sp.def, e.level, Math.max(slot, sp.level) + (mm.has.twinned ? 1 : 0));
    let targets = [], hexes = null, areaOrigin = null;
    if (sp.aim === 'area') {
      ({ targets, hexes, origin: areaOrigin } = aimArea(s, e, sp.name, sp.area, range, a.hex));
      if (sp.area.choose) targets = chosen(e, sp.name, targets, a.targets, most);
    } else if (sp.aim === 'creature') {
      targets = creatures(s, e, sp.name, { range, harmful: sp.harmful, repeat: sp.repeat, within: sp.within, most, spell: true }, a);
    } else if (sp.aim === 'self') targets = [e];
    if (mm.has.careful) for (const id of a.careful) targets.some((t) => t.id === id) || fail('Careful Spell protects creatures the spell affects.');
    if (mm.has.heightened) targets.some((t) => t.id === a.heightened) || fail('Heightened Spell picks one target of the spell.');
    // A teleport goes where `a.hex` names (Misty Step), checked now, before anything is spent.
    // With no `hex` the engine has nowhere to take the caster and the DM moves it.
    const tpStep = sp.teleport ? sp.def.effects.find((x) => 'teleport' in x) : null;
    const tpTo = tpStep && a.hex !== undefined ? teleportSpot(s, e, tpStep, a.hex, sp.name, ctx.role !== 'dm') : null;

    // What it costs.
    if (sp.level > 0 && !via) {
      (Number.isInteger(slot) && slot >= sp.level && slot <= 9) || fail(`${sp.name} needs a spell slot of level ${sp.level} or higher.`);
      e.slots[slot] > 0 || fail(`${e.name} has no level ${slot} spell slots left.`);
    }
    const aimed = sp.aim === 'area' || sp.aim === 'creature';
    if (!s.encounter && sp.harmful && aimed) return sp.aim === 'area' ? startEncounter(s, e.pos, ev) : engage(s, e, targets[0], ev);
    const slotFlag = s.encounter ? s.encounter.flags.slot : undefined;
    const slotted = sp.level > 0 && !via;
    if (mm.has.quickened) time = 'bonus';
    if (s.encounter) {
      need(s, e, time);
      if (mm.has.quickened && s.encounter.flags.slot) fail('Quickened Spell can\'t be used after a level 1+ spell this turn.');
      if (slotted && s.encounter.flags.slot) fail('Only one spell slot can be spent per turn.');
      // Action Surge gives an action that can't be the Magic action: with it, one action spell a turn.
      if (time === 'action' && s.encounter.flags[`surge:${e.id}`] && s.encounter.flags[`magic:${e.id}`]) fail('The extra action from Action Surge can\'t be used to cast a spell.');
      if (time === 'action') s.encounter.flags[`magic:${e.id}`] = true;
      if (sp.aim === 'creature') for (const t of targets) inFight(s, t.id) || fail(`${t.name} is outside the battle.`);
      s.encounter.budget[time]--;
      if (slotted) s.encounter.flags.slot = true;
    }
    if (slotted) e.slots[slot]--;
    if (via) e.uses[via.id]--;
    if (mm.cost) e.uses[mm.pool] -= mm.cost;
    if (mm.has.quickened && s.encounter) s.encounter.flags.slot = true;      // and no level 1+ spell after it this turn
    if (mm.list.length) ev.push({ type: 'std', id: e.id, action: `Metamagic: ${mm.names.join(', ')}` });
    if (sp.def.components?.includes('v') && !mm.has.subtle) unhide(s, e, ev, 'spell');      // a Verbal component gives a hiding caster away
    showPlace(s, e, ev);
    // Someone who sees it being cast may counter it (Counterspell). Then it dissipates with no
    // effect: the action or Bonus Action is wasted, but a spell slot is not expended (SRD), and so
    // does not count as the one slot this turn.
    // Subtle Spell: nothing to see being cast, unless a Material component with a cost or one the spell consumes is left.
    const counteredBy = mm.has.subtle && !sp.def.costly ? null : counterWindow(s, e, sp, ev);
    if (counteredBy) {
      if (slotted) { e.slots[slot]++; if (s.encounter) { if (slotFlag) s.encounter.flags.slot = slotFlag; else delete s.encounter.flags.slot; } }
      ev.push({ type: 'countered', id: e.id, spell: a.spell, name: sp.name, by: counteredBy });
      return checkEnd(s, ev);
    }
    for (const t of targets) reveal(s, t, ev);         // caught in the area: no longer unseen

    // What it does: run its effect steps.
    const st = spellStats(e, s, sp.id), { steps, unscaled } = scaleSteps(sp.def, e.level, slot);
    if (pick) chooseIn(steps, pick.of, a.choice);
    if (mm.has.transmuted) walkSteps(steps, (st) => { if ('damage' in st && TRANSMUTE.includes(st.type)) st.type = a.transmute; });
    ev.push({ type: 'cast', actor: e.id, spell: a.spell, name: sp.name, hexes, targets: targets.map((t) => t.id), ...(slot > sp.level ? { slot } : {}), ...(pick ? { choice: a.choice } : {}), ...(via ? { via: via.name } : {}) });
    // A target may answer the spell with a reaction that keeps its damage off (Shield against Magic Missile).
    const blocked = sp.harmful && sp.aim === 'creature' ? blockSpell(s, e, a.spell, targets, ev) : [];
    // A spell that lasts becomes an effect: it is timed, it can hold conditions and modifiers on
    // creatures, and ending it takes them off. Concentrating on a new spell ends the old one.
    let fx = null;
    if (sp.def.duration !== 'instant') {
      if (sp.def.concentration) breakConcentration(s, ev, e.id, `${e.name} began concentrating on ${sp.name}`);
      fx = startEffect(s, { name: sp.name, spell: a.spell, source: e.id, conc: sp.def.concentration, duration: mm.duration ?? sp.def.duration });
      // Extended Spell: Advantage on saves to keep Concentration on it, for as long as it lasts.
      if (mm.has.extended && sp.def.concentration) fx.parts.push({ target: e.id, modifier: { on: 'concentration', op: 'advantage' } });
      ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: e.id, conc: fx.conc, lasts: fx.lasts, targets: [...new Set(targets.map((t) => t.id))] });
    } else fx = boundEffect(s, sp.name, e.id, steps, a.spell);
    // A zone stays where it was laid out (or moves with its caster) and works on whoever comes
    // into it later (zones.js). Unless it says `atCast`, nobody is affected as it appears.
    let hit = targets;
    if (zoneDef && fx && hexes) {
      const spare = a.spare ?? [];
      fx.zone = { area: { ...sp.area }, on: [...zoneDef.on], ...(zoneDef.once ? { once: zoneDef.once } : {}),
        ...(sp.area.shape === 'emanation' ? { follows: e.id } : { hexes: hexes.map(H.col), origin: { ...(areaOrigin ?? e.pos) } }),
        spare, steps: structuredClone(steps), src: { name: sp.name, dc: st.dc, attack: st.attack, range: sp.range, ...(sp.level === 0 ? { cantrip: true } : {}), healMod: mod(e.abil[castAbilOf(e, sp.id)] ?? 10) }, last: {} };
      hit = zoneDef.atCast ? targets.filter((t) => !spare.includes(t.id)) : [];
      const now = turnKey(s);
      if (now !== null) for (const t of hit) fx.zone.last[t.id] = now;     // "only once per turn": appearing counts
    }
    // Ground or air the spell changes for as long as it lasts (terrain.js). An instant one that says
    // `lasts: 'nextTurnEnd'` (Ice Storm) gets an effect that ends at the end of the caster's next turn.
    const ter = sp.def.terrain;
    if (ter && hexes) {
      if (!fx) {
        fx = startEffect(s, { name: sp.name, spell: a.spell, source: e.id, conc: false, duration: '1 round' });
        fx.parts.push({ target: e.id, ends: { on: 'turnEnd', of: 'source' }, born: turnKey(s) });
        ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: e.id, conc: false, lasts: 'until the end of its next turn', targets: [] });
      }
      fx.terrain = { area: { ...sp.area }, hexes: hexes.map(H.col), origin: { ...(areaOrigin ?? e.pos) }, ...(ter.difficult ? { difficult: true } : {}), ...(ter.obscured ? { obscured: ter.obscured } : {}) };
    }
    const before = ev.length;
    begin(s, {
      steps, actor: e.id, targets: sp.aim === 'none' ? null : hit.map((t) => t.id),
      src: { name: sp.name, dc: st.dc, attack: st.attack, range, ...(sp.level === 0 ? { cantrip: true } : {}), healMod: mod(e.abil[castAbilOf(e, sp.id)] ?? 10), ...(fx ? { fx: fx.id } : {}),
        ...(mm.has.careful ? { careful: [...a.careful] } : {}), ...(mm.has.heightened ? { heightened: a.heightened } : {}), ...(areaOrigin ? { origin: areaOrigin } : {}), ...(blocked.length ? { blocked } : {}), ...(tpTo ? { to: tpTo } : {}) },
      // Damage from one effect that several creatures save against at once is rolled once (SRD
      // "Damage against Multiple Targets"); rays, darts and beams each roll their own.
      shared: sp.aim === 'area' || (hit.length > 1 && !sp.repeat) ? sharedRolls(s, steps) : null,
    });
    resolve(s, ev);

    // Whatever the engine did not do, it says, so nothing is quietly skipped.
    const note = (text) => ev.push({ type: 'manual', actor: e.id, name: sp.name, text, partial: true });
    const toldAlready = ev.slice(before).some((x) => x.type === 'manual' && !x.partial);
    if (sp.def.tier !== 'auto' && !toldAlready) note(sp.def.text);
    if (unscaled) note(`Cast with a level ${slot} slot. The engine could not add ${unscaled}; the DM does.`);
    if (fx?.bound) settle(s, ev, fx, targets);
    else if (fx && fx.until === null) note(`${sp.name} lasts ${sp.def.duration}. The engine cannot time that; the DM ends it.`);
    checkEnd(s, ev);
  },
  // End a lasting effect early: its caster dropping Concentration, or the DM. { type: 'endEffect', effect }
  endEffect(s, a, ctx, ev) {
    const fx = effectsOf(s).find((x) => x.id === a.effect) || fail('No such effect.');
    const src = s.entities[fx.source], own = !!src?.owner && src.owner === ctx.userId;
    // To a player, an effect of a creature they do not know of, on nobody they know of, is nothing.
    if (ctx.role !== 'dm' && !own && (!src || unknown(s, src)) && !fx.parts.some((p) => s.entities[p.target] && !unknown(s, s.entities[p.target]))) fail('No such effect.');
    ctx.role === 'dm' || own || fail(`${fx.name} isn't yours to end.`);
    endEffect(s, ev, fx, own || !src ? `${src?.name ?? 'its caster'} ended it` : 'the DM ended it');
  },
};

