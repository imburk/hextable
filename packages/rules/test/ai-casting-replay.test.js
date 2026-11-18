// Built spellcasters played by the AI (docs/specs/ai-casting.md, stage AC1; #487): the recorded fights.
//   1. Every creature with no spells chooses exactly as it did before the casting AI. The fixed fights of companions-brain-replay.test.js
//      (hex valley, square valley, square room; every creature played by aiStep) were recorded on main before the companion brain
//      (fixtures/c7-ai-replay.json). Played now with the pregenerated casters' spells put away, they choose the same actions, byte for
//      byte, step by step: the monster AI is unchanged, and so is a party creature with no spells reading the party's copy of the state.
//   2. The same fights with the spells, which do change (Tavin and Odessa cast), recorded again and pinned
//      (fixtures/ai-casting-replay.json): a later change to the scores shows up as a changed recording. Re-record with
//      HEXTABLE_RECORD=1 and read the diff.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { bringBackSpells, playAll, putAwaySpells, scenarios, sha } from "./ai-casting-kit.js";

const RECORD = process.env.HEXTABLE_RECORD === "1";
const MAIN = JSON.parse(readFileSync(new URL("./fixtures/c7-ai-replay.json", import.meta.url), "utf8"));
const NEW = new URL("./fixtures/ai-casting-replay.json", import.meta.url);

test("monsters and every creature with no spells choose the same actions as main, byte for byte, in the recorded fights", () => {
  const list = scenarios();
  assert.equal(list.length, MAIN.runs.length);
  for (const [i, sc] of list.entries()) {
    const want = MAIN.runs[i], s = sc.make();
    putAwaySpells(s);
    const actions = playAll(s);
    assert.equal(sc.name, want.name);
    assert.equal(actions.length, want.steps, `${sc.name}: steps`);
    assert.equal(actions.filter((a) => a.refused).length, want.refused, `${sc.name}: refused`);
    assert.equal(sha(actions), want.actions, `${sc.name}: the actions chosen`);
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
