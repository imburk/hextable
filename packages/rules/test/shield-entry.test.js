// Issue #454 (DEBT T59 (3)): a Shield's Armor Class is read from its entry, and the refusal of an untrained weapon says what is true.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT } from "../src/content/index.js";
import { loadPack, overlayOf, using } from "../src/content/registry.js";
import { apply, makeEntity } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const A = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 };
const fighter = (more = {}) => ({ name: "Fi", class: "fighter", level: 5, subclass: "champion", abilities: A, skills: ["athletics", "perception"],
  choices: { "fighting-style": "defense" }, armour: "chain-mail", weapons: ["longsword"], ...more });
const wizard = (more = {}) => ({ name: "Wen", class: "wizard", level: 1, abilities: A, skills: ["arcana", "history"], ...more });
const mk = (id, o) => ({ id, name: id, category: "shield", ac: 3, source: "homebrew:t", checked: false, ...o });
const HB = mk("hb-t-tower", { name: "Tower shield" });
const PACK = { format: "hextable-pack", v: 1, pack: { id: "t", name: "t", version: 1, license: "CC0, by the author", attribution: "Written for a test." },
  armour: [HB, { ...mk("hb-t-plate"), category: "heavy", ac: 17, name: "Test plate" }] };
const loaded = loadPack(PACK);
const ov = () => { assert.ok(loaded.ok, loaded.problems?.join("; ")); return overlayOf([loaded.pack]); };
const ac = (sh) => derive(sh).record.ac;
const problems = (sh) => validate(sh);

test("the SRD Shield is still +2 and reads Shield +2; an old save with shield: true is unchanged", () => {
  assert.equal(ac(fighter({ shield: true })), ac(fighter()) + 2);
  assert.ok(derive(fighter({ shield: true })).why.ac.includes("Shield +2"));
  assert.equal(derive(fighter({ shield: true })).record.shield, true);
  assert.deepEqual(problems(fighter({ shield: true })), []);
});

test("a table's own Shield, named by id, adds its entry's number through using()", () => {
  using(ov(), () => {
    const sh = fighter({ shield: HB.id });
    assert.deepEqual(problems(sh), []);
    assert.equal(ac(sh), ac(fighter()) + 3);
    const d = derive(sh);
    assert.ok(d.why.ac.includes("Tower shield +3"));
    assert.equal(d.record.shield, true);
    // Put away beside an id.
    assert.deepEqual(problems({ ...sh, shieldStowed: true }), []);
    assert.equal(ac({ ...sh, shieldStowed: true }), ac(fighter()));
  });
  assert.ok(problems(fighter({ shield: HB.id })).some((p) => /not a Shield/.test(p)), "without the pack the id is unknown");
});

test("a magic Shield is its base entry's number plus its bonus: the SRD +1 is 3; an item built on a Shield entry reads that entry", () => {
  const item = (n) => fighter({ items: [{ id: "i1", item: n, equipped: true }] });
  assert.equal(ac(item("shield-plus-1")), ac(fighter()) + 3);
  assert.ok(derive(item("shield-plus-1")).why.ac.includes("Shield +2") && derive(item("shield-plus-1")).why.ac.some((w) => /^Magic \+1/.test(w)));
  // The linter lets no pack item name a Shield base yet, so the item is lent to the lookups directly.
  using(ov(), () => {
    CONTENT.items["hb-t-bulwark"] = { id: "hb-t-bulwark", name: "Bulwark", category: "armor", rarity: "common", wear: "shield", bonus: 1, base: { armour: ["hb-t-tower"] }, tier: "auto", source: "homebrew:t", checked: false, text: "x" };
    try { assert.equal(ac(item("hb-t-bulwark")), ac(fighter()) + 4); } finally { delete CONTENT.items["hb-t-bulwark"]; }
  });
});

test("an unknown id and an entry that is not a Shield are refused in a plain sentence", () => {
  using(ov(), () => {
    assert.ok(problems(fighter({ shield: "no-such" })).includes('"no-such" is not a Shield in the equipment tables.'));
    assert.ok(problems(fighter({ shield: "chain-mail" })).includes('"chain-mail" is not a Shield in the equipment tables.'));
    assert.ok(problems(fighter({ shield: "hb-t-plate" })).includes('"hb-t-plate" is not a Shield in the equipment tables.'));
    assert.ok(problems(fighter({ shield: "toString" })).some((p) => /not a Shield/.test(p)));
    assert.ok(problems(fighter({ shield: 3 })).length > 0);
    assert.ok(problems(fighter({ armour: "shield" })).some((p) => /Shield field/.test(p)));
    assert.ok(problems(fighter({ armour: null, shield: false, shieldStowed: true })).length > 0, "stowed needs a Shield");
  });
});

test("the shield action works with an id: away and back, Armor Class down and up", () => {
  using(ov(), () => {
    const sh = fighter({ shield: HB.id, weapons: ["greatsword"] }), s = newGame(7);
    for (const id of Object.keys(s.entities)) delete s.entities[id];
    s.entities.hero = makeEntity(derive(sh).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
    s.entities.hero.sheet = structuredClone(sh);
    const base = s.entities.hero.ac;
    ok(apply(s, { type: "shield", actor: "hero", on: false }, DM));
    assert.equal(s.entities.hero.ac, base - 3);
    assert.equal(s.entities.hero.sheet.shield, HB.id);
    assert.equal(s.entities.hero.sheet.shieldStowed, true);
    ok(apply(s, { type: "shield", actor: "hero", on: true }, DM));
    assert.equal(s.entities.hero.ac, base);
    assert.equal(s.entities.hero.sheet.shieldStowed, undefined);
  });
});

test("an untrained weapon is refused with words that are true, and setSheet reads sensibly", () => {
  const sh = wizard({ weapons: ["longsword"] });
  const p = problems(sh);
  assert.deepEqual(p, ["A Wizard is not proficient with the Longsword, and the engine does not yet apply attacking without proficiency, so choose another weapon."]);
  const r = apply(newGame(3), { type: "setSheet", sheet: sh }, DM);
  assert.equal(r.ok, false);
  assert.match(r.error, /^That sheet can't be played yet\. A Wizard is not proficient with the Longsword, and the engine does not yet apply attacking without proficiency, so choose another weapon\.$/);
  assert.ok(!/added without/.test(r.error));
  const item = wizard({ items: [{ id: "i1", item: "weapon-plus-1", base: "longsword", equipped: true }] });
  assert.ok(problems(item).some((x) => /not proficient with the Longsword, and the engine does not yet apply attacking without proficiency, so leave Longsword \+1 unequipped\./.test(x)), problems(item).join("|"));
});
