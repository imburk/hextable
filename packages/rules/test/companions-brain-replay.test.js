// Companions C7 (#366), kept in step with the casting AI (#487): the companion brain must leave the monster AI exactly as it was for
// every creature with no bond. Fixed fights on the hex valley, the square valley and the square room were recorded on main with the
// monster AI as it was (fixtures/ai-casting-monsters.json: a digest of every action chosen and of the end Hit Points). The same fights
// played now must choose the same actions, byte for byte.
// The party's creatures are passive in these fights (they end their turn) and the other creatures are played by aiStep. The first
// recording (fixtures/c7-ai-replay.json) played the party by aiStep too; since AC1 a party creature breaks ties between foes by
// distance then id and never by the foe's Hit Points (ai-casting.md, amendment 4), so a party fighter chooses differently from main
// on purpose, and only monsters are held to main's choices. The scenarios are those of ai-casting-kit.js.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { endOf, playMonsters, scenarios, sha } from "./ai-casting-kit.js";

const FIX = JSON.parse(readFileSync(new URL("./fixtures/ai-casting-monsters.json", import.meta.url), "utf8"));

test("the monster AI is byte-identical to main for creatures with no bond: the recorded fights choose the same actions and end the same", () => {
  const list = scenarios();
  assert.equal(list.length, FIX.runs.length);
  for (const [i, sc] of list.entries()) {
    const want = FIX.runs[i], s = sc.make(), actions = playMonsters(s);
    assert.equal(sc.name, want.name);
    assert.equal(actions.length, want.steps, `${sc.name}: steps`);
    assert.equal(actions.filter((a) => a.refused).length, want.refused, `${sc.name}: refused`);
    assert.equal(sha(actions), want.actions, `${sc.name}: the actions chosen`);
    assert.equal(sha(endOf(s)), want.end, `${sc.name}: the end state`);
    assert.equal(!s.encounter, want.ended);
  }
});
