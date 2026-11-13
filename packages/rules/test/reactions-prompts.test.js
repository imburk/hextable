// Reactions, part 2 (docs/specs/rules-expansion.md, Decision 4, stage B): an action stops to ask a
// player about a reaction and carries on with the answer, replaying exactly; Counterspell and
// Hellish Rebuke by instruction or answer; a monster's Parry; and what other players are never sent.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current } from "../src/engine.js";
import { aiStep } from "../src/ai.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { diff, snapshot } from "../src/patch.js";
import { migrate, VERSION } from "../src/migrate.js";
import { reactionsOf } from "../src/reactions.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents, viewPrompt } from "../src/view.js";
import { lintPack } from "../src/content/schema.js";

const PACK = { id: "t", name: "T", license: "CC-BY-4.0", attribution: "t" };
const lintEntry = (kind, e) => lintPack({ pack: PACK, [kind === "spell" ? "spells" : "monsters"]: [e] });

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" }, KIM = { role: "player", userId: "kim" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); };

// The wizard (Pat's), the fighter (Kim's) and one goblin beside the wizard.
function field(seed = 7) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (!["wizard", "fighter", "m1"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.wizard.spells.push("shield");
  ok(apply(s, { type: "claim", entity: "wizard", user: "pat", userName: "Pat" }, PAT));
  ok(apply(s, { type: "claim", entity: "fighter", user: "kim", userName: "Kim" }, KIM));
  ok(apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "m1", to: { q: 1, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "fighter", to: { q: -3, r: 0 } }, DM));
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 500;
  return s;
}
// A hostile spellcaster the DM runs: a copy of the wizard on the other side.
function foeWizard(s, at = { q: 3, r: 0, z: 0 }, extra = {}) {
  const foe = s.entities.foe = structuredClone(s.entities.wizard);
  delete foe.owner; delete foe.reactions;
  Object.assign(foe, { id: "foe", name: "Foe", side: "foe", kind: "npc", pos: at, reactionUsed: false, ...extra });
  return foe;
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 20 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const swing = (s, target = "wizard") => { s.encounter.budget.action = 1; return apply(s, { type: "act", actor: "m1", action: "scimitar", target }, DM); };
const scimitar = (s) => s.entities.m1.actions.find((a) => a.id === "scimitar").effects[0];
const set = (s, actor, x, ctx = DM) => ok(apply(s, { type: "reactions", actor, set: x }, ctx));
const react = (s, x, ctx = PAT) => apply(s, { type: "react", prompt: s.pending?.n, ...x }, ctx);
// The game without what differs only in how it got there: the instructions, the record, the count of questions.
const game = (s) => { const c = structuredClone({ ...s, timeline: null, asked: null }); for (const e of Object.values(c.entities)) delete e.reactions; return JSON.stringify(c); };

// A goblin about to hit the wizard, who has Shield set to `w`.
function shieldUp(w, seed = 7) {
  const s = field(seed);
  set(s, "wizard", { shield: w }, PAT);
  scimitar(s).bonus = 40;
  fight(s); turnOf(s, "m1");
  return s;
}

// ---------- the prompt ----------

test("an action stops to ask a player, changes nothing while it waits, and carries on with the answer", () => {
  const s = shieldUp("ask");
  const before = JSON.stringify({ ...s, timeline: null, asked: null });
  const r = ok(swing(s));
  assert.deepEqual(r.events.map((e) => e.type), ["reactionAsked"]);
  assert.ok(s.pending, "the action waits in the game state");
  assert.equal(JSON.stringify({ ...s, timeline: null, asked: null, pending: undefined }), before.replace(/"budget":\{"move":(\d+),"action":0/, '"budget":{"move":$1,"action":1'), "nothing else changed, the dice seed included");
  // Pat is asked, with the roll and the option; Kim only knows the table waits.
  const q = view(s, PAT).prompt;
  assert.equal(q.reactor, "wizard");
  assert.equal(q.trigger, "hit");
  assert.equal(q.by, "m1");
  assert.deepEqual(q.options, [{ reaction: "shield", name: "Shield", slots: [1], ac: 5 }]);
  assert.ok(Number.isInteger(q.total) && Number.isInteger(q.ac));
  assert.deepEqual(view(s, KIM).prompt, { waiting: true });
  assert.equal(viewPrompt(s, DM).action.type, "act");
  // While it waits, nothing that could change how it comes out: not the turn, a move, an
  // instruction, nor the AI.
  const held = JSON.stringify(s);
  no(apply(s, { type: "endTurn", actor: "m1" }, DM), /waiting for a reaction/);
  no(apply(s, { type: "move", actor: "m1", to: { q: 2, r: 0 } }, DM), /waiting/);
  no(apply(s, { type: "reactions", actor: "wizard", set: { shield: "always" } }, PAT), /waiting/);
  assert.equal(aiStep(s, "m1"), null, "the monster AI does not act on a waiting table");
  assert.equal(JSON.stringify(s), held);
  ok(apply(s, { type: "say", as: null, text: "Hold on." }, KIM));          // talk goes on
  // Pat takes Shield: the attack resolves with it.
  const done = ok(react(s, { take: "shield" }));
  assert.equal(s.pending, undefined);
  const types = done.events.map((e) => e.type);
  assert.ok(types.indexOf("reaction") < types.indexOf("attack"));
  assert.equal(done.events.find((e) => e.type === "attack").ac, s.entities.wizard.ac + 5);
  assert.equal(s.entities.wizard.slots[1], 1);
  assert.equal(s.entities.wizard.reactionUsed, true);
  assert.equal(s.stack, undefined);
});

test("asking is replay-exact: take is the same game as 'always', decline the same as 'never'", () => {
  for (const seed of [1, 2, 3]) {
    const always = shieldUp("always", seed), never = shieldUp("never", seed);
    ok(swing(always)); ok(swing(never));
    const take = shieldUp("ask", seed), skip = shieldUp("ask", seed);
    ok(swing(take)); ok(react(take, { take: "shield" }));
    ok(swing(skip)); ok(react(skip, { take: null }));
    assert.equal(game(take), game(always), `seed ${seed}: taken`);
    assert.equal(game(skip), game(never), `seed ${seed}: declined`);
  }
});

test("only the reacting creature's controller or the DM answers, and a rejected answer changes nothing", () => {
  const s = shieldUp("ask");
  ok(swing(s));
  const n = s.pending.n, held = JSON.stringify(s);
  no(react(s, { take: "shield" }, KIM), /isn't yours/);
  no(apply(s, { type: "react", prompt: n + 1, take: "shield" }, PAT), /already been answered/);
  no(apply(s, { type: "react", take: "shield" }, PAT), /already been answered/);
  no(react(s, { take: "counterspell" }), /can't answer with that/);
  no(react(s, { take: "shield", slot: 2 }), /level 1 slot/);
  no(react(s, { take: null, slot: 1 }), /only with a reaction/);
  no(react(s, { take: "opportunity-attack" }), /can't answer/);
  assert.equal(JSON.stringify(s), held, "every refusal left the game as it was");
  // The DM overrides: declining for Pat carries the action on.
  const r = ok(react(s, { take: null }, DM));
  assert.ok(r.events.some((e) => e.type === "attack"));
  assert.ok(!r.events.some((e) => e.type === "reaction"));
  assert.equal(r.events.find((e) => e.type === "reactionAnswered").by, "dm");
  // Nothing waits now: an answer is refused, and changes nothing.
  const after = JSON.stringify(s);
  no(apply(s, { type: "react", prompt: n, take: null }, PAT), /No reaction is waiting/);
  assert.equal(JSON.stringify(s), after);
});

test("the DM's own creatures are never waited on: 'ask' tells the DM, and the AI plays on", () => {
  const s = field();
  const foe = foeWizard(s, { q: -1, r: 0, z: 0 }, { reactions: { shield: "ask" } });
  foe.ac = 1;
  s.entities.fighter.attacks[0].bonus = 40;
  ok(apply(s, { type: "place", actor: "fighter", to: { q: -2, r: 0 } }, DM));
  fight(s); turnOf(s, "fighter");
  const r = ok(apply(s, { type: "attack", actor: "fighter", target: "foe", attack: s.entities.fighter.attacks[0].id }, KIM));
  assert.equal(s.pending, undefined);
  assert.ok(r.events.some((e) => e.type === "manual" && e.partial && e.actor === "foe" && /ask the DM/.test(e.text)));
  assert.ok(!viewEvents(r.events, s, KIM).some((e) => e.type === "manual"));
});

test("the Opportunity Attack set to 'ask' asks the player as the enemy walks away", () => {
  const s = field();
  ok(apply(s, { type: "place", actor: "fighter", to: { q: 1, r: 1 } }, DM));           // beside the goblin
  set(s, "fighter", { "opportunity-attack": "ask" }, KIM);
  fight(s); turnOf(s, "m1");
  const r = ok(apply(s, { type: "move", actor: "m1", to: { q: 4, r: -1 } }, DM));
  assert.deepEqual(r.events.map((e) => e.type), ["reactionAsked"]);
  assert.equal(s.entities.m1.pos.q, 1, "it has not moved yet");
  const q = view(s, KIM).prompt;
  assert.deepEqual([q.trigger, q.by, q.options.map((o) => o.reaction)], ["leave", "m1", ["opportunity-attack"]]);
  assert.deepEqual(view(s, PAT).prompt, { waiting: true });
  const done = ok(react(s, { take: "opportunity-attack" }, KIM));
  assert.ok(done.events.some((e) => e.type === "attack" && e.actor === "fighter" && e.opportunity));
  assert.ok(done.events.some((e) => e.type === "moved" && e.id === "m1"));
  assert.equal(s.entities.fighter.reactionUsed, true);
});

// ---------- Counterspell ----------

// Pat's wizard casts Magic Missile at a foe wizard who knows Counterspell.
function counterTable(w, extra = {}) {
  const s = field();
  s.entities.wizard.slots[3] = 1;
  const foe = foeWizard(s, { q: 4, r: 0, z: 0 }, extra);
  foe.spells.push("counterspell");
  foe.slots[3] = 2;
  if (w) foe.reactions = { counterspell: w };
  fight(s); turnOf(s, "wizard");
  return s;
}
const missile = (s) => apply(s, { type: "cast", actor: "wizard", spell: "magic-missile", targets: ["foe"] }, PAT);

test("Counterspell: a Constitution save by the caster; on a failure the spell is lost, its action wasted, its slot kept", () => {
  let countered = 0, saved = 0;
  for (let seed = 1; seed <= 30 && (!countered || !saved); seed++) {
    const s = counterTable("always");
    s.rng = seed * 7919;
    const slots = s.entities.wizard.slots[1];
    const r = ok(missile(s));
    const save = r.events.find((e) => e.type === "save" && e.id === "wizard" && e.abil === "con");
    assert.ok(save, "the caster saves");
    assert.ok(r.events.some((e) => e.type === "reaction" && e.id === "foe" && e.reaction === "counterspell" && e.trigger === "cast" && e.against === "wizard"));
    assert.equal(s.entities.foe.slots[3], 1, "Counterspell spends its own slot, success or not");
    assert.equal(s.entities.foe.reactionUsed, true);
    assert.equal(s.encounter.budget.action, 0, "the action is spent either way");
    if (!save.success) {
      countered++;
      assert.ok(r.events.some((e) => e.type === "countered" && e.id === "wizard" && e.by === "foe"));
      assert.ok(!r.events.some((e) => e.type === "damage" && e.target === "foe"));
      assert.equal(s.entities.wizard.slots[1], slots, "the slot is not expended");
      assert.ok(!s.encounter.flags.slot, "and is not the one slot this turn");
    } else {
      saved++;
      assert.ok(r.events.some((e) => e.type === "damage" && e.target === "foe"));
      assert.equal(s.entities.wizard.slots[1], slots - 1);
    }
  }
  assert.ok(countered && saved, `both outcomes seen (${countered} countered, ${saved} saved)`);
});

test("Counterspell needs the caster in sight, within 60 feet, a level 3 slot and the Reaction; 'never' by default", () => {
  const cases = {
    dflt: (s) => { delete s.entities.foe.reactions; },
    far: (s) => { s.entities.foe.pos = { q: 13, r: 0, z: 0 }; },
    blind: (s) => { s.entities.foe.cond.blinded = {}; },
    noSlot: (s) => { s.entities.foe.slots[3] = 0; },
    spent: (s) => { s.entities.foe.reactionUsed = true; },
  };
  for (const [name, change] of Object.entries(cases)) {
    const s = counterTable("always");
    change(s);
    const r = ok(missile(s));
    assert.ok(!r.events.some((e) => e.type === "reaction" || e.type === "countered"), name);
  }
});

test("Counterspell asked of a player: who is casting, never what; their slot choice is spent", () => {
  const s = field();
  const foe = foeWizard(s, { q: 4, r: 0, z: 0 });
  s.entities.wizard.spells.push("counterspell");
  s.entities.wizard.slots[3] = 1; s.entities.wizard.slots[4] = 1;
  set(s, "wizard", { counterspell: "ask" }, PAT);
  foe.ac = 1;
  fight(s); turnOf(s, "foe");
  const before = JSON.stringify({ ...s, timeline: null, asked: null });
  ok(apply(s, { type: "cast", actor: "foe", spell: "magic-missile", targets: ["wizard"] }, DM));
  assert.equal(JSON.stringify({ ...s, timeline: null, asked: null, pending: undefined }), before);
  const q = view(s, PAT).prompt;
  assert.deepEqual(q, { n: s.pending.n, reactor: "wizard", trigger: "cast", options: [{ reaction: "counterspell", name: "Counterspell", slots: [3, 4] }], by: "foe" });
  assert.ok(!JSON.stringify(view(s, PAT).prompt).includes("magic"), "the spell being cast is not named");
  assert.ok(!JSON.stringify(view(s, PAT).entities.foe ?? {}).includes("pending"));
  assert.ok(!JSON.stringify(viewEvents(s.timeline.slice(-1), s, PAT)).includes("magic"));
  const r = ok(react(s, { take: "counterspell", slot: 4 }));
  assert.equal(s.entities.wizard.slots[4], 0);
  assert.equal(s.entities.wizard.slots[3], 1);
  assert.ok(r.events.some((e) => e.type === "cast" && e.spell === "counterspell" && e.slot === 4));
});

test("a countered spell is named to players only if it was theirs, and its history label says whose", () => {
  const s = counterTable("always", {});
  s.entities.foe.abil.int = 30;                                          // a DC the wizard will fail
  const before = mark(s);
  const r = ok(missile(s));
  assert.ok(r.events.some((e) => e.type === "countered"));
  const step = describeStep({ type: "cast", actor: "wizard", spell: "magic-missile", targets: ["foe"] }, r.events, before, s);
  assert.equal(step.label, "Wizard's Magic Missile was countered".replace("Wizard", s.entities.wizard.name));
  assert.equal(step.shown, `${s.entities.wizard.name}'s spell was countered`);
  // Their own spell: Kim may see which it was. A foe's countered spell is not named to them.
  assert.equal(viewEvents(r.events, s, KIM).find((e) => e.type === "countered").name, "Magic Missile");
  const t = field();
  const foe = foeWizard(t, { q: 4, r: 0, z: 0 });
  t.entities.fighter.spells = ["counterspell"]; t.entities.fighter.slots = { 3: 1 }; t.entities.fighter.abil.int = 30; t.entities.fighter.castAbil = "int";
  t.entities.fighter.reactions = { counterspell: "always" };
  ok(apply(t, { type: "place", actor: "fighter", to: { q: 2, r: 1 } }, DM));
  foe.ac = 1;
  fight(t); turnOf(t, "foe");
  const r2 = ok(apply(t, { type: "cast", actor: "foe", spell: "magic-missile", targets: ["wizard"] }, DM));
  const c = viewEvents(r2.events, t, PAT).find((e) => e.type === "countered");
  assert.deepEqual(c, { type: "countered", id: "foe", by: "fighter" });
});

// ---------- Hellish Rebuke ----------

function rebukeTable(w) {
  const s = field();
  const wz = s.entities.wizard;
  wz.spells.push("hellish-rebuke");
  wz.slots = { 1: 2, 2: 1 };
  set(s, "wizard", { "hellish-rebuke": w }, PAT);
  scimitar(s).bonus = 40;
  fight(s); turnOf(s, "m1");
  return s;
}

test("Hellish Rebuke: taking damage from a creature it can see; the attacker saves or takes fire", () => {
  const s = rebukeTable("always");
  const r = ok(swing(s));
  const i = r.events.findIndex((e) => e.type === "damage" && e.target === "wizard");
  const re = r.events.findIndex((e) => e.type === "reaction" && e.reaction === "hellish-rebuke");
  assert.ok(i >= 0 && re > i, "after the damage it answers");
  assert.ok(r.events.some((e) => e.type === "save" && e.id === "m1" && e.abil === "dex"));
  assert.ok(r.events.slice(re).some((e) => e.type === "damage" && e.target === "m1" && e.dtype === "fire"));
  assert.equal(s.entities.wizard.slots[1], 1);
  assert.equal(s.entities.wizard.reactionUsed, true);
  // Not when it cannot see who hurt it, nor at all by default.
  const b = rebukeTable("always");
  ok(apply(b, { type: "condition", actor: "wizard", condition: "blinded", on: true }, DM));
  assert.ok(!ok(swing(b)).events.some((e) => e.type === "reaction"));
  const d = field(); d.entities.wizard.spells.push("hellish-rebuke");
  assert.equal(reactionsOf(d.entities.wizard).find((x) => x.id === "hellish-rebuke").dflt, "never");
});

test("Hellish Rebuke asked of a player: they pick the slot, and a higher one adds 1d10", () => {
  const s = rebukeTable("ask");
  ok(swing(s));
  const q = view(s, PAT).prompt;
  assert.deepEqual([q.trigger, q.by, q.options[0].slots], ["damaged", "m1", [1, 2]]);
  const r = ok(react(s, { take: "hellish-rebuke", slot: 2 }));
  assert.equal(s.entities.wizard.slots[2], 0);
  assert.equal(s.entities.wizard.slots[1], 2);
  const fire = r.events.find((e) => e.type === "damage" && e.target === "m1");
  const save = r.events.find((e) => e.type === "save" && e.id === "m1");
  assert.equal(fire.dice.length, 3, "3d10 at level 2");
  if (save.success) assert.equal(fire.amount, Math.floor((fire.rolled ?? fire.amount * 2) / 2));
});

// ---------- monster reactions (DEBT M3) ----------

test("a monster's Parry adds to its AC against a melee hit, by default only when that makes it miss", () => {
  let parried = 0, through = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const s = field(seed);
    ok(apply(s, { type: "spawn", monster: "bandit-captain", at: { q: -2, r: 0 } }, DM));
    const cap = Object.values(s.entities).find((e) => e.tpl === "bandit-captain");
    assert.deepEqual(reactionsOf(cap).map((r) => [r.id, r.dflt]), [["opportunity-attack", "always"], ["parry", "miss"]]);
    const f = s.entities.fighter;
    f.attacks[0].bonus = 0;
    cap.ac = 10;
    fight(s); turnOf(s, "fighter");
    const r = ok(apply(s, { type: "attack", actor: "fighter", target: cap.id, attack: f.attacks[0].id }, KIM));
    const atk = r.events.find((e) => e.type === "attack"), took = r.events.some((e) => e.type === "reaction" && e.reaction === "parry");
    const wouldHit = atk.nat !== 1 && (atk.nat === 20 || atk.total >= 10);
    assert.equal(took, wouldHit && atk.nat !== 20 && atk.total < 12, `seed ${seed}`);
    if (took) { parried++; assert.equal(atk.ac, 12); assert.equal(atk.hit, false); assert.equal(cap.reactionUsed, true); }
    else if (wouldHit) through++;
  }
  assert.ok(parried && through, `both seen (${parried}, ${through})`);
});

test("Riposte and Whirlwind of Sand add their AC and hand the rest to the DM; the monster entries pass the linter", async () => {
  const { CONTENT } = await import("../src/content/index.js");
  const wired = Object.values(CONTENT.monsters).filter((m) => m.traits.some((t) => t.reaction)).map((m) => m.id).sort();
  assert.deepEqual(wired, ["bandit-captain", "erinyes", "gladiator", "knight", "marilith", "mummy-lord", "noble", "pirate-captain", "warrior-veteran"]);
  for (const id of wired) assert.deepEqual(lintEntry("monster", CONTENT.monsters[id]), [], id);
  const s = field();
  ok(apply(s, { type: "spawn", monster: "pirate-captain", at: { q: -2, r: 0 } }, DM));
  const pc = Object.values(s.entities).find((e) => e.tpl === "pirate-captain");
  pc.reactions = { riposte: "always" };
  s.entities.fighter.attacks[0].bonus = 40;
  fight(s); turnOf(s, "fighter");
  const r = ok(apply(s, { type: "attack", actor: "fighter", target: pc.id, attack: s.entities.fighter.attacks[0].id }, KIM));
  assert.ok(r.events.some((e) => e.type === "reaction" && e.reaction === "riposte"));
  assert.ok(r.events.some((e) => e.type === "manual" && e.partial && /Rapier/.test(e.text)));
  assert.ok(!viewEvents(r.events, s, KIM).some((e) => e.type === "manual"));
  // Parry is for melee only: a ranged attack is not parried.
  const t = field();
  ok(apply(t, { type: "spawn", monster: "knight", at: { q: -2, r: 0 } }, DM));
  const k = Object.values(t.entities).find((e) => e.tpl === "knight");
  k.reactions = { parry: "always" };
  const bow = t.entities.fighter.attacks.find((a) => a.type === "ranged");
  assert.ok(bow, "the fighter has a javelin");
  bow.bonus = 40;
  fight(t); turnOf(t, "fighter");
  const r2 = ok(apply(t, { type: "attack", actor: "fighter", target: k.id, attack: bow.id }, KIM));
  assert.ok(r2.events.some((e) => e.type === "attack" && e.hit));
  assert.ok(!r2.events.some((e) => e.type === "reaction"));
});

test("the vocabulary: reaction triggers and the counter step are checked", () => {
  const spell = (over) => ({ id: "x", name: "X", source: "SRD 5.2.1", level: 1, school: "abjuration", classes: ["wizard"], time: "reaction", range: 60, components: ["s"], duration: "instant", concentration: false, ritual: false, target: { creature: { count: 1 } }, effects: [{ save: "con", onFail: [{ counter: "spell" }] }], tier: "auto", checked: false, text: "t", ...over });
  assert.deepEqual(lintEntry("spell", spell({ reaction: { on: "cast" } })), []);
  assert.ok(lintEntry("spell", spell({ reaction: { on: "damaged" } })).some((m) => /counter/.test(m)));
  assert.ok(lintEntry("spell", spell({ reaction: { on: "cast" }, target: { self: true } })).some((m) => /one creature/.test(m)));
  assert.ok(lintEntry("spell", spell({ reaction: { on: "hit" } })).some((m) => /aimed at its caster/.test(m)));
  assert.ok(lintEntry("spell", spell({ reaction: { on: "cast" }, effects: [{ save: "con", onFail: [{ counter: "yes" }] }] })).some((m) => /counter/.test(m)));
  assert.ok(lintEntry("spell", spell({ reaction: { on: "fall" } })).length);
});

// ---------- replay, undo, migration ----------

function act(s, h, action, ctx = DM) {
  const before = mark(s);
  const res = apply(s, action, ctx);
  assert.ok(res.ok, `${action.type}: ${res.error}`);
  h.record(before, s, describeStep(action, res.events, before, s));
  return res;
}

test("a game that stopped to ask replays exactly, and the DM's undo and redo are byte-identical", () => {
  const play = () => {
    const s = field(4), h = createHistory();
    scimitar(s).bonus = 40;
    act(s, h, { type: "reactions", actor: "wizard", set: { shield: "ask" } }, PAT);
    act(s, h, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 });
    for (let i = 0; i < 20 && current(s) !== "m1"; i++) act(s, h, { type: "endTurn", actor: current(s) });
    act(s, h, { type: "act", actor: "m1", action: "scimitar", target: "wizard" });
    act(s, h, { type: "react", prompt: s.pending.n, take: "shield" }, PAT);
    act(s, h, { type: "endTurn", actor: "m1" });
    return { s, h };
  };
  const a = play(), b = play();
  assert.equal(JSON.stringify(a.s), JSON.stringify(b.s));
  assert.ok(a.s.timeline.some((e) => e.type === "reactionAsked") && a.s.timeline.some((e) => e.type === "reaction"));
  const labels = a.h.list();
  assert.match(labels[1], /\(after .*'s reaction\)/);
  assert.match(labels[2], /waiting for .*'s reaction/);
  const end = JSON.stringify(a.s);
  assert.ok(a.h.undo(a.s)); assert.ok(a.h.undo(a.s));
  assert.ok(a.s.pending, "undoing the answer puts the question back");
  assert.ok(a.h.undo(a.s));
  assert.equal(a.s.pending, undefined);
  for (let i = 0; i < 3; i++) assert.ok(a.h.redo(a.s));
  assert.equal(JSON.stringify(a.s), end);
});

test("migration to version 15: a waiting reaction is kept whole or dropped", () => {
  const s = shieldUp("ask");
  ok(swing(s));
  const good = structuredClone(s);
  good.version = 14;
  migrate(good);
  assert.equal(good.version, VERSION);
  assert.ok(VERSION >= 15);                   // 16 since the keyed dice (#136)
  assert.deepEqual(good.pending, s.pending);
  ok(react(good, { take: "shield" }));
  const bad = structuredClone(s);
  bad.version = 14; bad.pending = { n: "x", action: null }; bad.asked = -2;
  migrate(bad);
  assert.equal(bad.pending, undefined);
  assert.equal(bad.asked, undefined);
  ok(apply(bad, { type: "endTurn", actor: "m1" }, DM));
  const old = field(); delete old.pending; old.version = 14;
  migrate(old);
  assert.equal(old.version, VERSION);
  assert.equal(old.pending, undefined);
});

// ---------- what other players are sent ----------

test("a question reaches only the player asked: other players' views, patches, events, record and labels", () => {
  const s = shieldUp("ask");
  const kimBefore = snapshot(view(s, KIM)), patBefore = snapshot(view(s, PAT));
  const before = mark(s);
  const r = ok(swing(s));
  // Events: the question is Pat's alone.
  assert.equal(viewEvents(r.events, s, PAT)[0].type, "reactionAsked");
  assert.deepEqual(viewEvents(r.events, s, KIM), []);
  assert.deepEqual(viewEvents(r.events, s, { role: "player" }), []);
  // Views and patches: Kim learns only that the table waits.
  const kimAfter = view(s, KIM), patch = diff(kimBefore, snapshot(kimAfter), kimAfter);
  assert.deepEqual(patch, { prompt: { waiting: true } });
  const patAfter = view(s, PAT), pp = diff(patBefore, snapshot(patAfter), patAfter);
  assert.deepEqual(Object.keys(pp), ["prompt"]);
  for (const v of [kimAfter, patAfter]) { assert.equal(v.pending, undefined); assert.equal(v.asked, undefined); }
  assert.ok(!JSON.stringify(kimAfter).includes('"hit"') && !JSON.stringify(kimAfter).includes('"scimitar"'), "nothing of the trigger or the waiting action");
  // The record, read back later.
  assert.deepEqual(viewEvents(s.timeline, s, KIM).filter((e) => /reaction/.test(e.type)), []);
  assert.equal(viewEvents(s.timeline, s, PAT).filter((e) => e.type === "reactionAsked").length, 1);
  // History labels: the waiting step is shown to no player; the answer is shown without who was asked.
  const step = describeStep({ type: "act", actor: "m1", action: "scimitar", target: "wizard" }, r.events, before, s);
  assert.equal(step.shown, null);
  const b2 = mark(s);
  const done = ok(react(s, { take: null }));
  const step2 = describeStep({ type: "react", prompt: 1, take: null }, done.events, b2, s);
  assert.ok(step2.shown && !step2.shown.includes(s.entities.wizard.name), step2.shown);
  assert.ok(!viewEvents(done.events, s, KIM).some((e) => e.type === "reactionAnswered"));
});

test("a question set off by a creature the party cannot perceive: the asked player is asked, nobody else is told the table waits", () => {
  const s = shieldUp("ask");
  s.entities.m1.hiding = { dc: 40 };
  const kimBefore = snapshot(view(s, KIM)), patBefore = snapshot(view(s, PAT));
  const r = ok(swing(s));
  assert.equal(r.events[0].type, "reactionAsked");
  assert.ok(s.pending);
  // Pat still gets the question, without who set it off.
  const q = view(s, PAT).prompt;
  assert.equal(q.reactor, "wizard"); assert.equal(q.by, undefined);
  const patAfter = view(s, PAT);
  assert.deepEqual(Object.keys(diff(patBefore, snapshot(patAfter), patAfter)), ["prompt"]);
  // Kim, and a player with no creature, get nothing: no waiting notice in the view or the patch.
  assert.equal(view(s, KIM).prompt, null);
  assert.equal(view(s, { role: "player", userId: "lee" }).prompt, null);
  const kimAfter = view(s, KIM);
  assert.deepEqual(diff(kimBefore, snapshot(kimAfter), kimAfter), {}, "Kim's patch is empty");
  assert.deepEqual(viewEvents(r.events, s, KIM), []);
  assert.ok(!JSON.stringify(kimAfter).includes("waiting"));
  // The DM sees it all.
  assert.equal(viewPrompt(s, DM).by, "m1");
  // Once the goblin is seen, the same question is a waiting notice for Kim.
  delete s.entities.m1.hiding;
  assert.deepEqual(view(s, KIM).prompt, { waiting: true });
  s.entities.m1.hiding = { dc: 40 };
  ok(react(s, { take: null }));
  assert.equal(view(s, KIM).prompt, null);
});

test("an attacker the party cannot see is not named in the question", () => {
  const s = shieldUp("ask");
  s.entities.m1.hiding = { dc: 40 };
  const r = ok(swing(s));
  assert.equal(r.events[0].type, "reactionAsked");
  const q = view(s, PAT).prompt;
  assert.equal(q.by, undefined);
  assert.equal(view(s, PAT).entities.m1, undefined);
  assert.ok(!JSON.stringify(viewEvents(r.events, s, PAT)).includes("m1"));
  assert.ok(!JSON.stringify(view(s, PAT)).includes('"m1"'));
  const step = describeStep({ type: "act", actor: "m1", action: "scimitar", target: "wizard" }, r.events, mark(s), s);
  assert.equal(step.shown, null);
});
