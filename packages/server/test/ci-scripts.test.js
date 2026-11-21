// The deploy checks in scripts/ci (review R1, #617): the live-version decision is a pure function, so it is tested here.
// (check-image.mjs needs the built image; CI's docker workflow runs it.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, report, TITLE } from '../../../scripts/ci/live-check.mjs';

const SHA = '0123456789abcdef0123456789abcdef01234567';
const at = (min) => new Date(Date.parse('2026-11-20T12:00:00Z') + min * 60_000);
const main = { sha: SHA, when: at(0) };
const site = (name, commit, error) => ({ name, url: `https://${name}/build.json`, commit, error });

test('live check: a matching 7-character commit is fine at any age', () => {
  const v = decide({ main, results: [site('a', SHA.slice(0, 7)), site('b', SHA)], now: at(300) });
  assert.deepEqual(v.mismatches, []);
  assert.equal(v.stale, false);
});

test('live check: a differing commit is not reported until main has been the head for 20 minutes', () => {
  const results = [site('a', SHA.slice(0, 7)), site('b', 'deadbee')];
  assert.equal(decide({ main, results, now: at(19) }).stale, false);
  const v = decide({ main, results, now: at(20) });
  assert.equal(v.stale, true);
  assert.deepEqual(v.mismatches.map((m) => m.name), ['b']);
});

test('live check: a site that does not answer, or has no commit, counts as differing', () => {
  const v = decide({ main, results: [site('a', undefined, 'HTTP 502'), site('b', null)], now: at(60) });
  assert.equal(v.stale, true);
  assert.equal(v.mismatches.length, 2);
  assert.match(v.mismatches[0].why, /HTTP 502/);
});

test('live check: the issue text names both shas', () => {
  const now = at(45), v = decide({ main, results: [site('railway', 'deadbee')], now });
  const text = report({ main, ...v, now });
  assert.ok(text.includes(SHA) && text.includes('deadbee'));
  assert.equal(TITLE, 'Live site is not the merged version');
});

// ---- the errors check of the live-check script (#689) ----
import { checkErrors, ERRORS_TITLE, errorsReport, healthRise } from '../../../scripts/ci/live-check.mjs';

const NOW = new Date('2026-11-21T12:00:00Z');
const health = (over = {}) => ({ ok: true, uptime: 3600, crashes: 0, crashesByType: {}, clientErrors: 0, clientErrorsByType: {}, build: 'c1d5069', ...over });

test('healthRise: no rise when the counts are the same, a rise by type when they grew, and a restart makes everything new', () => {
  const quiet = healthRise({ health: health(), marker: null, now: NOW });
  assert.equal(quiet.rose, false);
  const first = healthRise({ health: health({ crashes: 2, crashesByType: { cast: 2 }, clientErrors: 1, clientErrorsByType: { error: 1 } }), marker: null, now: NOW });
  assert.equal(first.rose, true);
  assert.deepEqual(first.delta, { crashes: 2, clientErrors: 1 });
  const later = new Date(NOW.getTime() + 1_800_000);
  const same = healthRise({ health: health({ uptime: 3600 + 1800, crashes: 2, crashesByType: { cast: 2 }, clientErrors: 1, clientErrorsByType: { error: 1 } }), marker: first.now, now: later });
  assert.equal(same.rose, false, 'the same process, the same counts');
  const grew = healthRise({ health: health({ uptime: 5400, crashes: 3, crashesByType: { cast: 2, move: 1 }, clientErrors: 1, clientErrorsByType: { error: 1 } }), marker: first.now, now: later });
  assert.deepEqual(grew.delta, { crashes: 1, clientErrors: 0 });
  assert.deepEqual(grew.byType.crashes, [['move', 1, 1]]);
  const restarted = healthRise({ health: health({ uptime: 60, crashes: 1, crashesByType: { cast: 1 } }), marker: first.now, now: later });
  assert.equal(restarted.restarted, true);
  assert.deepEqual(restarted.delta, { crashes: 1, clientErrors: 0 }, 'a new process counts from zero: fewer than the marker is still new');
});

