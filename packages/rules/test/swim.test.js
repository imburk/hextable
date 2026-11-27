// Swimming, stage E1 of docs/specs/fly-swim-control.md (#836): a water tile has a depth, a position between its bed and its surface is in the water,
// the water holds a creature up, and a creature swims through it at the SRD's cost: 5 feet a step from a Swim Speed, 10 from the walking Speed without one.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, moveOptions } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { lintMap, migrateMap, newMap, MAP_FORMAT } from "../src/map.js";
import { WATER_DEPTH } from "../src/content/terrain.js";
import { ground, inWater, submerged, under, waterAt } from "../src/space.js";
import { aiStep } from "../src/ai.js";
import { CONTENT } from "../src/content/index.js";
import { migrate as migrateGame } from "../src/migrate.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "it was refused"); if (re) assert.match(r.error, re); return r; };
const stand = (id, pos) => (s) => { s.entities[id].pos = { ...pos }; };

// The valley with its creatures gone but the fighter, grass all over, and a pool of water from q = 1 to q = 4 (r from -4 to 4), the fighter at 0,0 on its shore.
// `foe`: a goblin far off, so that a fight started here goes on.
// `swim`: a Swim Speed for the fighter (0: it has none). Squares: the square valley.
function pool({ grid = "hex", depth = 20, swim = 0, walk = 30, foe = false, wizard = false } = {}) {
  const s = newGame(7, grid === "square" ? { grid: "square" } : {});
  for (const id of Object.keys(s.entities)) if (id !== "fighter" && !(wizard && id === "wizard")) delete s.entities[id];
  const tiles = s.map.levels[0].tiles;
  for (const t of Object.values(tiles)) { t.t = "grass"; delete t.depth; }
  for (let q = 1; q <= 4; q++) for (let r = -4; r <= 4; r++) if (tiles[`${q},${r}`]) tiles[`${q},${r}`] = { t: "water", ...(depth ? { depth } : {}) };
  s.settings.autoEngage = false;
  if (foe) { const id = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: -8, r: 0 } }, DM)).events.find((e) => e.type === "spawned").id; Object.assign(s.entities[id], { hp: 500, maxHp: 500 }); }
  if (wizard) { Object.assign(s.entities.wizard, { pos: { q: -3, r: 0, z: 0 }, hp: 500, maxHp: 500, slots: { 3: 3 }, slotsMax: { 3: 3 } }); s.entities.wizard.spells.push("water-walk"); }
  Object.assign(s.entities.fighter, { pos: { q: 0, r: 0, z: 0 }, hp: 500, maxHp: 500, speed: walk, ...(swim ? { speeds: { swim } } : {}) });
  return s;
}
const reach = (s, id = "fighter") => moveOptions(s, s.entities[id]);
const at = (r, q, z = 0, rr = 0) => [...r.values()].find((v) => v.h.q === q && v.h.r === rr && (v.h.z ?? 0) === z);
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 20 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const squares = { grid: "square" };

test("water has a depth: a position between the bed and the surface is in the water, and only over a water tile with a depth", () => {
  const s = pool({ depth: 15 });
  const where = (q, z) => ({ q, r: 0, z });
  assert.equal(waterAt(s.map, where(2, 0)).bed, -15);
  for (const z of [0, -5, -10, -15]) assert.ok(waterAt(s.map, where(2, z)), `z ${z} is in the water`);
  for (const z of [5, -20]) assert.equal(waterAt(s.map, where(2, z)), null, `z ${z} is not`);
  assert.equal(waterAt(s.map, where(0, -5)), null, "not over grass");
  // At the surface a creature is swimming at the surface; below it is underwater.
  const f = s.entities.fighter;
  f.pos = where(2, 0);
  assert.deepEqual([inWater(s, f), submerged(s, f)], [true, false]);
  f.pos = where(2, -10);
  assert.deepEqual([inWater(s, f), submerged(s, f)], [true, true]);
  f.pos = where(0, 0);
  assert.deepEqual([inWater(s, f), submerged(s, f)], [false, false]);
  // A water tile with no depth (a hand-built map) is a surface and no more, as before swimming.
  const dry = pool({ depth: 0 });
  assert.equal(waterAt(dry.map, where(2, -5)), null);
  assert.equal(at(reach(dry), 1), undefined, "and nobody enters it");
});

