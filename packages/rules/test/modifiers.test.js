// The modifier system and conditions as data (task R3 of docs/specs/rules-expansion.md).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import { CONTENT, PACKS } from "../src/content/index.js";
import { CONDITIONS, lintPack } from "../src/content/schema.js";
import { apply, blocked, current, inFight, moveOptions, rollMode } from "../src/engine.js";
import * as H from "../src/hex.js";
import { migrate, VERSION } from "../src/migrate.js";
import { conditionsOf, incapacitated, modifiers, speedOf } from "../src/modifiers.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" }, PLAYER = { role: "player", userId: "pat" };
const melee = { name: "Sword", type: "melee", bonus: 5, reach: 5 };
const bow = { name: "Bow", type: "ranged", bonus: 5, range: [80, 320] };

// Open ground with Brenna at the centre, a goblin beside her and a wolf four hexes off.
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  apply(s, { type: "place", actor: "fighter", to: { q: 0, r: 0 } }, DM);
  const spawn = (monster, at) => s.entities[apply(s, { type: "spawn", monster, at }, DM).events[0].id];
  return { s, brenna: s.entities.fighter, goblin: spawn("goblin-warrior", { q: 1, r: 0 }), wolf: spawn("wolf", { q: 4, r: 0 }), spawn };
}
const give = (s, e, condition, level) => { const r = apply(s, { type: "condition", actor: e.id, condition, on: true, level }, DM); assert.ok(r.ok, r.error); return r; };
const fight = (s) => assert.ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM).ok);
const turnOf = (s, id) => { for (let i = 0; i < 30 && current(s) !== id; i++) apply(s, { type: "endTurn", actor: current(s) }, DM); assert.equal(current(s), id); };

test("all fifteen conditions are entered and pass the linter", () => {
  const [srd] = PACKS;
  assert.deepEqual(srd.conditions.map((c) => c.id).sort(), [...CONDITIONS].sort());
  assert.deepEqual(lintPack(srd), []);
  const broken = (change) => { const c = structuredClone(srd.conditions[0]); change(c); return lintPack({ pack: srd.pack, conditions: [c] }).join("\n"); };
  assert.match(broken((c) => { c.id = "sleepy"; }), /not one of the conditions/);
  assert.match(broken((c) => { delete c.visible; }), /visible/);
  assert.match(broken((c) => { c.includes = ["dizzy"]; }), /includes/);
  assert.match(broken((c) => { c.modifiers = [{ on: "speed", op: "add", value: { perLevel: -5 } }]; }), /needs the condition to have `levels`/);
  assert.match(broken((c) => { c.modifiers = [{ on: "damage.taken", op: "resist", types: ["tickling"] }]; }), /types/);
  assert.match(broken((c) => { c.also = ""; }), /also/);
});

test("every Advantage and Disadvantage the engine had before now comes from data", () => {
  const { s, brenna, goblin, wolf } = field();
  const why = (e, t, atk) => { const r = rollMode(s, e, t, atk); return [r.mode, r.adv.join(" + ") || "-", r.dis.join(" + ") || "-"]; };
  assert.deepEqual(why(brenna, goblin, melee), ["normal", "-", "-"]);

  goblin.cond.prone = {};
  assert.deepEqual(why(brenna, goblin, melee), ["adv", "target prone", "-"]);                 // beside it
  assert.deepEqual(why(s.entities.rogue, goblin, bow), ["dis", "-", "target prone"]);        // from range
  assert.deepEqual(why(goblin, brenna, melee), ["dis", "-", "attacker prone"]);
  delete goblin.cond.prone;

  goblin.cond.dodging = {};
  assert.deepEqual(why(brenna, goblin, melee), ["dis", "-", "target dodging"]);
  delete goblin.cond.dodging;

  brenna.cond.unconscious = {}; brenna.cond.prone = {};
  const onDowned = rollMode(s, goblin, brenna, melee);
  assert.deepEqual([onDowned.mode, onDowned.adv, onDowned.crit], ["adv", ["target unconscious", "target prone"], true]);
  assert.equal(rollMode(s, wolf, brenna, bow).crit, false, "only from within 5 feet");
  brenna.cond = {};

  // Pack Tactics: the wolf has an ally (the goblin) next to Brenna.
  assert.deepEqual(why(wolf, brenna, melee), ["adv", "Pack Tactics", "-"]);
  apply(s, { type: "place", actor: goblin.id, to: { q: 6, r: 0 } }, DM);
  assert.deepEqual(why(wolf, brenna, melee), ["normal", "-", "-"]);
  assert.deepEqual(why(goblin, brenna, melee), ["normal", "-", "-"], "a goblin has no such trait");

  // The proof that it is data: empty the entries and the engine stops doing it.
  const prone = CONTENT.conditions.prone, keep = prone.modifiers, trait = CONTENT.monsters.wolf.traits[0], keepTrait = trait.modifiers;
  try {
    prone.modifiers = []; trait.modifiers = [];
    brenna.cond.prone = {};
    apply(s, { type: "place", actor: goblin.id, to: { q: 1, r: 0 } }, DM);
    assert.deepEqual(why(goblin, brenna, melee), ["normal", "-", "-"]);
    assert.deepEqual(why(wolf, brenna, melee), ["normal", "-", "-"]);
  } finally { prone.modifiers = keep; trait.modifiers = keepTrait; brenna.cond = {}; }

  // The two rules that belong to ranged attacks themselves stay in the engine.
  assert.deepEqual(why(s.entities.rogue, wolf, { ...bow, range: [5, 320] }).slice(2), ["long range"]);
});

