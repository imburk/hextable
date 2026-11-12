// Hex grid math. Axial coordinates {q, r}, pointy-top layout, 1 hex = 5 ft.
// A position may carry a height `z` in feet. `col` names the hex column whatever the height;
// `key` names the exact position, and is the same as `col` at height 0.
export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
export const col = (h) => `${h.q},${h.r}`;
export const key = (h) => (h.z ? `${h.q},${h.r},${h.z}` : `${h.q},${h.r}`);
export const parse = (k) => { const [q, r, z] = k.split(',').map(Number); return z === undefined ? { q, r } : { q, r, z }; };
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

// Dijkstra flood. stepsFn(position) -> [{ h, cost, max? }]: where one step from there can lead,
// what it costs, and optionally the most that may have been spent in all once it is taken (so
// that different ways of moving can have different allowances). Returns Map key -> {cost, prev, h}.
export function reachable(start, budget, stepsFn) {
  const out = new Map([[key(start), { cost: 0, prev: null, h: start }]]);
  // A heap ordered by cost, then by the order things were added, so that among equal routes the
  // first one found wins. Replays depend on that staying the same.
  let seq = 0;
  const heap = [{ h: start, cost: 0, seq: seq++ }];
  const before = (a, b) => a.cost < b.cost || (a.cost === b.cost && a.seq < b.seq);
  const push = (x) => { x.seq = seq++; let i = heap.push(x) - 1; while (i > 0) { const p = (i - 1) >> 1; if (!before(heap[i], heap[p])) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && before(heap[l], heap[m])) m = l; if (r < heap.length && before(heap[r], heap[m])) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; }
    }
    return top;
  };
  while (heap.length) {
    const cur = pop();
    if (cur.cost > out.get(key(cur.h)).cost) continue;
    for (const { h: n, cost, max } of stepsFn(cur.h)) {
      const c = cur.cost + cost;
      if (!(c <= budget) || (max !== undefined && c > max)) continue;
      const k = key(n), old = out.get(k);
      if (!old || c < old.cost) { out.set(k, { cost: c, prev: key(cur.h), h: n }); push({ h: n, cost: c }); }
    }
  }
  return out;
}

// Path of positions from (excluding) the start to the target key.
export function pathTo(reach, targetKey) {
  const path = [];
  for (let k = targetKey; k && reach.get(k)?.prev !== null; k = reach.get(k).prev) path.unshift(reach.get(k).h);
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
