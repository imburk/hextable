// The Shove option of the Unarmed Strike (issue #462, stage G1 of docs/specs/grapple-shove.md; DEBT T61).
// SRD 5.2 "Unarmed Strike", Shove: "The target must succeed on a Strength or Dexterity saving throw (it chooses which), or you either
// push it 5 feet away or cause it to have the Prone condition. The DC for the saving throw equals 8 plus your Strength modifier and
// Proficiency Bonus. This shove is possible only if the target is no more than one size larger than you."
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { viewEvents } from "../src/view.js";
import { lintRecord } from "../src/content/schema.js";
import { squareRoom } from "./fixtures/square-room.js";

const DM = { role: "dm", userId: "dm" };
const U1 = { role: "player", userId: "u1" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "should have been refused"); assert.match(r.error, re); return r; };
const fighter = (abilities, weapons = [], more = {}) => ({ name: "Fi", class: "fighter", level: 5, subclass: "champion", abilities,
  skills: ["athletics", "perception"], choices: { "fighting-style": "defense" }, weapons, ...more });
const monk = (abilities) => ({ name: "Mo", class: "monk", level: 5, subclass: "open-hand", abilities, skills: ["acrobatics", "insight"], weapons: [] });
const STR16 = { str: 16, dex: 14, con: 14, int: 10, wis: 8, cha: 8 };
const MONK = { str: 10, dex: 16, con: 14, int: 10, wis: 14, cha: 8 };
const SHOVE = { type: "attack", actor: "hero", attack: "unarmed-strike", option: "shove" };
const fails = (e) => { e.saveBonus = { str: -40, dex: -40 }; };            // the save cannot succeed
const holds = (e) => { e.saveBonus = { str: 40, dex: 40 }; };              // the save cannot fail
// A refused action: the reason, and the state byte for byte as it was.
const refused = (s, action, re) => { const before = JSON.stringify(s), r = apply(s, action, DM); assert.equal(r.ok, false, "should have been refused"); assert.match(r.error, re); assert.equal(JSON.stringify(s), before, "a refusal changes nothing"); };
const saveOf = (r) => r.events.find((e) => e.type === "save");

// A hero (built from `sheet`) at 0,0 and a foe `gap` cells away on grass, a fight begun and the hero's turn. `square`: the square room, hero at 1,6.
// `more(s, foe)` may set things up before the fight starts (a rider, a size).
function field(sheet, { gap = 1, monster = "goblin-warrior", square = false, more = null, fight = true } = {}) {
  const s = newGame(7);
  if (square) ok(apply(s, { type: "loadMap", map: squareRoom() }, DM));
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  if (!square) for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  const at = square ? { q: 1, r: 6 } : { q: 0, r: 0 };
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { ...at, z: 0 } });
  const foe = ok(apply(s, { type: "spawn", monster, at: { q: at.q + gap, r: at.r } }, DM)).events.find((e) => e.type === "spawned").id;
  Object.assign(s.entities[foe], { hp: 500, maxHp: 500, ac: 1 });
  s.foe = foe;
  more?.(s, s.entities[foe]);
  if (fight) {
    ok(apply(s, { type: "startEncounter", center: at, radius: 8 }, DM));
    for (let i = 0; i < 8 && current(s) !== "hero"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    assert.equal(current(s), "hero");
  }
  return s;
}
const shove = (s, how, more = {}) => apply(s, { ...SHOVE, target: s.foe, shove: how, ...more }, DM);

test("the Unarmed Strike record carries the save DC: 8 + Strength modifier + Proficiency Bonus, and with Martial Arts the better of Strength and Dexterity", () => {
  const a = derive(fighter(STR16)).record.attacks.find((x) => x.id === "unarmed-strike");
  assert.equal(a.dc, 14, "8 + 3 + 3");
  const weak = derive(fighter({ ...STR16, str: 8 }, ["rapier"])).record.attacks.find((x) => x.id === "unarmed-strike");
  assert.equal(weak.dc, 10, "8 - 1 + 3");
  const m = derive(monk(MONK)).record.attacks;
  assert.equal(m.find((x) => x.id === "unarmed-strike").dc, 14, "Dexterous Attacks: Dexterity 16");
  assert.equal(m.find((x) => x.id === "unarmed-strike-bonus").dc, 14);
  assert.deepEqual(lintRecord(derive(monk(MONK)).record), [], "a record with a dc is a record the linter accepts");
  assert.ok(lintRecord({ ...derive(fighter(STR16)).record, attacks: [{ ...a, dc: "x" }] }).some((x) => /1 to 40/.test(x)));
});

