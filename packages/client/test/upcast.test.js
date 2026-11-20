// Casting at a higher level (issue #604): the default slot, the options and what each adds.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'upcast-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const imp = (f) => import(pathToFileURL(join(tmp, f)));
await imp('shared/engine.js');       // the rules' own import cycles want the engine first, as the app's imports give it
const { slotChoices, defaultSlot, slotFor, slotMenu, addsText } = await imp('upcast.js');
const { SPELLS } = await imp('shared/content/index.js');

const wiz = (slots, extra = {}) => ({ level: 5, slots, ...extra });

test('the default is the lowest slot left at the spell level or above', () => {
  const mm = SPELLS['magic-missile'];
  assert.equal(defaultSlot(wiz({ 1: 4, 2: 3, 3: 2 }), mm), 1);
  assert.equal(defaultSlot(wiz({ 1: 0, 2: 3, 3: 2 }), mm), 2);
  assert.equal(defaultSlot(wiz({ 1: 0, 2: 0, 3: 0 }), mm), null);
  assert.equal(defaultSlot(wiz({ 1: 4 }), SPELLS['fireball']), null);       // nothing at level 3 or above
  assert.deepEqual(slotChoices(wiz({ 1: 4 }), SPELLS['fire-bolt']), []);    // a cantrip uses no slot
});

test('a choice made that can no longer pay falls back to the default', () => {
  const mm = SPELLS['magic-missile'];
  assert.equal(slotFor(wiz({ 1: 4, 2: 3 }), mm, 2), 2);
  assert.equal(slotFor(wiz({ 1: 0, 2: 3 }), mm, 1), 2);
  assert.equal(slotFor(wiz({ 1: 4, 2: 3 }), mm, null), 1);
});

test('the options list says what each level adds, from the spell data', () => {
  const m = slotMenu(wiz({ 1: 2, 2: 1, 3: 1 }), SPELLS['magic-missile']);
  assert.deepEqual(m.levels.map((r) => r.level), [1, 2, 3]);
  assert.equal(m.def, 1);
  assert.equal(m.levels[0].adds, '');
  assert.equal(m.levels[1].adds, '+1 dart');
  assert.equal(m.levels[2].adds, '+2 darts');
  assert.match(m.levels[1].label, /^Level 2 \(1 left\) · \+1 dart$/);
  assert.equal(addsText(SPELLS['burning-hands'], wiz({}), 3), '+2d6 fire');
  assert.equal(addsText(SPELLS['burning-hands'], wiz({}), 2), '+1d6 fire');
});

test('one level to choose from, or a level that adds nothing, gives no menu', () => {
  assert.equal(slotMenu(wiz({ 1: 0, 2: 3 }), SPELLS['magic-missile']), null);
  assert.equal(slotMenu(wiz({ 1: 4, 2: 3 }), SPELLS['shield']), null);
  // Pact Magic: every slot is one level, so there is nothing to choose
  assert.equal(slotMenu(wiz({ 3: 2 }, { pact: true }), SPELLS['burning-hands']), null);
  assert.equal(defaultSlot(wiz({ 3: 2 }, { pact: true }), SPELLS['burning-hands']), 3);
});
