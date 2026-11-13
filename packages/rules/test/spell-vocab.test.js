// Issue #165: vocabulary the party's spells asked for (docs/DEBT.md, "The spells the owner's party
// prepares"), each with the spells it raised. Everything here goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";
import { apply, current } from "../src/engine.js";
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
