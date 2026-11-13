// Rules engine. Pure game logic: no rendering, no network, no clock but the in-world one.
//
//   apply(state, action, ctx) -> { ok, error?, events }
//
// Everything that happens in the game goes through apply(). The engine validates the
// action against the rules, mutates state, and returns events. Renderers turn events
// into numbers or animations; the server broadcasts them; the timeline records them;
// an AI DM or AI character is just another caller of apply().
import * as H from './hex.js';
import { d20Faces, die, roll } from './rng.js';
import { CONTENT, MONSTER_ACTIONS, MONSTERS, SPELLS, TILES } from './content/index.js';
import { ABILITIES, BRANCHES, CHOICES, lintRecord, SKILLS } from './content/schema.js';
import { begin, scaleSteps, sharedRolls, targetCount, walk as walkSteps } from './effects.js';
import { leaveForm, takeForm } from './forms.js';
import { breakConcentration, durationMinutes, effectsOf, endEffect, startEffect, tick, turnKey, useUp } from './durations.js';
import { apart, FT, gap, ground, landing, overlapAt, regionAt, STEP_MAX, under, unseenAt } from './space.js';
import { SIZES } from './content/sizes.js';
import { LIGHTS } from './content/lights.js';
import { EDITS, lintMap } from './map.js';
import { handoutActions } from './handouts.js';
import { rewardActions } from './rewards.js';
import { fightEndsScene, sceneActions } from './scenes.js';
import { canSee, coverOf, hiddenFrom, sees } from './sight.js';
import { remember, SIGHT_RULES, sightRule, unknown } from './vision.js';
import { barriers, center, distToSegment, objectDef, objectSegment } from './walls.js';
import { ATTUNE_MAX, attuneProblem, classesOf, derive, heldItems, itemName, levelOf, validate } from './derive.js';
import { canReact, instruction, mayAsk, opportunityAttack, reactionsOf, WHILE_WAITING } from './reactions.js';
import { conditionDef, conditionName, conditionPhrase, immuneTo, incapacitatedBy, modifiers } from './modifiers.js';
import { able, actTime, ARENA_RADIUS, ask, castAbilOf, control, current, ent, fail, featOf, ft, hostile, inFight, living, mod, need, Pause, rollDice, RuleError, RUN, setRun, spellStats, tellDM, up, walled } from './engine/shared.js';
import { aimAction, aimArea, airspace, aloft, creatures, findable, findDC, fitsOn, joinEncounter, lookAround, objectName, objectOf, objectShown, reveal, revealRegion, roomAt, SEARCH_FEET, setObject, showPlace, unfollow, unhide } from './engine/world.js';
import { boundEffect, checkBonus, condition, heal, passive, settle, slotsFor, spellOffer, tempHp } from './engine/rolls.js';
import { landItem, makeEntity, remake, resheet, tryLand } from './engine/sheets.js';
import { castReaction, checkEnd, damage, endEncounter, engage, fall, objectEffects, reactAgainst, resolve, startEncounter } from './engine/resolve.js';
import { handlers as movement } from './engine/movement.js';
import { handlers as attacks } from './engine/attacks.js';
// What the engine exports lives in engine/ by domain (see CLAUDE.md, Engine layout); importers
// keep importing it from here.
export { ARENA_RADIUS, blocked, castAbilOf, clear, current, dying, EXPLORE_BUDGET, fallen, featOf, FLY_CEILING, hostile, inFight, living, mod, spellStats, unblocked, up } from './engine/shared.js';
export { aloft, areaHexes, areaTargets, CATCH_UP, creatureType, moveOptions, NOTICE_FEET, objectName, objectShown, SEARCH_FEET, targetsFor } from './engine/world.js';
export { checkBonus, passive, rollMode } from './engine/rolls.js';
export { makeEntity } from './engine/sheets.js';
export { ENGAGE_RANGE } from './engine/movement.js';
export { actionSpent, attacksLeft, fromPool } from './engine/attacks.js';

export { FT };                       // feet per hex
export { opportunityAttack };
// Close enough to use it: beside a door's line, or on or next to a thing's hex, on its level.
function nearObject(s, e, o) {
  const level = s.map.levels.find((l) => l.id === o.level), z = level.z + (level.tiles[H.col(o.at)]?.h ?? 0);
  if (!ground(s.map, e.pos) || Math.abs(e.pos.z - z) > STEP_MAX) return false;
  const seg = objectSegment(o);
  return seg ? distToSegment(center(e.pos), seg) <= FT + 1e-9 : H.dist(e.pos, o.at) <= 1;     // within 5 ft
}
const hasKey = (e, key) => e.gear.some((g) => String(g).toLowerCase() === key.toLowerCase());
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

