// Where things are (engine.js): flying and fitting, where a creature can move, regions shown and
// objects set, hidden creatures revealed, joining a fight, finding hidden things, aiming areas and
// choosing creatures, and the party walking in marching order.
import * as H from '../hex.js';
import { d20Faces, die } from '../rng.js';
import { CONTENT, SPELLS, TILES } from '../content/index.js';
import { actionProfile } from '../effects.js';
import { apart, footprint, FT, gap, ground, hasColumn, HEADROOM, landing, overlapAt, regionAt, shapeOf, shown, sizeOf, STEP_FREE, STEP_MAX, surfaces, under, unseenAt, WALL_HEIGHT } from '../space.js';
import { SIZES } from '../content/sizes.js';
import { difficultAt, terrainsOf } from '../terrain.js';
import { objectKnown, regionsInSight, sightRule } from '../vision.js';
import { barriers, objectDef, objectHexes, objectSegment } from '../walls.js';
import { incapacitated, modifiers, speedOf } from '../modifiers.js';
import { clear, current, ent, EXPLORE_BUDGET, fail, FLY_CEILING, ft, hostile, inFight, less, living, mod, RuleError, unblocked, up, walled } from './shared.js';

// ---------- movement ----------

// Can this creature stay up without anything under it? It needs a Fly Speed that is not 0, and
// must not be Prone or Incapacitated unless it can hover.
export const aloft = (s, e) => up(e) && speedOf(s, e, 'fly') > 0 && (!!e.hover || !(e.cond.prone || incapacitated(e)));
// Would a creature fit at this position? Not inside the ground, not with its head through a floor,
// and not hanging just above one. `landed` says whether it would be standing.
export function airspace(map, h, column = surfaces(map, h), height = HEADROOM) {
  if (!column.length || h.z < column[0].z) return null;
  for (const sf of column) {
    if (sf.z === h.z) return TILES[sf.tile.t].cost === Infinity ? null : { landed: sf };
    if ((sf.z > h.z && sf.z < h.z + height) || (sf.z < h.z && sf.z > h.z - FT)) return null;
  }
  return { landed: null };
}
// Is there room for the whole of a creature to stand with its anchor at `h`? Every hex of its
// footprint needs a floor within a step of that height that can be stood on, and no wall may
// run between two parts of it. A creature of one hex is checked by its caller.
export function fitsOn(map, e, h, B) {
  const shape = shapeOf(e);
  if (shape.length === 1) return true;
  const base = ground(map, h)?.level, parts = footprint(e, h);
  for (const f of parts.slice(1)) {
    const sf = surfaces(map, f).find((x) => Math.abs(x.z - h.z) <= STEP_MAX);
    if (!sf || TILES[sf.tile.t].cost === Infinity || B.solid(sf.level.id, f)) return false;
  }
  if (base) for (const f of parts) for (const n of H.neighbors(f)) if (parts.some((p) => p.q === n.q && p.r === n.r) && B.blocked(base.id, f, n)) return false;
  return true;
}
// The levels whose walls stand at this height.
const wallsAt = (map, z) => map.levels.filter((l) => l.z <= z && z < l.z + WALL_HEIGHT);

