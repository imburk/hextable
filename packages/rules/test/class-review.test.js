// Fixes from the independent review of the class features at levels 7 to 15 (#166, #169), each
// pinned by a test against the SRD 5.2.1 text (reference/srd52/srd52-flow.txt).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" }, PAT = { role: "player", userId: "pat" }, KIM = { role: "player", userId: "kim" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); };

// A field with the sheet's character as "hero" (Pat's), the rogue and one monster.
function field(sheet, more = {}) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (!["rogue", "m1"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 }, ...more });
  ok(apply(s, { type: "claim", entity: "hero", user: "pat", userName: "Pat" }, PAT));
  ok(apply(s, { type: "place", actor: "rogue", to: { q: -3, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "m1", to: { q: 2, r: 0 } }, DM));
  s.entities.m1.hp = s.entities.m1.maxHp = 300;
  return s;
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 20 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };

const druid = (level, land = "polar") => ({ name: "Ven", class: "druid", level, subclass: "land", abilities: { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 },
  skills: ["nature", "perception"], choices: { "primal-order": "warden", "elemental-fury": "primal-strike", "natures-ward": land },
  armour: "leather-armor", shield: true, weapons: ["quarterstaff"], spells: ["produce-flame", "cure-wounds"] });

// H1. "Your game statistics are replaced by the Beast's stat block, but you retain ... class features
// ... and feats" (Wild Shape, Rules While Shape-Shifted). Nature's Ward is a class feature.
test("Wild Shape keeps Nature's Ward: the form adds the Beast's defences to the druid's own", () => {
  const s = field(druid(10)), e = s.entities.hero;
  ok(apply(s, { type: "feature", actor: "hero", feature: "wild-shape", form: "wolf" }, DM));
  assert.equal(e.form.block, "wolf");
  assert.deepEqual(e.conditionImmune, ["poisoned"]);
  assert.deepEqual(e.resist, ["cold"]);
  no(apply(s, { type: "condition", actor: "hero", condition: "poisoned" }, DM), /immune to Poisoned/);
  // Leaving the form puts the record back as it was.
  ok(apply(s, { type: "feature", actor: "hero", feature: "wild-shape" }, DM));
  assert.deepEqual(e.conditionImmune, ["poisoned"]);
  assert.deepEqual(e.resist, ["cold"]);
});

const sorc = (level, mm = ["careful", "quickened"]) => ({ name: "Jed", class: "sorcerer", level, subclass: "draconic", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 18 },
  skills: ["arcana", "insight"], choices: { metamagic: mm, "elemental-affinity": "fire", "metamagic-10": ["heightened", "twinned"] },
  spells: ["fire-bolt", "shocking-grasp", "fireball", "hold-person", "haste", "scorching-ray", "burning-hands"] });
const caster = (sheet) => { const s = field(sheet); for (const e of Object.values(s.entities)) e.hp = e.maxHp = 300; fight(s); turnOf(s, "hero"); return s; };

// M1. Careful Spell: "When you cast a spell that forces other creatures to make a saving throw, you
// can protect some of those creatures" (Metamagic Options). The caster is not one of them.
test("Careful Spell protects other creatures, not the caster, and a refusal changes nothing", () => {
  const s = caster(sorc(15)), snap = JSON.stringify(s);
  no(apply(s, { type: "cast", actor: "hero", spell: "fireball", hex: { q: 0, r: 0 }, slot: 3, metamagic: ["careful"], careful: ["hero"] }, DM), /other creatures/);
  assert.equal(JSON.stringify(s), snap);
  ok(apply(s, { type: "cast", actor: "hero", spell: "fireball", hex: { q: 1, r: 0 }, slot: 3, metamagic: ["careful"], careful: ["m1"] }, DM));
});
