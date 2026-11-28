// Plant Growth (#923, docs/specs/rules-expansion.md, "Build notes: Plant Growth (#923)"): the Action cast is Overgrowth. Its `overgrow` step makes the grass and forest tiles of a
// 100-foot sphere `overgrown` (a change of the map, as a tide's is), and a creature on foot spends 4 feet of movement for every 1 foot there. Played through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, moveOptions } from "../src/engine.js";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { newGame } from "../src/scenario.js";
import { migrate } from "../src/migrate.js";
import { lintMap, newMap, overgrow, VEGETATION } from "../src/map.js";
import { view } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);

// Grass at q -4 to 30 and r -4 to 4, with a few cells made otherwise round the wizard at (0,0): stone west, forest south (0,1), water and a stone far off.
// East at (40,0) lies grass beyond the sphere (the cast is aimed at q 10: the sphere reaches q 30).
function field() {
  const tiles = {};
  for (let q = -4; q <= 30; q++) for (let r = -4; r <= 4; r++) tiles[`${q},${r}`] = { t: "grass" };
  tiles["-1,0"] = { t: "stone" };
  tiles["0,1"] = { t: "forest" };
  tiles["5,3"] = { t: "water", depth: 10 };
  tiles["6,3"] = { t: "stone" };
  tiles["40,0"] = { t: "grass" };
  return newMap({ id: "field", name: "Field", starts: [{ q: 0, r: 0 }], levels: [{ id: "g", name: "G", z: 0, tiles }] });
}
function meadow({ druid = true } = {}) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (id !== "wizard") delete s.entities[id];
  ok(apply(s, { type: "loadMap", map: field() }, DM));
  s.settings.autoEngage = false;
  Object.assign(s.entities.wizard, { pos: { q: 0, r: 0, z: 0 }, slots: { 3: 3, 4: 1 }, slotsMax: { 3: 3, 4: 1 }, hp: 500, maxHp: 500 });
  s.entities.wizard.spells.push("plant-growth", "freedom-of-movement");
  return s;
}
const cast = (s, extra = {}) => apply(s, { type: "cast", actor: "wizard", spell: "plant-growth", hex: { q: 10, r: 0 }, slot: 3, ...extra }, DM);
const tile = (s, q, r = 0) => s.map.levels[0].tiles[`${q},${r}`];
const costTo = (s, id, q, r = 0) => [...moveOptions(s, s.entities[id]).values()].find((v) => v.h.q === q && v.h.r === r)?.cost;
const spawn = (s, monster, at) => {
  const id = ok(apply(s, { type: "spawn", monster, at: { q: 4, r: 4 } }, DM)).events.find((e) => e.type === "spawned").id;
  Object.assign(s.entities[id], { pos: { ...at, z: at.z ?? 0 }, hp: 5000, maxHp: 5000 });
  return id;
};

test("the entry: assist, checked, a sphere of 100 feet within 150, an overgrow step, and it lints and reads", () => {
  const sp = SPELLS["plant-growth"];
  assert.equal(sp.def.tier, "assist");
  assert.equal(sp.def.checked, true);
  assert.equal(sp.aim, "area");
  assert.deepEqual(sp.def.target, { area: { shape: "sphere", size: 100 } });
  assert.equal(sp.def.range, 150);
  assert.ok(sp.def.effects.some((st) => st.overgrow === true));
  assert.deepEqual(lintEntry("spells", sp.def, { pack: "t" }).filter((x) => !/strict|homebrew/.test(x) && !/source|name of an SRD/.test(x)), []);
  const text = readEntry("spell", sp.def).lines.join("\n");
  assert.match(text, /4 feet of movement for every 1 foot/);
  assert.match(text, /Freedom of Movement does not remove it/);
});

test("the linter: overgrown is true, on grass or forest only; the step is for an instant sphere", () => {
  const m = field();
  m.levels[0].tiles["0,0"] = { t: "grass", overgrown: true };
  m.levels[0].tiles["0,1"] = { t: "forest", overgrown: true };
  assert.deepEqual(lintMap(m), []);
  for (const bad of [{ t: "stone", overgrown: true }, { t: "water", depth: 10, overgrown: true }, { t: "grass", overgrown: false }, { t: "grass", overgrown: 1 }]) {
    const n = field();
    n.levels[0].tiles["2,2"] = bad;
    assert.equal(lintMap(n).length, 1, json(bad));
  }
  const bad = { ...SPELLS["plant-growth"].def, duration: "1 minute" };
  assert.ok(lintEntry("spells", bad, { pack: "t" }).some((x) => /overgrow/.test(x)));
});

