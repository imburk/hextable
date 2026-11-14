// The connection judgement (linkquality.js) is pure: samples in, one of good / shaky / lost out, with hysteresis. No DOM here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINK, LINK_FAST, start, step, explain, seenState, seconds } from '../linkquality.js';
import { dotHTML, rowDotHTML } from '../linkdot.js';

let t = 0;
const run = (m, samples, cfg = LINK) => samples.reduce((a, s) => step(a, { t: (t += 4000), flaps: 0, ...s }, cfg), m);
const ok = (rtt) => ({ kind: 'ok', rtt }), miss = { kind: 'miss' }, down = (o = {}) => ({ kind: 'down', ...o });
const states = (samples, cfg = LINK) => { let m = start(); return samples.map((s) => (m = step(m, { t: (t += 4000), flaps: 0, ...s }, cfg)).state); };

test('fast replies stay good', () => {
  assert.deepEqual(states([ok(40), ok(90), ok(60), ok(120)]), ['good', 'good', 'good', 'good']);
});

test('one slow reply or one missed reply does not change the state (no flicker)', () => {
  assert.deepEqual(states([ok(40), ok(2000), ok(50), miss, ok(50), ok(60)]), Array(6).fill('good'));
});

test('two slow samples in a row make it shaky, and it takes three good ones to recover', () => {
  assert.deepEqual(states([ok(1200), ok(1300), ok(100), ok(100), ok(100)]), ['good', 'shaky', 'shaky', 'shaky', 'good']);
});

test('a bad sample in the middle of a recovery starts the run again', () => {
  assert.deepEqual(states([ok(1200), ok(1300), ok(100), ok(100), ok(900), ok(100), ok(100), ok(100)]), ['good', 'shaky', 'shaky', 'shaky', 'shaky', 'shaky', 'shaky', 'good']);
});

test('missed replies: shaky at two, lost after three in a row', () => {
  assert.deepEqual(states([miss, miss, miss, miss]), ['good', 'shaky', 'shaky', 'lost']);
});

test('a reply ends the run of misses', () => {
  const m = run(start(), [miss, miss, ok(50)]);
  assert.equal(m.misses, 0);
});

test('the socket being down is lost after two samples, and it comes back through shaky only if the replies say so', () => {
  assert.deepEqual(states([down(), down(), ok(50), ok(50), ok(50)]), ['good', 'lost', 'lost', 'lost', 'good']);
  assert.deepEqual(states([down(), down(), ok(2000), ok(2000), ok(2000)]), ['good', 'lost', 'lost', 'lost', 'shaky']);
});

test('reconnecting often is shaky however fast the replies are', () => {
  let m = start();
  for (let i = 0; i < 3; i++) m = step(m, { t: i, kind: 'ok', rtt: 30, flaps: 3 });
  assert.equal(m.state, 'shaky');
  assert.match(explain(m).text, /dropped 3 times/);
  for (let i = 0; i < 3; i++) m = step(m, { t: 10 + i, kind: 'ok', rtt: 30, flaps: 1 });
  assert.equal(m.state, 'good');
});

test('step leaves the judgement it was given as it was', () => {
  const m = start(), before = JSON.stringify(m);
  step(m, { t: 1, kind: 'miss', flaps: 0 });
  assert.equal(JSON.stringify(m), before);
});

test('the thresholds are the ones in LINK, and LINK_FAST changes the clock and nothing else about the rules', () => {
  const fast = { ...LINK_FAST, slowMs: LINK.slowMs, needWorse: LINK.needWorse };
  assert.deepEqual(states([ok(1200), ok(1300)], fast), ['good', 'shaky']);
  assert.ok(LINK_FAST.pingMs < LINK.pingMs && LINK_FAST.staleMs < LINK.staleMs);
  for (const k of ['slowMs', 'lostMisses', 'needWorse', 'needBetter', 'flapCount']) assert.equal(LINK_FAST[k], LINK[k], k);
});

test('plain words for each state', () => {
  assert.equal(explain(run(start(), [ok(1200), ok(1240)])).text, 'Slow replies from the table: about 1.2\u00a0s');
  assert.equal(explain(run(start(), [down({ attempt: 3 }), down({ attempt: 3 })])).text, 'Reconnecting, attempt 3');
  assert.match(explain(run(start(), [down({ offline: true }), down({ offline: true })])).text, /offline/);
  assert.match(explain(run(start(), [miss, miss, miss, miss])).text, /^No answer from the table for about 16 s/);
  assert.equal(explain(run(start(), [ok(80), ok(100)])).text, 'Connected. Replies in about 90\u00a0ms');
  assert.deepEqual(['good', 'shaky', 'lost'].map((s) => explain({ ...start(), state: s, misses: 1, rtts: [5] }).label), ['Good', 'Shaky', 'Lost']);
  assert.equal(seconds(950), '950\u00a0ms'); assert.equal(seconds(2500), '2.5\u00a0s');
});

test("the DM's view of a player: the report, the lobby and the clock", () => {
  const now = 100000, rep = (state, age = 1000, rtt) => ({ state, rtt, at: now - age });
  assert.equal(seenState(rep('good'), true, now).state, 'good');
  assert.equal(seenState(rep('shaky', 1000, 1500), true, now).text, 'Shaky: replies in about 1.5\u00a0s');
  assert.equal(seenState(rep('good'), false, now).state, 'lost');               // the server says they are not at the table
  assert.equal(seenState(null, true, now).state, 'lost');                        // never heard
  assert.equal(seenState(rep('good', LINK.staleMs + 1), true, now).state, 'lost'); // gone quiet
  assert.equal(seenState(rep('good', 1000), undefined, now).state, 'good');      // the lobby has not said: the report stands
  assert.equal(seenState(rep('nonsense'), true, now).state, 'lost');
});

test('each state has its own shape, a word where it is not good, and a label', () => {
  const shapes = ['good', 'shaky', 'lost'].map((s) => dotHTML(s).match(/<svg[^]*<\/svg>/)[0]);
  assert.equal(new Set(shapes).size, 3);
  assert.match(dotHTML('shaky', { who: 'Pip', text: 'Slow' }), /aria-label="Pip: Connection shaky\. Slow"/);
  assert.doesNotMatch(rowDotHTML('good', 'Pip', ''), /ld-word/);
  assert.match(rowDotHTML('lost', 'Pip', ''), /ld-word[^>]*>Lost/);
  assert.doesNotMatch(dotHTML('good', { who: '<b>' }), /<b>/);                   // names are escaped
});
