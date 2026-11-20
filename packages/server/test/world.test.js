// Travel W3 (docs/specs/travel.md, Decision 2; build row W3): the table server's `world` message, the world pack kept
// beside the state, its pictures in the table's store, the fill of a pack's map into an action, and what nobody but the
// DM is told. Plus one pass over a real WebSocket, for the frame a world pack needs.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { CONTENT } from "../../rules/src/content/index.js";
import { assetRefs } from "../../rules/src/handouts.js";
import { createReceiver } from "../../rules/src/patch.js";
import { playerView } from "../../rules/src/view.js";
import { WORLD_LIMITS } from "../../rules/src/worldpack.js";
import { createAssets } from "../src/assets.js";
import { createTables, MAX_ACTION_BYTES, MAX_MAP_ACTION_BYTES, worldAssets } from "../src/tables.js";
import { JPEG, PNG, riverPack, tavernMap } from "../../rules/test/fixtures/world-pack.js";
import { startServer, stopAll } from "./helpers.js";

const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
after(stopAll);

// A table server with a real file store in a folder of its own.
function server(opts = {}) {
  const dir = mkdtempSync(join(tmpdir(), "hextable-world-"));
  dirs.push(dir);
  const assets = createAssets({ dir, limits: opts.limits });
  const tables = createTables({ seed: () => 5, ...worldAssets(() => assets), ...opts.tables });
  return { tables, assets };
}
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
  return Object.assign(c, { say: (m) => c.session.receive(m), last: (t) => got.findLast((m) => m.t === t), count: (t) => got.filter((m) => m.t === t).length });
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
const snapshotOf = (tables, code) => JSON.stringify({ state: tables.get(code).state, world: tables.get(code).world ?? null, seq: tables.get(code).seq });
// Words of the world that must never reach a player: ids, names, the table, the pictures.
const SECRETS = ["river-country", "The river country", "continent", "p-keep", "keep-map", "road-table", "Wolves on the road", "worldLoaded", PNG.slice(0, 40), JPEG.slice(0, 12)];
const leaks = (c) => SECRETS.filter((k) => c.raw.some((x) => x.includes(k)));

test("a DM loads a world: the table keeps it beside the state without its pictures' bytes, the pictures are in the store, the game has the index, and only the DM is told", () => {
  const { tables, assets } = server();
  const { dm, player, code } = seated(tables);
  dm.say({ t: "undo" });                                                   // nothing to undo yet; the history is cleared by a world anyway
  dm.say({ t: "world", pack: riverPack() });
  assert.equal(dm.last("error")?.world, undefined, dm.last("error")?.error);
  const t = tables.get(code);
  assert.deepEqual([t.world.id, t.world.version], ["river-country", 1]);
  assert.equal(t.world.data.assets, undefined, "the pictures' bytes are not in the table's file");
  assert.ok(!JSON.stringify(t).includes(PNG), "nor anywhere else in the record");
  const files = assets.list(code);
  assert.equal(files.length, 2);
  assert.deepEqual(files.map((f) => f.mime).sort(), ["image/jpeg", "image/png"]);
  assert.equal(t.world.data.nodes[0].image, t.world.assets.a1.id, "the pack's references are the store's ids");
  assert.ok(files.some((f) => f.id === t.world.assets.a1.id));
  // The game's index; the DM's view has it.
  assert.deepEqual(Object.keys(t.state.world.nodes), ["continent", "keep", "port", "tavern"]);
  assert.equal(t.state.world.hash, t.world.hash);
  assert.deepEqual(dm.last("world").world, { id: "river-country", name: "The river country", version: 1, hash: t.world.hash, nodes: 4, maps: 2, routes: 1, tables: 1 });
  assert.equal(dm.receiver.state.world.root, "continent");
  assert.ok(dm.last("update").events.some((e) => e.type === "worldLoaded"));
  // A player is sent nothing of it: no message, no event, nothing in their view, and none of its pictures may be fetched.
  assert.equal(player.count("world"), 0);
  assert.deepEqual(leaks(player), []);
  const refs = assetRefs(playerView(t.state));
  for (const f of files) assert.ok(!refs.has(f.id), "a world's picture is in no player's view, so a player cannot fetch it");
  // Sitting down again: the DM is told of the world, a player is not.
  const back = client(tables);
  back.say({ t: "resume", code, token: dm.last("welcome").token });
  assert.equal(back.last("world").world.name, "The river country");
  const pback = client(tables);
  pback.say({ t: "resume", code, token: player.last("welcome").token });
  assert.equal(pback.count("world"), 0);
  assert.deepEqual(leaks(pback), []);
  // The export carries it, as the table keeps it.
  dm.say({ t: "export" });
  assert.deepEqual(dm.last("export").table.world, { id: t.world.id, version: 1, hash: t.world.hash, data: t.world.data, assets: t.world.assets });
});

