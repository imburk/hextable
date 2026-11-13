// Paladin features at levels 6 to 15 (SRD 5.2.1) and the engine parts they use: auras on the
// holder and its allies (modifiers.js, aurasOn), condition Immunity from an aura, a target count
// that grows with the class, a condition that ends when its creature takes damage, and a pool of
// healing that also removes conditions (Lay On Hands, Restoring Touch).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { aurasOn, modifiers } from "../src/modifiers.js";
import { lintPack } from "../src/content/schema.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); };
const A = { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 16 };
const paladin = (level, more = {}) => ({ name: "Ka", class: "paladin", level, ...(level >= 3 ? { subclass: "devotion" } : {}), abilities: A, skills: ["athletics", "religion"],
  choices: { "fighting-style": "defense" }, armour: "chain-mail", weapons: ["longsword"], ...more });
const feat = (level, id) => derive(paladin(level)).record.feats.find((f) => f.id === id);

// The paladin at the centre, the rogue (an ally) beside it, a goblin two hexes off.
function field(level = 13) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (id !== "rogue" && id !== "fighter") delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(paladin(level)).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  ok(apply(s, { type: "place", actor: "rogue", to: { q: 1, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "fighter", to: { q: -6, r: 0 } }, DM));
  s.foe = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 0, r: 2 } }, DM)).events[0].id;
  return s;
}
const saveAdd = (s, id) => modifiers(s, s.entities[id], "save", { target: s.entities[id] }, "").add;

test("the paladin's features appear at their levels, not before", () => {
  const at = (level) => derive(paladin(level)).record.feats.map((f) => f.id);
  for (const [id, level] of [["aura-of-protection", 6], ["aura-of-devotion", 7], ["abjure-foes", 9], ["aura-of-courage", 10], ["radiant-strikes", 11], ["restoring-touch", 14], ["smite-of-protection", 15]]) {
    assert.ok(!at(level - 1).includes(id), `${id} before ${level}`);
    assert.ok(at(level).includes(id), `${id} at ${level}`);
  }
  assert.deepEqual(validate(paladin(15)), []);
  assert.deepEqual(feat(13, "aura-of-protection").aura, { range: 10, modifiers: [{ on: "save", op: "add", value: 3 }] });
  assert.deepEqual(feat(10, "aura-of-courage").aura, { range: 10, immune: ["frightened"] });
  assert.deepEqual(feat(7, "aura-of-devotion").aura, { range: 10, immune: ["charmed"] });
  assert.equal(feat(9, "abjure-foes").action.target.creature.count, 3, "Charisma modifier");
  assert.equal(derive(paladin(9, { abilities: { ...A, cha: 8 } })).record.feats.find((f) => f.id === "abjure-foes").action.target.creature.count, 1, "at least one");
  const slots = (l) => derive(paladin(l)).record.slots;
  assert.deepEqual(slots(9), { 1: 4, 2: 3, 3: 2 }); assert.deepEqual(slots(13), { 1: 4, 2: 3, 3: 3, 4: 1 }); assert.deepEqual(slots(15), { 1: 4, 2: 3, 3: 3, 4: 2 });
  assert.equal(derive(paladin(11)).record.features.extraAttack, 1);
});

test("Aura of Protection: the paladin and allies within 10 feet add its Charisma modifier to saves", () => {
  const s = field();
  assert.equal(saveAdd(s, "hero"), 3);
  assert.equal(saveAdd(s, "rogue"), 3, "an ally beside it");
  assert.equal(saveAdd(s, "fighter"), 0, "an ally 30 feet away");
  assert.equal(saveAdd(s, s.foe), 0, "not an enemy");
  ok(apply(s, { type: "place", actor: "rogue", to: { q: 2, r: 0 } }, DM));
  assert.equal(saveAdd(s, "rogue"), 3, "10 feet is inside");
  ok(apply(s, { type: "place", actor: "rogue", to: { q: 3, r: 0 } }, DM));
  assert.equal(saveAdd(s, "rogue"), 0, "15 feet is outside");
  ok(apply(s, { type: "place", actor: "rogue", to: { q: 1, r: 0 } }, DM));
  // Inactive while the paladin is Incapacitated, down or dead.
  s.entities.hero.cond.stunned = {};
  assert.equal(saveAdd(s, "rogue"), 0); assert.equal(saveAdd(s, "hero"), 0);
  delete s.entities.hero.cond.stunned;
  s.entities.hero.hp = 0;
  assert.equal(saveAdd(s, "rogue"), 0);
  s.entities.hero.hp = 30;
  // Two paladins: one Aura of Protection at a time, the better.
  s.entities.ka2 = makeEntity(derive(paladin(13, { name: "Bo", abilities: { ...A, cha: 20 } })).record, { id: "ka2", kind: "pc", side: "party", pos: { q: 1, r: 1, z: 0 } });
  assert.equal(saveAdd(s, "rogue"), 5);
  assert.equal(aurasOn(s, s.entities.rogue).filter((a) => a.name === "Aura of Protection").length, 1);
});

