import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hintOf, nameOf } from '../undobar.js';

test('Undo says what it takes back, Redo what it puts back, the newest step first', () => {
  assert.deepEqual(hintOf('Undo', ['Brenna moves', 'Goblin attacks']), { title: 'Undo takes back', text: 'Brenna moves' });
  assert.deepEqual(hintOf('Redo', ['Tor hits the goblin']), { title: 'Redo puts back', text: 'Tor hits the goblin' });
});
test('with nothing to take back or put back there is no line to show', () => {
  assert.equal(hintOf('Undo', []), null);
  assert.equal(hintOf('Redo', undefined), null);
});
test('the accessible name carries the same words, or says there is nothing', () => {
  assert.equal(nameOf('Undo', ['Brenna moves']), 'Undo: Brenna moves');
  assert.equal(nameOf('Redo', ['Brenna moves']), 'Redo: Brenna moves');
  assert.equal(nameOf('Undo', []), 'Undo, nothing to undo');
  assert.equal(nameOf('Redo', []), 'Redo, nothing to redo');
});
