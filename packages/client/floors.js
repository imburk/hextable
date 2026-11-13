// Floors: what a level's floor looks like, worked out from the map document. Pure: no WebGL, no DOM,
// so Node's test runner can run it. Design: docs/specs/renderer.md, decision 1.
//
// Everything here is in map feet (x east, y south), the same feet walls are traced in. A polygon is a list
// of [x, y] points in increasing angle (clockwise on a y-south page), so the interior is on the left of
// each edge, and every polygon is convex: a hex cut by straight lines stays convex.
//
// The pipeline for one level:
//   1. Every hex a blocking wall passes through is cut by the walls that cross it from side to side.
//   2. A piece that holds its tile's centre is that tile's cell. A piece with no tile of its own (the far
//      side of a wall, or a hex with no tile at all) is given to the floor beside it that it can reach
//      without crossing a wall, or dropped if there is none. That is what makes a diagonal wall a straight
//      floor edge and fills a corridor between two traced walls. Picture only: the rules are unchanged.
//   3. Cells that touch, are at one height, of one terrain and one region, with no wall between, are a patch.
//   4. Every cell edge is looked at across: nothing there (open), a lower floor (drop), a higher one (rise),
//      a wall on the line (wall), or just a different patch at the same height (seam).
//   5. Where the floor ends, the edges are chained into an outline with an inset line for the kerb.
// A wall cuts a piece if it crosses it from side to side (a cap wall across a corridor crosses the strip the two
// side walls leave of a hex). Where walls meet at a point inside a hex (a bend, a corner) each arm's line is
// carried on through the hex too, so the hex falls apart into convex wedges; the wedges the wall does not
// separate are joined again into one patch. A wall that ends in the open inside a hex (a dead end) does not cut.
import * as H from './shared/hex.js';
import { FT, surfaces, regionAt } from './shared/space.js';
import { WALL_KINDS, center, objectSegment } from './shared/walls.js';

const S3 = Math.sqrt(3);
export const UNIT = S3 / FT;                       // drawing units per foot (the renderer's scale)
export const HEX_RADIUS = FT / S3;                 // centre to corner, feet
export const LIP = 0.25;                           // how wide the kerb along a floor's edge is, feet
export const WALL_THICK = 0.5;                     // feet
export const WALL_FULL = 10;                       // WALL_HEIGHT in the rules, feet
export const CUT_HEIGHT = 3;                       // what a cut-away wall is lowered to, feet
const TOL = 0.03;                                  // feet: points closer than this are the same point
const JOIN = 0.25;                                 // feet: a traced wall that stops this short of another still meets it
const MIN_AREA = 0.005;                            // square feet: a smaller piece is a rounding error

const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1];
const len2 = (a) => Math.hypot(a[0], a[1]);
const pkey = (p) => `${Math.round(p[0] / TOL)},${Math.round(p[1] / TOL)}`;
export const polyArea = (p) => p.reduce((s, a, i) => s + cross2(a, p[(i + 1) % p.length]), 0) / 2;
const centroid = (p) => [p.reduce((s, a) => s + a[0], 0) / p.length, p.reduce((s, a) => s + a[1], 0) / p.length];

// A hex as a polygon in map feet.
export function hexPoly(h) {
  const [cx, cy] = center(h);
  return [0, 1, 2, 3, 4, 5].map((k) => { const a = Math.PI / 6 + (k * Math.PI) / 3; return [cx + HEX_RADIUS * Math.cos(a), cy + HEX_RADIUS * Math.sin(a)]; });
}
// The hex a point in map feet is in.
export const hexAt = (x, y) => H.fromWorld(x * UNIT, y * UNIT);

const tidy = (poly) => {                            // drop repeated points
  const out = [];
  for (const p of poly) if (!out.length || len2(sub2(p, out[out.length - 1])) > 1e-7) out.push(p);
  if (out.length > 1 && len2(sub2(out[0], out[out.length - 1])) <= 1e-7) out.pop();
  return out;
};
// Cut a convex polygon by the line through p along d. Returns [left, right]: left is where cross(d, v - p) > 0.
export function splitPoly(poly, p, d) {
  const u = [d[0] / len2(d), d[1] / len2(d)], L = [], R = [], n = poly.length;
  const s = poly.map((v) => cross2(u, sub2(v, p)));
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], sa = s[i], sb = s[(i + 1) % n];
    if (sa >= -1e-9) L.push(a);
    if (sa <= 1e-9) R.push(a);
    if ((sa > 1e-9 && sb < -1e-9) || (sa < -1e-9 && sb > 1e-9)) { const t = sa / (sa - sb), x = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; L.push(x); R.push(x); }
  }
  const ok = (q) => { q = tidy(q); return q.length >= 3 && polyArea(q) > MIN_AREA ? q : null; };
  return [ok(L), ok(R)];
}
// A convex polygon cut down to what lies inside another (both in the same orientation).
export function clipConvex(subject, clip) {
  let out = subject;
  for (let i = 0; i < clip.length && out; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    out = splitPoly(out, a, sub2(b, a))[0];
  }
  return out;
}

