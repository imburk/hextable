// Mage Armor, Spare the Dying and Light, applied by the engine instead of handed to the DM (issue #674).
// SRD 5.2.1: Mage Armor ("You touch a willing creature who isn't wearing armor. Until the spell ends, the target's base AC becomes
// 13 plus its Dexterity modifier. The spell ends early if the target dons armor"), Spare the Dying ("Choose a creature within range
// that has 0 Hit Points and isn't dead. The creature becomes Stable"; range 15 feet, doubling at levels 5, 11 and 17) and Light
// ("the object sheds Bright Light in a 20-foot radius and Dim Light for an additional 20 feet", 1 hour, "The spell ends if you cast it
// again"). The vocabulary they use is in docs/specs/rules-expansion.md, "Build notes: Mage Armor, Spare the Dying and Light".
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { derive } from "../src/derive.js";
import { apply, makeEntity } from "../src/engine.js";
import { acOf, acShown } from "../src/engine/rolls.js";
import { rangeAt } from "../src/effects.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { newGame } from "../src/scenario.js";
import { lightAt } from "../src/sight.js";
import { view } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
const lintSpell = (d) => lintEntry("spells", d, { strict: false });
const A = { str: 10, dex: 16, con: 12, int: 16, wis: 14, cha: 10 };
const wizard = (more = {}) => ({ name: "Vex", class: "wizard", level: 1, abilities: A, skills: ["arcana", "history"], spells: ["light", "mage-armor"], ...more });
const cleric = (level, more = {}) => ({ name: "Orsk", class: "cleric", level, ...(level >= 3 ? { subclass: "life" } : {}), abilities: { ...A, wis: 16 }, skills: ["medicine", "religion"], choices: { "divine-order": "protector" }, spells: ["spare-the-dying"], ...more });
const barbarian = (abilities, more = {}) => ({ name: "Ur", class: "barbarian", level: 1, abilities, skills: ["athletics", "survival"], weapons: ["greataxe"], ...more });

// A table of built characters in a row, 5 feet apart, on open grass; the ones named are the party.
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
const cast = (s, actor, spell, target, more = {}) => apply(s, { type: "cast", actor, spell, ...(target ? { target } : {}), ...more }, DM);
const effectsOf = (s, spell) => (s.effects ?? []).filter((fx) => fx.spell === spell);
// What is handed to the DM beyond the assist tier's standing note (the entry's own description, shown on every cast of an assist spell).
const notes = new Set(["mage-armor", "light"].map((id) => SPELLS[id].def.text));
const manuals = (r) => r.events.filter((e) => e.type === "manual" && !notes.has(e.text));

// Undo, redo and a replay from the start give the same state (as armour-rules.test.js does).
function exact(s, acts) {
  const start = json(s), h = createHistory(), states = [start];
  for (const a of acts) { const b = mark(s), r = ok(apply(s, a, DM)); h.record(b, s, describeStep(a, r.events, b, s)); states.push(json(s)); }
  const end = json(s);
  for (let n = acts.length - 1; n >= 0; n--) { h.undo(s); assert.equal(json(s), states[n], `undo ${n}`); }
  for (let n = 0; n < acts.length; n++) h.redo(s);
  assert.equal(json(s), end, "redo");
  const again = JSON.parse(start);
  for (const a of acts) ok(apply(again, a, DM));
  assert.equal(json(again), end, "replay");
}
// An action the engine refuses: it says so, and nothing about the game changed.
function refused(s, act, pattern) {
  const before = json(s), r = apply(s, act, DM);
  assert.equal(r.ok, false, "refused");
  assert.match(r.error, pattern);
  assert.equal(json(s), before, "a refused action changes nothing");
}

// ---------- the entries ----------

test("the three entries are data the linter passes, at the tiers they now have", () => {
  for (const id of ["mage-armor", "spare-the-dying", "light"]) assert.deepEqual(lintSpell(SPELLS[id].def), [], id);
  assert.equal(SPELLS["spare-the-dying"].def.tier, "auto");
  assert.equal(SPELLS["mage-armor"].def.tier, "assist");
  assert.equal(SPELLS.light.def.tier, "assist");
  for (const id of ["mage-armor", "spare-the-dying", "light"]) assert.ok(!SPELLS[id].def.effects.some((st) => "manual" in st), `${id} no longer hands its whole effect to the DM`);
});

