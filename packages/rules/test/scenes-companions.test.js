// Scenes and companions (DEBT T27 leftover, #344): `say` and `askCheck` test who plays a creature with `ownerOf`,
// so a familiar or steed speaks and asks for its master's player, a creature that takes commands only on a turn it
// was commanded for, and a foe's or another player's creature is refused in the words used for an id that is nothing.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, ownerOf } from "../src/engine.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { gridOf } from "../src/grid.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const U1 = { role: "player", userId: "u1" }, U2 = { role: "player", userId: "u2" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (s) => JSON.stringify(s);
function refused(s, action, ctx, words) {
  const before = json(s), r = apply(s, action, ctx);
  assert.equal(r.ok, false, `${action.type} should be refused`);
  if (typeof words === "string") assert.equal(r.error, words); else if (words) assert.match(r.error, words);
  assert.equal(json(s), before, "a refused action changes nothing");
  return r.error;
}
const spot = (s, near, n = 0) => {
  const G = gridOf(s.map);
  return G.range(near, 3).filter((h) => apply(structuredClone(s), { type: "spawn", monster: "wolf", at: h }, DM).ok)[n];
};
const spawn = (s, monster, at, name) => ok(apply(s, { type: "spawn", monster, at, name }, DM)).events.find((e) => e.type === "spawned").id;
const bond = (s, actor, to, more = {}) => ok(apply(s, { type: "bond", actor, to, ...more }, DM));
function table(grid) {
  const s = newGame(5, grid ? { grid } : {});
  s.settings.autoEngage = false;
  ok(apply(s, { type: "claim", entity: "fighter", user: "u1", userName: "Ann" }, U1));
  ok(apply(s, { type: "claim", entity: "rogue", user: "u2", userName: "Bo" }, U2));
  ok(apply(s, { type: "scene", scene: { title: "The inn" } }, DM));
  return s;
}
const OWN = "You can speak only as your own character.", ASK = "You can ask only for your own character.";
const say = (s, as, ctx) => apply(s, { type: "say", as, text: "Hoo." }, ctx);
const ask = (s, actor, ctx) => apply(s, { type: "askCheck", actor, skill: "perception" }, ctx);

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";

  test(`a player speaks as, and asks a check for, their familiar; no other player and no foe's creature may${on}`, () => {
    const s = table(grid);
    const owl = spawn(s, "wolf", spot(s, s.entities.fighter.pos), "Owl");
    s.entities[owl].side = "party";
    bond(s, owl, "fighter", { kind: "familiar", noAttack: true });
    assert.equal(ownerOf(s, s.entities[owl]), "u1");
    const spoke = ok(say(s, owl, U1));
    assert.deepEqual(spoke.events[0], { type: "say", from: "u1", as: owl, name: s.entities[owl].name, text: "Hoo.", scene: "sc1", line: 1 });
    assert.deepEqual(ok(ask(s, owl, U1)).events, [{ type: "checkAsked", actor: owl, skill: "perception", by: "u1" }]);
    // Another player's companion: refused, in the words for an id that is nothing.
    const nothing = refused(s, { type: "say", as: "nobody", text: "x" }, U2, null);
    assert.equal(nothing, OWN);
    assert.equal(refused(s, { type: "say", as: owl, text: "x" }, U2), OWN);
    assert.equal(refused(s, { type: "askCheck", actor: owl, skill: "perception" }, U2), refused(s, { type: "askCheck", actor: "rogue", skill: "perception" }, U1));
    assert.equal(ask(s, owl, U2).error, ASK);
    // The DM may, as before.
    ok(say(s, owl, DM)); ok(ask(s, owl, DM));
    // A foe's bonded creature: the same words as a creature that is nobody's.
    const mage = spawn(s, "goblin-warrior", spot(s, s.entities.fighter.pos, 2), "Gob Mage");
    const imp = spawn(s, "wolf", spot(s, s.entities.fighter.pos, 3), "Imp");
    bond(s, imp, mage, { kind: "familiar" });
    const plain = spawn(s, "goblin-warrior", spot(s, s.entities.fighter.pos, 4), "Plain");
    for (const who of [U1, U2]) {
      assert.equal(refused(s, { type: "say", as: imp, text: "x" }, who), refused(s, { type: "say", as: plain, text: "x" }, who));
      assert.equal(refused(s, { type: "askCheck", actor: imp, skill: "perception" }, who), refused(s, { type: "askCheck", actor: plain, skill: "perception" }, who));
    }
    // A foe's bonded creature the party cannot see is answered as an id that is nothing, by the engine's own actor check.
    ok(apply(s, { type: "reveal", actor: imp, hidden: true }, DM));
    assert.equal(refused(s, { type: "say", as: imp, text: "x" }, U1), refused(s, { type: "say", as: "nobody", text: "x" }, U1));
    assert.equal(refused(s, { type: "askCheck", actor: imp, skill: "perception" }, U1), refused(s, { type: "askCheck", actor: "nobody", skill: "perception" }, U1));
    // Characters are unchanged.
    ok(say(s, "fighter", U1)); refused(s, { type: "say", as: "rogue", text: "x" }, U1, /your own/);
    ok(ask(s, "fighter", U1)); refused(s, { type: "askCheck", actor: "rogue", skill: "perception" }, U1, /your own/);
  });

  test(`a Zombie that takes commands speaks and is asked for by its master's player only on a turn it was commanded for${on}`, () => {
    const s = table(grid);
    const z = spawn(s, "zombie", spot(s, s.entities.fighter.pos), "Zombie");
    bond(s, z, "fighter", { kind: "undead", orders: "command", turn: "after" });
    // Outside a fight it is its master's player's.
    ok(say(s, z, U1)); ok(ask(s, z, U1));
    refused(s, { type: "say", as: z, text: "x" }, U2, OWN);
    const gob = spawn(s, "goblin-warrior", gridOf(s.map).range(s.entities.fighter.pos, 5).find((h) => gridOf(s.map).dist(h, s.entities.fighter.pos) >= 4 && apply(structuredClone(s), { type: "spawn", monster: "wolf", at: h }, DM).ok), "Gob");
    assert.ok(gob);
    ok(apply(s, { type: "startEncounter", center: s.entities.fighter.pos, radius: 6 }, DM));
    // In a fight, never commanded: the DM's, so refused for the player and allowed for the DM.
    assert.equal(ownerOf(s, s.entities[z]), null);
    refused(s, { type: "say", as: z, text: "x" }, U1, OWN);
    refused(s, { type: "askCheck", actor: z, skill: "perception" }, U1, /your own/);
    ok(say(s, z, DM)); ok(ask(s, z, DM));
    // Commanded: its player's on its commanded turn.
    for (let i = 0; i < 50 && current(s) !== "fighter"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    ok(apply(s, { type: "command", actor: "fighter", ids: [z], order: "guard" }, U1));
    ok(apply(s, { type: "endTurn", actor: "fighter" }, U1));
    assert.equal(current(s), z);
    ok(say(s, z, U1)); ok(ask(s, z, U1));
    refused(s, { type: "say", as: z, text: "x" }, U2, OWN);
    ok(apply(s, { type: "endTurn", actor: z }, U1));
    refused(s, { type: "say", as: z, text: "x" }, U1, OWN);
  });

  test(`a companion's line goes through undo, redo and replay${on}`, () => {
    const play = () => {
      const s = table(grid), h = createHistory(), evs = [];
      const owl = spawn(s, "wolf", spot(s, s.entities.fighter.pos), "Owl");
      s.entities[owl].side = "party";
      bond(s, owl, "fighter", { kind: "familiar", noAttack: true });
      const start = json(s), before = mark(s), a = { type: "say", as: owl, text: "WORDS-zq" };
      const r = ok(apply(s, a, U1)); evs.push(...r.events);
      const label = describeStep(a, r.events, before, s);
      h.record(before, s, label);
      return { s, h, evs, start, after: json(s), label };
    };
    const A = play(), B = play();
    assert.equal(json(A.s), json(B.s), "same seed, same table");
    assert.equal(json(A.evs), json(B.evs), "a replay gives the same events");
    assert.equal(A.label.label, "Owl spoke");
    A.h.undo(A.s);
    assert.equal(json(A.s), A.start, "undo takes the line back");
    A.h.redo(A.s);
    assert.equal(json(A.s), A.after, "redo puts it back");
  });
}
