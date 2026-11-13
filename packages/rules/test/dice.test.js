// The faces of every roll go on its event, and a player gets them only with the number they
// make (docs/specs/dice.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import { apply, current } from "../src/engine.js";
import { migrate } from "../src/migrate.js";
import { faceSum } from "../src/rng.js";
import { newGame } from "../src/scenario.js";
import { viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PLAYER = { role: "player", userId: "pat" };

// The number an event's faces add up to.
function numberOf(ev) {
  if (ev.rolled !== undefined) return ev.rolled;
  switch (ev.type) {
    case "attack": case "save": case "check": case "concentration": return ev.total;
    case "deathSave": return ev.total ?? ev.roll;
    case "damage": case "heal": case "tempHp": return ev.amount;
    case "recharge": return ev.roll;
    case "joined": return ev.init;
  }
  return undefined;
}
// Every set of faces in a list of events, with the number it should make.
function facesIn(events) {
  const out = [];
  for (const ev of events) {
    if (ev.dice) out.push({ ev, dice: ev.dice, bonus: ev.bonus, n: numberOf(ev) });
    if (ev.type === "encounterStart") for (const o of ev.order) if (o.dice) out.push({ ev, dice: o.dice, bonus: o.bonus, n: o.init });
  }
  return out;
}

function playFight(seed, visit) {
  const s = newGame(seed);
  let res = apply(s, { type: "startEncounter", center: s.entities.m1.pos, radius: 30 }, DM);
  visit(s, res.events);
  for (let i = 0; i < 5000 && s.encounter; i++) {
    const id = current(s);
    res = apply(s, aiStep(s, id) ?? { type: "endTurn", actor: id }, DM);
    if (!res.ok) res = apply(s, { type: "endTurn", actor: id }, DM);
    visit(s, res.events);
  }
  return s;
}

test("property: the used faces and the bonus make the event's number, for every roll in whole fights", () => {
  const seen = new Set();
  for (const seed of [1, 2, 3, 7, 11]) {
    playFight(seed, (s, events) => {
      for (const { ev, dice, bonus, n } of facesIn(events)) {
        seen.add(ev.type);
        assert.ok(Array.isArray(dice) && dice.length > 0, `${ev.type} has faces`);
        for (const d of dice) assert.ok(Number.isInteger(d.sides) && d.value >= 1 && d.value <= d.sides, `${ev.type}: a face is on its die`);
        assert.equal(typeof bonus, "number", `${ev.type} has a bonus`);
        assert.equal(faceSum(dice) + bonus, n, `${ev.type}: faces ${JSON.stringify(dice)} + ${bonus} make ${n}`);
      }
      // A d20 roll shows its d20s: two with Advantage or Disadvantage, one of them set aside.
      for (const ev of events.filter((e) => e.type === "attack")) {
        const d20 = ev.dice.filter((d) => d.sides === 20);
        assert.deepEqual(d20.map((d) => d.value), ev.rolls);
        assert.equal(d20.filter((d) => d.drop).length, ev.rolls.length - 1);
        assert.equal(d20.find((d) => !d.drop).value, ev.nat);
      }
    });
  }
  for (const t of ["attack", "damage", "encounterStart"]) assert.ok(seen.has(t), `fights rolled ${t}`);
});

test("property: no player message holds faces for a roll whose number that player was not sent", () => {
  for (const seed of [1, 2, 3, 7, 11]) {
    playFight(seed, (s, events) => {
      const theirs = viewEvents(events, s, PLAYER);
      for (const { ev, dice, bonus, n } of facesIn(theirs)) {
        assert.notEqual(n, undefined, `${ev.type}: faces came with no number`);
        assert.equal(faceSum(dice) + bonus, n, `${ev.type}: the faces a player is sent make the number they are sent`);
      }
      for (const ev of theirs) {
        assert.equal("by" in ev, false, "who rolled is not sent");
        if (ev.type === "attack" && s.entities[ev.actor]?.side !== "party") assert.equal("dice" in ev || "rolls" in ev || "total" in ev, false, "a monster's d20 stays behind the screen");
        if (ev.type === "save" && s.entities[ev.id]?.side !== "party") assert.equal("dice" in ev, false);
        if (ev.type === "encounterStart") for (const o of ev.order) if (s.entities[o.id]?.side !== "party") assert.equal("dice" in o, false);
      }
    });
  }
});

test("damage faces: a player gets them for their own roll, with what it made before halving; a monster's only when they make the amount", () => {
  const s = newGame(5);
  const dice = [{ sides: 6, value: 5 }, { sides: 6, value: 4 }];
  const events = [
    { type: "damage", target: "m1", amount: 6, dtype: "fire", hp: 1, dice, bonus: 3, rolled: 12, by: "wizard" },
    { type: "damage", target: "fighter", amount: 6, dtype: "fire", hp: 5, note: "resisted", dice, bonus: 3, rolled: 12, by: "m1" },
    { type: "damage", target: "fighter", amount: 12, dtype: "fire", hp: 5, dice, bonus: 3, by: "m1" },
    { type: "heal", target: "fighter", amount: 4, hp: 9, dice: [{ sides: 4, value: 4 }], bonus: 0, by: null },
  ];
  const [mine, resisted, plain, healed] = viewEvents(events, s, PLAYER);
  assert.deepEqual({ dice: mine.dice, bonus: mine.bonus, rolled: mine.rolled }, { dice, bonus: 3, rolled: 12 });
  assert.equal("dice" in resisted || "rolled" in resisted, false, "the monster's roll before Resistance was never told");
  assert.deepEqual(plain.dice, dice);
  assert.equal(healed.bonus, 0);
  for (const e of [mine, resisted, plain, healed]) assert.equal("by" in e, false);
  // The DM gets them all as they are.
  assert.deepEqual(viewEvents(events, s, DM), events);
});

test("a weapon attack's damage event carries the faces of the damage dice, doubled on a critical hit", () => {
  let found = null;
  for (let seed = 1; seed < 40 && !found; seed++) {
    playFight(seed, (s, events) => {
      events.forEach((e, i) => {
        if (found || e.type !== "attack" || !e.hit || !e.crit) return;
        const dmg = events.slice(i + 1).find((x) => x.type === "damage" && x.target === e.target);
        if (dmg) found = { attack: e, dmg };
      });
    });
  }
  assert.ok(found, "some fight has a critical hit");
  assert.ok(found.dmg.dice.length % 2 === 0, "a critical hit rolls the damage dice twice");
  assert.equal(found.dmg.by, found.attack.actor);
});

test("the table rule diceThrow: auto or throw, the DM's to set, and an old game is auto", () => {
  const s = newGame(1);
  assert.equal(s.settings.diceThrow, "auto");
  assert.equal(apply(s, { type: "setting", key: "diceThrow", value: "throw" }, PLAYER).error, "Only the DM can change table settings.");
  assert.equal(apply(s, { type: "setting", key: "diceThrow", value: "fling" }, DM).error, "That setting can be: auto, throw.");
  assert.ok(apply(s, { type: "setting", key: "diceThrow", value: "throw" }, DM).ok);
  assert.equal(s.settings.diceThrow, "throw");
  const old = newGame(1);
  delete old.settings.diceThrow; old.version = 11;
  migrate(old);
  assert.equal(old.settings.diceThrow, "auto");
  assert.equal(old.version, 14);
});

test("a healing spell and a saving throw carry their faces too", () => {
  const s = newGame(3);
  s.entities.fighter.hp = 1;
  const healed = apply(s, { type: "cast", actor: "cleric", spell: "cure-wounds", target: "fighter" }, DM);
  assert.ok(healed.ok, healed.error);
  const h = healed.events.find((e) => e.type === "heal");
  assert.ok(h.dice.length >= 1 && h.dice.every((d) => d.sides === 8));
  assert.equal(faceSum(h.dice) + h.bonus, h.rolled ?? h.amount);
  assert.equal(h.by, "cleric");
  let flame = apply(s, { type: "cast", actor: "cleric", spell: "sacred-flame", target: "m1" }, DM);
  if (!flame.events.some((e) => e.type === "save")) {             // the first cast only starts the fight
    while (current(s) !== "cleric") apply(s, { type: "endTurn", actor: current(s) }, DM);
    flame = apply(s, { type: "cast", actor: "cleric", spell: "sacred-flame", target: "m1" }, DM);
  }
  assert.ok(flame.ok, flame.error);
  const sv = flame.events.find((e) => e.type === "save");
  assert.equal(faceSum(sv.dice) + sv.bonus, sv.total);
  const told = viewEvents(flame.events, s, PLAYER).find((e) => e.type === "save");
  assert.equal(told && "dice" in told, told ? false : undefined, "a goblin's save is the DM's");
});
