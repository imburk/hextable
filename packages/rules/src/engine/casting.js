// Casting (engine.js): the cast action, Metamagic, Counterspell and other spells that answer a
// spell, teleport destinations, and ending a lasting effect.
import { gridOf, col, key } from '../grid.js';
import { CONTENT, SPELLS } from '../content/index.js';
import { BRANCHES, CHOICES } from '../content/schema.js';
import { begin, scaleSteps, sharedRolls, targetCount, walk as walkSteps } from '../effects.js';
import { breakConcentration, durationMinutes, effectsOf, endEffect, startEffect, turnKey } from '../durations.js';
import { apart, footprint, FT, gap, landing, overlapAt, unseenAt } from '../space.js';
import { canSee, hiddenFrom, lightAt } from '../sight.js';
import { seenName, unknown } from '../vision.js';
import { canReact, instruction, reactionsOf } from '../reactions.js';
import { able, ask, BOND_MAX, castAbilOf, control, ent, ownerOf, fail, featOf, ft, hostile, inFight, living, mod, need, roomForCompanions, RuleError, spellStats, tellDM, unblocked, up } from './shared.js';
import { aimArea, creatureType, creatures, fitsOn, placeCreature, reveal, roomAt, showPlace, summonCaster, unhide } from './world.js';
import { barriers } from '../walls.js';
import { boundEffect, settle, slotsFor, spellOffer } from './rolls.js';
import { castReaction, CORPSE, checkEnd, damage, engage, oneOf, reactAgainst, resolve, startEncounter, summonCount, summonMade } from './resolve.js';
import { roll } from '../rng.js';
import { incapacitatedBy } from '../modifiers.js';

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
export function teleportSpot(s, e0, step, hex, name, player = false) {
  // A rider teleports by its own size: it leaves its mount, which stays (stage C6b; SRD 5.2.1 34458-34461).
  const e = e0.riding ? { ...e0, riding: undefined } : e0;
  (hex && Number.isInteger(hex.q) && Number.isInteger(hex.r)) || fail(`Pick where ${name} takes ${e.name}.`);
  const to = (Number.isFinite(hex.z) ? { q: hex.q, r: hex.r, z: hex.z } : landing(s.map, hex, e.pos.z)) || fail("There's nothing there to stand on.");
  if (player && unseenAt(s.map, to)) fail(`Pick a place the party has seen for ${name}.`);
  key(to) !== key(e.pos) || fail(`${e.name} is already there.`);
  const d = gap(s, e.pos, to);
  d * FT <= step.teleport || fail(`That is ${ft(d)} away. ${name} reaches ${step.teleport} ft.`);
  const why = roomAt(s, e, to);
  if (why) fail(why);
  if (step.see && canSee(s, e, spotOf(e, to)) === 'no') fail(`${e.name} can't see that space.`);
  !living(s).some((o) => o.id !== e.id && overlapAt(o, o.pos, e, to, gridOf(s.map)) && knownTo(s, e, o)) || fail('That space is occupied.');
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
// `comps` is the components this casting has: a spell's own, or fewer from an item (castSpell, below).
function counterWindow(s, e, sp, ev, comps = sp.def.components ?? []) {
  if (!comps.some((c) => ['v', 's', 'm'].includes(c))) return null;
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

// Repelling Blast (`repel: { spell, feet }`): `a.repel` is how far (5 or 10 feet, up to `feet`) each
// Large or smaller creature the spell hits with an attack roll is pushed straight away; left out, none.
function repelFor(e, sp, a) {
  if (a.repel === undefined) return 0;
  const f = (e.feats ?? []).find((x) => x.repel?.spell === sp.id) || fail(`${e.name} can't push anything with ${sp.name}.`);
  (Number.isInteger(a.repel) && a.repel > 0 && a.repel % 5 === 0 && a.repel <= f.repel.feet) || fail(`${f.name} pushes up to ${f.repel.feet} ft, in steps of 5.`);
  return a.repel;
}

// ---------- the Evoker (#232) ----------
// Empowered Evocation (`empowered: { school, list, ability }`): a spell of that school on that class's
// list adds the ability's modifier to one of its damage rolls. `a.empower` is false to go without, or
// which roll: for a spell with several damage steps the step (0 for the first), for rays or darts
// aimed at several targets the ray (0 for the first, in the order of `targets`). Left out, it is added
// where the spell makes one damage roll; where it makes several, the DM is told, as the player picks.
// Overchannel (`overchannel: { list, maxSlot, die }`): `a.overchannel: true` on a damaging spell of
// that list cast with a slot of level 1 to `maxSlot` deals its dice at their highest; uses since the
// last Long Rest are counted in `uses[feature id]`, and from the second the caster takes so many of
// `die` per slot level in Necrotic damage, one more each time, ignoring Resistance and Immunity.
// Returns { empower?, told?, overchannel? }, checked before anything is spent.
// A spell whose text gives dice of damage the engine does not roll (Wall of Fire, Delayed Blast Fireball).
const damageText = (def) => { const t = JSON.stringify(def); return /\b\d+d\d+\b/.test(t) && /\bdamage\b/i.test(t); };
function evokerFor(e, sp, a, slot, via, targets) {
  const out = {};
  (a.empower === undefined || a.empower === false || (Number.isInteger(a.empower) && a.empower >= 0 && a.empower < 20)) || fail('empower is false, or which damage roll it adds to (0 for the first).');
  (a.overchannel === undefined || a.overchannel === true) || fail('overchannel is true or left out.');
  const paths = [];
  walkSteps(sp.def.effects ?? [], (st, at) => { if ('damage' in st) paths.push(at); });
  const onList = (list) => (sp.def.classes ?? []).includes(list);
  const ef = (e.feats ?? []).find((f) => f.empowered);
  if (a.empower !== undefined && a.empower !== false) {
    ef || fail(`${e.name} has no feature that adds to a spell's damage roll.`);
    (sp.def.school === ef.empowered.school && onList(ef.empowered.list)) || fail(`${ef.name} is for ${nice(ef.empowered.list)} spells of the ${nice(ef.empowered.school)} school.`);
    paths.length || fail(`${sp.name} deals no damage for ${ef.name} to add to.`);
  }
  // A spell of the school whose damage the engine does not roll (Wall of Fire): the DM is told, as the player may add it.
  if (ef && a.empower !== false && sp.def.school === ef.empowered.school && onList(ef.empowered.list) && (paths.length ? sp.def.zone && !sp.def.zone.atCast : damageText(sp.def)) && mod(e.abil[ef.empowered.ability] ?? 10) > 0)
    out.told = `${ef.name}: ${e.name} may add ${mod(e.abil[ef.empowered.ability] ?? 10)} to one damage roll of ${sp.name}. The engine does not roll that damage as the spell is cast, so the DM adds it if the player wants.`;
  if (ef && a.empower !== false && sp.def.school === ef.empowered.school && onList(ef.empowered.list) && paths.length && !out.told) {
    const add = mod(e.abil[ef.empowered.ability] ?? 10), rays = !!sp.repeat && targets.length > 1;
    // A creature it catches that is not hostile to the caster (an ally in the Fireball): the player decides, not the engine.
    const friend = targets.some((t) => !hostile(e, t));      // the caster in its own area too
    if (add > 0) {
      if (a.empower === undefined && (paths.length > 1 || rays)) out.told = `${ef.name}: ${e.name} may add ${add} to one damage roll of ${sp.name}. It makes several, so the player picks one and the DM adds it (or send empower with the roll).`;
      else if (a.empower === undefined && friend) out.told = `${ef.name}: ${e.name} may add ${add} to the damage roll of ${sp.name}, which also catches a creature not hostile to ${e.name}. The engine adds nothing unasked: the player decides (send empower 0), or the DM adds it.`;
      else if (rays) {
        paths.length === 1 || fail(`${ef.name}: the DM adds it to ${sp.name}; the engine picks no roll of a spell with several rays and several damage steps.`);
        (a.empower ?? 0) < targets.length || fail(`${sp.name} has ${targets.length} rays or darts here; empower names one, from 0.`);
        out.empower = { add, path: paths[0], n: a.empower ?? 0, name: ef.name };
      } else {
        (a.empower ?? 0) < paths.length || fail(`${sp.name} makes ${paths.length} damage roll${paths.length === 1 ? '' : 's'}; empower names one, from 0.`);
        out.empower = { add, path: paths[a.empower ?? 0], name: ef.name };
      }
    }
  }
  if (a.overchannel) {
    const of = (e.feats ?? []).find((f) => f.overchannel) || fail(`${e.name} can't Overchannel.`);
    const x = of.overchannel;
    onList(x.list) || fail(`${of.name} is for ${nice(x.list)} spells.`);
    (sp.level >= 1 && !via && slot >= 1 && slot <= x.maxSlot) || fail(`${of.name} is for a spell cast with a spell slot of level 1 to ${x.maxSlot}.`);
    paths.length || fail(`${sp.name} deals no damage for ${of.name} to make the most of.`);
    out.overchannel = of;
  }
  return out;
}

// ---------- summoning (docs/specs/companions.md, Decision 2; stage C3) ----------
// `a.summon` = { variant?, type?, form?, at: [{ q, r, z? }, ...] }: what the caster picks, and one space for each
// creature, each within the spell's range of the caster, one it can see (a player names a place the party has
// seen), where the creature fits on the floor (or, for a flyer given a height, in the air) and nothing the caster
// knows of stands; inside the arena if the caster is in a fight. A creature the caster does not know of does not
// stop it (refusing would tell the player it is there): the creature appears beside it instead (resolve.js).
// A master has at most BOND_MAX companions (shared.js; owner's question 7), and a companion has none of its own.
// Returns { variant?, type?, form?, at: [positions] }, or null for a spell that summons nothing.
// With no `summon` field at all (`a.summon === undefined`: a cast from a client that has no chooser for it yet, C8,
// or a DM casting for a foe from the same panel), the cast is not refused: it takes the manual path a summon spell
// had before C3 (#332). The slot is spent and Concentration starts as for any spell; the step makes nothing and
// tells the DM what to add, with the numbers the block would be baked with (resolve.js, `summon`). Returns
// { count } then. A companion still can't cast one and the cap still holds: neither depends on the picks.
// Any other value (null, a string, an array, an object with a key it does not take or no spaces) is refused.
function summonFor(s, e, sp, a, slot, range, ctx) {
  const step = sp.def.effects.find((x) => 'summon' in x);
  if (!step) { a.summon === undefined || fail(`${sp.name} summons nothing.`); return null; }
  const p = a.summon;
  const count = summonCount(step.count, slot);
  if (step.on === 'corpse') return corpsesFor(s, e, sp, step, p, slot, range, ctx);
  // One per master (`one`; stage C5c): the master's creature of this spell that a new casting reforms (Find Familiar: it
  // takes the new form where it is, so no space is named) or replaces (Find Steed: it goes, and its space is free for the
  // new one). Neither adds a companion to the master's count beyond the one it had.
  const old = oneOf(s, e, step, sp.id), reforming = step.one === 'reform' && old.length > 0;
  const adds = reforming ? 0 : Math.max(count - (step.one === 'replace' ? old.length : 0), 0);
  if (p === undefined) {
    !e.bond || fail(`${e.name} is a companion itself and can't have companions.`);
    roomForCompanions(s, e, adds);
    return { count, ...(old.length ? { had: old.map((x) => x.id) } : {}) };
  }
  (p && typeof p === 'object' && !Array.isArray(p)) || fail(`Pick where ${sp.name} summons: { at: [a space] }.`);
  for (const k of Object.keys(p)) ['variant', 'type', 'form', 'at'].includes(k) || fail(`A summon names variant, type, form and at, not "${k}".`);
  const out = {};
  if (step.variants) { step.variants.includes(p.variant) || fail(`Choose what ${sp.name} summons: ${step.variants.join(', ')}.`); out.variant = p.variant; }
  else p.variant === undefined || fail(`${sp.name} has no choice of that kind.`);
  if (step.types) { step.types.includes(p.type) || fail(`Choose its creature type: ${step.types.join(', ')}.`); out.type = p.type; }
  else p.type === undefined || fail(`${sp.name} has no choice of creature type.`);
  if (step.forms !== undefined) {
    const m = typeof p.form === 'string' && Object.hasOwn(CONTENT.monsters, p.form) ? CONTENT.monsters[p.form] : null;
    const fits = m && (Array.isArray(step.forms) ? step.forms.includes(p.form) : m.type === step.forms.type && m.cr === step.forms.cr);
    fits || fail(`Choose a form ${sp.name} can take.`);
    out.form = p.form;
  } else p.form === undefined || fail(`${sp.name} has no choice of form.`);
  if (reforming) {
    const f = old[0];
    p.at === undefined || fail(`${e.name} already has ${f.name}: ${sp.name} gives it the new form where it is, so name no space.`);
    !e.bond || fail(`${e.name} is a companion itself and can't have companions.`);
    // On the map, the new form must fit where it stands (in the pocket dimension there is nothing to fit).
    if (Object.hasOwn(s.entities, f.id)) {
      const made = summonMade(step, out, slot, summonCaster(s, e, sp.id)), body = { size: made.record.size, side: f.side }, G = gridOf(s.map);
      fitsOn(s.map, body, f.pos, barriers(s.map)) || fail(`There isn't room for ${f.name} to take a ${made.record.size} form where it stands.`);
      !living(s).some((o) => o.id !== f.id && knownTo(s, e, o) && overlapAt(o, o.pos, body, f.pos, G)) || fail(`There isn't room for ${f.name} to take that form where it stands.`);
    }
    out.reform = f.id;
    return out;
  }
  (Array.isArray(p.at) && p.at.length === count) || fail(count === 1 ? `Pick one space for ${sp.name}.` : `Pick ${count} spaces for ${sp.name}, one for each creature.`);
  !e.bond || fail(`${e.name} is a companion itself and can't have companions.`);
  roomForCompanions(s, e, adds);
  // The creature's body: its size and whether it can fly, from what this casting makes.
  const made = summonMade(step, out, slot, summonCaster(s, e, sp.id));
  const body = { size: made.record.size }, flies = (step.over?.speed?.fly ?? made.record.speeds?.fly ?? 0) > 0;
  const G = gridOf(s.map), player = ctx.role !== 'dm', at = [];
  for (const want of p.at) {
    (want && typeof want === 'object' && Number.isInteger(want.q) && Number.isInteger(want.r) && (want.z === undefined || Number.isFinite(want.z))) || fail(`Pick a space for ${sp.name}.`);
    // A player is told nothing about a place the party has not seen, not even whether something could stand there.
    if (player && unseenAt(s.map, landing(s.map, want) ?? { q: want.q, r: want.r, z: want.z ?? e.pos.z })) fail(`Pick a place the party has seen for ${sp.name}.`);
    // The creature a new casting replaces (`one: 'replace'`) leaves first, so its space may be named.
    const to = placeCreature(s, body, want, { air: flies, ignore: (o) => !knownTo(s, e, o) || old.includes(o) && step.one === 'replace' });
    if (player && unseenAt(s.map, to)) fail(`Pick a place the party has seen for ${sp.name}.`);
    const d = gap(s, e.pos, to);
    d * FT <= range || fail(`That is ${ft(d)} away. ${sp.name} reaches ${range} ft.`);
    canSee(s, e, spotOf({ size: body.size, side: e.side }, to)) !== 'no' || fail(`${e.name} can't see that space.`);
    if (inFight(s, e.id)) footprint(body, to, G).every((f) => s.encounter.arena[col(f)]) || fail('The arena is locked until the fight ends.');
    !at.some((x) => overlapAt({ size: body.size }, x, body, to, G)) || fail('Pick a different space for each creature.');
    at.push(to);
  }
  out.at = at;
  if (step.one === 'replace' && old.length) out.replace = old.map((x) => x.id);
  return out;
}

// Touch delivery (Find Familiar; stage C5c): "when you cast a spell with a range of touch, your familiar can deliver the
// touch. Your familiar must be within 100 feet of you, and it must take a Reaction to deliver the touch when you cast the
// spell." `a.deliver` names the familiar: a companion of the caster's of kind `familiar` that a spell made (as the pocket
// dimension takes, companions.js), up, within 100 ft of the caster (by the nearest parts of the two), able to take a
// Reaction (not Incapacitated) and, in a fight, with its Reaction left. The spell must have a range of Touch and be aimed
// at a creature. Its targets are then reached from the familiar (range, walls; resolve.js makes the attack roll from its
// space), and the Reaction is spent with the spell. Outside a fight no Reaction is kept count of (there are no turns to
// give it back), so it is only checked that it could take one. Returns the familiar, or null.
export const DELIVER_FEET = 100;
function deliverFor(s, e, sp, a) {
  if (a.deliver === undefined) return null;
  typeof a.deliver === 'string' || fail('Name the familiar that delivers the touch ({ deliver: id }).');
  const f = ent(s, a.deliver);
  (f.bond?.to === e.id && f.bond.kind === 'familiar' && typeof f.bond.source === 'string') || fail(`${f.name} is not ${e.name}'s familiar.`);
  (sp.def.range === 'touch' && sp.aim === 'creature') || fail(`A familiar delivers only a spell with a range of Touch aimed at a creature, and ${sp.name} is not one.`);
  up(f) || fail(`${f.name} is down.`);
  const d = apart(s, e, f);
  d * FT <= DELIVER_FEET || fail(`${f.name} is ${ft(d)} from ${e.name}. A familiar delivers a touch within ${DELIVER_FEET} ft.`);
  const by = incapacitatedBy(f);
  !by || fail(`${f.name} is ${by} and can't take a Reaction to deliver the touch.`);
  !(s.encounter && f.reactionUsed) || fail(`${f.name} has already used its Reaction.`);
  return f;
}

// On corpses (Decision 7; stage C5b, #340): `a.summon` = { ids: [...] }, naming either dead Medium or Small Humanoids
// within the spell's range, each to rise as the step's creature (`count` of them at most), or living creatures the
// caster made with this same spell and still controls, to take back under control for another 24 hours (`reassert` of
// them at most, `count` if the step gives none), never both in one casting. Each within range by the nearest parts
// (as a spell aimed at a creature) and with no wall in the way. A player names only creatures the party knows of: any
// other id, or one that is no creature's own record, is "No such creature.", so nothing is said of an unseen corpse
// or of a foe's bond. A corpse already used is gone (its record went), and the husk an unseen vanish leaves
// (`vanished`) is no corpse: the creature did not die, it went. A player's character is not a corpse to raise: its
// record is the player's (the DM may remove it and spawn the creature). No `summon` field at all is the manual path
// (#332) as for any summon spell, with no cap check: the caster may have meant to reassert. Returns { ids, raise } or
// { count, reassert } for the manual path.
function corpsesFor(s, e, sp, step, p, slot, range, ctx) {
  const count = summonCount(step.count, slot), again = summonCount(step.reassert ?? step.count, slot);
  !e.bond || fail(`${e.name} is a companion itself and can't have companions.`);
  if (p === undefined) return { count, reassert: again };
  (p && typeof p === 'object' && !Array.isArray(p)) || fail(`Name the corpses for ${sp.name}: { ids: [...] }.`);
  for (const k of Object.keys(p)) k === 'ids' || fail(`${sp.name} names corpses or its own creatures (ids), not "${k}".`);
  // Array.from, so a sparse list's holes are refused as non-ids rather than skipped (review of #341, L1).
  (Array.isArray(p.ids) && p.ids.length > 0 && p.ids.length <= BOND_MAX && Array.from(p.ids).every((x) => typeof x === 'string') && new Set(p.ids).size === p.ids.length)
    || fail(`Name the corpses for ${sp.name}, each once: up to ${count} at this level, or up to ${again} of ${e.name}'s own creatures of it to keep under control.`);
  const player = ctx.role !== 'dm';
  // A player is told of a creature by the name the party sees (a foe in Wild Shape is the Beast; review of #341, M2).
  const nm = (t) => (player ? seenName(t) : t.name);
  const list = Array.from(p.ids, (id) => {
    const t = Object.hasOwn(s.entities, id) ? s.entities[id] : fail('No such creature.');
    !player || !unknown(s, t) || fail('No such creature.');
    return t;
  });
  const isCorpse = (t) => t.dead && !t.vanished, own = (t) => !t.dead && t.bond?.to === e.id && t.bond.source === sp.id;
  for (const t of list) {
    if (t.vanished) fail(`${nm(t)} is gone: there is no corpse.`);
    (isCorpse(t) || own(t)) || fail(`${nm(t)} is neither a corpse nor a creature ${e.name} made with ${sp.name}.`);
    if (isCorpse(t)) {
      !t.remains || fail(`Nothing is left of ${nm(t)} but ${t.remains === 'dust' ? 'dust' : 'a frozen statue'}: there is no corpse.`);
      (t.kind !== 'pc' && (!!t.bond || !ownerOf(s, t))) || fail(`${nm(t)} is a player's character: whether it rises is the DM's.`);
      // A dead Undead (a raised creature at 0 keeps its bond, `at0: 'dies'`): no Humanoid's corpse, and nothing to keep under
      // control while it is dead. The DM may bring it back (Undead Fortitude is the DM's) with `setHp`.
      creatureType(t) !== 'undead' || fail(`${nm(t)} is dead, so there is nothing to keep under control, and it is no Humanoid's corpse to raise. If it still stands (the DM's call), the DM brings it back with setHp.`);
      (CORPSE.sizes.includes(t.size) && creatureType(t) === CORPSE.type) || fail(`${nm(t)} is not the corpse of a Medium or Small Humanoid.`);
      // A corpse still in the fight's order (cast as a Magic action through Divine Intervention, so in a fight) is refused,
      // as the DM's `remove` refuses a creature in the fight: taking it out would leave its place in the order and its share
      // of the fight's XP (A3) to nothing (review of #341, M1).
      !inFight(s, t.id) || fail(`${nm(t)} fell in this fight and is still in its order: it can be raised once the fight is over.`);
    }
    const d = apart(s, e, t);
    d * FT <= range || fail(`${nm(t)} is ${ft(d)} away. ${sp.name} reaches ${range} ft.`);
    unblocked(s, e, t) || fail(`There is a wall between ${e.name} and ${nm(t)}.`);
  }
  const raise = isCorpse(list[0]);
  list.every((t) => isCorpse(t) === raise) || fail(`${sp.name} either animates corpses or keeps ${e.name}'s own creatures under control, not both in one casting.`);
  if (raise) {
    list.length <= count || fail(`${sp.name} animates ${count === 1 ? 'one corpse' : `up to ${count} corpses`} at level ${slot}.`);
    roomForCompanions(s, e, list.length);
  } else list.length <= again || fail(`${sp.name} keeps up to ${again} of ${e.name}'s creatures under control at level ${slot}.`);
  return { ids: list.map((t) => t.id), raise };
}

// ---------- casting a spell from a magic item (DEBT C14, #284) ----------
// The `use` action with `item` (features.js) casts an item's spell through castSpell, below, with
// `item` = { name, level, dc, attack, healMod, comps, self?, spend(e), check?(e), done?(e) }.
// SRD "Spells Cast from Items": at the lowest spell and caster level (so a cantrip at caster level 1,
// and `level` the level the item gives, raised by extra charges where it says so), no spell slot (so it is
// not the one slot spell of the turn), no components unless the item says otherwise (`comps`: none for a
// wand or staff, so nobody can see it being cast and Counterspell has no moment; a Spell Scroll keeps its
// Verbal and Somatic ones, which can be countered and give a hiding reader away), its own casting time,
// range and duration, Concentration if the spell needs it. `dc` and `attack` are the item's or the user's
// own (worked out in features.js). Metamagic and the Evoker's and Warlock's additions are for spells their
// own class casts, so are refused with an item. `spend` pays the item (charges, the `item` event) once the
// spell is checked; a scroll's `check` (a spell above the reader's level) may make it fade, and `done`
// takes a consumed scroll away once the spell is cast or has faded; a countered one is kept (the casting
// was interrupted: SRD "Spell Scroll").
export const castFromItem = (s, a, ctx, ev, item) => castSpell(s, a, ctx, ev, item);

export const handlers = {

  // { type: 'cast', actor, spell, target? | hex?, slot? }
  cast(s, a, ctx, ev) { castSpell(s, a, ctx, ev, null); },
  // End a lasting effect early: its caster dropping Concentration, or the DM. { type: 'endEffect', effect }
  endEffect(s, a, ctx, ev) {
    const fx = effectsOf(s).find((x) => x.id === a.effect) || fail('No such effect.');
    const src = s.entities[fx.source], who = ownerOf(s, src), own = !!who && who === ctx.userId;
    // To a player, an effect of a creature they do not know of, on nobody they know of, is nothing.
    if (ctx.role !== 'dm' && !own && (!src || unknown(s, src)) && !fx.parts.some((p) => s.entities[p.target] && !unknown(s, s.entities[p.target]))) fail('No such effect.');
    ctx.role === 'dm' || own || fail(`${fx.name} isn't yours to end.`);
    endEffect(s, ev, fx, own || !src ? `${src?.name ?? 'its caster'} ended it` : 'the DM ended it');
  },
};

function castSpell(s, a, ctx, ev, item) {
    const e = ent(s, a.actor); control(s, e, ctx);
    const sp = SPELLS[a.spell];
    if (item) for (const k of ['via', 'slot', 'metamagic', 'empower', 'overchannel', 'repel', 'ritual']) a[k] === undefined || fail(`"${k}" is not for a spell cast from ${item.name}.`);
    // Cast through a feature (`a.via`, a feature with `freeCast`: Divine Intervention): any spell
    // of its list up to its level, prepared or not, with no slot, as part of the feature's action,
    // for one of its uses. A feature that names its spells (`freeCast.spells`: Magic Initiate's level 1
    // spell) casts one of them at its own level and casting time, with no slot, for one of its uses.
    const via = a.via !== undefined ? (featOf(e, a.via)?.freeCast ? featOf(e, a.via) : fail(`${e.name} has no feature that casts spells that way.`)) : null;
    // Since #232 (Eldritch Invocations, Contact Patron): `atWill`, no uses spent; `self`, only on its
    // caster; `dark`, only while the caster is in Dim Light or Darkness (One with Shadows); `time`, cast
    // in that time instead of its own (Pact of the Chain: a Magic action); `sureSave`, the caster
    // succeeds on the spell's own saves (Contact Patron); `maxTemp`, Temporary Hit Point dice at their
    // highest (Fiendish Vigor).
    if (via) {
      const fc = via.freeCast;
      (sp && (fc.spells ? fc.spells.includes(a.spell) : (sp.def.classes ?? []).includes(fc.list) && sp.level <= fc.maxLevel)) || fail(`${via.name} can't cast that spell.`);
      (fc.atWill || (e.uses[via.id] ?? 0) > 0) || fail(`${e.name} has no uses of ${via.name} left.`);
      a.slot === undefined || fail(`${via.name} casts a spell at its own level, without a slot.`);
      if (fc.self) [a.target, ...(a.targets ?? [])].every((id) => id === undefined || id === e.id) || fail(`${via.name} casts ${sp.name} on ${e.name} only.`);
      if (fc.dark) lightAt(s, e.pos) !== 'bright' || fail(`${via.name} works only while ${e.name} is in Dim Light or Darkness.`);
    } else if (!item) (sp && e.spells.includes(a.spell)) || fail(`${e.name} doesn't know that spell.`);
    else sp || fail(`${item.name} casts a spell the engine does not know.`);
    // A companion that can't attack (a familiar) makes no attack roll by a spell either (review of #313, M3).
    if (e.bond?.noAttack) { let roll = false; walkSteps(sp.def.effects ?? [], (st) => { if ('attack' in st) roll = true; }); !roll || fail(`${e.name} can't attack, and ${sp.name} makes an attack roll.`); }
    up(e) || fail(`${e.name} is down.`);
    able(e);
    if (sp.time === 'reaction') fail(sp.def.reaction
      ? `${sp.name} is cast as a Reaction, by ${e.name}'s standing instruction for it (set it with the reactions on the sheet).`
      : `${sp.name} is cast as a Reaction. The engine does not handle that yet; the DM applies it.`);
    !e.form || fail(`${e.name} can't cast spells in the form of a ${e.form.name}.`);
    const raging = effectsOf(s).find((fx) => fx.source === e.id && fx.noSpells);
    if (raging) fail(`${e.name} can't cast spells during ${raging.name}.`);
    const asAction = !!via?.freeCast.list || via?.freeCast.time === 'action';      // Divine Intervention, Pact of the Chain: the spell is a Magic action
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
    const slot = item ? item.level : sp.level > 0 ? (a.slot ?? sp.level) : 0;
    const casterLevel = item ? 1 : e.level;           // an item casts at the lowest caster level
    if (item?.self) [a.target, ...(a.targets ?? [])].every((id) => id === undefined || id === e.id) || fail(`${sp.name} from ${item.name} targets ${e.name} only.`);
    const mm = metamagicFor(s, e, sp, a, slot);
    // A touch its familiar delivers (`a.deliver`): reached from the familiar, for its Reaction (checked now, spent below).
    const toucher = deliverFor(s, e, sp, a);
    // Eldritch Spear (`spellRange: { spell, add }`): that spell's range is longer by so many feet.
    const spear = (e.feats ?? []).reduce((n, f) => n + (f.spellRange?.spell === a.spell ? f.spellRange.add : 0), 0);
    const range = typeof (mm.range ?? sp.range) === 'number' && spear ? (mm.range ?? sp.range) + spear : mm.range ?? sp.range;
    const most = targetCount(sp.def, casterLevel, Math.max(slot, sp.level) + (mm.has.twinned ? 1 : 0));
    let targets = [], hexes = null, areaOrigin = null;
    if (sp.aim === 'area') {
      ({ targets, hexes, origin: areaOrigin } = aimArea(s, e, sp.name, sp.area, range, a.hex));
      if (sp.area.choose) targets = chosen(e, sp.name, targets, a.targets, most);
    } else if (sp.aim === 'creature') {
      targets = creatures(s, toucher ?? e, sp.name, { range, harmful: sp.harmful, repeat: sp.repeat, within: sp.within, most, spell: true }, a);
    } else if (sp.aim === 'self') targets = [e];
    if (mm.has.careful) for (const id of a.careful) targets.some((t) => t.id === id) || fail('Careful Spell protects creatures the spell affects.');
    if (mm.has.heightened) targets.some((t) => t.id === a.heightened) || fail('Heightened Spell picks one target of the spell.');
    // A teleport goes where `a.hex` names (Misty Step), checked now, before anything is spent.
    // With no `hex` the engine has nowhere to take the caster and the DM moves it.
    const tpStep = sp.teleport ? sp.def.effects.find((x) => 'teleport' in x) : null;
    const tpTo = tpStep && a.hex !== undefined ? teleportSpot(s, e, tpStep, a.hex, sp.name, ctx.role !== 'dm') : null;
    // A summon names its choices and a space for each creature (`a.summon`), checked now, before anything is spent.
    const summoning = summonFor(s, e, sp, a, Math.max(slot, sp.level), range, ctx);
    const evo = item ? {} : evokerFor(e, sp, a, slot, via, targets);
    const repel = repelFor(e, sp, a);

    // What it costs.
    if (sp.level > 0 && !via && !item) {
      (Number.isInteger(slot) && slot >= sp.level && slot <= 9) || fail(`${sp.name} needs a spell slot of level ${sp.level} or higher.`);
      e.slots[slot] > 0 || fail(`${e.name} has no level ${slot} spell slots left.`);
    }
    const aimed = sp.aim === 'area' || sp.aim === 'creature';
    // E23: the DM's hostile cast at a party member, with `autoEngage` on and no fight, lands and then the fight starts
    // (landThenFight, below). Any other harmful cast aimed at others outside a fight starts the fight and is not cast, as before.
    const lands = !s.encounter && sp.harmful && aimed && landsFirst(s, e, targets, ctx) ? { from: ev.length, time, slotted: sp.level > 0 && !via && !item, used: new Set(living(s).filter((o) => o.reactionUsed).map((o) => o.id)) } : null;
    if (!s.encounter && sp.harmful && aimed && !lands) return sp.aim === 'area' ? startEncounter(s, e.pos, ev) : engage(s, e, targets[0], ev);
    const done = () => { if (lands) landThenFight(s, e, sp, targets, ev, lands); checkEnd(s, ev); };
    const slotFlag = s.encounter ? s.encounter.flags.slot : undefined;
    const slotted = sp.level > 0 && !via && !item;
    if (mm.has.quickened) time = 'bonus';
    if (lands) lands.time = time;
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
    if (toucher && s.encounter) toucher.reactionUsed = true;
    if (via && !via.freeCast.atWill) e.uses[via.id]--;
    if (mm.cost) e.uses[mm.pool] -= mm.cost;
    if (mm.has.quickened && s.encounter) s.encounter.flags.slot = true;      // and no level 1+ spell after it this turn
    if (mm.list.length) ev.push({ type: 'std', id: e.id, action: `Metamagic: ${mm.names.join(', ')}` });
    // From an item: its charges and its event now; a scroll of a spell above its reader's level may fade.
    const comps = item ? item.comps : sp.def.components ?? [];
    if (item) {
      item.spend(e);
      if (item.check && !item.check(e)) { item.done?.(e); return done(); }
    }
    if (comps.includes('v') && !mm.has.subtle) unhide(s, e, ev, 'spell');      // a Verbal component gives a hiding caster away
    showPlace(s, e, ev);
    // Someone who sees it being cast may counter it (Counterspell). Then it dissipates with no
    // effect: the action or Bonus Action is wasted, but a spell slot is not expended (SRD), and so
    // does not count as the one slot this turn.
    // Subtle Spell: nothing to see being cast, unless a Material component with a cost or one the spell consumes is left.
    const counteredBy = mm.has.subtle && !sp.def.costly ? null : counterWindow(s, e, sp, ev, comps);
    if (counteredBy) {
      if (slotted) { e.slots[slot]++; if (s.encounter) { if (slotFlag) s.encounter.flags.slot = slotFlag; else delete s.encounter.flags.slot; } }
      ev.push({ type: 'countered', id: e.id, spell: a.spell, name: sp.name, by: counteredBy });
      return done();
    }
    item?.done?.(e);                                    // a scroll crumbles once its spell is cast
    // Caught in the area: no longer unseen. A summon is aimed at its caster only in form (its targets are the spaces
    // it names), so it does not show a caster the DM hid: the creature appears, its caster stays unknown.
    for (const t of targets) if (!(summoning && t === e)) reveal(s, t, ev);

    // What it does: run its effect steps.
    const st = item ? { dc: item.dc, attack: item.attack } : spellStats(e, s, sp.id), { steps, unscaled } = scaleSteps(sp.def, casterLevel, slot);
    const healMod = item ? item.healMod : mod(e.abil[castAbilOf(e, sp.id)] ?? 10);
    if (pick) chooseIn(steps, pick.of, a.choice);
    // Repelling Blast: a hit with the spell's attack pushes a Large or smaller target so many feet away.
    if (repel) walkSteps(steps, (x) => { if ('attack' in x) (x.onHit ??= []).push({ move: repel, dir: 'away', largest: 'large' }); });
    if (mm.has.transmuted) walkSteps(steps, (st) => { if ('damage' in st && TRANSMUTE.includes(st.type)) st.type = a.transmute; });
    ev.push({ type: 'cast', actor: e.id, spell: a.spell, name: sp.name, hexes, targets: targets.map((t) => t.id), ...(slot > sp.level ? { slot } : {}), ...(pick ? { choice: a.choice } : {}), ...(via ? { via: via.name } : {}), ...(item ? { item: item.name } : {}) });
    if (toucher) ev.push({ type: 'delivered', id: toucher.id, by: e.id, spell: a.spell });
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
        ...(sp.area.shape === 'emanation' ? { follows: e.id } : { hexes: hexes.map(col), origin: { ...(areaOrigin ?? e.pos) } }),
        spare, steps: structuredClone(steps), src: { name: sp.name, dc: st.dc, attack: st.attack, range: sp.range, ...(sp.level === 0 ? { cantrip: true } : {}), healMod }, last: {} };
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
      fx.terrain = { area: { ...sp.area }, hexes: hexes.map(col), origin: { ...(areaOrigin ?? e.pos) }, ...(ter.difficult ? { difficult: true } : {}), ...(ter.obscured ? { obscured: ter.obscured } : {}) };
    }
    const before = ev.length;
    const shared = sp.aim === 'area' || (hit.length > 1 && !sp.repeat) ? sharedRolls(s, steps, !!evo.overchannel) : null;
    if (evo.overchannel) ev.push({ type: 'note', id: e.id, text: `${evo.overchannel.name}: ${sp.name} deals its maximum damage` });
    // Empowered Evocation on a roll shared by everyone it hits: added once, to that roll.
    if (evo.empower && shared?.[evo.empower.path]) {
      const r0 = shared[evo.empower.path];
      shared[evo.empower.path] = { ...r0, total: r0.total + evo.empower.add, bonus: r0.bonus + evo.empower.add };
      ev.push({ type: 'note', id: e.id, text: `${evo.empower.name}: +${evo.empower.add} damage` });
      evo.empower.done = true;
    }
    begin(s, {
      steps, actor: e.id, targets: sp.aim === 'none' ? null : hit.map((t) => t.id),
      src: { name: sp.name, dc: st.dc, attack: st.attack, range, ...(sp.level === 0 ? { cantrip: true } : {}), healMod, ...(fx ? { fx: fx.id } : {}),
        ...(mm.has.careful ? { careful: [...a.careful] } : {}), ...(mm.has.heightened ? { heightened: a.heightened } : {}), ...(areaOrigin ? { origin: areaOrigin } : {}), ...(blocked.length ? { blocked } : {}), ...(tpTo ? { to: tpTo } : {}),
        ...(evo.overchannel ? { max: true } : {}), ...(evo.empower && !evo.empower.done ? { empower: evo.empower } : {}),
        spell: sp.id, ...(via?.freeCast.sureSave ? { sure: [e.id] } : {}), ...(via?.freeCast.maxTemp ? { maxTemp: true } : {}),
        ...(summoning ? { summon: { ...summoning, slot: Math.max(slot, sp.level), caster: summonCaster(s, e, sp.id) } } : {}), ...(toucher ? { via: toucher.id } : {}) },
      // Damage from one effect that several creatures save against at once is rolled once (SRD
      // "Damage against Multiple Targets"); rays, darts and beams each roll their own.
      shared,
    });
    resolve(s, ev);
    // Overchannel after the first use since a Long Rest: Necrotic damage to the caster, right after the spell.
    if (evo.overchannel) {
      const of = evo.overchannel, n = e.uses[of.id] ?? 0;
      e.uses[of.id] = n + 1;
      if (n >= 1 && !e.dead) {
        const r = roll(s, `${slot * (n + 1)}d${of.overchannel.die}`);
        ev.push({ type: 'note', id: e.id, text: `${of.name}: ${n + 1}d${of.overchannel.die} Necrotic per slot level, ignoring Resistance and Immunity` });
        damage(s, e, [{ amount: r.total, type: 'necrotic', dice: r.dice, bonus: r.bonus, by: null }], null, ev, { pierce: true });
      }
    }
    if (evo.told) ev.push({ type: 'manual', actor: e.id, name: sp.name, text: evo.told, partial: true });

    // Whatever the engine did not do, it says, so nothing is quietly skipped.
    const note = (text) => ev.push({ type: 'manual', actor: e.id, name: sp.name, text, partial: true });
    const toldAlready = ev.slice(before).some((x) => x.type === 'manual' && !x.partial);
    if (sp.def.tier !== 'auto' && !toldAlready) note(sp.def.text);
    if (unscaled) note(`Cast ${item ? `at level ${slot}` : `with a level ${slot} slot`}. The engine could not add ${unscaled}; the DM does.`);
    if (fx?.bound) settle(s, ev, fx, targets);
    else if (fx && fx.until === null) note(`${sp.name} lasts ${sp.def.duration}. The engine cannot time that; the DM ends it.`);
    done();
}

