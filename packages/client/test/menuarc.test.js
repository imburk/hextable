// M8 of docs/specs/one-token-menu.md (Decision 4c): the arc round the die and the places it shows. Every place of the menu has a symbol and a name that is spoken,
// and the arc's sums (menuarc.js) put every symbol on the screen, clear of the die and of each other, at every count a table reaches, with More past the last slot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SYMBOLS, SYMBOL_NAMES, PLACE_SYMBOLS, placeSymbol, symbol } from '../symbols.js';
import { ARC, BUTTON, arcCapacity, arcLayout, arcShape } from '../menuarc.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const drawer = readFileSync(new URL('../drawer.js', import.meta.url), 'utf8');
const TOKEN = 64, EDGE = 16;      // the die is 64 px, 16 px above the bottom edge (style.css)

test('every place on the strip has a symbol, a name in words, and a screen', () => {
  const strip = html.slice(html.indexOf('<nav id="menu-root"'), html.indexOf('</nav>', html.indexOf('<nav id="menu-root"')));
  const rows = [...strip.matchAll(/<button type="button" class="menu-row" id="([\w-]+)" data-go="(\w+)"[^>]*><span class="mr-name">([^<]+)<\/span>/g)].map((m) => ({ id: m[1], go: m[2], name: m[3] }));
  assert.deepEqual(rows.map((r) => r.go), ['sheet', 'turns', 'dice', 'log', 'handouts', 'settings', 'dm', 'about']);
  for (const r of rows) {
    const k = placeSymbol(r.go);
    assert.ok(k && SYMBOLS[k], `${r.go} has a symbol`);
    assert.ok(SYMBOL_NAMES[k], `${k} has a spoken name`);
    assert.ok(r.name.trim().length > 2, `${r.id} carries its name in words, so a symbol is never the only name`);
    assert.match(drawer, new RegExp(`\\b${r.go}: \\{ panel: '[\\w-]+', button: '${r.id}', title: '[^']+' \\}`), `${r.go} is a screen of the menu with this button`);
  }
  assert.equal(strip.includes('>Menu<'), false, 'no screen is headed "Menu"');
});

test('Turns wears crossed swords in a fight and the campfire while nobody fights; More is three dots', () => {
  assert.equal(placeSymbol('turns'), 'turns'); assert.equal(placeSymbol('turns', { fight: false }), 'party');
  assert.notEqual(SYMBOLS.turns, SYMBOLS.party);
  assert.equal(placeSymbol('more'), 'more'); assert.equal(placeSymbol('nowhere'), null);
  for (const k of Object.values(PLACE_SYMBOLS)) assert.ok(SYMBOLS[k], k);
});

