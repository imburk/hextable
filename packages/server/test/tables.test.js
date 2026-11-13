import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { aiStep } from "../../rules/src/ai.js";
import { current, moveOptions } from "../../rules/src/engine.js";
import * as H from "../../rules/src/hex.js";
import { createReceiver } from "../../rules/src/patch.js";
import { view } from "../../rules/src/view.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAssets } from "../src/assets.js";
import { VERSION } from "../../rules/src/migrate.js";
import { createTables, IDLE_MS, MAX_ACTION_BYTES, MAX_MAP_ACTION_BYTES, MAX_SAYS_PER_MINUTE, MAX_TABLES } from "../src/tables.js";

// A fake connection that records what the server told it.
// It runs the same receiver the browser does, so `got` holds what the client ends up knowing:
// each update is stored with the full state as the client has reconstructed it. `raw` holds
// the messages exactly as sent. Set `drop` to lose the next n updates on the way.
function client(tables) {
  const got = [], raw = [];
  const c = { got, raw, drop: 0 };
  const receiver = createReceiver(() => c.session.receive({ t: "sync" }));
  c.receiver = receiver;
  c.session = tables.connect({
    send(m) {
      const msg = JSON.parse(JSON.stringify(m));           // as it would arrive over the wire
      raw.push(msg);
      if (msg.t !== "update") return got.push(msg);
      if (c.drop > 0) { c.drop--; return; }
      const u = receiver.receive(msg);
      if (u) got.push({ t: "update", seq: msg.seq, events: u.events, state: structuredClone(u.state) });
    },
  });
  const session = c.session;
  return Object.assign(c, {
    say: (m) => session.receive(m),
    last: (t) => got.findLast((m) => m.t === t),
    count: (t) => got.filter((m) => m.t === t).length,
  });
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
  player.say({ t: "act", action: { type: "spawn", monster: "goblin-warrior", at: { q: 0, r: 0 } } });
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

test("property 5: a hidden monster is in no message to a player until it is revealed", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  const state = tables.get(code).state;
  dm.say({ t: "act", action: { type: "setting", key: "autoEngage", value: false } });
  player.say({ t: "act", action: { type: "claim", entity: "rogue" } });
  const pip = state.entities.rogue;

  // The DM adds a hidden wolf a few hexes from Pip, moves it, and writes it into the record.
  const spot = H.range(pip.pos, 5).find((h) => H.dist(h, pip.pos) === 5 && state.map.levels[0].tiles[H.key(h)]?.t === "grass" && !Object.values(state.entities).some((e) => H.key(e.pos) === H.key(h)));
  dm.say({ t: "act", action: { type: "spawn", monster: "wolf", at: spot, hidden: true, name: "Greyjaw" } });
  const id = dm.last("update").events[0].id;
  assert.equal(state.entities[id].hidden, true);
  dm.say({ t: "act", action: { type: "advanceTime", minutes: 10 } });
  dm.say({ t: "act", action: { type: "rest" } });
  player.say({ t: "history", limit: 200 });
  const back = client(tables);
  back.say({ t: "resume", code, token: player.last("welcome").token });

  const mentions = (m) => { const text = JSON.stringify(m); return text.includes(`"${id}"`) || text.includes("Greyjaw"); };
  assert.ok(dm.got.some(mentions), "the DM does see it");
  for (const c of [player, back]) for (const m of c.got) assert.equal(mentions(m), false, `sent to a player early: ${m.t}`);

  // A guessed id gets the same answer as an id that does not exist.
  player.say({ t: "act", action: { type: "attack", actor: "rogue", target: id, attack: "shortbow" } });
  assert.equal(player.last("error").error, "No such creature.");
  assert.equal(mentions(player.last("error")), false);

  // Pip walks toward it. The first message that mentions the wolf carries its reveal, first in the list.
  const seenBefore = player.got.length;
  const steps = [...moveOptions(state, pip)].filter(([k, v]) => v.canStop && H.dist(H.parse(k), spot) === 2).sort((a, b) => a[1].cost - b[1].cost);
  player.say({ t: "act", action: { type: "move", actor: "rogue", to: H.parse(steps[0][0]) } });
  const first = player.got.slice(seenBefore).find(mentions);
  assert.ok(first, "the reveal reached the player");
  assert.deepEqual(first.events[0], { type: "revealed", id });
  assert.equal(first.state.entities[id].name, "Greyjaw");
  assert.equal(first.state.entities[id].health, "healthy");
  assert.equal("maxHp" in first.state.entities[id], false);

  // The DM hides it again: it leaves the player's view and the player is told nothing about it.
  const n = player.got.length;
  dm.say({ t: "act", action: { type: "place", actor: id, to: spot } });
  dm.say({ t: "act", action: { type: "reveal", actor: id, hidden: true } });
  const after = player.got.slice(n).filter((m) => m.t === "update");
  assert.equal(id in after.at(-1).state.entities, false);
  assert.equal(after.at(-1).events.length, 0);
});

// ---------- sending only what changed (spec section 6) ----------

// What a client should know: the member's view of the table as it is now, as it would arrive.
const expected = (tables, code, c) => {
  const w = c.last("welcome");
  return JSON.parse(JSON.stringify({ ...view(tables.get(code).state, { role: w.role, userId: w.userId }), timeline: undefined }));
};

