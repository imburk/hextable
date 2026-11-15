// Companions, stage C4 (docs/specs/companions.md): the Otherworldly Steed, Draconic Spirit and Animated Object
// blocks and the spells that summon with them (Find Familiar, Find Steed, Summon Dragon, Phantom Steed, Animate
// Objects). Every number below is read off reference/srd52/srd52-flow.txt (the lines are named at each check).
// The Unseen Servant stays manual (the last test says why).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, makeEntity } from "../src/engine.js";
import { view, viewEvents } from "../src/view.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { gridOf } from "../src/grid.js";
import { bake, castings } from "../src/summons.js";
import { CONTENT, PACKS, SPELLS } from "../src/content/index.js";
import { lintBaked, lintPack } from "../src/content/schema.js";
import { summonCaster } from "../src/engine/world.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (s) => JSON.stringify(s);
function refused(s, action, ctx, words) {
  const before = json(s), r = apply(s, action, ctx);
  assert.equal(r.ok, false, `${action.type} should be refused`);
  if (words) assert.match(r.error, words);
  assert.equal(json(s), before, "a refused action changes nothing");
}
const [srd] = PACKS;
const CASTER = { attack: 9, dc: 17, pb: 6, mod: 3 };

const ABIL = { str: 10, dex: 14, con: 14, int: 16, wis: 12, cha: 16 };
const sheet = (cls, spells, extra = {}) => ({ name: "Ven", class: cls, level: 17, abilities: ABIL, skills: [], armour: "leather-armor", weapons: ["quarterstaff"], spells, ...extra });
function spot(s, near, r = 3, n = 0, monster = "wolf") {
  const G = gridOf(s.map), out = [];
  for (const h of G.range(near, r)) if (apply(structuredClone(s), { type: "spawn", monster, at: h }, DM).ok) out.push(h);
  return out[n];
}
// The valley with Ven, a party caster of level 17 played by Pat, beside the fighter.
function table(cls, spells, extra) {
  const s = newGame(5);
  s.settings.autoEngage = false;
  const d = derive(sheet(cls, spells, extra));
  s.entities.ven = makeEntity(d.record, { id: "ven", kind: "pc", side: "party", pos: { ...spot(s, s.entities.fighter.pos, 2), z: 0 } });
  ok(apply(s, { type: "claim", entity: "ven", user: "pat", userName: "Pat" }, PAT));
  return s;
}
const castAt = (s, spell, slot, summon, more = {}) => apply(s, { type: "cast", actor: "ven", spell, slot, summon, ...more }, PAT);
const made = (r) => r.events.find((e) => e.type === "summoned").id;
const act = (t, id) => t.actions.find((a) => a.id === id);

// ---------- the blocks, baked at every casting (lint, then the SRD's numbers) ----------

