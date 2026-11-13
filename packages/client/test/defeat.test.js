// The defeat card (docs/specs/table-ui.md, Decision 1) reads the engine's rule `fallen` and shows who died and who is Stable; its choices
// are greyed with the reason the engine would give. The test lays the client beside the rules, as tracker.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'defeat-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const { fallenRows, fallenSummary, choices } = await import(pathToFileURL(join(tmp, 'defeat.js')));
const { apply, fallen } = await import(pathToFileURL(join(tmp, 'shared/engine.js')));
const { newGame } = await import(pathToFileURL(join(tmp, 'shared/scenario.js')));
const { view } = await import(pathToFileURL(join(tmp, 'shared/view.js')));

const DM = { role: 'dm', userId: 'dm' };

test('the rows say died, down and stable, down and dying, for party characters only, from a player view too', () => {
  const s = newGame(3);
  const pcs = Object.values(s.entities).filter((e) => e.side === 'party' && e.kind === 'pc');
  assert.ok(pcs.length >= 3);
  assert.equal(fallen(s), false);
  for (const e of pcs) assert.ok(apply(s, { type: 'harm', actor: e.id, amount: e.hp }, DM).ok);       // all at 0, outside a fight
  assert.equal(fallen(s), true);
  apply(s, { type: 'harm', actor: pcs[0].id, amount: 99 }, DM);
  assert.ok(s.entities[pcs[0].id].dead);
  s.entities[pcs[1].id].cond.stable = true;
  for (const S of [s, view(s, { role: 'player', userId: 'pat' })]) {
    const rows = fallenRows(S);
    assert.equal(rows.length, pcs.length);
    assert.equal(rows[0].how, 'died');
    assert.equal(rows[1].how, 'stable');
    assert.equal(rows[2].how, 'dying');
  }
  assert.match(fallenSummary(fallenRows(s)), new RegExp(`${pcs[0].name} died\\. ${pcs[1].name} is down and stable\\. ${pcs[2].name} is down and dying\\.`));
});

test('the choices: solo words, greyed with the engine\'s reason, an unknown pin is left to the engine', () => {
  const some = choices({ solo: false, pins: { fight: true, rest: false } });
  assert.deepEqual(some.map((c) => c.label), ['Go back to the start of the fight', 'Go back to the last rest', 'Carry on from here']);
  assert.deepEqual(some.map((c) => c.why), ['', 'No rest to go back to.', '']);
  assert.deepEqual(choices({ solo: true, pins: { fight: false, rest: true } }).map((c) => [c.label, c.why]),
    [['Try the fight again', 'No fight to go back to.'], ['Go back to the last rest', ''], ['Carry on', '']]);
  assert.deepEqual(choices({ solo: false }).map((c) => c.why), ['', '', '']);
  const err = choices({ solo: true, pins: {}, pinsError: 'no room' });
  assert.deepEqual(err.map((c) => c.why), ['no room', 'no room', '']);
  for (const c of choices({ solo: false })) assert.ok(!/!/.test(c.label + c.what));
});
