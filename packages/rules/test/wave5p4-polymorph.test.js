// Wave 5, part 4, of issue #786 (#835): Polymorph (assist: a whole form, `polymorph` step, `choice: { of: 'beast' }`).
// Built to docs/specs/rules-expansion.md, "Build notes: wave 5 part 4". Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, SPELLS } from "../src/content/index.js";
import { BEASTS, CHOICES, lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { aiStep } from "../src/ai.js";
import { apply } from "../src/engine.js";
import { slotsFor } from "../src/engine/rolls.js";
import { FORM_FIELDS, WHOLE_FIELDS, takeForm, leaveForm, validForm } from "../src/forms.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const lint = (def) => lintEntry("spells", def, { strict: false });

function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (let q = -16; q <= 40; q++) for (let r = -6; r <= 6; r++) s.map.levels[0].tiles[`${q},${r}`] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", 0, 0], ["fighter", -2, 0], ["rogue", -4, 2], ["cleric", -3, 0]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  const slots = { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 2 };
  for (const id of ["wizard", "cleric"]) Object.assign(s.entities[id], { slots: { ...slots }, slotsMax: { ...slots } });
  s.entities.wizard.spells.push("polymorph");
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 40;
  return s;
}
const spawn = (s, id, q, r, extra = {}) => { ok(apply(s, { type: "spawn", monster: id, at: { q, r }, ...extra }, DM)); return Object.values(s.entities).at(-1); };
const cast = (s, target, choice, who = "wizard", ctx = DM) => apply(s, { type: "cast", actor: who, spell: "polymorph", target, choice, slot: 4 }, ctx);
const fxOf = (s) => s.effects.find((x) => x.name === "Polymorph");

test("Polymorph: assist; lints; reads with no problem; the choice is a Beast, the step needs the choice", () => {
  const d = SPELLS.polymorph.def;
  assert.equal(d.tier, "assist");
  assert.deepEqual(lint(d), []);
  assert.deepEqual(readEntry("spell", d, {}).problems ?? [], []);
  assert.ok(lint({ ...d, choice: undefined }).length, "a `chosen` Beast with no choice");
  assert.ok(lint({ ...d, choice: { of: "skill" } }).length, "the choice is of a Beast");
  assert.ok(lint({ ...d, duration: "instant", concentration: false }).length, "the form goes when the spell ends: it must last");
  assert.ok(lint({ ...d, effects: [{ polymorph: "wolf" }] }).length, "`polymorph` is `chosen`");
});

test("Polymorph: the list of Beasts is every Beast of the SRD pack, and nothing else", () => {
  const beasts = Object.values(CONTENT.monsters).filter((m) => m.type === "beast").map((m) => m.id).sort();
  assert.deepEqual([...BEASTS].sort(), beasts);
  assert.equal(CHOICES.beast, BEASTS);
});

test("takeForm: Wild Shape's layer is as it was (no `whole`: nothing of the whole form is kept), a whole form puts everything back", () => {
  const s = field();
  const f = s.entities.fighter, before = structuredClone(f);
  const tpl = { size: "large", ac: 11, speed: 40, speeds: {}, abil: { str: 19, dex: 10, con: 16, int: 3, wis: 13, cha: 7 }, hp: 34, prof: 2, saveBonus: { wis: 3 }, skillBonus: { perception: 3 } };
  takeForm(f, "brown-bear", "Brown Bear", tpl, [], "fx1");
  assert.deepEqual(Object.keys(f.form.kept).filter((k) => !FORM_FIELDS.includes(k)), []);
  assert.equal(f.form.whole, undefined);
  assert.equal(f.abil.int, before.abil.int, "Wild Shape keeps Intelligence");
  assert.deepEqual(f.skills, before.skills);
  leaveForm(f);
  assert.deepEqual(f, before);
  takeForm(f, "brown-bear", "Brown Bear", tpl, [], "fx1", { whole: true });
  assert.equal(f.form.whole, true);
  assert.equal(f.abil.int, 3);
  assert.deepEqual(f.skills, []);
  assert.deepEqual(f.saveBonus, { str: 4, dex: 0, con: 3, int: -4, wis: 3, cha: -2 }, "a save is the stat block's: the modifier, or what it lists");
  assert.ok(validForm(f.form));
  assert.ok(Object.keys(f.form.kept).every((k) => FORM_FIELDS.includes(k) || WHOLE_FIELDS.includes(k)));
  leaveForm(f);
  assert.deepEqual(f, before);
  assert.ok(!validForm({ ...structuredClone({ block: "x", fx: "y", kept: { skills: [] }, absent: [] }) }), "a Wild Shape form that holds the whole fields is not whole enough");
});

