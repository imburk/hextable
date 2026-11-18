// What the DM's screen asks of the monster AI for a creature it plays: monsters, companions the brain plays, and a character set aside under
// `standIn` (docs/specs/ai-casting.md, Decision 1 and stage AC2; DEBT T20 (1)). Whether it plays is `autoPlays` (ai.js) alone, and app.js asks
// that; this is the one call that reads the AI's answer.
//
// `aiStep` reads the spell list the rules hold (`SPELLS`), and a table's homebrew spells are in it only while the table's overlay is installed
// (content/registry.js; the spec's note for AC2: "the caller must install the table's overlay around the call, as it does around `apply`").
// The page's pack store keeps that overlay installed for as long as the table is open (packmanager.js), so `using` finds it already in place and
// only runs the call. A table with no homebrew has no overlay, and the call is made as it was.
// The AI computes nothing that changes the state: the action it returns is sent to the table like any other, and the engine decides.
import { aiStep } from './shared/ai.js';
import { using } from './shared/content/registry.js';

export function aiAction(state, id, opts, overlay) {
  return overlay ? using(overlay, () => aiStep(state, id, opts)) : aiStep(state, id, opts);
}
