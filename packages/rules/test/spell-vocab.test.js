// Issue #165: vocabulary the party's spells asked for (docs/DEBT.md, "The spells the owner's party
// prepares"), each with the spells it raised. Everything here goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";
import { apply, current, moveOptions } from "../src/engine.js";
import { canSee } from "../src/sight.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "should be refused"); assert.match(r.error, re); };
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.encounter = null; s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", 0, 0], ["fighter", -2, 0], ["rogue", -4, 4], ["cleric", -1, 1]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  const slots = { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 };
  for (const id of ["wizard", "cleric"]) Object.assign(s.entities[id], { slots: { ...slots }, slotsMax: { ...slots } });
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 300;
  return s;
}
const learn = (s, id, ...spells) => s.entities[id].spells.push(...spells);
const spawn = (s, q, r, monster = "goblin-warrior") => { const e = s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 300; return e; };
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 12 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 60 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const at = (e) => [e.pos.q, e.pos.r];
const lint = (spell) => lintPack({ pack: { id: "t", name: "T", license: "CC-BY-4.0", attribution: "t" }, spells: [spell], monsters: [], pregens: [], conditions: [], objects: [] });
const base = { id: "x", name: "X", source: "SRD 5.2.1", level: 2, school: "conjuration", classes: ["wizard"], time: "bonus", range: "self", components: ["v"],
  duration: "instant", concentration: false, ritual: false, target: { self: true }, tier: "auto", checked: false, text: "A test." };

// ---------- 1. teleport ----------

test("teleport: the linter takes a distance, `see`, and `blocked`, only on a spell aimed at its caster", () => {
  assert.deepEqual(lint({ ...base, effects: [{ teleport: 30, see: true }] }), []);
  assert.match(lint({ ...base, effects: [{ teleport: 32 }] }).join(), /multiple of 5/);
  assert.match(lint({ ...base, effects: [{ teleport: 30, see: "yes" }] }).join(), /`see` is true/);
  assert.match(lint({ ...base, target: { creature: { count: 1 } }, range: 30, effects: [{ teleport: 30 }] }).join(), /aimed at its caster/);
  assert.match(lint({ ...base, effects: [{ damage: "1d6", type: "fire", blocked: [{ damage: "1d6", type: "fire" }] }] }).join(), /`blocked` is for a teleport/);
  assert.deepEqual(SPELLS["misty-step"].teleport, { feet: 30, see: true });
});

test("Misty Step: auto; a Bonus Action and a slot take the caster up to 30 ft, and the goblin beside it gets no Opportunity Attack", () => {
  const d = SPELLS["misty-step"].def;
  assert.deepEqual([d.tier, d.checked, d.time, d.range, d.duration], ["auto", true, "bonus", "self", "instant"]);
  const s = field(); learn(s, "wizard", "misty-step");
  const g = spawn(s, 1, 0);
  fight(s); turnOf(s, "wizard");
  const w = s.entities.wizard;
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "misty-step", hex: { q: 0, r: -6 } }, DM));
  assert.deepEqual(at(w), [0, -6]);
  assert.equal(w.slots[2], 2);
  assert.equal(s.encounter.budget.bonus, 0, "a Bonus Action");
  assert.equal(s.encounter.budget.action, 1, "the action is left");
  const moved = r.events.find((e) => e.type === "moved" && e.id === "wizard");
  assert.deepEqual([moved.teleport, moved.path.length], [true, 1]);
  assert.equal(r.events.some((e) => e.type === "attack" || e.type === "reactionAsked"), false, "no Opportunity Attack");
  assert.equal(r.events.some((e) => e.type === "manual"), false, "nothing for the DM");
  assert.ok(g);
});

test("Misty Step: refused, with nothing spent, beyond 30 ft, onto someone it knows is there, onto its own hex, or out of the arena", () => {
  const s = field(); learn(s, "wizard", "misty-step");
  const g = spawn(s, 3, 0);
  fight(s); turnOf(s, "wizard");
  const w = s.entities.wizard, before = JSON.stringify([w.pos, w.slots, s.encounter.budget]);
  no(apply(s, { type: "cast", actor: "wizard", spell: "misty-step", hex: { q: 7, r: 0 } }, DM), /35 ft away\. Misty Step reaches 30 ft/);
  no(apply(s, { type: "cast", actor: "wizard", spell: "misty-step", hex: { q: 3, r: 0 } }, DM), /occupied/);
  no(apply(s, { type: "cast", actor: "wizard", spell: "misty-step", hex: { q: 0, r: 0 } }, DM), /already there/);
  s.encounter.arena = Object.fromEntries(Object.entries(s.encounter.arena).filter(([k]) => k !== "0,-5"));
  no(apply(s, { type: "cast", actor: "wizard", spell: "misty-step", hex: { q: 0, r: -5 } }, DM), /arena is locked/);
  assert.equal(JSON.stringify([w.pos, w.slots, s.encounter.budget]), before);
  assert.ok(g);
});

