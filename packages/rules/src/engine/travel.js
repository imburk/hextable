// Places of a world (engine.js; docs/specs/travel.md, Decisions 1, 4 and 5; build row W2, V1): one place in play,
// the others parked as they were left. loadMap { node } (through engine/dm.js), enter, leave, goTo, forgetPlace,
// keepPlace, resetPlace, nodeAdd and place { node } (through engine/dm.js). The state's fields and the pure parts
// (arrivals, who goes with whom, what becomes of an effect, stale places) are in places.js.
//
// Every action here is the DM's (players moving their own group under `atlasMoves` is W5, with the player ids of W4),
// is refused in a fight, and checks everything before it changes anything.
import { effectsOf, endEffect, tick } from '../durations.js';
import { holdingMap, lintMap, migrateMap } from '../map.js';
import { key } from '../grid.js';
import {
  arrivalSpots, battleRecord, CAP_TEXT, depthOf, effectFate, emptyWorld, goingWith, isBattle, marchOrder, NODE_KINDS, nodeIdFor,
  nodeOf, parkedBattles, parkedOf, pinOf, placeName, newRecord, setPin, STALE_CHOICES, staleQuestion, TRAVEL_LIMITS,
} from '../places.js';
import { fail } from './shared.js';
import { lookAround, unfollow } from './world.js';
import { dawn } from './rests.js';
import { endHold } from './resolve.js';

const dmOnly = (ctx, what) => ctx.role === 'dm' || fail(`Only the DM can ${what}.`);
const noFight = (s) => !s.encounter || fail('Nobody can go anywhere in the middle of a fight.');
const own = (o, k) => !!o && typeof o === 'object' && typeof k === 'string' && Object.hasOwn(o, k);

// A map document that came with an action (the first visit of a battle node, a reset): brought up to date and linted,
// as `loadMap` checks one.
function readMap(doc) {
  let map;
  try { map = migrateMap(structuredClone(doc)); } catch { fail("That map can't be used. It is not a map document."); }
  const problems = lintMap(map);
  problems.length === 0 || fail(`That map can't be used. ${problems[0]}`);
  !map.holding || fail("That map can't be used. It is marked as a holding map, which is the engine's own.");
  return map;
}
function nodeNamed(s, id) {
  typeof id === 'string' || fail('Name a place by its id.');
  return nodeOf(s, id) || fail(`There is no place "${id}" in this world.`);
}

// The `stale` answer an action carries into a stale place (Decision 5): refused with the question until it has one.
function staleGate(s, id, rec, a) {
  a.stale === undefined || STALE_CHOICES.includes(a.stale) || fail(`"stale" can be: ${STALE_CHOICES.join(', ')}.`);
  if (!rec || rec.stale === null || rec.stale === undefined) return null;
  a.stale !== undefined || fail(staleQuestion(s, id, rec));
  return a.stale;
}

// `who` as an action names it: a list of creatures of `here` (or one id), or by default `fallback`.
function named(here, who, fallback) {
  if (who === undefined) return fallback;
  const ids = typeof who === 'string' ? [who] : who;
  (Array.isArray(ids) && ids.length > 0 && ids.length <= 500 && ids.every((id) => typeof id === 'string')) || fail('Name who goes.');
  new Set(ids).size === ids.length || fail('Name each creature once.');
  for (const id of ids) own(here, id) || fail('No such creature.');
  return ids;
}
function movers(here, ids) {
  ids.length || fail('Nobody of the party is there.');
  const g = goingWith(here, ids);
  return g.ids ?? fail(g.problem);
}
const partyIn = (here) => Object.values(here).filter((e) => e.side === 'party').map((e) => e.id);

// Does the place in play hold anything of play? A battle map always does (its doors, what was seen); a navigation or
// scene node only if someone is there or its scene is.
const holdsAnything = (s) => (!!s.map && !s.map.holding) || Object.keys(s.entities).length > 0 || !!s.scene;

