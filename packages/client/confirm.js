// The d20 confirms (#750, docs/specs/one-token-menu.md "Amendment: the d20 confirms"): the words and the double-tap rule, apart from the page so they can be tested.

// A double-tap is two taps on the same creature, at most DOUBLE_MS apart and at most DOUBLE_PX apart on the screen. A drag or a pinch is never a tap (the renderer's own rule),
// so neither can be half of a pair. 350 ms is the usual limit of a double-tap on a phone and 24 px a finger's wobble; the map's tap itself needs less than 8 px of movement.
export const DOUBLE_MS = 350, DOUBLE_PX = 24;

// `last`: { id, at (ms), xy ([x, y] on the map or null) } of the previous tap on a creature; `tap`: the same for this one.
export function isPair(last, tap) {
  if (!last || last.id !== tap.id || tap.at - last.at > DOUBLE_MS || tap.at < last.at) return false;
  return !last.xy || !tap.xy || Math.hypot(tap.xy[0] - last.xy[0], tap.xy[1] - last.xy[1]) <= DOUBLE_PX;
}

// The note at the top: how many targets are chosen of the most allowed; none chosen says what to do; a refusal's reason follows, the choices staying.
export function targetNote(most, n, refusal = '') {
  if (!most) return '';
  const why = refusal ? ` ${refusal}` : '';
  return n ? `${n} of ${most} targets${refusal ? '.' : ''}${why}` : `No target yet: tap one, then the die.${why}`;
}

// The die's spoken name while an action waits.
export const dieName = (what) => (what ? `Confirm ${what}` : 'Menu');
