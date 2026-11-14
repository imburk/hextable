// Using magic items (docs/specs/table-ui.md E18, DEBT C14; #276): the `use` action with `item`. Potions run their
// effect steps on the drinker, charges are spent, a consumed item leaves the sheet, a Spell Scroll checks its
// reader, and a spell cast from an item goes through the cast path (#284), as do Spell Scrolls; charges come back
// at dawn (rests.js).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, dawnsBetween, itemUsesFor, makeEntity, scrollStats } from "../src/engine.js";
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
const fight = (s) => { ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM)); for (let i = 0; i < 20 && current(s) !== "hero"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), "hero"); };
// A foe who counters any spell it sees cast (Counterspell, "always"), 4 hexes from the hero.
function counterspeller(s) {
  const foe = s.entities.foe = structuredClone(s.entities.hero);
  delete foe.owner; delete foe.sheet; delete foe.reactions;
  Object.assign(foe, { id: "foe", name: "Foe", side: "foe", kind: "npc", pos: { q: 4, r: 0, z: 0 }, reactionUsed: false, castAbil: "int",
    spells: ["counterspell"], slots: { 3: 2 }, slotsMax: { 3: 2 }, reactions: { counterspell: "always" } });
  return foe;
}

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
  const s = field(fighter([{ id: "i1", item: "potion-of-healing" }, { id: "i2", item: "feather-token" }]));
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

test("a wand: held, in a fight; Magic Missile through the cast path: a charge, no slot, no components; more charges, a higher level", () => {
  const s = field(wizard([{ id: "w", item: "wand-of-magic-missiles" }]));
  s.entities.m1.hp = s.entities.m1.maxHp = 200;
  fight(s);
  no(apply(s, { type: "use", actor: "hero", item: "w", target: "m1" }, PAT), /must be held/);
  s.entities.hero.sheet.items[0].equipped = true;
  no(apply(s, { type: "use", actor: "hero", item: "w" }, PAT), /Pick a target for Magic Missile/);
  assert.equal(s.entities.hero.sheet.items[0].charges, undefined, "a refused cast spends nothing");
  const hp = s.entities.m1.hp;
  const r = ok(apply(s, { type: "use", actor: "hero", item: "w", targets: ["m1", "m1", "m1"] }, PAT));
  const it = r.events.find((e) => e.type === "item"), c = r.events.find((e) => e.type === "cast");
  assert.deepEqual([it.charges, it.max, it.use, it.level], [6, 7, "Cast Magic Missile", undefined]);
  assert.deepEqual([c.spell, c.item, c.slot, c.targets.length], ["magic-missile", "Wand of Magic Missiles", undefined, 3]);
  assert.ok(s.entities.m1.hp < hp, "the darts hit");
  assert.ok(!r.events.some((e) => e.type === "manual" && !e.partial), "nothing is handed to the DM");
  assert.equal(s.entities.hero.slots[1], s.entities.hero.slotsMax[1], "no slot spent");
  assert.equal(s.encounter.budget.action, 0, "its casting time, an action");
  assert.ok(!s.encounter.flags.slot, "not the one slot spell of the turn");
  // Level 3 for 3 charges: five darts. Level 4 is past the wand; more charges than are left, refused.
  const t = field(wizard([{ id: "w", item: "wand-of-magic-missiles", equipped: true, charges: 4 }]));
  t.entities.m1.hp = t.entities.m1.maxHp = 200;
  fight(t);
  no(apply(t, { type: "use", actor: "hero", item: "w", level: 4, target: "m1" }, PAT), /level 1 to 3/);
  const up = ok(apply(t, { type: "use", actor: "hero", item: "w", level: 3, targets: ["m1", "m1", "m1", "m1", "m1"] }, PAT));
  assert.deepEqual([up.events.find((e) => e.type === "item").charges, up.events.find((e) => e.type === "item").level, up.events.find((e) => e.type === "cast").slot], [1, 3, 3]);
  assert.equal(up.events.filter((e) => e.type === "damage" && e.target === "m1").length, 5, "five darts");
  ok(apply(t, { type: "endTurn", actor: "hero" }, PAT));
  for (let i = 0; i < 20 && current(t) !== "hero"; i++) ok(apply(t, { type: "endTurn", actor: current(t) }, DM));
  no(apply(t, { type: "use", actor: "hero", item: "w", level: 2, targets: ["m1", "m1", "m1", "m1"] }, PAT), /1 charge left; Cast Magic Missile at level 2 takes 2/);
  const last = ok(apply(t, { type: "use", actor: "hero", item: "w", target: "m1" }, PAT));
  assert.ok(last.events.some((e) => e.type === "manual" && e.partial && /no charges left/.test(e.text)), "the DM is told about the last charge");
  assert.equal(t.entities.hero.sheet.items[0].charges, 0);
  // Out of a fight a harmful spell starts one, and nothing is spent until it is cast.
  const o = field(fighter([{ id: "w", item: "wand-of-magic-missiles", equipped: true }]));
  const st = ok(apply(o, { type: "use", actor: "hero", item: "w", target: "m1" }, PAT));
  assert.ok(st.events.some((e) => e.type === "encounterStart") && !st.events.some((e) => e.type === "item"));
  assert.equal(o.entities.hero.sheet.items[0].charges, undefined);
});

