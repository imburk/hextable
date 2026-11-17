// Riders the SRD gives only to attacks with weapons must not reach an Unarmed Strike; riders it gives to "a weapon or an
// Unarmed Strike" must (issue #445, DEBT T62 (1)). SRD 5.2 "Unarmed Strike": "Instead of using a weapon to make a melee attack,
// you can use a punch, kick, headbutt, or similar forceful blow." The table of riders is in the pull request.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { CONTENT } from "../src/content/index.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const A = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 14 };
const sheets = {
  paladin: { name: "Pa", class: "paladin", level: 11, subclass: "devotion", abilities: A, skills: ["athletics", "religion"], choices: { "fighting-style": "defense" }, armour: "chain-mail", weapons: ["longsword"] },
  paladin5: { name: "Pa", class: "paladin", level: 5, subclass: "devotion", abilities: A, skills: ["athletics", "religion"], choices: { "fighting-style": "defense" }, armour: "chain-mail", weapons: ["longsword"] },
  cleric: { name: "Cl", class: "cleric", level: 7, subclass: "life", abilities: A, skills: ["insight", "medicine"], choices: { "divine-order": "protector", "blessed-strikes": "divine-strike" }, armour: "chain-mail", weapons: ["mace"] },
  druid: { name: "Dr", class: "druid", level: 7, subclass: "land", abilities: A, skills: ["nature", "perception"], choices: { "primal-order": "warden", "elemental-fury": "primal-strike" }, armour: "leather-armor", weapons: ["quarterstaff"] },
  barbarian: { name: "Ba", class: "barbarian", level: 5, subclass: "berserker", abilities: { ...A, str: 18 }, skills: ["athletics", "survival"], weapons: ["greataxe"] },
  rogue: { name: "Ro", class: "rogue", level: 5, subclass: "thief", abilities: { ...A, dex: 18 }, skills: ["acrobatics", "stealth", "perception", "deception"], armour: "leather-armor", weapons: ["shortsword"] },
};

// The hero beside a goblin that cannot be missed (AC 1) and will not die, in a fight, on the hero's turn.
function field(sheet, seed, { prone = false } = {}) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  const foe = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 } }, DM)).events[0].id;
  Object.assign(s.entities[foe], { hp: 900, maxHp: 900, ac: 1 });
  if (prone) s.entities[foe].cond.prone = {};
  s.foe = foe;
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  for (let i = 0; i < 8 && current(s) !== "hero"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  return s;
}
// The extras a hit dealt, by damage type, and the notes. A miss (a natural 1) is tried again with another seed.
function swing(sheet, attack, { prep, prone } = {}) {
  for (let seed = 1; seed < 40; seed++) {
    const s = field(sheet, seed, { prone });
    prep?.(s, s.entities.hero);
    const r = ok(apply(s, { type: "attack", actor: "hero", target: s.foe, attack }, DM));
    if (!r.events.find((e) => e.type === "attack").hit) continue;
    const dmg = r.events.filter((e) => e.type === "damage");
    return { dmg, types: dmg.map((d) => d.dtype), notes: r.events.filter((e) => e.type === "note").map((e) => e.text).join(" | ") };
  }
  assert.fail("no hit in 40 seeds");
}
// A rider of a spell, worn the way a built character's feature is (reader-when.test.js).
const wear = (e, name, m) => { e.feats = [...(e.feats ?? []), { name, modifiers: [m] }]; };
const favor = (s, hero) => wear(hero, "Divine Favor", CONTENT.spells["divine-favor"].effects[0].modifier);

test("Divine Favor (SRD: \"your attacks with weapons\") adds 1d4 Radiant to a Longsword and not to a punch", () => {
  assert.deepEqual(CONTENT.spells["divine-favor"].effects[0].modifier.when, ["attack.hit", "attack.weapon"]);
  assert.ok(swing(sheets.paladin5, "longsword", { prep: favor }).types.includes("radiant"), "the Longsword");
  const punch = swing(sheets.paladin5, "unarmed-strike", { prep: favor });
  assert.deepEqual(punch.types, ["bludgeoning"], "the punch");
});

