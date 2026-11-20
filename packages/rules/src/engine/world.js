// Where things are (engine.js): flying and fitting, where a creature can move, regions shown and
// objects set, hidden creatures revealed, joining a fight, finding hidden things, aiming areas and
// choosing creatures, and the party walking in marching order.
import { HEX, gridOf, col, key, pathTo, reachable, boxMiddle, boxOf, squareAlong, squareAround, squareBlock, squareCone, squareDisc, squareStrip } from '../grid.js';
import { d20Faces, die } from '../rng.js';
import { CONTENT, SPELLS, TILES } from '../content/index.js';
import { actionProfile, CUBE_AIM_MAX, loadOf, scaleSteps, targetCount, WORK } from '../effects.js';
import { apart, apartAt, concealed, footprint, FT, gap, ground, hasColumn, HEADROOM, landing, measure, overlapAt, regionAt, rise, shapeOf, shown, sizeOf, STEP_FREE, STEP_MAX, surfaces, under, unseenAt, WALL_HEIGHT } from '../space.js';
import { SIZES } from '../content/sizes.js';
import { difficultAt, terrainsOf } from '../terrain.js';
import { objectKnown, regionsInSight, sightRule, unknown } from '../vision.js';
import { hiddenFrom } from '../sight.js';
import { holds, zonesOf } from '../zones.js';
import { barriers, distToSegment, objectDef, objectHexes, objectSegment } from '../walls.js';
import { itemName } from '../derive.js';
import { effectsOf, restamp } from '../durations.js';
import { incapacitated, modifiers, speedOf } from '../modifiers.js';
import { castAbilOf, clear, current, ent, EXPLORE_BUDGET, fail, FLY_CEILING, ft, hostile, inFight, less, living, mod, mountOf, riderOf, RuleError, spellStats, steering, turnBudget, unblocked, up, walled } from './shared.js';

// ---------- grapples ----------
// The holds `e` has on others (docs/specs/grapple-shove.md, Decision 2): each lives on the held creature's `cond.grappled.holds`,
// and the grappler carries nothing, so this is a pass over the creatures, in the order they are kept. [{ t, hold }].
export function holdsOf(s, e) {
  const out = [];
  for (const t of Object.values(s.entities)) for (const h of t.cond?.grappled?.holds ?? []) if (h.by === e.id) out.push({ t, hold: h });
  return out;
}
// What a mover drags (docs/specs/grapple-shove.md, Decision 6): the creatures it holds, and those held by the rider its mount carries
// (the rider moves as its mount does). [{ g, t, hold }]: `g` the grappler, `t` the held creature.
export function draggedBy(s, e) {
  const r = riderOf(s, e);
  return [...holdsOf(s, e), ...(r ? holdsOf(s, r) : [])].map(({ t, hold }) => ({ g: s.entities[hold.by], t, hold }));
}
// The extra feet that each foot of the grappler's movement costs for dragging `t` (SRD Grappled, "Movable"): 1, unless `t` is Tiny
// or two or more sizes smaller than the grappler; or, with the Grappler feat (Fast Wrestler), the grappler's size or smaller; or none for
// a grappler with a trait `dragFree` (the bugbears' Abduct, the shambling mound's Engulf: "costing it no extra movement").
export function dragExtra(g, t) {
  if (CONTENT.monsters[g.tpl]?.traits?.some((x) => x.dragFree)) return 0;
  const gi = SIZE_ORDER.indexOf(g.size ?? 'medium'), ti = SIZE_ORDER.indexOf(t.size ?? 'medium');
  return ti === 0 || ti <= gi - 2 || (ti <= gi && (g.feats ?? []).some((f) => f.id === 'feat-grappler')) ? 0 : 1;
}

// ---------- forced moves and dragging ----------
// How far one step of a forced move (a push, a pull) goes: 5 ft, or on squares what the table's diagonal rule says a diagonal costs.
export function forcedStride(s, a, b, odd = false) {
  const G = gridOf(s.map), rule = s.settings.diagonals ?? 'real';
  return G.kind !== 'square' || !G.beside(a, b).length ? FT : rule === 'real' ? FT * Math.SQRT2 : rule === 'alternate' && odd ? 2 * FT : FT;
}
// The next step of a forced move of `t` away from (`sign` 1) or toward (-1) the point `from`: { h } the place it would go to, or { why }
// ('aloft': it stands on nothing; 'blocked': a wall, a drop, a creature or the arena's edge stops it). `left` feet of the move are left and
// `odd` is whether an odd number of diagonals has been taken (squares). Changes nothing: `push` (resolve.js) takes the step; a grappler's
// drag asks it first, so that it knows before it moves whether what it holds can follow.
export function forcedStep(s, t, from, sign, left = Infinity, odd = false) {
  const B = barriers(s.map), G = gridOf(s.map), square = G.kind === 'square', r0 = riderOf(s, t), here = ground(s.map, t.pos);
  if (!here) return { why: 'aloft' };
  const d0 = G.dist(t.pos, from), w = G.toWorld(t.pos), o = G.toWorld(from);
  let best = null;
  for (const n of G.neighbors(t.pos)) {
    if (G.dist(n, from) !== d0 + sign || (inFight(s, t.id) && !s.encounter.arena[col(n)])) continue;
    const sf = surfaces(s.map, n).find((x) => Math.abs(x.z - t.pos.z) <= STEP_FREE);
    if (!sf || TILES[sf.tile.t].cost === Infinity || B.solid(sf.level.id, n) || B.blocked(here.level.id, t.pos, n) || (sf.level !== here.level && B.blocked(sf.level.id, t.pos, n))) continue;
    const h = { q: n.q, r: n.r, z: sf.z };
    if (living(s).some((c) => c.id !== t.id && c.id !== r0?.id && overlapAt(c, c.pos, t, h, G)) || !fitsOn(s.map, t, h, B)) continue;
    if (square && below(left, forcedStride(s, t.pos, n, odd))) continue;                                                // not enough of the push left for this step
    if (square && !footprint(t, t.pos, G).every((f, j) => { const g = footprint(t, h, G)[j]; return !B.blocked(here.level.id, f, g) && cornerFree(s.map, G, B, f, g, t.pos.z); })) continue;     // every part: no wall, no corner
    const nw = G.toWorld(n), straight = ((nw.x - w.x) * (w.x - o.x) + (nw.z - w.z) * (w.z - o.z)) * sign;       // most nearly straight along the line from the source
    if (!best || straight > best.straight + 1e-9) best = { h, straight };
  }
  return best ? { h: best.h } : { why: 'blocked' };
}
// A pull is one grid step: 5 ft, or on squares by the real diagonal rule the 7.07 ft a diagonal is, so one step is taken whichever way it goes.
export const pullFeet = (s) => (gridOf(s.map).kind === 'square' && (s.settings.diagonals ?? 'real') === 'real' ? FT * Math.SQRT2 : FT);
// Is `t`, held by `g` with `hold`, beyond the hold's reach (as `settleHolds` measures it)?
export const beyond = (s, g, t, hold) => !!g && !t.dead && apart(s, g, t) * FT > hold.range;
// A copy of the game's creatures with `e` (and the rider it carries) put at `pos`: for asking what would be, changing nothing.
const placed = (s, e, pos) => {
  const entities = { ...s.entities, [e.id]: { ...e, pos } }, r = riderOf(s, e);
  if (r) entities[r.id] = { ...r, pos: { q: pos.q, r: pos.r, z: pos.z ?? 0 } };
  return { ...s, entities };
};
// `e` steps to `step`: could everything it holds follow? Plays the pulls in order, each creature taking its cell before the next is asked
// (two held creatures that need the same cell: the second can't), as `walk` pulls them. Changes nothing: it works on copies of the
// creatures. Returns { blocked } (the first creature that could not follow; a riding one is left to the DM, as `push` does) or
// { next }, the game as it would stand (the grappler at `step`, what it holds pulled), to ask the step after it from.
export function dragStep(s, e, step) {
  let cur = placed(s, e, step);
  for (const { t, hold } of draggedBy(s, e)) {
    for (let i = 0; i < 4; i++) {
      const g = cur.entities[hold.by], now = cur.entities[t.id];
      if (!beyond(cur, g, now, hold)) break;
      const f = mountOf(cur, now) ? { why: 'mount' } : forcedStep(cur, now, g.pos, -1, pullFeet(cur), false);
      if (!f.h) return { blocked: t };
      cur = placed(cur, now, f.h);
    }
    if (beyond(cur, cur.entities[hold.by], cur.entities[t.id], hold)) return { blocked: t };
  }
  return { next: cur };
}
// The first creature `e` holds that could not follow it to `step` (changes nothing), or null.
export const dragBlocked = (s, e, step) => (draggedBy(s, e).length ? dragStep(s, e, step).blocked ?? null : null);