test("the water holds a creature up: under the surface it stands on the water, is in the level's region and light, and does not fall", () => {
  const s = pool({ depth: 20 });
  const f = s.entities.fighter;
  f.pos = { q: 2, r: 0, z: -10 };
  assert.equal(ground(s.map, f.pos).tile.t, "water");
  assert.equal(under(s.map, f.pos).level.id, "ground", "the water's own level is what it is in");
  // Whatever its speeds: no Fly Speed, and a floor of another level far below it does not draw it down.
  s.map.levels.push({ id: "cellar", name: "Cellar", z: -60, tiles: { "2,0": { t: "stone" } } });
  ok(apply(s, { type: "say", as: "fighter", text: "Glub." }, DM));
  assert.deepEqual(f.pos, { q: 2, r: 0, z: -10 });
});

test("a creature falling into water stops at its surface", () => {
  const s = pool({ depth: 20 });
  const f = s.entities.fighter;
  f.pos = { q: 2, r: 0, z: 30 };
  ok(apply(s, { type: "say", as: "fighter", text: "Aaah." }, DM));
  assert.deepEqual(f.pos, { q: 2, r: 0, z: 0 }, "it comes down to the surface, not to the bed");
  assert.ok(inWater(s, f) && !submerged(s, f));
});

for (const grid of ["hex", "square"]) {
  const G = grid === "square" ? squares : {};
  test(`entering and leaving water: from the shore onto the surface, down to the bed, up and out (${grid}s)`, () => {
    const s = pool({ ...G, depth: 10 });
    const r = reach(s);
    assert.ok(at(r, 1, 0)?.canStop, "the surface of the water next to the shore");
    assert.ok(at(r, 1, -5)?.canStop && at(r, 1, -10)?.canStop, "down through it to the bed");
    assert.equal(at(r, 1, -15), undefined, "not through the bed");
    assert.equal(at(r, 1, 5), undefined, "and not above the surface: that is the air");
    // Walk in, dive, and come back out onto the shore.
    ok(apply(s, { type: "move", actor: "fighter", to: { q: 2, r: 0, z: 0 } }, DM));
    assert.deepEqual(s.entities.fighter.pos, { q: 2, r: 0, z: 0 });
    ok(apply(s, { type: "move", actor: "fighter", to: { q: 2, r: 0, z: -10 } }, DM));
    assert.deepEqual(s.entities.fighter.pos, { q: 2, r: 0, z: -10 });
    assert.ok(submerged(s, s.entities.fighter));
    const out = reach(s);
    assert.equal(at(out, 0, 0)?.cost, 25, "from the bed the shore is reached by swimming up (two steps) and walking out (one): the water is left from its surface");
    assert.equal(at(out, 1, 5), undefined, "no stepping from the bed up onto the bank");
    ok(apply(s, { type: "move", actor: "fighter", to: { q: 0, r: 0, z: 0 } }, DM));
    assert.deepEqual(s.entities.fighter.pos, { q: 0, r: 0, z: 0 });
    assert.equal(inWater(s, s.entities.fighter), false);
  });

  test(`the two costs: 10 feet a step from the walking Speed without a Swim Speed, 5 from a Swim Speed (${grid}s)`, () => {
    const none = reach(pool({ ...G })), swims = reach(pool({ ...G, swim: 30 }));
    assert.deepEqual([1, 2, 3].map((q) => at(none, q)?.cost), [10, 20, 30]);
    assert.equal(at(none, 4)?.cost, 40, "outside a fight there is no limit but the table's");
    assert.equal(at(none, 2, -5)?.cost, 20, "a step down 5 feet and across is one step");
    assert.equal(at(none, 2, -10)?.cost, 30);
    assert.deepEqual([1, 2, 3, 4].map((q) => at(swims, q)?.cost), [5, 10, 15, 20]);
    assert.equal(at(swims, 2, -5)?.cost, 10);
    assert.equal(at(swims, 4, -10)?.cost, 20, "the bed, 40 feet in, is 20 feet of swimming");
  });

  test(`the Swim Speed shares the turn's feet with walking, and a Dash doubles them (${grid}s)`, () => {
    for (const swim of [30, 0]) {
      const s = pool({ ...G, swim, foe: true });
      Object.assign(s.entities.fighter, { pos: { q: -2, r: 0, z: 0 } });
      fight(s); turnOf(s, "fighter");
      ok(apply(s, { type: "move", actor: "fighter", to: { q: 0, r: 0, z: 0 } }, DM));          // 10 feet of walking
      assert.equal(s.encounter.budget.move, 20);
      const r = reach(s);
      // 20 feet left: four steps of 5 from a Swim Speed of 30, or two of 10 with none.
      assert.deepEqual([1, 2, 3, 4].map((q) => at(r, q)?.cost), swim ? [5, 10, 15, 20] : [10, 20, undefined, undefined], `Swim Speed ${swim}`);
      ok(apply(s, { type: "move", actor: "fighter", to: { q: 2, r: 0, z: 0 } }, DM));
      assert.equal(s.encounter.budget.move, swim ? 10 : 0, "what the swimming cost");
      ok(apply(s, { type: "dash", actor: "fighter" }, DM));
      const again = reach(s);
      assert.deepEqual([3, 4].map((q) => at(again, q)?.cost), swim ? [5, 10] : [10, 20], "the Dash gave 30 more");
    }
  });

  test(`a Swim Speed below the walking Speed is no loss: the walking Speed can swim at the extra cost (${grid}s)`, () => {
    const s = pool({ ...G, swim: 10, foe: true });
    fight(s); turnOf(s, "fighter");
    const r = reach(s);
    // 5 a step from the Swim Speed while its 10 feet last (the walking Speed's feet are spent with them), 10 a step after.
    assert.deepEqual([1, 2, 3, 4].map((q) => at(r, q)?.cost), [5, 10, 20, 30]);
  });
}

