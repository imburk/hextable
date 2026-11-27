// Wave 3a, part 2, of issue #786: Sanctuary (the `ward` step) and Freedom of Movement (the `terrain` hook, `magic` on `condition` and `speed`).
// Built to docs/specs/rules-expansion.md, "Build notes: wave 3a part 2". Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, MONSTERS, SPELLS } from "../src/content/index.js";
import { wardCheck } from "../src/engine/resolve.js";
import { lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { apply, current } from "../src/engine.js";
import { speedOf } from "../src/modifiers.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const lint = (def) => lintEntry("spells", def, { strict: false });
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", 0, 0], ["fighter", -2, 0], ["rogue", -4, 4], ["cleric", -3, 0]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  const slots = { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 };
  for (const id of ["wizard", "cleric"]) Object.assign(s.entities[id], { slots: { ...slots }, slotsMax: { ...slots } });
  s.entities.cleric.spells.push("sanctuary", "freedom-of-movement", "hold-person");
  s.entities.wizard.spells.push("freedom-of-movement", "ray-of-frost", "magic-missile", "thunderwave", "hold-person");
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 300;
  return s;
}
const spawn = (s, monster, q, r) => { const e = s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 300; return e; };
const fight = (s) => { if (!Object.values(s.entities).some((e) => e.side !== "party")) spawn(s, "goblin-warrior", 9, 0); return fightOn(s); };
const fightOn = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 12 }, DM));
const again = (s, id) => { ok(apply(s, { type: "endTurn", actor: id }, DM)); turnOf(s, id); };
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const attackOf = (g) => g.actions.find((x) => x.id !== "multiattack").id;
const warded = (s, id) => s.effects.some((fx) => fx.name === "Sanctuary" && fx.parts.some((p) => p.ward && p.target === id && !p.ended));

// ---------- Sanctuary ----------
test("Sanctuary: assist; lints; the entry reads in plain words with no problem", () => {
  const def = SPELLS.sanctuary.def;
  assert.equal(def.tier, "assist"); assert.equal(def.checked, true);
  assert.deepEqual(lint(def), []);
  const r = readEntry("spell", def, {});
  assert.deepEqual(r.problems ?? [], []);
});

test("Sanctuary: an attacker that fails the Wisdom save loses the attack and its action; the DM is told; one that passes attacks as usual; the unwarded are not guarded", () => {
  const s = field(), g = spawn(s, "goblin-warrior", -1, 0);
  fight(s); turnOf(s, "cleric");
  ok(apply(s, { type: "cast", actor: "cleric", spell: "sanctuary", target: "fighter" }, DM));
  assert.ok(warded(s, "fighter"));
  turnOf(s, g.id);
  g.abil.wis = -20;
  const lost = ok(apply(s, { type: "act", actor: g.id, action: attackOf(g), target: "fighter" }, DM));
  assert.ok(lost.events.some((e) => e.type === "save" && e.id === g.id && e.abil === "wis" && e.success === false && e.against === "Sanctuary"), JSON.stringify(lost.events));
  assert.ok(!lost.events.some((e) => e.type === "attack"), "no attack roll was made");
  assert.ok(lost.events.some((e) => e.type === "manual" && /new target/.test(e.text)), "the DM may allow a new target");
  assert.ok(warded(s, "fighter"), "the ward stands: the attacker did not attack from it");
  again(s, g.id);
  g.abil.wis = 60;
  const through = ok(apply(s, { type: "act", actor: g.id, action: attackOf(g), target: "fighter" }, DM));
  assert.ok(through.events.some((e) => e.type === "save" && e.success === true));
  assert.ok(through.events.some((e) => e.type === "attack" && e.target === "fighter"), "it passed, so it attacked");
  again(s, g.id);
  g.abil.wis = -20;
  const other = ok(apply(s, { type: "act", actor: g.id, action: attackOf(g), target: "wizard" }, DM));
  assert.ok(!other.events.some((e) => e.type === "save" && e.against === "Sanctuary"), "no save to attack someone else");
  assert.ok(other.events.some((e) => e.type === "attack" && e.target === "wizard"));
});

