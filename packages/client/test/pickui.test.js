// The shared pick-UI module's pure parts (#603): which bars are pinned above and below the open section, what a tap on a bar does, and the one-open-row state.
// The hover and press timing is scrolltip.js's dwellTimer (scrolltip.test.js); pickui only decides what opens the card, so there is nothing to time here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nice } from '../buildparts.js';

// a small stand-in for the page (the pattern of packmanager.test.js): enough of a node to see what the module builds
const attrs = (n) => n.attrs;
const fake = (tag) => ({ tag, className: '', textContent: '', children: [], style: {}, dataset: {}, attrs: {}, id: '', onclick: null, onchange: null, checked: false, disabled: false, type: '', name: '', hidden: false, innerHTML: '',
  classList: { add() {} }, addEventListener() {}, append(...k) { for (const c of k) this.children.push(typeof c === 'string' ? { tag: '#text', textContent: c, children: [], attrs: {} } : c); }, setAttribute(k, v) { this.attrs[k] = v; },
  closest(sel) { return sel === '.ibtn' && /(^| )ibtn( |$)/.test(this.className) ? this : null; } });
globalThis.document = { createElement: fake, createTextNode: (t) => ({ tag: '#text', textContent: t, children: [], attrs: {} }), addEventListener() {}, getElementById: () => null };
globalThis.window = { addEventListener() {} };
const walk = (n, f) => { f(n); n.children.forEach((c) => walk(c, f)); };
const all = (n) => { const l = []; walk(n, (x) => l.push(x)); return l; };
const { accSplit, accNext, oneOpen, pickRow, accordion, el, infoWasOpen, noteDown, pressSeen } = await import('../pickui.js');
import { HOVER_MS, PRESS_MS } from '../scrolltip.js';

const IDS = ['who', 'scores', 'skills', 'power', 'feats', 'gear'];

test('accSplit: with none open every bar is in one list and the bars show their tips', () => {
  assert.deepEqual(accSplit(IDS, null), { top: IDS, body: null, bottom: [], compact: false });
});
test('accSplit: the bars before the open one are pinned above, the bars after it below, and the bars shrink', () => {
  assert.deepEqual(accSplit(IDS, 'power'), { top: ['who', 'scores', 'skills'], body: 'power', bottom: ['feats', 'gear'], compact: true });
  assert.deepEqual(accSplit(IDS, 'who'), { top: [], body: 'who', bottom: IDS.slice(1), compact: true });
  assert.deepEqual(accSplit(IDS, 'gear'), { top: IDS.slice(0, 5), body: 'gear', bottom: [], compact: true });
});
test('accSplit: an id that is not a section is the same as none open', () => {
  assert.deepEqual(accSplit(IDS, 'nope'), accSplit(IDS, null));
});
test('accNext: a tap opens a closed bar (closing the first) and closes the open one', () => {
  assert.equal(accNext(null, 'skills'), 'skills');
  assert.equal(accNext('skills', 'gear'), 'gear');
  assert.equal(accNext('gear', 'gear'), null);
});
test('oneOpen: one row at a time; asking again closes it', () => {
  const o = oneOpen();
  assert.equal(o.get(), null);
  assert.equal(o.toggle('a'), 'a'); assert.ok(o.is('a'));
  assert.equal(o.toggle('b'), 'b'); assert.ok(!o.is('a'));
  assert.equal(o.toggle('b'), null);
  o.toggle('c'); o.close(); assert.equal(o.get(), null);
});
test('the reveal waits the two times the owner agreed: 3 s of mouse rest, 0.5 s of press', () => { assert.equal(HOVER_MS, 3000); assert.equal(PRESS_MS, 500); });

test('pickRow draws a title that looks like markup as text, never as an element', () => {
  const evil = '<img src=x onerror=1>';
  const row = pickRow({ id: 'r1', kind: 'check', title: evil, summary: '<b>x</b>', chips: [], info: { title: evil, text: 'a' } });
  const nodes = all(row);
  assert.equal(nodes.some((n) => ['img', 'b', 'script'].includes(n.tag)), false, 'no element came from the text');
  assert.ok(nodes.some((n) => n.className === 'nm' && n.textContent === evil), 'the title is the text of the name span');
  assert.ok(nodes.some((n) => n.className.includes('one') && n.textContent === '<b>x</b>'));
  assert.equal(nodes.some((n) => n.innerHTML), false, 'no innerHTML was used for row text');
});
test('a bar that is closed has no aria-controls (its region is not in the page); the open one points at its region', () => {
  const secs = [{ id: 'a', title: 'A', render: () => el('p', { text: 'a' }) }, { id: 'b', title: 'B', render: () => el('p', { text: 'b' }) }];
  const closed = accordion({ sections: secs, open: null, onOpen() {}, id: 'x' });
  assert.equal(all(closed.node).some((n) => 'aria-controls' in attrs(n)), false);
  const open = accordion({ sections: secs, open: 'b', onOpen() {}, id: 'x' });
  const bars = all(open.node).filter((n) => n.tag === 'button');
  assert.equal(bars.filter((n) => 'aria-controls' in n.attrs).length, 1);
  assert.equal(bars.find((n) => 'aria-controls' in n.attrs).attrs['aria-controls'], open.body.id);
});
test('spellcheck=false is written as the attribute "false" (a false property would be dropped)', () => {
  assert.equal(el('input', { spellcheck: false }).attrs.spellcheck, 'false');
});
test('infoWasOpen: a keyboard click reads the card as it is now; a pointer click uses what the press saw', () => {
  const row = { r: 1 };
  assert.equal(infoWasOpen({ down: row, now: null, detail: 1 }), row, 'a pointer press closed the card before the click; it was open');
  assert.equal(infoWasOpen({ down: null, now: null, detail: 1 }), null);
  assert.equal(infoWasOpen({ down: row, now: null, detail: 0 }), null, 'a stale press does not make Enter close a card that is not open');
  assert.equal(infoWasOpen({ down: undefined, now: row, detail: 0 }), row, 'Enter on an i button whose card is open closes it');
});
test('noteDown remembers the open card only for a press on an i button, so a click elsewhere leaves nothing stale', () => {
  const row = { r: 1 }, ibtn = fake('button'); ibtn.className = 'ibtn';
  noteDown(ibtn, row); assert.equal(pressSeen(), row);
  noteDown(fake('div'), row); assert.equal(pressSeen(), null, 'a press elsewhere (the one that closes a hover-opened card) is forgotten');
  noteDown(undefined, row); assert.equal(pressSeen(), null);
});
test('nice and the labels it feeds survive an empty or missing id', () => {
  assert.equal(nice(''), '');
  assert.equal(nice(undefined), '');
  assert.equal(nice('ability-score-improvement'), 'Ability score improvement');
});
