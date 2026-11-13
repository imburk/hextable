// Fixes from the independent review of the class features at levels 7 to 15 (#166, #169), each
// pinned by a test against the SRD 5.2.1 text (reference/srd52/srd52-flow.txt).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";
import { describeStep, mark } from "../src/history.js";
import { diff, snapshot } from "../src/patch.js";

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

// L2. Malformed input is a clean refusal, never a throw.
test("junk Metamagic input is refused cleanly and changes nothing", () => {
  const s = caster(sorc(15)), snap = JSON.stringify(s);
  const junk = [{ metamagic: 5, careful: ["m1"] }, { metamagic: {}, heightened: "m1" }, { metamagic: "careful", careful: ["m1"] }, { metamagic: { length: 1 }, transmute: "cold" },
    { metamagic: [5] }, { metamagic: [null] }, { metamagic: ["careful"], careful: "m1" }, { metamagic: ["careful"], careful: [{}] }, { metamagic: ["heightened"], heightened: ["m1"] }];
  for (const x of junk) {
    let r;
    assert.doesNotThrow(() => { r = apply(s, { type: "cast", actor: "hero", spell: "fireball", hex: { q: 1, r: 0 }, slot: 3, ...x }, DM); }, JSON.stringify(x));
    assert.equal(r.ok, false, JSON.stringify(x));
    assert.equal(JSON.stringify(s), snap);
  }
});

// M2. A foe who changed shape where the party could not see it is, to them, a wolf: nothing sent to
// a player (views, patches, events, the record's labels) names the druid while it is in the form.
test("a foe in a Wild Shape form is only the Beast to players: views, patches, events and labels", () => {
  const s = field(druid(10));
  s.entities.foe = makeEntity({ ...derive({ ...druid(10), name: "Archdruid Maelis" }).record, look: { color: "#123456" } }, { id: "foe", kind: "npc", side: "foe", pos: { q: 1, r: 1, z: 0 } });
  const said = [];
  const step = (action) => {
    const before = mark(s), v0 = snapshot(view(s, PAT));
    const r = ok(apply(s, action, DM));
    said.push(viewEvents(r.events, s, PAT), describeStep(action, r.events, before, s).shown, view(s, PAT), diff(v0, snapshot(view(s, PAT)), view(s, PAT)));
    return r;
  };
  ok(apply(s, { type: "reveal", actor: "foe", hidden: true }, DM));
  step({ type: "feature", actor: "foe", feature: "wild-shape", form: "wolf" });
  ok(apply(s, { type: "reveal", actor: "foe", hidden: false }, DM));
  const v = view(s, PAT).entities.foe;
  assert.equal(v.name, "Wolf"); assert.equal(v.tpl, "wolf"); assert.equal(v.kind, "npc"); assert.equal(v.size, "medium");
  assert.equal(v.form, undefined); assert.equal(v.look, undefined);
  step({ type: "move", actor: "foe", to: { q: -2, r: 0 } });
  step({ type: "harm", actor: "foe", amount: 3, dtype: "slashing" });
  step({ type: "condition", actor: "foe", condition: "prone" });
  fight(s); turnOf(s, "foe");
  s.encounter.budget.action = 1;
  step({ type: "act", actor: "foe", action: "bite", target: "rogue" });
  step({ type: "endTurn", actor: "foe" });
  for (const x of [...said, s.timeline.map((t) => viewEvents([t], s, PAT))]) assert.doesNotMatch(JSON.stringify(x) ?? "", /Maelis|#123456/);
  assert.ok(said.some((x) => typeof x === "string" && /Wolf/.test(x)), "the labels name the Wolf");
  // The DM sees who it is, and the party's own druid in a form is open to its players.
  assert.equal(view(s, DM).entities.foe.name, "Archdruid Maelis");
  ok(apply(s, { type: "endEncounter" }, DM));
  ok(apply(s, { type: "feature", actor: "hero", feature: "wild-shape", form: "wolf" }, DM));
  assert.equal(view(s, KIM).entities.hero.name, "Ven");
  assert.equal(view(s, KIM).entities.hero.form.block, "wolf");
});

const cleric = (level) => ({ name: "San", class: "cleric", level, subclass: "life", abilities: { str: 14, dex: 10, con: 14, int: 10, wis: 16, cha: 10 },
  skills: ["insight", "medicine"], choices: { "divine-order": "protector", "blessed-strikes": "divine-strike" }, armour: "chain-mail", shield: true,
  weapons: ["warhammer"], spells: ["sacred-flame"] });

// M3. Divine Intervention casts a spell; the `feature` action cannot, so it is refused and spends nothing.
test("Divine Intervention through `feature` is refused and keeps its use; `cast` with `via` casts", () => {
  const s = field(cleric(10)), snap = JSON.stringify(s);
  no(apply(s, { type: "feature", actor: "hero", feature: "divine-intervention" }, DM), /cast/i);
  assert.equal(JSON.stringify(s), snap);
  assert.equal(s.entities.hero.uses["divine-intervention"], 1);
  ok(apply(s, { type: "cast", actor: "hero", spell: "healing-word", target: "hero", via: "divine-intervention" }, DM));
  assert.equal(s.entities.hero.uses["divine-intervention"], 0);
});

const paladin = (level, more = {}) => ({ name: "Ka", class: "paladin", level, subclass: "devotion", abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 16 },
  skills: ["athletics", "religion"], choices: { "fighting-style": "defense" }, armour: "chain-mail", weapons: ["longsword", "light-crossbow", "unarmed-strike"], ...more });

