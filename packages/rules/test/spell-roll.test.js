// A spell says what it turns on: a spell attack roll, a saving throw (which ability) or no roll (#605; docs/specs/rules-expansion.md, "A spell's roll").
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, SPELLS, rollLabel, spellRoll as spellRollById } from "../src/content/index.js";
import { SPELL_ROLLS, lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { spellRoll, walk } from "../src/effects.js";

const spells = Object.values(CONTENT.spells);
// What a spell's steps say of its roll: any attack step, else the saving throws its save steps make.
const fromSteps = (def) => {
  let attack = false; const saves = new Set();
  walk(def.effects, (st) => { if ("attack" in st) attack = true; if ("save" in st) saves.add(`save:${st.save}`); });
  return { attack, saves: [...saves] };
};

// The saves that run when the spell is cast: top-level save steps of a spell that is not a zone, or whose zone goes off at the cast.
const castSaves = (def) => (!def.zone || def.zone.atCast ? def.effects.filter((st) => "save" in st).map((st) => `save:${st.save}`) : []);

test("every SRD spell has a roll from the closed list", () => {
  assert.equal(spells.length, 339);
  for (const s of spells) assert.ok(SPELL_ROLLS.includes(s.roll), `${s.id}: roll ${JSON.stringify(s.roll)}`);
});

test("the roll agrees with the steps wherever the steps hold an attack or a save (so the data cannot drift)", () => {
  let checked = 0;
  for (const s of spells) {
    const { attack, saves } = fromSteps(s);
    if (attack) { assert.equal(s.roll, "attack", `${s.id} has an attack step`); checked++; }
    else if (castSaves(s).length) { assert.ok(castSaves(s).includes(s.roll), `${s.id}: steps make ${castSaves(s).join(" and ")} on the cast, roll is ${s.roll}`); checked++; }
    else if (saves.length) { assert.ok(saves.includes(s.roll) || s.roll === "none", `${s.id}: a later or nested save, roll is ${s.roll}`); checked++; }
    else assert.ok(!s.roll.startsWith("save:") || s.tier !== "auto", `${s.id}: an auto spell with no save step cannot say a save`);
  }
  assert.ok(checked >= 80, `only ${checked} spells checked`);
});

test("a spell's roll is not 'none' while its steps make one, and a spell with no roll step that says 'attack' is a hand-over to the DM", () => {
  for (const s of spells) {
    if (s.roll === "attack" && !fromSteps(s).attack) assert.notEqual(s.tier, "auto", `${s.id}`);
    if (s.roll === "none") assert.ok(!fromSteps(s).attack && !castSaves(s).length, s.id);
  }
});

test("the counts by kind of roll", () => {
  const n = {}; for (const s of spells) n[s.roll] = (n[s.roll] ?? 0) + 1;
  assert.deepEqual(n, { attack: 21, "save:dex": 37, none: 197, "save:wis": 38, "save:cha": 10, "save:con": 26, "save:str": 7, "save:int": 3 });
});

test("well-known spells", () => {
  const roll = (id) => spellRollById(id);
  assert.equal(roll("fire-bolt"), "attack");
  assert.equal(roll("ice-knife"), "attack");         // the attack decides; the Dexterity save of the burst follows hit or miss
  assert.equal(roll("fireball"), "save:dex");
  assert.equal(roll("hold-person"), "save:wis");
  assert.equal(roll("magic-missile"), "none");
  assert.equal(roll("bless"), "none");
  assert.equal(roll("nope"), null);
  assert.equal(SPELLS.fireball.roll, "save:dex");
});

test("a spell that does not say is read from its steps; one the steps cannot read shows nothing", () => {
  const bare = (id) => { const { roll, ...rest } = CONTENT.spells[id]; return rest; };
  assert.equal(spellRoll(bare("fire-bolt")), "attack");
  assert.equal(spellRoll(bare("fireball")), "save:dex");
  assert.equal(spellRoll(bare("magic-missile")), "none");         // auto, no roll step, no manual step
  assert.equal(spellRoll(bare("bestow-curse")), null);            // a manual step may hide a roll
  assert.equal(spellRoll({ ...bare("bestow-curse"), roll: "save:wis" }), "save:wis");
  assert.equal(spellRoll({ ...bare("fire-bolt"), roll: "bogus" }), "attack", "an unknown value is ignored by the reader of steps");
  assert.equal(spellRoll(null), null);
});

test("the linter takes the field as optional, refuses another value, and refuses one the steps contradict", () => {
  const ok = (e) => lintEntry("spells", e, { strict: false, keys: true });
  const { roll, ...bare } = CONTENT.spells.fireball;
  assert.deepEqual(ok(bare), []);
  assert.deepEqual(ok({ ...bare, roll: "save:dex" }), []);
  assert.match(ok({ ...bare, roll: "save:luck" }).join(), /`roll` is one of attack, save:str/);
  assert.match(ok({ ...bare, roll: "none" }).join(), /a Dexterity saving throw when it is cast, so `roll` is "save:dex"/);
  assert.match(ok({ ...bare, roll: "save:wis" }).join(), /so `roll` is "save:dex"/);
  assert.match(ok({ ...CONTENT.spells["fire-bolt"], roll: "save:dex" }).join(), /attack step, so `roll` is "attack"/);
  // A save inside another step's branch (a repeat or a side case) does not forbid none; an attack step still does.
  const nested = { ...bare, effects: [{ attack: "ranged", kind: "spell", onHit: [{ save: "con", onFail: [{ damage: "1d6", type: "fire" }] }] }] };
  assert.deepEqual(ok({ ...nested, roll: "attack" }), []);
  assert.match(ok({ ...nested, roll: "none" }).join(), /attack step/);
  const later = { ...bare, effects: [{ save: "dex", onFail: [{ save: "con", onFail: [{ condition: "prone" }] }] }] };
  assert.deepEqual(ok({ ...later, roll: "save:dex" }), []);
  const zone = { ...bare, duration: "1 minute", concentration: true, zone: { on: ["turnEnd"], once: "turn" }, effects: [{ save: "dex", onFail: [{ damage: "1d6", type: "fire" }] }] };
  assert.deepEqual(ok({ ...zone, roll: "none" }), []);       // a zone's save made only on later turns is a side case
  // A manual spell may say any roll: the steps do not show it.
  assert.deepEqual(ok({ ...CONTENT.spells["bestow-curse"], roll: "save:wis" }), []);
});

test("the reader says it in plain words", () => {
  const read = (e) => readEntry("spell", e, { pack: "x", srd: CONTENT }).lines.join("\n");
  assert.match(read(CONTENT.spells["fire-bolt"]), /Its roll: the caster makes a spell attack roll\./);
  assert.match(read(CONTENT.spells.fireball), /Its roll: the target makes a Dexterity saving throw\./);
  assert.match(read(CONTENT.spells["magic-missile"]), /Its roll: no attack roll and no saving throw\./);
  const { roll, ...bare } = CONTENT.spells.fireball;
  assert.match(read(bare), /Its roll: the target makes a Dexterity saving throw \(read from its steps/);
  const { roll: r2, ...manual } = CONTENT.spells["bestow-curse"];
  assert.match(read(manual), /Its roll: the entry does not say/);
});

test("the words a list shows", () => {
  assert.equal(rollLabel("attack"), "Attack");
  assert.equal(rollLabel("save:dex"), "DEX save");
  assert.equal(rollLabel("save:cha"), "CHA save");
  assert.equal(rollLabel("none"), "No roll");
  for (const bad of [null, undefined, "", "save:luck", "save:dex "]) assert.equal(rollLabel(bad), "");
});
