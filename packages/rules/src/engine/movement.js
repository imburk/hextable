// Movement actions (engine.js): move, dash, stand, disengage, and walking together (follow,
// marchingOrder, partyFollow). Walking itself: Opportunity Attacks, noticing, traps, engaging.
import { gridOf, col, key } from '../grid.js';
import { apart, apartAt, concealed, footprint, FT, ground, landing, measure, overlapAt, STEP_MAX, unseenAt } from '../space.js';
import { entered, holds, snapshot, zonesOf } from '../zones.js';
import { canSee, hiddenFrom } from '../sight.js';
import { seenName, sightRule, unknown } from '../vision.js';
import { barriers, objectDef } from '../walls.js';
import { afterOpportunity, canReact, grappleInstead, instruction, OPPORTUNITY, OWED_MOVE, OPPORTUNITY_GRAPPLE, opportunityAttack, opportunityAttacks, reactionsOf } from '../reactions.js';
import { flyby, incapacitated, incapacitatedBy, modifiers, speedOf } from '../modifiers.js';
import { CONTENT, TILES } from '../content/index.js';
import { SIZES } from '../content/sizes.js';
import { SIZES as SIZE_LIST } from '../content/schema.js';
import { actTime, ARENA_RADIUS, ask, clear, control, current, ent, fail, fighters, fleetFree, fleetOf, hostile, inFight, less, living, mountOf, need, riderOf, spot, steering, turnBudget, unblocked, up } from './shared.js';
import { airspace, aloft, along, beyond, footingOf, dragBlocked, draggedBy, landingFits, pullFeet, riderLanding, below, carry, fitsOn, partnerOf, byMarch, KEEP_UP, peril, captureSlots, frameOf, presetSlots, SHAPES, slotPoint, slotsFor, validSlot, walkFace, feetLeft, findable, findDC, joinEncounter, lookAround, moveOptions, NOTICE_FEET, objectName, objectZ, reveal, route, setObject, trailOf, unfollow, unhide } from './world.js';
import { passive } from './rolls.js';
import { partRefusal } from './attacks.js';
import { checkEnd, dismountOrder, engage, findFor, KIT, seesFor, sensesFor, unfind, mountAct, mountHadTurn, mountTurnBudget, objectEffects, resolveAttack, runAction, settleRide, startEncounter, strikeOption } from './resolve.js';

export const ENGAGE_RANGE = 2;
// The answer to an Opportunity Attack prompt that makes it against the rider of the mount that provoked it (stage C6b).
// Only an answer: the standing instruction is the Opportunity Attack's own (OPPORTUNITY).
export const OPPORTUNITY_RIDER = 'opportunity-attack-rider';       // walking this close to a hostile starts the fight

// Who could make an Opportunity Attack on `e` standing at `pos`: hostile, able to take a Reaction
// (reactions.js, canReact), armed for one, within reach and able to see it (SRD). Whether each
// one takes it is its standing instruction, read in walk().
// `sense`: count a party creature whose own senses find a hiding mover (resolve.js, sensesFor); the walk makes it
// known (findFor) before the Opportunity Attack is offered or made.
function threatsAt(s, e, pos, sense = false) {
  return fighters(s).filter((o) =>
    o.id !== e.id && up(o) && hostile(o, e) && canReact(o) &&
    !!opportunityAttack(o, s) && apartAt(s, o, o.pos, e, pos) <= 1 && clear(s, o.pos, pos) && (sense ? sensesFor : seesFor)(s, o, e)      // SRD: a creature it can see (and its side knows of)
    && !modifiers(s, o, 'opportunity').autoFail);                                                                       // Staggering Blow: it can't make them now
}
// A creature has just stepped from `prev` to where it stands now: whatever that sets off, goes
// off. Returns true if something did, which ends the creature's movement there.
function trip(s, e, prev, ev, before) {
  let fired = false;
  const G = gridOf(s.map), far = measure(s, G);                       // how far a trigger reaches: as range is measured
  if (!ground(s.map, e.pos)) return false;                             // nothing on the floor notices what is not on it
  for (const o of s.map.objects) {
    const def = objectDef(o);
    if (!def.triggers?.length || Math.abs(objectZ(s, o) - e.pos.z) > STEP_MAX) continue;
    const nearest = (pos) => Math.min(...footprint(e, pos, G).map((f) => far(f, o.at)));      // any part of a big creature sets a thing off
    const was = nearest(prev), now = nearest(e.pos);
    const t = def.triggers.find((x) => x.from.includes(o.state) && (x.who !== 'party' || e.side === 'party') &&
      (x.on === 'enter' ? now === 0 && was > 0 : x.on === 'leave' ? was === 0 && now > 0 : now * FT <= x.feet && was * FT > x.feet));
    if (!t) continue;
    if (t.effects) {
      before();
      ev.push({ type: 'triggered', object: o.id, name: objectName(o), id: e.id });
      fired = true;
    }
    if (t.to && t.to !== o.state) setObject(s, o, t.to, ev);
    if (t.effects) objectEffects(s, o, t.effects, t.area ? living(s).filter((c) => far(c.pos, o.at) * FT <= t.area && Math.abs(c.pos.z - objectZ(s, o)) <= STEP_MAX) : [e], ev);
  }
  return fired;
}
// A party member walked into, or tried to step onto, a creature it did not know was there.
function bumped(s, o, by, ev) { reveal(s, o, ev); unhide(s, o, ev, 'found', by); }
// The table rule for noticing things in passing: a party member's passive Perception against
// what is hidden within 10 feet. Returns true if anything was noticed.
function notice(s, e, ev, before) {
  const rule = s.settings.passiveFind;
  if (!rule || rule === 'off' || e.side !== 'party' || !up(e)) return false;
  const score = passive(s, e, 'perception');
  const found = s.map.objects.filter((o) => (rule === 'all' || objectDef(o).triggers?.some((t) => t.effects)) && findable(s, e, o, NOTICE_FEET) && findDC(o) <= score);
  if (!found.length) return false;
  before();
  for (const o of found) { ev.push({ type: 'noticed', id: e.id, object: o.id, name: objectName(o) }); setObject(s, o, objectDef(o).find.to, ev); }
  return true;
}

// ---------- walking ----------

// ---------- dragging (docs/specs/grapple-shove.md, Decision 6) ----------
// A grappler that walks pulls what it holds along: after each step, a held creature now beyond its hold's range is pulled toward it,
// the forced move `push` already is (it provokes no Opportunity Attack, being moved without its own movement, 2088-2090; a zone it is
// pulled into goes off). The cost is in `moveOptions`. Before a step has any effect (an Opportunity Attack, a zone, a reveal) the whole
// step is asked, the grappler's move and every pull in turn (`dragBlocked`, world.js): if a held creature could not follow, the step is
// not taken, and nothing of it happens.
const cantDrag = (s, e, t) => `${e.name} can't drag ${t.name} any further.`;
// The game as the party knows it: creatures it does not know of (`lurkers`) left out, but not the ones the mover holds (it knows those).
const without = (s, e, lurkers) => { const mine = new Set(draggedBy(s, e).map((x) => x.t.id)); return { ...s, entities: Object.fromEntries(Object.entries(s.entities).filter(([, o]) => !lurkers.includes(o) || mine.has(o.id))) }; };
// Could the step be taken, dragging what `e` holds? A party mover asks it as the party knows the place (`unseen`: the creatures it does
// not know of left out), so a refusal or a stop never says that something stands where nothing seems to. Returns the held creature that
// could not follow (the step is refused or the walk stopped, naming it), or null; or 'found': only a creature the party did not know of
// is in the way, and it has been found (as walking into it would), so the step is not taken.
function dragCheck(s, e, step, unseen, ev) {
  if (!draggedBy(s, e).length) return null;
  const lurk = unseen ? living(s).filter((o) => o.id !== e.id && unseen(o)) : [];
  const t = dragBlocked(lurk.length ? without(s, e, lurk) : s, e, step);
  if (t || !lurk.length || !dragBlocked(s, e, step)) return t;
  const alone = lurk.filter((o) => !dragBlocked(without(s, e, [o]), e, step)), held = draggedBy(s, e);
  for (const o of alone.length ? alone : lurk.filter((o) => held.some((x) => apart(s, o, x.t) <= 1))) bumped(s, o, e, ev);
  return 'found';
}
// The first step of a move: refused outright if what `e` holds could not follow it (before anything changed: a refused action changes
// nothing). Returns true if it only found a creature in the way: the move is then over.
function dragFirst(s, e, steps, unseen, ev) {
  const t = steps.length ? dragCheck(s, e, steps[0].h, unseen, ev) : null;
  if (t === 'found') return true;
  if (t) fail(`${e.name} can't drag ${t.name} that way.`);
  return false;
}
// `e` has stepped: pull each creature it holds that is now out of reach. The step was asked beforehand, so each pull is expected to
// go; if one does not (something changed between: an Opportunity Attack), the DM is told, and the hold ends by distance after the action.
// A pulled creature sets nothing off but a zone: like a teleport onto a thing that goes off when stepped on, that is handed to the DM.
function pullAlong(s, e, flush, ev) {
  const owed = draggedBy(s, e).filter((x) => beyond(s, x.g, x.t, x.hold));
  if (!owed.length) return [];
  const pev = [], G = gridOf(s.map);
  for (const x of owed) {
    for (let i = 0; i < 4 && beyond(s, x.g, x.t, x.hold); i++) {
      if (KIT.push(s, x.t, pullFeet(s), 'toward', x.g.pos, pev) !== 'moved') {
        pev.push({ type: 'manual', actor: e.id, name: 'Grapple', partial: true, text: `${e.name} could not drag ${x.t.name} along: something changed on the way. The hold ends if they are now more than ${x.hold.range} ft apart; the DM places ${x.t.name} if it should have come.` });
        break;
      }
    }
  }
  flush();                                               // the grappler's step is told before the creatures it pulled
  ev.push(...pev);
  for (const { t } of owed) {
    const cells = pev.filter((x) => x.type === 'moved' && x.id === t.id).flatMap((x) => x.path);
    for (const o of s.map.objects) {
      const def = objectDef(o);
      if (def.triggers?.some((x) => x.on === 'enter' && x.from.includes(o.state)) && cells.some((c) => Math.abs(objectZ(s, o) - c.z) <= STEP_MAX && footprint(t, c, G).some((f) => G.dist(f, o.at) === 0)))
        ev.push({ type: 'manual', actor: t.id, name: objectName(o), partial: true, text: `${t.name} was dragged onto ${objectName(o)}. Whether it goes off is the DM's call.` });
    }
  }
  return owed.map((x) => x.t);
}
// The walk stops where it is: said to the party if the mover is the party's, else to the DM alone.
const stopsDragging = (s, e, t, ev) => ev.push(e.side === 'party' ? { type: 'note', id: e.id, text: cantDrag(s, e, t) } : { type: 'manual', actor: e.id, name: 'Grapple', partial: true, text: cantDrag(s, e, t) });