// M4. Radiant Strikes: "When you hit a target with an attack roll using a Melee weapon or an Unarmed
// Strike, the target takes an extra 1d8 Radiant damage" (Paladin, level 11).
test("Radiant Strikes through apply(): a melee weapon or Unarmed Strike hit adds 1d8 Radiant; a ranged one, a miss or level 10 does not", () => {
  const strike = (level, attack, ac) => {
    const s = field(paladin(level));
    ok(apply(s, { type: "place", actor: "m1", to: { q: 1, r: 0 } }, DM));
    s.entities.m1.ac = ac;
    fight(s); turnOf(s, "hero");
    return ok(apply(s, { type: "attack", actor: "hero", target: "m1", attack }, DM)).events.filter((x) => x.type === "damage");
  };
  for (const w of ["longsword", "unarmed-strike"]) {
    const d = strike(11, w, -30), rad = d.filter((x) => x.dtype === "radiant");
    assert.equal(rad.length, 1, w);
    assert.ok(rad[0].dice.length >= 1 && rad[0].dice.every((x) => x.sides === 8) && rad[0].bonus === 0, w);
    assert.equal(rad[0].by, "hero");
  }
  assert.equal(strike(11, "light-crossbow", -30).filter((x) => x.dtype === "radiant").length, 0, "a ranged weapon");
  assert.equal(strike(11, "longsword", 99).length, 0, "a miss");
  assert.equal(strike(10, "longsword", -30).filter((x) => x.dtype === "radiant").length, 0, "before level 11");
});

// L1. `restore` naming one creature twice would spend one use twice.
test("a Short Rest's restore names each creature once; a duplicate is refused and changes nothing", () => {
  const s = field(sorc(10));
  s.entities.hero.uses["font-of-magic"] = 0;
  const snap = JSON.stringify(s);
  no(apply(s, { type: "shortRest", restore: ["hero", "hero"] }, DM), /once/);
  assert.equal(JSON.stringify(s), snap);
  ok(apply(s, { type: "shortRest", restore: ["hero"] }, DM));
  assert.equal(s.entities.hero.uses["sorcerous-restoration"], 0);
  assert.equal(s.entities.hero.uses["font-of-magic"], 5);
});
