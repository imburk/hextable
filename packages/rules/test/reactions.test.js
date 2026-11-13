// Reactions, part 1 (docs/specs/rules-expansion.md, Decision 4, stage A): one Reaction a round,
// standing instructions set through apply(), the Opportunity Attack re-seated on them, and Shield,
// Uncanny Dodge and Deflect Attacks resolved inside the attack that set them off. Then replay,
// undo and redo, and what other players are never sent.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { diff, snapshot } from "../src/patch.js";
import { reactionsOf } from "../src/reactions.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents, viewReactions } from "../src/view.js";
import { lintRecord } from "../src/content/schema.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" }, KIM = { role: "player", userId: "kim" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); };
const A = { str: 10, dex: 16, con: 14, int: 10, wis: 14, cha: 10 };

// The wizard (who knows Shield) and the fighter, and one goblin beside the wizard. Pat plays the
// wizard and Kim the fighter.
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
// A built character in the wizard's place (Pat's), for Uncanny Dodge and Deflect Attacks.
function built(sheet, seed = 7) {
  const s = field(seed);
  const { record } = derive(sheet);
  s.entities.hero = makeEntity(record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 }, owner: "pat" });
  delete s.entities.wizard;
  s.entities.hero.hp = s.entities.hero.maxHp = 500;
  return s;
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 20 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const swing = (s, target = "wizard") => { s.encounter.budget.action = 1; return ok(apply(s, { type: "act", actor: "m1", action: "scimitar", target }, DM)); };
const scimitar = (s) => s.entities.m1.actions.find((a) => a.id === "scimitar").effects[0];
const set = (s, actor, x, ctx = DM) => apply(s, { type: "reactions", actor, set: x }, ctx);

// ---------- the mechanism and the Opportunity Attack ----------

test("what a creature can react with, and its defaults", () => {
  const s = field();
  const w = reactionsOf(s.entities.wizard), g = reactionsOf(s.entities.m1);
  assert.deepEqual(w.map((r) => [r.id, r.on, r.dflt]), [["opportunity-attack", "leave", "always"], ["shield", "hit", "never"]]);
  assert.deepEqual(w[1].options, ["never", "miss", "always", "ask"]);             // part 2: a player may be asked
  assert.deepEqual(g.map((r) => r.id), ["opportunity-attack"]);
});

test("the Opportunity Attack: always by default, never when told, and asked of the DM", () => {
  const leave = (w) => {
    const s = field();
    if (w) ok(set(s, "m1", { "opportunity-attack": w }));
    fight(s); turnOf(s, "wizard");
    const r = ok(apply(s, { type: "move", actor: "wizard", to: { q: -3, r: 1 } }, DM));
    return { s, r };
  };
  const a = leave(null);
  assert.ok(a.r.events.some((e) => e.type === "attack" && e.opportunity && e.actor === "m1"));
  assert.ok(a.r.events.some((e) => e.type === "reaction" && e.id === "m1" && e.reaction === "opportunity-attack" && e.against === "wizard"));
  assert.equal(a.s.entities.m1.reactionUsed, true);
  const n = leave("never");
  assert.ok(!n.r.events.some((e) => e.type === "attack" || e.type === "reaction"));
  assert.equal(n.s.entities.m1.reactionUsed, false);
  const k = leave("ask");
  assert.ok(!k.r.events.some((e) => e.type === "attack"));
  const m = k.r.events.find((e) => e.type === "manual");
  assert.ok(m?.partial && /ask the DM/.test(m.text), "the DM is told");
  assert.equal(k.s.entities.m1.reactionUsed, false, "nothing spent: the DM decides");
  assert.deepEqual(viewEvents(k.r.events, k.s, PAT).filter((e) => e.type === "manual"), [], "the players are not");
  // Setting it back to the default leaves nothing stored.
  ok(set(k.s, "m1", { "opportunity-attack": "always" }));
  assert.equal(k.s.entities.m1.reactions, undefined);
});