test("Polymorph on a creature on the caster's side: no save, the Beast's whole stat block, its Hit Points kept, the Beast's Hit Points as Temporary Hit Points", () => {
  const s = field();
  const f = s.entities.fighter, own = structuredClone(f);
  const r = ok(cast(s, "fighter", "brown-bear"));
  assert.ok(!r.events.some((e) => e.type === "save"), "willing: it fails without a roll");
  const bear = CONTENT.monsters["brown-bear"];
  assert.equal(f.form.whole, true);
  assert.equal(f.form.block, "brown-bear");
  assert.equal(f.size, "large");
  assert.equal(f.ac, bear.ac);
  assert.deepEqual(f.abil, bear.abilities, "Intelligence, Wisdom and Charisma too");
  assert.deepEqual(f.skills, [], "its own skill proficiencies give nothing");
  assert.deepEqual(f.saveProf, []);
  assert.equal(f.saveBonus.str, Math.floor((bear.abilities.str - 10) / 2), "a Strength save is the Beast's, not the fighter's proficient one");
  assert.equal(f.hp, own.hp, "Hit Points kept");
  assert.equal(f.maxHp, own.maxHp);
  assert.equal(f.hd, own.hd, "Hit Point Dice kept");
  assert.equal(f.tempHp, bear.hp);
  assert.equal(f.tempFx, fxOf(s).id);
  assert.deepEqual(f.actions.map((a) => a.id), ["multiattack", "bite", "claw"]);
  assert.deepEqual(f.attacks, [], "its weapons give nothing");
  assert.equal(f.alignment, own.alignment);
  assert.equal(f.name, own.name);
  assert.ok(fxOf(s).conc && fxOf(s).lasts === "1 hour");
  assert.ok(r.events.some((e) => e.type === "form" && e.form === "brown-bear"));
  assert.ok(r.events.some((e) => e.type === "size" && e.size === "large"));
});

test("Polymorph: replaces temporary Hit Points it had; a form it was already in (Wild Shape, another Polymorph) is put back first", () => {
  const s = field();
  const f = s.entities.fighter;
  f.tempHp = 100;
  ok(cast(s, "fighter", "wolf"));
  assert.equal(f.tempHp, CONTENT.monsters.wolf.hp, "the Beast's Hit Points are the Temporary Hit Points, in place of any it had");
  const first = fxOf(s);
  s.entities.wizard.conc = undefined;
  ok(apply(s, { type: "cast", actor: "wizard", spell: "polymorph", target: "fighter", choice: "black-bear", slot: 4 }, DM));
  assert.equal(f.form.block, "black-bear");
  assert.ok(!s.effects.includes(first), "the first Polymorph ended (the caster's Concentration moved on to the new one)");
  assert.equal(s.effects.filter((x) => x.name === "Polymorph").length, 1);
  assert.equal(f.tempHp, CONTENT.monsters["black-bear"].hp);
  assert.equal(f.form.kept.size, "medium", "what it goes back to is its own, not the first Beast's");
});

