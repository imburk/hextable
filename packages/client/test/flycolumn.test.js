// The column of heights and the plane of places, as highlights and as words (docs/specs/fly-swim-control.md, C2), and that every
// theme draws them. The client imports the rules as ./shared, so the test lays the two side by side, as aimrange.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'flycolumn-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const imp = (f) => import(pathToFileURL(join(tmp, f)));
const HT = await imp('heights.js');
const B = await imp('three-build.js');
const { THEMES } = await imp('themes.js');
const { apply, current } = await imp('shared/engine.js');
const { newGame } = await imp('shared/scenario.js');
const { newMap } = await imp('shared/map.js');
const H = await imp('shared/hex.js');

const DM = { role: 'dm', userId: 'dm' };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
function world({ water = false } = {}) {
  const ground = Object.fromEntries(H.range({ q: 0, r: 0 }, 6).map((h) => [H.col(h), { t: 'stone' }]));
  if (water) ground['0,2'] = { t: 'water', depth: 10 };
  const map = newMap({ id: 'field', name: 'Field', starts: [{ q: -1, r: 0 }], levels: [{ id: 'ground', name: 'Ground', z: 0, tiles: ground }, { id: 'roof', name: 'Roof', z: 10, tiles: { '3,0': { t: 'stone' }, '4,0': { t: 'stone' } } }] });
  const s = newGame(12);
  ok(apply(s, { type: 'loadMap', map }, DM));
  ok(apply(s, { type: 'setting', key: 'autoEngage', value: false }, DM));
  for (const [id, q, r] of [['fighter', 2, 0], ['rogue', -1, 0], ['cleric', -2, 3], ['wizard', -1, 1]]) s.entities[id].pos = { q, r, z: 0 };
  ok(apply(s, { type: 'setSpeed', actor: 'wizard', mode: 'fly', feet: 60 }, DM));
  return s;
}
const fight = (s) => { ok(apply(s, { type: 'spawn', monster: 'goblin-warrior', at: { q: -4, r: 0 } }, DM)); ok(apply(s, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 6 }, DM)); let n = 0; while (current(s) !== 'wizard') { ok(apply(s, { type: 'endTurn', actor: current(s) }, DM)); assert.ok(++n < 40); } };
const base = { move: [], area: [], range: [], targets: [], allies: [], selected: null, turn: null };

test('the column as highlights: one block a height, the picked one and the one it is at marked, a floor height marked as a place to stand', () => {
  const s = world(), e = s.entities.wizard, h = HT.heightsOf(s, e), row = h.heights.find((r) => r.ft === 15);
  const col = HT.columnHl(e, h, row, { hover: 20, color: '#336699' });
  assert.deepEqual(col.at, { q: -1, r: 1 });
  assert.deepEqual(col.blocks.map((b) => b.ft), h.heights.map((r) => r.ft));
  assert.deepEqual(col.blocks.filter((b) => b.picked).map((b) => b.ft), [15]);
  assert.deepEqual(col.blocks.filter((b) => b.here).map((b) => b.ft), [0]);
  assert.deepEqual(col.blocks.filter((b) => b.hover).map((b) => b.ft), [20]);
  assert.deepEqual(col.blocks.filter((b) => b.stand).map((b) => b.ft), [10], 'the roof is at 10 ft; the ground block is not marked as a ledge');
  assert.equal(col.color, '#336699');
});

test('the plane as highlights: the places of the picked height; a place pointed at knows the floor under it and what is there', () => {
  const s = world({ water: true }), e = s.entities.wizard, h = HT.heightsOf(s, e), row = h.heights.find((r) => r.ft === 15);
  const pl = HT.planeHl(s.map, h, row);
  assert.equal(pl.z, 15); assert.equal(pl.ground, false); assert.equal(pl.point, null);
  assert.equal(pl.cells.length, row.cells.length);
  assert.ok(pl.cells.every((c) => !c.floor && c.h.z === 15 && [0, 1, 2].includes(c.band)));
  const over = row.cells.find((c) => c.h.q === 0 && c.h.r === 1), wet = row.cells.find((c) => c.h.q === 0 && c.h.r === 2), roof = h.heights.find((r) => r.ft === 10).cells.find((c) => c.floor);
  assert.deepEqual(HT.planeHl(s.map, h, row, { point: over.key }).point, { h: over.h, z: 0, drop: 15, bad: '' });
  assert.equal(HT.planeHl(s.map, h, row, { point: wet.key }).point.bad, 'water below');
  assert.equal(HT.planeHl(s.map, h, h.heights.find((r) => r.ft === 10), { point: roof.key }).point.drop, 0, 'a place on a floor has nothing to fall');
  assert.equal(HT.planeHl(s.map, h, row, { faint: true }).faint, true);
  assert.equal(HT.planeHl(s.map, h, null), null);
  assert.deepEqual(HT.below(s.map, { q: 40, r: 40, z: 10 }), { z: null, drop: null, bad: 'nothing below' });
});

