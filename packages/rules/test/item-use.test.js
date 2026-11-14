// Using magic items (docs/specs/table-ui.md E18, DEBT C14; #276): the `use` action with `item`. Potions run their
// effect steps on the drinker, charges are spent, a consumed item leaves the sheet, a Spell Scroll checks its
// reader, and a spell cast from an item goes to the DM with its numbers.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, itemUsesFor, makeEntity, scrollStats } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { CONTENT, PACKS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";
import { newGame } from "../src/scenario.js";
import { viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const SAM = { role: "player", userId: "sam" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); };
const A = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 };
const fighter = (items) => ({ name: "Brenna", class: "fighter", level: 5, subclass: "champion", abilities: A, skills: ["athletics", "perception"],
  choices: { "fighting-style": "defense" }, weapons: ["longbow"], ...(items ? { items } : {}) });
const wizard = (items, level = 5) => ({ name: "Tavin", class: "wizard", level, ...(level >= 3 ? { subclass: "evoker" } : {}), abilities: { ...A, int: 16, str: 8 }, skills: ["arcana", "history"],
  weapons: ["dagger"], spells: ["fire-bolt"], ...(items ? { items } : {}) });
const cleric = (items) => ({ name: "Mara", class: "cleric", level: 5, subclass: "life", abilities: { ...A, wis: 16, str: 10 }, skills: ["medicine", "religion"],
  choices: { "divine-order": "protector" }, weapons: [], ...(items ? { items } : {}) });

// A table with the sheet's character as "hero" (Pat's), the rogue two hexes away and the goblin m1 beside the hero.
function field(sheet, seed = 7) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (!["m1", "rogue"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 }, owner: "pat", ownerName: "Pat" });
  s.entities.hero.sheet = structuredClone(sheet);
  ok(apply(s, { type: "place", actor: "m1", to: { q: 3, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "rogue", to: { q: -1, r: 0 } }, DM));
  return s;
}
const hurt = (s, id, n) => ok(apply(s, { type: "harm", actor: id, amount: n, dtype: "slashing" }, DM));

test("the pack: potions of healing are auto, heroism assist; the linter knows a run use from a manual one", () => {
  const I = CONTENT.items;
  assert.deepEqual(["potion-of-healing", "potion-of-healing-greater", "potion-of-healing-superior", "potion-of-healing-supreme", "potion-of-heroism"].map((id) => I[id].tier), ["auto", "auto", "auto", "auto", "assist"]);
  assert.deepEqual(lintPack(PACKS[0]), []);
  const feather = { ...structuredClone(I["feather-token"]), tier: "auto" };
  assert.match(lintPack({ ...PACKS[0], items: [feather] }).join("\n"), /marked auto but gives nothing/, "a use that is only manual steps gives nothing the engine applies");
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => scrollStats(l).dc), [13, 13, 13, 15, 15, 17, 17, 18, 18, 19]);
  assert.deepEqual([0, 2, 3, 5, 7, 9].map((l) => scrollStats(l).attack), [5, 5, 7, 9, 10, 11]);
});

test("drinking a Potion of Healing: a Bonus Action, 2d4 + 2 back, the potion gone from the sheet", () => {
  const s = field(fighter([{ id: "i1", item: "potion-of-healing" }, { id: "i2", item: "potion-of-healing" }]));
  hurt(s, "hero", 20);
  const before = s.entities.hero.hp;
  const r = ok(apply(s, { type: "use", actor: "hero", item: "i1" }, PAT));
  const types = r.events.map((e) => e.type);
  assert.deepEqual(types.slice(0, 2), ["item", "gear"]);
  const it = r.events[0], gear = r.events[1], h = r.events.find((e) => e.type === "heal");
  assert.deepEqual([it.key, it.pack, it.use, it.consumed, it.item], ["i1", "potion-of-healing", "Drink", true, "Potion of Healing"]);
  assert.deepEqual([gear.why, gear.taken, gear.key], ["used", true, "i1"]);
  assert.ok(h.amount >= 4 && h.amount <= 10, `healed ${h.amount}`);
  assert.equal(s.entities.hero.hp, before + h.amount);
  assert.deepEqual(s.entities.hero.sheet.items.map((x) => x.id), ["i2"], "the drunk potion is gone; the other stays");
  no(apply(s, { type: "use", actor: "hero", item: "i1" }, PAT), /no such item/);
  // The last one: `items` goes from the sheet.
  ok(apply(s, { type: "use", actor: "hero", item: "i2" }, PAT));
  assert.equal(s.entities.hero.sheet.items, undefined);
});

