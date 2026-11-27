// The one way the app gets a renderer (docs/specs/renderer.md, decision 7). `app.js` and `editor.js` use only the
// members in MEMBERS and nothing else; a test (test/renderer.test.js) reads both files and fails on any other.
//
// kind 'three' the Three.js renderer (render-three.js, docs/specs/renderer.md R11), the only one that draws since R14 step 2 (#355; step 1,
//             #348, made it the default). It is loaded with a dynamic import() the first time a page asks for it, so a page that chose
//             'none' never fetches vendor/.
// kind 'none' a renderer that draws nothing and implements the interface: the UI and the rules play without a picture.
//             Chosen by `?renderer=none` in the address or the device preference `hextable.renderer`.

// Methods, then properties, of the interface. Properties are read or set from outside; callbacks are set by the app.
export const METHODS = ['setState', 'settle', 'setTheme', 'setCeiling', 'setHighlights', 'focus', 'rotate', 'face', 'tilt', 'zoom', 'floater', 'planeHex', 'tapAt', 'tileHex', 'planePoint', 'screenOf', 'screenPoint', 'screenAxes', 'cameraAngles', 'zonesAt', 'hasPicture', 'setPins', 'setBars', 'stats', 'dispose'];
export const PROPS = ['inset', 'onTap', 'onHover', 'onPoint', 'onDrag', 'onPicture', 'assetUrl'];
export const MEMBERS = [...METHODS, ...PROPS];
export const KINDS = ['none', 'three'];

// Which renderer: the address (`?renderer=none`) first, then the device preference, else 'three'. An unknown word is 'three', so a device that
// stored 'gl' while the older renderer existed gets the 3D view.
export function rendererKind(search = '', pref) {
  let q = null;
  try { q = new URLSearchParams(search).get('renderer'); } catch { /* no address */ }
  const k = q ?? pref;
  return KINDS.includes(k) ? k : 'three';
}

// Draws nothing. It keeps what it was given so a test can see it, answers every question "nowhere", and never throws.
export class EmptyRenderer {
  constructor(canvas, labels, theme) {
    this.canvas = canvas; this.labels = labels; this.theme = theme;
    this.state = null; this.ceiling = Infinity; this.hl = null;
    this.inset = 0;
    this.onTap = () => {}; this.onHover = () => {}; this.onPoint = null; this.onDrag = null; this.onPicture = null; this.assetUrl = null;
  }
  setState(state) { this.state = state; }
  settle() {}
  setTheme(theme) { this.theme = theme; }
  setCeiling(feet) { this.ceiling = feet; }
  setHighlights(hl) { this.hl = hl; }
  focus() {}
  rotate() {}
  face() {}
  tilt() {}
  zoom() {}
  floater() {}
  planeHex() { return null; }
  tapAt() {}
  tileHex() { return null; }
  planePoint() { return null; }
  screenOf() { return null; }
  screenPoint() { return null; }
  screenAxes() { return { right: [1, 0], up: [0, -1] }; }
  cameraAngles() { return { yaw: 0, pitch: 0.95, turns: 0 }; }
  zonesAt() { return []; }
  hasPicture() { return false; }
  setPins() {}
  setBars() {}
  stats() { return { frameMs: 0, quality: 0, pixelRatio: 1, drawCalls: 0 }; }
  dispose() { this.state = null; }
}

