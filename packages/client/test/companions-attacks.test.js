// The client's side of Companions C9c (issue #486, DEBT C18): the Investment of the Chain Master chooser in the cast of Find Familiar (`summon.invest`) and the
// familiar's attacks through its master's feature (`attack` with `familiar` and `via`): Pact of the Chain's forgone attack and Investment's Quick Attack.
// The client imports the rules as ./shared, so the test lays the two side by side in a temporary folder, as companions.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'compatk-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const imp = (f) => import(pathToFileURL(join(tmp, f)));
const C = await imp('companions.js');
const { attackRows, tabRows } = await imp('actionpanel.js');
const { apply, current, makeEntity } = await imp('shared/engine.js');
const { derive } = await imp('shared/derive.js');
const { newGame } = await imp('shared/scenario.js');
const { gridOf } = await imp('shared/grid.js');

const DM = { role: 'dm', userId: 'dm' };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const PACT = 'eldritch-invocations-pact-of-the-chain', INVEST = 'eldritch-invocations-investment-of-the-chain-master';
const warlock = (inv = ['pact-of-the-chain', 'investment-of-the-chain-master']) => ({ name: 'Mor', class: 'warlock', level: 5, subclass: 'fiend',
  abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 18 }, skills: ['arcana', 'deception'], weapons: ['dagger'], spells: ['eldritch-blast', 'chill-touch', 'hex'], choices: { 'eldritch-invocations': inv } });
const dryOf = (s) => (a) => { const r = apply(structuredClone(s), a, DM); return r.ok ? '' : r.error; };
function table(sheet = warlock()) {
  const s = newGame(7);
  for (const k of Object.keys(s.entities)) delete s.entities[k];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = 'grass';
  s.settings.autoEngage = false;
  s.entities.mor = makeEntity(derive(sheet).record, { id: 'mor', kind: 'pc', side: 'party', pos: { q: 0, r: 0, z: 0 } });
  return s;
}
const familiarOf = (s) => Object.values(s.entities).find((e) => e.bond?.kind === 'familiar');
// A fight on Mor's turn with an invested imp and a goblin beside the imp.
function fight(sheet = warlock()) {
  const s = table(sheet), G = gridOf(s.map);
  ok(apply(s, { type: 'cast', actor: 'mor', spell: 'find-familiar', via: PACT, summon: { form: 'imp', type: 'fiend', at: [G.neighbors(s.entities.mor.pos)[0]], invest: { move: 'fly' } } }, DM));
  const f = familiarOf(s);
  let g = null;
  for (const h of G.neighbors(f.pos)) { if (G.dist(h, s.entities.mor.pos) !== 1) continue; const r = apply(s, { type: 'spawn', monster: 'goblin-warrior', at: h }, DM); if (r.ok) { g = r.events[0].id; break; } }
  s.entities[g].hp = s.entities[g].maxHp = 300;
  ok(apply(s, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 6 }, DM));
  for (let i = 0; i < 20 && current(s) !== 'mor'; i++) ok(apply(s, { type: 'endTurn', actor: current(s) }, DM));
  assert.equal(current(s), 'mor');
  return { s, f, g };
}