test("only the DM may load a world; a player, someone waiting and a stranger are refused and nothing changes", () => {
  const { tables, assets } = server();
  const { dm, player, code } = seated(tables);
  const waiting = client(tables);
  waiting.say({ t: "join", code, name: "Wes" });
  const before = snapshotOf(tables, code), told = dm.raw.length;
  for (const who of [player, waiting]) {
    who.say({ t: "world", pack: riverPack() });
    assert.equal(who.last("error").error, "Only the DM can load a world.");
  }
  const stray = client(tables);
  stray.say({ t: "world", pack: riverPack() });
  assert.match(stray.last("error").error, /Join a table first/);
  assert.equal(snapshotOf(tables, code), before);
  assert.equal(assets.list(code).length, 0);
  assert.equal(dm.raw.length, told, "the DM was told of nothing");
  // The index cannot be sent as an action, by anyone.
  for (const who of [dm, player]) {
    who.say({ t: "act", action: { type: "worldIndex", index: { id: "x" } } });
    assert.equal(who.last("error").error, "A table's world is loaded with the world message.");
  }
  assert.equal(snapshotOf(tables, code), before);
});

test("refused with a plain sentence, and nothing changes: a bad map, a monster not in the pack, 301 places, depth 9, a __proto__ key", () => {
  const { tables, assets } = server();
  const { dm, player, code } = seated(tables);
  const bad = {
    "a bad map": [(p) => { p.maps["keep-map"].cellFeet = 10; }, /^The world pack was refused\. Battle map "keep-map" can't be used\. A hex must be 5 feet\.$/],
    "a monster not in the pack": [(p) => { p.tables[0].rows[1].foes[0].monster = "hb-nobody-wolf"; }, /names a monster that is not in the game's content or the table's homebrew: "hb-nobody-wolf"\./],
    "301 places": [(p) => { for (let i = p.nodes.length; i < 301; i++) p.nodes.push({ id: `hut-${i}`, kind: "scene", parent: "continent", name: `Hut ${i}` }); }, /It has 301 places; a world has at most 300\./],
    "depth 9": [(p) => { for (let i = 2; i <= 9; i++) p.nodes.push({ id: `d${i}`, kind: "scene", parent: i === 2 ? "continent" : `d${i - 1}`, name: `D ${i}` }); }, /Place "d9" is 9 deep; places nest 8 deep at most\./],
  };
  const before = snapshotOf(tables, code), pseen = player.raw.length;
  for (const [what, [change, words]] of Object.entries(bad)) {
    const p = riverPack();
    change(p);
    dm.say({ t: "world", pack: p });
    const e = dm.last("error");
    assert.equal(e.world, true, what);
    assert.match(e.error, words, what);
    assert.ok(e.problems.every((x) => /^[A-Z"].*[.)]$/.test(x)), `${what}: plain sentences`);
  }
  // A __proto__ key: in JSON text, as a client sends it.
  dm.say({ t: "world", pack: JSON.stringify(riverPack()).replace('"name":"The keep"', '"__proto__":{"admin":true},"name":"The keep"') });
  assert.match(dm.last("error").error, /It has a key "__proto__" at nodes\[0\]\.pins\[0\], which no world pack may have\./);
  // And in an object parsed the way the server parses a frame.
  dm.say(JSON.parse(JSON.stringify({ t: "world", pack: riverPack() }).replace('"world":{"id"', '"world":{"__proto__":{"x":1},"id"')));
  assert.match(dm.last("error").error, /__proto__/);
  dm.say({ t: "world", pack: 7 });
  assert.match(dm.last("error").error, /Send the world pack as a JSON document/);
  assert.equal({}.admin, undefined);
  assert.equal(snapshotOf(tables, code), before, "the table, the game and its world are as they were");
  assert.equal(assets.list(code).length, 0, "no picture was stored");
  assert.equal(player.raw.length, pseen, "the player was told of nothing");
});

test("a monster of the table's homebrew may be named; a pack the store cannot take is refused with its pictures taken back out", () => {
  const { tables, assets } = server({ limits: { tableAssets: 1 } });
  const { dm, code } = seated(tables);
  const wraith = { ...structuredClone(CONTENT.monsters["goblin-warrior"]), id: "hb-ember-folk-quillwraith", name: "Quillwraith", source: "homebrew:ember-folk", checked: false, text: "A wraith." };
  dm.say({ t: "pack", op: "add", pack: { format: "hextable-pack", v: 1, pack: { id: "ember-folk", name: "Ember folk", version: 1, license: "CC0", attribution: "A test." }, monsters: [wraith] } });
  assert.equal(dm.count("error"), 0, dm.last("error")?.error);
  const p = riverPack();
  p.tables[0].rows[1].foes = [{ monster: "hb-ember-folk-quillwraith", count: 1 }];
  const before = snapshotOf(tables, code);
  dm.say({ t: "world", pack: p });
  assert.match(dm.last("error").error, /^The world pack was refused\. Picture "a2" could not be kept: A table can keep at most 1 files\. Delete some first\.$/);
  assert.equal(assets.list(code).length, 0, "the picture stored before the refusal was taken back out");
  assert.equal(snapshotOf(tables, code), before);
  // With room, it loads: the homebrew monster is the table's.
  const roomy = server();
  const s2 = seated(roomy.tables);
  s2.dm.say({ t: "pack", op: "add", pack: { format: "hextable-pack", v: 1, pack: { id: "ember-folk", name: "Ember folk", version: 1, license: "CC0", attribution: "A test." }, monsters: [wraith] } });
  s2.dm.say({ t: "world", pack: p });
  assert.equal(s2.dm.last("error"), undefined);
  assert.equal(roomy.tables.get(s2.code).state.world.tables[0].rows[1].foes[0].monster, "hb-ember-folk-quillwraith");
});

test("the engine's refusals come before any file is stored: in a fight, or an older version", () => {
  const { tables, assets } = server();
  const { dm, code } = seated(tables);
  dm.say({ t: "act", action: { type: "startEncounter", center: { q: 2, r: 0 }, radius: 10 } });
  const before = snapshotOf(tables, code);
  dm.say({ t: "world", pack: riverPack() });
  assert.equal(dm.last("error").error, "The world pack was refused. A world cannot be loaded in the middle of a fight.");
  assert.equal(assets.list(code).length, 0);
  assert.equal(snapshotOf(tables, code), before);
  dm.say({ t: "act", action: { type: "endEncounter" } });
  const v2 = riverPack(); v2.world.version = 2;
  dm.say({ t: "world", pack: v2 });
  assert.equal(tables.get(code).world.version, 2);
  const files = assets.list(code).map((f) => f.id).sort();
  dm.say({ t: "world", pack: riverPack() });
  assert.match(dm.last("error").error, /This table has version 2 of The river country/);
  assert.deepEqual(assets.list(code).map((f) => f.id).sort(), files);
});

test("replacing a world: pictures the same byte for byte are kept once, those nothing shows any more are let go, and the DM's undo history is cleared", () => {
  const { tables, assets } = server();
  const { dm, code } = seated(tables);
  dm.say({ t: "act", action: { type: "advanceTime", minutes: 10 } });
  assert.ok(dm.last("undoable").undo.length > 0);
  dm.say({ t: "world", pack: riverPack() });
  assert.equal(dm.last("undoable").undo.length, 0, "the undo history was cleared");
  const first = structuredClone(tables.get(code).world.assets);
  const v2 = riverPack();
  v2.world.version = 2;
  v2.assets.a2.data = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe1, ...new Array(28).fill(9)));     // a new port picture
  dm.say({ t: "world", pack: v2 });
  const now = tables.get(code).world.assets;
  assert.equal(now.a1.id, first.a1.id, "the same continent picture is used again");
  assert.notEqual(now.a2.id, first.a2.id);
  assert.deepEqual(assets.list(code).map((f) => f.id).sort(), [now.a1.id, now.a2.id].sort(), "the old port picture, which nothing shows, was let go");
});

// ---------- the fill ----------
test("the fill: a client's own map in an enter is replaced by the pack's, and that is what the history records", () => {
  const { tables } = server();
  const { dm, player, code } = seated(tables);
  dm.say({ t: "world", pack: riverPack() });
  dm.say({ t: "act", action: { type: "loadMap", node: "continent" } });
  const t = tables.get(code);
  assert.equal(t.state.place, "continent");
  const evil = tavernMap();
  evil.name = "A map the client made";
  dm.say({ t: "act", action: { type: "enter", pin: "p-keep", map: evil } });
  assert.equal(dm.last("error"), undefined, dm.last("error")?.error);
  assert.equal(t.state.place, "keep");
  assert.equal(t.state.map.name, "Greywatch (small keep)", "the pack's map, not the client's");
  assert.deepEqual(t.state.map.entries, [{ id: "gate", name: "The gatehouse", kind: "gate" }]);
  assert.ok(!JSON.stringify(t.state).includes("A map the client made"));
  // Undo takes the arrival back exactly, and redo plays the pack's map again.
  dm.say({ t: "undo" });
  assert.equal(t.state.place, "continent");
  dm.say({ t: "redo" });
  assert.equal(t.state.map.name, "Greywatch (small keep)");
  // The player is sent the keep as their view allows, and nothing of the pack beyond it.
  assert.equal(player.receiver.state.map.name, "Greywatch (small keep)");
  assert.equal(player.raw.some((x) => x.includes("road-table") || x.includes("river-country")), false);
});

test("the size limit is checked on what the client sent, before the fill: a small enter is filled past the small cap; a large one is refused before", () => {
  const { tables } = server();
  const { dm, code } = seated(tables);
  dm.say({ t: "world", pack: riverPack() });
  dm.say({ t: "act", action: { type: "loadMap", node: "continent" } });
  const t = tables.get(code);
  // What the client sends is tiny; what is applied is the keep's map, far past MAX_ACTION_BYTES: accepted.
  const small = { type: "enter", pin: "p-keep" };
  assert.ok(JSON.stringify(small).length < MAX_ACTION_BYTES);
  assert.ok(JSON.stringify(t.world.data.maps["keep-map"]).length > MAX_ACTION_BYTES);
  // A large enter is refused before the fill, though the fill would have dropped its map.
  const big = { type: "enter", pin: "p-keep", map: { ...tavernMap(), padding: "x".repeat(MAX_MAP_ACTION_BYTES) } };
  const before = snapshotOf(tables, code);
  dm.say({ t: "act", action: big });
  assert.equal(dm.last("error").error, "That action is too large.");
  assert.equal(snapshotOf(tables, code), before);
  dm.say({ t: "act", action: small });
  assert.equal(t.state.place, "keep");
  assert.equal(dm.got.at(-1).t === "error", false);
});

test("a table saved with a world loads with it and fills from it; a damaged world record is not used", () => {
  const { tables } = server();
  const { dm, code } = seated(tables);
  dm.say({ t: "world", pack: riverPack() });
  const saved = JSON.parse(JSON.stringify(tables.get(code)));
  const dir = mkdtempSync(join(tmpdir(), "hextable-world-")); dirs.push(dir);
  const assets = createAssets({ dir });
  const again = createTables({ seed: () => 5, load: () => [structuredClone(saved)], ...worldAssets(() => assets) });
  const dm2 = client(again);
  dm2.say({ t: "resume", code, token: dm.last("welcome").token });
  assert.equal(dm2.last("world").world.name, "The river country");
  dm2.say({ t: "act", action: { type: "loadMap", node: "continent" } });
  dm2.say({ t: "act", action: { type: "enter", pin: "p-keep" } });
  assert.equal(again.get(code).state.map.name, "Greywatch (small keep)");
  // A world record that is not the shape the server writes is let go at load; the DM is told.
  const broken = structuredClone(saved);
  broken.world = { id: "river-country", data: "nonsense" };
  const third = createTables({ seed: () => 5, load: () => [broken] });
  assert.equal(third.get(code).world, null);
  const dm3 = client(third);
  dm3.say({ t: "resume", code, token: dm.last("welcome").token });
  assert.deepEqual(dm3.last("world"), { t: "world", world: null, dropped: true });
});

test("over a real WebSocket: a seated DM may send a world pack larger than a map action's frame; anyone else's frame stays small", async () => {
  const { port } = await startServer();
  const open = () => new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`), got = [];
    const wait = (pred, ms = 15000) => new Promise((res, rej) => {
      const t0 = setInterval(() => { const m = got.find(pred); if (m) { clearInterval(t0); clearTimeout(t1); res(m); } }, 20);
      const t1 = setTimeout(() => { clearInterval(t0); rej(new Error(`timed out; got ${got.map((m) => m.t)}`)); }, ms);
    });
    ws.onopen = () => resolve({ ws, got, wait, send: (m) => ws.send(JSON.stringify(m)) });
    ws.onmessage = (ev) => got.push(JSON.parse(ev.data));
    ws.onerror = () => reject(new Error("socket error"));
  });
  const dm = await open();
  dm.send({ t: "host", name: "Dana" });
  await dm.wait((m) => m.t === "update");
  // A pack of about 1.4 MB: a third picture as big as a map action's frame, under the store's 5 MB.
  const p = riverPack();
  const png = Buffer.from(PNG, "base64");
  p.assets.a2 = { kind: "image", data: Buffer.concat([png, Buffer.alloc(MAX_MAP_ACTION_BYTES, 1)]).toString("base64") };
  const size = JSON.stringify(p).length;
  assert.ok(size > MAX_MAP_ACTION_BYTES + 4096 && size < WORLD_LIMITS.bytes, `${size} bytes`);
  dm.send({ t: "world", pack: p });
  const told = await dm.wait((m) => m.t === "world" || m.t === "error");
  assert.equal(told.t, "world", told.error);
  assert.equal(told.world.nodes, 4);
  dm.ws.close();
  // Someone not seated as the DM: a frame that large closes the socket.
  const stranger = await open();
  const closed = new Promise((r) => { stranger.ws.onclose = (ev) => r(ev.code); });
  stranger.send({ t: "world", pack: p });
  assert.equal(await closed, 1009);
});
