// Wave 1 of issue #786: the fight spells the party and the first module's NPCs use (Faerie Fire, Heat Metal, Searing Smite, Spiritual Weapon, Guardian of
// Faith, Flame Blade). Built to docs/specs/rules-expansion.md, "Build notes: wave 1 fight spells (#786)". Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { derive } from "../src/derive.js";
import { apply, current, makeEntity } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { view } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
const SHEETS = {
  cleric: { name: "Cy", class: "cleric", level: 9, subclass: "life", abilities: { str: 10, dex: 12, con: 14, int: 10, wis: 18, cha: 12 }, skills: ["medicine", "religion"], spells: ["guardian-of-faith", "spiritual-weapon"] },
  druid: { name: "Dru", class: "druid", level: 5, subclass: "land", abilities: { str: 10, dex: 12, con: 14, int: 10, wis: 18, cha: 8 }, skills: ["nature", "perception"], spells: ["flame-blade"] },
  bard: { name: "Bo", class: "bard", level: 5, subclass: "lore", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 18 }, skills: ["persuasion", "performance", "insight"], spells: ["faerie-fire", "heat-metal"] },
};

// A table of open grass: the valley's fighter beside a caster at the origin, and a goblin four hexes off.
function table(sheet = SHEETS.bard, id = "bo", seed = 5) {
  const s = newGame(seed);
  for (const k of Object.keys(s.entities)) if (k !== "fighter") delete s.entities[k];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  s.entities[id] = makeEntity(derive(sheet).record, { id, kind: "pc", side: "party", owner: "pat", ownerName: "Pat", pos: { q: 0, r: 0, z: 0 } });
  s.entities[id].sheet = structuredClone(sheet);
  s.entities.fighter.pos = { q: 3, r: 0, z: 0 };
  const g = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 4, r: 0 } }, DM)).events[0].id;
  return { s, g };
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
function until(s, id, guard = 40) {
  const out = [];
  for (let i = 0; i < guard && current(s) !== id; i++) out.push(...ok(apply(s, { type: "endTurn", actor: current(s) }, DM)).events);
  assert.equal(current(s), id);
  return out;
}
const live = (s, spell) => s.effects.find((fx) => fx.spell === spell);
const lint = (def) => lintEntry("spells", def, { strict: false });

test("Faerie Fire: a creature that fails the Dexterity save is outlined: Advantage against it when the attacker can see it, no benefit from Invisible, Dim Light", () => {
  const def = SPELLS["faerie-fire"].def;
  assert.equal(def.tier, "assist");
  assert.deepEqual(lint(def), []);
  assert.ok(def.effects.some((x) => "manual" in x), "the objects in the cube are the DM's");
  const { s, g } = table();
  s.entities[g].abil.dex = 1;                                    // -5: the DC 15 save fails on anything under a natural 20
  fight(s);
  const r = ok(apply(s, { type: "cast", actor: "bo", spell: "faerie-fire", slot: 1, hex: { q: 4, r: 0 } }, DM));
  assert.ok(r.events.some((e) => e.type === "save" && e.id === g && !e.success), json(r.events.filter((e) => e.type === "save")));
  const fx = live(s, "faerie-fire");
  assert.ok(fx.parts.some((p) => p.target === g && p.modifier?.on === "attack.received"));
  assert.ok(fx.parts.some((p) => p.target === g && p.light), "it sheds light");
  assert.deepEqual([s.entities[g].light.bright, s.entities[g].light.dim], [0, 10]);
  assert.equal(s.entities.fighter.light, undefined, "the fighter was outside the cube");
  // The fighter attacks it with Advantage.
  until(s, "fighter");
  const a = ok(apply(s, { type: "attack", actor: "fighter", target: g, attack: "longsword" }, DM));
  assert.equal(a.events.find((e) => e.type === "attack")?.mode, "adv", json(a.events.find((e) => e.type === "attack")));
});

test("Faerie Fire: an Invisible creature that fails the save gets nothing from it, and one that makes the save keeps it", () => {
  const { s, g } = table();
  s.entities[g].abil.dex = 1;
  ok(apply(s, { type: "condition", actor: g, condition: "invisible" }, DM));
  fight(s);
  ok(apply(s, { type: "cast", actor: "bo", spell: "faerie-fire", slot: 1, hex: { q: 4, r: 0 } }, DM));
  until(s, "fighter");
  const a = ok(apply(s, { type: "attack", actor: "fighter", target: g, attack: "longsword" }, DM));
  const ev = a.events.find((e) => e.type === "attack");
  assert.equal(ev.mode, "adv", `Invisible but outlined: the attacker sees it (${json(ev)})`);
});

