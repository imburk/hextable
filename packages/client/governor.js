// The quality governor (docs/specs/renderer.md, "Phones"). Pure: no DOM, no clock of its own, no imports.
//
// It is fed the time of each frame and says when to step the pixel ratio. `levels` are the pixel ratios it may
// use, best first (the renderer gives it 2, 1.5 and 1 clamped to what the screen has, without repeats).
//
//   Down: the median of the last 120 frames stays above 28 ms for 2 seconds.
//   Up:   the median stays under 14 ms for 10 seconds.
//
// Three things keep it from bouncing between two levels:
//   - After a step the window is emptied, and no step is judged until 30 new frames are in, so a step is never
//     decided on frames drawn at the old ratio.
//   - The level it just left is not tried again for 2 minutes.
//   - A step up that is followed by a step down within a minute was a mistake: that level is not tried again at all,
//     until `reset()` (the renderer calls it when the canvas changes size, for a new screen shape may be cheaper).
// A screen locked to 60 Hz can never show a median under 14 ms, so "under 14 ms" would never come for it. The
// governor remembers the best median it has seen with a full window; if that was within 14 to 18 ms (the display's
// own rate) it counts as recovered at 12 % over it (a 60 Hz screen: 18.7 ms). A phone that never got near 60 stays at 14.
// A level is a number (a pixel ratio) or an object with a `ratio` (the Three.js renderer's ladder, `shadowLevels` below, which also
// says whether real shadows are drawn). `ratio` answers the number either way; `level` answers the whole entry. `start` is the step
// to begin on (a phone begins below its shadows and climbs to them only if the frames show headroom).
export const GOVERNOR = { downMs: 28, downSecs: 2, upMs: 14, upSecs: 10, window: 120, minFrames: 30, stall: 1000, undoSecs: 60, leaveSecs: 120 };

const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export function createGovernor(levels, opt = {}) {
  const C = { ...GOVERNOR, ...opt };
  let step = Math.max(0, Math.min(levels.length - 1, opt.start ?? 0)), frames = [], slowSince = null, fastSince = null, floorMs = Infinity, upAt = null;
  const banned = new Map();                     // step -> time before which it is not tried again
  const clear = () => { frames = []; slowSince = null; fastSince = null; };
  return {
    levels,
    get step() { return step; },
    get ratio() { return levels[step]?.ratio ?? levels[step]; },
    get level() { return levels[step]; },
    get median() { return frames.length ? median(frames) : 0; },
    reset() { banned.clear(); },
    // One frame took `ms` and ended at `now` seconds. Returns the new step if it changed, else null.
    sample(ms, now) {
      if (levels.length < 2) return null;
      if (!(ms >= 0) || ms > C.stall) { slowSince = null; fastSince = null; return null; }       // a hidden tab or a stall says nothing about drawing
      frames.push(ms); if (frames.length > C.window) frames.shift();
      if (frames.length < C.minFrames) return null;
      const med = median(frames);
      if (frames.length >= C.window) floorMs = Math.min(floorMs, med);
      const upLimit = floorMs >= C.upMs && floorMs <= 18 ? floorMs * 1.12 : C.upMs;
      if (med > C.downMs) {
        fastSince = null; slowSince ??= now;
        if (now - slowSince >= C.downSecs && step < levels.length - 1) {
          banned.set(step, upAt !== null && now - upAt < C.undoSecs ? Infinity : now + C.leaveSecs);
          step++; upAt = null; clear(); return step;
        }
      } else if (med < upLimit) {
        slowSince = null; fastSince ??= now;
        if (now - fastSince >= C.upSecs && step > 0 && now >= (banned.get(step - 1) ?? 0)) { step--; upAt = now; clear(); return step; }
      } else { slowSince = null; fastSince = null; }
      return null;
    },
  };
}

// The pixel ratios to offer a screen whose device pixel ratio is `dpr`: 2, 1.5, 1 as the most each step allows.
export function pixelLevels(dpr) {
  const out = [];
  for (const cap of [2, 1.5, 1]) { const r = Math.max(1, Math.min(cap, dpr || 1)); if (out[out.length - 1] !== r) out.push(r); }
  return out;
}

// The ladder of the Three.js renderer, best first: shadows are stepped down before the pixel ratio, so every pixel ratio the screen has
// comes after the first step that has no shadows. `shadows` is 'on' (drawn at every step: the player asked for them, so only the pixel
// ratio is given up), 'off' (never) or 'auto'. Returns { levels, start }: with 'auto' a `phone` begins on the first step without
// shadows, and the governor climbs to the shadowed step only when the median frame time stays under its limit for 10 seconds.
export function shadowLevels(dpr, { shadows = 'auto', phone = false } = {}) {
  const px = pixelLevels(dpr);
  if (shadows === 'off') return { levels: px.map((ratio) => ({ ratio, shadows: false })), start: 0 };
  if (shadows === 'on') return { levels: px.map((ratio) => ({ ratio, shadows: true })), start: 0 };
  const levels = [{ ratio: px[0], shadows: true }, ...px.map((ratio) => ({ ratio, shadows: false }))];
  return { levels, start: phone ? 1 : 0 };
}
