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

test('the pick: the bar marks it first with its words and one button, from the state as it is now', () => {
  const { s, d } = fight();
  const p = L.pickOf(s, d.id);
  assert.ok(p, 'the dragon has a pick');
  assert.equal(p.action.type, 'legendary');
  assert.equal('why' in p.action, false, 'the words are not part of the action');
  assert.ok(apply(structuredClone(s), p.action, DM).ok, 'the engine accepts it');
  assert.deepEqual(L.pickOf(s, d.id), p, 'same state, same pick');
  assert.equal(L.pickOf(s, 'fighter'), null, 'not a creature of the window');
  // The bar's row, drawn through a bare mount (no browser): the first thing under the name is the pick.
  const doc = { body: { classList: { add() {}, remove() {} } } };
  globalThis.document = doc;
  const mount = { hidden: true, textContent: '', innerHTML: '', setAttribute() {}, addEventListener() {}, querySelector: () => null };
  const bar = L.initLegendary({ mount, state: () => s, isDM: () => true, act() {}, toast() {}, dry: () => '', mode: () => ({}), setMode() {}, move: {}, render() {}, auto: () => false });
  bar.sync();
  assert.match(mount.innerHTML, /class="lg-pick"><span class="lg-mark"[^>]*>▸<\/span>/);
  assert.match(mount.innerHTML, /data-take="[^"]+">Do it</);
  assert.ok(mount.innerHTML.indexOf('lg-pick') < mount.innerHTML.indexOf('lg-opts'), 'the pick comes before the other options');
  assert.ok(mount.innerHTML.includes(p.why.replace(/&/g, '&amp;')), 'its words are shown');
  // Nothing worth taking (every use spent): nothing is marked.
  ok(apply(s, { type: 'legendarySet', actor: d.id, set: { acts: 3 } }, DM));
  assert.equal(L.pickOf(s, d.id), null);
  bar.sync();
  assert.doesNotMatch(mount.innerHTML, /lg-pick/);
  delete globalThis.document;
});

test('the switch: Suggest or By themselves, in DM tools and on the Reactions tab, sent as legendarySet { self }', () => {
  const { s, d } = fight();
  assert.match(L.creaturesHtml(s), /data-lg-self[^]*<option value="suggest" selected>Suggest<\/option><option value="self">By themselves<\/option>/);
  ok(apply(s, { type: 'legendarySet', actor: d.id, set: { self: true } }, DM));
  assert.match(L.creaturesHtml(s), /<option value="self" selected>By themselves/);
  assert.match(reactionsHtml(s, s.entities[d.id], { panel: true, dm: true }), /data-lg-self/);
  assert.doesNotMatch(reactionsHtml(s, s.entities[d.id], { panel: true }), /data-lg-self/, 'the DM\'s alone');
  const sent = [], handlers = [];
  const root = { addEventListener: (_, f) => handlers.push(f) };
  L.bindSwitches(root, (a) => sent.push(a));
  const target = (v) => ({ closest: () => ({ dataset: { id: d.id } }), matches: (q) => q === '[data-lg-self]', value: v });
  handlers[0]({ target: target('self') }); handlers[0]({ target: target('suggest') });
  assert.deepEqual(sent, [{ type: 'legendarySet', actor: d.id, set: { self: true } }, { type: 'legendarySet', actor: d.id, set: { self: false } }]);
});

test('By themselves: the browser plays a window only with Run monsters automatically on and every creature still to choose set to it (test 14)', () => {
  const { s, d } = fight();
  assert.equal(L.selfPlay(s, true), null, 'Suggest, the default: the bar waits for the DM');
  ok(apply(s, { type: 'legendarySet', actor: d.id, set: { self: true } }, DM));
  assert.equal(L.selfPlay(s, false), null, 'the device switch off: nothing is sent');
  assert.equal(L.playsItself(s, false), false);
  assert.equal(L.playsItself(s, true), true, 'the bar stays shut');
  const p = L.selfPlay(s, true);
  assert.equal(p.id, d.id);
  assert.deepEqual(p.action, L.pickOf(s, d.id).action);
  assert.ok(p.text.startsWith('Verdigris: '), p.text);
  // Played, round after round: the window closes each time and the dragon's uses are spent, with no tap.
  let played = 0;
  for (let i = 0; i < 40 && played < 3; i++) {
    while (!s.encounter.between && i++ < 40) ok(apply(s, { type: 'endTurn', actor: current(s) }, DM));
    const q = L.selfPlay(s, true);
    if (!q) break;
    ok(apply(s, q.action, DM)); played++;
    if (s.encounter.between) ok(apply(s, { type: 'legendary', done: true }, DM));
  }
  assert.ok(played >= 1, 'it played at least one window');
});

test('By themselves: a second creature set to Suggest keeps the window for the DM; a pick that is null becomes a skip', () => {
  const { s, d } = fight();
  ok(apply(s, { type: 'legendarySet', actor: d.id, set: { self: true } }, DM));
  const w = s.encounter.between;
  const other = { ...s.entities[d.id], id: 'twin', name: 'Twin', legend: { ...s.entities[d.id].legend, self: false } };
  const s2 = { ...s, entities: { ...s.entities, twin: other }, encounter: { ...s.encounter, between: { ...w, offered: [...w.offered, 'twin'] } } };
  assert.equal(L.selfPlay(s2, true), null, 'one to choose is on Suggest');
  assert.equal(L.playsItself(s2, true), false, 'the bar opens');
  const spent = structuredClone(s);
  ok(apply(spent, { type: 'legendarySet', actor: d.id, set: { acts: 3 } }, DM));
  assert.equal(L.pickOf(spent, d.id), null);
  assert.deepEqual(L.selfPlay(spent, true)?.action, { type: 'legendary', actor: d.id, skip: true });
});

test("the pick works from the DM's view, which holds no timeline (it was a broken bar in a hosted table)", () => {
  const { s, d } = fight();
  const { timeline, ...bare } = s;
  assert.ok(timeline !== undefined);
  assert.deepEqual(L.pickOf(bare, d.id), L.pickOf(s, d.id));
  assert.equal('timeline' in bare, false, 'the state given is not touched');
});
