// Three table controls for the DM (issue #163): the table's pace, the stock maps, and the line on a character's
// sheet that says where its Fantasy Grounds import report went. Each one only builds and sends ordinary actions
// ({ type: 'setting', key: 'pace' }, { type: 'loadMap' }); nothing here decides a rule.
import { STOCK_MAPS } from './shared/content/maps/index.js';
import { SETTINGS, SETTING_TEXT } from './shared/engine.js';
import { gridOf } from './shared/grid.js';

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

// A sentence in the grid's words: "hex" and "hexes" become "square" and "squares" on a square map (the editor says the same).
export const gridWords = (text, G) => (G.kind === 'hex' ? text : String(text).replace(/\bhexes\b/g, G.word.many).replace(/\bhex\b/g, G.word.one));
export const gridName = (map) => gridOf(map).word.many;

// The table rules that only mean something on a square map (engine/dm.js SETTINGS; the words beside each choice are SETTING_TEXT).
// Each is a question and the short names of its choices, in the order of SETTINGS (the first is the default).
export const SQUARE_RULES = [
  { key: 'diagonals', ask: 'How a diagonal step is counted', names: { real: 'For real: about 7 ft', srd: 'As the SRD: 5 ft', alternate: 'Every second one 10 ft' } },
  { key: 'squareRange', ask: 'How reach and range are measured', names: { real: 'For real, rounded down', srd: 'As the SRD: a diagonal is a square' } },
  { key: 'areaFill', ask: 'Which squares a Sphere, Cylinder or Emanation covers', names: { round: 'Those whose centre is inside it', grid: 'Every square within its size' } },
  { key: 'squareCover', ask: 'How cover is judged', names: { obstacle: 'By what is in the way', corners: 'By the four corners' } },
];

// The lobby's last choice of grid for the starter valley, kept on the device.
export const GRID_KEY = 'hextable.valleyGrid';
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
  // The starter valley comes on squares or on hexes (squares listed first); the choice is asked only while "The starter valley" is
  // the starting map, and the device remembers the last one. Nothing remembered: squares (the owner's choice of default; the engine's own `newGame` with no option is still the hex valley).
  const grids = [...document.getElementsByName('lobby-grid')];
  const last = (() => { try { return localStorage.getItem(GRID_KEY); } catch { return null; } })();
  for (const r of grids) r.checked = r.value === (last === 'hex' ? 'hex' : 'square');
  const showGrid = () => { $('lobby-grid').hidden = $('lobby-map').value !== ''; };
  $('lobby-map').addEventListener('change', showGrid); showGrid();
  for (const r of grids) r.addEventListener('change', () => { try { localStorage.setItem(GRID_KEY, valleyGrid()); } catch { /* storage unavailable */ } });
  function valleyGrid() { return grids.find((r) => r.checked)?.value === 'square' ? 'square' : 'hex'; }
  // Which grid the chosen starting map is on: said under the list when a stock map is chosen (the valley asks with the buttons above).
  const lobbyNote = () => {
    const m = stockMap($('lobby-map').value);
    $('lobby-map-grid').hidden = !m; $('lobby-map-grid').textContent = m ? `This map is on ${gridName(m.map)}.` : '';
  };
  $('lobby-map').addEventListener('change', lobbyNote); lobbyNote();
  // The square rules: one choice each, with the words of the chosen value under it. Shown only on a square map (see sync).
  const rules = $('dm-square-rules');
  rules.innerHTML = SQUARE_RULES.map((r) => `<label class="assign">${esc(r.ask)} <select id="dm-${r.key}">${SETTINGS[r.key].map((v) => `<option value="${esc(v)}">${esc(r.names[v] ?? v)}</option>`).join('')}</select></label><p class="note" id="dm-${r.key}-text"></p>`).join('');
  const rule = (r) => { const v = getState()?.settings?.[r.key] ?? SETTINGS[r.key][0]; $(`dm-${r.key}`).value = v; $(`dm-${r.key}-text`).textContent = SETTING_TEXT[r.key]?.[v] ?? ''; };
  for (const r of SQUARE_RULES) $(`dm-${r.key}`).onchange = (ev) => { act({ type: 'setting', key: r.key, value: ev.target.value }); };
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
      const G = gridOf(S?.map);
      $('dm-map-grid').textContent = S?.map ? `Now playing on ${S.map.name ?? 'a map'}, which is on ${G.word.many}.` : '';
      $('dm-square').hidden = G.kind !== 'square';
      if (G.kind === 'square') SQUARE_RULES.forEach(rule);
      $('set-floors-each').textContent = `Each ${G.word.one} on its own`;
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
    // The grid for a new game's valley: what the device remembers as the last choice (the lobby's buttons hold it),
    // and for a new game from the lobby, hexes if a stock map was chosen (the valley is only where that map is loaded).
    valleyGrid,
    lobbyGrid: () => ($('lobby-map').value === '' ? valleyGrid() : 'hex'),
  };
}
