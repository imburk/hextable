// Sight: line of sight and cover, worked out on hexes from the centre and the corners, and light.
// Design: docs/specs/sight.md, decisions 1 to 3.
import { gridOf, col } from './grid.js';
import { FT, WALL_HEIGHT, apart, footprint, gap, ground, regionAt, shapeOf, surfaces, under } from './space.js';
import { barriers, objectBlocks, objectDef, objectSegment } from './walls.js';
import { has } from './modifiers.js';
import { obscuredAt, terrainsOf } from './terrain.js';

const CORNER = 0.9;                                        // of the way out: a little inside the true corner, so a wall on the hex's own edge is not "in front of" it
const EYE = FT / 2;                                        // lines run from mid-body to mid-body
const CORNERS = { hex: 6, square: 4 };                     // corners of one cell, by grid

// Where two segments cross, as how far along pq (0 to 1), or null. Touching counts.
function crossAt(p, q, a, b) {
  const rx = q[0] - p[0], ry = q[1] - p[1], sx = b[0] - a[0], sy = b[1] - a[1], den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;                  // parallel: a line along a wall is not through it
  const t = ((a[0] - p[0]) * sy - (a[1] - p[1]) * sx) / den, u = ((a[0] - p[0]) * ry - (a[1] - p[1]) * rx) / den;
  return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? t : null;
}
// Is the straight line from point p at height zp to point q at height zq stopped by anything in
// the lists named? A wall stops it if the line is below the wall's top where they meet.
function stopped(map, B, p, zp, q, zq, lists) {
  for (const l of map.levels) {
    if (Math.max(zp, zq) + EYE < l.z || Math.min(zp, zq) + EYE >= l.z + WALL_HEIGHT) continue;
    for (const what of lists) for (const [a, b] of B.segments(l.id, what)) {
      const t = crossAt(p, q, a, b);
      if (t === null) continue;
      const z = zp + EYE + t * (zq - zp);
      if (z >= l.z && z < l.z + WALL_HEIGHT) return true;
    }
  }
  return false;
}
// A floor between two positions: one over the head of the lower, unless the higher simply stands at its own edge.
function floored(map, a, b) {
  const lo = a.z <= b.z ? a : b, hi = lo === a ? b : a;
  return hi.z > lo.z && surfaces(map, lo).some((sf) => sf.z > lo.z && sf.z <= hi.z && !(col(lo) === col(hi) && sf.z === hi.z && !ground(map, hi)));
}

const memo = new WeakMap();
const MEMO_MAX = 200000;                                   // lines kept per map before the table is started afresh
// What can be made out of hex `b` from the centre of hex `a`: { centre, corners } where corners
// counts how many of b's six are reached past everything that stops both movement and sight, and
// `low` says whether a rail or low wall lies on the way to the centre.
// With `what` = 'sight' the lines are stopped by whatever blocks sight alone (a curtain too, a
// window or a rail not): that is seeing, where 'both' is reaching.
export function sightline(map, a, b, what = 'both') {
  const B = barriers(map), G = gridOf(map);
  let had = memo.get(map);
  if (!had || had.sig !== B.sig || had.at.size > MEMO_MAX) memo.set(map, had = { sig: B.sig, at: new Map() });
  const k = `${what}|${a.q},${a.r},${a.z}|${b.q},${b.r},${b.z}`;
  let v = had.at.get(k);
  if (v) return v;
  if (floored(map, a, b)) v = { centre: false, corners: 0, low: false };
  else if (a.q === b.q && a.r === b.r) v = { centre: true, corners: CORNERS[G.kind], low: false };
  else {
    const p = G.center(a), c = G.center(b);
    let corners = 0;
    // A corner counts if it is reached and is on the target's own side of any wall that cuts through its hex.
    for (const k2 of G.corners(b, CORNER)) {
      if (!stopped(map, B, p, a.z, k2, b.z, [what]) && !stopped(map, B, c, b.z, k2, b.z, [what])) corners++;
    }
    v = { centre: !stopped(map, B, p, a.z, c, b.z, [what]), corners, low: what === 'both' && stopped(map, B, p, a.z, c, b.z, ['low']) };
  }
  had.at.set(k, v);
  return v;
}
// Is there a line from one position to the other past everything solid? Either way round will do.
export function inSight(map, a, b) {
  const ab = sightline(map, a, b);
  if (ab.centre || ab.corners > 0) return true;
  const ba = sightline(map, b, a);
  return ba.centre || ba.corners > 0;
}

