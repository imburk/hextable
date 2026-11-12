// Effect steps: spells played from their data (task R2 of docs/specs/rules-expansion.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, SPELLS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";
import { addDice, scaleSteps, spellProfile, targetCount } from "../src/effects.js";
import { apply, current, inFight } from "../src/engine.js";
import * as H from "../src/hex.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PLAYER = { role: "player", userId: "pat" };
const base = CONTENT.spells["fire-bolt"];

// Teach the wizard a spell that is not in the pack. It must pass the linter like any other.
function learn(s, over) {
  const def = { ...structuredClone(base), higher: undefined, ...over };
  assert.deepEqual(lintPack({ pack: { id: "test", name: "t", license: "x", attribution: "x" }, spells: [def] }), [], def.id);
  SPELLS[def.id] = spellProfile(def);
  s.entities.wizard.spells.push(def.id);
  return def.id;
}
// Open ground, no starting monsters, auto-engage off, and the wizard with plenty of slots.
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM);
  Object.assign(s.entities.wizard, { slots: { 1: 4, 2: 3, 3: 3 }, slotsMax: { 1: 4, 2: 3, 3: 3 } });
  return s;
}
const add = (s, monster, at) => { const r = apply(s, { type: "spawn", monster, at }, DM); assert.ok(r.ok, r.error); return s.entities[r.events[0].id]; };
const fight = (s) => { const r = apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM); assert.ok(r.ok, r.error); };
// Give the wizard the turn.
const wizardsTurn = (s) => { for (let i = 0; i < 20 && current(s) !== "wizard"; i++) apply(s, { type: "endTurn", actor: current(s) }, DM); assert.equal(current(s), "wizard"); };
const cast = (s, spell, extra = {}) => apply(s, { type: "cast", actor: "wizard", spell, ...extra }, DM);

test("dice add up, and refuse to mix sizes", () => {
  assert.equal(addDice("3d6", "1d6", 2), "5d6");
  assert.equal(addDice("2d8+1", "1d8", 1), "3d8+1");
  assert.equal(addDice("1d4+1", "1d4+1", 2), "3d4+3");
  assert.equal(addDice("2d6", "1d8", 1), null);
});

test("cantrips grow with character level and levelled spells with the slot spent", () => {
  const dice = (def, level, slot) => { let found = null; const walk = (st) => st.forEach((x) => { found ??= x.damage ?? x.heal; for (const b of ["onHit", "onFail"]) if (x[b]) walk(x[b]); }); walk(scaleSteps(def, level, slot).steps); return found; };
  assert.deepEqual([1, 4, 5, 10, 11, 17, 20].map((l) => dice(CONTENT.spells["fire-bolt"], l, 0)), ["1d10", "1d10", "2d10", "2d10", "3d10", "4d10", "4d10"]);
  assert.equal(dice(CONTENT.spells["burning-hands"], 5, 1), "3d6");
  assert.equal(dice(CONTENT.spells["burning-hands"], 5, 3), "5d6");
  assert.equal(dice(CONTENT.spells["cure-wounds"], 1, 2), "4d8");
  // Magic Missile's darts are targets now (one creature may take several): five at level 3.
  assert.equal(targetCount(CONTENT.spells["magic-missile"], 1, 3), 5);
  assert.equal(targetCount(CONTENT.spells["eldritch-blast"], 11, 0), 3);
  // `higher.slot.times` still adds damage rolls.
  const twice = { ...CONTENT.spells["fire-bolt"], level: 1, higher: { slot: { times: 1 } } };
  assert.equal(scaleSteps(twice, 1, 3).steps[0].onHit[0].times, 3);
  assert.equal(CONTENT.spells["fire-bolt"].effects[0].onHit[0].times, undefined, "the pack's own data is never altered");
});

test("upcasting spends the higher slot and is refused when that slot is missing or too low", () => {
  const s = field();
  const goblin = add(s, "goblin-warrior", { q: 2, r: 0 });
  fight(s); wizardsTurn(s);
  assert.match(cast(s, "magic-missile", { target: goblin.id, slot: 4 }).error, /no level 4 spell slots/);
  assert.match(cast(s, "magic-missile", { target: goblin.id, slot: 0 }).error, /level 1 or higher/);
  goblin.hp = goblin.maxHp = 500;
  assert.match(cast(s, "magic-missile", { targets: Array(6).fill(goblin.id), slot: 3 }).error, /has 5 targets/);
  const res = cast(s, "magic-missile", { targets: Array(5).fill(goblin.id), slot: 3 });
  assert.ok(res.ok, res.error);
  assert.deepEqual(s.entities.wizard.slots, { 1: 4, 2: 3, 3: 2 });
  assert.equal(res.events[0].slot, 3);
  const dmg = res.events.filter((e) => e.type === "damage").reduce((n, e) => n + e.amount, 0);
  assert.ok(dmg >= 10 && dmg <= 25, `five darts of 1d4+1 should total 10 to 25, got ${dmg}`);
});