// Addition H (docs/specs/homebrew-subclasses.md, `triggers.opportunityHit`): `o`'s Opportunity Attack has hit, and it may move up to half its Speed, provoking nothing.
// The engine runs the mover's whole move before anything else, so `o` cannot be asked where to go in the middle of it: the feet are kept on the turn's flags
// (`rmove:<o>`) and `o` spends them with a `move` of its own, once the mover is done and before the turn ends (the next turn clears the flags). It is for
// moving and nothing else: only `move` reads it. A rider or a mount is moved by the DM, so the DM is told and nothing is kept.
function opportunityRider(s, o, ev) {
  const f = afterOpportunity(o);
  if (!f || !s.encounter || !up(o) || current(s) === o.id) return;
  const feet = Math.floor(speedOf(s, o) / 2 / FT) * FT;
  if (feet <= 0) return;
  const tell = (text) => ev.push(o.side === 'party' ? { type: 'note', id: o.id, text } : { type: 'manual', actor: o.id, name: f.name, partial: true, text });
  if (mountOf(s, o) || riderOf(s, o)) return void ev.push({ type: 'manual', actor: o.id, name: f.name, partial: true, text: `${o.name}'s Opportunity Attack hit. ${f.name} lets it move up to ${feet} ft without provoking Opportunity Attacks; the engine does not move a creature that rides or is ridden this way, so the DM does.` });
  const flags = s.encounter.flags, k = `${OWED_MOVE}:${o.id}`;
  flags[k] = Math.max(Number.isFinite(flags[k]) ? flags[k] : 0, feet);
  tell(`${f.name}: ${o.name} may move up to ${feet} ft without provoking Opportunity Attacks. The engine finishes the other creature's move first, so ${o.name} moves afterwards, before this turn ends.`);
}
// The feet of such movement `e` has now, or 0.
const owedFeet = (s, e) => { const n = s.encounter?.flags?.[`${OWED_MOVE}:${e.id}`]; return Number.isFinite(n) && n > 0 ? n : 0; };
// What `moveOptions` should see for such a move: the game as it would stand if it were `e`'s turn with only that movement. Read only (nothing of it is kept).
// No Dash is counted (`dashes: -1`), so that every way of moving (climbing, flying: `moveOptions` adds what its Speed has over walking) is held to the feet given.
const asItsTurn = (s, e, bud) => (bud?.free ? { ...s, encounter: { ...s.encounter, turn: s.encounter.order.findIndex((o) => o.id === e.id), budget: { ...bud, dashes: -1 } } } : s);
// Which diagonal of a square map comes next ('alternate' diagonals), kept with the feet (`rdiag:<creature>`) so that a move in steps counts as one.
const DIAG = 'rdiag';
const owedDiag = (s, e) => (s.encounter?.flags?.[`${DIAG}:${e.id}`] ? 1 : 0);

