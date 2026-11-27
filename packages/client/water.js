// The DM's water and tide controls (docs/specs/fly-swim-control.md, E3; issue #854). A section of "Map, sight and light": choose cells (tap or drag on the map, or a room by
// name), then raise or lower them 5 feet, set a surface, or start a tide that moves each round of a fight; a list of the running tides with Stop. Every button sends one `water`
// action (rules `tides.js`); the engine's refusal comes back through `refused()` and is shown in the section as well as in the toast. Pure helpers first (tested in
// test/water.test.js), then the screen.
import { key as cellKey, col as cellCol } from './shared/grid.js';

// The level a tapped hex is on: the one whose tile there has its top at the hex's height, else the first level with a tile there.
export function levelAt(map, hex) {
  const k = cellCol(hex), have = (map?.levels ?? []).filter((l) => l.tiles?.[k]);
  return (have.find((l) => hex.z !== undefined && l.z + (l.tiles[k].h ?? 0) === hex.z) ?? have[0])?.id ?? null;
}
// A tap on a hex adds it to the cells chosen, or takes it out. Cells are all of one level: a tap on another level is told so. -> { sel } or { why }
export function toggle(sel, map, hex) {
  const level = levelAt(map, hex), k = cellCol(hex);
  if (!level) return { why: 'There is no ground to change there.' };
  if (sel.level && sel.level !== level && sel.cells.length) return { why: `The water of one level at a time: these cells are on "${sel.level}". Clear them first.` };
  const has = sel.cells.includes(k), cells = has ? sel.cells.filter((c) => c !== k) : [...sel.cells, k];
  return { sel: { level: cells.length ? level : null, cells, region: '' } };
}
// A height typed in feet: a whole multiple of 5, else null.
export const feetOf = (text) => { const t = String(text ?? '').trim(); if (!/^[+-]?\d+$/.test(t)) return null; const n = Number(t); return n % 5 === 0 ? n : null; };
// Where the water is to change: a region by name, or the cells chosen. -> the part of a `water` action that says where, or null
export const where = (sel) => (sel.region ? { region: sel.region } : sel.cells.length ? { level: sel.level, cells: sel.cells } : null);
// The action for one button. `what` is { by } (raise or lower), { surface }, or { surface?, rise: { by, to } }.
export const waterAction = (sel, what) => { const at = where(sel); return at ? { type: 'water', ...at, ...what } : null; };
export const stopAction = (id) => ({ type: 'water', tide: id, stop: true });
const sgn = (n) => (n > 0 ? `+${n}` : String(n));
// One running tide in words: "T1: 12 cells on ground, now at 0 ft, by +5 each round to 5 ft".
export const tideText = (t, map) => {
  const lvl = map?.levels?.find((l) => l.id === t.level)?.name ?? t.level;
  return `${t.id}: ${t.cells.length} cell${t.cells.length === 1 ? '' : 's'} on ${lvl}, now at ${t.at} ft, ${sgn(t.by)} ft each round to ${t.to} ft`;
};
// The tides to list: those set on the map in play (the others wait, and are said so).
export const tideRows = (S) => (S?.tides ?? []).map((t) => ({ id: t.id, text: tideText(t, S.map), waits: t.map !== S.map?.id }));

