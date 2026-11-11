import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep } from "../../rules/src/ai.js";
import { current, moveOptions } from "../../rules/src/engine.js";
import * as H from "../../rules/src/hex.js";
import { createTables } from "../src/tables.js";

// A fake connection that records what the server told it.
function client(tables) {
  const got = [];
  const session = tables.connect({ send: (m) => got.push(structuredClone(m)) });
  return {
    got, session,
    say: (m) => session.receive(m),
    last: (t) => got.findLast((m) => m.t === t),
    count: (t) => got.filter((m) => m.t === t).length,
  };
}
function seated(tables) {
  const dm = client(tables);
  dm.say({ t: "host", name: "Dana" });
  const code = dm.last("welcome").code;
  const player = client(tables);
  player.say({ t: "join", code, name: "Pat" });
  dm.say({ t: "approve", userId: player.last("welcome").userId, ok: true });
  return { dm, player, code };
}
const freeHex = (state, id) => H.parse([...moveOptions(state, state.entities[id])].find(([, v]) => v.canStop)[0]);

test("hosting creates a table and seats the host as DM", () => {
  const tables = createTables({ seed: () => 5 });
  const dm = client(tables);
  dm.say({ t: "host", name: "  Dana  " });
  const w = dm.last("welcome");
  assert.equal(w.role, "dm");
  assert.equal(w.name, "Dana");
  assert.equal(w.approved, true);
  assert.match(w.code, /^[A-Z2-9]{6}$/);
  assert.ok(dm.last("update").state.entities.fighter);
  assert.equal(tables.size(), 1);
});

test("a player waits for the DM, sees nothing until let in, then gets the game", () => {
  const tables = createTables({ seed: () => 5 });
  const dm = client(tables);
  dm.say({ t: "host", name: "Dana" });
  const player = client(tables);
  player.say({ t: "join", code: dm.last("welcome").code.toLowerCase(), name: "Pat" });

  assert.equal(player.last("welcome").approved, false);
  assert.equal(player.count("update"), 0);
  assert.deepEqual(dm.last("lobby").pending.map((p) => p.name), ["Pat"]);

  player.say({ t: "act", action: { type: "rest" } });
  assert.match(player.last("error").error, /Waiting for the DM/);

  dm.say({ t: "approve", userId: player.last("welcome").userId, ok: true });
  assert.equal(player.last("welcome").approved, true);
  assert.equal(player.count("update"), 1);
  assert.deepEqual(dm.last("lobby").pending, []);
  assert.deepEqual(dm.last("lobby").members.map((m) => m.name), ["Dana", "Pat"]);
});

test("a declined player is turned away and a wrong code is refused", () => {
  const tables = createTables({ seed: () => 5 });
  const dm = client(tables);
  dm.say({ t: "host", name: "Dana" });
  const player = client(tables);
  player.say({ t: "join", code: dm.last("welcome").code, name: "Pat" });
  dm.say({ t: "approve", userId: player.last("welcome").userId, ok: false });
  assert.equal(player.last("error").expired, true);
  assert.equal(player.count("update"), 0);
  assert.deepEqual(dm.last("lobby").pending, []);

  const lost = client(tables);
  lost.say({ t: "join", code: "NOPE22", name: "Lee" });
  assert.equal(lost.last("error").expired, true);
});

test("only the DM can approve players", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  const third = client(tables);
  third.say({ t: "join", code, name: "Sam" });
  player.say({ t: "approve", userId: third.last("welcome").userId, ok: true });
  assert.match(player.last("error").error, /Only the DM/);
  assert.equal(third.last("welcome").approved, false);
  assert.equal(dm.last("lobby").pending.length, 1);
});