test("Polymorph: the Beast's Challenge Rating may not be above the target's (a character's level); refused before anything is spent", () => {
  const s = field();
  const f = s.entities.fighter, slots = s.entities.wizard.slots[4];
  const r = cast(s, "fighter", "giant-ape");
  assert.ok(!r.ok);
  assert.match(r.error, /Giant Ape has Challenge Rating 7/);
  assert.match(r.error, /its level/);
  assert.equal(s.entities.wizard.slots[4], slots, "no slot spent");
  assert.ok(!f.form && !fxOf(s));
  f.level = 7;
  ok(cast(s, "fighter", "giant-ape"));
  assert.equal(f.form.block, "giant-ape");
});

test("Polymorph: a creature with a stat block counts at its Challenge Rating; a creature that is not a Beast's id is refused", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 6, 0);
  assert.equal(CONTENT.monsters[g.tpl].cr, 0.25);
  const r = cast(s, g.id, "brown-bear");
  assert.match(r.error, /Brown Bear has Challenge Rating 1, and .*'s is 1\/4/);
  for (const choice of ["goblin-warrior", "nothing", undefined, 7]) assert.ok(!cast(s, "fighter", choice).ok, String(choice));
});

test("Polymorph on a foe: it rolls its Wisdom save; on a failure it is the Beast, on a success nothing changes and the spell goes on", () => {
  const seen = new Set();
  for (let seed = 1; seed <= 60 && seen.size < 2; seed++) {
    const s = field(seed);
    const g = spawn(s, "goblin-warrior", 6, 0);
    g.abil.wis = 10;
    const r = ok(cast(s, g.id, "wolf"));
    const save = r.events.find((e) => e.type === "save");
    assert.ok(save, "an enemy saves");
    if (g.form) { seen.add("fail"); assert.equal(g.form.block, "wolf"); assert.equal(g.tempHp, CONTENT.monsters.wolf.hp); assert.ok(g.hp === g.maxHp); }
    else { seen.add("pass"); assert.ok(!g.tempHp && fxOf(s), "no form: the spell stands"); }
  }
  assert.deepEqual([...seen].sort(), ["fail", "pass"]);
});

test("Polymorph on a foe: a player's cast is not refused for a Beast too strong for a creature that is not theirs (the rating is not told); nothing changes and the DM alone is told", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 6, 0);
  Object.assign(s.entities.wizard, { owner: "u1", ownerName: "Pat" });
  let told = null;
  for (let i = 0; i < 6 && !told; i++) {
    s.entities.wizard.slots[4] = 3;
    const r = apply(s, { type: "cast", actor: "wizard", spell: "polymorph", target: g.id, choice: "brown-bear", slot: 4 }, { role: "player", userId: "u1" });
    assert.ok(r.ok, r.error);
    assert.ok(!g.form, "too strong: nothing changes");
    told = r.events.find((e) => e.type === "manual" && e.partial && /Challenge Rating 1/.test(e.text) && /did nothing/.test(e.text));
    if (s.effects.length) ok(apply(s, { type: "endEffect", actor: "wizard", effect: fxOf(s).id }, DM));
  }
  // (the save may succeed first: then the step never runs; a creature that fails shows the DM's note)
  const t = field(9);
  const g2 = spawn(t, "goblin-warrior", 6, 0);
  g2.abil.wis = 1;
  g2.saveBonus = { wis: -50 };
  Object.assign(t.entities.wizard, { owner: "u1", ownerName: "Pat" });
  const r = apply(t, { type: "cast", actor: "wizard", spell: "polymorph", target: g2.id, choice: "brown-bear", slot: 4 }, { role: "player", userId: "u1" });
  assert.ok(r.ok, r.error);
  assert.ok(!g2.form && !g2.tempHp);
  assert.ok(r.events.some((e) => e.type === "manual" && e.partial && /did nothing/.test(e.text)), "the DM is told");
  const mine = apply(t, { type: "cast", actor: "wizard", spell: "polymorph", target: "fighter", choice: "giant-ape", slot: 4 }, { role: "player", userId: "u1" });
  assert.ok(!mine.ok && /Challenge Rating 7/.test(mine.error), "a creature of the party: the rating is known, the cast is refused");
});