// A fake GitHub: issues and their comments, as checkErrors reads and writes them.
function fakeGitHub(issues = []) {
  const posts = [];
  const gh = async (path) => {
    if (path.startsWith('/issues?')) return issues;
    const m = /^\/issues\/(\d+)\/comments/.exec(path);
    return issues.find((i) => i.number === Number(m[1]))?.comments ?? [];
  };
  const send = async (method, path, body) => {
    posts.push({ method, path, body });
    if (path === '/issues') { const i = { number: 300 + posts.length, title: body.title, state: 'open', body: body.body, comments: [] }; issues.unshift(i); return i; }
    issues.find((i) => i.number === Number(/\d+/.exec(path)[0])).comments.push({ body: body.body });
    return {};
  };
  return { gh, send, posts, issues };
}

test('checkErrors opens "Live site errors" on a rise, comments on it for the next, and stays quiet with no rise', async () => {
  const f = fakeGitHub();
  let h = health({ crashes: 1, crashesByType: { cast: 1 } });
  const run = (at) => checkErrors({ gh: f.gh, send: f.send, healthUrl: 'x', dry: false, now: at, fetchHealth: async () => h });
  assert.match(await run(NOW), /opened #/);
  assert.equal(f.posts[0].body.title, ERRORS_TITLE);
  assert.match(f.posts[0].body.body, /<!-- live-errors: \{/);
  assert.match(f.posts[0].body.body, /`cast`: \+1/);
  const t2 = new Date(NOW.getTime() + 1_800_000);
  h = health({ uptime: 5400, crashes: 1, crashesByType: { cast: 1 } });
  assert.match(await checkErrors({ gh: f.gh, send: f.send, healthUrl: 'x', dry: false, now: t2, fetchHealth: async () => h }), /no rise/);
  assert.equal(f.posts.length, 1, 'nothing written when nothing rose');
  h = health({ uptime: 5400, crashes: 1, crashesByType: { cast: 1 }, clientErrors: 3, clientErrorsByType: { error: 2, rejection: 1 } });
  assert.match(await checkErrors({ gh: f.gh, send: f.send, healthUrl: 'x', dry: false, now: t2, fetchHealth: async () => h }), /commented on #/);
  assert.equal(f.posts.length, 2);
  assert.equal(f.posts[1].path, `/issues/${f.issues[0].number}/comments`);
  assert.match(f.posts[1].body.body, /Browser errors: \+3/);
  // Closed by the lead after reading: the next rise opens a new one, counted from the last marker.
  f.issues[0].state = 'closed';
  h = health({ uptime: 5400, crashes: 1, crashesByType: { cast: 1 }, clientErrors: 4, clientErrorsByType: { error: 3, rejection: 1 } });
  assert.match(await checkErrors({ gh: f.gh, send: f.send, healthUrl: 'x', dry: false, now: t2, fetchHealth: async () => h }), /opened #/);
  assert.match(f.posts[2].body.body, /Browser errors: \+1 /);
});

test('checkErrors leaves an unreadable or old health alone, and a dry run touches nothing', async () => {
  const f = fakeGitHub();
  assert.match(await checkErrors({ gh: f.gh, send: f.send, healthUrl: 'x', now: NOW, fetchHealth: async () => { throw new Error('HTTP 502'); } }), /not checked/);
  assert.match(await checkErrors({ gh: f.gh, send: f.send, healthUrl: 'x', now: NOW, fetchHealth: async () => ({ ok: true, uptime: 5 }) }), /not checked/);
  assert.match(await checkErrors({ gh: f.gh, send: f.send, healthUrl: 'x', dry: true, now: NOW, fetchHealth: async () => health({ crashes: 2 }) }), /DRY_RUN/);
  assert.equal(f.posts.length, 0);
  assert.match(errorsReport({ rise: healthRise({ health: health({ crashes: 1 }), marker: null, now: NOW }), health: health(), checked: NOW }), /Engine crashes: \+1/);
});