// ---------- E23: a hostile cast lands, then the fight starts (docs/specs/table-ui.md, E23; #372) ----------
// Does the caster's first turn of the fight its cast started go without the action (or Bonus Action) the spell was cast
// with, and without a spell slot that turn? The owner has not decided (the lead's proposal says yes); `false` until
// they do: the cast was made before the fight, and the caster's first turn is a whole turn.
export const CAST_TAKES_FIRST_ACTION = false;
// The DM's harmful cast, aimed at others, catching or aimed at a party member, by a creature not of the party, with the
// table rule `autoEngage` on and no fight going on.
const landsFirst = (s, e, targets, ctx) => ctx.role === 'dm' && s.settings.autoEngage === true && e.side !== 'party' && targets.some((t) => t.side === 'party');
// The cast has run (its saves, damage, conditions, Concentration, the reactions it allowed, a Counterspell that undid it):
// now the fight starts, in the same action, so one undo takes back both. Initiative is rolled as for any fight.
//   - What the party did not know of while it was cast stays unknown in its events (`unseen`, which view.js reads and
//     apply()'s record keeps): a hidden caster's spell is told as any unseen creature's is (its `cast` event, its
//     Concentration and whose effect it is are not sent; a save carries no DC), and the fight's start then reveals it,
//     as every fight does ("nobody fights unseen", hidden-information.md section 5).
//   - A Reaction taken during the cast stays spent until that creature's first turn in the fight (SRD "Reactions": "When
//     you take a Reaction, you can't take another one until the start of your next turn"), where a fight starting would
//     otherwise give it back.
//   - The fight is placed as the cast would have placed it: round the caster for an area, else round the caster and the
//     first creature it was aimed at, where they stand now. If nobody is left to fight there, no fight starts.
function landThenFight(s, e, sp, targets, ev, lands) {
  const hid = (id) => typeof id === 'string' && Object.hasOwn(s.entities, id) && unknown(s, s.entities[id]);
  const caster = hid(e.id) ? [e.id] : [];
  for (const x of ev.slice(lands.from)) {
    const ids = [...caster, ...[x.id, x.actor, x.target, x.by, x.against, x.source, ...(Array.isArray(x.targets) ? x.targets : [])].filter(hid)];
    if (ids.length) x.unseen = [...new Set([...(Array.isArray(x.unseen) ? x.unseen : []), ...ids])];
  }
  const keep = new Set(living(s).filter((o) => o.reactionUsed && !lands.used.has(o.id)).map((o) => o.id));
  const owed = CAST_TAKES_FIRST_ACTION && !e.dead ? { [e.id]: { time: lands.time, slot: lands.slotted, spell: sp.name } } : null;
  const opts = { keep, ...(owed ? { owed } : {}) };
  try {
    if (sp.aim === 'area') startEncounter(s, e.pos, ev, undefined, null, opts); else engage(s, e, targets[0], ev, null, opts);
  } catch (err) {
    if (!(err instanceof RuleError)) throw err;                     // "Nobody is close enough to fight here.": refused before anything changed
  }
}

