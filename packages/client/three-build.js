// What the Three.js renderer draws, as plain arrays (docs/specs/renderer.md, R11). Pure: no Three.js, no DOM, so it can be tested in Node.
// A Builder collects triangles as 10 floats a vertex (position, normal, colour with alpha), which render-three.js turns into one
// BufferGeometry per kind. The shapes follow render.js's (the reference for what is drawn) and the geometry comes from floors.js.
import { HEX, gridOf, col as cellCol, key as cellKey, parse as cellParse } from './shared/grid.js';
import { allTiles, footprint, ground, shown, surfaces, under } from './shared/space.js';
import { objectBlocks, objectDef, objectSegment } from './shared/walls.js';
import { buildFloors, caveLevels, caveOf, cellParts, cutaway } from './floors.js';
import { zoneHexes } from './render.js';

export const UNIT = Math.sqrt(3) / 5;                       // drawing units per foot: a hex is 5 ft across
export const surfY = (z, tile) => z * UNIT + (tile?.lift ?? 0.6);
const FT = UNIT, FULL = 10 * FT, SILL = 3 * FT, WINDOW_TOP = 7 * FT, DOOR_TALL = 7 * FT, SLAB = 0.35;
export const GIRTH = { tiny: 0.55, small: 0.8, medium: 1, large: 1.7, huge: 2.5, gargantuan: 3.2 };
// On squares a Large creature fills 2 by 2 squares, Huge 3 by 3, Gargantuan 4 by 4 (SRD), so its base is drawn wider to fill them (as render.js does).
const GIRTH_SQUARE = { ...GIRTH, large: 2, huge: 3, gargantuan: 4 };
export const girth = (e, G = HEX) => (G.kind === 'square' ? GIRTH_SQUARE : GIRTH)[e?.size] ?? 1;

const ZONE_TINT = { acid: [0.55, 0.85, 0.2], cold: [0.45, 0.78, 0.95], fire: [0.98, 0.45, 0.12], force: [0.75, 0.55, 0.95], lightning: [0.4, 0.55, 1], necrotic: [0.45, 0.3, 0.55],
  poison: [0.45, 0.75, 0.3], psychic: [0.9, 0.45, 0.8], radiant: [1, 0.9, 0.5], thunder: [0.65, 0.7, 0.85], bludgeoning: [0.7, 0.6, 0.5], piercing: [0.7, 0.6, 0.5], slashing: [0.7, 0.6, 0.5], neutral: [0.7, 0.75, 0.85] };
const zoneType = (steps) => {
  const walk = (v) => {
    if (Array.isArray(v)) { for (const x of v) { const t = walk(x); if (t) return t; } return null; }
    if (v && typeof v === 'object') { if ('damage' in v && ZONE_TINT[v.type] && v.type !== 'neutral') return v.type; for (const x of Object.values(v)) { const t = walk(x); if (t) return t; } }
    return null;
  };
  return walk(steps);
};

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const shade = (c, f) => [c[0] * f, c[1] * f, c[2] * f, 1];
export const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const centroidOf = (p) => [p.reduce((a, v) => a + v[0], 0) / p.length, p.reduce((a, v) => a + v[1], 0) / p.length];
export const jitter = (q, r) => { const h = Math.sin(q * 127.1 + r * 311.7) * 43758.5453; return h - Math.floor(h); };

// The model matrix of a thing at x, y, z turned by yaw and tipped by tilt (column-major, as Three's Matrix4.fromArray wants).
export function model(x, y, z, yaw, tilt, sc = 1) {
  const c = Math.cos(yaw), s = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
  return [c * sc, 0, -s * sc, 0, s * st * sc, ct * sc, c * st * sc, 0, s * ct * sc, -st * sc, c * ct * sc, 0, x, y, z, 1];
}

// A fingerprint of what the sight rules say the party sees now, so the ground is rebuilt when it changes.
export function sightSig(sight) {
  if (!sight) return '';
  const t = JSON.stringify(sight);
  let n = t.length;
  for (let i = 0; i < t.length; i++) n = (Math.imul(n, 31) + t.charCodeAt(i)) | 0;
  return String(n);
}
export function tileSig(map) {
  let n = 0;
  for (const l of map.levels) for (const k in l.tiles) { const t = l.tiles[k]; n = (Math.imul(n, 31) + (t.t.charCodeAt(0) * 7 + t.t.length) * 131 + Math.round(((t.h ?? 0) + (t.lift ?? 0)) * 4) + 17) | 0; }
  return n;
}

