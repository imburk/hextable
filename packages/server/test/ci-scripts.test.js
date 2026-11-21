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
import { checkErrors, CLIENT_THRESHOLD, ERRORS_LABEL, ERRORS_TITLE, errorsReport, healthRise } from '../../../scripts/ci/live-check.mjs';

const NOW = new Date('2026-11-21T12:00:00Z');
const later = (ms) => new Date(NOW.getTime() + ms);
const health = (over = {}) => ({ ok: true, uptime: 3600, crashes: 0, crashesByType: {}, clientErrors: 0, clientErrorsByType: {}, build: 'c1d5069', ...over });
const BOT = { login: 'github-actions[bot]', type: 'Bot' }, HUMAN = { login: 'mallory', type: 'User' };

test('healthRise: crashes report, browser errors alone only past a threshold and once a day, and each process has its own baseline', () => {
  assert.equal(healthRise({ health: health(), marker: null, now: NOW }).rose, false);
  const first = healthRise({ health: health({ crashes: 2, crashesByType: { cast: 2 }, clientErrors: 1 }), marker: null, now: NOW });
  assert.equal(first.rose, true);
  assert.equal(first.why, 'crashes');
  assert.deepEqual(first.delta, { crashes: 2, clientErrors: 1 });
  const same = healthRise({ health: health({ uptime: 5400, crashes: 2, crashesByType: { cast: 2 }, clientErrors: 1 }), marker: first.marker, now: later(1_800_000) });
  assert.equal(same.rose, false);
  const grew = healthRise({ health: health({ uptime: 5400, crashes: 3, crashesByType: { cast: 2, move: 1 }, clientErrors: 1 }), marker: first.marker, now: later(1_800_000) });
  assert.deepEqual(grew.byType.crashes, [['move', 1, 1]]);
  // Browser errors alone: below the threshold nothing, at it a report, and then not again for a day.
  const few = healthRise({ health: health({ uptime: 5400, crashes: 2, clientErrors: 1 + CLIENT_THRESHOLD - 1 }), marker: first.marker, now: later(1_800_000) });
  assert.equal(few.rose, false);
  const many = healthRise({ health: health({ uptime: 5400, crashes: 2, clientErrors: 1 + CLIENT_THRESHOLD }), marker: first.marker, now: later(1_800_000) });
  assert.deepEqual([many.rose, many.why], [true, 'client']);
  const again = healthRise({ health: health({ uptime: 5400 + 3600, crashes: 2, clientErrors: 1 + 3 * CLIENT_THRESHOLD }), marker: many.marker, now: later(1_800_000 + 3_600_000) });
  assert.equal(again.rose, false, 'not twice in a day');
  const nextDay = healthRise({ health: health({ uptime: 5400 + 86_400, crashes: 2, clientErrors: 1 + 3 * CLIENT_THRESHOLD }), marker: many.marker, now: later(1_800_000 + 86_400_000) });
  assert.equal(nextDay.rose, true);
  // Another process (a restart, or a second instance) starts from zero; the first one's baseline is kept, so it is not counted again when it answers.
  const other = healthRise({ health: health({ uptime: 60, crashes: 1, crashesByType: { cast: 1 } }), marker: first.marker, now: later(1_800_000) });
  assert.equal(other.restarted, true);
  assert.deepEqual(other.delta, { crashes: 1, clientErrors: 0 });
  const back = healthRise({ health: health({ uptime: 3600 + 3600, crashes: 2, crashesByType: { cast: 2 }, clientErrors: 1 }), marker: other.marker, now: later(3_600_000) });
  assert.equal(back.rose, false, 'the first process answers again: its baseline is still there');
});