test("Faerie Fire: a creature that makes the save is not outlined, and Advantage needs an attacker who can see", () => {
  const { s, g } = table();
  s.entities[g].abil.dex = 40;                                   // +15: only a natural 1 could fail, and that is a miss of the DC by the numbers
  ok(apply(s, { type: "condition", actor: g, condition: "invisible" }, DM));
  fight(s);
  const r = ok(apply(s, { type: "cast", actor: "bo", spell: "faerie-fire", slot: 1, hex: { q: 4, r: 0 } }, DM));
  assert.ok(r.events.some((e) => e.type === "save" && e.id === g && e.success), json(r.events.filter((e) => e.type === "save")));
  assert.equal(live(s, "faerie-fire").parts.length, 0);
  assert.equal(s.entities[g].light, undefined);
  until(s, "fighter");
  const a = ok(apply(s, { type: "attack", actor: "fighter", target: g, attack: "longsword" }, DM));
  assert.equal(a.events.find((e) => e.type === "attack").mode, "dis", "still Invisible: the attacker cannot see it");
  // An outlined creature is attacked with Advantage only by an attacker that sees it: a Blinded one does not.
  const t2 = table();
  t2.s.entities[t2.g].abil.dex = 1;
  fight(t2.s);
  ok(apply(t2.s, { type: "cast", actor: "bo", spell: "faerie-fire", slot: 1, hex: { q: 4, r: 0 } }, DM));
  until(t2.s, "fighter");
  ok(apply(t2.s, { type: "condition", actor: "fighter", condition: "blinded" }, DM));
  const b = ok(apply(t2.s, { type: "attack", actor: "fighter", target: t2.g, attack: "longsword" }, DM));
  assert.equal(b.events.find((e) => e.type === "attack").mode, "dis", "Blinded: Disadvantage, and no Advantage from the light");
});

test("Faerie Fire: the light ends with the spell (Concentration lost), taking the outline off", () => {
  const { s, g } = table();
  s.entities[g].abil.dex = 1;
  fight(s);
  ok(apply(s, { type: "cast", actor: "bo", spell: "faerie-fire", slot: 1, hex: { q: 4, r: 0 } }, DM));
  assert.ok(s.entities[g].light);
  ok(apply(s, { type: "endEffect", actor: "bo", effect: live(s, "faerie-fire").id }, DM));
  assert.equal(live(s, "faerie-fire"), undefined);
  assert.equal(s.entities[g].light, undefined);
  until(s, "fighter");
  assert.equal(ok(apply(s, { type: "attack", actor: "fighter", target: g, attack: "longsword" }, DM)).events.find((e) => e.type === "attack").mode, "normal");
});

test("Heat Metal: 2d8 Fire to the creature holding the object, then a Constitution save: a success keeps it holding it with Disadvantage until the caster's next turn", () => {
  const def = SPELLS["heat-metal"].def;
  assert.equal(def.tier, "assist");
  assert.deepEqual(lint(def), []);
  const { s, g } = table();
  s.entities[g].abil.con = 40;                                   // +15: it makes the save
  fight(s);
  const hp = s.entities[g].hp;
  const r = ok(apply(s, { type: "cast", actor: "bo", spell: "heat-metal", slot: 2, target: g }, DM));
  const dmg = r.events.find((e) => e.type === "damage" && e.target === g);
  assert.equal(dmg.dtype ?? dmg.type, "fire", json(dmg));
  assert.ok(dmg.dice.length === 2 && dmg.dice.every((d) => d.sides === 8), json(dmg));
  assert.ok(s.entities[g].hp < hp || s.entities[g].dead);
  assert.ok(r.events.some((e) => e.type === "save" && e.id === g && e.abil === "con" && e.success));
  const fx = live(s, "heat-metal");
  assert.deepEqual(fx.parts.filter((p) => p.target === g).map((p) => p.modifier.on).sort(), ["attack.roll", "check"]);
  // Its next attack roll has Disadvantage; the caster's own next turn start ends it.
  s.entities[g].hp = s.entities[g].maxHp = 500;
  until(s, g);
  const a = ok(apply(s, { type: "act", actor: g, action: "scimitar", target: "fighter" }, DM));
  assert.equal(a.events.find((e) => e.type === "attack").mode, "dis", json(a.events.find((e) => e.type === "attack")));
  until(s, "bo");
  assert.ok(!live(s, "heat-metal").parts.some((p) => !p.ended && p.modifier), "ended at the start of the caster's turn");
  assert.ok(live(s, "heat-metal"), "the spell itself goes on (Concentration, a minute)");
});

