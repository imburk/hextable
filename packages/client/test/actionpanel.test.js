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
const { panelContext, visibleTabs, defaultTab, rankExplore, howItEnds, statusHtml, reactionState, attackRows, bonusRows, moveRows, moveBudget, tabRows } = await import(pathToFileURL(join(tmp, 'actionpanel.js')));
const { apply, current } = await import(pathToFileURL(join(tmp, 'shared/engine.js')));
const { newGame } = await import(pathToFileURL(join(tmp, 'shared/scenario.js')));
const { derive } = await import(pathToFileURL(join(tmp, 'shared/derive.js')));
const { makeEntity } = await import(pathToFileURL(join(tmp, 'shared/engine.js')));
const { featureRows } = await import(pathToFileURL(join(tmp, 'features.js')));

const DM = { role: 'dm', userId: 'dm' };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const ids = (rows) => rows.map((r) => r.id);
const door = (s, at) => s.map.objects.push({ id: 'door', def: 'door-wooden', level: 'ground', at: { q: at.q, r: at.r }, edge: 0, state: 'closed' });

function fight() {
  const s = newGame(7);
  ok(apply(s, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 8 }, DM));
  return s;
}

test('exploring: Explore first, then Spells, Features, Items; the shell draws Explore, the spell tab (id all) and Features', () => {
  const s = newGame(7), c = panelContext(s, s.entities.cleric);
  assert.equal(c.situation, 'explore'); assert.equal(c.default, 'explore');
  assert.deepEqual(c.tabs.map((t) => t.id), ['explore', 'spells', 'features', 'items']);
  assert.deepEqual(visibleTabs(c).map((t) => t.id), ['explore', 'all', 'features']);
  assert.deepEqual(visibleTabs(c, { spells: false, features: false }).map((t) => t.id), ['explore'], 'a tab with nothing in it is not drawn');
  assert.equal(defaultTab(c, visibleTabs(c)), 'explore');
  assert.equal(defaultTab(c, visibleTabs(c), { pref: 'remember', last: { explore: 'all' } }), 'all');
});

test('in a fight: on your turn Attacks (Spells with no attack), on another\'s Reactions', () => {
  const s = fight(), cur = s.entities[current(s)];
  const mine = panelContext(s, cur, { dm: true });
  assert.equal(mine.situation, 'turn'); assert.deepEqual(mine.tabs.map((t) => t.id), ['attacks', 'spells', 'bonus', 'move', 'features', 'items']);
  assert.equal(mine.default, cur.attacks?.length || cur.actions?.length ? 'attacks' : 'spells');
  assert.deepEqual(visibleTabs(mine).map((t) => t.id), ['attacks', 'all', 'bonus', 'move', 'features']);
  assert.deepEqual(visibleTabs(mine, { spells: false, attacks: false, features: false }).map((t) => t.id), ['bonus', 'move']);
  assert.equal(defaultTab(mine, visibleTabs(mine, { attacks: false })), 'all', 'no attack: the spells are the default');
  const waiting = Object.values(s.entities).find((e) => e.kind === 'pc' && e.id !== cur.id && s.encounter.order.some((o) => o.id === e.id));
  const c = panelContext(s, waiting, { dm: true });
  assert.equal(c.situation, 'wait'); assert.deepEqual(c.tabs.map((t) => t.id), ['reactions', 'spells', 'features', 'items']);
  assert.deepEqual(visibleTabs(c).map((t) => t.id), ['reactions', 'all', 'features']);
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

// ---------- T4a: the Attacks, Bonus, Move and Features tabs ----------
const hero = (sheet, at = { q: 0, r: 0, z: 0 }) => { const s = newGame(7); s.entities.hero = makeEntity(derive(sheet).record, { id: 'hero', kind: 'pc', side: 'party', pos: at, owner: 'u1' }); return s; };
const A = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 10 };
const fighter = (level = 5) => ({ name: 'Tor', class: 'fighter', level, abilities: A, skills: ['athletics', 'perception'], weapons: ['longsword'] });
const turnOf = (s, id) => { for (let i = 0; i < 20 && current(s) !== id; i++) ok(apply(s, { type: 'endTurn', actor: current(s) }, DM)); assert.equal(current(s), id); };
const inFightAs = (s, id) => { ok(apply(s, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 8 }, DM)); turnOf(s, id); return s.entities[id]; };
const whys = (rows) => rows.filter((r) => r.why);

