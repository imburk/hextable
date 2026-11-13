// Cleric features (SRD 5.2.1) at the levels the party plays, and the engine parts they use: a
// feature that does one of several things (`modes`: Divine Spark), an area limited to creature
// types (Turn Undead), a step that comes with a later feature (`with`: Sear Undead), extra damage
// once on each of one's turns of the type that hurts most (Divine Strike), damage added to cantrips
// (Potent Spellcasting), and a spell cast through a feature with no slot (Divine Intervention).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { lintPack } from "../src/content/schema.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); };
const A = { str: 14, dex: 10, con: 14, int: 10, wis: 16, cha: 10 };
const cleric = (level, strikes = "divine-strike", more = {}) => ({ name: "San", class: "cleric", level, ...(level >= 3 ? { subclass: "life" } : {}), abilities: A,
  skills: ["insight", "medicine"], choices: { "divine-order": "protector", ...(level >= 7 ? { "blessed-strikes": strikes } : {}) }, armour: "chain-mail", shield: true,
  weapons: ["warhammer"], spells: ["sacred-flame"], ...more });

function field(sheet) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (!["rogue", "m5", "m6", "m1"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  ok(apply(s, { type: "place", actor: "rogue", to: { q: -1, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "m1", to: { q: 1, r: 0 } }, DM));          // a goblin beside the cleric
  ok(apply(s, { type: "place", actor: "m5", to: { q: 2, r: -1 } }, DM));         // two skeletons
  ok(apply(s, { type: "place", actor: "m6", to: { q: 0, r: 3 } }, DM));
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 200;
  return s;
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 20 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const use = (s, feature, more = {}) => apply(s, { type: "feature", actor: "hero", feature, ...more }, DM);

test("the cleric's features at their levels; Blessed Strikes asks for its choice at 7", () => {
  const ids = (l, k) => derive(cleric(l, k)).record.feats.map((f) => f.id);
  for (const [id, l] of [["sear-undead", 5], ["blessed-strikes", 7], ["divine-intervention", 10], ["improved-blessed-strikes", 14]]) {
    assert.ok(!ids(l - 1).includes(id)); assert.ok(ids(l).includes(id));
  }
  assert.ok(validate({ ...cleric(7), choices: { "divine-order": "protector" } }).some((p) => /Blessed Strikes/.test(p)));
  assert.deepEqual(validate(cleric(14)), []);
  const uses = (l) => derive(cleric(l)).record.feats.find((f) => f.id === "channel-divinity").uses.max;
  assert.deepEqual([uses(2), uses(6), uses(14), uses(18)], [2, 3, 3, 4]);
  assert.deepEqual(derive(cleric(14)).record.slots, { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 });
});

test("Divine Spark heals, or harms with a Constitution save for half, by the dice of the cleric's level + Wisdom", () => {
  const spark = (l) => derive(cleric(l)).record.feats.find((f) => f.id === "divine-spark").action.modes;
  assert.deepEqual(spark(7)[0].effects, [{ heal: "2d8+3" }]);
  assert.deepEqual(spark(13)[1].effects[0].onFail, [{ damage: "3d8+3", type: "radiant" }]);
  const s = field(cleric(14)), e = s.entities.hero, rogue = s.entities.rogue;
  rogue.hp = 50;
  no(use(s, "divine-spark", { target: "rogue", mode: "sparkle" }), /Choose what Divine Spark does: Heal, Radiant, Necrotic/);
  // A screen that sends no mode: the use is spent and the DM applies it, as before it was built.
  const hand = ok(use(s, "divine-spark", { target: "rogue" }));
  assert.ok(hand.events.some((x) => x.type === "manual" && /No choice was sent/.test(x.text)));
  e.uses["channel-divinity"] = 3;
  ok(use(s, "divine-spark", { target: "rogue", mode: "heal" }));
  assert.ok(rogue.hp >= 50 + 3 + 3 && rogue.hp <= 50 + 24 + 3, `healed by 3d8+3: ${rogue.hp}`);
  assert.equal(e.uses["channel-divinity"], 2);
  const r = ok(use(s, "divine-spark", { target: "m1", mode: "necrotic" }));
  const sv = r.events.find((x) => x.type === "save"), dmg = r.events.find((x) => x.type === "damage");
  assert.equal(sv.abil, "con"); assert.equal(sv.dc, 8 + 5 + 3);
  assert.equal(dmg.dtype, "necrotic");
  no(use(s, "divine-spark", { target: "hero", mode: "heal" }), /needs another target/);
});

test("Turn Undead: only Undead within 30 feet save; those that fail are Frightened and Incapacitated, and Sear Undead burns them", () => {
  let failed = false;
  for (let seed = 1; seed < 40 && !failed; seed++) {
    const s = field(cleric(14)); s.rng = seed * 7919;
    const before = s.entities.m5.hp;
    const r = ok(use(s, "turn-undead"));
    const saves = r.events.filter((x) => x.type === "save");
    assert.deepEqual(saves.map((x) => x.id).sort(), ["m5", "m6"], "the goblin and the rogue are not turned");
    const sv = saves.find((x) => x.id === "m5");
    if (sv.success) { assert.ok(!s.entities.m5.cond.frightened); continue; }
    failed = true;
    const m5 = s.entities.m5;
    assert.ok(m5.cond.frightened && m5.cond.incapacitated);
    const burn = r.events.find((x) => x.type === "damage" && x.target === "m5");
    assert.equal(burn.dtype, "radiant");
    assert.ok(before - m5.hp >= 3, "three d8s (Wisdom +3)");
    ok(apply(s, { type: "harm", actor: "m5", amount: 1 }, DM));
    assert.ok(!m5.cond.frightened && !m5.cond.incapacitated, "damage ends it");
  }
  assert.ok(failed);
  // Without Sear Undead (level 4), no damage step.
  const steps = derive(cleric(4)).record.feats.find((f) => f.id === "turn-undead").action.effects[0].onFail;
  assert.ok(!steps.some((x) => "damage" in x));
  assert.ok(derive(cleric(5)).record.feats.find((f) => f.id === "turn-undead").action.effects[0].onFail.some((x) => x.damage === "3d8"));
});

test("Turn Undead ends on every creature when the cleric is Incapacitated", () => {
  for (let seed = 1; seed < 40; seed++) {
    const s = field(cleric(14)); s.rng = seed * 31;
    ok(use(s, "turn-undead"));
    if (!s.entities.m5.cond.frightened) continue;
    ok(apply(s, { type: "condition", actor: "hero", condition: "stunned" }, DM));
    assert.ok(!s.entities.m5.cond.frightened);
    return;
  }
  assert.fail("no skeleton was turned");
});

test("Divine Strike: once on each of the cleric's turns, 1d8 (2d8 at 14) of the type the target takes most", () => {
  // Force hits to see it: an attack bonus that cannot miss.
  const s2 = field(cleric(14)); fight(s2); turnOf(s2, "hero");
  s2.entities.hero.attacks.find((a) => a.id === "warhammer").bonus = 50;
  s2.entities.m1.vuln = ["necrotic"];
  const r1 = ok(apply(s2, { type: "attack", actor: "hero", attack: "warhammer", target: "m1" }, DM));
  const x1 = r1.events.filter((x) => x.type === "damage" && x.dtype !== "bludgeoning");
  assert.equal(x1.length, 1); assert.equal(x1[0].dtype, "necrotic", "vulnerable to necrotic: that is chosen");
  assert.equal(x1[0].dice.length >= 2, true, "2d8 at 14");
  s2.encounter.budget.action = 1;
  const r2 = ok(apply(s2, { type: "attack", actor: "hero", attack: "warhammer", target: "m1" }, DM));
  assert.equal(r2.events.filter((x) => x.type === "damage" && x.dtype !== "bludgeoning").length, 0, "once a turn");
  turnOf(s2, "m1"); turnOf(s2, "hero");
  const r3 = ok(apply(s2, { type: "attack", actor: "hero", attack: "warhammer", target: "m1" }, DM));
  assert.equal(r3.events.filter((x) => x.type === "damage" && x.dtype !== "bludgeoning").length, 1, "again next turn");
});

test("Potent Spellcasting adds Wisdom to a cantrip's damage, and nothing to a weapon's", () => {
  for (let seed = 1; seed < 40; seed++) {
    const s = field(cleric(7, "potent-spellcasting")); s.rng = seed * 13;
    fight(s); turnOf(s, "hero");
    const r = ok(apply(s, { type: "cast", actor: "hero", spell: "sacred-flame", target: "m1" }, DM));
    if (r.events.find((x) => x.type === "save").success) continue;
    const d = r.events.find((x) => x.type === "damage");
    assert.equal(d.amount, d.dice.reduce((n, x) => n + (x.value ?? x), 0) + d.bonus, JSON.stringify(d));
    assert.equal(d.bonus, 3, "Wisdom +3");
    s.entities.hero.attacks.find((a) => a.id === "warhammer").bonus = 50;
    s.encounter.budget.action = 1;
    const w = ok(apply(s, { type: "attack", actor: "hero", attack: "warhammer", target: "m1" }, DM)).events.find((x) => x.type === "damage");
    assert.equal(w.bonus, 2, "a weapon adds only Strength");
    return;
  }
  assert.fail("the goblin always saved");
});

test("Divine Intervention: any Cleric spell of level 5 or lower, unprepared, with no slot, once per Long Rest", () => {
  const s = field(cleric(10)), e = s.entities.hero;
  assert.ok(!e.spells.includes("healing-word"));
  const slots = structuredClone(e.slots);
  e.hp = 20;
  ok(apply(s, { type: "cast", actor: "hero", spell: "healing-word", target: "hero", via: "divine-intervention" }, DM));
  assert.ok(e.hp > 20);
  assert.deepEqual(e.slots, slots, "no slot spent");
  assert.equal(e.uses["divine-intervention"], 0);
  no(apply(s, { type: "cast", actor: "hero", spell: "healing-word", target: "hero", via: "divine-intervention" }, DM), /no uses of Divine Intervention/);
  e.uses["divine-intervention"] = 1;
  no(apply(s, { type: "cast", actor: "hero", spell: "fire-bolt", target: "m1", via: "divine-intervention" }, DM), /can't cast that spell/);
  no(apply(s, { type: "cast", actor: "hero", spell: "healing-word", target: "hero", via: "turn-undead" }, DM), /no feature that casts/);
  no(apply(s, { type: "cast", actor: "hero", spell: "healing-word", target: "hero", via: "divine-intervention", slot: 3 }, DM), /without a slot/);
  ok(apply(s, { type: "rest", ids: ["hero"] }, DM));
  assert.equal(e.uses["divine-intervention"], 1);
});

test("the linter takes modes, types, with, freeCast and a once-a-turn damage, and refuses bad ones", () => {
  const cls = (feats) => ({ id: "x", name: "X", source: "S", text: "t", checked: false, hitDie: 8, primary: ["str"], saves: ["str", "con"], armour: [], weapons: ["simple"],
    skills: { choose: 1, from: ["athletics"] }, table: {}, casting: null, features: feats, subclass: { id: "s", name: "S", text: "t", checked: false, features: [] } });
  const F = (grants, extra = {}) => ({ id: "f", name: "F", level: 1, tier: "auto", checked: false, text: "t", grants, ...extra });
  const lint = (...feats) => lintPack({ pack: { id: "p", name: "P", license: "L", attribution: "A" }, classes: [cls(feats)] });
  const self = { self: true };
  assert.deepEqual(lint(F({ action: { time: "action", target: self, modes: [{ id: "a", name: "A", effects: [{ heal: "1d8" }] }, { id: "b", name: "B", effects: [{ manual: "x" }] }] } })), []);
  assert.ok(lint(F({ action: { time: "action", target: self, modes: [{ id: "a", name: "A", effects: [{ heal: "1d8" }] }] } })).some((p) => /two or more/.test(p)));
  assert.deepEqual(lint(F({ action: { time: "action", target: { area: { shape: "emanation", size: 30, types: ["undead"] } }, effects: [{ save: "wis", onFail: [{ damage: { mod: "wis", min: 1, die: 8 }, type: "radiant", with: "g" }] }] } }),
    { id: "g", name: "G", level: 5, tier: "auto", checked: false, text: "t" }), []);
  assert.ok(lint(F({ action: { time: "action", target: { area: { shape: "emanation", size: 30, types: ["ghosts"] } }, effects: [{ manual: "x" }] } })).some((p) => /creature types/.test(p)));
  assert.ok(lint(F({ action: { time: "action", target: self, effects: [{ heal: "1d8", with: "nope" }] } })).some((p) => /not a feature of this class/.test(p)));
  assert.deepEqual(lint(F({ freeCast: { list: "cleric", maxLevel: 5 } }, { uses: { max: 1, recharge: "long" } })), []);
  assert.ok(lint(F({ freeCast: { list: "cleric", maxLevel: 5 } })).some((p) => /needs uses/.test(p)));
  assert.deepEqual(lint(F({ modifiers: [{ on: "damage.dealt", op: "add", value: { byLevel: { 7: "1d8", 14: "2d8" } }, types: ["necrotic", "radiant"], once: "turn", when: ["attack.hit"] }] })), []);
  assert.ok(lint(F({ modifiers: [{ on: "damage.dealt", op: "add", value: { byLevel: { 30: "1d8" } } }] })).some((p) => /byLevel/.test(p)));
});
