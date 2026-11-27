// The heights a flyer can end a move at (docs/specs/fly-swim-control.md, C1). heights.js is pure but imports the rules as ./shared
// (where the build puts them), so the test lays the two side by side in a temporary folder, as floors.test.js does.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)), tmp = mkdtempSync(join(tmpdir(), 'heights-'));
cpSync(join(here, '../../rules/src'), join(tmp, 'shared'), { recursive: true });
for (const f of ['heights.js', 'three-build.js', 'floors.js']) cpSync(join(here, '..', f), join(tmp, f));       // heights.js takes the pick-area rule from three-build.js (pure too)
writeFileSync(join(tmp, 'package.json'), '{"type":"module"}');
after(() => rmSync(tmp, { recursive: true, force: true }));
const imp = (f) => import(pathToFileURL(join(tmp, f)).href);
const HT = await imp('heights.js');
const { apply, current, moveOptions, aloft, FT } = await imp('shared/engine.js');
const { newGame } = await imp('shared/scenario.js');
const { newMap } = await imp('shared/map.js');
const H = await imp('shared/hex.js');

const DM = { role: 'dm', userId: 'dm' };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
// Open stone ground six hexes out, a roof 10 ft up over the hex 2,1 and the four hexes of a solid ledge at 3..4,-1..0.
function crag() {
  const ground = Object.fromEntries(H.range({ q: 0, r: 0 }, 6).map((h) => [H.col(h), { t: 'stone' }]));
  const ledge = {};
  for (const k of ['3,0', '4,0', '3,-1', '4,-1']) { delete ground[k]; ledge[k] = { t: 'stone' }; }
  ledge['2,1'] = { t: 'stone' };
  return newMap({ id: 'crag', name: 'The crag', starts: [{ q: -1, r: 0 }], levels: [{ id: 'ground', name: 'Ground', z: 0, tiles: ground }, { id: 'ledge', name: 'Ledge', z: 10, tiles: ledge }] });
}
function world({ fly = 60, at = { q: -1, r: 1 } } = {}) {
  const s = newGame(12);
  ok(apply(s, { type: 'loadMap', map: crag() }, DM));
  ok(apply(s, { type: 'setting', key: 'autoEngage', value: false }, DM));
  for (const [id, q, r] of [['fighter', 2, 0], ['rogue', -1, 0], ['cleric', -2, 3], ['wizard', at.q, at.r]]) s.entities[id].pos = { q, r, z: 0 };
  if (fly) ok(apply(s, { type: 'setSpeed', actor: 'wizard', mode: 'fly', feet: fly }, DM));
  return s;
}
const fight = (s) => { ok(apply(s, { type: 'spawn', monster: 'goblin-warrior', at: { q: -4, r: 0 } }, DM)); ok(apply(s, { type: 'startEncounter', center: { q: 0, r: 0 }, radius: 6 }, DM)); };
const turnOf = (s, id) => { let n = 0; while (current(s) !== id) { ok(apply(s, { type: 'endTurn', actor: current(s) }, DM)); assert.ok(++n < 40); } };
const fts = (h) => h.heights.map((r) => r.ft);

test('a flyer on the ground: a block for the ground and one for each 5 ft it can reach, the ground block is where it is', () => {
  const s = world(), e = s.entities.wizard, h = HT.heightsOf(s, e);
  assert.ok(h.can);
  assert.equal(h.here, 0);
  assert.equal(h.z0, 0);
  assert.deepEqual(fts(h).slice(0, 4), [0, 5, 10, 15]);
  assert.ok(h.heights[0].ground && h.heights[0].here);
  assert.equal(h.heights.at(-1).ft, 50, 'the engine looks 40 ft above the highest floor (10 ft)');
  assert.ok(h.capped);
  assert.deepEqual(h.gaps, []);
  assert.equal(h.heights[1].up, 5);
  assert.equal(h.heights[6].up, 30);
  // The ground block is the walking reach: every place there is a floor, the ledge at 10 ft among them.
  assert.ok(h.heights[0].cells.every((c) => c.floor));
  assert.ok(h.heights[0].cells.some((c) => c.h.z === 10 && c.h.q === 3));
  // 10 ft is where the ledge and the roof are: a place to stand, drawn solid; the air beside it is not.
  const ten = h.heights[2];
  assert.ok(ten.stand);
  assert.ok(ten.cells.some((c) => c.floor) && ten.cells.some((c) => !c.floor));
  assert.ok(!h.heights[1].stand);
  for (const r of h.heights.slice(1)) for (const c of r.cells) assert.equal(c.h.z, r.z);
  for (const r of h.heights) for (let i = 1; i < r.cells.length; i++) assert.ok(r.cells[i - 1].cost <= r.cells[i].cost, 'cheapest first');
});

