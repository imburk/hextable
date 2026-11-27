// The breath meter and its words (breath.js, DEBT T110 (1)). breath.js is pure but imports the rules as ./shared (where the build puts them), so the test
// lays the two side by side in a temporary folder, as floors.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'breath-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '../breath.js'), join(tmp, 'breath.js'));
writeFileSync(join(tmp, 'package.json'), '{"type":"module"}');
after(() => rmSync(tmp, { recursive: true, force: true }));
const imp = (p) => import(pathToFileURL(join(tmp, p)).href);
const { breathView, wordsFor } = await imp('breath.js');
const { newGame } = await imp('shared/scenario.js');
const { apply } = await imp('shared/engine.js');
const { submerged } = await imp('shared/space.js');

// The valley with a pool of water 40 feet deep from q = 1 to 4, the fighter (Constitution 15: three minutes = 30 rounds) in it, 10 feet under the surface.
function pool() {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (id !== 'fighter') delete s.entities[id];
  const tiles = s.map.levels[0].tiles;
  for (const t of Object.values(tiles)) { t.t = 'grass'; delete t.depth; }
  for (let q = 1; q <= 4; q++) for (let r = -4; r <= 4; r++) if (tiles[`${q},${r}`]) tiles[`${q},${r}`] = { t: 'water', depth: 40 };
  Object.assign(s.entities.fighter, { pos: { q: 2, r: 0, z: -10 }, hp: 500, maxHp: 500 });
  return s;
}

test('the words: rounds left, minutes for a long breath, out of breath', () => {
  assert.equal(wordsFor(2, false), 'Holding breath: 2 rounds left');
  assert.equal(wordsFor(1, false), 'Holding breath: 1 round left');
  assert.equal(wordsFor(30, false), 'Holding breath: about 3 minutes left');
  assert.equal(wordsFor(5, true), 'Out of breath');
});

test('a creature under the surface shows a meter that empties and warns in the last two rounds', () => {
  const s = pool(), f = s.entities.fighter;
  assert.ok(submerged(s, f));
  f.breath = { held: 0, gave: 0 };
  let v = breathView(s, f);
  assert.deepEqual([v.frac, v.rounds, v.warn, v.out], [1, 30, false, false]);
  f.breath.held = 90;                                              // half of 180 seconds
  v = breathView(s, f);
  assert.deepEqual([v.frac, v.rounds, v.warn], [0.5, 15, false]);
  assert.equal(v.words, 'Holding breath: 15 rounds left');
  f.breath.held = 180 - 18;                                        // three rounds left
  assert.equal(breathView(s, f).warn, false);
  f.breath.held = 180 - 12;                                        // two rounds left
  v = breathView(s, f);
  assert.deepEqual([v.rounds, v.warn, v.words], [2, true, 'Holding breath: 2 rounds left']);
  f.breath = { held: 186, gave: 0, out: true };
  v = breathView(s, f);
  assert.deepEqual([v.out, v.warn, v.frac, v.words], [true, true, 0, 'Out of breath']);
});

test('nothing for a creature at or above the surface, with no record, dead, that breathes water or that the engine cannot judge', () => {
  const s = pool(), f = s.entities.fighter;
  f.breath = { held: 10, gave: 0 };
  assert.ok(breathView(s, f));
  const keep = f.pos;
  f.pos = { q: 2, r: 0, z: 0 };                                    // at the surface
  assert.equal(breathView(s, f), null, 'at the surface');
  f.pos = { q: 0, r: 0, z: 0 };
  assert.equal(breathView(s, f), null, 'on the shore');
  f.pos = keep;
  const rec = f.breath; delete f.breath;
  assert.equal(breathView(s, f), null, 'no record sent (a foe, for a player)');
  f.breath = rec; f.dead = true;
  assert.equal(breathView(s, f), null, 'dead');
  f.dead = false;
  const g = { id: 'zed', kind: 'monster', tpl: 'nothing-like-it', pos: keep, abil: { con: 10 }, cond: {}, breath: { held: 0, gave: 0, told: true } };
  assert.equal(breathView(s, g), null, 'a creature the engine cannot judge');
  const shark = { id: 'shark', kind: 'monster', tpl: 'reef-shark', pos: keep, abil: { con: 10 }, cond: {}, breath: { held: 0, gave: 0 } };
  assert.equal(breathView(s, shark), null, 'a creature that breathes water');
});

test('the engine and the helper agree: time under water through apply() moves the meter', () => {
  const s = pool(), f = s.entities.fighter;
  s.breathAt = s.clock;
  const r = apply(s, { type: 'advanceTime', minutes: 2 }, { role: 'dm', userId: 'dm' });
  assert.ok(r.ok, r.error);
  const v = breathView(s, f);
  assert.deepEqual([f.breath.held, v.rounds], [120, 10]);
  assert.ok(Math.abs(v.frac - 1 / 3) < 1e-9);
});
