// Shading the reach by cost (docs/specs/fly-swim-control.md, C3): the three tints, that every theme has them and they can be told
// apart on its floors, and that the overlay draws the walking reach with them. Laid out beside the rules as aimrange.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'costtints-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const imp = (f) => import(pathToFileURL(join(tmp, f)));
const { THEMES, costTints } = await imp('themes.js');
const B = await imp('three-build.js');
const { band } = await imp('heights.js');
const { newGame } = await imp('shared/scenario.js');

const over = (t, f) => f.map((v, i) => t[i] * t[3] + v * (1 - t[3]));
const apart = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

test('three tints from one colour: the nearest the palest and thinnest, the farthest the deepest and most solid, all valid colours', () => {
  const t = costTints([0.95, 0.8, 0.35, 0.34]);
  assert.equal(t.length, 3);
  assert.ok(t[0][3] < t[1][3] && t[1][3] < t[2][3], 'more solid with cost');
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  assert.ok(lum(t[0]) > lum(t[1]) && lum(t[1]) > lum(t[2]), 'deeper with cost');
  for (const c of t) for (const v of c) assert.ok(v >= 0 && v <= 1);
  assert.deepEqual(t[1].slice(0, 3), [0.95, 0.8, 0.35], 'the middle third is the theme\'s own move colour');
  assert.ok(costTints([1, 1, 1, 0.9])[2][3] <= 0.78, 'never so solid that the floor is hidden');
});

test('every theme has the three tints, and on each of its floors a tinted place differs from the floor and from the next tint', () => {
  for (const [name, th] of Object.entries(THEMES)) {
    assert.equal(th.hl.cost.length, 3, name);
    for (const tile of ['grass', 'forest', 'stone']) {
      const f = th.tiles[tile], c = th.hl.cost.map((t) => over(t, f));
      assert.ok(apart(c[0], f) >= 0.05, `${name}/${tile}: the nearest tint shows on the floor (${apart(c[0], f).toFixed(3)})`);
      assert.ok(apart(c[1], c[0]) >= 0.05, `${name}/${tile}: the middle differs from the nearest (${apart(c[1], c[0]).toFixed(3)})`);
      assert.ok(apart(c[2], c[1]) >= 0.05, `${name}/${tile}: the farthest differs from the middle (${apart(c[2], c[1]).toFixed(3)})`);
    }
  }
});

test('the tint of a place: its third of the reach; with no word about a place, the theme\'s one move colour', () => {
  const th = THEMES.classic;
  assert.deepEqual([0, 1, 2].map((k) => B.moveTint(th, k)), th.hl.cost);
  assert.equal(B.moveTint(th, undefined), th.hl.move);
  assert.equal(B.moveTint({ hl: { move: [1, 0, 0, 1] } }, 2)[0], 1, 'a theme with no tints keeps its move colour');
  assert.deepEqual([5, 10, 15, 20, 25, 30].map((c) => band(c, 30)), [0, 0, 1, 1, 2, 2]);
});

test('the overlay draws the walking reach in the tints: each place in the colour of its third', () => {
  const s = newGame(7), e = Object.values(s.entities).find((x) => x.kind === 'pc'), th = THEMES.classic;
  const keys = [1, 2, 3].map((n) => `${e.pos.q + n},${e.pos.r}`), base = { area: [], range: [], targets: [], allies: [], selected: null, turn: null };
  const colours = (hl) => { const d = B.buildOverlay({ state: s, hl: { ...base, ...hl }, theme: th }).d, out = new Set(); for (let i = 0; i < d.length; i += 10) out.add([d[i + 6], d[i + 7], d[i + 8], d[i + 9]].map((v) => Math.round(v * 1000) / 1000).join()); return out; };
  const none = colours({ move: [] }), plain = colours({ move: keys }), shaded = colours({ move: keys, moveBand: { [keys[0]]: 0, [keys[1]]: 1, [keys[2]]: 2 } });
  const fresh = (set) => [...set].filter((c) => !none.has(c));
  assert.deepEqual(fresh(plain), [th.hl.move.map((v) => Math.round(v * 1000) / 1000).join()], 'unshaded: one colour, as before');
  assert.deepEqual(fresh(shaded).sort(), th.hl.cost.map((c) => c.map((v) => Math.round(v * 1000) / 1000).join()).sort());
});