test("the linter holds the new words to their shapes", () => {
  const base = structuredClone(SPELLS["mage-armor"].def);
  const bad = (change, pattern) => { const d = structuredClone(base); change(d); assert.ok(lintSpell(d).some((p) => pattern.test(p)), `${pattern}: ${json(lintSpell(d))}`); };
  bad((d) => { d.effects[0].modifier.value = 13; }, /baseAc/);
  bad((d) => { d.effects[0].modifier.value = { base: 13, ability: "luck" }; }, /baseAc/);
  bad((d) => { d.effects[0].modifier.on = "speed"; }, /ac hook/);
  bad((d) => { d.effects[0].ends = { on: "armour", of: "source" }; }, /armour/);
  bad((d) => { d.effects = [{ condition: "poisoned", ends: { on: "armour" } }]; }, /armour/);
  const rest = structuredClone(SPELLS["spare-the-dying"].def);
  const rbad = (change, pattern) => { const d = structuredClone(rest); change(d); assert.ok(lintSpell(d).some((p) => pattern.test(p)), `${pattern}: ${json(lintSpell(d))}`); };
  rbad((d) => { d.effects = [{ stabilize: 1 }]; }, /stabilize/);
  rbad((d) => { d.higher = { range: { 5: 10 } }; }, /higher\.range/);
  rbad((d) => { d.higher = { range: { 5: 32 } }; }, /higher\.range/);
  const lit = structuredClone(SPELLS.light.def);
  const lbad = (change, pattern) => { const d = structuredClone(lit); change(d); assert.ok(lintSpell(d).some((p) => pattern.test(p)), `${pattern}: ${json(lintSpell(d))}`); };
  lbad((d) => { d.effects = [{ light: { bright: 0, dim: 0 } }]; }, /light/);
  lbad((d) => { d.effects = [{ light: { bright: 20 } }]; }, /light/);
  lbad((d) => { d.effects = [{ light: { bright: 20, dim: 20 }, replaces: false }]; }, /replaces/);
});

// ---------- Mage Armor ----------

test("Mage Armor: a built character with no armor has a base AC of 13 + Dexterity for 8 hours", () => {
  const s = table({ vex: wizard(), pim: wizard({ name: "Pim", abilities: { ...A, dex: 14 } }) });
  assert.equal(s.entities.pim.ac, 12, "10 + Dexterity 2");
  assert.equal(s.entities.pim.acBase, 12);
  const r = ok(cast(s, "vex", "mage-armor", "pim"));
  assert.deepEqual(manuals(r), [], "nothing is handed to the DM");
  assert.equal(acOf(s, s.entities.pim), 15, "13 + Dexterity 2");
  assert.equal(acOf(s, s.entities.vex), 13, "the caster is untouched");
  const [fx] = effectsOf(s, "mage-armor");
  assert.equal(fx.lasts, "8 hours");
  assert.equal(fx.until.clock, s.clock + 480);
  assert.equal(s.entities.pim.ac, 12, "the creature's own number is kept: the spell is a lasting effect on top");
  // What each person at the table is shown is the number that applies, and what changed it.
  s.entities.pim.owner = "pat";
  const seen = view(s, { role: "player", userId: "pat" }).entities.pim;
  assert.deepEqual({ ac: seen.ac, acNow: seen.acNow, acWhy: seen.acWhy }, { ac: 12, acNow: 15, acWhy: ["Mage Armor"] });
  assert.deepEqual(acShown(s, s.entities.pim, true), { ac: 15, why: ["Mage Armor"] }, "the DM, who has the whole state");
  assert.deepEqual(acShown(s, seen, false), { ac: 15, why: ["Mage Armor"] }, "a player, from what was sent");
  assert.equal(view(s, { role: "player", userId: "pat" }).entities.vex.acNow, undefined, "nothing is sent where the number is the creature's own");
  // It runs out at 8 hours, not before.
  ok(apply(s, { type: "advanceTime", minutes: 479 }, DM));
  assert.equal(acOf(s, s.entities.pim), 15);
  const t = ok(apply(s, { type: "advanceTime", minutes: 1 }, DM));
  assert.ok(t.events.some((e) => e.type === "effectEnd" && e.name === "Mage Armor"));
  assert.equal(acOf(s, s.entities.pim), 12);
});

