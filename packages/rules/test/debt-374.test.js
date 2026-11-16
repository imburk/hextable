// #374, Part C: gaps from docs/DEBT.md (W24, W26, W27), on hexes and the square room.
//   W26: a rider grown past its mount (Huge on a Large horse) is set down within 5 ft of the mount, as a Large one is,
//        instead of staying on, cramped, with no room to get down (world.js, riderLanding looked one cell round the mount).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current } from "../src/engine.js";
import { aiStep } from "../src/ai.js";
import { newGame } from "../src/scenario.js";
import { apartAt, footprint, overlapAt } from "../src/space.js";
import { coverOf } from "../src/sight.js";
import { gridOf } from "../src/grid.js";
import { squareRoom } from "./fixtures/square-room.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
const GRIDS = ["hex", "square"];
// Open ground on each map: the fighter and a warhorse beside it.
const SPOTS = { hex: { fighter: { q: -6, r: 2 }, horse: { q: -5, r: 2 } }, square: { fighter: { q: 3, r: 3 }, horse: { q: 4, r: 3 } } };
function table(grid) {
  const s = newGame(5);
  if (grid === "square") ok(apply(s, { type: "loadMap", map: squareRoom() }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  for (const id of Object.keys(s.entities)) if (id !== "fighter") ok(apply(s, { type: "remove", actor: id }, DM));
  s.entities.fighter.pos = { ...SPOTS[grid].fighter, z: 0 };
  const horse = ok(apply(s, { type: "spawn", monster: "warhorse", at: SPOTS[grid].horse, name: "Warhorse" }, DM)).events.find((e) => e.type === "spawned").id;
  s.entities[horse].side = "party";
  ok(apply(s, { type: "mount", actor: "fighter", mount: horse }, DM));
  assert.equal(s.entities.fighter.riding?.on, horse);
  return { s, horse };
}
const setDown = (s, e, m) => {
  const G = gridOf(s.map);
  assert.equal(e.riding, undefined, "no longer riding");
  assert.equal(m.rider, undefined);
  assert.ok(apartAt(s, m, m.pos, e, e.pos) <= 1, "within 5 ft of its mount");
  assert.ok(!overlapAt(m, m.pos, e, e.pos, G), `not in its mount's space: ${json(footprint(e, e.pos, G))} ${json(footprint(m, m.pos, G))}`);
};

for (const grid of GRIDS) {
  for (const size of ["large", "huge"]) {
    test(`${grid}: W26, a rider grown ${size} on a Large horse is put off within 5 ft of it`, () => {
      const { s, horse } = table(grid);
      const r = ok(apply(s, { type: "setSize", actor: "fighter", size }, DM));
      const e = s.entities.fighter, m = s.entities[horse];
      setDown(s, e, m);
      assert.ok(r.events.some((x) => x.id === "fighter" && /dismount|off|fell/i.test(x.type)), json(r.events.map((x) => x.type)));
      assert.equal(e.size, size);
    });
  }
}

// W27: a rider standing between an attacker and its target is measured at its raised height (sight.js, coverOf), as the
// attacker and the target are: between two creatures 10 ft up, a rider on a Large mount gives Half Cover; the same
// creature on its own feet, at the floor, does not.
test("hex: W27, a rider in the way gives cover at its raised height", () => {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (!["fighter", "wizard", "rogue"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  const { fighter: a, wizard: t, rogue: r } = s.entities;
  a.pos = { q: 0, r: 0, z: 10 }; t.pos = { q: 4, r: 0, z: 10 }; r.pos = { q: 2, r: 0, z: 0 };
  const others = Object.values(s.entities);
  assert.equal(coverOf(s, a, t, others), "none", "on its own feet it is below the line");
  r.riding = { on: "horse", size: "large" };
  assert.equal(coverOf(s, a, t, others), "half", "riding, it is on the line");
  r.pos = { q: 2, r: 2, z: 0 };
  assert.equal(coverOf(s, a, t, others), "none", "off the line, nothing");
});

// W24: the monster AI offers a mount its rider steers nothing it would be refused, and ends the turn of a creature dropped
// to 0 in its own turn instead of leaving the table waiting.
for (const grid of GRIDS) {
  test(`${grid}: W24, a steered mount on a turn of its own is played as ending its turn, not attacking`, () => {
    const { s, horse } = table(grid);
    const P = SPOTS[grid], at = grid === "hex" ? { q: P.horse.q + 2, r: P.horse.r } : { q: P.horse.q + 2, r: P.horse.r };
    ok(apply(s, { type: "spawn", monster: "goblin-warrior", at }, DM));
    ok(apply(s, { type: "startEncounter", center: P.horse, radius: 6 }, DM));
    // The rider cannot steer when the mount's place comes round, so the mount has its own turn; then it can again.
    s.entities.fighter.cond.incapacitated = true;
    for (let i = 0; i < 8 && current(s) !== horse; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    assert.equal(current(s), horse);
    delete s.entities.fighter.cond.incapacitated;
    const a = aiStep(s, horse);
    assert.deepEqual(a, { type: "endTurn", actor: horse });
    ok(apply(s, a, DM));
  });

  test(`${grid}: W24, a goblin dropped to 0 by an Opportunity Attack on its own turn has its turn ended by the AI`, () => {
    let done = false;
    for (let seed = 1; seed <= 40 && !done; seed++) {
      const s = newGame(seed);
      if (grid === "square") ok(apply(s, { type: "loadMap", map: squareRoom() }, DM));
      ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
      for (const id of Object.keys(s.entities)) if (id !== "fighter") ok(apply(s, { type: "remove", actor: id }, DM));
      const P = SPOTS[grid];
      s.entities.fighter.pos = { ...P.fighter, z: 0 };
      const gob = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: P.horse }, DM)).events.find((e) => e.type === "spawned").id;
      const far = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: P.horse.q + 4, r: P.horse.r } }, DM)).events.find((e) => e.type === "spawned").id;
      ok(apply(s, { type: "startEncounter", center: P.fighter, radius: 8 }, DM));
      for (let i = 0; i < 8 && current(s) !== gob; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
      s.entities[gob].hp = 1;
      ok(apply(s, { type: "move", actor: gob, to: { q: P.horse.q + 3, r: P.horse.r } }, DM));
      if (s.entities[gob].hp > 0) continue;
      assert.equal(current(s), gob, "its turn is still going");
      const a = aiStep(s, gob);
      assert.deepEqual(a, { type: "endTurn", actor: gob });
      ok(apply(s, a, DM));
      assert.notEqual(current(s), gob);
      assert.ok(far);
      done = true;
    }
    assert.ok(done, "an Opportunity Attack dropped it");
  });
}
