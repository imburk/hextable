// Aiming a spell at a map object (issue #811): which objects are offered (from the player's own view), what a tap means, and the words.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'objectaim-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const imp = (f) => import(pathToFileURL(join(tmp, f)));
const { objectsFor, objectAt, objectOptions, objectWords, noObjectWhy, isObjectAim } = await imp('objectaim.js');
const { SPELLS } = await imp('shared/content/index.js');
const { newGame } = await imp('shared/scenario.js');

const KNOCK = SPELLS.knock;
// A PC in the valley with objects set a given number of hexes east of it.
function world(objs) {
  const s = newGame(7), e = Object.values(s.entities).find((x) => x.kind === 'pc'), level = s.map.levels[0];
  const at = (n) => ({ q: e.pos.q + n, r: e.pos.r });
  s.map.objects = objs.map(([id, def, n, state]) => ({ id, def, level: level.id, at: at(n), state }));
  for (const o of s.map.objects) level.tiles[`${o.at.q},${o.at.r}`] ??= { t: 'grass', h: 0 };
  return { s, e, at };
}

test('Knock is aimed at an object; a creature spell is not', () => {
  assert.ok(isObjectAim(KNOCK));
  assert.ok(!isObjectAim(SPELLS['fire-bolt']));
  assert.ok(!isObjectAim(undefined));
});

test('only objects that can be locked, within the spell\'s range, are offered, nearest first', () => {
  const { s, e } = world([['far', 'chest', 14, 'locked'], ['lever', 'lever', 2, 'off'], ['near', 'chest', 3, 'locked'], ['door', 'door-wooden', 6, 'closed']]);
  // lever has no unlock use; 'far' is 70 ft away, beyond Knock's 60 ft
  const got = objectsFor(s, e, KNOCK);
  assert.deepEqual(got.map((o) => o.id), ['near', 'door']);
  assert.deepEqual(got.map((o) => o.feet), [15, 30]);
  assert.equal(got[0].name, 'Chest');
  assert.equal(got[0].state, 'locked');
});

test('nothing is offered to a blinded caster, or for a spell with another aim', () => {
  const { s, e } = world([['c', 'chest', 3, 'locked']]);
  assert.equal(objectsFor(s, e, KNOCK).length, 1);
  assert.deepEqual(objectsFor(s, e, SPELLS['fire-bolt']), []);
  e.cond = { ...e.cond, blinded: true };
  assert.deepEqual(objectsFor(s, e, KNOCK), []);
});

test('the list is read from the map the player was sent: an object not in it is never offered', () => {
  const { s, e } = world([['seen', 'chest', 3, 'locked'], ['secret', 'chest', 4, 'locked']]);
  s.map.objects = s.map.objects.filter((o) => o.id !== 'secret');       // the table did not send it
  assert.deepEqual(objectsFor(s, e, KNOCK).map((o) => o.id), ['seen']);
});

test('a tap names the object on that hex, or the nearest within one hex; a tap farther off names none', () => {
  const { s, e, at } = world([['a', 'chest', 3, 'locked'], ['b', 'chest', 8, 'locked']]);
  const offers = objectsFor(s, e, KNOCK);
  assert.equal(objectAt(s, offers, at(3)), 'a');
  assert.equal(objectAt(s, offers, at(8)), 'b');
  assert.equal(objectAt(s, offers, { q: at(3).q, r: at(3).r + 1 }), 'a', 'a thumb beside it still means it');
  assert.equal(objectAt(s, offers, at(5)), null);
  assert.equal(objectAt(s, [], at(3)), null);
  assert.equal(objectAt(s, offers, null), null);
});

test('the list for the sheet marks the chosen one and says state and distance; the words follow the choice', () => {
  const { s, e } = world([['a', 'chest', 3, 'locked'], ['b', 'door-wooden', 6, 'closed']]);
  const offers = objectsFor(s, e, KNOCK), opts = objectOptions(offers, 'b');
  assert.deepEqual(opts.map((o) => [o.value, o.on, o.sub]), [['a', false, 'locked, 15 ft'], ['b', true, 'closed, 30 ft']]);
  assert.match(objectWords('Knock', offers, null), /tap one of the lit objects/);
  assert.match(objectWords('Knock', offers.slice(0, 1), null), /tap the lit object/);
  assert.match(objectWords('Knock', offers, 'b'), /the wooden door \(closed, 30 ft\)/);
  assert.match(objectWords('Knock', [], null), /nothing to aim at/);
});

test('the Spells tab says when there is nothing to aim at', () => {
  const w = world([['c', 'chest', 3, 'locked']]);
  assert.equal(noObjectWhy(w.s, w.e, KNOCK), '');
  const none = world([['lever', 'lever', 2, 'off']]);
  assert.match(noObjectWhy(none.s, none.e, KNOCK), /Nothing within 60 ft/);
  assert.equal(noObjectWhy(none.s, none.e, SPELLS['fire-bolt']), '');
});
