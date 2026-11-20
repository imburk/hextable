// Flurry of Blows in the client (issue #614): what a tap on a foe attacks with, when the granted attack is armed, and what is said.
// The client imports the rules as ./shared, so the test lays the two side by side in a temporary folder (as actionpanel.test.js does).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'flurry-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
cpSync(join(here, '..'), tmp, { recursive: true, filter: (p) => !/[\\/](vendor|test)$/.test(p) });
after(() => rmSync(tmp, { recursive: true, force: true }));
const imp = (f) => import(pathToFileURL(join(tmp, f)));
const { tapAttack, rearm, hintOf, spentWords, granted } = await imp('flurry.js');
const { apply, current } = await imp('shared/engine.js');
const { newGame } = await imp('shared/scenario.js');
const { derive } = await imp('shared/derive.js');
const { attackRows } = await imp('actionpanel.js');

const DM = { role: 'dm', userId: 'dm' };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };

// A level 5 monk with a Spear, in a fight beside a goblin, on her turn.
function monkFight() {
  const s = newGame(11);
  const rec = derive({ name: 'Lo', class: 'monk', level: 5, subclass: 'open-hand', abilities: { str: 16, dex: 16, con: 14, int: 10, wis: 14, cha: 10 }, skills: ['acrobatics', 'insight'], weapons: ['spear'] }).record;
  const added = ok(apply(s, { type: 'addCharacter', record: rec, at: { q: 0, r: 0, z: 0 } }, DM));
  const lo = Object.values(s.entities).find((e) => e.name === 'Lo');
  const foe = Object.values(s.entities).find((e) => e.side === 'foe');
  Object.assign(foe.pos, { q: 1, r: 0 }); foe.hp = foe.maxHp = 200;
  ok(apply(s, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 8 }, DM));
  for (let i = 0; i < 40 && current(s) !== lo.id; i++) apply(s, { type: 'endTurn', actor: current(s) }, DM);
  assert.equal(current(s), lo.id, 'her turn');
  return { s, lo, foe, added };
}
const names = (lo) => lo.attacks.map((a) => `${a.id}`);

test('before Flurry, a tap uses whatever reaches first (today\'s rule)', () => {
  const { s, lo } = monkFight();
  assert.ok(names(lo).includes('spear') && names(lo).includes('unarmed-strike'), names(lo).join());
  assert.equal(granted(s, lo), null);
  assert.equal(tapAttack(s, lo, 5), lo.attacks.find((a) => a.type === 'melee' && 5 <= (a.reach ?? 5)).id, 'the first melee attack in reach');
  assert.equal(tapAttack(s, lo, 500), null, 'nothing reaches');
});

test('after Flurry of Blows a tap makes the Unarmed Strike, not the first weapon that reaches', () => {
  const { s, lo, foe } = monkFight();
  const first = tapAttack(s, lo, 5);
  const r = ok(apply(s, { type: 'feature', actor: lo.id, feature: 'flurry-of-blows' }, DM));
  assert.deepEqual(granted(s, lo), { with: 'unarmed-strike', left: 2 });
  assert.equal(tapAttack(s, lo, 5), 'unarmed-strike');
  assert.ok(first, 'a weapon reached before');
  // armed on the update that used it
  const m = rearm(s, lo, r.events);
  assert.deepEqual(m, { id: 'unarmed-strike', flurry: true, name: 'Flurry of Blows' });
  assert.equal(hintOf(s, lo, m), 'Flurry of Blows: 2 Unarmed Strikes. Tap a foe.');
  assert.match(spentWords(lo, r.events.find((e) => e.type === 'std')), /^Flurry of Blows: 1 Focus Point spent \(\d+ left\)\.$/);
  // two strikes, each with the Bonus Action's grant, and it is re-armed after the first
  const a1 = ok(apply(s, { type: 'attack', actor: lo.id, target: foe.id, attack: tapAttack(s, lo, 5) }, DM));
  assert.equal(a1.events.find((e) => e.type === 'attack').name, 'Unarmed Strike');
  const m2 = rearm(s, lo, a1.events);
  assert.ok(m2, 're-armed with one left');
  assert.equal(hintOf(s, lo, m2), 'Flurry of Blows: 1 Unarmed Strike. Tap a foe.');
  const a2 = ok(apply(s, { type: 'attack', actor: lo.id, target: foe.id, attack: tapAttack(s, lo, 5) }, DM));
  assert.equal(a2.events.find((e) => e.type === 'attack').name, 'Unarmed Strike');
  assert.equal(granted(s, lo), null);
  assert.equal(rearm(s, lo, a2.events), null, 'nothing left to arm');
  assert.equal(s.encounter.budget.bonus, 0, 'the Bonus Action went on Flurry');
  assert.equal(s.encounter.budget.action, 1, 'the Action is still whole');
});