test("Polymorph: the target's Hit Points are kept; Temporary Hit Points soak damage first, and the form ends when the last go, the rest carrying on to its real Hit Points", () => {
  const s = field();
  const f = s.entities.fighter;
  ok(cast(s, "fighter", "brown-bear"));
  const temp = f.tempHp;
  ok(apply(s, { type: "harm", actor: "fighter", amount: 10 }, DM));
  assert.equal(f.tempHp, temp - 10);
  assert.equal(f.hp, 40);
  assert.ok(f.form, "temporary Hit Points left: still a bear");
  const r = ok(apply(s, { type: "harm", actor: "fighter", amount: temp - 10 + 5 }, DM));
  assert.equal(f.hp, 35, "5 carried on to its real Hit Points");
  assert.ok(!f.form && !f.tempHp && !f.tempFx);
  assert.ok(!fxOf(s), "the spell ended on it");
  assert.ok(r.events.some((e) => e.type === "effectEnd" && e.name === "Polymorph"));
  assert.ok(r.events.some((e) => e.type === "form" && e.form === null));
  assert.equal(f.size, "medium");
  assert.deepEqual(f.skills, ["athletics", "intimidation", "perception", "survival"]);
  assert.ok(f.saveProf.includes("str"));
  assert.ok(!f.actions);
});

test("Polymorph: damage that takes exactly the last of them ends the form with no damage left over", () => {
  const s = field();
  const f = s.entities.fighter;
  ok(cast(s, "fighter", "wolf"));
  ok(apply(s, { type: "harm", actor: "fighter", amount: f.tempHp }, DM));
  assert.equal(f.hp, 40);
  assert.ok(!f.form);
});

test("Polymorph: the Temporary Hit Points vanish when the spell ends, whatever ends it; the creature has the Hit Points it had", () => {
  const s = field();
  const f = s.entities.fighter;
  ok(cast(s, "fighter", "wolf"));
  ok(apply(s, { type: "harm", actor: "fighter", amount: 4 }, DM));
  ok(apply(s, { type: "endEffect", actor: "wizard", effect: fxOf(s).id }, DM));
  assert.ok(!f.form && !f.tempHp);
  assert.equal(f.hp, 40);
  // Concentration lost
  ok(cast(s, "fighter", "wolf"));
  assert.ok(f.form);
  ok(apply(s, { type: "harm", actor: "wizard", amount: 39 }, DM));
  s.entities.wizard.hp = 0;
  ok(apply(s, { type: "advanceTime", minutes: 61 }, DM));
  assert.ok(!f.form, "an hour later it is over");
  assert.ok(!f.tempHp);
});

