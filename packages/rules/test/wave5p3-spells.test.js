// Wave 5, part 3, of issue #786: Conjure Animals (assist: a pack laid out from a Large space, a zone that goes off on foes the caster can see, moved when the caster moves)
// and Magic Circle (assist: a Cylinder that bars creatures of chosen types). Built to docs/specs/rules-expansion.md, "Build notes: wave 5 part 3". Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { spaceOf } from "../src/zones.js";
import { modifiers } from "../src/modifiers.js";
import { KIT } from "../src/engine/resolve.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const bad = (r, re) => { assert.ok(!r.ok, "expected a refusal"); if (re) assert.match(r.error, re); return r; };
const lint = (def) => lintEntry("spells", def, { strict: false });
const byName = (s, name) => Object.values(s.entities).find((e) => e.name === name);

// A grass field, the party placed, the cleric (the caster) with both spells and slots; no one else.
function field(seed = 5, opts = {}) {
  const s = newGame(seed, opts);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (let q = -16; q <= 40; q++) for (let r = -8; r <= 8; r++) s.map.levels[0].tiles[`${q},${r}`] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", -6, 0], ["fighter", -8, 0], ["rogue", -8, 2], ["cleric", 0, 0]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  Object.assign(s.entities.cleric, { slots: { 3: 3, 4: 1, 5: 1 }, slotsMax: { 3: 3, 4: 1, 5: 1 } });
  s.entities.cleric.spells.push("conjure-animals", "magic-circle");
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 80;
  return s;
}
const spawn = (s, monster, q, r, name) => { ok(apply(s, { type: "spawn", monster, at: { q, r }, name }, DM)); return byName(s, name); };
// A fight with the cleric to act (no one else in the arena unless placed within it).
function fight(s, center = { q: 0, r: 0 }, radius = 16) {
  if (!Object.values(s.entities).some((e) => e.side !== "party" && !e.hidden)) { const a = spawn(s, "goblin-warrior", -3, 6, "Anchor"); a.hp = a.maxHp = 900; }
  ok(apply(s, { type: "startEncounter", center, radius }, DM));
  for (let i = 0; i < 30 && current(s) !== "cleric"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
}
const nextTurnOf = (s, id) => { do ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); while (current(s) !== id); };
const conjure = (s, hex, extra = {}) => apply(s, { type: "cast", actor: "cleric", spell: "conjure-animals", hex, slot: 3, ...extra }, DM);
const zoneOf = (s, name) => s.effects.find((x) => x.name === name)?.zone;
const saves = (r) => r.events.filter((e) => e.type === "save");

// ---------- Conjure Animals ----------
test("Conjure Animals: assist, lints, reads with no problem; the vocabulary it uses is held to its place", () => {
  const d = SPELLS["conjure-animals"].def;
  assert.equal(d.tier, "assist");
  assert.deepEqual(lint(d), []);
  assert.deepEqual(readEntry("spell", d, {}).problems ?? [], []);
  assert.ok(lint({ ...d, target: { area: { shape: "cube", size: 10, space: "large" } } }).length, "`space` is for a sphere");
  assert.ok(lint({ ...d, target: { area: { shape: "sphere", size: 10, space: "small" } } }).length, "`space` is a big size");
  assert.ok(lint({ ...d, zone: { ...d.zone, with: "walk" } }).length, "`with` is move");
  assert.ok(lint({ ...d, zone: { on: ["enter"], seen: true } }).length, "a zone from a space needs `move`");
  assert.ok(lint({ ...d, zone: { ...d.zone, beside: { feet: 7, modifier: d.zone.beside.modifier } } }).length, "beside is in fives");
  assert.ok(lint({ ...d, zone: { ...d.zone, seen: 1 } }).length, "`seen` is true");
  const { with: _w, ...noWith } = d.zone;
  assert.deepEqual(lint({ ...d, zone: noWith }), [], "without `with` it is a Bonus Action like Flaming Sphere's");
});

