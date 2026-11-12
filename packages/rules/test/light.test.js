// Light (task S4 of docs/specs/sight.md): ambient light per level and region, sources on objects
// and carried by creatures, worked out per place by line of sight.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import * as H from "../src/hex.js";
import { lintMap, newMap } from "../src/map.js";
import { lintPack } from "../src/content/schema.js";
import { PACKS } from "../src/content/index.js";
import { newGame } from "../src/scenario.js";
import { ambientAt, lightAt, lightSources } from "../src/sight.js";
import { view } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const at = (q, r, z = 0) => ({ q, r, z });

// A dark stone floor, radius 12, with whatever walls and objects are given. The fighter is Pat's.
function cave({ walls = [], objects = [], light = "dark", regions = [] } = {}) {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 12).map((h) => [H.col(h), { t: "stone" }]));
  const s = newGame(31);
  ok(apply(s, { type: "loadMap", map: newMap({ id: "c", name: "Cave", starts: [{ q: -10, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles, ...(light ? { light } : {}) }], walls, objects, regions }) }, DM));
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  for (const [id, q, r] of [["fighter", 0, 0], ["rogue", -10, 2], ["cleric", -10, 3], ["wizard", -9, 3]]) s.entities[id].pos = at(q, r);
  return s;
}
const wallAt = (x, y0, y1, kind = "wall", id = `w${x}${kind}`) => ({ id, level: "ground", a: [x, y0], b: [x, y1], kind });

test("a torch lights 20 feet bright and 20 more dim, and nothing past that", () => {
  const s = cave();
  assert.equal(lightAt(s, at(0, 0)), "dark");
  const res = ok(apply(s, { type: "setLight", actor: "fighter", item: "torch" }, DM));
  assert.deepEqual(res.events, [{ type: "light", id: "fighter", bright: 20, dim: 20, item: "torch", name: "Torch" }]);
  assert.deepEqual(s.entities.fighter.light, { bright: 20, dim: 20, item: "torch" });
  for (const [q, want] of [[0, "bright"], [3, "bright"], [4, "bright"], [5, "dim"], [8, "dim"], [9, "dark"], [11, "dark"]]) assert.equal(lightAt(s, at(q, 0)), want, `${q * 5} ft`);
  // It goes where the bearer goes.
  s.entities.fighter.pos = at(-8, 0);
  assert.equal(lightAt(s, at(0, 0)), "dim");
  assert.equal(lightAt(s, at(4, 0)), "dark");
  ok(apply(s, { type: "setLight", actor: "fighter", item: null }, DM));
  assert.equal(s.entities.fighter.light, undefined);
  assert.equal(lightAt(s, at(-8, 0)), "dark");
});

test("light does not pass a wall or a shut door, and does pass a window, a rail and an open door", () => {
  // A wall from north to south just east of the fighter's column, with a door in it at row 0.
  const e = 5 / (2 * Math.sqrt(3)), north = wallAt(2.5, -100, -e, "wall", "n"), south = wallAt(2.5, e, 100, "wall", "s");      // the door fills the gap
  const door = { id: "door", def: "door-wooden", level: "ground", at: { q: 0, r: 0 }, edge: 0, state: "closed" };
  const s = cave({ walls: [north, south], objects: [door] });
  ok(apply(s, { type: "setLight", actor: "fighter", item: "torch" }, DM));
  assert.equal(lightAt(s, at(-1, 0)), "bright");
  assert.equal(lightAt(s, at(2, 0)), "dark");                                   // behind the shut door
  ok(apply(s, { type: "use", actor: "fighter", object: "door", verb: "open" }, DM));
  assert.equal(lightAt(s, at(2, 0)), "bright");                                 // the cache noticed the door
  assert.equal(lightAt(s, at(2, -3)), "dark");                                  // still behind the wall
  for (const kind of ["window", "rail"]) {
    const t = cave({ walls: [wallAt(2.5, -100, 100, kind)] });
    ok(apply(t, { type: "setLight", actor: "fighter", item: "torch" }, DM));
    assert.equal(lightAt(t, at(2, 0)), "bright", kind);
  }
  const curtain = cave({ walls: [wallAt(2.5, -100, 100, "curtain")] });
  ok(apply(curtain, { type: "setLight", actor: "fighter", item: "torch" }, DM));
  assert.equal(lightAt(curtain, at(2, 0)), "dark");                             // a curtain blocks sight, so light
});

