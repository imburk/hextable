// Wave 2 of issue #786: the areas and walls (Spike Growth, Flaming Sphere, Wall of Fire, Wall of Thorns, Blade Barrier, Wall of Stone). Built to
// docs/specs/rules-expansion.md, "Build notes: wave 2 areas and walls (#786)". Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { view } from "../src/view.js";
import { squareRoom } from "./fixtures/square-room.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const lint = (def) => lintEntry("spells", def, { strict: false });
// Open grass, the wizard at the origin, the cleric beside it (both with the wave's spells and slots) and the fighter two hexes west.
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", 0, 0], ["fighter", -2, 0], ["rogue", -4, 4], ["cleric", -1, 1]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  const slots = { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 2, 7: 1 };
  for (const id of ["wizard", "cleric"]) Object.assign(s.entities[id], { slots: { ...slots }, slotsMax: { ...slots } });
  s.entities.wizard.spells.push("spike-growth", "flaming-sphere", "wall-of-fire", "wall-of-thorns", "wall-of-stone", "thunderwave");
  s.entities.cleric.spells.push("blade-barrier", "thunderwave");
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 300;
  return s;
}
const spawn = (s, monster, q, r) => { const e = s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 300; return e; };
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 12 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const hurt = (events, id, type) => events.filter((e) => e.type === "damage" && e.target === id && (!type || e.dtype === type));

test("Spike Growth: assist, Difficult Terrain, and 2d4 piercing for each 5 feet walked into or within the area", () => {
  const def = SPELLS["spike-growth"].def;
  assert.equal(def.tier, "assist");
  assert.deepEqual(lint(def), []);
  const s = field(), g = spawn(s, "goblin-warrior", 9, 0);
  fight(s); turnOf(s, "wizard");
  const cast = ok(apply(s, { type: "cast", actor: "wizard", spell: "spike-growth", hex: { q: 4, r: 0 } }, DM));
  assert.equal(hurt(cast.events, g.id).length, 0, "nothing is hurt as it appears");
  const fx = s.effects.find((x) => x.name === "Spike Growth");
  assert.ok(fx.zone.on.includes("step") && fx.terrain.difficult);
  turnOf(s, g.id);
  const hp = g.hp;
  // (9,0) is outside (5 hexes from the centre); (8,0), (7,0) and (6,0) are inside: three steps, three doses, and the move is Difficult Terrain.
  const walk = ok(apply(s, { type: "move", actor: g.id, to: { q: 8, r: 0 } }, DM));
  assert.equal(walk.events.filter((e) => e.type === "zone").length, 1, "one step into it");
  assert.equal(hurt(walk.events, g.id).length, 1);
  const more = ok(apply(s, { type: "move", actor: g.id, to: { q: 7, r: 0 } }, DM));
  assert.equal(more.events.filter((e) => e.type === "zone").length, 1, "within it: one more");
  assert.ok(g.hp < hp && g.hp >= hp - 16, `2 doses of 2d4 (${hp} to ${g.hp})`);
  // Walking out: (8,0) is inside, so that step hurts; the step onto (9,0), outside, is not into or within it.
  ok(apply(s, { type: "endTurn", actor: g.id }, DM)); turnOf(s, g.id);
  const out = ok(apply(s, { type: "move", actor: g.id, to: { q: 9, r: 0 } }, DM));
  assert.equal(out.events.filter((e) => e.type === "zone").length, 1, "one dose for the step that stays in, none for the one that leaves");
});

