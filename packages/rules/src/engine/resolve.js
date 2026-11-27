// The engine's machinery for what actions do (engine.js): the attack roll, damage, falls, pushes
// and teleports, reactions that answer them, the kit lent to the effect runner (effects.js), and how
// a fight starts, passes from turn to turn and ends.
import { noteRuns } from '../todo.js';
import { gridOf, col } from '../grid.js';
import { d20Faces, die, rand, roll } from '../rng.js';
import { CONTENT, MONSTERS, MONSTER_ACTIONS, SPELLS, summonTemplate, TILES } from '../content/index.js';
import { leaveForm, takeForm } from '../forms.js';
import { DAMAGE_TYPES } from '../content/schema.js';
import { srcOf } from '../homebrew.js';
import { begin, CUBE_AIM_MAX, run, scaleSteps, sharedRolls, turnSteps, walk as walkSteps } from '../effects.js';
import { breakConcentration, concentrationCheck, confusedNow, concentrationLost, damaged, effectsOf, endEffect, endWards, fightOver, holds, ON, restamp, ROUND, roundStarted, startEffect, thisTurn, turnEnded, turnKey, turnStarted, useUp } from '../durations.js';
import { apart, concealed, footprint, FT, ground, hasColumn, landing, overlapAt, paired, STEP_FREE, STEP_MAX, submerged, surfaces, under, unseenAt } from '../space.js';
import { raised, seenName, sightRule, unknown } from '../vision.js';
import { concludeFight } from '../rewards.js';
import { silentAll, silentAt } from '../terrain.js';
import { entered, flushZones, snapshot, stepped, turnInZones } from '../zones.js';
import { canSee, COVER, coverOf, hiddenFrom, inViewOf } from '../sight.js';
import { barriers, distToSegment, objectDef } from '../walls.js';
import { LIGHTS } from '../content/lights.js';
import { SIZES } from '../content/sizes.js';
import { canReact, instruction, reactionsOf } from '../reactions.js';
import { conditionName, incapacitated, incapacitatedBy, judge, modifiers, speedOf, untrainedGear, warded } from '../modifiers.js';
import { fitsHit, freeHitCasts, hitChoicesOf, hitInstruction } from '../hitchoices.js';
import { ARENA_RADIUS, ask, blocked, unblocked, castAbilOf, current, ownerOf, dying, fail, fighters, hostile, inFight, living, mod, mountOf, partyOf, pocketOf, riderOf, rollDice, rolledOf, RuleError, spellStats, steering, tellDM, together, turnBudget, up } from './shared.js';
import { circlesFor, cutWall, resize, sizeEnd, aloft, below, creatureType, carry, forcedStep, forcedStride, holdsOf, catchUp, riderLanding, cornerFree, fightPlace, fitsOn, followMasters, initiativeSort, joinEncounter, joinLead, lookAround, sideOf, tieOf, nearestFree, objectActor, objectName, objectStep, objectZ, isPile, sense, ownCount, pileAt, pileId, reveal, rollInit, roomAt, showPlace, unfollow, unhide } from './world.js';
import { acOf, passive, attackTypes, bestSave, boundEffect, condition, grip, cure, dealt, deathSave, heal, kill, modifier, eachTurn, endSpell, arm, ward, command, confuse, COMMAND_WORDS, imbue, bestType, recharge, renew, rerollSave, rescue, rollMode, savingThrow, settle, slotsFor, spellOffer, tempHp } from './rolls.js';
import { died, dispel, revive, shine, stabilise } from './rolls.js';       // `stabilize`, `light` and `dispel` steps (KIT)
import { makeEntity, tryLand } from './sheets.js';
import { armed, weaponKey } from '../imbue.js';
import { handsFull, heavyWeak, isUnarmed, steadiest } from '../weapons.js';
import { investIn } from '../summons.js';
import { nextFight } from '../shopids.js';
import { refill, stepTides } from '../tides.js';

// ---------- objects, falls, pushes and teleports (the effect steps that move things) ----------

// Run a list of effect steps that come from a thing on the map against some creatures.
export function objectEffects(s, o, steps, targets, ev) {
  if (!targets.length) return;
  begin(s, { steps, actor: null, targets: targets.map((t) => t.id), shared: targets.length > 1 ? sharedRolls(s, steps) : null,
    src: { name: objectName(o), object: o.id, dc: o.dc?.save ?? objectDef(o).dc?.save ?? 10, range: 1000 } });
  resolve(s, ev);
}
// Falling: 1d6 Bludgeoning for every 10 feet, 20d6 at most, and Prone on landing unless it took no damage.
// `feet` is a number, or "surface" (docs/specs/maps-and-objects.md: "the target drops a number of feet, or to the next
// surface"): it drops to the surface under it, as the gravity pass would put it, by the height between. Already standing
// on a surface it does not fall. A creature riding or ridden is the DM's: it would part the pair.
// `into`: the pit object that drops it (a placement's own depth, `fall` on the object, docs/specs/maps-and-objects.md
// "Amendment: deep pits"). When the pit is deeper than its own 10 feet and a floor lies within its depth in this column,
// the creature lands on the highest such floor and falls only the actual drop; with no object, or none such, nothing moves.
export function fall(s, t, feet, ev, into = null, from = null) {
  if (into && feet > 10 && Number.isInteger(feet)) {
    const z = t.pos.z ?? 0, sf = surfaces(s.map, t.pos).filter((x) => x.z <= z - 10 && x.z >= z - feet).pop();
    if (!sf && !t.dead) {
      ev.push({ type: 'manual', actor: null, name: 'Falling', partial: true, text: `${t.name} falls into a pit ${feet} feet deep, but there is no floor within that depth under the hex it stands on (a big creature's other hexes do not count). The DM places ${t.name} and works out the fall: 1d6 bludgeoning damage for each 10 feet, up to 20d6, and Prone if that hurt.` });
      return;
    }
    if (sf && !t.dead) {
      if (t.riding || t.rider) {
        ev.push({ type: 'manual', actor: null, name: 'Falling', partial: true, text: `${t.name} falls into a pit deep enough to reach the floor below, but it is riding or being ridden, and the engine would part the pair. The DM moves ${t.name} down and works out the fall: 1d6 bludgeoning damage for each 10 feet, up to 20d6, and Prone if that hurt.` });
        return;
      }
      const to = nearestFree(s, t, { q: t.pos.q, r: t.pos.r, z: sf.z });
      if (!to) {
        ev.push({ type: 'manual', actor: null, name: 'Falling', partial: true, text: `${t.name} falls into a pit deep enough to reach the floor below, but there is no room for it to land. The DM places ${t.name} and works out the fall: 1d6 bludgeoning damage for each 10 feet, up to 20d6, and Prone if that hurt.` });
        return;
      }
      const drop = z - to.z, top = { ...t.pos };
      t.pos = { q: to.q, r: to.r, z: to.z };
      fall(s, t, drop, ev, null, top);
      return lookAround(s, ev, [t]);
    }
  }
  if (feet === 'surface') {
    const said = (text, manual) => ev.push(manual ? { type: 'manual', actor: null, name: 'Falling', partial: true, text } : { type: 'note', id: t.id, text });
    if (ground(s.map, t.pos)) return said(`${t.name} is standing on a surface, so it does not fall`);
    if (aloft(s, t) && !t.dead) return said(`${t.name} is flying or hovering by its own Speed, so by the SRD's Flying rule it does not fall: a flying creature falls only if it has the Incapacitated or Prone condition or its Fly Speed is reduced to 0, unless it can hover. The engine leaves ${t.name} where it is; if the effect should bring it down, the DM moves it down and works out the fall (1d6 bludgeoning damage for each 10 feet, up to 20d6, and Prone if that hurt).`, true);
    if (t.riding || t.rider) return said(`${t.name} is to fall to the surface below, but it is riding or being ridden, and the engine would part the pair. The DM moves ${t.name} down and works out the fall: 1d6 bludgeoning damage for each 10 feet, up to 20d6, and Prone if that hurt.`, true);
    const sf = under(s.map, t.pos);
    if (!sf) return said(`${t.name} is to fall to the surface below, but the engine finds no surface under it. The DM places ${t.name} and works out the fall.`, true);
    feet = (t.pos.z ?? 0) - sf.z;
    const top = { ...t.pos };
    t.pos = { q: t.pos.q, r: t.pos.r, z: sf.z };
    if (t.dead) { ev.push({ type: 'fell', id: t.id, feet }); return lookAround(s, ev, [t]); }          // a body comes down with no damage, as the gravity pass puts it
    fall(s, t, feet, ev, null, top);
    return lookAround(s, ev, [t]);
  }
  const dice = Math.min(20, Math.floor(feet / 10));
  if (dice && !t.dead && featherFall(s, t, feet, ev, from)) return;
  ev.push({ type: 'fell', id: t.id, feet });
  if (!dice) return;
  const mark = ev.length;
  const r = roll(s, `${dice}d6`);
  damage(s, t, [{ amount: r.total, type: 'bludgeoning', dice: r.dice, bonus: r.bonus }], null, ev);
  if (ev.slice(mark).some((x) => x.type === 'damage' && x.amount > 0)) condition(s, t, 'prone', ev);
}
// Feather Fall (docs/specs/rules-expansion.md, "Build notes: wave 4 part 5"; trigger `fall`): a creature that falls far enough to be hurt (10 feet
// or more) sets off the Reaction of a caster who is it or an ally (not hostile to it), with the spell's standing instruction not `never`, a
// slot, a Reaction, the faller within the spell's range and seen (`seesFor`: the party's casters never see a creature the party does not know
// of). The fall is instant in the engine, so the creature lands at once, with no damage and not Prone (a fall of more than 60 feet would take
// rounds at 60 feet per round; the spell's note tells the DM). The spell ends for it on landing. One cast covers up to five creatures that fall in
// the same action (a pit under a group): the caster's `cast` event of this action lists them. Returns true when the fall was slowed.
function featherFall(s, t, feet, ev, from) {
  const land = () => { ev.push({ type: 'fell', id: t.id, feet, slowed: true }); return true; };
  // Range and sight are worked out from where it began to fall (`from`: the creature has already been put on the floor below).
  const near = (r, sp) => {
    const at = t.pos;
    if (from) t.pos = from;
    try { return apart(s, r, t) * FT <= (typeof sp.range === 'number' ? sp.range : 0) && (r.id === t.id || seesFor(s, r, t)); } finally { t.pos = at; }
  };
  // A caster reacts for another creature only when the party knows of both or of neither. A known caster saving an unknown faller would
  // tell the players of the faller (its reaction and cast); an unknown caster saving a known faller would tell them of the caster (the fall
  // seen to do no harm, where a bare cell would hurt). A creature saving itself tells nothing more than its own fall.
  const known = (x) => !(x.hidden || unknown(s, x));
  const tells = (r) => r.id !== t.id && known(t) !== known(r);
  for (const r of Object.values(s.entities)) {
    if (r.object || r.dead || (r.id !== t.id && hostile(r, t)) || tells(r)) continue;
    const covered = ev.findLast((x) => x.type === 'cast' && x.actor === r.id && x.spell === 'feather-fall' && x.reaction === true);
    if (covered && covered.targets.length < 5 && near(r, SPELLS['feather-fall'])) { covered.targets.push(t.id); return land(); }
  }
  for (const r of Object.values(s.entities)) {
    if (!canReact(r) || r.object || (r.id !== t.id && hostile(r, t)) || tells(r)) continue;
    const rx = reactionsOf(r).find((x) => x.kind === 'spell' && x.on === 'fall');
    if (!rx) continue;
    const w = instruction(r, rx);
    if (w === 'never') continue;
    const sp = SPELLS[rx.id], slots = slotsFor(s, r, sp);
    if (!slots.length || !near(r, sp)) continue;
    let slot = slots[0];
    if (w === 'ask') {
      const a = ask(s, r, { trigger: 'fall', ...(r.id !== t.id && seesFor(s, r, t) ? { by: t.id } : {}) }, [spellOffer(rx, slots)]);
      if (a === null) { tellDM(r, rx, `${t.name} falls ${feet} feet.`, ev); continue; }
      if (a.take !== rx.id) continue;
      slot = a.slot ?? slot;
    }
    const src = castReaction(s, r, sp, slot, 'fall', r.id === t.id ? null : t.id, ev, [t.id]);
    const fx = src.fx && effectsOf(s).find((x) => x.id === src.fx);
    if (fx) endEffect(s, ev, fx, 'landed');
    return land();
  }
  return false;
}
// Forced movement: shove a creature so many feet straight away from a point, or toward it. It
// stops at a wall, a drop, or anything in the way. It provokes nothing and sets nothing off.
// On squares each step costs what the table's diagonal rule says (`diagonals`; no last square on
// what is left, as there is for a creature's own move), and every part of a big creature must
// cross no wall and pass no corner, as when it walks.
// A ridden pair (stage C6b): a push or pull of the mount is an effect moving it against its will, so its rider makes the
// DC 10 Dexterity save before the first step (SRD 5.2.1 "Falling Off", 2126-2131): on a success it is carried along, on a
// failure it falls off Prone beside where the mount stood and the mount goes on alone. The push is not changed by the
// fall: it is worked out with the rider out of the way, and the rider then lands within 5 ft of where the mount stood,
// in a space the mount did not go to (fix round 1 of #363, M2). A push of the rider itself the
// SRD gives no rule for (it is not the mount that is moved): the engine does not move it, and the DM is told.
// It returns what became of it, for a caller that has to say: 'mount' (a riding creature: the DM is told, nothing moves), 'aloft' (the
// creature stands on nothing, so no step is found), 'blocked' (a wall, a drop, a creature, or a boundary stops the first step),
// 'moved'. The step it takes is `forcedStep` (world.js), which the drag of a held creature asks too, before its grappler moves.
function push(s, t, feet, dir, from, ev) {
  if (mountOf(s, t)) {
    ev.push({ type: 'manual', actor: null, name: 'Mounted combat', partial: true,
      text: `${t.name} would be ${dir === 'toward' ? 'pulled' : 'pushed'} ${feet} ft while riding ${mountOf(s, t).name}. The SRD has no rule for a rider moved off its mount this way, so the engine leaves ${t.name} riding: the DM moves ${t.name} (dismount, then place) if it should go.` });
    return 'mount';
  }
  const G = gridOf(s.map), path = [], sign = dir === 'toward' ? -1 : 1;
  const r0 = riderOf(s, t), was = { ...t.pos };
  let rider = r0, asked = false, fallen = null;
  const square = G.kind === 'square';
  let left = feet, odd = false, why = 'blocked';
  for (let i = 0; square ? left > 0 : i < Math.floor(feet / FT); i++) {
    const best = forcedStep(s, t, from, sign, left, odd);
    if (!best.h) { if (best.why === 'aloft') why = 'aloft'; break; }
    // The save is made once a step is found (the effect is about to move it).
    if (rider && !asked) { asked = true; if (!staysOn(s, rider, ev)) { fallen = rider; rider = null; } }
    if (square) { const d = G.beside(t.pos, best.h).length > 0; left -= forcedStride(s, t.pos, best.h, odd); if (d) odd = !odd; }
    const zonesBefore = snapshot(s);
    t.pos = best.h; path.push(best.h);
    if (rider) carry(s, t);
    entered(s, ev, KIT, zonesBefore);                                    // pushed into a zone: it goes off once this effect is done
    stepped(s, ev, KIT, t);                                              // and each 5 feet it is moved through ground that hurts (Spike Growth)
  }
  if (!path.length) return why;
  ev.push({ type: 'moved', id: t.id, path, forced: true });
  if (rider) ev.push({ type: 'moved', id: rider.id, path: path.map((h) => ({ ...h })), forced: true });
  lookAround(s, ev, rider ? [t, rider] : [t]);
  if (fallen && !putOff(s, fallen, t, dir === 'toward' ? 'pulled' : 'pushed', ev, true, was)) {
    carry(s, t);                                                         // nowhere to land: it stays on, carried along
    ev.push({ type: 'moved', id: fallen.id, path: path.map((h) => ({ ...h })), forced: true });
  }
  return 'moved';
}
// The effect step: `t` goes to `to` (from teleportSpot). Returns false if it could not go, which
// runs the step's `blocked` steps instead when it has them.
function teleport(s, t, step, to, ev, own = true) {
  // One of a riding pair teleports alone, so the ride ends (stage C6b; teleportApart).
  if (mountOf(s, t) || riderOf(s, t)) {
    const body = mountOf(s, t) ? { ...t, riding: undefined } : t, G = gridOf(s.map);
    if (step.blocked && living(s).some((o) => o.id !== t.id && !paired(o, t) && overlapAt(o, o.pos, body, to, G))) return false;
  }
  const parted = teleportApart(s, t, ev);
  if (parted) { const went = teleport(s, t, step, to, ev, own); parted(); return went; }
  const G = gridOf(s.map), taken = (pos) => living(s).some((o) => o.id !== t.id && overlapAt(o, o.pos, t, pos, G));
  let at = to;
  if (taken(at)) {
    if (step.blocked) return false;                                     // Dimension Door's own rule (its `blocked` steps)
    // A creature the teleporter's side does not know of stands there (the casting already refused a space it knows is taken).
    // Moving the teleporter anywhere else, or not at all, would tell the players something is there, so it arrives as
    // intended and shares the space for now; the DM settles it (the SRD wants an unoccupied space). The note is the DM's alone.
    const there = living(s).filter((o) => o.id !== t.id && overlapAt(o, o.pos, t, at, G));
    const unknownToIt = (o) => hiddenFrom(o, t) || (t.side === 'party' && (o.hidden || unknown(s, o)));
    if (there.every(unknownToIt)) {
      ev.push({ type: 'manual', actor: t.id, name: step.name ?? (step.familiarity !== undefined ? 'Teleport' : 'Teleportation'), partial: true,
        text: `${t.name} ${step.said ?? 'teleported into'} the space where ${there.map((o) => o.name).join(' and ')} stands, which its side did not know of. The engine put ${t.name} there so the players learn nothing; the DM decides where each of them ends up (the spell wants an unoccupied space).` });
    } else {
      // A creature it knew of (not refused at the cast, as when the space filled since): the nearest unoccupied space, the first found on each ring.
      at = null;
      for (let n = 1; n <= 6 && !at; n++) for (const h of G.range(to, n).filter((x) => G.dist(x, to) === n)) {
        const p = landing(s.map, h, to.z);
        if (p && Math.abs(p.z - to.z) <= STEP_MAX && !roomAt(s, t, p) && !taken(p)) { at = p; break; }
      }
      if (!at) { ev.push({ type: 'manual', actor: t.id, name: 'Teleport', text: `${t.name} cannot arrive where it meant to, and the engine found no unoccupied space near it. The DM places it.` }); return true; }
    }
  }
  // Magic Circle: "If the creature tries to use teleportation ... to [enter], it must first succeed on a Charisma saving throw" (reversed, to leave). On a failure the teleportation does not happen: the spell, its slot
  // and the action are spent as cast (the engine has no other failed-teleport rule, so the cost stands), and nothing else of the step runs (not its `blocked` steps, which are for a collision). Only a circle the party
  // can know of is judged for a creature of the party (`circlesFor`).
  // Only when the creature itself tries to teleport (its own spell or feature, `own`), not when another creature's effect moves it.
  for (const fx of own ? circlesFor(s, t) : []) {
    if (!warded(s, fx, t, t.pos, at)) continue;
    const dc = fx.zone.src?.dc;
    if (dc === undefined) { ev.push({ type: 'manual', actor: t.id, name: fx.name, partial: true, text: `${fx.name} calls for a Charisma save from ${t.name} to teleport ${fx.zone.ward.reverse ? 'out of' : 'into'} the circle, and no DC is known. The DM applies it.` }); continue; }
    const { used, ...sv } = savingThrow(s, t, 'cha', dc, null, null, null, null, ev);
    ev.push({ type: 'save', id: t.id, abil: 'cha', dc, ...sv });
    useUp(s, ev, used ?? []);
    if (!sv.success) { ev.push({ type: 'note', id: t.id, text: `${fx.name} stops ${t.name}'s teleportation: it stays where it is` }); return true; }
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
    if (def.triggers?.some((x) => x.on === 'enter' && x.from.includes(o.state)) && Math.abs(objectZ(s, o) - at.z) <= STEP_MAX && footprint(t, at, G).some((f) => G.dist(f, o.at) === 0))
      ev.push({ type: 'manual', actor: t.id, name: objectName(o), partial: true, text: `${t.name} teleported onto ${objectName(o)}. Whether it goes off is the DM's call.` });
  }
  lookAround(s, ev, [t]);
  if (s.encounter?.arena[col(at)] && !inFight(s, t.id) && !t.dead && !step.noJoin) joinEncounter(s, t, ev);
  return true;
}

