// Magic items (SRD 5.2.1 "Magic Items", #189): the pack's items, items on a sheet, what they change through
// derive() and modifiers.js, wearing and Attunement by the SRD's rules, giving them, loot, views and the
// state version.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { importFgxml } from "../src/import-fgxml.js";
import { CONTENT, PACKS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";
import { modifiers } from "../src/modifiers.js";
import { migrate, VERSION } from "../src/migrate.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const SAM = { role: "player", userId: "sam" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); };
const srd = PACKS[0];
const A = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 };
const fighter = (items, more = {}) => ({ name: "Brenna", class: "fighter", level: 5, subclass: "champion", abilities: A, skills: ["athletics", "perception"],
  choices: { "fighting-style": "defense" }, weapons: ["longbow"], ...(items ? { items } : {}), ...more });
const wizard = (items, more = {}) => ({ name: "Tavin", class: "wizard", level: 5, subclass: "evoker", abilities: { ...A, int: 16, str: 8 }, skills: ["arcana", "history"],
  weapons: ["dagger"], spells: ["fire-bolt"], ...(items ? { items } : {}), ...more });
const rec = (sheet) => derive(sheet).record;
const problems = (sheet) => validate(sheet).join("\n");

// A table with the sheet's character as "hero", Pat's, and the goblin m1 beside it.
function field(sheet) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (!["m1", "rogue"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(rec(sheet), { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 }, owner: "pat", ownerName: "Pat" });
  s.entities.hero.sheet = structuredClone(sheet);
  ok(apply(s, { type: "place", actor: "m1", to: { q: 1, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "rogue", to: { q: -2, r: 0 } }, DM));
  return s;
}

test("the pack's magic items: linted, checked, numbers as the SRD gives them", () => {
  assert.equal(srd.items.length, 75);
  assert.ok(srd.items.every((i) => i.checked));
  assert.deepEqual(lintPack(srd), []);
  const I = CONTENT.items;
  assert.deepEqual(["weapon-plus-1", "weapon-plus-2", "weapon-plus-3"].map((id) => [I[id].bonus, I[id].rarity]), [[1, "uncommon"], [2, "rare"], [3, "very-rare"]]);
  assert.deepEqual(["armor-plus-1", "armor-plus-2", "armor-plus-3"].map((id) => I[id].rarity), ["rare", "very-rare", "legendary"]);
  assert.deepEqual(["shield-plus-1", "shield-plus-2", "shield-plus-3"].map((id) => I[id].rarity), ["uncommon", "rare", "very-rare"]);
  assert.deepEqual(Object.values(I).filter((i) => i.id.startsWith("belt-of-giant")).map((i) => i.grants.setAbility.str), [21, 23, 25, 27, 29]);
  assert.deepEqual(["potion-of-healing", "potion-of-healing-greater", "potion-of-healing-superior", "potion-of-healing-supreme"].map((id) => I[id].activate[0].effects[0].heal), ["2d4+2", "4d4+4", "8d4+8", "10d4+20"]);
  assert.equal(I["ring-of-protection"].attune, true);
  assert.equal(I["ring-of-resistance"].attune, undefined, "a Ring of Resistance needs no Attunement");
  assert.deepEqual(I["staff-of-healing"].attune, { by: ["bard", "cleric", "druid"] });
});

test("the linter refuses a broken item", () => {
  const withItem = (id, change) => { const i = structuredClone(CONTENT.items[id]); change(i); return lintPack({ ...srd, items: [i] }).join("\n"); };
  assert.match(withItem("weapon-plus-1", (i) => { i.base = { weapon: ["laser-sword"] }; }), /base.weapon is/);
  assert.match(withItem("weapon-plus-1", (i) => { i.bonus = 4; }), /bonus is 1 to 3/);
  assert.match(withItem("ring-of-protection", (i) => { i.wear = "tail"; }), /wear is one of/);
  assert.match(withItem("ring-of-protection", (i) => { i.attune = "yes"; }), /attune is true/);
  assert.match(withItem("ring-of-protection", (i) => { i.grants = { extraAttack: 1 }; }), /does not grant "extraAttack"/);
  assert.match(withItem("ring-of-resistance", (i) => { delete i.variant; }), /"chosen" damage type goes with variant/);
  assert.match(withItem("chime-of-opening", (i) => { i.activate[0].spell = "open-sesame"; }), /not in the pack/);
  assert.match(withItem("potion-of-healing", (i) => { i.activate[0].cost = 1; }), /cost is charges/);
  assert.match(withItem("bag-of-holding", (i) => { i.tier = "auto"; }), /marked auto but gives nothing/);
});

test("a sheet with no items derives as before; magic armour, a Shield and weapons add their bonus", () => {
  const plain = fighter(undefined, { armour: "plate-armor" });
  assert.deepEqual(rec({ ...plain, items: [] }), rec(plain));
  const r = rec(fighter([{ id: "i1", item: "armor-plus-1", base: "plate-armor", equipped: true }, { id: "i2", item: "shield-plus-2", equipped: true }, { id: "i3", item: "weapon-plus-2", base: "greatsword", equipped: true }]));
  assert.equal(r.ac, 18 + 2 + 1 + 1 + 2, "Plate 18, Shield 2, Defense 1, +1 armour, +2 Shield");
  assert.equal(r.armour, "heavy"); assert.equal(r.shield, true);
  const gs = r.attacks.find((a) => a.id === "item-i3");
  assert.deepEqual([gs.name, gs.bonus, gs.damage, gs.dtype, gs.weapon], ["Greatsword +2", 3 + 3 + 2, "2d6+5", "slashing", "greatsword"]);
  // Carried and not worn: nothing.
  assert.equal(rec(fighter([{ id: "i1", item: "weapon-plus-2", base: "greatsword" }])).attacks.some((a) => a.id === "item-i1"), false);
});

test("an item that needs Attunement gives only its mundane item without it (Sun Blade)", () => {
  const blade = (attuned) => rec(fighter([{ id: "i1", item: "sun-blade", equipped: true, ...(attuned ? { attuned: true } : {}) }])).attacks.find((a) => a.id === "item-i1");
  const off = blade(false), on = blade(true);
  assert.deepEqual([off.bonus, off.damage, off.dtype, off.finesse], [6, "1d8+3", "slashing", undefined]);
  assert.deepEqual([on.bonus, on.damage, on.dtype, on.finesse], [8, "1d8+5", "radiant", true]);
  assert.equal(rec(fighter([{ id: "i1", item: "ring-of-protection", equipped: true }])).ac, rec(fighter()).ac, "a Ring of Protection not attuned does nothing");
});

test("Armor Class, scores, speeds and senses from items flow into the record", () => {
  const base = rec(fighter());
  const r = rec(fighter([{ id: "i1", item: "ring-of-protection", equipped: true, attuned: true }, { id: "i2", item: "cloak-of-protection", equipped: true, attuned: true },
    { id: "i3", item: "amulet-of-health", equipped: true, attuned: true }, { id: "i4", item: "ring-of-swimming", equipped: true }, { id: "i5", item: "goggles-of-night", equipped: true }]));
  assert.equal(r.ac, base.ac + 2, "Ring and Cloak of Protection: +1 each, in the AC shown");
  assert.equal(r.abil.con, 19);
  assert.equal(r.hp, base.hp + 5 * 2, "Constitution 14 to 19: +2 a level");
  assert.deepEqual(r.speeds, { swim: 40 });
  assert.equal(r.senses.darkvision, 60);
  assert.equal(rec(fighter([{ id: "i1", item: "goggles-of-night", equipped: true }], { senses: { darkvision: 60 } })).senses.darkvision, 120, "60 feet more");
  assert.equal(rec(fighter([{ id: "i1", item: "amulet-of-health", equipped: true, attuned: true }], { abilities: { ...A, con: 20 } })).abil.con, 20, "no effect at 19 or more");
  // A belt and gauntlets: the higher; an Ioun Stone's +2 stops at 20 and does not lower a higher score.
  const str = rec(fighter([{ id: "i1", item: "belt-of-giant-strength-hill", equipped: true, attuned: true }, { id: "i2", item: "gauntlets-of-ogre-power", equipped: true, attuned: true }])).abil.str;
  assert.equal(str, 21);
  assert.equal(rec(fighter([{ id: "i1", item: "ioun-stone-strength", equipped: true, attuned: true }], { abilities: { ...A, str: 19 } })).abil.str, 20);
  // Bracers of Defense: only with no armour and no Shield.
  const monk = { name: "Ana", class: "monk", level: 5, subclass: "open-hand", abilities: { ...A, dex: 16, wis: 14 }, skills: ["acrobatics", "insight"] };
  assert.equal(rec({ ...monk, items: [{ id: "i1", item: "bracers-of-defense", equipped: true, attuned: true }] }).ac, rec(monk).ac + 2);
  assert.equal(rec(fighter([{ id: "i1", item: "bracers-of-defense", equipped: true, attuned: true }], { armour: "chain-mail" })).ac, rec(fighter(undefined, { armour: "chain-mail" })).ac);
  // Elven Chain: a wizard is trained with it.
  assert.equal(problems(wizard([{ id: "i1", item: "elven-chain", base: "chain-shirt", equipped: true }])), "");
  assert.match(problems(wizard([{ id: "i1", item: "armor-plus-1", base: "chain-shirt", equipped: true }])), /no training with medium armour/);
});

test("worn items work through apply(): resistance of the ring's type, cold cut, immunity, saves and checks", () => {
  const s = field(fighter([{ id: "i1", item: "ring-of-resistance", type: "fire", equipped: true }, { id: "i2", item: "periapt-of-proof-against-poison", equipped: true, attuned: true },
    { id: "i3", item: "ring-of-protection", equipped: true, attuned: true }, { id: "i4", item: "stone-of-good-luck", attuned: true }]));
  const e = s.entities.hero, hp = e.hp;
  ok(apply(s, { type: "harm", actor: "hero", amount: 10, dtype: "fire" }, DM));
  assert.equal(hp - e.hp, 5, "fire halved");
  ok(apply(s, { type: "harm", actor: "hero", amount: 10, dtype: "poison" }, DM));
  assert.equal(hp - e.hp, 5, "poison: none");
  no(apply(s, { type: "condition", actor: "hero", condition: "poisoned" }, DM), /immune to Poisoned/);
  assert.equal(modifiers(s, e, "save", { target: e }, "").add, 2, "Ring of Protection +1 and the Luckstone +1 on saves");
  const c = ok(apply(s, { type: "check", actor: "hero", skill: "history" }, PAT)).events.find((x) => x.type === "check");
  assert.equal(c.total - c.roll, 0 + 1, "Intelligence 10, not proficient, the Luckstone +1");
  const w = field(fighter([{ id: "i1", item: "ring-of-warmth", equipped: true, attuned: true }]));
  const before = w.entities.hero.hp;
  ok(apply(w, { type: "harm", actor: "hero", amount: 4, dtype: "cold" }, DM));
  assert.ok(before - w.entities.hero.hp <= 2, "4 Cold damage less 2d8 (at least 2)");
});

test("wearing and Attunement by the SRD: one of a kind, three attuned, one copy, the prerequisite", () => {
  const rp = (id, more = {}) => ({ id, item: "ring-of-protection", equipped: true, attuned: true, ...more });
  assert.match(problems(fighter([{ id: "i1", item: "cloak-of-protection", equipped: true }, { id: "i2", item: "cloak-of-elvenkind", equipped: true }])), /One cloak at a time/);
  assert.match(problems(fighter([{ id: "i1", item: "armor-plus-1", base: "plate-armor", equipped: true }], { armour: "chain-mail" })), /one suit of armour at a time/);
  assert.match(problems(fighter([{ id: "i1", item: "shield-plus-1", equipped: true }], { shield: true })), /one Shield at a time/);
  assert.match(problems(fighter([rp("i1"), rp("i2")])), /two copies of Ring of Protection/);
  assert.match(problems(fighter([rp("i1"), { id: "i2", item: "cloak-of-protection", attuned: true }, { id: "i3", item: "amulet-of-health", attuned: true }, { id: "i4", item: "headband-of-intellect", attuned: true }])), /3 magic items at most/);
  assert.match(problems(fighter([{ id: "i1", item: "staff-of-healing", attuned: true }])), /Only a Bard, Cleric or Druid can attune to Staff of Healing/);
  assert.match(problems(fighter([{ id: "i1", item: "ring-of-swimming", attuned: true }])), /does not need Attunement/);
  const orbit = ["agility", "fortitude", "insight", "intellect"].map((k, i) => ({ id: `i${i + 1}`, item: `ioun-stone-${k}`, equipped: true }));
  assert.match(problems(fighter(orbit)), /Up to 3 Ioun Stones/);
  assert.match(problems(fighter([{ id: "i1", item: "weapon-plus-1" }])), /Choose what Weapon, \+1 is: any weapon/);
  assert.match(problems(fighter([{ id: "i1", item: "dwarven-plate", base: "chain-mail" }])), /can't be made from "chain-mail"/);
  assert.match(problems(fighter([{ id: "i1", item: "ring-of-resistance" }])), /Choose the damage type of Ring of Resistance/);
  assert.match(problems(fighter([{ id: "i1", item: "spell-scroll" }])), /Name the spell on the Spell Scroll/);
  assert.match(problems(wizard([{ id: "i1", item: "weapon-plus-1", base: "greatsword", equipped: true }])), /not proficient with the Greatsword/);
  assert.match(problems(fighter([{ id: "i1", item: "no-such-thing" }])), /no magic item "no-such-thing"/);
  assert.match(problems(fighter([{ id: "i1", item: "chime-of-opening", charges: 11 }])), /0 to 10 charges/);
});

test("give: a pack item joins a built character's sheet; a hand-typed one gets its name; take it back by key", () => {
  const s = field(fighter());
  const r = ok(apply(s, { type: "give", actor: "hero", item: "ring-of-resistance", damageType: "cold" }, DM));
  assert.deepEqual(s.entities.hero.sheet.items, [{ id: "i1", item: "ring-of-resistance", type: "cold" }]);
  assert.deepEqual(pick(r.events.find((x) => x.type === "gear")), { item: "Ring of Resistance (Cold)", key: "i1", pack: "ring-of-resistance" });
  no(apply(s, { type: "give", actor: "hero", item: "ring-of-resistance" }, DM), /Choose the damage type/);
  no(apply(s, { type: "give", actor: "hero", item: "Rope", base: "dagger" }, DM), /not a magic item/);
  ok(apply(s, { type: "give", actor: "rogue", item: "potion-of-healing" }, DM));
  assert.ok(s.entities.rogue.gear.includes("Potion of Healing"), "typed in by hand: the name only");
  ok(apply(s, { type: "give", actor: "hero", item: "Rope" }, DM));
  ok(apply(s, { type: "give", actor: "hero", item: "i1", take: true }, DM));
  assert.equal(s.entities.hero.sheet.items, undefined);
  assert.ok(s.entities.hero.gear.includes("Rope"), "gear handed over is kept when the character is made again");
});
const pick = (ev) => ({ item: ev.item, key: ev.key, pack: ev.pack });

test("equip: its controller or the DM, outside a fight; a refused change changes nothing", () => {
  const s = field(fighter([{ id: "i1", item: "cloak-of-protection", attuned: true }, { id: "i2", item: "cloak-of-elvenkind" }, { id: "i3", item: "potion-of-healing" }]));
  const ac = s.entities.hero.ac;
  no(apply(s, { type: "equip", actor: "hero", item: "i1" }, SAM), /isn't yours/);
  ok(apply(s, { type: "equip", actor: "hero", item: "i1" }, PAT));
  assert.equal(s.entities.hero.ac, ac + 1);
  const before = structuredClone(s.entities.hero);
  no(apply(s, { type: "equip", actor: "hero", item: "i2" }, PAT), /One cloak at a time/);
  no(apply(s, { type: "equip", actor: "hero", item: "i3" }, PAT), /nothing to put on/);
  assert.deepEqual(s.entities.hero, before);
  s.entities.hero.hp -= 7;
  ok(apply(s, { type: "equip", actor: "hero", item: "i1", on: false }, PAT));
  assert.equal(s.entities.hero.ac, ac);
  assert.equal(s.entities.hero.hp, s.entities.hero.maxHp - 7, "damage taken is kept");
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, DM));
  no(apply(s, { type: "equip", actor: "hero", item: "i1" }, PAT), /middle of a fight/);
});

test("attune: chosen by the player, made at the next Short Rest; a fourth item or a second copy fails there", () => {
  const s = field(fighter([{ id: "i1", item: "ring-of-protection", equipped: true }, { id: "i2", item: "staff-of-healing" }]));
  const ac = s.entities.hero.ac;
  no(apply(s, { type: "attune", actor: "hero", item: "i2" }, PAT), /Only a Bard, Cleric or Druid/);
  ok(apply(s, { type: "attune", actor: "hero", item: "i1" }, PAT));
  assert.deepEqual(s.entities.hero.sheet.attuning, { item: "i1" });
  assert.equal(s.entities.hero.ac, ac, "nothing until the rest");
  const r = ok(apply(s, { type: "shortRest", ids: ["hero"] }, DM));
  assert.deepEqual(r.events.filter((x) => x.type === "attuned").map((x) => [x.item, x.failed]), [["Ring of Protection", undefined]]);
  assert.equal(s.entities.hero.ac, ac + 1);
  assert.equal(s.entities.hero.sheet.attuning, undefined);
  no(apply(s, { type: "attune", actor: "hero", item: "i1" }, PAT), /already attuned/);
  // Ending it takes another Short Rest.
  ok(apply(s, { type: "attune", actor: "hero", item: "i1", end: true }, PAT));
  ok(apply(s, { type: "shortRest", ids: ["hero"] }, DM));
  assert.equal(s.entities.hero.ac, ac);
  // Three already: a fourth is refused when chosen, and fails at the rest if they changed meanwhile.
  const t = field(fighter([{ id: "i1", item: "cloak-of-protection", attuned: true }, { id: "i2", item: "amulet-of-health", attuned: true }, { id: "i3", item: "headband-of-intellect", attuned: true }, { id: "i4", item: "ring-of-protection" }]));
  no(apply(t, { type: "attune", actor: "hero", item: "i4" }, PAT), /attuned to 3 items already/);
  t.entities.hero.sheet.items[2].attuned = false;
  ok(apply(t, { type: "attune", actor: "hero", item: "i4" }, PAT));
  t.entities.hero.sheet.items[2].attuned = true;                 // the DM's sheet changed before the rest
  const f = ok(apply(t, { type: "shortRest", ids: ["hero"] }, DM)).events.find((x) => x.type === "attuned");
  assert.match(f.failed, /3 magic items at most/);
  assert.ok(!t.entities.hero.sheet.items[3].attuned);
  ok(apply(t, { type: "attune", actor: "hero", item: "i3", end: true }, DM));
  ok(apply(t, { type: "attune", actor: "hero", item: null }, PAT));
  assert.equal(t.entities.hero.sheet.attuning, undefined);
  no(apply(t, { type: "attune", actor: "rogue", item: "i1" }, DM), /typed in by hand/);
});

test("loot: a line naming a pack item lands as that item on a built character; name-only lines still go to gear", () => {
  const s = field(fighter());
  s.settings.conclusion = "dm";
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, DM));
  s.entities.m1.hp = 0; s.entities.m1.dead = true;
  for (let i = 0; i < 10 && s.encounter; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  if (s.encounter) ok(apply(s, { type: "endEncounter" }, DM));
  assert.ok(s.conclusion, "a conclusion waits");
  no(apply(s, { type: "conclusion", edit: { loot: { add: [{ item: "ring-of-wishing" }] } } }, DM), /not a magic item/);
  ok(apply(s, { type: "conclusion", edit: { loot: { add: [{ item: "weapon-plus-1", base: "longsword", to: "hero" }, { name: "35 gp", to: "hero" }, { item: "potion-of-healing", qty: 2, to: "hero" }] } } }, DM));
  assert.deepEqual(s.conclusion.loot.map((l) => l.name), ["Longsword +1", "35 gp", "Potion of Healing"]);
  ok(apply(s, { type: "conclusion", publish: true }, DM));
  const e = s.entities.hero;
  assert.deepEqual(e.sheet.items.map((x) => [x.id, x.item, x.base]), [["i1", "weapon-plus-1", "longsword"], ["i2", "potion-of-healing", undefined], ["i3", "potion-of-healing", undefined]]);
  assert.ok(e.gear.includes("35 gp"));
});

