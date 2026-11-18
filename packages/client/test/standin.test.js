// The DM's screen plays a character set aside under `standIn` (stage AC2 of docs/specs/ai-casting.md; DEBT T20 (1)): the call it makes to the AI is
// `aiAction` (standin.js), with the table's homebrew overlay installed around it. app.js is not loadable in Node, so what is checked here is that call
// and its decision (`autoPlays`), on the real rules, and that the action it returns is one the engine accepts.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'standin-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const imp = (f) => import(pathToFileURL(join(tmp, f)));
const { aiAction } = await imp('standin.js');
const { autoPlays } = await imp('shared/ai.js');
const { apply, current } = await imp('shared/engine.js');
const { newGame } = await imp('shared/scenario.js');
const { loadPack, overlayOf, installed, using } = await imp('shared/content/registry.js');
const { SPELLS } = await imp('shared/content/index.js');

const DM = { role: 'dm', userId: 'dm' };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const SAMPLE = JSON.parse(readFileSync(join(here, '../../rules/test/fixtures/sample-pack.json'), 'utf8'));
const EMBER = 'hb-sample-ember-dart';

// Seed 1, the fight on, the wizard's turn; the wizard is set aside under standIn, as the DM hands a character to the AI.
function standIn(id = 'wizard') {
  const s = newGame(1);
  ok(apply(s, { type: 'setting', key: 'away', value: 'standIn' }, DM));
  ok(apply(s, { type: 'startEncounter', center: s.entities.fighter.pos, radius: 30 }, DM));
  for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: 'endTurn', actor: current(s) }, DM));
  assert.equal(current(s), id);
  ok(apply(s, { type: 'stepAway', actor: id }, DM));
  return s;
}

test('the DM\'s screen asks autoPlays and nothing else: a stand-in is played, a character not set aside is not', () => {
  const s = standIn();
  assert.equal(autoPlays(s, 'wizard'), true);
  assert.equal(autoPlays(s, 'fighter'), false);
  assert.equal(autoPlays(s, 'm1'), true);
});

test('aiAction gives a stand-in a step the engine accepts, and changes nothing it reads', () => {
  const s = standIn(), before = JSON.stringify(s);
  const a = aiAction(s, 'wizard', {}, null);
  assert.ok(a && a.actor === 'wizard', `a step for the wizard: ${JSON.stringify(a)}`);
  assert.equal(JSON.stringify(s), before, 'the AI never writes to the state');
  ok(apply(s, a, DM));
});

test('a stand-in plays through its whole turn and the turn passes to the next creature', () => {
  const s = standIn();
  for (let i = 0; i < 25 && current(s) === 'wizard'; i++) { const a = aiAction(s, 'wizard', {}, null); assert.ok(a); ok(apply(s, a, DM)); }
  assert.notEqual(current(s), 'wizard', 'the turn ended');
});

test('the table\'s homebrew overlay is installed around the call: the stand-in casts a homebrew spell, and without it does not', () => {
  const loaded = loadPack(SAMPLE);
  assert.ok(loaded.ok, loaded.problems?.[0]);
  const overlay = overlayOf([loaded.pack]);
  assert.equal(SPELLS[EMBER], undefined, 'the pack is not in the rules until its overlay is');
  const s = standIn();
  s.entities.wizard.spells = [EMBER];                 // a cantrip only: the choice is between it and the staff
  s.entities.wizard.slots = {};
  const a = aiAction(s, 'wizard', {}, overlay);
  assert.equal(installed(), null, 'the lookups are back as they were after the call');
  assert.ok(a, 'a step');
  assert.equal(a.type, 'cast', JSON.stringify(a));
  assert.equal(a.spell, EMBER);
  const r = aiAction(s, 'wizard', {}, null);          // the same state, the overlay not installed: the spell is not in the rules, so it is not cast
  assert.ok(!r || r.spell !== EMBER, `no homebrew spell without its overlay: ${JSON.stringify(r)}`);
  // The engine, with the overlay installed as the page's store keeps it, accepts the cast; the dice are the game's, not the client's.
  const r2 = using(overlay, () => apply(s, a, DM));
  ok(r2);
  assert.ok(r2.events.some((e) => e.type === 'cast' && e.name === 'Ember Dart'), 'it cast Ember Dart');
});
