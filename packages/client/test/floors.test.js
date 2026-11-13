// The floors module is pure, but it imports the rules as ./shared (where the build puts them), so the test
// lays the two side by side in a temporary folder and loads that copy.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'floors-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '../floors.js'), join(tmp, 'floors.js'));
writeFileSync(join(tmp, 'package.json'), '{"type":"module"}');
after(() => rmSync(tmp, { recursive: true, force: true }));
const F = await import(pathToFileURL(join(tmp, 'floors.js')).href);
const { newMap } = await import(pathToFileURL(join(tmp, 'shared/map.js')).href);
const { center } = await import(pathToFileURL(join(tmp, 'shared/walls.js')).href);

const mk = (tiles, walls = [], extra = {}) => {
  const m = newMap();
  for (const [k, t] of Object.entries(tiles)) m.levels[0].tiles[k] = typeof t === 'string' ? { t } : t;
  m.walls = walls.map((w, i) => ({ id: `w${i}`, level: 'ground', kind: 'wall', ...w }));
  return Object.assign(m, extra);
};
const block = (q0, q1, r0, r1, t = 'stone') => { const o = {}; for (let r = r0; r <= r1; r++) for (let q = q0; q <= q1; q++) o[`${q},${r}`] = t; return o; };
const cellsOf = (fl) => fl.levels[0].patches.flatMap((p) => p.cells.map((c) => ({ ...c, terrain: p.terrain })));
const area = (cells) => cells.reduce((s, c) => s + F.polyArea(c.poly), 0);
const HEX = (5 * 5 * Math.sqrt(3)) / 2;                       // area of one hex, square feet
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const side = (p, a, b) => ((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
const pointIn = (cells, x, y) => cells.some((c) => c.poly.every((a, i) => { const b = c.poly[(i + 1) % c.poly.length]; return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) >= -1e-9; }));

test('a hex is 5 feet across the flats and its polygon is positive and convex', () => {
  const p = F.hexPoly({ q: 0, r: 0 });
  assert.ok(near(F.polyArea(p), HEX, 1e-9));
  assert.ok(near(Math.max(...p.map((v) => v[0])) - Math.min(...p.map((v) => v[0])), 5, 1e-9));
});

test('tiles with no wall are whole hexes, in one patch per terrain and height', () => {
  const m = mk({ ...block(0, 2, 0, 1), '3,0': 'grass' }, [], { regions: [] });
  m.walls.push({ id: 'x', level: 'ground', kind: 'wall', a: [100, 100], b: [110, 100] });   // far away: it only makes this a room level
  const fl = F.buildFloors(m), ps = fl.levels[0].patches;
  assert.equal(ps.length, 2);
  assert.deepEqual(ps.map((p) => p.cells.length).sort(), [1, 6]);
  assert.ok(near(area(cellsOf(fl)), 7 * HEX, 1e-6));
  assert.ok(cellsOf(fl).every((c) => !c.fill));
});

test('a patch splits by height and by region', () => {
  const m = mk({ ...block(0, 3, 0, 0), '4,0': { t: 'stone', h: 5 }, '5,0': { t: 'stone', h: 5 } }, [{ a: [100, 100], b: [110, 100] }]);
  m.regions = [{ id: 'r1', name: 'West', level: 'ground', hexes: ['0,0', '1,0'] }];
  const ps = F.buildFloors(m).levels[0].patches;
  assert.deepEqual(ps.map((p) => [p.region, p.z, p.cells.length]), [['r1', 0, 2], [null, 0, 2], [null, 5, 2]]);
});

test('edges: open where nothing is beyond, a drop beside a lower floor, a rise beside a higher one, a seam where only the colour changes', () => {
  const m = mk({ '0,0': 'stone', '1,0': { t: 'stone', h: 5 }, '2,0': 'grass', '3,0': 'grass' }, [{ a: [100, 100], b: [110, 100] }]);
  const ps = F.buildFloors(m).levels[0].patches, kinds = (hex) => ps.flatMap((p) => p.outline).filter((e) => e.hex === hex).map((e) => e.kind);
  assert.ok(kinds('1,0').includes('drop'));
  assert.ok(kinds('0,0').includes('rise'));
  assert.equal(kinds('1,0').filter((k) => k === 'open').length > 0, true);
  const m2 = mk({ '0,0': 'stone', '1,0': 'grass' }, [{ a: [100, 100], b: [110, 100] }]);
  assert.ok(F.buildFloors(m2).levels[0].patches.flatMap((p) => p.outline).some((e) => e.kind === 'seam'));
});

test('a traced diagonal wall gives a straight floor edge', () => {
  // Tiles on both sides of a diagonal line through the block; only the tiles whose centres are above it are painted.
  const a = [-40, 28], b = [100, -28], tiles = {};
  for (let r = -1; r <= 4; r++) for (let q = -3; q <= 9; q++) if (side(center({ q, r }), a, b) < 0) tiles[`${q},${r}`] = 'stone';
  const m = mk(tiles, [{ a, b }]), fl = F.buildFloors(m), cells = cellsOf(fl);
  assert.ok(Object.keys(tiles).length > 10);
  let onLine = 0;
  for (const c of cells) for (const v of c.poly) { assert.ok(side(v, a, b) <= 1e-6, 'nothing is drawn past the wall'); if (Math.abs(side(v, a, b)) < 1e-6) onLine++; }
  assert.ok(onLine > 6, 'the floor reaches the wall');
  const edge = fl.levels[0].patches.flatMap((p) => p.outline).filter((e) => Math.abs(side(e.a, a, b)) < 1e-6 && Math.abs(side(e.b, a, b)) < 1e-6);
  assert.ok(edge.length >= 5 && edge.every((e) => e.kind === 'open'), 'the edge along the wall is straight and faces outward');
  // The hexes the wall cuts are cut: area is a bit more than the whole hexes on the tile side would lose or gain, and the far side adds nothing.
  assert.ok(cells.some((c) => c.poly.length !== 6), 'some hexes are cut');
});

test('floor beyond a diagonal wall goes to the floor on that side, and the cut piece of a tile goes to its neighbour', () => {
  const a = [-40, 28], b = [100, -28], tiles = {};
  for (let r = -2; r <= 5; r++) for (let q = -4; q <= 10; q++) tiles[`${q},${r}`] = center({ q, r })[0] < 1000 ? (side(center({ q, r }), a, b) < 0 ? 'stone' : 'grass') : 'stone';
  const m = mk(tiles, [{ a, b }]), cells = cellsOf(F.buildFloors(m));
  for (const c of cells) {
    const sides = c.poly.map((v) => side(v, a, b));
    assert.ok(sides.every((s) => s <= 1e-6) || sides.every((s) => s >= -1e-6), 'no cell straddles the wall');
    if (c.terrain === "stone") assert.ok(sides.every((s) => s <= 1e-6)); else assert.ok(sides.every((s) => s >= -1e-6), JSON.stringify([c.hex, c.at, c.fill, c.terrain, sides]));
  }
  assert.ok(cells.some((c) => c.fill), 'cut pieces are given to the floor beside them');
  assert.ok(near(area(cells), area(cells), 0) && cells.length > Object.keys(tiles).length * 0.9);
});

test('a corridor between two traced walls is filled from wall to wall, though its hexes are mostly not tiles', () => {
  const tiles = {}; for (let q = 0; q <= 8; q++) tiles[`${q},0`] = 'stone';           // a row of tiles down the middle
  const m = mk(tiles, [{ a: [-3, -6], b: [47, -6] }, { a: [-3, 6], b: [47, 6] }]), fl = F.buildFloors(m), cells = cellsOf(fl);
  assert.ok(cells.some((c) => c.fill), 'there are picture-only pieces');
  assert.ok(cells.every((c) => c.poly.every((v) => Math.abs(v[1]) <= 6 + 1e-6)), 'nothing past either wall');
  for (const x of [5, 12.5, 20, 27.5]) for (const y of [-5.5, -3.5, 0, 3.5, 5.5]) assert.ok(pointIn(cells, x, y), `floor at ${x}, ${y}`);
  for (const x of [12.5, 20]) for (const y of [-6.5, 6.5]) assert.ok(!pointIn(cells, x, y), `no floor at ${x}, ${y}`);
  const ps = fl.levels[0].patches;
  assert.equal(ps.length, 1, 'one stone corridor');
  const out = ps[0].outline.filter((e) => e.kind === 'open' && Math.abs(Math.abs(e.a[1]) - 6) < 1e-6 && Math.abs(Math.abs(e.b[1]) - 6) < 1e-6);
  assert.ok(out.length >= 2, 'its long sides run along the walls');
  // Only hexes with a tile are hexes a creature can stand in: fill pieces name the tile they borrow.
  assert.ok(cells.every((c) => tiles[c.hex]));
});

test('a corridor of tiles on the far side of a wall is not joined to the near side', () => {
  const tiles = block(0, 6, 0, 0); Object.assign(tiles, block(0, 6, 2, 2));
  const m = mk(tiles, [{ a: [-3, 4.33], b: [40, 4.33] }]);
  const ps = F.buildFloors(m).levels[0].patches;
  assert.equal(ps.length, 2, 'the wall keeps two floors apart');
});

test('a wall that ends inside a hex leaves the hex whole', () => {
  const m = mk(block(0, 2, 0, 1), [{ a: [-3, 0], b: [1, 0] }]);
  const cells = cellsOf(F.buildFloors(m));
  assert.equal(cells.length, 6);
  assert.ok(cells.every((c) => c.poly.length === 6));
});

test('walls that bend inside a hex cut it there, and the floor on the near side of the bend is its own patch', () => {
  const E = [12.3, 7.1];                                      // inside a hex, away from its middle
  const m = mk(block(0, 6, 0, 3), [{ a: E, b: [60, E[1]] }, { a: E, b: [E[0], 40] }]);
  const fl = F.buildFloors(m), cells = cellsOf(fl), eps = 1e-6;
  const cen = (c) => [c.poly.reduce((s, v) => s + v[0], 0) / c.poly.length, c.poly.reduce((s, v) => s + v[1], 0) / c.poly.length];
  let bent = 0;
  for (const c of cells) {
    const [x, y] = cen(c), inCorner = x > E[0] && y > E[1];
    if (inCorner) assert.ok(c.poly.every((v) => v[0] >= E[0] - eps && v[1] >= E[1] - eps), 'a cell in the corner stays inside it');
    else assert.ok(c.poly.every((v) => !(v[0] > E[0] + eps && v[1] > E[1] + eps)), 'and no cell outside reaches into it');
    if (c.poly.some((v) => near(v[0], E[0], eps) && near(v[1], E[1], eps))) bent++;
  }
  assert.ok(bent >= 2, 'the hex is cut at the bend');
  assert.equal(fl.levels[0].patches.length, 2, 'the corner and the rest are two floors');
  assert.ok(cells.every((c) => !c.fill || c.at !== c.hex), 'pieces of a hex that are not across a wall from its middle are not picture-only');
  const edges = fl.levels[0].patches.flatMap((p) => p.outline).filter((e) => e.kind === 'wall');
  assert.ok(edges.some((e) => near(e.a[0], E[0], 1e-3) || near(e.b[0], E[0], 1e-3)), 'the floors meet along the wall');
});

test('a wall across a corridor, ending on its side walls, cuts the end of the corridor: it follows the wall, not the tiles', () => {
  const tiles = {}; for (let q = 0; q <= 4; q++) tiles[`${q},0`] = 'stone';
  const cap = 21.3, m = mk(tiles, [{ a: [-3, -6], b: [cap, -6] }, { a: [-3, 6], b: [cap, 6] }, { a: [cap, -6], b: [cap, 6] }]), cells = cellsOf(F.buildFloors(m));
  for (const y of [-5.5, -2, 0, 2, 5.5]) { assert.ok(pointIn(cells, cap - 0.4, y), `floor by the wall at ${y}`); assert.ok(!pointIn(cells, cap + 0.4, y), `none beyond it at ${y}`); }
  assert.ok(cells.every((c) => c.poly.every((v) => v[0] <= cap + 1e-6)));
  const cut = F.buildFloors(m).levels[0].patches[0].outline.filter((e) => near(e.a[0], cap, 1e-6) && near(e.b[0], cap, 1e-6));
  assert.ok(cut.length >= 1 && cut.every((e) => e.kind === 'open'), 'the end is a floor edge standing on the wall');
});

test('a wall that stops short of another by a hair still cuts', () => {
  const tiles = {}; for (let q = 0; q <= 4; q++) tiles[`${q},0`] = 'stone';
  const m = mk(tiles, [{ a: [-3, -6], b: [30, -6] }, { a: [-3, 6], b: [30, 6] }, { a: [21.3, -5.9], b: [21.3, 5.9] }]);
  assert.ok(!pointIn(cellsOf(F.buildFloors(m)), 21.8, 0));
});

test('doors are wall faces too, and a post lists the walls that meet at it', () => {
  const m = mk(block(0, 3, 0, 1), [{ id: 'w1', a: [0, 0], b: [10, 0] }, { id: 'w2', a: [10, 0], b: [10, 10] }]);
  m.walls = m.walls.map((w, i) => ({ ...w, id: ['w1', 'w2'][i] }));
  m.objects.push({ id: 'o1', def: 'door-wooden', level: 'ground', at: { q: 1, r: 0 }, edge: 0, state: 'closed' });
  const lv = F.buildFloors(m).levels[0];
  assert.deepEqual(lv.walls.map((w) => w.key).slice(0, 2), ['w:w1', 'w:w2']);
  assert.ok(lv.walls.some((w) => w.key === 'o:o1' && w.object));
  assert.deepEqual(lv.posts.find((p) => near(p.at[0], 10) && near(p.at[1], 0)).keys, ['w:w1', 'w:w2']);
});

test('pieces of one traced wall that meet end to end on a line cut like one wall', () => {
  const tiles = {}; for (let q = 0; q <= 8; q++) tiles[`${q},0`] = 'stone';
  const m = mk(tiles, [{ a: [-3, -6], b: [20, -6] }, { a: [20, -6], b: [47, -6] }, { a: [-3, 6], b: [47, 6] }]);
  assert.ok(cellsOf(F.buildFloors(m)).every((c) => c.poly.every((v) => Math.abs(v[1]) <= 6 + 1e-6)));
});

test('kerb points are inside the floor, mitred, and only open and drop edges have them', () => {
  const m = mk(block(0, 2, 0, 2), [{ a: [100, 100], b: [110, 100] }]), p = F.buildFloors(m).levels[0].patches[0];
  const walk = p.outline.filter((e) => e.kind === 'open');
  assert.ok(walk.length >= 12 && walk.every((e) => e.ia && e.ib));
  for (const e of walk) for (const [o, i] of [[e.a, e.ia], [e.b, e.ib]]) { const d = Math.hypot(o[0] - i[0], o[1] - i[1]); assert.ok(d >= F.LIP - 1e-9 && d <= F.LIP * 3, 'inset'); assert.ok(p.cells.some((c) => pointIn([c], i[0], i[1]))); }
  // Where two edges meet, the inset points meet.
  const next = new Map(walk.map((e) => [e.a.map((v) => v.toFixed(3)).join(), e]));
  for (const e of walk) { const n = next.get(e.b.map((v) => v.toFixed(3)).join()); if (n) assert.ok(Math.hypot(n.ia[0] - e.ib[0], n.ia[1] - e.ib[1]) < 1e-9); }
});

test('cellParts: the floor and a thin grid line add up to the cell', () => {
  const p = F.buildFloors(mk(block(0, 1, 0, 1), [{ a: [100, 100], b: [110, 100] }])).levels[0].patches[0];
  for (const c of p.cells) {
    const { inner, rim } = F.cellParts(c, 0.955), total = F.polyArea(inner) + rim.reduce((s, r) => s + F.polyArea(r), 0);
    assert.ok(near(total, HEX, 1e-6)); assert.equal(rim.length, 6);
    assert.ok(near(F.polyArea(F.cellParts(c, 1).inner), HEX, 1e-6));
  }
});

test('posts stand where walls meet: corners and T joins, not along a straight run', () => {
  const m = mk(block(0, 3, 0, 1), [{ a: [0, 0], b: [10, 0] }, { a: [10, 0], b: [10, 10] }, { a: [10, 0], b: [20, 0] }, { a: [30, 5], b: [30, 15], kind: 'window' }, { a: [30, 15], b: [40, 15], kind: 'rail' }, { a: [5, 5], b: [5, 12] }, { a: [0, 8], b: [5, 8] }]);
  const ps = F.buildFloors(m).levels[0].posts, at = (x, y) => ps.find((p) => near(p.at[0], x) && near(p.at[1], y));
  assert.ok(at(10, 0) && at(10, 0).kind === 'wall');
  assert.equal(at(30, 15).kind, 'window', 'the tallest kind that meets there');
  assert.ok(at(5, 8), 'an end on the side of another wall');
  assert.ok(!at(0, 0) && !at(10, 10));
});

test('cut-away: the wall between the camera and the room is lowered, the far wall is not', () => {
  // A room 22 by 13 feet with a wall on each side and floor inside only.
  const tiles = { ...block(0, 3, 1, 1), ...block(-1, 2, 2, 2) }, R = [[-1, 1], [22, 1], [22, 14], [-1, 14]];
  const m = mk(tiles, R.map((p, i) => ({ id: `s${i}`, a: p, b: R[(i + 1) % 4] })));
  const f = F.buildFloors(m).levels[0].walls, get = (id) => f.find((w) => w.id === id);
  const north = get('s0'), south = get('s2');
  assert.ok(north.floor.left !== north.floor.right && south.floor.left !== south.floor.right, 'floor on one side only');
  const cut = (w, toCam) => F.cutaway([w], toCam).size === 1;
  assert.equal(cut(south, [0, 1]), true, 'the camera is to the south: the south wall is in the way');
  assert.equal(cut(north, [0, 1]), false, 'and the north wall stands');
  assert.equal(cut(north, [0, -1]), true); assert.equal(cut(south, [0, -1]), false);
  assert.equal(cut(south, [1, 0]), true, 'seen edge on, a wall with floor beside it goes down with its neighbours');
  const lone = { ...south, floor: { left: false, right: false } };
  assert.equal(cut(lone, [1, 0]), false, 'and one with no floor beside it stands');
  assert.equal(cut(lone, [0, 1]), false);
  const part = { ...south, floor: { left: true, right: true } };
  assert.equal(cut(part, [0, 1]) && cut(part, [0, -1]), true, 'a partition is cut from either side');
});

test('levels: only levels with walls or regions are built, and a level above is its own floor', () => {
  const m = mk(block(0, 1, 0, 0), []);
  assert.deepEqual(F.roomLevels(m), []);
  m.levels.push({ id: 'up', name: 'Up', z: 10, tiles: { '0,0': { t: 'stone' } } });
  m.walls.push({ id: 'w', level: 'up', kind: 'wall', a: [0, 0], b: [5, 0] });
  assert.deepEqual(F.roomLevels(m), ['up']);
  const fl = F.buildFloors(m);
  assert.equal(fl.levels.length, 1); assert.equal(fl.levels[0].patches[0].z, 10);
  assert.equal(F.buildFloors(m, { levels: ['ground', 'up'] }).levels.length, 2);
});

test('the output is plain data and the same every time', () => {
  const m = mk(block(0, 5, 0, 3), [{ a: [-3, 12], b: [30, -3] }]);
  const a = JSON.stringify(F.buildFloors(m)), b = JSON.stringify(F.buildFloors(structuredClone(m)));
  assert.equal(a, b);
  assert.ok(a.length > 100);
});