// ---------- the parts of a move ----------
// What on a creature names another creature, and how a move between places keeps it whole (Risks, "Parking moves
// creatures out of s.entities"; travel-places.test.js reads the engine for any other such field):
//   follow             a follower whose leader is on the other side stops following (split)
//   bond.to            a companion goes with its master; one named without it is refused (places.js, goingWith)
//   riding.on, rider   a rider and its mount go together (goingWith)
//   pocket             a familiar in its master's pocket is in the master's record, and goes with it
//   formation.slots    a leader's places for its followers: a place for one who stopped following goes (world.js, unfollow)
//   cond.grappled.holds[].by   a grapple between one who goes and one who stays ends (split)
//   an effect's source and its parts' targets   it goes, stays or ends (places.js, effectFate)
// A fight's order, a waiting reaction and a reaction instruction's target cannot hold an away creature: nothing moves
// between places in a fight or while an action waits (engine.js, WHILE_WAITING).
export const CREATURE_LINKS = ['follow', 'bond', 'riding', 'rider', 'pocket', 'formation', 'grappled'];
// Takes the movers out of a place (the place in play, `s`, or a parked record): followers whose leader is on the other
// side stop following; each lasting effect goes with them, stays or ends (places.js, effectFate). Returns what goes.
function split(place, ids, ev) {
  const here = place.entities;
  // A grapple between one who goes and one who stays ends (resolve.js, endHold).
  for (const t of Object.values(here)) for (const h of [...(t.cond?.grappled?.holds ?? [])]) if (own(here, h?.by) && ids.has(t.id) !== ids.has(h.by)) endHold(place, t, h.by, 'gone', ev);
  for (const x of Object.values(here)) if (typeof x.follow === 'string' && own(here, x.follow) && ids.has(x.id) !== ids.has(x.follow)) unfollow(place, x, ev);
  const go = [];
  for (const fx of [...(place.effects ?? [])]) {
    const f = effectFate(fx, ids, here);
    if (f === 'end') endEffect(place, ev, fx, 'the party moved on');
    else if (f === 'go') go.push(fx);
  }
  if (go.length) place.effects = place.effects.filter((fx) => !go.includes(fx));
  const creatures = [];
  for (const id of ids) { creatures.push(here[id]); delete here[id]; }
  return { creatures, effects: go };
}
// Sets the movers down in a place at `spots`, and at `pin` on a navigation node (null: at none). A navigation or scene
// node holds its creatures on its holding map (Decision 1), where they are set down as on any map; where they stand
// there means nothing (the screens draw the node's picture), and the map is never made again while the node is held.
function join(s, place, out, spots, pin) {
  out.creatures.forEach((e, i) => {
    place.entities[e.id] = e;
    e.pos = spots[i];
    setPin(s, e.id, pin);
  });
  if (out.effects.length) (place.effects ??= []).push(...out.effects);
}
// Where `list` is set down on `map` among `others` (creatures already there), at `entry` (a battle map) or anywhere (a
// holding map): positions, or the refusal.
function spotsFor(map, list, entry, others) {
  const r = arrivalSpots(map, list.length, entry, new Set(others.filter((e) => !e.dead).map((e) => key(e.pos))));
  return r.spots ?? fail(r.problem);
}

// The creatures that were in a parked place catch up when it comes into play (Decision 5): nothing is simulated for the
// time it was away (no monster walks), then its lasting effects whose time is up end, and each creature there gets the
// dawns it missed, through the same code as `rest` and `advanceTime`.
// `rec` is the record they come out of: each creature is counted from when it was parked (the record's `since`, or its own
// in `sinceOf`, for one that came into the record later or stayed there through a reset).
function catchUp(s, rec, who, ev) {
  const by = new Map();
  for (const e of who) { const t = awaySince(rec, e.id); by.set(t, [...(by.get(t) ?? []), e]); }
  for (const [t, list] of [...by].sort((x, y) => x[0] - y[0])) dawn(s, t, ev, list);
  tick(s, ev);
}
const awaySince = (rec, id) => (own(rec.sinceOf, id) ? rec.sinceOf[id] : rec.since);
// Creatures put into a parked record keep the clock they were parked from (Decision 5: what they missed is counted from
// it): from play, now; from another parked record, that record's count for them.
function sinceInto(s, into, from, ids) {
  for (const id of ids) {
    const t = from ? awaySince(from, id) : s.clock;
    if (t !== into.since) (into.sinceOf ??= {})[id] = t; else if (own(into.sinceOf, id)) delete into.sinceOf[id];
  }
}