// ---------- walls that stop feet ----------
// The straight lines that cut floors on a level: walls that stop movement, and the frame line of every door
// (shut or open). Lines that meet end to end along one straight line are joined into one, so a wall traced
// in pieces still crosses a hex from side to side.
function cutLines(map, levelId) {
  const segs = [];
  for (const w of map.walls) if (w.level === levelId && WALL_KINDS[w.kind]?.move) segs.push([w.a, w.b]);
  for (const o of map.objects) if (o.level === levelId) { const s = objectSegment(o); if (s) segs.push([s[0], s[1]]); }
  let changed = true;
  while (changed && segs.length > 1) {
    changed = false;
    const ends = new Map();
    segs.forEach((s, i) => { for (const e of [0, 1]) { const k = pkey(s[e]); if (!ends.has(k)) ends.set(k, []); ends.get(k).push([i, e]); } });
    for (const list of ends.values()) {
      if (list.length !== 2 || list[0][0] === list[1][0]) continue;
      const [[i, ei], [j, ej]] = list, a = segs[i], b = segs[j], far1 = a[1 - ei], far2 = b[1 - ej], mid = a[ei];
      const d1 = sub2(mid, far1), d2 = sub2(far2, mid);
      if (Math.abs(cross2(d1, d2)) > 1e-3 * len2(d1) * len2(d2) || dot2(d1, d2) <= 0) continue;
      segs[i] = [far1, far2]; segs.splice(j, 1); changed = true; break;
    }
  }
  return segs;
}
// A grid of lines for "is there a wall near this point" and "which walls are near this hex".
class LineIndex {
  constructor(segs, cell = 10) {
    this.segs = segs; this.cell = cell; this.at = new Map();
    segs.forEach((s, i) => {
      const x0 = Math.min(s[0][0], s[1][0]) - 3, x1 = Math.max(s[0][0], s[1][0]) + 3, y0 = Math.min(s[0][1], s[1][1]) - 3, y1 = Math.max(s[0][1], s[1][1]) + 3;
      for (let gx = Math.floor(x0 / cell); gx <= Math.floor(x1 / cell); gx++) for (let gy = Math.floor(y0 / cell); gy <= Math.floor(y1 / cell); gy++) {
        const k = `${gx},${gy}`; if (!this.at.has(k)) this.at.set(k, []); this.at.get(k).push(i);
      }
    });
  }
  near(p) { return this.at.get(`${Math.floor(p[0] / this.cell)},${Math.floor(p[1] / this.cell)}`) ?? []; }
  onLine(p, tol = 0.06) { return this.near(p).some((i) => distToSeg(p, this.segs[i]) <= tol); }
}
function distToSeg(p, [a, b]) {
  const d = sub2(b, a), l = dot2(d, d), t = l ? Math.max(0, Math.min(1, dot2(sub2(p, a), d) / l)) : 0;
  return len2(sub2(p, [a[0] + d[0] * t, a[1] + d[1] * t]));
}
// Where two or more of the lines end at one point (a bend or a corner): for each line there, the line carried
// on through the point. [{ at, d }]. A line that ends on the side of another (a T) is not one: the other cuts first.
function bends(lines) {
  const out = [];
  lines.forEach((s, i) => {
    for (const e of [0, 1]) {
      const at = s[e];
      if (lines.some((t, j) => j !== i && (len2(sub2(t[0], at)) <= JOIN || len2(sub2(t[1], at)) <= JOIN))) out.push({ at, d: sub2(s[1], s[0]) });
    }
  });
  return out;
}
// Put a point into a polygon's edge if it lies on one (and is not already a corner).
function withPoint(poly, p) {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (len2(sub2(p, a)) <= TOL || len2(sub2(p, b)) <= TOL) return poly;
    if (distToSeg(p, [a, b]) <= TOL) return [...poly.slice(0, i + 1), p, ...poly.slice(i + 1)];
  }
  return poly;
}
// Does the line a-b cross the convex polygon from side to side: through its inside, with both ends outside or on its edge?
function crossesFully(poly, a, b, slack = TOL) {
  const d = sub2(b, a), l = len2(d); if (!l) return false;
  const parts = splitPoly(poly, a, d); if (!parts[0] || !parts[1]) return false;
  const t = (p) => dot2(sub2(p, a), d) / (l * l), s = poly.map((v) => cross2([d[0] / l, d[1] / l], sub2(v, a)));
  let lo = Infinity, hi = -Infinity;
  const see = (p) => { const x = t(p); lo = Math.min(lo, x); hi = Math.max(hi, x); };
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], sp = s[i], sq = s[(i + 1) % poly.length];
    if (Math.abs(sp) <= 1e-9) see(p);
    if ((sp > 1e-9 && sq < -1e-9) || (sp < -1e-9 && sq > 1e-9)) { const k = sp / (sp - sq); see([p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k]); }
  }
  const e = slack / l;
  return lo >= -e && hi <= 1 + e;
}

