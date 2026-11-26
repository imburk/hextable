// Wave 3b, part 2, of issue #786: Dispel Evil and Good, Confusion and Bestow Curse.
// Built to docs/specs/rules-expansion.md, "Build notes: wave 3b part 2". Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { aiStep } from "../src/ai.js";
import { viewEvents } from "../src/view.js";
import { canReact } from "../src/reactions.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const lint = (def) => lintEntry("spells", def, { strict: false });
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", 0, 0], ["fighter", -2, 0], ["rogue", -4, 4], ["cleric", -1, 0]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  const slots = { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1 };
  for (const id of ["wizard", "cleric"]) Object.assign(s.entities[id], { slots: { ...slots }, slotsMax: { ...slots } });
  s.entities.cleric.spells.push("dispel-evil-and-good", "bestow-curse", "confusion");
  s.entities.wizard.spells.push("confusion", "bestow-curse", "dispel-evil-and-good", "fire-bolt");
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 300;
  return s;
}
const spawn = (s, monster, q, r) => { const e = s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 300; return e; };
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 14 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 60 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const at = (e, q, r) => { e.pos = { q, r, z: 0 }; };
const effect = (s, name) => s.effects.find((fx) => fx.name === name);
// A creature that fails every save, or makes every one.
const sure = (e, ok_) => { e.abil.wis = ok_ ? 30 : 1; e.saveBonus = { ...(e.saveBonus ?? {}), wis: ok_ ? 30 : -20 }; };

// Play to the start of `id`'s turn, and say what the engine told on the way.
function advance(s, id) {
  const events = [];
  for (let i = 0; i < 60 && current(s) !== id; i++) events.push(...ok(apply(s, { type: "endTurn", actor: current(s) }, DM)).events);
  assert.equal(current(s), id);
  return events;
}
const rolledIn = (events) => { const m = events.map((e) => (e.type === "manual" && e.partial ? /rolled (\d+) on the d10/.exec(e.text) : null)).find(Boolean); return m ? Number(m[1]) : null; };
// The same game, with a dice seed that makes the creature's d10 come up as `want` says.
function withRoll(base, id, want) {
  for (let seed = 1; seed < 3000; seed++) {
    const s = structuredClone(base);
    s.rng = seed;
    const events = advance(s, id), roll = rolledIn(events);
    if (roll !== null && want(roll)) return { s, events, roll };
  }
  assert.fail("no seed gave that roll");
}
// A skeleton (or `monster`) at (6,0), the party out of the sphere's way or past its save, Confusion cast on it.
function confused({ monster = "skeleton", fails = true, extra = null } = {}) {
  const s = field();
  const sk = spawn(s, monster, 6, 0);
  sure(sk, !fails);
  for (const id of ["wizard", "cleric", "fighter", "rogue"]) sure(s.entities[id], true);
  extra?.(s, sk);
  fight(s); turnOf(s, "wizard");
  const cast = ok(apply(s, { type: "cast", actor: "wizard", spell: "confusion", hex: { q: 6, r: 0 }, slot: 4 }, DM));
  return { s, sk, cast };
}

// ---------- the entries ----------
test("Confusion, Bestow Curse and Dispel Evil and Good: assist, checked, lint, read in plain words with no problem", () => {
  for (const id of ["confusion", "bestow-curse", "dispel-evil-and-good"]) {
    const def = SPELLS[id].def;
    assert.equal(def.tier, "assist", id); assert.equal(def.checked, true, id);
    assert.deepEqual(lint(def), [], id);
    assert.deepEqual(readEntry("spell", def, {}).problems ?? [], [], id);
  }
  const c = SPELLS.confusion.def, b = SPELLS["bestow-curse"].def, d = SPELLS["dispel-evil-and-good"].def;
  assert.equal(c.level, 4); assert.equal(c.range, 90); assert.equal(c.duration, "1 minute"); assert.equal(c.concentration, true);
  assert.deepEqual(c.target.area, { shape: "sphere", size: 10 }); assert.equal(c.roll, "save:wis");
  assert.equal(b.level, 3); assert.equal(b.range, "touch"); assert.equal(b.duration, "1 minute"); assert.equal(b.concentration, true); assert.equal(b.roll, "save:wis");
  assert.deepEqual(b.choice, { of: "curse" });
  assert.equal(d.level, 5); assert.equal(d.range, "self"); assert.equal(d.duration, "1 minute"); assert.equal(d.concentration, true);
  assert.deepEqual(d.effects[0].modifier.from, ["celestial", "elemental", "fey", "fiend", "undead"]);
});

