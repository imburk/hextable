// Ranger features at levels 7 to 15 (SRD 5.2.1, Ranger and Hunter): Defensive Tactics (Escape the
// Horde, Multiattack Defense), Ability Score Improvement at 8 and 12, Expertise, Tireless,
// Superior Hunter's Prey, Relentless Hunter, Nature's Veil and Superior Hunter's Defense; and
// Favored Enemy's free Hunter's Mark (level 1), built here because three of them turn on the mark.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, featChoices, validate } from "../src/derive.js";
import { lintRecord } from "../src/content/schema.js";
import { SPELLS as BOOK } from "../src/content/index.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "refused"); if (re) assert.match(r.error, re); };
const A = { str: 12, dex: 18, con: 14, int: 10, wis: 16, cha: 8 };
const ranger = (level, tactic = "escape-the-horde", more = {}) => ({ name: "Rook", class: "ranger", level, ...(level >= 3 ? { subclass: "hunter" } : {}), abilities: A,
  skills: ["perception", "stealth", "survival"], expertise: level >= 9 ? ["perception", "stealth", "survival"] : level >= 2 ? ["perception"] : [],
  weapons: ["shortsword", "longbow"], spells: ["cure-wounds"],
  choices: { ...(level >= 2 ? { "fighting-style": "defense" } : {}), ...(level >= 3 ? { "hunters-prey": "colossus-slayer" } : {}), ...(level >= 7 ? { "defensive-tactics": tactic } : {}) }, ...more });

// The ranger with foes around it: m1 beside it, m2 a little further.
function field(level, tactic, foe = "goblin-warrior") {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(ranger(level, tactic)).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  s.m1 = ok(apply(s, { type: "spawn", monster: foe, at: { q: 1, r: 0 } }, DM)).events[0].id;
  s.m2 = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 3, r: 0 } }, DM)).events[0].id;
  for (const id of [s.m1, s.m2]) { const m = s.entities[id]; m.hp = m.maxHp = 300; m.ac = 1; }
  s.entities.hero.hp = s.entities.hero.maxHp = 300;
  return s;
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 30 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const ready = (level, tactic, seed = 5, foe) => { const s = field(level, tactic, foe); s.rng = seed; fight(s); turnOf(s, "hero"); return s; };
const act = (s, x) => apply(s, { actor: "hero", ...x }, DM);
const attacks = (r) => r.events.filter((x) => x.type === "attack");

test("the ranger's features at levels 7 to 15 appear at their levels, and the records are valid", () => {
  const ids = (l) => derive(ranger(l)).record.feats.map((f) => f.id);
  for (const [id, level] of [["defensive-tactics", 7], ["expertise", 9], ["tireless", 10], ["superior-hunters-prey", 11], ["relentless-hunter", 13], ["natures-veil", 14], ["superior-hunters-defense", 15]]) {
    assert.ok(!ids(level - 1).includes(id), `${id} before ${level}`);
    assert.ok(ids(level).includes(id), `${id} at ${level}`);
  }
  assert.ok(ids(7).includes("defensive-tactics-escape-the-horde"));
  assert.ok(derive(ranger(7, "multiattack-defense")).record.feats.some((f) => f.id === "defensive-tactics-multiattack-defense"));
  for (let l = 1; l <= 20; l++) { assert.deepEqual(validate(ranger(l)), [], `level ${l}`); assert.deepEqual(lintRecord(derive(ranger(l)).record, { spells: BOOK }), [], `record ${l}`); }
  assert.ok(validate(ranger(7, "nope")).length, "an option that is not one is refused");
  // Expertise at 9: two more skills (three with Deft Explorer's), not before.
  assert.ok(validate({ ...ranger(8), expertise: ["perception", "stealth", "survival"] }).length);
  assert.deepEqual(derive(ranger(9)).record.expertise, ["perception", "stealth", "survival"]);
  // Ability Score Improvement at 8 and 12.
  const at = (l) => featChoices(ranger(l)).map((c) => c.at);
  assert.ok(!at(7).includes("ability-score-improvement-8") && at(8).includes("ability-score-improvement-8"));
  assert.ok(!at(11).includes("ability-score-improvement-12") && at(12).includes("ability-score-improvement-12"));
});