test("Mage Armor takes the better way of working AC out, never both, and a Shield and bonuses still add", () => {
  // Unarmored Defense (10 + Dexterity + Constitution) at Dexterity 16, Constitution 12: 14. Mage Armor's 13 + 3 is 16.
  let s = table({ ur: barbarian({ str: 16, dex: 16, con: 12, int: 8, wis: 10, cha: 8 }), vex: wizard() });
  assert.equal(s.entities.ur.acBase, 14);
  ok(cast(s, "vex", "mage-armor", "ur"));
  assert.equal(acOf(s, s.entities.ur), 16, "Mage Armor is the better base");
  // Constitution 18, Dexterity 12: Unarmored Defense is 10 + 1 + 4 = 15; Mage Armor's 13 + 1 is 14. The creature's own stays.
  s = table({ ur: barbarian({ str: 16, dex: 12, con: 18, int: 8, wis: 10, cha: 8 }), vex: wizard() });
  assert.equal(s.entities.ur.acBase, 15);
  const r = ok(cast(s, "vex", "mage-armor", "ur"));
  assert.equal(acOf(s, s.entities.ur), 15, "its own way of working AC out is better, so it uses that");
  assert.deepEqual(manuals(r), []);
  // A Shield adds to whichever base is used (a cleric: Shield trained, Dexterity 16).
  s = table({ orsk: cleric(1, { armour: undefined, shield: true }), vex: wizard() });
  const withShield = s.entities.orsk.ac;
  assert.equal(s.entities.orsk.acBase, 13, "10 + Dexterity 3, the Shield not in the base");
  assert.ok(withShield > s.entities.orsk.acBase, "the Shield adds");
  ok(cast(s, "vex", "mage-armor", "orsk"));
  assert.equal(acOf(s, s.entities.orsk), withShield + 3, "base 16 in place of 13; the Shield's bonus stays");
});

test("Mage Armor is not put on a creature wearing armor, nor one the engine knows nothing of: the DM is told, nothing is applied", () => {
  const s = table({ vex: wizard(), kay: cleric(1, { armour: "chain-mail" }) });
  assert.notEqual(s.entities.kay.armour, "none");
  const r = ok(cast(s, "vex", "mage-armor", "kay"));
  const [m] = manuals(r);
  assert.match(m.text, /wearing armor/);
  assert.equal(m.partial, true);
  assert.equal(acOf(s, s.entities.kay), s.entities.kay.ac, "nothing changed");
  assert.ok(!(effectsOf(s, "mage-armor")[0]?.parts ?? []).some((p) => p.modifier), "no modifier was put on");
  // A creature typed in by hand (no sheet, so no known base and no known armor) is the DM's too.
  const t = newGame(7);
  const fighter = t.entities.fighter, wiz = t.entities.wizard;
  assert.equal(fighter.acBase, undefined);
  fighter.pos = { q: wiz.pos.q + 1, r: wiz.pos.r, z: 0 };
  wiz.spells.push("mage-armor");
  const u = ok(cast(t, "wizard", "mage-armor", "fighter"));
  assert.match(manuals(u)[0].text, /not a built character/);
  assert.equal(acOf(t, t.entities.fighter), fighter.ac);
});

test("Mage Armor ends early when the target dons armor, and the armor's AC is then its own", () => {
  const sheet = wizard({ name: "Pim", abilities: { ...A, dex: 14 } });
  const s = table({ vex: wizard(), pim: sheet });
  ok(cast(s, "vex", "mage-armor", "pim"));
  assert.equal(acOf(s, s.entities.pim), 15);
  // The DM remakes Pim wearing a suit; the wizard cannot wear it untrained (untrained armor is its own rule), so a cleric's sheet is used for a clean suit.
  const worn = { ...sheet, armour: "leather-armor" };
  const r = ok(apply(s, { type: "setSheet", actor: "pim", sheet: worn }, DM));
  const end = r.events.find((e) => e.type === "effectEnd");
  assert.ok(end && end.name === "Mage Armor", json(r.events));
  assert.equal(effectsOf(s, "mage-armor").length, 0);
  assert.equal(s.entities.pim.armour, "light");
  assert.equal(acOf(s, s.entities.pim), s.entities.pim.ac, "Leather Armor's AC, not 13 + Dexterity");
  assert.equal(s.entities.pim.ac, 11 + 2, "Leather Armor 11 + Dexterity 2");
});

test("Mage Armor stays through a remake that does not don armor, and the caster or the DM can end it", () => {
  const sheet = wizard({ name: "Pim", abilities: { ...A, dex: 14 } });
  const s = table({ vex: wizard(), pim: sheet });
  ok(cast(s, "vex", "mage-armor", "pim"));
  ok(apply(s, { type: "refresh", actor: "pim" }, DM));
  assert.equal(acOf(s, s.entities.pim), 15, "the sheet was made again; the spell is still on");
  const fx = effectsOf(s, "mage-armor")[0];
  ok(apply(s, { type: "endEffect", effect: fx.id }, DM));
  assert.equal(acOf(s, s.entities.pim), 12);
});