test("a spell the engine cannot apply still costs what it costs, and tells the table what it does", () => {
  const s = field();
  const id = learn(s, { id: "test-wish", level: 2, target: { creature: { count: 1 } }, range: 30, tier: "manual",
    effects: [{ manual: "The target is turned to stone until the DM says otherwise." }] });
  const near = add(s, "goblin-warrior", { q: 2, r: 0 }), far = add(s, "wolf", { q: 7, r: 0 });
  fight(s); wizardsTurn(s);

  assert.match(cast(s, id, { target: far.id }).error, /35 ft away.*reaches 30 ft/);
  const before = structuredClone(s);
  const res = cast(s, id, { target: near.id });
  assert.ok(res.ok, res.error);
  assert.deepEqual(res.events.map((e) => e.type), ["cast", "manual"]);
  assert.equal(res.events[1].text, "The target is turned to stone until the DM says otherwise.");
  assert.equal(s.entities.wizard.slots[2], before.entities.wizard.slots[2] - 1);
  assert.equal(s.encounter.budget.action, 0);
  assert.deepEqual(s.entities[near.id], before.entities[near.id], "the engine changed nothing it does not understand");
  assert.match(cast(s, id, { target: near.id }).error, /already used an action/);
  // Players are told too: it is their spell.
  assert.deepEqual(viewEvents(res.events, s, PLAYER).map((e) => e.type), ["cast", "manual"]);
});

test("a partly applied spell notes what was left out, for the DM only", () => {
  const s = field();
  const goblin = add(s, "goblin-warrior", { q: 2, r: 0 });
  goblin.hp = goblin.maxHp = 500;                                       // so the fight outlasts the test
  fight(s); wizardsTurn(s);
  const id = learn(s, { id: "test-darts", level: 1, range: 120, tier: "assist", text: "Darts the DM may split between targets.",
    effects: [{ damage: "1d4+1", type: "force" }] });
  const res = cast(s, id, { target: goblin.id });
  const note = res.events.find((e) => e.type === "manual");
  assert.equal(note.partial, true);
  assert.match(note.text, /split/);
  assert.equal(viewEvents(res.events, s, PLAYER).some((e) => e.type === "manual"), false);
  assert.equal(cast(s, "fire-bolt", { target: goblin.id }).ok, false);          // action already used
  // A fully automatic spell says nothing extra.
  apply(s, { type: "endTurn", actor: "wizard" }, DM); wizardsTurn(s);
  assert.equal(cast(s, "fire-bolt", { target: goblin.id }).events.some((e) => e.type === "manual"), false);
});

test("a sphere hits everyone in it, friend or foe, with one damage roll and half on a save", () => {
  const s = field(9);
  const id = learn(s, { id: "test-fireball", level: 3, range: 150, target: { area: { shape: "sphere", size: 10 } },
    effects: [{ save: "dex", half: true, onFail: [{ damage: "8d6", type: "fire" }] }] });
  const foes = [{ q: 6, r: 0 }, { q: 7, r: 0 }, { q: 6, r: 1 }, { q: 8, r: -1 }].map((at) => add(s, "goblin-warrior", at));
  const outside = add(s, "wolf", { q: 6, r: 4 });
  apply(s, { type: "place", actor: "fighter", to: { q: 5, r: 0 } }, DM);
  for (const e of [...foes, s.entities.fighter]) e.hp = e.maxHp = 400;
  fight(s); wizardsTurn(s);

  assert.match(cast(s, id, {}).error, /Pick where/);
  assert.match(cast(s, id, { hex: { q: 0, r: 31 } }).error, /reaches 150 ft/);
  const res = cast(s, id, { hex: { q: 6, r: 0 } });
  assert.ok(res.ok, res.error);
  const hit = res.events[0].targets;
  assert.deepEqual([...hit].sort(), [...foes.map((f) => f.id), "fighter"].sort());
  assert.equal(hit.includes(outside.id), false);
  const saves = res.events.filter((e) => e.type === "save"), dmg = res.events.filter((e) => e.type === "damage");
  assert.equal(saves.length, 5);
  assert.equal(dmg.length, 5);
  const full = new Set(), half = new Set();
  for (const d of dmg) (saves.find((x) => x.id === d.target).success ? half : full).add(d.amount);
  assert.ok(full.size <= 1 && half.size <= 1, "everyone shares one roll");
  if (full.size && half.size) assert.equal([...half][0], Math.floor([...full][0] / 2));
  assert.equal(s.entities.wizard.slots[3], 2);
});

