// The arc round the die (docs/specs/one-token-menu.md, Decision 4c): where each place's symbol goes when the token is tapped. Pure sums, no DOM, so a test
// can walk every count at every size. The places fan out from the die along one ring, or two when one cannot hold them; when even two cannot, the last
// slot is More. Distances are from the die's centre, in px; y is negative upward (the die is at the bottom of the screen).
//
//   arcShape({ w, h, x })                 -> 'phone-centre' | 'phone-left' | 'phone-right' | 'wide-centre' | 'wide-left' | 'wide-right'   (x: the die's centre)
//   arcLayout(n, shape, fit)              -> { slots: [{ x, y, ring }], more: bool }   (n places; with `more`, the last slot is More and holds the rest)
//   ARC[shape]                            -> the rings: { rx, ry, slots, from, to } each (degrees: 0 is to the right of the die, 90 straight up, 180 to its left)
export const BUTTON = 52;       // a symbol's round button; above the 44 px minimum
const ring = (rx, ry, slots, from, to) => ({ rx, ry, slots, from, to });
// A die in the middle fans left to right over the top; a die in a corner fans from straight up toward the open side.
// The second ring of a phone's ellipse stops 10 degrees short of level at each end: level with the die it would sit on the first ring's last symbols.
export const ARC = {
  'phone-centre': [ring(128, 150, 7, 180, 0), ring(165, 252, 8, 170, 10)],
  'phone-left': [ring(124, 124, 4, 90, 0), ring(204, 204, 6, 90, 0)],
  'phone-right': [ring(124, 124, 4, 180, 90), ring(204, 204, 6, 180, 90)],
  'wide-centre': [ring(160, 160, 8, 180, 0), ring(270, 270, 11, 180, 0)],
  'wide-left': [ring(135, 135, 4, 90, 0), ring(220, 220, 6, 90, 0)],
  'wide-right': [ring(135, 135, 4, 180, 90), ring(220, 220, 6, 180, 90)],
};
export const arcCapacity = (shape) => ARC[shape].reduce((n, r) => n + r.slots, 0);

// Which fan a screen of w by h gets for a die whose centre is at x: a wide screen from 900 px; a corner when the die is within 120 px of a side.
export function arcShape({ w, h, x }) {
  const size = w >= 900 ? 'wide' : 'phone';
  const at = x < 120 ? 'left' : x > w - 120 ? 'right' : 'centre';
  return `${size}-${at}`;
}

// k symbols on a ring. The first ring spreads what it has evenly (a full ring uses its ends; one with room to spare keeps inside them, so three do not sit at
// the far ends and the top). A second ring has fixed slots and fills the middle ones first: its slots are placed to clear the first ring's symbols, and a
// spread of its own would not be (a phone's two ellipses are 37 px apart at the sides).
function place(r, k, index) {
  const out = [], full = k >= r.slots || index > 0, first = index > 0 ? Math.floor((r.slots - k) / 2) : 0, n = index > 0 ? r.slots : k;
  for (let i = 0; i < k; i++) {
    const t = full ? (n === 1 ? 0.5 : (first + i) / (n - 1)) : (i + 0.5) / k;
    const a = (r.from + (r.to - r.from) * t) * Math.PI / 180;
    out.push({ x: Math.round(r.rx * Math.cos(a) * 10) / 10, y: Math.round(-r.ry * Math.sin(a) * 10) / 10, ring: index });
  }
  return out;
}

// `fit`: how far to a side a symbol's centre may go (half the screen less a margin): a narrower phone than 390 px pulls a centred fan's rings in.
export function arcLayout(n, shape, fit = Infinity) {
  const centred = /centre$/.test(shape);
  const rings = (ARC[shape] ?? ARC['phone-centre']).map((r) => (centred && r.rx > fit ? { ...r, rx: Math.max(60, fit) } : r)), cap = rings.reduce((s, r) => s + r.slots, 0);
  const more = n > cap, count = Math.max(0, Math.min(n, cap));       // with More, the last slot is its own and the others hold the first cap - 1 places
  const slots = []; let left = count;
  rings.forEach((r, i) => { const k = Math.min(left, r.slots); if (k) slots.push(...place(r, k, i)); left -= k; });
  return { slots, more };
}
