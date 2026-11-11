import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import { apply, current, inFight, moveOptions, up } from "../src/engine.js";
import * as H from "../src/hex.js";
import { roll } from "../src/rng.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const startFight = (s) => apply(s, { type: "startEncounter", center: s.entities.m1.pos, radius: 30 }, DM);

// Let the built-in AI play every creature until the fight ends.
function playOut(s, maxSteps = 5000) {
  for (let i = 0; i < maxSteps && s.encounter; i++) {
    const id = current(s);
    const action = aiStep(s, id) ?? { type: "endTurn", actor: id };
    let res = apply(s, action, DM);
    if (!res.ok) res = apply(s, { type: "endTurn", actor: id }, DM);
    assert.ok(res.ok, `stuck on ${JSON.stringify(action)}: ${res.error}`);
  }
}

test("hex distance and range", () => {
  assert.equal(H.dist({ q: 0, r: 0 }, { q: 3, r: -1 }), 3);
  assert.equal(H.dist({ q: 2, r: 2 }, { q: 2, r: 2 }), 0);
  assert.equal(H.range({ q: 0, r: 0 }, 2).length, 19);
  const h = { q: 4, r: -7 };
  const w = H.toWorld(h);
  assert.deepEqual(H.fromWorld(w.x, w.z), h);
});

test("a critical hit doubles the dice, not the modifier", () => {
  const a = { rng: 99 }, b = { rng: 99 };
  const normal = roll(a, "2d6+3"), crit = roll(b, "2d6+3", { crit: true });
  assert.equal(normal.rolls.length, 2);
  assert.equal(crit.rolls.length, 4);
  assert.equal(crit.bonus, 3);
  assert.throws(() => roll({ rng: 1 }, "two dice"));
});

test("the same seed builds the same world", () => {
  assert.deepEqual(newGame(123), newGame(123));
  assert.notDeepEqual(newGame(123).map.tiles, newGame(124).map.tiles);
});

test("players control only their own character; the DM controls anyone", () => {
  const s = newGame(5);
  const alice = { role: "player", userId: "alice" };
  assert.ok(apply(s, { type: "claim", entity: "fighter", user: "alice", userName: "Alice" }, alice).ok);

  const taken = apply(s, { type: "claim", entity: "fighter", user: "bob" }, { role: "player", userId: "bob" });
  assert.equal(taken.ok, false);

  const dest = (id) => H.parse([...moveOptions(s, s.entities[id])].find(([, v]) => v.canStop)[0]);
  assert.equal(apply(s, { type: "move", actor: "rogue", to: dest("rogue") }, alice).ok, false);
  assert.ok(apply(s, { type: "move", actor: "fighter", to: dest("fighter") }, alice).ok);
  assert.ok(apply(s, { type: "move", actor: "rogue", to: dest("rogue") }, DM).ok);

  assert.equal(apply(s, { type: "spawn", monster: "goblin", at: { q: 0, r: 0 } }, alice).ok, false);
});

test("a rejected action changes nothing", () => {
  const s = newGame(5);
  const before = structuredClone(s);
  const res = apply(s, { type: "attack", actor: "fighter", target: "m1", attack: "longsword" }, DM);
  assert.equal(res.ok, false);
  assert.match(res.error, /away/);
  assert.deepEqual(s, before);
});

test("in a fight only the creature whose turn it is can act, once per action", () => {
  const s = newGame(11);
  assert.ok(startFight(s).ok);
  const active = current(s);
  const other = s.encounter.order.find((o) => o.id !== active).id;

  assert.equal(apply(s, { type: "dodge", actor: other }, DM).ok, false);
  assert.ok(apply(s, { type: "dodge", actor: active }, DM).ok);
  const again = apply(s, { type: "dodge", actor: active }, DM);
  assert.equal(again.ok, false);
  assert.match(again.error, /already used an action/);

  assert.ok(apply(s, { type: "endTurn", actor: active }, DM).ok);
  assert.notEqual(current(s), active);
});

test("the arena locks: fighters cannot leave it and movement is budgeted", () => {
  const s = newGame(11);
  assert.ok(apply(s, { type: "startEncounter", center: s.entities.fighter.pos, radius: 2 }, DM).ok);
  const id = current(s), e = s.entities[id];
  assert.ok(inFight(s, id));
  for (const [k, v] of moveOptions(s, e)) {
    assert.ok(s.encounter.arena[k], `${k} is outside the arena`);
    assert.ok(v.cost <= e.speed);
  }
  const outside = H.range(e.pos, 6).find((h) => s.map.tiles[H.key(h)] && !s.encounter.arena[H.key(h)]);
  assert.equal(apply(s, { type: "move", actor: id, to: outside }, DM).ok, false);
});

test("walking next to an enemy starts a fight", () => {
  const s = newGame(5);
  apply(s, { type: "place", actor: "fighter", to: { q: 1, r: -1 } }, DM);
  assert.equal(s.encounter, null);
  const to = H.parse([...moveOptions(s, s.entities.fighter)].find(([k, v]) => v.canStop && H.dist(H.parse(k), s.entities.m1.pos) <= 2)[0]);
  const res = apply(s, { type: "move", actor: "fighter", to }, DM);
  assert.ok(res.ok);
  assert.ok(res.events.some((e) => e.type === "encounterStart"));
  assert.ok(s.encounter);
});