test("one Reaction a round: spent, then back at the start of the creature's own turn", () => {
  const s = field();
  ok(set(s, "wizard", { shield: "always" }));
  scimitar(s).bonus = 40;
  fight(s); turnOf(s, "m1");
  s.entities.wizard.slots[1] = 2;
  const first = swing(s);
  assert.equal(s.entities.wizard.reactionUsed, true);
  assert.ok(first.events.some((e) => e.type === "reaction" && e.reaction === "shield"));
  // Shield ran inside the attack's own steps; the attack carried on after it and still hit.
  const atk = first.events.findIndex((e) => e.type === "attack");
  if (first.events[atk].hit) assert.ok(first.events.slice(atk).some((e) => e.type === "damage" && e.target === "wizard"));
  assert.equal(s.stack, undefined, "nothing left on the effect stack");
  // No second Reaction this round.
  const again = swing(s);
  assert.ok(!again.events.some((e) => e.type === "reaction"));
  assert.equal(s.entities.wizard.slots[1], 1);
  ok(apply(s, { type: "endTurn", actor: "m1" }, DM));
  turnOf(s, "m1");
  assert.equal(s.entities.wizard.reactionUsed, false, "its turn came round");
});

test("an Incapacitated creature takes no Reaction", () => {
  const s = field();
  ok(set(s, "wizard", { shield: "always" }));
  scimitar(s).bonus = 40;
  fight(s); turnOf(s, "m1");
  ok(apply(s, { type: "condition", actor: "wizard", condition: "stunned", on: true }, DM));
  const slots = s.entities.wizard.slots[1];
  const r = swing(s);
  assert.ok(!r.events.some((e) => e.type === "reaction"));
  assert.equal(s.entities.wizard.slots[1], slots);
  // Nor does a Stunned goblin make an Opportunity Attack.
  const t = field();
  ok(apply(t, { type: "condition", actor: "m1", condition: "stunned", on: true }, DM));
  fight(t); turnOf(t, "wizard");
  const away = ok(apply(t, { type: "move", actor: "wizard", to: { q: -3, r: 1 } }, DM));
  assert.ok(!away.events.some((e) => e.type === "attack"));
});