test("the new vocabulary: lint refuses a confuse step that cannot hold, an ifChoice with no curse, and an against that cannot be", () => {
  const c = SPELLS.confusion.def, b = SPELLS["bestow-curse"].def;
  const conf = (over) => ({ ...c, effects: [{ save: "wis", onFail: [{ confuse: true, ...over }] }] });
  assert.deepEqual(lint(conf({ ends: { on: "save", save: "wis", at: "turnEnd" } })), []);
  assert.ok(lint(conf({ confuse: 1 })).length, "true");
  assert.ok(lint({ ...conf({}), duration: "instant", concentration: false }).length, "must last");
  assert.ok(lint(conf({ ends: { on: "turnEnd" } })).length, "ends on a save at turn end");
  assert.ok(lint(conf({ ends: { on: "save", save: "wis", at: "turnStart" } })).length);
  const steps = (...x) => ({ ...b, effects: [{ save: "wis", onFail: x }] });
  const dis = { modifier: { on: "check", op: "disadvantage", scope: { ability: "chosen" } } };
  assert.deepEqual(lint(steps({ ...dis, ifChoice: ["str"] })), []);
  assert.ok(lint(steps({ ...dis, ifChoice: ["nope"] })).length, "a value of the choice");
  assert.ok(lint(steps({ ...dis, ifChoice: [] })).length);
  assert.ok(lint(steps({ ...dis, ifChoice: ["str", "str"] })).length);
  assert.ok(lint({ ...steps({ ...dis, ifChoice: ["str"] }), choice: { of: "ability" } }).length, "a curse choice only");
  assert.ok(lint({ ...steps({ ...dis, ifChoice: ["str"] }), choice: undefined }).length, "and a choice");
  assert.ok(lint({ ...steps({ ...dis, ifChoice: ["str"] }), choice: { of: "curse", from: ["str", "dex"] } }).length === 0, "from may narrow the list");
  assert.ok(lint({ ...steps({ ...dis, ifChoice: ["wis"] }), choice: { of: "curse", from: ["str", "dex"] } }).length, "but not name another");
  const atk = (m, extra = {}) => ({ ...b, choice: undefined, effects: [{ save: "wis", onFail: [{ modifier: m, ...extra }] }] });
  assert.deepEqual(lint(atk({ on: "attack.roll", op: "disadvantage", against: "source" })), []);
  assert.ok(lint(atk({ on: "check", op: "disadvantage", against: "source" })).length, "attack.roll only");
  assert.ok(lint(atk({ on: "attack.roll", op: "disadvantage", against: "source" }, { to: "caster" })).length, "on the target");
  assert.ok(lint(atk({ on: "attack.roll", op: "disadvantage", against: "target" })).length, "target needs to: caster");
});

