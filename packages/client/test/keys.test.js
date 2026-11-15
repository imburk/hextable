// Keyboard movement and key maps (docs/specs/keyboard.md, #357): the one table, the presets, which space a key chooses on hexes
// and squares at every 15 degrees of yaw, when keys are left alone, and the walker's one step at a time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, PRESETS, FIXED, WALK_LOOK, PACE, actionOf, keyLabel, keyList, presetOf, presetId, stepFor, viewAngle, yawFacing, leaveAlone, createWalker } from '../keys.js';
import { HEX, SQUARE } from '../../rules/src/grid.js';

const deg = (d) => (d * Math.PI) / 180;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const KEYS = { forward: [1, 0], back: [-1, 0], right: [0, 1], left: [0, -1] };

test('every preset binds only known actions, no key twice, and no fixed key', () => {
  const fixed = new Set(FIXED.flatMap((f) => f.codes));
  assert.equal(Object.keys(PRESETS)[0], 'default');
  for (const [id, p] of Object.entries(PRESETS)) {
    const seen = new Map();
    for (const [a, ks] of Object.entries(p.keys)) {
      assert.ok(ACTIONS[a], `${id}: ${a} is an action`);
      for (const k of ks) {
        assert.ok(!seen.has(k), `${id}: ${k} is bound to ${seen.get(k)} and ${a}`);
        assert.ok(!fixed.has(k), `${id}: ${k} is a fixed key`);
        seen.set(k, a);
      }
    }
    for (const a of ['forward', 'back', 'left', 'right', 'recentre', 'rotateLeft']) assert.ok(p.keys[a]?.length, `${id} binds ${a}`);
    assert.ok(!/minecraft|roblox|counter|call of duty|fortnite/i.test(p.name), `${id}: no game's name in the UI`);
  }
  for (const a of Object.keys(WALK_LOOK)) assert.equal(ACTIONS[a].kind, 'walk');
});

test('the default map: W A S D and the arrows walk, Q and E turn, Space returns; modifiers are the browser\'s', () => {
  const p = presetOf('default');
  const at = (code, mods = {}) => actionOf({ code, ...mods }, p);
  assert.deepEqual(['KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight', 'KeyQ', 'KeyE', 'Space'].map((c) => at(c)),
    ['forward', 'forward', 'back', 'back', 'left', 'left', 'right', 'right', 'rotateLeft', 'rotateRight', 'recentre']);
  assert.equal(at('KeyW', { ctrlKey: true }), null); assert.equal(at('KeyW', { metaKey: true }), null); assert.equal(at('KeyW', { altKey: true }), null);
  assert.equal(at('KeyW', { shiftKey: true }), 'forward', 'Shift is read by the caller');
  assert.equal(at('Digit1'), null); assert.equal(at('KeyM'), null);
  assert.equal(actionOf({ code: 'KeyW' }, presetOf('arrows')), null);
  assert.equal(actionOf({ code: 'KeyE' }, presetOf('block')), 'sheet');
  assert.equal(actionOf({ code: 'ArrowLeft' }, presetOf('world')), 'lookLeft');
  assert.equal(presetId('nonsense'), 'default'); assert.equal(presetOf(undefined), PRESETS.default);
  assert.equal(keyLabel('KeyW'), 'W'); assert.equal(keyLabel('ArrowUp'), 'Up'); assert.equal(keyLabel('Space'), 'Space');
  const list = keyList(p);
  assert.deepEqual(list[0], { words: 'Walk forward', keys: ['W', 'Up'] });
  assert.ok(list.some((l) => l.keys.includes('Escape')) && list.some((l) => l.keys.includes('1 to 9')));
});

