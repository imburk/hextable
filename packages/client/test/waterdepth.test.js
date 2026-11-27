// Water drawn by depth (#850). The helpers are in three-build.js, which imports the rules as ./shared, so the test lays them side by side in a temporary folder (as heights.test.js does).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'waterdepth-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
for (const f of ['three-build.js', 'floors.js']) cpSync(join(here, '..', f), join(tmp, f));
const { waterStep, tintWater, WATER_STEPS, tileSig } = await import(pathToFileURL(join(tmp, 'three-build.js')).href);
after(() => rmSync(tmp, { recursive: true, force: true }));

test('depths fall into three steps: 5-10, 15-30, 35 and more', () => {
  assert.equal(WATER_STEPS.length, 3);
  for (const [d, s] of [[5, 0], [10, 0], [15, 1], [30, 1], [35, 2], [200, 2], [undefined, 0]]) assert.equal(waterStep(d), s, `depth ${d}`);
});
test('shallow water is lighter than middling, and deep water is darker', () => {
  const base = [0.25, 0.43, 0.55], lum = (c) => c[0] + c[1] + c[2];
  const sh = tintWater({ t: 'water', depth: 5 }, base), mid = tintWater({ t: 'water', depth: 20 }, base), deep = tintWater({ t: 'water', depth: 100 }, base);
  assert.ok(lum(sh) > lum(mid) && lum(mid) > lum(deep));
  assert.deepEqual(mid, base);
  for (const c of [sh, mid, deep]) assert.ok(c.every((v) => v >= 0 && v <= 1));
});
test('only water is tinted, and the base colour is not changed', () => {
  const base = [0.5, 0.5, 0.5];
  assert.equal(tintWater({ t: 'stone' }, base), base);
  assert.equal(tintWater(undefined, base), base);
  tintWater({ t: 'water', depth: 5 }, base);
  assert.deepEqual(base, [0.5, 0.5, 0.5]);
});
test('the tile signature changes with a water tile\'s depth, so a change redraws', () => {
  const map = (d) => ({ levels: [{ tiles: { '0,0': { t: 'water', depth: d } } }] });
  assert.notEqual(tileSig(map(5)), tileSig(map(60)));
});