test("Spike Growth, decided: a creature in the air takes nothing; a creature pushed through it takes 2d4 for each 5 feet it is moved", () => {
  const s = field(), bat = spawn(s, "bat", 9, 0), g = spawn(s, "goblin-warrior", 1, 0);
  g.abil.con = 1;                                              // the Thunderwave save fails
  fight(s); turnOf(s, "wizard");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "spike-growth", hex: { q: 4, r: 0 } }, DM));
  // A creature with a Fly Speed is aloft (world.js aloft): it touches none of the ground, wherever its path goes.
  turnOf(s, bat.id);
  const hp = bat.hp;
  const fly = ok(apply(s, { type: "move", actor: bat.id, to: { q: 6, r: 0 } }, DM));
  assert.deepEqual([bat.pos.q, bat.pos.r], [6, 0]);
  assert.equal(fly.events.filter((e) => e.type === "zone").length, 0);
  assert.equal(bat.hp, hp);
  // Pushed 10 feet east by Thunderwave from (1,0) to (3,0): two 5-foot steps, both inside the area: two doses, after the push's own damage.
  turnOf(s, "wizard");
  const wave = ok(apply(s, { type: "cast", actor: "wizard", spell: "thunderwave", slot: 1, hex: { q: 1, r: 0 } }, DM));
  assert.deepEqual([g.pos.q, g.pos.r], [3, 0]);
  const spikes = wave.events.filter((e) => e.type === "zone" && e.id === g.id);
  assert.equal(spikes.length, 2, JSON.stringify(wave.events.map((e) => e.type)));
  assert.equal(hurt(wave.events, g.id, "piercing").length, 2);
});

test("Spike Growth, decided: a jump is the DM's (the engine has no jump); the hazard is reported to the DM as a note, and the spell holds at assist", () => {
  const def = SPELLS["spike-growth"].def;
  assert.match(def.text, /DM judges a jump/);
  const s = field();
  spawn(s, "goblin-warrior", 9, 0);
  fight(s); turnOf(s, "wizard");
  const cast = ok(apply(s, { type: "cast", actor: "wizard", spell: "spike-growth", hex: { q: 4, r: 0 } }, DM));
  assert.ok(cast.events.some((e) => e.type === "manual" && e.spell === "spike-growth"), "the engine hands the DM what it does not run");
});

// ---------- the walls ----------
import { areaHexes } from "../src/engine.js";
import { obscuredAt } from "../src/terrain.js";
const saves = (events, id) => events.filter((e) => e.type === "save" && e.id === id);
const fxOf = (s, name) => s.effects.find((x) => x.name === name);
const at = (e) => `${e.pos.q},${e.pos.r}`;
// The hexes of a wall through `centre` as it would be laid out now, and a hex beside it that is not in it.
function wallAt(s, id, spell, centre) {
  const wall = areaHexes(s, s.entities[id], SPELLS[spell], centre).map((h) => `${h.q},${h.r}`);
  return wall;
}

test("a wall is a straight placed line: centred on the space chosen, across the caster's line unless a direction is named, 5 feet thick", () => {
  const s = field();
  const across = wallAt(s, "wizard", "wall-of-fire", { q: 3, r: 0 });
  assert.ok(across.includes("3,0"), "the space chosen is in it");
  assert.ok(across.length >= 12 && across.length <= 15, `60 feet across a hex grid: ${across.length}`);
  assert.ok(!across.includes("4,0") && !across.includes("2,0"), "it runs across the line from the caster, not along it");
  // Named a direction: along the line from the caster.
  const along = areaHexes(s, s.entities.wizard, SPELLS["wall-of-fire"], { q: 3, r: 0 }, { q: 4, r: 0 }).map((h) => `${h.q},${h.r}`);
  assert.ok(along.includes("3,0") && along.includes("9,0") && along.includes("-2,0") && along.length === 12, along.join(" "));
  // A wall is not a ray: out of range it is refused, and a direction that is no space is refused, and nothing is spent.
  fight(s); spawn(s, "goblin-warrior", 9, 0); turnOf(s, "wizard");
  const slots = s.entities.wizard.slots[4];
  assert.match(apply(s, { type: "cast", actor: "wizard", spell: "wall-of-fire", slot: 4, hex: { q: 30, r: 0 } }, DM).error, /reaches 120 ft|far away|away/);
  assert.match(apply(s, { type: "cast", actor: "wizard", spell: "wall-of-fire", slot: 4, hex: { q: 3, r: 0 }, toward: "east" }, DM).error, /runs toward/);
  assert.match(apply(s, { type: "cast", actor: "wizard", spell: "spike-growth", hex: { q: 3, r: 0 }, toward: { q: 4, r: 0 } }, DM).error, /not a wall/);
  assert.equal(s.entities.wizard.slots[4], slots);
});

