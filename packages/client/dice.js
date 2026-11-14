// Dice on the screen (docs/specs/dice.md). The dice drawn are the engine's dice: each lands on
// the face its event says. Nothing here decides anything. A 2D canvas over the board draws each
// die as a projected solid with a scripted tumble that ends on the chosen face; the canvas is
// drawn only while dice are moving, so it costs nothing at rest.
//
//   const D = createDice(canvas, prefs, camera)   camera() -> { yaw, pitch }: the renderer's camera (renderer.js `cameraAngles`)
//   D.show                               'off' | 'quick' | 'full' (a per-device preference)
//   D.play(groups) -> Promise            throws groups one after another; resolves when settled or skipped
//   D.skip()                             ends what is playing at once
//   D.tray({ dice, label, sub, color, onThrow(flick), onCancel }) -> close()
//
// A group is { dice: [{ sides, value, drop?, neg?, color? }], color, label, sub, mark, from, flick }:
// `label` is the title (who, and what for: titleOf below), `sub` what it made, shown once the dice are down.
// `mark` is 'crit' or 'fumble'; `from` is 'bottom' (the party) or 'top' (the DM's side).

export const MAX_DICE = 12;
const PREF = 'hextable.dice';
export const SHOWS = ['off', 'quick', 'full'];

// ---------- the solids ----------
const PHI = (1 + Math.sqrt(5)) / 2;
const norm = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Faces as sets of vertex indices; each is put in cyclic order around its outward direction.
function solid(verts, faces, scale = 1) {
  const vs = verts.map((v) => { const n = Math.hypot(...v); return v.map((x) => (x / n) * scale); });
  return {
    verts: vs,
    faces: faces.map((idx) => {
      const c = [0, 1, 2].map((k) => idx.reduce((a, i) => a + vs[i][k], 0) / idx.length), n = norm(c);
      const u = norm(cross(n, Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), w = cross(n, u);
      const ang = (i) => { const d = sub3(vs[i], c); return Math.atan2(dot(d, w), dot(d, u)); };
      return { idx: [...idx].sort((a, b) => ang(a) - ang(b)), n, c, u, w };
    }),
  };
}
// All triples of vertices at the shortest distance from one another (the triangles of a deltahedron).
function triangles(vs) {
  const d = (a, b) => Math.hypot(...sub3(vs[a], vs[b]));
  let e = Infinity;
  for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) e = Math.min(e, d(i, j));
  const near = (a, b) => Math.abs(d(a, b) - e) < 1e-6, out = [];
  for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) for (let k = j + 1; k < vs.length; k++)
    if (near(i, j) && near(j, k) && near(i, k)) out.push([i, j, k]);
  return out;
}
function makeSolids() {
  const S = {};
  const tet = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
  S[4] = solid(tet, [[1, 2, 3], [0, 2, 3], [0, 1, 3], [0, 1, 2]], 1.15);
  const cube = []; for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) cube.push([x, y, z]);
  const cf = []; for (let k = 0; k < 3; k++) for (const s of [-1, 1]) cf.push(cube.map((v, i) => (v[k] === s ? i : -1)).filter((i) => i >= 0));
  S[6] = solid(cube, cf, 1.05);
  const oct = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  S[8] = solid(oct, triangles(oct), 1.1);
  const ico = []; for (const a of [-1, 1]) for (const b of [-PHI, PHI]) ico.push([0, a, b], [a, b, 0], [b, 0, a]);
  const itri = triangles(ico);
  S[20] = solid(ico, itri, 1.1);
  // The d12 is the icosahedron's dual: a vertex for each of its faces, a face for each of its vertices.
  const centres = itri.map((t) => [0, 1, 2].map((k) => t.reduce((a, i) => a + ico[i][k], 0) / 3));
  S[12] = solid(centres, ico.map((_, v) => itri.map((t, i) => (t.includes(v) ? i : -1)).filter((i) => i >= 0)), 1.1);
  // The d10, a pentagonal trapezohedron: two poles and two rings of five, with flat kites.
  const h = 1, z0 = h * (1 - Math.cos(Math.PI / 5)) / (1 + Math.cos(Math.PI / 5)), ten = [[0, 0, h], [0, 0, -h]];
  for (let k = 0; k < 5; k++) ten.push([Math.cos((2 * Math.PI * k) / 5), Math.sin((2 * Math.PI * k) / 5), z0]);
  for (let k = 0; k < 5; k++) ten.push([Math.cos((2 * Math.PI * (k + 0.5)) / 5), Math.sin((2 * Math.PI * (k + 0.5)) / 5), -z0]);
  const tf = [];
  for (let k = 0; k < 5; k++) tf.push([0, 2 + k, 7 + k, 2 + ((k + 1) % 5)], [1, 7 + k, 2 + ((k + 1) % 5), 7 + ((k + 1) % 5)]);
  const d10 = solid(ten, tf, 1.1);
  for (const v of d10.verts) v[2] *= 0.82;            // a little squat, like the real thing
  S[10] = d10;
  return S;
}
let SOLIDS = null;
export const __solidsForTest = (sides) => solidOf(sides);       // the faces of a solid, for test/dice.test.js
const solidOf = (sides) => (SOLIDS ??= makeSolids())[sides] ?? SOLIDS[6];