test("Favored Enemy: Hunter's Mark without a slot, so many times a Long Rest", () => {
  const s = ready(5), e = s.entities.hero, slots = { ...e.slots };
  assert.equal(e.uses["favored-enemy"], 3);
  ok(act(s, { type: "cast", spell: "hunters-mark", target: s.m1, via: "favored-enemy" }));
  assert.deepEqual(e.slots, slots, "no slot spent");
  assert.equal(e.uses["favored-enemy"], 2);
  assert.equal(s.encounter.budget.bonus, 0, "a Bonus Action, as the spell");
  e.uses["favored-enemy"] = 0;
  turnOf(s, s.m1); turnOf(s, "hero");
  const before = structuredClone(s);
  no(act(s, { type: "cast", spell: "hunters-mark", target: s.m1, via: "favored-enemy" }), /no uses/);
  assert.deepEqual(s, before);
});

test("Escape the Horde: an Opportunity Attack against the ranger has Disadvantage; with Multiattack Defense instead it does not", () => {
  const leave = (tactic) => {
    const s = ready(7, tactic);
    const r = ok(act(s, { type: "move", to: { q: -3, r: 0 } }));
    return attacks(r).find((x) => x.actor === s.m1 && x.opportunity);
  };
  const oa = leave("escape-the-horde");
  assert.ok(oa, "the goblin took its Opportunity Attack");
  assert.equal(oa.mode, "dis");
  assert.ok(oa.why.includes("Escape the Horde"), oa.why.join(", "));
  const plain = leave("multiattack-defense");
  assert.ok(plain && !plain.why.includes("Escape the Horde"));
});

test("Multiattack Defense: after hitting the ranger, the creature has Disadvantage on its other attacks against it that turn, and not after", () => {
  for (let seed = 1; seed < 200; seed++) {
    const s = ready(7, "multiattack-defense", seed, "ape");
    turnOf(s, s.m1);
    ok(apply(s, { type: "act", actor: s.m1, action: "multiattack" }, DM));
    const first = attacks(ok(apply(s, { type: "attack", actor: s.m1, target: "hero", attack: "fist" }, DM)))[0];
    if (!first.hit) continue;
    const second = attacks(ok(apply(s, { type: "attack", actor: s.m1, target: "hero", attack: "fist" }, DM)))[0];
    assert.equal(second.mode, "dis");
    assert.ok(second.why.some((w) => /Multiattack Defense/.test(w)), second.why.join(", "));
    // The next turn it attacks as normal.
    turnOf(s, "hero"); turnOf(s, s.m1);
    ok(apply(s, { type: "act", actor: s.m1, action: "multiattack" }, DM));
    const later = attacks(ok(apply(s, { type: "attack", actor: s.m1, target: "hero", attack: "fist" }, DM)))[0];
    assert.ok(!later.why.some((w) => /Multiattack Defense/.test(w)));
    // With Escape the Horde chosen instead, nothing of the kind.
    const t = ready(7, "escape-the-horde", seed, "ape");
    turnOf(t, t.m1);
    ok(apply(t, { type: "act", actor: t.m1, action: "multiattack" }, DM));
    ok(apply(t, { type: "attack", actor: t.m1, target: "hero", attack: "fist" }, DM));
    assert.ok(!attacks(ok(apply(t, { type: "attack", actor: t.m1, target: "hero", attack: "fist" }, DM)))[0].why.some((w) => /Multiattack Defense/.test(w)));
    return;
  }
  assert.fail("no seed");
});

