// Aiming the space of a teleport or chosen-space move (issue #912): what a spell asks, which spaces are tried, and the words.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'destaim-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const imp = (f) => import(pathToFileURL(join(tmp, f)));
const { destOf, askNow, originOf, candidates, offered, destWords, MAX_TRIES } = await imp('destaim.js');
const { SPELLS } = await imp('shared/content/index.js');
const { newGame } = await imp('shared/scenario.js');
const { apply } = await imp('shared/engine.js');

test('Misty Step asks for a space; Fire Bolt does not; chosen is read only when it is there', () => {
  assert.deepEqual(destOf(SPELLS['misty-step']), { kind: 'teleport', feet: 30, see: true });
  assert.equal(destOf(SPELLS['fire-bolt']), null);
  assert.equal(destOf(undefined), null);
  assert.deepEqual(destOf({ chosen: 30 }), { kind: 'chosen', feet: 30 });
  assert.deepEqual(destOf({ chosen: { feet: 30 } }), { kind: 'chosen', feet: 30 });
  assert.equal(destOf({ chosen: 'x' }), null);
});

test('a spell on the caster asks at once; one on a creature asks once its creature is chosen', () => {
  assert.ok(askNow(SPELLS['misty-step'], []));
  assert.ok(!askNow({ aim: 'creature', chosen: 30 }, []));
  assert.ok(askNow({ aim: 'creature', chosen: 30 }, ['x']));
  assert.ok(!askNow(SPELLS['fire-bolt'], ['x']));
});

function world() { const s = newGame(7), e = Object.values(s.entities).find((x) => x.kind === 'pc'); return { s, e }; }

test('the candidates are the spaces on the map within the distance, nearest first, never the origin', () => {
  const { s, e } = world();
  const got = candidates(s, e.pos, 30);
  assert.ok(got.length > 6 && got.length <= MAX_TRIES);
  assert.ok(!got.some((h) => h.q === e.pos.q && h.r === e.pos.r));
  assert.equal(candidates(s, e.pos, 500), null, 'Dimension Door is not tried space by space');
  assert.deepEqual(originOf(s, e, { kind: 'teleport' }, null), e.pos);
  assert.equal(originOf(s, e, { kind: 'chosen' }, null), null);
});

test('offered lights what the engine takes and keeps its first refusal when none is', () => {
  const { s, e } = world();
  const ask = (h) => { const r = apply(structuredClone(s), { type: 'cast', actor: e.id, spell: 'misty-step', hex: { q: h.q, r: h.r } }, { role: 'dm' }); return r.ok ? '' : r.error; };
  const got = offered(s, e.pos, 30, ask);
  assert.ok(got.tried);
  for (const h of got.lit) assert.equal(ask(h), '');
  const none = offered(s, e.pos, 30, () => 'No.');
  assert.deepEqual(none, { lit: [], tried: true, why: 'No.' });
  assert.deepEqual(offered(s, e.pos, 500, () => ''), { lit: [], tried: false, why: '' });
});

test('the words say what is asked', () => {
  assert.equal(destWords('Misty Step', { kind: 'teleport', feet: 30, see: true }), 'Misty Step: tap where you go, up to 30 ft, a space you can see');
  assert.equal(destWords('Telekinesis', { kind: 'chosen', feet: 30 }, { who: 'the goblin' }), 'Telekinesis: tap where it puts the goblin, up to 30 ft from it');
  assert.match(destWords('Misty Step', { kind: 'teleport', feet: 30 }, { chosen: true }), /tap the die/);
  assert.match(destWords('Misty Step', { kind: 'teleport', feet: 30 }, { none: 'Nope.' }), /no space within reach\. Nope\./);
});
