// Three table controls for the DM (issue #163): the table's pace, the stock maps, and the line on a character's
// sheet that says where its Fantasy Grounds import report went; and since then more table rules (Strike first, #585). Each one only builds and sends ordinary actions
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
// The aim bar's words once an area's aim is locked by a tap (before it, hover previews and the hint says "tap a hex to aim").
export const aimedWords = (G) => gridWords('Aimed: tap another hex to move it, or tap the die', G);
export const gridName = (map) => gridOf(map).word.many;

// The words of the rolled-score rule's choices (engine/dm.js SETTINGS; the longer words are SETTING_TEXT). Short, so a phone's select shows the whole choice.
const SCORE_NAMES = { reroll: { none: 'Never (the SRD)', below: 'Once, a score below a number', each: 'Once, every score' }, result: { new: 'The new roll, even if lower', higher: 'The higher of the two' } };

// The table rules that only mean something on a square map (engine/dm.js SETTINGS; the words beside each choice are SETTING_TEXT).
// Each is a question and the short names of its choices, in the order of SETTINGS (the first is the default).
export const SQUARE_RULES = [
  { key: 'diagonals', ask: 'How a diagonal step is counted', names: { real: 'For real: about 7 ft', srd: 'As the SRD: 5 ft', alternate: 'Every second one 10 ft' } },
  { key: 'squareRange', ask: 'How reach and range are measured', names: { real: 'For real, rounded down', srd: 'As the SRD: a diagonal is a square' } },
  { key: 'areaFill', ask: 'Which squares a Sphere, Cylinder or Emanation covers', names: { round: 'Those whose centre is inside it', grid: 'Every square within its size' } },
  { key: 'squareCover', ask: 'How cover is judged', names: { obstacle: 'By what is in the way', corners: 'By the four corners' } },
];

// The table rule `strikeFirst` (engine/dm.js SETTINGS; #585): a choice under "Start a fight when the party comes near
// enemies", with the words of the chosen value under it. 'off' unless the state says otherwise (a new table has none).
export const STRIKE_FIRST_ASK = 'Strike first: what lands before the fight it starts';
export const STRIKE_FIRST_NAMES = { off: 'Off (SRD)', casts: 'Spells only', all: 'Spells and attacks' };
export const strikeFirstRule = (settings) => {
  const v = SETTINGS.strikeFirst.includes(settings?.strikeFirst) ? settings.strikeFirst : 'off';
  return { value: v, text: SETTING_TEXT.strikeFirst[v] };
};