test("Wall of Fire: a save as it appears; then flat damage on entering for the first time on a turn and on ending a turn inside; none on leaving", () => {
  const def = SPELLS["wall-of-fire"].def;
  assert.equal(def.tier, "assist");
  assert.deepEqual(lint(def), []);
  const s = field(), a = spawn(s, "goblin-warrior", 3, 0), b = spawn(s, "goblin-warrior", 2, 1);
  for (const g of [a, b]) g.abil.dex = 1;                      // the save fails
  fight(s); turnOf(s, "wizard");
  const cast = ok(apply(s, { type: "cast", actor: "wizard", spell: "wall-of-fire", slot: 4, hex: { q: 3, r: 0 } }, DM));
  assert.equal(saves(cast.events, a.id).length, 1, "the creature in the wall saves as it appears");
  assert.equal(hurt(cast.events, a.id, "fire").length, 1);
  assert.equal(hurt(cast.events, b.id).length, 0, "the one beside it takes nothing as it appears");
  const fx = fxOf(s, "Wall of Fire");
  assert.deepEqual([fx.zone.once, fx.zone.on], ["enter", ["enter", "turnEnd"]]);
  assert.ok(obscuredAt(s, { q: 3, r: 0, z: 0 }) === "heavy", "opaque");
  // B walks into a wall hex beside it: flat damage, no save. Out again: nothing. In again the same turn: nothing (not the first time). Its turn ends inside: damage again, still no save.
  const hexes = new Set(fx.zone.hexes), nb = (h) => [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([dq, dr]) => ({ q: h.q + dq, r: h.r + dr }));
  const inW = nb(b.pos).find((h) => hexes.has(`${h.q},${h.r}`) && !(h.q === 3 && h.r === 0)), out = { q: b.pos.q, r: b.pos.r };
  assert.ok(inW && !hexes.has(`${out.q},${out.r}`), "a wall hex beside B, B itself outside");
  turnOf(s, b.id);
  const into = ok(apply(s, { type: "move", actor: b.id, to: inW }, DM));
  assert.equal(saves(into.events, b.id).length, 0, "no save: it is the same damage");
  assert.equal(hurt(into.events, b.id, "fire").length, 1);
  assert.ok(hurt(into.events, b.id, "fire")[0].dice.length === 5 && hurt(into.events, b.id, "fire")[0].dice[0].sides === 8, "5d8");
  const back = ok(apply(s, { type: "move", actor: b.id, to: out }, DM));
  assert.equal(hurt(back.events, b.id).length, 0, "leaving the wall costs nothing");
  const again = ok(apply(s, { type: "move", actor: b.id, to: inW }, DM));
  assert.equal(hurt(again.events, b.id).length, 0, "only the first time on a turn");
  const end = ok(apply(s, { type: "endTurn", actor: b.id }, DM));
  assert.equal(hurt(end.events, b.id, "fire").length, 1, "ending the turn inside burns again");
  assert.equal(saves(end.events, b.id).length, 0);
  // A's turn: it ends it inside the wall: it burns, and it has not been burnt at the start of a turn.
  const toA = [];
  for (let i = 0; i < 20 && current(s) !== a.id; i++) toA.push(...ok(apply(s, { type: "endTurn", actor: current(s) }, DM)).events);
  assert.equal(hurt(toA, a.id).length, 0, "nothing at the start of a turn");
  const aEnd = ok(apply(s, { type: "endTurn", actor: a.id }, DM));
  assert.equal(hurt(aEnd.events, a.id, "fire").length, 1);
});

