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
const { panelContext, visibleTabs, defaultTab, rankExplore, howItEnds, statusHtml, reactionState, attackRows, bonusRows, moveRows, moveBudget, tabRows, feetShown, spellRows, slotStrip, filterSpells, sortSpells, noFilters, filtersOn, castGroup, spellRow, itemRows, gearRows, lightRow, potionTargets } = await import(pathToFileURL(join(tmp, 'actionpanel.js')));
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

test('exploring: Explore first, then Spells, Features, Items; the shell draws Explore, Spells, Features and Items', () => {
  const s = newGame(7), c = panelContext(s, s.entities.cleric);
  assert.equal(c.situation, 'explore'); assert.equal(c.default, 'explore');
  assert.deepEqual(c.tabs.map((t) => t.id), ['explore', 'spells', 'features', 'items']);
  assert.deepEqual(visibleTabs(c).map((t) => t.id), ['explore', 'spells', 'features', 'items']);
  assert.deepEqual(visibleTabs(c, { spells: false, features: false, items: false }).map((t) => t.id), ['explore'], 'a tab with nothing in it is not drawn');
  assert.equal(defaultTab(c, visibleTabs(c)), 'explore');
  assert.equal(defaultTab(c, visibleTabs(c), { pref: 'remember', last: { explore: 'spells' } }), 'spells');
});

test('in a fight: on your turn Attacks (Spells with no attack), on another\'s Reactions', () => {
  const s = fight(), cur = s.entities[current(s)];
  const mine = panelContext(s, cur, { dm: true });
  assert.equal(mine.situation, 'turn'); assert.deepEqual(mine.tabs.map((t) => t.id), ['attacks', 'spells', 'bonus', 'move', 'features', 'items']);
  assert.equal(mine.default, cur.attacks?.length || cur.actions?.length ? 'attacks' : 'spells');
  assert.deepEqual(visibleTabs(mine).map((t) => t.id), ['attacks', 'spells', 'bonus', 'move', 'features', 'items']);
  assert.deepEqual(visibleTabs(mine, { spells: false, attacks: false, features: false, items: false }).map((t) => t.id), ['bonus', 'move']);
  assert.equal(defaultTab(mine, visibleTabs(mine, { attacks: false })), 'spells', 'no attack: the spells are the default');
  const waiting = Object.values(s.entities).find((e) => e.kind === 'pc' && e.id !== cur.id && s.encounter.order.some((o) => o.id === e.id));
  const c = panelContext(s, waiting, { dm: true });
  assert.equal(c.situation, 'wait'); assert.deepEqual(c.tabs.map((t) => t.id), ['reactions', 'spells', 'features', 'items']);
  assert.deepEqual(visibleTabs(c).map((t) => t.id), ['reactions', 'spells', 'features', 'items']);
});

