// The DM's legendary screen (legendary.js; docs/specs/legendary.md, stage L4a): the counts, the rows of the window, what an option needs, the switches, and what a
// player's turn line says. The client imports the rules as ./shared, so the test lays the two side by side in a temporary folder, as tracker.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'legendary-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const L = await import(pathToFileURL(join(tmp, 'legendary.js')));
const { screenTurnLine, rowHTML } = await import(pathToFileURL(join(tmp, 'tracker.js')));
const { reactionsHtml } = await import(pathToFileURL(join(tmp, 'reactionsheet.js')));
const { apply, current } = await import(pathToFileURL(join(tmp, 'shared/engine.js')));
const { newGame } = await import(pathToFileURL(join(tmp, 'shared/scenario.js')));
const { view } = await import(pathToFileURL(join(tmp, 'shared/view.js')));

const DM = { role: 'dm', userId: 'dm' };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
function fight() {
  const s = newGame(5);
  for (const [key, value] of [['autoEngage', false], ['legendaryWindows', true], ['legendaryResistance', true]]) ok(apply(s, { type: 'setting', key, value }, DM));
  const f = s.entities.fighter.pos;
  ok(apply(s, { type: 'spawn', monster: 'adult-green-dragon', at: { q: f.q + 3, r: f.r }, name: 'Verdigris' }, DM));
  const d = Object.values(s.entities).find((e) => e.name === 'Verdigris');
  ok(apply(s, { type: 'startEncounter', center: f }, DM));
  for (let i = 0; i < 30 && !s.encounter.between; i++) ok(apply(s, { type: 'endTurn', actor: current(s) }, DM));
  assert.ok(s.encounter.between, 'a window opened');
  return { s, d };
}

test('counts: uses and Resistance, spent not left, the lair numbers when marked', () => {
  const { s, d } = fight();
  assert.equal(L.countsText(d), 'Legendary 3/3 · Resistance 3/3');
  ok(apply(s, { type: 'legendarySet', actor: d.id, set: { acts: 2, resisted: 1 } }, DM));
  assert.equal(L.countsText(s.entities[d.id]), 'Legendary 1/3 · Resistance 2/3');
  ok(apply(s, { type: 'legendarySet', actor: d.id, set: { lair: true } }, DM));
  assert.equal(L.countsText(s.entities[d.id]), 'Legendary 2/4 · Resistance 3/4');
  assert.equal(L.countsText(s.entities.fighter), '', 'a creature with no legendary block has no counts');
});

test('the window: one row for each creature still to choose, and the words after whose turn', () => {
  const { s, d } = fight();
  assert.deepEqual(L.windowRows(s).map((e) => e.id), [d.id]);
  assert.match(L.afterWords(s), /^after .+'s turn$/);
  ok(apply(s, { type: 'legendary', actor: d.id, skip: true }, DM));
  assert.deepEqual(L.windowRows(s), []);
  assert.deepEqual(L.windowRows({ encounter: { between: true }, entities: {} }), [], 'a player is sent true, which gives no rows');
});

test('an armed option goes stale when the window or the fight moves on: no creature, no option, nothing to aim from (review of #883)', () => {
  const { s, d } = fight();
  const m = { kind: 'legendary', actor: d.id, option: 'pounce' };
  assert.equal(L.armedOf(s, m).opt.id, 'pounce');
  assert.equal(L.armedOf(s, { ...m, option: 'nothing-such' }), null);
  assert.equal(L.armedOf(s, { ...m, actor: 'fighter' }), null, 'a creature the window does not offer');
  ok(apply(s, { type: 'endEncounter' }, DM));
  assert.equal(s.encounter, null);
  assert.equal(L.armedOf(s, m), null, 'the fight ended while Pounce was armed');
  const { s: s2, d: d2 } = fight();
  ok(apply(s2, { type: 'legendary', actor: d2.id, skip: true }, DM));
  assert.equal(L.armedOf(s2, { ...m, actor: d2.id }), null, 'skipped');
});

test('what an option needs: a manual one is one tap, Pounce a move and a target, Miasma a spot', () => {
  const { d } = fight();
  const by = (id) => d.legendary.actions.options.find((o) => o.id === id);
  assert.deepEqual(L.stepsOf(d, by('mind-invasion')), []);
  assert.deepEqual(L.stepsOf(d, by('pounce')), ['move', 'aim']);
  assert.deepEqual(L.stepsOf(d, by('noxious-miasma')), ['aim']);
  assert.equal(L.optionState(d, by('pounce')).ok, true);
  const spent = { ...d, legend: { ...d.legend, acts: 3 } };
  assert.equal(L.optionState(spent, by('pounce')).ok, false);
  const again = { ...d, legend: { ...d.legend, again: { 'noxious-miasma': true } } };
  assert.match(L.optionState(again, by('noxious-miasma')).why, /can't be taken again/);
});

test("a player's turn line says Waiting for the DM and nothing more; the DM's says what the table does", () => {
  const { s } = fight();
  const pv = view(s, { role: 'player', userId: 'pat' });
  assert.equal(pv.encounter.between, true);
  const t = screenTurnLine(pv, () => false);
  assert.equal(t.text, 'Waiting for the DM');
  assert.equal(t.mine, false);
  assert.match(screenTurnLine(s, () => true, { dm: true }).text, /Legendary actions$/);
  assert.equal(screenTurnLine(s, () => true, { dm: true }).mine, false, 'End turn is not offered between turns');
});

test("Turns: the counters are the DM's alone, under the creature's row", () => {
  const { s, d } = fight();
  const row = (S, dm) => rowHTML(S, { e: S.entities[d.id], now: false }, { dm });
  assert.match(row(s, true), /class="tr-leg">Legendary 3\/3 · Resistance 3\/3</);
  assert.doesNotMatch(row(view(s, { role: 'player', userId: 'pat' }), false), /tr-leg|Resistance/);
});

test('the switches: instruction, lair and show for a legendary creature, in DM tools and on its Reactions tab', () => {
  const { s, d } = fight();
  const html = L.creaturesHtml(s);
  for (const w of ['Only when it matters', 'Ask me every time', 'Every failed save', 'Never', 'In its lair', 'Show its legendary uses to the players']) assert.ok(html.includes(w), w);
  assert.match(html, /<option value="matters" selected>/);
  const sheet = reactionsHtml(s, s.entities[d.id], { panel: true, dm: true });
  assert.match(sheet, /data-lg-set="lair"/);
  assert.match(sheet, /Legendary Resistance/);
  assert.doesNotMatch(sheet, /Does nothing until set to Always[^]*Legendary Resistance/, 'it is not one of the uses that wait for Always');
  assert.doesNotMatch(reactionsHtml(s, s.entities[d.id], { panel: true }), /data-lg-set/, 'the lair switch is the DM\'s');
  assert.match(L.creaturesHtml({ entities: {}, settings: {} }), /No legendary creature/);
});