const SIZE_ORDER = Object.keys(SIZES);                 // tiny to gargantuan
// Map of position key -> {cost, prev, canStop, h} that this creature can move to right now.
// Walking steps onto surfaces in neighbouring columns; a bigger rise or drop is a climb; a ladder
// or the like joins two places; and a creature that can fly moves through the air in 5 ft steps.
export function moveOptions(s, e) {
  const walk = e && up(e) ? speedOf(s, e) : 0, flying = !!e && aloft(s, e), flySpeed = flying ? speedOf(s, e, 'fly') : 0;
  if (!e || !up(e) || (walk === 0 && !flying)) return new Map();
  const enc = s.encounter, fighting = inFight(s, e.id);
  if (fighting && current(s) !== e.id) return new Map();
  const map = s.map, B = barriers(map), others = living(s).filter((o) => o.id !== e.id);
  // The surfaces of each column are looked up many times over; keep them for the length of this search.
  const columns = new Map(), columnOf = (h) => { const k = h.q * 100003 + h.r; let c = columns.get(k); if (!c) columns.set(k, c = surfaces(map, h)); return c; };
  const walled_ = map.walls.length > 0 || map.objects.length > 0, tiers = map.levels.map((l) => l.z);
  const inWay = (h, test) => others.some((o) => overlapAt(o, o.pos, e, h) && test(o));
  // SRD "Moving around Other Creatures": an ally, an Incapacitated or Tiny creature, or one two sizes
  // larger or smaller can be passed through; any other creature's space but a Tiny one or an ally's
  // is Difficult Terrain. Nobody ends a move in an occupied space (canStop, below).
  const rank = (x) => SIZE_ORDER.indexOf(x.size ?? 'medium');
  const passable = (o) => !hostile(o, e) || !up(o) || incapacitated(o) || o.size === 'tiny' || Math.abs(rank(o) - rank(e)) >= 2;
  const blocks = (h) => inWay(h, (o) => !passable(o)), crowded = (h) => inWay(h, (o) => hostile(o, e) && o.size !== 'tiny');
  // Ground a spell made Difficult Terrain (terrain.js: Ice Storm, Grease). Walking only: a flyer is not on the ground.
  const spelled = terrainsOf(s).length ? (h) => difficultAt(s, h) : () => false;
  const big = shapeOf(e).length > 1, tall = sizeOf(e).height;
  // A big creature moves as one: every part of it must have somewhere to go and no wall to cross.
  const bodyFits = (from, h, levelId) => !big || (fitsOn(map, e, h, B) && footprint(e, from).every((f, i) => i === 0 || !B.blocked(levelId, f, footprint(e, h)[i])));
  const onHazard = (levelId, h) => (big ? footprint(e, h) : [h]).some((f) => hazards.has(`${levelId}|${H.col(f)}`));
  const climbSpeed = speedOf(s, e, 'climb'), climbs = s.settings.climbing !== 'off' && (walk > 0 || climbSpeed > 0);
  // What each way of moving has left this turn. A creature that changes from one to another has
  // already used, of the new one, whatever it has moved so far.
  const left = (speed) => (fighting ? enc.budget.move + (speed - walk) * (1 + (enc.budget.dashes | 0)) : EXPLORE_BUDGET);
  const limit = { walk: left(walk), climb: left(climbSpeed > 0 ? climbSpeed : walk), fly: fighting ? left(flySpeed) : Math.max(60, flySpeed) };
  const budget = Math.max(limit.walk, limit.climb, flying ? limit.fly : 0);
  // Traps this creature knows of: the party knows the ones it has spotted; everyone else knows them all.
  const hazards = new Set();
  for (const o of map.objects) {
    const def = objectDef(o);
    if (def.triggers?.some((t) => t.on === 'enter' && t.effects && t.from.includes(o.state)) && (e.side !== 'party' || !def.states[o.state].hidden)) hazards.add(`${o.level}|${H.col(o.at)}`);
  }
  const reach = H.reachable(e.pos, budget, (from) => {
    const out = [], here = ground(map, from)?.level;
    // A trap the party has spotted can be stepped onto on purpose, but no path runs across it.
    if (here && from !== e.pos && onHazard(here.id, from)) return out;
    if (here && walk > 0) {
      for (const n of H.neighbors(from)) {
        if (fighting && !enc.arena[H.col(n)]) continue;                     // the arena is locked
        const column = columnOf(n);
        for (const sf of column) {
          const dz = sf.z - from.z, up_ = Math.abs(dz), terrain = TILES[sf.tile.t].cost;
          if (terrain === Infinity || B.solid(sf.level.id, n)) continue;
          const h = { q: n.q, r: n.r, z: sf.z };
          if (e.side !== 'party' && onHazard(sf.level.id, h)) continue;                      // a lair's own never step on its traps
          if (!bodyFits(from, h, here.id)) continue;
          if (blocks(h)) continue;
          if (up_ <= STEP_MAX) {                                             // walking: level going, a step, or stairs
            if (B.blocked(here.id, from, n) || (sf.level !== here && B.blocked(sf.level.id, from, n))) continue;   // a wall or a shut door
            out.push({ h, cost: Math.max(terrain, up_ > STEP_FREE || crowded(h) || spelled(h) ? 2 : 1) * FT, max: limit.walk });   // Difficult Terrain does not stack
          } else if (climbs) {
            // Climbing: up a face to a ledge, or down from one. The way must be open above the lower
            // of the two places, and only a wall at the top counts: a wall below is what is climbed.
            const lowCol = dz > 0 ? columnOf(from) : column, lowZ = Math.min(sf.z, from.z), highZ = Math.max(sf.z, from.z);
            if (lowCol.some((x) => x.z > lowZ && x.z < highZ + HEADROOM)) continue;
            const top = dz > 0 ? sf.level : here;
            if (B.blocked(top.id, from, n)) continue;
            out.push({ h, cost: terrain * FT + up_ * (climbSpeed > 0 ? 1 : 2), max: limit.climb });
          }
        }
      }
      // A ladder, a rope, a climbable tree: something that joins this place to another.
      for (const o of map.objects) {
        if (!o.to || !objectDef(o).connects) continue;
        const a = { q: o.at.q, r: o.at.r, z: objectZ(s, o) }, b = landing(map, o.to, o.to.z ?? 0);
        const h = H.key(a) === H.key(from) ? b : b && H.key(b) === H.key(from) ? a : null;
        if (!h || (fighting && !enc.arena[H.col(h)]) || blocks(h) || !fitsOn(map, e, h, B)) continue;
        out.push({ h, cost: Math.max(FT, Math.abs(a.z - b.z)) * (climbSpeed > 0 ? 1 : 2), max: limit.climb });
      }
    }
    if (flying) {
      // Through the air: any of the six directions, level, up or down 5 ft, or straight up or down.
      const around = H.neighbors(from), top = Math.max(tiers.at(-1), ...tiers, e.pos.z) + FLY_CEILING;
      for (const dz of [0, FT, -FT]) for (let i = dz ? -1 : 0; i < 6; i++) {
        const n = i < 0 ? from : around[i];
        if (from.z + dz > top || (fighting && !enc.arena[H.col(n)])) continue;
        const h = { q: n.q, r: n.r, z: from.z + dz }, column = columnOf(n), room = airspace(map, h, column, tall);
        if (!room || (big && footprint(e, h).some((f, i) => i > 0 && !airspace(map, f, columnOf(f), tall)))) continue;
        // No passing through a floor on the way up or down.
        if (dz > 0 && column.some((sf) => sf.z > from.z && sf.z <= h.z)) continue;
        if (dz < 0 && column.some((sf) => sf.z > h.z && sf.z <= from.z)) continue;
        if (room.landed && (B.solid(room.landed.level.id, n) || (e.side !== 'party' && hazards.has(`${room.landed.level.id}|${H.col(n)}`)))) continue;
        if (walled_ && n !== from && [from.z, h.z].some((z) => wallsAt(map, z).some((l) => B.blocked(l.id, from, n, z - l.z >= FT ? 'tall' : 'move')))) continue;
        if (blocks(h)) continue;
        out.push({ h, cost: crowded(h) ? 2 * FT : FT, max: limit.fly });
      }
    }
    return out;
  });
  const start = H.key(e.pos);
  // Nobody stops in another creature's space, except that a few Tiny ones can share a hex.
  const share = sizeOf(e).shares;
  for (const [k, v] of reach) {
    const there = others.filter((o) => overlapAt(o, o.pos, e, v.h));
    v.canStop = k !== start && (!there.length || (!!share && there.length < share && there.every((o) => sizeOf(o).shares)));
  }
  return reach;
}

