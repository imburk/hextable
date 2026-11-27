// The Leap row's numbers (#818, for the engine's `leap` action, #813; docs/specs/rules-expansion.md "Build notes: wave 4 part 8"). Pure: it reads the
// state the way `leapOn` (engine/movement.js) does, through the engine's own exports, and says how far the creature may leap and why it may not.
// Strength in feet with a running start, half standing (whole 5 feet); in a fight a running start is 10 feet of the turn's movement used since the last leap.
// A lasting Jump effect lends a leap (`leapOf`) once a turn for 10 feet of movement.
import { current, inFight, aloft, FT } from './shared/engine.js';
import { speedOf, leapOf } from './shared/modifiers.js';

const RUN = 10;      // feet walked immediately before a leap for a running start
const whole = (n) => Math.floor(n / FT) * FT;

// { why, str, run, ord, spell, spellUsed, sub, text } for creature `e`. `why` is '' when the row is usable. `run` is true, false, or null when the client cannot tell.
export function leapState(S, e) {
  const enc = S.encounter, fight = !!enc && inFight(S, e.id), b = fight ? enc.budget : null, str = e.abil?.str;
  const spell = leapOf(S, e), flags = enc?.flags, used = !!(fight && flags?.[`leaps:${e.id}`]);
  const out = { why: '', str: Number.isInteger(str) ? str : null, run: true, ord: 0, spell, spellUsed: used, sub: '', text: '' };
  const stop = (why) => ({ ...out, why });
  if (!Number.isInteger(str)) return stop(`${e.name} has no Strength score.`);
  if (e.hp?.cur <= 0 || e.dead) return stop(`${e.name} is down.`);
  if (enc && !fight) return stop(`${e.name} is outside the battle.`);
  if (fight && current(S) !== e.id) return stop(`It isn't ${e.name}'s turn.`);
  if (e.cond?.prone) return stop(`${e.name} is Prone: stand up first.`);
  if (aloft(S, e)) return stop(`${e.name} is flying: it moves, it does not leap.`);
  if (e.riding || e.rider) return stop(`${e.name} can't leap while it rides or is ridden.`);
  const speed = speedOf(S, e);
  if (!(speed > 0)) return stop(`${e.name} can't move: its Speed is 0.`);
  if (fight && !(b && b.move >= FT)) return stop(`${e.name} has no movement left.`);
  // The running start: outside a fight always; in a fight what the turn's movement used says, when the state shows the leap marker.
  let run = true;
  if (fight) {
    if (!b || typeof flags !== 'object' || flags === null) run = null;
    else run = speed * (1 + (b.dashes | 0)) - b.move - (flags[`leapm:${e.id}`] ?? 0) >= RUN;
  }
  const full = whole(str), half = whole(Math.floor(str / 2));
  const ord = run === false ? half : full, cap = fight ? Math.min(ord, whole(b.move)) : ord;
  out.run = run; out.ord = ord;
  const bits = [];
  if (!ord) bits.push(run === false ? `Up to 0 ft from a standing start (walk ${RUN} ft first for ${full} ft)` : 'Too weak to leap 5 ft');
  else bits.push(`Up to ${cap} ft${run === null ? ' (half from a standing start)' : run === false ? ` from a standing start (walk ${RUN} ft first for ${Math.min(full, whole(b.move))} ft)` : ''}`);
  const spellFree = spell > 0 && !used;
  if (spellFree) bits.push(`Up to ${spell} ft${fight ? ' for 10 ft' : ''} (Jump)`);
  out.sub = bits.join(' · ');
  out.spellFree = spellFree;
  out.text = out.sub;
  if (!full && !spellFree) return { ...out, why: `${e.name} is not strong enough to leap 5 ft.` };
  return out;
}