// Walk a creature to `tk` along the way `reach` found for it. Every step can set something off,
// catch an eye, or (outside a fight) start one. Returns the positions it stood on, from where it
// set off, or null if it noticed something before taking a step and so did not go at all.
// A mount walks with its rider on it (stage C6a): the rider is carried step by step, and is told of as moving too.
// `bud`: the budget the walk is spent from (a controlled mount's is `budget.mount`, its rider's turn's).
function walk(s, e, reach, tk, ev, fighting, bud = s.encounter?.budget, unseen = null) {
  let seg = [], prev = e.pos;
  const walked = [e.pos], found = [];
  let rider = riderOf(s, e);
  const flush = () => { if (seg.length) { ev.push({ type: 'moved', id: e.id, path: seg }); if (rider) ev.push({ type: 'moved', id: rider.id, path: seg.map((h) => ({ ...h })) }); } seg = []; };
  if (notice(s, e, ev, flush)) return null;
  const range = Math.max(ENGAGE_RANGE, Math.floor((s.settings.engageRange ?? 10) / FT));
  // Movement is spent as the route goes. On squares it is what was left at the start less the
  // route's cost so far, one subtraction, so fractions of a foot never pile up; on hexes, step by
  // step as it always was (the same numbers: there every cost is whole or half feet).
  const square = gridOf(s.map).kind === 'square', base = bud?.move;
  let spent = 0, rooted = false;
  for (const { h: step, cost, p } of route(reach, tk)) {
    // A creature it holds must be able to follow this step (`move` has already refused a first step none can follow): if one cannot,
    // the walk stops here, before an Opportunity Attack is provoked by a step that is not taken.
    const stuck = dragCheck(s, e, step, unseen, ev);
    if (stuck === 'found') break;
    if (stuck) { stopsDragging(s, e, stuck, ev); break; }
    // A creature it holds that this step pulls along stays within its reach: the grappler leaves no reach it does not take with it.
    const comes = new Set(draggedBy(s, e).filter(({ g, t, hold }) => (!!g && !t.dead && apartAt(s, g, step, t, t.pos) * FT > hold.range)).map((x) => x.t.id));
    if (fighting && s.encounter && !e.cond.disengaged && !bud?.free && !flyby(s, e)) {         // `bud.free`: movement an Opportunity Attack's rider gave (below): it provokes nothing; Flyby: nor does a creature with that trait
      for (const o of threatsAt(s, e, prev, true)) {
        if (apartAt(s, o, o.pos, e, step) <= 1 || comes.has(o.id)) continue;
        // Its standing instruction for the Opportunity Attack (reactions.js). `never`: nothing
        // happens and nothing is said. `ask`: its player is asked, and the walk waits; for one of
        // the DM's creatures the DM alone is told and decides by hand.
        // A mount that provokes carries its rider out of reach too: the attacker may make its one attack against either
        // (stage C6b, Decision 8). The rider is offered only where the attacker could attack it (riderTarget).
        const w = instruction(o, reactionsOf(o).find((r) => r.id === OPPORTUNITY)), alt = riderTarget(s, o, rider, prev);
        if (w === 'never') continue;
        // A part that holds as many creatures as it may can't be used on another (SRD "Grappling"): a monster makes its Opportunity Attack
        // with a melee action whose part is free, and with none it makes none (docs/specs/grapple-shove.md, G6; DEBT T74).
        if (o.actions && !opportunityAttacks(o).some((a) => !partRefusal(s, o, a, [e]))) {
          ev.push({ type: 'manual', actor: o.id, name: 'Opportunity Attack', partial: true, text: `${o.name} holds a creature with the part that makes its Opportunity Attack, so it can't make one on ${e.name} leaving its reach until it lets go.` });
          continue;
        }
        let t = e, grab = null;
        if (w === 'ask') {
          // Grapple instead of the damage (stage G6): a third answer, only when it asks, from a creature with an Unarmed Strike and a hand
          // free, against the mover itself (grappleInstead). It is offered after the others, so what asked before still asks the same.
          const named = seesFor(s, o, e), gr = grappleInstead(s, o, e, named);
          // A mover the party is not told of is not named in the question (fix round 1 of #378, L3).
          const answer = ask(s, o, { trigger: 'leave', ...(named ? { by: e.id } : {}) }, [{ reaction: OPPORTUNITY, name: 'Opportunity Attack' },
            ...(alt ? [{ reaction: OPPORTUNITY_RIDER, name: `Opportunity Attack on ${alt.name}`, against: alt.id }] : []),
            ...(gr ? [{ reaction: OPPORTUNITY_GRAPPLE, name: `Grapple ${named ? seenName(e) : 'it'} instead (it stops)` }] : [])]);
          if (answer === null) {
            ev.push({ type: 'manual', actor: o.id, name: 'Opportunity Attack', partial: true,
              text: `${e.name} leaves ${o.name}'s reach${alt ? `, carrying ${alt.name}` : ''}. ${o.name}'s instruction is to ask the DM: if it takes the Opportunity Attack${alt ? ` (against ${e.name} or ${alt.name})` : ''}, the DM makes it and marks its Reaction used.` });
            continue;
          }
          if (answer.take === OPPORTUNITY_GRAPPLE && gr) grab = gr;
          else if (answer.take === OPPORTUNITY_RIDER && alt) t = alt;
          else if (answer.take !== OPPORTUNITY) continue;
        }
        flush();
        // Taken against a mover its own senses found: the mover is found first (resolve.js, findFor; #374, B1).
        if (t === e && !seesFor(s, o, e)) found.push(findFor(s, o, e, ev));
        o.reactionUsed = true;
        ev.push({ type: 'reaction', id: o.id, reaction: OPPORTUNITY, name: 'Opportunity Attack', trigger: 'leave', against: t.id });
        const struck = ev.length;
        const oa = o.actions ? opportunityAttacks(o).find((a) => !partRefusal(s, o, a, [t])) ?? opportunityAttack(o, s) : opportunityAttack(o, s);
        if (grab && SIZE_LIST.indexOf(e.size ?? 'medium') > SIZE_LIST.indexOf(o.size ?? 'medium') + 1) {
          const text = `${o.name} can't grapple it: too big to grapple. The Reaction is spent.`;
          ev.push(o.side === 'party' ? { type: 'note', id: o.id, text } : { type: 'manual', actor: o.id, name: 'Grapple', partial: true, text });
        }
        else if (grab) strikeOption(s, o, e, grab, 'grapple', undefined, ev);
        else if (o.actions) runAction(s, o, oa, [t], null, null, ev, { opportunity: true });
        else resolveAttack(s, o, t, oa, ev, { opportunity: true });
        // Addition H (homebrew-subclasses.md): an Opportunity Attack that hit lets a holder of `triggers.opportunityHit` move afterwards.
        if (!grab && ev.slice(struck).some((x) => x.type === 'attack' && x.actor === o.id && x.hit === true)) opportunityRider(s, o, ev);
        // A rider knocked down or Prone by it may fall off here, before the mount goes on (settleRide).
        if (t === rider) { settleRide(s, rider, ev); rider = riderOf(s, e); }
        if (!up(e)) break;
        // Left with no Speed by it (a Grapple: Grappled has Speed 0; a monster's attack that grapples likewise), the mover goes no further:
        // the step it was taking is not taken (docs/specs/grapple-shove.md, Decision 10; DEBT T74). The rest of the foes' Opportunity
        // Attacks were for that step, so none is made.
        if (speedOf(s, e) <= 0 && !aloft(s, e)) { rooted = true; break; }
      }
      if (!up(e)) break;
      if (rooted) {
        flush();
        const text = `${e.name} can't go on: its Speed is 0.`;
        ev.push(e.side === 'party' ? { type: 'note', id: e.id, text } : { type: 'manual', actor: e.id, name: 'Grapple', partial: true, text });
        break;
      }
    }
    const k = key(step);
    const was = e.pos, zonesBefore = snapshot(s);
    e.pos = step; seg.push(step); prev = step; walked.push(step);
    carry(s, e);
    // What it holds comes along (the step was asked above, so each can).
    const pulled = pullAlong(s, e, flush, ev);
    if (pulled.length && zonesBefore) { const now = snapshot(s); for (const t of pulled) zonesBefore[t.id] = now[t.id]; }       // a zone it was pulled into has gone off already
    if (fighting && s.encounter && bud) {
      const b = bud;
      if (square) b.move = base - cost; else b.move -= cost - spent;
      if (p !== undefined) b.diagonals = p;                              // 'alternate': is the next diagonal a second one?
    }
    spent = cost;
    lookAround(s, ev, rider ? [e, rider] : [e], flush);
    if (trip(s, e, was, ev, flush) || !up(e)) break;                    // a trap ends the walk where it was sprung
    // So does a zone it walks into (Web, Moonbeam), for it or its rider; one that moves with it may catch others.
    if (entered(s, ev, KIT, zonesBefore, flush).some((id) => id === e.id || id === rider?.id) || !up(e)) { checkEnd(s, ev); break; }
    if (notice(s, e, ev, flush)) break;                                  // and so does spotting something
    if (fighting) continue;
    // Anything lying in wait this close is spotted, whether or not a fight follows.
    for (const o of living(s)) if (o.hidden && hostile(o, e) && apart(s, o, e) <= ENGAGE_RANGE && unblocked(s, o, e)) { flush(); reveal(s, o, ev); }
    const free = !living(s).some((o) => o.id !== e.id && o !== rider && key(o.pos) === k);
    if (s.encounter && s.encounter.arena[col(step)] && free) { flush(); joinEncounter(s, e, ev); if (rider && !inFight(s, rider.id)) joinEncounter(s, rider, ev); break; }
    // The table's engage distance: the walker stops this far from the first enemy it has a clear line to.
    const foe = !s.encounter && s.settings.autoEngage && free &&
      living(s).find((o) => up(o) && hostile(o, e) && apart(s, o, e) <= range && unblocked(s, o, e) && !unseenAt(s.map, o.pos) && !o.hiding && !e.hiding && !(e.side === 'party' && sightRule(s) !== 'rooms' && unknown(s, o)));
    if (foe) {
      flush();
      const trail = { id: e.id, path: walked.slice().reverse() };
      if (range <= ENGAGE_RANGE) startEncounter(s, e.pos, ev, ARENA_RADIUS, trail); else engage(s, e, foe, ev, trail);
      break;
    }
  }
  flush();
  // A mover found on the way that the end of the walk would have found anyway: what came before is told as then (unfind).
  for (const f of found) unfind(s, f);
  return walked;
}
// The rider a mount carries out of a foe's reach, if the foe may make its Opportunity Attack against it instead (stage
// C6b; Decision 8: "a foe still has one Reaction and chooses which"): hostile to it, within its reach where the pair
// stood, a clear line, and a rider it can see (and, for a party attacker, one the party knows of, so a prompt never
// names a hidden creature). The rider itself does not provoke: it is moved without using its own movement (SRD 5.2.1
// 2088-2090).
function riderTarget(s, o, r, prev) {
  if (!r || !hostile(o, r) || r.dead) return null;
  if (o.side === 'party' && unknown(s, r)) return null;
  return apartAt(s, o, o.pos, r, prev) <= 1 && clear(s, o.pos, prev) && canSee(s, o, r) !== 'no' ? r : null;
}
const nextMarch = (s) => Math.max(-1, ...Object.values(s.entities).map((x) => x.march ?? -1)) + 1;

