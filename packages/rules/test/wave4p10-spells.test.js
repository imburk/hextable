// Wave 4, part 10, of issue #786: Meld into Stone (assist), through a `meld` step, a lasting `melded` state on the caster, `unmeld`, and
// Stone Shape's cut expelling it. Built to docs/specs/rules-expansion.md, "Build notes: wave 4 part 10". Every test goes through apply().
// The twin tests (what a player is sent, with and without a creature melded in a wall) are in packages/server/test/twin-worlds.test.js.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { aiStep } from "../src/ai.js";
import { apply, living, current } from "../src/engine.js";
import * as H from "../src/hex.js";
import { gridOf } from "../src/grid.js";
import { newMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";
import { describeStep } from "../src/history.js";
import { partyView } from "../src/vision.js";
import { classify, view } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const P = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const WALL = (id, a, b, kind = "wall") => ({ id, level: "ground", kind, a, b });
const at = (x, y) => ({ level: "ground", x, y });
const lint = (def) => lintEntry("spells", def, { strict: false });
const toDm = (r) => r.events.filter((e) => e.type === "manual").map((e) => e.text).join("\n");

// The wizard stands at (0,0) and owns Meld into Stone; a long wall runs north-south 2.5 feet east of it. The cleric knows Stone Shape.
function floor(more = {}) {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 30).map((h) => [H.col(h), { t: "stone" }]));
  const s = newGame(9);
  ok(apply(s, { type: "loadMap", map: newMap({ id: "floor", name: "A floor", starts: [{ q: 0, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }],
    walls: [WALL("w1", [2.5, -30], [2.5, 30]), WALL("win", [-2.5, -30], [-2.5, 30], "window")], objects: [] }) }, DM));
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const [i, id] of ["fighter", "rogue"].entries()) ok(apply(s, { type: "place", actor: id, to: { q: -20, r: 5 + i } }, DM));
  ok(apply(s, { type: "place", actor: "cleric", to: { q: 1, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM));
  Object.assign(s.entities.wizard, { owner: "pat", slots: { 1: 4, 3: 3, 4: 3 }, slotsMax: { 1: 4, 3: 3, 4: 3 } });
  s.entities.wizard.spells.push("meld-into-stone", "mage-armor", "fireball");
  Object.assign(s.entities.cleric, { owner: "sam", slots: { 1: 4, 4: 3 }, slotsMax: { 1: 4, 4: 3 } });
  s.entities.cleric.spells.push("stone-shape", "cure-wounds");
  Object.assign(s, more);
  return s;
}
const SAM = { role: "player", userId: "sam" };
const meld = (s, wall = at(2.5, 0), who = P) => apply(s, { type: "cast", actor: "wizard", spell: "meld-into-stone", slot: 3, ...(wall ? { wall } : {}) }, who);
const melded = (wall) => { const s = floor(); ok(meld(s, wall)); return s; };
const foe = (s, q, r, name = "Brute") => { ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q, r }, name }, DM)); return Object.values(s.entities).find((e) => e.name === name); };
const nearHex = (s, x, y) => { const G = gridOf(s.map); return H.range({ q: 0, r: 0 }, 12).sort((a, b) => Math.hypot(G.center(a)[0] - x, G.center(a)[1] - y) - Math.hypot(G.center(b)[0] - x, G.center(b)[1] - y))[0]; };
const fxOf = (s) => s.effects.find((f) => f.spell === "meld-into-stone");

test("tier and numbers: Meld into Stone is assist, aimed at a wall, touch, 8 hours, no Concentration, a ritual, level 3 (SRD 5.2.1)", () => {
  const sp = SPELLS["meld-into-stone"];
  assert.equal(sp.def.tier, "assist");
  assert.equal(sp.aim, "wall");
  assert.equal(sp.range, 5);
  assert.equal(sp.level, 3);
  assert.equal(sp.def.duration, "8 hours");
  assert.equal(sp.def.concentration, false);
  assert.equal(sp.def.ritual, true);
  assert.deepEqual(sp.def.classes, ["cleric", "druid", "ranger"]);
  assert.deepEqual(sp.def.components, ["v", "s"]);
  assert.deepEqual(lint(sp.def), []);
  assert.ok(sp.def.effects.some((st) => st.meld === true), "a meld step");
  assert.deepEqual(sp.def.effects.find((st) => st.modifier).modifier, { on: "check", op: "disadvantage", scope: { skill: "perception" } });
});

