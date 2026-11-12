// Regions: a place revealed room by room (task M3 of docs/specs/maps-and-objects.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, inFight } from "../src/engine.js";
import * as H from "../src/hex.js";
import { lintMap, newMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";
import { clipWall, view, viewEvents } from "../src/view.js";
import { edgeSegment } from "../src/walls.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const rows = (qs, rs) => qs.flatMap((q) => rs.map((r) => `${q},${r}`));

// A hall (q -3..0, rows -1..1), a vault east of it behind a wall with one door (q 1..4), and a
// nook south of the hall with nothing between them (row 2). A long wall runs along the north of both rooms.
const HALL = rows([-3, -2, -1, 0], [-1, 0, 1]), VAULT = rows([1, 2, 3, 4], [-1, 0, 1]), NOOK = rows([-3, -2, -1, 0], [2]);
function dungeon() {
  const tiles = Object.fromEntries([...HALL, ...VAULT, ...NOOK].map((k) => [k, { t: "stone" }]));
  const walls = [{ id: "north", level: "ground", a: [-20, -6.5], b: [30, -6.5], kind: "wall" }];
  for (const r of [-1, 0, 1, 2]) for (const edge of [0, 1]) {
    const n = { q: 1, r: r - edge };
    if (!tiles[H.col(n)] || (r === 0 && edge === 0)) continue;                 // the door stands on 0,0 -> 1,0
    const [a, b] = edgeSegment({ q: 0, r }, edge);
    walls.push({ id: `div${r}${edge}`, level: "ground", a, b, kind: "wall" });
  }
  return newMap({ id: "dungeon", name: "The dungeon", starts: [{ q: -2, r: -1 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }], walls,
    objects: [{ id: "door", def: "door-wooden", level: "ground", at: { q: 0, r: 0 }, edge: 0, state: "closed", dc: { pick: 19 } },
      { id: "gate", def: "portcullis", level: "ground", at: { q: 3, r: 0 }, edge: 0, state: "lowered" }],
    regions: [{ id: "hall", name: "Entrance hall", level: "ground", hexes: [...HALL] }, { id: "vault", name: "The vault", level: "ground", hexes: [...VAULT] }, { id: "nook", name: "A nook", level: "ground", hexes: [...NOOK] }] });
}
function delve({ engage = false } = {}) {
  const s = newGame(6);
  ok(apply(s, { type: "loadMap", map: dungeon() }, DM));
  apply(s, { type: "setting", key: "autoEngage", value: engage }, DM);
  apply(s, { type: "claim", entity: "fighter", user: "pat", userName: "Pat" }, PAT);
  for (const [id, q, r] of [["fighter", -2, 0], ["rogue", -3, 0], ["cleric", -3, -1], ["wizard", -2, -1]]) s.entities[id].pos = { q, r, z: 0 };      // the four start hexes, in a known order
  const gob = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 3, r: 0 } }, DM)).events[0].id;
  return { s, gob };
}
const region = (s, id) => s.map.regions.find((r) => r.id === id);
// Everything a player would be sent after an action: their view and their events.
const sent = (s, res) => JSON.stringify([view(s, PAT), viewEvents(res?.events ?? [], s, PAT)]);
const secret = (text, gob) => [`"${gob}"`, "Goblin", '"3,0"', '"1,0"', "gate", "Portcullis", "vault", "The vault", "\"dc\""].filter((w) => text.includes(w));

test("a map starts with only the party's own region revealed, and players are sent nothing of the rest", () => {
  const { s, gob } = delve();
  assert.deepEqual(s.map.regions.map((r) => [r.id, !!r.revealed]), [["hall", true], ["vault", false], ["nook", false]]);
  const v = view(s, PAT);
  assert.deepEqual(Object.keys(v.map.levels[0].tiles).sort(), [...HALL].sort());
  assert.deepEqual(v.map.regions.map((r) => r.id), ["hall"]);
  assert.deepEqual(v.map.objects.map((o) => o.id), ["door"]);            // the door touches the hall; the gate does not
  assert.equal(v.map.objects[0].dc, undefined);
  assert.equal(v.entities[gob], undefined);
  assert.deepEqual(v.map.starts, []);
  assert.deepEqual(secret(sent(s), gob), []);
  assert.equal(view(s, DM), s);                                           // the DM sees the lot
});

