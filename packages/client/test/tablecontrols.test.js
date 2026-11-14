// The words of the table rules on squares and the grid's words (S13c). The client imports the rules as ./shared, so the test lays
// the two side by side in a temporary folder, as actionpanel.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'tablecontrols-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const { SQUARE_RULES, gridWords, gridName } = await import(pathToFileURL(join(tmp, 'tablecontrols.js')));
const { SETTINGS, SETTING_TEXT } = await import(pathToFileURL(join(tmp, 'shared/engine.js')));
const { HEX, SQUARE } = await import(pathToFileURL(join(tmp, 'shared/grid.js')));

test('the four square rules are the engine\'s four, with a name and words for every choice', () => {
  assert.deepEqual(SQUARE_RULES.map((r) => r.key), ['diagonals', 'squareRange', 'areaFill', 'squareCover']);
  for (const r of SQUARE_RULES) {
    assert.deepEqual(Object.keys(r.names), SETTINGS[r.key], `${r.key}: a name for each value, in the engine's order`);
    for (const v of SETTINGS[r.key]) assert.ok(SETTING_TEXT[r.key][v].length > 40, `${r.key}/${v} has its words`);
    assert.ok(r.ask.length > 8);
  }
});

test('hex words become square words on a square map and are left alone on a hex map', () => {
  assert.equal(gridWords('Tap a hex to place Pat; hexes lock', HEX), 'Tap a hex to place Pat; hexes lock');
  assert.equal(gridWords('Tap a hex to place Pat; hexes lock', SQUARE), 'Tap a square to place Pat; squares lock');
  assert.equal(gridWords('Hextable and hexagons', SQUARE), 'Hextable and hexagons', 'only whole words');
  assert.equal(gridName({ grid: 'square' }), 'squares');
  assert.equal(gridName({ grid: 'hex' }), 'hexes');
  assert.equal(gridName(undefined), 'hexes');
});
