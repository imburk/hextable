// Magic Circle's kinds and its reverse toggle, the circle and the pack drawn, the pack's Move tab row, and the pack's log line (issue #838, DEBT W68 (1)).
// The client imports the rules as ./shared, so the test lays the two side by side in a temporary folder, as wallaim.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'circle-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const imp = (f) => import(pathToFileURL(join(tmp, f)));
const { isWard, wardKinds, wardToggle, wardArg, wardWords, wardOptions, reverseOptions, rollers, rollMode, rollWords, packReady, rollAct } = await imp('wallaim.js');
const { moveRows, bonusRows } = await imp('actionpanel.js');
const { buildOverlay, zoneLabel } = await imp('three-build.js');
const { LINE_KINDS } = await imp('feedback.js');
const { SPELLS } = await imp('shared/content/index.js');
const { apply, current } = await imp('shared/engine.js');
const { newGame } = await imp('shared/scenario.js');

const DM = { role: 'dm', userId: 'dm' };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
function field() {
  const s = newGame(5);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== 'party') delete s.entities[id];
  for (let q = -16; q <= 40; q++) for (let r = -8; r <= 8; r++) s.map.levels[0].tiles[`${q},${r}`] = { t: 'grass' };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [['wizard', -6, 0], ['fighter', -8, 0], ['rogue', -8, 2], ['cleric', 0, 0]]) ok(apply(s, { type: 'place', actor: id, to: { q, r } }, DM));
  Object.assign(s.entities.cleric, { slots: { 3: 3 }, slotsMax: { 3: 3 } });
  s.entities.cleric.spells.push('conjure-animals', 'magic-circle');
  return s;
}
// A goblin to cast at, a fight begun, and the cleric's turn waited for.
function clericTurn(s) {
  ok(apply(s, { type: 'spawn', monster: 'goblin-warrior', at: { q: 6, r: 0 }, name: 'G1' }, DM));
  const g = Object.values(s.entities).find((x) => x.name === 'G1'); g.hp = g.maxHp = 900;
  ok(apply(s, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 16 }, DM));
  for (let i = 0; i < 30 && current(s) !== 'cleric'; i++) ok(apply(s, { type: 'endTurn', actor: current(s) }, DM));
  assert.equal(current(s), 'cleric');
}
const th = { hl: { move: [0, 0, 0, 1], area: [0, 0, 0, 1], target: [0, 0, 0, 1], ally: [0, 0, 0, 1], select: [0.2, 0.4, 0.6, 1] }, arenaRim: [1, 1, 1] };
const overlay = (state) => buildOverlay({ state, hl: { move: [], area: [], targets: [], allies: [], selected: null, turn: null }, theme: th });

test('Magic Circle is a ward spell: the kinds are the five of the table, taken one by one, and the cast carries a list', () => {
  const sp = SPELLS['magic-circle'];
  assert.ok(isWard(sp)); assert.ok(!isWard(SPELLS['guidance']));
  assert.deepEqual(wardKinds(sp), ['celestial', 'elemental', 'fey', 'fiend', 'undead']);
  assert.deepEqual(wardToggle(wardToggle([], 'undead'), 'fey'), ['undead', 'fey']);
  assert.deepEqual(wardToggle(['undead', 'fey'], 'undead'), ['fey']);
  assert.deepEqual(wardArg(sp, { wards: ['undead', 'fey'], reverse: true }), { choice: ['fey', 'undead'], reverse: true });
  assert.deepEqual(wardArg(sp, { wards: ['fey'], reverse: false }), { choice: ['fey'] });
  assert.deepEqual(wardArg(sp, { wards: ['nonsense', 'fey'] }), { choice: ['fey'] });
});

test('with no kind chosen the hint asks for one; with one it says nothing', () => {
  const sp = SPELLS['magic-circle'];
  assert.match(wardWords(sp, { wards: [] }), /at least one kind/);
  assert.equal(wardWords(sp, { wards: ['fey'] }), null);
  assert.deepEqual(wardOptions(['fey', 'fiend'], ['fiend']).map((o) => [o.value, o.on]), [['fey', false], ['fiend', true]]);
  assert.deepEqual(reverseOptions(true).map((o) => [o.label, o.on]), [['Reverse it (trap them inside)', true]]);
});