test("Misty Step: the caster must see the space; in the dark without Darkvision it cannot", () => {
  const s = field(); learn(s, "wizard", "misty-step");
  const w = s.entities.wizard;
  w.senses = {};
  ok(apply(s, { type: "mapEdit", ops: [{ op: "level", level: { id: s.map.levels[0].id, light: "dark" } }] }, DM));
  no(apply(s, { type: "cast", actor: "wizard", spell: "misty-step", hex: { q: 0, r: -4 } }, DM), /can't see that space/);
  w.senses = { darkvision: 60 };
  ok(apply(s, { type: "cast", actor: "wizard", spell: "misty-step", hex: { q: 0, r: -4 } }, DM));
  assert.deepEqual(at(w), [0, -4]);
});

test("Misty Step without a destination: the slot is spent and the DM moves the caster", () => {
  const s = field(); learn(s, "wizard", "misty-step");
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "misty-step" }, DM));
  assert.deepEqual(at(s.entities.wizard), [0, 0]);
  assert.equal(s.entities.wizard.slots[2], 2);
  assert.ok(r.events.some((e) => e.type === "manual" && /names no destination/.test(e.text) && !e.partial));
});

test("teleport onto a creature the caster did not know of: the nearest unoccupied space instead", () => {
  const s = field(); learn(s, "wizard", "misty-step");
  const g = spawn(s, 0, -3); g.hidden = true;
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "misty-step", hex: { q: 0, r: -3 } }, DM));
  const w = s.entities.wizard;
  assert.notDeepEqual(at(w), [0, -3]);
  assert.equal(Math.max(Math.abs(w.pos.q), Math.abs(w.pos.r), Math.abs(w.pos.q + w.pos.r - (0 + -3))) >= 0, true);
  // It is beside where it meant to go.
  const dq = w.pos.q - 0, dr = w.pos.r + 3;
  assert.equal((Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2, 1);
  assert.ok(r.events.some((e) => e.type === "moved" && e.teleport));
});

test("Dimension Door: assist; 500 ft with no need to see, and 4d6 Force with no teleport when a creature it did not know of is there", () => {
  const d = SPELLS["dimension-door"].def;
  assert.deepEqual([d.tier, d.checked, d.level, d.time, d.range], ["assist", true, 4, "action", 500]);
  const s = field(); learn(s, "wizard", "dimension-door");
  const w = s.entities.wizard;
  w.senses = {};
  ok(apply(s, { type: "mapEdit", ops: [{ op: "level", level: { id: s.map.levels[0].id, light: "dark" } }] }, DM));
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "dimension-door", hex: { q: 0, r: -8 } }, DM));
  assert.deepEqual(at(w), [0, -8], "unseen is fine for Dimension Door");
  assert.ok(r.events.some((e) => e.type === "manual" && /companion/.test(e.text)), "the DM is told about the companion");
  const g = spawn(s, 3, -8); g.hidden = true;
  const hp = w.hp, r2 = ok(apply(s, { type: "cast", actor: "wizard", spell: "dimension-door", hex: { q: 3, r: -8 } }, DM));
  assert.deepEqual(at(w), [0, -8], "the teleportation fails");
  const dmg = r2.events.find((e) => e.type === "damage" && e.target === "wizard");
  assert.equal(dmg.dtype, "force");
  assert.ok(hp - w.hp >= 4 && hp - w.hp <= 24);
});

