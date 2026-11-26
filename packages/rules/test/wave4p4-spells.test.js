// Wave 4, part 4, of issue #786: Water Walk (assist, through the `surface` hook), Teleport (assist, the Teleportation Outcome table), Water Breathing (kept manual).
// Built to docs/specs/rules-expansion.md, "Build notes: wave 4 part 4". Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintEntry, CHOICES, FAMILIARITY } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { apply, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { moveOptions } from "../src/engine/world.js";
import { TELEPORT_TABLE } from "../src/effects.js";
import { walksOn } from "../src/modifiers.js";
import { col } from "../src/grid.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const lint = (def) => lintEntry("spells", def, { strict: false });
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", 0, 0], ["fighter", -2, 0], ["rogue", -4, 4], ["cleric", -3, 0]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  const slots = { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 2, 7: 1 };
  for (const id of ["wizard", "cleric"]) Object.assign(s.entities[id], { slots: { ...slots }, slotsMax: { ...slots } });
  s.entities.wizard.spells.push("water-walk", "water-breathing", "teleport");
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 60;
  return s;
}
const manualTexts = (r) => r.events.filter((e) => e.type === "manual").map((e) => e.text).join("\n");

test("tiers: Water Walk and Teleport are assist; Water Breathing stays manual; the entries lint and read", () => {
  assert.equal(SPELLS["water-walk"].def.tier, "assist");
  assert.equal(SPELLS["teleport"].def.tier, "assist");
  assert.equal(SPELLS["water-breathing"].def.tier, "manual");
  for (const id of ["water-walk", "teleport", "water-breathing"]) {
    assert.deepEqual(lint(SPELLS[id].def), [], id);
    assert.deepEqual(readEntry("spell", SPELLS[id].def, {}).problems ?? [], [], id);
  }
});

test("surface hook: only a modifier step for water, alone; familiarity: only 'chosen', on a teleport step with a choice of familiarity", () => {
  const def = SPELLS["water-walk"].def;
  const bad = (m) => assert.ok(lint({ ...def, effects: [{ modifier: m }] }).length, JSON.stringify(m));
  bad({ on: "surface", op: "add", value: 1, scope: { surface: "water" } });
  bad({ on: "surface", op: "immune" });
  bad({ on: "surface", op: "immune", scope: { surface: "lava" } });
  bad({ on: "check", op: "add", value: 1, scope: { surface: "water" } });
  const tp = SPELLS.teleport.def;
  assert.ok(lint({ ...tp, effects: [{ teleport: 1000, familiarity: "very-familiar" }] }).length, "a named familiarity");
  assert.ok(lint({ ...tp, choice: undefined }).length, "no choice to fill it");
  assert.ok(lint({ ...SPELLS["misty-step"].def, effects: [{ damage: "1d6", type: "fire", familiarity: "chosen" }] }).length, "not on another step");
  assert.deepEqual(CHOICES.familiarity, FAMILIARITY);
  for (const f of FAMILIARITY) assert.ok(TELEPORT_TABLE[f], f);
});

test("Water Walk: before the spell the water is no way across; after it the target crosses and stands on it; the effect ends and it does not", () => {
  const s = field();
  const tiles = s.map.levels[0].tiles;
  for (let q = -6; q <= -4; q++) for (let r = -3; r <= 3; r++) tiles[col({ q, r })] = { t: "water" };
  ok(apply(s, { type: "place", actor: "fighter", to: { q: -2, r: 0 } }, DM));
  const reach = () => moveOptions(s, s.entities.fighter);
  const at = (q) => [...reach().values()].find((v) => v.h.q === q && v.h.r === 0);
  assert.equal(at(-4), undefined, "water is no place to go");
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "water-walk", targets: ["fighter"], slot: 3 }, DM));
  assert.ok(/Water Walk/.test(manualTexts(r)), "the spell's own note for the DM");
  assert.equal(walksOn(s, s.entities.fighter), true);
  assert.equal(walksOn(s, s.entities.rogue), false, "a creature not targeted");
  assert.ok(at(-4)?.canStop, "it can stop on the water");
  ok(apply(s, { type: "move", actor: "fighter", to: { q: -4, r: 0 } }, DM));
  assert.equal(s.entities.fighter.pos.q, -4);
  const fx = s.effects.find((x) => x.spell === "water-walk");
  ok(apply(s, { type: "endEffect", effect: fx.id }, DM));
  assert.equal(walksOn(s, s.entities.fighter), false, "the effect is over");
  assert.equal(at(-5), undefined, "and no more water to walk on");
});

test("Water Walk and a real Monk: Acrobatic Movement crosses water without stopping; with Water Walk the Monk may stop; the spell does not change the feature", () => {
  const s = field();
  const sheet = { name: "Lo", class: "monk", level: 9, subclass: "open-hand", abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 14, cha: 8 }, skills: ["acrobatics", "insight"], weapons: ["quarterstaff"] };
  s.entities.monk = makeEntity(derive(sheet).record, { id: "monk", kind: "pc", side: "party", pos: { q: 2, r: 2, z: 0 } });
  for (const h of [{ q: 3, r: 2 }, { q: 4, r: 2 }]) s.map.levels[0].tiles[col(h)] = { t: "water" };
  const at = (q) => [...moveOptions(s, s.entities.monk).values()].find((v) => v.h.q === q && v.h.r === 2);
  assert.ok(at(3) && !at(3).canStop, "without the spell: crossed, not stood on");
  assert.ok(at(5)?.canStop, "the far bank");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "water-walk", targets: ["monk"], slot: 3 }, DM));
  assert.ok(at(3)?.canStop && at(4)?.canStop && at(5)?.canStop, "with the spell: it may stop on the water");
  const t = field();
  t.entities.monk = makeEntity(derive(sheet).record, { id: "monk", kind: "pc", side: "party", pos: { q: 2, r: 2, z: 0 } });
  for (const h of [{ q: 3, r: 2 }, { q: 4, r: 2 }]) t.map.levels[0].tiles[col(h)] = { t: "water" };
  ok(apply(t, { type: "cast", actor: "wizard", spell: "water-walk", targets: ["fighter"], slot: 3 }, DM));
  const u = [...moveOptions(t, t.entities.monk).values()].find((v) => v.h.q === 3 && v.h.r === 2);
  assert.ok(u && !u.canStop, "the spell on someone else leaves the feature as it was");
});