test('a flyer in the air: its own height is the block lit, the ground block lands it, and straight down has a cost', () => {
  const s = world(), e = s.entities.wizard;
  ok(apply(s, { type: 'move', actor: 'wizard', to: { q: -1, r: 1, z: 20 } }, DM));
  assert.equal(e.pos.z, 20);
  const h = HT.heightsOf(s, e);
  assert.equal(h.here, 20);
  assert.equal(h.heights.find((r) => r.here).ft, 20);
  assert.equal(h.heights[0].up, 20, 'straight down to the ground');
  assert.equal(HT.rowOf(h, null).ft, 20, 'with nothing picked a move keeps its height');
  assert.equal(HT.stepRow(h, HT.rowOf(h, null), 1).ft, 25);
  assert.equal(HT.stepRow(h, HT.rowOf(h, null), -1).ft, 15);
  assert.equal(HT.stepRow(h, h.heights[0], -1), null);
  assert.equal(HT.stepRow(h, h.heights.at(-1), 1), null);
});

test('under a floor: the roof is a place to stand in its own column, and the feet to it are the way round, not straight up', () => {
  const s = world({ at: { q: 2, r: 1 } }), e = s.entities.wizard;
  fight(s); turnOf(s, 'wizard');
  const h = HT.heightsOf(s, e);
  // No flyer passes through a floor: the roof 10 ft over its head is reached round its edge, so it costs more than the 10 ft straight up would.
  const five = h.heights.find((r) => r.ft === 5), ten = h.heights.find((r) => r.ft === 10);
  assert.equal(five.up, 5);
  assert.ok(ten.up > 10, `the roof costs ${ten.up} ft`);
  assert.ok(ten.stand, 'the roof is a floor in its own column');
  assert.ok(ten.cells.some((c) => c.h.q === 2 && c.h.r === 1 && c.floor), 'it can fly round and land on the roof');
  for (const g of h.gaps) assert.ok(g.z > 0 && g.z < h.heights.at(-1).z && !h.heights.some((r) => r.z === g.z));
});

test('prone: no heights, and the reason is words; standing gives them back', () => {
  const s = world(), e = s.entities.wizard;
  ok(apply(s, { type: 'condition', actor: 'wizard', condition: 'prone', on: true }, DM));
  assert.ok(!aloft(s, e));
  const h = HT.heightsOf(s, e);
  assert.ok(!h.can); assert.deepEqual(h.heights, []);
  assert.deepEqual(HT.flyState(s, e, 'Wren'), { has: true, can: false, why: "Can't fly: Wren is Prone. Stand up first." });
  ok(apply(s, { type: 'condition', actor: 'wizard', condition: 'prone', on: false }, DM));
  assert.ok(HT.heightsOf(s, e).can);
  assert.deepEqual(HT.flyState(s, e), { has: true, can: true, why: '' });
  assert.deepEqual(HT.flyState(s, s.entities.fighter), { has: false, can: false, why: '' }, 'no Fly Speed, no Fly row');
});

test('not its turn: nothing to pick and nothing left; on its turn, the feet left are the engine\'s', () => {
  const s = world(), e = s.entities.wizard;
  fight(s);
  const other = s.encounter.order.find((o) => o.id !== 'wizard').id;
  turnOf(s, other);
  let h = HT.heightsOf(s, e);
  assert.ok(!h.can);
  assert.deepEqual([h.left.walk, h.left.fly, h.left.turn], [0, 0, false]);
  assert.equal(HT.flyState(s, e).why, 'Waiting for your turn.');
  turnOf(s, 'wizard');
  h = HT.heightsOf(s, e);
  assert.ok(h.can);
  assert.deepEqual([h.left.walk, h.left.fly, h.left.fighting], [30, 60, true]);
  assert.equal(h.heights.at(-1).ft, 50, '60 ft of flying reaches the 50 ft the engine looks to');
  // Walk 15 ft: 15 ft of the Fly Speed is used too.
  ok(apply(s, { type: 'move', actor: 'wizard', to: { q: -1, r: 4 } }, DM));
  const l = HT.waysLeft(s, e);
  assert.deepEqual([l.walk, l.fly], [15, 45]);
  assert.equal(HT.heightsOf(s, e).heights.at(-1).ft, 45);
});