test("teleport into a lasting zone sets it off, as walking in does", () => {
  const s = field(); learn(s, "wizard", "misty-step", "web");
  const g = spawn(s, 6, 0);
  fight(s); turnOf(s, "wizard");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "web", hex: { q: 1, r: -3 } }, DM));
  const fx = s.effects.find((x) => x.name === "Web");
  const into = fx.zone.hexes.map((k) => k.split(",").map(Number)).find(([q, r]) => !(q === 6 && r === 0) && Math.abs(q) + Math.abs(r) + Math.abs(q + r) <= 12 && !(q === 0 && r === 0));
  // The fighter teleports in on a later turn (a DM casting for it is the same as a player).
  learn(s, "fighter", "misty-step"); Object.assign(s.entities.fighter, { slots: { 2: 1 }, slotsMax: { 2: 1 }, castAbil: "int" });
  turnOf(s, "fighter");
  const f = s.entities.fighter, dest = fx.zone.hexes.map((k) => k.split(",").map(Number)).find(([q, r]) => { const dq = q + 2, dr = r; return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 <= 6; });
  assert.ok(dest, "a hex of the web within 30 ft of the fighter");
  const r = ok(apply(s, { type: "cast", actor: "fighter", spell: "misty-step", hex: { q: dest[0], r: dest[1] } }, DM));
  assert.ok(r.events.some((e) => e.type === "zone" && e.id === "fighter"), "the web works on it");
  assert.ok(r.events.some((e) => e.type === "save" && e.id === "fighter"));
  assert.ok(into && g && f);
});

test("teleport and the player: a place in an unrevealed region is refused without saying what is there, and a hidden caster's teleport is not sent", () => {
  const s = field(); learn(s, "wizard", "misty-step");
  s.entities.wizard.owner = "pat";
  s.map.regions.push({ id: "vault", name: "Vault", level: s.map.levels[0].id, hexes: ["0,-4", "1,-4"], revealed: false });
  no(apply(s, { type: "cast", actor: "wizard", spell: "misty-step", hex: { q: 0, r: -4 } }, PAT), /Pick a place the party has seen/);
  // The DM may send it there; the region is then shown, as walking in would show it.
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "misty-step", hex: { q: 0, r: -4 } }, DM));
  assert.ok(r.events.some((e) => e.type === "region" && e.region === "vault"));
  // Under the line-of-sight rule, a monster behind a wall teleports: players are told nothing of it.
  s.settings.sight = "los";
  s.map.walls.push({ id: "w", level: s.map.levels[0].id, a: [12.5, -200], b: [12.5, 200], kind: "wall" });
  const imp = spawn(s, 6, 3); imp.spells = ["misty-step"]; imp.slots = { 2: 1 }; imp.slotsMax = { 2: 1 }; imp.castAbil = "cha"; imp.level = 5;
  const r2 = ok(apply(s, { type: "cast", actor: imp.id, spell: "misty-step", hex: { q: 6, r: 0 } }, DM));
  assert.ok(r2.events.some((e) => e.type === "moved" && e.id === imp.id));
  assert.deepEqual(viewEvents(r2.events, s, PAT).filter((e) => e.id === imp.id || e.actor === imp.id), []);
  assert.equal(view(s, PAT).entities[imp.id], undefined);
});

// ---------- 2. cure ----------

test("cure: the linter takes conditions or \"chosen\" with a condition choice, never Exhaustion", () => {
  const b = { ...base, range: "touch", target: { creature: { count: 1 } } };
  assert.deepEqual(lint({ ...b, effects: [{ cure: ["blinded", "poisoned"] }] }), []);
  assert.deepEqual(lint({ ...b, choice: { of: "condition", from: ["blinded", "deafened"] }, effects: [{ cure: ["chosen"] }] }), []);
  assert.match(lint({ ...b, effects: [{ cure: ["chosen"] }] }).join(), /choice: \{ of: "condition" \}/);
  assert.match(lint({ ...b, effects: [{ cure: ["exhaustion"] }] }).join(), /not exhaustion/);
  assert.match(lint({ ...b, effects: [{ cure: [] }] }).join(), /`cure` lists/);
  assert.match(lint({ ...b, effects: [{ modifier: { on: "check", op: "advantage", scope: { condition: "poisoned" } }, }], duration: "1 hour" }).join(), /on a save/);
});

