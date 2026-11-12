// Sight: line of sight and cover, worked out on hexes from the centre and the corners.
// Design: docs/specs/sight.md, decisions 1 and 2.
import * as H from './hex.js';
import { FT, WALL_HEIGHT, footprint, ground, shapeOf, surfaces } from './space.js';
import { barriers, center } from './walls.js';

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
// What can be made out of hex `b` from the centre of hex `a`: { centre, corners } where corners
// counts how many of b's six are reached past everything that stops both movement and sight, and
// `low` says whether a rail or low wall lies on the way to the centre.
export function sightline(map, a, b) {
  const B = barriers(map);
  let had = memo.get(map);
  if (!had || had.sig !== B.sig) memo.set(map, had = { sig: B.sig, at: new Map() });
  const k = `${a.q},${a.r},${a.z}|${b.q},${b.r},${b.z}`;
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
      if (!stopped(map, B, p, a.z, k2, b.z, ['both']) && !stopped(map, B, c, b.z, k2, b.z, ['both'])) corners++;
    }
    v = { centre: !stopped(map, B, p, a.z, c, b.z, ['both']), corners, low: stopped(map, B, p, a.z, c, b.z, ['low']) };
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
