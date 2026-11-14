// The dice's own maths (they are drawn by dice.js with its own projection): how a die lies on the board seen from the
// camera, which numerals stay once it is down, and the title of each throw (docs/specs/dice.md, issue #236).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawDie, topScale, __solidsForTest, boardView, restingTurn, uprightTwist, standHeight, sizeBias, MIN_PITCH, titleOf, nextSource, whoIs, expand } from '../dice.js';
import { aiStep } from '../../rules/src/ai.js';
import { apply, current } from '../../rules/src/engine.js';
import { newGame } from '../../rules/src/scenario.js';
import { view, viewEvents } from '../../rules/src/view.js';

const near = (a, b, m = '') => assert.ok(Math.abs(a - b) < 1e-6, `${m} ${a} is not ${b}`);
// Rotate a vector by a quaternion [w, x, y, z]: the same turn dice.js draws with.
const rot = ([w, x, y, z], v) => {
  const t = [2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])];
  return [v[0] + w * t[0] + (y * t[2] - z * t[1]), v[1] + w * t[1] + (z * t[0] - x * t[2]), v[2] + w * t[2] + (x * t[1] - y * t[0])];
};
const qmul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
const CAMS = [{ yaw: 0, pitch: 1.45 }, { yaw: 0.5, pitch: 0.95 }, { yaw: -2.3, pitch: MIN_PITCH }, { yaw: 4, pitch: 0.7 }];

test('the camera turn takes the board\'s up to the screen the way the renderer sees it', () => {
  for (const c of CAMS) {
    const q = boardView(c), up = rot(q, [0, 1, 0]), right = rot(q, [Math.cos(c.yaw), 0, -Math.sin(c.yaw)]), away = rot(q, [-Math.sin(c.yaw), 0, -Math.cos(c.yaw)]);
    near(up[0], 0); near(up[1], Math.cos(c.pitch)); near(up[2], Math.sin(c.pitch));     // toward the viewer by sin(pitch)
    near(right[0], 1); near(right[1], 0); near(right[2], 0);                            // the board's right is the screen's
    near(away[0], 0); near(away[1], Math.sin(c.pitch)); near(away[2], -Math.cos(c.pitch));     // away along the board is up the screen
  }
});

test('every die comes to rest with its rolled face up on the board, its number upright, at any yaw and pitch', () => {
  for (const sides of [4, 6, 8, 10, 12, 20]) for (const c of CAMS) for (const value of [1, sides === 10 ? 9 : sides]) {
    const die = expand([{ sides, value }])[0], rest = restingTurn(die, uprightTwist(die, c, 0)), view = qmul(boardView(c), rest);
    // The face that counts is index `shown - 1` (0 to 9 on a d10); find it by what drawDie would call it.
    const f = rot(rest, solidFaceNormal(die));
    near(f[0], 0, `d${sides} up x`); near(f[1], 1, `d${sides} lies on the board`); near(f[2], 0, `d${sides} up z`);
    const onScreen = rot(view, solidFaceNormal(die));
    near(onScreen[2], Math.sin(c.pitch), `d${sides} faces the viewer by sin pitch`);
    assert.ok(standHeight(die, rest) > 0, 'it stands on the board, not in it');
  }
});

// The outward direction of the die's chosen face, read the way restingTurn does.
const solidFaceNormal = (die) => __solidsForTest(die.sides).faces[die.tens ? die.shown : die.sides === 10 ? die.shown % 10 : die.shown - 1].n;

test('a camera looking steeply down sees the face square on; a shallow one sees it foreshortened by sin(pitch), at least 0.43', () => {
  for (const c of CAMS) {
    const die = expand([{ sides: 20, value: 17 }])[0], rest = restingTurn(die, uprightTwist(die, c, 0)), q = qmul(boardView(c), rest);
    const f = __solidsForTest(20).faces[16], U = rot(q, f.u), W = rot(q, f.w);
    near(Math.abs(U[0]) , 1, 'the number\'s baseline runs across the screen');
    near(W[0], 0, 'and its up is up the screen');
    assert.ok(W[1] > 0, 'upright, never upside down');
    near(W[1], Math.sin(c.pitch), 'the number is squashed by the pitch, no more');
  }
  assert.ok(Math.sin(MIN_PITCH) > 0.43);
});

test('the die is drawn bigger from a low camera, so its number still reads: the plane is kept, the size is biased', () => {
  near(sizeBias(1.45), 1 + 0.9 * (1 - Math.sin(1.45)) / (1 - Math.sin(MIN_PITCH)));
  assert.ok(sizeBias(MIN_PITCH) > 1.85 && sizeBias(MIN_PITCH) <= 1.9 + 1e-9);
  assert.ok(sizeBias(1.45) < 1.02);
  // On a 390 px wide phone at the shallowest pitch: size 35 px, 66 px with the bias; the d20's number is 0.36 of that, made
  // larger once the other faces have faded, and squashed to sin(pitch) of its height by the plane it lies in.
  const size = Math.max(26, Math.min(54, 390 * 0.09)) * sizeBias(MIN_PITCH), tall = size * 0.36 * topScale(Math.sin(MIN_PITCH), 0) * Math.sin(MIN_PITCH);
  assert.ok(tall >= 14, `the number is ${tall.toFixed(1)} px tall`);
  assert.equal(topScale(0.9, 1), 1, 'while the die is moving the numbers are as they were');
});

