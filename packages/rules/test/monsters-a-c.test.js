// The SRD 5.2.1 monsters A to C (issue #20): they load, they lint, and the AI can play them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import { CONTENT, MONSTERS, PACKS } from "../src/content/index.js";
import { lintPack, SIZES } from "../src/content/schema.js";
import { monsters as batch } from "../src/content/srd52/monsters-a-c.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };

test("the A to C monsters lint clean and every id is unique across the pack", () => {
  assert.deepEqual(lintPack(PACKS[0]), []);
  const ids = PACKS[0].monsters.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(batch.length >= 40);
  for (const m of batch) {
    assert.ok(CONTENT.monsters[m.id], m.id);
    assert.ok(SIZES.includes(m.size), m.id);
    assert.equal(m.source, "SRD 5.2.1");
  }
});

test("size, flight and hover come through the bridge to the engine", () => {
  assert.equal(MONSTERS["balor"].size, "huge");
  assert.equal(MONSTERS["balor"].speeds.fly, 80);
  assert.equal(MONSTERS["air-elemental"].hover, true);
  assert.equal(MONSTERS["bulette"].speeds.burrow, 40);
  assert.equal(MONSTERS["bat"].hover, undefined);
  assert.equal(MONSTERS["assassin"].skillBonus.stealth, 10);
});

// Put a monster next to the heroes, start the fight, and let the AI play its turn.
function takeATurn(monster) {
  const s = newGame(5);
  const hero = s.entities.fighter.pos;
  let id = null;
  for (const [dq, dr] of [[2, 0], [3, 0], [3, -1], [4, -1], [-3, 2], [4, 1], [-4, 3], [5, 0]]) {
    const r = apply(s, { type: "spawn", monster, at: { q: hero.q + dq, r: hero.r + dr } }, DM);
    if (r.ok) { id = r.events[0].id; break; }
  }
  assert.ok(id, `no room to place ${monster}`);
  ok(apply(s, { type: "startEncounter", center: s.entities[id].pos, radius: 30 }, DM));
  for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.equal(current(s), id);
  const action = aiStep(s, id) ?? { type: "endTurn", actor: id };
  const res = apply(s, action, DM);
  assert.ok(res.ok, `${monster}: ${JSON.stringify(action)}: ${res.error}`);
  return s;
}

test("a Large monster, a Huge flyer and a small flyer each take a turn through aiStep", () => {
  for (const m of ["bulette", "balor", "animated-flying-sword", "air-elemental", "chimera", "cockatrice", "ankylosaurus"]) takeATurn(m);
});

test("every A to C monster can be spawned and take one AI turn without the engine throwing", () => {
  for (const m of batch) takeATurn(m.id);
});

test("two monsters from the batch play several full rounds against the heroes", () => {
  const s = newGame(9);
  const hero = s.entities.fighter.pos;
  for (const [id, dq, dr] of [["axe-beak", 3, 0], ["bat", 3, 2]]) ok(apply(s, { type: "spawn", monster: id, at: { q: hero.q + dq, r: hero.r + dr } }, DM));
  ok(apply(s, { type: "startEncounter", center: hero, radius: 30 }, DM));
  for (let i = 0; i < 60 && s.encounter; i++) {
    const id = current(s);
    let res = apply(s, aiStep(s, id) ?? { type: "endTurn", actor: id }, DM);
    if (!res.ok) res = apply(s, { type: "endTurn", actor: id }, DM);
    assert.ok(res.ok, res.error);
  }
});

