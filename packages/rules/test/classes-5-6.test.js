// Class features gained at levels 5 and 6 (SRD 5.2.1): Extra Attack, Stunning Strike, Wholeness of
// Body, Elemental Affinity, and the class's own save DC and table dice in feature steps (derive.js).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { lintPack } from "../src/content/schema.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const A = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 10 };
const monk = (level, abil = {}) => ({ name: "Lo", class: "monk", level, ...(level >= 3 ? { subclass: "open-hand" } : {}), abilities: { ...A, dex: 16, wis: 14, ...abil }, skills: ["acrobatics", "insight"], weapons: ["quarterstaff"] });
const sorc = (level, choices) => ({ name: "Ash", class: "sorcerer", level, subclass: "draconic", abilities: { ...A, cha: 16 }, skills: ["arcana", "insight"], spells: ["fire-bolt"], ...(choices ? { choices } : {}) });

function field(sheet) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (id !== "rogue") delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  ok(apply(s, { type: "place", actor: "rogue", to: { q: -4, r: 0 } }, DM));
  s.foe = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 } }, DM)).events[0].id;
  s.entities[s.foe].hp = s.entities[s.foe].maxHp = 500;
  return s;
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 20 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const use = (s, feature, more = {}) => apply(s, { type: "feature", actor: "hero", feature, ...more }, DM);

test("Extra Attack at level 5 for Barbarian, Fighter, Monk, Paladin and Ranger, not before", () => {
  for (const cls of ["barbarian", "fighter", "monk", "paladin", "ranger"]) {
    const base = { name: "X", class: cls, abilities: A, skills: [], choices: { "fighting-style": "defense" } };
    assert.equal(derive({ ...base, level: 4, subclass: undefined }).record.features?.extraAttack, undefined, `${cls} 4`);
    assert.equal(derive({ ...base, level: 5 }).record.features.extraAttack, 1, `${cls} 5`);
  }
  for (const cls of ["bard", "cleric", "druid", "rogue", "sorcerer", "warlock", "wizard"])
    assert.equal(derive({ name: "X", class: cls, level: 6, abilities: A, skills: [] }).record.features?.extraAttack, undefined, cls);
});

test("Stunning Strike: 1 Focus Point, a Constitution save against 8 + Proficiency + Wisdom, Stunned to the monk's next turn", () => {
  const { record } = derive(monk(5));
  const step = record.feats.find((f) => f.id === "stunning-strike").action.effects[0];
  assert.equal(step.dc, 8 + 3 + 2, "Focus save DC at level 5 with Wisdom 14");
  let failed = false, saved = false;
  for (let seed = 1; seed < 40 && !(failed && saved); seed++) {
    const s = field(monk(5)), e = s.entities.hero, foe = s.foe;
    s.rng = seed * 7919;
    fight(s); turnOf(s, "hero");
    const focus = e.uses["monks-focus"];
    assert.equal(focus, 5);
    const r = ok(use(s, "stunning-strike", { target: foe }));
    assert.equal(e.uses["monks-focus"], focus - 1);
    assert.equal(s.encounter.budget.bonus, 1, "it costs no action");
    const sv = r.events.find((x) => x.type === "save");
    assert.equal(sv.dc, 13); assert.equal(sv.abil, "con");
    if (!sv.success) {
      failed = true;
      assert.ok(s.entities[foe].cond.stunned, "Stunned");
      ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
      assert.ok(s.entities[foe].cond.stunned, "still Stunned on its own turn");
      turnOf(s, "hero");
      assert.ok(!s.entities[foe].cond.stunned, "ends at the start of the monk's next turn");
    } else {
      saved = true;
      assert.ok(!s.entities[foe].cond.stunned);
      assert.ok(r.events.some((x) => x.type === "manual" && /Speed is halved/.test(x.text)), "the DM is told what a success does");
    }
  }
  assert.ok(failed && saved, "both outcomes seen");
});