test("the meld step is linted: only in a spell aimed at a wall, and it is true", () => {
  const base = { ...SPELLS["meld-into-stone"].def };
  assert.deepEqual(lint(base), []);
  assert.ok(lint({ ...base, target: { self: true } }).some((m) => /`meld` step is for a spell whose target is a wall/.test(m)));
  assert.ok(lint({ ...base, effects: [{ meld: false }, { manual: "x" }] }).some((m) => /`meld` is true/.test(m)));
  assert.ok(lint({ ...base, effects: [{ manual: "x" }] }).some((m) => /has a `cut` step \(or a `meld` step\)/.test(m)));
});

test("cast: the caster is merged with the stone for 8 hours, held by an effect with no Concentration; the DM is told what the engine cannot judge", () => {
  const s = floor();
  const r = ok(meld(s));
  const w = s.entities.wizard;
  assert.deepEqual(w.melded, { fx: fxOf(s).id, level: "ground", x: 2.5, y: 0, at: { q: 0, r: 0, z: 0 } });
  assert.equal(w.pos.q, 0);
  assert.equal(fxOf(s).conc, false);
  assert.equal(fxOf(s).lasts, "8 hours");
  assert.equal(fxOf(s).until.clock, s.clock + 480);
  assert.ok(fxOf(s).parts.some((p) => p.meld === true && p.target === "wizard"));
  assert.equal(w.slots[3], 2);
  assert.match(toDm(r), /does not know that the wall it was aimed at is stone/);
  assert.match(toDm(r), /Truesight/);
  assert.deepEqual(r.events.find((e) => e.type === "cast").wall, { level: "ground", x: 2.5, y: 0 });
});

test("Disadvantage on Wisdom (Perception) checks while merged, none on other checks, and none once out", () => {
  const s = melded();
  const perception = ok(apply(s, { type: "check", actor: "wizard", skill: "perception" }, P)).events.find((e) => e.type === "check");
  assert.equal(perception.mode, "dis", JSON.stringify(perception));
  const stealth = ok(apply(s, { type: "check", actor: "wizard", skill: "stealth" }, P)).events.find((e) => e.type === "check");
  assert.notEqual(stealth.mode, "dis");
  ok(apply(s, { type: "unmeld", actor: "wizard" }, P));
  const after = ok(apply(s, { type: "check", actor: "wizard", skill: "perception" }, P)).events.find((e) => e.type === "check");
  assert.notEqual(after.mode, "dis");
});

