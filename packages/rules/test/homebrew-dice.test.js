// The homebrew gate and the dice (#408, DEBT T35b and T35c). The gate caps the steps one use of an entry runs; this holds it to
// the dice too, so that nothing it admits meets an engine ceiling (effects.js, WORK). Part 1 is what the SRD pack does.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, PACKS } from "../src/content/index.js";
import { loadPack, overlayOf, using } from "../src/content/registry.js";
import { HOMEBREW_DICE, HOMEBREW_ENTRY_KINDS, HOMEBREW_WORK, lintEntry, workOf } from "../src/content/schema.js";
import { aiStep } from "../src/ai.js";
import { derive } from "../src/derive.js";
import { WORK } from "../src/effects.js";
import { apply, current, makeEntity } from "../src/engine.js";
import * as H from "../src/hex.js";
import { newGame } from "../src/scenario.js";

const SRD = PACKS[0];
const DICE = /^([+-]?)(?:(\d+)d(\d+))?(?:([+-]\d+))?$/;

// The largest count, sides and flat part in any single roll of any SRD entry (every string that is only dice).
function srdRolls() {
  const most = { count: [0, ""], sides: [0, ""], flat: [0, ""] };
  const walk = (v, where) => {
    if (typeof v === "string") {
      const m = DICE.exec(v);
      if (!m || !v.length || !/d|^[+-]\d+$/.test(v)) return;
      const f = m[4] !== undefined ? Math.abs(+m[4]) : m[2] === undefined ? Math.abs(+v) : 0;
      if (m[2] !== undefined && +m[2] > most.count[0]) most.count = [+m[2], `${where} ${v}`];
      if (m[3] !== undefined && +m[3] > most.sides[0]) most.sides = [+m[3], `${where} ${v}`];
      if (f > most.flat[0]) most.flat = [f, `${where} ${v}`];
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, where));
    else if (v && typeof v === "object") for (const k of Object.keys(v)) walk(v[k], where);
  };
  for (const kind of HOMEBREW_ENTRY_KINDS) for (const e of SRD[kind]) walk(e, `${kind}/${e.id}`);
  return most;
}

test("#408 part 1: the SRD's largest single roll is 26 dice (Ancient Red Dragon, 26d6), 12 sides (a d12) and a flat 70 (Heal)", () => {
  const m = srdRolls();
  if (process.env.HB_PRINT) console.log(m);
  assert.equal(m.count[0], 26);
  assert.match(m.count[1], /ancient-red-dragon/);
  assert.equal(m.sides[0], 12);
  assert.equal(m.flat[0], 70);
});

const SRC = "homebrew:x";
const strict = (kind, e) => lintEntry(kind, e, { pack: "x", srd: CONTENT });
const boom = (damage, over = {}) => ({
  id: "hb-x-boom", name: "Boom", source: SRC, level: 1, school: "evocation", classes: ["wizard"], time: "action", range: 60, components: ["v", "s"], duration: "instant",
  concentration: false, ritual: false, target: { creature: { count: 1 } }, effects: [{ save: "dex", half: true, onFail: [{ damage, type: "fire" }] }], tier: "auto", checked: false, text: "x", ...over,
});
const refused = (problems, re) => { assert.ok(problems.length, "refused"); assert.match(problems.join("\n"), re); };