// The leader has walked `walked` (from where it set off). Everyone following it, and everyone
// following them, walks after it: those with a slot in its formation to their slots, if every one
// of them has room there; the rest, and everyone when there is no room, in marching order along the
// leader's trail (the column).
// A creature that holds another does not follow a leader or keep a marching place (docs/specs/grapple-shove.md, Decision 6): it stays
// where it is when the column walks, with its hold, and a note says so.
function march(s, leader, walked, ev) {
  if (leader.side !== 'party') return;
  const G = gridOf(s.map), trail = trailOf(walked.slice().reverse(), null, G);
  const moved = new Set([leader.id]);
  let front = leader;
  const pending = living(s).filter((x) => x.follow && x.id !== leader.id && !draggedBy(s, x).length).sort(byMarch);
  // The holders the column leaves behind: those whose leader walks (is the leader, or follows one who does).
  const walking = new Set([leader.id]);
  for (let grew = true; grew;) { grew = false; for (const x of pending) if (!walking.has(x.id) && walking.has(x.follow)) { walking.add(x.id); grew = true; } }
  for (const x of living(s)) {
    if (!x.follow || x.id === leader.id || !walking.has(x.follow) || !draggedBy(s, x).length || (s.encounter && inFight(s, x.id))) continue;
    const text = `${x.name} is holding ${draggedBy(s, x).map((d) => d.t.name).join(' and ')}, so it stays where it is while the party walks on.`;
    ev.push(x.side === 'party' ? { type: 'note', id: x.id, text } : { type: 'manual', actor: x.id, name: 'Grapple', partial: true, text });
  }
  // The footing of the one in front, worked out once for each front and each set of creatures the follower does not know of (nearly
  // always none, so once a front: #736 item 2), on the game as the follower knows it (`without`): a creature it does not know of
  // bars no way, so where the follower stops never tells of one (#736 item 1; formation's places are judged the same way).
  const footings = new Map();
  const footingFor = (front, lurkers) => {
    const k = `${front.id}|${lurkers.map((o) => o.id).join(',')}`;
    if (!footings.has(k)) footings.set(k, footingOf(lurkers.length ? without(s, front, lurkers) : s, front));
    return footings.get(k);
  };
  const fell = formation(s, leader, walked, pending, ev);
  if (fell === 'fight') return;                          // it walked into a fight: the rest were brought up when it started
  for (const f of fell) { pending.splice(pending.indexOf(f), 1); moved.add(f.id); front = f; }
  for (;;) {
    const f = pending.find((x) => moved.has(x.follow));
    if (!f) return;
    pending.splice(pending.indexOf(f), 1);
    if (s.encounter && inFight(s, f.id)) continue;
    // A creature the party does not know of near the way is not there for the column either: the follower's place and
    // way are laid out without it, and a way that runs into it stops before it and finds it (#372; walkKnown).
    const lurkers = living(s).filter((o) => o.id !== f.id && unseenBy(s, o, f) && hostile(o, f));
    const reach = lurkers.length ? knownWays(s, f, lurkers) : moveOptions(s, f);
    const frontI = along(trail, front.pos, G).i;
    // The places it could stop, and where it stands now (staying put costs nothing).
    const crowded = living(s).some((o) => o.id !== f.id && !unseenBy(s, o, f) && overlapAt(o, o.pos, f, f.pos, gridOf(s.map)));   // it stands where the one in front now does: it must move off
    const spots = [...(crowded ? [] : [{ k: key(f.pos), h: f.pos, cost: 0 }]), ...[...reach].filter(([, v]) => v.canStop).map(([k, v]) => ({ k, h: v.h, cost: v.cost }))];
    // Kept up: close to the one in front and on its footing (#728; `footingOf`, world.js). The foot of a ledge the one in front has climbed,
    // or of its ladder, is close on the map and is not with it: from there the follower goes on up, as far along the trail as it gets.
    const withFront = footingFor(front, lurkers);
    let best = null, bestKey = null;
    for (const sp of spots) {
      const near = apartAt(s, front, front.pos, f, sp.h), at = along(trail, sp.h, G);
      const rank = [near <= KEEP_UP && withFront(sp.h) ? 0 : 1, at.i > frontI ? 0 : 1, at.d, at.i, near, sp.cost];
      if (!best || less(rank, bestKey)) { best = sp; bestKey = rank; }
    }
    // It can get through if some way it could walk comes up beside the one in front (others in the party do not bar the way).
    const through = [...reach.values()].some((v) => apartAt(s, front, front.pos, f, v.h) <= 1);
    if (crowded && (!up(f) || !best || !through)) fail(`${f.name} cannot make room.`);   // the move is refused whole (apply restores the game): nobody shares a place
    if (!up(f) || !best || !through) { unfollow(s, f, ev, "couldn't keep up"); continue; }
    if (best.k !== key(f.pos)) {
      const had = !!s.encounter;
      if (lurkers.length) walkKnown(s, f, best.k, ev, false, null, (o) => unseenBy(s, o, f) && hostile(o, f), reach, lurkers, true);
      else walk(s, f, reach, best.k, ev, false);
      if (!had && s.encounter) return;                   // it walked into a fight: the rest were brought up when it started
    }
    moved.add(f.id);
    front = f;
  }
}

// A creature the party does not know is there: one the DM hid, one hiding from this follower, and
// under the los and light rules one nobody in the party can see. A formation is laid out as if it
// were not there, so the shape the party takes never gives it away; a follower whose place it holds
// stops beside it and finds it, as a move onto it does.
const unseenBy = (s, o, f) => o.side !== 'party' && !o.dead && (o.hidden || hiddenFrom(o, f) || (sightRule(s) !== 'rooms' && unknown(s, o)));
const SNAP = 0.75;                   // cells: how far from the point of its slot a follower's place may be
const ORIGIN = { q: 0, r: 0 };

// The leader's formation, after it walked: lay out a place for each follower with a slot, and walk
// them there. Every one must have room: a place within SNAP of its slot, standable, free, not more
// than beside the leader (never ahead of it), and joined to it (the leader could walk there not much
// further than it is: nobody is put behind a wall). If any has none (a corridor, a door, a crowd)
// nobody is laid out: the column takes them all, and the formation comes back where there is room.
// Returns those who walked, or 'fight'.
function formation(s, leader, walked, pending, ev) {
  const G = gridOf(s.map), B = barriers(s.map);
  const members = pending.filter((x) => x.follow === leader.id && x.side === 'party' && !(s.encounter && inFight(s, x.id)));
  pruneSlots(s, leader);
  const slots = slotsFor(leader, members);
  if (!slots) return [];
  const face = walkFace(G, walked) ?? leader.formation.face ?? 0;
  if (leader.formation.face !== face) leader.formation.face = face;
  const F = frameOf(G, leader.pos, face), uu = F.u.x ** 2 + F.u.z ** 2;
  const o0 = G.toWorld(ORIGIN), cell = Math.min(...G.neighbors(ORIGIN).map((n) => Math.hypot(G.toWorld(n).x - o0.x, G.toWorld(n).z - o0.z)));
  const walls = (a, b) => { const lv = ground(s.map, a)?.level; return !!lv && B.blocked(lv.id, a, b); };
  // The places creatures the party does not know of stand on, which no way is found through: each
  // is taken as reached from a free neighbour with no wall between, one step further.
  const lurkers = living(s).filter((o) => unseenBy(s, o, leader));
  const lurkCells = lurkers.flatMap((o) => footprint(o, o.pos, G));
  const besideLurk = (reach) => {
    const out = [];
    for (const h of lurkCells) {
      if (reach.has(key(h))) continue;
      let cost = Infinity;
      for (const n of G.neighbors(h)) { const v = reach.get(key({ ...n, z: h.z })); if (v && v.cost + FT < cost && !walls(v.h, h)) cost = v.cost + FT; }
      if (cost < Infinity) out.push({ h, cost, canStop: false });
    }
    return out;
  };
  // Its places share the leader's footing (#728; `footingOf`, world.js). A place at the foot of the ledge the leader stands on, or under its
  // balcony, is beside it on the map and not with it: the followers would stop below, the party split and nothing said. With no such
  // place for one of them the column takes them all, up the leader's own trail. Beside a creature the party does not know of counts as
  // reached, one step further (besideLurk), so the shape gives nothing away; and the footing itself is worked out on the game as the
  // party knows it (`without`), so a creature it does not know of on the only way between the leader and a place bars nothing (#736).
  const footing = footingOf(lurkers.length ? without(s, leader, lurkers) : s, leader), lurkCost = new Map(besideLurk(footing.reach).map((v) => [key(v.h), v.cost]));
  const joined = (h) => footing(h, lurkCost.get(key(h)));
  const ahead = (h) => { const w = G.toWorld(h); return ((w.x - F.x) * F.u.x + (w.z - F.z) * F.u.z) / uu; };
  const water = (h) => ground(s.map, h)?.tile.t === 'water';
  // One who is down, cannot move or cannot get up beside the leader is left to the column after the
  // others (whose rules drop it as not keeping up); the rest keep their places.
  // Each one's ways are laid out on the game as it knows it (`waysOf`): a creature it does not know of bars none, so who is in a slot, and so
  // whether the party is laid out at all, never tells of one (#741; the column does the same, in march).
  const lurkersOf = (x) => living(s).filter((o) => o.id !== x.id && unseenBy(s, o, x) && hostile(o, x));
  const waysOf = (x) => { const lk = lurkersOf(x); return lk.length ? knownWays(s, x, lk) : moveOptions(s, x); };
  const reaches = new Map(members.map((x) => [x.id, waysOf(x)]));
  const walks = (x) => up(x) && [...reaches.get(x.id).values()].some((v) => apartAt(s, leader, leader.pos, x, v.h) <= 1);
  const inSlot = members.filter((x) => slots[x.id] && walks(x));
  const movers = new Set(pending.map((x) => x.id));
  // The best place for `f` among those `test` allows, nearest its slot.
  const placeFor = (f, spots, test) => {
    const T = slotPoint(F, slots[f.id]);
    let best = null, bestKey = null;
    for (const sp of spots) {
      const w = G.toWorld(sp.h), d = Math.hypot(w.x - T.x, w.z - T.z) / cell, fwd = ahead(sp.h);
      if (fwd > 0.5 + 1e-9 || !joined(sp.h) || (!sp.here && peril(s, f, sp.h)) || !test(sp, d)) continue;
      const rank = [d, fwd, Math.abs(sp.h.z - f.pos.z), sp.cost];
      if (!best || less(rank, bestKey)) { best = sp; bestKey = rank; }
    }
    return best;
  };
  const spotsOf = (f, reach) => [{ h: f.pos, cost: 0, here: true }, ...[...reach.values()].filter((v) => key(v.h) !== key(f.pos)), ...besideLurk(reach)];
  const plan = [], claimed = [];
  for (const f of inSlot) {
    const reach = reaches.get(f.id);
    // What stands still while they walk: everyone but those still to walk and those the party does not know of.
    const still = living(s).filter((o) => o.id !== f.id && !movers.has(o.id) && !unseenBy(s, o, f));
    const free = (h) => !still.some((o) => overlapAt(o, o.pos, f, h, G)) && !claimed.some(([c, ch]) => overlapAt(c, ch, f, h, G));
    // Where it may stop: as moveOptions says, or where only someone still to walk, or unknown, stands now.
    const standable = (sp) => sp.here || sp.canStop || (!water(sp.h) && living(s).some((o) => o.id !== f.id && overlapAt(o, o.pos, f, sp.h, G)));
    const best = placeFor(f, spotsOf(f, reach), (sp, d) => d <= SNAP && standable(sp) && free(sp.h));
    if (!best) return [];
    plan.push({ f, h: best.h });
    claimed.push([f, best.h]);
  }
  // Walk them, each when its place is clear; one whose place is still held by another of them
  // (they would swap) takes the best place free now.
  const done = [];
  const holders = (f, h) => living(s).filter((o) => o.id !== f.id && overlapAt(o, o.pos, f, h, G));
  while (plan.length) {
    const i = plan.findIndex((p) => holders(p.f, p.h).every((o) => unseenBy(s, o, p.f)));
    const { f, h } = plan.splice(Math.max(0, i), 1)[0];
    movers.delete(f.id);
    // Places the others still to walk are going to are left for them.
    const theirsToGo = (h) => plan.some((p) => overlapAt(p.f, p.h, f, h, G));
    const lk = lurkersOf(f), reach = lk.length ? knownWays(s, f, lk) : moveOptions(s, f), now = (sp) => sp.here || (sp.canStop && !theirsToGo(sp.h));
    let to = i < 0 ? placeFor(f, spotsOf(f, reach), now)?.h ?? f.pos : h;
    const lurker = holders(f, to).find((o) => unseenBy(s, o, f) && hostile(o, f));
    if (lurker) {
      const beside = [...reach.values()].filter((v) => v.canStop && !theirsToGo(v.h) && G.dist(v.h, to) === 1 && Math.abs(v.h.z - to.z) <= STEP_MAX && !walls(v.h, to)).sort((x, y) => x.cost - y.cost)[0];
      to = beside ? beside.h : f.pos;
    } else if (key(to) !== key(f.pos) && !reach.get(key(to))?.canStop) to = placeFor(f, spotsOf(f, reach), now)?.h ?? f.pos;   // someone it did not know of, not hostile
    if (key(to) !== key(f.pos)) {
      const had = !!s.encounter;
      // Its way there laid out on what the party knows, as the column's and the leader's are (#372; walkKnown).
      if (lk.length && reach.get(key(to))?.canStop) walkKnown(s, f, key(to), ev, false, null, (o) => unseenBy(s, o, f) && hostile(o, f), reach, lk, true);
      else walk(s, f, lk.length ? moveOptions(s, f) : reach, key(to), ev, false);   // a place the known ways do not reach is walked on the true ways, as before (#741)
      if (!had && s.encounter) return 'fight';
    }
    if (lurker && !lurker.dead && apart(s, f, lurker) <= 1 && unseenBy(s, lurker, f)) bumped(s, lurker, f, ev);
    done.push(f);
  }
  return done;
}
// A held or custom formation forgets the places of those no longer following its leader, or gone.
function pruneSlots(s, leader) {
  const sl = leader.formation?.slots;
  if (sl) for (const id of Object.keys(sl)) { const x = s.entities[id]; if (!x || x.dead || x.follow !== leader.id) delete sl[id]; }
}