// A cell's outline in drawing units, as offsets from its centre, from the grid's own corners (`G.corners`): a unit cell has radius 1 on
// hexes. The same outline serves every cell of a map, so it is worked out once per grid.
const SHAPES = new WeakMap();
const shapeOf = (G) => { let o = SHAPES.get(G); if (!o) SHAPES.set(G, (o = G.corners({ q: 0, r: 0 }).map(([x, y]) => [x * UNIT, y * UNIT]))); return o; };
// The unit vector from a cell's centre through the middle of its side `i` (side i runs from corner i to corner i + 1).
const sideAt = (shape, i) => { const a = shape[i], b = shape[(i + 1) % shape.length], x = a[0] + b[0], z = a[1] + b[1], n = Math.hypot(x, z); return [x / n, z / n]; };
export class Builder {
  constructor(G = HEX) { this.d = []; this.shape = shapeOf(G); }
  get count() { return this.d.length / 10; }
  tri(a, b, c, col) {
    const n = norm(cross(sub(b, a), sub(c, a)));
    for (const p of [a, b, c]) this.d.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], col[3] ?? 1);
  }
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  ring(cx, cz, r, y, sides, rot) {
    const out = [];
    for (let i = 0; i < sides; i++) { const a = rot + (i * 2 * Math.PI) / sides; out.push([cx + r * Math.cos(a), y, cz + r * Math.sin(a)]); }
    return out;
  }
  lathe(cx, cz, y0, profile, sides, rot, colAt) {
    let prev = this.ring(cx, cz, profile[0][0], y0 + profile[0][1], sides, rot);
    for (let p = 1; p < profile.length; p++) {
      const cur = this.ring(cx, cz, profile[p][0], y0 + profile[p][1], sides, rot), col = colAt(p - 1);
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        if (profile[p][0] === 0) this.tri(prev[j], prev[i], cur[i], col);
        else if (profile[p - 1][0] === 0) this.tri(prev[i], cur[j], cur[i], col);
        else this.quad(prev[j], prev[i], cur[i], cur[j], col);
      }
      prev = cur;
    }
  }
  blob(cx, cz, y, r, a, { sides = 12, hard = false } = {}) {
    const rot = sides === 4 ? Math.PI / 4 : 0, o = this.ring(cx, cz, r, y, sides, rot), n = this.ring(cx, cz, r * 0.5, y, sides, rot), dark = [0, 0, 0, a], edge = [0, 0, 0, hard ? a : 0];
    const v = (p, col) => this.d.push(p[0], p[1], p[2], 0, 1, 0, col[0], col[1], col[2], col[3]);
    for (let k = 0; k < sides; k++) {
      const j = (k + 1) % sides;
      v(n[j], dark); v(n[k], dark); v([cx, y, cz], dark);
      v(o[j], edge); v(o[k], edge); v(n[k], dark); v(o[j], edge); v(n[k], dark); v(n[j], dark);
    }
  }
  // The outline of a cell at radius r (1 is the cell's own edge), height y.
  cellRing(cx, cz, r, y) { return this.shape.map(([dx, dz]) => [cx + r * dx, y, cz + r * dz]); }
  flatHex(cx, cz, y, r0, r1, col) {
    const o = this.cellRing(cx, cz, r1, y), i = r0 ? this.cellRing(cx, cz, r0, y) : null, n = o.length;
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      if (i) this.quad(o[j], o[k], i[k], i[j], col); else this.tri(o[j], o[k], [cx, y, cz], col);
    }
  }
  // An upright slab along a line given in map feet.
  slab(p, q, y0, height, half, col, cap = null) {
    const ax = p[0] * UNIT, az = p[1] * UNIT, bx = q[0] * UNIT, bz = q[1] * UNIT, len = Math.hypot(bx - ax, bz - az) || 1;
    const nx = (-(bz - az) / len) * half, nz = ((bx - ax) / len) * half, y1 = y0 + height;
    const c = [[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]];
    const lo = c.map(([x, z]) => [x, y0, z]), hi = c.map(([x, z]) => [x, y1, z]);
    const face = (a, b2, c2, d, f) => { this.quad(a, b2, c2, d, shade(col, f)); this.quad(d, c2, b2, a, shade(col, f)); };
    if (cap) { this.quad(hi[0], hi[1], hi[2], hi[3], cap); this.quad(hi[3], hi[2], hi[1], hi[0], cap); } else face(hi[0], hi[1], hi[2], hi[3], 1.1);
    for (let i = 0; i < 4; i++) { const n = (i + 1) % 4; face(hi[i], hi[n], lo[n], lo[i], i % 2 ? 0.7 : 0.9); }
  }
}