// ---------- Dispel Evil and Good ----------
test("Dispel Evil and Good: Celestials, Elementals, Fey, Fiends and Undead have Disadvantage on attack rolls against the caster; a beast, an aberration and a humanoid do not", () => {
  const s = field();
  const skel = spawn(s, "skeleton", 1, 0), wolf = spawn(s, "wolf", 2, 1), gob = spawn(s, "goblin-warrior", 0, 1), abo = spawn(s, "aboleth", 5, -5);
  fight(s); turnOf(s, "cleric");
  const cast = ok(apply(s, { type: "cast", actor: "cleric", spell: "dispel-evil-and-good", slot: 5 }, DM));
  assert.ok(cast.events.some((e) => e.type === "manual" && /Break Enchantment/.test(e.text) && /Dismissal/.test(e.text)), "the two functions are the DM's");
  const fx = effect(s, "Dispel Evil and Good");
  assert.ok(fx.conc && fx.parts.length === 1 && fx.parts[0].target === "cleric" && fx.parts[0].modifier.on === "attack.received");
  const against = (m) => {
    turnOf(s, m.id);
    at(s.entities.cleric, 10, 10); at(m, 11, 10);
    const act = m.actions.find((x) => !x.multiattack && x.target?.creature?.reach !== undefined);
    const r = ok(apply(s, { type: "act", actor: m.id, action: act.id, target: "cleric" }, DM));
    return r.events.find((e) => e.type === "attack" && e.target === "cleric");
  };
  const a = against(skel);
  assert.equal(a.mode, "dis"); assert.deepEqual(a.why, ["Dispel Evil and Good"]);
  assert.notEqual(against(wolf).mode, "dis", "a beast");
  assert.notEqual(against(abo).mode, "dis", "an aberration is not on the list (Protection from Evil and Good has it, this spell does not)");
  assert.notEqual(against(gob).mode, "dis", "a humanoid");
});

test("Dispel Evil and Good: it needs Concentration, and goes when the caster loses it", () => {
  const s = field();
  spawn(s, "skeleton", 8, 0);
  fight(s); turnOf(s, "cleric");
  ok(apply(s, { type: "cast", actor: "cleric", spell: "dispel-evil-and-good", slot: 5 }, DM));
  assert.ok(effect(s, "Dispel Evil and Good"));
  turnOf(s, "wizard"); turnOf(s, "cleric");
  ok(apply(s, { type: "cast", actor: "cleric", spell: "confusion", hex: { q: 8, r: 0 }, slot: 4 }, DM));
  assert.ok(!effect(s, "Dispel Evil and Good"), "another Concentration spell ends it");
});

// ---------- Confusion ----------
test("Confusion: only a creature that fails the Wisdom save is confused, only in the 10-foot sphere, and it cannot take a Reaction or a Bonus Action", () => {
  const s = field();
  const a = spawn(s, "skeleton", 6, 0), b = spawn(s, "skeleton", 7, 0), c = spawn(s, "skeleton", 10, 0);
  sure(a, false); sure(b, true); sure(c, false);
  for (const id of ["wizard", "cleric", "fighter", "rogue"]) sure(s.entities[id], true);
  fight(s); turnOf(s, "wizard");
  const cast = ok(apply(s, { type: "cast", actor: "wizard", spell: "confusion", hex: { q: 6, r: 0 }, slot: 4 }, DM));
  const parts = effect(s, "Confusion").parts;
  assert.deepEqual(parts.map((p) => p.target), [a.id], "b made the save, c is 20 feet from the centre");
  assert.ok(parts[0].confuse && parts[0].ends.on === "save" && parts[0].ends.at === "turnEnd" && parts[0].dc > 0);
  assert.equal(canReact(a), false, "no Reaction"); assert.equal(canReact(b), true);
  assert.ok(cast.events.some((e) => e.type === "manual" && e.partial && /Confused/.test(e.text)));
  turnOf(s, a.id);
  assert.equal(s.encounter.budget.bonus, 0, "no Bonus Action");
  assert.equal(a.reactionUsed, true, "still no Reaction on its turn");
});

test("Confusion: a 1 takes its movement and action and names a direction for the DM to walk it", () => {
  const { s, sk } = confused();
  const { s: t, events, roll } = withRoll(s, sk.id, (r) => r === 1);
  assert.equal(roll, 1);
  assert.deepEqual({ ...t.encounter.budget, dashes: 0 }, { move: 0, action: 0, bonus: 0, dashes: 0 });
  const m = events.find((e) => e.type === "manual" && e.partial && /rolled 1 on the d10/.test(e.text));
  assert.match(m.text, /move (north|east|south|west)\b/); assert.match(m.text, /DM moves it/);
  assert.ok(!Object.keys(t.encounter.flags).some((k) => k.startsWith("confused")));
});

