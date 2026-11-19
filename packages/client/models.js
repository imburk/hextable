// Creature models (docs/specs/renderer.md, Decision 4 and stage R12). Two halves.
//
// The first half is pure (it runs in Node under test): which model a creature gets from a theme's model pack, which clip of a model plays
// for a beat, and how big a model is drawn. The second half, `Models` and `Puppet`, needs the vendored Three.js and a browser; render-three.js
// imports this file only when a theme has a model pack and a creature first asks for one, so a page that draws no model never fetches it,
// nor the glTF loader, nor a model.
//
// A model pack is plain data in a theme (themes.js, `models`):
//   { base, rigs: { id: file }, models: { id: { file, rig?, clips: { beat: clip name }, speeds?: { beat: n } } },
//     byId: { monster id: model }, byType: { creature type: model }, byClass: { class word: model } }
// Files are under `base`, which is relative to the page.
import { SIZES } from './shared/content/sizes.js';
import { Builder, UNIT, girth } from './three-build.js';

// ---------- pure ----------

// The beats a model may have a clip for (Decision 4).
export const BEATS = ['idle', 'walk', 'run', 'fly', 'attack', 'shoot', 'cast', 'hit', 'dodge', 'fall', 'die', 'prone', 'stand'];
// What plays when a model has no clip for a beat: the first of these it has. No `shoot`: `attack` (the spec); no `die`: `fall`, and the other
// way about; no `run`: `walk`; no `cast`: `attack`, so a spell is at least a gesture. A beat with nothing is not played: the model keeps
// doing what it was, and the renderer does what the pawn does (moves the whole model).
const FALLBACK = { shoot: ['attack'], cast: ['attack'], die: ['fall'], fall: ['die'], run: ['walk'], walk: ['run'], fly: ['walk', 'run'], dodge: [], stand: [], prone: [], hit: [] };

// The clip for a beat from a model's table ({ beat: clip name }), or null. `stand` with no clip of its own is `die` or `fall` played
// backwards, which is what getting up is.
export function clipFor(clips, beat) {
  const find = (b, seen = new Set()) => {
    if (seen.has(b)) return null;
    seen.add(b);
    if (clips?.[b]) return clips[b];
    for (const f of FALLBACK[b] ?? []) { const r = find(f, seen); if (r) return r; }
    return null;
  };
  const own = find(beat);
  if (own) return { name: own, reverse: false };
  if (beat === 'stand') { const d = find('die'); if (d) return { name: d, reverse: true }; }
  return null;
}

// Which model of a pack a creature is drawn with (Decision 4): its monster's id, then its creature type (`typeOf(monster id)`), then the
// character's own `look.model`, then its class. null is the pawn. Only a model the pack really has is answered.
export function modelFor(pack, e, typeOf = () => null) {
  if (!pack?.models || !e) return null;
  const has = (id) => (typeof id === 'string' && Object.hasOwn(pack.models, id) ? id : null);
  if (e.tpl) {
    const own = has(pack.byId?.[e.tpl]); if (own) return own;
    const type = typeOf(e.tpl), byType = type && has(pack.byType?.[type]); if (byType) return byType;
  }
  const look = has(e.look?.model); if (look) return look;
  if (e.kind === 'pc') for (const w of String(e.cls ?? '').toLowerCase().match(/[a-z]+/g) ?? []) { const c = has(pack.byClass?.[w]); if (c) return c; }
  return null;
}

// How wide a creature's footprint is, in feet, by size: 5, 9, 15 and 19 across for 1, 3, 7 and 12 hexes (Decision 4); on squares a
// Large creature fills 2 by 2 and so on.
const ACROSS = { hex: { large: 9, huge: 15, gargantuan: 19 }, square: { large: 10, huge: 15, gargantuan: 20 } };
// Drawing units per unit of the model: its width to the footprint and its height to the size's height, whichever is smaller. `dim` is
// the model's own { w, h } (the wider of its width and depth, and its height) in its own units, measured standing.
export function fit(dim, size, gridKind = 'hex') {
  const s = SIZES[size] ?? SIZES.medium, across = ACROSS[gridKind]?.[size] ?? 5;
  return (Math.min(across / Math.max(dim.w, 1e-6), s.height / Math.max(dim.h, 1e-6)) || 1) * UNIT;
}