test("Stunning Strike with no Focus Points left, or out of reach, is rejected and changes nothing", () => {
  const s = field(monk(5)), e = s.entities.hero;
  fight(s); turnOf(s, "hero");
  e.uses["monks-focus"] = 0;
  const before = JSON.stringify(s);
  const r = use(s, "stunning-strike", { target: s.foe });
  assert.equal(r.ok, false); assert.match(r.error, /no uses of Monk's Focus/);
  assert.equal(JSON.stringify(s), before);
  e.uses["monks-focus"] = 2;
  ok(apply(s, { type: "place", actor: s.foe, to: { q: 4, r: 0 } }, DM));
  const b2 = JSON.stringify(s);
  assert.equal(use(s, "stunning-strike", { target: s.foe }).ok, false);
  assert.equal(JSON.stringify(s), b2);
});

test("Wholeness of Body: a Bonus Action, Martial Arts die + Wisdom, at least 1, Wisdom modifier uses a Long Rest", () => {
  const { record } = derive(monk(6));
  const f = record.feats.find((x) => x.id === "wholeness-of-body");
  assert.deepEqual(f.uses, { max: 2, recharge: "long" });
  assert.deepEqual(f.action.effects[0], { heal: "1d8+2", atLeast: 1 });
  const low = derive(monk(6, { wis: 8 })).record.feats.find((x) => x.id === "wholeness-of-body");
  assert.deepEqual(low.uses, { max: 1, recharge: "long" });
  assert.deepEqual(low.action.effects[0], { heal: "1d8-1", atLeast: 1 });
  assert.equal(derive(monk(5)).record.feats.some((x) => x.id === "wholeness-of-body"), false);

  const s = field(monk(6)), e = s.entities.hero;
  e.hp = 10;
  fight(s); turnOf(s, "hero");
  const h = ok(use(s, "wholeness-of-body")).events.find((x) => x.type === "heal");
  assert.ok(h.amount >= 3 && h.amount <= 10, `1d8+2, got ${h.amount}`);
  assert.equal(e.uses["wholeness-of-body"], 1);
  assert.equal(s.encounter.budget.bonus, 0);
});

test("A heal step's atLeast keeps a low roll at the least it restores", () => {
  for (let seed = 1; seed < 30; seed++) {
    const s = field(monk(6, { wis: 4 })), e = s.entities.hero;   // 1d8-3: a 1, 2 or 3 would restore nothing
    s.rng = seed * 7919; e.hp = 10;
    const h = ok(use(s, "wholeness-of-body")).events.find((x) => x.type === "heal");
    assert.ok(h.amount >= 1, `seed ${seed}: ${h.amount}`);
  }
});

test("Elemental Affinity: a chosen damage type gives Resistance; the choice is needed at level 6", () => {
  assert.ok(validate(sorc(6)).some((p) => /Elemental Affinity/.test(p)), "asks for the choice");
  assert.deepEqual(validate(sorc(6, { "elemental-affinity": "fire" })), []);
  assert.deepEqual(derive(sorc(6, { "elemental-affinity": "fire" })).record.resist, ["fire"]);
  assert.equal(derive(sorc(5)).record.resist, undefined);
});

test("The linter takes a class DC and a table die in feature steps, and refuses bad ones", () => {
  const cls = (effects) => ({ id: "x", name: "X", source: "S", text: "t", checked: false, hitDie: 8, primary: ["str"], saves: ["str", "con"], armour: [], weapons: ["simple"],
    skills: { choose: 1, from: ["athletics"] }, table: { die: Array(20).fill("1d6") }, casting: null,
    features: [{ id: "f", name: "F", level: 1, tier: "auto", checked: false, text: "t", grants: { action: { time: "bonus", target: { self: true }, effects } } }],
    subclass: { id: "s", name: "S", text: "t", checked: false, features: [] } });
  const lint = (effects) => lintPack({ pack: { id: "p", name: "P", license: "L", attribution: "A" }, classes: [cls(effects)] });
  assert.deepEqual(lint([{ heal: { column: "die" }, addMod: "wis", atLeast: 1 }]), []);
  assert.deepEqual(lint([{ save: "con", dc: "wis", onFail: [{ condition: "stunned" }] }]), []);
  assert.ok(lint([{ heal: { column: "nope" } }]).some((p) => /no column/.test(p)));
  assert.ok(lint([{ heal: "1d6", addMod: "luck" }]).some((p) => /addMod/.test(p)));
  assert.ok(lint([{ save: "con", dc: "luck", onFail: [{ condition: "stunned" }] }]).some((p) => /dc/.test(p)));
  assert.ok(lint([{ heal: "1d6", atLeast: 0 }]).some((p) => /atLeast/.test(p)));
});