test("Wall of Fire: walking across it burns once, on the way in; a higher slot grows both damages", () => {
  const s = field(), g = spawn(s, "goblin-warrior", 2, 0);
  g.abil.dex = 1;
  fight(s); turnOf(s, "wizard");
  const cast = ok(apply(s, { type: "cast", actor: "wizard", spell: "wall-of-fire", slot: 5, hex: { q: 3, r: 0 } }, DM));
  const fx = fxOf(s, "Wall of Fire");
  assert.equal(fx.zone.steps[0].damage, "6d8", "the later damage grows with the slot");
  assert.equal(cast.events.filter((e) => e.type === "save").length, 0, "nobody in it as it appears");
  turnOf(s, g.id);
  // Walking into the wall stops the walk there (as walking into any zone does) and burns; going on through the far side does not burn again.
  const cross = ok(apply(s, { type: "move", actor: g.id, to: { q: 4, r: 0 } }, DM));
  assert.equal(hurt(cross.events, g.id, "fire").length, 1, JSON.stringify(cross.events.map((e) => e.type)));
  assert.deepEqual([g.pos.q, g.pos.r], [3, 0]);
  const on = ok(apply(s, { type: "move", actor: g.id, to: { q: 4, r: 0 } }, DM));
  assert.equal(hurt(on.events, g.id).length, 0, "leaving through the far side burns nothing");
  assert.equal(g.pos.q, 4);
});

const nb = (h) => [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([dq, dr]) => ({ q: h.q + dq, r: h.r + dr }));