test('an explicit armed attack wins over the granted one', () => {
  const { s, lo } = monkFight();
  ok(apply(s, { type: 'feature', actor: lo.id, feature: 'flurry-of-blows' }, DM));
  assert.equal(tapAttack(s, lo, 5, 'spear'), 'spear');
});

test('with Flurry left, a tap beats the Attack action pool; once spent it falls back to the pool and then the first that reaches', () => {
  const { s, lo, foe } = monkFight();
  // Attack action with the Spear: Extra Attack leaves one more from the pool.
  ok(apply(s, { type: 'attack', actor: lo.id, target: foe.id, attack: 'spear' }, DM));
  assert.ok(s.encounter.budget.attacks, 'one attack of the Attack action is left');
  assert.equal(tapAttack(s, lo, 5), 'spear', 'the pool allows it, and no Flurry yet');
  ok(apply(s, { type: 'feature', actor: lo.id, feature: 'flurry-of-blows' }, DM));
  assert.equal(tapAttack(s, lo, 5), 'unarmed-strike', 'Flurry first');
  ok(apply(s, { type: 'attack', actor: lo.id, target: foe.id, attack: 'unarmed-strike' }, DM));
  ok(apply(s, { type: 'attack', actor: lo.id, target: foe.id, attack: 'unarmed-strike' }, DM));
  assert.equal(granted(s, lo), null);
  assert.equal(tapAttack(s, lo, 5), 'spear', 'the pool again');
});

test('Flurry used BEFORE the Attack action still leaves the Attack action to take', () => {
  const { s, lo, foe } = monkFight();
  ok(apply(s, { type: 'feature', actor: lo.id, feature: 'flurry-of-blows' }, DM));
  // the player arms the Spear for the Attack action: the engine takes it as the action's attack, not the Flurry's
  const r = ok(apply(s, { type: 'attack', actor: lo.id, target: foe.id, attack: 'spear' }, DM));
  assert.equal(r.events.find((e) => e.type === 'attack').name, lo.attacks.find((a) => a.id === 'spear').name);
  assert.equal(s.encounter.budget.action, 0, 'the Attack action was begun');
  assert.deepEqual(granted(s, lo), { with: 'unarmed-strike', left: 2 }, 'Flurry strikes untouched');
  // and finishing Flurry, then the Attack action's Unarmed Strike (Extra Attack), is allowed too
  ok(apply(s, { type: 'attack', actor: lo.id, target: foe.id, attack: 'unarmed-strike' }, DM));
  ok(apply(s, { type: 'attack', actor: lo.id, target: foe.id, attack: 'unarmed-strike' }, DM));
  ok(apply(s, { type: 'attack', actor: lo.id, target: foe.id, attack: 'unarmed-strike' }, DM));
});

test('the Unarmed Strike row says how many Flurry strikes are left', () => {
  const { s, lo } = monkFight();
  const row = () => attackRows(s, lo, {}).find((r) => r.id === 'atk:unarmed-strike');
  assert.doesNotMatch(row().chip, /Flurry/);
  ok(apply(s, { type: 'feature', actor: lo.id, feature: 'flurry-of-blows' }, DM));
  assert.equal(row().chip, 'Flurry: 2 left');
});
