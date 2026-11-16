// The re-review of #368, N4 (#372; ai.js, guard): a never-commanded creature "takes the Dodge action and moves only to
// avoid harm" (Animate Dead, SRD 24057-24059). A step out of a foe's reach provokes an Opportunity Attack ("you put
// yourself in danger", 2085), so it is not a step to avoid harm: with a goblin beside it that could make one, a locked
// skeleton Dodges and stays, turn after turn (the reviewer's repro stepped four times, was attacked four times and ended
// five cells from its master). With the goblin unable to make one (Incapacitated, or unable to see it) it steps away.
// On hexes and the square room.
import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import { apply, current } from "../src/engine.js";
import { apart } from "../src/space.js";
import { DM, GRIDS, ok, json, near, turnOf, table, fight, autoTurn } from "./c7-brain-kit.js";

function skeleton(grid) {
  const s = table(grid);
  const skel = near(s, "cleric", "skeleton", { name: "Skeleton" }, { min: 2, max: 3 });
  ok(apply(s, { type: "bond", actor: skel, to: "cleric", kind: "undead", orders: "command" }, DM));
  const gob = near(s, skel, "goblin-warrior", { name: "Goblin" });
  return { s, skel, gob };
}

for (const grid of GRIDS) {
  test(`${grid}: a locked skeleton beside a goblin Dodges and stays for four rounds: no Opportunity Attack, never strays`, () => {
    const { s, skel, gob } = skeleton(grid);
    fight(s, grid);
    const from = json(s.entities[skel].pos), master = apart(s, s.entities[skel], s.entities.cleric);
    for (let round = 0; round < 4 && s.entities[skel]; round++) {
      turnOf(s, skel);
      const sent = autoTurn(s, skel);
      assert.deepEqual(sent.map((x) => x.a.type), ["dodge", "endTurn"], `round ${round + 1}`);
      assert.ok(!sent.some((x) => x.r.events.some((e) => e.type === "reaction")), "nothing provoked");
      assert.equal(json(s.entities[skel].pos), from);
      // The goblin's turn: it attacks the Dodging skeleton where it stands (the monster AI, unchanged).
      turnOf(s, gob);
      for (let i = 0; i < 6 && current(s) === gob; i++) { const a = aiStep(s, gob) ?? { type: "endTurn", actor: gob }; if (!apply(s, a, DM).ok) ok(apply(s, { type: "endTurn", actor: gob }, DM)); }
    }
    assert.ok(!s.entities[skel] || apart(s, s.entities[skel], s.entities.cleric) === master, "as near its master as it was");
  });

  for (const cond of ["blinded", "stunned"]) {
    test(`${grid}: a goblin that can't make an Opportunity Attack (${cond}): the skeleton steps out of its reach, unharmed`, () => {
      const { s, skel, gob } = skeleton(grid);
      ok(apply(s, { type: "condition", actor: gob, condition: cond }, DM));
      fight(s, grid);
      turnOf(s, skel);
      const hp = s.entities[skel].hp, sent = autoTurn(s, skel);
      assert.deepEqual(sent.map((x) => x.a.type).slice(0, 2), ["dodge", "move"], json(sent.map((x) => x.a)));
      assert.ok(apart(s, s.entities[skel], s.entities[gob]) > 1);
      assert.equal(s.entities[skel].hp, hp, "no attack as it went");
    });
  }
}