test("a wand has no components: no Counterspell, and a hiding user stays hidden; a Spell Scroll keeps V and S", () => {
  const s = field(wizard([{ id: "w", item: "wand-of-magic-missiles", equipped: true }, { id: "sc", item: "spell-scroll", spell: "magic-missile" }]));
  counterspeller(s);
  fight(s);
  s.entities.hero.hiding = { dc: 20 };
  const r = ok(apply(s, { type: "use", actor: "hero", item: "w", targets: ["foe", "foe", "foe"] }, PAT));
  assert.ok(!r.events.some((e) => e.type === "reaction" && e.id === "foe"), "nothing seen being cast: no Counterspell");
  assert.deepEqual(s.entities.foe.slots[3], 2);
  assert.ok(s.entities.hero.hiding, "no Verbal component: still hidden");
  assert.ok(r.events.some((e) => e.type === "damage" && e.target === "foe"));
  // The scroll: its Verbal component gives the reader away, and the foe may counter it. A countered
  // reading is interrupted: the scroll is kept. One cast is gone.
  let countered = 0, cast = 0;
  for (let seed = 1; seed <= 40 && (!countered || !cast); seed++) {
    const t = field(wizard([{ id: "sc", item: "spell-scroll", spell: "magic-missile" }]), seed);
    counterspeller(t);
    fight(t);
    t.entities.hero.hiding = { dc: 20 };
    const x = ok(apply(t, { type: "use", actor: "hero", item: "sc", targets: ["foe", "foe", "foe"] }, PAT));
    assert.ok(x.events.some((e) => e.type === "unhidden" && e.id === "hero"), "the Verbal component gives the reader away");
    assert.ok(x.events.some((e) => e.type === "reaction" && e.id === "foe" && e.reaction === "counterspell"));
    assert.equal(t.encounter.budget.action, 0);
    if (x.events.some((e) => e.type === "countered")) {
      countered++;
      assert.deepEqual(t.entities.hero.sheet.items.map((y) => y.id), ["sc"], "the scroll is kept");
      assert.ok(!x.events.some((e) => e.type === "gear"));
    } else {
      cast++;
      assert.equal(t.entities.hero.sheet.items, undefined, "cast: the scroll crumbles");
      assert.ok(x.events.some((e) => e.type === "gear" && e.why === "used" && e.taken));
    }
  }
  assert.ok(countered && cast, `both ways: ${countered} countered, ${cast} cast`);
});

test("an item that needs Attunement is used only attuned; the user's own numbers or the item's DC (Staff of Healing, Helm of Telepathy)", () => {
  const s = field(cleric([{ id: "st", item: "staff-of-healing", equipped: true }, { id: "h", item: "helm-of-telepathy", equipped: true }]));
  no(apply(s, { type: "use", actor: "hero", item: "st", target: "rogue" }, PAT), /must be attuned/);
  s.entities.hero.sheet.items[0].attuned = true;
  s.entities.hero.sheet.items[1].attuned = true;
  hurt(s, "rogue", 8); hurt(s, "hero", 30);
  // Cure Wounds at level 3 for 3 charges: 6d8 + the cleric's Wisdom modifier (+3).
  const before = s.entities.rogue.hp;
  const cw = ok(apply(s, { type: "use", actor: "hero", item: "st", target: "rogue", level: 3 }, PAT));
  const h = cw.events.find((e) => e.type === "heal" && e.target === "rogue");
  assert.ok(h.amount >= 9 && h.amount <= 51, `healed ${h.amount}`);
  assert.equal(s.entities.rogue.hp, Math.min(s.entities.rogue.maxHp, before + h.amount));
  assert.equal(s.entities.hero.sheet.items[0].charges, 7);
  no(apply(s, { type: "use", actor: "hero", item: "st", target: "rogue", level: 5 }, PAT), /level 1 to 4/);
  no(apply(s, { type: "use", actor: "hero", item: "st", which: 2, target: "rogue", level: 6 }, PAT), /one level only/);
  // Mass Cure Wounds (5): an area, here on the hero and the rogue.
  no(apply(s, { type: "use", actor: "hero", item: "st", which: 2 }, PAT), /Pick where Mass Cure Wounds/);
  const m = ok(apply(s, { type: "use", actor: "hero", item: "st", which: 2, hex: { q: 0, r: 0 } }, PAT));
  assert.ok(m.events.some((e) => e.type === "heal" && e.target === "hero"));
  assert.equal(s.entities.hero.sheet.items[0].charges, 2);
  no(apply(s, { type: "use", actor: "hero", item: "st", which: 2, hex: { q: 0, r: 0 } }, PAT), /2 charges left; Cast Mass Cure Wounds takes 5/);
  // Lesser Restoration is a Bonus Action spell, so from the staff too.
  assert.equal(itemUsesFor(s, s.entities.hero).find((x) => x.key === "st" && x.which === 1).time, "bonus");
  // The Helm's Suggestion: save DC 13, whatever the wearer's own.
  fight(s);
  const sg = ok(apply(s, { type: "use", actor: "hero", item: "h", which: 1, target: "m1" }, PAT));
  const save = sg.events.find((e) => e.type === "save" && e.id === "m1");
  assert.ok(save && save.dc === 13, "DC 13");
});