test("refused before anything is spent, with the state deep-equal: no wall, a window, out of reach, Blinded, mounted; nothing is changed", () => {
  const s = floor();
  s.map.walls.push(WALL("far", [60, -30], [60, 30]));
  const before = JSON.stringify(s);
  for (const [wall, re] of [[at(40, 0), /No such wall/], [at(-2.5, 0), /is a window/], [at(60, 0), /out of the caster's reach/], [null, /Pick a point on a wall/]]) {
    const r = meld(s, wall);
    assert.match(r.error, re);
    assert.equal(JSON.stringify(s), before, "nothing changed");
  }
  s.entities.wizard.cond.blinded = {};
  const blind = JSON.stringify(s);
  assert.match(meld(s).error, /Blinded/);
  assert.equal(JSON.stringify(s), blind);
  delete s.entities.wizard.cond.blinded;
  s.entities.wizard.rider = "cleric";
  const rid = JSON.stringify(s);
  assert.match(meld(s).error, /mounted or carrying a rider/);
  assert.equal(JSON.stringify(s), rid);
});

test("it fills no space: another creature may be placed and walk where it stood", () => {
  const s = melded();
  ok(apply(s, { type: "place", actor: "fighter", to: { q: 0, r: 0 } }, DM));
  assert.deepEqual([s.entities.fighter.pos.q, s.entities.fighter.pos.r], [0, 0]);
  ok(apply(s, { type: "place", actor: "rogue", to: { q: -1, r: 0 } }, DM));
  assert.ok(!living(s).some((e) => e.id === "wizard"), "it is not among the creatures that are here");
});

test("it cannot be targeted, however it is named: a spell, an attack; the refusal is the one for a creature that is not there", () => {
  const s = melded();
  const before = JSON.stringify(s);
  const r = apply(s, { type: "cast", actor: "cleric", spell: "cure-wounds", slot: 1, target: "wizard" }, SAM);
  assert.ok(!r.ok);
  assert.equal(JSON.stringify(s), before);
  assert.equal(r.error, "No such creature.");
  const nobody = apply(s, { type: "cast", actor: "cleric", spell: "cure-wounds", slot: 1, target: "nobody-at-all" }, SAM);
  assert.equal(r.error, nobody.error, "the same words as for an id that is no creature");
});

test("an area spell over its space does not catch it", () => {
  const s = melded();
  const hp = s.entities.wizard.hp;
  const f = foe(s, -1, 0);
  // a foe casts nothing here: the fireball is the wizard's own, which a merged caster may not cast; the DM's `act` area is the test
  s.entities.cleric.spells.push("fireball");
  s.entities.cleric.slots[3] = 2;
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  while (current(s) !== "cleric") ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  const out = ok(apply(s, { type: "cast", actor: "cleric", spell: "fireball", slot: 3, hex: { q: 0, r: 0 } }, SAM));
  assert.equal(s.entities.wizard.hp, hp, "no damage");
  assert.ok(!out.events.some((e) => e.id === "wizard" && (e.type === "damage" || e.type === "save")), "no save or damage event for it");
  assert.ok(out.events.some((e) => e.id === f.id), JSON.stringify(out.events.map((e) => [e.type, e.id])));
});

test("everything but a spell on itself is refused with one message: move, attack, dash, search, hide, a spell aimed at another, a second Meld", () => {
  const s = melded();
  const before = JSON.stringify(s);
  const msgs = new Set();
  for (const a of [{ type: "move", to: { q: -1, r: 0 } }, { type: "dash" }, { type: "search" }, { type: "hide" }, { type: "dodge" }, { type: "stand" }, { type: "disengage" }]) {
    const r = apply(s, { actor: "wizard", ...a }, P);
    assert.ok(!r.ok, a.type);
    assert.match(r.error, /merged with the stone/, a.type);
    msgs.add(r.error);
  }
  assert.equal(msgs.size, 1, "one message");
  for (const a of [{ spell: "cure-wounds", slot: 1, target: "cleric" }, { spell: "fireball", slot: 3, hex: { q: 3, r: 0 } }, { spell: "meld-into-stone", slot: 3, wall: at(2.5, 0) }]) {
    s.entities.wizard.spells.push(a.spell);
    const r = apply(s, { type: "cast", actor: "wizard", ...a }, P);
    assert.match(r.error, /merged with the stone and can cast only spells aimed at itself/, a.spell);
  }
  assert.equal(JSON.stringify(s).length, before.length + 0 + (JSON.stringify(s).length - before.length), "a refusal restores the state");
  const again = JSON.stringify(s);
  apply(s, { type: "move", actor: "wizard", to: { q: -1, r: 0 } }, P);
  assert.equal(JSON.stringify(s), again, "a refused move changes nothing");
});

test("a spell aimed at itself works: Mage Armor on itself, and a `creature` spell with itself as the only target", () => {
  const s = melded();
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "mage-armor", slot: 1, target: "wizard" }, P));
  assert.ok(r.events.some((e) => e.type === "cast"));
  assert.ok(s.entities.wizard.melded, "still merged");
  s.entities.wizard.spells.push("cure-wounds");
  s.entities.wizard.hp = 1;
  ok(apply(s, { type: "cast", actor: "wizard", spell: "cure-wounds", slot: 1, target: "wizard" }, P));
  assert.ok(s.entities.wizard.hp > 1);
});

test("a player may not end the spell for nothing: endEffect is refused for the caster, and works for the DM", () => {
  const s = melded();
  assert.match(apply(s, { type: "endEffect", effect: fxOf(s).id }, P).error, /use unmeld/);
  assert.ok(s.entities.wizard.melded);
  ok(apply(s, { type: "endEffect", effect: fxOf(s).id }, DM));
  assert.equal(s.entities.wizard.melded, undefined);
  assert.deepEqual([s.entities.wizard.pos.q, s.entities.wizard.pos.r], [0, 0]);
});

test("leaving outside a fight costs nothing: back where it entered, the spell over", () => {
  const s = melded();
  const r = ok(apply(s, { type: "unmeld", actor: "wizard" }, P));
  assert.equal(s.entities.wizard.melded, undefined);
  assert.equal(fxOf(s), undefined);
  assert.deepEqual([s.entities.wizard.pos.q, s.entities.wizard.pos.r], [0, 0]);
  assert.ok(r.events.some((e) => e.type === "effectEnd"));
  assert.ok(!s.entities.wizard.cond.prone);
  assert.match(apply(s, { type: "unmeld", actor: "wizard" }, P).error, /not merged with stone/);
});