// Parks the place in play (Decision 5: "leaving parks"), as it is now, with whoever is still in it.
function park(s, from, ev) {
  (s.parked ??= {})[from] = newRecord(s.map, s.clock, { entities: s.entities, effects: effectsOf(s), scene: s.scene ?? null });
  ev.push({ type: 'parked', node: from });
}
// Makes `to` the place in play, with `target`'s map, creatures, effects and scene.
function bring(s, to, target) {
  s.map = target.map; s.entities = target.entities; s.effects = target.effects; s.scene = target.scene;
  s.place = to;
}
const unparked = (rec) => ({ map: rec.map, entities: rec.entities, effects: rec.effects ?? [], scene: rec.scene ?? null });

// The target of an arrival, as it will be: its map, its creatures, its effects and scene, and, for a parked place, when
// it was parked. Nothing is changed: a parked record is read, not taken.
function targetOf(s, to, node, a) {
  const rec = parkedOf(s, to);
  if (rec) return { rec, map: rec.map, entities: rec.entities, since: rec.since };
  if (isBattle(node)) {
    a.map !== undefined || fail(`Nobody has been to ${placeName(s, to)} yet: its map must come with the action.`);
    return { rec: null, map: readMap(a.map), entities: {}, since: null };
  }
  return { rec: null, map: holdingMap(), entities: {}, since: null };
}

// The parked cap (Decision 5): a move that would leave more battle places parked than TRAVEL_LIMITS.parked is refused. Only
// parked records count: the place in play does not, a first visit to a battle node does not (it is in play), and a battle
// place added at the table with its map does (nodeAdd parks it).
function capCheck(s, { parkingFrom, unparking, adding }) {
  const n = parkedBattles(s) + (parkingFrom ? 1 : 0) - (unparking ? 1 : 0) + (adding ? 1 : 0);
  n <= TRAVEL_LIMITS.parked || fail(CAP_TEXT);
}