test("actions are checked by the rules and the result goes to everyone", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  const state = () => tables.get(code).state;
  const me = player.last("welcome").userId;

  // A player cannot move a character they haven't claimed, or use DM tools.
  player.say({ t: "act", action: { type: "move", actor: "rogue", to: freeHex(state(), "rogue") } });
  assert.match(player.last("error").error, /isn't yours/);
  player.say({ t: "act", action: { type: "spawn", monster: "goblin", at: { q: 0, r: 0 } } });
  assert.match(player.last("error").error, /Only the DM/);

  // Claiming for someone else is rewritten to a claim for yourself.
  const before = dm.count("update");
  player.say({ t: "act", action: { type: "claim", entity: "rogue", user: "someone-else", userName: "Mallory" } });
  assert.equal(state().entities.rogue.owner, me);
  assert.equal(state().entities.rogue.ownerName, "Pat");
  assert.equal(dm.count("update"), before + 1);
  assert.equal(player.last("update").events[0].type, "claimed");

  // Now the move is legal, and both clients receive the same events.
  player.say({ t: "act", action: { type: "move", actor: "rogue", to: freeHex(state(), "rogue") } });
  assert.equal(dm.last("update").events[0].type, "moved");
  assert.deepEqual(dm.last("update").events, player.last("update").events);
  assert.deepEqual(dm.last("update").state.entities.rogue, player.last("update").state.entities.rogue);

  // Garbage does not crash the table.
  player.say({ t: "act", action: { type: "move", actor: "rogue" } });
  player.say({ t: "act", action: "attack" });
  player.say({ t: "act" });
  assert.equal(player.last("error").error, "That isn't an action.");
  dm.say({ t: "act", action: { type: "rest" } });
  assert.equal(dm.last("update").events[0].type, "rest");
});

test("a player who drops shows as away and can resume with their token", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  const { token, userId } = player.last("welcome");

  player.session.disconnect();
  assert.equal(dm.last("lobby").members.find((m) => m.id === userId).online, false);

  const back = client(tables);
  back.say({ t: "resume", code, token });
  assert.equal(back.last("welcome").userId, userId);
  assert.ok(back.last("update").state);
  assert.equal(dm.last("lobby").members.find((m) => m.id === userId).online, true);

  const thief = client(tables);
  thief.say({ t: "resume", code, token: "guess" });
  assert.equal(thief.last("error").expired, true);
});

test("tables survive a restart", () => {
  const disk = new Map();
  const store = { load: () => [...disk.values()].map((s) => JSON.parse(s)), save: (t) => disk.set(t.code, JSON.stringify(t)) };
  const first = createTables({ ...store, seed: () => 5 });
  const { dm, player, code } = seated(first);
  dm.say({ t: "act", action: { type: "chronicle", title: "The bridge burned" } });

  const second = createTables(store);
  const back = client(second);
  back.say({ t: "resume", code, token: player.last("welcome").token });
  assert.equal(back.last("welcome").role, "player");
  assert.ok(back.last("update").state.entities.fighter);
  const dmBack = client(second);
  dmBack.say({ t: "resume", code, token: dm.last("welcome").token });
  assert.ok(dmBack.last("history").entries.some((e) => e.title === "The bridge burned"));
  assert.ok(second.get(code).state.timeline.length > 0);
});

test("a player who leaves before being let in withdraws their request", () => {
  const tables = createTables({ seed: () => 5 });
  const dm = client(tables);
  dm.say({ t: "host", name: "Dana" });
  const code = dm.last("welcome").code;
  const first = client(tables), second = client(tables);
  first.say({ t: "join", code, name: "Pat" });
  second.say({ t: "join", code, name: "Pat" });
  assert.equal(dm.last("lobby").pending.length, 2);

  first.session.disconnect();
  assert.deepEqual(dm.last("lobby").pending.map((p) => p.id), [second.last("welcome").userId]);
  assert.equal(tables.get(code).members.length, 2);

  // The withdrawn request cannot be resumed, and an approved player who drops is kept.
  const again = client(tables);
  again.say({ t: "resume", code, token: first.last("welcome").token });
  assert.equal(again.last("error").expired, true);
  dm.say({ t: "approve", userId: second.last("welcome").userId, ok: true });
  second.session.disconnect();
  assert.equal(tables.get(code).members.length, 2);
});

