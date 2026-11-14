// Writes the stock maps: node scripts/gen-maps.mjs [--ascii]
//
// The maps are our own layouts, drawn here with small helpers (rooms, discs, lines) in "offset"
// coordinates (column, row; odd rows sit half a hex to the right), and written out as plain data
// to packages/rules/src/content/maps/<id>.js. Walls are worked out from the rooms: a wall stands
// wherever a walled hex meets nothing, or a hex of another room, unless a door, an archway or a
// `join` says otherwise. What is committed is the data; this script is how it was made, so a map
// is changed here and written again. Nothing here runs in the game.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as H from '../packages/rules/src/hex.js';
import { edgeSegment } from '../packages/rules/src/walls.js';
import { SQUARE } from '../packages/rules/src/grid.js';
import { MAP_FORMAT, lintMap } from '../packages/rules/src/map.js';
import { CONTENT } from '../packages/rules/src/content/index.js';

const OUT = fileURLToPath(new URL('../packages/rules/src/content/maps/', import.meta.url));
const ASCII = process.argv.includes('--ascii');

// offset (column, row) -> axial. Odd rows are shifted right.
const ax = (c, r) => ({ q: c - ((r - (r & 1)) >> 1), r });
const DIR = { E: 0, NE: 1, NW: 2, W: 3, SW: 4, SE: 5 };
const nb = (h, d) => ({ q: h.q + H.DIRS[d][0], r: h.r + H.DIRS[d][1] });
const pair = (a, b) => { const x = H.col(a), y = H.col(b); return x < y ? `${x}|${y}` : `${y}|${x}`; };
const round6 = (n) => Math.round(n * 1e6) / 1e6;

// What a builder needs of its grid: where offset (column, row) is, the neighbour across side d, how many
// sides a cell has, the side's segment, and how to centre the finished map. Hexes are the original
// builder's; squares are plain columns and rows (E, N, W, S as the game numbers the sides), kept where
// they were drawn but moved so the north-west corner of the map is 0,0.
const HEXES = {
  kind: 'hex', at: ax, nb, DIR, sides: 6, dist: H.dist, seg: edgeSegment,
  shift(all) { return { q: Math.round(all.reduce((s, h) => s + h.q, 0) / all.length), r: Math.round(all.reduce((s, h) => s + h.r, 0) / all.length) }; },
};
const SQ_STEP = [[1, 0], [0, -1], [-1, 0], [0, 1]];
const SQUARES = {
  kind: 'square', at: (c, r) => ({ q: c, r }), nb: (h, d) => ({ q: h.q + SQ_STEP[d][0], r: h.r + SQ_STEP[d][1] }), DIR: { E: 0, N: 1, W: 2, S: 3 }, sides: 4,
  dist: (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r)), seg: SQUARE.edgeSegment,
  shift(all) { return { q: Math.min(...all.map((h) => h.q)), r: Math.min(...all.map((h) => h.r)) }; },
};

class Builder {
  constructor(id, name, grid = HEXES) {
    this.id = id; this.name = name;
    this.grid = grid;
    this.levels = []; this.regions = new Map(); this.doors = []; this.things = [];
    this.openEdges = new Set();       // hex pairs with no wall between them, on every level
    this.kinds = new Map();           // `${level}|${pair}` -> wall kind other than "wall"
    this.joined = new Set();          // `${regionA}|${regionB}`: no wall between these two rooms
    this.starts = [];
  }
  level(id, name, z, light) { const l = new Level(this, id, name, z, light); this.levels.push(l); return l; }
  region(id, name, level, light) { this.regions.set(id, { id, name, level, ...(light ? { light } : {}) }); }
  join(a, b) { this.joined.add(`${a}|${b}`); this.joined.add(`${b}|${a}`); }
  open(c, r, dir) { const h = this.grid.at(c, r); this.openEdges.add(pair(h, this.grid.nb(h, this.grid.DIR[dir]))); }
  start(...cr) { this.starts = cr.map(([c, r]) => this.grid.at(c, r)); }
}

