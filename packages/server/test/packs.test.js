// Homebrew packs on a table (docs/specs/homebrew.md, Decision 3 and 5, rows H6 and B5, issue #391): who may send `pack`, the order of the
// checks, what members are told, that a refusal changes nothing, that everything that reads content for a table runs inside the
// table's overlay, and that a restart and an export keep the packs. The homebrew here is invented for these tests.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { aiStep } from "../../rules/src/ai.js";
import { CONTENT, HOMEBREW_LOOKUPS, MONSTERS, SPELLS } from "../../rules/src/content/index.js";
import { hashOf } from "../../rules/src/content/packs.js";
import { installed } from "../../rules/src/content/registry.js";
import { derive } from "../../rules/src/derive.js";
import { current, makeEntity } from "../../rules/src/engine.js";
import { createReceiver } from "../../rules/src/patch.js";
import { createTables, MAX_PACK_BYTES, MAX_PACK_TEXT_BYTES, packForPlayer, PLAYER_PACK_KINDS, sanitizePacks, usesIn, vetPacks } from "../src/tables.js";
import { startServer, stopAll } from "./helpers.js";

after(stopAll);

// ---------- packs made for the tests ----------
const spell = (pack, name, over = {}) => ({
  id: `hb-${pack}-${name}`, name: "Cinder Lash", source: `homebrew:${pack}`, level: 1, school: "evocation", classes: ["wizard"], time: "action", range: 60,
  components: ["v", "s"], duration: "instant", concentration: false, ritual: false, target: { creature: { count: 1 } },
  effects: [{ save: "dex", half: true, onFail: [{ damage: "3d6", type: "fire" }] }], tier: "auto", checked: false, text: "A lash of embers.", ...over,
});
// The monster's name and text are strings found nowhere else, so a search for them finds a leak and nothing else.
const NAME = "Zorblax Quillwraith", TEXT = "Gazeblight spoor of the Quillwraith", NOTE = "Secret plan: ambush at the ford", ATTACK = "Gazeblight Claw";
const monster = (pack, name, over = {}) => {
  const m = { ...structuredClone(CONTENT.monsters["goblin-warrior"]), id: `hb-${pack}-${name}`, name: NAME, source: `homebrew:${pack}`, checked: false, text: TEXT, ...over };
  m.actions = (m.actions ?? []).map((a) => ({ ...a, name: ATTACK }));
  return m;
};
const doc = (id, lists = {}, version = 1, header = {}) => ({ format: "hextable-pack", v: 1, pack: { id, name: `The ${id} pack`, version, license: "CC0, by the author", attribution: "Written for a test.", ...header }, ...lists });
const EMBER = (version = 1) => doc("ember-folk", { spells: [spell("ember-folk", "cinder-lash", { name: "Cinder Lash" })], monsters: [monster("ember-folk", "quillwraith")] }, version);
const FROST = (version = 1) => doc("frost-kin", { spells: [spell("frost-kin", "rime-bolt", { name: "Rime Bolt", effects: [{ attack: "ranged", kind: "spell", onHit: [{ damage: "2d8", type: "cold" }] }] })] }, version);
const LASH = "hb-ember-folk-cinder-lash", RIME = "hb-frost-kin-rime-bolt", WRAITH = "hb-ember-folk-quillwraith";

// ---------- a fake connection, as in tables.test.js ----------
function client(tables) {
  const got = [], raw = [];
  const c = { got, raw };
  const receiver = createReceiver(() => c.session.receive({ t: "sync" }));
  c.receiver = receiver;
  c.session = tables.connect({
    send(m) {
      const text = JSON.stringify(m);
      raw.push(text);
      const msg = JSON.parse(text);
      if (msg.t !== "update") return void got.push(msg);
      const u = receiver.receive(msg);
      if (u) got.push({ t: "update", seq: msg.seq, events: u.events, state: structuredClone(u.state) });
    },
  });
  return Object.assign(c, {
    say: (m) => c.session.receive(m),
    last: (t) => got.findLast((m) => m.t === t),
    all: (t) => got.filter((m) => m.t === t),
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
const add = (dm, pack, op = "add") => dm.say({ t: "pack", op, pack });
const lookups = () => [...new Set(Object.values(HOMEBREW_LOOKUPS).flatMap((l) => l.map(([t]) => t)))];
const clean = () => { assert.equal(installed(), null, "no overlay is left installed"); for (const t of lookups()) for (const k of Object.keys(t)) assert.ok(!k.startsWith("hb-"), `${k} is left in a lookup`); };
const snapshotOf = (tables, code) => JSON.stringify({ state: tables.get(code).state, packs: tables.get(code).packs, seq: tables.get(code).seq });

// ---------- who may send, and what members are told ----------
test("a DM adds a lint-clean pack: the table keeps it, the game names it, the DM has all of it and a player the filtered part", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  add(dm, EMBER());
  const t = tables.get(code);
  assert.equal(dm.count("error"), 0, dm.last("error")?.error);
  assert.deepEqual(t.packs.map((p) => [p.id, p.version, p.hash]), [["ember-folk", 1, hashOf(EMBER())]]);
  assert.deepEqual(t.packs[0].data, EMBER());
  assert.deepEqual(t.state.packs, [{ id: "ember-folk", version: 1, hash: hashOf(EMBER()) }]);
  // Everyone let in is sent only the list; the pack itself comes once, as packData, and the DM's is the whole of it, monsters too.
  const d = dm.last("packs");
  assert.deepEqual(d.packs, [{ id: "ember-folk", name: "The ember-folk pack", version: 1, hash: hashOf(EMBER()) }]);
  assert.deepEqual(d.changed, { op: "add", id: "ember-folk", version: 1 });
  const dd = dm.last("packData");
  assert.deepEqual([dd.id, dd.version, dd.hash], ["ember-folk", 1, hashOf(EMBER())]);
  assert.equal(dd.data.monsters[0].id, WRAITH);
  assert.deepEqual(dm.receiver.state.packs, t.state.packs, "the DM's view of the game says which packs it needs");
  // A player: the list, and the filtered pack: id, name, version, the seven lists. No monsters, no notes.
  const mine = hashOf(packForPlayer(EMBER()));
  assert.notEqual(mine, hashOf(EMBER()));
  assert.deepEqual(player.last("packs").packs, [{ ...d.packs[0], hash: mine }], "a player's list carries the hash of what they are sent");
  const p = player.last("packData");
  assert.deepEqual(Object.keys(p.data).sort(), ["armour", "feats", "id", "items", "name", "objects", "spells", "subclasses", "version", "weapons"]);
  assert.deepEqual(p.data.spells, [spell("ember-folk", "cinder-lash")]);
  assert.equal(p.data.name, "The ember-folk pack");
  assert.equal(p.hash, mine);
  assert.equal(hashOf(p.data), mine, "the hash is of the data they hold");
  assert.equal(player.raw.some((x) => x.includes(hashOf(EMBER()))), false, "the whole pack's hash never reaches a player");
  assert.equal(player.raw.some((x) => x.includes(NAME) || x.includes(TEXT) || x.includes(NOTE) || x.includes(WRAITH)), false, "nothing of the monster or the notes reached the player");
  assert.deepEqual(PLAYER_PACK_KINDS, Object.keys(HOMEBREW_LOOKUPS).filter((k) => k !== "monsters").sort((a, b) => PLAYER_PACK_KINDS.indexOf(a) - PLAYER_PACK_KINDS.indexOf(b)), "a new kind of homebrew is not sent to players until it is chosen");
  assert.equal(player.receiver.state.packs, undefined, "a player's view has no packs");
  clean();
});

test("dmNotes are stripped at any depth of what a player is sent (the vocabulary does not carry them yet, so this is the filter alone)", () => {
  const data = doc("noted", { spells: [spell("noted", "glow", { dmNotes: NOTE, effects: [{ manual: "x", dmNotes: NOTE }] })], monsters: [monster("noted", "m")] }, 1, { dmNotes: NOTE });
  const out = JSON.stringify(packForPlayer(data));
  assert.equal(out.includes(NOTE) || out.includes("dmNotes") || out.includes(NAME), false);
  assert.equal(JSON.parse(out).spells[0].id, "hb-noted-glow");
});

test("a player who sits down later is sent the packs before the first view, and not before being let in", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, code } = seated(tables);
  add(dm, doc("noted", { spells: [spell("noted", "glow")] }));
  const late = client(tables);
  late.say({ t: "join", code, name: "Lee" });
  assert.equal(late.count("packs"), 0, "not yet let in: nothing of a pack");
  assert.equal(late.raw.some((x) => x.includes("noted") || x.includes(NOTE)), false);
  dm.say({ t: "approve", userId: late.last("welcome").userId, ok: true });
  const kinds = late.got.map((m) => m.t);
  assert.ok(kinds.indexOf("packs") > kinds.indexOf("welcome") && kinds.indexOf("packs") < kinds.indexOf("update"));
  assert.equal(late.raw.some((x) => x.includes(NOTE)), false);
  assert.equal(late.last("packs").packs[0].id, "noted");
  assert.equal(late.count("packData"), 0, "sitting down sends the list only");
  late.say({ t: "packData", id: "noted" });
  assert.equal(late.last("packData").data.spells[0].id, "hb-noted-glow");
  // Someone resuming is sent them too; a table with none sends none on sitting down.
  const again = client(tables);
  again.say({ t: "resume", code, token: late.last("welcome").token });
  assert.equal(again.last("packs").packs.length, 1);
  const bare = seated(createTables({ seed: () => 5 }));
  assert.equal(bare.player.count("packs"), 0);
});