test("property 8: patches applied in order always equal the full view, for the DM and for players", () => {
  const tables = createTables({ seed: () => 3 });
  const { dm, player, code } = seated(tables);
  const state = tables.get(code).state;
  const check = () => { for (const c of [dm, player]) assert.deepEqual(c.receiver.state, expected(tables, code, c)); };

  player.say({ t: "act", action: { type: "claim", entity: "rogue" } });
  dm.say({ t: "act", action: { type: "spawn", monster: "wolf", at: { q: 0, r: 0 }, hidden: true } });
  check();
  dm.say({ t: "act", action: { type: "startEncounter", center: state.entities.m1.pos, radius: 30 } });
  check();
  let steps = 0;
  for (; steps < 4000 && state.encounter; steps++) {
    const id = current(state), before = dm.count("error");
    dm.say({ t: "act", action: aiStep(state, id) ?? { type: "endTurn", actor: id } });
    if (dm.count("error") > before) dm.say({ t: "act", action: { type: "endTurn", actor: id } });
    check();
  }
  assert.ok(steps > 30);
  dm.say({ t: "act", action: { type: "rest" } });
  check();

  // After the first full state, everything arrived as a patch, in sequence.
  for (const c of [dm, player]) {
    const updates = c.raw.filter((m) => m.t === "update");
    assert.equal(updates.filter((m) => m.state).length, 1);
    assert.ok(updates.slice(1).every((m, i) => m.patch && m.seq === updates[0].seq + i + 1));
  }
});

test("a lost update is noticed and repaired with one sync", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  const fulls = () => player.raw.filter((m) => m.t === "update" && m.state).length;
  assert.equal(fulls(), 1);

  player.drop = 1;                                                     // this one never arrives
  dm.say({ t: "act", action: { type: "advanceTime", minutes: 10 } });
  assert.notDeepEqual(player.receiver.state, expected(tables, code, player));
  dm.say({ t: "act", action: { type: "advanceTime", minutes: 10 } });   // the gap shows on the next one
  assert.equal(fulls(), 2);
  assert.deepEqual(player.receiver.state, expected(tables, code, player));

  // Back in step: the next change is a patch again, and nobody else was resent anything.
  dm.say({ t: "act", action: { type: "rest" } });
  assert.equal(fulls(), 2);
  assert.ok(player.raw.at(-1).patch);
  assert.deepEqual(player.receiver.state, expected(tables, code, player));
  assert.equal(dm.raw.filter((m) => m.t === "update" && m.state).length, 1);
});

test("sync is refused before approval and gives a player only their view", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  const waiting = client(tables);
  waiting.say({ t: "join", code, name: "Lee" });
  waiting.say({ t: "sync" });
  assert.equal(waiting.raw.some((m) => m.t === "update"), false);
  player.say({ t: "sync" });
  const full = player.raw.at(-1);
  assert.ok(full.state && !("rng" in full.state) && !("timeline" in full.state));
  assert.equal("maxHp" in full.state.entities.m1, false);
});

test("an ordinary move is a small message, and patches leak nothing a full view would not", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  const state = tables.get(code).state;
  player.say({ t: "act", action: { type: "claim", entity: "rogue" } });
  const fullSize = JSON.stringify(player.raw.find((m) => m.t === "update" && m.state)).length;

  player.say({ t: "act", action: { type: "move", actor: "rogue", to: freeHex(state, "rogue") } });
  const mine = JSON.stringify(player.raw.at(-1)), theirs = JSON.stringify(dm.raw.at(-1));
  assert.ok(player.raw.at(-1).patch);
  assert.ok(fullSize > 20000);
  assert.ok(mine.length < 1500, `a move cost the player ${mine.length} bytes`);
  assert.ok(theirs.length < 1500, `a move cost the DM ${theirs.length} bytes`);

  // A monster moves: the player's patch carries its public record only.
  dm.say({ t: "act", action: { type: "move", actor: "m1", to: freeHex(state, "m1") } });
  const patch = player.raw.at(-1).patch;
  assert.deepEqual(Object.keys(patch), ["entities"]);
  assert.deepEqual(Object.keys(patch.entities), ["m1"]);
  assert.equal("ac" in patch.entities.m1, false);
  for (const m of player.raw) assert.equal(JSON.stringify(m).includes('"rng"'), false);
  // The DM hides it: the player's patch says only that it is gone.
  dm.say({ t: "act", action: { type: "reveal", actor: "m1", hidden: true } });
  assert.deepEqual(player.raw.at(-1).patch, { entities: { m1: null } });
  assert.deepEqual(player.raw.at(-1).events, []);
});

test("the server upgrades tables saved by the previous version when it loads them", () => {
  const saved = JSON.parse(readFileSync(new URL("../../rules/test/fixtures/table-v1.json", import.meta.url), "utf8"));
  saved.members = [{ id: "u1", token: "dm-token", name: "Dana", role: "dm", approved: true }];
  const tables = createTables({ load: () => [saved] });
  const state = tables.get("FIXTR1").state;
  assert.equal(state.version, VERSION);
  assert.deepEqual(state.entities.rogue.cond, { unconscious: {}, prone: {} });
  const dm = client(tables);
  dm.say({ t: "resume", code: "FIXTR1", token: "dm-token" });
  assert.equal(dm.last("update").state.encounter.round, 2);
  dm.say({ t: "act", action: { type: "endTurn", actor: "wizard" } });
  assert.equal(dm.last("update").events.at(-1).type, "turn");
});