test("Otherworldly Steed (SRD lines 26854-26905) baked at levels 2 to 9, each type: it lints, with the SRD's numbers", () => {
  const B = CONTENT.summons["otherworldly-steed"];
  assert.equal(castings(B).length, 8 * 3);
  for (const { slot, type } of castings(B)) {
    const t = bake(B, { slot, type, caster: CASTER }), at = `level ${slot} ${type}`;
    assert.deepEqual(lintBaked(t), [], at);
    assert.equal(t.ac, 10 + slot, at);                           // AC 10 + 1 per spell level
    assert.equal(t.hp, 5 + 10 * slot, at);                       // HP 5 + 10 per spell level
    assert.deepEqual(t.speed, slot >= 4 ? { walk: 60, fly: 60 } : { walk: 60 }, at);   // Fly 60 ft. (requires level 4+ spell)
    assert.deepEqual([t.size, t.type, t.pb, t.cr, t.xp], ["large", type, 6, null, 0], at);
    assert.deepEqual(t.abilities, { str: 18, dex: 12, con: 14, int: 6, wis: 12, cha: 8 });
    assert.equal(t.saves, undefined, "every save equals its modifier (Str +4 +4 ... Cha -1 -1)");
    assert.deepEqual(t.traits.map((x) => x.id), ["life-bond"]);
    const slam = act(t, "otherworldly-slam");
    assert.deepEqual(slam.target, { creature: { reach: 5 } });
    assert.equal(slam.effects[0].bonus, CASTER.attack, "your spell attack modifier");
    assert.deepEqual(slam.effects[0].onHit, [{ damage: `1d8+${slot}`, type: { celestial: "radiant", fey: "psychic", fiend: "necrotic" }[type] }], at);
    // One Bonus Action by type, each once per Long Rest.
    const bonus = t.actions.filter((a) => a.time === "bonus");
    assert.deepEqual(bonus.map((a) => a.id), [{ celestial: "healing-touch", fey: "fey-step", fiend: "fell-glare" }[type]], at);
    for (const a of bonus) assert.deepEqual(a.uses, { per: "day", n: 1 });
    if (type === "fiend") {
      const g = act(t, "fell-glare");
      assert.deepEqual(g.target, { creature: { range: [60, 60] } });                // one creature within 60 feet
      assert.deepEqual([g.effects[0].save, g.effects[0].dc], ["wis", CASTER.dc]);    // Wisdom save, your spell save DC
    }
    assert.ok(!json(t).includes('"only"') && !json(t).includes('"plus"') && !json(t).includes('"caster"') && !json(t).includes('"by"'), "no amount is left");
  }
  assert.equal(B.tier, "assist"); assert.equal(B.checked, true);
});

test("Draconic Spirit (SRD lines 31196-31276) baked at levels 5 to 9, each breath type: it lints, with the SRD's numbers", () => {
  const B = CONTENT.summons["draconic-spirit"];
  assert.equal(castings(B).length, 5 * 5);
  for (const { slot, variant } of castings(B)) {
    const t = bake(B, { slot, variant, caster: CASTER }), at = `level ${slot} ${variant}`;
    assert.deepEqual(lintBaked(t), [], at);
    assert.equal(t.ac, 14 + slot, at);                           // AC 14 + the spell's level
    assert.equal(t.hp, 50 + 10 * (slot - 5), at);                // HP 50 + 10 for each spell level above 5
    assert.deepEqual(t.speed, { walk: 30, fly: 60, swim: 30 });
    assert.deepEqual([t.size, t.type, t.pb, t.cr, t.xp], ["large", "dragon", 6, null, 0]);
    assert.deepEqual(t.abilities, { str: 19, dex: 14, con: 17, int: 10, wis: 14, cha: 14 });
    assert.deepEqual(t.resist, ["acid", "cold", "fire", "lightning", "poison"]);
    assert.deepEqual(t.conditionImmune, ["charmed", "frightened", "poisoned"]);
    assert.deepEqual(t.senses, { blindsight: 30, darkvision: 60 });
    // Multiattack: Rend attacks equal to half the spell's level (round down), and it uses Breath Weapon.
    assert.deepEqual(act(t, "multiattack").multiattack, [{ action: "rend", times: Math.floor(slot / 2) }, { action: "breath-weapon", times: 1 }], at);
    const rend = act(t, "rend");
    assert.deepEqual(rend.target, { creature: { reach: 10 } });
    assert.equal(rend.effects[0].bonus, CASTER.attack);
    assert.deepEqual(rend.effects[0].onHit, [{ damage: `1d6+${4 + slot}`, type: "piercing" }], at);   // 1d6 + 4 + the spell's level
    const br = act(t, "breath-weapon");
    assert.deepEqual(br.target, { area: { shape: "cone", size: 30 } });
    assert.deepEqual([br.effects[0].save, br.effects[0].dc, br.effects[0].half], ["dex", CASTER.dc, true]);
    assert.deepEqual(br.effects[0].onFail, [{ damage: "2d6", type: variant }], "2d6 of the type chosen, one the spirit resists");
    assert.ok(t.resist.includes(variant));
  }
  assert.equal(B.tier, "auto"); assert.equal(B.checked, true);
});

