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

const M = { apply: E.apply, current: E.current, makeEntity: E.makeEntity, derive, newGame, squareRoom };
const REC = JSON.parse(readFileSync(new URL("./fixtures/e23-main-replay.json", import.meta.url), "utf8")).scenarios;
const sha = (x) => createHash("sha256").update(x).digest("hex");

test("the recorded scenarios are all there", () => {
  assert.deepEqual(scenarios(kit(M)).map((x) => x.name), Object.keys(REC));
});
for (const sc of scenarios(kit(M))) {
  test(`as on main: ${sc.name}`, () => {
    const got = run(M, sc).map(sha);
    assert.equal(got.length, REC[sc.name].length, "as many results");
    got.forEach((h, i) => assert.equal(h, REC[sc.name][i], `result ${i} of ${got.length} (the last is the state)`));
  });
}