test("Cleric Divine Strike (\"an attack roll using a weapon\") reaches a Mace and not a punch", () => {
  const extra = (t) => t.types.some((x) => x === "radiant" || x === "necrotic");
  assert.ok(extra(swing(sheets.cleric, "mace")), "the Mace");
  assert.ok(!extra(swing(sheets.cleric, "unarmed-strike")), "the punch");
});

test("Druid Primal Strike (\"an attack roll using a weapon or a Beast form's attack\") reaches a Quarterstaff and not a punch", () => {
  const extra = (t) => t.types.some((x) => ["cold", "fire", "lightning", "thunder"].includes(x));
  assert.ok(extra(swing(sheets.druid, "quarterstaff")), "the Quarterstaff");
  assert.ok(!extra(swing(sheets.druid, "unarmed-strike")), "the punch");
});

test("Radiant Strikes (\"a Melee weapon or an Unarmed Strike\") reaches both, and is a Melee rider", () => {
  assert.ok(swing(sheets.paladin, "longsword").types.includes("radiant"), "the Longsword");
  assert.ok(swing(sheets.paladin, "unarmed-strike").types.includes("radiant"), "the punch");
  const ranged = derive({ ...sheets.paladin, weapons: ["longbow"] }).record.attacks.find((a) => a.id === "longbow");
  assert.ok(ranged, "a ranged weapon");
  assert.ok(!swing({ ...sheets.paladin, weapons: ["longbow"] }, "longbow").types.includes("radiant"), "a Longbow is not Melee");
  assert.deepEqual(CONTENT.classes.paladin.features.find((f) => f.id === "radiant-strikes").grants.modifiers[0].when, ["attack.hit", "attack.weaponOrUnarmed", "melee"]);
});

test("Rage damage (\"with either a weapon or an Unarmed Strike\") is added to a Strength punch", () => {
  const raging = (s) => ok(apply(s, { type: "feature", actor: "hero", feature: "rage" }, DM));
  const amount = (attack) => {
    for (let seed = 1; seed < 40; seed++) {
      const s = field(sheets.barbarian, seed);
      raging(s);
      const r = ok(apply(s, { type: "attack", actor: "hero", target: s.foe, attack }, DM));
      if (r.events.find((e) => e.type === "attack").hit) return r.events.filter((e) => e.type === "damage").reduce((n, e) => n + e.amount, 0);
    }
    assert.fail("no hit");
  };
  // 1 + Strength modifier (+4) = 5, and Rage's +2 at level 5 on top: 7. (A critical hit doubles the dice, not the bonus: the punch has none.)
  assert.equal(amount("unarmed-strike"), 7);
});

test("Sneak Attack needs a Finesse or Ranged weapon: a Rogue's punch never carries it", () => {
  assert.match(swing(sheets.rogue, "shortsword", { prone: true }).notes, /Sneak Attack/);
  assert.doesNotMatch(swing(sheets.rogue, "unarmed-strike", { prone: true }).notes, /Sneak Attack/);
});

test("a creature's attack that names no weapon and is not an Unarmed Strike still counts as a weapon attack, as before", () => {
  const claw = (s, hero) => { hero.attacks.push({ id: "claw", name: "Claw", type: "melee", bonus: 5, damage: "1d6+3", dtype: "slashing", reach: 5 }); favor(s, hero); };
  const t = swing(sheets.paladin5, "claw", { prep: claw });
  assert.deepEqual(t.types, ["slashing", "radiant"]);
});

test("the bonus Unarmed Strike of a Monk is an Unarmed Strike too", () => {
  const monk = { name: "Mo", class: "monk", level: 5, subclass: "open-hand", abilities: { ...A, dex: 16, wis: 14 }, skills: ["acrobatics", "insight"], weapons: [] };
  for (const id of ["unarmed-strike", "unarmed-strike-bonus"]) assert.deepEqual(swing(monk, id, { prep: favor }).types, ["bludgeoning"], id);
});