// ---------- Meld into Stone (docs/specs/rules-expansion.md, "Build notes: wave 4 part 10") ----------
// The `meld` step: the caster (`t`) is merged with the wall the cast aimed at (`f.src.wall`) for as long as the spell's effect lasts. The mark is `melded`
// on the creature: { fx, level, x, y, at }, the effect that holds it, the point on the wall, and the space it went in from (its `pos` stays there; it
// fills no space, see `living`). It has no hiding left to keep, and a hold or a ride is not part of this (the cast refuses a mounted caster). The effect's
// part (`meld: true`) is what brings it out again when the effect ends, by whatever means (`ON.meldEnd` below). False when there is no effect to hang it on.
function meldInto(s, t, f, ev) {
  const fx = f.src.fx ? effectsOf(s).find((x) => x.id === f.src.fx) : null, w = f.src.wall;
  if (!fx || !w || t.melded) return false;
  delete t.hiding;
  if (t.follow) unfollow(s, t, ev);
  t.melded = { fx: fx.id, level: w.level, x: w.x, y: w.y, at: { q: t.pos.q, r: t.pos.r, z: t.pos.z } };
  fx.parts.push({ target: t.id, meld: true });
  ev.push({ type: 'note', id: t.id, text: `${t.name} steps into the stone` });
  return true;
}
// Out of the stone, by any ending (time, Dispel Magic, leaving, expelled): back at the space it went in from, or the nearest unoccupied one, by the
// rules of any other arrival (`teleport`: a creature standing there that its side does not know of is shared with and left to the DM).
ON.meldEnd = (s, ev, t, m) => {
  ev.push({ type: 'note', id: t.id, text: `${t.name} comes out of the stone` });
  // One the party does not know of comes out unseen: joining the fight's order would reveal it (joinEncounter), so it does not, and the DM is told.
  const hush = t.side !== 'party' && (t.hidden || unknown(s, t));
  teleport(s, t, { said: 'came out of the stone into', name: 'Meld into Stone', noJoin: hush }, m.at, ev);
  if (hush && s.encounter && !inFight(s, t.id)) ev.push({ type: 'manual', actor: null, name: 'Meld into Stone', partial: true, text: `${t.name} came out of the stone unseen, and is not in the fight's order: joining it would tell the players it is there. The DM adds it (joinFight) when it shows itself.` });
};
// A cut of the wall (Stone Shape's `cut` step; `cut` is the stretch taken out, `{ level, a, b }`): a creature merged with the stone within 2.5 feet of
// it is expelled: the spell ends, it comes out at the nearest unoccupied space, takes 6d6 Force damage and is Prone. Any other damage or destruction of
// the stone is the DM's (the spell's manual note says so).
export const MELD_NEAR = 2.5;
function expelMelded(s, cut, f, ev) {
  for (const t of Object.values(s.entities)) {
    const m = t.melded;
    if (!m || m.level !== cut.level || distToSegment([m.x, m.y], [cut.a, cut.b]) > MELD_NEAR + 1e-6) continue;
    const fx = effectsOf(s).find((x) => x.id === m.fx);
    ev.push({ type: 'note', id: t.id, text: `${t.name} is thrown out of the stone` });
    if (fx) endEffect(s, ev, fx, `${f.src.name} cut the stone around ${t.name}`);
    else { delete t.melded; ON.meldEnd(s, ev, t, m); }
    const r = roll(s, '6d6');
    ev.push({ type: 'note', id: t.id, text: `Expelled from the stone: 6d6 Force damage (${r.total})` });
    condition(s, t, 'prone', ev);                                      // first: one taken to 0 Hit Points by the damage is Prone as well
    damage(s, t, r.total, 'force', ev);
  }
}

// ---------- encounters (joining one, rollInit and fightPlace are in world.js) ----------

// `opts` (E23, a hostile cast that lands first; casting.js): `keep`, the creatures whose Reaction, taken during that cast,
// stays spent until their first turn; `owed`, what a caster's first turn goes without ({ [id]: { time, slot, spell } }).
// A fight happens only on a battle map (docs/specs/travel.md, Decision 7): while the table is on a navigation or scene
// node, the map in play is its holding map (map.js, holdingMap), which is no battlefield. Every way a fight starts comes
// through startEncounter (the DM's call, `autoEngage` on a walk, an attack or hostile cast outside a fight, `engage`), so
// it is refused here. Not a RuleError: some callers take a refusal of the fight as "no fight" and carry on (a hostile cast
// that lands first, casting.js); this must refuse the whole action instead, and apply() puts the game back as it was
// before the action and answers with the sentence (engine.js).
export class NotBattleMap extends Error {}
export const NOT_BATTLE = 'This is not a battle map. Choose one to fight on.';
export function startEncounter(s, center, ev, radius = ARENA_RADIUS, walked = null, opts = null) {
  if (s.map?.holding) throw new NotBattleMap(NOT_BATTLE);
  const arena = {}, G = gridOf(s.map);
  for (const h of G.range(center, radius)) if (hasColumn(s.map, h)) arena[col(h)] = 1;    // a fight locks whole columns, every level
  catchUp(s, arena, walked, ev);                         // those walking with the party are with it
  // Whatever is somewhere the party has not seen stays out of it until that place is revealed.
  const who = Object.values(s.entities).filter((e) => !e.dead && (e.side === 'party' || !e.melded)).filter((e) => arena[col(e.pos)] && (e.side === 'party' || !unseenAt(s.map, e.pos)));
  if (!who.length) fail('Nobody is close enough to fight here.');
  if (!who.some((e) => e.side === 'party')) fail('No party creature is in range of the fight.');   // foes alone would end it at once as a defeat (#771)
  for (const e of who) { if (!opts?.keep?.has(e.id)) e.reactionUsed = confusedNow(s, e); reveal(s, e, ev); }   // nobody fights unseen
  s.encounter = {
    id: nextFight(s), center, radius, arena, round: 1, turn: -1, budget: null, flags: {},
    order: null, where: fightPlace(s, center), ...(opts?.owed ? { owed: structuredClone(opts.owed) } : {}),
  };
  // Each rolls, in the order the creatures are kept, but a companion whose turn is its master's and whose master
  // is in the fight: it takes the master's count, straight after it (Decision 3). One whose master is not here rolls.
  // Only where the party knows of both: else it rolls as an unbonded creature would (world.js, joinLead).
  // Straight after it, or straight before it where its master's player chose that (`bond.order`, A1): the start of
  // a fight is a round's start, so a choice waiting in `orderNext` is taken up first.
  takeUpOrders(s);
  const faces = {}, ids = new Set(who.map((e) => e.id)), m0 = who.filter((e) => !e.bond).map((e) => ({ id: e.id }));
  const behind = (e) => (ids.has(e.bond?.to) && !s.entities[e.bond.to].bond ? joinLead(s, m0, e)?.id ?? null : null);
  const slots = who.map((e) => (behind(e) ? { id: e.id, init: null, dex: e.abil.dex, [sideOf(e)]: behind(e) } : rollInit(s, e, faces)));
  for (const o of slots) if (tieOf(o)) o.init = slots.find((x) => x.id === tieOf(o)).init;
  s.encounter.order = initiativeSort(slots);
  ev.push({ type: 'encounterStart', fight: s.encounter.id, where: s.encounter.where, center, radius, order: s.encounter.order.map((o) => ({ ...o, ...faces[o.id] })) });
  for (const e of who) if (!behind(e)) ownCount(s, e, m0, ev);
  advanceTurn(s, ev);
}

// Start a fight big enough to hold both the attacker and a distant target.
export function engage(s, e, t, ev, walked = null, opts = null) {
  const G = gridOf(s.map), a = G.toWorld(e.pos), b = G.toWorld(t.pos), d = apart(s, e, t);
  startEncounter(s, G.fromWorld((a.x + b.x) / 2, (a.z + b.z) / 2), ev, Math.max(ARENA_RADIUS, Math.ceil(d / 2) + 1), walked, opts);
}

// ---------- Strike first (the table rule `strikeFirst`; docs/specs/table-ui.md, E23 as amended by #585) ----------
// Off (the SRD's way; a new table has it off): an attack, a hostile cast or a creature's harmful action outside a fight
// starts the fight and is not made. Everyone rolls Initiative, and the creature
// makes it on its turn. 'casts' or 'all' (house rules; see strikesFirst): it lands first, then the fight starts, in the
// same action, so one undo takes back both (casting.js, attacks.js).
// Does `e`'s harmful act at `targets` land first? `kind` is 'cast', 'attack' or 'act'. No fight on, and:
//   - 'all' (#585, new rule): one it is aimed at or catches is of another side (the DM's creature at the party, or a
//     party member at a foe), whoever sends it;
//   - 'casts' (the rule as #372 built it, kept byte for byte for tables saved before #585): the DM's cast, by a creature
//     not of the party, aimed at or catching a party member, while `autoEngage` is on;
//   - 'off' (or absent): never.
export function strikesFirst(s, e, targets, kind, ctx) {
  if (s.encounter) return false;
  const mode = s.settings?.strikeFirst ?? 'off';
  if (mode === 'all') return targets.some((t) => t && t.id !== e.id && hostile(e, t));
  if (mode === 'casts') return kind === 'cast' && ctx?.role === 'dm' && s.settings.autoEngage === true && e.side !== 'party' && targets.some((t) => t?.side === 'party');
  return false;
}
// Taken before the act does anything: where its events begin, whose Reaction was spent already, and who the party does
// not know of now (review of #594, M1: a hiding creature's own attack roll or Verbal component gives it away during the
// act, and its act must still be told as an unseen creature's).
export const strikeStart = (s, ev) => ({
  from: ev.length,
  used: new Set(living(s).filter((o) => o.reactionUsed).map((o) => o.id)),
  unknown: new Set(Object.values(s.entities).filter((o) => !o.object && unknown(s, o)).map((o) => o.id)),
});
// The act has run (its rolls, saves, damage, conditions, the reactions it allowed, a Counterspell that undid it): now the
// fight starts. Initiative is rolled as for any fight.
//   - What the party did not know of when the act began (until it is told of it during the act: found by a party
//     creature's senses, or revealed by being caught in it), or still does not know of at its end, stays unknown in its
//     events (`unseen`, which view.js reads and apply()'s record keeps): a hidden or hiding creature's attack or spell is
//     told as any unseen creature's is, and the fight's start then reveals it, as every fight does ("nobody fights
//     unseen", hidden-information.md section 5).
//   - A Reaction taken during the act stays spent until that creature's first turn in the fight (SRD "Reactions": "When
//     you take a Reaction, you can't take another one until the start of your next turn"), where a fight starting would
//     otherwise give it back.
//   - The fight is placed as the act would have placed it: round the actor for an area (`area`), else round the actor and
//     `target` (the first creature it was aimed at), where they stand now. If nobody is left to fight there, no fight
//     starts (startEncounter refuses before it changes anything, and that refusal is caught).
//   - `owed` (casting.js, CAST_TAKES_FIRST_ACTION): what the actor's first turn goes without.
export function thenFight(s, e, ev, lands, { area = false, target = null, owed = null } = {}) {
  // Unknown when the act began, until the party is told of it during the act (found by a party creature's senses, or
  // revealed by being caught in it); a creature that gives itself away by its own attack roll or spell is not told of
  // until the fight starts. Or still unknown at the end, as E23 had it. The actor is never "caught" by its own act (a
  // hidden caster in its own area stays unseen until the fight's start reveals it): only others are. A party creature's
  // senses finding the actor during the act do tell the party of it (the Hellish Rebuke a Blindsight finding allows).
  const still = new Set(lands.unknown ?? []);
  const hid = (id) => typeof id === 'string' && Object.hasOwn(s.entities, id) && (still.has(id) || unknown(s, s.entities[id]));
  for (const x of ev.slice(lands.from)) {
    if (((x.type === 'revealed' && x.id !== e.id) || (x.type === 'unhidden' && x.why === 'found')) && typeof x.id === 'string') still.delete(x.id);
    const ids = [...(hid(e.id) ? [e.id] : []), ...[x.id, x.actor, x.target, x.by, x.against, x.source, ...(Array.isArray(x.targets) ? x.targets : [])].filter(hid)];
    if (ids.length) x.unseen = [...new Set([...(Array.isArray(x.unseen) ? x.unseen : []), ...ids])];
  }
  const keep = new Set(living(s).filter((o) => o.reactionUsed && !lands.used.has(o.id)).map((o) => o.id));
  const opts = { keep, ...(owed ? { owed } : {}) };
  try {
    if (area || !target) startEncounter(s, e.pos, ev, undefined, null, opts); else engage(s, e, target, ev, null, opts);
  } catch (err) {
    if (!(err instanceof RuleError)) throw err;                     // "Nobody is close enough to fight here.": refused before anything changed
  }
}

export function endEncounter(s, ev, result) {
  for (const e of fighters(s)) {
    delete e.cond.dodging; delete e.cond.disengaged; e.reactionUsed = false;
    if (up(e)) delete e.cond.prone;                       // nothing stops you standing once the fight is over
  }
  // Stepping away is for a fight: whoever was set aside, or asked to be, is back when it ends.
  for (const e of Object.values(s.entities)) if (e.away) { delete e.away; ev.push({ type: 'back', id: e.id, why: 'fightOver' }); }
  ev.push({ type: 'encounterEnd', result, rounds: s.encounter.round, fight: s.encounter.id });
  refill(s, ev);                                       // a trench Control Water left to fill by the next round fills now (tides.js)
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
  settleOrder(s);
  // `idle` counts turns nobody can take (the dead, the down); two laps of them end the fight in a
  // stalemate. `auto` counts turns the engine settles for creatures set aside (stepping away, below):
  // after a whole lap of them nobody is present, so the next turn starts as any turn does and waits for the DM.
  let auto = 0;
  for (let idle = 0; idle < enc.order.length * 2 + 2;) {
    enc.turn++;
    if (enc.turn >= enc.order.length) { enc.turn = 0; enc.round++; s.clock += ROUND; newRound(s); stepTides(s, ev); roundStarted(s, ev); }
    const e = s.entities[enc.order[enc.turn].id];
    if (e && !e.dead && e.riding) mountOwed(s, e);
    if (!e || e.dead) { idle++; continue; }
    // A controlled mount has no turn of its own while it is ridden: it moves and acts on its rider's (stage C6a). Its
    // place is passed by when it has had its turn's worth this round, or when the rider steering it is still to come.
    if (enc.rode?.[e.id] === enc.round || riderToCome(s, e)) { idle++; continue; }
    // What its lasting effects do at the start of its turn comes first, for a creature that is down as for one that is up (Regenerate's Hit Point wakes it before its Death Saving Throw).
    let stepped = false;
    if (e.hp <= 0) {
      turnSteps(s, ev, KIT, e); stepped = true;
      if (e.hp <= 0 && !e.cond.stable) { deathSave(s, e, ev); checkEnd(s, ev); if (!s.encounter) return; }   // the last of the party may have died or become Stable
      if (e.hp <= 0) { idle++; continue; }
    }
    const how = auto < enc.order.length ? awayHow(s, e) : null, late = enc.moved?.[e.id];
    if (late?.turn && late.round === enc.round) {                       // a turn set aside part-way through goes on where it stopped
      enc.budget = late.turn.budget; enc.flags = late.turn.flags;
      delete late.turn;
      ev.push({ type: 'turn', id: e.id, round: enc.round });
      ev.push({ type: 'awayTurn', id: e.id, how: 'resumed', round: enc.round });
    } else if (how === 'hold') {                                         // its turn passes untaken; it may take it later this round
      auto++;
      enc.held = { ...(enc.held ?? {}), [e.id]: enc.round };
      ev.push({ type: 'awayTurn', id: e.id, how, round: enc.round });
      continue;
    } else if ((how === 'end' || how === 'endKeep') && late?.round !== enc.round && presentAfter(s, enc.turn)) {
      auto++;
      const i = enc.turn;
      moveToEnd(s, e.id, how === 'endKeep', null, ev);
      enc.turn = i - 1;                                                  // the next creature is now where it stood
      continue;
    } else beginTurn(s, e, ev, stepped);
    if (!how) return;
    if (how === 'standIn') { ev.push({ type: 'awayTurn', id: e.id, how, round: enc.round }); return; }
    // Set aside under `dodge`, or under `end`/`endKeep` with nowhere later to go: it takes the Dodge
    // action and stays where it is, and its turn ends.
    auto++;
    if (!awayTurn(s, e, ev)) return;
  }
  endEncounter(s, ev, 'stalemate');
}

// The start of a creature's turn: what ends then ends, its budget, its Reaction back, a recharge,
// standing up from Prone.
function beginTurn(s, e, ev, stepped = false) {
  const enc = s.encounter;
  enc.flags = {};
  const prompt = takeCommand(s, e);                                    // a commanded creature's turn is its master's player's (A2)
  turnStarted(s, ev, e, KIT);                                          // what ends "at the start of its turn" ends before it acts
  turnInZones(s, ev, KIT, e, 'turnStart');                            // a zone it starts its turn in (Web)
  if (!stepped) turnSteps(s, ev, KIT, e);                              // what its lasting effects do each turn (Heroism, Regenerate); already done if it was down
  const speed = speedOf(s, e), can = incapacitated(e) ? 0 : 1;        // an incapacitated creature gets its turn but cannot act
  enc.budget = { move: speed, action: can, bonus: can, dashes: 0 };     // `move` is walking feet left; other ways of moving are worked out from it
  e.reactionUsed = false;
  delete e.cond.dodging;
  ev.push({ type: 'turn', id: e.id, round: enc.round });
  noteRuns(s, e, 'turn');                                              // abilities the DM runs for this creature (todo.js)
  // E23 with CAST_TAKES_FIRST_ACTION (casting.js): the hostile cast that started the fight was this turn's action (or
  // Bonus Action) and its one spell slot.
  const owed = enc.owed?.[e.id];
  if (owed) {
    delete enc.owed[e.id];
    if (!Object.keys(enc.owed).length) delete enc.owed;
    if (enc.budget[owed.time] > 0) enc.budget[owed.time]--;
    if (owed.time === 'action') enc.flags[`magic:${e.id}`] = true;
    if (owed.slot) enc.flags.slot = true;
    ev.push({ type: 'note', id: e.id, text: `${e.name} cast ${owed.spell} as the fight began: that was this turn's ${owed.time === 'bonus' ? 'Bonus Action' : 'action'}.` });
  }
  if (prompt) ev.push(prompt);
  recharge(s, e, ev);
  mountTurnStarts(s, e, ev);
  // A ridden mount on its own turn: its turn's worth for the round (M1). So too one that could be a controlled mount (a
  // trained animal, a steed) and is ridden by no one now: mounted later this round and then put off its rider, it is
  // seated again (dismountOrder) and must not take a second turn (stage C6b).
  if (riderOf(s, e) || mountable(e)) (enc.rode ??= {})[e.id] = enc.round;
  if (e.cond.prone && speed > 0) {                                     // with a Speed of 0 it stays down
    delete e.cond.prone;
    enc.budget.move -= Math.floor(speed / 2 / FT) * FT;
    ev.push({ type: 'stood', id: e.id });
  }
  commandsOn(s, e, ev);                                                // Command: what it was told to do on this turn
  confusedOn(s, e, ev);                                                // Confusion: no Bonus Action, no Reaction, and a d10 for what it does
}

// Command (the `command` step, rolls.js): at the start of the creature's turn, the commands put on it before this turn are carried out. Halt, Grovel and Drop leave it no movement, no action and no Bonus Action (its Reaction is its own);
// Grovel also makes it Prone (after it has stood up, as it would have). Approach and Flee are its movement, which the engine cannot steer, and what a Drop lets go of is not kept: the DM does those, told here.
function commandsOn(s, e, ev) {
  const b = s.encounter.budget;
  for (const fx of [...effectsOf(s)]) for (const p of fx.parts) {
    if (p.ended || p.target !== e.id || !p.command || thisTurn(s, p.born)) continue;
    const by = s.entities[fx.source], caster = by?.name ?? 'the caster', what = COMMAND_WORDS[p.command];
    if (p.command === 'grovel') condition(s, e, 'prone', ev, { actor: fx.source, src: { name: fx.name } });
    if (['halt', 'grovel', 'drop'].includes(p.command)) { b.move = 0; b.action = 0; b.bonus = 0; }
    ev.push({ type: 'manual', actor: fx.source, name: fx.name, partial: true, text: `${e.name} ${p.command === 'halt' ? 'does not move and takes no action or Bonus Action this turn' : `must ${what} on this turn`}.` });   // for the DM alone (a note would name a creature the players may not see)
    if (p.command === 'approach') ev.push({ type: 'manual', actor: fx.source, name: fx.name, partial: true, text: `${e.name} moves toward ${caster} by the shortest, most direct route, and its turn ends if it moves within 5 feet of ${caster}. The engine does not walk it: the DM moves it.` });
    if (p.command === 'flee') ev.push({ type: 'manual', actor: fx.source, name: fx.name, partial: true, text: `${e.name} spends its turn moving away from ${caster} by the fastest means it has (it may Dash). The engine does not walk it: the DM moves it.` });
    if (p.command === 'drop') ev.push({ type: 'manual', actor: fx.source, name: fx.name, partial: true, text: `${e.name} drops whatever it is holding, then its turn ends (the engine has taken its movement, action and Bonus Action). The DM puts what it held on the ground.` });
  }
}

// Confusion (the `confuse` step, rolls.js): at the start of the creature's turn it has no Bonus Action and (its Reaction marked spent again, as the turn gave it back) no Reaction, and the engine rolls 1d10 for its behavior.
// 1: it uses all its movement to move in a direction (1d4: north, east, south, west) and takes no action: the engine takes the movement and the action, and the DM walks it (the engine does not steer a creature on a compass heading).
// 2 to 6: it neither moves nor acts: the engine takes the movement and the action. 7 and 8: it does not move, and it takes the Attack action for one melee attack against a random creature within reach: the engine takes the movement and
// picks the creature (one draw, whatever the number of creatures, so the dice do not depend on who is near) from those in its longest melee reach that the party knows of (never one hidden from it: a pick must not tell a player of a creature it
// cannot see; the DM adds any it hides to the pool), and the attack handler allows the one attack at that creature only (`confusedFoe`, attacks.js). 9 and 10: it chooses. All told to the DM alone (`partial` manual: a note would name a creature).
const COMPASS = ['north', 'east', 'south', 'west'];
// On a 7 or 8 the only action a Confused creature may take is the one melee attack (`attack`, and `act` at the creature chosen); anything else is refused, with the reason. `what`: the action it asked for.
export function confusedOnly(s, e, what) {
  if (!s.encounter || current(s) !== e.id || !s.encounter.flags?.[`confused:${e.id}`]) return;
  const foe = confusedFoe(s, e);
  fail(foe ? `${e.name} is Confused: this turn it can only make one melee attack at ${s.entities[foe]?.name ?? 'the creature the dice chose'}, so it cannot ${what}.`
    : `${e.name} is Confused: the dice called for one melee attack, but no creature it may attack is within its reach, so it takes no action this turn and cannot ${what}.`);
}
export const confusedFoe = (s, e) => {
  if (!s.encounter || current(s) !== e.id) return null;
  const pre = `confusedFoe:${e.id}:`, k = Object.keys(s.encounter.flags ?? {}).find((x) => x.startsWith(pre));
  return k ? k.slice(pre.length) : null;
};
function confusedOn(s, e, ev) {
  const enc = s.encounter, b = enc.budget;
  for (const fx of [...effectsOf(s)]) for (const p of fx.parts) {
    if (p.ended || p.target !== e.id || !p.confuse) continue;
    e.reactionUsed = true; p.confuse.had = false; b.bonus = 0;
    const r = die(s, 10), draw = rand(s), name = fx.name;
    // A party creature's own player is told the roll and what it may do (a plain `note`: the pick is only among creatures the party knows of, so it names no one hidden); the DM's `manual` stays.
    const tell = (text, plain) => { ev.push({ type: 'manual', actor: fx.source, name, partial: true, text }); if (e.side === 'party') ev.push({ type: 'note', id: e.id, text: `${e.name} is Confused and rolled ${r} on the d10: ${plain}` }); };
    if (r === 1) {
      const way = COMPASS[die(s, 4) - 1], feet = b.move;
      b.move = 0; b.action = 0;
      return tell(`${e.name} is Confused and rolled 1 on the d10: it takes no action and uses all its movement (${feet} feet) to move ${way}. The engine has taken its movement and action; it does not steer a creature on a compass heading, so the DM moves it ${way}, as far as it can go.`, `it takes no action and uses all its movement to move ${way}; the DM moves it.`);
    }
    if (r <= 6) {
      b.move = 0; b.action = 0;
      return tell(`${e.name} is Confused and rolled ${r} on the d10: it does not move and takes no action (the engine has taken its movement, action and Bonus Action).`, 'it does not move and takes no action.');
    }
    if (r <= 8) {
      b.move = 0;
      enc.flags[`confused:${e.id}`] = true;
      const reach = Math.max(FT, ...(e.attacks ?? []).filter((a) => a.type === 'melee').map((a) => a.reach ?? FT), ...(e.actions ?? []).map((a) => a.target?.creature?.reach ?? 0));
      const pool = living(s).filter((o) => o.id !== e.id && !o.object && inFight(s, o.id) && !unknown(s, o) && apart(s, e, o) * FT <= reach && unblocked(s, e, o)).sort((x, y) => (x.id < y.id ? -1 : 1));
      const v = pool.length ? pool[Math.min(pool.length - 1, Math.floor(draw * pool.length))] : null;
      if (v) enc.flags[`confusedFoe:${e.id}:${v.id}`] = true; else b.action = 0;       // nobody it may attack: it takes no action
      return tell(`${e.name} is Confused and rolled ${r} on the d10: it does not move, and takes the Attack action to make one melee attack against a random creature within reach. ${v ? `The engine picked ${v.name} from the ${pool.length} within ${reach} feet that the party knows of, and allows that one attack at it only; no spell or other action. The DM adds any creature the party does not know of to the pool and, if one is picked instead, makes the attack by hand.` : `No creature the party knows of is within ${reach} feet, so the engine has taken its action; if the DM finds one the party does not know of, the DM makes its one attack by hand.`}`, v ? `it does not move, and its one action is a single melee attack at ${v.name}; nothing else.` : 'it does not move and takes no action.');
    }
    return tell(`${e.name} is Confused and rolled ${r} on the d10: it chooses its behavior this turn, with no Bonus Action and no Reaction.`, 'it chooses what to do, with no Bonus Action and no Reaction.');
  }
}

