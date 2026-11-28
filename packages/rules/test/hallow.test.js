// Issue #918 (B3b of #786): Hallow (assist: a 60-foot sphere that only bars the chosen kinds of creature: a barrier with no Disadvantage and no reverse) and the
// sixth ward kind, Aberration, which Magic Circle still does not offer. Built to docs/specs/rules-expansion.md, "Build notes: wave 5 part 3" (Hallow, #918). Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { WARDS, lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { apply } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { immuneTo, modifiers } from "../src/modifiers.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const bad = (r, re) => { assert.ok(!r.ok, "expected a refusal"); if (re) assert.match(r.error, re); return r; };
const lint = (def) => lintEntry("spells", def, { strict: false });
const byName = (s, name) => Object.values(s.entities).find((e) => e.name === name);
const saves = (r) => r.events.filter((e) => e.type === "save");

function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (let q = -16; q <= 40; q++) for (let r = -16; r <= 16; r++) s.map.levels[0].tiles[`${q},${r}`] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", -6, 0], ["fighter", -8, 0], ["rogue", -8, 2], ["cleric", 0, 0]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  Object.assign(s.entities.cleric, { slots: { 3: 3, 5: 2 }, slotsMax: { 3: 3, 5: 2 } });
  s.entities.cleric.spells.push("hallow", "magic-circle");
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 80;
  return s;
}
const spawn = (s, monster, q, r, name) => { ok(apply(s, { type: "spawn", monster, at: { q, r }, name }, DM)); return byName(s, name); };
// The cleric touches a point beside it (5 feet): the sphere is 12 hexes across from there.
const hallow = (s, extra = {}, hex = { q: 21, r: 0 }) => (s.entities.cleric.pos = { q: 20, r: 0, z: 0 }) && apply(s, { type: "cast", actor: "cleric", spell: "hallow", hex, slot: 5, choice: ["undead", "aberration"], ...extra }, DM);

test("Hallow: assist, lints, reads with no problem; six kinds on offer, a Magic Circle still five; `bar` is held to its place", () => {
  const d = SPELLS.hallow.def;
  assert.equal(d.tier, "assist");
  assert.deepEqual(lint(d), []);
  assert.deepEqual(readEntry("spell", d, {}).problems ?? [], []);
  assert.deepEqual(WARDS, ["aberration", "celestial", "elemental", "fey", "fiend", "undead"]);
  assert.deepEqual(SPELLS["magic-circle"].def.choice.from, ["celestial", "elemental", "fey", "fiend", "undead"]);
  assert.deepEqual(lint(SPELLS["magic-circle"].def), []);
  assert.ok(lint({ ...d, zone: { ward: "bar", on: ["enter"] } }).length, "a ward has no `on`");
  assert.ok(lint({ ...d, zone: { ward: "foo" } }).length, "bar is the only word");
  assert.ok(lint({ ...d, choice: undefined }).length, "a ward needs its choice");
  assert.ok(lint({ ...d, target: { area: { shape: "cube", size: 60 } } }).length, "a sphere or a cylinder");
  assert.ok(lint({ ...SPELLS["magic-circle"].def, zone: { ward: true }, target: { area: { shape: "sphere", size: 10 } } }).length, "a true ward is still a cylinder");
  assert.ok(lint({ ...SPELLS["magic-circle"].def, choice: { of: "ward", from: ["celestial", "dragon"] } }).length, "`from` lists wards");
  const text = readEntry("spell", d, {}).lines.join("\n");
  assert.match(text, /cannot teleport into it/);
  assert.match(text, /no Disadvantage/);
  assert.match(text, /within 5 feet/, "touch reads as 5 feet");
});

