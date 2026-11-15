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
import { newGame } from "../src/scenario.js";
import { apart } from "../src/space.js";
import { gridOf } from "../src/grid.js";
import { squareRoom } from "./fixtures/square-room.js";

const DM = { role: "dm", userId: "dm" };
const U1 = { role: "player", userId: "u1" }, U2 = { role: "player", userId: "u2" }, U3 = { role: "player", userId: "u3" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
const GRIDS = ["hex", "square"];
// Places that stand clear of each other on each map (the riding tests' places, the paladin and the wizard apart).
const SPOTS = {
  hex: { fighter: { q: -8, r: 3 }, rogue: { q: -7, r: 3 }, cleric: { q: -4, r: 2 }, wizard: { q: -8, r: 5 }, far: { q: 2, r: 2 } },
  square: { fighter: { q: 1, r: 12 }, rogue: { q: 2, r: 12 }, cleric: { q: 6, r: 6 }, wizard: { q: 3, r: 12 }, far: { q: 12, r: 1 } },
};
const CENTER = { hex: { q: -4, r: 2 }, square: { q: 7, r: 7 } };
const spawned = (r) => r.events.find((e) => e.type === "spawned" || e.type === "summoned").id;
const spawn = (s, monster, at, more = {}) => spawned(ok(apply(s, { type: "spawn", monster, at, ...more }, DM)));
// The cells within `d` (cells, by `apart`) of a creature where a `monster` can be spawned, nearest first, in a fixed order.
function cellsNear(s, id, monster, { min = 1, max = 1 } = {}) {
  const G = gridOf(s.map), e = s.entities[id], out = [];
  for (const h of G.range(e.pos, max + 2).sort((a, b) => G.dist(a, e.pos) - G.dist(b, e.pos) || a.q - b.q || a.r - b.r)) {
    const t = structuredClone(s), r = apply(t, { type: "spawn", monster, at: h }, DM);
    if (!r.ok) continue;
    const d = apart(t, e, t.entities[spawned(r)]);
    if (d >= min && d <= max) out.push(h);
  }
  return out;
}
const near = (s, id, monster, more = {}, range = {}) => { const h = cellsNear(s, id, monster, range)[0]; assert.ok(h, `room near ${id}`); return spawn(s, monster, h, more); };
const turnOf = (s, id) => { for (let i = 0; i < 80 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
function table(grid, seed = 5) {
  const s = newGame(seed);
  if (grid === "square") ok(apply(s, { type: "loadMap", map: squareRoom() }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  for (const id of Object.keys(s.entities)) if (/^m\d+$/.test(id)) ok(apply(s, { type: "remove", actor: id }, DM));
  for (const id of ["fighter", "rogue", "cleric", "wizard"]) s.entities[id].pos = { ...SPOTS[grid][id], z: 0 };
  ok(apply(s, { type: "claim", entity: "fighter", user: "u1", userName: "Ann" }, U1));
  ok(apply(s, { type: "claim", entity: "cleric", user: "u2", userName: "Bo" }, U2));
  ok(apply(s, { type: "claim", entity: "wizard", user: "u3", userName: "Cy" }, U3));
  return s;
}
const fight = (s, grid) => ok(apply(s, { type: "startEncounter", center: CENTER[grid], radius: 7 }, DM));
// The DM's auto-play for one turn, as the client does it: the brain's steps through apply() until the turn ends. Every
// step must be accepted (the brain never sends what the engine refuses).
function autoTurn(s, id, max = 20) {
  const sent = [];
  for (let n = 0; n < max && s.encounter && current(s) === id; n++) {
    if (s.pending) { ok(apply(s, { type: "react", prompt: s.pending.n, take: null }, DM)); continue; }
    const a = aiStep(s, id);
    assert.ok(a, `the brain has a step for ${id}`);
    const r = apply(s, a, DM);
    assert.ok(r.ok, `${json(a)} was refused: ${r.error}`);
    sent.push({ a, r });
  }
  if (process.env.C7_DEBUG) console.log(id, json(sent.map((x) => [x.a, x.r.events.map((e) => e.type)])));
  assert.ok(!s.encounter || current(s) !== id, "the turn ended");
  return sent;
}

// ---------- a never-commanded Skeleton ----------
function skeletonTable(grid) {
  const s = table(grid);
  const skel = near(s, "cleric", "skeleton", { name: "Skeleton" }, { min: 2, max: 3 });
  ok(apply(s, { type: "bond", actor: skel, to: "cleric", kind: "undead", orders: "command" }, DM));
  const gob = near(s, skel, "goblin-warrior", { name: "Goblin" });
  return { s, skel, gob };
}

for (const grid of GRIDS) {
  test(`${grid}: a never-commanded Skeleton takes the Dodge action and steps away from the goblin beside it, then ends its turn`, () => {
    const { s, skel, gob } = skeletonTable(grid);
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
