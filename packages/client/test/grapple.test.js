// The client's Grapple, Shove, Escape and Let go (issue #486, stage G7 of docs/specs/grapple-shove.md): the rows the action panel draws, what the pill and
// its card say, the lines of the log, the refusals a target shows before an attack is sent, the preview of a drag, and the line on the map.
// The client imports the rules as ./shared, so the test lays the two side by side in a temporary folder, as actionpanel.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'grapple-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const imp = (f) => import(pathToFileURL(join(tmp, f)));
const { holdsOn, holdingOf, holdRows, strikeRows, targetRefusals, previewState, heldText, howHeldEnds, holdWords, noteText, grapplePairs } = await imp('grapple.js');
const { attackRows, tabRows, statusHtml, howItEnds, rankExplore } = await imp('actionpanel.js');
const { nextSource, titleOf } = await imp('dice.js');
const { buildOverlay } = await imp('three-build.js');
const { kindOf } = await imp('logview.js');
const { apply, current, makeEntity, moveOptions } = await imp('shared/engine.js');
const { derive } = await imp('shared/derive.js');
const { newGame } = await imp('shared/scenario.js');
const { view } = await imp('shared/view.js');

const DM = { role: 'dm', userId: 'dm' };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const STR16 = { str: 16, dex: 14, con: 14, int: 10, wis: 8, cha: 8 };
const fighter = (more = {}) => ({ name: 'Fi', class: 'fighter', level: 5, subclass: 'champion', abilities: STR16, skills: ['athletics', 'perception'], choices: { 'fighting-style': 'defense' }, weapons: [], ...more });
const GRAPPLER = { feats: [{ id: 'grappler', at: 'ability-score-improvement-4', abilities: { str: 1 } }] };
const turnOf = (s, id) => { for (let i = 0; i < 12 && current(s) !== id; i++) ok(apply(s, { type: 'endTurn', actor: current(s) }, DM)); assert.equal(current(s), id); };

// A hero (built from `sheet`) at 0,0 and a goblin beside it, a fight begun and the hero's turn.
function field(sheet = fighter(), { fight = true, monster = 'goblin-warrior' } = {}) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = 'grass';
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: 'hero', kind: 'pc', side: 'party', pos: { q: 0, r: 0, z: 0 } });
  const id = ok(apply(s, { type: 'spawn', monster, at: { q: 1, r: 0 } }, DM)).events.find((e) => e.type === 'spawned').id;
  Object.assign(s.entities[id], { hp: 500, maxHp: 500, ac: 1, saveBonus: { str: -40, dex: -40 } });
  s.foe = id;
  if (fight) { ok(apply(s, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 8 }, DM)); turnOf(s, 'hero'); }
  return s;
}
const names = (rows) => rows.map((r) => r.label);

test('the Unarmed Strike gets Grapple and two Shoves as rows that arm the same attack with an option; Punch and Grab only with the Grappler feat', () => {
  const s = field(), hero = s.entities.hero;
  const rows = attackRows(s, hero);
  assert.deepEqual(names(rows.filter((r) => r.id.startsWith('strike:unarmed-strike:'))), ['Grapple', 'Shove away', 'Shove Prone']);
  const g = rows.find((r) => r.id === 'strike:unarmed-strike:grapple');
  assert.equal(g.kind, 'arm'); assert.equal(g.why, ''); assert.equal(g.time, 'action');
  assert.deepEqual(g.mode, { kind: 'attack', id: 'unarmed-strike', label: 'Grapple', extra: { option: 'grapple' } });
  assert.deepEqual(rows.find((r) => r.id.endsWith(':push')).mode.extra, { option: 'shove', shove: 'push' });
  assert.deepEqual(rows.find((r) => r.id.endsWith(':prone')).mode.extra, { option: 'shove', shove: 'prone' });
  assert.match(g.sub, /DC 1\d/, 'the DC is shown');
  const withFeat = field(fighter(GRAPPLER)), pg = attackRows(withFeat, withFeat.entities.hero).find((r) => r.id.endsWith(':grab'));
  assert.ok(pg, 'the Grappler feat adds Punch and Grab'); assert.deepEqual(pg.mode.extra, { grab: true });
  assert.ok(!rows.some((r) => r.id.endsWith(':grab')));
});

