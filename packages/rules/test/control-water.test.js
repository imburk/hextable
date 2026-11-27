// Swimming, stage E4 of docs/specs/fly-swim-control.md (#853): Control Water's Flood and Part Water on the water of E3. The `water` step, its choice, what
// each does to the tiles and the creatures in them, and how they are put back when the spell ends.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current } from "../src/engine.js";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { newGame } from "../src/scenario.js";
import { newMap } from "../src/map.js";
import { controlWater, endWater } from "../src/tides.js";
import { waterAt } from "../src/space.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);

// A pond of water 10 feet deep (surface 0) at q 8 to 14, a second one far off (q 40), stone elsewhere. The wizard stands at the west end with a level 4 slot.
const pond = (depth = 10) => {
  const tiles = {};
  for (let q = -2; q <= 44; q++) for (let r = -4; r <= 4; r++) tiles[`${q},${r}`] = { t: "stone" };
  for (let q = 8; q <= 14; q++) for (let r = -2; r <= 2; r++) tiles[`${q},${r}`] = { t: "water", depth };
  for (const q of [40, 41]) tiles[`${q},0`] = { t: "water", depth };
  return newMap({ id: "pond", name: "Pond", starts: [{ q: 0, r: 0 }], levels: [{ id: "g", name: "G", z: 0, tiles }] });
};
function lake(depth = 10) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (id !== "wizard") delete s.entities[id];
  ok(apply(s, { type: "loadMap", map: pond(depth) }, DM));
  s.settings.autoEngage = false;
  Object.assign(s.entities.wizard, { pos: { q: 0, r: 0, z: 0 }, slots: { 4: 2 }, slotsMax: { 4: 2 }, hp: 500, maxHp: 500 });
  s.entities.wizard.spells.push("control-water");
  return s;
}
const swimmer = (s, q, r, z, name = "goblin-warrior") => {
  const id = ok(apply(s, { type: "spawn", monster: name, at: { q: 4, r: 4 } }, DM)).events.find((e) => e.type === "spawned").id;
  Object.assign(s.entities[id], { pos: { q, r, z }, hp: 5000, maxHp: 5000 });
  return id;
};
const cast = (s, choice, extra = {}) => apply(s, { type: "cast", actor: "wizard", spell: "control-water", hex: { q: 8, r: 0 }, choice, slot: 4, ...extra }, DM);
const tile = (s, q, r = 0) => s.map.levels[0].tiles[`${q},${r}`];
const fxOf = (s) => s.effects.find((x) => x.spell === "control-water");
const original = () => json(pond().levels[0].tiles);
const end = (s) => ok(apply(s, { type: "endEffect", effect: fxOf(s).id }, DM));

test("the entry: assist, checked, a choice of four, and the whole pack lints", () => {
  const sp = SPELLS["control-water"];
  assert.equal(sp.def.tier, "assist");
  assert.equal(sp.def.checked, true);
  assert.deepEqual(sp.def.choice, { of: "water" });
  assert.equal(sp.aim, "area");
  assert.deepEqual(lintEntry("spells", sp.def, { pack: "t" }).filter((x) => !/strict|homebrew/.test(x) && !/source|name of an SRD/.test(x)), []);
});

test("a choice is needed, and one the spell does not have is refused", () => {
  const s = lake();
  const before = json(s);
  assert.equal(cast(s, undefined).ok, false);
  assert.equal(cast(s, "wave").ok, false);
  assert.equal(json(s), before, "a refusal changed nothing");
});

