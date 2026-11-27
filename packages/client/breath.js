// The breath a creature has left under water, as data and words (docs/specs/fly-swim-control.md, "Build notes (E2)"; DEBT T110 (1)). Pure: no DOM, no Three.js.
// The engine keeps the record (`breath: { held, gave, out?, told? }`, seconds held) and sends it to the creature's own party and to the DM (view-fields.js); the limit
// is the rules' own `breathOf`, read here, never recomputed. A creature that is not under the surface, that breathes water, that the engine cannot judge, or whose
// record we were not sent (a foe, for a player) shows nothing.
import { breathOf } from './shared/modifiers.js';
import { submerged } from './shared/space.js';

export const ROUND = 6;            // seconds in a round (the SRD's; the engine's ROUND_SECONDS)
export const WARN_ROUNDS = 2;      // the meter turns to the warning colour with this many rounds left

// { frac, rounds, out, warn, words } for a creature under the surface that holds its breath, or null. `frac` is the share of the breath left (1 full, 0 gone).
export function breathView(S, e) {
  const b = e?.breath;
  if (!b || e.dead || typeof b.held !== 'number' || !S?.map || !submerged(S, e)) return null;
  const air = breathOf(S, e);
  if (air.water || !air.judged) return null;
  const left = Math.max(0, air.hold - b.held), rounds = Math.ceil(left / ROUND), out = !!b.out || left <= 0;
  return { frac: out ? 0 : Math.min(1, left / air.hold), rounds, out, warn: out || rounds <= WARN_ROUNDS, words: wordsFor(rounds, out) };
}

// "Holding breath: 2 rounds left", "Holding breath: about 3 minutes left" (a long breath is said in minutes), "Out of breath".
export function wordsFor(rounds, out) {
  if (out) return 'Out of breath';
  if (rounds > 20) { const m = Math.ceil(rounds / 10); return `Holding breath: about ${m} minute${m === 1 ? '' : 's'} left`; }
  return `Holding breath: ${rounds} round${rounds === 1 ? '' : 's'} left`;
}