// ---------- regions ----------
export function revealRegion(s, r, ev) {
  r.revealed = true;
  ev.push({ type: 'region', region: r.id, name: r.name });
  if (!s.encounter) return;
  for (const e of living(s)) {                          // whoever was waiting in there is in the fight now
    if (e.hidden || inFight(s, e.id) || !s.encounter.arena[H.col(e.pos)]) continue;
    const sf = under(s.map, e.pos);
    if (sf && regionAt(s.map, sf.level.id, e.pos) === r) joinEncounter(s, e, ev);
  }
}
// Party members see the region they stand in and any region they stand beside with nothing
// to block the view. `before` runs first if anything is found (to close a stretch of movement).
// Under the los and light table rules, instead: any region a party member has a line of sight into.
export function lookAround(s, ev, who = living(s), before = null) {
  if (sightRule(s) !== 'rooms') {
    const seen = regionsInSight(s, who);
    if (seen.size && before) before();
    for (const r of seen) revealRegion(s, r, ev);
    return;
  }
  const B = barriers(s.map), found = new Set();
  const note = (levelId, h) => { const r = regionAt(s.map, levelId, h); if (r && !r.revealed) found.add(r); };
  for (const e of who) {
    const here = e.side === 'party' ? under(s.map, e.pos) : null;
    if (!here) continue;
    note(here.level.id, e.pos);
    for (const n of H.neighbors(e.pos)) for (const sf of surfaces(s.map, n)) {
      if (Math.abs(sf.z - here.z) > STEP_MAX) continue;
      if (B.blocked(here.level.id, e.pos, n, 'sight') || (sf.level !== here.level && B.blocked(sf.level.id, e.pos, n, 'sight'))) continue;
      note(sf.level.id, n);
    }
  }
  if (found.size && before) before();
  for (const r of found) revealRegion(s, r, ev);
}
// A creature that acts from somewhere unseen has shown where it is.
export function showPlace(s, e, ev) {
  const sf = under(s.map, e.pos), r = sf && regionAt(s.map, sf.level.id, e.pos);
  if (r && !r.revealed) revealRegion(s, r, ev);
}

