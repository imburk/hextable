// A table with no world is sent exactly what it was sent before the travel work (docs/specs/travel.md, W4 "with no world, every player is sent exactly
// what they are sent today"). A script of actions is played on a game with no world; for each step the result, the events each player is told and a
// hash of each player's whole view are compared with a fixture made once from origin/main before W4 (fixtures/no-world-golden.json).
// To make the fixture again (only ever from code that is known to be right): GOLDEN_WRITE=1 node --test this file.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { test } from "node:test";
import { apply, current } from "../src/engine.js";
import { typedGame as newGame } from "./fixtures/typed.js";        // recorded when the starters were hand-typed: the game is made that way here (#672)
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" }, PAT = { role: "player", userId: "pat" }, SAM = { role: "player", userId: "sam" };
const FIXTURE = new URL("./fixtures/no-world-golden.json", import.meta.url);
const sha = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex").slice(0, 16);

function run() {
  const s = newGame(5);
  s.entities.fighter.owner = "pat"; s.entities.rogue.owner = "pat"; s.entities.cleric.owner = "sam"; s.entities.wizard.owner = "sam";
  const out = [];
  const step = (ctx, action) => {
    const act = typeof action === "function" ? action(s) : action;
    const r = apply(s, act, ctx);
    out.push({ type: act.type, ok: r.ok, error: r.error ?? null, pat: viewEvents(r.events ?? [], s, PAT), sam: viewEvents(r.events ?? [], s, SAM),
      vpat: sha(view(s, PAT)), vsam: sha(view(s, SAM)) });
  };
  step(DM, { type: "scene", scene: { title: "The inn" } });
  step(DM, { type: "sceneNpc", npc: { name: "Barkeep" } });
  step(PAT, { type: "say", as: null, text: "Hello", userName: "Pat" });
  step(PAT, { type: "say", as: "fighter", text: "In character" });
  step(PAT, { type: "say", as: "wizard", text: "Not mine" });
  step(PAT, { type: "say", as: "nobody", text: "Bad id" });
  step(PAT, { type: "say", as: "npc1", text: "Barkeep?" });
  step(DM, { type: "say", as: "npc1", text: "Welcome" });
  step(SAM, { type: "say", as: "cleric", text: "Bless you" });
  step(DM, (g) => { g.scene.said = 5000; return { type: "advanceTime", minutes: 1 }; });
  step(PAT, { type: "say", as: "wizard", text: "full scene, not mine" });
  step(PAT, { type: "say", as: "nobody", text: "full scene, bad id" });
  step(PAT, { type: "say", as: null, text: "full scene, plain" });
  step(DM, { type: "endScene" });
  step(DM, { type: "spawn", monster: "goblin-warrior", name: "Snag", at: { q: 4, r: 1 } });
  step(DM, (g) => ({ type: "startEncounter", center: g.entities.fighter.pos, radius: 30 }));
  step(PAT, (g) => ({ type: "move", actor: "fighter", to: { q: g.entities.fighter.pos.q + 1, r: g.entities.fighter.pos.r } }));
  step(DM, (g) => ({ type: "endTurn", actor: current(g) }));
  step(DM, (g) => ({ type: "endTurn", actor: current(g) }));
  step(DM, { type: "endEncounter" });
  step(DM, { type: "shortRest" });
  step(DM, { type: "rest" });
  return out;
}

test("a game with no world is sent exactly what it was sent before W4", () => {
  const got = JSON.parse(JSON.stringify(run()));
  if (process.env.GOLDEN_WRITE) { writeFileSync(FIXTURE, JSON.stringify(got, null, 1) + "\n"); return; }
  const want = JSON.parse(readFileSync(FIXTURE, "utf8"));
  assert.equal(got.length, want.length);
  got.forEach((g, i) => assert.deepEqual(g, want[i], `step ${i} (${g.type})`));
  assert.ok(got.some((g) => g.ok) && got.some((g) => !g.ok), "the script has both kinds of step");
});
