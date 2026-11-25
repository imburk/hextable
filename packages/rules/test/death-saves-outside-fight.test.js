// Death Saving Throws outside a fight (DEBT W10, job 8 of issue #726). SRD 5.2.1, "Dropping to 0 Hit Points": "Whenever you start your turn with 0 Hit
// Points, you must make a Death Saving Throw"; "Stabilizing a Character": "You can take the Help action to try to stabilize a creature with 0 Hit
// Points, which requires a successful DC 10 Wisdom (Medicine) check." Outside a fight there are no turns, so a creature dying in the party makes
// a save for each 6 seconds the DM lets pass (`advanceTime`, a rest), until it is Stable, dead or up; the rolls are events the table sees
// (docs/specs/rules-expansion.md, "Build notes: Death Saving Throws outside a fight").
import assert from "node:assert/strict";
import { test } from "node:test";
import { derive } from "../src/derive.js";
import { apply, current, makeEntity } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
const A = { str: 10, dex: 14, con: 12, int: 14, wis: 14, cha: 10 };
const wizard = (name) => ({ name, class: "wizard", level: 1, abilities: A, skills: ["arcana", "history"], spells: ["light", "mage-armor"] });
const cleric = { name: "Orsk", class: "cleric", level: 3, subclass: "life", abilities: { ...A, wis: 16 }, skills: ["medicine", "religion"], choices: { "divine-order": "protector" }, spells: ["spare-the-dying", "cure-wounds"] };

// Characters in a row 5 feet apart on open grass; the ones named are the party. The seed picks the dice.
function table(sheets, seed = 7) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  Object.entries(sheets).forEach(([id, sheet], i) => {
    const e = makeEntity(derive(sheet).record, { id, kind: "pc", side: "party", pos: { q: i, r: 0, z: 0 } });
    e.sheet = structuredClone(sheet);
    s.entities[id] = e;
  });
  return s;
}
const down = (e, death = { s: 0, f: 0 }) => { e.hp = 0; e.cond.unconscious = {}; e.cond.prone = {}; e.death = death; };
const saves = (r, id) => r.events.filter((e) => e.type === "deathSave" && e.id === id);
const refused = (s, act, pattern) => {
  const before = json(s), r = apply(s, act, DM);
  assert.equal(r.ok, false, "refused");
  assert.match(r.error, pattern);
  assert.equal(json(s), before, "a refused action changes nothing");
};
// The first seed whose game, set up by `make`, ends the way `want` says after `act`.
function seedWhere(make, act, want) {
  for (let seed = 1; seed < 400; seed++) {
    const s = make(seed), r = apply(s, act, DM);
    if (r.ok && want(s, r)) return seed;
  }
  assert.fail("no seed gives that outcome");
}

test("advanceTime: a dying creature rolls a Death Saving Throw for each 6 seconds that pass, until it is settled", () => {
  const make = (seed) => { const s = table({ pip: wizard("Pip"), ned: wizard("Ned") }, seed); down(s.entities.pip); return s; };
  const s = make(7), r = ok(apply(s, { type: "advanceTime", minutes: 0.2 }, DM));
  const rolled = saves(r, "pip");
  assert.ok(rolled.length >= 1 && rolled.length <= 2, "two rounds pass: at most two saves");
  assert.equal(saves(r, "ned").length, 0, "Ned is up and rolls nothing");
  assert.equal(r.events.findIndex((e) => e.type === "deathSave") < r.events.findIndex((e) => e.type === "time"), true, "told before the time passes");
  assert.ok(r.events.some((e) => e.type === "note" && e.id === "pip" && /Death Saving Throw/.test(e.text)));
  assert.equal(s.clock, make(7).clock + 0.2, "the clock moved by the time, no more");
  // Less than a round passing rolls nothing.
  const t = make(7), q = ok(apply(t, { type: "advanceTime", minutes: 0.05 }, DM));
  assert.equal(saves(q, "pip").length, 0);
  assert.deepEqual(t.entities.pip.death, { s: 0, f: 0 });
});

