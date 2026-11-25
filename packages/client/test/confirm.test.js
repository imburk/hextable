import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPair, targetNote, dieName, DOUBLE_MS, DOUBLE_PX } from '../confirm.js';

test('a double-tap is two taps on the same creature, close in time and place', () => {
  const a = { id: 'g1', at: 1000, xy: [100, 100] };
  assert.equal(isPair(a, { id: 'g1', at: 1000 + DOUBLE_MS, xy: [100, 100] }), true);
  assert.equal(isPair(a, { id: 'g1', at: 1000 + DOUBLE_MS + 1, xy: [100, 100] }), false, 'too slow');
  assert.equal(isPair(a, { id: 'g2', at: 1100, xy: [100, 100] }), false, 'another creature');
  assert.equal(isPair(a, { id: 'g1', at: 1100, xy: [100 + DOUBLE_PX, 100] }), true, 'a finger wobbles');
  assert.equal(isPair(a, { id: 'g1', at: 1100, xy: [100 + DOUBLE_PX + 1, 100] }), false, 'too far apart');
  assert.equal(isPair(null, a), false);
  assert.equal(isPair(a, { id: 'g1', at: 900, xy: [100, 100] }), false, 'not before the first');
  assert.equal(isPair({ id: 'g1', at: 1000, xy: null }, { id: 'g1', at: 1100, xy: null }), true, 'no place known: the creature and the time decide');
});

test('the note counts the choice, or says what to do when none is chosen', () => {
  assert.equal(targetNote(4, 2), '2 of 4 targets');
  assert.equal(targetNote(3, 1), '1 of 3 targets');
  assert.equal(targetNote(3, 0), 'No target yet: tap one, then the die.');
  assert.equal(targetNote(0, 0), '', 'no targets to choose: no note');
  assert.equal(targetNote(undefined, undefined), '');
  assert.equal(targetNote(3, 2, 'Not enough slots.'), '2 of 3 targets. Not enough slots.', 'the choices stay, with the reason');
  assert.equal(targetNote(3, 0, 'Out of range.'), 'No target yet: tap one, then the die. Out of range.');
});

test('the die says what waits', () => {
  assert.equal(dieName('Fire Bolt'), 'Confirm Fire Bolt');
  assert.equal(dieName(null), 'Menu');
});