test("Lesser Restoration: auto; ends the one condition chosen, a Bonus Action, touch", () => {
  const d = SPELLS["lesser-restoration"].def;
  assert.deepEqual([d.tier, d.checked, d.time, d.range, d.level], ["auto", true, "bonus", "touch", 2]);
  const s = field(); learn(s, "cleric", "lesser-restoration");
  const f = s.entities.fighter;
  ok(apply(s, { type: "place", actor: "fighter", to: { q: -1, r: 0 } }, DM));
  for (const c of ["blinded", "poisoned"]) ok(apply(s, { type: "condition", actor: "fighter", condition: c, on: true }, DM));
  no(apply(s, { type: "cast", actor: "cleric", spell: "lesser-restoration", target: "fighter", choice: "stunned" }, DM), /Choose a condition/);
  assert.equal(s.entities.cleric.slots[2], 3, "nothing spent on a refusal");
  const r = ok(apply(s, { type: "cast", actor: "cleric", spell: "lesser-restoration", target: "fighter", choice: "poisoned" }, DM));
  assert.equal(f.cond.poisoned, undefined);
  assert.ok(f.cond.blinded, "only the one chosen");
  assert.ok(r.events.some((e) => e.type === "condEnd" && e.id === "fighter" && e.cond === "poisoned"));
  assert.equal(r.events.some((e) => e.type === "manual"), false);
  no(apply(s, { type: "cast", actor: "cleric", spell: "lesser-restoration", target: "rogue", choice: "blinded" }, DM), /reaches touch/);
});

test("Lesser Restoration ends a condition a spell holds, and the spell's part with it", () => {
  const s = field(); learn(s, "wizard", "hold-person"); learn(s, "cleric", "lesser-restoration");
  const g = spawn(s, 2, 0, "bandit"); g.abil.wis = 1;
  fight(s); turnOf(s, "wizard");
  let held = false;
  for (let i = 0; i < 5 && !held; i++) { ok(apply(s, { type: "cast", actor: "wizard", spell: "hold-person", target: g.id }, DM)); held = !!g.cond.paralyzed; s.encounter.budget.action = 1; s.encounter.flags = {}; }
  assert.ok(held, "the bandit is Paralyzed");
  const fx = s.effects.find((x) => x.name === "Hold Person");
  turnOf(s, "cleric");
  ok(apply(s, { type: "place", actor: "cleric", to: { q: 1, r: 0 } }, DM));
  const r = ok(apply(s, { type: "cast", actor: "cleric", spell: "lesser-restoration", target: g.id, choice: "paralyzed" }, DM));
  assert.equal(g.cond.paralyzed, undefined);
  assert.ok(r.events.some((e) => e.type === "effectEnd" && e.fx === fx.id), "nothing is left of Hold Person");
});

test("Heal: auto; 70 Hit Points (80 at level 7) and Blinded, Deafened and Poisoned end, others stay", () => {
  const d = SPELLS.heal.def;
  assert.deepEqual([d.tier, d.checked, d.range, d.time], ["auto", true, 60, "action"]);
  const s = field(); learn(s, "cleric", "heal");
  const f = s.entities.fighter; f.hp = 10;
  for (const c of ["blinded", "deafened", "poisoned", "frightened"]) ok(apply(s, { type: "condition", actor: "fighter", condition: c, on: true }, DM));
  ok(apply(s, { type: "cast", actor: "cleric", spell: "heal", target: "fighter" }, DM));
  assert.equal(f.hp, 80);
  for (const c of ["blinded", "deafened", "poisoned"]) assert.equal(f.cond[c], undefined, c);
  assert.ok(f.cond.frightened, "Frightened is not one Heal ends");
  f.hp = 10;
  ok(apply(s, { type: "cast", actor: "cleric", spell: "heal", target: "fighter", slot: 7 }, DM));
  assert.equal(f.hp, 90);
});