// Can anything at one position see the other, past whatever blocks sight? Either way round will do.
export function inView(map, a, b) {
  const ab = sightline(map, a, b, 'sight');
  if (ab.centre || ab.corners > 0) return true;
  const ba = sightline(map, b, a, 'sight');
  return ba.centre || ba.corners > 0;
}
// Between two creatures (or a creature and a position): does any part of one see any part of the other?
export function inViewOf(map, a, b) {
  const G = gridOf(map), pa = a.pos ? footprint(a, a.pos, G) : [a], pb = b.pos ? footprint(b, b.pos, G) : [b];
  return pa.some((x) => pb.some((y) => inView(map, x, y)));
}

export const COVER = { none: 0, half: 2, threeQuarters: 5 };
// How cover is judged on a square map: the table rule `squareCover` (docs/specs/square-grid.md,
// Decision 7). 'obstacle' (the default, the owner's rule) judges what stands in the way and where;
// 'corners' counts the target's four corners in view, as hexes count six. Hex maps ignore it.
export const SQUARE_COVERS = ['obstacle', 'corners'];
export const squareCover = (s) => (SQUARE_COVERS.includes(s.settings?.squareCover) ? s.settings.squareCover : 'obstacle');
export const SQUARE_COVER_TEXT = {
  obstacle: 'Cover by what is in the way (the default): the line to the middle of the target and the lines to its corners. All clear: no cover. The middle clear but a corner hidden, or a creature on the line: Half. The middle behind something solid but part of the target showing round it: Three-Quarters. Everything behind a window, a rail, a grille or a thing like a statue: Three-Quarters. Everything behind a wall or a shut door: Total. A table rule; the SRD does not say how to judge cover on a grid.',
  corners: 'Cover by the corners of the target\'s square in view: all four, none; two or three, Half; one, Three-Quarters; none and the middle hidden, Total. A table rule.',
};
// The cover a target has from an attacker, or from a point an effect starts at: 'none', 'half',
// 'threeQuarters' or 'total'. For big creatures the most exposed pairing of their hexes counts.
// `from` is a creature or a position; `others` are creatures that might stand in the way.
export function coverOf(s, from, target, others = []) {
  const map = s.map, rules = s.settings ?? {}, G = gridOf(map);
  if (G.kind === 'square' && squareCover(s) === 'obstacle') return obstacleCover(s, from, target, others);
  const n = CORNERS[G.kind];
  const origins = from.pos ? footprint(from, from.pos, G) : [from], parts = footprint(target, target.pos, G);
  let best = { corners: -1 };
  for (const o of origins) for (const t of parts) {
    const a = sightline(map, o, t), b = a.corners === n ? a : sightline(map, t, o);
    const v = { corners: Math.max(a.corners, b.corners), centre: a.centre || b.centre, low: a.low, o, t };
    if (v.corners > best.corners) best = v;
  }
  if (best.corners === 0 && !best.centre) return 'total';
  if (rules.cover === 'off') return 'none';
  // Hexes: 5 or 6 corners none, 3 or 4 Half, 1 or 2 Three-Quarters. Squares under 'corners': 4
  // none, 2 or 3 Half, 1 (or none with the centre in view) Three-Quarters.
  if (best.corners <= (n === 6 ? 2 : 1)) return 'threeQuarters';
  if (best.corners <= (n === 6 ? 4 : 3) || best.low) return 'half';
  // A creature standing on the line between them gives half cover.
  if (rules.creatureCover !== 'off' && G.dist(best.o, best.t) > 1) {
    const p = G.center(best.o), q = G.center(best.t), len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    for (const c of others) {
      if (c === from || c === target || c.dead || Math.abs(c.pos.z - Math.min(best.o.z, best.t.z)) >= FT * 2) continue;
      for (const f of shapeOf(c, G).length === 1 ? [c.pos] : footprint(c, c.pos, G)) {
        const m = G.center(f), t = ((m[0] - p[0]) * (q[0] - p[0]) + (m[1] - p[1]) * (q[1] - p[1])) / (len * len);
        if (t > 0.05 && t < 0.95 && Math.hypot(m[0] - (p[0] + t * (q[0] - p[0])), m[1] - (p[1] + t * (q[1] - p[1]))) < 1.5) return 'half';
      }
    }
  }
  return 'none';
}

