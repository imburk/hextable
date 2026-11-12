// Rules engine. Pure game logic: no rendering, no network, no clock but the in-world one.
//
//   apply(state, action, ctx) -> { ok, error?, events }
//
// Everything that happens in the game goes through apply(). The engine validates the
// action against the rules, mutates state, and returns events. Renderers turn events
// into numbers or animations; the server broadcasts them; the timeline records them;
// an AI DM or AI character is just another caller of apply().
import * as H from './hex.js';
import { die, roll } from './rng.js';
import { CONTENT, SPELLS, TILES, MONSTERS, MONSTER_ACTIONS } from './content/index.js';
import { ABILITIES, CHOICES, SKILLS, lintRecord } from './content/schema.js';
import { AREAS, actionProfile, begin, run, scaleSteps, sharedRolls, targetCount, walk as walkSteps } from './effects.js';
import { breakConcentration, concentrationCheck, concentrationLost, effectsOf, endEffect, fightOver, ROUND, roundStarted, startEffect, tick, turnEnded, turnKey, turnStarted, useUp } from './durations.js';
import { FT, HEADROOM, STEP_FREE, STEP_MAX, WALL_HEIGHT, apart, apartAt, concealed, footprint, gap, ground, hasColumn, landing, overlapAt, regionAt, shapeOf, shown, sizeOf, surfaces, under, unseenAt } from './space.js';
import { SIZES } from './content/sizes.js';
import { LIGHTS } from './content/lights.js';
import { EDITS, lintMap } from './map.js';
import { handoutActions } from './handouts.js';
import { entered, flushZones, snapshot, turnInZones } from './zones.js';
import { COVER, canSee, coverOf, hiddenFrom, inSight, sees } from './sight.js';
import { SIGHT_RULES, objectKnown, regionsInSight, remember, sightRule, unknown } from './vision.js';
import { barriers, center, distToSegment, objectDef, objectHexes, objectSegment } from './walls.js';
import { bounded, conditionDef, conditionName, conditionPhrase, incapacitated, incapacitatedBy, judge, modifiers, speedOf } from './modifiers.js';

export { FT };                       // feet per hex
export const ARENA_RADIUS = 6;       // hexes locked around the start of a fight
export const ENGAGE_RANGE = 2;       // walking this close to a hostile starts the fight
export const EXPLORE_BUDGET = 300;   // feet per tap while free roaming
export const FLY_CEILING = 40;       // how far above the highest floor (or itself) the engine looks for a flyer's routes, in feet
export const mod = (score) => Math.floor((score - 10) / 2);

class RuleError extends Error {}
const fail = (msg) => { throw new RuleError(msg); };

export const up = (e) => !e.dead && e.hp > 0;
export const hostile = (a, b) => a.side !== b.side;
export const living = (s) => Object.values(s.entities).filter((e) => !e.dead);
export const inFight = (s, id) => !!s.encounter && s.encounter.order.some((o) => o.id === id);
export const current = (s) => (s.encounter ? s.encounter.order[s.encounter.turn]?.id ?? null : null);
// A spellcaster's spell attack bonus and save DC, with what modifiers change about them when the
// game state is given (`spell.attack`, `spell.dc`).
export const spellStats = (e, s = null) => {
  const m = e.prof + mod(e.abil[e.castAbil] ?? 10);
  if (!s) return { attack: m, dc: 8 + m };
  const a = modifiers(s, e, 'spell.attack', {}, ''), d = modifiers(s, e, 'spell.dc', {}, '');
  return { attack: bounded(a, m + a.add), dc: bounded(d, 8 + m + d.add) };
};
const ent = (s, id) => s.entities[id] || fail('No such creature.');
const control = (e, ctx) =>
  ctx.role === 'dm' || (e.owner && e.owner === ctx.userId) || fail(`${e.name} isn't yours to control.`);
const fighters = (s) => (s.encounter ? s.encounter.order.map((o) => s.entities[o.id]).filter(Boolean) : []);
const ft = (hexes) => `${hexes * FT} ft`;

export function makeEntity(tpl, over = {}) {
  const t = structuredClone(tpl);
  // A creature made from a pack monster carries its own copy of the monster's actions.
  if (!t.actions && over.tpl && MONSTER_ACTIONS[over.tpl]) t.actions = structuredClone(MONSTER_ACTIONS[over.tpl]);
  if (over.pos && over.pos.z === undefined) over = { ...over, pos: { ...over.pos, z: 0 } };
  return {
    kind: 'npc', side: 'foe', owner: null, level: 0, size: 'medium', speeds: {}, senses: {}, saveProf: [], saveBonus: {}, skills: [], expertise: [], tools: [], skillBonus: {}, features: {}, attacks: [], spells: [],
    slots: {}, resist: [], vuln: [], immune: [], gear: [], ...t,
    maxHp: t.hp, slotsMax: { ...(t.slots || {}) }, uses: { secondWind: t.features?.secondWind || 0 },
    cond: {}, death: { s: 0, f: 0 }, dead: false, reactionUsed: false, ...over,
  };
}

// ---------- movement ----------

