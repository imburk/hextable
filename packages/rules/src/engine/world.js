// Where things are (engine.js): flying and fitting, where a creature can move, regions shown and
// objects set, hidden creatures revealed, joining a fight, finding hidden things, aiming areas and
// choosing creatures, and the party walking in marching order.
import { HEX, gridOf, col, key, pathTo, reachable, boxMiddle, boxOf, squareAlong, squareAround, squareBlock, squareCone, squareDisc, squareStrip } from '../grid.js';
import { d20Faces, die } from '../rng.js';
import { CONTENT, SPELLS, TILES } from '../content/index.js';
import { actionProfile } from '../effects.js';
import { apart, footprint, FT, gap, ground, hasColumn, HEADROOM, landing, measure, overlapAt, regionAt, rise, shapeOf, shown, sizeOf, STEP_FREE, STEP_MAX, surfaces, under, unseenAt, WALL_HEIGHT } from '../space.js';
import { SIZES } from '../content/sizes.js';
import { difficultAt, terrainsOf } from '../terrain.js';
import { objectKnown, regionsInSight, sightRule, unknown } from '../vision.js';
import { barriers, distToSegment, objectDef, objectHexes, objectSegment } from '../walls.js';
import { itemName } from '../derive.js';
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
  const G = gridOf(map), shape = shapeOf(e, G);
  if (shape.length === 1) return true;
  const base = ground(map, h)?.level, parts = footprint(e, h, G);
  for (const f of parts.slice(1)) {
    const sf = surfaces(map, f).find((x) => Math.abs(x.z - h.z) <= STEP_MAX);
    if (!sf || TILES[sf.tile.t].cost === Infinity || B.solid(sf.level.id, f)) return false;
  }
  if (base) for (const f of parts) for (const n of G.neighbors(f)) if (parts.some((p) => p.q === n.q && p.r === n.r) && B.blocked(base.id, f, n)) return false;
  return true;
}
// The levels whose walls stand at this height.
const wallsAt = (map, z) => map.levels.filter((l) => l.z <= z && z < l.z + WALL_HEIGHT);

const SIZE_ORDER = Object.keys(SIZES);                 // tiny to gargantuan

// ---------- squares: diagonals, corners and the search ----------
// How a diagonal step is counted on a square map, a table rule (`settings.diagonals`; absent means
// 'real'). On hexes there are no diagonals and none of this applies.
//   real       the owner's rule, the default: a diagonal step costs its true length, 5 x √2 feet,
//              and whatever doubles a step (Difficult Terrain, climbing, swimming, crawling) doubles
//              that. A creature may enter a square whenever it has any movement left, even if the
//              step costs more than is left, if the step is on the flat (same height, Difficult
//              Terrain or not); that step uses up the rest. A step up or down is paid in full.
//              Not the SRD's count.
//   srd        every diagonal costs what a side step does (SRD 5.2.1 1817-1823).
//   alternate  every second diagonal costs double, counted through the turn ("5-10-5"). A table
//              rule; it is not in the SRD 5.2.1.
export const DIAGONALS = ['real', 'srd', 'alternate'];
// Feet of movement are compared with this one tolerance, and nowhere else by hand. Under 'real'
// costs are sums of 5 x √2 and whole feet: two routes of the same length can come out a last bit
// apart in floating point, while two of different lengths are always far more than this apart.
export const EPS_FT = 1e-6;
// Is `a` less than `b` by more than rounding?
export const below = (a, b) => a < b - EPS_FT;
// Feet of movement left, as a message says it: whole feet, rounded down, on a square map (where
// 'real' leaves fractions); as it is on hexes.
export const feetLeft = (s, n) => (gridOf(s.map).kind === 'square' ? Math.floor(n + EPS_FT) : n);
const DIAGONAL_FT = FT * Math.SQRT2;

// SRD 5.2.1 1824-1825: "Diagonal movement can't cross the corner of a wall, a large tree, or
// another terrain feature that fills its space." A wall that touches the corner already blocks the
// line between the two centres (walls.js `crosses` counts touching). What is left is the two squares
// the step passes between (`G.beside`): neither may be filled at the walker's height, by something
// solid standing in it (a pillar, a statue, a tree) or by ground that cannot be entered (rock, deep
// water), or by ground that rises above a step. A creature is not a terrain feature, and a square
// with no floor at all, or one lower down, does not fill the space.
export function cornerFree(map, G, B, a, b, z) {
  for (const c of G.beside(a, b)) {
    const column = surfaces(map, c);
    if (!column.length) continue;
    const near = column.find((sf) => Math.abs(sf.z - z) <= STEP_MAX);
    if (near ? TILES[near.tile.t].cost === Infinity || B.solid(near.level.id, c) : column[0].z > z) return false;
  }
  return true;
}