class Level {
  constructor(b, id, name, z, light) { this.b = b; this.id = id; this.name = name; this.z = z; this.light = light; this.cells = new Map(); Object.assign(this, b.grid); }
  get(h) { return this.cells.get(H.col(h)); }
  put(h, spec) { this.cells.set(H.col(h), { t: 'stone', ...spec }); }
  hex(c, r, spec) { this.put(this.at(c, r), spec); return this; }
  rect(c0, r0, c1, r1, spec) { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.put(this.at(c, r), spec); return this; }
  disc(c, r, rad, spec) { for (const h of H.range(this.at(c, r), rad)) this.put(h, spec); return this; }
  // The hexes of a straight line from one offset hex to another.
  line(c0, r0, c1, r1, spec) {
    const a = this.at(c0, r0), b = this.at(c1, r1), n = H.dist(a, b);
    const cube = (h) => ({ x: h.q, z: h.r, y: -h.q - h.r });
    const A = cube(a), B = cube(b), got = [];
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 0, f = { x: A.x + (B.x - A.x) * t + 1e-6, y: A.y + (B.y - A.y) * t - 2e-6, z: A.z + (B.z - A.z) * t + 1e-6 };
      let x = Math.round(f.x), y = Math.round(f.y), z = Math.round(f.z);
      const dx = Math.abs(x - f.x), dy = Math.abs(y - f.y), dz = Math.abs(z - f.z);
      if (dx > dy && dx > dz) x = -y - z; else if (dy > dz) y = -x - z; else z = -x - y;
      this.put({ q: x, r: z }, spec); got.push({ q: x, r: z });
    }
    this.lastLine = got;
    return this;
  }
  path(points, spec) { for (let i = 0; i + 1 < points.length; i++) this.line(...points[i], ...points[i + 1], spec); return this; }
  erase(c0, r0, c1, r1) { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.cells.delete(H.col(this.at(c, r))); return this; }
  regionHexes(id) { return [...this.cells].filter(([, v]) => v.region === id).map(([k]) => H.parse(k)); }
  // Every pair of neighbouring hexes where one is in room `a` and the other in room `b`.
  between(a, b) {
    const out = [];
    for (const h of this.regionHexes(a)) for (let d = 0; d < this.sides; d++) { const n = this.nb(h, d); if (this.get(n)?.region === b) out.push({ h, d, n }); }
    return out.sort((x, y) => x.h.r - y.h.r || x.h.q - y.h.q || x.d - y.d);
  }
  // The pair nearest a point (offset coordinates), or the middle one.
  #pick(list, near) {
    if (!list.length) throw new Error('no hexes meet there');
    if (!near) return list[list.length >> 1];
    const p = this.at(...near);
    return [...list].sort((x, y) => this.dist(x.h, p) - this.dist(y.h, p))[0];
  }
  door(a, b, { def = 'door-wooden', state, near, name, key, dc, id } = {}) {
    const p = this.#pick(this.between(a, b), near);
    this.b.doors.push({ level: this.id, h: p.h, d: p.d, def, state, name, key, dc, id });
    this.b.openEdges.add(pair(p.h, p.n));
    return this;
  }
  // No wall between two rooms where they meet, or only at the pair nearest `near`.
  arch(a, b, { near } = {}) {
    if (near === undefined) { this.b.join(a, b); return this; }
    const p = this.#pick(this.between(a, b), near);
    this.b.openEdges.add(pair(p.h, p.n));
    return this;
  }
  // Turn the wall where two rooms meet into another kind (a bar's rail, a serving hatch's window).
  edges(a, b, kind, { skip = [] } = {}) {
    this.between(a, b).forEach((p, i) => { if (!skip.includes(i)) this.b.kinds.set(`${this.id}|${pair(p.h, p.n)}`, kind); });
    return this;
  }
  // The outer walls of a room, turned into windows or rails: every `every`-th one from `from`.
  outer(a, kind, every = 1, from = 0) {
    const list = [];
    for (const h of this.regionHexes(a)) for (let d = 0; d < this.sides; d++) if (!this.get(this.nb(h, d))) list.push({ h, d, n: this.nb(h, d) });
    list.sort((x, y) => x.h.r - y.h.r || x.h.q - y.h.q || x.d - y.d);
    list.forEach((p, i) => { if (i % every === from % every) this.b.kinds.set(`${this.id}|${pair(p.h, p.n)}`, kind); });
    return this;
  }
  thing(def, c, r, { state, name, key, dc, links } = {}) { this.b.things.push({ level: this.id, h: this.at(c, r), def, state, name, key, dc, links }); return this; }
  // A run of hexes along a direction that climbs (or, with a negative rise, drops) 2.5 ft a hex,
  // in room `region`. The hex after the last one lands on the next level (painted by the caller).
  stairs(c, r, dir, steps, rise, region, spec = {}) {
    let h = this.at(c, r);
    for (let i = 1; i <= steps; i++) { this.put(h, { ...spec, region, h: i * rise, walled: true }); h = this.nb(h, this.DIR[dir]); }
    return this;
  }
}

// ---------- writing the document ----------
// Join edges that continue one another in a straight line into one wall (both grids).
function joinWalls(raw) {
  const groups = new Map();
  for (const w of raw) {
    let [p, q] = [w.a, w.b];
    if (p[0] > q[0] + 1e-9 || (Math.abs(p[0] - q[0]) < 1e-9 && p[1] > q[1])) [p, q] = [q, p];
    const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
    const gk = `${w.kind}|${ux.toFixed(3)},${uy.toFixed(3)}|${(p[0] * uy - p[1] * ux).toFixed(3)}`;
    if (!groups.has(gk)) groups.set(gk, { kind: w.kind, ux, uy, ends: [] });
    groups.get(gk).ends.push({ s: p[0] * ux + p[1] * uy, e: q[0] * ux + q[1] * uy, p, q });
  }
  const merged = [];
  for (const g of groups.values()) {
    g.ends.sort((x, y) => x.s - y.s);
    let cur = null;
    for (const s of g.ends) {
      if (cur && s.s <= cur.e + 1e-6) { if (s.e > cur.e) { cur.e = s.e; cur.q = s.q; } } else { if (cur) merged.push({ kind: g.kind, ...cur }); cur = { ...s }; }
    }
    if (cur) merged.push({ kind: g.kind, ...cur });
  }
  merged.sort((x, y) => x.p[1] - y.p[1] || x.p[0] - y.p[0] || x.q[1] - y.q[1] || x.q[0] - y.q[0]);
  return merged;
}