test("views: the party sees its own items and their events; a foe's item and its events never reach players", () => {
  const s = field(fighter([{ id: "i1", item: "cloak-of-protection", attuned: true }]));
  const r = ok(apply(s, { type: "equip", actor: "hero", item: "i1" }, PAT));
  assert.deepEqual(viewEvents(r.events, s, SAM).filter((x) => x.type === "equip").map((x) => [x.id, x.item, x.on]), [["hero", "Cloak of Protection", true]]);
  assert.equal(view(s, PAT).entities.hero.sheet.items[0].item, "cloak-of-protection");
  const g = ok(apply(s, { type: "give", actor: "m1", item: "ring-of-protection" }, DM));
  assert.deepEqual(viewEvents(g.events, s, PAT), []);
  assert.equal(view(s, PAT).entities.m1?.gear, undefined, "what a foe carries is not sent");
  assert.ok(s.entities.m1.gear.includes("Ring of Protection"), "the DM sees it");
});

test("migration 19 to 20: a saved table loads unchanged; an attuning naming no item is dropped", () => {
  const s = field(fighter([{ id: "i1", item: "ring-of-protection", equipped: true }]));
  s.version = 19;
  const before = structuredClone(s.entities);
  migrate(s);
  assert.equal(s.version, VERSION); assert.equal(VERSION, 23);
  assert.deepEqual(s.entities, before);
  s.entities.hero.sheet.attuning = { item: "i9" };
  s.version = 19;
  migrate(s);
  assert.equal(s.entities.hero.sheet.attuning, undefined);
});

