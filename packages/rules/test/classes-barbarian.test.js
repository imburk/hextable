// Barbarian features at levels 7 to 15 (SRD 5.2.1) and the engine parts they use: Advantage on
// Initiative, movement with Rage, Brutal Strike's choice on an attack (Advantage given up, extra
// dice, an effect on the target), Relentless Rage at 0 Hit Points, Persistent Rage on rolling
// Initiative and without renewing, Retaliation (a feature reaction to damage) and Intimidating
// Presence (a feature's own save DC for the save that ends it).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { modifiers, speedOf } from "../src/modifiers.js";
import { lintRecord } from "../src/content/schema.js";
import { reactionsOf } from "../src/reactions.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "refused"); if (re) assert.match(r.error, re); };
const A = { str: 18, dex: 14, con: 16, int: 8, wis: 12, cha: 10 };
const barb = (level, more = {}) => ({ name: "Ur", class: "barbarian", level, ...(level >= 3 ? { subclass: "berserker" } : {}), abilities: A, skills: level >= 3 ? ["athletics", "survival", "perception"] : ["athletics", "survival"], weapons: ["greataxe", "shortbow"], ...more });
const ids = (level) => derive(barb(level)).record.feats.map((f) => f.id);

// The barbarian at the centre, a tough goblin beside it, the rogue (an ally) further off.
function field(level, { foeAc = null } = {}) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (id !== "rogue") delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(barb(level)).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  ok(apply(s, { type: "place", actor: "rogue", to: { q: -4, r: 0 } }, DM));
  s.foe = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 } }, DM)).events[0].id;
  const f = s.entities[s.foe];
  f.hp = f.maxHp = 500;
  if (foeAc !== null) f.ac = foeAc;
  return s;
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 20 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const use = (s, feature, more = {}) => apply(s, { type: "feature", actor: "hero", feature, ...more }, DM);
const hit = (s, more = {}) => apply(s, { type: "attack", actor: "hero", target: s.foe, attack: "greataxe", ...more }, DM);
const raging = (s) => (s.effects ?? []).find((fx) => fx.source === "hero" && fx.feature === "rage");
// A state whose next roll of the hero's attack hits (a seed found by trying, so the test needs no luck).
function seeded(level, setup, { needHit = true } = {}) {
  for (let seed = 1; seed < 200; seed++) {
    const s = field(level, { foeAc: 5 });
    s.rng = seed * 7919;
    setup(s);
    const probe = structuredClone(s), r = hit(probe, { brutal: "hamstring-blow" });
    if (!r.ok) return s;
    const atk = r.events.find((x) => x.type === "attack" && x.actor === "hero");
    if (!needHit || atk.hit) return s;
  }
  throw new Error("no seed found");
}

test("the barbarian's features at levels 7 to 15 appear at their levels, and the records are valid", () => {
  for (const [id, level] of [["feral-instinct", 7], ["instinctive-pounce", 7], ["brutal-strike", 9], ["retaliation", 10], ["relentless-rage", 11], ["improved-brutal-strike", 13], ["intimidating-presence", 14], ["persistent-rage", 15]]) {
    assert.ok(!ids(level - 1).includes(id), `${id} before ${level}`);
    assert.ok(ids(level).includes(id), `${id} at ${level}`);
  }
  for (let l = 1; l <= 20; l++) { assert.deepEqual(validate(barb(l)), [], `level ${l}`); assert.deepEqual(lintRecord(derive(barb(l)).record), [], `record ${l}`); }
  const feat = (level, id) => derive(barb(level)).record.feats.find((f) => f.id === id);
  assert.equal(feat(11, "relentless-rage").relentless.hp, 22, "twice the Barbarian level");
  assert.equal(feat(15, "relentless-rage").relentless.hp, 30);
  assert.equal(feat(14, "intimidating-presence").action.effects[0].dc, 8 + 5 + 4, "8 + Proficiency + Strength");
  // Persistent Rage: Rage's parts no longer end with the turn, and only Unconscious ends it early.
  const rage15 = feat(15, "rage").action, rage14 = feat(14, "rage").action;
  assert.ok(rage14.effects.every((st) => st.ends?.on === "turnEnd") && rage14.endsWhenIncapacitated);
  assert.ok(rage15.effects.every((st) => st.ends === undefined) && !rage15.endsWhenIncapacitated && rage15.endsOn === "unconscious");
});