// A canvas that only remembers the numerals it was asked to write.
function recorder() {
  const texts = [];
  const ctx = new Proxy({ texts }, { get: (t, k) => (k === 'texts' ? t.texts : k === 'fillText' ? (s) => texts.push(s) : k in t ? t[k] : () => {}), set: () => true });
  return { ctx, texts };
}
test('once a die is down only the numeral of its top face is left', () => {
  for (const sides of [6, 8, 12, 20]) {
    const c = CAMS[1], die = { ...expand([{ sides, value: sides }])[0], color: '#c33' }, rest = restingTurn(die, uprightTwist(die, c, 0)), q = qmul(boardView(c), rest);
    const all = recorder(); drawDie(all.ctx, die, 100, 100, 50, q, 1, { top: sides - 1, others: 1 });
    const one = recorder(); drawDie(one.ctx, die, 100, 100, 50, q, 1, { top: sides - 1, others: 0 });
    assert.ok(all.texts.length > 1, `d${sides}: the other faces show numerals while the die is moving`);
    assert.deepEqual(one.texts, [String(sides)], `d${sides}: only the rolled number is left`);
  }
});

// ---------- titles ----------
const world = (extra = {}) => ({ entities: { brenna: { id: 'brenna', name: 'Brenna', side: 'party' }, gob2: { id: 'gob2', name: 'Goblin Warrior 2', side: 'foe' }, pip: { id: 'pip', name: 'Pip', side: 'party' }, ...extra } });
const run = (events, state, dm = false) => { let src = null; const out = []; for (const ev of events) { const was = src; src = nextSource(src, ev); if (ev.dice) out.push(titleOf(ev, state, was, dm)); } return out; };

test('titles say who and what for, from the events', () => {
  const dice = [{ sides: 20, value: 12 }];
  assert.deepEqual(run([
    { type: 'attack', actor: 'brenna', target: 'gob2', name: 'Longsword', hit: true, dice },
    { type: 'damage', target: 'gob2', amount: 7, dtype: 'slashing', dice },
  ], world()), ['Brenna: Longsword attack', 'Brenna: Longsword damage']);
  assert.deepEqual(run([
    { type: 'cast', actor: 'brenna', spell: 'burning-hands', name: 'Burning Hands', targets: ['gob2', 'pip'] },
    { type: 'save', id: 'gob2', abil: 'dex', dc: 13, dice },
    { type: 'save', id: 'pip', abil: 'dex', dc: 13, dice },
    { type: 'damage', target: 'gob2', amount: 7, dtype: 'fire', dice },
  ], world()), ['Goblin Warrior 2: Dexterity save vs Burning Hands', 'Pip: Dexterity save vs Burning Hands', 'Brenna: Burning Hands damage']);
  assert.deepEqual(run([{ type: 'check', id: 'pip', ability: 'dex', skill: 'stealth', hide: true, dice }, { type: 'check', id: 'pip', ability: 'str', skill: 'sleight-of-hand', dice }, { type: 'check', id: 'brenna', ability: 'wis', skill: 'perception', search: true, dice }, { type: 'deathSave', id: 'pip', roll: 11, dice }, { type: 'concentration', id: 'brenna', name: 'Bless', dice }], world()),
    ['Pip: Hide (Stealth)', 'Pip: Sleight of hand check', 'Brenna: Search', 'Pip: Death Save', 'Brenna: Concentration (Bless)']);
  assert.equal(titleOf({ type: 'attack', actor: 'gob2', target: 'pip', name: 'Scimitar', opportunity: true, dice }, world(), null), 'Goblin Warrior 2: Opportunity Attack (Scimitar)');
  // The DM is sent `by`: a trap or a fall rolls for no one.
  assert.deepEqual(run([{ type: 'damage', target: 'pip', amount: 3, dtype: 'fire', by: 'gob2', dice }, { type: 'damage', target: 'pip', amount: 3, dtype: 'bludgeoning', by: null, dice }], world(), true), ['Goblin Warrior 2: Fire damage', 'Bludgeoning damage']);
});
test('a new turn ends what explained the dice: a later damage is not blamed on the last attack', () => {
  const dice = [{ sides: 6, value: 2 }];
  assert.deepEqual(run([{ type: 'attack', actor: 'brenna', target: 'gob2', name: 'Longsword', hit: true }, { type: 'turn', id: 'pip' }, { type: 'damage', target: 'gob2', amount: 2, dtype: 'fire', dice }], world()), ['Fire damage']);
  assert.deepEqual(run([{ type: 'attack', actor: 'brenna', target: 'gob2', name: 'Longsword', hit: false }, { type: 'damage', target: 'gob2', amount: 2, dtype: 'fire', dice }], world()), ['Fire damage'], 'a miss explains no damage');
});