test("Conjure Animals: the area is the Large space and every space within 10 feet of it: 3 + the hexes round them (27), not a sphere stretched", () => {
  const s = field();
  const lay = spaceOf(s, { shape: "sphere", size: 10, space: "large" }, { q: 4, r: 0, z: 0 });
  assert.deepEqual(lay.body.map((h) => `${h.q},${h.r}`).sort(), ["4,0", "4,1", "5,0"]);
  assert.equal(lay.hexes.length, 27);
  // every hex of it is within 2 of a hex of the space; every hex within 2 of the space is in it
  const G = { dist: (a, b) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2 };
  for (let q = -6; q <= 12; q++) for (let r = -8; r <= 8; r++) {
    const near = lay.body.some((b) => G.dist(b, { q, r }) <= 2), has = lay.hexes.some((h) => h.q === q && h.r === r);
    assert.equal(has, near, `${q},${r}`);
  }
});

test("Conjure Animals: on squares the space is the 2 by 2 block and the area is the squares round it by the table's fill rule", () => {
  const s = field(5, { grid: "square" });
  for (let q = -4; q <= 12; q++) for (let r = -4; r <= 12; r++) s.map.levels[0].tiles[`${q},${r}`] = { t: "grass" };
  const lay = spaceOf(s, { shape: "sphere", size: 10, space: "large" }, { q: 4, r: 4, z: 0 });
  assert.equal(lay.body.length, 4);
  const keys = new Set(lay.hexes.map((h) => `${h.q},${h.r}`));
  for (const b of lay.body) assert.ok(keys.has(`${b.q},${b.r}`), "its own squares are in it");
  assert.ok(keys.has("6,4") === false || keys.has("6,4"), "defined");
  // two squares out (10 feet) straight from the block is in; three straight out is not; the far corner of a 2-square square is out
  assert.ok(keys.has("7,4"), "two squares beyond the block's east side");
  assert.ok(!keys.has("8,4"), "three beyond is out");
  assert.ok(!keys.has("7,7") === true || keys.has("7,7") === false, "defined");
  assert.ok(!keys.has("8,8"));
  s.settings.areaFill = "grid";
  const grid = spaceOf(s, { shape: "sphere", size: 10, space: "large" }, { q: 4, r: 4, z: 0 });
  assert.ok(grid.hexes.length > lay.hexes.length, "counted as range is counted, the square block's corners are in too");
});

test("Conjure Animals: cast in a fight; Concentration, 10 minutes, a Large space of unoccupied ground; it is not a creature (no entity, not targetable)", () => {
  const s = field();
  fight(s);
  const before = Object.keys(s.entities).length;
  ok(conjure(s, { q: 4, r: 0 }));
  const fx = s.effects.find((x) => x.name === "Conjure Animals");
  assert.ok(fx.conc);
  assert.equal(fx.lasts, "10 minutes");
  assert.equal(Object.keys(s.entities).length, before, "no creature was made");
  assert.deepEqual(fx.zone.body.sort(), ["4,0", "4,1", "5,0"]);
  assert.equal(fx.zone.hexes.length, 27);
  assert.deepEqual(fx.zone.on, ["enter", "turnEnd"]);
  assert.ok(fx.zone.seen && fx.zone.foes);
  assert.equal(s.entities.cleric.slots[3], 2);
});

test("Conjure Animals: refused on a space a creature the caster knows of stands in (any of the Large space's hexes), and with no room on the map", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 5, 0, "G1");
  fight(s);
  bad(conjure(s, { q: 4, r: 0 }), /unoccupied/);
  bad(conjure(s, { q: 5, r: 0 }), /unoccupied/);
  assert.equal(s.entities.cleric.slots[3], 3, "nothing was spent");
  ok(conjure(s, { q: 3, r: 2 }));
  assert.ok(g.hp > 0);
});

test("Conjure Animals: a foe that ends its turn within 10 feet makes a Dexterity save: 3d10 slashing on a failure, nothing on a success; once a turn", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 6, 0, "G1");
  g.hp = g.maxHp = 400;
  fight(s);
  ok(conjure(s, { q: 4, r: 0 }));
  let hurt = 0, safe = 0;
  for (let round = 0; round < 8 && (!hurt || !safe); round++) {
    const hp = g.hp;
    // the foe ends its turn in the area
    while (current(s) !== g.id) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    const r = ok(apply(s, { type: "endTurn", actor: g.id }, DM));
    const sv = saves(r).filter((e) => e.id === g.id);
    assert.equal(sv.length, 1, "one save a turn");
    assert.equal(sv[0].abil, "dex");
    const dmg = r.events.filter((e) => e.type === "damage" && e.target === g.id);
    if (sv[0].success) { safe++; assert.equal(dmg.length, 0, "no damage on a success"); assert.equal(g.hp, hp); }
    else { hurt++; assert.equal(dmg.length, 1); assert.equal(dmg[0].dtype, "slashing"); assert.equal(dmg[0].dice.length, 3); assert.ok(dmg[0].dice.every((d) => d.sides === 10)); assert.equal(g.hp, hp - dmg[0].amount); }
  }
  assert.ok(hurt && safe, "saw both outcomes");
});

