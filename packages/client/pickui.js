// The one place the shared "pick things" behaviours live (#603). Every screen that asks the player to choose something (the create-character
// screen today; the level-up list, the Long Rest spell list, Setup and the one-token menu when they are reworked) uses these three pieces, so the
// whole game behaves one way and a change is made once. Nothing here knows a rule: a screen hands in data, this draws it.
//
//   accordion   one section open at a time (docs/specs/one-token-menu.md, round 5): the bars before the open one pinned at the top, the bars after
//               it at the bottom, only the open section's body scrolls; with none open every bar shows its tip, with one open the bars shrink to
//               titles; a bar that needs a choice wears a badge. Pure parts: `accSplit`, `accNext`.
//   pickRow     one row style for a thing that is picked (radio for one choice, checkbox for many): name, chips, one-line summary (ellipsis), an
//               optional cost line, and the i button. Greyed rows say why in a line.
//   reveal      the full text of a row: the i button, 3 s of mouse rest on a computer (it closes on leave), a 0.5 s press-hold on a phone (a plain
//               tap still picks), and the I key. The card is the scroll card of #566 (scrolltip.js, whose dwellTimer holds the timing); this
//               module only decides what opens it. Pure part: `oneOpen`.
// Styles: pickui.css (linked from index.html), every colour a theme variable, every target at least 44 px.
import { attach as scrollOn, pop, hide as hideCard, cardOwner } from './scrolltip.js';

export function el(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'spellcheck' && v != null) { e.setAttribute(k, String(v)); continue; }      // the property takes a boolean and `false` would be dropped below; the attribute must say "false"
    if (v === undefined || v === false || v === null) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k in e && k !== 'list') e[k] = v; else e.setAttribute(k, v === true ? '' : v);
  }
  e.append(...kids.flat().filter((x) => x != null && x !== false));
  return e;
}

// ---------- the accordion: pure parts ----------
// Which bars are above the open section, which is open, which below. `open` is an id or null (none open: every bar in one list, with its tip).
export function accSplit(ids, open) {
  const i = open == null ? -1 : ids.indexOf(open);
  if (i < 0) return { top: [...ids], body: null, bottom: [], compact: false };
  return { top: ids.slice(0, i), body: ids[i], bottom: ids.slice(i + 1), compact: true };
}
// What a tap on a bar does: the open one closes, any other opens (and so the first closes).
export const accNext = (open, id) => (open === id ? null : id);
// The same rule for "which row's text is shown" and any other one-at-a-time state: a tiny holder.
export function oneOpen(initial = null) {
  let cur = initial;
  return { get: () => cur, is: (k) => cur === k, toggle(k) { cur = cur === k ? null : k; return cur; }, close() { cur = null; } };
}

// ---------- the accordion: drawing ----------
// sections: [{ id, title, tip?, need?, render: () => Node }]. `need` is the badge text ("Choose level 4 feat") and is shown open or closed.
// Returns { node, body } (`body` is the open section's scrolling element, or null) so a screen that redraws can keep its scroll.
export function accordion({ sections, open, onOpen, id = 'acc' }) {
  const { top, body, bottom, compact } = accSplit(sections.map((s) => s.id), open);
  const by = Object.fromEntries(sections.map((s) => [s.id, s]));
  const bar = (sid) => {
    const s = by[sid], on = sid === body;
    return el('button', { type: 'button', id: `${id}-bar-${sid}`, class: `acchead${on ? ' on' : ''}${compact ? ' compact' : ''}`, 'aria-expanded': String(on), 'aria-controls': on ? `${id}-sec-${sid}` : undefined, onclick: () => onOpen(accNext(open, sid)) },
      el('span', { class: 't' }, el('b', { text: s.title }), !compact && s.tip ? el('small', { text: s.tip }) : null),
      s.need ? el('span', { class: 'need', text: s.need }) : null, el('span', { class: 'chev', 'aria-hidden': 'true', text: '›' }));
  };
  const node = el('div', { class: 'acc', id }, el('div', { class: 'acc-top' }, ...top.map(bar), body ? bar(body) : null));
  let bodyEl = null;
  if (body) {
    bodyEl = el('div', { class: 'acc-body', id: `${id}-sec-${body}`, role: 'region', 'aria-label': by[body].title }, by[body].render());
    node.append(bodyEl, el('div', { class: 'acc-bot' }, ...bottom.map(bar)));
  }
  return { node, body: bodyEl };
}