test("standing instructions: set by the creature's controller or the DM, checked before anything changes", () => {
  const s = field();
  ok(set(s, "wizard", { shield: "miss" }, PAT));
  assert.deepEqual(s.entities.wizard.reactions, { shield: "miss" });
  const before = JSON.stringify(s);
  no(set(s, "wizard", { shield: "always" }, KIM), /isn't yours/);
  no(set(s, "m1", { "opportunity-attack": "never" }, PAT), /isn't yours/);
  no(set(s, "wizard", { shield: "sometimes" }, PAT), /can be set to/);
  no(set(s, "wizard", { "opportunity-attack": "miss" }, PAT), /can be set to/);
  no(set(s, "wizard", { counterspell: "always" }, PAT), /no reaction called/);
  no(set(s, "wizard", { shield: "always", nope: "never" }, PAT), /no reaction called/);
  no(set(s, "wizard", [], PAT));
  no(set(s, "wizard", {}, PAT));
  assert.equal(JSON.stringify(s), before, "a rejected setting changes nothing");
  // Set at any time: off its turn, in a fight.
  fight(s); turnOf(s, "m1");
  ok(set(s, "wizard", { shield: "always", "opportunity-attack": "never" }, PAT));
  assert.deepEqual(s.entities.wizard.reactions, { shield: "always", "opportunity-attack": "never" });
  // Casting a reaction spell by hand is refused, with the reason.
  no(apply(s, { type: "cast", actor: "wizard", spell: "shield" }, PAT), /standing instruction/);
});

// ---------- Shield ----------

test("Shield: cast when hit, +5 AC against that attack, a slot and the Reaction spent, gone at the caster's next turn", () => {
  const s = field();
  ok(set(s, "wizard", { shield: "always" }));
  scimitar(s).bonus = 0;
  s.entities.wizard.ac = 1;                                           // every roll but a 1 hits; with Shield it needs 6
  fight(s); turnOf(s, "m1");
  let r, n = 0;
  for (; n < 30; n++) { r = swing(s); if (r.events.some((e) => e.type === "reaction")) break; s.entities.wizard.reactionUsed = false; }
  const atk = r.events.find((e) => e.type === "attack"), i = r.events.indexOf(atk);
  assert.ok(r.events.findIndex((e) => e.type === "reaction") < i, "the reaction comes before the attack is settled");
  assert.equal(atk.ac, 6);
  assert.equal(atk.hit, atk.nat === 20 || atk.total >= 6);
  assert.equal(s.entities.wizard.slots[1], 1);
  assert.equal(s.entities.wizard.reactionUsed, true);
  const cast = r.events.find((e) => e.type === "cast");
  assert.deepEqual([cast.spell, cast.reaction], ["shield", true]);
  // Still up against the next attack this round, with no second slot.
  const again = swing(s).events.find((e) => e.type === "attack");
  assert.equal(again.ac, 6);
  assert.equal(s.entities.wizard.slots[1], 1);
  // It ends at the start of the wizard's next turn.
  ok(apply(s, { type: "endTurn", actor: "m1" }, DM));
  turnOf(s, "wizard");
  assert.ok(!s.effects.some((fx) => fx.spell === "shield"));
  ok(apply(s, { type: "endTurn", actor: "wizard" }, DM));
  turnOf(s, "m1");
  s.entities.wizard.slots[1] = 0;                                     // and with no slot, no Shield
  for (let k = 0; k < 5; k++) { assert.equal(swing(s).events.find((e) => e.type === "attack").ac, 1); }
});

test("Shield set to 'only if it turns the hit into a miss' is cast exactly then", () => {
  let fired = 0, held = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = field(seed);
    ok(set(s, "wizard", { shield: "miss" }));
    scimitar(s).bonus = 0;
    s.entities.wizard.ac = 8;
    s.entities.wizard.slots[1] = 9;
    fight(s); turnOf(s, "m1");
    const r = swing(s), atk = r.events.find((e) => e.type === "attack");
    const cast = r.events.some((e) => e.type === "reaction");
    const wouldHit = atk.nat !== 1 && (atk.nat === 20 || atk.total >= 8);
    assert.equal(cast, wouldHit && atk.nat !== 20 && atk.total < 13, `seed ${seed}`);
    if (cast) { fired++; assert.equal(atk.hit, false); } else if (wouldHit) held++;
  }
  assert.ok(fired > 0 && held > 0, `both cases seen (${fired} cast, ${held} held)`);
});

test("Shield and Magic Missile: cast when targeted, and no damage from it while it lasts", () => {
  const s = field();
  // A hostile wizard who knows Shield, and our wizard casts Magic Missile at it.
  const foe = s.entities.foe = structuredClone(s.entities.wizard);
  Object.assign(foe, { id: "foe", side: "foe", kind: "npc", owner: undefined, pos: { q: 3, r: 0, z: 0 }, reactions: { shield: "always" } });
  delete foe.owner;
  fight(s); turnOf(s, "wizard");
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "magic-missile", targets: ["foe", "foe", "foe"] }, PAT));
  assert.ok(r.events.some((e) => e.type === "reaction" && e.id === "foe" && e.trigger === "targeted"));
  assert.ok(!r.events.some((e) => e.type === "damage" && e.target === "foe"));
  assert.equal(foe.hp, 500);
  assert.equal(foe.slots[1], 1);
  // While it lasts, more Magic Missiles do it no damage, with no second slot or Reaction. (The
  // wizard is given another action and slot this turn, which only the test can do.)
  Object.assign(s.encounter.budget, { action: 1 }); s.encounter.flags.slot = false; s.entities.wizard.slots[1] = 1;
  const r2 = ok(apply(s, { type: "cast", actor: "wizard", spell: "magic-missile", targets: ["foe"] }, PAT));
  assert.ok(!r2.events.some((e) => e.type === "damage" && e.target === "foe" || e.type === "reaction"));
  assert.equal(foe.slots[1], 1);
  // Under 'never', Magic Missile hits as it always did.
  const t = field();
  const foe2 = t.entities.foe = structuredClone(foe);
  foe2.reactions = { shield: "never" }; foe2.slots[1] = 2; foe2.reactionUsed = false;
  fight(t); turnOf(t, "wizard");
  const r3 = ok(apply(t, { type: "cast", actor: "wizard", spell: "magic-missile", targets: ["foe"] }, PAT));
  assert.ok(r3.events.some((e) => e.type === "damage" && e.target === "foe"));
});

// ---------- Uncanny Dodge and Deflect Attacks ----------