// A command (`command`, companions.js; Decision 6, amendment A2) is for the commanded creature's next turn: at the
// start of that turn it is stamped with it (`commanded.turn`), and for that turn `ownerOf` gives the master's player
// (shared.js). Spent once that turn is over: the start of its next turn clears it, as it does a command given in
// another fight or outside one (`at` not of this fight), so a command never carries into a later fight. Returns the
// prompt for the master's player ("Brenna's Zombie is yours this turn."), or null when the master has no player.
function takeCommand(s, e) {
  const b = e.bond, c = b?.commanded;
  if (b?.orders !== 'command' || !c || typeof c !== 'object') return null;
  const key = turnKey(s), fight = typeof c.at === 'string' ? c.at.slice(0, c.at.indexOf(':')) : null;
  if (c.turn === key) return null;
  if (c.turn !== undefined || fight !== String(s.encounter.id)) { b.commanded = null; return null; }
  c.turn = key;
  const m = s.entities[b.to], to = ownerOf(s, m);
  if (!to) return null;
  const text = `${e.name.startsWith(`${m.name}'s `) ? e.name : `${m.name}'s ${e.name}`} is yours this turn.`;
  return { type: 'commandedTurn', id: e.id, by: m.id, to, ...(c.order ? { order: c.order } : {}), text };
}

// The end of the current creature's turn, after what its player chose (endTurn, attacks.js, or a
// turn played for a creature set aside). `pick`: the condition its Self-Restoration ends, if it was
// given. False if the fight ended.
export function finishTurn(s, e, ev, pick = undefined) {
  const sc = (e.feats ?? []).find((f) => f.selfCure), can = sc ? sc.selfCure.conditions.filter((c) => e.cond[c]) : [];
  delete e.cond.disengaged;
  // Stealth Attack: still hidden after its attack only if it ends the turn behind Three-Quarters or
  // Total Cover from every enemy that is up.
  if (s.encounter.flags[`stealth:${e.id}`] && e.hiding && living(s).some((o) => up(o) && hostile(o, e) && !['threeQuarters', 'total'].includes(coverOf(s, o, e)))) unhide(s, e, ev, 'attack');
  if (can.length) {
    const c = pick ?? (can.length === 1 ? can[0] : null);
    if (c) { ev.push({ type: 'std', id: e.id, action: sc.name }); cure(s, e, [c], ev); }
    else ev.push({ type: 'manual', actor: e.id, name: sc.name, text: `${e.name} is ${can.map(conditionName).join(' and ')}. ${sc.name} ends one of them at the end of its turn, its player's choice; none was sent, so the DM removes the one the player picks.` });
  }
  turnInZones(s, ev, KIT, e, 'turnEnd');                              // a zone it ends its turn in (Moonbeam, Spirit Guardians)
  // A controlled mount's turn is its rider's (stage C6a): its Disengage ends, and what ends at the end of its turn ends.
  const m = ridden(s, e);
  if (m) { delete m.cond.disengaged; turnInZones(s, ev, KIT, m, 'turnEnd'); }
  checkEnd(s, ev);
  if (!s.encounter) return false;
  turnEnded(s, ev, e, KIT);
  if (m && s.encounter && Object.hasOwn(s.entities, m.id)) turnEnded(s, ev, m, KIT);
  return !!s.encounter;
}

// ---------- riding (docs/specs/companions.md, Decision 8; stage C6a) ----------

// A controlled mount's Dash, Disengage or Dodge (stage C6a; SRD "Controlling a Mount": its only three action options):
// on its rider's turn, from its own action (`budget.mount`), never the rider's and never as a Bonus Action. Its Dash adds
// its Speed to its own movement; its Disengage lasts the rest of the turn; its Dodge until the start of its next turn,
// which is its rider's (mountTurnStarts). Used by movement.js (dash, disengage) and attacks.js (dodge).
export function mountAct(s, m, a, what, ev) {
  const r = steering(s, m);
  !a.bonus || fail(`A controlled mount's ${what} takes its action.`);
  inFight(s, m.id) || fail(`${m.name} is outside the battle.`);
  const bud = turnBudget(s, m) || fail(`${m.name} acts on ${r.name}'s turn.`);
  up(m) || fail(`${m.name} is down.`);
  const by = incapacitated(m);
  !by || fail(`${m.name} is ${by} and can't act.`);
  bud.action >= 1 || fail(`${m.name} has already used its action this turn.`);
  bud.action--;
  if (what === 'Dash') { bud.move += speedOf(s, m); bud.dashes = (bud.dashes | 0) + 1; } else if (what === 'Dodge') m.cond.dodging = {}; else m.cond.disengaged = {};
  ev.push({ type: 'std', id: m.id, action: what });
}

// The controlled mount this creature rides in the fight going on, or null.
const ridden = (s, r) => { const m = r?.riding?.controlled ? mountOf(s, r) : null; return m && steering(s, m) === r && inFight(s, m.id) ? m : null; };
// Is this a controlled mount whose rider, steering it, has its turn still to come this round? Its own place is then
// passed by: its turn's worth is on its rider's turn. One whose rider's turn has gone by without giving it its worth
// (the rider was down or Incapacitated then) takes its own turn (fix round 2, M1).
const riderToCome = (s, m) => {
  const r = steering(s, m), enc = s.encounter;
  return !!r && inFight(s, r.id) && enc.order.findIndex((o) => o.id === r.id) > enc.turn;
};
// The rider's place has come round and it can't steer its controlled mount now (down, Incapacitated): a mount that has
// not had its turn's worth this round and whose own place has gone by (passed by, waiting for its rider) is seated
// straight behind its rider, so that it takes its own turn this round (fix round 2, M1). Nobody else's place moves.
function mountOwed(s, r) {
  const enc = s.encounter, m = r.riding?.controlled ? mountOf(s, r) : null;
  if (!m || m.dead || steering(s, m) === r || enc.rode?.[m.id] === enc.round || enc.moved?.[m.id]) return;
  const mi = enc.order.findIndex((o) => o.id === m.id), ri = enc.order.findIndex((o) => o.id === r.id);
  if (mi < 0 || ri < 0 || mi > ri) return;
  const [o] = enc.order.splice(mi, 1);
  enc.order.splice(enc.order.findIndex((x) => x.id === r.id) + 1, 0, o);
  enc.turn = enc.order.findIndex((x) => x.id === r.id);
}
// The owner's question (re-review of #350, M2; open): a controlled mount mounted after it has had its turn this round,
// its own or on another rider's. true: it carries its new rider but gets no more this round, one turn's worth a round
// (fix round 1, M1). false: it moves and acts again, as the SRD's "A controlled mount can move and act even on the turn
// that you mount it" reads with no exception. Either answer is this one constant (riding.test.js tests both).
export const MOUNT_ONCE_A_ROUND = true;
// What a controlled mount has on its rider's turn (`budget.mount`): its Speed, and one action, for Dash, Disengage
// or Dodge ("it has only three action options during that turn"). None if it is Incapacitated.
export const mountBudget = (s, m) => ({ move: speedOf(s, m), action: incapacitated(m) ? 0 : 1, dashes: 0 });
// One turn's worth a round for a mount, however many riders it has in the round (fix round 1, M1): a mount that has had
// its turn this round, its own (its place in the order is behind the turn going on, so it has come: settleOrder keeps
// that true) or on a rider's (`enc.rode`), gets nothing more this round. Mounted after that it carries its rider but
// moves and acts again only on its rider's next turn.
export function mountHadTurn(s, m) {
  const enc = s.encounter;
  if (!enc) return false;
  if (enc.rode?.[m.id] === enc.round) return true;
  const i = enc.order.findIndex((o) => o.id === m.id);
  return i >= 0 && i < enc.turn;
}
// The turn's worth a controlled mount has on its rider's turn: its budget, marking the round as its turn's (`enc.rode`),
// or none if it has had its turn this round.
export function mountTurnBudget(s, m, once = MOUNT_ONCE_A_ROUND) {
  const enc = s.encounter;
  if (once && mountHadTurn(s, m)) return { move: 0, action: 0, dashes: 0 };
  (enc.rode ??= {})[m.id] = enc.round;
  return mountBudget(s, m);
}
// The rider's turn begins: so does its controlled mount's, which "moves on your turn". What ends at the start of the
// mount's turn ends, a zone it starts in works on it, its Reaction comes back, a recharge, and its budget.
function mountTurnStarts(s, r, ev) {
  const m = ridden(s, r);
  if (!m) return;
  turnStarted(s, ev, m, KIT);
  turnInZones(s, ev, KIT, m, 'turnStart');
  turnSteps(s, ev, KIT, m);
  if (!s.encounter || !Object.hasOwn(s.entities, m.id) || steering(s, m) !== r) return;
  const enc = s.encounter;
  if (enc.rode?.[m.id] === enc.round) { enc.budget.mount = { move: 0, action: 0, dashes: 0 }; return; }   // it had its turn this round (M1)
  m.reactionUsed = false;
  delete m.cond.dodging;
  recharge(s, m, ev);
  (enc.rode ??= {})[m.id] = enc.round;
  enc.budget.mount = mountBudget(s, m);
  // Standing up from Prone costs half its Speed, as at the start of any creature's turn (fix round 1, L4). Whether its
  // rider falls off is C6b's (the DM is told, settleRiders).
  const speed = speedOf(s, m);
  if (m.cond.prone && speed > 0) {
    delete m.cond.prone;
    enc.budget.mount.move -= Math.floor(speed / 2 / FT) * FT;
    ev.push({ type: 'stood', id: m.id });
  }
}
// A controlled mount's rider got down (or the pair came apart) in the fight: "The Initiative of a controlled mount
// changes to match yours when you mount it", so its place is now straight behind its rider (and the rider's `after`
// companions), on the rider's count, unless its bond ties it to its master (Decision 3, A1: the bond keeps its place).
// A mount that has had its turn's worth this round (`enc.rode`) takes no other. One that has not (its rider's turn went
// by while it could not steer, and the DM took it down) still takes its turn this round: if the place behind its rider
// has gone by, it is seated straight behind the creature whose turn it is (fix round 2, M1).
export function dismountOrder(s, m, r) {
  const enc = s.encounter;
  if (!enc) return;
  const cur = enc.turn >= 0 ? current(s) : null;
  const ri = enc.order.findIndex((o) => o.id === r.id), o = enc.order.find((x) => x.id === m.id);
  if (!o || ri < 0 || enc.moved?.[m.id] || enc.moved?.[r.id]) return;
  if (cur === m.id) return;                                         // its own turn is going on: it keeps its place (C6b)
  const had = enc.rode?.[m.id] === enc.round, mi = enc.order.indexOf(o);
  if (tieOf(o) && (had || mi > enc.turn)) return;                   // the bond keeps its place (A1)
  if (!had && mi > enc.turn && ri < enc.turn) return;               // its own place is still to come: it takes its turn there
  enc.order.splice(mi, 1);
  let i = enc.order.findIndex((x) => x.id === r.id);
  if (!had && i < enc.order.findIndex((x) => x.id === cur)) i = enc.order.findIndex((x) => x.id === cur);
  const lead = enc.order[i].id;
  while (i + 1 < enc.order.length && enc.order[i + 1].after === lead) i++;
  if (lead === r.id) o.init = enc.order.find((x) => x.id === r.id).init;
  enc.order.splice(i + 1, 0, o);
  if (cur) enc.turn = enc.order.findIndex((x) => x.id === cur);
}
// ---------- falling off, and the pair moved (stage C6b; SRD 5.2.1 "Falling Off", 2126-2133) ----------
// "If an effect is about to move your mount against its will while you're on it, you must succeed on a DC 10 Dexterity
// saving throw or fall off, landing with the Prone condition in an unoccupied space within 5 feet of the mount. While
// mounted, you must make the same save if you're knocked Prone or the mount is."
export const RIDE_DC = 10;
// Could this creature be a controlled mount (a trained animal, a steed; Decision 8)? Only such a mount's place in the order moves.
const mountable = (e) => (CONTENT.monsters[e.tpl]?.mount === 'trained' && !e.form) || e.bond?.mount === 'controlled';
// The ride ends: the two fields go, a controlled mount takes its place in the order back (dismountOrder), the rider's
// turn loses the mount's budget. Then `dismounted` (at where the rider is now, which the caller has set).
function unride(s, r, m) {
  const controlled = r.riding?.controlled === true;
  delete r.riding;
  if (m && m.rider === r.id) delete m.rider;
  if (m && controlled && s.encounter && inFight(s, m.id) && !m.dead) dismountOrder(s, m, r);
  if (s.encounter?.budget?.mount && current(s) === r.id) delete s.encounter.budget.mount;
}
const offEvent = (r, id, why, more = {}) => ({ type: 'dismounted', id: r.id, mount: id, at: { q: r.pos.q, r: r.pos.r, z: r.pos.z ?? 0 }, why, ...more });
// A creature left with nothing under it falls now, as the gravity pass after every action would make it (engine.js):
// a rider whose flying mount vanished, teleported away or was moved off from under it.
function drop(s, e, ev) {
  if (ground(s.map, e.pos) || aloft(s, e)) return;
  const sf = under(s.map, e.pos);
  if (!sf) return;
  const feet = e.pos.z - sf.z;
  const top = { ...e.pos };
  e.pos = { q: e.pos.q, r: e.pos.r, z: sf.z };
  if (e.dead) return;                                                  // a body comes down with it, as the gravity pass puts it (no damage)
  fall(s, e, feet, ev, null, top);
  lookAround(s, ev, [e]);
  checkEnd(s, ev);
}
// The rider's DC 10 Dexterity save against falling off. True if it stays on.
function staysOn(s, r, ev) {
  const { used, ...sv } = savingThrow(s, r, 'dex', RIDE_DC, null, null, null, null, ev);
  ev.push({ type: 'save', id: r.id, abil: 'dex', dc: RIDE_DC, ...sv, against: 'Falling Off' });
  useUp(s, ev, used ?? []);
  return sv.success;
}
// The rider comes off: into the unoccupied space within 5 ft of its mount nearest it, chosen by what its side knows
// (world.js, riderLanding). A space held by a creature the party did not know of: the rider finds it, as a move onto
// it would (revealed, unhidden), and the next space is chosen with it known. `prone`: it lands Prone (falling off);
// otherwise it is set down on its feet (it no longer fits on its mount). False, with the DM told, if there is no space:
// it stays on.
function putOff(s, r, m, why, ev, prone, from = null) {
  let spot = riderLanding(s, r, m, null, from);
  for (let n = 0; spot?.lurker && n < 50; n++) { reveal(s, spot.lurker, ev); unhide(s, spot.lurker, ev, 'found', r); spot = riderLanding(s, r, m, null, from); }
  // In the air (a flying mount) there is nothing within 5 ft to land on: it comes off where it is and falls, as from a
  // flying mount that vanishes (fix round 1 of #363, M3): the fall's damage, and Prone, by the gravity pass's own rules.
  if (!spot && prone && !ground(s.map, m.pos)) {
    unride(s, r, m);
    ev.push(offEvent(r, m.id, why, { fell: true }));
    if (up(r)) condition(s, r, 'prone', ev); else r.cond.prone = {};
    drop(s, r, ev);
    return true;
  }
  if (!spot) {
    ev.push({ type: 'manual', actor: null, name: 'Mounted combat', partial: true,
      text: `${r.name} ${prone ? 'falls off' : 'can no longer ride'} ${m.name}, but there is no unoccupied space within 5 ft of ${m.name} for ${r.name} to land in, so ${r.name} stays on. The DM places ${r.name}${prone ? ' (Prone)' : ''} if room is made.` });
    return false;
  }
  const zonesBefore = snapshot(s);
  unride(s, r, m);
  r.pos = { ...spot.p };
  ev.push(offEvent(r, m.id, why, prone ? { fell: true } : {}));
  if (prone) { if (up(r)) condition(s, r, 'prone', ev); else r.cond.prone = {}; }
  entered(s, ev, KIT, zonesBefore);
  lookAround(s, ev, [r]);
  return true;
}
// One creature of a pair teleports (SRD 5.2.1 "Teleportation", 34458-34461: "If you're touching another creature when
// you teleport, that creature doesn't teleport with you unless the teleportation effect says otherwise."), so the ride
// ends. Called before it goes; `after` is run once it has, and says where the rider is.
export function teleportApart(s, t, ev) {
  const m = mountOf(s, t), r = m ? t : riderOf(s, t);
  if (!r) return null;
  const mount = m ?? t;
  unride(s, r, mount);
  return () => { ev.push(offEvent(r, mount.id, 'teleport')); if (r !== t) drop(s, r, ev); };
}
// After every action (from settleBonds): the pairs are kept whole, and what the SRD says about falling off is done.
// - A mount gone (vanished, dismissed, removed) or dead: its rider is down from it where it stands (`gone`), and falls
//   if that is in the air (a flying mount's rider).
// - The two not on one anchor (the DM set one down elsewhere): the ride ends (`apart`) and the DM is told; a rider left
//   in the air falls.
// - A rider or mount knocked Prone ("While mounted, you must make the same save if you're knocked Prone or the mount
//   is"): the DC 10 Dexterity save once (`riding.told` until neither is Prone); on a failure the rider falls off, Prone
//   (`fell`, why `prone`). A rider at 0 Hit Points is Unconscious and Prone, so it fails the save and falls.
// - A rider no longer smaller than its mount (one grew or shrank): it can't be carried any more (SRD 2101-2103: "at
//   least one size larger"), so it is set down beside it, on its feet (why `size`).
// The rider's footprint follows the mount's size.
export function settleRiders(s, ev) {
  for (const e of Object.values(s.entities)) if (e.riding) settleRide(s, e, ev);
  for (const m of Object.values(s.entities)) if (m.rider !== undefined && !(typeof m.rider === 'string' && s.entities[m.rider]?.riding?.on === m.id)) delete m.rider;
}
const rank = (x) => Object.keys(SIZES).indexOf(SIZES[x.size] ? x.size : 'medium');
export function settleRide(s, e, ev) {
  if (!e.riding) return;
  const id = e.riding.on, m = typeof id === 'string' && Object.hasOwn(s.entities, id) ? s.entities[id] : null;
  const whole = !!m && m.rider === e.id && !m.vanished && !m.dead && !e.dead && !e.vanished;
  const split = whole && (m.pos.q !== e.pos.q || m.pos.r !== e.pos.r || (m.pos.z ?? 0) !== (e.pos.z ?? 0));
  if (!whole || split) {
    unride(s, e, m);
    ev.push(offEvent(e, id, split ? 'apart' : 'gone'));
    if (split) ev.push({ type: 'manual', actor: null, name: 'Mounted combat', partial: true,
      text: `${e.name} and ${m.name} were set down apart, so ${e.name} is no longer riding. If ${e.name} should have stayed on, the DM mounts ${e.name} again.` });
    drop(s, e, ev);
    return;
  }
  if (e.riding.size !== m.size && SIZES[m.size]) e.riding.size = m.size;
  // Bonded to take commands while ridden: no longer a controlled mount (fix round 1, M3), so the ride says so.
  if (e.riding.controlled && m.bond?.orders === 'command') {
    e.riding.controlled = false;
    if (s.encounter?.budget?.mount && current(s) === e.id) delete s.encounter.budget.mount;
  }
  if (rank(m) < rank(e) + 1) { if (!e.riding.cramped) { if (!putOff(s, e, m, 'size', ev, false)) e.riding.cramped = true; } return; }
  if (e.riding.cramped) delete e.riding.cramped;
  // `told` says which knock-downs have been saved against: 'r' the rider's, 'm' the mount's (true, from C6a saves: both).
  // A new one, of the other, is saved against again (fix round 1 of #363, L2).
  const now = `${e.cond?.prone ? 'r' : ''}${m.cond?.prone ? 'm' : ''}`, had = e.riding.told === true ? 'rm' : typeof e.riding.told === 'string' ? e.riding.told : '';
  if ([...now].some((c) => !had.includes(c))) {
    e.riding.told = now;
    if (!staysOn(s, e, ev)) putOff(s, e, m, 'prone', ev, true);
  } else if (!now && e.riding.told !== undefined) delete e.riding.told;
  else if (now && e.riding.told !== true && now !== had) e.riding.told = now;
}

