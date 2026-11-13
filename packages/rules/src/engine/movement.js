// Movement actions (engine.js): move, dash, stand, disengage, and walking together (follow,
// marchingOrder, partyFollow). Walking itself: Opportunity Attacks, noticing, traps, engaging.
import * as H from '../hex.js';
import { apart, apartAt, footprint, FT, ground, landing, STEP_MAX, unseenAt } from '../space.js';
import { entered, snapshot } from '../zones.js';
import { canSee, hiddenFrom } from '../sight.js';
import { sightRule, unknown } from '../vision.js';
import { objectDef } from '../walls.js';
import { canReact, instruction, OPPORTUNITY, opportunityAttack, reactionsOf } from '../reactions.js';
import { speedOf } from '../modifiers.js';
import { actTime, ARENA_RADIUS, ask, clear, control, current, ent, fail, fighters, hostile, inFight, less, living, need, unblocked, up } from './shared.js';
import { airspace, aloft, along, byMarch, findable, findDC, joinEncounter, lookAround, moveOptions, NOTICE_FEET, objectName, objectZ, reveal, setObject, trailOf, unfollow, unhide } from './world.js';
import { passive } from './rolls.js';
import { checkEnd, engage, KIT, objectEffects, resolveAttack, runAction, startEncounter } from './resolve.js';

export const ENGAGE_RANGE = 2;       // walking this close to a hostile starts the fight

