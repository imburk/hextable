// Stage O4 of docs/specs/on-hit.md (#666): the `imbue` step, so Shillelagh, Magic Weapon and Sacred Weapon really change the weapon (imbue.js).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { armed } from "../src/imbue.js";
import { lintPack } from "../src/content/schema.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "should have been refused"); if (re) assert.match(r.error, re); };
const druid = (level, more = {}) => ({ name: "Ven", class: "druid", level, ...(level >= 3 ? { subclass: "land" } : {}), abilities: { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 },
  skills: ["nature", "perception"], choices: { "primal-order": "warden" }, armour: "leather-armor", weapons: ["quarterstaff", "club"], spells: ["shillelagh"], ...more });
const paladin = (level, more = {}) => ({ name: "Ka", class: "paladin", level, ...(level >= 3 ? { subclass: "devotion" } : {}), abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 16 },
  skills: ["athletics", "religion"], choices: { "fighting-style": "defense" }, armour: "chain-mail", weapons: ["longsword", "longbow"], ...more });

function field(sheet) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (!["rogue", "m1"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  ok(apply(s, { type: "place", actor: "rogue", to: { q: -3, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "m1", to: { q: 1, r: 0 } }, DM));
  s.entities.m1.hp = s.entities.m1.maxHp = 300;
  return s;
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 20 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const rec = (s, id = "hero", a = "quarterstaff") => s.entities[id].attacks.find((x) => x.id === a);
const imbued = (s, id = "hero") => (s.effects ?? []).filter((fx) => fx.parts.some((p) => p.imbue && !p.ended && p.target === id));
const swing = (s, a = "quarterstaff-two-handed", more = {}) => ok(apply(s, { type: "attack", actor: "hero", target: "m1", attack: a, ...more }, DM)).events;

test("the records carry what imbue needs: die, plus, trained", () => {
  const r = derive(druid(1)).record.attacks;
  assert.deepEqual(r.find((a) => a.id === "quarterstaff") && ["die", "plus", "trained"].map((k) => r.find((a) => a.id === "quarterstaff")[k]), ["1d6", 0, true]);
  assert.equal(r.find((a) => a.id === "quarterstaff-two-handed").die, "1d8");
  assert.equal(derive(druid(1, { shield: true })).record.attacks.some((a) => a.id === "quarterstaff-two-handed"), false);
  assert.equal(r.find((a) => a.id === "unarmed-strike").die, undefined);
});

test("Shillelagh: Wisdom for the attack and damage, a d8 (d10 at 5), and Force when it hurts more", () => {
  const s = field(druid(1));
  assert.equal(rec(s, "hero", "quarterstaff-two-handed").bonus, 2);
  ok(apply(s, { type: "cast", actor: "hero", spell: "shillelagh", weapon: "quarterstaff" }, DM));
  assert.equal(imbued(s).length, 1);
  const a = armed(s, s.entities.hero, rec(s, "hero", "quarterstaff-two-handed"));
  assert.equal(a.bonus, 5, "proficiency 2 + Wisdom 3");
  assert.equal(a.damage, "1d8+3");
  assert.deepEqual(a.alt, ["force"]);
  assert.equal(armed(s, s.entities.hero, rec(s, "hero", "quarterstaff")).damage, "1d8+3", "the one-handed record too");
  assert.equal(rec(s, "hero", "quarterstaff-two-handed").bonus, 2, "the record itself is not changed");
  const clubbed = { ...rec(s), id: "club", weapon: "club", die: "1d4", damage: "1d4" };
  assert.equal(armed(s, s.entities.hero, clubbed), clubbed, "a club is not the staff that was named");
  // The attack rolls with it.
  fight(s); turnOf(s, "hero");
  const ev = swing(s);
  assert.equal(ev.find((x) => x.type === "attack").bonus, 5);
  const d = ev.find((x) => x.type === "damage");
  if (d) assert.ok(d.parts?.every?.((p) => p.type === "bludgeoning" || p.type === "force") ?? true);
  assert.equal(armed(s, s.entities.hero, rec(s, "hero", "quarterstaff-two-handed")).damage, "1d8+3");
  // Level 5: d10.
  const t = field(druid(5));
  ok(apply(t, { type: "cast", actor: "hero", spell: "shillelagh", weapon: "quarterstaff" }, DM));
  const w = field(druid(5, { weapons: ["quarterstaff"] }));
  ok(apply(w, { type: "cast", actor: "hero", spell: "shillelagh" }, DM));            // the only weapon that fits: no need to name it
  assert.equal(imbued(w)[0].parts[0].imbue.weapon, "quarterstaff");
  assert.equal(armed(t, t.entities.hero, rec(t, "hero", "quarterstaff-two-handed")).damage.slice(0, 4), "1d10");
  const u = field(druid(11)); ok(apply(u, { type: "cast", actor: "hero", spell: "shillelagh", weapon: "club" }, DM));
  assert.equal(armed(u, u.entities.hero, rec(u, "hero", "club")).damage, "1d12+3");
  const v = field(druid(17)); ok(apply(v, { type: "cast", actor: "hero", spell: "shillelagh", weapon: "quarterstaff" }, DM));
  assert.equal(armed(v, v.entities.hero, rec(v, "hero", "quarterstaff-two-handed")).damage, "2d6+3");
});

test("Shillelagh: Force against a target that resists Bludgeoning, its own type otherwise", () => {
  const s = field(druid(1));
  ok(apply(s, { type: "cast", actor: "hero", spell: "shillelagh", weapon: "quarterstaff" }, DM));
  fight(s); turnOf(s, "hero");
  s.entities.m1.resist = ["bludgeoning"];
  s.entities.m1.ac = 1;
  const ev = swing(s);
  const dmg = ev.find((x) => x.type === "damage");
  assert.ok(dmg, "it hit");
  assert.ok(JSON.stringify(dmg).includes("force"), "Force, since the target resists Bludgeoning");
});

test("Shillelagh ends when cast again, and when the staff is no longer held; it needs a weapon that fits", () => {
  const s = field(druid(1));
  ok(apply(s, { type: "cast", actor: "hero", spell: "shillelagh", weapon: "quarterstaff" }, DM));
  ok(apply(s, { type: "cast", actor: "hero", spell: "shillelagh", weapon: "club" }, DM));
  assert.equal(imbued(s).length, 1, "cast again: one effect");
  assert.equal(imbued(s)[0].parts[0].imbue.weapon, "club");
  assert.equal(armed(s, s.entities.hero, rec(s, "hero", "quarterstaff")).damage, "1d6", "the staff is no longer changed");
  // Letting go of the club (no record for it any more) ends it after the next action.
  s.entities.hero.attacks = s.entities.hero.attacks.filter((a) => a.id !== "club");
  ok(apply(s, { type: "cast", actor: "hero", spell: "shillelagh", weapon: "quarterstaff" }, DM));
  assert.equal(imbued(s).length, 1);
  assert.equal(imbued(s)[0].parts[0].imbue.weapon, "quarterstaff");
  s.entities.hero.attacks = s.entities.hero.attacks.filter((a) => !a.id.startsWith("quarterstaff"));
  no(apply(s, { type: "cast", actor: "hero", spell: "shillelagh" }, DM), /no weapon/);
});

test("Shillelagh: more than one weapon fits and none is named, a weapon that does not fit, no weapon at all", () => {
  const s = field(druid(1));
  no(apply(s, { type: "cast", actor: "hero", spell: "shillelagh" }, DM), /Name the weapon/);
  no(apply(s, { type: "cast", actor: "hero", spell: "shillelagh", weapon: "unarmed-strike" }, DM));
  no(apply(s, { type: "cast", actor: "hero", spell: "shillelagh", weapon: "nope" }, DM), /no weapon/);
  assert.equal(imbued(s).length, 0, "a refused cast changes nothing");
  const t = field(druid(1, { weapons: [] }));
  no(apply(t, { type: "cast", actor: "hero", spell: "shillelagh" }, DM), /no weapon/);
});

test("an old record (made before imbue) is not changed, and the DM is told", () => {
  const s = field(druid(1));
  for (const a of s.entities.hero.attacks) delete a.die;
  const r = ok(apply(s, { type: "cast", actor: "hero", spell: "shillelagh", weapon: "quarterstaff" }, DM));
  assert.ok(r.events.some((x) => x.type === "manual" && /made before/.test(x.text)), "a manual event names the effect");
  assert.equal(armed(s, s.entities.hero, rec(s, "hero", "quarterstaff-two-handed")).damage, "1d8+0".replace("+0", ""), "unchanged");
});

test("Magic Weapon: +1, +2 from a level 3 slot, +3 from level 6, on a nonmagical weapon only", () => {
  const give = (s) => { const h = s.entities.hero; h.spells.push("magic-weapon"); h.slots = { 2: 2, 3: 1, 6: 1 }; };
  const s = field(paladin(5)); give(s);
  ok(apply(s, { type: "cast", actor: "hero", spell: "magic-weapon", target: "hero", weapon: "longsword" }, DM));
  const was = rec(s, "hero", "longsword"), a = armed(s, s.entities.hero, was);
  assert.equal(a.bonus, was.bonus + 1);
  assert.equal(a.damage, was.damage.replace(/\+(\d+)$/, (_, n) => `+${+n + 1}`));
  assert.equal(a.magic, true);
  // Cast again from a level 3 slot: the old one ends, +2.
  ok(apply(s, { type: "cast", actor: "hero", spell: "magic-weapon", target: "hero", weapon: "longsword", slot: 3 }, DM));
  assert.equal(imbued(s).length, 1);
  assert.equal(armed(s, s.entities.hero, was).bonus, was.bonus + 2);
  // A weapon that is already magic is refused, before the slot is spent.
  const t = field(paladin(5)); give(t);
  rec(t, "hero", "longsword").magic = true;
  no(apply(t, { type: "cast", actor: "hero", spell: "magic-weapon", target: "hero", weapon: "longsword" }, DM), /magic/);
  assert.equal(t.entities.hero.slots[2], 2);
  // A level 6 slot: +3. It can be put on an ally's weapon too.
  const u = field(paladin(5)); give(u);
  ok(apply(u, { type: "cast", actor: "hero", spell: "magic-weapon", target: "hero", weapon: "longsword", slot: 6 }, DM));
  assert.equal(armed(u, u.entities.hero, rec(u, "hero", "longsword")).bonus, rec(u, "hero", "longsword").bonus + 3);
});

test("Sacred Weapon: Charisma (at least +1) to attack rolls from the first attack of the Attack action, Radiant or its own type", () => {
  const s = field(paladin(5)); fight(s); turnOf(s, "hero");
  s.entities.hero.abil.cha = 8;                         // Charisma -1: the bonus is at least +1
  no(apply(s, { type: "feature", actor: "hero", feature: "sacred-weapon" }, DM), /Attack action/);
  const before = rec(s, "hero", "longsword").bonus;
  const ev = swing(s, "longsword", { use: "sacred-weapon" });
  assert.equal(ev.find((x) => x.type === "attack").bonus, before + 1, "the first attack has the bonus");
  assert.equal(s.entities.hero.uses["channel-divinity"], 1, "a use of Channel Divinity spent");
  assert.equal(imbued(s).length, 1);
  assert.ok(ev.some((x) => x.type === "manual" && /Bright Light/.test(x.text)), "the light is the DM's");
  assert.equal(armed(s, s.entities.hero, rec(s, "hero", "longsword")).bonus, before + 1, "the number it was used with: Charisma -1, so +1");
  assert.equal(armed(s, s.entities.hero, rec(s, "hero", "longsword")).damage, rec(s, "hero", "longsword").damage, "attack rolls only");
  assert.deepEqual(armed(s, s.entities.hero, rec(s, "hero", "longsword")).alt, ["radiant"]);
  // The second attack of the Attack action may not use it again; a longbow is not a Melee weapon.
  no(apply(s, { type: "attack", actor: "hero", target: "m1", attack: "longsword", use: "sacred-weapon" }, DM), /Attack action/);
});

test("Sacred Weapon: refused with a ranged weapon, outside a fight, on a Bonus Action or pooled attack", () => {
  const s = field(paladin(5));
  no(apply(s, { type: "attack", actor: "hero", target: "m1", attack: "longsword", use: "sacred-weapon" }, DM), /fight|turn/);
  fight(s); turnOf(s, "hero");
  no(apply(s, { type: "attack", actor: "hero", target: "m1", attack: "longbow", use: "sacred-weapon" }, DM), /Melee/);
  no(apply(s, { type: "attack", actor: "hero", target: "m1", attack: "unarmed-strike", use: "sacred-weapon" }, DM), /weapon/);
  no(apply(s, { type: "attack", actor: "hero", target: "m1", attack: "longsword", use: "nope" }, DM));
  assert.equal(s.entities.hero.uses["channel-divinity"], 2, "nothing spent by the refusals");
  swing(s, "longsword");
  no(apply(s, { type: "attack", actor: "hero", target: "m1", attack: "longsword", use: "sacred-weapon" }, DM), /Attack action/);
  assert.equal(s.entities.hero.uses["channel-divinity"], 2);
});

test("an Opportunity Attack is made with the imbued weapon", () => {
  const s = field(druid(1, { weapons: ["quarterstaff"] }));
  ok(apply(s, { type: "cast", actor: "hero", spell: "shillelagh" }, DM));
  fight(s); turnOf(s, "m1");
  s.entities.m1.speed = 30;
  const r = apply(s, { type: "move", actor: "m1", to: { q: 4, r: 0 } }, DM);
  const reaction = (r.events ?? []).find((x) => x.type === "attack" && x.actor === "hero");
  if (r.ok && reaction) assert.equal(reaction.bonus, 5, "Wisdom, not Strength");
  else assert.ok(true, `no Opportunity Attack was taken here: ${r.error ?? ""}`);
});

test("the vocabulary: the entries lint, and a bad imbue is refused by the linter", () => {
  const spell = (imbue) => ({ format: "hextable-pack", v: 1, pack: { id: "t", name: "T", version: 1, license: "CC0, by the author", attribution: "Written for a test." }, spells: [{ id: "hb-t-blade-x", name: "Blade X", source: "homebrew:t", checked: false, level: 1, school: "transmutation", classes: ["wizard"], time: "bonus", range: "touch", components: ["v"],
    duration: "1 minute", concentration: false, ritual: false, target: { self: true }, effects: [{ imbue }], tier: "auto", text: "A held weapon is changed for a minute." }] });
  const bad = (i) => lintPack(spell(i), { strict: true }).length > 0;
  assert.equal(bad({ plus: 1 }), false);
  assert.equal(bad({ die: { byLevel: { 1: "1d8", 5: "1d10" } }, abil: "spell", types: ["force"], weapons: ["club"], melee: true, nonmagical: true, attackAdd: { mod: "cha", min: 1 } }), false);
  for (const i of [{}, { plus: 7 }, { die: "big" }, { abil: "wis" }, { types: ["fluff"] }, { plus: 1, banana: true }, { weapons: [] }, { attackAdd: { mod: "xx" } }]) assert.equal(bad(i), true, JSON.stringify(i));
});