// ---------- objects ----------
// May players know about this object? It must touch a hex they have been shown.
export const objectShown = (map, o) => !objectDef(o).states[o.state].hidden && objectHexes(o).some((h) => !!map.levels.find((l) => l.id === o.level)?.tiles[H.col(h)] && shown(map, o.level, h));
export const objectOf = (s, id, ctx = null) => {
  const o = s.map.objects.find((x) => x.id === id);
  return (o && (!ctx || ctx.role === 'dm' || (sightRule(s) === 'rooms' ? objectShown(s.map, o) : objectKnown(s, o))) && o) || fail('No such object.');
};
export const objectName = (o) => o.name ?? objectDef(o).name;
export const objectZ = (s, o) => { const level = s.map.levels.find((l) => l.id === o.level); return level.z + (level.tiles[H.col(o.at)]?.h ?? 0); };
// Put an object into a state, and whatever it is linked to into theirs. The whole chain is
// worked out and checked before anything changes.
export function setObject(s, o, state, ev, by = null, verb = null) {
  const plan = [[o, state]];
  for (let i = 0; i < plan.length && i < 50; i++) {
    const [x, st] = plan[i];
    for (const l of x.links ?? []) {
      const other = s.map.objects.find((y) => y.id === l.object);
      if (l.when === st && other && !plan.some(([y]) => y === other) && other.state !== l.sets) plan.push([other, l.sets]);
    }
  }
  for (const [x, st] of plan) {
    if (objectSegment(x) || !objectDef(x).states[st].blocks.includes('move')) continue;
    !living(s).some((c) => H.col(c.pos) === H.col(x.at) && c.pos.z === objectZ(s, x)) || fail(`Someone is standing where the ${objectName(x).toLowerCase()} would be.`);
  }
  plan.forEach(([x, st], i) => {
    x.state = st;
    ev.push({ type: 'object', object: x.id, name: objectName(x), state: st, stateName: objectDef(x).states[st].name, ...(by && i === 0 ? { actor: by.id } : {}), ...(verb && i === 0 ? { verb } : {}) });
  });
  lookAround(s, ev);                                    // an opened door shows what is behind it
}
// A stand-in for a thing on the map when one of its effects needs a source: where it is, what it is called.
export function objectActor(s, id) {
  const o = s.map.objects.find((x) => x.id === id);
  return o ? { id: null, object: true, name: objectName(o), side: 'object', pos: { q: o.at.q, r: o.at.r, z: objectZ(s, o) }, hp: 1, maxHp: 1, dead: false,
    cond: {}, features: {}, attacks: [], gear: [], abil: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, prof: 0, resist: [], vuln: [], immune: [] } : null;
}
// A `set` or `reveal` step: work the thing itself or what it is linked to. False if there is nothing to work.
export function objectStep(s, id, of, state, ev) {
  const self = s.map.objects.find((x) => x.id === id);
  const all = of === 'link' ? (self?.links ?? []).map((l) => s.map.objects.find((x) => x.id === l.object)).filter(Boolean) : [self].filter(Boolean);
  let did = false;
  for (const o of all) {
    const def = objectDef(o), to = state ?? (def.states[o.state].hidden ? def.find?.to : null);
    if (!to || !Object.hasOwn(def.states, to)) continue;
    did = true;
    if (o.state !== to) setObject(s, o, to, ev);
  }
  return did;
}
// Can `e` stand at `to`? Ground or air it fits in, a body that fits, not the hex it is on, and in
// the arena if it is fighting. '' if so, else why not.
export function roomAt(s, e, to) {
  if (!airspace(s.map, to, undefined, sizeOf(e).height)) return 'Nothing can stand there.';
  if (!fitsOn(s.map, e, to, barriers(s.map))) return `${e.name} does not fit there.`;
  if (inFight(s, e.id) && footprint(e, to).some((f) => !s.encounter.arena[H.col(f)])) return 'The arena is locked until the fight ends.';
  return '';
}