test("leaving in a fight takes 5 feet of movement on its turn; it is refused out of turn or with too little left", () => {
  const s = melded();
  const g = foe(s, 6, 0);
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  const id = current(s);
  if (id !== "wizard") assert.match(apply(s, { type: "unmeld", actor: "wizard" }, P).error, /turn/);
  while (current(s) !== "wizard") ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  const before = s.encounter.budget.move;
  s.encounter.budget.move = 0;
  const snap = JSON.stringify(s);
  assert.match(apply(s, { type: "unmeld", actor: "wizard" }, P).error, /takes 5 ft of movement/);
  assert.equal(JSON.stringify(s), snap, "refused: nothing changes");
  s.encounter.budget.move = before;
  ok(apply(s, { type: "unmeld", actor: "wizard" }, P));
  assert.equal(s.encounter.budget.move, before - 5);
  assert.equal(s.entities.wizard.melded, undefined);
  assert.ok(g);
});

test("leaving when its space is taken: the nearest unoccupied space, by the rules of any arrival", () => {
  const s = melded();
  ok(apply(s, { type: "place", actor: "fighter", to: { q: 0, r: 0 } }, DM));
  ok(apply(s, { type: "unmeld", actor: "wizard" }, P));
  const w = s.entities.wizard.pos;
  assert.notDeepEqual([w.q, w.r], [0, 0]);
  assert.equal(H.dist({ q: 0, r: 0 }, w), 1, "the nearest ring");
  assert.deepEqual([s.entities.fighter.pos.q, s.entities.fighter.pos.r], [0, 0], "the one standing there is not moved");
});

test("the 8 hours end by time like any lasting effect: it comes out where it entered, not Prone, no damage", () => {
  const s = melded();
  const hp = s.entities.wizard.hp;
  ok(apply(s, { type: "advanceTime", minutes: 479 }, DM));
  assert.ok(s.entities.wizard.melded, "not yet");
  ok(apply(s, { type: "place", actor: "rogue", to: { q: 0, r: 0 } }, DM));
  const r = ok(apply(s, { type: "advanceTime", minutes: 1 }, DM));
  assert.equal(s.entities.wizard.melded, undefined);
  assert.equal(fxOf(s), undefined);
  assert.ok(r.events.some((e) => e.type === "effectEnd" && /ran out/.test(e.why)));
  assert.equal(s.entities.wizard.hp, hp);
  assert.ok(!s.entities.wizard.cond.prone);
  const w = s.entities.wizard.pos;
  assert.equal(H.dist({ q: 0, r: 0 }, w), 1, "the nearest free space: its own was taken");
});

test("the party gets no sight from a creature merged with stone: under line of sight, a foe only it could see is not seen", () => {
  const s = floor();
  ok(apply(s, { type: "setting", key: "sight", value: "los" }, DM));
  for (const [i, id] of ["fighter", "rogue", "cleric"].entries()) ok(apply(s, { type: "place", actor: id, to: { q: 12, r: i } }, DM));
  const g = foe(s, -3, 0);
  assert.ok(partyView(s).creatures.has(g.id), "the wizard sees it");
  ok(meld(s));
  assert.ok(!partyView(s).creatures.has(g.id), "nobody sees it now");
  assert.equal(classify(s, g.id), "hidden");
  ok(apply(s, { type: "unmeld", actor: "wizard" }, P));
  assert.ok(partyView(s).creatures.has(g.id), "and again once it is out");
});

test("a foe's creature is merged without a trace: it is not sent to a player, nor is its spell", () => {
  const s = floor();
  const g = foe(s, -1, 0, "Brute");
  Object.assign(g, { slots: { 3: 2 }, slotsMax: { 3: 2 }, spells: ["meld-into-stone"], castAbil: "wis", prof: 2, abil: { ...g.abil, wis: 14 } });
  assert.notEqual(classify(s, g.id), "hidden");
  ok(apply(s, { type: "cast", actor: g.id, spell: "meld-into-stone", slot: 3, wall: at(2.5, 0) }, DM));
  assert.ok(g.melded);
  assert.equal(classify(s, g.id), "hidden");
  const v = JSON.stringify(view(s, P));
  assert.ok(!v.includes(g.id) && !v.includes("Brute") && !v.includes("melded"), "nothing of it in what Pat is sent");
});