// ---------- part 2: one roll ----------
test("#408 part 2: one roll has at most about twice the SRD's largest count, sides and flat part, and the SRD sits inside", () => {
  const m = srdRolls();
  assert.ok(HOMEBREW_DICE.count >= m.count[0] && HOMEBREW_DICE.count <= 2 * m.count[0], `${HOMEBREW_DICE.count} dice against the SRD's ${m.count[0]}`);
  assert.ok(HOMEBREW_DICE.sides >= m.sides[0] && HOMEBREW_DICE.sides <= 2 * m.sides[0], `${HOMEBREW_DICE.sides} sides against the SRD's ${m.sides[0]}`);
  assert.ok(HOMEBREW_DICE.flat >= m.flat[0] && HOMEBREW_DICE.flat <= 2 * m.flat[0], `a flat ${HOMEBREW_DICE.flat} against the SRD's ${m.flat[0]}`);
  assert.deepEqual(strict("spells", boom("50d24+140")), []);
  assert.deepEqual(strict("spells", boom("50d6-140")), []);
  refused(strict("spells", boom("51d6")), /rolls 51 dice; the most is 50/);
  refused(strict("spells", boom("1d25")), /dice of 25 sides; they have 2 to 24/);
  refused(strict("spells", boom("50d100")), /dice of 100 sides/);
  refused(strict("spells", boom("1d6+141")), /adds 141; the most is 140/);
  refused(strict("spells", boom("1d6-141")), /adds 141; the most is 140/);
  refused(strict("spells", boom("+141")), /adds 141; the most is 140/);
  // Beside dice in a step that is not damage, and in what grows with a higher slot.
  refused(strict("spells", boom("1d6", { effects: [{ heal: "9d9+999" }] })), /adds 999/);
  refused(strict("spells", boom("1d6", { higher: { slot: { damage: "1d100" } } })), /dice of 100 sides/);
});

// ---------- part 3: the work estimate counts dice ----------
const DM = { role: "dm", userId: "dm" };
const hb = (id) => `hb-x-${id}`;
const doc = (lists) => ({ format: "hextable-pack", v: 1, pack: { id: "x", name: "X", version: 1, license: "CC0", attribution: "Test." }, ...lists });
const monster = (over = {}) => ({ ...structuredClone(CONTENT.monsters["goblin-warrior"]), id: hb("dire"), name: "Dire Thing", source: SRC, checked: false, hp: 1400, ...over });
const attackAction = (id, onHit, over = {}) => ({ id, name: "Rend", text: "x", target: { creature: { reach: 120 } }, effects: [{ attack: "melee", kind: "weapon", bonus: 40, onHit }], ...over });
const multi = (...entries) => ({ id: "multi", name: "Multiattack", text: "x", multiattack: entries });
const potion = (effects, over = {}) => ({ id: hb("potion"), name: "Hot Potion", category: "potion", rarity: "common", wear: "carried", tier: "auto", source: SRC, checked: false, text: "x", activate: [{ time: "bonus", consumed: true, effects }], ...over });
const thing = (effects, over = {}) => ({ id: hb("trap"), name: "Zz Ember Trap", kind: "thing", source: SRC, tier: "auto", checked: false, text: "x", states: { armed: { name: "armed", blocks: [] }, spent: { name: "spent", blocks: [] } }, initial: "armed", use: [], triggers: [{ on: "enter", from: ["armed"], to: "spent", area: 100, effects }], ...over });
const D = (n, times) => ({ damage: `${n}d24+140`, type: "fire", ...(times ? { times } : {}) });
const dice = (kind, e) => workOf(kind, e).dice;

test("#408 part 3: the ceilings stay a quarter under the engine's (steps, dice faces, attacks), and events are measured below", () => {
  assert.ok(HOMEBREW_WORK.steps <= 0.75 * WORK.steps, `steps ${HOMEBREW_WORK.steps} of ${WORK.steps}`);
  assert.ok(HOMEBREW_WORK.dice <= 0.75 * WORK.dice, `dice ${HOMEBREW_WORK.dice} of ${WORK.dice}`);
  assert.ok(HOMEBREW_WORK.attacks <= 0.75 * WORK.attacks, `attacks ${HOMEBREW_WORK.attacks} of ${WORK.attacks}`);
  assert.equal(HOMEBREW_WORK.dice, 900);
  // What the gate's worst entry of each kind writes is in part 4 (events <= 0.75 * WORK.events), measured at a table of 30.
});