test("Sanctuary: a spell that makes an attack roll or deals damage is lost against the warded creature; an area spell is not stopped; a spell with neither is not", () => {
  const s = field(), g = spawn(s, "goblin-warrior", 2, 0);
  s.entities.wizard.abil.wis = -20;
  fight(s); turnOf(s, "cleric");
  ok(apply(s, { type: "cast", actor: "cleric", spell: "sanctuary", target: g.id }, DM));
  turnOf(s, "wizard");
  const hp = g.hp;
  const bolt = ok(apply(s, { type: "cast", actor: "wizard", spell: "magic-missile", target: g.id }, DM));
  assert.ok(bolt.events.some((e) => e.type === "save" && e.id === "wizard" && e.success === false), JSON.stringify(bolt.events));
  assert.ok(!bolt.events.some((e) => e.type === "damage"), "the darts were lost");
  assert.equal(g.hp, hp);
  again(s, "wizard");
  const held = ok(apply(s, { type: "cast", actor: "wizard", spell: "hold-person", target: g.id }, DM));
  assert.ok(!held.events.some((e) => e.type === "save" && e.against === "Sanctuary"), "a spell that deals no damage and makes no attack roll is not guarded against");
  again(s, "wizard");
  const wave = ok(apply(s, { type: "cast", actor: "wizard", spell: "thunderwave", hex: { q: 1, r: 0 } }, DM));
  assert.ok(!wave.events.some((e) => e.type === "save" && e.against === "Sanctuary"), "an area effect is not stopped");
  assert.ok(wave.events.some((e) => e.type === "damage" || (e.type === "save" && e.id === g.id)), JSON.stringify(wave.events));
});

test("Sanctuary: a spell attack at the warded creature asks for the save once, at the cast, not again at its attack roll", () => {
  const s = field(), g = spawn(s, "goblin-warrior", 2, 0);
  s.entities.wizard.abil.wis = 30;
  fight(s); turnOf(s, "cleric");
  ok(apply(s, { type: "cast", actor: "cleric", spell: "sanctuary", target: g.id }, DM));
  turnOf(s, "wizard");
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "ray-of-frost", target: g.id }, DM));
  assert.equal(r.events.filter((e) => e.type === "save" && e.id === "wizard" && e.against === "Sanctuary").length, 1, JSON.stringify(r.events));
  assert.equal(r.events.filter((e) => e.type === "attack").length, 1, "the save passed: the ray is rolled");
});

test("Sanctuary: a Concentration spell lost against its only target starts nothing and keeps the caster's Concentration on another spell", () => {
  const s = field(), g = spawn(s, "goblin-warrior", 2, 0);
  s.entities.wizard.abil.wis = -20;
  s.entities.wizard.spells.push("mind-spike", "bless");
  fight(s); turnOf(s, "cleric");
  ok(apply(s, { type: "cast", actor: "cleric", spell: "sanctuary", target: g.id }, DM));
  turnOf(s, "wizard");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "bless", targets: ["wizard"] }, DM));
  const before = s.effects.length;
  again(s, "wizard");
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "mind-spike", target: g.id }, DM));
  assert.ok(!r.events.some((e) => e.type === "effectStart"), JSON.stringify(r.events));
  assert.ok(s.effects.some((fx) => fx.name === "Bless" && fx.conc), "Bless is still held");
  assert.equal(s.effects.length, before);
  assert.ok(!r.events.some((e) => e.type === "manual" && e.standing), "the DM is not told how to apply a spell that was lost");
});

test("Sanctuary: it ends when the warded creature makes an attack roll, or casts a spell; not when someone else does", () => {
  const swing = () => {
    const s = field(), g = spawn(s, "goblin-warrior", -1, 0);
    fight(s); turnOf(s, "cleric");
    ok(apply(s, { type: "cast", actor: "cleric", spell: "sanctuary", target: "fighter" }, DM));
    return { s, g };
  };
  { const { s, g } = swing(); turnOf(s, "wizard"); ok(apply(s, { type: "cast", actor: "wizard", spell: "ray-of-frost", target: g.id }, DM)); assert.ok(warded(s, "fighter"), "an ally's spell leaves it"); }
  { const { s, g } = swing(); turnOf(s, "fighter"); const r = ok(apply(s, { type: "attack", actor: "fighter", target: g.id, attack: "longsword" }, DM)); assert.ok(!warded(s, "fighter")); assert.ok(r.events.some((e) => e.type === "effectEnd" && e.name === "Sanctuary")); }
  { const s = field(), g = spawn(s, "goblin-warrior", -1, 0); fight(s); turnOf(s, "cleric"); ok(apply(s, { type: "cast", actor: "cleric", spell: "sanctuary", target: g.id }, DM)); turnOf(s, g.id); ok(apply(s, { type: "act", actor: g.id, action: attackOf(g), target: "fighter" }, DM)); assert.ok(!warded(s, g.id), "a creature's own attack action ends it"); }
  { const s = field(); fight(s); turnOf(s, "cleric"); ok(apply(s, { type: "cast", actor: "cleric", spell: "sanctuary", target: "wizard" }, DM)); turnOf(s, "wizard"); ok(apply(s, { type: "cast", actor: "wizard", spell: "ray-of-frost", target: "rogue" }, DM)); assert.ok(!warded(s, "wizard"), "casting a spell ends it"); }
});