// ---------- floors ----------
// Which levels get this treatment: those with walls or regions. The rest (the valley) stay as they were drawn.
export const roomLevels = (map) => map.levels.filter((l) => map.walls.some((w) => w.level === l.id) || map.regions.some((r) => r.level === l.id)).map((l) => l.id);

// The floors of a map: { levels: [{ id, z, patches, walls, posts }] }, for `levels` (ids; default: roomLevels).
//   patch: { id, level, region, terrain, z, lift, top, lowest, cells, outline }
//     z is level.z + tile.h in feet; `top` adds the tile's drawn lift (a drawing detail), in feet, so two cells
//     with the same `top` are at one drawn height.
//   cell: { hex: the tile it is drawn as ("q,r"), at: the hex it lies in, fill: true if it is picture only (not
//     a hex anyone can stand in), poly }
//   outline edge: { a, b, kind: 'open' | 'drop' | 'rise' | 'wall' | 'seam', hex, lowest, toTop (for drop), ia, ib }
//     ia and ib are a and b moved in by LIP, mitred along the chain; only open and drop edges have them.
export function buildFloors(map, { levels } = {}) {
  const ids = levels ?? roomLevels(map);
  return { levels: ids.map((id) => map.levels.find((l) => l.id === id)).filter(Boolean).map((l) => floorOfLevel(map, l)) };
}