test("#408 part 3: the estimate counts what the engine counts, kind by kind", () => {
  // A spell: damage in an area is rolled once and shared; what is rolled for each creature (a heal, an attack's damage doubled by a critical hit) is multiplied.
  assert.equal(dice("spells", boom("40d6", { target: { area: { shape: "sphere", size: 20 } } })), 40);
  assert.equal(dice("spells", boom("40d6", { target: { area: { shape: "sphere", size: 1000 } }, effects: [{ heal: "3d4" }] })), 90);
  assert.equal(dice("spells", boom("8d8", { target: { creature: { count: 3, repeat: true } }, effects: [{ attack: "ranged", kind: "spell", onHit: [{ damage: "8d8", type: "fire" }] }] })), 48);
  // The slot: the first damage step grows by `higher.slot` for each level above the spell's, and repeats more.
  assert.equal(dice("spells", boom("8d6", { level: 3, higher: { slot: { damage: "1d6" } } })), 8 + 6);
  assert.equal(dice("spells", boom("8d6", { level: 3, higher: { slot: { damage: "1d6", times: 1 } } })), 14 * 7);
  assert.equal(dice("spells", boom("1d6", { level: 0, higher: { level: { 5: "2d6", 11: "3d6", 17: "4d6" } } })), 4);
  // A zone rolls for one creature at a time: two ticks in an end of turn, or the whole table's worth when it can go off on entering.
  assert.equal(dice("spells", boom("3d8", { duration: "1 minute", target: { area: { shape: "emanation", size: 15 } }, zone: { on: ["turnStart", "turnEnd"] } })), 6);
  assert.equal(dice("spells", boom("3d8", { duration: "1 minute", target: { area: { shape: "emanation", size: 15 } }, zone: { on: ["enter", "turnEnd"] } })), 90);
  // A monster: its dearest action; a Multiattack is made of attacks that are each an action to the engine, so its dice are its dearest attack's (a critical hit doubles them).
  const m = monster({ actions: [attackAction("a1", [D(10, 5)]), attackAction("a2", [D(4, 1)]), multi({ action: "a1", times: 3 }, { action: "a2", times: 3 })] });
  assert.equal(dice("monsters", m), 10 * 5 * 2);
  // An item's use is for the one who uses it; an object's use or trigger for a creature, or for each of those an `area` reaches.
  assert.equal(dice("items", potion([D(3, 10), { heal: "4d4" }])), 30 + 4);
  assert.equal(dice("objects", thing([D(3, 10)])), 30);
  assert.equal(dice("objects", thing([{ attack: "ranged", kind: "weapon", bonus: 5, onHit: [D(3, 2)] }])), 30 * 3 * 2 * 2);
  // The SRD: its dearest single cast, action, item and object (the ceiling is three times its dearest, a zone that goes off on entering).
  const most = {};
  for (const kind of HOMEBREW_ENTRY_KINDS) for (const e of SRD[kind]) most[kind] = Math.max(most[kind] ?? 0, dice(kind, e));
  const noZone = Math.max(...SRD.spells.filter((e) => !e.zone).map((e) => dice("spells", e)));
  if (process.env.HB_PRINT) console.log(most, { noZone });
  assert.deepEqual([most.spells, noZone, most.monsters, most.items, most.objects], [300, 54, 26, 10, 2]);
  assert.ok(HOMEBREW_WORK.dice >= most.spells, "every SRD entry fits");
});