// Can this creature stay up without anything under it? It needs a Fly Speed that is not 0, and
// must not be Prone or Incapacitated unless it can hover.
export const aloft = (s, e) => up(e) && speedOf(s, e, 'fly') > 0 && (!!e.hover || !(e.cond.prone || incapacitated(e)));
// Would a creature fit at this position? Not inside the ground, not with its head through a floor,
// and not hanging just above one. `landed` says whether it would be standing.
function airspace(map, h, column = surfaces(map, h), height = HEADROOM) {
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
function fitsOn(map, e, h, B) {
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
            out.push({ h, cost: Math.max(terrain, up_ > STEP_FREE || crowded(h) ? 2 : 1) * FT, max: limit.walk });   // Difficult Terrain does not stack
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

function threatsAt(s, e, pos) {
  return fighters(s).filter((o) =>
    o.id !== e.id && up(o) && hostile(o, e) && !o.reactionUsed && !incapacitated(o) &&
    !!opportunityAttack(o) && apartAt(s, o, o.pos, e, pos) <= 1 && clear(s, o.pos, pos) && canSee(s, o, e) !== 'no');     // SRD: a creature it can see
}
// What a creature makes an Opportunity Attack with: its first melee attack action, or for a
// creature with flat attack records, its first melee attack.
export function opportunityAttack(o) {
  if (o.actions) return o.actions.find((a) => !a.multiattack && a.target?.creature?.reach && a.effects[0]?.attack === 'melee') ?? null;
  return o.attacks.find((a) => a.type === 'melee') ?? null;
}

// Is there nothing solid between two positions? A wall or a shut door stops attacks, spells and
// notice. This is the straight line between hex centres; cover and light come with the sight spec.
export function clear(s, a, b) { return inSight(s.map, a, b); }
// Between two creatures: is any part of one in the clear from any part of the other?
export function unblocked(s, a, b) { return coverOf(s, a, b) !== 'total'; }
const walled = (s, e, t) => unblocked(s, e, t) || fail(`There is a wall between ${e.name} and ${t.name}.`);

// ---------- regions ----------
function revealRegion(s, r, ev) {
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
function lookAround(s, ev, who = living(s), before = null) {
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
function showPlace(s, e, ev) {
  const sf = under(s.map, e.pos), r = sf && regionAt(s.map, sf.level.id, e.pos);
  if (r && !r.revealed) revealRegion(s, r, ev);
}

// ---------- objects ----------
// May players know about this object? It must touch a hex they have been shown.
export const objectShown = (map, o) => !objectDef(o).states[o.state].hidden && objectHexes(o).some((h) => !!map.levels.find((l) => l.id === o.level)?.tiles[H.col(h)] && shown(map, o.level, h));
const objectOf = (s, id, ctx = null) => {
  const o = s.map.objects.find((x) => x.id === id);
  return (o && (!ctx || ctx.role === 'dm' || (sightRule(s) === 'rooms' ? objectShown(s.map, o) : objectKnown(s, o))) && o) || fail('No such object.');
};
export const objectName = (o) => o.name ?? objectDef(o).name;
// Close enough to use it: beside a door's line, or on or next to a thing's hex, on its level.
function nearObject(s, e, o) {
  const level = s.map.levels.find((l) => l.id === o.level), z = level.z + (level.tiles[H.col(o.at)]?.h ?? 0);
  if (!ground(s.map, e.pos) || Math.abs(e.pos.z - z) > STEP_MAX) return false;
  const seg = objectSegment(o);
  return seg ? distToSegment(center(e.pos), seg) <= FT + 1e-9 : H.dist(e.pos, o.at) <= 1;     // within 5 ft
}
const hasKey = (e, key) => e.gear.some((g) => String(g).toLowerCase() === key.toLowerCase());
const objectZ = (s, o) => { const level = s.map.levels.find((l) => l.id === o.level); return level.z + (level.tiles[H.col(o.at)]?.h ?? 0); };
// Put an object into a state, and whatever it is linked to into theirs. The whole chain is
// worked out and checked before anything changes.
function setObject(s, o, state, ev, by = null, verb = null) {
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
function objectActor(s, id) {
  const o = s.map.objects.find((x) => x.id === id);
  return o ? { id: null, object: true, name: objectName(o), side: 'object', pos: { q: o.at.q, r: o.at.r, z: objectZ(s, o) }, hp: 1, maxHp: 1, dead: false,
    cond: {}, features: {}, attacks: [], gear: [], abil: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, prof: 0, resist: [], vuln: [], immune: [] } : null;
}
// Run a list of effect steps that come from a thing on the map against some creatures.
function objectEffects(s, o, steps, targets, ev) {
  if (!targets.length) return;
  begin(s, { steps, actor: null, targets: targets.map((t) => t.id), shared: targets.length > 1 ? sharedRolls(s, steps) : null,
    src: { name: objectName(o), object: o.id, dc: o.dc?.save ?? objectDef(o).dc?.save ?? 10, range: 1000 } });
  resolve(s, ev);
}
// A `set` or `reveal` step: work the thing itself or what it is linked to. False if there is nothing to work.
function objectStep(s, id, of, state, ev) {
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
// Falling: 1d6 Bludgeoning for every 10 feet, 20d6 at most, and Prone on landing unless it took no damage.
function fall(s, t, feet, ev) {
  const dice = Math.min(20, Math.floor(feet / 10));
  ev.push({ type: 'fell', id: t.id, feet });
  if (!dice) return;
  const mark = ev.length;
  damage(s, t, roll(s, `${dice}d6`).total, 'bludgeoning', ev);
  if (ev.slice(mark).some((x) => x.type === 'damage' && x.amount > 0)) condition(s, t, 'prone', ev);
}
// Forced movement: shove a creature so many feet straight away from a point, or toward it. It
// stops at a wall, a drop, or anything in the way. It provokes nothing and sets nothing off.
function push(s, t, feet, dir, from, ev) {
  const B = barriers(s.map), path = [], sign = dir === 'toward' ? -1 : 1, o = H.toWorld(from);
  for (let i = 0; i < Math.floor(feet / FT); i++) {
    const here = ground(s.map, t.pos), d0 = H.dist(t.pos, from), w = H.toWorld(t.pos);
    if (!here) break;
    let best = null;
    for (const n of H.neighbors(t.pos)) {
      if (H.dist(n, from) !== d0 + sign || (inFight(s, t.id) && !s.encounter.arena[H.col(n)])) continue;
      const sf = surfaces(s.map, n).find((x) => Math.abs(x.z - t.pos.z) <= STEP_FREE);
      if (!sf || TILES[sf.tile.t].cost === Infinity || B.solid(sf.level.id, n) || B.blocked(here.level.id, t.pos, n) || (sf.level !== here.level && B.blocked(sf.level.id, t.pos, n))) continue;
      const h = { q: n.q, r: n.r, z: sf.z };
      if (living(s).some((c) => c.id !== t.id && overlapAt(c, c.pos, t, h)) || !fitsOn(s.map, t, h, B)) continue;
      const nw = H.toWorld(n), straight = ((nw.x - w.x) * (w.x - o.x) + (nw.z - w.z) * (w.z - o.z)) * sign;       // most nearly straight along the line from the source
      if (!best || straight > best.straight + 1e-9) best = { h, straight };
    }
    if (!best) break;
    const zonesBefore = snapshot(s);
    t.pos = best.h; path.push(best.h);
    entered(s, ev, KIT, zonesBefore);                                    // pushed into a zone: it goes off once this effect is done
  }
  if (!path.length) return;
  ev.push({ type: 'moved', id: t.id, path, forced: true });
  lookAround(s, ev, [t]);
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


// ---------- hidden creatures ----------
// `hidden` is a DM switch: players are not told the creature exists (see view.js). The engine's
// part is to lift it the moment the party would find out for themselves.
function reveal(s, e, ev) {
  if (!e.hidden) return;
  delete e.hidden;
  ev.push({ type: 'revealed', id: e.id });
}

// ---------- hiding (the SRD's Hide action) ----------
// `hiding: { dc }` is a creature that took the Hide action: it has the Invisible condition against
// its enemies (sight.js, hiddenFrom), and `dc` is its Stealth total, the DC to find it. By the SRD it
// stops being hidden when it makes an attack roll, casts a spell with a Verbal component, makes a
// sound louder than a whisper (the DM's call, by the `reveal` action) or an enemy finds it.
// Design: docs/specs/sight.md, decision 5.
export const HIDE_DC = 15;
function unhide(s, e, ev, why, by = null) {
  if (!e.hiding) return;
  delete e.hiding;
  ev.push({ type: 'unhidden', id: e.id, why, ...(by ? { by: by.id } : {}) });
}
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
    if (w.why !== 'dark' && w.why !== 'out of sight') return `${e.name} is neither Heavily Obscured nor behind cover from ${o.name}.`;
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
// A party member walked into, or tried to step onto, a creature it did not know was there.
function bumped(s, o, by, ev) { reveal(s, o, ev); unhide(s, o, ev, 'found', by); }

// ---------- encounters ----------

const initiativeSort = (order) => order.sort((a, b) => b.init - a.init || b.dex - a.dex);
function rollInit(s, e) {
  const m = modifiers(s, e, 'initiative');
  if (e.hiding) m.advantage.push('hidden');                             // hidden is Invisible, and Invisible rolls Initiative with Advantage
  const two = (m.advantage.length > 0) !== (m.disadvantage.length > 0);
  const r1 = die(s, 20), r2 = two ? die(s, 20) : null;
  const d = !two ? r1 : m.advantage.length ? Math.max(r1, r2) : Math.min(r1, r2);
  // A monster's stat block gives its Initiative modifier outright (`initBonus`); anyone else adds their Dexterity modifier.
  return { id: e.id, init: d + (e.initBonus ?? mod(e.abil.dex)) + m.add, dex: e.abil.dex };
}

function startEncounter(s, center, ev, radius = ARENA_RADIUS, walked = null) {
  const arena = {};
  for (const h of H.range(center, radius)) if (hasColumn(s.map, h)) arena[H.col(h)] = 1;    // a fight locks whole columns, every level
  catchUp(s, arena, walked, ev);                         // those walking with the party are with it
  // Whatever is somewhere the party has not seen stays out of it until that place is revealed.
  const who = living(s).filter((e) => arena[H.col(e.pos)] && (e.side === 'party' || !unseenAt(s.map, e.pos)));
  if (!who.length) fail('Nobody is close enough to fight here.');
  for (const e of who) { e.reactionUsed = false; reveal(s, e, ev); }   // nobody fights unseen
  s.encounter = {
    id: ++s.seq, center, radius, arena, round: 1, turn: -1, budget: null, flags: {},
    order: initiativeSort(who.map((e) => rollInit(s, e))),
  };
  ev.push({ type: 'encounterStart', center, radius, order: s.encounter.order.map((o) => ({ ...o })) });
  advanceTurn(s, ev);
}

// Start a fight big enough to hold both the attacker and a distant target.
function engage(s, e, t, ev, walked = null) {
  const a = H.toWorld(e.pos), b = H.toWorld(t.pos), d = apart(s, e, t);
  startEncounter(s, H.fromWorld((a.x + b.x) / 2, (a.z + b.z) / 2), ev, Math.max(ARENA_RADIUS, Math.ceil(d / 2) + 1), walked);
}

function joinEncounter(s, e, ev) {
  const enc = s.encounter, cur = current(s);
  reveal(s, e, ev);
  e.reactionUsed = false;
  const slot = rollInit(s, e);
  enc.order.push(slot);
  initiativeSort(enc.order);
  enc.turn = enc.order.findIndex((o) => o.id === cur);
  ev.push({ type: 'joined', id: e.id, init: slot.init });
}

function endEncounter(s, ev, result) {
  for (const e of fighters(s)) {
    delete e.cond.dodging; delete e.cond.disengaged; e.reactionUsed = false;
    if (up(e)) delete e.cond.prone;                       // nothing stops you standing once the fight is over
  }
  ev.push({ type: 'encounterEnd', result, rounds: s.encounter.round });
  fightOver(s, ev);
  s.encounter = null;
}

function checkEnd(s, ev) {
  if (!s.encounter) return;
  const f = fighters(s);
  const foes = f.some((e) => e.side === 'foe' && up(e)), party = f.some((e) => e.side === 'party' && up(e));
  if (!foes || !party) endEncounter(s, ev, !foes ? 'victory' : 'defeat');
}

// A Death Saving Throw: a d20, with what modifiers add to saves (`save.death`, and `save` for any
// saving throw, such as Bless). A 1 or a 20 on the die counts as itself whatever is added.
function deathSave(s, e, ev) {
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
    s: e.death.s, f: e.death.f, dead: e.dead, stable: !!e.cond.stable, hp: e.hp });
}

function advanceTurn(s, ev) {
  const enc = s.encounter;
  for (let guard = 0; guard < enc.order.length * 2 + 2; guard++) {
    enc.turn++;
    if (enc.turn >= enc.order.length) { enc.turn = 0; enc.round++; s.clock += ROUND; roundStarted(s, ev); }
    const e = s.entities[enc.order[enc.turn].id];
    if (!e || e.dead) continue;
    if (e.hp <= 0) {
      if (!e.cond.stable) deathSave(s, e, ev);
      if (e.hp <= 0) continue;
    }
    enc.flags = {};
    turnStarted(s, ev, e, KIT);                                          // what ends "at the start of its turn" ends before it acts
    turnInZones(s, ev, KIT, e, 'turnStart');                            // a zone it starts its turn in (Web)
    const speed = speedOf(s, e), can = incapacitated(e) ? 0 : 1;        // an incapacitated creature gets its turn but cannot act
    enc.budget = { move: speed, action: can, bonus: can, dashes: 0 };     // `move` is walking feet left; other ways of moving are worked out from it
    e.reactionUsed = false;
    delete e.cond.dodging;
    ev.push({ type: 'turn', id: e.id, round: enc.round });
    recharge(s, e, ev);
    if (e.cond.prone && speed > 0) {                                     // with a Speed of 0 it stays down
      delete e.cond.prone;
      enc.budget.move -= Math.floor(speed / 2 / FT) * FT;
      ev.push({ type: 'stood', id: e.id });
    }
    return;
  }
  endEncounter(s, ev, 'stalemate');
}

// ---------- damage, healing, attacks ----------

// Roll the dice that modifiers add to a roll (Bless's 1d4, Bane's -1d4). Returns the total and,
// for the roll's event, what was rolled for what: [{ name, dice, roll }].
function rollDice(s, list) {
  let total = 0;
  const extra = [];
  for (const d of list) {
    const neg = d.dice.startsWith('-'), r = roll(s, d.dice.replace(/^[+-]/, '')).total * (neg ? -1 : 1);
    total += r;
    extra.push({ name: d.name, dice: d.dice, roll: r });
  }
  return { total, extra };
}

// `amount` is a number of `dtype` damage, or a list of { amount, type } parts that land together
// (one hit that does slashing and fire): each part is resisted on its own and logged on its own,
// but the creature takes them as one instance of damage, so a dying creature fails one death
// save for it (two on a critical hit), and Concentration is tested once, against the total.
// Temporary Hit Points are lost first (SRD); `raw` (the DM setting Hit Points) leaves them alone.
function damage(s, t, amount, dtype, ev, { crit = false, raw = false } = {}) {
  const parts = Array.isArray(amount) ? amount : [{ amount, type: dtype }];
  const m = modifiers(s, t, 'damage.taken', { target: t });
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
  let total = 0, lost = 0;
  for (const [pi, p] of parts.entries()) {
    const applies = (fromModifiers, own) => fromModifiers === true || fromModifiers.includes(p.type) || own.includes(p.type);
    // SRD order: Resistance (halved, rounded down), then Vulnerability (doubled); each counts once.
    const resisted = applies(m.resist, t.resist), vulnerable = applies(m.vulnerable, t.vuln);
    let n = Math.max(0, p.amount + adjust[pi]);
    if (applies(m.immune, t.immune)) n = 0;
    else { if (resisted) n = Math.floor(n / 2); if (vulnerable) n *= 2; }
    const note = n === 0 && p.amount > 0 ? 'immune' : resisted && vulnerable && p.amount > 0 ? 'resisted and vulnerable' : n < p.amount ? 'resisted' : n > p.amount ? 'vulnerable' : undefined;
    total += n;
    const soak = raw ? 0 : Math.min(t.tempHp ?? 0, n);
    if (soak) t.tempHp -= soak;
    lost += n - soak;
    if (!dying) t.hp = Math.max(0, t.hp - (n - soak));
    ev.push({ type: 'damage', target: t.id, amount: n, dtype: p.type, hp: dying ? 0 : t.hp, note, ...(noted[pi].length ? { adjusted: noted[pi] } : {}), ...(soak ? { temp: soak, tempHp: t.tempHp } : {}) });
  }
  if (t.tempFx && !(t.tempHp > 0)) delete t.tempFx;
  if (dying) {                                            // already dying
    if (total > 0) { t.death.f += crit ? 2 : 1; delete t.cond.stable; if (t.death.f >= 3 || total >= t.maxHp) t.dead = true; }   // as much as the maximum kills outright
    if (t.dead) ev.push({ type: 'died', id: t.id });
    return;
  }
  if (t.hp > 0) return total > 0 ? concentrationCheck(s, ev, t, total, KIT) : undefined;
  if (t.kind === 'pc' && lost - before < t.maxHp) {       // otherwise: instant death from massive damage
    t.cond.unconscious = {}; t.cond.prone = {}; t.death = { s: 0, f: 0 };
    ev.push({ type: 'down', id: t.id });
  } else { t.dead = true; ev.push({ type: 'died', id: t.id }); }
  concentrationLost(s, ev, t, `${t.name} went down`);
}

function heal(s, t, amount, ev) {
  if (t.hp <= 0) { delete t.cond.unconscious; delete t.cond.stable; t.death = { s: 0, f: 0 }; }
  t.hp = Math.min(t.maxHp, t.hp + amount);
  ev.push({ type: 'heal', target: t.id, amount, hp: t.hp });
  // In a fight a revived creature stays Prone until its turn, when standing costs half its Speed.
  // Outside one, movement isn't budgeted, so it simply gets up.
  if (t.cond.prone && !inFight(s, t.id)) { delete t.cond.prone; ev.push({ type: 'stood', id: t.id }); }
}

function checkRange(s, e, t, atk) {
  const d = apart(s, e, t);
  if (atk.type === 'melee') {
    if (d * FT > atk.reach) fail(`${t.name} is ${ft(d)} away. ${atk.name} reaches ${atk.reach} ft.`);
  } else if (d * FT > atk.range[1]) fail(`${t.name} is ${ft(d)} away. ${atk.name} reaches ${atk.range[1]} ft.`);
}

const UNSEEN = { dark: 'in darkness', 'out of sight': 'out of sight', hidden: 'hidden' };
// Temporary Hit Points: they do not add up. A creature keeps the larger of what it has and what
// it is given (the SRD lets it choose; nobody would choose fewer). From a lasting effect, they
// vanish when it ends. They never wake a creature at 0 Hit Points.
function tempHp(s, t, amount, ev, f = null) {
  if (t.dead) return;
  const had = t.tempHp ?? 0;
  if (amount <= had) return ev.push({ type: 'tempHp', id: t.id, amount: 0, tempHp: had, kept: true });
  const fx = f?.src.fx ? effectsOf(s).find((x) => x.id === f.src.fx) : null;
  t.tempHp = amount;
  if (fx) { t.tempFx = fx.id; fx.parts.push({ target: t.id, temp: true }); } else delete t.tempFx;
  ev.push({ type: 'tempHp', id: t.id, amount, tempHp: amount });
}

// Advantage and Disadvantage for an attack, with the reasons. Any of each cancels to a normal roll.
// Conditions and traits supply theirs as data (modifiers.js); the two rules written out here
// belong to ranged attacks themselves. Also returns `add` (a bonus or penalty to the roll) and
// `crit` (a hit is critical whatever the die shows).
export function rollMode(s, e, t, atk) {
  const d = apart(s, e, t), ranged = atk.type === 'ranged';
  const sit = { attacker: e, target: t, ranged };
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
  return { mode: adv.length && !dis.length ? 'adv' : dis.length && !adv.length ? 'dis' : 'normal', adv, dis, add: mine.add, dice: [...mine.dice, ...theirs.dice], crit: theirs.crit, used: [...mine.used, ...theirs.used] };
}

// The d20 part of an attack: roll, compare with Armor Class, record it. Returns { hit, crit, mode }.
function rollToHit(s, e, t, atk, ev, extra = {}) {
  const { mode, adv, dis, add, dice, crit: sureCrit, used } = rollMode(s, e, t, atk);
  unhide(s, e, ev, 'attack');                                           // an attack roll gives away where it is, hit or miss
  const r1 = die(s, 20), r2 = mode === 'normal' ? null : die(s, 20);
  const nat = mode === 'adv' ? Math.max(r1, r2) : mode === 'dis' ? Math.min(r1, r2) : r1;
  const more = rollDice(s, dice);
  const bonus = atk.bonus + add + more.total;
  // Cover adds to Armor Class: 2 for half, 5 for three-quarters.
  const cover = e.object ? 'none' : coverOf(s, e, t, living(s)), ac = acOf(s, t) + (COVER[cover] ?? 0);
  const hit = nat !== 1 && (nat === 20 || nat + bonus >= ac);
  const crit = hit && (nat === 20 || sureCrit);
  ev.push({ type: 'attack', actor: e.id, target: t.id, name: atk.name, rolls: r2 ? [r1, r2] : [r1], nat,
    total: nat + bonus, ac, mode, why: mode === 'adv' ? adv : mode === 'dis' ? dis : [], hit, crit, ...(cover !== 'none' ? { cover } : {}), ...(more.extra.length ? { extra: more.extra } : {}), ...extra });
  useUp(s, ev, used);
  return { hit, crit, mode };
}

// A weapon attack by a creature whose attacks are still flat records (monsters and
// hand-entered characters). Spells resolve through effect steps instead.
function resolveAttack(s, e, t, atk, ev, extra = {}) {
  const { hit, crit, mode } = rollToHit(s, e, t, atk, ev, extra);
  if (!hit) return;
  let total = roll(s, atk.damage, { crit }).total;
  const notes = [];
  if (atk.bonusOnAdv && mode === 'adv') total += roll(s, atk.bonusOnAdv, { crit }).total;
  const sneakKey = `sneak:${e.id}`;
  if (e.features.sneak && !atk.spell && (atk.finesse || atk.type === 'ranged') && !s.encounter?.flags[sneakKey] && mode !== 'dis') {
    const flank = living(s).some((o) => o.id !== e.id && up(o) && hostile(o, t) && apart(s, o, t) <= 1);
    if (mode === 'adv' || flank) {
      total += roll(s, e.features.sneak, { crit }).total;
      if (s.encounter) s.encounter.flags[sneakKey] = true;
      notes.push('Sneak Attack');
    }
  }
  if (notes.length) ev.push({ type: 'note', id: e.id, text: notes.join(', ') });
  damage(s, t, dealt(s, e, t, [{ amount: total, type: atk.dtype }], { hit: true, weapon: !atk.spell }, crit), null, ev, { crit });
  if (atk.onHit === 'prone') condition(s, t, 'prone', ev);
}

// Armor Class after anything that changes it.
function acOf(s, t) {
  const m = modifiers(s, t, 'ac', { target: t });
  return bounded(m, (m.set ?? t.ac) + m.add);
}

// Put a condition on a creature. What the condition does is data (content/srd52/conditions.js).
// `f` is the effect frame that caused it, if any, and `step` the step. If the frame belongs to
// a lasting effect the condition is tied to it and ends when it does; otherwise only the DM
// (or standing up, for Prone) ends it, and the DM is told so.
function condition(s, t, id, ev, f = null, step = null, level = undefined) {
  if (!up(t) || t.cond[id]) return;
  if (t.conditionImmune?.includes(id)) return ev.push({ type: 'note', id: t.id, text: `Immune to ${conditionName(id)}` });
  const fx = f?.src.fx ? effectsOf(s).find((x) => x.id === f.src.fx) : null;
  t.cond[id] = { ...(f ? { source: f.actor } : {}), ...(level ? { level } : {}), ...(fx ? { effect: fx.id } : {}) };
  if (fx) fx.parts.push({ target: t.id, cond: id, ...(step?.ends ? { ends: step.ends, dc: step.dc ?? f.src.dc, born: turnKey(s) } : {}) });
  ev.push({ type: 'cond', id: t.id, cond: id });
  const def = conditionDef(id), name = conditionName(id);
  const rest = def?.also ? ` The engine applies what it can; the DM applies the rest: ${def.also}` : '';
  const ending = fx || id === 'prone' ? '' : ' Nothing ends it yet: the DM removes it.';
  if (rest || ending) ev.push({ type: 'manual', actor: f?.actor ?? t.id, name: f?.src.name ?? name, partial: true, text: `${t.name} ${conditionPhrase(id)}.${rest}${ending}` });
  concentrationLost(s, ev, t, `${t.name} ${conditionPhrase(id)}`);
}

// Attach a modifier to a creature for as long as a lasting effect runs. Returns false if there
// is no lasting effect to carry it, in which case the step is handed to the DM.
// A step with `to: 'caster'` puts the modifier on the caster instead, and one whose modifier says
// `against: 'target'` holds only against this target (Hex's extra damage). A Hit Point maximum
// raised or lowered (`hp.max`) moves current Hit Points with it, and back when the effect ends.
function modifier(s, t, mod_, ev, f, step = {}) {
  const fx = f?.src.fx ? effectsOf(s).find((x) => x.id === f.src.fx) : null;
  if (!fx) return false;
  const holder = step.to === 'caster' ? s.entities[f.actor] : t;
  if (!holder) return false;
  const { against, ...m } = mod_;
  const part = { target: holder.id, modifier: m, ...(against === 'target' ? { against: t.id } : {}), ...(step.ends ? { ends: step.ends, dc: step.dc ?? f.src.dc, born: turnKey(s) } : {}) };
  if (m.on === 'hp.max' && m.op === 'add' && typeof m.value === 'number' && !holder.dead) {
    holder.maxHp += m.value;
    holder.hp = m.value > 0 && holder.hp > 0 ? holder.hp + m.value : Math.min(holder.hp, holder.maxHp);
    part.hpMax = m.value;
    ev.push({ type: 'maxHp', id: holder.id, maxHp: holder.maxHp, hp: holder.hp });
  }
  fx.parts.push(part);
  return true;
}

// Extra damage a creature deals, from its `damage.dealt` modifiers: a modifier with `types` adds a
// part of that type (Hex's 1d6 necrotic), one without is added to the first part. Extra dice are
// doubled on a critical hit like the rest. `sit` says whether it came from a hit and a weapon.
function dealt(s, e, t, parts, sit, crit) {
  if (!e || e.object) return parts;
  const m = modifiers(s, e, 'damage.dealt', { attacker: e, target: t, ...sit }, 'attacker');
  if (!m.dealt.length) return parts;
  const out = parts.map((p) => ({ ...p }));
  for (const x of m.dealt) {
    const neg = typeof x.value === 'string' && x.value.startsWith('-');
    const n = typeof x.value === 'string' ? roll(s, x.value.replace(/^[+-]/, ''), { crit }).total * (neg ? -1 : 1) : x.value;
    if (x.types) out.push({ amount: Math.max(0, n), type: x.types[0], from: x.name });
    else if (out.length) out[0].amount = Math.max(0, out[0].amount + n);
  }
  return out;
}

// `extra` names a second hook to gather modifiers from, such as 'concentration'.
// `from` is the creature or the point the effect comes from: cover against it helps a Dexterity save.
function savingThrow(s, t, abil, dc, extra = null, from = null) {
  const sit = { target: t, ability: abil };
  const m = modifiers(s, t, `save.${abil}`, sit, '');
  const cover = abil === 'dex' && from && !from.object ? coverOf(s, from, t, living(s)) : 'none';
  m.add += COVER[cover] ?? 0;
  // `save` applies to every saving throw (Bless, Bane); `extra` names one more hook, such as 'concentration'.
  for (const hook of ['save', ...(extra ? [extra] : [])]) {
    const x = modifiers(s, t, hook, sit, '');
    m.add += x.add; m.advantage.push(...x.advantage); m.disadvantage.push(...x.disadvantage); m.dice.push(...x.dice); m.used.push(...x.used);
    m.autoFail ||= x.autoFail; m.autoSucceed ||= x.autoSucceed;
  }
  // A single-use modifier is spent by this save (the effect runner has no events list here, so
  // the ending is recorded silently; the save that used it is in the log).
  if (m.used.length) useUp(s, [], m.used);
  if (m.autoFail) return { roll: 0, total: 0, success: false };
  if (m.autoSucceed) return { roll: 0, total: dc, success: true };
  const mode = m.advantage.length && !m.disadvantage.length ? 'adv' : m.disadvantage.length && !m.advantage.length ? 'dis' : 'normal';
  const r1 = die(s, 20), r2 = mode === 'normal' ? null : die(s, 20);
  const r = mode === 'adv' ? Math.max(r1, r2) : mode === 'dis' ? Math.min(r1, r2) : r1;
  const more = rollDice(s, m.dice);
  // A monster's stat block gives its save outright (`saveBonus`); anyone else adds Proficiency to the modifier for a saving throw they are proficient in.
  const base = t.saveBonus?.[abil] ?? mod(t.abil[abil]) + (t.saveProf.includes(abil) ? t.prof : 0);
  const total = r + base + m.add + more.total;
  return { roll: r, total, success: total >= dc, ...(cover !== 'none' && cover !== 'total' ? { cover } : {}), ...(r2 === null ? {} : { rolls: [r1, r2], mode, why: mode === 'adv' ? m.advantage : m.disadvantage }), ...(more.extra.length ? { extra: more.extra } : {}) };
}

// ---------- ability checks ----------
// What a creature adds to a d20 for a check: its ability modifier, its Proficiency Bonus if it
// is proficient in the skill or with the tool (twice for Expertise), or a monster's listed bonus.
export function checkBonus(e, { ability, skill, tool }) {
  if (skill && e.skillBonus?.[skill] !== undefined) return e.skillBonus[skill];
  let b = mod(e.abil[ability ?? SKILLS[skill]] ?? 10);
  if (skill && e.skills?.includes(skill)) b += e.prof * (e.expertise?.includes(skill) ? 2 : 1);
  else if (tool && e.tools?.includes(tool)) b += e.prof;
  return b;
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
  return { roll: r, total: r + bonus + more.total, bonus, ...(mode === 'normal' ? {} : { rolls: [r1, r2], mode, why: mode === 'adv' ? m.advantage : m.disadvantage }), ...(more.extra.length ? { extra: more.extra } : {}),
    ...(dimToo ? { dimTotal: pickOf(dimMode) + bonus + more.total } : {}) };
}
// A passive score: 10 plus the bonus, 5 more with Advantage, 5 less with Disadvantage.
// Dice from modifiers (Guidance) are not rolled for a passive score: it is not a roll.
// `dis` adds reasons for Disadvantage that are not modifiers, such as Dim Light.
export function passive(s, e, skill, dis = []) {
  const m = modifiers(s, e, 'check', { target: e, skill, ability: SKILLS[skill] }, '');
  m.disadvantage = [...m.disadvantage, ...dis];
  return 10 + checkBonus(e, { skill }) + m.add + (m.advantage.length && !m.disadvantage.length ? 5 : 0) - (m.disadvantage.length && !m.advantage.length ? 5 : 0);
}
const slug = (x) => String(x).toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const hasTool = (e, tool) => e.gear.some((g) => slug(g) === tool);
const toolName = (tool) => (tool === 'thieves-tools' ? "Thieves' Tools" : tool.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '));

// ---------- finding hidden things ----------
export const SEARCH_FEET = 15, NOTICE_FEET = 10;
// Could this creature find this hidden object from where it stands? It must be within `feet`,
// on its level, touch a hex the players have been shown, and have nothing solid in between.
function findable(s, e, o, feet) {
  const def = objectDef(o);
  if (!def.states[o.state].hidden || !def.find || Math.abs(objectZ(s, o) - e.pos.z) > STEP_MAX) return false;
  const level = s.map.levels.find((l) => l.id === o.level);
  const near = objectHexes(o).filter((h) => level.tiles[H.col(h)] && shown(s.map, o.level, h)).sort((x, y) => H.dist(x, e.pos) - H.dist(y, e.pos))[0];
  return !!near && H.dist(near, e.pos) * FT <= feet && clear(s, e.pos, { q: near.q, r: near.r, z: level.z + (level.tiles[H.col(near)].h ?? 0) });
}
const findDC = (o) => o.dc?.find ?? objectDef(o).dc.find;
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
function aimArea(s, e, name, area, range, hex) {
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
function creatures(s, e, name, { range, harmful, repeat, within, most, spell = false }, a) {
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
// Put the caster's choice where a spell's steps say "chosen".
function chooseIn(steps, of, value) {
  const visit = (list) => { for (const st of list) {
    const m = st.modifier;
    if (m?.scope && of !== 'damageType') for (const k of ['skill', 'ability']) if (m.scope[k] === 'chosen' && k === of) m.scope[k] = value;
    if (m?.types && of === 'damageType') m.types = m.types.map((t) => (t === 'chosen' ? value : t));
    if ('damage' in st && st.type === 'chosen' && of === 'damageType') st.type = value;
    for (const b of ['onHit', 'onMiss', 'onFail', 'onSuccess']) if (st[b]) visit(st[b]);
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

// Why this creature can't take an action/bonus action right now ('' if it can).
export function blocked(s, e, time = 'action') {
  if (!up(e)) return `${e.name} is down.`;
  const stopped = incapacitatedBy(e);
  if (stopped) return `${e.name} is ${stopped} and can't act.`;
  if (!s.encounter) return '';
  if (!inFight(s, e.id)) return `${e.name} is outside the battle. Move into the arena to join.`;
  if (current(s) !== e.id) return `It isn't ${e.name}'s turn.`;
  if (time && s.encounter.budget[time] < 1) return `${e.name} has already used ${time === 'bonus' ? 'a Bonus Action' : 'an action'} this turn.`;
  return '';
}
const need = (s, e, time) => { const why = blocked(s, e, time); if (why) fail(why); };
// Refuse if a condition stops this creature acting at all, in or out of a fight.
const able = (e) => { const by = incapacitatedBy(e); if (by) fail(`${e.name} is ${by} and can't act.`); };

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

// ---------- a creature's own actions ----------
// A monster's actions are data, run by the effect runner as a spell's are (effects.js).

// Attacks left this turn from a Multiattack or from Extra Attack sit in `budget.attacks`: a list
// of alternatives, each a list of { action, left }, where `action` is an action id, a list of
// ids (any of them), or null (any attack). An attack spends from every alternative that allows
// it, and alternatives that do not are dropped, so the choice between them is made attack by
// attack. Returns whether `id` may be made from it; with `spend`, makes it.
const fits = (x, id) => x.left > 0 && (x.action === null || x.action === id || (Array.isArray(x.action) && x.action.includes(id)));
const width = (x) => (x.action === null ? Infinity : Array.isArray(x.action) ? x.action.length : 1);
export function fromPool(b, id, spend = false) {
  if (!b?.attacks) return false;
  const keep = b.attacks.filter((alt) => alt.some((x) => fits(x, id)));
  if (!keep.length) return false;
  if (!spend) return true;
  for (const alt of keep) alt.filter((x) => fits(x, id)).sort((x, y) => width(x) - width(y))[0].left--;      // the narrowest entry that allows it
  b.attacks = keep.filter((alt) => alt.some((x) => x.left > 0));
  if (!b.attacks.length) delete b.attacks;
  return true;
}
// How many attacks are left this turn (the most any alternative still allows).
export const attacksLeft = (b) => (b?.attacks ? Math.max(0, ...b.attacks.map((alt) => alt.reduce((n, x) => n + x.left, 0))) : 0);

// Can this action be used now, as far as its recharge and uses go? '' if so.
export function actionSpent(e, def) {
  if (def.recharge && e.spent?.[def.id]) return `${def.name} has not recharged.`;
  if (def.uses && (e.charges?.[def.id] ?? def.uses.n) < 1) return `${e.name} has no uses of ${def.name} left today.`;
  return '';
}
// At the start of its turn a creature rolls for each spent action with a recharge.
function recharge(s, e, ev) {
  for (const def of e.actions ?? []) {
    if (!def.recharge || !e.spent?.[def.id]) continue;
    const d = die(s, 6), ready = d >= def.recharge[0];
    if (ready) delete e.spent[def.id];
    ev.push({ type: 'recharge', id: e.id, action: def.id, name: def.name, roll: d, ready });
  }
}

// Something with no duration of its own whose steps end at a turn boundary ("Blinded until the
// end of the mephit's next turn", Ray of Frost's slowing) needs an effect to hang that on: one
// `bound` to its parts, which ends when they do. Null if no step has an `ends`.
function boundEffect(s, name, source, steps, spell = null) {
  let timed = false;
  walkSteps(steps, (st) => { if (st.ends && (st.ends.on === 'turnStart' || st.ends.on === 'turnEnd' || st.ends.on === 'save')) timed = true; });
  if (!timed) return null;
  const fx = startEffect(s, { name, spell, source, conc: false, duration: 'special' });
  fx.bound = true;
  return fx;
}
// After the steps ran: a bound effect that put nothing on anyone is dropped unannounced; one that
// did is announced with what it holds.
function settle(s, ev, fx, targets) {
  if (!fx.parts.length) { s.effects = effectsOf(s).filter((x) => x !== fx); return; }
  ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: fx.source, conc: false, lasts: 'until its parts end', targets: [...new Set(fx.parts.map((p) => p.target))] });
  void targets;
}

// Who or what an action is aimed at: { targets, hexes, origin }. `targets` is null for an area
// the engine cannot lay out (a line, a cube), which the DM then applies.
function aimAction(s, e, def, a) {
  const t = def.target;
  if (t.self) return { targets: [e], hexes: null, origin: null };
  if (t.creature) {
    const c = t.creature, far = c.reach ?? c.range[1];
    for (const id of a.targets ?? [a.target]) { const x = ent(s, id); !x.dead || fail(`${x.name} is already dead.`); }
    const targets = creatures(s, e, def.name, { range: far, harmful: true, repeat: c.repeat, within: c.within, most: c.count ?? 1 }, a);
    return { targets, hexes: null, origin: null };
  }
  if (actionProfile(def).aim !== 'area') return { targets: null, hexes: null, origin: null };
  return aimArea(s, e, def.name, t.area, t.area.range ?? 0, a.hex);
}

// Who an area action would catch if aimed at `hex`, or null if it cannot be aimed there. For the AI and the UI.
export function areaTargets(s, e, def, hex) {
  try { return aimAction(s, e, def, { hex }).targets; } catch (err) { if (err instanceof RuleError) return null; throw err; }
}

// Use an action: aim it, pay for it, run it. In a fight it costs the creature's action (or its
// Bonus Action, for one with `time: 'bonus'`), unless it is one of the attacks a Multiattack
// left this turn, which it spends instead.
function takeAction(s, e, def, a, ev) {
  const why = actionSpent(e, def);
  if (why) fail(why);
  const { targets, hexes, origin } = aimAction(s, e, def, a);
  const p = actionProfile(def);
  if (!s.encounter && p.harmful && targets !== null && !def.target.self) {          // roll initiative first
    showPlace(s, e, ev);
    if (def.target.creature) showPlace(s, targets[0], ev);
    return def.target.area ? startEncounter(s, e.pos, ev) : engage(s, e, targets[0], ev);
  }
  if (s.encounter) {
    const b = s.encounter.budget, time = def.time ?? 'action', pooled = time === 'action' && fromPool(b, def.id);
    need(s, e, pooled ? null : time);
    if (def.target.creature) for (const t of targets) inFight(s, t.id) || fail(`${t.name} is outside the battle.`);
    if (pooled) fromPool(b, def.id, true); else b[time]--;
  }
  if (def.recharge) (e.spent ??= {})[def.id] = true;
  if (def.uses) (e.charges ??= {})[def.id] = (e.charges[def.id] ?? def.uses.n) - 1;
  runAction(s, e, def, targets, hexes, origin, ev);
  checkEnd(s, ev);
}

// Run an action's effect steps against its targets. Costs are the caller's. `tag` marks the
// attack event (an Opportunity Attack).
function runAction(s, e, def, targets, hexes, origin, ev, tag = null) {
  showPlace(s, e, ev);
  for (const t of targets ?? []) if (t.id !== e.id) { if (def.target.creature) showPlace(s, t, ev); else reveal(s, t, ev); }
  const c = def.target.creature;
  // An attack roll says what it is in its own event; anything else (a breath, a gaze) is announced.
  if (!('attack' in def.effects[0])) ev.push({ type: 'act', actor: e.id, action: def.id, name: def.name, hexes, targets: (targets ?? []).map((t) => t.id) });
  const steps = structuredClone(def.effects), fx = boundEffect(s, def.name, e.id, steps);
  begin(s, {
    steps, actor: e.id, targets: targets === null ? null : targets.map((t) => t.id),
    src: { name: def.name, ...(c ? { reach: c.reach, rangeBand: c.range, range: c.range?.[1] ?? c.reach } : {}), ...(origin ? { origin } : {}), ...(tag ? { tag } : {}), ...(fx ? { fx: fx.id } : {}) },
    shared: def.target.area && targets ? sharedRolls(s, def.effects) : null,
  });
  resolve(s, ev);
  if (fx) settle(s, ev, fx, targets ?? []);
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
        flush();
        o.reactionUsed = true;
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

// ---------- walking together ----------
// A party member may follow another (`follow: id`). When the one in front walks, outside a
// fight, those behind walk after it in marching order (`march`, lowest first), each by its own
// way of moving, to the free place nearest behind the leader's path. When a fight breaks out,
// those who were following are brought up behind their leader before initiative is rolled.
export const CATCH_UP = 60;          // feet: the furthest from its leader a follower is brought up to when a fight starts
const KEEP_UP = 2;                   // hexes: a follower stays this close to the one in front where the ground allows
const byMarch = (a, b) => (a.march ?? Infinity) - (b.march ?? Infinity);
const nextMarch = (s) => Math.max(-1, ...Object.values(s.entities).map((x) => x.march ?? -1)) + 1;

function unfollow(s, e, ev, why = null) {
  const leader = e.follow;
  delete e.follow;
  ev.push({ type: 'follow', id: e.id, leader: null, was: leader, ...(why ? { why } : {}) });
}

// The line a column walks along: the leader's path from where it stands back to where it set
// off, then on the same way for a while, so that those at the back have somewhere to be.
// `path` runs from the leader backwards; `away` is a place the line leads away from if the path is one hex.
function trailOf(path, away = null) {
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
function along(trail, h) {
  let d = Infinity, i = 0;
  trail.forEach((p, j) => { const x = H.dist(p, h); if (x < d) { d = x; i = j; } });
  return { d, i };
}

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

// A fight is starting in `arena`. Everyone who was following a party member in it, and is not in
// it already, is brought up to the nearest free place behind its leader that it could have walked
// to (a path exists, and the place is at most CATCH_UP feet of walking from the leader).
// `walked` is { id, path } for a leader whose walk started the fight: the path from where it stands back.
function catchUp(s, arena, walked, ev) {
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
const less = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };

// ---------- actions ----------

// Run the effect stack to the end, then whatever zones went off while it ran (zones.js).
function resolve(s, ev) { run(s, ev, KIT); flushZones(s, ev, KIT); }

// The engine's machinery, lent to the effect runner (effects.js) so it need not know our internals.
const KIT = { rollToHit, savingThrow, damage, dealt, heal, tempHp, condition, modifier, judge, objectActor, objectStep, fall, push, reveal };

const handlers = {
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

  // { type: 'attack', actor, target, attack }. A creature with actions (made from a pack
  // monster) attacks with the action of that id; others with their flat attack records.
  attack(s, a, ctx, ev) {
    const e = ent(s, a.actor), t = ent(s, a.target); control(e, ctx);
    const def = e.actions?.find((x) => x.id === a.attack && !x.multiattack);
    if (def) {
      up(e) || fail(`${e.name} is down.`);
      able(e);
      return takeAction(s, e, def, { target: a.target }, ev);
    }
    const atk = e.attacks.find((x) => x.id === a.attack) || fail('Unknown attack.');
    up(e) || fail(`${e.name} is down.`);
    able(e);
    !t.dead || fail(`${t.name} is already dead.`);
    e.id !== t.id || fail("A creature can't attack itself.");
    checkRange(s, e, t, atk);
    walled(s, e, t);
    showPlace(s, e, ev); showPlace(s, t, ev);
    if (!s.encounter) return engage(s, e, t, ev);                 // roll initiative first
    const b = s.encounter.budget, pooled = fromPool(b, atk.id);
    need(s, e, pooled ? null : 'action');
    inFight(s, t.id) || fail(`${t.name} is outside the battle.`);
    if (pooled) fromPool(b, atk.id, true);
    else {
      b.action--;
      // Extra Attack: the Attack action makes more than one attack. The rest wait in the budget.
      if (e.features.extraAttack) b.attacks = [[{ action: null, left: e.features.extraAttack }]];
    }
    resolveAttack(s, e, t, atk, ev);
    checkEnd(s, ev);
  },

  // { type: 'act', actor, action, target? | hex? }: a creature uses one of its actions (a
  // monster's Bite, Fire Breath or Multiattack). Its effect steps run like a spell's.
  act(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    const def = e.actions?.find((x) => x.id === a.action) || fail(`${e.name} has no such action.`);
    up(e) || fail(`${e.name} is down.`);
    able(e);
    if (!def.multiattack) return takeAction(s, e, def, a, ev);
    // Multiattack spends the action and leaves the attacks it gives in the budget, to be made
    // one at a time, each at a target chosen when it is made. What is not made by the end of
    // the turn is lost.
    s.encounter || fail(`${def.name} is for a fight. Make one of ${e.name}'s attacks to start one.`);
    need(s, e, 'action');
    const b = s.encounter.budget;
    b.action--;
    b.attacks = (Array.isArray(def.multiattack) ? [def.multiattack] : def.multiattack.or).map((list) => list.map((x) => ({ action: structuredClone(x.action), left: x.times })));
    ev.push({ type: 'std', id: e.id, action: def.name });
  },

  // { type: 'cast', actor, spell, target? | hex?, slot? }
  cast(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    const sp = SPELLS[a.spell];
    (sp && e.spells.includes(a.spell)) || fail(`${e.name} doesn't know that spell.`);
    up(e) || fail(`${e.name} is down.`);
    able(e);
    if (sp.time === 'reaction') fail(`${sp.name} is cast as a Reaction. The engine does not handle that yet; the DM applies it.`);
    if (!sp.turn && s.encounter) fail(`${sp.name} takes longer than a turn to cast, so it can't be cast during a fight.`);

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
    const most = targetCount(sp.def, e.level, Math.max(slot, sp.level));
    let targets = [], hexes = null, areaOrigin = null;
    if (sp.aim === 'area') {
      ({ targets, hexes, origin: areaOrigin } = aimArea(s, e, sp.name, sp.area, sp.range, a.hex));
      if (sp.area.choose) targets = chosen(e, sp.name, targets, a.targets, most);
    } else if (sp.aim === 'creature') {
      targets = creatures(s, e, sp.name, { range: sp.range, harmful: sp.harmful, repeat: sp.repeat, within: sp.within, most, spell: true }, a);
    } else if (sp.aim === 'self') targets = [e];

    // What it costs.
    if (sp.level > 0) {
      (Number.isInteger(slot) && slot >= sp.level && slot <= 9) || fail(`${sp.name} needs a spell slot of level ${sp.level} or higher.`);
      e.slots[slot] > 0 || fail(`${e.name} has no level ${slot} spell slots left.`);
    }
    const aimed = sp.aim === 'area' || sp.aim === 'creature';
    if (!s.encounter && sp.harmful && aimed) return sp.aim === 'area' ? startEncounter(s, e.pos, ev) : engage(s, e, targets[0], ev);
    if (s.encounter) {
      need(s, e, sp.time);
      if (sp.level > 0 && s.encounter.flags.slot) fail('Only one spell slot can be spent per turn.');
      if (sp.aim === 'creature') for (const t of targets) inFight(s, t.id) || fail(`${t.name} is outside the battle.`);
      s.encounter.budget[sp.time]--;
      if (sp.level > 0) s.encounter.flags.slot = true;
    }
    if (sp.level > 0) e.slots[slot]--;
    if (sp.def.components?.includes('v')) unhide(s, e, ev, 'spell');      // a Verbal component gives a hiding caster away
    showPlace(s, e, ev);
    for (const t of targets) reveal(s, t, ev);         // caught in the area: no longer unseen

    // What it does: run its effect steps.
    const st = spellStats(e, s), { steps, unscaled } = scaleSteps(sp.def, e.level, slot);
    if (pick) chooseIn(steps, pick.of, a.choice);
    ev.push({ type: 'cast', actor: e.id, spell: a.spell, name: sp.name, hexes, targets: targets.map((t) => t.id), ...(slot > sp.level ? { slot } : {}), ...(pick ? { choice: a.choice } : {}) });
    // A spell that lasts becomes an effect: it is timed, it can hold conditions and modifiers on
    // creatures, and ending it takes them off. Concentrating on a new spell ends the old one.
    let fx = null;
    if (sp.def.duration !== 'instant') {
      if (sp.def.concentration) breakConcentration(s, ev, e.id, `${e.name} began concentrating on ${sp.name}`);
      fx = startEffect(s, { name: sp.name, spell: a.spell, source: e.id, conc: sp.def.concentration, duration: sp.def.duration });
      ev.push({ type: 'effectStart', fx: fx.id, name: fx.name, source: e.id, conc: fx.conc, lasts: fx.lasts, targets: [...new Set(targets.map((t) => t.id))] });
    } else fx = boundEffect(s, sp.name, e.id, steps, a.spell);
    // A zone stays where it was laid out (or moves with its caster) and works on whoever comes
    // into it later (zones.js). Unless it says `atCast`, nobody is affected as it appears.
    let hit = targets;
    if (zoneDef && fx && hexes) {
      const spare = a.spare ?? [];
      fx.zone = { area: { ...sp.area }, on: [...zoneDef.on], ...(zoneDef.once ? { once: zoneDef.once } : {}),
        ...(sp.area.shape === 'emanation' ? { follows: e.id } : { hexes: hexes.map(H.col), origin: { ...(areaOrigin ?? e.pos) } }),
        spare, steps: structuredClone(steps), src: { name: sp.name, dc: st.dc, attack: st.attack, range: sp.range, healMod: mod(e.abil[e.castAbil] ?? 10) }, last: {} };
      hit = zoneDef.atCast ? targets.filter((t) => !spare.includes(t.id)) : [];
      const now = turnKey(s);
      if (now !== null) for (const t of hit) fx.zone.last[t.id] = now;     // "only once per turn": appearing counts
    }
    const before = ev.length;
    begin(s, {
      steps, actor: e.id, targets: sp.aim === 'none' ? null : hit.map((t) => t.id),
      src: { name: sp.name, dc: st.dc, attack: st.attack, range: sp.range, healMod: mod(e.abil[e.castAbil] ?? 10), ...(fx ? { fx: fx.id } : {}), ...(areaOrigin ? { origin: areaOrigin } : {}) },
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

  dash(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    s.encounter || fail('Dash only matters in a fight. Just move.');
    need(s, e, 'action');
    s.encounter.budget.action--; s.encounter.budget.move += speedOf(s, e); s.encounter.budget.dashes = (s.encounter.budget.dashes | 0) + 1;
    ev.push({ type: 'std', id: e.id, action: 'Dash' });
  },
  disengage(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    s.encounter || fail('Disengage only matters in a fight.');
    const time = e.features.nimbleEscape ? 'bonus' : 'action';
    need(s, e, time);
    s.encounter.budget[time]--; e.cond.disengaged = {};
    ev.push({ type: 'std', id: e.id, action: 'Disengage' });
  },
  dodge(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    s.encounter || fail('Dodge only matters in a fight.');
    need(s, e, 'action');
    s.encounter.budget.action--; e.cond.dodging = {};
    ev.push({ type: 'std', id: e.id, action: 'Dodge' });
  },
  secondWind(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    e.uses.secondWind > 0 || fail(`${e.name} has no uses of Second Wind left.`);
    need(s, e, 'bonus');
    e.hp < e.maxHp || fail(`${e.name} is already at full Hit Points.`);
    if (s.encounter) s.encounter.budget.bonus--;
    e.uses.secondWind--;
    ev.push({ type: 'std', id: e.id, action: 'Second Wind' });
    heal(s, e, roll(s, `1d10+${e.level}`).total, ev);
  },
  endTurn(s, a, ctx, ev) {
    const e = ent(s, a.actor); control(e, ctx);
    (s.encounter && current(s) === e.id) || fail(`It isn't ${e.name}'s turn.`);
    delete e.cond.disengaged;
    turnInZones(s, ev, KIT, e, 'turnEnd');                              // a zone it ends its turn in (Moonbeam, Spirit Guardians)
    checkEnd(s, ev);
    if (!s.encounter) return;
    turnEnded(s, ev, e, KIT);
    if (s.encounter) advanceTurn(s, ev);
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
    if (s.encounter && inFight(s, e.id)) { const time = e.features?.nimbleEscape ? 'bonus' : 'action'; need(s, e, time); s.encounter.budget[time]--; }
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
    Object.assign(fresh, { hp: Math.max(e.hp > 0 ? 1 : 0, fresh.maxHp - lost), cond: e.cond, death: e.death, dead: e.dead, reactionUsed: e.reactionUsed });
    for (const [l, n] of Object.entries(fresh.slots)) fresh.slots[l] = Math.min(n, Math.max(0, n - ((e.slotsMax?.[l] ?? 0) - (e.slots?.[l] ?? 0))));      // slots already spent stay spent
    if (e.look && !a.record.look) fresh.look = e.look;
    s.entities[e.id] = fresh;
    ev.push({ type: 'edited', id: e.id });
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
  // Hand a creature an item, or take one away. { type: 'give', actor, item, take? }
  give(s, a, ctx, ev) {
    ctx.role === 'dm' || fail('Only the DM can hand out items.');
    const e = ent(s, a.actor), item = String(a.item ?? '').trim();
    (item && item.length <= 80) || fail('Name the item.');
    if (a.take) {
      const i = e.gear.findIndex((g) => String(g).toLowerCase() === item.toLowerCase());
      i >= 0 || fail(`${e.name} has no ${item}.`);
      e.gear.splice(i, 1);
    } else e.gear.push(item);
    ev.push({ type: 'gear', id: e.id, item, ...(a.take ? { taken: true } : {}) });
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
    const party = Object.values(s.entities).filter((e) => e.side === 'party'), spots = [];
    for (let n = 0; n < 12 && spots.length < party.length; n++) {
      for (const h of H.range(start, n)) {
        const p = H.dist(h, start) === n ? landing(map, h, start.z) : null;
        if (walkable(p) && Math.abs(p.z - start.z) <= STEP_MAX && spots.length < party.length) spots.push(p);
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
    !e.conditionImmune?.includes(a.condition) || fail(`${e.name} is immune to ${def.name}.`);
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
    if (hp > e.hp) { e.dead = false; heal(s, e, hp - e.hp, ev); } else if (hp < e.hp) damage(s, e, e.hp - hp, 'untyped', ev, { raw: true });
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
  setting(s, a, ctx) {
    ctx.role === 'dm' || fail('Only the DM can change table settings.');
    Object.hasOwn(SETTINGS, a.key) || fail('Unknown setting.');
    SETTINGS[a.key].includes(a.value) || fail(`That setting can be: ${SETTINGS[a.key].join(', ')}.`);
    s.settings[a.key] = a.value;
  },
};

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
export const SETTINGS = { sight: SIGHT_RULES, autoEngage: [true, false], passiveFind: ['off', 'traps', 'all'], vertical: ['max', 'sum', 'true'], climbing: ['on', 'off'], cover: ['on', 'off'], creatureCover: ['on', 'off'], engageRange: [10, 30, 60] };

export function apply(s, action, ctx = { role: 'dm' }) {
  const ev = [];
  try {
    // To anyone but the DM a hidden creature does not exist. Answering "it's 40 ft away" or
    // "it isn't yours" to a guessed id would confirm that it does.
    if (ctx.role !== 'dm') for (const k of ['actor', 'target', 'entity']) if (unknown(s, s.entities[action[k]])) fail('No such creature.');
    const h = handlers[action.type] || fail(`Unknown action: ${action.type}`);
    h(s, action, ctx, ev);
  } catch (err) {
    delete s.stack;                                  // never leave half an effect behind
    if (err instanceof RuleError) return { ok: false, error: err.message, events: [] };
    throw err;
  }
  try { gravity(s, ev); watch(s, ev); look(s, ev); } catch (err) { if (!(err instanceof RuleError)) throw err; }
  // The record keeps, with each entry, the creatures the party did not know of when it happened,
  // so that reading the record later never tells players about what they could not see then.
  const unseen = (x) => typeof x === 'string' && unknown(s, s.entities[x]);
  for (const e of ev) {
    if (e.type === 'moved') continue;
    const ids = [e.id, e.actor, e.target, e.by, ...(Array.isArray(e.targets) ? e.targets : []), ...(Array.isArray(e.order) ? e.order.map((o) => o.id) : [])].filter(unseen);
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