test("the importer maps SRD items by name, a +1 weapon to its base, worn and attuned as the file says", () => {
  const xml = readFileSync(new URL("./fixtures/fgxml-cleric.xml", import.meta.url), "utf8").replace("</inventorylist>",
    '<id-00010><name type="string">Ring of Protection</name><type type="string">Ring</type><rarity type="string">Rare</rarity><carried type="number">2</carried><attune type="number">1</attune></id-00010>'
    + '<id-00011><name type="string">Mace, +1</name><type type="string">Weapon</type><carried type="number">2</carried></id-00011>'
    + '<id-00012><name type="string">Potion of Greater Healing</name><type type="string">Potion</type><rarity type="string">Uncommon</rarity><carried type="number">1</carried><count type="number">2</count></id-00012>'
    + '<id-00013><name type="string">Ring of Resistance</name><type type="string">Ring</type><rarity type="string">Rare</rarity><carried type="number">2</carried></id-00013></inventorylist>');
  const { character, report } = importFgxml(xml);
  assert.deepEqual(validate(character), []);
  assert.deepEqual(character.items.map((x) => [x.item, x.base, x.equipped, x.attuned]), [
    ["ring-of-protection", undefined, true, true], ["weapon-plus-1", "mace", true, undefined], ["potion-of-healing-greater", undefined, undefined, undefined], ["potion-of-healing-greater", undefined, undefined, undefined]]);
  assert.ok(report.magicItems.some((m) => m.name === "Ring of Resistance" && /does not say its damage type/.test(m.why)));
  assert.ok(report.magicItems.some((m) => m.name === "Ring of Invented Warding" && /name-only/.test(m.why)));
  assert.equal(derive(character).record.attacks.find((a) => a.name === "Mace +1").bonus, derive(character).record.attacks.find((a) => a.id === "mace").bonus + 1);
  // The weapon list's own weapon, made magic in the inventory, is the magic item and not the plain weapon too.
  const one = importFgxml(xml.replace('<id-00003><name type="string">Mace</name>', '<id-00003><name type="string">Mace, +1</name>').replace(/<id-00011>.*?<\/id-00011>/, "")).character;
  assert.deepEqual([one.weapons, one.items.filter((x) => x.item === "weapon-plus-1").length], [undefined, 1]);
});
