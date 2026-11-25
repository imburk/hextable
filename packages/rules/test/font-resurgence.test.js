// Font of Inspiration (bard 5) and Wild Resurgence (druid 5): a spell slot for a use, and a use for a slot, with no action
// (engine/features.js, swap; docs/specs/rules-expansion.md, "Build notes: Font of Inspiration and Wild Resurgence").
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { lintPack } from "../src/content/schema.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); };
const A = { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 16 };
const bard = (level) => ({ name: "Zaa", class: "bard", level, ...(level >= 3 ? { subclass: "lore" } : {}), abilities: A,
  skills: ["performance", "persuasion", "insight", "history", "arcana", "deception"], expertise: ["performance", "persuasion"], weapons: ["dagger"], spells: ["vicious-mockery"] });
const druid = (level) => ({ name: "Ven", class: "druid", level, ...(level >= 3 ? { subclass: "land" } : {}), abilities: A, skills: ["nature", "perception"],
  choices: { "primal-order": "warden" }, armour: "leather-armor", shield: true, weapons: ["quarterstaff"], spells: ["produce-flame", "cure-wounds"] });
const multi = { name: "Isa", classes: [{ class: "bard", level: 5, subclass: "lore", spells: ["vicious-mockery"] }, { class: "druid", level: 5, subclass: "land", spells: ["produce-flame"] }], abilities: A,
  skills: ["performance", "persuasion", "insight", "nature", "perception", "history"], expertise: ["performance", "persuasion"],
  choices: { "primal-order": "warden" }, weapons: ["dagger"] };

