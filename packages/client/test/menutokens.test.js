// The token and the menu take their colour, shadow and edge from the theme (docs/specs/one-token-menu.md: themes restyle only), so every
// theme must carry the tokens drawer.css reads, and the same ones: a theme that lacked one would draw a token in another theme's colour.
import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES } from '../themes.js';
import { FIXED } from '../keys.js';

const TOKENS = ['--die', '--die-ink', '--die-edge', '--scrim', '--panel-solid', '--tk-shadow', '--tk-join'];

test('every theme carries the tokens the menu and its token read', () => {
  for (const [id, t] of Object.entries(THEMES)) for (const k of TOKENS) assert.ok(t.ui[k], `${id} has no ${k}`);
});

test('the number on the die can be read against its face in every theme', () => {
  const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  for (const [id, t] of Object.entries(THEMES)) {
    const [a, b] = [lum(t.ui['--die']), lum(t.ui['--die-ink'])].sort((x, y) => y - x);
    assert.ok((a + 0.05) / (b + 0.05) >= 3, `${id}: the die's number is hard to read on its face`);
  }
});

test('the menu keys are listed for the keys list, and take no key from a preset', () => {
  const row = FIXED.find((f) => /In the menu/.test(f.words));
  assert.ok(row, 'the menu keys are in the list');
  assert.deepEqual(row.codes, [], 'they are the menu\'s own while it has the focus; no preset loses a key to them');
});
