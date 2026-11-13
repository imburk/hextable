// When a fight is lost (docs/specs/table-ui.md, Decision 1, E1) and how a fight is named in the record (E10).
import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import { apply, current, dying, fallen, up } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (res) => { assert.ok(res.ok, res.error); return res; };
const pcs = (s) => Object.values(s.entities).filter((e) => e.kind === "pc");
const fight = (s) => ok(apply(s, { type: "startEncounter", center: s.entities.m1.pos, radius: 30 }, DM));
// Every party character at 0 Hit Points, dying.
const downAll = (s) => { for (const e of pcs(s)) ok(apply(s, { type: "setHp", actor: e.id, hp: 0 }, DM)); };
// Let the AI play every creature; returns every event.
function play(s, max = 3000) {
  const all = [];
  for (let i = 0; i < max && s.encounter; i++) {
    const id = current(s);
    let res = apply(s, aiStep(s, id) ?? { type: "endTurn", actor: id }, DM);
    if (!res.ok) res = apply(s, { type: "endTurn", actor: id }, DM);
    assert.ok(res.ok, res.error);
    all.push(...res.events);
  }
  return all;
}

test("a party all at 0 Hit Points keeps the fight going: the dying roll their saves", () => {
  const s = newGame(3);
  fight(s);
  downAll(s);
  assert.ok(s.encounter, "dying is not defeat");
  assert.ok(pcs(s).every(dying));
  assert.equal(fallen(s), false);
  const events = play(s);
  assert.ok(events.some((e) => e.type === "deathSave"), "saves were rolled");
  const end = events.find((e) => e.type === "encounterEnd");
  assert.ok(end, "the fight ended");
  if (end.result === "defeat") {
    assert.ok(pcs(s).every((e) => e.dead || e.cond.stable), "defeat only once nobody is up or dying");
    assert.equal(fallen(s), true);
  }
});

test("over many fights, defeat comes only when every character is dead or Stable", () => {
  let defeats = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = newGame(seed);
    fight(s);
    downAll(s);
    const events = play(s);
    const end = events.findLast((e) => e.type === "encounterEnd");
    if (end?.result !== "defeat") continue;
    defeats++;
    assert.ok(pcs(s).every((e) => e.dead || (e.hp === 0 && e.cond.stable)), `seed ${seed}`);
  }
  assert.ok(defeats > 0, "some fight was lost");
});

test("a 20 on a death save puts the character back on its feet, in the fight", () => {
  for (let seed = 1; seed <= 60; seed++) {
    const s = newGame(seed);
    fight(s);
    downAll(s);
    for (let i = 0; i < 400 && s.encounter; i++) {
      const id = current(s);
      const res = ok(apply(s, { type: "endTurn", actor: id }, DM));
      const twenty = res.events.find((e) => e.type === "deathSave" && e.roll === 20);
      if (!twenty) continue;
      assert.ok(s.encounter, "the fight goes on");
      assert.equal(s.entities[twenty.id].hp, 1);
      assert.ok(up(s.entities[twenty.id]));
      return;
    }
  }
  assert.fail("no seed rolled a 20");
});

test("all Stable or all dead ends the fight in defeat; a companion does not keep the party standing", () => {
  const s = newGame(4);
  fight(s);
  downAll(s);
  const [a, ...rest] = pcs(s);
  for (const e of rest) e.cond.stable = {};
  assert.ok(s.entities[a.id] && dying(a));
  const r = ok(apply(s, { type: "harm", actor: a.id, amount: a.maxHp }, DM));      // as much as the maximum at 0 kills
  assert.ok(a.dead);
  const end = r.events.find((e) => e.type === "encounterEnd");
  assert.equal(end?.result, "defeat");
  assert.equal(s.encounter, null);
  assert.equal(fallen(s), true);
});

test("outside a fight the party has fallen when no character is up", () => {
  const s = newGame(5);
  assert.equal(fallen(s), false);
  downAll(s);
  assert.equal(s.encounter, null);
  assert.equal(fallen(s), true);
  ok(apply(s, { type: "mend", actor: "fighter", amount: 3 }, DM));
  assert.equal(fallen(s), false);
});

test("a fight is named in the record: encounterStart has its id and place, encounterEnd says which ended", () => {
  const s = newGame(6);
  const start = fight(s).events.find((e) => e.type === "encounterStart");
  assert.equal(start.fight, s.encounter.id);
  assert.equal(start.where, s.map.name, "no revealed region here: the map's name");
  const end = ok(apply(s, { type: "endEncounter" }, DM)).events.find((e) => e.type === "encounterEnd");
  assert.equal(end.fight, start.fight);
  const seen = viewEvents([start, end], s, PAT);
  assert.equal(seen[0].fight, start.fight);
  assert.equal(seen[0].where, start.where);
  assert.equal(seen[1].fight, start.fight);
  // A second fight has another id.
  assert.notEqual(fight(s).events.find((e) => e.type === "encounterStart").fight, start.fight);
});

test("the place is a revealed region's name, never one the party has not found", () => {
  const s = newGame(6);
  const c = s.entities.m1.pos;
  s.map.regions.push({ id: "camp", name: "The goblin camp", level: s.map.levels[0].id, hexes: [`${c.q},${c.r}`], revealed: false });
  const where = () => { const st = fight(s).events.find((e) => e.type === "encounterStart").where; ok(apply(s, { type: "endEncounter" }, DM)); return st; };
  assert.equal(where(), s.map.name);
  s.map.regions.at(-1).revealed = true;
  assert.equal(where(), "The goblin camp");
});