// ---------- hidden creatures ----------
// `hidden` is a DM switch: players are not told the creature exists (see view.js). The engine's
// part is to lift it the moment the party would find out for themselves.
export function reveal(s, e, ev) {
  if (!e.hidden) return;
  delete e.hidden;
  ev.push({ type: 'revealed', id: e.id });
}
// It stops hiding (the Hide rules are in features.js, with the hide action).
export function unhide(s, e, ev, why, by = null) {
  if (!e.hiding) return;
  delete e.hiding;
  ev.push({ type: 'unhidden', id: e.id, why, ...(by ? { by: by.id } : {}) });
}

// ---------- encounters ----------

export const initiativeSort = (order) => order.sort((a, b) => b.init - a.init || b.dex - a.dex);
// `faces`, if given, gets the dice of the roll under the creature's id, for the event.
export function rollInit(s, e, faces = null) {
  const m = modifiers(s, e, 'initiative');
  if (e.hiding) m.advantage.push('hidden');                             // hidden is Invisible, and Invisible rolls Initiative with Advantage
  const two = (m.advantage.length > 0) !== (m.disadvantage.length > 0);
  const r1 = die(s, 20), r2 = two ? die(s, 20) : null;
  const d = !two ? r1 : m.advantage.length ? Math.max(r1, r2) : Math.min(r1, r2);
  // A monster's stat block gives its Initiative modifier outright (`initBonus`); anyone else adds their Dexterity modifier.
  const bonus = (e.initBonus ?? mod(e.abil.dex)) + m.add;
  if (faces) faces[e.id] = { dice: d20Faces(r1, r2, d), bonus };
  return { id: e.id, init: d + bonus, dex: e.abil.dex };
}

export function joinEncounter(s, e, ev) {
  const enc = s.encounter, cur = current(s);
  reveal(s, e, ev);
  e.reactionUsed = false;
  const faces = {}, slot = rollInit(s, e, faces);
  enc.order.push(slot);
  initiativeSort(enc.order);
  enc.turn = enc.order.findIndex((o) => o.id === cur);
  ev.push({ type: 'joined', id: e.id, init: slot.init, ...faces[e.id] });
}

// Where a fight is, in words everyone may read: the revealed region holding its centre, else the map's name.
export function fightPlace(s, center) {
  const sf = under(s.map, center), r = sf && regionAt(s.map, sf.level.id, center);
  return (r?.revealed && r.name) || s.map.name || null;
}

// ---------- finding hidden things ----------
export const SEARCH_FEET = 15, NOTICE_FEET = 10;
// Could this creature find this hidden object from where it stands? It must be within `feet`,
// on its level, touch a hex the players have been shown, and have nothing solid in between.
export function findable(s, e, o, feet) {
  const def = objectDef(o);
  if (!def.states[o.state].hidden || !def.find || Math.abs(objectZ(s, o) - e.pos.z) > STEP_MAX) return false;
  const level = s.map.levels.find((l) => l.id === o.level);
  const near = objectHexes(o).filter((h) => level.tiles[H.col(h)] && shown(s.map, o.level, h)).sort((x, y) => H.dist(x, e.pos) - H.dist(y, e.pos))[0];
  return !!near && H.dist(near, e.pos) * FT <= feet && clear(s, e.pos, { q: near.q, r: near.r, z: level.z + (level.tiles[H.col(near)].h ?? 0) });
}
export const findDC = (o) => o.dc?.find ?? objectDef(o).dc.find;