// ---------- the stale answer, and a reset ----------
// An `effectEnd` may reach the player whose creature was its source (view.js), so the reasons given here never name a place.
function resetPlan(s, id, rec, doc) {
  const node = nodeOf(s, id), name = placeName(s, id);
  battleRecord(rec) || fail(`${name} is not a battle map: there is nothing to put back.`);
  (node && !node.gone) || fail(`${name} is not in the world pack any more: there is nothing to put it back to.`);
  !node.added || fail(`${name} was made at the table and is not in the world pack: there is nothing to put it back to.`);
  doc !== undefined || fail(`The prepared map of ${name} did not come with the action.`);
  const map = readMap(doc);
  const g = goingWith(rec.entities, partyIn(rec.entities));
  g.ids || fail(g.problem);
  const order = marchOrder([...g.ids].map((x) => rec.entities[x]), Object.values(rec.entities));
  let came = s.world?.came && own(s.world.came, id) ? s.world.came[id] : null;
  if (!(map.entries ?? []).some((en) => en.id === came)) came = null;     // the entry they came by, or the map's default
  const r = arrivalSpots(map, order.length, came);
  r.spots || fail(r.problem);
  return { map, order, spots: r.spots, name };
}
function applyReset(s, id, rec, plan, ev) {
  const keep = new Set(plan.order.map((e) => e.id));
  let ended = 0, dropped = 0;
  for (const fx of [...rec.effects]) if (effectFate(fx, keep, rec.entities) !== 'go') { endEffect(rec, ev, fx, 'the place was put back as prepared'); ended++; }
  for (const x of Object.keys(rec.entities)) if (!keep.has(x)) { delete rec.entities[x]; dropped++; }
  const was = new Map([...keep].map((x) => [x, awaySince(rec, x)]));
  plan.order.forEach((e, i) => { e.pos = plan.spots[i]; setPin(s, e.id, null); });
  Object.assign(rec, { map: plan.map, scene: null, since: s.clock, kept: null, stale: null });
  delete rec.sinceOf;
  for (const [x, t] of was) if (t !== rec.since) (rec.sinceOf ??= {})[x] = t;          // the party there still missed what it missed
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  ev.push({ type: 'placeReset', node: id, name: plan.name,
    text: `${plan.name} was put back as the world pack has it: ${n(dropped, 'creature', 'creatures')} not of the party, ${n(ended, 'lasting effect', 'lasting effects')} and every change to its map (doors, what was seen, the DM's edits) were dropped.${keep.size ? ` ${n(keep.size, 'creature', 'creatures')} of the party there ${keep.size === 1 ? 'was' : 'were'} set down at its entry.` : ''}` });
}
// The DM's answer carried by a move into a stale place: keep (the ten days count again), edit (kept as left, the
// mark cleared: the DM edits it there), or reset (`plan`, made beforehand); or, with no answer to be had, a portal's
// arrival, kept as left.
function answerStale(s, id, rec, answer, plan, ev) {
  if (answer === 'reset') return applyReset(s, id, rec, plan, ev);
  rec.stale = null;
  if (answer === 'keep' || answer === 'portal') rec.kept = s.clock;
  ev.push({ type: 'placeKept', node: id, name: placeName(s, id), how: answer });
}

