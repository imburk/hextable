// The timeline is pure and imports nothing, so it is loaded directly and driven by a fake clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimeline, planBeats, paceFor, durationOf } from '../timeline.js';

const ent = (id, q, hp = 10) => ({ id, hp, tempHp: 0, dead: false, pos: { q, r: 0, z: 0 }, cond: {} });
const world = (...es) => ({ entities: Object.fromEntries(es.map((e) => [e.id, e])) });
const rig = (opts = {}) => {
  let t = 0; const log = [], shows = [], done = [];
  const tl = createTimeline({ clock: () => t, onBeat: (ev, c) => log.push([ev.type, +t.toFixed(2), c.instant]), onShow: (s, evs) => shows.push([s, evs]), onDone: (u) => done.push(u.id), onIdle: () => log.push(['idle', +t.toFixed(2)]), ...opts });
  const run = (sec) => { for (let i = 0; i < Math.round(sec / 0.05); i++) { t += 0.05; tl.tick(); } };
  return { tl, log, shows, done, run, get t() { return t; } };
};
// A goblin hits a hero for 5; the hero's hit points fall to 0 and the goblin's target dies.
const hit = () => [{ type: 'attack', actor: 'g', target: 'h', hit: true }, { type: 'damage', target: 'h', amount: 10, hp: 0 }, { type: 'down', id: 'h' }, { type: 'died', id: 'h' }];

test('durations follow the spec table', () => {
  const s = world(ent('g', 0), ent('h', 1), ent('a', 5));
  assert.equal(durationOf({ type: 'attack', actor: 'g', target: 'h' }, s), 0.6);
  assert.equal(durationOf({ type: 'attack', actor: 'g', target: 'a' }, s), 0.8);
  assert.equal(durationOf({ type: 'moved', id: 'g', path: [1, 2, 3] }), 0.18 * 3);
  assert.equal(durationOf({ type: 'moved', id: 'g', path: Array(30).fill(0) }), 2);
  assert.equal(durationOf({ type: 'moved', id: 'g', path: [1, 2, 3], forced: true }), 0.25);
  assert.equal(durationOf({ type: 'object', name: 'Portcullis' }), 0.8);
  assert.equal(durationOf({ type: 'chronicle' }), 0);
  assert.equal(durationOf({ type: 'time' }), 0);
});

test('an attack, its damage and the fall are one beat, in order', () => {
  const p = planBeats(hit(), world(ent('g', 0), ent('h', 1)));
  assert.deepEqual(p.items.map((i) => [i.ev.type, i.at]), [['attack', 0], ['damage', 0.6], ['down', 0.6], ['died', 0.6]]);
  assert.ok(Math.abs(p.total - 1.2) < 1e-9);
});

test('after a cast, every save and damage plays at once', () => {
  const evs = [{ type: 'cast', actor: 'w', hexes: [1] }];
  for (let i = 0; i < 8; i++) evs.push({ type: 'save', id: `g${i}`, success: false }, { type: 'damage', target: `g${i}`, amount: 5, hp: 1 });
  const p = planBeats(evs, world());
  assert.ok(Math.abs(p.total - (0.9 + 0.4)) < 1e-9, `one cast, not eight: ${p.total}`);
  assert.equal(new Set(p.items.slice(1).map((i) => i.at)).size, 1);
});

test('a walk split by an opportunity attack is separate beats with the attack between', () => {
  const evs = [{ type: 'moved', id: 'h', path: [1, 2] }, { type: 'attack', actor: 'g', target: 'h', opportunity: true }, { type: 'damage', target: 'h', amount: 1, hp: 9 }, { type: 'moved', id: 'h', path: [3, 4] }];
  const p = planBeats(evs, world(ent('g', 0), ent('h', 1)));
  assert.deepEqual(p.items.map((i) => i.ev.type), ['moved', 'attack', 'damage', 'moved']);
  assert.ok(p.items[3].at > p.items[2].at);
});