// The slots of `followers` as they stand around `leader`, the shape the party is in. Facing as the
// leader's formation last faced, or (a new one) away from the middle of those following.
function capture(s, leader, followers, fresh) {
  const G = gridOf(s.map), had = fresh ? null : leader.formation;
  const { face, slots } = captureSlots(G, leader, followers, had?.face ?? null);
  leader.formation = { shape: had?.shape ?? 'held', slots: { ...(had?.slots ?? {}), ...slots }, face };
}

// The ways a party mover has, laid out as if the creatures it does not know of (`lurkers`) were not there.
// What a grappler holds is known to it, however hidden: its drag (cost, ground only, what can follow) is worked out from what is true.
const knownWays = (s, e, lurkers) => moveOptions(without(s, e, lurkers), e);
// A party mover's move laid out on what the party knows (stage C7, review of #368, M2; the re-review, N1 to N3): the route
// is the one the party can see, as if a creature it does not know of were not there. Refusing the move ("Too far"), or
// bending the route round it, would tell the players something stands there without saying what. Where that route runs
// into one, the mover stops on the last place before it where it can stop, and the creature is found (hidden-information.md
// section 5, as for a move onto its place). Where it can stop nowhere on the route short of it (allies stand on every
// cell between), it stops on the nearest place beside it that it can reach without going through a creature it does not
// know of (section 5: "The move stops on the nearest hex beside it"); already beside it, it does not move (section 5);
// with nowhere at all to stand near it, it stays where it is and the creature is found, as before (N2). It is found only
// when the mover gets there: a walk cut short on the way (a trap, something noticed, a fight) finds nothing. A creature
// found on the way by a rule of its own (spotted within ENGAGE_RANGE, or seen under los) is known from then on, so the
// rest of the way is laid out again from where the mover stands, as main's walk went round it (N3). Whoever follows the
// mover comes after it, whichever way the move ends (N1). A creature the DM plays walks by what is true, as before.
// `follower`: a follower's walk after its leader (march): it keeps following, and whoever follows it is marched by
// march itself; the walked path is returned.
function walkKnown(s, e, tk, ev, fighting, bud, unseen, known, lurkers, follower = false) {
  const G = gridOf(s.map), had = !!s.encounter, path = [e.pos];
  let left = follower;
  const go = (k) => {
    if (!left && !fighting && e.follow) unfollow(s, e, ev);
    left = true;
    const w = walk(s, e, known, k, ev, fighting, bud ?? undefined, unseen);
    if (w) path.push(...w.slice(1));
    return w;
  };
  for (let legs = 0, most = lurkers.length; legs <= most; legs++) {
    const steps = route(known, tk);
    const at = steps.findIndex(({ h }) => lurkers.some((o) => overlapAt(o, o.pos, e, h, G)));
    if (at === -1) { go(tk); break; }
    const o = lurkers.find((x) => overlapAt(x, x.pos, e, steps[at].h, G));
    let stop = at - 1;
    while (stop >= 0 && !(known.get(key(steps[stop].h))?.canStop)) stop--;
    let to = stop >= 0 ? steps[stop].h : null;
    if (!to && apart(s, e, o) > 1) to = besideIt(s, e, o, known, lurkers, G);
    if (to) {
      const fightBefore = !!s.encounter;
      if (!go(key(to))) break;                                        // something caught the eye before a step was taken
      const there = key(e.pos) === key(to);
      if (!there || !up(e) || !!s.encounter !== fightBefore) break;    // cut short on the way: nothing found
      if (!o.dead && !unseen(o)) {                                     // found in passing: the rest of the way, on what is known now
        if (key(e.pos) === tk) break;
        lurkers = living(s).filter((x) => x.id !== e.id && unseen(x));
        known = lurkers.length ? knownWays(asItsTurn(s, e, bud), e, lurkers) : moveOptions(asItsTurn(s, e, bud), e);
        if (!known.get(tk)?.canStop) break;
        continue;
      }
    }
    if (!o.dead && unseen(o)) bumped(s, o, e, ev);
    break;
  }
  if (follower) return path;
  if (!fighting && (had || !s.encounter) && path.length > 1) { march(s, e, path, ev); const r = riderOf(s, e); if (r) march(s, r, path, ev); }
  checkEnd(s, ev);
}
// N2: the nearest place beside `o` the mover can stop on and reach by a way that goes through no creature it does not
// know of; null if there is none.
function besideIt(s, e, o, known, lurkers, G) {
  let best = null;
  for (const [k, v] of known) {
    if (!v.canStop || (best && v.cost >= best.cost) || Math.abs(v.h.z - o.pos.z) > STEP_MAX || apartAt(s, e, v.h, o, o.pos) > 1) continue;
    if (lurkers.some((x) => overlapAt(x, x.pos, e, v.h, G)) || !clear(s, v.h, o.pos)) continue;
    if (route(known, k).some(({ h }) => lurkers.some((x) => overlapAt(x, x.pos, e, h, G)))) continue;
    best = v;
  }
  return best?.h ?? null;
}