test("the DM puts conditions on and takes them off; players cannot", () => {
  const { s, goblin } = field();
  assert.match(apply(s, { type: "condition", actor: goblin.id, condition: "poisoned", on: true }, PLAYER).error, /Only the DM/);
  assert.match(apply(s, { type: "condition", actor: goblin.id, condition: "sleepy", on: true }, DM).error, /Unknown condition/);
  assert.match(apply(s, { type: "condition", actor: goblin.id, condition: "dodging", on: true }, DM).error, /Unknown condition/);
  assert.match(apply(s, { type: "condition", actor: goblin.id, condition: "poisoned", on: false }, DM).error, /isn't Poisoned/);

  const on = give(s, goblin, "charmed");
  assert.deepEqual(on.events.map((e) => e.type), ["cond", "manual"]);
  assert.match(on.events[1].text, /Goblin Warrior 1 is Charmed.*the DM applies the rest: It cannot attack whoever charmed it.*Nothing ends it yet/);
  assert.equal(on.events[1].partial, true);
  assert.match(apply(s, { type: "condition", actor: goblin.id, condition: "charmed", on: true }, DM).error, /already Charmed/);
  const off = apply(s, { type: "condition", actor: goblin.id, condition: "charmed", on: false }, DM);
  assert.deepEqual(off.events, [{ type: "condEnd", id: goblin.id, cond: "charmed" }]);
  assert.deepEqual(goblin.cond, {});
  // A condition the engine applies in full still says nothing ends it.
  assert.match(give(s, goblin, "poisoned").events[1].text, /^Goblin Warrior 1 is Poisoned\. Nothing ends it yet/);
});

test("Restrained: no movement, worse attacks, easier to hit, worse Dexterity saves", () => {
  const { s, brenna, goblin } = field();
  give(s, goblin, "restrained");
  assert.equal(speedOf(s, goblin), 0);
  assert.equal(moveOptions(s, goblin).size, 0);
  assert.match(apply(s, { type: "move", actor: goblin.id, to: { q: 2, r: 0 } }, DM).error, /Speed is 0/);
  assert.deepEqual(rollMode(s, brenna, goblin, melee).adv, ["target restrained"]);
  assert.deepEqual(rollMode(s, goblin, brenna, melee).dis, ["attacker restrained"]);
  assert.equal(blocked(s, goblin), "", "it can still act");

  fight(s); turnOf(s, goblin.id);
  assert.equal(s.encounter.budget.move, 0);
  assert.equal(s.encounter.budget.action, 1);
  // A Dexterity save is rolled twice and the lower die kept.
  turnOf(s, "wizard");
  apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 1 } }, DM);
  goblin.hp = goblin.maxHp = 300;
  const res = apply(s, { type: "cast", actor: "wizard", spell: "burning-hands", hex: goblin.pos }, DM);
  assert.ok(res.ok, res.error);
  const save = res.events.find((e) => e.type === "save" && e.id === goblin.id);
  assert.deepEqual([save.mode, save.why, save.rolls.length, save.roll], ["dis", ["Restrained"], 2, Math.min(...save.rolls)]);
});

