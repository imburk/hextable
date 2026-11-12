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