const ON = (s) => s.entities.wizard.pos;
test("Teleport on target: a permanent circle always arrives; the caster is moved to the space named and the DM is told, the players are not", () => {
  const s = field();
  const to = { q: 8, r: 3 };
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "teleport", slot: 7, choice: "permanent-circle", hex: to }, DM));
  assert.deepEqual([ON(s).q, ON(s).r], [8, 3]);
  const note = r.events.find((e) => e.type === "manual" && e.partial);
  assert.ok(/permanent circle\): on target/.test(note.text), note.text);
  assert.ok(r.events.some((e) => e.type === "moved" && e.teleport));
  assert.ok(/eight other willing creatures/.test(manualTexts(r)), "the spell's own note names the other travellers");
});

test("Teleport with no space named: the engine rolls, and tells the DM to move the group; nothing moves", () => {
  const s = field();
  const from = { ...ON(s) };
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "teleport", slot: 7, choice: "linked-object" }, DM));
  assert.deepEqual(ON(s), from);
  assert.ok(/on target\. The cast named no space/.test(r.events.find((e) => e.type === "manual" && e.partial).text));
});

test("Teleport to a false destination never arrives: Similar Area, or a Mishap then Similar Area; the caster stays and the DM places the group", () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const s = field(seed), from = { ...ON(s) }, hp = s.entities.wizard.hp;
    const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "teleport", slot: 7, choice: "false-destination", hex: { q: 8, r: 3 } }, DM));
    assert.deepEqual(ON(s), from, `seed ${seed}: not moved`);
    const note = r.events.find((e) => e.type === "manual" && e.partial).text;
    assert.ok(/Similar Area/.test(note), note);
    assert.ok(!r.events.some((e) => e.type === "moved"), "no move");
    if (/Mishap/.test(note)) assert.ok(s.entities.wizard.hp < hp, "the Mishap's damage was applied");
  }
});

test("Teleport, very familiar: over many seeds every outcome comes up, Mishap damage is Force and 3d10, Off Target names miles and a direction", () => {
  const seen = { on: 0, similar: 0, off: 0, mishap: 0 };
  for (let seed = 1; seed <= 120; seed++) {
    const s = field(seed), from = { ...ON(s) };
    const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "teleport", slot: 7, choice: "very-familiar", hex: { q: 8, r: 3 } }, DM));
    const note = r.events.find((e) => e.type === "manual" && e.partial).text;
    const moved = ON(s).q !== from.q || ON(s).r !== from.r;
    if (/on target\./.test(note)) { seen.on++; assert.ok(moved); } else { assert.ok(!moved, note); }
    if (/Similar Area/.test(note)) seen.similar++;
    if (/Off Target/.test(note)) { seen.off++; assert.ok(/\d+ miles (east|southeast|south|southwest|west|northwest|north|northeast) of the destination/.test(note), note); }
    if (/Mishap/.test(note)) {
      seen.mishap++;
      const dmg = r.events.filter((e) => e.type === "damage" && e.target === "wizard");
      assert.ok(dmg.length >= 1 && dmg.every((d) => d.dtype === "force" && d.dice.length === 3 && d.dice.every((x) => x.sides === 10)), JSON.stringify(dmg));
      assert.equal(dmg.length, (note.match(/(\d+) Mishaps/) ?? [0, 1])[1] * 1, "one 3d10 for each Mishap");
    }
  }
  assert.ok(seen.on > 40 && seen.similar > 0 && seen.off > 0 && seen.mishap > 0, JSON.stringify(seen));
});

test("Teleport: a casting without a familiarity is refused, and no slot is spent", () => {
  const s = field();
  const r = apply(s, { type: "cast", actor: "wizard", spell: "teleport", slot: 7, hex: { q: 8, r: 3 } }, DM);
  assert.equal(r.ok, false);
  assert.ok(/familiarity/i.test(r.error), r.error);
  assert.equal(s.entities.wizard.slots[7], 1, "no slot spent");
});

test("Teleport: a destination a known creature occupies, or one with nothing to stand on, is refused with no slot spent; an unknown creature there means the DM places the caster", () => {
  const s = field();
  const cast = (hex) => apply(s, { type: "cast", actor: "wizard", spell: "teleport", slot: 7, choice: "permanent-circle", hex }, DM);
  const from = { ...ON(s) };
  assert.equal(cast({ q: -2, r: 0 }).ok, false, "the fighter stands there");
  assert.equal(cast({ q: 500, r: 500 }).ok, false, "nothing there to stand on");
  assert.equal(s.entities.wizard.slots[7], 1, "no slot spent");
  assert.deepEqual(ON(s), from);
  // A creature the party does not know of stands on the destination: the caster is not moved; the DM is told.
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 8, r: 3 }, name: "Ghost", hidden: true }, DM));
  const r = ok(cast({ q: 8, r: 3 }));
  assert.deepEqual(ON(s), from, "not moved");
  assert.ok(!r.events.some((e) => e.type === "moved"));
  assert.ok(/did not know of stands/.test(r.events.find((e) => e.type === "manual" && e.partial).text));
});
