// Homebrew packs on a table (docs/specs/homebrew.md, Decision 3 and 5, rows H6 and B5, issue #391): who may send `pack`, the order of the
// checks, what members are told, that a refusal changes nothing, that everything that reads content for a table runs inside the
// table's overlay, and that a restart and an export keep the packs. The homebrew here is invented for these tests.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { aiStep } from "../../rules/src/ai.js";
import { CONTENT, HOMEBREW_LOOKUPS, MONSTERS, SPELLS } from "../../rules/src/content/index.js";
import { hashOf } from "../../rules/src/content/packs.js";
import { installed } from "../../rules/src/content/registry.js";
import { current } from "../../rules/src/engine.js";
import { createReceiver } from "../../rules/src/patch.js";
import { createTables, MAX_PACK_BYTES, packForPlayer, PLAYER_PACK_KINDS, usesIn, vetPacks } from "../src/tables.js";
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
  // The DM is sent the whole pack, notes and monsters too, and what changed.
  const d = dm.last("packs");
  assert.equal(d.packs[0].hash, hashOf(EMBER()));
  assert.deepEqual(d.changed, { op: "add", id: "ember-folk", version: 1 });
  assert.equal(d.packs[0].data.monsters[0].id, WRAITH);
  assert.deepEqual(dm.receiver.state.packs, t.state.packs, "the DM's view of the game says which packs it needs");
  // A player: id, name, version, the six lists. No monsters, no notes, no hash.
  const p = player.last("packs");
  assert.deepEqual(p.packs.map((x) => Object.keys(x).sort()), [["armour", "feats", "id", "items", "name", "objects", "spells", "version", "weapons"]]);
  assert.deepEqual(p.packs[0].spells, [spell("ember-folk", "cinder-lash")]);
  assert.equal(p.packs[0].name, "The ember-folk pack");
  assert.equal(p.packs[0].version, 1);
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
  assert.equal(late.last("packs").packs[0].spells[0].id, "hb-noted-glow");
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
  try { add(dm, "{" + " ".repeat(MAX_PACK_BYTES + 1) + "}"); } finally { JSON.parse = real; }
  assert.equal(parsed, 0, "a pack text over the limit is never parsed");
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
  // A new version that drops what is in use is refused as well; one that keeps it is accepted.
  const slim = EMBER(2);
  slim.monsters = [];
  add(dm, slim, "update");
  assert.match(dm.last("error").error, /would take away entries that are in use/);
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
  assert.ok(Object.values(dm2.last("update").state.entities).some((e) => e.tpl === WRAITH));
  dm2.say({ t: "act", action: { type: "spawn", monster: WRAITH, at: { q: 4, r: 1 } } });
  assert.equal(dm2.count("error"), 0, dm2.last("error")?.error);
  assert.deepEqual(again.get(code).state.packs, t.state.packs);
  clean();
});

test("a table whose saved packs no longer pass the check is loaded without them, says so to the DM, and refuses new packs until they are removed", () => {
  const saved = new Map();
  const tables = createTables({ seed: () => 5, save: (t) => saved.set(t.code, JSON.parse(JSON.stringify(t))) });
  const { dm, code } = seated(tables);
  add(dm, FROST());
  const rec = JSON.parse(JSON.stringify(saved.get(code)));
  rec.packs[0].data.spells[0].text = "edited after it was hashed";
  const quiet = console.error;
  console.error = () => {};
  let again;
  try { again = createTables({ seed: () => 5, load: () => [rec] }); } finally { console.error = quiet; }
  const dm2 = client(again);
  console.error = () => {};
  try { dm2.say({ t: "resume", code, token: rec.members[0].token }); } finally { console.error = quiet; }
  assert.match(dm2.last("packs").problems.join(" "), /hash does not match/);
  add(dm2, EMBER());
  assert.match(dm2.last("error").error, /could not be loaded/);
  dm2.say({ t: "pack", op: "remove", id: "frost-kin" });
  assert.deepEqual(again.get(code).packs, []);
  add(dm2, EMBER());
  assert.equal(dm2.count("error"), 1);
  assert.equal(again.get(code).packs.length, 1);
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
    dm.send(`{"t":"pack","op":"add","pack":"${"x".repeat(300 * 1024)}"}`);
    const big = await dm.until((g) => g.find((m) => m.t === "error" && /too large/.test(m.error)));
    assert.ok(big);
    // A good one.
    dm.send({ t: "pack", op: "add", pack: FROST() });
    const packs = await dm.until((g) => g.findLast((m) => m.t === "packs"));
    assert.equal(packs.packs[0].id, "frost-kin");
    // The fourth and later messages in the window are refused with the limit's own sentence (two have been used above).
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
    assert.equal(again.packs[0].data.spells[0].id, RIME);
    back.send({ t: "pack", op: "remove", id: "frost-kin" });
    const gone = await back.until((g) => g.findLast((m) => m.t === "packs" && m.packs.length === 0));
    assert.deepEqual(gone.changed, { op: "remove", id: "frost-kin" });
    back.ws.close();
    await s.stop();
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 5 }); }
});
