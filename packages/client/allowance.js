// The movement an Opportunity Attack's rider gives off turn (issue #536; docs/specs/homebrew-subclasses.md, "Build notes: H"; DEBT T93).
//
// When a party creature's Opportunity Attack hits and its subclass feature says `triggers.opportunityHit`, the engine keeps up to half its Speed on the
// fight's turn flags as `rmove:<creature>` (feet), until the next turn begins. The creature's player spends it with `move` (off its turn, provoking
// nothing) or gives it up with `forgoMove`. This file is pure: it reads a state (a full state or a player's view) and returns plain data, so a test can
// drive it with no page. Nothing here decides a rule; app.js sends the two actions the engine documents and the engine's own words answer a refusal.
//
// The one-token menu (docs/specs/one-token-menu.md) is not built: today the offer is a line in the hint bar with two buttons and the reach shaded on the
// map. When the menu comes, `offerOf` is the prompt that arrives while it is closed, and `waitingFor` is what the DM's auto-play asks.
import { moveOptions, up } from './shared/engine.js';
import { autoPlays } from './shared/ai.js';
import { afterOpportunity } from './shared/reactions.js';
import { previewState } from './grapple.js';
import { shownName } from './tracker.js';

const FT = 5;

// The feet of such movement a creature holds now, or 0. A flag that is not a number above 0 is none (the engine does the same).
export const owedFeet = (S, id) => { const n = S?.encounter?.flags?.[`rmove:${id}`]; return Number.isFinite(n) && n > 0 ? n : 0; };

// What the offer to creature `e` is, or null: { id, name, feet, feature }. Only a creature that is up, not on its own turn (the flag is for the time
// between the mover's move and the end of the turn), and that holds feet. `feature` is the name of the feature that gave it, as the record has it.
export function offerOf(S, e) {
  if (!S?.encounter || !e || !up(e)) return null;
  const cur = S.encounter.order?.[S.encounter.turn]?.id;
  const feet = owedFeet(S, e.id);
  if (!feet || cur === e.id) return null;
  return { id: e.id, name: shownName(S, e), feet, feature: afterOpportunity(e)?.name ?? 'Opportunity Attack' };
}

// Every offer there is, in the turn order. A party creature's only: a foe's is the DM's to play (the engine tells the DM, and the monster AI does not spend it).
export function offers(S) {
  if (!S?.encounter) return [];
  return S.encounter.order.map((o) => (o.id ? S.entities[o.id] : null)).filter((e) => e && e.side === 'party').map((e) => offerOf(S, e)).filter(Boolean);
}

// Whom the DM's auto-play waits for: the party creatures holding an offer that nobody on this screen is going to spend. One that this screen plays
// itself (a stand-in, a companion the brain plays: `autoPlays`) is not waited for, since nothing spends its allowance; it lapses as before. A player who is
// offline is waited for (a lost link never acts by itself); the DM gives it up for them.
export function waitingFor(S, opts) {
  return offers(S).filter((o) => !autoPlays(S, o.id, opts));
}

// The places the movement reaches, as the keys `moveOptions` gives: the game as it would stand if it were `e`'s turn with only those feet, no Dash, nothing
// provoked (the engine's own `asItsTurn`, which is not exported and which this repeats on a read-only copy; the engine alone decides what a `move` does).
// `keep(node)` lets the caller leave out a place (a flyer's other heights).
export function reachOf(S, e, keep = () => true) {
  const feet = owedFeet(S, e?.id);
  if (!feet || !S.encounter) return [];
  const turn = S.encounter.order.findIndex((o) => o.id === e.id);
  if (turn < 0) return [];
  const base = previewState(S, e);
  const s = { ...base, encounter: { ...S.encounter, turn, budget: { move: feet, dashes: -1, diagonals: S.encounter.flags[`rdiag:${e.id}`] ? 1 : 0, free: true } } };
  return [...moveOptions(s, e)].filter(([, v]) => v.canStop && keep(v)).map(([k]) => k);
}

// ---------- the words ----------
const list = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
export const moveLabel = (o) => `Move up to ${o.feet} ft (${o.feature})`;
export const forgoLabel = "Don't move";
// The offer to the one who spends it. `armed`: the Move button was pressed and the next tap on a place is the move.
export function offerWords(o, { armed = false, waiting = false } = {}) {
  const tail = waiting ? ' The foes wait for this.' : '';
  return armed ? `${o.name}: tap a shaded place to move, up to ${o.feet} ft. Nothing it passes gets an Opportunity Attack.${tail}`
    : `${o.name} may move up to ${o.feet} ft, provoking no Opportunity Attacks.${tail}`;
}
// What the DM's screen says while its auto-play waits, and the button that gives the movement up for them.
export const waitWords = (os) => `Waiting for ${list(os.map((o) => o.name))} to move (${list(os.map((o) => `${o.feet} ft`))}). The foes go on when it is spent or given up.`;
export const giveUpLabel = (os) => (os.length > 1 ? 'Give them up' : 'Give it up');