// Where something stands on a hex (drawing units), and the middle of the hexes a creature fills.
export function stand(map, h) { const w = gridOf(map).toWorld(h), z = h.z ?? 0; return { x: w.x, y: surfY(z, ground(map, { q: h.q, r: h.r, z })?.tile), z: w.z }; }
export function spot(map, e, pos) {
  const base = stand(map, pos), parts = footprint(e ?? {}, pos, gridOf(map));
  if (parts.length === 1) return base;
  let x = 0, z = 0;
  for (const f of parts) { const w = gridOf(map).toWorld(f); x += w.x; z += w.z; }
  return { x: x / parts.length, y: base.y, z: z / parts.length };
}

// The pawn of a creature: one lathe profile per theme, coloured by side and character.
export function makePawn(e, th, G = HEX) {
  const b = new Builder(G), p = th.pawn, base = [...(th.sides[e.side] || th.sides.foe), 1];
  let body = e.look?.color ? [...hexToRgb(e.look.color), 1] : [...th.foeBody, 1];
  if (e.dead) body = [0.4, 0.4, 0.4, 1];
  const k = girth(e, G);
  b.lathe(0, 0, 0, p.profile.map(([r, y]) => [r * k, y * k]), p.sides, p.sides === 4 ? Math.PI / 4 : 0, (seg) => (seg < 2 ? base : body));
  return b;
}
export function makeBlob(th) { const b = new Builder(), sh = th.shadow ?? { a: 0.4 }; b.blob(0, 0, 0, 1, sh.a, sh); return b; }

const VEIL = [0.04, 0.05, 0.09];
export function makeVeil(map, r) {
  const G = gridOf(map), lv = map.levels.find((l) => l.id === r.level), b = new Builder(G);
  for (const k of r.hexes ?? []) {
    const t = lv?.tiles[k]; if (!t) continue;
    const w = G.toWorld(cellParse(k));
    b.flatHex(w.x, w.z, surfY(lv.z + (t.h ?? 0), t) + 0.05, 0, 1.02, [...VEIL, 1]);
  }
  return b;
}

