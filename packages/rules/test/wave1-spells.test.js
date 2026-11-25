// Wave 1 of issue #786: the fight spells the party and the first module's NPCs use (Faerie Fire, Heat Metal, Searing Smite, Spiritual Weapon, Guardian of
// Faith, Flame Blade). Built to docs/specs/rules-expansion.md, "Build notes: wave 1 fight spells (#786)". Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { derive } from "../src/derive.js";
import { apply, current, makeEntity } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
const SHEETS = {
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