// How an area is laid out on the hexes when `e` aims it at `aim`: { hexes, origin, high }.
// `range` is the spell's range in feet (0 for Self), or an action's `area.range`.
//   cone      opens from `e` toward `aim`.
//   sphere, cylinder   centred on `aim`, which must be within range.
//   emanation surrounds `e` and needs no aim.
//   line      from the edge of `e`'s space toward `aim`, `size` feet long and `width` feet wide
//             (5 unless the area says), tilted up or down toward the height aimed at. A Line with
//             a range (a wall placed at a distance) is not laid out: the DM places it.
//   cube      a Self cube starts at the edge of `e`'s space and extends `size` feet toward `aim`
//             (SRD: its point of origin lies on a face, outside the area). A cube with a range
//             has its near face at the hex aimed at, which is in it, and extends away from `e`.
//             It rises `size` feet from the ground (or the height) at its point of origin.
// `origin` is where it goes off; `high(t)` says whether creature `t` is within its height.
function layout(s, e, area, range, aim) {
  const n = area.size / FT, shape = area.shape;
  if (shape === 'emanation') return { hexes: H.range(e.pos, n).filter((h) => H.key(h) !== H.key(e.pos)), origin: e.pos, high: (t) => gap(s, e.pos, t.pos) <= n };
  if (!aim) return null;
  const aimZ = aim.z ?? landing(s.map, aim, e.pos.z)?.z ?? e.pos.z;
  if (shape === 'cone') return { hexes: H.cone(e.pos, aim, n), origin: e.pos, high: (t) => gap(s, e.pos, t.pos) <= n };
  if (shape === 'sphere' || shape === 'cylinder') {
    const origin = { q: aim.q, r: aim.r, z: aimZ }, tall = area.height ?? area.size;
    const high = shape === 'cylinder' ? (t) => t.pos.z > origin.z - FT / 2 && t.pos.z <= origin.z + tall : (t) => gap(s, origin, t.pos) <= n;
    return { hexes: H.range(aim, n), origin, high };
  }
  const front = Math.max(...footprint(e).map((f) => H.along(e.pos, aim, f))) + FT / 2;      // the edge of its own space
  if (shape === 'line') {
    if (range > 0 || H.dist(aim, e.pos) === 0) return null;
    const flat = H.along(e.pos, aim, aim), slope = flat > 0 ? (aimZ - e.pos.z) / flat : 0;
    const length = area.size / Math.hypot(1, slope), half = (area.width ?? FT) / 2;
    const hexes = H.band(e.pos, aim, front, front + length, half);
    const high = (t) => { const z = e.pos.z + slope * H.along(e.pos, aim, t.pos); return z + half > t.pos.z && z - half < t.pos.z + sizeOf(t).height; };
    return { hexes, origin: e.pos, high };
  }
  if (shape === 'cube') {
    const size = area.size, half = size / 2;
    if (!(range > 0)) {
      if (H.dist(aim, e.pos) === 0) return null;
      const base = e.pos.z;
      return { hexes: H.band(e.pos, aim, front, front + size, half), origin: e.pos, high: (t) => t.pos.z < base + size && t.pos.z + sizeOf(t).height > base };
    }
    const away = H.dist(aim, e.pos) === 0 ? { q: aim.q + 1, r: aim.r } : { q: 2 * aim.q - e.pos.q, r: 2 * aim.r - e.pos.r };
    const origin = { q: aim.q, r: aim.r, z: aimZ };
    return { hexes: H.band(aim, away, -FT / 2, size - FT / 2, half), origin, high: (t) => t.pos.z < aimZ + size && t.pos.z + sizeOf(t).height > aimZ };
  }
  return null;
}
// The range an area is aimed within: a spell's range, or an action's `area.range`.
const areaRange = (sp) => (typeof sp.range === 'number' ? sp.range : sp.area?.range ?? 0);

// Hexes an area would cover if aimed at `aim` (for the UI's highlight and the AI).
// `sp` is a spell profile or { area, range? }.
export function areaHexes(s, e, sp, aim) {
  if (!sp.area) return [];
  const l = layout(s, e, sp.area, areaRange(sp), aim);
  return l ? l.hexes.filter((h) => hasColumn(s.map, h)) : [];
}

// Who an area catches when `e` aims it at `hex`: { targets, hexes, origin }. See layout().
// `origin` is null when the area starts from `e` itself.
export function aimArea(s, e, name, area, range, hex) {
  const shape = area.shape, fromSelf = shape === 'cone' || shape === 'line' || (shape === 'cube' && !(range > 0));
  if (fromSelf) (hex && H.dist(hex, e.pos) > 0) || fail(`Pick a direction for ${name}.`);
  else if (shape !== 'emanation') {
    hex || fail(`Pick where ${name} goes off.`);
    const d = gap(s, hex.z !== undefined ? hex : landing(s.map, hex, e.pos.z) ?? hex, e.pos);
    if (d * FT > range) fail(`That is ${ft(d)} away. ${name} reaches ${range} ft.`);
  }
  const l = layout(s, e, area, range, hex) || fail(`The engine cannot lay out ${name} there.`);
  const hexes = l.hexes.filter((h) => hasColumn(s.map, h)), keys = new Set(hexes.map(H.key)), origin = l.origin;
  const targets = living(s).filter((t) => (!area.exceptCaster || t.id !== e.id) && footprint(t).some((f) => keys.has(H.col(f))) && l.high(t) && footprint(t).some((f) => clear(s, origin, f)));      // a wall shelters what is behind it
  return { targets, hexes, origin: origin === e.pos ? null : origin };
}

