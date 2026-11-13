// Dice on the screen (docs/specs/dice.md). The dice drawn are the engine's dice: each lands on
// the face its event says. Nothing here decides anything. A 2D canvas over the board draws each
// die as a projected solid with a scripted tumble that ends on the chosen face; the canvas is
// drawn only while dice are moving, so it costs nothing at rest.
//
//   const D = createDice(canvas, prefs)
//   D.show                               'off' | 'quick' | 'full' (a per-device preference)
//   D.play(groups) -> Promise            throws groups one after another; resolves when settled or skipped
//   D.skip()                             ends what is playing at once
//   D.tray({ dice, label, sub, color, onThrow(flick), onCancel }) -> close()
//
// A group is { dice: [{ sides, value, drop?, neg?, color? }], color, label, sub, mark, from, flick }.
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
      return { idx: [...idx].sort((a, b) => ang(a) - ang(b)), n, c };
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
// Draw a die at (x, y), `size` pixels from centre to corner, turned by q.
export function drawDie(ctx, die, x, y, size, q, alpha = 1) {
  const sol = solidOf(die.sides), rgb = hexRgb(die.color), ink = inkOn(rgb);
  const pts = sol.verts.map((v) => { const r = qrot(q, v), p = 1 + r[2] * 0.12; return [x + r[0] * size * p, y - r[1] * size * p, r[2]]; });
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineJoin = 'round';
  sol.faces.forEach((f, i) => {
    const n = qrot(q, f.n);
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
    if (n[2] < 0.3 || die.sides === 4 && n[2] < 0.5) return;
    const c = qrot(q, f.c), p = 1 + c[2] * 0.12, t = faceText(die, i);
    ctx.globalAlpha = alpha * Math.min(1, (n[2] - 0.3) * 2.2);
    ctx.fillStyle = ink;
    ctx.font = `700 ${Math.round(size * (die.sides === 20 ? 0.36 : die.sides >= 10 ? 0.42 : 0.55) * (0.6 + 0.4 * n[2]) * (t.length > 1 ? 0.85 : 1))}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(t + ((t === '6' || t === '9') && die.sides > 6 ? '.' : ''), x + c[0] * size * p, y - c[1] * size * p);
    ctx.globalAlpha = alpha;
  });
  ctx.restore();
}
// The turn that puts a die's chosen face toward us, with a twist about the line of sight.
function restingTurn(die, twist) {
  const f = solidOf(die.sides).faces[faceIndex(die)] ?? solidOf(die.sides).faces[0];
  return qmul(qaxis([1, 0, 0], 0.32), qmul(qaxis([0, 0, 1], twist), qfrom(f.n, [0, 0, 1])));      // tipped a little toward us, so it looks solid
}

// ---------- the thrower ----------
const ease = (t) => 1 - (1 - t) ** 3;
const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

export function createDice(canvas, prefs) {
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
    if (show === 'quick' || reduced) return { fly: reduced ? 0.3 : 0.45, hold: 0.55, fade: 0.2, spin: !reduced };
    return { fly: 0.95, hold: 0.7, fade: 0.25, spin: true };
  }
  // Lay out a group: where each die starts and rests, and how it turns.
  function begin(g) {
    const { w, h } = fit(), times = timing();
    const all = expand(g.dice), dice = all.slice(0, MAX_DICE), extra = all.length - dice.length;
    const size = Math.max(26, Math.min(54, Math.min(w, h) * 0.09)), gap = size * 2.5;
    const perRow = Math.max(1, Math.min(dice.length, Math.floor((w - 40) / gap))), rows = Math.ceil(dice.length / perRow);
    const cy = h * 0.42, top = cy - ((rows - 1) * gap) / 2;
    const flick = g.flick ?? null;
    dice.forEach((d, i) => {
      const row = Math.floor(i / perRow), inRow = Math.min(perRow, dice.length - row * perRow), col = i - row * perRow;
      d.ex = w / 2 + (col - (inRow - 1) / 2) * gap + (Math.random() - 0.5) * size * 0.4;
      d.ey = top + row * gap + (Math.random() - 0.5) * size * 0.3;
      const fromTop = g.from === 'top';
      const dx = flick ? -flick.x : (Math.random() - 0.5) * 0.6, dy = flick ? -flick.y : fromTop ? -1 : 1;
      const l = Math.hypot(dx, dy) || 1;
      d.sx = d.ex + (dx / l) * h * 0.7 + (Math.random() - 0.5) * size * 2;
      d.sy = d.ey + (dy / l) * h * 0.7;
      d.size = size * (d.drop ? 0.82 : 1);
      d.rest = restingTurn(d, (Math.random() - 0.5) * 0.5);
      d.axis = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5];
      d.spins = times.spin ? 2 + Math.random() * 2.5 : 0;
      d.color ??= g.color;
    });
    current = { ...g, dice, extra, start: performance.now(), times, size };
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
    for (const d of c.dice) {
      const u = Math.min(1, t / T.fly), e = ease(u);
      const x = d.sx + (d.ex - d.sx) * e, y = d.sy + (d.ey - d.sy) * e;
      const hop = T.spin ? Math.abs(Math.sin(u * Math.PI * 2.5)) * (1 - u) ** 2 * d.size * 1.6 : 0;
      const q = d.spins ? qmul(d.rest, qaxis(d.axis, d.spins * Math.PI * 2 * (1 - e))) : d.rest;
      ctx.globalAlpha = 0.25 * fade;
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(x, y + d.size * 0.9, d.size * (0.9 - hop / (d.size * 4)), d.size * 0.28, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      const settled = u >= 1;
      drawDie(ctx, d, x, y - hop, d.size, q, fade * (d.drop && settled ? 0.38 : 1));
      if (settled && d.neg) { ctx.globalAlpha = fade; ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(d.size * 0.6)}px system-ui`; ctx.fillText('−', x - d.size * 1.15, y); }
    }
    if (t >= T.fly) label(c, w, fade);
    raf = requestAnimationFrame(frame);
  }
  // The roll's words once the dice are down: whose roll, what it made, and a critical marked.
  function label(c, w, alpha) {
    const ys = c.dice.map((d) => d.ey), top = Math.min(...ys) - c.size * 2.1;
    const words = [c.label, c.sub, c.extra > 0 ? `+${c.extra} more dice` : ''].filter(Boolean).join(' · ');
    if (!words) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `700 ${Math.round(Math.max(14, c.size * 0.42))}px system-ui, sans-serif`;
    const tw = Math.min(w - 24, ctx.measureText(words).width + 28), hgt = Math.max(28, c.size * 0.8);
    const mark = c.mark === 'crit' ? '#f4c430' : c.mark === 'fumble' ? '#9aa0a6' : null;
    ctx.fillStyle = 'rgba(20,20,24,0.82)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(w / 2 - tw / 2, top - hgt / 2, tw, hgt, hgt / 2); else ctx.rect(w / 2 - tw / 2, top - hgt / 2, tw, hgt);
    ctx.fill();
    if (mark) { ctx.strokeStyle = mark; ctx.lineWidth = 3; ctx.stroke(); }
    ctx.fillStyle = mark ?? '#fdfbf3';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(words, w / 2, top, w - 40);
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
      shown.slice(0, 6).forEach((d, i) => drawDie(c2, d, each / 2 + i * each, each / 2, each * 0.36, qmul(qaxis(turns[i], still ? 0.6 : 0.6 + Math.sin(s * 2 + i) * 0.35), restingTurn(d, 0))));
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
