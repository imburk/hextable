// The Three.js renderer (docs/specs/renderer.md, R11): the one renderer (the interface of renderer.js), drawn with the vendored Three.js r187. The hand-written renderer it was ported from, render.js, was deleted in R14 step 2 (#355).
// It is loaded when the kind 'three' is chosen, which is every page but `?renderer=none` (renderer.js imports it dynamically).
// It was written for parity with the old renderer, not as an improvement: the camera, the light and the fog, the shapes and colours, the picking and the beats were the
// old renderer's. Terrain, walls, overlay and pawns are built by three-build.js (pure) into one BufferGeometry per kind and drawn
// with one small ShaderMaterial that does what the old hand-written renderer's shader did (a colour per vertex, one directional light, fog, the hour's
// grade, a tint per draw), so the pictures agree. Picking is still the hex-column march (Decision 8): only the camera ray is Three's.
// Creature models (R12, models.js): a creature with a model in its theme's pack is drawn with it, a pawn while it loads and when it has none. Real shadows (docs/specs/renderer.md, R15): a depth pass from the sun into a shadow map, read by the floors; the blobs
// are drawn when it is off. The governor gives them up before it gives up any pixel ratio.
import * as THREE from './vendor/three/three.module.js';
import { HEX, gridOf } from './shared/grid.js';
import { footprint, ground, surfaces, under } from './shared/space.js';
import { barriers, objectBlocks, objectSegment } from './shared/walls.js';
import { createGovernor, shadowLevels } from './governor.js';
import { CONTENT } from './shared/content/index.js';
import { Models, fit, makeBase, modelFor, modelsMode } from './models.js';
import { BLOCK, THUMB, growFor, blockBox, planeY, Builder, UNIT, arenaFlashCells, buildEdge, buildOverlay, buildTerrain, buildWalls, cutSetFor, girth, hpFraction, lightAt, makeBlob, makePawn, makeVeil, model, pawnHeight, sightSig, spot, stand, surfY, swingDoor, tileSig, zoneHexes } from './three-build.js';

const MARKS = { dying: '✚ Dying', prone: '▼ Prone', dodging: '◆ Dodging', following: '↪ Following' };
const FLASH = 0.45, SHAKE = 0.5, RETRY_MS = 8000, HOLD_MAX = 4, SLAB = 0.35;
const SECS = { door: 0.5, portcullis: 0.8, region: 0.6, rise: 1.2, sink: 0.6, fall: 0.6, prone: 0.3, stand: 0.4, appear: 0.4, vanish: 0.3, placed: 0.3, drop: 0.6 };
const smooth = (p) => p * p * (3 - 2 * p);
const accel = (p) => p * p;
const tweenAt = (tw, now) => { const p = Math.max(0, Math.min(1, (now - tw.t0) / tw.dur)); return { v: tw.from + (tw.to - tw.from) * (tw.ease ?? smooth)(p), done: p >= 1 }; };
const clock = () => performance.now() / 1000;
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// The shader is the old hand-written renderer's, in Three's clothes: the model matrix, the view and projection come from Three.
const VS = `
attribute vec4 aCol;
uniform vec3 uLight, uGrade; uniform vec4 uTint; uniform float uLit; uniform vec2 uFog;
varying vec4 vCol; varying float vFog;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelMatrix) * normal);
  float l = mix(1.0, 0.56 + 0.5 * max(dot(n, uLight), 0.0), uLit);
  vCol = vec4(aCol.rgb * l * uTint.rgb * uGrade, aCol.a * uTint.a);
  gl_Position = projectionMatrix * viewMatrix * w;
  vFog = clamp((gl_Position.w - uFog.x) / uFog.y, 0.0, 1.0);
}`;
const FS = `
varying vec4 vCol; varying float vFog; uniform vec3 uSky;
void main() { gl_FragColor = vec4(mix(vCol.rgb, uSky, vFog * 0.8), vCol.a); }`;
// Real shadows (R15). The floors read a depth map drawn from the sun: `uSMap` the depths, `uSVP` the sun's matrix, `uSP` = (the size of
// a texel in drawing units, how dark a shadow is, the depth bias, the width of the soft edge in texels). The point is nudged along the
// surface's normal by a texel and a half so a floor does not shadow itself; nine taps, turned a different way at each pixel, make the edge soft.
const SH_VS_DECL = `
#ifdef SHADOWS
varying vec3 vWp, vWn;
#endif`;
const SH_FS = `
#ifdef SHADOWS
varying vec3 vWp, vWn; uniform sampler2D uSMap; uniform mat4 uSVP; uniform vec4 uSP; uniform vec3 uLight;
const vec2 POI[8] = vec2[8](vec2(-0.613392, 0.617481), vec2(0.170019, -0.040254), vec2(-0.299417, 0.791925), vec2(0.645680, 0.493210), vec2(-0.651784, 0.717887), vec2(0.421003, 0.027070), vec2(-0.817194, -0.271096), vec2(-0.705374, -0.668203));
float shadowAt(vec3 wp, vec3 n) {
  float facing = dot(n, uLight);
  if (facing <= 0.02) return 0.0;
  vec3 c = (uSVP * vec4(wp + n * uSP.x * 1.5, 1.0)).xyz * 0.5 + 0.5;
  if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 0.0;
  float fade = smoothstep(0.0, 0.07, min(min(c.x, c.y), min(1.0 - c.x, 1.0 - c.y))) * smoothstep(0.02, 0.3, facing);
  float a = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  mat2 rot = mat2(cos(a), sin(a), -sin(a), cos(a));
  vec2 texel = 1.0 / vec2(textureSize(uSMap, 0));
  float s = step(texture2D(uSMap, c.xy).r + uSP.z, c.z);
  for (int i = 0; i < 8; i++) s += step(texture2D(uSMap, c.xy + rot * POI[i] * uSP.w * texel).r + uSP.z, c.z);
  return s / 9.0 * fade * uSP.y;
}
#endif`;
const SH_TINT = 'vec3(0.5, 0.55, 0.72)';       // what a full shadow multiplies a floor's colour by (cooler than the light)
const VS_R = VS.replace('varying vec4 vCol;', `${SH_VS_DECL}\nvarying vec4 vCol;`).replace('  gl_Position =', '#ifdef SHADOWS\n  vWp = w.xyz; vWn = n;\n#endif\n  gl_Position =');
const FS_R = `varying vec4 vCol; varying float vFog; uniform vec3 uSky;${SH_FS}
void main() {
  vec3 col = vCol.rgb;
#ifdef SHADOWS
  col *= mix(vec3(1.0), ${SH_TINT}, shadowAt(vWp, normalize(vWn)));
#endif
  gl_FragColor = vec4(mix(col, uSky, vFog * 0.8), vCol.a);
}`;
const VS_PIC = `${SH_VS_DECL}
uniform vec2 uFog; varying vec2 vUV; varying float vFog;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
#ifdef SHADOWS
  vWp = w.xyz; vWn = vec3(0.0, 1.0, 0.0);
#endif
  gl_Position = projectionMatrix * viewMatrix * w; vUV = uv; vFog = clamp((gl_Position.w - uFog.x) / uFog.y, 0.0, 1.0);
}`;
const FS_PIC = `varying vec2 vUV; varying float vFog; uniform vec3 uSky, uGrade; uniform sampler2D uTex;${SH_FS}
void main() {
  vec3 col = texture2D(uTex, vUV).rgb * uGrade;
#ifdef SHADOWS
  col *= mix(vec3(1.0), ${SH_TINT}, shadowAt(vWp, vec3(0.0, 1.0, 0.0)));
#endif
  gl_FragColor = vec4(mix(col, uSky, vFog * 0.8), 1.0);
}`;
// The depth pass: only where each triangle lands in the sun's view matters, so there is nothing to colour.
const VS_DEPTH = '#include <common>\n#include <skinning_pars_vertex>\nvoid main() {\n#include <begin_vertex>\n#include <skinbase_vertex>\n#include <skinning_vertex>\ngl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(transformed, 1.0); }';
const FS_DEPTH = 'void main() { gl_FragColor = vec4(1.0); }';