test("Heat Metal: a failed save hands the drop to the DM; a higher slot adds a die; Concentration ending ends the Disadvantage", () => {
  const { s, g } = table();
  s.entities[g].abil.con = 1;                                    // -5
  s.entities[g].hp = s.entities[g].maxHp = 500;
  fight(s);
  const r = ok(apply(s, { type: "cast", actor: "bo", spell: "heat-metal", slot: 3, target: g }, DM));
  const dmg = r.events.find((e) => e.type === "damage" && e.target === g);
  assert.equal(dmg.dice.length, 3, "3d8 from a level 3 slot");
  assert.ok(r.events.some((e) => e.type === "save" && e.id === g && !e.success));
  assert.ok(r.events.some((e) => e.type === "manual" && /drops the red-hot object/.test(e.text)), "the DM moves the object");
  assert.equal(live(s, "heat-metal").parts.length, 0, "a failed save puts no Disadvantage on the engine's books: the DM decides whether it could drop it");
  assert.ok(r.events.some((e) => e.type === "manual" && /Bonus Action to deal the 2d8/.test(e.text)), "the repeat is the DM's");
});

// ---------- Searing Smite ----------
const paladin = (level = 5, more = {}) => ({ name: "Ka", class: "paladin", level, ...(level >= 3 ? { subclass: "devotion" } : {}), abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 16 },
  skills: ["athletics", "religion"], choices: { "fighting-style": "defense" }, armour: "chain-mail", weapons: ["longsword", "longbow", "handaxe"], spells: ["searing-smite"], ...more });
// A paladin beside a goblin with 500 Hit Points and Armor Class 1 (so the hit is certain), on its turn in a fight.
function smiter({ seed = 7, level = 5, con = 10 } = {}) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (!["rogue", "m1"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(paladin(level)).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 }, owner: "pat" });
  ok(apply(s, { type: "place", actor: "rogue", to: { q: -3, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "m1", to: { q: 1, r: 0 } }, DM));
  Object.assign(s.entities.m1, { hp: 500, maxHp: 500, ac: 1 });
  s.entities.m1.abil.con = con;
  fight(s);
  until(s, "hero");
  return s;
}
const smite = (s, slot) => ok(apply(s, { type: "attack", actor: "hero", target: "m1", attack: "longsword", onHit: [{ spell: "searing-smite", ...(slot ? { slot } : {}) }] }, DM));

test("Searing Smite is data: a hit spell, auto, with a turn-start damage and a save that ends it", () => {
  const def = SPELLS["searing-smite"].def;
  assert.equal(def.tier, "auto");
  assert.equal(def.concentration, false);
  assert.deepEqual(def.hit, { with: "melee" });
  assert.deepEqual(lint(def), []);
  const bad = (effects) => lint({ ...structuredClone(def), effects });
  assert.ok(bad([{ endSpell: true }]).some((p) => /endSpell/.test(p)), "endSpell only inside an eachTurn");
  assert.ok(bad([{ eachTurn: [{ save: "con", onFail: [{ damage: "1d6", type: "fire" }] }] }]).some((p) => /endSpell or manual/.test(p)));
  assert.ok(bad([{ eachTurn: [{ endSpell: 1 }] }]).some((p) => /endSpell/.test(p)));
});

