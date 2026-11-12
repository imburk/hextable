// Lasting effects, what ends them, and Concentration (task R4 of docs/specs/rules-expansion.md).
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, SPELLS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";
import { durationMinutes } from "../src/durations.js";
import { spellProfile } from "../src/effects.js";
import { apply, current, rollMode } from "../src/engine.js";
import { speedOf } from "../src/modifiers.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" }, PLAYER = { role: "player", userId: "pat" };
const melee = { name: "Sword", type: "melee", bonus: 5, reach: 5 };
const pack = { id: "test", name: "t", license: "x", attribution: "x" };

function learn(s, who, over) {
  const def = { ...structuredClone(CONTENT.spells["fire-bolt"]), higher: undefined, level: 1, range: 60, ...over };
  assert.deepEqual(lintPack({ pack, spells: [def] }), [], def.id);
  SPELLS[def.id] = spellProfile(def);
  s.entities[who].spells.push(def.id);
  return def.id;
}
// Open ground: the wizard at the centre with spare slots, a tough goblin two hexes away, Brenna beside the wizard.
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.tiles)) s.map.tiles[k] = { t: "grass", h: 0.6 };
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM);
  apply(s, { type: "place", actor: "fighter", to: { q: 0, r: 1 } }, DM);
  Object.assign(s.entities.wizard, { slots: { 1: 9 }, slotsMax: { 1: 9 }, hp: 200, maxHp: 200 });
  const goblin = s.entities[apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 2, r: 0 } }, DM).events[0].id];
  Object.assign(goblin, { hp: 500, maxHp: 500 });
  return { s, goblin, wizard: s.entities.wizard, brenna: s.entities.fighter };
}
const fight = (s) => assert.ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM).ok);
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) apply(s, { type: "endTurn", actor: current(s) }, DM); assert.equal(current(s), id); };
const cast = (s, spell, extra = {}, who = "wizard") => { const r = apply(s, { type: "cast", actor: who, spell, ...extra }, DM); assert.ok(r.ok, r.error); return r; };
const types = (r) => r.events.map((e) => e.type);
const failsSaves = (e) => { for (const a of Object.keys(e.abil)) e.abil[a] = 1; e.saveProf = []; };
const passesSaves = (e) => { for (const a of Object.keys(e.abil)) e.abil[a] = 30; };

// Spells in the shapes R4 has to handle.
const HOLD = { id: "t-hold", duration: "1 minute", concentration: true,
  effects: [{ save: "wis", onFail: [{ condition: "paralyzed", ends: { on: "save", save: "wis", at: "turnEnd" } }] }] };
const SLOW = { id: "t-slow", duration: "1 minute", concentration: true, effects: [{ save: "wis", onFail: [{ condition: "restrained" }] }] };
const WARD = { id: "t-ward", duration: "10 minutes", concentration: true, range: "touch", effects: [{ modifier: { on: "ac", op: "add", value: 2 } }] };
const AID = { id: "t-aid", duration: "8 hours", range: "touch", effects: [{ modifier: { on: "attack.roll", op: "add", value: 1 } }] };
const DAZE = { id: "t-daze", duration: "1 round", effects: [{ save: "wis", onFail: [{ condition: "stunned", ends: { on: "turnEnd" } }] }] };
const MARK = { id: "t-mark", duration: "1 round", effects: [{ condition: "blinded", ends: { on: "turnStart", of: "source" } }] };
const GEAS = { id: "t-geas", duration: "until dispelled", effects: [{ condition: "charmed" }] };

test("durations are read from their words", () => {
  assert.deepEqual(["instant", "1 round", "10 rounds", "1 minute", "10 minutes", "1 hour", "8 hours", "7 days"].map(durationMinutes), [0, 0.1, 1, 1, 10, 60, 480, 10080]);
  assert.deepEqual(["until dispelled", "special"].map(durationMinutes), [null, null]);
  const bad = (duration) => lintPack({ pack, spells: [{ ...structuredClone(CONTENT.spells["fire-bolt"]), duration }] }).join("\n");
  for (const d of ["a while", "1 min", "0 rounds", "Instant", ""]) assert.match(bad(d), /duration must be/, d);
  const ends = (e) => lintPack({ pack, spells: [{ ...structuredClone(CONTENT.spells["fire-bolt"]), effects: [{ condition: "prone", ends: e }] }] }).join("\n");
  assert.match(ends({ on: "midnight" }), /ends\.on/);
  assert.match(ends({ on: "save", save: "luck", at: "turnEnd" }), /ends on a save needs/);
  assert.match(ends({ on: "turnEnd", of: "everyone" }), /ends\.of/);
});