// The model address of a file in a pack: `base` is relative to the page, the file to the base.
export const urlOf = (pack, file, page = globalThis.location?.href ?? 'http://localhost/') => new URL(`${pack.base}${file}`, page).href;

// The token a model stands on: the pawn's foot disc (the side's colour), so friend and foe read as they do for a pawn.
export function makeBase(e, th, G) {
  const b = new Builder(G), k = girth(e, G), col = [...(th.sides[e.side] || th.sides.foe), 1];
  b.lathe(0, 0, 0, th.pawn.profile.slice(0, 3).map(([r, y]) => [r * k, y * k]), th.pawn.sides, th.pawn.sides === 4 ? Math.PI / 4 : 0, () => col);
  return b;
}

// The setting: the address (`?models=off|on`) first, then the device preference `hextable.models`, else on.
export function modelsMode(search = '', pref) {
  let q = null;
  try { q = new URLSearchParams(search).get('models'); } catch { /* no address */ }
  const k = q ?? pref;
  return k === 'off' ? 'off' : 'on';
}

// ---------- the browser half ----------

const VS = `
#include <common>
#include <skinning_pars_vertex>
uniform vec3 uLight; uniform vec2 uFog;
varying vec2 vUV; varying float vL; varying float vFog;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 w = modelMatrix * vec4(transformed, 1.0);
  vec3 n = normalize(mat3(modelMatrix) * objectNormal);
  vL = 0.56 + 0.5 * max(dot(n, uLight), 0.0);
  vUV = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
  vFog = clamp((gl_Position.w - uFog.x) / uFog.y, 0.0, 1.0);
}`;
// The same lighting, grade, fog and tint as a pawn (render-three.js): a colour from the picture and the material's colour, one light, the hour's
// grade, a tint for the hit flash and the fade, and the sky mixed in with distance. Colours are written as they are (the renderer does not
// convert them), so a picture is read as it is, with no conversion.
const FS = `
varying vec2 vUV; varying float vL; varying float vFog;
uniform vec3 uSky, uGrade, uBase, uEmit; uniform vec4 uTint; uniform sampler2D uTex; uniform float uHasTex;
void main() {
  vec4 t = uHasTex > 0.5 ? texture2D(uTex, vUV) : vec4(1.0);
  vec3 c = t.rgb * uBase * vL * uTint.rgb * uGrade + uEmit * uGrade;
  gl_FragColor = vec4(mix(c, uSky, vFog * 0.8), t.a * uTint.a);
}`;

const FADE = 0.15;       // seconds to cross from one clip to the next
const LOOPS = new Set(['idle', 'walk', 'run', 'fly']);