test("Protection from Poison: auto; ends Poisoned, then Resistance to Poison and Advantage on saves against Poisoned only", () => {
  const d = SPELLS["protection-from-poison"].def;
  assert.deepEqual([d.tier, d.checked, d.range, d.duration, d.concentration], ["auto", true, "touch", "1 hour", false]);
  const s = field(); learn(s, "cleric", "protection-from-poison", "lesser-restoration");
  const f = s.entities.fighter;
  ok(apply(s, { type: "place", actor: "fighter", to: { q: -1, r: 0 } }, DM));
  ok(apply(s, { type: "condition", actor: "fighter", condition: "poisoned", on: true }, DM));
  ok(apply(s, { type: "cast", actor: "cleric", spell: "protection-from-poison", target: "fighter" }, DM));
  assert.equal(f.cond.poisoned, undefined);
  // Contagion's Constitution save is one to avoid Poisoned: Advantage.
  learn(s, "wizard", "contagion");
  ok(apply(s, { type: "place", actor: "wizard", to: { q: -1, r: -1 } }, DM));
  spawn(s, 8, 0); fight(s); turnOf(s, "wizard");
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "contagion", target: "fighter" }, DM));
  const sv = r.events.find((e) => e.type === "save" && e.id === "fighter");
  assert.equal(sv.mode, "adv");
  assert.ok(sv.why.includes("Protection from Poison"));
  const dmg = r.events.filter((e) => e.type === "damage" && e.target === "fighter");
  assert.ok(dmg.every((e) => e.dtype !== "poison" || e.note === "resisted"));
  // Its Resistance: poison damage is halved.
  const hp = f.hp;
  ok(apply(s, { type: "harm", actor: "fighter", amount: 10, dtype: "poison" }, DM));
  assert.equal(hp - f.hp, 5);
});

// ---------- 3. a rider on a kill ----------

test("onZero, onKill, kill, remains: the linter keeps them on damage steps and under those branches", () => {
  const b = { ...base, level: 5, time: "action", range: 60, target: { creature: { count: 1 } } };
  assert.deepEqual(lint({ ...b, effects: [{ damage: "1d6", type: "cold", onKill: [{ remains: "frozen-statue" }] }] }), []);
  assert.deepEqual(lint({ ...b, effects: [{ damage: "1d6", type: "force", onZero: [{ kill: true }, { remains: "dust" }] }] }), []);
  assert.match(lint({ ...b, effects: [{ heal: "1d6", onKill: [{ remains: "dust" }] }] }).join(), /`onKill` is for a damage step/);
  assert.match(lint({ ...b, effects: [{ remains: "dust" }] }).join(), /goes under a damage step's onZero or onKill/);
  assert.match(lint({ ...b, effects: [{ damage: "1d6", type: "cold", onKill: [{ remains: "ice" }] }] }).join(), /`remains` is one of/);
});

test("Cone of Cold: auto; a creature it kills is a frozen statue, one it does not kill is not, even on a successful save", () => {
  const d = SPELLS["cone-of-cold"].def;
  assert.deepEqual([d.tier, d.checked, d.level, d.range, d.target.area.shape, d.target.area.size], ["auto", true, 5, "self", "cone", 60]);
  const s = field(); learn(s, "wizard", "cone-of-cold");
  const weak = spawn(s, 3, 0), tough = spawn(s, 4, 0);
  weak.hp = 1; weak.abil.con = 30;              // it saves, and half the damage still kills it
  tough.hp = tough.maxHp = 500;
  fight(s); turnOf(s, "wizard");
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "cone-of-cold", hex: { q: 3, r: 0 } }, DM));
  assert.ok(r.events.some((e) => e.type === "save" && e.id === weak.id && e.success));
  assert.equal(weak.dead, true);
  assert.equal(weak.remains, "frozen-statue");
  assert.ok(r.events.some((e) => e.type === "remains" && e.id === weak.id));
  assert.equal(tough.dead, false); assert.equal(tough.remains, undefined);
  // Players see the statue where the creature is known.
  s.entities.wizard.owner = "pat";
  assert.equal(view(s, PAT).entities[weak.id].remains, "frozen-statue");
  assert.ok(viewEvents(r.events, s, PAT).some((e) => e.type === "remains" && e.id === weak.id));
  // A DM who raises it takes the statue away.
  ok(apply(s, { type: "setHp", actor: weak.id, hp: 5 }, DM));
  assert.equal(weak.remains, undefined);
});

test("Disintegrate: a character it brings to 0 Hit Points dies outright and is dust; one above 0 does not", () => {
  const s = field(); learn(s, "wizard", "disintegrate");
  const f = s.entities.fighter;
  f.abil.dex = 1; f.hp = 30; f.maxHp = 300;
  spawn(s, 9, 0); fight(s); turnOf(s, "wizard");
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "disintegrate", target: "fighter" }, DM));
  assert.ok(r.events.some((e) => e.type === "save" && e.id === "fighter" && !e.success), "Dexterity 1 fails");
  assert.equal(f.dead, true, "no death saves");
  assert.equal(f.remains, "dust");
  assert.ok(r.events.some((e) => e.type === "died" && e.id === "fighter"));
  const c = s.entities.cleric; c.abil.dex = 1; c.hp = c.maxHp = 400;
  s.encounter.budget.action = 1; s.encounter.flags = {}; s.entities.wizard.slots[6] = 1;
  ok(apply(s, { type: "cast", actor: "wizard", spell: "disintegrate", target: "cleric" }, DM));
  assert.equal(c.dead, false); assert.equal(c.remains, undefined);
});

