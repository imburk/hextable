// Press and hold on the map (#599, docs/specs/table-ui.md "Ping"). Pure: no DOM, no imports, and no clock of its own (the clock and the
// timer are passed in), so it runs in Node under test.
//
//   const h = createHold({ ms, slop, setTimer, clearTimer, onStart, onFire, onCancel })
//   h.down(id, x, y, { button, enabled })   a pointer went down; `enabled: false` (the map editor has the pointer) or a button other than the
//                                           main one (0) starts nothing
//   h.move(id, x, y)                        the pointer moved: further than `slop` pixels from where it went down cancels
//   h.up(id)                                released, or the browser took the pointer back (pointercancel): before `ms` it cancels
//   h.cancel()                              stop (a second finger, a pinch, a scroll, the table closing)
//   h.active()                              whether a hold is running
//
// onStart(x, y) when a hold begins (the ring starts filling there); onFire(x, y) when the pointer has stayed `ms` milliseconds without
// moving; onCancel() when a hold that had begun is given up. A hold that fires ends there: it neither cancels nor fires again.
export const HOLD_MS = 1000;      // how long a press must last
export const HOLD_SLOP = 8;       // how far (px) the pointer may stray, as render-three.js's own tap allows

export function createHold({ ms = HOLD_MS, slop = HOLD_SLOP, setTimer = (f, t) => setTimeout(f, t), clearTimer = (t) => clearTimeout(t), onStart = () => {}, onFire = () => {}, onCancel = () => {} } = {}) {
  let cur = null;                        // { id, x0, y0, x, y, timer }
  const end = (fired) => { const c = cur; if (!c) return; cur = null; clearTimer(c.timer); if (!fired) onCancel(); };
  const h = {
    down(id, x, y, o = {}) {
      if (cur) { end(false); return false; }          // a second finger is a pinch, not a hold; the first is let go too
      if (o.enabled === false || (o.button !== undefined && o.button !== 0)) return false;
      cur = { id, x0: x, y0: y, x, y, timer: null };
      const c = cur;
      c.timer = setTimer(() => { if (cur === c) { cur = null; onFire(c.x0, c.y0); } }, ms);
      onStart(x, y);
      return true;
    },
    move(id, x, y) {
      if (!cur || cur.id !== id) return;
      cur.x = x; cur.y = y;
      if (Math.hypot(x - cur.x0, y - cur.y0) > slop) end(false);
    },
    up(id) { if (cur && cur.id === id) end(false); },
    cancel() { end(false); },
    active: () => !!cur,
  };
  return h;
}