test("a lasting spell becomes an effect that holds its condition, and takes it off when it ends", () => {
  const { s, goblin } = field();
  failsSaves(goblin);
  const id = learn(s, "wizard", SLOW);
  fight(s); turnOf(s, "wizard");
  const res = cast(s, id, { target: goblin.id });
  assert.deepEqual(types(res), ["cast", "effectStart", "save", "cond"]);
  const [fx] = s.effects;
  assert.deepEqual([fx.name, fx.source, fx.conc, fx.lasts, fx.until], ["Fire Bolt", "wizard", true, "1 minute", { enc: s.encounter.id, round: s.encounter.round + 10 }]);
  assert.deepEqual(fx.parts, [{ target: goblin.id, cond: "restrained" }]);
  assert.deepEqual(goblin.cond.restrained, { source: "wizard", effect: fx.id });
  assert.equal(speedOf(s, goblin), 0);
  assert.equal(res.events.some((e) => e.type === "manual"), false, "tied to an effect, so no 'the DM removes it' note");

  const end = apply(s, { type: "endEffect", effect: fx.id }, DM);
  assert.deepEqual(end.events, [{ type: "condEnd", id: goblin.id, cond: "restrained" }, { type: "effectEnd", fx: fx.id, name: "Fire Bolt", source: "wizard", targets: [goblin.id], why: "the DM ended it" }]);
  assert.deepEqual([s.effects, goblin.cond], [[], {}]);
  assert.equal(speedOf(s, goblin), 30);
});

test("ending by time in a fight: at the start of the caster's turn, the right number of rounds later", () => {
  const { s, goblin } = field();
  failsSaves(goblin);
  const id = learn(s, "wizard", { ...SLOW, id: "t-slow3", duration: "3 rounds" });
  fight(s); turnOf(s, "wizard");
  const castRound = s.encounter.round;
  cast(s, id, { target: goblin.id });
  const seen = [];
  for (let i = 0; i < 60 && s.effects.length; i++) {
    const who = current(s), r = apply(s, { type: "endTurn", actor: who }, DM);
    if (r.events.some((e) => e.type === "effectEnd")) seen.push([s.encounter.round, current(s), r.events.find((e) => e.type === "effectEnd").why]);
  }
  assert.deepEqual(seen, [[castRound + 3, "wizard", "its time ran out"]]);
  assert.equal(goblin.cond.restrained, undefined);
});

test("ending by time outside a fight: when the world clock passes it, and a rest counts", () => {
  const { s, brenna, goblin } = field();
  const aid = learn(s, "wizard", AID), ward = learn(s, "wizard", WARD);
  cast(s, aid, { target: "fighter" });
  cast(s, ward, { target: "fighter" });
  assert.deepEqual(s.effects.map((fx) => fx.until), [{ clock: 480 + 480 }, { clock: 480 + 10 }]);
  assert.equal(rollMode(s, brenna, goblin, melee).add, 1);

  assert.deepEqual(types(apply(s, { type: "advanceTime", minutes: 9 }, DM)), ["time"]);
  assert.equal(s.effects.length, 2);
  const tenth = apply(s, { type: "advanceTime", minutes: 1 }, DM);
  const { fx: gone, ...ending } = tenth.events.at(-1);
  assert.deepEqual(ending, { type: "effectEnd", name: "Fire Bolt", source: "wizard", targets: ["fighter"], why: "its time ran out" });
  assert.match(gone, /^fx\d+$/);
  assert.equal(s.effects.length, 1);
  assert.ok(apply(s, { type: "rest" }, DM).events.some((e) => e.type === "effectEnd"));
  assert.deepEqual(s.effects, []);
  assert.equal(rollMode(s, brenna, goblin, melee).add, 0);
});