test("Searing Smite: 1d6 fire with the hit, then 1d6 fire at the start of each of the target's turns and a Constitution save: a failure goes on", () => {
  const s = smiter({ con: 1 });                                  // -5: the DC 14 save fails on anything under a natural 19
  const hp0 = s.entities.m1.hp;
  const r = smite(s);
  const fire = r.events.filter((e) => e.type === "damage" && e.target === "m1");
  assert.ok(fire.some((e) => e.from === "Searing Smite" && e.dtype === "fire" && e.dice.length === 1), json(fire));
  assert.equal(s.entities.hero.slots[1], 3, "a level 1 slot spent");
  assert.equal(s.encounter.budget.bonus, 0, "and the Bonus Action");
  const fx = live(s, "searing-smite");
  assert.ok(fx, "a lasting effect");
  assert.equal(fx.conc, false);
  assert.equal(s.entities.m1.hp, hp0 - fire.reduce((n, e) => n + e.amount, 0));
  const before = s.entities.m1.hp;
  // The goblin's turn starts: 1d6 fire, then the save, failed, so the spell stays.
  const ev = until(s, "m1");
  const burn = ev.filter((e) => e.type === "damage" && e.target === "m1");
  assert.equal(burn.length, 1, json(burn));
  assert.equal(burn[0].dtype, "fire");
  assert.equal(burn[0].dice.length, 1);
  assert.equal(burn[0].dice[0].sides, 6);
  const sv = ev.find((e) => e.type === "save" && e.id === "m1");
  assert.equal(sv.abil, "con");
  assert.equal(sv.dc, 8 + 3 + 3, "8 + proficiency + Charisma modifier of a level 5 paladin with Charisma 16");
  assert.equal(sv.success, false, json(sv));
  assert.equal(s.entities.m1.hp, before - burn[0].amount);
  assert.ok(live(s, "searing-smite"), "a failure lets it go on");
  // And again on its next turn.
  ok(apply(s, { type: "endTurn", actor: "m1" }, DM));
  const ev2 = until(s, "m1");
  assert.equal(ev2.filter((e) => e.type === "damage" && e.target === "m1").length, 1);
});

test("Searing Smite: a successful save ends the spell, after that turn's damage, and nothing burns it again", () => {
  const s = smiter({ con: 40 });                                 // +15
  smite(s);
  assert.ok(live(s, "searing-smite"));
  const ev = until(s, "m1");
  assert.equal(ev.filter((e) => e.type === "damage" && e.target === "m1").length, 1, "the damage comes first");
  assert.ok(ev.find((e) => e.type === "save" && e.id === "m1").success);
  assert.ok(ev.some((e) => e.type === "effectEnd" && e.name === "Searing Smite"), json(ev.filter((e) => e.type === "effectEnd")));
  assert.equal(live(s, "searing-smite"), undefined);
  ok(apply(s, { type: "endTurn", actor: "m1" }, DM));
  const ev2 = until(s, "m1");
  assert.ok(!ev2.some((e) => e.type === "damage" && e.target === "m1"));
});

test("Searing Smite: a higher slot adds 1d6 to all of the damage (the hit and each turn); a Critical Hit doubles the hit's extra dice", () => {
  const s = smiter({ con: 1 });
  const r = smite(s, 2);
  const part = r.events.find((e) => e.type === "damage" && e.target === "m1" && e.from === "Searing Smite");
  assert.equal(part.dice.length, 2, "2d6 with the hit");
  assert.equal(s.entities.hero.slots[2], 1, "a level 2 slot");
  const burn = until(s, "m1").find((e) => e.type === "damage" && e.target === "m1");
  assert.equal(burn.dice.length, 2, "2d6 at the start of its turn");
  const c = smiter({ con: 1 });
  c.entities.hero.critOn = 2;
  const cr = smite(c);
  const cp = cr.events.find((e) => e.type === "damage" && e.target === "m1" && e.from === "Searing Smite");
  assert.equal(cp.dice.length, 2, "1d6 doubled on a Critical Hit");
  assert.equal(until(c, "m1").find((e) => e.type === "damage" && e.target === "m1").dice.length, 1, "the turns' damage is not doubled");
});

test("Searing Smite: a target the burning kills makes no save and the effect goes with it", () => {
  const s = smiter({ con: 40 });
  smite(s);
  s.entities.m1.hp = 1;
  const ev = until(s, "m1");
  assert.ok(s.entities.m1.dead || s.entities.m1.hp <= 0);
  assert.ok(!ev.some((e) => e.type === "save" && e.id === "m1"), "a dead creature makes no save");
});