// ---------- arriving ----------
// Moves `ids` (creatures in play, with their companions) from the place in play to the node `to`, at `entry` (a battle
// node) or `pin` (a navigation node). The place they leave is parked with whoever stays (or, if it is not a place of the
// world, thrown away as `loadMap` throws a map away: then the whole party must go). Every check is made before anything
// changes. `a` is the action, for its `map` and `stale`. `portal`: an arrival by a portal or spell (W8), see below.
export function arrive(s, a, ev, { to, ids, entry = null, pin = null, portal = false }) {
  noFight(s);
  !s.journey || fail('The party is on a journey: end it first.');
  const node = nodeNamed(s, to), name = placeName(s, to), from = s.place ?? null;
  to !== from || fail(`The table is already at ${name}.`);
  const going = movers(s.entities, ids);
  if (from === null) partyIn(s.entities).every((x) => going.has(x)) || fail('The map in play is not a place of the world: the whole party goes together. Add it as a place first (nodeAdd with here) to leave someone there.');
  const t = targetOf(s, to, node, a);
  // A creature that arrives by a portal or a spell the DM was not at the table for (the `travel` step, W8) goes in with the
  // place kept as left, the mark cleared and the DM told: the engine may not choose to reset for them.
  const answer = portal && t.rec?.stale !== null && t.rec?.stale !== undefined ? 'portal' : staleGate(s, to, t.rec, a);
  const plan = answer === 'reset' ? resetPlan(s, to, t.rec, a.map) : null;
  // Where they are set down.
  const battle = isBattle(node);
  entry === null || typeof entry === 'string' || fail('Name an entry by its id.');
  pin === null || typeof pin === 'string' || fail('Name a pin by its id.');
  !(entry !== null && !battle) || fail(`${name} is not a battle map: it has no entries.`);
  !(pin !== null && node.kind !== 'nav') || fail(`${name} is not a navigation map: it has no pins.`);
  pin === null || (node.pins ?? []).some((p) => p.id === pin) || fail(`${name} has no pin "${pin}".`);
  const order = marchOrder([...going].map((x) => s.entities[x]), Object.values(s.entities));
  const spots = plan ? spotsFor(plan.map, order, entry, plan.order.map((e, i) => ({ ...e, pos: plan.spots[i] })))
    : spotsFor(t.map, order, entry, Object.values(t.entities));
  const stays = new Set(Object.keys(s.entities).filter((x) => !going.has(x)));
  const parking = from !== null && (!s.map.holding || stays.size > 0 || !!s.scene);
  capCheck(s, { parkingFrom: parking && !s.map.holding, unparking: battleRecord(t.rec), adding: false });   // the place arrived at is in play, not parked
  // Nothing has changed so far. Now: out of the place in play,
  const out = split(s, going, ev);
  if (from === null) {
    // a map that is not a place of the world is thrown away, as `loadMap` does (the creatures of the old place stay
    // behind with it, and so do its lasting effects).
    for (const fx of [...effectsOf(s)]) endEffect(s, ev, fx, 'the party moved on');
    for (const x of Object.keys(s.entities)) delete s.entities[x];
  }
  // the stale answer, the place parked and the target brought into play (a parked one catches up),
  const rec = t.rec;
  if (answer) answerStale(s, to, rec, answer, plan, ev);
  if (rec) delete s.parked[to];
  if (parking) park(s, from, ev);
  else for (const fx of [...effectsOf(s)]) endEffect(s, ev, fx, 'the party moved on');   // a navigation or scene node nobody stays at is let go; what was left of its effects ends
  bring(s, to, rec ? unparked(rec) : { map: t.map, entities: {}, effects: [], scene: null });
  if (rec) catchUp(s, rec, Object.values(rec.entities), ev);
  // and the movers set down.
  join(s, s, { creatures: order, effects: out.effects }, spots, battle ? null : pin);
  if (battle) ((s.world ??= emptyWorld()).came ??= {})[to] = entry;
  ev.push({ type: 'map', map: s.map.id, name: s.map.name });
  ev.push({ type: 'arrived', node: to, name, from, ids: [...going], ...(entry !== null ? { entry } : {}), ...(pin !== null ? { pin } : {}) });
  lookAround(s, ev);
}

// `loadMap { node, entry?, who?, stale?, map? }` (engine/dm.js sends it here): the party, or `who`, goes to `node`.
export function loadNode(s, a, ctx, ev) {
  const ids = named(s.entities, a.who, partyIn(s.entities));
  arrive(s, a, ev, { to: a.node, ids, entry: a.entry ?? null });
}