// ---------- terrain ----------
// `hasPicture(levelId)` says whether a level's picture has arrived. Returns the builders, the floors (for walls and the cut-away) and
// the pictures to draw ({ asset, x0, x1, z0, z1, y }).
export function buildTerrain({ map, enc, sight, theme: th, ceiling, hasPicture = () => false }) {
  const G = gridOf(map), b = new Builder(G), sb = new Builder(), gb = new Builder(G), sh = th.shadow ?? { a: 0.4 };
  const hid = (levelId) => (map.levels.find((l) => l.id === levelId)?.z ?? 0) > ceiling;
  const caves = th.floors === 'rooms' && th.caves ? new Set(caveLevels(map)) : new Set();
  const rooms = th.floors === 'rooms' ? new Set([...map.levels.filter((l) => map.walls.some((w) => w.level === l.id) || map.regions.some((r) => r.level === l.id)).map((l) => l.id), ...caves]) : new Set();
  const now = new Map(Object.entries(sight?.now ?? {}).map(([l, cols]) => [l, new Set(cols)]));
  const seenShade = (levelId, k) => (!sight ? 1 : !now.get(levelId)?.has(k) ? 0.5 : sight.light?.[levelId]?.[k] === 'dark' ? 0.38 : sight.light?.[levelId]?.[k] === 'dim' ? 0.7 : 1);
  const tintOf = (lv, key, base) => {
    let c = base.slice();
    if (enc && !enc.arena[key]) { const g = (c[0] + c[1] + c[2]) / 3; c = c.map((v) => (v * 0.35 + g * 0.65) * 0.5); }
    if (!shown(map, lv.id, { ...cellParse(key), z: lv.z + (lv.tiles[key]?.h ?? 0) })) c = c.map((v, i) => v * 0.45 + (i === 2 ? 0.1 : 0.02));
    const f = seenShade(lv.id, key);
    return f === 1 ? c : c.map((v) => v * f);
  };
  const pictured = new Set(map.levels.filter((l) => hasPicture(l.id) && !hid(l.id)).map((l) => l.id)), pictures = [];
  for (const l of map.levels) {
    if (!pictured.has(l.id)) continue;
    const { asset, feet: [fw, fh], origin: [ox, oy] } = l.image;
    pictures.push({ asset, y: surfY(l.z), x0: ox * UNIT, x1: (ox + fw) * UNIT, z0: oy * UNIT, z1: (oy + fh) * UNIT });
  }
  for (const h of allTiles(map)) {
    if (h.z > ceiling) continue;
    if (pictured.has(h.level.id)) {
      const w = G.toWorld(h), inFight = enc && enc.arena[cellCol(h)];
      gb.flatHex(w.x, w.z, surfY(h.z, h.tile) + 0.012, 0.94, 1, inFight ? [...th.arenaRim, 0.7] : shown(map, h.level.id, h) ? [0.06, 0.06, 0.08, 0.3] : [0.3, 0.4, 0.9, 0.35]);
      continue;
    }
    if (caves.has(h.level.id)) continue;
    const t = h.tile, w = G.toWorld(h), locked = enc && !enc.arena[cellCol(h)], y = surfY(h.z, t), room = rooms.has(h.level.id);
    const lowest = surfaces(map, h)[0].z === h.z;
    const j = room ? 1 : 0.94 + jitter(h.q, h.r) * 0.12;
    let c = th.tiles[t.t].map((v) => v * j);
    if (locked) { const g = (c[0] + c[1] + c[2]) / 3; c = c.map((v) => (v * 0.35 + g * 0.65) * 0.5); }
    if (!shown(map, h.level.id, h)) c = c.map((v, i) => v * 0.45 + (i === 2 ? 0.1 : 0.02));
    const f = seenShade(h.level.id, cellCol(h));
    if (f !== 1) c = c.map((v) => v * f);
    const rim = enc && !locked ? [...th.arenaRim, 1] : shade(c, th.rim);
    if (!room) {
      b.flatHex(w.x, w.z, y, 0, 0.86, [...c, 1]);
      b.flatHex(w.x, w.z, y, 0.86, 1, rim);
      const top = b.cellRing(w.x, w.z, 1, y), bot = b.cellRing(w.x, w.z, 1, lowest ? Math.min(-1.5, y - 1.5) : y - SLAB);
      for (let i = 0; i < top.length; i++) { const n = (i + 1) % top.length; b.quad(top[i], top[n], bot[n], bot[i], shade(c, th.side)); }
    }
    if (t.t === 'forest') {
      const tc = locked ? shade(th.tree, 0.45) : [...th.tree, 1];
      for (let i = 0; i < 2; i++) {
        const a = jitter(h.q + i * 7, h.r - i * 3) * 6.28, d = 0.28 + 0.2 * i, hh = 0.9 + jitter(h.r, h.q + i) * 0.7;
        const tx = w.x + Math.cos(a) * d, tz = w.z + Math.sin(a) * d;
        b.lathe(tx, tz, y, [[0.1, 0], [0.1, 0.25], [0.42, 0.25], [0, hh + 0.25]], 6, a, (s) => (s === 0 ? shade(tc, 0.5) : tc));
        sb.blob(tx - 0.16, tz - 0.12, y + 0.012, 0.5 + hh * 0.12, sh.a * (locked ? 0.6 : 1), sh);
      }
    }
  }
  const floors = rooms.size ? buildFloors(map, { levels: [...rooms].filter((id) => !hid(id) && !pictured.has(id)), caves: [...caves] }) : { levels: [] };
  const wpt = (p, y) => [p[0] * UNIT, y, p[1] * UNIT];
  for (const fl of floors.levels) {
    const lv = map.levels.find((l) => l.id === fl.id);
    for (const pa of fl.patches) {
      const y = pa.top * UNIT;
      for (const cell of pa.cells) {
        const t = lv.tiles[cell.hex], key = cell.hex, locked = enc && !enc.arena[key], hex = cellParse(key), hz = lv.z + (t.h ?? 0);
        let c = th.tiles[t.t].slice();
        if (locked) { const g = (c[0] + c[1] + c[2]) / 3; c = c.map((v) => (v * 0.35 + g * 0.65) * 0.5); }
        if (!shown(map, lv.id, { ...hex, z: hz })) c = c.map((v, i) => v * 0.45 + (i === 2 ? 0.1 : 0.02));
        const f = seenShade(lv.id, key);
        if (f !== 1) c = c.map((v) => v * f);
        const inArena = enc && !locked, grid = inArena ? [...th.arenaRim, 1] : shade(c, th.grid ?? 0.92);
        const { inner, rim } = cellParts(cell, inArena ? 0.9 : 0.955, G);
        const fan = (poly, col) => { const m = wpt(centroidOf(poly), y); for (let i = 0; i < poly.length; i++) b.tri(wpt(poly[(i + 1) % poly.length], y), wpt(poly[i], y), m, col); };
        if (inner) fan(inner, [...c, 1]);
        for (const r of rim) fan(r, grid);
      }
      for (const e of pa.outline) {
        if (e.kind !== 'open' && e.kind !== 'drop') continue;
        if (e.kind === 'open' && caves.has(fl.id)) continue;
        const t = lv.tiles[e.hex], key = e.hex, locked = enc && !enc.arena[key];
        let c = th.tiles[t.t].slice();
        if (locked) { const g = (c[0] + c[1] + c[2]) / 3; c = c.map((v) => (v * 0.35 + g * 0.65) * 0.5); }
        if (!shown(map, lv.id, { ...cellParse(key), z: lv.z + (t.h ?? 0) })) c = c.map((v, i) => v * 0.45 + (i === 2 ? 0.1 : 0.02));
        const f = seenShade(lv.id, key);
        if (f !== 1) c = c.map((v) => v * f);
        const low = e.lowest ? Math.min(-1.5, y - 1.5) : y - SLAB, bot = e.kind === 'drop' ? Math.min(low, e.toTop * UNIT) : low;
        const A = wpt(e.a, y), B = wpt(e.b, y), a2 = wpt(e.a, bot), b2 = wpt(e.b, bot);
        b.quad(A, B, b2, a2, shade(c, th.side));
        const la = wpt(e.a, y + 0.03), lb = wpt(e.b, y + 0.03), ia = wpt(e.ia, y + 0.03), ib = wpt(e.ib, y + 0.03), fa = wpt(e.ia, y), fb = wpt(e.ib, y);
        b.quad(lb, la, ia, ib, shade(c, th.rim));
        b.quad(ib, ia, fa, fb, shade(c, th.rim * 0.9));
      }
    }
    if (caves.has(fl.id)) drawCave(b, caveOf(map, fl), lv, tintOf, th);
  }
  return { terrain: b, grid: gb, shadows: sb, floorData: floors.levels, pictures };
}

