// A starter hero as a character typed in by hand (no build sheet): the pack's own record, made as the valley made the starters
// before they got sheets (#672). For the tests of what a hand-typed character can and cannot do.
import { makeEntity } from "../../src/engine.js";
import { PREGENS } from "../../src/content/index.js";

export function typed(s, id) {
  const old = s.entities[id];
  s.entities[id] = makeEntity(PREGENS[id], { id, kind: "pc", side: "party", pos: old.pos, look: old.look });
  return s.entities[id];
}

// A view or an event list as text, without the heroes' attack lists: a built hero's Unarmed Strike carries its own save DC (`"dc"`),
// which is the hero's own number, not a DC the table keeps secret. For tests that look for a secret DC in what a player is sent.
export const plain = (x) => JSON.stringify(x, (k, v) => (k === "attacks" ? undefined : v));

// A new game whose starters are all hand-typed, as every valley was before they got sheets (#672): for the replays and goldens that
// compare a game byte for byte with one recorded then. They still prove the engine and the views are unchanged; the starters'
// own sheets are tested in levelup.test.js and derive.test.js.
import { newGame } from "../../src/scenario.js";
export function typedGame(seed, opts) {
  const s = newGame(seed, opts);
  for (const id of ["fighter", "rogue", "cleric", "wizard"]) if (s.entities[id]) typed(s, id);
  return s;
}
