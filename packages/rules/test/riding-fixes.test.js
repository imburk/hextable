// #374, Part C: riding gaps from docs/DEBT.md, on hexes and the square room.
//   W26: a rider grown past its mount (Huge on a Large horse) is set down within 5 ft of the mount, as a Large one is,
//        instead of staying on, cramped, with no room to get down (world.js, riderLanding looked one cell round the mount).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { apartAt, footprint, overlapAt } from "../src/space.js";
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