// A cave: the strip of floor out to the pushed edge, a face of rock standing up from it, and the rock as a dark mass at one height.
function drawCave(b, cv, lv, tintOf, th) {
  const rock = th.tiles.rock ?? [0.45, 0.43, 0.4], wpt = (p, y) => [p[0] * UNIT, y, p[1] * UNIT], noise = (p, k) => 0.5 + 0.5 * Math.sin(p[0] * 7.31 + p[1] * 3.17 + k);
  const lit = (c, f) => [c[0] * f, c[1] * f, c[2] * f, 1];
  for (const { closed, points } of cv.chains) {
    const m = closed ? points.length : points.length - 1;
    for (let i = 0; i < m; i++) {
      const a = points[i], c = points[(i + 1) % points.length], y = a.z * UNIT, top = a.top * UNIT, floor = tintOf(lv, a.hex, th.tiles[lv.tiles[a.hex].t]);
      b.quad(wpt(a.p, y), wpt(c.p, y), wpt(c.q, y), wpt(a.q, y), [...floor, 1]);
      const rc = tintOf(lv, a.hex, rock), v = 0.8 + 0.2 * noise(a.q, 0), mid = y + (top - y) * 0.4;
      b.quad(wpt(a.q, y), wpt(c.q, y), wpt(c.q, mid), wpt(a.q, mid), lit(rc, 0.55 * v));
      b.quad(wpt(a.q, mid), wpt(c.q, mid), wpt(c.q, top), wpt(a.q, top), lit(rc, 0.85 * v));
    }
  }
  for (const r of cv.rock) {
    const c0 = tintOf(lv, r.hex, rock), col = lit(c0, 0.5), n = r.ring.length, top = r.top * UNIT;
    const mid = [r.ring.reduce((s, p) => s + p[0], 0) / n, r.ring.reduce((s, p) => s + p[1], 0) / n], M = wpt(mid, top);
    for (let i = 0; i < n; i++) b.tri(wpt(r.ring[(i + 1) % n], top), wpt(r.ring[i], top), M, col);
    const face = (s, to, f) => { for (let j = 0; j < 3; j++) { const p = r.ring[(s + j) % n], q = r.ring[(s + j + 1) % n]; b.quad(wpt(p, top), wpt(q, top), wpt(q, to), wpt(p, to), lit(c0, f)); } };
    for (const s of r.bare) face(s, Math.min(-1.5, top - 1.5), 0.42);
    for (const s of r.steps) face(s.at, s.to * UNIT, 0.4);
  }
}

