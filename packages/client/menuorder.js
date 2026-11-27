// Arrange (docs/specs/one-token-menu.md, Decision 4c "Arrange", round 3 and 4; stage M9): the order of the places on the arc and the strip, and which are
// hidden, kept on the device (`hextable.menuOrder`, `hextable.menuHidden`). Pure: drawer.js reads the preferences, draws the screen and applies the answer.
//
// A place here is one of: 'chars' (every character this person plays, as one row: they keep the party's order, or the turn order in a fight), 'turns',
// 'dice', 'log', 'settings', 'dm'. They are in two groups (question 19, set A): Play and This game. A place moves within its group only.
export const ORDER = ['chars', 'turns', 'dice', 'log', 'settings', 'dm'];
export const GROUPS = [{ id: 'play', name: 'Play', keys: ['chars', 'turns', 'dice', 'log'] }, { id: 'game', name: 'This game', keys: ['settings', 'dm'] }];
// Two kinds of place cannot be hidden (round 4), and their row says why.
export const FIXED = { chars: 'Always shown: your character is how you play.', settings: 'Always shown: Setup is where hidden symbols come back, and where you leave the table.' };
export const groupOf = (key) => GROUPS.find((g) => g.keys.includes(key))?.id ?? null;

// A stored order made whole: only known places, each once, the groups kept together in their own order (Play, then This game), and a place the
// stored order does not know (a new one) put where the default has it.
export function normalOrder(stored) {
  const seen = Array.isArray(stored) ? [...new Set(stored.filter((k) => ORDER.includes(k)))] : [];
  const out = [];
  for (const g of GROUPS) {
    const have = seen.filter((k) => g.keys.includes(k));
    for (const k of g.keys) if (!have.includes(k)) have.splice(Math.min(have.length, g.keys.indexOf(k)), 0, k);
    out.push(...have);
  }
  return out;
}
// What may be hidden of a stored list: known places, never a fixed one.
export const normalHidden = (stored) => (Array.isArray(stored) ? [...new Set(stored.filter((k) => ORDER.includes(k) && !(k in FIXED)))] : []);

// `key` moved to place `to` (0 is first) among the places of its own group; the other group is untouched. A place never leaves its group.
export function moveTo(order, key, to) {
  const all = normalOrder(order), g = GROUPS.find((x) => x.keys.includes(key));
  if (!g) return all;
  const mine = all.filter((k) => g.keys.includes(k)), from = mine.indexOf(key), at = Math.max(0, Math.min(mine.length - 1, Math.round(to)));
  mine.splice(from, 1); mine.splice(at, 0, key);
  return GROUPS.flatMap((x) => (x === g ? mine : all.filter((k) => x.keys.includes(k))));
}
// One step up (-1) or down (+1); at an end of its group it stays.
export const moveBy = (order, key, d) => { const all = normalOrder(order), g = GROUPS.find((x) => x.keys.includes(key)); return g ? moveTo(all, key, all.filter((k) => g.keys.includes(k)).indexOf(key) + d) : all; };
export const canMove = (order, key, d) => moveBy(order, key, d).join() !== normalOrder(order).join();
// Hide or show a place; a fixed one stays shown.
export const setHidden = (hidden, key, on) => { const h = normalHidden(hidden); if (on) return h.includes(key) || !ORDER.includes(key) || key in FIXED ? h : [...h, key]; return h.filter((k) => k !== key); };

// Which place of this module a place of the menu belongs to: a character's symbol ('c:<id>') and the one Character place are 'chars'.
export const slotOf = (place) => (String(place).startsWith('c:') || place === 'sheet' ? 'chars' : place);
// Where a place of the menu comes in the order (a place this module does not arrange, About or More, comes after the rest, as it stands).
export const rank = (order, place) => { const i = normalOrder(order).indexOf(slotOf(place)); return i < 0 ? ORDER.length : i; };
// Whether a place shows: `where` is 'arc' or 'strip'. A hidden place is off both, except DM tools, which only leaves the arc (question 23: the DM must
// not lose the way to the tools, and the strip is where the way stays).
export const shows = (hidden, place, where) => { const k = slotOf(place); return !normalHidden(hidden).includes(k) || (k === 'dm' && where === 'strip'); };