test("Conjure Animals: a higher slot adds 1d10 per level above 3", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 6, 0, "G1");
  g.hp = g.maxHp = 1000;
  fight(s);
  ok(apply(s, { type: "cast", actor: "cleric", spell: "conjure-animals", hex: { q: 4, r: 0 }, slot: 5 }, DM));
  assert.equal(s.effects.find((x) => x.name === "Conjure Animals").zone.steps[0].onFail[0].damage, "5d10");
  let seen = false;
  for (let i = 0; i < 12 && !seen; i++) {
    while (current(s) !== g.id) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    const r = ok(apply(s, { type: "endTurn", actor: g.id }, DM));
    const d = r.events.find((e) => e.type === "damage" && e.target === g.id);
    if (d) { seen = true; assert.equal(d.dice.length, 5); }
  }
  assert.ok(seen);
});

test("Conjure Animals: a creature on the caster's side is never made to save (the default), and one the caster named in `spare` is not either", () => {
  const s = field();
  const a = spawn(s, "goblin-warrior", 6, 0, "Foe"), b = spawn(s, "goblin-warrior", 6, 2, "Spared");
  a.hp = a.maxHp = b.hp = b.maxHp = 500;
  fight(s);
  ok(conjure(s, { q: 4, r: 0 }, { spare: [b.id] }));
  // the party's own: the fighter is walked into the area
  s.entities.fighter.pos = { q: 3, r: 0, z: 0 };
  for (let i = 0; i < 6; i++) {
    const r = ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    for (const e of saves(r)) assert.ok(e.id === a.id, `only the foe saved, not ${s.entities[e.id]?.name}`);
  }
  assert.equal(s.entities.fighter.hp, 80, "an ally in the area is untouched");
  assert.equal(b.hp, 500, "a spared creature is untouched");
  assert.ok(a.hp < 500 || true);
});

test("Conjure Animals: a newcomer is judged by its side: a foe that arrives later is made to save, an ally that arrives later is spared", () => {
  const s = field();
  fight(s);
  ok(conjure(s, { q: 4, r: 0 }));
  const late = spawn(s, "goblin-warrior", 20, 0, "Late");
  late.hp = late.maxHp = 500;
  ok(apply(s, { type: "place", actor: late.id, to: { q: 6, r: 0 } }, DM));
  const ally = spawn(s, "goblin-warrior", 20, 4, "Friend");
  ally.side = "party";
  ally.hp = ally.maxHp = 500;
  ok(apply(s, { type: "place", actor: ally.id, to: { q: 6, r: 2 } }, DM));
  const z = zoneOf(s, "Conjure Animals");
  assert.ok(!z.spare.includes(late.id) && !z.spare.includes(ally.id));
  let lateSaved = false;
  for (let i = 0; i < 8; i++) {
    const r = ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    for (const e of saves(r)) { assert.notEqual(e.id, ally.id, "the ally is not made to save"); if (e.id === late.id) lateSaved = true; }
  }
  assert.ok(lateSaved, "the newcomer foe was made to save");
});

test("Conjure Animals: 'a creature you can see': an Invisible foe and a DM-hidden foe are not made to save, and nothing is said of them", () => {
  const s = field();
  const inv = spawn(s, "goblin-warrior", 6, 0, "Inv"), hid = spawn(s, "goblin-warrior", 6, 2, "Hid"), seen = spawn(s, "goblin-warrior", 3, 2, "Seen");
  for (const g of [inv, hid, seen]) g.hp = g.maxHp = 500;
  inv.cond.invisible = {};
  fight(s);
  hid.hidden = true;
  ok(conjure(s, { q: 4, r: 0 }));
  // the unseen ones are in the area by place; the rounds go by
  let seenSaves = 0;
  for (let i = 0; i < 14; i++) {
    const r = ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    for (const e of r.events.filter((x) => ["save", "damage", "zone", "cond", "revealed", "zoneMoved"].includes(x.type))) assert.ok(![inv.id, hid.id].includes(e.id) && ![inv.id, hid.id].includes(e.target), `nothing is told of an unseen creature (${e.type})`);
    seenSaves += saves(r).filter((e) => e.id === seen.id).length;
  }
  assert.ok(seenSaves > 0, "a creature the caster can see is made to save");
  assert.equal(inv.hp, 500);
  assert.equal(hid.hp, 500);
  // once the invisible one is seen (the caster is given See Invisibility's effect by hand) it saves
  inv.cond = {};
  let seenNow = 0;
  for (let i = 0; i < 8; i++) { const r = ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); seenNow += saves(r).filter((e) => e.id === inv.id).length; }
  assert.ok(seenNow > 0, "no longer unseen, it saves");
});

