// The Three.js renderer (docs/specs/renderer.md, R11). The renderer itself needs a browser (the smoke pass `SMOKE_ONLY=three-parity` runs it);
// what is checked here is what is pure: the chooser and the stand-in in renderer.js, the shapes three-build.js makes, and that the class has
// every member of the interface. Like the other client tests it lays the files and the rules side by side as the build does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), client = join(here, '..'), tmp = mkdtempSync(join(tmpdir(), 'render-three-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
for (const f of ['renderer.js', 'render.js', 'render-three.js', 'three-build.js', 'floors.js', 'governor.js']) cpSync(join(client, f), join(tmp, f));
cpSync(join(client, 'vendor'), join(tmp, 'vendor'), { recursive: true });
writeFileSync(join(tmp, 'package.json'), '{"type":"module"}');
after(() => rmSync(tmp, { recursive: true, force: true }));
const load = (f) => import(pathToFileURL(join(tmp, f)).href);
const { METHODS, PROPS, KINDS, LazyThree, createRenderer, rendererKind } = await load('renderer.js');
const B = await load('three-build.js');
const { ThreeRenderer } = await load('render-three.js');
const { newGame } = await load('shared/scenario.js');
const { STOCK_MAPS } = await load('shared/content/maps/index.js');

// The theme the table uses, without the page (themes.js reads `location` only inside try).
const theme = (await import(pathToFileURL(join(client, 'themes.js')).href)).THEMES.classic;

test('three is a kind, chosen by the address then the preference', () => {
  assert.ok(KINDS.includes('three'));
  assert.equal(rendererKind('?renderer=three', undefined), 'three');
  assert.equal(rendererKind('', 'three'), 'three');
  assert.equal(rendererKind('?renderer=gl', 'three'), 'gl');
  assert.equal(rendererKind('', undefined), 'gl');
});
test('the Three.js renderer and its stand-in have every member of the interface', () => {
  for (const m of METHODS) { assert.equal(typeof ThreeRenderer.prototype[m], 'function', `ThreeRenderer.${m}`); assert.equal(typeof LazyThree.prototype[m], 'function', `LazyThree.${m}`); }
  for (const p of PROPS) assert.ok(Object.getOwnPropertyDescriptor(LazyThree.prototype, p)?.set, `LazyThree.${p}`);
});
test('the stand-in answers "nowhere" before the renderer has loaded, and keeps what it was told', () => {
  const r = Object.create(LazyThree.prototype);
  Object.assign(r, { inner: null, kept: {}, moves: [], props: { inset: 0 } });
  assert.equal(r.screenOf({ q: 0, r: 0 }), null); assert.equal(r.planeHex(1, 1), null); assert.deepEqual(r.zonesAt({ q: 0, r: 0 }), []);
  assert.deepEqual(Object.keys(r.stats()).sort(), ['drawCalls', 'frameMs', 'pixelRatio', 'quality']);
  r.setCeiling(10); r.setCeiling(20); r.setState({ a: 1 }, []); r.setState({ a: 2 }, []); r.focus('x', true); r.zoom(2); r.inset = 40;
  assert.deepEqual(r.kept.setCeiling, [20]); assert.deepEqual(r.kept.setState[0], { a: 2 });
  assert.deepEqual(r.moves, [['focus', ['x', true]], ['zoom', [2]]]); assert.equal(r.inset, 40);
  assert.equal(typeof createRenderer, 'function');
});