// ---------- chips ----------
// kind: 'np' (not proficient: dark fill, light text, a "no" sign: readable in every theme), 'cat' (a category), 'good', 'cost', 'when', 'tag' (hook for the spell Attack/Save tag, #605).
const NO_SIGN = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/></svg>';
export function chip(kind, text, extra = '') {
  const c = el('span', { class: `chip ${kind}${extra ? ` ${extra}` : ''}` });
  if (kind === 'np') c.innerHTML = NO_SIGN;
  c.append(document.createTextNode(text));
  return c;
}
export const groupHead = (title, note) => el('div', { class: 'gh' }, title, note ? el('span', { text: note }) : null);
export function disclosure({ id, text, sub, open, onToggle }) {
  return el('button', { type: 'button', class: 'disc', id, 'aria-expanded': String(!!open), onclick: () => onToggle(!open) }, el('span', { class: 'tx' }, text, sub ? el('small', { text: sub }) : null), el('span', { class: 'chev', 'aria-hidden': 'true', text: '›' }));
}

// ---------- the text reveal ----------
// `describe` is { title, sub?, text } or a function giving one (text may be a list of lines). The card opens by the i button, by 3 s of mouse rest, by a
// 0.5 s press-hold, or by the I key on a focused row; Escape, leaving, a tap elsewhere or a scroll closes it. A plain tap on the row is left alone.
const asCard = (d) => { const x = typeof d === 'function' ? d() : d; return x ? { ...x, text: Array.isArray(x.text) ? x.text.filter(Boolean).join('\n') : x.text } : null; };
// Whether the card was open for this row when the i button was pressed. A pointer press closes an open card before the click arrives (a tap elsewhere hides it), so
// the press is remembered, but only a press on an i button, and never for a key press: a click with `detail` 0 comes from the keyboard and reads the card as it is.
export const infoWasOpen = ({ down, now, detail }) => (detail === 0 ? now : down ?? now);
let downOwner = null, wired = false;
export const noteDown = (target, owner) => { downOwner = target?.closest?.('.ibtn') ? owner : null; };
export const pressSeen = () => downOwner;
function wire() { if (wired) return; wired = true; window.addEventListener('pointerdown', (ev) => noteDown(ev.target, cardOwner()), true); }       // before the card's own "tap elsewhere hides it" runs
export function reveal(row, describe) { wire(); return scrollOn(row, () => asCard(describe)); }
function infoButton(row, label, describe) {
  const b = el('button', { type: 'button', class: 'ibtn', 'aria-label': `About ${label}`, 'aria-expanded': 'false' }, el('i', { text: 'i' }));
  b.onclick = (ev) => {
    wire();
    const was = infoWasOpen({ down: downOwner, now: cardOwner(), detail: ev?.detail }); downOwner = null;
    if (was === row) { hideCard(); return; }
    const d = asCard(describe); if (!d?.text) return;
    pop(row, d, () => b.setAttribute('aria-expanded', 'false')); b.setAttribute('aria-expanded', 'true');
  };
  return b;
}

// ---------- the pick row ----------
// o: { id, kind: 'radio' | 'check' | 'none', name (radio group), checked, disabled, onchange(checked), title, lead (text after the name, "(lvl 3)"), chips: [Node], right (text at the
//      end of the first line), summary (one line, ellipsis), cost (a plain sentence in the ink colour), also (a second muted line), why (replaces the summary when the row cannot be picked),
//      np (not proficient: red bar, chip), info: describe for the reveal, label (for the i button) }
export function pickRow(o) {
  const kind = o.kind ?? 'check', off = !!o.disabled;
  const input = kind === 'none' ? null : el('input', { type: kind === 'radio' ? 'radio' : 'checkbox', id: o.id, name: o.name, checked: !!o.checked, disabled: off, onchange: (ev) => o.onchange?.(ev.target.checked) });
  const l1 = el('span', { class: 'l1' }, el('span', { class: 'nm', text: o.title }), o.lead ? el('span', { class: 'lv', text: ` ${o.lead}` }) : null, ...(o.chips ?? []), o.right ? el('span', { class: 'rt', text: o.right }) : null);
  const txt = el('span', { class: 'txt' }, l1, o.why ? el('span', { class: 'l2 one why', text: o.why }) : o.summary ? el('span', { class: 'l2 one', text: o.summary }) : null,
    o.cost ? el('span', { class: 'l2 costline', text: o.cost }) : null, o.also ? el('span', { class: 'l2 also', text: o.also }) : null);
  const lab = el('label', {}, input, input ? el('span', { class: `box${kind === 'radio' ? ' round' : ''}` }) : null, txt);
  const row = el('div', { class: `opt${o.np ? ' npr' : ''}${off || o.why ? ' dim' : ''}${o.checked ? ' on' : ''}${kind === 'none' ? ' static' : ''}`, 'data-row': o.id, id: input ? undefined : o.id });
  row.append(lab);
  if (o.info) { row.append(infoButton(row, o.label ?? o.title, o.info)); reveal(row, o.info); }
  return row;
}
