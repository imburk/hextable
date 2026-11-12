// Rules the engine got wrong (docs/DEBT.md, W1 to W9), each checked against the SRD 5.2 text.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, SPELLS } from "../src/content/index.js";
import { apply, current, moveOptions, rollMode } from "../src/engine.js";
import { spellProfile } from "../src/effects.js";
import * as H from "../src/hex.js";
import { newMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };

// The party on open grass with no monsters, one goblin added; as in durations.test.js.
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM);
  apply(s, { type: "place", actor: "fighter", to: { q: 0, r: 1 } }, DM);
  const goblin = s.entities[apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 2, r: 0 } }, DM).events[0].id];
  Object.assign(goblin, { hp: 500, maxHp: 500 });
  return { s, goblin };
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) apply(s, { type: "endTurn", actor: current(s) }, DM); assert.equal(current(s), id); };
// Try an action on copies of the state with different dice until `want` holds.
function until(s, act, want) {
  for (let seed = 1; seed < 500; seed++) { const c = structuredClone(s); c.rng = seed; const r = act(c); if (want(r, c)) return { s: c, r }; }
  throw new Error("no seed gave the wanted outcome");
}
const dying = (e, death = { s: 0, f: 0 }) => Object.assign(e, { hp: 0, cond: { unconscious: {}, prone: {} }, death });

// ---------- W1: Long Rest ----------

test("W1: a Long Rest restores Hit Points, slots and features, and lowers Exhaustion by one level", () => {
  const s = newGame(3), { fighter, wizard } = s.entities;
  fighter.hp = 3; fighter.uses.secondWind = 0;
  wizard.slots[1] = 0;
  ok(apply(s, { type: "condition", actor: "fighter", condition: "exhaustion", level: 3 }, DM));
  ok(apply(s, { type: "condition", actor: "wizard", condition: "exhaustion", level: 1 }, DM));
  ok(apply(s, { type: "rest" }, DM));
  assert.equal(fighter.hp, fighter.maxHp);
  assert.equal(fighter.uses.secondWind, fighter.features.secondWind);
  assert.deepEqual(wizard.slots, wizard.slotsMax);
  assert.equal(fighter.cond.exhaustion.level, 2);
  assert.equal(wizard.cond.exhaustion, undefined);
});

test("W1: a Long Rest does not end other conditions", () => {
  const s = newGame(3);
  ok(apply(s, { type: "condition", actor: "rogue", condition: "poisoned" }, DM));
  ok(apply(s, { type: "rest" }, DM));
  assert.ok(s.entities.rogue.cond.poisoned);
});

test("W1: the dead stay dead, and a creature at 0 Hit Points can't take a Long Rest", () => {
  const s = newGame(3), { fighter, rogue, cleric } = s.entities;
  fighter.dead = true; fighter.hp = 0;
  Object.assign(rogue, { hp: 0, cond: { unconscious: {}, prone: {}, stable: {} }, death: { s: 0, f: 0 } });
  Object.assign(cleric, { hp: 0, cond: { unconscious: {}, prone: {} }, death: { s: 1, f: 1 } });
  cleric.slots[1] = 0;
  const r = ok(apply(s, { type: "rest" }, DM));
  assert.equal(fighter.dead, true);
  assert.equal(fighter.hp, 0);
  assert.equal(rogue.hp, 1);                                    // Stable: 1 Hit Point after 1d4 hours, nothing more
  assert.equal(cleric.hp, 0);                                   // dying: left to the DM
  assert.equal(cleric.slots[1], 0);
  assert.ok(r.events.some((e) => e.type === "manual" && e.actor === "cleric"));
});

// ---------- W2: death ----------

test("W2: damage taken at 0 Hit Points that equals the Hit Point maximum kills outright", () => {
  const { s, goblin } = field();
  const brenna = s.entities.fighter;
  fight(s);
  brenna.maxHp = 3; dying(brenna);
  apply(s, { type: "place", actor: goblin.id, to: { q: 1, r: 1 } }, DM);
  turnOf(s, goblin.id);
  goblin.attacks[0].bonus = 50;
  const { s: after, r } = until(s, (c) => apply(c, { type: "attack", actor: goblin.id, target: "fighter", attack: goblin.attacks[0].id }, DM),
    (r) => r.ok && r.events.some((e) => e.type === "attack" && e.hit));
  const hurt = r.events.find((e) => e.type === "damage");
  assert.ok(hurt.amount >= 3);
  assert.equal(after.entities.fighter.dead, true);           // a crit at 0 HP would only be two failures
  assert.ok(r.events.some((e) => e.type === "died" && e.id === "fighter"));
});

