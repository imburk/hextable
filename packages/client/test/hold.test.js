// The hold timing of a ping (#599): fires after exactly the hold time, and a move, a release, a second finger or a disabled map cancel it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHold, HOLD_MS, HOLD_SLOP } from '../hold.js';

// A clock and timers that only move when the test says so.
function rig(opts = {}) {
  let t = 0, next = 1; const timers = new Map(), log = [];
  const hold = createHold({
    setTimer: (f, ms) => { const id = next++; timers.set(id, { f, at: t + ms }); return id; }, clearTimer: (id) => timers.delete(id),
    onStart: (x, y) => log.push(['start', x, y]), onFire: (x, y) => log.push(['fire', x, y]), onCancel: () => log.push(['cancel']), ...opts,
  });
  const advance = (ms) => { t += ms; for (const [id, k] of [...timers]) if (k.at <= t) { timers.delete(id); k.f(); } };
  return { hold, log, advance, timers };
}

test('the hold is one second and the slop is the map tap\'s own 8 px', () => { assert.equal(HOLD_MS, 1000); assert.equal(HOLD_SLOP, 8); });

test('a press held a full second fires once, where it went down', () => {
  const r = rig();
  assert.equal(r.hold.down(1, 100, 200), true);
  r.advance(999); assert.deepEqual(r.log, [['start', 100, 200]]);
  r.advance(1); assert.deepEqual(r.log, [['start', 100, 200], ['fire', 100, 200]]);
  assert.equal(r.hold.active(), false);
  r.hold.up(1); r.advance(5000);
  assert.equal(r.log.length, 2, 'the release after a fire cancels nothing and nothing fires twice');
});

test('a release before the second cancels', () => {
  const r = rig();
  r.hold.down(1, 5, 5); r.advance(600); r.hold.up(1); r.advance(2000);
  assert.deepEqual(r.log, [['start', 5, 5], ['cancel']]);
  assert.equal(r.timers.size, 0);
});

test('a small wobble holds, a move past the slop cancels', () => {
  const r = rig();
  r.hold.down(1, 50, 50); r.hold.move(1, 55, 54); r.advance(1000);
  assert.equal(r.log.at(-1)[0], 'fire');
  const q = rig();
  q.hold.down(1, 50, 50); q.advance(400); q.hold.move(1, 50, 59); q.advance(2000);
  assert.deepEqual(q.log, [['start', 50, 50], ['cancel']]);
});

test('a second finger cancels the hold and starts none; the pointer of another id changes nothing', () => {
  const r = rig();
  r.hold.down(1, 1, 1); r.hold.move(2, 500, 500); r.hold.up(2); assert.equal(r.hold.active(), true);
  assert.equal(r.hold.down(2, 9, 9), false);
  r.advance(2000);
  assert.deepEqual(r.log, [['start', 1, 1], ['cancel']]);
});

test('a hold does not begin on the map editor, nor on a right or middle button', () => {
  const r = rig();
  assert.equal(r.hold.down(1, 1, 1, { enabled: false }), false);
  assert.equal(r.hold.down(1, 1, 1, { button: 2 }), false);
  assert.equal(r.hold.down(1, 1, 1, { button: 1 }), false);
  r.advance(2000); assert.deepEqual(r.log, []);
  assert.equal(r.hold.down(1, 1, 1, { button: 0 }), true);
});

test('cancel() (a pinch, the table closing) gives a running hold up, and a spare cancel does nothing', () => {
  const r = rig();
  r.hold.cancel(); assert.deepEqual(r.log, []);
  r.hold.down(1, 1, 1); r.hold.cancel(); r.advance(2000);
  assert.deepEqual(r.log, [['start', 1, 1], ['cancel']]);
  r.hold.down(1, 2, 2); r.advance(1000); assert.equal(r.log.at(-1)[0], 'fire');
});
