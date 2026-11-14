// newGame's `party` option (issue #308): the heroes of a new solo game, chosen from starters and built sheets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newGame, partyProblems, PARTY_MAX } from '../src/scenario.js';
import { apply } from '../src/engine.js';
import { validate, derive } from '../src/derive.js';
import { migrate } from '../src/migrate.js';

const A = { str: 10, dex: 14, con: 14, int: 10, wis: 12, cha: 10 };
const sheet = (name, over = {}) => ({ name, class: 'fighter', level: 1, abilities: { ...A, str: 16 }, skills: ['athletics', 'perception'], choices: { 'fighting-style': 'defense' }, ...over });
const pcs = (s) => Object.values(s.entities).filter((e) => e.kind === 'pc');

test('no party option: the four starters, as always', () => {
  assert.deepEqual(pcs(newGame(7)).map((e) => e.id), ['fighter', 'rogue', 'cleric', 'wizard']);
  assert.deepEqual(newGame(7, {}), newGame(7));
});

test('a party of built sheets: each hero has its sheet kept, the foes are the valley\'s', () => {
  const fine = sheet('Brin'); assert.deepEqual(validate(fine), []);
  const s = newGame(7, { party: [{ sheet: fine }, { pregen: 'wizard' }, { sheet: sheet('Una', { class: 'wizard', skills: ['arcana', 'history'], choices: undefined, level: 2 }) }] });
  assert.deepEqual(pcs(s).map((e) => e.id), ['pc1', 'wizard', 'pc3']);
  assert.equal(pcs(s)[0].name, 'Brin'); assert.deepEqual(pcs(s)[0].sheet, fine); assert.equal(pcs(s)[0].maxHp, derive(fine).record.hp);
  assert.equal(Object.values(s.entities).filter((e) => e.side === 'foe').length, 6);
  assert.equal(new Set(pcs(s).map((e) => `${e.pos.q},${e.pos.r}`)).size, 3);
});

test('six heroes stand on six different places on hexes and on squares, and the game plays on', () => {
  const party = Array.from({ length: PARTY_MAX }, (_, i) => ({ sheet: sheet(`Hero ${i + 1}`) }));
  for (const grid of ['hex', 'square']) {
    const s = newGame(11, { grid, party });
    assert.equal(pcs(s).length, 6, grid);
    assert.equal(new Set(pcs(s).map((e) => `${e.pos.q},${e.pos.r}`)).size, 6, grid);
    assert.equal(s.map.grid ?? 'hex', grid, grid);
    assert.equal(migrate(structuredClone(s)).version, s.version);
    const r = apply(s, { type: 'chronicle', title: 'x' }, { role: 'dm', userId: 'local' }); assert.ok(r.ok, grid);
    const walk = apply(s, { type: 'move', actor: 'pc1', to: { ...pcs(s)[0].pos, q: pcs(s)[0].pos.q + 1 } }, { role: 'dm', userId: 'local' });
    assert.ok(walk.ok || typeof walk.error === 'string', grid);
  }
});

test('the same seed and party make the same game', () => {
  const party = [{ sheet: sheet('Brin') }, { pregen: 'cleric' }];
  assert.deepEqual(newGame(5, { party }), newGame(5, { party }));
  assert.deepEqual(newGame(5, { grid: 'square', party }), newGame(5, { grid: 'square', party }));
});

test('a bad party is refused whole, with the reason', () => {
  assert.match(partyProblems([])[0], /1 to 6/);
  assert.match(partyProblems(Array.from({ length: 7 }, () => ({ pregen: 'fighter' })))[0], /1 to 6/);
  assert.match(partyProblems([{ pregen: 'fighter' }, { pregen: 'fighter' }])[0], /already/);
  assert.match(partyProblems([{ pregen: 'paladin' }])[0], /no starter/);
  assert.match(partyProblems([{ sheet: sheet('') }])[0], /Character 1: .*name/);
  assert.match(partyProblems([{ sheet: sheet('Hex', { level: 21 }) }])[0], /level/i);
  assert.match(partyProblems([{ sheet: sheet('Hex', { mystery: 1 }) }])[0], /not something a sheet has/);
  assert.match(partyProblems([{}])[0], /neither/);
  assert.throws(() => newGame(7, { party: [{ sheet: sheet('') }] }), /name/);
  assert.throws(() => newGame(7, { grid: 'square', party: [] }), /1 to 6/);
  assert.deepEqual(partyProblems([{ pregen: 'rogue' }, { sheet: sheet('Ok') }]), []);
});