test("a player who leaves frees their character and their seat; the DM's seat is kept", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  const { token, userId } = player.last("welcome");
  player.say({ t: "act", action: { type: "claim", entity: "rogue" } });
  assert.equal(tables.get(code).state.entities.rogue.owner, userId);

  player.say({ t: "leave" });
  assert.equal(tables.get(code).state.entities.rogue.owner, null);
  assert.equal(dm.last("update").events[0].type, "released");
  assert.deepEqual(dm.last("lobby").members.map((m) => m.name), ["Dana"]);

  // The old seat is gone, but the same connection can join again as a new player.
  const back = client(tables);
  back.say({ t: "resume", code, token });
  assert.equal(back.last("error").expired, true);
  player.say({ t: "join", code, name: "Pat" });
  assert.equal(player.last("welcome").approved, false);

  dm.say({ t: "leave" });
  assert.equal(tables.get(code).members.some((m) => m.role === "dm"), true);
  dm.say({ t: "act", action: { type: "rest" } });
  assert.equal(dm.last("update").events[0].type, "rest");
});

// ---------- what players are sent (docs/specs/hidden-information.md) ----------

test("players are never sent the dice seed or a monster's numbers; the DM is", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  const late = client(tables);
  late.say({ t: "join", code, name: "Lee" });
  dm.say({ t: "approve", userId: late.last("welcome").userId, ok: true });
  dm.say({ t: "act", action: { type: "rest" } });

  for (const c of [player, late]) {
    for (const m of c.got) {
      const text = JSON.stringify(m);
      assert.equal(text.includes('"rng"'), false, `seed sent in a ${m.t} message`);
    }
  }
});

test("property 4: a whole fight never tells a player a monster's hit points, Armor Class or unused attacks", () => {
  const tables = createTables({ seed: () => 3 });
  const { dm, player, code } = seated(tables);
  const state = tables.get(code).state;
  const goblin = state.entities.m1;
  Object.assign(goblin, { hp: 7919, maxHp: 7919, ac: 97 });
  goblin.attacks.push({ id: "canary", name: "CANARY", type: "ranged", bonus: 61, damage: "1d4", dtype: "psychic", range: [5, 10] });

  dm.say({ t: "act", action: { type: "startEncounter", center: goblin.pos, radius: 30 } });
  for (let i = 0; i < 4000 && state.encounter; i++) {
    const id = current(state);
    const before = dm.count("error");
    dm.say({ t: "act", action: aiStep(state, id) ?? { type: "endTurn", actor: id } });
    if (dm.count("error") > before) dm.say({ t: "act", action: { type: "endTurn", actor: id } });
  }
  assert.equal(state.encounter, null, "the fight should have finished");

  // The DM saw the real numbers, so the check below is not passing by accident.
  // 7919 as a whole JSON number, so digits inside a terrain height don't count.
  const has7919 = (text) => /[:\[,]7919[,}\]]/.test(text);
  const dmText = dm.got.map((m) => JSON.stringify(m)).join("\n");
  assert.ok(has7919(dmText) && dmText.includes('"ac":97') && dmText.includes("CANARY"));

  const updates = player.got.filter((m) => m.t === "update");
  assert.ok(updates.length > 50);
  for (const m of player.got) {
    const text = JSON.stringify(m);
    assert.equal(text.includes('"rng"'), false);
    assert.equal(has7919(text), false, "a monster's hit points were sent to a player");
    assert.equal(text.includes('"ac":97'), false);
    assert.equal(text.includes("CANARY"), false);
    assert.equal(text.includes('"bonus":61'), false);
  }
  // Players did see the fight: attacks on their heroes, with outcomes but no monster dice.
  const hits = updates.flatMap((m) => m.events).filter((e) => e.type === "attack" && e.actor === "m1");
  assert.ok(hits.length > 0);
  for (const e of hits) assert.deepEqual(Object.keys(e).filter((k) => ["rolls", "nat", "total"].includes(k)), []);
  assert.equal(player.last("update").state.entities.m1.health, "healthy");
});