// The keys of the wall faces that are cut down for a camera turned by `yaw`, or null if there is no cut-away.
export function cutSetFor(th, floorData, yaw) {
  if (th.floors !== 'rooms' || th.cutaway === false || !floorData.length) return null;
  const toCam = [Math.sin(yaw), Math.cos(yaw)], out = new Set();
  for (const fl of floorData) for (const i of cutaway(fl.walls, toCam)) out.add(fl.walls[i].key);
  return out;
}

// Walls, doors and the things standing in hexes. `cut` is the set from cutSetFor (or null), `doors` maps an object id to its drawn state
// ({ v: 0 shut .. 1 open, tw }). Returns the builder and the info a swinging door is drawn from.
export function buildWalls({ map, theme: th, ceiling, floorData, cut: cutIn, doors }) {
  const G = gridOf(map), b = new Builder(G), doorInfo = new Map();
  const cutting = cutIn !== null, high = (id) => cutting && floorData.some((f) => f.id === id), cut = cutIn ?? new Set();
  const hid = (levelId) => (map.levels.find((l) => l.id === levelId)?.z ?? 0) > ceiling;
  const col = { wall: th.wall ?? [0.44, 0.42, 0.4], window: th.wallWindow ?? [0.55, 0.62, 0.68], curtain: th.curtain ?? [0.38, 0.3, 0.45] };
  const LOW = { wall: 1.15, window: 0.55, rail: 0.5, curtain: 1.15 };
  const baseOf = (id) => (map.levels.find((l) => l.id === id)?.z ?? 0) * UNIT + 0.55;
  const half = 0.09, capped = (c) => shade(c, 0.5);
  const run = (kind, level, key, p, q, base = baseOf(level)) => {
    if (!high(level) || kind === 'rail' || cut.has(key)) return b.slab(p, q, base, LOW[kind] ?? LOW.wall, half, col[kind] ?? col.wall, high(level) && kind !== 'rail' ? capped(col[kind] ?? col.wall) : null);
    if (kind === 'window') { b.slab(p, q, base, SILL, half, col.wall); b.slab(p, q, base + SILL, WINDOW_TOP - SILL, half, col.window); return; }
    b.slab(p, q, base, FULL, half, col[kind] ?? col.wall);
  };
  for (const fl of floorData) {
    if (hid(fl.id)) continue;
    for (const post of fl.posts) {
      const s = 0.26, up = post.keys.some((k) => !cut.has(k)), kind = post.kind === 'rail' ? 'rail' : post.kind === 'window' ? 'wall' : post.kind;
      if (high(fl.id) && up && kind !== 'rail') b.slab([post.at[0] - s, post.at[1]], [post.at[0] + s, post.at[1]], baseOf(fl.id), post.kind === 'window' ? WINDOW_TOP : FULL + 0.04, half, col[kind] ?? col.wall);
      else b.slab([post.at[0] - s, post.at[1]], [post.at[0] + s, post.at[1]], baseOf(fl.id), (LOW[post.kind] ?? LOW.wall) + 0.04, half, col[post.kind] ?? col.wall, high(fl.id) && post.kind !== 'rail' ? capped(col[post.kind] ?? col.wall) : null);
    }
  }
  for (const w of map.walls) if (!hid(w.level)) run(w.kind, w.level, `w:${w.id}`, w.a, w.b);
  for (const o of map.objects) {
    if (hid(o.level)) continue;
    const seg = objectSegment(o, G), unseen = !!objectDef(o)?.states[o.state]?.hidden;
    if (!seg) {
      const lv = map.levels.find((l) => l.id === o.level), w = G.toWorld(o.at), y = stand(map, { q: o.at.q, r: o.at.r, z: (lv?.z ?? 0) + (lv?.tiles[cellCol(o.at)]?.h ?? 0) }).y + 0.02;
      const trap = !!objectDef(o)?.triggers?.some((t) => t.effects), c = trap ? [0.75, 0.2, 0.18] : [0.8, 0.68, 0.3];
      b.flatHex(w.x, w.z, y, 0.34, 0.5, [...c, unseen ? 0.45 : 1]);
      if (o.def === 'pit-trap' && o.state === 'open') b.flatHex(w.x, w.z, y + 0.005, 0, 0.6, [0.05, 0.05, 0.06, 1]);
      if (objectBlocks(o, 'move') || o.def === 'lever') b.lathe(w.x, w.z, y, [[0.12, 0], [0.12, o.def === 'lever' ? 0.7 : 1.1], [0, o.def === 'lever' ? 0.8 : 1.2]], 6, 0, () => [...c, 1]);
      continue;
    }
    const shut = objectBlocks(o, 'move'), c = th.door ?? [0.5, 0.33, 0.17], tall = high(o.level) && !cut.has(`o:${o.id}`), leaf = tall ? DOOR_TALL : unseen ? 1.25 : 1.0;
    if (tall) b.slab(seg[0], seg[1], baseOf(o.level) + DOOR_TALL, FULL - DOOR_TALL, 0.09, th.wall ?? [0.44, 0.42, 0.4]);
    const d = doors.get(o.id), closing = Object.values(objectDef(o)?.states ?? {}).find((st) => st.blocks?.includes('move'));
    const shutCol = unseen ? [0.62, 0.3, 0.55] : (shut ? objectBlocks(o, 'sight') : closing?.blocks.includes('sight')) ? c : [0.3, 0.3, 0.32];
    if (d?.tw) { doorInfo.set(o.id, { seg, y0: baseOf(o.level), h: leaf, open: c, shut: shutCol }); continue; }
    const isShut = d ? d.v === 0 : shut;
    if (isShut) b.slab(seg[0], seg[1], baseOf(o.level), leaf, 0.07, shutCol);
    else { const [p, q] = seg, dx = q[0] - p[0], dy = q[1] - p[1]; b.slab(p, [p[0] - dy * 0.8, p[1] + dx * 0.8], baseOf(o.level), leaf, 0.05, c); }
  }
  return { b, doorInfo };
}