test('the plan of Find Familiar for a warlock with Investment: the Speed is a required choice, the damage type an optional one, and the cast carries `summon.invest`', () => {
  const s = table(), mor = s.entities.mor;
  const plan = C.summonPlan(s, mor, 'find-familiar', 1);
  assert.deepEqual(plan.choices.map((c) => c.key), ['type', 'form', 'move', 'damage']);
  const move = plan.choices.find((c) => c.key === 'move'), dmg = plan.choices.find((c) => c.key === 'damage');
  assert.deepEqual(move.options.map((o) => o.v), ['fly', 'swim']); assert.match(move.options[0].label, /Fly 40 ft/);
  assert.deepEqual(dmg.options.map((o) => o.v), ['necrotic', 'radiant']); assert.equal(dmg.optional, true);
  assert.equal(plan.invest, 'Investment of the Chain Master');
  const m = { actor: 'mor', slot: 1, pick: { type: 'fiend', form: 'imp' }, at: [{ q: 1, r: 0 }], ids: [] };
  assert.match(C.summonMissing(plan, m), /speed/i, 'the Speed is asked for before anything else');
  m.pick.move = 'swim';
  assert.equal(C.summonMissing(plan, m), '', 'the damage type may be left alone');
  assert.deepEqual(C.summonAction(plan, m).summon.invest, { move: 'swim' });
  m.pick.damage = 'necrotic';
  const a = C.summonAction(plan, m);
  assert.deepEqual(a.summon.invest, { move: 'swim', damage: 'necrotic' });
  assert.equal(dryOf(s)({ ...a, via: PACT }), '', 'the engine takes exactly that');
  ok(apply(s, { ...a, via: PACT, summon: { ...a.summon, at: [gridOf(s.map).neighbors(mor.pos)[0]] } }, DM));
  assert.equal(familiarOf(s).speeds.swim, 40);
});

test('no Investment, no choices: a warlock without the invocation, and a spell that is not Find Familiar, are asked nothing more', () => {
  const s = table(warlock(['pact-of-the-chain']));
  const plan = C.summonPlan(s, s.entities.mor, 'find-familiar', 1);
  assert.deepEqual(plan.choices.map((c) => c.key), ['type', 'form']); assert.equal(plan.invest, undefined);
  const m = { actor: 'mor', slot: 1, pick: { type: 'fiend', form: 'imp' }, at: [{ q: 1, r: 0 }], ids: [] };
  assert.equal(C.summonAction(plan, m).summon.invest, undefined);
});

test('a familiar already there: Find Familiar changes its form where it stands and the Investment is chosen again', () => {
  const { s } = fight();
  s.encounter = null;
  const plan = C.summonPlan(s, s.entities.mor, 'find-familiar', 1);
  assert.equal(plan.taps.kind, 'none');
  const a = C.summonAction(plan, { actor: 'mor', slot: 1, pick: { type: 'fiend', form: 'imp', move: 'fly', damage: 'radiant' }, at: [], ids: [] });
  assert.deepEqual(a.summon, { type: 'fiend', form: 'imp', invest: { move: 'fly', damage: 'radiant' } });
});

test('the familiar\'s attacks are rows on the master: one for each feature and each attack that rolls, the Quick Attack a Bonus Action, the forgone one a familiar Reaction', () => {
  const { s, f } = fight(), mor = s.entities.mor;
  const rows = C.companionRows(s, mor, dryOf(s)).attacks;
  const sting = f.actions.find((a) => a.id === 'sting');
  assert.ok(sting);
  assert.deepEqual(rows.map((r) => r.id).sort(), [`comp:fatk:${f.id}:${INVEST}:sting`, `comp:fatk:${f.id}:${PACT}:sting`].sort());
  const quick = rows.find((r) => r.id.includes(INVEST)), forgo = rows.find((r) => r.id.includes(PACT));
  assert.equal(quick.time, 'bonus'); assert.equal(quick.chip, 'Bonus'); assert.match(quick.sub, /its attack at once/);
  assert.equal(forgo.time, null); assert.equal(forgo.chip, 'Familiar'); assert.match(forgo.sub, /give up one of your attacks/);
  assert.equal(quick.why, ''); assert.equal(forgo.why, '');
  assert.deepEqual(quick.mode, { kind: 'famAttack', actor: 'mor', familiar: f.id, via: INVEST, attack: 'sting', label: `${f.name}: Sting` });
  assert.ok(!rows.some((r) => r.id.endsWith(':invisibility')), 'Invisibility is not an attack');
  const armed = C.companionRows(s, mor, dryOf(s), { mode: quick.mode }).attacks;
  assert.deepEqual(armed.filter((r) => r.armed).map((r) => r.id), [quick.id]);
});