test("Feral Instinct: Advantage on Initiative from level 7", () => {
  const s7 = field(7), s6 = field(6);
  assert.deepEqual(modifiers(s7, s7.entities.hero, "initiative").advantage, ["Feral Instinct"]);
  assert.deepEqual(modifiers(s6, s6.entities.hero, "initiative").advantage, []);
  const r = fight(s7), mine = r.events.find((x) => x.type === "encounterStart").order.find((o) => o.id === "hero");
  assert.equal(mine.dice.filter((d) => d.sides === 20).length, 2, "two d20s rolled for Initiative");
});

test("Instinctive Pounce: entering Rage in a fight gives half the Speed in movement; extending it does not", () => {
  const s = field(7), e = s.entities.hero;
  fight(s); turnOf(s, "hero");
  assert.equal(speedOf(s, e), 40);
  const before = s.encounter.budget.move;
  const r = ok(use(s, "rage"));
  assert.equal(s.encounter.budget.move, before + 20);
  assert.ok(r.events.some((x) => x.type === "std" && x.action === "Instinctive Pounce (20 ft)"));
  ok(apply(s, { type: "endTurn", actor: "hero" }, DM)); turnOf(s, "hero");
  const m = s.encounter.budget.move;
  ok(use(s, "rage"));                                                   // extended with its Bonus Action
  assert.equal(s.encounter.budget.move, m, "no more movement for extending it");
  // Level 6 has no pounce.
  const s6 = field(6);
  fight(s6); turnOf(s6, "hero");
  const b6 = s6.encounter.budget.move;
  ok(use(s6, "rage"));
  assert.equal(s6.encounter.budget.move, b6);
});

test("Brutal Strike is refused without Reckless Attack, on a Dexterity attack, with Disadvantage, twice a turn, or below level 9; a refusal changes nothing", () => {
  const s = field(9);
  fight(s); turnOf(s, "hero");
  const snap = JSON.stringify(s);
  no(hit(s, { brutal: "hamstring-blow" }), /Reckless Attack this turn/);
  assert.equal(JSON.stringify(s), snap, "nothing changed");
  ok(use(s, "reckless-attack"));
  no(apply(s, { type: "attack", actor: "hero", target: s.foe, attack: "shortbow", brutal: "hamstring-blow" }, DM), /using Strength/);
  no(hit(s, { brutal: "staggering-blow" }), /Choose a Brutal Strike effect: Forceful Blow, Hamstring Blow/);
  no(hit(s, { brutal: 7 }), /Choose a Brutal Strike effect/);
  s.entities.hero.cond.poisoned = {};                                   // Disadvantage on its attack rolls
  const snap2 = JSON.stringify(s);
  no(hit(s, { brutal: "hamstring-blow" }), /Disadvantage \(attacker poisoned\)/);
  assert.equal(JSON.stringify(s), snap2);
  delete s.entities.hero.cond.poisoned;
  ok(hit(s, { brutal: "hamstring-blow" }));
  no(hit(s, { brutal: "hamstring-blow" }), /already used Brutal Strike this turn/);
  ok(hit(s), "a plain attack is still fine");
  // Level 8 has no Brutal Strike.
  const s8 = field(8);
  fight(s8); turnOf(s8, "hero"); ok(use(s8, "reckless-attack"));
  no(apply(s8, { type: "attack", actor: "hero", target: s8.foe, attack: "greataxe", brutal: "hamstring-blow" }, DM), /no Brutal Strike/);
});

