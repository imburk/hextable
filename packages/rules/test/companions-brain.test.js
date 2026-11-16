// Companions C7 (#366): the companion brain (docs/specs/companions.md, Decision 9; ai.js, companionStep). What a
// companion does when nobody steers it, on hexes (the valley) and on squares (the square room):
//   - a never-commanded Skeleton under `orders: 'command'` takes the Dodge action and steps away from harm, and only
//     sends what its lock lets it (no refusal); with a standing order or a command for this turn it waits;
//   - an Incapacitated paladin's Find Steed comes to her and attacks the goblin beside her;
//   - a player's familiar waits for its player unless `bond.auto` is set, or its player is offline or has stepped away,
//     or its master is Incapacitated.
// Everything the brain chooses is sent through apply() by the DM, as the client's auto-play does.
import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep, autoPlays, brainMode, companionStep } from "../src/ai.js";
import { apply, current } from "../src/engine.js";
import { apart, apartAt } from "../src/space.js";
import { moveOptions } from "../src/engine.js";
import { DM, U1, U2, U3, ok, json, GRIDS, SPOTS, CENTER, spawned, spawn, cellsNear, near, turnOf, table, fight, autoTurn } from "./c7-brain-kit.js";

// ---------- a never-commanded Skeleton ----------
function skeletonTable(grid) {
  const s = table(grid);
  const skel = near(s, "cleric", "skeleton", { name: "Skeleton" }, { min: 2, max: 3 });
  ok(apply(s, { type: "bond", actor: skel, to: "cleric", kind: "undead", orders: "command" }, DM));
  const gob = near(s, skel, "goblin-warrior", { name: "Goblin" });
  return { s, skel, gob };
}

for (const grid of GRIDS) {
  test(`${grid}: a never-commanded Skeleton takes the Dodge action and stays beside a goblin that could make an Opportunity Attack`, () => {
    // #372, N4: a step out of the goblin's reach would provoke one ("you put yourself in danger", SRD 2085): not to avoid harm.
    const { s, skel, gob } = skeletonTable(grid);
    fight(s, grid);
    turnOf(s, skel);
    const from = json(s.entities[skel].pos);
    assert.deepEqual(autoTurn(s, skel).map((x) => x.a.type), ["dodge", "endTurn"]);
    assert.equal(json(s.entities[skel].pos), from, "it stayed");
    assert.ok(s.entities[skel].cond.dodging);
    assert.equal(apart(s, s.entities[skel], s.entities[gob]), 1);
  });

  test(`${grid}: a never-commanded Skeleton takes the Dodge action and steps away from the goblin beside it, then ends its turn`, () => {
    const { s, skel, gob } = skeletonTable(grid);
    ok(apply(s, { type: "condition", actor: gob, condition: "blinded" }, DM));       // it can't see the skeleton: no Opportunity Attack (#372, N4)
    fight(s, grid);
    turnOf(s, skel);
    assert.equal(brainMode(s, s.entities[skel]), "guard");
    assert.ok(autoPlays(s, skel), "the DM's auto-play plays it");
    assert.equal(apart(s, s.entities[skel], s.entities[gob]), 1);
    const sent = autoTurn(s, skel);
    const types = sent.map((x) => x.a.type);
    assert.deepEqual(types.slice(0, 2), ["dodge", "move"], `Dodge, then a step: ${json(types)}`);
    assert.equal(types.at(-1), "endTurn");
    assert.ok(types.every((t) => ["dodge", "move", "endTurn"].includes(t)), "only what the lock lets it do");
    assert.ok(s.entities[skel].cond.dodging, "it is Dodging");
    if (s.entities[skel].hp > 0) assert.ok(apart(s, s.entities[skel], s.entities[gob]) > 1, "it stepped out of the goblin's reach");
  });

  test(`${grid}: with nobody within 5 feet, a never-commanded Skeleton Dodges and stays where it is`, () => {
    const s = table(grid);
    const skel = near(s, "cleric", "skeleton", {}, { min: 2, max: 3 });
    ok(apply(s, { type: "bond", actor: skel, to: "cleric", kind: "undead", orders: "command" }, DM));
    spawn(s, "goblin-warrior", SPOTS[grid].far);
    fight(s, grid);
    turnOf(s, skel);
    const from = json(s.entities[skel].pos);
    assert.deepEqual(autoTurn(s, skel).map((x) => x.a.type), ["dodge", "endTurn"]);
    assert.equal(json(s.entities[skel].pos), from);
  });

  test(`${grid}: a Skeleton with a standing order is the DM's by hand, and one commanded this turn is its player's: the brain plays neither`, () => {
    const { s, skel } = skeletonTable(grid);
    // A command outside the fight with an order: the order stands (Decision 6, A2).
    ok(apply(s, { type: "command", actor: "cleric", ids: [skel], order: "guard the door" }, U2));
    fight(s, grid);
    turnOf(s, skel);
    assert.equal(brainMode(s, s.entities[skel]), "dm");
    assert.equal(aiStep(s, skel), null, "the brain does not guess what the order means");
    assert.equal(autoPlays(s, skel), false);
    // Commanded with the master's Bonus Action: its next turn is the player's (A2), and the brain waits for them.
    ok(apply(s, { type: "endTurn", actor: skel }, DM));
    turnOf(s, "cleric");
    ok(apply(s, { type: "command", actor: "cleric", ids: [skel] }, U2));
    turnOf(s, skel);
    assert.equal(brainMode(s, s.entities[skel]), "player");
    assert.equal(aiStep(s, skel), null);
    assert.equal(autoPlays(s, skel), false);
    // The same command given while its player is offline or has stepped away: nobody plays it from the order, so it
    // is the DM's by hand (the brain does not guess what the master meant).
    assert.equal(brainMode(s, s.entities[skel], { offline: (u) => u === "u2" }), "dm");
  });
}

