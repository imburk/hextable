// The renderer interface (docs/specs/renderer.md, decision 7): app.js and editor.js use only the members listed in
// renderer.js, the empty renderer has them all, and the quality governor steps the pixel ratio without bouncing.
// Like floors.test.js it lays the client files and the rules side by side in a temporary folder, as the build does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), client = join(here, '..'), tmp = mkdtempSync(join(tmpdir(), 'renderer-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
for (const f of ['renderer.js', 'render.js', 'floors.js', 'governor.js']) cpSync(join(client, f), join(tmp, f));
writeFileSync(join(tmp, 'package.json'), '{"type":"module"}');
after(() => rmSync(tmp, { recursive: true, force: true }));
const load = (f) => import(pathToFileURL(join(tmp, f)).href);
const { MEMBERS, METHODS, PROPS, EmptyRenderer, createRenderer, rendererKind } = await load('renderer.js');
const { Renderer } = await load('render.js');
const { createGovernor, pixelLevels } = await load('governor.js');

// ---------- the interface ----------
// What a file does with the renderer: `R.x` in app.js, `this.R.x` in editor.js. Any other way the name R appears must be one of the
// few known ones (making it, handing it to the editor, the smoke script's test surface).
function uses(file, re, bare) {
  const src = readFileSync(join(client, file), 'utf8').split('\n'), members = new Map(), others = [];
  src.forEach((line, i) => {
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
    for (const m of code.matchAll(re)) members.set(m[1], [...(members.get(m[1]) ?? []), i + 1]);
    for (const m of code.matchAll(bare)) if (!code.slice(m.index + m[0].length).startsWith('.') ) others.push(`${i + 1}: ${line.trim()}`);
  });
  return { members, others };
}
const A = uses('app.js', /(?<![\w.$])R\.(\w+)/g, /(?<![\w.$'"])R\b(?!['"])/g);
const E = uses('editor.js', /\bthis\.R\.(\w+)/g, /(?<![\w$])(?:ctx\.R|this\.R|\{ R\b|R:)(?![\w.])/g);

for (const [file, u] of [['app.js', A], ['editor.js', E]]) {
  test(`${file} uses only members of the renderer interface`, () => {
    assert.ok(u.members.size > 5, 'the scan found the renderer uses');
    const bad = [...u.members].filter(([m]) => !MEMBERS.includes(m)).map(([m, lines]) => `R.${m} (line ${lines.join(', ')})`);
    assert.deepEqual(bad, [], `not in MEMBERS: ${bad.join('; ')}`);
  });
}
test('the renderer object is only passed on in the known places', () => {
  const head = (l) => l.replace(/^\d+: /, '').slice(0, 24), want = (l) => l.slice(0, 24);
  assert.deepEqual(A.others.map(head), ['const R = createRenderer(', 'const ED = new Editor({ R, ', 'window.hextable = { R /* t'].map(want), A.others.join('\n'));
  assert.deepEqual(E.others.map(head), E.others.filter((o) => /this\.R = /.test(o)).map(head), 'the editor reads it through this.R only');
});
test('every member is used from outside, so the list holds no dead weight', () => {
  const used = new Set([...A.members.keys(), ...E.members.keys()]);
  const unused = MEMBERS.filter((m) => !used.has(m));
  assert.deepEqual(unused.sort(), ['dispose', 'stats']);       // housekeeping: the app does not call them yet
});

test('the empty renderer implements every member and nothing throws', () => {
  const r = createRenderer('none', null, null, {});
  assert.ok(r instanceof EmptyRenderer);
  for (const m of METHODS) assert.equal(typeof r[m], 'function', m);
  for (const m of PROPS) assert.ok(m in r, m);
  r.setState({ entities: {}, map: {} }, [], { instant: true }); r.settle(); r.setTheme({}); r.setCeiling(10); r.setHighlights({}); r.focus('x', true);
  r.rotate(1); r.zoom(2); r.floater('x', '5', 'dmg', 0.1); r.setPins([[0, 0]], 0); r.setBars([], 0);
  assert.equal(r.planeHex(1, 1, 0), null); assert.equal(r.screenOf({ q: 0, r: 0 }), null); assert.deepEqual(r.zonesAt({ q: 0, r: 0 }), []);
  assert.deepEqual(Object.keys(r.stats()).sort(), ['drawCalls', 'frameMs', 'pixelRatio', 'quality']);
  r.dispose();
});
test('the WebGL renderer has every method of the interface', () => {
  for (const m of METHODS) assert.equal(typeof Renderer.prototype[m], 'function', m);
});
test('the renderer is chosen by the address, then the preference', () => {
  assert.equal(rendererKind('', undefined), 'gl');
  assert.equal(rendererKind('?renderer=none', undefined), 'none');
  assert.equal(rendererKind('', 'none'), 'none');
  assert.equal(rendererKind('?renderer=gl', 'none'), 'gl');
  assert.equal(rendererKind('?renderer=nonsense', 'none'), 'gl');
});

// ---------- the governor ----------
// Runs `seconds` of frames. `work(ratio)` is what drawing costs in ms; `vsync` rounds the frame up to the display's period.
function run(g, seconds, work, { vsync = 1000 / 60, t0 = 0 } = {}) {
  let t = t0; const steps = [];
  while (t < t0 + seconds) {
    const w = work(g.ratio), ms = vsync ? Math.max(vsync, Math.ceil(w / vsync - 1e-9) * vsync) : w;
    t += ms / 1000;
    if (g.sample(ms, t) !== null) steps.push([+t.toFixed(1), g.ratio]);
  }
  return { steps, t };
}
test('pixel levels: 2, 1.5, 1 as far as the screen has them', () => {
  assert.deepEqual(pixelLevels(3), [2, 1.5, 1]);
  assert.deepEqual(pixelLevels(2), [2, 1.5, 1]);
  assert.deepEqual(pixelLevels(1.25), [1.25, 1]);
  assert.deepEqual(pixelLevels(1), [1]);
  assert.deepEqual(pixelLevels(undefined), [1]);
});
test('governor: a fast frame rate never steps', () => {
  const g = createGovernor([2, 1.5, 1]);
  assert.deepEqual(run(g, 120, () => 8, { vsync: 1000 / 60 }).steps, []);
  assert.deepEqual(run(createGovernor([2, 1.5, 1]), 120, () => 20, { vsync: 0 }).steps, [], 'between 14 and 28 ms nothing happens');
});
test('governor: a screen with one level has nothing to step', () => {
  assert.deepEqual(run(createGovernor([1]), 60, () => 80).steps, []);
});
test('governor: steps down after 2 s over 28 ms, one level at a time, and stops at the last', () => {
  const g = createGovernor([2, 1.5, 1]);
  const { steps } = run(g, 60, () => 45, { vsync: 0 });
  assert.equal(steps.length, 2);
  assert.deepEqual(steps.map((s) => s[1]), [1.5, 1]);
  assert.ok(steps[0][0] >= 2 && steps[0][0] < 4, `first step at ${steps[0][0]} s`);
  assert.ok(steps[1][0] - steps[0][0] >= 2, 'the second step is decided on frames drawn at the new ratio');
});
test('governor: a brief slow patch does not step', () => {
  const g = createGovernor([2, 1.5, 1]);
  let r = run(g, 5, () => 8, { vsync: 0 });
  r = run(g, 1.5, () => 60, { vsync: 0, t0: r.t });
  assert.deepEqual(r.steps, []);
  r = run(g, 20, () => 8, { vsync: 0, t0: r.t });
  assert.deepEqual(r.steps, []);
});
test('governor: a stalled or hidden tab is not read as slow drawing', () => {
  const g = createGovernor([2, 1.5, 1]); let t = 0;
  for (let i = 0; i < 200; i++) { t += 0.008; g.sample(8, t); }
  for (let i = 0; i < 20; i++) { t += 30; assert.equal(g.sample(30000, t), null); }
  assert.equal(g.ratio, 2);
});
test('governor: steps back up after 10 s under 14 ms', () => {
  const g = createGovernor([2, 1.5, 1]);
  const slow = (r) => (r === 2 ? 40 : r === 1.5 ? 25 : 8);               // only the full ratio is slow, no display rate in the way
  let r = run(g, 20, slow, { vsync: 0 });
  assert.deepEqual(r.steps.map((s) => s[1]), [1.5], 'at 1.5 it runs at 25 ms: fine, and not under 14, so it stays');
  const g2 = createGovernor([2, 1.5, 1]);
  const cost = { 2: 40, 1.5: 25, 1: 8 };
  r = run(g2, 12, () => 45, { vsync: 0 });                                     // slow: down to 1
  assert.equal(g2.ratio, 1);
  r = run(g2, 200, () => 8, { vsync: 0, t0: r.t });                             // recovered
  assert.deepEqual(r.steps.map((s) => s[1]), [1.5, 2], 'one level at a time');
  assert.ok(r.steps[1][0] - r.steps[0][0] >= 10 - 0.1, '10 s apart at least');
  void cost;
});
test('governor: a 60 Hz screen can recover although its frames cannot be under 14 ms', () => {
  const g = createGovernor([2, 1.5, 1]);
  let r = run(g, 12, () => 50, { vsync: 0 });
  assert.equal(g.ratio, 1);
  r = run(g, 200, () => 10, { vsync: 1000 / 60, t0: r.t });
  assert.equal(g.ratio, 2);
});
test('governor: it does not oscillate when the higher ratio is too slow', () => {
  // Drawing costs more as the ratio goes up; the display is 60 Hz. 1 is fine, 1.5 and 2 are not.
  const g = createGovernor([2, 1.5, 1]);
  const cost = (r) => ({ 2: 50, 1.5: 30, 1: 10 })[r];
  const { steps } = run(g, 3600, cost);
  assert.equal(g.ratio, 1, 'it ends where the device can keep up');
  assert.ok(steps.length <= 4, `${steps.length} steps in an hour: ${JSON.stringify(steps)}`);      // down, down, one try back up, down: then it stays
  assert.ok(steps.every((s) => s[0] < 400), 'all of it within the first minutes');
});
test('governor: reset() lets a level that failed be tried again', () => {
  const g = createGovernor([2, 1.5, 1]);
  let cost = (r) => ({ 2: 50, 1.5: 30, 1: 10 })[r];
  let r = run(g, 600, cost);
  assert.equal(g.ratio, 1);
  cost = () => 8;
  r = run(g, 120, cost, { t0: r.t });
  assert.equal(g.ratio, 1, 'banned');
  g.reset();
  r = run(g, 120, cost, { t0: r.t });
  assert.equal(g.ratio, 2);
});
test('governor: a device that is fine at every level does not move', () => {
  const g = createGovernor([2, 1.5, 1]);
  assert.deepEqual(run(g, 600, (r) => 4 + r * 3).steps, []);
});