// What this creature could do right now with the objects in reach: [{ object, name, verb, label, time, why }].
export function usesFor(s, e) {
  const out = [];
  if (!e || !up(e)) return out;
  for (const o of s.map.objects) {
    if (!nearObject(s, e, o) || !objectShown(s.map, o)) continue;
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

// ---------- hiding (the SRD's Hide action) ----------
// `hiding: { dc }` is a creature that took the Hide action: it has the Invisible condition against
// its enemies (sight.js, hiddenFrom), and `dc` is its Stealth total, the DC to find it. By the SRD it
// stops being hidden when it makes an attack roll, casts a spell with a Verbal component, makes a
// sound louder than a whisper (the DM's call, by the `reveal` action) or an enemy finds it.
// Design: docs/specs/sight.md, decision 5.
export const HIDE_DC = 15;
// Why this creature can't take the Hide action where it is ('' if it can). The SRD: it must be
// Heavily Obscured or behind Three-Quarters or Total Cover, and out of any enemy's line of sight.
// It is judged against the enemies it can see itself ("if you can see a creature, you can discern
// whether it can see you"); one it cannot see, but that sees it, finds it at once (spotter).
export function hideProblem(s, e) {
  if (e.hiding) return `${e.name} is already hidden.`;
  for (const o of living(s)) {
    if (!up(o) || !hostile(o, e) || canSee(s, e, o) === 'no') continue;
    const cover = coverOf(s, o, e);
    if (cover === 'threeQuarters' || cover === 'total') continue;
    const w = sees(s, o, e, { ignoreHiding: true });
    if (w.see !== 'no') return `${o.name} can see ${e.name}.`;
    if (w.why !== 'dark' && w.why !== 'out of sight' && w.why !== 'obscured') return `${e.name} is neither Heavily Obscured nor behind cover from ${o.name}.`;
  }
  return '';
}
// An enemy that can see this creature where it stands, not counting its hiding, with less than Three-Quarters Cover.
const spotter = (s, e) => living(s).find((o) => up(o) && hostile(o, e) && canSee(s, o, e, { ignoreHiding: true }) !== 'no' && !['threeQuarters', 'total'].includes(coverOf(s, o, e))) ?? null;
// After every action: an enemy that can see a hiding creature anyway (Blindsight, Truesight) has
// found it, and with the table rule passiveFind 'all' so has one whose passive Perception meets
// its DC and that has it in view; Lightly Obscured (Dim Light) costs that 5.
function watch(s, ev) {
  for (const h of living(s)) {
    if (!h.hiding) continue;
    for (const o of living(s)) {
      if (!up(o) || !hostile(o, h)) continue;
      if (canSee(s, o, h) !== 'no') { unhide(s, h, ev, 'found', o); break; }
      if (s.settings.passiveFind !== 'all') continue;
      const w = canSee(s, o, h, { ignoreHiding: true });
      if (w !== 'no' && passive(s, o, 'perception', w === 'dim' ? ['dim light'] : []) >= h.hiding.dc) { unhide(s, h, ev, 'found', o); break; }
    }
  }
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
// `dimToo` also works out the total with Disadvantage for Dim Light from the same dice, as `dimTotal`
// (Search uses it for what it can see only dimly); it is not part of what is shown.
function abilityCheck(s, e, what, dimToo = false) {
  const ability = what.ability ?? SKILLS[what.skill];
  const m = modifiers(s, e, 'check', { target: e, ability, ...(what.skill ? { skill: what.skill } : {}) }, ''), bonus = checkBonus(e, what) + m.add;
  if (m.autoFail) return { roll: 0, total: 0, bonus };
  // SRD Tool Proficiency: proficient with the tool and in the skill used with it gives Advantage too.
  if (what.tool && what.skill && e.tools?.includes(what.tool) && e.skills?.includes(what.skill)) m.advantage = [...m.advantage, 'tool and skill'];
  const mode = m.advantage.length && !m.disadvantage.length ? 'adv' : m.disadvantage.length && !m.advantage.length ? 'dis' : 'normal';
  const dimMode = !dimToo ? 'normal' : m.advantage.length ? 'normal' : 'dis';
  const r1 = die(s, 20), r2 = mode === 'normal' && dimMode === 'normal' ? null : die(s, 20);
  const pickOf = (md) => (md === 'adv' ? Math.max(r1, r2) : md === 'dis' ? Math.min(r1, r2) : r1), r = pickOf(mode);
  const more = rollDice(s, m.dice);
  if (m.used.length) useUp(s, [], m.used);
  return { roll: r, total: r + bonus + more.total, bonus, dice: [...d20Faces(r1, mode === 'normal' ? null : r2, r), ...more.dice], ...(mode === 'normal' ? {} : { rolls: [r1, r2], mode, why: mode === 'adv' ? m.advantage : m.disadvantage }), ...(more.extra.length ? { extra: more.extra } : {}),
    ...(dimToo ? { dimTotal: pickOf(dimMode) + bonus + more.total } : {}) };
}
const slug = (x) => String(x).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const hasTool = (e, tool) => e.gear.some((g) => slug(g) === tool);
const toolName = (tool) => (tool === 'thieves-tools' ? "Thieves' Tools" : tool.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '));
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

const handlers = {
  ...movement,
  ...attacks,

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
  // { type: 'react', prompt, take: reactionId | null, slot? }: the answer to the reaction an action
  // is waiting on (`pending`; reactions.js). Given by the reacting creature's controller or the DM
  // (the DM's answer overrides). `prompt` is the number it was asked under, so an answer to an
  // older question is refused. `take: null` declines. `slot` picks the spell slot, from those offered.
  // The waiting action then runs again from where it began, with this answer and those before it,
  // and its events are this action's (it may stop again to ask another).
  react(s, a, ctx, ev) {
    const p = s.pending || fail('No reaction is waiting for an answer.');
    a.prompt === p.n || fail('That question has already been answered.');
    const t = s.entities[p.ask.reactor] || fail('No such creature.');
    control(t, ctx);
    let answer = { reactor: t.id, take: null };
    if (a.take !== null && a.take !== undefined) {
      const o = p.ask.options.find((x) => x.reaction === a.take) || fail(`${t.name} can't answer with that.`);
      if (a.slot !== undefined) (o.slots?.includes(a.slot)) || fail(o.slots ? `${o.name} can be cast with a level ${o.slots.join(', ')} slot.` : `${o.name} uses no spell slot.`);
      answer = { reactor: t.id, take: o.reaction, ...(a.slot !== undefined ? { slot: a.slot } : {}) };
    } else if (a.slot !== undefined) fail('A slot is chosen only with a reaction to take.');
    const { action, ctx: was, answers } = p;
    delete s.pending;
    ev.push({ type: 'reactionAnswered', id: t.id, n: p.n, take: answer.take, by: ctx.role === 'dm' ? 'dm' : 'player' });
    Object.assign(RUN, { action, ctx: was, answers: [...answers, answer], i: 0 });
    dispatch(s, action, was, ev);
  },
  secondWind(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    e.uses.secondWind > 0 || fail(`${e.name} has no uses of Second Wind left.`);
    need(s, e, 'bonus');
    e.hp < e.maxHp || fail(`${e.name} is already at full Hit Points.`);
    if (s.encounter) s.encounter.budget.bonus--;
    e.uses.secondWind--;
    ev.push({ type: 'std', id: e.id, action: 'Second Wind' });
    const r = roll(s, `1d10+${e.level}`);
    heal(s, e, r.total, ev, { ...r, by: e.id });
  },
  // Use a feature of a built character (derive.js): { type: 'feature', actor, feature, target? |
  // targets? | hex?, amount? }. What it does is its data: effect steps (on the effect runner, a
  // lasting effect if it has a duration), an extra action or attacks (`gain`), or a pool of healing
  // (`pool`, `amount` from it). A feature with uses and no action of its own is spent, and its text
  // goes to the DM, who applies it. Costs: the action or Bonus Action, and a use of its own or of
  // another feature (`cost`).
  feature(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    const f = featOf(e, a.feature) || fail(`${e.name} has no such feature.`);
    // A screen that does not yet send the choice a feature needs (a mode, a form, a slot to make or
    // spend) still spends what it costs and hands the rest to the DM, as before these were built.
    if (f.exchange && (a.make !== undefined || a.spend !== undefined)) return exchange(s, e, f, a, ev);
    // A feature that casts a spell (Divine Intervention) is used by casting: `cast` with `via`.
    (!f.freeCast || f.action) || fail(`${f.name} casts a spell: cast the spell through it (cast with via "${f.id}").`);
    const act = f.action ?? (f.uses ? { time: 'free', target: { self: true }, effects: [{ manual: `${f.name}: ${f.text}` }] } : null);
    act || fail(`${f.name} is always on; there is nothing to use.`);
    up(e) || fail(`${e.name} is down.`);
    able(e);
    act.time !== 'reaction' || fail(f.reaction ? `${f.name} is a Reaction, taken by ${e.name}'s standing instruction for it.` : `${f.name} is a Reaction. The engine does not take that reaction yet; the DM applies it.`);
    if (act.form && (a.form !== undefined || e.form)) return shapeShift(s, e, f, act, a, ev);
    const enc = s.encounter, fighting = !!enc && inFight(s, e.id), time = act.time === 'free' ? null : act.time;
    if (act.unless === 'heavy' && e.armour === 'heavy') fail(`${e.name} can't use ${f.name} while wearing Heavy armor.`);
    // A Rage already going is extended by its Bonus Action, without spending a use.
    const live = act.renew ? effectsOf(s).find((fx) => fx.source === e.id && fx.feature === f.id) : null;
    if (live) {
      fighting || fail(`${e.name}'s ${f.name} is already going.`);
      need(s, e, time);
      enc.budget[time]--;
      const now = turnKey(s);
      for (const p of live.parts) if (!p.ended && p.ends?.on === 'turnEnd') p.born = now;
      return ev.push({ type: 'std', id: e.id, action: `${f.name} (extended)` });
    }
    let res = act.cost?.resource ?? (f.uses ? f.id : null), n = act.cost?.n ?? 1;
    // `orCost`: with none of its own uses left, it may be paid for from another pool instead
    // (Dragon Wings for 3 Sorcery Points; Innate Sorcery for 2 with Sorcery Incarnate).
    if (res && !act.pool && (e.uses[res] ?? 0) < n && act.orCost && (e.uses[act.orCost.resource] ?? 0) >= act.orCost.n) { res = act.orCost.resource; n = act.orCost.n; }
    if (res && !act.pool) (e.uses[res] ?? 0) >= n || fail(`${e.name} has no uses of ${featOf(e, res)?.name ?? res} left.`);
    if (time && fighting) need(s, e, time);
    if ((act.gain || act.firstAttack) && !(fighting && current(s) === e.id)) fail(`${f.name} is used on ${e.name}'s turn in a fight.`);
    if (act.firstAttack) {
      !enc.flags[`attacked:${e.id}`] || fail(`${f.name} is decided before the first attack roll of the turn.`);
      !enc.flags[`${f.id}:${e.id}`] || fail(`${e.name} has already used ${f.name} this turn.`);
    }
    if (act.gain?.action) !enc.flags[`surge:${e.id}`] || fail(`${f.name} can be used once a turn.`);
    if (act.gain?.attacks && enc.budget.bonusAttacks) fail(`${e.name} already has those attacks to make.`);
    // A pool of healing (Lay On Hands): `amount` Hit Points from what is left, to a creature in
    // reach; and with `cure`, conditions to remove from it at the pool's cost each (`a.cure`, a list).
    let poolTarget = null, amount = 0, cures = [];
    if (act.pool) {
      poolTarget = ent(s, a.target ?? e.id);
      !poolTarget.dead || fail(`${poolTarget.name} is dead.`);
      if (poolTarget.id !== e.id) { apart(s, e, poolTarget) * FT <= (act.target.creature.reach ?? 5) || fail(`${poolTarget.name} is out of reach.`); walled(s, e, poolTarget); }
      if (a.cure !== undefined) {
        (Array.isArray(a.cure) && a.cure.length && new Set(a.cure).size === a.cure.length) || fail(`Name the conditions ${f.name} removes.`);
        for (const c of a.cure) {
          act.cure?.conditions.includes(c) || fail(`${f.name} can't remove ${conditionName(c)}.`);
          poolTarget.cond[c] || fail(`${poolTarget.name} ${conditionPhrase(c).replace(/^is /, 'is not ').replace(/^has /, 'does not have ')}.`);
        }
        cures = a.cure;
      }
      amount = a.amount ?? 0;
      (Number.isInteger(amount) && amount >= 0 && (amount > 0 || cures.length)) || fail(`Say how many Hit Points ${f.name} restores.`);
      const cost = amount + cures.length * (act.cure?.cost ?? 0);
      cost <= (e.uses[res] ?? 0) || fail(`${f.name} has ${e.uses[res] ?? 0} Hit Points left.`);
    }
    // A feature with `modes` does one of several things, named by `a.mode` (Divine Spark: heal, or radiant or necrotic harm).
    const mode = act.modes && a.mode !== undefined ? act.modes.find((m) => m.id === a.mode) || fail(`Choose what ${f.name} does: ${act.modes.map((m) => m.name).join(', ')}.`) : null;
    const byHand = (act.modes && !mode) || act.form ? [{ manual: `${f.name}: ${f.text} (No choice was sent, so the DM applies it.)` }] : null;
    const aimed = act.gain || act.pool ? null : aimAction(s, e, { name: f.name, target: act.target, effects: byHand ?? (mode ? mode.effects : act.effects) }, a);
    if (aimed?.targets && fighting) for (const t of aimed.targets) inFight(s, t.id) || fail(`${t.name} is outside the battle.`);
    // A die handed to another creature to spend later (Bardic Inspiration: "A creature can have only one
    // Bardic Inspiration die at a time"): not to one that still holds one from this feature, whoever gave it.
    const gives = act.duration && (act.effects ?? []).some((st) => st.modifier?.uses !== undefined);
    if (gives && aimed?.targets) for (const t of aimed.targets) {
      const holds = effectsOf(s).some((fx) => fx.feature === f.id && fx.parts.some((p) => p.target === t.id && !p.ended && p.modifier?.uses !== undefined));
      !holds || fail(`${t.name} already has a ${f.name} die.`);
    }

    // Paid for: from here it happens.
    if (time && fighting) enc.budget[time]--;
    if (res) e.uses[res] -= act.pool ? amount + cures.length * (act.cure?.cost ?? 0) : n;
    if (act.firstAttack) enc.flags[`${f.id}:${e.id}`] = true;
    if (act.pool) {
      ev.push({ type: 'std', id: e.id, action: f.name });
      for (const c of cures) { delete poolTarget.cond[c]; ev.push({ type: 'condEnd', id: poolTarget.id, cond: c }); }
      return amount > 0 ? heal(s, poolTarget, Math.min(amount, poolTarget.maxHp - Math.max(0, poolTarget.hp)), ev) : undefined;
    }
    if (act.gain?.action) {                                             // Action Surge: one more action, not a Magic action
      enc.budget.action++; enc.flags[`surge:${e.id}`] = true;
      return ev.push({ type: 'std', id: e.id, action: f.name });
    }
    if (act.gain?.attacks) {                                            // Flurry of Blows: so many attacks with one attack
      enc.budget.bonusAttacks = { with: act.gain.attacks.with, left: act.gain.attacks.n };
      return ev.push({ type: 'std', id: e.id, action: f.name });
    }
    if (act.noSpells) breakConcentration(s, ev, e.id, `${e.name} entered ${f.name}`);
    const steps = structuredClone(byHand ?? (mode ? mode.effects : act.effects)), targets = aimed.targets;
    let fx = null;
    if (act.duration && act.duration !== 'instant') {
      fx = startEffect(s, { name: f.name, spell: null, source: e.id, conc: false, duration: act.duration });
      Object.assign(fx, { feature: f.id, ...(act.renew ? { renew: true } : {}), ...(act.noSpells ? { noSpells: true } : {}), ...(act.endsWhenIncapacitated ? { fragile: true } : {}) });
      ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: e.id, conc: false, lasts: fx.lasts, targets: (targets ?? []).map((t) => t.id) });
    } else fx = boundEffect(s, f.name, e.id, steps);
    if (!('attack' in steps[0])) ev.push({ type: 'std', id: e.id, action: f.name });
    const st = e.castAbil ? spellStats(e, s) : null;
    begin(s, { steps, actor: e.id, targets: targets === null ? null : targets.map((t) => t.id),
      src: { name: f.name, ...(st ? { dc: st.dc, attack: st.attack } : {}), healMod: mod(e.abil[e.castAbil] ?? 10), ...(fx ? { fx: fx.id } : {}) },
      // Damage an area feature deals is rolled once for everyone in it (Sear Undead), as a spell's is.
      shared: aimed.hexes ? sharedRolls(s, steps) : null });
    resolve(s, ev);
    if (fx?.bound) settle(s, ev, fx, targets ?? []);
    checkEnd(s, ev);
  },

  // Do something with an object in reach: open a door, pull a lever. { type: 'use', actor, object, verb }
  use(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    up(e) || fail(`${e.name} is down.`);
    able(e);
    const o = objectOf(s, a.object, ctx), def = objectDef(o), name = objectName(o), the = `The ${name.toLowerCase()}`;
    const u = def.use.find((x) => x.id === a.verb) || fail(`${the} can't be used that way.`);
    nearObject(s, e, o) || fail(`${e.name} is too far from the ${name.toLowerCase()}.`);
    u.from.includes(o.state) || fail(`${the} is ${def.states[o.state].name}.`);
    if (u.key) {
      o.key || fail(`${the} has no lock.`);
      hasKey(e, o.key) || fail(`${e.name} doesn't have the key.`);
    }
    if (u.check?.tool) hasTool(e, u.check.tool) || fail(`${e.name} needs ${toolName(u.check.tool)} for that.`);
    // In a fight the first thing handled on a turn is free; anything more, or anything slow, takes the action.
    if (s.encounter && inFight(s, e.id)) {
      current(s) === e.id || fail(`It isn't ${e.name}'s turn.`);
      if (u.time === 'free' && !s.encounter.flags.interact) s.encounter.flags.interact = true;
      else { need(s, e, 'action'); s.encounter.budget.action--; }
    }
    if (u.check) {
      const c = u.check, dc = o.dc?.[u.id] ?? c.dc, r = abilityCheck(s, e, c);
      ev.push({ type: 'check', id: e.id, ability: c.ability, ...(c.skill ? { skill: c.skill } : {}), ...(c.tool ? { tool: c.tool } : {}), ...r, dc, success: r.total >= dc, what: `${u.name}: ${name}` });
      if (r.total < dc) return;
    }
    if (u.to) setObject(s, o, u.to, ev, e, u.id);
    if (u.effects) objectEffects(s, o, u.effects, [e], ev);
  },

  // Roll an ability check. { type: 'check', actor, skill | ability, dc? } Only the DM may set a DC,
  // and players are told neither the DC nor whether the roll met it: the DM says what happens.
  check(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    up(e) || fail(`${e.name} is down.`);
    const skill = a.skill === undefined ? null : (Object.hasOwn(SKILLS, a.skill) && a.skill) || fail('Unknown skill.');
    const ability = skill ? SKILLS[skill] : (ABILITIES.includes(a.ability) && a.ability) || fail('Name a skill or an ability.');
    if (a.dc !== undefined) {
      ctx.role === 'dm' || fail('Only the DM sets a DC.');
      (Number.isInteger(a.dc) && a.dc > 0 && a.dc <= 40) || fail('A DC is a whole number from 1 to 40.');
    }
    const r = abilityCheck(s, e, { ability, skill });
    ev.push({ type: 'check', id: e.id, ability, ...(skill ? { skill } : {}), ...r, ...(a.dc !== undefined ? { dc: a.dc, success: r.total >= a.dc, secret: true } : {}) });
  },
  // The Search action: one Wisdom (Perception) check against everything hidden within 15 feet, and
  // against every enemy hiding where the searcher could see it but for its hiding (its Stealth total
  // is the DC; in Dim Light the check has Disadvantage). { type: 'search', actor }
  search(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    up(e) || fail(`${e.name} is down.`);
    able(e);
    if (s.encounter && inFight(s, e.id)) { need(s, e, 'action'); s.encounter.budget.action--; }
    const hiders = living(s).filter((o) => hiddenFrom(o, e)).map((o) => ({ o, w: canSee(s, e, o, { ignoreHiding: true }) })).filter((x) => x.w !== 'no');
    const r = abilityCheck(s, e, { skill: 'perception' }, hiders.some((x) => x.w === 'dim')), dimTotal = r.dimTotal;
    delete r.dimTotal;
    const found = s.map.objects.filter((o) => findable(s, e, o, SEARCH_FEET) && findDC(o) <= r.total);
    const spotted = hiders.filter((x) => (x.w === 'dim' ? dimTotal : r.total) >= x.o.hiding.dc).map((x) => x.o);
    ev.push({ type: 'check', id: e.id, ability: 'wis', skill: 'perception', ...r, search: true, found: found.length + spotted.length });
    for (const o of found) setObject(s, o, objectDef(o).find.to, ev);
    for (const o of spotted) unhide(s, o, ev, 'found', e);
  },
  // The Hide action: a DC 15 Dexterity (Stealth) check, taken where no enemy it can see can see it.
  // A creature with Nimble Escape takes it as a Bonus Action. { type: 'hide', actor }
  hide(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    up(e) || fail(`${e.name} is down.`);
    able(e);
    const why = hideProblem(s, e);
    if (why) fail(why);
    if (s.encounter && inFight(s, e.id)) { const time = actTime(e, 'hide', a); need(s, e, time); s.encounter.budget[time]--; }
    const r = abilityCheck(s, e, { skill: 'stealth' }), success = r.total >= HIDE_DC;
    ev.push({ type: 'check', id: e.id, ability: 'dex', skill: 'stealth', ...r, hide: true, success });
    if (!success) return;
    e.hiding = { dc: r.total };
    ev.push({ type: 'hid', id: e.id });
    const o = spotter(s, e);
    if (o) unhide(s, e, ev, 'found', o);                                // an enemy it could not see was watching all along
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
    const body = { size: tpl.size };
    fitsOn(s.map, body, at, barriers(s.map)) || fail(`There isn't room for something ${tpl.size} there.`);
    !living(s).some((o) => overlapAt(o, o.pos, body, at)) || fail('That hex is occupied.');
    const id = `m${++s.seq}`;
    const n = Object.values(s.entities).filter((o) => o.tpl === a.monster).length + 1;
    s.entities[id] = makeEntity(tpl, { id, tpl: a.monster, name: a.name || `${tpl.name} ${n}`, pos: at, ...(a.hidden ? { hidden: true } : {}) });
    ev.push({ type: 'spawned', id });
    if (s.encounter?.arena[H.col(at)]) joinEncounter(s, s.entities[id], ev);
  },
  place(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can place creatures.');
    const e = ent(s, a.actor);
    // On the nearest floor, or exactly where asked if a height is given and there is room there (in the air, say).
    const to = (a.to.z !== undefined && airspace(s.map, a.to) ? { q: a.to.q, r: a.to.r, z: a.to.z } : landing(s.map, a.to, e.pos.z)) || fail("There's nothing there to stand on.");
    !living(s).some((o) => o.id !== e.id && overlapAt(o, o.pos, e, to)) || fail('That hex is occupied.');
    e.pos = to;
    ev.push({ type: 'placed', id: e.id, to });
    lookAround(s, ev, [e]);
    if (s.encounter?.arena[H.col(to)] && !inFight(s, e.id) && !e.dead) joinEncounter(s, e, ev);
  },
  // Show a region to the players, or take it back. { type: 'revealRegion', region, revealed: true|false }
  revealRegion(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can reveal a place.');
    const r = s.map.regions.find((x) => x.id === a.region) || fail('No such region.');
    if (a.revealed === false) {
      r.revealed || fail(`${r.name} isn't revealed.`);
      !living(s).some((e) => e.side === 'party' && regionAt(s.map, under(s.map, e.pos)?.level.id, e.pos) === r) || fail(`Someone from the party is in ${r.name}.`);
      !s.encounter || fail("A place can't be hidden in the middle of a fight.");
      r.revealed = false;
      ev.push({ type: 'regionHidden', region: r.id });
    } else {
      !r.revealed || fail(`${r.name} is already revealed.`);
      revealRegion(s, r, ev);
    }
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
    for (const e of living(s)) {                         // a floor may give way under someone, but there must be something to land on
      const sf = under(map, e.pos);
      (sf && !(sf.z === e.pos.z && B.solid(sf.level.id, e.pos))) || fail(`${e.name} would be left with nowhere to stand.`);
    }
    s.map = map;
    ev.push({ type: 'mapEdit', count: a.ops.length });
    lookAround(s, ev);
  },
  // Give a creature a way of moving, or take it away. { type: 'setSpeed', actor, mode, feet, hover? }
  setSpeed(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can change how a creature moves.');
    const e = ent(s, a.actor);
    ['walk', 'climb', 'swim', 'fly', 'burrow'].includes(a.mode) || fail('Unknown way of moving.');
    (Number.isInteger(a.feet) && a.feet >= 0 && a.feet <= 300 && a.feet % FT === 0) || fail('A Speed is a multiple of 5 feet.');
    if (a.mode === 'walk') e.speed = a.feet; else if (a.feet) e.speeds[a.mode] = a.feet; else delete e.speeds[a.mode];
    if (a.mode === 'fly') { if (a.hover && a.feet) e.hover = true; else delete e.hover; }
    ev.push({ type: 'speed', id: e.id, mode: a.mode, feet: a.feet });
  },
  // Add a character typed in by hand. { type: 'addCharacter', record, at? }
  // The record is a finished sheet (see lintRecord in content/schema.js). It joins the party
  // beside whoever is already there, or at `at`.
  addCharacter(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can add a character.');
    const problems = lintRecord(a.record, { spells: SPELLS });
    problems.length === 0 || fail(`That character can't be added. ${problems[0]}`);
    Object.values(s.entities).filter((e) => e.kind === 'pc').length < 12 || fail('A table holds twelve characters at most.');
    const body = { size: a.record.size ?? 'medium' }, B = barriers(s.map);
    const near = a.at ?? Object.values(s.entities).find((e) => e.side === 'party' && !e.dead)?.pos ?? s.map.starts[0] ?? H.parse(Object.keys(s.map.levels[0].tiles)[0]);
    const centre = landing(s.map, near, near.z ?? 0) || fail("There's nowhere there to stand.");
    let spot = null;
    for (let n = 0; n < 8 && !spot; n++) for (const h of H.range(centre, n)) {
      const p = H.dist(h, centre) === n ? landing(s.map, h, centre.z) : null;
      if (!spot && p && Math.abs(p.z - centre.z) <= STEP_MAX && TILES[ground(s.map, p).tile.t].cost < Infinity && !B.solid(ground(s.map, p).level.id, p) &&
          fitsOn(s.map, body, p, B) && !living(s).some((o) => overlapAt(o, o.pos, body, p))) spot = p;
    }
    spot || fail('There is no room for another character there.');
    const id = `pc${++s.seq}`;
    s.entities[id] = makeEntity(a.record, { id, kind: 'pc', side: 'party', pos: spot });
    ev.push({ type: 'spawned', id });
    lookAround(s, ev, [s.entities[id]]);
    if (s.encounter?.arena[H.col(spot)]) joinEncounter(s, s.entities[id], ev);
  },
  // Replace a character's sheet with a corrected one, keeping who plays it, where it stands and
  // how hurt it is. { type: 'editCharacter', actor, record }
  editCharacter(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can change a character.');
    const e = ent(s, a.actor);
    e.kind === 'pc' || fail(`${e.name} is not a character.`);
    const problems = lintRecord(a.record, { spells: SPELLS });
    problems.length === 0 || fail(`That change can't be made. ${problems[0]}`);
    const body = { size: a.record.size ?? 'medium' };
    (!ground(s.map, e.pos) || fitsOn(s.map, body, e.pos, barriers(s.map))) || fail(`There isn't room for ${e.name} to be ${body.size} there.`);
    !living(s).some((o) => o.id !== e.id && overlapAt(o, o.pos, body, e.pos)) || fail(`Someone is in the way of ${e.name} growing.`);
    const fresh = makeEntity(a.record, { id: e.id, kind: 'pc', side: e.side, pos: e.pos, owner: e.owner, ownerName: e.ownerName });
    const lost = e.maxHp - e.hp;
    Object.assign(fresh, { hp: Math.max(e.hp > 0 ? 1 : 0, fresh.maxHp - lost), cond: e.cond, death: e.death, dead: e.dead, reactionUsed: e.reactionUsed, ...(e.reactions ? { reactions: e.reactions } : {}) });
    for (const [l, n] of Object.entries(fresh.slots)) fresh.slots[l] = Math.min(n, Math.max(0, n - ((e.slotsMax?.[l] ?? 0) - (e.slots?.[l] ?? 0))));      // slots already spent stay spent
    if (e.look && !a.record.look) fresh.look = e.look;
    s.entities[e.id] = fresh;
    ev.push({ type: 'edited', id: e.id });
  },
  // A character built from class and level (derive.js). { type: 'setSheet', sheet, actor?, at? }
  // Without `actor` it joins the party as addCharacter does; with one, that character is made
  // again from the new sheet, keeping who plays it, where it stands, the damage it has taken, its
  // conditions, and what it has spent: uses of features, spell slots, Hit Point Dice. The sheet is
  // kept on the creature, so it can be made again. A hand-typed record has no sheet and is untouched.
  setSheet(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can change a character.');
    const problems = validate(a.sheet);
    problems.length === 0 || fail(`That sheet can't be played yet. ${problems[0]}`);
    const { record } = derive(a.sheet), sheet = structuredClone(a.sheet);
    if (a.actor === undefined) {
      handlers.addCharacter(s, { record, ...(a.at ? { at: a.at } : {}) }, ctx, ev);
      s.entities[ev.findLast((x) => x.type === 'spawned').id].sheet = sheet;
      return;
    }
    remake(s, ent(s, a.actor), record, sheet, ev);
  },
  // Up one level, outside a fight: one more level in a class it has, or level 1 in a new class
  // (Multiclassing), whose prerequisites validate() checks. { type: 'levelUp', actor, sheet }
  levelUp(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can level a character up.');
    const e = ent(s, a.actor);
    e.sheet || fail(`${e.name} was typed in by hand. Build a sheet for them first.`);
    !inFight(s, e.id) || fail(`${e.name} can't level up in the middle of a fight.`);
    (a.sheet && typeof a.sheet === 'object' && !Array.isArray(a.sheet)) || fail('Send the new sheet.');
    const was = classesOf(e.sheet), now = Array.isArray(a.sheet.classes) ? classesOf(a.sheet) : null;
    if (!now) {
      (a.sheet.class === was[0].c?.id && was.length === 1) || fail(was.length > 1 ? `${e.name} has several classes; the new sheet lists them all.` : 'Levelling up keeps the class, or adds one: list both classes to take a level in a new one.');
      (a.sheet.level === e.sheet.level + 1) || fail(`${e.name} is level ${e.sheet.level}; the new sheet must be level ${e.sheet.level + 1}.`);
    } else {
      // The classes it had, in the same order, with one level more in one of them or a new class at level 1 at the end.
      const ids = (l) => l.map((k) => k.c?.id);
      const same = now.length >= was.length && now.length <= was.length + 1 && ids(was).every((id, i) => ids(now)[i] === id);
      same || fail(`Levelling up keeps ${e.name}'s classes in the order taken: ${ids(was).join(', ')}, and may add one at the end.`);
      const more = now.map((k, i) => k.level - (was[i]?.level ?? 0));
      (more.every((n) => n >= 0) && more.reduce((x, y) => x + y, 0) === 1 && (now.length === was.length || now[now.length - 1].level === 1))
        || fail(`${e.name} gains one level: one more in one class, or level 1 in a new one.`);
    }
    const problems = validate(a.sheet);
    problems.length === 0 || fail(`That sheet can't be played yet. ${problems[0]}`);
    remake(s, e, derive(a.sheet).record, structuredClone(a.sheet), ev);
    ev.push({ type: 'std', id: e.id, action: `reached level ${levelOf(a.sheet)}` });
  },
  // Take a creature out of the game. { type: 'remove', actor }
  remove(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can remove a creature.');
    const e = ent(s, a.actor);
    !inFight(s, e.id) || fail(`${e.name} is in the fight. End the fight first.`);
    for (const fx of [...effectsOf(s)]) if (fx.source === e.id || fx.parts.some((p) => p.target === e.id)) endEffect(s, ev, fx, `${e.name} left`);
    ev.push({ type: 'removed', id: e.id, name: e.name });
    for (const x of Object.values(s.entities)) if (x.follow === e.id) unfollow(s, x, ev);
    delete s.entities[e.id];
  },
  // Change how big a creature is. { type: 'setSize', actor, size }
  setSize(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can change a creature\'s size.');
    const e = ent(s, a.actor);
    Object.hasOwn(SIZES, a.size) || fail('Unknown size.');
    const body = { size: a.size };
    (!ground(s.map, e.pos) || fitsOn(s.map, body, e.pos, barriers(s.map))) || fail(`There isn't room for ${e.name} to be ${a.size} there.`);
    !living(s).some((o) => o.id !== e.id && overlapAt(o, o.pos, body, e.pos)) || fail(`Someone is in the way of ${e.name} growing.`);
    e.size = a.size;
    ev.push({ type: 'size', id: e.id, size: a.size });
  },
  // Hand a creature an item, or take one away. { type: 'give', actor, item, take?, base?, damageType?, spell? }
  // `item` is a name (kept in `gear`, as before) or the id of a magic item of the pack. A pack item given to a
  // built character joins its sheet's `items` (carried, not worn), with `base`, `damageType` (the sheet's `type`) or `spell` where the item
  // asks for one; a character typed in by hand has no sheet, so it gets the item's name in `gear` only. To take a
  // magic item back, name its key on the sheet ("i1").
  give(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can hand out items.');
    const e = ent(s, a.actor), item = String(a.item ?? '').trim();
    (item && item.length <= 80) || fail('Name the item.');
    const held = e.sheet && Array.isArray(e.sheet.items) ? e.sheet.items.find((x) => x?.id === item) : null;
    if (a.take && held) {
      const sheet = structuredClone(e.sheet);
      sheet.items = sheet.items.filter((x) => x.id !== item);
      if (sheet.attuning?.item === item) delete sheet.attuning;
      if (!sheet.items.length) delete sheet.items;
      resheet(s, e, sheet, ev);
      return ev.push({ type: 'gear', id: e.id, item: itemName(CONTENT.items[held.item], held), key: held.id, pack: held.item, why: 'dm', taken: true });
    }
    if (!a.take && Object.hasOwn(CONTENT.items, item)) {
      const def = CONTENT.items[item], spec = { item, ...(a.base !== undefined ? { base: a.base } : {}), ...(a.damageType !== undefined ? { type: a.damageType } : {}), ...(a.spell !== undefined ? { spell: a.spell } : {}) };
      if (e.sheet) {
        const x = landItem(s, e, [spec], ev)[0];
        return ev.push({ type: 'gear', id: e.id, item: itemName(def, x), key: x.id, pack: item, why: 'dm' });
      }
      const name = itemName(def, spec);
      e.gear.push(name);
      return ev.push({ type: 'gear', id: e.id, item: name, pack: item, why: 'dm', nameOnly: true });
    }
    (a.base === undefined && a.damageType === undefined && a.spell === undefined) || fail(`"${item}" is not a magic item of the pack.`);
    if (a.take) {
      const i = e.gear.findIndex((g) => String(g).toLowerCase() === item.toLowerCase());
      i >= 0 || fail(`${e.name} has no ${item}.`);
      e.gear.splice(i, 1);
    } else e.gear.push(item);
    ev.push({ type: 'gear', id: e.id, item, why: 'dm', ...(a.take ? { taken: true } : {}) });
  },
  // Put on or take off a magic item: armour donned, a Shield or weapon held, a ring worn, an Ioun Stone sent to
  // orbit. { type: 'equip', actor, item: key on the sheet, on?: true | false } By its controller or the DM, outside a
  // fight (donning and doffing take longer than a turn here; drawing a weapon in a fight is not built).
  equip(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    e.sheet || fail(`${e.name} was typed in by hand. Build a sheet for them first.`);
    !inFight(s, e.id) || fail(`${e.name} can't change what they wear in the middle of a fight.`);
    const on = a.on ?? true;
    typeof on === 'boolean' || fail('On is true or false.');
    const sheet = structuredClone(e.sheet), x = (sheet.items ?? []).find((y) => y.id === a.item) || fail(`${e.name} has no such item.`);
    const def = CONTENT.items[x.item];
    def.wear !== 'carried' || fail(`${def.name} works from ${e.name}'s person; there is nothing to put on.`);
    (x.equipped === true) !== on || fail(`${itemName(def, x)} is already ${on ? 'worn' : 'off'}.`);
    if (on) x.equipped = true; else delete x.equipped;
    resheet(s, e, sheet, ev);
    ev.push({ type: 'equip', id: e.id, key: x.id, item: itemName(def, x), on });
  },
  // Attune to a magic item, or end an Attunement, during the next Short Rest (SRD "Attunement": a Short Rest
  // focused on only that item). { type: 'attune', actor, item: key | null, end?: true } By its controller or the DM,
  // outside a fight; `item: null` changes its mind. It happens at the end of the next shortRest it takes.
  attune(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    e.sheet || fail(`${e.name} was typed in by hand. Build a sheet for them first.`);
    !inFight(s, e.id) || fail(`${e.name} can't attune to an item in the middle of a fight.`);
    const sheet = structuredClone(e.sheet);
    if (a.item === null) {
      sheet.attuning || fail(`${e.name} is not attuning to anything.`);
      delete sheet.attuning;
    } else {
      const x = (sheet.items ?? []).find((y) => y.id === a.item) || fail(`${e.name} has no such item.`), def = CONTENT.items[x.item];
      (a.end === undefined || typeof a.end === 'boolean') || fail('End is true or false.');
      if (a.end) x.attuned === true || fail(`${e.name} is not attuned to ${itemName(def, x)}.`);
      else {
        x.attuned !== true || fail(`${e.name} is already attuned to ${itemName(def, x)}.`);
        const why = attuneProblem(sheet, def); !why || fail(why);
        heldItems(sheet).filter((y) => y.x.attuned === true).length < ATTUNE_MAX || fail(`${e.name} is attuned to ${ATTUNE_MAX} items already: end one first.`);
        !heldItems(sheet).some((y) => y.x.attuned === true && y.x.item === x.item) || fail(`${e.name} is attuned to another ${def.name} already.`);
      }
      sheet.attuning = { item: x.id, ...(a.end ? { end: true } : {}) };
    }
    const problems = validate(sheet);
    problems.length === 0 || fail(problems[0]);
    e.sheet = sheet;
    ev.push({ type: 'attuning', id: e.id, ...(sheet.attuning ? { key: sheet.attuning.item, item: itemName(CONTENT.items[sheet.items.find((y) => y.id === sheet.attuning.item).item], sheet.items.find((y) => y.id === sheet.attuning.item)), ...(sheet.attuning.end ? { end: true } : {}) } : { cleared: true }) });
  },
  // Hand a creature a light to carry, or take it away. { type: 'setLight', actor, item } with an item
  // from content/lights.js (a torch, a lamp), or { light: { bright, dim } } in feet; `item: null` puts it out.
  setLight(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can hand out light.');
    const e = ent(s, a.actor);
    if (a.item === null || a.light === null) {
      e.light || fail(`${e.name} carries no light.`);
      delete e.light;
      return ev.push({ type: 'light', id: e.id, bright: 0, dim: 0 });
    }
    const item = a.item === undefined ? null : (typeof a.item === 'string' && Object.hasOwn(LIGHTS, a.item) && a.item) || fail('Unknown light.');
    const l = item ? LIGHTS[item] : a.light ?? fail('Name a light or give its radii.');
    const feet = (n) => Number.isInteger(n) && n >= 0 && n <= 600 && n % FT === 0;
    (l && typeof l === 'object' && feet(l.bright) && feet(l.dim) && l.bright + l.dim > 0) || fail('A light is Bright and Dim radii in feet, multiples of 5.');
    e.light = { bright: l.bright, dim: l.dim, ...(item ? { item } : {}) };
    ev.push({ type: 'light', id: e.id, bright: l.bright, dim: l.dim, ...(item ? { item, name: LIGHTS[item].name } : {}) });
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
    const party = Object.values(s.entities).filter((e) => e.side === 'party'), spots = [], taken = new Set();
    const take = (p) => { spots.push(p); taken.add(H.key(p)); };
    // The map's starts in order, each where a creature can stand (walkable ground, nothing solid on
    // it, not taken); then, for anyone left, the spiral out from the first start, as before.
    const B = barriers(map);
    for (const st of map.starts) {
      if (spots.length >= party.length) break;
      const p = landing(map, st, st.z ?? 0), level = p && ground(map, p)?.level;
      if (walkable(p) && level && !B.solid(level.id, p) && !taken.has(H.key(p))) take(p);
    }
    for (let n = 0; n < 12 && spots.length < party.length; n++) {
      for (const h of H.range(start, n)) {
        const p = H.dist(h, start) === n ? landing(map, h, start.z) : null;
        if (walkable(p) && Math.abs(p.z - start.z) <= STEP_MAX && spots.length < party.length && !taken.has(H.key(p))) take(p);
      }
    }
    spots.length === party.length || fail("That map has no room for the party at its start.");
    const leaving = new Set(Object.values(s.entities).filter((e) => e.side !== 'party').map((e) => e.id));
    for (const fx of [...effectsOf(s)]) if (leaving.has(fx.source) || fx.parts.some((p) => leaving.has(p.target))) endEffect(s, ev, fx, 'the party moved on');
    for (const id of leaving) delete s.entities[id];
    s.map = map;
    party.forEach((e, i) => { e.pos = spots[i]; });
    ev.push({ type: 'map', map: map.id, name: map.name });
    lookAround(s, ev);
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
      (e.hidden || e.hiding) || fail(`${e.name} isn't hidden.`);
      unhide(s, e, ev, 'noise');                                         // one that took the Hide action made itself heard
      reveal(s, e, ev);
    }
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
    !immuneTo(s, e, a.condition) || fail(`${e.name} is immune to ${def.name}.`);
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
    if (hp > e.hp) { e.dead = false; delete e.remains; heal(s, e, hp - e.hp, ev); } else if (hp < e.hp) damage(s, e, e.hp - hp, 'untyped', ev, { raw: true });
    checkEnd(s, ev);
  },
  // The DM's damage and healing, by the rules: Resistance and the like, Temporary Hit Points first, Concentration, death saves.
  harm(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can do damage this way.');
    const e = ent(s, a.actor), n = a.amount;
    (Number.isInteger(n) && n > 0 && n <= 9999) || fail('Damage must be a whole number above 0.');
    e.dead && fail(`${e.name} is dead.`);
    damage(s, e, n, a.dtype ?? 'untyped', ev);
    checkEnd(s, ev);
  },
  mend(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can heal this way.');
    const e = ent(s, a.actor), n = a.amount;
    (Number.isInteger(n) && n > 0 && n <= 9999) || fail('Healing must be a whole number above 0.');
    e.dead && fail(`${e.name} is dead; healing does not bring back the dead.`);
    heal(s, e, n, ev);
  },
  rest(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can call a rest.');
    !s.encounter || fail("You can't rest in the middle of a fight.");
    // SRD Long Rest: all Hit Points back, Exhaustion down one level, features recharge. The dead stay
    // dead, other conditions stay, and a creature at 0 Hit Points can't start one. Temporary Hit
    // Points end. The party rests; `ids` names who rests instead (the DM resting monsters too),
    // and a monster's uses per day and spent recharges come back.
    let who = Object.values(s.entities).filter((x) => x.side === 'party' && !x.dead);
    if (a.ids !== undefined) {
      (Array.isArray(a.ids) && a.ids.length > 0 && a.ids.length <= 500) || fail('Name who rests.');
      who = [...new Set(a.ids)].map((id) => ent(s, id)).filter((x) => !x.dead);
    }
    for (const e of who) {
      if (e.hp <= 0) {
        if (e.cond.stable) heal(s, e, 1, ev);                               // a Stable creature regains 1 HP after 1d4 hours
        else ev.push({ type: 'manual', actor: e.id, name: 'Long Rest', text: `${e.name} is dying at 0 Hit Points and can't take a Long Rest. The DM settles its Death Saving Throws.` });
        continue;
      }
      Object.assign(e, { hp: e.maxHp, death: { s: 0, f: 0 }, slots: { ...e.slotsMax } });
      e.uses.secondWind = e.features.secondWind || 0;
      for (const f of e.feats ?? []) if (f.uses) e.uses[f.id] = f.uses.max;   // every feature with uses
      if (e.hitDie) e.hd = e.level;                                        // and all spent Hit Point Dice
      if (e.hitDice) e.hdBy = { ...e.hitDice };
      if (e.tempHp) { e.tempHp = 0; delete e.tempFx; }
      delete e.charges; delete e.spent;                                    // a monster's daily uses and spent recharges
      const ex = e.cond.exhaustion;
      if (ex && (ex.level ?? 1) > 1) { ex.level = (ex.level ?? 1) - 1; ev.push({ type: 'cond', id: e.id, cond: 'exhaustion', level: ex.level }); }
      else if (ex) { delete e.cond.exhaustion; ev.push({ type: 'condEnd', id: e.id, cond: 'exhaustion' }); }
    }
    s.clock += 480;
    ev.push({ type: 'rest' });
    tick(s, ev);
  },
  // SRD Short Rest: an hour. { type: 'shortRest', ids?, spend?: { id: n }, recover?: { id: [slot levels] } }
  // Each who rests (the party when `ids` is not given) can spend Hit Point Dice (`spend`): each rolls
  // the die + Constitution modifier, at least 1. Features that come back on a Short Rest do; those
  // that come back on a Long Rest with some back on a Short Rest regain those; Pact Magic slots come
  // back; and a feature that recovers spell slots on a Short Rest (Arcane Recovery) takes `recover`.
  shortRest(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can call a rest.');
    !s.encounter || fail("You can't rest in the middle of a fight.");
    let who = Object.values(s.entities).filter((x) => x.side === 'party' && !x.dead);
    if (a.ids !== undefined) {
      (Array.isArray(a.ids) && a.ids.length > 0 && a.ids.length <= 500) || fail('Name who rests.');
      who = [...new Set(a.ids)].map((id) => ent(s, id)).filter((x) => !x.dead);
    }
    const spend = a.spend ?? {}, recover = a.recover ?? {};
    (spend && typeof spend === 'object' && recover && typeof recover === 'object') || fail('Say how many Hit Point Dice each spends.');
    // Everything is checked before anything changes.
    for (const [id, n] of Object.entries(spend)) {
      const e = ent(s, id);
      who.includes(e) || fail(`${e.name} isn't resting.`);
      (Number.isInteger(n) && n >= 0) || fail('Spend a whole number of Hit Point Dice.');
      n <= (e.hd ?? 0) || fail(`${e.name} has ${e.hd ?? 0} Hit Point Dice left.`);
      e.hp > 0 || fail(`${e.name} is at 0 Hit Points and can't take a Short Rest.`);
    }
    // `restore`: those who use a feature that gives points back on a Short Rest (Sorcerous Restoration:
    // `restore: { of, max }`), regaining what was spent up to its most, for one of its uses.
    const restore = a.restore ?? [];
    Array.isArray(restore) || fail('Name who restores points.');
    new Set(restore).size === restore.length || fail('Name each creature that restores points once.');
    const refills = restore.map((id) => {
      const e = ent(s, id), f = (e.feats ?? []).find((x) => x.restore && (e.uses[x.id] ?? 0) > 0);
      who.includes(e) || fail(`${e.name} isn't resting.`);
      f || fail(`${e.name} has nothing that restores points now.`);
      return { e, f };
    });
    const plans = [];
    for (const [id, levels] of Object.entries(recover)) {
      const e = ent(s, id), f = (e.feats ?? []).find((x) => x.recover && (e.uses[x.id] ?? 0) > 0);
      who.includes(e) || fail(`${e.name} isn't resting.`);
      f || fail(`${e.name} has nothing that recovers spell slots now.`);
      (Array.isArray(levels) && levels.length > 0 && levels.every((l) => Number.isInteger(l) && l >= 1 && l <= f.recover.max)) || fail(`${f.name} recovers slots of level 1 to ${f.recover.max}.`);
      const most = Math.ceil(e.level / 2), total = levels.reduce((t, l) => t + l, 0);
      total <= most || fail(`${f.name} recovers ${most} levels of slots at most; that is ${total}.`);
      for (const l of new Set(levels)) levels.filter((x) => x === l).length <= (e.slotsMax?.[l] ?? 0) - (e.slots?.[l] ?? 0) || fail(`${e.name} hasn't spent that many level ${l} slots.`);
      plans.push({ e, f, levels });
    }
    for (const e of who) {
      if (e.hp <= 0) { ev.push({ type: 'manual', actor: e.id, name: 'Short Rest', text: `${e.name} is at 0 Hit Points and can't take a Short Rest.` }); continue; }
      for (let i = 0; i < (spend[e.id] ?? 0); i++) {
        e.hd--;
        // Of Hit Dice of several sizes, the largest left first: the one a player would spend.
        const size = e.hdBy ? Math.max(...Object.keys(e.hdBy).filter((d) => e.hdBy[d] > 0).map(Number)) : e.hitDie;
        if (e.hdBy) e.hdBy[size]--;
        const r = roll(s, `1d${size}`);
        heal(s, e, Math.max(1, r.total + mod(e.abil.con)), ev, { dice: r.dice, bonus: mod(e.abil.con), by: e.id });
      }
      for (const f of e.feats ?? []) {
        if (!f.uses) continue;
        if (f.uses.recharge === 'short') e.uses[f.id] = f.uses.max;
        else if (f.uses.short) e.uses[f.id] = Math.min(f.uses.max, (e.uses[f.id] ?? 0) + f.uses.short);
      }
      if (e.features?.secondWind && !e.feats) e.uses.secondWind = Math.min(e.features.secondWind, (e.uses.secondWind ?? 0) + 1);   // SRD: one use back
      if (e.pact) e.slots = { ...e.slotsMax };
    }
    for (const { e, f, levels } of plans) {
      e.uses[f.id]--;
      for (const l of levels) e.slots[l]++;
      ev.push({ type: 'std', id: e.id, action: `${f.name} (${levels.map((l) => `level ${l}`).join(', ')})` });
    }
    for (const { e, f } of refills) {
      const pool = featOf(e, f.restore.of), gain = pool ? Math.min(f.restore.max, pool.uses.max - (e.uses[pool.id] ?? 0)) : 0;
      e.uses[f.id]--;
      if (pool) e.uses[pool.id] = (e.uses[pool.id] ?? 0) + gain;
      ev.push({ type: 'std', id: e.id, action: `${f.name} (${gain} point${gain === 1 ? '' : 's'})` });
    }
    // Attunement (SRD): each resting character with an item it chose to attune to (or end its Attunement to) at
    // this rest. Worked out on a copy first; one that cannot be made (a fourth item, a second copy, a prerequisite
    // not met, at 0 Hit Points, in a form) fails with the reason and changes nothing.
    for (const e of who) {
      const at = e.sheet?.attuning;
      if (!at) continue;
      const sheet = structuredClone(e.sheet), x = (sheet.items ?? []).find((y) => y.id === at.item);
      delete sheet.attuning;
      if (!x) { e.sheet = sheet; continue; }
      const def = CONTENT.items[x.item], name = itemName(def, x);
      if (at.end) delete x.attuned; else x.attuned = true;
      const why = e.hp <= 0 ? `${e.name} is at 0 Hit Points.` : e.form ? `${e.name} is in a form.` : (at.end ? null : attuneProblem(sheet, def))
        ?? validate(sheet)[0] ?? lintRecord(derive(sheet).record, { spells: SPELLS })[0] ?? null;
      if (why) { delete e.sheet.attuning; ev.push({ type: 'attuned', id: e.id, key: x.id, item: name, ...(at.end ? { end: true } : {}), failed: why }); continue; }
      remake(s, e, derive(sheet).record, sheet, ev);
      ev.push({ type: 'attuned', id: e.id, key: x.id, item: name, ...(at.end ? { end: true } : {}) });
    }
    s.clock += 60;
    ev.push({ type: 'rest', short: true });
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
  // Handouts and notes to one player: handout, showHandout, hideHandout, removeHandout, note (handouts.js).
  ...handoutActions(fail),
  // Scenes: scene, endScene, sceneNpc, say, askCheck, sceneChronicle (scenes.js).
  ...sceneActions(fail),
  // Rewards at the end of a fight: conclusion { edit | publish | skip } (rewards.js).
  ...rewardActions(fail, tryLand),
  setting(s, a, ctx) {
    ctx.role === 'dm' || fail('Only the DM can change table settings.');
    Object.hasOwn(SETTINGS, a.key) || fail('Unknown setting.');
    SETTINGS[a.key].includes(a.value) || fail(`That setting can be: ${SETTINGS[a.key].join(', ')}.`);
    s.settings[a.key] = a.value;
  },
};

// A pool of points traded with spell slots (Font of Magic: `exchange: { costs, minLevel }`, by slot
// level). { type: 'feature', actor, feature, make: level } makes a slot of that level as a Bonus
// Action for its cost in points, if the creature's level reaches the table's; a made slot is gone
// at the next Long Rest (slots come back to their maximum). { ..., spend: level } spends a slot of
// that level for as many points, with no action, never above the pool's maximum.
function exchange(s, e, f, a, ev) {
  up(e) || fail(`${e.name} is down.`);
  able(e);
  const x = f.exchange, have = e.uses[f.id] ?? 0, fighting = !!s.encounter && inFight(s, e.id);
  if (a.make !== undefined) {
    const cost = x.costs[a.make] ?? fail(`${f.name} makes spell slots of level 1 to ${Object.keys(x.costs).length}.`);
    e.level >= x.minLevel[a.make] || fail(`${f.name} makes a level ${a.make} slot from level ${x.minLevel[a.make]}.`);
    have >= cost || fail(`A level ${a.make} slot costs ${cost} points; ${e.name} has ${have}.`);
    if (fighting) need(s, e, 'bonus');
    if (fighting) s.encounter.budget.bonus--;
    e.uses[f.id] -= cost;
    e.slots[a.make] = (e.slots[a.make] ?? 0) + 1;
    return ev.push({ type: 'std', id: e.id, action: `${f.name}: a level ${a.make} spell slot` });
  }
  if (a.spend !== undefined) {
    (Number.isInteger(a.spend) && (e.slots?.[a.spend] ?? 0) > 0) || fail(`${e.name} has no level ${a.spend} spell slot to spend.`);
    have + a.spend <= f.uses.max || fail(`${e.name} can't have more than ${f.uses.max} points.`);
    e.slots[a.spend]--;
    e.uses[f.id] += a.spend;
    return ev.push({ type: 'std', id: e.id, action: `${f.name}: ${a.spend} point${a.spend === 1 ? '' : 's'} from a spell slot` });
  }
  fail(`Say whether ${f.name} makes a spell slot (make) or spends one (spend).`);
}

// A feature that lays a form over its creature (Wild Shape; forms.js): { type: 'feature', actor,
// feature, form: monster id } takes that form for one use, ending any form it is in; with no `form`,
// it leaves the one it is in, for its time and no use. The form lasts `hours` hours and ends early
// if the creature is Incapacitated or drops to 0 Hit Points (a fragile effect), or if the effect is ended.
const crText = (cr) => ({ 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' })[cr] ?? String(cr);
function shapeShift(s, e, f, act, a, ev) {
  const enc = s.encounter, fighting = !!enc && inFight(s, e.id), time = act.time === 'free' ? null : act.time;
  const holding = e.form ? effectsOf(s).find((x) => x.id === e.form.fx) : null;
  if (a.form === undefined || a.form === null) {
    e.form || fail(`Choose a form for ${f.name}.`);
    if (time && fighting) { need(s, e, time); enc.budget[time]--; }
    if (holding) return endEffect(s, ev, holding, `${e.name} left the form`);
    leaveForm(e);
    return ev.push({ type: 'form', id: e.id, form: null });
  }
  const F = act.form, m = typeof a.form === 'string' ? CONTENT.monsters[a.form] : null, tpl = m && MONSTERS[a.form];
  tpl || fail('No such creature.');
  F.types.includes(m.type) || fail(`${f.name} takes the form of a ${F.types.join(' or ')}; the ${m.name} is not one.`);
  m.cr <= F.maxCr || fail(`At ${e.name}'s level ${f.name} takes forms of Challenge Rating ${crText(F.maxCr)} or lower; the ${m.name} is ${crText(m.cr)}.`);
  (!m.speed.fly || F.fly) || fail(`At ${e.name}'s level ${f.name} can't take a form with a Fly Speed.`);
  (e.uses[f.id] ?? 0) >= 1 || fail(`${e.name} has no uses of ${f.name} left.`);
  if (time && fighting) need(s, e, time);
  const body = { size: tpl.size };
  (!ground(s.map, e.pos) || fitsOn(s.map, body, e.pos, barriers(s.map))) || fail(`There isn't room for a ${m.name} there.`);
  !living(s).some((o) => o.id !== e.id && overlapAt(o, o.pos, body, e.pos)) || fail(`Someone is in the way of ${e.name} becoming a ${m.name}.`);

  // Paid for: from here it happens.
  if (time && fighting) enc.budget[time]--;
  e.uses[f.id]--;
  if (holding) endEffect(s, ev, holding, `${e.name} took another form`);
  else if (e.form) leaveForm(e);
  const fx = startEffect(s, { name: `${f.name} (${m.name})`, spell: null, source: e.id, conc: false, duration: `${F.hours} hour${F.hours === 1 ? '' : 's'}` });
  Object.assign(fx, { feature: f.id, fragile: true });
  fx.parts.push({ target: e.id, form: true });
  const was = e.size;
  takeForm(e, a.form, m.name, tpl, MONSTER_ACTIONS[a.form] ?? [], fx.id);
  ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: e.id, conc: false, lasts: fx.lasts, targets: [e.id] });
  ev.push({ type: 'form', id: e.id, form: a.form, name: m.name });
  if (e.size !== was) ev.push({ type: 'size', id: e.id, size: e.size });
  if (F.tempHp) tempHp(s, e, F.tempHp, ev);
}

// Every action type the engine handles (history.js is tested to have a label for each).
export const ACTION_TYPES = Object.keys(handlers);

// Whatever has nothing under it and no way to stay up, falls. Run after every action, so that a
// flyer knocked Prone, a floor that gives way and a creature set down in mid-air all come out the same.
function gravity(s, ev) {
  let any = false;
  for (const e of Object.values(s.entities)) {
    if (ground(s.map, e.pos) || aloft(s, e)) continue;
    const sf = under(s.map, e.pos);
    if (!sf) continue;                                   // nothing below at all: the DM's to sort out
    const feet = e.pos.z - sf.z;
    e.pos = { q: e.pos.q, r: e.pos.r, z: sf.z };
    if (e.dead) continue;
    any = true;
    fall(s, e, feet, ev);
    lookAround(s, ev, [e]);
  }
  if (any) checkEnd(s, ev);
}

// After every action under the los and light rules: whatever region the party now has in sight is
// revealed, and what it makes out is remembered (vision.js).
function look(s, ev) {
  if (sightRule(s) === 'rooms') return;
  lookAround(s, ev);
  remember(s);
}

// Table rules the DM can switch, and what each may be set to.
export const SETTINGS = { sight: SIGHT_RULES, autoEngage: [true, false], passiveFind: ['off', 'traps', 'all'], vertical: ['max', 'sum', 'true'], climbing: ['on', 'off'], cover: ['on', 'off'], creatureCover: ['on', 'off'], engageRange: [10, 30, 60], unseenTurns: ['say', 'quiet'], diceThrow: ['auto', 'throw'], pace: ['wait', 'flow', 'instant'],
  // Who reviews the rewards of a fight (rewards.js): the DM first, nobody (published at once), or none are made.
  conclusion: ['dm', 'auto', 'off'], xpShare: ['split', 'full'] };

// The fields of an action that name creatures, one id or a list of them. (`follow`'s `leader` is
// not one: its handler gives one answer for a creature that is not there and one not in the party.)
const CREATURE_FIELDS = ['actor', 'target', 'entity', 'targets', 'spare', 'ids', 'order'];

// Run one action's handler. Also how a waiting action is run again when its reaction is answered.
function dispatch(s, action, ctx, ev) {
  // To anyone but the DM a hidden creature does not exist. Answering "it's 40 ft away" or
  // "it isn't yours" to a guessed id would confirm that it does.
  // So every creature id a player sends, in any field that names creatures, must be one the party
  // knows of, and one that is not gets the very answer an id that is nothing gets, before anything
  // else is looked at (issue #136). tests/hidden-ids.test.js walks every field every handler reads.
  if (ctx.role !== 'dm') {
    for (const k of CREATURE_FIELDS) {
      const v = action?.[k];
      for (const id of Array.isArray(v) ? v : [v]) {
        if (typeof id !== 'string') continue;
        const e = Object.hasOwn(s.entities, id) ? s.entities[id] : null;
        if (!e || unknown(s, e)) fail('No such creature.');
      }
    }
  }
  const h = handlers[action.type] || fail(`Unknown action: ${action.type}`);
  // While an action waits for a reaction, nothing that could change how it comes out may happen.
  if (s.pending && !WHILE_WAITING.has(action.type)) fail('The table is waiting for a reaction to be answered.');
  h(s, action, ctx, ev);
}

// A copy of the game to put back if the action stops to ask (or a resumed one is refused). The
// timeline is left out: nothing is added to it until the action is done.
const freeze = (s) => structuredClone({ ...s, timeline: null });
function thaw(s, snap) {
  const tl = s.timeline;
  for (const k of Object.keys(s)) delete s[k];
  for (const k of Object.keys(snap)) s[k] = k === 'timeline' ? tl : snap[k];
}

export function apply(s, action, ctx = { role: 'dm' }) {
  let ev = [];
  // A copy is taken only when the action could stop to ask a player (reactions.js, mayAsk), or
  // when it answers one: the rest of the time nothing can pause and this costs nothing.
  const snap = s.pending || action?.type === 'react' || mayAsk(s) ? freeze(s) : null;
  setRun({ action, ctx: { role: ctx.role, ...(typeof ctx.userId === 'string' ? { userId: ctx.userId } : {}) }, answers: [], i: 0, canPause: !!snap });
  try {
    dispatch(s, action, ctx, ev);
  } catch (err) {
    delete s.stack;                                  // never leave half an effect behind
    if (err instanceof Pause) {
      // Stop and ask: the game goes back to how it was before the action (the dice seed too), and
      // keeps the action, the answers given so far and the question. Only the player asked and
      // the DM are told (view.js).
      thaw(s, snap);
      const t = s.entities[err.ask.reactor];
      s.asked = (s.asked ?? 0) + 1;
      s.pending = { n: s.asked, action: structuredClone(RUN.action), ctx: { ...RUN.ctx }, answers: structuredClone(RUN.answers), ask: structuredClone(err.ask) };
      ev = [{ type: 'reactionAsked', id: t.id, n: s.asked, to: t.owner, ask: structuredClone(err.ask) }];
      setRun(null);
      return record(s, ev);
    }
    if (snap) thaw(s, snap);                         // a refused answer leaves the question waiting, as it was
    setRun(null);
    if (err instanceof RuleError) return { ok: false, error: err.message, events: [] };
    throw err;
  }
  setRun(null);
  try { gravity(s, ev); watch(s, ev); look(s, ev); } catch (err) { if (!(err instanceof RuleError)) throw err; }
  fightEndsScene(s, ev);                           // a fight, however it began, ends a scene
  return record(s, ev);
}

// The record keeps, with each entry, the creatures the party did not know of when it happened,
// so that reading the record later never tells players about what they could not see then.
function record(s, ev) {
  const unseen = (x) => typeof x === 'string' && unknown(s, s.entities[x]);
  for (const e of ev) {
    if (e.type === 'moved') continue;
    const ids = [e.id, e.actor, e.target, e.by, e.against, ...(Array.isArray(e.targets) ? e.targets : []), ...(Array.isArray(e.order) ? e.order.map((o) => o.id) : [])].filter(unseen);
    s.timeline.push({ t: s.clock, ...e, ...(ids.length ? { unseen: [...new Set(ids)] } : {}) });
  }
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

