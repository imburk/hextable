// The DM's to-do tray: what the engine handed to the DM and the DM has not yet settled.
//
// `s.todo` is `{ n, cards }`: `n` counts the cards ever made (so no card number is used twice, undo aside, which puts
// the whole of it back), `cards` are the open ones, oldest first. A card is DM-only: `s.todo` is one top-level key that
// `playerView` does not list, so no player is sent it (docs/specs/dm-todo.md). It is kept in the state, not made on
// the screen, so it survives a reload and a second tab, and an undo takes back both the card and its Done.
//
//   { n, t, kind: 'manual', actor, name, text, ids, count?, partial? }
//       one `manual` event: who (`actor`, or null), what it is called (a spell, a feature), the words the engine gave the
//       DM, and the creatures its words name (`ids`). The same note made again while its card is open adds to `count`.
//   { n, t, kind: 'run', actor, name, runs: [{ name, text }], why: 'added' | 'turn' }
//       a creature with abilities the engine does not run (Spellcasting, Legendary Actions: DEBT M5, M6): the DM runs
//       them. One open card for a creature; a new turn makes it new.
//
// Pure: the dice and the clock are the game's own. Design: docs/specs/dm-todo.md.
import { CONTENT } from './content/index.js';

export const MAX_CARDS = 150;
const TEXT = 500;

// The abilities of a monster's block that the engine does not play. A trait with text and nothing the engine can read
// (no modifiers, no effects, no reaction) whose name says it is one of these. When M5 and M6 are built the traits carry
// what the engine reads and this list goes quiet by itself.
const RUNS = /^(?:innate |psionic )?spellcasting\b|^legendary (?:actions|resistance)\b/i;
const unread = (t) => !(Array.isArray(t.modifiers) && t.modifiers.length) && !(Array.isArray(t.effects) && t.effects.length) && !t.reaction;

export function runsOf(e) {
  if (!e || e.side === 'party' || e.kind === 'pc') return [];
  const traits = CONTENT.monsters?.[e.tpl]?.traits;
  if (!Array.isArray(traits)) return [];
  const out = [];
  for (const t of traits) if (t && typeof t.name === 'string' && RUNS.test(t.name) && unread(t) && !out.some((x) => x.name === t.name)) out.push({ name: t.name.slice(0, 60), text: String(t.text ?? '').slice(0, 700) });
  return out;
}

function list(s) {
  const t = s.todo;
  if (!t || typeof t !== 'object' || !Array.isArray(t.cards) || !Number.isInteger(t.n)) s.todo = { n: 0, cards: [] };
  return s.todo;
}
const keep = (t) => { while (t.cards.length > MAX_CARDS) t.cards.shift(); };

// The creatures a note names: its actor, and any creature whose name stands in the words, as a whole name.
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const RES = new Map();
const wholeName = (name) => { let r = RES.get(name); if (!r) { if (RES.size > 500) RES.clear(); r = new RegExp(`(?<![\\w])${esc(name)}(?![\\w])`); RES.set(name, r); } return r; };
export function namedIn(s, text, actor) {
  const ids = [];
  if (typeof actor === 'string' && s.entities[actor]) ids.push(actor);
  const words = String(text ?? '');
  for (const e of Object.values(s.entities)) {
    if (ids.length >= 8) break;
    if (ids.includes(e.id) || typeof e.name !== 'string' || e.name.length < 2) continue;
    if (wholeName(e.name).test(words)) ids.push(e.id);
  }
  return ids;
}

// A `manual` event, told by `record` (engine.js) as it is written to the record.
// `standing` (casting.js) is an assist spell's own description, said on every cast: where the engine applied the effect it is no
// job for the DM, so it makes no card; the notes for what the engine left out say so themselves. Of a manual spell it is the only
// word, so it does. `waits` marks a note for which the engine applied none of the spell: its caster is told it waits for the DM.
export function noteManual(s, ev) {
  if (ev.standing === 'assist') return;
  const t = list(s);
  const actor = typeof ev.actor === 'string' && s.entities[ev.actor] ? ev.actor : null;
  const name = String(ev.name ?? '').slice(0, 80), text = String(ev.text ?? '').slice(0, TEXT);
  const waits = ev.waits === true || ev.partial !== true || ev.standing === 'manual';
  const i = t.cards.findIndex((c) => c.kind === 'manual' && c.actor === actor && c.name === name && c.text === text);
  if (i >= 0) {                                      // made again: it counts, and comes up as new (a new number, the clock now), so the DM sees it
    const [same] = t.cards.splice(i, 1);
    t.cards.push({ ...same, n: ++t.n, t: Number.isFinite(s.clock) ? s.clock : 0, count: (same.count ?? 1) + 1 });
    return;
  }
  t.cards.push({ n: ++t.n, t: Number.isFinite(s.clock) ? s.clock : 0, kind: 'manual', actor, name, text, ids: namedIn(s, text, actor), ...(ev.partial ? { partial: true } : {}), ...(waits ? { waits: true } : {}) });
  keep(t);
}

// A creature that has abilities the DM runs was added or began its turn. It is said when it is added and once more at its first
// turn (`ran`: 1, 2), not again: a DM who has settled it does not have it back every round.
export function noteRuns(s, e, why) {
  const runs = runsOf(e);
  if (!runs.length) return;
  const t = list(s);
  if (!t.ran || typeof t.ran !== 'object') t.ran = {};
  const stage = why === 'added' ? 1 : 2;
  if ((t.ran[e.id] ?? 0) >= stage) return;
  t.ran[e.id] = stage;
  t.cards = t.cards.filter((c) => !(c.kind === 'run' && c.actor === e.id));
  t.cards.push({ n: ++t.n, t: Number.isFinite(s.clock) ? s.clock : 0, kind: 'run', actor: e.id, name: String(e.name).slice(0, 60), runs, why });
  keep(t);
}

// What `record` does last: a creature that has died or gone takes its "You run" card with it, and is forgotten.
export function tidy(s) {
  const t = s.todo;
  if (!t || typeof t !== 'object' || !Array.isArray(t.cards)) return;
  const gone = (id) => !s.entities[id] || s.entities[id].dead;
  if (t.cards.some((c) => c.kind === 'run' && gone(c.actor))) t.cards = t.cards.filter((c) => !(c.kind === 'run' && gone(c.actor)));
  if (t.ran) for (const id of Object.keys(t.ran)) if (!s.entities[id]) delete t.ran[id];
}

// The DM is done with one card, or with all of them.
export function settle(s, n) {
  const t = list(s);
  if (n === 'all') { const had = t.cards.length; t.cards = []; return had; }
  const i = t.cards.findIndex((c) => c.n === n);
  if (i < 0) return 0;
  t.cards.splice(i, 1);
  return 1;
}

// Whether a note is named for something the creature has: a spell it knows, a feature, an attack. Only then may its
// player be told that something waits for the DM, and never in the DM's words (view.js, viewWaiting).
export function isOwnName(e, name) {
  if (!e || typeof name !== 'string' || !name) return false;
  const low = name.toLowerCase();
  for (const id of e.spells ?? []) if (String(CONTENT.spells?.[id]?.name ?? '').toLowerCase() === low) return true;
  for (const f of e.feats ?? []) if (String(f?.name ?? '').toLowerCase() === low) return true;
  for (const a of e.attacks ?? []) if (String(a?.name ?? '').toLowerCase() === low) return true;
  return false;
}