test("Difficult Terrain in the water costs one more: 15 feet a step without a Swim Speed, 10 with one (the space of a hostile creature that can be passed)", () => {
  for (const [swim, plain, hard] of [[0, 10, 15], [30, 5, 10]]) {
    const s = pool({ depth: 5, swim });
    const id = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: -5, r: 0 } }, DM)).events.find((e) => e.type === "spawned").id;
    Object.assign(s.entities[id], { size: "large", pos: { q: 3, r: 0, z: -5 } });        // fills the water from the bed up (a bed 5 feet down)
    s.entities[id].cond.paralyzed = {};                                                   // Incapacitated: it can be passed through, and its space is Difficult Terrain
    const r = reach(s);
    assert.equal(at(r, 2)?.cost, 2 * plain, "ordinary water before it");
    assert.equal(at(r, 3)?.cost, 2 * plain + hard, "the third step is into its space");
    assert.equal(at(r, 3)?.canStop, false, "and nobody stops in it");
  }
});

test("a creature with Speed 0 does not swim; one with only a Swim Speed swims in water and nowhere else", () => {
  const still = pool({ walk: 0 });
  assert.equal(moveOptions(still, still.entities.fighter).size, 0);
  no(apply(still, { type: "move", actor: "fighter", to: { q: 1, r: 0, z: 0 } }, DM), /can't move|Speed is 0/);
  // A fish: Speed 0, Swim 40. On the shore it goes nowhere; in the water it moves through it, and may come to its surface but not walk out.
  const s = pool({ walk: 0, swim: 40 });
  assert.equal(reach(s).size, 1, "on the shore: only where it is");
  s.entities.fighter.pos = { q: 2, r: 0, z: 0 };
  const r = reach(s);
  assert.equal(at(r, 3)?.cost, 5);
  assert.equal(at(r, 2, -10)?.cost, 10, "down 10 feet in two steps");
  assert.equal(at(r, 0, 0), undefined, "no walking out: it has no walking Speed");
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 4, r: 0, z: -10 } }, DM));
  assert.deepEqual(s.entities.fighter.pos, { q: 4, r: 0, z: -10 });
});

