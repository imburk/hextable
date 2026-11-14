// The log by combat (docs/specs/table-ui.md, Decision 5): groups, summaries, rounds, filters, lazy load, and what a player was sent.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'logview-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const L = await import(pathToFileURL(join(tmp, 'logview.js')));
const { apply } = await import(pathToFileURL(join(tmp, 'shared/engine.js')));
const { newGame } = await import(pathToFileURL(join(tmp, 'shared/scenario.js')));
const { viewEvents } = await import(pathToFileURL(join(tmp, 'shared/view.js')));

const DM = { role: 'dm', userId: 'dm' }, PAT = { role: 'player', userId: 'pat' };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
// Words stand in for the app's describe: the type, and the kind the log gives it.
const line = (ev) => (['xp', 'conclusionEdited'].includes(ev.type) ? null : [ev.type + (ev.text ? ` ${ev.text}` : ''), '', L.kindOf(ev)]);
const feed = (m, evs, clock = 0) => { for (const ev of evs) L.add(m, ev, line(ev), m.cursor, { clock }); };
const names = (g) => g.entries.map((e) => e.text);

const start = (fight, where = 'The camp') => ({ type: 'encounterStart', fight, where, order: [] });
const end = (fight, rounds = 2, result = 'victory') => ({ type: 'encounterEnd', fight, rounds, result });

test('a fight is one block with rounds, an outcome and a summary from the conclusion', () => {
  const m = L.createLog();
  feed(m, [{ type: 'check', text: 'search' }, start(7), { type: 'turn', round: 1 }, { type: 'attack' }, { type: 'turn', round: 2 }, { type: 'damage' }, end(7, 2),
    { type: 'xp', id: 'a' }, { type: 'gear', id: 'a', item: 'Rope', why: 'loot' },
    { type: 'conclusion', fight: 7, result: 'victory', rounds: 2, where: 'The camp', party: ['a', 'b'], foes: [{ id: 'g1', name: 'Goblin 1', counts: true }, { id: 'g2', name: 'Goblin 2', counts: true }], xp: { bonus: [], per: { a: 50, b: 50 } }, loot: [{ name: 'Rope', qty: 1, to: 'a' }] },
    { type: 'chronicle', title: 'A fight', tags: ['fight'], fight: 7 }]);
  const g = L.view(m, { nameOf: (id) => id.toUpperCase() });
  assert.deepEqual(g.map((x) => x.type), ['explore', 'fight']);
  const f = g[1];
  assert.equal(f.title, 'Fight 1 · The camp · 2 rounds · Won');
  assert.equal(f.sub, 'A and B beat Goblin x2 · 50 XP each · 1 item');
  assert.deepEqual(L.rounds(f.entries).map((r) => r.label), ['Start', 'Round 1', 'Round 2', 'Spoils']);
  assert.ok(!names(f).some((t) => t.startsWith('chronicle')), 'the matching chronicle line is hidden inside the fight');
  assert.ok(f.entries.find((e) => e.type === 'gear').spoils, 'loot of the fight is in its spoils');
});

test('a fight in progress, a lost one, one taken back and a fight with no conclusion show what they have', () => {
  const m = L.createLog();
  feed(m, [start(1, null), { type: 'turn', round: 1 }]);
  assert.equal(L.view(m, {})[0].title, 'Fight 1 · In progress');
  assert.equal(L.view(m, {})[0].open, true);
  feed(m, [end(1, 3, 'defeat')]);
  assert.equal(L.view(m, {})[0].title, 'Fight 1 · 3 rounds · Fell');
  assert.equal(L.view(m, {})[0].sub, '');
  feed(m, [start(2), { type: 'undone', label: 'The fight began' }, { type: 'time' }]);
  const g = L.view(m, {});
  assert.equal(g[1].title, 'Fight 2 · The camp · Taken back');
  assert.equal(g.at(-1).type, 'explore', 'what follows is Exploring again');
});

test('Exploring runs end at the next fight or after an hour of world time', () => {
  const m = L.createLog();
  L.add(m, { type: 'check', t: 480 }, line({ type: 'check' }));
  L.add(m, { type: 'check', t: 500 }, line({ type: 'check' }));
  L.add(m, { type: 'check', t: 700 }, line({ type: 'check' }));
  assert.deepEqual(L.view(m, { clockText: (t) => `t${t}` }).map((g) => [g.title, g.entries.length]), [['Exploring · t480', 2], ['Exploring · t700', 1]]);
});

test('filters keep a fight\'s summary and show inside only what matches; a player has no DM chip', () => {
  const m = L.createLog();
  feed(m, [{ type: 'say', text: 'hi' }, start(1), { type: 'turn', round: 1 }, { type: 'attack' }, { type: 'gear', id: 'a', item: 'Dagger', why: 'drop' }, { type: 'manual', text: 'x' }, end(1)]);
  const loot = L.view(m, { filter: ['loot'], dm: true });
  assert.deepEqual(loot.map((g) => g.type), ['fight'], 'the talk-only run is gone, the fight stays');
  assert.deepEqual(names(loot[0]), ['gear']);
  assert.deepEqual(names(L.view(m, { filter: ['dm'], dm: true })[0]), ['manual x']);
  assert.equal(L.view(m, { filter: ['dm'], dm: false }).at(-1).entries.length, L.view(m, { dm: false }).at(-1).entries.length, 'a player\'s stored DM chip does nothing');
  assert.deepEqual(names(L.view(m, { filter: ['combat'], dm: true })[0]), ['encounterStart', 'turn', 'attack', 'encounterEnd']);
  assert.deepEqual(names(L.view(m, { filter: ['talk'] })[0]), ['say hi']);
});

