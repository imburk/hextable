// Issue #421, item 5 (DEBT T54): a creature action's area `choose` is applied as a spell's is. Up to so many of those caught are
// affected, the creature's pick; with no pick and more caught than that, the action is refused; the monster AI picks the foes, nearest
// first, and never an ally.
import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import { apply, areaTargets, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const BLAST = (choose) => ({ id: "blast", name: "Blast", target: { area: { shape: "emanation", size: 30, exceptCaster: true, ...(choose ? { choose } : {}) } },
  effects: [{ save: "dex", dc: 30, half: false, onFail: [{ damage: "1d4", type: "fire" }] }] });

// The goblin at the centre; the fighter, rogue and cleric near it (3, 2 and 4 hexes away), the wizard far off; one more goblin beside it.
function field(actions) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  for (const [id, q, r] of [["fighter", 3, 0], ["rogue", 2, 0], ["cleric", 4, 0], ["wizard", -8, 0]]) { apply(s, { type: "place", actor: id, to: { q, r } }, DM); Object.assign(s.entities[id], { hp: 500, maxHp: 500 }); s.entities[id].saveBonus = { dex: -100 }; }
  const g = s.entities[ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 0, r: 0 } }, DM)).events[0].id];
  const mate = s.entities[ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 0, r: 1 } }, DM)).events[0].id];
  Object.assign(g, { hp: 500, maxHp: 500 }); Object.assign(mate, { hp: 500, maxHp: 500 });
  g.actions = [...actions, ...g.actions];
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }, DM));
  for (let i = 0; i < 20 && current(s) !== g.id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  return { s, g, mate };
}
const hurt = (r) => r.events.filter((e) => e.type === "damage").map((e) => e.target).sort();

test("without `choose` every creature caught is affected (as before), the ally beside it too", () => {
  const { s, g, mate } = field([BLAST()]);
  assert.deepEqual(hurt(ok(apply(s, { type: "act", actor: g.id, action: "blast" }, DM))), ["cleric", "fighter", mate.id, "rogue"].sort());
});
test("with `choose: 2` and more than two caught, the action is refused until the pick is made, and nothing changes", () => {
  const { s, g } = field([BLAST(2)]);
  const before = JSON.stringify(s);
  const r = apply(s, { type: "act", actor: g.id, action: "blast" }, DM);
  assert.equal(r.ok, false);
  assert.match(r.error, /affects up to 2 creatures of .*'s choice in the area\. Pick them/);
  assert.equal(JSON.stringify(s), before);
});
test("with `choose: 2` and a pick, only those two are affected, the ally and the others are not", () => {
  const { s, g } = field([BLAST(2)]);
  assert.deepEqual(hurt(ok(apply(s, { type: "act", actor: g.id, action: "blast", targets: ["fighter", "cleric"] }, DM))), ["cleric", "fighter"]);
});
test("a pick of more than the number, a repeat, one outside the area, an empty or a bad pick are refused with nothing changed", () => {
  const { s, g } = field([BLAST(2)]);
  const before = JSON.stringify(s);
  for (const targets of [["fighter", "cleric", "rogue"], ["fighter", "fighter"], ["fighter", "wizard"], [], "fighter", [7], ["nobody"]]) {
    let r;
    assert.doesNotThrow(() => { r = apply(s, { type: "act", actor: g.id, action: "blast", targets }, DM); }, JSON.stringify(targets));
    assert.equal(r.ok, false, JSON.stringify(targets));
    assert.equal(JSON.stringify(s), before, JSON.stringify(targets));
  }
});
test("with `choose` and no more caught than the number, all of them are affected without a pick", () => {
  const { s, g } = field([BLAST(5)]);
  assert.equal(hurt(ok(apply(s, { type: "act", actor: g.id, action: "blast" }, DM))).length, 4);
});
test("areaTargets (for the AI and the screen) lists everyone the area would catch, whatever `choose` is", () => {
  const { s, g } = field([BLAST(2)]);
  assert.equal(areaTargets(s, g, g.actions[0], null).length, 4);
});
test("the AI picks up to the number of foes, the nearest first, and never the ally beside it", () => {
  const { s, g, mate } = field([BLAST(2)]);
  const a = aiStep(s, g.id);
  assert.equal(a.type, "act"); assert.equal(a.action, "blast");
  assert.deepEqual(a.targets, ["rogue", "fighter"]);                              // 2 and 3 hexes away; the cleric (4) is left out
  assert.deepEqual(hurt(ok(apply(s, a, DM))), ["fighter", "rogue"]);
  assert.equal(mate.hp, 500);
});
test("the AI with an area without `choose` still will not aim where an ally would be caught", () => {
  const { s, g } = field([BLAST()]);
  assert.notEqual(aiStep(s, g.id).action, "blast");
});

// Fix round 1 of #422 (M2): a player picks only among creatures the party is told of. A hidden creature in the area is never counted, so it
// can neither make the action refused nor be affected by a pick; the player's results and view are the same with and without it.
const PLAYER = { role: "player", userId: "u1" };
function playerField(withHidden) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  for (const [id, q, r] of [["fighter", 0, 0], ["rogue", -8, 0], ["cleric", -8, 1], ["wizard", -8, 2]]) apply(s, { type: "place", actor: id, to: { q, r } }, DM);
  const f = s.entities.fighter; f.owner = "u1"; f.ownerName = "Pat"; f.hp = f.maxHp = 500;
  f.actions = [BLAST(2)];
  const mk = (at) => { const g = s.entities[ok(apply(s, { type: "spawn", monster: "goblin-warrior", at }, DM)).events[0].id]; Object.assign(g, { hp: 500, maxHp: 500 }); g.saveBonus = { dex: -100 }; return g; };
  const a = mk({ q: 2, r: 0 }), b = mk({ q: 3, r: 0 });
  const ghost = withHidden ? mk({ q: 4, r: 0 }) : null;
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }, DM));
  for (let i = 0; i < 20 && current(s) !== "fighter"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  if (ghost) ghost.hidden = true;          // the fight's start reveals creatures; the DM hides it again
  return { s, a, b, ghost };
}
// The twin run that was here (the player's results and view the same with and without a hidden creature in the area) is now
// `creatures:` in packages/server/test/twin-worlds.test.js, through the table server.
test("the DM sees every creature in the area when running a player's creature", () => {
  const { s } = playerField(true);
  const r = apply(s, { type: "act", actor: "fighter", action: "blast" }, DM);
  assert.equal(r.ok, false);
  assert.match(r.error, /Pick them/);
});