function floorOfLevel(map, level) {
  const lines = cutLines(map, level.id), index = new LineIndex(lines);
  // Hexes a cutting line passes close to, with the lines near each.
  const near = new Map();
  lines.forEach((s, i) => {
    const len = len2(sub2(s[1], s[0])), steps = Math.max(1, Math.ceil(len / 1.5));
    for (let k = 0; k <= steps; k++) {
      const x = s[0][0] + ((s[1][0] - s[0][0]) * k) / steps, y = s[0][1] + ((s[1][1] - s[0][1]) * k) / steps, c = hexAt(x, y);
      for (const h of [c, ...H.neighbors(c)]) { const key = H.col(h); if (!near.has(key)) near.set(key, new Set()); near.get(key).add(i); }
    }
  });
  // Bends and corners: the lines there, carried on through the point, also cut the hexes it lies in.
  const carry = bends(lines), carryNear = new Map();
  carry.forEach((c, i) => { const h = hexAt(c.at[0], c.at[1]); for (const n of [h, ...H.neighbors(h)]) { const key = H.col(n); if (!carryNear.has(key)) carryNear.set(key, []); carryNear.get(key).push(i); } });
  // 1. Pieces.
  const pieces = [];                                       // { at, poly, owner (tile key or null), own (the piece that holds the tile's centre) }
  const byAt = new Map();
  const add = (p) => { pieces.push(p); if (!byAt.has(p.at)) byAt.set(p.at, []); byAt.get(p.at).push(p); };
  for (const k of new Set([...Object.keys(level.tiles), ...near.keys(), ...carryNear.keys()])) {
    const h = H.parse(k), tile = level.tiles[k], mine = near.get(k) ?? [], ext = (carryNear.get(k) ?? []).map((i) => carry[i]);
    // Cut the hex by every wall that crosses a piece from side to side (a piece is what is left after the cuts so far),
    // and by the carried-on lines of bends inside a piece, until nothing more cuts.
    const todo = [hexPoly(h)], parts = [];
    while (todo.length) {
      const poly = todo.pop();
      let cut = null;
      for (const i of mine) {
        const [a, b] = lines[i];
        if (!crossesFully(poly, a, b, JOIN)) continue;
        const [l, r] = splitPoly(poly, a, sub2(b, a)); if (l && r) { cut = [l, r]; break; }
      }
      if (!cut) for (const e of ext) {
        if (!(poly.some((v) => len2(sub2(v, e.at)) <= TOL) || inside(poly, e.at) || poly.some((v, j) => distToSeg(e.at, [v, poly[(j + 1) % poly.length]]) <= TOL))) continue;
        const [l, r] = splitPoly(poly, e.at, e.d); if (l && r) { cut = [l, r]; break; }
      }
      if (cut) todo.push(cut[1], cut[0]); else parts.push(poly);
    }
    if (!tile && parts.length < 2) continue;               // no floor, and no wall to fill it up to
    const c = center(h);
    let own = null;
    if (tile) { own = parts.find((p) => inside(p, c)) ?? parts.reduce((m, p) => (polyArea(p) > polyArea(m) ? p : m)); }
    for (const part of parts) {
      let poly = part;
      for (const e of ext) poly = withPoint(poly, e.at);   // so a wall that stops half way along a cut line splits its edge there
      add({ at: k, poly, owner: tile && part === own ? k : null });
    }
  }
  // Contacts: where two pieces' edges lie along one another (they are opposite ways round), and whether a wall is on the line.
  const contacts = new Map(pieces.map((p) => [p, []]));
  for (const p of pieces) {
    const around = [p.at, ...H.neighbors(H.parse(p.at)).map(H.col)];
    const others = around.flatMap((k) => byAt.get(k) ?? []).filter((o) => o !== p);
    for (let i = 0; i < p.poly.length; i++) {
      const a = p.poly[i], b = p.poly[(i + 1) % p.poly.length], d = sub2(b, a), l = len2(d);
      for (const o of others) for (let j = 0; j < o.poly.length; j++) {
        const r = o.poly[j], s = o.poly[(j + 1) % o.poly.length];
        if (dot2(d, sub2(s, r)) >= 0 || distToLine(r, a, d, l) > TOL || distToLine(s, a, d, l) > TOL) continue;
        const t0 = dot2(sub2(s, a), d) / l, t1 = dot2(sub2(r, a), d) / l, lo = Math.max(0, t0), hi = Math.min(l, t1);
        if (hi - lo <= TOL) continue;
        const mid = [a[0] + (d[0] / l) * ((lo + hi) / 2), a[1] + (d[1] / l) * ((lo + hi) / 2)];
        contacts.get(p).push({ edge: i, other: o, lo, hi, len: hi - lo, wall: index.onLine(mid) });
      }
    }
  }
  // 2. A piece with no floor of its own takes the floor it reaches without crossing a wall (the longest shared border first).
  for (let moved = true; moved;) {
    moved = false;
    for (const p of pieces) {
      if (p.owner) continue;
      let best = null;
      for (const c of contacts.get(p)) if (!c.wall && c.other.owner && (!best || c.len > best.len)) best = c;
      if (best) { p.owner = best.other.owner; moved = true; }
    }
  }
  const live = pieces.filter((p) => p.owner);
  const cells = live.map((p, n) => {
    const tile = level.tiles[p.owner], z = level.z + (tile.h ?? 0), region = regionAt(map, level.id, H.parse(p.owner))?.id ?? null;
    return { n, hex: p.owner, at: p.at, fill: p.at !== p.owner, poly: p.poly, z, lift: tile.lift, top: z + (tile.lift ?? 0.6) / UNIT, terrain: tile.t, region, piece: p };
  });
  const cellOf = new Map(cells.map((c) => [c.piece, c]));
  const lowestAt = new Map();
  const lowest = (key) => { if (!lowestAt.has(key)) lowestAt.set(key, surfaces(map, H.parse(key))[0]?.level === level); return lowestAt.get(key); };
  // 3 and 4. Across every edge: what is there, and which cells are one patch.
  const parent = cells.map((_, i) => i), find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const edges = new Map(cells.map((c) => [c, []]));
  for (const c of cells) {
    const poly = c.poly, found = contacts.get(c.piece).filter((x) => cellOf.has(x.other));
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], l = len2(sub2(b, a)), u = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
      const along = found.filter((x) => x.edge === i).sort((x, y) => x.lo - y.lo);
      let at = 0;
      const emit = (lo, hi, other, wall) => {
        if (hi - lo <= TOL) return;
        const p = [a[0] + u[0] * lo, a[1] + u[1] * lo], q = [a[0] + u[0] * hi, a[1] + u[1] * hi], o = other && cellOf.get(other);
        let kind = 'open';
        if (o) {
          if (Math.abs(o.top - c.top) > 1e-6) kind = o.top < c.top ? 'drop' : 'rise';
          else if (wall) kind = 'wall';
          else if (o.terrain !== c.terrain || o.region !== c.region) kind = 'seam';
          else kind = 'inner';
        }
        if (kind === 'inner') { if (cellOf.get(other).n > c.n) parent[find(c.n)] = find(o.n); return; }
        edges.get(c).push({ a: p, b: q, kind, hex: c.hex, lowest: lowest(c.hex), ...(kind === 'drop' && { toTop: o.top }) });
      };
      for (const x of along) { emit(at, x.lo, null); emit(x.lo, x.hi, x.other, x.wall); at = Math.max(at, x.hi); }
      emit(at, l, null);
    }
  }
  // 5. Patches, with their outlines.
  const groups = new Map();
  for (const c of cells) { const r = find(c.n); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(c); }
  const patches = [...groups.values()].map((list) => ({ list, first: list.map((c) => c.hex).sort()[0] })).sort((x, y) => (x.first < y.first ? -1 : x.first > y.first ? 1 : 0)).map(({ list }, i) => {
    const c0 = list[0], outline = list.flatMap((c) => edges.get(c));
    inset(outline);
    return { id: `${level.id}:${i}`, level: level.id, region: c0.region, terrain: c0.terrain, z: c0.z, lift: c0.lift, top: c0.top, lowest: list.some((c) => c.lowest), cells: list.map(({ hex, at, fill, poly }) => ({ hex, at, fill, poly })), outline };
  });
  const walls = faces(map, level, patches);
  return { id: level.id, z: level.z, patches, walls, posts: posts(map, level) };
}
const inside = (poly, p) => poly.every((a, i) => cross2(sub2(poly[(i + 1) % poly.length], a), sub2(p, a)) >= -1e-9);
const distToLine = (p, a, d, l) => Math.abs(cross2(d, sub2(p, a))) / l;

