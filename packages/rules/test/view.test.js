// Security properties from docs/specs/hidden-information.md. This file covers
// properties 1, 2, 3, 6 and 7, plus the redaction rules for events.
import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import { SPELLS } from "../src/content/srd52.js";
import { apply, areaHexes, blocked, current, moveOptions, targetsFor } from "../src/engine.js";
import * as H from "../src/hex.js";
import { rand, roll } from "../src/rng.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PLAYER = { role: "player", userId: "pat" };

// Every key that appears anywhere inside a value.
function allKeys(value, found = new Set()) {
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) { if (!Array.isArray(value)) found.add(k); allKeys(v, found); }
  }
  return found;
}

// Play a fight with the built-in AI, calling visit(state, events) after every action.
function playFight(seed, visit) {
  const s = newGame(seed);
  let res = apply(s, { type: "startEncounter", center: s.entities.m1.pos, radius: 30 }, DM);
  assert.ok(res.ok);
  visit(s, res.events);
  for (let i = 0; i < 5000 && s.encounter; i++) {
    const id = current(s);
    res = apply(s, aiStep(s, id) ?? { type: "endTurn", actor: id }, DM);
    if (!res.ok) res = apply(s, { type: "endTurn", actor: id }, DM);
    assert.ok(res.ok);
    visit(s, res.events);
  }
  assert.equal(s.encounter, null);
  return s;
}

test("property 7: the DM gets the very same state and events", () => {
  const s = newGame(5);
  const { events } = apply(s, { type: "rest" }, DM);
  assert.equal(view(s, DM), s);
  assert.equal(viewEvents(events, s, DM), events);
});

test("property 1: a player's view never contains the dice seed, at any depth", () => {
  playFight(3, (s) => {
    const v = view(s, PLAYER);
    assert.equal(allKeys(v).has("rng"), false);
    assert.equal(allKeys(v).has("timeline"), false);
  });
  for (const viewer of [PLAYER, { role: "spectator" }, {}, undefined, null]) {
    assert.equal("rng" in view(newGame(1), viewer), false, `leaked to ${JSON.stringify(viewer)}`);
  }
});

test("property 2: dice refuse to roll on a state with no seed", () => {
  const v = view(newGame(5), PLAYER);
  assert.throws(() => rand(v), /no dice seed/);
  assert.throws(() => roll(v, "1d20"), /no dice seed/);
  assert.throws(() => roll({}, "2d6+1"), /no dice seed/);
  assert.throws(() => rand({ rng: "7" }), /no dice seed/);
  // Predicting a roll by applying an action to a view fails loudly instead of using seed 0.
  assert.throws(() => apply(v, { type: "startEncounter", center: v.entities.m1.pos, radius: 30 }, DM), /no dice seed/);
  // The real state still rolls, and seed 0 is a legitimate seed.
  assert.ok(rand({ rng: 0 }) >= 0);
});

test("property 3: anything not on the allow list is not sent", () => {
  const s = newGame(5);
  s.dmNotes = "the innkeeper is the villain";
  s.entities.m1.secretWeakness = "silver";
  s.encounter = null;
  const text = JSON.stringify(view(s, PLAYER));
  assert.equal(text.includes("dmNotes"), false);
  assert.equal(text.includes("innkeeper"), false);
  assert.equal(text.includes("secretWeakness"), false);

  // A monster's record is exactly the public fields.
  const goblin = view(s, PLAYER).entities.m1;
  assert.deepEqual(Object.keys(goblin).sort(), ["cond", "dead", "health", "hp", "id", "kind", "look", "name", "pos", "side", "tpl"].sort());
  // Party members are shared in full.
  assert.deepEqual(view(s, PLAYER).entities.fighter, s.entities.fighter);
  assert.notEqual(view(s, PLAYER).entities.fighter, s.entities.fighter);
});

test("a monster's health is a word, never a number", () => {
  const s = newGame(5);
  const m = s.entities.m1;
  const seen = () => view(s, PLAYER).entities.m1;
  assert.deepEqual([seen().hp, seen().health], [1, "healthy"]);
  m.hp = Math.floor(m.maxHp / 2);
  assert.deepEqual([seen().hp, seen().health], [1, "bloodied"]);
  m.hp = 0;
  assert.deepEqual([seen().hp, seen().health], [0, "down"]);
  m.dead = true;
  assert.deepEqual([seen().hp, seen().health], [0, "dead"]);

  m.cond = { prone: true, dodging: true, disengaged: true, secretCurse: true };
  assert.deepEqual(seen().cond, { prone: true, dodging: true });
});

