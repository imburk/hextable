// Refresh from sheet, the client's part (issue #486, part 4): what the DM is told, and the note under the button. The engine's refusal is the engine's:
// these tests run the real `refresh` and check that the client shows its words and makes none of its own.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'refresh-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const imp = (f) => import(pathToFileURL(join(tmp, f)));
const { refreshReport, refreshNote } = await imp('refresh.js');
const { apply } = await imp('shared/engine.js');
const { newGame } = await imp('shared/scenario.js');

const DM = { role: 'dm', userId: 'dm' };
const names = (s) => (id) => s.entities[id]?.name ?? 'Someone';
const built = (s) => {
  const sheet = { name: 'Gru', class: 'fighter', level: 3, subclass: 'champion', abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 8, cha: 8 }, skills: ['athletics', 'perception'], choices: { 'fighting-style': 'defense' }, weapons: [] };
  const r = apply(s, { type: 'setSheet', sheet }, DM); assert.ok(r.ok, r.error);
  const id = r.events.findLast((x) => x.type === 'spawned').id; assert.ok(s.entities[id].sheet, 'a built character keeps its sheet'); return id;
};

test('one character: the report names who was made again', () => {
  const s = newGame(7), id = built(s);
  const r = apply(s, { type: 'refresh', actor: id }, DM); assert.ok(r.ok, r.error);
  assert.equal(refreshReport(r.events, names(s)), 'Gru was made again from the sheet.');
});

test('a hand-typed character is refused in the engine\'s words, and those words are the note', () => {
  const s = newGame(7), typed = s.entities.rogue; delete typed.sheet;      // the starters are built from sheets now: take the rogue's away to have one typed in by hand
  const r = apply(s, { type: 'refresh', actor: typed.id }, DM);
  assert.equal(r.ok, false);
  assert.match(r.error, /typed in by hand/);
  assert.equal(refreshNote(r.error), r.error);
  assert.match(refreshNote(''), /saved sheet/);
});

test('the party: those remade are listed, and those skipped are named with a pointer to the log', () => {
  const s = newGame(7), id = built(s);
  const r = apply(s, { type: 'refresh' }, DM); assert.ok(r.ok, r.error);
  const say = refreshReport(r.events, names(s), { party: true });
  assert.match(say, /^Made again from their sheets: .*Gru/);
  const skipped = [{ type: 'manual', actor: id, name: 'Brenna', partial: true, text: 'Not refreshed from its sheet. Brenna is in the form of a Wolf.' }];
  assert.equal(refreshReport(skipped, names(s), { party: true }), 'Nobody was made again. Not refreshed: Brenna. The log says why.');
});

test('events that are not a refresh say nothing', () => {
  assert.equal(refreshReport([{ type: 'rested' }, { type: 'manual', text: 'The DM decides.' }], () => 'X', { party: true }), '');
});

test('a player is refused by the engine', () => {
  const s = newGame(7), id = built(s);
  const r = apply(s, { type: 'refresh', actor: id }, { role: 'player', userId: 'p' });
  assert.equal(r.ok, false); assert.match(r.error, /Only the DM/);
});
