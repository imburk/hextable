// Goodberry (#925, docs/specs/rules-expansion.md, "Build notes: Goodberry"): a `grant` step puts ten berries in the caster's hand, each marked as the
// spell's own, and every one still marked vanishes when the spell ends (24 hours, Dispel Magic), wherever it has gone: a character's sheet, a pile.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { spellItems } from "../src/content/srd52/spell-items.js";
import { derive, validate } from "../src/derive.js";
import { apply, makeEntity } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { view } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const A = { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 };
const druid = { name: "Ven", class: "druid", level: 3, subclass: "land", abilities: A, skills: ["nature", "perception"], choices: { "primal-order": "warden" },
  weapons: ["quarterstaff"], spells: ["goodberry"] };
const cleric = { name: "Pia", class: "cleric", level: 13, subclass: "life", abilities: { ...A, wis: 18 }, skills: ["insight", "medicine"], spells: ["dispel-magic"] };
const sheetOf = (e) => e.sheet.items ?? [];
const berries = (e) => sheetOf(e).filter((x) => x.item === "goodberry");

// Ven (Pat's druid) with Goodberry, Pia (a cleric with Dispel Magic) and the valley's fighter beside them, on open grass.
function table() {
  const s = newGame(5);
  for (const id of Object.keys(s.entities)) if (id !== "fighter") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, sheet, q] of [["ven", druid, 0], ["pia", cleric, -1]]) {
    s.entities[id] = makeEntity(derive(sheet).record, { id, kind: "pc", side: "party", owner: "pat", ownerName: "Pat", pos: { q, r: 0, z: 0 } });
    s.entities[id].sheet = structuredClone(sheet);
  }
  s.entities.fighter.pos = { q: 1, r: 0, z: 0 };
  return s;
}
const castBerries = (s) => ok(apply(s, { type: "cast", actor: "ven", spell: "goodberry" }, DM));

test("the entry: a grant step, auto, and the berry is a consumable of the pack's own list", () => {
  const def = SPELLS.goodberry.def;
  assert.deepEqual(def.effects, [{ grant: { item: "goodberry", count: 10 } }]);
  assert.equal(def.tier, "auto");
  assert.deepEqual(lintEntry("spells", def, { strict: false }), []);
  const berry = CONTENT.items.goodberry;
  assert.equal(berry, spellItems[0]);
  assert.deepEqual(berry.activate, [{ name: "Eat", time: "bonus", consumed: true, effects: [{ heal: "+1" }] }]);
  assert.deepEqual(lintEntry("items", berry, { strict: false }), []);
  const bad = (grant) => lintEntry("spells", { ...structuredClone(def), effects: [{ grant }] }, { strict: false }).join("\n");
  assert.match(bad({ item: "goodberry", count: 21 }), /grant/);
  assert.match(bad({ item: "goodberry", count: 0 }), /grant/);
  assert.match(bad({ item: "Not An Id", count: 1 }), /grant/);
  assert.match(bad({ item: "goodberry" }), /grant/);
  assert.match(lintEntry("spells", { ...structuredClone(def), duration: "instant" }, { strict: false }).join("\n"), /for a spell that lasts/);
});

test("casting it puts ten marked berries on the caster's sheet; eating one is a Bonus Action that heals 1", () => {
  const s = table();
  const fx = castBerries(s).events.find((e) => e.type === "gear" && e.why === "granted");
  assert.equal(fx.item, "10 Goodberry");
  const e = s.entities.ven, effect = s.effects.find((x) => x.spell === "goodberry");
  assert.equal(berries(e).length, 10);
  assert.ok(berries(e).every((x) => x.from === effect.id), "each is marked as the spell's own");
  assert.equal(effect.parts.some((p) => p.items), true);
  assert.deepEqual(validate(e.sheet), []);
  e.hp = e.maxHp - 3;
  const key = berries(e)[0].id;
  const r = ok(apply(s, { type: "use", actor: "ven", item: key }, DM));
  assert.equal(e.hp, e.maxHp - 2, "restores 1 Hit Point");
  assert.equal(berries(e).length, 9, "the berry is eaten");
  assert.ok(r.events.some((x) => x.type === "gear" && x.why === "used" && x.taken));
});

test("eating takes a Bonus Action in a fight, once a turn", () => {
  const s = table();
  castBerries(s);
  s.entities.fighter.side = "foe";
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  for (let i = 0; i < 20 && s.encounter.order[s.encounter.turn]?.id !== "ven"; i++) ok(apply(s, { type: "endTurn", actor: s.encounter.order[s.encounter.turn].id }, DM));
  const e = s.entities.ven;
  e.hp = 1;
  ok(apply(s, { type: "use", actor: "ven", item: berries(e)[0].id }, DM));
  assert.equal(s.encounter.budget.bonus, 0);
  assert.equal(apply(s, { type: "use", actor: "ven", item: berries(e)[0].id }, DM).ok, false, "one Bonus Action a turn");
});