export function initWater({ act, toast, getState, closeMenu, refresh, tileHex, dmLevel }) {
  let sel = { level: null, cells: [], region: '' }, picking = false, said = '', sentAt = 0;
  const host = document.getElementById('dm-water');
  const mk = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids); return e; };
  const btn = (id, text, onclick) => mk('button', { type: 'button', id, textContent: text, onclick });
  const num = (id, label, value, step = 5) => mk('label', { className: 'water-num' }, label, mk('input', { id, type: 'number', value, step, inputMode: 'numeric' }));
  const regionSel = mk('select', { id: 'water-region', ariaLabel: 'A room by name' });
  const pickBtn = btn('water-pick', 'Pick on the map', () => { picking = !picking; if (picking) closeMenu(); refresh(); });
  const clearBtn = btn('water-clear', 'Clear', () => { sel = { level: null, cells: [], region: '' }; picking = false; say(''); refresh(); });
  const count = mk('p', { id: 'water-count', className: 'note' });
  const says = mk('p', { id: 'water-says', className: 'note', role: 'status', hidden: true });
  const by = mk('select', { id: 'water-by', ariaLabel: 'Tide: feet each round' }, ...[5, 10, -5, -10].map((n) => mk('option', { value: n, textContent: `${sgn(n)} ft` })));
  const from = num('water-from', 'Start at', '', 5), to = num('water-to', 'to', 5, 5), surf = num('water-surf', 'Surface', 0, 5);
  const tides = mk('div', { id: 'water-tides' });
  host.replaceChildren(mk('h3', { textContent: 'Water and tides' }),
    mk('p', { className: 'note', textContent: 'Choose the cells, then change their water. A tide moves each round of a fight; outside a fight it waits.' }),
    mk('div', { className: 'row' }, regionSel, pickBtn, clearBtn), count,
    mk('div', { className: 'row' }, btn('water-up', 'Raise 5 ft', () => send({ by: 5 })), btn('water-down', 'Lower 5 ft', () => send({ by: -5 }))),
    mk('div', { className: 'row' }, surf, btn('water-set', 'Set surface', () => { const v = feetOf(surf.querySelector('input').value); if (v === null) return say('A surface is a height in feet, a multiple of 5.'); send({ surface: v }); })),
    mk('div', { className: 'row' }, mk('label', { className: 'water-num' }, 'Rise each round by', by), to, from,
      btn('water-tide', 'Start a tide', () => {
        const t = feetOf(to.querySelector('input').value), f = from.querySelector('input').value.trim();
        if (t === null) return say('A tide stops at a height in feet, a multiple of 5.');
        if (f !== '' && feetOf(f) === null) return say('A tide starts at a height in feet, a multiple of 5, or leave it empty.');
        send({ ...(f !== '' ? { surface: feetOf(f) } : {}), rise: { by: Number(by.value), to: t } });
      })),
    says, mk('h4', { textContent: 'Running tides' }), tides);
  regionSel.onchange = () => { sel = { level: null, cells: [], region: regionSel.value }; picking = false; say(''); refresh(); };

  function say(text) { said = text; says.hidden = !text; says.textContent = text; }
  function send(what) {
    const a = waterAction(sel, what);
    if (!a) return say('Choose cells first: pick them on the map, or a room by name.');
    say(''); sentAt = Date.now(); act(a);
  }
  host.addEventListener('click', (ev) => { const b = ev.target.closest('[data-stop]'); if (b) { sentAt = Date.now(); act(stopAction(b.dataset.stop)); } });

  // Dragging over hexes while picking: the first hex says whether the stroke adds or takes out; each hex crossed (the stroke is sampled every few pixels) does it.
  let stroke = null;
  const at = (x, y) => { const S = getState(), l = S.map.levels.find((v) => v.id === sel.level) ?? dmLevel(); return l ? { l, h: tileHex(x, y, l) } : {}; };
  const put = (l, h) => {
    if (!h || !l.tiles[cellCol(h)]) return;
    if (sel.level && sel.level !== l.id && sel.cells.length) return;
    const k = cellCol(h), has = sel.cells.includes(k);
    if (stroke.add === undefined) stroke.add = !has;
    if (stroke.add === has) return;
    const cells = has ? sel.cells.filter((c) => c !== k) : [...sel.cells, k];
    sel = { level: cells.length ? l.id : null, cells, region: '' }; stroke.moved = true;
  };
  const drag = {
    down(x, y) { if (!picking) return false; const { l, h } = at(x, y); if (!l || !h) return false; stroke = { add: undefined, last: [x, y] }; put(l, h); refresh(); return true; },
    move(x, y) {
      if (!stroke) return;
      const [x0, y0] = stroke.last, n = Math.max(1, Math.ceil(Math.hypot(x - x0, y - y0) / 6)), before = sel.cells.length;
      for (let i = 1; i <= n; i++) { const { l, h } = at(x0 + (x - x0) * i / n, y0 + (y - y0) * i / n); if (l) put(l, h); }
      stroke.last = [x, y]; if (sel.cells.length !== before) refresh();
    },
    end() { stroke = null; }, cancel() { stroke = null; },
  };

  return {
    drag,
    picking: () => picking,
    stop() { picking = false; },
    hint: () => `Water: tap or drag over hexes to choose them (${sel.cells.length} chosen). Done picking ends this.`,
    // A tap on the map while picking: true if it was ours.
    tap(hex) {
      if (!picking || !hex) return false;
      const S = getState(), r = toggle(sel, S.map, hex);
      if (r.why) toast(r.why); else { sel = r.sel; say(''); }
      refresh(); return true;
    },
    // The hexes chosen, as keys with their height, for the map to light up.
    marks() {
      const S = getState(), l = S?.map.levels.find((x) => x.id === (sel.region ? S.map.regions.find((r) => r.id === sel.region)?.level : sel.level));
      const keys = sel.region ? S.map.regions.find((r) => r.id === sel.region)?.hexes ?? [] : sel.cells;
      return l ? keys.filter((k) => l.tiles[k]).map((k) => { const [q, r] = k.split(',').map(Number); return cellKey({ q, r, z: l.z + (l.tiles[k].h ?? 0) }); }) : [];
    },
    // Called on every refresh of the table UI.
    sync(S) {
      host.hidden = !!S.map.holding;
      const rooms = S.map.regions;
      if (sel.region && !rooms.some((r) => r.id === sel.region)) sel.region = '';
      if (sel.level && !S.map.levels.some((l) => l.id === sel.level)) sel = { level: null, cells: [], region: '' };
      regionSel.replaceChildren(mk('option', { value: '', textContent: rooms.length ? 'Choose a room…' : 'No rooms on this map' }), ...rooms.map((r) => mk('option', { value: r.id, textContent: `${r.name} (${r.hexes.length})` })));
      regionSel.value = sel.region; regionSel.disabled = !rooms.length;
      pickBtn.textContent = picking ? 'Done picking' : 'Pick on the map'; pickBtn.setAttribute('aria-pressed', String(picking));
      const room = rooms.find((r) => r.id === sel.region), n = room ? room.hexes.length : sel.cells.length;
      count.textContent = n ? `${n} cell${n === 1 ? '' : 's'} chosen${room ? `: ${room.name}` : ` on ${S.map.levels.find((l) => l.id === sel.level)?.name ?? sel.level}`}.` : 'No cells chosen.';
      clearBtn.disabled = !n && !picking;
      const rows = tideRows(S);
      tides.replaceChildren(...(rows.length ? rows.map((t) => mk('div', { className: 'req', id: `water-tide-${t.id}` }, mk('span', { textContent: t.text + (t.waits ? ' (waiting: another map)' : '') }),
        mk('button', { type: 'button', textContent: 'Stop', className: 'water-stop', ariaLabel: `Stop tide ${t.id}` }))) : [mk('p', { className: 'note', textContent: 'No tide is running.' })]));
      tides.querySelectorAll('.water-stop').forEach((b, i) => { b.dataset.stop = rows[i].id; });
    },
    // The table refused something: if it was ours (just sent), say why in the section.
    refused(msg) { if (Date.now() - sentAt < 5000) { say(msg); sentAt = 0; } },
  };
}
