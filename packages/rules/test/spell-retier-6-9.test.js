// The spell re-tiering pass, levels 6 to 9 (docs/DEBT.md, Spells). Chain Lightning moves from auto to
// assist (its object targets are the DM's). Prismatic Spray and Imprisonment move from manual to assist.
// Each has its saving throw written as a step; the rest is for the DM.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { spells6 } from "../src/content/srd52/spells-6.js";
import { spells7 } from "../src/content/srd52/spells-7.js";
import { spells9 } from "../src/content/srd52/spells-9.js";

const byId = (list, id) => list.find((s) => s.id === id);

test("tiers and the saving throws of the re-tiered spells", () => {
  const cl = byId(spells6, "chain-lightning");
  assert.equal(cl.tier, "assist");
  assert.equal(cl.effects[0].save, "dex");
  assert.equal(SPELLS["chain-lightning"].def.tier, "assist");

  const ps = byId(spells7, "prismatic-spray");
  assert.equal(ps.tier, "assist");
  assert.equal(ps.effects[0].save, "dex");
  assert.equal(SPELLS["prismatic-spray"].def.tier, "assist");

  const im = byId(spells9, "imprisonment");
  assert.equal(im.tier, "assist");
  assert.equal(im.effects[0].save, "wis");
  assert.equal(im.target.creature.count, 1);
  assert.equal(im.range, 30);
  assert.equal(SPELLS["imprisonment"].def.tier, "assist");
});

test("the DM is told what is left in each re-tiered spell", () => {
  assert.match(byId(spells6, "chain-lightning").text, /DM/);
  assert.match(byId(spells7, "prismatic-spray").text, /DM/);
  assert.match(byId(spells9, "imprisonment").text, /DM/);
});