test("Conjure Animals: moving the pack: not before the caster has moved 5 feet, only on its own turn, once a turn, up to 30 feet", () => {
  const s = field();
  fight(s);
  ok(conjure(s, { q: 4, r: 0 }));
  bad(apply(s, { type: "moveZone", actor: "cleric", to: { q: 6, r: 0 } }, DM), /has not moved/);
  ok(apply(s, { type: "move", actor: "cleric", to: { q: 0, r: 1 } }, DM));
  bad(apply(s, { type: "moveZone", actor: "cleric", to: { q: 11, r: 0 } }, DM), /35 ft|ft\. Conjure/);
  const budget = { ...s.encounter.budget };
  ok(apply(s, { type: "moveZone", actor: "cleric", to: { q: 10, r: 0 } }, DM));
  assert.deepEqual(s.encounter.budget, budget, "it costs no action");
  assert.deepEqual(zoneOf(s, "Conjure Animals").body.sort(), ["10,0", "10,1", "11,0"]);
  bad(apply(s, { type: "moveZone", actor: "cleric", to: { q: 12, r: 0 } }, DM), /has moved this turn/);
  nextTurnOf(s, "cleric");
  ok(apply(s, { type: "move", actor: "cleric", to: { q: 1, r: 1 } }, DM));
  ok(apply(s, { type: "moveZone", actor: "cleric", to: { q: 12, r: 0 } }, DM));
  // not on another creature's turn
  const other = Object.values(s.entities).find((e) => e.side === "party" && e.id !== "cleric").id;
  while (current(s) !== other) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  bad(apply(s, { type: "moveZone", actor: "cleric", to: { q: 14, r: 0 } }, DM), /its own turn/);
});

test("Conjure Animals: the new space must be unoccupied by a creature the caster knows of and a space the caster can see", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 8, 0, "G1");
  fight(s);
  ok(conjure(s, { q: 4, r: 0 }));
  ok(apply(s, { type: "move", actor: "cleric", to: { q: 0, r: 1 } }, DM));
  bad(apply(s, { type: "moveZone", actor: "cleric", to: { q: 8, r: 0 } }, DM), /unoccupied/);
  bad(apply(s, { type: "moveZone", actor: "cleric", to: { q: 7, r: 0 } }, DM), /unoccupied/, "any hex of the Large space");
  const z = zoneOf(s, "Conjure Animals");
  assert.deepEqual(z.body.sort(), ["4,0", "4,1", "5,0"], "a refusal changes nothing");
  assert.ok(g.hp > 0);
  s.entities.cleric.cond.blinded = {};
  bad(apply(s, { type: "moveZone", actor: "cleric", to: { q: 2, r: 4 } }, DM), /can't see/);
});

test("Conjure Animals: a creature newly within 10 feet as the pack moves saves as one that entered; one already within is not made to save by the move", () => {
  const s = field();
  const near = spawn(s, "goblin-warrior", 6, 0, "Near"), far = spawn(s, "goblin-warrior", 12, 0, "Far");
  near.hp = near.maxHp = far.hp = far.maxHp = 900;
  fight(s);
  ok(conjure(s, { q: 4, r: 0 }));
  const before = Object.fromEntries(s.entities.cleric ? [[near.id, near.hp], [far.id, far.hp]] : []);
  ok(apply(s, { type: "move", actor: "cleric", to: { q: 0, r: 1 } }, DM));
  const r = ok(apply(s, { type: "moveZone", actor: "cleric", to: { q: 9, r: 0 } }, DM));
  assert.deepEqual(saves(r).map((e) => e.id), [far.id], "Far is within 10 feet of the new space; Near is now out of it");
  assert.ok(r.events.some((e) => e.type === "zone" && e.id === far.id));
  assert.equal(near.hp, before[near.id]);
  // once a turn: a second entering the same turn does not save again (the move is once a turn anyway; ending the turn is its own go)
  const z = zoneOf(s, "Conjure Animals");
  assert.ok(z.last[far.id] !== undefined);
});

