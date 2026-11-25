import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPair, targetNote, dieName, DOUBLE_MS, DOUBLE_PX, slotOptions, pickOptions, weaponOptions, usable } from '../confirm.js';

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
  assert.equal(targetNote(1, 1), '1 of 1 target');
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

// #750 part 2: the choices on the sheet. A usable option has no `why`; one that cannot be used says why in words; the chosen one is `on`.
test('slot levels: every level the caster has is listed, a spent one is greyed with its reason', () => {
  const menu = { levels: [{ level: 2, left: 2, adds: '+1 dart' }, { level: 3, left: 1, adds: '+2 darts' }] };
  const o = slotOptions({ 1: 0, 2: 2, 3: 1 }, 1, menu, 2);
  assert.deepEqual(o.map((x) => x.value), ['1', '2', '3']);
  assert.equal(o[0].why, 'No level 1 spell slot left.');
  assert.equal(o[0].on, false);
  assert.deepEqual([o[1].why, o[1].on, o[1].sub], ['', true, '2 left \u00b7 +1 dart']);
  assert.deepEqual([o[2].why, o[2].on], ['', false]);
  assert.deepEqual(usable(o).map((x) => x.value), ['2', '3']);
});

test('slot levels: levels below the spell are not listed, and a level with no adds shows only what is left', () => {
  const menu = { levels: [{ level: 3, left: 1, adds: '' }, { level: 4, left: 2, adds: '+1d6' }] };
  const o = slotOptions({ 1: 4, 2: 3, 3: 1, 4: 2 }, 3, menu, 4);
  assert.deepEqual(o.map((x) => x.value), ['3', '4']);
  assert.equal(o[0].sub, '1 left');
  assert.equal(o[1].on, true);
});

test('plain choices are all usable, and one is chosen', () => {
  const o = pickOptions(['str', 'dex'], 'dex', (v) => v.toUpperCase());
  assert.deepEqual(o.map((x) => [x.label, x.on, x.why]), [['STR', false, ''], ['DEX', true, '']]);
});

test('weapons: one that the spell cannot change is greyed and says why; the chosen one must be usable', () => {
  const pairs = [[{ id: 'club', name: 'Club' }, ''], [{ id: 'dagger', name: 'Dagger' }, 'not a Club or Quarterstaff']];
  const o = weaponOptions(pairs, 'club');
  assert.deepEqual(o.map((x) => [x.value, x.on, x.why]), [['club', true, ''], ['dagger', false, 'Dagger cannot be used: not a Club or Quarterstaff.']]);
  assert.equal(weaponOptions(pairs, 'dagger')[1].on, false, 'a greyed weapon is never the chosen one');
});