test("an emanation surrounds the caster, spares the caster, and needs no aim", () => {
  const s = field();
  const id = learn(s, { id: "test-thunder", level: 1, range: "self", target: { area: { shape: "emanation", size: 10 } },
    effects: [{ save: "con", half: true, onFail: [{ damage: "2d8", type: "thunder" }] }] });
  const near = add(s, "goblin-warrior", { q: 2, r: 0 }), far = add(s, "wolf", { q: 3, r: 0 });
  fight(s); wizardsTurn(s);
  const res = cast(s, id);
  assert.ok(res.ok, res.error);
  assert.deepEqual(res.events[0].targets, [near.id]);
  assert.equal(res.events.some((e) => e.target === "wizard"), false);
  assert.equal(res.events.some((e) => e.target === far.id), false);
});

test("a shape the engine cannot lay out yet is handed to the DM, not guessed", () => {
  const s = field();
  // A Line placed at a distance is a wall of any shape (Wind Wall): nothing for the engine to lay out.
  const id = learn(s, { id: "test-bolt", level: 3, range: 120, target: { area: { shape: "line", size: 100 } },
    effects: [{ save: "dex", half: true, onFail: [{ damage: "8d6", type: "lightning" }] }] });
  assert.equal(SPELLS[id].aim, "none");
  const goblin = add(s, "goblin-warrior", { q: 2, r: 0 });
  const hp = goblin.hp;
  const res = cast(s, id);
  assert.ok(res.ok, res.error);
  assert.deepEqual(res.events.map((e) => e.type), ["cast", "manual"]);
  assert.match(res.events[1].text, /nobody to apply/);
  assert.equal(goblin.hp, hp);
  assert.equal(s.entities.wizard.slots[3], 2);
});

test("a condition the engine does not enforce yet is recorded and flagged; one it enforces is applied", () => {
  const s = field();
  const hold = learn(s, { id: "test-hold", level: 2, range: 60, effects: [{ save: "wis", onFail: [{ condition: "paralyzed" }] }] });
  const trip = learn(s, { id: "test-trip", level: 0, range: 60, effects: [{ save: "str", onFail: [{ condition: "prone" }] }] });
  const goblin = add(s, "goblin-warrior", { q: 2, r: 0 });
  Object.assign(goblin.abil, { wis: 1, str: 1 });                       // it will fail
  fight(s); wizardsTurn(s);
  let res = cast(s, hold, { target: goblin.id });
  assert.ok(res.ok, res.error);
  if (!res.events.find((e) => e.type === "save").success) {
    assert.ok(goblin.cond.paralyzed);
    assert.match(res.events.find((e) => e.type === "manual").text, /Nothing ends it yet/);
  }
  apply(s, { type: "endTurn", actor: "wizard" }, DM); wizardsTurn(s);
  res = cast(s, trip, { target: goblin.id });
  if (!res.events.find((e) => e.type === "save").success) {
    assert.ok(goblin.cond.prone);
    assert.equal(res.events.some((e) => e.type === "manual"), false);
  }
  // Either way the dice were against a goblin with a -5 modifier and DC 13: at least one of the two landed.
  assert.ok(goblin.cond.paralyzed || goblin.cond.prone);
});