// ---------- cover by what is in the way (square maps, squareCover 'obstacle') ----------
// The owner's definitions (issue #240, 14 November): Half Cover is anything that does not fully
// cover the target; Three-Quarters is something that fully covers it but has a hole in it, or is
// askew of the direction of attack; Total is a wall, or something bigger than the target, directly
// between the target and the attack. Read by lines: "directly between" is the line from the
// attacker to the middle of the target's space, and what can be seen of it is the lines to the
// corners of its space (a little inside, as for sight). Each line finds one of:
//   'clear' : nothing that stops movement on it;
//   'holed' : stopped only by something that can be seen or shot through: a wall kind that blocks
//             movement and not sight (a window, a rail), or a thing in a state that blocks movement
//             and not sight (a lowered portcullis);
//   'filled': stopped only by a thing that fills its square (a chest, a crate, a statue). The map
//             says nothing of how tall or wide such a thing is, so it is never taken to cover a
//             target fully: it gives at most Half Cover (review of #262, M1). A pillar that does
//             fill its square is drawn as walls round it, and is solid;
//   'solid' : stopped by something that blocks movement and sight (a wall, a shut door) or a floor.
// A curtain blocks sight and not movement: it is no cover (an attack through it is at a target it
// cannot see, which the engine already handles).
const RANK = { none: 0, half: 1, threeQuarters: 2, total: 3 };
const DEGREES = ['none', 'half', 'threeQuarters', 'total'];
const INSET = 0.9 * (FT / 2);                               // centre to a corner along each axis, a little inside, as G.corners(h, 0.9)
// The squares a thing on this map fills (no segment, blocks movement), as boxes per level.
const fills = new WeakMap();
function filled(map, B, G) {
  let had = fills.get(map);
  if (had?.sig === B.sig) return had.boxes;
  const boxes = new Map();
  for (const o of map.objects) {
    if (objectSegment(o, G) || !objectBlocks(o, 'move')) continue;
    const [x, y] = G.center(o.at);
    (boxes.get(o.level) ?? boxes.set(o.level, []).get(o.level)).push([x - INSET, y - INSET, x + INSET, y + INSET]);
  }
  fills.set(map, had = { sig: B.sig, boxes });
  return boxes;
}
// Does the segment pq pass through the box [x0, y0, x1, y1]? (Liang-Barsky; touching counts.)
function throughBox(p, q, [x0, y0, x1, y1]) {
  let t0 = 0, t1 = 1;
  const dx = q[0] - p[0], dy = q[1] - p[1];
  for (const [d, lo, hi, v] of [[dx, x0, x1, p[0]], [dy, y0, y1, p[1]]]) {
    if (Math.abs(d) < 1e-12) { if (v < lo || v > hi) return false; continue; }
    let a = (lo - v) / d, b = (hi - v) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}
// What the line from point p at height zp to point q at height zq finds: 'clear', 'holed' or 'solid'.
const lines = new WeakMap();
function lineFinds(map, B, G, p, zp, q, zq) {
  let had = lines.get(map);
  if (!had || had.sig !== B.sig || had.at.size > MEMO_MAX) lines.set(map, had = { sig: B.sig, at: new Map() });
  const k = `${p[0]},${p[1]},${zp}|${q[0]},${q[1]},${zq}`;
  let v = had.at.get(k);
  if (v) return v;
  if (stopped(map, B, p, zp, q, zq, ['both'])) v = 'solid';
  else if (stopped(map, B, p, zp, q, zq, ['move'])) v = 'holed';
  else {
    v = 'clear';
    const boxes = filled(map, B, G);
    for (const l of map.levels) {
      if (Math.max(zp, zq) + EYE < l.z || Math.min(zp, zq) + EYE >= l.z + WALL_HEIGHT) continue;
      if ((boxes.get(l.id) ?? []).some((b) => throughBox(p, q, b))) { v = 'filled'; break; }
    }
  }
  had.at.set(k, v);
  return v;
}
// The middle and the corners of a space (a creature's squares, or one square), in feet, and its height.
function spaceOf(G, body) {
  const xs = body.map((h) => G.center(h)[0]), ys = body.map((h) => G.center(h)[1]);
  const x0 = Math.min(...xs) - INSET, x1 = Math.max(...xs) + INSET, y0 = Math.min(...ys) - INSET, y1 = Math.max(...ys) + INSET;
  return { mid: [(x0 + x1) / 2, (y0 + y1) / 2], corners: [[x1, y1], [x0, y1], [x0, y0], [x1, y0]], z: body[0].z ?? 0, at: body[0] };
}
// The degree of cover the owner's table gives from what the centre line and the corner lines find
// ('clear', 'holed' or 'solid').
function tableDegree(centre, corners) {
  if (centre === 'solid') return corners.every((v) => v === 'solid') ? 'total' : 'threeQuarters';   // round it, askew
  if (centre === 'holed') return corners.some((v) => v === 'clear') ? 'half' : 'threeQuarters';     // through it
  return corners.every((v) => v === 'clear') ? 'none' : 'half';
}
// The degree of cover a space has from one point (the centre of one of the attacker's squares), by
// the walls and things in the way: the table of the owner's rule (#240).
function fromPoint(map, B, G, o, sp) {
  if (floored(map, o, sp.at)) return { degree: 'total' };
  const p = G.center(o), zp = o.z ?? 0, centre = lineFinds(map, B, G, p, zp, sp.mid, sp.z);
  // A corner is seen if the line reaches it and it is on the target's own side of anything solid.
  const corners = sp.corners.map((k) => {
    const v = lineFinds(map, B, G, p, zp, k, sp.z);
    return v !== 'solid' && lineFinds(map, B, G, sp.mid, sp.z, k, sp.z) === 'solid' ? 'solid' : v;
  });
  // A thing that fills its square adds at most Half: the table read with it as clear, or with it
  // as a hole but no more than Half, whichever is more.
  const as = (v, f) => (v === 'filled' ? f : v);
  const without = tableDegree(as(centre, 'clear'), corners.map((v) => as(v, 'clear')));
  const withIt = RANK[tableDegree(as(centre, 'holed'), corners.map((v) => as(v, 'holed')))] > 0 ? 'half' : 'none';
  const degree = RANK[withIt] > RANK[without] ? withIt : without;
  return { degree, p, q: sp.mid, z: Math.min(zp, sp.z) };
}
// Is a creature standing on the line from p to q (its squares, a little inside, crossed by it)?
function creatureOn(s, G, from, target, others, line) {
  for (const c of others) {
    if (c === from || c === target || c.dead || (c.id && (c.id === from.id || c.id === target.id)) || Math.abs(c.pos.z - line.z) >= FT * 2) continue;
    // A creature standing where the line starts (on an effect's point of origin, or a Tiny one
    // sharing the attacker's square) or where it ends (a Tiny one sharing the target's) covers nobody.
    const boxes = footprint(c, c.pos, G).map((f) => { const [x, y] = G.center(f); return [x - INSET, y - INSET, x + INSET, y + INSET]; });
    if (boxes.some((b) => throughBox(line.p, line.p, b) || throughBox(line.q, line.q, b))) continue;
    if (boxes.some((b) => throughBox(line.p, line.q, b))) return true;
  }
  return false;
}
// The least cover `target` has from any of the attacker's squares (an attacker uses its best
// point: each square of its space, from the centre), or from a point an effect starts at.
function wallCover(s, from, target) {
  const map = s.map, B = barriers(map), G = gridOf(map);
  const origins = from.pos ? footprint(from, from.pos, G) : [from], sp = spaceOf(G, target.pos ? footprint(target, target.pos, G) : [target]);
  return origins.map((o) => fromPoint(map, B, G, o, sp));
}
function obstacleCover(s, from, target, others) {
  const rules = s.settings ?? {}, G = gridOf(s.map), seen = wallCover(s, from, target);
  let best = Math.min(...seen.map((v) => RANK[v.degree]));
  // Total Cover is the same both ways: if any square of the target has a line to the attacker's
  // middle or a corner of its space, part of each is in view of the other, and it is Three-Quarters.
  // An effect's point of origin is taken as one square for the way back (review of #262, L3), so
  // Total agrees with whether the area reaches the target (`clear`, either way round).
  if (best === RANK.total && target.pos && Math.min(...wallCover(s, target, from.pos ? from : { pos: from }).map((v) => RANK[v.degree])) < RANK.total) best = RANK.threeQuarters;
  if (best === RANK.total) return 'total';
  if (rules.cover === 'off') return 'none';
  // Another creature on the line gives Half Cover; the most protective degree applies, so it only
  // matters where the walls give none.
  if (best === RANK.none && rules.creatureCover !== 'off' && others.length) {
    const open = seen.filter((v) => v.degree === 'none');
    if (open.every((v) => creatureOn(s, G, from, target, others, v))) best = RANK.half;
  }
  return DEGREES[best];
}

// ---------- light ----------
// Each place is bright, dim or dark: the best of its ambient light and of every source whose light
// reaches it. A source reaches a place it has a line of sight to (inView), within its radius: Bright
// Light to `bright` feet, then Dim Light for `dim` feet more. Design: docs/specs/sight.md, decision 3.
export const LIGHT = ['dark', 'dim', 'bright'];
const LEVEL = { dark: 0, dim: 1, bright: 2 };
// The light a place has with nothing lit in it: its region's, else its level's, else bright.
export function ambientAt(map, pos) {
  const sf = under(map, pos);
  if (!sf) return 'bright';
  return regionAt(map, sf.level.id, pos)?.light ?? sf.level.light ?? 'bright';
}
// Everything giving light: things on the map in a state that is lit, and creatures carrying a light.
export function lightSources(s) {
  const out = [];
  for (const o of s.map.objects) {
    const l = objectDef(o)?.states[o.state]?.light, level = l && s.map.levels.find((x) => x.id === o.level);
    if (level) out.push({ pos: { q: o.at.q, r: o.at.r, z: level.z + (level.tiles[col(o.at)]?.h ?? 0) }, bright: l.bright, dim: l.dim, object: o.id });
  }
  for (const e of Object.values(s.entities)) if (e.light && (e.light.bright > 0 || e.light.dim > 0)) out.push({ pos: e.pos, bright: e.light.bright, dim: e.light.dim, id: e.id });
  return out;
}
// What one source gives a place: 0, 1 (dim) or 2 (bright). Kept per source and position, and thrown
// away when a wall, door or the map changes; a source that moves is simply a new source.
const shone = new WeakMap();
function shine(s, src, pos) {
  const d = gap(s, src.pos, pos) * FT;
  if (d > src.bright + src.dim) return 0;
  const B = barriers(s.map);
  let had = shone.get(s.map);
  if (!had || had.sig !== B.sig || had.per.size > 4000) shone.set(s.map, had = { sig: B.sig, per: new Map() });
  const sk = `${src.pos.q},${src.pos.r},${src.pos.z}|${src.bright}|${src.dim}`, pk = `${pos.q},${pos.r},${pos.z}`;
  let per = had.per.get(sk);
  if (!per) had.per.set(sk, per = new Map());
  let v = per.get(pk);
  if (v === undefined) per.set(pk, v = !inView(s.map, src.pos, pos) ? 0 : src.bright > 0 && d <= src.bright ? 2 : 1);
  return v;
}
// How light it is at a position: 'bright', 'dim' or 'dark'. `sources` may be passed in when many
// places are asked about at once.
export function lightAt(s, pos, sources = lightSources(s)) {
  let best = LEVEL[ambientAt(s.map, pos)];
  for (const src of sources) { if (best === 2) break; best = Math.max(best, shine(s, src, pos)); }
  return LIGHT[best];
}

// ---------- seeing ----------
// Can `viewer` see `target`? { see, why } where see is 'yes', 'dim' (seen, but Lightly Obscured)
// or 'no', and `why` says what stops or dims it: 'blinded' (the viewer), 'out of sight' (something
// in the way), 'invisible' or 'hidden' (the target), 'dark' or 'dim', or 'obscured' (a spell's fog,
// terrain.js). Senses by the SRD's Rules Glossary:
// - Blindsight: within range, sees anything not behind Total Cover, even Blinded, in Darkness, or Invisible.
// - Truesight: within range, sees in Darkness and sees the Invisible.
// - Darkvision: within range, Dim Light is as Bright and Darkness as Dim.
// - Tremorsense is not sight, so it plays no part here.
// A creature that took the Hide action (S6) has the Invisible condition against its enemies until
// one finds it; `ignoreHiding` asks what the viewer could see if it were not hiding.
// Design: docs/specs/sight.md, decisions 4 and 5.
export const hiddenFrom = (target, viewer) => !!target.hiding && target.side !== viewer.side;
export function sees(s, viewer, target, { sources, ignoreHiding = false } = {}) {
  if (viewer === target || (viewer.id && viewer.id === target.id)) return { see: 'yes' };
  const senses = viewer.senses ?? {}, d = apart(s, viewer, target) * FT;
  if ((senses.blindsight ?? 0) >= d && coverOf(s, viewer, target) !== 'total') return { see: 'yes' };
  if (has(viewer, 'blinded')) return { see: 'no', why: 'blinded' };
  if (!inViewOf(s.map, viewer, target)) return { see: 'no', why: 'out of sight' };
  const truesight = (senses.truesight ?? 0) >= d;
  if (!truesight && has(target, 'invisible')) return { see: 'no', why: 'invisible' };
  if (!truesight && !ignoreHiding && hiddenFrom(target, viewer)) return { see: 'no', why: 'hidden' };
  // SRD: a creature trying to see something in a Heavily Obscured space has the Blinded condition;
  // in a Lightly Obscured one it sees as in Dim Light. The least obscured part of a big creature
  // counts. Truesight does not see through fog; Blindsight (above) does.
  let fog = 2;
  if (terrainsOf(s).length) fog = Math.max(...(target.pos ? footprint(target, target.pos, gridOf(s.map)) : [target]).map((p) => ({ heavy: 0, light: 1 })[obscuredAt(s, p)] ?? 2));
  if (fog === 0) return { see: 'no', why: 'obscured' };
  if (truesight) return fog === 1 ? { see: 'dim', why: 'obscured' } : { see: 'yes' };
  const src = sources ?? lightSources(s);
  let best = Math.max(...(target.pos ? footprint(target, target.pos, gridOf(s.map)) : [target]).map((p) => LEVEL[lightAt(s, p, src)]));
  if ((senses.darkvision ?? 0) >= d) best = Math.min(2, best + 1);
  if (fog < best) return { see: 'dim', why: 'obscured' };
  return best === 2 ? { see: 'yes' } : best === 1 ? { see: 'dim', why: 'dim' } : { see: 'no', why: 'dark' };
}
export const canSee = (s, viewer, target, opts) => sees(s, viewer, target, opts).see;