// Who could make an Opportunity Attack on `e` standing at `pos`: hostile, able to take a Reaction
// (reactions.js, canReact), armed for one, within reach and able to see it (SRD). Whether each
// one takes it is its standing instruction, read in walk().
function threatsAt(s, e, pos) {
  return fighters(s).filter((o) =>
    o.id !== e.id && up(o) && hostile(o, e) && canReact(o) &&
    !!opportunityAttack(o) && apartAt(s, o, o.pos, e, pos) <= 1 && clear(s, o.pos, pos) && canSee(s, o, e) !== 'no');     // SRD: a creature it can see
}
// A creature has just stepped from `prev` to where it stands now: whatever that sets off, goes
// off. Returns true if something did, which ends the creature's movement there.
function trip(s, e, prev, ev, before) {
  let fired = false;
  if (!ground(s.map, e.pos)) return false;                             // nothing on the floor notices what is not on it
  for (const o of s.map.objects) {
    const def = objectDef(o);
    if (!def.triggers?.length || Math.abs(objectZ(s, o) - e.pos.z) > STEP_MAX) continue;
    const nearest = (pos) => Math.min(...footprint(e, pos).map((f) => H.dist(f, o.at)));      // any part of a big creature sets a thing off
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
    if (t.effects) objectEffects(s, o, t.effects, t.area ? living(s).filter((c) => H.dist(c.pos, o.at) * FT <= t.area && Math.abs(c.pos.z - objectZ(s, o)) <= STEP_MAX) : [e], ev);
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
  for (const step of H.pathTo(reach, tk)) {
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
    const k = H.key(step);
    if (fighting && s.encounter) s.encounter.budget.move -= reach.get(k).cost - reach.get(H.key(prev)).cost;
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
    const free = !living(s).some((o) => o.id !== e.id && H.key(o.pos) === k);
    if (s.encounter && s.encounter.arena[H.col(step)] && free) { flush(); joinEncounter(s, e, ev); break; }
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
const KEEP_UP = 2;                   // hexes: a follower stays this close to the one in front where the ground allows
const nextMarch = (s) => Math.max(-1, ...Object.values(s.entities).map((x) => x.march ?? -1)) + 1;

// The leader has walked `walked` (from where it set off). Everyone following it, and everyone
// following them, walks after it in marching order.
function march(s, leader, walked, ev) {
  if (leader.side !== 'party') return;
  const trail = trailOf(walked.slice().reverse());
  const moved = new Set([leader.id]);
  let front = leader;
  const pending = living(s).filter((x) => x.follow && x.id !== leader.id).sort(byMarch);
  for (;;) {
    const f = pending.find((x) => moved.has(x.follow));
    if (!f) return;
    pending.splice(pending.indexOf(f), 1);
    if (s.encounter && inFight(s, f.id)) continue;
    const reach = moveOptions(s, f);
    const frontI = along(trail, front.pos).i;
    // The places it could stop, and where it stands now (staying put costs nothing).
    const spots = [{ k: H.key(f.pos), h: f.pos, cost: 0 }, ...[...reach].filter(([, v]) => v.canStop).map(([k, v]) => ({ k, h: v.h, cost: v.cost }))];
    let best = null, bestKey = null;
    for (const sp of spots) {
      const near = apartAt(s, front, front.pos, f, sp.h), at = along(trail, sp.h);
      const rank = [near <= KEEP_UP ? 0 : 1, at.i > frontI ? 0 : 1, at.d, at.i, near, sp.cost];
      if (!best || less(rank, bestKey)) { best = sp; bestKey = rank; }
    }
    // It can get through if some way it could walk comes up beside the one in front (others in the party do not bar the way).
    const through = [...reach.values()].some((v) => apartAt(s, front, front.pos, f, v.h) <= 1);
    if (!up(f) || !best || !through) { unfollow(s, f, ev, "couldn't keep up"); continue; }
    if (best.k !== H.key(f.pos)) {
      const had = !!s.encounter;
      walk(s, f, reach, best.k, ev, false);
      if (!had && s.encounter) return;                   // it walked into a fight: the rest were brought up when it started
    }
    moved.add(f.id);
    front = f;
  }
}

export const handlers = {
  move(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    up(e) || fail(`${e.name} can't move.`);
    (speedOf(s, e) > 0 || aloft(s, e)) || fail(`${e.name} can't move: its Speed is 0.`);
    const fighting = inFight(s, e.id);
    if (fighting && current(s) !== e.id) fail(`It isn't ${e.name}'s turn.`);
    const reach = moveOptions(s, e);
    // A tap names a hex; if it gives no height, the nearest surface this creature can stop on.
    const column = [...reach.values()].filter((n) => H.col(n.h) === H.col(a.to) && (a.to.z === undefined || n.h.z === a.to.z))
      .sort((x, y) => (y.canStop - x.canStop) || Math.abs(x.h.z - e.pos.z) - Math.abs(y.h.z - e.pos.z))[0];
    const to = column?.h ?? (a.to.z !== undefined && airspace(s.map, a.to) ? { q: a.to.q, r: a.to.r, z: a.to.z } : landing(s.map, a.to, e.pos.z));
    to || fail("There's nothing there to stand on.");
    let tk = H.key(to), node = reach.get(tk);
    // Walking onto a hex where something unseen is standing: stop beside it and find out what it
    // is. Refusing the move would tell the player something is there without saying what.
    // That is a creature the DM hid (never in a fight) or one hiding from it.
    // Under the los and light rules, for a party member, also one the party cannot see.
    const lurker = living(s).find((o) => ((!fighting && o.hidden) || hiddenFrom(o, e) || (e.side === 'party' && sightRule(s) !== 'rooms' && unknown(s, o))) && hostile(o, e) && H.key(o.pos) === tk);
    if (lurker) {
      if (apart(s, e, lurker) <= 1) return bumped(s, lurker, e, ev);   // already beside it: no move, but it is found
      const beside = [...reach.keys()].filter((k) => reach.get(k).canStop && H.dist(reach.get(k).h, to) === 1 && Math.abs(reach.get(k).h.z - to.z) <= STEP_MAX)
        .sort((x, y) => reach.get(x).cost - reach.get(y).cost)[0];
      if (!beside) fail("Can't get there.");
      tk = beside; node = reach.get(tk);
    }
    if (!node || !node.canStop) {
      if (fighting && !s.encounter.arena[H.col(to)]) fail("The arena is locked until the fight ends.");
      if (node) fail('That hex is occupied.');
      fail(fighting ? `Too far. ${e.name} has ${s.encounter.budget.move} ft of movement left.` : "Can't get there.");
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
    const e = ent(s, a.actor); control(e, ctx);
    s.encounter || fail('Dash only matters in a fight. Just move.');
    const time = actTime(e, 'dash', a);
    need(s, e, time);
    s.encounter.budget[time]--; s.encounter.budget.move += speedOf(s, e); s.encounter.budget.dashes = (s.encounter.budget.dashes | 0) + 1;
    ev.push({ type: 'std', id: e.id, action: 'Dash' });
  },
  // Stand up from Prone (E14). In a fight, on its own turn, for half its Speed (the SRD lets it be done
  // during a move); outside one, at no cost. A creature with a Speed of 0 cannot.
  stand(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    up(e) || fail(`${e.name} is down.`);
    e.cond.prone || fail(`${e.name} is not Prone.`);
    if (s.encounter && inFight(s, e.id)) {
      current(s) === e.id || fail(`It isn't ${e.name}'s turn.`);
      const speed = speedOf(s, e), cost = Math.floor(speed / 2 / FT) * FT;
      speed > 0 || fail(`${e.name} has a Speed of 0 and cannot stand up.`);
      s.encounter.budget.move >= cost || fail(`Standing up takes ${cost} ft of movement; ${e.name} has ${s.encounter.budget.move} ft left.`);
      s.encounter.budget.move -= cost;
    }
    delete e.cond.prone;
    ev.push({ type: 'stood', id: e.id });
  },
  disengage(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    s.encounter || fail('Disengage only matters in a fight.');
    const time = actTime(e, 'disengage', a);
    need(s, e, time);
    s.encounter.budget[time]--; e.cond.disengaged = {};
    ev.push({ type: 'std', id: e.id, action: 'Disengage' });
  },

  // Walk behind another party member, or stop. { type: 'follow', actor, leader: id | null }
  follow(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
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
  // Everyone else in the party falls in behind one of them, in marching order. { type: 'partyFollow', leader }
  partyFollow(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can move the whole party.');
    const l = s.entities[a.leader];
    (l && l.side === 'party' && !l.dead) || fail('Only a member of the party can lead.');
    !s.encounter || fail('Nobody falls into line in the middle of a fight.');
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
  },
};