// ---------- Guardian of Faith ----------
test("Guardian of Faith: a zone of 20 radiant damage (Dexterity save halves) on an enemy that enters or starts its turn near it, until it has dealt 60", () => {
  const def = SPELLS["guardian-of-faith"].def;
  assert.equal(def.tier, "assist");
  assert.equal(def.concentration, false);
  assert.deepEqual(def.zone, { on: ["enter", "turnStart"], once: "turn", budget: 60 });
  assert.deepEqual(lint(def), []);
  assert.ok(lint({ ...structuredClone(def), zone: { ...def.zone, budget: 0 } }).some((p) => /budget/.test(p)));
  const { s, g } = table(SHEETS.cleric, "cy");
  Object.assign(s.entities[g], { hp: 500, maxHp: 500 });
  s.entities[g].abil.dex = 1;                                    // -5: the DC 15 save fails on anything under a natural 20
  s.entities.fighter.pos = { q: -2, r: 0, z: 0 };
  fight(s);
  until(s, "cy");
  // Cast at the goblin's own hex: the area is laid out round that space and affects nobody as it appears.
  const hp0 = s.entities[g].hp;
  const r = ok(apply(s, { type: "cast", actor: "cy", spell: "guardian-of-faith", slot: 4, hex: { q: 3, r: 0 } }, DM));
  assert.ok(!r.events.some((e) => e.type === "damage"), "nobody is hurt as it appears");
  const fx = live(s, "guardian-of-faith");
  assert.equal(fx.conc, false);
  assert.equal(fx.lasts, "8 hours");
  assert.equal(fx.zone.budget, 60);
  assert.equal(fx.zone.spent, 0);
  assert.equal(s.entities[g].hp, hp0);
  // Its turn starts inside the area: a failed save, 20 radiant.
  const ev = until(s, g);
  const hurt = ev.filter((e) => e.type === "damage" && e.target === g);
  assert.equal(hurt.length, 1, json(hurt));
  assert.equal(hurt[0].amount, 20);
  assert.equal(hurt[0].dtype, "radiant");
  assert.equal(live(s, "guardian-of-faith").zone.spent, 20);
  // The caster takes nothing, and how much of the 60 is left is on the DM's books only: a player's view of the effect has its zone's shape (#842) and no budget or count.
  assert.equal(s.entities.cy.hp, s.entities.cy.maxHp);
  const seen = view(s, { role: "player", userId: "pat" }).effects.find((x) => x.spell === "guardian-of-faith");
  assert.ok(seen && seen.zone && !json(seen).includes("budget") && !json(seen).includes("spent"), json(seen));
});

test("Guardian of Faith: a success halves it; the guardian vanishes once 60 damage has been dealt, counting what was dealt", () => {
  const { s, g } = table(SHEETS.cleric, "cy");
  Object.assign(s.entities[g], { hp: 500, maxHp: 500 });
  s.entities.fighter.pos = { q: -2, r: 0, z: 0 };
  s.entities[g].abil.dex = 1;
  fight(s);
  until(s, "cy");
  ok(apply(s, { type: "cast", actor: "cy", spell: "guardian-of-faith", slot: 4, hex: { q: 3, r: 0 } }, DM));
  const fx = live(s, "guardian-of-faith");
  const total = () => fx.zone.spent;
  const dealt = [];
  let ended = false;
  for (let round = 0; round < 6 && !ended; round++) {
    const ev = until(s, g);
    for (const e of ev) { if (e.type === "damage" && e.target === g) dealt.push(e.amount); if (e.type === "effectEnd" && e.name === "Guardian of Faith") { ended = true; assert.equal(e.why, "it dealt 60 damage"); } }
    if (!ended) ok(apply(s, { type: "endTurn", actor: g }, DM));
  }
  assert.ok(ended, `it ended: ${dealt}`);
  assert.equal(dealt.reduce((a, b) => a + b, 0), 60, `20 + 20 + 20: ${dealt}`);
  assert.equal(live(s, "guardian-of-faith"), undefined);
  assert.ok(total() >= 60);
  // A creature that makes the save counts for half of 20, and 60 is reached in more turns.
  const t2 = table(SHEETS.cleric, "cy");
  Object.assign(t2.s.entities[t2.g], { hp: 500, maxHp: 500 });
  t2.s.entities.fighter.pos = { q: -2, r: 0, z: 0 };
  t2.s.entities[t2.g].abil.dex = 40;                             // +15: it makes every save
  fight(t2.s);
  until(t2.s, "cy");
  ok(apply(t2.s, { type: "cast", actor: "cy", spell: "guardian-of-faith", slot: 4, hex: { q: 3, r: 0 } }, DM));
  const half = until(t2.s, t2.g).filter((e) => e.type === "damage" && e.target === t2.g);
  assert.deepEqual(half.map((e) => e.amount), [10]);
  assert.equal(live(t2.s, "guardian-of-faith").zone.spent, 10);
});