test("#408 part 3: the ceiling is exact: 900 dice pass, 901 do not, for each kind", () => {
  const spellOf = (effects, over = {}) => boom("1d6", { target: { area: { shape: "sphere", size: 1000 } }, range: 10560000, effects, ...over });
  const one = (kind, e) => strict(kind, e);
  const heals = (n, extra = 0) => Array.from({ length: n }, () => ({ heal: `50d24+140` })).concat(extra ? [{ heal: `${extra}d4` }] : []);
  // an item: heal steps are not repeated by `times`; 18 x 50 = 900
  assert.deepEqual(one("items", potion(heals(18))), []);
  refused(one("items", potion(heals(18, 1))), /one use \(its use\) can roll 901 dice, counting every repeat/);
  // damage repeats: (50 + 40) x 10 = 900
  assert.deepEqual(one("items", potion([D(50, 10), D(40, 10)])), []);
  refused(one("items", potion([D(50, 10), D(41, 10)])), /can roll 910 dice/);
  // an attack's damage counts twice (a critical hit): 45 x 10 x 2 = 900, and 46 is 920
  const hit = (n) => ({ attack: "melee", kind: "weapon", bonus: 5, onHit: [D(n, 10)] });
  assert.deepEqual(one("spells", boom("1d6", { range: 5, effects: [hit(45)] })), []);
  refused(one("spells", boom("1d6", { range: 5, effects: [hit(46)] })), /can roll 920 dice, counting every repeat, the double dice of a critical hit/);
  // heals are rolled for each creature of an area: 30 x 30 = 900
  assert.deepEqual(one("spells", spellOf([{ heal: "30d6" }])), []);
  refused(one("spells", spellOf([{ heal: "31d6" }])), /can roll 930 dice/);
  // the slot: 450 + 450 = 900 at a 9th-level slot
  assert.deepEqual(one("spells", spellOf([{ damage: "50d6", type: "fire", times: 2 }], { level: 1, higher: { slot: { damage: "50d6" } } })), []);
  refused(one("spells", spellOf([{ damage: "50d6", type: "fire", times: 3 }], { level: 1, higher: { slot: { damage: "50d6" } } })), /can roll 1,350 dice/);
  // a zone: 30 dice for each creature entering (30 creatures), 450 a tick otherwise (two ticks)
  const zone = (on, d, times) => spellOf([{ save: "dex", half: true, onFail: [{ damage: d, type: "fire", times }] }], { duration: "1 minute", target: { area: { shape: "sphere", size: 100 } }, zone: { on } });
  assert.deepEqual(one("spells", zone(["enter", "turnStart", "turnEnd"], "30d24", 1)), []);
  refused(one("spells", zone(["enter", "turnEnd"], "31d24", 1)), /can roll 930 dice[^]*the most is 900/);
  assert.deepEqual(one("spells", zone(["turnStart", "turnEnd"], "45d24", 10)), []);
  refused(one("spells", zone(["turnStart", "turnEnd"], "46d24", 10)), /\(its zone, going off\) can roll 920 dice/);
  // a Multiattack's attack, an object's trigger
  const mon = (n) => monster({ actions: [attackAction("a1", [D(n, 10)]), multi({ action: "a1", times: 7 }, { action: "a1", times: 7 })] });
  assert.deepEqual(one("monsters", mon(45)), []);
  refused(one("monsters", mon(46)), /\(its action "a1"\) can roll 920 dice/);
  assert.deepEqual(one("objects", thing([{ save: "dex", onFail: [D(50, 10), D(40, 9)] }])), []);
  refused(one("objects", thing([{ save: "dex", onFail: [D(50, 10), D(50, 9)] }])), /\(its use\) can roll 950 dice/);
});