test("handed to an ally, who eats it; and an ally may eat one through a use of its own", () => {
  const s = table();
  castBerries(s);
  const key = berries(s.entities.ven)[0].id;
  ok(apply(s, { type: "pass", actor: "ven", item: key, to: "pia" }, DM));
  assert.equal(berries(s.entities.ven).length, 9);
  const pia = s.entities.pia;
  const given = berries(pia);
  assert.equal(given.length, 1);
  assert.equal(given[0].from, s.effects.find((x) => x.spell === "goodberry").id, "the mark goes with it");
  s.entities.pia.hp = pia.maxHp - 5;
  ok(apply(s, { type: "use", actor: "pia", item: given[0].id }, DM));
  assert.equal(s.entities.pia.hp, pia.maxHp - 4);
  assert.equal(berries(s.entities.pia).length, 0);
});

test("a creature may eat the berry another holds: a potion's Bonus Action administered to a creature in reach", () => {
  const s = table();
  castBerries(s);
  const fighter = s.entities.fighter;
  fighter.hp = fighter.maxHp - 4;
  ok(apply(s, { type: "use", actor: "ven", item: berries(s.entities.ven)[0].id, target: "fighter" }, DM));
  assert.equal(fighter.hp, fighter.maxHp - 3);
});

test("after 24 hours every berry is gone, the one handed over and the one dropped included", () => {
  const s = table();
  castBerries(s);
  ok(apply(s, { type: "pass", actor: "ven", item: berries(s.entities.ven)[0].id, to: "pia" }, DM));
  ok(apply(s, { type: "drop", actor: "ven", item: berries(s.entities.ven)[0].id }, DM));
  const pile = s.map.objects.find((o) => o.contents?.some((x) => x.item === "goodberry"));
  assert.ok(pile, "one lies on the ground");
  assert.equal(pile.contents[0].from, s.effects[0].id);
  const clock = s.clock;
  ok(apply(s, { type: "advanceTime", minutes: 24 * 60 - 1 }, DM));
  assert.equal(berries(s.entities.ven).length, 8);
  assert.equal(berries(s.entities.pia).length, 1);
  const r = ok(apply(s, { type: "advanceTime", minutes: 1 }, DM));
  assert.equal(s.clock, clock + 24 * 60);
  assert.equal(berries(s.entities.ven).length, 0);
  assert.equal(berries(s.entities.pia).length, 0);
  assert.equal(sheetOf(s.entities.ven).length, 0);
  assert.equal(s.map.objects.some((o) => o.contents?.some((x) => x.item === "goodberry")), false, "the pile's berry is gone");
  assert.equal(s.map.objects.some((o) => o.id === pile.id), false, "and the pile with it, being empty");
  assert.deepEqual(r.events.filter((x) => x.type === "gear" && x.why === "ended").map((x) => [x.id, x.item]).sort(), [["pia", "Goodberry"], ["ven", "8 Goodberry"]]);
  assert.equal(s.effects.length, 0);
});

test("Dispel Magic ends the spell, and the berries with it", () => {
  const s = table();
  castBerries(s);
  ok(apply(s, { type: "pass", actor: "ven", item: berries(s.entities.ven)[0].id, to: "pia" }, DM));
  ok(apply(s, { type: "cast", actor: "pia", spell: "dispel-magic", target: "ven" }, DM));
  assert.equal(s.effects.length, 0);
  assert.equal(berries(s.entities.ven).length, 0);
  assert.equal(berries(s.entities.pia).length, 0);
});

test("ending the effect early (the DM's endEffect) does the same; eaten berries stay eaten and nothing else is touched", () => {
  const s = table();
  s.entities.ven.sheet.items = [{ id: "i1", item: "potion-of-healing" }];
  castBerries(s);
  const e = s.entities.ven;
  assert.equal(sheetOf(e).length, 11);
  ok(apply(s, { type: "use", actor: "ven", item: berries(e)[0].id }, DM));
  ok(apply(s, { type: "endEffect", effect: s.effects[0].id }, DM));
  assert.deepEqual(sheetOf(e).map((x) => x.item), ["potion-of-healing"]);
});

test("a second casting is its own: ending the first leaves the second's berries", () => {
  const s = table();
  castBerries(s);
  const first = s.effects[0].id;
  s.entities.ven.slots[1] = 2;
  castBerries(s);
  assert.equal(berries(s.entities.ven).length, 20);
  ok(apply(s, { type: "endEffect", effect: first }, DM));
  assert.equal(berries(s.entities.ven).length, 10);
});

test("a saved game keeps them, and the mark is not sent to a player", () => {
  const s = table();
  castBerries(s);
  const back = JSON.parse(JSON.stringify(s));
  assert.equal(berries(back.entities.ven).length, 10);
  assert.ok(berries(back.entities.ven).every((x) => x.from === back.effects[0].id));
  ok(apply(back, { type: "advanceTime", minutes: 24 * 60 }, DM));
  assert.equal(berries(back.entities.ven).length, 0);
  const v = JSON.stringify(view(s, PAT));
  assert.ok(v.includes("goodberry"), "the player sees their own berries");
  assert.equal(v.includes('"from"'), false, "but not the mark");
});

test("a creature with no sheet cannot carry the mark: the DM is told", () => {
  const s = table();
  s.entities.ven.sheet = undefined;
  delete s.entities.ven.sheet;
  const r = castBerries(s);
  assert.ok(r.events.some((x) => x.type === "manual" && /goodberry/i.test(x.text)));
  assert.equal(s.effects.find((x) => x.spell === "goodberry").parts.some((p) => p.items), false);
});
