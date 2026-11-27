// Keyboard movement, the follow camera and key maps (docs/specs/keyboard.md, #357). One table drives every key: ACTIONS says what
// each action is, PRESETS binds keys to actions as data, FIXED lists the keys other modules own (the same in every preset).
// Keys are KeyboardEvent.code values: a key's place on the keyboard, so W A S D are where they are on any layout.
// This module imports nothing: the grid's geometry is passed in (HEX or SQUARE from shared/grid.js), so Node tests it as it is.

// Walk keys walk; with Shift held they look instead (WALK_LOOK). Look keys turn or tilt the view while held. The rest act once
// a press (and again on the key's own repeat, as Q and E always did).
export const ACTIONS = {
  forward: { words: 'Walk forward', kind: 'walk' },
  back: { words: 'Walk back', kind: 'walk' },
  left: { words: 'Walk left', kind: 'walk' },
  right: { words: 'Walk right', kind: 'walk' },
  rotateLeft: { words: 'Turn the map ⟲', kind: 'press' },
  rotateRight: { words: 'Turn the map ⟳', kind: 'press' },
  lookLeft: { words: 'Look left', kind: 'look' },
  lookRight: { words: 'Look right', kind: 'look' },
  tiltUp: { words: 'Tilt the view toward the horizon', kind: 'look' },
  tiltDown: { words: 'Tilt the view toward straight down', kind: 'look' },
  zoomIn: { words: 'Zoom in', kind: 'press' },
  zoomOut: { words: 'Zoom out', kind: 'press' },
  recentre: { words: 'Return the view to the direction of travel', kind: 'press' },
  sheet: { words: 'Open the character sheet', kind: 'press' },
  // A flyer's height (docs/specs/fly-swim-control.md): the first press opens the column, each one after moves the pick one block.
  heightUp: { words: 'Fly: pick a height, one block higher', kind: 'press' },
  heightDown: { words: 'Fly: one block lower', kind: 'press' },
  heightGround: { words: 'Fly: pick the ground (land)', kind: 'press' },
  heightTop: { words: 'Fly: pick the highest height in reach', kind: 'press' },
};
// The height keys act only for a creature that can fly; for everyone else the keys are the browser's (Page Up still scrolls).
export const HEIGHT_ACTIONS = ['heightUp', 'heightDown', 'heightGround', 'heightTop'];
// What a walk key does while Shift is held.
export const WALK_LOOK = { forward: 'tiltUp', back: 'tiltDown', left: 'lookLeft', right: 'lookRight' };
// Owned by other code and the same in every preset; listed so the keys list is whole and a test can check no preset takes them.
export const FIXED = [
  { words: 'Look around without moving (hold, with the walk keys)', keys: ['Shift'], codes: ['ShiftLeft', 'ShiftRight'] },
  { words: 'Undo, redo (the DM)', keys: ['Ctrl+Z', 'Ctrl+Shift+Z', 'Ctrl+Y'], codes: [] },
  { words: 'Cancel what is armed, or close the menu', keys: ['Escape'], codes: ['Escape'] },
  { words: 'Choose an action tab', keys: ['1 to 9'], codes: ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'] },
  { words: 'Open or close the menu', keys: ['M'], codes: ['KeyM'] },
  { words: 'In the menu: move between rows, open one, go back a level', keys: ['Up, Down', 'Right, Enter', 'Left, Backspace'], codes: [] },      // the menu's own: with it open and a row focused, the arrow keys are its, not the walk keys
  { words: 'Move the focus', keys: ['Tab', 'Shift+Tab'], codes: ['Tab'] },
  { words: 'Fly: go to the marked place', keys: ['Enter', 'Space'], codes: [] },      // while a flyer's column is open; Space otherwise does what the preset says
];

const WASD = { forward: ['KeyW'], back: ['KeyS'], left: ['KeyA'], right: ['KeyD'] };
const ARROWS = { forward: ['ArrowUp'], back: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'] };
// Page Up and Page Down, and R and F for a keyboard with neither (a laptop). Q and E turn the map and W A S D walk, so they are left alone.
const HEIGHT = { heightUp: ['PageUp', 'KeyR'], heightDown: ['PageDown', 'KeyF'], heightGround: ['Home'], heightTop: ['End'] };
const BASE = { rotateLeft: ['KeyQ'], rotateRight: ['KeyE'], recentre: ['Space'], ...HEIGHT };
const ARROW_LOOK = { lookLeft: ['ArrowLeft'], lookRight: ['ArrowRight'], tiltUp: ['ArrowUp'], tiltDown: ['ArrowDown'] };
// The presets, by their layout. The default is first. `like` is for the spec and the tests, never shown.
export const PRESETS = {
  default: { name: 'WASD and arrows', like: 'the usual default', keys: { forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], ...BASE } },
  arrows: { name: 'Arrows only', like: 'keyboard-only play', keys: { ...ARROWS, ...BASE } },
  block: { name: 'Block-builder style', like: 'block-building survival games', keys: { ...WASD, ...ARROW_LOOK, rotateLeft: ['KeyQ'], recentre: ['Space'], sheet: ['KeyE'], ...HEIGHT } },
  world: { name: 'World-builder style', like: 'world-building platforms', keys: { forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA'], right: ['KeyD'], lookLeft: ['ArrowLeft'], lookRight: ['ArrowRight'], zoomIn: ['KeyI'], zoomOut: ['KeyO'], ...BASE } },
  fps: { name: 'First-person style', like: 'first-person shooters', keys: { ...WASD, ...ARROW_LOOK, ...BASE } },
};
export const presetOf = (id) => PRESETS[id] ?? PRESETS.default;
export const presetId = (id) => (PRESETS[id] ? id : 'default');

const byCode = new Map();
function codes(preset) {
  let m = byCode.get(preset);
  if (!m) { m = new Map(); for (const [a, ks] of Object.entries(preset.keys)) for (const k of ks) m.set(k, a); byCode.set(preset, m); }
  return m;
}
// The action a key event asks for in this preset, or null. Ctrl, Meta and Alt are the browser's; Shift is read by the caller.
export function actionOf(ev, preset) {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return null;
  return codes(preset).get(ev.code) ?? null;
}
// A key's name as a US layout prints it.
export function keyLabel(code) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  return { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Space: 'Space', PageUp: 'Page Up', PageDown: 'Page Down' }[code] ?? code;
}
// The keys list for Settings: [{ words, keys: [label] }], the preset's own actions in ACTIONS order, then the fixed keys.
export function keyList(preset) {
  const own = Object.keys(ACTIONS).filter((a) => preset.keys[a]?.length).map((a) => ({ words: ACTIONS[a].words, keys: preset.keys[a].map(keyLabel) }));
  return [...own, ...FIXED.map((f) => ({ words: f.words, keys: f.keys }))];
}

// ---------- which space a key chooses ----------
// The camera looks along (-sin yaw, -cos yaw) on the board (x east, z south); its right is (cos yaw, -sin yaw).
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const EPS = 1e-6;
const vec = (G, d) => { const o = G.toWorld({ q: 0, r: 0 }), w = G.toWorld({ q: d[0], r: d[1] }); return [w.x - o.x, w.z - o.z]; };
// The angle of a grid direction from the view's forward, clockwise (toward the view's right) positive.
export function viewAngle(G, d, yaw) {
  const [x, z] = vec(G, d), s = Math.sin(yaw), c = Math.cos(yaw);
  return Math.atan2(c * x - s * z, -s * x - c * z);
}
// The neighbour for the walk keys held: f forward (+1) or back (-1), r right (+1) or left (-1). { dq, dr } or null.
// Hexes: the nearest of the six. Squares: one key, the nearest of the four sides; two keys, the nearest of all eight.
// A tie goes to the candidate clockwise of the wish, so opposite keys choose opposite neighbours.
export function stepFor(G, yaw, f, r) {
  if (!f && !r) return null;
  const want = Math.atan2(r, f), cands = G.kind === 'square' && !(f && r) ? G.DIRS.slice(0, 4) : G.DIRS;
  let best = null, bd = Infinity, bs = 0;
  for (const d of cands) {
    const delta = wrap(viewAngle(G, d, yaw) - want), a = Math.abs(delta);
    if (a < bd - EPS || (a <= bd + EPS && delta > EPS && bs <= EPS)) { best = d; bd = a; bs = delta; }
  }
  return { dq: best[0], dr: best[1] };
}
// The camera yaw that looks along a step.
export function yawFacing(G, dq, dr) { const [x, z] = vec(G, [dq, dr]); return Math.atan2(-x, -z); }

// ---------- when the keys do nothing ----------
const visible = (el) => !el.hidden && !el.closest?.('[hidden]') && el.getClientRects().length > 0;
// Why a key must be left alone, or null. `ev` the key event, `doc` the document. A control the keyboard focused (:focus-visible)
// keeps Space; a tab list keeps its arrows, and everything when the keyboard focused it.
export function leaveAlone(ev, doc) {
  if (ev.ctrlKey || ev.metaKey || ev.altKey) return 'modifier';
  const t = ev.target && ev.target.closest ? ev.target : null;
  if (t) {
    if (t.isContentEditable || t.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="alertdialog"], dialog')) return 'typing';
    const fv = (() => { try { return t.matches(':focus-visible'); } catch { return false; } })();
    if (t.closest('[role="tablist"]') && (fv || /^Arrow|^Home$|^End$/.test(ev.code))) return 'tablist';
    if (fv && (ev.code === 'Space' || ev.code === 'Enter') && t.closest('button, a[href], summary, [role="button"], [role="tab"], label')) return 'control';
  }
  if (doc.body?.classList.contains('rp-open')) return 'prompt';
  if ([...doc.querySelectorAll('[aria-modal="true"]')].some(visible)) return 'modal';
  return null;
}

// ---------- the walker ----------
// One step at a time: a step is sent and the next waits for its answer; a held key repeats at a steady pace and stops at once
// on release, a refusal, a question, a change of turn or selection. io:
//   now() ms; start() the actor to walk (it may select one) or null; actor() the actor the keys may walk now, or null;
//   fight() whether a step is in a fight; yaw() the camera's turn; turns() its count of manual turns; turnKey() the turn as a key;
//   grid() the geometry; busy() whether a tap would be skipped now; send(actor, { dq, dr }) true if sent;
//   look(dyaw, dpitch) turn and tilt the view; stepped(actor, dir, follow, ahead) after an accepted step (`follow`: no manual turn since
//   the walk began; `ahead`: forward was held, so the step is a direction of travel the view may turn to); stopped(why).
export const PACE = { explore: 200, fight: 400, chord: 50, timeout: 2000, turnRate: 1.8, tiltRate: 0.9 };      // chord: the first step waits this long for a second key (W and D)
export function createWalker(io) {
  const held = new Set(), looks = new Set(), lifted = new Set();      // lifted: keys let go before the walk's first step went
  let shift = false, walk = null, last = null;
  const has = (a) => (held.has(a) ? 1 : 0);
  let why0 = null;                     // the last reason a walk ended, for the smoke pass's messages
  function stop(why) {
    held.clear(); lifted.clear();
    if (!walk) return;
    why0 = why;
    walk = null; io.stopped?.(why);
  }
  function lookNow(dt) {
    const set = new Set(looks);
    if (shift) for (const a of held) set.add(WALK_LOOK[a]);
    const turn = (set.has('lookLeft') ? 1 : 0) - (set.has('lookRight') ? 1 : 0), tilt = (set.has('tiltDown') ? 1 : 0) - (set.has('tiltUp') ? 1 : 0);
    if (turn || tilt) io.look(turn * PACE.turnRate * dt, tilt * PACE.tiltRate * dt);
  }
  function tick() {
    const now = io.now(), dt = last === null ? 0.03 : Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    lookNow(dt);
    if ((!held.size && !walk) || shift) return;
    if (walk?.renew && !walk.pending) walk = null;                   // a new press after a release: a new walk, measured from the view now
    if (!walk) {
      const actor = io.start();
      if (!actor) { held.clear(); return; }
      walk = { actor, yaw: io.yaw(), turns: io.turns(), turn: io.turnKey(), pending: null, next: now + PACE.chord, at: now, sent: false };
    }
    if (walk.pending) { if (now - walk.pending.at > PACE.timeout) stop('timeout'); return; }
    if (!held.size) { walk = null; return; }                        // released, and the last step answered
    if (!walk.sent && now - walk.at > PACE.timeout) return stop('timeout');
    if (io.actor() !== walk.actor) return stop('selection');
    if (io.turnKey() !== walk.turn) return stop('turn');
    if (now < walk.next) return;
    step(now);
  }
  function step(now) {
    if (io.busy()) return;
    const f = has('forward') - has('back'), d = stepFor(io.grid(), walk.yaw, f, has('right') - has('left'));
    if (!d) return;
    walk.pending = { at: now, dir: d, ahead: f > 0 }; walk.sent = true;
    for (const a of lifted) held.delete(a);
    lifted.clear();
    walk.next = now + (io.fight() ? PACE.fight : PACE.explore);
    if (!io.send(walk.actor, d)) { walk.pending = null; stop('unsent'); }
  }
  return {
    // A key went down: `repeat` is the key's own auto-repeat, which a walk ignores.
    down(action, repeat = false) {
      const kind = ACTIONS[action]?.kind;
      if (kind === 'look') { looks.add(action); return; }
      if (kind !== 'walk' || repeat) return;
      if (!held.size && walk) walk.renew = true;
      held.add(action);
      if (!shift) tick();
    },
    up(action) {
      looks.delete(action);
      if (!held.has(action)) return;
      if (walk && !walk.sent) { lifted.add(action); if (lifted.size === held.size && !shift) tick(); return; }      // a tap shorter than the chord wait still steps once
      held.delete(action);                // nothing more is sent; the walk ends once the step in flight is answered
    },
    shift(on) {
      if (on === shift) return;
      shift = on;
      walk = null;                     // a pause; on release a walk key still held starts a new walk from the view as it is then
      if (!on && held.size) tick();
    },
    // An update came: `mentions(id)` whether its events name that creature; `asking` whether a question is open.
    update(mentions, asking) {
      if (!walk) return;
      if (asking) return stop('prompt');
      if (walk.pending && mentions(walk.actor)) {
        const { dir, ahead } = walk.pending; walk.pending = null;
        io.stepped(walk.actor, dir, io.turns() === walk.turns, ahead);
      }
      if (walk && io.turnKey() !== walk.turn) stop('turn');
    },
    refused() { if (walk?.pending) stop('refused'); },
    resume() { if (walk) walk.turns = io.turns(); },          // Space: following resumes within the walk
    release() { looks.clear(); shift = false; stop('released'); },
    tick,
    get walking() { return !!walk; },
    get waiting() { return !!walk?.pending; },
    get lastStop() { return why0; },
    get held() { return [...held, ...looks]; },
  };
}