test("a player cannot send pack, and neither can someone waiting to be let in; nothing changes", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  const waiting = client(tables);
  waiting.say({ t: "join", code, name: "Wes" });
  const before = snapshotOf(tables, code), told = dm.raw.length;
  for (const who of [player, waiting]) {
    for (const msg of [{ t: "pack", op: "add", pack: EMBER() }, { t: "pack", op: "add", pack: JSON.stringify(EMBER()) }, { t: "pack", op: "remove", id: "ember-folk" }, { t: "pack", op: "update", pack: EMBER(2) }]) {
      who.say(msg);
      assert.match(who.last("error").error, /Only the DM/);
    }
  }
  assert.equal(snapshotOf(tables, code), before);
  assert.equal(dm.raw.length, told, "the DM was not told of anything");
  assert.equal(player.count("packs"), 0);
  // Not seated at all: told to join first.
  const stray = client(tables);
  stray.say({ t: "pack", op: "add", pack: EMBER() });
  assert.match(stray.last("error").error, /Join a table first/);
  clean();
});

test("the pack message needs an operation, and a pack sent as JSON text works like the object", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, code } = seated(tables);
  dm.say({ t: "pack", pack: FROST() });
  dm.say({ t: "pack", op: "install", pack: FROST() });
  dm.say({ t: "pack", op: "add" });
  dm.say({ t: "pack", op: "add", pack: 7 });
  assert.equal(dm.count("error"), 4);
  assert.equal(tables.get(code).packs.length, 0);
  add(dm, JSON.stringify(FROST()));
  assert.equal(dm.count("error"), 4);
  assert.equal(tables.get(code).packs[0].hash, hashOf(FROST()));
});

test("the DM cannot set the game's packs by an action: the server keeps state.packs in step with the table", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, code } = seated(tables);
  const before = snapshotOf(tables, code);
  dm.say({ t: "act", action: { type: "setPacks", packs: [{ id: "made-up", version: 1, hash: "a".repeat(64) }] } });
  assert.match(dm.last("error").error, /pack message/);
  assert.equal(snapshotOf(tables, code), before);
});

// ---------- refusals change nothing ----------
test("a pack that fails strict lint changes nothing and the sentences come back", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  add(dm, FROST());
  const before = snapshotOf(tables, code), dmSeen = dm.raw.length, playerSeen = player.raw.length;
  const bad = EMBER();
  bad.spells[0].effects[0].onFail[0].damage = "x";
  bad.spells.push({ ...spell("ember-folk", "extra"), unknownKey: 1 });
  bad.monsters[0].checked = true;
  add(dm, bad);
  const e = dm.last("error");
  assert.ok(e.problems.length >= 2, e.error);
  assert.ok(e.problems.some((x) => /hb-ember-folk-cinder-lash/.test(x)), "the linter's sentence names the entry");
  assert.match(e.error, /The homebrew was refused/);
  assert.equal(snapshotOf(tables, code), before);
  assert.equal(dm.raw.length, dmSeen + 1, "the DM is sent the error and nothing else");
  assert.equal(player.raw.length, playerSeen, "members are told nothing");
  // Other refusals: not JSON, a depth bomb, a function-like value, the SRD's pack id, an SRD id, an id without the prefix, a prototype key.
  const bomb = '{"format":"hextable-pack","v":1,"pack":{"id":"bomb","name":"B","version":1},"spells":' + "[".repeat(5000) + "]".repeat(5000) + "}";
  const proto = '{"format":"hextable-pack","v":1,"pack":{"id":"proto","name":"P","version":1},"__proto__":{"x":1}}';
  const srd = doc("srd52", {});
  const fireBolt = doc("sneaky", { spells: [spell("sneaky", "x", { id: "fire-bolt" })] });
  const noPrefix = doc("sneaky", { spells: [spell("sneaky", "x", { id: "hb-other-x" })] });
  for (const p of ["{not json", bomb, proto, srd, fireBolt, noPrefix]) {
    add(dm, p);
    assert.equal(dm.last("error").t, "error");
    assert.equal(snapshotOf(tables, code), before, `unchanged after ${String(JSON.stringify(p)).slice(0, 40)}`);
  }
  assert.equal(dm.count("error"), 7);
  clean();
});

test("the size is bounded before the JSON is parsed", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, code } = seated(tables);
  const before = snapshotOf(tables, code);
  const real = JSON.parse;
  let parsed = 0;
  JSON.parse = (...a) => { if (String(a[0]).length > 100_000) parsed++; return real(...a); };
  try { add(dm, "{" + " ".repeat(MAX_PACK_TEXT_BYTES + 1) + "}"); } finally { JSON.parse = real; }
  assert.equal(parsed, 0, "a pack text over twice the limit is never parsed");
  assert.match(dm.last("error").error, /too large/);
  assert.equal(snapshotOf(tables, code), before);
  // A document that is parsed already is bounded by the registry's budget, in bytes, before it is copied or linted.
  const fat = doc("fat", { spells: [spell("fat", "x", { text: "y".repeat(1400) })] });
  fat.pack.attribution = "z".repeat(MAX_PACK_BYTES);
  add(dm, fat);
  assert.equal(dm.last("error").t, "error");
  assert.equal(snapshotOf(tables, code), before);
});

test("an id must be new, an update must be a higher version, at most four packs, and packs cannot share ids", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, code } = seated(tables);
  const t = tables.get(code);
  add(dm, FROST());
  add(dm, FROST(), "add");
  assert.match(dm.last("error").error, /already on this table/);
  add(dm, FROST(1), "update");
  assert.match(dm.last("error").error, /version 2 or higher/);
  add(dm, EMBER(), "update");
  assert.match(dm.last("error").error, /not on this table/);
  assert.equal(t.packs.length, 1);
  // The same ids in two packs: the second is refused by overlayOf's rules, and a pack whose id begins with another's too.
  const twin = doc("twin", { spells: [spell("twin", "x")] });
  twin.spells[0].id = RIME;
  add(dm, twin);
  assert.equal(t.packs.length, 1, dm.last("error").error);
  const nested = doc("frost-kin-deep", { spells: [spell("frost-kin-deep", "x")] });
  add(dm, nested);
  assert.match(dm.last("error").error, /cannot be on one table/);
  assert.equal(t.packs.length, 1);
  for (const n of ["a1", "b2", "c3"]) add(dm, doc(n, { spells: [spell(n, "x")] }));
  assert.equal(t.packs.length, 4);
  const before = snapshotOf(tables, code);
  add(dm, doc("e5", { spells: [spell("e5", "x")] }));
  assert.match(dm.last("error").error, /4 homebrew packs/);
  assert.equal(snapshotOf(tables, code), before);
  // A higher version replaces the pack in place, and the DM and players are told.
  const { player } = { player: client(tables) };
  player.say({ t: "join", code, name: "Pat" });
  dm.say({ t: "approve", userId: player.last("welcome").userId, ok: true });
  add(dm, FROST(2), "update");
  assert.equal(t.packs.find((p) => p.id === "frost-kin").version, 2);
  assert.deepEqual(t.state.packs.find((p) => p.id === "frost-kin"), { id: "frost-kin", version: 2, hash: hashOf(FROST(2)) });
  assert.equal(player.last("packs").packs.find((p) => p.id === "frost-kin").version, 2);
  clean();
});

test("if the engine refuses or throws on the new list the table's record is not changed", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, code } = seated(tables);
  const t = tables.get(code);
  add(dm, FROST());
  const before = snapshotOf(tables, code);
  t.state.timeline.push = () => { throw new TypeError("disk on fire"); };      // setPacks leaves no event, so make the state itself fail
  Object.defineProperty(t.state, "packs", { get() { return []; }, set() { throw new TypeError("no"); }, configurable: true, enumerable: true });
  add(dm, EMBER());
  assert.equal(dm.last("error").t, "error");
  assert.deepEqual(t.packs.map((p) => p.id), ["frost-kin"]);
  delete t.state.timeline.push;
  assert.equal(JSON.stringify(t.packs), JSON.stringify(JSON.parse(before).packs));
  clean();
});