test("Water Walk: on the surface and never in the water; when it ends the creature is in the water at the surface and swims", () => {
  const s = pool({ depth: 20, wizard: true });
  ok(apply(s, { type: "cast", actor: "wizard", spell: "water-walk", targets: ["fighter"], slot: 3 }, DM));
  const r = reach(s);
  assert.deepEqual([1, 2, 3, 4].map((q) => at(r, q)?.cost), [5, 10, 15, 20], "it walks across at the cost of walking");
  assert.ok([1, 2, 3, 4].every((q) => at(r, q)?.canStop), "and stops on it");
  assert.ok([...r.values()].every((v) => (v.h.z ?? 0) >= 0), "it does not sink: no place under the surface");
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 3, r: 0, z: 0 } }, DM));
  assert.deepEqual(s.entities.fighter.pos, { q: 3, r: 0, z: 0 });
  ok(apply(s, { type: "say", as: "fighter", text: "Dry feet." }, DM));
  assert.deepEqual(s.entities.fighter.pos, { q: 3, r: 0, z: 0 }, "no fall, no sinking");
  // The spell ends with it standing on the water: it is in the water at the surface, and swims.
  const fx = s.effects.find((x) => x.spell === "water-walk");
  ok(apply(s, { type: "endEffect", effect: fx.id }, DM));
  const f = s.entities.fighter;
  assert.deepEqual([f.pos.z, inWater(s, f), submerged(s, f)], [0, true, false]);
  const after = reach(s);
  assert.equal(at(after, 3, -5)?.cost, 10, "it can dive: 5 feet down is one swimming step, 10 without a Swim Speed");
  assert.equal(at(after, 4)?.cost, 10);
  assert.equal(at(after, 0)?.cost, 25, "and swim back to the shore: two steps of 10, then out onto the grass at 5");
});

test("flying is as it was: a flyer over the water keeps to the air and pays 5 a step; a flyer at the surface may leave it upward", () => {
  const s = pool({ depth: 20 });
  s.entities.fighter.speeds = { fly: 30 };
  s.entities.fighter.pos = { q: 0, r: 0, z: 10 };
  const r = reach(s);
  assert.equal(at(r, 2, 10)?.cost, 10);
  assert.equal(at(r, 2, 5)?.cost, 10, "it can come down to 5 feet over the water, still in the air");
  assert.equal(at(r, 1, 0)?.cost, 20, "the surface is no place to fly to: it lands on the shore (10 feet down) and swims in (a step at 10, it has no Swim Speed)");
  assert.equal(at(r, 2, 0)?.cost, 30);
  s.entities.fighter.pos = { q: 2, r: 0, z: 0 };
  const w = reach(s);
  assert.equal(at(w, 2, 5)?.cost, 5, "from the surface it goes up as a flyer does");
});

test("squares: a diagonal step into water past a corner of water is open to a swimmer, and costs its true length", () => {
  const s = pool(squares);
  const r = reach(s);
  assert.ok(at(r, 1, 0, 1), "the water diagonally across the shore corner");
  assert.ok(Math.abs(at(r, 1, 0, 1).cost - 10 * Math.SQRT2) < 1e-6, "7.07 feet doubled");
});

test("the monster brain swims through water to reach a foe, and does not end its turn under the water with no Swim Speed", () => {
  const s = pool({ depth: 20, foe: true });
  const goblin = Object.values(s.entities).find((e) => e.side !== "party");
  goblin.pos = { q: -3, r: 0, z: 0 };
  s.entities.fighter.pos = { q: 5, r: 0, z: 0 };                   // across the pool
  ok(apply(s, { type: "startEncounter", center: { q: 1, r: 0 }, radius: 8 }, DM));
  turnOf(s, goblin.id);
  for (let i = 0; i < 6 && current(s) === goblin.id; i++) {
    const a = aiStep(s);
    if (!a) break;
    const r = apply(s, a, DM);
    if (!r.ok || a.type === "endTurn") break;
  }
  assert.ok(!submerged(s, goblin), "it is not left under the water");
  // And it may stop at the surface (a Swim Speed it has not, so it pays double) or on the shore: it is never refused a turn for the water.
  assert.ok(goblin.pos.q >= -3);
});