// ---------- the shapes ----------
const finite = (b) => b.d.every(Number.isFinite);
test('a Builder makes 10 floats a vertex, and a quad is two triangles', () => {
  const b = new B.Builder();
  b.quad([0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1], [1, 0, 0, 1]);
  assert.equal(b.count, 6); assert.equal(b.d.length, 60);
  assert.ok(Math.abs(Math.abs(b.d[4]) - 1) < 1e-9, 'a flat quad faces up or down');
});
test('model(): the identity at the origin, and a move is in the last column', () => {
  assert.deepEqual(B.model(0, 0, 0, 0, 0).map((v) => v + 0), [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const m = B.model(2, 3, 4, 0, 0, 1.5); assert.deepEqual(m.slice(12), [2, 3, 4, 1]); assert.equal(m[0], 1.5);
});
test('a pawn is a lathe in the theme\'s profile, larger for a larger creature', () => {
  const small = B.makePawn({ side: 'party', size: 'medium' }, theme), big = B.makePawn({ side: 'foe', size: 'large' }, theme);
  assert.ok(small.count > 0 && small.count === big.count && finite(big));
  const top = (b) => { let m = 0; for (let i = 0; i < b.d.length; i += 10) m = Math.max(m, b.d[i + 1]); return m; };
  assert.ok(Math.abs(top(big) / top(small) - B.GIRTH.large) < 1e-9);
  assert.deepEqual(B.makePawn({ side: 'foe', size: 'medium', dead: true }, theme).d.slice(6 + 10 * 400, 9 + 10 * 400), [0.4, 0.4, 0.4], 'a dead one is grey');
});
const world = (mapId) => {
  const S = newGame(7);
  if (mapId) { const m = STOCK_MAPS.find((x) => x.id === mapId); S.map = structuredClone(m.map); }
  return S;
};
test('terrain of the valley and of the stock maps is built, finite, and hidden above the ceiling', () => {
  for (const id of [null, ...STOCK_MAPS.map((m) => m.id)]) {
    const S = world(id), t = B.buildTerrain({ map: S.map, enc: null, sight: null, theme, ceiling: Infinity });
    assert.ok(t.terrain.count > 0 && finite(t.terrain) && finite(t.grid) && finite(t.shadows), `terrain of ${id ?? 'the valley'}`);
    const lo = B.buildTerrain({ map: S.map, enc: null, sight: null, theme, ceiling: -1000 });
    assert.equal(lo.terrain.count, 0, `a ceiling under every level draws nothing of ${id ?? 'the valley'}`);
    const w = B.buildWalls({ map: S.map, theme, ceiling: Infinity, floorData: t.floorData, cut: B.cutSetFor(theme, t.floorData, 0.5), doors: new Map() });
    assert.ok(finite(w.b));
  }
});
test('the stock dungeon has rooms with walls, and the cut-away lowers some of them', () => {
  const S = world('dungeon'), t = B.buildTerrain({ map: S.map, enc: null, sight: null, theme, ceiling: Infinity });
  assert.ok(t.floorData.length > 0 && S.map.walls.length > 0);
  const cut = B.cutSetFor(theme, t.floorData, 0.5);
  assert.ok(cut instanceof Set && cut.size > 0);
  const tall = (c) => B.buildWalls({ map: S.map, theme, ceiling: Infinity, floorData: t.floorData, cut: c, doors: new Map() }).b;
  const top = (b) => { let m = 0; for (let i = 0; i < b.d.length; i += 10) m = Math.max(m, b.d[i + 1]); return m; };
  assert.ok(top(tall(cut)) > 9 * B.UNIT * 0.99, 'walls on the far side stand at full height');
  assert.ok(top(tall(null)) < 2, 'with no cut-away every wall is low (1.15 units over a 0.55 base)');
  assert.equal(B.cutSetFor({ ...theme, cutaway: false }, t.floorData, 0.5), null);
});
test('the arena curtain and the overlay are built, finite, and empty with nothing to show', () => {
  const S = world(null), ents = Object.values(S.entities), c = ents[0].pos;
  const arena = {}; for (const h of [c, { q: c.q + 1, r: c.r }, { q: c.q, r: c.r + 1 }]) arena[`${h.q},${h.r}`] = true;
  const enc = { id: 1, arena }, e = B.buildEdge({ map: S.map, enc, theme, ceiling: Infinity });
  assert.ok(e.b.count > 0 && finite(e.b) && Number.isFinite(e.base));
  assert.equal(B.buildEdge({ map: S.map, enc: null, theme, ceiling: Infinity }).b.count, 0);
  const hl = { move: [`${c.q + 1},${c.r}`], area: [], targets: [ents[1].id], allies: [], selected: ents[0].id, turn: null };
  const o = B.buildOverlay({ state: S, hl, theme });
  assert.ok(o.count > 0 && finite(o));
  const none = { move: [], area: [], targets: [], allies: [], selected: null, turn: null };
  assert.ok(B.buildOverlay({ state: S, hl: none, theme }).count < o.count, 'highlights add shapes');
  const withPins = B.buildOverlay({ state: S, hl, theme, pins: [[0, 0], [10, 0]], bars: [[0, 0, 5, 0]] });
  assert.ok(withPins.count > o.count);
});
test('a door leaf swings about its first end and keeps its length shut to 80 % open', () => {
  const b = new B.Builder();
  B.swingDoor(b, { seg: [[0, 0], [10, 0]], y0: 0, h: 1, open: [1, 1, 1], shut: [0, 0, 0] }, 0);
  const far = (bb) => { let m = 0; for (let i = 0; i < bb.d.length; i += 10) m = Math.max(m, Math.hypot(bb.d[i], bb.d[i + 2])); return m; };
  const shut = far(b), o = new B.Builder();
  B.swingDoor(o, { seg: [[0, 0], [10, 0]], y0: 0, h: 1, open: [1, 1, 1], shut: [0, 0, 0] }, 1);
  assert.ok(Math.abs(far(o) / shut - 0.8) < 0.02, `${far(o) / shut}`);
});