test("a failed save pushes the target 5 ft straight away; no attack roll is made", () => {
  const s = field(fighter(STR16));
  fails(s.entities[s.foe]);
  const r = ok(shove(s, "push"));
  const types = r.events.map((e) => e.type);
  assert.ok(!types.includes("attack"), "no attack roll");
  assert.ok(types.indexOf("strikeOption") < types.indexOf("save") && types.indexOf("save") < types.indexOf("moved"), types.join());
  assert.deepEqual(r.events.find((e) => e.type === "strikeOption"), { type: "strikeOption", actor: "hero", target: s.foe, option: "shove", shove: "push" });
  const sv = saveOf(r);
  assert.equal(sv.dc, 14);
  assert.equal(sv.by, "hero");
  assert.equal(sv.success, false);
  assert.deepEqual(s.entities[s.foe].pos, { q: 2, r: 0, z: 0 });
  const mv = r.events.find((e) => e.type === "moved");
  assert.equal(mv.forced, true);
  assert.equal(s.entities[s.foe].cond.prone, undefined);
  assert.equal(s.encounter.budget.action, 0, "it spent what the Attack action's first attack spends");
});

test("a successful save leaves the target where it stood and standing", () => {
  const s = field(fighter(STR16));
  holds(s.entities[s.foe]);
  const r = ok(shove(s, "push"));
  assert.equal(saveOf(r).success, true);
  assert.deepEqual(s.entities[s.foe].pos, { q: 1, r: 0, z: 0 });
  assert.ok(!r.events.some((e) => e.type === "moved"));
  const t = field(fighter(STR16));
  holds(t.entities[t.foe]);
  ok(shove(t, "prone"));
  assert.equal(t.entities[t.foe].cond.prone, undefined);
});

test("the push stops at a wall (square room), at a creature, and sets off no Opportunity Attack", () => {
  const s = field(fighter(STR16), { square: true, gap: 1 });
  fails(s.entities[s.foe]);
  assert.deepEqual(s.entities[s.foe].pos, { q: 2, r: 6, z: 0 }, "the wall stands between columns 2 and 3 at row 6");
  const r = ok(shove(s, "push"));
  assert.equal(saveOf(r).success, false);
  assert.deepEqual(s.entities[s.foe].pos, { q: 2, r: 6, z: 0 }, "the wall stops it: nowhere to go");
  assert.ok(!r.events.some((e) => e.type === "moved"));
  assert.equal(s.entities.hero.reactionUsed ?? false, false);
  // Open floor: it goes one square away.
  const t = field(fighter(STR16), { square: true, gap: 1 });
  t.entities.hero.pos = { q: 4, r: 1, z: 0 }; t.entities[t.foe].pos = { q: 5, r: 1, z: 0 };
  fails(t.entities[t.foe]);
  ok(shove(t, "push"));
  assert.deepEqual(t.entities[t.foe].pos, { q: 6, r: 1, z: 0 });
  // Creatures in every cell it could be pushed to: it does not move.
  const u = field(fighter(STR16));
  for (const at of [{ q: 2, r: 0 }, { q: 2, r: -1 }, { q: 1, r: 1 }]) ok(apply(u, { type: "spawn", monster: "goblin-warrior", at }, DM));
  fails(u.entities[u.foe]);
  ok(shove(u, "push"));
  assert.deepEqual(u.entities[u.foe].pos, { q: 1, r: 0, z: 0 });
});

test("Prone: a failed save knocks the target Prone and it does not move", () => {
  const s = field(fighter(STR16));
  fails(s.entities[s.foe]);
  const r = ok(shove(s, "prone"));
  assert.ok(s.entities[s.foe].cond.prone);
  assert.deepEqual(s.entities[s.foe].pos, { q: 1, r: 0, z: 0 });
  assert.ok(r.events.some((e) => e.type === "cond" && e.id === s.foe && e.cond === "prone"));
  assert.ok(!r.events.some((e) => e.type === "moved"));
});

