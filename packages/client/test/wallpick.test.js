// Aiming a spell at a wall (issue #823): which walls are offered (from the player's own view), what a tap names, and the words.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'wallpick-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const imp = (f) => import(pathToFileURL(join(tmp, f)));
const { wallsFor, wallAt, wallOptions, stoneWords, wallArg, wallLabel, noWallWhy, isWallAim, wallNeeded, nearestOn } = await imp('wallpick.js');
const { SPELLS } = await imp('shared/content/index.js');
const { newGame } = await imp('shared/scenario.js');
const { gridOf } = await imp('shared/grid.js');

const STONE = SPELLS['stone-shape'];
// A PC in the valley with walls drawn as given: [id, kind, dx, dy, dx2, dy2] in feet from the middle of its space.
function world(walls) {
  const s = newGame(7), e = Object.values(s.entities).find((x) => x.kind === 'pc'), level = s.map.levels[0], G = gridOf(s.map), c = G.center(e.pos);
  s.map.walls = walls.map(([id, kind, x1, y1, x2, y2]) => ({ id, kind, level: level.id, a: [c[0] + x1, c[1] + y1], b: [c[0] + x2, c[1] + y2] }));
  return { s, e, c, G };
}

test('Stone Shape is aimed at a wall; a creature spell is not; another shape names none', () => {
  assert.ok(isWallAim(STONE));
  assert.ok(!isWallAim(SPELLS['fire-bolt']));
  assert.ok(!isWallAim(undefined));
  assert.ok(wallNeeded(STONE, 'passage'));
  assert.ok(wallNeeded(STONE, undefined));
  assert.ok(!wallNeeded(STONE, 'other'));
  assert.ok(!wallNeeded(SPELLS['fire-bolt'], 'passage'));
});

test('only walls of kind wall within touch are offered, nearest first, with a direction and a distance', () => {
  const { s, e } = world([['far', 'wall', 40, -20, 40, 20], ['pane', 'window', -4, -20, -4, 20], ['south', 'wall', -20, 7, 20, 7], ['north', 'wall', -20, -2.5, 20, -2.5]]);
  const got = wallsFor(s, e, STONE);
  assert.deepEqual(got.map((o) => o.id), ['north', 'south']);
  assert.equal(got[0].dir, 'north');
  assert.equal(got[1].dir, 'south');
  assert.equal(got[0].feet, 0);
  assert.equal(got[1].feet, 5);
  assert.match(wallLabel(got[0]), /^Wall beside you, north$/);
  assert.match(wallLabel(got[1]), /^Wall 5 ft south$/);
  assert.ok(got[0].hexes.length >= 2);
});

test('a Blinded caster, a creature on another level and an empty map are offered nothing', () => {
  const { s, e } = world([['n', 'wall', -20, -2.5, 20, -2.5]]);
  assert.equal(wallsFor(s, e, STONE).length, 1);
  e.cond = { ...e.cond, blinded: {} };
  assert.deepEqual(wallsFor(s, e, STONE), []);
  delete e.cond.blinded;
  s.map.walls[0].level = 'elsewhere';
  assert.deepEqual(wallsFor(s, e, STONE), []);
  s.map.walls = [];
  assert.deepEqual(wallsFor(s, e, STONE), []);
  assert.deepEqual(wallsFor(s, e, SPELLS['fire-bolt']), []);
});

test('a tap names the nearest lit wall within a finger of the tapped space, and the nearest point on it', () => {
  const { s, e, G } = world([['north', 'wall', -30, -2.5, 30, -2.5]]);
  const offers = wallsFor(s, e, STONE), cell = G.center(e.pos);
  const on = wallAt(s, offers, e.pos);
  assert.equal(on.id, 'north');
  assert.ok(Math.abs(on.point[1] - (cell[1] - 2.5)) < 0.02);
  assert.ok(Math.abs(on.point[0] - cell[0]) < 0.02);
  const away = { q: e.pos.q + 8, r: e.pos.r };       // not a hex that the wall is near
  assert.equal(wallAt(s, offers, away), null);
  assert.equal(wallAt(s, offers, null), null);
  assert.equal(wallAt(s, [], e.pos), null);
});

test('a point beyond the caster\'s reach goes back to the point nearest the caster', () => {
  const { s, e, G, c } = world([['north', 'wall', -60, -2.5, 60, -2.5]]);
  const offers = wallsFor(s, e, STONE), tap = { q: e.pos.q + 1, r: e.pos.r - 1 };
  const far = wallAt(s, offers, tap, 5, c);
  assert.equal(far.id, 'north');
  assert.ok(Math.hypot(far.point[0] - c[0], far.point[1] - c[1]) - 2.5 <= 5 + 1e-9);
  assert.ok(G);
});

test('nearestOn clamps to the segment', () => {
  assert.deepEqual(nearestOn([0, 5], [[1, 0], [9, 0]]), [1, 0]);
  assert.deepEqual(nearestOn([4, 5], [[1, 0], [9, 0]]), [4, 0]);
  assert.deepEqual(nearestOn([4, 5], [[2, 2], [2, 2]]), [2, 2]);
});

test('the list, the cast\'s argument and the words', () => {
  const { s, e } = world([['n', 'wall', -20, -2.5, 20, -2.5], ['s', 'wall', -20, 7, 20, 7]]);
  const offers = wallsFor(s, e, STONE), opts = wallOptions(offers, 's');
  assert.deepEqual(opts.map((o) => [o.value, o.on]), [['n', false], ['s', true]]);
  assert.equal(opts[1].sub, '40 ft of wall');
  assert.deepEqual(wallArg(offers[0], [1.5, 2]), { wall: { level: offers[0].level, x: 1.5, y: 2 } });
  assert.match(stoneWords('Stone Shape', offers, null), /tap one of the lit walls, then the die/);
  assert.match(stoneWords('Stone Shape', offers, 's'), /the south wall, 5 ft off\. Tap another to swap it, then tap the die/);
  assert.match(stoneWords('Stone Shape', [], null), /no wall within reach/);
  assert.equal(noWallWhy(s, e, STONE), '');
  s.map.walls = [];
  assert.match(noWallWhy(s, e, STONE), /No wall within 5 ft/);
  assert.equal(noWallWhy(s, e, SPELLS['fire-bolt']), '');
});