for (const G of [HEX, SQUARE]) {
  test(`${G.kind}: at every 15 degrees of yaw each key chooses the neighbour nearest its direction, opposite keys opposite neighbours`, () => {
    const most = G.kind === 'hex' ? 30 : 45;
    for (let d = -180; d < 180; d += 15) {
      const yaw = deg(d), got = {};
      for (const [k, [f, r]] of Object.entries(KEYS)) {
        const s = stepFor(G, yaw, f, r);
        assert.ok(s, `${k} at ${d}`);
        assert.ok(G.DIRS.slice(0, G.kind === 'square' ? 4 : 6).some(([q, rr]) => q === s.dq && rr === s.dr), `${k} at ${d} is a side neighbour`);
        const off = Math.abs(wrap(viewAngle(G, [s.dq, s.dr], yaw) - Math.atan2(r, f))) * 180 / Math.PI;
        assert.ok(off <= most + 1e-6, `${k} at ${d}: ${off.toFixed(1)} degrees off`);
        // nothing nearer was passed over
        for (const c of G.DIRS.slice(0, G.kind === 'square' ? 4 : 6)) assert.ok(Math.abs(wrap(viewAngle(G, c, yaw) - Math.atan2(r, f))) * 180 / Math.PI >= off - 1e-6);
        got[k] = s;
        assert.deepEqual(stepFor(G, yaw, f, r), s, 'the same answer every time');
      }
      assert.deepEqual([got.forward.dq || 0, got.forward.dr || 0], [0 - got.back.dq || 0, 0 - got.back.dr || 0], `W and S at ${d}`);
      assert.deepEqual([got.left.dq || 0, got.left.dr || 0], [0 - got.right.dq || 0, 0 - got.right.dr || 0], `A and D at ${d}`);
    }
  });
}

test('ties go clockwise: on hexes at yaw 0 forward is exactly between two neighbours', () => {
  const s = stepFor(HEX, 0, 1, 0), a = viewAngle(HEX, [s.dq, s.dr], 0);
  assert.ok(Math.abs(Math.abs(a) - Math.PI / 6) < 1e-9, 'a tie');
  assert.ok(a > 0, 'the clockwise one (to the view\'s right)');
  assert.deepEqual(s, { dq: 1, dr: -1 });
});

test('squares: two keys held choose a diagonal when the view is square to the grid, a side when it is at 45 degrees', () => {
  assert.deepEqual(stepFor(SQUARE, 0, 1, 1), { dq: 1, dr: -1 }, 'W and D at yaw 0: north-east');
  assert.deepEqual(stepFor(SQUARE, 0, 1, -1), { dq: -1, dr: -1 }, 'W and A at yaw 0: north-west');
  assert.deepEqual(stepFor(SQUARE, 0, 1, 0), { dq: 0, dr: -1 }, 'W alone: north');
  const s = stepFor(SQUARE, deg(-45), 1, 1);
  assert.ok(Math.abs(s.dq) + Math.abs(s.dr) === 1, 'at 45 degrees W and D are a side step');
  assert.equal(stepFor(SQUARE, 0, 0, 0), null);
  assert.equal(stepFor(HEX, 0, 1, 1) !== null, true, 'two keys on hexes choose one of the six');
});

test('facing a step: the view that looks along a direction makes W choose that direction with no tie', () => {
  for (const G of [HEX, SQUARE]) for (const [dq, dr] of G.DIRS.slice(0, G.kind === 'square' ? 4 : 6)) {
    const y = yawFacing(G, dq, dr);
    assert.ok(Math.abs(viewAngle(G, [dq, dr], y)) < 1e-9);
    assert.deepEqual(stepFor(G, y, 1, 0), { dq, dr });
  }
});

