// Wave 3a of issue #786: wards and conditions (Protection from Evil and Good, Command, See Invisibility, Silence, Freedom of Movement, Sanctuary).
// Built to docs/specs/rules-expansion.md, "Build notes: wave 3a wards and conditions (#786)". Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const lint = (def) => lintEntry("spells", def, { strict: false });
// Open grass; the party at known places: the cleric beside the fighter (so a touch reaches), the wizard at the origin, the rogue far off.
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", 0, 0], ["fighter", -2, 0], ["rogue", -4, 4], ["cleric", -3, 0]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  const slots = { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 };
  for (const id of ["wizard", "cleric"]) Object.assign(s.entities[id], { slots: { ...slots }, slotsMax: { ...slots } });
  s.entities.cleric.spells.push("protection-from-evil-and-good", "command", "sanctuary", "silence", "freedom-of-movement");
  s.entities.wizard.spells.push("see-invisibility", "silence", "command", "thunderwave", "freedom-of-movement");
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 300;
  return s;
}
const spawn = (s, monster, q, r) => { const e = s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 300; return e; };
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 12 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const attacksOn = (events, id) => events.filter((e) => e.type === "attack" && e.target === id);

test("Protection from Evil and Good: assist; the six types have Disadvantage on attack rolls against the warded creature, others do not", () => {
  const def = SPELLS["protection-from-evil-and-good"].def;
  assert.equal(def.tier, "assist");
  assert.equal(def.checked, true);
  assert.deepEqual(lint(def), []);
  const s = field(), skel = spawn(s, "skeleton", -1, 0), wolf = spawn(s, "wolf", -2, 1);
  fight(s); turnOf(s, "cleric");
  const cast = ok(apply(s, { type: "cast", actor: "cleric", spell: "protection-from-evil-and-good", target: "fighter" }, DM));
  assert.ok(cast.events.some((e) => e.type === "manual" && /possess/i.test(e.text)), "possession is handed to the DM");
  turnOf(s, skel.id);
  const a = attacksOn(ok(apply(s, { type: "act", actor: skel.id, action: "shortsword", target: "fighter" }, DM)).events, "fighter")[0];
  assert.equal(a.mode, "dis"); assert.deepEqual(a.why, ["Protection from Evil and Good"]);
  turnOf(s, wolf.id);
  const b = attacksOn(ok(apply(s, { type: "act", actor: wolf.id, action: wolf.actions.find((x) => x.id !== "multiattack").id, target: "fighter" }, DM)).events, "fighter")[0];
  assert.notEqual(b.mode, "dis", "a beast is not one of the six types");
});

test("Protection from Evil and Good: a Fiend cannot Frighten the warded creature, a creature of another type can; the ward is not on the others", () => {
  const s = field(), imp = spawn(s, "quasit", -1, 0), imp2 = spawn(s, "quasit", -3, 3);
  for (const id of ["fighter", "rogue"]) s.entities[id].abil.wis = -20;
  fight(s); turnOf(s, "cleric");
  ok(apply(s, { type: "cast", actor: "cleric", spell: "protection-from-evil-and-good", target: "fighter" }, DM));
  turnOf(s, imp.id);
  const r = ok(apply(s, { type: "act", actor: imp.id, action: "scare", target: "fighter" }, DM));
  assert.ok(!s.entities.fighter.cond.frightened, JSON.stringify(r.events));
  assert.ok(r.events.some((e) => e.type === "note" && /Immune to Frightened/.test(e.text)));
  // The same Fiend's Scare on a creature without the ward works, so the immunity is the ward's.
  turnOf(s, imp2.id);
  const r2 = ok(apply(s, { type: "act", actor: imp2.id, action: "scare", target: "rogue" }, DM));
  assert.ok(s.entities.rogue.cond.frightened, JSON.stringify(r2.events));
});

test("Protection from Evil and Good: a creature already Frightened by a Fiend has Advantage on its new save against it, and only with the ward", () => {
  const endTurnSave = (ward) => {
    const s = field(), imp = spawn(s, "quasit", -1, 0);
    s.entities.fighter.abil.wis = -20;
    fight(s); turnOf(s, imp.id);
    ok(apply(s, { type: "act", actor: imp.id, action: "scare", target: "fighter" }, DM));
    assert.ok(s.entities.fighter.cond.frightened, "it failed the save and is Frightened");
    if (ward) { turnOf(s, "cleric"); ok(apply(s, { type: "cast", actor: "cleric", spell: "protection-from-evil-and-good", target: "fighter" }, DM)); }
    turnOf(s, "fighter");
    const end = ok(apply(s, { type: "endTurn", actor: "fighter" }, DM));
    return end.events.find((e) => e.type === "save" && e.id === "fighter");
  };
  assert.equal(endTurnSave(true).dice.length, 2, "rolled with Advantage");
  assert.equal(endTurnSave(false).dice.length, 1, "one die without the ward");
});