test("overgrow() marks the vegetation of the cells, spares the excepted ones and what is out of reach, and writes nothing to the old map", () => {
  const m = field(), before = json(m);
  const hexes = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 1 }, { q: 5, r: 3 }, { q: 99, r: 99 }];
  const r = overgrow(m, { hexes, origin: { q: 0, r: 0, z: 0 }, except: ["1,0"] });
  assert.equal(json(m), before);
  assert.equal(r.cells, 2, "the grass at 0,0 and the forest at 0,1");
  assert.equal(r.map.levels[0].tiles["0,0"].overgrown, true);
  assert.equal(r.map.levels[0].tiles["0,1"].overgrown, true);
  for (const k of ["1,0", "-1,0", "5,3"]) assert.equal(r.map.levels[0].tiles[k].overgrown, undefined, k);
  assert.deepEqual(VEGETATION, ["grass", "forest"]);
  const high = overgrow(m, { hexes, origin: { q: 0, r: 0, z: 300 } });
  assert.equal(high.cells, 0, "ground more than 100 feet below the point aimed at is out of the sphere");
  assert.equal(high.map, m);
});

test("casting it: the grass and forest of the sphere are overgrown, stone and water and what lies beyond are not, and the DM is told", () => {
  const s = meadow();
  const r = ok(cast(s));
  assert.equal(tile(s, 1).overgrown, true, "grass");
  assert.equal(tile(s, 0, 1).overgrown, true, "forest");
  assert.deepEqual(tile(s, 10, 4), { t: "grass", overgrown: true });
  assert.equal(tile(s, -1).overgrown, undefined, "stone");
  assert.equal(tile(s, 6, 3).overgrown, undefined, "stone far off in the sphere");
  assert.deepEqual(tile(s, 5, 3), { t: "water", depth: 10 }, "water");
  assert.deepEqual(tile(s, 40), { t: "grass" }, "grass beyond the sphere");
  assert.deepEqual(lintMap(s.map), []);
  assert.ok(r.events.some((e) => e.type === "note" && /thick and overgrown/.test(e.text)));
  const told = r.events.find((e) => e.type === "manual" && e.partial && /overgrown/.test(e.text) && /tiles/.test(e.text));
  assert.ok(told, "the DM is told how many");
  assert.equal(s.effects?.some((x) => x.spell === "plant-growth") ?? false, false, "an Instantaneous spell leaves no lasting effect");
});

test("a walk across overgrown grass costs 4 feet per foot", () => {
  const s = meadow();
  const id = spawn(s, "goblin-warrior", { q: 0, r: 4 });
  assert.equal(costTo(s, id, 3, 4), 15, "before: 5 feet a cell");
  ok(cast(s));
  assert.equal(costTo(s, id, 1, 4), 20);
  assert.equal(costTo(s, id, 3, 4), 60);
  assert.equal(costTo(s, id, 5, 4), 100);
  const wiz = [...moveOptions(s, s.entities.wizard).values()].filter((v) => v.canStop);
  assert.ok(wiz.every((v) => v.cost >= 0));
});

test("stone in the area and grass outside the cells the caster named are not slowed; the excepted cells stay as they were", () => {
  const s = meadow();
  ok(cast(s, { except: [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 1, r: 0 }] }));
  assert.equal(tile(s, 1).overgrown, undefined);
  assert.equal(tile(s, 2).overgrown, undefined);
  assert.equal(tile(s, 3).overgrown, true);
  assert.equal(costTo(s, "wizard", -1, 0), 5, "stone, with the grass beyond it overgrown");
  assert.equal(costTo(s, "wizard", 1, 0), 5, "a cell spared");
});

test("an exception outside the area, or one that is not a cell, is refused and nothing changes", () => {
  const s = meadow();
  const before = json(s);
  assert.equal(cast(s, { except: [{ q: 40, r: 0 }] }).ok, false, "outside the sphere");
  assert.equal(cast(s, { except: [{ q: 1 }] }).ok, false);
  assert.equal(cast(s, { except: "1,0" }).ok, false);
  assert.equal(cast(s, { except: [{ q: 1, r: 0 }, null] }).ok, false);
  assert.equal(json(s), before, "a refusal changed nothing");
  const t = meadow();
  t.entities.wizard.spells.push("fireball");
  t.entities.wizard.slots[3] = 3;
  ok(apply(t, { type: "cast", actor: "wizard", spell: "fireball", hex: { q: 3, r: 0 }, slot: 3 }, DM));
  t.entities.wizard.slots[3] = 3;
  t.entities.wizard.spells.push("shield");
  assert.equal(apply(t, { type: "cast", actor: "wizard", spell: "shield", slot: 1, except: [] }, DM).ok, false, "a spell with no area refuses it too");
  assert.equal(apply(t, { type: "cast", actor: "wizard", spell: "fireball", hex: { q: 3, r: 0 }, slot: 3, except: [{ q: 3, r: 0 }] }, DM).ok, false, "only Plant Growth leaves cells out");
});

test("an overgrown tile already in Difficult Terrain costs 4, not 8", () => {
  const s = meadow();
  const id = spawn(s, "goblin-warrior", { q: -1, r: 1 });
  assert.equal(costTo(s, id, -2, 1), 5, "grass");
  assert.equal(costTo(s, id, 0, 1), 10, "forest is Difficult Terrain: 2 per foot");
  ok(cast(s));
  assert.equal(costTo(s, id, -2, 1), 20);
  assert.equal(costTo(s, id, 0, 1), 20, "forest overgrown: the dearer of 2 and 4, not their sum");
});

