// The log's arrival line (#650), read from app.js's own source (the page cannot be imported): the words, and the name a creature of a parked group goes by.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../app.js'), 'utf8');
const nameSrc = src.match(/^const name = .*$/m)?.[0];
const caseSrc = src.match(/case 'arrived': \{[\s\S]*?\n    \}/)?.[0];
assert.ok(nameSrc && caseSrc, 'app.js has the name function and the arrived case');
const make = (S) => new Function('S', 'known', 'shownName', `${nameSrc}; const n = name; return (ev) => { switch (ev.type) { ${caseSrc} } };`)(S, new Map(), (s, e) => e.name);

test("the arrival line reads one, two and three names, and nothing for a group with none", () => {
  const S = { entities: { a: { name: 'Tor' }, b: { name: 'Mira' }, c: { name: 'Wen' } } };
  const w = make(S);
  assert.deepEqual(w({ type: 'arrived', node: 'pl2', name: 'The keep', ids: ['a'] }), ['Tor arrives at The keep.']);
  assert.deepEqual(w({ type: 'arrived', node: 'pl2', name: 'The keep', ids: ['a', 'b'] }), ['Tor and Mira arrive at The keep.']);
  assert.deepEqual(w({ type: 'arrived', node: 'pl2', name: 'The keep', ids: ['a', 'b', 'c'] }), ['Tor, Mira and Wen arrive at The keep.']);
  assert.equal(w({ type: 'arrived', node: 'pl2', name: 'The keep', ids: [] }), null);
});

test("a creature of a group that is parked now is named from its away sheet, not 'Someone'", () => {
  const S = { entities: {}, away: { a: { node: 'pl2', record: { name: 'Tor' } } } };
  assert.deepEqual(make(S)({ type: 'arrived', node: 'pl2', name: 'The keep', ids: ['a', 'zz'] }), ['Tor and Someone arrive at The keep.']);
});