test("a hidden monster is absent from the view and from events", () => {
  const s = newGame(5);
  s.entities.m2.hidden = true;
  const v = view(s, PLAYER);
  assert.equal("m2" in v.entities, false);
  assert.equal(JSON.stringify(v).includes('"m2"'), false);

  const events = [
    { type: "moved", id: "m2", path: [{ q: 0, r: 0 }] },
    { type: "attack", actor: "m2", target: "fighter", name: "Scimitar", rolls: [12], nat: 12, total: 16, ac: 18, mode: "normal", why: [], hit: false, crit: false },
    { type: "damage", target: "m2", amount: 4, dtype: "fire", hp: 6 },
    { type: "cast", actor: "wizard", spell: "burningHands", name: "Burning Hands", hexes: [{ q: 1, r: 1 }], targets: ["m1", "m2"] },
    { type: "moved", id: "fighter", path: [{ q: 0, r: 1 }] },
  ];
  const seen = viewEvents(events, s, PLAYER);
  assert.equal(JSON.stringify(seen).includes('"m2"'), false);
  assert.deepEqual(seen.map((e) => e.type), ["cast", "moved"]);
  assert.deepEqual(seen[0].targets, ["m1"]);
});

test("events: a monster's dice and a monster's Armor Class stay behind the screen", () => {
  const s = newGame(5);
  const base = { rolls: [14, 9], nat: 14, total: 18, mode: "adv", why: ["Pack Tactics"], hit: true, crit: false };
  const [byMonster, byHero] = viewEvents([
    { type: "attack", actor: "m1", target: "fighter", name: "Scimitar", ac: 18, ...base },
    { type: "attack", actor: "fighter", target: "m1", name: "Longsword", ac: 15, ...base },
  ], s, PLAYER);

  // The goblin attacks Brenna: the outcome and her own AC, but not its roll.
  assert.deepEqual(byMonster, { type: "attack", actor: "m1", target: "fighter", name: "Scimitar", hit: true, crit: false, mode: "adv", why: ["Pack Tactics"], ac: 18 });
  // Brenna attacks the goblin: her whole roll, but not its AC.
  assert.equal(byHero.total, 18);
  assert.deepEqual(byHero.rolls, [14, 9]);
  assert.equal("ac" in byHero, false);

  s.entities.m1.hp = 3;
  const [dmg, heal] = viewEvents([
    { type: "damage", target: "m1", amount: 7, dtype: "slashing", hp: 3, note: undefined },
    { type: "heal", target: "fighter", amount: 5, hp: 9 },
  ], s, PLAYER);
  assert.deepEqual(dmg, { type: "damage", target: "m1", amount: 7, dtype: "slashing", hp: 1, health: "bloodied" });
  assert.deepEqual(heal, { type: "heal", target: "fighter", amount: 5, hp: 9 });
});

test("events: saving throws, initiative, the chronicle and unknown event types", () => {
  const s = newGame(5);
  const save = (id) => ({ type: "save", id, abil: "dex", dc: 13, roll: 9, total: 11, success: false });
  const cast = (actor) => ({ type: "cast", actor, spell: "sacredFlame", name: "Sacred Flame", hexes: null, targets: [] });

  // A hero's spell against a monster: the players know their own DC, not the monster's roll.
  assert.deepEqual(viewEvents([cast("cleric"), save("m1")], s, PLAYER)[1], { type: "save", id: "m1", abil: "dex", success: false, dc: 13 });
  // A monster's effect against a monster, or a save with no cast before it: no DC either.
  assert.deepEqual(viewEvents([cast("m2"), save("m1")], s, PLAYER)[1], { type: "save", id: "m1", abil: "dex", success: false });
  assert.deepEqual(viewEvents([save("m1")], s, PLAYER)[0], { type: "save", id: "m1", abil: "dex", success: false });
  // A hero's own save is shown in full.
  assert.deepEqual(viewEvents([cast("m2"), save("fighter")], s, PLAYER)[1], save("fighter"));

  const [start, joined] = viewEvents([
    { type: "encounterStart", center: { q: 0, r: 0 }, radius: 6, order: [{ id: "m1", init: 17, dex: 15 }, { id: "fighter", init: 12, dex: 13 }] },
    { type: "joined", id: "m3", init: 9 },
  ], s, PLAYER);
  assert.deepEqual(start.order, [{ id: "m1" }, { id: "fighter", init: 12, dex: 13 }]);
  assert.deepEqual(joined, { type: "joined", id: "m3" });

  const mixed = viewEvents([
    { type: "chronicle", title: "The duke is a doppelganger", text: "", tags: [] },
    { type: "chronicle", title: "The bridge has fallen", text: "", tags: [], public: true },
    { type: "somethingNewAndSecret", detail: "not yet reviewed" },
    { type: "moved", id: "m1", path: [] },
    { type: "revealed", id: "m1" },
  ], s, PLAYER);
  assert.deepEqual(mixed.map((e) => e.title ?? e.type), ["revealed", "The bridge has fallen", "moved"]);
});