function wallsOf(b, T) {
  const out = [];
  for (const L of b.levels) {
    const seen = new Set(), raw = [];
    const sorted = [...L.cells].sort(([x], [y]) => { const p = H.parse(x), q = H.parse(y); return p.r - q.r || p.q - q.q; });
    for (const [k, A] of sorted) {
      const h = H.parse(k);
      for (let d = 0; d < b.grid.sides; d++) {
        const n = b.grid.nb(h, d), pk = pair(h, n);
        if (seen.has(pk)) continue;
        seen.add(pk);
        const B = L.get(n), ra = A.region ?? '', rb = B?.region ?? '';
        let wall;
        if (!B) wall = !!A.walled;
        else wall = ra !== rb && (!!A.walled || !!B.walled) && !b.joined.has(`${ra}|${rb}`);
        if (!wall || b.openEdges.has(pk)) continue;
        const [p, q] = b.grid.seg(T(h), d);
        raw.push({ kind: b.kinds.get(`${L.id}|${pk}`) ?? 'wall', a: p, b: q });
      }
    }
    for (const w of joinWalls(raw)) out.push({ level: L.id, a: w.p.map(round6), b: w.q.map(round6), kind: w.kind });
  }
  out.forEach((w, i) => { w.id = `w${i + 1}`; });
  return out.map(({ id, level, a, b: bb, kind }) => ({ id, level, a, b: bb, kind }));
}

function finish(b) {
  // Hex maps are centred on the origin, square maps start at 0,0: shift every cell by the same amount.
  const all = b.levels.flatMap((L) => [...L.cells.keys()].map(H.parse));
  const { q: dq, r: dr } = b.grid.shift(all);
  const T = (h) => ({ q: h.q - dq, r: h.r - dr });
  const levels = b.levels.map((L) => {
    const tiles = {};
    for (const [k, v] of [...L.cells].sort(([x], [y]) => { const p = H.parse(x), q = H.parse(y); return p.r - q.r || p.q - q.q; })) {
      tiles[H.col(T(H.parse(k)))] = { t: v.t, ...(v.h ? { h: v.h } : {}) };
    }
    return { id: L.id, name: L.name, z: L.z, ...(L.light ? { light: L.light } : {}), tiles };
  });
  const regions = [];
  for (const meta of b.regions.values()) {
    const L = b.levels.find((x) => x.id === meta.level);
    const hexes = L.regionHexes(meta.id).map(T).sort((x, y) => x.r - y.r || x.q - y.q).map(H.col);
    if (!hexes.length) throw new Error(`room ${meta.id} has no hexes`);
    regions.push({ id: meta.id, name: meta.name, level: meta.level, ...(meta.light ? { light: meta.light } : {}), hexes });
  }
  for (const L of b.levels) for (const v of L.cells.values()) if (v.region && !b.regions.has(v.region)) throw new Error(`hex in unknown room ${v.region}`);
  const objects = [];
  let n = 0;
  for (const d of b.doors) {
    const at = T(d.h);
    objects.push({ id: `o${++n}`, def: d.def, level: d.level, at, edge: d.d, state: d.state ?? CONTENT.objects[d.def].initial, ...(d.name ? { name: d.name } : {}), ...(d.key ? { key: d.key } : {}), ...(d.dc ? { dc: d.dc } : {}) });
  }
  for (const t of b.things) {
    objects.push({ id: `o${++n}`, def: t.def, level: t.level, at: T(t.h), state: t.state ?? CONTENT.objects[t.def].initial, ...(t.name ? { name: t.name } : {}), ...(t.key ? { key: t.key } : {}), ...(t.dc ? { dc: t.dc } : {}), ...(t.links ? { links: t.links } : {}) });
  }
  // A door's state defaults to what its definition starts in; write it out so the file says so.
  const doc = { format: MAP_FORMAT, id: b.id, name: b.name, grid: b.grid.kind, cellFeet: 5, levels, walls: wallsOf(b, T), objects, regions, starts: b.starts.map((h) => T(h)) };
  return doc;
}

// ---------- the data file ----------
const flat = (v) => v === null || typeof v !== 'object' || (Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object' || (Array.isArray(x) && x.every((y) => typeof y !== 'object'))));
function ser(v, pad = '') {
  if (flat(v) || (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).every(flat) && JSON.stringify(v).length < 150)) {
    if (Array.isArray(v)) return `[${v.map((x) => ser(x)).join(', ')}]`;
    if (v && typeof v === 'object') return `{ ${Object.entries(v).map(([k, x]) => `${/^[A-Za-z_]\w*$/.test(k) ? k : JSON.stringify(k)}: ${ser(x)}`).join(', ')} }`;
    return JSON.stringify(v);
  }
  const inner = pad + '  ';
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + ser(x, inner)).join(',\n')},\n${pad}]`;
  return `{\n${Object.entries(v).map(([k, x]) => `${inner}${/^[A-Za-z_]\w*$/.test(k) ? k : JSON.stringify(k)}: ${ser(x, inner)}`).join(',\n')},\n${pad}}`;
}
function write(doc, note) {
  mkdirSync(OUT, { recursive: true });
  const body = `// ${doc.name}: a stock map. ${note}\n// Generated by scripts/gen-maps.mjs from its layout; change the script and write it again.\n// A plain map document (docs/specs/maps-and-objects.md): data only, no monsters.\nexport default ${ser(doc)};\n`;
  writeFileSync(`${OUT}${doc.id}.js`, body);
}

