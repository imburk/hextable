// Movement actions (engine.js): move, dash, stand, disengage, and walking together (follow,
// marchingOrder, partyFollow). Walking itself: Opportunity Attacks, noticing, traps, engaging.
import { gridOf, col, key } from '../grid.js';
import { apart, apartAt, concealed, footprint, FT, ground, landing, measure, overlapAt, STEP_MAX, unseenAt } from '../space.js';
import { entered, holds, snapshot, zonesOf } from '../zones.js';
import { canSee, hiddenFrom } from '../sight.js';
import { sightRule, unknown } from '../vision.js';
import { barriers, objectDef } from '../walls.js';
import { canReact, instruction, OPPORTUNITY, opportunityAttack, reactionsOf } from '../reactions.js';
import { modifiers, speedOf } from '../modifiers.js';
import { actTime, ARENA_RADIUS, ask, clear, control, current, ent, fail, fighters, fleetFree, fleetOf, hostile, inFight, less, living, need, unblocked, up } from './shared.js';
import { airspace, aloft, along, below, byMarch, captureSlots, frameOf, presetSlots, SHAPES, slotPoint, slotsFor, validSlot, walkFace, feetLeft, findable, findDC, joinEncounter, lookAround, moveOptions, NOTICE_FEET, objectName, objectZ, reveal, route, setObject, trailOf, unfollow, unhide } from './world.js';
import { passive } from './rolls.js';
import { checkEnd, engage, KIT, objectEffects, resolveAttack, runAction, startEncounter } from './resolve.js';

export const ENGAGE_RANGE = 2;       // walking this close to a hostile starts the fight

