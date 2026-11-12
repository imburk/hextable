// Dice-valued modifiers (DEBT S1), a check limited to a skill or an ability (S7), a choice made
// in casting (S5: Guidance's skill, Resistance's damage type), and death saves reading modifiers.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { apply, current, passive } from "../src/engine.js";
import { modifiers } from "../src/modifiers.js";
import { newGame } from "../src/scenario.js";
import { viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PLAYER = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", 0, 0], ["fighter", 1, 0], ["rogue", 0, 1], ["cleric", 1, -1]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  Object.assign(s.entities.cleric, { slots: { 1: 4, 2: 3, 3: 3 }, slotsMax: { 1: 4, 2: 3, 3: 3 } });
  s.entities.cleric.spells.push("bless", "bane", "guidance", "resistance", "enhance-ability", "protection-from-energy");
  return s;
}
const spawn = (s, monster, q, r) => { const e = s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 300; return e; };
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const cast = (s, spell, extra) => apply(s, { type: "cast", actor: "cleric", spell, ...extra }, DM);

test("Bless adds a d4 to attack rolls and saves, rolled each time and shown in the roll", () => {
  const s = field(), g = spawn(s, "goblin-warrior", 2, 0);
  assert.equal(SPELLS.bless.def.tier, "auto");
  ok(cast(s, "bless", { targets: ["fighter", "rogue", "wizard"] }));
  assert.deepEqual(modifiers(s, s.entities.fighter, "attack.roll").dice, [{ dice: "1d4", name: "Bless" }]);
  fight(s); turnOf(s, "fighter");
  const atk = ok(apply(s, { type: "attack", actor: "fighter", target: g.id, attack: s.entities.fighter.attacks[0].id }, DM)).events.find((e) => e.type === "attack");
  assert.equal(atk.extra.length, 1);
  assert.equal(atk.extra[0].name, "Bless");
  assert.ok(atk.extra[0].roll >= 1 && atk.extra[0].roll <= 4);
  assert.equal(atk.total, atk.nat + s.entities.fighter.attacks[0].bonus + atk.extra[0].roll);
  // A saving throw: the goblin's Rend is an attack, so test a save directly through a concentration check.
  const sv = viewEvents([atk], s, PLAYER)[0];
  assert.deepEqual(sv.extra, atk.extra, "a player sees what was added to their own roll");
  // The cleric is not blessed: nothing added.
  assert.deepEqual(modifiers(s, s.entities.cleric, "attack.roll").dice, []);
  assert.deepEqual(modifiers(s, s.entities.fighter, "save", { ability: "dex" }).dice, [{ dice: "1d4", name: "Bless" }]);
});

test("Bane takes a d4 off a failed creature's attacks and saves; players are not shown a monster's dice", () => {
  const s = field(), g = spawn(s, "goblin-warrior", 2, 0);
  g.abil.cha = 1;
  fight(s);
  for (let i = 0; i < 10; i++) {
    turnOf(s, "cleric");
    const r = ok(cast(s, "bane", { targets: [g.id] }));
    if (r.events.some((e) => e.type === "save" && !e.success)) break;
    ok(apply(s, { type: "endTurn", actor: "cleric" }, DM));
  }
  assert.deepEqual(modifiers(s, g, "attack.roll").dice, [{ dice: "-1d4", name: "Bane" }]);
  turnOf(s, g.id);
  const res = ok(apply(s, { type: "act", actor: g.id, action: g.actions.find((a) => a.effects?.[0]?.attack).id, target: "fighter" }, DM));
  const atk = res.events.find((e) => e.type === "attack");
  assert.ok(atk.extra[0].roll <= -1 && atk.extra[0].roll >= -4);
  const seen = viewEvents(res.events, s, PLAYER).find((e) => e.type === "attack");
  assert.equal("extra" in seen, false, "a monster's roll is not itemised for players");
  assert.equal("total" in seen, false);
});