test("a step that depends on something the engine cannot judge is handed over, and steps it can judge are obeyed", () => {
  const s = field();
  const lit = learn(s, { id: "test-when", level: 0, range: 60,
    effects: [{ attack: "ranged", kind: "spell", onHit: [{ damage: "1d4", type: "fire" }, { damage: "9d4", type: "fire", when: ["attack.advantage"] }, { damage: "1d4", type: "cold", when: ["attacker.unseen"] }] }] });
  const goblin = add(s, "goblin-warrior", { q: 4, r: 0 });
  goblin.hp = goblin.maxHp = 900; goblin.ac = 1;
  fight(s);
  let hits = 0;
  for (let i = 0; i < 6; i++) {
    wizardsTurn(s);
    const res = cast(s, lit, { target: goblin.id });
    assert.ok(res.ok, res.error);
    if (res.events.find((e) => e.type === "attack").hit) {
      hits++;
      assert.equal(res.events.filter((e) => e.type === "damage").length, 1, "no Advantage, so the big extra damage is skipped");
      assert.match(res.events.find((e) => e.type === "manual").text, /attacker\.unseen.*cannot judge/);
    }
    apply(s, { type: "endTurn", actor: "wizard" }, DM);
  }
  assert.ok(hits > 0);
});

test("casting time: reactions are refused, long rituals only outside a fight, and lasting spells become effects", () => {
  const s = field();
  const shield = learn(s, { id: "test-shield", level: 1, time: "reaction", range: "self", target: { self: true }, tier: "manual", effects: [{ manual: "+5 AC until your next turn." }] });
  const ritual = learn(s, { id: "test-alarm", level: 1, time: "minute", range: 30, target: { self: true }, duration: "8 hours", tier: "manual", effects: [{ manual: "An alarm is set." }] });
  const bless = learn(s, { id: "test-bless", level: 1, range: 30, target: { self: true }, duration: "1 minute", concentration: true, tier: "manual", effects: [{ manual: "Add 1d4 to attacks and saves." }] });
  assert.match(cast(s, shield).error, /Reaction/);

  const out = cast(s, ritual);
  assert.ok(out.ok, out.error);
  assert.deepEqual(out.events.map((e) => e.type), ["cast", "effectStart", "manual"]);
  assert.deepEqual([out.events[1].lasts, out.events[1].conc], ["8 hours", false]);
  add(s, "goblin-warrior", { q: 2, r: 0 }); fight(s); wizardsTurn(s);
  assert.match(cast(s, ritual).error, /longer than a turn/);
  const res = cast(s, bless);
  assert.deepEqual([res.events[1].type, res.events[1].lasts, res.events[1].conc], ["effectStart", "1 minute", true]);
});

test("nothing is left on the stack after an action, whether it worked or not", () => {
  const s = field();
  const goblin = add(s, "goblin-warrior", { q: 2, r: 0 });
  fight(s); wizardsTurn(s);
  for (const action of [
    { type: "cast", actor: "wizard", spell: "burning-hands", hex: goblin.pos },
    { type: "cast", actor: "wizard", spell: "fire-bolt", target: "nobody" },
    { type: "cast", actor: "wizard", spell: "magic-missile", target: goblin.id },
    { type: "endTurn", actor: "wizard" },
  ]) { apply(s, action, DM); assert.equal("stack" in s, false, JSON.stringify(action)); }
  assert.equal("stack" in view(s, PLAYER), false);
});

test("a whole fight with spells replays identically from the same seed", () => {
  const play = () => {
    const s = newGame(21);
    for (const e of Object.values(s.entities)) if (e.side !== "party") e.hp = e.maxHp = 60;      // a fight long enough to use every spell
    apply(s, { type: "place", actor: "m1", to: H.neighbors(s.entities.wizard.pos).find((h) => s.map.levels[0].tiles[H.key(h)]?.t === "grass" && !Object.values(s.entities).some((e) => H.key(e.pos) === H.key(h))) }, DM);
    apply(s, { type: "cast", actor: "wizard", spell: "fire-bolt", target: "m1" }, DM);
    for (let i = 0; i < 80 && s.encounter; i++) {
      const id = current(s), e = s.entities[id];
      const foe = Object.values(s.entities).find((x) => x.side !== e.side && x.hp > 0 && !x.dead && inFight(s, x.id));
      if (foe && e.spells.length) apply(s, { type: "cast", actor: id, spell: e.spells[i % e.spells.length], target: foe.id, hex: foe.pos }, DM);
      else if (foe) apply(s, { type: "attack", actor: id, target: foe.id, attack: e.attacks.at(-1).id }, DM);
      if (s.encounter && current(s) === id) apply(s, { type: "endTurn", actor: id }, DM);
    }
    return s;
  };
  const a = play(), b = play();
  assert.ok(a.timeline.filter((e) => e.type === "cast").length > 3);
  assert.deepEqual(a, b);
});
