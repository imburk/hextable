import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, PACKS, SPELLS } from "../src/content/index.js";
import { spells0 } from "../src/content/srd52/spells-0.js";
import { lintPack } from "../src/content/schema.js";

const [srd] = PACKS;
const lists = [[0, spells0]];

test("every entered spell list lints clean with the rest of the pack", () => {
  assert.deepEqual(lintPack(srd), []);
});

test("spell ids are unique across all files, and every list is in the pack", () => {
  const ids = srd.spells.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, list] of lists) for (const s of list) assert.equal(CONTENT.spells[s.id], s, `${s.id} is not in the pack`);
  for (const s of srd.spells) assert.ok(SPELLS[s.id], `${s.id} has no profile`);
});

test("each spells-N file holds only spells of level N, from the SRD 5.2.1", () => {
  for (const [level, list] of lists) for (const s of list) {
    assert.equal(s.level, level, `${s.id} is in the wrong file`);
    assert.equal(s.source, "SRD 5.2.1");
    assert.ok(s.text.length < 600, `${s.id}: text should be a short description`);
  }
});

test("a manual spell has exactly its manual step, and an assist spell says what it leaves to the DM", () => {
  for (const [, list] of lists) for (const s of list) {
    if (s.tier === "manual") assert.equal(s.effects.length, 1, s.id);
    if (s.tier === "assist") assert.match(s.text, /DM/, `${s.id}: an assist spell's text must say what the DM does`);
  }
});

test("all SRD 5.2.1 cantrips are present (Fire Bolt and Sacred Flame live in spells.js)", () => {
  const expected = ["acid-splash", "chill-touch", "dancing-lights", "druidcraft", "eldritch-blast", "elementalism", "fire-bolt", "guidance", "light", "mage-hand",
    "mending", "message", "minor-illusion", "poison-spray", "prestidigitation", "produce-flame", "ray-of-frost", "resistance", "sacred-flame", "shillelagh",
    "shocking-grasp", "sorcerous-burst", "spare-the-dying", "starry-wisp", "thaumaturgy", "true-strike", "vicious-mockery"];
  const have = srd.spells.filter((s) => s.level === 0).map((s) => s.id).sort();
  assert.deepEqual(have, expected);
});
