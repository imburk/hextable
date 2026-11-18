// Built spellcasters played by the AI (docs/specs/ai-casting.md, stage AC1; #487): the recorded fights.
//   1. Monsters choose exactly as they did before the casting AI: companions-brain-replay.test.js plays the fights with the party
//      passive against fixtures/ai-casting-monsters.json, which was recorded on main's ai.js.
//   2. The same fights, the party played by aiStep too, with the spells, which do change (Tavin and Odessa cast), recorded again and pinned
//      (fixtures/ai-casting-replay.json): a later change to the scores shows up as a changed recording. Re-record with
//      HEXTABLE_RECORD=1 and read the diff.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { playAll, scenarios, sha } from "./ai-casting-kit.js";

const RECORD = process.env.HEXTABLE_RECORD === "1";
const NEW = new URL("./fixtures/ai-casting-replay.json", import.meta.url);

// What a fight came to, in a form that does not move with the state's version: every creature's Hit Points and slots, and who cast what.
function summary(s, actions) {
  const casts = {};
  for (const a of actions) if (a.type === "cast") { casts[a.actor] ??= {}; casts[a.actor][a.spell] = (casts[a.actor][a.spell] ?? 0) + 1; }
  const end = Object.fromEntries(Object.values(s.entities).map((e) => [e.id, [e.hp, e.dead ? 1 : 0, e.slots ?? {}]]));
  return { casts, end };
}
test("the fights with the casters' spells: the recording is pinned", () => {
  const out = [];
  for (const sc of scenarios()) {
    const s = sc.make(), actions = playAll(s), sum = summary(s, actions);
    assert.equal(actions.filter((a) => a.refused).length, 0, `${sc.name}: nothing the AI sent was refused`);
    out.push({ name: sc.name, steps: actions.length, actions: sha(actions), casts: sum.casts, end: sha(sum.end), ended: !s.encounter });
  }
  if (RECORD) { writeFileSync(NEW, `${JSON.stringify({ runs: out }, null, 1)}\n`); return; }
  const want = JSON.parse(readFileSync(NEW, "utf8"));
  assert.equal(out.length, want.runs.length);
  for (const [i, got] of out.entries()) assert.deepEqual(got, want.runs[i], got.name);
  // The pinned fights are about casting: the casters cast.
  const spells = new Set(out.flatMap((r) => Object.values(r.casts).flatMap((c) => Object.keys(c))));
  assert.ok(["fire-bolt", "sacred-flame"].every((x) => spells.has(x)), `cast: ${[...spells]}`);
});