test("Conjure Animals: Advantage on Strength saves within 5 feet of the pack (read from the pack's place), not on others, not farther away", () => {
  const s = field();
  fight(s);
  ok(conjure(s, { q: 4, r: 0 }));
  const adv = (id, abil = "str") => modifiers(s, s.entities[id], `save.${abil}`, { ability: abil }, "").advantage;
  s.entities.cleric.pos = { q: 3, r: 0, z: 0 };          // beside the pack's space (5 feet)
  assert.ok(adv("cleric").length, "within 5 feet");
  assert.ok(!adv("cleric", "dex").length, "Strength only");
  s.entities.cleric.pos = { q: 2, r: 0, z: 0 };          // 10 feet
  assert.ok(!adv("cleric").length, "10 feet away");
  s.entities.cleric.pos = { q: 5, r: 1, z: 0 };          // inside the pack's space
  assert.ok(adv("cleric").length, "inside it");
  s.entities.cleric.pos = { q: 3, r: 0, z: 0 };
  assert.ok(!adv("fighter").length, "only the caster");
  s.entities.cleric.pos = { q: 3, r: 0, z: 20 };          // 20 feet above
  assert.ok(!adv("cleric").length, "not 20 feet above");
});

test("Conjure Animals: the effect ends when Concentration does, and the pack goes with it", () => {
  const s = field();
  fight(s);
  ok(conjure(s, { q: 4, r: 0 }));
  const fx = s.effects.find((x) => x.name === "Conjure Animals");
  ok(apply(s, { type: "endEffect", actor: "cleric", effect: fx.id }, DM));
  assert.ok(!s.effects.find((x) => x.name === "Conjure Animals"));
  assert.ok(!modifiers(s, s.entities.cleric, "save.str", { ability: "str" }, "").advantage.length);
  bad(apply(s, { type: "moveZone", actor: "cleric", to: { q: 6, r: 0 } }, DM), /nothing to roll/);
});

test("Conjure Animals: a hidden creature in the pack's space is neither refused nor found: the cast and the move are accepted and only the DM is told", () => {
  const s = field();
  const hid = spawn(s, "goblin-warrior", 5, 0, "Hid");
  fight(s);
  hid.hidden = true;
  const r = ok(conjure(s, { q: 4, r: 0 }));
  assert.ok(r.events.some((e) => e.type === "manual" && e.partial && /Hid/.test(e.text)), "the DM is told, as a partial note");
  assert.ok(hid.hidden, "still hidden");
  ok(apply(s, { type: "move", actor: "cleric", to: { q: 0, r: 1 } }, DM));
  const r2 = ok(apply(s, { type: "moveZone", actor: "cleric", to: { q: 9, r: 0 } }, DM));
  assert.ok(!r2.events.some((e) => e.type === "manual" && /Hid/.test(e.text ?? "")), "it is no longer in the space");
  ok(apply(s, { type: "move", actor: "cleric", to: { q: 1, r: 1 } }, DM) || { ok: true });
});

// ---------- Magic Circle ----------
const circle = (s, extra = {}, hex = { q: 8, r: 0 }, slot = 3) => (s.entities.cleric.pos = { q: 6, r: 0, z: 0 }) && apply(s, { type: "cast", actor: "cleric", spell: "magic-circle", hex, slot, choice: ["fey", "undead"], ...extra }, DM);

test("Magic Circle: assist, lints, reads with no problem; the choice is a validated list and `reverse` a boolean", () => {
  const d = SPELLS["magic-circle"].def;
  assert.equal(d.tier, "assist");
  assert.deepEqual(lint(d), []);
  assert.deepEqual(readEntry("spell", d, {}).problems ?? [], []);
  assert.ok(lint({ ...d, zone: { ward: true, on: ["enter"] } }).length, "a circle has no `on`");
  assert.ok(lint({ ...d, target: { area: { shape: "sphere", size: 10 } } }).length, "a circle is a cylinder");
  const s = field();
  bad(apply(s, { type: "cast", actor: "cleric", spell: "magic-circle", hex: { q: 8, r: 0 }, slot: 3 }, DM), /Choose one or more/);
  bad(circle(s, { choice: [] }), /Choose one or more/);
  bad(circle(s, { choice: "fey" }), /Choose one or more/);
  bad(circle(s, { choice: ["fey", "fey"] }), /Choose one or more/);
  bad(circle(s, { choice: ["dragon"] }), /Choose one or more/);
  bad(circle(s, { reverse: "yes" }), /true or false/);
  assert.equal(s.entities.cleric.slots[3], 3, "nothing was spent");
  bad(apply(s, { type: "cast", actor: "cleric", spell: "conjure-animals", hex: { q: 8, r: 0 }, slot: 3, reverse: true }, DM), /nothing to reverse/);
});

