// water.js is pure in its helpers but imports the rules as ./shared (where the build puts them), so the test lays the two side by side in a temporary folder, as heights.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'water-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..', 'water.js'), join(tmp, 'water.js'));
writeFileSync(join(tmp, 'package.json'), '{"type":"module"}');
after(() => rmSync(tmp, { recursive: true, force: true }));
const imp = (f) => import(pathToFileURL(join(tmp, f)).href);
const { levelAt, toggle, feetOf, where, waterAction, stopAction, tideText, tideRows } = await imp('water.js');

const map = { id: 'm', levels: [{ id: 'ground', name: 'Ground', z: 0, tiles: { '0,0': { t: 'stone' }, '1,0': { t: 'stone' } } }, { id: 'up', name: 'Upper', z: 10, tiles: { '1,0': { t: 'stone' } } }], regions: [] };
const none = { level: null, cells: [], region: '' };

test('a hex is on the level whose tile has its top at the hex height', () => {
  assert.equal(levelAt(map, { q: 1, r: 0, z: 10 }), 'up');
  assert.equal(levelAt(map, { q: 1, r: 0, z: 0 }), 'ground');
  assert.equal(levelAt(map, { q: 0, r: 0 }), 'ground');
  assert.equal(levelAt(map, { q: 5, r: 5 }), null);
});
test('a tap adds a cell and a second tap takes it out; one level at a time', () => {
  let r = toggle(none, map, { q: 0, r: 0, z: 0 });
  assert.deepEqual(r.sel, { level: 'ground', cells: ['0,0'], region: '' });
  assert.match(toggle(r.sel, map, { q: 1, r: 0, z: 10 }).why, /one level at a time/);
  r = toggle(r.sel, map, { q: 0, r: 0, z: 0 });
  assert.deepEqual(r.sel, none);
  assert.match(toggle(none, map, { q: 9, r: 9 }).why, /no ground/);
});
test('feet are whole multiples of 5', () => {
  assert.equal(feetOf('10'), 10); assert.equal(feetOf(' -5 '), -5); assert.equal(feetOf('0'), 0);
  for (const bad of ['', '7', '2.5', 'x', null]) assert.equal(feetOf(bad), null);
});
test('the action names the cells or the room, and nothing when none are chosen', () => {
  assert.equal(where(none), null); assert.equal(waterAction(none, { by: 5 }), null);
  assert.deepEqual(waterAction({ level: 'ground', cells: ['0,0'], region: '' }, { by: 5 }), { type: 'water', level: 'ground', cells: ['0,0'], by: 5 });
  assert.deepEqual(waterAction({ level: null, cells: [], region: 'r-cave' }, { surface: 0, rise: { by: 5, to: 5 } }), { type: 'water', region: 'r-cave', surface: 0, rise: { by: 5, to: 5 } });
  assert.deepEqual(stopAction('T2'), { type: 'water', tide: 'T2', stop: true });
});
test('a running tide is said in words; one from another map waits', () => {
  const t = { id: 'T1', map: 'm', level: 'ground', cells: ['0,0', '1,0'], by: 5, to: 5, at: -5 };
  assert.equal(tideText(t, map), 'T1: 2 cells on Ground, now at -5 ft, +5 ft each round to 5 ft');
  assert.deepEqual(tideRows({ map, tides: [t, { ...t, id: 'T2', map: 'other', by: -5 }] }).map((r) => [r.id, r.waits]), [['T1', false], ['T2', true]]);
  assert.deepEqual(tideRows({ map }), []);
});

test('the actions the buttons build are ones the engine takes: raise, a tide, stop', async () => {
  const { apply } = await imp('shared/engine.js'), { newGame } = await imp('shared/scenario.js'), { newMap } = await imp('shared/map.js');
  const tiles = Object.fromEntries(['0,0', '1,0', '0,1'].map((k) => [k, { t: 'stone' }]));
  const g = newGame(7), DM = { role: 'dm', userId: 'dm' }, sel = { level: 'ground', cells: ['0,0', '1,0'], region: '' };
  for (const id of Object.keys(g.entities)) delete g.entities[id];
  const ok = (r) => { assert.ok(r.ok, r.error); return r; };
  ok(apply(g, { type: 'loadMap', map: newMap({ id: 'w', name: 'W', starts: [{ q: 0, r: 0 }], levels: [{ id: 'ground', name: 'Ground', z: 0, tiles }] }) }, DM));
  ok(apply(g, waterAction(sel, { by: 5 }), DM));
  ok(apply(g, waterAction(sel, { rise: { by: 5, to: 15 } }), DM));
  assert.deepEqual(tideRows(g).map((t) => t.id), ['T1']);
  ok(apply(g, stopAction('T1'), DM));
  assert.deepEqual(tideRows(g), []);
  assert.equal(apply(g, stopAction('T9'), DM).ok, false);
});
