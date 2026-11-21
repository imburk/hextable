// #372: what E23 and the move fixes must not change. Scripts recorded on main before #372 (fixtures/e23-main-replay.json,
// made by fixtures/e23-record.mjs from main 727d590) replayed on this branch: every action's events and result, and the
// state at the end, byte for byte (by sha256). With `autoEngage` off every E23 cast; with it on, a player's cast at a foe,
// the DM casting a party member's spell at a foe, and a foe's attack (none of them E23's); and moves with nothing hidden
// (a leader and two followers, peace and the fight a walk starts). On hexes and on the square room.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as E from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { squareRoom } from "./fixtures/square-room.js";
import { kit } from "./e23-kit.js";
import { scenarios, run } from "./e23-scenarios.js";

// #440: a built character now also has an Unarmed Strike, last of its attacks; main's recording has none. `derive` here takes exactly
// that one entry off a record that did not have it on main (no Martial Arts, not listed on the sheet), so the recorded hashes are
// compared as they were, byte for byte: a punch given to anything else (a monster, a starter, a second or wrong one) still fails.
const derive1 = (sheet) => {
  const d = derive(sheet), at = d.record.attacks, last = at.at(-1);
  delete d.record.acBase;      // #674: the base of its Armor Class (for Mage Armor), which main's recording has not
  for (const a of at) if (a.weapon) { delete a.die; delete a.plus; delete a.magic; delete a.trained; }      // #666: what a weapon record now carries for `imbue` (imbue.js), which main's recording has not
  if (last?.id === "unarmed-strike" && !sheet.weapons?.includes("unarmed-strike") && !at.some((a) => a.id === "unarmed-strike-bonus")) at.pop();
  return d;
};
// #630: a fight is numbered by `fightSeq` and no longer by the creature counter `seq`, which main's recording has it take from. So that the recording still
// checks everything else byte for byte, the fight counter is made to read as main's counter did (it is set to `seq` before an action, so a fight begun is numbered
// `seq + 1`) and `seq` is moved on by the one it used to take; the counter itself is then taken out of the state (below).
const apply = (s, a, ctx) => {
  s.fightSeq = s.seq;
  const r = E.apply(s, a, ctx);
  if (r.ok && s.fightSeq === s.seq + 1) s.seq++;
  return r;
};
const M = { apply, current: E.current, makeEntity: E.makeEntity, derive: derive1, newGame, squareRoom };
const REC = JSON.parse(readFileSync(new URL("./fixtures/e23-main-replay.json", import.meta.url), "utf8")).scenarios;
const sha = (x) => createHash("sha256").update(x).digest("hex");

test("the recorded scenarios are all there", () => {
  assert.deepEqual(scenarios(kit(M)).map((x) => x.name), Object.keys(REC));
});
// #585: each script is played with the table rule `strikeFirst` 'off' (a new table) and 'casts' (a table saved before #585):
// both give main's events and states, the setting itself taken out of the state.
for (const sf of ["off", "casts"]) for (const sc of scenarios(kit(M), sf)) {
  test(`as on main (strikeFirst ${sf}): ${sc.name}`, () => {
    // Recorded at state version 23; the version has moved since (24, #390; 25, #557; 26, #579; 27, #585) and nothing else in the state: the version is read back as it was, and `packs: []` and `scoreRolls: {}` (also new) are left out (a new game holds none of the places of a world, #579).
    // #523 (addition F of homebrew-subclasses.md) adds `whit:<attacker>:<target>` to a fight's flags after a weapon hit: only those keys are taken out, so the pin still checks everything else is as on main.
    const got = run(M, sc).map((x) => sha(x.replace(/^\{"version":29,/, '{"version":23,').replace(',"scoreRolls":{}', '').replace(',"packs":[]', '').replace(/"whit:[^"]*":true,?/g, '').replace(',"strikeFirst":"casts"', '').replace(/,"fightSeq":\d+/, '').replace(/,\}/g, '}')));
    assert.equal(got.length, REC[sc.name].length, "as many results");
    got.forEach((h, i) => assert.equal(h, REC[sc.name][i], `result ${i} of ${got.length} (the last is the state)`));
  });
}