// Turning on 'Spells and attacks' ('all') asks first (#649); turning it off, or choosing the other values, does not. Plain words on what changes in play.
export const STRIKE_FIRST_WARNING = 'From now on, an attack, a hostile spell or a monster\'s action at the other side lands first, before anyone rolls Initiative, whether you or a player makes it. This is a table rule that is not in the SRD, and it changes who gets the first blow in every fight.';
export const strikeFirstNeedsAsk = (from, to) => to === 'all' && strikeFirstRule({ strikeFirst: from }).value !== 'all';

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

  // Strike first (#585): after the engage checkbox (app.js keeps that one). The select is at least 44 px high, for touch.
  $('dm-engage').closest('label').insertAdjacentHTML('afterend', `<label class="assign">${esc(STRIKE_FIRST_ASK)} <select id="dm-strike-first" style="min-height:44px">${SETTINGS.strikeFirst.map((v) => `<option value="${esc(v)}">${esc(STRIKE_FIRST_NAMES[v] ?? v)}</option>`).join('')}</select></label>
    <p class="note" id="dm-strike-first-text"></p>`);
  // Turning on 'Spells and attacks' asks first, in the page's own dialog; Cancel puts the choice back as the table has it.
  const sfAsk = $('strike-first-ask'), sfSelect = $('dm-strike-first');
  const sfClose = () => { sfAsk.hidden = true; sfSelect.value = strikeFirstRule(getState()?.settings).value; };
  $('strike-first-msg').textContent = STRIKE_FIRST_WARNING;
  $('strike-first-cancel').onclick = () => { sfClose(); sfSelect.focus(); };
  $('strike-first-on').onclick = () => { sfAsk.hidden = true; act({ type: 'setting', key: 'strikeFirst', value: 'all' }); sfSelect.focus(); };
  sfAsk.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); $('strike-first-cancel').click(); } });
  sfSelect.onchange = (ev) => {
    const to = ev.target.value;
    if (!isDM()) { sfSelect.value = strikeFirstRule(getState()?.settings).value; return; }
    if (strikeFirstNeedsAsk(getState()?.settings?.strikeFirst, to)) { sfAsk.hidden = false; $('strike-first-cancel').focus(); return; }
    act({ type: 'setting', key: 'strikeFirst', value: to });
  };

  // Rolled ability scores (docs/specs/ability-scores.md): may a score be rolled again, below what number, and which result stands. A section of its own after the one that
  // holds the XP choice (it is not a fight rule). Each choice is a label over a select the whole width and at least 44 px high (a thumb), as the square rules are (`#dm-scores` in style.css).
  $('dm-xpshare').closest('section').insertAdjacentHTML('afterend', `<section id="dm-scores"><h3>Rolled ability scores</h3>
    <label class="assign">A score may be rolled again <select id="dm-score-reroll">${SETTINGS.scoreReroll.map((v) => `<option value="${v}">${esc(SCORE_NAMES.reroll[v])}</option>`).join('')}</select></label>
    <label class="assign" id="dm-score-below-label">Rolled again if it is below <select id="dm-score-below">${[...SETTINGS.scoreRerollBelow].sort((x, y) => x - y).map((v) => `<option value="${v}">${v}</option>`).join('')}</select></label>
    <label class="assign" id="dm-score-result-label">The result that stands <select id="dm-score-result">${SETTINGS.scoreRerollResult.map((v) => `<option value="${v}">${esc(SCORE_NAMES.result[v])}</option>`).join('')}</select></label>
    <p class="note" id="dm-score-text"></p></section>`);
  for (const [id, key, num] of [['dm-score-reroll', 'scoreReroll', false], ['dm-score-below', 'scoreRerollBelow', true], ['dm-score-result', 'scoreRerollResult', false]]) $(id).onchange = (ev) => act({ type: 'setting', key, value: num ? +ev.target.value : ev.target.value });
  const scoreRule = (S) => {
    const st = S?.settings ?? {}, mode = st.scoreReroll ?? 'none', res = st.scoreRerollResult ?? 'new';
    $('dm-score-reroll').value = mode; $('dm-score-below').value = String(st.scoreRerollBelow ?? 10); $('dm-score-result').value = res;
    $('dm-score-below-label').hidden = mode !== 'below'; $('dm-score-result-label').hidden = mode === 'none';
    $('dm-score-text').textContent = `${SETTING_TEXT.scoreReroll[mode]}${mode === 'none' ? '' : ` ${SETTING_TEXT.scoreRerollResult[res]}`}`;
  };
  // Hit Points (#638): fixed (the SRD's default) or rolled at each level after the first, and what a low roll does. A section of its own after the scores, with the same full-width selects.
  const HP_NAMES = { method: { fixed: 'Fixed (half the Hit Die plus 1)', rolled: 'Rolled by the game' }, low: { keep: 'The roll stands', reroll1: 'Roll a 1 again, once', fixedMin: 'Never below the fixed value' } };
  $('dm-scores').insertAdjacentHTML('afterend', `<section id="dm-hp"><h3>Hit Points at each level</h3>
    <label class="assign">Hit Points after level 1 <select id="dm-hp-method">${SETTINGS.hpMethod.map((v) => `<option value="${v}">${esc(HP_NAMES.method[v])}</option>`).join('')}</select></label>
    <label class="assign" id="dm-hp-low-label">A low roll <select id="dm-hp-low">${SETTINGS.hpRollLow.map((v) => `<option value="${v}">${esc(HP_NAMES.low[v])}</option>`).join('')}</select></label>
    <p class="note" id="dm-hp-text"></p></section>`);
  for (const [id, key] of [['dm-hp-method', 'hpMethod'], ['dm-hp-low', 'hpRollLow']]) $(id).onchange = (ev) => act({ type: 'setting', key, value: ev.target.value });
  const hpRule = (S) => {
    const st = S?.settings ?? {}, m = st.hpMethod ?? 'fixed', low = st.hpRollLow ?? 'keep';
    $('dm-hp-method').value = m; $('dm-hp-low').value = low; $('dm-hp-low-label').hidden = m !== 'rolled';
    $('dm-hp-text').textContent = `${SETTING_TEXT.hpMethod[m]}${m === 'rolled' ? ` ${SETTING_TEXT.hpRollLow[low]}` : ''}`;
  };
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
      scoreRule(S); hpRule(S);
      const sf = strikeFirstRule(S?.settings);
      $('dm-strike-first').value = sf.value; $('dm-strike-first-text').textContent = sf.text;
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