test("Polymorph: the target can't speak or cast spells; a Verbal component is speaking; no reaction spell either", () => {
  const s = field();
  const c = s.entities.cleric;
  c.spells.push("bless", "shield");
  ok(cast(s, "cleric", "wolf"));
  let r = apply(s, { type: "cast", actor: "cleric", spell: "bless", target: "fighter", slot: 1 }, DM);
  assert.ok(!r.ok);
  assert.match(r.error, /can't speak or cast spells in the form of a Wolf/);
  assert.match(r.error, /Verbal component/);
  assert.deepEqual(slotsFor(s, c, SPELLS.shield), [], "no reaction spell");
  assert.equal(c.slots[1], 4, "nothing spent");
});

test("Polymorph: Concentration on a spell the target already holds goes on (it can't cast, but Concentration is not casting)", () => {
  const s = field();
  const c = s.entities.cleric;
  c.spells.push("bless");
  ok(apply(s, { type: "cast", actor: "cleric", spell: "bless", target: "fighter", slot: 1 }, DM));
  const bless = s.effects.find((x) => x.name === "Bless");
  assert.ok(bless?.conc);
  ok(cast(s, "cleric", "wolf"));
  assert.ok(s.effects.includes(bless), "Bless goes on");
  assert.ok(c.form);
  // ... and the Constitution save it makes for damage is the Beast's
  assert.equal(c.saveBonus.con, Math.floor((CONTENT.monsters.wolf.abilities.con - 10) / 2));
});

test("Polymorph: Large Beast where it does not fit: it takes the largest size that does; a note tells the table, and nothing is said of a creature the party does not know of", () => {
  const s = field();
  // Fighter at (0,3): ring it with known creatures on every side so that nothing larger than Medium fits.
  ok(apply(s, { type: "place", actor: "fighter", to: { q: 10, r: 0 } }, DM));
  const ring = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  for (const [dq, dr] of ring) spawn(s, "goblin-warrior", 10 + dq, dr);
  const r = ok(cast(s, "fighter", "brown-bear"));
  assert.equal(s.entities.fighter.size, "medium");
  assert.equal(s.entities.fighter.form.block, "brown-bear");
  assert.ok(r.events.some((e) => e.type === "note" && /no room for .* as a Brown Bear \(large\).*largest size that fits \(medium\)/.test(e.text)));
  assert.ok(!r.events.some((e) => e.type === "size"), "its size did not change");
  ok(apply(s, { type: "endEffect", actor: "wizard", effect: fxOf(s).id }, DM));
  assert.equal(s.entities.fighter.size, "medium");
});

test("Polymorph: a creature the DM hid in the new space is not counted (full size, the DM told) and nothing public says it is there", () => {
  const s = field();
  ok(apply(s, { type: "place", actor: "fighter", to: { q: 10, r: 0 } }, DM));
  const ring = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  for (const [dq, dr] of ring) spawn(s, "goblin-warrior", 10 + dq, dr, { hidden: true, name: `Lurker${dq}${dr}` });
  const r = ok(cast(s, "fighter", "brown-bear"));
  assert.equal(s.entities.fighter.size, "large", "the hidden ones are not counted");
  assert.ok(!r.events.some((e) => e.type === "note" && /no room/.test(e.text)));
  const told = r.events.filter((e) => e.type === "manual" && e.partial && /Lurker/.test(e.text));
  assert.equal(told.length, 1, "the DM alone is told");
});

test("Polymorph: a foe polymorphed fights with the Beast's attacks, and casts no spell", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 2, 0);
  Object.assign(g, { spells: ["magic-missile"], slots: { 1: 2 }, slotsMax: { 1: 2 } });
  g.abil.wis = 1; g.saveBonus = { wis: -50 };
  ok(cast(s, g.id, "wolf"));
  assert.equal(g.form?.block, "wolf");
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 } }, DM));
  let guard = 0;
  while (s.encounter && s.encounter.order[s.encounter.turn]?.id !== g.id && guard++ < 20) ok(apply(s, { type: "endTurn", actor: s.encounter.order[s.encounter.turn].id }, DM));
  const act = aiStep(s, g.id, {});
  assert.ok(act, "it acts");
  const ids = CONTENT.monsters.wolf.actions.map((a) => a.id);
  const named = act.attack ?? act.action;
  assert.ok(act.type === "move" || ids.includes(named), `a wolf's attack, not a goblin's: ${JSON.stringify(act)}`);
  assert.notEqual(act.spell, "magic-missile");
});

test("Polymorph: the form is saved and migrated whole (a whole form is a valid form record)", () => {
  const s = field();
  ok(cast(s, "fighter", "wolf"));
  const copy = JSON.parse(JSON.stringify(s));
  assert.ok(validForm(copy.entities.fighter.form));
  assert.equal(copy.entities.fighter.form.whole, true);
});

test("Polymorph: a rest that clears the Temporary Hit Points ends the form", () => {
  const s = field();
  const f = s.entities.fighter;
  ok(cast(s, "fighter", "wolf"));
  f.tempHp = 0;
  ok(apply(s, { type: "advanceTime", minutes: 1 }, DM));
  assert.ok(!f.form && !fxOf(s), "no Temporary Hit Points: no form");
  ok(cast(s, "fighter", "wolf"));
  ok(apply(s, { type: "shortRest" }, DM));
  assert.ok(!f.form, "after a rest");
});