// Every stat block the SRD 5.2.1 index lists under A, B or C is in the pack, plus the young dragons of the
// five colours whose wyrmlings sort here. (Young Gold, Green, Red, Silver and White sort under Y.)
const SRD_A_TO_C = [
  "Aboleth", "Adult Black Dragon", "Adult Blue Dragon", "Adult Brass Dragon", "Adult Bronze Dragon", "Adult Copper Dragon",
  "Adult Gold Dragon", "Adult Green Dragon", "Adult Red Dragon", "Adult Silver Dragon", "Adult White Dragon", "Air Elemental",
  "Allosaurus", "Ancient Black Dragon", "Ancient Blue Dragon", "Ancient Brass Dragon", "Ancient Bronze Dragon", "Ancient Copper Dragon",
  "Ancient Gold Dragon", "Ancient Green Dragon", "Ancient Red Dragon", "Ancient Silver Dragon", "Ancient White Dragon",
  "Animated Armor", "Animated Flying Sword", "Animated Rug of Smothering", "Ankheg", "Ape", "Archelon", "Archmage",
  "Assassin", "Awakened Shrub", "Awakened Tree", "Axe Beak", "Azer Sentinel", "Baboon", "Badger", "Balor", "Bandit",
  "Bandit Captain", "Barbed Devil", "Basilisk", "Bat", "Bearded Devil", "Behir", "Berserker", "Black Bear", "Black Dragon Wyrmling",
  "Black Pudding", "Blink Dog", "Blood Hawk", "Blue Dragon Wyrmling", "Boar", "Bone Devil", "Brass Dragon Wyrmling",
  "Bronze Dragon Wyrmling", "Brown Bear", "Bugbear Stalker", "Bugbear Warrior", "Bulette", "Camel", "Cat", "Centaur Trooper",
  "Chain Devil", "Chimera", "Chuul", "Clay Golem", "Cloaker", "Cloud Giant", "Cockatrice", "Commoner", "Constrictor Snake",
  "Copper Dragon Wyrmling", "Couatl", "Crab", "Crocodile", "Cultist", "Cultist Fanatic", "Young Black Dragon", "Young Blue Dragon",
  "Young Brass Dragon", "Young Bronze Dragon", "Young Copper Dragon",
];

test("every SRD monster named A to C is in the pack, and every entry has been compared with the SRD text", () => {
  const have = new Set(PACKS[0].monsters.map((m) => m.name));
  assert.deepEqual(SRD_A_TO_C.filter((n) => !have.has(n)), []);
  for (const m of batch) assert.equal(m.checked, true, `${m.id} is not checked`);
  for (const id of ["goblin-warrior", "wolf", "skeleton"]) assert.equal(CONTENT.monsters[id].checked, true, `${id} is not checked`);
});

test("corrections and additions from the SRD check", () => {
  assert.deepEqual(MONSTERS.wolf.skillBonus, { perception: 5, stealth: 4 });
  assert.ok(CONTENT.monsters.skeleton.traits.some((t) => t.id === "condition-immunities"));
  assert.ok(CONTENT.monsters.bulette.actions.some((a) => a.id === "leap"));
  const stalker = CONTENT.monsters["bugbear-stalker"];
  assert.deepEqual([stalker.cr, stalker.ac, stalker.hp, stalker.pb], [3, 15, 65, 2]);
  assert.deepEqual(stalker.actions.map((a) => a.id), ["javelin", "javelin-thrown", "morningstar", "quick-grapple"]);
  const archmage = CONTENT.monsters.archmage;
  assert.deepEqual([archmage.cr, archmage.xp, archmage.ac, archmage.hp], [12, 8000, 17, 170]);
  assert.deepEqual(archmage.actions.map((a) => a.effects[0].bonus), [9, 9]);
  const red = MONSTERS["ancient-red-dragon"];
  assert.deepEqual([red.size, red.hp, red.ac, red.speeds], ["gargantuan", 507, 22, { climb: 40, fly: 80 }]);
  assert.deepEqual(red.immune, ["fire"]);
  assert.equal(CONTENT.monsters["adult-green-dragon"].traits.some((t) => /Poisoned/.test(t.text)), true);
  assert.equal(CONTENT.monsters["adult-silver-dragon"].actions.find((a) => a.id === "cold-breath").effects[0].dc, 20);
});

// Arithmetic that every dragon's stat block obeys: the Rend attack is Strength plus proficiency, and a
// breath weapon's save is 8 plus proficiency plus Constitution.
test("each A to C dragon's Rend bonus and breath save DCs follow from its ability scores", () => {
  const mod = (n) => Math.floor((n - 10) / 2);
  const dragons = batch.filter((m) => m.type === "dragon");
  assert.equal(dragons.length, 5 + 5 + 20);
  for (const m of dragons) {
    const rend = m.actions.find((a) => a.id === "rend");
    assert.equal(rend.effects[0].bonus, mod(m.abilities.str) + m.pb, `${m.id} Rend`);
    for (const a of m.actions) {
      const save = a.effects[0].save;
      if (save && /breath/.test(a.id)) assert.equal(a.effects[0].dc, 8 + m.pb + mod(m.abilities.con), `${m.id} ${a.id}`);
    }
    assert.equal(m.immune.length, 1, m.id);
  }
});