test('Attacks: a character\'s attacks with bonus, damage and reach; greyed with the engine\'s words once the action is spent', () => {
  const s = newGame(7), e = inFightAs(s, 'fighter');
  let rows = attackRows(s, e);
  assert.deepEqual(ids(rows), e.attacks.map((a) => `atk:${a.id}`));
  assert.match(rows[0].sub, /^\+\d+ to hit · .+ · reach 5 ft$/); assert.equal(rows[0].why, ''); assert.equal(rows[0].chip, 'Action');
  assert.deepEqual(rows[0].mode, { kind: 'attack', id: e.attacks[0].id });
  assert.equal(attackRows(s, e, { mode: rows[0].mode })[0].armed, true);
  s.encounter.budget.action = 0;
  rows = attackRows(s, e);
  assert.match(rows[0].why, /already used an action/);
  const other = s.entities[Object.keys(s.entities).find((k) => k !== e.id && s.entities[k].kind === 'pc')];
  assert.match(attackRows(s, other)[0].why, /isn't .+ turn/, 'on another\'s turn every row says so');
});

test('Attacks: a monster lists its actions, Multiattack, recharge and uses a day; the arming rows carry the mode they set', () => {
  const s = newGame(7), foe = Object.values(s.entities).find((e) => e.side === 'foe' && e.actions?.length);
  ok(apply(s, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 8 }, DM)); turnOf(s, foe.id);
  const rows = attackRows(s, foe);
  assert.deepEqual(ids(rows), foe.actions.map((a) => `act:${a.id}`));
  for (const r of rows) assert.ok(['send', 'arm'].includes(r.kind) && (r.kind === 'send' ? r.send.type === 'act' : r.mode.kind === 'action'));
  const spent = { ...foe, spent: { [foe.actions[0].id]: true }, actions: foe.actions.map((a, i) => (i ? a : { ...a, recharge: [5, 6] })) };
  assert.match(attackRows(s, spent)[0].why, /has not recharged/);
  assert.match(attackRows(s, spent)[0].sub, /recharge 5–6/);
});

test('Move: Dash, Disengage, Dodge, Hide, Search and the objects in reach, each with its cost and its reason; the meter is the speed left', () => {
  const s = newGame(7), e = inFightAs(s, 'fighter');
  door(s, e.pos); const rows = moveRows(s, e);
  assert.deepEqual(ids(rows).slice(0, 5), ['dash', 'disengage', 'dodge', 'hide', 'search']);
  assert.ok(ids(rows).some((x) => x.startsWith('use:door')));
  assert.equal(rows.find((r) => r.id === 'dash').chip, 'Action'); assert.equal(whys(rows).filter((r) => r.id !== 'hide').length, 0);
  assert.deepEqual(moveBudget(s, e), { left: 30, max: 30, prone: false });
  ok(apply(s, { type: 'dash', actor: e.id }, DM));
  assert.deepEqual(moveBudget(s, e), { left: 60, max: 60, prone: false });
  const spent = moveRows(s, e);
  for (const id of ['dash', 'disengage', 'dodge', 'search']) assert.match(spent.find((r) => r.id === id).why, /already used an action/);
  assert.ok(spent.find((r) => r.id.startsWith('use:door')).chip, 'an object row names its cost');
  assert.equal(moveBudget(newGame(7), e), null, 'no budget outside a fight');
  const fly = moveRows(s, e, { fly: { aloft: true, alt: 0 } });
  assert.equal(fly.find((r) => r.id === 'fly-up').delta, 5); assert.match(fly.find((r) => r.id === 'fly-down').why, /as low as it goes/);
  assert.equal(moveRows(s, e, { fly: { aloft: true, alt: 10 } }).find((r) => r.id === 'fly-down').why, '');
});