// Enlarge/Reduce and a form on one creature: Enlarge or Reduce x a Beast smaller, the same size as, or larger than the change x both end orders x both kinds of form; and the change cast while in the form.
const roomy = () => { const s = field(); ok(apply(s, { type: "place", actor: "fighter", to: { q: 8, r: 0 } }, DM)); ok(apply(s, { type: "place", actor: "cleric", to: { q: 5, r: 0 } }, DM)); return s; };
const resizeBy = (s, id, choice) => { s.entities.cleric.spells.push("enlarge-reduce"); ok(apply(s, { type: "cast", actor: "cleric", spell: "enlarge-reduce", target: id, choice, slot: 2 }, DM)); return s.effects.find((x) => x.name === "Enlarge/Reduce"); };
const BEAST = { smaller: "cat", same: "brown-bear", larger: "giant-ape" };
const formOf = (kind, s, beast) => {
  const m = CONTENT.monsters[beast];
  if (kind === "polymorph") { s.entities.fighter.level = 9; ok(apply(s, { type: "cast", actor: "wizard", spell: "polymorph", target: "fighter", choice: beast, slot: 4 }, DM)); return fxOf(s); }
  const tpl = { size: m.size, ac: 12, speed: 40, speeds: {}, abil: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 }, hp: 11, prof: 2 };
  const fx = { id: "fxWS", name: "Wild Shape", parts: [{ target: "fighter", form: true }], source: "fighter", lasts: "1 hour" };
  s.effects.push(fx); takeForm(s.entities.fighter, beast, m.name, tpl, [], fx.id); return fx;
};
const end = (s, fx, who = "wizard") => ok(apply(s, { type: "endEffect", actor: who, effect: fx.id }, DM));
for (const kind of ["polymorph", "wild"]) for (const choice of ["enlarge", "reduce"]) for (const rel of ["smaller", "same", "larger"]) {
  const beast = rel === "same" ? (choice === "enlarge" ? "brown-bear" : "wolf") : BEAST[rel], formSize = CONTENT.monsters[beast].size, changed = choice === "enlarge" ? "large" : "small";
  const label = `${choice} and a ${kind} form (${beast}, ${formSize})`;
  test(`${label}: the change before the form, ended first: the form's size is not touched, and it ends Medium`, () => {
    const s = roomy(); const f = s.entities.fighter;
    const ch = resizeBy(s, "fighter", choice); assert.equal(f.size, changed);
    const fx = formOf(kind, s, beast); assert.equal(f.size, formSize);
    end(s, ch, "cleric"); assert.equal(f.size, formSize, "still the Beast's size");
    end(s, fx); assert.equal(f.size, "medium");
  });
  test(`${label}: the change before the form, the form ended first: it is ${changed} while the change runs, Medium after`, () => {
    const s = roomy(); const f = s.entities.fighter;
    const ch = resizeBy(s, "fighter", choice);
    const fx = formOf(kind, s, beast);
    end(s, fx); assert.equal(f.size, changed);
    end(s, ch, "cleric"); assert.equal(f.size, "medium");
  });
  test(`${label}: the change cast in the form: the Beast's size is left alone; the change is the creature's own when the form ends, in either order`, () => {
    for (const formFirst of [true, false]) {
      const s = roomy(); const f = s.entities.fighter;
      const fx = formOf(kind, s, beast); assert.equal(f.size, formSize);
      const ch = resizeBy(s, "fighter", choice);
      assert.equal(f.size, formSize, "the live size is the Beast's");
      if (formFirst) { end(s, fx); assert.equal(f.size, changed); end(s, ch, "cleric"); }
      else { end(s, ch, "cleric"); assert.equal(f.size, formSize); end(s, fx); }
      assert.equal(f.size, "medium");
    }
  });
}
