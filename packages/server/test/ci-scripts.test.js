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