// A picture of a map for the console: one letter per room, # for rock, ~ water, T trees.
function ascii(doc) {
  if (doc.grid === 'square') return asciiSquares(doc);
  const names = new Map(doc.regions.map((r, i) => [r.id, String.fromCharCode(65 + (i % 26))]));
  for (const L of doc.levels) {
    const reg = new Map();
    for (const r of doc.regions) if (r.level === L.id) for (const k of r.hexes) reg.set(k, names.get(r.id));
    const ks = Object.keys(L.tiles).map(H.parse), r0 = Math.min(...ks.map((h) => h.r)), r1 = Math.max(...ks.map((h) => h.r));
    const x = (h) => h.q + h.r / 2, x0 = Math.min(...ks.map(x));
    console.log(`\n${doc.name} / ${L.name} (z ${L.z})`);
    for (let r = r0; r <= r1; r++) {
      let line = '';
      for (const h of ks.filter((k) => k.r === r).sort((a, c) => a.q - c.q)) {
        const t = L.tiles[H.col(h)], pos = Math.round((x(h) - x0) * 2);
        const ch = t.t === 'rock' ? '#' : t.t === 'water' ? '~' : (reg.get(H.col(h)) ?? (t.t === 'forest' ? 'T' : '.'));
        line = line.padEnd(pos, ' ') + ch;
      }
      console.log(line);
    }
  }
  console.log('\n' + doc.regions.map((r) => `${names.get(r.id)}=${r.name}`).join('  '));
}

function asciiSquares(doc) {
  const names = new Map(doc.regions.map((r, i) => [r.id, String.fromCharCode(65 + (i % 26))]));
  for (const L of doc.levels) {
    const reg = new Map();
    for (const r of doc.regions) if (r.level === L.id) for (const k of r.hexes) reg.set(k, names.get(r.id));
    const ks = Object.keys(L.tiles).map(H.parse), q1 = Math.max(...ks.map((h) => h.q)), r1 = Math.max(...ks.map((h) => h.r));
    console.log(`\n${doc.name} / ${L.name} (z ${L.z})`);
    for (let r = 0; r <= r1; r++) {
      let line = '';
      for (let q = 0; q <= q1; q++) { const t = L.tiles[`${q},${r}`]; line += !t ? ' ' : t.t === 'rock' ? '#' : t.t === 'water' ? '~' : (reg.get(`${q},${r}`) ?? '.'); }
      console.log(line);
    }
  }
  console.log('\n' + doc.regions.map((r) => `${names.get(r.id)}=${r.name}`).join('  '));
}

const maps = [];
const emit = (b, note) => { const doc = finish(b); const bad = lintMap(doc); if (bad.length) throw new Error(`${doc.id}: ${bad.join(' ')}`); write(doc, note); maps.push(doc); };

// =====================================================================================
// 1. The Copper Kettle: a tavern with a kitchen, a bar and a cellar below.
// =====================================================================================
{
  const b = new Builder('tavern', 'The Copper Kettle (tavern)');
  const g = b.level('ground', 'Ground floor', 0, 'bright');
  const c = b.level('cellar', 'Cellar', -10, 'dark');
  const rooms = [['yard', 'Inn yard and road'], ['common', 'Common room'], ['bar', 'Behind the bar'], ['kitchen', 'Kitchen'], ['pantry', 'Pantry', 'dim'], ['hall', 'Back hall'], ['stairs', 'Cellar stairs', 'dim']];
  for (const [id, name, light] of rooms) b.region(id, name, 'ground', light);
  for (const [id, name] of [['foot', 'Foot of the stairs'], ['cellar', 'Main cellar'], ['wine', 'Wine store'], ['cache', "Smugglers' cache"]]) b.region(id, name, 'cellar');
  // The yard and the road in front, then the house over it.
  g.rect(2, 14, 26, 18, { t: 'grass', region: 'yard' });
  g.rect(2, 18, 26, 18, { t: 'stone', region: 'yard' });
  g.rect(14, 14, 15, 17, { t: 'stone', region: 'yard' });
  const wall = (region, extra = {}) => ({ region, walled: true, ...extra });
  g.rect(11, 5, 22, 13, wall('common')).rect(5, 7, 10, 13, wall('common'));
  g.rect(5, 7, 9, 9, wall('bar'));
  g.rect(5, 2, 10, 6, wall('kitchen'));
  g.rect(11, 2, 12, 4, wall('pantry'));
  g.rect(13, 2, 17, 4, wall('hall'));
  g.stairs(18, 3, 'E', 3, -2.5, 'stairs');
  // Doors and openings on the ground floor.
  g.arch('hall', 'stairs');
  g.door('hall', 'common', { near: [15, 4] });
  g.door('kitchen', 'bar', { near: [7, 6] });
  g.door('kitchen', 'pantry', { state: 'locked', key: 'pantry key', name: 'Pantry door' });
  g.door('common', 'yard', { near: [15, 13], name: 'Front door' });
  g.edges('kitchen', 'common', 'window');                           // a serving hatch
  g.edges('bar', 'common', 'rail').arch('bar', 'common', { near: [9, 9] });     // the bar counter, with a flap to go through
  g.outer('common', 'window', 6, 3);
  g.thing('brazier', 22, 9, { name: 'Hearth' });
  g.thing('crate', 5, 8, { name: 'Ale barrel' }).thing('crate', 6, 8, { name: 'Ale barrel' }).thing('crate', 5, 2, { name: 'Flour sacks' });
  g.thing('crate', 11, 2, { name: 'Pantry shelves' });
  // The cellar.
  c.rect(21, 3, 21, 6, wall('foot'));
  c.rect(10, 7, 22, 12, wall('cellar'));
  c.rect(5, 8, 9, 11, wall('wine'));
  c.rect(15, 13, 18, 15, wall('cache'));
  b.open(20, 3, 'E');                                                // between the last step and the landing
  c.arch('foot', 'cellar');
  c.door('cellar', 'wine', { state: 'locked', key: 'cellar key', name: 'Wine store door' });
  c.door('cellar', 'cache', { def: 'secret-door', near: [16, 12], name: 'Smugglers’ door' });
  c.thing('crate', 11, 7, { name: 'Barrel' }).thing('crate', 12, 7, { name: 'Barrel' }).thing('crate', 13, 7, { name: 'Barrel' }).thing('crate', 19, 11, { name: 'Casks' });
  c.thing('chest', 6, 9, { name: 'Vintner’s chest', state: 'locked', key: 'cellar key' });
  c.thing('chest', 17, 14, { name: 'Smugglers’ chest' });
  b.start([15, 12], [14, 12], [16, 12], [14, 11], [15, 11]);
  emit(b, 'A common room, a bar, a kitchen with a locked pantry, and a cellar with a locked store and a secret door.');
}

