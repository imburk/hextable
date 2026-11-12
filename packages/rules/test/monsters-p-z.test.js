// The SRD 5.2.1 monsters and animals P to Z (issue: monsters P to Z): they load, they lint, and the AI can play them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import { CONTENT, MONSTERS, PACKS } from "../src/content/index.js";
import { lintPack, SIZES } from "../src/content/schema.js";
import { monsters as batch } from "../src/content/srd52/monsters-p-z.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };

test("the P to Z monsters lint clean and every id is unique across the pack", () => {
  assert.deepEqual(lintPack(PACKS[0]), []);
  const ids = PACKS[0].monsters.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(batch.length >= 100);
  for (const m of batch) {
    assert.ok(CONTENT.monsters[m.id], m.id);
    assert.ok(SIZES.includes(m.size), m.id);
    assert.equal(m.source, "SRD 5.2.1");
    assert.match(m.name, /^[P-Z]/, `${m.id} does not begin with P to Z`);
  }
});

test("Skeleton and Wolf stay where they were and are not entered twice", () => {
  assert.equal(batch.some((m) => m.id === "skeleton" || m.id === "wolf"), false);
  assert.ok(CONTENT.monsters.skeleton);
  assert.ok(CONTENT.monsters.wolf);
});

test("the names the SRD lists for P to Z are all entered", () => {
  const wanted = ["pegasus", "phase-spider", "pirate", "pirate-captain", "pit-fiend", "planetar", "priest", "priest-acolyte", "pseudodragon",
    "purple-worm", "quasit", "rakshasa", "red-dragon-wyrmling", "remorhaz", "roc", "roper", "rust-monster", "sahuagin-warrior", "salamander",
    "satyr", "scout", "sea-hag", "shadow", "shambling-mound", "shield-guardian", "shrieker-fungus", "silver-dragon-wyrmling", "solar",
    "specter", "sphinx-of-lore", "sphinx-of-valor", "sphinx-of-wonder", "spirit-naga", "sprite", "spy", "steam-mephit", "stirge",
    "stone-giant", "stone-golem", "storm-giant", "succubus", "swarm-of-crawling-claws", "tarrasque", "tough", "tough-boss", "treant", "troll",
    "troll-limb", "unicorn", "vampire", "vampire-familiar", "vampire-spawn", "violet-fungus", "vrock", "warhorse-skeleton", "warrior-infantry",
    "warrior-veteran", "water-elemental", "werebear", "wereboar", "wererat", "weretiger", "werewolf", "white-dragon-wyrmling", "wight",
    "will-o-wisp", "winter-wolf", "worg", "wraith", "wyvern", "xorn", "zombie",
    "young-black-dragon", "young-blue-dragon", "young-brass-dragon", "young-bronze-dragon", "young-copper-dragon", "young-gold-dragon",
    "young-green-dragon", "young-red-dragon", "young-silver-dragon", "young-white-dragon",
    "panther", "piranha", "plesiosaurus", "polar-bear", "pony", "pteranodon", "rat", "raven", "reef-shark", "rhinoceros", "riding-horse",
    "saber-toothed-tiger", "scorpion", "seahorse", "spider", "swarm-of-bats", "swarm-of-insects", "swarm-of-piranhas", "swarm-of-rats",
    "swarm-of-ravens", "swarm-of-venomous-snakes", "tiger", "triceratops", "tyrannosaurus-rex", "venomous-snake", "vulture", "warhorse", "weasel"];
  for (const id of wanted) assert.ok(CONTENT.monsters[id], id);
  assert.equal(batch.length, wanted.length - 7);          // seven of the Young dragons are entered with the A to G dragons
});

test("size, every speed, hover and skills come through the bridge to the engine", () => {
  assert.equal(MONSTERS["pit-fiend"].size, "large");
  assert.equal(MONSTERS["tarrasque"].size, "gargantuan");
  assert.equal(MONSTERS["pegasus"].speeds.fly, 90);
  assert.equal(MONSTERS["purple-worm"].speeds.burrow, 50);
  assert.equal(MONSTERS["tarrasque"].speeds.climb, 60);
  assert.equal(MONSTERS["water-elemental"].speeds.swim, 90);
  assert.equal(MONSTERS["white-dragon-wyrmling"].speeds.burrow, 15);
  assert.equal(MONSTERS["planetar"].hover, true);
  assert.equal(MONSTERS["storm-giant"].hover, true);
  assert.equal(MONSTERS["pony"].hover, undefined);
  assert.equal(MONSTERS["phase-spider"].skillBonus.stealth, 7);
  assert.equal(MONSTERS["sphinx-of-lore"].skillBonus.arcana, 12);
});

test("honest tiers: simple animals are auto, anything the engine cannot run is not", () => {
  for (const id of ["pegasus", "pony", "riding-horse"]) assert.equal(CONTENT.monsters[id].tier, "auto", id);
  assert.equal(CONTENT.monsters["shrieker-fungus"].tier, "manual");
  assert.equal(CONTENT.monsters["vampire"].tier, "assist");
  for (const m of batch) if (m.tier === "auto") {
    assert.equal(m.traits.every((t) => t.modifiers.length > 0), true, `${m.id} is auto but has a text-only trait`);
    assert.equal(JSON.stringify(m.actions).includes('"manual"'), false, `${m.id} is auto but has a manual step`);
  }
  for (const m of batch) if (m.tier === "manual") assert.equal(m.actions.every((a) => a.effects.every((s) => "manual" in s)), true, m.id);
});

// Put a monster next to the heroes, start the fight, and let the AI play its turn.
function takeATurn(monster) {
  const s = newGame(5);
  const hero = s.entities.fighter.pos;
  let id = null;
  for (const [dq, dr] of [[2, 0], [3, 0], [3, -1], [4, -1], [-3, 2], [4, 1], [-4, 3], [5, 0], [6, 0], [6, -2], [-5, 3]]) {
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

test("a Gargantuan walker, a Huge flyer, a swimmer and a tiny flyer each take a turn through aiStep", () => {
  for (const m of ["tarrasque", "roc", "purple-worm", "storm-giant", "pegasus", "water-elemental", "stirge", "pit-fiend", "swarm-of-bats"]) takeATurn(m);
});

test("every P to Z monster can be spawned and take one AI turn without the engine throwing", () => {
  for (const m of batch) takeATurn(m.id);
});

test("two monsters from the batch play several full rounds against the heroes", () => {
  const s = newGame(9);
  const hero = s.entities.fighter.pos;
  for (const [id, dq, dr] of [["pegasus", 3, 0], ["panther", 3, 2]]) ok(apply(s, { type: "spawn", monster: id, at: { q: hero.q + dq, r: hero.r + dr } }, DM));
  ok(apply(s, { type: "startEncounter", center: hero, radius: 30 }, DM));
  for (let i = 0; i < 60 && s.encounter; i++) {
    const id = current(s);
    let res = apply(s, aiStep(s, id) ?? { type: "endTurn", actor: id }, DM);
    if (!res.ok) res = apply(s, { type: "endTurn", actor: id }, DM);
    assert.ok(res.ok, res.error);
  }
});