// ---------- stepping away (docs/specs/table-ui.md, "E20: stepping away") ----------
// A table convenience the SRD has no rule for (it has no "delay your turn"): a creature whose player
// has stepped away (a break, a phone call, a lost connection) is set aside in the turn order, and the
// table rule `away` says what becomes of its turns while it is (SETTING_TEXT.away, dm.js):
//   dodge    (the default) it takes the Dodge action on its turn and stays where it is;
//   end      its turn moves to the end of the round, its place given back next round;
//   endKeep  the same, and it keeps the place at the end;
//   hold     its turn passes untaken; back within the round, it takes it after the turn going on;
//   standIn  a stand-in plays it (the client's monster AI, ai.js; the engine plays nothing itself).
// A creature moved to the end that is still away there, or that has no one present after it, takes
// the Dodge action. The engine never sets anyone aside by itself: only the DM or the creature's player.
export const AWAY = ['dodge', 'end', 'endKeep', 'hold', 'standIn'];
// What is done with this creature's turns now: one of AWAY, or null if it is present (or has only asked to step away).
export const awayHow = (s, e) => (e?.away && !e.away.asked ? e.away.how : null);

// Is anyone after this place in the order who will take a turn of their own?
export function presentAfter(s, i) {
  return s.encounter.order.slice(i + 1).some((o) => { const x = s.entities[o.id]; return x && up(x) && !awayHow(s, x); });
}

// Put a creature's turn at the end of this round's order. `turn`: the budget and flags of a turn
// set aside part-way through, to go on with there.
export function moveToEnd(s, id, keep, turn, ev) {
  const enc = s.encounter, moved = (enc.moved ??= {});
  const n = Math.max(0, ...Object.values(moved).map((m) => m.n ?? 0)) + 1;
  moved[id] = { n, keep, round: enc.round, ...(turn ? { turn } : {}) };
  ev.push({ type: 'turnMoved', id, to: 'end', keep, round: enc.round });
  settleOrder(s);
}

// Bring a creature whose turn was held this round back in, to take that turn after the one going on.
export function heldBack(s, e, ev) {
  const enc = s.encounter, cur = current(s);
  if (!enc || enc.held?.[e.id] !== enc.round || cur === e.id || !cur) return;
  delete enc.held[e.id];
  (enc.moved ??= {})[e.id] = { after: cur, keep: false, round: enc.round };
  ev.push({ type: 'turnMoved', id: e.id, to: 'next', round: enc.round });
  settleOrder(s);
}

// Lay the order out again from who was moved where: everyone else in the order as it stands, a creature
// taken back in after another just after it, then those moved to the end, first moved first. The turn stays
// with the creature whose turn it is. A creature joining the fight is put in without moving anyone
// (insertSlot, world.js), before those moved to the end; the order is sorted whole only at the start of a
// fight and at a round start that gives a place back (newRound, below), and this then puts the moved ones back.
export function settleOrder(s) {
  const enc = s.encounter, moved = enc?.moved;
  if (!moved) return;
  // A stamp from before state version 22 names a place in the order (durations.js, thisTurn): name it by
  // its creature before the places move, so it still means that creature's turn after.
  for (const fx of effectsOf(s)) {
    for (const p of fx.parts) if (p.born !== undefined) p.born = restamp(enc, p.born);
    if (fx.zone?.last) for (const k of Object.keys(fx.zone.last)) fx.zone.last[k] = restamp(enc, fx.zone.last[k]);
  }
  const cur = enc.turn >= 0 ? current(s) : null;
  for (const id of Object.keys(moved)) if (!enc.order.some((o) => o.id === id)) delete moved[id];
  // A creature taken back in after another (heldBack: `after`) is seated once, when it comes back, and from then
  // on stays where it stands for the rest of the round (`placed`): seating it again behind its anchor on every
  // later turn would carry it with the anchor when a companion's place changes (a bond, a free), past creatures
  // that have had their turn, and give them a second one (review of #317, round 2, B1 and B2).
  // A creature taken back in while the creature whose turn it is was moved to the end of the round (`end`,
  // `endKeep`) is seated straight behind it in that end block, as one moved there right after it: seated in
  // initiative order it would sit behind the turn, among those who have had theirs, and lose its own (#320).
  // Every creature that is up and stays up acts once a round: those before the turn have acted, those after
  // it have not, so a creature brought back in goes after the turn and nobody already past it moves.
  const atEnd = (id) => moved[id] && !moved[id].after && !moved[id].placed && enc.order.some((o) => o.id === id);
  // An anchor that is itself waiting to be seated (two records of the old form, from a save) is seated first.
  const back = [], waiting = enc.order.filter((x) => moved[x.id]?.after);
  while (waiting.length) {
    const i = Math.max(0, waiting.findIndex((o) => !waiting.some((w) => w.id === moved[o.id].after)));
    back.push(...waiting.splice(i, 1));
  }
  for (const o of back) {
    // Behind the creature it was taken back in after, wherever the turn is: a record of the old form is kept all
    // round with the creature seated straight behind its anchor, so an anchor that has had its turn means the
    // creature has had its own too, or is taking it. Only if the anchor is gone is it seated behind the creature
    // whose turn it is, and if it is that creature itself, it stays where it stands.
    const gone = !enc.order.some((x) => x.id === moved[o.id].after);
    const anchor = !gone ? moved[o.id].after : cur !== o.id ? cur : null;
    if (!anchor) { delete moved[o.id].after; moved[o.id].placed = true; continue; }
    if (atEnd(anchor)) {
      const n = moved[anchor].n;
      for (const m of Object.values(moved)) if (m.n > n) m.n++;
      moved[o.id] = { n: n + 1, keep: false, round: moved[o.id].round };
      continue;
    }
    moved[o.id].after = anchor;
  }
  const rest = enc.order.filter((o) => !moved[o.id] || moved[o.id].placed);
  for (const o of back.filter((x) => moved[x.id].after)) {
    let at = rest.findIndex((x) => x.id === moved[o.id].after);
    // Behind the companions that take their turn straight after that creature's (or after its master's, if it is
    // one), not between them (review of #317, L4).
    // A creature taken back in after a companion that acts before its master (A1) goes behind that master's whole
    // group, the master and its `after` companions too, so the group is not split.
    const lead = at < 0 ? null : tieOf(rest[at]) ?? rest[at].id;
    while (at >= 0 && rest[at + 1] && (tieOf(rest[at + 1]) === lead || rest[at + 1].id === lead)) at++;
    rest.splice(at < 0 ? rest.length : at + 1, 0, o);
    delete moved[o.id].after;
    moved[o.id].placed = true;
  }
  const ends = enc.order.filter((x) => moved[x.id] && !moved[x.id].after && !moved[x.id].placed).sort((a, b) => moved[a.id].n - moved[b.id].n);
  enc.order = [...rest, ...ends];
  if (cur) enc.turn = enc.order.findIndex((o) => o.id === cur);
  if (!Object.keys(moved).length) delete enc.moved;
}

// A new round: turns held last round are gone (a creature has one turn a round), and every place
// moved for one round only is given back (initiative order, as `initiativeSort` keeps it).
function newRound(s) {
  const enc = s.encounter;
  delete enc.held;
  delete enc.rode;                                     // a mount got down from last round has its turns again (stage C6a)
  takeUpOrders(s);                                     // a before or after choice made last round takes effect now (A1)
  // A companion whose place behind its master could not change in the middle of the last round (bonded or
  // freed then, or a master who joined after it) takes it now (followMasters, world.js).
  if (followMasters(s, false)) enc.turn = 0;
  if (!enc.moved) return;
  let back = false;
  for (const [id, m] of Object.entries(enc.moved)) {
    delete m.turn;
    if (!m.keep || m.after || m.placed) { delete enc.moved[id]; back = true; }
  }
  if (back) { initiativeSort(enc.order); enc.turn = 0; }
  settleOrder(s);
  enc.turn = 0;
  // A companion whose master (or itself) was set aside last round only, and so could not change sides above, does so
  // now that the place is given back: nobody has had a turn in this round yet.
  followMasters(s, false);
  enc.turn = 0;
}
// A before or after choice for a companion (`companionOrder`, companions.js; A1) is kept in `bond.orderNext` while a
// fight goes on and taken up here, at a round's start, never in the middle of one: moving a companion round a master
// who is mid-turn could give it a second turn or take its turn away. Every bond, in the fight or not: one that joins
// later this round joins by the round's choice.
function takeUpOrders(s) {
  for (const e of Object.values(s.entities)) {
    if (!e.bond?.orderNext) continue;
    if (steering(s, e)) continue;                      // a ridden steed has no place of its own: its choice waits (A1, C6a)
    e.bond.order = e.bond.orderNext;
    delete e.bond.orderNext;
  }
}

// The turn of a creature set aside, played for it: the Dodge action if it can still take an action,
// and it stays where it is. Ends the turn. False if the fight ended.
export function awayTurn(s, e, ev) {
  const b = s.encounter.budget;
  if (b.action > 0 && !incapacitated(e)) {
    b.action--; e.cond.dodging = {};
    ev.push({ type: 'std', id: e.id, action: 'Dodge' });
  }
  ev.push({ type: 'awayTurn', id: e.id, how: 'dodge', round: s.encounter.round });
  return finishTurn(s, e, ev);
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
  if (t.dead) return;                                      // a dart or ray that lands after an earlier one killed it (Magic Missile's darts strike together): nothing left to hurt
  const parts = Array.isArray(amount) ? amount : [{ amount, type: dtype }];
  const m = modifiers(s, t, 'damage.taken', { target: t });
  // A Reaction that gives Resistance to the damage being taken (Superior Hunter's Defense): the type it resists now.
  const braced = pierce || raw ? null : braceAgainst(s, t, parts, m, ev);     // not a DM setting Hit Points (`raw`)
  // A familiar's master's Reaction that gives it Resistance to this damage (Investment of the Chain Master; C9c).
  const warded = pierce || raw ? false : wardFor(s, t, parts, m, ev);
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
  const firstEvent = ev.length;
  for (const [pi, p] of parts.entries()) {
    const applies = (fromModifiers, own) => fromModifiers === true || fromModifiers.includes(p.type) || own.includes(p.type);
    // SRD order: Resistance (halved, rounded down), then Vulnerability (doubled); each counts once.
    const resisted = !pierce && (applies(m.resist, t.resist) || p.type === braced || (warded && DAMAGE_TYPES.includes(p.type)) || (p.type === 'fire' && submerged(s, t))), vulnerable = applies(m.vulnerable, t.vuln);
    let n = base[pi];
    if (!pierce && (applies(m.immune, t.immune) || (p.type === 'thunder' && silentAll(s, t)))) n = 0;       // Silence: entirely inside the sphere
    else { if (resisted) n = Math.floor(n / 2); if (vulnerable) n *= 2; }
    const ref = cut ? base[pi] : p.amount;                 // after a reaction's cut, Resistance is judged against what was left
    const note = n === 0 && ref > 0 ? 'immune' : resisted && vulnerable && ref > 0 ? 'resisted and vulnerable' : n < ref ? 'resisted' : n > ref ? 'vulnerable' : undefined;
    total += n;
    const soak = raw ? 0 : Math.min(t.tempHp ?? 0, n);
    if (soak) t.tempHp -= soak;
    lost += n - soak;
    if (!dying) t.hp = Math.max(0, t.hp - (n - soak));
    ev.push({ type: 'damage', target: t.id, amount: n, dtype: p.type, ...(p.spell ? { from: p.from } : {}), hp: dying ? 0 : t.hp, note, ...(noted[pi].length ? { adjusted: noted[pi] } : {}), ...(soak ? { temp: soak, tempHp: t.tempHp } : {}), ...rolledOf(p, n) });
  }
  // A whole form (Polymorph) ends on the creature when its Temporary Hit Points are gone, whoever gave them last: what is left of the damage has gone on to its real Hit Points above, as the rule for Temporary Hit Points says.
  const poly = t.form?.whole === true && !(t.tempHp > 0) ? effectsOf(s).find((x) => x.id === t.form.fx) : null;
  if (poly) endEffect(s, ev, poly, `${t.name} has no Temporary Hit Points left`);
  if (t.tempFx && !(t.tempHp > 0)) delete t.tempFx;
  const dealtBy = parts.find((p) => typeof p.by === 'string')?.by ?? null;
  if (total > 0 && dealtBy !== null) endWards(s, ev, dealtBy, `${s.entities[dealtBy]?.name ?? 'The warded creature'} dealt damage`);        // Sanctuary: the warded creature deals damage
  if (total > 0) damaged(s, ev, t, dealtBy, KIT);      // "until it takes any damage" (Turn Undead); a save on damage (Dominate Monster)
  // Death Ward (a modifier on `hp.zero`): the creature would drop to 0 Hit Points and drops to 1 instead, however much the damage was, and the
  // use ends the ward. Not when the DM sets its Hit Points (`raw`). It comes before Relentless Rage: the creature never reaches 0.
  // Every damage event of this hit says `hp: 0` (several damage parts in one hit each put the target at 0), so each is patched to the 1 it was left at.
  if (!dying && !raw && before > 0 && t.hp <= 0 && warded0(s, t, ev)) for (let i = firstEvent; i < ev.length; i++) if (ev[i].type === 'damage' && ev[i].target === t.id && ev[i].hp === 0) ev[i].hp = t.hp;
  // Relentless Rage: dropping to 0 Hit Points without dying outright while raging, a Constitution save keeps it up.
  if (!dying && t.hp <= 0 && lost - before < t.maxHp) relentless(s, t, ev);
  if (dying) {                                            // already dying
    if (total > 0) { t.death.f += crit ? 2 : 1; delete t.cond.stable; if (t.death.f >= 3 || total >= t.maxHp) { t.dead = true; died(s, t); } }   // as much as the maximum kills outright
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
  } else { t.dead = true; died(s, t); ev.push({ type: 'died', id: t.id }); }
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
  // Only damage of a type (the DM's untyped damage is none), and not a type it already resists or is immune to.
  const all = [...new Set(parts.filter((p) => p.amount > 0).map((p) => p.type))];
  if (!all.length || !all.every((ty) => DAMAGE_TYPES.includes(ty))) return null;
  const types = all.filter((ty) => !has(m.resist, t.resist, ty) && !has(m.immune, t.immune, ty));
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

// Investment of the Chain Master's Resistance (`invest.ward`; docs/specs/companions.md, C9c): "When the familiar takes damage,
// you can take a Reaction to grant it Resistance against that damage." `t` is a familiar its master made with the feature's
// spell; the master, able to take a Reaction, takes it by its instruction (reactions.js: always by default, never, or ask its
// player; the DM is told for one of the DM's). Resistance then applies to every part of this damage. Not taken when there is
// nothing to resist (no damage, or only damage of types it resists or is immune to already). Returns whether it was taken.
function wardFor(s, t, parts, m, ev) {
  const b = t.bond, mm = b?.kind === 'familiar' && typeof b.to === 'string' && Object.hasOwn(s.entities, b.to) ? s.entities[b.to] : null;
  if (!mm || mm.id === t.id || mm.object || !canReact(mm)) return false;
  const r = reactionsOf(mm).find((x) => x.on === 'familiarDamaged' && x.spell === b.source);
  if (!r) return false;
  const w = instruction(mm, r, s);             // `ask` by default for a master a player runs (reactions.js, defaultOf)
  if (w === 'never') return false;
  const has = (list, own, ty) => list === true || list.includes(ty) || (own ?? []).includes(ty);
  // Only damage of a type, as Superior Hunter's Defense (the DM's untyped damage is none; review of #467, 4).
  if (!parts.some((p) => p.amount > 0 && DAMAGE_TYPES.includes(p.type) && !has(m.resist, t.resist, p.type) && !has(m.immune, t.immune, p.type))) return false;
  if (w === 'ask') {
    const types = [...new Set(parts.filter((p) => p.amount > 0).map((p) => p.type))];
    const a = ask(s, mm, { trigger: 'familiarDamaged', ...(types.length === 1 && DAMAGE_TYPES.includes(types[0]) ? { dtype: types[0] } : {}) }, [{ reaction: r.id, name: `${r.name}: Resistance for ${t.name}` }]);
    if (a === null) { tellDM(mm, r, `${t.name} takes damage.`, ev); return false; }
    if (a.take !== r.id) return false;
  }
  mm.reactionUsed = true;
  ev.push({ type: 'reaction', id: mm.id, reaction: r.id, name: r.name, trigger: 'familiarDamaged', for: t.id });
  return true;
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

// A creature that would drop to 0 Hit Points and has a modifier on `hp.zero` (Death Ward: `{ op: 'min', value: 1, uses: 1 }`) drops to that many
// instead, and the use ends the ward (SRD 5.2.1, Death Ward: "the target instead drops to 1 Hit Point, and the spell ends"). True if one held.
function warded0(s, t, ev) {
  const z = modifiers(s, t, 'hp.zero', { target: t });
  if (z.min === null) return false;
  const name = effectsOf(s).find((fx) => z.used.some((p) => fx.parts.includes(p)))?.name ?? 'A ward';
  t.hp = Math.max(1, Math.min(t.maxHp, z.min));
  ev.push({ type: 'note', id: t.id, text: `${name}: ${t.hp} Hit Point${t.hp === 1 ? '' : 's'} left instead of 0` });
  useUp(s, ev, z.used);
  return true;
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
  ev.push({ type: 'save', id: t.id, abil: 'con', dc, ...sv, against: f.name, ...srcOf(s, t.id) });
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

// Heavy lives in weapons.js (the AI asks it too); re-exported here for the importers that had it from this module.
export { heavyWeak };

// The d20 part of an attack: roll, compare with Armor Class, record it. Returns { hit, crit, mode }.
// `forgo`: the attacker gives up any Advantage on this roll (Brutal Strike).
// `keepHidden`: the attack does not end its hiding yet (Stealth Attack; resolveAttack decides).
// `atk.via`: a touch spell its caster's familiar delivers (casting.js, `deliver`; stage C5c). The caster makes the
// attack roll, with its own bonus, conditions and senses, but the touch is made from the familiar's space: distance,
// cover and what can be seen are worked out as if the caster stood there with the familiar's size.
function rollToHit(s, e, t, atk, ev, extra = {}, { forgo = false, keepHidden = false } = {}) {
  // An attack with no bonus the engine can read (a spell attack in a creature's action has none: #421) is not rolled: a total that is not a
  // number would be neither a hit nor a miss. The DM is told, and nothing is spent or changed but the attack itself.
  if (!Number.isFinite(atk.bonus)) {
    ev.push({ type: 'manual', actor: e.id, name: atk.name, partial: true, text: `${atk.name} has no attack bonus the engine can use, so the roll was not made. The DM rolls it and says whether it hits ${t.name}.` });
    return { hit: false, crit: false, mode: 'normal' };
  }
  const v = typeof atk.via === 'string' && Object.hasOwn(s.entities, atk.via) ? s.entities[atk.via] : null;
  const from = v ? { ...e, pos: v.pos, size: v.size } : e;
  let { mode, adv, dis, miss, add, dice, crit: sureCrit, used } = rollMode(s, from, t, extra.opportunity ? { ...atk, opportunity: true } : atk);
  // SRD "Weapon Mastery": a weapon the wielder lacks proficiency with gives no mastery property. The engine applies no mastery property to any
  // weapon (DEBT T60), so there is nothing to withhold; a holder of the feature is told once a fight, so the DM does not apply it by hand.
  if (atk.untrained && e.feats?.some((f) => f.id === 'weapon-mastery') && CONTENT.weapons[atk.weapon]?.mastery && s.encounter && !s.encounter.flags[`nomastery:${e.id}:${atk.weapon}`]) {
    s.encounter.flags[`nomastery:${e.id}:${atk.weapon}`] = true;
    ev.push({ type: 'manual', actor: e.id, name: 'Weapon Mastery', partial: true, text: `${e.name} is not proficient with the ${CONTENT.weapons[atk.weapon].name}, so it has no Weapon Mastery property (${CONTENT.weapons[atk.weapon].mastery}) and the attack adds no Proficiency Bonus. The DM applies no mastery effect for it.` });
  }
  const heavy = heavyWeak(from, atk);
  if (heavy) { dis = [...dis, heavy]; mode = adv.length && !dis.length ? 'adv' : dis.length && !adv.length ? 'dis' : 'normal'; }
  // `advantageIf` (a creature's attack step: "with Advantage if the target is Grappled by it"): Advantage when every tag holds; a tag the
  // engine cannot judge leaves the roll without it and tells the DM.
  if (atk.advantageIf?.length) {
    const held = atk.advantageIf.map((tag) => judge(tag, { attacker: from, target: t }, s));
    if (held.includes(null)) ev.push({ type: 'manual', actor: e.id, name: atk.name, partial: true, text: `${atk.name} has Advantage on the attack roll against ${t.name} if "${atk.advantageIf.join('", "')}", which the engine cannot judge. The DM decides.` });
    else if (held.every(Boolean)) { adv = [...adv, atk.advantageIf.length === 1 && atk.advantageIf[0] === 'target.grappledBySelf' ? `${t.name} is Grappled by ${e.name}` : `${atk.name}'s own Advantage`]; mode = dis.length ? 'normal' : 'adv'; }
  }
  if (forgo && mode === 'adv') { mode = 'normal'; adv = []; }
  if (!keepHidden) unhide(s, e, ev, 'attack');                                           // an attack roll gives away where it is, hit or miss
  const r1 = die(s, 20), r2 = mode === 'normal' ? null : die(s, 20);
  const nat = mode === 'adv' ? Math.max(r1, r2) : mode === 'dis' ? Math.min(r1, r2) : r1;
  const more = rollDice(s, dice);
  const bonus = atk.bonus + add + more.total;
  // Cover adds to Armor Class: 2 for half, 5 for three-quarters.
  const cover = e.object ? 'none' : coverOf(s, from, t, v ? living(s).filter((o) => o !== v && o !== e) : living(s)), ac = acOf(s, t) + (COVER[cover] ?? 0);
  // Improved Critical: a weapon attack scores a Critical Hit, and so hits, on a lower roll (`critOn`).
  const critRoll = nat === 20 || (!atk.spell && e.critOn && nat >= e.critOn);
  let hit = !miss && nat !== 1 && (critRoll || nat + bonus >= ac), ac2 = ac, cut = null;         // `miss`: under water, beyond the weapon's normal range: no roll can hit
  // A die that may turn a miss into a hit (Bardic Inspiration, Peerless Skill); never a natural 1.
  const lift = !hit && !miss && nat !== 1 ? rescue(s, e, 'attack.roll', ac - (nat + bonus), ev) : null;
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
    total: nat + bonus + lifted, ac: ac2, mode, why: miss ? [miss] : mode === 'adv' ? adv : mode === 'dis' ? dis : [], hit, crit, ...(lift ? { rescued: { name: lift.name, dice: lift.dice, add: lift.add } } : {}), ...(cover !== 'none' ? { cover } : {}), ...(more.extra.length ? { extra: more.extra } : {}),
    dice: [...d20Faces(r1, r2, nat), ...more.dice], bonus: atk.bonus + add, ...extra });
  useUp(s, ev, used);
  if (!hit) studied(s, e, t, ev);
  else afterHit(s, e, t, ev);
  if (s.encounter) s.encounter.flags[`attacked:${e.id}`] = true;           // Reckless Attack is decided before the first attack roll of a turn
  if (hit && s.encounter && !e.object) s.encounter.flags[`hit:${e.id}:${t.id}`] = true;     // a feature that follows a hit this turn (Hurl Through Hell)
  // A feature that follows a hit with a weapon (`after: 'weaponHit'`, addition F of docs/specs/homebrew-subclasses.md): a spell attack and an Unarmed Strike are not one (`weapon` of `resolveAttack`, below).
  if (hit && s.encounter && !e.object && !atk.spell && !isUnarmed(atk)) s.encounter.flags[`whit:${e.id}:${t.id}`] = true;
  renew(s, e, t);
  return { hit, crit, mode, ...(cut ? { cut } : {}) };
}

// ---------- reactions (asking a player is ask() in shared.js) ----------

// Can `t` see `e` for a reaction whose trigger says "that you can see" (Counterspell: "when you see a creature ... casting a
// spell"; Hellish Rebuke: "a creature that you can see"; Uncanny Dodge: "an attacker that you can see"; the Opportunity
// Attack: "a creature that you can see leaves your reach", SRD 2093-2094)? Its senses must find it (`canSee`), and a
// party creature never sees a creature the party does not know of: one the DM has hidden, one hiding, one in a place not
// yet revealed, or under `los`/`light` one nobody in the party sees (vision.js `unknown`; fix round 1 of #373, M1). A
// creature is never asked, and never reacts, against what its side does not know is there.
export const seesFor = (s, t, e) => !!e && !e.object && canSee(s, t, e) !== 'no' && !(t.side === 'party' && unknown(s, e));
// A party creature whose own senses find a creature that is hiding from it (Blindsight within range sees it whatever it
// does; Truesight sees the Invisible, and hiding is the Invisible condition against its enemies: sight.js) can see it,
// though the party is not yet told of it. It may then react to it (#374, B1; the re-review of #373, L1). Only hiding
// gives way: a creature the DM has hidden, one somewhere not revealed, or one nobody in the party would see once it
// stopped hiding (`los`, `light`, read as vision.js partyView reads them) stays unknown, and nobody in the party reacts
// to it. Asked of a copy: the state is not touched (fix round 1 of #378, L2).
function foundBySense(s, t, e) {
  if (!e || e.object || t.side !== 'party' || !e.hiding || e.hidden || canSee(s, t, e) === 'no') return false;
  const shadow = { ...e, hiding: undefined };
  if (concealed(s.map, shadow)) return false;
  const rule = sightRule(s);
  if (rule === 'rooms') return true;
  const eyes = Object.values(s.entities).filter((v) => v.side === 'party' && up(v)).map(raised), at = raised(shadow);
  return eyes.some((v) => (rule === 'los' ? inViewOf(s.map, v, at) : canSee(s, v, at) !== 'no'));
}
// May `t` react to `e` by a trigger that says "that you can see": it sees it and its side knows of it (`seesFor`), or
// its own senses find it (above). Offering or asking needs nothing more: a question about a creature the party is not
// told of names nobody (no `by`). The finding itself is made only when the reaction is taken (`findFor`), so a
// reaction set to `never` and one asked and declined send every player the same (fix round 1 of #378, M1).
export const sensesFor = (s, t, e) => seesFor(s, t, e) || foundBySense(s, t, e);
// The events of the action so far that name a creature.
const NAMED = (x, id) => [x.id, x.actor, x.target, x.by, x.against, x.source, ...(Array.isArray(x.targets) ? x.targets : [])].includes(id);
// `t` takes a reaction against `e`, which its own senses found: `e` stops hiding (`unhidden`, why `found`, by `t`) just
// before the reaction, so the party is told first. What happened earlier in the action happened while the party did not
// know of `e`, and stays told so: each earlier event naming it carries it in `unseen` (as an E23 cast marks its own,
// casting.js; apply()'s record keeps the mark). Returns what was done, for `unfind`, or null when nothing was.
export function findFor(s, t, e, ev) {
  if (seesFor(s, t, e) || !foundBySense(s, t, e)) return null;
  const marked = [], dc = e.hiding.dc;
  for (const x of ev) {
    if (!x || !NAMED(x, e.id) || (Array.isArray(x.unseen) && x.unseen.includes(e.id))) continue;
    x.unseen = [...(Array.isArray(x.unseen) ? x.unseen : []), e.id];
    marked.push(x);
  }
  unhide(s, e, ev, 'found', t);
  return { e, dc, marked };
}
// A finding made by a reaction inside an attack or a cast. In a fight the creature does not move again before the action
// ends, so whether the end would have found it anyway is asked now (unfind). Outside a fight the only attack or harmful
// spell that reaches a reaction is an E23 cast (casting.js, landThenFight), which marks what the party did not know of
// while it was cast whatever happens after: the marks stay, as that cast would have made them.
function settleFound(s, found) { if (found && s.encounter) unfind(s, found); }
// Would the end of the action have found this creature anyway, had it still been hiding (features.js `watch`: an enemy
// that sees it, or, with the table rule passiveFind 'all', one whose passive Perception meets its DC and that has it in
// view)? Then the events before the finding are told as the end of the action would have told them: the marks go.
export function unfind(s, found) {
  if (!found) return;
  const h = { ...found.e, hiding: { dc: found.dc } };
  const anyway = living(s).some((o) => {
    if (!up(o) || !hostile(o, h)) return false;
    if (canSee(s, o, h) !== 'no') return true;
    if (s.settings.passiveFind !== 'all') return false;
    const w = canSee(s, o, h, { ignoreHiding: true });
    return w !== 'no' && passive(s, o, 'perception', w === 'dim' ? ['dim light'] : []) >= found.dc;
  });
  if (!anyway) return;
  for (const x of found.marked) {
    x.unseen = x.unseen.filter((id) => id !== found.e.id);
    if (!x.unseen.length) delete x.unseen;
  }
}

// `e` is casting `sp`. Anyone who would counter it (Counterspell) gets the chance, in the order
// the table lists them, until one does. Returns the id of the creature that countered it, or null.
// Only a spell with Verbal, Somatic or Material components can be seen being cast (SRD).
// `comps` is the components this casting has: a spell's own, or fewer from an item (castSpell, below).
export function counterWindow(s, e, sp, ev, comps = sp.def.components ?? []) {
  if (!comps.some((c) => ['v', 's', 'm'].includes(c))) return null;
  for (const o of living(s)) {
    const src = reactAgainst(s, o, e, 'cast', ev, `${e.name} is casting a spell.`);
    if (src?.countered) return o.id;
  }
  return null;
}

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
    fx = startEffect(s, { name: sp.name, spell: sp.id, source: e.id, conc: sp.def.concentration, duration: sp.def.duration, level: Math.max(slot || 0, sp.level) });
    ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: e.id, conc: fx.conc, lasts: fx.lasts, targets: [...targets] });
  }
  const st = spellStats(e, s, sp.id), depth = s.stack?.length ?? 0;
  const src = { name: sp.name, dc: st.dc, attack: st.attack, range: sp.range, healMod: mod(e.abil[castAbilOf(e, sp.id)] ?? 10), ...(fx ? { fx: fx.id } : {}), ...(trigger === 'cast' ? { counters: true } : {}) };
  begin(s, { steps, actor: e.id, targets: [...targets], src });
  const mark = ev.length;
  run(s, ev, KIT, depth);
  if (sp.def.tier !== 'auto' && !ev.slice(mark).some((x) => x.type === 'manual' && x.name === sp.name)) ev.push({ type: 'manual', actor: e.id, name: sp.name, text: sp.def.text, partial: true });
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
      if (x.seen && !sensesFor(s, t, e)) continue;                                      // "an attacker that you can see"
      if (x.types && !attackTypes(atk).some((d) => x.types.includes(d))) continue;      // Deflect Attacks: Bludgeoning, Piercing or Slashing
      o = { reaction: r.id, name: r.name };
    } else continue;
    if (w === 'miss' && (roll_.critRoll || roll_.total >= roll_.ac + (r.ac ?? 0))) continue;     // it would hit anyway
    offers.push({ r, w, o, slots });
  }
  let chosen = offers.find((x) => x.w !== 'ask') ?? null, slot;
  if (offers.some((x) => x.w === 'ask')) {
    const seen = seesFor(s, t, e);
    // An attacker the party does not know of is not named, nor is its weapon (#374, B2; the re-review of #373, L2): the
    // total and the Armor Class are what the answer turns on.
    const a = ask(s, t, { trigger: 'hit', ...(seen ? { by: e.id, attack: atk.name } : {}), total: roll_.total, ac: roll_.ac, ...(roll_.critRoll ? { crit: true } : {}) }, offers.map((x) => x.o));
    if (a === null) for (const x of offers) { if (x.w === 'ask') tellDM(t, x.r, `${t.name} is hit by ${e.object ? 'a trap' : e.name}'s attack.`, ev); }
    else { chosen = offers.find((x) => x.r.id === a.take) ?? null; slot = a.slot; }
  }
  if (!chosen) return null;
  if (chosen.r.kind === 'feature' && chosen.r.reaction.seen) settleFound(s, findFor(s, t, e, ev));    // taken against a foe its senses found: the party is told first
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
    if (!slots.length || apart(s, t, e) * FT > (typeof sp.range === 'number' ? sp.range : 0) || !sensesFor(s, t, e)) continue;
    let slot = slots[0];
    if (w === 'ask') {
      // A creature the party is not told of is not named in the question (fix round 1 of #378, L3).
      const a = ask(s, t, { trigger: on, ...(seesFor(s, t, e) ? { by: e.id } : {}) }, [spellOffer(r, slots)]);
      if (a === null) { tellDM(t, r, why, ev); continue; }
      if (a.take !== r.id) return null;
      slot = a.slot ?? slot;
    }
    settleFound(s, findFor(s, t, e, ev));                                               // taken against a foe its senses found: the party is told first
    return castReaction(s, t, sp, slot, on, e.id, ev, [e.id]);
  }
  return null;
}