test("Flood raises the standing water by 20 feet, with nobody in it, and the lasting effect holds what it did", () => {
  const s = lake();
  const r = ok(cast(s, "flood"));
  assert.deepEqual(tile(s, 11), { t: "water", h: 20, depth: 30, dry: { t: "water", depth: 10 } });
  assert.equal(waterAt(s.map, { q: 11, r: 0, z: 20 }).z, 20);
  assert.equal(tile(s, 5).t, "stone", "stone in the cube is not water, so it stays dry");
  assert.deepEqual(tile(s, 40), { t: "water", depth: 10 }, "the pond outside the cube is not touched");
  assert.ok(r.events.some((e) => e.type === "water" && e.fx === fxOf(s).id), "the DM is told the water changed");
  const parts = fxOf(s).parts.filter((p) => p.water);
  assert.equal(parts.length, 1);
  assert.ok(Object.keys(parts[0].water.cells).length > 30, "the cells of the pond the cube covers");
  assert.ok(Object.keys(parts[0].water.cells).every((k) => +k.split(",")[0] >= 8 && +k.split(",")[0] <= 14), "and no other");
  assert.ok(r.events.some((e) => e.type === "manual" && e.name === "Control Water"), "the DM is told what the engine did not do");
});

test("Flood lifts a creature at the surface, leaves one under it where it is, and the end brings them back with no fall", () => {
  const s = lake();
  const top = swimmer(s, 10, 0, 0), deep = swimmer(s, 12, 1, -5), bank = swimmer(s, 4, 0, 0);
  ok(cast(s, "flood"));
  assert.equal(s.entities[top].pos.z, 20, "at the surface it rises with it");
  assert.equal(s.entities[deep].pos.z, -5, "under the surface it stays");
  assert.equal(s.entities[bank].pos.z, 0, "on the bank it is where it was");
  const hp = s.entities[top].hp;
  assert.equal(waterAt(s.map, s.entities[top].pos)?.z, 20);
  end(s);
  assert.equal(s.entities[top].pos.z, 0, "the water comes down and takes it with it");
  assert.equal(s.entities[top].hp, hp, "no fall damage");
  assert.equal(json(s.map.levels[0].tiles), original(), "every tile is as it was, exactly");
  assert.equal(s.refills, undefined);
});

test("Part Water takes the water down to its bed, creatures with it, and the end fills it at once outside a fight", () => {
  const s = lake();
  const top = swimmer(s, 10, 0, 0), deep = swimmer(s, 12, 1, -5);
  ok(cast(s, "part"));
  assert.equal(tile(s, 11).t, "stone", "a trench");
  assert.equal(tile(s, 11).h, -10, "at the bed");
  assert.equal(waterAt(s.map, { q: 11, r: 0, z: -10 }), null);
  assert.equal(s.entities[top].pos.z, -10, "a creature in it comes down to the bed");
  assert.equal(s.entities[deep].pos.z, -10);
  end(s);
  assert.equal(json(s.map.levels[0].tiles), original(), "the trench fills in, exactly as it was");
  assert.equal(s.entities[top].pos.z, 0, "a creature on the bed is lifted by the water coming back");
  assert.equal(s.refills, undefined);
});

test("in a fight a trench fills at the start of the next round, not at once", () => {
  const s = lake();
  swimmer(s, 30, 0, 0);
  ok(cast(s, "part"));
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 40 }, DM));
  const round = s.encounter.round;
  end(s);
  assert.equal(tile(s, 11).t, "stone", "still a trench the moment the spell ends");
  assert.equal(s.refills.length, 1);
  for (let i = 0; i < 40 && s.encounter.round === round; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.equal(s.encounter.round, round + 1);
  assert.equal(json(s.map.levels[0].tiles), original(), "round turned: the trench is full again");
  assert.equal(s.refills, undefined);
});

test("a flood ends by what it raised, not below what a tide or the DM has done since; a cell the water has left is not touched", () => {
  const s = lake();
  ok(cast(s, "flood"));
  ok(apply(s, { type: "water", level: "g", cells: ["11,0", "12,0"], by: -5 }, DM));
  assert.equal(tile(s, 11).h, 15);
  ok(apply(s, { type: "water", level: "g", cells: ["13,0"], surface: -10 }, DM));
  assert.equal(tile(s, 13).t, "stone", "the DM drained one cell while the flood stood");
  const drained = json(tile(s, 13));
  end(s);
  assert.equal(tile(s, 11).h, -5, "15 less the 20 it raised: the 5 feet the DM took off stay taken");
  assert.equal(tile(s, 11).depth, 5);
  assert.equal(tile(s, 11).t, "water");
  assert.equal(json(tile(s, 13)), drained, "a cell with no water is left as the DM made it");
  assert.equal(json(tile(s, 9)), json({ t: "water", depth: 10 }), "the others are as they were");
});

