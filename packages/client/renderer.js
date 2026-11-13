// The one way the app gets a renderer (docs/specs/renderer.md, decision 7). `app.js` and `editor.js` use only the
// members in MEMBERS and nothing else; a test (test/renderer.test.js) reads both files and fails on any other.
//
// kind 'gl'   today's hand-written WebGL renderer (render.js), the default.
// kind 'none' a renderer that draws nothing and implements the interface: the UI and the rules play without a picture.
//             Chosen by `?renderer=none` in the address or the device preference `hextable.renderer`.
// ('three' is the next one: render-three.js, docs/specs/renderer.md R11.)
import { Renderer } from './render.js';

// Methods, then properties, of the interface. Properties are read or set from outside; callbacks are set by the app.
export const METHODS = ['setState', 'settle', 'setTheme', 'setCeiling', 'setHighlights', 'focus', 'rotate', 'zoom', 'floater', 'planeHex', 'planePoint', 'screenOf', 'screenPoint', 'screenAxes', 'zonesAt', 'hasPicture', 'setPins', 'setBars', 'stats', 'dispose'];
export const PROPS = ['inset', 'onTap', 'onHover', 'onPoint', 'onDrag', 'onPicture', 'assetUrl'];
export const MEMBERS = [...METHODS, ...PROPS];
export const KINDS = ['gl', 'none'];

// Which renderer: the address (`?renderer=none`) first, then the device preference, else 'gl'. An unknown word is 'gl'.
export function rendererKind(search = '', pref) {
  let q = null;
  try { q = new URLSearchParams(search).get('renderer'); } catch { /* no address */ }
  const k = q ?? pref;
  return KINDS.includes(k) ? k : 'gl';
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
  zoom() {}
  floater() {}
  planeHex() { return null; }
  planePoint() { return null; }
  screenOf() { return null; }
  screenPoint() { return null; }
  screenAxes() { return { right: [1, 0], up: [0, -1] }; }
  zonesAt() { return []; }
  hasPicture() { return false; }
  setPins() {}
  setBars() {}
  stats() { return { frameMs: 0, quality: 0, pixelRatio: 1, drawCalls: 0 }; }
  dispose() { this.state = null; }
}

export function createRenderer(kind, canvas, labels, theme) {
  if (kind === 'none') return new EmptyRenderer(canvas, labels, theme);
  return new Renderer(canvas, labels, theme);
}