test('Bonus: the Bonus Action things from every kind, and the reason when there is none left', () => {
  const s = hero({ ...fighter(2) }), e = inFightAs(s, 'hero');
  let b = bonusRows(s, e);
  assert.equal(b.available, true);
  assert.ok(ids(b.rows).includes('feat:second-wind'), ids(b.rows).join());
  assert.ok(b.rows.every((r) => r.time === 'bonus'));
  s.encounter.budget.bonus = 0;
  b = bonusRows(s, e);
  assert.equal(b.available, false); assert.match(b.why, /already used a Bonus Action/);
  assert.ok(b.rows.length && b.rows.every((r) => r.why), 'each row is greyed with the reason');
  // A wizard with a Bonus Action spell lists it; Nimble Escape and Cunning Action make the standard actions Bonus Actions.
  const w = newGame(7); w.entities.wizard.spells.push('misty-step');
  const we = inFightAs(w, 'wizard');
  assert.ok(ids(bonusRows(w, we).rows).includes('spell:misty-step'));
  const r = hero({ name: 'Ro', class: 'rogue', level: 2, abilities: { ...A, dex: 16 }, skills: ['stealth', 'perception', 'acrobatics', 'sleight-of-hand'], expertise: ['stealth', 'acrobatics'], weapons: ['shortsword'] });
  const re = inFightAs(r, 'hero');
  assert.deepEqual(ids(bonusRows(r, re).rows).sort(), ['dash-bonus', 'disengage-bonus', 'hide-bonus']);
  assert.equal(bonusRows(r, re).rows.find((x) => x.id === 'dash-bonus').send.bonus, true);
});

test('Features: pips from what is left, how it comes back, a reason when none is left or it is not your turn', () => {
  const s = hero(fighter(5)), e = s.entities.hero;
  let rows = featureRows(s, e);
  const sw = rows.find((r) => r.id === 'feat:second-wind');
  assert.ok(sw, ids(rows).join());
  assert.equal(sw.chip, 'Bonus'); assert.ok(sw.pips.max >= 1 && sw.pips.left === sw.pips.max); assert.match(sw.pips.text, /^Back on a (Short|Long) Rest/);
  e.uses['second-wind'] = 0;
  assert.match(featureRows(s, e).find((r) => r.id === 'feat:second-wind').why, /no uses of Second Wind left/);
  const f = inFightAs(s, 'rogue'); void f;
  for (const r of featureRows(s, e).filter((x) => x.kind !== 'none')) assert.match(r.why, /isn't Tor's turn|no uses|full/, `${r.id}: ${r.why}`);
  assert.deepEqual(tabRows(s, e, 'features').map((r) => r.id), featureRows(s, e).map((r) => r.id));
});

test('Features: a chooser feature has a row that opens its card, with its pool as pips; a feature with uses and no button is listed without one', () => {
  const s = hero({ name: 'Pal', class: 'paladin', level: 5, subclass: 'devotion', abilities: { ...A, cha: 14 }, skills: ['athletics', 'religion'], weapons: ['longsword'] });
  const rows = featureRows(s, s.entities.hero), loh = rows.find((r) => r.id === 'feat:lay-on-hands');
  assert.ok(loh, ids(rows).join());
  assert.equal(loh.kind, 'chooser'); assert.equal(loh.feature, 'lay-on-hands'); assert.equal(loh.pips.unit, 'HP'); assert.equal(loh.pips.left, loh.pips.max);
  for (const r of rows) if (r.kind === 'none') assert.ok(r.sub, `${r.id} says why it has no button`);
});