test("Guardian of Faith: only an enemy is hurt: a creature on the caster's side takes no save and no damage", () => {
  const { s } = table(SHEETS.cleric, "cy");
  s.entities.fighter.pos = { q: 3, r: 1, z: 0 };                  // inside the area, on the caster's side
  fight(s);
  until(s, "cy");
  const r = ok(apply(s, { type: "cast", actor: "cy", spell: "guardian-of-faith", slot: 4, hex: { q: 3, r: 0 } }, DM));
  assert.ok(!r.events.some((e) => e.type === "save" || e.type === "damage"));
  const ev = until(s, "fighter");
  assert.ok(!ev.some((e) => (e.type === "save" || e.type === "damage") && (e.id === "fighter" || e.target === "fighter")), json(ev));
  assert.equal(live(s, "guardian-of-faith").zone.spent, 0);
});

// ---------- Spiritual Weapon ----------
const PAT = { role: "player", userId: "pat" };
test("Spiritual Weapon: a force in a space the caster names, commanded for its first turn: it moves 20 feet and makes the caster's spell attack for 1d8 plus the modifier", () => {
  const def = SPELLS["spiritual-weapon"].def;
  assert.equal(def.tier, "assist");
  assert.deepEqual(lint(def), []);
  assert.ok(lint({ ...structuredClone(def), effects: [{ summon: "spiritual-weapon", bond: { ...def.effects[0].bond, orders: "free", first: "commanded" } }] }).some((p) => /first/.test(p)));
  const { s, g } = table(SHEETS.cleric, "cy");
  Object.assign(s.entities[g], { hp: 500, maxHp: 500, ac: 1 });
  s.entities.fighter.pos = { q: -2, r: 0, z: 0 };
  s.entities.cy.owner = "pat";
  fight(s);
  until(s, "cy");
  const r = ok(apply(s, { type: "cast", actor: "cy", spell: "spiritual-weapon", slot: 2, summon: { at: [{ q: 2, r: 0 }] } }, PAT));
  const id = r.events.find((e) => e.type === "summoned").id, w = s.entities[id];
  assert.equal(s.encounter.budget.bonus, 0, "the cast took the Bonus Action");
  assert.equal(live(s, "spiritual-weapon").conc, true);
  assert.deepEqual([w.bond.to, w.bond.orders, w.bond.turn, w.type], ["cy", "command", "after", "construct"]);
  assert.ok(w.bond.commanded && w.bond.commanded.order === null, "its first turn is commanded");
  assert.ok(r.events.some((e) => e.type === "manual" && e.name === "Spiritual Weapon"), "the DM is told what the engine does not do");
  // It acts straight after the caster, and the caster's player plays it: move 20 feet, then attack.
  const ev = ok(apply(s, { type: "endTurn", actor: "cy" }, PAT)).events;
  assert.equal(current(s), id, json(ev.filter((e) => e.type === "turn")));
  assert.ok(ev.some((e) => e.type === "commandedTurn" && e.id === id && e.to === "pat"), json(ev));
  ok(apply(s, { type: "move", actor: id, to: { q: 3, r: 0 } }, PAT));
  const a = ok(apply(s, { type: "act", actor: id, action: "force-strike", target: g }, PAT));
  const at = a.events.find((e) => e.type === "attack");
  assert.equal(at.bonus, 4 + 4, "the caster's spell attack bonus: Proficiency Bonus 4 and Wisdom 18");
  assert.ok(at.hit, json(at));
  const d = a.events.find((e) => e.type === "damage" && e.target === g);
  assert.equal(d.dtype, "force");
  assert.equal(d.dice.length, 1);
  assert.equal(d.dice[0].sides, 8);
  assert.equal(d.bonus, 4, "plus the cleric's Wisdom modifier (18)");
  // Nothing hurts it: immune to every damage type, and to every condition.
  assert.equal(w.immune.length, 13);
  assert.ok(w.conditionImmune.includes("prone") && w.conditionImmune.includes("stunned"));
});