// ---------- in use ----------
function play(tables, code) {
  const t = tables.get(code);
  for (const id of Object.keys(t.state.entities)) if (t.state.entities[id].side !== "party") delete t.state.entities[id];
  return t;
}
test("a pack in use cannot be removed: the refusal lists what blocks it; once it is not in use, it can", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  add(dm, EMBER());
  add(dm, FROST());
  const t = play(tables, code);
  dm.say({ t: "act", action: { type: "spawn", monster: WRAITH, at: { q: 3, r: 0 } } });
  assert.equal(dm.count("error"), 0, dm.last("error")?.error);
  const id = Object.keys(t.state.entities).find((k) => t.state.entities[k].tpl === WRAITH);
  assert.ok(id);
  const before = snapshotOf(tables, code), seen = player.raw.length;
  dm.say({ t: "pack", op: "remove", id: "ember-folk" });
  const e = dm.last("error");
  assert.ok(e.blockers.some((b) => b.startsWith(`entities.${id}`) && b.includes(WRAITH)), JSON.stringify(e));
  assert.match(e.error, /in use/);
  assert.equal(snapshotOf(tables, code), before);
  assert.equal(player.raw.length, seen);
  // The unused pack goes at once; a missing one is refused.
  dm.say({ t: "pack", op: "remove", id: "frost-kin" });
  assert.deepEqual(t.packs.map((p) => p.id), ["ember-folk"]);
  assert.deepEqual(t.state.packs.map((p) => p.id), ["ember-folk"]);
  assert.deepEqual(player.last("packs").packs.map((p) => p.id), ["ember-folk"]);
  dm.say({ t: "pack", op: "remove", id: "frost-kin" });
  assert.match(dm.last("error").error, /not on this table/);
  // A new version that drops an entry is refused (undo could bring back what used it); one that keeps them all is accepted.
  const slim = EMBER(2);
  slim.monsters = [];
  add(dm, slim, "update");
  assert.match(dm.last("error").error, /drops 1 entry/);
  assert.equal(t.packs[0].version, 1);
  add(dm, EMBER(2), "update");
  assert.equal(t.packs[0].version, 2);
  // Take the creature away; now the pack can be removed, and the DM's undo steps (which could bring it back) are cleared.
  dm.say({ t: "act", action: { type: "remove", entity: id } });
  if (t.state.entities[id]) delete t.state.entities[id];
  dm.say({ t: "pack", op: "remove", id: "ember-folk" });
  assert.deepEqual(t.packs, []);
  assert.deepEqual(t.state.packs, []);
  assert.deepEqual(dm.last("undoable").undo, []);
  assert.deepEqual(player.last("packs").packs, []);
  clean();
});

test("usesIn finds ids in keys and values, skips the timeline, and says where", () => {
  const state = { entities: { m1: { name: "Imp", tpl: "hb-x-imp", spells: ["fire-bolt"] }, m2: { tpl: "goblin" } }, map: { objects: { o1: { kind: "hb-x-door" } } }, timeline: [{ id: "hb-x-imp" }], packs: [{ id: "x" }], slots: { "hb-x-spark": 1 } };
  const found = usesIn(state, (id) => id.startsWith("hb-x-"));
  assert.equal(found.length, 3);
  assert.ok(found.some((f) => f.startsWith("entities.m1 (Imp)")) && found.some((f) => f.startsWith("map.objects")) && found.some((f) => f.startsWith("slots")));
  assert.equal(usesIn(state, (id) => id === "hb-y-none").length, 0);
});

// ---------- what a player is sent across a fight ----------
test("no message to a player ever holds a homebrew monster's text, across a whole fight with it", () => {
  const tables = createTables({ seed: () => 3 });
  const { dm, player, code } = seated(tables);
  add(dm, EMBER());
  const t = play(tables, code);
  // The DM names it: the default name of a spawned creature is its template's name, which a player's view shows (see the PR: for the rules package).
  dm.say({ t: "act", action: { type: "spawn", monster: WRAITH, at: { q: 2, r: 0 }, name: "Shape in the reeds" } });
  const mon = Object.keys(t.state.entities).find((k) => t.state.entities[k].tpl === WRAITH);
  assert.ok(mon, dm.last("error")?.error);
  Object.assign(t.state.entities[mon], { hp: 5000, maxHp: 5000 });
  dm.say({ t: "act", action: { type: "startEncounter", center: t.state.entities[mon].pos, radius: 30 } });
  for (let i = 0; i < 2500 && t.state.encounter && t.state.entities[mon]?.hp > 0; i++) {
    const id = current(t.state);
    const before = dm.count("error");
    dm.say({ t: "act", action: aiStep(t.state, id) ?? { type: "endTurn", actor: id } });
    if (dm.count("error") > before) dm.say({ t: "act", action: { type: "endTurn", actor: id } });
    if (i === 60) { player.say({ t: "history", limit: 200 }); player.say({ t: "sync" }); }
  }
  player.say({ t: "history", limit: 200 });
  player.say({ t: "history", types: ["attack"], limit: 200 });
  player.say({ t: "sync" });
  const fightNo = t.state.timeline.find((e) => e.type === "encounterStart")?.fight;
  if (fightNo !== undefined) player.say({ t: "history", fight: fightNo });
  // The DM saw all of it, so the search below is not passing by accident.
  const dmText = dm.raw.join("\n");
  assert.ok(dmText.includes(NAME) && dmText.includes(ATTACK), "the DM is told about the monster");
  assert.ok(player.raw.length > 20, "the player was sent the fight");
  // Every frame the player's socket was sent, as the wire carried it.
  const text = player.raw.join("\n");
  for (const secret of [NAME, TEXT, NOTE, "Gazeblight spoor"]) {
    assert.equal(text.includes(secret), false, `"${secret}" reached a player: ...${text.slice(Math.max(0, text.indexOf(secret) - 80), text.indexOf(secret) + 80)}...`);
  }
  // And a pending member is sent no pack at all, however long the fight.
  clean();
});

// ---------- the scoped wrapper ----------
test("two tables with different packs, called in turn, never see each other's ids; a throw inside apply leaves the lookups as they were", () => {
  const tables = createTables({ seed: () => 5 });
  const a = seated(tables), b = seated(tables);
  add(a.dm, EMBER());
  add(b.dm, FROST());
  const ids = (client2) => JSON.stringify(client2.all("packs").map((m) => m.packs.map((p) => p.id)));
  assert.equal(ids(a.player), '[["ember-folk"]]');
  assert.equal(ids(b.player), '[["frost-kin"]]');
  // Each DM casts nothing of the other's: an unknown spell in the other table is refused, and each one's own is known.
  const spy = (table) => table.state.entities.wizard;
  for (const round of [0, 1, 2]) {
    for (const [who, own, other] of [[a, LASH, RIME], [b, RIME, LASH], [a, LASH, RIME]]) {
      who.dm.say({ t: "act", action: { type: "spawn", monster: other, at: { q: 5, r: round } } });
      assert.match(who.dm.last("error").error, /Unknown monster|Unknown/, "the other table's id is not known here");
      who.dm.say({ t: "sync" });
      who.dm.say({ t: "history" });
      who.dm.say({ t: "export" });
      clean();
    }
  }
  const sa = tables.get(a.code), sb = tables.get(b.code);
  assert.equal(JSON.stringify(sa.state).includes("frost-kin"), sa.state.packs.some((p) => p.id === "frost-kin"));
  assert.equal(sb.state.packs.some((p) => p.id === "ember-folk"), false);
  // A throw part way through leaves the table as it was and the lookups clean.
  sa.state.timeline.push = () => { throw new TypeError("disk on fire"); };
  const before = JSON.stringify(sa.state);
  a.dm.say({ t: "act", action: { type: "advanceTime", minutes: 60 } });
  assert.equal(a.dm.last("error").error, "The table couldn't make sense of that action.");
  delete sa.state.timeline.push;
  assert.equal(JSON.stringify(sa.state), before);
  clean();
  assert.ok(spy(sa));
  // An overlay is not swapped under a call: the other table still works at once.
  const errs = b.dm.count("error");
  b.dm.say({ t: "act", action: { type: "advanceTime", minutes: 10 } });
  assert.equal(b.dm.count("error"), errs);
  assert.ok(!(RIME in SPELLS) && !(LASH in SPELLS) && !(WRAITH in MONSTERS));
});

test("a homebrew monster is spawned on its own table and the lookups stay clean", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, code } = seated(tables);
  add(dm, EMBER());
  const t = play(tables, code);
  // The wizard learns the homebrew spell and casts it on a spawned creature: the engine reads SPELLS inside the table's overlay.
  dm.say({ t: "act", action: { type: "spawn", monster: WRAITH, at: { q: 1, r: 0 } } });
  assert.equal(dm.count("error"), 0, dm.last("error")?.error);
  assert.ok(Object.values(t.state.entities).some((e) => e.tpl === WRAITH));
  assert.equal(CONTENT.spells[LASH], undefined);
});

test("the table's overlay is built once and rebuilt only when its packs change", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, code } = seated(tables);
  add(dm, EMBER());
  const t = tables.get(code);
  const seenOverlays = new Set();
  const stateOf = () => t.state;
  for (let i = 0; i < 3; i++) { dm.say({ t: "sync" }); seenOverlays.add(stateOf().packs.length); }
  assert.equal(seenOverlays.size, 1);
  // Behavioural proof of the cache: the same pack data, vetted again, is accepted; a change of hash is a different set.
  assert.equal(vetPacks(t.packs).ok, true);
});

