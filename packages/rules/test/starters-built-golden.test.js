// A golden on the plain new game (#672): the four starters are built from their sheets, a fight is played out by the engine's own AI (heroes and foes), and for
// every step the result, the events each player is told and a hash of each player's whole view are compared with a fixture (fixtures/starters-built-golden.json).
// The other goldens and replays ("as on main") play hand-typed starters (fixtures/typed.js) as the legacy check; this one is the game as it is now.
// To make the fixture again (only from code known to be right): GOLDEN_WRITE=1 node --test this file.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" }, PAT = { role: "player", userId: "pat" }, SAM = { role: "player", userId: "sam" };
const FIXTURE = new URL("./fixtures/starters-built-golden.json", import.meta.url);
// #836 (swimming): a view carries the map as format 3 with `depth: 10` on each water tile; read back as it was (format 2, no depth) so the recorded hashes stand.
const old = (x) => { const o = JSON.stringify(x, (k, v) => (k === "depth" && v === 10 ? undefined : k === "format" && v === 3 ? 2 : v)); return o; };
const sha = (x) => createHash("sha256").update(old(x)).digest("hex").slice(0, 16);

function run() {
  const s = newGame(5);
  s.entities.fighter.owner = "pat"; s.entities.rogue.owner = "pat"; s.entities.cleric.owner = "sam"; s.entities.wizard.owner = "sam";
  const out = [{ built: ["fighter", "rogue", "cleric", "wizard"].map((id) => !!s.entities[id].sheet), vpat: sha(view(s, PAT)), vsam: sha(view(s, SAM)) }];
  const step = (ctx, act) => {
    const r = apply(s, act, ctx);
    out.push({ type: act.type, actor: act.actor ?? null, ok: r.ok, error: r.error ?? null, pat: sha(viewEvents(r.events ?? [], s, PAT)), sam: sha(viewEvents(r.events ?? [], s, SAM)), vpat: sha(view(s, PAT)), vsam: sha(view(s, SAM)) });
    return r;
  };
  step(DM, { type: "startEncounter", center: s.entities.m1.pos, radius: 30 });
  for (let i = 0; i < 400 && s.encounter; i++) {
    const id = current(s), act = aiStep(s, id) ?? { type: "endTurn", actor: id };
    if (!step(DM, act).ok) step(DM, { type: "endTurn", actor: id });
  }
  out.push({ ended: !s.encounter, conclusion: !!s.conclusion, xp: ["fighter", "rogue", "cleric", "wizard"].map((id) => s.entities[id].xp ?? 0) });
  return out;
}

test("the plain new game with built heroes plays a fight and sends each player what it always sent", () => {
  const got = JSON.parse(JSON.stringify(run()));
  assert.deepEqual(JSON.parse(JSON.stringify(run())), got, "two runs of the script give the same output");
  if (process.env.GOLDEN_WRITE) { writeFileSync(FIXTURE, JSON.stringify(got, null, 1) + "\n"); return; }
  const want = JSON.parse(readFileSync(FIXTURE, "utf8"));
  assert.equal(got.length, want.length);
  got.forEach((g, i) => assert.deepEqual(g, want[i], `step ${i} (${g.type})`));
  assert.deepEqual(got[0].built, [true, true, true, true]);
  assert.ok(got.length > 20, "a fight of some length");
});
