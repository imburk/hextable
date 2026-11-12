// Monsters' languages (DEBT M10): the stat block's Languages line, data only.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, MONSTERS, PACKS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";
import { apply } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const srd = PACKS[0];
const withMonster = (change) => { const m = structuredClone(srd.monsters[0]); change(m); return lintPack({ ...srd, monsters: [m] }).join(" | "); };

test("the linter accepts a list of short texts (empty for none) and rejects anything else", () => {
  assert.equal(withMonster((m) => { m.languages = ["Common", "Goblin"]; }), "");
  assert.equal(withMonster((m) => { m.languages = []; }), "");
  assert.equal(withMonster((m) => { delete m.languages; }), "");
  for (const bad of ["Common", [""], ["  "], [5], [null], [["Common"]], { 0: "Common" }, null, Array(13).fill("Common"), ["x".repeat(121)]]) {
    assert.match(withMonster((m) => { m.languages = bad; }), /languages must be/, JSON.stringify(bad));
  }
});

test("every monster has its languages from the stat block", () => {
  for (const m of Object.values(CONTENT.monsters)) assert.ok(Array.isArray(m.languages), m.id);
  const lang = (id) => CONTENT.monsters[id].languages;
  assert.deepEqual(lang("goblin-warrior"), ["Common", "Goblin"]);
  assert.deepEqual(lang("wolf"), []);                                                          // "None"
  assert.deepEqual(lang("aboleth"), ["Deep Speech", "telepathy 120 ft."]);
  assert.deepEqual(lang("adult-red-dragon"), ["Common", "Draconic"]);
  assert.deepEqual(lang("ice-mephit"), ["Primordial (Aquan, Auran)"]);                          // a comma inside brackets is not a split
  assert.deepEqual(lang("specter"), ["Understands Common plus one other language but can’t speak"]);
  assert.equal(Object.values(CONTENT.monsters).filter((m) => m.languages.length === 0).length, 129);
});

test("languages are data only: the engine's creature does not carry them", () => {
  assert.ok(!("languages" in MONSTERS.aboleth));
  const s = newGame(2);
  const id = apply(s, { type: "spawn", monster: "aboleth", at: { q: 1, r: 1 } }, { role: "dm", userId: "dm" }).events[0].id;
  assert.ok(!("languages" in s.entities[id]));
});