test("a modifier carried by an effect changes Armor Class for as long as the effect lasts", () => {
  const { s, goblin, brenna } = field();
  const ward = learn(s, "wizard", WARD);
  goblin.attacks[0].bonus = 0;
  fight(s); turnOf(s, "wizard");
  cast(s, ward, { target: "fighter" });
  assert.deepEqual(s.effects[0].parts, [{ target: "fighter", modifier: { on: "ac", op: "add", value: 2 } }]);
  apply(s, { type: "place", actor: goblin.id, to: { q: 1, r: 1 } }, DM);
  turnOf(s, goblin.id);
  const swing = apply(s, { type: "attack", actor: goblin.id, target: "fighter", attack: "scimitar" }, DM).events[0];
  assert.equal(swing.ac, brenna.ac + 2);
  apply(s, { type: "endEffect", effect: s.effects[0].id }, DM);
  turnOf(s, "fighter"); turnOf(s, goblin.id);
  assert.equal(apply(s, { type: "attack", actor: goblin.id, target: "fighter", attack: "scimitar" }, DM).events[0].ac, brenna.ac);
  // With no duration to carry it, a modifier is handed to the DM.
  const flash = learn(s, "wizard", { ...WARD, id: "t-flash", duration: "instant", concentration: false });
  turnOf(s, "wizard");
  assert.match(cast(s, flash, { target: "fighter" }).events.find((e) => e.type === "manual").text, /no duration for the engine/);
});

test("a repeat save at the end of each turn ends the condition, and with it the effect", () => {
  const { s, goblin } = field();
  failsSaves(goblin);
  const id = learn(s, "wizard", HOLD);
  fight(s); turnOf(s, "wizard");
  cast(s, id, { target: goblin.id });
  assert.ok(goblin.cond.paralyzed);
  assert.deepEqual(s.effects[0].parts[0].ends, { on: "save", save: "wis", at: "turnEnd" });

  // It keeps failing: a save is rolled at the end of each of its turns and it stays held.
  turnOf(s, goblin.id);
  let r = apply(s, { type: "endTurn", actor: goblin.id }, DM);
  const again = r.events.find((e) => e.type === "save");
  assert.deepEqual([again.id, again.abil, again.against, again.success], [goblin.id, "wis", "Fire Bolt", false]);
  assert.ok(goblin.cond.paralyzed);
  // Now it will pass.
  passesSaves(goblin);
  turnOf(s, goblin.id);
  r = apply(s, { type: "endTurn", actor: goblin.id }, DM);
  assert.deepEqual(types(r).slice(0, 3), ["save", "condEnd", "effectEnd"]);
  assert.equal(r.events[2].why, "nothing is left of it");
  assert.deepEqual([goblin.cond, s.effects], [{}, []]);
});

test("ending at a turn boundary: the target's turn end, or the caster's next turn start", () => {
  const { s, goblin } = field();
  failsSaves(goblin);
  const daze = learn(s, "wizard", DAZE), mark = learn(s, "wizard", MARK);
  fight(s); turnOf(s, "wizard");
  cast(s, daze, { target: goblin.id });
  assert.ok(goblin.cond.stunned);
  turnOf(s, goblin.id);
  assert.deepEqual(s.encounter.budget.action, 0);
  const r = apply(s, { type: "endTurn", actor: goblin.id }, DM);
  assert.ok(r.events.some((e) => e.type === "condEnd" && e.cond === "stunned"));
  assert.equal(goblin.cond.stunned, undefined);

  turnOf(s, "wizard");
  cast(s, mark, { target: goblin.id });
  turnOf(s, goblin.id);
  assert.ok(goblin.cond.blinded, "still blinded on its own turn");
  for (let i = 0; i < 40 && current(s) !== "wizard"; i++) apply(s, { type: "endTurn", actor: current(s) }, DM);
  assert.equal(goblin.cond.blinded, undefined, "gone at the start of the caster's next turn");
});

test("when the fight ends, rounds become clock time and turn-bound conditions end", () => {
  const { s, goblin } = field();
  failsSaves(goblin);
  const slow = learn(s, "wizard", SLOW), mark = learn(s, "wizard", MARK);
  fight(s); turnOf(s, "wizard");
  cast(s, slow, { target: goblin.id });
  apply(s, { type: "endTurn", actor: "wizard" }, DM); turnOf(s, "wizard");
  cast(s, mark, { target: goblin.id });
  const clock = s.clock, roundsLeft = s.effects[0].until.round - s.encounter.round;
  const end = apply(s, { type: "endEncounter" }, DM);
  assert.ok(end.events.some((e) => e.type === "condEnd" && e.cond === "blinded"));
  assert.deepEqual(s.effects.map((fx) => fx.name === "Fire Bolt" && fx.until), [{ clock: clock + roundsLeft * 0.1 }]);
  assert.ok(goblin.cond.restrained, "the minute-long spell carries on outside the fight");
  apply(s, { type: "advanceTime", minutes: 1 }, DM);
  assert.deepEqual([s.effects, goblin.cond.restrained], [[], undefined]);
});

