// What the DM's badge says it counts (#844): one function of the three sources, used by both badges and by the DM tools' first row.
// The client imports the rules as ./shared, so the test lays the two side by side in a temporary folder, as allowance.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'waitwords-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const { waitingWords } = await import(pathToFileURL(join(tmp, 'todo.js')));

test('nothing waiting says nothing', () => {
  assert.deepEqual(waitingWords([], []), { n: 0, text: '' });
});
test('one card is named', () => {
  assert.deepEqual(waitingWords([], [{ name: 'Starry Wisp' }]), { n: 1, text: '1 waiting: a to-do card (Starry Wisp)' });
});
test('a player and rewards, in the order given', () => {
  assert.equal(waitingWords(['Ana asks to join', 'rewards to settle'], []).text, '2 waiting: Ana asks to join; rewards to settle');
});
test('several cards are counted and the first three named; a card with no name is "a note"', () => {
  const w = waitingWords(['Ana asks to join'], [{ name: 'A' }, { name: '' }, { name: 'C' }, { name: 'D' }]);
  assert.equal(w.n, 5);
  assert.equal(w.text, '5 waiting: Ana asks to join; 4 to-do cards (A, a note, C, ...)');
});
