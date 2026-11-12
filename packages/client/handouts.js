// Handouts and notes to one player: the DM's "Handouts" section, the players' Handouts panel,
// the full-screen viewer, and the note box under the log. Everything goes through actions; the
// pictures come from the transport's file store (server or IndexedDB). Design:
// docs/specs/maps-and-objects.md, "Sharing things that are not on the map".
//
//   const HO = initHandouts({ act, toast, transport: () => T, state: () => S, isDM, openPanel });
//   HO.refresh()        after every update
//   HO.describe(ev)     a log line for the events this module knows, or null
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TITLE_MAX = 80, TEXT_MAX = 2000, NOTE_MAX = 1000;

export function initHandouts({ act, toast, transport, state, isDM, openPanel }) {
  const T = () => transport(), S = () => state();
  const players = () => (T()?.lobby?.members ?? []).filter((m) => m.role === 'player');
  const who = (id) => (id === 'dm' ? 'the DM' : (T()?.lobby?.members ?? []).find((m) => m.id === id)?.name ?? 'a player who left');
  const seen = new Set();          // handouts this player has opened, for the badge
  let viewing = null;              // id of the handout open in the viewer

  // ---------- pictures ----------
  // Fill every <img data-asset> under `root` from the store. A file that cannot be had says so.
  function pictures(root) {
    for (const img of root.querySelectorAll('img[data-asset]:not([src])')) {
      T()?.assets?.url(img.dataset.asset).then((u) => { img.src = u; }, () => { img.replaceWith(Object.assign(document.createElement('p'), { className: 'note', textContent: 'The picture is not available.' })); });
    }
  }

  // ---------- the DM's section ----------
  const box = $('dm-handouts');
  box.innerHTML = `<h3>Handouts</h3>
    <p class="note">Pictures and notes to show the players: a letter, a rune wall, a portrait. Players see only what you show them.</p>
    <form id="ho-new" class="ho-form" autocomplete="off">
      <label class="ho-file"><span>Picture</span><input type="file" id="ho-file" accept="image/png,image/jpeg,image/webp"></label>
      <input id="ho-title" placeholder="Title" maxlength="${TITLE_MAX}">
      <textarea id="ho-text" placeholder="Text (optional)" maxlength="${TEXT_MAX}" rows="2"></textarea>
      <div class="row"><button type="submit" id="ho-add">Add handout</button></div>
      <p class="note" id="ho-usage"></p>
    </form>
    <ol id="ho-list" class="ho-list"></ol>`;
  $('ho-file').onchange = () => { const f = $('ho-file').files[0]; if (f && !$('ho-title').value.trim()) $('ho-title').value = f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, TITLE_MAX); };
  $('ho-new').onsubmit = async (ev) => {
    ev.preventDefault();
    const file = $('ho-file').files[0], title = $('ho-title').value.trim(), text = $('ho-text').value.trim();
    if (!title) return toast('Give the handout a title.');
    if (!file && !text) return toast('Add a picture or some text.');
    $('ho-add').disabled = true;
    try {
      const asset = file ? (await T().assets.upload(file)).id : undefined;
      act({ type: 'handout', handout: { title, ...(text && { text }), ...(asset && { asset }) } });
      $('ho-new').reset();
      usage();
    } catch (err) { toast(err.message); }
    finally { $('ho-add').disabled = false; }
  };
  async function usage() {
    try {
      const { usage: u, limits: l } = await T().assets.list();
      $('ho-usage').textContent = `${u.files} of ${l.files} files, ${Math.round(u.bytes / 1048576 * 10) / 10} of ${Math.round(l.table / 1048576)} MB used. Up to ${Math.round(l.file / 1048576 * 10) / 10} MB a picture.`;
    } catch { $('ho-usage').textContent = ''; }
  }
  const shownText = (h) => (h.shown === 'all' ? 'shown to everyone' : h.shown.length ? `shown to ${h.shown.map(who).join(', ')}` : 'not shown');
  let lastDM = '';
  function renderDM() {
    const s = S(), list = s.handouts ?? [], ps = players();
    const sig = JSON.stringify([list, ps.map((p) => [p.id, p.name]), !!T().solo]);
    if (sig === lastDM) return;
    if (!lastDM) usage();
    lastDM = sig;
    $('ho-list').innerHTML = list.map((h) => `<li data-id="${esc(h.id)}">
      <div class="ho-head">${h.asset ? `<img data-asset="${esc(h.asset)}" alt="" class="ho-thumb">` : '<span class="ho-thumb ho-textonly">Aa</span>'}
        <span><b>${esc(h.title)}</b><small>${esc(shownText(h))}</small></span></div>
      <div class="row">
        ${T().solo ? '' : `<select data-show aria-label="Show ${esc(h.title)} to"><option value="">Show to…</option><option value="all">Everyone</option>${ps.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>`}
        <button type="button" data-open>Open</button>
        ${T().solo ? '' : `<button type="button" data-hide ${h.shown !== 'all' && !h.shown.length ? 'disabled' : ''}>Hide</button>`}
        <button type="button" data-remove class="leave">Remove</button>
      </div></li>`).join('') || '<li class="note">No handouts yet.</li>';
    pictures($('ho-list'));
  }
  $('ho-list').onchange = (ev) => {
    const sel = ev.target.closest('[data-show]'); if (!sel || !sel.value) return;
    const id = sel.closest('li').dataset.id;
    act({ type: 'showHandout', handout: id, to: sel.value === 'all' ? 'all' : [sel.value] });
    sel.value = '';
  };
  $('ho-list').onclick = async (ev) => {
    const li = ev.target.closest('li[data-id]'); if (!li) return;
    const h = (S().handouts ?? []).find((x) => x.id === li.dataset.id); if (!h) return;
    if (ev.target.closest('[data-open]')) open(h.id);
    else if (ev.target.closest('[data-hide]')) act({ type: 'hideHandout', handout: h.id });
    else if (ev.target.closest('[data-remove]')) {
      const b = ev.target.closest('[data-remove]');
      if (!b.classList.contains('sure')) { b.classList.add('sure'); b.textContent = 'Tap again'; setTimeout(() => { b.classList.remove('sure'); b.textContent = 'Remove'; }, 3000); return; }
      act({ type: 'removeHandout', handout: h.id });
      // The picture goes too, unless something else still uses it.
      const s = S(), still = (s.handouts ?? []).some((x) => x.id !== h.id && x.asset === h.asset) || s.map.levels.some((l) => l.image?.asset === h.asset);
      if (h.asset && !still) T().assets.remove(h.asset).then(usage, (err) => toast(err.message));
    }
  };

  // ---------- the players' panel ----------
  function renderMine() {
    const list = S().handouts ?? [];
    $('handouts-list').innerHTML = list.map((h) => `<li><button type="button" data-open="${esc(h.id)}" class="ho-item${seen.has(h.id) ? '' : ' new'}">
      ${h.asset ? `<img data-asset="${esc(h.asset)}" alt="" class="ho-thumb">` : '<span class="ho-thumb ho-textonly">Aa</span>'}<span>${esc(h.title)}</span></button></li>`).join('')
      || '<li class="note">The DM has not shown you anything yet.</li>';
    pictures($('handouts-list'));
  }
  $('handouts-list').onclick = (ev) => { const b = ev.target.closest('[data-open]'); if (b) open(b.dataset.open); };

  // ---------- the viewer: full screen, pinch or wheel to zoom, drag to pan ----------
  const V = $('viewer'), stage = $('viewer-stage');
  let zoom = { s: 1, x: 0, y: 0 };
  const pointers = new Map();
  let pinch = null;
  const apply = () => { const img = stage.querySelector('img'); if (img) img.style.transform = `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.s})`; };
  const clampS = (s) => Math.max(1, Math.min(8, s));
  function zoomAt(cx, cy, s) {
    const r = stage.getBoundingClientRect(), ox = cx - r.left - r.width / 2, oy = cy - r.top - r.height / 2, k = clampS(s) / zoom.s;
    zoom = { s: clampS(s), x: ox - (ox - zoom.x) * k, y: oy - (oy - zoom.y) * k };
    if (zoom.s === 1) zoom.x = zoom.y = 0;
    apply();
  }
  stage.addEventListener('wheel', (ev) => { ev.preventDefault(); zoomAt(ev.clientX, ev.clientY, zoom.s * Math.exp(-ev.deltaY * 0.002)); }, { passive: false });
  stage.addEventListener('pointerdown', (ev) => { stage.setPointerCapture(ev.pointerId); pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); });
  stage.addEventListener('pointermove', (ev) => {
    const was = pointers.get(ev.pointerId); if (!was) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (pinch) zoomAt(mid.x, mid.y, pinch.s * (d / pinch.d)); else pinch = { d, s: zoom.s };
    } else if (zoom.s > 1) { zoom.x += ev.clientX - was.x; zoom.y += ev.clientY - was.y; apply(); }
  });
  const up = (ev) => { pointers.delete(ev.pointerId); if (pointers.size < 2) pinch = null; };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  stage.addEventListener('dblclick', (ev) => zoomAt(ev.clientX, ev.clientY, zoom.s > 1 ? 1 : 2.5));
  $('viewer-close').onclick = () => close();
  $('viewer-in').onclick = () => { const r = stage.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, zoom.s * 1.5); };
  $('viewer-out').onclick = () => { const r = stage.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, zoom.s / 1.5); };
  addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !V.hidden) close(); });

  function open(id) {
    const h = (S().handouts ?? []).find((x) => x.id === id); if (!h) return;
    viewing = id; seen.add(id); zoom = { s: 1, x: 0, y: 0 };
    $('viewer-title').textContent = h.title;
    stage.innerHTML = h.asset ? `<img data-asset="${esc(h.asset)}" alt="${esc(h.title)}" draggable="false">` : '';
    $('viewer-text').textContent = h.text ?? '';
    $('viewer-text').hidden = !h.text;
    $('viewer-zoom').hidden = !h.asset;
    V.hidden = false;
    pictures(stage);
    refresh();
  }
  function close() { V.hidden = true; viewing = null; stage.textContent = ''; }

  // ---------- notes ----------
  $('note-form').onsubmit = (ev) => {
    ev.preventDefault();
    const text = $('note-text').value.trim(); if (!text) return;
    const to = isDM() ? $('note-to').value : 'dm';
    if (!to) return toast('Pick a player to send it to.');
    act({ type: 'note', to, text });
    $('note-text').value = '';
  };
  let lastNote = '';
  function renderNote() {
    const solo = !!T()?.solo, ps = players();
    $('note-form').hidden = solo || (isDM() && !ps.length);
    const sig = JSON.stringify([isDM(), ps.map((p) => [p.id, p.name])]);
    if (sig === lastNote) return;
    lastNote = sig;
    const sel = $('note-to'), was = sel.value;
    sel.hidden = !isDM();
    sel.innerHTML = ps.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
    if (ps.some((p) => p.id === was)) sel.value = was;
    $('note-text').placeholder = isDM() ? 'A private note to one player' : 'A private note to the DM';
  }

  function refresh() {
    const s = S(), t = T(); if (!s || !t) return;
    const dm = isDM(), mine = s.handouts ?? [];
    $('btn-handouts').hidden = dm;
    const unseen = mine.filter((h) => !seen.has(h.id)).length;
    $('ho-badge').hidden = dm || !unseen; $('ho-badge').textContent = unseen;
    if (dm) renderDM(); else lastDM = '';
    if (!$('handouts').hidden) renderMine();
    renderNote();
    if (viewing && !mine.some((h) => h.id === viewing)) close();          // taken back by the DM
  }

  function describe(ev) {
    switch (ev.type) {
      case 'privateNote': {
        const me = T()?.you?.userId;
        // The log marks the line as private; the words say between whom.
        const line = isDM() ? (ev.from === 'dm' ? `To ${who(ev.to)}: ${ev.text}` : `From ${who(ev.from)}: ${ev.text}`)
          : ev.from === me ? `To the DM: ${ev.text}` : `From the DM: ${ev.text}`;
        return [line, 'private'];
      }
      case 'handoutShown': return [isDM() ? `Handout "${ev.title}" shown to ${ev.to === 'all' ? 'everyone' : ev.to.map(who).join(', ')}.` : `The DM shows you a handout: ${ev.title}.`, 'head'];
      case 'handout': return [`Handout "${ev.title}" ${ev.edited ? 'changed' : 'made'}.`];
      case 'handoutHidden': return [`Handout "${ev.title}" hidden.`];
      case 'handoutRemoved': return [`Handout "${ev.title}" removed.`];
      default: return null;
    }
  }
  $('btn-handouts').onclick = () => openPanel('handouts');
  return { refresh, describe, open };
}