test("property 9: the DM's chronicle reaches the DM and not the players", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  dm.say({ t: "act", action: { type: "chronicle", title: "The duke is a doppelganger" } });
  assert.equal(dm.last("update").events[0].title, "The duke is a doppelganger");
  for (const m of player.got) assert.equal(JSON.stringify(m).includes("doppelganger"), false);

  // A player who joins or rejoins later is not sent it either.
  const back = client(tables);
  back.say({ t: "resume", code, token: player.last("welcome").token });
  for (const m of back.got) assert.equal(JSON.stringify(m).includes("doppelganger"), false);
  // Nor is the scenario's own back story, which lives in the same timeline.
  for (const m of back.got) assert.equal(JSON.stringify(m).includes("timeline"), false);
});

test("the timeline is never part of an update; the DM reads it through history", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  dm.say({ t: "act", action: { type: "chronicle", title: "The duke is a doppelganger" } });
  dm.say({ t: "act", action: { type: "advanceTime", minutes: 60 } });
  dm.say({ t: "act", action: { type: "chronicle", title: "The bridge has fallen" } });

  for (const c of [dm, player]) for (const m of c.got) assert.equal(JSON.stringify(m).includes('"timeline"'), false);
  assert.ok(tables.get(code).state.timeline.length >= 5, "the server still keeps the record");

  // The DM's chronicle list: every chronicle entry, oldest first, each with its in-world time.
  dm.say({ t: "history", types: ["chronicle"], limit: 200 });
  const entries = dm.last("history").entries;
  assert.deepEqual(entries.slice(-2).map((e) => e.title), ["The duke is a doppelganger", "The bridge has fallen"]);
  assert.equal(entries.at(-1).t - entries.at(-2).t, 60);
  assert.ok(entries.every((e) => e.type === "chronicle" && typeof e.t === "number"));
  assert.equal(dm.last("history").recent, undefined);

  // A player asking the same question gets nothing private.
  player.say({ t: "history", types: ["chronicle"], limit: 200 });
  assert.deepEqual(player.last("history").entries, []);
});

test("history is redacted for players, limited in size, and refused before approval", () => {
  const tables = createTables({ seed: () => 3 });
  const { dm, player, code } = seated(tables);
  const state = tables.get(code).state;
  // A long campaign's worth of earlier entries, then a fight on top.
  for (let i = 0; i < 300; i++) state.timeline.push({ t: state.clock, type: "std", id: "fighter", action: "Dodge" });
  dm.say({ t: "act", action: { type: "startEncounter", center: state.entities.m1.pos, radius: 30 } });
  for (let i = 0; i < 4000 && state.encounter; i++) {
    const id = current(state), before = dm.count("error");
    dm.say({ t: "act", action: aiStep(state, id) ?? { type: "endTurn", actor: id } });
    if (dm.count("error") > before) dm.say({ t: "act", action: { type: "endTurn", actor: id } });
  }
  assert.equal(state.encounter, null);
  assert.ok(state.timeline.length > 340);

  player.say({ t: "history", limit: 100000 });
  const seen = player.last("history").entries;
  assert.equal(seen.length, 200);
  const byMonsters = seen.filter((e) => e.type === "attack" && state.entities[e.actor].side !== "party");
  assert.ok(byMonsters.length > 0);
  for (const e of byMonsters) { assert.equal("rolls" in e, false); assert.equal("total" in e, false); assert.equal(typeof e.t, "number"); }
  assert.equal(seen.some((e) => e.type === "chronicle"), false);

  // Odd queries are tolerated, not trusted.
  player.say({ t: "history", types: "attack", since: "yesterday", limit: -5 });
  assert.equal(player.last("history").entries.length, 1);
  player.say({ t: "history", types: ["heal", 7, null], limit: 3 });
  assert.ok(player.last("history").entries.every((e) => e.type === "heal"));

  // Someone rejoining gets the last 50 visible entries for their log; someone not yet let in gets nothing.
  const back = client(tables);
  back.say({ t: "resume", code, token: player.last("welcome").token });
  assert.equal(back.last("history").recent, true);
  assert.equal(back.last("history").entries.length, 50);
  const waiting = client(tables);
  waiting.say({ t: "join", code, name: "Lee" });
  waiting.say({ t: "history", limit: 10 });
  assert.equal(waiting.count("history"), 0);
  assert.match(waiting.last("error").error, /Waiting for the DM/);
});