const ROGUE = { name: "Pip", class: "rogue", level: 5, subclass: "thief", abilities: { ...A, dex: 17 }, skills: ["acrobatics", "deception", "perception", "stealth"], armour: "leather-armor", weapons: ["shortsword"] };
const MONK = { name: "Lo", class: "monk", level: 3, subclass: "open-hand", abilities: A, skills: ["acrobatics", "insight"], weapons: ["quarterstaff"] };

test("Uncanny Dodge halves the damage of a hit from an attacker it can see, rounded down", () => {
  const hit = (w) => {
    const s = built(ROGUE);
    if (w) ok(set(s, "hero", { "uncanny-dodge": w }, PAT));
    scimitar(s).bonus = 40;
    fight(s); turnOf(s, "m1");
    return { s, r: swing(s, "hero") };
  };
  const plain = hit("never"), dodged = hit(null);
  const d0 = plain.r.events.filter((e) => e.type === "damage").reduce((a, e) => a + e.amount, 0);
  const d1 = dodged.r.events.filter((e) => e.type === "damage").reduce((a, e) => a + e.amount, 0);
  assert.ok(d0 > 0);
  assert.equal(d1, Math.floor(d0 / 2));
  assert.equal(dodged.s.entities.hero.reactionUsed, true);
  assert.ok(dodged.r.events.some((e) => e.type === "reaction" && e.reaction === "uncanny-dodge"));
  assert.deepEqual(lintRecord(derive(ROGUE).record), [], "a record with a reaction passes the record linter");
  // Not against an attacker it cannot see.
  const s = built(ROGUE);
  scimitar(s).bonus = 40;
  fight(s); turnOf(s, "m1");
  ok(apply(s, { type: "condition", actor: "hero", condition: "blinded", on: true }, DM));
  assert.ok(!swing(s, "hero").events.some((e) => e.type === "reaction"));
});

test("Deflect Attacks cuts a Bludgeoning, Piercing or Slashing hit by 1d10 + Dexterity + Monk level", () => {
  const s = built(MONK);
  const f = s.entities.hero.feats.find((x) => x.id === "deflect-attacks");
  assert.deepEqual(f.reaction, { on: "hit", types: ["bludgeoning", "piercing", "slashing"], cut: { dice: "1d10+6" } });     // Dex 16 (+3), level 3
  scimitar(s).bonus = 40;
  fight(s); turnOf(s, "m1");
  const r = swing(s, "hero");
  const re = r.events.find((e) => e.type === "reaction");
  assert.equal(re.reaction, "deflect-attacks");
  assert.ok(re.amount >= 7 && re.amount <= 16);
  const dmg = r.events.find((e) => e.type === "damage");
  assert.equal(dmg.amount, Math.max(0, (dmg.rolled ?? dmg.amount) - re.amount));
  assert.ok(r.events.some((e) => e.type === "manual" && e.partial && /redirect/.test(e.text)), "the redirect is the DM's");
});

// ---------- replay, undo and redo ----------

function act(s, h, action, ctx = DM) {
  const before = mark(s);
  const res = apply(s, action, ctx);
  assert.ok(res.ok, `${action.type}: ${res.error}`);
  h.record(before, s, describeStep(action, res.events, before, s));
  return res;
}
function script(s, h) {
  act(s, h, { type: "reactions", actor: "wizard", set: { shield: "always" } }, PAT);
  act(s, h, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 });
  for (let i = 0; i < 20 && current(s) !== "m1"; i++) act(s, h, { type: "endTurn", actor: current(s) });
  act(s, h, { type: "act", actor: "m1", action: "scimitar", target: "wizard" });
  act(s, h, { type: "endTurn", actor: "m1" });
}

test("a game with reactions replays exactly, and the DM's undo and redo are byte-identical", () => {
  const a = field(3), b = field(3), ha = createHistory(), hb = createHistory();
  scimitar(a).bonus = 40; scimitar(b).bonus = 40;
  const start = JSON.stringify(a);
  script(a, ha); script(b, hb);
  assert.equal(JSON.stringify(a), JSON.stringify(b), "same seed, same actions, same game");
  assert.ok(a.timeline.some((e) => e.type === "reaction"), "a reaction happened");
  const end = JSON.stringify(a), n = ha.list().length;
  for (let i = 0; i < n; i++) assert.ok(ha.undo(a));
  assert.equal(JSON.stringify(a), start);
  for (let i = 0; i < n; i++) assert.ok(ha.redo(a));
  assert.equal(JSON.stringify(a), end);
});

