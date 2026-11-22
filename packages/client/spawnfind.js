// Finding a monster to add (#673): a search box, a CR filter and the last few monsters added at this table, above the DM's list of "Add ..."
// buttons (329 of them in the SRD, with a homebrew pack's on top). The pure parts (`crLabel`, `inBand`, `findMonsters`, `pushRecent`,
// `keepKnown`) take plain data and are tested in test/spawnfind.test.js; `initSpawnFind` draws them. Nothing here knows a rule: the entries
// it is given say a name, a creature type and a CR, and the engine's own `spawn` action does the rest.
import { el } from './pickui.js';

export const RECENT_MAX = 6;
// The CR bands, in the order the buttons show. `min` and `max` are inclusive; no `max` means no upper limit.
export const BANDS = [
  { id: 'all', label: 'All CRs' },
  { id: 'low', label: '0–1/4', min: 0, max: 0.25 },
  { id: 'mid', label: '1/2–1', min: 0.5, max: 1 },
  { id: 'two', label: '2–4', min: 2, max: 4 },
  { id: 'high', label: '5+', min: 5 },
];

const FRACTIONS = { 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' };
// A CR as the books write it: 0.25 is "1/4". A creature with no CR (a baked summon) has none to show.
export const crLabel = (cr) => (typeof cr !== 'number' ? '' : FRACTIONS[cr] ?? String(cr));

// Is this CR inside the band? A creature with no CR is only in "all".
export function inBand(cr, band) {
  const b = typeof band === 'string' ? BANDS.find((x) => x.id === band) : band;
  if (!b || b.id === 'all' || (b.min === undefined && b.max === undefined)) return true;
  if (typeof cr !== 'number') return false;
  return cr >= (b.min ?? -Infinity) && cr <= (b.max ?? Infinity);
}

// The entries ({ id, name, type, cr }) that match, in the order given. Every word of the search must be found in the name or the type,
// whatever the case ("dire wolf", "undead", "und", "ghoul undead").
export function findMonsters(entries, { query = '', band = 'all' } = {}) {
  const words = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  return entries.filter((m) => {
    if (!inBand(m.cr, band)) return false;
    const hay = `${m.name ?? ''} ${m.type ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

// The recent list with this id first, once, at most `max` long.
export const pushRecent = (list, id, max = RECENT_MAX) => [id, ...(Array.isArray(list) ? list : []).filter((x) => x !== id)].slice(0, max);
// What was saved, without what is not here now (a homebrew monster whose pack is gone, a saved value that is not a list).
export const keepKnown = (list, known) => (Array.isArray(list) ? list : []).filter((id) => typeof id === 'string' && known(id)).slice(0, RECENT_MAX);

// Draws the controls just above `list` (the element that holds the "Add ..." buttons) and fills `list`. `store` is prefs (get/set that never
// throw); `key()` is the saved list's key, which names the table. `pick(id)` is what a button does.
export function initSpawnFind({ list, store, key, pick }) {
  let entries = [], query = '', band = 'all';
  const input = el('input', { type: 'search', class: 'sf-q', placeholder: 'Search by name or type, e.g. undead', 'aria-label': 'Search monsters', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, enterKeyHint: 'search' });
  const bands = el('div', { class: 'sf-bands', role: 'group', 'aria-label': 'Challenge rating' }, ...BANDS.map((b) => el('button', { type: 'button', class: 'sf-band', 'data-band': b.id, text: b.label })));
  const recentRow = el('div', { class: 'sf-recent', hidden: true });
  const count = el('p', { class: 'note sf-count', 'aria-live': 'polite' });
  const box = el('div', { class: 'spawn-find' }, input, bands, recentRow, count);
  list.before(box);
  list.classList.add('spawn-list');
  const byId = () => new Map(entries.map((m) => [m.id, m]));
  const button = (m) => el('button', { type: 'button', 'data-monster': m.id, text: `Add ${m.name}`, onclick: () => { typing(false); pick(m.id); } });
  const recent = () => keepKnown(store.get(key()), (id) => byId().has(id));
  function draw() {
    const shown = findMonsters(entries, { query, band }), map = byId(), rec = recent();
    list.replaceChildren(...shown.map(button));
    for (const b of bands.children) b.setAttribute('aria-pressed', String(b.dataset.band === band));
    recentRow.replaceChildren(el('span', { class: 'sf-label', text: 'Recent' }), ...rec.map((id) => el('button', { type: 'button', class: 'sf-recent-btn', 'data-recent': id, text: map.get(id).name, title: `Add ${map.get(id).name}`, onclick: () => { typing(false); pick(id); } })));
    recentRow.hidden = !rec.length;
    const filtered = query.trim() || band !== 'all';
    count.textContent = !shown.length ? 'No monster matches. Try fewer letters or All CRs.' : filtered ? `${shown.length} of ${entries.length} monsters` : `${entries.length} monsters`;
  }
  input.oninput = () => { query = input.value; draw(); };
  // A phone's keyboard takes half the screen and the menu's window stops above the dock, so the results would sit behind the dock. While the box
  // has the focus the menu reaches down over the dock (body.sf-typing, pickui.css) and the box is brought to the top of its window. The class goes
  // a moment after the focus does, so a tap on a result is not moved out from under the finger by the menu changing size.
  let off = 0;
  const typing = (on) => { clearTimeout(off); if (on) document.body.classList.add('sf-typing'); else off = setTimeout(() => document.body.classList.remove('sf-typing'), 450); };
  // The keyboard arrives after the focus and resizes the window, and a scroll made before that has nowhere to go: the box stays low and the
  // first result sits where the menu's token is. So the box is brought to the top again whenever the window changes size while it has the focus.
  let bring = 0;
  const onSize = () => { clearTimeout(bring); bring = setTimeout(() => { if (document.activeElement === input) input.scrollIntoView({ block: 'start', behavior: 'auto' }); }, 120); };
  input.onfocus = () => { typing(true); setTimeout(() => input.scrollIntoView({ block: 'start', behavior: 'smooth' }), 250); window.addEventListener('resize', onSize); window.visualViewport?.addEventListener('resize', onSize); };
  input.onblur = () => { typing(false); clearTimeout(bring); window.removeEventListener('resize', onSize); window.visualViewport?.removeEventListener('resize', onSize); };
  input.onkeydown = (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); } };      // Enter shuts a phone's keyboard
  bands.onclick = (ev) => { const b = ev.target.closest('.sf-band'); if (!b) return; band = b.dataset.band; draw(); };
  return {
    // The monsters the page knows now ([id, template] pairs from MONSTERS) with each one's entry in CONTENT.monsters, which has the type and CR.
    set(pairs, content) { entries = pairs.map(([id, m]) => ({ id, name: m.name, type: content[id]?.type ?? '', cr: content[id]?.cr })); draw(); },
    note(id) { store.set(key(), pushRecent(store.get(key()), id)); draw(); },
  };
}
