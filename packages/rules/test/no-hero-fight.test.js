// #771: a fight called where no party creature stands is refused, and nothing changes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const party = (s) => Object.values(s.entities).filter((e) => e.side === "party" && !e.dead);
const far = (s) => {   // a foe far from every party creature, so a radius-1 fight there holds only foes
  const foe = Object.values(s.entities).find((e) => e.side !== "party" && !e.object && e.pos);
  return foe.pos;
};

test("startEncounter with no party creature in range is refused and changes nothing", () => {
  const s = newGame(3);
  const center = far(s);
  const before = JSON.stringify(s);
  const res = apply(s, { type: "startEncounter", center, radius: 1 }, DM);
  assert.equal(res.ok, false);
  assert.match(res.error, /No party creature is in range/);
  assert.equal(JSON.stringify(s), before);
  assert.ok(!s.encounter);
});

test("startEncounter still starts when a party creature is in range", () => {
  const s = newGame(3);
  const res = apply(s, { type: "startEncounter", center: party(s)[0].pos, radius: 3 }, DM);
  assert.ok(res.ok, res.error);
  assert.ok(s.encounter.order.some((o) => s.entities[o.id].side === "party"));
});

test("a party creature inside the radius joins the fight as before", () => {
  const s = newGame(3);
  const foe = far(s);
  const res = apply(s, { type: "startEncounter", center: foe, radius: 100 }, DM);
  assert.ok(res.ok, res.error);
  const ids = new Set(s.encounter.order.map((o) => o.id));
  assert.ok(party(s).every((e) => ids.has(e.id)));
});
