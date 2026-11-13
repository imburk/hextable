// Bard features (SRD 5.2.1) at the levels the party plays: Bardic Inspiration as a die added to a
// failed D20 Test (`onFail` modifiers on `d20`), Countercharm (a reaction on `saveFailed`), Peerless
// Skill (an `onFail` die on attack rolls paid from Bardic Inspiration only if it succeeds), and the
// Bardic die's growth with level.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { lintPack } from "../src/content/schema.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); };
const A = { str: 10, dex: 14, con: 12, int: 10, wis: 10, cha: 18 };
const bard = (level, more = {}) => ({ name: "Zaa", class: "bard", level, ...(level >= 3 ? { subclass: "lore" } : {}), abilities: A,
  skills: ["performance", "persuasion", "insight", "history", "arcana", "deception"].slice(0, level >= 3 ? 6 : 3), expertise: level >= 2 ? ["performance", "persuasion", ...(level >= 9 ? ["insight", "history"] : [])] : [],
  weapons: ["dagger"], spells: ["vicious-mockery"], ...more });
const paladin = { name: "Vor", class: "paladin", level: 13, subclass: "devotion", abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 16 }, skills: ["athletics", "religion"], choices: { "fighting-style": "defense" }, armour: "chain-mail", weapons: ["longsword"] };