test("ambient light comes from the level, a region may override it, and the default is bright", () => {
  assert.equal(lightAt(newGame(3), at(0, 0)), "bright");                         // the valley: nothing set, daylight
  const room = H.range({ q: 6, r: 0 }, 2).map(H.col);
  const s = cave({ light: "dim", regions: [{ id: "lit", name: "Lit hall", level: "ground", hexes: room, light: "bright", revealed: true }] });
  assert.equal(ambientAt(s.map, at(0, 0)), "dim");
  assert.equal(lightAt(s, at(6, 0)), "bright");
  assert.equal(lightAt(s, at(-6, 0)), "dim");
  // The DM changes a level's light with a map edit, and can put it back to the default.
  ok(apply(s, { type: "mapEdit", ops: [{ op: "level", level: { id: "ground", light: "dark" } }] }, DM));
  assert.equal(lightAt(s, at(-6, 0)), "dark");
  ok(apply(s, { type: "mapEdit", ops: [{ op: "level", level: { id: "ground", name: "Renamed" } }] }, DM));
  assert.equal(s.map.levels[0].light, "dark");                                  // leaving it out keeps it
  ok(apply(s, { type: "mapEdit", ops: [{ op: "level", level: { id: "ground", light: null } }] }, DM));
  assert.equal(lightAt(s, at(-6, 0)), "bright");
  assert.equal(apply(s, { type: "mapEdit", ops: [{ op: "level", level: { id: "ground", light: "gloomy" } }] }, DM).error, 'That change can\'t be made. Level "ground" has light "gloomy"; it can be bright, dim, dark.');
  const bad = newMap({ levels: [{ id: "g", name: "G", z: 0, tiles: { "0,0": { t: "stone" } } }], regions: [{ id: "r", name: "R", level: "g", hexes: ["0,0"], light: 3 }] });
  assert.match(lintMap(bad).join(), /Region "r" has light "3"/);
});

test("a brazier is a light on the map that can be put out and lit again", () => {
  const s = cave({ objects: [{ id: "b", def: "brazier", level: "ground", at: { q: 4, r: 0 }, state: "lit" }] });
  assert.deepEqual(lightSources(s).map((x) => [x.object, x.bright, x.dim]), [["b", 20, 20]]);
  assert.equal(lightAt(s, at(0, 0)), "bright");
  assert.equal(lightAt(s, at(-3, 0)), "dim");
  s.entities.fighter.pos = at(3, 0);
  ok(apply(s, { type: "use", actor: "fighter", object: "b", verb: "douse" }, DM));
  assert.equal(lightAt(s, at(4, 0)), "dark");
  ok(apply(s, { type: "use", actor: "fighter", object: "b", verb: "light" }, DM));
  assert.equal(lightAt(s, at(4, 0)), "bright");
  // Only a thing in a hex gives light, and only in feet.
  const srd = PACKS[0], brazier = srd.objects.find((o) => o.id === "brazier");
  const lint = (change) => { const o = structuredClone(brazier); change(o); return lintPack({ pack: srd.pack, objects: [o] }).join(" | "); };
  assert.equal(lint(() => {}), "");
  assert.match(lint((o) => { o.states.lit.light = { bright: 7, dim: 0 }; }), /light must be/);
  assert.match(lint((o) => { o.states.lit.light = { bright: 0, dim: 0 }; }), /light must be/);
  assert.match(lint((o) => { o.states.lit.light = { bright: 20, far: 5 }; }), /light must be/);
  assert.match(lint((o) => { o.kind = "door"; }), /only a thing in a hex can give light/);
});

test("handing out light is the DM's, by item or by radius, and a player sees who carries one", () => {
  const s = cave({ light: null });
  assert.equal(apply(s, { type: "setLight", actor: "fighter", item: "torch" }, PAT).error, "Only the DM can hand out light.");
  assert.equal(apply(s, { type: "setLight", actor: "fighter", item: "sun" }, DM).error, "Unknown light.");
  assert.equal(apply(s, { type: "setLight", actor: "fighter", light: { bright: 7, dim: 0 } }, DM).error, "A light is Bright and Dim radii in feet, multiples of 5.");
  assert.equal(apply(s, { type: "setLight", actor: "fighter", item: null }, DM).error, "Brenna carries no light.");
  ok(apply(s, { type: "setLight", actor: "fighter", item: "hooded-lantern-lowered" }, DM));
  assert.equal(lightAt({ ...s, map: { ...s.map, levels: [{ ...s.map.levels[0], light: "dark" }] } }, at(0, 0)), "dim");   // a lowered hood: Dim Light only
  const gob = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 3, r: 0 } }, DM)).events[0].id;
  ok(apply(s, { type: "setLight", actor: gob, light: { bright: 15, dim: 30 } }, DM));
  assert.deepEqual(view(s, PAT).entities[gob].light, { bright: 15, dim: 30 });
  assert.equal(apply(s, { type: "setLight", actor: "fighter", item: null }, DM).ok, true);
});