test('the whole set of Decision 4c is drawn: line drawings in currentColor with no fill, each with a name', () => {
  const set = ['character', 'turns', 'party', 'dice', 'roll', 'log', 'handouts', 'setup', 'dm', 'characters', 'packs', 'help', 'about', 'leave', 'more', 'arrange', 'undo', 'redo'];
  for (const k of set) {
    const s = symbol(k);
    assert.match(s, /^<svg [^>]*viewBox="0 0 24 24"/, k);
    assert.match(s, /stroke="currentColor"/); assert.match(s, /fill="none"/); assert.match(s, /aria-hidden="true"/);
    assert.equal(/fill="(?!none)/.test(s), false, `${k} has no fill of its own`);
    assert.ok(SYMBOL_NAMES[k], `${k} has a name`);
  }
  assert.equal(new Set(set.map((k) => SYMBOLS[k])).size, set.length, 'no two symbols are the same drawing');
  for (const k of Object.keys(SYMBOLS)) assert.ok(SYMBOL_NAMES[k], `${k} has a name`);
});

test('which fan: a wide screen from 900 px, a corner when the die is within 120 px of a side', () => {
  assert.equal(arcShape({ w: 390, h: 844, x: 195 }), 'phone-centre');
  assert.equal(arcShape({ w: 390, h: 844, x: 48 }), 'phone-left');
  assert.equal(arcShape({ w: 390, h: 844, x: 342 }), 'phone-right');
  assert.equal(arcShape({ w: 1280, h: 800, x: 640 }), 'wide-centre');
  assert.equal(arcShape({ w: 1280, h: 800, x: 48 }), 'wide-left');
  assert.equal(arcShape({ w: 1280, h: 800, x: 1232 }), 'wide-right');
});

test('the rings of Decision 4c: 7 + 8 slots on a phone at bottom centre, 4 + 6 in a corner, 8 + 11 on a wide screen', () => {
  assert.equal(BUTTON, 52);
  assert.deepEqual(ARC['phone-centre'].map((r) => [r.rx, r.ry, r.slots]), [[128, 150, 7], [165, 252, 8]]);
  assert.deepEqual(ARC['phone-left'].map((r) => [r.rx, r.slots]), [[124, 4], [204, 6]]);
  assert.deepEqual(ARC['wide-centre'].map((r) => [r.rx, r.slots]), [[160, 8], [270, 11]]);
  assert.deepEqual(ARC['wide-left'].map((r) => [r.rx, r.slots]), [[135, 4], [220, 6]]);
  assert.equal(arcCapacity('phone-centre'), 15); assert.equal(arcCapacity('phone-left'), 10); assert.equal(arcCapacity('wide-centre'), 19);
});

// Every symbol of every count is a whole 52 px button on the screen, clear of the die and of every other symbol.
const SCREENS = [
  ['phone-centre', 390, 844, 195], ['phone-left', 390, 844, 16 + TOKEN / 2], ['phone-right', 390, 844, 390 - 16 - TOKEN / 2],
  ['wide-centre', 1280, 800, 640], ['wide-left', 1280, 800, 16 + TOKEN / 2], ['wide-right', 1280, 800, 1280 - 16 - TOKEN / 2],
];
for (const [shape, w, h, cx] of SCREENS) {
  test(`${shape} at ${w} x ${h}: every count up to its slots is on the screen, none under 44 px, none on the die or on another`, () => {
    assert.equal(arcShape({ w, h, x: cx }), shape);
    const cy = h - EDGE - TOKEN / 2, cap = arcCapacity(shape);
    for (let n = 1; n <= cap; n++) {
      const { slots, more } = arcLayout(n, shape, w / 2 - 30);
      assert.equal(slots.length, n); assert.equal(more, false);
      assert.ok(BUTTON >= 44);
      slots.forEach((s, i) => {
        const x = cx + s.x, y = cy + s.y;
        assert.ok(x - BUTTON / 2 >= 0 && x + BUTTON / 2 <= w && y - BUTTON / 2 >= 0 && y + BUTTON / 2 <= h, `${n} places: symbol ${i} at ${x},${y} is off the screen`);
        assert.ok(Math.hypot(s.x, s.y) >= (TOKEN + BUTTON) / 2, `${n} places: symbol ${i} is on the die`);
        for (let j = 0; j < i; j++) assert.ok(Math.hypot(s.x - slots[j].x, s.y - slots[j].y) >= BUTTON, `${n} places: symbols ${j} and ${i} touch (${Math.hypot(s.x - slots[j].x, s.y - slots[j].y).toFixed(1)} px apart)`);
      });
    }
  });
}

test('one ring holds every usual table on a phone (5 to 7 places); a solo party of five with the DM\'s tools uses the second', () => {
  for (const n of [5, 6, 7]) assert.ok(arcLayout(n, 'phone-centre').slots.every((s) => s.ring === 0), `${n} places`);
  assert.deepEqual(arcLayout(10, 'phone-centre').slots.map((s) => s.ring), [0, 0, 0, 0, 0, 0, 0, 1, 1, 1]);
});

test('with more places than slots the last slot is More, and it holds the rest', () => {
  const full = arcLayout(15, 'phone-centre'); assert.equal(full.more, false); assert.equal(full.slots.length, 15);
  const over = arcLayout(16, 'phone-centre'); assert.equal(over.more, true); assert.equal(over.slots.length, 15, '14 places and More');
  const corner = arcLayout(11, 'phone-left'); assert.equal(corner.more, true); assert.equal(corner.slots.length, 10);
  assert.deepEqual(arcLayout(0, 'phone-centre'), { slots: [], more: false });
});

test('a phone narrower than 390 px pulls a centred fan in, so no symbol leaves the screen', () => {
  const w = 320, cx = 160;
  for (let n = 1; n <= 7; n++) for (const s of arcLayout(n, 'phone-centre', w / 2 - 30).slots) assert.ok(cx + s.x - BUTTON / 2 >= 0 && cx + s.x + BUTTON / 2 <= w, `${n} places at 320 px`);
});