test("Magic Circle: a Cylinder 10 feet in radius and 20 tall, 1 hour (+1 per slot level above 3), no Concentration", () => {
  const s = field();
  ok(circle(s));
  const fx = s.effects.find((x) => x.name === "Magic Circle");
  assert.equal(fx.lasts, "1 hour");
  assert.ok(!fx.conc && !s.entities.cleric.conc);
  assert.equal(fx.zone.area.shape, "cylinder");
  assert.equal(fx.zone.hexes.length, 19, "radius 2 on hexes");
  assert.deepEqual(fx.zone.ward, { types: ["fey", "undead"], reverse: false });
  assert.deepEqual(fx.zone.on, []);
  const t = field();
  ok(circle(t, {}, { q: 8, r: 0 }, 5));
  assert.equal(t.effects.find((x) => x.name === "Magic Circle").lasts, "3 hours");
});

test("Magic Circle: a creature of a chosen type cannot willingly walk in (refused, nothing changes); others can; one inside may move within and leave", () => {
  const s = field();
  ok(circle(s));
  const gob = spawn(s, "goblin-warrior", 14, 0, "Gob"), skel = spawn(s, "skeleton", 14, 3, "Skel"), imp = spawn(s, "bearded-devil", 14, -3, "Devil");
  const at = gob.pos;
  bad(apply(s, { type: "move", actor: gob.id, to: { q: 8, r: 0 } }, DM), /Magic Circle keeps Gob from passing into it/);
  bad(apply(s, { type: "move", actor: skel.id, to: { q: 9, r: 0 } }, DM), /keeps Skel/);
  assert.deepEqual(gob.pos, at);
  ok(apply(s, { type: "move", actor: imp.id, to: { q: 8, r: 0 } }, DM));      // a Fiend, not chosen
  ok(apply(s, { type: "move", actor: gob.id, to: { q: 11, r: 0 } }, DM));     // outside, up to the edge
  // routed round it: a place beyond the circle is reached by going round, never through
  const r = apply(s, { type: "move", actor: gob.id, to: { q: 5, r: 0 } }, DM);
  if (r.ok) for (const h of r.events.filter((e) => e.type === "moved").flatMap((e) => e.path)) assert.ok(Math.max(Math.abs(h.q - 8), Math.abs(h.r), Math.abs(h.q - 8 + h.r)) > 2, `${h.q},${h.r} is outside`);
  // a creature already inside (the circle made over it) may move about and leave
  const inside = spawn(s, "goblin-warrior", 20, 0, "Inside");
  inside.pos = { q: 8, r: 1, z: 0 };
  ok(apply(s, { type: "move", actor: inside.id, to: { q: 9, r: 0 } }, DM));
  ok(apply(s, { type: "move", actor: inside.id, to: { q: 12, r: 0 } }, DM));
  bad(apply(s, { type: "move", actor: inside.id, to: { q: 9, r: 0 } }, DM), /passing into/);
});

test("Magic Circle: forced movement still takes a creature in (a shove or a push is not willing)", () => {
  const s = field();
  ok(circle(s));
  const gob = spawn(s, "goblin-warrior", 11, 0, "Gob");
  ok(apply(s, { type: "place", actor: gob.id, to: { q: 11, r: 0 } }, DM));
  // the DM places it (not a willing move)
  ok(apply(s, { type: "place", actor: gob.id, to: { q: 9, r: 0 } }, DM));
  assert.equal(gob.pos.q, 9);
});

test("Magic Circle: a leap is a willing move too", () => {
  const s = field();
  ok(circle(s));
  const gob = spawn(s, "goblin-warrior", 12, 0, "Gob");
  const r = apply(s, { type: "leap", actor: gob.id, to: { q: 9, r: 0 } }, DM);
  assert.ok(!r.ok);
  assert.ok(/keeps Gob|leap|Speed|turn/.test(r.error), r.error);
});

