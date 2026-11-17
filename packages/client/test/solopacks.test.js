// Homebrew packs in a solo game (transport.js, DEBT T51): what the browser keeps is never trusted, and a pack message is answered as the table server answers it.
// The client imports the rules as ./shared, so the test lays the two side by side in a temporary folder, as packmanager.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'solopacks-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));

// a browser's storage: a map, which can be made full
const mem = new Map(); let full = false, reads = 0;
globalThis.localStorage = { getItem: (k) => { reads++; return mem.has(k) ? mem.get(k) : null; }, setItem: (k, v) => { if (full && k === 'hextable.solo.packs') throw new Error('QuotaExceededError'); mem.set(k, String(v)); }, removeItem: (k) => mem.delete(k) };
const T = await import(pathToFileURL(join(tmp, 'transport.js')));
const { SPELLS } = await import(pathToFileURL(join(tmp, 'shared/content/index.js')));
const { installed } = await import(pathToFileURL(join(tmp, 'shared/content/registry.js')));
const { hashOf } = await import(pathToFileURL(join(tmp, 'shared/content/packs.js')));
const SAMPLE = readFileSync(join(here, '../../rules/test/fixtures/sample-pack.json'), 'utf8');
const SPELL = 'hb-sample-ember-dart', KEY = T.SOLO_PACKS_KEY;
const record = (text = SAMPLE) => { const data = JSON.parse(text); return { id: data.pack.id, version: data.pack.version ?? 1, hash: hashOf(data), data }; };
const fresh = () => { mem.clear(); full = false; };
const open = () => {
  const t = T.localTransport(), seen = { packs: [], data: [], updates: 0, errors: [] };
  t.on.packs = (m) => seen.packs.push(m); t.on.packData = (m) => seen.data.push(m); t.on.update = () => seen.updates++; t.on.error = (e) => seen.errors.push(e);
  t.start();
  return { t, seen };
};
const rejected = (p) => p.then(() => assert.fail('it was accepted'), (e) => e);

test('storage is read with a size check first and every record checked again; what fails is dropped with its reason', () => {
  fresh();
  assert.deepEqual(T.readSoloPacks(), { packs: [], dropped: [], held: [] });
  mem.set(KEY, 'not json {{');
  assert.match(T.readSoloPacks().dropped[0].reason, /not readable/);
  mem.set(KEY, '{"a":1}');
  assert.match(T.readSoloPacks().dropped[0].reason, /not a list/);
  mem.set(KEY, ' '.repeat(T.SOLO_PACKS_MAX + 1));
  const big = T.readSoloPacks();
  assert.match(big.dropped[0].reason, /more than four packs can be; it was not read/);
  const good = record(), forged = { ...record(), hash: '0'.repeat(64) };
  mem.set(KEY, JSON.stringify([good, forged, { id: 'x' }, 7]));
  const r = T.readSoloPacks();
  assert.deepEqual(r.packs.map((p) => p.id), ['sample']);
  assert.equal(r.dropped.length, 3);
  assert.ok(r.dropped.every((d) => typeof d.reason === 'string' && d.reason.length));
  mem.set(KEY, JSON.stringify(Array.from({ length: 5000 }, () => 1)));
  assert.ok(T.readSoloPacks().dropped.length <= 9, 'a long list of rubbish is summarised');
});

test('a game opens with the browser\'s packs handed to the page and named in its state; a bad store opens a game without them and says so', async () => {
  fresh();
  mem.set(KEY, JSON.stringify([record()]));
  const { t, seen } = open();
  assert.equal(t.you.role, 'dm');
  assert.equal(seen.packs[0].packs[0].id, 'sample');
  assert.equal(seen.data[0].data.pack.id, 'sample');
  assert.deepEqual((await t.export()).state.packs, [{ id: 'sample', version: 1, hash: record().hash }]);
  fresh();
  mem.set(KEY, 'nonsense');
  const bad = open();
  assert.equal(bad.seen.packs[0].packs.length, 0);
  assert.equal(bad.seen.packs[0].dropped.length, 1);
  assert.equal(bad.seen.errors.length, 0);
});