// A feature reaction that answers damage with a melee attack (Retaliation: `{ on: 'damaged', attack:
// 'melee', within }`): `t` took damage from `e`, within `within` feet. Its instruction decides, or its
// player when it says `ask`. It attacks with its first melee attack, as an Opportunity Attack is made (weapons.js, steadiest: not a Heavy one it is weak with, if another will do).
// Returns true if it was taken.
function strikeBack(s, t, e, r, ev, why) {
  const x = r.reaction, atk = steadiest(t, (t.attacks ?? []).filter((a) => a.type === 'melee' && !handsFull(s, t, a)), s);       // one it may make (weapons.js)
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

// ---------- choices after a hit (hitchoices.js; docs/specs/on-hit.md, Decisions 1 to 3 and 5) ----------

// How `e` could cast hit spell `sp` now, after a hit with `atk`: { slots: [levels that may pay], free: [features that cast it with no slot] }, both empty
// when it cannot. A smite is a Bonus Action on the caster's own turn (`blocked`), so it is never offered on an Opportunity Attack, and one slot is spent
// on a spell a turn (`slotsFor` reads the turn's flag), while a feature's free cast spends none. `spare` Bonus Actions are already taken by the attack.
function hitWays(s, e, sp, atk, spare = 0) {
  const none = { slots: [], free: [] };
  if (!s.encounter || e.object || e.bond?.noAttack || e.form || incapacitatedBy(e) || untrainedGear(e).length) return none;
  if (effectsOf(s).some((fx) => fx.source === e.id && fx.noSpells)) return none;
  if (sp.def.components?.includes('v') && silentAt(s, e.pos)) return none;       // Silence: no Verbal component can be spoken there
  if (!fitsHit(sp.def.hit.with, atk) || blocked(s, e, 'bonus') || s.encounter.budget.bonus - spare < 1) return none;
  return {
    slots: (e.spells ?? []).includes(sp.id) ? slotsFor(s, e, sp) : [],
    free: freeHitCasts(e).filter((x) => x.spell.id === sp.id && (e.uses?.[x.feat.id] ?? 0) > 0).map((x) => x.feat),
  };
}

// The choices an `attack` names ahead (`onHit`), checked before anything is spent: [{ spell, slot?, via?, on }]. A refusal refuses the attack.
export function hitNamed(s, e, atk, list, spare = 0) {
  if (list === undefined) return null;
  (Array.isArray(list) && list.length <= 3) || fail('`onHit` is a list of what to do if the attack hits: [{ spell, slot?, via?, on? }].');
  s.encounter || fail('A choice named for a hit goes with an attack on a turn in a fight.');
  const out = [];
  for (const c of list) {
    (c && typeof c === 'object' && !Array.isArray(c) && Object.keys(c).every((k) => ['spell', 'slot', 'via', 'on'].includes(k))) || fail('A choice for a hit is { spell, slot?, via?, on? }.');
    const sp = typeof c.spell === 'string' && Object.hasOwn(SPELLS, c.spell) && SPELLS[c.spell].def.hit ? SPELLS[c.spell] : fail('Name a spell that is cast right after a hit.');
    (c.on === undefined || c.on === 'hit' || c.on === 'crit') || fail('`on` is "hit" (the default) or "crit".');
    const ways = hitWays(s, e, sp, atk, spare);
    if (!ways.slots.length && !ways.free.length) {
      const why = blocked(s, e, 'bonus') || (!fitsHit(sp.def.hit.with, atk) ? `${sp.name} goes with ${sp.def.hit.with === 'melee' ? 'a Melee weapon or an Unarmed Strike' : 'a weapon'}.` : `${e.name} can't cast ${sp.name} after this hit now (it needs a Bonus Action and a spell slot not yet spent this turn).`);
      fail(why);
    }
    if (c.via !== undefined) {
      (typeof c.via === 'string' && ways.free.some((f) => f.id === c.via)) || fail(`${e.name} has no use of a feature that casts ${sp.name} that way left.`);
      c.slot === undefined || fail('A cast through a feature uses no spell slot: leave out the slot.');
    } else {
      (Number.isInteger(c.slot ?? ways.slots[0]) && ways.slots.includes(c.slot ?? ways.slots[0])) || fail(ways.slots.length ? `${sp.name} can be cast with a level ${ways.slots.join(', ')} slot.` : `${e.name} has no spell slot to cast ${sp.name} with: name the feature that casts it (via).`);
    }
    out.push({ spell: sp.id, ...(c.via === undefined ? { slot: c.slot ?? ways.slots[0] } : { via: c.via }), on: c.on ?? 'hit' });      // no slot named: the lowest that may pay (as an instruction takes it)
  }
  out.length <= 1 || fail('A creature has one Bonus Action a turn: name one spell to cast after a hit.');
  return out;
}

// Pay for and cast hit spell `sp` on `t`, `e`'s attack having hit: the Bonus Action, and a slot of level `slot` or a use of the feature `via`. A foe who sees it
// may Counterspell it: that wastes the Bonus Action, keeps the slot (as `castSpell` does) and leaves the attack's own damage. Otherwise returns what the cast
// adds: its scaled `steps`, to be rolled with the damage (`withHit`) or run after it. A lasting spell starts its effect (Concentration replaces the old).
function castOnHit(s, e, t, sp, way, ev) {
  const slotFlag = s.encounter.flags.slot, slot = way.via ? 0 : way.slot;
  s.encounter.budget.bonus--;
  if (way.via) e.uses[way.via.id]--;
  else { e.slots[slot]--; s.encounter.flags.slot = true; }
  ev.push({ type: 'cast', actor: e.id, spell: sp.id, name: sp.name, hexes: null, targets: [t.id], hit: true, ...(slot > sp.level ? { slot } : {}), ...(way.via ? { via: way.via.name } : {}) });
  if (sp.def.components?.includes('v')) unhide(s, e, ev, 'spell');
  const by = counterWindow(s, e, sp, ev);
  if (by) {
    if (!way.via) { e.slots[slot]++; if (slotFlag) s.encounter.flags.slot = slotFlag; else delete s.encounter.flags.slot; }
    ev.push({ type: 'countered', id: e.id, spell: sp.id, name: sp.name, by });
    return null;
  }
  const { steps, unscaled } = scaleSteps(sp.def, e.level, slot || sp.level);
  let fx = null;
  if (sp.def.duration !== 'instant') {
    if (sp.def.concentration) breakConcentration(s, ev, e.id, `${e.name} began concentrating on ${sp.name}`);
    fx = startEffect(s, { name: sp.name, spell: sp.id, source: e.id, conc: sp.def.concentration, duration: sp.def.duration, level: Math.max(slot || 0, sp.level) });
    ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: e.id, conc: fx.conc, lasts: fx.lasts, targets: [t.id] });
  }
  return { sp, slot: slot || sp.level, steps, unscaled, fx };
}

// The choices at the moment of the hit, before any damage is rolled: named ahead (`named`, from `hitNamed`), or by the creature's instructions, asking its
// player where one says `ask`. Returns what was cast: [{ sp, steps, ... }]. A player's `ask` stops the action (shared.js, ask); for a creature no player
// controls the DM is told and nothing waits; while a stand-in plays a character, `ask` is read as `never` (Decision 10).
function hitStage(s, e, t, atk, crit, ev, named) {
  const out = [];
  if (!s.encounter || e.object || e.actions || current(s) !== e.id) return out;
  const cast = (sp, c) => {
    const free = c.via ? freeHitCasts(e).find((x) => x.feat.id === c.via && x.spell.id === sp.id)?.feat : null;
    const k = castOnHit(s, e, t, sp, free ? { via: free } : { slot: c.slot }, ev);
    if (k) out.push(k);
  };
  if (named) {
    for (const c of named) if (c.on !== 'crit' || crit) cast(SPELLS[c.spell], c);
    return out;
  }
  for (let guard = 0; guard < 3; guard++) {
    const cands = [];
    for (const c of hitChoicesOf(e)) {
      const w = hitInstruction(s, e, c);
      if (w === 'never') continue;
      const sp = SPELLS[c.spell], ways = hitWays(s, e, sp, atk);
      if (ways.slots.length || ways.free.length) cands.push({ sp, ways, w });
    }
    // Taken without asking: a feature's free cast first, as it costs no slot, then the lowest slot.
    const sure = cands.find((x) => x.w === 'always' || (x.w === 'crit' && crit));
    if (sure) { cast(sure.sp, sure.ways.free.length ? { via: sure.ways.free[0].id } : { slot: sure.ways.slots[0] }); continue; }
    const asks = cands.filter((x) => x.w === 'ask');
    if (!asks.length || awayHow(s, e) === 'standIn') break;
    if (!ownerOf(s, e)) {
      for (const x of asks) ev.push({ type: 'manual', actor: e.id, name: x.sp.name, partial: true, text: `${e.name} hit ${t.name}. Its instruction for ${x.sp.name} is to ask the DM: if it casts it now, the DM applies it and marks its Bonus Action and slot used.` });
      break;
    }
    const concentrating = effectsOf(s).find((fx) => fx.source === e.id && fx.conc);
    const options = [];
    for (const x of asks) {
      const ends = x.sp.def.concentration && concentrating ? { ends: concentrating.name } : {};
      if (x.ways.slots.length) options.push({ reaction: x.sp.id, name: x.sp.name, kind: 'spell', slots: x.ways.slots, ...ends });
      for (const f of x.ways.free) options.push({ reaction: `${x.sp.id}@${f.id}`, name: `${x.sp.name} (${f.name}, no slot)`, kind: 'spell', free: true, ...ends });
    }
    const a = ask(s, e, { trigger: 'ownHit', moment: 'hit', target: t.id, attack: atk.name, ...(crit ? { crit: true } : {}) }, options);
    if (!a?.take) break;
    const [id, via] = a.take.split('@'), x = asks.find((y) => y.sp.id === id);
    cast(x.sp, via ? { via } : { slot: a.slot ?? x.ways.slots[0] });
  }
  return out;
}

// What a hit spell adds to the attack's damage: one part for each of its `withHit` damage steps (whose `when` holds), rolled now with `{ crit }`, so a Critical
// Hit doubles its dice, and dealt in the same `damage()` call as the weapon's, where Resistance applies by type and Uncanny Dodge's half takes it too.
function hitParts(s, e, t, casts, crit) {
  const parts = [];
  for (const k of casts) for (const st of k.steps) {
    if (!('damage' in st) || !st.withHit) continue;
    if (st.when && !st.when.every((tag) => judge(tag, { attacker: e, target: t }, s) === true)) continue;
    const r = roll(s, st.damage, { crit });
    parts.push({ amount: r.total, type: st.type, dice: r.dice, bonus: r.bonus, by: e.id, from: k.sp.name, spell: true });
  }
  return parts;
}

// The rest of what a hit spell does, after the damage: the steps that are not `withHit`, run on the creature hit, and the notes for what the engine did not do.
function hitAfter(s, e, t, casts, ev) {
  for (const k of casts) {
    const rest = k.steps.filter((st) => !('damage' in st && st.withHit));
    if (rest.length && !t.dead) {
      const depth = s.stack?.length ?? 0, st = spellStats(e, s, k.sp.id);
      begin(s, { steps: rest, actor: e.id, targets: [t.id], src: { name: k.sp.name, dc: st.dc, attack: st.attack, range: k.sp.range, healMod: mod(e.abil[castAbilOf(e, k.sp.id)] ?? 10), ...(k.fx ? { fx: k.fx.id } : {}), spell: k.sp.id, slot: k.slot } });
      run(s, ev, KIT, depth);
    }
    if (k.sp.def.tier !== 'auto') ev.push({ type: 'manual', actor: e.id, name: k.sp.name, text: k.sp.def.text, partial: true });
    if (k.unscaled) ev.push({ type: 'manual', actor: e.id, name: k.sp.name, partial: true, text: `Cast with a level ${k.slot} slot. The engine could not add ${k.unscaled}; the DM does.` });
  }
}