// ---------- an Incapacitated paladin's steed ----------
// The cleric stands in for the paladin (the valley's party has none): Find Steed is in her list and she has a 2nd-level
// slot. The steed is summoned out of the fight 15 to 20 ft from her; a goblin stands beside her.
function steedTable(grid) {
  const s = table(grid);
  const c = s.entities.cleric;
  c.spells.push("find-steed"); c.slots[2] = 1;
  const at = cellsNear(s, "cleric", "warhorse", { min: 3, max: 4 })[0];
  assert.ok(at, "room for the steed");
  const steed = spawned(ok(apply(s, { type: "cast", actor: "cleric", spell: "find-steed", slot: 2, summon: { type: "celestial", at: [at] } }, U2)));
  const gob = near(s, "cleric", "goblin-warrior", { name: "Goblin" });
  return { s, steed, gob };
}
for (const grid of GRIDS) {
  test(`${grid}: an Incapacitated paladin's steed comes to her and attacks the goblin beside her`, () => {
    const { s, steed, gob } = steedTable(grid);
    fight(s, grid);
    turnOf(s, "cleric");
    assert.equal(brainMode(s, s.entities[steed]), "player", "with its master able to command it, it is its player's");
    ok(apply(s, { type: "condition", actor: "cleric", condition: "stunned" }, DM));
    ok(apply(s, { type: "endTurn", actor: "cleric" }, DM));
    assert.equal(current(s), steed, "the steed's turn is straight after hers");
    assert.equal(brainMode(s, s.entities[steed]), "protect");
    assert.ok(autoPlays(s, steed));
    assert.ok(apart(s, s.entities[steed], s.entities.cleric) > 1, "it starts away from her");
    const sent = autoTurn(s, steed);
    const types = sent.map((x) => x.a.type);
    assert.equal(types[0], "move", json(types));
    assert.ok(apart(s, s.entities[steed], s.entities.cleric) <= 1, "it stands beside her");
    const hit = sent.find((x) => x.a.type === "act");
    assert.ok(hit, `it attacks: ${json(types)}`);
    assert.equal(hit.a.target, gob);
    assert.equal(hit.a.action, "otherworldly-slam");
    assert.ok(hit.r.events.some((e) => e.type === "attack" && e.target === gob), "the attack is rolled against the goblin");
  });

  test(`${grid}: an Incapacitated paladin riding her steed: it stays under her and attacks the goblin beside her, or Dodges`, () => {
    const { s, steed, gob } = steedTable(grid);
    ok(apply(s, { type: "remove", actor: gob }, DM));
    // Mount out of the fight: she walks up beside it first.
    const p = cellsNear(s, steed, "goblin-warrior")[0];
    s.entities.cleric.pos = { ...p, z: p.z ?? 0 };
    ok(apply(s, { type: "mount", actor: "cleric", mount: steed }, U2));
    spawn(s, "goblin-warrior", SPOTS[grid].far);
    fight(s, grid);
    turnOf(s, "cleric");
    ok(apply(s, { type: "condition", actor: "cleric", condition: "stunned" }, DM));
    ok(apply(s, { type: "endTurn", actor: "cleric" }, DM));
    turnOf(s, steed);                                                     // steered by nobody, it takes its own turn
    assert.equal(brainMode(s, s.entities[steed]), "protect");
    const from = json(s.entities[steed].pos);
    assert.deepEqual(autoTurn(s, steed).map((x) => x.a.type), ["dodge", "endTurn"], "no foe beside her: it Dodges and does not carry her about");
    assert.equal(json(s.entities[steed].pos), from);
    assert.equal(s.entities.cleric.riding?.on, steed, "she is still on it");
  });
}