test("a potion given to a creature within 5 feet (even at 0 Hit Points), not further; only a potion is given", () => {
  const s = field(fighter([{ id: "i1", item: "potion-of-healing" }, { id: "i2", item: "wand-of-magic-missiles", equipped: true }]));
  ok(apply(s, { type: "setHp", actor: "rogue", hp: 0 }, DM));
  const r = ok(apply(s, { type: "use", actor: "hero", item: "i1", target: "rogue" }, PAT));
  assert.equal(r.events[0].target, "rogue");
  assert.ok(s.entities.rogue.hp > 0, "the rogue is back up");
  const s2 = field(fighter([{ id: "i1", item: "potion-of-healing" }]));
  no(apply(s2, { type: "use", actor: "hero", item: "i1", target: "m1" }, PAT), /out of reach/);
  assert.equal(s2.entities.hero.sheet.items.length, 1, "a refused use changes nothing");
  no(apply(s, { type: "use", actor: "hero", item: "i2", target: "rogue" }, PAT), /not given to another/);
});

test("in a fight: on its own turn, for its time; one Bonus Action a turn", () => {
  const s = field(fighter([{ id: "i1", item: "potion-of-healing" }, { id: "i2", item: "potion-of-healing" }]));
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  for (let i = 0; i < 20 && current(s) !== "hero"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  ok(apply(s, { type: "use", actor: "hero", item: "i1" }, PAT));
  assert.equal(s.encounter.budget.bonus, 0);
  no(apply(s, { type: "use", actor: "hero", item: "i2" }, PAT), /Bonus Action/);
  ok(apply(s, { type: "endTurn", actor: "hero" }, PAT));
  no(apply(s, { type: "use", actor: "hero", item: "i2" }, PAT), /isn't Brenna's turn/);
  assert.equal(s.entities.hero.sheet.items.length, 1);
});

test("who may: its controller or the DM; a hand-typed character, an item with nothing to use, a bad use number", () => {
  const s = field(fighter([{ id: "i1", item: "potion-of-healing" }, { id: "i2", item: "ring-of-protection" }]));
  no(apply(s, { type: "use", actor: "hero", item: "i1" }, SAM), /isn't yours/);
  no(apply(s, { type: "use", actor: "hero", item: "i2" }, PAT), /nothing to use/);
  no(apply(s, { type: "use", actor: "hero", item: "i1", which: 1 }, PAT), /one use/);
  no(apply(s, { type: "use", actor: "rogue", item: "i1" }, DM), /typed in by hand/);
  no(apply(s, { type: "use", actor: "hero", item: "i1", object: "d1" }, PAT), /not both/);
  ok(apply(s, { type: "use", actor: "hero", item: "i1" }, DM));
});

test("Potion of Heroism: 10 Temporary Hit Points by the engine, Bless to the DM", () => {
  const s = field(fighter([{ id: "i1", item: "potion-of-heroism" }]));
  const r = ok(apply(s, { type: "use", actor: "hero", item: "i1" }, PAT));
  assert.equal(s.entities.hero.tempHp, 10);
  assert.ok(r.events.some((e) => e.type === "manual" && /Bless/.test(e.text)));
});

test("a wand: held to be used, a charge spent from 7, the spell to the DM with the user's numbers; no charges left, refused", () => {
  const s = field(wizard([{ id: "w", item: "wand-of-magic-missiles" }]));
  no(apply(s, { type: "use", actor: "hero", item: "w" }, PAT), /must be held/);
  s.entities.hero.sheet.items[0].equipped = true;
  const r = ok(apply(s, { type: "use", actor: "hero", item: "w" }, PAT));
  assert.deepEqual([r.events[0].charges, r.events[0].max, r.events[0].use], [6, 7, "Cast Magic Missile"]);
  assert.equal(s.entities.hero.sheet.items[0].charges, 6);
  const m = r.events.find((e) => e.type === "manual");
  assert.match(m.text, /Magic Missile \(level 1\).*no spell slot, no components; spell save DC 14, spell attack \+6/);
  assert.equal(s.entities.hero.slots[1], s.entities.hero.slotsMax[1], "no slot spent");
  s.entities.hero.sheet.items[0].charges = 1;
  const last = ok(apply(s, { type: "use", actor: "hero", item: "w" }, PAT));
  assert.ok(last.events.some((e) => e.type === "manual" && e.partial && /no charges left/.test(e.text)), "the DM is told about the last charge");
  no(apply(s, { type: "use", actor: "hero", item: "w" }, PAT), /0 charges left/);
  // A user with no spellcasting ability: +0 and the Proficiency Bonus.
  const f = field(fighter([{ id: "w", item: "wand-of-magic-missiles", equipped: true }]));
  assert.match(ok(apply(f, { type: "use", actor: "hero", item: "w" }, PAT)).events.find((e) => e.type === "manual").text, /DC 11, spell attack \+3/);
});

test("an item that needs Attunement is used only attuned; one with its own DC gives it (Helm of Telepathy)", () => {
  const s = field(cleric([{ id: "st", item: "staff-of-healing", equipped: true }, { id: "h", item: "helm-of-telepathy", equipped: true }]));
  no(apply(s, { type: "use", actor: "hero", item: "st" }, PAT), /must be attuned/);
  s.entities.hero.sheet.items[0].attuned = true;
  s.entities.hero.sheet.items[1].attuned = true;
  ok(apply(s, { type: "use", actor: "hero", item: "st", which: 2 }, PAT));
  assert.equal(s.entities.hero.sheet.items[0].charges, 5, "Mass Cure Wounds costs 5 of 10");
  ok(apply(s, { type: "use", actor: "hero", item: "st", which: 2 }, PAT));
  no(apply(s, { type: "use", actor: "hero", item: "st", which: 2 }, PAT), /0 charges left; Cast Mass Cure Wounds takes 5/);
  const h = ok(apply(s, { type: "use", actor: "hero", item: "h", which: 1 }, PAT));
  assert.match(h.events.find((e) => e.type === "manual").text, /Suggestion.*save DC 13/);
});

test("a Spell Scroll: on the reader's list, cast with the scroll's numbers; above its level, a check; off its list, unintelligible", () => {
  const s = field(wizard([{ id: "sc", item: "spell-scroll", spell: "fireball" }, { id: "s2", item: "spell-scroll", spell: "cure-wounds" }]));
  no(apply(s, { type: "use", actor: "hero", item: "s2" }, PAT), /not on Tavin's spell list/);
  const r = ok(apply(s, { type: "use", actor: "hero", item: "sc" }, PAT));
  assert.equal(r.events.some((e) => e.type === "check"), false, "a level 5 wizard casts level 3 spells: no check");
  assert.match(r.events.find((e) => e.type === "manual").text, /Fireball \(level 3\).*no Material components; spell save DC 15, spell attack \+7/);
  assert.deepEqual(s.entities.hero.sheet.items.map((x) => x.id), ["s2"]);
  // A level 1 wizard reading Fireball: an Intelligence check against DC 13.
  let passed = 0, failed = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const t = field(wizard([{ id: "sc", item: "spell-scroll", spell: "fireball" }], 1), seed);
    const x = ok(apply(t, { type: "use", actor: "hero", item: "sc" }, PAT));
    const c = x.events.find((e) => e.type === "check");
    assert.deepEqual([c.ability, c.dc], ["int", 13]);
    assert.equal(t.entities.hero.sheet.items, undefined, "the scroll is used up either way");
    if (c.success) { passed++; assert.ok(x.events.some((e) => e.type === "manual" && /Fireball/.test(e.text))); }
    else { failed++; assert.ok(x.events.some((e) => e.type === "std" && /fades/.test(e.action))); assert.ok(!x.events.some((e) => e.type === "manual")); }
  }
  assert.ok(passed > 0 && failed > 0, `both ways over 30 seeds: ${passed} passed, ${failed} failed`);
});

test("itemUsesFor: a row a use, with charges and the reason one can't be used", () => {
  const s = field(wizard([{ id: "w", item: "wand-of-magic-missiles" }, { id: "p", item: "potion-of-healing" }, { id: "r", item: "ring-of-protection" }]));
  const rows = itemUsesFor(s, s.entities.hero);
  assert.deepEqual(rows.map((x) => [x.key, x.label, x.time, x.cost]), [["w", "Cast Magic Missile", "action", 1], ["p", "Drink", "bonus", 0]]);
  assert.deepEqual([rows[0].charges, rows[0].max, rows[0].spell, rows[1].consumed, rows[1].reach], [7, 7, "magic-missile", true, 5]);
  assert.match(rows[0].why, /must be held/);
  assert.equal(rows[1].why, "");
  assert.deepEqual(itemUsesFor(s, s.entities.rogue), [], "a hand-typed character has no rows");
});

test("views: a player sees their own use whole; another's use without its charges; the DM's foe never", () => {
  const s = field(wizard([{ id: "w", item: "wand-of-magic-missiles", equipped: true }]));
  const r = ok(apply(s, { type: "use", actor: "hero", item: "w" }, PAT));
  const mine = viewEvents(r.events, s, PAT).find((e) => e.type === "item");
  assert.equal(mine.charges, 6);
  const fake = [{ ...r.events[0], id: "m1" }];
  s.entities.m1.hidden = true;
  assert.deepEqual(viewEvents(fake, s, PAT), [], "a hidden creature's use is not sent");
  delete s.entities.m1.hidden;
  const seen = viewEvents(fake, s, PAT)[0];
  assert.ok(seen && seen.charges === undefined && seen.key === undefined && seen.use === "Cast Magic Missile");
});
