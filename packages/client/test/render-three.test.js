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
const { ThreeRenderer, shadowMode, isPhone, shadowBox, SHADOW_MODES } = await load('render-three.js');
const { createGovernor, shadowLevels } = await load('governor.js');
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

// ---------- real shadows (R15) ----------
test('the shadow setting: the address, then the preference, else automatic; a phone is a small touch screen', () => {
  assert.deepEqual(SHADOW_MODES, ['auto', 'on', 'off']);
  assert.equal(shadowMode('', undefined), 'auto');
  assert.equal(shadowMode('?shadows=off', 'on'), 'off');
  assert.equal(shadowMode('', 'on'), 'on');
  assert.equal(shadowMode('?shadows=loud', 'off'), 'auto', 'an unknown word is automatic, as an unknown renderer is the default one');
  assert.equal(shadowMode('', 'loud'), 'auto');
  assert.ok(isPhone({ coarse: true, w: 390, h: 844 }));
  assert.ok(isPhone({ coarse: true, w: 844, h: 390 }), 'turned on its side it is still a phone');
  assert.ok(!isPhone({ coarse: true, w: 820, h: 1180 }), 'a tablet is not');
  assert.ok(!isPhone({ coarse: false, w: 500, h: 500 }), 'a narrow window with a mouse is not');
});
test('the governor gives up shadows before any pixel ratio, and a phone begins without them', () => {
  const lv = (dpr, o) => shadowLevels(dpr, o);
  assert.deepEqual(lv(2).levels.map((l) => [l.ratio, l.shadows]), [[2, true], [2, false], [1.5, false], [1, false]]);
  assert.equal(lv(2).start, 0);
  assert.equal(lv(2, { phone: true }).start, 1, 'a phone starts below its shadows');
  assert.deepEqual(lv(1).levels.map((l) => [l.ratio, l.shadows]), [[1, true], [1, false]], 'a screen of ratio 1 can still lose its shadows');
  assert.ok(lv(3, { shadows: 'on' }).levels.every((l) => l.shadows), 'On keeps them at every step');
  assert.ok(lv(3, { shadows: 'off', phone: true }).levels.every((l) => !l.shadows), 'Off never draws them');
  const { levels, start } = lv(2, { phone: true }), g = createGovernor(levels, { start });
  assert.equal(g.ratio, 2); assert.equal(g.level.shadows, false);
  // a screen that keeps up climbs to its shadows after ten seconds under the limit
  let t = 0, steps = [];
  while (t < 30) { t += 0.01; const to = g.sample(10, t); if (to !== null) steps.push([+t.toFixed(0), g.level.shadows]); }
  assert.deepEqual(steps.map((x) => x[1]), [true]);
  assert.ok(steps[0][0] >= 10);
  // and a slow one drops them first, then the pixel ratio
  const slow = createGovernor(lv(2).levels), seen = [];
  t = 0;
  while (t < 20) { t += 0.05; if (slow.sample(50, t) !== null) seen.push([slow.ratio, slow.level.shadows]); }
  assert.deepEqual(seen.slice(0, 3), [[2, false], [1.5, false], [1, false]]);
  // the plain list of pixel ratios (the default renderer's) still answers `ratio`
  assert.equal(createGovernor([2, 1.5, 1]).ratio, 2);
});
test('the sun\'s box covers a small board and follows the camera on a large one, in whole texels', () => {
  const light = norm3([0.45, 0.8, 0.35]);
  const small = shadowBox({ bounds: { x0: 0, x1: 12, z0: 0, z1: 10, y0: 0, y1: 4 }, focus: [3, 0.6, 3], dist: 22, size: 2048, light });
  assert.deepEqual([small.centre[0], small.centre[2]], [6, 5], 'a small board is covered whole, from its middle');
  assert.ok(small.half >= Math.hypot(12, 10) / 2);
  const big = { x0: 0, x1: 200, z0: 0, z1: 200, y0: 0, y1: 6 };
  const a = shadowBox({ bounds: big, focus: [50.0123, 0.6, 50.0456], dist: 22, size: 2048, light });
  assert.ok(a.half < 100 && a.half >= 14, `a large board gets a box of ${a.half}`);
  const r = norm3(cross([0, 1, 0], light.map((v) => -v))), u = cross(r, light.map((v) => -v)), dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  for (const axis of [r, u]) { const k = dot(a.centre, axis) / a.texel; assert.ok(Math.abs(k - Math.round(k)) < 1e-6, `the box sits on whole texels (${k})`); }
  assert.ok(a.texel > 0 && a.far > a.near && a.back > 0);
  const zoomed = shadowBox({ bounds: big, focus: [50, 0.6, 50], dist: 48, size: 2048, light });
  assert.ok(zoomed.half > a.half, 'further away, wider');
});
test('the Three.js renderer\'s floors read the shadow map only when SHADOWS is defined, and the depth pass draws nothing but depth', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(join(client, 'render-three.js'), 'utf8');
  assert.ok(/#ifdef SHADOWS/.test(src) && /layers\.enable\(1\)/.test(src) && /overrideMaterial = sh\.mat/.test(src) && /colorWrite: false/.test(src));
  assert.ok(!/Math\.random/.test(src.replace(/\/\/.*$/gm, '')), 'the renderer draws no random shadows');
});
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm3(a) { const l = Math.hypot(...a); return a.map((v) => v / l); }