test("action size cap: players and the DM are held to 4 KB, except the DM's map actions", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player } = seated(tables);
  const TOO_BIG = { t: "error", error: "That action is too large." };
  const chronicle = (n) => ({ t: "act", action: { type: "chronicle", title: "x", text: "y".repeat(n) } });
  const fits = MAX_ACTION_BYTES - JSON.stringify({ type: "chronicle", title: "x", text: "" }).length;

  // Just inside the cap is accepted; one byte more is refused, for the DM and for a player alike.
  dm.say(chronicle(fits));
  assert.equal(dm.got.at(-1).t, "update");
  dm.say(chronicle(fits + 1));
  assert.deepEqual(dm.got.at(-1), TOO_BIG);
  player.say(chronicle(fits + 1));
  assert.deepEqual(player.got.at(-1), TOO_BIG);
  dm.say(chronicle(70_000));
  assert.deepEqual(dm.got.at(-1), TOO_BIG);

  // A map document is well over 4 KB. The DM may send one; a player may not, and nothing changes.
  const map = structuredClone(dm.last("update").state.map), tile = Object.values(map.levels[0].tiles)[0];
  for (let q = -40; q < 40; q++) for (let r = -40; r < 40; r++) map.levels[0].tiles[`${q},${r}`] ??= { ...tile };
  const size = JSON.stringify({ type: "loadMap", map }).length;
  assert.ok(size > 300_000 && size < MAX_MAP_ACTION_BYTES);
  const seq = tables.get(dm.last("welcome").code).seq;
  player.say({ t: "act", action: { type: "loadMap", map } });
  assert.deepEqual(player.got.at(-1), TOO_BIG);
  player.say({ t: "act", action: { type: "mapEdit", ops: [{ op: "x", pad: "z".repeat(5000) }] } });
  assert.deepEqual(player.got.at(-1), TOO_BIG);
  assert.equal(tables.get(dm.last("welcome").code).seq, seq);
  dm.say({ t: "act", action: { type: "loadMap", map } });
  assert.equal(dm.got.at(-1).t, "update");
  assert.equal(Object.keys(tables.get(dm.last("welcome").code).state.map.levels[0].tiles).length, Object.keys(map.levels[0].tiles).length);

  // Even the DM's map actions have a ceiling.
  dm.say({ t: "act", action: { type: "mapEdit", ops: [{ op: "x", pad: "z".repeat(MAX_MAP_ACTION_BYTES) }] } });
  assert.deepEqual(dm.got.at(-1), TOO_BIG);
});

test("export: the DM gets the whole table, a player is refused, and no member or token is in it", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  dm.say({ t: "act", action: { type: "chronicle", title: "Before the backup" } });

  dm.say({ t: "export" });
  const reply = dm.last("export");
  assert.deepEqual(Object.keys(reply.table).sort(), ["assetLimit", "assets", "assetsSkipped", "code", "exportedAt", "state"]);
  assert.deepEqual(reply.table.assets, []);
  assert.equal(reply.table.code, code);
  assert.ok(Math.abs(Date.parse(reply.table.exportedAt) - Date.now()) < 5000);
  // The real state, not a view: it has the dice seed and the timeline that views leave out.
  assert.deepEqual(reply.table.state, JSON.parse(JSON.stringify(tables.get(code).state)));
  assert.ok(reply.table.state.timeline.some((e) => e.title === "Before the backup"));

  // No key called token or members anywhere, and none of the members' tokens as a value.
  const json = JSON.stringify(reply);
  const keys = [];
  JSON.parse(json, function (k) { keys.push(k); return this[k]; });
  assert.ok(!keys.includes("token") && !keys.includes("members"));
  for (const m of tables.get(code).members) assert.ok(!json.includes(m.token), "a member's token leaked");

  // A player cannot have it, whether approved or still waiting.
  player.say({ t: "export" });
  assert.equal(player.last("export"), undefined);
  assert.deepEqual(player.got.at(-1), { t: "error", error: "Only the DM can export the table." });
  const waiting = client(tables);
  waiting.say({ t: "join", code, name: "Wes" });
  waiting.say({ t: "export" });
  assert.equal(waiting.last("export"), undefined);
  assert.equal(waiting.got.at(-1).t, "error");
  assert.ok(!JSON.stringify(player.raw).includes('"t":"export"'));
  // Not seated at all.
  const stranger = client(tables);
  stranger.say({ t: "export" });
  assert.deepEqual(stranger.got, [{ t: "error", error: "Join a table first." }]);
});

// ---------- the DM's undo ----------

// What a member's client holds now, without the timeline.
const known = (c) => JSON.stringify(c.receiver.state);

test("undo: the DM takes back a move and both DM and player return to before; redo puts it back", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  const state = tables.get(code).state;
  player.say({ t: "act", action: { type: "claim", entity: "rogue" } });   // not undoable
  assert.deepEqual(dm.last("undoable"), { t: "undoable", undo: [], redo: [] });
  const dmBefore = known(dm), playerBefore = known(player), whole = JSON.stringify(state);

  player.say({ t: "act", action: { type: "move", actor: "rogue", to: freeHex(state, "rogue") } });
  assert.deepEqual(dm.last("undoable").undo, ["Pip moved"]);
  assert.notEqual(known(player), playerBefore);

  dm.say({ t: "undo" });
  assert.equal(JSON.stringify(state), whole, "the table's state is exactly as before, seed and all");
  assert.equal(known(dm), dmBefore);
  assert.equal(known(player), playerBefore);
  assert.deepEqual(dm.last("update").events, [{ type: "undone", label: "Pip moved" }]);
  assert.deepEqual(player.last("update").events, [{ type: "undone", label: "Pip moved" }]);
  assert.ok(player.raw.findLast((m) => m.t === "update").state, "a whole view, not a patch");
  assert.deepEqual(dm.last("undoable"), { t: "undoable", undo: [], redo: ["Pip moved"] });
  assert.equal(player.count("undoable"), 0, "players are never sent the history");
  assert.equal(state.entities.rogue.owner, player.last("welcome").userId, "the seat is not taken back");

  dm.say({ t: "redo" });
  assert.equal(dm.last("update").events[0].type, "redone");
  assert.notEqual(known(player), playerBefore);
  // Patches after an undo still add up to the right view.
  dm.say({ t: "act", action: { type: "advanceTime", minutes: 10 } });
  assert.equal(known(player), JSON.stringify(expected(tables, code, player)));
  assert.equal(known(dm), JSON.stringify(expected(tables, code, dm)));
  assert.deepEqual(dm.last("undoable").redo, []);
});