test("Brutal Strike: Advantage given up, 1d10 more of the weapon's type on a hit, and Hamstring Blow (only the most recent)", () => {
  const s = seeded(9, (s) => { fight(s); turnOf(s, "hero"); ok(use(s, "reckless-attack")); });
  const foe = s.entities[s.foe], speed = speedOf(s, foe);
  const r = ok(hit(s, { brutal: "hamstring-blow" }));
  const atk = r.events.find((x) => x.type === "attack");
  assert.equal(atk.mode, "normal", "Reckless Attack's Advantage is given up");
  assert.equal(atk.rolls.length, 1);
  const dmg = r.events.find((x) => x.type === "damage" && x.target === s.foe);
  assert.equal(dmg.dtype, "slashing");
  assert.equal(dmg.dice.filter((d) => d.sides === 10).length, atk.crit ? 2 : 1, "one more d10");
  assert.equal(dmg.dice.filter((d) => d.sides === 12).length, atk.crit ? 2 : 1);
  assert.ok(r.events.some((x) => x.type === "note" && /Brutal Strike: Hamstring Blow/.test(x.text)));
  assert.equal(speedOf(s, foe), speed - 15, "Speed 15 feet less");
  ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
  assert.equal(speedOf(s, foe), speed - 15, "on the goblin's turn too");
  turnOf(s, "hero");
  assert.equal(speedOf(s, foe), speed, "until the start of the barbarian's next turn");
  // Only the most recent Hamstring Blow: a second barbarian's replaces the first.
  const t = seeded(9, (s) => {
    s.entities.hero2 = makeEntity(derive(barb(9, { name: "Ba" })).record, { id: "hero2", kind: "pc", side: "party", pos: { q: 2, r: 0, z: 0 } });
    fight(s); turnOf(s, "hero"); ok(use(s, "reckless-attack"));
  });
  const tf = t.entities[t.foe], tspeed = speedOf(t, tf);
  ok(hit(t, { brutal: "hamstring-blow" }));
  ok(apply(t, { type: "endTurn", actor: "hero" }, DM));
  turnOf(t, "hero2");
  ok(apply(t, { type: "feature", actor: "hero2", feature: "reckless-attack" }, DM));
  let done = null;
  for (let i = 0; i < 60 && !done; i++) {
    const u = structuredClone(t);
    u.rng = 5000 + i * 37;
    const r2 = ok(apply(u, { type: "attack", actor: "hero2", target: u.foe, attack: "greataxe", brutal: "hamstring-blow" }, DM));
    if (r2.events.find((x) => x.type === "attack").hit) done = u;
  }
  assert.ok(done, "the second barbarian hit");
  const ham = done.effects.filter((fx) => fx.option === "hamstring-blow");
  assert.equal(ham.length, 1, "one Hamstring Blow at a time");
  assert.equal(ham[0].source, "hero2", "the most recent");
  assert.equal(speedOf(done, done.entities[done.foe]), tspeed - 15, "not 30 feet less");
});

test("Brutal Strike: Forceful Blow pushes the target 15 feet straight away; the barbarian's follow-up move is the DM's", () => {
  const s = seeded(9, (s) => { fight(s); turnOf(s, "hero"); ok(use(s, "reckless-attack")); });
  const r = ok(hit(s, { brutal: "forceful-blow" }));
  const moved = r.events.find((x) => x.type === "moved" && x.id === s.foe);
  assert.ok(moved?.forced, "pushed");
  assert.equal(moved.path.length, 3, "15 feet");
  assert.deepEqual(s.entities[s.foe].pos, { q: 4, r: 0, z: 0 });
  assert.ok(r.events.some((x) => x.type === "manual" && /Forceful Blow: the barbarian may now move/.test(x.text)));
});