// A weapon attack by a creature whose attacks are still flat records (monsters and
// hand-entered characters). Spells resolve through effect steps instead.
// `brutal`: a Brutal Strike option chosen for this attack ({ id, name, dice, effects, unique? },
// attacks.js, brutalFor): Advantage is given up, and a hit deals `dice` more and then runs the option.
// `cunning`: Cunning Strike options chosen for this attack (attacks.js, cunningFor): their cost in Sneak
// Attack dice is taken off before the dice are rolled, and their steps run after the damage, only if
// Sneak Attack is dealt. One that keeps its creature hidden (Stealth Attack) holds off the attack's
// unhiding to the end of the turn (attacks.js, endTurn); if it is not paid for, the attack unhides it.
// A creature targets another with an attack roll or a damaging spell, and that one is warded (the `ward` step: Sanctuary): it makes the saving throw first, against the ward's DC, and on a failure the attack or the
// spell is lost. The SRD lets it choose a new target instead; the engine takes the other way out, loses it, and tells the DM, who may let it choose again. True when it is lost. Area effects never come here.
export function wardCheck(s, e, t, ev, what = 'attack') {
  if (!e || !t || e.id === t.id || e.object !== undefined || !e.abil) return false;           // a trap or other thing on the map does not choose a target
  for (const fx of effectsOf(s)) for (const p of fx.parts) {
    if (p.ended || p.target !== t.id || !p.ward) continue;
    const { used, ...sv } = savingThrow(s, e, p.ward.save, p.ward.dc, null, null, null, null, ev);
    ev.push({ type: 'save', id: e.id, abil: p.ward.save, dc: p.ward.dc, ...sv, against: fx.name, ...srcOf(s, fx.source, fx.id) });
    useUp(s, ev, used ?? []);
    if (sv.success) return false;
    ev.push({ type: 'manual', actor: fx.source, name: fx.name, partial: true, text: `${e.name} failed its ${p.ward.save.toUpperCase()} save against ${fx.name}, so its ${what} against ${t.name} is lost. The rules let it choose a new target instead: the DM may allow that.` });
    return true;
  }
  return false;
}

export function resolveAttack(s, e, t, atk0, ev, extra = {}, { brutal = null, cunning = null, onHit = null } = {}) {
  if (wardCheck(s, e, t, ev, 'attack')) return;
  endWards(s, ev, e.id, `${e.name} made an attack roll`);
  // A weapon changed by a spell or a feature (imbue.js): every attack with it reads the record through `armed`; the type that hurts the target most is taken.
  const atk0b = armed(s, e, atk0), atk = atk0b.alt ? { ...atk0b, dtype: bestType(s, t, [atk0b.dtype, ...atk0b.alt]) } : atk0b;
  const keepHidden = !!e.hiding && !!cunning?.some((o) => o.keepHidden);
  const { hit, crit, mode, cut } = rollToHit(s, e, t, atk, ev, extra, { forgo: !!brutal, keepHidden });
  if (!hit) { if (keepHidden) unhide(s, e, ev, 'attack'); return; }
  // What its creature may do now that the hit is settled, before any damage is rolled: a smite (docs/specs/on-hit.md, Decision 3, step 3).
  const casts = extra.opportunity || extra.reaction ? [] : hitStage(s, e, t, atk, crit, ev, onHit);
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
  // An Unarmed Strike is a melee attack made with the body, not "an attack with a weapon" (SRD, Unarmed Strike): `weapon` is false for it, and
  // `unarmed` says so, so a rider the SRD gives to "a weapon or an Unarmed Strike" can still tell it from a spell (`attack.weaponOrUnarmed`).
  const unarmed = isUnarmed(atk);
  damage(s, t, dealt(s, e, t, [{ amount: r.total, type: atk.dtype, dice: r.dice, bonus: r.bonus, by: e.id }, ...hitParts(s, e, t, casts, crit)], { hit: true, weapon: !atk.spell && !unarmed, unarmed, ranged: atk.type === 'ranged', ...(atk.abil ? { str: atk.abil === 'str' } : {}) }, crit), null, ev, { crit, ...(cut ? { cut } : {}) });
  if (atk.onHit === 'prone') condition(s, t, 'prone', ev);
  if (brutal && !t.dead) strikeEffect(s, e, t, brutal, ev);
  for (const o of paid ?? []) if (o.effects && !t.dead) strikeEffect(s, e, t, o, ev);
  hitAfter(s, e, t, casts, ev);
}

// The Shove option of an Unarmed Strike (SRD "Unarmed Strike", Shove; docs/specs/grapple-shove.md, Decision 1): no attack roll, so
// nothing that waits for a hit or a miss happens. The target saves with Strength or Dexterity (the engine takes the better, `bestSave`)
// against 8 + the attacker's Strength modifier + Proficiency Bonus (the Unarmed Strike's `dc`, or worked out here for a record made
// before it had one, with the ability the attack uses). On a failure it is pushed 5 feet away (`push`: stops at a wall, a drop or a
// creature, provokes nothing, asks a rider) or made Prone (`condition`: immunity is told, the attack is spent). `a.shove` is
// 'push' or 'prone', chosen when the Shove is declared (attacks.js).
// The Grapple option (stage G2): the same save; on a failure the target has the Grappled condition, held by `e`'s hand with the
// save's DC as its escape DC and a range of 5 feet (`grip`). `option` is 'grapple' or 'shove' (then `shove` says which).
export const strikeDC = (e, atk) => (Number.isInteger(atk.dc) ? atk.dc : 8 + mod(e.abil[atk.abil ?? 'str']) + e.prof);
export function strikeOption(s, e, t, atk, option, shove, ev) {
  const dc = strikeDC(e, atk);
  ev.push({ type: 'strikeOption', actor: e.id, target: t.id, option, ...(option === 'shove' ? { shove } : {}) });
  renew(s, e, t);                                                       // making an enemy save keeps a Rage going
  const about = option === 'grapple' ? ['grappled'] : shove === 'prone' ? ['prone'] : null, abil = bestSave(s, t, ['str', 'dex'], e, about);
  const { used, ...sv } = savingThrow(s, t, abil, dc, null, e, null, null, ev, about);
  ev.push({ type: 'save', id: t.id, abil, dc, by: e.id, ...sv, ...srcOf(s, e.id) });
  useUp(s, ev, used ?? []);
  if (sv.success) return;
  if (option === 'grapple') { grip(s, t, { by: e.id, with: 'hand', escape: dc, range: 5 }, ev); return; }
  if (shove === 'prone') {
    if (t.cond.prone) ev.push({ type: 'note', id: t.id, text: `${t.name} is already Prone` });      // allowed: the attack is spent, nothing changes
    else condition(s, t, 'prone', ev);
    return;
  }
  const went = push(s, t, 5, 'away', e.pos, ev);
  if (went === 'blocked') ev.push({ type: 'note', id: t.id, text: `${t.name} is not pushed: something is in the way` });
  // A creature off the ground has no step the engine can take it along (a flyer, a creature in the air), and the SRD lets it be pushed.
  else if (went === 'aloft') ev.push({ type: 'manual', actor: e.id, name: 'Shove', partial: true,
    text: `${t.name} failed the save against ${e.name}'s Shove and is not standing on anything, so the engine cannot push it. The DM moves ${t.name} 5 ft away from ${e.name}.` });
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

// A creature's action has no save DC of its own (a spell has the caster's): a condition or a modifier it puts on that ends on a
// repeated save is rolled against the entry's `ends.dc` if it has one, else the DC of the save that put it on (the SRD's "repeats
// the save": the same DC). Written on the action's own copy of its steps, so the entry is not changed. The innermost save wins.
function endingsTakeSaveDc(steps) {
  const saves = [];
  walkSteps(steps, (st) => { if ('save' in st && Number.isInteger(st.dc)) saves.push(st); });
  for (const sv of saves.reverse()) walkSteps([sv], (st) => { if (st.ends?.on === 'save' && st.ends.dc === undefined) st.ends.dc = sv.dc; });
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
  masterDc(s, e, steps);
  endingsTakeSaveDc(steps);
  begin(s, {
    steps, actor: e.id, targets: targets === null ? null : targets.map((t) => t.id),
    src: { name: def.name, action: def.id, ...(c ? { reach: c.reach, rangeBand: c.range, range: c.range?.[1] ?? c.reach } : {}), ...(origin ? { origin } : {}), ...(tag ? { tag } : {}), ...(fx ? { fx: fx.id } : {}) },
    shared: def.target.area && targets ? sharedRolls(s, def.effects) : null,
  });
  resolve(s, ev);
  if (fx) settle(s, ev, fx, targets ?? []);
}

// ---------- companions leaving the map (docs/specs/companions.md, Decision 4) ----------

// What a bonded creature carried stays where it was (SRD Find Familiar: "leaves behind anything it was
// wearing or carrying"): its gear by name, and any magic items on a sheet, go onto the pile in its cell
// (or a new one), past PILE_MAX if need be, so nothing is lost and nothing is made twice. With nothing
// at all under it, the DM is told what it carried.
// One the party did not know of leaves them as `drop` does for such a creature: on a pile of its own, marked
// `by` it (world.js, pileOpen), and `left`, since it is gone and the party can never come to know of it:
// `seePiles` keeps such a pile the DM's (they open it, with the map editor, when the party finds it), and so
// every pile it dropped unseen before. Players are told nothing: their view is as if it had simply died
// unseen with nothing on it (review of #313, M1).
function leaveGear(s, e, ev, unseen, went = 'vanished') {
  if (unseen) for (const o of s.map.objects) if (isPile(o) && o.by === e.id) o.left = true;
  const items = [...(Array.isArray(e.gear) ? e.gear : []).map((g) => ({ name: String(g) })),
    ...(Array.isArray(e.sheet?.items) ? e.sheet.items : []).filter((x) => x && typeof x === 'object').map(({ id: _k, equipped: _q, attuned: _a, ...spec }) => spec)];
  if (!items.length) return;
  const sf = under(s.map, e.pos);
  if (!sf) {
    ev.push({ type: 'manual', actor: e.id, name: e.name, partial: true, text: `${e.name} ${went} with nothing under it. What it carried is the DM's to place: ${items.map((x) => x.name ?? CONTENT.items[x.item]?.name ?? x.item).join(', ')}.` });
    return;
  }
  const by = unseen ? e.id : null;
  let o = pileAt(s, sf.level.id, e.pos, by);
  const placed = !o;
  if (!o) {
    o = { id: pileId(s, sf.level.id, e.pos, by), def: 'pile', level: sf.level.id, at: { q: e.pos.q, r: e.pos.r }, state: CONTENT.objects.pile.initial, contents: [], ...(by ? { by, left: true } : {}) };
    s.map.objects.push(o);
  }
  if (!Array.isArray(o.contents)) o.contents = [];
  for (const x of items) {
    let n = 1;
    while (o.contents.some((y) => y?.id === `c${n}`)) n++;
    o.contents.push({ id: `c${n}`, ...x });
  }
  // Seen by the party, `seen` lets the line reach them though the creature is gone (view.js, `object`).
  ev.push({ type: 'object', object: o.id, name: objectName(o), state: o.state, stateName: CONTENT.objects.pile.states[o.state]?.name, actor: e.id, verb: 'drop', ...(placed ? { placed: true } : {}) });
  if (unseen) ev.push({ type: 'manual', actor: e.id, name: e.name, partial: true,
    text: `${e.name} ${went} where the party could not see it. What it carried (${items.map((x) => x.name ?? CONTENT.items[x.item]?.name ?? x.item).join(', ')}) lies in ${o.id}, which only you see: when the party finds it, open it to them with the map editor: the pile without \`by\` or \`left\`, and with the id of the cell's own pile (\`pile-<level>-<q>_<r>\`, no \`-h\`), or onto that pile if there is one.` });
}

// What a companion the party could see leaves undone ends with it. A part on it, or one that was to end with
// a turn of its (`ends.who`: "until the end of its next turn"), ends: that turn will not come (review of #313,
// L7). A condition it put on another with no lasting effect behind it: a grapple ends, since there is nobody
// left to hold on (SRD Grappled); any other loses the name of a creature that is no longer there, and the DM
// is told it is theirs to end (L3).
function settleSeen(s, e, ev, went = 'vanished') {
  const name = e.name, its = (p) => !p.ended && (p.target === e.id || p.ends?.who === e.id);
  for (const fx of [...effectsOf(s)]) {
    if (fx.source === e.id) { endEffect(s, ev, fx, `${name} ${went}`); continue; }
    const on = fx.parts.filter(its);
    if (!on.length) continue;
    if (fx.parts.every((p) => p.ended || its(p))) endEffect(s, ev, fx, `${name} ${went}`);
    else useUp(s, ev, on);
  }
  for (const x of Object.values(s.entities)) {
    if (x.id === e.id || !x.cond) continue;
    for (const [c, v] of Object.entries(x.cond)) {
      if (v?.source !== e.id || v.effect !== undefined) continue;
      if ((c === 'grappled' && Array.isArray(v.holds)) || tiedTo(v).includes(e.id)) continue;      // holds, and what ends with them: below
      if (c === 'grappled') { delete x.cond[c]; ev.push({ type: 'condEnd', id: x.id, cond: c }); continue; }
      delete v.source;
      ev.push({ type: 'manual', actor: null, name, partial: true, text: `${x.name} is still ${conditionName(c)} from ${name}, which has ${went === 'vanished' ? 'vanished' : 'gone'}. Whether that ends is the DM's.` });
    }
  }
  // A grapple it held ends, and only that one: the creature may be held by another too (docs/specs/grapple-shove.md, Decision 3).
  for (const { t } of holdsOf(s, e)) endHold(s, t, e.id, 'gone', ev);
}

// ---------- grapples (docs/specs/grapple-shove.md, Decisions 2 and 3) ----------
// One hold on `t`, the one `by` has, ends: it leaves the list, `source` names the first hold left, and the Grappled condition
// goes when none is left (`condEnd` with `by` and `why`), or stays (`holdEnd`). A condition tied to the hold (`grapple: by`, a
// stat block's "Restrained until the grapple ends") ends with it. `why`: 'escaped', 'released', 'incapacitated', 'distance', 'gone'.
// The grapples that hold a `whileHeld` condition: `grapples` (every grappler's id); an older entry has a single `grapple`.
const tiedTo = (v) => (Array.isArray(v?.grapples) ? v.grapples : typeof v?.grapple === 'string' ? [v.grapple] : []);
export function endHold(s, t, by, why, ev) {
  const g = t.cond.grappled;
  if (!Array.isArray(g?.holds) || !g.holds.some((h) => h.by === by)) return false;
  g.holds = g.holds.filter((h) => h.by !== by);
  if (g.holds.length) { g.source = g.holds[0].by; ev.push({ type: 'holdEnd', id: t.id, by, why }); }
  else { delete t.cond.grappled; ev.push({ type: 'condEnd', id: t.id, cond: 'grappled', by, why }); }
  for (const [c, v] of Object.entries(t.cond)) {
    const list = tiedTo(v);
    if (!list.includes(by)) continue;
    const rest = list.filter((x) => x !== by);
    if (rest.length) { v.grapples = rest; delete v.grapple; if (v.source !== undefined && !rest.includes(v.source)) v.source = rest[0]; }       // another grapple still holds it: `source` follows
    else { delete t.cond[c]; ev.push({ type: 'condEnd', id: t.id, cond: c, by, why }); }
  }
  return true;
}
// A creature's hold put on by a condition step with `escape` (docs/specs/grapple-shove.md, Decision 7): `e` is the grappler, `src` the
// action running (its id is the part that holds, its reach or range the hold's range), `step` the Grappled step. A target above
// `largest` is not grappled, and nothing is said. One part holds `holds` creatures (1 if left out): while it holds that many it
// holds no other (`takeAction` refuses the action; this is for a way round it, an Opportunity Attack).
function hold(s, e, t, src, step, ev) {
  if (step.largest && rank(t) > rank({ size: step.largest })) return;
  const part = src.action ?? src.name, mine = holdsOf(s, e).filter((x) => x.hold.with === part);
  if (!mine.some((x) => x.t.id === t.id) && mine.length >= (step.holds ?? 1)) {
    return ev.push({ type: 'note', id: e.id, text: `${src.name} already holds ${mine.length === 1 ? mine[0].t.name : `${mine.length} creatures`}, so it can't hold ${t.name} too` });
  }
  grip(s, t, { by: e.id, with: part, escape: step.escape, range: src.range ?? src.reach ?? 5, ...(step.escapeDis ? { escapeDis: true } : {}) }, ev);
}
// A condition of the same action that lasts only as long as the grapple (`whileHeld`: the Restrained of a kraken's Tentacle): it goes on
// only if `e` holds `t`, is tied to that hold (`grapple`), and ends with it (`endHold`). One `t` already has is left as it was.
function heldCondition(s, e, t, step, f, ev) {
  if (!(t.cond.grappled?.holds ?? []).some((h) => h.by === e.id)) return;
  const was = t.cond[step.condition];
  if (was) {                                                                          // from another grapple: this one holds it too; from another source: untagged, left alone
    const list = tiedTo(was);
    if (list.length && !list.includes(e.id)) { was.grapples = [...list, e.id]; delete was.grapple; }
    return;
  }
  condition(s, t, step.condition, ev, f, step, undefined, true);
  if (!t.cond[step.condition]) return;
  t.cond[step.condition].grapples = [e.id];
  const also = CONTENT.conditions[step.condition]?.also;
  if (also) ev.push({ type: 'manual', actor: e.id, name: f.src.name, partial: true, text: `${t.name} is ${conditionName(step.condition)}. The engine applies what it can; the DM applies the rest: ${also}` });
}
// What the DM is told when a hold ends by distance: what moved the two apart. A grappler's own walk never ends a hold, for it drags
// (movement.js); so it is a teleport, or a push, a fall or the DM's placing, said for what it was.
function holdNote(s, g, t, h, ev) {
  const what = ev.some((x) => x.type === 'moved' && x.id === g.id && x.teleport) ? `${g.name} teleported away from ${t.name}` : `${g.name} and ${t.name} are now more than ${h.range} ft apart`;
  ev.push({ type: 'note', id: t.id, text: `${what}, so the grapple ended` });
}
// After every action (engine.js, apply, beside settleBonds): every hold whose grappler is gone from the map, is dead, down or
// Incapacitated (any condition that includes it), or is farther from the held creature than the hold's range, ends (SRD
// "Grappling", Ending a Grapple). A pass after the action cannot miss a way of moving (a push, a teleport, a fall). A condition
// tied to a hold that is no longer there (the DM took the Grappled condition off) ends too. In the order the creatures are kept.
export function settleHolds(s, ev) {
  for (const t of Object.values(s.entities)) {
    for (const h of [...(t.cond?.grappled?.holds ?? [])]) {
      const g = Object.hasOwn(s.entities, h.by) ? s.entities[h.by] : null;
      // A dead creature is held by no one (a removed one takes its holds with it): the hold ends, and the hand is free.
      const why = t.dead ? 'released' : !g ? 'gone' : g.dead || !up(g) || incapacitated(g) ? 'incapacitated' : apart(s, g, t) * FT > h.range ? 'distance' : null;
      if (!why) continue;
      endHold(s, t, h.by, why, ev);
      if (why === 'distance') holdNote(s, g, t, h, ev);
    }
    for (const [c, v] of Object.entries(t.cond ?? {})) {
      const list = tiedTo(v);
      if (!list.length) continue;
      const live = list.filter((id) => (t.cond.grappled?.holds ?? []).some((h) => h.by === id));
      if (live.length === list.length) continue;
      if (live.length) { v.grapples = live; delete v.grapple; if (v.source !== undefined && !live.includes(v.source)) v.source = live[0]; continue; }
      delete t.cond[c];
      ev.push({ type: 'condEnd', id: t.id, cond: c, by: list[0], why: 'released' });
    }
  }
}
// A bonded creature leaves the map: `why` is 'hp0' (it dropped to 0 Hit Points and its bond says it
// vanishes), 'ended' (the lasting effect that kept it ended), 'master' (its master died), 'rest' (its master
// finished a Long Rest, rests.js), 'leash' (it ended too far from its master), 'dismissed', and in a later
// stage 'replaced'. What it was concentrating on and its own lasting effects
// end; a part of another's effect that was on it ends (the effect too, if nothing else was left of it);
// it leaves the fight order (its own turn, if it is going on, passes); what it carried stays behind; the
// record goes. `vanished { id, name, why }` carries `seen` when the party knew of it just before and
// `party` when it was the party's, since view.js can no longer look it up (hidden-information.md).
export function vanish(s, e, why, ev) {
  const seen = !unknown(s, e), party = e.side === 'party', name = e.name;
  if (!seen) return vanishUnseen(s, e, why, ev);
  const shown = seenName(e);                          // what players were shown of it, for the fight's rewards (A3)
  settleSeen(s, e, ev);
  for (const x of Object.values(s.entities)) if (x.follow === e.id) unfollow(s, x, ev);
  if (e.follow) unfollow(s, e, ev);
  leaveGear(s, e, ev, false);
  const enc = s.encounter;
  let theirs = false;
  if (enc) {
    const i = enc.order.findIndex((o) => o.id === e.id);
    if (i >= 0) {
      theirs = i === enc.turn;
      enc.order.splice(i, 1);
      if (i <= enc.turn) enc.turn--;                  // its own turn: the one before stands, and the turn passes below
      if (enc.moved) { delete enc.moved[e.id]; if (!Object.keys(enc.moved).length) delete enc.moved; }
      if (enc.held) delete enc.held[e.id];
      // A foe that took part counts toward the fight's XP as any foe does (companions.md, amendment A3): its record
      // goes, so the fight keeps what the conclusion needs of it (rewards.js, concludeFight). Only a creature the
      // party saw vanish comes here; one it could not see stays as a husk in the order (vanishUnseen) and counts there.
      if (e.side === 'foe') (enc.gone ??= []).push({ id: e.id, name, shown, tpl: e.tpl ?? null });
    }
    // Flags that name it (`hit:<id>:<target>`, `attacked:<id>`) go with it: once it is gone nothing can tell
    // whether players may know of it (view.js filters flags by the creatures there are; review of #313, L2).
    for (const k of Object.keys(enc.flags ?? {})) if (k.split(':').includes(e.id)) delete enc.flags[k];
  }
  // The last foe of a fight to fall vanishes after the fight's conclusion is made (settleBonds runs after the
  // action): marked there, so the card names it as it names a corpse (review of #330, M1).
  const due = !enc && s.conclusion && !s.conclusion.published ? s.conclusion.foes.find((f) => f.id === e.id && !f.gone) : null;
  if (due) Object.assign(due, { gone: true, shown });
  delete s.entities[e.id];
  ev.push({ type: 'vanished', id: e.id, name, why, seen: true, ...(party ? { party: true } : {}) });
  if (why === 'hp0' && e.bond?.kind === 'object')
    ev.push({ type: 'manual', actor: null, name, partial: true, text: `${name} reverts to the object it was. The damage that took it past 0 carries over to that object: the DM's to apply.` });
  if (!s.encounter) return;
  checkEnd(s, ev);
  if (s.encounter && theirs) advanceTurn(s, ev);
}

// A companion the party could not see (round 3 of the review of #313, N2). Taking its record away would
// change what it did as an unseen creature's death never does: a zone it left would lose its caster and stop
// working, conditions and effects would point at nothing, its turn would pass at once. So it stays in the
// state as what such a death leaves: dead, at 0 Hit Points, hidden by the DM's switch for good (`vanished`
// marks it: `reveal` refuses it, settleBonds passes it by), in the fight order as the dead are (skipped, and
// its turn, if it is going on, waits for the DM as a dead creature's does). Only what it carried leaves it,
// onto a pile players are not sent (leaveGear). Everything it did goes on as after any death; the DM is told
// what is left, to end by hand, and may `remove` the record when nothing of it is needed.
function vanishUnseen(s, e, why, ev) {
  const name = e.name, left = [], kind = e.bond?.kind;
  // The husk is no one's companion: it does not count toward its master's companions (BOND_MAX, and a master
  // can't itself be bonded while it has any), and it is what any unseen death leaves (review of #313, round 4, L2).
  delete e.bond;
  leaveGear(s, e, ev, true);
  e.gear = [];
  if (Array.isArray(e.sheet?.items)) { e.sheet.items = []; delete e.sheet.attuning; }
  if (!e.dead) { e.hp = 0; e.dead = true; concentrationLost(s, ev, e, `${name} vanished`); }      // gone, not killed: no `died`
  e.hidden = true;
  e.vanished = why;
  for (const fx of effectsOf(s)) {
    if (fx.source === e.id) left.push(`${fx.name} (its own)`);
    else if (fx.parts.some((p) => !p.ended && (p.target === e.id || p.ends?.who === e.id))) left.push(`${fx.name} (a part on it, or ending with its turn)`);
  }
  for (const x of Object.values(s.entities)) for (const [c, v] of Object.entries(x.cond ?? {})) if (x.id !== e.id && v?.source === e.id) left.push(`${x.name} is ${conditionName(c)} from it`);
  ev.push({ type: 'vanished', id: e.id, name, why });
  ev.push({ type: 'manual', actor: null, name, partial: true,
    text: `${name} vanished where the party could not see it. So that the party learns nothing it could not, its record stays, dead and hidden, and what it did goes on as after a death${left.length ? `: ${left.join('; ')}` : ''}. End what should end (endEffect, condition) when the party could know, and remove ${name} when nothing of it is needed.${inFight(s, e.id) ? ` If this fight is won, ${name} counts toward its XP as any death does, unless you untick it.` : ''}` });
  if (why === 'hp0' && kind === 'object')
    ev.push({ type: 'manual', actor: null, name, partial: true, text: `${name} reverts to the object it was. The damage that took it past 0 carries over to that object: the DM's to apply.` });
  checkEnd(s, ev);
}

// A weapon changed for a while (imbue.js) that its creature no longer has a record for (put away, a remake without it, the creature gone) is not changed any more
// ("The spell ends early if ... you let go of the weapon"; Sacred Weapon: "if you aren't carrying the weapon"). Run with the settle pass after every action.
export function settleImbue(s, ev) {
  for (const fx of [...effectsOf(s)]) {
    let ended = false;
    for (const p of fx.parts) {
      if (!p.imbue || p.ended) continue;
      const h = Object.hasOwn(s.entities, p.target) ? s.entities[p.target] : null;
      if (h?.form && !h.dead) continue;                                  // in a form (Wild Shape) its gear is still its own, held or not
      if (h && !h.dead && (h.attacks ?? []).some((a) => a.weapon && weaponKey(a) === p.imbue.weapon)) continue;
      p.ended = true; ended = true;
    }
    if (ended && fx.parts.every((p) => p.ended)) endEffect(s, ev, fx, 'the weapon is no longer held');
  }
}

// After every action (engine.js, apply): a companion at 0 Hit Points whose bond says it vanishes, one
// kept by a lasting effect that no longer holds it (its `summon` part ended, or the effect did: durations.js,
// holds), one whose bond ends when its master dies and whose master is dead, and one farther than its leash
// from its master, leave the map (vanish). In the order the creatures are kept, so it replays exactly.
export function settleBonds(s, ev) {
  settleImbue(s, ev);                                                  // a weapon no longer held is no longer imbued (imbue.js)
  settleRiders(s, ev);
  const n = ev.length;
  for (const e of Object.values(s.entities).filter((x) => x.bond)) {
    if (!Object.hasOwn(s.entities, e.id) || e.vanished) continue;      // gone already (vanishUnseen)
    const b = e.bond, m = typeof b.to === 'string' && Object.hasOwn(s.entities, b.to) ? s.entities[b.to] : null;
    if ((e.dead || e.hp <= 0) && b.at0 === 'vanish') vanish(s, e, 'hp0', ev);
    else if (b.fx && !holds(s, e)) { if (b.lapse === 'foe') lapse(s, e, m, ev); else vanish(s, e, 'ended', ev); }
    else if (m?.dead && Array.isArray(b.ends) && b.ends.includes('masterDies')) vanish(s, e, 'master', ev);
    else if (m && !e.dead && Number.isFinite(b.leash) && apart(s, e, m) * FT > b.leash) vanish(s, e, 'leash', ev);
  }
  // A mount that vanished just now (a Find Steed whose master died with someone else on it) leaves its rider down where
  // it stands in this same action, not at the next one (found by the C7 stress loop: the ride was half a pair between).
  if (ev.slice(n).some((x) => x.type === 'vanished')) settleRiders(s, ev);
  // A companion whose place behind its master can now be taken (its master joined, or came to be known to the
  // party) takes it, if that is safe in the middle of the round (world.js, followMasters).
  followMasters(s, true);
}

// The 24 hours of control of a creature raised from a corpse ran out (Decision 7; owner's question 5; stage C5b): the
// bond ends, the creature stays where it is, and it "stops obeying any command you've given it": no longer its
// master's, a foe the DM plays. That happens in the middle of a fight too (the SRD gives it no choice), where it keeps
// its place in the order. The DM is told (`manual`, the DM's alone); the party's own caster's player is told that it
// no longer obeys, which they would know (the control is the caster's own); nothing reaches players of a foe's. One
// that is dead by then is only freed: a corpse has nothing to obey.
function lapse(s, e, m, ev) {
  const from = e.bond.to, src = SPELLS[e.bond.source]?.name ?? 'the spell', was = e.side, mine = !!m && m.side === 'party';
  delete e.bond;
  ev.push({ type: 'unbonded', id: e.id, from, why: 'lapsed' });
  if (e.dead) return;
  if (was !== 'foe') {
    if (e.follow) unfollow(s, e, ev);
    for (const x of Object.values(s.entities)) if (x.follow === e.id) unfollow(s, x, ev);
    e.side = 'foe';
  }
  const who = m?.name ?? 'its master';
  if (mine) ev.push({ type: 'manual', actor: m.id, name: src, text: `${e.name} no longer obeys ${who}: ${src}'s 24 hours of control are over.` });
  ev.push({ type: 'manual', actor: null, name: src, partial: true,
    text: `${e.name} is no longer under ${who}'s control: ${src}'s 24 hours ran out without the spell being cast on it again. It obeys no command and ${was === 'foe' ? 'is the DM\'s to play as it likes' : 'has joined the foes, the DM\'s to play'}.` });
  // A new foe in a fight going on: whether the fight still stands is settled now, not at the next action. (A party
  // creature that is not a character does not keep the party standing, partyOf, so this can only keep a fight going.)
  checkEnd(s, ev);
}

// ---------- the summon step (docs/specs/companions.md, Decision 2; stage C3) ----------

// How many creatures a step's `count` (or `reassert`) gives at spell level `slot`: a whole number, or { slot, base, above }.
export const summonCount = (c, slot) => (c === undefined ? 1 : Number.isInteger(c) ? c : (c.base ?? 0) + c.slot * (slot - (c.above ?? 0)));
// What `on: 'corpse'` works on (Decision 7; both SRD spells that raise corpses, Animate Dead and Create Undead, say the
// same): the corpse of a Medium or Small Humanoid. Control lasts 24 hours.
export const CORPSE = { sizes: ['small', 'medium'], type: 'humanoid', control: '24 hours' };

// What a summon step makes, for its master `m` and the choices `pick` ({ variant?, type?, form? }) at spell level
// `slot` with the master's numbers `caster`: { tplId, record, type, name }. The cast checked all of it.
export function summonMade(step, pick, slot, caster) {
  if (step.forms !== undefined) {
    const m = CONTENT.monsters[pick.form];
    return { tplId: pick.form, record: MONSTERS[pick.form], type: pick.type ?? m.type, name: m.name };
  }
  if (CONTENT.summons[step.summon]) {
    const t = summonTemplate(step.summon, { slot, caster, ...(pick.variant !== undefined ? { variant: pick.variant } : {}), ...(pick.type !== undefined ? { type: pick.type } : {}) });
    return { tplId: step.summon, record: t.record, type: t.type, name: t.name };
  }
  const m = CONTENT.monsters[step.summon];
  return { tplId: step.summon, record: MONSTERS[step.summon], type: pick.type ?? m.type, name: m.name };
}
// `over` (Phantom Steed's Speed 100): its speeds replaced on the made record.
function overRecord(record, over) {
  if (!over?.speed) return record;
  const r = structuredClone(record);
  for (const [k, v] of Object.entries(over.speed)) { if (k === 'walk') r.speed = v; else (r.speeds ??= {})[k] = v; }
  return r;
}
// A summon cast with no `summon` field (engine/casting.js, summonFor; #332): nothing is made. The DM is told what
// this casting would make and with which numbers (each choice of the block baked at this level with the master's
// numbers, as the step would bake it), where it may go and how to add it. That line is the DM's alone (`partial`): the
// numbers are the block's. The player's own line says only that the DM adds what it summons (#331 review, M1/M2).
const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);
const or = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`);
const an = (w) => `${/^[aeiou]/i.test(w) ? 'an' : 'a'} ${w}`;
function summonHandOver(s, m, step, src, ev) {
  const { slot, caster, count } = src.summon, block = !!CONTENT.summons[step.summon], def = SPELLS[src.spell]?.def;
  const cap = (w) => `${w[0].toUpperCase()}${w.slice(1)}`;
  // The numbers `spawn` gives: a block baked for this casting, or the pack monster as it is (`over`, a Speed the spell
  // replaces, is not something `spawn` or any DM tool sets, so it is said apart).
  const core = (made) => {
    const r = made.record, moves = Object.entries(r.speeds ?? {}).map(([k, v]) => `${cap(k)} ${v} ft.`);
    return `${made.name} (AC ${r.ac}, ${r.hp} Hit Points, Speed ${[`${r.speed} ft.`, ...moves].join(', ')}`;
  };
  let what, over = '', single = false;
  if (step.forms !== undefined) {
    what = Array.isArray(step.forms) ? or(step.forms.map((f) => CONTENT.monsters[f]?.name ?? f)) : `any ${step.forms.type} of Challenge Rating ${step.forms.cr}`;
  } else {
    // Picks that bake to the same numbers are listed once, with every size or creature type they cover (Draconic
    // Spirit's five breath types; Animated Object's Tiny, Small and Medium; the steed's three creature types).
    const groups = new Map();
    for (const variant of step.variants ?? [undefined]) for (const type of (block ? step.types : null) ?? [undefined]) {
      const pick = { ...(variant !== undefined ? { variant } : {}), ...(type !== undefined ? { type } : {}) };
      const made = summonMade(step, pick, slot, caster), key = core(made), g = groups.get(key) ?? { sizes: [], types: [] };
      if (!g.sizes.includes(made.record.size)) g.sizes.push(made.record.size);
      if (type !== undefined) g.types.push(type);
      groups.set(key, g);
    }
    what = or([...groups].map(([key, g]) => `${key.replace(' (AC', g.types.length ? ` as a ${or(g.types)} (AC` : ' (AC')}, ${or(g.sizes.map(cap))})`));
    single = groups.size === 1 && !!step.variants;
    const o = step.over?.speed;
    if (o && !block) over = ` The spell gives it Speed ${or(Object.entries(o).map(([k, v]) => `${k === 'walk' ? '' : `${k} `}${v} ft.`))}, which \`spawn\` does not set: the DM notes that by hand.`;
  }
  const choose = step.forms !== undefined || step.variants || (block && step.types);
  const objects = step.summon === 'animated-object';
  const types = step.types && !block ? `, of a creature type the caster picks (${or(step.types)}; \`spawn\` takes no creature type for a pack monster, so the DM notes the type by hand)` : '';
  const picked = single ? ` The caster's pick (${or(step.variants)}) changes none of these numbers; it is in the block's text.` : '';
  const numbers = block ? ` Its numbers are baked from ${m.name}'s: spell attack ${signed(caster.attack)}, spell save DC ${caster.dc}, Proficiency Bonus ${signed(caster.pb)}.${picked}` : '';
  const spawn = block ? `spawn with monster ${step.summon}, slot ${slot}${step.variants ? ', the variant' : ''}${step.types ? ', kind (its creature type)' : ''} and caster ${m.id}`
    : `spawn with the monster${step.forms !== undefined ? ' picked' : ` ${step.summon}`}`;
  const rest = (def?.effects ?? []).some((x) => !('summon' in x) && !('manual' in x)) ? ` The rest of ${src.name} that needs no creature, such as a Resistance it gives ${m.name}, was applied as usual.` : '';
  const tier = def && def.tier !== 'auto' ? ` ${def.text}` : '';
  const adds = objects ? `up to ${Math.max(caster.mod, 0)} objects (a Large counts as two, a Huge as three), of the size the caster picks`
    : count === 1 ? `the creature${choose ? ' the caster picks' : ''}` : `${count} creatures${choose ? ', of the kind the caster picks' : ''}`;
  const b = step.bond ?? {};
  // One per master (C5c): what the casting does to the one the master has, which the cast with picks would have done.
  const olds = (src.summon.had ?? []).map((id) => s.entities[id]?.name ?? m.pocket?.[id]?.name ?? id);
  const had = !olds.length ? '' : step.one === 'reform'
    ? ` ${m.name} already has ${olds[0]}: by the spell it takes the new form instead, where it is. The cast with \`summon: { form, type }\` (no space) does that; or the DM edits it.`
    : ` ${m.name} already has ${or(olds)}: by the spell the new one replaces it. The cast with picks does that; by hand the DM removes the old one.`;
  // Players are told only that the DM has something to add: no numbers, and nothing that says a creature exists.
  // (A hidden caster's line is dropped by the view, as any manual line of a creature the party does not know of.)
  ev.push({ type: 'manual', actor: m.id, name: src.name, text: `${src.name}: the DM adds what it summons.` });
  ev.push({ type: 'manual', actor: m.id, name: src.name, partial: true,
    text: `${src.name} was cast at level ${slot} with nothing picked for the engine to summon, so it made nothing. The DM adds ${adds}: ${what}${types}.${over}${numbers}`
      + ` ${count === 1 && !objects ? 'It goes' : 'Each goes'} in an unoccupied space within ${src.range} ft. that ${m.name} can see (inside the arena in a fight). The DM's ${spawn} makes ${count === 1 && !objects ? 'it' : 'each'}; bond ${count === 1 && !objects ? 'it' : 'each'} to ${m.name} as ${an(b.kind ?? 'companion')}${b.turn ? ` with turn ${b.turn}` : ''}.`
      + `${src.fx ? ` A creature added so is not kept by the spell: the DM removes it when ${src.name} ends.` : ''}${had}${rest}${tier}` });
}