// The ways a creature can move on a square map: a least-cost search over feet that need not be
// whole, by the diagonal rule. Each step from `stepsFn` is { h, max, flat, extra, diag, level }:
// `level` is an ordinary step into a neighbouring square on the same footing (on foot over no
// more than an ordinary rise, STEP_FREE, Difficult Terrain or not; or flying level), the only kind the 'real' rule's last square may be; a step up
// or down (stairs, a climb, a ladder, flying up or down) is paid in full. It costs
// `flat` times the length of the step (5 ft, or a diagonal's by the rule) plus `extra` feet (a
// climb's height), and no more than `max` may be spent getting there. Under 'alternate' the search
// keeps whether an odd number of diagonals has been taken (`parity` at the start), so a place can
// be reached two ways; the cheaper is kept, the first found among equals. Returns what hex.js's
// `reachable` returns (a Map of key -> { cost, prev, h }); `route` gives the way to each place.
const ROUTES = new WeakMap();
function squareSearch(start, budget, stepsFn, rule, parity) {
  const alt = rule === 'alternate', state = (k, p) => (alt ? `${k}|${p}` : k);
  const first = { cost: 0, h: start, p: parity, back: null, diag: false };
  const states = new Map([[state(key(start), parity), first]]);
  let seq = 0;
  const heap = [{ node: first, seq: seq++ }];
  const before = (a, b) => below(a.node.cost, b.node.cost) || (!below(b.node.cost, a.node.cost) && a.seq < b.seq);
  const push = (node) => { let i = heap.push({ node, seq: seq++ }) - 1; while (i > 0) { const q = (i - 1) >> 1; if (!before(heap[i], heap[q])) break; [heap[q], heap[i]] = [heap[i], heap[q]]; i = q; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && before(heap[l], heap[m])) m = l; if (r < heap.length && before(heap[r], heap[m])) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; }
    }
    return top.node;
  };
  while (heap.length) {
    const cur = pop();
    if (cur.stale) continue;
    for (const st of stepsFn(cur.h)) {
      const lim = Math.min(budget, st.max ?? budget);
      if (!below(cur.cost, lim)) continue;                                      // nothing left to move with
      const len = !st.diag ? FT : rule === 'real' ? DIAGONAL_FT : alt && cur.p ? 2 * FT : FT;
      let c = cur.cost + st.flat * len + st.extra;
      if (below(lim, c)) { if (rule !== 'real' || !st.level) continue; c = lim; }   // 'real': the last step on the flat takes what is left
      else if (c > lim) c = lim;                                                // the same, but for rounding
      const p = alt && st.diag ? 1 - cur.p : cur.p, k = state(key(st.h), p), old = states.get(k);
      if (old && !below(c, old.cost)) continue;
      if (old) old.stale = true;
      const node = { cost: c, h: st.h, p, back: cur, diag: !!st.diag };
      states.set(k, node);
      push(node);
    }
  }
  const best = new Map();
  for (const node of states.values()) { const k = key(node.h), had = best.get(k); if (!had || below(node.cost, had.cost)) best.set(k, node); }
  const out = new Map();
  for (const [k, node] of best) out.set(k, { cost: node.cost, prev: node.back ? key(node.back.h) : null, h: node.h });
  ROUTES.set(out, (k) => {
    const steps = [];
    for (let n = best.get(k); n?.back; n = n.back) steps.unshift({ h: n.h, cost: n.cost, diag: n.diag, ...(alt ? { p: n.p } : {}) });
    return steps;
  });
  return out;
}
// The way to the place `k` that `moveOptions` found, from the first step: [{ h, cost }] with the
// feet spent by each step's end (and, under 'alternate', `p`: whether an odd number of diagonals
// has then been taken).
export function route(reach, k) {
  const f = ROUTES.get(reach);
  return f ? f(k) : pathTo(reach, k).map((h) => ({ h, cost: reach.get(key(h)).cost }));
}

