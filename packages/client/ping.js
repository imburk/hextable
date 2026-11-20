// A ping on the map (#599): the colour of whoever pinged, which cell a press on the screen means, and the drawing of the ring and the ping.
// The pure parts (`pingColor`, `cellAtPoint`) have no DOM and are tested in Node; `createPings` draws, in DOM elements that follow
// the renderer's `screenOf`, so the same code serves every renderer and both grids (the renderer that draws nothing answers `null`, and then
// nothing shows).
import { surfaces } from './shared/space.js';

export const PING_MS = 3000;      // how long a ping stays on the map

// The colour a person pings in: their character's own colour if they play one (the party's `look.color`), gold for the DM, else a hue
// worked out from their id, so that it is the same every time and differs from one person to the next.
export function pingColor(state, from) {
  if (from === 'dm') return '#e0b040';
  const own = Object.values(state?.entities ?? {}).find((e) => e.side === 'party' && e.owner === from && e.look?.color);
  if (own) return own.look.color;
  let h = 0; for (const c of String(from)) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(h) % 360} 70% 60%)`;
}

// The cell under a point of the screen. `planeHex(x, y, feet)` is the renderer's: the cell where the line of sight meets the plane at a height.
// The heights are tried from the top down (the camera looks down, so the highest floor under the point is the first thing the line meets). The highest floor whose surface really is there wins (so a point on an upper floor is that floor's cell, not the ground below it); failing that
// the ground. Null if the point is on no cell of the map.
export function cellAtPoint(state, planeHex, x, y) {
  const map = state?.map;
  if (!Array.isArray(map?.levels)) return null;
  const zs = [...new Set(map.levels.flatMap((l) => Object.values(l.tiles).map((t) => l.z + (t.h ?? 0))))].sort((a, b) => b - a);
  for (const z of zs) {
    const h = planeHex(x, y, z);
    if (!h) continue;
    const here = surfaces(map, h).find((sf) => Math.abs(sf.z - z) < 1);
    if (here) return { q: h.q, r: h.r, z: here.z };
  }
  return null;
}

// The drawing. `screenOf(cell)` is the renderer's (where a cell is on the screen, or null); `host` the element the marks go in (a layer over the canvas that takes no pointer).
export function createPings({ screenOf, host, doc = document, now = () => performance.now(), raf = (f) => requestAnimationFrame(f) }) {
  const marks = new Set();
  let ring = null, looping = false;
  const place = (el, hex) => { const p = screenOf(hex); el.style.display = p ? '' : 'none'; if (p) el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`; };
  const loop = () => {
    const t = now();
    for (const m of [...marks]) { if (t >= m.until) { m.el.remove(); marks.delete(m); } else place(m.el, m.at); }
    if (marks.size) raf(loop); else looping = false;
  };
  return {
    // The ring that fills while the press is held, at the finger or the pointer; `ms` is how long it takes.
    start(x, y, ms) {
      this.stop();
      ring = doc.createElement('div'); ring.className = 'hold-ring'; ring.style.left = `${x}px`; ring.style.top = `${y}px`; ring.style.setProperty('--hold-ms', `${ms}ms`);
      ring.setAttribute('aria-hidden', 'true'); host.append(ring);
    },
    stop() { ring?.remove(); ring = null; },
    // Show a ping at a cell, in a colour, with a name. A ping on a cell the screen cannot place (the renderer that draws nothing) is not drawn.
    ping({ at, name, color }) {
      const el = doc.createElement('div'); el.className = 'ping'; el.style.setProperty('--ping-color', color); el.style.setProperty('--ping-ms', `${PING_MS}ms`);
      el.setAttribute('aria-hidden', 'true');
      const label = doc.createElement('span'); label.className = 'ping-name'; label.textContent = name;
      el.append(doc.createElement('i'), label); host.append(el);
      const m = { el, at, until: now() + PING_MS }; marks.add(m); place(el, at);
      if (!looping) { looping = true; raf(loop); }
      return m;
    },
    count: () => marks.size,
    dispose() { this.stop(); for (const m of marks) m.el.remove(); marks.clear(); },
  };
}
