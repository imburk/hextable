// Legendary actions and Legendary Resistance, stage L1a (docs/specs/legendary.md, Decisions 1 and 2): the `legendary` key of a monster,
// its lint (the SRD's and a homebrew pack's), the seven SRD blocks, and the state a creature made from one starts with.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTENT, PACKS } from "../src/content/index.js";
import { HOMEBREW_LENGTHS, HOMEBREW_RANGES, LEGENDARY_AGAIN, LEGENDARY_LIMITS, LEGENDARY_SPEEDS, lintEntry, lintBaked } from "../src/content/schema.js";

const SRD = PACKS[0].monsters;
const P = "x", SRC = "homebrew:x";
const strict = (e) => lintEntry("monsters", e, { pack: P, srd: CONTENT });
// A monster with a block, made homebrew: the Adult Green Dragon given the block of its stat block (spec Decision 1), which has every part.
const BLOCK = {
  actions: { uses: 3, options: [
    { id: "mind-invasion", name: "Mind Invasion", manual: "Uses Spellcasting to cast Mind Spike (level 3 version).", text: "Casts Mind Spike (level 3 version) with its Spellcasting." },
    { id: "noxious-miasma", name: "Noxious Miasma", again: "nextTurn", target: { area: { shape: "sphere", size: 20, range: 90 } },
      effects: [{ save: "con", dc: 17, half: false, onFail: [{ damage: "2d6", type: "poison" }, { modifier: { on: "ac", op: "add", value: -2 }, ends: { on: "turnEnd" } }] }],
      text: "A 20-foot sphere within 90 feet: Constitution save or poison damage and -2 AC until the end of the target's next turn. Not again before its next turn." },
    { id: "pounce", name: "Pounce", move: { speed: "half" }, use: ["rend"], text: "Moves up to half its Speed, then makes one Rend attack." },
  ] },
  resistance: { day: 3 },
  lair: { uses: 4, resistance: 4, xp: 15000 },
};
const green = (mend = () => {}) => {
  const m = { ...structuredClone(CONTENT.monsters["adult-green-dragon"]), id: "hb-x-green", source: SRC, checked: false, name: "Zz Green", legendary: structuredClone(BLOCK) };
  mend(m.legendary, m);
  return m;
};
const refused = (mend, re) => { const p = strict(green(mend)); assert.ok(p.length, "refused"); assert.match(p.join("\n"), re); };

test("the vocabulary: the limits, the words and the ranges", () => {
  assert.deepEqual(LEGENDARY_AGAIN, ["nextTurn"]);
  assert.deepEqual(LEGENDARY_SPEEDS, ["half", "full"]);
  assert.deepEqual({ ...LEGENDARY_LIMITS }, { uses: 5, options: 8, cost: 3, use: 3, resistance: 10, text: 400 });
  assert.equal(HOMEBREW_LENGTHS["legendary.options"], 8);
  assert.deepEqual(HOMEBREW_RANGES["resistance.day"], [1, 10]);
});

test("a block with every part, in a homebrew pack, is accepted", () => {
  assert.deepEqual(strict(green()), []);
  assert.deepEqual(strict(green((l) => { l.actions.options[0].cost = 2; })), [], "cost is for a pack's older blocks");
  assert.deepEqual(strict(green((l) => { delete l.actions; delete l.lair; })), [], "Legendary Resistance alone");
});

test("a bad block is refused", () => {
  refused((l) => { l.actions.uses = 6; }, /legendary\.actions\.uses: 6 is not allowed; a whole number from 1 to 5/);
  refused((l) => { l.actions.uses = 0; }, /uses: 0 is not allowed; a whole number from 1 to 5/);
  refused((l) => { l.resistance.day = 11; }, /resistance\.day: 11 is not allowed/);
  refused((l) => { l.resistance = { day: 2, more: 1 }; }, /"more" is not something Legendary Resistance has/);
  refused((l) => { l.nope = {}; }, /"nope" is not something a legendary block has|is \{ actions\?, resistance\?, lair\? \}/);
  refused((l) => { l.actions.options = []; }, /options is a list of 1 to 8/);
  refused((l) => { l.actions.options = Array.from({ length: 9 }, (_, i) => ({ id: `o${i}`, name: "O", text: "x", manual: "x" })); }, /a list of 9; the most is 8|options is a list of 1 to 8/);
  refused((l) => { l.actions.options[2].use = ["multiattack"]; }, /a Multiattack: an option makes one attack/);
  refused((l) => { l.actions.options[2].use = ["nothing"]; }, /not an action of this monster/);
  refused((l) => { l.actions.options[2].use = ["rend", "rend"]; }, /different ids/);
  refused((l) => { l.actions.options[2].use = ["rend", "poison-breath", "multiattack", "x"]; }, /a list of 4; the most is 3/);
  refused((l) => { l.actions.options[2].effects = []; }, /use or effects, not both/);
  refused((l) => { l.actions.options[0] = { id: "idle", name: "Idle", text: "x", move: { speed: "half" } }; }, /does nothing/);
  refused((l) => { l.actions.options[0].again = "never"; }, /again is "nextTurn"/);
  refused((l) => { l.actions.options[0].cost = 4; }, /cost: 4 is not allowed; a whole number from 1 to 3/);
  refused((l) => { l.actions.options[0].cost = 3; l.actions.uses = 2; }, /no more than the uses/);
  refused((l) => { l.actions.options[2].move.speed = "fast"; }, /move\.speed is "half" or "full"/);
  refused((l) => { l.actions.options[2].move.mode = "fly"; delete l.actions.options[2].move.speed; }, /move\.speed/);
  refused((l, m) => { l.actions.options[2].move.mode = "burrow"; }, /a way of moving the monster has/);
  refused((l) => { l.actions.options[2].move.provokes = true; }, /provokes is false/);
  refused((l) => { l.actions.options[2].bogus = 1; }, /"bogus" is not something a legendary action has/);
  refused((l) => { l.actions.options[1].id = "mind-invasion"; }, /duplicate option id/);
  refused((l) => { l.actions.options[0].id = "Not Kebab"; }, /id must be a kebab-case name/);
  refused((l) => { l.actions.options[0].text = "x".repeat(401); }, /at most 400 letters/);
  refused((l) => { delete l.actions.options[0].text; }, /needs text/);
  refused((l) => { l.actions.options[1].effects = [{ damage: "1d6" }]; }, /unknown damage type/);
  refused((l) => { l.actions.options[1].target = { area: { shape: "blob", size: 5 } }; }, /unknown area shape/);
  refused((l) => { l.lair.uses = 2; }, /lair uses is a whole number, at least/);
  refused((l) => { l.lair.resistance = 2; }, /lair resistance is a whole number, at least/);
  refused((l) => { l.lair.xp = 100; }, /lair xp is a whole number, at least its plain xp/);
  refused((l) => { l.lair = {}; }, /lair is \{ uses\?, resistance\?, xp\? \}/);
  refused((l) => { delete l.actions; }, /lair uses/);
  refused((l) => { l.lair.xp = 100001; }, /lair\.xp: 100001 is not allowed/);
});

test("a block is not for a baked summon block's lint to trip on, and an entry with none lints as before", () => {
  assert.deepEqual(lintBaked({ ...structuredClone(CONTENT.monsters.goblin), cr: null, xp: 0 }).filter((p) => /legendary/.test(p)), []);
  assert.deepEqual(strict({ ...structuredClone(CONTENT.monsters["goblin-warrior"]), id: "hb-x-gob", source: SRC, checked: false, name: "Zz Gob" }), []);
});
