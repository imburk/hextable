// 3D view. Reads game state, draws it, reports taps. Knows nothing about the rules.
//
// Creatures are drawn by a presenter. Today that is a pawn built from a lathe profile;
// a glTF model presenter or an animated one replaces makePawn() without touching the
// engine, because the engine only ever emits events ("moved", "attack", "damage").
// Zero dependencies: plain WebGL, so it runs on phones with no install and no CDN.
import { HEX, gridOf, col as cellCol, key as cellKey, parse as cellParse } from './shared/grid.js';
import { allTiles, footprint, ground, shown, surfaces, under } from './shared/space.js';

const GIRTH = { tiny: 0.55, small: 0.8, medium: 1, large: 1.7, huge: 2.5, gargantuan: 3.2 };      // how much bigger a pawn is drawn
const girth = (e) => GIRTH[e?.size] ?? 1;
import { barriers, objectBlocks, objectDef, objectSegment } from './shared/walls.js';
import { buildFloors, caveLevels, caveOf, cellParts, cutaway } from './floors.js';
import { createGovernor, pixelLevels } from './governor.js';

// Lasting zones (a spell's area that stays): tinted by the damage type of the spell's steps, neutral if it has none.
// A theme may replace any of these with its own `zones: { fire: [r, g, b], neutral: [r, g, b] }`.
const ZONE_TINT = { acid: [0.55, 0.85, 0.2], cold: [0.45, 0.78, 0.95], fire: [0.98, 0.45, 0.12], force: [0.75, 0.55, 0.95], lightning: [0.4, 0.55, 1], necrotic: [0.45, 0.3, 0.55],
  poison: [0.45, 0.75, 0.3], psychic: [0.9, 0.45, 0.8], radiant: [1, 0.9, 0.5], thunder: [0.65, 0.7, 0.85], bludgeoning: [0.7, 0.6, 0.5], piercing: [0.7, 0.6, 0.5], slashing: [0.7, 0.6, 0.5], neutral: [0.7, 0.75, 0.85] };
const zoneType = (steps) => {
  const walk = (v) => {
    if (Array.isArray(v)) { for (const x of v) { const t = walk(x); if (t) return t; } return null; }
    if (v && typeof v === 'object') { if ('damage' in v && ZONE_TINT[v.type] && v.type !== 'neutral') return v.type; for (const x of Object.values(v)) { const t = walk(x); if (t) return t; } }
    return null;
  };
  return walk(steps);
};
// The hexes a zone covers now, as [{ q, r }] with the height it lies at: laid out ones as they were, an Emanation around whoever it follows.
export function zoneHexes(state, fx) {
  const z = fx.zone; if (!z) return null;
  if (z.follows) {
    const c = state.entities[z.follows]; if (!c || c.dead) return null;
    return { at: c.pos.z ?? 0, hexes: gridOf(state.map).range(c.pos, z.area.size / 5) };
  }
  return { at: z.origin?.z ?? 0, hexes: (z.hexes ?? []).map((k) => cellParse(k)) };
}
const UNIT = Math.sqrt(3) / 5;                       // drawing units per foot: a hex is 5 ft across
const surfY = (z, tile) => z * UNIT + (tile?.lift ?? 0.6);
// Light through the day, by hour: [hour, light colour that multiplies the scene, how much of the sky colour is left].
// Daytime is left exactly as it always looked; dusk is warm, night is blue and dimmer but never dark enough to hide a hex.
const DAY = [[0, [0.56, 0.63, 0.86], 0.34], [4.5, [0.58, 0.64, 0.86], 0.36], [6, [1.1, 0.84, 0.74], 0.78], [8, [1, 1, 1], 1], [17, [1, 1, 1], 1],
  [18.5, [1.12, 0.82, 0.66], 0.8], [20, [0.74, 0.64, 0.8], 0.5], [21.5, [0.56, 0.63, 0.86], 0.34], [24, [0.56, 0.63, 0.86], 0.34]];
export function lightAt(clock) {
  const h = (((clock % 1440) + 1440) % 1440) / 60;
  let i = 1; while (i < DAY.length - 1 && DAY[i][0] < h) i++;
  const [h0, c0, s0] = DAY[i - 1], [h1, c1, s1] = DAY[i], k = (h - h0) / (h1 - h0 || 1);
  return { light: c0.map((v, j) => v + (c1[j] - v) * k), sky: s0 + (s1 - s0) * k };
}
const MARKS = { dying: '✚ Dying', prone: '▼ Prone', dodging: '◆ Dodging', following: '↪ Following' };
const FLASH = 0.45, SHAKE = 0.5;                     // seconds a hit flash and a critical shake last
const FT = UNIT;                           // drawing units in a foot
const FULL = 10 * FT, SILL = 3 * FT, WINDOW_TOP = 7 * FT, DOOR_TALL = 7 * FT;      // a full wall, a window's sill, where its glass ends, a door's leaf
const SLAB = 0.35;                                   // thickness of a floor that has something under it