test('with Dash used the flying left doubles as the engine doubles it', () => {
  const s = world(), e = s.entities.wizard;
  fight(s); turnOf(s, 'wizard');
  ok(apply(s, { type: 'dash', actor: 'wizard' }, DM));
  const l = HT.waysLeft(s, e);
  assert.deepEqual([l.walk, l.fly], [60, 120]);
  ok(apply(s, { type: 'move', actor: 'wizard', to: { q: -1, r: 1, z: 40 } }, DM));
  assert.deepEqual([HT.waysLeft(s, e).walk, HT.waysLeft(s, e).fly], [20, 80]);
  assert.equal(HT.feet(-10), 0);
});

test('every place the engine reports is within the feet left, in and out of a fight, on the ground and in the air', () => {
  const check = (s, id) => {
    const e = s.entities[id], l = HT.waysLeft(s, e), most = Math.max(l.walk, l.climb, l.fly);
    let n = 0;
    for (const [, v] of moveOptions(s, e)) { n++; assert.ok(v.cost <= most, `${id}: ${v.cost} ft within ${most}`); }
    for (const r of HT.heightsOf(s, e).heights) for (const c of r.cells) if (!c.floor) assert.ok(c.cost <= l.fly, `${id}: an air cell at ${c.cost} ft within ${l.fly} of flying`);
    return n;
  };
  const s = world();
  assert.ok(check(s, 'wizard') > 50); check(s, 'fighter');
  fight(s); turnOf(s, 'wizard');
  assert.ok(check(s, 'wizard') > 50);
  ok(apply(s, { type: 'move', actor: 'wizard', to: { q: 0, r: 1, z: 15 } }, DM));
  assert.ok(check(s, 'wizard') > 10);
  ok(apply(s, { type: 'dash', actor: 'wizard' }, DM));
  check(s, 'wizard');
  turnOf(s, 'fighter'); check(s, 'fighter');
});

test('the pick is dropped by a move, a landing, a fall, a turn change and the loss of flight; otherwise it stands', () => {
  const s = world(), e = s.entities.wizard;
  fight(s); turnOf(s, 'wizard');
  let h = HT.heightsOf(s, e), pick = HT.makePick(s, e, 15);
  assert.equal(HT.livePick(pick, s, e, h), pick);
  assert.equal(HT.rowOf(h, pick).ft, 15);
  assert.equal(HT.livePick(pick, s, s.entities.fighter, h), null, 'another creature');
  ok(apply(s, { type: 'move', actor: 'wizard', to: { q: -1, r: 2, z: 15 } }, DM));              // a move
  h = HT.heightsOf(s, e);
  assert.equal(HT.livePick(pick, s, e, h), null);
  pick = HT.makePick(s, e, 20);
  ok(apply(s, { type: 'condition', actor: 'wizard', condition: 'prone', on: true }, DM));         // a fall: Prone in the air
  assert.equal(e.pos.z, 0);
  assert.equal(HT.livePick(pick, s, e, HT.heightsOf(s, e)), null);
  ok(apply(s, { type: 'condition', actor: 'wizard', condition: 'prone', on: false }, DM));
  pick = HT.makePick(s, e, 10);
  assert.ok(HT.livePick(pick, s, e, HT.heightsOf(s, e)));
  ok(apply(s, { type: 'setSpeed', actor: 'wizard', mode: 'fly', feet: 0 }, DM));                  // the flight is lost
  assert.equal(HT.livePick(pick, s, e, HT.heightsOf(s, e)), null);
  ok(apply(s, { type: 'setSpeed', actor: 'wizard', mode: 'fly', feet: 60 }, DM));
  pick = HT.makePick(s, e, 10);
  ok(apply(s, { type: 'endTurn', actor: 'wizard' }, DM)); turnOf(s, 'wizard');                      // a turn change (a round later, same place)
  assert.equal(HT.livePick(pick, s, e, HT.heightsOf(s, e)), null);
  assert.equal(HT.livePick({ ...HT.makePick(s, e, 5), z: 500 }, s, e, HT.heightsOf(s, e)), null, 'a height that is not offered');
});