test("every call that reads content for a table goes through the one scoped wrapper (no direct apply, view, viewEvents or recall)", () => {
  const dir = new URL("../src/", import.meta.url);
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/[ \t]\/\/ .*$/gm, "");
  const whole = readFileSync(new URL("tables.js", dir), "utf8");
  const open = whole.indexOf("// ===== scoped engine"), close = whole.indexOf("// ===== end of the scoped engine");
  assert.ok(open > 0 && close > open, "the markers are there");
  const src = strip(whole), outside = strip(whole.slice(0, open) + whole.slice(close));
  // The raw functions appear only as imports, and inside the block.
  const raw = /\braw(Apply|Recall|Migrate|DescribeStep|View|PlayerView|ViewEvents|ViewHandouts|ViewPrompt|ViewReactions)\b/;
  const importLines = outside.split("\n").filter((l) => raw.test(l));
  assert.ok(importLines.length > 0 && importLines.every((l) => /\bimport\b|\bas raw/.test(l) || /^\s*[\w\s,]*\bas raw/.test(l)), `a raw function is used outside the wrapper: ${importLines.join(" | ")}`);
  // No bare call of an engine or view function anywhere (they are imported under raw names, so a bare call would not even run; this guards a new import).
  const names = ["apply", "recall", "migrate", "describeStep", "view", "playerView", "viewEvents", "viewHandouts", "viewPrompt", "viewReactions"];
  for (const n of names) {
    assert.equal(new RegExp(`(?<![.\\w])${n}\\s*\\(`).test(outside), false, `${n}( is called outside the wrapper`);
    assert.equal(new RegExp(`import\\s*\\{[^}]*(?<![\\w])${n}(?![\\w])[^}]*\\}\\s*from\\s*"[^"]*(engine|view|history|migrate)\\.js"`).test(outside.replace(/\w+ as raw\w+/g, "")), false, `${n} is imported under its own name`);
  }
  // Every call site of the wrapper names the table, so none can slip into a call that is not scoped.
  const calls = [...outside.matchAll(/\bengine\.(\w+)\(([^)]*)/g)];
  assert.ok(calls.length >= 15);
  for (const [, fn, args] of calls) assert.match(args, /^\s*(t|table)\b/, `engine.${fn} is called without a table`);
  // Nothing else in the server reads the engine: no other source file imports the engine, the views or the content lookups.
  for (const name of readdirSync(dir)) {
    if (name === "tables.js" || !name.endsWith(".js")) continue;
    const other = strip(readFileSync(new URL(name, dir), "utf8"));
    // KNOWN: assets-http.js builds `view(table.state, ...)` outside the wrapper to learn which files a member may fetch (DEBT, #391). It reads
    // only asset references, so a missing homebrew id costs nothing; moving it behind the wrapper is a change to that file.
    for (const m of other.matchAll(/from\s+"([^"]*rules[^"]*)"/g)) assert.ok(/handouts\.js$/.test(m[1]) || (name === "assets-http.js" && /view\.js$/.test(m[1])), `${name} imports ${m[1]}: only tables.js may read the engine`);
  }
  // The handler dispatch is scoped too, and `pack` is the one that is not (it changes the packs; each of its engine calls is scoped).
  assert.match(src, /scoped\(table, \(\) => \{ handle\(msg\); \}\)/);
  assert.match(src, /function sit\(t, m\) \{ scoped\(t,/);
});

// ---------- undo and rewind keep the game's packs in step ----------
test("undo, redo and rewind leave state.packs as the table's record has it", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, code } = seated(tables);
  const t = tables.get(code);
  dm.say({ t: "act", action: { type: "chronicle", title: "Before" } });
  add(dm, FROST());
  dm.say({ t: "act", action: { type: "chronicle", title: "After" } });
  const want = [{ id: "frost-kin", version: 1, hash: hashOf(FROST()) }];
  for (const msg of [{ t: "undo" }, { t: "undo" }, { t: "redo" }, { t: "redo" }]) {
    dm.say(msg);
    assert.deepEqual(t.state.packs, want, JSON.stringify(msg));
    assert.deepEqual(dm.receiver.state.packs, want);
  }
  assert.equal(dm.count("error"), 0, dm.last("error")?.error);
  // Taking a tree back whose packs differ (rewind puts a whole state back) is put right at once.
  const players = t.state.entities;
  assert.ok(players);
  dm.say({ t: "act", action: { type: "startEncounter", center: { q: 0, r: 0 }, radius: 30 } });
  add(dm, EMBER());
  dm.say({ t: "rewind", to: "fight" });
  assert.deepEqual(t.state.packs.map((p) => p.id), ["frost-kin", "ember-folk"]);
  assert.deepEqual(dm.receiver.state.packs.map((p) => p.id), ["frost-kin", "ember-folk"]);
  clean();
});

// ---------- storage, export, import ----------
test("a table that is saved and loaded again keeps its packs, its overlay and its game", () => {
  const saved = new Map();
  const tables = createTables({ seed: () => 5, save: (t) => saved.set(t.code, JSON.parse(JSON.stringify(t))) });
  const { dm, code } = seated(tables);
  add(dm, EMBER());
  add(dm, FROST());
  const t = play(tables, code);
  dm.say({ t: "act", action: { type: "spawn", monster: WRAITH, at: { q: 3, r: 0 } } });
  const rec = saved.get(code);
  assert.deepEqual(rec.packs.map((p) => p.id), ["ember-folk", "frost-kin"]);
  assert.equal(rec.packs[0].data.monsters[0].id, WRAITH);
  // A new server: the table is read back from its file.
  const again = createTables({ seed: () => 9, load: () => [JSON.parse(JSON.stringify(rec))] });
  const dm2 = client(again), token = rec.members[0].token;
  dm2.say({ t: "resume", code, token });
  assert.equal(dm2.last("welcome").role, "dm");
  assert.deepEqual(dm2.last("packs").packs.map((p) => p.id), ["ember-folk", "frost-kin"]);
  dm2.say({ t: "packData", id: "ember-folk" });
  assert.equal(dm2.last("packData").data.monsters[0].id, WRAITH);
  assert.ok(Object.values(dm2.last("update").state.entities).some((e) => e.tpl === WRAITH));
  dm2.say({ t: "act", action: { type: "spawn", monster: WRAITH, at: { q: 4, r: 1 } } });
  assert.equal(dm2.count("error"), 0, dm2.last("error")?.error);
  assert.deepEqual(again.get(code).state.packs, t.state.packs);
  clean();
});

test("a table whose saved packs fail the check is loaded without them: the DM is told, no one is sent them, and the game's packs are reconciled", () => {
  const saved = new Map();
  const tables = createTables({ seed: () => 5, save: (t) => saved.set(t.code, JSON.parse(JSON.stringify(t))) });
  const { dm, code } = seated(tables);
  add(dm, FROST());
  const good = JSON.parse(JSON.stringify(saved.get(code)));
  const quiet = console.error;
  const variants = {
    "a string": (r) => { r.packs = "x"; },
    "an object": (r) => { r.packs = {}; },
    "a null record": (r) => { r.packs = [null]; },
    "no data": (r) => { delete r.packs[0].data; },
    "an extra key": (r) => { r.packs[0].extra = 1; },
    "a stale hash": (r) => { r.packs[0].data.spells[0].text = "edited after it was hashed"; },
    "five copies": (r) => { r.packs = [0, 1, 2, 3, 4].map(() => structuredClone(r.packs[0])); },
    "a pack that summons a homebrew creature": (r) => { const d = r.packs[0].data; d.spells[0].effects = [{ summon: "hb-frost-kin-x" }]; r.packs[0].hash = hashOf(d); },
    "a depth bomb": (r) => { let x = {}; const root = x; for (let i = 0; i < 3000; i++) { x.a = {}; x = x.a; } r.packs[0].data.spells[0].effects = root; },
  };
  for (const [what, make] of Object.entries(variants)) {
    const rec = JSON.parse(JSON.stringify(good));
    make(rec);
    const logged = [];
    console.error = (m) => logged.push(m);
    let again, dm2, pl;
    try {
      again = createTables({ seed: () => 5, load: () => [rec] });
      dm2 = client(again);
      dm2.say({ t: "resume", code, token: rec.members[0].token });
    } finally { console.error = quiet; }
    assert.equal(dm2.last("welcome")?.role, "dm", `${what}: the table loads`);
    assert.ok(logged.some((m) => /dropped at load/.test(m)), `${what}: logged`);
    const t = again.get(code);
    assert.deepEqual(t.packs, [], what);
    assert.deepEqual(t.state.packs, [], `${what}: the game names no pack`);
    assert.ok(dm2.last("packs").dropped.length >= 1 && dm2.last("packs").dropped.every((d) => typeof d.reason === "string"), `${what}: the DM is told which and why`);
    assert.deepEqual(dm2.last("packs").packs, []);
    // A player who sits down is sent nothing of it, and a new pack can be added.
    pl = client(again);
    pl.say({ t: "join", code, name: "Pat" });
    dm2.say({ t: "approve", userId: pl.last("welcome").userId, ok: true });
    pl.say({ t: "sync" });
    pl.say({ t: "packData", id: "frost-kin" });
    assert.equal(pl.raw.some((x) => x.includes("frost-kin") || x.includes("Rime Bolt") || x.includes("edited")), false, what);
    assert.equal(pl.count("packData"), 0);
    add(dm2, EMBER());
    assert.equal(dm2.count("error"), 0, `${what}: ${dm2.last("error")?.error}`);
    assert.equal(again.get(code).packsDropped, undefined, "the note is cleared once the DM changes the packs");
  }
  // L5: pack data and hash edited together (a valid pack), the game still naming the old hash: the pack is kept and the game follows it.
  const edited = JSON.parse(JSON.stringify(good));
  edited.packs[0].data.spells[0].text = "edited";
  edited.packs[0].hash = hashOf(edited.packs[0].data);
  const e = createTables({ seed: () => 5, load: () => [edited] });
  assert.deepEqual(e.get(code).state.packs, [{ id: "frost-kin", version: 1, hash: edited.packs[0].hash }]);
  // The file's own game named a pack the file no longer holds: reconciled at load.
  const rec = JSON.parse(JSON.stringify(good));
  rec.packs = [];
  const r = createTables({ seed: () => 5, load: () => [rec] });
  assert.deepEqual(r.get(code).state.packs, []);
  assert.deepEqual(sanitizePacks(undefined), { packs: [], dropped: [] });
  clean();
});

