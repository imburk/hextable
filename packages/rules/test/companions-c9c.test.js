// Companions, stage C9, the rest (#464; docs/specs/companions.md, amendment C9c): Pact of the Chain's forgone attack,
// Investment of the Chain Master, and the Otherworldly Steed's Life Bond. Every rule is from reference/srd52/srd52-flow.txt:
//   Pact of the Chain (16619-16631): "when you take the Attack action, you can forgo one of your own attacks to allow your
//   familiar to make one attack of its own with its Reaction."
//   Investment of the Chain Master (16521-16535): "Aerial or Aquatic. The familiar gains either a Fly Speed or a Swim Speed
//   (your choice) of 40 feet. Quick Attack. As a Bonus Action, you can command the familiar to take the Attack action.
//   Necrotic or Radiant Damage. Whenever the familiar deals Bludgeoning, Piercing, or Slashing damage, you can make it deal
//   Necrotic or Radiant damage instead. Your Save DC. If the familiar forces a creature to make a saving throw, it uses your
//   spell save DC. Resistance. When the familiar takes damage, you can take a Reaction to grant it Resistance against that
//   damage."
//   Otherworldly Steed, Life Bond (26875-26877): "When you regain Hit Points from a level 1+ spell, the steed regains the same
//   number of Hit Points if you're within 5 feet of it."
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { gridOf } from "../src/grid.js";
import { lintPack, lintEntry } from "../src/content/schema.js";
import { PACKS } from "../src/content/index.js";
import { viewEvents, viewPrompt } from "../src/view.js";
import { reactionsOf } from "../src/reactions.js";
import { FT, apart } from "../src/space.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (s) => JSON.stringify(s);
function refused(s, action, ctx, words) {
  const before = json(s), r = apply(s, action, ctx);
  assert.equal(r.ok, false, `${action.type} should be refused`);
  if (words) assert.match(r.error, words);
  assert.equal(json(s), before, "a refused action changes nothing");
  return r;
}
const PACT = "eldritch-invocations-pact-of-the-chain";
const INVEST = "eldritch-invocations-investment-of-the-chain-master";
const warlock = (inv = ["pact-of-the-chain", "investment-of-the-chain-master"]) => ({ name: "Mor", class: "warlock", level: 5, subclass: "fiend",
  abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 18 }, skills: ["arcana", "deception"], weapons: ["dagger"],
  spells: ["eldritch-blast", "chill-touch", "hex"], choices: { "eldritch-invocations": inv } });
const paladin = { name: "Ka", class: "paladin", level: 5, subclass: "devotion", abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 16 },
  skills: ["athletics", "religion"], choices: { "fighting-style": "defense" }, armour: "chain-mail", weapons: ["longsword"], spells: ["cure-wounds"] };

