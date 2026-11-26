// Aiming a wall and rolling a sphere (issue #795): the taps, what the cast carries, and the roll control; the shape is the engine's own.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'wallaim-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const imp = (f) => import(pathToFileURL(join(tmp, f)));
const { isWall, wallTap, wallToward, towardArg, wallWords, rollers, rollMode, rollAct } = await imp('wallaim.js');
const { SPELLS } = await imp('shared/content/index.js');
const { areaHexes } = await imp('shared/engine.js');
const { newGame } = await imp('shared/scenario.js');
const { key } = await imp('shared/grid.js');

const A = { q: 2, r: 1 }, B = { q: 4, r: 0 };

test('only a placed Line is a wall', () => {
  for (const id of ['wall-of-fire', 'wall-of-thorns', 'blade-barrier']) assert.ok(isWall(SPELLS[id]), id);
  for (const id of ['fireball', 'web', 'burning-hands', 'flaming-sphere']) assert.ok(!isWall(SPELLS[id]), id);
});

test('the first tap places the wall; the same spot again casts it across; another space names the way', () => {
  let st = wallTap({}, A);
  assert.deepEqual(st, { aim: A, toward: null, cast: false });
  assert.equal(wallTap(st, A).cast, true);
  st = wallTap(st, B);
  assert.deepEqual(st, { aim: A, toward: B, cast: false });
  assert.deepEqual(towardArg(st), { toward: B });
  assert.equal(wallTap(st, B).cast, true);
  assert.deepEqual(wallTap(st, B).toward, B);
  const skipped = wallTap(st, A);       // the wall's own spot: skip the direction
  assert.deepEqual(skipped, { aim: A, toward: null, cast: false });
  assert.deepEqual(towardArg(skipped), {});
  assert.deepEqual(wallTap(st, { q: 0, r: 0 }).toward, { q: 0, r: 0 });
});

test('a hover previews a direction until one is chosen, and never the spot itself', () => {
  assert.deepEqual(wallToward({ aim: A, hoverTo: B }), B);
  assert.deepEqual(wallToward({ aim: A, toward: { q: 0, r: 0 }, hoverTo: B }), { q: 0, r: 0 });
  assert.equal(wallToward({ aim: A, hoverTo: A }), null);
  assert.deepEqual(towardArg({ aim: A, toward: A }), {});
});

test('the words name who is caught and how to turn or cast', () => {
  assert.match(wallWords('Wall of Fire', {}, []), /Tap another space.*nobody|nobody.*Tap another space/s);
  assert.match(wallWords('Wall of Fire', { toward: B }, ['Orc']), /Orc.*again to cast/s);
});

test("the preview is the engine's own: a direction changes the cells and the cast carries it", () => {
  const s = newGame(7), e = Object.values(s.entities).find((x) => x.kind === 'pc'), sp = SPELLS['wall-of-fire'];
  const at = { q: e.pos.q + 5, r: e.pos.r };
  const across = areaHexes(s, e, sp, at).map(key), along = areaHexes(s, e, sp, at, { q: at.q, r: at.r + 3 }).map(key), other = areaHexes(s, e, sp, at, { q: at.q + 3, r: at.r }).map(key);
  assert.ok(across.length > 3);
  assert.notDeepEqual([...along].sort(), [...other].sort());
});

test('a creature that cast Flaming Sphere has a roll control; nobody else', () => {
  const e = { id: 'a' }, S = { effects: [{ id: 'fx1', name: 'Flaming Sphere', spell: 'flaming-sphere', source: 'a' }, { id: 'fx2', name: 'Wall of Fire', spell: 'wall-of-fire', source: 'a' }, { id: 'fx3', name: 'Flaming Sphere', spell: 'flaming-sphere', source: 'b' }] };
  const r = rollers(S, e);
  assert.deepEqual(r, [{ id: 'fx1', name: 'Flaming Sphere', feet: 30 }]);
  assert.deepEqual(rollers(S, { id: 'c' }), []);
  assert.deepEqual(rollers(null, e), []);
  assert.deepEqual(rollAct('a', rollMode(r[0]), { q: 3, r: 4, z: 0 }), { type: 'moveZone', actor: 'a', to: { q: 3, r: 4 }, effect: 'fx1' });
});
