// The spell card (#787): the whole of a spell in one small card, where a spell is named as a row or a chip.
//
// A node that carries `data-spellcard="<spell id>"` opens it: by hover on a computer (after HOVER_MS), by a long press on a phone (PRESS_MS, which never
// casts: the lift after it is not a tap), or by focus plus the I key or the ? key. Escape, a tap elsewhere, a scroll or leaving the node closes it.
// One listener on the document does it all, so a row drawn again by innerHTML keeps working; a caller only adds `spellAttrs(id)` to its markup.
//
// Everything on the card is built from content this page already has (the pack's entry for the spell and the content reader, packages/rules/src/content/
// reader.js) and nothing is asked of the table: a spell this page does not have says so, and shows no more than its name.
//   model     cardModel(id) -> what the card says, as plain data (no page); tested
//   place     placeClear(): where the card goes, inside the screen and clear of the die's confirm (#750)
//   page      initSpellCards(), openSpellCard(anchor, id), closeSpellCard(), spellAttrs(id), decorateLine()
// Community notes (unofficial, the DM first) are a later job: there is a place for them in the model (`notes`, always empty here) and none on the card.
import { SPELLS, CONTENT } from './shared/content/index.js';
import { readEntry } from './shared/content/reader.js';
import { dwellTimer, placeCard, PRESS_MS } from './scrolltip.js';

export const HOVER_MS = 400;           // a computer: the mouse rests on a spell this long (the scroll card's own 3 s is for text that is not a spell)
export const CARD_KEYS = ['i', '?'];   // focus plus one of these
const ID = 'spellcard';

// ---------- the model (pure) ----------
const SCHOOL = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');
const CAST = { action: '1 action', bonus: '1 bonus action', reaction: '1 reaction', minute: '1 minute', hour: '1 hour' };
export const castWords = (t) => CAST[t] ?? String(t ?? '');
export function rangeWords(r) {
  if (r === 'self' || r === 0) return 'Self';
  if (r === 'touch' || r === 5) return 'Touch';
  if (typeof r !== 'number') return String(r ?? '');
  if (r >= 5280 && r % 5280 === 0) return `${(r / 5280).toLocaleString('en-US')} mile${r === 5280 ? '' : 's'}`;
  return `${r} feet`;
}
const COMP = { v: 'V', s: 'S', m: 'M' };
export const componentWords = (c) => (c ?? []).map((x) => COMP[x] ?? String(x).toUpperCase()).join(', ');
export function durationWords(d, conc) {
  const w = d === 'instant' ? 'Instantaneous' : d === 'special' ? 'Special' : d ? SCHOOL(String(d)) : '';
  return conc && d && d !== 'instant' ? `Concentration, up to ${d}` : w;
}

// The pack's entry for an id, or null. A homebrew spell is here when its pack is loaded on this page, as for the action panel's own rows.
export const defOf = (id) => SPELLS[id]?.def ?? CONTENT.spells?.[id] ?? null;