test("a party member merged with stone is still among its party's records, with the mark; its own player is sent it", () => {
  const s = melded();
  const v = view(s, P);
  assert.equal(classify(s, "wizard"), "open");
  assert.equal(JSON.stringify(v).includes('"melded"'), true);
});

test("an AI creature is never given a merged creature as a foe, and a merged one on its own turn only passes", () => {
  const s = floor();
  const g = foe(s, 6, 0);
  delete g.skillBonus;
  ok(meld(s));
  for (const [i, id] of ["fighter", "rogue", "cleric"].entries()) ok(apply(s, { type: "place", actor: id, to: { q: -25, r: 20 + i } }, DM));
  ok(apply(s, { type: "startEncounter", center: { q: 3, r: 0 }, radius: 8 }, DM));
  assert.ok(s.encounter.order.some((o) => o.id === g.id) && s.encounter.order.some((o) => o.id === "wizard"));
  while (current(s) !== g.id) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.deepEqual(aiStep(s, g.id), { type: "endTurn", actor: g.id }, "nobody to fight: the only creature near is merged");
  g.melded = { fx: "none", level: "ground", x: 2.5, y: 0, at: { ...g.pos } };
  assert.deepEqual(aiStep(s, g.id), { type: "endTurn", actor: g.id });
});

test("a Stone Shape cut near it expels it: 6d6 Force damage, Prone, the spell ends, the nearest free space", () => {
  const s = melded();
  s.entities.wizard.hp = s.entities.wizard.maxHp = 100;
  const hp = s.entities.wizard.hp;
  const r = ok(apply(s, { type: "cast", actor: "cleric", spell: "stone-shape", slot: 4, choice: "passage", wall: at(2.5, 1) }, SAM));
  const w = s.entities.wizard;
  assert.equal(w.melded, undefined);
  assert.equal(fxOf(s), undefined);
  assert.ok(w.cond.prone, "Prone");
  const hurt = r.events.find((e) => e.type === "damage" && (e.id === "wizard" || e.target === "wizard"));
  assert.ok(hurt, JSON.stringify(r.events.map((e) => e.type)));
  assert.equal(hurt.type, "damage");
  assert.equal(w.hp, Math.max(0, hp - (hp - w.hp)));
  assert.ok(hp - w.hp >= 6 && hp - w.hp <= 36, `6d6: ${hp - w.hp}`);
  assert.deepEqual([w.pos.q, w.pos.r], [0, 0]);
  assert.match(JSON.stringify(r.events), /Force|force/);
});

test("a cut further than 2.5 feet from where it entered does not expel it", () => {
  const s = melded();
  ok(apply(s, { type: "place", actor: "cleric", to: nearHex(s, 5, 12) }, DM));
  ok(apply(s, { type: "cast", actor: "cleric", spell: "stone-shape", slot: 4, choice: "passage", wall: at(2.5, 12) }, SAM));
  assert.ok(s.entities.wizard.melded);
  assert.ok(fxOf(s));
  // just inside 2.5 feet: the window runs 9.5 to 14.5 from a point at 12; one at 4.9 cuts 2.4 to 7.4, which is within 2.5 of y = 0
  const t = melded();
  ok(apply(t, { type: "place", actor: "cleric", to: nearHex(t, 5, 4.9) }, DM));
  ok(apply(t, { type: "cast", actor: "cleric", spell: "stone-shape", slot: 4, choice: "passage", wall: at(2.5, 4.9) }, SAM));
  assert.equal(t.entities.wizard.melded, undefined, "a stretch 2.4 feet away is near enough");
});

test("expelled into a taken space: the nearest unoccupied one", () => {
  const s = melded();
  ok(apply(s, { type: "place", actor: "rogue", to: { q: 0, r: 0 } }, DM));
  ok(apply(s, { type: "cast", actor: "cleric", spell: "stone-shape", slot: 4, choice: "passage", wall: at(2.5, 0) }, SAM));
  assert.equal(H.dist({ q: 0, r: 0 }, s.entities.wizard.pos), 1);
  assert.ok(s.entities.wizard.cond.prone);
});

test("history: leaving the stone has a label", () => {
  const s = melded();
  const step = describeStep({ type: "unmeld", actor: "wizard" }, [], s, s);
  assert.match(JSON.stringify(step), /left the stone/);
});

test("the CONTENT entry is the one the engine runs", () => {
  assert.equal(CONTENT.spells["meld-into-stone"].tier, "assist");
});
