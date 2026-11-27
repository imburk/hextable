// Wave 4, part 3, of issue #786: True Seeing (assist, through the `senses` hook), Heroes' Feast (assist, a rolled Hit Point maximum), Greater Restoration (kept manual here; assist from wave 4 part 7).
// Built to docs/specs/rules-expansion.md, "Build notes: wave 4 part 3". Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { apply } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { canSee } from "../src/sight.js";
import { sensesOf } from "../src/modifiers.js";
import { view } from "../src/view.js";
import { partyView } from "../src/vision.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const lint = (def) => lintEntry("spells", def, { strict: false });
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", 0, 0], ["fighter", -2, 0], ["rogue", -4, 4], ["cleric", -3, 0]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  const slots = { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 2 };
  for (const id of ["wizard", "cleric"]) Object.assign(s.entities[id], { slots: { ...slots }, slotsMax: { ...slots } });
  s.entities.wizard.spells.push("true-seeing", "heroes-feast");
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 40;
  return s;
}
const spawn = (s, id, q, r) => { ok(apply(s, { type: "spawn", monster: id, at: { q, r } }, DM)); return Object.values(s.entities).at(-1); };

test("tiers: True Seeing and Heroes' Feast are assist; Greater Restoration was manual then (wave 4 part 7 makes it assist); the entries lint and read", () => {
  assert.equal(SPELLS["true-seeing"].def.tier, "assist");
  assert.equal(SPELLS["heroes-feast"].def.tier, "assist");
  assert.equal(SPELLS["greater-restoration"].def.tier, "assist");      // wave 4 part 7
  for (const id of ["true-seeing", "heroes-feast"]) {
    assert.deepEqual(lint(SPELLS[id].def), [], id);
    assert.deepEqual(readEntry("spell", SPELLS[id].def, {}).problems ?? [], [], id);
  }
});

test("senses hook: only a modifier step with a sense scope and feet", () => {
  const def = SPELLS["true-seeing"].def;
  const bad = (m) => assert.ok(lint({ ...def, effects: [{ modifier: m }] }).length, JSON.stringify(m));
  bad({ on: "senses", op: "add", value: 120, scope: { sense: "truesight" } });
  bad({ on: "senses", op: "set", value: 120 });
  bad({ on: "senses", op: "set", value: 7, scope: { sense: "truesight" } });
  bad({ on: "senses", op: "set", value: 120, scope: { sense: "xray" } });
  bad({ on: "check", op: "add", value: 1, scope: { sense: "truesight" } });
});

test("True Seeing: the caster has Truesight 120 for the hour and sees an Invisible creature; before and after it does not", () => {
  const s = field();
  s.settings.sight = "light";
  const g = spawn(s, "goblin-warrior", 3, 0);
  ok(apply(s, { type: "condition", actor: g.id, condition: "invisible" }, DM));
  assert.equal(canSee(s, s.entities.wizard, s.entities[g.id]), "no");
  assert.equal(sensesOf(s, s.entities.wizard).truesight, undefined);
  ok(apply(s, { type: "cast", actor: "wizard", spell: "true-seeing", target: "wizard", slot: 6 }, DM));
  const fx = s.effects.find((x) => x.name === "True Seeing");
  assert.ok(fx);
  assert.equal(fx.lasts, "1 hour");
  assert.equal(sensesOf(s, s.entities.wizard).truesight, 120);
  assert.equal(s.entities.wizard.senses?.truesight, undefined, "the creature's own senses are not changed");
  assert.equal(canSee(s, s.entities.wizard, s.entities[g.id]), "yes");
  assert.equal(canSee(s, s.entities.cleric, s.entities[g.id]), "no", "another creature gets nothing");
  ok(apply(s, { type: "endEffect", actor: "wizard", effect: fx.id }, DM));
  assert.equal(canSee(s, s.entities.wizard, s.entities[g.id]), "no");
  assert.equal(sensesOf(s, s.entities.wizard).truesight, undefined);
});