test("a wall is sent only where it runs beside what has been shown", () => {
  const { s } = delve();
  const north = (w) => w.a[1] === -6.5 && w.b[1] === -6.5;
  const pieces = view(s, PAT).map.walls.filter(north);
  assert.equal(pieces.length, 4);                                         // one stretch beside each hall hex of the top row
  for (const w of pieces) assert.ok(Math.max(w.a[0], w.b[0]) < 0, JSON.stringify(w));
  assert.deepEqual(clipWall({ id: "w", level: "g", kind: "wall", a: [-10, 0], b: [10, 0] }, [[0, 1]]).map((w) => [w.id, Math.round(w.a[0] * 100) / 100, Math.round(w.b[0] * 100) / 100]), [["w~0", -2.73, 2.73]]);
  assert.deepEqual(clipWall({ id: "w", level: "g", kind: "wall", a: [-1, 0], b: [1, 0] }, [[0, 1]]), [{ id: "w", level: "g", kind: "wall", a: [-1, 0], b: [1, 0] }]);
  assert.deepEqual(clipWall({ id: "w", level: "g", kind: "wall", a: [-1, 0], b: [1, 0] }, [[0, 9]]), []);
  ok(apply(s, { type: "revealRegion", region: "vault" }, DM));
  assert.ok(view(s, PAT).map.walls.some((w) => north(w) && Math.max(w.a[0], w.b[0]) > 5));
});

test("standing beside an open way into a region reveals it; a shut door does not", () => {
  const { s, gob } = delve();
  // Beside the shut door: the vault stays dark.
  const near = ok(apply(s, { type: "move", actor: "fighter", to: { q: 0, r: 0 } }, PAT));
  assert.equal(region(s, "vault").revealed, undefined);
  assert.deepEqual(secret(sent(s, near), gob), []);
  // One step toward the nook, which has no wall: it is revealed as the fighter arrives beside it.
  const res = ok(apply(s, { type: "move", actor: "fighter", to: { q: 0, r: 1 } }, PAT));
  assert.equal(region(s, "nook").revealed, true);
  assert.deepEqual(viewEvents(res.events, s, PAT).map((e) => e.type), ["moved", "region"]);
  assert.deepEqual(viewEvents(res.events, s, PAT)[1], { type: "region", region: "nook", name: "A nook" });
  assert.equal(Object.keys(view(s, PAT).map.levels[0].tiles).length, HALL.length + NOOK.length);
  assert.deepEqual(secret(sent(s, res), gob), []);
});

test("opening a door reveals the room behind it and whoever is in it", () => {
  const { s, gob } = delve();
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 0, r: 0 } }, PAT));
  const res = ok(apply(s, { type: "use", actor: "fighter", object: "door", verb: "open" }, PAT));
  assert.equal(region(s, "vault").revealed, true);
  assert.deepEqual(viewEvents(res.events, s, PAT).map((e) => e.type), ["object", "region"]);
  const v = view(s, PAT);
  assert.equal(v.entities[gob].name, s.entities[gob].name);
  assert.deepEqual(v.map.objects.map((o) => o.id), ["door", "gate"]);
  assert.ok(v.map.levels[0].tiles["3,0"]);
  assert.equal(JSON.stringify(v).includes("\"dc\""), false);                  // still never a DC
});

test("a door opened from the far side shows nothing until someone from the party is there to look", () => {
  const { s, gob } = delve();
  ok(apply(s, { type: "place", actor: gob, to: { q: 1, r: 0 } }, DM));
  const res = ok(apply(s, { type: "use", actor: gob, object: "door", verb: "open" }, DM));
  assert.equal(region(s, "vault").revealed, undefined);
  assert.deepEqual(viewEvents(res.events, s, PAT), []);                   // who opened it is not theirs to know
  assert.deepEqual(secret(sent(s, res).replace('"1,0"', ""), gob), []);
  assert.equal(view(s, PAT).map.objects[0].state, "open");                // but the door they can see stands open
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 0, r: 0 } }, PAT));
  assert.equal(region(s, "vault").revealed, true);
  assert.ok(view(s, PAT).entities[gob]);
});