// ---------- 4. terrain and obscuring ----------

test("terrain: the linter takes difficult and obscured on one area that stays, and lasts only for an instant spell", () => {
  const b = { ...base, level: 4, time: "action", range: 300, target: { area: { shape: "cylinder", size: 20, height: 40 } }, effects: [{ save: "dex", onFail: [{ damage: "1d6", type: "cold" }] }] };
  assert.deepEqual(lint({ ...b, terrain: { difficult: true, lasts: "nextTurnEnd" } }), []);
  assert.match(lint({ ...b, terrain: { difficult: true } }).join(), /terrain.lasts/);
  assert.match(lint({ ...b, duration: "1 minute", terrain: { obscured: "heavy", lasts: "nextTurnEnd" } }).join(), /terrain.lasts/);
  assert.match(lint({ ...b, duration: "1 minute", terrain: { obscured: "thick" } }).join(), /"heavy" or "light"/);
  assert.match(lint({ ...b, duration: "1 minute", terrain: {} }).join(), /must be an object|difficult or obscured/);
  assert.match(lint({ ...b, duration: "1 minute", target: { area: { shape: "emanation", size: 10 } }, terrain: { difficult: true } }).join(), /stays where it is laid out/);
});

// The cost of stepping from one hex to its neighbour, for this creature now.
const stepCost = (s, e, to) => moveOptions(s, e).get(`${to.q},${to.r}`)?.cost;

test("Ice Storm: auto; its cylinder is Difficult Terrain until the end of the caster's next turn, and walking there costs double", () => {
  const d = SPELLS["ice-storm"].def;
  assert.deepEqual([d.tier, d.checked, d.range, d.duration, d.target.area.size, d.target.area.height], ["auto", true, 300, "instant", 20, 40]);
  const s = field(); learn(s, "wizard", "ice-storm");
  const g = spawn(s, 8, 0);
  fight(s); turnOf(s, "wizard");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "ice-storm", hex: { q: 8, r: 0 } }, DM));
  const fx = s.effects.find((x) => x.name === "Ice Storm");
  assert.ok(fx.terrain.difficult && fx.terrain.hexes.includes("9,0"));
  turnOf(s, g.id);
  assert.equal(stepCost(s, g, { q: 9, r: 0 }), 10, "into the hail: 10 ft for 5");
  ok(apply(s, { type: "endTurn", actor: g.id }, DM));
  turnOf(s, "wizard");
  assert.ok(s.effects.includes(fx), "still there during the caster's next turn");
  const end = ok(apply(s, { type: "endTurn", actor: "wizard" }, DM));
  assert.ok(end.events.some((e) => e.type === "effectEnd" && e.fx === fx.id));
  turnOf(s, g.id);
  assert.equal(stepCost(s, g, { q: 9, r: 0 }), 5, "the ground is ordinary again");
  // Players are not sent where the terrain is (the client has nothing to draw it with yet).
  s.entities.wizard.owner = "pat";
  ok(apply(s, { type: "endTurn", actor: g.id }, DM)); turnOf(s, "wizard");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "ice-storm", hex: { q: 8, r: 0 }, slot: 5 }, DM));
  for (const x of view(s, PAT).effects) assert.equal("terrain" in x, false);
});

test("Grease: auto; Difficult Terrain for its minute, with the zone's saves as before", () => {
  const d = SPELLS.grease.def;
  assert.deepEqual([d.tier, d.checked, d.duration, d.target.area.size], ["auto", true, "1 minute", 10]);
  const s = field(); learn(s, "wizard", "grease");
  const g = spawn(s, 6, 0);
  fight(s); turnOf(s, "wizard");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "grease", hex: { q: 4, r: 0 } }, DM));
  const fx = s.effects.find((x) => x.name === "Grease");
  assert.ok(fx.terrain.hexes.includes("5,0") && !fx.terrain.hexes.includes("6,0"), fx.terrain.hexes.join(" "));
  turnOf(s, g.id);
  if (g.cond.prone) ok(apply(s, { type: "condition", actor: g.id, condition: "prone", on: false }, DM));
  assert.equal(stepCost(s, g, { q: 5, r: 0 }), 10, "onto the grease: 10 ft for 5");
  assert.equal(stepCost(s, g, { q: 7, r: 0 }), 5, "away from it: 5 ft");
  assert.ok(fx.terrain.difficult);
});