test("#408 part 3: the reviewer's three cases are refused, with plain sentences (and so is their 50d100)", () => {
  // M1: a potion of 3 steps x10 of 1,500 dice. As written (50d100) it is refused for its sides; with sides in range, for its dice.
  const p = (d) => potion(Array(3).fill({ damage: d, type: "fire", times: 10 }));
  refused(strict("items", p("50d100")), /dice of 100 sides; they have 2 to 24/);
  refused(strict("items", p("50d24")), /one use \(its use\) can roll 1,500 dice, counting every repeat, the double dice of a critical hit and every creature that rolls its own \(up to 30 at a table\); the most is 900/);
  // M2: a zone with 18 steps of 50d(100) + 140 a tick, on enter, turnStart and turnEnd.
  const z = (d) => boom("1d6", { level: 2, range: 10560000, duration: "1 minute", target: { area: { shape: "emanation", size: 100 } }, zone: { on: ["enter", "turnStart", "turnEnd"] }, effects: [{ save: "dex", half: true, onFail: Array(18).fill({ damage: d, type: "fire" }) }] });
  refused(strict("spells", z("50d100+140")), /dice of 100 sides/);
  refused(strict("spells", z("50d24+140")), /\(its zone, going off\) can roll 27,000 dice/);
  // M3: three or more damage steps x10 of 50d(100)+140 on one target; and a Multiattack of 14 of an attack of 4 steps x10.
  const one3 = (d) => boom("1d6", { level: 1, effects: [{ save: "dex", onFail: Array(3).fill({ damage: d, type: "fire", times: 10 }) }] });
  refused(strict("spells", one3("50d100+140")), /dice of 100 sides/);
  refused(strict("spells", one3("50d24+140")), /can roll 1,500 dice/);
  const hits = (d) => monster({ actions: [attackAction("a1", Array(4).fill({ damage: d, type: "slashing", times: 10 })), multi({ action: "a1", times: 7 }, { action: "a1", times: 7 })] });
  refused(strict("monsters", hits("50d100+140")), /dice of 100 sides/);
  refused(strict("monsters", hits("50d24+140")), /\(its action "a1"\) can roll 4,000 dice/);
});

// ---------- part 4: the heaviest entry the gate accepts, of each kind, used once at a table of 30 ----------
// A table of 30 creatures: the party, and goblin warriors around the wizard's target; nobody can die, so every creature is there to be reached.
function tableOf30(seed = 5) {
  const s = newGame(seed);
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM);
  let n = Object.keys(s.entities).length;
  for (let q = -4; q <= 4 && n < 30; q++) for (let r = -4; r <= 4 && n < 30; r++) {
    if (Math.abs(q + r) > 4) continue;
    if (apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: q + 2, r } }, DM).ok) n++;
  }
  assert.ok(n >= 30, `${n} creatures at the table`);
  for (const e of Object.values(s.entities)) e.hp = e.hpMax = 1e9;
  apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 12 }, DM);
  for (let i = 0; i < 40 && current(s) !== "wizard"; i++) apply(s, { type: "endTurn", actor: current(s) }, DM);
  assert.equal(current(s), "wizard");
  return s;
}
const loaded = (lists) => { const r = loadPack(doc(lists)); assert.ok(r.ok, r.problems?.join("; ")); return overlayOf([r.pack]); };
// One result that went well: it was applied, wrote no `manual` stop (nothing was left to the DM or half done), and stayed under 0.75 of the engine's events.
const WENT = (r, what) => {
  assert.ok(r.ok, `${what}: ${r.error}`);
  const manual = r.events.filter((e) => e.type === "manual");
  assert.deepEqual(manual.map((e) => e.text), [], `${what}: a manual stop`);
  assert.ok(r.events.length <= 0.75 * WORK.events, `${what}: ${r.events.length} events, the gate's share of the engine's ${WORK.events} is ${0.75 * WORK.events}`);
  return r;
};
const wizardWith = (s, id) => { Object.assign(s.entities.wizard, { slots: { 1: 4, 2: 4, 3: 4, 9: 4 }, slotsMax: { 1: 4, 2: 4, 3: 4, 9: 4 } }); s.entities.wizard.spells.push(id); };
const area = (size = 1000) => ({ area: { shape: "sphere", size } });
const mage = (id, over = {}) => boom("1d6", { id: hb(id), range: 10560000, ...over });