test("Spiritual Weapon: 1d8 more for each slot level above 2; a later turn needs a Bonus Action to command it; it goes with Concentration", () => {
  const { s, g } = table(SHEETS.cleric, "cy");
  Object.assign(s.entities[g], { hp: 500, maxHp: 500, ac: 1 });
  s.entities.fighter.pos = { q: -2, r: 0, z: 0 };
  s.entities.cy.owner = "pat";
  fight(s);
  until(s, "cy");
  const r = ok(apply(s, { type: "cast", actor: "cy", spell: "spiritual-weapon", slot: 4, summon: { at: [{ q: 3, r: 1 }] } }, PAT));
  const id = r.events.find((e) => e.type === "summoned").id;
  ok(apply(s, { type: "endTurn", actor: "cy" }, PAT));
  ok(apply(s, { type: "move", actor: id, to: { q: 3, r: 0 } }, PAT));
  const a = ok(apply(s, { type: "act", actor: id, action: "force-strike", target: g }, PAT));
  const parts = a.events.filter((e) => e.type === "damage" && e.target === g);
  assert.deepEqual(parts.map((e) => [e.dice.length, e.dice[0].sides, e.bonus]), [[1, 8, 4], [1, 8, 0], [1, 8, 0]], "1d8 plus the modifier, and two more d8 from a level 4 slot");
  ok(apply(s, { type: "endTurn", actor: id }, PAT));
  // The next round: not commanded, it is not the player's; a Bonus Action from the caster commands it.
  until(s, "cy");
  assert.equal(s.entities.cy.owner, "pat");
  ok(apply(s, { type: "command", actor: "cy", ids: [id], order: "strike the goblin" }, PAT));
  assert.equal(s.encounter.budget.bonus, 0, "commanding it takes the Bonus Action");
  ok(apply(s, { type: "endTurn", actor: "cy" }, PAT));
  assert.equal(current(s), id);
  const b = ok(apply(s, { type: "act", actor: id, action: "force-strike", target: g }, PAT));
  assert.ok(b.events.some((e) => e.type === "attack" && e.actor === id));
  ok(apply(s, { type: "endTurn", actor: id }, PAT));
  // Not commanded on the round after: the player may not play it.
  until(s, "cy");
  ok(apply(s, { type: "endTurn", actor: "cy" }, PAT));
  assert.equal(current(s), id);
  const c = apply(s, { type: "act", actor: id, action: "force-strike", target: g }, PAT);
  assert.equal(c.ok, false, "an order was not given for this turn");
  ok(apply(s, { type: "endTurn", actor: id }, DM));
  // Losing Concentration takes it away.
  until(s, "cy");
  const e = ok(apply(s, { type: "endEffect", actor: "cy", effect: live(s, "spiritual-weapon").id }, DM));
  assert.ok(!s.entities[id], json(e.events.map((x) => x.type)));
});

