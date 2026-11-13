// Sorcerer features (SRD 5.2.1) at the levels the party plays: Font of Magic trading Sorcery Points
// and spell slots, Metamagic on the `cast` action, Sorcerous Restoration on a Short Rest, Sorcery
// Incarnate (a second way to pay for Innate Sorcery, two options a spell) and Dragon Wings (a Fly
// Speed for an hour, `speed.fly`).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { speedOf } from "../src/modifiers.js";
import { lintPack } from "../src/content/schema.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); };
const A = { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 18 };
const ALL = ["careful", "distant", "extended", "heightened", "quickened", "subtle", "transmuted", "twinned"];
const sorc = (level, mm = ["careful", "quickened"], mm10 = ["heightened", "transmuted"], more = {}) => ({ name: "Jed", class: "sorcerer", level, ...(level >= 3 ? { subclass: "draconic" } : {}),
  abilities: A, skills: ["arcana", "insight"], choices: { ...(level >= 2 ? { metamagic: mm } : {}), ...(level >= 6 ? { "elemental-affinity": "fire" } : {}), ...(level >= 10 ? { "metamagic-10": mm10 } : {}) },
  spells: ["fire-bolt", "shocking-grasp", "fireball", "hold-person", "haste", "scorching-ray", "burning-hands"], ...more });