// ---------- a player's familiar ----------
function owlTable(grid) {
  const s = table(grid), w = s.entities.wizard;
  w.spells.push("find-familiar");
  const at = cellsNear(s, "wizard", "owl")[0];
  const owl = spawned(ok(apply(s, { type: "cast", actor: "wizard", spell: "find-familiar", summon: { form: "owl", type: "fey", at: [at] } }, U3)));
  const gob = near(s, owl, "goblin-warrior", { name: "Goblin" });
  return { s, owl, gob };
}
for (const grid of GRIDS) {
  test(`${grid}: a player's familiar waits for its player, unless its player lets the brain play it`, () => {
    const { s, owl } = owlTable(grid);
    fight(s, grid);
    turnOf(s, owl);
    assert.equal(brainMode(s, s.entities[owl]), "player");
    assert.equal(aiStep(s, owl), null, "it waits for Cy");
    assert.equal(autoPlays(s, owl), false);
    ok(apply(s, { type: "companion", actor: owl, auto: true }, U3));
    assert.equal(brainMode(s, s.entities[owl]), "free");
    assert.ok(autoPlays(s, owl));
    // It can't attack (Find Familiar): with nothing else to do it takes the Dodge action and steps away from the goblin.
    const types = autoTurn(s, owl).map((x) => x.a.type);
    assert.ok(!types.includes("act") && !types.includes("attack"), json(types));
    assert.equal(types[0], "dodge");
    // It ends its turn, or the goblin's Opportunity Attack kills it as it steps away (an owl has 1 Hit Point).
    assert.ok(types.at(-1) === "endTurn" || !s.entities[owl], json(types));
  });

  test(`${grid}: a player's familiar is played by the brain while its player is offline or stepped away, or its master is Incapacitated`, () => {
    const { s, owl } = owlTable(grid);
    fight(s, grid);
    turnOf(s, owl);
    const e = () => s.entities[owl];
    assert.equal(brainMode(s, e(), { offline: (u) => u === "u1" }), "player", "another player offline changes nothing");
    assert.equal(brainMode(s, e(), { offline: (u) => u === "u3" }), "free");
    assert.ok(autoPlays(s, owl, { offline: (u) => u === "u3" }));
    ok(apply(s, { type: "stepAway", actor: "wizard", how: "dodge" }, DM));
    assert.equal(brainMode(s, e()), "free", "stepped away");
    ok(apply(s, { type: "stepBack", actor: "wizard" }, DM));
    assert.equal(brainMode(s, e()), "player");
    ok(apply(s, { type: "condition", actor: "wizard", condition: "paralyzed" }, DM));
    assert.equal(brainMode(s, e()), "free", "Incapacitated: it acts independently (Find Familiar)");
    // Released (its player left the table), it is the DM's and the brain's.
    ok(apply(s, { type: "condition", actor: "wizard", condition: "paralyzed", on: false }, DM));
    ok(apply(s, { type: "release", entity: "wizard" }, DM));
    assert.equal(brainMode(s, e()), "free");
    const types = autoTurn(s, owl).map((x) => x.a.type);
    assert.ok(types.at(-1) === "endTurn" || !s.entities[owl], json(types));
  });

  test(`${grid}: a summon whose master can't speak takes the Dodge action (SRD: "If you don't issue any, it takes the Dodge action")`, () => {
    const s = table(grid);
    const wolf = near(s, "wizard", "wolf", {}, { min: 1, max: 2 });
    ok(apply(s, { type: "bond", actor: wolf, to: "wizard", kind: "summon", turn: "after" }, DM));
    near(s, wolf, "goblin-warrior");
    fight(s, grid);
    ok(apply(s, { type: "condition", actor: "wizard", condition: "stunned" }, DM));
    turnOf(s, wolf);
    assert.equal(brainMode(s, s.entities[wolf]), "guard");
    const types = autoTurn(s, wolf).map((x) => x.a.type);
    assert.equal(types[0], "dodge");
    assert.ok(types.every((t) => ["dodge", "move", "endTurn"].includes(t)), json(types));
  });
}