// ---------- Flame Blade ----------
test("Flame Blade: the caster gets a melee spell attack for 3d6 fire plus the modifier, a light, and both go with the spell", () => {
  const def = SPELLS["flame-blade"].def;
  assert.equal(def.tier, "assist");
  assert.deepEqual(lint(def), []);
  assert.deepEqual(def.effects[0], { arm: { damage: "3d6", type: "fire", addMod: true } });
  const bad = (arm, extra = {}) => lint({ ...structuredClone(def), ...extra, effects: [{ arm }] });
  assert.ok(bad({ damage: "x", type: "fire" }).some((p) => /arm.damage/.test(p)));
  assert.ok(bad({ damage: "1d6", type: "mauve" }).some((p) => /arm.type/.test(p)));
  assert.ok(bad({ damage: "1d6", type: "fire", time: "reaction" }).some((p) => /arm.time/.test(p)));
  assert.ok(bad({ damage: "1d6", type: "fire" }, { duration: "instant", concentration: false }).some((p) => /arm/.test(p)));
  const { s, g } = table(SHEETS.druid, "dru");
  Object.assign(s.entities[g], { hp: 500, maxHp: 500, ac: 1 });
  s.entities.fighter.pos = { q: -2, r: 0, z: 0 };
  s.entities.dru.owner = "pat";
  s.entities.dru.pos = { q: 3, r: 0, z: 0 };
  fight(s);
  until(s, "dru");
  const r = ok(apply(s, { type: "cast", actor: "dru", spell: "flame-blade", slot: 2 }, PAT));
  assert.ok(!r.events.some((e) => e.type === "manual" && !e.partial && /engine cannot/.test(e.text)));
  const fx = live(s, "flame-blade");
  assert.equal(fx.conc, true);
  assert.ok(fx.parts.some((p) => p.arm === "flame-blade" && p.target === "dru"));
  assert.deepEqual([s.entities.dru.light.bright, s.entities.dru.light.dim], [10, 10]);
  const act = s.entities.dru.actions.find((x) => x.id === "flame-blade");
  assert.equal(act.armed, fx.id);
  assert.equal(act.time, "action");
  // The Bonus Action went on the cast; the attack is a Magic action: an `attack` with the spell's id.
  assert.equal(s.encounter.budget.bonus, 0);
  assert.equal(s.encounter.budget.action, 1);
  const a = ok(apply(s, { type: "attack", actor: "dru", target: g, attack: "flame-blade" }, PAT));
  const at = a.events.find((e) => e.type === "attack");
  assert.equal(at.bonus, 3 + 4, "the spell attack bonus of a level 5 druid with Wisdom 18: Proficiency 3 and +4");
  assert.ok(at.hit, json(at));
  const parts = a.events.filter((e) => e.type === "damage" && e.target === g);
  assert.equal(parts.length, 1);
  assert.deepEqual([parts[0].dice.length, parts[0].dice[0].sides, parts[0].bonus, parts[0].dtype], [3, 6, 4, "fire"]);
  assert.equal(s.encounter.budget.action, 0, "it took the action");
  // Next round, and again: the blade lasts while the spell does. The spell ending takes it away.
  until(s, "dru");
  assert.ok(s.entities.dru.actions.some((x) => x.id === "flame-blade"));
  ok(apply(s, { type: "endEffect", actor: "dru", effect: fx.id }, DM));
  assert.ok(!s.entities.dru.actions.some((x) => x.id === "flame-blade"));
  assert.equal(s.entities.dru.light, undefined);
  const gone = apply(s, { type: "attack", actor: "dru", target: g, attack: "flame-blade" }, PAT);
  assert.equal(gone.ok, false);
});

test("Flame Blade: a higher slot adds 1d6; casting it again replaces the first", () => {
  const { s, g } = table(SHEETS.druid, "dru");
  Object.assign(s.entities[g], { hp: 500, maxHp: 500, ac: 1 });
  s.entities.fighter.pos = { q: -2, r: 0, z: 0 };
  s.entities.dru.owner = "pat";
  s.entities.dru.pos = { q: 3, r: 0, z: 0 };
  fight(s);
  until(s, "dru");
  ok(apply(s, { type: "cast", actor: "dru", spell: "flame-blade", slot: 3 }, PAT));
  assert.equal(s.entities.dru.actions.find((x) => x.id === "flame-blade").effects[0].onHit[0].damage, "4d6+4");
  const a = ok(apply(s, { type: "attack", actor: "dru", target: g, attack: "flame-blade" }, PAT));
  const hit = a.events.find((e) => e.type === "damage" && e.target === g);
  assert.equal(hit.dice.length, a.events.find((e) => e.type === "attack").crit ? 8 : 4, "4d6, doubled on a Critical Hit");
  // A second casting (next turn, a level 2 slot) replaces the first: one blade, one effect.
  ok(apply(s, { type: "endTurn", actor: "dru" }, PAT));
  until(s, "dru");
  ok(apply(s, { type: "cast", actor: "dru", spell: "flame-blade", slot: 2 }, PAT));
  assert.equal(s.entities.dru.actions.filter((x) => x.id === "flame-blade").length, 1);
  assert.equal(s.entities.dru.actions.find((x) => x.id === "flame-blade").effects[0].onHit[0].damage, "3d6+4");
  assert.equal(s.effects.filter((fx) => fx.spell === "flame-blade").length, 1, "Concentration: the first cast ended");
});
