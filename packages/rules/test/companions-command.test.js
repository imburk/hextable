// Companions, stage C5a with amendment A2 (docs/specs/companions.md, Decision 6): the master's `command`, one Bonus
// Action for any number of its companions that take commands (`orders: 'command'`), and who plays such a creature: its
// master's player on a turn it was commanded for, the DM otherwise (on its standing order), and with no order ever
// given it only Dodges and moves (the lock). With refusals, the prompt, a twin run for a hidden master, old saves, and
// undo, redo, replay, save and load. The Zombies here are bonded by the DM (Animate Dead's data is stage C5b).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, ownerOf } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { gridOf } from "../src/grid.js";
import { apart, FT } from "../src/space.js";
import { migrate } from "../src/migrate.js";

const DM = { role: "dm", userId: "dm" };
const U1 = { role: "player", userId: "u1" };
const U2 = { role: "player", userId: "u2" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (s) => JSON.stringify(s);
function refused(s, action, ctx, words) {
  const before = json(s), r = apply(s, action, ctx);
  assert.equal(r.ok, false, `${action.type} should be refused`);
  if (words) assert.match(r.error, words);
  assert.equal(json(s), before, "a refused action changes nothing");
  return r;
}
function spots(s, near, r = 3) {
  const G = gridOf(s.map), out = [];
  for (const h of G.range(near, r)) if (apply(structuredClone(s), { type: "spawn", monster: "wolf", at: h }, DM).ok) out.push(h);
  return out;
}
const spawn = (s, monster, at, name) => ok(apply(s, { type: "spawn", monster, at, ...(name ? { name } : {}) }, DM)).events.find((e) => e.type === "spawned").id;
const bond = (s, actor, to, more = {}) => ok(apply(s, { type: "bond", actor, to, ...more }, DM));
const command = (s, actor, ids, more = {}, ctx = DM) => ok(apply(s, { type: "command", actor, ids, ...more }, ctx));
const LOCK = /no command to follow/;
// The valley with two players: u1 plays Brenna (fighter), u2 plays Pip (rogue).
function table(grid, seed = 5) {
  const s = newGame(seed, grid ? { grid } : {});
  s.settings.autoEngage = false;
  ok(apply(s, { type: "claim", entity: "fighter", user: "u1", userName: "Ann" }, U1));
  ok(apply(s, { type: "claim", entity: "rogue", user: "u2", userName: "Bo" }, U2));
  return s;
}
// `n` Zombies beside Brenna, bonded to her as undead that take commands (straight after her, by default, so the tests
// know whose turn comes next).
function horde(s, n, more = {}, master = "fighter") {
  const free = spots(s, s.entities[master].pos, 2);
  return Array.from({ length: n }, (_, i) => {
    const z = spawn(s, "zombie", free[i], `Zombie ${i + 1}`);
    bond(s, z, master, { kind: "undead", orders: "command", turn: "after", ...more });
    return z;
  });
}
// A goblin in the arena, so the fight does not end at once, and the fight started on Brenna.
function fight(s) {
  const f = s.entities.fighter, far = spots(s, f.pos, 4).filter((h) => gridOf(s.map).dist(h, f.pos) >= 4);
  const gob = spawn(s, "goblin-warrior", far[0], "Gob");
  ok(apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM));
  return gob;
}
const endTurn = (s, ctx = DM) => ok(apply(s, { type: "endTurn", actor: current(s) }, ctx));
function toTurn(s, id, all = []) {
  for (let i = 0; i < 100 && s.encounter && current(s) !== id; i++) all.push(...endTurn(s).events);
  assert.equal(current(s), id, `${id}'s turn came`);
  return all;
}
// A step to a free cell next to where the creature stands.
const step = (s, id) => {
  const G = gridOf(s.map), e = s.entities[id];
  return G.range(e.pos, 1).find((h) => (h.q !== e.pos.q || h.r !== e.pos.r) && apply(structuredClone(s), { type: "move", actor: id, to: h }, DM).ok);
};

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";

  test(`a never-commanded Zombie may only Dodge and move, and is the DM's in a fight${on}`, () => {
    const s = table(grid), [z] = horde(s, 1);
    // Outside a fight its master's player moves it, as any companion, but it does nothing else until commanded.
    assert.equal(ownerOf(s, s.entities[z]), "u1");
    ok(apply(s, { type: "move", actor: z, to: step(s, z) }, U1));
    refused(s, { type: "search", actor: z }, U1, LOCK);
    refused(s, { type: "search", actor: z }, DM, LOCK);
    refused(s, { type: "move", actor: z, to: step(s, z) }, U2, /isn't yours to control/);
    const gob = fight(s);
    toTurn(s, z);
    assert.equal(ownerOf(s, s.entities[z]), null, "the DM's: nobody commanded it");
    refused(s, { type: "move", actor: z, to: step(s, z) }, U1, /isn't yours to control/);
    for (const a of [
      { type: "dash", actor: z }, { type: "disengage", actor: z }, { type: "attack", actor: z, target: gob, attack: "slam" },
      { type: "act", actor: z, action: "slam", target: gob }, { type: "hide", actor: z }, { type: "search", actor: z },
    ]) refused(s, a, DM, LOCK);
    ok(apply(s, { type: "move", actor: z, to: step(s, z) }, DM));
    const r = ok(apply(s, { type: "dodge", actor: z }, DM));
    assert.ok(r.events.some((e) => e.type === "std" && e.action === "Dodge"));
    ok(apply(s, { type: "endTurn", actor: z }, DM));
    assert.equal(s.entities[z].bond.commanded, null);
    assert.equal(s.entities[z].bond.standing, undefined);
  });

  test(`commanded this turn it is its player's, refused for another player, with a prompt to that player alone${on}`, () => {
    const s = table(grid), [z] = horde(s, 1);
    fight(s);
    toTurn(s, "fighter");
    assert.equal(ownerOf(s, s.entities[z]), null, "not its turn yet: the DM's");
    const c = command(s, "fighter", [z], { order: "guard the door" }, U1);
    assert.deepEqual(c.events, [{ type: "commanded", by: "fighter", ids: [z], order: "guard the door" }]);
    for (const u of [U1, U2]) assert.deepEqual(viewEvents(c.events, s, u), c.events, "the party's own command is told to the party");
    assert.equal(s.encounter.budget.bonus, 0, "it took Brenna's Bonus Action");
    assert.deepEqual(s.entities[z].bond.commanded, { order: "guard the door", at: `${s.encounter.id}:${s.encounter.round}:fighter` });
    assert.equal(s.entities[z].bond.standing, "guard the door");
    assert.equal(ownerOf(s, s.entities[z]), null, "still the DM's until its turn");
    const r = endTurn(s, U1);
    assert.equal(current(s), z);
    const prompt = r.events.find((e) => e.type === "commandedTurn");
    assert.deepEqual(prompt, { type: "commandedTurn", id: z, by: "fighter", to: "u1", order: "guard the door", text: "Brenna's Zombie 1 is yours this turn." });
    assert.deepEqual(viewEvents(r.events, s, U1).filter((e) => e.type === "commandedTurn"), [{ type: "commandedTurn", id: z, by: "fighter", order: "guard the door", text: "Brenna's Zombie 1 is yours this turn." }]);
    assert.deepEqual(viewEvents(r.events, s, U2).filter((e) => e.type === "commandedTurn"), [], "to the master's player only");
    assert.equal(ownerOf(s, s.entities[z]), "u1");
    // Its player picks its action and move; the other player may not; the DM always may.
    refused(s, { type: "move", actor: z, to: step(s, z) }, U2, /isn't yours to control/);
    ok(apply(s, { type: "move", actor: z, to: step(s, z) }, U1));
    ok(apply(s, { type: "dash", actor: z }, U1));
    ok(apply(s, { type: "endTurn", actor: z }, U1));
    assert.equal(ownerOf(s, s.entities[z]), null, "its turn is over");
    // The next round: no command, an order stands. The DM plays it on that order, as it sees fit: the lock is off.
    toTurn(s, "fighter");
    endTurn(s, U1);
    assert.equal(current(s), z);
    assert.equal(s.entities[z].bond.commanded, null, "the spent command is cleared at its next turn");
    assert.equal(ownerOf(s, s.entities[z]), null);
    refused(s, { type: "dash", actor: z }, U1, /isn't yours to control/);
    ok(apply(s, { type: "dash", actor: z }, DM));
    endTurn(s);
    // A command with `order: null` clears the order: the turn it is for is the player's, then it Dodges again.
    toTurn(s, "fighter");
    command(s, "fighter", [z], { order: null }, U1);
    assert.equal(s.entities[z].bond.standing, null);
    endTurn(s, U1);
    ok(apply(s, { type: "dash", actor: z }, U1));
    endTurn(s, U1);
    toTurn(s, z);
    refused(s, { type: "dash", actor: z }, DM, LOCK);
    // Without words the command is for the one turn, and the order that stands is unchanged.
    endTurn(s);
    toTurn(s, "fighter");
    command(s, "fighter", [z], {}, U1);
    assert.equal(s.entities[z].bond.standing, null);
    assert.deepEqual(endTurn(s, U1).events.find((e) => e.type === "commandedTurn")?.text, "Brenna's Zombie 1 is yours this turn.");
    ok(apply(s, { type: "dash", actor: z }, U1));
  });

  test(`a Zombie with its own turn before its master's: the command is for its next turn, in the next round${on}`, () => {
    const s = table(grid), f = s.entities.fighter, z = spawn(s, "zombie", spots(s, f.pos, 2)[0], "Zombie");
    bond(s, z, "fighter", { kind: "undead", orders: "command", turn: "own" });
    s.entities[z].initBonus = 30;                     // always before Brenna
    fight(s);
    const ids = s.encounter.order.map((o) => o.id);
    assert.ok(ids.indexOf(z) < ids.indexOf("fighter"), ids.join(" "));
    toTurn(s, "fighter");
    command(s, "fighter", [z], { order: "hold the bridge" }, U1);
    const round = s.encounter.round;
    toTurn(s, z);
    assert.equal(s.encounter.round, round + 1);
    assert.equal(ownerOf(s, s.entities[z]), "u1");
    assert.equal(s.entities[z].bond.commanded.turn, `${s.encounter.id}:${round + 1}:${z}`);
    endTurn(s, U1);
    toTurn(s, z);
    assert.equal(ownerOf(s, s.entities[z]), null, "a round later, the DM's on the order that stands");
    ok(apply(s, { type: "dash", actor: z }, DM));
  });

  test(`one command for three costs one Bonus Action; with none left it is refused${on}`, () => {
    const s = table(grid), zs = horde(s, 3);
    // Outside a fight a command costs nothing, and lifts the lock there.
    command(s, "fighter", zs, {}, U1);
    for (const z of zs) assert.deepEqual(s.entities[z].bond.commanded, { order: null, at: null });
    assert.doesNotMatch(apply(structuredClone(s), { type: "search", actor: zs[0] }, U1).error ?? "", LOCK);
    fight(s);
    toTurn(s, "fighter");
    assert.equal(s.encounter.budget.bonus, 1);
    const before = s.encounter.budget.action;
    command(s, "fighter", zs, { order: "follow me" }, U1);
    assert.equal(s.encounter.budget.bonus, 0);
    assert.equal(s.encounter.budget.action, before, "the action is untouched");
    for (const z of zs) assert.equal(s.entities[z].bond.standing, "follow me");
    refused(s, { type: "command", actor: "fighter", ids: [zs[0]] }, U1, /already used a Bonus Action/);
    refused(s, { type: "command", actor: "fighter", ids: [zs[0]] }, DM, /already used a Bonus Action/);
    // Each of the three has its turn in its player's hands, and the prompt with it.
    const all = [];
    for (const z of zs) {
      all.push(...endTurn(s, U1).events);
      assert.equal(current(s), z);
      assert.equal(ownerOf(s, s.entities[z]), "u1");
    }
    assert.equal(all.filter((e) => e.type === "commandedTurn").length, 3);
    // Not on another creature's turn, and not by another's player.
    refused(s, { type: "command", actor: "fighter", ids: [zs[0]] }, U1, /isn't Brenna's turn/);
  });

  test(`refused, changing nothing: out of range, another master's, a free companion, a stranger, bad words${on}`, () => {
    const s = table(grid), [near, far] = horde(s, 2);
    const f = s.entities.fighter, theirs = horde(s, 1, {}, "rogue")[0];
    const wolf = spawn(s, "wolf", spots(s, f.pos, 3).at(-1), "Wolf");
    const pet = spawn(s, "wolf", spots(s, f.pos, 3).at(-2), "Pet");
    bond(s, pet, "fighter");
    // The source's command range (Animate Dead's 60 ft is the step's in stage C5b; set here by hand).
    const d = apart(s, f, s.entities[far]) * FT;
    assert.ok(d >= 5);
    s.entities[far].bond.range = d - FT;
    s.entities[near].bond.range = 60;
    fight(s);
    toTurn(s, "fighter");
    refused(s, { type: "command", actor: "fighter", ids: [near, far] }, U1, new RegExp(`Zombie 2 is ${d} ft from Brenna. A command reaches ${d - FT} ft`));
    refused(s, { type: "command", actor: "fighter", ids: [theirs] }, U1, /Zombie 1 is not Brenna's companion/);
    refused(s, { type: "command", actor: "fighter", ids: [theirs] }, DM, /not Brenna's companion/);
    refused(s, { type: "command", actor: "fighter", ids: [wolf] }, U1, /Wolf is not Brenna's companion/);
    refused(s, { type: "command", actor: "fighter", ids: [wolf] }, DM, /no one's companion/);
    refused(s, { type: "command", actor: "fighter", ids: [pet] }, U1, /takes no commands/);
    refused(s, { type: "command", actor: "fighter", ids: [near] }, U2, /isn't yours to control/);
    refused(s, { type: "command", actor: "rogue", ids: [near] }, U2);
    refused(s, { type: "command", actor: "fighter", ids: ["nobody"] }, U1, /No such creature/);
    refused(s, { type: "command", actor: "fighter", ids: ["constructor"] }, U1, /No such creature/);
    for (const ids of [undefined, [], near, [near, near], [1]]) refused(s, { type: "command", actor: "fighter", ids }, U1, /Name the creatures/);
    for (const order of ["", "   ", "x".repeat(81), 5, {}]) refused(s, { type: "command", actor: "fighter", ids: [near], order }, U1, /up to 80 characters/);
    ok(apply(structuredClone(s), { type: "command", actor: "fighter", ids: [near], order: "x".repeat(80) }, U1));
    // An order that happens to be a creature's id, one the party knows of or not, is words, not a creature.
    for (const order of ["m1", "m5", theirs]) ok(apply(structuredClone(s), { type: "command", actor: "fighter", ids: [near], order }, U1));
  });
}

// ---------- what players are sent ----------

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";
  // Two runs of one fight that differ only in a hiding foe master's command to its Zombie: players get the same.
  test(`a hidden master's command: players get the same events, view, record and seq as with no command${on}`, () => {
    const run = (commanding) => {
      const s = table(grid), f = s.entities.fighter, log = [];
      const mage = spawn(s, "goblin-warrior", spots(s, f.pos, 4).at(-1), "Mage");
      s.entities[mage].hiding = true;
      const z = spawn(s, "zombie", spots(s, f.pos, 2)[0], "Zombie");
      bond(s, z, mage, { kind: "undead", orders: "command", turn: "own" });
      // Outside the fight too: a DM-hidden master's command, and nothing.
      if (commanding) log.push(command(s, mage, [z], { order: "kill them all" }));
      log.push(ok(apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM)));
      let told = 0;
      for (let i = 0; i < 24 && s.encounter; i++) {
        if (current(s) === mage && commanding) { log.push(command(s, mage, [z], i % 2 ? {} : { order: "kill them all" })); told++; }
        if (current(s) === z) log.push(ok(apply(s, { type: "dodge", actor: z }, DM)));
        log.push(endTurn(s));
      }
      if (commanding) assert.ok(told >= 3, "the master commanded in the fight");
      assert.ok(s.entities[mage].hiding, "the master stayed hidden");
      // The commands are steps of their own in one run only: what players get is compared all together, step by step
      // dropping those that send them nothing.
      return { s, seen: [U1, U2].map((u) => log.map((r) => json(viewEvents(r.events, s, u))).filter((x) => x !== "[]")), view: [U1, U2].map((u) => json(view(s, u))), tl: [U1, U2].map((u) => json(viewEvents(s.timeline, s, u))), seq: s.seq };
    };
    const A = run(true), B = run(false);
    assert.ok(A.s.timeline.some((e) => e.type === "commanded"), "the DM's record has it");
    assert.deepEqual(A.seen, B.seen, "the events players get");
    assert.deepEqual(A.view, B.view, "their view");
    assert.deepEqual(A.tl, B.tl, "the record");
    assert.equal(A.seq, B.seq);
  });
}

test("a hidden master's command outside a fight, by the DM's switch: nothing reaches players, and the step is not shown", () => {
  for (const grid of [null, "square"]) {
    const s = table(grid), f = s.entities.fighter;
    const mage = spawn(s, "goblin-warrior", spots(s, f.pos, 4).at(-1), "Mage");
    const z = spawn(s, "zombie", spots(s, f.pos, 2)[0], "Zombie");
    bond(s, z, mage, { kind: "undead", orders: "command" });
    ok(apply(s, { type: "reveal", actor: mage, hidden: true }, DM));
    const before = mark(s), r = command(s, mage, [z], { order: "wait" });
    for (const u of [U1, U2]) assert.deepEqual(viewEvents(r.events, s, u), []);
    const label = describeStep({ type: "command", actor: mage, ids: [z], order: "wait" }, r.events, before, s);
    assert.equal(label.label, "Mage commanded Zombie");
    assert.equal(label.shown, null);
    assert.ok(!("bond" in view(s, U1).entities[z]), "a foe's bond is never sent");
  }
});

// ---------- old saves ----------

test("old saves without the fields: a command creature is never-commanded, a free one is unchanged", () => {
  for (const grid of [null, "square"]) {
    const s = table(grid), [z] = horde(s, 1), f = s.entities.fighter;
    const wolf = spawn(s, "wolf", spots(s, f.pos, 2).at(-1), "Wolf");
    bond(s, wolf, "fighter", { turn: "after" });
    for (const id of [z, wolf]) { delete s.entities[id].bond.commanded; delete s.entities[id].bond.standing; }
    const saved = json(s), loaded = JSON.parse(saved);
    migrate(loaded);
    assert.equal(json(loaded), saved, "loads unchanged");
    assert.equal(ownerOf(loaded, loaded.entities[wolf]), "u1");
    refused(loaded, { type: "search", actor: z }, U1, LOCK);
    fight(loaded);
    toTurn(loaded, "fighter");
    endTurn(loaded, U1);
    for (let i = 0; i < 3 && current(loaded) !== z; i++) {
      if (current(loaded) === wolf) { assert.equal(ownerOf(loaded, loaded.entities[wolf]), "u1"); ok(apply(loaded, { type: "dash", actor: wolf }, U1)); }
      endTurn(loaded);
    }
    assert.equal(current(loaded), z);
    assert.equal(ownerOf(loaded, loaded.entities[z]), null);
    refused(loaded, { type: "dash", actor: z }, DM, LOCK);
    ok(apply(loaded, { type: "dodge", actor: z }, DM));
    assert.ok(!("commanded" in loaded.entities[z].bond) && !("standing" in loaded.entities[z].bond), "nothing is added");
  }
});

// ---------- undo, redo, replay, save and load ----------

for (const grid of [null, "square"]) {
  test(`undo, redo and replay give back exactly what commands did, and a save in the middle of a fight loads byte-exact${grid ? " (squares)" : " (hexes)"}`, () => {
    const build = () => { const s = table(grid); const zs = horde(s, 2); const f = s.entities.fighter; spawn(s, "goblin-warrior", spots(s, f.pos, 4).filter((h) => gridOf(s.map).dist(h, f.pos) >= 4)[0], "Gob"); return { s, zs }; };
    const { s, zs } = build();
    const h = createHistory({ limit: 200 }), states = [json(s)], done = [], labels = [];
    let saved = null, savedAt = -1, commands = 0;
    const play = (a) => {
      const before = mark(s), r = ok(apply(s, a, DM));
      const label = describeStep(a, r.events, before, s);
      h.record(before, s, label);
      labels.push(label); done.push(a); states.push(json(s));
    };
    play({ type: "command", actor: "fighter", ids: zs, order: "stay close" });
    play({ type: "startEncounter", center: s.entities.fighter.pos, radius: 6 });
    for (let i = 0; i < 30 && s.encounter; i++) {
      const who = current(s);
      if (who === "fighter") {
        play({ type: "command", actor: "fighter", ids: i % 3 ? zs : [zs[0]], ...(i % 2 ? { order: null } : { order: "stay close" }) });
        commands++;
        if (!saved) { saved = json(s); savedAt = done.length; }
      }
      if (zs.includes(who)) play(s.entities[who].bond.standing || s.entities[who].bond.commanded?.turn ? { type: "dash", actor: who } : { type: "dodge", actor: who });
      play({ type: "endTurn", actor: current(s) });
    }
    assert.ok(commands >= 3 && saved, "commands were given in the fight");
    assert.ok(labels.some((l) => l.label === "Brenna commanded 2 companions" && l.shown === l.label));
    assert.ok(labels.some((l) => l.label === "Brenna commanded Zombie 1"));
    for (let i = done.length - 1; i >= 0; i--) { h.undo(s); assert.equal(json(s), states[i], `undo ${i}`); }
    for (let i = 1; i <= done.length; i++) { h.redo(s); assert.equal(json(s), states[i], `redo ${i}`); }
    const again = build().s;
    for (const a of done) ok(apply(again, a, DM));
    assert.equal(json(again), states.at(-1), "replayed, the same");
    const loaded = JSON.parse(saved);
    migrate(loaded);
    assert.equal(json(loaded), saved, "loads unchanged");
    for (const a of done.slice(savedAt)) ok(apply(loaded, a, DM));
    assert.equal(json(loaded), states.at(-1), "played on from the save, the same");
  });
}
