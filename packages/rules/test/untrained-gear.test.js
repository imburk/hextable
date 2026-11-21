// Untrained gear (issue #648). SRD 5.2 "Armor Training": armour worn without training gives Disadvantage on every D20 Test that
// uses Strength or Dexterity and bars spellcasting. A weapon without proficiency adds no Proficiency Bonus to its attack roll and gives no
// Weapon Mastery. derive() writes what is worn untrained on the record (`untrained`), modifiers.js turns it into Disadvantage, the cast action
// and slotsFor refuse spells, and the attack of an untrained weapon is marked `untrained`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { lintRecord } from "../src/content/schema.js";
import { modifiers, untrainedGear } from "../src/modifiers.js";
import { passive, savingThrow, slotsFor } from "../src/engine/rolls.js";
import { SPELLS } from "../src/content/index.js";
import { newGame } from "../src/scenario.js";
import { view } from "../src/view.js";
import { SHEETS } from "./fixtures/sheets.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const bytes = (s) => JSON.stringify(s);
const wiz = (more = {}) => ({ ...SHEETS.wizard, spells: ["fire-bolt", "magic-missile", "burning-hands"], ...more });
const fighter = (more = {}) => ({ ...SHEETS.fighter, level: 5, subclass: "champion", ...more });

function field(sh, { fight = true } = {}) {
  const s = newGame(11);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sh).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  s.entities.hero.sheet = structuredClone(sh);
  const foe = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 } }, DM)).events[0].id;
  Object.assign(s.entities[foe], { hp: 500, maxHp: 500, ac: 1 });
  s.foe = foe;
  if (fight) {
    ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
    for (let i = 0; i < 8 && current(s) !== "hero"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    assert.equal(current(s), "hero");
  }
  return s;
}
const roll = (s, attack) => apply(s, { type: "attack", actor: "hero", target: s.foe, attack }, DM);
const atk = (r) => r.events.find((e) => e.type === "attack");

test("derive names what is worn untrained: armour by its trained categories, a Shield never, a magic suit, a trained wearer none", () => {
  assert.equal(derive(wiz()).record.untrained, undefined);
  assert.deepEqual(derive(wiz({ armour: "chain-mail" })).record.untrained, ["Chain Mail"]);
  assert.equal(derive(wiz({ shield: true })).record.untrained, undefined, "SRD Armor Training: an untrained Shield only loses its Armor Class bonus");
  assert.deepEqual(derive(wiz({ armour: "leather-armor", shield: true })).record.untrained, ["Leather Armor"]);
  assert.equal(derive(fighter({ armour: "plate-armor", shield: true })).record.untrained, undefined);
  assert.deepEqual(derive({ ...SHEETS.rogue, armour: "chain-mail" }).record.untrained, ["Chain Mail"], "a rogue has light armour only");
  assert.equal(derive({ ...SHEETS.rogue, armour: "leather-armor" }).record.untrained, undefined);
  // A Shield without training gives no Armor Class (as the build always had it); armour untrained still gives its own.
  assert.equal(derive(wiz({ shield: true })).record.ac, derive(wiz()).record.ac);
  assert.equal(derive(wiz({ armour: "chain-mail" })).record.ac, 16);
  // A magic suit made from a base the wearer is not trained in; Elven Chain is worn as if trained.
  const suit = (item) => derive(wiz({ items: [{ id: "i1", item, base: "chain-shirt", equipped: true }] })).record.untrained;
  assert.deepEqual(suit("armor-plus-1"), ["Chain Shirt"]);
  assert.equal(suit("elven-chain"), undefined);
  assert.deepEqual(validate(wiz({ armour: "chain-mail", shield: true })), [], "allowed: the build screen may pick it");
});

