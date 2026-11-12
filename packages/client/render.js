// 3D view. Reads game state, draws it, reports taps. Knows nothing about the rules.
//
// Creatures are drawn by a presenter. Today that is a pawn built from a lathe profile;
// a glTF model presenter or an animated one replaces makePawn() without touching the
// engine, because the engine only ever emits events ("moved", "attack", "damage").
// Zero dependencies: plain WebGL, so it runs on phones with no install and no CDN.
import * as H from './shared/hex.js';
import { allTiles, footprint, ground, shown, surfaces, under } from './shared/space.js';

const GIRTH = { tiny: 0.55, small: 0.8, medium: 1, large: 1.7, huge: 2.5, gargantuan: 3.2 };      // how much bigger a pawn is drawn
const girth = (e) => GIRTH[e?.size] ?? 1;
import { barriers, objectBlocks, objectDef, objectSegment } from './shared/walls.js';

const UNIT = Math.sqrt(3) / 5;                       // drawing units per foot: a hex is 5 ft across
const surfY = (z, tile) => z * UNIT + (tile?.lift ?? 0.6);
const SLAB = 0.35;                                   // thickness of a floor that has something under it

const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec4 aCol;
uniform mat4 uVP, uM; uniform vec3 uLight; uniform vec4 uTint; uniform float uLit; uniform vec2 uFog;
varying vec4 vCol; varying float vFog;
void main() {
  vec4 w = uM * vec4(aPos, 1.0);
  vec3 n = normalize(mat3(uM) * aNor);
  float l = mix(1.0, 0.56 + 0.5 * max(dot(n, uLight), 0.0), uLit);
  vCol = vec4(aCol.rgb * l * uTint.rgb, aCol.a * uTint.a);
  gl_Position = uVP * w;
  vFog = clamp((gl_Position.w - uFog.x) / uFog.y, 0.0, 1.0);
}`;
const FS = `
precision mediump float;
varying vec4 vCol; varying float vFog; uniform vec3 uSky;
void main() { gl_FragColor = vec4(mix(vCol.rgb, uSky, vFog * 0.8), vCol.a); }`;

// ---------- tiny matrix kit (column-major) ----------
const ident = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function lookAt(eye, at) {
  const f = norm(sub(at, eye)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
  return { m: [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot(r, eye), -dot(u, eye), dot(f, eye), 1], f, r, u };
}
function model(x, y, z, yaw, tilt, sc = 1) {
  const c = Math.cos(yaw), s = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
  // T * Ry(yaw) * Rx(tilt) * S
  return [c * sc, 0, -s * sc, 0, s * st * sc, ct * sc, c * st * sc, 0, s * ct * sc, -st * sc, c * ct * sc, 0, x, y, z, 1];
}

// ---------- mesh building ----------
class Builder {
  constructor() { this.d = []; }
  tri(a, b, c, col) {
    const n = norm(cross(sub(b, a), sub(c, a)));
    for (const p of [a, b, c]) this.d.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2], col[3] ?? 1);
  }
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  // Ring of `sides` points at radius r, height y. rot 30deg puts hex corners on the z axis (pointy-top).
  ring(cx, cz, r, y, sides, rot) {
    const out = [];
    for (let i = 0; i < sides; i++) { const a = rot + (i * 2 * Math.PI) / sides; out.push([cx + r * Math.cos(a), y, cz + r * Math.sin(a)]); }
    return out;
  }
  // Solid of revolution from a profile [[radius, y], ...]. colAt(i) colors segment i.
  lathe(cx, cz, y0, profile, sides, rot, colAt) {
    let prev = this.ring(cx, cz, profile[0][0], y0 + profile[0][1], sides, rot);
    for (let p = 1; p < profile.length; p++) {
      const cur = this.ring(cx, cz, profile[p][0], y0 + profile[p][1], sides, rot), col = colAt(p - 1);
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        if (profile[p][0] === 0) this.tri(prev[j], prev[i], cur[i], col);
        else if (profile[p - 1][0] === 0) this.tri(prev[i], cur[j], cur[i], col);
        else this.quad(prev[j], prev[i], cur[i], cur[j], col);
      }
      prev = cur;
    }
  }
  flatHex(cx, cz, y, r0, r1, col) {            // disc (r0 = 0) or ring on the ground plane
    const o = this.ring(cx, cz, r1, y, 6, Math.PI / 6), i = r0 ? this.ring(cx, cz, r0, y, 6, Math.PI / 6) : null;
    for (let k = 0; k < 6; k++) {
      const j = (k + 1) % 6;
      if (i) this.quad(o[j], o[k], i[k], i[j], col); else this.tri(o[j], o[k], [cx, y, cz], col);
    }
  }
}
class Mesh {
  constructor(gl) { this.gl = gl; this.buf = gl.createBuffer(); this.n = 0; }
  set(builder) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(builder.d), gl.DYNAMIC_DRAW);
    this.n = builder.d.length / 10;
  }
  draw(loc, m, tint = [1, 1, 1, 1], lit = 1) {
    const gl = this.gl;
    if (!this.n) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 40, 0);
    gl.vertexAttribPointer(loc.aNor, 3, gl.FLOAT, false, 40, 12);
    gl.vertexAttribPointer(loc.aCol, 4, gl.FLOAT, false, 40, 24);
    gl.uniformMatrix4fv(loc.uM, false, m);
    gl.uniform4fv(loc.uTint, tint);
    gl.uniform1f(loc.uLit, lit);
    gl.drawArrays(gl.TRIANGLES, 0, this.n);
  }
}
const jitter = (q, r) => { const h = Math.sin(q * 127.1 + r * 311.7) * 43758.5453; return h - Math.floor(h); };
const shade = (c, f) => [c[0] * f, c[1] * f, c[2] * f, 1];
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

// How full to draw a health bar. Players are not sent a monster's numbers, only a
// word for how it looks, so a record without maxHp is drawn from that word.
export function hpFraction(e) {
  if (e.maxHp > 0) return Math.max(0, Math.min(1, e.hp / e.maxHp));
  return { healthy: 1, bloodied: 0.45, down: 0, dead: 0 }[e.health] ?? (e.hp > 0 ? 1 : 0);
}

export class Renderer {
  constructor(canvas, labels, theme) {
    this.canvas = canvas; this.labels = labels; this.theme = theme;
    const gl = (this.gl = canvas.getContext('webgl', { antialias: true, alpha: false }));
    if (!gl) throw new Error('WebGL is not available in this browser.');
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    this.loc = {};
    for (const a of ['aPos', 'aNor', 'aCol']) { this.loc[a] = gl.getAttribLocation(prog, a); gl.enableVertexAttribArray(this.loc[a]); }
    for (const u of ['uVP', 'uM', 'uLight', 'uTint', 'uLit', 'uFog', 'uSky']) this.loc[u] = gl.getUniformLocation(prog, u);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.terrain = new Mesh(gl); this.overlay = new Mesh(gl);
    this.actors = new Map();                  // id -> {mesh, x, y, z, yaw, way, el, key}
    this.ceiling = Infinity;
    this.cam = { x: 0, y: 0.6, z: 0, yaw: 0.5, pitch: 0.95, dist: 22, goal: null };
    this.hl = { move: [], area: [], targets: [], allies: [], selected: null, turn: null };
    this.state = null; this.terrainKey = ''; this.floaters = []; this.inset = 0;   // px of screen bottom covered by UI
    this.onTap = () => {}; this.onHover = () => {};
    this.onPoint = null;                      // when set, a tap reports its screen point here instead of picking (the map editor)
    this.#input();
    new ResizeObserver(() => this.#resize()).observe(canvas);
    this.#resize();
    if (canvas.clientWidth / canvas.clientHeight < 0.8) this.cam.dist = 30;
    let last = performance.now();
    const loop = (t) => { this.#frame(Math.min(0.05, (t - last) / 1000)); last = t; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  // ---------- public ----------
  setTheme(theme) { this.theme = theme; this.terrainKey = ''; for (const a of this.actors.values()) a.key = ''; if (this.state) this.setState(this.state, []); }

  setState(state, events = []) {
    this.state = state;
    const tk = `${state.encounter?.id ?? 0}:${state.map.id}:${state.map.levels.map((l) => Object.keys(l.tiles).length).join()}:${barriers(state.map).sig}:${state.map.regions.map((r) => (r.revealed ? 1 : 0)).join('')}:${this.ceiling}`;
    if (tk !== this.terrainKey) { this.terrainKey = tk; this.#buildTerrain(); }
    for (const [id, a] of this.actors) if (!state.entities[id]) { a.el.remove(); this.actors.delete(id); }
    for (const e of Object.values(state.entities)) {
      let a = this.actors.get(e.id);
      const w = this.#spot(e, e.pos);
      if (!a) {
        const el = document.createElement('div');
        el.className = 'label'; el.innerHTML = '<span></span><div class="bar"><i></i></div>';
        this.labels.append(el);
        a = { mesh: new Mesh(this.gl), ...w, yaw: 0, way: [], el, key: '' };
        this.actors.set(e.id, a);
      }
      const key = `${e.dead}|${e.side}|${e.size}`; a.k = girth(e);
      if (key !== a.key) { a.key = key; a.mesh.set(this.#makePawn(e)); }
      a.el.dataset.side = e.side; a.el.classList.toggle('dead', e.dead); a.el.classList.toggle('down', !e.dead && e.hp <= 0); a.el.classList.toggle('unseen', !!e.hidden);
      const sf = ground(state.map, e.pos) ? null : under(state.map, e.pos);
      a.el.firstChild.textContent = sf ? `${e.name} ↑${e.pos.z - sf.z} ft` : e.name;
      a.el.querySelector('i').style.width = `${hpFraction(e) * 100}%`;
      a.tilt = e.dead ? 1.45 : e.hp <= 0 ? 1.2 : e.cond.prone ? 0.9 : 0;
    }
    for (const ev of events) {
      const a = this.actors.get(ev.id);
      if (ev.type === 'moved' && a) for (const h of ev.path) a.way.push(this.#spot(state.entities[ev.id], h));
    }
    for (const e of Object.values(state.entities)) {            // anything teleported or out of sync
      const a = this.actors.get(e.id), w = this.#stand(e.pos);
      if (!a.way.length && (Math.abs(a.x - w.x) > 0.01 || Math.abs(a.z - w.z) > 0.01)) Object.assign(a, w);
    }
    this.#buildOverlay();
  }

  // Do not draw floors higher than this (in feet), so that a room is not hidden by the one above it.
  setCeiling(z) { if (z !== this.ceiling) { this.ceiling = z; this.terrainKey = ''; if (this.state) this.setState(this.state, []); } }

  setHighlights(hl) { this.hl = { move: [], area: [], targets: [], allies: [], selected: null, turn: null, ...hl }; if (this.state) this.#buildOverlay(); }

  focus(id, snap = false) {
    const a = this.actors.get(id); if (!a) return;
    const end = a.way.length ? a.way[a.way.length - 1] : a;
    if (snap) { this.cam.x = end.x; this.cam.z = end.z; this.cam.goal = null; } else this.cam.goal = { x: end.x, z: end.z };
  }
  // The hex under a screen point on a flat plane `feet` high, ignoring what is drawn: for picking
  // empty space (the map editor). Null if the point looks at the sky.
  planeHex(px, py, feet = 0) {
    const C = this.C; if (!C) return null;
    const nx = (px / this.canvas.clientWidth) * 2 - 1, ny = 1 - (py / this.canvas.clientHeight) * 2 - C.shift;
    const d = norm([0, 1, 2].map((i) => C.f[i] + C.r[i] * nx * C.tan * C.aspect + C.u[i] * ny * C.tan));
    const t = (surfY(feet) - C.eye[1]) / d[1];
    if (!(t > 0) || t > 400) return null;
    return H.fromWorld(C.eye[0] + d[0] * t, C.eye[2] + d[2] * t);
  }
  screenOf(hex) { const w = this.#stand(hex); return this.C ? this.#project(this.C, w.x, w.y, w.z) : null; }
  rotate(d) { this.cam.yaw += d; }
  zoom(f) { this.cam.dist = Math.max(7, Math.min(48, this.cam.dist * f)); }

  floater(id, text, cls = '', delay = 0) {
    const el = document.createElement('div');
    el.className = `floater ${cls}`; el.textContent = text; el.style.visibility = 'hidden';
    this.labels.append(el);
    this.floaters.push({ id, el, t: -delay, life: 1.5 });
  }

  // ---------- building ----------
  #stand(h) { const w = H.toWorld(h), z = h.z ?? 0; return { x: w.x, y: surfY(z, ground(this.state.map, { q: h.q, r: h.r, z })?.tile), z: w.z }; }

  // Where a creature's pawn stands when its own hex is `pos`: the middle of the hexes it fills.
  #spot(e, pos) {
    const base = this.#stand(pos), parts = footprint(e ?? {}, pos);
    if (parts.length === 1) return base;
    let x = 0, z = 0;
    for (const f of parts) { const w = H.toWorld(f); x += w.x; z += w.z; }
    return { x: x / parts.length, y: base.y, z: z / parts.length };
  }

  #buildTerrain() {
    const b = new Builder(), th = this.theme, map = this.state.map, enc = this.state.encounter, R = Math.PI / 6;
    const hid = (levelId) => (map.levels.find((l) => l.id === levelId)?.z ?? 0) > this.ceiling;      // a floor above whoever is being followed
    for (const h of allTiles(map)) {
      if (h.z > this.ceiling) continue;
      const t = h.tile, w = H.toWorld(h), locked = enc && !enc.arena[H.col(h)], y = surfY(h.z, t);
      const lowest = surfaces(map, h)[0].z === h.z;                      // the bottom of a column is a pillar; a floor above it is a slab
      const j = 0.94 + jitter(h.q, h.r) * 0.12;
      let c = th.tiles[t.t].map((v) => v * j);
      if (locked) { const g = (c[0] + c[1] + c[2]) / 3; c = c.map((v) => (v * 0.35 + g * 0.65) * 0.5); }
      if (!shown(map, h.level.id, h)) c = c.map((v, i) => v * 0.45 + (i === 2 ? 0.1 : 0.02));      // only the DM has these: not yet shown to players
      const rim = enc && !locked ? [...th.arenaRim, 1] : shade(c, th.rim);
      b.flatHex(w.x, w.z, y, 0, 0.86, [...c, 1]);
      b.flatHex(w.x, w.z, y, 0.86, 1, rim);
      const top = b.ring(w.x, w.z, 1, y, 6, R), bot = b.ring(w.x, w.z, 1, lowest ? Math.min(-1.5, y - 1.5) : y - SLAB, 6, R);
      for (let i = 0; i < 6; i++) { const n = (i + 1) % 6; b.quad(top[i], top[n], bot[n], bot[i], shade(c, th.side)); }
      if (t.t === 'forest') {
        const tc = locked ? shade(th.tree, 0.45) : [...th.tree, 1];
        for (let i = 0; i < 2; i++) {
          const a = jitter(h.q + i * 7, h.r - i * 3) * 6.28, d = 0.28 + 0.2 * i, hh = 0.9 + jitter(h.r, h.q + i) * 0.7;
          b.lathe(w.x + Math.cos(a) * d, w.z + Math.sin(a) * d, y, [[0.1, 0], [0.1, 0.25], [0.42, 0.25], [0, hh + 0.25]], 6, a, (s) => (s === 0 ? shade(tc, 0.5) : tc));
        }
      }
    }
    // Walls and doors, drawn low enough to see over.
    const WALLS = { wall: [1.15, th.wall ?? [0.44, 0.42, 0.4]], window: [0.55, th.wallWindow ?? [0.55, 0.62, 0.68]], rail: [0.5, th.wall ?? [0.44, 0.42, 0.4]], curtain: [1.15, th.curtain ?? [0.38, 0.3, 0.45]] };
    const baseOf = (id) => (map.levels.find((l) => l.id === id)?.z ?? 0) * UNIT + 0.55;
    for (const w of map.walls) { if (hid(w.level)) continue; const [h, c] = WALLS[w.kind] ?? WALLS.wall; this.#slab(b, w.a, w.b, baseOf(w.level), h, 0.09, c); }
    for (const o of map.objects) {
      if (hid(o.level)) continue;
      const seg = objectSegment(o), unseen = !!objectDef(o)?.states[o.state]?.hidden;       // only the DM is ever sent an unseen one
      if (!seg) {                                                       // a thing in a hex: a marker on the floor, and a post if it is in the way or a lever
        const w = H.toWorld(o.at), y = this.#stand({ q: o.at.q, r: o.at.r, z: (map.levels.find((l) => l.id === o.level)?.z ?? 0) + (map.levels.find((l) => l.id === o.level)?.tiles[H.col(o.at)]?.h ?? 0) }).y + 0.02;
        const trap = !!objectDef(o)?.triggers?.some((t) => t.effects), col = trap ? [0.75, 0.2, 0.18] : [0.8, 0.68, 0.3];
        b.flatHex(w.x, w.z, y, 0.34, 0.5, [...col, unseen ? 0.45 : 1]);
        if (o.def === 'pit-trap' && o.state === 'open') b.flatHex(w.x, w.z, y + 0.005, 0, 0.6, [0.05, 0.05, 0.06, 1]);
        if (objectBlocks(o, 'move') || o.def === 'lever') b.lathe(w.x, w.z, y, [[0.12, 0], [0.12, o.def === 'lever' ? 0.7 : 1.1], [0, o.def === 'lever' ? 0.8 : 1.2]], 6, 0, () => [...col, 1]);
        continue;
      }
      const shut = objectBlocks(o, 'move'), c = th.door ?? [0.5, 0.33, 0.17];
      if (shut) this.#slab(b, seg[0], seg[1], baseOf(o.level), unseen ? 1.25 : 1.0, 0.07, unseen ? [0.62, 0.3, 0.55] : objectBlocks(o, 'sight') ? c : [0.3, 0.3, 0.32]);
      else {                                                            // open: the leaf stands swung back against its hinge
        const [p, q] = seg, dx = q[0] - p[0], dy = q[1] - p[1];
        this.#slab(b, p, [p[0] - dy * 0.8, p[1] + dx * 0.8], baseOf(o.level), 1.0, 0.05, c);
      }
    }
    this.terrain.set(b);
  }
  // An upright slab along a line given in map feet.
  #slab(b, p, q, y0, height, half, col) {
    const ax = p[0] * UNIT, az = p[1] * UNIT, bx = q[0] * UNIT, bz = q[1] * UNIT, len = Math.hypot(bx - ax, bz - az) || 1;
    const nx = (-(bz - az) / len) * half, nz = ((bx - ax) / len) * half, y1 = y0 + height;
    const c = [[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]];
    const lo = c.map(([x, z]) => [x, y0, z]), hi = c.map(([x, z]) => [x, y1, z]);
    const face = (a, b2, c2, d, f) => { b.quad(a, b2, c2, d, shade(col, f)); b.quad(d, c2, b2, a, shade(col, f)); };
    face(hi[0], hi[1], hi[2], hi[3], 1.1);
    for (let i = 0; i < 4; i++) { const n = (i + 1) % 4; face(hi[i], hi[n], lo[n], lo[i], i % 2 ? 0.7 : 0.9); }
  }

  #buildOverlay() {
    const b = new Builder(), s = this.state, hl = this.hl, c = this.theme.hl;
    const top = (k) => this.#stand(H.parse(k)).y + 0.03;
    const at = (k) => H.toWorld(H.parse(k));
    for (const k of hl.move) { const w = at(k); b.flatHex(w.x, w.z, top(k), 0, 0.78, c.move); }
    for (const k of hl.area) { const w = at(k); b.flatHex(w.x, w.z, top(k) + 0.01, 0, 0.92, c.area); }
    // Whatever is in the air has a mark on the floor beneath it.
    for (const e of Object.values(s.entities)) { const sf = !e.dead && !ground(s.map, e.pos) ? under(s.map, e.pos) : null; if (sf) { const w = H.toWorld(e.pos); b.flatHex(w.x, w.z, this.#stand({ q: e.pos.q, r: e.pos.r, z: sf.z }).y + 0.02, 0.2, 0.42, [0, 0, 0, 0.45]); } }
    const ringOn = (id, col, r0 = 0.66, r1 = 0.94) => {
      const e = s.entities[id]; if (!e) return;
      for (const f of footprint(e)) { const k = H.key(f), w = at(k); b.flatHex(w.x, w.z, top(k) + 0.02, r0, r1, col); }      // every hex it fills
    };
    for (const id of hl.targets) ringOn(id, c.target);
    for (const id of hl.allies) ringOn(id, c.ally);
    if (hl.turn) ringOn(hl.turn, [...this.theme.arenaRim, 0.95], 0.72, 0.98);
    if (hl.selected) ringOn(hl.selected, c.select, 0.56, 0.68);
    this.overlay.set(b);
  }

  // The pawn presenter: one lathe profile per theme, colored by side and character.
  #makePawn(e) {
    const b = new Builder(), th = this.theme, p = th.pawn;
    const base = [...th.sides[e.side] || th.sides.foe, 1];
    let body = e.look?.color ? [...hexToRgb(e.look.color), 1] : [...th.foeBody, 1];
    if (e.dead) body = [0.4, 0.4, 0.4, 1];
    const k = girth(e);
    b.lathe(0, 0, 0, p.profile.map(([r, y]) => [r * k, y * k]), p.sides, p.sides === 4 ? Math.PI / 4 : 0, (seg) => (seg < 2 ? base : body));
    return b;
  }

  // ---------- frame ----------
  #resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), c = this.canvas;
    c.width = Math.max(2, Math.round(c.clientWidth * dpr)); c.height = Math.max(2, Math.round(c.clientHeight * dpr));
    this.gl.viewport(0, 0, c.width, c.height);
  }
  #camera() {
    const c = this.cam, cp = Math.cos(c.pitch);
    const eye = [c.x + c.dist * cp * Math.sin(c.yaw), c.y + c.dist * Math.sin(c.pitch), c.z + c.dist * cp * Math.cos(c.yaw)];
    const view = lookAt(eye, [c.x, c.y, c.z]);
    const aspect = this.canvas.width / this.canvas.height, fov = 0.75;
    const P = perspective(fov, aspect, 0.3, 200), shift = this.inset / (this.canvas.clientHeight || 1);
    P[9] = -shift;                                        // slide the picture up so the focus clears the bottom UI
    return { eye, ...view, vp: mul(P, view.m), aspect, tan: Math.tan(fov / 2), shift };
  }
  #project(C, x, y, z) {
    const m = C.vp, w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= 0.1) return null;
    return { x: ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * 0.5 + 0.5) * this.canvas.clientWidth,
             y: (1 - ((m[1] * x + m[5] * y + m[9] * z + m[13]) / w * 0.5 + 0.5)) * this.canvas.clientHeight };
  }
  #frame(dt) {
    const gl = this.gl, th = this.theme, c = this.cam;
    if (c.goal) { c.x += (c.goal.x - c.x) * Math.min(1, dt * 5); c.z += (c.goal.z - c.z) * Math.min(1, dt * 5); if (Math.hypot(c.goal.x - c.x, c.goal.z - c.z) < 0.02) c.goal = null; }
    for (const a of this.actors.values()) {
      let step = dt * 9;
      while (a.way.length && step > 0) {
        const w = a.way[0], dx = w.x - a.x, dz = w.z - a.z, d = Math.hypot(dx, dz);
        if (d > 0.001) a.yaw = Math.atan2(dx, dz);
        if (d <= step) { Object.assign(a, { x: w.x, y: w.y, z: w.z }); a.way.shift(); step -= d; }
        else { a.x += (dx / d) * step; a.z += (dz / d) * step; a.y += (w.y - a.y) * Math.min(1, step / d); step = 0; }
      }
    }
    const C = (this.C = this.#camera());
    gl.clearColor(...th.sky, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!this.state) return;
    gl.uniformMatrix4fv(this.loc.uVP, false, C.vp);
    gl.uniform3fv(this.loc.uLight, norm([0.45, 0.8, 0.35]));
    gl.uniform3fv(this.loc.uSky, th.sky);
    gl.uniform2f(this.loc.uFog, c.dist + th.fog[0] * 0.5, th.fog[1]);
    gl.disable(gl.BLEND);
    this.terrain.draw(this.loc, ident());
    for (const a of this.actors.values()) a.mesh.draw(this.loc, model(a.x, a.y + (a.tilt ? 0.15 : 0), a.z, a.yaw, a.tilt));
    gl.enable(gl.BLEND); gl.depthMask(false);
    this.overlay.draw(this.loc, ident(), [1, 1, 1, 1], 0);
    gl.depthMask(true);

    for (const a of this.actors.values()) {
      const p = this.#project(C, a.x, a.y + (a.tilt ? 0.9 : 1.95) * (a.k ?? 1), a.z);
      a.el.style.display = p ? '' : 'none';
      if (p) a.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    }
    this.floaters = this.floaters.filter((f) => {
      f.t += dt;
      if (f.t < 0) return true;
      const a = this.actors.get(f.id), k = f.t / f.life;
      const p = a && this.#project(C, a.x, a.y + 2.3 + k * 1.2, a.z);
      if (k >= 1 || !p) { f.el.remove(); return false; }
      f.el.style.visibility = 'visible'; f.el.style.opacity = String(Math.min(1, (1 - k) * 2.5));
      f.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
      return true;
    });
  }

  // ---------- picking and input ----------
  #pick(px, py) {
    const C = this.C; if (!C || !this.state) return null;
    const nx = (px / this.canvas.clientWidth) * 2 - 1, ny = 1 - (py / this.canvas.clientHeight) * 2 - C.shift;
    const d = norm([0, 1, 2].map((i) => C.f[i] + C.r[i] * nx * C.tan * C.aspect + C.u[i] * ny * C.tan));
    const acts = [...this.actors].filter(([id]) => !this.state.entities[id]?.dead);
    for (let t = 1; t < 140; t += 0.08) {
      const x = C.eye[0] + d[0] * t, y = C.eye[1] + d[1] * t, z = C.eye[2] + d[2] * t;
      for (const [id, a] of acts) if (y > a.y && y < a.y + 1.7 * (a.k ?? 1) && Math.hypot(x - a.x, z - a.z) < 0.5 * (a.k ?? 1)) return { id, hex: this.state.entities[id].pos };
      const h = H.fromWorld(x, z), column = surfaces(this.state.map, h);
      for (let i = column.length - 1; i >= 0; i--) {
        const top = surfY(column[i].z, column[i].tile);
        if (y > top || (i > 0 && y < top - SLAB)) continue;               // above this floor, or under it in the room below
        const hex = { q: h.q, r: h.r, z: column[i].z };
        const occ = Object.values(this.state.entities).find((e) => !e.dead && e.pos.z === hex.z && footprint(e).some((f) => f.q === hex.q && f.r === hex.r));
        return { hex, id: occ?.id ?? null };
      }
      if (y < -60) break;
    }
    return null;
  }
  #input() {
    const el = this.canvas, pts = new Map(), c = this.cam;
    let moved = 0, downAt = 0, pinch = null;
    const xy = (e) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId); pts.set(e.pointerId, xy(e));
      if (pts.size === 1) { moved = 0; downAt = performance.now(); }
      pinch = null;
    });
    el.addEventListener('pointermove', (e) => {
      const p = xy(e), old = pts.get(e.pointerId);
      if (!old) { if (e.pointerType === 'mouse') { const hit = this.#pick(...p); this.onHover(hit?.hex ?? null); } return; }
      pts.set(e.pointerId, p);
      const dx = p[0] - old[0], dy = p[1] - old[1];
      if (pts.size === 1) {
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved < 8) return;
        if (e.buttons === 2 || e.shiftKey) { c.yaw -= dx * 0.008; c.pitch = Math.max(0.45, Math.min(1.45, c.pitch + dy * 0.006)); }
        else {
          const k = c.dist * 0.0021; c.goal = null;
          c.x -= (Math.cos(c.yaw) * dx + Math.sin(c.yaw) * dy) * k; c.z -= (-Math.sin(c.yaw) * dx + Math.cos(c.yaw) * dy) * k;
        }
      } else if (pts.size === 2) {
        moved = 99;
        const [a, b] = [...pts.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]), ang = Math.atan2(a[1] - b[1], a[0] - b[0]);
        if (pinch) { this.zoom(pinch.dist / dist); c.yaw -= ang - pinch.ang; }
        pinch = { dist, ang };
      }
    });
    const up = (e) => {
      const p = pts.get(e.pointerId); pts.delete(e.pointerId); pinch = null;
      if (p && e.type === 'pointerup' && !pts.size && moved < 8 && performance.now() - downAt < 600 && e.button !== 2) {
        if (this.onPoint) { this.onPoint(p[0], p[1]); return; }
        const hit = this.#pick(...p); if (hit) this.onTap(hit);
      }
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY > 0 ? 1.1 : 0.9); }, { passive: false });
  }
}
