// Stage O1 of docs/specs/on-hit.md: the hook after a hit, Divine Smite and Paladin's Smite (hitchoices.js; engine/resolve.js, hitStage and castOnHit).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents, viewPrompt, viewReactions } from "../src/view.js";
import { lintPack } from "../src/content/schema.js";
import { SPELLS } from "../src/content/index.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" }, KIM = { role: "player", userId: "kim" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "should have been refused"); if (re) assert.match(r.error, re); };
const paladin = (level, more = {}) => ({ name: "Ka", class: "paladin", level, ...(level >= 3 ? { subclass: "devotion" } : {}), abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 16 },
  skills: ["athletics", "religion"], choices: { "fighting-style": "defense" }, armour: "chain-mail", weapons: ["longsword", "longbow", "handaxe"], ...more });

// A paladin (Pat's) beside a goblin it cannot miss: Armor Class 1, and a Critical Hit on any roll but a 1 when `crit`.
function field({ level = 5, seed = 7, crit = false, ac = 1, sheet = null, owner = "pat" } = {}) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (!["rogue", "m1"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet ?? paladin(level)).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 }, ...(owner ? { owner } : {}) });
  if (crit) s.entities.hero.critOn = 2;
  ok(apply(s, { type: "place", actor: "rogue", to: { q: -3, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "m1", to: { q: 1, r: 0 } }, DM));
  Object.assign(s.entities.m1, { hp: 500, maxHp: 500, ac });
  return s;
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 20 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const ready = (o) => { const s = field(o); fight(s); turnOf(s, "hero"); return s; };
const hit = (s, more = {}, ctx = PAT) => apply(s, { type: "attack", actor: "hero", target: "m1", attack: "longsword", ...more }, ctx);
const answer = (s, take, slot, ctx = PAT) => ok(apply(s, { type: "react", prompt: s.pending.n, take, ...(slot !== undefined ? { slot } : {}) }, ctx));
const radiant = (ev) => ev.filter((e) => e.type === "damage" && e.from === "Divine Smite");
const dice = (ev) => radiant(ev).reduce((n, e) => n + e.dice.length, 0);

test("Divine Smite and Paladin's Smite are data: a hit spell, auto, with a free cast", () => {
  const d = SPELLS["divine-smite"].def;
  assert.deepEqual(d.hit, { with: "melee" });
  assert.equal(d.tier, "auto");
  assert.ok(d.effects.every((st) => st.withHit === true));
  const f = derive(paladin(5)).record.feats.find((x) => x.id === "paladins-smite");
  assert.equal(f.tier, "auto");
  assert.deepEqual(f.freeCast, { spells: ["divine-smite"] });
  assert.deepEqual(f.uses, { max: 1, recharge: "long" });
});

test("a hit asks its player; a miss asks nothing", () => {
  const s = ready();
  const r = ok(hit(s));
  assert.ok(s.pending);
  assert.equal(s.pending.ask.trigger, "ownHit");
  assert.equal(s.pending.ask.moment, "hit");
  assert.deepEqual(s.pending.ask.options.map((o) => [o.reaction, o.slots ?? null, !!o.free]), [["divine-smite", [1, 2], false], ["divine-smite@paladins-smite", null, true]]);
  assert.equal(r.events.length, 1, "the action only asked: nothing else was told");
  // Nothing changed while it waits (the dice seed too).
  assert.equal(s.entities.m1.hp, 500);
  assert.equal(s.encounter.budget.bonus, 1);
  // A miss: no question.
  let missed = false;
  for (let seed = 1; seed < 80 && !missed; seed++) {
    const t = ready({ seed, ac: 40 });
    const e = ok(hit(t)).events;
    if (e.some((x) => x.type === "attack" && !x.hit)) { missed = true; assert.equal(t.pending, undefined); assert.ok(!e.some((x) => x.type === "reactionAsked")); }
  }
  assert.ok(missed);
});

test("declining spends nothing and deals the weapon's damage only", () => {
  const s = ready();
  ok(hit(s));
  const r = answer(s, null);
  assert.equal(s.pending, undefined);
  assert.equal(radiant(r.events).length, 0);
  assert.equal(s.entities.hero.slots[1], 4);
  assert.equal(s.encounter.budget.bonus, 1);
  assert.ok(!s.encounter.flags.slot);
  assert.ok(r.events.some((x) => x.type === "damage" && x.dtype === "slashing"));
});

test("a level 1 slot adds 2d8, a level 2 slot 3d8; the slot and the Bonus Action are spent", () => {
  const s = ready();
  ok(hit(s));
  const r = answer(s, "divine-smite", 1);
  assert.equal(dice(r.events), 2);
  assert.equal(radiant(r.events)[0].dtype, "radiant");
  assert.equal(s.entities.hero.slots[1], 3);
  assert.equal(s.encounter.budget.bonus, 0);
  assert.equal(s.encounter.flags.slot, true);
  const cast = r.events.find((x) => x.type === "cast");
  assert.deepEqual([cast.spell, cast.hit, cast.slot], ["divine-smite", true, undefined]);
  const t = ready();
  ok(hit(t));
  const r2 = answer(t, "divine-smite", 2);
  assert.equal(dice(r2.events), 3);
  assert.equal(t.entities.hero.slots[2], 1);
  assert.equal(r2.events.find((x) => x.type === "cast").slot, 2);
  // The extra damage is dealt with the hit: the creature lost the sum.
  const lost = r2.events.filter((x) => x.type === "damage").reduce((n, x) => n + x.amount, 0);
  assert.equal(500 - t.entities.m1.hp, lost);
});

test("a Critical Hit doubles the smite's dice", () => {
  const s = ready({ crit: true });
  const r0 = ok(hit(s));
  assert.equal(s.pending.ask.crit, true);
  const r = answer(s, "divine-smite", 1);
  assert.equal(r.events.find((x) => x.type === "attack").crit, true);
  assert.equal(dice(r.events), 4, "2d8 rolled twice");
  const t = ready({ crit: true });
  ok(hit(t));
  assert.equal(dice(answer(t, "divine-smite", 2).events), 6);
});

test("a Fiend or an Undead takes 1d8 more", () => {
  for (const type of ["fiend", "undead"]) {
    const s = ready();
    s.entities.m1.type = type;
    ok(hit(s));
    assert.equal(dice(answer(s, "divine-smite", 1).events), 3, type);
  }
  const s = ready();
  s.entities.m1.type = "humanoid";
  ok(hit(s));
  assert.equal(dice(answer(s, "divine-smite", 1).events), 2);
  // And doubled with a Critical Hit.
  const c = ready({ crit: true });
  c.entities.m1.type = "undead";
  ok(hit(c));
  assert.equal(dice(answer(c, "divine-smite", 1).events), 6);
});

test("the answer re-runs the action: the same dice as naming it ahead", () => {
  const a = ready();
  ok(hit(a));
  const asked = answer(a, "divine-smite", 2).events;
  const b = ready();
  const named = ok(hit(b, { onHit: [{ spell: "divine-smite", slot: 2 }] }, DM)).events;
  const strip = (ev) => ev.filter((x) => ["attack", "damage", "cast"].includes(x.type));
  assert.deepEqual(strip(asked), strip(named));
  assert.equal(a.entities.m1.hp, b.entities.m1.hp);
});

test("named ahead: `on: crit` only on a Critical Hit; nothing is asked", () => {
  const s = ready();
  const r = ok(hit(s, { onHit: [{ spell: "divine-smite", on: "crit" }] }));
  assert.equal(s.pending, undefined);
  assert.equal(r.events.some((x) => x.type === "cast"), false);
  assert.equal(s.entities.hero.slots[1], 4);
  const c = ready({ crit: true });
  const r2 = ok(hit(c, { onHit: [{ spell: "divine-smite", on: "crit", slot: 1 }] }));
  assert.equal(dice(r2.events), 4);
  assert.equal(c.entities.hero.slots[1], 3);
  // `onHit: []` names none, so nothing is asked either.
  const n = ready();
  const r3 = ok(hit(n, { onHit: [] }));
  assert.equal(n.pending, undefined);
  assert.equal(r3.events.some((x) => x.type === "cast"), false);
});

test("a choice named ahead is checked before anything is spent", () => {
  const s = ready();
  const before = JSON.stringify(s);
  no(hit(s, { onHit: [{ spell: "bless" }] }), /right after a hit/);
  no(hit(s, { onHit: [{ spell: "divine-smite", slot: 4 }] }), /level 1, 2 slot|can be cast with/);
  no(hit(s, { onHit: [{ spell: "divine-smite", on: "never" }] }), /"hit" \(the default\) or "crit"/);
  no(hit(s, { onHit: [{ spell: "divine-smite", via: "faithful-steed" }] }), /no use of a feature/);
  no(hit(s, { onHit: [{ spell: "divine-smite" }, { spell: "divine-smite" }] }), /one Bonus Action/);
  no(hit(s, { onHit: "yes" }), /list/);
  no(hit(s, { onHit: [{ spell: "divine-smite", slot: 1, extra: 1 }] }), /is \{ spell/);
  assert.equal(JSON.stringify(s), before, "refused: nothing changed");
  s.encounter.budget.bonus = 0;
  no(hit(s, { onHit: [{ spell: "divine-smite" }] }), /Bonus Action/);
  // A ranged weapon is not a Melee weapon.
  const t = ready();
  no(hit(t, { attack: "longbow", onHit: [{ spell: "divine-smite" }] }), /Melee weapon/);
  // Outside a fight there is no turn to take it on.
  const u = field();
  no(hit(u, { onHit: [{ spell: "divine-smite" }] }), /turn in a fight/);
  // A thrown handaxe is a Melee weapon (DEBT C11).
  const h = ready();
  const hax = h.entities.hero.attacks.find((a) => a.id === "handaxe-thrown");
  assert.ok(hax, "the thrown handaxe attack exists");
  ok(hit(h, { attack: "handaxe-thrown", onHit: [{ spell: "divine-smite" }] }));
});

test("cast by hand is refused: it is a choice at a hit", () => {
  const s = ready();
  no(apply(s, { type: "cast", actor: "hero", spell: "divine-smite" }, PAT), /right after a hit/);
  no(apply(s, { type: "cast", actor: "hero", spell: "divine-smite", via: "paladins-smite" }, PAT), /right after a hit/);
});

test("no smite with the Bonus Action spent, and none on a turn that is not the attacker's", () => {
  const s = ready();
  s.encounter.budget.bonus = 0;
  const r = ok(hit(s));
  assert.equal(s.pending, undefined);
  assert.equal(r.events.some((x) => x.type === "cast"), false);
  // An Opportunity Attack of the paladin, on the goblin's turn, offers nothing.
  const t = ready();
  t.entities.hero.reactions = { "opportunity-attack": "always" };
  turnOf(t, "m1");
  Object.assign(t.entities.m1, { actions: undefined });
  ok(apply(t, { type: "move", actor: "m1", to: { q: 3, r: 0 } }, DM));
  assert.equal(t.pending, undefined);
});

test("one spell slot a turn: after a levelled spell only Paladin's Smite's free cast is offered, and it costs no slot", () => {
  const s = ready();
  s.encounter.flags.slot = true;
  ok(hit(s));
  assert.deepEqual(s.pending.ask.options.map((o) => o.reaction), ["divine-smite@paladins-smite"]);
  const r = answer(s, "divine-smite@paladins-smite");
  assert.equal(dice(r.events), 2, "at its own level");
  assert.equal(s.entities.hero.uses["paladins-smite"], 0);
  assert.deepEqual(s.entities.hero.slots, { 1: 4, 2: 2 });
  assert.equal(r.events.find((x) => x.type === "cast").via, "Paladin's Smite");
  // The use is spent: next time only slots.
  const t = ready();
  t.entities.hero.uses["paladins-smite"] = 0;
  ok(hit(t));
  assert.deepEqual(t.pending.ask.options.map((o) => o.reaction), ["divine-smite"]);
  // Free cast named ahead, and a Long Rest gives the use back.
  const u = ready();
  ok(hit(u, { onHit: [{ spell: "divine-smite", via: "paladins-smite" }] }));
  assert.equal(u.entities.hero.uses["paladins-smite"], 0);
  assert.equal(u.encounter.flags.slot, undefined);
});

test("instructions: always, crit and never; ask is the default for a player's creature", () => {
  const set = (s, when, ctx = PAT) => ok(apply(s, { type: "hitChoices", actor: "hero", set: { "divine-smite": when } }, ctx));
  // always: the free cast first, then the lowest slot.
  let s = ready(); set(s, "always");
  let r = ok(hit(s));
  assert.equal(s.pending, undefined);
  assert.equal(dice(r.events), 2);
  assert.equal(s.entities.hero.uses["paladins-smite"], 0);
  assert.equal(s.entities.hero.slots[1], 4);
  s = ready(); s.entities.hero.uses["paladins-smite"] = 0; set(s, "always");
  r = ok(hit(s));
  assert.equal(s.entities.hero.slots[1], 3, "no free use left: the lowest slot");
  // crit: only on a Critical Hit.
  s = ready(); set(s, "crit");
  r = ok(hit(s));
  assert.equal(r.events.some((x) => x.type === "cast"), false);
  s = ready({ crit: true }); set(s, "crit");
  r = ok(hit(s));
  assert.equal(dice(r.events), 4);
  // never: not offered, nothing asked.
  s = ready(); set(s, "never");
  r = ok(hit(s));
  assert.equal(s.pending, undefined);
  assert.equal(r.events.some((x) => x.type === "cast"), false);
  // checked
  no(apply(s, { type: "hitChoices", actor: "hero", set: { "divine-smite": "miss" } }, PAT), /can be set to ask, crit, always, never/);
  no(apply(s, { type: "hitChoices", actor: "hero", set: { shield: "ask" } }, PAT), /nothing to choose/);
  no(apply(s, { type: "hitChoices", actor: "hero", set: {} }, PAT), /Say which/);
  no(apply(s, { type: "hitChoices", actor: "hero", set: { "divine-smite": "always" } }, KIM), /isn't yours/);
  // A named choice overrides an instruction of `never`.
  r = ok(hit(s, { onHit: [{ spell: "divine-smite", slot: 1 }] }));
  assert.equal(dice(r.events), 2);
});

test("a DM's creature never waits: default never, and `ask` tells the DM", () => {
  const s = ready({ owner: null });
  const r = ok(hit(s, {}, DM));
  assert.equal(s.pending, undefined);
  assert.equal(r.events.some((x) => x.type === "cast"), false);
  ok(apply(s, { type: "hitChoices", actor: "hero", set: { "divine-smite": "ask" } }, DM));
  turnOf(s, "rogue"); turnOf(s, "hero");
  const r2 = ok(hit(s, {}, DM));
  assert.equal(s.pending, undefined, "nothing waits");
  const m = r2.events.find((x) => x.type === "manual");
  assert.match(m.text, /ask the DM/);
  assert.equal(s.entities.hero.slots[1], 4, "nothing was taken");
  // Named ahead works for the DM's creature, and `always` fires.
  const t = ready({ owner: null });
  assert.equal(dice(ok(hit(t, { onHit: [{ spell: "divine-smite", slot: 1 }] }, DM)).events), 2);
  const u = ready({ owner: null });
  ok(apply(u, { type: "hitChoices", actor: "hero", set: { "divine-smite": "always" } }, DM));
  assert.equal(dice(ok(hit(u, {}, DM)).events), 2);
});

test("a stand-in reads `ask` as `never`, and `always` fires", () => {
  const s = ready();
  s.entities.hero.away = { how: "standIn" };
  const r = ok(hit(s, {}, DM));
  assert.equal(s.pending, undefined);
  assert.equal(r.events.some((x) => x.type === "cast"), false);
  assert.equal(s.entities.hero.slots[1], 4);
  const t = ready();
  t.entities.hero.away = { how: "standIn" };
  ok(apply(t, { type: "hitChoices", actor: "hero", set: { "divine-smite": "always" } }, PAT));
  assert.equal(dice(ok(hit(t, {}, DM)).events), 2);
});

test("Extra Attack: one Bonus Action, so one smite; the second hit is not asked", () => {
  const s = ready({ level: 5 });
  ok(hit(s));
  answer(s, "divine-smite", 1);
  const r = ok(hit(s));
  assert.equal(s.pending, undefined);
  assert.equal(r.events.some((x) => x.type === "cast"), false);
  assert.equal(s.entities.hero.slots[1], 3);
  // Declining the first leaves the second to be asked.
  const t = ready({ level: 5 });
  ok(hit(t)); answer(t, null);
  ok(hit(t));
  assert.ok(t.pending);
});

test("Shield that turns the hit into a miss leaves nothing to smite", () => {
  let tried = 0;
  for (let seed = 1; seed < 150 && !tried; seed++) {
    const s = ready({ seed, ac: 14 });
    s.entities.m1.spells = ["shield"]; s.entities.m1.slots = { 1: 1 }; s.entities.m1.reactions = { shield: "always" };
    const r = hit(s);
    if (!r.ok) continue;
    const e = r.events;
    if (e.some((x) => x.type === "reaction" && x.reaction === "shield") && e.some((x) => x.type === "attack" && !x.hit)) {
      tried++;
      assert.equal(s.pending, undefined);
      assert.ok(!e.some((x) => x.type === "reactionAsked" || (x.type === "cast" && x.hit)));
    }
  }
  assert.ok(tried, "found a seed where Shield turned the hit into a miss");
});

test("Counterspell keeps the slot, wastes the Bonus Action, and the weapon's damage is dealt", () => {
  let tried = 0;
  for (let seed = 1; seed < 40 && !tried; seed++) {
    const s = ready({ seed });
    const m = s.entities.m1;
    Object.assign(m, { spells: ["counterspell"], slots: { 3: 2 }, prof: 3, castAbil: "int", abil: { ...m.abil, int: 30 }, reactions: { counterspell: "always" } });
    const r = hit(s, { onHit: [{ spell: "divine-smite", slot: 1 }] }, DM);
    if (!r.ok) continue;
    const e = r.events;
    if (!e.some((x) => x.type === "countered" && x.spell === "divine-smite")) continue;
    tried++;
    assert.equal(s.entities.hero.slots[1], 4, "the slot is kept");
    assert.ok(!s.encounter.flags.slot, "and is not the turn's one slot");
    assert.equal(s.encounter.budget.bonus, 0, "the Bonus Action is wasted");
    assert.equal(radiant(e).length, 0);
    assert.ok(e.some((x) => x.type === "damage" && x.dtype === "slashing"));
  }
  assert.ok(tried, "found a seed where Counterspell worked");
});

test("Uncanny Dodge halves the smite with the rest of the attack", () => {
  const sheet = { name: "Vi", class: "rogue", level: 5, subclass: "thief", abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 10, cha: 10 }, skills: ["stealth", "acrobatics", "perception", "sleight-of-hand"], expertise: ["stealth", "perception"], armour: "leather-armor", weapons: ["shortsword"] };
  const t = ready({ crit: false });
  const rec = derive(sheet).record;
  Object.assign(t.entities.m1, makeEntity(rec, { id: "m1", kind: "npc", side: "foe", pos: { q: 1, r: 0, z: 0 } }), { hp: 500, maxHp: 500, ac: 1 });
  const had = (t.entities.m1.feats ?? []).some((f) => f.id === "uncanny-dodge");
  assert.ok(had, "the foe has Uncanny Dodge");
  const r = ok(hit(t, { onHit: [{ spell: "divine-smite", slot: 1 }] }));
  const dmg = r.events.filter((x) => x.type === "damage");
  assert.ok(r.events.some((x) => x.type === "reaction" && x.reaction === "uncanny-dodge"));
  // The half is of the whole instance: the weapon's damage and the smite together.
  const rolled = dmg.reduce((n, x) => n + x.dice.reduce((m, d) => m + d.value, 0) + x.bonus, 0);
  assert.ok(radiant(r.events).length === 1 && dmg.length >= 2);
  assert.equal(dmg.reduce((n, x) => n + x.amount, 0), Math.floor(rolled / 2), "halved with the smite in it");
});

test("a Paladin 13 and a Paladin 6 / Bard 8: slots, prompt and smite", () => {
  const p13 = ready({ level: 13 });
  ok(hit(p13));
  assert.deepEqual(p13.pending.ask.options[0].slots, Object.keys(p13.entities.hero.slots).map(Number).filter((l) => p13.entities.hero.slots[l] > 0));
  const r = answer(p13, "divine-smite", 4);
  assert.equal(radiant(r.events).reduce((n, e) => n + e.dice.length, 0), 5, "2d8 and three more for a level 4 slot");
  // Zaarth's build. No guard: if derive refuses this sheet, the test fails rather than passing unseen.
  const sheet = { ...paladin(6), class: undefined, level: undefined, subclass: undefined, classes: [{ class: "paladin", level: 6, subclass: "devotion" }, { class: "bard", level: 8, subclass: "lore", spells: ["vicious-mockery"] }],
    skills: ["athletics", "religion", "performance", "persuasion", "insight"], expertise: [] };
  const built = derive(sheet);
  assert.ok(!built.errors?.length, `derive accepts the multiclass sheet: ${JSON.stringify(built.errors)}`);
  const m = ready({ sheet });
  // Caster level 3 (Paladin 6, halved) + 8 (Bard) = 11: the multiclass table's row 11.
  assert.deepEqual(m.entities.hero.slots, { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 }, "the multiclass spell slot table");
  ok(hit(m));
  const smite = m.pending.ask.options.find((o) => o.reaction === "divine-smite");
  assert.ok(smite, "Divine Smite is offered on a hit");
  assert.deepEqual(smite.slots, [1, 2, 3, 4, 5, 6], "any slot the multiclass table gives, up to 6th");
  const r2 = answer(m, "divine-smite", 6);
  assert.equal(radiant(r2.events).reduce((n, e) => n + e.dice.length, 0), 7, "a 6th-level slot: 2d8 and five more (SRD 5.2 has no cap)");
});

test("what each person is sent: the question to its player and the DM only, the instructions to their controller", () => {
  const s = ready();
  ok(apply(s, { type: "hitChoices", actor: "hero", set: { "divine-smite": "crit" } }, PAT));
  assert.deepEqual(viewReactions(s, PAT).hero, { "divine-smite": "crit" });
  assert.deepEqual(viewReactions(s, KIM), {});
  assert.equal(JSON.stringify(view(s, KIM)).includes("hitChoices"), false);
  ok(apply(s, { type: "hitChoices", actor: "hero", set: { "divine-smite": "ask" } }, PAT));
  const r = ok(hit(s));
  const p = viewPrompt(s, PAT);
  assert.equal(p.trigger, "ownHit");
  assert.equal(p.attack, "Longsword");
  assert.deepEqual(p.options.map((o) => o.kind), ["spell", "spell"]);
  assert.ok(p.options.every((o) => !("ac" in o)), "no Armor Class in it");
  assert.deepEqual(viewPrompt(s, KIM), { waiting: true });
  assert.equal(viewPrompt(s, DM).trigger, "ownHit");
  const told = (who) => viewEvents(r.events, s, who).filter((e) => e.type === "reactionAsked");
  assert.equal(told(PAT).length, 1);
  assert.equal(told(KIM).length, 0);
  const a = answer(s, "divine-smite", 1);
  const seen = viewEvents(a.events, s, KIM).find((x) => x.type === "damage" && x.from === "Divine Smite");
  assert.ok(seen, "the damage of a smite is told as the attack's damage");
});

test("a smite replays exactly, and undo and redo carry it and the question it waited on", () => {
  const run = () => {
    const s = ready(), h = createHistory();
    const act = (action, ctx) => { const before = mark(s); const res = apply(s, action, ctx); assert.ok(res.ok, res.error); h.record(before, s, describeStep(action, res.events, before, s)); return res; };
    const labels = [];
    act({ type: "hitChoices", actor: "hero", set: { "divine-smite": "ask" } }, PAT);
    act({ type: "attack", actor: "hero", target: "m1", attack: "longsword" }, PAT);
    assert.ok(s.pending);
    no(apply(s, { type: "endTurn", actor: "hero" }, PAT), /waiting/);
    act({ type: "react", prompt: s.pending.n, take: "divine-smite", slot: 2 }, PAT);
    labels.push(...h.list().map((x) => (typeof x === "string" ? x : x.label ?? x.shown ?? JSON.stringify(x))));
    return { s, h, labels };
  };
  const a = run(), b = run();
  assert.equal(JSON.stringify(a.s), JSON.stringify(b.s), "same seed, same answers, same game");
  assert.ok(a.labels.some((l) => /after a hit/.test(l)), a.labels.join("|"));
  assert.ok(a.labels.some((l) => /attack/i.test(l) && /reaction/.test(l)), a.labels.join("|"));
  const end = JSON.stringify(a.s), n = a.h.list().length;
  for (let i = 0; i < n; i++) assert.ok(a.h.undo(a.s));
  assert.equal(a.s.entities.hero.slots[2], 2);
  assert.equal(a.s.pending, undefined);
  for (let i = 0; i < n; i++) assert.ok(a.h.redo(a.s));
  assert.equal(JSON.stringify(a.s), end);
  assert.equal(a.s.entities.hero.slots[2], 1);
});

test("an old save: a paladin made before Paladin's Smite had a free cast has slots only", () => {
  const s = ready();
  const f = s.entities.hero.feats.find((x) => x.id === "paladins-smite");
  delete f.freeCast; delete s.entities.hero.uses["paladins-smite"];
  ok(hit(s));
  assert.deepEqual(s.pending.ask.options.map((o) => o.reaction), ["divine-smite"]);
  assert.ok(answer(s, "divine-smite", 1));
});

test("lint: withHit and hit belong together", () => {
  const sp = (more, effects) => ({ id: "x", name: "X", level: 1, school: "evocation", classes: ["paladin"], time: "bonus", range: "self", components: ["v"], duration: "instant", concentration: false, ritual: false,
    target: { self: true }, effects, tier: "auto", text: "t", source: "t", ...more });
  const lint = (e) => lintPack({ pack: { id: "p", name: "P", license: "L", attribution: "A" }, spells: [e] });
  const msgs = (e) => JSON.stringify(lint(e));
  assert.doesNotMatch(msgs(sp({ hit: { with: "melee" } }, [{ damage: "1d6", type: "fire", withHit: true }])), /withHit|hit/);
  assert.match(msgs(sp({}, [{ damage: "1d6", type: "fire", withHit: true }])), /withHit/);
  assert.match(msgs(sp({ hit: { with: "melee" }, time: "action" }, [{ damage: "1d6", type: "fire", withHit: true }])), /Bonus Action/);
  assert.match(msgs(sp({ hit: { with: "spell" } }, [{ damage: "1d6", type: "fire" }])), /with/);
  assert.match(msgs(sp({ hit: { with: "melee" } }, [{ damage: "1d6", type: "fire", withHit: false }])), /true or left out/);
  assert.match(msgs(sp({ hit: { with: "melee" }, target: { creature: { count: 1 } } }, [{ damage: "1d6", type: "fire" }])), /aimed at its caster/);
});
