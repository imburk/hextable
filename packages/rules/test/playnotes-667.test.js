// The owner's play notes of 15 Nov (issue #667), each played through apply() with seeded dice and checked
// against SRD 5.2.1 (reference/srd52/srd52.txt). One test group per note; the verdict is in each group's comment.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { CONTENT } from "../src/content/index.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "refused"); if (re) assert.match(r.error, re); };
const A = { str: 14, dex: 16, con: 14, int: 16, wis: 12, cha: 10 };
const sheets = {
  rogue: { name: "Ro", class: "rogue", level: 5, subclass: "thief", abilities: { ...A, dex: 18 }, skills: ["acrobatics", "stealth", "perception", "deception"], armour: "leather-armor", weapons: ["shortsword", "shortbow"] },
  wizard: { name: "Wi", class: "wizard", level: 5, abilities: { ...A, int: 18 }, skills: ["arcana", "history"], spells: ["fire-bolt", "magic-missile", "burning-hands"] },
};

// An open grass field, a hero (Ro the rogue or Wi the wizard) at 0,0 and a tough foe beside it; the fighter, an ally, beside
// the foe too (so Sneak Attack applies). In a fight, on the hero's turn.
function field(sheet, seed, { foeAt = { q: 1, r: 0 }, ac = 1, monster = "goblin-warrior", hp = 900 } = {}) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (id !== "fighter") delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  ok(apply(s, { type: "place", actor: "fighter", to: { q: foeAt.q + 1, r: foeAt.r } }, DM));
  s.foe = ok(apply(s, { type: "spawn", monster, at: foeAt }, DM)).events[0].id;
  Object.assign(s.entities[s.foe], { hp, maxHp: hp, ac });
  return s;
}
const fight = (s, who = "hero") => {
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  for (let i = 0; i < 12 && current(s) !== who; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.equal(current(s), who);
};
const turnOf = (s, id) => { for (let i = 0; i < 12 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
// Try seeds until `want(result, state)` holds.
function seeded(make, act, want, n = 600) {
  for (let seed = 1; seed < n; seed++) { const s = make(seed); const r = act(s); if (r.ok && want(r, s)) return { s, r }; }
  assert.fail("no seed gave the wanted outcome");
}
const sum = (ds) => ds.reduce((a, d) => a + d.value, 0);

// ---------- 1. Magic Missile ----------
// SRD "Magic Missile": three darts, each strikes a creature of your choice and deals 1d4 + 1 Force damage; "The darts all
// strike simultaneously, and you can direct them to hit one creature or several." Verdict: the engine already makes each
// dart its own choice and its own 1d4+1 roll. One thing was wrong: darts at a creature an earlier dart had killed were logged
// as damage to a corpse and a second "dies".

const mm = (seed) => { const s = field(sheets.wizard, seed, { hp: 500 }); fight(s); return s; };

test("note 1: Magic Missile: each dart is its own choice of target and its own 1d4+1 roll; one more dart per slot level", () => {
  const s = mm(5);
  const g2 = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 1 } }, DM)).events[0].id;
  Object.assign(s.entities[g2], { hp: 500, maxHp: 500 });
  const r = ok(apply(s, { type: "cast", actor: "hero", spell: "magic-missile", targets: [s.foe, s.foe, g2] }, DM));
  const hits = r.events.filter((e) => e.type === "damage");
  assert.deepEqual(hits.map((h) => h.target), [s.foe, s.foe, g2]);
  for (const h of hits) { assert.equal(h.dice.length, 1); assert.equal(h.dice[0].sides, 4); assert.equal(h.bonus, 1); assert.equal(h.amount, h.dice[0].value + 1); assert.equal(h.dtype, "force"); }
  // Level 3 slot: three darts + 2 more = 5.
  const t = mm(5);
  const five = ok(apply(t, { type: "cast", actor: "hero", spell: "magic-missile", slot: 3, targets: Array(5).fill(t.foe) }, DM));
  assert.equal(five.events.filter((e) => e.type === "damage").length, 5);
  no(apply(mm(5), { type: "cast", actor: "hero", spell: "magic-missile", targets: Array(4).fill("m1") }, DM));
});

test("note 1: darts all strike at once, so a creature one dart kills is killed once, not logged twice", () => {
  const s = mm(5);
  s.entities[s.foe].hp = 1;
  const r = ok(apply(s, { type: "cast", actor: "hero", spell: "magic-missile", targets: [s.foe, s.foe, s.foe] }, DM));
  assert.equal(r.events.filter((e) => e.type === "died" && e.id === s.foe).length, 1, "one death");
  assert.equal(r.events.filter((e) => e.type === "damage" && e.target === s.foe).length, 1, "no damage to the dead");
  assert.ok(s.entities[s.foe].dead);
});