test("Aura of Protection applies to a real saving throw an ally makes, and not to an enemy's", () => {
  const s = field(), rogue = s.entities.rogue;
  // A hostile paladin, out of range of its own allies, uses Abjure Foes on the rogue.
  s.entities.evil = makeEntity(derive(paladin(13, { name: "Vor" })).record, { id: "evil", kind: "npc", side: "foe", pos: { q: 6, r: -2, z: 0 } });
  const r = ok(apply(s, { type: "feature", actor: "evil", feature: "abjure-foes", target: "rogue" }, DM));
  const sv = r.events.find((x) => x.type === "save" && x.id === "rogue");
  const base = Math.floor((rogue.abil.wis - 10) / 2) + (rogue.saveProf.includes("wis") ? rogue.prof : 0);
  assert.equal(sv.bonus, base + 3, "the hero's aura adds +3");
  const g = ok(apply(s, { type: "feature", actor: "hero", feature: "abjure-foes", target: s.foe }, DM)).events.find((x) => x.type === "save");
  assert.equal(g.bonus, s.entities[s.foe].saveBonus?.wis ?? Math.floor((s.entities[s.foe].abil.wis - 10) / 2), "the goblin is not helped by the paladin's aura");
});

test("Aura of Courage and Aura of Devotion: Immunity to Frightened and Charmed inside the aura only", () => {
  const s = field(10);
  no(apply(s, { type: "condition", actor: "rogue", condition: "frightened" }, DM), /immune to Frightened/);
  no(apply(s, { type: "condition", actor: "hero", condition: "frightened" }, DM), /immune/);
  no(apply(s, { type: "condition", actor: "rogue", condition: "charmed" }, DM), /immune to Charmed/);
  ok(apply(s, { type: "condition", actor: "fighter", condition: "frightened" }, DM));
  ok(apply(s, { type: "condition", actor: s.foe, condition: "frightened" }, DM));
  const nine = field(9);
  ok(apply(nine, { type: "condition", actor: "rogue", condition: "frightened" }, DM));
  no(apply(nine, { type: "condition", actor: "rogue", condition: "charmed" }, DM), /immune/);
  const six = field(6);
  ok(apply(six, { type: "condition", actor: "rogue", condition: "charmed" }, DM));
  // An effect that would frighten an ally in the aura says it is immune and applies nothing.
  const s2 = field(10);
  s2.entities.hero.cond.incapacitated = {};
  ok(apply(s2, { type: "condition", actor: "rogue", condition: "frightened" }, DM));
});

test("Abjure Foes: a Magic action and a Channel Divinity use, up to Charisma modifier targets, Frightened until damaged", () => {
  let failed = false;
  for (let seed = 1; seed < 40 && !failed; seed++) {
    const s = field(); s.rng = seed * 104729;
    const e = s.entities.hero;
    s.encounter = null;
    ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
    for (let i = 0; i < 20 && current(s) !== "hero"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    const cd = e.uses["channel-divinity"];
    const r = ok(apply(s, { type: "feature", actor: "hero", feature: "abjure-foes", targets: [s.foe] }, DM));
    assert.equal(e.uses["channel-divinity"], cd - 1);
    assert.equal(s.encounter.budget.action, 0);
    const sv = r.events.find((x) => x.type === "save");
    assert.equal(sv.dc, 8 + 5 + 3, "spell save DC"); assert.equal(sv.abil, "wis");
    if (sv.success) continue;
    failed = true;
    assert.ok(s.entities[s.foe].cond.frightened);
    assert.ok(r.events.some((x) => x.type === "manual" && /only one of these/.test(x.text)));
    ok(apply(s, { type: "harm", actor: s.foe, amount: 1 }, DM));
    assert.ok(!s.entities[s.foe].cond.frightened, "taking damage ends it");
  }
  assert.ok(failed);
  const s = field();
  const extra = ["a", "b", "c"].map((k, i) => ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: -1 - i, r: 2 } }, DM)).events[0].id);
  no(apply(s, { type: "feature", actor: "hero", feature: "abjure-foes", targets: [s.foe, ...extra] }, DM), /3 targets/);
});