test("#408 part 4: a spell: the heaviest area cast (600 steps, 860 dice) and the heaviest at a 9th-level slot (900 dice) complete", () => {
  const worst = mage("worst", { level: 9, target: area(), effects: [{ save: "dex", dc: 50, half: true, onFail: [D(50, 10), { damage: "40d24+140", type: "fire", times: 9 }] }] });
  const grown = mage("grown", { level: 1, target: area(), effects: [{ save: "dex", dc: 50, half: true, onFail: [{ damage: "50d24+140", type: "fire", times: 2 }] }], higher: { slot: { damage: "50d24" } } });
  for (const sp of [worst, grown]) assert.deepEqual(strict("spells", sp), [], sp.id);
  assert.equal(dice("spells", worst), 860);
  assert.equal(dice("spells", grown), 900);
  const overlay = loaded({ spells: [worst, grown] });
  for (const sp of [worst, grown]) {
    const s = tableOf30();
    wizardWith(s, sp.id);
    const r = using(overlay, () => apply(s, { type: "cast", actor: "wizard", spell: sp.id, slot: 9, hex: { q: 2, r: 0 } }, DM));
    WENT(r, sp.id);
    assert.ok(r.events.filter((e) => e.type === "damage").length >= 25, "it reached the table");
  }
});

test("#408 part 4: a spell whose rolls are made for each creature (an attack's damage, doubled by a critical hit, on 20 creatures) completes", () => {
  const rays = mage("rays", { level: 1, target: { creature: { count: 20 } }, effects: [{ attack: "ranged", kind: "spell", onHit: [{ damage: "22d24+140", type: "fire" }] }] });
  assert.deepEqual(strict("spells", rays), []);
  assert.equal(dice("spells", rays), 880);
  const overlay = loaded({ spells: [rays] });
  const s = tableOf30();
  wizardWith(s, rays.id);
  const foes = Object.keys(s.entities).filter((id) => id !== "wizard").slice(0, 20);
  const r = using(overlay, () => apply(s, { type: "cast", actor: "wizard", spell: rays.id, slot: 1, targets: foes }, DM));
  WENT(r, "rays");
  assert.equal(r.events.filter((e) => e.type === "attack").length, 20);
});

// A monster at the table of 30, on its turn.
function monsterTurn(overlay, id, s = tableOf30()) {
  const sp = using(overlay, () => apply(s, { type: "spawn", monster: id, at: { q: -3, r: 0 } }, DM));
  assert.ok(sp.ok, sp.error);
  const m = sp.events[0].id;
  s.entities[m].hp = s.entities[m].hpMax = 1e9;
  for (let i = 0; i < 80 && current(s) !== m; i++) apply(s, { type: "endTurn", actor: current(s) }, DM);
  assert.equal(current(s), m);
  return { s, m };
}

test("#408 part 4: a monster: the heaviest Multiattack (14 attacks of 900 dice with a critical hit), played by the AI, completes with no refusal", () => {
  const dire = monster({ actions: [attackAction("a1", [D(45, 10)]), multi({ action: "a1", times: 7 }, { action: "a1", times: 7 })] });
  assert.deepEqual(strict("monsters", dire), []);
  assert.equal(dice("monsters", dire), 900);
  assert.equal(workOf("monsters", dire).attacks, 14);
  const overlay = loaded({ monsters: [dire] });
  // Seeds are tried until an attack of the turn is a critical hit: its 900 dice are the most one use can roll (the engine allows 1,200).
  let crit = 0;
  for (let seed = 1; seed <= 60 && !crit; seed++) {
    const { s, m } = monsterTurn(overlay, dire.id, tableOf30(seed));
    const all = [];
    using(overlay, () => { for (let i = 0; i < 60 && current(s) === m; i++) { const a = aiStep(s, m); if (!a) break; const r = WENT(apply(s, a, DM), `${a.type} ${a.action ?? ""}`); all.push(a.type); crit += r.events.filter((e) => e.type === "attack" && e.crit).length; } });
    assert.deepEqual(all, [...Array(15).fill("act"), "endTurn"], "the Multiattack, its 14 attacks, then the end of the turn");
  }
  assert.ok(crit > 0, "a critical hit came up");
});