// What a face shows. A d10 shows 0 to 9; the tens die of a d100 shows 00 to 90.
const faceText = (die, i) => (die.tens ? `${i}0` : die.sides === 10 ? `${i}` : `${i + 1}`);
// The face that shows a value.
const faceIndex = (die) => (die.tens ? die.shown : die.sides === 10 ? die.shown % 10 : die.shown - 1);
// A d100 is thrown as two d10s, tens and units (100 shows 00 and 0).
export function expand(dice) {
  const out = [];
  for (const d of dice) {
    if (d.sides === 100) {
      const v = d.value % 100;
      out.push({ ...d, sides: 10, tens: true, shown: Math.floor(v / 10) }, { ...d, sides: 10, shown: v % 10 });
    } else out.push({ ...d, shown: d.value });
  }
  return out;
}


// ---------- titles: who rolled, and what for ----------
// Every throw carries a title taken from the event that caused it and the events before it in the same update, never
// from log text. A viewer is shown only what their own view already tells them: a creature the view does not send is
// "Someone" (a player's state has no record of it), and a purpose is taken only from an event the viewer was sent.
// view.js never sends `by` of a damage event to a player, so who rolled damage is the attack or spell before it, and only
// when that one hit this same target; where nothing visible explains the dice the title is just the kind of damage.
const ABIL = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const cap = (t) => (t ? String(t).replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '');
// The name a viewer may use for a creature: its record in the state it was sent, else "Someone".
// `dm` is the DM's own screen, which is sent everything; for anyone else a creature marked hidden is nobody they know.
export function whoIs(state, id, dm = false) {
  const e = id !== undefined && id !== null ? state?.entities?.[id] : null;
  if (!e || (e.hidden && !dm) || !e.name) return 'Someone';
  return e.name;
}
// What the action that is running says about the rolls that follow: the last attack, spell or action seen. A new turn,
// a move or a new fight ends it. Hands back the new source (or null).
export function nextSource(src, ev) {
  switch (ev.type) {
    case 'attack': return { kind: 'attack', actor: ev.actor, name: ev.name, target: ev.target, hit: !!ev.hit };
    case 'cast': case 'act': return { kind: 'cast', actor: ev.actor, name: ev.name, targets: Array.isArray(ev.targets) ? ev.targets : [] };
    case 'turn': case 'moved': case 'encounterStart': case 'encounterEnd': return null;
    default: return src ?? null;
  }
}
// Does what is running explain a roll that falls on `id`?
const explains = (src, id) => !!src && (src.kind === 'attack' ? src.hit && src.target === id : src.targets.length === 0 || src.targets.includes(id));
// The title of the roll an event shows: "Brenna: Longsword attack", "Goblin 2: Dexterity save vs Burning Hands".
// `src` is nextSource's answer for the events before this one; `dm` says the viewer is the DM.
export function titleOf(ev, state, src = null, dm = false) {
  const who = (id) => whoIs(state, id, dm), line = (id, what) => `${who(id)}: ${what}`;
  switch (ev.type) {
    case 'attack': return ev.opportunity ? line(ev.actor, `Opportunity Attack (${ev.name})`) : line(ev.actor, /attack$/i.test(ev.name ?? '') ? ev.name : `${ev.name ?? 'Weapon'} attack`);
    case 'damage': case 'heal': case 'tempHp': {
      const target = ev.target ?? ev.id, by = ev.by, ok = by === undefined ? explains(src, target) : !!src && src.actor === by && explains(src, target);
      const noun = ev.type === 'damage' ? 'damage' : ev.type === 'heal' ? 'healing' : 'Temporary Hit Points';
      const what = ok ? `${src.name} ${noun}` : ev.type === 'damage' ? `${cap(ev.dtype)} damage`.trim() : cap(noun);
      const roller = by !== undefined ? (by ? by : null) : ok ? src.actor : null;       // the DM is sent `by`; a player never is
      return roller ? line(roller, what) : what;
    }
    case 'save': {
      const vs = ev.against ?? (explains(src, ev.id) ? src.name : null);
      return line(ev.id, `${ABIL[ev.abil] ?? cap(ev.abil)} save${vs ? ` vs ${vs}` : ''}${ev.reroll ? ' (again)' : ''}`);
    }
    case 'concentration': return line(ev.id, `Concentration${ev.name ? ` (${ev.name})` : ''}`);
    case 'deathSave': return line(ev.id, 'Death Save');
    case 'check': {
      const what = ev.search ? 'Search' : ev.hide ? 'Hide (Stealth)' : ev.what ? ev.what.replace(/^(.*?): (.*)$/, '$2 ($1)') : `${cap(ev.skill ?? ev.ability)} check${ev.tool ? ` (${cap(ev.tool)})` : ''}`;
      return line(ev.id, what);
    }
    case 'recharge': return line(ev.id, `${ev.name} recharge`);
    case 'joined': return line(ev.id, 'Initiative');
    default: return '';
  }
}

