// The rewards card (docs/specs/table-ui.md, Decision 4) is drawn from what a viewer is sent. Players get a pending marker, then the
// published record without the base figure, a foe's XP or a foe they did not know of. These words are made from that and nothing else.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'conclusion-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const { foeLine, shares, logLine, xpFact, xpToLevel, readyToLevel, resultLine } = await import(pathToFileURL(join(tmp, 'conclusion.js')));
const { apply } = await import(pathToFileURL(join(tmp, 'shared/engine.js')));
const { newGame } = await import(pathToFileURL(join(tmp, 'shared/scenario.js')));
const { view } = await import(pathToFileURL(join(tmp, 'shared/view.js')));

const DM = { role: 'dm', userId: 'dm' }, PAT = { role: 'player', userId: 'pat' };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };

function won() {
  const s = newGame(11);
  const foe = Object.values(s.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden);
  ok(apply(s, { type: 'startEncounter', center: foe.pos, radius: 40 }, DM));
  for (const e of Object.values(s.entities)) if (e.side === 'foe' && e.hp > 0) ok(apply(s, { type: 'harm', actor: e.id, amount: 999 }, DM));
  return s;
}

test('before publishing a player has a marker and nothing to draw from; after it the words come from the shaped record', () => {
  const s = won();
  assert.equal(s.conclusion.published, false);
  assert.deepEqual(Object.keys(view(s, PAT).conclusion).sort(), ['fight', 'id', 'pending']);
  const pc = Object.values(s.entities).find((e) => e.kind === 'pc');
  ok(apply(s, { type: 'conclusion', edit: { bonus: [{ amount: 50, reason: 'Freed the prisoner' }], loot: { add: [{ name: 'Shortbow', to: pc.id }, { name: '35 gp' }] } } }, DM));
  ok(apply(s, { type: 'conclusion', publish: true }, DM));
  const c = view(s, PAT).conclusion, name = (id) => s.entities[id]?.name;
  assert.equal(c.published, true);
  const sh = shares(c, name);
  assert.notEqual(sh.each, null);
  const line = logLine(c, name);
  assert.match(line, /^The fight is won\. Experience: \d+ XP each, including 50 for Freed the prisoner\. Found: Shortbow \(.+\), 35 gp\.$/);
  assert.match(foeLine(c.foes), /\w/);
  assert.ok(!/\d+ XP/.test(foeLine(c.foes)), 'the foes line carries no XP');
  assert.equal(resultLine({ result: 'ended' }), 'The fight has ended.');
});

test('the same foes are counted together, and XP against the next level reads from the character', () => {
  assert.equal(foeLine([{ name: 'Goblin warrior 1', counts: true }, { name: 'Goblin warrior 2', counts: true }, { name: 'Wolf', counts: true }, { name: 'Ogre', counts: false }]), 'Goblin warrior x2, Wolf');
  const e = { kind: 'pc', level: 3, xp: 1150 };
  assert.equal(xpToLevel(e), '1,150 / 2,700 to level 4');
  assert.match(xpFact(e), /XP 1,150 \/ 2,700/);
  assert.equal(readyToLevel(e), false);
  assert.equal(readyToLevel({ ...e, xp: 2700 }), true);
  assert.equal(xpFact({ kind: 'npc' }), '');
});