test("note 1: darts that put a player character to 0 Hit Points: later darts are damage at 0 and fail a death save each", () => {
  const s = field(sheets.wizard, 5, { hp: 500 });
  const f = s.entities.fighter; f.hp = 1;
  s.entities.evil = makeEntity(derive(sheets.wizard).record, { id: "evil", kind: "npc", side: "foe", pos: { q: 0, r: 2, z: 0 } });
  fight(s, "evil");
  const r = ok(apply(s, { type: "cast", actor: "evil", spell: "magic-missile", targets: ["fighter", "fighter", "fighter"] }, DM));
  assert.equal(r.events.filter((e) => e.type === "damage" && e.target === "fighter").length, 3);
  assert.equal(f.hp, 0);
  assert.equal(f.death.f, 2, "dart 2 and 3 each fail a death save (SRD: damage at 0 Hit Points)");
});

// ---------- 2. Critical hits ----------
// SRD "Critical Hits": "Roll the attack's damage dice twice, add them together, and add any relevant modifiers as normal ...
// If the attack involves other damage dice, such as from the Rogue's Sneak Attack feature, you also roll those dice twice."
// The note says the damage was "two dice, not two dice and double the damage". Verdict: see each test.

// What one hit did: every damage event on `who`, as total dice faces rolled and the flat bonus, by damage type.
function tally(r, who) {
  const out = {};
  for (const e of r.events.filter((x) => x.type === "damage" && x.target === who)) {
    const o = (out[e.dtype] ??= { dice: [], bonus: 0, amount: 0 });
    o.dice.push(...(e.dice ?? []).map((d) => d.sides)); o.bonus += e.bonus ?? 0; o.amount += e.amount;
    assert.equal(e.amount, sum(e.dice ?? []) + (e.bonus ?? 0), "the amount is the dice plus the bonus, nothing doubled");
  }
  return out;
}
const swings = (n) => (r) => r.events.find((x) => x.type === "attack").crit === n;

test("note 2: a weapon crit doubles the weapon die and Sneak Attack dice, and adds the ability modifier once", () => {
  const make = (seed) => { const s = field(sheets.rogue, seed); fight(s); return s; };
  const act = (s) => apply(s, { type: "attack", actor: "hero", target: s.foe, attack: "shortsword" }, DM);
  const crit = seeded(make, act, swings(true)), plain = seeded(make, act, (r) => swings(false)(r) && r.events.find((x) => x.type === "attack").hit);
  const c = tally(crit.r, crit.s.foe).piercing, p = tally(plain.r, plain.s.foe).piercing;
  assert.deepEqual(p.dice, [6, 6, 6, 6], "1d6 and 3d6 Sneak Attack");
  assert.deepEqual(c.dice, Array(8).fill(6), "2d6 and 6d6");
  assert.equal(c.bonus, 4, "Dexterity modifier once");
  assert.equal(p.bonus, 4);
});

test("note 2: a spell attack crit doubles the cantrip's dice (Fire Bolt 2d10 at level 5 becomes 4d10)", () => {
  const make = (seed) => { const s = field(sheets.wizard, seed, { foeAt: { q: 3, r: 0 } }); fight(s); return s; };
  const act = (s) => apply(s, { type: "cast", actor: "hero", spell: "fire-bolt", target: s.foe }, DM);
  const crit = seeded(make, act, swings(true));
  const c = tally(crit.r, crit.s.foe).fire;
  assert.deepEqual(c.dice, Array(4).fill(10), "level 5: 2d10, doubled");
  assert.equal(c.bonus, 0);
});

test("note 2: Hunter's Mark's extra 1d6 is rolled twice on a critical hit, and a flat bonus is not doubled", () => {
  const mark = CONTENT.spells["hunters-mark"].effects[0].modifier;
  const make = (seed) => { const s = field(sheets.rogue, seed); fight(s); s.entities.hero.feats = [{ name: "Hunter's Mark", modifiers: [mark] }]; return s; };
  const act = (s) => apply(s, { type: "attack", actor: "hero", target: s.foe, attack: "shortsword" }, DM);
  const crit = seeded(make, act, swings(true));
  const t = tally(crit.r, crit.s.foe);
  assert.deepEqual(t.force.dice, [6, 6], "1d6 force, twice");
  assert.equal(t.force.bonus, 0);
  assert.equal(t.piercing.bonus, 4);
});

test("note 2: a monster's crit rolls its damage dice twice and adds its modifier once", () => {
  const make = (seed) => { const s = field(sheets.wizard, seed, { hp: 900 }); s.entities.hero.ac = 1; s.entities.hero.hp = s.entities.hero.maxHp = 500; fight(s, s.foe); return s; };
  const act = (s) => apply(s, { type: "attack", actor: s.foe, target: "hero", attack: "scimitar" }, DM);
  const crit = seeded(make, act, swings(true));
  assert.equal(CONTENT.monsters["goblin-warrior"].actions.find((x) => x.id === "scimitar").effects[0].onHit[0].damage, "1d6+2");
  const t = tally(crit.r, "hero");
  assert.deepEqual(t.slashing.dice, [6, 6]);
  assert.equal(t.slashing.bonus, 2);
});

// Verdict note 2: not a bug. Every attack (weapon, spell, monster) rolls all its damage dice twice and adds the flat
// modifier once. The "two dice" the owner saw is the doubled die (2d6 for a 1d6 weapon), not a missing modifier.