test("undo: a player is refused, and nothing to undo is an error", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  dm.say({ t: "undo" });
  assert.equal(dm.last("error").error, "Nothing to undo.");
  dm.say({ t: "act", action: { type: "advanceTime", minutes: 10 } });
  const clock = tables.get(code).state.clock, updates = player.count("update");
  player.say({ t: "undo" });
  assert.equal(player.last("error").error, "Only the DM can undo.");
  player.say({ t: "redo" });
  assert.equal(player.last("error").error, "Only the DM can redo.");
  assert.equal(tables.get(code).state.clock, clock);
  assert.equal(player.count("update"), updates);
  const stranger = client(tables);
  stranger.say({ t: "undo" });
  assert.equal(stranger.last("error").error, "Join a table first.");
});

test("undo: a hidden monster's spawn, taken back, reaches no player in any form", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  const state = tables.get(code).state;
  const spot = H.range({ q: 0, r: 0 }, 4).find((h) => state.map.levels[0].tiles[H.key(h)]?.t === "grass" && !Object.values(state.entities).some((e) => H.key(e.pos) === H.key(h)));
  dm.say({ t: "act", action: { type: "spawn", monster: "wolf", at: spot, hidden: true, name: "Greyjaw" } });
  const id = dm.last("update").events[0].id;
  assert.deepEqual(dm.last("undoable").undo, ["Greyjaw was added"]);
  const n = player.raw.length;
  dm.say({ t: "undo" });
  dm.say({ t: "redo" });
  dm.say({ t: "undo" });
  assert.equal(id in state.entities, false);
  const sent = player.raw.slice(n);
  assert.equal(sent.length, 3);
  for (const m of sent) {
    const text = JSON.stringify(m);
    assert.equal(text.includes(id) || text.includes("Greyjaw"), false, `leaked: ${text}`);
    assert.deepEqual(m.events, [], "players are not told of a step they never saw");
  }
  assert.ok(dm.last("update").events[0].label.includes("Greyjaw"));
});

test("undo: a region the player never saw stays unseen through undo and redo", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  const state = tables.get(code).state;
  // A room far from the party, not revealed. Paint it, then make it a region.
  const far = H.range({ q: 0, r: 0 }, 1).map((h) => ({ q: h.q + 10, r: h.r - 10 }));
  dm.say({ t: "act", action: { type: "mapEdit", ops: [
    ...far.map((at) => ({ op: "tile", level: "ground", at, tile: { t: "stone" } })),
    { op: "region", region: { id: "crypt", name: "The crypt", level: "ground", hexes: far.map(H.col) } },
  ] } });
  assert.ok(state.map.regions.some((r) => r.id === "crypt" && !r.revealed), dm.last("error")?.error);
  const n = player.raw.length;
  dm.say({ t: "act", action: { type: "advanceTime", minutes: 10 } });
  dm.say({ t: "undo" });
  dm.say({ t: "undo" });                                                // the room itself
  dm.say({ t: "redo" });
  for (const m of player.raw.slice(n)) assert.equal(JSON.stringify(m).includes("crypt"), false, "the room is never named to the player");
  assert.equal(known(player), JSON.stringify(expected(tables, code, player)));

  // Shown, then taken back: the player is told what they saw undone, and the room leaves their view.
  dm.say({ t: "act", action: { type: "revealRegion", region: "crypt" } });
  assert.ok(known(player).includes("crypt"));
  dm.say({ t: "undo" });
  assert.deepEqual(player.last("update").events, [{ type: "undone", label: "The crypt was revealed" }]);
  assert.equal(known(player).includes("crypt"), false);
  assert.equal(known(player), JSON.stringify(expected(tables, code, player)));
});

test("undo: taking back a move that revealed a hidden creature hides it from the player again", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  const state = tables.get(code).state;
  dm.say({ t: "act", action: { type: "setting", key: "autoEngage", value: false } });
  player.say({ t: "act", action: { type: "claim", entity: "rogue" } });
  const pip = state.entities.rogue;
  const spot = H.range(pip.pos, 5).find((h) => H.dist(h, pip.pos) === 5 && state.map.levels[0].tiles[H.key(h)]?.t === "grass" && !Object.values(state.entities).some((e) => H.key(e.pos) === H.key(h)));
  dm.say({ t: "act", action: { type: "spawn", monster: "wolf", at: spot, hidden: true, name: "Greyjaw" } });
  const id = dm.last("update").events[0].id;
  const steps = [...moveOptions(state, pip)].filter(([k, v]) => v.canStop && H.dist(H.parse(k), spot) === 2).sort((a, b) => a[1].cost - b[1].cost);
  player.say({ t: "act", action: { type: "move", actor: "rogue", to: H.parse(steps[0][0]) } });
  assert.ok(id in player.receiver.state.entities, "the move revealed it");

  const n = player.raw.length;
  dm.say({ t: "undo" });
  assert.equal(state.entities[id].hidden, true);
  assert.equal(id in player.receiver.state.entities, false, "hidden again");
  assert.deepEqual(player.last("update").events, [{ type: "undone", label: "Pip moved" }]);
  assert.equal(player.raw.slice(n).some((m) => JSON.stringify(m).includes("Greyjaw")), false);
  assert.equal(known(player), JSON.stringify(expected(tables, code, player)));
  // The table's record no longer says it was seen.
  player.say({ t: "history", limit: 200 });
  assert.equal(JSON.stringify(player.last("history")).includes(id), false);
});

test("undo: the history is not saved with the table", () => {
  const saved = [];
  const tables = createTables({ seed: () => 5, save: (t) => saved.push(JSON.stringify(t)) });
  const { dm } = seated(tables);
  dm.say({ t: "act", action: { type: "advanceTime", minutes: 10 } });
  dm.say({ t: "undo" });
  assert.equal(saved.some((x) => x.includes("minutes passed")), false);
});

