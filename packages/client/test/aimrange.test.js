// Aiming an area (issue #600): the edge of the caster's reach, whether a spot is inside it, and that every theme can draw both.
// The client imports the rules as ./shared, so the test lays the two side by side in a temporary folder, as allowance.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'aimrange-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const imp = (f) => import(pathToFileURL(join(tmp, f)));
const { aimFeet, inReach, reachEdge } = await imp('aimrange.js');
const { newGame } = await imp('shared/scenario.js');
const { gridOf } = await imp('shared/grid.js');
const { THEMES } = await imp('themes.js');
const B = await imp('three-build.js');

const world = () => {
  const s = newGame(7), e = Object.values(s.entities).find((x) => x.kind === 'pc');
  return { s, e, G: gridOf(s.map) };
};

test('a spot is in reach up to the range in feet and not beyond; no range means every spot', () => {
  const { s, e } = world();
  const at = (n) => ({ q: e.pos.q + n, r: e.pos.r, z: e.pos.z });
  assert.equal(aimFeet(s, e, at(3)), 15);
  assert.ok(inReach(s, e, at(6), 30));
  assert.ok(!inReach(s, e, at(7), 30));
  assert.ok(inReach(s, e, at(40), 0), 'a cone or a line has no range to be out of');
});

test('the edge of the reach is the outermost ring of cells inside the range, and only those', () => {
  const { s, e, G } = world();
  const edge = reachEdge(s, e, 20);
  assert.ok(edge.length > 0);
  for (const k of edge) {
    const [q, r] = k.split(',').map(Number);
    assert.ok(inReach(s, e, { q, r, z: e.pos.z }, 20), `${k} is inside the reach`);
    assert.ok(G.dist({ q, r }, e.pos) >= 1);
  }
  assert.ok(!edge.includes(`${e.pos.q},${e.pos.r}`), 'the caster is not on the edge of a 20 ft reach');
  assert.deepEqual(reachEdge(s, e, 0), []);
  assert.strictEqual(reachEdge(s, e, 20), edge, 'the same question is answered from memory');
});

test('every theme draws the reach and an area aimed beyond it, and the overlay gains shapes for each', () => {
  const { s, e } = world();
  const base = { move: [], area: [], range: [], areaBad: false, targets: [], allies: [], selected: null, turn: null };
  const edge = reachEdge(s, e, 20), area = [`${e.pos.q + 1},${e.pos.r}`];
  for (const [name, theme] of Object.entries(THEMES)) {
    for (const k of ['range', 'bad']) assert.equal(theme.hl[k]?.length, 4, `${name} has an hl.${k} colour`);
    const none = B.buildOverlay({ state: s, hl: base, theme }).count;
    assert.ok(B.buildOverlay({ state: s, hl: { ...base, range: edge }, theme }).count > none, `${name}: the reach is drawn`);
    const ok = B.buildOverlay({ state: s, hl: { ...base, area }, theme }), bad = B.buildOverlay({ state: s, hl: { ...base, area, areaBad: true }, theme });
    assert.equal(bad.count, ok.count);
    assert.notDeepEqual(Array.from(bad.d), Array.from(ok.d), `${name}: an area out of reach has its own colour`);
  }
});
