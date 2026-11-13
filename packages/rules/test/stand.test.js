// Standing up from Prone during a turn (docs/specs/table-ui.md, E14).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (res) => { assert.ok(res.ok, res.error); return res; };

test("stand: on its turn a prone creature stands for half its Speed; not on another's turn; not when not Prone", () => {
  const s = newGame(5);
  ok(apply(s, { type: "startEncounter", center: s.entities.m1.pos, radius: 30 }, DM));
  const id = current(s), e = s.entities[id];
  assert.match(apply(s, { type: "stand", actor: id }, DM).error, /not Prone/);
  ok(apply(s, { type: "condition", actor: id, condition: "prone" }, DM));
  const other = s.encounter.order.map((o) => o.id).find((x) => x !== id && s.entities[x].hp > 0);
  ok(apply(s, { type: "condition", actor: other, condition: "prone" }, DM));
  assert.match(apply(s, { type: "stand", actor: other }, DM).error, /isn't .*'s turn/);
  const move = s.encounter.budget.move, speed = e.speed;
  const r = ok(apply(s, { type: "stand", actor: id }, DM));
  assert.deepEqual(r.events, [{ type: "stood", id }]);
  assert.equal(e.cond.prone, undefined);
  assert.equal(s.encounter.budget.move, move - Math.floor(speed / 2 / 5) * 5);
  // Not enough movement left.
  ok(apply(s, { type: "condition", actor: id, condition: "prone" }, DM));
  s.encounter.budget.move = 5;
  const before = JSON.stringify(s);
  assert.match(apply(s, { type: "stand", actor: id }, DM).error, /takes \d+ ft of movement/);
  assert.equal(JSON.stringify(s), before, "a refused action changes nothing");
});

test("stand: outside a fight it costs nothing; a player stands only their own creature", () => {
  const s = newGame(5);
  const pat = { role: "player", userId: "pat" };
  ok(apply(s, { type: "claim", entity: "rogue", user: "pat", userName: "Pat" }, pat));
  ok(apply(s, { type: "condition", actor: "rogue", condition: "prone" }, DM));
  ok(apply(s, { type: "condition", actor: "fighter", condition: "prone" }, DM));
  assert.equal(apply(s, { type: "stand", actor: "fighter" }, pat).ok, false);
  ok(apply(s, { type: "stand", actor: "rogue" }, pat));
  assert.equal(s.entities.rogue.cond.prone, undefined);
});