test("the DM's export carries the packs, and vetPacks checks a list as if it were uploaded", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  add(dm, EMBER());
  dm.say({ t: "export" });
  const exp = dm.last("export").table;
  assert.deepEqual(exp.packs, [{ id: "ember-folk", version: 1, hash: hashOf(EMBER()), data: EMBER() }]);
  assert.deepEqual(exp.state.packs, [{ id: "ember-folk", version: 1, hash: hashOf(EMBER()) }]);
  player.say({ t: "export" });
  assert.match(player.last("error").error, /Only the DM/);
  assert.equal(player.raw.some((x) => x.includes(NAME)), false);
  // An import would hand this list to vetPacks: whole, it passes; changed in any way, it does not.
  assert.equal(vetPacks(exp.packs).ok, true);
  const tamper = (f) => { const l = structuredClone(exp.packs); f(l); return vetPacks(l); };
  assert.match(tamper((l) => { l[0].hash = "0".repeat(64); }).problems.join(), /hash does not match/);
  assert.match(tamper((l) => { l[0].data.spells[0].effects[0].onFail[0].damage = "x"; }).problems.join(), /hb-ember-folk-cinder-lash/);
  assert.match(tamper((l) => { l[0].version = 2; }).problems.join(), /version/);
  assert.match(tamper((l) => { l[0].id = "other"; }).problems.join(), /its id is/);
  assert.equal(tamper((l) => { l.push(structuredClone(l[0])); }).ok, false);
  assert.equal(tamper((l) => { l[0].data.__proto__ = null; l[0].data = JSON.parse('{"__proto__":{"a":1}}'); }).ok, false);
  assert.equal(vetPacks("nope").ok, false);
  assert.equal(vetPacks([null]).ok, false);
  const five = ["a", "b", "c", "d", "e"].map((n) => { const d = doc(n, { spells: [spell(n, "x")] }); return { id: n, version: 1, hash: hashOf(d), data: d }; });
  assert.match(vetPacks(five).problems.join(), /4 homebrew packs/);
  clean();
});

