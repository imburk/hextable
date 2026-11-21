// "Level up" where the player is looking (issue #672): when a character's experience reaches the next level, and the words for why a
// button is off. The engine's `levelUp` is the DM's alone; these words come from what the page is given and name no rule of their own.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'levelup-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const { levelReady, levelUpWhy, levelUpHtml } = await import(pathToFileURL(join(tmp, 'levelup.js')));
const { apply } = await import(pathToFileURL(join(tmp, 'shared/engine.js')));
const { newGame } = await import(pathToFileURL(join(tmp, 'shared/scenario.js')));

const DM = { role: 'dm', userId: 'dm' };

test('a starter is ready for level 2 at 300 XP, not before; a monster never is', () => {
  const s = newGame(5), f = s.entities.fighter;
  assert.equal(levelReady(f), false, 'no XP recorded yet');
  f.xp = 299; assert.equal(levelReady(f), false);
  f.xp = 300; assert.equal(levelReady(f), true);
  assert.equal(levelReady(s.entities.m1), false);
});

test('the DM can level up a ready starter; the reason is empty and the button is live', () => {
  const s = newGame(5), f = s.entities.fighter; f.xp = 300;
  assert.equal(levelUpWhy(s, f, { dm: true }), '');
  const html = levelUpHtml(s, f, { dm: true });
  assert.match(html, /Brenna can reach level 2\./);
  assert.match(html, /<button type="button" class="lu-go" data-levelup="fighter">Level up Brenna<\/button>/);
  assert.doesNotMatch(html, /disabled|lu-why/);
});

test('a player sees the line and a button that is off, with the reason as text on the page', () => {
  const s = newGame(5), f = s.entities.fighter; f.xp = 300;
  const html = levelUpHtml(s, f, { dm: false, tag: 'cc' });
  assert.match(html, /Brenna can reach level 2\./);
  assert.match(html, /data-levelup="fighter" disabled aria-describedby="cc-why-fighter"/);
  assert.match(html, /<p class="lu-why" id="cc-why-fighter">Only the DM levels a character up at this table\. Ask your DM\.<\/p>/);
});

test('nothing is drawn for a character that is not ready', () => {
  const s = newGame(5);
  assert.equal(levelUpHtml(s, s.entities.fighter, { dm: true }), '');
});

test('it says why in the middle of a fight, for a character typed in by hand, and at level 20', () => {
  const s = newGame(5), f = s.entities.fighter; f.xp = 300;
  apply(s, { type: 'startEncounter', center: s.entities.m1.pos, radius: 40 }, DM);
  assert.match(levelUpWhy(s, f, { dm: true }), /can't level up in the middle of a fight\. It waits until the fight is over\./);
  const t = newGame(5), r = t.entities.rogue; delete r.sheet; r.xp = 300;
  assert.match(levelUpWhy(t, r, { dm: true }), /typed in by hand and has no build sheet/);
  const w = newGame(5), g = w.entities.wizard; g.level = 20; g.xp = 355000;
  assert.match(levelUpWhy(w, g, { dm: true }), /level 20/);
  assert.match(levelUpHtml(t, r, { dm: true }), /disabled/);
});

test('a name with markup in it is escaped', () => {
  const s = newGame(5), f = s.entities.fighter; f.xp = 300; f.name = '<b>"Bren"</b>';
  const html = levelUpHtml(s, f, { dm: true });
  assert.doesNotMatch(html, /<b>/); assert.match(html, /&lt;b&gt;/);
});