// `place { who | actor, node, pin?, entry? }` (engine/dm.js sends it here): creatures put anywhere in the atlas, from the
// place in play or a parked one, into the place in play or a parked one, at a pin or an entry. Nothing is walked and no
// time passes. A creature taken out of a parked place into play catches up on what it missed (dawns).
export function placeIn(s, a, ctx, ev) {
  noFight(s);
  const node = nodeNamed(s, a.node), to = a.node, name = placeName(s, to);
  const ids = a.who !== undefined ? a.who : a.actor;
  const list = typeof ids === 'string' ? [ids] : ids;
  (Array.isArray(list) && list.length > 0 && list.length <= 500 && list.every((id) => typeof id === 'string')) || fail('Name who is placed.');
  new Set(list).size === list.length || fail('Name each creature once.');
  // Where they are now: all in one place.
  const where = (id) => (own(s.entities, id) ? null : Object.keys(s.parked ?? {}).find((p) => own(s.parked[p].entities, id)));
  const fromKey = where(list[0]);
  fromKey !== undefined || fail('No such creature.');
  list.every((id) => where(id) === fromKey) || fail('Place creatures from one place at a time.');
  const src = fromKey === null ? s : s.parked[fromKey];
  const going = movers(src.entities, named(src.entities, list, list));
  const fromNode = fromKey === null ? s.place ?? null : fromKey;
  // Where they go.
  const entry = a.entry ?? null, pin = a.pin ?? null, battle = isBattle(node);
  entry === null || typeof entry === 'string' || fail('Name an entry by its id.');
  pin === null || typeof pin === 'string' || fail('Name a pin by its id.');
  !(entry !== null && !battle) || fail(`${name} is not a battle map: it has no entries.`);
  !(pin !== null && node.kind !== 'nav') || fail(`${name} is not a navigation map: it has no pins.`);
  pin === null || (node.pins ?? []).some((p) => p.id === pin) || fail(`${name} has no pin "${pin}".`);
  const inPlay = to === s.place;
  const rec = inPlay ? null : parkedOf(s, to);
  !(battle && !inPlay && !rec) || fail(`Nobody has been to ${name} yet: go there first.`);
  const dst = inPlay ? s : rec;                                           // null: a navigation or scene node not yet held
  const same = (fromKey === null && inPlay) || (fromKey !== null && fromKey === to);
  const order = marchOrder([...going].map((x) => src.entities[x]), Object.values(src.entities));
  const map = dst?.map ?? holdingMap();
  const spots = spotsFor(map, order, entry, Object.values(dst?.entities ?? {}).filter((e) => !(same && going.has(e.id))));
  if (same) {
    order.forEach((e, i) => { e.pos = spots[i]; setPin(s, e.id, pin); });
    ev.push({ type: 'relocated', node: to, name, ids: [...going], ...(entry !== null ? { entry } : {}), ...(pin !== null ? { pin } : {}) });
    if (inPlay) { for (const e of order) ev.push({ type: 'placed', id: e.id, to: e.pos }); lookAround(s, ev); }
    return;
  }
  // From one place to another. What is left of a parked navigation or scene node that holds nobody and no scene is let go.
  const out = split(src, going, ev);
  const into = dst ?? ((s.parked ??= {})[to] = newRecord(map, s.clock));
  join(s, into, { creatures: order, effects: out.effects }, spots, battle ? null : pin);
  if (fromKey !== null && inPlay) catchUp(s, src, out.creatures, ev);
  if (!inPlay) sinceInto(s, into, fromKey === null ? null : src, out.creatures.map((e) => e.id));
  if (fromKey !== null && src.map.holding && !Object.keys(src.entities).length && !src.scene) {
    for (const fx of [...(src.effects ?? [])]) endEffect(src, ev, fx, 'the party moved on');
    delete s.parked[fromKey];
  }
  ev.push({ type: 'relocated', node: to, name, from: fromNode, ids: [...going], ...(entry !== null ? { entry } : {}), ...(pin !== null ? { pin } : {}) });
  if (inPlay) { for (const e of out.creatures) ev.push({ type: 'placed', id: e.id, to: e.pos }); lookAround(s, ev); }
}