// The kerb: for the open and drop edges of one patch, chain them end to start and move each point in by LIP,
// mitred where two edges meet, so the strip along a floor's edge closes at corners.
function inset(outline) {
  const drawn = outline.filter((e) => e.kind === 'open' || e.kind === 'drop');
  const norm = (e) => { const d = sub2(e.b, e.a), l = len2(d); return [-d[1] / l, d[0] / l]; };            // inward: the floor is on the left
  const startsAt = new Map(drawn.map((e) => [pkey(e.a), e])), endsAt = new Map(drawn.map((e) => [pkey(e.b), e]));
  const at = (e, p, other) => {
    const n = norm(e);
    if (!other) return [p[0] + n[0] * LIP, p[1] + n[1] * LIP];
    const m = norm(other), k = 1 + dot2(n, m);
    if (k < 0.3) return [p[0] + n[0] * LIP, p[1] + n[1] * LIP];                  // a sharp turn: do not let the point shoot off
    return [p[0] + ((n[0] + m[0]) / k) * LIP, p[1] + ((n[1] + m[1]) / k) * LIP];
  };
  for (const e of drawn) { e.ia = at(e, e.a, endsAt.get(pkey(e.a))); e.ib = at(e, e.b, startsAt.get(pkey(e.b))); }
}

// The ring of a hex, `k` of the way out, cut up for a cell: { inner, rim }. The floor is `inner` in one colour,
// and `rim` is the strips of the hex's border in the grid's colour (a thin line round every hex). A cell that is
// only a piece of picture (fill) has no rim; with k >= 1 the grid is not drawn at all.
export function cellParts(cell, k) {
  if (cell.fill || k >= 1) return { inner: cell.poly, rim: [] };
  const h = H.parse(cell.at), c = center(h), hex = hexPoly(h), small = hex.map((p) => [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k]);
  const rim = [];
  for (let i = 0; i < 6; i++) {
    const n = (i + 1) % 6, strip = clipConvex([hex[i], hex[n], small[n], small[i]], cell.poly);
    if (strip) rim.push(strip);
  }
  return { inner: clipConvex(cell.poly, small), rim };
}