// ---------- Command ----------
const budgetOf = (s) => ({ ...s.encounter.budget });
function commanded(word, { slot, extra } = {}) {
  const s = field(), g = spawn(s, "goblin-warrior", 4, 0);
  g.abil.wis = -20;
  const h = extra ? spawn(s, "goblin-warrior", 4, 1) : null;
  if (h) h.abil.wis = -20;
  fight(s); turnOf(s, "cleric");
  const cast = apply(s, { type: "cast", actor: "cleric", spell: "command", ...(slot ? { slot } : {}), ...(h ? { targets: [g.id, h.id] } : { target: g.id }), choice: word }, DM);
  return { s, g, h, cast };
}

test("Command: assist; a word is chosen when casting, and a cast with no word, or one that is not among the five, is refused and spends nothing", () => {
  const def = SPELLS.command.def;
  assert.equal(def.tier, "assist"); assert.equal(def.checked, true);
  assert.deepEqual(lint(def), []);
  assert.deepEqual(def.choice, { of: "command" });
  const s = field(), g = spawn(s, "goblin-warrior", 4, 0);
  fight(s); turnOf(s, "cleric");
  const slots = s.entities.cleric.slots[1];
  assert.match(apply(s, { type: "cast", actor: "cleric", spell: "command", target: g.id }, DM).error, /command/i);
  assert.match(apply(s, { type: "cast", actor: "cleric", spell: "command", target: g.id, choice: "dance" }, DM).error, /command/i);
  assert.equal(s.entities.cleric.slots[1], slots);
});

test("Command, Halt: on its next turn the creature does not move and takes no action or Bonus Action; it is gone when that turn ends", () => {
  const { s, g, cast } = commanded("halt");
  ok(cast);
  assert.ok(cast.events.some((e) => e.type === "manual" && /understand/.test(e.text)), "the DM is told what the engine does not judge");
  assert.ok(s.effects.some((fx) => fx.name === "Command" && fx.parts.some((p) => p.command === "halt" && p.target === g.id)));
  turnOf(s, g.id);
  assert.deepEqual([s.encounter.budget.move, s.encounter.budget.action, s.encounter.budget.bonus], [0, 0, 0]);
  assert.match(apply(s, { type: "move", actor: g.id, to: { q: 5, r: 0 } }, DM).error ?? "", /./, "it cannot walk");
  ok(apply(s, { type: "endTurn", actor: g.id }, DM));
  assert.ok(!s.effects.some((fx) => fx.name === "Command"), "spent with its turn");
  turnOf(s, g.id);                                              // a round later it is free
  assert.ok(s.encounter.budget.action > 0 && s.encounter.budget.move > 0);
});

test("Command, Grovel: it is Prone and its turn is over at once; it can stand on its next turn", () => {
  const { s, g, cast } = commanded("grovel");
  ok(cast);
  assert.ok(!g.cond.prone, "nothing yet: it is for its next turn");
  turnOf(s, g.id);
  assert.ok(g.cond.prone);
  assert.deepEqual([s.encounter.budget.move, s.encounter.budget.action, s.encounter.budget.bonus], [0, 0, 0]);
  ok(apply(s, { type: "endTurn", actor: g.id }, DM));
  turnOf(s, g.id);
  assert.ok(!g.cond.prone, "it stood up (half its movement)");
});

test("Command, Drop: its turn is over (the DM puts down what it held); Approach and Flee leave the movement to the DM, who is told", () => {
  const drop = commanded("drop"); ok(drop.cast);
  turnOf(drop.s, drop.g.id);
  assert.deepEqual([drop.s.encounter.budget.move, drop.s.encounter.budget.action], [0, 0]);
  for (const word of ["approach", "flee"]) {
    const { s, g, cast } = commanded(word); ok(cast);
    let told = false;
    for (let i = 0; i < 40 && current(s) !== g.id; i++) { const r = ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); if (current(s) === g.id) told = r.events.some((e) => e.type === "manual" && e.name === "Command" && /DM moves it/.test(e.text)); }
    assert.ok(told, `${word}: the DM is told`);
    assert.ok(s.encounter.budget.move > 0 && s.encounter.budget.action > 0, `${word}: the engine does not take its turn`);
  }
});

test("Command: a creature that makes the save is untouched; a higher slot takes one more creature", () => {
  const s = field(), g = spawn(s, "goblin-warrior", 4, 0);
  g.abil.wis = 60;
  fight(s); turnOf(s, "cleric");
  ok(apply(s, { type: "cast", actor: "cleric", spell: "command", target: g.id, choice: "halt" }, DM));
  assert.ok(!s.effects.some((fx) => fx.name === "Command"), "no effect: nobody failed");
  const two = commanded("halt", { slot: 2, extra: true });
  ok(two.cast);
  assert.equal(two.s.effects.find((fx) => fx.name === "Command").parts.filter((p) => p.command === "halt").length, 2);
  const one = commanded("halt", { extra: true });
  assert.ok(one.cast.error, "two targets need a higher slot");
});