test('add: vetted, set through the engine as the DM, then kept; a refusal changes nothing', async () => {
  fresh();
  const { t, seen } = open();
  const before = JSON.stringify(mem.get('hextable.solo')), stored = () => mem.get(KEY);
  const e1 = await rejected(t.packOp({ op: 'add', pack: '{ not json' }));
  assert.match(e1.error, /not JSON/); assert.ok(e1.problems.length);
  const e2 = await rejected(t.packOp({ op: 'add', pack: ' '.repeat(600 * 1024) }));
  assert.match(e2.error, /too large/);
  const e3 = await rejected(t.packOp({ op: 'add', pack: JSON.stringify({ format: 'hextable-pack', v: 1, pack: { id: 'broken', name: 'B', version: 1, license: 'x', attribution: 'x' }, spells: [{ id: 'hb-broken-zap', name: 'Zap' }] }) }));
  assert.ok(e3.problems.length);
  const e4 = await rejected(t.packOp({ op: 'nope' }));
  assert.match(e4.error, /add, update or remove/);
  assert.equal(stored(), undefined, 'nothing was kept');
  assert.equal(seen.packs.length, 1, 'nobody was told of a change');
  assert.equal(JSON.stringify(mem.get('hextable.solo')), before);
  const ans = await t.packOp({ op: 'add', pack: SAMPLE });
  assert.deepEqual(ans.changed, { op: 'add', id: 'sample', version: 1 });
  assert.equal(JSON.parse(stored())[0].id, 'sample');
  const saved = JSON.parse(mem.get('hextable.solo'));
  assert.deepEqual(saved.packs, [{ id: 'sample', version: record().version, hash: record().hash }], 'the game names the pack: ids, versions and hashes only');
  assert.equal(seen.packs.at(-1).packs[0].name, 'Sample Pack');
  assert.equal(seen.data.at(-1).data.pack.id, 'sample');
  assert.match((await rejected(t.packOp({ op: 'add', pack: SAMPLE }))).error, /already on this table/);
  assert.equal(installed(), null, 'the page\'s store installs the overlay, the transport does not');
  assert.equal(SPELLS[SPELL], undefined);
});

test('a browser that cannot keep the pack: it is not added, the game is as it was, and the player is told', async () => {
  fresh();
  const { t } = open();
  full = true;
  const e = await rejected(t.packOp({ op: 'add', pack: SAMPLE }));
  assert.match(e.error, /storage is full or turned off/);
  assert.match(e.error, /nothing was added/);
  assert.equal(mem.get(KEY), undefined);
  assert.deepEqual(JSON.parse(mem.get('hextable.solo') ?? '{"packs":[]}').packs, []);
  full = false;
  await t.packOp({ op: 'add', pack: SAMPLE });
  assert.equal(JSON.parse(mem.get(KEY)).length, 1, 'it works once there is room');
});

test('remove: refused while the game uses the pack (with where), allowed after, and the undo history is cleared', async () => {
  fresh();
  const { t, seen } = open();
  await t.packOp({ op: 'add', pack: SAMPLE });
  const ven = { type: 'setSheet', sheet: { name: 'Ven', class: 'wizard', level: 2, abilities: { str: 10, dex: 14, con: 14, int: 17, wis: 12, cha: 10 }, skills: ['arcana', 'history'], weapons: ['quarterstaff'], spells: [SPELL, 'fire-bolt'] } };
  const { overlayOf, install, uninstall } = await import(pathToFileURL(join(tmp, 'shared/content/registry.js')));
  const o = overlayOf([JSON.parse(SAMPLE)]); install(o);               // the page's store would have this installed
  try {
    t.send(ven);
    assert.deepEqual(seen.errors, []);
    assert.ok(t.undoInfo.undo.length > 0, 'there is something to undo');
    const e = await rejected(t.packOp({ op: 'remove', id: 'sample' }));
    assert.match(e.error, /in use and cannot be removed yet/);
    assert.ok(e.blockers.length && e.blockers.some((b) => b.includes(SPELL)));
    assert.equal(JSON.parse(mem.get(KEY)).length, 1, 'still kept');
    t.undo();
    assert.equal(t.undoInfo.undo.length, 0);
    t.redo();
    assert.ok(t.undoInfo.undo.length > 0);
    t.undo();                                                            // the sheet is gone again: nothing uses the pack
    t.send({ type: 'setPacks', packs: [] });
    assert.match(seen.errors.at(-1), /pack message/, 'the packs are not an action');
    assert.ok(t.undoInfo.redo.length > 0);
    const ans = await t.packOp({ op: 'remove', id: 'sample' });
    assert.deepEqual(ans.changed, { op: 'remove', id: 'sample' });
    assert.deepEqual(JSON.parse(mem.get(KEY)), []);
    assert.deepEqual(t.undoInfo.undo, []); assert.deepEqual(t.undoInfo.redo, []);
    assert.deepEqual(JSON.parse(mem.get('hextable.solo')).packs, []);
    assert.equal(seen.packs.at(-1).packs.length, 0);
    assert.match((await rejected(t.packOp({ op: 'remove', id: 'sample' }))).error, /not in this game/);
  } finally { uninstall(o); }
});

