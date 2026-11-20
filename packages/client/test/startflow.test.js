// The start flow's two plain needs (issue #556): every page says where it is, and what was filled in is kept as a draft. The pure part of
// startflow.js, the build screen's colour choices, and storage that is missing, full or throws. The client imports the rules as ./shared, so
// the test lays the two side by side in a temporary folder, as actionpanel.test.js does. The bars and the lobby are checked in a browser by
// scripts/smoke/startflow.mjs.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'startflow-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const F = await import(pathToFileURL(join(tmp, 'startflow.js')));
const { PALETTE, hexOf } = await import(pathToFileURL(join(tmp, 'buildsheet.js')));

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };
const throwing = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('full'); }, removeItem() { throw new Error('blocked'); } };

test('the title is the trail, and Back names the page above', () => {
  const t = ['New solo game', 'Characters', 'New character'];
  assert.equal(F.titleOf(t), 'New solo game › Characters › New character');
  assert.equal(F.backLabel(t), 'Back to Characters');
  assert.equal(F.backLabel(['New solo game']), 'Back');
  assert.deepEqual(F.upOf(t), ['New solo game', 'Characters']);
  assert.equal(F.titleOf(['A', '', 'B']), 'A › B');
});

test('a draft round-trips, and an empty one removes the key', () => {
  const s = mem();
  let d = F.loadDraft(s);
  assert.deepEqual(d, { v: 1, front: {}, build: {} });
  d = F.keepFront(d, { name: 'Isaac', code: 'KX7Q2M', map: '', grid: 'square' });
  d = F.keepBuild(d, 'new', { name: 'Tessa', class: 'fighter' }, 1000);
  assert.deepEqual(F.saveDraft(d, s), { ok: true });
  const back = F.loadDraft(s);
  assert.deepEqual(back.front, { name: 'Isaac', code: 'KX7Q2M' });      // squares and no map are the defaults, so they are not a draft
  assert.equal(back.build.new.b.name, 'Tessa');
  assert.equal(F.hasDraft(back), true);
  assert.deepEqual(F.saveDraft(F.dropBuild(F.keepFront(back, {}), 'new'), s), { ok: true });
  assert.equal(s.m.has(F.DRAFT_KEY), false);
  assert.equal(F.hasDraft(F.loadDraft(s)), false);
});

test('a front page that went to hexes is a draft', () => {
  assert.deepEqual(F.keepFront(F.loadDraft(mem()), { name: ' ', code: '', map: 'cave', grid: 'hex' }).front, { map: 'cave', grid: 'hex' });
});

test('storage that is missing, full or throws never throws and reads as no draft', () => {
  assert.deepEqual(F.loadDraft(throwing), { v: 1, front: {}, build: {} });
  assert.deepEqual(F.saveDraft(F.keepFront(F.loadDraft(mem()), { name: 'x' }), throwing), { ok: false });
  assert.deepEqual(F.loadDraft(null), { v: 1, front: {}, build: {} });
});

test('a draft that cannot be read is treated as none and what it holds is cut to size', () => {
  for (const raw of ['{', '[]', '"x"', JSON.stringify({ v: 2, front: { name: 'a' } }), JSON.stringify({ v: 1, front: 5, build: 5 })]) assert.equal(F.hasDraft(F.loadDraft(mem({ [F.DRAFT_KEY]: raw }))), false, raw);
  const raw = JSON.stringify({ v: 1, front: { name: 'n'.repeat(99), code: 'abcdefghij', grid: 'tri', map: 5 }, build: { a: { at: 1, b: { x: 1 } }, bad: { at: 'x', b: {} }, worse: { at: 2, b: 7 } } });
  const d = F.loadDraft(mem({ [F.DRAFT_KEY]: raw }));
  assert.equal(d.front.name.length, F.LIMITS.nameLen);
  assert.equal(d.front.code, 'abcdef');
  assert.equal(d.front.grid, undefined);
  assert.equal(d.front.map, undefined);
  assert.deepEqual(Object.keys(d.build), ['a']);
});

test('only the newest few build drafts are kept, and a draft too big for the browser is refused', () => {
  let d = F.loadDraft(mem());
  for (let i = 0; i < 10; i++) d = F.keepBuild(d, `c${i}`, { i }, i);
  assert.equal(Object.keys(d.build).length, F.LIMITS.builds);
  assert.ok(d.build.c9 && !d.build.c0);
  assert.deepEqual(F.saveDraft(F.keepBuild(d, 'big', { text: 'x'.repeat(F.LIMITS.bytes) }, 99), mem()), { ok: false });
});

test('when a draft was saved is said in plain words', () => {
  const now = 10 * 3600 * 1000;
  assert.equal(F.whenLine(now - 20000, now), 'just now');
  assert.equal(F.whenLine(now - 60000, now), '1 minute ago');
  assert.equal(F.whenLine(now - 5 * 60000, now), '5 minutes ago');
  assert.equal(F.whenLine(now - 3 * 3600000, now), '3 hours ago');
  assert.equal(F.whenLine(now - 50 * 3600000, now), '2 days ago');
});

test('the colour swatches are all colours a sheet accepts, with a name each', () => {
  assert.ok(PALETTE.length >= 8);
  for (const [v, name] of PALETTE) { assert.match(v, /^#[0-9a-f]{6}$/); assert.ok(name.length > 1); assert.equal(hexOf(v), v); }
  assert.equal(new Set(PALETTE.map(([v]) => v)).size, PALETTE.length);
  assert.equal(new Set(PALETTE.map(([, n]) => n)).size, PALETTE.length);
});

test('the More box takes #rrggbb, with or without the #, and nothing else', () => {
  assert.equal(hexOf('#C8553D'), '#c8553d');
  assert.equal(hexOf(' 12ab34 '), '#12ab34');
  for (const bad of ['', '#12ab3', '#12ab345', 'red', '#gg0000', '#12ab34;', null, undefined, 7]) assert.equal(hexOf(bad), '', String(bad));
});
