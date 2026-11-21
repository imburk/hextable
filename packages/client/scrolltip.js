// The scroll card (#566): hold or hover on a spell, feat, option, language or item and its text comes up in a small parchment card.
// Only text the client already has is shown. Three parts, from the bottom up:
//   dwellTimer  the one timing helper: 3 s of mouse hover, a 500 ms touch press. The one-token menu's 3-second labels
//               (docs/specs/one-token-menu.md) use it too, so both wait the same time. No DOM; the clock is passed in so a test can drive it.
//   placeCard   where the card goes so it stays inside the screen (a plain sum, tested).
//   attach      hooks a node: 3 s hover, a 500 ms press on touch, or focus plus the I key. Escape, leaving, a tap elsewhere or a scroll hides it.
export const HOVER_MS = 3000, PRESS_MS = 500;
export const SCROLL_KEY = 'i';

// A timer for "held long enough": `hover()` or `press()` starts it; when it runs out `hold(how)` is called once ('hover' or 'press').
// `leave()` (the pointer went away, Escape, a tap elsewhere) stops it and, if the card is up, calls `end()`; `lift()` (a finger came up or moved) only stops it,
// so a card shown by a press stays until it is dismissed.
export function dwellTimer({ hold, end = () => {}, hoverMs = HOVER_MS, pressMs = PRESS_MS, set = (f, ms) => setTimeout(f, ms), clear = (t) => clearTimeout(t) }) {
  let t = null, up = false;
  const stop = () => { if (t !== null) { clear(t); t = null; } };
  const arm = (ms, how) => { stop(); t = set(() => { t = null; up = true; hold(how); }, ms); };
  return {
    hover: () => arm(hoverMs, 'hover'),
    press: () => arm(pressMs, 'press'),
    lift: stop,
    reset() { stop(); up = false; },          // the card was taken down by something else (Escape, a tap elsewhere)
    leave() { stop(); if (up) { up = false; end(); } },
    get waiting() { return t !== null; },
    get shown() { return up; },
    shownNow() { stop(); up = true; },        // the card was brought up some other way (the key): let leave() take it down
  };
}

// Where a card of w by h goes for an anchor { left, top, right, bottom } in a screen of vw by vh: below the anchor if it fits, else above, else
// pinned to the screen edge; across, lined up with the anchor's left edge and pulled back inside. `maxH` is the room the card may use (it scrolls inside).
export function placeCard(a, w, h, vw, vh, gap = 10, margin = 12) {
  const cw = Math.min(w, vw - 2 * margin), maxH = Math.max(80, vh - 2 * margin), ch = Math.min(h, maxH);
  const left = Math.max(margin, Math.min(a.left, vw - cw - margin));
  const below = a.bottom + gap, above = a.top - gap - ch;
  const top = below + ch <= vh - margin ? below : above >= margin ? above : Math.max(margin, vh - margin - ch);
  return { left, top, width: cw, maxH };
}

let card = null, owner = null, ownerTimer = null, ownerEnd = null, wired = false;
const ID = 'scrolltip';
function cssOnce() {
  if (document.getElementById('scrolltip-css')) return;
  const l = document.createElement('link'); l.id = 'scrolltip-css'; l.rel = 'stylesheet'; l.href = new URL('./scrolltip.css', import.meta.url).href; document.head.append(l);
}
export function hide() {
  if (!card) return;
  card.remove(); card = null; ownerTimer?.reset(); ownerTimer = null;
  owner?.removeAttribute('aria-describedby'); owner = null;
  const end = ownerEnd; ownerEnd = null; end?.();
}
// Open the card by hand (an info button's tap): `end()` is called once when the card goes away. `owns(node)`: is the card up for this node?
export function pop(anchor, d, end = null) { show(anchor, d, null); ownerEnd = end; }
export const owns = (node) => !!card && owner === node;
export const cardOwner = () => (card ? owner : null);
function show(anchor, d, timer) {
  hide(); cssOnce();
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = text; return e; };
  card = document.createElement('div'); card.id = ID; card.className = 'scrolltip'; card.setAttribute('role', 'tooltip');
  const body = mk('div', 'scrolltip-body', ''); body.append(mk('b', '', d.title)); if (d.sub) body.append(mk('small', '', d.sub)); body.append(mk('p', '', d.text));
  card.append(body);
  const vw = document.documentElement.clientWidth, vh = window.innerHeight, r = anchor.getBoundingClientRect();
  card.style.visibility = 'hidden'; card.style.width = `${Math.min(320, vw - 24)}px`; card.style.maxHeight = `${Math.max(80, vh - 24)}px`; document.body.append(card);
  const p = placeCard(r, 320, card.offsetHeight, vw, vh);
  card.style.left = `${p.left}px`; card.style.top = `${p.top}px`; card.style.visibility = '';
  owner = anchor; ownerTimer = timer; anchor.setAttribute('aria-describedby', ID);
}
function wire() {
  if (wired) return; wired = true;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  document.addEventListener('pointerdown', (e) => { if (card && !card.contains(e.target)) hide(); }, true);
  document.addEventListener('scroll', (e) => { if (card && !card.contains(e.target)) hide(); }, true);
}

// Hook a node. `describe()` is asked when the card is to be shown and gives { title, sub?, text } or null (nothing to show). Returns the node.
export function attach(node, describe) {
  wire();
  const open = () => { const d = describe(); if (!d?.text) return false; show(node, d, t); return true; };
  const t = dwellTimer({ hold: () => { if (open()) t.shownNow(); else t.leave(); }, end: hide });
  let pressed = false;
  node.classList.add('has-scroll');
  node.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') t.hover(); });
  node.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') t.leave(); });
  node.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') t.leave(); });
  node.addEventListener('touchstart', () => { pressed = false; t.press(); }, { passive: true });
  node.addEventListener('touchmove', () => t.lift(), { passive: true });
  node.addEventListener('touchcancel', () => t.lift(), { passive: true });
  node.addEventListener('touchend', (e) => { const was = t.shown && !pressed; t.lift(); if (was) { pressed = true; e.preventDefault(); } }, { passive: false });   // the lift after a long press is not a tap
  node.addEventListener('contextmenu', (e) => { if (t.shown || t.waiting) e.preventDefault(); });
  node.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === SCROLL_KEY && !e.ctrlKey && !e.metaKey && !e.altKey && e.target.tagName !== 'TEXTAREA' && e.target.type !== 'text' && open()) { t.shownNow(); e.preventDefault(); } });
  node.addEventListener('focusout', () => t.leave());
  return node;
}
