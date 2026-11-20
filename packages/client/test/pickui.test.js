// The shared pick-UI module's pure parts (#603): which bars are pinned above and below the open section, what a tap on a bar does, and the one-open-row state.
// The hover and press timing is scrolltip.js's dwellTimer (scrolltip.test.js); pickui only decides what opens the card, so there is nothing to time here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accSplit, accNext, oneOpen } from '../pickui.js';
import { HOVER_MS, PRESS_MS } from '../scrolltip.js';

const IDS = ['who', 'scores', 'skills', 'power', 'feats', 'gear'];

test('accSplit: with none open every bar is in one list and the bars show their tips', () => {
  assert.deepEqual(accSplit(IDS, null), { top: IDS, body: null, bottom: [], compact: false });
});
test('accSplit: the bars before the open one are pinned above, the bars after it below, and the bars shrink', () => {
  assert.deepEqual(accSplit(IDS, 'power'), { top: ['who', 'scores', 'skills'], body: 'power', bottom: ['feats', 'gear'], compact: true });
  assert.deepEqual(accSplit(IDS, 'who'), { top: [], body: 'who', bottom: IDS.slice(1), compact: true });
  assert.deepEqual(accSplit(IDS, 'gear'), { top: IDS.slice(0, 5), body: 'gear', bottom: [], compact: true });
});
test('accSplit: an id that is not a section is the same as none open', () => {
  assert.deepEqual(accSplit(IDS, 'nope'), accSplit(IDS, null));
});
test('accNext: a tap opens a closed bar (closing the first) and closes the open one', () => {
  assert.equal(accNext(null, 'skills'), 'skills');
  assert.equal(accNext('skills', 'gear'), 'gear');
  assert.equal(accNext('gear', 'gear'), null);
});
test('oneOpen: one row at a time; asking again closes it', () => {
  const o = oneOpen();
  assert.equal(o.get(), null);
  assert.equal(o.toggle('a'), 'a'); assert.ok(o.is('a'));
  assert.equal(o.toggle('b'), 'b'); assert.ok(!o.is('a'));
  assert.equal(o.toggle('b'), null);
  o.toggle('c'); o.close(); assert.equal(o.get(), null);
});
test('the reveal waits the two times the owner agreed: 3 s of mouse rest, 0.5 s of press', () => { assert.equal(HOVER_MS, 3000); assert.equal(PRESS_MS, 500); });
