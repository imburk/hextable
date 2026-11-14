// The formation popup's pure part (formation.js): who is offered, what each preset shows, what a drop does, what OK sends, why a control is greyed.
// Laid beside the rules in a temporary folder, as actionpanel.test.js does. Run with the rest by `npm test`.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'formation-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const F = await import(pathToFileURL(join(tmp, 'formation.js')));
const { apply } = await import(pathToFileURL(join(tmp, 'shared/engine.js')));
const { newGame } = await import(pathToFileURL(join(tmp, 'shared/scenario.js')));
const { rankExplore } = await import(pathToFileURL(join(tmp, 'actionpanel.js')));

const DM = { role: 'dm', userId: 'dm' };
const led = () => { const s = newGame(7); const r = apply(s, { type: 'partyFollow', leader: 'fighter' }, DM); assert.ok(r.ok, r.error); return s; };

test('followers: only those the engine would place (following, living, not hidden), in marching order', () => {
  const s = led(), ids = F.followersOf(s, 'fighter').map((x) => x.id);
  assert.ok(ids.length >= 2 && !ids.includes('fighter'));
  const gone = ids[0]; s.entities[gone].hidden = true;
  assert.ok(!F.followersOf(s, 'fighter').some((x) => x.id === gone), 'a hidden creature is not offered');
  s.entities[ids[1]].dead = true;
  assert.ok(!F.followersOf(s, 'fighter').some((x) => x.id === ids[1]), 'a dead one is not offered');
});

test('presets show the engine\'s own places; the column is single file', () => {
  const s = led(), l = s.entities.fighter, ids = F.followersOf(s, l.id).map((x) => x.id);
  const pairs = F.shownSlots(s, l, 'pairs').slots;
  assert.deepEqual(Object.keys(pairs), ids);
  assert.deepEqual(pairs[ids[0]], { back: 0, side: 1 });
  assert.ok(Object.values(F.shownSlots(s, l, 'column').slots).every((x) => x.side === 0));
  assert.equal(F.currentShape(l), 'held');
});

test('place: swap with an occupant, never the leader\'s cell, never out of range', () => {
  const slots = { a: { back: 1, side: 0 }, b: { back: 1, side: 1 } };
  assert.deepEqual(F.place(slots, 'a', 1, 1), { a: { back: 1, side: 1 }, b: { back: 1, side: 0 } });
  assert.deepEqual(F.place(slots, 'a', 3, -2).a, { back: 3, side: -2 });
  assert.equal(F.place(slots, 'a', 0, 0), null);
  assert.equal(F.place(slots, 'a', -1, 0), null, 'nothing ahead of the leader');
  assert.equal(F.place(slots, 'a', 13, 0), null);
  assert.equal(F.place(slots, 'zz', 1, 1), null);
  assert.deepEqual(slots.a, { back: 1, side: 0 }, 'the input is not changed');
});

test('OK sends the engine\'s action, and the engine takes both', () => {
  const s = led(), l = s.entities.fighter;
  assert.equal(F.sendFor(l, { shape: 'held', slots: {}, edited: false }), null, 'nothing changed: nothing sent');
  const a = F.sendFor(l, { shape: 'pairs', slots: {}, edited: false });
  assert.deepEqual(a, { type: 'formation', leader: 'fighter', shape: 'pairs' });
  assert.ok(apply(s, a, DM).ok);
  const ids = F.followersOf(s, 'fighter').map((x) => x.id);
  const slots = F.place(F.shownSlots(s, s.entities.fighter, 'pairs').slots, ids[0], 2, -2);
  const b = F.sendFor(s.entities.fighter, { shape: 'pairs', slots, edited: true });
  const r = apply(s, b, DM); assert.ok(r.ok, r.error);
  assert.equal(s.entities.fighter.formation.shape, 'custom');
  assert.deepEqual(s.entities.fighter.formation.slots[ids[0]], { back: 2, side: -2 });
});

test('greyed reasons', () => {
  const s = newGame(7), e = s.entities.fighter;
  assert.equal(F.formationWhy(s, e, { mine: true }), '');
  assert.match(F.formationWhy(s, e, { mine: false }), /Only the DM or .*'s player can lead/);
  assert.equal(F.whyNoFormation(s, e, { mine: true }), `${e.name} isn't leading anyone.`);
  for (const x of Object.values(s.entities)) if (x.side === 'party' && x.id !== e.id) x.dead = true;
  assert.equal(F.formationWhy(s, e, { mine: true }), 'Nobody else in the party can follow.');
  const f = newGame(7); apply(f, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 8 }, DM);
  assert.equal(F.formationWhy(f, f.entities.fighter, { mine: true }), 'Nobody falls into line in a fight.');
});

test('Explore: Lead for a player outside a fight, Formation... once someone follows, neither in a fight', () => {
  const s = newGame(7), e = s.entities.fighter, ids = (r) => r.map((x) => x.id);
  assert.ok(ids(rankExplore(s, e, { dm: false })).includes('lead'));
  assert.ok(!ids(rankExplore(s, e, { dm: false })).includes('formation'));
  const l = led();
  assert.ok(ids(rankExplore(l, l.entities.fighter, { dm: false })).includes('formation'));
  const f = newGame(7); apply(f, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 8 }, DM);
  assert.ok(!ids(rankExplore(f, f.entities.fighter, { dm: false })).some((x) => x === 'lead' || x === 'formation'));
});

test('ghosts: cells of the places, none until the leader has a facing', () => {
  const s = led(), l = s.entities.fighter, { slots } = F.shownSlots(s, l, 'pairs');
  l.formation = { ...(l.formation ?? { shape: 'held' }) }; delete l.formation.face;
  assert.deepEqual(F.ghostCells(s, l, slots), []);
  l.formation.face = 0;
  const g = F.ghostCells(s, l, slots);
  assert.ok(g.length >= 1 && g.every((k) => /^-?\d+,-?\d+/.test(k)));
});
