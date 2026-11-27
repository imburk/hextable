// The menu's symbols (docs/specs/one-token-menu.md, Decision 4c): line drawings on a 24-unit grid, 1.7-unit strokes with round ends, drawn in the
// colour of the text round them (`currentColor`), so a theme restyles them. Inline SVG strings; no fills except small dots (which are short strokes
// with round ends, so they too take the stroke's colour and a theme's square ends). Round 6 (R26) brought the two curved arrows; M8 the rest of the set.
const svg = (inner) => `<svg class="sym" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const dot = (x, y) => `<path d="M${x} ${y}h.01"/>`;

export const SYMBOLS = {
  // an arrow head at the left, the line curving up and over to the right, and down: the arrow that goes back
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  redo: svg('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
  // a character with no sigil of its own: a head and shoulders
  character: svg('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.6-4 3.2-6 7-6s6.4 2 7 6"/>'),
  // crossed swords: the fight's order
  turns: svg('<path d="M4 4l11 11"/><path d="M20 4 9 15"/><path d="m12.5 17.5 5-5"/><path d="m6.5 12.5 5 5"/><path d="m15.5 15.5 4 4"/><path d="m8.5 15.5-4 4"/>'),
  // a campfire: the party at rest together
  party: svg('<path d="M12 4c2.6 2.6 4 4.6 4 6.8a4 4 0 0 1-8 0c0-1.3.5-2.3 1.5-3.3.3 1.3 1 2 1.8 2C11 8 11 6 12 4z"/><path d="m4 20 16-4"/><path d="m4 16 16 4"/>'),
  // a d20: the rolls
  dice: svg('<path d="M12 2.5 20.2 7.25v9.5L12 21.5l-8.2-4.75v-9.5z"/><path d="M12 2.5 7.5 14h9z"/><path d="M3.8 7.25 7.5 14 12 21.5 16.5 14l3.7-6.75"/>'),
  // two dice with pips: rolling
  roll: svg(`<rect x="2.5" y="9.5" width="10" height="10" rx="2"/><rect x="12.5" y="3.5" width="9" height="9" rx="2"/>${dot(5.5, 12.5)}${dot(9.5, 16.5)}${dot(17, 8)}`),
  // a speech bubble with lines: talk and what was said
  log: svg('<path d="M4 5h16v11H11l-4.5 3.5V16H4z"/><path d="M8 9h8"/><path d="M8 12h5"/>'),
  // a scroll
  handouts: svg('<path d="M7 4h11a2 2 0 0 1 2 2v1h-4"/><path d="M16 7V6a2 2 0 0 0-2-2"/><path d="M16 6v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1h10v1a2 2 0 0 0 2 2"/><path d="M7 4a2 2 0 0 0-2 2v11"/><path d="M9 9h4"/><path d="M9 12h4"/>'),
  // a cog: a ring with eight square teeth and a round hole
  setup: svg('<path d="M10.10 4.85L10.10 1.80L13.90 1.80L13.90 4.85A7.4 7.4 0 0 1 15.71 5.60L17.87 3.44L20.56 6.13L18.40 8.29A7.4 7.4 0 0 1 19.15 10.10L22.20 10.10L22.20 13.90L19.15 13.90A7.4 7.4 0 0 1 18.40 15.71L20.56 17.87L17.87 20.56L15.71 18.40A7.4 7.4 0 0 1 13.90 19.15L13.90 22.20L10.10 22.20L10.10 19.15A7.4 7.4 0 0 1 8.29 18.40L6.13 20.56L3.44 17.87L5.60 15.71A7.4 7.4 0 0 1 4.85 13.90L1.80 13.90L1.80 10.10L4.85 10.10A7.4 7.4 0 0 1 5.60 8.29L3.44 6.13L6.13 3.44L8.29 5.60A7.4 7.4 0 0 1 10.10 4.85z"/><circle cx="12" cy="12" r="2.8"/>'),
  // an open-end wrench set on the diagonal: an open C-shaped jaw at the top right, a straight handle to the bottom left
  dm: svg('<g transform="rotate(45 12 12)"><path d="M10.2 2.3V6.5h3.6V2.3A4.6 4.6 0 0 1 13.5 10.85V19.5a1.5 1.5 0 0 1-3 0V10.85A4.6 4.6 0 0 1 10.2 2.3z"/></g>'),
  // two meeples: people at the table
  characters: svg('<path d="M8 4a2 2 0 0 1 2 2c0 .7 3 1.3 3 3 0 1-1.5 1-2.2 1 .4 2 1.7 5 1.7 6H9.8L8 13.5 6.2 16H3.5c0-1 1.3-4 1.7-6C4.5 10 3 10 3 9c0-1.7 3-2.3 3-3a2 2 0 0 1 2-2z"/><path d="M17 9a1.7 1.7 0 0 1 1.7 1.7c0 .6 2.3 1 2.3 2.4 0 .8-1.2.8-1.8.8.3 1.7 1.3 4.3 1.3 5.1h-2.2L17 17l-1.3 2"/>'),
  // a strapped tome: a book with a clasp
  packs: svg('<path d="M5 4h12a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z"/><path d="M5 17a2 2 0 0 1 2-2h12"/><path d="M19 10h-4v3h4"/><path d="M9 4v11"/>'),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7"/>' + dot(12, 16.5)),
  about: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/>' + dot(12, 7.5)),
  // a door with an arrow
  leave: svg('<path d="M10 4H5v16h5"/><path d="M10 12h10"/><path d="m16 8 4 4-4 4"/>'),
  more: svg(dot(6, 12) + dot(12, 12) + dot(18, 12)),
  // six dots: the drag handle people know
  arrange: svg(dot(9, 6) + dot(15, 6) + dot(9, 12) + dot(15, 12) + dot(9, 18) + dot(15, 18)),
  // for Arrange (M9): shown, hidden, up, down
  eye: svg('<path d="M2.5 12c2.3-4 5.5-6 9.5-6s7.2 2 9.5 6c-2.3 4-5.5 6-9.5 6s-7.2-2-9.5-6z"/><circle cx="12" cy="12" r="2.5"/>'),
  eyeOff: svg('<path d="M4 4l16 16"/><path d="M9.5 6.4C10.3 6.1 11.1 6 12 6c4 0 7.2 2 9.5 6-.8 1.4-1.7 2.5-2.7 3.4"/><path d="M15.5 17.3c-1.1.5-2.2.7-3.5.7-4 0-7.2-2-9.5-6 1-1.7 2.1-3 3.4-4"/>'),
  up: svg('<path d="m6 14 6-6 6 6"/>'),
  down: svg('<path d="m6 10 6 6 6-6"/>'),
};
// The words a symbol is spoken as (a symbol alone is never the only name: every control that wears one carries an accessible name).
export const SYMBOL_NAMES = {
  undo: 'Undo', redo: 'Redo', character: 'Character', turns: 'Turns', party: 'Party', dice: 'Dice', roll: 'Roll dice', log: 'Log and chat', handouts: 'Handouts', setup: 'Setup', dm: 'DM tools',
  characters: 'Characters', packs: 'Packs', help: 'Help', about: 'About', leave: 'Leave the table', more: 'More', arrange: 'Arrange the symbols', eye: 'Shown', eyeOff: 'Hidden', up: 'Move up', down: 'Move down',
};
export const symbol = (key) => SYMBOLS[key] ?? '';

// The menu's places (drawer.js: a screen's key) and the symbol each wears on the arc and the strip. A character wears its own sigil, a letter on its colour
// with its health ring; `sheet` is the Character screen of a table with no character row. Turns wears the campfire while nobody fights (`placeSymbol`).
export const PLACE_SYMBOLS = { sheet: 'character', turns: 'turns', dice: 'dice', log: 'log', handouts: 'handouts', settings: 'setup', dm: 'dm', about: 'about', more: 'more' };
export const placeSymbol = (place, { fight = true } = {}) => (place === 'turns' && !fight ? 'party' : PLACE_SYMBOLS[place] ?? null);
