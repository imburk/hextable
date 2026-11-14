// The formation popup (docs/specs/table-ui.md, "E22: formations, client"): when someone leads, the party can be arranged behind them.
// Presets, and a small grid on which a token is dragged (or tapped, then a cell tapped) into a place. OK sends the engine's own action
// (`formation { leader, shape }` or `formation { leader, slots }`), Cancel sends nothing. Pure helpers first (the test lays this file
// beside the rules, as actionpanel.test.js does), then the popup.
//
// Nothing here decides what the rules allow. Who can be placed is the engine's own list (a living member of the party that follows
// the leader and is not hidden, in marching order), the presets' places are `presetSlots` and the current ones `slotsFor`, both from
// engine.js. The popup only offers what those say, and the engine checks again on every action.
import { presetSlots, slotsFor, SLOT_MAX } from './shared/engine.js';
import { gridOf, key as cellKey } from './shared/grid.js';

// The presets in the order they are shown. `held` is "as they stand": the leader's capture of where the party is.
export const PRESETS = [
  { shape: 'held', label: 'Keep as they stand', short: 'As we stand' },
  { shape: 'column', label: 'Column', short: 'Column' },
  { shape: 'pairs', label: 'Two abreast', short: 'Two abreast' },
  { shape: 'line', label: 'Four across', short: 'Four across' },
  { shape: 'wedge', label: 'Wedge', short: 'Wedge' },
];
export const shapeLabel = (shape) => PRESETS.find((p) => p.shape === shape)?.short ?? (shape === 'custom' ? 'Your own places' : 'Column');

const byMarch = (a, b) => (a.march ?? Infinity) - (b.march ?? Infinity);
// Those the engine would give a place: alive, of the party, following this leader, and not hidden (a hidden one is refused a slot).
export const followersOf = (S, leaderId) => Object.values(S.entities)
  .filter((x) => x.side === 'party' && !x.dead && !x.hidden && x.follow === leaderId && x.id !== leaderId).sort(byMarch);

// Why the leader's Lead or Formation control is greyed, or '' when it works. `dm`: the viewer is the DM; `mine`: the viewer controls `e`.
export function formationWhy(S, e, { dm = false, mine = false } = {}) {
  if (!e || e.side !== 'party' || e.dead) return 'Only a member of the party can lead.';
  if (!dm && !mine) return `Only the DM or ${e.name}'s player can lead with ${e.name}.`;
  if (S.encounter) return 'Nobody falls into line in a fight.';
  const others = Object.values(S.entities).filter((x) => x.side === 'party' && !x.dead && x.id !== e.id && x.hp > 0);
  if (!others.length) return 'Nobody else in the party can follow.';
  return '';
}
// Whether the party is following `e` now (the Formation control needs someone to place; a player is refused otherwise).
export const leads = (S, e) => !!e && followersOf(S, e.id).length > 0;
export const whyNoFormation = (S, e, o) => formationWhy(S, e, o) || (leads(S, e) ? '' : `${e.name} isn't leading anyone.`);

// The places to draw for `shape` behind `leader`: { slots, known }. Presets are dealt in marching order, the column is single file, held
// and custom are what the leader keeps. `known` is false for a held shape the leader does not keep yet: the engine captures it where
// everyone stands when it is chosen, and the client cannot know it before.
export function shownSlots(S, leader, shape, followers = followersOf(S, leader.id)) {
  const ids = followers.map((x) => x.id), out = {};
  if (shape === 'column') { ids.forEach((id, i) => { out[id] = { back: i + 1, side: 0 }; }); return { slots: out, known: true }; }
  if (shape === 'pairs' || shape === 'line' || shape === 'wedge') return { slots: presetSlots(shape, ids), known: true };
  const f = leader.formation;
  const mine = f && (f.shape === 'held' || f.shape === 'custom') ? f.slots ?? {} : null;
  if (!mine && shape === 'held') {
    // Not kept yet. Single file in marching order stands in for them, and the popup says so.
    ids.forEach((id, i) => { out[id] = { back: i + 1, side: 0 }; });
    return { slots: out, known: false };
  }
  // Held or custom, as kept. A follower without a place (one who joined after) is put in the first free place at the back, to be seen.
  const taken = new Set();
  for (const id of ids) if (mine?.[id]) { out[id] = { back: mine[id].back, side: mine[id].side }; taken.add(`${mine[id].back},${mine[id].side}`); }
  let back = 1;
  for (const id of ids) if (!out[id]) { while (taken.has(`${back},0`)) back++; out[id] = { back, side: 0 }; taken.add(`${back},0`); }
  return { slots: out, known: true };
}
// The shape in force on the leader now: what the engine keeps, and `column` when it keeps none (and walks the column).
export const currentShape = (leader) => leader.formation?.shape ?? 'column';
// What the preset's own list says when the leader keeps `held` or `custom` places that `slotsFor` would call a column (single file).
export const placesNow = (leader, followers) => slotsFor(leader, followers);