// ---------- rotations, as quaternions [w, x, y, z] ----------
const qmul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
const qaxis = (ax, ang) => { const s = Math.sin(ang / 2), n = norm(ax); return [Math.cos(ang / 2), n[0] * s, n[1] * s, n[2] * s]; };
// The shortest turn taking direction a to direction b.
function qfrom(a, b) {
  const c = cross(a, b), d = dot(a, b);
  if (d < -0.9999) return qaxis(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]), Math.PI);
  const q = [1 + d, c[0], c[1], c[2]], l = Math.hypot(...q);
  return q.map((x) => x / l);
}
function qrot(q, v) {
  const [w, x, y, z] = q, ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}

// ---------- drawing one die ----------
const LIGHT = norm([-0.45, 0.6, 0.75]);
const hexRgb = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); const n = m ? parseInt(m[1], 16) : 0x888888; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const inkOn = ([r, g, b]) => (r * 0.3 + g * 0.59 + b * 0.11 > 150 ? '#1b1b1b' : '#fdfbf3');
// Draw a die at (x, y), `size` pixels from centre to corner, turned by q. `opts.top` is the index of the face
// that counts and `opts.others` how much of the numerals on every other face is left (1 to 0): once a die has
// settled only the top face's number stays. Numerals are laid in their faces, so they foreshorten as the face does.
export function drawDie(ctx, die, x, y, size, q, alpha = 1, opts = {}) {
  const sol = solidOf(die.sides), rgb = hexRgb(die.color), ink = inkOn(rgb), others = opts.others ?? 1;
  const pts = sol.verts.map((v) => { const r = qrot(q, v), p = 1 + r[2] * 0.12; return [x + r[0] * size * p, y - r[1] * size * p, r[2]]; });
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineJoin = 'round';
  sol.faces.forEach((f, i) => {
    const n = qrot(q, f.n), top = i === opts.top;
    if (n[2] <= 0.001) return;                       // convex: only the faces toward us
    const lit = 0.5 + 0.5 * Math.max(0, dot(n, LIGHT));
    ctx.beginPath();
    f.idx.forEach((k, j) => (j ? ctx.lineTo(pts[k][0], pts[k][1]) : ctx.moveTo(pts[k][0], pts[k][1])));
    ctx.closePath();
    ctx.fillStyle = `rgb(${rgb.map((c) => Math.round(Math.min(255, c * lit + 18 * lit))).join(',')})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(0,0,0,${0.35})`;
    ctx.lineWidth = Math.max(1, size * 0.04);
    ctx.stroke();
    const fade = top ? 1 : others;                   // the counted face keeps its number
    if (fade <= 0.01) return;
    if (!top && (n[2] < 0.3 || die.sides === 4 && n[2] < 0.5)) return;
    const c = qrot(q, f.c), p = 1 + c[2] * 0.12, t = faceText(die, i), U = qrot(q, f.u), W = qrot(q, f.w);
    ctx.save();
    ctx.globalAlpha = alpha * fade * (top ? 1 : Math.min(1, (n[2] - 0.3) * 2.2));
    ctx.fillStyle = ink;
    // The face's own axes are the text's: right along u, up along w, so the number lies in its face.
    ctx.transform(U[0], -U[1], -W[0], W[1], x + c[0] * size * p, y - c[1] * size * p);
    ctx.font = `700 ${Math.round(size * (die.sides === 20 ? 0.36 : die.sides >= 10 ? 0.42 : 0.55) * (t.length > 1 ? 0.85 : 1) * (top ? topScale(n[2], others) : 1))}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t + ((t === '6' || t === '9') && die.sides > 6 ? '.' : ''), 0, 0);
    ctx.restore();
  });
  ctx.restore();
}

// How much bigger the counted face's numeral is drawn once the others have faded: a little, for emphasis, and more the
// more the face is foreshortened (nz is how squarely it faces us: sin(pitch) for a die on the board), up to 1.5 times
// at the shallowest camera. The plane is kept; the number is what is biased, so it still reads.
export const topScale = (nz, others) => 1 + (0.35 + Math.min(1.5, 1 / Math.sqrt(Math.max(nz, 0.2))) - 1) * (1 - others);

// ---------- the board's plane, seen from the camera ----------
// The board is the plane y = 0 of the renderer's world, y up. The camera looks at it from `pitch` radians above it and
// turned `yaw` about it (render.js: the eye is at (cos p sin yaw, sin p, cos p cos yaw) from the target). The turn from
// world to camera axes (x right, y up, z toward the viewer) is Rx(pitch) after Ry(-yaw); it takes the board's up
// direction to (0, cos pitch, sin pitch): straight at the viewer from above, edge-on at pitch 0.
export const MIN_PITCH = 0.45;           // the shallowest the cameras allow (render.js, render-three.js)
const UP = [0, 1, 0];
export function boardView(cam) {
  return qmul(qaxis([1, 0, 0], cam.pitch), qaxis([0, 1, 0], -cam.yaw));
}
// A die lying on the board with its chosen face up, in world axes: the turn that takes the face's direction to up,
// then a twist about up. `twist` is made so the number reads upright on the screen of the camera that threw it
// (`turnedTo`), give or take `jitter`: a die lying on a table is not squared to us, but its number is never upside down.
export function restingTurn(die, twist = 0) {
  const f = solidOf(die.sides).faces[faceIndex(die)] ?? solidOf(die.sides).faces[0];
  return qmul(qaxis(UP, twist), qfrom(f.n, UP));
}
// The twist that puts the top face's "up" along the screen's up, on the board, plus `jitter`.
export function uprightTwist(die, cam, jitter = 0) {
  const f = solidOf(die.sides).faces[faceIndex(die)] ?? solidOf(die.sides).faces[0];
  const w0 = qrot(restingTurn(die, 0), f.w), ang = (v) => Math.atan2(-v[2], v[0]);
  const ahead = [-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)];            // along the board, away from the camera: screen up
  return ang(ahead) - ang(w0) + jitter;
}
// How far the die's lowest point is below its centre when it lies so, in units of its size: what it stands on.
export function standHeight(die, rest) {
  return -Math.min(...solidOf(die.sides).verts.map((v) => qrot(rest, v)[1]));
}
// What a die is drawn bigger by, so the number on the board still reads from a low camera, where the board's plane is
// seen at a slant: 1 from straight above, up to 1.9 at the shallowest pitch.
export const sizeBias = (pitch) => 1 + 0.9 * Math.max(0, Math.min(1, (1 - Math.sin(pitch)) / (1 - Math.sin(MIN_PITCH))));

// The turn that puts a die's chosen face toward us, tipped a little so it looks solid: for the tray, which is not on the board.
function facingTurn(die) {
  const f = solidOf(die.sides).faces[faceIndex(die)] ?? solidOf(die.sides).faces[0];
  return qmul(qaxis([1, 0, 0], 0.32), qfrom(f.n, [0, 0, 1]));
}

// ---------- the thrower ----------
const ease = (t) => 1 - (1 - t) ** 3;
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

export function createDice(canvas, prefs, camera = () => ({ yaw: 0, pitch: 0.95 })) {
  const ctx = canvas.getContext('2d');
  let show = SHOWS.includes(prefs.get(PREF)) ? prefs.get(PREF) : 'full';
  let current = null, raf = 0;            // current: { dice, label, sub, mark, start, times, done }
  const queue = [];
  let finish = null;                      // resolves the promise of play()

  function fit() {
    const r = Math.min(2, devicePixelRatio || 1), w = innerWidth, h = innerHeight;
    if (canvas.width !== Math.round(w * r) || canvas.height !== Math.round(h * r)) { canvas.width = Math.round(w * r); canvas.height = Math.round(h * r); }
    ctx.setTransform(r, 0, 0, r, 0, 0);
    return { w, h };
  }
  function timing() {
    const reduced = reducedMotion();
    if (show === 'quick' || reduced) return { fly: reduced ? 0.3 : 0.45, hold: 0.55, fade: 0.2, spin: !reduced, num: 0.35 };
    return { fly: 0.95, hold: 0.7, fade: 0.25, spin: true, num: 0.45 };
  }
  // The camera now, clamped to what the cameras allow.
  const cam = () => { const c = camera() ?? {}; return { yaw: Number.isFinite(c.yaw) ? c.yaw : 0, pitch: Math.max(MIN_PITCH, Math.min(1.5, Number.isFinite(c.pitch) ? c.pitch : 0.95)) }; };
  // The room the dice may use: below the turn order and the title, above the dock.
  function band(h, titleH) {
    const bottom = (id) => { const el = document.getElementById(id), r = el && !el.hidden ? el.getBoundingClientRect() : null; return r && r.height > 0 ? r : null; };
    const strip = bottom('order'), head = bottom('top'), dock = bottom('dock');
    const topEdge = Math.max(head ? head.bottom : 0, strip ? strip.bottom : 0) + 8 + titleH;
    const botEdge = dock && dock.top > h * 0.3 ? dock.top - 10 : h - 10;
    return { top: topEdge, bottom: Math.max(topEdge + 60, botEdge) };
  }
  // Lay out a group: where each die starts and rests on the board, and how it turns. The dice lie in the board's
  // plane, so a row further back is higher up the screen by the sine of the pitch.
  function begin(g) {
    const { w, h } = fit(), times = timing(), view = cam(), sp = Math.sin(view.pitch);
    const all = expand(g.dice), dice = all.slice(0, MAX_DICE), extra = all.length - dice.length;
    const chip = chipOf(g, w, extra), room = band(h, chip.hgt + 4);
    let size = Math.max(26, Math.min(54, Math.min(w, h) * 0.09)) * sizeBias(view.pitch), gap, perRow, rows, rowGap, block;
    for (let k = 0; k < 8; k++) {                                       // shrink until the whole throw fits its room
      gap = size * 2.3; perRow = Math.max(1, Math.min(dice.length, Math.floor((w - 24) / gap))); rows = Math.ceil(dice.length / perRow);
      rowGap = Math.max(gap * sp, size * 1.75); block = (rows - 1) * rowGap + size * 2.6;
      if (block <= room.bottom - room.top || size <= 22) break;
      size *= 0.88;
    }
    const cy = Math.max(room.top + block / 2, Math.min(room.bottom - block / 2, h * 0.45)), top = cy - ((rows - 1) * rowGap) / 2;
    const flick = g.flick ?? null;
    dice.forEach((d, i) => {
      const row = Math.floor(i / perRow), inRow = Math.min(perRow, dice.length - row * perRow), col = i - row * perRow;
      d.ex = w / 2 + (col - (inRow - 1) / 2) * gap + (Math.random() - 0.5) * size * 0.3;
      d.ey = top + row * rowGap + (Math.random() - 0.5) * size * 0.2;
      const fromTop = g.from === 'top';
      const dx = flick ? -flick.x : (Math.random() - 0.5) * 0.6, dy = flick ? -flick.y : fromTop ? -1 : 1;
      const l = Math.hypot(dx, dy) || 1;
      d.sx = d.ex + (dx / l) * h * 0.7 + (Math.random() - 0.5) * size * 2;
      d.sy = d.ey + (dy / l) * h * 0.7;
      d.size = size * (d.drop ? 0.82 : 1);
      d.top = faceIndex(d);
      d.rest = restingTurn(d, uprightTwist(d, view, (Math.random() - 0.5) * 0.5));       // lying on the board, number upright for this camera
      d.stand = standHeight(d, d.rest);
      d.axis = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5];
      d.spins = times.spin ? 2 + Math.random() * 2.5 : 0;
      d.color ??= g.color;
    });
    const padW = ((Math.min(perRow, dice.length) - 1) * gap) / 2 + size * 1.5, padH = ((rows - 1) * rowGap) / 2 + size * 1.5 * Math.max(sp, 0.5);
    current = { ...g, dice, extra, start: performance.now(), times, size, chip, minTop: room.top - chip.hgt - 4, pad: { x: w / 2, y: top + ((rows - 1) * rowGap) / 2, rx: padW, ry: padH }, view };
    canvas.hidden = false;
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function frame(now) {
    raf = 0;
    if (!current) return;
    const { w, h } = fit(), c = current, t = (now - c.start) / 1000, T = c.times;
    ctx.clearRect(0, 0, w, h);
    const end = T.fly + T.hold + T.fade;
    if (t >= end) return next();
    const fade = t > T.fly + T.hold ? 1 - (t - T.fly - T.hold) / T.fade : 1;
    const view = cam(), qv = boardView(view), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
    // The surface the dice land on: a patch of the board, flattened by the pitch the way the board is.
    const land = Math.min(1, t / (T.fly * 0.6)), P = c.pad;
    ctx.save();
    ctx.globalAlpha = 0.9 * fade * land;
    ctx.fillStyle = 'rgba(12,12,16,0.3)'; ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(P.x, P.y, P.rx, Math.max(P.ry, P.rx * sp * 0.6), 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
    // Once the dice are down the numerals on every face but the top fade out, leaving the number that counted.
    const others = t < T.fly + 0.05 ? 1 : Math.max(0, 1 - (t - T.fly - 0.05) / T.num);
    for (const d of c.dice) {
      const u = Math.min(1, t / T.fly), e = ease(u);
      const x = d.sx + (d.ex - d.sx) * e, y = d.sy + (d.ey - d.sy) * e;
      const hop = T.spin ? Math.abs(Math.sin(u * Math.PI * 2.5)) * (1 - u) ** 2 * d.size * 1.6 : 0;
      const q = qmul(qv, d.spins ? qmul(qaxis(d.axis, d.spins * Math.PI * 2 * (1 - e)), d.rest) : d.rest);      // the world's rest, seen from the camera now
      // Its shadow is on the board, under it: down the screen by what it stands on (the board's up is cos(pitch) of the screen's).
      const gy = y + d.size * d.stand * cp, rx = d.size * (0.95 - hop / (d.size * 4));
      ctx.globalAlpha = 0.3 * fade;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(x, gy, rx, Math.max(2, rx * sp * 0.7), 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      const settled = u >= 1;
      drawDie(ctx, d, x, y - hop, d.size, q, fade * (d.drop && settled ? 0.38 : 1), { top: d.top, others });
      if (settled && d.neg) { ctx.globalAlpha = fade; ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(d.size * 0.6)}px system-ui`; ctx.fillText('−', x - d.size * 1.15, y); }
    }
    label(c, w, fade, t >= T.fly);
    raf = requestAnimationFrame(frame);
  }
  // The title chip, laid out once per throw so it does not jump: the title over at most two lines, and under it what the
  // roll made. It keeps clear of the camera buttons down the right edge by being no wider than the screen less 2 x 52 px.
  function chipOf(g, w, extra) {
    const fs = Math.round(Math.max(14, Math.min(w, innerHeight) * 0.024)), maxW = Math.max(180, w - 104) - 28;
    const result = [g.sub, extra > 0 ? `+${extra} more dice` : ''].filter(Boolean).join(' · ');
    ctx.save();
    ctx.font = `700 ${fs}px system-ui, sans-serif`;
    const lines = [''];
    for (const word of String(g.label || '').split(' ')) {                                // wrap at spaces, two lines at most
      const cur = lines.at(-1), tryIt = cur ? `${cur} ${word}` : word;
      if (cur && ctx.measureText(tryIt).width > maxW && lines.length < 2) lines.push(word); else lines[lines.length - 1] = tryIt;
    }
    let wide = Math.max(...lines.map((l) => ctx.measureText(l).width));
    if (wide > maxW) { for (let k = 0; k < lines.length; k++) { let l = lines[k]; while (l.length > 4 && ctx.measureText(l).width > maxW) l = l.slice(0, -2); lines[k] = l === lines[k] ? l : `${l.trimEnd()}…`; } wide = maxW; }
    const sf = Math.round(fs * 0.85);
    ctx.font = `600 ${sf}px system-ui, sans-serif`;
    let rl = result; while (rl.length > 4 && ctx.measureText(rl).width > maxW) rl = rl.slice(0, -2);
    const rw = rl ? ctx.measureText(rl).width : 0;
    ctx.restore();
    const lh = Math.round(fs * 1.25);
    return { fs, sf, lines: lines.filter(Boolean), result: rl === result ? rl : `${rl.trimEnd()}…`, wd: Math.min(maxW, Math.max(wide, rw)) + 28, lh, hgt: Math.round(fs * 0.9) + lh * Math.max(1, lines.filter(Boolean).length) + (rl ? Math.round(sf * 1.3) : 0) };
  }
  // The roll's title, in the air and at rest: who, and what for. What it made is added once the dice are down.
  function label(c, w, alpha, down) {
    const k = c.chip;
    if (!k.lines.length && !k.result) return;
    const ys = c.dice.map((d) => d.ey), topY = Math.max(c.minTop, Math.min(...ys) - c.size * 1.25 - k.hgt);      // above the top row, below the turn order
    const mark = c.mark === 'crit' ? '#f4c430' : c.mark === 'fumble' ? '#9aa0a6' : null;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(20,20,24,0.88)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(w / 2 - k.wd / 2, topY, k.wd, k.hgt, 16); else ctx.rect(w / 2 - k.wd / 2, topY, k.wd, k.hgt);
    ctx.fill();
    if (mark && down) { ctx.strokeStyle = mark; ctx.lineWidth = 3; ctx.stroke(); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `700 ${k.fs}px system-ui, sans-serif`; ctx.fillStyle = '#fdfbf3';
    const y0 = topY + Math.round(k.fs * 0.45) + k.lh / 2;
    k.lines.forEach((l, i) => ctx.fillText(l, w / 2, y0 + i * k.lh));
    if (down && k.result) { ctx.font = `600 ${k.sf}px system-ui, sans-serif`; ctx.fillStyle = mark ?? '#e9e4d2'; ctx.fillText(k.result, w / 2, topY + k.hgt - Math.round(k.sf * 0.95)); }
    ctx.restore();
  }
  function next() {
    current = null;
    if (queue.length) return begin(queue.shift());
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.hidden = true;
    const f = finish; finish = null; f?.();
  }
  canvas.addEventListener('pointerdown', (ev) => { ev.preventDefault(); D.skip(); });
  canvas.hidden = true;

  const D = {
    get show() { return show; },
    set show(v) { if (SHOWS.includes(v)) { show = v; prefs.set(PREF, v); if (v === 'off') D.skip(); } },
    get busy() { return !!current || queue.length > 0; },
    play(groups) {
      if (show === 'off' || !groups.length) return Promise.resolve();
      return new Promise((resolve) => {
        const was = finish;
        finish = () => { was?.(); resolve(); };
        queue.push(...groups);
        if (!current) begin(queue.shift());
      });
    },
    skip() {
      queue.length = 0;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      next();
    },
    tray,
  };

  // ---------- the tray: the dice an armed action will roll, waiting to be thrown ----------
  function tray({ dice, label, sub, color, onThrow, onCancel }) {
    document.getElementById('dice-tray')?.remove();
    const el = document.createElement('div');
    el.id = 'dice-tray'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Throw the dice');
    el.innerHTML = `<div class="dt-words"><strong></strong><small></small></div><canvas class="dt-dice" aria-hidden="true"></canvas><div class="dt-buttons"><button type="button" class="dt-throw">Throw</button><button type="button" class="dt-cancel">Cancel</button></div>`;
    el.querySelector('strong').textContent = label;
    el.querySelector('small').textContent = sub || 'Flick, tap or click the dice to throw';
    document.body.append(el);
    const cv = el.querySelector('canvas'), c2 = cv.getContext('2d');
    const shown = expand(dice.map((sides) => ({ sides, value: sides === 100 ? 100 : sides, color })));
    const each = 64, r = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(each * Math.max(1, Math.min(shown.length, 6)) * r); cv.height = Math.round(each * r);
    cv.style.width = `${cv.width / r}px`; cv.style.height = `${each}px`;
    let anim = 0, closed = false;
    const t0 = performance.now(), turns = shown.map(() => [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5]);
    const still = reducedMotion();
    const wobble = (now) => {
      c2.setTransform(r, 0, 0, r, 0, 0);
      c2.clearRect(0, 0, cv.width, cv.height);
      const s = (now - t0) / 1000;
      shown.slice(0, 6).forEach((d, i) => drawDie(c2, d, each / 2 + i * each, each / 2, each * 0.36, qmul(qaxis(turns[i], still ? 0.6 : 0.6 + Math.sin(s * 2 + i) * 0.35), facingTurn(d))));
      if (!still && !closed) anim = requestAnimationFrame(wobble);
    };
    anim = requestAnimationFrame(wobble);
    const close = () => { closed = true; cancelAnimationFrame(anim); el.remove(); removeEventListener('keydown', key); };
    const go = (flick) => { close(); onThrow(flick); };
    let down = null;
    cv.addEventListener('pointerdown', (ev) => { ev.preventDefault(); down = { x: ev.clientX, y: ev.clientY, t: performance.now() }; cv.setPointerCapture?.(ev.pointerId); });
    cv.addEventListener('pointerup', (ev) => {
      if (!down) return;
      const dx = ev.clientX - down.x, dy = ev.clientY - down.y, l = Math.hypot(dx, dy);
      down = null;
      go(l > 12 ? { x: dx / l, y: dy / l } : null);          // a flick throws the way it went; a tap throws up the screen
    });
    el.querySelector('.dt-throw').onclick = () => go(null);
    el.querySelector('.dt-cancel').onclick = () => { close(); onCancel?.(); };
    const key = (ev) => {
      if (ev.target.tagName === 'INPUT') return;
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(null); }
      if (ev.key === 'Escape') { close(); onCancel?.(); }
    };
    addEventListener('keydown', key);
    return close;
  }
  return D;
}