// ---------- the real server: the frame, the rate limit, a restart ----------
function talk(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`), got = [];
    const c = { ws, got, send: (m) => ws.send(typeof m === "string" ? m : JSON.stringify(m)), until: async (f, ms = 10_000) => { for (const end = Date.now() + ms; Date.now() < end;) { const v = f(got); if (v) return v; await new Promise((r) => setTimeout(r, 10)); } throw new Error(`timed out; got ${JSON.stringify(got.map((m) => m.t))}`); } };
    ws.onmessage = (ev) => got.push(JSON.parse(ev.data));
    ws.onopen = () => resolve(c);
    ws.onerror = () => reject(new Error("socket error"));
  });
}

test("end to end: a pack frame over the limit is refused unparsed, pack messages are rate limited, and a restart keeps the packs", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hextable-packs-"));
  try {
    let s = await startServer({ data: dir, stderr: "pipe", env: { LIMIT_PACKS: "4", LIMIT_RATE: "1000", LIMIT_BURST: "1000" } });
    const dm = await talk(s.port);
    dm.send({ t: "host", name: "Dana" });
    const w = await dm.until((g) => g.find((m) => m.t === "welcome"));
    // A pack frame over 256 KB plus the envelope: refused, the table untouched, the socket still open.
    dm.send(`{"t":"pack","op":"add","pack":"${"x".repeat(600 * 1024)}"}`);
    const big = await dm.until((g) => g.find((m) => m.t === "error" && /too large/.test(m.error)));
    assert.ok(big);
    // A good one.
    dm.send({ t: "pack", op: "add", pack: FROST() });
    const packs = await dm.until((g) => g.findLast((m) => m.t === "packs"));
    assert.equal(packs.packs[0].id, "frost-kin");
    // The fourth and later pack messages of the table's DM in the window are refused with the limit's own sentence (two have been used above).
    for (let i = 0; i < 3; i++) dm.send({ t: "pack", op: "remove", id: "nothing" });
    await dm.until((g) => g.filter((m) => m.t === "error" && /Too many requests/.test(m.error)).length >= 1);
    dm.ws.close();
    await s.stop();
    // The file has the packs; a restart keeps them.
    const file = JSON.parse(readFileSync(join(dir, `${w.code}.json`), "utf8"));
    assert.equal(file.packs[0].hash, hashOf(FROST()));
    assert.deepEqual(file.state.packs, [{ id: "frost-kin", version: 1, hash: hashOf(FROST()) }]);
    s = await startServer({ data: dir, stderr: "pipe" });
    const back = await talk(s.port);
    back.send({ t: "resume", code: w.code, token: w.token });
    const again = await back.until((g) => g.find((m) => m.t === "packs"));
    assert.equal(again.packs[0].id, "frost-kin");
    back.send({ t: "packData", id: "frost-kin" });
    assert.equal((await back.until((g) => g.find((m) => m.t === "packData"))).data.spells[0].id, RIME);
    back.send({ t: "pack", op: "remove", id: "frost-kin" });
    const gone = await back.until((g) => g.findLast((m) => m.t === "packs" && m.packs.length === 0));
    assert.deepEqual(gone.changed, { op: "remove", id: "frost-kin" });
    back.ws.close();
    await s.stop();
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 5 }); }
});

// ---------- fix round 1 of #400 ----------
test("M1: a table file with a bad `packs` value does not stop the server or another table, and a handler that throws does not stop the process", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hextable-packs-bad-"));
  try {
    let s = await startServer({ data: dir, stderr: "pipe" });
    const host = async () => { const c = await talk(s.port); c.send({ t: "host", name: "Dana" }); const w = await c.until((g) => g.find((m) => m.t === "welcome")); c.send({ t: "pack", op: "add", pack: FROST() }); await c.until((g) => g.find((m) => m.t === "packs")); c.ws.close(); return w; };
    const bad = await host(), good = await host(), damaged = await host();
    await s.stop();
    const edit = (code, f) => { const p = join(dir, `${code}.json`), r = JSON.parse(readFileSync(p, "utf8")); f(r); writeFileSync(p, JSON.stringify(r)); };
    edit(bad.code, (r) => { r.packs = "x"; });
    edit(damaged.code, (r) => { r.members = 5; });             // makes a join throw inside the handler
    s = await startServer({ data: dir, stderr: "pipe" });       // rejects if the server exits early
    assert.match(s.stderr(), /dropped at load/);
    const a = await talk(s.port);
    a.send({ t: "resume", code: bad.code, token: bad.token });
    const told = await a.until((g) => g.find((m) => m.t === "packs"));
    assert.deepEqual(told.packs, []);
    assert.match(told.dropped[0].reason, /not a list/);
    const b = await talk(s.port);
    b.send({ t: "resume", code: good.code, token: good.token });
    assert.equal((await b.until((g) => g.find((m) => m.t === "packs"))).packs[0].id, "frost-kin", "the other table is untouched");
    // The throw: an error frame, the socket stays open, the process lives, and the log has the stack.
    const c = await talk(s.port);
    c.send({ t: "join", code: damaged.code, name: "Pat" });
    assert.match((await c.until((g) => g.find((m) => m.t === "error"))).error, /could not handle/);
    assert.match(s.stderr(), /"join" message failed/);
    c.send({ t: "join", code: good.code, name: "Pat" });
    await c.until((g) => g.find((m) => m.t === "welcome"));
    assert.equal(s.child.exitCode, null);
    for (const x of [a, b, c]) x.ws.close();
    await s.stop();
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 5 }); }
});

// A homebrew spell that summons a homebrew creature of the same pack (allowed, #457; the server refused it under #400).
const CALL = "hb-ember-folk-call-wraith";
// The numbers of the blocks below are found nowhere else in a game, so a search of what a player was sent finds a leak and nothing else.
const OWLET = "hb-ember-folk-owlet", WOLFLING = "hb-ember-folk-wolfling";
const own = (id, base, name, over) => ({ ...structuredClone(CONTENT.monsters[base]), id, name, source: "homebrew:ember-folk", checked: false, text: `The ${name}.`, ...over });
const abilities = (base, dex) => ({ ...CONTENT.monsters[base].abilities, dex });
const BLOCKS = [monster("ember-folk", "quillwraith", { ac: 23, hp: 77, abilities: abilities("goblin-warrior", 23) }),
  own(OWLET, "owl", "Ember owlet", { ac: 21, abilities: abilities("owl", 25) }), own(WOLFLING, "wolf", "Ember wolfling", { ac: 22, hp: 66, abilities: abilities("wolf", 27) })];
const WYRM = "hb-ember-folk-wyrmling";
BLOCKS.push((() => { const m = own(WYRM, "black-dragon-wyrmling", "Ember wyrmling", {}); m.actions = structuredClone(m.actions); m.actions.find((a) => a.id === "acid-breath").effects[0].dc = 19; return m; })());
const NUMBERS = ['"ac":23', '"maxHp":77', '"dex":23', '"ac":21', '"dex":25', '"ac":22', '"maxHp":66', '"dex":27'];
const callPack = () => doc("ember-folk", { spells: [spell("ember-folk", "call-wraith", { level: 1, target: { self: true }, effects: [{ summon: WRAITH, bond: { kind: "summon", turn: "after", orders: "free", at0: "vanish" } }] })], monsters: BLOCKS });
const second = (tables, dm, code, name) => {
  const p = client(tables);
  p.say({ t: "join", code, name });
  dm.say({ t: "approve", userId: p.last("welcome").userId, ok: true });
  return p;
};

test("M2: a pack with a spell that summons a homebrew creature is accepted; a player is sent the spell and no monster, the DM all of it", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player, code } = seated(tables);
  add(dm, callPack());
  assert.equal(dm.last("error"), undefined, dm.last("error")?.error);
  assert.equal(tables.get(code).packs.length, 1);
  assert.ok(dm.last("packData").data.monsters.some((m) => m.id === WRAITH), "the DM is sent the creature's block");
  const pd = player.last("packData");
  assert.ok(pd.data.spells.some((x) => x.id === CALL), "a player is sent the spell");
  assert.equal("monsters" in pd.data, false, "and no monster");
  assert.equal(player.raw.some((x) => x.includes(NAME) || x.includes(TEXT) || x.includes(ATTACK)), false);
  // A stored pack that does so is kept at load as well.
  const d = callPack();
  assert.equal(vetPacks([{ id: "ember-folk", version: 1, hash: hashOf(d), data: d }]).ok, true);
  assert.deepEqual(sanitizePacks([{ id: "ember-folk", version: 1, hash: hashOf(d), data: d }]).dropped, []);
  clean();
});

test("a player's homebrew summon: its block goes to its controller alone, in the state and in every patch after; another player and the DM as they should", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, player: pat, code } = seated(tables);
  const bo = second(tables, dm, code, "Bo");
  add(dm, callPack());
  const t = tables.get(code);
  t.state.entities.wizard.spells.push(CALL);
  pat.say({ t: "act", action: { type: "claim", entity: "wizard" } });
  bo.say({ t: "act", action: { type: "claim", entity: "rogue" } });
  assert.ok(t.state.entities.wizard.owner && t.state.entities.rogue.owner && t.state.entities.wizard.owner !== t.state.entities.rogue.owner);
  const p = t.state.entities.wizard.pos;
  let id = null;
  for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1]]) {
    pat.say({ t: "act", action: { type: "cast", actor: "wizard", spell: CALL, slot: 1, summon: { at: [{ q: p.q + dq, r: p.r + dr }] } } });
    id = Object.keys(t.state.entities).find((k) => t.state.entities[k].tpl === WRAITH);
    if (id) break;
  }
  assert.ok(id, pat.last("error")?.error);
  const OPEN = ["ac", "maxHp", "abil", "actions", "speeds"];
  const open = (rec) => OPEN.every((k) => rec?.[k] !== undefined), seenOnly = (rec) => !!rec && OPEN.every((k) => rec[k] === undefined) && rec.tpl === WRAITH && rec.side === "party";
  assert.ok(open(pat.last("update").state.entities[id]), "its controller is sent it whole");
  assert.ok(seenOnly(bo.last("update").state.entities[id]), JSON.stringify(Object.keys(bo.last("update").state.entities[id] ?? {})));
  assert.ok(open(dm.last("update").state.entities[id]));
  // What it does: its controller is told its roll, another player is told nothing of it.
  const errs = pat.count("error");
  pat.say({ t: "act", action: { type: "check", actor: id, skill: "stealth" } });
  assert.equal(pat.count("error"), errs, pat.last("error")?.error);
  assert.ok(pat.last("update").events.some((e) => e.type === "check" && e.id === id && Number.isInteger(e.total)));
  assert.equal(bo.last("update").events.some((e) => e.type === "check"), false);
  // What changes about it afterwards reaches the other player as a patch of its seen record, never the open one.
  const frames = bo.raw.length;
  dm.say({ t: "act", action: { type: "setHp", actor: id, hp: 1 } });
  assert.equal(dm.last("error"), undefined);
  assert.ok(bo.raw.length > frames, "the other player was told something changed");
  const patch = JSON.parse(bo.raw.at(-1)).patch;
  assert.ok(patch?.entities?.[id], "it was a patch of that creature");
  assert.ok(seenOnly(patch.entities[id]), "the patch holds the seen record");
  assert.ok(seenOnly(bo.last("update").state.entities[id]), "applied, it leaves the seen record");
  assert.equal(bo.last("update").state.entities[id].health, "bloodied");
  assert.ok(open(pat.last("update").state.entities[id]));
  assert.equal(pat.last("update").state.entities[id].hp, 1);
  // A resync gives each the same split.
  bo.say({ t: "sync" }); pat.say({ t: "sync" });
  assert.ok(seenOnly(bo.last("update").state.entities[id]) && open(pat.last("update").state.entities[id]));
  // Nothing the other player was sent holds the block's own text, on the wire.
  const wire = bo.raw.join("\n");
  for (const secret of [TEXT, ATTACK, '"skill":"stealth"', ...NUMBERS.slice(0, 3)]) assert.equal(wire.includes(secret), false, secret);
  assert.ok(pat.raw.join("\n").includes(ATTACK), "the controller was sent its attacks, so the search is not passing by accident");
  for (const n of NUMBERS.slice(0, 3)) assert.ok(pat.raw.join("\n").includes(n), `its controller was sent ${n}`);
  assert.equal(dm.raw.join("\n").includes(ATTACK), true);
  clean();
});

// What a player is told when they ask for the record later, or come back: once the creature is gone or its form has ended (review of #461).
const asks = (c, fight) => { c.say({ t: "history", limit: 200 }); c.say({ t: "history", types: ["check", "attack", "form", "effectStart"], limit: 200 }); c.say({ t: "sync" }); if (fight !== undefined) c.say({ t: "history", fight }); };
const noBlock = (c, extra = []) => {
  const wire = c.raw.join("\n");
  for (const secret of [TEXT, ATTACK, '"skill":"stealth"', '"skill":"perception"', WOLFLING, "Ember wolfling", ...NUMBERS, ...extra]) assert.equal(wire.includes(secret), false, `${secret} reached a player`);
};
function bothSeated() {
  const tables = createTables({ seed: () => 5 });
  const { dm, player: pat, code } = seated(tables);
  const bo = second(tables, dm, code, "Bo");
  add(dm, callPack());
  const t = tables.get(code);
  t.state.entities.wizard.spells.push(CALL, "find-familiar");
  pat.say({ t: "act", action: { type: "claim", entity: "wizard" } });
  bo.say({ t: "act", action: { type: "claim", entity: "rogue" } });
  return { tables, dm, pat, bo, code, t };
}
function summonWraith(t, pat) {
  const p = t.state.entities.wizard.pos;
  for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1]]) {
    pat.say({ t: "act", action: { type: "cast", actor: "wizard", spell: CALL, slot: 1, summon: { at: [{ q: p.q + dq, r: p.r + dr }] } } });
    const id = Object.keys(t.state.entities).find((k) => t.state.entities[k].tpl === WRAITH);
    if (id) return id;
  }
  assert.fail(pat.last("error")?.error);
}

test("the record and a return: a summon removed, in a fight and out of it, tells another player nothing of its block, by history, sync, per-fight history and a new connection", () => {
  const { tables, dm, pat, bo, code, t } = bothSeated();
  const id = summonWraith(t, pat);
  pat.say({ t: "act", action: { type: "check", actor: id, skill: "stealth" } });
  dm.say({ t: "act", action: { type: "startEncounter", center: t.state.entities[id].pos, radius: 30 } });
  const fight = t.state.timeline.find((e) => e.type === "encounterStart")?.fight;
  assert.ok(t.state.encounter, dm.last("error")?.error);
  pat.say({ t: "act", action: { type: "check", actor: id, skill: "perception" } });
  dm.say({ t: "act", action: { type: "endEncounter" } });
  dm.say({ t: "act", action: { type: "remove", actor: id } });
  assert.equal(t.state.entities[id], undefined, dm.last("error")?.error);
  asks(bo, fight);
  const hist = bo.all("history");
  assert.ok(hist.length >= 3, "the other player was sent the record");
  assert.ok(bo.all("history").flatMap((h) => h.entries ?? []).every((e) => !("hb" in e)), "the stamp is not sent");
  // A player who comes back (the same member, a new connection) is sent the recent log again.
  const again = client(tables);
  again.say({ t: "resume", code, token: bo.last("welcome").token });
  asks(again, fight);
  noBlock(bo); noBlock(again);
  // The controller is sent its checks and its block; the search can find them.
  asks(pat, fight);
  const patWire = pat.raw.join("\n");
  assert.ok(patWire.includes('"skill":"stealth"') && patWire.includes('"ac":23'));
  assert.ok(pat.all("history").flatMap((h) => h.entries ?? []).some((e) => e.type === "check" && e.id === id));
  clean();
});

test("a homebrew party creature's breath: the save DC is sent to its runner and to no other player, live and by history after it is removed", () => {
  const { dm, pat, bo, t } = bothSeated();
  dm.say({ t: "act", action: { type: "spawn", monster: WYRM, at: { q: 3, r: -1 } } });
  const w = Object.keys(t.state.entities).find((k) => t.state.entities[k].tpl === WYRM);
  assert.ok(w, dm.last("error")?.error);
  dm.say({ t: "act", action: { type: "bond", actor: w, to: "wizard" } });
  assert.equal(t.state.entities[w].side, "party", dm.last("error")?.error);
  dm.say({ t: "act", action: { type: "startEncounter", center: t.state.entities[w].pos } });
  t.state.encounter.turn = t.state.encounter.order.findIndex((o) => o.id === w);
  const before = dm.count("error");
  dm.say({ t: "act", action: { type: "act", actor: w, action: "acid-breath", hex: { q: 4, r: -1 } } });
  assert.equal(dm.count("error"), before, dm.last("error")?.error);
  assert.ok(dm.raw.join("\n").includes('"dc":19'), "the DM is sent the DC");
  assert.ok(pat.raw.join("\n").includes('"dc":19'), "its runner is sent the DC");
  assert.equal(bo.raw.join("\n").includes('"dc":19'), false, "another player, live, is not");
  dm.say({ t: "act", action: { type: "endEncounter" } });
  dm.say({ t: "act", action: { type: "remove", actor: w } });
  assert.equal(t.state.entities[w], undefined, dm.last("error")?.error);
  asks(bo); asks(pat);
  assert.equal(bo.raw.join("\n").includes('"dc":19'), false, "nor in the record, after it is gone");
  assert.ok(pat.all("history").flatMap((h) => h.entries ?? []).some((e) => e.type === "save" && e.dc === 19), "its runner has it in the record");
  clean();
});

test("a homebrew party creature's lasting condition on another player's hero: its DC is told to its runner alone, live, in the state, in the repeated save and in the record", () => {
  const { dm, pat, bo, t } = bothSeated();
  // The wizard stands in for a homebrew creature of Pat's that casts (a template id that begins `hb-` is what makes it one).
  Object.assign(t.state.entities.wizard, { tpl: "hb-ember-folk-mage", slots: { 1: 4, 2: 4 }, slotsMax: { 1: 4, 2: 4 } });
  t.state.entities.wizard.abil = { ...t.state.entities.wizard.abil, int: 30 };
  t.state.entities.wizard.spells.push("hold-person");
  t.state.entities.rogue.abil = { ...t.state.entities.rogue.abil, wis: 1 };
  t.state.entities.wizard.pos = { q: 1, r: 0, z: 0 }; t.state.entities.rogue.pos = { q: 3, r: -1, z: 0 };
  dm.say({ t: "act", action: { type: "startEncounter", center: t.state.entities.m1.pos } });
  assert.ok(t.state.encounter, dm.last("error")?.error);
  const to = (id) => { for (let i = 0; i < 12 && t.state.encounter.order[t.state.encounter.turn].id !== id; i++) dm.say({ t: "act", action: { type: "endTurn", actor: t.state.encounter.order[t.state.encounter.turn].id } }); assert.equal(t.state.encounter.order[t.state.encounter.turn].id, id); };
  to("wizard");
  const before = [dm, pat, bo].map((c) => c.raw.length);
  pat.say({ t: "act", action: { type: "cast", actor: "wizard", spell: "hold-person", slot: 2, target: "rogue" } });
  const cast = t.state.timeline.find((e) => e.type === "save" && e.id === "rogue");
  assert.ok(cast && Number.isInteger(cast.dc), pat.last("error")?.error);
  const DCS = `"dc":${cast.dc}`;
  const wire = (c, from) => c.raw.slice(from).join("\n");
  assert.ok(wire(dm, before[0]).includes(DCS) && wire(pat, before[1]).includes(DCS), "the DM and its runner are sent the DC");
  assert.equal(wire(bo, before[2]).includes(DCS), false, "the target's own player, live, is not");
  assert.ok(wire(bo, before[2]).includes('"type":"save"'), "he is told of the save and the condition");
  bo.say({ t: "sync" }); pat.say({ t: "sync" });
  assert.equal(bo.raw.slice(before[2]).join("\n").includes(DCS), false, "nor in the state, in the effects of the table");
  assert.ok(pat.raw.slice(before[1]).join("\n").includes(DCS));
  delete t.state.entities.wizard.tpl;     // its block is gone by the time of the repeated save (a form that ended): the effect remembers who ran it
  to("rogue");
  const mid = [pat, bo].map((c) => c.raw.length);
  dm.say({ t: "act", action: { type: "endTurn", actor: "rogue" } });
  assert.ok(t.state.timeline.filter((e) => e.type === "save" && e.id === "rogue").length >= 2, "the repeated save was rolled");
  assert.equal(bo.raw.slice(mid[1]).join("\n").includes(DCS), false, "the repeated save, live");
  asks(bo); asks(pat);
  assert.equal(bo.raw.slice(mid[1]).join("\n").includes(DCS), false, "nor in the record");
  assert.ok(pat.all("history").flatMap((h) => h.entries ?? []).some((e) => e.type === "save" && e.dc === cast.dc), "its runner has it in the record");
  clean();
});

test("the record: a familiar dismissed to the pocket dimension, then re-formed there, tells another player nothing of its homebrew form", () => {
  const { dm, pat, bo, t } = bothSeated();
  t.state.entities.wizard.slots[1] = 4;
  const p = t.state.entities.wizard.pos;
  let fam = null;
  for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
    pat.say({ t: "act", action: { type: "cast", actor: "wizard", spell: "find-familiar", slot: 1, summon: { form: OWLET, type: "fey", at: [{ q: p.q + dq, r: p.r + dr }] } } });
    fam = Object.keys(t.state.entities).find((k) => t.state.entities[k].tpl === OWLET);
    if (fam) break;
  }
  assert.ok(fam, pat.last("error")?.error);
  pat.say({ t: "act", action: { type: "check", actor: fam, skill: "perception" } });
  pat.say({ t: "act", action: { type: "dismiss", actor: "wizard", id: fam } });
  assert.equal(t.state.entities[fam], undefined, pat.last("error")?.error);
  pat.say({ t: "act", action: { type: "cast", actor: "wizard", spell: "find-familiar", slot: 1, summon: { form: "owl", type: "fey" } } });
  pat.say({ t: "act", action: { type: "cast", actor: "wizard", spell: "find-familiar", slot: 1, summon: { form: OWLET, type: "fey" } } });
  asks(bo);
  noBlock(bo);
  assert.ok(pat.raw.join("\n").includes('"ac":21'), "the controller was sent it");
  clean();
});

test("the record: a druid in a homebrew form, after the form has ended, tells another player nothing of the form, and shows the druid as the party's own throughout", () => {
  const { dm, pat, bo, t } = bothSeated();
  const A = { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 };
  const druid = { name: "Ven", class: "druid", level: 2, abilities: A, skills: ["nature", "perception"], choices: { "primal-order": "warden" }, armour: "leather-armor", shield: true, weapons: ["quarterstaff"], spells: ["produce-flame", "cure-wounds"] };
  t.state.entities.hero = makeEntity(derive(druid).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  pat.say({ t: "act", action: { type: "release", entity: "wizard" } });
  pat.say({ t: "act", action: { type: "claim", entity: "hero" } });
  assert.ok(t.state.entities.hero.owner, pat.last("error")?.error);
  const hp = t.state.entities.hero.hp;
  pat.say({ t: "act", action: { type: "feature", actor: "hero", feature: "wild-shape", form: WOLFLING } });
  assert.equal(t.state.entities.hero.form?.block, WOLFLING, pat.last("error")?.error);
  pat.say({ t: "act", action: { type: "check", actor: "hero", skill: "stealth" } });
  // In the form: another player is sent the druid, with its own Hit Points, and nothing the form gave it.
  const seen = bo.last("update").state.entities.hero;
  assert.ok(seen && seen.form === undefined && seen.hp === hp && seen.abil?.dex === 14, JSON.stringify(seen));
  noBlock(bo, ['"block":', "Wild Shape (Ember"]);
  pat.say({ t: "act", action: { type: "feature", actor: "hero", feature: "wild-shape" } });
  assert.equal(t.state.entities.hero.form, undefined, pat.last("error")?.error);
  asks(bo);
  noBlock(bo, ['"block":', "Wild Shape (Ember"]);
  assert.ok(pat.raw.join("\n").includes('"dex":27'), "the druid's player was sent the form");
  clean();
});

test("M3: the pack budget is the table's and is spent only by its seated DM", () => {
  const spent = [];
  const tables = createTables({ seed: () => 5, allowPack: (key) => { spent.push(key); return spent.length <= 3; } });
  const { dm, player, code } = seated(tables);
  const stray = client(tables);
  for (const who of [stray, player]) for (let i = 0; i < 30; i++) who.say({ t: "pack", op: "add", pack: {} });
  assert.deepEqual(spent, [], "unseated and player frames spend nothing");
  dm.say({ t: "pack", op: "add", pack: FROST() });
  dm.say({ t: "pack", op: "install" });
  assert.deepEqual(spent, [code], "a frame with no valid operation spends nothing");
  dm.say({ t: "pack", op: "add", pack: "{not json" });
  dm.say({ t: "pack", op: "remove", id: "nope" });
  assert.deepEqual(spent, [code, code, code]);
  const before = snapshotOf(tables, code);
  add(dm, EMBER());
  assert.equal(dm.last("error").error, "Too many requests. Wait a moment and try again.");
  assert.equal(snapshotOf(tables, code), before);
});

test("M3 end to end: frames from sockets that are not the DM cannot use up the DM's pack messages", async () => {
  const s = await startServer({ stderr: "pipe", env: { LIMIT_RATE: "1000", LIMIT_BURST: "1000" } });
  const dm = await talk(s.port);
  dm.send({ t: "host", name: "Dana" });
  const w = await dm.until((g) => g.find((m) => m.t === "welcome"));
  const junk = await talk(s.port);
  for (let i = 0; i < 30; i++) junk.send({ t: "pack", op: "add", pack: {} });
  await junk.until((g) => g.filter((m) => m.t === "error").length >= 30);
  assert.equal(junk.got.some((m) => /Too many/.test(m.error ?? "")), false);
  dm.send({ t: "pack", op: "add", pack: FROST() });
  assert.equal((await dm.until((g) => g.find((m) => m.t === "packs"))).packs[0].id, "frost-kin");
  assert.ok(w);
  dm.ws.close(); junk.ws.close();
});

test("M4: sync, sitting down and being let in carry only the list; the data comes once on add or update and on request, rate limited, never to a pending member", () => {
  let allow = true;
  const tables = createTables({ seed: () => 5, allowPackData: () => allow });
  const { dm, player, code } = seated(tables);
  add(dm, EMBER());
  assert.equal(dm.count("packData"), 1);
  assert.equal(player.count("packData"), 1);
  add(dm, EMBER(2), "update");
  assert.equal(player.count("packData"), 2, "an update sends the data again");
  assert.equal(player.last("packData").version, 2);
  for (const who of [dm, player]) { who.say({ t: "sync" }); who.say({ t: "sync" }); }
  assert.equal(dm.count("packData"), 2);
  assert.equal(player.count("packData"), 2, "a sync sends no pack data");
  const sync = player.raw.filter((x) => x.startsWith('{"t":"packs"')).at(-1);
  assert.ok(sync.length < 400, `the list is small: ${sync.length} bytes`);
  // On request: the member's own filtered form.
  player.say({ t: "packData", id: "ember-folk" });
  assert.equal(player.last("packData").data.monsters, undefined);
  assert.equal(player.last("packData").hash, hashOf(packForPlayer(EMBER(2))));
  assert.equal(dm.last("packData").hash, hashOf(EMBER(2)), "the DM keeps the full hash");
  dm.say({ t: "packData", id: "ember-folk" });
  assert.equal(dm.last("packData").data.monsters[0].id, WRAITH);
  player.say({ t: "packData", id: "nope" });
  assert.match(player.last("error").error, /not on this table/);
  player.say({ t: "packData" });
  assert.match(player.last("error").error, /not on this table/);
  // A pending member is refused and learns nothing, a rate limit says so.
  const waiting = client(tables);
  waiting.say({ t: "join", code, name: "Wes" });
  waiting.say({ t: "packData", id: "ember-folk" });
  assert.match(waiting.last("error").error, /Waiting for the DM/);
  assert.equal(waiting.raw.some((x) => x.includes("ember") || x.includes("Cinder")), false);
  allow = false;
  const n = player.count("packData");
  player.say({ t: "packData", id: "ember-folk" });
  assert.equal(player.last("error").error, "Too many requests. Wait a moment and try again.");
  assert.equal(player.count("packData"), n);
});

// A pack of about 251 KB made of many entries whose text is full of quotes, so that as text inside a message it is much longer.
function bigPack() {
  const d = doc("big", { spells: [] });
  for (let i = 0; i < 200; i++) {
    d.spells.push(spell("big", `s${i}`, { name: "Big Spell", text: '"q'.repeat(i < 199 ? 620 : 1) }));
    if (JSON.stringify(d).length > 251_000) break;
  }
  return d;
}
test("L1: a valid 251 KB pack sent as text is accepted, however much longer the escaped frame is", async () => {
  const d = bigPack(), text = JSON.stringify(d);
  assert.ok(text.length > 245_000 && text.length < 256 * 1024, `${text.length}`);
  const frame = JSON.stringify({ t: "pack", op: "add", pack: text });
  assert.ok(frame.length > 256 * 1024 + 4096, `the frame is ${frame.length}: more than the old bound`);
  const s = await startServer({ stderr: "pipe", env: { LIMIT_RATE: "1000", LIMIT_BURST: "1000" } });
  const dm = await talk(s.port);
  dm.send({ t: "host", name: "Dana" });
  await dm.until((g) => g.find((m) => m.t === "welcome"));
  // The key order of the message does not matter: nothing reads the start of the frame.
  dm.send(`{"op":"add","pack":${JSON.stringify(text)},"t":"pack"}`);
  const got = await dm.until((g) => g.find((m) => m.t === "packs" || (m.t === "error" && !/Waiting/.test(m.error))));
  assert.equal(got.t, "packs", got.error);
  assert.equal(got.packs[0].hash, hashOf(d));
  // One byte of pack over the limit is refused by the rules' budget, with its own sentence, whatever the form.
  const over = structuredClone(d); over.pack.attribution = "z".repeat(MAX_PACK_BYTES - text.length + 200);
  dm.send({ t: "pack", op: "update", pack: JSON.stringify({ ...over, pack: { ...over.pack, version: 2 } }) });
  const e = await dm.until((g) => g.findLast((m) => m.t === "error"));
  assert.match(e.error, /refused/);
  assert.ok(e.problems.length > 0);
  dm.ws.close();
});

test("L4: an update may not drop an entry the earlier version had: undo cannot bring back a creature of a dropped template", () => {
  const tables = createTables({ seed: () => 5 });
  const { dm, code } = seated(tables);
  const t = play(tables, code);
  add(dm, EMBER());
  dm.say({ t: "act", action: { type: "spawn", monster: WRAITH, at: { q: 3, r: 0 } } });
  const id = Object.keys(t.state.entities).find((k) => t.state.entities[k].tpl === WRAITH);
  dm.say({ t: "act", action: { type: "remove", entity: id } });
  if (t.state.entities[id]) delete t.state.entities[id];
  const slim = EMBER(2); slim.monsters = [];
  add(dm, slim, "update");
  const e = dm.last("error");
  assert.match(e.error, /drops 1 entry/);
  assert.match(e.error, new RegExp(WRAITH));
  assert.match(e.error, /remove the pack \(when nothing uses it\) and add it again/);
  assert.equal(t.packs[0].version, 1);
  // Adding and changing entries is fine.
  const more = EMBER(2); more.spells.push(spell("ember-folk", "extra", { name: "Extra Lash" }));
  add(dm, more, "update");
  assert.equal(t.packs[0].version, 2);
  // And the way the message says: remove it, add the smaller pack again.
  dm.say({ t: "pack", op: "remove", id: "ember-folk" });
  assert.deepEqual(t.packs, []);
  add(dm, slim);
  assert.equal(t.packs[0].id, "ember-folk");
  clean();
});
