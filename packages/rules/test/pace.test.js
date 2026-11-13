// The table setting `pace` (docs/specs/renderer.md, Decisions 2 and 3, task R3): how the picture is
// paced on each client. Presentation only: the rules, the dice and what players are sent besides
// the setting itself are the same whatever it is.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, SETTINGS } from "../src/engine.js";
import { aiStep } from "../src/ai.js";
import { migrate, VERSION } from "../src/migrate.js";
import { newGame } from "../src/scenario.js";
import { view } from "../src/view.js";

const DM = { role: "dm", userId: "dm" }, PLAYER = { role: "player", userId: "pat" };

test("pace: wait, flow or instant, wait by default, the DM's to set, and an old game waits", () => {
  assert.deepEqual(SETTINGS.pace, ["wait", "flow", "instant"]);
  const s = newGame(1);
  assert.equal(s.settings.pace, "wait");
  assert.equal(apply(s, { type: "setting", key: "pace", value: "flow" }, PLAYER).error, "Only the DM can change table settings.");
  assert.equal(apply(s, { type: "setting", key: "pace", value: "slow" }, DM).error, "That setting can be: wait, flow, instant.");
  for (const v of ["flow", "instant", "wait"]) { assert.ok(apply(s, { type: "setting", key: "pace", value: v }, DM).ok); assert.equal(s.settings.pace, v); }
  assert.equal(view(s, PLAYER).settings.pace, "wait", "players are sent it");
  const old = newGame(1);
  delete old.settings.pace; old.version = 16;
  migrate(old);
  assert.equal(old.settings.pace, "wait");
  assert.equal(old.version, VERSION);
});

test("pace changes no rule and no roll: the same fight plays the same under each value", () => {
  const play = (pace) => {
    const s = newGame(3);
    if (pace !== "wait") assert.ok(apply(s, { type: "setting", key: "pace", value: pace }, DM).ok);
    assert.ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 } }, DM).ok);
    let acted = 0;
    for (let i = 0; i < 200 && s.encounter; i++) {
      const id = current(s), a = s.entities[id].side === "party" ? null : aiStep(s, id);
      const r = apply(s, a ?? { type: "endTurn", actor: id }, DM);
      if (!r.ok) apply(s, { type: "endTurn", actor: id }, DM);
      else if (a && a.type !== "endTurn") acted++;
    }
    assert.ok(acted > 3, "the monsters did things");
    return JSON.stringify({ ...s, settings: { ...s.settings, pace: null }, timeline: s.timeline.filter((x) => x.type !== "setting") });
  };
  const wait = play("wait");
  assert.equal(play("flow"), wait);
  assert.equal(play("instant"), wait);
});
