// The menu's symbols (docs/specs/one-token-menu.md, Decision 4c): line drawings on a 24-unit grid, 1.7-unit strokes with round ends, drawn in the
// colour of the text round them (`currentColor`), so a theme restyles them. Inline SVG strings; no fills. Stage M8 adds the rest of the set; round 6
// (R26, "undo and redo should be standard symbology, not text") needs these two first: the standard curved arrows, one turning back, one forward.
const svg = (inner) => `<svg class="sym" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

export const SYMBOLS = {
  // an arrow head at the left, the line curving up and over to the right, and down: the arrow that goes back
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  redo: svg('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
};
// The words a symbol is spoken as (a symbol alone is never the only name: every control that wears one carries an accessible name).
export const SYMBOL_NAMES = { undo: 'Undo', redo: 'Redo' };
export const symbol = (key) => SYMBOLS[key] ?? '';