test("Confusion: a 2 to 6 takes its movement, action and Bonus Action; a 9 or 10 takes only the Bonus Action and the Reaction", () => {
  const { s, sk } = confused();
  for (const [want, budget] of [[(r) => r >= 2 && r <= 6, { move: 0, action: 0, bonus: 0 }], [(r) => r >= 9, { action: 1, bonus: 0 }]]) {
    const { s: t, events, roll } = withRoll(s, sk.id, want);
    const b = t.encounter.budget;
    for (const [k, v] of Object.entries(budget)) assert.equal(b[k], v, `${k} on a ${roll}`);
    if (roll >= 9) assert.ok(b.move > 0, "it moves as it chooses");
    assert.equal(t.entities[sk.id].reactionUsed, true);
    assert.ok(events.some((e) => e.type === "manual" && e.partial && new RegExp(`rolled ${roll} on the d10`).test(e.text)));
  }
});

test("Confusion: a 7 or 8 does not move, picks a creature in reach, and allows one attack at that one only", () => {
  const { s, sk } = confused({ extra: (g) => { Object.assign(g.entities.rogue.pos, { q: 7, r: 0 }); Object.assign(g.entities.fighter.pos, { q: 5, r: 0 }); } });
  const { s: t, events, roll } = withRoll(s, sk.id, (r) => r === 7 || r === 8);
  const b = t.encounter.budget;
  assert.equal(b.move, 0); assert.equal(b.action, 1); assert.equal(b.bonus, 0);
  const keys = Object.keys(t.encounter.flags);
  assert.ok(keys.includes(`confused:${sk.id}`));
  const foe = keys.find((k) => k.startsWith(`confusedFoe:${sk.id}:`)).split(":")[2];
  assert.ok(["rogue", "fighter"].includes(foe), "the two beside it");
  const other = foe === "rogue" ? "fighter" : "rogue";
  assert.ok(events.some((e) => e.type === "manual" && e.partial && e.text.includes(t.entities[foe].name) && /2 within/.test(e.text)), `rolled ${roll}`);
  const refused = apply(t, { type: "attack", actor: sk.id, target: other, attack: sk.attacks?.[0]?.id ?? "shortsword" }, DM);
  assert.equal(refused.ok, false); assert.match(refused.error, /Confused/);
  const act = sk.actions.find((x) => !x.multiattack);
  // an attack record, or a monster's action: whichever the creature has, at the creature chosen
  const go = sk.attacks?.length ? { type: "attack", actor: sk.id, target: foe, attack: sk.attacks[0].id } : { type: "attack", actor: sk.id, target: foe, attack: act.id };
  const done = apply(t, go, DM);
  assert.ok(done.ok, done.error);
});

test("Confusion: the brain makes that one attack at the chosen creature and nothing else; on any other roll it ends its turn", () => {
  const { s, sk } = confused({ extra: (g) => { Object.assign(g.entities.rogue.pos, { q: 7, r: 0 }); } });
  const hit = withRoll(s, sk.id, (r) => r === 7 || r === 8);
  const step = aiStep(hit.s, sk.id);
  assert.equal(step.type === "attack" || step.type === "act", true, JSON.stringify(step));
  assert.equal(step.target, "rogue");
  ok(apply(hit.s, step, DM));
  assert.deepEqual(aiStep(hit.s, sk.id), { type: "endTurn", actor: sk.id }, "one attack, then the turn ends");
  for (const want of [(r) => r === 1, (r) => r >= 2 && r <= 6]) {
    const t = withRoll(s, sk.id, want);
    assert.deepEqual(aiStep(t.s, sk.id), { type: "endTurn", actor: sk.id });
  }
});

test("Confusion: a 7 or 8 with nobody in reach picks nobody, and the DM is told; the creature is not held to a target", () => {
  const { s, sk } = confused({ extra: (g) => { Object.assign(g.entities.rogue.pos, { q: 12, r: 6 }); Object.assign(g.entities.fighter.pos, { q: -5, r: 0 }); } });
  const { s: t, events } = withRoll(s, sk.id, (r) => r === 7 || r === 8);
  assert.ok(!Object.keys(t.encounter.flags).some((k) => k.startsWith("confusedFoe")));
  assert.ok(events.some((e) => e.type === "manual" && e.partial && /No creature the party knows of is within 5 feet/.test(e.text)));
  assert.deepEqual(aiStep(t, sk.id), { type: "endTurn", actor: sk.id });
});

