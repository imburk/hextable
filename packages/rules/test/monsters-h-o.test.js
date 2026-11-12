// The SRD 5.2.1 monsters and animals H to O: they load, they lint, and the AI can play them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import { CONTENT, MONSTERS, PACKS } from "../src/content/index.js";
import { lintPack, SIZES } from "../src/content/schema.js";
import { monsters as batch } from "../src/content/srd52/monsters-h-o.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };

// Every SRD 5.2.1 stat block whose name begins H to O, found by listing the names in the SRD's Monsters A-Z and
// Animals sections. The knight's heading is misprinted "Iron Golem" in the SRD text; its stat block is the knight's.
const EXPECTED = [
  "half-dragon", "harpy", "hell-hound", "hezrou", "hill-giant", "hippogriff", "hobgoblin-captain", "hobgoblin-warrior", "homunculus",
  "horned-devil", "hydra", "ice-devil", "imp", "incubus", "invisible-stalker", "iron-golem", "knight", "kobold-warrior", "kraken", "lamia",
  "lemure", "lich", "mage", "magmin", "manticore", "marilith", "medusa", "ice-mephit", "magma-mephit",
  "merfolk-skirmisher", "merrow", "mimic", "minotaur-of-baphomet", "minotaur-skeleton", "mummy", "mummy-lord", "nalfeshnee", "night-hag",
  "nightmare", "noble", "ochre-jelly", "ogre", "ogre-zombie", "oni", "otyugh", "owlbear",
  "hawk", "hippopotamus", "hunter-shark", "hyena", "jackal", "killer-whale", "lion", "lizard", "mammoth", "mastiff", "mule", "owl",
];

test("the H to O monsters lint clean, are all there, and every id is unique across the pack", () => {
  assert.deepEqual(lintPack(PACKS[0]), []);
  const ids = PACKS[0].monsters.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(batch.map((m) => m.id).sort(), [...EXPECTED].sort());
  for (const m of batch) {
    assert.ok(CONTENT.monsters[m.id], m.id);
    assert.ok(SIZES.includes(m.size), m.id);
    assert.equal(m.source, "SRD 5.2.1");
    assert.match(m.name[0], /[A-Z]/);
    assert.ok(/^[h-o]/i.test(m.name), `${m.name} does not begin with H to O`);
  }
});

test("size, speeds, hover and skills come through the bridge to the engine", () => {
  assert.equal(MONSTERS["kraken"].size, "gargantuan");
  assert.equal(MONSTERS["kraken"].speeds.swim, 120);
  assert.equal(MONSTERS["horned-devil"].speeds.fly, 60);
  assert.equal(MONSTERS["marilith"].speeds.climb, 40);
  assert.equal(MONSTERS["hydra"].speeds.swim, 40);
  assert.equal(MONSTERS["invisible-stalker"].hover, true);
  assert.equal(MONSTERS["nightmare"].hover, true);
  assert.equal(MONSTERS["oni"].hover, true);
  assert.equal(MONSTERS["hawk"].hover, undefined);
  assert.equal(MONSTERS["imp"].size, "tiny");
  assert.equal(MONSTERS["mummy-lord"].skillBonus.perception, 9);
  assert.equal(MONSTERS["lich"].skillBonus.arcana, 19);
  assert.deepEqual(MONSTERS["hell-hound"].immune, ["fire"]);
  assert.deepEqual(MONSTERS["ice-mephit"].immune.sort(), ["cold", "poison"]);
  assert.deepEqual(MONSTERS["ice-mephit"].vuln, ["fire"]);
  assert.equal(MONSTERS["hobgoblin-warrior"].features.packTactics, true);
});

test("the entries marked checked are the ones compared with the SRD text, and none is left half-entered", () => {
  for (const m of batch) {
    assert.equal(typeof m.checked, "boolean", m.id);
    if (m.tier === "auto") assert.ok(!JSON.stringify(m).includes('"manual"'), `${m.id} is auto but has a manual step`);
    assert.ok(m.actions.length > 0, m.id);
  }
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

test("a Gargantuan swimmer, a Huge brute, a Tiny flyer and a hovering Large monster each take a turn through aiStep", () => {
  for (const m of ["kraken", "hill-giant", "imp", "invisible-stalker", "hydra", "owlbear", "mammoth", "nightmare"]) takeATurn(m);
});

test("every H to O monster can be spawned and take one AI turn without the engine throwing", () => {
  for (const m of batch) takeATurn(m.id);
});

test("two monsters from the batch play several full rounds against the heroes", () => {
  const s = newGame(9);
  const hero = s.entities.fighter.pos;
  for (const [id, dq, dr] of [["ogre", 3, 0], ["hyena", 3, 2]]) ok(apply(s, { type: "spawn", monster: id, at: { q: hero.q + dq, r: hero.r + dr } }, DM));
  ok(apply(s, { type: "startEncounter", center: hero, radius: 30 }, DM));
  for (let i = 0; i < 60 && s.encounter; i++) {
    const id = current(s);
    let res = apply(s, aiStep(s, id) ?? { type: "endTurn", actor: id }, DM);
    if (!res.ok) res = apply(s, { type: "endTurn", actor: id }, DM);
    assert.ok(res.ok, res.error);
  }
});