test('Reactions is greyed with a reason when there is none to take, active and pulsing with a question waiting', () => {
  const s = fight(), pc = Object.values(s.entities).find((e) => e.kind === 'pc' && e.id !== current(s) && s.encounter.order.some((o) => o.id === e.id));
  pc.reactionUsed = true;
  let r = panelContext(s, pc, { dm: true }).tabs[0];
  assert.equal(r.ok, false); assert.match(r.why, /Reaction used this round/);
  assert.equal(defaultTab(panelContext(s, pc), visibleTabs(panelContext(s, pc)), { last: { wait: 'spells' } }), 'spells');     // not available: the last tab used
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
const fighter = (level = 5) => ({ name: 'Tor', class: 'fighter', level, abilities: ABIL, skills: ['athletics', 'perception'], weapons: ['longsword'] });
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

test('movement left is shown in whole feet, rounded down, on a square map only; the pills and the Move tab agree', () => {
  const sq = { map: { grid: 'square' } }, hx = { map: { grid: 'hex' } };
  assert.equal(feetShown(sq, 30), 30);
  assert.equal(feetShown(sq, 30 - 5 * Math.SQRT2), 22);          // one diagonal step spent: 22.93 ft left shows as 22
  assert.equal(feetShown(sq, 9.999999999), 10, 'a float that fell a hair short of a whole foot is that foot');
  assert.equal(feetShown(sq, 0.4), 0);
  assert.equal(feetShown(hx, 22.93), 22.93, 'hex maps show the number as it is');
  assert.equal(feetShown({}, 12.5), 12.5);
  const s = newGame(7, { grid: 'square' }), e = inFightAs(s, 'fighter');
  s.encounter.budget.move = 30 - 5 * Math.SQRT2;
  assert.equal(moveBudget(s, e).left, 22);
  assert.match(statusHtml(s, e, { mine: true, full: true, budget: { ...s.encounter.budget, attacksLeft: 0 } }), /Move 22 ft/);
});

// ---------- the Spells tab (T4b) ----------
const cleric = (s) => s.entities.cleric;
test('spell rows carry level, cost, range, concentration and kinds; a spell with kinds [] says nothing is known', () => {
  const s = newGame(7), rows = spellRows(s, cleric(s)), by = Object.fromEntries(rows.map((r) => [r.spell, r]));
  assert.deepEqual(rows.map((r) => r.spell).sort(), ['cure-wounds', 'healing-word', 'sacred-flame', 'shield-of-faith']);
  assert.equal(by['sacred-flame'].level, 0); assert.equal(by['healing-word'].cast, 'Bonus'); assert.equal(by['healing-word'].chip, 'Bonus');
  assert.match(by['sacred-flame'].sub, /Cantrip · 60 ft/); assert.ok(by['shield-of-faith'].conc); assert.match(by['shield-of-faith'].sub, /Concentration/);
  assert.ok(by['cure-wounds'].kinds.includes('healing'));
});

test('the slot strip: one entry per level with what is left; Pact slots are one row labelled so', () => {
  const s = newGame(7), e = cleric(s);
  assert.deepEqual(slotStrip(e), [{ level: 1, left: 2, max: 2, label: 'Level 1' }]);
  e.slots[1] = 0; assert.equal(slotStrip(e)[0].left, 0);
  assert.deepEqual(slotStrip({ slots: { 3: 1 }, slotsMax: { 3: 2 }, pact: true }), [{ level: 3, left: 1, max: 2, label: 'Pact slots, level 3' }]);
  assert.deepEqual(slotStrip({ spells: [] }), [], 'no slots: no strip');
});

test('sort: Level groups Cantrips first, Name is one list, School and Casting time group', () => {
  const s = newGame(7), rows = spellRows(s, cleric(s));
  assert.deepEqual(sortSpells(rows, 'level').map((g) => g.head), ['Cantrips', 'Level 1']);
  assert.deepEqual(sortSpells(rows, 'name').map((g) => g.rows.map((r) => r.spell)), [['cure-wounds', 'healing-word', 'sacred-flame', 'shield-of-faith']]);
  assert.deepEqual(sortSpells(rows, 'school').map((g) => g.head), ['Abjuration', 'Evocation']);
  assert.deepEqual(sortSpells(rows, 'time').map((g) => g.head), ['Action', 'Bonus']);
  assert.deepEqual(sortSpells([], 'name'), []);
});

test('filters combine: any one chip of a kind, every kind that is on; Prepared is "not a cantrip"; a spell of unknown kind passes every Kind chip', () => {
  const s = newGame(7), rows = spellRows(s, cleric(s)), f = (o) => ({ ...noFilters(), ...o }), names = (o) => filterSpells(rows, f(o)).map((r) => r.spell).sort();
  assert.deepEqual(names({}), ['cure-wounds', 'healing-word', 'sacred-flame', 'shield-of-faith']);
  assert.deepEqual(names({ level: ['cantrip'] }), ['sacred-flame']);
  assert.deepEqual(names({ level: ['prepared'] }), ['cure-wounds', 'healing-word', 'shield-of-faith']);
  assert.deepEqual(names({ level: ['cantrip', 'prepared'] }).length, 4);
  assert.deepEqual(names({ level: ['prepared'], kind: ['healing'] }), ['cure-wounds', 'healing-word']);
  assert.deepEqual(names({ level: ['prepared'], kind: ['healing'], cast: ['Bonus'] }), ['healing-word']);
  assert.deepEqual(names({ cast: ['Action', 'Bonus'], conc: true }), ['shield-of-faith']);
  assert.deepEqual(names({ ritual: true }), []);
  const unknown = rows.map((r) => ({ ...r, kinds: [] }));
  assert.equal(filterSpells(unknown, f({ kind: ['damage'] })).length, 4, 'kind not known: shown under every kind');
  assert.equal(filtersOn(f({ level: ['cantrip'], kind: ['healing', 'damage'], can: true })), 4);
  assert.equal(castGroup({ time: 'minute' }), 'Longer'); assert.equal(castGroup({ time: 'reaction' }), 'Reaction');
});

test('Can cast now follows the greyed state; a spell with no slot left says so, and out of turn the engine\'s own words', () => {
  const s = fight(), cur = s.entities[current(s)], other = Object.values(s.entities).find((e) => e.id !== cur.id && e.spells?.length && s.encounter.order.some((o) => o.id === e.id));
  const rows = spellRows(s, other);
  assert.ok(rows.every((r) => r.why), 'not its turn: every row is greyed');
  assert.match(rows[0].why, /isn't .+ turn/);
  assert.equal(filterSpells(rows, { ...noFilters(), can: true }).length, 0);
  const mine = Object.values(s.entities).find((e) => e.spells?.includes('cure-wounds'));
  mine.slots[1] = 0;
  assert.ok(spellRows(s, mine).filter((r) => r.level > 0).every((r) => r.why));
});

test('a creature spell with nobody within its range is greyed "Nobody within N ft."; an area, a self spell and a spell with someone in range are not', () => {
  const s = newGame(7);
  const e = cleric(s), foes = Object.values(s.entities).filter((x) => x.side === 'foe');
  for (const x of Object.values(s.entities)) if (x.id !== e.id) x.pos = { q: e.pos.q + 40, r: e.pos.r };            // everyone far out of every range (the engine's list counts allies too)
  const by = Object.fromEntries(spellRows(s, e).map((r) => [r.spell, r]));
  assert.equal(by['sacred-flame'].why, 'Nobody within 60 ft.');
  assert.equal(by['healing-word'].why, '', 'it can be aimed at the caster');
  foes[0].pos = { q: e.pos.q + 1, r: e.pos.r };
  assert.equal(spellRows(s, e).find((r) => r.spell === 'sacred-flame').why, '');
});

test('Explore\'s healing shortcut for a spell jumps to its row in the Spells tab', () => {
  const s = newGame(7), e = cleric(s);
  e.hp = 2;
  const j = rankExplore(s, e).find((r) => r.id === 'heal:cure-wounds');
  assert.ok(j, 'a hurt cleric is offered Cure Wounds');
  assert.equal(j.jumpTab, 'spells'); assert.equal(j.jump, 'spell:cure-wounds');
  assert.ok(spellRows(s, e).some((r) => r.id === j.jump), 'the row it jumps to exists');
});

// ---------- the Items tab (T4b, E18) ----------
const DMCTX = { role: 'dm', userId: 'dm' };
const ABIL = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 };
const sheetOf = (items) => ({ name: 'Brenna', class: 'fighter', level: 5, subclass: 'champion', abilities: ABIL, skills: ['athletics', 'perception'], choices: { 'fighting-style': 'defense' }, weapons: ['longbow'], items });
// A built character joins the party beside the others; returns its id.
function built(s, items) {
  const r = apply(s, { type: 'setSheet', sheet: sheetOf(items) }, DMCTX); ok(r);
  return r.events.find((x) => x.type === 'spawned').id;
}

test('items: a hand-typed creature has its kit as names only, no Use rows; the tab is drawn when something is carried', () => {
  const s = newGame(7), it = itemRows(s, s.entities.fighter);
  assert.deepEqual([it.uses, it.gear], [[], []]);
  assert.ok(it.also.includes('Longsword') && it.any, 'kit names are listed');
  assert.equal(itemRows(s, s.entities.m1).any, false, 'a monster carries nothing: no tab');
  assert.equal(itemRows(s, s.entities.m1).light, null);
  assert.deepEqual(visibleTabs(panelContext(s, s.entities.m1, { mine: true }), { items: itemRows(s, s.entities.m1).any }).map((t) => t.id).includes('items'), false);
});

test('items: a Use row per use of an item with the engine\'s reason, charges as left/max and the cost; ungreyed rows first', () => {
  const s = newGame(7), id = built(s, [{ id: 'i1', item: 'potion-of-healing' }, { id: 'i2', item: 'wand-of-magic-missiles' }, { id: 'i3', item: 'staff-of-healing', equipped: true }]);
  const it = itemRows(s, s.entities[id]), by = Object.fromEntries(it.uses.map((r) => [r.id, r]));
  assert.deepEqual(Object.keys(by).sort(), ['item:i1:0', 'item:i2:0', 'item:i3:0', 'item:i3:1', 'item:i3:2']);
  assert.equal(by['item:i1:0'].why, '');
  assert.equal(by['item:i1:0'].chip, 'Bonus');
  assert.deepEqual(by['item:i1:0'].send, { type: 'use', actor: id, item: 'i1', which: 0 });
  assert.equal(by['item:i1:0'].reach, 5, 'a potion is given to someone within 5 ft');
  assert.match(by['item:i2:0'].why, /must be held to be used/, 'the wand is in the pack, not held');
  assert.match(by['item:i3:0'].why, /attuned/);
  assert.equal(by['item:i2:0'].pips.max, 7);
  assert.equal(by['item:i2:0'].pips.left, 7, 'full when the sheet says nothing');
  assert.ok(by['item:i1:0'] === it.uses[0], 'what can be done now comes first');
  assert.ok(it.uses.slice(1).every((r) => r.why));
  // a charge spent shows as left / max
  s.entities[id].sheet.items.find((x) => x.id === 'i2').charges = 3; s.entities[id].sheet.items.find((x) => x.id === 'i2').equipped = true;
  const w = itemRows(s, s.entities[id]).uses.find((r) => r.id === 'item:i2:0');
  assert.deepEqual([w.why, w.pips.left, w.pips.max], ['', 3, 7]);
  // and a row sent through apply does what the row says
  assert.equal(w.aimed, true, 'a spell from an item is aimed: the engine\'s "Pick a target" means arm, not greyed');
  assert.deepEqual([w.level, w.upTo, w.cost], [1, 3, 1]);
  assert.match(apply(s, w.send, { role: 'dm' }).error, /Pick a target for Magic Missile/, 'the engine does ask for the aim');
  inFightAs(s, id);                                              // a harmful spell outside a fight only starts one and spends nothing
  const before = s.entities[id].sheet.items.length, r = ok(apply(s, { ...w.send, targets: ['m1'] }, { role: 'dm' }));
  assert.ok(r.events.some((x) => x.type === 'item'));
  assert.equal(s.entities[id].sheet.items.find((x) => x.id === 'i2').charges, 2);
  assert.equal(s.entities[id].sheet.items.length, before);
});

test('items: a potion offers the creatures within reach, not those further off, not the dead; a fight offers only those in it', () => {
  const s = newGame(7), id = built(s, [{ id: 'i1', item: 'potion-of-healing' }]), me = s.entities[id];
  ['fighter', 'wizard', 'cleric', 'rogue'].forEach((o, i) => ok(apply(s, { type: 'place', actor: o, to: { q: me.pos.q + 6 + i, r: me.pos.r } }, DMCTX)));
  assert.deepEqual(potionTargets(s, me, 5), [], 'nobody within reach');
  ok(apply(s, { type: 'place', actor: 'rogue', to: { q: me.pos.q + 1, r: me.pos.r } }, DMCTX));
  ok(apply(s, { type: 'place', actor: 'cleric', to: { q: me.pos.q + 4, r: me.pos.r } }, DMCTX));
  assert.deepEqual(potionTargets(s, s.entities[id], 5).map((t) => t.id), ['rogue']);
  s.entities.rogue.hp = 0;
  assert.deepEqual(potionTargets(s, s.entities[id], 5).map((t) => [t.id, t.down]), [['rogue', true]], 'at 0 Hit Points a creature can still be given one');
  s.entities.rogue.dead = true;
  assert.deepEqual(potionTargets(s, s.entities[id], 5), []);
  assert.deepEqual(potionTargets(s, me, 0), [], 'an item with no reach has no one to give it to');
  const row = itemRows(s, s.entities[id]).uses[0];
  ok(apply(s, { ...row.send }, DMCTX));
});

test('items: gear says carried, worn or held and attuned; Wear and Attune are buttons that send equip and attune, greyed in a fight with the engine\'s words', () => {
  const s = newGame(7), id = built(s, [{ id: 'i1', item: 'staff-of-striking' }, { id: 'i2', item: 'ring-of-jumping' }, { id: 'i3', item: 'chime-of-opening' }]);
  let g = Object.fromEntries(gearRows(s, s.entities[id]).map((x) => [x.key, x]));
  assert.equal(g.i1.sub, 'Not held · Needs attunement');
  assert.deepEqual(g.i1.acts.map((a) => [a.label, a.why, a.send.type]), [['Wield', '', 'equip'], ['Attune', '', 'attune']]);
  assert.equal(g.i3.sub, 'Carried');
  assert.deepEqual(g.i3.acts, [], 'carried: nothing to put on, no attunement');
  ok(apply(s, g.i1.acts[0].send, DMCTX));
  ok(apply(s, g.i2.acts[0].send, DMCTX));
  ok(apply(s, g.i1.acts[1].send, DMCTX));
  g = Object.fromEntries(gearRows(s, s.entities[id]).map((x) => [x.key, x]));
  assert.equal(g.i1.sub, 'Held · Attuning at the next Short Rest');
  assert.deepEqual(g.i1.acts.map((a) => a.label), ['Put away', 'Cancel attuning']);
  assert.equal(g.i2.sub, 'Worn · Needs attunement');
  ok(apply(s, g.i1.acts[1].send, DMCTX));
  assert.equal(gearRows(s, s.entities[id]).find((x) => x.key === 'i1').sub, 'Held · Needs attunement', 'cancelled');
  s.entities[id].sheet.items[0].attuned = true;
  const a = gearRows(s, s.entities[id]).find((x) => x.key === 'i1');
  assert.equal(a.sub, 'Held · Attuned');
  assert.deepEqual(a.acts[1].send, { type: 'attune', actor: id, item: 'i1', end: true });
  ok(apply(s, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 8 }, DMCTX));
  const f = gearRows(s, s.entities[id]).find((x) => x.key === 'i2');
  assert.match(f.acts[0].why, /can't change what they wear in the middle of a fight/);
  assert.match(f.acts[1].why, /can't attune to an item in the middle of a fight/);
  const refused = apply(s, f.acts[0].send, DMCTX);
  assert.equal(refused.ok, false);
  assert.match(refused.error, /in the middle of a fight/, 'the row\'s words are the engine\'s');
});

test('items: the light row: the DM lights or puts out, a player is told why not; a creature with nothing and no light has none', () => {
  const s = newGame(7), f = s.entities.fighter;
  assert.equal(lightRow(s, f, { dm: false }).why, 'Only the DM hands out light.');
  assert.deepEqual(lightRow(s, f, { dm: true }).send, { type: 'setLight', actor: 'fighter', item: 'torch' });
  ok(apply(s, lightRow(s, f, { dm: true }).send, DMCTX));
  const out = lightRow(s, s.entities.fighter, { dm: true });
  assert.match(out.label, /Put out the torch/);
  assert.match(out.sub, /Bright 20 ft, then Dim 20 ft/);
  assert.deepEqual(out.send, { type: 'setLight', actor: 'fighter', item: null });
  ok(apply(s, out.send, DMCTX));
  assert.equal(s.entities.fighter.light, undefined);
});

test('items: two of the same potion are one row marked x2 that sends the first; different items and charged items are not merged', () => {
  const s = newGame(7), id = built(s, [{ id: 'i1', item: 'potion-of-healing' }, { id: 'i2', item: 'potion-of-healing' }, { id: 'i3', item: 'potion-of-heroism' }]);
  const uses = itemRows(s, s.entities[id]).uses;
  assert.equal(uses.length, 2);
  const heal = uses.find((r) => /Healing/.test(r.sub));
  assert.match(heal.sub, /x2/);
  assert.equal(heal.send.item, 'i1');
  assert.doesNotMatch(uses.find((r) => /Heroism/.test(r.sub)).sub, /x\d/);
  ok(apply(s, heal.send, DMCTX));
  assert.equal(itemRows(s, s.entities[id]).uses.find((r) => /Healing/.test(r.sub)).sub.includes('x2'), false, 'one left: no count');
});

test('items: an item spell is armed from its row (not greyed for lacking a target); a use with upTo offers the levels; other reasons still grey it', () => {
  const s = newGame(7), id = built(s, [{ id: 'i2', item: 'wand-of-magic-missiles', equipped: true }, { id: 'i3', item: 'ring-of-jumping', equipped: true, attuned: true }, { id: 'i4', item: 'wand-of-magic-missiles' }]);
  const rows = itemRows(s, s.entities[id]).uses, by = Object.fromEntries(rows.map((r) => [r.id, r]));
  assert.equal(by['item:i2:0'].why, ''); assert.equal(by['item:i2:0'].aimed, true);
  assert.match(by['item:i4:0'].why, /must be held/, 'a wand not held is still greyed with its own reason');
  assert.equal(by['item:i3:0'].aimed, false, 'a self spell is sent at once');
  const armed = itemRows(s, s.entities[id], { mode: { kind: 'spell', id: 'magic-missile', item: { key: 'i2', which: 0, base: 1 } } }).uses.find((r) => r.id === 'item:i2:0');
  assert.equal(armed.armed, true);
  assert.equal(spellRow(s, s.entities[id], 'magic-missile', { mode: { kind: 'spell', id: 'magic-missile', item: { key: 'i2', which: 0, base: 1 } } }).armed, false, 'it does not arm the Spells tab row');
  // the aim and the level are sent as `use` takes them
  inFightAs(s, id);
  const r = ok(apply(s, { ...by['item:i2:0'].send, targets: ['m1', 'm1', 'm2', 'm2'], level: 2 }, DMCTX));
  assert.equal(s.entities[id].sheet.items.find((x) => x.id === 'i2').charges, 5, 'level 2 costs 2 charges');
  assert.ok(r.events.some((x) => x.type === 'cast'));
});
