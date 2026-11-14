// Walls, doors and what they block. A wall is a line segment in map coordinates (feet) on one
// level. The hex grid is derived from them: a step between two neighbouring hexes is blocked
// if a blocking segment crosses the line between their centres. Design: docs/specs/maps-and-objects.md
import { HEX, gridOf, col } from './grid.js';
import { CONTENT } from './content/index.js';

export const WALL_KINDS = {
  wall: { move: true, sight: true },
  window: { move: true, sight: false },
  rail: { move: true, sight: false },      // a low wall or fence
  curtain: { move: false, sight: true },   // also fog and foliage
};

// The centre of a hex in map coordinates: feet, x to the east, y to the south. Kept for the
// callers that do not have a map yet; the map's grid gives its own (`gridOf(map).center`).
export const center = HEX.center;
// The hex edge between `at` and its neighbour in direction `edge` (an index into G.DIRS), as a segment.
export const edgeSegment = HEX.edgeSegment;
export const objectDef = (o) => CONTENT.objects[o.def];
// Where an object stands as a line, if it stands on one: a door on a cell's side, or a traced door.
// `G` is the grid of the object's map, hexes if not given.
export const objectSegment = (o, G = HEX) => (o.seg ? [o.seg.a, o.seg.b] : Number.isInteger(o.edge) ? G.edgeSegment(o.at, o.edge) : null);
// The cells an object touches: a thing's own cell, or the cells on either side of a door.
export function objectHexes(o, G = HEX) {
  const seg = objectSegment(o, G);
  if (!seg) return [{ q: o.at.q, r: o.at.r }];
  if (Number.isInteger(o.edge) && !o.seg) return [{ q: o.at.q, r: o.at.r }, { q: o.at.q + G.DIRS[o.edge][0], r: o.at.r + G.DIRS[o.edge][1] }];
  return G.range(o.at, 2).filter((h) => distToSegment(G.center(h), seg) <= G.cornerReach + 0.02);
}
export const objectBlocks = (o, what) => !!objectDef(o)?.states[o.state]?.blocks?.includes(what);

const orient = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
const within = (p, q, r) => Math.min(p[0], q[0]) - 1e-9 <= r[0] && r[0] <= Math.max(p[0], q[0]) + 1e-9 && Math.min(p[1], q[1]) - 1e-9 <= r[1] && r[1] <= Math.max(p[1], q[1]) + 1e-9;
// Do segments pq and ab meet? Touching counts: a wall that ends on the line still blocks it.
export function crosses(p, q, a, b) {
  const EPS = 1e-9, o1 = orient(p, q, a), o2 = orient(p, q, b), o3 = orient(a, b, p), o4 = orient(a, b, q);
  if (((o1 > EPS && o2 < -EPS) || (o1 < -EPS && o2 > EPS)) && ((o3 > EPS && o4 < -EPS) || (o3 < -EPS && o4 > EPS))) return true;
  return (Math.abs(o1) <= EPS && within(p, q, a)) || (Math.abs(o2) <= EPS && within(p, q, b)) || (Math.abs(o3) <= EPS && within(a, b, p)) || (Math.abs(o4) <= EPS && within(a, b, q));
}
// Shortest distance in feet from a point to a segment.
export function distToSegment(p, [a, b]) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

// What stands in the way on this map, worked out once and kept until a wall or an object changes.
// Kept beside the map, never in it: the game state stays plain data.
const cache = new WeakMap();
function signature(map) {
  let n = 0;
  for (const w of map.walls) n += w.a[0] + 2 * w.a[1] + 3 * w.b[0] + 5 * w.b[1] + w.kind.length;
  return `${map.walls.length}:${n}|${map.objects.map((o) => `${o.id}:${o.def}:${o.state}:${o.level}:${o.at.q},${o.at.r}:${o.edge ?? ''}`).join(';')}`;
}
export function barriers(map) {
  const sig = signature(map), had = cache.get(map);
  if (had?.sig === sig) return had;
  const G = gridOf(map);
  const levels = new Map(map.levels.map((l) => [l.id, { move: [], sight: [], both: [], tall: [], low: [], solid: new Set(), memo: new Map() }]));
  for (const w of map.walls) {
    const l = levels.get(w.level), k = WALL_KINDS[w.kind];
    if (!l || !k) continue;
    if (k.move) l.move.push([w.a, w.b]);
    if (k.move && w.kind !== 'rail') l.tall.push([w.a, w.b]);
    if (w.kind === 'rail') l.low.push([w.a, w.b]);        // a rail stops walkers; anything 5 ft up passes over it
    if (k.sight) l.sight.push([w.a, w.b]);
    if (k.move && k.sight) l.both.push([w.a, w.b]);
  }
  for (const o of map.objects) {
    const l = levels.get(o.level), seg = objectSegment(o, G);
    if (!l) continue;
    for (const what of ['move', 'sight']) {
      if (!objectBlocks(o, what)) continue;
      if (seg) l[what].push(seg); else if (what === 'move') l.solid.add(col(o.at));     // a thing that fills its hex
    }
    if (seg && objectBlocks(o, 'move') && objectBlocks(o, 'sight')) l.both.push(seg);
    if (seg && objectBlocks(o, 'move')) l.tall.push(seg);
  }
  const hit = (levelId, a, b, what) => {
    const l = levels.get(levelId);
    if (!l || !l[what].length) return false;
    const k = `${what}|${a[0]},${a[1]}|${b[0]},${b[1]}`;
    let v = l.memo.get(k);
    if (v === undefined) { v = l[what].some(([p, q]) => crosses(a, b, p, q)); l.memo.set(k, v); }
    return v;
  };
  const out = {
    sig,
    // Is the straight line between two hex centres blocked on this level? `what` is 'move', 'sight',
    // or 'both' for something that stops everything, like a wall or a shut door.
    blocked: (levelId, from, to, what = 'move') => hit(levelId, G.center(from), G.center(to), what),
    // Is this hex filled by something solid on this level?
    // The segments of one kind on a level, for callers that need to know where a line meets them.
    segments: (levelId, what) => levels.get(levelId)?.[what] ?? [],
    solid: (levelId, h) => !!levels.get(levelId)?.solid.has(col(h)),
  };
  cache.set(map, out);
  return out;
}
