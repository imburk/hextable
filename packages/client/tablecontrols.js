// Three table controls for the DM (issue #163): the table's pace, the stock maps, and the line on a character's
// sheet that says where its Fantasy Grounds import report went. Each one only builds and sends ordinary actions
// ({ type: 'setting', key: 'pace' }, { type: 'loadMap' }); nothing here decides a rule.
import { STOCK_MAPS } from './shared/content/maps/index.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const PACES = [
  ['wait', 'Wait: each beat plays before the next starts'],
  ['flow', 'Flow: players act while it plays'],
  ['instant', 'Instant: no animation'],
];
export const PACE_NAME = { wait: 'wait for each beat', flow: 'flow (act while it plays)', instant: 'instant (no animation)' };
// The tag the import writes on its chronicle entry, so the sheet can find it again.
export const IMPORT_TAG = 'fg-import';

export const stockMap = (id) => STOCK_MAPS.find((m) => m.id === id);
export const loadStock = (id) => { const m = stockMap(id); return m ? { type: 'loadMap', map: structuredClone(m.map) } : null; };

// The chronicle entry for an imported character: DM-only (no `public`), titled with the name.
export const importEntry = (name, text) => ({ type: 'chronicle', title: name, text, tags: [IMPORT_TAG] });
// The sheet's line for the DM: where the report is, if there is one. `entries` are the chronicle entries the DM has.
export const importLine = (entries, e) => {
  const found = e?.kind === 'pc' && (entries ?? []).some((c) => c.title === e.name && c.tags?.includes(IMPORT_TAG));
  return found ? `<p class="note" id="sheet-import">Imported from Fantasy Grounds. Its report is in your chronicle (DM panel, Chronicle), under &ldquo;${esc(e.name)}&rdquo;. Only you can see it.</p>` : '';
};

export function initTableControls({ act, getState, isDM, toast }) {
  const opts = STOCK_MAPS.map((m) => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
  $('dm-pace').innerHTML = PACES.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('');
  $('dm-stock').innerHTML = opts;
  $('lobby-map').innerHTML = `<option value="">The starter valley</option>${opts}`;
  const text = () => { $('dm-stock-text').textContent = stockMap($('dm-stock').value)?.text ?? ''; };
  $('dm-stock').onchange = () => { disarm(); text(); };
  text();
  $('dm-pace').onchange = (ev) => act({ type: 'setting', key: 'pace', value: ev.target.value });
  // What follows a won fight (rewards.js): who reviews the rewards, and how the XP is shared.
  $('dm-conclusion').onchange = (ev) => act({ type: 'setting', key: 'conclusion', value: ev.target.value });
  $('dm-xpshare').onchange = (ev) => act({ type: 'setting', key: 'xpShare', value: ev.target.value });

  // Loading a map over the game in progress asks first: a second tap, which lapses after a few seconds.
  const btn = $('dm-stock-go');
  let timer = null;
  function disarm() { clearTimeout(timer); btn.classList.remove('sure'); btn.textContent = 'Start on this map'; $('dm-stock-ask').hidden = true; }
  btn.onclick = () => {
    const S = getState();
    if (!S || S.encounter) return;
    if (!btn.classList.contains('sure')) {
      btn.classList.add('sure'); btn.textContent = 'Tap again to load it';
      $('dm-stock-ask').hidden = false;
      $('dm-stock-ask').textContent = `Load ${stockMap($('dm-stock').value)?.name ?? 'this map'}? The party moves to its start, creatures here stay behind, and the players see the new place at once.`;
      clearTimeout(timer); timer = setTimeout(disarm, 5000);
      return;
    }
    disarm();
    const a = loadStock($('dm-stock').value);
    if (a) { act(a); toast('The map was loaded.', true); }
  };
  return {
    // Called with each new state: show the table's pace to everyone, and let the DM change it.
    sync(S) {
      const pace = S?.settings?.pace ?? 'wait', dm = isDM();
      $('dm-pace').value = pace;
      $('dm-conclusion').value = S?.settings?.conclusion ?? 'dm'; $('dm-xpshare').value = S?.settings?.xpShare ?? 'split';
      $('dm-conclusion-note').hidden = $('dm-conclusion').value !== 'auto';
      $('pace-table').textContent = `The DM has set the table to: ${PACE_NAME[pace] ?? pace}. ${dm ? '' : 'Only the DM can change this.'}`;
      btn.disabled = !!S?.encounter;
      $('dm-stock-fight').hidden = !S?.encounter;
    },
    // The lobby's chosen map: the action to send once the new table's first state has arrived, or null.
    lobbyChoice: () => loadStock($('lobby-map').value),
  };
}
