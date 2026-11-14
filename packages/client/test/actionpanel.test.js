// The action panel's pure part (docs/specs/table-ui.md, Decision 6): which tabs, when (`panelContext`), what Explore offers first
// (`rankExplore`), and how a pill says it ends. The client imports the rules as ./shared, so the test lays the two side by side in a
// temporary folder, as tracker.test.js does. Run with the rest by `npm test` (it matches packages/*/test/*.test.js).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'actionpanel-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const { panelContext, visibleTabs, defaultTab, rankExplore, howItEnds, statusHtml, reactionState } = await import(pathToFileURL(join(tmp, 'actionpanel.js')));
const { apply, current } = await import(pathToFileURL(join(tmp, 'shared/engine.js')));
const { newGame } = await import(pathToFileURL(join(tmp, 'shared/scenario.js')));

const DM = { role: 'dm', userId: 'dm' };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const ids = (rows) => rows.map((r) => r.id);
const door = (s, at) => s.map.objects.push({ id: 'door', def: 'door-wooden', level: 'ground', at: { q: at.q, r: at.r }, edge: 0, state: 'closed' });

function fight() {
  const s = newGame(7);
  ok(apply(s, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 8 }, DM));
  return s;
}

test('exploring: Explore first, then Spells, Features, Items; the shell draws Explore and All', () => {
  const s = newGame(7), c = panelContext(s, s.entities.cleric);
  assert.equal(c.situation, 'explore'); assert.equal(c.default, 'explore');
  assert.deepEqual(c.tabs.map((t) => t.id), ['explore', 'spells', 'features', 'items']);
  assert.deepEqual(visibleTabs(c).map((t) => t.id), ['explore', 'all']);
  assert.equal(defaultTab(c, visibleTabs(c)), 'explore');
  assert.equal(defaultTab(c, visibleTabs(c), { pref: 'all' }), 'all');
  assert.equal(defaultTab(c, visibleTabs(c), { pref: 'remember', last: { explore: 'all' } }), 'all');
});

test('in a fight: on your turn Attacks (Spells with no attack), on another\'s Reactions', () => {
  const s = fight(), cur = s.entities[current(s)];
  const mine = panelContext(s, cur, { dm: true });
  assert.equal(mine.situation, 'turn'); assert.deepEqual(mine.tabs.map((t) => t.id), ['attacks', 'spells', 'bonus', 'move', 'features', 'items']);
  assert.equal(mine.default, cur.attacks?.length || cur.actions?.length ? 'attacks' : 'spells');
  assert.deepEqual(visibleTabs(mine).map((t) => t.id), ['all']);
  const waiting = Object.values(s.entities).find((e) => e.kind === 'pc' && e.id !== cur.id && s.encounter.order.some((o) => o.id === e.id));
  const c = panelContext(s, waiting, { dm: true });
  assert.equal(c.situation, 'wait'); assert.deepEqual(c.tabs.map((t) => t.id), ['reactions', 'spells', 'features', 'items']);
  assert.deepEqual(visibleTabs(c).map((t) => t.id), ['reactions', 'all']);
});

test('Reactions is greyed with a reason when there is none to take, active and pulsing with a question waiting', () => {
  const s = fight(), pc = Object.values(s.entities).find((e) => e.kind === 'pc' && e.id !== current(s) && s.encounter.order.some((o) => o.id === e.id));
  pc.reactionUsed = true;
  let r = panelContext(s, pc, { dm: true }).tabs[0];
  assert.equal(r.ok, false); assert.match(r.why, /Reaction used this round/);
  assert.equal(defaultTab(panelContext(s, pc), visibleTabs(panelContext(s, pc)), { last: { wait: 'all' } }), 'all');     // not available: the last tab used
  s.prompt = { n: 1, reactor: pc.id, trigger: 'hit', options: [] };
  r = panelContext(s, pc, { dm: false }).tabs[0];
  assert.equal(r.pending, true);
  assert.equal(defaultTab(panelContext(s, pc), visibleTabs(panelContext(s, pc))), 'reactions');
  s.prompt = { waiting: true };
  assert.equal(reactionState(s, pc).pending, false);        // another player's question is not ours
  s.prompt = null; pc.reactionUsed = false;
  assert.equal(reactionState(s, pc).ok, reactionState(s, pc).why === '');
});

test('a creature that is down has one tab; a creature that is not yours has none', () => {
  const s = newGame(7), e = s.entities.rogue;
  e.hp = 0;
  assert.deepEqual(panelContext(s, e).tabs.map((t) => t.id), ['down']);
  assert.deepEqual(visibleTabs(panelContext(s, e)).map((t) => t.id), ['down']);
  e.hp = 5;
  assert.equal(panelContext(s, e, { mine: false }).situation, 'watch');
  assert.deepEqual(visibleTabs(panelContext(s, e, { mine: false })), []);
});