test("advanceTime: ten minutes settle a dying creature: Stable, dead, or up on a 20; never more than five saves", () => {
  const seen = new Set();
  for (let seed = 1; seed < 80; seed++) {
    const s = table({ pip: wizard("Pip") }, seed); down(s.entities.pip);
    const r = ok(apply(s, { type: "advanceTime", minutes: 10 }, DM)), e = s.entities.pip, rolled = saves(r, "pip");
    assert.ok(rolled.length >= 1 && rolled.length <= 5, `${rolled.length} saves`);
    const last = rolled.at(-1);
    if (e.dead) { seen.add("dead"); assert.equal(last.dead, true); assert.ok(e.diedAt > s.clock - 10 - 1e-9 && e.diedAt <= s.clock, "died while the time passed"); }
    else if (e.hp > 0) { seen.add("up"); assert.equal(rolled.at(-1).roll, 20); assert.equal(e.hp, 1); assert.equal(e.cond.unconscious, undefined); }
    else { seen.add("stable"); assert.ok(e.cond.stable); assert.deepEqual(e.death, { s: 0, f: 0 }); assert.equal(last.stable, true); }
  }
  assert.deepEqual([...seen].sort(), ["dead", "stable", "up"]);
});

test("advanceTime: the saves use the engine's rules (a 1 is two failures; the counts carry on) and the same seed rolls the same", () => {
  const make = (seed) => { const s = table({ pip: wizard("Pip") }, seed); down(s.entities.pip, { s: 1, f: 2 }); return s; };
  const a = make(11), b = make(11);
  ok(apply(a, { type: "advanceTime", minutes: 1 }, DM)); ok(apply(b, { type: "advanceTime", minutes: 1 }, DM));
  assert.equal(json(a), json(b));
  assert.ok(a.entities.pip.dead || a.entities.pip.cond.stable || a.entities.pip.hp > 0, "one save from the edge settles it");
});

test("advanceTime: only the party's dying roll; a Stable creature, a foe and the dead are left alone, and nobody dying means no events", () => {
  const s = table({ pip: wizard("Pip"), ned: wizard("Ned"), ivy: wizard("Ivy") });
  down(s.entities.pip); s.entities.pip.cond.stable = {};
  down(s.entities.ned); s.entities.ned.dead = true;
  const g = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 5, r: 0 } }, DM)).events[0].id;
  Object.assign(s.entities[g], { hp: 0 });
  const r = ok(apply(s, { type: "advanceTime", minutes: 5 }, DM));
  assert.equal(r.events.filter((e) => e.type === "deathSave").length, 0);
  assert.deepEqual(r.events.map((e) => e.type), ["time"]);
});

test("a Short Rest: the dying roll through the hour; one that is still at 0 Hit Points is told it cannot rest; the dead do not rest", () => {
  const make = (seed) => { const s = table({ pip: wizard("Pip"), ned: wizard("Ned") }, seed); down(s.entities.pip); return s; };
  const dies = seedWhere((n) => { const s = make(n); s.entities.pip.death = { s: 0, f: 2 }; return s; }, { type: "shortRest" }, (s) => s.entities.pip.dead);
  const s = make(dies); s.entities.pip.death = { s: 0, f: 2 };
  const r = ok(apply(s, { type: "shortRest" }, DM));
  assert.equal(s.entities.pip.dead, true);
  assert.ok(saves(r, "pip").length >= 1);
  assert.equal(r.events.some((e) => e.type === "manual" && e.actor === "pip"), false, "a dead creature is not told it cannot rest");
  const t = make(3), q = ok(apply(t, { type: "shortRest" }, DM));
  assert.ok(saves(q, "pip").length >= 1 && saves(q, "pip").length <= 5);
  if (t.entities.pip.hp === 0 && !t.entities.pip.dead) assert.ok(q.events.some((e) => e.type === "manual" && e.actor === "pip" && /Short Rest/.test(e.text)));
});