// ---------- what other players are sent ----------

test("a standing instruction is its controller's and the DM's: never in another player's view, patch or events", () => {
  const s = field();
  const kimBefore = snapshot(view(s, KIM));
  const r = ok(set(s, "wizard", { shield: "miss", "opportunity-attack": "never" }, PAT));
  assert.deepEqual(view(s, PAT).reactions, { wizard: { shield: "miss", "opportunity-attack": "never" } });
  assert.deepEqual(viewReactions(s, KIM), {});
  assert.equal(view(s, DM).entities.wizard.reactions.shield, "miss");
  for (const who of [KIM, PAT]) {
    const v = view(s, who);
    assert.equal(v.entities.wizard.reactions, undefined, "not on the shared record");
    assert.deepEqual(viewEvents(r.events, s, who), [], "setting one says nothing to the table");
  }
  const kimAfter = view(s, KIM), patch = diff(kimBefore, snapshot(kimAfter), kimAfter);
  assert.deepEqual(patch, {}, "Kim's view did not change at all");
  assert.ok(!JSON.stringify(view(s, KIM)).includes('"shield":"miss"'));
});

test("a hidden creature's reaction state and instructions reach no player, and nor does its declining", () => {
  // Two tables alike but for the hidden goblin's instruction: 'ask' (the DM is told) or 'never'.
  // Every player is sent the same in both, and neither its Reaction nor its instruction.
  const run = (w) => {
    const s = field(5);
    ok(set(s, "m1", { "opportunity-attack": w }));
    fight(s);
    s.entities.m1.hiding = { dc: 40 };                                  // it took the Hide action and nobody has found it
    turnOf(s, "wizard");
    const r = ok(apply(s, { type: "move", actor: "wizard", to: { q: -3, r: 1 } }, PAT));
    return { s, r };
  };
  const ask = run("ask"), never = run("never");
  assert.ok(ask.r.events.some((e) => e.type === "manual" && e.actor === "m1"), "the DM was asked");
  for (const who of [PAT, KIM]) {
    assert.equal(JSON.stringify(viewEvents(ask.r.events, ask.s, who)), JSON.stringify(viewEvents(never.r.events, never.s, who)));
    assert.equal(JSON.stringify(view(ask.s, who)), JSON.stringify(view(never.s, who)));
    assert.equal(view(ask.s, who).entities.m1, undefined);
  }
  // A goblin they can see shows neither its instruction nor whether its Reaction is spent.
  const s = field();
  ok(set(s, "m1", { "opportunity-attack": "ask" }));
  s.entities.m1.reactionUsed = true;
  const g = view(s, PAT).entities.m1;
  assert.ok(g && g.reactions === undefined && g.reactionUsed === undefined);
});

test("a reaction taken in the open is told plainly; its instruction never is", () => {
  const s = field();
  ok(set(s, "wizard", { shield: "always" }, PAT));
  scimitar(s).bonus = 40;
  fight(s); turnOf(s, "m1");
  const r = swing(s);
  const seen = viewEvents(r.events, s, KIM);
  const re = seen.find((e) => e.type === "reaction");
  assert.deepEqual(Object.keys(re).sort(), ["against", "id", "name", "reaction", "trigger", "type"]);
  assert.ok(!JSON.stringify(seen).includes("always"));
  assert.ok(!seen.some((e) => e.type === "manual"));
});

test("Shield against a weapon attack from a flat attack record", () => {
  const s = field();
  const foe = s.entities.foe = structuredClone(s.entities.wizard);
  Object.assign(foe, { id: "foe", side: "foe", kind: "npc", pos: { q: -2, r: 0, z: 0 }, reactions: { shield: "always" }, ac: 1 });
  delete foe.owner;
  const f = s.entities.fighter;
  f.attacks[0].bonus = 40;
  fight(s); turnOf(s, "fighter");
  const r = ok(apply(s, { type: "attack", actor: "fighter", target: "foe", attack: f.attacks[0].id }, KIM));
  const atk = r.events.find((e) => e.type === "attack");
  if (atk.nat !== 1) { assert.equal(atk.ac, 6); assert.equal(foe.slots[1], 1); assert.ok(r.events.some((e) => e.type === "reaction" && e.against === "fighter")); }
});