test("Confusion: a creature the party does not know of is never picked, whether it is one in reach or not, and the dice are drawn the same either way", () => {
  const mk = (hidden) => confused({ extra: (g) => { Object.assign(g.entities.rogue.pos, { q: 7, r: 0 }); spawn(g, "skeleton", 6, 1).hiding = hidden; } });
  const a = mk(true), b = mk(false);
  sure(a.s.entities.m12 ?? Object.values(a.s.entities).find((e) => e.id !== a.sk.id && e.side !== "party"), true);
  const rolls = (g) => { const t = withRoll(g.s, g.sk.id, (r) => r === 7 || r === 8); return { t, foe: Object.keys(t.s.encounter.flags).find((k) => k.startsWith("confusedFoe"))?.split(":")[2] }; };
  const ra = rolls(a), rb = rolls(b);
  assert.equal(ra.foe, "rogue", "the hidden skeleton is not in the pool");
  assert.ok(["rogue", rb.t.s.entities[Object.keys(rb.t.s.entities).find((k) => k !== a.sk.id && rb.t.s.entities[k].name === "Skeleton 2")]?.id].filter(Boolean).includes(rb.foe));
});

test("Confusion: what a roll says is told to the DM alone, and a player is sent no roll, no direction and no name", () => {
  const { s, sk } = confused({ extra: (g) => { Object.assign(g.entities.rogue.pos, { q: 7, r: 0 }); } });
  const { s: t, events } = withRoll(s, sk.id, (r) => r === 7 || r === 8);
  const player = { role: "player", userId: "u-rogue", chars: ["rogue"] };
  const seen = viewEvents(events, t, player);
  assert.ok(!JSON.stringify(seen).includes("d10"), "no roll");
  assert.ok(!seen.some((e) => e.type === "manual" && e.partial));
  assert.ok(viewEvents(events, t, DM).some((e) => e.type === "manual" && /d10/.test(e.text)));
});

test("Confusion: a successful save at the end of its turn ends it on that creature, and its Reaction is its own again", () => {
  const { s, sk } = confused();
  const { s: t } = withRoll(s, sk.id, (r) => r >= 2 && r <= 6);
  const me = t.entities[sk.id];
  sure(me, true);
  const ended = ok(apply(t, { type: "endTurn", actor: sk.id }, DM)).events;
  assert.ok(ended.some((e) => e.type === "save" && e.id === sk.id && e.against === "Confusion" && e.success));
  assert.ok(!effect(t, "Confusion"), "nothing is left of it");
  assert.equal(me.reactionUsed, false); assert.equal(canReact(me), true);
});

test("Confusion: a failed save at the end of its turn leaves it confused, and the next turn rolls again", () => {
  const { s, sk } = confused();
  const { s: t } = withRoll(s, sk.id, (r) => r >= 2 && r <= 6);
  const ended = ok(apply(t, { type: "endTurn", actor: sk.id }, DM)).events;
  assert.ok(ended.some((e) => e.type === "save" && e.id === sk.id && e.against === "Confusion" && !e.success));
  assert.ok(effect(t, "Confusion"));
  const next = advance(t, sk.id);
  assert.ok(rolledIn(next) !== null, "a new roll");
});

test("Confusion: when the caster loses Concentration it ends on everyone and the Reaction a creature had comes back", () => {
  const { s, sk } = confused({ extra: (g, m) => { m.reactionUsed = false; } });
  assert.equal(s.entities[sk.id].reactionUsed, true);
  assert.ok(effect(s, "Confusion"));
  s.entities.wizard.spells.push("fire-bolt"); s.entities.wizard.concentration = undefined;
  ok(apply(s, { type: "endTurn", actor: "wizard" }, DM));
  turnOf(s, "wizard");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "confusion", hex: { q: 12, r: 0 }, slot: 4 }, DM));
  assert.ok(!effect(s, "Confusion")?.parts.some((p) => p.target === sk.id), "the first one is gone");
  assert.equal(s.entities[sk.id].reactionUsed, false);
});