test("the target's save is the better of Strength and Dexterity", () => {
  const a = field(fighter(STR16));
  Object.assign(a.entities[a.foe], { saveBonus: { str: 9, dex: -3 } });
  assert.equal(saveOf(ok(shove(a, "push"))).abil, "str");
  const b = field(fighter(STR16));
  Object.assign(b.entities[b.foe], { saveBonus: { str: -3, dex: 9 } });
  assert.equal(saveOf(ok(shove(b, "push"))).abil, "dex");
  const c = field(fighter(STR16));
  Object.assign(c.entities[c.foe], { saveBonus: { str: 2, dex: 2 } });
  assert.equal(saveOf(ok(shove(c, "push"))).abil, "str", "a tie goes to Strength");
  // Restrained: Disadvantage on Dexterity saves, so a lower Strength bonus is the better chance.
  const d = field(fighter(STR16));
  Object.assign(d.entities[d.foe], { saveBonus: { str: 1, dex: 3 } });
  ok(apply(d, { type: "condition", actor: d.foe, condition: "restrained" }, DM));
  assert.equal(saveOf(ok(shove(d, "push"))).abil, "str");
});

test("a target two sizes larger is refused, before anything is spent; one size larger is allowed", () => {
  const s = field(fighter(STR16), { monster: "hill-giant", gap: 2 });
  const before = JSON.stringify(s);
  no(shove(s, "push"), /no more than one size larger/);
  assert.equal(JSON.stringify(s), before, "nothing changed");
  const t = field(fighter(STR16), { monster: "ogre" });
  fails(t.entities[t.foe]);
  ok(shove(t, "push"));
  assert.deepEqual(t.entities[t.foe].pos, { q: 2, r: 0, z: 0 }, "Large is one size above Medium");
  const u = field(fighter(STR16), { monster: "ogre", more: (x) => { x.entities.hero.size = "small"; } });
  no(shove(u, "push"), /no more than one size larger/);
  const v = field(fighter(STR16), { monster: "giant-rat", more: (x) => { x.entities.hero.size = "large"; } });
  ok(shove(v, "push"));
});

test("it is refused for a weapon attack, with no choice of what it does, or beside Brutal Strike; Punch and Grab goes with the Damage option", () => {
  const s = field(fighter(STR16, ["longsword"]));
  const at = { type: "attack", actor: "hero", target: s.foe, attack: "unarmed-strike" };
  refused(s, { ...SHOVE, attack: "longsword", target: s.foe, shove: "push" }, /options of the Unarmed Strike/);
  refused(s, { ...SHOVE, target: s.foe }, /Choose what the Shove does/);
  refused(s, { ...SHOVE, target: s.foe, shove: "sideways" }, /"push".*"prone"/);
  refused(s, { ...SHOVE, target: s.foe, shove: "push", brutal: "x" }, /Damage option/);
  refused(s, { ...SHOVE, target: s.foe, shove: "push", cunning: ["x"] }, /Damage option/);
  refused(s, { ...at, shove: "push" }, /goes with the Shove/);
  refused(s, { ...at, option: "grapple", shove: "push" }, /goes with the Shove/);      // stage G2 built the Grapple option (grapple.test.js)
  refused(s, { ...at, option: "kick" }, /Choose an option/);
  refused(s, { ...at, grab: true }, /Grappler feat/);                                 // stage G2 built Punch and Grab: it needs the feat
  refused(s, { ...SHOVE, target: s.foe, shove: "push", grab: true }, /Punch and Grab goes with the Damage option/);
});