// A token dropped on a cell: the new places for everyone shown, `null` when it cannot go there. The leader's own cell is not a place
// and nothing goes ahead of the leader; a token dropped on another's place swaps with it.
export function place(slots, id, back, side) {
  if (!slots[id] || !Number.isInteger(back) || !Number.isInteger(side)) return null;
  if (back < 0 || back > SLOT_MAX || Math.abs(side) > SLOT_MAX) return null;
  if (back === 0 && side === 0) return null;
  const out = structuredClone(slots), from = slots[id];
  const other = Object.keys(slots).find((o) => o !== id && slots[o].back === back && slots[o].side === side);
  if (other) out[other] = { back: from.back, side: from.side };
  out[id] = { back, side };
  return out;
}
// The size of the board that shows these places: rows behind the leader and columns to each side, never less than a small default.
export function extents(slots) {
  let back = 0, side = 0;
  for (const s of Object.values(slots)) { back = Math.max(back, Math.ceil(s.back)); side = Math.max(side, Math.ceil(Math.abs(s.side))); }
  return { rows: Math.min(SLOT_MAX, Math.max(4, back + 1)), cols: Math.min(SLOT_MAX, Math.max(3, side + (side >= 3 ? 1 : 0))) };
}
// What OK sends: nothing when nothing changed, `{ shape }` for a preset picked, `{ slots }` for places moved by hand.
export function sendFor(leader, draft) {
  if (draft.edited) return { type: 'formation', leader: leader.id, slots: draft.slots };
  if (draft.shape !== currentShape(leader) || (draft.shape === 'held' && !leader.formation)) return { type: 'formation', leader: leader.id, shape: draft.shape };
  return null;
}

// The cells the map can show as ghosts for these places: the cell nearest each place's point in the leader's frame. Needs the way the
// leader faces (`formation.face`); with none yet (it has not walked), there is nothing to draw and the list is empty.
export function ghostCells(S, leader, slots) {
  const face = leader.formation?.face;
  if (!Number.isInteger(face) || !slots) return [];
  const G = gridOf(S.map), nb = G.neighbors({ q: 0, r: 0 })[face];
  if (!nb) return [];
  const o = G.toWorld({ q: 0, r: 0 }), n = G.toWorld(nb), u = { x: n.x - o.x, z: n.z - o.z }, v = { x: -u.z, z: u.x }, w = G.toWorld(leader.pos);
  const out = new Set();
  for (const s of Object.values(slots)) {
    const c = G.fromWorld(w.x - s.back * u.x + s.side * v.x, w.z - s.back * u.z + s.side * v.z);
    out.add(cellKey({ q: c.q, r: c.r, z: leader.pos.z }));
  }
  return [...out];
}

// ---------- the popup ----------
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const initial = (name) => ([...String(name).trim()][0] ?? '?').toUpperCase();

