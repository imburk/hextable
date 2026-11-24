// The editor's tile picking (#738): the tile whose drawn top the pointer's ray meets first, not the cell on the base plane.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'tilepick-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '../tilepick.js'), join(tmp, 'tilepick.js'));
after(() => rmSync(tmp, { recursive: true, force: true }));
const { tileAlongRay } = await import(pathToFileURL(join(tmp, 'tilepick.js')));
const { HEX } = await import(pathToFileURL(join(tmp, 'shared/grid.js')));

const UNIT = Math.sqrt(3) / 5, topOf = (t) => (t.h ?? 0) * UNIT + 0.6, planeAt = 0.6 + 0.035;
const norm = (v) => { const l = Math.hypot(...v); return v.map((a) => a / l); };
// A ray from `eye` through the point `to`.
const through = (eye, to) => norm(to.map((a, i) => a - eye[i]));
const world = (h) => { const w = HEX.toWorld(h); return [w.x, w.z]; };
const col = HEX.col;

test('a raised tile is picked where it is drawn, not the tile behind it', () => {
  const front = { q: 0, r: 0 }, back = { q: 0, r: -1 };
  const level = { z: 0, tiles: { [col(front)]: { t: 'stone', h: 15 }, [col(back)]: { t: 'forest', h: -2.5 } } };
  const [fx, fz] = world(front), eye = [fx, 8, fz + 6];
  // Aim at the middle of the raised tile's top.
  const dir = through(eye, [fx, topOf(level.tiles[col(front)]), fz]);
  const hit = tileAlongRay({ eye, dir, level, G: HEX, topOf, planeAt });
  assert.deepEqual(hit.hex, front);
  // The old pick: the base plane under the same ray lands behind the raised tile.
  const t = (planeAt - eye[1]) / dir[1], plane = HEX.fromWorld(eye[0] + dir[0] * t, eye[2] + dir[2] * t);
  assert.notDeepEqual({ q: plane.q, r: plane.r }, front);
});

test('a ray that meets no tile falls back to the base plane, so empty ground can be painted', () => {
  const level = { z: 0, tiles: {} };
  const target = { q: 1, r: 1 }, [x, z] = world(target), eye = [x, 8, z + 6];
  const hit = tileAlongRay({ eye, dir: through(eye, [x, planeAt, z]), level, G: HEX, topOf, planeAt });
  assert.deepEqual(hit.hex, target); assert.equal(hit.tile, null);
});

test('a sunken tile is picked on its own top', () => {
  const at = { q: 0, r: 0 }, level = { z: 0, tiles: { [col(at)]: { t: 'water', h: -5 } } };
  const [x, z] = world(at), eye = [x, 8, z + 6];
  const hit = tileAlongRay({ eye, dir: through(eye, [x, topOf(level.tiles[col(at)]), z]), level, G: HEX, topOf, planeAt });
  assert.deepEqual(hit.hex, at);
});