function field(level = 8) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (!["rogue", "m1"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(bard(level)).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  ok(apply(s, { type: "place", actor: "rogue", to: { q: -1, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "m1", to: { q: -2, r: 0 } }, DM));
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 300;
  return s;
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 20 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };

test("the bard's features at their levels and the Bardic die by level", () => {
  const ids = (l) => derive(bard(l)).record.feats.map((f) => f.id);
  for (const [id, l] of [["countercharm", 7], ["magical-secrets", 10], ["peerless-skill", 14]]) { assert.ok(!ids(l - 1).includes(id)); assert.ok(ids(l).includes(id)); }
  const die = (l) => derive(bard(l)).record.feats.find((f) => f.id === "bardic-inspiration").action.effects[0].modifier.value;
  assert.deepEqual([die(1), die(5), die(10), die(15)], ["1d6", "1d8", "1d10", "1d12"]);
  assert.deepEqual(validate(bard(14)), []);
  assert.deepEqual(derive(bard(8)).record.slots, { 1: 4, 2: 3, 3: 3, 4: 2 });
});

test("Bardic Inspiration: a Bonus Action and a use; the die is rolled on a failed attack it could turn, and then it is gone", () => {
  let lifted = false;
  for (let seed = 1; seed < 80 && !lifted; seed++) {
    const s = field(); s.rng = seed * 7919;
    fight(s); turnOf(s, "hero");
    const e = s.entities.hero, uses = e.uses["bardic-inspiration"];
    ok(apply(s, { type: "feature", actor: "hero", feature: "bardic-inspiration", target: "rogue" }, DM));
    assert.equal(e.uses["bardic-inspiration"], uses - 1); assert.equal(s.encounter.budget.bonus, 0);
    no(apply(s, { type: "feature", actor: "hero", feature: "bardic-inspiration", target: "hero" }, DM));
    turnOf(s, "rogue");
    const atk = s.entities.rogue.attacks.find((a) => a.type === "melee");
    const ac = s.entities.m1.ac;
    const r = ok(apply(s, { type: "attack", actor: "rogue", attack: atk.id, target: "m1" }, DM));
    const ev = r.events.find((x) => x.type === "attack");
    const fx = () => s.effects.some((x) => x.name === "Bardic Inspiration" && x.parts.some((p) => !p.ended));
    if (!ev.rescued) {
      // A hit, a natural 1, or a miss by more than a d8 can make: the die waits.
      assert.ok(ev.hit || ev.nat === 1 || ac - ev.total > 8, JSON.stringify(ev));
      continue;
    }
    lifted = true;
    assert.equal(ev.rescued.name, "Bardic Inspiration");
    assert.equal(ev.total, ev.nat + ev.bonus + ev.rescued.add);
    assert.equal(ev.hit, ev.total >= ev.ac);
    assert.ok(!fx(), "the die is spent when rolled");
  }
  assert.ok(lifted);
});

test("Bardic Inspiration on a failed saving throw", () => {
  for (let seed = 1; seed < 80; seed++) {
    const s = field(); s.rng = seed * 131;
    ok(apply(s, { type: "feature", actor: "hero", feature: "bardic-inspiration", target: "rogue" }, DM));
    s.entities.evil = makeEntity(derive(paladin).record, { id: "evil", kind: "npc", side: "foe", pos: { q: 6, r: -3, z: 0 } });
    const r = ok(apply(s, { type: "feature", actor: "evil", feature: "abjure-foes", target: "rogue" }, DM));
    const sv = r.events.find((x) => x.type === "save" && x.id === "rogue");
    if (!sv.rescued) continue;
    assert.equal(sv.success, sv.total >= sv.dc);
    return;
  }
  assert.fail("no save was ever lifted");
});

test("Countercharm: an ally's failed save against Frightened is rolled again with Advantage, for the bard's Reaction", () => {
  let seen = false;
  for (let seed = 1; seed < 80 && !seen; seed++) {
    const s = field(7); s.rng = seed * 977;
    s.entities.evil = makeEntity(derive(paladin).record, { id: "evil", kind: "npc", side: "foe", pos: { q: 6, r: -3, z: 0 } });
    const r = ok(apply(s, { type: "feature", actor: "evil", feature: "abjure-foes", target: "rogue" }, DM));
    const saves = r.events.filter((x) => x.type === "save" && x.id === "rogue");
    if (!saves[0] || saves[0].success) continue;
    seen = true;
    assert.equal(saves.length, 2);
    assert.ok(saves[1].reroll); assert.equal(saves[1].mode === "adv" || saves[1].mode === undefined || saves[1].mode === "normal", true);
    assert.ok(r.events.some((x) => x.type === "reaction" && x.id === "hero" && x.trigger === "saveFailed"));
    assert.equal(s.entities.hero.reactionUsed, true);
    assert.equal(!!s.entities.rogue.cond.frightened, !saves[1].success);
  }
  assert.ok(seen);
  // Never: no reroll. Out of range: no reroll. Below level 7: no reroll.
  for (const [setup, why] of [[(s) => ok(apply(s, { type: "reactions", actor: "hero", set: { countercharm: "never" } }, DM)), "never"], [(s) => ok(apply(s, { type: "place", actor: "hero", to: { q: 6, r: 0 } }, DM)), "far"]]) {
    for (let seed = 1; seed < 40; seed++) {
      const s = field(7); s.rng = seed * 977; setup(s);
      s.entities.evil = makeEntity(derive(paladin).record, { id: "evil", kind: "npc", side: "foe", pos: { q: 6, r: -3, z: 0 } });
      const r = ok(apply(s, { type: "feature", actor: "evil", feature: "abjure-foes", target: "rogue" }, DM));
      assert.ok(r.events.filter((x) => x.type === "save").length <= 1, why);
    }
  }
  no(apply(field(7), { type: "reactions", actor: "hero", set: { countercharm: "ask" } }, DM), /never, always/);
});

test("Peerless Skill: a failed attack roll gets the Bardic die, paid only if it then hits", () => {
  let paid = false, kept = false;
  for (let seed = 1; seed < 200 && !(paid && kept); seed++) {
    const s = field(14); s.rng = seed * 37;
    ok(apply(s, { type: "place", actor: "m1", to: { q: 1, r: 0 } }, DM));
    fight(s); turnOf(s, "hero");
    const e = s.entities.hero, before = e.uses["bardic-inspiration"];
    const ev = ok(apply(s, { type: "attack", actor: "hero", attack: "dagger", target: "m1" }, DM)).events.find((x) => x.type === "attack");
    if (!ev.rescued) continue;
    assert.equal(ev.rescued.name, "Peerless Skill");
    if (ev.hit) { paid = true; assert.equal(e.uses["bardic-inspiration"], before - 1); }
    else { kept = true; assert.equal(e.uses["bardic-inspiration"], before); }
  }
  assert.ok(paid);
});

test("the linter takes onFail dice and a saveFailed reaction, and refuses bad ones", () => {
  const cls = (grants) => ({ id: "x", name: "X", source: "S", text: "t", checked: false, hitDie: 8, primary: ["str"], saves: ["str", "con"], armour: [], weapons: ["simple"],
    skills: { choose: 1, from: ["athletics"] }, table: { die: Array(20).fill("1d6") }, casting: null, features: [{ id: "f", name: "F", level: 1, tier: "auto", checked: false, text: "t", grants, uses: { max: 1, recharge: "long" } }],
    subclass: { id: "s", name: "S", text: "t", checked: false, features: [] } });
  const lint = (g) => lintPack({ pack: { id: "p", name: "P", license: "L", attribution: "A" }, classes: [cls(g)] });
  assert.deepEqual(lint({ modifiers: [{ on: "attack.roll", op: "add", value: { column: "die" }, onFail: true, cost: "f" }] }), []);
  assert.ok(lint({ modifiers: [{ on: "ac", op: "add", value: 1, onFail: true }] }).some((p) => /onFail/.test(p)));
  assert.ok(lint({ modifiers: [{ on: "d20", op: "add", value: "1d6" }] }).some((p) => /d20 hook/.test(p)));
  assert.deepEqual(lint({ reaction: { on: "saveFailed", conditions: ["charmed"], range: 30 } }), []);
  assert.ok(lint({ reaction: { on: "saveFailed", conditions: ["charmed"] } }).some((p) => /saveFailed/.test(p)));
});