test('a saved game that names packs the browser no longer has opens without them, says so, and its state matches', async () => {
  fresh();
  const first = open();
  await first.t.packOp({ op: 'add', pack: SAMPLE });
  assert.equal(JSON.parse(mem.get('hextable.solo')).packs.length, 1);
  mem.delete(KEY);                                                      // the browser lost the packs; the game remembers
  const { t, seen } = open();
  const msg = seen.packs[0];
  assert.equal(msg.packs.length, 0);
  assert.equal(msg.dropped.length, 1);
  assert.equal(msg.dropped[0].id, 'sample');
  assert.match(msg.dropped[0].reason, /no longer has it, so the game opens without it/);
  const ex = await t.export();
  assert.deepEqual(ex.state.packs, [], 'state.packs says what is installed');
  assert.deepEqual(ex.packs, []);
  // the next change to the packs clears the notice
  await t.packOp({ op: 'add', pack: SAMPLE });
  assert.equal(seen.packs.at(-1).dropped, undefined);
});

test('an update needs a higher version and drops nothing', async () => {
  fresh();
  const { t } = open();
  await t.packOp({ op: 'add', pack: SAMPLE });
  assert.match((await rejected(t.packOp({ op: 'update', pack: SAMPLE }))).error, /must be version 2 or higher/);
  const v2 = JSON.parse(SAMPLE); v2.pack.version = 2;
  const ans = await t.packOp({ op: 'update', pack: JSON.stringify(v2) });
  assert.deepEqual(ans.changed, { op: 'update', id: 'sample', version: 2 });
  assert.equal(JSON.parse(mem.get(KEY))[0].version, 2);
  const dropOne = structuredClone(v2); dropOne.pack.version = 3; dropOne.spells.pop();
  assert.match((await rejected(t.packOp({ op: 'update', pack: JSON.stringify(dropOne) }))).error, /drops 1 entr/);
  assert.equal(JSON.parse(mem.get(KEY))[0].version, 2);
});

test('a pack dropped at load is kept untouched through later writes, until the player removes it or adds the same pack again', async () => {
  fresh();
  const forged = { ...record(), id: 'sample', hash: '0'.repeat(64) };
  const other = (() => { const d = JSON.parse(SAMPLE); d.pack.id = 'second'; d.pack.name = 'Second'; for (const k of ['spells']) for (const e of d[k]) { e.id = e.id.replace('hb-sample-', 'hb-second-'); e.source = 'homebrew:second'; } return JSON.stringify(d); })();
  mem.set(KEY, JSON.stringify([forged, 'nonsense']));
  const { t, seen } = open();
  const msg = seen.packs[0];
  assert.deepEqual(msg.packs, []);
  assert.equal(msg.dropped.filter((d) => d.held).length, 1);
  assert.equal(msg.dropped.find((d) => d.held).id, 'sample');
  assert.ok(msg.dropped.some((d) => !d.held), 'what is not a record is only told');
  await t.packOp({ op: 'add', pack: other });
  let kept = JSON.parse(mem.get(KEY));
  assert.deepEqual(kept.map((p) => p.id).sort(), ['sample', 'second'], 'the dropped record is still stored');
  assert.deepEqual(kept.find((p) => p.id === 'sample'), forged, 'untouched');
  assert.deepEqual(seen.packs.at(-1).dropped.map((d) => d.id), ['sample'], 'still listed with its reason, the other notices gone');
  await t.packOp({ op: 'remove', id: 'second' });
  assert.deepEqual(JSON.parse(mem.get(KEY)).map((p) => p.id), ['sample'], 'a removal keeps it too');
  assert.match((await rejected(t.packOp({ op: 'discard', id: 'nope' }))).error, /not kept/);
  await t.packOp({ op: 'discard', id: 'sample' });
  assert.deepEqual(JSON.parse(mem.get(KEY)), []);
  assert.equal(seen.packs.at(-1).dropped, undefined);
  // adding the same pack again replaces the dropped record
  mem.set(KEY, JSON.stringify([forged]));
  const again = open();
  await again.t.packOp({ op: 'add', pack: SAMPLE });
  kept = JSON.parse(mem.get(KEY));
  assert.equal(kept.length, 1); assert.equal(kept[0].hash, record().hash);
  assert.equal(again.seen.packs.at(-1).dropped, undefined);
});

test('when the dropped records would take the room, a new add is refused with a sentence rather than erasing them', async () => {
  fresh();
  const fat = { ...record(), id: 'fat', hash: '0'.repeat(64), data: { filler: 'x'.repeat(Math.floor(T.SOLO_PACKS_MAX * 0.999)) } };
  mem.set(KEY, JSON.stringify([fat]));
  const { t } = open();
  const before = mem.get(KEY);
  const e = await rejected(t.packOp({ op: 'add', pack: SAMPLE }));
  assert.match(e.error, /more room than the packs may/);
  assert.match(e.error, /“fat”/);
  assert.equal(mem.get(KEY), before, 'nothing was written');
  assert.deepEqual((await t.export()).state.packs, []);
});