test("views and redacted events are copies: changing one cannot touch the game", () => {
  const s = newGame(5);
  const before = structuredClone(s);
  const v = view(s, PLAYER);
  v.entities.fighter.hp = 999; v.entities.m1.pos.q = 99; v.map.tiles["0,0"].t = "water"; v.settings.autoEngage = false;
  const events = [{ type: "moved", id: "fighter", path: [{ q: 1, r: 1 }] }];
  viewEvents(events, s, PLAYER)[0].path[0].q = 42;
  assert.deepEqual(s, before);
  assert.equal(events[0].path[0].q, 1);
});

test("property 6: the engine's helpers work on a player's view through whole fights", () => {
  let checked = 0;
  for (const seed of [1, 2, 3]) {
    playFight(seed, (s) => {
      const v = view(s, PLAYER);
      for (const e of Object.values(v.entities)) {
        const options = moveOptions(v, e);                       // must not throw for any creature in the view
        if (e.side !== "party") continue;
        const full = moveOptions(s, s.entities[e.id]);
        assert.deepEqual([...options].map(([k, o]) => [k, o.cost, o.canStop]).sort(), [...full].map(([k, o]) => [k, o.cost, o.canStop]).sort());
        assert.equal(blocked(v, e, "action"), blocked(s, s.entities[e.id], "action"));
        assert.equal(blocked(v, e, "bonus"), blocked(s, s.entities[e.id], "bonus"));
        for (const a of e.attacks) assert.deepEqual(targetsFor(v, e, { attack: a.id }), targetsFor(s, s.entities[e.id], { attack: a.id }));
        for (const id of e.spells) {
          if (!SPELLS[id].area) { assert.deepEqual(targetsFor(v, e, { spell: id }), targetsFor(s, s.entities[e.id], { spell: id })); continue; }
          const aim = H.neighbors(e.pos)[0];
          assert.deepEqual(areaHexes(v, e, SPELLS[id], aim), areaHexes(s, s.entities[e.id], SPELLS[id], aim));
        }
        checked++;
      }
      if (v.encounter) assert.equal(current(v), current(s));
    });
  }
  assert.ok(checked > 100);
});

test("in a fight, a monster's remaining movement and actions are not sent", () => {
  let monsterTurns = 0, heroTurns = 0;
  playFight(2, (s) => {
    if (!s.encounter) return;
    const v = view(s, PLAYER), active = s.entities[current(s)];
    if (active.side === "party") { heroTurns++; assert.deepEqual(v.encounter.budget, s.encounter.budget); }
    else { monsterTurns++; assert.deepEqual(v.encounter.budget, { move: 0, action: 0, bonus: 0 }); }
    for (const o of v.encounter.order) assert.equal("init" in o, s.entities[o.id].side === "party");
  });
  assert.ok(monsterTurns > 0 && heroTurns > 0);
});

test("a timeline entry keeps its in-world time when it is redacted", () => {
  const s = newGame(5);
  const entries = [
    { t: 485, type: "attack", actor: "m1", target: "fighter", name: "Scimitar", rolls: [3], nat: 3, total: 7, ac: 18, mode: "normal", why: [], hit: false, crit: false },
    { t: 486, type: "damage", target: "m1", amount: 4, dtype: "fire", hp: 6 },
    { t: 487, type: "moved", id: "fighter", path: [] },
  ];
  assert.deepEqual(viewEvents(entries, s, PLAYER).map((e) => e.t), [485, 486, 487]);
  assert.equal("t" in viewEvents([{ type: "rest" }], s, PLAYER)[0], false);
});