// ---------- Freedom of Movement ----------
test("Freedom of Movement: assist; lints; reads in plain words; the entry says what the DM does", () => {
  const def = SPELLS["freedom-of-movement"].def;
  assert.equal(def.tier, "assist"); assert.equal(def.checked, true);
  assert.deepEqual(lint(def), []);
  assert.deepEqual(readEntry("spell", def, {}).problems ?? [], []);
  assert.ok(def.effects.some((st) => st.manual && /Swim Speed/.test(st.manual) && /5 feet of movement/.test(st.manual)));
});

test("Freedom of Movement: Difficult Terrain costs the warded creature no extra movement; open ground and walls are as they were", () => {
  const cost = (ward) => {
    const s = field(); s.map.levels[0].tiles["-1,0"] = { t: "forest" }; s.map.levels[0].tiles["-1,1"] = { t: "forest" };
    fight(s); turnOf(s, "cleric");
    if (ward) ok(apply(s, { type: "cast", actor: "cleric", spell: "freedom-of-movement", target: "fighter" }, DM));
    turnOf(s, "fighter");
    const before = s.encounter.budget.move;
    ok(apply(s, { type: "move", actor: "fighter", to: { q: -1, r: 0 } }, DM));
    return before - s.encounter.budget.move;
  };
  assert.equal(cost(false), 10, "forest doubles the step");
  assert.equal(cost(true), 5, "with the spell it is a plain step");
});

test("Freedom of Movement: a spell's lasting effect cannot cut the Speed; the same effect on a creature without the ward does", () => {
  const speedAfter = (ward) => {
    const s = field(); s.entities.fighter.ac = 1;
    fight(s); turnOf(s, "cleric");
    if (ward) ok(apply(s, { type: "cast", actor: "cleric", spell: "freedom-of-movement", target: "fighter" }, DM));
    turnOf(s, "wizard");
    const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "ray-of-frost", target: "fighter" }, DM));
    assert.ok(r.events.some((e) => e.type === "attack" && e.hit), "the ray hit");
    return speedOf(s, s.entities.fighter);
  };
  assert.equal(speedAfter(false), s0().entities.fighter.speed - 10);
  assert.equal(speedAfter(true), s0().entities.fighter.speed);
});
const s0 = () => field();

test("Freedom of Movement: a spell cannot make it Paralyzed or Restrained; the DM's condition and one a creature's own action gives are not stopped", () => {
  const s = field();
  s.entities.fighter.abil.wis = -20; s.entities.rogue.abil.wis = -20;
  fight(s); turnOf(s, "cleric");
  ok(apply(s, { type: "cast", actor: "cleric", spell: "freedom-of-movement", target: "fighter" }, DM));
  turnOf(s, "wizard");
  const held = ok(apply(s, { type: "cast", actor: "wizard", spell: "hold-person", target: "fighter" }, DM));
  assert.ok(!s.entities.fighter.cond.paralyzed, JSON.stringify(held.events));
  assert.ok(held.events.some((e) => e.type === "note" && /Immune to Paralyzed/.test(e.text)));
  again(s, "wizard");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "hold-person", target: "rogue" }, DM));
  assert.ok(s.entities.rogue.cond.paralyzed, "a creature without the ward is held");
  ok(apply(s, { type: "condition", actor: "fighter", condition: "restrained", on: true }, DM));
  assert.ok(s.entities.fighter.cond.restrained, "the DM's condition is the DM's call");
});