test('a creature the viewer is not sent is "Someone", and no purpose is borrowed from an event they were not sent', () => {
  const dice = [{ sides: 8, value: 3 }], seen = world();              // no `ghost` in a player's state
  assert.equal(whoIs(seen, 'ghost'), 'Someone');
  assert.equal(whoIs(seen, undefined), 'Someone');
  assert.equal(whoIs(world({ ghost: { id: 'ghost', name: 'Shadow Dragon', side: 'foe', hidden: true } }), 'ghost'), 'Someone', 'a record marked hidden is nobody a player knows');
  assert.equal(whoIs(world({ ghost: { id: 'ghost', name: 'Shadow Dragon', side: 'foe', hidden: true } }), 'ghost', true), 'Shadow Dragon', 'the DM is sent everything');
  assert.equal(titleOf({ type: 'save', id: 'ghost', abil: 'wis', dice }, seen, null), 'Someone: Wisdom save');
  assert.equal(titleOf({ type: 'damage', target: 'pip', amount: 4, dtype: 'cold', dice }, seen, nextSource(null, { type: 'cast', actor: 'brenna', name: 'Bless', targets: ['brenna'] })), 'Cold damage', 'a visible spell that did not touch Pip says nothing of this damage');
  assert.ok(!JSON.stringify(titleOf({ type: 'damage', target: 'pip', amount: 4, dtype: 'cold', dice }, seen, null)).includes('Shadow'));
});

// The real view, for one hand-made hit by a hidden goblin: its attack is dropped, its damage comes with its faces and no `by`.
test('a hit by a creature the DM has hidden: the player is sent the damage and its faces, and the title names no one', () => {
  const s = newGame(5), PLAYER = { role: 'player', userId: 'pat' }, DM = { role: 'dm', userId: 'dm' };
  s.entities.m1.hidden = true;
  const dice = [{ sides: 20, value: 15 }], dmg = [{ sides: 6, value: 4 }];
  const events = [{ type: 'attack', actor: 'm1', target: 'fighter', name: 'Scimitar', hit: true, total: 19, ac: 16, nat: 15, rolls: [15], dice, bonus: 4 },
    { type: 'damage', target: 'fighter', amount: 6, dtype: 'slashing', hp: 3, dice: dmg, bonus: 2, by: 'm1' }];
  const mine = viewEvents(events, s, PLAYER), vs = view(s, PLAYER);
  assert.deepEqual(mine.map((e) => e.type), ['damage'], 'the hidden goblin\'s attack is not sent');
  assert.ok(mine[0].dice, 'but the damage faces are');
  assert.deepEqual(run(mine, vs), ['Slashing damage']);
  assert.ok(!JSON.stringify(mine).includes('Goblin') && !JSON.stringify(mine).includes('Scimitar'));
  // The DM's own screen is sent everything and says who.
  assert.deepEqual(run(viewEvents(events, s, DM), view(s, DM), true), ['Goblin Warrior 1: Scimitar attack', 'Goblin Warrior 1: Scimitar damage']);
  // After another visible attack the hidden one's damage is still not given that attacker's name: the target did not match.
  const after = [{ type: 'attack', actor: 'rogue', target: 'm2', name: 'Dagger', hit: true, total: 14, dice, bonus: 3 }, ...events];
  assert.deepEqual(run(viewEvents(after, s, PLAYER), vs).slice(-1), ['Slashing damage']);
});

// The real thing: a goblin the DM has hidden fights on. What a player is sent for its rolls gives no name and no purpose.
test('a hidden creature\'s rolls, as the player\'s view sends them, never put its name or its spell in a title', () => {
  const PLAYER = { role: 'player', userId: 'pat' }, DM = { role: 'dm', userId: 'dm' };
  let dmTitles = 0, playerTitles = 0;
  for (const seed of [1, 2, 3, 7]) {
    const s = newGame(seed);
    s.entities.m1.hidden = true; s.entities.m2.hidden = true;
    const batches = [];
    let res = apply(s, { type: 'startEncounter', center: s.entities.m1.pos, radius: 30 }, DM);
    batches.push([res.events, structuredClone(s)]);
    for (let i = 0; i < 400 && s.encounter; i++) {
      const id = current(s);
      res = apply(s, aiStep(s, id) ?? { type: 'endTurn', actor: id }, DM);
      if (!res.ok) res = apply(s, { type: 'endTurn', actor: id }, DM);
      batches.push([res.events, structuredClone(s)]);
    }
    for (const [events, st] of batches) {
      const mine = viewEvents(events, st, PLAYER), vs = view(st, PLAYER);
      // A goblin the view does not know of (not in the entities it was sent) is in no title; one it does know is named as the view names it.
      const unknown = Object.values(st.entities).filter((e) => !vs.entities[e.id]).map((e) => e.name);
      for (const t of run(mine, vs, false)) { playerTitles++; for (const n of unknown) assert.ok(!t.includes(n), `a title gave away ${n}: ${t}`); }
      dmTitles += run(viewEvents(events, st, DM), view(st, DM), true).length;
    }
  }
  assert.ok(playerTitles > 0 && dmTitles >= playerTitles, `the fights threw dice (${playerTitles} shown to the player, ${dmTitles} to the DM)`);
});