// Who could make an Opportunity Attack on `e` standing at `pos`: hostile, able to take a Reaction
// (reactions.js, canReact), armed for one, within reach and able to see it (SRD). Whether each
// one takes it is its standing instruction, read in walk().
function threatsAt(s, e, pos) {
  return fighters(s).filter((o) =>
    o.id !== e.id && up(o) && hostile(o, e) && canReact(o) &&
    !!opportunityAttack(o) && apartAt(s, o, o.pos, e, pos) <= 1 && clear(s, o.pos, pos) && canSee(s, o, e) !== 'no'     // SRD: a creature it can see
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

// Walk a creature to `tk` along the way `reach` found for it. Every step can set something off,
// catch an eye, or (outside a fight) start one. Returns the positions it stood on, from where it
// set off, or null if it noticed something before taking a step and so did not go at all.
function walk(s, e, reach, tk, ev, fighting) {
  let seg = [], prev = e.pos;
  const walked = [e.pos];
  const flush = () => { if (seg.length) ev.push({ type: 'moved', id: e.id, path: seg }); seg = []; };
  if (notice(s, e, ev, flush)) return null;
  const range = Math.max(ENGAGE_RANGE, Math.floor((s.settings.engageRange ?? 10) / FT));
  // Movement is spent as the route goes. On squares it is what was left at the start less the
  // route's cost so far, one subtraction, so fractions of a foot never pile up; on hexes, step by
  // step as it always was (the same numbers: there every cost is whole or half feet).
  const square = gridOf(s.map).kind === 'square', base = s.encounter?.budget?.move;
  let spent = 0;
  for (const { h: step, cost, p } of route(reach, tk)) {
    if (fighting && s.encounter && !e.cond.disengaged) {
      for (const o of threatsAt(s, e, prev)) {
        if (apartAt(s, o, o.pos, e, step) <= 1) continue;
        // Its standing instruction for the Opportunity Attack (reactions.js). `never`: nothing
        // happens and nothing is said. `ask`: its player is asked, and the walk waits; for one of
        // the DM's creatures the DM alone is told and decides by hand.
        const w = instruction(o, reactionsOf(o).find((r) => r.id === OPPORTUNITY));
        if (w === 'never') continue;
        if (w === 'ask') {
          const answer = ask(s, o, { trigger: 'leave', by: e.id }, [{ reaction: OPPORTUNITY, name: 'Opportunity Attack' }]);
          if (answer === null) {
            ev.push({ type: 'manual', actor: o.id, name: 'Opportunity Attack', partial: true,
              text: `${e.name} leaves ${o.name}'s reach. ${o.name}'s instruction is to ask the DM: if it takes the Opportunity Attack, the DM makes it and marks its Reaction used.` });
            continue;
          }
          if (answer.take !== OPPORTUNITY) continue;
        }
        flush();
        o.reactionUsed = true;
        ev.push({ type: 'reaction', id: o.id, reaction: OPPORTUNITY, name: 'Opportunity Attack', trigger: 'leave', against: e.id });
        const oa = opportunityAttack(o);
        if (o.actions) runAction(s, o, oa, [e], null, null, ev, { opportunity: true });
        else resolveAttack(s, o, e, oa, ev, { opportunity: true });
        if (!up(e)) break;
      }
      if (!up(e)) break;
    }
    const k = key(step);
    if (fighting && s.encounter) {
      const b = s.encounter.budget;
      if (square) b.move = base - cost; else b.move -= cost - spent;
      if (p !== undefined) b.diagonals = p;                              // 'alternate': is the next diagonal a second one?
    }
    spent = cost;
    const was = e.pos, zonesBefore = snapshot(s);
    e.pos = step; seg.push(step); prev = step; walked.push(step);
    lookAround(s, ev, [e], flush);
    if (trip(s, e, was, ev, flush) || !up(e)) break;                    // a trap ends the walk where it was sprung
    // So does a zone it walks into (Web, Moonbeam); one that moves with it may catch others.
    if (entered(s, ev, KIT, zonesBefore, flush).includes(e.id) || !up(e)) { checkEnd(s, ev); break; }
    if (notice(s, e, ev, flush)) break;                                  // and so does spotting something
    if (fighting) continue;
    // Anything lying in wait this close is spotted, whether or not a fight follows.
    for (const o of living(s)) if (o.hidden && hostile(o, e) && apart(s, o, e) <= ENGAGE_RANGE && unblocked(s, o, e)) { flush(); reveal(s, o, ev); }
    const free = !living(s).some((o) => o.id !== e.id && key(o.pos) === k);
    if (s.encounter && s.encounter.arena[col(step)] && free) { flush(); joinEncounter(s, e, ev); break; }
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
  return walked;
}
const KEEP_UP = 2;                   // cells: a follower stays this close to the one in front where the ground allows
const nextMarch = (s) => Math.max(-1, ...Object.values(s.entities).map((x) => x.march ?? -1)) + 1;

// The leader has walked `walked` (from where it set off). Everyone following it, and everyone
// following them, walks after it: those with a slot in its formation to their slots, if every one
// of them has room there; the rest, and everyone when there is no room, in marching order along the
// leader's trail (the column).
function march(s, leader, walked, ev) {
  if (leader.side !== 'party') return;
  const G = gridOf(s.map), trail = trailOf(walked.slice().reverse(), null, G);
  const moved = new Set([leader.id]);
  let front = leader;
  const pending = living(s).filter((x) => x.follow && x.id !== leader.id).sort(byMarch);
  const fell = formation(s, leader, walked, pending, ev);
  if (fell === 'fight') return;                          // it walked into a fight: the rest were brought up when it started
  for (const f of fell) { pending.splice(pending.indexOf(f), 1); moved.add(f.id); front = f; }
  for (;;) {
    const f = pending.find((x) => moved.has(x.follow));
    if (!f) return;
    pending.splice(pending.indexOf(f), 1);
    if (s.encounter && inFight(s, f.id)) continue;
    const reach = moveOptions(s, f);
    const frontI = along(trail, front.pos, G).i;
    // The places it could stop, and where it stands now (staying put costs nothing).
    const spots = [{ k: key(f.pos), h: f.pos, cost: 0 }, ...[...reach].filter(([, v]) => v.canStop).map(([k, v]) => ({ k, h: v.h, cost: v.cost }))];
    let best = null, bestKey = null;
    for (const sp of spots) {
      const near = apartAt(s, front, front.pos, f, sp.h), at = along(trail, sp.h, G);
      const rank = [near <= KEEP_UP ? 0 : 1, at.i > frontI ? 0 : 1, at.d, at.i, near, sp.cost];
      if (!best || less(rank, bestKey)) { best = sp; bestKey = rank; }
    }
    // It can get through if some way it could walk comes up beside the one in front (others in the party do not bar the way).
    const through = [...reach.values()].some((v) => apartAt(s, front, front.pos, f, v.h) <= 1);
    if (!up(f) || !best || !through) { unfollow(s, f, ev, "couldn't keep up"); continue; }
    if (best.k !== key(f.pos)) {
      const had = !!s.encounter;
      walk(s, f, reach, best.k, ev, false);
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
  // How far the leader would walk to each column.
  const theirs = new Map([[col(leader.pos), 0]]);
  const lr = moveOptions(s, leader);
  for (const v of [...lr.values(), ...besideLurk(lr)]) { const c = col(v.h), was = theirs.get(c); if (was === undefined || v.cost < was) theirs.set(c, v.cost); }
  const joined = (h) => (theirs.get(col(h)) ?? Infinity) <= 2 * FT * (G.dist(leader.pos, h) + KEEP_UP);
  const ahead = (h) => { const w = G.toWorld(h); return ((w.x - F.x) * F.u.x + (w.z - F.z) * F.u.z) / uu; };
  const water = (h) => ground(s.map, h)?.tile.t === 'water';
  // One who is down, cannot move or cannot get up beside the leader is left to the column after the
  // others (whose rules drop it as not keeping up); the rest keep their places.
  const reaches = new Map(members.map((x) => [x.id, moveOptions(s, x)]));
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
    const reach = moveOptions(s, f), now = (sp) => sp.here || (sp.canStop && !theirsToGo(sp.h));
    let to = i < 0 ? placeFor(f, spotsOf(f, reach), now)?.h ?? f.pos : h;
    const lurker = holders(f, to).find((o) => unseenBy(s, o, f) && hostile(o, f));
    if (lurker) {
      const beside = [...reach.values()].filter((v) => v.canStop && !theirsToGo(v.h) && G.dist(v.h, to) === 1 && Math.abs(v.h.z - to.z) <= STEP_MAX && !walls(v.h, to)).sort((x, y) => x.cost - y.cost)[0];
      to = beside ? beside.h : f.pos;
    } else if (key(to) !== key(f.pos) && !reach.get(key(to))?.canStop) to = placeFor(f, spotsOf(f, reach), now)?.h ?? f.pos;   // someone it did not know of, not hostile
    if (key(to) !== key(f.pos)) {
      const had = !!s.encounter;
      walk(s, f, reach, key(to), ev, false);
      if (!had && s.encounter) return 'fight';
    }
    if (lurker && !lurker.dead && apart(s, f, lurker) <= 1 && unseenBy(s, lurker, f)) bumped(s, lurker, f, ev);
    done.push(f);
  }
  return done;
}
// Would a careful walker stop here? Not on a trap the party knows of that goes off on stepping there or
// coming near (as moveOptions keeps every way off a spotted trap), nor where a lasting zone the party
// knows of (its maker is not hidden from them) would take it in: Web, Spirit Guardians, Moonbeam. A
// trap or zone the party does not know of plays no part: it springs on a walk as on any walk.
function peril(s, f, h) {
  const G = gridOf(s.map), far = measure(s, G), parts = footprint(f, h, G);
  for (const o of s.map.objects) {
    const def = objectDef(o);
    if (!def.triggers?.length || def.states[o.state]?.hidden || Math.abs(objectZ(s, o) - h.z) > STEP_MAX) continue;
    const near = Math.min(...parts.map((x) => far(x, o.at)));
    if (def.triggers.some((t) => t.effects && t.from.includes(o.state) && (t.who !== 'party' || f.side === 'party') && (t.on === 'enter' ? near === 0 : t.on !== 'leave' && near * FT <= t.feet))) return true;
  }
  const there = { ...f, pos: h };
  const known = (o) => !!o && (o.side === 'party' || (!concealed(s.map, o) && (sightRule(s) === 'rooms' || !unknown(s, o))));       // as view.js classifies it
  return zonesOf(s).some((fx) => known(s.entities[fx.source]) && (fx.zone.on ?? []).length > 0 && holds(s, fx, there) && !holds(s, fx, f));
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

export const handlers = {
  move(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(s, e, ctx);
    up(e) || fail(`${e.name} can't move.`);
    (speedOf(s, e) > 0 || aloft(s, e)) || fail(`${e.name} can't move: its Speed is 0.`);
    const fighting = inFight(s, e.id);
    if (fighting && current(s) !== e.id) fail(`It isn't ${e.name}'s turn.`);
    const reach = moveOptions(s, e);
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
    const lurker = living(s).find((o) => ((!fighting && o.hidden) || hiddenFrom(o, e) || (e.side === 'party' && sightRule(s) !== 'rooms' && unknown(s, o))) && hostile(o, e) && key(o.pos) === tk);
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
      fail(fighting ? `Too far. ${e.name} has ${feetLeft(s, s.encounter.budget.move)} ft of movement left.` : "Can't get there.");
    }
    // Moved on its own, it walks on its own: it no longer follows anyone.
    if (!fighting && e.follow) unfollow(s, e, ev);
    const had = !!s.encounter, walked = walk(s, e, reach, tk, ev, fighting);
    if (!walked) return;                                 // something caught the eye before a step was taken: the walk waits
    if (lurker) bumped(s, lurker, e, ev);
    // Whoever follows it comes after, unless a fight broke out on the way: then they were brought up when it did.
    if (!fighting && (had || !s.encounter) && walked.length > 1) march(s, e, walked, ev);
    checkEnd(s, ev);
  },

  dash(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(s, e, ctx);
    s.encounter || fail('Dash only matters in a fight. Just move.');
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
    const time = actTime(e, 'disengage', a);
    need(s, e, time);
    s.encounter.budget[time]--; e.cond.disengaged = {};
    ev.push({ type: 'std', id: e.id, action: 'Disengage' });
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
    const rest = living(s).filter((x) => x.side === 'party' && x.id !== l.id && up(x)).sort(byMarch);
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

// Set a leader's formation to a preset, to the shape `followers` stand in ('held'), or (null) leave it.
function setFormation(s, l, shape, followers, ev) {
  if (shape === null) return;
  if (shape === 'held') capture(s, l, followers, true);
  else l.formation = { shape, ...(l.formation?.face !== undefined ? { face: l.formation.face } : {}) };
  ev.push({ type: 'formation', id: l.id, shape, ...(l.formation.slots ? { slots: structuredClone(l.formation.slots) } : {}) });
}