test("Wall of Thorns: Piercing save as it appears; Slashing save on entering or ending a turn, once a turn; sight blocked; both grow with the slot", () => {
  const def = SPELLS["wall-of-thorns"].def;
  assert.equal(def.tier, "assist");
  assert.deepEqual(lint(def), []);
  const s = field(), a = spawn(s, "goblin-warrior", 3, 0), b = spawn(s, "goblin-warrior", 2, 1);
  for (const g of [a, b]) g.abil.dex = 1;
  fight(s); turnOf(s, "wizard");
  s.entities.wizard.spells.push("wall-of-thorns");
  const cast = ok(apply(s, { type: "cast", actor: "wizard", spell: "wall-of-thorns", slot: 7, hex: { q: 3, r: 0 } }, DM));
  const first = hurt(cast.events, a.id);
  assert.equal(first.length, 1);
  assert.equal(first[0].dtype, "piercing");
  assert.equal(first[0].dice.length, 8, "7d8 and one more d8 for the slot above 6");
  const fx = fxOf(s, "Wall of Thorns");
  assert.equal(fx.zone.steps[0].onFail[0].damage, "8d8", "the later damage grows as well");
  assert.equal(fx.zone.steps[0].onFail[0].type, "slashing");
  assert.ok(!fx.terrain.difficult && obscuredAt(s, { q: 3, r: 0, z: 0 }) === "heavy", "it blocks sight; the 4-for-1 movement is the DM's, not the engine's doubled cost");
  const told = cast.events.filter((e) => e.type === "manual" && e.spell === "wall-of-thorns").map((e) => e.text).join(" ");
  assert.match(told, /4 feet of a creature's movement for every 1 foot/);
  // B walks in: a save and Slashing damage. Out and in again the same turn: nothing more. The turn ends inside: nothing either, it already saved this turn.
  const hexes = new Set(fx.zone.hexes), inW = nb(b.pos).find((h) => hexes.has(`${h.q},${h.r}`) && !(h.q === 3 && h.r === 0));
  turnOf(s, b.id);
  const into = ok(apply(s, { type: "move", actor: b.id, to: inW }, DM));
  assert.equal(saves(into.events, b.id).length, 1);
  assert.equal(hurt(into.events, b.id, "slashing").length, 1);
  ok(apply(s, { type: "move", actor: b.id, to: { q: 2, r: 1 } }, DM));
  const again = ok(apply(s, { type: "move", actor: b.id, to: inW }, DM));
  assert.equal(saves(again.events, b.id).length, 0, "a creature makes the save only once a turn");
  const end = ok(apply(s, { type: "endTurn", actor: b.id }, DM));
  assert.equal(saves(end.events, b.id).length, 0);
  // A's own turn: it ends it in the wall, and saves.
  for (let i = 0; i < 20 && current(s) !== a.id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  const aEnd = ok(apply(s, { type: "endTurn", actor: a.id }, DM));
  assert.equal(saves(aEnd.events, a.id).length, 1);
  assert.equal(hurt(aEnd.events, a.id, "slashing").length, 1);
});

test("Blade Barrier: the save is on entering or ending a turn there, not on starting one, and only once a turn; the cover is the DM's, for both sides", () => {
  const def = SPELLS["blade-barrier"].def;
  assert.equal(def.tier, "assist");
  assert.deepEqual(lint(def), []);
  assert.deepEqual(def.zone, { on: ["enter", "turnEnd"], once: "turn", atCast: true }, "2024 text: \"ends its turn\", not the 2014 \"starts\"");
  const s = field(), a = spawn(s, "goblin-warrior", 3, 0), b = spawn(s, "goblin-warrior", 2, 1);
  for (const g of [a, b]) g.abil.dex = 1;
  fight(s); turnOf(s, "cleric");
  const cast = ok(apply(s, { type: "cast", actor: "cleric", spell: "blade-barrier", slot: 6, hex: { q: 3, r: 0 } }, DM));
  assert.equal(hurt(cast.events, a.id, "force").length, 1, "6d10 force on a failed save as it appears");
  assert.equal(hurt(cast.events, a.id, "force")[0].dice.length, 6);
  const say = cast.events.filter((e) => e.type === "manual" && e.spell === "blade-barrier").map((e) => e.text).join(" ");
  assert.match(say, /Three-Quarters Cover/);
  assert.match(say, /either side/);
  assert.ok(fxOf(s, "Blade Barrier").terrain.difficult, "its space is Difficult Terrain");
  // A starts its turn in the wall: no save. It ends it there: a save (the cast already counted for the turn it was made in, which was the cleric's).
  const toA = [];
  for (let i = 0; i < 20 && current(s) !== a.id; i++) toA.push(...ok(apply(s, { type: "endTurn", actor: current(s) }, DM)).events);
  assert.equal(saves(toA, a.id).length, 0, "starting a turn in the wall is not a save");
  const aEnd = ok(apply(s, { type: "endTurn", actor: a.id }, DM));
  assert.equal(saves(aEnd.events, a.id).length, 1, "ending it there is");
  // B enters on its turn and saves once; in and out and in again, and the end of the turn, give no more.
  const hexes = new Set(fxOf(s, "Blade Barrier").zone.hexes), inW = nb(b.pos).find((h) => hexes.has(`${h.q},${h.r}`) && !(h.q === 3 && h.r === 0));
  turnOf(s, b.id);
  assert.equal(saves(ok(apply(s, { type: "move", actor: b.id, to: inW }, DM)).events, b.id).length, 1);
  ok(apply(s, { type: "move", actor: b.id, to: { q: 2, r: 1 } }, DM));
  assert.equal(saves(ok(apply(s, { type: "move", actor: b.id, to: inW }, DM)).events, b.id).length, 0);
  assert.equal(saves(ok(apply(s, { type: "endTurn", actor: b.id }, DM)).events, b.id).length, 0, "once per turn");
});

test("Flaming Sphere: a zone on the ground that saves a creature ending its turn within 5 feet; rolled 30 feet as a Bonus Action, stopping in a creature's space", () => {
  const def = SPELLS["flaming-sphere"].def;
  // SRD 5.2.1 header: "Level 2 Conjuration (Druid, Sorcerer, Wizard)". The 2024 school the community rulings pass reports (evocation) is not what the SRD text we hold says.
  assert.equal(def.school, "conjuration");
  assert.equal(def.tier, "assist");
  assert.deepEqual(lint(def), []);
  assert.deepEqual(def.zone, { on: ["turnEnd"], move: 30 });
  const s = field(), a = spawn(s, "goblin-warrior", 3, 1), b = spawn(s, "goblin-warrior", 8, 2), c = spawn(s, "goblin-warrior", 7, 0);
  for (const g of [a, b, c]) g.abil.dex = 1;
  fight(s); turnOf(s, "wizard");
  assert.match(apply(s, { type: "cast", actor: "wizard", spell: "flaming-sphere", slot: 2, hex: { q: 3, r: 1 } }, DM).error, /unoccupied space/, "not in a creature's space");
  const cast = ok(apply(s, { type: "cast", actor: "wizard", spell: "flaming-sphere", slot: 3, hex: { q: 3, r: 0 } }, DM));
  assert.equal(cast.events.filter((e) => e.type === "save").length, 0, "nobody saves as it appears");
  const fx = fxOf(s, "Flaming Sphere");
  assert.equal(fx.zone.steps[0].onFail[0].damage, "3d6", "1d6 more for the slot above 2");
  assert.deepEqual(fx.zone.hexes.sort(), ["2,0", "2,1", "3,-1", "3,0", "3,1", "4,-1", "4,0"].sort(), "its hex and the six round it");
  // A goblin beside it ends its turn there: a save and 3d6 fire. One two hexes off does not.
  const toA = [];
  for (let i = 0; i < 20 && current(s) !== a.id; i++) toA.push(...ok(apply(s, { type: "endTurn", actor: current(s) }, DM)).events);
  const end = ok(apply(s, { type: "endTurn", actor: a.id }, DM));
  assert.equal(saves(end.events, a.id).length, 1);
  assert.equal(hurt(end.events, a.id, "fire").length, 1);
  assert.equal(hurt([...toA, ...end.events], b.id).length, 0);
  // The caster rolls it on a later turn: 30 feet is six hexes. Seven is too far; the nearer one runs into C at (7,0), who saves, and it stops there.
  turnOf(s, "wizard");
  const slots = s.entities.wizard.slots[2], bonus = s.encounter.budget.bonus;
  assert.match(apply(s, { type: "moveZone", actor: "fighter", to: { q: 5, r: 0 } }, DM).error, /nothing to roll/);
  assert.match(apply(s, { type: "moveZone", actor: "wizard", to: { q: 10, r: 0 } }, DM).error, /rolls 30 ft/);
  assert.equal(s.encounter.budget.bonus, bonus, "a refusal spends nothing");
  const roll = ok(apply(s, { type: "moveZone", actor: "wizard", to: { q: 9, r: 0 } }, DM));
  assert.equal(s.encounter.budget.bonus, bonus - 1, "a Bonus Action");
  const stopped = fxOf(s, "Flaming Sphere");
  assert.deepEqual([stopped.zone.origin.q, stopped.zone.origin.r], [7, 0], "it stopped in the creature's space");
  assert.equal(saves(roll.events, c.id).length, 1, "the creature it rolled into saves");
  assert.equal(hurt(roll.events, c.id, "fire").length, 1);
  assert.equal(roll.events.find((e) => e.type === "zoneMoved").met, c.id);
  assert.match(apply(s, { type: "moveZone", actor: "wizard", to: { q: 8, r: 0 } }, DM).error, /Bonus Action/, "one Bonus Action a turn");
  assert.equal(s.entities.wizard.slots[2], slots);
  // The goblins beside its new place save when their turns end; the one it left behind does not.
  assert.ok(stopped.zone.hexes.includes("8,0") && !stopped.zone.hexes.includes("4,0"));
});

test("Flaming Sphere: ending Concentration takes it away; players are not sent its place", () => {
  const s = field(), a = spawn(s, "goblin-warrior", 4, 0);
  a.abil.dex = 1;
  fight(s); turnOf(s, "wizard");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "flaming-sphere", slot: 2, hex: { q: 3, r: 0 } }, DM));
  s.entities.wizard.owner = "pat";
  const seen = view(s, { role: "player", userId: "pat" }).effects.find((x) => x.name === "Flaming Sphere");
  assert.equal("zone" in seen, false, "the zone (and so its place) is not sent");
  ok(apply(s, { type: "endEffect", effect: fxOf(s, "Flaming Sphere").id }, DM));
  assert.equal(fxOf(s, "Flaming Sphere"), undefined);
  assert.match(apply(s, { type: "moveZone", actor: "wizard", to: { q: 5, r: 0 } }, DM).error, /nothing to roll/);
});