test("Part Water: a trench that was filled again meanwhile is not touched when the spell ends", () => {
  const s = lake();
  ok(cast(s, "part"));
  ok(apply(s, { type: "water", level: "g", cells: ["11,0"], surface: -5 }, DM));
  const filled = json(tile(s, 11));
  end(s);
  assert.equal(json(tile(s, 11)), filled);
  assert.equal(json(tile(s, 10)), json({ t: "water", depth: 10 }), "the rest filled in");
});

test("a flood that would be deeper than the deepest water leaves that cell and tells the DM", () => {
  const s = lake(190);
  const r = ok(cast(s, "flood"));
  assert.equal(tile(s, 11).depth, 190, "nothing changed");
  assert.ok(r.events.some((e) => e.type === "manual" && /found no standing water|could not be changed/.test(e.text)));
  assert.equal(fxOf(s).parts.filter((p) => p.water).length, 0);
});

test("the cube's height: water wholly below or above it is not in it", () => {
  const s = lake();
  const hexes = [{ q: 10, r: 0 }, { q: 11, r: 0 }];
  const ev = [];
  assert.deepEqual(controlWater(s, { mode: "flood", hexes, origin: { q: 10, r: 0, z: 50 }, size: 40 }, ev).parts, [], "the cube starts above the water");
  assert.deepEqual(controlWater(s, { mode: "flood", hexes, origin: { q: 10, r: 0, z: -80 }, size: 40 }, ev).parts, [], "and one that ends below its bed");
  const r = controlWater(s, { mode: "flood", hexes, origin: { q: 10, r: 0, z: -5 }, size: 40 }, ev);
  assert.equal(Object.keys(r.parts[0].cells).length, 2, "water the cube only reaches into counts");
  assert.equal(tile(s, 10).h, 20);
});

test("Redirect Flow and Whirlpool change no water and hand the DM the effect; the engine is not silent about later turns", () => {
  for (const choice of ["redirect", "whirlpool"]) {
    const s = lake();
    const r = ok(cast(s, choice));
    assert.equal(json(s.map.levels[0].tiles), original());
    const text = r.events.filter((e) => e.type === "manual" && /^Control Water \(/.test(e.text)).map((e) => e.text).join("\n");
    assert.match(text, choice === "redirect" ? /Redirect Flow/ : /Whirlpool/);
    assert.doesNotMatch(text, choice === "redirect" ? /Whirlpool: in an area/ : /Redirect Flow\): flowing/, "only the chosen effect is told");
    assert.match(text, /later turns/);
  }
});

test("Concentration breaking ends the spell and puts the water back", () => {
  const s = lake();
  ok(cast(s, "flood"));
  assert.equal(tile(s, 11).h, 20);
  ok(apply(s, { type: "advanceTime", minutes: 11 }, DM));
  assert.equal(s.effects.some((x) => x.spell === "control-water"), false, "ten minutes on, it has ended");
  assert.equal(json(s.map.levels[0].tiles), original());
});

test("the map the water was changed on is gone: the water is left and the DM is told", () => {
  const s = lake();
  ok(cast(s, "flood"));
  const fx = fxOf(s), rec = fx.parts.find((p) => p.water).water, ev = [];
  s.map = { ...s.map, id: "elsewhere" };
  endWater(s, ev, fx, rec);
  assert.ok(ev.some((e) => e.type === "manual" && /not the one in play/.test(e.text)));
});

test("a trench left to fill by the next round fills when the fight ends, not when a later fight starts", () => {
  const s = lake();
  swimmer(s, 30, 0, 0);
  ok(cast(s, "part"));
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 40 }, DM));
  end(s);
  assert.equal(tile(s, 11).t, "stone", "still a trench in the round it ended");
  ok(apply(s, { type: "endEncounter" }, DM));
  assert.equal(s.encounter, null);
  assert.equal(json(s.map.levels[0].tiles), original(), "the fight is over: the trench is full");
  assert.equal(s.refills, undefined);
});