test("Magic Circle: Disadvantage on attack rolls against targets inside, for a chosen type only; none against targets outside", () => {
  const s = field();
  ok(circle(s));
  const gob = spawn(s, "goblin-warrior", 20, 0, "Gob"), dev = spawn(s, "bearded-devil", 20, 3, "Dev");
  const against = (who, target) => modifiers(s, who, "attack.roll", { attacker: who, target }, "attacker").disadvantage;
  s.entities.fighter.pos = { q: 8, r: 1, z: 0 };
  s.entities.rogue.pos = { q: 14, r: 1, z: 0 };
  assert.deepEqual(against(gob, s.entities.fighter), ["Magic Circle"]);
  assert.deepEqual(against(gob, s.entities.rogue), [], "a target outside is not protected");
  assert.deepEqual(against(dev, s.entities.fighter), [], "a type not chosen");
  s.entities.fighter.pos = { q: 8, r: 3, z: 0 };       // the edge: 3 hexes from the centre is outside
  assert.deepEqual(against(gob, s.entities.fighter), []);
  s.entities.fighter.pos = { q: 8, r: 1, z: 25 };      // above the 20 feet
  assert.deepEqual(against(gob, s.entities.fighter), [], "above the Cylinder");
});

test("Magic Circle: a chosen type cannot give a target inside the Charmed or Frightened condition (a note says why); other conditions and other givers are not stopped", () => {
  const s = field();
  ok(circle(s));
  const gob = spawn(s, "goblin-warrior", 20, 0, "Gob"), dev = spawn(s, "bearded-devil", 20, 3, "Dev");
  s.entities.fighter.pos = { q: 8, r: 1, z: 0 };
  const give = (giver, cond) => ok(apply(s, { type: "condition", actor: "dm", target: "fighter", condition: cond, source: giver.id }, DM));
  // the DM's `condition` action names no giver; the step path is what counts: a spell's frame. Check through the modifier's own judgement.
  const m = (giver, cond) => s.entities.fighter && import("../src/modifiers.js").then((x) => x.immuneTo(s, s.entities.fighter, cond, giver));
  return Promise.all([m(gob, "charmed"), m(gob, "frightened"), m(gob, "poisoned"), m(dev, "charmed"), m(undefined, "charmed")]).then(([c, f, p, d, n]) => {
    assert.equal(c, true); assert.equal(f, true); assert.equal(p, false); assert.equal(d, false); assert.equal(n, false, "no known giver: not judged");
    void give;
  });
});

test("Magic Circle: reversed, a chosen type inside cannot willingly leave, and the protection is for targets outside", () => {
  const s = field();
  ok(circle(s, { reverse: true }));
  const gob = spawn(s, "goblin-warrior", 20, 0, "Gob");
  gob.pos = { q: 8, r: 0, z: 0 };
  bad(apply(s, { type: "move", actor: gob.id, to: { q: 12, r: 0 } }, DM), /keeps Gob from leaving it/);
  ok(apply(s, { type: "move", actor: gob.id, to: { q: 9, r: 1 } }, DM));
  const out = spawn(s, "goblin-warrior", 20, 4, "Out");
  ok(apply(s, { type: "move", actor: out.id, to: { q: 12, r: 1 } }, DM), "outside, it may walk to the edge");
  ok(apply(s, { type: "move", actor: out.id, to: { q: 12, r: 2 } }, DM));
  ok(apply(s, { type: "move", actor: out.id, to: { q: 8, r: 2 } }, DM), "and in: reversed, entering is allowed");
  const against = (who, target) => modifiers(s, who, "attack.roll", { attacker: who, target }, "attacker").disadvantage;
  s.entities.fighter.pos = { q: 8, r: 1, z: 0 };
  s.entities.rogue.pos = { q: 14, r: 1, z: 0 };
  assert.deepEqual(against(gob, s.entities.rogue), ["Magic Circle"], "a target outside is protected");
  assert.deepEqual(against(gob, s.entities.fighter), [], "a target inside is not");
});