// The creatures a spell or action aimed at creatures goes to: `a.targets` (a list of ids) or
// `a.target` (one). At most `most`; one creature more than once only for rays, darts and beams
// (`repeat`); each within `range` feet with nothing solid between; a harmful one not at its own
// user; with `within`, each after the first that near the first (Chain Lightning).
export function creatures(s, e, name, { range, harmful, repeat, within, most, spell = false }, a) {
  const ids = a.targets !== undefined ? a.targets : a.target !== undefined ? [a.target] : [];
  (Array.isArray(ids) && ids.length > 0) || fail(`Pick a target for ${name}.`);
  ids.length <= most || fail(`${name} has ${most === 1 ? 'one target' : `${most} targets`}.`);
  if (!repeat && new Set(ids).size !== ids.length) fail(`${name} can't target the same creature twice.`);
  const out = ids.map((id) => ent(s, id));
  for (const t of out) {
    !t.dead || fail(`${t.name} is dead.`);
    if (harmful && t.id === e.id) fail(`${name} needs another target.`);
    const d = apart(s, e, t);
    if (d * FT > range) fail(`${t.name} is ${ft(d)} away. ${name} reaches ${spell && range === 5 ? 'touch (5 ft)' : range + ' ft'}.`);
    walled(s, e, t);
  }
  if (within) for (const t of out.slice(1)) apart(s, out[0], t) * FT <= within || fail(`${t.name} is more than ${within} ft from ${out[0].name}.`);
  return out;
}

// Creature ids a given attack or spell could legally target right now (range only).
export function targetsFor(s, e, { attack, spell, action }) {
  const out = [];
  const def = action ?? (attack && e.actions?.find((x) => x.id === attack && !x.multiattack)?.id);
  const far = def ? actionProfile(e.actions.find((x) => x.id === def)).far : null;
  for (const t of living(s)) {
    if (!unblocked(s, e, t)) continue;
    const d = apart(s, e, t) * FT;
    if (def) { if (far !== undefined && far !== null && t.id !== e.id && d <= far) out.push(t.id); }
    else if (attack) {
      const atk = e.attacks.find((a) => a.id === attack);
      if (t.id !== e.id && d <= (atk.type === 'melee' ? atk.reach : atk.range[1])) out.push(t.id);
    } else {
      const sp = SPELLS[spell];
      if (sp.aim !== 'creature') continue;
      if (sp.harmful ? t.id !== e.id && d <= sp.range : d <= sp.range) out.push(t.id);
    }
  }
  return out;
}

// Who or what an action is aimed at: { targets, hexes, origin }. `targets` is null for an area
// the engine cannot lay out (a line, a cube), which the DM then applies.
export function aimAction(s, e, def, a) {
  const t = def.target;
  if (t.self) return { targets: [e], hexes: null, origin: null };
  if (t.creature) {
    const c = t.creature, far = c.reach ?? c.range[1];
    for (const id of a.targets ?? [a.target]) { const x = ent(s, id); !x.dead || fail(`${x.name} is already dead.`); }
    const targets = creatures(s, e, def.name, { range: far, harmful: true, repeat: c.repeat, within: c.within, most: c.count ?? 1 }, a);
    return { targets, hexes: null, origin: null };
  }
  if (actionProfile(def).aim !== 'area') return { targets: null, hexes: null, origin: null };
  const out = aimArea(s, e, def.name, t.area, t.area.range ?? 0, a.hex);
  if (t.area.types) out.targets = out.targets.filter((x) => t.area.types.includes(creatureType(x)));     // Turn Undead: Undead only
  return out;
}
// A creature's type: a pack monster's, else a character's (Humanoid). Null for one the engine cannot tell.
export const creatureType = (e) => e.type ?? CONTENT.monsters[e.tpl]?.type ?? (e.kind === 'pc' ? 'humanoid' : null);

