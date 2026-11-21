// One seat per window (#625): where the table session is kept, and the single-writer claim for a solo save. Both modules are import-free.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionKeeper, windowStorage, SESSION_KEY, LAST_KEY } from '../windowseat.js';
import { claimWriter } from '../solowriter.js';

const store = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), m }; };
const seat = (code, token, name) => ({ code, token, ...(name && { name }) });

test('a seat is kept in the window, and the device remembers it only as a suggestion', () => {
  const shared = store(), a = store(), b = store();
  const win1 = sessionKeeper({ own: a, shared }), win2 = sessionKeeper({ own: b, shared });
  win1.remember(seat('ABC123', 't1', 'Ann'));
  assert.deepEqual(win1.mine(), seat('ABC123', 't1', 'Ann'));
  assert.equal(win2.mine(), null, 'another window does not sit in that seat');
  assert.deepEqual(win2.suggestion(), seat('ABC123', 't1', 'Ann'));
  assert.equal(shared.getItem(SESSION_KEY), null, 'the old shared key is not used for a seat');
  assert.ok(shared.getItem(LAST_KEY));
});

test('two windows hold two seats; the suggestion follows the last one used', () => {
  const shared = store(), a = store(), b = store();
  const win1 = sessionKeeper({ own: a, shared }), win2 = sessionKeeper({ own: b, shared });
  win1.remember(seat('ABC123', 'dm', 'DM'));
  win2.remember(seat('ABC123', 'pl', 'Pat'));
  assert.equal(win1.mine().token, 'dm');
  assert.equal(win2.mine().token, 'pl');
  assert.equal(win1.suggestion().token, 'pl');
});

test('leaving forgets the window\'s seat, and the suggestion only if it is that same seat', () => {
  const shared = store(), a = store(), b = store();
  const win1 = sessionKeeper({ own: a, shared }), win2 = sessionKeeper({ own: b, shared });
  win1.remember(seat('ABC123', 'dm')); win2.remember(seat('ABC123', 'pl'));
  win1.forget();
  assert.equal(win1.mine(), null);
  assert.equal(win2.mine().token, 'pl', 'the other window keeps its seat');
  assert.equal(win2.suggestion().token, 'pl', 'the suggestion was another window\'s seat: not forgotten');
  win2.forget();
  assert.equal(win2.suggestion(), null);
});

test('a session from an older build, kept in the shared storage, is a suggestion and never a window\'s own seat', () => {
  const shared = store(); shared.setItem(SESSION_KEY, JSON.stringify(seat('OLD111', 'x')));
  const k = sessionKeeper({ own: store(), shared });
  assert.equal(k.mine(), null);
  assert.equal(k.suggestion().code, 'OLD111');
  k.forgetSuggestion();
  assert.equal(k.suggestion(), null);
});

test('nonsense in storage is no seat; a browser without window storage still works for the page\'s life', () => {
  const shared = store(); shared.setItem(LAST_KEY, '{nope'); shared.setItem(SESSION_KEY, '{"code":1}');
  const k = sessionKeeper({ own: null, shared });
  assert.equal(k.mine(), null); assert.equal(k.suggestion(), null);
  k.remember(seat('ZZZ999', 't')); assert.equal(k.mine().code, 'ZZZ999');
  assert.equal(windowStorage({}), null);
  assert.equal(windowStorage({ get sessionStorage() { throw new Error('denied'); } }), null);
  const full = { setItem() { throw new Error('quota'); }, removeItem() {}, getItem: () => null };
  assert.equal(windowStorage({ sessionStorage: full }), null);
  assert.doesNotThrow(() => sessionKeeper({ own: store(), shared: full }).remember(seat('A', 'b')));
});

// ---------- the solo claim ----------
// A fake lock manager: one holder per name, as navigator.locks has with ifAvailable.
const fakeLocks = () => { const held = new Set(); return { held, request: async (name, opts, cb) => { if (held.has(name)) return cb(null); held.add(name); try { return await cb({ name }); } finally { held.delete(name); } } }; };
const none = { retries: 0, BC: null };

test('the first window to claim a solo save gets it, the second is refused, and release lets another in', async () => {
  const locks = fakeLocks();
  const a = await claimWriter('solo', { locks, ...none });
  assert.equal(a.ok, true); assert.equal(a.mode, 'locks');
  const b = await claimWriter('solo', { locks, ...none });
  assert.equal(b.ok, false);
  const other = await claimWriter('solo.copy.x', { locks, ...none });
  assert.equal(other.ok, true, 'a different save is a different claim');
  a.release(); await new Promise((r) => setTimeout(r, 5));
  assert.equal((await claimWriter('solo', { locks, ...none })).ok, true);
});

test('a reload that has not let go yet is waited for once', async () => {
  const locks = fakeLocks();
  const a = await claimWriter('solo', { locks, ...none });
  setTimeout(() => a.release(), 20);
  const b = await claimWriter('solo', { locks, BC: null, retries: 1, retryMs: 80 });
  assert.equal(b.ok, true);
});

// A fake BroadcastChannel: every channel of one name hears the others, not itself.
const fakeBC = () => { const all = new Map(); return class { constructor(n) { this.n = n; this.onmessage = null; (all.get(n) ?? all.set(n, new Set()).get(n)).add(this); } postMessage(d) { for (const c of all.get(this.n)) if (c !== this) queueMicrotask(() => c.onmessage?.({ data: d })); } close() { all.get(this.n).delete(this); } }; };

test('without locks a BroadcastChannel answers who has the save', async () => {
  const BC = fakeBC(), env = { locks: null, BC, wait: 30 };
  const a = await claimWriter('solo', env);
  assert.deepEqual([a.ok, a.mode], [true, 'channel']);
  const b = await claimWriter('solo', env);
  assert.equal(b.ok, false);
  a.release();
  assert.equal((await claimWriter('solo', env)).ok, true);
});

test('with neither locks nor a channel nothing can be checked and the claim succeeds; a failing lock service falls back to the channel', async () => {
  const r = await claimWriter('solo', { locks: null, BC: null });
  assert.deepEqual([r.ok, r.mode], [true, 'none']);
  const broken = { request: () => Promise.reject(new Error('SecurityError')) };
  const BC = fakeBC();
  const a = await claimWriter('solo', { locks: broken, BC, wait: 20 });
  assert.deepEqual([a.ok, a.mode], [true, 'channel']);
  assert.equal((await claimWriter('solo', { locks: broken, BC, wait: 20 })).ok, false);
});