test("#408 part 4: a monster's heaviest area action (860 dice on 30 creatures, 600 steps) completes", () => {
  const roar = { id: "roar", name: "Roar", text: "x", target: { area: { shape: "emanation", size: 1000 } }, effects: [{ save: "dex", dc: 50, half: true, onFail: [D(50, 10), { damage: "40d24+140", type: "fire", times: 9 }] }] };
  const dire = monster({ actions: [roar] });
  assert.deepEqual(strict("monsters", dire), []);
  assert.equal(dice("monsters", dire), 860);
  const overlay = loaded({ monsters: [dire] });
  const { s, m } = monsterTurn(overlay, dire.id);
  const r = using(overlay, () => apply(s, { type: "act", actor: m, action: "roar", hex: { q: -3, r: 0 } }, DM));
  WENT(r, "roar");
  assert.ok(r.events.filter((e) => e.type === "damage").length >= 25);
});

test("#408 part 4: an item: the heaviest potion (900 dice) is drunk, and the Bonus Action and the potion are spent", () => {
  const A = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 };
  const sheet = { name: "Brenna", class: "fighter", level: 5, subclass: "champion", abilities: A, skills: ["athletics", "perception"], choices: { "fighting-style": "defense" }, weapons: ["longbow"], items: [{ id: "i1", item: hb("potion") }] };
  for (const [name, effects] of [["heals", Array(18).fill({ heal: "50d24+140" })], ["damage", [D(50, 10), D(40, 10)]]]) {
    const p = potion(effects);
    assert.deepEqual(strict("items", p), [], name);
    assert.equal(dice("items", p), 900, name);
    const overlay = loaded({ items: [p] });
    const s = newGame(7);
    for (const id of Object.keys(s.entities)) if (!["m1", "rogue"].includes(id)) delete s.entities[id];
    s.settings.autoEngage = false;
    const r = using(overlay, () => {
      s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 }, owner: "pat", ownerName: "Pat" });
      s.entities.hero.sheet = structuredClone(sheet);
      s.entities.hero.hp = s.entities.hero.hpMax = 1e9;
      return apply(s, { type: "use", actor: "hero", item: "i1" }, { role: "player", userId: "pat" });
    });
    WENT(r, name);
    assert.ok(!(s.entities.hero.sheet.items ?? []).some((x) => x.id === "i1"), `${name}: the potion is gone`);
    assert.ok(r.events.some((e) => e.type === (name === "heals" ? "heal" : "damage")), name);
  }
});

// The wizard steps onto a trap one hex away (the creature that stood there is put elsewhere).
function stepOnto(s, overlay, def) {
  const at = { q: 1, r: 0 }, there = Object.values(s.entities).find((e) => e.pos.q === at.q && e.pos.r === at.r);
  if (there) assert.ok(apply(s, { type: "place", actor: there.id, to: { q: -7, r: 4 } }, DM).ok, "made room");
  s.map.objects.push({ id: "trap", def, level: s.map.levels[0].id, at, state: "armed" });
  return using(overlay, () => apply(s, { type: "move", actor: "wizard", to: at }, DM));
}

test("#408 part 4: an object: the heaviest trigger (860 dice on the 30 creatures within its area; and 900 rolled for each of them) fires and completes", () => {
  const traps = [
    thing([{ save: "dex", dc: 50, onFail: [D(50, 10), { damage: "40d24+140", type: "fire", times: 9 }] }]),
    thing([{ attack: "ranged", kind: "weapon", bonus: 40, onHit: [{ damage: "15d24+140", type: "fire" }] }], { id: hb("shooter") }),
  ];
  assert.deepEqual(traps.map((t) => strict("objects", t)), [[], []]);
  assert.deepEqual(traps.map((t) => dice("objects", t)), [860, 900]);
  for (const t of traps) {
    const overlay = loaded({ objects: [t] });
    const s = tableOf30();
    const r = stepOnto(s, overlay, t.id);
    WENT(r, t.id);
    assert.ok(r.events.some((e) => e.type === "triggered"), `${t.id} went off`);
    assert.ok(r.events.filter((e) => e.type === "damage").length >= 25, `${t.id} reached the table`);
  }
});