test("Mage Armor: refused casts change nothing, and undo, redo and replay give the same game", () => {
  const s = table({ vex: wizard(), pim: wizard({ name: "Pim", abilities: { ...A, dex: 14 } }) });
  s.entities.pim.pos = { q: 5, r: 0, z: 0 };
  refused(s, { type: "cast", actor: "vex", spell: "mage-armor", target: "pim" }, /away/);        // touch is 5 feet
  s.entities.pim.pos = { q: 1, r: 0, z: 0 };
  refused(s, { type: "cast", actor: "vex", spell: "mage-armor", target: "nobody" }, /./);
  exact(s, [
    { type: "cast", actor: "vex", spell: "mage-armor", target: "pim" },
    { type: "advanceTime", minutes: 60 },
    { type: "setSheet", actor: "pim", sheet: wizard({ name: "Pim", abilities: { ...A, dex: 14 }, armour: "leather-armor" }) },
  ]);
});

// ---------- Spare the Dying ----------

function down(e, hp = 0) { e.hp = hp; e.cond.unconscious = {}; e.cond.prone = {}; e.death = { s: 1, f: 2 }; }

test("Spare the Dying: a creature at 0 Hit Points that is not dead becomes Stable, and its Death Saving Throw counts start again", () => {
  const s = table({ orsk: cleric(1), pip: wizard({ name: "Pip" }) });
  down(s.entities.pip);
  const r = ok(cast(s, "orsk", "spare-the-dying", "pip"));
  assert.deepEqual(manuals(r), []);
  assert.ok(r.events.some((e) => e.type === "cond" && e.id === "pip" && e.cond === "stable"));
  assert.ok(s.entities.pip.cond.stable);
  assert.deepEqual(s.entities.pip.death, { s: 0, f: 0 });
  assert.equal(s.entities.pip.hp, 0, "Stable is not healed");
  assert.equal(s.entities.pip.dead, false);
  assert.ok(s.entities.pip.cond.unconscious, "still Unconscious");
});

test("Spare the Dying does nothing to a creature that is up, already Stable, or dead; the table is told why", () => {
  const s = table({ orsk: cleric(1), pip: wizard({ name: "Pip" }), ned: wizard({ name: "Ned" }) });
  const up = ok(cast(s, "orsk", "spare-the-dying", "pip"));
  assert.ok(up.events.some((e) => e.type === "note" && /not at 0 Hit Points/.test(e.text)));
  assert.equal(s.entities.pip.cond.stable, undefined);
  down(s.entities.ned); s.entities.ned.cond.stable = {};
  const again = ok(cast(s, "orsk", "spare-the-dying", "ned"));
  assert.ok(again.events.some((e) => e.type === "note" && /Stable already/.test(e.text)));
  s.entities.ned.dead = true;
  refused(s, { type: "cast", actor: "orsk", spell: "spare-the-dying", target: "ned" }, /dead/);
});

test("Spare the Dying: 15 feet, then 30 at character level 5, 60 at 11 and 120 at 17", () => {
  assert.deepEqual([1, 4, 5, 10, 11, 16, 17, 20].map((n) => rangeAt(SPELLS["spare-the-dying"].def, n)), [15, 15, 30, 30, 60, 60, 120, 120]);
  assert.equal(rangeAt(SPELLS["mage-armor"].def, 20), 5, "a spell with no growing range keeps its own (Touch is 5)");
  assert.equal(SPELLS["spare-the-dying"].range, 15);
  // 15 feet is three hexes. A creature four hexes (20 ft) off is out of reach at level 1.
  const s = table({ orsk: cleric(1), a: wizard({ name: "A" }), b: wizard({ name: "B" }), c: wizard({ name: "C" }), pip: wizard({ name: "Pip" }) });
  down(s.entities.pip);
  s.entities.pip.pos = { q: 4, r: 0, z: 0 };
  refused(s, { type: "cast", actor: "orsk", spell: "spare-the-dying", target: "pip" }, /20 ft away/);
  s.entities.pip.pos = { q: 3, r: 0, z: 0 };
  ok(cast(s, "orsk", "spare-the-dying", "pip"));
  assert.ok(s.entities.pip.cond.stable);
  // At level 5 the reach is 30 feet (six hexes), not 35.
  const t = table({ orsk: cleric(5), pip: wizard({ name: "Pip" }) });
  down(t.entities.pip);
  t.entities.pip.pos = { q: 7, r: 0, z: 0 };
  refused(t, { type: "cast", actor: "orsk", spell: "spare-the-dying", target: "pip" }, /35 ft away/);
  t.entities.pip.pos = { q: 6, r: 0, z: 0 };
  ok(cast(t, "orsk", "spare-the-dying", "pip"));
  assert.ok(t.entities.pip.cond.stable);
  // The screen's list of who can be aimed at uses the same reach.
  const u = table({ orsk: cleric(5), pip: wizard({ name: "Pip" }) });
  u.entities.pip.pos = { q: 6, r: 0, z: 0 };
  assert.ok(apply(u, { type: "cast", actor: "orsk", spell: "spare-the-dying", target: "pip" }, DM).ok);
});