// The Three.js renderer arrives after the page has asked for it, and `createRenderer` must answer at once. This stands in until it has
// loaded: calls that set something are kept (the latest of each, and the camera moves in order) and given to it, with the last state shown
// at once; questions answer "nowhere", as the empty renderer does. If the library or the renderer cannot start (no WebGL 2, a failed
// import), the table is not left blank: a plain message says why (`#gl-status`, shown from the first frame until the library has loaded:
// "Loading the 3D view"). Nothing else takes the canvas over: the rest of the table (the DM's controls, the log, the sheets) still works.
function status(text, failed) {
  const el = typeof document !== 'undefined' && document.getElementById('gl-status');
  if (!el) return;
  el.hidden = text === null;
  if (text === null) return;
  el.querySelector('#gl-status-text').textContent = text;
  el.classList.toggle('failed', !!failed);
}
const hasWebgl2 = () => { try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; } };
export class LazyThree {
  constructor(canvas, labels, theme) {
    this.canvas = canvas; this.labels = labels; this.inner = null; this.dead = false; this.kept = {}; this.moves = []; this.props = { inset: 0, onTap: () => {}, onHover: () => {}, onPoint: null, onDrag: null, onPicture: null, assetUrl: null };
    this.theme = theme; status('Loading the 3D view\u2026', false); this.ready = this.#load();
  }
  async #load() {
    try {
      if (!hasWebgl2()) throw new Error('WebGL 2 is not available');
      const { ThreeRenderer } = await import('./render-three.js');
      if (this.dead) return;
      this.#start(new ThreeRenderer(this.canvas, this.labels, this.kept.setTheme?.[0] ?? this.theme));
    } catch (err) {
      if (this.dead) return;
      console.warn(`The Three.js renderer could not start (${err.message}).`);
      status(hasWebgl2() ? 'The 3D view could not be loaded. Check the connection and reload the page.' : 'This game needs WebGL 2. Try a current Chrome, Safari or Firefox.', true);
    }
  }
  #start(r) {
    status(null);
    Object.assign(r, this.props);
    this.inner = r;
    for (const m of ['setCeiling', 'setHighlights', 'setPins', 'setBars']) if (this.kept[m]) r[m](...this.kept[m]);
    if (this.kept.setState) r.setState(this.kept.setState[0], [], { instant: true });
    for (const [m, args] of this.moves) r[m](...args);
    this.kept = {}; this.moves = [];
  }
  get kind() { return this.inner ? 'three' : null; }
  setState(...a) { if (this.inner) this.inner.setState(...a); else this.kept.setState = a; }
  settle() { this.inner?.settle(); }
  setTheme(...a) { this.theme = a[0]; if (this.inner) this.inner.setTheme(...a); else this.kept.setTheme = a; }
  setCeiling(...a) { if (this.inner) this.inner.setCeiling(...a); else this.kept.setCeiling = a; }
  setHighlights(...a) { if (this.inner) this.inner.setHighlights(...a); else this.kept.setHighlights = a; }
  setPins(...a) { if (this.inner) this.inner.setPins(...a); else this.kept.setPins = a; }
  setBars(...a) { if (this.inner) this.inner.setBars(...a); else this.kept.setBars = a; }
  focus(...a) { if (this.inner) this.inner.focus(...a); else this.moves.push(['focus', a]); }
  rotate(...a) { if (this.inner) this.inner.rotate(...a); else this.moves.push(['rotate', a]); }
  face(...a) { if (this.inner) this.inner.face(...a); else this.moves.push(['face', a]); }
  tilt(...a) { if (this.inner) this.inner.tilt(...a); else this.moves.push(['tilt', a]); }
  zoom(...a) { if (this.inner) this.inner.zoom(...a); else this.moves.push(['zoom', a]); }
  floater(...a) { this.inner?.floater(...a); }
  planeHex(...a) { return this.inner ? this.inner.planeHex(...a) : null; }
  tapAt(...a) { this.inner?.tapAt(...a); }
  tileHex(...a) { return this.inner ? this.inner.tileHex(...a) : null; }
  planePoint(...a) { return this.inner ? this.inner.planePoint(...a) : null; }
  screenOf(...a) { return this.inner ? this.inner.screenOf(...a) : null; }
  screenPoint(...a) { return this.inner ? this.inner.screenPoint(...a) : null; }
  screenAxes() { return this.inner ? this.inner.screenAxes() : { right: [1, 0], up: [0, -1] }; }
  cameraAngles() { return this.inner ? this.inner.cameraAngles() : { yaw: 0.5, pitch: 0.95, turns: 0 }; }
  zonesAt(...a) { return this.inner ? this.inner.zonesAt(...a) : []; }
  hasPicture(...a) { return this.inner ? this.inner.hasPicture(...a) : false; }
  stats() { return this.inner ? this.inner.stats() : { frameMs: 0, quality: 0, pixelRatio: 1, drawCalls: 0 }; }
  dispose() { this.dead = true; this.inner?.dispose(); }
}
for (const p of PROPS) Object.defineProperty(LazyThree.prototype, p, { get() { return this.inner ? this.inner[p] : this.props[p]; }, set(v) { this.props[p] = v; if (this.inner) this.inner[p] = v; } });

// The stand-in is also the smoke script's way to the Three.js renderer's insides (`window.hextable.R.cam`, `.floorData`, `.G`, `.actors`
// ...): a member the stand-in does not have is read from the renderer it holds.
// Only the app's interface (MEMBERS) is used by the app; a test pins that.
function transparent(lazy) {
  return new Proxy(lazy, {
    get(t, k) { if (k in t) { const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } const v = t.inner?.[k]; return typeof v === 'function' ? v.bind(t.inner) : v; },
    set(t, k, v) { t[k] = v; return true; },
  });
}

export function createRenderer(kind, canvas, labels, theme) {
  if (kind === 'none') return new EmptyRenderer(canvas, labels, theme);
  return transparent(new LazyThree(canvas, labels, theme));
}