const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec4 aCol;
uniform mat4 uVP, uM; uniform vec3 uLight, uGrade; uniform vec4 uTint; uniform float uLit; uniform vec2 uFog;
varying vec4 vCol; varying float vFog;
void main() {
  vec4 w = uM * vec4(aPos, 1.0);
  vec3 n = normalize(mat3(uM) * aNor);
  float l = mix(1.0, 0.56 + 0.5 * max(dot(n, uLight), 0.0), uLit);
  vCol = vec4(aCol.rgb * l * uTint.rgb * uGrade, aCol.a * uTint.a);
  gl_Position = uVP * w;
  vFog = clamp((gl_Position.w - uFog.x) / uFog.y, 0.0, 1.0);
}`;
const FS = `
precision mediump float;
varying vec4 vCol; varying float vFog; uniform vec3 uSky;
void main() { gl_FragColor = vec4(mix(vCol.rgb, uSky, vFog * 0.8), vCol.a); }`;

// A level's background picture: a textured flat quad, lit by the hour and fogged like the rest.
const VS_PIC = `
attribute vec3 aPos; attribute vec2 aUV;
uniform mat4 uVP; uniform vec2 uFog;
varying vec2 vUV; varying float vFog;
void main() { gl_Position = uVP * vec4(aPos, 1.0); vUV = aUV; vFog = clamp((gl_Position.w - uFog.x) / uFog.y, 0.0, 1.0); }`;
const FS_PIC = `
precision mediump float;
varying vec2 vUV; varying float vFog; uniform vec3 uSky, uGrade; uniform sampler2D uTex;
void main() { vec4 t = texture2D(uTex, vUV); gl_FragColor = vec4(mix(t.rgb * uGrade, uSky, vFog * 0.8), 1.0); }`;
const RETRY_MS = 8000;                                // a picture that could not be fetched is tried again after this long

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
// A short fingerprint of every tile's terrain and height, so the ground is rebuilt when the editor changes either.
// What a player's view says the party sees now (state.sight, under the los and light table rules), as a short key.
function sightSig(sight) {
  if (!sight) return '';
  const t = JSON.stringify(sight);
  let n = t.length;
  for (let i = 0; i < t.length; i++) n = (Math.imul(n, 31) + t.charCodeAt(i)) | 0;
  return String(n);
}
function tileSig(map) {
  let n = 0;
  for (const l of map.levels) for (const k in l.tiles) { const t = l.tiles[k]; n = (Math.imul(n, 31) + (t.t.charCodeAt(0) * 7 + t.t.length) * 131 + Math.round(((t.h ?? 0) + (t.lift ?? 0)) * 4) + 17) | 0; }
  return n;
}
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
// A cell's outline in drawing units, as offsets from its centre, from the grid's own corners (`G.corners`): a unit cell has radius 1 on
// hexes. The same outline serves every cell of a map, so it is worked out once per grid.
const SHAPES = new WeakMap();
const shapeOf = (G) => { let o = SHAPES.get(G); if (!o) SHAPES.set(G, (o = G.corners({ q: 0, r: 0 }).map(([x, y]) => [x * UNIT, y * UNIT]))); return o; };
// The unit vector from a cell's centre through the middle of its side `i` (side i runs from corner i to corner i + 1).
const sideAt = (shape, i) => { const a = shape[i], b = shape[(i + 1) % shape.length], x = a[0] + b[0], z = a[1] + b[1], n = Math.hypot(x, z); return [x / n, z / n]; };
class Builder {
  constructor(G = HEX) { this.d = []; this.shape = shapeOf(G); }
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
  // A flat shadow blob: darkest in the middle and fading to nothing at the rim (or a hard-edged one for a blocky theme).
  blob(cx, cz, y, r, a, { sides = 12, hard = false } = {}) {
    const rot = sides === 4 ? Math.PI / 4 : 0, o = this.ring(cx, cz, r, y, sides, rot), n = this.ring(cx, cz, r * 0.5, y, sides, rot), dark = [0, 0, 0, a], edge = [0, 0, 0, hard ? a : 0];
    const v = (p, col) => this.d.push(p[0], p[1], p[2], 0, 1, 0, col[0], col[1], col[2], col[3]);
    for (let k = 0; k < sides; k++) {
      const j = (k + 1) % sides;
      v(n[j], dark); v(n[k], dark); v([cx, y, cz], dark);                 // solid middle
      v(o[j], edge); v(o[k], edge); v(n[k], dark); v(o[j], edge); v(n[k], dark); v(n[j], dark);      // soft rim
    }
  }
  // The outline of a cell at radius r (1 is the cell's own edge), height y.
  cellRing(cx, cz, r, y) { return this.shape.map(([dx, dz]) => [cx + r * dx, y, cz + r * dz]); }
  flatHex(cx, cz, y, r0, r1, col) {            // disc (r0 = 0) or ring on the ground plane
    const o = this.cellRing(cx, cz, r1, y), i = r0 ? this.cellRing(cx, cz, r0, y) : null, n = o.length;
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      if (i) this.quad(o[j], o[k], i[k], i[j], col); else this.tri(o[j], o[k], [cx, y, cz], col);
    }
  }
}
// ---------- beats (docs/specs/renderer.md, decision 2; R4) ----------
// The renderer draws the state it is given. A beat is shown by easing from how a thing looked to how the state says it is, over the
// time the spec gives that beat. Presentation only: every animation reads the state and the events the view sent, nothing else.
// What the timeline holds back by itself (a creature's hit points, death, place, conditions) arrives when its beat plays, so those
// ease as soon as they change; the rest (doors, a region, the arena, a creature that appears) arrives with the update, so the
// renderer holds the old look until the event for it comes (`object`, `region`, `encounterStart`, `spawned`...) and settle() ends it.
const SECS = { door: 0.5, portcullis: 0.8, region: 0.6, rise: 1.2, sink: 0.6, fall: 0.6, prone: 0.3, stand: 0.4, appear: 0.4, vanish: 0.3, placed: 0.3, drop: 0.6 };
const HOLD_MAX = 4;                                   // seconds a held look waits for its event before it is brought in line anyway
const smooth = (p) => p * p * (3 - 2 * p);
const accel = (p) => p * p;
const tweenAt = (tw, now) => {
  const p = Math.max(0, Math.min(1, (now - tw.t0) / tw.dur));
  return { v: tw.from + (tw.to - tw.from) * (tw.ease ?? smooth)(p), done: p >= 1 };
};
const clock = () => performance.now() / 1000;         // tweens run on the wall clock, so a slow frame does not stretch a beat
const mix3 = (a, b, f) => a.map((v, i) => v + (b[i] - v) * f);
const VEIL = [0.04, 0.05, 0.09];

let draws = 0;      // draw calls this frame, for stats()
class Mesh {
  constructor(gl) { this.gl = gl; this.buf = gl.createBuffer(); this.n = 0; }
  free() { this.gl.deleteBuffer(this.buf); this.n = 0; }
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
    gl.drawArrays(gl.TRIANGLES, 0, this.n); draws++;
  }
}
const centroidOf = (p) => [p.reduce((a, v) => a + v[0], 0) / p.length, p.reduce((a, v) => a + v[1], 0) / p.length];
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
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    ['aPos', 'aNor', 'aCol'].forEach((a, i) => gl.bindAttribLocation(prog, i, a));       // fixed places, shared with the picture program
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    this.loc = {};
    for (const a of ['aPos', 'aNor', 'aCol']) { this.loc[a] = gl.getAttribLocation(prog, a); gl.enableVertexAttribArray(this.loc[a]); }
    for (const u of ['uVP', 'uM', 'uLight', 'uTint', 'uLit', 'uFog', 'uSky', 'uGrade']) this.loc[u] = gl.getUniformLocation(prog, u);
    this.prog = prog;
    const pp = (this.picProg = gl.createProgram());
    gl.attachShader(pp, sh(gl.VERTEX_SHADER, VS_PIC)); gl.attachShader(pp, sh(gl.FRAGMENT_SHADER, FS_PIC));
    gl.bindAttribLocation(pp, 0, 'aPos'); gl.bindAttribLocation(pp, 1, 'aUV'); gl.linkProgram(pp);
    if (!gl.getProgramParameter(pp, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pp));
    this.picLoc = {}; for (const u of ['uVP', 'uFog', 'uSky', 'uGrade', 'uTex']) this.picLoc[u] = gl.getUniformLocation(pp, u);
    this.picBuf = gl.createBuffer();
    this.images = new Map();                  // asset id -> { state: 'loading' | 'ready' | 'failed', tex, at }
    this.pics = [];                           // what to draw: { asset, first } (first vertex in picBuf), rebuilt with the terrain
    this.onPicture = null;                    // called when a picture has arrived
    this.assetUrl = null;                     // (asset id) -> Promise<blob: URL>; set by the app (never a token in a URL)
    this.bars = []; this.barZ = 0;
    this.pins = [];                           // points in map feet to mark (the editor's scale tool)
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.terrain = new Mesh(gl); this.wallMesh = new Mesh(gl); this.floorData = []; this.cutSig = ''; this.cutYaw = null; this.grid = new Mesh(gl); this.overlay = new Mesh(gl); this.shadows = new Mesh(gl); this.edge = new Mesh(gl); this.edgeId = null; this.anim = 0;
    this.doorMesh = new Mesh(gl); this.doors = new Map(); this.doorInfo = new Map(); this.wallsDirty = false;     // doors: id -> { v: 0 shut .. 1 open as drawn, goal, tw, since }
    this.seenRegions = null; this.veils = new Map();                  // a region just revealed: drawn dark over its floor, fading away
    this.edgeFx = { phase: 'on', t0: 0 }; this.sinkFx = null; this.edgeBase = 0; this.ghosts = []; this.fell = new Set(); this.now = clock(); this.blobMesh = new Mesh(gl); this.#makeBlob();
    this.actors = new Map();                  // id -> {mesh, x, y, z, yaw, way, el, key}
    this.ceiling = Infinity;
    this.cam = { x: 0, y: 0.6, z: 0, yaw: 0.5, pitch: 0.95, dist: 22, goal: null };
    this.hl = { move: [], area: [], targets: [], allies: [], selected: null, turn: null };
    this.G = HEX;                             // the grid the map is drawn on (gridOf(map) once there is one)
    this.state = null; this.terrainKey = ''; this.floaters = []; this.inset = 0;   // px of screen bottom covered by UI
    this.onTap = () => {}; this.onHover = () => {};
    this.onPoint = null;                      // when set, a tap reports its screen point here instead of picking (the map editor)
    this.onDrag = null;                       // when set: { down(x, y, event) -> true to take the stroke, move(x, y), end(), cancel() }; a stroke it takes does not move the camera (the map editor)
    this.#input();
    this.gov = createGovernor(pixelLevels(window.devicePixelRatio));      // the quality governor steps the pixel ratio (governor.js)
    this.frameTimes = []; this.drawCalls = 0; this.dead = false;
    let cw = 0, ch = 0;
    this.ro = new ResizeObserver(() => { if (canvas.clientWidth !== cw || canvas.clientHeight !== ch) { cw = canvas.clientWidth; ch = canvas.clientHeight; this.gov.reset(); } this.#resize(); }); this.ro.observe(canvas);
    this.#resize();
    if (canvas.clientWidth / canvas.clientHeight < 0.8) this.cam.dist = 30;
    let last = performance.now();
    const loop = (t) => {
      if (this.dead) return;
      const ms = t - last;
      this.#frame(Math.min(0.05, ms / 1000)); last = t;
      this.#measure(ms, t / 1000);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  // ---------- public ----------
  setTheme(theme) { this.theme = theme; this.#makeBlob(); this.terrainKey = ''; for (const a of this.actors.values()) a.key = ''; if (this.state) this.setState(this.state, []); }

  // `opt.instant`: show the state at once, animate nothing (pace `instant`, a fresh state, an undo). A map change, the first state and an
  // `undone` or `redone` event do the same, so nothing is left half played when the state changes under an animation.
  setState(state, events = [], opt = {}) {
    const prev = this.state, now = (this.now = clock());
    const snap = !!opt.instant || !prev || prev.map.id !== state.map.id || events.some((e) => e.type === 'map' || e.type === 'mapEdit' || e.type === 'undone' || e.type === 'redone');
    const idsOf = (type) => new Set(events.filter((e) => e.type === type && e.id !== undefined).map((e) => e.id));
    if (snap) this.#finish(false);
    this.state = state; this.G = gridOf(state.map);
    const want = lightAt(state.clock ?? 480);
    this.tod = { goal: want, now: this.tod?.now ?? want };                // eases to the new hour, so resting through the night is a slow turn of the light
    this.#syncEdge(events, snap, now);
    this.#syncDoors(events, snap, now);
    this.#syncVeils(events, snap, now);
    const tk = `${state.encounter?.id ?? 0}:${state.map.id}:${state.map.levels.map((l) => Object.keys(l.tiles).length).join()}:${tileSig(state.map)}:${barriers(state.map).sig}:${state.map.regions.map((r) => (r.revealed ? 1 : 0)).join('')}:${this.ceiling}:${this.#pictureSig()}:${sightSig(state.sight)}`;
    this.#fetchPictures();
    if (tk !== this.terrainKey) { this.terrainKey = tk; this.#buildTerrain(); }
    else if (this.wallsDirty) { this.wallsDirty = false; this.#buildWalls(true); }
    const removed = idsOf('removed'), appeared = new Set([...idsOf('spawned'), ...idsOf('revealed'), ...idsOf('placed')]);
    this.fell = idsOf('fell');
    for (const [id, a] of this.actors) if (!state.entities[id]) {
      if (!snap && removed.has(id) && !a.unseen) this.ghosts.push({ mesh: a.mesh, x: a.x, y: a.y, z: a.z, yaw: a.yaw, tiltNow: a.tiltNow ?? 0, k: a.k ?? 1, el: a.el, t0: now, dur: SECS.vanish, label: true });       // a removed creature fades out
      else { a.el.remove(); a.mesh.free(); }
      a.dying?.mesh.free();
      this.actors.delete(id);
    }
    for (const e of Object.values(state.entities)) {
      let a = this.actors.get(e.id);
      const w = this.#spot(e, e.pos), calm = snap || !!e.hidden;      // a creature the view marks hidden is never animated: nothing about it is shown
      if (!a) {
        const el = document.createElement('div');
        el.className = 'label'; el.innerHTML = '<span></span><div class="bar"><i></i></div><em class="marks"></em>';
        this.labels.append(el);
        a = { mesh: new Mesh(this.gl), ...w, yaw: 0, way: [], el, key: '', fade: 1 };
        if (!calm) { a.fade = 0; a.hold = true; a.holdAt = now; }      // a creature that was not there: unseen until its own beat (spawned, revealed, placed)
        this.actors.set(e.id, a);
      }
      a.unseen = !!e.hidden;
      if (a.hold && (calm || appeared.has(e.id))) { a.hold = false; if (calm) a.fade = 1; else a.fadeTw = { from: 0, to: 1, t0: now, dur: SECS.appear }; }
      const key = `${e.dead}|${e.side}|${e.size}`; a.k = girth(e);
      if (key !== a.key) {
        const dies = !calm && a.key !== '' && e.dead && a.wasDead === false;      // a death falls and fades: the living pawn fades into the fallen one
        if (dies) { const gm = new Mesh(this.gl); gm.set(this.#makePawn({ ...e, dead: false })); a.dying?.mesh.free(); a.dying = { mesh: gm, t0: now, dur: SECS.fall }; }
        a.key = key; a.mesh.set(this.#makePawn(e));
      }
      a.wasDead = !!e.dead;
      a.el.dataset.side = e.side; a.el.classList.toggle('dead', e.dead); a.el.classList.toggle('down', !e.dead && e.hp <= 0); a.el.classList.toggle('unseen', !!e.hidden);
      const sf = ground(state.map, e.pos) ? null : under(state.map, e.pos);
      a.el.firstChild.textContent = sf ? `${e.name} ↑${e.pos.z - sf.z} ft` : e.name;
      a.el.querySelector('i').style.width = `${hpFraction(e) * 100}%`;
      const marks = e.dead ? [] : [e.hp <= 0 && !e.cond.stable && 'dying', e.cond.prone && e.hp > 0 && 'prone', e.cond.dodging && 'dodging', e.follow && !state.encounter && 'following'].filter(Boolean);      // small badges over the pawn's head
      const mk = marks.join();
      if (mk !== a.marks) { a.marks = mk; a.el.lastChild.replaceChildren(...marks.map((m) => Object.assign(document.createElement('b'), { className: m, textContent: MARKS[m] }))); }
      const tilt = e.dead ? 1.45 : e.hp <= 0 ? 1.2 : e.cond.prone ? 0.9 : 0;
      if (a.tilt === undefined || calm) { a.tilt = tilt; a.tiltNow = tilt; a.tiltTw = null; }
      else if (tilt !== a.tilt) {                                    // lying down takes 0.3 s, a fall 0.6 s, getting up 0.4 s
        a.tiltTw = { from: a.tiltNow, to: tilt, t0: now, dur: tilt < a.tilt ? SECS.stand : e.dead || e.hp <= 0 ? SECS.fall : SECS.prone };
        a.tilt = tilt;
      }
      const floor = e.dead || ground(state.map, e.pos) ? null : under(state.map, e.pos);
      a.air = floor ? Math.max(0, w.y - this.#stand({ q: e.pos.q, r: e.pos.r, z: floor.z }).y) : 0;      // how far above the floor it hangs: its shadow stays down there
    }
    for (const ev of events) {
      const a = this.actors.get(ev.id);
      if (ev.type === 'moved' && a) for (const h of ev.path) a.way.push(this.#spot(state.entities[ev.id], h));
      if (ev.type === 'placed' && a && !snap && !a.unseen && !a.hold && a.fade >= 1) {      // it fades out where it stood and in where it now stands
        this.ghosts.push({ mesh: a.mesh, x: a.x, y: a.y, z: a.z, yaw: a.yaw, tiltNow: a.tiltNow ?? 0, k: a.k ?? 1, el: null, t0: now, dur: SECS.placed });
        a.fade = 0; a.fadeTw = { from: 0, to: 1, t0: now, dur: SECS.placed };
      }
      const hurt = this.actors.get(ev.target);                   // a hit flashes the pawn; a critical one also shakes it
      if (ev.type === 'damage' && hurt && ev.amount > 0) hurt.flash = FLASH;
      if (ev.type === 'attack' && hurt && ev.hit && ev.crit) { hurt.shake = SHAKE; hurt.flash = FLASH; }
    }
    for (const e of Object.values(state.entities)) {            // anything teleported or out of sync
      const a = this.actors.get(e.id), w = this.#stand(e.pos);
      if (!a.way.length && (Math.abs(a.x - w.x) > 0.01 || Math.abs(a.z - w.z) > 0.01)) Object.assign(a, w);
      const yy = this.#spot(e, e.pos).y;
      if (!a.way.length && Math.abs(a.y - yy) > 0.01) {
        if (!snap && !a.unseen && this.fell.has(e.id) && yy < a.y) a.fall = { from: a.y, to: yy, t0: now, dur: SECS.drop, ease: accel };      // a fall drops under gravity
        else if (!a.fall) { a.y = yy; }
      }
    }
    this.#buildOverlay();
  }

  // The arena of a fight (decision 2): it rises when `encounterStart` plays and sinks when `encounterEnd` plays. The state has the
  // fight already (or no longer), so the edge waits, drawn as it was, for its event; settle() ends the wait.
  #syncEdge(events, snap, now) {
    const enc = this.state.encounter, eid = enc ? enc.id ?? 0 : null;
    if (eid !== this.edgeId) {
      const old = this.edgeId !== null;
      if (old) {
        if (this.sinkFx) this.sinkFx.mesh.free();
        this.sinkFx = !snap ? { mesh: this.edge, base: this.edgeBase, phase: 'hold', t0: now, since: now } : (this.edge.free(), null);
        this.edge = new Mesh(this.gl);
      }
      this.edgeId = eid;
      this.edgeFx = { phase: eid === null || snap ? 'on' : 'hold', t0: now, since: now };
    }
    for (const ev of events) {
      if (ev.type === 'encounterStart' && this.edgeFx.phase === 'hold') this.edgeFx = { phase: 'rise', t0: now, since: now };
      if (ev.type === 'encounterEnd' && this.sinkFx?.phase === 'hold') this.sinkFx.phase = 'sink', this.sinkFx.t0 = now;
    }
  }
  // Doors, portcullises and the like: a door swings between shut and open when its `object` event plays (0.5 s, 0.8 s a portcullis).
  #syncDoors(events, snap, now) {
    const map = this.state.map, live = new Set();
    for (const o of map.objects) {
      if (!objectSegment(o)) continue;
      live.add(o.id);
      const goal = objectBlocks(o, 'move') ? 0 : 1;
      let d = this.doors.get(o.id);
      if (!d || snap) { if (d?.tw) this.wallsDirty = true; this.doors.set(o.id, (d = { v: goal, goal, tw: null, since: now })); this.wallsDirty = true; continue; }
      if (d.goal !== goal) { d.goal = goal; d.since = now; }
      if (d.v === goal && !d.tw) continue;
      if (!d.tw && events.some((ev) => ev.type === 'object' && ev.object === o.id)) {
        d.tw = { from: d.v, to: goal, t0: now, dur: /portcullis/i.test(`${o.def} ${o.name ?? ''}`) ? SECS.portcullis : SECS.door };
        this.wallsDirty = true;
      }
    }
    for (const id of [...this.doors.keys()]) if (!live.has(id)) { this.doors.delete(id); this.doorInfo.delete(id); this.wallsDirty = true; }
  }
  // A region the party has just seen: its floor is covered dark until its `region` event plays, then the dark fades away (0.6 s).
  #syncVeils(events, snap, now) {
    const map = this.state.map, shown = new Set(map.regions.filter((r) => r.revealed).map((r) => r.id));
    if (!this.seenRegions || snap) { for (const v of this.veils.values()) v.mesh.free(); this.veils.clear(); this.seenRegions = shown; return; }
    for (const [id, v] of this.veils) if (!shown.has(id)) { v.mesh.free(); this.veils.delete(id); }
    for (const r of map.regions) if (r.revealed && !this.seenRegions.has(r.id)) this.veils.set(r.id, this.#makeVeil(r, now));
    this.seenRegions = shown;
    for (const ev of events) { const v = ev.type === 'region' && this.veils.get(ev.region); if (v && !v.tw) v.tw = { from: 1, to: 0, t0: now, dur: SECS.region }; }
  }
  #makeVeil(r, now) {
    const lv = this.state.map.levels.find((l) => l.id === r.level), b = new Builder(this.G), mesh = new Mesh(this.gl);
    for (const k of r.hexes ?? []) {
      const t = lv?.tiles[k]; if (!t) continue;
      const h = cellParse(k), w = this.G.toWorld(h);
      b.flatHex(w.x, w.z, surfY(lv.z + (t.h ?? 0), t) + 0.05, 0, 1.02, [...VEIL, 1]);
    }
    mesh.set(b);
    return { mesh, alpha: 1, tw: null, since: now };
  }

  // Everything that is playing or held is brought to its end state at once (a skip, an idle queue, a state that is not a continuation).
  settle() { this.now = clock(); this.#finish(true); }
  #finish(build) {
    for (const a of this.actors.values()) {
      a.tiltTw = null; a.tiltNow = a.tilt; a.fadeTw = null; a.hold = false; a.fade = 1;
      if (a.fall) { a.y = a.fall.to; a.fall = null; }
      if (a.dying) { a.dying.mesh.free(); a.dying = null; }
    }
    for (const g of this.ghosts) this.#dropGhost(g);
    this.ghosts = [];
    for (const d of this.doors.values()) if (d.tw || d.v !== d.goal) { d.v = d.goal; d.tw = null; this.wallsDirty = true; }
    for (const v of this.veils.values()) v.mesh.free();
    this.veils.clear();
    this.edgeFx = { phase: 'on', t0: this.now };
    if (this.sinkFx) { this.sinkFx.mesh.free(); this.sinkFx = null; }
    if (build && this.wallsDirty && this.state) { this.wallsDirty = false; this.#buildWalls(true); }
  }
  #dropGhost(g) { if (g.label) { g.el.remove(); g.mesh.free(); } }

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
    const p = this.#plane(px, py, feet);
    return p && this.G.fromWorld(p[0], p[1]);
  }
  // The same, as a point in map feet (x east, y south): for tapping on a level's picture.
  planePoint(px, py, feet = 0) {
    const p = this.#plane(px, py, feet);
    return p && [p[0] / UNIT, p[1] / UNIT];
  }
  #plane(px, py, feet) {
    const C = this.C; if (!C) return null;
    const nx = (px / this.canvas.clientWidth) * 2 - 1, ny = 1 - (py / this.canvas.clientHeight) * 2 - C.shift;
    const d = norm([0, 1, 2].map((i) => C.f[i] + C.r[i] * nx * C.tan * C.aspect + C.u[i] * ny * C.tan));
    const t = (surfY(feet) - C.eye[1]) / d[1];
    if (!(t > 0) || t > 400) return null;
    return [C.eye[0] + d[0] * t, C.eye[2] + d[2] * t];
  }
  // Which way is screen-right and screen-up on the ground, as unit vectors in map feet: for nudging a picture.
  // The camera's turn about the board and its height above it (radians), read-only: the dice lie in the board's plane as seen from here.
  cameraAngles() { return { yaw: this.cam.yaw, pitch: this.cam.pitch }; }
  screenAxes() {
    const C = this.C ?? this.#camera(), u = (a) => { const l = Math.hypot(a[0], a[2]) || 1; return [a[0] / l, a[2] / l]; };
    return { right: u(C.r), up: u(C.f) };
  }
  // Marks on the floor of a level (map feet), for the editor's scale and trace tools: a dot at each point and a line along them.
  setPins(points, levelZ = 0) { this.pins = points.map((p) => [...p]); this.pinZ = levelZ; if (this.state) this.#buildOverlay(); }
  // Short bars across neighbouring hex steps that a wall stops: [[x1, y1, x2, y2], ...] in map feet.
  setBars(bars, levelZ = 0) { this.bars = bars; this.barZ = levelZ; if (this.state) this.#buildOverlay(); }
  // Where a point on a level's floor (map feet) is on the screen, in canvas pixels. Null if behind the camera.
  screenPoint(x, y, feet = 0) { return this.C ? this.#project(this.C, x * UNIT, surfY(feet), y * UNIT) : null; }
  // A level's picture, if there is one and it has arrived (so the floor can be drawn from it).
  hasPicture(levelId) {
    const l = this.state?.map.levels.find((x) => x.id === levelId);
    return !!l?.image && this.images.get(l.image.asset)?.state === 'ready';
  }
  // The names of the lasting zones that cover a hex, for hover and tap.
  zonesAt(hex) {
    if (!hex || !this.state) return [];
    return (this.state.effects ?? []).filter((fx) => { const zh = zoneHexes(this.state, fx); return zh?.hexes.some((h) => h.q === hex.q && h.r === hex.r); }).map((fx) => fx.name);
  }
  screenOf(hex) { const w = this.#stand(hex); return this.C ? this.#project(this.C, w.x, w.y, w.z) : null; }
  rotate(d) { this.cam.yaw += d; }
  zoom(f) { this.cam.dist = Math.max(7, Math.min(48, this.cam.dist * f)); }

  // How the drawing is doing: the median frame time (ms) over the last 120 frames, the governor's step (0 is full quality), the pixel
  // ratio in use, and the draw calls of the last frame. The governor steps the pixel ratio from these (governor.js).
  stats() {
    const f = this.frameTimes, s = [...f].sort((a, b) => a - b);
    return { frameMs: s.length ? s[s.length >> 1] : 0, quality: this.gov.step, pixelRatio: this.gov.ratio, drawCalls: this.drawCalls };
  }
  // Stop drawing and let go of the page: the frame loop, the size watch, the pointer listeners, the labels and the buffers.
  dispose() {
    if (this.dead) return;
    this.dead = true; cancelAnimationFrame(this.raf); this.ro.disconnect(); this.off?.();
    for (const a of this.actors.values()) { a.el.remove(); a.mesh.free(); a.dying?.mesh.free(); }
    for (const f of this.floaters) f.el.remove();
    for (const m of [this.terrain, this.wallMesh, this.grid, this.overlay, this.shadows, this.edge, this.doorMesh, this.blobMesh]) m.free();
    this.actors.clear(); this.floaters = []; this.state = null;
  }
  #measure(ms, now) {
    this.frameTimes.push(ms); if (this.frameTimes.length > 120) this.frameTimes.shift();
    this.drawCalls = draws; draws = 0;
    if (this.gov.sample(ms, now) !== null) this.#resize();
  }

  floater(id, text, cls = '', delay = 0) {
    const el = document.createElement('div');
    el.className = `floater ${cls}`; el.textContent = text; el.style.visibility = 'hidden';
    this.labels.append(el);
    this.floaters.push({ id, el, t: -delay, life: 1.5 });
  }

  // ---------- building ----------
  #stand(h) { const w = this.G.toWorld(h), z = h.z ?? 0; return { x: w.x, y: surfY(z, ground(this.state.map, { q: h.q, r: h.r, z })?.tile), z: w.z }; }

  // Where a creature's pawn stands when its own hex is `pos`: the middle of the hexes it fills.
  #spot(e, pos) {
    const base = this.#stand(pos), parts = footprint(e ?? {}, pos, this.G);
    if (parts.length === 1) return base;
    let x = 0, z = 0;
    for (const f of parts) { const w = this.G.toWorld(f); x += w.x; z += w.z; }
    return { x: x / parts.length, y: base.y, z: z / parts.length };
  }

  // ---------- level pictures ----------
  #pictureSig() {
    return this.state.map.levels.map((l) => (l.image ? `${l.image.asset}@${l.image.feet}@${l.image.origin}@${l.z}@${this.images.get(l.image.asset)?.state === 'ready' ? 1 : 0}` : '-')).join('|');
  }
  #fetchPictures() {
    if (!this.assetUrl) return;
    const now = performance.now();
    for (const l of this.state.map.levels) {
      const id = l.image?.asset, had = id && this.images.get(id);
      if (!id || (had && (had.state !== 'failed' || had.tries >= 3 || now - had.at < RETRY_MS))) continue;
      this.#loadPicture(id, (had?.tries ?? 0) + 1);
    }
  }
  // Fetch (with the session token, by the app's assetUrl), decode and upload as a texture. Not there yet
  // or refused: the level is drawn from its hex tiles as before, and it is tried again a few times.
  async #loadPicture(id, tries) {
    const gl = this.gl, rec = { state: 'loading', tex: null, at: performance.now(), tries };
    this.images.set(id, rec);
    try {
      const img = new Image();
      img.src = await this.assetUrl(id);
      await img.decode();
      const max = Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE)), pot = (n) => 2 ** Math.max(0, Math.min(Math.log2(max), Math.round(Math.log2(Math.max(1, n)))));
      const cv = document.createElement('canvas');       // power-of-two, so it can be mipmapped on any phone
      cv.width = pot(img.naturalWidth); cv.height = pot(img.naturalHeight);
      const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, cv.width, cv.height);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      rec.tex = tex; rec.state = 'ready';
      if (this.state) this.setState(this.state, []);
      this.onPicture?.();
    } catch {
      rec.state = 'failed'; rec.at = performance.now();
      if (tries < 3) setTimeout(() => this.state && this.#fetchPictures(), RETRY_MS + 100);
    }
  }

  #buildTerrain() {
    const b = new Builder(this.G), sb = new Builder(), th = this.theme, map = this.state.map, enc = this.state.encounter, sh = th.shadow ?? { a: 0.4 };
    const hid = (levelId) => (map.levels.find((l) => l.id === levelId)?.z ?? 0) > this.ceiling;      // a floor above whoever is being followed
    // Rooms, not hexes (theme flag `floors: 'rooms'`, docs/specs/renderer.md): on a level with walls or regions, the
    // tiles at one height are drawn as one flat floor with one edge round it, and the hexes as a faint grid. Rooms that
    // meet at the same height with no wall between (an archway) run on into each other; a wall stands on the floor.
    // The shapes come from floors.js: a wall that crosses a hex cuts it, and floor is filled out to a wall (R2).
    const caves = th.floors === 'rooms' && th.caves ? new Set(caveLevels(map)) : new Set();      // mostly rock with open hexes: drawn as a cave (floors.js, caveOf)
    const rooms = th.floors === 'rooms' ? new Set([...map.levels.filter((l) => map.walls.some((w) => w.level === l.id) || map.regions.some((r) => r.level === l.id)).map((l) => l.id), ...caves]) : new Set();
    // Players under the los and light rules: a place remembered but not in view now is dimmed, one in view in
    // Dim Light or Darkness darkened (docs/specs/sight.md, decision 6). Colour only; the renderer plan owns more.
    const sight = this.state.sight, now = new Map(Object.entries(sight?.now ?? {}).map(([l, cols]) => [l, new Set(cols)]));
    const seenShade = (levelId, k) => (!sight ? 1 : !now.get(levelId)?.has(k) ? 0.5 : sight.light?.[levelId]?.[k] === 'dark' ? 0.38 : sight.light?.[levelId]?.[k] === 'dim' ? 0.7 : 1);
    // The colour of a hex's floor as the table sees it: dimmed when a fight has locked it, when only the DM has it, or by what the party remembers.
    const tintOf = (lv, key, base) => {
      let c = base.slice();
      if (enc && !enc.arena[key]) { const g = (c[0] + c[1] + c[2]) / 3; c = c.map((v) => (v * 0.35 + g * 0.65) * 0.5); }
      if (!shown(map, lv.id, { ...cellParse(key), z: lv.z + (lv.tiles[key]?.h ?? 0) })) c = c.map((v, i) => v * 0.45 + (i === 2 ? 0.1 : 0.02));
      const f = seenShade(lv.id, key);
      return f === 1 ? c : c.map((v) => v * f);
    };
    // A level with a picture that has arrived is floored by the picture: its hexes are only a faint outline.
    const gb = new Builder(this.G), pictured = new Set(map.levels.filter((l) => this.hasPicture(l.id) && !hid(l.id)).map((l) => l.id));
    this.pics = []; const pv = [];
    for (const l of map.levels) {
      if (!pictured.has(l.id)) continue;
      const { asset, feet: [fw, fh], origin: [ox, oy] } = l.image, y = surfY(l.z), x0 = ox * UNIT, x1 = (ox + fw) * UNIT, z0 = oy * UNIT, z1 = (oy + fh) * UNIT;
      this.pics.push({ asset, first: pv.length / 5 });
      pv.push(x0, y, z0, 0, 0, x0, y, z1, 0, 1, x1, y, z1, 1, 1, x0, y, z0, 0, 0, x1, y, z1, 1, 1, x1, y, z0, 1, 0);
    }
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.picBuf); this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(pv), this.gl.DYNAMIC_DRAW);
    for (const h of allTiles(map)) {
      if (h.z > this.ceiling) continue;
      if (pictured.has(h.level.id)) {
        const w = this.G.toWorld(h), inFight = enc && enc.arena[cellCol(h)];
        gb.flatHex(w.x, w.z, surfY(h.z, h.tile) + 0.012, 0.94, 1, inFight ? [...th.arenaRim, 0.7] : shown(map, h.level.id, h) ? [0.06, 0.06, 0.08, 0.3] : [0.3, 0.4, 0.9, 0.35]);
        continue;
      }
      if (caves.has(h.level.id)) continue;                                // a cave is all drawn below
      const t = h.tile, w = this.G.toWorld(h), locked = enc && !enc.arena[cellCol(h)], y = surfY(h.z, t), room = rooms.has(h.level.id);
      const lowest = surfaces(map, h)[0].z === h.z;                      // the bottom of a column is a pillar; a floor above it is a slab
      const j = room ? 1 : 0.94 + jitter(h.q, h.r) * 0.12;              // a room's floor is one even colour, not a patchwork
      let c = th.tiles[t.t].map((v) => v * j);
      if (locked) { const g = (c[0] + c[1] + c[2]) / 3; c = c.map((v) => (v * 0.35 + g * 0.65) * 0.5); }
      if (!shown(map, h.level.id, h)) c = c.map((v, i) => v * 0.45 + (i === 2 ? 0.1 : 0.02));      // only the DM has these: not yet shown to players
      const f = seenShade(h.level.id, cellCol(h));
      if (f !== 1) c = c.map((v) => v * f);
      const rim = enc && !locked ? [...th.arenaRim, 1] : shade(c, th.rim);
      if (!room) {
        b.flatHex(w.x, w.z, y, 0, 0.86, [...c, 1]);
        b.flatHex(w.x, w.z, y, 0.86, 1, rim);
        const top = b.cellRing(w.x, w.z, 1, y), bot = b.cellRing(w.x, w.z, 1, lowest ? Math.min(-1.5, y - 1.5) : y - SLAB);
        for (let i = 0; i < top.length; i++) { const n = (i + 1) % top.length; b.quad(top[i], top[n], bot[n], bot[i], shade(c, th.side)); }
      }
      if (t.t === 'forest') {
        const tc = locked ? shade(th.tree, 0.45) : [...th.tree, 1];
        for (let i = 0; i < 2; i++) {
          const a = jitter(h.q + i * 7, h.r - i * 3) * 6.28, d = 0.28 + 0.2 * i, hh = 0.9 + jitter(h.r, h.q + i) * 0.7;
          const tx = w.x + Math.cos(a) * d, tz = w.z + Math.sin(a) * d;
          b.lathe(tx, tz, y, [[0.1, 0], [0.1, 0.25], [0.42, 0.25], [0, hh + 0.25]], 6, a, (s) => (s === 0 ? shade(tc, 0.5) : tc));
          sb.blob(tx - 0.16, tz - 0.12, y + 0.012, 0.5 + hh * 0.12, sh.a * (locked ? 0.6 : 1), sh);       // the light comes from the upper right
        }
      }
    }
    // Rooms: the floors of levels with walls or regions, from floors.js. Colour follows the tile each piece is drawn as.
    const floors = rooms.size ? buildFloors(map, { levels: [...rooms].filter((id) => !hid(id) && !pictured.has(id)), caves: [...caves] }) : { levels: [] };
    const wpt = (p, y) => [p[0] * UNIT, y, p[1] * UNIT];
    for (const fl of floors.levels) {
      const lv = map.levels.find((l) => l.id === fl.id);
      for (const pa of fl.patches) {
        const y = pa.top * UNIT;
        for (const cell of pa.cells) {
          const t = lv.tiles[cell.hex], key = cell.hex, locked = enc && !enc.arena[key], hex = cellParse(key), hz = lv.z + (t.h ?? 0);
          let c = th.tiles[t.t].slice();
          if (locked) { const g = (c[0] + c[1] + c[2]) / 3; c = c.map((v) => (v * 0.35 + g * 0.65) * 0.5); }
          if (!shown(map, lv.id, { ...hex, z: hz })) c = c.map((v, i) => v * 0.45 + (i === 2 ? 0.1 : 0.02));      // only the DM has these: not yet shown to players
          const f = seenShade(lv.id, key);
          if (f !== 1) c = c.map((v) => v * f);
          const inArena = enc && !locked, grid = inArena ? [...th.arenaRim, 1] : shade(c, th.grid ?? 0.92);
          const { inner, rim } = cellParts(cell, inArena ? 0.9 : 0.955, this.G);       // the floor reaches the hex's edge; the grid is a thin, faint line inside it (stronger in a fight's area)
          const fan = (poly, col) => { const m = wpt(centroidOf(poly), y); for (let i = 0; i < poly.length; i++) b.tri(wpt(poly[(i + 1) % poly.length], y), wpt(poly[i], y), m, col); };
          if (inner) fan(inner, [...c, 1]);
          for (const r of rim) fan(r, grid);
        }
        for (const e of pa.outline) {                                   // where the floor ends or steps down: a skirt, and a low kerb along its outline
          if (e.kind !== 'open' && e.kind !== 'drop') continue;
          if (e.kind === 'open' && caves.has(fl.id)) continue;               // a cave's edge is drawn as rock
          const t = lv.tiles[e.hex], key = e.hex, locked = enc && !enc.arena[key];
          let c = th.tiles[t.t].slice();
          if (locked) { const g = (c[0] + c[1] + c[2]) / 3; c = c.map((v) => (v * 0.35 + g * 0.65) * 0.5); }
          if (!shown(map, lv.id, { ...cellParse(key), z: lv.z + (t.h ?? 0) })) c = c.map((v, i) => v * 0.45 + (i === 2 ? 0.1 : 0.02));
          const f = seenShade(lv.id, key);
          if (f !== 1) c = c.map((v) => v * f);
          const low = e.lowest ? Math.min(-1.5, y - 1.5) : y - SLAB, bot = e.kind === 'drop' ? Math.min(low, e.toTop * UNIT) : low;
          const A = wpt(e.a, y), B = wpt(e.b, y), a2 = wpt(e.a, bot), b2 = wpt(e.b, bot);
          b.quad(A, B, b2, a2, shade(c, th.side));
          const la = wpt(e.a, y + 0.03), lb = wpt(e.b, y + 0.03), ia = wpt(e.ia, y + 0.03), ib = wpt(e.ib, y + 0.03), fa = wpt(e.ia, y), fb = wpt(e.ib, y);
          b.quad(lb, la, ia, ib, shade(c, th.rim));
          b.quad(ib, ia, fa, fb, shade(c, th.rim * 0.9));
        }
      }
      if (caves.has(fl.id)) this.#drawCave(b, caveOf(map, fl), lv, tintOf);
    }
    this.floorData = floors.levels;
    this.terrain.set(b); this.grid.set(gb); this.shadows.set(sb); this.#buildEdge(); this.#buildWalls(true);
  }
  // Walls, doors and the things standing in hexes, into their own mesh: which walls are cut down depends on where the
  // camera is, so this is built again when that changes and the floors are not. With the theme's `cutaway` (on
  // by default, rooms look only) the walls between the camera and a room are low and capped dark, and the rest stand at
  // full height (docs/specs/renderer.md, decision 1); without it every wall is low, as it was.
  #buildWalls(force = false) {
    const b = new Builder(this.G), th = this.theme, map = this.state.map;
    let cut = this.#cutSet();
    const cutting = cut !== null, high = (id) => cutting && this.floorData.some((f) => f.id === id), sig = cut ? [...cut].sort().join() : '';
    this.cutYaw = this.cam.yaw;
    if (!force && sig === this.cutSig) return;
    this.cutSig = sig; this.wallsDirty = false;
    const hid = (levelId) => (map.levels.find((l) => l.id === levelId)?.z ?? 0) > this.ceiling;
    cut ??= new Set();
    const col = { wall: th.wall ?? [0.44, 0.42, 0.4], window: th.wallWindow ?? [0.55, 0.62, 0.68], curtain: th.curtain ?? [0.38, 0.3, 0.45] };
    const LOW = { wall: 1.15, window: 0.55, rail: 0.5, curtain: 1.15 };               // drawing units: how low they have always been
    const baseOf = (id) => (map.levels.find((l) => l.id === id)?.z ?? 0) * UNIT + 0.55;
    const half = 0.09, capped = (c) => shade(c, 0.5);
    // A wall of this kind: low (today's look and a cut-away stub, with a dark cap), or full height.
    const run = (kind, level, key, p, q, base = baseOf(level)) => {
      if (!high(level) || kind === 'rail' || cut.has(key)) return this.#slab(b, p, q, base, LOW[kind] ?? LOW.wall, half, col[kind] ?? col.wall, high(level) && kind !== 'rail' ? capped(col[kind] ?? col.wall) : null);
      if (kind === 'window') { this.#slab(b, p, q, base, SILL, half, col.wall); this.#slab(b, p, q, base + SILL, WINDOW_TOP - SILL, half, col.window); return; }
      this.#slab(b, p, q, base, FULL, half, col[kind] ?? col.wall);
    };
    for (const fl of this.floorData) {
      if (hid(fl.id)) continue;
      for (const post of fl.posts) {                                    // a post at every join, so a corner closes
        const s = 0.26, up = post.keys.some((k) => !cut.has(k)), kind = post.kind === 'rail' ? 'rail' : post.kind === 'window' ? 'wall' : post.kind;
        if (high(fl.id) && up && kind !== 'rail') this.#slab(b, [post.at[0] - s, post.at[1]], [post.at[0] + s, post.at[1]], baseOf(fl.id), post.kind === 'window' ? WINDOW_TOP : FULL + 0.04, half, col[kind] ?? col.wall);
        else this.#slab(b, [post.at[0] - s, post.at[1]], [post.at[0] + s, post.at[1]], baseOf(fl.id), (LOW[post.kind] ?? LOW.wall) + 0.04, half, col[post.kind] ?? col.wall, high(fl.id) && post.kind !== 'rail' ? capped(col[post.kind] ?? col.wall) : null);
      }
    }
    for (const w of map.walls) if (!hid(w.level)) run(w.kind, w.level, `w:${w.id}`, w.a, w.b);
    for (const o of map.objects) {
      if (hid(o.level)) continue;
      const seg = objectSegment(o), unseen = !!objectDef(o)?.states[o.state]?.hidden;       // only the DM is ever sent an unseen one
      if (!seg) {                                                       // a thing in a hex: a marker on the floor, and a post if it is in the way or a lever
        const w = this.G.toWorld(o.at), y = this.#stand({ q: o.at.q, r: o.at.r, z: (map.levels.find((l) => l.id === o.level)?.z ?? 0) + (map.levels.find((l) => l.id === o.level)?.tiles[cellCol(o.at)]?.h ?? 0) }).y + 0.02;
        const trap = !!objectDef(o)?.triggers?.some((t) => t.effects), col = trap ? [0.75, 0.2, 0.18] : [0.8, 0.68, 0.3];
        b.flatHex(w.x, w.z, y, 0.34, 0.5, [...col, unseen ? 0.45 : 1]);
        if (o.def === 'pit-trap' && o.state === 'open') b.flatHex(w.x, w.z, y + 0.005, 0, 0.6, [0.05, 0.05, 0.06, 1]);
        if (objectBlocks(o, 'move') || o.def === 'lever') b.lathe(w.x, w.z, y, [[0.12, 0], [0.12, o.def === 'lever' ? 0.7 : 1.1], [0, o.def === 'lever' ? 0.8 : 1.2]], 6, 0, () => [...col, 1]);
        continue;
      }
      const shut = objectBlocks(o, 'move'), c = th.door ?? [0.5, 0.33, 0.17], tall = high(o.level) && !cut.has(`o:${o.id}`), leaf = tall ? DOOR_TALL : unseen ? 1.25 : 1.0;
      if (tall) this.#slab(b, seg[0], seg[1], baseOf(o.level) + DOOR_TALL, FULL - DOOR_TALL, 0.09, th.wall ?? [0.44, 0.42, 0.4]);       // the wall over the door
      const d = this.doors.get(o.id), closing = Object.values(objectDef(o)?.states ?? {}).find((st) => st.blocks?.includes('move'));
      const shutCol = unseen ? [0.62, 0.3, 0.55] : (shut ? objectBlocks(o, 'sight') : closing?.blocks.includes('sight')) ? c : [0.3, 0.3, 0.32];      // what a shut leaf looks like (a door hides sight, a grille does not)
      if (d?.tw) {                                                      // swinging now: drawn each frame by drawDoors(), from these
        this.doorInfo.set(o.id, { seg, y0: baseOf(o.level), h: leaf, open: c, shut: shutCol });
        continue;
      }
      this.doorInfo.delete(o.id);
      const isShut = d ? d.v === 0 : shut;                              // a door still waiting for its beat is drawn as it was
      if (isShut) this.#slab(b, seg[0], seg[1], baseOf(o.level), leaf, 0.07, shutCol);
      else {                                                            // open: the leaf stands swung back against its hinge
        const [p, q] = seg, dx = q[0] - p[0], dy = q[1] - p[1];
        this.#slab(b, p, [p[0] - dy * 0.8, p[1] + dx * 0.8], baseOf(o.level), leaf, 0.05, c);
      }
    }
    this.wallMesh.set(b);
  }
  // The doors that are swinging, drawn from where their tween has got to: the leaf turns about its hinge (the first end of its line)
  // from the shut line to the open one, 90 degrees and a fifth shorter, as the still door is drawn.
  #drawDoors(now) {
    const b = new Builder();
    for (const [id, info] of this.doorInfo) {
      const d = this.doors.get(id); if (!d?.tw) continue;
      const f = tweenAt(d.tw, now).v, [p, q] = info.seg, dx = q[0] - p[0], dy = q[1] - p[1], th = (f * Math.PI) / 2, len = 1 - 0.2 * f;
      const ex = p[0] + (dx * Math.cos(th) - dy * Math.sin(th)) * len, ey = p[1] + (dx * Math.sin(th) + dy * Math.cos(th)) * len;
      this.#slab(b, p, [ex, ey], info.y0, info.h, 0.07 - 0.02 * f, mix3(info.shut, info.open, f));
    }
    this.doorMesh.set(b);
  }
  // The keys of the wall faces cut down for the camera as it is now, or null if there is no cut-away.
  #cutSet() {
    if (this.theme.floors !== 'rooms' || this.theme.cutaway === false || !this.floorData.length) return null;
    const yaw = this.cam.yaw, toCam = [Math.sin(yaw), Math.cos(yaw)], out = new Set();
    for (const fl of this.floorData) for (const i of cutaway(fl.walls, toCam)) out.add(fl.walls[i].key);
    return out;
  }
  // A cave (docs/specs/renderer.md, decision 1; floors.js caveOf): the open floor is drawn as patches already. Here: the strip
  // of floor out to the pushed edge, a face of rock standing up from that edge, and the rock as a dark mass at one height.
  #drawCave(b, cv, lv, tintOf) {
    const th = this.theme, rock = th.tiles.rock ?? [0.45, 0.43, 0.4], wpt = (p, y) => [p[0] * UNIT, y, p[1] * UNIT], noise = (p, k) => 0.5 + 0.5 * Math.sin(p[0] * 7.31 + p[1] * 3.17 + k);
    const lit = (c, f) => [c[0] * f, c[1] * f, c[2] * f, 1];
    for (const { closed, points } of cv.chains) {
      const m = closed ? points.length : points.length - 1;
      for (let i = 0; i < m; i++) {
        const a = points[i], c = points[(i + 1) % points.length], y = a.z * UNIT, top = a.top * UNIT, floor = tintOf(lv, a.hex, th.tiles[lv.tiles[a.hex].t]);
        b.quad(wpt(a.p, y), wpt(c.p, y), wpt(c.q, y), wpt(a.q, y), [...floor, 1]);                    // the floor goes out to the pushed edge
        const rc = tintOf(lv, a.hex, rock), v = 0.8 + 0.2 * noise(a.q, 0), mid = y + (top - y) * 0.4;
        b.quad(wpt(a.q, y), wpt(c.q, y), wpt(c.q, mid), wpt(a.q, mid), lit(rc, 0.55 * v));            // the foot of the face is darker
        b.quad(wpt(a.q, mid), wpt(c.q, mid), wpt(c.q, top), wpt(a.q, top), lit(rc, 0.85 * v));
      }
    }
    for (const r of cv.rock) {
      const c0 = tintOf(lv, r.hex, rock), col = lit(c0, 0.5), n = r.ring.length, top = r.top * UNIT;
      const mid = [r.ring.reduce((s, p) => s + p[0], 0) / n, r.ring.reduce((s, p) => s + p[1], 0) / n], M = wpt(mid, top);
      for (let i = 0; i < n; i++) b.tri(wpt(r.ring[(i + 1) % n], top), wpt(r.ring[i], top), M, col);       // the top of the mass, fanned from its middle, one colour
      const face = (s, to, f) => { for (let j = 0; j < 3; j++) { const p = r.ring[(s + j) % n], q = r.ring[(s + j + 1) % n]; b.quad(wpt(p, top), wpt(q, top), wpt(q, to), wpt(p, to), lit(c0, f)); } };
      for (const s of r.bare) face(s, Math.min(-1.5, top - 1.5), 0.42);                                     // a side that meets nothing: down to the ground
      for (const s of r.steps) face(s.at, s.to * UNIT, 0.4);                                                // beside lower rock: a step down
    }
  }
  // The edge of a fight: a glowing curtain of light standing on every side of the locked area that faces the outside.
  #buildEdge() {
    const eb = new Builder(this.G), map = this.state.map, enc = this.state.encounter, th = this.theme;
    if (enc) {
      const glow = th.arenaRim.map((v) => v * 0.95 + 0.05), tall = 2.1, v = (p, col) => eb.d.push(p[0], p[1], p[2], 0, 1, 0, col[0], col[1], col[2], col[3]);
      const quad2 = (a, b, c, d, ca, cb, cc, cd) => { for (const o of [[a, b, c, d, ca, cb, cc, cd], [d, c, b, a, cd, cc, cb, ca]]) { const [p0, p1, p2, p3, c0, c1, c2, c3] = o; v(p0, c0); v(p1, c1); v(p2, c2); v(p0, c0); v(p2, c2); v(p3, c3); } };
      let ys = 0, ny = 0;
      for (const h of allTiles(map)) {
        if (h.z > this.ceiling || !enc.arena[cellCol(h)]) continue;
        const w = this.G.toWorld(h), y = surfY(h.z, h.tile) + 0.03;
        ys += y; ny++; this.edgeBase = ys / ny;
        const top = eb.cellRing(w.x, w.z, 1.02, y), inner = eb.cellRing(w.x, w.z, 0.86, y);
        for (let i = 0; i < top.length; i++) {
          const n = (i + 1) % top.length, [sx, sz] = sideAt(eb.shape, i), out = this.G.fromWorld(w.x + sx * 1.8, w.z + sz * 1.8);
          if (enc.arena[cellCol(out)]) continue;                                        // inside the area on that side: no edge
          const lo = [...glow, 0.85], hi = [...glow, 0];
          quad2(top[i], top[n], [top[n][0], y + tall, top[n][2]], [top[i][0], y + tall, top[i][2]], lo, lo, hi, hi);
          quad2(inner[i], inner[n], top[n], top[i], [...glow, 0.35], [...glow, 0.35], [...glow.map((v) => v * 0.5 + 0.5), 1], [...glow.map((v) => v * 0.5 + 0.5), 1]);       // a bright line on the floor
        }
      }
    }
    this.edge.set(eb);
  }
  // An upright slab along a line given in map feet.
  #slab(b, p, q, y0, height, half, col, cap = null) {
    const ax = p[0] * UNIT, az = p[1] * UNIT, bx = q[0] * UNIT, bz = q[1] * UNIT, len = Math.hypot(bx - ax, bz - az) || 1;
    const nx = (-(bz - az) / len) * half, nz = ((bx - ax) / len) * half, y1 = y0 + height;
    const c = [[ax + nx, az + nz], [bx + nx, bz + nz], [bx - nx, bz - nz], [ax - nx, az - nz]];
    const lo = c.map(([x, z]) => [x, y0, z]), hi = c.map(([x, z]) => [x, y1, z]);
    const face = (a, b2, c2, d, f) => { b.quad(a, b2, c2, d, shade(col, f)); b.quad(d, c2, b2, a, shade(col, f)); };
    if (cap) { b.quad(hi[0], hi[1], hi[2], hi[3], cap); b.quad(hi[3], hi[2], hi[1], hi[0], cap); } else face(hi[0], hi[1], hi[2], hi[3], 1.1);
    for (let i = 0; i < 4; i++) { const n = (i + 1) % 4; face(hi[i], hi[n], lo[n], lo[i], i % 2 ? 0.7 : 0.9); }
  }

  // One unit shadow, drawn under every creature at its own size.
  #makeBlob() { const b = new Builder(), sh = this.theme.shadow ?? { a: 0.4 }; b.blob(0, 0, 0, 1, sh.a, sh); this.blobMesh.set(b); }

  #buildOverlay() {
    const b = new Builder(this.G), s = this.state, hl = this.hl, c = this.theme.hl;
    const top = (k) => this.#stand(cellParse(k)).y + 0.03;
    const at = (k) => this.G.toWorld(cellParse(k));
    for (const fx of s.effects ?? []) {            // lasting zones, under everything else: a soft patch, fainter toward its outer edge
      const zh = zoneHexes(s, fx); if (!zh?.hexes.length) continue;
      const t = zoneType(fx.zone.steps), rgb = this.theme.zones?.[t ?? 'neutral'] ?? ZONE_TINT[t ?? 'neutral'], have = new Set(zh.hexes.map(cellCol));
      for (const h of zh.hexes) {
        const w = this.G.toWorld(h), y = this.#stand({ q: h.q, r: h.r, z: zh.at }).y + 0.015, rim = this.G.neighbors(h).some((n) => !have.has(cellCol(n)));
        b.flatHex(w.x, w.z, y, 0, rim ? 0.8 : 1.02, [...rgb, 0.3]);
        if (rim) b.flatHex(w.x, w.z, y, 0.8, 0.98, [...rgb, 0.12]);
      }
    }
    for (const k of hl.move) { const w = at(k); b.flatHex(w.x, w.z, top(k), 0, 0.78, c.move); }
    for (const k of hl.area) { const w = at(k); b.flatHex(w.x, w.z, top(k) + 0.01, 0, 0.92, c.area); }
    // Whatever is in the air has a mark on the floor beneath it.
    for (const e of Object.values(s.entities)) { const sf = !e.dead && !ground(s.map, e.pos) ? under(s.map, e.pos) : null; if (sf) { const w = this.G.toWorld(e.pos); b.flatHex(w.x, w.z, this.#stand({ q: e.pos.q, r: e.pos.r, z: sf.z }).y + 0.02, 0.2, 0.42, [0, 0, 0, 0.45]); } }
    const ringOn = (id, col, r0 = 0.66, r1 = 0.94) => {
      const e = s.entities[id]; if (!e) return;
      for (const f of footprint(e, e.pos, this.G)) { const k = cellKey(f), w = at(k); b.flatHex(w.x, w.z, top(k) + 0.02, r0, r1, col); }      // every hex it fills
    };
    for (const id of hl.targets) ringOn(id, c.target);
    for (const id of hl.allies) ringOn(id, c.ally);
    if (hl.turn) ringOn(hl.turn, [...this.theme.arenaRim, 0.95], 0.72, 0.98);
    if (hl.selected) ringOn(hl.selected, c.select, 0.56, 0.68);
    if (this.pins.length) {
      const y = surfY(this.pinZ ?? 0) + 0.06, red = [0.95, 0.15, 0.15, 0.95];
      for (const [x, z] of this.pins) b.flatHex(x * UNIT, z * UNIT, y, 0, 0.32, red);
      for (let i = 1; i < this.pins.length; i++) {
        const p = this.pins[i - 1], q = this.pins[i], ax = p[0] * UNIT, az = p[1] * UNIT, bx = q[0] * UNIT, bz = q[1] * UNIT, len = Math.hypot(bx - ax, bz - az) || 1, nx = (-(bz - az) / len) * 0.06, nz = ((bx - ax) / len) * 0.06;
        b.quad([ax + nx, y, az + nz], [ax - nx, y, az - nz], [bx - nx, y, bz - nz], [bx + nx, y, bz + nz], red);
        b.quad([ax - nx, y, az - nz], [ax + nx, y, az + nz], [bx + nx, y, bz + nz], [bx - nx, y, bz - nz], red);
      }
    }
    if (this.bars.length) {                       // a step a wall stops: a short bar across the middle of the line between the two hex centres
      const y = surfY(this.barZ) + 0.05, amber = [1, 0.62, 0.1, 0.95];
      for (const [x1, y1, x2, y2] of this.bars) {
        const mx = ((x1 + x2) / 2) * UNIT, mz = ((y1 + y2) / 2) * UNIT, dx = (x2 - x1) * UNIT, dz = (y2 - y1) * UNIT, len = Math.hypot(dx, dz) || 1, ux = (dx / len) * 0.2, uz = (dz / len) * 0.2, nx = (-uz / 0.2) * 0.04, nz = (ux / 0.2) * 0.04;
        b.quad([mx - ux + nx, y, mz - uz + nz], [mx - ux - nx, y, mz - uz - nz], [mx + ux - nx, y, mz + uz - nz], [mx + ux + nx, y, mz + uz + nz], amber);
        b.quad([mx - ux - nx, y, mz - uz - nz], [mx - ux + nx, y, mz - uz + nz], [mx + ux + nx, y, mz + uz + nz], [mx + ux - nx, y, mz + uz - nz], amber);
      }
    }
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
    const dpr = this.gov.ratio, c = this.canvas;
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
    this.#animate((this.now = clock()));
    if (c.goal) { c.x += (c.goal.x - c.x) * Math.min(1, dt * 5); c.z += (c.goal.z - c.z) * Math.min(1, dt * 5); if (Math.hypot(c.goal.x - c.x, c.goal.z - c.z) < 0.02) c.goal = null; }
    for (const a of this.actors.values()) {
      // A pawn glides hex by hex; a long walk speeds up so it never drags, and each step is a small hop.
      let step = dt * 9 * Math.max(1, a.way.length / 5), walked = 0;
      while (a.way.length && step > 0) {
        const w = a.way[0], dx = w.x - a.x, dz = w.z - a.z, d = Math.hypot(dx, dz);
        if (d > 0.001) a.face = Math.atan2(dx, dz);
        if (d <= step) { Object.assign(a, { x: w.x, y: w.y, z: w.z }); a.way.shift(); step -= d; walked += d; }
        else { a.x += (dx / d) * step; a.z += (dz / d) * step; a.y += (w.y - a.y) * Math.min(1, step / d); walked += step; step = 0; }
      }
      if (a.face !== undefined) { const turn = Math.atan2(Math.sin(a.face - a.yaw), Math.cos(a.face - a.yaw)); a.yaw += turn * Math.min(1, dt * 16); }    // turn to face the way it walks
      a.walk = a.way.length ? (a.walk ?? 0) + walked : 0;
      a.flash = Math.max(0, (a.flash ?? 0) - dt); a.shake = Math.max(0, (a.shake ?? 0) - dt);
      a.hop = a.way.length && !a.air ? 0.13 * Math.abs(Math.sin((Math.PI * a.walk) / 1.732)) : 0;                                            // drawn only; where it stands does not change
    }
    const C = (this.C = this.#camera());
    const td = this.tod, k = Math.min(1, dt * 1.5);
    if (td) { const n = td.now, g = td.goal; td.now = { light: n.light.map((v, i) => v + (g.light[i] - v) * k), sky: n.sky + (g.sky - n.sky) * k }; }
    const lt = td?.now ?? { light: [1, 1, 1], sky: 1 }, sky = th.sky.map((v, i) => v * lt.sky * (0.5 + 0.5 * lt.light[i]));       // the sky and the fog follow the light
    gl.clearColor(...sky, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (!this.state) return;
    gl.uniformMatrix4fv(this.loc.uVP, false, C.vp);
    gl.uniform3fv(this.loc.uLight, norm([0.45, 0.8, 0.35]));
    gl.uniform3fv(this.loc.uSky, sky);
    gl.uniform3fv(this.loc.uGrade, lt.light);
    gl.uniform2f(this.loc.uFog, c.dist + th.fog[0] * 0.5, th.fog[1]);
    gl.disable(gl.BLEND);
    if (this.cutYaw === null || Math.abs(Math.atan2(Math.sin(c.yaw - this.cutYaw), Math.cos(c.yaw - this.cutYaw))) > 0.015) this.#buildWalls();       // the walls that are cut away follow the camera
    this.terrain.draw(this.loc, ident());
    this.wallMesh.draw(this.loc, ident());
    if (this.pics.length) this.#drawPictures(C, sky, lt.light);
    this.#drawDoorsNow();
    for (const a of this.actors.values()) if (a.fade >= 1) this.#drawPawn(a, a.mesh, 1);
    gl.enable(gl.BLEND);
    // Pawns that are fading (appearing, dying, being placed or removed) are drawn blended, lit by the hour like the rest.
    gl.uniform3fv(this.loc.uGrade, lt.light);
    gl.depthFunc(gl.LEQUAL);                                              // the living pawn fades off the fallen one that stands in the same place
    for (const a of this.actors.values()) {
      if (a.dying) this.#drawPawn(a, a.dying.mesh, 1 - Math.min(1, (this.now - a.dying.t0) / a.dying.dur));
      else if (a.fade < 1) this.#drawPawn(a, a.mesh, a.fade);
    }
    gl.depthFunc(gl.LESS);
    for (const g of this.ghosts) this.#drawPawn(g, g.mesh, 1 - Math.min(1, (this.now - g.t0) / g.dur));
    gl.depthMask(false);
    gl.uniform3f(this.loc.uGrade, 1, 1, 1);                                // highlights, the arena edge and shadows are not tinted by the hour
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(-2, -2);          // shadows lie on the floor without flickering
    this.grid.draw(this.loc, ident(), [1, 1, 1, 1], 0);
    this.shadows.draw(this.loc, ident(), [1, 1, 1, 1], 0);
    for (const a of this.actors.values()) {
      const k = a.k ?? 1, fade = 1 / (1 + a.air * 0.5);                    // a flier's shadow is fainter and smaller
      this.blobMesh.draw(this.loc, model(a.x - 0.14 * k, a.y - a.air + 0.016, a.z - 0.1 * k, 0, 0, 0.92 * k * (0.6 + 0.4 * fade)), [1, 1, 1, fade * (a.fade ?? 1)], 0);
    }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    this.overlay.draw(this.loc, ident(), [1, 1, 1, 1], 0);
    this.anim += dt;
    // The edge of a fight: it rises and flashes when `encounterStart` plays (1.2 s), then breathes; it sinks when `encounterEnd` plays (0.6 s).
    const fx = this.edgeFx, sk = this.sinkFx;
    if (this.state.encounter && fx.phase !== 'hold') {
      const age = fx.phase === 'on' ? 9 : this.now - fx.t0, k = Math.min(1, age / SECS.rise), pulse = 0.82 + 0.18 * Math.sin(this.anim * 2.4), burst = Math.max(0, 1 - age / 1.6) * 0.8, rise = smooth(k);
      this.edge.draw(this.loc, [1, 0, 0, 0, 0, Math.max(0.001, rise), 0, 0, 0, 0, 1, 0, 0, (1 - rise) * this.edgeBase, 0, 1], [1 + burst, 1 + burst, 1 + burst, k * k * pulse], 0);
    }
    if (sk) {
      const p = sk.phase === 'hold' ? 0 : Math.min(1, (this.now - sk.t0) / SECS.sink), pulse = 0.82 + 0.18 * Math.sin(this.anim * 2.4), sink = 1 - smooth(p);
      sk.mesh.draw(this.loc, [1, 0, 0, 0, 0, Math.max(0.001, sink), 0, 0, 0, 0, 1, 0, 0, (1 - sink) * sk.base, 0, 1], [1, 1, 1, (1 - p * p) * pulse], 0);
    }
    for (const v of this.veils.values()) v.mesh.draw(this.loc, ident(), [1, 1, 1, v.alpha], 0);      // a region just seen rises out of the dark
    gl.depthMask(true);

    for (const a of this.actors.values()) {
      const p = this.#project(C, a.x, a.y + (1.95 - 1.05 * Math.min(1, (a.tiltNow ?? 0) / 0.9)) * (a.k ?? 1), a.z);
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

  // One pawn at its place, tilted as far as it has fallen, with `alpha` (1 is solid). A hit flash and a critical shake are drawn only.
  #drawPawn(a, mesh, alpha) {
    const f = a.flash ? Math.min(1, a.flash / FLASH) : 0, sh = a.shake ? (a.shake / SHAKE) ** 2 * 0.16 * Math.sin(a.shake * 70) : 0, tl = a.tiltNow ?? 0;      // the pawn is not really moved; it shakes across the screen whichever way the camera faces
    mesh.draw(this.loc, model(a.x + sh * Math.cos(this.cam.yaw), a.y + 0.15 * Math.min(1, tl / 0.5) + (a.hop ?? 0), a.z - sh * Math.sin(this.cam.yaw), a.yaw, tl),
      f ? [1 + f * 1.4, 1 - f * 0.55, 1 - f * 0.55, alpha] : [1, 1, 1, alpha]);
  }
  #drawDoorsNow() {
    let any = false;
    for (const d of this.doors.values()) if (d.tw) any = true;
    if (!any) return;
    this.#drawDoors(this.now);
    this.doorMesh.draw(this.loc, ident());
  }
  // Moves every running beat on to this moment, and brings a held look in line when its event never came.
  #animate(now) {
    for (const a of this.actors.values()) {
      if (a.tiltTw) { const r = tweenAt(a.tiltTw, now); a.tiltNow = r.v; if (r.done) a.tiltTw = null; }
      if (a.fadeTw) { const r = tweenAt(a.fadeTw, now); a.fade = r.v; if (r.done) a.fadeTw = null; }
      else if (a.hold && now - a.holdAt > HOLD_MAX) { a.hold = false; a.fade = 1; }
      if (a.fall) { const r = tweenAt(a.fall, now); a.y = r.v; if (r.done) a.fall = null; }
      if (a.dying && now - a.dying.t0 >= a.dying.dur) { a.dying.mesh.free(); a.dying = null; }
      const op = a.fade < 1 ? a.fade.toFixed(2) : '';
      if (op !== a.opa) { a.opa = op; a.el.style.opacity = op; }
    }
    if (this.ghosts.length) {
      this.ghosts = this.ghosts.filter((g) => {
        const p = (now - g.t0) / g.dur;
        if (p >= 1) { this.#dropGhost(g); return false; }
        if (g.el) g.el.style.opacity = String(1 - p);
        return true;
      });
    }
    for (const d of this.doors.values()) {
      if (d.tw && tweenAt(d.tw, now).done) { d.v = d.tw.to; d.tw = null; this.wallsDirty = true; }
      else if (!d.tw && d.v !== d.goal && now - d.since > HOLD_MAX) { d.v = d.goal; this.wallsDirty = true; }
    }
    for (const [id, v] of this.veils) {
      if (v.tw) { const r = tweenAt(v.tw, now); v.alpha = r.v; if (!r.done) continue; }
      else if (now - v.since <= HOLD_MAX) continue;
      v.mesh.free(); this.veils.delete(id);
    }
    const fx = this.edgeFx;
    if (fx.phase === 'hold' && now - fx.since > HOLD_MAX) this.edgeFx = { phase: 'on', t0: now };
    const sk = this.sinkFx;
    if (sk && (sk.phase === 'hold' ? now - sk.since > HOLD_MAX : now - sk.t0 >= SECS.sink)) { sk.mesh.free(); this.sinkFx = null; }
    if (this.wallsDirty && this.state) this.#buildWalls(true);
  }

  #drawPictures(C, sky, grade) {
    const gl = this.gl, L = this.picLoc;
    gl.useProgram(this.picProg); gl.disableVertexAttribArray(2); gl.enableVertexAttribArray(1);
    gl.uniformMatrix4fv(L.uVP, false, C.vp); gl.uniform3fv(L.uSky, sky); gl.uniform3fv(L.uGrade, grade);
    gl.uniform2f(L.uFog, this.cam.dist + this.theme.fog[0] * 0.5, this.theme.fog[1]); gl.uniform1i(L.uTex, 0);
    gl.disable(gl.CULL_FACE);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.picBuf);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    for (const p of this.pics) {
      const tex = this.images.get(p.asset)?.tex; if (!tex) continue;
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.drawArrays(gl.TRIANGLES, p.first, 6); draws++;
    }
    gl.enable(gl.CULL_FACE); gl.useProgram(this.prog); gl.enableVertexAttribArray(2);
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
      const h = this.G.fromWorld(x, z), column = surfaces(this.state.map, h);
      for (let i = column.length - 1; i >= 0; i--) {
        const top = surfY(column[i].z, column[i].tile);
        if (y > top || (i > 0 && y < top - SLAB)) continue;               // above this floor, or under it in the room below
        const hex = { q: h.q, r: h.r, z: column[i].z };
        const occ = Object.values(this.state.entities).find((e) => !e.dead && e.pos.z === hex.z && footprint(e, e.pos, this.G).some((f) => f.q === hex.q && f.r === hex.r));
        return { hex, id: occ?.id ?? null };
      }
      if (y < -60) break;
    }
    return null;
  }
  #input() {
    const el = this.canvas, pts = new Map(), c = this.cam, ac = new AbortController(), on = { signal: ac.signal };
    this.off = () => ac.abort();
    let moved = 0, downAt = 0, pinch = null, stroke = false;
    const xy = (e) => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    el.addEventListener('contextmenu', (e) => e.preventDefault(), on);
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId); pts.set(e.pointerId, xy(e));
      if (pts.size === 1) { moved = 0; downAt = performance.now(); stroke = !!this.onDrag?.down(...xy(e), e); }
      else if (stroke) { stroke = false; moved = 99; this.onDrag.cancel(); }      // a second finger: the camera again
      pinch = null;
    }, on);
    el.addEventListener('pointermove', (e) => {
      const p = xy(e), old = pts.get(e.pointerId);
      if (!old) { if (e.pointerType === 'mouse') { const hit = this.#pick(...p); this.canvas.title = [...new Set(this.zonesAt(hit?.hex))].join(', '); this.onHover(hit?.hex ?? null); } return; }
      pts.set(e.pointerId, p);
      if (stroke && pts.size === 1) { this.onDrag.move(...p); return; }
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
        if (pinch) { this.zoom(pinch.dist / dist); c.yaw += ang - pinch.ang; }      // the map turns the way the fingers turn
        pinch = { dist, ang };
      }
    }, on);
    const up = (e) => {
      const p = pts.get(e.pointerId); pts.delete(e.pointerId); pinch = null;
      if (stroke) { stroke = false; if (e.type === 'pointerup') this.onDrag.end(); else this.onDrag.cancel(); return; }
      if (p && e.type === 'pointerup' && !pts.size && moved < 8 && performance.now() - downAt < 600 && e.button !== 2) {
        if (this.onPoint) { this.onPoint(p[0], p[1]); return; }
        const hit = this.#pick(...p); if (hit) this.onTap(hit);
      }
    };
    el.addEventListener('pointerup', up, on); el.addEventListener('pointercancel', up, on);
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY > 0 ? 1.1 : 0.9); }, { passive: false, signal: ac.signal });
  }
}
