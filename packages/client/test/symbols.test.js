// The symbols (symbols.js): every one is an inline SVG drawn in the colour of its text, with no fill of its own, and has a spoken name, so a control that wears
// one (Undo, Redo) can carry the name "Undo" or "Redo" (docs/specs/one-token-menu.md, round 6 R26).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SYMBOLS, SYMBOL_NAMES, symbol } from '../symbols.js';

test('undo and redo are inline line drawings in currentColor, hidden from a screen reader, with a name each', () => {
  for (const k of ['undo', 'redo']) {
    const s = symbol(k);
    assert.match(s, /^<svg [^>]*viewBox="0 0 24 24"/);
    assert.match(s, /stroke="currentColor"/);
    assert.match(s, /fill="none"/);
    assert.match(s, /aria-hidden="true"/);
    assert.ok(SYMBOL_NAMES[k], `${k} has a name`);
  }
  assert.equal(SYMBOL_NAMES.undo, 'Undo'); assert.equal(SYMBOL_NAMES.redo, 'Redo');
  assert.notEqual(SYMBOLS.undo, SYMBOLS.redo);
  assert.equal(symbol('nothing'), '');
});