test("Concentration: one spell at a time, and each thing that breaks it", () => {
  const setup = () => { const f = field(); failsSaves(f.goblin); f.slow = learn(f.s, "wizard", SLOW); f.ward = learn(f.s, "wizard", WARD); fight(f.s); turnOf(f.s, "wizard"); cast(f.s, f.slow, { target: f.goblin.id }); return f; };
  const ended = (r) => r.events.find((e) => e.type === "effectEnd")?.why;

  // 1. Casting another Concentration spell.
  let f = setup();
  apply(f.s, { type: "endTurn", actor: "wizard" }, DM); turnOf(f.s, "wizard");
  let r = cast(f.s, f.ward, { target: "fighter" });
  assert.match(ended(r), /began concentrating on/);
  assert.deepEqual([f.s.effects.length, f.goblin.cond.restrained], [1, undefined]);
  // A spell that needs no Concentration leaves it alone.
  const aid = learn(f.s, "wizard", AID);
  apply(f.s, { type: "endTurn", actor: "wizard" }, DM); turnOf(f.s, "wizard");
  assert.equal(ended(cast(f.s, aid, { target: "fighter" })), undefined);
  assert.equal(f.s.effects.length, 2);

  // 2. Taking damage and failing the save: DC 10, or half the damage if that is higher.
  f = setup(); failsSaves(f.wizard);
  r = apply(f.s, { type: "setHp", actor: "wizard", hp: 150 }, DM);
  const check = r.events.find((e) => e.type === "concentration");
  assert.deepEqual([check.dc, check.success, ended(r)], [25, false, "Tavin lost Concentration"]);
  assert.equal(f.goblin.cond.restrained, undefined);
  // ...and passing it.
  f = setup(); passesSaves(f.wizard);
  r = apply(f.s, { type: "setHp", actor: "wizard", hp: 195 }, DM);
  assert.deepEqual([r.events.find((e) => e.type === "concentration").dc, ended(r)], [10, undefined]);
  assert.ok(f.goblin.cond.restrained);
  // Damage to someone who is not concentrating rolls nothing.
  assert.equal(apply(f.s, { type: "setHp", actor: "fighter", hp: 5 }, DM).events.some((e) => e.type === "concentration"), false);

  // 3. Dropping to 0 hit points.
  f = setup();
  r = apply(f.s, { type: "setHp", actor: "wizard", hp: 0 }, DM);
  assert.deepEqual([ended(r), r.events.some((e) => e.type === "concentration")], ["Tavin went down", false]);

  // 4. Being incapacitated by a condition.
  f = setup();
  r = apply(f.s, { type: "condition", actor: "wizard", condition: "stunned", on: true }, DM);
  assert.equal(ended(r), "Tavin is Stunned");
  // A condition that does not incapacitate leaves it alone.
  f = setup();
  assert.equal(ended(apply(f.s, { type: "condition", actor: "wizard", condition: "poisoned", on: true }, DM)), undefined);

  // 5. Choosing to drop it: the caster's own player may, another player may not.
  f = setup();
  apply(f.s, { type: "claim", entity: "wizard", user: "pat", userName: "Pat" }, PLAYER);
  const fx = f.s.effects[0].id;
  assert.match(apply(f.s, { type: "endEffect", effect: fx }, { role: "player", userId: "sam" }).error, /isn't yours to end/);
  assert.match(apply(f.s, { type: "endEffect", effect: "fx999" }, DM).error, /No such effect/);
  assert.equal(ended(apply(f.s, { type: "endEffect", effect: fx }, PLAYER)), "Tavin ended it");
});

test("a spell the engine cannot time is still recorded, and the DM is told to end it", () => {
  const { s, goblin } = field();
  const id = learn(s, "wizard", GEAS);
  fight(s); turnOf(s, "wizard");
  const r = cast(s, id, { target: goblin.id });
  apply(s, { type: "endEncounter" }, DM);
  assert.equal(s.effects[0].until, null);
  assert.match(r.events.at(-1).text, /lasts until dispelled\. The engine cannot time that; the DM ends it/);
  apply(s, { type: "advanceTime", minutes: 100000 }, DM);
  assert.equal(s.effects.length, 1);
  assert.ok(apply(s, { type: "endEffect", effect: s.effects[0].id }, DM).ok);
  assert.deepEqual(goblin.cond, {});
});

test("players are sent the effects that involve their characters, and only what they could see of the rest", () => {
  const { s, goblin } = field();
  failsSaves(goblin);
  const slow = learn(s, "wizard", SLOW);
  fight(s); turnOf(s, "wizard");
  const r = cast(s, slow, { target: goblin.id });
  assert.deepEqual(viewEvents(r.events, s, PLAYER).map((e) => e.type), ["cast", "effectStart", "save", "cond"]);
  const [mine] = view(s, PLAYER).effects;
  assert.deepEqual([mine.name, mine.source, mine.parts], ["Fire Bolt", "wizard", [{ target: goblin.id, cond: "restrained" }]]);

  // A monster's effect on a monster: nothing reaches the players.
  goblin.spells = []; goblin.castAbil = "wis"; goblin.slots = { 1: 3 };
  const other = s.entities[apply(s, { type: "spawn", monster: "wolf", at: { q: 3, r: 0 } }, DM).events[0].id];
  const curse = learn(s, goblin.id, { ...SLOW, id: "t-curse", concentration: false, effects: [{ condition: "poisoned" }] });
  apply(s, { type: "condition", actor: goblin.id, condition: "restrained", on: false }, DM);
  apply(s, { type: "endEffect", effect: s.effects[0].id }, DM);
  turnOf(s, goblin.id);
  const theirs = cast(s, curse, { target: other.id }, goblin.id);
  assert.deepEqual(viewEvents(theirs.events, s, PLAYER).map((e) => e.type), ["cast"]);
  assert.deepEqual(view(s, PLAYER).effects, []);
  assert.equal(view(s, DM).effects.length, 1);
  // The same curse on Brenna: the players see it, with its part in full.
  apply(s, { type: "endTurn", actor: goblin.id }, DM); turnOf(s, goblin.id);
  apply(s, { type: "place", actor: "fighter", to: { q: 1, r: 0 } }, DM);
  const onUs = cast(s, curse, { target: "fighter" }, goblin.id);
  assert.ok(viewEvents(onUs.events, s, PLAYER).some((e) => e.type === "effectStart"));
  assert.deepEqual(view(s, PLAYER).effects.at(-1).parts, [{ target: "fighter", cond: "poisoned" }]);
});

test("a fight with lasting spells replays identically, and leaves nothing behind once everything has run out", () => {
  const play = () => {
    const { s, goblin } = field(31);
    failsSaves(goblin);
    const spells = [HOLD, SLOW, WARD, DAZE, MARK].map((d) => learn(s, "wizard", { ...d, id: d.id + "-r" }));
    fight(s);
    let casts = 0;
    for (let i = 0; i < 120 && s.encounter; i++) {
      const id = current(s), e = s.entities[id];
      if (id === "wizard") { apply(s, { type: "cast", actor: id, spell: spells[casts % spells.length], target: casts % 5 === 2 ? "fighter" : goblin.id }, DM); casts++; }
      else if (e.side !== "party") apply(s, { type: "attack", actor: id, target: "wizard", attack: "shortbow" }, DM);
      else apply(s, { type: "attack", actor: id, target: goblin.id, attack: e.attacks.at(-1).id }, DM);
      if (i % 4 === 1 && s.entities.wizard.hp > 30) apply(s, { type: "setHp", actor: "wizard", hp: s.entities.wizard.hp - 12 }, DM);   // something hurts the caster
      if (s.encounter && current(s) === id) apply(s, { type: "endTurn", actor: id }, DM);
    }
    if (s.encounter) apply(s, { type: "endEncounter" }, DM);
    apply(s, { type: "advanceTime", minutes: 60 }, DM);
    return s;
  };
  const a = play(), b = play();
  assert.deepEqual(a, b);
  assert.ok(a.timeline.filter((e) => e.type === "effectStart").length > 5);
  assert.ok(a.timeline.some((e) => e.type === "concentration"));
  assert.deepEqual(a.effects, []);
  for (const e of Object.values(a.entities)) for (const c of Object.values(e.cond)) assert.equal(c.effect, undefined, "no condition is left pointing at an ended effect");
});