// A door that is swinging: the leaf turns about its hinge (the first end of its line) from the shut line to the open one.
export function swingDoor(b, info, f) {
  const [p, q] = info.seg, dx = q[0] - p[0], dy = q[1] - p[1], th = (f * Math.PI) / 2, len = 1 - 0.2 * f;
  const ex = p[0] + (dx * Math.cos(th) - dy * Math.sin(th)) * len, ey = p[1] + (dx * Math.sin(th) + dy * Math.cos(th)) * len;
  b.slab(p, [ex, ey], info.y0, info.h, 0.07 - 0.02 * f, info.shut.map((v, i) => v + (info.open[i] - v) * f));
}

// The glowing curtain round the arena of a fight. `base` is the mean height it grows from.
export function buildEdge({ map, enc, theme: th, ceiling }) {
  const G = gridOf(map), eb = new Builder(G);
  let base = 0;
  if (enc) {
    const glow = th.arenaRim.map((v) => v * 0.95 + 0.05), tall = 2.1, v = (p, col) => eb.d.push(p[0], p[1], p[2], 0, 1, 0, col[0], col[1], col[2], col[3]);
    const quad2 = (a, b, c, d, ca, cb, cc, cd) => { for (const o of [[a, b, c, d, ca, cb, cc, cd], [d, c, b, a, cd, cc, cb, ca]]) { const [p0, p1, p2, p3, c0, c1, c2, c3] = o; v(p0, c0); v(p1, c1); v(p2, c2); v(p0, c0); v(p2, c2); v(p3, c3); } };
    let ys = 0, ny = 0;
    for (const h of allTiles(map)) {
      if (h.z > ceiling || !enc.arena[cellCol(h)]) continue;
      const w = G.toWorld(h), y = surfY(h.z, h.tile) + 0.03;
      ys += y; ny++; base = ys / ny;
      const top = eb.cellRing(w.x, w.z, 1.02, y), inner = eb.cellRing(w.x, w.z, 0.86, y);
      for (let i = 0; i < top.length; i++) {
        const n = (i + 1) % top.length, [sx, sz] = sideAt(eb.shape, i), out = G.fromWorld(w.x + sx * 1.8, w.z + sz * 1.8);
        if (enc.arena[cellCol(out)]) continue;
        const lo = [...glow, 0.85], hi = [...glow, 0];
        quad2(top[i], top[n], [top[n][0], y + tall, top[n][2]], [top[i][0], y + tall, top[i][2]], lo, lo, hi, hi);
        quad2(inner[i], inner[n], top[n], top[i], [...glow, 0.35], [...glow, 0.35], [...glow.map((x) => x * 0.5 + 0.5), 1], [...glow.map((x) => x * 0.5 + 0.5), 1]);
      }
    }
  }
  return { b: eb, base };
}