// The reader's lines that are the card's own header (it says them in its own way) or the reader's talk about the author's data.
const HEADER = [/^"/, /^Components:/, /^On the spell lists of/, /^Sorted under/, /^Tier:/, /^Marked as checked/, /^When it is cast, the DM is shown/, /^The engine does not do this/];
const HIGHER = /^(Cast with a higher slot|As the caster gains levels|The (damage|healing) grows|At higher)/i;
const GENERIC = 'Whatever the description says beyond the steps above.';
const TIER_WORDS = { auto: 'The game applies all of it.', assist: 'The game applies most', manual: 'The DM applies it.' };
const cap = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// What the card says. `lines` are {text, depth}; `dm` is what the DM applies by hand (assist), each a short sentence.
const cache = new WeakMap();
export function cardModel(id) {
  const def = defOf(id);
  if (!def) return { id, name: String(id), known: false, meta: '', tags: [], facts: [], text: '', tier: null, tierText: '', lines: [], dm: [], higher: [], notes: [] };
  if (cache.has(def)) return cache.get(def);
  let r = null;
  try { r = readEntry('spell', def, { strict: false }); } catch { r = null; }
  const readable = !!r && r.title !== '(unreadable entry)' && r.tier;
  const tier = readable ? r.tier : def.tier ?? null;
  const all = (readable ? r.lines : []).map((l) => ({ text: l.trimStart(), depth: Math.floor((l.length - l.trimStart().length) / 2) }));
  const higher = all.filter((l) => HIGHER.test(l.text)).map((l) => l.text);
  const lines = tier === 'manual' ? [] : all.filter((l) => !HEADER.some((h) => h.test(l.text)) && !HIGHER.test(l.text)).map((l) => ({ text: cap(l.text, 400), depth: l.depth }));
  const dm = tier === 'manual' || !readable ? [] : (r.doesNot ?? []).map((t) => (t === GENERIC ? 'whatever the description says beyond these steps' : cap(t, 300)));
  const tierText = tier === 'assist' ? `${TIER_WORDS.assist}; the DM applies: ${dm.length ? dm.join('; ') : 'whatever the description says beyond these steps'}.` : (TIER_WORDS[tier] ?? 'The game does not read this spell; the DM applies it.');
  const m = {
    id, name: def.name, known: true,
    meta: def.level ? `Level ${def.level} ${SCHOOL(def.school)}` : `${SCHOOL(def.school)} cantrip`,
    tags: [def.concentration ? 'Concentration' : '', def.ritual ? 'Ritual' : ''].filter(Boolean),
    facts: [['Casting time', castWords(def.time)], ['Range', rangeWords(def.range)], ['Components', componentWords(def.components)], ['Duration', durationWords(def.duration, def.concentration)]].filter(([, v]) => v),
    text: String(def.text ?? ''), tier, tierText, lines, dm, higher, notes: [],
  };
  cache.set(def, m);
  return m;
}

// ---------- where it goes (pure) ----------
// placeCard keeps the card inside the screen. `avoid` is a rect the card must not cover (the die at the bottom: its confirm is a tap on it, #750): when the card would
// touch it, the card sits above it, and shrinks (it scrolls inside) when there is not room.
export function placeClear(a, w, h, vw, vh, avoid = null, gap = 10, margin = 12) {
  const p = placeCard(a, w, h, vw, vh, gap, margin), ch = Math.min(h, p.maxH);
  if (!avoid || !(avoid.right > avoid.left) || !(avoid.bottom > avoid.top)) return p;
  const hit = p.left < avoid.right && p.left + p.width > avoid.left && p.top < avoid.bottom && p.top + ch > avoid.top;
  if (!hit) return p;
  const room = Math.max(80, avoid.top - gap - margin), nh = Math.min(ch, room);
  return { left: p.left, width: p.width, maxH: nh, top: Math.max(margin, avoid.top - gap - nh) };
}

// ---------- markup for callers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// The attribute that makes a node open the card (for markup built as a string). Only the id is written: the page looks the rest up.
export const spellAttrs = (id) => (id ? ` data-spellcard="${esc(id)}"` : '');
// For a node built by hand.
export function markSpell(node, id) { if (id) node.setAttribute('data-spellcard', id); return node; }
// A log line's markup with the spell's name made a target: the last place the name stands in the text (the spell is named after who casts it).
export function decorateLine(html, id, name = defOf(id)?.name) {
  if (!id || !name || typeof html !== 'string') return html;
  const n = esc(name), at = html.lastIndexOf(n);
  if (at < 0) return html;
  return `${html.slice(0, at)}<span class="sc-name" data-spellcard="${esc(id)}" tabindex="0">${n}</span>${html.slice(at + n.length)}`;
}

// ---------- the page ----------
let card = null, anchorNow = null, timer = null, wired = false, how = null;
function cssOnce() {
  if (document.getElementById('spellcard-css')) return;
  const l = document.createElement('link'); l.id = 'spellcard-css'; l.rel = 'stylesheet'; l.href = new URL('./spellcard.css', import.meta.url).href; document.head.append(l);
}
const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

export function buildCard(m) {
  const c = mk('div', 'spellcard'); c.id = ID; c.setAttribute('role', 'dialog'); c.setAttribute('aria-label', `${m.name}, spell card`);
  const head = mk('header', 'sc-head'); head.append(mk('b', 'sc-name-h', m.name));
  if (m.meta) head.append(mk('small', 'sc-meta', m.meta));
  for (const t of m.tags) head.append(mk('span', 'sc-tag', t));
  c.append(head);
  const body = mk('div', 'sc-body');
  if (!m.known) { body.append(mk('p', 'sc-none', 'This page does not have this spell. It shows here when its pack arrives.')); c.append(body); return c; }
  const dl = mk('dl', 'sc-facts');
  for (const [k, v] of m.facts) { dl.append(mk('dt', '', k), mk('dd', '', v)); }
  body.append(dl);
  if (m.text) body.append(mk('p', 'sc-text', m.text));
  const sec = (title) => { const s = mk('section', 'sc-sec'); s.append(mk('h4', '', title)); body.append(s); return s; };
  const does = sec('What the game does');
  does.append(mk('p', `sc-tier t-${m.tier ?? 'none'}`, m.tierText));
  if (m.lines.length) { const ul = mk('ul', 'sc-lines'); for (const l of m.lines) { const li = mk('li', '', l.text); if (l.depth) li.style.marginLeft = `${l.depth * 12}px`; ul.append(li); } does.append(ul); }
  if (m.higher.length) { const h = sec('At higher levels'); const ul = mk('ul', 'sc-lines'); for (const t of m.higher) ul.append(mk('li', '', t)); h.append(ul); }
  c.append(body);
  return c;
}

export function closeSpellCard() {
  if (!card) return;
  card.remove(); card = null; timer?.reset(); timer = null; how = null;
  anchorNow?.removeAttribute('aria-describedby'); anchorNow = null;
}
// Open the card for `anchor`. `avoidEl` is the die by default: a card on a phone never covers its confirm.
export function openSpellCard(anchor, id, via = 'key') {
  closeSpellCard(); cssOnce();
  const m = cardModel(id);
  card = buildCard(m); how = via; anchorNow = anchor;
  const vw = document.documentElement.clientWidth, vh = window.innerHeight, r = anchor.getBoundingClientRect();
  card.style.visibility = 'hidden'; card.style.width = `${Math.min(340, vw - 24)}px`; card.style.maxHeight = `${Math.max(80, vh - 24)}px`; document.body.append(card);
  const die = document.getElementById('btn-menu'), dr = die && die.getClientRects().length ? die.getBoundingClientRect() : null;
  const p = placeClear(r, 340, card.offsetHeight, vw, vh, dr);
  card.style.left = `${p.left}px`; card.style.top = `${p.top}px`; card.style.maxHeight = `${p.maxH}px`; card.style.visibility = '';
  anchor.setAttribute('aria-describedby', ID);
  card.addEventListener('pointerleave', (e) => { if (how === 'hover' && e.pointerType === 'mouse') closeSpellCard(); });
  return card;
}

const targetOf = (t) => (t instanceof Element ? t.closest('[data-spellcard]') : null);
export function initSpellCards() {
  if (wired || typeof document === 'undefined') return;
  wired = true;
  const open = (a, via) => { const id = a?.dataset.spellcard; if (!id) return false; openSpellCard(a, id, via); timer?.shownNow(); return true; };
  const arm = (a, ms, via) => {
    timer?.reset();
    timer = dwellTimer({ hold: (h) => { if (!open(a, h === 'press' ? 'press' : 'hover')) timer?.leave(); }, end: closeSpellCard, hoverMs: HOVER_MS, pressMs: PRESS_MS });
    timer[via]();
  };
  let pressed = false, pending = null;
  // A computer: the mouse rests on a spell.
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const a = targetOf(e.target); if (!a || a === anchorNow || a === pending) return;
    pending = a; arm(a, HOVER_MS, 'hover');
  });
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType !== 'mouse') return;
    const a = targetOf(e.target); if (!a || a !== pending) return;
    if (e.relatedTarget instanceof Node && (a.contains(e.relatedTarget) || card?.contains(e.relatedTarget))) return;
    pending = null; timer?.leave(); timer?.reset(); closeSpellCard();
  });
  // A phone: a press that stays, without moving.
  document.addEventListener('touchstart', (e) => { const a = targetOf(e.target); pressed = false; if (!a || e.touches.length !== 1) return; pending = a; arm(a, PRESS_MS, 'press'); }, { passive: true, capture: true });
  const lift = () => { if (timer && !timer.shown) timer.lift(); };
  document.addEventListener('touchmove', lift, { passive: true, capture: true });
  document.addEventListener('touchcancel', lift, { passive: true, capture: true });
  document.addEventListener('touchend', (e) => {
    const a = targetOf(e.target);
    if (a && timer?.shown && how === 'press' && !pressed) { pressed = true; e.preventDefault(); e.stopPropagation(); return; }      // the lift after a long press is not a tap: nothing is cast
    lift();
  }, { passive: false, capture: true });
  document.addEventListener('contextmenu', (e) => { if (targetOf(e.target) && (timer?.shown || timer?.waiting || card)) e.preventDefault(); }, true);
  // A key on a focused spell.
  document.addEventListener('keydown', (e) => {
    if (!CARD_KEYS.includes(e.key) || e.ctrlKey || e.metaKey || e.altKey || /^(TEXTAREA|INPUT|SELECT)$/.test(e.target?.tagName ?? '')) return;
    const a = targetOf(e.target);
    if (!a) return;
    if (card && anchorNow === a) { closeSpellCard(); e.preventDefault(); return; }
    timer?.reset(); timer = dwellTimer({ hold: () => {}, end: closeSpellCard });
    if (open(a, 'key')) e.preventDefault();
  }, true);
  document.addEventListener('focusout', (e) => { if (card && how === 'key' && targetOf(e.target) === anchorNow) closeSpellCard(); }, true);
  // A tap elsewhere, or a scroll, closes it. A press on the card itself (to read it) does not.
  document.addEventListener('pointerdown', (e) => { if (!card || card.contains(e.target)) return; if (e.pointerType === 'mouse' || !targetOf(e.target)) { pending = null; closeSpellCard(); } }, true);
  document.addEventListener('scroll', (e) => { if (card && !card.contains(e.target)) { pending = null; closeSpellCard(); } }, true);
}
// Escape closes the card before anything else hears it (the menu's own Escape would close the menu too). The drawer listens on the window, capturing, from the moment the app starts,
// so this is put there when the module loads, which is before.
if (typeof window !== 'undefined') window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && card) { e.preventDefault(); e.stopImmediatePropagation(); closeSpellCard(); } }, true);
export const spellCardOpen = () => !!card;
export const spellCardFor = () => anchorNow?.dataset.spellcard ?? null;