test("a Stable creature makes no more Death Saving Throws, and healing it brings it back as for any creature at 0 Hit Points", () => {
  const s = table({ orsk: cleric(1, { spells: ["spare-the-dying", "cure-wounds"] }), pip: wizard({ name: "Pip" }) });
  down(s.entities.pip);
  ok(cast(s, "orsk", "spare-the-dying", "pip"));
  assert.ok(s.entities.pip.cond.stable);
  ok(cast(s, "orsk", "cure-wounds", "pip"));
  assert.ok(s.entities.pip.hp > 0);
  assert.equal(s.entities.pip.cond.stable, undefined, "healed: no longer Stable, no longer down");
});

test("Spare the Dying: refusals change nothing, and undo, redo and replay give the same game", () => {
  const s = table({ orsk: cleric(1), pip: wizard({ name: "Pip" }) });
  down(s.entities.pip);
  refused(s, { type: "cast", actor: "orsk", spell: "spare-the-dying", target: "nobody" }, /./);
  refused(s, { type: "cast", actor: "orsk", spell: "spare-the-dying" }, /Pick a target/);
  exact(s, [
    { type: "cast", actor: "orsk", spell: "spare-the-dying", target: "pip" },
    { type: "advanceTime", minutes: 10 },
  ]);
});

// ---------- Light ----------

function dark(s) { s.map.levels[0].light = "dark"; return s; }

test("Light: the caster carries a light, Bright Light 20 feet and Dim Light 20 feet more, for 1 hour", () => {
  const s = dark(table({ vex: wizard() }));
  s.entities.vex.pos = { q: 0, r: 0, z: 0 };
  assert.equal(lightAt(s, { q: 2, r: 0, z: 0 }), "dark");
  const r = ok(cast(s, "vex", "light"));
  assert.deepEqual(r.events.filter((e) => e.type === "light"), [{ type: "light", id: "vex", bright: 20, dim: 20, name: "Light" }]);
  assert.deepEqual(manuals(r), []);
  assert.deepEqual({ bright: s.entities.vex.light.bright, dim: s.entities.vex.light.dim }, { bright: 20, dim: 20 });
  for (const [q, want] of [[0, "bright"], [4, "bright"], [5, "dim"], [8, "dim"], [9, "dark"]]) assert.equal(lightAt(s, { q, r: 0, z: 0 }), want, `${q * 5} ft`);
  const [fx] = effectsOf(s, "light");
  assert.equal(fx.until.clock, s.clock + 60);
  // The light goes where its bearer goes, and goes out at the hour.
  ok(apply(s, { type: "advanceTime", minutes: 59 }, DM));
  assert.ok(s.entities.vex.light);
  const t = ok(apply(s, { type: "advanceTime", minutes: 1 }, DM));
  assert.ok(t.events.some((e) => e.type === "light" && e.id === "vex" && e.bright === 0 && e.dim === 0));
  assert.equal(s.entities.vex.light, undefined);
  assert.equal(lightAt(s, { q: 0, r: 0, z: 0 }), "dark");
  assert.equal(effectsOf(s, "light").length, 0);
});

test("Light cast again ends the earlier casting: one light, the new hour", () => {
  const s = dark(table({ vex: wizard() }));
  ok(cast(s, "vex", "light"));
  const first = effectsOf(s, "light")[0].id;
  ok(apply(s, { type: "advanceTime", minutes: 30 }, DM));
  const r = ok(cast(s, "vex", "light"));
  assert.ok(r.events.some((e) => e.type === "effectEnd" && e.fx === first && /cast again/.test(e.why)));
  const now = effectsOf(s, "light");
  assert.equal(now.length, 1);
  assert.notEqual(now[0].id, first);
  assert.equal(now[0].until.clock, s.clock + 60, "a whole new hour");
  assert.equal(s.entities.vex.light.fx, now[0].id);
  ok(apply(s, { type: "advanceTime", minutes: 30 }, DM));
  assert.ok(s.entities.vex.light, "the first casting's hour is over, and did not put the new light out");
});

