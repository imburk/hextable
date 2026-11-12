// Lines and cubes laid out on the hexes (DEBT S3, M11).
import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import { SPELLS } from "../src/content/index.js";
import { actionProfile } from "../src/effects.js";
import { apply, areaHexes, current } from "../src/engine.js";
import * as H from "../src/hex.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q] of [["wizard", 0], ["fighter", -6], ["rogue", -6], ["cleric", -6]]) ok(apply(s, { type: "place", actor: id, to: { q, r: id === "wizard" ? 0 : ["fighter", "rogue", "cleric"].indexOf(id) * 2 - 2 } }, DM));
  Object.assign(s.entities.wizard, { slots: { 1: 4, 2: 3, 3: 3 }, slotsMax: { 1: 4, 2: 3, 3: 3 } });
  return s;
}
const spawn = (s, monster, q, r) => s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id];
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 30 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const keys = (hs) => hs.map(H.col).sort();
const know = (s, id) => { s.entities.wizard.spells.push(id); return id; };

test("a 5-foot Line is one hex wide in every direction, and as long as it says", () => {
  for (const aim of [{ q: 3, r: 0 }, { q: 2, r: -4 }, { q: 5, r: -2 }, { q: -1, r: 3 }]) {
    const hexes = H.band({ q: 0, r: 0 }, aim, 2.5, 32.5, 2.5);
    assert.ok(hexes.length >= 6 && hexes.length <= 7, `${JSON.stringify(aim)}: ${hexes.length} hexes`);
    assert.ok(!hexes.some((h) => h.q === 0 && h.r === 0), "the point of origin is not in it");
    // Contiguous: every hex but the first touches one nearer the origin.
    const sorted = [...hexes].sort((a, b) => H.dist(a, { q: 0, r: 0 }) - H.dist(b, { q: 0, r: 0 }));
    for (const h of sorted.slice(1)) assert.ok(sorted.some((o) => o !== h && H.dist(o, h) === 1), `gap at ${H.col(h)}`);
  }
  // Along a row it is exactly the row.
  assert.deepEqual(keys(H.band({ q: 0, r: 0 }, { q: 3, r: 0 }, 2.5, 32.5, 2.5)), ["1,0", "2,0", "3,0", "4,0", "5,0", "6,0"]);
  // 10 feet wide covers the row and those beside it.
  assert.equal(H.band({ q: 0, r: 0 }, { q: 3, r: 0 }, 2.5, 32.5, 5).length, 18);
});

test("Lightning Bolt catches everyone in its line and nobody beside it, with one damage roll", () => {
  const s = field(), id = know(s, "lightning-bolt");
  assert.equal(SPELLS[id].aim, "area");
  assert.equal(SPELLS[id].def.tier, "auto");
  const near = spawn(s, "goblin-warrior", 3, 0), far = spawn(s, "goblin-warrior", 11, 0), off = spawn(s, "goblin-warrior", 3, 2);
  for (const g of [near, far, off]) g.hp = g.maxHp = 200;
  fight(s); turnOf(s, "wizard");
  const res = ok(apply(s, { type: "cast", actor: "wizard", spell: id, hex: { q: 6, r: 0 } }, DM));
  const cast = res.events.find((e) => e.type === "cast");
  assert.deepEqual(cast.targets.sort(), [near.id, far.id].sort());
  assert.equal(cast.hexes.length, 13, "100 ft of line, cut off where the map ends");
  assert.equal(res.events.some((e) => e.type === "manual"), false, "an auto spell hands nothing to the DM");
  const hits = res.events.filter((e) => e.type === "damage");
  assert.equal(hits.length, 2);
  const full = res.events.filter((e) => e.type === "save").map((sv, i) => (sv.success ? hits[i].amount * 2 : hits[i].amount));
  assert.ok(Math.abs(full[0] - full[1]) <= 1, "the damage is rolled once and shared");
  assert.equal(off.hp, 200);
});

test("a Line has height: it passes under a flyer unless aimed up at it", () => {
  const s = field(), id = know(s, "lightning-bolt");
  const bat = spawn(s, "giant-bat", 4, 0);
  bat.hp = bat.maxHp = 200;
  bat.pos.z = 20;
  fight(s); turnOf(s, "wizard");
  let res = ok(apply(s, { type: "cast", actor: "wizard", spell: id, hex: { q: 6, r: 0 } }, DM));
  assert.deepEqual(res.events.find((e) => e.type === "cast").targets, []);
  s.entities.wizard.slots[3] = 3; s.encounter.budget.action = 1; s.encounter.flags = {};
  res = ok(apply(s, { type: "cast", actor: "wizard", spell: id, hex: { q: 4, r: 0, z: 20 } }, DM));
  assert.deepEqual(res.events.find((e) => e.type === "cast").targets, [bat.id]);
});