test("what the client sends is accepted by the engine, and the circle is drawn only when the cast made one", () => {
  const s = field(), sp = SPELLS['magic-circle'], before = overlay(s).count;
  const r = ok(apply(s, { type: 'cast', actor: 'cleric', spell: 'magic-circle', hex: { q: 2, r: 0 }, slot: 3, ...wardArg(sp, { wards: ['undead', 'fey'], reverse: true }) }, DM));
  assert.ok(r.events.length);
  const fx = s.effects.find((x) => x.spell === 'magic-circle');
  assert.deepEqual(fx.zone.ward, { types: ['fey', 'undead'], reverse: true });
  assert.ok(overlay(s).count > before, 'a ring of runes is drawn');
  assert.equal(zoneLabel(fx), 'Magic Circle (fey, undead), 1 hour, reversed');
  const plain = field(); ok(apply(plain, { type: 'cast', actor: 'cleric', spell: 'magic-circle', hex: { q: 2, r: 0 }, slot: 3, ...wardArg(sp, { wards: ['fiend'] }) }, DM));
  assert.equal(zoneLabel(plain.effects.find((x) => x.spell === 'magic-circle')), 'Magic Circle (fiend), 1 hour');
  // a player's view carries no zone: nothing is drawn from it
  const bare = structuredClone(s); for (const f of bare.effects) delete f.zone;
  assert.equal(overlay(bare).count, before);
  assert.equal(zoneLabel({ name: 'Moonbeam', lasts: '1 minute' }), 'Moonbeam');
});

test('Conjure Animals: its pack is moved in the Move tab once the caster has moved, not rolled with a Bonus Action', () => {
  const s = field(); clericTurn(s);
  ok(apply(s, { type: 'cast', actor: 'cleric', spell: 'conjure-animals', hex: { q: 4, r: 0 }, slot: 3 }, DM));
  const fx = s.effects.find((x) => x.spell === 'conjure-animals'), e = s.entities.cleric;
  assert.ok(fx);
  assert.deepEqual(rollers(s, e), [{ id: fx.id, name: 'Conjure Animals', feet: 30, pack: true }]);
  assert.ok(!bonusRows(s, e).rows.some((r) => r.id === `roll:${fx.id}`), 'no Bonus Action control');
  ok(apply(s, { type: 'move', actor: 'cleric', to: { q: 1, r: 0 } }, DM));
  const row = moveRows(s, e).find((r) => r.id === `roll:${fx.id}`);
  assert.equal(row.label, 'Move the pack');
  assert.deepEqual(row.mode, { kind: 'roll', effect: fx.id, name: 'Conjure Animals', pack: true });
  assert.match(rollWords('Conjure Animals', 30, true), /new space within 30 ft/);
  assert.deepEqual(rollAct('cleric', row.mode, { q: 6, r: 1, z: 0 }), { type: 'moveZone', actor: 'cleric', to: { q: 6, r: 1 }, effect: fx.id });
  assert.ok(overlay(s).count > overlay({ ...s, effects: [] }).count, 'the pack is drawn');
});

test("in a fight the pack is offered only after its caster has moved 5 ft this turn, and the engine's move goes through", () => {
  const s = field(); clericTurn(s);
  ok(apply(s, { type: 'cast', actor: 'cleric', spell: 'conjure-animals', hex: { q: 4, r: 0 }, slot: 3 }, DM));
  const e = s.entities.cleric, fx = s.effects.find((x) => x.spell === 'conjure-animals');
  assert.equal(packReady(s, e), false, 'not moved yet');
  assert.ok(!moveRows(s, e).some((r) => r.label === 'Move the pack'));
  ok(apply(s, { type: 'move', actor: 'cleric', to: { q: 1, r: 0 } }, DM));
  assert.equal(packReady(s, e), true);
  assert.equal(packReady(s, s.entities.wizard), false, 'not its turn');
  const r = ok(apply(s, rollAct('cleric', rollMode(rollers(s, e)[0]), { q: 6, r: 1 }), DM));
  assert.ok(r.events.some((x) => x.type === 'zoneMoved' && x.fx === fx.id));
});

test('the pack\'s move has its own log kind', () => {
  assert.equal(LINE_KINDS.zoneMoved, 'engine');
});

test('the Move group lists the pack row (the panel draws groups from groupRows)', async () => {
  const { groupRows } = await imp('actionpanel.js');
  const s = field(); clericTurn(s);
  ok(apply(s, { type: 'cast', actor: 'cleric', spell: 'conjure-animals', hex: { q: 4, r: 0 }, slot: 3 }, DM));
  const e = s.entities.cleric;
  assert.ok(!groupRows(s, e, 'move').some((r) => r.label === 'Move the pack'));
  ok(apply(s, { type: 'move', actor: 'cleric', to: { q: 1, r: 0 } }, DM));
  assert.equal(groupRows(s, e, 'move').filter((r) => r.label === 'Move the pack').length, 1);
  assert.ok(!groupRows(s, e, 'bonus').some((r) => r.label === 'Move the pack'));
});