// ---------- movement ----------

// Can this creature stay up without anything under it? It needs a Fly Speed that is not 0, and
// must not be Prone or Incapacitated unless it can hover.
export const aloft = (s, e) => (up(e) && speedOf(s, e, 'fly') > 0 && (!!e.hover || !(e.cond.prone || incapacitated(e)))) || ridesAloft(s, e);
// A rider is held up by its mount (stage C6a): on a mount that stays up, it does not fall.
const ridesAloft = (s, e) => { const m = mountOf(s, e); return !!m && m.pos.z === e.pos.z && m.pos.q === e.pos.q && m.pos.r === e.pos.r && !m.riding && aloft(s, m); };
// The other of a riding pair (its rider, or the mount it rides), or null: the two share one space, so neither is in
// the other's way (stage C6a).
export const partnerOf = (s, e) => riderOf(s, e) ?? mountOf(s, e);
// A mount that moves takes its rider with it: the rider stands on the mount's anchor (Decision 8, "Moving together").
export function carry(s, m) {
  const r = riderOf(s, m);
  if (r) r.pos = { q: m.pos.q, r: m.pos.r, z: m.pos.z ?? 0 };
  return r;
}
// Where a rider comes off its mount: gets down (`dismount`, stage C6a), falls off (stage C6b) or is put off it (it grew,
// its mount shrank). A space it can stand in by its own size, within 5 ft of any part of the mount, with no wall
// between, on ground within a step of the mount's, in the arena if it is fighting, not the mount's own space, and not
// held by a creature its side knows of. A party rider chooses by what the party knows, so the choice is the same with
// or without a creature it does not know of (hidden-information.md, section 5): `want` if given (the nearest if not).
// Returns { p, lurker } (`lurker`: a creature the rider did not know of in that space), or null when there is none
// (or `want` is not such a space). Nearest by distance from the rider, then by q and r, so that it replays.
export function landingFits(s, e, m, p) {
  const G = gridOf(s.map), B = barriers(s.map), body = { ...e, riding: undefined };
  return !!p && Math.abs(p.z - m.pos.z) <= STEP_MAX && TILES[ground(s.map, p)?.tile.t]?.cost < Infinity && fitsOn(s.map, body, p, B) &&
    !!airspace(s.map, p) && apartAt(s, m, m.pos, body, p) <= 1 && !overlapAt(m, m.pos, body, p, G) &&
    (!inFight(s, e.id) || footprint(body, p, G).every((f) => s.encounter.arena[col(f)])) && footprint(m, m.pos, G).some((f) => clear(s, f, p));
}
const unseenByRider = (s, o, e) => e.side === 'party' && o.side !== 'party' && !o.dead && (o.hidden || hiddenFrom(o, e) || (sightRule(s) !== 'rooms' && unknown(s, o)));
// `from`: where the mount stood, if it has been moved since (a push the rider fell off in): the space is within 5 ft of
// that, and not the mount's old space nor where it is now.
export function riderLanding(s, e, m0, want = null, from = null) {
  const G = gridOf(s.map), body = { ...e, riding: undefined }, m = from ? { ...m0, pos: { ...from } } : m0;
  const others = living(s).filter((o) => o.id !== e.id).map((o) => (o.id === m0.id ? { ...o, riding: undefined, rider: undefined } : o));
  const holders = (p) => others.filter((o) => overlapAt(o, o.pos, body, p, G));
  const out = (p) => ({ p, lurker: holders(p).find((o) => unseenByRider(s, o, e)) ?? null });
  const free = (p) => holders(p).every((o) => unseenByRider(s, o, e));
  if (want !== undefined && want !== null) {
    if (!(want && Number.isInteger(want.q) && Number.isInteger(want.r))) return null;
    const p = landing(s.map, want, want.z ?? m.pos.z);
    return p && landingFits(s, e, m, p) && free(p) ? out(p) : null;
  }
  // Anchors as far from the mount as the rider's own body reaches, and a cell more: a rider bigger than one cell stands
  // with its anchor further off than that and still within 5 ft of the mount (a Huge rider off a Large horse; DEBT W26).
  const spots = [], reach = 1 + Math.max(0, ...shapeOf(body, G).map(([dq, dr]) => G.dist({ q: 0, r: 0 }, { q: dq, r: dr })));
  for (const f of footprint(m, m.pos, G)) for (const h of G.range(f, reach)) {
    const p = landing(s.map, h, m.pos.z);
    if (p && !spots.some((x) => key(x) === key(p)) && landingFits(s, e, m, p)) spots.push(p);
  }
  const p = spots.filter(free).sort((x, y) => G.dist(x, e.pos) - G.dist(y, e.pos) || x.q - y.q || x.r - y.r)[0];
  return p ? out(p) : null;
}
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
// A mover that drags creatures (docs/specs/grapple-shove.md, Decision 6) is offered the ground only (the engine drags along the ground;
// question Q6), and only steps its held creatures could follow. Each place found carries the game as it would stand on the cheapest way
// found to it (the grappler there, what it holds pulled behind it, as `walk` pulls them), and a step from there is offered only if
// `dragStep` says the held creatures could follow it. That is exact on hexes; on squares the search's cost is approximated here (without
// the diagonal rule), so a place may be judged by a way that is not quite the one `route` takes. `walk` asks each step again, exactly,
// and stops where one cannot be dragged.
// `opts.aerial`: lay out flying, climbing and ladder ways too, so `move` can tell a place only they reach from one too far.
// `opts.unchecked`: do not ask whether the held creatures could follow (so `move` can tell that from "too far").
export function moveOptions(s, e, opts = {}) {
  // A rider goes where its mount goes (stage C6a): its ways are the mount's, and `move` sent for it moves the mount.
  const steed = mountOf(s, e);
  if (steed && !steed.riding) return moveOptions(s, steed, opts);
  const walk = e && up(e) ? speedOf(s, e) : 0, flying = !!e && aloft(s, e), flySpeed = flying ? speedOf(s, e, 'fly') : 0;
  if (!e || !up(e) || (walk === 0 && !flying)) return new Map();
  // What it drags: every step of the route costs 1 extra foot a foot for each creature held that is not exempt (dragExtra), added to
  // the step's own cost as the SRD adds such extras ("1 extra foot (2 extra feet in Difficult Terrain)", Crawling, Climbing).
  const dragged = draggedBy(s, e), toll = dragged.reduce((n, { g, t }) => n + (g ? dragExtra(g, t) : 0), 0), dragging = dragged.length > 0, grounded = dragging && !opts.aerial, checked = dragging && !opts.unchecked;
  const enc = s.encounter, fighting = inFight(s, e.id);
  // In a fight it moves on its turn from the turn's budget; a controlled mount on its rider's turn, from `budget.mount`.
  const bud = fighting ? turnBudget(s, e) : null;
  if (fighting && !bud) return new Map();
  const pair = partnerOf(s, e);
  const map = s.map, G = gridOf(map), B = barriers(map), others = living(s).filter((o) => o.id !== e.id && o !== pair);
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
  const left = (speed) => (fighting ? bud.move + (speed - walk) * (1 + (bud.dashes | 0)) : EXPLORE_BUDGET);
  const limit = { walk: left(walk), climb: left(climbSpeed > 0 ? climbSpeed : walk), fly: fighting ? left(flySpeed) : Math.max(60, flySpeed) };
  const budget = Math.max(limit.walk, limit.climb, flying ? limit.fly : 0);
  // Traps this creature knows of: the party knows the ones it has spotted; everyone else knows them all.
  const hazards = new Set();
  for (const o of map.objects) {
    const def = objectDef(o);
    if (def.triggers?.some((t) => t.on === 'enter' && t.effects && t.from.includes(o.state)) && (e.side !== 'party' || !def.states[o.state].hidden)) hazards.add(`${o.level}|${col(o.at)}`);
  }
  // The cheapest way found to each place, and the game as it would stand there (the approximation above).
  const dist = new Map([[key(e.pos), 0]]), layout = new Map([[key(e.pos), s]]);
  const steps = (from) => {
    const out = [], here = ground(map, from)?.level;
    const fromKey = key(from), there = checked ? layout.get(fromKey) : null;
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
            const flat = Math.max(terrain, up_ > STEP_FREE || crowded(h) || spelled(h) ? 2 : 1) + toll;               // Difficult Terrain does not stack; dragging adds to it
            let next = null;
            if (checked) { const d = dragStep(there ?? s, e, h); if (d.blocked) continue; next = d.next; }                       // what it holds could not follow
            out.push({ h, cost: flat * FT, max: limit.walk, flat, extra: 0, diag, level: up_ <= STEP_FREE });     // a rise the cost does not count
            if (checked) { const c = (dist.get(fromKey) ?? 0) + flat * FT, k = key(h); if (c < (dist.get(k) ?? Infinity)) { dist.set(k, c); layout.set(k, next); } }
          } else if (climbs && !grounded) {
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
        if (grounded || !o.to || !objectDef(o).connects) continue;
        const a = { q: o.at.q, r: o.at.r, z: objectZ(s, o) }, b = landing(map, o.to, o.to.z ?? 0);
        const h = key(a) === key(from) ? b : b && key(b) === key(from) ? a : null;
        if (!h || (fighting && !enc.arena[col(h)]) || blocks(h) || !fitsOn(map, e, h, B)) continue;
        const cost = Math.max(FT, Math.abs(a.z - b.z)) * (climbSpeed > 0 ? 1 : 2);
        out.push({ h, cost, max: limit.climb, flat: 0, extra: cost, diag: false });
      }
    }
    if (flying && !grounded) {
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
  const reach = square ? squareSearch(e.pos, budget, steps, s.settings.diagonals ?? 'real', fighting ? (bud.diagonals | 0) & 1 : 0) : reachable(e.pos, budget, steps);
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
  return o.contents.filter((x) => wellFormed(x) && !seen.has(x.id) && seen.add(x.id));
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
    // Left by a companion that vanished unseen (resolve.js, vanish): the party can never come to know of
    // it, so the pile is the DM's to open (with the map editor) when the party finds it.
    if (o.left === true) continue;
    const e = Object.hasOwn(s.entities, o.by) ? s.entities[o.by] : null;
    if (e && unknown(s, e)) continue;
    if (s.map.seen?.objects) delete s.map.seen.objects[o.id];
    const open = pileAt(s, o.level, o.at);
    if (!open) { delete o.by; o.id = pileId(s, o.level, o.at); continue; }
    if (!Array.isArray(open.contents)) open.contents = [];
    // Everything moves: the merge may take the open pile past PILE_MAX (which only limits a drop onto it), so
    // nothing is lost and the hidden drop was never refused for what the party could not see (review of #291).
    for (const x of Array.isArray(o.contents) ? o.contents : []) {
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

// ---------- adding a creature to the map (the DM's spawn, the summon step: docs/specs/companions.md, Decision 2) ----------
// Where a new creature with this body (`{ size }`) can stand when it is put at `at`: the floor in that column
// (as `spawn` has always taken it), or, with `air` and a height in `at.z`, exactly there in the air (a flyer).
// Refused with the same words for both. `ignore(o)`: creatures that do not stop it (those its caster does not
// know of; the summon step places it beside them instead, below). Returns the position.
export function placeCreature(s, body, at, { air = false, ignore = null } = {}) {
  (at && Number.isInteger(at.q) && Number.isInteger(at.r)) || fail('Pick a place for it.');
  const G = gridOf(s.map), B = barriers(s.map);
  let to;
  if (air && Number.isFinite(at.z)) {
    to = { q: at.q, r: at.r, z: at.z };
    footprint(body, to, G).every((f) => !!airspace(s.map, { q: f.q, r: f.r, z: to.z }, undefined, sizeOf(body).height)) || fail("A creature can't stand there.");
  } else {
    to = landing(s.map, at);
    (to && TILES[ground(s.map, to).tile.t].cost < Infinity) || fail("A creature can't stand there.");
    fitsOn(s.map, body, to, B) || fail(`There isn't room for something ${body.size} there.`);
  }
  !living(s).some((o) => !(ignore && ignore(o)) && overlapAt(o, o.pos, body, to, G)) || fail(`That ${G.word.one} is occupied.`);
  return to;
}
// The nearest place to `at` where `body` fits and nobody stands (the first found on each ring, out to 6), or
// null: where a summoned creature goes when the space named turns out taken by a creature its caster did not
// know of (as a teleport does; resolve.js).
export function nearestFree(s, body, at) {
  const G = gridOf(s.map), B = barriers(s.map), taken = (p) => living(s).some((o) => overlapAt(o, o.pos, body, p, G));
  if (!taken(at)) return at;
  for (let n = 1; n <= 6; n++) for (const h of G.range(at, n).filter((x) => G.dist(x, at) === n)) {
    const p = landing(s.map, h, at.z);
    if (p && Math.abs(p.z - at.z) <= STEP_MAX && TILES[ground(s.map, p).tile.t].cost < Infinity && fitsOn(s.map, body, p, B) && !taken(p)) return p;
  }
  return null;
}
// The numbers of a master that a summon block reads (summons.js, `{ caster }`): its spell attack bonus and spell
// save DC for this spell, its Proficiency Bonus and its spellcasting ability modifier.
export function summonCaster(s, e, spell) {
  const st = spellStats(e, s, spell);
  return { attack: st.attack, dc: st.dc, pb: e.prof, mod: mod(e.abil[castAbilOf(e, spell)] ?? 10) };
}

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

// By Initiative, highest first, Dexterity breaking a tie, and an equal pair kept as it stood (the sort is
// stable). A companion whose turn is its master's (companions.md, Decision 3) carries `after: masterId` on
// its entry and the master's `init`: it is not sorted with the rest but put straight behind its master and
// any of the master's companions before it, in the order they stand, which is the order they were made
// (entries are added at the end). One whose master's player chose that it acts first (`bond.order`, A1)
// carries `before: masterId` instead and is put straight before its master, behind the master's other
// `before` companions, in the order they stand. One whose master is not in the order is sorted by the count
// it carries. With no `after` or `before` entries this is the sort it always was.
export function initiativeSort(order) {
  const leads = (o) => !tieOf(o) || !order.some((x) => x.id === tieOf(o) && !tieOf(x));
  const out = order.filter(leads).sort((a, b) => b.init - a.init || b.dex - a.dex);
  for (const o of order) {
    if (leads(o)) continue;
    out.splice(seatOf(out, o), 0, o);
  }
  order.splice(0, order.length, ...out);
  return order;
}
// The master an order entry's turn is tied to (`after` or `before` it), or null.
export const tieOf = (o) => (typeof o?.after === 'string' ? o.after : typeof o?.before === 'string' ? o.before : null);
// Where a companion's entry goes in an order holding its master: straight behind the master and the master's
// `after` companions already there, or, for a `before` one, straight before the master (so behind the master's
// `before` companions already there). Their order among themselves is the order they came in.
function seatOf(order, o) {
  const m = tieOf(o);
  let i = order.findIndex((x) => x.id === m);
  if (o.before) return i;
  while (i + 1 < order.length && order[i + 1].after === m) i++;
  return i + 1;
}
// Which side of its master a companion's turn goes, by its bond: `before` only when its master's player chose
// it (`bond.order`, A1); an old bond without the field is `after`.
export const sideOf = (e) => (e?.bond?.order === 'before' ? 'before' : 'after');
// The master a companion's turn follows, if it has one in this order: a bond with `turn: 'after'`, and its
// master there with a place of its own.
export function leadOf(s, order, e) {
  if (e?.bond?.turn !== 'after' || typeof e.bond.to !== 'string') return null;
  return order.find((o) => o.id === e.bond.to && !tieOf(o)) ?? null;
}
// May a companion take its place behind its master now? Only if the party knows of both (or both are its
// own): a seen creature acting straight after one the party does not know of, or an unseen turn always
// straight after a seen creature, would tell players they belong together (review of #317, M1). Until then
// it keeps the count it rolled, as an unbonded creature would. Once in place it stays, whoever hides later:
// the party saw where it stood.
const placeable = (s, e, m) => !!e && !!m && !unknown(s, e) && !unknown(s, m);
// The master a companion goes behind as it joins a fight, or null if it rolls its own count.
export function joinLead(s, order, e) {
  const m = leadOf(s, order, e);
  return m && placeable(s, e, s.entities[m.id]) ? m : null;
}
// Put an entry into the order without moving any entry already there (review of #317, B1: a re-sort moved a
// companion past the creature whose turn it is). An `after` entry goes straight behind its master and the
// master's companions already there, so they stand in the order they joined; a `before` one straight before
// its master (A1). Any other goes before the first creature it outranks (higher Initiative, then Dexterity; a
// tie goes behind, as a stable sort puts what joins last), looking only at creatures in their own initiative
// place, not companions and not those set aside (`enc.moved`), and before the `before` companions of that
// creature, so that a master's group is never split; outranking none, it goes before those moved to the end of
// the round.
export function insertSlot(order, slot, moved = {}) {
  if (tieOf(slot) && order.some((x) => x.id === tieOf(slot))) {
    order.splice(seatOf(order, slot), 0, slot);
    return;
  }
  const lead = (o) => !tieOf(o) && !moved[o.id];
  let i = order.findIndex((o) => lead(o) && (slot.init > o.init || (slot.init === o.init && slot.dex > o.dex)));
  if (i >= 0) { const m = order[i].id; while (i > 0 && order[i - 1].before === m) i--; }
  if (i < 0) { i = order.length; while (i > 0 && moved[order[i - 1].id] && !moved[order[i - 1].id].after && !moved[order[i - 1].id].placed) i--; }
  order.splice(i, 0, slot);
}
// Bring the order in step with the bonds (a companion bonded or freed in the fight, a master who joined after
// its companion or who has come to be known to the party). An entry gets `after` (or `before`, by `bond.order`)
// when its creature's bond says so, its master has a place of its own, and the party knows of both
// (placeable). A freed companion loses `after` or `before` and keeps its place and count (it does not roll
// again). `now`: in the middle of a round, where a companion is moved only if every creature that has had its
// turn this round still has, and every one still to come still is, and never while it is its turn or it or its
// master is set aside (E20); otherwise it waits for the next round (newRound in resolve.js, which calls this
// with `now` false). A companion already tied to its master changes sides (the master's player's choice, A1)
// only at a round's start (`now` false), and only where the party knows of both, as a new place: moving a seen
// creature round an unseen turn would tell players they belong together. Nothing else moves.
// True if anything changed. A stamp from before state version 22 (durations.js, thisTurn) is named by its
// creature before anything moves, as joinEncounter and settleOrder do.
export function followMasters(s, now) {
  const enc = s.encounter;
  if (!enc) return false;
  const moved = enc.moved ?? {};
  // Where an entry should be: { m, side } with its master's entry, or null for an entry of its own.
  const want = (o) => {
    const e = s.entities[o.id], m = leadOf(s, enc.order, e);
    if (!m) return null;
    const tied = tieOf(o) === m.id, fits = placeable(s, e, s.entities[m.id]);
    if (!tied && !fits) return null;
    const keep = o.before ? 'before' : 'after';
    return { m, side: tied && (now || !fits) ? keep : sideOf(e) };
  };
  // A ridden controlled mount has no place of its own while ridden (stage C6a): its entry is left where it is until
  // its rider gets down (resolve.js, dismountOrder), so its master's before or after choice waits too (A1).
  const off = (o) => { if (steering(s, s.entities[o.id])) return false; const w = want(o); return (w?.m.id ?? null) !== tieOf(o) || (!!w && (o.before ? 'before' : 'after') !== w.side); };
  if (!enc.order.some(off)) return false;
  for (const fx of effectsOf(s)) {
    for (const p of fx.parts) if (p.born !== undefined) p.born = restamp(enc, p.born);
    if (fx.zone?.last) for (const k of Object.keys(fx.zone.last)) fx.zone.last[k] = restamp(enc, fx.zone.last[k]);
  }
  const cur = enc.turn >= 0 ? enc.order[enc.turn]?.id ?? null : null;
  const had = (order) => { const t = order.findIndex((o) => o.id === cur); return new Set(order.slice(0, t < 0 ? 0 : t + 1).map((o) => o.id)); };
  const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  const bare = (o) => { const { after, before, ...rest } = o; return rest; };
  let changed = false;
  for (const o of [...enc.order]) {
    if (!off(o)) continue;
    const w = want(o), to = w?.m.id ?? null;
    if (!to) { delete o.after; delete o.before; changed = true; continue; }     // freed: where it stands, on the count it has
    if (moved[o.id] || moved[to]) continue;                             // set aside, it or its master: not while that lasts
    if (now && cur !== null && o.id === cur) continue;                  // the creature whose turn it is stays put
    const slot = { ...bare(o), [w.side]: to, init: w.m.init };
    const trial = enc.order.filter((x) => x.id !== o.id);
    insertSlot(trial, slot, moved);
    if (now && cur !== null && !same(had(enc.order), had(trial))) continue;
    enc.order.splice(enc.order.indexOf(o), 1);
    delete o.after; delete o.before;
    Object.assign(o, { [w.side]: to, init: w.m.init });
    insertSlot(enc.order, o, moved);
    changed = true;
  }
  if (changed && cur !== null) enc.turn = enc.order.findIndex((o) => o.id === cur);
  return changed;
}

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
  // A stamp from before state version 22 names a place in the order (durations.js, thisTurn): name it by
  // its creature before the order is sorted again, as settleOrder (resolve.js) does before a place moves.
  for (const fx of effectsOf(s)) {
    for (const p of fx.parts) if (p.born !== undefined) p.born = restamp(enc, p.born);
    if (fx.zone?.last) for (const k of Object.keys(fx.zone.last)) fx.zone.last[k] = restamp(enc, fx.zone.last[k]);
  }
  // A companion whose turn is its master's takes its place behind the master with no roll; one whose master is
  // not in the fight, or not known to the party, rolls its own, and is put behind the master later (Decision 3;
  // followMasters). The new entry is put in; nothing already in the order moves (review of #317, B1).
  const lead = joinLead(s, enc.order, e), faces = {};
  // Before or after the master by `bond.order` as it stands this round (a choice made in this round waits in
  // `orderNext` for the next one, A1).
  const slot = lead ? { id: e.id, init: lead.init, dex: e.abil.dex, [sideOf(e)]: lead.id } : rollInit(s, e, faces);
  insertSlot(enc.order, slot, enc.moved ?? {});
  enc.turn = enc.order.findIndex((o) => o.id === cur);
  ev.push({ type: 'joined', id: e.id, init: slot.init, ...(lead ? { [sideOf(e)]: lead.id } : faces[e.id]) });
  if (!lead) ownCount(s, e, enc.order, ev);
  followMasters(s, true);                                              // its companions already here go behind it, when that is safe now
}
// A companion whose turn is its master's, in a fight its master is not in (or that the party may not yet see them
// together in): it rolls its own Initiative, and its controller is told why (Decision 3). Only the party's own is told in the open: of another's, the DM alone.
export function ownCount(s, e, order, ev) {
  if (e.bond?.turn !== 'after') return;
  const here = !!leadOf(s, order, e);
  const text = here
    ? `${e.name} rolls its own Initiative: the party does not know of it or of its master yet, and its place would tell them they belong together. It goes straight after its master once the party knows of both.`
    : `${e.name} rolls its own Initiative: its master is not in the fight. It will act straight after its master if its master joins.`;
  ev.push(e.side === 'party' ? { type: 'note', id: e.id, text } : { type: 'manual', actor: e.id, name: e.name, partial: true, text });
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
// An area larger than the map is clipped to the map before its cells are listed, so what it costs follows
// the map, not the number in the entry (DEBT T35). Nothing it would have reached is lost: the cells that
// are left out are not on the map, and every caller drops those anyway. Areas under CLIP_FROM cells are
// listed whole, which costs less than finding the map's edge.
const CLIP_FROM = 20;
// The columns the map has, as a box: { q0, q1, r0, r1 }, or null for a map with none.
function mapBox(map) {
  let q0 = Infinity, q1 = -Infinity, r0 = Infinity, r1 = -Infinity;
  for (const level of map.levels) for (const k in level.tiles) {
    const c = k.indexOf(','), q = +k.slice(0, c), r = +k.slice(c + 1);
    if (q < q0) q0 = q; if (q > q1) q1 = q; if (r < r0) r0 = r; if (r > r1) r1 = r;
  }
  return q1 < q0 ? null : { q0, q1, r0, r1 };
}
// How many cells out from `cell` the map reaches (on a hex grid, in hexes; on squares, the most of the two
// axes): no column of the map is further. Infinity where the area is too small to bother.
function mapReach(map, G, cell, n) {
  if (!(n > CLIP_FROM)) return Infinity;
  const b = mapBox(map);
  if (!b) return 0;
  const corners = [[b.q0, b.r0], [b.q0, b.r1], [b.q1, b.r0], [b.q1, b.r1]];
  return Math.max(...corners.map(([q, r]) => (G.kind === 'square' ? Math.max(Math.abs(q - cell.q), Math.abs(r - cell.r)) : G.dist(cell, { q, r }))));
}
// The same, for the box of squares a creature fills (an emanation counts from its edge).
function mapReachBox(map, box, n) {
  if (!(n > CLIP_FROM)) return Infinity;
  const b = mapBox(map);
  return b ? Math.max(b.q1 - box.q0, box.q1 - b.q0, b.r1 - box.r0, box.r1 - b.r0) : 0;
}

function layout(s, e, area, range, aim) {
  const n = area.size / FT, shape = area.shape, G = gridOf(s.map);
  if (G.kind === 'square') return squareLayout(s, e, area, range, aim);
  if (shape === 'emanation') return { hexes: G.range(e.pos, Math.min(n, mapReach(s.map, G, e.pos, n))).filter((h) => key(h) !== key(e.pos)), origin: e.pos, high: (t) => gap(s, e.pos, t.pos) <= n };
  if (!aim) return null;
  const aimZ = aim.z ?? landing(s.map, aim, e.pos.z)?.z ?? e.pos.z;
  if (shape === 'cone') return { hexes: G.cone(e.pos, aim, Math.min(n, mapReach(s.map, G, e.pos, n))), origin: e.pos, high: (t) => gap(s, e.pos, t.pos) <= n };
  if (shape === 'sphere' || shape === 'cylinder') {
    const origin = { q: aim.q, r: aim.r, z: aimZ }, tall = area.height ?? area.size;
    const high = shape === 'cylinder' ? (t) => t.pos.z > origin.z - FT / 2 && t.pos.z <= origin.z + tall : (t) => gap(s, origin, t.pos) <= n;
    return { hexes: G.range(aim, Math.min(n, mapReach(s.map, G, aim, n))), origin, high };
  }
  const front = Math.max(...footprint(e, e.pos, G).map((f) => G.along(e.pos, aim, f))) + FT / 2;      // the edge of its own space
  if (shape === 'line') {
    if (range > 0 || G.dist(aim, e.pos) === 0) return null;
    const flat = G.along(e.pos, aim, aim), slope = flat > 0 ? (aimZ - e.pos.z) / flat : 0;
    const length = area.size / Math.hypot(1, slope), half = (area.width ?? FT) / 2;
    const cap = FT * mapReach(s.map, G, e.pos, area.size / FT) + FT, hexes = G.band(e.pos, aim, front, Math.min(front + length, cap), Math.min(half, cap));
    const high = (t) => { const z = e.pos.z + slope * G.along(e.pos, aim, t.pos); return z + half > t.pos.z && z - half < t.pos.z + sizeOf(t).height; };
    return { hexes, origin: e.pos, high };
  }
  if (shape === 'cube') {
    const size = area.size, half = size / 2;
    if (!(range > 0)) {
      if (G.dist(aim, e.pos) === 0) return null;
      const base = e.pos.z;
      const cap = FT * mapReach(s.map, G, e.pos, size / FT) + FT;
      return { hexes: G.band(e.pos, aim, front, Math.min(front + size, cap), Math.min(half, cap)), origin: e.pos, high: (t) => t.pos.z < base + size && t.pos.z + sizeOf(t).height > base };
    }
    const away = G.dist(aim, e.pos) === 0 ? { q: aim.q + 1, r: aim.r } : { q: 2 * aim.q - e.pos.q, r: 2 * aim.r - e.pos.r };
    const origin = { q: aim.q, r: aim.r, z: aimZ };
    const cap = FT * mapReach(s.map, G, aim, size / FT) + FT;
    return { hexes: G.band(aim, away, -FT / 2, Math.min(size - FT / 2, cap), Math.min(half, cap)), origin, high: (t) => t.pos.z < aimZ + size && t.pos.z + sizeOf(t).height > aimZ };
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
  // On squares what a clipped area keeps is every square within the map's reach whatever the fill: the radius or length is cut
  // to about twice that reach (squares are tested by their distance in a straight line, up to 1.42 times the count).
  const cut = (reach) => (reach === Infinity ? Infinity : 2 * reach + 3);
  if (shape === 'emanation') return { hexes: squareAround(box, Math.min(n, cut(mapReachBox(s.map, box, n))), fill), origin: e.pos, high: within(e.pos), from: own };
  if (!aim) return null;
  const aimZ = aim.z ?? landing(s.map, aim, e.pos.z)?.z ?? e.pos.z;
  const aimed = 2 * aim.q !== mid[0] || 2 * aim.r !== mid[1];
  const capFt = (c) => FT * cut(mapReach(s.map, G, c, area.size / FT));
  if (shape === 'cone') return aimed ? { hexes: squareCone(mid, aim, Math.min(area.size, capFt({ q: Math.floor(mid[0] / 2), r: Math.floor(mid[1] / 2) })), box), origin: e.pos, high: within(e.pos), from: own } : null;
  if (shape === 'sphere' || shape === 'cylinder') {
    const origin = { q: aim.q, r: aim.r, z: aimZ }, tall = area.height ?? area.size;
    const high = shape === 'cylinder' ? (t) => t.pos.z > origin.z - FT / 2 && t.pos.z <= origin.z + tall : within(origin);
    return { hexes: squareDisc(aim, Math.min(n, cut(mapReach(s.map, G, aim, n))), fill), origin, high, from: [origin] };
  }
  if (shape === 'line') {
    if (range > 0 || !aimed) return null;
    const flat = squareAlong(mid, aim, aim), slope = flat > 0 ? (aimZ - e.pos.z) / flat : 0;
    const length = area.size / Math.hypot(1, slope), half = (area.width ?? FT) / 2;
    const high = (t, f) => { const z = e.pos.z + slope * squareAlong(mid, aim, f); return z + half > t.pos.z && z - half < t.pos.z + sizeOf(t).height; };
    const cap = capFt({ q: Math.floor(mid[0] / 2), r: Math.floor(mid[1] / 2) });
    return { hexes: squareStrip(mid, aim, box, Math.min(length, cap), Math.min(half, cap)), origin: e.pos, high, from: own };
  }
  if (shape === 'cube') {
    const size = area.size, side = size / FT;
    if (!Number.isInteger(side) || side < 1) return null;
    if (side > CUBE_AIM_MAX / FT) return null;                   // aimable() hands a larger one to the DM; this is only a guard
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

// Could this action run enough work to meet the ceiling (effects.js, WORK)? apply() keeps a copy of the game before
// such an action, so that one that does pass the ceiling is refused with nothing changed. A guess from the content,
// counting every branch and every creature at the table: it errs on the side of "yes" (a copy costs a little time and
// changes nothing), and for what it cannot read it says yes. What it does not look at (a lasting zone's later turns, an
// object's trigger, a reaction) is stopped by the count itself, with a `manual` event, if it ever meets the ceiling.
export function mayBeHeavy(s, a) {
  try {
    let load = null, per = 1;
    if (a.type === 'cast') {
      const sp = typeof a.spell === 'string' && Object.hasOwn(SPELLS, a.spell) ? SPELLS[a.spell] : null;
      if (!sp) return false;
      const def = sp.def;
      // As scaled for the slot it would be cast at (dice and repeats added by a higher slot or by level, at the most the caster could have).
      const slot = Number.isInteger(a.slot) ? Math.min(9, Math.max(def.level, a.slot)) : def.level;
      load = loadOf(scaleSteps(def, 20, slot).steps);
      per = def.target?.area ? living(s).length : Math.max(1, targetCount(def, 20, slot));
    } else if (a.type === 'act') {
      const e = typeof a.actor === 'string' && Object.hasOwn(s.entities, a.actor) ? s.entities[a.actor] : null;
      const def = e?.actions?.find((x) => x.id === a.action);
      if (!def || def.multiattack) return false;
      load = loadOf(def.effects);
      const t = def.target ?? {};
      per = t.area ? living(s).length : Math.max(1, t.creature?.count ?? 1);
    } else if (a.type === 'use' || a.type === 'feature') {
      return 'copy';       // an item's effect, a feature's, an object's: not read from here, so the copy is taken (a few ms for a rare action)
    } else return false;
    return load.steps * per > WORK.steps / 4 || load.dice * per > WORK.dice / 4;
  } catch (err) {
    return true;
  }
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
  // `types` (Turn Undead: Undead only): a spell's area and a monster action's are held to it the same way, here.
  return { targets: area.types ? targets.filter((x) => area.types.includes(creatureType(x))) : targets, hexes, origin: origin === e.pos ? null : origin };
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
  let far = null;
  if (def) { try { far = actionProfile(e.actions.find((x) => x.id === def)).far; } catch (err) { if (!(err instanceof TypeError)) throw err; } }      // an action with neither reach nor range reaches no one (#421)
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
export function aimAction(s, e, def, a, all = false, ctx = null) {
  const t = def.target;
  if (t.self) return { targets: [e], hexes: null, origin: null };
  if (t.creature) {
    const c = t.creature, far = c.reach ?? c.range?.[1];
    // An action that says neither how far it reaches nor how far it shoots cannot be aimed (the linter refuses one; a saved game or an
    // entry that skipped the gate may hold it): refused with a sentence, never thrown, and nothing is changed.
    if (!(far > 0)) fail(`${e.name}'s ${def.name} says neither how far it reaches nor how far it shoots, so it cannot be aimed at anyone. The DM can apply it by hand.`);
    for (const id of a.targets ?? [a.target]) { const x = ent(s, id); !x.dead || fail(`${x.name} is already dead.`); }
    const targets = creatures(s, e, def.name, { range: far, harmful: true, repeat: c.repeat, within: c.within, most: c.count ?? 1 }, a);
    return { targets, hexes: null, origin: null };
  }
  if (actionProfile(def).aim !== 'area') return { targets: null, hexes: null, origin: null };
  const aimed = aimArea(s, e, def.name, t.area, t.area.range ?? 0, a.hex);          // `types` is applied inside
  // `choose`: up to so many of those the area catches, the creature's pick (as a spell's: casting.js); with `all` (who would be caught: the
  // AI and the screen ask this) every one caught is listed, for the pick to be made from. A player picks only among creatures the party is told of
  // (`unknown`, #136): one it is not told of is never offered, never counted for the refusal, and not affected by the pick; the DM sees all.
  if (t.area.choose && !all) aimed.targets = pickCaught(e, def.name, ctx && ctx.role !== 'dm' ? aimed.targets.filter((x) => !unknown(s, x)) : aimed.targets, a.targets, t.area.choose);
  return aimed;
}
// Of the creatures an area catches, those its user picks (an area with `choose`): `ids`, or all of them if that is no more than may be picked.
function pickCaught(e, name, caught, ids, most) {
  if (ids === undefined) {
    caught.length <= most || fail(`${name} affects up to ${most} creatures of ${e.name}'s choice in the area. Pick them (\`targets\`).`);
    return caught;
  }
  (Array.isArray(ids) && ids.length > 0 && ids.length <= most && new Set(ids).size === ids.length && ids.every((id) => typeof id === 'string')) || fail(`${name} affects up to ${most} different creatures.`);
  return ids.map((id) => caught.find((x) => x.id === id) || fail(`That creature is not in the area of ${name}.`));
}
// A creature's type: a pack monster's, else a character's (Humanoid). Null for one the engine cannot tell.
export const creatureType = (e) => e.type ?? CONTENT.monsters[e.tpl]?.type ?? (e.kind === 'pc' ? 'humanoid' : null);

// Who an area action would catch if aimed at `hex`, or null if it cannot be aimed there. For the AI and the UI.
export function areaTargets(s, e, def, hex) {
  try { return aimAction(s, e, def, { hex }, true).targets; } catch (err) { if (err instanceof RuleError) return null; throw err; }
}

// ---------- walking together ----------
// A party member may follow another (`follow: id`). When the one in front walks, outside a
// fight, those behind walk after it in marching order (`march`, lowest first), each by its own
// way of moving, to the free place nearest behind the leader's path. When a fight breaks out,
// those who were following are brought up behind their leader before initiative is rolled.
export const KEEP_UP = 2;                   // cells: a follower stays this close to the one in front where the ground allows
export const CATCH_UP = 60;          // feet: the furthest from its leader a follower is brought up to when a fight starts
export const byMarch = (a, b) => (a.march ?? Infinity) - (b.march ?? Infinity);

export function unfollow(s, e, ev, why = null) {
  const leader = e.follow;
  delete e.follow;
  const sl = s.entities[leader]?.formation?.slots;                     // its place in a held or custom formation goes with it (#303)
  if (sl) delete sl[e.id];
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

// ---------- formations (#303) ----------
// A leader may keep a formation (`e.formation`): where each of those following it walks, as a slot
// in the leader's frame, `{ back, side }` in cells: `back` behind the leader along the way it faces,
// `side` to its right (positive) or left. The frame is the grid's direction of the leader's last step
// (6 on hexes, 8 on squares; on squares a diagonal frame is the square frame turned, so its cells are
// cells). `shape` is a preset whose slots are dealt in marching order as the party walks (`pairs`,
// `line`, `wedge`), `column` (no slots: the trail, as it always was), `held` (the shape the party
// stood in when the leader started leading) or `custom` (slots set by hand). `face` is the direction
// the leader last faced, an index into the grid's neighbours. Absent: the column.
export const SHAPES = ['column', 'pairs', 'line', 'wedge'];
export const SLOT_MAX = 12;                                    // cells: no slot further back or out than this
const ORIGIN = { q: 0, r: 0 };
const LINE = [0, 1, -1, 2];
// The slots a preset gives followers in marching order.
export function presetSlots(shape, ids) {
  const out = {};
  ids.forEach((id, i) => {
    const k = i + 1;
    if (shape === 'pairs') out[id] = { back: Math.floor(k / 2), side: k % 2 };
    else if (shape === 'line') out[id] = { back: Math.floor(k / 4), side: LINE[k % 4] };
    else if (shape === 'wedge') { const row = Math.floor(i / 2) + 1; out[id] = { back: row, side: i % 2 ? row : -row }; }
  });
  return out;
}
// The world offset of one step in direction `i` (an index into the grid's neighbours).
export function faceStep(G, i) {
  const o = G.toWorld(ORIGIN), n = G.toWorld(G.neighbors(ORIGIN)[i] ?? G.neighbors(ORIGIN)[0]);
  return { x: n.x - o.x, z: n.z - o.z };
}
// The grid direction nearest a world vector, or null for none.
export function faceOf(G, dx, dz) {
  if (!dx && !dz) return null;
  let best = null, most = -Infinity;
  G.neighbors(ORIGIN).forEach((_, i) => { const u = faceStep(G, i), p = (u.x * dx + u.z * dz) / Math.hypot(u.x, u.z); if (p > most + 1e-9) { most = p; best = i; } });
  return best;
}
// The way a walk faced at its end: its last step that went somewhere on the map (not only up or down).
export function walkFace(G, walked) {
  for (let i = walked.length - 1; i > 0; i--) {
    const a = G.toWorld(walked[i - 1]), b = G.toWorld(walked[i]), f = faceOf(G, b.x - a.x, b.z - a.z);
    if (f !== null) return f;
  }
  return null;
}
// The leader's frame: where it stands, the step ahead (`u`) and the step to its right (`v`), in world units.
export function frameOf(G, pos, face) {
  const u = faceStep(G, face), w = G.toWorld(pos);
  return { x: w.x, z: w.z, u, v: { x: -u.z, z: u.x } };
}
// Where a slot is, in world units, and where a position is, as a slot (unrounded), in a frame.
export const slotPoint = (F, sl) => ({ x: F.x - sl.back * F.u.x + sl.side * F.v.x, z: F.z - sl.back * F.u.z + sl.side * F.v.z });
export function slotOf(G, F, h) {
  const w = G.toWorld(h), dx = w.x - F.x, dz = w.z - F.z, uu = F.u.x ** 2 + F.u.z ** 2;
  return { back: -(dx * F.u.x + dz * F.u.z) / uu, side: (dx * F.v.x + dz * F.v.z) / uu };
}
const half = (x, lo, hi) => Math.min(hi, Math.max(lo, Math.round(x * 2) / 2)) || 0;
// The shape these followers stand in around the leader, as slots (to the half cell, never ahead of
// it: one standing ahead is taken as beside it). The leader faces the way it last walked, else away
// from the middle of those following.
export function captureSlots(G, leader, followers, face = null) {
  if (face === null) {
    const l = G.toWorld(leader.pos), ws = followers.map((f) => G.toWorld(f.pos));
    face = ws.length ? faceOf(G, l.x - ws.reduce((a, w) => a + w.x, 0) / ws.length, l.z - ws.reduce((a, w) => a + w.z, 0) / ws.length) : null;
    face ??= 0;
  }
  const F = frameOf(G, leader.pos, face), slots = {};
  for (const f of followers) { const sl = slotOf(G, F, f.pos); slots[f.id] = { back: half(sl.back, 0, SLOT_MAX), side: half(sl.side, -SLOT_MAX, SLOT_MAX) }; }
  return { face, slots };
}
// A formation as one sent it or a saved game holds it: a known shape, slots of numbers in range, a direction.
export function validFormation(f) {
  if (!f || typeof f !== 'object' || Array.isArray(f)) return false;
  if (![...SHAPES, 'held', 'custom'].includes(f.shape)) return false;
  if (f.face !== undefined && !(Number.isInteger(f.face) && f.face >= 0 && f.face < 8)) return false;
  if (f.slots === undefined) return f.shape !== 'held' && f.shape !== 'custom';
  if (!f.slots || typeof f.slots !== 'object' || Array.isArray(f.slots) || SHAPES.includes(f.shape)) return false;
  return Object.values(f.slots).every(validSlot);
}
export const validSlot = (sl) => !!sl && typeof sl === 'object' && !Array.isArray(sl) && Object.keys(sl).length === 2 &&
  [sl.back, sl.side].every((x) => typeof x === 'number' && Number.isInteger(x * 2)) && sl.back >= 0 && sl.back <= SLOT_MAX && Math.abs(sl.side) <= SLOT_MAX;
// The slots of those following `leader` directly, by its formation, or null to walk as the column:
// no formation, the column, or a held shape that is single file (a column already, walked by the trail).
export function slotsFor(leader, followers) {
  const f = leader.formation;
  if (!f || f.shape === 'column') return null;
  let slots;
  if (SHAPES.includes(f.shape)) slots = presetSlots(f.shape, followers.map((x) => x.id));
  else { slots = {}; for (const x of followers) if (f.slots?.[x.id]) slots[x.id] = f.slots[x.id]; }
  const ids = Object.keys(slots);
  if (!ids.length || (f.shape === 'held' && ids.every((id) => slots[id].side === 0))) return null;
  return slots;
}

// Would a careful walker stop here? Not on a trap the party knows of that goes off on stepping there or
// coming near (as moveOptions keeps every way off a spotted trap), nor where a lasting zone the party
// knows of (its maker is not hidden from them) would take it in: Web, Spirit Guardians, Moonbeam. A
// trap or zone the party does not know of plays no part: it springs on a walk as on any walk.
export function peril(s, f, h) {
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
// E-P4: where `f` would stand in its leader's formation when a fight starts: the place nearest its slot's point (in the frame
// of the way the leader last faced), if it is one `catchUp` could use anyway (standable, in the arena, within CATCH_UP feet of
// the leader's walking), not ahead of the leader by more than half a cell, and free. It asks `moveOptions`, which knows every
// creature that stands, seen or not, so a place held by one the party cannot see is simply not free, as for any other
// occupant, and nothing is said. Null (today's trail) for no formation, no slot, no facing yet, a mount or its rider,
// or a follower that cannot walk (Grappled, Speed 0).
function formationPlace(s, f, leader, mine, theirs, arena) {
  const fm = leader.formation;
  if (!fm || fm.shape === 'column' || fm.face === undefined || mountOf(s, f) || riderOf(s, f) || f.cond?.grappled) return null;
  const members = living(s).filter((x) => x.side === 'party' && x.follow === leader.id && !draggedBy(s, x).length).sort(byMarch);
  const sl = slotsFor(leader, members)?.[f.id];
  if (!sl) return null;
  const G = gridOf(s.map), F = frameOf(G, leader.pos, fm.face), uu = F.u.x ** 2 + F.u.z ** 2, T = slotPoint(F, sl);
  const o0 = G.toWorld(ORIGIN), cell = Math.min(...G.neighbors(ORIGIN).map((n) => Math.hypot(G.toWorld(n).x - o0.x, G.toWorld(n).z - o0.z)));
  let best = null, bestKey = null;
  for (const [k, v] of mine) {
    if (!v.canStop || !arena[col(v.h)]) continue;
    const lc = theirs.get(k)?.cost;
    if (lc === undefined || lc > CATCH_UP || unseenAt(s.map, v.h)) continue;           // a place the party has not seen is no place for the shape: the trail, as if it were blocked
    if (lc > 2 * FT * (G.dist(leader.pos, v.h) + KEEP_UP) || peril(s, f, v.h)) continue;   // joined to the leader (no thin wall between) and no known trap or zone, as the walking layout asks
    const w = G.toWorld(v.h), d = Math.hypot(w.x - T.x, w.z - T.z) / cell, fwd = ((w.x - F.x) * F.u.x + (w.z - F.z) * F.u.z) / uu;
    if (d > 0.75 + 1e-9 || fwd > 0.5 + 1e-9) continue;
    const rank = [d, fwd, Math.abs(v.h.z - f.pos.z), v.cost];
    if (!best || less(rank, bestKey)) { best = { k, v }; bestKey = rank; }
  }
  return best;
}

// A fight is starting in `arena`. Everyone who was following a party member in it, and is not in
// it already, is brought up to the nearest free place behind its leader that it could have walked
// to (a path exists, and the place is at most CATCH_UP feet of walking from the leader).
// `walked` is { id, path } for a leader whose walk started the fight: the path from where it stands back.
export function catchUp(s, arena, walked, ev) {
  const G = gridOf(s.map);
  const inArena = (e) => !!arena[col(e.pos)];
  const party = new Set(living(s).filter((e) => e.side === 'party' && inArena(e)).map((e) => e.id));
  const pending = living(s).filter((e) => e.follow && e.side === 'party' && !inArena(e) && !draggedBy(s, e).length).sort(byMarch);      // one that holds a creature does not follow or keep a place (Decision 6; march says so)
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
    const slot = formationPlace(s, f, leader, mine, theirs, arena);       // E-P4: its place in the party's shape, when that is free
    if (slot) { best = slot; bestKey = null; }
    else for (const [k, v] of mine) {
      if (!v.canStop || !arena[col(v.h)]) continue;
      const lc = theirs.get(k)?.cost;
      if (lc === undefined || lc > CATCH_UP) continue;
      const at = along(trail, v.h, G), rank = [at.d, at.i, lc, v.cost];
      if (!best || less(rank, bestKey)) { best = { k, v }; bestKey = rank; }
    }
    if (!best || !up(f)) { unfollow(s, f, ev, "couldn't keep up"); continue; }
    f.pos = best.v.h;
    ev.push({ type: 'moved', id: f.id, path: route(mine, best.k).map((x) => x.h), caughtUp: true });
    const r = carry(s, f);                               // a mount brought up brings its rider
    if (r) ev.push({ type: 'moved', id: r.id, path: route(mine, best.k).map((x) => x.h), caughtUp: true });
    lookAround(s, ev, r ? [f, r] : [f]);
    party.add(f.id);
  }
}