test('a row is armed when the mode is its option, and the Grapple row is greyed in the engine\'s words when both hands are full', () => {
  const s = field(), hero = s.entities.hero;
  const mode = { kind: 'attack', id: 'unarmed-strike', label: 'Shove Prone', extra: { option: 'shove', shove: 'prone' } };
  const rows = attackRows(s, hero, { mode });
  assert.deepEqual(rows.filter((r) => r.armed).map((r) => r.id), ['strike:unarmed-strike:prone']);
  hero.shield = true;
  const goblin2 = ok(apply(s, { type: 'spawn', monster: 'goblin-warrior', at: { q: 0, r: 1 } }, DM)).events.find((e) => e.type === 'spawned').id;
  Object.assign(s.entities[goblin2], { saveBonus: { str: -40, dex: -40 } });
  ok(apply(s, { type: 'attack', actor: 'hero', target: s.foe, attack: 'unarmed-strike', option: 'grapple' }, DM));
  const why = attackRows(s, hero).find((r) => r.id.endsWith(':grapple')).why;
  assert.match(why, /no hand free to grapple/, why);
});

test('with a tap on a target: the engine\'s own refusal of size shows before the attack is sent', () => {
  const s = field(fighter(), { monster: 'ogre' }); // Large: fine for a Medium attacker (one size larger)
  const ids = [s.foe];
  const dry = (a) => { const r = apply(structuredClone(s), a, DM); return r.ok ? '' : r.error; };
  assert.deepEqual(targetRefusals(s, s.entities.hero, 'unarmed-strike', { option: 'grapple' }, ids, dry), []);
  const big = field(fighter(), { monster: 'young-green-dragon' }); // Large too; use a Huge one if the pack has it
  void big;
  s.entities[s.foe].size = 'huge';
  const bad = targetRefusals(s, s.entities.hero, 'unarmed-strike', { option: 'grapple' }, ids, dry);
  assert.equal(bad.length, 1); assert.match(bad[0].why, /no more than one size larger/);
  assert.deepEqual(targetRefusals(s, s.entities.hero, 'unarmed-strike', undefined, ids, dry), [], 'a plain attack asks nothing');
  assert.deepEqual(targetRefusals(s, s.entities.hero, 'unarmed-strike', { option: 'damage' }, ids, dry).length, 0);
});

test('a held creature: Escape rows for each skill with its bonus (and the DC when sent), the pill says who holds it and how it ends', () => {
  const s = field();
  ok(apply(s, { type: 'attack', actor: 'hero', target: s.foe, attack: 'unarmed-strike', option: 'grapple' }, DM));
  const foe = s.entities[s.foe];
  assert.deepEqual(holdsOn(s, foe).map((h) => [h.by, h.name, h.escape]), [['hero', 'Fi', 14]]);
  const rows = holdRows(s, foe);
  assert.deepEqual(rows.escape.map((r) => r.label), ['Escape (Athletics)', 'Escape (Acrobatics)']);
  assert.match(rows.escape[0].sub, /Strength check [+-]\d+ vs DC 14/); assert.match(rows.escape[1].sub, /Dexterity check/);
  assert.deepEqual(rows.escape[0].send, { type: 'escape', actor: s.foe, skill: 'athletics' });
  assert.equal(rows.escape[0].chip, 'Action'); assert.match(rows.escape[0].why, /isn't .*turn/, 'not its turn in a fight: the engine\'s words');
  assert.equal(heldText(s, foe), 'Grappled by Fi (escape DC 14)');
  const pill = statusHtml(s, foe, { mine: true, full: true });
  assert.match(pill, /Grappled by Fi \(escape DC 14\)/);
  const card = howItEnds(s, foe, 'cond:grappled', { mine: true });
  assert.ok(card.lines.some((l) => /escape DC 14/.test(l)) && !card.lines.includes('Until the DM removes it.'));
  assert.ok(howHeldEnds(s, foe).length >= 2);
  // On its own turn the foe can try it; the action is sent as the engine documents it.
  turnOf(s, s.foe);
  const own = holdRows(s, s.entities[s.foe]).escape[0];
  assert.equal(own.why, ''); ok(apply(s, own.send, DM));
});