test('the place a tap means: the cell of the picked block in the tapped column', () => {
  const s = world(), e = s.entities.wizard, h = HT.heightsOf(s, e), row = h.heights.find((r) => r.ft === 15);
  const c = HT.cellAt(row, { q: 0, r: 1, z: 0 });
  assert.deepEqual(c.h, { q: 0, r: 1, z: 15 });
  assert.equal(HT.cellAt(row, { q: 40, r: 40 }), null);
  assert.deepEqual(HT.cellAt(h.heights[0], { q: 3, r: 0, z: 10 }).h, { q: 3, r: 0, z: 10 }, 'on the ground block a ledge is its own place');
  assert.equal(FT, 5);
});

// ---------- touch, the camera and words (C4): the pure parts ----------
test('a block smaller than a thumb is picked over an area 1.5 times as tall; where grown areas overlap the nearer middle wins', () => {
  assert.equal(HT.growFor(30), 1.5); assert.equal(HT.growFor(43.9), 1.5); assert.equal(HT.growFor(44), 1); assert.equal(HT.growFor(60), 1);
  // Three blocks 30 px tall stacked up the screen (y grows downward): middles at 85, 55 and 25.
  const small = [{ z: 0, x: 100, top: 70, bottom: 100 }, { z: 5, x: 100, top: 40, bottom: 70 }, { z: 10, x: 100, top: 10, bottom: 40 }];
  assert.equal(HT.blockAtPoint(small, 85), 0);
  assert.equal(HT.blockAtPoint(small, 68), 5, 'in the overlap of two grown areas the nearer middle wins');
  assert.equal(HT.blockAtPoint(small, 72), 0);
  assert.equal(HT.blockAtPoint(small, 4), 10, 'above the top block, inside its grown area (10 - 7.5)');
  assert.equal(HT.blockAtPoint(small, 1), null);
  assert.equal(HT.blockAtPoint(small, 107), 0); assert.equal(HT.blockAtPoint(small, 108), null);
  // Blocks a thumb tall are picked only where they are drawn.
  const big = [{ z: 0, x: 100, top: 150, bottom: 200 }, { z: 5, x: 100, top: 100, bottom: 150 }];
  assert.equal(HT.blockAtPoint(big, 201), null); assert.equal(HT.blockAtPoint(big, 99), null); assert.equal(HT.blockAtPoint(big, 149), 5);
  // Beside the column: half a thumb at least, more for a big block.
  assert.equal(HT.blockAtPoint(small, 85, 121), 0); assert.equal(HT.blockAtPoint(small, 85, 123), null);
  assert.equal(HT.blockAtPoint(big, 175, 137), 0); assert.equal(HT.blockAtPoint(big, 175, 138), null);
  // A drag follows the finger to the nearest block, wherever the finger is.
  assert.equal(HT.blockNearest(small, -500), 10); assert.equal(HT.blockNearest(small, 900), 0); assert.equal(HT.blockNearest(small, 56), 5);
  assert.equal(HT.blockNearest([], 5), null);
});

test('the camera: a view steeper than 1.05 rad eases to 0.9, any other is left; the picture slides down only as far as there is room', () => {
  assert.equal(HT.pitchFor(1.2), 0.9); assert.equal(HT.pitchFor(1.45), 0.9);
  assert.equal(HT.pitchFor(1.05), null); assert.equal(HT.pitchFor(0.95), null); assert.equal(HT.pitchFor(0.45), null);
  assert.equal(HT.frameNudge({ top: 120, margin: 70, foot: 500, floor: 760 }), 0, 'the top is on the screen: nothing moves');
  assert.equal(HT.frameNudge({ top: -30, margin: 70, foot: 500, floor: 760 }), 100, 'the missing amount');
  assert.equal(HT.frameNudge({ top: -300, margin: 70, foot: 500, floor: 760 }), 260, 'never past the menu: the creature stays on the screen');
  assert.equal(HT.frameNudge({ top: -300, margin: 70, foot: 800, floor: 760 }), 0);
});

