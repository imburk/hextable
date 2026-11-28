// Manual spells B4 (#786, #903): Animal Shapes and Shapechange (assist), and the `polymorph` step's new keys: `cr`, `types`, `not`, `size`, `keep`, `early`.
// Built to docs/specs/rules-expansion.md, "Build notes: manual spells B4". Every cast goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, SPELLS } from "../src/content/index.js";
import { FORMS, lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { apply } from "../src/engine.js";
import { takeForm, leaveForm, validForm } from "../src/forms.js";
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
  const slots = { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 2, 7: 1, 8: 2, 9: 2 };
  for (const id of ["wizard", "cleric"]) Object.assign(s.entities[id], { slots: { ...slots }, slotsMax: { ...slots } });
  s.entities.wizard.spells.push("animal-shapes", "shapechange");
  s.entities.wizard.level = 9;
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 40;
  return s;
}
const animal = (s, targets, choice, extra = {}, ctx = DM) => apply(s, { type: "cast", actor: "wizard", spell: "animal-shapes", targets, choice, slot: 8, ...extra }, ctx);
const change = (s, choice, ctx = DM) => apply(s, { type: "cast", actor: "wizard", spell: "shapechange", target: "wizard", choice, slot: 9 }, ctx);
const fxOf = (s, name) => s.effects.find((x) => x.name === name);
const refused = (s, run, re) => { const was = JSON.stringify(s); const r = run(); assert.ok(!r.ok, "refused"); if (re) assert.match(r.error, re); assert.equal(JSON.stringify(s), was, "state compared whole"); };

test("B4: Animal Shapes and Shapechange are assist, lint, and read with no problem", () => {
  for (const id of ["animal-shapes", "shapechange"]) {
    const d = SPELLS[id].def;
    assert.equal(d.tier, "assist", id);
    assert.deepEqual(lint(d), [], id);
    assert.deepEqual(readEntry("spell", d, {}).problems ?? [], [], id);
  }
});

test("B4: every new key of the step is linted, and a bad one is refused", () => {
  const d = SPELLS["animal-shapes"].def, step = d.effects[0];
  const with_ = (patch) => lint({ ...d, effects: [{ ...step, ...patch }, d.effects[1]] });
  assert.deepEqual(with_({}), []);
  for (const bad of [{ cr: -1 }, { cr: "4" }, { cr: 0.1 }, { types: [] }, { types: ["fish"] }, { types: ["beast"], not: ["undead"] }, { not: ["beast", "beast"] }, { size: "enormous" }, { keep: ["luck"] }, { keep: [] }, { early: true }]) assert.ok(with_(bad).length, JSON.stringify(bad));
  for (const good of [{ cr: 0.5 }, { cr: 0 }, { types: ["beast", "monstrosity"], not: undefined }, { not: ["undead"], types: undefined }, { size: "tiny" }, { keep: ["mental"] }, { keep: ["mental", "proficiencies", "spellcasting"] }]) assert.deepEqual(with_(good), [], JSON.stringify(good));
  assert.ok(lint({ ...d, duration: "instant", concentration: false }).length, "a form must last");
});

test("B4: the choice is any stat block of the pack, and the list is the pack", () => {
  assert.deepEqual([...FORMS].sort(), Object.keys(CONTENT.monsters).sort());
});