// Make the creatures `src.summon` names (checked when the spell was cast, engine/casting.js): each an ordinary
// creature from the baked block or the pack monster, on its master's side, with a bond to it. One made by a
// spell that lasts is a part of that spell's lasting effect (`{ target, summon: true }`), so ending the effect
// ends it (settleBonds). A foe's is named as the DM's `spawn` names a creature ("Giant Wasp 2"), so its name
// says nothing of its master; the party's is "Ven's Giant Wasp". It joins a fight going on if it stands in the
// arena, as a spawned creature does, straight after a master the party knows of (world.js, joinEncounter).
// `summoned { id, by, kind, fx? }`: players get it as `spawned` unless they know of its master (view.js).
function summon(s, m, step, src, ev) {
  const pick = src.summon;
  if (!pick) return ev.push({ type: 'manual', actor: m.id, name: src.name, text: `${src.name} names no spaces for the engine to summon into. The DM adds the creature.` });
  if (step.on === 'corpse') return pick.ids ? raise(s, m, step, src, ev) : corpseHandOver(m, step, src, ev);
  if (pick.reform) return reform(s, m, step, src, ev);
  if (!pick.at) return summonHandOver(s, m, step, src, ev);
  const made = summonMade(step, pick, pick.slot, pick.caster), record = overRecord(made.record, step.over);
  const fx = src.fx ? effectsOf(s).find((x) => x.id === src.fx) ?? null : null;
  const b = step.bond;
  // One per master (`one: 'replace'`, Find Steed): the one the master had goes first, so its space is free for the new one.
  for (const id of pick.replace ?? []) if (Object.hasOwn(s.entities, id)) vanish(s, s.entities[id], 'replaced', ev);
  for (const want of pick.at) {
    const at = nearestFree(s, { size: record.size }, want);
    // Both lines are the DM's alone (`partial`): a player caster must not be told a creature it does not know of is there.
    if (!at) { ev.push({ type: 'manual', actor: m.id, name: src.name, partial: true, text: `The space named for ${src.name} is taken by a creature ${m.name} did not know of, and the engine found no unoccupied space near it, so nothing appeared. The DM places the creature (the player has not been told why).` }); continue; }
    if (at !== want) ev.push({ type: 'manual', actor: m.id, name: src.name, partial: true, text: `A creature ${m.name} did not know of stands in the space named for ${src.name}, so the creature appeared in the nearest unoccupied space.` });
    const id = `m${++s.seq}`;
    const n = Object.values(s.entities).filter((o) => o.tpl === made.tplId && (!CONTENT.summons[made.tplId] || o.name?.startsWith(`${made.name} `))).length + 1;
    const bond = { to: m.id, kind: b.kind, source: src.spell ?? null, fx: fx ? fx.id : null, turn: b.turn, orders: b.orders ?? 'free', at0: b.at0, ends: [...(b.ends ?? [])],
      ...(b.range !== undefined ? { range: b.range } : {}), ...(b.leash ? { leash: b.leash } : {}), ...(b.noAttack ? { noAttack: true } : {}), ...(b.mount ? { mount: b.mount } : {}), slot: pick.slot, commanded: b.first === 'commanded' && s.encounter ? { order: null, at: turnKey(s) } : null, auto: false };
    const e = makeEntity(record, { id, tpl: made.tplId, name: m.side === 'party' ? `${m.name}'s ${made.name}` : `${made.name} ${n}`, pos: at, side: m.side, ...(made.type ? { type: made.type } : {}), bond });
    invested(m, e, pick, ev);
    s.entities[id] = e;
    if (fx) fx.parts.push({ target: id, summon: true });
    ev.push({ type: 'summoned', id, by: m.id, kind: b.kind, ...(fx ? { fx: fx.id } : {}) });
    if (e.side === 'party') lookAround(s, ev, [e]);                 // what a party member sees, the party sees
    if (s.encounter?.arena[col(at)]) joinEncounter(s, e, ev);
  }
}