test("the brain never changes the state it reads, and a creature with no bond is not the brain's", () => {
  for (const grid of GRIDS) {
    const { s, skel } = skeletonTable(grid);
    fight(s, grid);
    turnOf(s, skel);
    const before = json(s);
    companionStep(s, skel); aiStep(s, skel); brainMode(s, s.entities[skel]); autoPlays(s, skel);
    assert.equal(json(s), before);
    assert.equal(brainMode(s, s.entities.fighter), null);
    assert.equal(companionStep(s, "fighter"), null);
  }
});

// ---------- fix round 1 (review of #368) ----------
for (const grid of GRIDS) {
  test(`${grid}: M1: a Find Steed its rider can steer again, on its own turn, is only held still and Dodges: nothing it sends is refused`, () => {
    for (const how of ["auto", "offline"]) {
      const { s, steed } = steedTable(grid);
      const p = cellsNear(s, steed, "goblin-warrior")[0];
      s.entities.cleric.pos = { ...p, z: p.z ?? 0 };
      ok(apply(s, { type: "mount", actor: "cleric", mount: steed }, U2));
      fight(s, grid);
      turnOf(s, "cleric");
      ok(apply(s, { type: "condition", actor: "cleric", condition: "stunned" }, DM));
      ok(apply(s, { type: "endTurn", actor: "cleric" }, DM));
      turnOf(s, steed);
      ok(apply(s, { type: "condition", actor: "cleric", condition: "stunned", on: false }, DM));     // she can steer it again
      if (how === "auto") ok(apply(s, { type: "companion", actor: steed, auto: true }, U2));
      const opts = how === "offline" ? { offline: (u) => u === "u2" } : {};
      assert.equal(brainMode(s, s.entities[steed], opts), "hold", how);
      const from = json(s.entities[steed].pos), sent = [];
      for (let n = 0; n < 5 && current(s) === steed; n++) { const a = aiStep(s, steed, opts); sent.push(a.type); ok(apply(s, a, DM)); }
      assert.deepEqual(sent, ["dodge", "endTurn"], how);
      assert.equal(json(s.entities[steed].pos), from, "it did not carry her anywhere");
    }
  });

  test(`${grid}: M3: a steed carrying a rider who stepped away, is offline or helpless stays where it is and takes the Dodge action`, () => {
    // Its master stepped away while riding it (the table rule `dodge`): it is played, but it stays.
    {
      const { s, steed } = steedTable(grid);
      const p = cellsNear(s, steed, "goblin-warrior")[0];
      s.entities.cleric.pos = { ...p, z: p.z ?? 0 };
      ok(apply(s, { type: "mount", actor: "cleric", mount: steed }, U2));
      fight(s, grid);
      ok(apply(s, { type: "stepAway", actor: "cleric", how: "dodge" }, DM));
      turnOf(s, steed);
      assert.equal(brainMode(s, s.entities[steed]), "hold");
      const from = json(s.entities[steed].pos);
      assert.deepEqual(autoTurn(s, steed).map((x) => x.a.type), ["dodge", "endTurn"]);
      assert.equal(json(s.entities[steed].pos), from);
    }
    // Another rider (the fighter, Ann) Stunned on it, its master's player letting the brain play it: it stays.
    {
      const { s, steed } = steedTable(grid);
      const p = cellsNear(s, steed, "goblin-warrior")[0];
      s.entities.fighter.pos = { ...p, z: p.z ?? 0 };
      ok(apply(s, { type: "mount", actor: "fighter", mount: steed }, DM));
      ok(apply(s, { type: "companion", actor: steed, auto: true }, U2));
      fight(s, grid);
      ok(apply(s, { type: "condition", actor: "fighter", condition: "stunned" }, DM));
      turnOf(s, steed);
      assert.equal(brainMode(s, s.entities[steed]), "hold");
      // And with Ann's player offline (her character able), the same.
      ok(apply(s, { type: "condition", actor: "fighter", condition: "stunned", on: false }, DM));
      assert.notEqual(brainMode(s, s.entities[steed]), "hold");
    }
  });

  test(`${grid}: L1: a never-commanded skeleton steps only as far as it must: the cheapest place out of every foe's reach`, () => {
    const { s, skel, gob } = skeletonTable(grid);
    ok(apply(s, { type: "condition", actor: gob, condition: "blinded" }, DM));       // it can't see the skeleton: no Opportunity Attack (#372, N4)
    fight(s, grid);
    turnOf(s, skel);
    ok(apply(s, aiStep(s, skel), DM));                                   // the Dodge action
    const a = aiStep(s, skel);
    assert.equal(a.type, "move");
    const G = s.map, opts = [...moveOptions(s, s.entities[skel]).values()].filter((v) => v.canStop && apartAt(s, s.entities[skel], v.h, s.entities[gob], s.entities[gob].pos) > 1);
    const chosen = opts.find((v) => v.h.q === a.to.q && v.h.r === a.to.r && v.h.z === a.to.z);
    assert.ok(chosen && G);
    assert.equal(chosen.cost, Math.min(...opts.map((v) => v.cost)), "no farther than it must");
  });

  test(`${grid}: L2: a summon whose player is offline or stepped away has no commands: it takes the Dodge action; let go to the brain or played by the DM it fights`, () => {
    const s = table(grid);
    const wolf = near(s, "wizard", "wolf", {}, { min: 1, max: 2 });
    ok(apply(s, { type: "bond", actor: wolf, to: "wizard", kind: "summon", turn: "after" }, DM));
    near(s, wolf, "goblin-warrior");
    fight(s, grid);
    turnOf(s, wolf);
    const e = () => s.entities[wolf];
    assert.equal(brainMode(s, e()), "player");
    assert.equal(brainMode(s, e(), { offline: (u) => u === "u3" }), "guard", "offline: nobody commands it");
    ok(apply(s, { type: "stepAway", actor: "wizard", how: "dodge" }, DM));
    assert.equal(brainMode(s, e()), "guard", "stepped away");
    ok(apply(s, { type: "stepBack", actor: "wizard" }, DM));
    ok(apply(s, { type: "companion", actor: wolf, auto: true }, U3));
    assert.equal(brainMode(s, e()), "free", "let go to the brain");
    ok(apply(s, { type: "companion", actor: wolf, auto: false }, U3));
    ok(apply(s, { type: "release", entity: "wizard" }, DM));
    assert.equal(brainMode(s, e()), "free", "the DM's");
  });

  test(`${grid}: L3: a companion that drops in its own turn: the brain ends its turn`, () => {
    const { s, skel } = skeletonTable(grid);
    fight(s, grid);
    turnOf(s, skel);
    ok(apply(s, { type: "harm", actor: skel, amount: 999 }, DM));
    assert.deepEqual(aiStep(s, skel), { type: "endTurn", actor: skel });
    ok(apply(s, aiStep(s, skel), DM));
    assert.notEqual(current(s), skel);
  });
}
