// Travel W3 (docs/specs/travel.md, Decision 2; build row W3): the world pack's budget and linter, WORLD_LIMITS, the
// index the state keeps, the engine's `worldIndex`, and the fill of a pack's map into an action.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { playerView, view, viewEvents } from "../src/view.js";
import { canonical, sha256 } from "../src/content/packs.js";
import {
  assetBytesOf, budgetWorld, fillMap, indexOf, indexProblem, lintWorld, loadWorld, needsMap, storedWorld, WORLD_LIMITS,
} from "../src/worldpack.js";
import { PNG, riverPack, tavernMap } from "./fixtures/world-pack.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error ?? r.problems?.join("; ")); return r; };
const json = (x) => JSON.stringify(x);
const IDS = { a1: "store-continent-0001", a2: "store-port-00000002" };
// A pack loaded as a table would keep it, and its index.
function loaded(pack = riverPack()) {
  const r = ok(loadWorld(pack));
  const stored = storedWorld(r.pack, IDS);
  return { ...r, stored, index: indexOf(stored, r.hash) };
}
function refusedWorld(pack, words) {
  const r = loadWorld(pack);
  assert.equal(r.ok, false, "the pack should be refused");
  assert.ok(r.problems.length > 0);
  for (const p of r.problems) assert.match(p, /^[A-Z"].*[.)]$/, `a plain sentence: ${p}`);
  if (words) assert.ok(r.problems.some((p) => words.test(p)), `one problem says ${words}: ${r.problems.join(" | ")}`);
  return r;
}
function refused(s, action, words, ctx = DM) {
  const before = json(s);
  const r = apply(s, action, ctx);
  assert.equal(r.ok, false, `${action.type} should be refused`);
  if (words) assert.match(r.error, words);
  assert.equal(json(s), before, "a refused action changes nothing");
  return r;
}
const withWorld = (seed = 5) => { const s = newGame(seed), w = loaded(); ok(apply(s, { type: "worldIndex", index: w.index }, DM)); return { s, w }; };

// ---------- Done when 1: a pack with a continent, a city plan, two battle maps and a route imports ----------
test("a pack with a continent, a city plan, two battle maps and a route loads, and its index holds no maps and no pictures", () => {
  const { pack, hash, stored, index } = loaded();
  assert.equal(hash, sha256(canonical(riverPack())), "the hash is of the pack as given");
  assert.equal(loadWorld(JSON.stringify(riverPack())).hash, hash, "the same pack as JSON text has the same hash");
  const shuffled = Object.fromEntries(Object.entries(riverPack()).reverse());
  assert.equal(loadWorld(shuffled).hash, hash, "the hash does not depend on the order of keys");
  assert.deepEqual(pack, riverPack(), "the pack is a plain copy of what was given");
  // As the table keeps it: no picture bytes, references rewritten to the store's ids.
  assert.equal(stored.assets, undefined);
  assert.equal(stored.nodes.find((n) => n.id === "continent").image, IDS.a1);
  assert.ok(!json(stored).includes(PNG));
  // The index.
  assert.equal(indexProblem(index), null);
  assert.deepEqual(Object.keys(index), ["id", "name", "version", "hash", "root", "nodes", "routes", "tables"]);
  assert.deepEqual(Object.keys(index.nodes), ["continent", "keep", "port", "tavern"]);
  assert.deepEqual(index.nodes.keep, { id: "keep", kind: "map", name: "Greywatch (small keep)", scale: "tactical", parent: "continent", terrain: "hill", map: "keep-map", entries: [{ id: "gate", name: "The gatehouse", kind: "gate" }] });
  assert.equal(index.nodes.port.image, IDS.a2);
  assert.equal(index.nodes.continent.pins.length, 2);
  assert.equal(index.routes[0].id, "road");
  assert.equal(index.tables[0].rows[1].foes[0].monster, "wolf");
  const text = json(index);
  assert.ok(!text.includes(PNG) && !text.includes('"levels"') && !text.includes('"tiles"'), "no picture and no map in the index");
  assert.ok(text.length < 4000, `the index is a few KB (${text.length} bytes)`);
});

test("worldIndex records the index for the DM, and a player is sent nothing of it: not the world, its ids, names, tables or monsters", () => {
  const s = newGame(5), { index } = loaded();
  const r = ok(apply(s, { type: "worldIndex", index }, DM));
  assert.deepEqual(Object.keys(s.world.nodes), ["continent", "keep", "port", "tavern"]);
  assert.equal(s.world.hash, index.hash);
  const told = r.events.find((e) => e.type === "worldLoaded");
  assert.match(told.text, /^The river country, version 1, was loaded: 4 places, 1 route, 1 encounter table\.$/);
  assert.deepEqual(viewEvents(r.events, s, PAT), [], "players are told nothing of a world being loaded");
  const pv = json(view(s, PAT)) + json(playerView(s));
  for (const k of ["river-country", "The river country", "continent", "Greywatch", "road-table", "Wolves on the road", "p-keep", "keep-map", IDS.a1, '"world"']) assert.ok(!pv.includes(k), `no ${k} in a player's view`);
  assert.ok(json(view(s, DM)).includes("road-table"), "the DM's view has it all");
});

// ---------- Done when 2: refusals, each in a plain sentence ----------
test("a pack with a bad map is refused with a plain sentence", () => {
  const p = riverPack();
  p.maps["keep-map"].cellFeet = 10;
  refusedWorld(p, /^Battle map "keep-map" can't be used\. A hex must be 5 feet\.$/);
  const q = riverPack();
  q.maps["tavern-map"] = { format: 2, id: "x", name: "X", grid: "hex", cellFeet: 5, levels: [] };
  refusedWorld(q, /Battle map "tavern-map" can't be used\. It has no levels\./);
  const e = riverPack();
  e.nodes[0].pins[0].entry = "roof";
  refusedWorld(e, /Pin "p-keep" of "continent" names an entry that "keep"'s map does not have: "roof"\./);
});

test("a pack with a monster that is not in the game's content or the table's homebrew is refused; a homebrew id the table has is not", () => {
  const p = riverPack();
  p.tables[0].rows[1].foes.push({ monster: "dire-owlbear-of-doom", count: 2 });
  refusedWorld(p, /names a monster that is not in the game's content or the table's homebrew: "dire-owlbear-of-doom"\./);
  const h = riverPack();
  h.tables[0].rows[1].foes = [{ monster: "hb-ember-folk-quillwraith", count: 1 }];
  refusedWorld(h, /hb-ember-folk-quillwraith/);
  ok(loadWorld(h, { monster: (id) => id === "hb-ember-folk-quillwraith" }));
});

test("a pack with 301 places is refused, and 300 is the limit", () => {
  const many = (n) => {
    const p = riverPack();
    for (let i = p.nodes.length; i < n; i++) p.nodes.push({ id: `hut-${i}`, kind: "scene", parent: "continent", name: `Hut ${i}` });
    return p;
  };
  assert.equal(WORLD_LIMITS.nodes, 300);
  ok(loadWorld(many(300)));
  refusedWorld(many(301), /^It has 301 places; a world has at most 300\.$/);
});

test("a pack whose places nest 9 deep is refused, and 8 is the limit; a loop is refused too", () => {
  const deep = (n) => {
    const p = riverPack();
    for (let i = 2; i <= n; i++) p.nodes.push({ id: `d${i}`, kind: "scene", parent: i === 2 ? "continent" : `d${i - 1}`, name: `Depth ${i}` });
    return p;
  };
  assert.equal(WORLD_LIMITS.depth, 8);
  ok(loadWorld(deep(8)));
  refusedWorld(deep(9), /^Place "d9" is 9 deep; places nest 8 deep at most\.$/);
  const loop = riverPack();
  loop.nodes.push({ id: "a", kind: "scene", parent: "b", name: "A" }, { id: "b", kind: "scene", parent: "a", name: "B" });
  refusedWorld(loop, /Place "a" is inside itself/);
});

test("a pack with a __proto__ key, anywhere, is refused before anything reads it, and so are constructor and prototype", () => {
  const text = JSON.stringify(riverPack()).replace('"name":"The keep"', '"__proto__":{"polluted":true},"name":"The keep"');
  const r = refusedWorld(text, /It has a key "__proto__" at nodes\[0\]\.pins\[0\], which no world pack may have\./);
  assert.equal({}.polluted, undefined);
  assert.equal(r.problems.length, 1);
  for (const k of ["constructor", "prototype"]) {
    const p = riverPack();
    p.maps["keep-map"].levels[0][k] = 1;
    refusedWorld(p, new RegExp(`It has a key "${k}"`));
  }
  const top = JSON.parse('{"__proto__": 1}');
  assert.deepEqual(budgetWorld(top), ['It has a key "__proto__", which no world pack may have.']);
});

test("the budget: control characters, a nesting bomb, a list too long to hold, more than 4 MB, and things that are not data", () => {
  const p = riverPack();
  p.nodes[0].name = "The‮continent";
  refusedWorld(p, /The text at nodes\[0\]\.name has a control character/);
  const nl = riverPack();
  nl.tables[0].rows[1].text = "Wolves.\nMany wolves.";
  ok(loadWorld(nl), "a line break in a text is allowed");
  nl.tables[0].name = "On the\nroad";
  refusedWorld(nl, /control character/);
  // Deeper than any stack: refused by the iterative walk, with no stack overflow.
  let bomb = [];
  const deep = { ...riverPack(), extra: bomb };
  for (let i = 0; i < 200000; i++) { const next = []; bomb.push(next); bomb = next; }
  assert.deepEqual(budgetWorld(deep).filter((x) => /nests deeper/.test(x)).length, 1);
  const wide = riverPack();
  wide.routes = new Array(5e8);
  refusedWorld(wide, /over 4,194,304 bytes/);
  const big = riverPack();
  big.assets.a3 = { kind: "image", data: "A".repeat(WORLD_LIMITS.bytes) };
  refusedWorld(big, /^It is over 4,194,304 bytes as JSON, pictures included; the most for a world pack is 4,194,304 \(4 MB\)\.$/);
  refusedWorld(JSON.stringify(big), /bytes/);
  const fn = riverPack();
  fn.world.name = () => "x";
  refusedWorld(fn, /A function at world\.name is not data/);
  refusedWorld(Object.assign(riverPack(), { maps: new Map() }), /is not plain data/);
  refusedWorld("{not json", /^It is not JSON/);
  refusedWorld([], /It is not a world pack/);
  const long = riverPack();
  long.nodes[0].name = "x".repeat(61);
  refusedWorld(long, /The name at nodes\[0\]\.name is 61 letters long; the most is 60\./);
});

test("the linter: unknown keys, ids, pins, routes, tables and pictures, each in its own sentence", () => {
  const cases = [
    [(p) => { p.nodes[0].secret = 1; }, /Place "continent" has "secret", which a world pack does not use there\./],
    [(p) => { p.format = "hextable-pack"; }, /its format must be "hextable-world", v 1/],
    [(p) => { p.world.root = "nowhere"; }, /The world's root is not a place of the pack: "nowhere"\./],
    [(p) => { p.nodes[1].parent = undefined; }, /Place "keep" is under no place/],
    [(p) => { p.nodes.push({ ...p.nodes[1] }); }, /Place id "keep" is used twice\./],
    [(p) => { p.nodes[2].pins[0].id = "p-keep"; }, /Pin id "p-keep" is used twice\./],
    [(p) => { p.nodes[0].pins[0].at = [5000, 10]; }, /Pin "p-keep" of "continent" is not on its picture/],
    [(p) => { p.nodes[0].pins[1].to = "atlantis"; }, /leads to a place that is not in the pack: "atlantis"/],
    [(p) => { p.nodes[1].map = "lost-map"; }, /Place "keep" names a battle map the pack does not have: "lost-map"\./],
    [(p) => { p.nodes[0].image = "a9"; }, /Place "continent" names a picture the pack does not have: "a9"\./],
    [(p) => { p.assets.a1.data = "!!!!"; }, /Picture "a1": its data is not base64\./],
    [(p) => { p.assets.a1.data = btoa("<svg onload=alert(1)></svg>"); }, /Picture "a1" is not a PNG, JPEG or WebP picture\./],
    [(p) => { p.assets.a3 = { kind: "image", data: PNG }; }, /Picture "a3" is used by no place and no map; leave it out\./],
    [(p) => { p.routes[0].mode = "teleport"; }, /Route "road" has mode "teleport"/],
    [(p) => { p.routes[0].to = { node: "port", pin: "p-nowhere" }; }, /Route "road" goes to a pin that "port" does not have: "p-nowhere"\./],
    [(p) => { p.routes[0].back = { node: "keep", entry: "roof" }; }, /Route "road" comes back to an entry that "keep" does not have: "roof"\./],
    [(p) => { p.routes[0].encounters.table = "sea-table"; }, /names an encounter table the pack does not have: "sea-table"/],
    [(p) => { p.routes[0].wayside = ["nowhere-map"]; }, /neither the pack's nor a stock map/],
    [(p) => { delete p.routes[0].miles; }, /gives no miles, hours or minutes/],
    [(p) => { p.routes[0].terrain = "lava"; }, /Route "road" has terrain "lava"/],
    [(p) => { p.tables[0].rows[2].range = [18, 21]; }, /18 to 21 is not inside what 1d20 rolls \(1 to 20\)/],
    [(p) => { p.tables[0].rows[2].range = [17, 20]; }, /its range overlaps another row's/],
    [(p) => { p.tables[0].rows[1].foes[0].count = "lots"; }, /a foe's "count" is a whole number from 1 to 50 or dice/],
    [(p) => { p.maps["keep-map"].levels[0].image = { asset: "nowhere", feet: [10, 10], origin: [0, 0] }; }, /level "ground" has a background that names no picture of the pack/],
    [(p) => { p.maps["keep-map"].holding = true; }, /marked as a holding map/],
  ];
  for (const [change, words] of cases) { const p = riverPack(); change(p); refusedWorld(p, words); }
  // A level's background may name a picture of the pack.
  const bg = riverPack();
  bg.maps["keep-map"].levels[0].image = { asset: "a1", feet: [100, 100], origin: [0, 0] };
  const st = storedWorld(ok(loadWorld(bg)).pack, IDS);
  assert.equal(st.maps["keep-map"].levels[0].image.asset, IDS.a1, "rewritten to the store's id");
  // A pin-to-pin route on a map with a scale needs no distance.
  const ferry = riverPack();
  ferry.nodes[2].pins.push({ id: "p-temple", at: [1500, 400], name: "The temple" });
  ferry.routes.push({ id: "ferry", node: "port", from: "p-tavern", to: "p-temple", mode: "boat" });
  ok(loadWorld(ferry));
  assert.deepEqual(lintWorld(riverPack()), []);
});

test("assetBytesOf reads base64 without atob, and refuses what is not", () => {
  assert.deepEqual([...assetBytesOf(btoa("hello"))], [...new TextEncoder().encode("hello")]);
  assert.deepEqual([...assetBytesOf(btoa("hi!"))], [104, 105, 33]);
  assert.equal(assetBytesOf("abc"), null);
  assert.equal(assetBytesOf("ab$="), null);
});

// ---------- worldIndex: the engine's side ----------
test("worldIndex is the DM's; a player's and a bad index are refused and change nothing; it is refused in a fight", () => {
  const s = newGame(5), { index } = loaded();
  refused(s, { type: "worldIndex", index }, /Only the DM can load a world\./, PAT);
  refused(s, { type: "worldIndex", index: { ...index, root: "nowhere" } }, /That world can't be used\. The root of the world is not one of its places\./);
  refused(s, { type: "worldIndex", index: { ...index, nodes: { ...index.nodes, keep: { ...index.nodes.keep, gone: true } } } }, /carries a mark only the table makes/);
  refused(s, { type: "worldIndex" }, /The index of a world is a record\./);
  const deep = structuredClone(index);
  for (let i = 1; i <= 8; i++) deep.nodes[`d${i}`] = { id: `d${i}`, kind: "scene", name: "D", parent: i === 1 ? "continent" : `d${i - 1}` };
  refused(s, { type: "worldIndex", index: deep }, /nests more than 8 deep/);
  ok(apply(s, { type: "startEncounter", center: { q: 2, r: 0 }, radius: 10 }, DM));
  refused(s, { type: "worldIndex", index }, /A world cannot be loaded in the middle of a fight\./);
});

test("replacing a world: a newer version keeps the places kept at the table, marks those it lacks gone, keeps places made at the table; an older one is refused", () => {
  const { s } = withWorld();
  ok(apply(s, { type: "loadMap", node: "continent" }, DM));
  ok(apply(s, fillMap(s, { type: "enter", pin: "p-keep" }, loaded().stored), DM));
  assert.equal(s.place, "keep");
  ok(apply(s, { type: "leave" }, DM));
  assert.ok(s.parked.keep, "the keep is kept as left");
  ok(apply(s, { type: "nodeAdd", node: { name: "The mill", kind: "scene", parent: "continent" } }, DM));
  const v2 = riverPack();
  v2.world.version = 2;
  v2.nodes = v2.nodes.filter((n) => n.id !== "keep");
  v2.nodes[0].pins = v2.nodes[0].pins.filter((p) => p.to !== "keep");
  v2.routes = [];
  delete v2.maps["keep-map"];
  const w2 = loaded(v2);
  const r = ok(apply(s, { type: "worldIndex", index: w2.index }, DM));
  assert.equal(s.world.version, 2);
  assert.equal(s.world.nodes.keep.gone, true, "the keep is kept, marked gone");
  assert.equal(s.world.nodes["the-mill"].added, true, "a place made at the table is kept");
  assert.ok(s.parked.keep, "its parked record stays");
  assert.ok(s.world.came.keep === "gate", "the entry the party came by is kept");
  assert.match(r.events.at(-1).text, /was loaded in place of the world this table had: .* Greywatch \(small keep\) is not in it: kept as left, marked gone\./);
  // An older version is refused.
  refused(s, { type: "worldIndex", index: loaded().index }, /This table has version 2 of The river country; a world can be replaced by the same version or a newer one, not an older one\./);
  // A pack whose place has the id of one made at the table is refused.
  const v3 = riverPack();
  v3.world.version = 3;
  v3.nodes.push({ id: "the-mill", kind: "scene", parent: "continent", name: "Mill" });
  refused(s, { type: "worldIndex", index: loaded(v3).index }, /The pack has a place "the-mill", and a place of that id was made at this table \(The mill\)\./);
  // A kept battle place the new pack makes a navigation map is refused.
  const v4 = riverPack();
  v4.world.version = 4;
  v4.nodes[1] = { id: "keep", kind: "scene", parent: "continent", name: "The keep" };
  v4.nodes[0].pins[0] = { id: "p-keep", at: [1, 1], name: "The keep", to: "keep" };
  v4.routes = []; delete v4.maps["keep-map"];
  refused(s, { type: "worldIndex", index: loaded(v4).index }, /is kept at this table as a battle map, and the new pack makes it a navigation map or a scene/);
});

// ---------- Done when 3: the fill ----------
test("the fill: a client's own map in an enter is replaced by the pack's; nothing is filled for a place in play or kept, and a reset gets the prepared map", () => {
  const { s, w } = withWorld();
  ok(apply(s, { type: "loadMap", node: "continent" }, DM));
  const evil = tavernMap();
  evil.name = "A map the client made";
  const a = { type: "enter", pin: "p-keep", map: evil };
  const filled = fillMap(s, a, w.stored);
  assert.notEqual(filled, a, "a new action");
  assert.equal(a.map, evil, "the action given is not changed");
  assert.equal(filled.map.name, "Greywatch (small keep)", "the pack's map, not the client's");
  assert.deepEqual(filled.map, w.stored.maps["keep-map"]);
  ok(apply(s, filled, DM));
  assert.equal(s.map.name, "Greywatch (small keep)");
  assert.equal(s.place, "keep");
  // Back up, and in again: the keep is kept, so no map is needed, and the client's is still dropped.
  ok(apply(s, fillMap(s, { type: "leave", map: evil }, w.stored), DM));
  assert.deepEqual(needsMap(s, { type: "enter", pin: "p-keep" }, w.stored), { touch: true, node: "keep", key: null });
  assert.equal(fillMap(s, { type: "enter", pin: "p-keep", map: evil }, w.stored).map, undefined);
  // A reset of a kept place gets the prepared map.
  assert.equal(fillMap(s, { type: "resetPlace", node: "keep", map: evil }, w.stored).map.name, "Greywatch (small keep)");
  assert.equal(fillMap(s, { type: "goTo", node: "keep", stale: "reset" }, w.stored).map.name, "Greywatch (small keep)");
  assert.equal(fillMap(s, { type: "goTo", node: "keep", stale: "keep", map: evil }, w.stored).map, undefined);
  // A navigation map needs none; an unknown pin gets none (the engine refuses it).
  assert.equal(fillMap(s, { type: "enter", pin: "p-port", map: evil }, w.stored).map, undefined);
  assert.equal(fillMap(s, { type: "enter", pin: "p-nowhere", map: evil }, w.stored).map, undefined);
  // A plain loadMap, and any other action, are not touched.
  const plain = { type: "loadMap", map: evil };
  assert.equal(fillMap(s, plain, w.stored), plain);
  const move = { type: "move", actor: "fighter", to: { q: 0, r: 0 }, map: evil };
  assert.equal(fillMap(s, move, w.stored), move);
  // A place made at the table is not the pack's: the DM's own map stays.
  ok(apply(s, { type: "nodeAdd", node: { name: "The mill", kind: "map", parent: "continent" }, map: tavernMap() }, DM));
  ok(apply(s, { type: "forgetPlace", node: "the-mill" }, DM));
  const mine = { type: "loadMap", node: "the-mill", map: tavernMap() };
  assert.equal(fillMap(s, mine, w.stored), mine);
  // With no pack at all (a table with no world), a client's map for a pack place is still dropped.
  assert.equal(fillMap(s, { type: "enter", pin: "p-keep", map: evil }, null).map, undefined);
});

// ---------- npm run world ----------
test("npm run world checks a file with the table's own checks, lends a homebrew pack's monsters, and says why it refuses", async () => {
  const { main } = await import("../../../scripts/world.mjs");
  const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const dir = mkdtempSync(join(tmpdir(), "world-cli-"));
  const lines = { out: [], err: [] };
  const wo = process.stdout.write, we = process.stderr.write;
  process.stdout.write = (s) => { lines.out.push(String(s)); return true; };
  process.stderr.write = (s) => { lines.err.push(String(s)); return true; };
  try {
    const file = (name, data) => { const f = join(dir, name); writeFileSync(f, typeof data === "string" ? data : JSON.stringify(data)); return f; };
    assert.equal(main([file("ok.json", riverPack())]), 0);
    assert.match(lines.out.join(""), /The river country \(version 1\): ok\n {2}4 places, 2 battle maps, 1 route, 1 encounter table, 2 pictures/);
    const hb = riverPack();
    hb.tables[0].rows[1].foes = [{ monster: "hb-cli-wolf", count: 1 }];
    assert.equal(main([file("hb.json", hb)]), 1);
    assert.match(lines.err.join(""), /problem: Encounter table "road-table", row 2 names a monster that is not in the game's content or the table's homebrew: "hb-cli-wolf"\./);
    const { CONTENT } = await import("../src/content/index.js");
    const wolf = { ...structuredClone(CONTENT.monsters.wolf), id: "hb-cli-wolf", name: "Grey Wolf", source: "homebrew:cli", checked: false, text: "A wolf." };
    const pack = file("pack.json", { format: "hextable-pack", v: 1, pack: { id: "cli", name: "Cli", version: 1, license: "CC0", attribution: "A test." }, monsters: [wolf] });
    assert.equal(main([file("hb.json", hb), "--pack", pack]), 0, lines.err.join(""));
    assert.equal(main([file("proto.json", JSON.stringify(riverPack()).replace('"name":"The keep"', '"__proto__":1,"name":"The keep"'))]), 1);
    assert.equal(main([]), 2);
    assert.equal(main(["a.json", "--nope"]), 2);
  } finally {
    process.stdout.write = wo; process.stderr.write = we;
    rmSync(dir, { recursive: true, force: true });
  }
});