test("Improved Brutal Strike: Staggering Blow (Disadvantage on the next save, no Opportunity Attacks) and Sundering Blow (+5 to another's next attack)", () => {
  const s = seeded(13, (s) => { fight(s); turnOf(s, "hero"); ok(use(s, "reckless-attack")); });
  const foe = s.entities[s.foe];
  ok(hit(s, { brutal: "staggering-blow" }));
  // No Opportunity Attack when the barbarian walks away from it.
  const r = ok(apply(s, { type: "move", actor: "hero", to: { q: -3, r: 0 } }, DM));
  assert.ok(!r.events.some((x) => x.type === "reaction" && x.id === s.foe), "no Opportunity Attack");
  assert.equal(foe.reactionUsed, false);
  // Its next saving throw has Disadvantage, then no more.
  const sv1 = modifiers(s, foe, "save", { target: foe }, "");
  assert.deepEqual(sv1.disadvantage, ["Staggering Blow"]);
  ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
  assert.equal(modifiers(s, foe, "opportunity").autoFail, true, "still on the goblin's turn");
  turnOf(s, "hero");
  assert.deepEqual(modifiers(s, foe, "opportunity").autoFail, false, "Opportunity Attacks again from the start of the barbarian's next turn");
  assert.deepEqual(modifiers(s, foe, "save", { target: foe }, "").disadvantage, ["Staggering Blow"], "the save part waits for a save");

  // Sundering Blow: +5 to the next attack roll another creature makes against it, not the barbarian's.
  const t = seeded(13, (s) => { fight(s); turnOf(s, "hero"); ok(use(s, "reckless-attack")); });
  const tf = t.entities[t.foe];
  ok(hit(t, { brutal: "sundering-blow" }));
  const sit = (who) => ({ attacker: t.entities[who], target: tf });
  assert.equal(modifiers(t, tf, "attack.received", sit("hero"), "target").add, 0, "not for the barbarian's own rolls");
  assert.equal(modifiers(t, tf, "attack.received", sit("rogue"), "target").add, 5);
  ok(apply(t, { type: "place", actor: "rogue", to: { q: 2, r: 0 } }, DM));
  ok(apply(t, { type: "endTurn", actor: "hero" }, DM));
  turnOf(t, "rogue");
  const a = ok(apply(t, { type: "attack", actor: "rogue", target: t.foe, attack: t.entities.rogue.attacks[0].id }, DM)).events.find((x) => x.type === "attack");
  assert.equal(a.bonus, t.entities.rogue.attacks[0].bonus + 5, "+5 on the roll");
  assert.equal(modifiers(t, tf, "attack.received", sit("rogue"), "target").add, 0, "used up");
  // Two Sundering Blows on one target: only one bonus a roll, and the other waits.
  const u = seeded(13, (s) => { fight(s); turnOf(s, "hero"); ok(use(s, "reckless-attack")); });
  ok(hit(u, { brutal: "sundering-blow" }));
  const fx = u.effects.find((x) => x.option === "sundering-blow");
  u.effects.push({ ...structuredClone(fx), id: "fxCopy", source: "rogue", parts: fx.parts.map((p) => ({ ...p, except: "rogue" })) });
  const uf = u.entities[u.foe];
  assert.equal(modifiers(u, uf, "attack.received", { attacker: u.entities.rogue, target: uf }, "target").add, 5, "one Sundering bonus");
  assert.equal(modifiers(u, uf, "attack.received", { attacker: u.entities.rogue, target: uf }, "target").used.length, 1, "and only that one is used up");
});

test("Relentless Rage: at 0 Hit Points while raging, a Constitution save (DC 10, then 15) sets Hit Points to twice the level; a rest sets the DC back", () => {
  const outcomes = new Set();
  for (let seed = 1; seed < 80 && outcomes.size < 2; seed++) {
    const s = field(11), e = s.entities.hero;
    s.rng = seed * 104729;
    fight(s); turnOf(s, "hero"); ok(use(s, "rage"));
    const r = ok(apply(s, { type: "harm", actor: "hero", amount: e.hp + 5, dtype: "fire" }, DM));
    const sv = r.events.find((x) => x.type === "save" && x.against === "Relentless Rage");
    assert.ok(sv, "a save is made");
    assert.equal(sv.dc, 10); assert.equal(sv.abil, "con");
    assert.equal(e.uses["relentless-rage"], 1);
    if (sv.success) {
      outcomes.add("up");
      assert.equal(e.hp, 22, "twice the Barbarian level");
      assert.ok(!e.cond.unconscious, "it never went down");
      assert.ok(raging(s), "and still rages");
      // The next time the DC is 15.
      const r2 = ok(apply(s, { type: "harm", actor: "hero", amount: e.hp + 5, dtype: "fire" }, DM));
      assert.equal(r2.events.find((x) => x.type === "save" && x.against === "Relentless Rage").dc, 15);
    } else {
      outcomes.add("down");
      assert.equal(e.hp, 0);
      assert.ok(e.cond.unconscious);
    }
  }
  assert.equal(outcomes.size, 2, "both outcomes seen");
  // A Short Rest sets the DC back to 10.
  const s = field(11), e = s.entities.hero;
  e.uses["relentless-rage"] = 2;
  ok(apply(s, { type: "shortRest" }, DM));
  assert.equal(e.uses["relentless-rage"], undefined);
  e.uses["relentless-rage"] = 1;
  ok(apply(s, { type: "rest" }, DM));
  assert.equal(e.uses["relentless-rage"], undefined);
});