// ctx: { state(), act(action), isDM(), mine(e), refresh() (redraw the map so its ghosts follow) }. Returns { open(leaderId), close(), cancel(),
// isOpen(), ghosts() }. The popup builds its own element and loads its own stylesheet, so index.html does not change.
export function initFormation(ctx) {
  if (!document.getElementById('fm-css')) {
    const l = document.createElement('link'); l.id = 'fm-css'; l.rel = 'stylesheet'; l.href = './formation.css'; document.head.append(l);
  }
  const root = document.createElement('div');
  root.id = 'fm'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'fm-title');
  root.innerHTML = `<div class="fm-card"><h2 id="fm-title"></h2><div class="fm-presets" role="radiogroup" aria-label="Formation"></div><p class="fm-note" id="fm-note"></p>
    <div class="fm-board" id="fm-board" role="group" aria-label="Places behind the leader"></div>
    <div class="row fm-actions"><button type="button" id="fm-cancel">Cancel</button><button type="button" id="fm-ok" class="fm-ok">OK</button></div></div>`;
  document.body.append(root);
  const q = (s) => root.querySelector(s);
  let leaderId = null, draft = null, picked = null, ghost = [];

  const leader = () => ctx.state()?.entities[leaderId];
  const close = () => { root.hidden = true; leaderId = null; draft = null; picked = null; ghost = []; ctx.refresh(); };
  const stillValid = (id = leaderId) => { const S = ctx.state(), l = S?.entities[id]; return !!S && !!l && !S.encounter && !l.dead && (ctx.isDM() || ctx.mine(l)); };

  function setGhosts() { const S = ctx.state(), l = leader(); ghost = S && l && draft ? ghostCells(S, l, draft.known ? draft.slots : null) : []; ctx.refresh(); }

  function draw() {
    const S = ctx.state(), l = leader();
    if (!S || !l || !stillValid()) return close();
    const followers = followersOf(S, l.id), ids = followers.map((x) => x.id);
    // The state moved under the popup (someone left, someone joined): keep what was dragged, drop who is gone, add who came to a free place.
    for (const id of Object.keys(draft.slots)) if (!ids.includes(id)) delete draft.slots[id];
    for (const id of ids) if (!draft.slots[id]) { let b = 1; while (Object.values(draft.slots).some((s) => s.back === b && s.side === 0)) b++; draft.slots[id] = { back: b, side: 0 }; }
    if (picked && !ids.includes(picked)) picked = null;
    q('#fm-title').textContent = `Formation behind ${l.name}`;
    q('.fm-presets').innerHTML = PRESETS.map((p) => `<button type="button" role="radio" class="fm-preset" data-shape="${p.shape}" aria-checked="${!draft.edited && draft.shape === p.shape}">${esc(p.label)}</button>`).join('');
    const { rows, cols } = extents(draft.slots), grid = gridOf(S.map), hex = grid.kind === 'hex';
    const board = q('#fm-board');
    board.dataset.grid = grid.kind; board.style.setProperty('--fm-cols', 2 * cols + 1); board.style.setProperty('--fm-rows', rows); board.style.setProperty('--fm-row', hex ? 0.9 : 1);
    let html = '';
    for (let b = 0; b < rows; b++) for (let s = -cols; s <= cols; s++) {
      const here = b === 0 && s === 0;
      html += `<button type="button" class="fm-cell" data-back="${b}" data-side="${s}" style="left:calc((${s + cols} + .5) * var(--fm-p));top:calc((${b} + .5) * var(--fm-p) * var(--fm-row))" ${here ? 'disabled aria-label="Leader"' : `aria-label="${b} behind, ${Math.abs(s)} ${s < 0 ? 'left' : s > 0 ? 'right' : 'centre'}"`}></button>`;
    }
    const tok = (x, sl, lead) => `<button type="button" class="fm-tok${lead ? ' lead' : ''}${picked === x.id ? ' picked' : ''}" data-id="${esc(x.id)}" style="left:calc((${sl.side + cols} + .5) * var(--fm-p));top:calc((${sl.back} + .5) * var(--fm-p) * var(--fm-row));--c:${esc(x.look?.color || '#888')}" ${lead ? 'disabled' : `aria-pressed="${picked === x.id}"`} aria-label="${esc(x.name)}${lead ? ', the leader' : `, ${sl.back} behind, ${Math.abs(sl.side)} ${sl.side < 0 ? 'left' : sl.side > 0 ? 'right' : 'centre'}`}">${esc(initial(x.name))}</button>`;
    html += tok(l, { back: 0, side: 0 }, true);
    for (const x of followers) html += tok(x, draft.slots[x.id], false);
    board.innerHTML = html;
    q('#fm-note').textContent = followers.length === 0 ? `Nobody follows ${l.name} yet.`
      : !draft.known && !draft.edited ? 'The party stays as it stands now. Tap a shape to change it.'
        : picked ? `Tap a place for ${S.entities[picked].name}.` : 'Drag a token to a place, or tap a token and then a place. The leader stays in front.';
    q('#fm-ok').disabled = followers.length === 0;
    q('#fm-ok').textContent = sendFor(l, draft) ? 'OK' : 'Done';
  }

  function choose(shape) {
    const S = ctx.state(), l = leader(); if (!S || !l) return;
    const { slots, known } = shownSlots(S, l, shape);
    draft = { shape, slots, known, edited: false }; picked = null; draw(); setGhosts();
  }
  function drop(id, back, side) {
    const next = place(draft.slots, id, back, side);
    if (!next) { picked = null; return draw(); }
    draft.slots = next; draft.edited = true; draft.known = true; picked = null; draw(); setGhosts();
  }

  // Presets, cells and tokens. A token is dragged by a pointer (mouse or finger); a press that does not travel selects it, and the next cell tapped is its place.
  q('.fm-presets').addEventListener('click', (ev) => { const b = ev.target.closest('[data-shape]'); if (b) choose(b.dataset.shape); });
  const board = q('#fm-board');
  board.addEventListener('click', (ev) => {
    const c = ev.target.closest('.fm-cell'); if (!c || !picked || c.disabled) return;
    drop(picked, Number(c.dataset.back), Number(c.dataset.side));
  });
  let drag = null;
  board.addEventListener('pointerdown', (ev) => {
    const t = ev.target.closest('.fm-tok'); if (!t || t.disabled || ev.button > 0) return;
    drag = { id: t.dataset.id, el: t, x: ev.clientX, y: ev.clientY, moved: false };
    t.setPointerCapture?.(ev.pointerId); ev.preventDefault();
  });
  board.addEventListener('pointermove', (ev) => {
    if (!drag) return;
    const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 8) return;
    drag.moved = true; drag.el.classList.add('drag'); drag.el.style.translate = `${dx}px ${dy}px`;
  });
  const end = (ev, cancelled) => {
    if (!drag) return;
    const d = drag; drag = null; d.el.classList.remove('drag'); d.el.style.translate = '';
    if (cancelled) return;
    if (!d.moved) { picked = picked === d.id ? null : d.id; return draw(); }
    // The cell under the finger: the board's own arithmetic, the same as where the cells were laid.
    const r = board.getBoundingClientRect(), { rows, cols } = extents(draft.slots);
    const back = Math.floor((ev.clientY - r.top) / (r.height / rows)), side = Math.floor((ev.clientX - r.left) / (r.width / (2 * cols + 1))) - cols;
    drop(d.id, back, side);
  };
  board.addEventListener('pointerup', (ev) => end(ev, false));
  board.addEventListener('pointercancel', (ev) => end(ev, true));

  q('#fm-cancel').onclick = close;
  q('#fm-ok').onclick = () => {
    const l = leader(); if (!l || !draft) return close();
    const a = sendFor(l, draft);
    const send = a && stillValid() ? a : null;
    close();
    if (send) ctx.act(send);
  };
  root.addEventListener('click', (ev) => { if (ev.target === root) close(); });
  root.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } });

  return {
    isOpen: () => !root.hidden,
    // Open for a leader that someone follows. The preset shown as chosen is the one the engine keeps.
    open(id) {
      const S = ctx.state(), l = S?.entities[id];
      if (!l || !stillValid(id) || !followersOf(S, id).length) return false;
      leaderId = id; root.hidden = false;
      choose(currentShape(l) === 'custom' ? 'custom' : currentShape(l) === 'column' && !l.formation ? 'held' : currentShape(l));
      q('.fm-preset[aria-checked="true"]')?.focus?.({ preventScroll: true });
      return true;
    },
    close,
    // The state changed under an open popup: redraw it, or close it when it is not valid any more.
    sync() { if (!root.hidden && !drag) draw(); },
    ghosts: () => ghost,
  };
}