// The shadow setting: the address (`?shadows=on|off|auto`) first, then the device preference `hextable.shadows`, else 'auto'.
// 'auto' is on for a desktop or tablet and off for a phone until the governor sees headroom; 'on' and 'off' are kept.
export const SHADOW_MODES = ['auto', 'on', 'off'];
export function shadowMode(search = '', pref) {
  let q = null;
  try { q = new URLSearchParams(search).get('shadows'); } catch { /* no address */ }
  const k = q ?? pref;
  return SHADOW_MODES.includes(k) ? k : 'auto';
}
// A phone: a touch screen whose shorter side is under 600 CSS pixels. (A tablet is not, and starts with its shadows on.)
export const isPhone = ({ coarse, w, h }) => !!coarse && Math.min(w, h) < 600;
// The sun's box over the board (pure: tested in Node). `bounds` is the board's extent in drawing units, `focus` where the camera looks,
// `dist` how far away it is, `size` the shadow map's width in texels, `light` the unit vector toward the sun. The box covers the whole
// board if it is small and otherwise the stretch of it that can be on screen, centred on the focus and moved in whole texels so the
// shadows do not crawl as the camera pans. Returns the centre, the half width, the texel's size in drawing units, and the depth range.
export function shadowBox({ bounds, focus, dist, size, light }) {
  const cx = (bounds.x0 + bounds.x1) / 2, cz = (bounds.z0 + bounds.z1) / 2, hb = Math.hypot(bounds.x1 - bounds.x0, bounds.z1 - bounds.z0) / 2 + 1;
  const hs = Math.min(hb, Math.max(14, dist * 1.15)), texel = (2 * hs) / size;
  let c = hs >= hb ? [cx, (bounds.y0 + bounds.y1) / 2, cz] : [focus[0], focus[1], focus[2]];
  if (hs < hb) {
    const r = norm(cross3([0, 1, 0], [-light[0], -light[1], -light[2]])), u = cross3(r, [-light[0], -light[1], -light[2]]);
    const snap = (v) => Math.round(v / texel) * texel, dr = dot3(c, r), du = dot3(c, u);
    c = [c[0] + r[0] * (snap(dr) - dr) + u[0] * (snap(du) - du), c[1] + r[1] * (snap(dr) - dr) + u[1] * (snap(du) - du), c[2] + r[2] * (snap(dr) - dr) + u[2] * (snap(du) - du)];
  }
  const D = hs * 1.3 + (bounds.y1 - bounds.y0) + 8;
  return { centre: c, half: hs, texel, near: 0.5, far: 2 * D, back: D };
}
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// One drawable: a Mesh over a geometry built from a Builder, with its own material (its tint is its own).
// order: draw order among the blended things (the default renderer's order); blend: drawn with alpha and without writing depth.
class Piece {
  constructor(R, { flat = false, lit = 1, blend = false, offset = false, order = 0, recv = false, cast = false } = {}) {
    this.R = R; this.geom = null; this.own = true; this.on = true; this.n = 0; this.blend = blend;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uLight: R.u.light, uGrade: flat ? R.u.flat : R.u.grade, uFog: R.u.fog, uSky: R.u.sky, uTint: { value: new THREE.Vector4(1, 1, 1, 1) }, uLit: { value: lit }, ...(recv ? R.u.sh : {}) },
      vertexShader: recv ? VS_R : VS, fragmentShader: recv ? FS_R : FS, transparent: blend, depthWrite: !blend, polygonOffset: offset, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.frustumCulled = false; this.mesh.matrixAutoUpdate = false; this.mesh.matrixWorldAutoUpdate = false; this.mesh.renderOrder = order; this.mesh.visible = false;
    if (cast) this.mesh.layers.enable(1);                    // layer 1 is what the sun's camera sees: the things that cast shadows
    if (recv) R.receivers.add(this.mat);
    R.scene.add(this.mesh);
  }
  #geometry(arr) {
    const g = new THREE.BufferGeometry(), ib = new THREE.InterleavedBuffer(arr, 10);
    g.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0));
    g.setAttribute('normal', new THREE.InterleavedBufferAttribute(ib, 3, 3));
    g.setAttribute('aCol', new THREE.InterleavedBufferAttribute(ib, 4, 6));
    return g;
  }
  set(builder) { this.#swap(builder.count ? this.#geometry(new Float32Array(builder.d)) : null, true, builder.count); return this; }
  share(piece) { this.#swap(piece.geom, false, piece.n); return this; }        // the same geometry as another piece, which keeps owning it
  #swap(g, own, n) {
    if (this.geom && this.own) this.geom.dispose();
    this.geom = g; this.own = own; this.n = n;
    if (g) this.mesh.geometry = g;
    this.mesh.visible = this.on && n > 0;
  }
  show(v) { this.on = v; this.mesh.visible = v && this.n > 0; }
  tint(r, g, b, a) { this.mat.uniforms.uTint.value.set(r, g, b, a); this.mat.transparent = this.blend || a < 1; this.mat.depthWrite = !this.blend; }
  place(m) { this.mesh.matrixWorld.fromArray(m); }
  free() { if (this.geom && this.own) this.geom.dispose(); this.geom = null; this.n = 0; this.R.scene.remove(this.mesh); this.R.receivers.delete(this.mat); this.mat.dispose(); }
}