test("Disadvantage on D20 Tests with Strength or Dexterity: saves, checks, attack rolls, Initiative; not Constitution, Wisdom, Intelligence, Charisma, death saves", () => {
  const s = field(wiz({ armour: "chain-mail" }), { fight: false }), e = s.entities.hero;
  const dis = (hook, sit = {}) => modifiers(s, e, hook, { target: e, ...sit }, "").disadvantage;
  for (const a of ["str", "dex"]) {
    assert.deepEqual(dis(`save.${a}`), ["Chain Mail, no training"], `${a} save`);
    assert.deepEqual(dis("check", { ability: a }), ["Chain Mail, no training"], `${a} check`);
    assert.deepEqual(modifiers(s, e, "attack.roll", { attacker: e, ability: a }, "attacker").disadvantage, ["Chain Mail, no training"], `${a} attack`);
  }
  for (const a of ["con", "int", "wis", "cha"]) {
    assert.deepEqual(dis(`save.${a}`), [], `${a} save`);
    assert.deepEqual(dis("check", { ability: a }), [], `${a} check`);
    assert.deepEqual(modifiers(s, e, "attack.roll", { attacker: e, ability: a }, "attacker").disadvantage, [], `${a} attack`);
  }
  assert.ok(dis("check", { skill: "stealth", ability: "dex" }).includes("Chain Mail, no training"));
  assert.deepEqual(dis("check", { skill: "perception", ability: "wis" }), []);
  assert.deepEqual(dis("initiative"), ["Chain Mail, no training"], "Initiative is a Dexterity check");
  assert.deepEqual(dis("save.death"), [], "a Death Saving Throw uses no ability");
  assert.deepEqual(dis("attack.roll", {}), [], "an attack that names no ability is not judged");
  // An untrained Shield beside untrained armour adds nothing more; alone it gives no Disadvantage.
  const both = field(wiz({ armour: "chain-mail", shield: true }), { fight: false }).entities.hero;
  assert.deepEqual(modifiers(s, both, "save.dex", { target: both }, "").disadvantage, ["Chain Mail, no training"]);
  const sh0 = field(wiz({ shield: true }), { fight: false }).entities.hero;
  assert.deepEqual(modifiers(s, sh0, "save.dex", { target: sh0 }, "").disadvantage, []);
  assert.deepEqual(modifiers(s, sh0, "initiative", {}, "").disadvantage, []);
  // Trained: nothing. In a form (Wild Shape) the armour melds into it: nothing.
  const trained = field(fighter({ armour: "plate-armor", shield: true }), { fight: false }).entities.hero;
  assert.deepEqual(modifiers(s, trained, "save.dex", { target: trained }, "").disadvantage, []);
  e.form = { name: "Wolf", block: "wolf" };
  assert.deepEqual(untrainedGear(e), []);
  assert.deepEqual(modifiers(s, e, "save.dex", { target: e }, "").disadvantage, []);
});

test("an attack by a character in untrained armour is rolled with Disadvantage and says why; a trained wearer rolls plain; the same seed replays", () => {
  const sheet = { ...SHEETS.rogue, level: 1, armour: "chain-mail" };         // Dexterity 17: the dagger-class shortsword uses Dexterity
  const s = field(sheet), r = roll(s, "shortsword");
  ok(r);
  const a = atk(r);
  assert.equal(a.mode, "dis");
  assert.deepEqual(a.why, ["Chain Mail, no training"]);
  assert.equal(a.rolls.length, 2);
  const twin = field(sheet);
  assert.deepEqual(roll(twin, "shortsword").events, r.events, "replays");
  const plain = field({ ...SHEETS.rogue, level: 1 }), p = atk(roll(plain, "shortsword"));
  assert.equal(p.mode, "normal");
  // An untrained Shield gives no Disadvantage (SRD Armor Training: it only loses its Armor Class bonus).
  const sh = atk(roll(field(wiz({ shield: true })), "dagger"));
  assert.equal(sh.mode, "normal");
  // Disadvantage and Advantage cancel as ever: a prone foe within 5 feet gives Advantage to a melee attacker.
  const c = field(sheet); c.entities[c.foe].cond.prone = {};
  assert.equal(atk(roll(c, "shortsword")).mode, "normal");
});