// Map of position key -> {cost, prev, canStop, h} that this creature can move to right now.
// Walking steps onto surfaces in neighbouring columns; a bigger rise or drop is a climb; a ladder
// or the like joins two places; and a creature that can fly moves through the air in 5 ft steps.
export function moveOptions(s, e) {
  const walk = e && up(e) ? speedOf(s, e) : 0, flying = !!e && aloft(s, e), flySpeed = flying ? speedOf(s, e, 'fly') : 0;
  if (!e || !up(e) || (walk === 0 && !flying)) return new Map();
  const enc = s.encounter, fighting = inFight(s, e.id);
  if (fighting && current(s) !== e.id) return new Map();
  const map = s.map, G = gridOf(map), B = barriers(map), others = living(s).filter((o) => o.id !== e.id);
  // The surfaces of each column are looked up many times over; keep them for the length of this search.
  const columns = new Map(), columnOf = (h) => { const k = h.q * 100003 + h.r; let c = columns.get(k); if (!c) columns.set(k, c = surfaces(map, h)); return c; };
  const walled_ = map.walls.length > 0 || map.objects.length > 0, tiers = map.levels.map((l) => l.z);
  const inWay = (h, test) => others.some((o) => overlapAt(o, o.pos, e, h, G) && test(o));
  // SRD "Moving around Other Creatures": an ally, an Incapacitated or Tiny creature, or one two sizes
  // larger or smaller can be passed through; any other creature's space but a Tiny one or an ally's
  // is Difficult Terrain. Nobody ends a move in an occupied space (canStop, below).
  const rank = (x) => SIZE_ORDER.indexOf(x.size ?? 'medium');
  const passable = (o) => !hostile(o, e) || !up(o) || incapacitated(o) || o.size === 'tiny' || Math.abs(rank(o) - rank(e)) >= 2;
  const blocks = (h) => inWay(h, (o) => !passable(o)), crowded = (h) => inWay(h, (o) => hostile(o, e) && o.size !== 'tiny');
  // Ground a spell made Difficult Terrain (terrain.js: Ice Storm, Grease). Walking only: a flyer is not on the ground.
  const spelled = terrainsOf(s).length ? (h) => difficultAt(s, h) : () => false;
  const big = shapeOf(e, G).length > 1, tall = sizeOf(e).height;
  // A big creature moves as one: every part of it must have somewhere to go and no wall to cross.
  const bodyFits = (from, h, levelId) => !big || (fitsOn(map, e, h, B) && footprint(e, from, G).every((f, i) => i === 0 || !B.blocked(levelId, f, footprint(e, h, G)[i])));
  const onHazard = (levelId, h) => (big ? footprint(e, h, G) : [h]).some((f) => hazards.has(`${levelId}|${col(f)}`));
  // A diagonal step on squares, by every part of the creature, passes no corner (cornerFree).
  const square = G.kind === 'square';
  const diagonal = (from, n) => square && G.beside(from, n).length > 0;
  const cornersFree = (from, h) => (big ? footprint(e, from, G).map((f, i) => [f, footprint(e, h, G)[i]]) : [[from, h]]).every(([a, b]) => cornerFree(map, G, B, a, b, from.z));
  // Acrobatic Movement (`surfaces`): with no armour or Shield, across water without falling in. It may
  // not end its move there: the engine has nowhere for a creature in water to be. Vertical surfaces are
  // climbed as anyone climbs (the maps have heights, not wall faces).
  const acrobat = !!e.feats?.some((f) => f.surfaces) && (e.armour ?? 'none') === 'none' && !e.shield, wet = new Set();
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
    if (def.triggers?.some((t) => t.on === 'enter' && t.effects && t.from.includes(o.state)) && (e.side !== 'party' || !def.states[o.state].hidden)) hazards.add(`${o.level}|${col(o.at)}`);
  }
  const steps = (from) => {
    const out = [], here = ground(map, from)?.level;
    // A trap the party has spotted can be stepped onto on purpose, but no path runs across it.
    if (here && from !== e.pos && onHazard(here.id, from)) return out;
    if (here && walk > 0) {
      for (const n of G.neighbors(from)) {
        if (fighting && !enc.arena[col(n)]) continue;                     // the arena is locked
        const column = columnOf(n);
        for (const sf of column) {
          const dz = sf.z - from.z, up_ = Math.abs(dz), water = acrobat && sf.tile.t === 'water', terrain = water ? 1 : TILES[sf.tile.t].cost;
          if (terrain === Infinity || B.solid(sf.level.id, n)) continue;
          const h = { q: n.q, r: n.r, z: sf.z };
          if (water) wet.add(key(h));
          if (e.side !== 'party' && onHazard(sf.level.id, h)) continue;                      // a lair's own never step on its traps
          if (!bodyFits(from, h, here.id)) continue;
          if (blocks(h)) continue;
          const diag = diagonal(from, n);
          if (diag && !cornersFree(from, h)) continue;
          if (up_ <= STEP_MAX) {                                             // walking: level going, a step, or stairs
            if (B.blocked(here.id, from, n) || (sf.level !== here && B.blocked(sf.level.id, from, n))) continue;   // a wall or a shut door
            const flat = Math.max(terrain, up_ > STEP_FREE || crowded(h) || spelled(h) ? 2 : 1);                     // Difficult Terrain does not stack
            out.push({ h, cost: flat * FT, max: limit.walk, flat, extra: 0, diag, level: up_ <= STEP_FREE });     // a rise the cost does not count
          } else if (climbs) {
            // Climbing: up a face to a ledge, or down from one. The way must be open above the lower
            // of the two places, and only a wall at the top counts: a wall below is what is climbed.
            const lowCol = dz > 0 ? columnOf(from) : column, lowZ = Math.min(sf.z, from.z), highZ = Math.max(sf.z, from.z);
            if (lowCol.some((x) => x.z > lowZ && x.z < highZ + HEADROOM)) continue;
            const top = dz > 0 ? sf.level : here;
            if (B.blocked(top.id, from, n)) continue;
            const extra = up_ * (climbSpeed > 0 ? 1 : 2);
            out.push({ h, cost: terrain * FT + extra, max: limit.climb, flat: terrain, extra, diag });
          }
        }
      }
      // A ladder, a rope, a climbable tree: something that joins this place to another.
      for (const o of map.objects) {
        if (!o.to || !objectDef(o).connects) continue;
        const a = { q: o.at.q, r: o.at.r, z: objectZ(s, o) }, b = landing(map, o.to, o.to.z ?? 0);
        const h = key(a) === key(from) ? b : b && key(b) === key(from) ? a : null;
        if (!h || (fighting && !enc.arena[col(h)]) || blocks(h) || !fitsOn(map, e, h, B)) continue;
        const cost = Math.max(FT, Math.abs(a.z - b.z)) * (climbSpeed > 0 ? 1 : 2);
        out.push({ h, cost, max: limit.climb, flat: 0, extra: cost, diag: false });
      }
    }
    if (flying) {
      // Through the air: any of the grid's directions, level, up or down 5 ft, or straight up or down.
      const around = G.neighbors(from), top = Math.max(tiers.at(-1), ...tiers, e.pos.z) + FLY_CEILING;
      for (const dz of [0, FT, -FT]) for (let i = dz ? -1 : 0; i < G.DIRS.length; i++) {
        const n = i < 0 ? from : around[i];
        if (from.z + dz > top || (fighting && !enc.arena[col(n)])) continue;
        const h = { q: n.q, r: n.r, z: from.z + dz }, column = columnOf(n), room = airspace(map, h, column, tall);
        if (!room || (big && footprint(e, h, G).some((f, i) => i > 0 && !airspace(map, f, columnOf(f), tall)))) continue;
        // No passing through a floor on the way up or down.
        if (dz > 0 && column.some((sf) => sf.z > from.z && sf.z <= h.z)) continue;
        if (dz < 0 && column.some((sf) => sf.z > h.z && sf.z <= from.z)) continue;
        if (room.landed && (B.solid(room.landed.level.id, n) || (e.side !== 'party' && hazards.has(`${room.landed.level.id}|${col(n)}`)))) continue;
        if (walled_ && n !== from && [from.z, h.z].some((z) => wallsAt(map, z).some((l) => B.blocked(l.id, from, n, z - l.z >= FT ? 'tall' : 'move')))) continue;
        if (blocks(h)) continue;
        const diag = diagonal(from, n);
        if (diag && !cornersFree(from, h)) continue;
        const flat = crowded(h) ? 2 : 1;
        out.push({ h, cost: flat * FT, max: limit.fly, flat, extra: 0, diag, level: dz === 0 });
      }
    }
    return out;
  };
  // Hexes: hex.js's search, as it always was. Squares: the search by the diagonal rule.
  const reach = square ? squareSearch(e.pos, budget, steps, s.settings.diagonals ?? 'real', fighting ? (enc.budget.diagonals | 0) & 1 : 0) : reachable(e.pos, budget, steps);
  const start = key(e.pos);
  // Nobody stops in another creature's space, except that a few Tiny ones can share a hex.
  const share = sizeOf(e).shares;
  for (const [k, v] of reach) {
    const there = others.filter((o) => overlapAt(o, o.pos, e, v.h, G));
    v.canStop = k !== start && !wet.has(k) && (!there.length || (!!share && there.length < share && there.every((o) => sizeOf(o).shares)));
  }
  return reach;
}