// One creature's model: a copy of the loaded model with its own skeleton, its own materials (the tint is its own) and its own mixer.
// `root` is what is placed in the scene (render-three.js sets its matrix); `body` is the model inside it, lifted so its feet are on the floor.
export class Puppet {
  constructor(THREE, lib, entry, uniforms, pack, def) {
    this.THREE = THREE; this.entry = entry; this.def = def; this.pack = pack;
    this.root = new THREE.Group(); this.root.matrixAutoUpdate = false; this.root.matrixWorldAutoUpdate = true;
    this.body = lib.SkeletonUtils.clone(entry.scene); this.body.position.y = -entry.foot;
    this.root.add(this.body);
    this.mats = new Map(); this.tintV = new THREE.Vector4(1, 1, 1, 1); this.meshes = [];
    this.body.traverse((o) => {
      if (!o.isMesh) return;
      const src = o.material;
      if (!this.mats.has(src)) {
        const emit = src.emissive && src.emissive.getHex() ? src.emissive : null;
        this.mats.set(src, new THREE.ShaderMaterial({
          uniforms: {
            uLight: uniforms.light, uGrade: uniforms.grade, uFog: uniforms.fog, uSky: uniforms.sky, uTint: { value: this.tintV },
            uTex: { value: src.map ?? null }, uHasTex: { value: src.map ? 1 : 0 },
            uBase: { value: emit && !src.map ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(src.color?.r ?? 1, src.color?.g ?? 1, src.color?.b ?? 1) },
            uEmit: { value: emit ? new THREE.Vector3(emit.r, emit.g, emit.b) : new THREE.Vector3(0, 0, 0) },
          },
          vertexShader: VS, fragmentShader: FS, side: src.side === THREE.DoubleSide ? THREE.DoubleSide : THREE.FrontSide,
        }));
      }
      o.material = this.mats.get(src); o.frustumCulled = false; o.layers.enable(1);       // layer 1: it casts a shadow
      this.meshes.push(o);
    });
    this.mixer = new THREE.AnimationMixer(this.body);
    this.actions = new Map(); this.cur = null; this.curKey = ''; this.base = 'idle'; this.shot = null; this.time = 0; this.heldDown = false;
    this.go('idle', {});
    this.mixer.update(0);
  }
  has(beat) { return !!clipFor(this.def.clips, beat); }
  #action(beat) {
    const c = clipFor(this.def.clips, beat);
    if (!c) return null;
    const clip = this.entry.clips.get(c.name);
    if (!clip) return null;
    let a = this.actions.get(c.name);
    if (!a) { a = this.mixer.clipAction(clip); this.actions.set(c.name, a); }
    return { a, reverse: c.reverse, clip, speed: (this.def.speeds?.[beat] ?? 1) };
  }
  // Starts a clip for a beat, crossing over from the one that plays. `hold`: stay on the last frame. Returns how long it plays, in seconds.
  go(beat, { once = false, hold = false, instant = false } = {}) {
    const x = this.#action(beat);
    if (!x) return 0;
    const { a, clip, reverse, speed } = x, THREE = this.THREE;
    const key = `${beat}`;
    if (this.cur && this.cur !== a) { if (instant) this.cur.stop(); else this.cur.fadeOut(FADE); }
    a.reset();
    a.setLoop(once || hold ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = hold || once;
    a.timeScale = (reverse ? -1 : 1) * speed;
    if (reverse) a.time = clip.duration;
    if (instant && hold && !reverse) a.time = clip.duration;
    if (instant) a.setEffectiveWeight(1); else a.fadeIn(FADE);
    a.play();
    this.cur = a; this.curKey = key;
    return clip.duration / speed;
  }
  // What it does while nothing else is asked: 'idle', 'walk', 'run', 'fly' or 'die' (down: it holds the last frame of the fall).
  setBase(beat, instant = false) {
    if (beat === this.base && !instant) return;
    const was = this.base; this.base = beat;
    this.shot = null;
    if (beat === 'die') { this.go('die', { hold: true, instant }); this.heldDown = true; return; }
    if (was === 'die' && !instant && this.has('stand')) {      // getting up: the fall, backwards, then on its feet
      const len = this.go('stand', { once: true });
      this.heldDown = false;
      if (len > 0) { this.shot = { beat: 'stand', until: this.time + len }; return; }
    }
    this.heldDown = false;
    this.go(beat, { instant });
  }
  // A beat that plays once and then the base again (attack, shoot, cast, hit). Not while it is down. Returns its length in seconds.
  once(beat) {
    if (this.base === 'die' || !this.has(beat)) return 0;
    const len = this.go(beat, { once: true });
    if (len > 0) this.shot = { beat, until: this.time + len };
    return len;
  }
  get busy() { return !!this.shot; }
  update(dt) {
    this.time += dt;
    if (this.shot && this.time >= this.shot.until) { this.shot = null; this.go(this.base, {}); }
    this.mixer.update(dt);
  }
  tint(r, g, b, a) { this.tintV.set(r, g, b, a); for (const m of this.mats.values()) { m.transparent = a < 1; m.depthWrite = true; } }
  place(matrix) { this.root.matrix.fromArray(matrix); this.root.matrixWorldNeedsUpdate = true; this.root.updateMatrixWorld(true); }
  show(v) { this.root.visible = v; }
  // A number that changes when the picture of this model does, for the shadow pass to know it must draw again.
  sig() { return this.root.visible ? Math.floor(this.time * 20) + 1 : 0; }
  dispose() { for (const m of this.mats.values()) m.dispose(); this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.body); this.root.removeFromParent(); }
}