test("Wall of Stone stays manual: a wall that is an object with panels is not a zone, so the cast hands everything to the DM and changes nothing", () => {
  const def = SPELLS["wall-of-stone"].def;
  assert.equal(def.tier, "manual");
  assert.ok(def.effects.some((x) => "manual" in x));
  const s = field(), g = spawn(s, "goblin-warrior", 3, 0);
  fight(s); turnOf(s, "wizard");
  const hp = g.hp, walls = s.map.walls.length, objects = s.map.objects.length;
  const cast = ok(apply(s, { type: "cast", actor: "wizard", spell: "wall-of-stone", slot: 5 }, DM));
  assert.ok(cast.events.some((e) => e.type === "manual" && /Wall of Stone/.test(e.text)), "the DM is told");
  assert.equal(g.hp, hp);
  assert.deepEqual([s.map.walls.length, s.map.objects.length], [walls, objects], "no wall appears on the map");
  assert.equal(s.effects.filter((x) => x.zone || x.terrain).length, 0);
});

test("a placed wall on a square map: centred on the square chosen, across the caster's line by default, 5 feet wide, and a creature in it saves as it appears", () => {
  const s = newGame(14);
  ok(apply(s, { type: "loadMap", map: squareRoom() }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  for (const [id, q, r] of [["fighter", 0, 14], ["rogue", 1, 14], ["cleric", 2, 14], ["wizard", 3, 7]]) s.entities[id].pos = { q, r, z: 0 };
  Object.assign(s.entities.wizard, { slots: { 4: 2 }, slotsMax: { 4: 2 } });
  s.entities.wizard.spells.push("wall-of-fire");
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 500;
  const east = areaHexes(s, s.entities.wizard, SPELLS["wall-of-fire"], { q: 8, r: 7 }).map((h) => `${h.q},${h.r}`);
  assert.equal(east.length, 12, east.join(" "));
  assert.ok(east.every((k) => k.startsWith("8,")), "a column: across the line east from the caster");
  const along = areaHexes(s, s.entities.wizard, SPELLS["wall-of-fire"], { q: 8, r: 7 }, { q: 9, r: 7 }).map((h) => `${h.q},${h.r}`);
  assert.ok(along.every((k) => k.endsWith(",7")) && along.includes("8,7"), along.join(" "));
  const g = spawn(s, "goblin-warrior", 8, 7); g.hp = g.maxHp = 500; g.abil.dex = 1;
  fight(s); turnOf(s, "wizard");
  const cast = ok(apply(s, { type: "cast", actor: "wizard", spell: "wall-of-fire", slot: 4, hex: { q: 8, r: 7 } }, DM));
  assert.equal(saves(cast.events, g.id).length, 1);
  assert.equal(hurt(cast.events, g.id, "fire").length, 1);
});
