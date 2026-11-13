// Sight: line of sight and cover, worked out on hexes from the centre and the corners, and light.
// Design: docs/specs/sight.md, decisions 1 to 3.
import * as H from './hex.js';
import { FT, WALL_HEIGHT, apart, footprint, gap, ground, regionAt, shapeOf, surfaces, under } from './space.js';
import { barriers, center, objectDef } from './walls.js';
import { has } from './modifiers.js';
import { obscuredAt, terrainsOf } from './terrain.js';

const S3 = Math.sqrt(3), CORNER = (FT / S3) * 0.9;        // a little inside the true corner, so a wall on the hex's own edge is not "in front of" it
const CORNERS = [0, 1, 2, 3, 4, 5].map((i) => { const a = (Math.PI / 180) * (30 + 60 * i); return [CORNER * Math.cos(a), CORNER * Math.sin(a)]; });
const EYE = FT / 2;                                        // lines run from mid-body to mid-body

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
  return hi.z > lo.z && surfaces(map, lo).some((sf) => sf.z > lo.z && sf.z <= hi.z && !(H.col(lo) === H.col(hi) && sf.z === hi.z && !ground(map, hi)));
}

const memo = new WeakMap();
const MEMO_MAX = 200000;                                   // lines kept per map before the table is started afresh
// What can be made out of hex `b` from the centre of hex `a`: { centre, corners } where corners
// counts how many of b's six are reached past everything that stops both movement and sight, and
// `low` says whether a rail or low wall lies on the way to the centre.
// With `what` = 'sight' the lines are stopped by whatever blocks sight alone (a curtain too, a
// window or a rail not): that is seeing, where 'both' is reaching.
export function sightline(map, a, b, what = 'both') {
  const B = barriers(map);
  let had = memo.get(map);
  if (!had || had.sig !== B.sig || had.at.size > MEMO_MAX) memo.set(map, had = { sig: B.sig, at: new Map() });
  const k = `${what}|${a.q},${a.r},${a.z}|${b.q},${b.r},${b.z}`;
  let v = had.at.get(k);
  if (v) return v;
  if (floored(map, a, b)) v = { centre: false, corners: 0, low: false };
  else if (a.q === b.q && a.r === b.r) v = { centre: true, corners: 6, low: false };
  else {
    const p = center(a), c = center(b);
    let corners = 0;
    // A corner counts if it is reached and is on the target's own side of any wall that cuts through its hex.
    for (const [dx, dy] of CORNERS) {
      const k2 = [c[0] + dx, c[1] + dy];
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
  const pa = a.pos ? footprint(a) : [a], pb = b.pos ? footprint(b) : [b];
  return pa.some((x) => pb.some((y) => inView(map, x, y)));
}

export const COVER = { none: 0, half: 2, threeQuarters: 5 };
// The cover a target has from an attacker, or from a point an effect starts at: 'none', 'half',
// 'threeQuarters' or 'total'. For big creatures the most exposed pairing of their hexes counts.
// `from` is a creature or a position; `others` are creatures that might stand in the way.
export function coverOf(s, from, target, others = []) {
  const map = s.map, rules = s.settings ?? {};
  const origins = from.pos ? footprint(from) : [from], parts = footprint(target);
  let best = { corners: -1 };
  for (const o of origins) for (const t of parts) {
    const a = sightline(map, o, t), b = a.corners === 6 ? a : sightline(map, t, o);
    const v = { corners: Math.max(a.corners, b.corners), centre: a.centre || b.centre, low: a.low, o, t };
    if (v.corners > best.corners) best = v;
  }
  if (best.corners === 0 && !best.centre) return 'total';
  if (rules.cover === 'off') return 'none';
  if (best.corners <= 2) return 'threeQuarters';
  if (best.corners <= 4 || best.low) return 'half';
  // A creature standing on the line between them gives half cover.
  if (rules.creatureCover !== 'off' && H.dist(best.o, best.t) > 1) {
    const p = center(best.o), q = center(best.t), len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    for (const c of others) {
      if (c === from || c === target || c.dead || Math.abs(c.pos.z - Math.min(best.o.z, best.t.z)) >= FT * 2) continue;
      for (const f of shapeOf(c).length === 1 ? [c.pos] : footprint(c)) {
        const m = center(f), t = ((m[0] - p[0]) * (q[0] - p[0]) + (m[1] - p[1]) * (q[1] - p[1])) / (len * len);
        if (t > 0.05 && t < 0.95 && Math.hypot(m[0] - (p[0] + t * (q[0] - p[0])), m[1] - (p[1] + t * (q[1] - p[1]))) < 1.5) return 'half';
      }
    }
  }
  return 'none';
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
    if (level) out.push({ pos: { q: o.at.q, r: o.at.r, z: level.z + (level.tiles[H.col(o.at)]?.h ?? 0) }, bright: l.bright, dim: l.dim, object: o.id });
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
  if (terrainsOf(s).length) fog = Math.max(...(target.pos ? footprint(target) : [target]).map((p) => ({ heavy: 0, light: 1 })[obscuredAt(s, p)] ?? 2));
  if (fog === 0) return { see: 'no', why: 'obscured' };
  if (truesight) return fog === 1 ? { see: 'dim', why: 'obscured' } : { see: 'yes' };
  const src = sources ?? lightSources(s);
  let best = Math.max(...(target.pos ? footprint(target) : [target]).map((p) => LEVEL[lightAt(s, p, src)]));
  if ((senses.darkvision ?? 0) >= d) best = Math.min(2, best + 1);
  if (fog < best) return { see: 'dim', why: 'obscured' };
  return best === 2 ? { see: 'yes' } : best === 1 ? { see: 'dim', why: 'dim' } : { see: 'no', why: 'dark' };
}
export const canSee = (s, viewer, target, opts) => sees(s, viewer, target, opts).see;