test("W2: smaller damage at 0 Hit Points is still one failure, or two for a critical hit", () => {
  const { s, goblin } = field();
  const brenna = s.entities.fighter;
  fight(s);
  brenna.maxHp = 100; dying(brenna);
  apply(s, { type: "place", actor: goblin.id, to: { q: 1, r: 1 } }, DM);
  turnOf(s, goblin.id);
  goblin.attacks[0].bonus = 50;
  const { s: after } = until(s, (c) => apply(c, { type: "attack", actor: goblin.id, target: "fighter", attack: goblin.attacks[0].id }, DM),
    (r) => r.ok && r.events.some((e) => e.type === "attack" && e.hit));
  assert.equal(after.entities.fighter.dead, false);
  assert.equal(after.entities.fighter.death.f, 2);            // within 5 ft of an Unconscious creature every hit is a critical hit
});

test("W2: becoming Stable resets both death-save counts", () => {
  const { s, goblin } = field();
  fight(s);
  turnOf(s, goblin.id);
  dying(s.entities.fighter, { s: 2, f: 2 });
  // The fighter's next Death Saving Throw: a 10 to 19 is the third success.
  const { s: after, r } = until(s, (c) => { const out = []; for (let i = 0; i < 10 && !out.some((e) => e.type === "deathSave"); i++) out.push(...apply(c, { type: "endTurn", actor: current(c) }, DM).events); return out; },
    (ev) => { const d = ev.find((e) => e.type === "deathSave"); return d && d.roll >= 10 && d.roll < 20; });
  const brenna = after.entities.fighter;
  assert.ok(brenna.cond.stable);
  assert.deepEqual(brenna.death, { s: 0, f: 0 });
  assert.equal(r.find((e) => e.type === "deathSave").stable, true);
});

// ---------- W3: Resistance and Vulnerability ----------

test("W3: Resistance and Vulnerability to the same type halve (rounding down) and then double", () => {
  const burn = (vuln) => {
    const { s, goblin } = field();
    apply(s, { type: "place", actor: goblin.id, to: { q: 1, r: 0 } }, DM);
    ok(apply(s, { type: "condition", actor: goblin.id, condition: "paralyzed" }, DM));      // fails Dexterity saves: full damage
    Object.assign(goblin, { resist: ["fire"], vuln });
    fight(s); turnOf(s, "wizard");
    const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "burning-hands", hex: goblin.pos }, DM));
    return r.events.find((e) => e.type === "damage" && e.target === goblin.id);
  };
  const halved = burn([]), both = burn(["fire"]);      // same seed, same roll
  assert.ok(halved.amount > 0);
  assert.equal(both.amount, halved.amount * 2);
  assert.equal(both.note, "resisted and vulnerable");
});

// ---------- W4: ranged attacks in close combat ----------

test("W4: an enemy beside an archer imposes Disadvantage only if it is not Incapacitated and can see (is not Blinded)", () => {
  const { s, goblin } = field();
  apply(s, { type: "place", actor: goblin.id, to: { q: 1, r: 0 } }, DM);
  const far = s.entities[ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 5, r: 0 } }, DM)).events[0].id];
  const bow = { name: "Shortbow", type: "ranged", range: [80, 320], bonus: 5 };
  const wizard = s.entities.wizard;
  assert.ok(rollMode(s, wizard, far, bow).dis.includes("enemy within 5 ft"));
  ok(apply(s, { type: "condition", actor: goblin.id, condition: "stunned" }, DM));
  assert.equal(rollMode(s, wizard, far, bow).dis.includes("enemy within 5 ft"), false);
  ok(apply(s, { type: "condition", actor: goblin.id, condition: "stunned", on: false }, DM));
  ok(apply(s, { type: "condition", actor: goblin.id, condition: "blinded" }, DM));
  assert.equal(rollMode(s, wizard, far, bow).dis.includes("enemy within 5 ft"), false);
});

// ---------- W7: a tool used with a skill ----------