test('thirds of the reach: the nearest third, the middle and the farthest', () => {
  assert.deepEqual([5, 20, 25, 40, 45, 60].map((c) => HT.band(c, 60)), [0, 0, 1, 1, 2, 2]);
  assert.deepEqual([5, 10, 15, 30].map((c) => HT.band(c, 30)), [0, 0, 1, 2]);
  assert.equal(HT.band(5, 0), 0);
});

test('the words: where it is and what is left; what a height costs straight up; a place\'s number and what is left after it', () => {
  const s = world(), e = s.entities.wizard;
  let h = HT.heightsOf(s, e);
  assert.equal(HT.stateLine(h, h.heights[0]), 'On the ground. Up to 60 ft a move. Pick a height.');
  assert.equal(HT.stateLine(h, h.heights.find((r) => r.ft === 30)), '30 ft up. Straight up costs 30 ft.');
  assert.match(HT.stateLine(h, h.heights.at(-1)), /^50 ft up\. Straight up costs 50 ft\. 50 ft is as high as the table's search goes here\.$/);
  assert.equal(HT.cellWords(h, h.heights[3].cells[0]), `${h.heights[3].cells[0].cost} ft`);
  fight(s);
  h = HT.heightsOf(s, e);
  assert.equal(HT.stateLine(h, h.heights[0]), 'On the ground. 60 ft of flying left, 30 of walking. Pick a height.');
  assert.equal(HT.stateLine(h, h.heights.find((r) => r.ft === 30)), '30 ft up. Straight up costs 30 ft. 30 ft of flying left.');
  const c = h.heights.find((r) => r.ft === 15).cells.find((x) => x.cost === 35);
  assert.equal(HT.cellWords(h, c), '35 ft, 25 left');
  ok(apply(s, { type: 'move', actor: 'wizard', to: { q: -1, r: 1, z: 20 } }, DM));
  h = HT.heightsOf(s, e);
  assert.equal(HT.stateLine(h, HT.rowOf(h, null)), 'Flying at 20 ft. 40 ft of flying left, 10 of walking.');
  assert.equal(HT.stateLine(h, h.heights[0]), 'Ground. Straight down costs 20 ft. 20 ft of flying left.');
  assert.equal(HT.stateLine(h, null), '');
});

test('every theme draws the column and the plane: more shapes with them, an outline through walls, and a line down for a place pointed at', () => {
  const s = world(), e = s.entities.wizard, h = HT.heightsOf(s, e), row = h.heights.find((r) => r.ft === 15);
  for (const [name, theme] of Object.entries(THEMES)) {
    const none = B.buildOverlay({ state: s, hl: base, theme });
    assert.equal(none.through.count, 0, `${name}: nothing through walls without a column`);
    const col = B.buildOverlay({ state: s, hl: { ...base, column: HT.columnHl(e, h, row, { color: '#336699' }) }, theme });
    assert.ok(col.count > none.count && col.through.count > 0, `${name}: the column is drawn`);
    const pl = HT.planeHl(s.map, h, row), both = B.buildOverlay({ state: s, hl: { ...base, column: HT.columnHl(e, h, row), plane: pl }, theme });
    assert.ok(both.count > col.count, `${name}: the plane is drawn`);
    const pointed = B.buildOverlay({ state: s, hl: { ...base, plane: HT.planeHl(s.map, h, row, { point: row.cells[0].key }) }, theme }), bare = B.buildOverlay({ state: s, hl: { ...base, plane: pl }, theme });
    assert.ok(pointed.count > bare.count, `${name}: the line down is drawn`);
    // A place in the air is not drawn as a floor is: dashes on its edge (never colour alone).
    const floorRow = h.heights.find((r) => r.ft === 10), fl = floorRow.cells.find((c) => c.floor), air = floorRow.cells.find((c) => !c.floor);
    const one = (c) => B.buildOverlay({ state: s, hl: { ...base, plane: { z: 10, ground: false, faint: false, point: null, cells: [{ key: c.key, h: c.h, floor: c.floor, cost: c.cost, band: 0 }] } }, theme }).count - none.count;
    assert.notEqual(one(fl), one(air), `${name}: air and floor differ in shape`);
  }
  // The block the renderer picks is the block the overlay draws: 5 ft tall, on the creature's cell, its foot at the height.
  const bx = B.blockBox(s.map, { q: -1, r: 1 }, 15), g = B.blockBox(s.map, { q: -1, r: 1 }, 0);
  assert.ok(Math.abs((bx.y0 - g.y0) - 15 * B.UNIT) < 1e-9);
  assert.ok(bx.y1 - bx.y0 > 4.5 * B.UNIT && bx.y1 - bx.y0 < 5 * B.UNIT);
  assert.ok(B.planeY(15) > bx.y0 && B.planeY(15) < bx.y0 + 0.1);
});