export const handlers = {
  // { type: 'enter', pin, who?, map?, stale? }: from the navigation node in play into the place a pin leads to, at the
  // pin's entry (or that place's default). `who` defaults to the party at that pin or at no pin, or, with nobody there,
  // the whole party in the node (going between pins is `jump`, W5).
  enter(s, a, ctx, ev) {
    dmOnly(ctx, 'move the party between places');
    noFight(s);
    const here = nodeOf(s, s.place) || fail('The table is not at a place of the world.');
    here.kind === 'nav' || fail(`${placeName(s, s.place)} is not a navigation map: there is nothing to go into.`);
    typeof a.pin === 'string' || fail('Name a pin by its id.');
    const p = (here.pins ?? []).find((x) => x.id === a.pin) || fail(`${placeName(s, s.place)} has no pin "${a.pin}".`);
    (typeof p.to === 'string' && nodeOf(s, p.to)) || fail(`${p.name ?? 'That pin'} leads nowhere.`);
    const at = Object.values(s.entities).filter((e) => e.side === 'party' && [p.id, null].includes(pinOf(s, e.id))).map((e) => e.id);
    const ids = named(s.entities, a.who, at.length ? at : partyIn(s.entities));
    arrive(s, a, ev, { to: p.to, ids, entry: isBattle(nodeOf(s, p.to)) ? p.entry ?? null : null });
  },
  // { type: 'leave', who?, map?, stale? }: from the place in play up to the place above it, at the pin there that leads
  // back (on a navigation node), or that place's default. `who` defaults to the whole party.
  leave(s, a, ctx, ev) {
    dmOnly(ctx, 'move the party between places');
    noFight(s);
    const here = nodeOf(s, s.place) || fail('The table is not at a place of the world.');
    const up = (typeof here.parent === 'string' && nodeOf(s, here.parent)) || fail(`${placeName(s, s.place)} has no place above it.`);
    const back = up.kind === 'nav' ? (up.pins ?? []).find((x) => x.to === s.place)?.id ?? null : null;
    const ids = named(s.entities, a.who, partyIn(s.entities));
    arrive(s, a, ev, { to: here.parent, ids, pin: back });
  },
  // { type: 'goTo', node, stale?, map? }: the table's focus moves to a parked place, with everyone in it; the place in
  // play is parked with everyone in it. The clock does not move. Into a stale place it carries `stale`.
  goTo(s, a, ctx, ev) {
    dmOnly(ctx, 'move the table to another place');
    noFight(s);
    !s.journey || fail('The party is on a journey: end it first.');
    const from = s.place ?? null;
    from !== null || fail('The map in play is not a place of the world. Add it as a place first (nodeAdd with here), so that it is kept.');
    nodeNamed(s, a.node);
    const to = a.node, name = placeName(s, to);
    to !== from || fail(`The table is already at ${name}.`);
    const rec = parkedOf(s, to) || fail(`Nobody and nothing is kept at ${name}.`);
    const answer = staleGate(s, to, rec, a);
    const plan = answer === 'reset' ? resetPlan(s, to, rec, a.map) : null;
    const parking = holdsAnything(s);
    capCheck(s, { parkingFrom: parking && !s.map.holding, unparking: battleRecord(rec), adding: false });
    if (answer) answerStale(s, to, rec, answer, plan, ev);
    delete s.parked[to];
    if (parking) park(s, from, ev);
    else for (const fx of [...effectsOf(s)]) endEffect(s, ev, fx, 'the party moved on');
    bring(s, to, unparked(rec));
    catchUp(s, rec, Object.values(rec.entities), ev);
    ev.push({ type: 'map', map: s.map.id, name: s.map.name });
    ev.push({ type: 'cut', node: to, name, from });
    lookAround(s, ev);
  },
  // { type: 'forgetPlace', node }: a parked place's changes are let go (it will be built from the world pack, or the map
  // the DM gives, next time). Refused while anyone of the party is there.
  forgetPlace(s, a, ctx, ev) {
    dmOnly(ctx, 'let a place go');
    typeof a.node === 'string' || fail('Name a place by its id.');
    const name = placeName(s, a.node), rec = parkedOf(s, a.node) || fail(`Nothing is kept at ${name}.`);
    const there = Object.values(rec.entities).filter((e) => e.side === 'party');
    !there.length || fail(`${there.map((e) => e.name).join(', ')} ${there.length === 1 ? 'is' : 'are'} at ${name}. Bring ${there.length === 1 ? 'them' : 'them'} away first.`);
    for (const fx of [...(rec.effects ?? [])]) endEffect(rec, ev, fx, 'the place was let go');
    delete s.parked[a.node];
    ev.push({ type: 'placeForgotten', node: a.node, name });
  },
  // { type: 'keepPlace', node }: the DM's answer to a stale place, keep it as left: the mark clears and the ten days
  // count again from now. Any parked battle place may be kept so.
  keepPlace(s, a, ctx, ev) {
    dmOnly(ctx, 'keep a place');
    typeof a.node === 'string' || fail('Name a place by its id.');
    const name = placeName(s, a.node), rec = parkedOf(s, a.node) || fail(`Nothing is kept at ${name}.`);
    battleRecord(rec) || fail(`${name} is not a battle map: it does not go stale.`);
    rec.stale = null; rec.kept = s.clock;
    ev.push({ type: 'placeKept', node: a.node, name, how: 'keep' });
  },
  // { type: 'resetPlace', node, map }: the other answer, put it back as prepared. `map` is the world pack's map of the
  // node, which the transport puts in the action (Decision 2; W3). The creatures not of the party, its lasting effects and
  // every change to its map are dropped; the party there is set down at the entry it came by.
  resetPlace(s, a, ctx, ev) {
    dmOnly(ctx, 'put a place back');
    typeof a.node === 'string' || fail('Name a place by its id.');
    const rec = parkedOf(s, a.node) || fail(`Nothing is kept at ${placeName(s, a.node)}.`);
    const plan = resetPlan(s, a.node, rec, a.map);
    applyReset(s, a.node, rec, plan, ev);
  },
  // { type: 'nodeAdd', node: { name, kind: 'map' | 'scene', parent? }, map?, here? }: a place made at the table, kept in
  // the index (`added: true`) and never written back to the world pack. A battle place takes its map now, kept as a parked
  // place nobody is at yet; `here: true` makes the map in play the place instead (the table is then at it). A pin on a
  // navigation node is `atlasEdit`'s (W5b).
  nodeAdd(s, a, ctx, ev) {
    dmOnly(ctx, 'add a place');
    const n = a.node;
    (n && typeof n === 'object' && !Array.isArray(n)) || fail('Describe the place: its name and kind.');
    (typeof n.name === 'string' && n.name.trim() && n.name.length <= TRAVEL_LIMITS.name) || fail(`A place needs a name of 1 to ${TRAVEL_LIMITS.name} letters.`);
    ['map', 'scene'].includes(n.kind) || fail(NODE_KINDS.includes(n.kind) ? 'A navigation map is added with its picture in the atlas editor.' : 'A place made at the table is a battle map (map) or a scene.');
    n.parent === undefined || n.parent === null || nodeOf(s, n.parent) || fail(`There is no place "${n.parent}" to put it under.`);
    Object.keys(s.world?.nodes ?? {}).length < TRAVEL_LIMITS.nodes || fail(`A world has at most ${TRAVEL_LIMITS.nodes} places.`);
    const parent = n.parent ?? null;
    (parent === null ? 1 : depthOf(s, parent) + 1) <= TRAVEL_LIMITS.depth || fail(`Places nest ${TRAVEL_LIMITS.depth} deep at most.`);
    let map = null;
    if (a.here === true) {
      noFight(s);
      n.kind === 'map' || fail('Only a battle map can be the map in play.');
      a.map === undefined || fail('The map in play is the map: give no other.');
      (s.place ?? null) === null || fail(`The map in play is already ${placeName(s, s.place)}.`);
      !s.map.holding || fail('The table is on no battle map.');
    } else if (a.here !== undefined) fail('"here" is true or left out.');
    else if (n.kind === 'map') {
      a.map !== undefined || fail('A battle place needs its map.');
      map = readMap(a.map);
      capCheck(s, { adding: true });
    } else a.map === undefined || fail('A scene has no map.');
    const id = nodeIdFor(s, n.name.trim());
    const entries = (a.here === true ? s.map : map)?.entries;
    const node = { id, kind: n.kind, name: n.name.trim(), ...(parent !== null ? { parent } : {}), ...(entries ? { entries: entries.map((en) => ({ id: en.id, name: en.name, kind: en.kind })) } : {}), added: true };
    ((s.world ??= emptyWorld()).nodes ??= {})[id] = node;
    if (a.here === true) s.place = id;
    if (map) (s.parked ??= {})[id] = newRecord(map, s.clock);
    ev.push({ type: 'nodeAdded', node: id, name: node.name, kind: node.kind, ...(a.here === true ? { here: true } : {}) });
  },
};