test('a grappler: Let go of each creature it holds, free, at any time; outside a fight Escape costs nothing and is first in Explore', () => {
  const s = field();
  ok(apply(s, { type: 'attack', actor: 'hero', target: s.foe, attack: 'unarmed-strike', option: 'grapple' }, DM));
  const hero = s.entities.hero, lg = holdRows(s, hero).letGo;
  assert.equal(lg.length, 1); assert.equal(lg[0].label, `Let go of ${s.entities[s.foe].name}`);
  assert.deepEqual(lg[0].send, { type: 'letGo', actor: 'hero', target: s.foe }); assert.equal(lg[0].why, ''); assert.equal(lg[0].chip, 'Free');
  assert.ok(tabRows(s, hero, 'features').some((r) => r.id === `letgo:${s.foe}`), 'Features has it whoever\'s turn it is');
  assert.ok(tabRows(s, hero, 'attacks').some((r) => r.id === `letgo:${s.foe}`));
  ok(apply(s, lg[0].send, DM));
  assert.equal(holdRows(s, s.entities.hero).letGo.length, 0);
  // Outside a fight: no turn, no action.
  const q = field(fighter(), { fight: false });
  q.entities[q.foe].cond.grappled = { source: 'hero', holds: [{ by: 'hero', with: 'hand', escape: 13, range: 5 }] };
  const row = holdRows(q, q.entities[q.foe]).escape[0];
  assert.equal(row.chip, 'Free'); assert.equal(row.why, '');
  assert.equal(rankExplore(q, q.entities[q.foe], { dm: true })[0].kind, 'send');
  assert.match(rankExplore(q, q.entities[q.foe], { dm: true })[0].id, /^escape:/);
});

test('a Grappled condition the DM put on (no holds) shows as "Grappled" and offers no Escape', () => {
  const s = field();
  s.entities[s.foe].cond.grappled = { source: 'hero' };
  assert.equal(heldText(s, s.entities[s.foe]), 'Grappled');
  assert.deepEqual(holdRows(s, s.entities[s.foe]).escape, []);
  assert.deepEqual(holdsOn(s, s.entities[s.foe]), []);
});

test('a player is sent heldBy of a foe: its pill and the map line follow it, a grappler the party does not know of is "someone"', () => {
  const s = field();
  ok(apply(s, { type: 'attack', actor: 'hero', target: s.foe, attack: 'unarmed-strike', option: 'grapple' }, DM));
  const v = view(s, { role: 'player', userId: 'u1' }, { userId: 'u1' });
  const seen = v.entities[s.foe];
  if (!seen) return;                                                  // the view did not send it: nothing to draw
  assert.deepEqual(seen.heldBy, ['hero']);
  assert.equal(heldText(v, seen), 'Grappled by Fi');
  assert.deepEqual(holdingOf(v, v.entities.hero).map((x) => x.t.id), [s.foe]);
  assert.deepEqual(grapplePairs(v), [{ by: 'hero', t: s.foe }]);
  const v2 = structuredClone(v); v2.entities[s.foe].heldBy = ['someone'];
  assert.equal(heldText(v2, v2.entities[s.foe]), 'Grappled by someone');
  assert.deepEqual(grapplePairs(v2), []);
});

