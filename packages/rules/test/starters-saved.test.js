// A game saved before the starters had sheets (#672): the heroes still exactly as the pack typed them are given their sheet on load, and nothing else changes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import { migrate } from "../src/migrate.js";
import { typedGame } from "./fixtures/typed.js";
import { SHEETS } from "./fixtures/sheets.js";

const DM = { role: "dm", userId: "dm" };
const IDS = ["fighter", "rogue", "cleric", "wizard"];

test("an old save's untouched starters gain their sheet and keep every number", () => {
  const old = typedGame(4);
  assert.ok(IDS.every((id) => old.entities[id].sheet === undefined), "the old save has no sheets");
  const loaded = migrate(structuredClone(old));
  for (const id of IDS) {
    const { sheet, ...rest } = loaded.entities[id];
    assert.deepEqual(sheet, SHEETS[id], id);
    assert.deepEqual(rest, old.entities[id], `${id} is otherwise exactly as saved`);
  }
  assert.deepEqual(migrate(structuredClone(loaded)), loaded, "loading it again changes nothing");
});

test("an old save's starter that is not what the pack typed is left typed", () => {
  const old = typedGame(4);
  old.entities.fighter.abil.str = 18;                 // corrected by hand
  old.entities.rogue.level = 2;                       // levelled by hand
  old.entities.cleric.maxHp = 14;
  const loaded = migrate(structuredClone(old));
  assert.deepEqual(IDS.map((id) => loaded.entities[id].sheet !== undefined), [false, false, false, true]);
});

test("an old save's starter, once it has its sheet, levels up and keeps what play did to it", () => {
  const s = migrate(structuredClone(typedGame(4)));
  s.entities.fighter.hp = 5; s.entities.fighter.xp = 300; s.entities.fighter.gear.push("Rope");
  const r = apply(s, { type: "levelUp", actor: "fighter", sheet: { ...structuredClone(s.entities.fighter.sheet), level: 2 } }, DM);
  assert.ok(r.ok, r.error);
  const e = s.entities.fighter;
  assert.deepEqual([e.level, e.xp, e.gear.includes("Rope"), e.hp > 5], [2, 300, true, true]);
});