test("tables idle for 30 days do not count against the cap, and are kept", () => {
  let t = 1e12;
  const tables = createTables({ seed: () => 1, now: () => t });
  const old = client(tables), busy = client(tables);
  old.say({ t: "host", name: "Old" });
  busy.say({ t: "host", name: "Busy" });
  const oldWelcome = old.last("welcome"), busyCode = busy.last("welcome").code;
  old.session.disconnect();
  t += IDLE_MS - 1000;
  busy.session.disconnect();
  t += 2000;                                             // "Old" is now past 30 days, "Busy" is not
  assert.equal(tables.size(), 2);
  assert.equal(tables.activeSize(), 1);
  for (let i = 0; i < MAX_TABLES - 1; i++) client(tables).say({ t: "host", name: "D" + i });
  assert.equal(tables.activeSize(), MAX_TABLES);         // full again: Busy plus 499 new ones
  const refused = client(tables);
  refused.say({ t: "host", name: "Late" });
  assert.equal(refused.last("error")?.expired, true);
  assert.equal(tables.size(), MAX_TABLES + 1);           // the idle table was kept, not deleted
  const back = client(tables);                           // its DM can still come back, and it counts again
  back.say({ t: "resume", code: oldWelcome.code, token: oldWelcome.token });
  assert.equal(back.last("welcome")?.role, "dm");
  assert.equal(tables.activeSize(), MAX_TABLES + 1);
  assert.ok(tables.get(busyCode));
});

test("saved tables without an activity stamp start the idle clock at load", () => {
  let t = 1e12;
  const saved = createTables({ seed: () => 1, now: () => t });
  const dm = client(saved);
  dm.say({ t: "host", name: "Dana" });
  const rec = structuredClone(saved.get(dm.last("welcome").code));
  delete rec.active;
  const tables = createTables({ load: () => [rec], now: () => t });
  assert.equal(tables.activeSize(), 1);
  t += IDLE_MS + 1;
  assert.equal(tables.activeSize(), 0);
  assert.equal(tables.size(), 1);
});

// ---------- the undo history survives a restart ----------
// A fake disk: the table file and the history file, as index.js keeps them side by side.
function disk() {
  const tablesOnDisk = new Map(), histories = new Map();
  const flush = (tables, code) => {
    tablesOnDisk.set(code, JSON.stringify(tables.get(code)));
    const h = tables.exportHistory(code);
    if (h) histories.set(code, JSON.stringify(h));
  };
  const open = (opts = {}) => createTables({
    seed: () => 5,
    load: () => [...tablesOnDisk.values()].map((s) => JSON.parse(s)),
    loadHistory: (code) => (histories.has(code) ? JSON.parse(histories.get(code)) : null),
    ...opts,
  });
  return { tablesOnDisk, histories, flush, open };
}
const sitDM = (tables, code, dmToken) => { const c = client(tables); c.say({ t: "resume", code, token: dmToken }); return c; };

test("the undo history is saved, loaded with the table, and undo works after a restart", () => {
  const d = disk();
  const first = d.open();
  const { dm, player, code } = seated(first);
  const to = freeHex(first.get(code).state, "rogue");
  dm.say({ t: "act", action: { type: "claim", entity: "rogue", user: player.last("welcome").userId, userName: "Pat" } });
  const before = JSON.stringify(first.get(code).state);
  player.say({ t: "act", action: { type: "move", actor: "rogue", to } });
  dm.say({ t: "act", action: { type: "chronicle", title: "Pip crossed" } });
  assert.deepEqual(dm.last("undoable").undo, ["Chronicle: Pip crossed", "Pip moved"]);
  d.flush(first, code);
  assert.equal(first.exportHistory(code), null, "nothing new to write the second time");

  const second = d.open();
  const dm2 = sitDM(second, code, dm.last("welcome").token);
  assert.deepEqual(dm2.last("undoable").undo, ["Chronicle: Pip crossed", "Pip moved"]);
  dm2.say({ t: "undo" }); dm2.say({ t: "undo" });
  assert.equal(JSON.stringify(second.get(code).state), before, "two undos give back exactly the saved game");
  dm2.say({ t: "redo" });
  assert.deepEqual(dm2.last("undoable").redo, ["Chronicle: Pip crossed"]);
});

test("the undo history is never sent to players or put in an export", () => {
  const d = disk();
  const tables = d.open();
  const { dm, player, code } = seated(tables);
  dm.say({ t: "act", action: { type: "chronicle", title: "Secret plot" } });
  d.flush(tables, code);
  const pl = sitDM(tables, code, player.last("welcome").token);
  assert.equal(pl.count("undoable"), 0);
  assert.ok(!JSON.stringify(pl.raw).includes("ops"));
  dm.say({ t: "export" });
  assert.equal(dm.last("export").table.undos, undefined);
});

test("a history that belongs to another state, or is corrupted, is ignored and the table still loads", () => {
  for (const damage of [
    (h) => ({ ...h, seq: h.seq + 1 }),                          // saved for a different state
    (h) => ({ ...h, v: 2 }),
    (h) => ({ ...h, undos: "nope" }),
    (h) => ({ ...h, undos: [{ label: "x" }] }),                 // a step with no patch
    (h) => ({ ...h, undos: h.undos.map((s) => ({ ...s, ops: [{ p: ["__proto__", "x"], v: 1 }] })) }),
    () => 42,
  ]) {
    const d = disk();
    const first = d.open();
    const { dm, code } = seated(first);
    dm.say({ t: "act", action: { type: "chronicle", title: "Something" } });
    d.flush(first, code);
    d.histories.set(code, JSON.stringify(damage(JSON.parse(d.histories.get(code)))));
    const second = d.open();
    const dm2 = sitDM(second, code, dm.last("welcome").token);
    assert.equal(dm2.last("welcome").role, "dm");
    assert.deepEqual(dm2.last("undoable").undo, []);
    assert.ok(second.get(code).state.timeline.some((e) => e.title === "Something"));
    dm2.say({ t: "undo" });
    assert.equal(dm2.last("error").error, "Nothing to undo.");
  }
});