// One round of the table: every creature ends its turn, so every zone goes off at the end of one creature's and the start of the next one's.
function round(s, overlay) {
  const out = [];
  using(overlay, () => { for (let i = 0, n = Object.keys(s.entities).length + 1; i < n; i++) out.push(WENT(apply(s, { type: "endTurn", actor: current(s) }, DM), `end of turn ${i}`)); });
  return out;
}

test("#408 part 4: a zone ticking for a round: the heaviest accepted (450 dice a tick, two ticks in an end of turn) completes every turn of a table of 30", () => {
  const zone = mage("pyre", { level: 2, duration: "1 minute", target: area(100), zone: { on: ["turnStart", "turnEnd"] }, effects: [{ save: "dex", dc: 50, half: true, onFail: [D(45, 10)] }] });
  assert.deepEqual(strict("spells", zone), []);
  assert.equal(dice("spells", zone), 900);
  const overlay = loaded({ spells: [zone] });
  const s = tableOf30();
  wizardWith(s, zone.id);
  WENT(using(overlay, () => apply(s, { type: "cast", actor: "wizard", spell: zone.id, slot: 2, hex: { q: 2, r: 0 } }, DM)), "the cast");
  const ends = round(s, overlay);
  assert.ok(ends.length >= 30);
  const ticks = ends.flatMap((r) => r.events).filter((e) => e.type === "damage").length;
  assert.ok(ticks >= 30, `${ticks} damage events in a round: the zone went off on most of the table`);
});

test("#408 part 4: a zone that goes off on entering (30 dice a creature): the caster's emanation moving onto 30 creatures at once, and a round after, complete", () => {
  const zone = mage("aegis", { level: 2, duration: "1 minute", target: { area: { shape: "emanation", size: 60 } }, zone: { on: ["enter", "turnStart", "turnEnd"] }, effects: [{ save: "dex", dc: 50, half: true, onFail: [{ damage: "30d24+140", type: "fire" }] }] });
  assert.deepEqual(strict("spells", zone), []);
  assert.equal(dice("spells", zone), 900);
  const overlay = loaded({ spells: [zone] });
  const s = newGame(5);
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  apply(s, { type: "place", actor: "wizard", to: { q: -8, r: 0 } }, DM);
  // 26 goblin warriors outside the emanation (12 hexes) from where the wizard stands, and inside it from where it walks to: 30 creatures.
  const from = { q: -8, r: 0 }, to = { q: -3, r: 0 };
  for (let q = 0, n = 0; q < 14 && n < 26; q++) for (let r = -6; r <= 6 && n < 26; r++) {
    const at = { q, r };
    if (H.dist(at, from) > 12 && H.dist(at, to) <= 12 && apply(s, { type: "spawn", monster: "goblin-warrior", at }, DM).ok) n++;
  }
  assert.equal(Object.keys(s.entities).length, 30);
  for (const e of Object.values(s.entities)) e.hp = e.hpMax = 1e9;
  apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 16 }, DM);
  for (let i = 0; i < 40 && current(s) !== "wizard"; i++) apply(s, { type: "endTurn", actor: current(s) }, DM);
  wizardWith(s, zone.id);
  WENT(using(overlay, () => apply(s, { type: "cast", actor: "wizard", spell: zone.id, slot: 2 , hex: { q: -7, r: 0 } }, DM)), "the cast");
  const walk = using(overlay, () => apply(s, { type: "move", actor: "wizard", to }, DM));
  WENT(walk, "the move");
  const entered = walk.events.filter((e) => e.type === "damage").length;
  if (process.env.HB_PRINT) console.log("creatures the zone went off on as it moved:", entered);
  assert.equal(entered, 26, `the zone went off on ${entered} creatures in one move`);
  round(s, overlay);
});