test("Thunderwave's cube starts at the caster's side and goes the way it is aimed", () => {
  const s = field(), id = know(s, "thunderwave");
  const ahead = spawn(s, "goblin-warrior", 2, 0), behind = spawn(s, "goblin-warrior", -1, 0);
  for (const g of [ahead, behind]) g.hp = g.maxHp = 200;
  const hexes = areaHexes(s, s.entities.wizard, SPELLS[id], { q: 1, r: 0 });
  assert.equal(hexes.length, 9);                                     // about 15 by 15 feet
  assert.ok(hexes.every((h) => H.along({ q: 0, r: 0 }, { q: 1, r: 0 }, h) > 0), "nothing behind the caster");
  fight(s); turnOf(s, "wizard");
  const res = ok(apply(s, { type: "cast", actor: "wizard", spell: id, hex: { q: 1, r: 0 } }, DM));
  assert.deepEqual(res.events.find((e) => e.type === "cast").targets, [ahead.id]);
  assert.equal(behind.hp, 200);
  // Assist: the creatures are resolved, the loose objects are the DM's.
  assert.match(res.events.find((e) => e.type === "manual").text, /DM moves the objects/);
});

test("a cube with a range is placed within it, and Entangle spares its caster", () => {
  const s = field(), id = know(s, "entangle");
  const g = spawn(s, "goblin-warrior", 1, 0);
  g.abil.str = 1;
  assert.equal(areaHexes(s, s.entities.wizard, SPELLS[id], { q: 0, r: 0 }).length, 20);     // about 20 by 20 feet
  fight(s); turnOf(s, "wizard");
  assert.match(apply(s, { type: "cast", actor: "wizard", spell: id, hex: { q: 19, r: 0 } }, DM).error, /reaches 90 ft/);
  const res = ok(apply(s, { type: "cast", actor: "wizard", spell: id, hex: { q: 0, r: 0 } }, DM));
  const cast = res.events.find((e) => e.type === "cast");
  assert.ok(cast.hexes.some((h) => h.q === 0 && h.r === 0), "the wizard's hex is in the square");
  assert.deepEqual(cast.targets, [g.id]);
});

test("areas the caster arranges or picks from are still the DM's: Fire Storm, Slow, Wind Wall", () => {
  for (const id of ["fire-storm", "slow", "wind-wall"]) assert.equal(SPELLS[id].aim, "none", id);
});

test("a dragon's line breath is aimed and resolved; an ancient black dragon's is 10 feet wide", () => {
  const s = field(), drake = spawn(s, "blue-dragon-wyrmling", 4, 0);
  const p = actionProfile(drake.actions.find((a) => a.id === "lightning-breath"));
  assert.equal(p.aim, "area");
  for (const id of ["fighter", "rogue"]) s.entities[id].hp = s.entities[id].maxHp = 200;
  ok(apply(s, { type: "place", actor: "fighter", to: { q: 2, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "rogue", to: { q: 1, r: 0 } }, DM));
  fight(s); turnOf(s, drake.id);
  const res = ok(apply(s, { type: "act", actor: drake.id, action: "lightning-breath", hex: { q: 3, r: 0 } }, DM));
  const act = res.events.find((e) => e.type === "act");
  assert.deepEqual(act.targets.sort(), ["fighter", "rogue", "wizard"]);
  assert.equal(res.events.some((e) => e.type === "manual"), false);
  const big = spawn(s, "ancient-black-dragon", -8, 6);
  const breath = big.actions.find((a) => a.id === "acid-breath");
  assert.equal(breath.target.area.width, 10);
  const wide = areaHexes(s, big, { area: breath.target.area }, { q: big.pos.q + 5, r: big.pos.r });
  const narrow = areaHexes(s, big, { area: { ...breath.target.area, width: 5 } }, { q: big.pos.q + 5, r: big.pos.r });
  assert.ok(wide.length > narrow.length * 2);
});

test("the monster AI aims a line breath down a row of foes", () => {
  const s = field(), drake = spawn(s, "blue-dragon-wyrmling", 4, 0);
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 200;
  ok(apply(s, { type: "place", actor: "fighter", to: { q: 2, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "rogue", to: { q: 1, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "cleric", to: { q: -6, r: 6 } }, DM));
  fight(s); turnOf(s, drake.id);
  const a = aiStep(s, drake.id);
  assert.equal(a.action, "lightning-breath");
  const res = ok(apply(s, a, DM));
  assert.ok(res.events.find((e) => e.type === "act").targets.length >= 2);
});