// ---------- walls: posts, faces, cut-aways ----------
// A post stands where wall segments meet, so that corners close: where two ends meet, or an end meets the
// side of another wall. { at: [x, y], kind: the tallest kind meeting there, kinds, keys: the `key` of each wall face that meets there }
const TALL = { wall: 3, curtain: 3, window: 2, rail: 1 };
function posts(map, level) {
  const ws = map.walls.filter((w) => w.level === level.id && WALL_KINDS[w.kind]);
  const ends = new Map();
  ws.forEach((w, i) => { for (const p of [w.a, w.b]) { const k = pkey(p); if (!ends.has(k)) ends.set(k, { at: p, ids: new Set(), kinds: new Set() }); const e = ends.get(k); e.ids.add(i); e.kinds.add(w.kind); } });
  const out = [];
  for (const e of ends.values()) {
    const ids = new Set(e.ids), kinds = new Set(e.kinds);
    ws.forEach((w, i) => { if (!ids.has(i) && distToSeg(e.at, [w.a, w.b]) <= TOL) { ids.add(i); kinds.add(w.kind); } });       // an end on the side of another
    if (ids.size < 2) continue;
    const list = [...kinds].sort((x, y) => TALL[y] - TALL[x]);
    out.push({ at: e.at, kind: list[0], kinds: list, keys: [...ids].sort((x, y) => x - y).map((i) => `w:${ws[i].id}`) });
  }
  return out.sort((a, b) => a.at[0] - b.at[0] || a.at[1] - b.at[1]);
}
// Every drawn wall segment, and every door's line, as data for the cut-away: where it is, which way it faces, and whether there is floor
// on each side of it. n is the left-hand unit normal of a to b; floor.left and floor.right say if a point just off each side is floor.
function faces(map, level, patches) {
  const cellsAt = new Map();
  for (const p of patches) for (const c of p.cells) { if (!cellsAt.has(c.at)) cellsAt.set(c.at, []); cellsAt.get(c.at).push(c); }
  const floorAt = (pt) => { const h = hexAt(pt[0], pt[1]); return [h, ...H.neighbors(h)].some((n) => (cellsAt.get(H.col(n)) ?? []).some((c) => inside(c.poly, pt))); };
  const one = (key, id, kind, a, b) => {
    const d = sub2(b, a), l = len2(d) || 1, n = [-d[1] / l, d[0] / l], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], off = 0.75;
    return { key, id, kind, a, b, mid, n, floor: { left: floorAt([mid[0] + n[0] * off, mid[1] + n[1] * off]), right: floorAt([mid[0] - n[0] * off, mid[1] - n[1] * off]) } };
  };
  const out = map.walls.filter((w) => w.level === level.id && WALL_KINDS[w.kind]).map((w) => one(`w:${w.id}`, w.id, w.kind, w.a, w.b));
  for (const o of map.objects) if (o.level === level.id) { const s = objectSegment(o); if (s) out.push({ ...one(`o:${o.id}`, o.id, 'door', s[0], s[1]), object: true }); }     // a door or a portcullis lies in a wall and is lowered with it
  return out;
}
// Which wall faces to lower, seen from a camera that is `toCam` away from what it follows (a unit vector on the
// ground, map feet). A wall is cut away when it stands between the camera and a room: the camera is on one side
// and there is floor on the other. A wall seen nearly edge on (the side walls of a room, or one facet of a wall
// traced along hex edges) is cut if there is floor beside it at all, so it does not stand up in the middle of a
// low run. Returns a Set of indexes into `faces`.
// A wall with floor on both sides (a partition) counts as such a wall whichever side the camera is on.
export function cutaway(faces, toCam, edgeOn = 0.2) {
  const out = new Set();
  faces.forEach((f, i) => {
    const s = dot2(f.n, toCam);
    if (Math.abs(s) < edgeOn) { if (f.floor.left || f.floor.right) out.add(i); return; }
    const far = s > 0 ? f.floor.right : f.floor.left;
    if (far) out.add(i);
  });
  return out;
}