test('a tap on a creature while one is armed sends the engine\'s own action, and the engine\'s refusal is shown with the row left armed', () => {
  const { s, f, g } = fight();
  const sent = [], toasts = [], modes = [];
  const comp = C.initCompanions({ state: () => s, act: (a) => sent.push(a), toast: (m) => toasts.push(m), dry: dryOf(s), setMode: (m) => modes.push(m), move: { kind: 'move' }, mode: () => modes.at(-1) ?? { kind: 'move' }, render: () => {}, selected: () => 'mor' });
  const mode = C.companionRows(s, s.entities.mor, dryOf(s)).attacks.find((r) => r.id.includes(PACT)).mode;
  assert.equal(comp.tap(mode, { q: 0, r: 0 }, g), true);
  assert.deepEqual(sent, [{ type: 'attack', actor: 'mor', familiar: f.id, via: PACT, attack: 'sting', target: g }]);
  assert.deepEqual(modes.at(-1), { kind: 'move' });
  assert.match(comp.hintFor(mode), /Imp: Sting: tap a target|: tap a target/);
  // The engine's words when it would refuse: the familiar's Reaction already spent.
  f.reactionUsed = true; sent.length = 0;
  const bad = C.initCompanions({ state: () => s, act: (a) => sent.push(a), toast: (m) => toasts.push(m), dry: dryOf(s), setMode: (m) => modes.push(m), move: { kind: 'move' }, mode: () => mode, render: () => {}, selected: () => 'mor' });
  assert.equal(bad.tap(mode, { q: 0, r: 0 }, g), true);
  assert.equal(sent.length, 0); assert.match(toasts.at(-1), /already used its Reaction/);
  // A tap on empty ground or the master puts it down.
  assert.equal(bad.tap(mode, { q: 3, r: 3 }, null), true); assert.deepEqual(modes.at(-1), { kind: 'move' });
});

test('the rows are greyed in the engine\'s words: outside a fight, and with the familiar\'s Reaction spent for the forgone one only', () => {
  const { s, f } = fight(), mor = s.entities.mor;
  f.reactionUsed = true;
  const rows = C.companionRows(s, mor, dryOf(s)).attacks;
  assert.match(rows.find((r) => r.id.includes(PACT)).why, /already used its Reaction/);
  assert.equal(rows.find((r) => r.id.includes(INVEST)).why, '', 'Quick Attack spends no Reaction of the familiar');
  const calm = table(); const G = gridOf(calm.map);
  ok(apply(calm, { type: 'cast', actor: 'mor', spell: 'find-familiar', via: PACT, summon: { form: 'imp', type: 'fiend', at: [G.neighbors(calm.entities.mor.pos)[0]], invest: { move: 'fly' } } }, DM));
  const out = C.companionRows(calm, calm.entities.mor, dryOf(calm)).attacks;
  assert.equal(out.length, 2);
  assert.ok(out.every((r) => /works in a fight/.test(r.why)), JSON.stringify(out.map((r) => r.why)));
});

test('a warlock with neither feature has no rows, and the panel puts the rows on the Attacks tab (and Quick Attack on the Bonus tab) through the companions', () => {
  const none = table({ name: 'Mor', class: 'wizard', level: 5, abilities: { str: 8, dex: 14, con: 14, int: 18, wis: 12, cha: 10 }, skills: ['arcana', 'history'], spells: ['find-familiar'] }); const G = gridOf(none.map);
  ok(apply(none, { type: 'cast', actor: 'mor', spell: 'find-familiar', summon: { form: 'owl', type: 'celestial', at: [G.neighbors(none.entities.mor.pos)[0]] } }, DM));
  assert.deepEqual(C.companionRows(none, none.entities.mor, dryOf(none)).attacks, []);
  const { s } = fight();
  assert.ok(attackRows(s, s.entities.mor).every((r) => !r.id.startsWith('comp:')), 'attackRows is the creature\'s own');
  void tabRows;
});