// ---------- regions ----------
export function revealRegion(s, r, ev) {
  r.revealed = true;
  ev.push({ type: 'region', region: r.id, name: r.name });
  if (!s.encounter) return;
  for (const e of living(s)) {                          // whoever was waiting in there is in the fight now
    if (e.hidden || inFight(s, e.id) || !s.encounter.arena[col(e.pos)]) continue;
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
    for (const n of gridOf(s.map).neighbors(e.pos)) for (const sf of surfaces(s.map, n)) {
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
export const objectShown = (map, o) => !objectDef(o).states[o.state].hidden && objectHexes(o, gridOf(map)).some((h) => !!map.levels.find((l) => l.id === o.level)?.tiles[col(h)] && shown(map, o.level, h));
export const objectOf = (s, id, ctx = null) => {
  const o = s.map.objects.find((x) => x.id === id);
  return (o && (!ctx || ctx.role === 'dm' || ((sightRule(s) === 'rooms' ? objectShown(s.map, o) : objectKnown(s, o)) && pileOpen(o))) && o) || fail('No such object.');
};
export const objectName = (o) => o.name ?? objectDef(o).name;
export const objectZ = (s, o) => { const level = s.map.levels.find((l) => l.id === o.level); return level.z + (level.tiles[col(o.at)]?.h ?? 0); };
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
    if (objectSegment(x, gridOf(s.map)) || !objectDef(x).states[st].blocks.includes('move')) continue;
    !living(s).some((c) => col(c.pos) === col(x.at) && c.pos.z === objectZ(s, x)) || fail(`Someone is standing where the ${objectName(x).toLowerCase()} would be.`);
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
// Close enough to use it: beside a door's line, or on or next to a thing's hex, on its level.
// Everything by the map's grid (review of #262). On squares, a door on a square's side is in reach
// from either of its two squares or any square next to one, and a thing from its square or next to
// it, measured by the table rule `squareRange` from any square of the user's space; a traced door
// (`seg`) within 5 ft of its line, as on hexes. Hex maps as before.
// A thing in a cell is also out of reach behind a wall or a shut door (review of #291: a pile picked up through
// a wall): the same test as for handing something to a creature (`walled`: not Total Cover), from any part of
// the user to the thing's cell, unless the user stands on it. A door is on its wall, so that is not asked of one.
export function nearObject(s, e, o) {
  const level = s.map.levels.find((l) => l.id === o.level), z = level.z + (level.tiles[col(o.at)]?.h ?? 0);
  if (!ground(s.map, e.pos) || Math.abs(e.pos.z - z) > STEP_MAX) return false;
  const G = gridOf(s.map), seg = objectSegment(o, G);
  let near;
  if (G.kind === 'square' && !(seg && o.seg)) {
    const m = measure(s, G), cells = seg ? objectHexes(o, G) : [o.at];
    near = footprint(e, e.pos, G).some((p) => cells.some((h) => m(p, h) <= 1));
  } else near = seg ? distToSegment(G.center(e.pos), seg) <= FT + 1e-9 : G.dist(e.pos, o.at) <= 1;     // within 5 ft
  if (!near || seg || footprint(e, e.pos, G).some((p) => p.q === o.at.q && p.r === o.at.r)) return near;
  return unblocked(s, e, { size: 'tiny', pos: { q: o.at.q, r: o.at.r, z } });
}

// ---------- piles: what lies on the ground (E17) ----------
// A pile is a map object of the kind `pile` whose placed record has `contents`, a list of what lies there:
// `{ id, name }` for an item known by name (as `gear` holds them), or `{ id, item, base?, type?, spell?, charges? }`
// for a magic item of the pack (a sheet's item entry without its key, `equipped` or `attuned`). Dropped by `drop`,
// taken by `pickUp`, laid down by the DM with `mapEdit`. The map document's linter (map.js) does not read
// `contents`, so what is not well formed is left out here, and so never offered, sent or picked up.
export const PILE_MAX = 40;
const CONTENT_KEYS = ['id', 'name', 'item', 'base', 'type', 'spell', 'charges'];
export const isPile = (o) => objectDef(o)?.kind === 'pile';
const wellFormed = (x) => !!x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).every((k) => CONTENT_KEYS.includes(k)) &&
  typeof x.id === 'string' && /^[a-z0-9]{1,12}$/.test(x.id) &&
  (x.item === undefined ? typeof x.name === 'string' && !!x.name.trim() && x.name.length <= 60 && ['base', 'type', 'spell', 'charges'].every((k) => x[k] === undefined)
    : x.name === undefined && typeof x.item === 'string' && Object.hasOwn(CONTENT.items, x.item) &&
      (x.charges === undefined || (Number.isInteger(x.charges) && x.charges >= 0 && x.charges <= (CONTENT.items[x.item].charges?.max ?? -1))));
export function pileContents(o) {
  if (!isPile(o) || !Array.isArray(o.contents)) return [];
  const seen = new Set();
  return o.contents.filter((x) => wellFormed(x) && !seen.has(x.id) && seen.add(x.id)).slice(0, PILE_MAX);
}
// What a creature the party does not know of drops goes onto a pile of its own, marked `by` (its id), beside any pile
// the party sees in that cell (review of #291): so a pile the party sees, its ids, its room and what happens to it
// never depend on what they can't see. Players are not sent a marked pile and can't name it (`pileOpen`); the DM sees
// every record. `seePiles` takes the mark off when the party knows of that creature, or it is gone from the map,
// and then the pile joins the cell's open pile (or becomes it).
export const pileOpen = (o) => !isPile(o) || o.by === undefined;
export const openContents = (o) => (pileOpen(o) ? pileContents(o) : []);
// After every action (features.js, watch).
export function seePiles(s) {
  for (const o of [...s.map.objects]) {
    if (!isPile(o) || o.by === undefined) continue;
    const e = Object.hasOwn(s.entities, o.by) ? s.entities[o.by] : null;
    if (e && unknown(s, e)) continue;
    if (s.map.seen?.objects) delete s.map.seen.objects[o.id];
    const open = pileAt(s, o.level, o.at);
    if (!open) { delete o.by; o.id = pileId(s, o.level, o.at); continue; }
    if (!Array.isArray(open.contents)) open.contents = [];
    for (const x of Array.isArray(o.contents) ? o.contents : []) {
      if (open.contents.length >= PILE_MAX) break;
      let n = 1;
      while (open.contents.some((y) => y?.id === `c${n}`)) n++;
      open.contents.push({ ...x, id: `c${n}` });
    }
    s.map.objects.splice(s.map.objects.indexOf(o), 1);
  }
}
// The id of a new pile: from where it lies (there is one open pile to a cell), so that it says nothing of other
// piles, as a count would (review of #291). A pile dropped unseen gets one apart (`-h1`), never the open one's.
export function pileId(s, level, h, by = null) {
  const base = `pile-${level}-${h.q}_${h.r}`.replace(/[^A-Za-z0-9_-]/g, '');
  let id = by ? `${base}-h1` : base, n = 1;
  while (s.map.objects.some((x) => x.id === id)) id = by ? `${base}-h${++n}` : `${base}-${++n}`;
  return id;
}
// What a thing on the ground is called: its name, or the magic item's ("Spear +1").
export const contentName = (x) => (x.item !== undefined ? itemName(CONTENT.items[x.item], x) : x.name.trim());
// The open pile in this cell of this level, or with `by` the one that creature dropped there unseen, if there is one.
export const pileAt = (s, level, h, by = null) => s.map.objects.find((o) => isPile(o) && o.level === level && o.at.q === h.q && o.at.r === h.r && (o.by ?? null) === by) ?? null;

// Can `e` stand at `to`? Ground or air it fits in, a body that fits, not the hex it is on, and in
// the arena if it is fighting. '' if so, else why not.
export function roomAt(s, e, to) {
  if (!airspace(s.map, to, undefined, sizeOf(e).height)) return 'Nothing can stand there.';
  if (!fitsOn(s.map, e, to, barriers(s.map))) return `${e.name} does not fit there.`;
  if (inFight(s, e.id) && footprint(e, to, gridOf(s.map)).some((f) => !s.encounter.arena[col(f)])) return 'The arena is locked until the fight ends.';
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
  const level = s.map.levels.find((l) => l.id === o.level), G = gridOf(s.map);
  const near = objectHexes(o, G).filter((h) => level.tiles[col(h)] && shown(s.map, o.level, h)).sort((x, y) => measure(s, G)(x, e.pos) - measure(s, G)(y, e.pos))[0];
  return !!near && measure(s, G)(near, e.pos) * FT <= feet && clear(s, e.pos, { q: near.q, r: near.r, z: level.z + (level.tiles[col(near)].h ?? 0) });
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
  const n = area.size / FT, shape = area.shape, G = gridOf(s.map);
  if (G.kind === 'square') return squareLayout(s, e, area, range, aim);
  if (shape === 'emanation') return { hexes: G.range(e.pos, n).filter((h) => key(h) !== key(e.pos)), origin: e.pos, high: (t) => gap(s, e.pos, t.pos) <= n };
  if (!aim) return null;
  const aimZ = aim.z ?? landing(s.map, aim, e.pos.z)?.z ?? e.pos.z;
  if (shape === 'cone') return { hexes: G.cone(e.pos, aim, n), origin: e.pos, high: (t) => gap(s, e.pos, t.pos) <= n };
  if (shape === 'sphere' || shape === 'cylinder') {
    const origin = { q: aim.q, r: aim.r, z: aimZ }, tall = area.height ?? area.size;
    const high = shape === 'cylinder' ? (t) => t.pos.z > origin.z - FT / 2 && t.pos.z <= origin.z + tall : (t) => gap(s, origin, t.pos) <= n;
    return { hexes: G.range(aim, n), origin, high };
  }
  const front = Math.max(...footprint(e, e.pos, G).map((f) => G.along(e.pos, aim, f))) + FT / 2;      // the edge of its own space
  if (shape === 'line') {
    if (range > 0 || G.dist(aim, e.pos) === 0) return null;
    const flat = G.along(e.pos, aim, aim), slope = flat > 0 ? (aimZ - e.pos.z) / flat : 0;
    const length = area.size / Math.hypot(1, slope), half = (area.width ?? FT) / 2;
    const hexes = G.band(e.pos, aim, front, front + length, half);
    const high = (t) => { const z = e.pos.z + slope * G.along(e.pos, aim, t.pos); return z + half > t.pos.z && z - half < t.pos.z + sizeOf(t).height; };
    return { hexes, origin: e.pos, high };
  }
  if (shape === 'cube') {
    const size = area.size, half = size / 2;
    if (!(range > 0)) {
      if (G.dist(aim, e.pos) === 0) return null;
      const base = e.pos.z;
      return { hexes: G.band(e.pos, aim, front, front + size, half), origin: e.pos, high: (t) => t.pos.z < base + size && t.pos.z + sizeOf(t).height > base };
    }
    const away = G.dist(aim, e.pos) === 0 ? { q: aim.q + 1, r: aim.r } : { q: 2 * aim.q - e.pos.q, r: 2 * aim.r - e.pos.r };
    const origin = { q: aim.q, r: aim.r, z: aimZ };
    return { hexes: G.band(aim, away, -FT / 2, size - FT / 2, half), origin, high: (t) => t.pos.z < aimZ + size && t.pos.z + sizeOf(t).height > aimZ };
  }
  return null;
}

// Areas on squares (docs/specs/square-grid.md, Decision 6 and the S7 build notes): a square is in an
// area when its centre is inside the real shape; for a Sphere, a Cylinder and an Emanation the table
// rule `areaFill` may count squares as range is counted instead. What starts from the creature
// starts from its whole space, so a Large or bigger caster is measured from all its squares:
//   cone      its point of origin is the middle of the caster's space (a Medium caster's own square's
//             centre), toward the centre of the square aimed at; the caster's space is not in it.
//   line      from the edge of the caster's space where the aim leaves it, `size` feet long and
//             `width` wide, along the line from the middle of its space to the square aimed at.
//   cube      square to the grid, `size` feet a side. From Self: outside the caster's space and
//             touching it, the block that lies most nearly toward the aim. With a range: the block
//             that has the square aimed at on its side and lies most nearly away from the caster.
//   sphere, cylinder   centred on the centre of the square aimed at, which is in it.
//   emanation the squares round the caster's space, which is not in it.
// Heights are as on hexes (within `size` up or down, or the shape's own height). `high(t, f)` takes
// the square `f` of `t` that is in the area, so a big creature counts by the part that is in it;
// `from` are the squares a wall must not stand between: the caster's own for what starts from it.
export const AREA_FILLS = ['round', 'grid'];
function squareLayout(s, e, area, range, aim) {
  const n = area.size / FT, shape = area.shape, fill = s.settings?.areaFill ?? 'round', G = gridOf(s.map);
  const own = footprint(e, e.pos, G), box = boxOf(own), mid = boxMiddle(box);
  const within = (o) => (t) => rise(t.pos.z - o.z) <= n;
  if (shape === 'emanation') return { hexes: squareAround(box, n, fill), origin: e.pos, high: within(e.pos), from: own };
  if (!aim) return null;
  const aimZ = aim.z ?? landing(s.map, aim, e.pos.z)?.z ?? e.pos.z;
  const aimed = 2 * aim.q !== mid[0] || 2 * aim.r !== mid[1];
  if (shape === 'cone') return aimed ? { hexes: squareCone(mid, aim, area.size, box), origin: e.pos, high: within(e.pos), from: own } : null;
  if (shape === 'sphere' || shape === 'cylinder') {
    const origin = { q: aim.q, r: aim.r, z: aimZ }, tall = area.height ?? area.size;
    const high = shape === 'cylinder' ? (t) => t.pos.z > origin.z - FT / 2 && t.pos.z <= origin.z + tall : within(origin);
    return { hexes: squareDisc(aim, n, fill), origin, high, from: [origin] };
  }
  if (shape === 'line') {
    if (range > 0 || !aimed) return null;
    const flat = squareAlong(mid, aim, aim), slope = flat > 0 ? (aimZ - e.pos.z) / flat : 0;
    const length = area.size / Math.hypot(1, slope), half = (area.width ?? FT) / 2;
    const high = (t, f) => { const z = e.pos.z + slope * squareAlong(mid, aim, f); return z + half > t.pos.z && z - half < t.pos.z + sizeOf(t).height; };
    return { hexes: squareStrip(mid, aim, box, length, half), origin: e.pos, high, from: own };
  }
  if (shape === 'cube') {
    const size = area.size, side = size / FT;
    if (!Number.isInteger(side) || side < 1) return null;
    if (!(range > 0)) {
      if (!aimed) return null;
      const base = e.pos.z, touches = (b) => b.q0 <= box.q1 + 1 && b.q1 >= box.q0 - 1 && b.r0 <= box.r1 + 1 && b.r1 >= box.r0 - 1;
      const apart = (b) => b.q0 > box.q1 || b.q1 < box.q0 || b.r0 > box.r1 || b.r1 < box.r0;
      const hexes = squareBlock(mid, [2 * aim.q - mid[0], 2 * aim.r - mid[1]], side, box.q0 - side, box.q1 + 1, box.r0 - side, box.r1 + 1, (b) => touches(b) && apart(b));
      return hexes && { hexes, origin: e.pos, high: (t) => t.pos.z < base + size && t.pos.z + sizeOf(t).height > base, from: own };
    }
    const at = [2 * aim.q, 2 * aim.r], away = aimed ? [at[0] - mid[0], at[1] - mid[1]] : [1, 0];
    const onSide = (b) => aim.q === b.q0 || aim.q === b.q1 || aim.r === b.r0 || aim.r === b.r1;
    const origin = { q: aim.q, r: aim.r, z: aimZ };
    const hexes = squareBlock(at, away, side, aim.q - side + 1, aim.q, aim.r - side + 1, aim.r, onSide);
    return hexes && { hexes, origin, high: (t) => t.pos.z < aimZ + size && t.pos.z + sizeOf(t).height > aimZ, from: [origin] };
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
  if (fromSelf) (hex && gridOf(s.map).dist(hex, e.pos) > 0) || fail(`Pick a direction for ${name}.`);
  else if (shape !== 'emanation') {
    hex || fail(`Pick where ${name} goes off.`);
    const at = hex.z !== undefined ? hex : landing(s.map, hex, e.pos.z) ?? hex, G = gridOf(s.map);
    // On squares range is counted from the nearest of the caster's squares (SRD 1826-1829).
    const d = G.kind === 'square' ? Math.min(...footprint(e, e.pos, G).map((f) => gap(s, at, f))) : gap(s, at, e.pos);
    if (d * FT > range) fail(`That is ${ft(d)} away. ${name} reaches ${range} ft.`);
  }
  const l = layout(s, e, area, range, hex) || fail(`The engine cannot lay out ${name} there.`);
  const hexes = l.hexes.filter((h) => hasColumn(s.map, h)), keys = new Set(hexes.map(key)), origin = l.origin, G = gridOf(s.map);
  const targets = G.kind === 'square'
    ? living(s).filter((t) => (!area.exceptCaster || t.id !== e.id) && footprint(t, t.pos, G).some((f) => keys.has(col(f)) && l.high(t, f)) && footprint(t, t.pos, G).some((f) => l.from.some((o) => clear(s, o, f))))
    : living(s).filter((t) => (!area.exceptCaster || t.id !== e.id) && footprint(t, t.pos, G).some((f) => keys.has(col(f))) && l.high(t) && footprint(t, t.pos, G).some((f) => clear(s, origin, f)));      // a wall shelters what is behind it
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
// `G` is the map's grid (hexes if not given), as for `along`.
export function trailOf(path, away = null, G = HEX) {
  const t = path.map((h) => ({ q: h.q, r: h.r }));
  const a = t.length > 1 ? t.at(-2) : away, b = t.at(-1);
  if (!a) return t;
  const wa = G.toWorld(a), wb = G.toWorld(b);
  let dx = wb.x - wa.x, dz = wb.z - wa.z;
  const n = Math.hypot(dx, dz);
  if (!n) return t;
  dx /= n; dz /= n;
  for (let i = 0; i < 12; i++) {
    const last = t.at(-1), lw = G.toWorld(last);
    let best = null, most = -Infinity;
    for (const nb of G.neighbors(last)) {
      const w = G.toWorld(nb), p = (w.x - lw.x) * dx + (w.z - lw.z) * dz;
      if (p > most + 1e-9) { most = p; best = nb; }
    }
    t.push(best);
  }
  return t;
}
// How far a place is from the trail, and how far back along it.
export function along(trail, h, G = HEX) {
  let d = Infinity, i = 0;
  trail.forEach((p, j) => { const x = G.dist(p, h); if (x < d) { d = x; i = j; } });
  return { d, i };
}

// A fight is starting in `arena`. Everyone who was following a party member in it, and is not in
// it already, is brought up to the nearest free place behind its leader that it could have walked
// to (a path exists, and the place is at most CATCH_UP feet of walking from the leader).
// `walked` is { id, path } for a leader whose walk started the fight: the path from where it stands back.
export function catchUp(s, arena, walked, ev) {
  const G = gridOf(s.map);
  const inArena = (e) => !!arena[col(e.pos)];
  const party = new Set(living(s).filter((e) => e.side === 'party' && inArena(e)).map((e) => e.id));
  const pending = living(s).filter((e) => e.follow && e.side === 'party' && !inArena(e)).sort(byMarch);
  const foes = living(s).filter((o) => o.side !== 'party' && inArena(o) && !unseenAt(s.map, o.pos));
  for (;;) {
    const f = pending.find((x) => party.has(x.follow));
    if (!f) return;
    pending.splice(pending.indexOf(f), 1);
    const leader = s.entities[f.follow];
    const foe = foes.slice().sort((a, b) => G.dist(a.pos, leader.pos) - G.dist(b.pos, leader.pos))[0];
    const trail = trailOf(walked?.id === leader.id ? walked.path : [leader.pos], foe?.pos ?? null, G);
    const mine = moveOptions(s, f), theirs = moveOptions(s, leader);
    let best = null, bestKey = null;
    for (const [k, v] of mine) {
      if (!v.canStop || !arena[col(v.h)]) continue;
      const lc = theirs.get(k)?.cost;
      if (lc === undefined || lc > CATCH_UP) continue;
      const at = along(trail, v.h, G), rank = [at.d, at.i, lc, v.cost];
      if (!best || less(rank, bestKey)) { best = { k, v }; bestKey = rank; }
    }
    if (!best || !up(f)) { unfollow(s, f, ev, "couldn't keep up"); continue; }
    f.pos = best.v.h;
    ev.push({ type: 'moved', id: f.id, path: route(mine, best.k).map((x) => x.h), caughtUp: true });
    lookAround(s, ev, [f]);
    party.add(f.id);
  }
}

