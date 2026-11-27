// Strike first (#649): only the DM may set it, 'Spells and attacks' ('all') included; a refused setting changes nothing.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, SETTINGS } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" }, PLAYER = { role: "player", userId: "pat" };

test("strikeFirst: a player cannot set any value, and nothing changes; the DM can", () => {
  const s = newGame(1), before = s.settings.strikeFirst;
  for (const value of SETTINGS.strikeFirst) {
    assert.equal(apply(s, { type: "setting", key: "strikeFirst", value }, PLAYER).error, "Only the DM can change table settings.");
    assert.equal(s.settings.strikeFirst, before);
  }
  assert.equal(apply(s, { type: "setting", key: "strikeFirst", value: "all" }, { role: "spectator", userId: "x" }).error, "Only the DM can change table settings.");
  assert.equal(s.settings.strikeFirst, before);
  assert.ok(apply(s, { type: "setting", key: "strikeFirst", value: "all" }, DM).ok);
  assert.equal(s.settings.strikeFirst, "all");
});
