// The DM's Undo and Redo (#654, docs/specs/table-ui.md): the standard curved arrows (symbols.js), as chips beside the token for 8 s after an action and as the first row of DM tools, each disabled when there is nothing to take back or put back. The accessible name starts with the verb.
// The line saying what a press would do shows only on request: 3 s of mouse rest on a computer, a 0.5 s press-hold on a phone: the game's own reveal
// (scrolltip.js `attach`, the one the sheet's rows use). A hold shows the line and the lift after it is not a tap, so it does not undo.
// `hintOf` and `nameOf` are pure (tested); `wire` is the only part that touches the page.
import { attach } from './scrolltip.js';

const WORDS = { Undo: ['Undo takes back', 'Nothing to undo'], Redo: ['Redo puts back', 'Nothing to redo'] };

// `list` is the labels the transport gives for this button (newest first). The card's { title, text }, or null when there is nothing to say.
export const hintOf = (verb, list) => (list?.length ? { title: WORDS[verb][0], text: String(list[0]) } : null);
// The button's accessible name: what it does, or that it cannot.
export const nameOf = (verb, list) => (list?.length ? `${verb}: ${list[0]}` : `${verb}, ${WORDS[verb][1].toLowerCase()}`);

// `current()` gives the labels now (a button's list changes with the game). Returns the button.
export function wire(button, verb, current) { return attach(button, () => hintOf(verb, current())); }