test("Confusion: a creature that had used its Reaction has not got it back when the spell ends", () => {
  const { s, sk } = confused({ extra: (g, m) => { m.reactionUsed = true; } });
  const { s: t } = withRoll(s, sk.id, (r) => r >= 2 && r <= 6);
  assert.equal(t.entities[sk.id].reactionUsed, true);
  const gone = structuredClone(t);
  const fx = gone.effects.find((x) => x.name === "Confusion");
  ok(apply(gone, { type: "endEffect", actor: "wizard", effect: fx.id }, DM));
  assert.ok(!gone.effects.some((x) => x.name === "Confusion"));
});

test("Confusion: a slot above 4 is the DM's to widen: the engine keeps ten feet and says so", () => {
  const { cast } = confused();
  assert.ok(cast.events.some((e) => e.type === "manual" && /grows 5 feet for each slot level above 4/.test(e.text)));
});

// ---------- Bestow Curse ----------
// The cleric touches the fighter's neighbour: a skeleton set beside the cleric that fails its save.
function cursed(curse, { fails = true } = {}) {
  const s = field();
  const sk = spawn(s, "skeleton", 0, 1);
  s.entities.cleric.pos = { q: 1, r: 0, z: 0 };
  sure(sk, !fails);
  fight(s); turnOf(s, "cleric");
  const cast = apply(s, { type: "cast", actor: "cleric", spell: "bestow-curse", target: sk.id, ...(curse ? { choice: curse } : {}) }, DM);
  return { s, sk, cast };
}
test("Bestow Curse: a curse must be chosen, and a refused cast changes nothing", () => {
  const s = field(); const sk = spawn(s, "skeleton", 0, 1); s.entities.cleric.pos = { q: 1, r: 0, z: 0 };
  fight(s); turnOf(s, "cleric");
  const before = JSON.stringify(s);
  assert.equal(apply(s, { type: "cast", actor: "cleric", spell: "bestow-curse", target: sk.id }, DM).ok, false);
  assert.equal(apply(s, { type: "cast", actor: "cleric", spell: "bestow-curse", target: sk.id, choice: "fire" }, DM).ok, false);
  assert.equal(JSON.stringify(s), before);
});

test("Bestow Curse: a creature that makes the save is not cursed, and one that fails has only the curse chosen", () => {
  const safe = cursed("attacks", { fails: false });
  ok(safe.cast);
  assert.equal(effect(safe.s, "Bestow Curse")?.parts.length ?? 0, 0);
  for (const [curse, want] of [["str", ["check", "save"]], ["wis", ["check", "save"]], ["attacks", ["attack.roll"]], ["dodge", ["turn"]], ["damage", ["damage.dealt"]]]) {
    const { s, cast } = cursed(curse); ok(cast);
    const parts = effect(s, "Bestow Curse").parts.map((p) => p.modifier?.on ?? (p.turn ? "turn" : "?"));
    assert.deepEqual(parts, want, curse);
  }
});

test("Bestow Curse: an ability curse gives Disadvantage on that ability's checks and saves, and no other ability's", () => {
  const { s, sk } = cursed("str");
  const check = (ability) => ok(apply(s, { type: "check", actor: sk.id, ability, dc: 10 }, DM)).events.find((e) => e.type === "check");
  const save = (ability) => ok(apply(s, { type: "save", who: [sk.id], ability, dc: 10 }, DM)).events.find((e) => e.type === "save");
  assert.equal(check("str").mode, "dis"); assert.notEqual(check("dex").mode, "dis");
  assert.equal(save("str").mode, "dis"); assert.notEqual(save("wis").mode, "dis");
  const wis = cursed("wis");
  assert.equal(ok(apply(wis.s, { type: "check", actor: wis.sk.id, ability: "wis", dc: 10 }, DM)).events.find((e) => e.type === "check").mode, "dis");
});