test("Hallow: the cast is a sphere of 60 feet round the touched point, no Concentration, and the choice is a validated list with no reverse", () => {
  const s = field();
  bad(apply(s, { type: "cast", actor: "cleric", spell: "hallow", hex: { q: 21, r: 0 }, slot: 5 }, DM), /Choose one or more/);
  bad(hallow(s, { choice: ["dragon"] }), /Choose one or more/);
  bad(hallow(s, { choice: [] }), /Choose one or more/);
  bad(hallow(s, { reverse: true }), /nothing to reverse/);
  bad(hallow(s, {}, { q: 30, r: 0 }), /reaches 5 ft|away/);
  assert.equal(s.entities.cleric.slots[5], 2, "nothing was spent");
  assert.equal(s.effects.length, 0);
  const r = ok(hallow(s, { reverse: false }));
  assert.ok(r.events.some((e) => e.type === "manual"), "the DM is told what is theirs");
  const fx = s.effects.find((x) => x.name === "Hallow");
  assert.deepEqual(fx.zone.ward, { types: ["undead", "aberration"], reverse: false, bar: true });
  assert.equal(fx.zone.area.shape, "sphere");
  assert.equal(fx.zone.area.size, 60);
  assert.ok(fx.zone.hexes.includes("21,0") && fx.zone.hexes.includes("33,0") && !fx.zone.hexes.includes("34,0"), "12 hexes out");
  assert.equal(s.entities.cleric.slots[5], 1);
});

test("Hallow: an undead walks in refused (a beast is not), and an aberration likewise; one already inside may move about and leave", () => {
  const s = field();
  ok(hallow(s));
  const skel = spawn(s, "skeleton", 40, 0, "Skel"), wolf = spawn(s, "wolf", 40, 3, "Wolf"), abom = spawn(s, "gibbering-mouther", 40, -4, "Aboleth");
  const at = skel.pos;
  bad(apply(s, { type: "move", actor: skel.id, to: { q: 32, r: 0 } }, DM), /Hallow keeps Skel from passing into it/);
  bad(apply(s, { type: "move", actor: abom.id, to: { q: 31, r: -4 } }, DM), /keeps Aboleth/);
  assert.deepEqual(skel.pos, at, "nothing changed");
  ok(apply(s, { type: "move", actor: wolf.id, to: { q: 31, r: 3 } }, DM));
  ok(apply(s, { type: "move", actor: skel.id, to: { q: 34, r: 0 } }, DM), "up to the edge");
  const inside = spawn(s, "skeleton", 40, 6, "Inside");
  inside.pos = { q: 25, r: 0, z: 0 };
  ok(apply(s, { type: "move", actor: inside.id, to: { q: 27, r: 0 } }, DM));
  ok(apply(s, { type: "move", actor: inside.id, to: { q: 38, r: 0 } }, DM));
  bad(apply(s, { type: "move", actor: inside.id, to: { q: 30, r: 0 } }, DM), /passing into/);
});

test("Hallow: it counts below the centre as well as above (a sphere), and Magic Circle's cylinder is as it was", () => {
  const s = field();
  ok(hallow(s));
  const fx = s.effects.find((x) => x.name === "Hallow");
  const skel = spawn(s, "skeleton", 40, 0, "Skel");
  const inW = (z) => import("../src/modifiers.js").then((m) => m.inWard(s, fx, skel, { q: 25, r: 0, z }));
  return Promise.all([inW(0), inW(55), inW(-55), inW(65), inW(-65)]).then(([a, b, c, d, e]) => {
    assert.deepEqual([a, b, c, d, e], [true, true, true, false, false]);
  });
});

test("Hallow: teleporting in is refused outright, with no save, the cast spent; a beast teleports in, and a type not chosen too", () => {
  const s = field();
  ok(hallow(s));
  const skel = spawn(s, "skeleton", 36, 0, "Skel");
  skel.spells = ["misty-step"]; skel.slots = { 2: 9 }; skel.slotsMax = { 2: 9 };
  for (let i = 0; i < 6; i++) {
    skel.pos = { q: 36, r: 0, z: 0 };
    const slots = skel.slots[2];
    const r = ok(apply(s, { type: "cast", actor: skel.id, spell: "misty-step", hex: { q: 32, r: 0 } }, DM));
    assert.deepEqual(saves(r).filter((e) => e.id === skel.id), [], "no save");
    assert.equal(skel.pos.q, 36, "it stays where it was");
    assert.equal(skel.slots[2], slots - 1, "the slot is spent");
    assert.ok(r.events.some((e) => e.type === "note" && /Hallow stops Skel/.test(e.text)));
  }
  const imp = spawn(s, "bearded-devil", 36, 3, "Devil");
  imp.spells = ["misty-step"]; imp.slots = { 2: 3 }; imp.slotsMax = { 2: 3 };
  ok(apply(s, { type: "cast", actor: imp.id, spell: "misty-step", hex: { q: 32, r: 3 } }, DM));
  assert.equal(imp.pos.q, 32, "a Fiend was not chosen");
});