test("True Seeing: the party's view shows the Invisible creature after the cast and not before or after the spell ends (no stale cache)", () => {
  const s = field();
  s.settings.sight = "light";
  const g = spawn(s, "goblin-warrior", 3, 0);
  ok(apply(s, { type: "condition", actor: g.id, condition: "invisible" }, DM));
  assert.ok(!partyView(s).creatures.has(g.id), "before");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "true-seeing", target: "wizard", slot: 6 }, DM));
  assert.ok(partyView(s).creatures.has(g.id), "after the cast");
  const fx = s.effects.find((x) => x.name === "True Seeing");
  ok(apply(s, { type: "endEffect", actor: "wizard", effect: fx.id }, DM));
  assert.ok(!partyView(s).creatures.has(g.id), "after it ends");
});

test("True Seeing: it reaches 120 feet and no further", () => {
  const s = field();
  s.settings.sight = "light";
  ok(apply(s, { type: "place", actor: "wizard", to: { q: -12, r: 0 } }, DM));
  const near = spawn(s, "goblin-warrior", 12, 0), far = spawn(s, "goblin-warrior", 13, 0);       // 120 and 125 feet
  for (const g of [near, far]) ok(apply(s, { type: "condition", actor: g.id, condition: "invisible" }, DM));
  ok(apply(s, { type: "cast", actor: "wizard", spell: "true-seeing", target: "wizard", slot: 6 }, DM));
  assert.equal(canSee(s, s.entities.wizard, s.entities[near.id]), "yes");
  assert.equal(canSee(s, s.entities.wizard, s.entities[far.id]), "no");
});

test("True Seeing: it can be cast on another creature, and that creature is the one that sees", () => {
  const s = field();
  s.settings.sight = "light";
  const g = spawn(s, "goblin-warrior", 3, 0);
  ok(apply(s, { type: "condition", actor: g.id, condition: "invisible" }, DM));
  ok(apply(s, { type: "place", actor: "cleric", to: { q: 1, r: 0 } }, DM));
  ok(apply(s, { type: "cast", actor: "wizard", spell: "true-seeing", target: "cleric", slot: 6 }, DM));
  assert.equal(canSee(s, s.entities.cleric, s.entities[g.id]), "yes");
  assert.equal(canSee(s, s.entities.wizard, s.entities[g.id]), "no");
  void view;
});

test("Heroes' Feast: the caster gets Poison resistance, immunity to Frightened and Poisoned, and a rolled 2d10 Hit Point maximum with as many Hit Points; it ends with the spell", () => {
  const s = field();
  const w = s.entities.wizard, hp0 = w.hp, max0 = w.maxHp;
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "heroes-feast", slot: 6 }, DM));
  const fx = s.effects.find((x) => x.name === "Heroes’ Feast");
  assert.ok(fx);
  assert.equal(fx.lasts, "24 hours");
  const gain = w.maxHp - max0;
  assert.ok(gain >= 2 && gain <= 20, `2d10 gave ${gain}`);
  assert.equal(w.hp, hp0 + gain, "as many Hit Points");
  assert.ok(r.events.some((e) => e.type === "maxHp" && e.id === "wizard"));
  const poison = fx.parts.find((p) => p.modifier?.on === "damage.taken");
  assert.deepEqual(poison.modifier.types, ["poison"]);
  assert.deepEqual(fx.parts.filter((p) => p.modifier?.on === "condition").map((p) => p.modifier.scope.condition).sort(), ["frightened", "poisoned"]);
  assert.match(apply(s, { type: "condition", actor: "wizard", condition: "poisoned" }, DM).error ?? "", /immune to Poisoned/);
  assert.ok(!w.cond.poisoned);
  assert.ok(r.events.some((e) => e.type === "manual" && /eleven other creatures/.test(e.text)), "the DM is told what is left");
  ok(apply(s, { type: "endEffect", actor: "wizard", effect: fx.id }, DM));
  assert.equal(w.maxHp, max0);
  assert.equal(w.hp, hp0);
});

test("Heroes' Feast: the same seed rolls the same maximum, and the roll comes from the game's dice", () => {
  const a = field(7), b = field(7);
  for (const s of [a, b]) ok(apply(s, { type: "cast", actor: "wizard", spell: "heroes-feast", slot: 6 }, DM));
  assert.equal(a.entities.wizard.maxHp, b.entities.wizard.maxHp);
});