test("Animated Object (SRD lines 24073-24135) baked at levels 5 to 9, each size: it lints, with the SRD's numbers", () => {
  const B = CONTENT.summons["animated-object"];
  assert.equal(castings(B).length, 5 * 5);
  const extra = { tiny: "1d4", small: "1d4", medium: "1d4", large: "1d6", huge: "1d12" };   // per slot level above 5
  const hp = { tiny: 10, small: 10, medium: 10, large: 20, huge: 40 };
  for (const { slot, variant } of castings(B)) {
    const t = bake(B, { slot, variant, caster: CASTER }), at = `level ${slot} ${variant}`;
    assert.deepEqual(lintBaked(t), [], at);
    assert.deepEqual([t.ac, t.hp, t.size, t.type], [15, hp[variant], variant, "construct"], at);
    assert.deepEqual(t.speed, { walk: 30 });
    assert.deepEqual(t.abilities, { str: 16, dex: 10, con: 10, int: 3, wis: 3, cha: 1 });
    assert.deepEqual(t.actions.map((a) => a.id), ["slam"]);
    const slam = act(t, "slam");   // Large and Huge add your spellcasting ability modifier
    assert.deepEqual(slam.target, { creature: { reach: 5 } });
    assert.equal(slam.effects[0].bonus, CASTER.attack);
    const [first, ...more] = slam.effects[0].onHit;
    const want = { tiny: "1d4+3", small: "1d4+3", medium: "1d4+3", large: `2d6+${3 + CASTER.mod}`, huge: `2d12+${3 + CASTER.mod}` }[variant];
    assert.deepEqual(first, { damage: want, type: "force" }, at);
    assert.equal(more.length, slot - 5, "one more die for each slot level above 5");
    for (const m of more) assert.deepEqual(m, { damage: extra[variant], type: "force" }, at);
  }
  assert.equal(B.tier, "auto"); assert.equal(B.checked, true);
});

test("the pack lints clean and the six spells are at the tiers the spec gives for what the engine can say", () => {
  assert.deepEqual(lintPack(srd), []);
  const tiers = Object.fromEntries(["find-familiar", "find-steed", "summon-dragon", "phantom-steed", "animate-objects", "unseen-servant"].map((id) => [id, CONTENT.spells[id].tier]));
  assert.deepEqual(tiers, { "find-familiar": "assist", "find-steed": "assist", "summon-dragon": "auto", "phantom-steed": "assist", "animate-objects": "assist", "unseen-servant": "manual" });
  for (const id of Object.keys(tiers)) assert.equal(CONTENT.spells[id].checked, true, id);
  // A pack's summon step names a block with exactly its variants and types.
  assert.deepEqual(SPELLS["find-steed"].summon, { of: "otherworldly-steed", count: 1, types: ["celestial", "fey", "fiend"], kind: "steed" });
  assert.deepEqual(SPELLS["summon-dragon"].summon.variants, ["acid", "cold", "fire", "lightning", "poison"]);
  assert.deepEqual(SPELLS["animate-objects"].summon.variants, ["tiny", "small", "medium", "large", "huge"]);
});

// ---------- the spells, cast ----------