test('older fights come from their summary events, one collapsed block each, and open to a record when asked', () => {
  const m = L.createLog();
  feed(m, [start(9, 'Now'), end(9, 1)]);
  L.merge(m, [[start(3, 'Old'), line(start(3))], [end(3, 5), line(end(3))], [start(9), line(start(9))], [end(9), line(end(9))]]);
  const g = L.view(m, {});
  assert.deepEqual(g.map((x) => x.title), ['Fight 1 · Old · 5 rounds · Won', 'Fight 2 · Now · 1 round · Won']);
  assert.equal(g[0].loaded, false);
  assert.equal(g[1].loaded, true);
  const rec = [start(3), { type: 'turn', round: 1 }, { type: 'attack' }, { type: 'turn', round: 2 }, { type: 'damage' }, end(3, 5)];
  assert.ok(L.record(m, 3, rec.map((e) => [e, line(e)]), true));
  const f = L.view(m, {})[0];
  assert.equal(f.loaded, true); assert.equal(f.cut, true);
  assert.deepEqual(L.rounds(f.entries).map((r) => r.label), ['Start', 'Round 1', 'Round 2']);
});

test('a batch that begins in the middle of a fight keeps the tail with that fight', () => {
  const m = L.createLog();
  L.seed(m, [{ type: 'turn', round: 3 }, { type: 'attack' }, end(4, 3), { type: 'time' }].map((e) => [e, line(e)]));
  const g = L.view(m, {});
  assert.equal(g[0].type, 'fight'); assert.equal(g[0].loaded, false);
  assert.equal(g[1].type, 'explore');
});

test('a reload rebuilds the same groups: the whole local timeline, or a live stream, read in order', () => {
  const evs = [start(1), { type: 'turn', round: 1 }, { type: 'attack' }, end(1, 1), { type: 'time' }];
  const a = L.createLog(), b = L.createLog();
  feed(a, evs);
  L.seed(b, evs.map((e) => [e, line(e)]));
  assert.deepEqual(L.view(b, {}).map((g) => [g.title, g.entries.map((e) => e.text)]), L.view(a, {}).map((g) => [g.title, g.entries.map((e) => e.text)]));
});

test('from real events: a player\'s log holds only what a player was sent, and the DM chip shows the rest', () => {
  const s = newGame(11);
  const foe = Object.values(s.entities).find((e) => e.side === 'foe' && e.hp > 0 && !e.hidden);
  const all = [];
  const run = (a) => { const r = ok(apply(s, a, DM)); all.push(...r.events.map((e) => ({ t: s.clock, ...e }))); };
  run({ type: 'startEncounter', center: foe.pos, radius: 40 });
  for (const e of Object.values(s.entities)) if (e.side === 'foe' && e.hp > 0) run({ type: 'harm', actor: e.id, amount: 999 });
  const pc = Object.values(s.entities).find((e) => e.kind === 'pc');
  run({ type: 'conclusion', edit: { loot: { add: [{ name: 'Shortbow', to: pc.id }] } } });
  run({ type: 'conclusion', publish: true });
  const seen = viewEvents(all, s, { role: 'player', userId: PAT.userId });
  assert.ok(seen.length < all.length, 'a player is sent fewer events');
  const mine = L.createLog(), dm = L.createLog();
  feed(mine, seen); feed(dm, all);
  const count = (m, dmView) => L.view(m, { dm: dmView }).flatMap((g) => g.entries).length;
  assert.ok(count(mine, false) <= seen.length && count(dm, true) >= count(mine, false));
  assert.ok(!L.view(mine, {}).flatMap((g) => g.entries).some((e) => e.type === 'conclusionReady'), 'the DM\'s own marker never reaches a player');
  const f = L.view(dm, { nameOf: (id) => s.entities[id]?.name })[0];
  assert.equal(f.type, 'fight'); assert.match(f.title, /Won$/); assert.match(f.sub, /XP each · 1 item$/);
  assert.ok(L.view(dm, { filter: ['dm'], dm: true })[0].entries.some((e) => e.type === 'conclusionReady'));
  const fp = L.view(mine, { nameOf: (id) => s.entities[id]?.name })[0];
  assert.match(fp.sub, /1 item$/);
});

test('every kind is one of the five, and html escapes what it draws', () => {
  for (const t of ['attack', 'gear', 'say', 'undone', 'check', 'rewound', 'conclusion']) assert.ok(['combat', 'explore', 'loot', 'talk', 'dm'].includes(L.kindOf({ type: t })));
  const m = L.createLog();
  feed(m, [{ type: 'say', text: '<b>x</b>' }]);
  const h = L.html(L.view(m, {}), { isOpen: () => true });
  assert.ok(h.includes('&lt;b&gt;') && !h.includes('<b>x'));
});