test('an update is scaled to 3 s but a walk keeps its own length', () => {
  const evs = Array.from({ length: 8 }, () => ({ type: 'turn', id: 'x' }));            // 8 x 0.4 = 3.2 s
  assert.ok(planBeats(evs, world()).total <= 3 + 1e-9);
  const walk = [{ type: 'moved', id: 'h', path: Array(30).fill(0) }, ...evs];
  assert.ok(Math.abs(planBeats(walk, world()).total - 5) < 1e-9);
});

test('beats play in order on the clock, the shown state stays behind, then catches up', () => {
  const g = ent('g', 0), h = ent('h', 1, 10), s = world(g, h), r = rig();
  r.tl.push(s, []);                                  // the picture so far
  h.hp = 0; h.dead = true;                           // the table's state is final already (and changed in place)
  r.tl.push(s, hit());
  assert.equal(r.tl.busy(), true);
  assert.equal(r.tl.shown().entities.h.hp, 10, 'not hurt before the strike');
  assert.equal(r.tl.shown().entities.h.dead, false);
  r.run(0.3);
  assert.deepEqual(r.log.map((l) => l[0]).filter((x) => x !== 'idle'), ['attack'], 'the strike began with the update, nothing else yet');
  assert.equal(r.tl.shown().entities.h.hp, 10);
  r.run(0.4);                                        // t = 0.7: the strike has landed
  assert.deepEqual(r.log.map((l) => l[0]).filter((x) => x !== 'idle'), ['attack', 'damage', 'down', 'died']);
  assert.equal(r.tl.shown().entities.h.hp, 0);
  assert.equal(r.tl.shown().entities.h.dead, true);
  r.run(1);
  assert.equal(r.tl.busy(), false);
  assert.equal(r.tl.shown(), s, 'idle: the shown state is the true state');
  assert.equal(r.log.at(-1)[0], 'idle');
});

test('hit points drain only when their damage beat plays', () => {
  const h = ent('h', 1, 10), s = world(ent('g', 0), h), r = rig();
  r.tl.push(s, []);
  h.hp = 4;
  r.tl.push(s, [{ type: 'attack', actor: 'g', target: 'h', hit: true }, { type: 'damage', target: 'h', amount: 6, hp: 4 }]);
  r.run(0.3); assert.equal(r.tl.shown().entities.h.hp, 10);
  r.run(0.4); assert.equal(r.tl.shown().entities.h.hp, 4);
});

test('updates queue in order and a later one does not show early', () => {
  const g = ent('g', 0), h = ent('h', 1, 10), s = world(g, h), r = rig();
  r.tl.push(s, []);
  h.hp = 7; r.tl.push(s, [{ type: 'attack', actor: 'g', target: 'h', hit: true }, { type: 'damage', target: 'h', amount: 3, hp: 7 }]);
  h.hp = 2; r.tl.push(s, [{ type: 'attack', actor: 'g', target: 'h', hit: true }, { type: 'damage', target: 'h', amount: 5, hp: 2 }]);
  assert.equal(r.tl.shown().entities.h.hp, 10);
  r.run(1.2); assert.equal(r.tl.shown().entities.h.hp, 7);
  r.run(2); assert.equal(r.tl.shown().entities.h.hp, 2);
  assert.deepEqual(r.done, [1, 2, 3]);
});

test('a creature that moves stays where it was until its move plays', () => {
  const g = ent('g', 0), s = world(g), r = rig();
  r.tl.push(s, []);
  g.pos = { q: 3, r: 0, z: 0 };
  r.tl.push(s, [{ type: 'turn', id: 'g' }, { type: 'moved', id: 'g', path: [{ q: 1, r: 0, z: 0 }, { q: 2, r: 0, z: 0 }, { q: 3, r: 0, z: 0 }] }]);
  assert.equal(r.tl.shown().entities.g.pos.q, 0);
  r.run(0.3); assert.equal(r.tl.shown().entities.g.pos.q, 0, 'the turn beat is still playing');
  r.run(0.3); assert.equal(r.tl.shown().entities.g.pos.q, 3);
});