test("Animal Shapes: each willing creature takes the one Beast, no Concentration, for 24 hours; the Beast's Hit Points are a buffer, the form stays when they are gone", () => {
  const s = field();
  const f = s.entities.fighter, ro = s.entities.rogue, own = structuredClone(f);
  const r = ok(animal(s, ["fighter", "rogue", "wizard"], "brown-bear"));
  const bear = CONTENT.monsters["brown-bear"];
  for (const e of [f, ro, s.entities.wizard]) {
    assert.equal(e.form.block, "brown-bear");
    assert.equal(e.form.whole, "lasting");
    assert.equal(e.tempHp, bear.hp);
    assert.equal(e.size, "large");
    assert.equal(e.hp, 40, "Hit Points kept");
  }
  assert.deepEqual(f.abil, bear.abilities);
  const fx = fxOf(s, "Animal Shapes");
  assert.ok(fx && !fx.conc, "no Concentration");
  assert.equal(fx.lasts, "24 hours");
  assert.equal(r.events.filter((e) => e.type === "form").length, 3);
  // The Temporary Hit Points soak damage; with none left the form is still there, and the spell goes on.
  ok(apply(s, { type: "harm", actor: "fighter", amount: bear.hp + 5 }, DM));
  assert.equal(f.hp, 35);
  assert.ok(!(f.tempHp > 0) && f.form && fxOf(s, "Animal Shapes"), "still a bear");
  ok(apply(s, { type: "advanceTime", minutes: 30 }, DM));
  assert.ok(f.form, "half an hour later");
  // It can't speak or cast spells.
  const w = s.entities.wizard;
  refused(s, () => apply(s, { type: "cast", actor: "wizard", spell: "shapechange", target: "wizard", choice: "ogre", slot: 9 }, DM), /can't/);
  // It goes when the spell does: everything back, the Temporary Hit Points gone.
  ok(apply(s, { type: "endEffect", actor: "wizard", effect: fx.id }, DM));
  assert.ok(!f.form && !ro.form && !w.form && !f.tempHp && !ro.tempHp);
  assert.equal(f.size, own.size);
  assert.deepEqual(f.abil, own.abil);
  assert.deepEqual(f.skills, own.skills);
  assert.equal(f.hp, 35);
});

test("Animal Shapes: it lasts 24 hours and then ends", () => {
  const s = field();
  ok(animal(s, ["fighter"], "wolf"));
  ok(apply(s, { type: "advanceTime", minutes: 23 * 60 }, DM));
  assert.ok(s.entities.fighter.form);
  ok(apply(s, { type: "advanceTime", minutes: 61 }, DM));
  assert.ok(!s.entities.fighter.form && !s.entities.fighter.tempHp && !fxOf(s, "Animal Shapes"));
});

test("Animal Shapes: a form outside the caps is refused, and the state is compared whole", () => {
  const s = field();
  const slots = s.entities.wizard.slots[8];
  refused(s, () => animal(s, ["fighter"], "giant-ape"), /Challenge Rating 7|huge/);
  refused(s, () => animal(s, ["fighter"], "elephant"), /Huge/i);                     // Challenge Rating 4, but Huge
  refused(s, () => animal(s, ["fighter"], "triceratops"), /Challenge Rating 5|huge/);
  refused(s, () => animal(s, ["fighter"], "goblin-warrior"), /not a Beast/);
  refused(s, () => animal(s, ["fighter", "rogue"], "nothing"));
  assert.equal(s.entities.wizard.slots[8], slots);
  // A rating of exactly 4 and a Large size are within.
  const big = Object.values(CONTENT.monsters).find((m) => m.type === "beast" && m.cr === 4 && m.size === "large");
  if (big) { ok(animal(s, ["fighter"], big.id)); assert.equal(s.entities.fighter.form.block, big.id); }
  // The cap is the spell's 4, not the target's level: a level 1 creature may take a Challenge Rating 1 Beast.
  const s2 = field();
  s2.entities.fighter.level = 1;
  ok(animal(s2, ["fighter"], "brown-bear"));
  assert.equal(s2.entities.fighter.form.block, "brown-bear");
});

test("Animal Shapes: a creature already in a form takes the new one in its place; it keeps its alignment, Hit Points and Hit Point Dice", () => {
  const s = field();
  const f = s.entities.fighter, own = structuredClone(f);
  ok(animal(s, ["fighter"], "wolf"));
  ok(animal(s, ["fighter"], "brown-bear", { slot: 8 }));
  assert.equal(f.form.block, "brown-bear");
  assert.equal(f.tempHp, CONTENT.monsters["brown-bear"].hp);
  assert.equal(f.alignment, own.alignment);
  assert.equal(f.hd, own.hd);
  assert.equal(s.effects.filter((x) => x.name === "Animal Shapes").length, 1, "the first cast's effect ended on it");
});

test("Shapechange: the caster takes any creature of its level or lower that is not a Construct or Undead, keeping its mind, proficiencies and Hit Points", () => {
  const s = field();
  const w = s.entities.wizard, own = structuredClone(w);
  const r = ok(change(s, "ogre"));
  const ogre = CONTENT.monsters.ogre;
  assert.equal(w.form.block, "ogre");
  assert.equal(w.form.whole, "lasting");
  assert.equal(w.form.spells, true, "Spellcasting is kept");
  assert.equal(w.size, "large");
  assert.equal(w.ac, ogre.ac);
  assert.equal(w.abil.str, ogre.abilities.str, "Strength is the form's");
  for (const a of ["int", "wis", "cha"]) assert.equal(w.abil[a], own.abil[a], `${a} is the caster's own`);
  assert.deepEqual(w.skills, own.skills, "proficiencies kept");
  assert.deepEqual(w.saveProf, own.saveProf);
  assert.equal(w.prof, own.prof);
  const wisSave = Math.floor((own.abil.wis - 10) / 2) + (own.saveProf.includes("wis") ? own.prof : 0);
  assert.ok(w.saveBonus.wis >= wisSave, "the save uses its own score and proficiency");
  assert.equal(w.hp, own.hp);
  assert.equal(w.hd, own.hd);
  assert.equal(w.tempHp, ogre.hp);
  assert.equal(w.alignment, own.alignment);
  const fx = fxOf(s, "Shapechange");
  assert.ok(fx.conc && fx.lasts === "1 hour");
  assert.ok(r.events.some((e) => e.type === "form" && e.form === "ogre"));
  // The Temporary Hit Points are a buffer: the form stays when they are gone.
  w.tempHp = 0;
  ok(apply(s, { type: "advanceTime", minutes: 1 }, DM));
  assert.ok(!(w.tempHp > 0) && w.form && fxOf(s, "Shapechange"), "still an ogre");
  // Concentration lost: everything is back.
  ok(apply(s, { type: "endEffect", actor: "wizard", effect: fx.id }, DM));
  assert.ok(!w.form && !w.tempHp);
  assert.equal(w.size, own.size);
  assert.deepEqual(w.abil, own.abil);
  assert.equal(w.ac, own.ac);
  assert.deepEqual(w.skills, own.skills);
  assert.deepEqual(w.saveBonus, own.saveBonus);
});

test("Shapechange: a form above the caster's level, a Construct, an Undead, or not a creature is refused, state compared whole; Challenge Rating equal to the level is within", () => {
  const s = field();
  const slots = s.entities.wizard.slots[9];
  refused(s, () => change(s, "adult-red-dragon"), /Challenge Rating 17/);
  refused(s, () => change(s, "zombie"), /undead/);
  refused(s, () => change(s, "animated-armor"), /construct/);
  refused(s, () => change(s, "nothing"));
  refused(s, () => change(s, undefined));
  assert.equal(s.entities.wizard.slots[9], slots, "no slot spent");
  const nine = Object.values(CONTENT.monsters).find((m) => m.cr === 9 && !["construct", "undead"].includes(m.type));
  if (nine) { ok(change(s, nine.id)); assert.equal(s.entities.wizard.form.block, nine.id); }
  // A player's cast is refused too (it is the caster's own level).
  const s2 = field();
  Object.assign(s2.entities.wizard, { owner: "u1", ownerName: "Pat" });
  refused(s2, () => change(s2, "adult-red-dragon", { role: "player", userId: "u1" }), /Challenge Rating 17/);
  s2.entities.wizard.level = 17;
  ok(change(s2, "adult-red-dragon"));
  assert.equal(s2.entities.wizard.size, "huge");
});

test("Shapechange: a creature with a stat block counts at its Challenge Rating, and the form may be a Beast, a Humanoid or a Dragon", () => {
  for (const [id, type] of [["wolf", "beast"], ["ogre", "giant"], ["brown-bear", "beast"]]) {
    const s = field();
    ok(change(s, id));
    assert.equal(s.entities.wizard.form.block, id, type);
  }
});

test("takeForm: `keep` and `lasting` only change what they say; a plain whole form is as it was", () => {
  const s = field();
  const base = (() => { const e = structuredClone(s.entities.fighter); return e; })();
  const tpl = { size: "large", ac: 11, speed: 40, speeds: {}, abil: { str: 19, dex: 10, con: 16, int: 3, wis: 13, cha: 7 }, hp: 34, prof: 2, saveBonus: { wis: 3 }, skillBonus: { perception: 3 } };
  const plain = structuredClone(base); takeForm(plain, "brown-bear", "Brown Bear", tpl, [], "fx1", { whole: true });
  assert.equal(plain.form.whole, true);
  assert.equal(plain.form.spells, undefined);
  assert.equal(plain.abil.int, 3);
  assert.deepEqual(plain.skills, []);
  const kept = structuredClone(base); takeForm(kept, "brown-bear", "Brown Bear", tpl, [], "fx1", { whole: true, lasting: true, spells: true, keep: ["mental"] });
  assert.equal(kept.form.whole, "lasting");
  assert.equal(kept.form.spells, true);
  assert.equal(kept.abil.int, base.abil.int);
  assert.equal(kept.abil.str, 19);
  assert.deepEqual(kept.skills, [], "only `mental` was kept");
  assert.ok(validForm(kept.form) && validForm(plain.form));
  assert.ok(!validForm({ ...kept.form, whole: "never" }) && !validForm({ ...plain.form, spells: true, whole: undefined }));
  const prof = structuredClone(base); takeForm(prof, "brown-bear", "Brown Bear", tpl, [], "fx1", { whole: true, keep: ["proficiencies"] });
  assert.deepEqual(prof.skills, base.skills);
  assert.equal(prof.abil.int, 3, "no `mental`: the form's Intelligence");
  assert.equal(prof.prof, base.prof);
  for (const e of [plain, kept, prof]) { const before = structuredClone(base); leaveForm(e); assert.deepEqual(e, before); }
});