test("Bestow Curse: the attack curse gives Disadvantage on its attack rolls against the caster only", () => {
  const { s, sk } = cursed("attacks");
  turnOf(s, sk.id);
  const act = sk.actions.find((x) => !x.multiattack && x.target?.creature?.reach !== undefined);
  const hit = (target) => ok(apply(s, { type: "act", actor: sk.id, action: act.id, target }, DM)).events.find((e) => e.type === "attack" && e.target === target);
  const a = hit("cleric");
  assert.equal(a.mode, "dis"); assert.deepEqual(a.why, ["Bestow Curse"]);
});

test("Bestow Curse: the attack curse leaves attacks against anyone else alone", () => {
  const { s, sk } = cursed("attacks");
  s.entities.fighter.pos = { q: 1, r: 1, z: 0 };
  turnOf(s, sk.id);
  const act = sk.actions.find((x) => !x.multiattack && x.target?.creature?.reach !== undefined);
  const b = ok(apply(s, { type: "act", actor: sk.id, action: act.id, target: "fighter" }, DM)).events.find((e) => e.type === "attack" && e.target === "fighter");
  assert.notEqual(b.mode, "dis");
});

test("Bestow Curse: the damage curse adds 1d8 Necrotic to the caster's damage against the cursed creature only", () => {
  const { s, sk } = cursed("damage");
  const other = spawn(s, "skeleton", 1, 1); other.saveBonus = { dex: -20 };
  ok(apply(s, { type: "endTurn", actor: "cleric" }, DM));
  turnOf(s, "cleric");
  s.entities.cleric.spells.push("sacred-flame");
  const dealt = (target) => { const r = ok(apply(s, { type: "cast", actor: "cleric", spell: "sacred-flame", target }, DM)); return r.events.filter((e) => e.type === "damage" && e.target === target); };
  const flames = dealt(other.id);                      // a creature that is not cursed: the damage curse is not on it
  assert.ok(!JSON.stringify(flames).includes("necrotic"));
  ok(apply(s, { type: "endTurn", actor: "cleric" }, DM)); turnOf(s, "cleric");
  sk.saveBonus = { ...sk.saveBonus, dex: -20 };
  const cursedHit = dealt(sk.id);
  assert.ok(cursedHit.some((e) => e.dtype === "necrotic" && e.amount >= 1 && e.amount <= 8 && e.dice[0].sides === 8), "an extra 1d8 of Necrotic damage");
  assert.ok(flames.some((e) => e.dtype === "radiant"), "the other creature took the spell's own damage");
});

test("Bestow Curse: the Dodge curse rolls a Wisdom save at the start of each of its turns and hands a failure to the DM", () => {
  const { s, sk } = cursed("dodge");
  const events = advance(s, sk.id);
  const sv = events.find((e) => e.type === "save" && e.id === sk.id && e.abil === "wis");
  assert.ok(sv, "a save");
  assert.ok(events.some((e) => e.type === "manual" && /Dodge curse/.test(e.text)), "failed: the DM sets the Dodge action");
  const t2 = cursed("dodge", {});
  sure(t2.s.entities[t2.sk.id], true);
  t2.s.entities[t2.sk.id].saveBonus = { wis: 40 }; t2.s.entities[t2.sk.id].abil.wis = 30;
  const ev2 = advance(t2.s, t2.sk.id);
  assert.ok(!ev2.some((e) => e.type === "manual" && /Dodge curse/.test(e.text)), "made the save: nothing");
});

test("Bestow Curse: it lasts a minute of Concentration, and ends with it", () => {
  const { s } = cursed("str");
  const fx = effect(s, "Bestow Curse");
  assert.ok(fx.conc && fx.lasts === "1 minute");
  ok(apply(s, { type: "endTurn", actor: "cleric" }, DM)); turnOf(s, "cleric");
  ok(apply(s, { type: "cast", actor: "cleric", spell: "dispel-evil-and-good", slot: 5 }, DM));
  assert.ok(!effect(s, "Bestow Curse"));
});

test("Bestow Curse: the longer time of a higher slot is told to the DM", () => {
  const { cast } = cursed("str");
  assert.ok(ok(cast).events.some((e) => e.type === "manual" && /level 9: until dispelled/.test(e.text)));
});