// `move`, below. `own` is told what it spends when it is the movement an Opportunity Attack's rider gave (`own.bud`), so the caller can keep what is left.
function moveOn(s, a, ctx, ev, own) {
    const actor = ent(s, a.actor); control(s, actor, ctx);
    spot(a.to, 'where to move');
    // A rider moves by moving its mount (stage C6a): a controlled one as it directs, from the mount's movement on the
    // rider's turn (its own movement is left for dismounting); an independent one moves as it likes, on its own turn.
    const steed = mountOf(s, actor);
    if (steed && steering(s, steed) !== actor) fail(actor.riding.controlled && steed.bond?.orders !== 'command'
      ? `${actor.name} can't direct ${steed.name} now.` : `${steed.name} lets ${actor.name} ride but goes where it likes: ${actor.name} dismounts to move on foot.`);
    const e = steed ?? actor;
    up(actor) || fail(`${actor.name} can't move.`);
    up(e) || fail(`${e.name} can't move.`);
    (speedOf(s, e) > 0 || aloft(s, e)) || fail(`${e.name} can't move: its Speed is 0.`);
    const fighting = inFight(s, e.id);
    let bud = fighting ? turnBudget(s, e) : null;
    // Out of its turn, only the movement an Opportunity Attack's rider gave (`triggers.opportunityHit`, kept as `rmove:<creature>`) lets it move, from that alone and
    // provoking nothing (`free`). It is a move and nothing more: no other action reads it, and a creature that rides or is ridden never has any (opportunityRider).
    if (fighting && !bud && !steering(s, e) && !steed && current(s) !== e.id && owedFeet(s, e) > 0) bud = own.bud = { move: owedFeet(s, e), dashes: 0, diagonals: owedDiag(s, e), free: true };
    if (fighting && !bud) fail(steering(s, e) ? `${e.name} moves on ${steering(s, e).name}'s turn.` : `It isn't ${e.name}'s turn.`);
    const reach = moveOptions(asItsTurn(s, e, bud), e, { through: true });
    // A tap names a hex; if it gives no height, the nearest surface this creature can stop on.
    const column = [...reach.values()].filter((n) => col(n.h) === col(a.to) && (a.to.z === undefined || n.h.z === a.to.z))
      .sort((x, y) => (y.canStop - x.canStop) || Math.abs(x.h.z - e.pos.z) - Math.abs(y.h.z - e.pos.z))[0];
    const to = column?.h ?? (a.to.z !== undefined && airspace(s.map, a.to) ? { q: a.to.q, r: a.to.r, z: a.to.z } : landing(s.map, a.to, e.pos.z));
    to || fail("There's nothing there to stand on.");
    let tk = key(to), node = reach.get(tk);
    // Walking onto a hex where something unseen is standing: stop beside it and find out what it
    // is. Refusing the move would tell the player something is there without saying what.
    // That is a creature the DM hid (never in a fight) or one hiding from it.
    // Under the los and light rules, for a party member, also one the party cannot see.
    const unseen = (o) => ((!fighting && o.hidden) || hiddenFrom(o, e) || (e.side === 'party' && sightRule(s) !== 'rooms' && unknown(s, o))) && hostile(o, e);
    const lurker = living(s).find((o) => unseen(o) && key(o.pos) === tk);
    // On the way there (stage C7, review of #368, M2): a party mover's route is the one the party can see, laid out as if
    // a creature it does not know of were not there. Where that route runs into one, the move stops on the last place
    // before it and the creature is found, as when the move ends on it. Refusing the move ("Too far"), or bending the route
    // round it, would tell the players something stands there without saying what. (A creature the DM plays walks by
    // what is true, as before.)
    if (!lurker && e.side === 'party') {
      const lurkers = living(s).filter((o) => o.id !== e.id && unseen(o));
      if (lurkers.length) {
        const known = knownWays(asItsTurn(s, e, bud), e, lurkers);
        if (known.get(tk)?.canStop) { if (dragFirst(s, e, route(known, tk), unseen, ev)) return; return walkKnown(s, e, tk, ev, fighting, bud, unseen, known, lurkers); }
      }
    }
    if (lurker) {
      if (apart(s, e, lurker) <= 1) return bumped(s, lurker, e, ev);   // already beside it: no move, but it is found
      const beside = [...reach.keys()].filter((k) => reach.get(k).canStop && gridOf(s.map).dist(reach.get(k).h, to) === 1 && Math.abs(reach.get(k).h.z - to.z) <= STEP_MAX)
        .sort((x, y) => reach.get(x).cost - reach.get(y).cost)[0];
      if (!beside) fail("Can't get there.");
      tk = beside; node = reach.get(tk);
    }
    if (!node || !node.canStop) {
      if (fighting && !s.encounter.arena[col(to)]) fail("The arena is locked until the fight ends.");
      if (node) fail(`That ${gridOf(s.map).word.one} is occupied.`);
      // A mover that drags goes along the ground only (Decision 6, question Q6): a place only flying or climbing reaches is refused as such.
      const dragging = draggedBy(s, e);
      if (dragging.length) {
        const names = dragging.map((d) => d.t.name).join(' and ');
        if (moveOptions(asItsTurn(s, e, bud), e, { unchecked: true }).get(tk)?.canStop) fail(`${e.name} can't drag ${names} that way.`);
        if (moveOptions(asItsTurn(s, e, bud), e, { aerial: true, unchecked: true }).get(tk)?.canStop) fail(`The engine drags along the ground only. Release ${names} first, or the DM moves both.`);
      }
      fail(fighting ? `Too far. ${e.name} has ${feetLeft(s, bud.move)} ft of movement left.` : "Can't get there.");
    }
    if (dragFirst(s, e, route(reach, tk), e.side === 'party' ? unseen : null, ev)) return;
    // Moved on its own, it walks on its own: it no longer follows anyone.
    if (!fighting && e.follow) unfollow(s, e, ev);
    const had = !!s.encounter, walked = walk(s, e, reach, tk, ev, fighting, bud ?? undefined, e.side === 'party' ? unseen : null);
    if (!walked) return;                                 // something caught the eye before a step was taken: the walk waits
    if (lurker) bumped(s, lurker, e, ev);
    // Whoever follows it comes after, unless a fight broke out on the way: then they were brought up when it did.
    // Those following its rider too: the rider walked the same way.
    if (!fighting && (had || !s.encounter) && walked.length > 1) { march(s, e, walked, ev); const r = riderOf(s, e); if (r) march(s, r, walked, ev); }
    checkEnd(s, ev);
}

