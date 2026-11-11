// Hex grid math. Axial coordinates {q, r}, pointy-top layout, 1 hex = 5 ft.
export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export const key = (h) => `${h.q},${h.r}`;
export const parse = (k) => { const [q, r] = k.split(',').map(Number); return { q, r }; };
export const dist = (a, b) =>
  (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
export const neighbors = (h) => DIRS.map(([dq, dr]) => ({ q: h.q + dq, r: h.r + dr }));

export function range(c, n) {
  const out = [];
  for (let dq = -n; dq <= n; dq++)
    for (let dr = Math.max(-n, -dq - n); dr <= Math.min(n, -dq + n); dr++)
      out.push({ q: c.q + dq, r: c.r + dr });
  return out;
}

const S3 = Math.sqrt(3);
export const toWorld = (h, size = 1) => ({ x: size * S3 * (h.q + h.r / 2), z: size * 1.5 * h.r });
export function fromWorld(x, z, size = 1) {
  const fq = (S3 / 3 * x - z / 3) / size, fr = (2 / 3 * z) / size, fs = -fq - fr;
  let q = Math.round(fq), r = Math.round(fr); const s = Math.round(fs);
  const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s; else if (dr > ds) r = -q - s;
  return { q, r };
}

// Dijkstra flood. costFn(hex) -> cost to enter (Infinity = blocked).
// Returns Map key -> {cost, prev}.
export function reachable(start, budget, costFn) {
  const out = new Map([[key(start), { cost: 0, prev: null }]]);
  const open = [{ h: start, cost: 0 }];
  while (open.length) {
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].cost < open[bi].cost) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.cost > out.get(key(cur.h)).cost) continue;
    for (const n of neighbors(cur.h)) {
      const c = cur.cost + costFn(n);
      if (!(c <= budget)) continue;
      const k = key(n), old = out.get(k);
      if (!old || c < old.cost) { out.set(k, { cost: c, prev: key(cur.h) }); open.push({ h: n, cost: c }); }
    }
  }
  return out;
}

// Path of hexes from (excluding) the start to the target key.
export function pathTo(reach, targetKey) {
  const path = [];
  for (let k = targetKey; k && reach.get(k)?.prev !== null; k = reach.get(k).prev) path.unshift(parse(k));
  return path;
}

// 60-degree wedge of hexes from origin toward aim, out to n hexes (grid version of a cone).
export function cone(origin, aim, n) {
  const o = toWorld(origin), a = toWorld(aim);
  const dx = a.x - o.x, dz = a.z - o.z, dl = Math.hypot(dx, dz);
  if (!dl) return [];
  return range(origin, n).filter((h) => {
    if (h.q === origin.q && h.r === origin.r) return false;
    const w = toWorld(h), vx = w.x - o.x, vz = w.z - o.z;
    const cos = (vx * dx + vz * dz) / (Math.hypot(vx, vz) * dl);
    return cos >= Math.cos((30.5 * Math.PI) / 180);
  });
}
