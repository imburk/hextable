// Built spellcasters played by the AI (docs/specs/ai-casting.md, stage AC1; #487): the recorded fights.
//   1. Monsters choose exactly as they did before the casting AI: the fights are played with the party passive and every other creature
//      by aiStep, against fixtures/ai-casting-monsters.json, recorded on main's ai.js. (companions-brain-replay.test.js plays the whole
//      fight, the party by aiStep too, against fixtures/c7-ai-replay.json, re-recorded for the party's tie rule.)
//   2. The same fights, the party played by aiStep too, with the spells, which do change (Tavin and Odessa cast), recorded again and pinned
//      (fixtures/ai-casting-replay.json): a later change to the scores shows up as a changed recording. Re-record with
//      HEXTABLE_RECORD=1 and read the diff.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { endOf, playAll, playMonsters, scenarios, sha } from "./ai-casting-kit.js";

const RECORD = process.env.HEXTABLE_RECORD === "1";
const MON = JSON.parse(readFileSync(new URL("./fixtures/ai-casting-monsters.json", import.meta.url), "utf8"));
const NEW = new URL("./fixtures/ai-casting-replay.json", import.meta.url);

test("monsters choose the same actions as main, byte for byte, with the party passive, in the recorded fights", () => {
  const list = scenarios();
  assert.equal(list.length, MON.runs.length);
  for (const [i, sc] of list.entries()) {
    const want = MON.runs[i], s = sc.make(), actions = playMonsters(s);
    assert.equal(sc.name, want.name);
    assert.equal(actions.length, want.steps, `${sc.name}: steps`);
    assert.equal(actions.filter((a) => a.refused).length, want.refused, `${sc.name}: refused`);
    assert.equal(sha(actions), want.actions, `${sc.name}: the actions chosen`);
    assert.equal(sha(endOf(s)), want.end, `${sc.name}: the end state`);
    assert.equal(!s.encounter, want.ended);
  }
});

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
