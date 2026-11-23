import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BANDS, crLabel, inBand, findMonsters, pushRecent, keepKnown } from '../spawnfind.js';

const M = [
  { id: 'rat', name: 'Giant Rat', type: 'beast', cr: 0.125 },
  { id: 'ghoul', name: 'Ghoul', type: 'undead', cr: 1 },
  { id: 'zombie', name: 'Zombie', type: 'undead', cr: 0.25 },
  { id: 'wolf', name: 'Dire Wolf', type: 'beast', cr: 1 },
  { id: 'ogre', name: 'Ogre', type: 'giant', cr: 2 },
  { id: 'wight', name: 'Wight', type: 'undead', cr: 3 },
  { id: 'dragon', name: 'Adult Red Dragon', type: 'dragon', cr: 17 },
  { id: 'hb-x-blob', name: 'Cinderling', type: 'elemental', cr: 0.5 },
  { id: 'hb-x-odd', name: 'Oddity', type: 'aberration' },
];
const ids = (r) => r.map((m) => m.id);

test('a CR is written the way the books write it', () => {
  assert.deepEqual([0, 0.125, 0.25, 0.5, 1, 10, 30].map(crLabel), ['0', '1/8', '1/4', '1/2', '1', '10', '30']);
  assert.equal(crLabel(undefined), '');
  assert.equal(crLabel(null), '');
});
test('the bands cover every CR once and a creature with no CR is only in All', () => {
  for (const cr of [0, 0.125, 0.25, 0.5, 1, 2, 3, 4, 5, 17, 30]) assert.equal(BANDS.filter((b) => b.id !== 'all' && inBand(cr, b.id)).length, 1, `CR ${cr}`);
  assert.equal(inBand(undefined, 'all'), true);
  assert.equal(inBand(undefined, 'high'), false);
  assert.equal(inBand(0.25, { min: 0.25, max: 0.25 }), true);
});
test('with nothing asked every entry comes back, in order', () => {
  assert.deepEqual(ids(findMonsters(M)), ids(M));
  assert.deepEqual(ids(findMonsters(M, { query: '   ' })), ids(M));
});
test('a search finds names and types, in any case, by part of a word', () => {
  assert.deepEqual(ids(findMonsters(M, { query: 'GHOUL' })), ['ghoul']);
  assert.deepEqual(ids(findMonsters(M, { query: 'undead' })), ['ghoul', 'zombie', 'wight']);
  assert.deepEqual(ids(findMonsters(M, { query: 'dire' })), ['wolf']);
  assert.deepEqual(ids(findMonsters(M, { query: 'wol' })), ['wolf']);
});
test('every word of the search has to match, the name or the type', () => {
  assert.deepEqual(ids(findMonsters(M, { query: 'ghoul undead' })), ['ghoul']);
  assert.deepEqual(ids(findMonsters(M, { query: 'dragon red' })), ['dragon']);
  assert.deepEqual(ids(findMonsters(M, { query: 'ghoul beast' })), []);
});
test('the CR band narrows the search, and homebrew entries are found like any other', () => {
  assert.deepEqual(ids(findMonsters(M, { band: 'low' })), ['rat', 'zombie']);
  assert.deepEqual(ids(findMonsters(M, { band: 'mid' })), ['ghoul', 'wolf', 'hb-x-blob']);
  assert.deepEqual(ids(findMonsters(M, { band: 'two' })), ['ogre', 'wight']);
  assert.deepEqual(ids(findMonsters(M, { band: 'high' })), ['dragon']);
  assert.deepEqual(ids(findMonsters(M, { band: 'mid', query: 'undead' })), ['ghoul']);
  assert.deepEqual(ids(findMonsters(M, { query: 'cinder' })), ['hb-x-blob']);
  assert.deepEqual(ids(findMonsters(M, { query: 'aberration' })), ['hb-x-odd']);
});
test('the recent list puts the newest first, once, six at most', () => {
  assert.deepEqual(pushRecent(['a', 'b'], 'c'), ['c', 'a', 'b']);
  assert.deepEqual(pushRecent(['a', 'b', 'c'], 'b'), ['b', 'a', 'c']);
  assert.deepEqual(pushRecent(['a', 'b', 'c', 'd', 'e', 'f'], 'g'), ['g', 'a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(pushRecent(null, 'a'), ['a']);
  assert.deepEqual(pushRecent('junk', 'a'), ['a']);
});
test('a saved recent list loses what is not here now and anything that is not an id', () => {
  const known = (id) => id !== 'gone';
  assert.deepEqual(keepKnown(['a', 'gone', 'b', 7, null], known), ['a', 'b']);
  assert.deepEqual(keepKnown(null, known), []);
  assert.deepEqual(keepKnown({}, known), []);
});