test("Tireless: a Short Rest lowers Exhaustion by 1 from level 10, and the Magic action gives Temporary Hit Points", () => {
  const rest = (level) => {
    const s = field(level), e = s.entities.hero;
    e.cond.exhaustion = { level: 2 };
    ok(apply(s, { type: "shortRest" }, DM));
    return e.cond.exhaustion?.level ?? 0;
  };
  assert.equal(rest(10), 1);
  assert.equal(rest(9), 2);
  const s = field(10), e = s.entities.hero;
  e.cond.exhaustion = { level: 1 };
  ok(apply(s, { type: "shortRest" }, DM));
  assert.equal(e.cond.exhaustion, undefined);
  ok(act(s, { type: "feature", feature: "tireless" }));
  assert.ok(e.tempHp >= 1 + 3 && e.tempHp <= 8 + 3, "1d8 + Wisdom modifier");
  assert.equal(e.uses.tireless, 2);
});

test("Superior Hunter's Prey: the mark's 1d6 Force also hits another creature within 30 feet, once a turn, only on damage to the marked one", () => {
  for (let seed = 1; seed < 200; seed++) {
    const s = ready(11, undefined, seed);
    ok(act(s, { type: "cast", spell: "hunters-mark", target: s.m1 }));
    const probe = structuredClone(s), r0 = act(probe, { type: "attack", target: s.m1, attack: "shortsword", prey: s.m2 });
    if (!r0.ok || !attacks(r0)[0].hit) continue;
    const hp = s.entities[s.m2].hp, r = ok(act(s, { type: "attack", target: s.m1, attack: "shortsword", prey: s.m2 }));
    const d = r.events.find((x) => x.type === "damage" && x.target === s.m2);
    assert.equal(d.dtype, "force");
    assert.equal(d.dice.length, 1); assert.equal(d.dice[0].sides, 6);
    assert.equal(s.entities[s.m2].hp, hp - d.amount);
    // Once a turn: the Extra Attack can't spread it again; the refusal changes nothing.
    let before = structuredClone(s);
    no(act(s, { type: "attack", target: s.m1, attack: "shortsword", prey: s.m2 }), /already used/);
    assert.deepEqual(s, before);
    // An unmarked target, a creature too far, and a ranger below 11: refused.
    const t = ready(11, undefined, seed);
    before = structuredClone(t);
    no(act(t, { type: "attack", target: t.m1, attack: "shortsword", prey: t.m2 }), /not/);
    assert.deepEqual(t, before);
    ok(act(t, { type: "cast", spell: "hunters-mark", target: t.m1 }));
    ok(apply(t, { type: "place", actor: t.m2, to: { q: 9, r: 0 } }, DM));
    no(act(t, { type: "attack", target: t.m1, attack: "shortsword", prey: t.m2 }), /more than 30 ft/);
    const u = ready(10, undefined, seed);
    ok(act(u, { type: "cast", spell: "hunters-mark", target: u.m1 }));
    no(act(u, { type: "attack", target: u.m1, attack: "shortsword", prey: u.m2 }), /can't spread/);
    return;
  }
  assert.fail("no seed");
});

test("Superior Hunter's Prey: no damage to the marked creature (a miss), no spread", () => {
  for (let seed = 1; seed < 200; seed++) {
    const s = ready(11, undefined, seed);
    ok(act(s, { type: "cast", spell: "hunters-mark", target: s.m1 }));
    s.entities[s.m1].ac = 40;
    const r = ok(act(s, { type: "attack", target: s.m1, attack: "shortsword", prey: s.m2 }));
    if (attacks(r)[0].hit) continue;
    assert.ok(!r.events.some((x) => x.type === "damage" && x.target === s.m2));
    assert.ok(!s.encounter.flags[`prey:hero`], "the use is kept for a later hit");
    return;
  }
  assert.fail("no seed");
});

test("Relentless Hunter: damage makes no Concentration save for Hunter's Mark from level 13", () => {
  const hurt = (level) => {
    const s = ready(level);
    ok(act(s, { type: "cast", spell: "hunters-mark", target: s.m1 }));
    const r = ok(apply(s, { type: "harm", actor: "hero", amount: 60 }, DM));
    return { conc: r.events.filter((x) => x.type === "concentration"), going: s.effects.some((fx) => fx.spell === "hunters-mark") };
  };
  const at13 = hurt(13);
  assert.equal(at13.conc.length, 0);
  assert.ok(at13.going);
  assert.equal(hurt(12).conc.length, 1, "below 13 the save is made");
});

test("Nature's Veil: Invisible as a Bonus Action until the end of the ranger's next turn", () => {
  const s = ready(14), e = s.entities.hero;
  ok(act(s, { type: "feature", feature: "natures-veil" }));
  assert.ok(e.cond.invisible);
  assert.equal(e.uses["natures-veil"], 2, "Wisdom modifier uses");
  ok(act(s, { type: "endTurn" }));
  assert.ok(e.cond.invisible, "still Invisible after the turn it was used");
  turnOf(s, "hero");
  ok(act(s, { type: "endTurn" }));
  assert.ok(!e.cond.invisible, "gone at the end of the next turn");
});

test("Superior Hunter's Defense: a Reaction for Resistance to the damage and its type for the rest of the turn", () => {
  const s = ready(15), e = s.entities.hero;
  let r = ok(apply(s, { type: "harm", actor: "hero", amount: 20, dtype: "slashing" }, DM));
  assert.ok(r.events.some((x) => x.type === "reaction" && x.reaction === "superior-hunters-defense"));
  assert.equal(r.events.find((x) => x.type === "damage").amount, 10);
  assert.ok(e.reactionUsed);
  r = ok(apply(s, { type: "harm", actor: "hero", amount: 20, dtype: "slashing" }, DM));
  assert.equal(r.events.find((x) => x.type === "damage").amount, 10, "the same type again this turn");
  r = ok(apply(s, { type: "harm", actor: "hero", amount: 20, dtype: "fire" }, DM));
  assert.equal(r.events.find((x) => x.type === "damage").amount, 20, "another type is not resisted");
  ok(act(s, { type: "endTurn" }));
  r = ok(apply(s, { type: "harm", actor: "hero", amount: 20, dtype: "slashing" }, DM));
  assert.equal(r.events.find((x) => x.type === "damage").amount, 20, "the turn is over and the Reaction spent");
  // Set to never: nothing; below level 15: nothing.
  const t = ready(15);
  ok(act(t, { type: "reactions", set: { "superior-hunters-defense": "never" } }));
  assert.equal(ok(apply(t, { type: "harm", actor: "hero", amount: 20, dtype: "slashing" }, DM)).events.find((x) => x.type === "damage").amount, 20);
  assert.equal(ok(apply(ready(14), { type: "harm", actor: "hero", amount: 20, dtype: "slashing" }, DM)).events.find((x) => x.type === "damage").amount, 20);
});

test("Superior Hunter's Defense: damage of two types at once goes to the DM and spends nothing", () => {
  for (let seed = 1; seed < 300; seed++) {
    const s = ready(15, undefined, seed), e = s.entities.hero;
    // A goblin given a blade with a fire rider: one hit, slashing and fire together.
    const m = s.entities[s.m1];
    m.actions = null; m.attacks = [{ id: "flame-blade", name: "Flame Blade", type: "melee", bonus: 30, damage: "1d6", dtype: "slashing", reach: 5 }];
    m.feats = [{ id: "fire-rider", name: "Fire Rider", tier: "auto", text: "", modifiers: [{ on: "damage.dealt", op: "add", value: 4, types: ["fire"] }] }];
    turnOf(s, s.m1);
    const r = ok(apply(s, { type: "attack", actor: s.m1, target: "hero", attack: "flame-blade" }, DM));
    if (!attacks(r)[0].hit) continue;
    assert.ok(r.events.some((x) => x.type === "manual" && /slashing and fire/.test(x.text)), "the DM is told");
    assert.ok(!e.reactionUsed);
    return;
  }
  assert.fail("no seed");
});
