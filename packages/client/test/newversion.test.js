// The comparison behind "A new version is ready" (#646). No DOM here: the banner is checked in a browser; this is its decision.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildId, compareBuilds, shouldOffer, stampOfMeta, chooseLoaded, mountNewVersion } from '../newversion.js';

const A = { commit: 'abc1234', when: '2026-11-19T10:00:00Z' }, B = { commit: 'def5678', when: '2026-11-20T10:00:00Z' };

test('a build is told by its commit, else by its time', () => {
  assert.equal(buildId(A), 'commit:abc1234');
  assert.equal(buildId({ commit: null, when: '2026-11-19T10:00:00Z' }), 'when:2026-11-19T10:00:00Z');
  for (const bad of [null, undefined, 'x', 5, {}, { commit: '' , when: ' ' }, { commit: 7 }]) assert.equal(buildId(bad), null);
});
test('same, different, unknown', () => {
  assert.equal(compareBuilds(A, { ...A, started: 'later' }), 'same');      // other fields (started, subject) do not matter
  assert.equal(compareBuilds(A, B), 'different');
  assert.equal(compareBuilds({ commit: null, when: 'w1' }, { commit: null, when: 'w2' }), 'different');
  assert.equal(compareBuilds(A, null), 'unknown');
  assert.equal(compareBuilds({}, B), 'unknown');
});
test('unknown never offers, and "Later" holds until the build changes again', () => {
  assert.equal(shouldOffer(A, null), false);
  assert.equal(shouldOffer(A, A), false);
  assert.equal(shouldOffer(A, B), true);
  assert.equal(shouldOffer(A, B, buildId(B)), false);
  assert.equal(shouldOffer(A, { commit: 'zzz9999' }, buildId(B)), true);
});

test('commits are compared when both have one, else the build time', () => {
  assert.equal(compareBuilds({ when: 'w1' }, { commit: 'abc1234', when: 'w1' }), 'same', 'a page built without git, a server told its commit by its host');
  assert.equal(compareBuilds({ when: 'w1' }, { commit: 'abc1234', when: 'w2' }), 'different');
  assert.equal(compareBuilds({ commit: 'abc1234', when: 'w1' }, { commit: 'def5678', when: 'w1' }), 'different');
});
test('the page\'s own build is the stamped one, else the first answer', () => {
  assert.deepEqual(stampOfMeta('abc1234|2026-11-19T10:00:00Z'), A);
  assert.deepEqual(stampOfMeta('|2026-11-19T10:00:00Z'), { when: '2026-11-19T10:00:00Z' });
  for (const bad of [null, undefined, '', 'abc|x', 'zzzzzzz|w', 'abc1234', 'abc1234|', '|']) assert.equal(stampOfMeta(bad), null, String(bad));
  assert.deepEqual(chooseLoaded('abc1234|2026-11-19T10:00:00Z', B), A, 'the stamp wins over a newer first answer');
  assert.deepEqual(chooseLoaded(null, B), B, 'no stamp: the first answer');
  assert.equal(chooseLoaded(null, null), null);
  assert.equal(chooseLoaded('junk', {}), null);
});

// The triggers, with a stand-in document that has just what the module uses.
function fakeDoc() {
  const mk = () => ({ children: [], dataset: {}, hidden: false, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, append(...c) { this.children.push(...c); } });
  const listeners = {};
  return { hidden: false, meta: null, querySelector() { return this.meta; }, body: mk(), createElement: mk, addEventListener: (t, f) => { (listeners[t] ??= []).push(f); }, fire: (t) => listeners[t]?.forEach((f) => f()), listeners };
}
test('the first answer is the loaded build; a later different one shows the banner once; Reload reloads; Later hides it', async () => {
  const doc = fakeDoc(); let now = A, reloads = 0;
  const nv = mountNewVersion({ fetchBuild: async () => now, doc, reload: () => reloads++ });
  await nv.check(); assert.equal(doc.body.children.length, 0);
  await nv.onReconnect(); assert.equal(doc.body.children.length, 0, 'same build: nothing');
  now = B; await nv.onReconnect();
  const [banner] = doc.body.children; assert.ok(banner); assert.equal(banner.hidden, false);
  const [text, go, later] = banner.children; assert.equal(text.textContent, 'A new version is ready');
  await nv.check(); assert.equal(doc.body.children.length, 1, 'one banner, not one per check');
  go.onclick(); assert.equal(reloads, 1);
  later.onclick(); assert.equal(banner.hidden, true);
  await nv.check(); assert.equal(banner.hidden, true, 'dismissed for this build');
  now = { commit: 'fff0000' }; await nv.check(); assert.equal(banner.hidden, false, 'yet another build shows again');
});
test('a failing fetch says nothing, and solo checks when the tab is shown', async () => {
  const doc = fakeDoc(); let now = A, fails = false, calls = 0, solo = true;
  const nv = mountNewVersion({ fetchBuild: async () => { calls++; if (fails) throw new Error('offline'); return now; }, doc, reload() {} });
  nv.solo(() => solo); await nv.check();
  fails = true; await nv.check(); assert.equal(doc.body.children.length, 0);
  fails = false; now = B;
  doc.hidden = true; doc.fire('visibilitychange'); assert.equal(calls, 2, 'hidden: no check');
  solo = false; doc.hidden = false; doc.fire('visibilitychange'); assert.equal(calls, 2, 'at a table: the reconnect is the trigger');
  solo = true; doc.fire('visibilitychange'); await new Promise((r) => setTimeout(r, 0)); assert.equal(doc.body.children.length, 1);
});
test('a page stamped with an older build is offered the reload on its first check', async () => {
  const doc = fakeDoc(); doc.meta = { getAttribute: () => 'abc1234|2026-11-19T10:00:00Z' };
  const nv = mountNewVersion({ fetchBuild: async () => B, doc, reload() {} });
  await nv.check(); assert.equal(doc.body.children.length, 1);
});

// A trigger that comes while a check is on its way is not lost (the smoke on CI found it: the first answer was fetched
// before the deploy, and the trigger after the deploy was dropped as "busy", so no banner).
test('a check asked for during another one runs once more afterwards, so a deploy in between is not missed', async () => {
  const doc = fakeDoc(); let now = A, release, calls = 0;
  const nv = mountNewVersion({ fetchBuild: () => { calls++; const v = now; return calls === 2 ? new Promise((r) => { release = () => r(v); }) : Promise.resolve(v); }, doc, reload() {} });
  await nv.check();                                  // loaded = A
  const first = nv.check();                          // on its way, will answer A
  now = B; const second = nv.check();                // the deploy, while the first is on its way
  release(); await first; await second;
  assert.equal(calls, 3, 'the dropped trigger ran once more');
  assert.equal(doc.body.children[0]?.hidden, false, 'the banner shows for B');
  const before = calls; const a = nv.check(), b = nv.check(), c = nv.check(); await Promise.all([a, b, c]);
  assert.ok(calls - before <= 2, 'many triggers at once make at most one more fetch');
});