export class ThreeRenderer {
  constructor(canvas, labels, theme) {
    this.canvas = canvas; this.labels = labels; this.theme = theme;
    this.three = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.three.autoClear = true; this.three.outputColorSpace = THREE.LinearSRGBColorSpace;      // colours are written as they are, as the old renderer did (no sRGB conversion of the clear colour)
    this.scene = new THREE.Scene(); this.scene.matrixWorldAutoUpdate = false;
    this.camera = new THREE.PerspectiveCamera((0.75 * 180) / Math.PI, 1, 0.3, 200);       // the lens the table has always had: 0.75 rad, near 0.3, far 200
    const V3 = (...a) => ({ value: new THREE.Vector3(...a) });
    this.u = { light: V3(...norm([0.45, 0.8, 0.35])), grade: V3(1, 1, 1), flat: V3(1, 1, 1), sky: V3(0, 0, 0), fog: { value: new THREE.Vector2(60, 34) } };
    this.u.sh = { uSMap: { value: null }, uSVP: { value: new THREE.Matrix4() }, uSP: { value: new THREE.Vector4(0.02, 0.85, 0.01, 4) } };       // what the floors read the shadow map through
    this.receivers = new Set(); this.sh = { on: false, size: 0, rt: null, cam: null, mat: null, key: '', calls: 0, passes: 0 }; this.bounds = { x0: -10, x1: 10, z0: -10, z1: 10, y0: 0, y1: 4 };
    this.images = new Map(); this.picMeshes = []; this.onPicture = null; this.assetUrl = null;
    this.bars = []; this.barZ = 0; this.pins = []; this.pinZ = 0;
    const o = (order, extra) => ({ flat: true, lit: 0, blend: true, order, ...extra });
    this.terrain = new Piece(this, { recv: true }); this.wallMesh = new Piece(this, { cast: true }); this.doorMesh = new Piece(this, { cast: true });
    this.grid = new Piece(this, o(10, { offset: true })); this.shadows = new Piece(this, o(11, { offset: true })); this.overlay = new Piece(this, o(13));
    this.overlayX = new Piece(this, o(13)); this.overlayX.mat.depthTest = false;       // the faint outlines of a flyer's plane and column, drawn through walls and floors (three-build.js, `through`)
    this.colEls = [];
    this.edge = new Piece(this, o(14)); this.edgeId = null; this.edgeBase = 0; this.edgeFx = { phase: 'on', t0: 0 }; this.sinkFx = null; this.anim = 0;
    this.flash = new Piece(this, { flat: true, lit: 0, blend: true, order: 15 }); this.flashAt = null;       // a refused move lights the border cells nearest it (the page event `hextable-arena-flash`, from app.js)
    this.onFlash = (ev) => this.#flashEdge(ev.detail); window.addEventListener('hextable-arena-flash', this.onFlash);
    this.actors = new Map(); this.models = null; this.modelMode = modelsMode(location.search, (() => { try { return JSON.parse(localStorage.getItem('hextable.models')); } catch { return null; } })());
    this.floorData = []; this.cutSig = ''; this.cutYaw = null; this.wallsDirty = false;
    this.doors = new Map(); this.doorInfo = new Map(); this.seenRegions = null; this.veils = new Map(); this.ghosts = []; this.fell = new Set(); this.now = clock();
    this.blobGeom = new Piece(this, o(12)); this.blobGeom.show(false); this.#makeBlob();
    this.ceiling = Infinity;
    this.cam = { x: 0, y: 0.6, z: 0, yaw: 0.5, pitch: 0.95, dist: 22, goal: null, yawGoal: null }; this.turns = 0;      // turns: manual turns of the view so far (keyboard.md: a manual turn suspends following)
    this.hl = { move: [], area: [], range: [], areaBad: false, targets: [], allies: [], selected: null, turn: null, column: null, plane: null };
    this.G = HEX;                             // the grid the map is drawn on (gridOf(map) once there is one)
    this.state = null; this.terrainKey = ''; this.floaters = []; this.inset = 0;
    this.onTap = () => {}; this.onHover = () => {}; this.onPoint = null; this.onDrag = null;
    this.#input();
    this.phone = isPhone({ coarse: window.matchMedia?.('(pointer: coarse)').matches, w: screen.width, h: screen.height });
    this.shMode = shadowMode(location.search, (() => { try { return JSON.parse(localStorage.getItem('hextable.shadows')); } catch { return null; } })());
    this.#ladder();
    this.onShadows = (ev) => this.setShadows(ev.detail);          // the Settings tab says so (settings.js), for it has no other way to this renderer
    window.addEventListener('hextable-shadows', this.onShadows);
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
  setTheme(theme) { this.theme = theme; this.#dropModels(); this.#makeBlob(); this.terrainKey = ''; for (const a of this.actors.values()) a.key = ''; if (this.state) this.setState(this.state, []); }

  setState(state, events = [], opt = {}) {
    const prev = this.state, now = (this.now = clock());
    const snap = !!opt.instant || !prev || prev.map.id !== state.map.id || events.some((e) => e.type === 'map' || e.type === 'mapEdit' || e.type === 'undone' || e.type === 'redone');
    const idsOf = (type) => new Set(events.filter((e) => e.type === type && e.id !== undefined).map((e) => e.id));
    if (snap) this.#finish(false);
    this.state = state; this.G = gridOf(state.map);
    const want = lightAt(state.clock ?? 480);
    this.tod = { goal: want, now: this.tod?.now ?? want };
    this.#syncEdge(events, snap, now);
    this.#syncDoors(events, snap, now);
    this.#syncVeils(events, snap, now);
    const tk = `${state.encounter?.id ?? 0}:${state.map.id}:${state.map.levels.map((l) => Object.keys(l.tiles).length).join()}:${tileSig(state.map)}:${barriers(state.map).sig}:${state.map.regions.map((r) => (r.revealed ? 1 : 0)).join('')}:${this.ceiling}:${this.#pictureSig()}:${sightSig(state.sight)}`;
    this.#fetchPictures();
    if (tk !== this.terrainKey) { this.terrainKey = tk; this.#buildTerrain(); }
    else if (this.wallsDirty) { this.wallsDirty = false; this.#buildWalls(true); }
    const removed = new Set([...idsOf('removed'), ...idsOf('vanished')]), appeared = new Set([...idsOf('spawned'), ...idsOf('revealed'), ...idsOf('placed')]);
    this.fell = idsOf('fell');
    for (const [id, a] of this.actors) if (!state.entities[id]) {
      if (!snap && removed.has(id) && !a.unseen) { this.#ghost(a, { t0: now, dur: SECS.vanish, el: a.el, label: true }); a.piece.show(false); }      // a removed creature fades out
      else { a.el.remove(); a.piece.free(); }
      a.blob.free(); a.dying?.piece.free(); a.pup?.dispose();
      this.actors.delete(id);
    }
    for (const e of Object.values(state.entities)) {
      let a = this.actors.get(e.id);
      const w = spot(state.map, e, e.pos), calm = snap || !!e.hidden;
      if (!a) {
        const el = document.createElement('div');
        el.className = 'label'; el.innerHTML = '<span></span><button type="button" class="alt" hidden></button><div class="bar"><i></i></div><em class="marks"></em>';
        // The height tag of a creature off the ground (fly-swim-control.md): a tap on it asks the app for the column of heights. The renderer only says which tag (a page event, as the arena flash is).
        el.querySelector('.alt').addEventListener('click', (ev) => { ev.stopPropagation(); window.dispatchEvent(new CustomEvent('hextable-height-tag', { detail: { id: e.id } })); });
        this.labels.append(el);
        a = { piece: new Piece(this, { order: 5, cast: true }), blob: new Piece(this, { flat: true, lit: 0, blend: true, order: 12, offset: true }).share(this.blobGeom), ...w, yaw: 0, way: [], el, key: '', fade: 1 };
        if (!calm) { a.fade = 0; a.hold = true; a.holdAt = now; }
        this.actors.set(e.id, a);
      }
      a.unseen = !!e.hidden;
      if (snap) a.lift = undefined;
      if (a.hold && (calm || appeared.has(e.id))) { a.hold = false; if (calm) a.fade = 1; else a.fadeTw = { from: 0, to: 1, t0: now, dur: SECS.appear }; }
      const mid = this.#modelOf(e);
      if (mid !== (a.pup?.id ?? null)) {
        a.pup?.dispose(); a.pup = null;
        if (mid) { a.pup = this.models.spawn(mid); a.pup.id = mid; this.scene.add(a.pup.root); a.pup.setBase(this.#base(a, e, a.pup), true); a.pup.update(0); }
        a.key = '';
      }
      if (a.pup && snap) { const want = this.#base(a, e, a.pup); if (want !== a.pup.base) a.pup.setBase(want, true); }       // at pace instant (and on a new map) a fall or a getting up is not played, as a pawn's tilt is not
      a.size = e.size; a.prone = !!e.cond.prone && e.hp > 0 && !e.dead;
      const key = `${e.dead}|${e.side}|${e.size}|${this.G.kind}|${a.pup ? 1 : 0}`; a.k = girth(e, this.G);
      if (key !== a.key) {
        const dies = !calm && a.key !== '' && e.dead && a.wasDead === false;
        if (dies) { const gp = new Piece(this, { order: 5, cast: true }).set(makePawn({ ...e, dead: false }, this.theme, this.G)); a.dying?.piece.free(); a.dying = { piece: gp, t0: now, dur: SECS.fall }; }
        a.key = key; a.piece.set(a.pup ? makeBase(e, this.theme, this.G) : makePawn(e, this.theme, this.G));
      }
      a.wasDead = !!e.dead;
      a.el.dataset.side = e.side; a.el.classList.toggle('dead', e.dead); a.el.classList.toggle('down', !e.dead && e.hp <= 0); a.el.classList.toggle('unseen', !!e.hidden);
      const sf = ground(state.map, e.pos) ? null : under(state.map, e.pos);
      const shown = e.form?.name ? `${e.name} (${e.form.name})` : e.name;             // a druid in Wild Shape: 'Wren (Brown Bear)'
      a.el.firstChild.textContent = shown;
      { const tag = a.el.querySelector('.alt'), up = sf && !e.dead ? e.pos.z - sf.z : 0; tag.hidden = !(up > 0); if (up > 0) { tag.textContent = `\u2191${up} ft`; tag.setAttribute('aria-label', `${shown}: ${up} ft up. Choose a height`); } }
      a.el.querySelector('i').style.width = `${hpFraction(e) * 100}%`;
      const marks = e.dead ? [] : [e.hp <= 0 && !e.cond.stable && 'dying', e.cond.prone && e.hp > 0 && 'prone', e.cond.dodging && 'dodging', e.follow && !state.encounter && 'following'].filter(Boolean);
      const mk = marks.join();
      if (mk !== a.marks) { a.marks = mk; a.el.lastChild.replaceChildren(...marks.map((m) => Object.assign(document.createElement('b'), { className: m, textContent: MARKS[m] }))); }
      const tilt = e.dead ? 1.45 : e.hp <= 0 ? 1.2 : e.cond.prone ? 0.9 : 0;
      if (a.tilt === undefined || calm) { a.tilt = tilt; a.tiltNow = tilt; a.tiltTw = null; }
      else if (tilt !== a.tilt) {
        a.tiltTw = { from: a.tiltNow, to: tilt, t0: now, dur: tilt < a.tilt ? SECS.stand : e.dead || e.hp <= 0 ? SECS.fall : SECS.prone };
        a.tilt = tilt;
      }
      const floor = e.dead || ground(state.map, e.pos) ? null : under(state.map, e.pos);
      a.air = floor ? Math.max(0, w.y - this.#stand({ q: e.pos.q, r: e.pos.r, z: floor.z }).y) : 0;
    }
    for (const ev of events) {
      const a = this.actors.get(ev.id);
      if (ev.type === 'moved' && a) for (const h of ev.path) a.way.push(spot(state.map, state.entities[ev.id], h));
      // A rider climbs on: it walks to its mount's place (then rides, #ride); on getting down it walks to where it lands, from the saddle.
      const here = (x) => (this.G.kind === 'hex' ? this.#stand(x.pos) : spot(state.map, x, x.pos));
      if (ev.type === 'mounted' && a && !snap && !a.unseen && state.entities[ev.mount] && this.actors.has(ev.mount)) { a.boarding = true; a.way.push(here(state.entities[ev.mount])); }
      if (ev.type === 'dismounted' && a && !snap && !a.unseen && state.entities[ev.id]) a.way.push(here(state.entities[ev.id]));
      if (ev.type === 'placed' && a && !snap && !a.unseen && !a.hold && a.fade >= 1) {
        this.#ghost(a, { t0: now, dur: SECS.placed, el: null });
        a.fade = 0; a.fadeTw = { from: 0, to: 1, t0: now, dur: SECS.placed };
      }
      const hurt = this.actors.get(ev.target);
      if (ev.type === 'damage' && hurt && ev.amount > 0) { hurt.flash = FLASH; if (!snap) hurt.pup?.once('hit'); }
      if ((ev.type === 'attack' || ev.type === 'cast') && !snap) this.#strike(ev, state, now);
      if (ev.type === 'attack' && hurt && ev.hit && ev.crit) { hurt.shake = SHAKE; hurt.flash = FLASH; }
    }
    for (const e of Object.values(state.entities)) {
      const a = this.actors.get(e.id), w = this.G.kind === 'hex' ? this.#stand(e.pos) : spot(state.map, e, e.pos);
      if (e.riding && this.actors.has(e.riding.on) && !a.boarding) continue;       // a rider is where its mount is drawn (#ride); the frame sets it
      // on hexes a big creature is put at its own hex here, on squares at the middle of its squares
      if (!a.way.length && (Math.abs(a.x - w.x) > 0.01 || Math.abs(a.z - w.z) > 0.01)) Object.assign(a, w);
      const yy = spot(state.map, e, e.pos).y;
      if (!a.way.length && Math.abs(a.y - yy) > 0.01) {
        if (!snap && !a.unseen && this.fell.has(e.id) && yy < a.y) a.fall = { from: a.y, to: yy, t0: now, dur: SECS.drop, ease: accel };
        else if (!a.fall) { a.y = yy; }
      }
    }
    this.#buildOverlay();
  }
  // ---------- models (R12) ----------
  // The model a creature is drawn with now: the first time one is wanted the loader is made and the load started. The id when it is ready,
  // null while it loads (the pawn is drawn) and when the creature has none.
  #modelOf(e) {
    const pack = this.modelMode === 'off' ? null : this.theme.models;
    if (!pack) return null;
    const id = modelFor(pack, e, (tpl) => CONTENT.monsters[tpl]?.type);
    if (!id) return null;
    if (this.models?.pack !== pack) { this.#dropModels(); this.models = new Models(THREE, pack, this.u, { onReady: () => this.#modelsReady() }); }
    return this.models.want(id) ? id : null;
  }
  // A model has loaded (or failed, and the pawn stays): the creatures that wait for it are drawn again.
  #modelsReady() {
    if (this.dead || !this.state) return;
    for (const a of this.actors.values()) a.key = '';
    this.setState(this.state, []);
  }
  #dropModels() {
    for (const a of this.actors.values()) { a.pup?.dispose(); a.pup = null; a.key = ''; }
    this.models = null;
  }
  // What a model does while nothing else is asked of it.
  #base(a, e, p) {
    if ((e.dead || e.hp <= 0) && p.has('die')) return 'die';
    const air = a.air > 0 && !!p.def.clips?.fly;
    return a.way.length ? (air ? 'fly' : p.has('run') ? 'run' : 'walk') : air ? 'fly' : 'idle';
  }
  // An attack or a spell: its maker turns to the target and plays the clip (a far target is shot at); a melee blow also steps in.
  #strike(ev, state, now) {
    const who = this.actors.get(ev.actor), p = who?.pup;
    if (!p) return;
    const tid = ev.type === 'attack' ? ev.target : ev.targets?.[0], t = this.actors.get(tid), te = state.entities[tid], me = state.entities[ev.actor];
    let dx = 0, dz = 0, d = 0;
    if (t && t !== who) { dx = t.x - who.x; dz = t.z - who.z; d = Math.hypot(dx, dz); if (d > 0.01 && !who.way.length) who.face = Math.atan2(dx, dz); }
    const far = ev.type === 'attack' && me && te && this.G.dist(me.pos, te.pos) > 1;
    const len = p.once(ev.type === 'cast' ? 'cast' : far ? 'shoot' : 'attack');
    if (len > 0 && ev.type === 'attack' && !far && d > 0.01) who.lunge = { x: dx / d, z: dz / d, t0: now, dur: len };
  }
  // A creature that stays on screen a moment after it is gone from where it was: it fades out as a copy of its pawn (its geometry is shared).
  #ghost(a, g) {
    const piece = new Piece(this, { order: 5, cast: true }).share(a.piece);
    this.ghosts.push({ piece, src: a, x: a.x, y: a.y, z: a.z, lift: a.lift ?? 0, yaw: a.yaw, tiltNow: a.tiltNow ?? 0, k: a.k ?? 1, ...g });
  }

  #flashEdge(hex) {
    const st = this.state, cols = st ? arenaFlashCells(st.map, st.encounter, hex, this.ceiling) : [];
    if (!cols.length) return;
    this.flash.set(buildEdge({ map: st.map, enc: st.encounter, theme: this.theme, ceiling: this.ceiling, only: new Set(cols), tall: 1.1 }).b); this.flashAt = this.now;
  }
  #syncEdge(events, snap, now) {
    const enc = this.state.encounter, eid = enc ? enc.id ?? 0 : null;
    if (eid !== this.edgeId) {
      const old = this.edgeId !== null;
      if (old) {
        this.sinkFx?.piece.free();
        this.sinkFx = !snap ? { piece: this.edge, base: this.edgeBase, phase: 'hold', t0: now, since: now } : (this.edge.free(), null);
        this.edge = new Piece(this, { flat: true, lit: 0, blend: true, order: 14 });
      }
      this.edgeId = eid;
      this.edgeFx = { phase: eid === null || snap ? 'on' : 'hold', t0: now, since: now };
    }
    for (const ev of events) {
      if (ev.type === 'encounterStart' && this.edgeFx.phase === 'hold') this.edgeFx = { phase: 'rise', t0: now, since: now };
      if (ev.type === 'encounterEnd' && this.sinkFx?.phase === 'hold') this.sinkFx.phase = 'sink', this.sinkFx.t0 = now;
    }
  }
  #syncDoors(events, snap, now) {
    const map = this.state.map, live = new Set();
    for (const o of map.objects) {
      if (!objectSegment(o, this.G)) continue;
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
  #syncVeils(events, snap, now) {
    const map = this.state.map, shown = new Set(map.regions.filter((r) => r.revealed).map((r) => r.id));
    if (!this.seenRegions || snap) { for (const v of this.veils.values()) v.piece.free(); this.veils.clear(); this.seenRegions = shown; return; }
    for (const [id, v] of this.veils) if (!shown.has(id)) { v.piece.free(); this.veils.delete(id); }
    for (const r of map.regions) if (r.revealed && !this.seenRegions.has(r.id)) this.veils.set(r.id, { piece: new Piece(this, { flat: true, lit: 0, blend: true, order: 16 }).set(makeVeil(map, r)), alpha: 1, tw: null, since: now });
    this.seenRegions = shown;
    for (const ev of events) { const v = ev.type === 'region' && this.veils.get(ev.region); if (v && !v.tw) v.tw = { from: 1, to: 0, t0: now, dur: SECS.region }; }
  }

  settle() { this.now = clock(); this.#finish(true); }
  #finish(build) {
    for (const a of this.actors.values()) {
      a.tiltTw = null; a.tiltNow = a.tilt; a.fadeTw = null; a.hold = false; a.fade = 1;
      if (a.fall) { a.y = a.fall.to; a.fall = null; }
      if (a.dying) { a.dying.piece.free(); a.dying = null; }
    }
    for (const g of this.ghosts) this.#dropGhost(g);
    this.ghosts = [];
    for (const d of this.doors.values()) if (d.tw || d.v !== d.goal) { d.v = d.goal; d.tw = null; this.wallsDirty = true; }
    for (const v of this.veils.values()) v.piece.free();
    this.veils.clear();
    this.edgeFx = { phase: 'on', t0: this.now };
    if (this.sinkFx) { this.sinkFx.piece.free(); this.sinkFx = null; }
    if (build && this.wallsDirty && this.state) { this.wallsDirty = false; this.#buildWalls(true); }
  }
  #dropGhost(g) { if (g.label) { g.el.remove(); g.src.piece.free(); } g.piece.free(); }

  setCeiling(z) { if (z !== this.ceiling) { this.ceiling = z; this.terrainKey = ''; if (this.state) this.setState(this.state, []); } }
  setHighlights(hl) { this.hl = { move: [], area: [], range: [], areaBad: false, targets: [], allies: [], selected: null, turn: null, column: null, plane: null, ...hl }; if (this.state) this.#buildOverlay(); }
  focus(id, snap = false) {
    const a = this.actors.get(id); if (!a) return;
    const end = a.way.length ? a.way[a.way.length - 1] : a;
    if (snap) { this.cam.x = end.x; this.cam.z = end.z; this.cam.goal = null; } else this.cam.goal = { x: end.x, z: end.z };
  }
  planeHex(px, py, feet = 0) { const p = this.#plane(px, py, feet); return p && this.G.fromWorld(p[0], p[1]); }
  planePoint(px, py, feet = 0) { const p = this.#plane(px, py, feet); return p && [p[0] / UNIT, p[1] / UNIT]; }
  #plane(px, py, feet) {
    const C = this.C; if (!C) return null;
    const d = this.#dir(C, px, py), t = (surfY(feet) - C.eye[1]) / d[1];
    if (!(t > 0) || t > 400) return null;
    return [C.eye[0] + d[0] * t, C.eye[2] + d[2] * t];
  }
  // The direction of the ray through a canvas pixel: Three unprojects it (the inset is in the projection matrix).
  #dir(C, px, py) {
    const v = new THREE.Vector3((px / this.canvas.clientWidth) * 2 - 1, 1 - (py / this.canvas.clientHeight) * 2, 0.5).unproject(this.camera);
    return norm([v.x - C.eye[0], v.y - C.eye[1], v.z - C.eye[2]]);
  }
  // The camera's turn about the board and its height above it (radians), read-only: the dice lie in the board's plane as seen from here.
  cameraAngles() { return { yaw: this.cam.yaw, pitch: this.cam.pitch, turns: this.turns }; }
  screenAxes() {
    const C = this.C ?? this.#camera(), u = (a) => { const l = Math.hypot(a[0], a[2]) || 1; return [a[0] / l, a[2] / l]; };
    return { right: u(C.r), up: u(C.f) };
  }
  setPins(points, levelZ = 0) { this.pins = points.map((p) => [...p]); this.pinZ = levelZ; if (this.state) this.#buildOverlay(); }
  setBars(bars, levelZ = 0) { this.bars = bars; this.barZ = levelZ; if (this.state) this.#buildOverlay(); }
  screenPoint(x, y, feet = 0) { return this.C ? this.#project(this.C, x * UNIT, surfY(feet), y * UNIT) : null; }
  hasPicture(levelId) {
    const l = this.state?.map.levels.find((x) => x.id === levelId);
    return !!l?.image && this.images.get(l.image.asset)?.state === 'ready';
  }
  zonesAt(hex) {
    if (!hex || !this.state) return [];
    return (this.state.effects ?? []).filter((fx) => { const zh = zoneHexes(this.state, fx); return zh?.hexes.some((h) => h.q === hex.q && h.r === hex.r); }).map((fx) => fx.name);
  }
  screenOf(hex, up = 0) { const w = this.#stand(hex); return this.C ? this.#project(this.C, w.x, w.y + up, w.z) : null; }       // `up`: drawing units above the floor (a rider's saddle)
  screenOfPawn(id, up = 0) { const a = this.actors.get(id); return a && this.C ? this.#project(this.C, a.x, a.y + up, a.z) : null; }       // where a pawn is drawn, `up` drawing units over its foot (the smoke script's, to tap a rider and a mount apart)
  rotate(d) { this.cam.yaw += d; this.#turned(); }
  // The follow camera (docs/specs/keyboard.md): turn, eased, to look along `yaw`; `snap` at once (reduced motion). A manual turn cancels it.
  face(yaw, snap = false) {
    const c = this.cam, goal = c.yaw + Math.atan2(Math.sin(yaw - c.yaw), Math.cos(yaw - c.yaw));
    if (snap) { c.yaw = goal; c.yawGoal = null; } else c.yawGoal = goal;
  }
  tilt(d) { this.cam.pitch = Math.max(0.45, Math.min(1.45, this.cam.pitch + d)); this.#turned(); }
  #turned() { this.cam.yawGoal = null; this.turns++; }
  zoom(f) { this.cam.dist = Math.max(7, Math.min(48, this.cam.dist * f)); }
  stats() {
    const f = this.frameTimes, s = [...f].sort((a, b) => a - b);
    return { frameMs: s.length ? s[s.length >> 1] : 0, quality: this.gov.step, pixelRatio: this.gov.ratio, drawCalls: this.drawCalls, shadows: this.sh.on, shadowMode: this.shMode, shadowCalls: this.sh.calls, shadowPasses: this.sh.passes, shadowSize: this.sh.on ? this.sh.size : 0 };
  }
  dispose() {
    if (this.dead) return;
    this.dead = true; cancelAnimationFrame(this.raf); this.ro.disconnect(); this.off?.(); window.removeEventListener('hextable-shadows', this.onShadows); window.removeEventListener('hextable-arena-flash', this.onFlash); this.#shadowFree();
    for (const a of this.actors.values()) { a.el.remove(); a.piece.free(); a.blob.free(); a.dying?.piece.free(); a.pup?.dispose(); }
    this.models = null;
    for (const g of this.ghosts) this.#dropGhost(g);
    for (const v of this.veils.values()) v.piece.free();
    for (const f of this.floaters) f.el.remove();
    for (const p of [this.terrain, this.wallMesh, this.grid, this.overlay, this.shadows, this.edge, this.flash, this.doorMesh, this.blobGeom, this.sinkFx?.piece]) p?.free();
    this.#clearPictures();
    for (const r of this.images.values()) r.tex?.dispose();
    this.actors.clear(); this.floaters = []; this.state = null;
    this.three.dispose();
  }
  #measure(ms, now) {
    this.frameTimes.push(ms); if (this.frameTimes.length > 120) this.frameTimes.shift();
    this.drawCalls = this.three.info.render.calls;
    if (this.gov.sample(ms, now) !== null) { this.#applyLevel(); this.#resize(); }
  }
  floater(id, text, cls = '', delay = 0) {
    const el = document.createElement('div');
    el.className = `floater ${cls}`; el.textContent = text; el.style.visibility = 'hidden';
    this.labels.append(el);
    this.floaters.push({ id, el, t: -delay, life: 1.5 });
  }

  // ---------- building ----------
  #stand(h) { return stand(this.state.map, h); }
  #makeBlob() { this.blobGeom.set(makeBlob(this.theme)); this.blobGeom.show(false); for (const a of this.actors.values()) a.blob.share(this.blobGeom); }

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
  async #loadPicture(id, tries) {
    const rec = { state: 'loading', tex: null, at: performance.now(), tries };
    this.images.set(id, rec);
    try {
      const img = new Image();
      img.src = await this.assetUrl(id);
      await img.decode();
      const max = Math.min(2048, this.three.capabilities.maxTextureSize), pot = (n) => 2 ** Math.max(0, Math.min(Math.log2(max), Math.round(Math.log2(Math.max(1, n)))));
      const cv = document.createElement('canvas');
      cv.width = pot(img.naturalWidth); cv.height = pot(img.naturalHeight);
      const g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, cv.width, cv.height);
      const tex = new THREE.CanvasTexture(cv);
      tex.flipY = false; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      rec.tex = tex; rec.state = 'ready';
      if (this.dead) { tex.dispose(); return; }
      if (this.state) this.setState(this.state, []);
      this.onPicture?.();
    } catch {
      rec.state = 'failed'; rec.at = performance.now();
      if (tries < 3) setTimeout(() => this.state && !this.dead && this.#fetchPictures(), RETRY_MS + 100);
    }
  }
  #clearPictures() { for (const m of this.picMeshes) { this.scene.remove(m); m.geometry.dispose(); this.receivers.delete(m.material); m.material.dispose(); } this.picMeshes = []; }

  #buildTerrain() {
    const s = this.state, built = buildTerrain({ map: s.map, enc: s.encounter, sight: s.sight, theme: this.theme, ceiling: this.ceiling, hasPicture: (id) => this.hasPicture(id) });
    this.#clearPictures();
    for (const p of built.pictures) {                                      // a level's picture: a textured quad, lit by the hour and fogged like the rest
      const g = new THREE.BufferGeometry(), { x0, x1, z0, z1, y } = p;
      g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0], 2));
      const m = new THREE.ShaderMaterial({ uniforms: { uFog: this.u.fog, uSky: this.u.sky, uGrade: this.u.grade, uLight: this.u.light, uTex: { value: this.images.get(p.asset)?.tex }, ...this.u.sh }, vertexShader: VS_PIC, fragmentShader: FS_PIC, side: THREE.DoubleSide });
      m.defines = this.sh.on ? { SHADOWS: '' } : {}; this.receivers.add(m);
      const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.matrixWorldAutoUpdate = false; mesh.renderOrder = 1;
      this.scene.add(mesh); this.picMeshes.push(mesh);
    }
    this.floorData = built.floorData; this.#measureBoard(built.terrain.d);
    this.terrain.set(built.terrain); this.grid.set(built.grid); this.shadows.set(built.shadows);
    const e = buildEdge({ map: s.map, enc: s.encounter, theme: this.theme, ceiling: this.ceiling }); this.edge.set(e.b); this.edgeBase = e.base;
    this.#buildWalls(true);
  }
  #buildWalls(force = false) {
    const cut = cutSetFor(this.theme, this.floorData, this.cam.yaw), sig = cut ? [...cut].sort().join() : '';
    this.cutYaw = this.cam.yaw;
    if (!force && sig === this.cutSig) return;
    this.cutSig = sig; this.wallsDirty = false;
    const { b, doorInfo } = buildWalls({ map: this.state.map, theme: this.theme, ceiling: this.ceiling, floorData: this.floorData, cut, doors: this.doors });
    this.doorInfo = doorInfo;
    this.wallMesh.set(b);
  }
  #buildOverlay() {
    const b = buildOverlay({ state: this.state, hl: this.hl, theme: this.theme, pins: this.pins, pinZ: this.pinZ, bars: this.bars, barZ: this.barZ });
    this.overlay.set(b); this.overlayX.set(b.through);
    this.#columnLabels();
  }
  // The height numbers on the side of a flyer's column: at every 10 ft, on the picked block and on the ground (fly-swim-control.md, "Cost on the column").
  #columnLabels() {
    const col = this.hl.column, want = col ? col.blocks.filter((k) => k.picked || k.ground || k.hover || Math.round(k.ft) % 10 === 0) : [];
    while (this.colEls.length > want.length) this.colEls.pop().el.remove();
    while (this.colEls.length < want.length) { const el = document.createElement('div'); el.className = 'label col-label'; this.labels.append(el); this.colEls.push({ el }); }
    want.forEach((k, i) => {
      const c = this.colEls[i], bx = blockBox(this.state.map, col.at, k.z);
      Object.assign(c, { x: bx.x, y: (bx.y0 + bx.y1) / 2, z: bx.z });
      c.el.textContent = k.ground ? 'Ground' : `${k.ft} ft`; c.el.classList.toggle('picked', !!k.picked); c.el.dataset.ft = String(k.ft);
    });
  }
  // The block of the column, or the place of the plane, that the ray through a pixel meets first: { block: z } or { hex, plane: true }, with how far along the ray (t).
  #pickFly(px, py) {
    const C = this.C, col = this.hl.column, pl = this.hl.plane; if (!C || !this.state || (!col && !pl)) return null;
    const d = this.#dir(C, px, py), e = C.eye;
    let best = null;
    if (col) {
      const R = BLOCK.r * Math.hypot(...this.G.corners({ q: 0, r: 0 })[0]) * UNIT * 0.93;       // a cylinder just inside the prism
      for (const k of col.blocks) {
        const bx = blockBox(this.state.map, col.at, k.z), ox = e[0] - bx.x, oz = e[2] - bx.z;
        // A block drawn smaller than a thumb is picked over an area 1.5 times as tall (heights.js, growFor); where two grown areas overlap, the block whose middle is nearer the point wins.
        const p0 = this.#project(C, bx.x, bx.y0, bx.z), p1 = this.#project(C, bx.x, bx.y1, bx.z), tall = p0 && p1 ? Math.abs(p0.y - p1.y) : THUMB, g = (growFor(tall) - 1) * (bx.y1 - bx.y0) / 2;
        bx.y0 -= g; bx.y1 += g;
        const off = p0 && p1 ? Math.abs(py - (p0.y + p1.y) / 2) : 0;
        const a = d[0] * d[0] + d[2] * d[2], b = 2 * (ox * d[0] + oz * d[2]), c = ox * ox + oz * oz - R * R, disc = b * b - 4 * a * c;
        let t = null;
        if (a > 1e-9 && disc >= 0) { const t1 = (-b - Math.sqrt(disc)) / (2 * a), y = e[1] + d[1] * t1; if (t1 > 0 && y >= bx.y0 && y <= bx.y1) t = t1; }
        if (t === null && d[1] < 0) { const tc = (bx.y1 - e[1]) / d[1], x = e[0] + d[0] * tc - bx.x, z = e[2] + d[2] * tc - bx.z; if (tc > 0 && x * x + z * z <= R * R) t = tc; }
        if (t !== null && (!best || off < best.off)) best = { t, off, block: k.z };
      }
    }
    if (pl && !pl.ground && !pl.faint && d[1] < 0) {
      const t = (planeY(pl.z) - e[1]) / d[1];
      if (t > 0 && (!best || t < best.t)) {
        const h = this.G.fromWorld(e[0] + d[0] * t, e[2] + d[2] * t), cell = pl.cells.find((x) => x.h.q === h.q && x.h.r === h.r);
        if (cell) best = { t, hex: cell.h, plane: true, id: null };
      }
    }
    return best;
  }

  // ---------- shadows ----------
  // The governor's ladder for this device and setting: shadows are given up before any pixel ratio.
  #ladder() {
    const { levels, start } = shadowLevels(window.devicePixelRatio, { shadows: this.shMode, phone: this.phone });
    this.gov = createGovernor(levels, { start });
    this.#applyLevel();
  }
  // The setting changed (the Settings tab): 'auto', 'on' or 'off'.
  setShadows(mode) {
    if (!SHADOW_MODES.includes(mode) || mode === this.shMode) return;
    this.shMode = mode; this.#ladder(); this.#resize();
  }
  #applyLevel() {
    const on = !!(this.gov.level?.shadows ?? false);
    if (on === this.sh.on) return;
    this.sh.on = on;
    if (on) this.#shadowMake(); else this.#shadowFree();
    const defines = on ? { SHADOWS: '' } : {};
    for (const m of this.receivers) { m.defines = { ...defines }; m.needsUpdate = true; }
    this.u.sh.uSMap.value = on ? this.sh.rt.depthTexture : null;
  }
  #shadowMake() {
    const sh = this.sh, max = this.three.capabilities.maxTextureSize;
    sh.size = Math.min(max, this.phone ? 1024 : 2048);
    sh.rt = new THREE.WebGLRenderTarget(sh.size, sh.size, { depthBuffer: true });
    sh.rt.depthTexture = new THREE.DepthTexture(sh.size, sh.size);
    sh.rt.depthTexture.minFilter = sh.rt.depthTexture.magFilter = THREE.NearestFilter;
    sh.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 100); sh.cam.layers.set(1);
    sh.mat = new THREE.ShaderMaterial({ vertexShader: VS_DEPTH, fragmentShader: FS_DEPTH, side: THREE.DoubleSide, colorWrite: false });
    sh.key = '';
  }
  #shadowFree() {
    const sh = this.sh;
    sh.rt?.depthTexture?.dispose(); sh.rt?.dispose(); sh.mat?.dispose();
    sh.rt = null; sh.cam = null; sh.mat = null; sh.key = '';
  }
  // The board's extent, from the terrain's vertices (position is the first three of ten floats).
  #measureBoard(d) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < d.length; i += 10) { const x = d[i], y = d[i + 1], z = d[i + 2]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z; }
    if (x0 <= x1) this.bounds = { x0, x1, z0, z1, y0: Math.min(y0, 0), y1: y1 + 4 };       // walls and creatures stand up to four units above the highest floor
  }
  // Draws what casts into the shadow map, from the sun. It is redrawn only when something that casts has moved (or the box has), so a
  // table at rest costs nothing here.
  #shadowPass(c) {
    const sh = this.sh, L = this.u.light.value;
    const box = shadowBox({ bounds: this.bounds, focus: [c.x, c.y, c.z], dist: c.dist, size: sh.size, light: [L.x, L.y, L.z] });
    const cam = sh.cam, ctr = box.centre;
    cam.left = -box.half; cam.right = box.half; cam.top = box.half; cam.bottom = -box.half; cam.near = box.near; cam.far = box.far;
    cam.position.set(ctr[0] + L.x * box.back, ctr[1] + L.y * box.back, ctr[2] + L.z * box.back);
    cam.up.set(0, 1, 0); cam.lookAt(ctr[0], ctr[1], ctr[2]); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    this.u.sh.uSVP.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const bias = Math.max(0.03, box.texel * 2);
    this.u.sh.uSP.value.set(box.texel, 0.85, bias / (box.far - box.near), Math.max(1.5, Math.min(6, 0.1 / box.texel)));
    // has anything that casts changed? (a hash of where each caster is, which geometry it has, and the box)
    let h = 17;
    const mix = (v) => { h = (Math.imul(h, 31) + Math.round(v * 1000)) | 0; };
    for (const m of this.scene.children) if (m.layers.isEnabled(1)) { mix(m.visible ? 1 : 0); mix(m.geometry.id); for (const e of m.matrixWorld.elements) mix(e); }
    for (const a of this.actors.values()) if (a.pup) { mix(a.pup.sig()); for (const e of a.pup.root.matrix.elements) mix(e); }
    for (const e of this.u.sh.uSVP.value.elements) mix(e);
    if (h === sh.key) return;
    sh.key = h;
    const prev = { rt: this.three.getRenderTarget() };
    this.three.setRenderTarget(sh.rt);
    this.scene.overrideMaterial = sh.mat;
    this.three.render(this.scene, cam);
    this.scene.overrideMaterial = null;
    this.three.setRenderTarget(prev.rt);
    sh.calls = this.three.info.render.calls; sh.passes++;
  }

  // ---------- frame ----------
  #resize() {
    const dpr = this.gov.ratio, c = this.canvas;
    this.three.setPixelRatio(dpr);
    this.three.setSize(Math.max(1, c.clientWidth), Math.max(1, c.clientHeight), false);
  }
  // The camera: the eye on a sphere round the focus, a 0.75 rad lens, and the picture slid up by the inset.
  #camera() {
    const c = this.cam, cp = Math.cos(c.pitch), cam = this.camera;
    cam.position.set(c.x + c.dist * cp * Math.sin(c.yaw), c.y + c.dist * Math.sin(c.pitch), c.z + c.dist * cp * Math.cos(c.yaw));
    cam.up.set(0, 1, 0); cam.lookAt(c.x, c.y, c.z);
    cam.aspect = this.canvas.width / this.canvas.height; cam.updateProjectionMatrix();
    const shift = this.inset / (this.canvas.clientHeight || 1);
    cam.projectionMatrix.elements[9] = -shift;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    cam.updateMatrixWorld(true);
    const e = cam.matrixWorld.elements, vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse).elements;
    return { eye: [cam.position.x, cam.position.y, cam.position.z], r: [e[0], e[1], e[2]], u: [e[4], e[5], e[6]], f: [-e[8], -e[9], -e[10]], vp, shift };
  }
  #project(C, x, y, z) {
    const m = C.vp, w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= 0.1) return null;
    return { x: ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * 0.5 + 0.5) * this.canvas.clientWidth,
             y: (1 - ((m[1] * x + m[5] * y + m[9] * z + m[13]) / w * 0.5 + 0.5)) * this.canvas.clientHeight };
  }
  #frame(dt) {
    const th = this.theme, c = this.cam;
    this.#animate((this.now = clock()));
    if (c.yawGoal != null) { const d = c.yawGoal - c.yaw; if (Math.abs(d) < 0.002) { c.yaw = c.yawGoal; c.yawGoal = null; } else c.yaw += d * Math.min(1, dt * 6); }
    if (c.goal) { c.x += (c.goal.x - c.x) * Math.min(1, dt * 5); c.z += (c.goal.z - c.z) * Math.min(1, dt * 5); if (Math.hypot(c.goal.x - c.x, c.goal.z - c.z) < 0.02) c.goal = null; }
    for (const a of this.actors.values()) {
      let step = dt * 9 * Math.max(1, a.way.length / 5), walked = 0;
      while (a.way.length && step > 0) {
        const w = a.way[0], dx = w.x - a.x, dz = w.z - a.z, d = Math.hypot(dx, dz);
        if (d > 0.001) a.face = Math.atan2(dx, dz);
        if (d <= step) { Object.assign(a, { x: w.x, y: w.y, z: w.z }); a.way.shift(); step -= d; walked += d; }
        else { a.x += (dx / d) * step; a.z += (dz / d) * step; a.y += (w.y - a.y) * Math.min(1, step / d); walked += step; step = 0; }
      }
      if (a.face !== undefined) { const turn = Math.atan2(Math.sin(a.face - a.yaw), Math.cos(a.face - a.yaw)); a.yaw += turn * Math.min(1, dt * 16); }
      a.walk = a.way.length ? (a.walk ?? 0) + walked : 0;
      a.flash = Math.max(0, (a.flash ?? 0) - dt); a.shake = Math.max(0, (a.shake ?? 0) - dt);
      a.hop = a.way.length && !a.air ? 0.13 * Math.abs(Math.sin((Math.PI * a.walk) / 1.732)) : 0;
    }
    this.#ride(dt);
    this.#puppets(dt);
    const C = (this.C = this.#camera());
    const td = this.tod, k = Math.min(1, dt * 1.5);
    if (td) { const n = td.now, g = td.goal; td.now = { light: n.light.map((v, i) => v + (g.light[i] - v) * k), sky: n.sky + (g.sky - n.sky) * k }; }
    const lt = td?.now ?? { light: [1, 1, 1], sky: 1 }, sky = th.sky.map((v, i) => v * lt.sky * (0.5 + 0.5 * lt.light[i]));
    this.three.setClearColor(new THREE.Color().setRGB(sky[0], sky[1], sky[2], THREE.LinearSRGBColorSpace), 1);
    this.u.sky.value.set(...sky); this.u.grade.value.set(...lt.light); this.u.fog.value.set(c.dist + th.fog[0] * 0.5, th.fog[1]);
    if (!this.state) { this.three.clear(); return; }
    if (this.cutYaw === null || Math.abs(Math.atan2(Math.sin(c.yaw - this.cutYaw), Math.cos(c.yaw - this.cutYaw))) > 0.015) this.#buildWalls();
    this.#placeThings(dt);
    if (this.sh.on) this.#shadowPass(c);
    this.three.render(this.scene, this.camera);
    this.anim += dt;
    this.#labels(C, dt);
  }
  // Each model plays what its creature is doing: down, walking, flying, or standing; a blow or a hit has played once already (setState).
  #puppets(dt) {
    for (const [id, a] of this.actors) {
      const p = a.pup, e = this.state?.entities[id];
      if (!p || !e) continue;
      p.setBase(this.#base(a, e, p));
      p.update(dt);
    }
  }
  // A rider is drawn on its mount (docs/specs/companions.md, C10): where the mount is drawn, so the pair moves as one with no frame between,
  // and its pawn raised by the height of the mount's (`lift`, a drawing offset like `hop`; it eases, so mounting, a reveal and getting down are not jumps).
  // Only what the view sends is used: a rider shows `riding` only where the mount is sent too, and a mount shows `rider` likewise.
  #ride(dt) {
    const S = this.state;
    for (const a of this.actors.values()) a.carry = false;
    for (const [id, a] of this.actors) {
      const e = S?.entities[id], m = e?.riding && S.entities[e.riding.on], ma = m && this.actors.get(e.riding.on);
      if (a.boarding && !a.way.length) a.boarding = false;
      let want = 0;
      if (ma && ma !== a) {
        want = pawnHeight(this.theme, m, this.G) * Math.cos(Math.min(1.45, ma.tiltNow ?? 0));
        if (!a.boarding) { a.x = ma.x; a.y = ma.y; a.z = ma.z; a.way.length = 0; a.fall = null; a.yaw = ma.yaw; a.face = ma.face; a.hop = ma.hop; a.walk = ma.walk; }
        ma.carry = true;
      }
      a.rides = !!ma && ma !== a;
      a.lift = a.lift === undefined ? want : a.lift + (want - a.lift) * Math.min(1, dt * 12);
      if (Math.abs(a.lift - want) < 0.004) a.lift = want;
    }
  }
  // Puts every moving thing where it is now and sets how it is drawn: pawns (solid, fading, dying, ghosts), blob shadows, the arena edge, veils, doors.
  #placeThings() {
    const ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const pawn = (a, piece, alpha) => {
      const f = a.flash ? Math.min(1, a.flash / FLASH) : 0, sh = a.shake ? (a.shake / SHAKE) ** 2 * 0.16 * Math.sin(a.shake * 70) : 0, tl = a.tiltNow ?? 0;
      piece.place(model(a.x + sh * Math.cos(this.cam.yaw), a.y + (a.lift ?? 0) + 0.15 * Math.min(1, tl / 0.5) + (a.hop ?? 0), a.z - sh * Math.sin(this.cam.yaw), a.yaw, tl));
      if (f) piece.tint(1 + f * 1.4, 1 - f * 0.55, 1 - f * 0.55, alpha); else piece.tint(1, 1, 1, alpha);
      piece.mat.transparent = alpha < 1; piece.mat.depthWrite = true;
    };
    const puppet = (a, alpha) => {
      const p = a.pup, f = a.flash ? Math.min(1, a.flash / FLASH) : 0, sh = a.shake ? (a.shake / SHAKE) ** 2 * 0.16 * Math.sin(a.shake * 70) : 0;
      const tl = p.has('die') ? (a.prone ? Math.min(a.tiltNow ?? 0, 0.9) : 0) : a.tiltNow ?? 0;       // a model with a fall lies down by it; one without is tipped as a pawn is
      let lx = 0, lz = 0;
      if (a.lunge) { const k = (this.now - a.lunge.t0) / a.lunge.dur; if (k >= 1) a.lunge = null; else { lx = a.lunge.x * 0.4 * Math.sin(Math.PI * k); lz = a.lunge.z * 0.4 * Math.sin(Math.PI * k); } }
      const y = a.y + (a.lift ?? 0) + 0.15 * Math.min(1, tl / 0.5);
      p.scale = fit(p.entry.dim, a.size, this.G.kind);
      p.place(model(a.x + lx + sh * Math.cos(this.cam.yaw), y, a.z + lz - sh * Math.sin(this.cam.yaw), a.yaw, tl, p.scale));
      if (f) p.tint(1 + f * 1.4, 1 - f * 0.55, 1 - f * 0.55, alpha); else p.tint(1, 1, 1, alpha);
      p.show(true);
      a.piece.place(model(a.x, a.y + (a.lift ?? 0), a.z, a.yaw, 0)); a.piece.tint(1, 1, 1, alpha); a.piece.show(true);       // the token it stands on
    };
    for (const a of this.actors.values()) {
      const fading = a.fade < 1;
      if (a.pup) { puppet(a, fading ? a.fade : 1); a.dying?.piece.show(false); }
      else { a.piece.show(!(a.dying && fading)); pawn(a, a.piece, fading ? a.fade : 1); }
      if (a.dying && !a.pup) { a.dying.piece.show(true); pawn(a, a.dying.piece, 1 - Math.min(1, (this.now - a.dying.t0) / a.dying.dur)); }
      const k = a.k ?? 1, fade = 1 / (1 + a.air * 0.5);
      a.blob.show(!this.sh.on && !a.rides);       // a rider's shadow is its mount's
      a.blob.place(model(a.x - 0.14 * k, a.y - a.air + 0.016, a.z - 0.1 * k, 0, 0, 0.92 * k * (0.6 + 0.4 * fade))); a.blob.tint(1, 1, 1, fade * (a.fade ?? 1));
    }
    for (const g of this.ghosts) { pawn(g, g.piece, 1 - Math.min(1, (this.now - g.t0) / g.dur)); }
    let swinging = false;
    for (const d of this.doors.values()) if (d.tw) swinging = true;
    if (swinging) {
      const b = new Builder();
      for (const [id, info] of this.doorInfo) { const d = this.doors.get(id); if (d?.tw) swingDoor(b, info, tweenAt(d.tw, this.now).v); }
      this.doorMesh.set(b);
    } else if (this.doorMesh.n) this.doorMesh.set(new Builder());
    const fx = this.edgeFx, sk = this.sinkFx, enc = this.state.encounter;
    const edgeM = (rise, base) => [1, 0, 0, 0, 0, Math.max(0.001, rise), 0, 0, 0, 0, 1, 0, 0, (1 - rise) * base, 0, 1];
    if (enc && fx.phase !== 'hold') {
      const age = fx.phase === 'on' ? 9 : this.now - fx.t0, k = Math.min(1, age / SECS.rise), pulse = 0.82 + 0.18 * Math.sin(this.anim * 2.4), burst = Math.max(0, 1 - age / 1.6) * 0.8, rise = smooth(k);
      this.edge.show(true); this.edge.place(edgeM(rise, this.edgeBase)); this.edge.tint(1 + burst, 1 + burst, 1 + burst, k * k * pulse);
    } else this.edge.show(false);
    if (this.flashAt !== null) {                                                  // the flash of a refused move: two quick pulses over 1.1 s
      const age = this.now - this.flashAt;
      if (age > 1.1 || !enc) { this.flashAt = null; this.flash.show(false); }
      else { this.flash.show(true); this.flash.place(ident); this.flash.tint(1.5, 1.5, 1.5, Math.sqrt(1 - age / 1.1) * (0.8 + 0.2 * Math.cos(age * 11))); }
    }
    if (sk) {
      const p = sk.phase === 'hold' ? 0 : Math.min(1, (this.now - sk.t0) / SECS.sink), pulse = 0.82 + 0.18 * Math.sin(this.anim * 2.4), sink = 1 - smooth(p);
      sk.piece.place(edgeM(Math.max(0.001, sink), sk.base)); sk.piece.tint(1, 1, 1, (1 - p * p) * pulse);
    }
    for (const v of this.veils.values()) v.piece.tint(1, 1, 1, v.alpha);
    for (const p of [this.terrain, this.wallMesh, this.doorMesh, this.grid, this.shadows, this.overlay]) p.place(ident);
    for (const v of this.veils.values()) v.piece.place(ident);
  }
  #labels(C, dt) {
    for (const a of this.actors.values()) {
      // A mount with a rider drawn on it is named at its foot: the space above it is the rider's.
      const p = this.#project(C, a.x, a.y + (a.carry ? 0 : (a.lift ?? 0) + (1.95 - 1.05 * Math.min(1, (a.tiltNow ?? 0) / 0.9)) * (a.k ?? 1)), a.z);
      a.el.style.display = p ? '' : 'none';
      if (p) a.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, ${a.carry ? '6px' : '-100%'})`;
    }
    for (const c of this.colEls) { const p = this.#project(C, c.x, c.y, c.z); c.el.style.display = p ? '' : 'none'; if (p) c.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(34px, -50%)`; }
    this.floaters = this.floaters.filter((f) => {
      f.t += dt;
      if (f.t < 0) return true;
      const a = this.actors.get(f.id), k = f.t / f.life;
      const p = a && this.#project(C, a.x, a.y + (a.lift ?? 0) + 2.3 + k * 1.2, a.z);
      if (k >= 1 || !p) { f.el.remove(); return false; }
      f.el.style.visibility = 'visible'; f.el.style.opacity = String(Math.min(1, (1 - k) * 2.5));
      f.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
      return true;
    });
  }
  #animate(now) {
    for (const a of this.actors.values()) {
      if (a.tiltTw) { const r = tweenAt(a.tiltTw, now); a.tiltNow = r.v; if (r.done) a.tiltTw = null; }
      if (a.fadeTw) { const r = tweenAt(a.fadeTw, now); a.fade = r.v; if (r.done) a.fadeTw = null; }
      else if (a.hold && now - a.holdAt > HOLD_MAX) { a.hold = false; a.fade = 1; }
      if (a.fall) { const r = tweenAt(a.fall, now); a.y = r.v; if (r.done) a.fall = null; }
      if (a.dying && now - a.dying.t0 >= a.dying.dur) { a.dying.piece.free(); a.dying = null; }
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
      v.piece.free(); this.veils.delete(id);
    }
    const fx = this.edgeFx;
    if (fx.phase === 'hold' && now - fx.since > HOLD_MAX) this.edgeFx = { phase: 'on', t0: now };
    const sk = this.sinkFx;
    if (sk && (sk.phase === 'hold' ? now - sk.since > HOLD_MAX : now - sk.t0 >= SECS.sink)) { sk.piece.free(); this.sinkFx = null; }
    if (this.wallsDirty && this.state) this.#buildWalls(true);
  }

  // ---------- picking and input ----------
  // The hex-column march, as the old renderer had it (Decision 8); only the ray comes from Three.
  // A creature the ray meets as it is wins; only where it meets none, a finger's width is allowed (a widened cylinder in front must not steal a tap that is on another creature).
  #pick(px, py) {
    const fly = this.#pickFly(px, py);
    if (fly) return fly.block !== undefined ? { block: fly.block, hex: { ...this.hl.column.at, z: fly.block }, id: null } : fly;
    const exact = this.#march(px, py, false);
    if (exact?.id || !this.phone) return exact;
    const wide = this.#march(px, py, true);
    return wide?.id ? wide : exact;
  }
  #march(px, py, widen) {
    const C = this.C; if (!C || !this.state) return null;
    const d = this.#dir(C, px, py);
    const acts = [...this.actors].filter(([id]) => !this.state.entities[id]?.dead);
    // On a phone a creature is never narrower than 44 CSS pixels to a finger (Decision 4): its cylinder is widened to that where it is smaller.
    const pxUnit = this.canvas.clientHeight / (2 * Math.tan((this.camera.fov * Math.PI) / 360)), minR = widen ? (a) => 22 * Math.hypot(a.x - C.eye[0], a.y - C.eye[1], a.z - C.eye[2]) / pxUnit : () => 0;
    for (let t = 1; t < 140; t += 0.08) {
      const x = C.eye[0] + d[0] * t, y = C.eye[1] + d[1] * t, z = C.eye[2] + d[2] * t;
      // A ridden pair stands on one spot: the rider's pawn is the higher, so where both are met the rider is the one tapped.
      let top = null;
      for (const [id, a] of acts) {
        const y0 = a.y + (a.lift ?? 0);
        if (y > y0 && y < y0 + 1.7 * (a.k ?? 1) && Math.hypot(x - a.x, z - a.z) < Math.max(0.5 * (a.k ?? 1), minR(a)) && (!top || y0 > top.y0)) top = { id, y0 };
      }
      if (top) return { id: top.id, hex: this.state.entities[top.id].pos };
      const h = this.G.fromWorld(x, z), column = surfaces(this.state.map, h);
      for (let i = column.length - 1; i >= 0; i--) {
        const top = surfY(column[i].z, column[i].tile);
        if (y > top || (i > 0 && y < top - SLAB)) continue;
        const hex = { q: h.q, r: h.r, z: column[i].z };
        const here = Object.values(this.state.entities).filter((e) => !e.dead && e.pos.z === hex.z && footprint(e, e.pos, this.G).some((f) => f.q === hex.q && f.r === hex.r));
        const occ = here.find((e) => !e.riding) ?? here[0];       // on the ground of a ridden pair: the mount (the rider is on top of it)
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
      else if (stroke) { stroke = false; moved = 99; this.onDrag.cancel(); }
      pinch = null;
    }, on);
    el.addEventListener('pointermove', (e) => {
      const p = xy(e), old = pts.get(e.pointerId);
      if (!old) { if (e.pointerType === 'mouse') { const hit = this.#pick(...p); this.canvas.title = [...new Set(this.zonesAt(hit?.hex))].join(', '); this.onHover(hit?.hex ?? null, hit); } return; }
      pts.set(e.pointerId, p);
      if (stroke && pts.size === 1) { this.onDrag.move(...p); return; }
      const dx = p[0] - old[0], dy = p[1] - old[1];
      if (pts.size === 1) {
        moved += Math.abs(dx) + Math.abs(dy);
        if (moved < 8) return;
        if (e.buttons === 2 || e.shiftKey) { c.yaw -= dx * 0.008; c.pitch = Math.max(0.45, Math.min(1.45, c.pitch + dy * 0.006)); this.#turned(); }
        else {
          const k = c.dist * 0.0021; c.goal = null;
          c.x -= (Math.cos(c.yaw) * dx + Math.sin(c.yaw) * dy) * k; c.z -= (-Math.sin(c.yaw) * dx + Math.cos(c.yaw) * dy) * k;
        }
      } else if (pts.size === 2) {
        moved = 99;
        const [a, b] = [...pts.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]), ang = Math.atan2(a[1] - b[1], a[0] - b[0]);
        if (pinch) { this.zoom(pinch.dist / dist); c.yaw += ang - pinch.ang; if (ang !== pinch.ang) this.#turned(); }      // the map turns the way the fingers turn
        pinch = { dist, ang };
      }
    }, on);
    const up = (e) => {
      const p = pts.get(e.pointerId); pts.delete(e.pointerId); pinch = null;
      if (stroke) { stroke = false; if (e.type === 'pointerup') this.onDrag.end(); else this.onDrag.cancel(); return; }
      if (p && e.type === 'pointerup' && !pts.size && moved < 8 && performance.now() - downAt < 600 && e.button !== 2) {
        if (this.onPoint) { this.onPoint(p[0], p[1]); return; }
        const hit = this.#pick(...p); if (hit) this.onTap({ ...hit, pointer: e.pointerType });
      }
    };
    el.addEventListener('pointerup', up, on); el.addEventListener('pointercancel', up, on);
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY > 0 ? 1.1 : 0.9); }, { passive: false, signal: ac.signal });
  }
}