test("to a player, a creature or an object somewhere unseen does not exist", () => {
  const { s, gob } = delve(), before = JSON.stringify(s);
  const real = apply(s, { type: "attack", actor: "fighter", target: gob, attack: "javelin" }, PAT), fake = apply(s, { type: "attack", actor: "fighter", target: "m999", attack: "javelin" }, PAT);
  assert.deepEqual(real, fake);
  assert.equal(real.error, "No such creature.");
  ok(apply(s, { type: "place", actor: "fighter", to: { q: 0, r: 0 } }, DM));
  const still = JSON.stringify(s);
  assert.deepEqual(apply(s, { type: "use", actor: "fighter", object: "gate", verb: "lift" }, PAT), apply(s, { type: "use", actor: "fighter", object: "nope", verb: "lift" }, PAT));
  assert.equal(JSON.stringify(s), still);
  assert.notEqual(before, still);
});

test("what waits in an unseen room stays out of a fight until the room is revealed", () => {
  const { s, gob } = delve();
  const lurk = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: -1, r: 2 } }, DM)).events[0].id;      // in the nook
  const start = ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, DM));
  assert.deepEqual(s.encounter.order.map((o) => o.id).sort(), ["cleric", "fighter", "rogue", "wizard"]);
  const v = view(s, PAT);
  assert.deepEqual(Object.keys(v.encounter.arena).sort(), [...HALL].sort());            // the arena they are sent has no unseen hexes
  assert.deepEqual(secret(sent(s, start), gob), []);
  const res = ok(apply(s, { type: "revealRegion", region: "vault" }, DM));
  assert.ok(inFight(s, gob));
  assert.equal(inFight(s, lurk), false);
  assert.deepEqual(viewEvents(res.events, s, PAT).map((e) => e.type), ["region", "joined"]);
});

test("walking near an unseen room starts no fight; walking up to its open side does", () => {
  const { s } = delve({ engage: true });
  const lurk = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: -1, r: 2 } }, DM)).events[0].id;
  ok(apply(s, { type: "move", actor: "fighter", to: { q: -1, r: 0 } }, PAT));           // two hexes from it, nothing between, but unseen
  assert.equal(s.encounter, null);
  const res = ok(apply(s, { type: "move", actor: "fighter", to: { q: -2, r: 1 } }, PAT));
  assert.ok(inFight(s, lurk));
  assert.deepEqual(res.events.map((e) => e.type).slice(0, 3), ["moved", "region", "encounterStart"]);
});

test("the DM can reveal a region or take it back, and regions are edited like the rest of the map", () => {
  const { s } = delve();
  assert.equal(apply(s, { type: "revealRegion", region: "vault" }, PAT).error, "Only the DM can reveal a place.");
  assert.equal(apply(s, { type: "revealRegion", region: "hall" }, DM).error, "Entrance hall is already revealed.");
  assert.equal(apply(s, { type: "revealRegion", region: "hall", revealed: false }, DM).error, "Someone from the party is in Entrance hall.");
  ok(apply(s, { type: "revealRegion", region: "vault" }, DM));
  ok(apply(s, { type: "revealRegion", region: "vault", revealed: false }, DM));
  assert.equal(view(s, PAT).map.levels[0].tiles["3,0"], undefined);
  // A new region takes its hexes from the one that had them.
  ok(apply(s, { type: "mapEdit", ops: [{ op: "region", region: { name: "Strongroom", level: "ground", hexes: ["4,-1", "4,0", "4,1"] } }] }, DM));
  assert.deepEqual(s.map.regions.map((r) => [r.id, r.hexes.length]), [["hall", 12], ["vault", 9], ["nook", 4], ["r1", 3]]);
  const twice = dungeon(); twice.regions[1].hexes.push("0,0");
  assert.match(lintMap(twice).join(), /Hex 0,0 is in two regions/);
  const off = dungeon(); off.regions[1].hexes.push("9,9");
  assert.match(lintMap(off).join(), /not a hex of its level/);
});

test("a map with no regions is sent whole, as before", () => {
  const s = newGame(6), v = view(s, PAT);
  assert.deepEqual(v.map.levels[0].tiles, s.map.levels[0].tiles);
  assert.deepEqual(v.map.regions, []);
});