test("Sleet Storm: a creature in it cannot be seen, its ground is difficult, and a failed save knocks it Prone and ends its Concentration", () => {
  const s = field(); learn(s, "wizard", "sleet-storm"); learn(s, "cleric", "bless");
  const g = spawn(s, 8, 0);
  fight(s); turnOf(s, "cleric");
  ok(apply(s, { type: "cast", actor: "cleric", spell: "bless", targets: ["cleric"] }, DM));
  assert.ok(s.effects.some((x) => x.name === "Bless" && x.conc));
  turnOf(s, "wizard");
  const w = s.entities.wizard;
  assert.equal(canSee(s, w, g), "yes");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "sleet-storm", hex: { q: 8, r: 0 } }, DM));
  assert.equal(canSee(s, w, g), "no", "Heavily Obscured");
  const fx = s.effects.find((x) => x.name === "Sleet Storm");
  assert.deepEqual([fx.terrain.difficult, fx.terrain.obscured], [true, "heavy"]);
  // The cleric walks in and fails: Prone, and Bless ends.
  const c = s.entities.cleric; c.abil.dex = 1; c.saveProf = c.saveProf.filter((x) => x !== "dex");
  turnOf(s, "cleric");
  ok(apply(s, { type: "place", actor: "cleric", to: { q: 3, r: 0 } }, DM));
  assert.equal(stepCost(s, c, { q: 4, r: 0 }), 10, "its ground is Difficult Terrain");
  const r = ok(apply(s, { type: "move", actor: "cleric", to: { q: 4, r: 0 } }, DM));
  const sv = r.events.find((e) => e.type === "save" && e.id === "cleric");
  assert.ok(sv && !sv.success, "the cleric fails with Dexterity 1");
  assert.ok(c.cond.prone);
  assert.equal(s.effects.some((x) => x.name === "Bless"), false, "Concentration lost");
});

test("Fog Cloud: assist; nobody sees into it, a creature in it may Hide, and players are not sent a goblin inside it", () => {
  const d = SPELLS["fog-cloud"].def;
  assert.deepEqual([d.tier, d.checked, d.range, d.concentration, d.duration, d.target.area.size], ["assist", true, 120, true, "1 hour", 20]);
  const s = field(); learn(s, "wizard", "fog-cloud");
  s.settings.sight = "light";
  const g = spawn(s, 6, 0);
  s.entities.wizard.owner = "pat";
  assert.ok(view(s, PAT).entities[g.id], "seen in the open");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "fog-cloud", hex: { q: 6, r: 0 } }, DM));
  assert.equal(canSee(s, s.entities.wizard, g), "no");
  assert.equal(view(s, PAT).entities[g.id], undefined, "not sent while it is in the fog");
  // The rogue steps into the fog and hides from the goblin there.
  ok(apply(s, { type: "place", actor: "rogue", to: { q: 4, r: 0 } }, DM));
  const h = apply(s, { type: "hide", actor: "rogue" }, DM);
  assert.ok(h.ok, h.error);
});

// ---------- 5. ends on damage by the caster's side; a repeat save on damage; "fighting it" ----------

test("ends.by, at: damaged and advantageIf: the linter", () => {
  const b = { ...base, level: 4, time: "action", range: 30, duration: "1 hour", target: { creature: { count: 1 } } };
  const charm = (ends, extra = {}) => lint({ ...b, effects: [{ save: "wis", ...extra, onFail: [{ condition: "charmed", ends }] }] });
  assert.deepEqual(charm({ on: "damaged", by: "source" }, { advantageIf: ["target.fought"] }), []);
  assert.deepEqual(charm({ on: "save", save: "wis", at: "damaged" }), []);
  assert.match(charm({ on: "turnEnd", by: "source" }).join(), /`ends.by` is "source"/);
  assert.match(charm({ on: "damaged" }, { advantageIf: ["target.liked"] }).join(), /unknown situation tag/);
  assert.match(charm({ on: "damaged" }, { advantageIf: [] }).join(), /lists situation tags/);
});