test("Guidance: a skill chosen in casting, a d4 on checks with that skill only, never on a passive score", () => {
  const s = field();
  ok(apply(s, { type: "place", actor: "rogue", to: { q: 2, r: -1 } }, DM));
  assert.match(cast(s, "guidance", { target: "rogue" }).error, /Choose a skill/);
  assert.match(cast(s, "guidance", { target: "rogue", choice: "fire" }).error, /Choose a skill/);
  const before = passive(s, s.entities.rogue, "perception");
  const res = ok(cast(s, "guidance", { target: "rogue", choice: "perception" }));
  assert.equal(res.events.find((e) => e.type === "cast").choice, "perception");
  assert.equal(passive(s, s.entities.rogue, "perception"), before);
  const look = ok(apply(s, { type: "check", actor: "rogue", skill: "perception" }, DM)).events[0];
  assert.equal(look.extra[0].name, "Guidance");
  assert.equal(look.total, look.roll + look.bonus + look.extra[0].roll);
  const sneak = ok(apply(s, { type: "check", actor: "rogue", skill: "stealth" }, DM)).events[0];
  assert.equal("extra" in sneak, false);
});

test("Enhance Ability gives Advantage on checks with the chosen ability only", () => {
  const s = field();
  ok(cast(s, "enhance-ability", { target: "fighter", choice: "str" }));
  assert.match(cast(s, "enhance-ability", { target: "fighter", choice: "con" }).error, /Choose an ability/);
  assert.equal(modifiers(s, s.entities.fighter, "check", { ability: "str", skill: "athletics" }).advantage.length, 1);
  assert.equal(modifiers(s, s.entities.fighter, "check", { ability: "dex", skill: "stealth" }).advantage.length, 0);
});

test("Resistance takes 1d4 off damage of the chosen type, once a turn; Protection from Energy resists the chosen type", () => {
  const s = field(), g = spawn(s, "goblin-warrior", 3, 0);
  ok(cast(s, "resistance", { target: "fighter", choice: "fire" }));
  ok(apply(s, { type: "place", actor: "cleric", to: { q: -3, r: 3 } }, DM));
  s.entities.wizard.spells.push("scorching-ray");
  Object.assign(s.entities.wizard, { slots: { 1: 2, 2: 2 }, slotsMax: { 1: 2, 2: 2 } });
  const f = s.entities.fighter;
  f.hp = f.maxHp = 300; f.ac = 1;
  fight(s); turnOf(s, "wizard");
  // Three rays in one turn: only the first fire damage is reduced.
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "scorching-ray", targets: ["fighter", "fighter", "fighter"] }, DM));
  const hits = r.events.filter((e) => e.type === "damage");
  assert.ok(hits.length >= 2, "at least two rays hit");
  assert.equal(hits[0].adjusted[0].name, "Resistance");
  assert.ok(hits[0].adjusted[0].roll <= -1 && hits[0].adjusted[0].roll >= -4);
  assert.ok(hits.slice(1).every((d) => !d.adjusted), "once a turn");
  assert.equal("adjusted" in viewEvents(r.events, s, PLAYER).find((e) => e.type === "damage"), false, "players are sent the amount, not how it was made");
  ok(apply(s, { type: "endTurn", actor: "wizard" }, DM));
  // Protection from Energy.
  turnOf(s, "cleric");
  ok(apply(s, { type: "place", actor: "rogue", to: { q: -2, r: 3 } }, DM));
  ok(cast(s, "protection-from-energy", { target: "rogue", choice: "cold" }));
  assert.deepEqual(modifiers(s, s.entities.rogue, "damage.taken").resist, ["cold"]);
});

test("a death saving throw reads save modifiers: Bless adds its d4", () => {
  const s = field(), g = spawn(s, "goblin-warrior", 5, 5);
  ok(cast(s, "bless", { targets: ["rogue"] }));
  fight(s);
  const rogue = s.entities.rogue;
  rogue.hp = 0; rogue.cond.unconscious = {}; rogue.cond.prone = {};
  let ds = null;
  for (let i = 0; i < 20 && !ds; i++) { const r = ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); ds = r.events.find((e) => e.type === "deathSave"); }
  assert.ok(ds, "a death save was rolled");
  assert.equal(ds.extra[0].name, "Bless");
  assert.equal(ds.total, ds.roll + ds.extra[0].roll);
  void g;
});