test("a map's water: format 3 gives it a depth, the linter checks it, old maps come up with 10 feet and are not written to", () => {
  assert.equal(MAP_FORMAT, 3);
  assert.deepEqual(WATER_DEPTH, { min: 5, max: 200, step: 5, default: 10 });
  const water = (depth) => newMap({ levels: [{ id: "ground", name: "Ground", z: 0, tiles: { "0,0": { t: "grass" }, "1,0": { t: "water", ...(depth === undefined ? {} : { depth }) } } }] });
  assert.deepEqual(lintMap(water(10)), []);
  for (const d of [5, 15, 200]) assert.deepEqual(lintMap(water(d)), [], `${d} feet`);
  for (const d of [undefined, 0, 7, 205, -5, 12.5, "10"]) assert.match(lintMap(water(d))[0], /^The water at 1,0 on "ground" has a depth of .*it must be a multiple of 5 from 5 to 200\.$/, String(d));
  const grass = water(10); grass.levels[0].tiles["0,0"].depth = 10;
  assert.match(lintMap(grass)[0], /^The tile at 0,0 on "ground" has a depth, and only water has one\.$/);
  // Format 2 and format 1 maps come up to format 3 with 10 feet on every water tile, and nothing else changes.
  const old = JSON.parse(JSON.stringify(water(undefined))); old.format = 2;
  const frozen = structuredClone(old);
  const deep = (o) => { Object.freeze(o); for (const v of Object.values(o)) if (v && typeof v === "object") deep(v); return o; };
  const up = migrateMap(deep(old));
  assert.equal(up.format, 3);
  assert.equal(up.levels[0].tiles["1,0"].depth, 10);
  assert.deepEqual(up.levels[0].tiles["0,0"], { t: "grass" });
  assert.deepEqual(old, frozen, "the document it was given is left as it was");
  assert.deepEqual(lintMap(up), []);
  assert.deepEqual(migrateMap(structuredClone(up)), up, "again changes nothing");
  assert.deepEqual(Object.keys(up).slice(0, 5), ["format", "id", "name", "grid", "cellFeet"]);
  // A water tile that already has a depth keeps it.
  const keep = JSON.parse(JSON.stringify(water(25))); keep.format = 2;
  assert.equal(migrateMap(keep).levels[0].tiles["1,0"].depth, 25);
  // The editor paints water with no depth (its field is a follow-up, DEBT): a map edit gives it the default.
  const s = pool({ depth: 20 });
  ok(apply(s, { type: "mapEdit", ops: [{ op: "tile", level: "ground", at: { q: -3, r: 3 }, tile: { t: "water" } }] }, DM));
  assert.equal(s.map.levels[0].tiles["-3,3"].depth, 10);
});

test("a saved game's map comes up with its water 10 feet deep, and a creature on a water tile is in the water", () => {
  const s = pool({ depth: 0 });
  s.map.format = 2;
  const saved = JSON.parse(JSON.stringify(s));
  s.entities.fighter.pos = { q: 2, r: 0, z: 0 };
  saved.entities.fighter.pos = { q: 2, r: 0, z: 0 };
  const loaded = migrateGame(saved);
  assert.equal(loaded.map.levels[0].tiles["2,0"].depth, 10);
  assert.ok(inWater(loaded, loaded.entities.fighter));
  assert.deepEqual(lintMap(loaded.map), []);
});

test("a party swimmer that names a column of water without a height is not sent to another place of it by a creature the party does not know of", () => {
  const world = (lurk) => {
    const s = pool({ depth: 20 });
    if (lurk) {
      const id = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: -5, r: 0 }, hidden: true }, DM)).events.find((e) => e.type === "spawned").id;
      Object.assign(s.entities[id], { pos: { q: 2, r: 0, z: 0 }, hp: 500, maxHp: 500 });
    }
    return s;
  };
  const bare = world(false), lurked = world(true);
  const goblin = Object.values(lurked.entities).find((e) => e.side !== "party");
  ok(apply(bare, { type: "move", actor: "fighter", to: { q: 2, r: 0 } }, DM));
  assert.deepEqual(bare.entities.fighter.pos, { q: 2, r: 0, z: 0 }, "with nothing there it goes to the surface, the place nearest its own height");
  ok(apply(lurked, { type: "move", actor: "fighter", to: { q: 2, r: 0 } }, DM));
  // As on land: it stops beside the creature and finds it. It does not slip under it to another place of the column, which would tell the players something is there.
  const f = lurked.entities.fighter.pos;
  assert.equal(Math.max(Math.abs(f.q - 2), Math.abs(f.r)), 1, `it stopped beside the creature, at ${JSON.stringify(f)}`);
  assert.equal(goblin.hidden, undefined, "and found it");
});