test("Charm Monster: Advantage on the save when the caster's side is fighting it, and the charm ends when that side damages it", () => {
  const d = SPELLS["charm-monster"].def;
  assert.deepEqual([d.tier, d.checked, d.range, d.duration, d.concentration], ["assist", true, 30, "1 hour", false]);
  const s = field(); learn(s, "wizard", "charm-monster", "fire-bolt");
  const g = spawn(s, 3, 0), h = spawn(s, 4, 1);
  g.abil.wis = 1; g.saveBonus = { wis: -10 };
  fight(s); turnOf(s, "wizard");
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "charm-monster", target: g.id }, DM));
  const sv = r.events.find((e) => e.type === "save" && e.id === g.id);
  assert.equal(sv.mode, "adv", "the wizard's side is fighting it");
  assert.ok(g.cond.charmed);
  // Damage from its own side does not end it; damage from the wizard's side does.
  ok(apply(s, { type: "harm", actor: g.id, amount: 1 }, DM));
  assert.ok(g.cond.charmed, "damage from no creature (the DM's harm) does not end it");
  turnOf(s, h.id);
  const hit = apply(s, { type: "act", actor: h.id, action: s.entities[h.id].actions[0].id, target: g.id }, DM);
  if (hit.ok && hit.events.some((e) => e.type === "damage" && e.target === g.id && e.amount > 0)) assert.ok(g.cond.charmed, "a goblin's blow is not the wizard's side");
  turnOf(s, "fighter");
  ok(apply(s, { type: "place", actor: "fighter", to: { q: 2, r: 0 } }, DM));
  let ended = false;
  for (let i = 0; i < 6 && !ended; i++) {
    const a = apply(s, { type: "attack", actor: "fighter", target: g.id, attack: s.entities.fighter.attacks[0].id }, DM);
    if (!a.ok) { s.encounter.budget.action = 1; delete s.encounter.budget.attacks; continue; }
    ended = a.events.some((e) => e.type === "condEnd" && e.id === g.id && e.cond === "charmed");
    s.encounter.budget.action = 1; delete s.encounter.budget.attacks;
  }
  assert.ok(ended, "the fighter's hit ends the charm");
});

test("Charm Monster on a creature nobody is fighting: no Advantage", () => {
  const s = field(); learn(s, "wizard", "charm-monster");
  spawn(s, 9, 0); fight(s); turnOf(s, "wizard");
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "charm-monster", target: "fighter" }, DM));
  const sv = r.events.find((e) => e.type === "save" && e.id === "fighter");
  assert.notEqual(sv.mode, "adv");
});

test("Dominate Monster: the target repeats the save whenever it takes damage, and a success ends the spell on it", () => {
  const d = SPELLS["dominate-monster"].def;
  assert.deepEqual([d.tier, d.checked, d.level, d.range, d.concentration, d.duration], ["assist", true, 8, 60, true, "1 hour"]);
  const s = field(); learn(s, "wizard", "dominate-monster");
  const g = spawn(s, 3, 0);
  g.saveBonus = { wis: -20 };
  fight(s); turnOf(s, "wizard");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "dominate-monster", target: g.id }, DM));
  assert.ok(g.cond.charmed);
  const fx = s.effects.find((x) => x.name === "Dominate Monster");
  const r = ok(apply(s, { type: "harm", actor: g.id, amount: 2 }, DM));
  const again = r.events.find((e) => e.type === "save" && e.id === g.id && e.against === "Dominate Monster");
  assert.ok(again, "a repeat save on damage");
  assert.equal(again.success, false);
  assert.ok(g.cond.charmed);
  g.saveBonus = { wis: 40 };
  const r2 = ok(apply(s, { type: "harm", actor: g.id, amount: 2 }, DM));
  assert.ok(r2.events.some((e) => e.type === "save" && e.id === g.id && e.success));
  assert.equal(g.cond.charmed, undefined);
  assert.equal(s.effects.includes(fx), false, "the spell ended on its only target");
  // Players are told of the save as of any save by a creature they see, without its DC.
  s.entities.wizard.owner = "pat";
  const seen = viewEvents(r2.events, s, PAT).find((e) => e.type === "save" && e.id === g.id);
  assert.ok(seen && seen.dc === undefined);
});
