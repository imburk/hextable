// The connection dot (issue #246): how it looks and what a tap says. The judging is linkquality.js; the measuring is transport.js.
// Each state has its own shape as well as its colour (a circle, a triangle, a crossed square), a word, and an aria-label.
// This file touches the DOM only inside `mountDot`, so tracker.js may import `dotHTML` and tests may load it without a document.
const WORDS = { good: 'Good', shaky: 'Shaky', lost: 'Lost' };
const SHAPES = {
  good: '<circle cx="8" cy="8" r="6"/>',
  shaky: '<path d="M8 1.5 15 14H1z"/>',
  lost: '<path d="M2 2h12v12H2z"/><path class="x" d="m5 5 6 6m0-6-6 6"/>',
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// The dot alone, as markup: `who` names whose connection it is (the DM's tracker), `text` is the sentence for the label.
export function dotHTML(state, { who = '', text = '' } = {}) {
  const s = SHAPES[state] ? state : 'lost';
  const label = `${who ? `${who}: ` : ''}Connection ${WORDS[s].toLowerCase()}${text ? `. ${text}` : ''}`;
  return `<span class="ld ld-${s}" role="img" aria-label="${esc(label)}" title="${esc(label)}"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">${SHAPES[s]}</svg></span>`;
}
// Beside a name: the dot, and a word when it is not good, so the state never rests on colour alone.
export const rowDotHTML = (state, who, text) => dotHTML(state, { who, text }) + (state === 'good' ? '' : `<span class="ld-word" aria-hidden="true">${WORDS[state] ?? 'Lost'}</span>`);

// ctx: { transport(): the current transport or null, solo or online }. Returns { render() }: call it whenever the link changes.
export function mountDot({ transport, parent, before }) {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'link-dot'; btn.hidden = true; btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-controls', 'link-note');
  const note = document.createElement('div');
  note.id = 'link-note'; note.hidden = true; note.setAttribute('role', 'status');
  parent.insertBefore(btn, before ?? null); document.body.append(note);
  let open = false;
  const place = () => {
    const r = btn.getBoundingClientRect(), w = Math.min(280, innerWidth - 24);
    note.style.width = `${w}px`; note.style.top = `${r.bottom + 6}px`;
    note.style.left = `${Math.max(12, Math.min(r.right - w, innerWidth - w - 12))}px`;
  };
  const show = (on) => { open = on; note.hidden = !on; btn.setAttribute('aria-expanded', String(on)); if (on) { render(); place(); } };
  function render() {
    const T = transport(), l = T && !T.solo ? T.link : null;
    btn.hidden = !l?.known;
    if (btn.hidden) { if (open) show(false); return; }
    btn.dataset.state = l.state;
    btn.innerHTML = dotHTML(l.state, { text: l.text }) + `<span class="ld-word">${l.state === 'good' ? '' : WORDS[l.state]}</span>`;
    btn.setAttribute('aria-label', `Connection ${WORDS[l.state].toLowerCase()}. ${l.text}`);
    note.dataset.state = l.state;
    note.innerHTML = `<b>${dotHTML(l.state)} Connection: ${WORDS[l.state]}</b><span>${esc(l.text)}</span>`;
    // The DM's own words about it do not change what a player sees of the DM's connection; a player is told the DM's too.
    const dm = [...(T.links ?? [])].find(([id]) => id !== T.you?.userId && T.you?.role !== 'dm');
    if (dm) note.insertAdjacentHTML('beforeend', `<span class="ld-dm">The DM's connection: ${esc(dm[1].state)}</span>`);
  }
  btn.onclick = () => show(!open);
  document.addEventListener('pointerdown', (ev) => { if (open && !ev.target.closest('#link-dot, #link-note')) show(false); });
  document.addEventListener('keydown', (ev) => { if (open && ev.key === 'Escape') { show(false); btn.focus(); } });
  addEventListener('resize', () => open && place());
  return { render };
}