test("a Long Rest: the dying roll through the eight hours; one made Stable regains 1 Hit Point; nobody is left to the DM to settle", () => {
  const seen = new Set();
  for (let seed = 1; seed < 60; seed++) {
    const s = table({ pip: wizard("Pip"), ned: wizard("Ned") }, seed); down(s.entities.pip);
    const r = ok(apply(s, { type: "rest" }, DM)), e = s.entities.pip;
    assert.ok(saves(r, "pip").length >= 1);
    assert.equal(r.events.some((x) => x.type === "manual" && x.actor === "pip"), false, "settled by the saves");
    if (e.dead) seen.add("dead");
    else { assert.ok(e.hp >= 1, "Stable, or up on a 20, it has Hit Points after eight hours"); seen.add("alive"); assert.equal(s.entities.ned.hp, s.entities.ned.maxHp); }
  }
  assert.deepEqual([...seen].sort(), ["alive", "dead"]);
});

test("a rest that names who rests still rolls for every dying creature, and a refused rest rolls nothing", () => {
  const s = table({ pip: wizard("Pip"), ned: wizard("Ned") }); down(s.entities.pip);
  refused(s, { type: "rest", ids: ["nobody"] }, /No such creature/);
  refused(s, { type: "advanceTime", minutes: 0 }, /forward/);
  const r = ok(apply(s, { type: "rest", ids: ["ned"] }, DM));
  assert.ok(saves(r, "pip").length >= 1, "time passes for Pip whether or not it rests");
});

// ---------- stabilizing, outside a fight ----------

const medics = (seed) => { const s = table({ orsk: cleric, pip: wizard("Pip"), ned: wizard("Ned") }, seed); down(s.entities.pip, { s: 1, f: 2 }); return s; };
const stab = { type: "stabilize", actor: "orsk", target: "pip" };

test("stabilize: a DC 10 Wisdom (Medicine) check by a creature within 5 feet; a success makes the dying creature Stable, a failure changes only the dice", () => {
  const won = seedWhere(medics, stab, (s) => s.entities.pip.cond.stable);
  const s = medics(won), r = ok(apply(s, stab, DM)), c = r.events.find((e) => e.type === "check");
  assert.equal(c.skill, "medicine"); assert.equal(c.ability, "wis"); assert.equal(c.dc, 10); assert.equal(c.success, true); assert.ok(c.total >= 10);
  assert.ok(r.events.some((e) => e.type === "cond" && e.id === "pip" && e.cond === "stable"));
  assert.deepEqual(s.entities.pip.death, { s: 0, f: 0 });
  assert.equal(s.entities.pip.hp, 0);
  const lost = seedWhere(medics, stab, (s, rr) => !s.entities.pip.cond.stable && rr.events.some((e) => e.type === "check" && !e.success));
  const t = medics(lost), clock = t.clock;
  const q = ok(apply(t, stab, DM));
  assert.equal(q.events.find((e) => e.type === "check").success, false);
  assert.equal(t.clock, clock + 0.1, "an attempt out of a fight takes 6 seconds");
  assert.equal(saves(q, "pip").length, 1, "and the dying creature rolls its save for them");
  assert.ok(q.events.findIndex((e) => e.type === "check") < q.events.findIndex((e) => e.type === "deathSave") && q.events.some((e) => e.type === "time" && e.minutes === 0.1));
  if (!t.entities.pip.dead && t.entities.pip.hp === 0 && !t.entities.pip.cond.stable) ok(apply(t, stab, DM));   // and it may be tried again
});

test("stabilize: any creature may try, trained in Medicine or not", () => {
  const s = table({ ned: wizard("Ned"), pip: wizard("Pip") }); down(s.entities.pip);
  const r = ok(apply(s, { type: "stabilize", actor: "ned", target: "pip" }, DM));
  assert.equal(r.events.find((e) => e.type === "check").skill, "medicine");
});

test("stabilize is refused, changing nothing, for a target that is up, Stable or dead, one out of reach, oneself, or a helper who is down", () => {
  const s = medics(1);
  refused(s, { ...stab, target: "ned" }, /not at 0 Hit Points/);
  refused(s, { ...stab, target: "orsk" }, /itself/);
  refused(s, { ...stab, target: "nobody" }, /No such creature/);
  refused(s, { ...stab, target: undefined }, /No such creature/);
  s.entities.pip.pos = { q: 3, r: 0, z: 0 };
  refused(s, stab, /within 5 feet/);
  s.entities.pip.pos = { q: 1, r: 0, z: 0 };
  s.entities.pip.cond.stable = {};
  refused(s, stab, /Stable already/);
  delete s.entities.pip.cond.stable; s.entities.pip.dead = true;
  refused(s, stab, /dead/);
  s.entities.pip.dead = false;
  down(s.entities.ned); s.entities.orsk.hp = 0;
  refused(s, stab, /is down/);
  refused(s, { ...stab, actor: "ned", target: "orsk" }, /is down/);
});