test("Summon Dragon (SRD lines 31196-31276) cast at levels 5 to 9: the spirit's numbers, its breath type, the caster's shared Resistance, Concentration", () => {
  const base = table("wizard", ["summon-dragon"]);
  const caster = summonCaster(base, base.entities.ven, "summon-dragon");
  for (let slot = 5; slot <= 9; slot++) for (const variant of ["acid", "fire", "poison"]) {
    const s = structuredClone(base), at = spot(s, s.entities.ven.pos, 3, 4, "giant-spider");
    const r = ok(castAt(s, "summon-dragon", slot, { variant, at: [at] }, { choice: variant === "fire" ? "cold" : "fire" }));
    const id = made(r), e = s.entities[id], say = `level ${slot} ${variant}`;
    assert.equal(e.name, "Ven's Draconic Spirit");
    assert.equal(e.ac, 14 + slot, say); assert.equal(e.maxHp, 50 + 10 * (slot - 5), say);
    assert.deepEqual([e.type, e.size, e.tpl, e.prof], ["dragon", "large", "draconic-spirit", caster.pb]);
    assert.deepEqual(e.speeds, { fly: 60, swim: 30 }); assert.equal(e.speed, 30);
    assert.equal(e.actions.find((a) => a.id === "rend").effects[0].bonus, caster.attack);
    assert.equal(e.actions.find((a) => a.id === "multiattack").multiattack[0].times, Math.floor(slot / 2));
    assert.deepEqual(e.actions.find((a) => a.id === "breath-weapon").effects[0].onFail, [{ damage: "2d6", type: variant }]);
    assert.equal(e.actions.find((a) => a.id === "breath-weapon").effects[0].dc, caster.dc);
    assert.deepEqual([e.bond.kind, e.bond.turn, e.bond.at0, e.bond.to, e.bond.slot], ["summon", "after", "vanish", "ven", slot]);
    const fx = s.effects.find((x) => x.spell === "summon-dragon");
    assert.ok(fx.conc, "Concentration");
    assert.ok(fx.parts.some((p) => p.summon && p.target === id));
    // Shared Resistances: the caster, not the spirit, gains the chosen Resistance while the spell lasts.
    assert.ok(fx.parts.some((p) => p.target === "ven" && /resist/.test(json(p))), say);
    ok(apply(s, { type: "endEffect", effect: fx.id }, PAT));
    assert.ok(!s.entities[id], "the spirit disappears when the spell ends");
  }
});