// Investment of the Chain Master (docs/specs/companions.md, C9c): the casting's choices baked into the creature it made or
// reformed (summons.js, investIn). A caster with the feature who left the choices out (a client with no chooser for them yet)
// gets the creature as the spell alone makes it, and the DM is told what the feature would have given.
function invested(m, e, pick, ev) {
  if (pick.invest) investIn(e, pick.invest, pick.caster.dc);
  if (!pick.uninvested) return;
  const f = (m.feats ?? []).find((x) => x.id === pick.uninvested), I = f?.invest;
  if (!I) return;
  ev.push({ type: 'manual', actor: m.id, name: f.name, partial: true,
    text: `${m.name} cast without ${f.name}'s choices, so ${e.name} was made without them: ${[I.speed ? `a ${I.speed.of.join(' or ')} Speed of ${I.speed.feet} feet` : '', I.damage ? `${I.damage.to.join(' or ')} damage instead of ${I.damage.from.join(', ')}, if chosen` : ''].filter(Boolean).join('; ')}. Cast again with them, or the DM applies them.${I.saveDc ? ` It uses ${m.name}'s spell save DC all the same.` : ''}` });
}
// The save DC of a familiar's action (Investment of the Chain Master's `saveDc`; review of #467, 2): "If the familiar forces a
// creature to make a saving throw, it uses your spell save DC" is a standing rule, so while its master is on the map and has the
// feature for the spell that made it, every save its actions force is against the master's spell save DC now (a level gained or a
// Charisma raised counts). The number baked at the casting stays as the fallback for a master who is gone. `steps` is a copy.
function masterDc(s, e, steps) {
  const b = e.bond, m = b?.kind === 'familiar' && typeof b.to === 'string' && Object.hasOwn(s.entities, b.to) ? s.entities[b.to] : null;
  const f = m && (m.feats ?? []).find((x) => x.invest?.saveDc && x.invest.spell === b.source);
  if (!f) return;
  const dc = spellStats(m, s, f.invest.spell).dc;
  if (Number.isInteger(dc)) walkSteps(steps, (st) => { if (typeof st.save === 'string' && typeof st.dc === 'number') st.dc = dc; });
}

// ---------- one per master, and the pocket dimension (Decisions 2 and 6; stage C5c) ----------

// The creatures a step with `one` acts on: master `m`'s companions of the step's kind made by this same spell, on the map
// (and, for `reform`, in its pocket dimension: a familiar there is still the master's). The SRD's "you can't have more
// than one familiar at a time" and "if you already have a steed from this spell" (Find Familiar, Find Steed).
export function oneOf(s, m, step, spell) {
  if (!step?.one) return [];
  const mine = (x) => x?.bond?.to === m.id && x.bond.kind === step.bond?.kind && x.bond.source === spell && !x.vanished;
  return [...Object.values(s.entities).filter(mine), ...(step.one === 'reform' ? pocketOf(m).filter(mine) : [])];
}
// What a familiar keeps when it takes a new form (`reform`): where it is and what is going on with it. The rest is the new
// form's statistics, Hit Points at the new form's maximum ("the familiar has the statistics of the chosen form").
const KEPT_ON_REFORM = ['cond', 'reactionUsed', 'gear', 'hidden', 'hiding', 'follow', 'light', 'look', 'away'];
// Find Familiar cast while the master has a familiar (`one: 'reform'`; SRD "One Familiar Only": "you instead cause it to
// adopt a new eligible form"): the same creature, same id, where it is (on the map, or in the pocket dimension), takes the
// form and creature type picked. It is made again from the new form's block, so its statistics and Hit Points (at the
// form's maximum) are the new form's; its place, conditions, Reaction, what it carries, its light and look, whether it is
// hidden or hiding and whom it follows stay, as does its place in a fight. `reformed { id, by, form, name, pocket? }`.
function reform(s, m, step, src, ev) {
  const pick = src.summon, id = pick.reform, inPocket = !Object.hasOwn(s.entities, id);
  const old = inPocket ? m.pocket[id] : s.entities[id];
  const made = summonMade(step, pick, pick.slot, pick.caster), record = overRecord(made.record, step.over), b = step.bond;
  const fx = src.fx ? effectsOf(s).find((x) => x.id === src.fx) ?? null : null;
  const n = Object.values(s.entities).filter((o) => o.id !== id && o.tpl === made.tplId).length + 1;
  const bond = { to: m.id, kind: b.kind, source: src.spell ?? null, fx: fx ? fx.id : null, turn: b.turn, orders: b.orders ?? 'free', at0: b.at0, ends: [...(b.ends ?? [])],
    ...(b.range !== undefined ? { range: b.range } : {}), ...(b.leash ? { leash: b.leash } : {}), ...(b.noAttack ? { noAttack: true } : {}), ...(b.mount ? { mount: b.mount } : {}), slot: pick.slot, commanded: null, auto: old.bond?.auto === true };
  const e = makeEntity(record, { id, tpl: made.tplId, name: m.side === 'party' ? `${m.name}'s ${made.name}` : `${made.name} ${n}`, pos: { ...old.pos }, side: old.side, ...(made.type ? { type: made.type } : {}), bond });
  invested(m, e, pick, ev);
  for (const k of KEPT_ON_REFORM) if (old[k] !== undefined) e[k] = structuredClone(old[k]);
  if (old.bond?.order !== undefined) e.bond.order = old.bond.order;
  if (inPocket) m.pocket[id] = e; else s.entities[id] = e;
  if (fx) fx.parts.push({ target: id, summon: true });
  ev.push({ type: 'reformed', id, by: m.id, form: made.tplId, name: e.name, ...(inPocket ? { pocket: true } : {}) });
}

// Take a creature out of the fight's order, as a vanish does (it is no longer on the map). True if it was its own turn.
function outOfOrder(s, e) {
  const enc = s.encounter;
  if (!enc) return false;
  const i = enc.order.findIndex((o) => o.id === e.id);
  let theirs = false;
  if (i >= 0) {
    theirs = i === enc.turn;
    enc.order.splice(i, 1);
    if (i <= enc.turn) enc.turn--;
    if (enc.moved) { delete enc.moved[e.id]; if (!Object.keys(enc.moved).length) delete enc.moved; }
    if (enc.held) delete enc.held[e.id];
  }
  for (const k of Object.keys(enc.flags ?? {})) if (k.split(':').includes(e.id)) delete enc.flags[k];
  return theirs;
}
// What the familiar loses as it goes into the pocket dimension: nobody holds it there, it is not lying down, and what it
// did with its turn is over.
const LEFT_IN_POCKET = ['grappled', 'prone', 'dodging', 'disengaged'];
// A familiar dismissed to its master's pocket dimension (companions.js, `dismiss`; Decision 6): it leaves the map. What it
// wore or carried stays in its space (SRD: "Whenever the familiar ... disappears into the pocket dimension, it leaves behind
// in its space anything it was wearing or carrying"; leaveGear). What it did that lasts ends, and what was on it, as for a
// creature that vanished (settleSeen); those following it stop; it leaves the fight's order. Its record, with its Hit Points,
// goes to `m.pocket[id]`, out of `state.entities`, so nothing on the map, in sight or in the fight sees it. `pocketed { id, by,
// name, seen?, party? }`: `seen` when the party knew of it just before, as `vanished` says it (view.js).
export function pocket(s, m, e, ev) {
  const seen = !unknown(s, e), party = e.side === 'party', name = e.name;
  settleSeen(s, e, ev, 'went to a pocket dimension');
  for (const x of Object.values(s.entities)) if (x.follow === e.id) unfollow(s, x, ev);
  if (e.follow) unfollow(s, e, ev);
  const lit = e.light?.item && LIGHTS[e.light.item] ? LIGHTS[e.light.item].name : null;
  if (lit) e.gear = [...(Array.isArray(e.gear) ? e.gear : []), lit];
  else if (e.light) ev.push({ type: 'manual', actor: null, name, partial: true, text: `${name} carried a light (${e.light.bright} ft bright, ${e.light.dim} ft dim) that is no named item. It went to a pocket dimension without it: the DM sets the light down in its space if it should go on shining.` });
  leaveGear(s, e, ev, !seen, 'went to a pocket dimension');
  e.gear = [];
  if (Array.isArray(e.sheet?.items)) { e.sheet.items = []; delete e.sheet.attuning; }
  for (const c of LEFT_IN_POCKET) if (e.cond) delete e.cond[c];
  delete e.hiding; delete e.away;
  // A light it carried is one of the things it carried: it stays too (leaveGear puts a torch or lamp by name on the pile).
  delete e.light;
  const fought = inFight(s, e.id), theirs = outOfOrder(s, e);
  // A foe the party saw leave a fight counts toward its XP as one that vanished does (A3); back in the fight's order before
  // the end, it is counted there and not twice (rewards.js, concludeFight).
  if (fought && seen && e.side === 'foe' && !(s.encounter.gone ?? []).some((g) => g.id === e.id)) (s.encounter.gone ??= []).push({ id: e.id, name, shown: seenName(e), tpl: e.tpl ?? null });
  delete s.entities[e.id];
  if (!m.pocket || typeof m.pocket !== 'object' || Array.isArray(m.pocket)) m.pocket = {};
  m.pocket[e.id] = e;
  ev.push({ type: 'pocketed', id: e.id, by: m.id, name, ...(seen ? { seen: true } : {}), ...(party ? { party: true } : {}) });
  if (!s.encounter) return;
  checkEnd(s, ev);
  if (s.encounter && theirs) advanceTurn(s, ev);
}
// A familiar brought back from the pocket dimension (companions.js, `recall`) to `at`, checked there: the same record, id
// and Hit Points. A party one looks around (what it sees, the party sees); in the arena of a fight going on it joins it as
// any creature that arrives does (world.js, joinEncounter, with the C2 rules: a familiar rolls its own Initiative).
// `recalled { id, by, at }`; players who do not know of the master are told what a creature the DM adds tells them (view.js).
export function unpocket(s, m, id, at, ev) {
  const e = m.pocket[id];
  delete m.pocket[id];
  if (!Object.keys(m.pocket).length) delete m.pocket;
  e.pos = { q: at.q, r: at.r, z: at.z ?? 0 };
  s.entities[id] = e;
  ev.push({ type: 'recalled', id, by: m.id, at: { ...e.pos } });
  if (e.side === 'party') lookAround(s, ev, [e]);
  if (s.encounter?.arena[col(e.pos)]) joinEncounter(s, e, ev);
  // Back in the fight it went from, it is one of the fight's creatures again, not one that left it (A3; review of #343, L6).
  const enc = s.encounter;
  if (enc?.gone && inFight(s, id)) { enc.gone = enc.gone.filter((g) => g.id !== id); if (!enc.gone.length) delete enc.gone; }
}
// A familiar in the pocket dimension dismissed forever: its record goes. Nothing of it is on the map, so nothing else ends.
export function unpocketForever(s, m, id, ev) {
  const e = m.pocket[id], party = e.side === 'party';
  delete m.pocket[id];
  if (!Object.keys(m.pocket).length) delete m.pocket;
  // Players know of it only where they know of its master's pocket: the party's own (view.js).
  ev.push({ type: 'vanished', id, name: e.name, why: 'dismissed', ...(party ? { seen: true, party: true } : {}), pocket: true });
}

// ---------- corpses (Decision 7; stage C5b, #340) ----------

// Its 24 hours of control, a lasting effect of its own for each creature (so ending one, by the DM's `remove` or a
// vanish, frees no other), held by a `bond` part (durations.js, holds): when it ends, settleBonds frees it (lapse).
function control24(s, m, src, id) {
  const fx = startEffect(s, { name: src.name, spell: src.spell, source: m.id, conc: false, duration: CORPSE.control });
  fx.parts.push({ target: id, bond: true });
  return fx;
}
// The corpses `src.summon.ids` names rise, or the master's own creatures of this spell are kept under control for
// another 24 hours (checked when the spell was cast, engine/casting.js, corpsesFor). A corpse leaves as the DM's
// `remove` takes a creature (`removed`, with `seen` and `party` for view.js; what was still on it ends as for a seen
// vanish; its companions are freed; what it carried stays in its space, as a vanish leaves it), and the step's
// creature is made in its space (the nearest unoccupied one if a creature stands there now), named as a summon is:
// "Ven's Zombie" for the party, "Zombie 2" for a foe, so its name says nothing of the corpse or of a master.
// Players who do not know of the master are sent `spawned` as for any creature the DM adds (view.js).
function raise(s, m, step, src, ev) {
  const pick = src.summon, b = step.bond, made = summonMade(step, {}, pick.slot, pick.caster);
  if (!pick.raise) {
    for (const id of pick.ids) {
      const t = s.entities[id], old = effectsOf(s).find((x) => x.id === t.bond.fx);
      const fx = control24(s, m, src, id);
      t.bond.fx = fx.id;
      if (old) endEffect(s, ev, old, `${m.name} renewed it`);
      ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: m.id, conc: false, lasts: fx.lasts, targets: [id] });
      ev.push({ type: 'reasserted', id, by: m.id, fx: fx.id });
    }
    return;
  }
  for (const id of pick.ids) {
    const t = s.entities[id], at0 = { ...t.pos }, seen = !unknown(s, t);
    // As the DM's `remove` does, and what was still on it ends as for a creature that vanished where the party saw it.
    settleSeen(s, t, ev, 'is gone');
    for (const x of Object.values(s.entities)) if (x.bond?.to === t.id) { delete x.bond; ev.push({ type: 'unbonded', id: x.id, from: t.id }); }
    // A familiar in the dead master's pocket dimension (stage C5c) has nowhere to come back to: the master is no more. It
    // goes, as dismissed forever, and the DM is told (the SRD says nothing of it; the DM may `spawn` it again).
    for (const x of pocketOf(t)) {
      ev.push({ type: 'vanished', id: x.id, name: x.name, why: 'master', ...(t.side === 'party' ? { seen: true, party: true } : {}), pocket: true });
      ev.push({ type: 'manual', actor: null, name: x.name, partial: true, text: `${x.name} was in ${t.name}'s pocket dimension when ${t.name}'s corpse rose, so it is gone with its master's record. The SRD says nothing of this; the DM may spawn it again.` });
    }
    leaveGear(s, t, ev, !seen, 'rose as undead');
    // On a fight's card that is not yet published it is named as one the party saw go (A3), if it did.
    const due = !s.encounter && s.conclusion && !s.conclusion.published ? s.conclusion.foes.find((f) => f.id === t.id && !f.gone) : null;
    if (due && seen) Object.assign(due, { gone: true, shown: seenName(t) });
    ev.push({ type: 'removed', id: t.id, name: t.name, ...(seen ? { seen: true } : {}), ...(t.side === 'party' ? { party: true } : {}) });
    for (const x of Object.values(s.entities)) if (x.follow === t.id) unfollow(s, x, ev);
    delete s.entities[t.id];
    const at = nearestFree(s, { size: made.record.size }, at0);
    if (!at) { ev.push({ type: 'manual', actor: m.id, name: src.name, partial: true, text: `${t.name}'s corpse rose, but the engine found no unoccupied space near it for the ${made.name}, so nothing appeared. The DM places it (the player has not been told why).` }); continue; }
    if (at.q !== at0.q || at.r !== at0.r) ev.push({ type: 'manual', actor: m.id, name: src.name, partial: true, text: `A creature stands where ${t.name}'s corpse lay, so the ${made.name} rose in the nearest unoccupied space.` });
    const nid = `m${++s.seq}`;
    const fx = control24(s, m, src, nid);
    const n = Object.values(s.entities).filter((o) => o.tpl === made.tplId).length + 1;
    const bond = { to: m.id, kind: b.kind, source: src.spell ?? null, fx: fx.id, turn: b.turn, orders: b.orders, range: b.range, at0: b.at0, ends: [...(b.ends ?? [])],
      lapse: 'foe', slot: pick.slot, commanded: null, auto: false };
    const e = makeEntity(made.record, { id: nid, tpl: made.tplId, name: m.side === 'party' ? `${m.name}'s ${made.name}` : `${made.name} ${n}`, pos: at, side: m.side, bond });
    s.entities[nid] = e;
    ev.push({ type: 'summoned', id: nid, by: m.id, kind: b.kind, fx: fx.id, corpse: t.id });
    ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: m.id, conc: false, lasts: fx.lasts, targets: [nid] });
    if (e.side === 'party') lookAround(s, ev, [e]);
    if (s.encounter?.arena[col(at)]) joinEncounter(s, e, ev);
  }
}
// A corpse spell cast with no `summon` field (#332, as summonHandOver): nothing changes. The DM is told what this
// casting could have done, with the creature's numbers, and how to do it by hand; players are told only that the DM
// applies it, with no number and nothing that says a corpse or a creature exists.
function corpseHandOver(m, step, src, ev) {
  const { slot, caster, count, reassert } = src.summon, def = SPELLS[src.spell]?.def, b = step.bond ?? {};
  const made = summonMade(step, {}, slot, caster), r = made.record;
  const moves = Object.entries(r.speeds ?? {}).map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)} ${v} ft.`);
  const stat = `${made.name} (AC ${r.ac}, ${r.hp} Hit Points, Speed ${[`${r.speed} ft.`, ...moves].join(', ')})`;
  const corpses = count === 1 ? 'the corpse of a Medium or Small Humanoid' : `up to ${count} corpses of Medium or Small Humanoids`;
  ev.push({ type: 'manual', actor: m.id, name: src.name, text: `${src.name}: the DM applies it.` });
  ev.push({ type: 'manual', actor: m.id, name: src.name, partial: true,
    text: `${src.name} was cast at level ${slot} with no corpse or creature named for the engine, so it changed nothing. It could have raised ${corpses} within ${src.range} ft. of ${m.name}, each as a ${stat}, or kept up to ${reassert} of the creatures ${m.name} made with ${src.name} under control for another 24 hours.`
      + ` By hand: remove each corpse, spawn the monster ${step.summon} in its space, and bond it to ${m.name} as undead with orders command. A creature bonded so has no command range (the spell's is ${b.range} ft.) and its 24 hours are not timed: when they run out, free it (bond with to: null) and play it as a foe.${def && def.tier !== 'auto' ? ` ${def.text}` : ''}` });
}

// ---------- actions ----------

// Run the effect stack to the end, then whatever zones went off while it ran (zones.js).
export function resolve(s, ev) { run(s, ev, KIT); flushZones(s, ev, KIT); }

// The engine's machinery, lent to the effect runner (effects.js) so it need not know our internals.
// Evasion (a built character's `evasion`): only while it is not Incapacitated.
export const evades = (t) => !t.object && !incapacitated(t) && (t.feats ?? []).some((f) => f.evasion);

// Why a spell's area was handed to the DM, where it is one the engine will not place: a cube of more than 1,000 feet (effects.js, aimable).
function whyNobody(src) {
  const area = typeof src.spell === 'string' && Object.hasOwn(SPELLS, src.spell) ? SPELLS[src.spell].def.target?.area : null;
  return area?.shape === 'cube' && area.size > CUBE_AIM_MAX ? 'Its area is a cube of more than 1,000 feet, which the engine does not place. The DM places the area, picks the creatures it catches and applies the effect. ' : '';
}
ON.sizeEnd = sizeEnd;

// ---------- Polymorph (a `polymorph` step; docs/specs/rules-expansion.md, "Build notes: wave 5 part 4") ----------
// The Challenge Rating a creature counts as for Polymorph: its stat block's, or its level (a character's total level) where it has none.
const crOf = (t) => { const m = Object.hasOwn(CONTENT.monsters, t.tpl ?? '') ? CONTENT.monsters[t.tpl] : null; return m && typeof m.cr === 'number' ? m.cr : (t.level ?? 0); };
const crWord = (n) => ({ 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' })[n] ?? String(n);
// Why the Beast `id` is not one Polymorph may turn `t` into (null if it is). Reads the target's Challenge Rating or level, so a cast must not say it to a player about a creature that is not of the party.
export function beastWhy(t, id) {
  const m = Object.hasOwn(CONTENT.monsters, id) ? CONTENT.monsters[id] : null;
  if (!m || m.type !== 'beast') return `${id} is not a Beast.`;
  const cap = crOf(t);
  return m.cr <= cap ? null : `The ${m.name} has Challenge Rating ${crWord(m.cr)}, and ${t.name}'s is ${crWord(cap)}${Object.hasOwn(CONTENT.monsters, t.tpl ?? '') ? '' : ' (its level)'}: Polymorph turns a creature only into a Beast of its own Challenge Rating or lower.`;
}
// The largest size, no bigger than the Beast's own, that `t` fits in where it stands, judged on what the caster's side knows: a creature the DM keeps hidden or the party cannot know of is never counted (a refusal or a smaller size would tell the
// players it is there), and the DM is told of it instead (`told`). The same rule as Enlarge's (world.js `inTheWay`), over every size down from the Beast's.
function fitFor(s, t, size) {
  const G = gridOf(s.map), order = Object.keys(SIZES), B = barriers(s.map);
  for (let i = Math.max(0, order.indexOf(SIZES[size] ? size : 'medium')); i >= 0; i--) {
    const body = { ...t, size: order[i] }, told = [];
    let found = false;
    for (const o of living(s)) {
      if (o.id === t.id || !o.pos || !overlapAt(o, o.pos, body, t.pos, G)) continue;
      if (o.side !== 'party' && (o.hidden || unknown(s, o))) told.push(o); else found = true;
    }
    if (!found && (!ground(s.map, t.pos) || fitsOn(s.map, body, t.pos, B))) return { size: order[i], told };
  }
  return { size: order[0], told: [] };
}
// `polymorph: <Beast id>` (the spell's choice put in by the cast): the creature takes the Beast's whole stat block (forms.js, `takeForm` with `whole`) for as long as the lasting effect runs, and the Beast's Hit Points as Temporary Hit Points
// tied to that effect, which ends it on the creature when they are gone (`damage`, above). A Beast too strong for the creature does nothing and the DM alone is told. A Beast that does not fit is taken at the largest size that does.
export function polymorph(s, t, step, f, ev) {
  const fx = f?.src.fx ? effectsOf(s).find((x) => x.id === f.src.fx) : null;
  if (!fx || fx.bound) return false;
  if (t.dead || t.object || !t.pos) return true;
  const id = step.polymorph, tpl = MONSTERS[id], m = CONTENT.monsters[id], name = f.src.name;
  if (!tpl || !m) return false;
  const dm = (text) => ev.push({ type: 'manual', actor: f.actor ?? t.id, name, partial: true, text });
  const why = beastWhy(t, id);
  if (why) { dm(`${why} ${name} did nothing to ${t.name}.`); return true; }
  const { size, told } = fitFor(s, t, m.size);
  // Already in a form (Wild Shape, or another Polymorph): the new one takes its place.
  const holding = t.form ? effectsOf(s).find((x) => x.id === t.form.fx) : null;
  if (holding) endEffect(s, ev, holding, `${t.name} took another form`); else if (t.form) leaveForm(t);
  const was = t.size;
  fx.parts.push({ target: t.id, form: true });
  takeForm(t, id, m.name, tpl, MONSTER_ACTIONS[id] ?? [], fx.id, { whole: true, size });
  ev.push({ type: 'form', id: t.id, form: id, name: m.name });
  if (t.size !== was) ev.push({ type: 'size', id: t.id, size: t.size });
  if (size !== m.size) ev.push({ type: 'note', id: t.id, ...(f.actor ? { actor: f.actor } : {}), text: `${name}: there is no room for ${t.name} as a ${m.name} (${m.size}), so it takes the largest size that fits (${size})` });
  if (told.length) dm(`${t.name} became a ${m.name} in ${name}, and ${told.map((o) => o.name).join(', ')} (which the party does not know of) is in its new space. The engine did not count ${told.length === 1 ? 'it' : 'them'}, so as not to tell the players: the DM moves whoever should not be there.`);
  tempHp(s, t, tpl.hp, ev, f, null, { replace: true });
  return true;
}
// "A creature you can see" (Conjure Animals, zones.js `seen`): `c` sees `t` by the sight rules (sight.js), and `t` is not hiding from it; for a caster of the party, not a creature the DM hid or one the party does not
// know of either (what the players could not be shown is not forced to save). Judged on what the caster's side knows, never on who is there.
const seenBy = (s, c, t) => canSee(s, c, t) !== 'no' && !hiddenFrom(t, c) && !(c.side === 'party' && (t.hidden || unknown(s, t)));
export const KIT = { seen: seenBy, resize, polymorph, meldInto, expelMelded, confuse, wardCheck, endWards, stabilise, shine, dispel, revive, hold, heldCondition, creatureType, whyNobody, evades, rollToHit, savingThrow, rerollSave, damage, dealt, heal, tempHp, condition, modifier, eachTurn, endSpell, arm, ward, command, imbue, judge, objectActor, objectStep, cutWall, sense, fall, push, reveal, renew, teleport, cure, kill, breakConcentration, summon };