test("stabilize in a fight takes the helper's action on its turn", () => {
  const s = medics(5);
  const g = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 9, r: 0 } }, DM)).events[0].id;
  ok(apply(s, { type: "startEncounter", center: s.entities.orsk.pos, radius: 30 }, DM));
  assert.ok(s.encounter);
  const notYet = current(s) !== "orsk";
  if (notYet) refused(s, stab, /turn/);
  for (let i = 0; i < 12 && current(s) !== "orsk"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.equal(current(s), "orsk");
  const left = s.encounter.budget.action;
  if (s.entities.pip.hp > 0 || s.entities.pip.cond.stable || s.entities.pip.dead) return;   // the goblin or the saves settled Pip first: nothing to try
  ok(apply(s, stab, DM));
  assert.equal(s.encounter.budget.action, left - 1);
  refused(s, stab, /action|Stable/);
  assert.ok(g);
});

// ---------- what else stabilises or heals a dying creature outside a fight (Isaac's play note, 15 November) ----------

test("Spare the Dying and healing work on a dying creature outside a fight", () => {
  const s = table({ orsk: cleric, pip: wizard("Pip"), ned: wizard("Ned") }); down(s.entities.pip, { s: 1, f: 2 }); down(s.entities.ned, { s: 0, f: 1 }); s.entities.ned.pos = { q: 0, r: 1, z: 0 };
  ok(apply(s, { type: "cast", actor: "orsk", spell: "spare-the-dying", target: "pip" }, DM));
  assert.ok(s.entities.pip.cond.stable);
  const r = ok(apply(s, { type: "cast", actor: "orsk", spell: "cure-wounds", target: "ned", slot: 1 }, DM));
  assert.ok(s.entities.ned.hp > 0, "healed");
  assert.equal(s.entities.ned.cond.unconscious, undefined);
  assert.deepEqual(s.entities.ned.death, { s: 0, f: 0 });
  assert.ok(r.events.some((e) => e.type === "heal" && e.target === "ned"));
  // A Stable creature is healed too, and wakes.
  const h = ok(apply(s, { type: "cast", actor: "orsk", spell: "cure-wounds", target: "pip", slot: 1 }, DM));
  assert.ok(s.entities.pip.hp > 0 && !s.entities.pip.cond.stable);
  assert.ok(h.ok);
});

test("a Long Rest: one dying at its start that rolls a 20 has 1 Hit Point and none of the rest's benefits", () => {
  const make = (seed) => { const s = table({ pip: wizard("Pip"), ned: wizard("Ned") }, seed); down(s.entities.pip); s.entities.pip.slots = { 1: 0 }; s.entities.pip.hd = 0; return s; };
  const seed = seedWhere(make, { type: "rest" }, (s, r) => saves(r, "pip").some((x) => x.roll === 20));
  const s = make(seed), r = ok(apply(s, { type: "rest" }, DM)), pip = s.entities.pip;
  assert.ok(saves(r, "pip").some((x) => x.roll === 20));
  assert.equal(pip.hp, 1);
  assert.deepEqual(pip.slots, { 1: 0 }, "no slots back");
  assert.equal(pip.hd, 0, "no Hit Point Dice back");
});

test("stabilize reaches only a creature the helper's side can see; a player is told 'No such creature' of one it cannot", () => {
  const s = medics(1);
  s.entities.orsk.owner = "x";
  const g = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 0, r: 1 } }, DM)).events[0].id;
  Object.assign(s.entities[g], { hp: 0, hiding: { dc: 30 } });
  const before = json(s), r = apply(s, { ...stab, target: g }, { role: "player", userId: "x" });
  assert.equal(r.ok, false);
  assert.match(r.error, /No such creature/);
  assert.equal(json(s), before);
});