test("Paralyzed, Stunned and Unconscious stop a creature acting; Paralyzed is hit critically from close up", () => {
  const { s, brenna, goblin, wolf } = field();
  give(s, goblin, "paralyzed");
  assert.equal(incapacitated(goblin), true);
  assert.deepEqual([...conditionsOf(goblin).keys()], ["paralyzed", "incapacitated"]);
  assert.equal(blocked(s, goblin), "Goblin Warrior 1 is Paralyzed and can't act.");
  // Out of a fight too: its attack is refused and does not start one.
  assert.match(apply(s, { type: "attack", actor: goblin.id, target: "fighter", attack: "scimitar" }, DM).error, /Paralyzed and can't act/);
  assert.equal(s.encounter, null);

  fight(s); turnOf(s, goblin.id);
  assert.deepEqual(s.encounter.budget, { move: 0, action: 0, bonus: 0 });
  assert.match(apply(s, { type: "attack", actor: goblin.id, target: "fighter", attack: "scimitar" }, DM).error, /Paralyzed and can't act/);
  assert.match(apply(s, { type: "dodge", actor: goblin.id }, DM).error, /can't act/);

  // Every hit from beside it is a critical hit, and it gets no Opportunity Attack.
  goblin.hp = goblin.maxHp = 500; goblin.ac = 1;
  turnOf(s, "fighter");
  const hit = apply(s, { type: "attack", actor: "fighter", target: goblin.id, attack: "longsword" }, DM).events[0];
  assert.deepEqual([hit.mode, hit.why, hit.hit && hit.crit], ["adv", ["target paralyzed"], hit.hit]);
  const away = H.range(brenna.pos, 3).find((h) => H.dist(h, goblin.pos) > 1 && moveOptions(s, brenna).get(H.key(h))?.canStop);
  const move = apply(s, { type: "move", actor: "fighter", to: away }, DM);
  assert.ok(move.ok, move.error);
  assert.equal(move.events.some((e) => e.type === "attack"), false);

  give(s, wolf, "stunned");
  assert.equal(blocked(s, wolf), "Wolf 1 is Stunned and can't act.");
  assert.ok(speedOf(s, wolf) > 0, "being Stunned does not by itself stop movement");
});

test("automatic failures, resistance to everything, and penalties that stack in levels", () => {
  const { s, brenna, goblin, wolf } = field();
  // Paralyzed fails Dexterity saves without rolling.
  give(s, goblin, "paralyzed");
  apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 1 } }, DM);
  goblin.hp = goblin.maxHp = 300;
  fight(s); turnOf(s, "wizard");
  const res = apply(s, { type: "cast", actor: "wizard", spell: "burning-hands", hex: goblin.pos }, DM);
  const save = res.events.find((e) => e.type === "save" && e.id === goblin.id);
  assert.deepEqual([save.roll, save.success], [0, false]);

  // Petrified halves all damage.
  give(s, wolf, "petrified");
  wolf.hp = wolf.maxHp = 100;
  const d = apply(s, { type: "setHp", actor: wolf.id, hp: 80 }, DM).events.find((e) => e.type === "damage");
  assert.deepEqual([d.amount, d.note, wolf.hp], [10, "resisted", 90]);

  // Exhaustion: -2 to d20 rolls and -5 ft of Speed per level.
  assert.match(give(s, brenna, "exhaustion", 2).events.at(-1).text, /At level 6 the creature dies/);
  assert.equal(brenna.cond.exhaustion.level, 2);
  assert.equal(speedOf(s, brenna), 20);
  assert.equal(rollMode(s, brenna, goblin, melee).add, -4);
  assert.equal(modifiers(s, brenna, "save.con").add, -4);
  const up = apply(s, { type: "condition", actor: "fighter", condition: "exhaustion", on: true, level: 9 }, DM);
  assert.deepEqual(up.events, [{ type: "cond", id: "fighter", cond: "exhaustion", level: 6 }]);
  assert.equal(speedOf(s, brenna), 0);
  turnOf(s, "fighter");
  const swing = apply(s, { type: "attack", actor: "fighter", target: goblin.id, attack: "longsword" }, DM).events[0];
  assert.equal(swing.total, swing.nat + 5 - 12);
});

test("Poisoned, Invisible, Grappled and Dodge", () => {
  const { s, brenna, goblin } = field();
  give(s, goblin, "poisoned");
  assert.deepEqual(rollMode(s, goblin, brenna, melee).dis, ["attacker poisoned"]);
  apply(s, { type: "condition", actor: goblin.id, condition: "poisoned", on: false }, DM);
  give(s, goblin, "invisible");
  assert.deepEqual([rollMode(s, goblin, brenna, melee).adv, rollMode(s, brenna, goblin, melee).dis], [["attacker invisible"], ["target invisible"]]);
  apply(s, { type: "condition", actor: goblin.id, condition: "invisible", on: false }, DM);
  give(s, goblin, "grappled");
  assert.equal(speedOf(s, goblin), 0);
  assert.equal(blocked(s, goblin), "");

  // Dodging now also gives Advantage on Dexterity saves.
  fight(s); turnOf(s, "fighter");
  assert.ok(apply(s, { type: "dodge", actor: "fighter" }, DM).ok);
  assert.deepEqual(modifiers(s, brenna, "save.dex", {}, "target").advantage, ["target dodging"]);
  assert.deepEqual(modifiers(s, brenna, "save.con", {}, "target").advantage, []);
});