function field(sheet) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (!["rogue", "fighter", "m1", "m2"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  ok(apply(s, { type: "place", actor: "rogue", to: { q: 6, r: 1 } }, DM));
  ok(apply(s, { type: "place", actor: "fighter", to: { q: -4, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "m1", to: { q: 6, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "m2", to: { q: 7, r: 0 } }, DM));
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 300;
  return s;
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 9 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 30 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const ready = (sheet) => { const s = field(sheet); fight(s); turnOf(s, "hero"); return s; };
const cast = (s, x) => apply(s, { type: "cast", actor: "hero", ...x }, DM);

test("the sorcerer's features at their levels; Metamagic picks two options, two more at 10", () => {
  const ids = (l) => derive(sorc(l)).record.feats.map((f) => f.id);
  assert.ok(ids(2).includes("metamagic-careful") && ids(2).includes("metamagic-quickened"));
  assert.ok(ids(10).includes("metamagic-10-heightened"));
  for (const [id, l] of [["sorcery-incarnate", 7], ["dragon-wings", 14]]) { assert.ok(!ids(l - 1).includes(id)); assert.ok(ids(l).includes(id)); }
  assert.deepEqual(validate(sorc(15)), []);
  assert.deepEqual(validate({ ...sorc(6), choices: { "elemental-affinity": "fire" } }), [], "Metamagic left unchosen: none known");
  assert.ok(validate(sorc(2, ["careful", "nope"])).some((p) => /no option "nope"/.test(p)));
  assert.ok(validate(sorc(2, ["careful", "distant", "subtle"])).some((p) => /up to 2/.test(p)));
  assert.ok(validate(sorc(10, ["careful", "subtle"], ["careful", "distant"])).some((p) => /chosen twice/.test(p)));
  assert.equal(derive(sorc(15)).record.feats.find((f) => f.id === "font-of-magic").uses.max, 15);
  assert.deepEqual(derive(sorc(15)).record.slots, { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 });
});

test("Font of Magic: a slot for its points (no action), a slot made for points (a Bonus Action), within the limits", () => {
  const s = field(sorc(15)), e = s.entities.hero;
  e.uses["font-of-magic"] = 10;
  ok(apply(s, { type: "feature", actor: "hero", feature: "font-of-magic", spend: 3 }, DM));
  assert.equal(e.uses["font-of-magic"], 13); assert.equal(e.slots[3], 2);
  no(apply(s, { type: "feature", actor: "hero", feature: "font-of-magic", spend: 4 }, DM), /more than 15 points/);
  fight(s); turnOf(s, "hero");
  ok(apply(s, { type: "feature", actor: "hero", feature: "font-of-magic", make: 5 }, DM));
  assert.equal(e.uses["font-of-magic"], 6); assert.equal(e.slots[5], 3); assert.equal(s.encounter.budget.bonus, 0);
  no(apply(s, { type: "feature", actor: "hero", feature: "font-of-magic", make: 1 }, DM), /Bonus Action/);
  no(apply(s, { type: "feature", actor: "hero", feature: "font-of-magic", make: 6 }, DM), /level 1 to 5/);
  const low = field(sorc(4)); low.entities.hero.uses["font-of-magic"] = 4;
  no(apply(low, { type: "feature", actor: "hero", feature: "font-of-magic", make: 3 }, DM), /from level 5/);
  // A made slot is gone after a Long Rest.
  s.encounter = null;
  ok(apply(s, { type: "rest", ids: ["hero"] }, DM));
  assert.equal(e.slots[5], 2); assert.equal(e.uses["font-of-magic"], 15);
});

test("Quickened Spell: an action spell as a Bonus Action for 2 points; no level 1+ spell after it this turn", () => {
  const s = field(sorc(15)), e = s.entities.hero; fight(s); turnOf(s, "hero");
  ok(cast(s, { spell: "fire-bolt", target: "m1", metamagic: ["quickened"] }));
  assert.equal(e.uses["font-of-magic"], 13); assert.equal(s.encounter.budget.bonus, 0); assert.equal(s.encounter.budget.action, 1);
  no(cast(s, { spell: "hold-person", target: "m1" }), /one spell slot/i);
  ok(cast(s, { spell: "fire-bolt", target: "m1" }));
  no(cast(s, { spell: "fire-bolt", target: "m1", metamagic: ["distant"] }), /doesn't know that Metamagic/);
});

test("Careful, Heightened and Transmuted Spell change the saves and the damage", () => {
  const s = ready(sorc(15)), e = s.entities.hero;
  const r = ok(cast(s, { spell: "fireball", hex: { q: 6, r: 0 }, slot: 3, metamagic: ["careful"], careful: ["rogue"] }));
  const rs = r.events.find((x) => x.type === "save" && x.id === "rogue");
  assert.ok(rs.success && rs.careful);
  assert.ok(!r.events.some((x) => x.type === "damage" && x.target === "rogue"), "no damage where it would take half");
  assert.ok(r.events.some((x) => x.type === "damage" && x.target === "m1"));
  assert.equal(e.uses["font-of-magic"], 14);
  const s2 = ready(sorc(15));
  const r2 = ok(cast(s2, { spell: "fireball", hex: { q: 6, r: 0 }, slot: 3, metamagic: ["heightened"], heightened: "m1" }));
  const h = r2.events.find((x) => x.type === "save" && x.id === "m1");
  assert.equal(h.mode, "dis"); assert.deepEqual(h.why, ["Heightened Spell"]);
  const s3 = ready(sorc(15));
  const r3 = ok(cast(s3, { spell: "fireball", hex: { q: 6, r: 0 }, slot: 3, metamagic: ["transmuted"], transmute: "cold" }));
  assert.ok(r3.events.filter((x) => x.type === "damage").every((x) => x.dtype === "cold"));
  no(cast(ready(sorc(15)), { spell: "fireball", hex: { q: 6, r: 0 }, slot: 3, metamagic: ["transmuted"], transmute: "fire" }), /Choose the damage type/);
  no(cast(ready(sorc(15)), { spell: "fireball", hex: { q: 6, r: 0 }, slot: 3, metamagic: ["careful"], careful: ["fighter"] }), /creatures the spell affects/);
  no(cast(ready(sorc(15)), { spell: "fireball", hex: { q: 6, r: 0 }, slot: 3, careful: ["rogue"] }), /goes with that Metamagic/);
});

test("one Metamagic option a spell, two while Innate Sorcery runs with Sorcery Incarnate; Innate Sorcery for 2 points when its uses are gone", () => {
  const s = ready(sorc(15)), e = s.entities.hero;
  no(cast(s, { spell: "fireball", hex: { q: 6, r: 0 }, slot: 3, metamagic: ["careful", "heightened"], careful: ["rogue"], heightened: "m1" }), /One Metamagic option/);
  e.uses["innate-sorcery"] = 0;
  ok(apply(s, { type: "feature", actor: "hero", feature: "innate-sorcery" }, DM));
  assert.equal(e.uses["font-of-magic"], 13, "2 points for Innate Sorcery");
  ok(cast(s, { spell: "fireball", hex: { q: 6, r: 0 }, slot: 3, metamagic: ["careful", "heightened"], careful: ["rogue"], heightened: "m1" }));
  assert.equal(e.uses["font-of-magic"], 10);
  // Below level 7 there is no second way to pay.
  const six = ready(sorc(6)); six.entities.hero.uses["innate-sorcery"] = 0;
  no(apply(six, { type: "feature", actor: "hero", feature: "innate-sorcery" }, DM), /no uses of Innate Sorcery/);
});

test("Distant, Extended, Subtle and Twinned Spell", () => {
  const s = ready(sorc(15)), e = s.entities.hero;
  ok(apply(s, { type: "place", actor: "m1", to: { q: 5, r: 0 } }, DM));
  no(cast(s, { spell: "shocking-grasp", target: "m1" }), /reaches touch/);
  const s1 = ready(sorc(15, ["distant", "extended"], ["subtle", "twinned"]));
  ok(apply(s1, { type: "place", actor: "m1", to: { q: 5, r: 0 } }, DM));
  ok(cast(s1, { spell: "shocking-grasp", target: "m1", metamagic: ["distant"] }), "Touch becomes 30 feet");
  s1.encounter.budget.action = 1;
  const r = ok(cast(s1, { spell: "hold-person", target: "m1", slot: 2, metamagic: ["extended"] }));
  const fx = s1.effects.find((x) => x.spell === "hold-person");
  assert.equal(fx.lasts, "2 minutes");
  assert.ok(fx.parts.some((p) => p.target === "hero" && p.modifier?.on === "concentration" && p.modifier.op === "advantage"));
  void r;
  const s2 = ready(sorc(15, ["distant", "extended"], ["subtle", "twinned"]));
  ok(cast(s2, { spell: "hold-person", targets: ["m1", "m2"], slot: 2, metamagic: ["twinned"] }));
  no(cast(ready(sorc(15, ["distant", "extended"], ["subtle", "twinned"])), { spell: "fireball", hex: { q: 6, r: 0 }, slot: 3, metamagic: ["twinned"] }), /targets another creature/);
  const s3 = ready(sorc(15, ["distant", "extended"], ["subtle", "twinned"]));
  s3.entities.hero.hiding = { dc: 30 };
  ok(cast(s3, { spell: "fire-bolt", target: "m1", metamagic: ["subtle"] }));
  void e;
});

test("Empowered and Seeking Spell are left to the DM: the engine says so", () => {
  const { record } = derive(sorc(2, ["empowered", "seeking"]));
  assert.ok(!record.feats.some((f) => f.metamagic));
  const s = field(sorc(2, ["empowered", "seeking"]));
  no(cast(s, { spell: "fire-bolt", target: "m1", metamagic: ["empowered"] }), /doesn't know that Metamagic/);
});

test("Sorcerous Restoration: on a Short Rest, half the Sorcerer level in points, once per Long Rest", () => {
  const s = field(sorc(15)), e = s.entities.hero;
  e.uses["font-of-magic"] = 2;
  ok(apply(s, { type: "shortRest", restore: ["hero"] }, DM));
  assert.equal(e.uses["font-of-magic"], 9); assert.equal(e.uses["sorcerous-restoration"], 0);
  no(apply(s, { type: "shortRest", restore: ["hero"] }, DM), /nothing that restores points/);
  e.uses["font-of-magic"] = 14; e.uses["sorcerous-restoration"] = 1;
  ok(apply(s, { type: "shortRest", restore: ["hero"] }, DM));
  assert.equal(e.uses["font-of-magic"], 15, "never above the pool");
});

test("Dragon Wings: a Fly Speed of 60 feet for an hour, once per Long Rest or for 3 Sorcery Points", () => {
  const s = field(sorc(14)), e = s.entities.hero;
  assert.equal(speedOf(s, e, "fly"), 0);
  ok(apply(s, { type: "feature", actor: "hero", feature: "dragon-wings" }, DM));
  assert.equal(speedOf(s, e, "fly"), 60);
  ok(apply(s, { type: "advanceTime", minutes: 61 }, DM));
  assert.equal(speedOf(s, e, "fly"), 0);
  ok(apply(s, { type: "feature", actor: "hero", feature: "dragon-wings" }, DM));
  assert.equal(e.uses["font-of-magic"], 11);
  e.uses["font-of-magic"] = 2;
  ok(apply(s, { type: "advanceTime", minutes: 61 }, DM));
  no(apply(s, { type: "feature", actor: "hero", feature: "dragon-wings" }, DM), /no uses of Dragon Wings/);
});

test("the linter takes the sorcerer's grants and refuses bad ones", () => {
  const cls = (grants, extra = {}) => ({ id: "x", name: "X", source: "S", text: "t", checked: false, hitDie: 8, primary: ["str"], saves: ["str", "con"], armour: [], weapons: ["simple"],
    skills: { choose: 1, from: ["athletics"] }, table: {}, casting: null, features: [{ id: "f", name: "F", level: 1, tier: "auto", checked: false, text: "t", grants, uses: { max: 2, recharge: "long" }, ...extra }],
    subclass: { id: "s", name: "S", text: "t", checked: false, features: [] } });
  const lint = (g, extra) => lintPack({ pack: { id: "p", name: "P", license: "L", attribution: "A" }, classes: [cls(g, extra)] });
  assert.deepEqual(lint({ metamagic: { id: "careful", cost: 1, pool: "f" } }), []);
  assert.ok(lint({ metamagic: { id: "wobbly", cost: 1, pool: "f" } }).some((p) => /metamagic is/.test(p)));
  assert.deepEqual(lint({ exchange: { costs: { 1: 2 }, minLevel: { 1: 2 } } }), []);
  assert.ok(lint({ exchange: { costs: { 1: 0 }, minLevel: { 1: 2 } } }).some((p) => /exchange is/.test(p)));
  assert.deepEqual(lint({ restore: { of: "f", max: { byLevel: { 5: 2 } } } }), []);
  assert.deepEqual(lint({ action: { time: "bonus", target: { self: true }, duration: "1 hour", orCost: { resource: "f", n: 3 }, effects: [{ modifier: { on: "speed.fly", op: "set", value: 60 } }] } }), []);
  assert.ok(lint({ action: { time: "bonus", target: { self: true }, orCost: { resource: "f" }, effects: [{ manual: "x" }] } }).some((p) => /orCost/.test(p)));
  const opts = [{ id: "a", name: "A", tier: "auto", text: "t" }, { id: "b", name: "B", tier: "auto", text: "t" }, { id: "c", name: "C", tier: "auto", text: "t" }];
  assert.deepEqual(lint(undefined, { pick: 2, options: opts }), []);
  assert.ok(lint(undefined, { pick: 3, options: opts }).some((p) => /pick/.test(p)));
  void ALL;
});
