// #793: when the dimmed map's tap is also the map's tap. The drawer wiring (drawer.js) and the page are covered by the smoke passes upcast, imbue and drawer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapTap } from '../passtap.js';

const down = { x: 100, y: 200, t: 1000, type: 'touch' };
test('a short still tap is passed on, with where it landed and what touched', () => {
  assert.deepEqual(mapTap(down, { x: 102, y: 201, t: 1120 }, true), { x: 102, y: 201, type: 'touch' });
});
test('every other menu only closes: not wanted, no tap', () => assert.equal(mapTap(down, { x: 100, y: 200, t: 1100 }, false), null));
test('a drag is not a tap', () => assert.equal(mapTap(down, { x: 140, y: 200, t: 1100 }, true), null));
test('a press held is not a tap', () => assert.equal(mapTap(down, { x: 100, y: 200, t: 1700 }, true), null));
test('a click with no press seen (a key, a script) only closes', () => assert.equal(mapTap(null, { x: 1, y: 1, t: 5 }, true), null));