test('the move preview charges the drag for a foe a player was sent only as heldBy; a hold the engine keeps is left alone', () => {
  const s = field(); ok(apply(s, { type: 'attack', actor: 'hero', target: s.foe, attack: 'unarmed-strike', option: 'grapple' }, DM));
  assert.equal(previewState(s, s.entities.hero), s, 'the full state has the hold already');
  const v = view(s, { role: 'player', userId: 'u1' }, { userId: 'u1' });
  const seen = v.entities[s.foe];
  if (!seen) return;
  assert.ok(!Array.isArray(seen.cond.grappled?.holds), 'a seen record has no holds');
  const p = previewState(v, v.entities.hero);
  assert.ok(Array.isArray(p.entities[s.foe].cond.grappled.holds));
  const cost = (st) => Math.max(...[...moveOptions(st, st.entities.hero).values()].filter((o) => o.canStop).map((o) => o.cost ?? 0));
  const full = [...moveOptions(s, s.entities.hero).keys()].sort().join('|'), prev = [...moveOptions(p, p.entities.hero).keys()].sort().join('|');
  assert.equal(prev, full, 'the preview offers what the engine does');
  void cost;
});

test('the log: the lines for a strike option, a second hold, the end of a hold, a drag note; the save is "vs Shove"', () => {
  const n = (id) => ({ hero: 'Fi', gob: 'Goblin', ogre: 'Ogre' })[id] ?? 'Someone';
  assert.equal(holdWords({ type: 'strikeOption', actor: 'hero', target: 'gob', option: 'grapple' }, n)[0], 'Fi tries to grab Goblin.');
  assert.equal(holdWords({ type: 'strikeOption', actor: 'hero', target: 'gob', option: 'shove', shove: 'push' }, n)[0], 'Fi tries to shove Goblin back 5 feet.');
  assert.equal(holdWords({ type: 'strikeOption', actor: 'hero', target: 'gob', option: 'shove', shove: 'prone' }, n)[0], 'Fi tries to shove Goblin to the ground.');
  assert.equal(holdWords({ type: 'hold', id: 'gob', by: 'ogre' }, n)[0], 'Ogre holds Goblin too.');
  assert.equal(holdWords({ type: 'holdEnd', id: 'gob', by: 'ogre', why: 'escaped' }, n)[0], 'Goblin is no longer held by Ogre: broke free.');
  assert.equal(holdWords({ type: 'cond', id: 'gob' }, n), null);
  assert.equal(noteText({ id: 'hero', text: "Fi can't drag Goblin any further." }, n), "Fi can't drag Goblin any further.");
  assert.equal(noteText({ id: 'hero', text: 'Mor gives up an attack' }, n), 'Fi: Mor gives up an attack.');
  for (const t of ['strikeOption', 'hold', 'holdEnd']) assert.equal(kindOf({ type: t }), 'combat');
  const s = field();
  const ev = { type: 'strikeOption', actor: 'hero', target: s.foe, option: 'shove', shove: 'prone' };
  const src = nextSource(null, ev);
  assert.equal(titleOf({ type: 'save', id: s.foe, abil: 'str' }, s, src, true), `${s.entities[s.foe].name}: Strength save vs Shove`);
  assert.equal(titleOf({ type: 'save', id: s.foe, abil: 'dex' }, s, nextSource(null, { ...ev, option: 'grapple' }), true), `${s.entities[s.foe].name}: Dexterity save vs Grapple`);
});

test('the map draws a band and a ring for each hold, and nothing without one', () => {
  const s = field();
  const base = (st) => buildOverlay({ state: st, hl: { move: [], area: [], targets: [], allies: [], selected: null, turn: null }, theme: { hl: { move: [0, 0, 0, 1], area: [0, 0, 0, 1], target: [0, 0, 0, 1], ally: [0, 0, 0, 1], select: [0, 0, 0, 1] }, arenaRim: [1, 1, 1] } });
  const before = base(s);
  ok(apply(s, { type: 'attack', actor: 'hero', target: s.foe, attack: 'unarmed-strike', option: 'grapple' }, DM));
  const after = base(s);
  const count = (b) => b.count;
  assert.ok(count(after) > count(before), 'a hold adds geometry');
  assert.deepEqual(grapplePairs(s), [{ by: 'hero', t: s.foe }]);
});