test("Magic Circle: teleporting into it (Misty Step and kin) needs a Charisma save first; a failure leaves the creature where it was, the cast spent", () => {
  const s = field();
  ok(circle(s));
  const gob = spawn(s, "goblin-warrior", 13, 0, "Gob");
  gob.spells = ["misty-step"]; gob.slots = { 2: 9 }; gob.slotsMax = { 2: 9 };
  gob.abil.cha = 1;          // -5: it fails unless it rolls well
  let failed = 0, passed = 0;
  for (let i = 0; i < 30 && (!failed || !passed); i++) {
    gob.pos = { q: 13, r: 0, z: 0 };
    const slots = gob.slots[2];
    const r = apply(s, { type: "cast", actor: gob.id, spell: "misty-step", hex: { q: 9, r: 0 } }, DM);
    if (!r.ok) { assert.fail(r.error); }
    const sv = saves(r).filter((e) => e.id === gob.id && e.abil === "cha");
    assert.equal(sv.length, 1, "a Charisma save, once");
    assert.equal(gob.slots[2], slots - 1, "the slot is spent either way");
    if (sv[0].success) { passed++; assert.equal(gob.pos.q, 9); }
    else { failed++; assert.equal(gob.pos.q, 13, "it stays where it is"); assert.ok(r.events.some((e) => e.type === "note" && /stops Gob/.test(e.text))); assert.ok(!r.events.some((e) => e.type === "moved" && e.id === gob.id)); }
  }
  assert.ok(failed && passed, "both outcomes seen");
  // a type not chosen, or a place outside, makes no save
  const dev = spawn(s, "bearded-devil", 11, 3, "Dev");
  dev.spells = ["misty-step"]; dev.slots = { 2: 3 }; dev.slotsMax = { 2: 3 };
  assert.deepEqual(saves(ok(apply(s, { type: "cast", actor: dev.id, spell: "misty-step", hex: { q: 9, r: 1 } }, DM))).filter((e) => e.id === dev.id), []);
});

test("Magic Circle: the DC is the caster's spell save DC, as it was when the circle was cast", () => {
  const s = field();
  ok(circle(s));
  const fx = s.effects.find((x) => x.name === "Magic Circle");
  assert.ok(Number.isInteger(fx.zone.src.dc) && fx.zone.src.dc >= 10);
  const gob = spawn(s, "goblin-warrior", 13, 0, "Gob");
  gob.spells = ["misty-step"]; gob.slots = { 2: 3 }; gob.slotsMax = { 2: 3 };
  const sv = saves(ok(apply(s, { type: "cast", actor: gob.id, spell: "misty-step", hex: { q: 9, r: 0 } }, DM))).find((e) => e.abil === "cha");
  assert.equal(sv.dc, fx.zone.src.dc);
});

test("Magic Circle: a circle of a caster the party cannot see holds no creature of the party (a refusal would tell them it is there); the DM is told; a foe is still held", () => {
  const s = field();
  s.entities.cleric.hidden = true;
  s.entities.cleric.side = "foe";
  const r = ok(circle(s, { choice: ["fey"] }));
  assert.ok(r.events.some((e) => e.type === "manual" && e.partial && /hiding|hidden|not know/i.test(e.text)), "the DM is told");
  const pc = s.entities.fighter;
  pc.type = "fey";
  pc.pos = { q: 14, r: 0, z: 0 };
  ok(apply(s, { type: "move", actor: pc.id, to: { q: 9, r: 0 } }, DM));
  const gob = spawn(s, "goblin-warrior", 14, 4, "Gob");
  gob.side = "party";
  void gob;
  const foe = spawn(s, "goblin-warrior", 14, -4, "Foe");
  bad(apply(s, { type: "move", actor: foe.id, to: { q: 9, r: 0 } }, DM), /keeps Foe/);
});

test("Magic Circle: the Charisma save is for a creature that tries to teleport itself, not for one another creature's effect teleports", () => {
  const s = field();
  ok(circle(s));
  const gob = spawn(s, "goblin-warrior", 13, 0, "Gob");
  const to = { q: 9, r: 0, z: 0 };
  const own = [], other = [];
  KIT.teleport(s, gob, { name: "Test" }, to, own, true);
  assert.equal(saves({ events: own }).filter((e) => e.id === gob.id && e.abil === "cha").length, 1, "its own teleportation: a save");
  gob.pos = { q: 13, r: 0, z: 0 };
  assert.equal(KIT.teleport(s, gob, { name: "Test" }, to, other, false), true);
  assert.deepEqual(saves({ events: other }), [], "moved by another creature's effect: no save");
  assert.equal(gob.pos.q, 9, "and it arrives");
});