test("Relentless Rage: not without Rage, not below level 11, and not against massive damage", () => {
  const s = field(11), e = s.entities.hero;
  fight(s); turnOf(s, "hero");
  const r = ok(apply(s, { type: "harm", actor: "hero", amount: e.hp + 5, dtype: "fire" }, DM));
  assert.ok(!r.events.some((x) => x.type === "save"), "not raging: no save");
  assert.ok(e.cond.unconscious);
  const t = field(10), te = t.entities.hero;
  fight(t); turnOf(t, "hero"); ok(apply(t, { type: "feature", actor: "hero", feature: "rage" }, DM));
  assert.ok(!ok(apply(t, { type: "harm", actor: "hero", amount: te.hp + 5, dtype: "fire" }, DM)).events.some((x) => x.type === "save"), "level 10");
  const u = field(11), ue = u.entities.hero;
  fight(u); turnOf(u, "hero"); ok(apply(u, { type: "feature", actor: "hero", feature: "rage" }, DM));
  const big = ok(apply(u, { type: "harm", actor: "hero", amount: ue.hp + ue.maxHp, dtype: "force" }, DM));
  assert.ok(!big.events.some((x) => x.type === "save"), "dying outright: no save");
  assert.ok(ue.dead);
});

test("Persistent Rage: Rage lasts without being extended, and ends early on Unconscious, not on Incapacitated", () => {
  const s = field(15), e = s.entities.hero;
  fight(s); turnOf(s, "hero");
  ok(use(s, "rage"));
  no(use(s, "rage"), /lasts without being extended/);
  ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
  turnOf(s, "hero");
  ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
  turnOf(s, "hero");
  const fx = raging(s);
  assert.ok(fx, "still raging two turns later, never extended");
  assert.equal(modifiers(s, e, "damage.taken", { target: e }).resist.length, 3, "Resistance holds");
  ok(apply(s, { type: "condition", actor: "hero", condition: "stunned" }, DM));
  assert.ok(raging(s), "Incapacitated (Stunned) does not end it");
  delete e.cond.stunned;
  ok(apply(s, { type: "condition", actor: "hero", condition: "unconscious" }, DM));
  assert.ok(!raging(s), "Unconscious ends it");
  // At level 14 the Rage still ends unextended and on Stunned.
  const t = field(14);
  fight(t); turnOf(t, "hero"); ok(apply(t, { type: "feature", actor: "hero", feature: "rage" }, DM));
  ok(apply(t, { type: "condition", actor: "hero", condition: "stunned" }, DM));
  assert.ok(!(t.effects ?? []).some((x) => x.feature === "rage"));
});

test("Persistent Rage: on rolling Initiative with Rage spent, all uses come back, once per Long Rest, by standing instruction", () => {
  const s = field(15), e = s.entities.hero;
  no(use(s, "persistent-rage"), /used when Ur rolls Initiative/);
  e.uses.rage = 1;
  const r = fight(s);
  assert.equal(e.uses.rage, 5, "all uses back");
  assert.equal(e.uses["persistent-rage"], 0);
  assert.ok(r.events.some((x) => x.type === "std" && /^Persistent Rage: Rage \+4/.test(x.action)));
  ok(apply(s, { type: "endEncounter" }, DM));
  e.uses.rage = 2;
  fight(s);
  assert.equal(e.uses.rage, 2, "not again before a Long Rest");
  ok(apply(s, { type: "endEncounter" }, DM));
  ok(apply(s, { type: "rest" }, DM));
  // Nothing spent: the use is kept.
  fight(s);
  assert.equal(e.uses["persistent-rage"], 1, "kept when nothing was spent");
  ok(apply(s, { type: "endEncounter" }, DM));
  // A standing instruction of never keeps it for later.
  assert.ok(reactionsOf(e).some((x) => x.id === "persistent-rage" && x.kind === "free"));
  ok(apply(s, { type: "reactions", actor: "hero", set: { "persistent-rage": "never" } }, DM));
  e.uses.rage = 0;
  fight(s);
  assert.equal(e.uses.rage, 0);
  assert.equal(e.uses["persistent-rage"], 1);
});