test("Summon Dragon is refused out of range, with a choice not on its list, or with nothing named, and nothing changes", () => {
  const s = table("wizard", ["summon-dragon"]), good = spot(s, s.entities.ven.pos, 3, 4, "giant-spider");
  refused(s, { type: "cast", actor: "ven", spell: "summon-dragon", slot: 5, summon: { variant: "fire", at: [good] } }, PAT);   // no choice for Shared Resistances
  refused(s, { type: "cast", actor: "ven", spell: "summon-dragon", slot: 5, choice: "cold", summon: { variant: "thunder", at: [good] } }, PAT, /acid, cold, fire, lightning, poison/);
  refused(s, { type: "cast", actor: "ven", spell: "summon-dragon", slot: 5, choice: "thunder", summon: { variant: "fire", at: [good] } }, PAT);
  refused(s, { type: "cast", actor: "ven", spell: "summon-dragon", slot: 4, choice: "cold", summon: { variant: "fire", at: [good] } }, PAT);
  refused(s, { type: "cast", actor: "ven", spell: "summon-dragon", slot: 5, choice: "cold", summon: null }, PAT);
  refused(s, { type: "cast", actor: "ven", spell: "summon-dragon", slot: 5, choice: "cold", summon: { variant: "fire" } }, PAT, /Pick one space/);
  // No pick at all (what the client sends until C8): a manual hand-off, with the Resistance given to the caster as usual.
  const bare = ok(castAt(structuredClone(s), "summon-dragon", 5, undefined, { choice: "cold" }));
  assert.ok(!bare.events.some((x) => x.type === "summoned"));
  const dm = bare.events.find((x) => x.type === "manual" && x.partial);
  assert.equal((dm.text.match(/Draconic Spirit \(AC 19/g) ?? []).length, 1, "the five breath types bake alike: listed once");
  assert.match(dm.text, /pick \(acid, cold, fire, lightning or poison\) changes none of these numbers/);
  assert.match(dm.text, /Resistance it gives Ven, was applied as usual/);
  const far = [...gridOf(s.map).range(s.entities.ven.pos, 14)].find((h) => gridOf(s.map).dist(h, s.entities.ven.pos) === 13 && apply(structuredClone(s), { type: "spawn", monster: "giant-spider", at: h }, DM).ok);
  if (far) refused(s, { type: "cast", actor: "ven", spell: "summon-dragon", slot: 5, choice: "cold", summon: { variant: "fire", at: [far] } }, PAT, /reaches 60 ft/);
});

test("Animate Objects (SRD lines 24073-24135) cast at levels 5 to 9, each size: one object with the baked numbers, kept by Concentration", () => {
  const base = table("wizard", ["animate-objects"]);
  const caster = summonCaster(base, base.entities.ven, "animate-objects");
  const hp = { tiny: 10, small: 10, medium: 10, large: 20, huge: 40 };
  for (let slot = 5; slot <= 9; slot++) for (const variant of Object.keys(hp)) {
    const s = structuredClone(base), at = spot(s, s.entities.ven.pos, 4, 5, variant === "huge" ? "giant-spider" : "wolf");
    const r = ok(castAt(s, "animate-objects", slot, { variant, at: [at] }));
    const id = made(r), e = s.entities[id], say = `level ${slot} ${variant}`;
    assert.deepEqual([e.ac, e.maxHp, e.size, e.type, e.speed, e.tpl], [15, hp[variant], variant, "construct", 30, "animated-object"], say);
    const hit = e.actions.find((a) => a.id === "slam").effects[0];
    assert.equal(hit.bonus, caster.attack, say);
    assert.equal(hit.onHit.length, 1 + slot - 5, say);
    assert.deepEqual([e.bond.kind, e.bond.turn, e.bond.at0], ["object", "after", "vanish"]);
    assert.ok(s.effects.find((x) => x.spell === "animate-objects").conc);
    // At 0 Hit Points it vanishes (it should revert to its object form: that part is the DM's, said in the spell).
    r.events.some((x) => x.type === "manual" && x.partial && x.name === "Animate Objects" && x.text === CONTENT.spells["animate-objects"].text) || assert.fail("the DM is told what the engine does not do");
    ok(apply(s, { type: "setHp", actor: id, hp: 0 }, DM));
    assert.ok(!s.entities[id]);
  }
  const s = structuredClone(base);
  refused(s, { type: "cast", actor: "ven", spell: "animate-objects", slot: 5, summon: { variant: "gargantuan", at: [spot(s, s.entities.ven.pos, 4, 5)] } }, PAT, /tiny, small, medium, large, huge/);
});

test("Find Steed (SRD lines 26824-26905) cast at levels 2 to 5 (the most a 17th-level Paladin has), each type: the steed's numbers, bonded and ending with its caster", () => {
  const base = table("paladin", ["find-steed"], { level: 17 });
  const caster = summonCaster(base, base.entities.ven, "find-steed");
  for (let slot = 2; slot <= 5; slot++) for (const type of ["celestial", "fey", "fiend"]) {
    const s = structuredClone(base), at = spot(s, s.entities.ven.pos, 4, 5, "giant-spider");
    assert.ok(s.entities.ven.slots[slot] > 0, "the Paladin has the slot");
    const r = ok(castAt(s, "find-steed", slot, { type, at: [at] }));
    const id = made(r), e = s.entities[id], say = `level ${slot} ${type}`;
    assert.deepEqual([e.ac, e.maxHp, e.size, e.type, e.speed], [10 + slot, 5 + 10 * slot, "large", type, 60], say);
    assert.deepEqual(e.speeds ?? {}, slot >= 4 ? { fly: 60 } : {}, say);
    assert.equal(e.actions.find((a) => a.id === "otherworldly-slam").effects[0].bonus, caster.attack);
    assert.deepEqual(e.bond, { to: "ven", kind: "steed", source: "find-steed", fx: null, turn: "after", orders: "free", at0: "vanish", ends: ["masterDies"], slot, commanded: null, auto: false });
    assert.ok(r.events.some((x) => x.type === "manual" && x.partial && x.name === "Find Steed"), "the DM is told what the engine does not do");
    // The steed disappears if the caster dies.
    const t = structuredClone(s);
    t.entities.ven.dead = true;
    const gone = ok(apply(t, { type: "advanceTime", minutes: 1 }, DM));
    assert.ok(!t.entities[id] && gone.events.some((x) => x.type === "vanished" && x.why === "master"), say);
    ok(apply(s, { type: "setHp", actor: id, hp: 0 }, DM));
    assert.ok(!s.entities[id], "it disappears at 0 Hit Points");
  }
  const s = structuredClone(base), at = spot(s, s.entities.ven.pos, 4, 5, "giant-spider");
  refused(s, { type: "cast", actor: "ven", spell: "find-steed", slot: 2, summon: { type: "undead", at: [at] } }, PAT, /celestial, fey, fiend/);
  refused(s, { type: "cast", actor: "ven", spell: "find-steed", slot: 2, summon: { at: [at] } }, PAT, /creature type/);
});

test("Phantom Steed (SRD lines 29404-29428): a Riding Horse with a Speed of 100, kept for an hour, on one slot", () => {
  const s = table("wizard", ["phantom-steed"]), at = spot(s, s.entities.ven.pos, 4, 5, "giant-spider");
  const horse = CONTENT.monsters["riding-horse"];
  const r = ok(castAt(s, "phantom-steed", 3, { at: [at] }));
  const id = made(r), e = s.entities[id];
  assert.deepEqual([e.tpl, e.size, e.speed, e.ac, e.maxHp], ["riding-horse", horse.size, 100, horse.ac, horse.hp], "the Riding Horse block, Speed 100");
  assert.equal(horse.speed.walk, 60, "the pack's horse is unchanged");
  const fx = s.effects.find((x) => x.spell === "phantom-steed");
  assert.ok(fx && !fx.conc, "an hour, no Concentration");
  assert.ok(fx.parts.some((p) => p.summon && p.target === id));
  assert.ok(r.events.some((x) => x.type === "manual" && x.partial && x.name === "Phantom Steed"), "the DM is told it ends when the steed takes damage, and the riding");
  ok(apply(s, { type: "endEffect", effect: fx.id }, PAT));
  assert.ok(!s.entities[id], "the steed goes when the spell ends");
});

test("Find Familiar (SRD lines 26772-26822): any CR 0 Beast form as a Celestial, Fey or Fiend; it cannot attack; at 0 Hit Points it disappears", () => {
  const base = table("wizard", ["find-familiar"]);
  for (const form of ["bat", "cat", "frog", "hawk", "lizard", "owl", "rat", "raven", "spider", "weasel"]) for (const type of ["celestial", "fey", "fiend"]) {
    const s = structuredClone(base), at = spot(s, s.entities.ven.pos, 2, 1);
    const r = ok(castAt(s, "find-familiar", 1, { form, type, at: [at] }));
    const id = made(r), e = s.entities[id], m = CONTENT.monsters[form], say = `${form} as ${type}`;
    assert.deepEqual([e.tpl, e.type, e.maxHp, e.ac, e.size], [form, type, m.hp, m.ac, m.size], say);
    assert.deepEqual([e.bond.kind, e.bond.turn, e.bond.at0, e.bond.noAttack, e.bond.fx], ["familiar", "own", "vanish", true, null], say);
    assert.equal(e.side, "party");
    // It can't attack.
    const atk = e.actions.find((a) => a.effects?.some((x) => x.attack));
    if (atk) refused(s, { type: "attack", actor: id, action: atk.id, target: "fighter" }, PAT);
    ok(apply(s, { type: "setHp", actor: id, hp: 0 }, DM));
    assert.ok(!s.entities[id], "it disappears at 0 Hit Points");
  }
  const s = structuredClone(base), at = spot(s, s.entities.ven.pos, 2, 1);
  refused(s, { type: "cast", actor: "ven", spell: "find-familiar", slot: 1, summon: { form: "wolf", type: "fey", at: [at] } }, PAT, /Choose a form/);        // not CR 0
  refused(s, { type: "cast", actor: "ven", spell: "find-familiar", slot: 1, summon: { form: "owl", type: "beast", at: [at] } }, PAT, /celestial, fey, fiend/);   // it is not a Beast
  refused(s, { type: "cast", actor: "ven", spell: "find-familiar", slot: 1, summon: { form: "octopus", type: "fey", at: [at] } }, PAT, /Choose a form/);        // the SRD has no Octopus block
  assert.equal(CONTENT.monsters.octopus, undefined);
  assert.match(CONTENT.spells["find-familiar"].text, /No Octopus/);
});

test("Unseen Servant stays manual: a block with only Strength, no turn and commands are not in the vocabulary yet", () => {
  const sp = CONTENT.spells["unseen-servant"];
  assert.equal(sp.tier, "manual");
  assert.ok(sp.effects.every((x) => "manual" in x));
  assert.equal(CONTENT.summons["unseen-servant"], undefined);
  // The SRD (lines 31898-31922) gives AC 10, 1 Hit Point and Strength 2 and nothing else: the text says exactly that.
  assert.match(sp.effects[0].manual, /AC 10, 1 Hit Point and Strength 2/);
});

// ---------- a cast with no pick (what the client sends until C8): what a player is told (#331 review, M1/M2) ----------

const LINE = (name) => `${name}: the DM adds what it summons.`;
const NO_PICK = [["find-familiar", "Find Familiar", 1, "wizard"], ["phantom-steed", "Phantom Steed", 3, "wizard"], ["animate-objects", "Animate Objects", 5, "wizard"], ["summon-dragon", "Summon Dragon", 5, "wizard", { choice: "cold" }]];

test("a player caster with no pick gets one short public line, no numbers and no creature; the DM gets the detail", () => {
  for (const [id, name, slot, cls, more] of NO_PICK) {
    const s = table(cls, [id]), seq = s.seq, n = Object.keys(s.entities).length;
    const r = ok(castAt(s, id, slot, undefined, more));
    assert.equal(Object.keys(s.entities).length, n, "nothing is made");
    assert.ok(!r.events.some((x) => x.type === "summoned"));
    const mine = viewEvents(r.events, s, PAT).filter((x) => x.type === "manual");
    assert.deepEqual(mine.map((x) => x.text), [LINE(name)], name);
    assert.ok(!/\d|made|appears/.test(mine[0].text.replace(name, "")), "no numbers, no claim of a creature");
    const dm = r.events.filter((x) => x.type === "manual" && x.partial);
    assert.ok(dm.length >= 1 && dm[0].text.includes("nothing picked") && dm[0].text.includes("The DM"), name);
    assert.ok(s.seq >= seq);
  }
});

test("a foe's cast with no pick, seen or hidden, tells the players no line (what a foe does by hand is the DM's to tell)", () => {
  for (const hidden of [false, true]) {
    const s = table("wizard", ["phantom-steed"]);
    const d = derive(sheet("wizard", ["phantom-steed"], { name: "Mira" }));
    s.entities.mira = makeEntity(d.record, { id: "mira", kind: "npc", side: "foe", pos: { ...spot(s, s.entities.ven.pos, 3, 3), z: 0 } });
    if (hidden) s.entities.mira.hidden = true;
    const plain = structuredClone(s);
    const r = ok(apply(s, { type: "cast", actor: "mira", spell: "phantom-steed", slot: 3 }, DM));
    const mine = viewEvents(r.events, s, PAT);
    assert.ok(!mine.some((x) => x.type === "manual") && !json(mine).includes("DM adds"), "no line, as for any foe's hand-applied spell");
    if (hidden) assert.ok(!json(mine).includes("mira") && !json(view(s, PAT)).includes("Mira"), "and a hidden one is not named");
    else assert.ok(view(s, PAT).entities.mira, "the foe is in the party's view");
    // The same cast of a plain manual spell tells the players exactly as much.
    const twin = structuredClone(plain); twin.entities.mira.spells = ["fireball"];
    assert.ok(!viewEvents(ok(apply(twin, { type: "cast", actor: "mira", spell: "fireball", slot: 3, hex: { q: 9, r: 9 } }, DM)).events, twin, PAT).some((x) => x.type === "manual"));
  }
});