export const handlers = {
  move(s, a, ctx, ev) {
    const own = {};
    moveOn(s, a, ctx, ev, own);
    // What is left of the movement an Opportunity Attack's rider gave is kept for another step; none left, the flag goes.
    if (own.bud && s.encounter) {
      const k = `${OWED_MOVE}:${a.actor}`, d = `${DIAG}:${a.actor}`;
      if (own.bud.move > 0) { s.encounter.flags[k] = own.bud.move; if ((own.bud.diagonals | 0) & 1) s.encounter.flags[d] = true; else delete s.encounter.flags[d]; }
      else { delete s.encounter.flags[k]; delete s.encounter.flags[d]; }
    }
  },

  // Gives up the movement an Opportunity Attack's rider gave (`triggers.opportunityHit`): the creature's player says it is done with it, so whoever waits to end the turn
  // (a client playing the foes) need not wait out the rest. Only the creature's own controller or the DM; refused, and nothing changed, when there is none to give up.
  forgoMove(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(s, e, ctx);
    const feet = owedFeet(s, e);
    feet > 0 || fail(`${e.name} has no movement from an Opportunity Attack to give up.`);
    delete s.encounter.flags[`${OWED_MOVE}:${e.id}`]; delete s.encounter.flags[`${DIAG}:${e.id}`];
    const text = `${e.name} gives up the ${feet} ft of movement the Opportunity Attack gave.`;
    ev.push(e.side === 'party' ? { type: 'note', id: e.id, text } : { type: 'manual', actor: e.id, name: afterOpportunity(e)?.name ?? 'Opportunity Attack', partial: true, text });   // the DM's creature's is the DM's, as the allowance's was
  },

  dash(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(s, e, ctx);
    s.encounter || fail('Dash only matters in a fight. Just move.');
    if (steering(s, e)) return mountAct(s, e, a, 'Dash', ev);
    const time = actTime(e, 'dash', a);
    // A monk's Dash as a Bonus Action is Step of the Wind; with Fleet Step it may follow another Bonus Action.
    const sotw = time === 'bonus' ? fleetOf(e) : null, free = !!sotw && fleetFree(s, e, sotw);
    need(s, e, free ? null : time);
    if (free) s.encounter.flags[`fleet:${e.id}`] = true; else s.encounter.budget[time]--;
    if (sotw) s.encounter.flags[`used:${sotw}:${e.id}`] = true;
    s.encounter.budget.move += speedOf(s, e); s.encounter.budget.dashes = (s.encounter.budget.dashes | 0) + 1;
    ev.push({ type: 'std', id: e.id, action: 'Dash' });
  },
  // Stand up from Prone (E14). In a fight, on its own turn, for half its Speed (the SRD lets it be done
  // during a move); outside one, at no cost. A creature with a Speed of 0 cannot.
  stand(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(s, e, ctx);
    up(e) || fail(`${e.name} is down.`);
    e.cond.prone || fail(`${e.name} is not Prone.`);
    // A controlled mount knocked Prone (or mounted Prone) in its rider's turn stands from its own movement (fix round 2).
    if (s.encounter && inFight(s, e.id) && steering(s, e) && current(s) !== e.id) {
      const bud = turnBudget(s, e) || fail(`${e.name} acts on ${steering(s, e).name}'s turn.`);
      const speed = speedOf(s, e), cost = Math.floor(speed / 2 / FT) * FT;
      speed > 0 || fail(`${e.name} has a Speed of 0 and cannot stand up.`);
      !below(bud.move, cost) || fail(`Standing up takes ${cost} ft of movement; ${e.name} has ${feetLeft(s, bud.move)} ft left.`);
      bud.move -= cost;
      delete e.cond.prone;
      return ev.push({ type: 'stood', id: e.id });
    }
    if (s.encounter && inFight(s, e.id)) {
      current(s) === e.id || fail(`It isn't ${e.name}'s turn.`);
      const speed = speedOf(s, e), cost = Math.floor(speed / 2 / FT) * FT;
      speed > 0 || fail(`${e.name} has a Speed of 0 and cannot stand up.`);
      !below(s.encounter.budget.move, cost) || fail(`Standing up takes ${cost} ft of movement; ${e.name} has ${feetLeft(s, s.encounter.budget.move)} ft left.`);
      s.encounter.budget.move -= cost;
    }
    delete e.cond.prone;
    ev.push({ type: 'stood', id: e.id });
  },
  disengage(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(s, e, ctx);
    s.encounter || fail('Disengage only matters in a fight.');
    if (steering(s, e)) return mountAct(s, e, a, 'Disengage', ev);
    const time = actTime(e, 'disengage', a);
    need(s, e, time);
    s.encounter.budget[time]--; e.cond.disengaged = {};
    ev.push({ type: 'std', id: e.id, action: 'Disengage' });
  },

  // ---------- riding (docs/specs/companions.md, Decision 8; stage C6a) ----------
  // { type: 'mount', actor, mount }: SRD "Mounting and Dismounting": during its move a creature can mount a willing
  // creature at least one size larger within 5 feet, for half its Speed (round down). In a fight only on its own
  // turn, and mounting once a turn and dismounting once a turn ("During your move, you can mount ... or dismount"), so
// a mount's movement and action ("it can move and act even on the turn that you mount it") come once a turn. Willing: on its
  // side and trained to accept a rider (a pack animal with `mount: 'trained'`) or its steed (a bond with `mount:
  // 'controlled'); any other pair only by the DM, who judges willingness and anatomy. Controlled (it moves on the
  // rider's turn as the rider directs, SRD "Controlling a Mount") when trained or its steed and on the rider's side;
  // otherwise independent (it keeps its own turn and goes where it likes).
  mount(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(s, e, ctx);
    // `mount` names a creature, and engine.js walks only its own list of such fields: a player naming one the party
    // does not know of is told what an id that is nothing is told, before anything else is looked at.
    const m = typeof a.mount === 'string' && Object.hasOwn(s.entities, a.mount) ? s.entities[a.mount] : null;
    if (!m || (ctx.role !== 'dm' && unknown(s, m))) fail('No such creature.');
    m.id !== e.id || fail(`${e.name} can't ride itself.`);
    !e.riding || fail(`${e.name} is already riding.`);
    !e.rider || fail(`${e.name} is carrying a rider and can't mount another creature.`);
    !m.riding || fail(`${m.name} is itself riding and can't carry a rider.`);
    !m.rider || fail(`${m.name} already carries a rider.`);
    up(e) || fail(`${e.name} can't move.`);
    !m.dead && up(m) || fail(`${m.name} can't carry a rider now.`);
    !e.cond.prone || fail(`${e.name} is Prone: it stands up first.`);
    !inFight(s, e.id) || current(s) === e.id || fail(`It isn't ${e.name}'s turn.`);
    const speed = speedOf(s, e), cost = Math.floor(speed / 2 / FT) * FT;
    speed > 0 || fail(`${e.name} has a Speed of 0 and can't mount.`);
    const rank = (x) => Object.keys(SIZES).indexOf(SIZES[x.size] ? x.size : 'medium');
    rank(m) >= rank(e) + 1 || fail(`${m.name} must be at least one size larger than ${e.name} to carry it.`);
    // Riding is plain to see: a pair is known to the party together or not at all (Decision 10). The DM is told why.
    unknown(s, e) === unknown(s, m) || fail(`The party knows of only one of ${e.name} and ${m.name}: reveal or hide both before one rides the other.`);
    const trained = CONTENT.monsters[m.tpl]?.mount === 'trained' && !m.form;
    const steed = m.bond?.to === e.id && m.bond.mount === 'controlled';
    if (ctx.role !== 'dm') {
      m.side === e.side || fail(`${m.name} isn't willing to carry ${e.name}.`);
      trained || steed || fail(`${m.name} isn't trained to accept a rider: the DM may let ${e.name} ride it.`);
    }
    apart(s, e, m) <= 1 || fail(`${m.name} must be within 5 ft of ${e.name}.`);
    unblocked(s, e, m) || fail(`There is a wall between ${e.name} and ${m.name}.`);
    const fighting = inFight(s, e.id);
    fighting === inFight(s, m.id) || fail(fighting ? `${m.name} is outside the battle.` : `${m.name} is in the battle and ${e.name} is not.`);
    if (fighting) {
      current(s) === e.id || fail(`It isn't ${e.name}'s turn.`);
      !s.encounter.flags[`mounted:${e.id}`] || fail(`${e.name} has already mounted this turn.`);
      !below(s.encounter.budget.move, cost) || fail(`Mounting takes ${cost} ft of movement; ${e.name} has ${feetLeft(s, s.encounter.budget.move)} ft left.`);
    }
    const controlled = m.side === e.side && (trained || steed) && m.bond?.orders !== 'command';
    if (fighting) { s.encounter.budget.move -= cost; s.encounter.flags[`mounted:${e.id}`] = true; }
    // A rider and its mount walk as one: neither follows the other, and the rider follows no one (its mount may).
    if (e.follow) unfollow(s, e, ev);
    if (m.follow === e.id) unfollow(s, m, ev);
    const prev = e.pos, zonesBefore = snapshot(s);
    e.pos = { q: m.pos.q, r: m.pos.r, z: m.pos.z ?? 0 };
    e.riding = { on: m.id, controlled, size: SIZES[m.size] ? m.size : 'medium' };
    m.rider = e.id;
    // Getting onto a mount that is Prone already is not being knocked Prone while mounted: no save for that Prone (C6b).
    if (m.cond.prone) e.riding.told = 'm';
    ev.push({ type: 'mounted', id: e.id, mount: m.id, controlled });
    // A controlled mount "can move and act even on the turn that you mount it": its movement and one action start now.
    if (fighting && controlled) {
      const had = mountHadTurn(s, m);
      s.encounter.budget.mount = mountTurnBudget(s, m);
      const text = `${m.name} has had its turn this round: it carries ${e.name}, and moves and acts again on ${e.name}'s next turn.`;
      if (had) ev.push(e.side === 'party' ? { type: 'note', id: e.id, text } : { type: 'manual', actor: e.id, name: 'Mounted combat', partial: true, text });
    }
    lookAround(s, ev, [e]);
    trip(s, e, prev, ev, () => {});
    entered(s, ev, KIT, zonesBefore);
    checkEnd(s, ev);
  },
  // { type: 'dismount', actor, to? }: for half its Speed, to an unoccupied space within 5 ft of its mount (`to`, or the
  // nearest one). In a fight only on its own turn, once a turn. A controlled mount gets its own place in
  // the order back at its rider's count, and having moved on its rider's turn it takes no other turn this round.
  dismount(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(s, e, ctx);
    const m = mountOf(s, e) || fail(`${e.name} isn't riding.`);
    // A rider that can't get down by itself (at 0 Hit Points, Incapacitated, or with a Speed of 0) is taken down by the
    // DM: at no cost and on no one's turn in particular, so a downed rider never leaves the pair stuck (fix round 1, M2).
    const speed = speedOf(s, e), cost = Math.floor(speed / 2 / FT) * FT;
    const helpless = !up(e) || !!incapacitated(e) || speed <= 0, lifted = helpless && ctx.role === 'dm';
    if (!lifted) {
      up(e) || fail(`${e.name} can't move: the DM can take ${e.name} down from ${m.name}.`);
      !incapacitated(e) || fail(`${e.name} is ${incapacitatedBy(e) ?? 'Incapacitated'} and can't dismount: the DM can take ${e.name} down from ${m.name}.`);
      speed > 0 || fail(`${e.name} has a Speed of 0 and can't dismount: the DM can take ${e.name} down from ${m.name}.`);
    }
    const fighting = inFight(s, e.id);
    if (fighting && !lifted) {
      current(s) === e.id || fail(`It isn't ${e.name}'s turn.`);
      !s.encounter.flags[`dismounted:${e.id}`] || fail(`${e.name} has already dismounted this turn.`);
      !below(s.encounter.budget.move, cost) || fail(`Dismounting takes ${cost} ft of movement; ${e.name} has ${feetLeft(s, s.encounter.budget.move)} ft left.`);
    }
    const { p: to, lurker } = dismountSpot(s, e, m, a.to);
    // Getting down onto a creature it did not know was there: it stays on and finds it, as a move does (section 5).
    if (lurker) return bumped(s, lurker, e, ev);
    const prev = e.pos, near = fighting && !lifted && !e.cond.disengaged ? threatsAt(s, e, prev) : [];
    if (fighting && !lifted) { s.encounter.budget.move -= cost; s.encounter.flags[`dismounted:${e.id}`] = true; }
    const controlled = e.riding.controlled === true;
    delete e.riding; delete m.rider;
    const zonesBefore = snapshot(s);
    e.pos = to;
    if (fighting) { if (controlled) dismountOrder(s, m, e); if (current(s) === e.id) delete s.encounter.budget.mount; }
    ev.push({ type: 'dismounted', id: e.id, mount: m.id, at: { ...to }, ...(lifted ? { why: 'dm' } : {}) });
    for (const o of near) if (apartAt(s, o, o.pos, e, to) > 1) ev.push({ type: 'manual', actor: o.id, name: 'Opportunity Attack', partial: true,
      text: `${e.name} dismounts out of ${o.name}'s reach. Opportunity Attacks for a rider are not in the engine yet: if ${o.name} takes one, the DM makes it and marks its Reaction used.` });
    lookAround(s, ev, [e]);
    trip(s, e, prev, ev, () => {});
    entered(s, ev, KIT, zonesBefore);
    checkEnd(s, ev);
  },

  // Walk behind another party member, or stop. { type: 'follow', actor, leader: id | null }
  follow(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(s, e, ctx);
    if (a.leader === null || a.leader === undefined) {
      e.follow || fail(`${e.name} isn't following anyone.`);
      return unfollow(s, e, ev);
    }
    // One message for a creature that is not there and one that is not in the party, so nothing is given away.
    const l = s.entities[a.leader];
    (l && l.side === 'party' && !l.dead) || fail('Only a member of the party can be followed.');
    !e.riding || fail(`${e.name} is riding: it goes where its mount goes.`);
    riderOf(s, e) !== l || fail(`${e.name} carries ${l.name}: it can't follow its own rider.`);
    e.side === 'party' || fail(`${e.name} isn't in the party.`);
    up(e) || fail(`${e.name} can't follow anyone just now.`);
    l.id !== e.id || fail(`${e.name} can't follow themselves.`);
    !inFight(s, e.id) && !inFight(s, l.id) || fail('Nobody falls into line in the middle of a fight.');
    e.follow !== l.id || fail(`${e.name} is already following ${l.name}.`);
    for (let x = l, n = 0; x && n < 100; x = s.entities[x.follow], n++) x.id !== e.id || fail(`${l.name} is following ${e.name}.`);
    e.follow = l.id; e.march = nextMarch(s);
    // Someone starting to lead keeps the shape the party stands in; a held or set-by-hand shape
    // takes in a newcomer where it stands. A preset or the column deals it a place as it walks.
    const fm = l.formation;
    if (!fm) capture(s, l, living(s).filter((x) => x.follow === l.id && x.side === 'party'), true);
    else if ((fm.shape === 'held' || fm.shape === 'custom') && !fm.slots[e.id]) capture(s, l, [e], false);
    ev.push({ type: 'follow', id: e.id, leader: l.id });
  },
  // The order the party walks in, first to last. { type: 'marchingOrder', order: [ids] }
  marchingOrder(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can set the marching order.');
    const order = Array.isArray(a.order) ? a.order : fail('Give the marching order as a list.');
    new Set(order).size === order.length || fail('Someone is in the marching order twice.');
    for (const id of order) s.entities[id]?.side === 'party' || fail('Only party members have a place in the marching order.');
    // Those not named keep their order, after those who are.
    const rest = Object.values(s.entities).filter((x) => x.side === 'party' && !order.includes(x.id)).sort(byMarch).map((x) => x.id);
    [...order, ...rest].forEach((id, i) => { s.entities[id].march = i; });
    ev.push({ type: 'marchingOrder', order: [...order, ...rest] });
  },
  // Everyone else in the party falls in behind one of them, in marching order, in a formation.
  // { type: 'partyFollow', leader, shape? }: the DM, or whoever controls the leader. `shape` is a
  // preset (SHAPES) or 'held' (as they stand now); without it the leader keeps the formation it has,
  // and one leading for the first time keeps the shape the party stands in.
  partyFollow(s, a, ctx, ev) {
    const l = s.entities[a.leader];
    (l && l.side === 'party' && !l.dead) || fail('Only a member of the party can lead.');
    control(s, l, ctx);
    !s.encounter || fail('Nobody falls into line in the middle of a fight.');
    a.shape === undefined || [...SHAPES, 'held'].includes(a.shape) || fail(`No such formation: the choices are ${[...SHAPES, 'held'].join(', ')}.`);
    const rest = living(s).filter((x) => x.side === 'party' && x.id !== l.id && up(x) && !x.riding && partnerOf(s, x) !== l).sort(byMarch);     // a rider goes with its mount, and carries the leader's
    rest.length || fail(`There is nobody to follow ${l.name}.`);
    if (l.follow) unfollow(s, l, ev);
    let n = nextMarch(s);
    for (const x of rest) {
      x.march = n++;
      if (x.follow === l.id) continue;
      x.follow = l.id;
      ev.push({ type: 'follow', id: x.id, leader: l.id });
    }
    setFormation(s, l, a.shape ?? (l.formation ? null : 'held'), rest, ev);
  },
  // How the party walks behind its leader. { type: 'formation', leader, shape } (a preset or 'held'),
  // or { type: 'formation', leader, slots: { [follower id]: { back, side } } } to place some by hand
  // (the rest keep theirs). The DM, or the leader's controller while it leads.
  formation(s, a, ctx, ev) {
    const l = s.entities[a.leader];
    (l && l.side === 'party' && !l.dead) || fail('Only a member of the party can lead.');
    control(s, l, ctx);
    !s.encounter || fail('Nobody falls into line in the middle of a fight.');
    const followers = living(s).filter((x) => x.follow === l.id && x.side === 'party').sort(byMarch);
    ctx.role === 'dm' || followers.length || fail(`${l.name} isn't leading anyone.`);
    (a.shape === undefined) !== (a.slots === undefined) || fail('Give a formation, or places in it, but not both.');
    if (a.shape !== undefined) {
      [...SHAPES, 'held'].includes(a.shape) || fail(`No such formation: the choices are ${[...SHAPES, 'held'].join(', ')}.`);
      return setFormation(s, l, a.shape, followers, ev);
    }
    (a.slots && typeof a.slots === 'object' && !Array.isArray(a.slots) && Object.keys(a.slots).length) || fail('Give the places as { id: { back, side } }.');
    const ids = Object.keys(a.slots);
    // One answer for a creature that is not there, one not in the party and one not following, so nothing is given away.
    for (const id of ids) followers.some((x) => x.id === id) || fail(`Only those following ${l.name} can be given a place behind them.`);
    for (const id of ids) validSlot(a.slots[id]) || fail(`A place is steps back (0 to 12) and to the side (-12 to 12, right is more), in half steps.`);
    const fm = l.formation;
    const base = !fm || fm.shape === 'column' ? {} : SHAPES.includes(fm.shape) ? presetSlots(fm.shape, followers.map((x) => x.id)) : fm.slots;
    const slots = structuredClone(base);
    for (const id of ids) slots[id] = { back: a.slots[id].back || 0, side: a.slots[id].side || 0 };
    l.formation = { shape: 'custom', slots, ...(fm?.face !== undefined ? { face: fm.face } : {}) };
    ev.push({ type: 'formation', id: l.id, shape: 'custom', slots: structuredClone(slots) });
  },
};

// Where a rider gets down: `to` if given, else the nearest (world.js, riderLanding, shared with falling off, C6b).
function dismountSpot(s, e, m, want) {
  const G = gridOf(s.map), spot = riderLanding(s, e, m, want);
  if (spot) return spot;
  if (want === undefined || want === null) fail(`There is no free space within 5 ft of ${m.name} for ${e.name} to get down.`);
  (want && Number.isInteger(want.q) && Number.isInteger(want.r)) || fail('Pick a place to get down.');
  const p = landing(s.map, want, want.z ?? m.pos.z);
  (p && landingFits(s, e, m, p)) || fail(`${e.name} can get down only in a space within 5 ft of ${m.name}.`);
  return fail(`That ${G.word.one} is occupied.`);
}

// Set a leader's formation to a preset, to the shape `followers` stand in ('held'), or (null) leave it.
function setFormation(s, l, shape, followers, ev) {
  if (shape === null) return;
  if (shape === 'held') capture(s, l, followers, true);
  else l.formation = { shape, ...(l.formation?.face !== undefined ? { face: l.formation.face } : {}) };
  ev.push({ type: 'formation', id: l.id, shape, ...(l.formation.slots ? { slots: structuredClone(l.formation.slots) } : {}) });
}