test("the refusals hold for a Flurry strike and the Monk's Bonus Action strike too, with the flurry and the Bonus Action left whole", () => {
  const s = field(monk(MONK));
  ok(apply(s, { type: "feature", actor: "hero", feature: "flurry-of-blows" }, DM));
  refused(s, { ...SHOVE, target: s.foe }, /Choose what the Shove does/);
  refused(s, { ...SHOVE, target: s.foe, shove: "push", grab: true }, /Punch and Grab/);
  assert.equal(s.encounter.budget.bonusAttacks.left, 2);
  const t = field(monk(MONK));
  refused(t, { ...SHOVE, attack: "unarmed-strike-bonus", target: t.foe, shove: "sideways" }, /"push".*"prone"/);
  refused(t, { ...SHOVE, attack: "unarmed-strike-bonus", target: t.foe, option: "grapple", shove: "push" }, /goes with the Shove/);
  assert.deepEqual([t.encounter.budget.bonus, t.encounter.budget.action], [1, 1]);
});

test("a pack monster's action, by `attack` or `act`, refuses option, shove and grab, and changes nothing", () => {
  const s = field(fighter(STR16));
  const e = s.entities[s.foe];
  e.side = "party"; s.entities.hero.side = "foe";
  for (let i = 0; i < 8 && current(s) !== s.foe; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  const act = e.actions.find((x) => !x.multiattack && x.target?.creature);
  assert.ok(act, "an attack action");
  for (const more of [{ option: "shove", shove: "push" }, { option: "grapple" }, { option: "bogus" }, { shove: "push" }, { grab: true }]) {
    refused(s, { type: "attack", actor: s.foe, target: "hero", attack: act.id, ...more }, /options of the Unarmed Strike/);
    refused(s, { type: "act", actor: s.foe, action: act.id, target: "hero", ...more }, /options of the Unarmed Strike/);
  }
  ok(apply(s, { type: "act", actor: s.foe, action: act.id, target: "hero", option: "damage" }, DM));
});

test("a Shove at an already Prone target is allowed: the save is made, the attack is spent, and the log says it was already Prone", () => {
  const s = field(fighter(STR16));
  ok(apply(s, { type: "condition", actor: s.foe, condition: "prone" }, DM));
  fails(s.entities[s.foe]);
  const r = ok(shove(s, "prone"));
  assert.equal(saveOf(r).success, false);
  assert.ok(r.events.some((e) => e.type === "note" && e.id === s.foe && /already Prone/.test(e.text)));
  assert.ok(!r.events.some((e) => e.type === "cond"));
  assert.equal(s.encounter.budget.action, 0);
});

test("a failed push that something blocks says so; one that cannot move the creature at all (off the ground) goes to the DM", () => {
  const s = field(fighter(STR16), { square: true });
  fails(s.entities[s.foe]);
  const r = ok(shove(s, "push"));
  assert.ok(r.events.some((e) => e.type === "note" && e.id === s.foe && /not pushed: something is in the way/.test(e.text)));
  assert.ok(!r.events.some((e) => e.type === "manual"));
  const f = field(fighter(STR16), { monster: "giant-eagle", more: (x, eagle) => { eagle.pos = { ...eagle.pos, z: 5 }; } });
  fails(f.entities[f.foe]);
  const before = f.entities[f.foe].pos;
  const r2 = ok(shove(f, "push"));
  assert.equal(saveOf(r2).success, false, "the save stays");
  assert.equal(f.encounter.budget.action, 0, "the attack is spent");
  assert.deepEqual(f.entities[f.foe].pos, before);
  const m = r2.events.find((e) => e.type === "manual");
  assert.ok(m && m.actor === "hero" && /not standing on anything/.test(m.text) && /5 ft away/.test(m.text), JSON.stringify(m));
  assert.ok(!r2.events.some((e) => e.type === "moved"));
});

test("Action Surge: two Shoves, the surge, and two more strikes, each an attack of its action", () => {
  const s = field(fighter(STR16));
  fails(s.entities[s.foe]);
  ok(shove(s, "prone"));
  ok(shove(s, "prone"));
  no(shove(s, "prone"), /already used an action/);
  ok(apply(s, { type: "feature", actor: "hero", feature: "action-surge" }, DM));
  ok(shove(s, "prone"));
  ok(apply(s, { type: "attack", actor: "hero", target: s.foe, attack: "unarmed-strike" }, DM));
  no(shove(s, "prone"), /already used an action/);
});

test("a Shove renews a Rage as a save forced on an enemy does", () => {
  const s = field({ name: "Ur", class: "barbarian", level: 5, subclass: "berserker", abilities: { str: 18, dex: 14, con: 16, int: 8, wis: 12, cha: 10 }, skills: ["athletics", "survival", "perception"], weapons: ["greataxe"] });
  ok(apply(s, { type: "feature", actor: "hero", feature: "rage" }, DM));
  const fx = s.effects.find((x) => x.source === "hero" && x.feature === "rage");
  assert.ok(fx?.renew, "a Rage that can be renewed");
  const part = fx.parts.find((p) => p.ends?.on === "turnEnd");
  part.born = "stale";
  fails(s.entities[s.foe]);
  ok(shove(s, "prone"));
  assert.notEqual(part.born, "stale", "carried to the end of its next turn again");
});

test("bestSave: Advantage beats a higher bonus, an automatic success beats Advantage, and an automatic failure is never chosen when the other is not", () => {
  const give = (s, id, op, on) => { (s.effects ??= []).push({ id: `fx-${on}-${op}`, name: "Test", source: "hero", parts: [{ target: id, modifier: { on, op, value: true } }] }); };
  const abil = (s) => saveOf(ok(shove(s, "push"))).abil;
  const base = () => { const s = field(fighter(STR16)); Object.assign(s.entities[s.foe], { saveBonus: { str: 0, dex: 6 } }); return s; };
  assert.equal(abil(base()), "dex", "the higher bonus alone");
  const a = base(); give(a, a.foe, "advantage", "save.str");
  assert.equal(abil(a), "str", "Advantage over a bonus of 6");
  const b = base(); give(b, b.foe, "advantage", "save.str"); give(b, b.foe, "autoSucceed", "save.dex");
  assert.equal(abil(b), "dex", "an automatic success over Advantage");
  const c = base(); give(c, c.foe, "autoFail", "save.dex");
  assert.equal(abil(c), "str", "never an automatic failure when the other has none");
  const d = base(); give(d, d.foe, "disadvantage", "save.dex");
  assert.equal(abil(d), "str", "a normal roll beats Disadvantage, whatever the bonus");
});

test("Damage stays the default: an Unarmed Strike with no option, or option damage, rolls to hit as before", () => {
  const s = field(fighter(STR16));
  const r = ok(apply(s, { type: "attack", actor: "hero", target: s.foe, attack: "unarmed-strike" }, DM));
  assert.ok(r.events.some((e) => e.type === "attack") && !r.events.some((e) => e.type === "strikeOption"));
  const t = field(fighter(STR16));
  const r2 = ok(apply(t, { type: "attack", actor: "hero", target: t.foe, attack: "unarmed-strike", option: "damage" }, DM));
  assert.ok(r2.events.some((e) => e.type === "attack"));
});

test("with Extra Attack a Shove then a Damage attack are one Attack action, and a third is refused", () => {
  const s = field(fighter(STR16));
  fails(s.entities[s.foe]);
  ok(shove(s, "prone"));
  assert.equal(s.encounter.budget.action, 0);
  assert.equal(s.encounter.budget.attacks?.[0]?.[0]?.left, 1, "one attack of the action is left");
  const r = ok(apply(s, { type: "attack", actor: "hero", target: s.foe, attack: "unarmed-strike" }, DM));
  assert.ok(r.events.some((e) => e.type === "attack"), "the second is a Damage attack");
  assert.equal(s.encounter.budget.attacks, undefined);
  no(shove(s, "push"), /./);
  // Movement may come between the attacks: a Shove, a step, a Shove.
  const t = field(fighter(STR16), { gap: 2 });
  t.entities[t.foe].pos = { q: 1, r: 0, z: 0 };
  fails(t.entities[t.foe]);
  ok(shove(t, "push"));
  ok(apply(t, { type: "move", actor: "hero", to: { q: 1, r: 0 } }, DM));
  ok(shove(t, "prone"));
});

test("Flurry of Blows: its strikes may be Shoves, and spend the flurry, not the action", () => {
  const s = field(monk(MONK));
  fails(s.entities[s.foe]);
  ok(apply(s, { type: "feature", actor: "hero", feature: "flurry-of-blows" }, DM));
  assert.equal(s.encounter.budget.bonusAttacks.left, 2);
  const r = ok(shove(s, "push"));
  assert.equal(saveOf(r).dc, 14, "Martial Arts: Dexterity gives the DC");
  assert.equal(s.encounter.budget.bonusAttacks.left, 1);
  assert.equal(s.encounter.budget.action, 1, "the action is untouched");
  assert.deepEqual(s.entities[s.foe].pos, { q: 2, r: 0, z: 0 });
  s.entities.hero.pos = { q: 1, r: 0, z: 0 };
  ok(shove(s, "prone"));
  assert.equal(s.encounter.budget.bonusAttacks, undefined);
  assert.ok(s.entities[s.foe].cond.prone);
});

test("the Monk's Bonus Action Unarmed Strike may be a Shove", () => {
  const s = field(monk({ ...MONK, str: 8 }));
  fails(s.entities[s.foe]);
  const r = ok(apply(s, { ...SHOVE, attack: "unarmed-strike-bonus", target: s.foe, shove: "prone" }, DM));
  assert.equal(saveOf(r).dc, 14, "8 + 3 + 3 from Dexterity, not 8 - 1 + 3 from Strength");
  assert.deepEqual([s.encounter.budget.bonus, s.encounter.budget.action], [0, 1]);
  assert.ok(s.entities[s.foe].cond.prone);
});

test("a record made before the DC existed works it out when used", () => {
  const s = field(fighter(STR16));
  delete s.entities.hero.attacks.find((x) => x.id === "unarmed-strike").dc;
  fails(s.entities[s.foe]);
  assert.equal(saveOf(ok(shove(s, "push"))).dc, 14);
  const m = field(monk(MONK));
  delete m.entities.hero.attacks.find((x) => x.id === "unarmed-strike").dc;
  fails(m.entities[m.foe]);
  assert.equal(saveOf(ok(shove(m, "push"))).dc, 14, "with the ability the attack uses");
});

test("a ridden mount that is pushed asks its rider for the DC 10 Dexterity save first", () => {
  const s = field(fighter(STR16), { monster: "warhorse", more: (x, horse) => {
    // The goblin goes in the first free cell within 5 ft of the horse.
    let rider = null;
    for (const at of [{ q: 3, r: 0 }, { q: 3, r: -1 }, { q: 2, r: 1 }, { q: 1, r: 1 }, { q: 2, r: -1 }, { q: 1, r: -1 }, { q: 4, r: -1 }, { q: 4, r: 0 }]) {
      const r = apply(x, { type: "spawn", monster: "goblin-warrior", at }, DM);
      if (r.ok && apply(structuredClone(x), { type: "mount", actor: r.events.find((e) => e.type === "spawned").id, mount: horse.id }, DM).ok) { rider = r.events.find((e) => e.type === "spawned").id; break; }
      if (r.ok) apply(x, { type: "remove", actor: r.events.find((e) => e.type === "spawned").id }, DM);
    }
    assert.ok(rider, "a place for the rider");
    Object.assign(x.entities[rider], { saveBonus: { dex: 40 } });
    ok(apply(x, { type: "mount", actor: rider, mount: horse.id }, DM));
    x.rider = rider;
  } });
  const horse = s.entities[s.foe];
  assert.equal(horse.rider, s.rider);
  fails(horse);
  const r = ok(shove(s, "push"));
  const ride = r.events.find((e) => e.type === "save" && e.id === s.rider);
  assert.ok(ride && ride.dc === 10 && ride.against === "Falling Off", "the rider's save");
  assert.ok(r.events.indexOf(ride) > r.events.indexOf(saveOf(r)), "after the horse's own save");
  assert.deepEqual(horse.pos, { q: 2, r: 0, z: 0 });
  assert.deepEqual(s.entities[s.rider].pos, horse.pos, "the pair moved together");
});

test("a target immune to Prone: the attack is spent and the log says so", () => {
  const s = field(fighter(STR16), { more: (x, foe) => { foe.conditionImmune = ["prone"]; } });
  fails(s.entities[s.foe]);
  const r = ok(shove(s, "prone"));
  assert.equal(saveOf(r).success, false);
  assert.ok(r.events.some((e) => e.type === "note" && e.id === s.foe && /Immune to Prone/.test(e.text)));
  assert.equal(s.entities[s.foe].cond.prone, undefined);
  assert.equal(s.encounter.budget.action, 0, "spent");
});

test("outside a fight a Shove starts one the way an attack does, and makes no save", () => {
  const s = field(fighter(STR16), { fight: false });
  assert.equal(s.encounter, null);
  const r = ok(shove(s, "push"));
  assert.ok(s.encounter);
  assert.ok(!r.events.some((e) => e.type === "save"));
});

test("what a player is sent: the option, and the save with its DC when their creature made the Shove", () => {
  const s = field(fighter(STR16));
  ok(apply(s, { type: "claim", entity: "hero", user: "u1", userName: "Ann" }, U1));
  fails(s.entities[s.foe]);
  const r = ok(shove(s, "push"));
  const seen = viewEvents(r.events, s, U1);
  const so = seen.find((e) => e.type === "strikeOption");
  assert.deepEqual(so, { type: "strikeOption", actor: "hero", target: s.foe, option: "shove", shove: "push" });
  const sv = seen.find((e) => e.type === "save");
  assert.ok(sv, "the foe's save is told");
  assert.equal(sv.by, undefined, "the foe's side never learns who made it from the record");
  assert.equal(sv.dc, 14, "the party's own number");
  assert.ok(seen.some((e) => e.type === "moved"));
});

test("a hidden attacker: the player is sent the save and the push, never who made them", () => {
  const s = field(fighter(STR16));
  ok(apply(s, { type: "claim", entity: "hero", user: "u1", userName: "Ann" }, U1));
  const foe = s.entities[s.foe];
  foe.attacks = [{ id: "unarmed-strike", name: "Unarmed Strike", type: "melee", bonus: 4, damage: "+1", dtype: "bludgeoning", reach: 5, abil: "str", dc: 12 }];
  for (let i = 0; i < 8 && current(s) !== s.foe; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  foe.hidden = true;
  fails(s.entities.hero);
  const r = ok(apply(s, { ...SHOVE, actor: s.foe, target: "hero", shove: "push" }, DM));
  assert.ok(r.events.some((e) => e.type === "strikeOption" && e.actor === s.foe), "the DM has it");
  const seen = viewEvents(r.events, s, U1);
  assert.ok(!seen.some((e) => e.type === "strikeOption"), "the hidden actor's option is dropped");
  const sv = seen.find((e) => e.type === "save");
  assert.ok(sv && sv.id === "hero", "the hero's own save is told");
  assert.equal(sv.by, undefined, "without who made it");
  assert.ok(!JSON.stringify(seen).includes(s.foe), seen.map((e) => e.type).join());
  assert.ok(seen.some((e) => e.type === "moved" && e.id === "hero"));
});

test("`dc` is for an Unarmed Strike record only, and the lint says the range", () => {
  const rec = derive(fighter(STR16, ["longsword"])).record;
  const sword = rec.attacks.find((x) => x.id === "longsword"), punch = rec.attacks.find((x) => x.id === "unarmed-strike");
  assert.ok(lintRecord({ ...rec, attacks: [{ ...sword, dc: 12 }, punch] }).some((x) => /only an Unarmed Strike has a save DC/.test(x)));
  assert.ok(lintRecord({ ...rec, attacks: [sword, { ...punch, dc: 41 }] }).some((x) => /whole number from 1 to 40/.test(x)));
  assert.ok(lintRecord({ ...rec, attacks: [sword, { ...punch, dc: 0 }] }).some((x) => /1 to 40/.test(x)));
  assert.deepEqual(lintRecord(rec), []);
});

test("undo-safe: a refused Shove changes nothing, and the same seed gives the same Shove", () => {
  const a = field(fighter(STR16)), b = field(fighter(STR16));
  const ra = ok(shove(a, "push")), rb = ok(shove(b, "push"));
  assert.equal(JSON.stringify(ra.events), JSON.stringify(rb.events));
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