test('Explore: a door that can be opened comes first; Search is in the top four where only a Search finds things', () => {
  const s = newGame(7), e = s.entities.fighter;
  assert.equal(s.settings.passiveFind, 'off');
  let rows = rankExplore(s, e);
  assert.ok(ids(rows).indexOf('search') <= 3, ids(rows).join());
  door(s, e.pos);
  rows = rankExplore(s, e);
  assert.match(rows[0].id, /^use:door/); assert.equal(rows[0].why, '');
  assert.ok(rows[0].grid);
  assert.ok(ids(rows).indexOf('search') <= 3);
});

test('Explore: Follow for a player, Lead the party for the DM only', () => {
  const s = newGame(7), e = s.entities.fighter;
  assert.ok(ids(rankExplore(s, e, { dm: false })).includes('follow'));
  assert.ok(!ids(rankExplore(s, e, { dm: false })).includes('lead'));
  assert.ok(ids(rankExplore(s, e, { dm: true })).includes('lead'));
  e.follow = 'rogue';
  assert.ok(ids(rankExplore(s, e)).includes('stopFollow')); assert.ok(!ids(rankExplore(s, e)).includes('follow'));
  e.follow = null;
  assert.equal(rankExplore(s, e, { mode: { kind: 'follow' } }).find((r) => r.id === 'follow').armed, true);
});

test('Explore: where passive Perception helps, Search drops below the rows above; a find moves it up', () => {
  const s = newGame(7), e = s.entities.fighter;
  door(s, e.pos); ok(apply(s, { type: 'setting', key: 'passiveFind', value: 'all' }, DM));
  const rows = ids(rankExplore(s, e, { dm: true }));
  assert.ok(rows.indexOf('search') > rows.findIndex((x) => x.startsWith('use:')));
  assert.ok(rows.indexOf('search') > rows.indexOf('follow'));
  const found = ids(rankExplore(s, e, { dm: true, found: true }));
  assert.ok(found.indexOf('search') <= 3 && found.indexOf('search') < rows.indexOf('search') + 1);
});

test('Explore: hurt shortcuts, the DM\'s rests, ritual spells, light', () => {
  const s = newGame(7), c = s.entities.cleric;
  assert.ok(!ids(rankExplore(s, c)).some((x) => x.startsWith('heal:')));
  c.hp = 3;
  const heal = ids(rankExplore(s, c)).filter((x) => x.startsWith('heal:'));
  assert.ok(heal.length > 0, 'a cleric under half is offered healing');
  assert.ok(!ids(rankExplore(s, c, { dm: false })).includes('longRest'));
  const dm = ids(rankExplore(s, c, { dm: true }));
  assert.ok(dm.includes('longRest') && dm.includes('shortRest'));
  assert.ok(dm.indexOf('longRest') < dm.indexOf('hide'), 'a party member under half brings the rests up');
  s.entities.wizard.spells.push('alarm');
  assert.ok(ids(rankExplore(s, s.entities.wizard)).includes('ritual:alarm'));
  // Light: only where the party sees by light, it is not Bright, and the creature carries none. A player's row is greyed, the DM's is not.
  ok(apply(s, { type: 'setting', key: 'sight', value: 'light' }, DM));
  const dark = (who, dm) => rankExplore(s, s.entities[who], { dm }).find((r) => r.id === 'light');
  const had = dark('fighter', true);
  if (had) { assert.equal(had.why, ''); assert.match(dark('fighter', false).why, /Only the DM/); }
});

test('how a pill ends: a lasting effect, concentration, a condition, dying', () => {
  const s = newGame(7), e = s.entities.cleric;
  s.effects = [{ id: 'fx1', name: 'Bless', source: e.id, conc: true, lasts: '1 minute', until: { clock: s.clock + 10 }, parts: [{ target: e.id, modifier: {} }] }];
  const k = howItEnds(s, e, 'fx:fx1', { mine: true });
  assert.equal(k.title, 'Bless'); assert.equal(k.end, 'fx1');
  assert.match(k.lines.join(' '), /Concentrating on Bless/); assert.match(k.lines.join(' '), /Constitution save/); assert.match(k.lines.join(' '), /until/i);
  assert.equal(howItEnds(s, e, 'fx:fx1', { mine: false }).end, null);
  assert.equal(howItEnds(s, e, 'fx:gone'), null);
  e.cond.prone = {};
  assert.match(howItEnds(s, e, 'cond:prone').lines.join(' '), /start of your turn/);
  assert.match(howItEnds(s, e, 'cond:prone').lines.join(' '), /Until the DM removes it/);
  e.hp = 0; e.death = { s: 1, f: 0 };
  assert.match(howItEnds(s, e, 'dying').lines[0], /1✓ 0✗/);
  const html = statusHtml(s, e, { mine: true, full: true });
  assert.match(html, /data-how="fx:fx1"/); assert.match(html, /data-how="cond:prone"/); assert.match(html, /Dying 1✓ 0✗/);
});
