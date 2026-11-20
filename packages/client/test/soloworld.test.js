// The world pack in a solo game (transport.js; docs/specs/travel.md, Decision 2, W3): loaded as the table server loads it, kept
// in IndexedDB with its pictures among the tab's files, and the pack's map put into an action as the server puts it. The client
// imports the rules as ./shared, so the test lays the two side by side in a temporary folder, as solopacks.test.js does. IndexedDB
// is a small stand-in here: a map per object store, each request answered on the next turn.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'soloworld-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
// ---------- a stand-in for IndexedDB ----------
const dbs = new Map();
const later = (f) => setTimeout(f, 0);
globalThis.indexedDB = {
  open(name) {
    const req = {};
    later(() => {
      let stores = dbs.get(name);
      if (!stores) {
        stores = new Map(); dbs.set(name, stores);
        req.result = { createObjectStore: (s, o) => stores.set(s, { rows: new Map(), keyPath: o?.keyPath }) };
        req.onupgradeneeded?.();
      }
      req.result = {
        transaction(s) {
          const st = stores.get(s), tx = {};
          const ask = (fn) => { const r = {}; r.result = fn(); return r; };
          tx.objectStore = () => ({
            get: (k) => ask(() => structuredClone(st.rows.get(String(k)))),
            getAll: () => ask(() => [...st.rows.values()].map((x) => structuredClone(x))),
            put: (v, k) => ask(() => { st.rows.set(String(st.keyPath ? v[st.keyPath] : k), structuredClone(v)); }),
            delete: (k) => ask(() => { st.rows.delete(String(k)); }),
          });
          later(() => tx.oncomplete?.());
          return tx;
        },
      };
      req.onsuccess?.();
    });
    return req;
  },
};
const T = await import(pathToFileURL(join(tmp, 'transport.js')));
const { riverPack, tavernMap, PNG } = await import(pathToFileURL(join(here, '../../rules/test/fixtures/world-pack.js')));
const open = async () => {
  const t = T.localTransport(), seen = { updates: [], errors: [], world: [] };
  t.on.update = (s, ev) => seen.updates.push(ev); t.on.error = (e) => seen.errors.push(e); t.on.world = (m) => seen.world.push(m);
  t.start();
  await new Promise((r) => setTimeout(r, 20));
  return { t, seen };
};
const files = () => [...(dbs.get('hextable-assets')?.get('files')?.rows.values() ?? [])];
const rejected = (p) => p.then(() => assert.fail('it was accepted'), (e) => e);

test('solo: a world loads, its pictures become the tab\'s files, the pack is kept in IndexedDB without their bytes, and a client map in an enter is replaced by the pack\'s', async () => {
  const { t, seen } = await open();
  const msg = await t.worldOp(riverPack());
  assert.deepEqual(msg.world, { id: 'river-country', name: 'The river country', version: 1, hash: msg.world.hash, nodes: 4, maps: 2, routes: 1, tables: 1 });
  assert.equal(files().length, 2);
  const kept = dbs.get('hextable-world').get('world').rows.get('current');
  assert.equal(kept.data.assets, undefined);
  assert.ok(!JSON.stringify(kept).includes(PNG));
  assert.equal(kept.data.nodes[0].image, kept.assets.a1.id);
  assert.ok(files().some((f) => f.id === kept.assets.a1.id));
  // worldIndex is not an action anyone sends.
  t.send({ type: 'worldIndex', index: {} });
  assert.match(seen.errors.at(-1), /loaded with the world message/);
  // The fill.
  t.send({ type: 'loadMap', node: 'continent' });
  const evil = tavernMap(); evil.name = 'A map the client made';
  t.send({ type: 'enter', pin: 'p-keep', map: evil });
  const ex = await t.export();
  assert.equal(ex.state.place, 'keep');
  assert.equal(ex.state.map.name, 'Greywatch (small keep)');
  assert.equal(ex.world.hash, msg.world.hash, 'the export carries the world');
  // A second tab reads the world back and fills from it.
  const again = await open();
  assert.equal(again.seen.world.at(-1).world.name, 'The river country');
});

test('solo: a refused world changes nothing, and a picture stored before a refusal is taken back out', async () => {
  const { t } = await open();
  const before = files().length;
  const bad = riverPack();
  bad.nodes.push({ id: 'x', kind: 'scene', parent: 'nowhere', name: 'X' });
  const e = await rejected(t.worldOp(bad));
  assert.match(e.error, /^The world pack was refused\. Place "x" is under a place that is not in the pack: "nowhere"\./);
  // A picture the tab's store will not take (over its 2 MB a file): the first was stored, then taken back out.
  const big = riverPack();
  big.world.version = 5;
  big.assets.a2 = { kind: 'image', data: Buffer.concat([Buffer.from(PNG, 'base64'), Buffer.alloc(2.5 * 1024 * 1024, 1)]).toString('base64') };
  big.assets.a1.data = Buffer.concat([Buffer.from(PNG, 'base64'), Buffer.from([1, 2, 3])]).toString('base64');
  const e2 = await rejected(t.worldOp(big));
  assert.match(e2.error, /Picture "a2" could not be kept: A picture can be at most 2 MB\./);
  assert.equal(files().length, before);
});

test('solo: world messages run one at a time, and a new game lets the world and its pictures go', async () => {
  const { t } = await open();
  const v6 = riverPack(); v6.world.version = 6;
  const v7 = riverPack(); v7.world.version = 7;
  v7.assets.a2.data = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe1, ...new Array(28).fill(3)));
  const [a, b] = await Promise.all([t.worldOp(v6), t.worldOp(v7)]);
  assert.deepEqual([a.world.version, b.world.version], [6, 7], 'in the order they were sent');
  const kept = dbs.get('hextable-world').get('world').rows.get('current');
  assert.equal(kept.version, 7);
  const ids = Object.values(kept.assets).map((x) => x.id).sort();
  assert.deepEqual(files().map((f) => f.id).sort(), ids, 'the files are the last world\'s pictures, no more');
  await t.reset();
  assert.equal(dbs.get('hextable-world').get('world').rows.get('current'), undefined, 'the record is gone');
  assert.deepEqual(files(), [], 'and its pictures');
  const ex = await t.export();
  assert.equal(ex.world, null);
});

test('solo: a New game started while a world is loading refuses that world, takes its pictures back out, and leaves no world', async () => {
  const { t } = await open();
  await t.reset();
  const v8 = riverPack(); v8.world.version = 8;
  const upload = t.assets.upload.bind(t.assets);
  let resetting = null;
  t.assets.upload = async (f) => { const r = await upload(f); resetting ??= t.reset(); return r; };     // a New game, in the middle of the load
  const e = await rejected(t.worldOp(v8));
  t.assets.upload = upload;
  assert.match(e.error, /A new game was started while the world was loading\. Load the world again\./);
  await resetting;
  const ex = await t.export();
  assert.equal(ex.state.world ?? null, null, 'the new game has no world');
  assert.equal(ex.world, null);
  assert.equal(dbs.get('hextable-world').get('world').rows.get('current'), undefined);
  assert.deepEqual(files(), [], 'the pictures stored for it were taken back out');
});