test("a Spell Scroll: on the reader's list, cast with the scroll's numbers; above its level, a check; off its list, unintelligible", () => {
  const s = field(wizard([{ id: "sc", item: "spell-scroll", spell: "fireball" }, { id: "s2", item: "spell-scroll", spell: "cure-wounds" }]));
  s.entities.m1.hp = s.entities.m1.maxHp = 200;
  fight(s);
  no(apply(s, { type: "use", actor: "hero", item: "s2", target: "hero" }, PAT), /not on Tavin's spell list/);
  no(apply(s, { type: "use", actor: "hero", item: "sc" }, PAT), /Pick where Fireball/);
  no(apply(s, { type: "use", actor: "hero", item: "sc", hex: { q: 3, r: 0 }, level: 4 }, PAT), /one level only/);
  const slots = { ...s.entities.hero.slots };
  const r = ok(apply(s, { type: "use", actor: "hero", item: "sc", hex: { q: 3, r: 0 } }, PAT));
  assert.equal(r.events.some((e) => e.type === "check"), false, "a level 5 wizard casts level 3 spells: no check");
  const save = r.events.find((e) => e.type === "save" && e.id === "m1");
  assert.equal(save.dc, 15, "the scroll's DC for a level 3 spell");
  assert.ok(r.events.some((e) => e.type === "damage" && e.target === "m1"));
  assert.deepEqual(s.entities.hero.slots, slots, "no slot");
  assert.deepEqual(s.entities.hero.sheet.items.map((x) => x.id), ["s2"]);
  // A level 1 wizard reading Fireball: an Intelligence check against DC 13.
  let passed = 0, failed = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const t = field(wizard([{ id: "sc", item: "spell-scroll", spell: "fireball" }], 1), seed);
    t.entities.m1.hp = t.entities.m1.maxHp = 200;
    ok(apply(t, { type: "place", actor: "m1", to: { q: 7, r: 0 } }, DM));
    fight(t);
    const x = ok(apply(t, { type: "use", actor: "hero", item: "sc", hex: { q: 7, r: 0 } }, PAT));
    const c = x.events.find((e) => e.type === "check");
    assert.deepEqual([c.ability, c.dc], ["int", 13]);
    assert.equal(t.entities.hero.sheet.items, undefined, "the scroll is used up either way");
    assert.equal(t.encounter.budget.action, 0, "the action is spent either way");
    if (c.success) { passed++; assert.ok(x.events.some((e) => e.type === "cast" && e.spell === "fireball")); }
    else { failed++; assert.ok(x.events.some((e) => e.type === "std" && /fades/.test(e.action))); assert.ok(!x.events.some((e) => e.type === "cast")); }
  }
  assert.ok(passed > 0 && failed > 0, `both ways over 30 seeds: ${passed} passed, ${failed} failed`);
});