test("a Strength or Dexterity saving throw is rolled with two dice in untrained armour, a Wisdom one with one", () => {
  const s = field(wiz({ armour: "chain-mail" }), { fight: false }), e = s.entities.hero;
  const d = savingThrow(s, e, "dex", 10), w = savingThrow(s, e, "wis", 10);
  assert.equal(d.mode, "dis"); assert.deepEqual(d.why, ["Chain Mail, no training"]); assert.equal(d.rolls.length, 2);
  assert.equal(w.rolls, undefined, "one die");
  assert.equal(savingThrow(s, e, "str", 10).mode, "dis");
});

test("no spells in untrained armour: refused with a sentence, nothing changes; with only an untrained Shield, trained, or without it, they are cast", () => {
  for (const more of [{ armour: "chain-mail" }, { armour: "chain-mail", shield: true }]) {
    const s = field(wiz(more)), before = bytes(s);
    for (const spell of ["fire-bolt", "magic-missile"]) {
      const r = apply(s, { type: "cast", actor: "hero", spell, target: s.foe }, DM);
      assert.equal(r.ok, false);
      assert.match(r.error, /Tavin can't cast spells: Chain Mail worn without training/);
      assert.equal(bytes(s), before, "nothing changed, byte for byte");
    }
    assert.deepEqual(slotsFor(s, s.entities.hero, SPELLS["magic-missile"]), [], "no reaction spell either");
    assert.deepEqual(slotsFor(s, s.entities.hero, SPELLS["fire-bolt"]), []);
  }
  const bare = field(wiz());
  assert.ok(apply(bare, { type: "cast", actor: "hero", spell: "fire-bolt", target: bare.foe }, DM).ok);
  assert.deepEqual(slotsFor(bare, bare.entities.hero, SPELLS["fire-bolt"]), [0]);
  const held = field(wiz({ shield: true }));
  assert.ok(apply(held, { type: "cast", actor: "hero", spell: "fire-bolt", target: held.foe }, DM).ok, "a wizard holding a Shield casts");
  assert.deepEqual(slotsFor(held, held.entities.hero, SPELLS["fire-bolt"]), [0]);
  // A cleric trained in armour and Shield casts in them.
  const cler = field({ ...SHEETS.cleric }), cast = apply(cler, { type: "cast", actor: "hero", spell: "sacred-flame", target: cler.foe }, DM);
  assert.ok(cast.ok, cast.error);
});

test("a weapon without proficiency adds no Proficiency Bonus; one with it does; the Strength or Dexterity modifier still counts", () => {
  const w = derive(wiz({ weapons: ["dagger", "longsword", "longbow"] })).record;     // a wizard: simple weapons only
  const at = (id) => w.attacks.find((x) => x.id === id);
  assert.equal(at("dagger").bonus, 2 + 2, "Dexterity 14 (+2, finesse) and Proficiency +2");
  assert.equal(at("dagger").untrained, undefined);
  assert.equal(at("longsword").bonus, -1, "Strength 8: -1 and no Proficiency Bonus");
  assert.equal(at("longsword").untrained, true);
  assert.equal(at("longbow").bonus, 2, "Dexterity +2, no Proficiency Bonus");
  assert.equal(at("longbow").untrained, true);
  const f = derive(fighter({ weapons: ["longsword"] })).record.attacks.find((x) => x.id === "longsword");
  assert.equal(f.bonus, 3 + 3, "Strength 17 (+3), Proficiency +3 at level 5");
  assert.equal(f.untrained, undefined);
  // In play: the total on the d20 is the roll plus that bonus.
  const s = field(wiz({ weapons: ["dagger", "longsword"] }));
  const a = atk(roll(s, "longsword"));
  assert.equal(a.bonus, -1);
  assert.equal(a.total, a.nat - 1);
  assert.equal(a.mode, "normal", "no armour, no Disadvantage: the bonus is all an untrained weapon loses");
  // A magic weapon made from an untrained base: its +1 stays, the Proficiency Bonus does not.
  const m = derive(wiz({ weapons: [], items: [{ id: "i1", item: "weapon-plus-1", base: "longsword", equipped: true }] })).record.attacks.find((x) => x.weapon === "longsword");
  assert.equal(m.bonus, -1 + 1);
  assert.equal(m.untrained, true);
  // A class trained in only some martial weapons: a rogue's Greatsword (not Finesse or Light) is untrained, its Rapier is not.
  const rg = derive({ ...SHEETS.rogue, weapons: ["greatsword", "rapier"] }).record.attacks;
  assert.equal(rg.find((x) => x.id === "greatsword").untrained, true);
  assert.equal(rg.find((x) => x.id === "rapier").untrained, undefined);
});

test("Weapon Mastery: an untrained weapon gives none; a holder of the feature is told once a fight, and no one else", () => {
  const sheet = { ...SHEETS.rogue, level: 2, weapons: ["greatsword", "rapier"], armour: "leather-armor" };
  const rec = derive(sheet).record;
  assert.ok(rec.feats.some((f) => f.id === "weapon-mastery"), "a rogue has Weapon Mastery");
  const s = field(sheet);
  const first = roll(s, "greatsword"), note = first.events.filter((e) => e.type === "manual" && e.name === "Weapon Mastery");
  ok(first);
  assert.equal(note.length, 1);
  assert.match(note[0].text, /not proficient with the Greatsword, so it has no Weapon Mastery property \(graze\)/);
  assert.equal(roll(s, "rapier").events.filter((e) => e.name === "Weapon Mastery").length, 0, "a weapon it is trained with: nothing to say");
  // Second swing with the same weapon in the same fight: not told again (the pool is spent, so give another action first).
  s.encounter.budget.action = 1;
  assert.equal(apply(s, { type: "attack", actor: "hero", target: s.foe, attack: "greatsword" }, DM).events.filter((e) => e.name === "Weapon Mastery").length, 0);
  // A wizard has no Weapon Mastery: nothing to say.
  const w = field(wiz({ weapons: ["longsword"] }));
  assert.equal(roll(w, "longsword").events.filter((e) => e.type === "manual").length, 0);
});

test("the record and its view: `untrained` is checked, kept through a rest or a remake, and sent to players as it is", () => {
  const rec = derive(wiz({ armour: "chain-mail", shield: true })).record;
  assert.deepEqual(lintRecord(rec, { spells: SPELLS }), []);
  for (const bad of [[], ["a", "b", "c"], "Chain Mail", [3], [""]]) assert.ok(lintRecord({ ...rec, untrained: bad }, { spells: SPELLS }).length > 0, JSON.stringify(bad));
  assert.ok(lintRecord({ ...rec, attacks: rec.attacks.map((a) => ({ ...a, untrained: false })) }, { spells: SPELLS }).length > 0);
  // A character whose sheet changes to trained armour is made again with no mark; back to untrained, with it.
  const s = field(wiz({ armour: "chain-mail" }), { fight: false });
  assert.deepEqual(s.entities.hero.untrained, ["Chain Mail"]);
  const sheet = structuredClone(s.entities.hero.sheet); delete sheet.armour;
  ok(apply(s, { type: "setSheet", actor: "hero", sheet, id: "hero" }, DM));
  const h = Object.values(s.entities).find((e) => e.kind === "pc" && e.name === "Tavin") ?? s.entities.hero;
  assert.equal(h.untrained, undefined);
  // Players see the mark on their own character.
  const t = field(wiz({ armour: "chain-mail" }), { fight: false });
  t.entities.hero.owner = "p1";
  const v = view(t, { role: "player", userId: "p1" });
  assert.deepEqual(v.entities.hero.untrained, ["Chain Mail"]);
});

test("passive Dexterity and Strength skills drop by 5 in untrained armour, as for Stealth Disadvantage; Wisdom ones do not", () => {
  const s = field(wiz(), { fight: false }), bare = s.entities.hero;
  const w = field(wiz({ armour: "chain-mail" }), { fight: false }).entities.hero;
  for (const skill of ["stealth", "acrobatics", "athletics"]) assert.equal(passive(s, w, skill), passive(s, bare, skill) - 5, skill);
  assert.equal(passive(s, w, "perception"), passive(s, bare, "perception"));
  const sh = field(wiz({ shield: true }), { fight: false }).entities.hero;
  assert.equal(passive(s, sh, "stealth"), passive(s, bare, "stealth"), "a Shield alone changes nothing");
});