test("a loader that throws costs the history and nothing else", () => {
  const d = disk();
  const first = d.open();
  const { dm, code } = seated(first);
  d.flush(first, code);
  const second = d.open({ loadHistory: () => { throw new Error("disk"); } });
  assert.equal(sitDM(second, code, dm.last("welcome").token).last("welcome").role, "dm");
});

test("a restored history keeps the cap: older steps beyond the limit are dropped", async () => {
  const { createHistory, UNDO_LIMIT } = await import("../../rules/src/history.js");
  const step = (i) => ({ label: `s${i}`, shown: null, ops: [], tl: { at: 0, remove: 0, insert: [] } });
  const h = createHistory();
  assert.equal(h.restore({ v: 1, undos: Array.from({ length: UNDO_LIMIT + 10 }, (_, i) => step(i)), redos: [] }), true);
  assert.equal(h.list().length, UNDO_LIMIT);
  assert.equal(h.list()[0], `s${UNDO_LIMIT + 9}`);
});

// ---------- the timeline cap ----------
test("the table keeps every chronicle entry and the newest other entries; undo across the cap is exact", () => {
  const tables = createTables({ seed: () => 5, timelineCap: 6 });
  const { dm, code } = seated(tables);
  for (let i = 0; i < 30; i++) {
    dm.say({ t: "act", action: i % 8 === 0 ? { type: "chronicle", title: `Note ${i}` } : { type: "check", actor: "fighter", skill: "athletics" } });
  }
  const t = tables.get(code).state.timeline;
  assert.equal(t.filter((e) => e.type !== "chronicle").length, 6);
  assert.deepEqual(t.filter((e) => e.title?.startsWith("Note")).map((e) => e.title), ["Note 0", "Note 8", "Note 16", "Note 24"]);
  // The log a client asks for still has them.
  dm.say({ t: "history", types: ["chronicle"], limit: 200 });
  assert.ok(dm.last("history").entries.some((e) => e.title === "Note 0"));
  const snap = JSON.stringify(tables.get(code).state);
  dm.say({ t: "act", action: { type: "check", actor: "rogue", skill: "stealth" } });
  dm.say({ t: "undo" });
  assert.equal(JSON.stringify(tables.get(code).state), snap);
});

test("a table saved with a longer timeline is cut when loaded, and its old history is not used", () => {
  const d = disk();
  const first = d.open();
  const { dm, code } = seated(first);
  for (let i = 0; i < 12; i++) dm.say({ t: "act", action: { type: "check", actor: "fighter", skill: "athletics" } });
  d.flush(first, code);
  const second = d.open({ timelineCap: 5 });
  const state = second.get(code).state;
  assert.equal(state.timeline.filter((e) => e.type !== "chronicle").length, 5);
  const dm2 = sitDM(second, code, dm.last("welcome").token);
  assert.deepEqual(dm2.last("undoable").undo, []);
  dm2.say({ t: "act", action: { type: "check", actor: "fighter", skill: "athletics" } });
  dm2.say({ t: "undo" });
  assert.equal(dm2.last("undoable").undo.length, 0);
  // With the cap left alone the history loads as before.
  const third = d.open();
  assert.equal(sitDM(third, code, dm.last("welcome").token).last("undoable").undo.length, 12);
});