// ---------- the vocabulary ----------
test("lint: terrain, magic and ward are held to the shapes they are for", () => {
  const base = { ...SPELLS["freedom-of-movement"].def };
  const withStep = (st) => lint({ ...base, effects: [st] }).join("|");
  assert.match(withStep({ modifier: { on: "terrain", op: "immune", value: 1 } }), /terrain/);
  assert.match(withStep({ modifier: { on: "terrain", op: "add", value: 1 } }), /terrain/);
  assert.match(withStep({ modifier: { on: "speed", op: "immune" } }), /immune/);
  assert.match(withStep({ modifier: { on: "ac", op: "add", value: 1, magic: true } }), /magic/);
  assert.match(withStep({ modifier: { on: "condition", op: "immune", scope: { condition: "restrained" }, magic: false } }), /magic/);
  assert.equal(withStep({ modifier: { on: "terrain", op: "immune" } }), "");
  const sanct = { ...SPELLS.sanctuary.def };
  assert.match(lint({ ...sanct, effects: [{ ward: "luck" }] }).join("|"), /ward/);
  assert.match(lint({ ...sanct, duration: "instant", effects: [{ ward: "wis" }] }).join("|"), /ward/);
});

// ---------- review fixes ----------
function wardedGoblin(spells = []) {
  const s = field(), g = spawn(s, "goblin-warrior", 2, 0), o = spawn(s, "goblin-warrior", 3, 1);
  s.entities.wizard.abil.wis = -20;
  s.entities.wizard.spells.push("scorching-ray", ...spells);
  s.entities.cleric.spells.push("sacred-flame");
  fight(s); turnOf(s, "cleric");
  ok(apply(s, { type: "cast", actor: "cleric", spell: "sanctuary", target: g.id }, DM));
  return { s, g, o };
}
test("Sanctuary: a failed save takes the target out of the spell whole (no attack roll, no save, no rider)", () => {
  { const { s, g } = wardedGoblin(); turnOf(s, "wizard"); const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "ray-of-frost", target: g.id }, DM));
    assert.ok(!r.events.some((e) => e.type === "attack"), JSON.stringify(r.events)); assert.equal(speedOf(s, g), g.speed, "not slowed"); }
  { const { s, g } = wardedGoblin(); s.entities.cleric.abil.wis = -20; again(s, "cleric"); const r = ok(apply(s, { type: "cast", actor: "cleric", spell: "sacred-flame", target: g.id }, DM));
    assert.ok(!r.events.some((e) => e.type === "save" && e.id === g.id && e.against !== "Sanctuary"), JSON.stringify(r.events)); }
  { const { s, g } = wardedGoblin(); turnOf(s, "wizard"); const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "scorching-ray", slot: 2, targets: [g.id, g.id, g.id] }, DM));
    assert.ok(!r.events.some((e) => e.type === "attack"), "no ray rolled"); }
  { const { s, g, o } = wardedGoblin(); turnOf(s, "wizard"); const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "scorching-ray", slot: 2, targets: [g.id, o.id, o.id] }, DM));
    assert.equal(r.events.filter((e) => e.type === "attack").length, 2, "the other rays still roll"); assert.ok(r.events.filter((e) => e.type === "attack").every((e) => e.target === o.id)); }
});

test("Sanctuary: a thing on the map (a trap) makes no save and does not crash", () => {
  const s = field(); fight(s); turnOf(s, "cleric");
  ok(apply(s, { type: "cast", actor: "cleric", spell: "sanctuary", target: "fighter" }, DM));
  const trap = { id: null, object: true, name: "Arrow trap", side: "object", cond: {}, features: {}, attacks: [], abil: {}, prof: 0 };
  assert.equal(wardCheck(s, trap, s.entities.fighter, []), false);
  assert.ok(warded(s, "fighter"));
});

test("lint: an immune modifier on speed is a modifier step, not a trait", () => {
  const goblin = structuredClone(MONSTERS["goblin-warrior"]?.def ?? SPELLS.sanctuary.def);
  const m = structuredClone(CONTENT.monsters["goblin-warrior"]);
  const trait = { id: "x", name: "X", text: "x", modifiers: [{ on: "speed", op: "immune", magic: true }] };
  assert.match(lintEntry("monsters", { ...m, traits: [...(m.traits ?? []), trait] }, { strict: false }).join("|"), /speed/);
  void goblin;
});