// =====================================================================================
// 2. The Sunken Vault: a dungeon of eight rooms.
// =====================================================================================
{
  const b = new Builder('dungeon', 'The Sunken Vault (dungeon)');
  const g = b.level('ground', 'The vault', 0, 'dim');
  const rooms = [['entry', 'Entry hall'], ['store', 'Storeroom'], ['hall', 'Great hall'], ['armory', 'Armory'], ['barracks', 'Barracks'], ['shrine', 'Shrine'], ['crypt', 'Crypt', 'dark'], ['vault', 'Hidden vault', 'dark'],
    ['w-pass', 'West passage'], ['nw-pass', 'Storeroom passage'], ['n-pass', 'North passage'], ['s-pass', 'South passage'], ['e-pass', 'East passage'], ['c-pass', 'Crypt passage', 'dark'], ['v-pass', 'Secret passage', 'dark']];
  for (const [id, name, light] of rooms) b.region(id, name, 'ground', light);
  const W = (region) => ({ region, walled: true });
  g.rect(2, 10, 8, 16, W('entry'));
  g.rect(2, 2, 8, 6, W('store'));
  g.rect(5, 7, 5, 9, W('nw-pass'));
  g.rect(9, 13, 13, 13, W('w-pass'));
  g.disc(18, 13, 4, W('hall'));                                    // a hexagonal hall: its walls run on the diagonal
  g.rect(18, 7, 18, 8, W('n-pass'));
  g.rect(14, 2, 21, 6, W('armory'));
  g.rect(18, 18, 18, 20, W('s-pass'));
  g.rect(12, 21, 24, 25, W('barracks'));
  g.rect(23, 13, 26, 13, W('e-pass'));
  g.disc(30, 13, 3, W('shrine'));
  g.rect(30, 8, 30, 9, W('c-pass'));
  g.rect(28, 2, 35, 7, W('crypt'));
  g.rect(31, 17, 31, 18, W('v-pass'));
  g.rect(30, 19, 36, 24, W('vault'));
  // Doors.
  g.door('entry', 'w-pass', { def: 'door-wooden', state: 'open', name: 'Entry door' });
  g.door('entry', 'nw-pass', { state: 'closed' });
  g.door('nw-pass', 'store', { state: 'locked', key: 'iron key', name: 'Storeroom door' });
  g.door('w-pass', 'hall', { state: 'closed' });
  g.door('hall', 'n-pass', { state: 'closed' });
  g.door('n-pass', 'armory', { state: 'closed' });
  g.door('hall', 's-pass', { def: 'portcullis', state: 'raised', name: 'Barracks gate' });
  g.door('s-pass', 'barracks', { state: 'closed' });
  g.door('hall', 'e-pass', { state: 'closed' });
  g.arch('e-pass', 'shrine');
  g.door('shrine', 'c-pass', { def: 'door-iron', state: 'locked', key: 'crypt key', name: 'Crypt door' });
  g.arch('c-pass', 'crypt');
  g.door('shrine', 'v-pass', { def: 'secret-door', name: 'Hidden door behind the altar' });
  g.arch('v-pass', 'vault');
  g.thing('brazier', 3, 11, { name: 'Brazier' }).thing('brazier', 7, 11, { name: 'Brazier' });
  g.thing('crate', 3, 3, { name: 'Crates' }).thing('crate', 4, 3, { name: 'Crates' }).thing('crate', 8, 5, { name: 'Barrels' });
  g.thing('statue', 18, 13, { name: 'Weathered statue' });
  g.thing('brazier', 30, 13, { name: 'Altar brazier', state: 'out' });
  g.thing('chest', 33, 22, { name: 'Vault chest', state: 'locked' });
  g.thing('chest', 32, 4, { name: 'Sarcophagus hoard' });
  g.thing('crate', 15, 3, { name: 'Weapon racks' }).thing('crate', 20, 3, { name: 'Weapon racks' });
  b.start([5, 13], [4, 13], [6, 13], [5, 12], [5, 14]);
  emit(b, 'Eight rooms joined by passages: an open way in, a locked storeroom, a portcullis, a locked crypt and a secret vault.');
}

