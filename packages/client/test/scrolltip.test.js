// The scroll card's pure parts (#566): the timing both the card and the one-token menu's 3-second labels use, and where the card is put. No DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dwellTimer, placeCard, HOVER_MS, PRESS_MS } from '../scrolltip.js';

// A clock the test drives: set() files a callback, tick(ms) runs what is due.
function clock() {
  let now = 0, id = 0; const q = new Map();
  return { set: (f, ms) => { q.set(++id, { at: now + ms, f }); return id; }, clear: (t) => q.delete(t),
    tick(ms) { now += ms; for (const [k, v] of [...q]) if (v.at <= now) { q.delete(k); v.f(); } } };
}
const rig = (extra = {}) => { const c = clock(), log = []; return { c, log, t: dwellTimer({ hold: (how) => log.push(`hold:${how}`), end: () => log.push('end'), set: c.set, clear: c.clear, ...extra }) }; };

test('the timings are 3 s for a mouse and 500 ms for a press', () => { assert.equal(HOVER_MS, 3000); assert.equal(PRESS_MS, 500); });
test('hover: nothing before 3 s, the card at 3 s, and leaving takes it down', () => {
  const { c, log, t } = rig();
  t.hover(); c.tick(2999); assert.deepEqual(log, []); c.tick(1); assert.deepEqual(log, ['hold:hover']);
  t.leave(); assert.deepEqual(log, ['hold:hover', 'end']);
});
test('leaving before 3 s means no card and no end', () => {
  const { c, log, t } = rig();
  t.hover(); c.tick(2000); t.leave(); c.tick(5000); assert.deepEqual(log, []);
});
test('press: the card at 500 ms; lifting a finger keeps it; a lift before 500 ms (a tap) shows nothing', () => {
  const a = rig(); a.t.press(); a.c.tick(499); a.t.lift(); a.c.tick(1000); assert.deepEqual(a.log, []);
  const { c, log, t } = rig(); t.press(); c.tick(500); t.lift(); assert.deepEqual(log, ['hold:press']); assert.equal(t.shown, true);
  t.leave(); assert.deepEqual(log, ['hold:press', 'end']);
});
test('a second hover restarts the wait; the card is made once', () => {
  const { c, log, t } = rig();
  t.hover(); c.tick(2000); t.hover(); c.tick(2000); assert.deepEqual(log, []); c.tick(1000); assert.deepEqual(log, ['hold:hover']);
});
test('a card brought up by the key is taken down by leave', () => {
  const { log, t } = rig(); t.shownNow(); t.leave(); assert.deepEqual(log, ['end']);
});
test('a card taken down by something else is forgotten, so the next tap is a plain tap', () => {
  const { c, t } = rig(); t.press(); c.tick(500); assert.equal(t.shown, true); t.reset(); assert.equal(t.shown, false);
});
test('a different wait can be given (the one-token menu\'s labels use the same helper)', () => {
  const { c, log, t } = rig({ hoverMs: 1000 }); t.hover(); c.tick(1000); assert.deepEqual(log, ['hold:hover']);
});

test('placeCard: below the anchor when it fits, above when it does not, always inside the screen at 390x844', () => {
  const vw = 390, vh = 844;
  const inside = (p, h) => p.left >= 12 && p.left + p.width <= vw - 12 && p.top >= 12 && p.top + h <= vh - 12;
  for (const a of [{ left: 20, top: 100, right: 180, bottom: 140 }, { left: 300, top: 400, right: 385, bottom: 440 }, { left: 0, top: 790, right: 390, bottom: 830 }, { left: 150, top: 5, right: 250, bottom: 30 }]) {
    const p = placeCard(a, 320, 200, vw, vh); assert.ok(inside(p, 200), JSON.stringify([a, p]));
  }
  assert.equal(placeCard({ left: 20, top: 100, right: 180, bottom: 140 }, 320, 200, vw, vh).top, 150);
  assert.equal(placeCard({ left: 20, top: 700, right: 180, bottom: 740 }, 320, 200, vw, vh).top, 490);
});
test('placeCard: a card taller than the screen is held to the screen and scrolls inside; a narrow screen narrows the card', () => {
  const p = placeCard({ left: 10, top: 300, right: 100, bottom: 330 }, 320, 2000, 390, 844);
  assert.equal(p.maxH, 820); assert.equal(p.top, 12);
  assert.equal(placeCard({ left: 0, top: 0, right: 10, bottom: 10 }, 320, 100, 300, 600).width, 276);
});