test("Lay On Hands removes Poisoned for 5 points; Restoring Touch at 14 adds Stunned and the rest", () => {
  const s = field(13), e = s.entities.hero, rogue = s.entities.rogue;
  rogue.cond.poisoned = {}; rogue.cond.stunned = {};
  const pool = e.uses["lay-on-hands"];
  assert.equal(pool, 65);
  ok(apply(s, { type: "feature", actor: "hero", feature: "lay-on-hands", target: "rogue", cure: ["poisoned"] }, DM));
  assert.equal(e.uses["lay-on-hands"], 60); assert.ok(!rogue.cond.poisoned);
  no(apply(s, { type: "feature", actor: "hero", feature: "lay-on-hands", target: "rogue", cure: ["stunned"] }, DM), /can't remove Stunned/);
  no(apply(s, { type: "feature", actor: "hero", feature: "lay-on-hands", target: "rogue", cure: ["poisoned"] }, DM), /is not Poisoned/);
  const s14 = field(14), p = s14.entities.hero, r = s14.entities.rogue;
  r.cond.stunned = {}; r.cond.blinded = {}; r.hp -= 5;
  const before = p.uses["lay-on-hands"], hp = r.hp;
  ok(apply(s14, { type: "feature", actor: "hero", feature: "lay-on-hands", target: "rogue", cure: ["stunned", "blinded"], amount: 3 }, DM));
  assert.equal(p.uses["lay-on-hands"], before - 13);
  assert.ok(!r.cond.stunned && !r.cond.blinded); assert.equal(r.hp, hp + 3);
  p.uses["lay-on-hands"] = 4; r.cond.deafened = {};
  const snap = JSON.stringify(s14);
  no(apply(s14, { type: "feature", actor: "hero", feature: "lay-on-hands", target: "rogue", cure: ["deafened"] }, DM), /4 Hit Points left/);
  assert.equal(JSON.stringify(s14), snap, "a refused cure changes nothing");
});

test("the linter takes auras, cures and a count that grows with the class, and refuses bad ones", () => {
  const cls = (grants, extra = {}) => ({ id: "x", name: "X", source: "S", text: "t", checked: false, hitDie: 8, primary: ["str"], saves: ["str", "con"], armour: [], weapons: ["simple"],
    skills: { choose: 1, from: ["athletics"] }, table: {}, casting: null,
    features: [{ id: "f", name: "F", level: 1, tier: "auto", checked: false, text: "t", grants }, ...(extra.more ?? [])],
    subclass: { id: "s", name: "S", text: "t", checked: false, features: [] } });
  const lint = (grants) => lintPack({ pack: { id: "p", name: "P", license: "L", attribution: "A" }, classes: [cls(grants)] });
  assert.deepEqual(lint({ aura: { range: 10, modifiers: [{ on: "save", op: "add", value: { mod: "cha", min: 1 } }], immune: ["frightened"] } }), []);
  assert.ok(lint({ aura: { range: 7, immune: ["frightened"] } }).some((p) => /aura.range/.test(p)));
  assert.ok(lint({ aura: { range: 10 } }).some((p) => /modifiers or immunities/.test(p)));
  assert.ok(lint({ aura: { range: 10, immune: ["sad"] } }).some((p) => /aura.immune/.test(p)));
  assert.deepEqual(lint({ cure: { of: "lay-on-hands", conditions: ["stunned"] } }), []);
  assert.ok(lint({ cure: { of: "lay-on-hands", conditions: ["sleepy"] } }).some((p) => /cure is/.test(p)));
  assert.deepEqual(lint({ action: { time: "action", target: { creature: { range: [60, 60], count: { mod: "cha", min: 1 } } }, effects: [{ save: "wis", onFail: [{ condition: "frightened", ends: { on: "damaged" } }] }] } }), []);
  assert.ok(lint({ action: { time: "action", target: { creature: { range: [60, 60], count: { mod: "luck" } } }, effects: [{ manual: "x" }] } }).some((p) => /mod is an ability/.test(p)));
  assert.deepEqual(lint({ action: { time: "bonus", pool: true, target: { creature: { reach: 5 } }, cure: { conditions: ["poisoned"], cost: 5 } } }), []);
  assert.ok(lint({ action: { time: "bonus", pool: true, target: { creature: { reach: 5 } }, cure: { conditions: ["poisoned"] } } }).some((p) => /cure is/.test(p)));
});

test("levelUp from 9 to 10 brings Aura of Courage into play", () => {
  const s = newGame(3);
  const id = ok(apply(s, { type: "setSheet", sheet: paladin(9) }, DM)).events.find((x) => x.type === "spawned").id;
  assert.ok(!s.entities[id].feats.some((f) => f.id === "aura-of-courage"));
  ok(apply(s, { type: "levelUp", actor: id, sheet: paladin(10) }, DM));
  assert.ok(s.entities[id].feats.some((f) => f.id === "aura-of-courage" && f.aura));
});
