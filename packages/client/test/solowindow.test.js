// A solo game in several windows (#625): a save that cannot be kept is said (review R17), a read-only window writes nothing, a copy has its own save.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'solowindow-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));

const mem = new Map(); let full = false;
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { if (full) throw new Error('QuotaExceededError'); mem.set(k, String(v)); }, removeItem: (k) => mem.delete(k) };
const T = await import(pathToFileURL(join(tmp, 'transport.js')));
const open = (opts) => {
  const t = T.localTransport(opts), seen = { errors: [], saveErrors: [], updates: 0 };
  t.on.error = (e) => seen.errors.push(e); t.on.saveError = (e) => seen.saveErrors.push(e); t.on.update = () => seen.updates++; t.on.packs = () => {}; t.on.packData = () => {};
  t.start();
  return { t, seen };
};
const hit = (t) => t.send({ type: 'setHp', actor: 'fighter', hp: 3 });
const hp = (key) => JSON.parse(mem.get(key)).entities.fighter.hp;

test('a save the browser refuses is said once, not swallowed, and again after a save works', () => {
  mem.clear(); full = false;
  const { t, seen } = open();
  hit(t); assert.equal(seen.saveErrors.length, 0); assert.equal(hp(T.SOLO_KEY), 3);
  full = true;
  t.send({ type: 'setHp', actor: 'fighter', hp: 2 }); t.send({ type: 'setHp', actor: 'fighter', hp: 1 });
  assert.equal(seen.saveErrors.length, 1, 'said once for the run of failures');
  assert.match(seen.saveErrors[0], /could not save/);
  assert.equal(seen.errors.length, 0, 'it is not a refused action');
  full = false; hit(t); full = true; hit(t);
  assert.equal(seen.saveErrors.length, 2, 'said again after a save has worked');
});

test('a read-only window changes nothing, in the game or in storage, and says why', async () => {
  mem.clear(); full = false;
  const { t: player } = open(); hit(player);
  const before = mem.get(T.SOLO_KEY), snapshot = JSON.stringify([...mem]);
  const { t, seen } = open({ readOnly: true });
  assert.equal(t.readOnly, true);
  hit(t); t.undo(); t.redo(); t.rewind('fight'); t.reset();
  assert.equal(seen.errors.length, 5); assert.match(seen.errors[0], /read-only/);
  await assert.rejects(t.packOp({ op: 'remove', id: 'x' }), (e) => /read-only/.test(e.error));
  await assert.rejects(t.worldOp({}), (e) => /read-only/.test(e.error));
  assert.equal(mem.get(T.SOLO_KEY), before);
  assert.equal(JSON.stringify([...mem]), snapshot, 'not one key was written');
  assert.equal(T.hasSoloGame(), true);
});

test('a copy starts from the save, keeps its own from the start, and leaves the original alone', async () => {
  mem.clear(); full = false;
  const { t: player } = open(); hit(player);
  const key = T.newCopyKey();
  assert.match(key, /^hextable\.solo\.copy\./);
  const { t: copy } = open({ saveKey: key, copyOf: T.SOLO_KEY });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(hp(key), 3, 'the copy began as the game was');
  copy.send({ type: 'setHp', actor: 'fighter', hp: 1 });
  assert.equal(hp(key), 1); assert.equal(hp(T.SOLO_KEY), 3, 'the original is not written by the copy');
  hit(player); player.send({ type: 'setHp', actor: 'fighter', hp: 2 });
  assert.equal(hp(key), 1, 'nor the copy by the original');
  const again = open({ saveKey: key });
  assert.equal(again.t.saveKey, key);
  T.forgetSolo(key);
  assert.equal(T.hasSoloGame(key), false); assert.equal(T.hasSoloGame(), true);
});
