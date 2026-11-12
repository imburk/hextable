// Class features that work from their data: uses, actions, Rage, rests (derive.js, engine `feature`, `shortRest`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { modifiers } from "../src/modifiers.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); };
const A = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 10 };
const SHEETS = {
  fighter: (level, more = {}) => ({ name: "Brenna", class: "fighter", level, ...(level >= 3 ? { subclass: "champion" } : {}), abilities: A, skills: ["athletics", "perception"], choices: { "fighting-style": "defense", "additional-fighting-style": "archery" }, armour: "chain-mail", shield: true, weapons: ["longsword"], ...more }),
  barbarian: (level, more = {}) => ({ name: "Ug", class: "barbarian", level, ...(level >= 3 ? { subclass: "berserker" } : {}), abilities: A, skills: ["athletics", "survival", ...(level >= 3 ? ["perception"] : [])], weapons: ["greataxe", "dagger"], ...more }),
  rogue: (level) => ({ name: "Pip", class: "rogue", level, ...(level >= 3 ? { subclass: "thief" } : {}), abilities: { ...A, dex: 17 }, skills: ["acrobatics", "deception", "perception", "stealth"], armour: "leather-armor", weapons: ["shortsword"] }),
  cleric: (level) => ({ name: "Odessa", class: "cleric", level, ...(level >= 3 ? { subclass: "life" } : {}), abilities: { ...A, wis: 16 }, skills: ["medicine", "religion"], choices: { "divine-order": "protector" }, armour: "chain-mail", shield: true, weapons: ["mace"], spells: ["sacred-flame", "cure-wounds"] }),
  wizard: (level) => ({ name: "Tavin", class: "wizard", level, ...(level >= 3 ? { subclass: "evoker" } : {}), abilities: { ...A, int: 17 }, skills: ["arcana", "history"], weapons: ["dagger"], spells: ["fire-bolt", "magic-missile"] }),
  warlock: (level) => ({ name: "Vex", class: "warlock", level, ...(level >= 3 ? { subclass: "fiend" } : {}), abilities: { ...A, cha: 16 }, skills: ["arcana", "deception"], spells: ["eldritch-blast", "hex"] }),
  monk: (level) => ({ name: "Lo", class: "monk", level, ...(level >= 3 ? { subclass: "open-hand" } : {}), abilities: { ...A, dex: 16, wis: 14 }, skills: ["acrobatics", "insight"], weapons: ["quarterstaff"] }),
  paladin: (level) => ({ name: "Sir", class: "paladin", level, ...(level >= 3 ? { subclass: "devotion" } : {}), abilities: A, skills: ["athletics", "religion"], choices: { "fighting-style": "defense" }, armour: "chain-mail", shield: true, weapons: ["longsword"] }),
};
// A field with one built hero (in the fighter's place) and, if asked, a goblin beside it.
function field(cls, level, more = {}, foe = true) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (id !== "fighter" && id !== "rogue") delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  const { record } = derive(SHEETS[cls](level, more));
  s.entities.hero = makeEntity(record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  delete s.entities.fighter;
  ok(apply(s, { type: "place", actor: "rogue", to: { q: -4, r: 0 } }, DM));
  if (foe) {
    const id = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 } }, DM)).events[0].id;
    s.entities[id].hp = s.entities[id].maxHp = 500;
    s.foe = id;
  }
  return s;
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 20 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const use = (s, feature, more = {}) => apply(s, { type: "feature", actor: "hero", feature, ...more }, DM);
const foeOf = (s) => s.foe;