// Who an area action would catch if aimed at `hex`, or null if it cannot be aimed there. For the AI and the UI.
export function areaTargets(s, e, def, hex) {
  try { return aimAction(s, e, def, { hex }).targets; } catch (err) { if (err instanceof RuleError) return null; throw err; }
}

// ---------- walking together ----------
// A party member may follow another (`follow: id`). When the one in front walks, outside a
// fight, those behind walk after it in marching order (`march`, lowest first), each by its own
// way of moving, to the free place nearest behind the leader's path. When a fight breaks out,
// those who were following are brought up behind their leader before initiative is rolled.
export const CATCH_UP = 60;          // feet: the furthest from its leader a follower is brought up to when a fight starts
export const byMarch = (a, b) => (a.march ?? Infinity) - (b.march ?? Infinity);

export function unfollow(s, e, ev, why = null) {
  const leader = e.follow;
  delete e.follow;
  ev.push({ type: 'follow', id: e.id, leader: null, was: leader, ...(why ? { why } : {}) });
}

// The line a column walks along: the leader's path from where it stands back to where it set
// off, then on the same way for a while, so that those at the back have somewhere to be.
// `path` runs from the leader backwards; `away` is a place the line leads away from if the path is one hex.
export function trailOf(path, away = null) {
  const t = path.map((h) => ({ q: h.q, r: h.r }));
  const a = t.length > 1 ? t.at(-2) : away, b = t.at(-1);
  if (!a) return t;
  const wa = H.toWorld(a), wb = H.toWorld(b);
  let dx = wb.x - wa.x, dz = wb.z - wa.z;
  const n = Math.hypot(dx, dz);
  if (!n) return t;
  dx /= n; dz /= n;
  for (let i = 0; i < 12; i++) {
    const last = t.at(-1), lw = H.toWorld(last);
    let best = null, most = -Infinity;
    for (const nb of H.neighbors(last)) {
      const w = H.toWorld(nb), p = (w.x - lw.x) * dx + (w.z - lw.z) * dz;
      if (p > most + 1e-9) { most = p; best = nb; }
    }
    t.push(best);
  }
  return t;
}
// How far a place is from the trail, and how far back along it.
export function along(trail, h) {
  let d = Infinity, i = 0;
  trail.forEach((p, j) => { const x = H.dist(p, h); if (x < d) { d = x; i = j; } });
  return { d, i };
}

// A fight is starting in `arena`. Everyone who was following a party member in it, and is not in
// it already, is brought up to the nearest free place behind its leader that it could have walked
// to (a path exists, and the place is at most CATCH_UP feet of walking from the leader).
// `walked` is { id, path } for a leader whose walk started the fight: the path from where it stands back.
export function catchUp(s, arena, walked, ev) {
  const inArena = (e) => !!arena[H.col(e.pos)];
  const party = new Set(living(s).filter((e) => e.side === 'party' && inArena(e)).map((e) => e.id));
  const pending = living(s).filter((e) => e.follow && e.side === 'party' && !inArena(e)).sort(byMarch);
  const foes = living(s).filter((o) => o.side !== 'party' && inArena(o) && !unseenAt(s.map, o.pos));
  for (;;) {
    const f = pending.find((x) => party.has(x.follow));
    if (!f) return;
    pending.splice(pending.indexOf(f), 1);
    const leader = s.entities[f.follow];
    const foe = foes.slice().sort((a, b) => H.dist(a.pos, leader.pos) - H.dist(b.pos, leader.pos))[0];
    const trail = trailOf(walked?.id === leader.id ? walked.path : [leader.pos], foe?.pos ?? null);
    const mine = moveOptions(s, f), theirs = moveOptions(s, leader);
    let best = null, bestKey = null;
    for (const [k, v] of mine) {
      if (!v.canStop || !arena[H.col(v.h)]) continue;
      const lc = theirs.get(k)?.cost;
      if (lc === undefined || lc > CATCH_UP) continue;
      const at = along(trail, v.h), rank = [at.d, at.i, lc, v.cost];
      if (!best || less(rank, bestKey)) { best = { k, v }; bestKey = rank; }
    }
    if (!best || !up(f)) { unfollow(s, f, ev, "couldn't keep up"); continue; }
    f.pos = best.v.h;
    ev.push({ type: 'moved', id: f.id, path: H.pathTo(mine, best.k), caughtUp: true });
    lookAround(s, ev, [f]);
    party.add(f.id);
  }
}