// The models loaded for one theme's pack. `want(id)` starts a load the first time and says whether the model is ready; `onReady` is told
// when one has loaded (or failed, so the pawn is kept for good). Nothing is fetched until `want` is called.
export class Models {
  constructor(THREE, pack, uniforms, { onReady = () => {}, page } = {}) {
    this.THREE = THREE; this.pack = pack; this.u = uniforms; this.onReady = onReady; this.page = page;
    this.entries = new Map(); this.rigs = new Map(); this.lib = null; this.libP = null;
  }
  #libs() {
    return (this.libP ??= Promise.all([import('./vendor/three/GLTFLoader.js'), import('./vendor/three/SkeletonUtils.js')]).then(([g, s]) => { this.lib = { GLTFLoader: g.GLTFLoader, SkeletonUtils: s }; return this.lib; }));
  }
  state(id) { return this.entries.get(id)?.state ?? null; }
  want(id) {
    const def = this.pack.models[id];
    if (!def) return false;
    let e = this.entries.get(id);
    if (!e) { e = { state: 'loading' }; this.entries.set(id, e); this.#load(id, def, e).catch((err) => { e.state = 'failed'; e.error = String(err?.message ?? err); this.onReady(id, false); }); }
    return e.state === 'ready';
  }
  // The loader reads a texture inside a model through an image element, not its default (fetching a blob: address, which the page's
  // Content-Security-Policy, `connect-src 'self'`, refuses). A plugin is the loader's own way to change that.
  async #gltf(url) {
    const { GLTFLoader } = await this.#libs(), THREE = this.THREE, loader = new GLTFLoader();
    loader.register((parser) => { parser.textureLoader = new THREE.TextureLoader(parser.options.manager); return { name: 'hextable_texture_loader' }; });
    return loader.loadAsync(url);
  }
  async #rig(name) {
    if (!this.rigs.has(name)) this.rigs.set(name, this.#gltf(urlOf(this.pack, this.pack.rigs[name], this.page)).then((g) => g.animations));
    return this.rigs.get(name);
  }
  async #load(id, def, e) {
    const THREE = this.THREE, lib = await this.#libs();
    const [g, rig] = await Promise.all([this.#gltf(urlOf(this.pack, def.file, this.page)), def.rig ? this.#rig(def.rig) : []]);
    const clips = new Map();
    for (const c of [...rig, ...g.animations]) clips.set(c.name, c);
    g.scene.traverse((o) => { if (o.isMesh && o.material?.map) o.material.map.colorSpace = THREE.NoColorSpace; });      // read as they are
    // Its size, standing: the box of the idle pose (the file's own pose may be a T).
    const probe = lib.SkeletonUtils.clone(g.scene), holder = new THREE.Group(); holder.add(probe);
    const idle = def.clips?.idle && clips.get(def.clips.idle);
    if (idle) { const m = new THREE.AnimationMixer(probe); m.clipAction(idle).play(); m.update(0); }
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(probe, true), size = box.getSize(new THREE.Vector3());
    e.scene = g.scene; e.clips = clips; e.foot = box.min.y; e.dim = { w: Math.max(size.x, size.z), h: size.y };
    e.state = 'ready';
    this.onReady(id, true);
  }
  spawn(id) {
    const e = this.entries.get(id);
    if (!e || e.state !== 'ready') return null;
    return new Puppet(this.THREE, this.lib, e, this.u, this.pack, this.pack.models[id]);
  }
  dim(id) { return this.entries.get(id)?.dim ?? null; }
}