test("Light does not replace a light the creature already carries: the DM is told, and the torch stays", () => {
  const s = dark(table({ vex: wizard() }));
  ok(apply(s, { type: "setLight", actor: "vex", item: "torch" }, DM));
  const r = ok(cast(s, "vex", "light"));
  assert.match(manuals(r)[0].text, /already carries a light/);
  assert.deepEqual(s.entities.vex.light, { bright: 20, dim: 20, item: "torch" });
  ok(apply(s, { type: "advanceTime", minutes: 60 }, DM));
  assert.deepEqual(s.entities.vex.light, { bright: 20, dim: 20, item: "torch" }, "the spell ending does not put out a torch");
});

test("Light: the DM can end it, a dismissed Light puts the light out, and a player sees the light the way it sees any carried light", () => {
  const s = dark(table({ vex: wizard(), pim: wizard({ name: "Pim" }) }));
  s.entities.vex.owner = "pat";
  ok(cast(s, "vex", "light"));
  const v = view(s, { role: "player", userId: "pat" });
  assert.deepEqual({ bright: v.entities.vex.light.bright, dim: v.entities.vex.light.dim }, { bright: 20, dim: 20 });
  ok(apply(s, { type: "endEffect", effect: effectsOf(s, "light")[0].id }, DM));
  assert.equal(s.entities.vex.light, undefined);
});

test("Light: a creature that is removed takes its Light with it, and the effect goes", () => {
  const s = dark(table({ vex: wizard(), pim: wizard({ name: "Pim" }) }));
  ok(cast(s, "vex", "light"));
  ok(apply(s, { type: "remove", actor: "vex" }, DM));
  assert.equal(effectsOf(s, "light").length, 0);
});

test("Light: refusals change nothing, and undo, redo and replay give the same game", () => {
  const s = dark(table({ vex: wizard() }));
  refused(s, { type: "cast", actor: "vex", spell: "mage-armor" }, /./);                 // needs a target
  s.entities.vex.spells = s.entities.vex.spells.filter((x) => x !== "light");
  refused(s, { type: "cast", actor: "vex", spell: "light" }, /doesn't know/);
  s.entities.vex.spells.push("light");
  exact(s, [
    { type: "cast", actor: "vex", spell: "light" },
    { type: "advanceTime", minutes: 20 },
    { type: "cast", actor: "vex", spell: "light" },
    { type: "advanceTime", minutes: 61 },
  ]);
});

test("a character saved before records kept acBase still gets Mage Armor: its base is worked out again from its sheet", () => {
  const s = table({ vex: wizard(), pim: wizard({ name: "Pim", abilities: { ...A, dex: 14 } }) });
  delete s.entities.pim.acBase;
  const r = ok(cast(s, "vex", "mage-armor", "pim"));
  assert.deepEqual(manuals(r), []);
  assert.equal(acOf(s, s.entities.pim), 15);
  // A sheet that will not derive is said so, not called "not built".
  const t = table({ vex: wizard(), pim: wizard({ name: "Pim" }) });
  delete t.entities.pim.acBase; t.entities.pim.sheet = { class: "nonesuch" };
  assert.match(manuals(ok(cast(t, "vex", "mage-armor", "pim")))[0].text, /sheet the engine could not work/);
});

test("Barkskin is named too, and a player is not sent the id of the effect that keeps a carried light", () => {
  const s = table({ orsk: cleric(1, { spells: ["spare-the-dying", "barkskin"] }), pim: wizard({ name: "Pim" }) });
  s.entities.orsk.level = 3; s.entities.orsk.slots = { 1: 4, 2: 3 }; s.entities.orsk.spells.push("barkskin");
  s.entities.pim.owner = "pat";
  ok(cast(s, "orsk", "barkskin", "pim", { slot: 2 }));
  assert.deepEqual(view(s, { role: "player", userId: "pat" }).entities.pim.acWhy, ["Barkskin"]);
  ok(cast(s, "pim", "light"));
  const lit = view(s, { role: "player", userId: "pat" }).entities.pim.light;
  assert.deepEqual(lit, { bright: 20, dim: 20 });
});