test("a flyer pays nothing extra", () => {
  const s = meadow();
  const id = spawn(s, "darkmantle", { q: 0, r: 4, z: 10 });
  const flying = (q) => [...moveOptions(s, s.entities[id]).values()].find((v) => v.h.q === q && v.h.r === 4 && v.h.z === 10)?.cost;
  const before = flying(3);
  assert.ok(before > 0 && before <= 15);
  ok(cast(s));
  assert.equal(flying(3), before, "in the air nothing is overgrown");
});

test("Freedom of Movement frees a creature of Difficult Terrain, not of overgrowth", () => {
  const s = meadow();
  ok(cast(s));
  const wiz = s.entities.wizard;
  wiz.pos = { q: -2, r: 0, z: 0 };
  ok(apply(s, { type: "cast", actor: "wizard", spell: "freedom-of-movement", target: "wizard", slot: 4 }, DM));
  assert.equal(costTo(s, "wizard", -2, 1), 20, "overgrown grass still costs 4 per foot with Freedom of Movement");
  assert.equal(costTo(s, "wizard", -1, 1), 25, "by the stone at -1,0 (5), then overgrown grass (20)");
  assert.equal(costTo(s, "wizard", 0, 1), 45, "then overgrown forest: 20 more, not 5");
});

test("a creature with Freedom of Movement in plain forest pays 1 per foot, which overgrowth then raises to 4", () => {
  const s = meadow();
  s.entities.wizard.pos = { q: 0, r: 0, z: 0 };
  ok(apply(s, { type: "cast", actor: "wizard", spell: "freedom-of-movement", target: "wizard", slot: 4 }, DM));
  assert.equal(costTo(s, "wizard", 0, 1), 5, "forest, Difficult Terrain ignored");
  ok(cast(s, { slot: 3 }));
  assert.equal(costTo(s, "wizard", 0, 1), 20);
});

test("it outlives the turn, the fight and the game's saving", () => {
  const s = meadow();
  const id = spawn(s, "goblin-warrior", { q: 12, r: 4 });
  ok(cast(s));
  ok(apply(s, { type: "startEncounter", center: { q: 6, r: 0 }, radius: 40 }, DM));
  const round = s.encounter.round;
  for (let i = 0; i < 40 && s.encounter.round < round + 2; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.ok(s.encounter.round >= round + 2, "two rounds went by");
  assert.equal(tile(s, 3).overgrown, true, "after the turns");
  assert.equal(costTo(s, id, 11, 4), 20, "in the fight the goblin still pays 4 per foot");
  ok(apply(s, { type: "endEncounter" }, DM));
  assert.equal(s.encounter, null);
  assert.equal(tile(s, 3).overgrown, true, "after the fight");
  const saved = migrate(JSON.parse(json(s)));
  assert.equal(saved.map.levels[0].tiles["3,0"].overgrown, true, "a saved game keeps it");
  assert.deepEqual(lintMap(saved.map), []);
  assert.equal(costTo(saved, id, 11, 4), 20, "and its cost");
  assert.equal(json(saved.map), json(s.map));
});

test("the players are sent the field on the tiles they can see", () => {
  const s = meadow();
  ok(cast(s));
  const v = view(s, { role: "player", userId: "u1" });
  const tiles = Object.values(v.map?.levels?.[0]?.tiles ?? {});
  assert.ok(tiles.length > 0);
  assert.ok(tiles.some((t) => t.overgrown === true), "an overgrown tile in the view");
  assert.ok(tiles.every((t) => t.t === "grass" || t.t === "forest" ? true : t.overgrown === undefined));
});

test("the DM's map edit clears it: a repainted tile has no overgrowth, and stone painted over it drops the mark", () => {
  const s = meadow();
  ok(cast(s));
  ok(apply(s, { type: "mapEdit", ops: [{ op: "tile", level: "g", at: { q: 3, r: 0 }, tile: { t: "grass" } }] }, DM));
  assert.deepEqual(tile(s, 3), { t: "grass" });
  ok(apply(s, { type: "mapEdit", ops: [{ op: "tile", level: "g", at: { q: 4, r: 0 }, tile: { t: "stone", overgrown: true } }] }, DM));
  assert.deepEqual(tile(s, 4), { t: "stone" });
  assert.deepEqual(lintMap(s.map), []);
});

test("a tide's water over overgrown ground keeps the growth under it", () => {
  const s = meadow();
  ok(cast(s));
  ok(apply(s, { type: "water", level: "g", cells: ["2,0"], surface: 10 }, DM));
  assert.equal(tile(s, 2).t, "water");
  assert.equal(tile(s, 2).dry.overgrown, true);
  assert.deepEqual(lintMap(s.map), []);
  ok(apply(s, { type: "water", level: "g", cells: ["2,0"], surface: 0 }, DM));
  assert.deepEqual(tile(s, 2), { t: "grass", overgrown: true });
});