// Highlights, lasting zones, the marks under fliers, rings, the editor's pins and the bars across steps a wall stops.
export function buildOverlay({ state: s, hl, theme: th, pins = [], pinZ = 0, bars = [], barZ = 0 }) {
  const G = gridOf(s.map), b = new Builder(G), c = th.hl;
  const top = (k) => stand(s.map, cellParse(k)).y + 0.03;
  const at = (k) => G.toWorld(cellParse(k));
  for (const fx of s.effects ?? []) {
    const zh = zoneHexes(s, fx); if (!zh?.hexes.length) continue;
    const t = zoneType(fx.zone.steps), rgb = th.zones?.[t ?? 'neutral'] ?? ZONE_TINT[t ?? 'neutral'], have = new Set(zh.hexes.map(cellCol));
    for (const h of zh.hexes) {
      const w = G.toWorld(h), y = stand(s.map, { q: h.q, r: h.r, z: zh.at }).y + 0.015, rim = G.neighbors(h).some((n) => !have.has(cellCol(n)));
      b.flatHex(w.x, w.z, y, 0, rim ? 0.8 : 1.02, [...rgb, 0.3]);
      if (rim) b.flatHex(w.x, w.z, y, 0.8, 0.98, [...rgb, 0.12]);
    }
  }
  for (const k of hl.move) { const w = at(k); b.flatHex(w.x, w.z, top(k), 0, 0.78, c.move); }
  for (const k of hl.area) { const w = at(k); b.flatHex(w.x, w.z, top(k) + 0.01, 0, 0.92, c.area); }
  for (const e of Object.values(s.entities)) { const sf = !e.dead && !ground(s.map, e.pos) ? under(s.map, e.pos) : null; if (sf) { const w = G.toWorld(e.pos); b.flatHex(w.x, w.z, stand(s.map, { q: e.pos.q, r: e.pos.r, z: sf.z }).y + 0.02, 0.2, 0.42, [0, 0, 0, 0.45]); } }
  const ringOn = (id, col, r0 = 0.66, r1 = 0.94) => {
    const e = s.entities[id]; if (!e) return;
    for (const f of footprint(e, e.pos, G)) { const k = cellKey(f), w = at(k); b.flatHex(w.x, w.z, top(k) + 0.02, r0, r1, col); }
  };
  for (const id of hl.targets) ringOn(id, c.target);
  for (const id of hl.allies) ringOn(id, c.ally);
  if (hl.turn) ringOn(hl.turn, [...th.arenaRim, 0.95], 0.72, 0.98);
  if (hl.selected) ringOn(hl.selected, c.select, 0.56, 0.68);
  if (pins.length) {
    const y = surfY(pinZ ?? 0) + 0.06, red = [0.95, 0.15, 0.15, 0.95];
    for (const [x, z] of pins) b.flatHex(x * UNIT, z * UNIT, y, 0, 0.32, red);
    for (let i = 1; i < pins.length; i++) {
      const p = pins[i - 1], q = pins[i], ax = p[0] * UNIT, az = p[1] * UNIT, bx = q[0] * UNIT, bz = q[1] * UNIT, len = Math.hypot(bx - ax, bz - az) || 1, nx = (-(bz - az) / len) * 0.06, nz = ((bx - ax) / len) * 0.06;
      b.quad([ax + nx, y, az + nz], [ax - nx, y, az - nz], [bx - nx, y, bz - nz], [bx + nx, y, bz + nz], red);
      b.quad([ax - nx, y, az - nz], [ax + nx, y, az + nz], [bx + nx, y, bz + nz], [bx - nx, y, bz - nz], red);
    }
  }
  if (bars.length) {
    const y = surfY(barZ) + 0.05, amber = [1, 0.62, 0.1, 0.95];
    for (const [x1, y1, x2, y2] of bars) {
      const mx = ((x1 + x2) / 2) * UNIT, mz = ((y1 + y2) / 2) * UNIT, dx = (x2 - x1) * UNIT, dz = (y2 - y1) * UNIT, len = Math.hypot(dx, dz) || 1, ux = (dx / len) * 0.2, uz = (dz / len) * 0.2, nx = (-uz / 0.2) * 0.04, nz = (ux / 0.2) * 0.04;
      b.quad([mx - ux + nx, y, mz - uz + nz], [mx - ux - nx, y, mz - uz - nz], [mx + ux - nx, y, mz + uz - nz], [mx + ux + nx, y, mz + uz + nz], amber);
      b.quad([mx - ux - nx, y, mz - uz - nz], [mx - ux + nx, y, mz - uz + nz], [mx + ux + nx, y, mz + uz + nz], [mx + ux - nx, y, mz + uz - nz], amber);
    }
  }
  return b;
}