// ---------- leaving keys alone ----------
function el(tag, { attrs = {}, parent = null, focusVisible = false, editable = false } = {}) {
  const e = { tagName: tag.toUpperCase(), attrs, parent, isContentEditable: editable, hidden: false, getClientRects: () => [1] };
  const match = (x, sel) => sel.split(',').some((s0) => {
    const s = s0.trim();
    if (s === ':focus-visible') return focusVisible && x === e;
    const m = s.match(/^([a-z]*)(?:\[([a-z-]+)(?:="([^"]*)")?\])?(?::not\(.*\))?$/);
    if (!m) return false;
    if (m[1] && x.tagName !== m[1].toUpperCase()) return false;
    if (m[2] && !(m[2] in x.attrs)) return false;
    if (m[3] !== undefined && x.attrs[m[2]] !== m[3]) return false;
    return !!(m[1] || m[2]);
  });
  e.matches = (sel) => match(e, sel);
  e.closest = (sel) => { for (let x = e; x; x = x.parent) if (match(x, sel)) return x; return null; };
  return e;
}
const doc = (modals = [], rp = false) => ({ body: { classList: { contains: (c) => c === 'rp-open' && rp } }, querySelectorAll: () => modals });

test('keys are left alone while typing, in a dialog, in a tab list, with a modifier, a modal or the reaction prompt', () => {
  const body = el('body'), canvas = el('canvas', { parent: body });
  const key = (target, code = 'KeyW', mods = {}) => ({ target, code, ...mods });
  assert.equal(leaveAlone(key(canvas), doc()), null);
  assert.equal(leaveAlone(key(body, 'Space'), doc()), null);
  assert.equal(leaveAlone(key(el('input', { parent: body })), doc()), 'typing');
  assert.equal(leaveAlone(key(el('textarea', { parent: body })), doc()), 'typing');
  assert.equal(leaveAlone(key(el('select', { parent: body })), doc()), 'typing');
  assert.equal(leaveAlone(key(el('div', { parent: body, editable: true })), doc()), 'typing');
  const dialog = el('div', { attrs: { role: 'dialog' }, parent: body });
  assert.equal(leaveAlone(key(el('button', { parent: dialog })), doc()), 'typing');
  const tabs = el('div', { attrs: { role: 'tablist' }, parent: body });
  assert.equal(leaveAlone(key(el('button', { parent: tabs }), 'ArrowLeft'), doc()), 'tablist');
  assert.equal(leaveAlone(key(el('button', { parent: tabs, focusVisible: true })), doc()), 'tablist');
  assert.equal(leaveAlone(key(el('button', { parent: tabs })), doc()), null, 'a tab clicked with the mouse does not hold W');
  assert.equal(leaveAlone(key(el('button', { parent: body, focusVisible: true }), 'Space'), doc()), 'control');
  assert.equal(leaveAlone(key(el('button', { parent: body }), 'Space'), doc()), null, 'a button clicked with the mouse does not take Space');
  for (const m of ['ctrlKey', 'metaKey', 'altKey']) assert.equal(leaveAlone(key(canvas, 'KeyW', { [m]: true }), doc()), 'modifier');
  assert.equal(leaveAlone(key(canvas), doc([el('div', { parent: body })])), 'modal');
  assert.equal(leaveAlone(key(canvas), doc([], true)), 'prompt');
});

// ---------- the walker ----------
function rig({ fight = false } = {}) {
  const log = { sent: [], stepped: [], stopped: [], looks: [] };
  const io = { t: 0, sel: 'pc', yawNow: 0, turnsNow: 0, turn: 'none', busyNow: false, inFight: fight,
    now: () => io.t, start: () => io.sel, actor: () => io.sel, fight: () => io.inFight, yaw: () => io.yawNow, turns: () => io.turnsNow,
    turnKey: () => io.turn, grid: () => HEX, busy: () => io.busyNow,
    send: (a, d) => { log.sent.push([a, d, io.t]); return true; }, look: (y, p) => log.looks.push([y, p]),
    stepped: (a, d, follow, ahead) => log.stepped.push([a, d, follow, ahead]), stopped: (w) => log.stopped.push(w) };
  const W = createWalker(io);
  const run = (ms, answer = true) => { for (let i = 0; i < ms / 10; i++) { io.t += 10; W.tick(); if (answer && W.waiting) W.update((id) => id === 'pc', false); } };
  const go = (a) => { W.down(a); run(PACE.chord, false); };      // a press, and the moment the first step waits for a second key
  return { io, W, log, run, go };
}

test('a press sends one step at once; a held key repeats at the steady pace; release stops at once and nothing is queued', () => {
  const { io, W, log, run } = rig();
  W.down('forward');
  assert.equal(log.sent.length, 0, 'the first step waits a moment for a second key');
  run(PACE.chord, false);
  assert.equal(log.sent.length, 1, 'then goes');
  W.down('forward', true); W.down('forward', true);
  assert.equal(log.sent.length, 1, 'the key\'s own repeat sends nothing');
  W.update((id) => id === 'pc', false);
  run(1000);
  assert.equal(log.sent.length, 6, `five a second after the first (${log.sent.length})`);
  const gaps = log.sent.slice(1).map((s, i) => s[2] - log.sent[i][2]);
  assert.ok(gaps.every((g) => g === PACE.explore), JSON.stringify(gaps));
  W.up('forward');
  const n = log.sent.length;
  run(1000);
  assert.equal(log.sent.length, n, 'nothing after the release');
  assert.equal(W.walking, false);
  assert.ok(log.stepped.every(([, , f, ahead]) => f === true && ahead === true), 'followed, forward');
  W.down('back'); run(PACE.chord, false); W.update((id) => id === 'pc', false);
  assert.equal(log.stepped.at(-1)[3], false, 'a step back is not a direction of travel to turn to');
});

test('a tap shorter than the wait for a second key still steps once, and only once', () => {
  const { W, log, run } = rig();
  W.down('forward'); W.up('forward');
  assert.equal(log.sent.length, 1);
  W.update((id) => id === 'pc', false);
  run(1000);
  assert.equal(log.sent.length, 1);
});

test('one step at a time: no answer, no next step; no answer in 2 s ends the walk', () => {
  const { log, run, go } = rig();
  go('right');
  run(1500, false);
  assert.equal(log.sent.length, 1);
  run(700, false);
  assert.deepEqual(log.stopped, ['timeout']);
  run(1000, false);
  assert.equal(log.sent.length, 1, 'the key must be pressed again');
});

test('a refusal, a question, a turn change and a change of selection each stop the walk', () => {
  for (const [why, poke] of [
    ['refused', (r) => r.W.refused()],
    ['prompt', (r) => r.W.update(() => false, true)],
    ['turn', (r) => { r.io.turn = 'fight:1:2'; r.W.update((id) => id === 'pc', false); }],
    ['selection', (r) => { r.W.update((id) => id === 'pc', false); r.io.sel = 'other'; r.run(500); }],
  ]) {
    const r = rig();
    r.go('forward');
    poke(r);
    assert.deepEqual(r.log.stopped, [why]);
    const n = r.log.sent.length; r.run(1000);
    assert.equal(r.log.sent.length, n, `${why}: nothing more while the key is still held`);
  }
});

test('in a fight the pace is slower; a busy timeline holds the next step; the frame is kept while keys are held', () => {
  const { io, W, log, run, go } = rig({ fight: true });
  go('forward');
  W.update((id) => id === 'pc', false);
  io.yawNow = 1.2;                                   // the view follows; the held key keeps walking the same way
  run(800);
  assert.equal(log.sent.length, 3);
  assert.ok(log.sent.every((s) => JSON.stringify(s[1]) === JSON.stringify(log.sent[0][1])), 'a straight line');
  io.busyNow = true; run(1000);
  assert.equal(log.sent.length, 3, 'waits while a tap would be skipped');
  io.busyNow = false; run(50);
  assert.equal(log.sent.length, 4);
  W.up('forward'); go('forward');
  assert.notDeepEqual(log.sent.at(-1)[1], log.sent[0][1], 'a new press measures from the view as it is');
});

test('Shift held looks instead of walking; a manual turn during a walk stops following until the next walk', () => {
  const { io, W, log, run } = rig();
  W.shift(true);
  W.down('left');
  run(500);
  assert.equal(log.sent.length, 0, 'Shift: nothing is sent');
  assert.ok(log.looks.length > 10 && log.looks.every(([y, p]) => y > 0 && p === 0), 'Shift+A turns the gaze left');
  W.up('left'); W.down('forward'); log.looks.length = 0; run(100);
  assert.ok(log.looks.every(([y, p]) => y === 0 && p < 0), 'Shift+W tilts toward the horizon');
  W.shift(false); run(PACE.chord, false);
  assert.equal(log.sent.length, 1, 'releasing Shift with W held walks');
  W.update((id) => id === 'pc', false);
  io.turnsNow = 1;                                   // the person turned the view
  run(250);
  assert.equal(log.stepped.at(-1)[2], false, 'not followed after a manual turn');
  W.resume(); run(250);
  assert.equal(log.stepped.at(-1)[2], true, 'Space resumes following');
  W.release();
  assert.equal(W.walking, false); assert.deepEqual(W.held, []);
});

test('look keys turn while held, and nothing walks with nobody to walk', () => {
  const { io, W, log, run } = rig();
  W.down('lookRight'); run(100);
  assert.ok(log.looks.length && log.looks.every(([y]) => y < 0));
  W.up('lookRight');
  io.sel = null; W.down('forward'); run(500);
  assert.equal(log.sent.length, 0);
});