// A locked wooden door in a wall, the rogue beside it (as in walls.test.js).
function lockedDoor() {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 5).map((h) => [H.col(h), { t: "stone" }]));
  const s = newGame(4);
  ok(apply(s, { type: "loadMap", map: newMap({ id: "hall", name: "Hall", starts: [{ q: -2, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }],
    walls: [{ id: "north", level: "ground", a: [1.25, -100], b: [1.25, -1.5], kind: "wall" }, { id: "south", level: "ground", a: [1.25, 1.5], b: [1.25, 100], kind: "wall" }],
    objects: [{ id: "door", def: "door-wooden", level: "ground", at: { q: 0, r: 0 }, seg: { a: [1.25, -1.5], b: [1.25, 1.5] }, state: "locked" }] }) }, DM));
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  for (const [id, q, r] of [["fighter", -2, 0], ["rogue", 0, 0], ["cleric", -2, 1], ["wizard", -3, 1]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  return s;
}

test("W7: picking a lock is Dexterity (Sleight of Hand) with Thieves' Tools; proficient in both gives Advantage", () => {
  const s = lockedDoor();
  const c = ok(apply(s, { type: "use", actor: "rogue", object: "door", verb: "pick" }, DM)).events[0];
  assert.equal(c.skill, "sleight-of-hand");
  assert.equal(c.mode, "adv");
  assert.deepEqual(c.why, ["tool and skill"]);
  assert.equal(c.total, c.roll + 3 + 4);                                            // Expertise in Sleight of Hand doubles the bonus
});

test("W7: the tool alone adds the Proficiency Bonus but gives no Advantage", () => {
  const s = lockedDoor();
  Object.assign(s.entities.rogue, { skills: ["stealth"], expertise: ["stealth"] });
  const c = ok(apply(s, { type: "use", actor: "rogue", object: "door", verb: "pick" }, DM)).events[0];
  assert.equal(c.mode, undefined);
  assert.equal(c.total, c.roll + 3 + 2);
});

// ---------- W8: a helpful condition is not an attack ----------

test("W8: a spell is harmful for an attack, a save, damage or a hostile condition, not for Invisible", () => {
  const spell = (effects) => spellProfile({ ...structuredClone(CONTENT.spells["greater-invisibility"]), effects });
  assert.equal(spell([{ condition: "invisible" }]).harmful, false);
  assert.equal(spell([{ condition: "poisoned" }]).harmful, true);
  assert.equal(spell([{ save: "con", onFail: [{ condition: "invisible" }] }]).harmful, true);
  assert.equal(SPELLS.invisibility.harmful, false);
  assert.equal(SPELLS["greater-invisibility"].harmful, false);
});

test("W8: Invisibility on oneself or an ally makes them Invisible and starts no fight", () => {
  const { s } = field();
  const wizard = s.entities.wizard;
  Object.assign(wizard, { slots: { 2: 3, 4: 1 }, slotsMax: { 2: 3, 4: 1 } });
  wizard.spells.push("invisibility", "greater-invisibility");
  ok(apply(s, { type: "place", actor: "cleric", to: { q: 1, r: 0 } }, DM));
  const self = ok(apply(s, { type: "cast", actor: "wizard", spell: "invisibility", target: "wizard" }, DM));
  assert.equal(s.encounter, null);
  assert.ok(wizard.cond.invisible);
  assert.ok(self.events.some((e) => e.type === "manual" && /ends the spell early/.test(e.text)));   // assist: the early ending is the DM's
  ok(apply(s, { type: "cast", actor: "wizard", spell: "greater-invisibility", target: "cleric" }, DM));   // Concentration moves to the new spell
  assert.equal(s.encounter, null);
  assert.ok(s.entities.cleric.cond.invisible);
  assert.equal(wizard.cond.invisible, undefined);                    // Invisibility ended with the old Concentration
  ok(apply(s, { type: "endEffect", effect: s.effects.at(-1).id }, DM));
  assert.equal(s.entities.cleric.cond.invisible, undefined);
});

// ---------- W6: moving through other creatures ----------

test("W6: a hostile creature blocks, unless it is Incapacitated, Tiny or two sizes apart; its space is Difficult Terrain unless it is Tiny", () => {
  const { s, goblin } = field();
  ok(apply(s, { type: "place", actor: "wizard", to: { q: -5, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: goblin.id, to: { q: 1, r: 1 } }, DM));        // beside the fighter at 0,1
  const brenna = s.entities.fighter, at = H.key(goblin.pos);
  const through = () => moveOptions(s, brenna).get(at);
  assert.equal(through(), undefined);                                              // Small against Medium: one size apart
  ok(apply(s, { type: "condition", actor: goblin.id, condition: "stunned" }, DM));
  assert.deepEqual([through().cost, through().canStop], [10, false]);              // Incapacitated: Difficult Terrain, and no stopping there
  ok(apply(s, { type: "condition", actor: goblin.id, condition: "stunned", on: false }, DM));
  ok(apply(s, { type: "setSize", actor: goblin.id, size: "tiny" }, DM));
  assert.deepEqual([through().cost, through().canStop], [5, false]);               // Tiny: no extra cost (and Brenna is not Tiny, so no sharing)
  ok(apply(s, { type: "setSize", actor: goblin.id, size: "small" }, DM));
  ok(apply(s, { type: "place", actor: goblin.id, to: { q: 5, r: -3 } }, DM));
  ok(apply(s, { type: "setSize", actor: "fighter", size: "large" }, DM));
  ok(apply(s, { type: "place", actor: goblin.id, to: { q: 2, r: 1 } }, DM));
  const big = moveOptions(s, brenna).get(H.key(goblin.pos));                      // Large against Small: two sizes apart
  assert.ok(big, "a Large creature can pass through a Small one");
  assert.equal(big.canStop, false);
});

test("W6: an ally can still be passed at no extra cost", () => {
  const { s } = field();
  ok(apply(s, { type: "place", actor: "wizard", to: { q: 1, r: 1 } }, DM));
  const v = moveOptions(s, s.entities.fighter).get(H.key({ q: 1, r: 1 }));
  assert.deepEqual([v.cost, v.canStop], [5, false]);
});