test('the falling warning: only for a lent flight that ends before the next turn, and only off the ground', () => {
  const s = world({ fly: 0 }), e = s.entities.wizard;
  fight(s); turnOf(s, 'wizard');
  const lend = (until, ends) => { s.effects = [{ id: 'fx1', name: 'Dragon Wings', source: 'wizard', conc: false, until, parts: [{ target: 'wizard', modifier: { on: 'speed.fly', op: 'set', value: 60 }, ...(ends ? { ends } : {}) }] }]; };
  const enc = s.encounter;
  lend({ enc: enc.id, round: enc.round + 10 });
  assert.ok(aloft(s, e), 'the lent Fly Speed holds it up');
  assert.equal(HT.flightEnds(s, e), null); assert.equal(HT.fallWarning(s, e, 30), '');
  lend({ enc: enc.id, round: enc.round + 1 });
  assert.deepEqual(HT.flightEnds(s, e), { name: 'Dragon Wings', rounds: 1 });
  assert.equal(HT.fallWarning(s, e, 30), 'Dragon Wings ends in 1 round: you would fall 30 ft (1d6 for each 10 ft).');
  assert.equal(HT.fallWarning(s, e, 5), 'Dragon Wings ends in 1 round: you would fall 5 ft.');
  assert.equal(HT.fallWarning(s, e, 0), '', 'on a floor there is nothing to fall');
  lend({ enc: enc.id, round: enc.round });
  assert.equal(HT.fallWarning(s, e, 20), 'Dragon Wings ends this round: you would fall 20 ft (1d6 for each 10 ft).');
  lend(null);
  assert.equal(HT.flightEnds(s, e), null, 'a flight with no end');
  lend(null, { on: 'turnEnd', of: 'target' });
  assert.equal(HT.flightEnds(s, e)?.rounds, 0, 'until the end of a turn');
  // Two things hold it up: the one that lasts longest decides.
  lend({ enc: enc.id, round: enc.round + 1 });
  s.effects.push({ id: 'fx2', name: 'Fly', source: 'cleric', until: { enc: enc.id, round: enc.round + 50 }, parts: [{ target: 'wizard', modifier: { on: 'speed.fly', op: 'set', value: 60 } }] });
  assert.equal(HT.flightEnds(s, e), null);
  s.effects[1].parts[0].ended = true;
  assert.ok(HT.flightEnds(s, e));
  // A creature with a Fly Speed of its own is never warned (by the SRD it does not fall).
  ok(apply(s, { type: 'setSpeed', actor: 'wizard', mode: 'fly', feet: 30 }, DM));
  assert.equal(HT.flightEnds(s, e), null);
  assert.equal(HT.fallWarning(s, s.entities.fighter, 30), '');
});

test('words for those who do not use the picture: what is picked, and the places as a list, nearest first', async () => {
  const { gridOf } = await imp('shared/grid.js');
  const s = world(), e = s.entities.wizard;
  fight(s); turnOf(s, 'wizard');
  const h = HT.heightsOf(s, e), row = h.heights.find((r) => r.ft === 20);
  assert.equal(HT.pickedWords(h, row), 'Picked 20 ft, 40 ft of flying left');
  assert.equal(HT.pickedWords(h, h.heights[0]), 'Picked the ground, 60 ft of flying left');
  assert.equal(HT.pickedWords(h, null), '');
  const list = HT.placeList(gridOf(s.map), e, h, row);
  assert.equal(list.length, row.cells.length);
  assert.equal(list[0].text, 'Straight up, at 20 ft up, costs 20 ft, 40 left');
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].far <= list[i].far, 'nearest first');
  assert.match(list[1].text, /^(North|South|East|West)[a-z-]*, 5 ft, at 20 ft up, costs 20 ft, 40 left$/);
  const east = list.find((p) => p.key === `${e.pos.q + 2},${e.pos.r},20`);
  assert.equal(east.text, 'East, 10 ft, at 20 ft up, costs 20 ft, 40 left');
  assert.deepEqual(['East', 'South', 'West', 'North'], [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([x, z]) => HT.windOf(x, z)));
  assert.equal(HT.windOf(1, -1), 'North-east'); assert.equal(HT.windOf(0, 0), '');
  const roof = HT.placeList(gridOf(s.map), e, h, h.heights.find((r) => r.ft === 10)).find((p) => /a floor/.test(p.text));
  assert.ok(roof, 'a floor at the height is named as one');
  assert.match(HT.placeList(gridOf(s.map), e, h, h.heights[0])[0].text, /on the ground, costs 5 ft, 55 left$/);      // a flyer may fly there: what is left is of the way that has most
});
