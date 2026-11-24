// M9 of docs/specs/one-token-menu.md (Decision 4c, Arrange): the order of the places and which are hidden. Pure sums; the screen is checked in the drawer smoke pass.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORDER, GROUPS, FIXED, normalOrder, normalHidden, moveTo, moveBy, canMove, setHidden, rank, shows, slotOf, groupOf } from '../menuorder.js';

test('the default order is the strip\'s: the characters, Turns, Dice, Log and chat, then Setup and DM tools; two groups hold them all', () => {
  assert.deepEqual(normalOrder(undefined), ['chars', 'turns', 'dice', 'log', 'settings', 'dm']);
  assert.deepEqual(GROUPS.map((g) => g.name), ['Play', 'This game'], 'question 19, set A');
  assert.deepEqual(GROUPS.flatMap((g) => g.keys), ORDER);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8'), strip = html.slice(html.indexOf('<nav id="menu-root"'), html.indexOf('</nav>', html.indexOf('<nav id="menu-root"')));
  const rows = [...strip.matchAll(/data-go="(\w+)"/g)].map((m) => m[1]).filter((k) => k !== 'sheet' && k !== 'about');
  assert.deepEqual(rows, ORDER.filter((k) => k !== 'chars'), 'every place of the strip that a table has can be arranged');
});

test('a stored order survives being read back: a reload gives the same order', () => {
  const dragged = moveTo(normalOrder(null), 'log', 0);
  assert.deepEqual(dragged, ['log', 'chars', 'turns', 'dice', 'settings', 'dm']);
  assert.deepEqual(normalOrder(JSON.parse(JSON.stringify(dragged))), dragged);
  assert.deepEqual(normalOrder(normalOrder(dragged)), dragged);
});

test('a broken or old stored order is made whole: unknown places dropped, missing ones put back, the groups kept apart', () => {
  assert.deepEqual(normalOrder(['dm', 'log', 'nope', 'log', 'turns']), ['chars', 'log', 'dice', 'turns', 'settings', 'dm'], 'a missing place goes where the default has it');
  assert.deepEqual(normalOrder('turns'), ORDER);
  assert.deepEqual(normalOrder(['settings', 'chars']), ['chars', 'turns', 'dice', 'log', 'settings', 'dm']);
  for (const o of [['dice'], ['dm', 'settings', 'log', 'dice', 'turns', 'chars'], []]) { const n = normalOrder(o); assert.deepEqual([...n].sort(), [...ORDER].sort()); assert.ok(n.indexOf('settings') > 3 && n.indexOf('dm') > 3, `${n}`); }
});

test('a place moves within its group only, by a drag to a place or by one step; at an end it stays', () => {
  assert.deepEqual(moveBy(ORDER, 'dice', -1), ['chars', 'dice', 'turns', 'log', 'settings', 'dm']);
  assert.deepEqual(moveBy(ORDER, 'log', 1), ORDER, 'the last of Play does not move into This game');
  assert.deepEqual(moveBy(ORDER, 'settings', -1), ORDER, 'the first of This game does not move into Play');
  assert.deepEqual(moveBy(ORDER, 'settings', 1), ['chars', 'turns', 'dice', 'log', 'dm', 'settings']);
  assert.deepEqual(moveTo(ORDER, 'chars', 99), ['turns', 'dice', 'log', 'chars', 'settings', 'dm']);
  assert.deepEqual(moveTo(ORDER, 'nope', 0), ORDER);
  assert.equal(canMove(ORDER, 'chars', -1), false); assert.equal(canMove(ORDER, 'chars', 1), true); assert.equal(canMove(ORDER, 'dm', 1), false); assert.equal(canMove(ORDER, 'dm', -1), true);
  assert.equal(groupOf('log'), 'play'); assert.equal(groupOf('dm'), 'game');
});

test('the characters and Setup cannot be hidden, whatever is stored, and their rows say why', () => {
  assert.deepEqual(Object.keys(FIXED), ['chars', 'settings']);
  for (const k of Object.keys(FIXED)) { assert.match(FIXED[k], /^Always shown: /); assert.deepEqual(setHidden([], k, true), []); }
  assert.deepEqual(normalHidden(['chars', 'settings', 'turns', 'turns', 'nope']), ['turns']);
  for (const where of ['arc', 'strip']) { assert.equal(shows(['chars', 'settings'], 'c:pc1', where), true); assert.equal(shows(['chars', 'settings'], 'sheet', where), true); assert.equal(shows(['settings'], 'settings', where), true); }
});

test('Turns, Dice, Log and chat and DM tools may be hidden and shown again; DM tools only leaves the arc', () => {
  let h = [];
  for (const k of ['turns', 'dice', 'log', 'dm']) h = setHidden(h, k, true);
  assert.deepEqual(h, ['turns', 'dice', 'log', 'dm']);
  for (const k of ['turns', 'dice', 'log']) { assert.equal(shows(h, k, 'arc'), false); assert.equal(shows(h, k, 'strip'), false); }
  assert.equal(shows(h, 'dm', 'arc'), false); assert.equal(shows(h, 'dm', 'strip'), true, 'question 23: never from the strip');
  h = setHidden(h, 'dice', false);
  assert.equal(shows(h, 'dice', 'arc'), true);
  assert.deepEqual(setHidden(h, 'turns', true), h, 'hiding twice changes nothing');
  assert.deepEqual(normalHidden(null), [], 'Reset order: nothing stored shows everything');
});

test('the order is applied to the places of the menu: every character takes the characters\' place, and what is not arranged comes last', () => {
  const o = moveTo(ORDER, 'chars', 2);      // turns, dice, chars, log
  const places = ['c:a', 'c:b', 'turns', 'dice', 'log', 'settings', 'dm', 'about'];
  const sorted = [...places].sort((x, y) => rank(o, x) - rank(o, y));       // a stable sort: the characters keep their own order
  assert.deepEqual(sorted, ['turns', 'dice', 'c:a', 'c:b', 'log', 'settings', 'dm', 'about']);
  assert.equal(slotOf('c:a'), 'chars'); assert.equal(slotOf('sheet'), 'chars'); assert.equal(rank(o, 'more'), ORDER.length);
});