test("a prone creature with no Speed stays down at the start of its turn", () => {
  const { s, goblin } = field();
  goblin.cond.prone = {};
  give(s, goblin, "restrained");
  fight(s); turnOf(s, goblin.id);
  assert.ok(goblin.cond.prone);
  apply(s, { type: "condition", actor: goblin.id, condition: "restrained", on: false }, DM);
  turnOf(s, "fighter"); turnOf(s, goblin.id);
  assert.equal(goblin.cond.prone, undefined);
  assert.equal(s.encounter.budget.move, 15);
});

test("players see the conditions they could see by looking, and nothing about the rest", () => {
  const { s, goblin } = field();
  const seen = () => view(s, PLAYER).entities[goblin.id].cond;
  const shown = (res) => viewEvents(res.events, s, PLAYER).map((e) => `${e.type}:${e.cond ?? ""}`);
  assert.deepEqual(shown(give(s, goblin, "restrained")), ["cond:restrained"]);
  assert.deepEqual(shown(give(s, goblin, "poisoned")), []);
  assert.deepEqual(shown(give(s, goblin, "charmed")), []);
  assert.deepEqual(seen(), { restrained: true });
  assert.equal(JSON.stringify(view(s, PLAYER)).includes("poisoned"), false);
  assert.deepEqual(shown(apply(s, { type: "condition", actor: goblin.id, condition: "poisoned", on: false }, DM)), []);
  assert.deepEqual(shown(apply(s, { type: "condition", actor: goblin.id, condition: "restrained", on: false }, DM)), ["condEnd:restrained"]);
  // On one of their own they see everything.
  assert.deepEqual(shown(give(s, s.entities.fighter, "poisoned")), ["cond:poisoned"]);
  assert.ok(view(s, PLAYER).entities.fighter.cond.poisoned);
  // The helpers still work on a view that holds conditions.
  const v = view(s, PLAYER);
  assert.equal(moveOptions(v, v.entities[goblin.id]).size, 0);
  assert.ok(moveOptions(v, v.entities.fighter).size > 0);
});

test("a table saved by the previous version loads, is upgraded, and plays on", () => {
  const saved = JSON.parse(readFileSync(new URL("./fixtures/table-v1.json", import.meta.url), "utf8"));
  const s = saved.state;
  assert.equal(s.version, 1);
  assert.deepEqual([s.entities.rogue.cond, s.entities.fighter.cond], [{ unconscious: true, prone: true }, { dodging: true }]);

  migrate(s);
  assert.equal(s.version, VERSION);
  assert.deepEqual([s.entities.rogue.cond, s.entities.fighter.cond], [{ unconscious: {}, prone: {} }, { dodging: {} }]);
  const once = JSON.stringify(s);
  assert.equal(JSON.stringify(migrate(s)), once, "upgrading twice changes nothing");

  // The rules still read it the same way: Pip is down, Brenna is dodging.
  assert.equal(current(s), "wizard");
  const wolf = s.entities.m4, pip = s.entities.rogue;
  assert.deepEqual(rollMode(s, wolf, s.entities.fighter, melee).dis, ["target dodging"]);
  const onPip = rollMode(s, { ...wolf, pos: H.neighbors(pip.pos)[0] }, pip, melee);
  assert.deepEqual([onPip.adv.slice(0, 2), onPip.crit], [["target unconscious", "target prone"], true]);

  // And the fight carries on to its end with the AI playing everyone.
  for (let i = 0; i < 3000 && s.encounter; i++) {
    const id = current(s);
    let r = apply(s, aiStep(s, id) ?? { type: "endTurn", actor: id }, DM);
    if (!r.ok) r = apply(s, { type: "endTurn", actor: id }, DM);
    assert.ok(r.ok, r.error);
  }
  assert.equal(s.encounter, null);
  assert.ok(Object.values(s.entities).every((e) => Object.values(e.cond).every((v) => v && typeof v === "object")));
  assert.ok(!inFight(s, "wizard"));
});