test("Hallow: no Disadvantage on attack rolls against targets inside, where Magic Circle gives it", () => {
  const s = field();
  ok(hallow(s));
  const skel = spawn(s, "skeleton", 40, 0, "Skel");
  s.entities.fighter.pos = { q: 22, r: 1, z: 0 };
  const against = (who, target) => modifiers(s, who, "attack.roll", { attacker: who, target }, "attacker").disadvantage;
  assert.deepEqual(against(skel, s.entities.fighter), []);
  // a Magic Circle (the same spot) still does
  s.entities.cleric.pos = { q: 20, r: 0, z: 0 };
  ok(apply(s, { type: "cast", actor: "cleric", spell: "magic-circle", hex: { q: 21, r: 0 }, slot: 3, choice: ["undead"] }, DM));
  assert.deepEqual(against(skel, s.entities.fighter), ["Magic Circle"]);
});

test("Hallow: a chosen type cannot give a target inside the Charmed or Frightened condition; other conditions, other givers and targets outside are not stopped", () => {
  const s = field();
  ok(hallow(s));
  const skel = spawn(s, "skeleton", 40, 0, "Skel"), dev = spawn(s, "bearded-devil", 40, 3, "Dev"), abom = spawn(s, "gibbering-mouther", 40, -3, "Aboleth");
  s.entities.fighter.pos = { q: 25, r: 1, z: 0 };
  s.entities.rogue.pos = { q: 38, r: 1, z: 0 };
  const f = s.entities.fighter;
  assert.equal(immuneTo(s, f, "charmed", skel), true);
  assert.equal(immuneTo(s, f, "frightened", abom), true);
  assert.equal(immuneTo(s, f, "frightened", dev), false, "a Fiend was not chosen");
  assert.equal(immuneTo(s, f, "poisoned", skel), false);
  assert.equal(immuneTo(s, f, "charmed", undefined), false);
  assert.equal(immuneTo(s, s.entities.rogue, "charmed", skel), false, "a target outside");
});

test("Hallow: a Magic Circle refuses Aberration, and still works as before", () => {
  const s = field();
  s.entities.cleric.pos = { q: 20, r: 0, z: 0 };
  const circle = (extra) => apply(s, { type: "cast", actor: "cleric", spell: "magic-circle", hex: { q: 22, r: 0 }, slot: 3, choice: ["undead"], ...extra }, DM);
  bad(circle({ choice: ["aberration"] }), /Choose one or more kinds of creature for Magic Circle \(celestial, elemental, fey, fiend, undead\)/);
  bad(circle({ choice: ["undead", "aberration"] }), /Choose one or more/);
  assert.equal(s.entities.cleric.slots[3], 3, "nothing was spent");
  ok(circle({ reverse: true }));
  const fx = s.effects.find((x) => x.name === "Magic Circle");
  assert.deepEqual(fx.zone.ward, { types: ["undead"], reverse: true }, "no `bar` on a circle");
  assert.equal(fx.zone.area.shape, "cylinder");
});

test("Hallow: a Hallow of a caster the party cannot see bars no creature of the party (the DM is told), and a foe is still barred, teleporting too", () => {
  const s = field();
  s.entities.cleric.hidden = true;
  s.entities.cleric.side = "foe";
  const r = ok(hallow(s, { choice: ["fey"] }));
  assert.ok(r.events.some((e) => e.type === "manual" && e.partial && /hiding|hidden|not know/i.test(e.text) && !/reverse|in, if/.test(e.text)), "the DM is told");
  const pc = s.entities.fighter;
  pc.type = "fey";
  pc.pos = { q: 40, r: 0, z: 0 };
  ok(apply(s, { type: "move", actor: pc.id, to: { q: 32, r: 0 } }, DM));
  pc.spells = ["misty-step"]; pc.slots = { 2: 3 }; pc.slotsMax = { 2: 3 };
  pc.pos = { q: 36, r: 0, z: 0 };
  ok(apply(s, { type: "cast", actor: pc.id, spell: "misty-step", hex: { q: 32, r: 0 } }, DM));
  assert.equal(pc.pos.q, 32, "the party's creature teleports in");
  const foe = spawn(s, "sprite", 40, -4, "Foe");
  bad(apply(s, { type: "move", actor: foe.id, to: { q: 31, r: -4 } }, DM), /keeps Foe/);
});