// =====================================================================================
// 3. Hollow Deep: a cave with a narrow passage, a pool and a ledge.
// =====================================================================================
{
  const b = new Builder('cave', 'Hollow Deep (cave)');
  const g = b.level('ground', 'The cave', 0, 'dark');
  b.region('mouth', 'Cave mouth', 'ground', 'bright');
  for (const [id, name] of [['narrows', 'The narrows'], ['cavern', 'Great cavern'], ['slope', 'The slope'], ['ledge', 'High ledge'], ['crawl', 'Crawlway'], ['grotto', 'Hidden grotto']]) b.region(id, name, 'ground');
  const hash = (a, b2) => { let h = (a * 374761393 + b2 * 668265263 + 97) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  g.rect(0, 0, 35, 25, { t: 'rock' });
  const floor = (region, extra = {}) => ({ t: 'stone', region, ...extra });
  // Chambers are discs with ragged edges; passages are single lines.
  const ragged = (c, r, rad, region, extra = {}) => {
    g.disc(c, r, rad, floor(region, extra));
    for (const h of H.range(ax(c, r), rad + 1)) {
      if (H.dist(h, ax(c, r)) === rad + 1 && hash(h.q, h.r) < 0.38 && h.r > 0 && h.r < 25) g.put(h, floor(region, extra));
    }
  };
  ragged(6, 19, 3, 'mouth');
  ragged(21, 13, 4, 'cavern'); ragged(17, 10, 2, 'cavern'); ragged(26, 16, 3, 'cavern'); ragged(24, 8, 2, 'cavern');
  g.path([[9, 18], [11, 16], [12, 14], [14, 12], [15, 11]], floor('narrows'));
  ragged(31, 3, 3, 'ledge', { h: 10 });
  ragged(31, 23, 2, 'grotto', { h: -2.5 });
  g.path([[26, 19], [27, 21], [29, 23]], floor('crawl'));
  // The pool and some stalagmites inside the cavern.
  for (const h of H.range(ax(22, 14), 1)) g.put(h, { t: 'water', region: 'cavern' });
  for (const [cc, rr] of [[18, 14], [25, 11], [20, 9], [27, 14], [19, 16], [23, 17]]) g.hex(cc, rr, { t: 'rock', region: 'cavern' });
  // The slope: three steps of 2.5 ft up from the cavern to the ledge (the ledge is 10 ft up, so
  // anywhere else along its edge it is a climb).
  g.line(26, 8, 30, 4, floor('slope'));
  const climb = g.lastLine;
  climb.forEach((h, i) => { if (i === 0) g.put(h, floor('cavern')); else if (i < climb.length - 1) g.put(h, floor('slope', { h: 2.5 * i })); else g.put(h, floor('ledge', { h: 10 })); });
  // A cave has no walls: the rock around the floor is the wall.
  b.start([5, 19], [6, 19], [7, 19], [5, 18], [6, 18]);
  emit(b, 'A cave mouth, a one-hex passage, a cavern with a pool, a slope up to a ledge, and a crawlway to a hidden grotto.');
}

// =====================================================================================
// 4. The Old Road: a forest road ambush with a stream and a bridge.
// =====================================================================================
{
  const b = new Builder('forest-road', 'The Old Road (forest ambush)');
  const g = b.level('ground', 'The road', 0, 'bright');
  for (const [id, name] of [['road-w', 'Road, west'], ['road-m', 'The bend'], ['road-e', 'Road, east'], ['bridge', 'Stone bridge'], ['stream', 'Stream and banks'], ['glade-n', 'North glade'], ['glade-s', 'South glade'], ['woods-n', 'North woods'], ['woods-s', 'South woods'], ['woods-e', 'East woods']]) b.region(id, name, 'ground');
  const hash = (a, b2) => { let h = (a * 374761393 + b2 * 668265263 + 31) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  g.rect(0, 0, 37, 23, { t: 'forest', region: 'woods-n' });
  g.rect(0, 12, 37, 23, { t: 'forest', region: 'woods-s' });
  // Two clearings, one on each side of the road.
  g.disc(15, 6, 5, { t: 'grass', region: 'glade-n' }).disc(9, 7, 3, { t: 'grass', region: 'glade-n' });
  g.disc(22, 17, 5, { t: 'grass', region: 'glade-s' }).disc(28, 16, 3, { t: 'grass', region: 'glade-s' }).disc(13, 17, 2, { t: 'grass', region: 'glade-s' });
  // The stream runs north to south and bends a little.
  const sx = (r) => 31 + Math.round(1.2 * Math.sin(r / 3.2));
  for (let r = 0; r < 24; r++) {
    for (let cc = sx(r) - 1; cc <= sx(r); cc++) g.hex(cc, r, { t: 'water', region: 'stream' });
    for (const cc of [sx(r) - 2, sx(r) + 1]) if (g.get(ax(cc, r))?.t !== 'water') g.hex(cc, r, { t: 'grass', region: 'stream', h: 2.5 });
  }
  // The road: two hexes wide, wandering a little. Over the stream it is a bridge.
  const road = (cc) => 11 + Math.round(1.4 * Math.sin(cc / 6));
  for (let cc = 0; cc < 38; cc++) {
    const r = road(cc);
    const region = cc < 14 ? 'road-w' : cc < 28 ? 'road-m' : 'road-e';
    for (const rr of [r, r + 1]) {
      const bridge = cc >= sx(rr) - 2 && cc <= sx(rr) + 1;
      g.hex(cc, rr, { t: 'stone', region: bridge ? 'bridge' : region });
    }
  }
  // Boulders along the clearings for cover, and an overturned cart across the bend.
  for (const [cc, rr] of [[12, 3], [19, 8], [8, 9], [24, 14], [26, 19], [18, 15], [29, 19]]) g.hex(cc, rr, { t: 'rock', region: g.get(ax(cc, rr))?.region ?? 'woods-s' });
  g.thing('crate', 20, road(20), { name: 'Overturned cart' }).thing('crate', 21, road(21) + 1, { name: 'Spilled crates' });
  g.thing('campfire', 22, 4, { name: 'Cold ashes', state: 'out' });
  // Woods east of the stream.
  for (const h of [...g.cells.keys()].map(H.parse)) { /* tidy: forest east of the stream is its own room */
    const o = h.q + (h.r - (h.r & 1)) / 2;
    const cell = g.get(h);
    if (cell.t === 'forest' && o > sx(h.r) + 1) cell.region = 'woods-e';
  }
  b.start([3, road(3)], [3, road(3) + 1], [4, road(4)], [2, road(2) + 1], [4, road(4) + 1]);
  emit(b, 'A road through the woods with clearings on both sides, boulders for cover, a stream with a bridge, and a cart across the bend. No ambushers placed.');
}

// =====================================================================================
// 5. Greywatch: a small keep with a courtyard, two floors and a stair.
// =====================================================================================
{
  const b = new Builder('keep', 'Greywatch (small keep)');
  const g = b.level('ground', 'Ground floor', 0, 'bright');
  const u = b.level('upper', 'Upper floor', 10, 'bright');
  for (const [id, name, light] of [['approach', 'The approach'], ['gate', 'Gatehouse'], ['yard', 'Courtyard'], ['stable', 'Stable'], ['hall', 'Great hall'], ['kitchen', 'Kitchen'], ['larder', 'Larder', 'dim'], ['guard', 'Guard room'], ['stairs', 'Stair tower', 'dim']]) b.region(id, name, 'ground', light);
  for (const [id, name, light] of [['head', 'Stair head', 'dim'], ['chamber', "Lord's chamber"], ['study', 'Study', 'dim'], ['balcony', 'Balcony']]) b.region(id, name, 'upper', light);
  const W = (region, extra = {}) => ({ region, walled: true, ...extra });
  g.rect(0, 8, 1, 14, { t: 'grass', region: 'approach' });
  g.rect(4, 3, 27, 19, W('yard', { t: 'grass' }));
  g.rect(8, 8, 8, 12, W('yard', { t: 'stone' }));               // a paved way from the gate to the hall door
  g.rect(4, 11, 8, 11, W('yard', { t: 'stone' }));
  g.rect(2, 11, 3, 11, W('gate'));
  g.rect(23, 14, 27, 18, W('stable'));
  g.rect(9, 6, 16, 12, W('hall'));
  g.rect(9, 3, 14, 5, W('kitchen'));
  g.rect(15, 3, 17, 5, W('larder'));
  g.rect(18, 3, 21, 6, W('guard'));
  g.stairs(17, 9, 'E', 3, 2.5, 'stairs');
  g.hex(5, 15, { t: 'water', region: 'yard', walled: true });                       // the well
  g.door('approach', 'gate', { def: 'portcullis', state: 'raised', name: 'Gate portcullis' });
  g.door('gate', 'yard', { state: 'open', name: 'Gate door' });
  g.door('hall', 'yard', { near: [12, 12], name: 'Hall door' });
  g.door('kitchen', 'hall', { near: [11, 5] });
  g.door('kitchen', 'larder', { state: 'locked', key: 'larder key' });
  g.door('guard', 'yard', { near: [21, 5], name: 'Guard room door' });
  g.door('stable', 'yard', { near: [23, 16], name: 'Stable doors' });
  g.arch('hall', 'stairs');
  g.thing('brazier', 12, 8, { name: 'Hearth' }).thing('statue', 9, 12, { name: 'Armoured statue' });
  g.thing('crate', 24, 18, { name: 'Hay' }).thing('crate', 26, 18, { name: 'Hay' }).thing('crate', 15, 3, { name: 'Casks' });
  g.thing('crate', 19, 3, { name: 'Weapon racks' });
  g.thing('brazier', 6, 11, { name: 'Gate brazier' });
  // The upper floor: a stair head over the guard end, the lord's chamber, a study and a balcony over the yard.
  u.rect(20, 6, 21, 12, W('head'));
  u.rect(9, 3, 19, 6, W('chamber'));
  u.rect(10, 7, 16, 12, W('study'));
  u.rect(10, 13, 16, 13, W('balcony'));
  b.open(19, 9, 'E');                                                             // the top step to the stair head
  u.door('head', 'chamber', { near: [19, 6] });
  u.door('chamber', 'study', { near: [13, 6] });
  u.door('study', 'balcony', { near: [13, 12], name: 'Balcony door' });
  u.outer('balcony', 'rail');
  u.thing('chest', 11, 4, { name: 'Lord’s chest', state: 'locked', key: 'lord’s key' });
  u.thing('statue', 17, 4, { name: 'Bust of the founder' });
  u.thing('brazier', 15, 9, { name: 'Study brazier' });
  b.start([0, 11], [1, 11], [0, 10], [1, 10], [0, 12]);
  emit(b, 'An approach, a gatehouse, a courtyard around a keep of hall, kitchen, larder and guard room, with a stair up to a lord’s chamber, study and balcony.');
}

// =====================================================================================
// 6. Thornwick Undercroft: the one map on squares. Seven rooms joined by corridors one and two
//    squares wide, a locked door, a portcullis and a secret door. Squares are drawn as columns and
//    rows (column, row), west to east and north to south; the party starts in the south-west.
// =====================================================================================
{
  const b = new Builder('undercroft', 'Thornwick Undercroft (square grid)', SQUARES);
  const g = b.level('ground', 'The undercroft', 0, 'dim');
  const rooms = [['entry', 'Entry hall'], ['library', 'Reading room', 'bright'], ['armory', 'Armory'], ['hall', 'Feast hall', 'bright'], ['shrine', 'Shrine', 'dark'], ['cache', 'Hidden cache', 'dark'], ['strong', 'Strongroom', 'dark'],
    ['narrow', 'The narrow way (5 ft)'], ['gallery', 'Long gallery (10 ft)'], ['north', 'North passage (5 ft)'], ['wide', 'Wide passage (10 ft)'], ['east', 'East passage (5 ft)'], ['vault-pass', 'Vault passage (5 ft)', 'dark']];
  for (const [id, name, light] of rooms) b.region(id, name, 'ground', light);
  const W = (region, extra = {}) => ({ region, walled: true, ...extra });
  g.rect(2, 19, 8, 26, W('entry'));
  g.rect(5, 11, 5, 18, W('narrow'));                  // one square wide: one at a time, no passing
  g.rect(2, 3, 9, 10, W('library'));
  g.rect(10, 5, 14, 6, W('gallery'));                 // two squares wide: two abreast
  g.rect(15, 2, 25, 9, W('armory'));
  g.rect(20, 10, 20, 14, W('north'));
  g.rect(9, 22, 14, 23, W('wide'));
  g.rect(15, 15, 25, 25, W('hall'));
  g.rect(26, 20, 28, 20, W('east'));
  g.rect(29, 14, 35, 26, W('shrine'));
  g.rect(33, 12, 33, 13, W('vault-pass'));
  g.rect(31, 6, 35, 11, W('strong'));
  g.rect(26, 2, 30, 7, W('cache'));
  // Pillars in the feast hall and a pool in the shrine fill their squares.
  for (const [c, r] of [[18, 18], [22, 18], [18, 22], [22, 22]]) g.hex(c, r, W('hall', { t: 'rock' }));
  g.rect(30, 19, 31, 20, W('shrine', { t: 'water' }));
  // Doors stand on the side between two squares.
  g.door('entry', 'narrow', { state: 'closed', name: 'Cellar door' });
  g.door('narrow', 'library', { state: 'closed' });
  g.arch('library', 'gallery');
  g.arch('gallery', 'armory');
  g.arch('entry', 'wide');
  g.arch('wide', 'hall');
  g.door('hall', 'north', { state: 'closed' });
  g.door('north', 'armory', { def: 'portcullis', state: 'raised', name: 'Armory gate' });
  g.door('hall', 'east', { state: 'closed', name: 'Shrine door' });
  g.arch('east', 'shrine');
  g.arch('shrine', 'vault-pass');
  g.door('vault-pass', 'strong', { def: 'door-iron', state: 'locked', key: 'vault key', name: 'Vault door' });
  g.door('armory', 'cache', { def: 'secret-door', near: [25, 5], name: 'Panel behind the racks' });
  // Things: light, cover and treasure.
  g.thing('brazier', 7, 20, { name: 'Gate brazier' });
  g.thing('brazier', 16, 16, { name: 'Hearth' }).thing('brazier', 24, 16, { name: 'Hearth' });
  g.thing('crate', 20, 24, { name: 'Long table' }).thing('crate', 19, 24, { name: 'Long table' }).thing('crate', 21, 24, { name: 'Long table' });
  g.thing('statue', 20, 20, { name: 'Weathered statue' });
  g.thing('crate', 3, 3, { name: 'Bookshelves' }).thing('crate', 5, 3, { name: 'Bookshelves' }).thing('crate', 8, 3, { name: 'Bookshelves' });
  g.thing('brazier', 3, 9, { name: 'Reading lamp' });
  g.thing('crate', 16, 3, { name: 'Weapon racks' }).thing('crate', 17, 3, { name: 'Weapon racks' }).thing('crate', 24, 8, { name: 'Barrels' });
  g.thing('brazier', 32, 15, { name: 'Altar brazier', state: 'out' });
  g.thing('statue', 32, 25, { name: 'Robed statue' });
  g.thing('chest', 28, 4, { name: 'Smugglers’ chest' });
  g.thing('chest', 34, 7, { name: 'Strongroom chest', state: 'locked', key: 'vault key' });
  b.start([4, 23], [5, 23], [6, 23], [4, 24], [5, 24]);
  emit(b, 'Seven rooms on squares joined by corridors 5 and 10 feet wide: a closed door, a portcullis, a locked vault door and a secret panel.');
}

if (ASCII) for (const d of maps) ascii(d);
console.log(`wrote ${maps.length} maps to ${OUT}`);
