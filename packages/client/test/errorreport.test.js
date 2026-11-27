// Error reports from the page (#689): scrubbed, throttled, deduplicated, and never in the way.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createErrorReporter, PER_MINUTE } from '../errorreport.js';

const facts = () => ({ build: 'c1d5069 2026-11-21T10:00:00Z', mode: 'table', screen: { w: 390, h: 844 }, actions: ['move', 'attack', 'say text with spaces', 'cast', 'endTurn', 'dodge', 'dash'] });
const make = (over = {}) => { const sent = []; let t = 1_000_000; const r = createErrorReporter({ facts, send: (x) => sent.push(x), now: () => t, ...over }); return { r, sent, at: (ms) => { t = 1_000_000 + ms; } }; };

test('a report holds the message, stack, build, screen, mode and the last five action types, and nothing else', () => {
  const { r, sent } = make();
  r.report('error', 'x is not a function', 'TypeError: x\n    at f (https://hextable.example/app.js?v=3:10:5)', 'app.js:10');
  assert.equal(sent.length, 1);
  assert.deepEqual(Object.keys(sent[0]).sort(), ['actions', 'build', 'kind', 'message', 'mode', 'screen', 'stack', 'v', 'where']);
  assert.deepEqual(sent[0].actions, ['other', 'cast', 'endTurn', 'dodge', 'dash'], 'the last five, and a type that is not a plain word is "other"');
  assert.deepEqual(sent[0].screen, { w: 390, h: 844 });
  assert.equal(sent[0].mode, 'table');
  assert.ok(!sent[0].stack.includes('hextable.example') && !sent[0].stack.includes('?v=3'), 'addresses are cut to the file name');
  assert.match(sent[0].stack, /app\.js:10:5/);
});

test('names the scrubber knows are replaced in the message and the stack', () => {
  const scrub = (t) => String(t).replace(/Thorin/g, 'Hero 1');
  const { r, sent } = make({ scrub });
  r.report('rejection', 'Cannot find Thorin', 'Error: Thorin\n    at g (app.js:1:1)');
  assert.ok(!JSON.stringify(sent[0]).includes('Thorin'));
  assert.equal(sent[0].kind, 'rejection');
});

test('at most five a minute leave the page, the same error is sent once, and a minute later more may go', () => {
  const { r, sent, at } = make();
  for (let i = 0; i < 20; i++) r.report('error', `error ${i}`, '', 'a.js:1');
  assert.equal(sent.length, PER_MINUTE);
  at(61_000);
  r.report('error', 'error 99', '', 'a.js:1');
  assert.equal(sent.length, PER_MINUTE + 1);
  r.report('error', 'error 99', '', 'a.js:1');
  assert.equal(sent.length, PER_MINUTE + 1, 'a repeat is not sent');
});

test('lengths are cut and a send that throws is swallowed', () => {
  const { r, sent } = make();
  r.report('error', 'm'.repeat(5000), 's'.repeat(9000));
  assert.ok(sent[0].message.length <= 300 && sent[0].stack.length <= 1500);
  const bad = createErrorReporter({ facts, send: () => { throw new Error('socket closed'); } });
  assert.doesNotThrow(() => bad.report('error', 'x'));
  const noFacts = createErrorReporter({ facts: () => { throw new Error('no page'); }, send: () => {} });
  assert.doesNotThrow(() => noFacts.report('error', 'x'));
});