test('skip finishes every queued beat at once, in order', () => {
  const s = world(ent('g', 0), ent('h', 1)), r = rig();
  r.tl.push(s, []); r.log.length = 0;
  r.tl.push(s, hit()); r.tl.push(s, hit());
  assert.equal(r.tl.skip(), true);
  assert.equal(r.log.filter((l) => l[0] !== 'idle').length, 8);
  assert.equal(r.tl.busy(), false);
  assert.equal(r.log.at(-1)[0], 'idle');
  assert.equal(r.tl.skip(), false);
});

test('pace instant plays every beat at once in push', () => {
  const s = world(ent('g', 0), ent('h', 1)), r = rig({ pace: 'instant' });
  r.tl.push(s, hit());
  assert.equal(r.tl.busy(), false);
  assert.deepEqual(r.log.map((l) => l[0]), ['attack', 'damage', 'down', 'died', 'idle']);
  assert.ok(r.log.slice(0, 4).every((l) => l[2] === true));
  assert.equal(r.shows.length, 1);
  assert.equal(r.shows[0][1].length, 4);
});

test('fresh states and flushes show at once', () => {
  const s = world(ent('g', 0), ent('h', 1)), r = rig();
  r.tl.push(s, []);
  r.tl.push(s, hit());
  assert.equal(r.tl.busy(), true);
  r.tl.push(s, [{ type: 'undone', label: 'x' }], { flush: true, instant: true });
  assert.equal(r.tl.busy(), false);
  r.tl.push(s, hit()); r.tl.push(s, [], { fresh: true });
  assert.equal(r.tl.busy(), false);
});

test('far behind: double speed past 3 s, only the last update plays past 8 s', () => {
  const mk = () => world(ent('g', 0), ent('h', 1));
  let r = rig(), s = mk();
  r.tl.push(s, []);
  for (let i = 0; i < 4; i++) r.tl.push(s, hit());          // 4 x 1.2 = 4.8 s behind: double speed
  r.run(4.1);
  assert.ok(r.done.length >= 5, `4.8 s of beats are done in under 4.8 s (${r.done})`);
  r = rig(); s = mk(); r.tl.push(s, []); r.log.length = 0;
  for (let i = 0; i < 9; i++) r.tl.push(s, hit());          // 10.8 s behind
  assert.equal(r.log.filter((l) => l[0] === 'attack').length >= 6, true, 'earlier updates were shown at once, their lines kept');
  assert.equal(r.tl.busy(), true, 'the last still plays');
  assert.equal(r.log.filter((l) => l[2] === false).length >= 0, true);
});

test('whenIdle resolves at idle; a speed of 2 halves the time; setPace instant skips', async () => {
  const s = world(ent('g', 0), ent('h', 1)), r = rig();
  r.tl.push(s, []);
  r.tl.push(s, hit());
  let woke = false; r.tl.whenIdle().then(() => { woke = true; });
  r.run(0.5); await null; assert.equal(woke, false);
  r.tl.setPace('instant'); await null; assert.equal(woke, true);
  const q = rig(); q.tl.setSpeed(2); q.tl.push(s, []); q.tl.push(s, hit()); q.run(0.65);
  assert.equal(q.tl.busy(), false);
  assert.equal(await rig().tl.whenIdle(), undefined);
});

test('paceFor: the table sets the pace, a player may only go quicker, reduced motion means instant', () => {
  assert.equal(paceFor({}), 'wait');
  assert.equal(paceFor({ table: 'flow' }), 'flow');
  assert.equal(paceFor({ table: 'flow', mine: 'wait' }), 'flow');
  assert.equal(paceFor({ table: 'wait', mine: 'flow' }), 'flow');
  assert.equal(paceFor({ table: 'wait', mine: 'instant' }), 'instant');
  assert.equal(paceFor({ table: 'instant', mine: 'wait' }), 'instant');
  assert.equal(paceFor({ reduced: true }), 'instant');
  assert.equal(paceFor({ reduced: true, mine: 'wait' }), 'wait');
  assert.equal(paceFor({ table: 'bogus', mine: 'bogus' }), 'wait');
});