test("export carries the table's files as base64 with their records, within a size limit; players cannot have it", () => {
  const dir = mkdtempSync(join(tmpdir(), "hextable-export-"));
  try {
    const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
    const assets = createAssets({ dir });
    const tables = createTables({ seed: () => 5, exportAssets: (code, state) => assets.pack(code, { limit: PNG.length * 2 + 1 }) });
    const { dm, player, code } = seated(tables);
    const a = assets.put(code, PNG, { name: "map.png" }).record, b = assets.put(code, PNG, { name: "keep.png" }).record, c = assets.put(code, PNG, { name: "late.png" }).record;

    dm.say({ t: "export" });
    const table = dm.last("export").table;
    assert.equal(table.assetLimit, PNG.length * 2 + 1);
    assert.deepEqual(table.assets.map((x) => x.record.id), [a.id, b.id], "oldest first, up to the limit");
    for (const x of table.assets) assert.ok(Buffer.from(x.data, "base64").equals(PNG), "the bytes come back exactly");
    assert.deepEqual(table.assetsSkipped.map((r) => r.id), [c.id], "what did not fit is listed by record, without bytes");
    assert.ok(!("data" in table.assetsSkipped[0]));

    player.say({ t: "export" });
    assert.equal(player.last("export"), undefined);
    assert.deepEqual(player.got.at(-1), { t: "error", error: "Only the DM can export the table." });
    assert.ok(!JSON.stringify(player.raw).includes(PNG.toString("base64")), "no file bytes reached the player");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// Scenes over the wire. Whatever path a player's knowledge takes (the update patches, a whole view
// on joining mid-scene or after an undo, the record on joining or on asking, error messages, undo
// labels), it never holds a scene the DM has not opened, an NPC's notes, or anything said of either.
test("scenes: nothing the DM keeps back reaches a player by any message, joining mid-scene included", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  player.say({ t: "act", action: { type: "claim", entity: "rogue" } });
  const SECRETS = ["SECRET-TITLE-zq", "SECRET-NPC-zq", "NOTES-ONE-zq", "NOTES-TWO-zq", "GONE-NPC-zq"];
  const act = (c, action) => { const n = c.raw.length; c.say({ t: "act", action }); return c.raw.slice(n); };
  const errorOf = (c, action) => act(c, action).find((m) => m.t === "error")?.error;
  // Prepared, not open: a player is sent updates (the seq moves on) but nothing of the scene.
  act(dm, { type: "scene", scene: { title: "SECRET-TITLE-zq", open: false } });
  act(dm, { type: "sceneNpc", npc: { name: "GONE-NPC-zq" } });
  act(dm, { type: "sceneNpc", npc: { name: "SECRET-NPC-zq", notes: "NOTES-ONE-zq" } });
  act(dm, { type: "sceneNpc", npc: { id: "npc1" }, remove: true });
  assert.equal(player.last("update").state.scene, null);
  // Guessing: the same answers for the prepared NPC as for nothing at all.
  assert.equal(errorOf(player, { type: "say", as: "npc2", text: "x" }), errorOf(player, { type: "say", as: "npc9", text: "x" }));
  assert.equal(errorOf(player, { type: "sceneNpc", npc: { id: "npc2" }, remove: true }), errorOf(player, { type: "sceneNpc", npc: { id: "npc9" }, remove: true }));
  assert.equal(errorOf(player, { type: "endScene" }), "Only the DM can do that with a scene.");
  // The DM undoes and redoes a step of the preparation: players are told nothing of it.
  const before = player.raw.length;
  dm.say({ t: "undo" }); dm.say({ t: "redo" });
  for (const m of player.raw.slice(before)) assert.deepEqual(m.events, [], "an undo of a prepared step has no label for players");
  // Into the scene. The NPC's notes change while it is open, then are undone and redone.
  act(dm, { type: "scene", scene: { open: true } });
  assert.deepEqual(player.last("update").state.scene, { id: "sc1", title: "SECRET-TITLE-zq", present: [{ id: "npc1", name: "SECRET-NPC-zq" }], open: true });
  SECRETS.splice(0, 2);                      // the title and the NPC's name are now the players' to know
  act(dm, { type: "sceneNpc", npc: { id: "npc1", notes: "NOTES-TWO-zq" } });
  act(player, { type: "say", as: "rogue", text: "Who are you?" });
  act(dm, { type: "say", as: "npc1", text: "A friend." });
  dm.say({ t: "undo" });
  dm.say({ t: "redo" });
  assert.deepEqual(player.last("update").events.map((e) => e.type), ["redone"]);
  // A second player sits down in the middle of the scene: the whole view, then the record.
  const kim = client(tables);
  kim.say({ t: "join", code, name: "Kim" });
  dm.say({ t: "approve", userId: kim.last("welcome").userId, ok: true });
  assert.equal(kim.last("update").state.scene.title, "SECRET-TITLE-zq");
  const rec = kim.last("history").entries;
  assert.deepEqual(rec.filter((e) => e.type === "say").map((e) => [e.line, e.name, e.text]), [[1, "Rogue", "Who are you?"].map((x, i) => i === 1 ? player.last("update").state.entities.rogue.name : x), [2, "SECRET-NPC-zq", "A friend."]]);
  kim.say({ t: "history", types: ["sceneStart", "sceneNpc", "sceneEdit", "sceneEnd", "say"], limit: 200 });
  // Every player's every message, and what their client rebuilt from the patches, is clean; and
  // the rebuilt state is exactly the view the engine gives them.
  const dmState = dm.last("update").state;
  for (const p of [player, kim]) {
    const text = JSON.stringify([p.raw, p.got]);
    for (const x of SECRETS) assert.ok(!text.includes(x), `${x} reached a player`);
    assert.ok(!text.includes('"notes"') && !text.includes('"prep"') && !text.includes('"opened"'));
    assert.ok(!p.raw.some((m) => m.t === "undoable"), "the undo list is the DM's");
    const userId = p.last("welcome").userId;
    assert.deepEqual(p.last("update").state, JSON.parse(JSON.stringify(view(dmState, { role: "player", userId }))));
  }
  assert.ok(JSON.stringify(dm.raw).includes("NOTES-TWO-zq"), "the DM has the notes");
});

test("scenes: a player speaks only as their own character, and only so fast", () => {
  let t = 1_000_000;
  const tables = createTables({ seed: () => 5, now: () => t });
  const { dm, player } = seated(tables);
  player.say({ t: "act", action: { type: "claim", entity: "rogue" } });
  dm.say({ t: "act", action: { type: "scene", scene: { title: "Inn" } } });
  const say = (c, action) => { const n = c.raw.length; c.say({ t: "act", action: { type: "say", ...action } }); return c.raw.slice(n); };
  assert.match(say(player, { as: "fighter", text: "I am the fighter" }).find((m) => m.t === "error").error, /your own character/);
  // Out of character, signed with the name joined by, not one sent; control characters taken out.
  const ev = say(player, { as: null, text: "brb\u0007\u001b[31m", userName: "DM" }).find((m) => m.t === "update").events[0];
  assert.deepEqual([ev.name, ev.text, ev.from], ["Pat", "brb[31m", player.last("welcome").userId]);
  assert.match(say(player, { as: "rogue", text: "x".repeat(501) }).find((m) => m.t === "error").error, /at most 500/);
  // Every line sent counts, refused or not: three so far.
  for (let i = 3; i < MAX_SAYS_PER_MINUTE; i++) assert.ok(!say(player, { as: "rogue", text: `l${i}` }).some((m) => m.t === "error"));
  assert.match(say(player, { as: "rogue", text: "one too many" }).find((m) => m.t === "error").error, /too fast/);
  assert.ok(!say(dm, { as: null, text: "the DM is counted apart" }).some((m) => m.t === "error"));
  t += 61_000;
  assert.ok(!say(player, { as: "rogue", text: "a minute later" }).some((m) => m.t === "error"));
});

test("standing instructions for reactions go to their player and the DM, and to no other player", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player: pat, code } = seated(tables);
  const kim = client(tables);
  kim.say({ t: "join", code, name: "Kim" });
  dm.say({ t: "approve", userId: kim.last("welcome").userId, ok: true });
  pat.say({ t: "act", action: { type: "claim", entity: "rogue" } });
  kim.say({ t: "act", action: { type: "claim", entity: "fighter" } });
  const kimRaw = kim.raw.length;
  pat.say({ t: "act", action: { type: "reactions", actor: "rogue", set: { "opportunity-attack": "ask" } } });
  assert.deepEqual(pat.last("update").state.reactions, { rogue: { "opportunity-attack": "ask" } });
  assert.equal(dm.last("update").state.entities.rogue.reactions["opportunity-attack"], "ask");
  assert.ok(!JSON.stringify(kim.raw.slice(kimRaw)).includes('"opportunity-attack":"ask"'), "nothing of it reaches Kim");
  assert.deepEqual(kim.last("update")?.state.reactions ?? kim.receiver.state.reactions, {});
  // Kim cannot set them for Pat's rogue.
  kim.say({ t: "act", action: { type: "reactions", actor: "rogue", set: { "opportunity-attack": "never" } } });
  assert.match(kim.last("error").error, /isn't yours/);
  // A fresh full view (a reconnect) carries them too, for Pat alone.
  pat.say({ t: "sync" }); kim.say({ t: "sync" });
  assert.deepEqual(pat.receiver.state.reactions, { rogue: { "opportunity-attack": "ask" } });
  assert.deepEqual(kim.receiver.state.reactions, {});
  assert.equal(kim.receiver.state.entities.rogue.reactions, undefined);
});

test("a reaction question goes to the player asked and to the DM; other players learn only that the table waits", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player: pat, code } = seated(tables);
  const kim = client(tables);
  kim.say({ t: "join", code, name: "Kim" });
  dm.say({ t: "approve", userId: kim.last("welcome").userId, ok: true });
  pat.say({ t: "act", action: { type: "claim", entity: "rogue" } });
  kim.say({ t: "act", action: { type: "claim", entity: "fighter" } });
  const st = () => dm.receiver.state;
  // Pat's rogue stands beside a goblin and will be asked about its Opportunity Attack.
  const m = Object.values(st().entities).find((e) => e.side !== "party" && !e.dead);
  const beside = H.neighbors(m.pos).find((h) => { dm.say({ t: "act", action: { type: "place", actor: "rogue", to: h } }); return H.dist(st().entities.rogue.pos, m.pos) === 1; });
  assert.ok(beside, "the rogue was put beside it");
  pat.say({ t: "act", action: { type: "reactions", actor: "rogue", set: { "opportunity-attack": "ask" } } });
  dm.say({ t: "act", action: { type: "startEncounter", center: m.pos } });
  for (let i = 0; i < 30 && current(st()) !== m.id; i++) dm.say({ t: "act", action: { type: "endTurn", actor: current(st()) } });
  assert.equal(current(st()), m.id);
  const away = [...moveOptions(st(), st().entities[m.id])].map(([k, v]) => ({ h: H.parse(k), v })).find(({ h, v }) => v.canStop && H.dist(h, st().entities.rogue.pos) >= 3);
  const kimRaw = kim.raw.length;
  dm.say({ t: "act", action: { type: "move", actor: m.id, to: away.h } });
  // The DM has the whole record; Pat the question; Kim only that the table waits.
  assert.equal(dm.last("update").state.pending.ask.reactor, "rogue");
  const q = pat.receiver.state.prompt;
  assert.deepEqual([q.reactor, q.trigger, q.by, q.options[0].reaction], ["rogue", "leave", m.id, "opportunity-attack"]);
  assert.ok(pat.last("update").events.some((e) => e.type === "reactionAsked"));
  assert.deepEqual(kim.receiver.state.prompt, { waiting: true });
  const toKim = JSON.stringify(kim.raw.slice(kimRaw));
  assert.ok(!toKim.includes("rogue") && !toKim.includes("leave") && !toKim.includes("pending"), toKim);
  assert.equal(kim.receiver.state.pending, undefined);
  // Kim may not answer for Pat; while it waits the DM's AI and turn wait too.
  kim.say({ t: "act", action: { type: "react", prompt: q.n, take: null } });
  assert.match(kim.last("error").error, /isn't yours/);
  assert.equal(aiStep(dm.receiver.state, m.id), null);
  dm.say({ t: "act", action: { type: "endTurn", actor: m.id } });
  assert.match(dm.last("error").error, /waiting/);
  // Pat answers; everyone's view goes back to no question, and the views match the engine's.
  pat.say({ t: "act", action: { type: "react", prompt: q.n, take: "opportunity-attack" } });
  assert.ok(pat.last("update").events.some((e) => e.type === "attack" && e.actor === "rogue"));
  for (const c of [pat, kim]) assert.equal(c.receiver.state.prompt, null);
  assert.equal(dm.last("update").state.pending, undefined);
  for (const c of [pat, kim]) {
    const userId = c.last("welcome").userId;
    assert.deepEqual(c.receiver.state, JSON.parse(JSON.stringify(view(dm.last("update").state, { role: "player", userId }))));
  }
  // The undo list names the waiting step; the label a player gets for the answer names nobody asked.
  dm.say({ t: "undo" });
  assert.ok(dm.receiver.state.pending, "undoing the answer puts the question back");
  const told = kim.last("update").events[0];
  assert.ok(told && told.type === "undone" && !/Rogue|rogue/.test(told.label) && !told.label.includes(st().entities.rogue.name), told?.label);
});