test("Second Wind from its data: a Bonus Action, 1d10 + level, uses, Short and Long Rests", () => {
  const s = field("fighter", 4), e = s.entities.hero;
  assert.equal(e.uses["second-wind"], 3);
  e.hp = 5;
  fight(s); turnOf(s, "hero");
  const r = ok(use(s, "second-wind"));
  const h = r.events.find((x) => x.type === "heal");
  assert.ok(h.amount >= 5 && h.amount <= 14, `1d10+4, got ${h.amount}`);
  assert.equal(e.uses["second-wind"], 2);
  assert.equal(s.encounter.budget.bonus, 0);
  no(use(s, "second-wind"), /Bonus Action/);
  s.encounter = null;                                                  // the fight is over
  e.uses["second-wind"] = 0;
  ok(apply(s, { type: "shortRest" }, DM));
  assert.equal(e.uses["second-wind"], 1, "one use back on a Short Rest");
  ok(apply(s, { type: "rest" }, DM));
  assert.equal(e.uses["second-wind"], 3, "all back on a Long Rest");
  e.uses["second-wind"] = 0; e.hp = 1;
  no(use(s, "second-wind"), /no uses of Second Wind/);
});

test("Action Surge gives one more action once a turn, not for a spell, and comes back on a Short Rest", () => {
  const s = field("fighter", 5), e = s.entities.hero;
  fight(s); turnOf(s, "hero");
  ok(apply(s, { type: "attack", actor: "hero", target: foeOf(s), attack: "longsword" }, DM));
  ok(apply(s, { type: "attack", actor: "hero", target: foeOf(s), attack: "longsword" }, DM));      // Extra Attack
  no(apply(s, { type: "attack", actor: "hero", target: foeOf(s), attack: "longsword" }, DM), /already used an action/);
  ok(use(s, "action-surge"));
  assert.equal(e.uses["action-surge"], 0);
  no(use(s, "action-surge"), /no uses/);
  ok(apply(s, { type: "attack", actor: "hero", target: foeOf(s), attack: "longsword" }, DM));
  ok(apply(s, { type: "attack", actor: "hero", target: foeOf(s), attack: "longsword" }, DM));      // the Attack action again, with Extra Attack
  s.encounter = null;
  ok(apply(s, { type: "shortRest" }, DM));
  assert.equal(e.uses["action-surge"], 1);
  no(use(s, "action-surge"), /on Brenna's turn in a fight/);
});

test("Improved Critical: a 19 on the d20 is a Critical Hit, and hits", () => {
  const s = field("fighter", 3), t = () => s.entities[foeOf(s)];
  fight(s); turnOf(s, "hero");
  t().ac = 40;
  let seen = 0;
  for (let i = 0; i < 400 && seen < 2; i++) {
    s.encounter.budget.action = 1; delete s.encounter.budget.attacks;
    const ev = ok(apply(s, { type: "attack", actor: "hero", target: foeOf(s), attack: "longsword" }, DM)).events.find((x) => x.type === "attack");
    if (ev.nat === 19) { assert.equal(ev.hit, true); assert.equal(ev.crit, true); seen++; }
    if (ev.nat < 19) assert.equal(ev.hit, false);
  }
  assert.equal(seen, 2);
});

test("Rage: Resistance, Rage Damage on Strength attacks, Advantage on Strength saves, and how it ends", () => {
  const s = field("barbarian", 1), e = s.entities.hero, foe = foeOf(s);
  fight(s); turnOf(s, "hero");
  ok(use(s, "rage"));
  assert.equal(e.uses.rage, 1);
  assert.ok(modifiers(s, e, "save.str", { target: e }, "").advantage.includes("Rage"));
  assert.ok(modifiers(s, e, "check", { target: e, ability: "str" }, "").advantage.includes("Rage"));
  assert.deepEqual(modifiers(s, e, "damage.taken", { target: e }).resist, ["bludgeoning", "piercing", "slashing"]);
  // +2 to a Strength attack's damage; not to a Dexterity one.
  assert.deepEqual(modifiers(s, e, "damage.dealt", { attacker: e, target: s.entities[foe], hit: true, weapon: true, str: true }).dealt.map((x) => x.value), [2]);
  assert.deepEqual(modifiers(s, e, "damage.dealt", { attacker: e, target: s.entities[foe], hit: true, weapon: true, str: false }).dealt, []);
  // It lasts to the end of its next turn; attacking an enemy carries it on.
  ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
  turnOf(s, "hero");
  assert.ok(s.effects.some((fx) => fx.name === "Rage"), "still raging on its next turn");
  ok(apply(s, { type: "attack", actor: "hero", target: foe, attack: "greataxe" }, DM));
  ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
  turnOf(s, "hero");
  assert.ok(s.effects.some((fx) => fx.name === "Rage"), "extended by the attack");
  // The Bonus Action extends it too, without a use.
  ok(use(s, "rage"));
  assert.equal(e.uses.rage, 1);
  ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
  turnOf(s, "hero");
  assert.ok(s.effects.some((fx) => fx.name === "Rage"));
  ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
  assert.ok(!s.effects.some((fx) => fx.name === "Rage"), "ends at the end of a turn it was not extended in");
  assert.deepEqual(modifiers(s, e, "damage.taken", { target: e }).resist, []);
});

test("Rage ends when the barbarian is Incapacitated, and can't start in Heavy armor or with spells", () => {
  const s = field("barbarian", 1), e = s.entities.hero;
  fight(s); turnOf(s, "hero");
  ok(use(s, "rage"));
  ok(apply(s, { type: "condition", actor: "hero", condition: "stunned", on: true }, DM));
  assert.ok(!s.effects.some((fx) => fx.name === "Rage"));
  const h = field("barbarian", 1, { armour: "chain-mail" });
  no(apply(h, { type: "feature", actor: "hero", feature: "rage" }, DM), /Heavy armor/);
  // While raging, no spells.
  const m = field("barbarian", 1);
  m.entities.hero.spells = ["fire-bolt"]; m.entities.hero.castAbil = "cha";
  fight(m); turnOf(m, "hero");
  ok(apply(m, { type: "feature", actor: "hero", feature: "rage" }, DM));
  no(apply(m, { type: "cast", actor: "hero", spell: "fire-bolt", target: m.foe }, DM), /can't cast spells during Rage/);
});

test("Reckless Attack: before the first attack roll, Advantage on Strength attacks, and attacks against it have Advantage", () => {
  const s = field("barbarian", 2), e = s.entities.hero, foe = foeOf(s);
  fight(s); turnOf(s, "hero");
  ok(use(s, "reckless-attack"));
  no(use(s, "reckless-attack"), /already used/);
  const ev = ok(apply(s, { type: "attack", actor: "hero", target: foe, attack: "greataxe" }, DM)).events.find((x) => x.type === "attack");
  assert.equal(ev.mode, "adv");
  assert.ok(modifiers(s, e, "attack.received", { attacker: s.entities[foe], target: e }, "target").advantage.length > 0);
  // Only on the first attack roll of a turn.
  ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
  turnOf(s, "hero");
  assert.equal(modifiers(s, e, "attack.received", { attacker: s.entities[foe], target: e }, "target").advantage.length, 0, "it ends at the start of its next turn");
  ok(apply(s, { type: "attack", actor: "hero", target: foe, attack: "greataxe" }, DM));
  no(use(s, "reckless-attack"), /before the first attack roll/);
  // Danger Sense: Advantage on Dexterity saves, unless Incapacitated.
  assert.ok(modifiers(s, e, "save.dex", { target: e }, "").advantage.includes("Danger Sense"));
  e.cond.stunned = {};
  assert.equal(modifiers(s, e, "save.dex", { target: e }, "").advantage.length, 0);
});

test("Cunning Action: Dash, Disengage or Hide as a Bonus Action; others can't", () => {
  const s = field("rogue", 2, {}, true);
  fight(s); turnOf(s, "hero");
  ok(apply(s, { type: "dash", actor: "hero", bonus: true }, DM));
  assert.equal(s.encounter.budget.bonus, 0);
  assert.equal(s.encounter.budget.action, 1);
  const f = field("fighter", 2);
  fight(f); turnOf(f, "hero");
  no(apply(f, { type: "disengage", actor: "hero", bonus: true }, DM), /can't take that as a Bonus Action/);
  const r1 = field("rogue", 1);
  fight(r1); turnOf(r1, "hero");
  no(apply(r1, { type: "dash", actor: "hero", bonus: true }, DM), /Bonus Action/);
});

test("Sneak Attack needs an ally who is not Incapacitated beside the target", () => {
  const s = field("rogue", 5), foe = foeOf(s);
  assert.equal(s.entities.hero.features.sneak, "3d6");
  ok(apply(s, { type: "place", actor: "rogue", to: { q: 2, r: 0 } }, DM));
  fight(s); turnOf(s, "hero");
  s.entities[foe].ac = 1;
  s.entities.rogue.cond.stunned = {};
  let notes = 0;
  for (let i = 0; i < 10; i++) {
    s.encounter.budget.action = 1; delete s.encounter.flags["sneak:hero"];
    const ev = ok(apply(s, { type: "attack", actor: "hero", target: foe, attack: "shortsword" }, DM)).events;
    if (ev.some((x) => x.type === "note" && /Sneak Attack/.test(x.text))) notes++;
  }
  assert.equal(notes, 0, "a Stunned ally doesn't distract");
  delete s.entities.rogue.cond.stunned;
  s.encounter.budget.action = 1; delete s.encounter.flags["sneak:hero"];
  let hit = false;
  for (let i = 0; i < 10 && !hit; i++) {
    s.encounter.budget.action = 1;
    const ev = ok(apply(s, { type: "attack", actor: "hero", target: foe, attack: "shortsword" }, DM)).events;
    hit = ev.some((x) => x.type === "note" && /Sneak Attack/.test(x.text));
  }
  assert.ok(hit);
});

test("Channel Divinity: the cost is enforced and the DM is shown what Divine Spark does", () => {
  const s = field("cleric", 2);
  fight(s); turnOf(s, "hero");
  const ev = ok(use(s, "divine-spark", { target: "rogue" })).events;
  assert.ok(ev.some((x) => x.type === "manual" && /Divine Spark/.test(x.text)));
  assert.equal(s.entities.hero.uses["channel-divinity"], 1);
  assert.equal(s.encounter.budget.action, 0);
  s.encounter = null;
  ok(use(s, "turn-undead"));
  no(use(s, "divine-spark", { target: "rogue" }), /no uses of Channel Divinity/);
  ok(apply(s, { type: "shortRest" }, DM));
  assert.equal(s.entities.hero.uses["channel-divinity"], 1);
});

test("Arcane Recovery on a Short Rest: half the Wizard level in slot levels, once per Long Rest", () => {
  const s = field("wizard", 5, {}, false), e = s.entities.hero;
  e.slots = { 1: 0, 2: 0, 3: 0 };
  no(apply(s, { type: "shortRest", recover: { hero: [3, 1] } }, DM), /3 levels of slots at most/);
  no(apply(s, { type: "shortRest", recover: { hero: [6] } }, DM), /level 1 to 5/);
  e.slots = { 1: 0, 2: 3, 3: 2 };
  no(apply(s, { type: "shortRest", recover: { hero: [2] } }, DM), /hasn't spent that many level 2 slots/);
  ok(apply(s, { type: "shortRest", recover: { hero: [1, 1, 1] } }, DM));
  assert.deepEqual(e.slots, { 1: 3, 2: 3, 3: 2 });
  e.slots[1] = 0;
  no(apply(s, { type: "shortRest", recover: { hero: [1] } }, DM), /nothing that recovers/);
  ok(apply(s, { type: "rest" }, DM));
  assert.equal(e.uses["arcane-recovery"], 1);
});

test("Short Rest: Hit Point Dice, Pact Magic slots; Long Rest brings the dice back", () => {
  const s = field("warlock", 5, {}, false), e = s.entities.hero;
  assert.equal(e.hd, 5);
  e.hp = 1; e.slots = { 3: 0 };
  no(apply(s, { type: "shortRest", spend: { hero: 6 } }, DM), /5 Hit Point Dice left/);
  const ev = ok(apply(s, { type: "shortRest", spend: { hero: 2 } }, DM)).events;
  assert.equal(ev.filter((x) => x.type === "heal").length, 2);
  for (const h of ev.filter((x) => x.type === "heal")) assert.ok(h.amount >= 3 && h.amount <= 10);   // 1d8 + 2
  assert.equal(e.hd, 3);
  assert.deepEqual(e.slots, { 3: 2 });
  assert.equal(s.clock % 60, 0);
  ok(apply(s, { type: "rest" }, DM));
  assert.equal(e.hd, 5);
  const w = field("wizard", 3, {}, false);
  w.entities.hero.slots = { 1: 0, 2: 0 };
  ok(apply(w, { type: "shortRest" }, DM));
  assert.deepEqual(w.entities.hero.slots, { 1: 0, 2: 0 }, "only Pact Magic slots come back on a Short Rest");
});

test("Flurry of Blows and the Monk's Bonus Action Unarmed Strike", () => {
  const s = field("monk", 2), e = s.entities.hero, foe = foeOf(s);
  fight(s); turnOf(s, "hero");
  ok(use(s, "flurry-of-blows"));
  assert.equal(e.uses["monks-focus"], 1);
  assert.equal(s.encounter.budget.bonus, 0);
  ok(apply(s, { type: "attack", actor: "hero", target: foe, attack: "unarmed-strike" }, DM));
  ok(apply(s, { type: "attack", actor: "hero", target: foe, attack: "unarmed-strike" }, DM));
  assert.equal(s.encounter.budget.action, 1, "the flurry's strikes don't use the action");
  const t = field("monk", 1);
  fight(t); turnOf(t, "hero");
  ok(apply(t, { type: "attack", actor: "hero", target: t.foe, attack: "unarmed-strike-bonus" }, DM));
  assert.deepEqual([t.encounter.budget.bonus, t.encounter.budget.action], [0, 1]);
  no(apply(t, { type: "feature", actor: "hero", feature: "flurry-of-blows" }, DM), /no such feature/);
});

test("Lay On Hands heals from its pool", () => {
  const s = field("paladin", 3, {}, false), e = s.entities.hero, pip = s.entities.rogue;
  assert.equal(e.uses["lay-on-hands"], 15);
  pip.hp = 1;
  no(use(s, "lay-on-hands", { target: "rogue", amount: 4 }), /out of reach/);
  ok(apply(s, { type: "place", actor: "rogue", to: { q: 1, r: 0 } }, DM));
  no(use(s, "lay-on-hands", { target: "rogue", amount: 16 }), /15 Hit Points left/);
  ok(use(s, "lay-on-hands", { target: "rogue", amount: 4 }));
  assert.equal(pip.hp, 5);
  assert.equal(e.uses["lay-on-hands"], 11);
});

test("features always on come from the record; a feature with uses and no action is spent and shown to the DM", () => {
  const s = field("barbarian", 7, {}, false), e = s.entities.hero;
  assert.ok(modifiers(s, e, "initiative").advantage.includes("Feral Instinct"));
  const f = field("fighter", 9, {}, false);
  const ev = ok(apply(f, { type: "feature", actor: "hero", feature: "indomitable" }, DM)).events;
  assert.ok(ev.some((x) => x.type === "manual" && /Indomitable/.test(x.text)));
  assert.equal(f.entities.hero.uses.indomitable, 0);
  no(apply(f, { type: "feature", actor: "hero", feature: "extra-attack" }, DM), /always on/);
});