test("Ring of Jumping: Jump on its wearer only; a spell from an item still can't be cast in a form or with Metamagic", () => {
  const s = field(wizard([{ id: "j", item: "ring-of-jumping", equipped: true, attuned: true }, { id: "w", item: "wand-of-magic-missiles", equipped: true }]));
  no(apply(s, { type: "use", actor: "hero", item: "j", target: "rogue" }, PAT), /targets Tavin only/);
  const r = ok(apply(s, { type: "use", actor: "hero", item: "j", target: "hero" }, PAT));
  assert.ok(r.events.some((e) => e.type === "cast" && e.spell === "jump"));
  assert.ok(r.events.some((e) => e.type === "manual" && e.actor === "hero"), "Jump itself is the DM's (a manual spell)");
  fight(s);
  no(apply(s, { type: "use", actor: "hero", item: "w", target: "m1", metamagic: ["quickened"] }, PAT), /"metamagic" is not for a spell cast from/);
  no(apply(s, { type: "use", actor: "hero", item: "w", target: "m1", slot: 2 }, PAT), /"slot" is not for/);
});

test("dawn: charges come back by the item's dice, once a dawn passed, up to its most; none without regain", () => {
  assert.deepEqual([dawnsBetween(8 * 60, 22 * 60), dawnsBetween(22 * 60, 30 * 60), dawnsBetween(6 * 60, 6 * 60 + 1), dawnsBetween(5 * 60, 6 * 60), dawnsBetween(0, 3 * 1440)], [0, 1, 0, 1, 3]);
  const s = field(wizard([{ id: "w", item: "wand-of-magic-missiles", charges: 0 }, { id: "c", item: "chime-of-opening", charges: 3 }, { id: "h", item: "helm-of-telepathy" }]));
  assert.equal(s.clock, 8 * 60);
  const day = ok(apply(s, { type: "advanceTime", minutes: 60 }, DM));
  assert.ok(!day.events.some((e) => e.type === "recharged"), "no dawn between 08:00 and 09:00");
  const r = ok(apply(s, { type: "advanceTime", minutes: 21 * 60 + 30 }, DM));        // to 06:30 the next day
  const w = r.events.find((e) => e.type === "recharged");
  assert.deepEqual([w.key, w.dice, w.max, w.rolls.length], ["w", "1d6+1", 7, 1]);
  assert.ok(w.gained >= 2 && w.gained <= 7 && w.charges === w.gained);
  assert.equal(s.entities.hero.sheet.items[0].charges, w.gained);
  assert.equal(s.entities.hero.sheet.items[1].charges, 3, "the Chime has no regain");
  assert.ok(r.events.some((e) => e.type === "manual" && e.partial && /once a dawn/.test(e.text) && /Helm of Telepathy/.test(e.text)), "the DM is told of uses the engine does not track");
  // A long rest across a dawn, and several dawns: never past the most.
  s.entities.hero.sheet.items[0].charges = 1;
  ok(apply(s, { type: "advanceTime", minutes: 15 * 60 }, DM));                        // 21:30
  const lr = ok(apply(s, { type: "rest" }, DM));                                       // to 05:30: no dawn
  assert.ok(!lr.events.some((e) => e.type === "recharged"));
  const sr = ok(apply(s, { type: "shortRest" }, DM));                                  // to 06:30
  assert.ok(sr.events.some((e) => e.type === "recharged" && e.key === "w"));
  ok(apply(s, { type: "advanceTime", minutes: 5 * 1440 }, DM));
  assert.equal(s.entities.hero.sheet.items[0].charges, 7);
  // Views: the owner sees it; another player does not.
  s.entities.hero.sheet.items[0].charges = 0;
  const v = ok(apply(s, { type: "advanceTime", minutes: 1440 }, DM));
  const seen = viewEvents(v.events, s, PAT);
  assert.ok(seen.some((e) => e.type === "recharged" && e.charges > 0));
  assert.ok(!seen.some((e) => e.type === "manual" && /once a dawn/.test(e.text)), "the reminder is the DM's");
  const fake = v.events.filter((e) => e.type === "recharged").map((e) => ({ ...e, id: "m1" }));
  assert.deepEqual(viewEvents(fake, s, PAT), [], "a foe's items are not told");
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
  fight(s);
  const r = ok(apply(s, { type: "use", actor: "hero", item: "w", target: "m1" }, PAT));
  assert.equal(viewEvents(r.events, s, PAT).find((e) => e.type === "cast").item, "Wand of Magic Missiles", "the cast says what it came from");
  const mine = viewEvents(r.events, s, PAT).find((e) => e.type === "item");
  assert.equal(mine.charges, 6);
  const fake = [{ ...r.events[0], id: "m1" }];
  s.entities.m1.hidden = true;
  assert.deepEqual(viewEvents(fake, s, PAT), [], "a hidden creature's use is not sent");
  delete s.entities.m1.hidden;
  const seen = viewEvents(fake, s, PAT)[0];
  assert.ok(seen && seen.charges === undefined && seen.key === undefined && seen.use === "Cast Magic Missile");
});