test("spell slots are spent and run out", () => {
  const s = newGame(5);
  const wizard = s.entities.wizard;
  apply(s, { type: "place", actor: "m1", to: H.neighbors(wizard.pos).find((h) => moveOptions(s, wizard).get(H.key(h))?.canStop) }, DM);
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  assert.ok(apply(s, { type: "startEncounter", center: wizard.pos, radius: 3 }, DM).ok);
  for (let guard = 0; wizard.slots[1] > 0 && s.encounter && guard < 200; guard++) {
    const id = current(s);
    if (id === "wizard" && up(s.entities.m1)) apply(s, { type: "cast", actor: "wizard", spell: "magicMissile", target: "m1" }, DM);
    else if (id === "wizard") break;
    if (s.encounter) apply(s, { type: "endTurn", actor: current(s) }, DM);
  }
  assert.ok(wizard.slots[1] < wizard.slotsMax[1], "a slot was spent");
});

test("a whole fight plays out, ends, and replays identically from the same seed", () => {
  const run = (seed) => {
    const s = newGame(seed);
    assert.ok(startFight(s).ok);
    playOut(s);
    return s;
  };
  for (const seed of [1, 2, 3, 4, 5]) {
    const a = run(seed), b = run(seed);
    assert.equal(a.encounter, null, `seed ${seed}: the fight never ended`);
    const end = a.timeline.findLast((e) => e.type === "encounterEnd");
    assert.ok(["victory", "defeat", "stalemate"].includes(end.result));
    for (const e of Object.values(a.entities)) assert.ok(e.hp >= 0 && e.hp <= e.maxHp);
    assert.deepEqual(a, b);
  }
});

test("a long rest restores the party and moves the clock", () => {
  const s = newGame(5);
  apply(s, { type: "setHp", actor: "fighter", hp: 3 }, DM);
  s.entities.wizard.slots[1] = 0;
  const clock = s.clock;
  assert.ok(apply(s, { type: "rest" }, DM).ok);
  assert.equal(s.entities.fighter.hp, s.entities.fighter.maxHp);
  assert.equal(s.entities.wizard.slots[1], s.entities.wizard.slotsMax[1]);
  assert.equal(s.clock, clock + 480);
});

test("a revived creature stays prone during a fight but gets up once it is free to", () => {
  const s = newGame(5);
  const pip = s.entities.rogue;
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);

  // Knocked out and healed in the middle of a fight: still prone until its own turn.
  apply(s, { type: "place", actor: "m1", to: H.neighbors(pip.pos).find((h) => moveOptions(s, pip).get(H.key(h))?.canStop) }, DM);
  assert.ok(apply(s, { type: "startEncounter", center: pip.pos, radius: 3 }, DM).ok);
  assert.ok(inFight(s, "rogue") && inFight(s, "m1"));
  apply(s, { type: "setHp", actor: "rogue", hp: 0 }, DM);
  assert.ok(pip.cond.prone && pip.cond.unconscious);
  apply(s, { type: "setHp", actor: "rogue", hp: 4 }, DM);
  assert.equal(pip.cond.unconscious, undefined);
  assert.equal(pip.cond.prone, true);

  // When the fight ends, everyone still standing a chance stands up.
  assert.ok(apply(s, { type: "endEncounter" }, DM).ok);
  assert.equal(pip.cond.prone, undefined);

  // Knocked out and healed with no fight on: up straight away.
  apply(s, { type: "setHp", actor: "rogue", hp: 0 }, DM);
  assert.equal(pip.cond.prone, true);
  const res = apply(s, { type: "setHp", actor: "rogue", hp: 4 }, DM);
  assert.equal(pip.cond.prone, undefined);
  assert.ok(res.events.some((e) => e.type === "stood"));
});

test("a character can be released by its player or the DM, and reassigned by the DM", () => {
  const s = newGame(5);
  const alice = { role: "player", userId: "alice" }, bob = { role: "player", userId: "bob" };
  apply(s, { type: "claim", entity: "fighter", user: "alice", userName: "Alice" }, alice);

  assert.equal(apply(s, { type: "release", entity: "fighter" }, bob).ok, false);
  assert.equal(apply(s, { type: "release", entity: "rogue" }, DM).ok, false);
  assert.ok(apply(s, { type: "release", entity: "fighter" }, alice).ok);
  assert.equal(s.entities.fighter.owner, null);

  // Free again, so Bob can take it; then the DM hands it to Alice instead.
  assert.ok(apply(s, { type: "claim", entity: "fighter", user: "bob", userName: "Bob" }, bob).ok);
  assert.ok(apply(s, { type: "claim", entity: "fighter", user: "alice", userName: "Alice" }, DM).ok);
  assert.equal(s.entities.fighter.ownerName, "Alice");
  assert.ok(apply(s, { type: "release", entity: "fighter" }, DM).ok);
});