function field(sheet) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (!["rogue", "m1"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  ok(apply(s, { type: "place", actor: "rogue", to: { q: -3, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "m1", to: { q: 2, r: 0 } }, DM));
  s.entities.m1.hp = s.entities.m1.maxHp = 300;
  return s;
}
const sw = (s, feature, swap, slot) => apply(s, { type: "feature", actor: "hero", feature, swap, ...(slot ? { slot } : {}) }, DM);
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 20 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };

test("the features are there from level 5, and clean", () => {
  const ids = (sh) => derive(sh).record.feats.map((f) => f.id);
  assert.ok(!ids(bard(4)).includes("font-of-inspiration")); assert.ok(ids(bard(5)).includes("font-of-inspiration"));
  assert.ok(!ids(druid(4)).includes("wild-resurgence")); assert.ok(ids(druid(5)).includes("wild-resurgence"));
  assert.deepEqual(validate(bard(5)), []); assert.deepEqual(validate(druid(5)), []);
  assert.equal(derive(druid(5)).record.feats.find((f) => f.id === "wild-resurgence").tier, "auto");
});

test("Font of Inspiration: a spell slot for one use of Bardic Inspiration, with no action, never past the maximum", () => {
  const s = field(bard(5));
  const e = s.entities.hero, max = e.uses["bardic-inspiration"], slots = e.slots[1];
  no(sw(s, "font-of-inspiration", "slot-for-inspiration", 1), /all its uses/);
  assert.equal(e.slots[1], slots, "a refused swap costs nothing");
  e.uses["bardic-inspiration"] = 1;
  no(sw(s, "font-of-inspiration", "slot-for-inspiration"), /Name a spell slot/);
  no(sw(s, "font-of-inspiration", "slot-for-inspiration", 9), /Name a spell slot/);
  no(sw(s, "font-of-inspiration"), /Say which swap/);
  ok(sw(s, "font-of-inspiration", "slot-for-inspiration", 3));
  assert.equal(e.uses["bardic-inspiration"], 2); assert.equal(e.slots[3], e.slotsMax[3] - 1);
  e.uses["bardic-inspiration"] = 0;
  for (let i = 0; i < 2; i++) ok(sw(s, "font-of-inspiration", "slot-for-inspiration", 1));     // as often as it has slots and uses to regain
  assert.equal(e.uses["bardic-inspiration"], 2); assert.ok(max >= 2);
  // in a fight it takes no action
  e.uses["bardic-inspiration"] = 0; fight(s); turnOf(s, "hero");
  const b = structuredClone(s.encounter.budget);
  ok(sw(s, "font-of-inspiration", "slot-for-inspiration", 1));
  assert.deepEqual(s.encounter.budget, b);
});

test("Wild Resurgence: a slot for a use of Wild Shape only with none left, once on each of the turns", () => {
  const s = field(druid(5));
  const e = s.entities.hero;
  no(sw(s, "wild-resurgence", "slot-for-shape", 1), /still has uses/);
  e.uses["wild-shape"] = 0;
  no(sw(s, "wild-resurgence", "slot-for-shape"), /Name a spell slot/);
  ok(sw(s, "wild-resurgence", "slot-for-shape", 2));
  assert.equal(e.uses["wild-shape"], 1); assert.equal(e.slots[2], e.slotsMax[2] - 1);
  e.uses["wild-shape"] = 0;                                         // outside a fight there are no turns to count
  ok(sw(s, "wild-resurgence", "slot-for-shape", 1));
  e.uses["wild-shape"] = 0; fight(s); turnOf(s, "hero");
  ok(sw(s, "wild-resurgence", "slot-for-shape", 1));
  e.uses["wild-shape"] = 0;
  no(sw(s, "wild-resurgence", "slot-for-shape", 1), /already used .* this turn/);
  turnOf(s, "m1"); no(sw(s, "wild-resurgence", "slot-for-shape", 1), /own turn/);
  turnOf(s, "hero"); ok(sw(s, "wild-resurgence", "slot-for-shape", 1));
});

test("Wild Resurgence: a use of Wild Shape for a level 1 slot, once until a Long Rest", () => {
  const s = field(druid(5));
  const e = s.entities.hero, shapes = e.uses["wild-shape"];
  e.slots[1] = 0;
  ok(sw(s, "wild-resurgence", "shape-for-slot"));
  assert.equal(e.uses["wild-shape"], shapes - 1); assert.equal(e.slots[1], 1); assert.equal(e.uses["wild-resurgence"], 0);
  no(sw(s, "wild-resurgence", "shape-for-slot"), /no uses of Wild Resurgence/);
  assert.equal(e.uses["wild-shape"], shapes - 1, "refused: nothing paid");
  ok(apply(s, { type: "rest" }, DM));
  assert.equal(e.uses["wild-resurgence"], 1); assert.equal(e.uses["wild-shape"], shapes);
  e.uses["wild-shape"] = 0;
  no(sw(s, "wild-resurgence", "shape-for-slot"), /no use of Wild Shape/);
  assert.equal(e.uses["wild-resurgence"], 1, "a refusal leaves the use");
  no(apply(s, { type: "feature", actor: "hero", feature: "wild-resurgence" }, DM), /Say which swap/);
});

test("a bard 5 / druid 5 multiclass has both", () => {
  assert.deepEqual(validate(multi), []);
  const s = field(multi), e = s.entities.hero;
  assert.ok(e.feats.some((f) => f.id === "font-of-inspiration") && e.feats.some((f) => f.id === "wild-resurgence"));
  e.uses["bardic-inspiration"] = 0; e.uses["wild-shape"] = 0;
  ok(sw(s, "font-of-inspiration", "slot-for-inspiration", 1)); assert.equal(e.uses["bardic-inspiration"], 1);
  ok(sw(s, "wild-resurgence", "slot-for-shape", 1)); assert.equal(e.uses["wild-shape"], 1);
  const t = field({ ...multi, classes: [{ class: "bard", level: 4, subclass: "lore" }, { class: "druid", level: 5, subclass: "land" }] });
  assert.ok(!t.entities.hero.feats.some((f) => f.id === "font-of-inspiration"));
});

test("the linter takes a swap and refuses bad ones", () => {
  const cls = (grants, uses) => ({ id: "x", name: "X", source: "S", text: "t", checked: false, hitDie: 8, primary: ["str"], saves: ["str", "con"], armour: [], weapons: ["simple"],
    skills: { choose: 1, from: ["athletics"] }, table: {}, casting: null, features: [{ id: "f", name: "F", level: 1, tier: "auto", checked: false, text: "t", grants, ...(uses ? { uses } : {}) },
      { id: "p", name: "P", level: 1, tier: "auto", checked: false, text: "t", uses: { max: 2, recharge: "long" } }], subclass: { id: "s", name: "S", text: "t", checked: false, features: [] } });
  const lint = (swap, uses) => lintPack({ pack: { id: "p", name: "P", license: "L", attribution: "A" }, classes: [cls({ swap }, uses)] });
  const good = { id: "a", give: { slot: true }, get: { resource: "p" } };
  assert.deepEqual(lint([good]), []);
  assert.ok(lint([{ ...good, give: { slot: 2 } }]).some((p) => /give is/.test(p)));
  assert.ok(lint([{ ...good, get: { slot: true } }]).some((p) => /get is/.test(p)));
  assert.ok(lint([{ ...good, per: "day" }]).some((p) => /per is/.test(p)));
  assert.ok(lint([{ ...good, per: "use" }]).some((p) => /per use/.test(p)));
  assert.deepEqual(lint([{ ...good, per: "use" }], { max: 1, recharge: "long" }), []);
  assert.ok(lint([{ id: "b", give: { slot: true }, get: { slot: 1 } }]).some((p) => /not given for a slot/.test(p)));
  assert.ok(lint([good, good]).some((p) => /own id/.test(p)));
});

test("a homebrew pack's swap is refused for now", async () => {
  const { loadPack } = await import("../src/content/registry.js");
  const grants = { swap: [{ id: "a", give: { slot: true }, get: { resource: "hb-p-f2" } }] };
  const feat = (id, g, more = {}) => ({ id: `hb-p-${id}`, name: id, level: 3, tier: "auto", checked: false, text: "A thing.", grants: g, ...more });
  const r = loadPack({ format: "hextable-pack", v: 1, pack: { id: "p", name: "P", version: 1, license: "CC0, by the author", attribution: "Written for a test." },
    subclasses: [{ id: "hb-p-oath", name: "Oath", class: "paladin", source: "homebrew:p", checked: false, text: "Sworn.", features: [feat("f1", grants), feat("f2", {}, { uses: { max: 2, recharge: "long" } })] }] });
  assert.equal(r.ok, false);
  assert.match((r.problems ?? []).join("\n"), /cannot swap a spell slot/);
});

test("outside a fight the DM is told the once-per-turn limit is theirs to judge", () => {
  const s = field(druid(5)), e = s.entities.hero;
  e.uses["wild-shape"] = 0;
  const r = ok(sw(s, "wild-resurgence", "slot-for-shape", 1));
  assert.ok(r.events.some((x) => x.type === "manual" && /once on each of/.test(x.text)));
  e.uses["wild-shape"] = 0; fight(s); turnOf(s, "hero");
  const r2 = ok(sw(s, "wild-resurgence", "slot-for-shape", 1));
  assert.ok(!r2.events.some((x) => x.type === "manual"));
  // a swap with no turn limit says nothing
  e.uses["wild-shape"] = 1; e.slots[1] = 0;
  assert.ok(!ok(sw(s, "wild-resurgence", "shape-for-slot")).events.some((x) => x.type === "manual"));
});