// An open field with one creature built from `sheet` at the centre, played by Pat.
function table(id, sheet, grid) {
  const s = grid ? newGame(7, { grid }) : newGame(7);
  for (const k of Object.keys(s.entities)) delete s.entities[k];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities[id] = makeEntity(derive(sheet).record, { id, kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  ok(apply(s, { type: "claim", entity: id, user: "pat", userName: "Pat" }, PAT));
  return s;
}
// A free space next to `pos` (step `i` of the ring).
const beside = (s, pos, i = 0) => gridOf(s.map).neighbors(pos)[i];
// A monster spawned in the first free space next to `pos`.
// With `also`, a space next to that too.
function spawnBeside(s, monster, pos, also = null) {
  const G = gridOf(s.map);
  for (const h of G.neighbors(pos)) {
    if (also && G.dist(also, h) !== 1) continue;
    const r = apply(s, { type: "spawn", monster, at: h }, DM);
    if (r.ok) return r.events[0].id;
  }
  throw new Error("no room");
}
const familiarOf = (s) => Object.values(s.entities).find((e) => e.bond?.kind === "familiar");
const castFamiliar = (s, form = "imp", invest, ctx = PAT) => {
  const r = ok(apply(s, { type: "cast", actor: "mor", spell: "find-familiar", via: PACT, summon: { form, type: "fiend", at: [beside(s, s.entities.mor.pos, 0)], ...(invest ? { invest } : {}) } }, ctx));
  return { r, f: familiarOf(s) };
};
// Mor, an invested imp beside it and a goblin beside the imp, in a fight on Mor's turn.
function fight(sheet = warlock(), invest = { move: "fly", damage: "radiant" }, form = "imp", grid) {
  const s = table("mor", sheet, grid);
  const { f } = castFamiliar(s, form, invest);
  const g = spawnBeside(s, "goblin-warrior", f.pos, s.entities.mor.pos);
  s.entities[g].hp = s.entities[g].maxHp = 300;                                    // it stays up, and so does the fight
  assert.ok(apart(s, s.entities[g], f) * FT <= 5, "the goblin stands beside the familiar");
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, DM));
  for (let i = 0; i < 20 && current(s) !== "mor"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.equal(current(s), "mor");
  return { s, f: s.entities[f.id], g };
}
const forgo = (f, g, extra = {}) => ({ type: "attack", actor: "mor", familiar: f.id, via: PACT, target: g, attack: "sting", ...extra });
const quick = (f, g, extra = {}) => ({ type: "attack", actor: "mor", familiar: f.id, via: INVEST, target: g, attack: "sting", ...extra });

// ---------- the vocabulary and the entries ----------

test("the class entries: Pact of the Chain and Investment of the Chain Master are auto, with their new keys, and the pack lints clean", () => {
  const doc = PACKS[0].classes.find((c) => c.id === "warlock").features.find((x) => x.id === "eldritch-invocations");
  const pact = doc.options.find((o) => o.id === "pact-of-the-chain"), inv = doc.options.find((o) => o.id === "investment-of-the-chain-master");
  assert.equal(pact.tier, "auto"); assert.deepEqual(pact.grants.forgoAttack, { spell: "find-familiar" });
  assert.equal(inv.tier, "auto");
  assert.deepEqual(inv.grants.invest, { spell: "find-familiar", speed: { feet: 40, of: ["fly", "swim"] }, damage: { from: ["bludgeoning", "piercing", "slashing"], to: ["necrotic", "radiant"] }, saveDc: true, bonusAttack: true, ward: true });
  assert.deepEqual(validate(warlock()), []);
  const feats = derive(warlock()).record.feats;
  assert.deepEqual(feats.find((x) => x.id === PACT).forgoAttack, { spell: "find-familiar" });
  assert.equal(feats.find((x) => x.id === INVEST).invest.ward, true);
  assert.deepEqual(lintPack(PACKS[0]), []);
  const steed = PACKS[0].summons.find((b) => b.id === "otherworldly-steed");
  assert.deepEqual(steed.traits.find((t) => t.id === "life-bond").masterHeal, { within: 5 });
});

test("the linter refuses a malformed forgoAttack, invest or masterHeal", () => {
  const doc = structuredClone(PACKS[0]);
  const opts = doc.classes.find((c) => c.id === "warlock").features.find((x) => x.id === "eldritch-invocations").options;
  const inv = opts.find((o) => o.id === "investment-of-the-chain-master");
  for (const bad of [{ spell: "find-familiar" }, { spell: "find-familiar", speed: { feet: 40, of: ["teleport"] } }, { spell: "find-familiar", saveDc: false },
    { spell: "find-familiar", damage: { from: ["piercing"], to: ["piercing"] } }, { spell: "find-familiar", extra: true }, { speed: { feet: 40, of: ["fly"] } }]) {
    inv.grants.invest = bad;
    assert.ok(lintPack(doc).some((m) => /invest/.test(m)), json(bad));
  }
  inv.grants.invest = { spell: "find-familiar", ward: true };
  opts.find((o) => o.id === "pact-of-the-chain").grants.forgoAttack = { spell: "find-familiar", times: 2 };
  assert.ok(lintPack(doc).some((m) => /forgoAttack/.test(m)));
  const doc2 = structuredClone(PACKS[0]);
  doc2.summons.find((b) => b.id === "otherworldly-steed").traits[0].masterHeal = { within: 7 };
  assert.ok(lintPack(doc2).some((m) => /masterHeal/.test(m)));
});

test("a homebrew feat may not hold invest or forgoAttack", () => {
  for (const grants of [{ invest: { spell: "find-familiar", ward: true } }, { forgoAttack: { spell: "find-familiar" } }]) {
    const feat = { id: "hb-x-chainlink", name: "Chainlink", source: "homebrew:x", category: "general", tier: "auto", checked: false, text: "A familiar thing.", grants };
    const out = lintEntry("feats", feat, { strict: true, homebrew: true, pack: "x" });
    assert.ok(out.some((m) => /cannot change a familiar or let it attack/.test(m)), json(out));
  }
});

// ---------- Investment of the Chain Master: what is baked at the casting ----------

test("Investment (16521-16535): the casting's Fly or Swim 40, damage type and the master's save DC are baked into the familiar", () => {
  const s = table("mor", warlock());
  const { f } = castFamiliar(s, "pseudodragon", { move: "swim", damage: "necrotic" });
  assert.equal(f.speeds.swim, 40, "a Swim Speed of 40 feet");
  assert.equal(f.speeds.fly, 60, "its own Fly Speed stays");
  const bite = f.actions.find((a) => a.id === "bite"), sting = f.actions.find((a) => a.id === "sting");
  assert.equal(bite.effects[0].onHit[0].type, "necrotic", "Piercing becomes Necrotic");
  const dc = 8 + 3 + 4;                                                       // proficiency 3 at level 5, Charisma 18
  assert.equal(sting.effects[0].dc, dc, "the master's spell save DC");
  assert.equal(sting.effects[0].onFail[0].type, "poison", "a type that is not Bludgeoning, Piercing or Slashing stays");
  // A faster Speed it has is kept: the hawk-like pseudodragon flies 60 and Fly 40 does not slow it.
  const s2 = table("mor", warlock());
  const { f: p2 } = castFamiliar(s2, "pseudodragon", { move: "fly" });
  assert.equal(p2.speeds.fly, 60);
  assert.equal(p2.actions.find((a) => a.id === "bite").effects[0].onHit[0].type, "piercing", "no damage choice: Piercing stays");
  // A new casting reforms the familiar with the new casting's choices.
  ok(apply(s, { type: "cast", actor: "mor", spell: "find-familiar", via: PACT, summon: { form: "imp", type: "fiend", invest: { move: "fly", damage: "radiant" } } }, PAT));
  const imp = familiarOf(s);
  assert.equal(imp.id, f.id); assert.equal(imp.tpl, "imp");
  assert.equal(imp.speeds.swim, undefined); assert.equal(imp.speeds.fly, 40);
  assert.deepEqual(imp.actions.find((a) => a.id === "sting").effects[0].onHit.map((x) => x.type), ["radiant", "poison"]);
});

test("Investment: the choices are refused when wrong or from a caster without it, and nothing changes", () => {
  const s = table("mor", warlock());
  const at = [beside(s, s.entities.mor.pos, 0)];
  const cast = (invest) => ({ type: "cast", actor: "mor", spell: "find-familiar", via: PACT, summon: { form: "imp", type: "fiend", at, invest } });
  refused(s, cast({ move: "burrow" }), PAT, /fly or swim/);
  refused(s, cast({}), PAT, /fly or swim/);
  refused(s, cast({ move: "fly", damage: "fire" }), PAT, /necrotic or radiant/);
  refused(s, cast({ move: "fly", extra: 1 }), PAT, /move, damage/);
  refused(s, cast("fly"), PAT, /move, damage/);
  const plain = table("mor", warlock(["pact-of-the-chain"]));
  refused(plain, { type: "cast", actor: "mor", spell: "find-familiar", via: PACT, summon: { form: "imp", type: "fiend", at: [beside(plain, plain.entities.mor.pos, 0)], invest: { move: "fly" } } }, PAT, /nothing that invests/);
});

test("Investment: a cast without the choices makes the plain familiar and tells the DM what was left out", () => {
  const s = table("mor", warlock());
  const { r, f } = castFamiliar(s, "imp");
  assert.equal(f.speeds.swim, undefined);
  assert.equal(f.actions.find((a) => a.id === "sting").effects[0].onHit[0].type, "piercing");
  const m = r.events.find((e) => e.type === "manual" && /Investment of the Chain Master/.test(e.name));
  assert.ok(m && /fly or swim Speed of 40 feet/.test(m.text) && /spell save DC \(15\)/.test(m.text), m?.text);
});

// ---------- Pact of the Chain: the forgone attack ----------

test("Pact of the Chain (16627-16631): Mor gives up the Attack action's attack and the familiar attacks with its Reaction", () => {
  const { s, f, g } = fight();
  const b = s.encounter.budget, action = b.action, bonus = b.bonus;
  const r = ok(apply(s, forgo(f, g), PAT));
  assert.equal(s.encounter.budget.action, action - 1, "the Attack action is taken");
  assert.equal(s.encounter.budget.bonus, bonus, "no Bonus Action");
  assert.equal(s.encounter.budget.attacks, undefined, "a level 5 warlock has one attack, and it went to the familiar");
  assert.equal(s.entities[f.id].reactionUsed, true, "the familiar's Reaction is spent");
  assert.equal(s.entities.mor.reactionUsed, false, "not the master's");
  const atk = r.events.find((e) => e.type === "attack");
  assert.equal(atk.actor, f.id); assert.equal(atk.target, g);
  for (const d of r.events.filter((e) => e.type === "damage" && e.target === g)) assert.ok(["radiant", "poison"].includes(d.dtype), `the invested damage type: ${d.dtype}`);
  assert.ok(r.events.some((e) => e.type === "note" && /gives up an attack/.test(e.text)));
  // Once a round: its Reaction is gone, and Mor has no attack left to give.
  refused(s, forgo(f, g), PAT, /Reaction|no attack/);
});

test("the forgone attack: with Extra Attack left in the pool, one of those is spent; the action itself is not spent twice", () => {
  const { s, f, g } = fight();
  const mor = s.entities.mor;
  mor.features = { ...(mor.features ?? {}), extraAttack: 1 };                 // as Thirsting Blade gives (for the test)
  ok(apply(s, { type: "attack", actor: "mor", target: g, attack: "dagger" }, PAT));
  const action = s.encounter.budget.action;
  assert.equal(s.encounter.budget.attacks[0][0].left, 1, "one more attack of the Attack action");
  ok(apply(s, forgo(f, g), PAT));
  assert.equal(s.encounter.budget.action, action, "spent from the pool, not a new action");
  assert.equal(s.encounter.budget.attacks, undefined);
});

test("the forgone attack is refused, changing nothing: not Mor's turn, no action, another's familiar, a non-attack action, out of reach, no fight", () => {
  const { s, f, g } = fight();
  refused(s, forgo(f, g, { attack: "invisibility" }), PAT, /no such attack/);
  refused(s, forgo(f, g, { via: "pact-of-the-blade" }), PAT, /Say which feature/);
  refused(s, forgo(f, g, { via: undefined }), PAT, /Say which feature/);
  refused(s, forgo(f, g, { familiar: g }), PAT, /not Mor's familiar/);
  refused(s, forgo(f, g, { familiar: "m999" }), PAT, /No such creature/);
  refused(s, forgo(f, g, { brutal: "x" }), PAT, /not for a familiar/);
  // Out of the sting's reach: the goblin steps away.
  const far = structuredClone(s);
  far.entities[g].pos = { q: 5, r: -2, z: 0 };
  refused(far, forgo(f, g), PAT, /reaches|away/);
  // Its action spent on something else first.
  const used = structuredClone(s);
  used.encounter.budget.action = 0;
  refused(used, forgo(f, g), PAT, /no attack of the Attack action left/);
  // Not Mor's turn.
  ok(apply(s, { type: "endTurn", actor: "mor" }, PAT));
  refused(s, forgo(f, g), PAT, /turn/);
  // No fight.
  const calm = table("mor", warlock());
  const { f: f2 } = castFamiliar(calm, "imp", { move: "fly" });
  const g2 = spawnBeside(calm, "goblin-warrior", f2.pos);
  refused(calm, forgo(f2, g2), PAT, /works in a fight/);
  // A warlock without the pact (a DM-bonded familiar, say) has no such feature.
});

test("the familiar still can't attack on its own: only through the master's features", () => {
  const { s, f, g } = fight();
  for (let i = 0; i < 20 && current(s) !== f.id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.equal(current(s), f.id);
  refused(s, { type: "attack", actor: f.id, target: g, attack: "sting" }, PAT, /can't attack/);
});

// ---------- Investment: Quick Attack ----------

test("Quick Attack: Mor's Bonus Action commands the familiar to take the Attack action, one attack at once, its Reaction kept", () => {
  const { s, f, g } = fight();
  const b = s.encounter.budget, action = b.action, bonus = b.bonus;
  const r = ok(apply(s, quick(f, g), PAT));
  assert.equal(s.encounter.budget.bonus, bonus - 1, "the Bonus Action");
  assert.equal(s.encounter.budget.action, action, "not the action");
  assert.equal(s.entities[f.id].reactionUsed, false, "not the familiar's Reaction");
  assert.equal(r.events.find((e) => e.type === "attack").actor, f.id);
  refused(s, quick(f, g), PAT, /Bonus Action/);
  // The pact's forgone attack is still open, with the action and the familiar's Reaction.
  ok(apply(s, forgo(f, g), PAT));
});

test("Quick Attack needs the invocation; Pact of the Chain alone has none", () => {
  const { s, f, g } = fight(warlock(["pact-of-the-chain"]), null);
  refused(s, quick(f, g), PAT, /Say which feature/);
});

test("players are told nothing of a foe master's familiar attack beyond the attack itself", () => {
  const { s, f, g } = fight();
  for (const id of ["mor", f.id]) s.entities[id].side = "foe";
  s.entities[g].side = "party";
  const r = ok(apply(s, forgo(f, g), DM));
  const seen = viewEvents(r.events, s, PAT);
  assert.ok(!seen.some((e) => e.type === "note"), "no note naming the pact");
  assert.ok(!json(seen).includes("Pact of the Chain"));
});

// ---------- Investment: the Reaction that gives Resistance ----------

test("Investment's Resistance: when the familiar takes damage Mor's Reaction halves it (always, by default)", () => {
  const { s, f } = fight();
  const hp = f.hp;
  assert.ok(reactionsOf(s.entities.mor).some((x) => x.id === INVEST && x.on === "familiarDamaged" && x.dflt === "always"));
  const r = ok(apply(s, { type: "harm", actor: f.id, amount: 10, dtype: "acid" }, DM));
  assert.equal(s.entities[f.id].hp, hp - 5, "Resistance: 10 acid becomes 5");
  assert.equal(s.entities.mor.reactionUsed, true, "Mor's Reaction is spent");
  assert.ok(r.events.some((e) => e.type === "reaction" && e.id === "mor" && e.reaction === INVEST && e.for === f.id));
  // Mor has no Reaction left: the next damage is whole.
  ok(apply(s, { type: "harm", actor: f.id, amount: 4, dtype: "acid" }, DM));
  assert.equal(s.entities[f.id].hp, hp - 9);
});

test("Investment's Resistance: never by instruction; not spent on damage it already resists or is immune to", () => {
  const { s, f } = fight();
  ok(apply(s, { type: "harm", actor: f.id, amount: 6, dtype: "fire" }, DM));
  assert.equal(s.entities.mor.reactionUsed, false, "an imp is immune to Fire: nothing to resist, the Reaction is kept");
  ok(apply(s, { type: "reactions", actor: "mor", set: { [INVEST]: "never" } }, PAT));
  const hp = s.entities[f.id].hp;
  ok(apply(s, { type: "harm", actor: f.id, amount: 6, dtype: "acid" }, DM));
  assert.equal(s.entities[f.id].hp, hp - 6);
  assert.equal(s.entities.mor.reactionUsed, false);
});

test("Investment's Resistance: `ask` asks Mor's player; the answer decides", () => {
  for (const take of [INVEST, null]) {
    const { s, f } = fight();
    ok(apply(s, { type: "reactions", actor: "mor", set: { [INVEST]: "ask" } }, PAT));
    const hp = s.entities[f.id].hp;
    const r = apply(s, { type: "harm", actor: f.id, amount: 10, dtype: "acid" }, DM);
    assert.ok(s.pending, "the damage waits for Mor's answer");
    const q = viewPrompt(s, PAT);
    assert.equal(q.reactor, "mor"); assert.equal(q.trigger, "familiarDamaged"); assert.equal(q.dtype, "acid");
    assert.equal(q.options[0].reaction, INVEST);
    ok(apply(s, { type: "react", prompt: q.n, take }, PAT));
    assert.equal(s.entities[f.id].hp, hp - (take ? 5 : 10));
    assert.equal(s.entities.mor.reactionUsed, !!take);
    void r;
  }
});

test("Investment's Resistance is for the master's own familiar only", () => {
  const { s, f, g } = fight();
  const hp = s.entities[g].hp;
  ok(apply(s, { type: "harm", actor: g, amount: 4, dtype: "acid" }, DM));
  assert.equal(s.entities[g].hp, Math.max(0, hp - 4));
  assert.equal(s.entities.mor.reactionUsed, false);
  void f;
});

// ---------- Life Bond ----------

function steedField() {
  const s = table("ka", paladin);
  const at = beside(s, s.entities.ka.pos, 0);
  ok(apply(s, { type: "cast", actor: "ka", spell: "find-steed", via: "faithful-steed", summon: { type: "celestial", at: [at] } }, PAT));
  const st = Object.values(s.entities).find((e) => e.bond?.kind === "steed");
  return { s, st };
}

test("Life Bond (26875-26877): Ka regains Hit Points from Cure Wounds within 5 feet, and the steed regains the same number", () => {
  const { s, st } = steedField();
  const ka = s.entities.ka;
  ka.hp = 10; s.entities[st.id].hp = 5;
  const r = ok(apply(s, { type: "cast", actor: "ka", spell: "cure-wounds", slot: 1, target: "ka" }, PAT));
  const gained = r.events.find((e) => e.type === "heal" && e.target === "ka").hp - 10;
  assert.ok(gained > 0);
  assert.equal(s.entities[st.id].hp, Math.min(s.entities[st.id].maxHp, 5 + gained), "the same number");
  assert.ok(r.events.some((e) => e.type === "heal" && e.target === st.id && e.amount === gained));
  assert.ok(r.events.some((e) => e.type === "note" && /Life Bond/.test(e.text)));
});

test("Life Bond: what Ka regains is what counts (capped at its maximum); nothing past 5 feet, from a non-spell, or when nothing is regained", () => {
  const { s, st } = steedField();
  const ka = s.entities.ka, steed = s.entities[st.id];
  // Two Hit Points short of full: the steed regains two, whatever was rolled.
  ka.hp = ka.maxHp - 2; steed.hp = 5;
  ok(apply(s, { type: "cast", actor: "ka", spell: "cure-wounds", slot: 1, target: "ka" }, PAT));
  assert.equal(steed.hp, 7);
  // At full: nothing regained, nothing shared.
  ok(apply(s, { type: "rest", kind: "long" }, DM));
  const st2 = s.entities[st.id];
  st2.hp = 5;
  ok(apply(s, { type: "cast", actor: "ka", spell: "cure-wounds", slot: 1, target: "ka" }, PAT));
  assert.equal(st2.hp, 5);
  // The DM's healing is not a spell.
  ka.hp = 10;
  ok(apply(s, { type: "mend", actor: "ka", amount: 5 }, DM));
  assert.equal(st2.hp, 5);
  // Farther than 5 feet.
  st2.pos = { q: 4, r: 0, z: 0 };
  assert.ok(apart(s, ka, st2) * FT > 5);
  ka.hp = 10;
  ok(apply(s, { type: "cast", actor: "ka", spell: "cure-wounds", slot: 1, target: "ka" }, PAT));
  assert.equal(st2.hp, 5);
});

test("Life Bond: only the caster's own healing counts, not the steed's other creatures' (a wolf the DM bonded has no Life Bond)", () => {
  const { s, st } = steedField();
  const wolf = spawnBeside(s, "wolf", s.entities.ka.pos);
  ok(apply(s, { type: "bond", actor: wolf, to: "ka" }, DM));
  s.entities[wolf].hp = 3; s.entities.ka.hp = 10; s.entities[st.id].hp = 5;
  ok(apply(s, { type: "cast", actor: "ka", spell: "cure-wounds", slot: 1, target: "ka" }, PAT));
  assert.equal(s.entities[wolf].hp, 3, "no Life Bond on a wolf");
  assert.ok(s.entities[st.id].hp > 5);
});

test("Find Steed's entry no longer leaves Life Bond to the DM", () => {
  const fs = PACKS[0].spells.find((x) => x.id === "find-steed");
  assert.ok(!/DM handles Life Bond/.test(fs.text));
  assert.equal(fs.tier, "assist", "the steed protecting its rider and its look are still the DM's");
});