test("Retaliation: damaged by a hostile creature within 5 feet, the berserker makes one melee attack with its Reaction", () => {
  const s = field(10);
  fight(s); turnOf(s, s.foe);
  let r = null;
  for (let i = 0; i < 30; i++) {
    const t = structuredClone(s);
    t.rng = 1000 + i * 31;
    const x = apply(t, { type: "attack", actor: t.foe, target: "hero", attack: "scimitar" }, DM);
    if (x.ok && x.events.some((y) => y.type === "damage" && y.target === "hero" && y.amount > 0)) { Object.assign(s, t); r = x; break; }
  }
  assert.ok(r, "the goblin hit");
  const re = r.events.find((x) => x.type === "reaction" && x.id === "hero");
  assert.ok(re); assert.equal(re.trigger, "damaged"); assert.equal(re.against, s.foe);
  assert.ok(r.events.some((x) => x.type === "attack" && x.actor === "hero" && x.target === s.foe && x.name === "Greataxe"), "a melee attack against it");
  assert.equal(s.entities.hero.reactionUsed, true);
  // Not at level 9, not from beyond 5 feet, and not with an instruction of never.
  const reacts = (level, at, set = null) => {
    const t = field(level);
    ok(apply(t, { type: "place", actor: t.foe, to: at }, DM));
    if (set) ok(apply(t, { type: "reactions", actor: "hero", set }, DM));
    fight(t); turnOf(t, t.foe);
    for (let i = 0; i < 30; i++) {
      const u = structuredClone(t);
      u.rng = 1000 + i * 31;
      const atk = Math.abs(at.q) > 1 ? "shortbow" : "scimitar";
      const x = apply(u, { type: "attack", actor: u.foe, target: "hero", attack: atk }, DM);
      if (x.ok && x.events.some((y) => y.type === "damage" && y.target === "hero" && y.amount > 0)) return x.events.some((y) => y.type === "reaction" && y.id === "hero");
    }
    throw new Error("never hit");
  };
  assert.equal(reacts(10, { q: 1, r: 0 }), true);
  assert.equal(reacts(9, { q: 1, r: 0 }), false, "level 9");
  assert.equal(reacts(10, { q: 3, r: 0 }), false, "15 feet away");
  assert.equal(reacts(10, { q: 1, r: 0 }, { retaliation: "never" }), false, "instruction never");
});

test("Intimidating Presence: a Bonus Action, Wisdom save against 8 + Strength + Proficiency or Frightened, repeating the save; then paid with a Rage", () => {
  let seen = false;
  for (let seed = 1; seed < 60 && !seen; seed++) {
    const s = field(14), e = s.entities.hero;
    s.rng = seed * 7919;
    fight(s); turnOf(s, "hero");
    const r = ok(use(s, "intimidating-presence", { targets: [s.foe] }));
    assert.equal(s.encounter.budget.bonus, 0, "a Bonus Action");
    assert.equal(s.encounter.budget.action, 1);
    assert.equal(e.uses["intimidating-presence"], 0);
    const sv = r.events.find((x) => x.type === "save" && x.id === s.foe);
    assert.equal(sv.dc, 17); assert.equal(sv.abil, "wis");
    if (sv.success) continue;
    seen = true;
    assert.ok(s.entities[s.foe].cond.frightened);
    const fx = s.effects.find((x) => x.name === "Intimidating Presence");
    const part = fx.parts.find((p) => p.cond === "frightened");
    assert.deepEqual(part.ends, { on: "save", save: "wis", at: "turnEnd" });
    assert.equal(part.dc, 17, "the repeated save is against the same DC");
    // Used again before a Long Rest: a use of Rage pays for it.
    ok(apply(s, { type: "endTurn", actor: "hero" }, DM)); turnOf(s, "hero");
    const rage = e.uses.rage;
    ok(use(s, "intimidating-presence", { targets: [s.foe] }));
    assert.equal(e.uses.rage, rage - 1);
    // With neither left, refused, and nothing changes.
    ok(apply(s, { type: "endTurn", actor: "hero" }, DM)); turnOf(s, "hero");
    e.uses.rage = 0;
    const snap = JSON.stringify(s);
    no(use(s, "intimidating-presence", { targets: [s.foe] }), /no uses of Intimidating Presence left/);
    assert.equal(JSON.stringify(s), snap);
    no(use(s, "intimidating-presence", { targets: ["hero"] }));
  }
  assert.ok(seen, "a failed save was seen");
});