// A fake GitHub: issues (with their labels, authors and comments) as checkErrors reads and writes them.
function fakeGitHub(issues = []) {
  const posts = [];
  const gh = async (path) => {
    if (path.startsWith('/issues?')) return issues.filter((i) => !path.includes('labels=') || i.labels.includes(new URL(`http://x${path}`).searchParams.get('labels')));
    const m = /^\/issues\/(\d+)\/comments/.exec(path);
    return issues.find((i) => i.number === Number(m[1]))?.comments ?? [];
  };
  const send = async (method, path, body) => {
    posts.push({ method, path, body });
    if (path === '/issues') { const i = { number: 300 + posts.length, title: body.title, state: 'open', body: body.body, labels: body.labels ?? [], user: BOT, comments: [] }; issues.unshift(i); return i; }
    issues.find((i) => i.number === Number(/\d+/.exec(path)[0])).comments.push({ body: body.body, user: BOT });
    return {};
  };
  return { gh, send, posts, issues };
}
const run = (f, h, at, extra = {}) => checkErrors({ gh: f.gh, send: f.send, healthUrl: 'x', dry: false, now: at, fetchHealth: async () => h, ...extra });

test('checkErrors opens a labelled "Live site errors" issue on a crash, comments on it, and stays quiet otherwise', async () => {
  const f = fakeGitHub();
  assert.match(await run(f, health({ crashes: 1, crashesByType: { cast: 1 } }), NOW), /opened #/);
  assert.equal(f.posts[0].body.title, ERRORS_TITLE);
  assert.deepEqual(f.posts[0].body.labels, [ERRORS_LABEL]);
  assert.match(f.posts[0].body.body, /`cast`: \+1/);
  assert.match(await run(f, health({ uptime: 5400, crashes: 1, crashesByType: { cast: 1 } }), later(1_800_000)), /nothing to report/);
  assert.equal(f.posts.length, 1);
  assert.match(await run(f, health({ uptime: 5400, crashes: 2, crashesByType: { cast: 2 }, clientErrors: 3 }), later(1_800_000)), /commented on #/);
  assert.match(f.posts[1].body.body, /Browser errors: \+3/);
  assert.match(await run(f, health({ uptime: 5400, crashes: 2, crashesByType: { cast: 2 }, clientErrors: 5 }), later(1_800_000)), /nothing to report/, 'a few browser errors do not open or comment');
  f.issues[0].state = 'closed';
  assert.match(await run(f, health({ uptime: 7200, crashes: 3, crashesByType: { cast: 3 }, clientErrors: 5 }), later(3_600_000)), /opened #/);
  assert.match(f.posts[2].body.body, /Engine crashes: \+1 /);
});

test('checkErrors trusts only the Actions bot: a planted issue or marker is ignored, and the issue is found by its label', async () => {
  const planted = { number: 9, title: ERRORS_TITLE, state: 'open', labels: [ERRORS_LABEL], user: HUMAN, body: '<!-- live-errors: {"procs":[{"start":"2026-11-21T11:00:00.000Z","crashes":999,"clientErrors":999}]} -->', comments: [] };
  const f = fakeGitHub([planted]);
  assert.match(await run(f, health({ crashes: 1 }), NOW), /opened #/, 'a human\'s issue is not ours: a new one is opened');
  const mine = f.issues[0];
  mine.comments.push({ user: HUMAN, body: '<!-- live-errors: {"procs":[{"start":"' + new Date(NOW - 3_600_000).toISOString() + '","crashes":999,"clientErrors":0}]} -->' });
  assert.match(await run(f, health({ uptime: 5400, crashes: 2 }), later(1_800_000)), /commented on #/, 'a human\'s comment marker does not hide the rise');
  const unlabelled = fakeGitHub([{ ...planted, user: BOT, labels: [], body: '' }]);
  assert.match(await run(unlabelled, health({ crashes: 1 }), NOW), /opened #/, 'found by label, not by title');
});

test('checkErrors leaves an unreadable or old health alone, and a dry run touches nothing', async () => {
  const f = fakeGitHub();
  assert.match(await run(f, null, NOW, { fetchHealth: async () => { throw new Error('HTTP 502'); } }), /not checked/);
  assert.match(await run(f, { ok: true, uptime: 5 }, NOW), /not checked/);
  assert.match(await run(f, health({ crashes: 2 }), NOW, { dry: true }), /DRY_RUN/);
  assert.equal(f.posts.length, 0);
  assert.match(errorsReport({ rise: healthRise({ health: health({ crashes: 1 }), marker: null, now: NOW }), health: health(), checked: NOW }), /Engine crashes: \+1/);
});
