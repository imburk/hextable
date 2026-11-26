// Wave 3a, part 3, of issue #786: Silence (terrain `silence`) and See Invisibility (the `invisible` hook).
// Built to docs/specs/rules-expansion.md, "Build notes: wave 3a part 3". Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { canSee } from "../src/sight.js";
import { view } from "../src/view.js";
import * as terrain from "../src/terrain.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const lint = (def) => lintEntry("spells", def, { strict: false });
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", 0, 0], ["fighter", -2, 0], ["rogue", -4, 4], ["cleric", -3, 0]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  const slots = { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 };
  for (const id of ["wizard", "cleric"]) Object.assign(s.entities[id], { slots: { ...slots }, slotsMax: { ...slots } });
  s.entities.cleric.spells.push("silence", "sacred-flame", "bless");
  s.entities.wizard.spells.push("see-invisibility", "silence", "thunderwave", "shatter", "mage-armor", "ray-of-frost");
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 300;
  return s;
}
const spawn = (s, monster, q, r) => { const e = s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 300; return e; };
const silence = (s, by, q, r) => ok(apply(s, { type: "cast", actor: by, spell: "silence", hex: { q, r } }, DM));
const sphere = (s) => s.effects.find((fx) => fx.name === "Silence");

// ---------- Silence ----------
test("Silence: assist; lints; reads in plain words with no problem; the terrain is a sphere that lasts", () => {
  const def = SPELLS.silence.def;
  assert.equal(def.tier, "assist"); assert.equal(def.checked, true);
  assert.deepEqual(lint(def), []);
  assert.deepEqual(readEntry("spell", def, {}).problems ?? [], []);
  assert.ok(lint({ ...def, terrain: { silence: true }, target: { self: true } }).length, "needs a sphere");
  assert.ok(lint({ ...def, terrain: { silence: true }, duration: "instant", concentration: false }).length, "needs to last");
  assert.ok(lint({ ...def, terrain: { silence: false } }).length);
});

test("Silence: the cast lays out a sphere of silence on the ground and Concentration holds it", () => {
  const s = field();
  silence(s, "wizard", 3, 0);
  const fx = sphere(s);
  assert.ok(fx?.terrain?.silence, "the effect holds the terrain");
  assert.equal(fx.terrain.area.size, 20);
  assert.ok(fx.conc);
});

test("Silence: a creature inside the sphere cannot cast a spell with a Verbal component; the refusal changes nothing; outside it, and with no Verbal component, it can", () => {
  const s = field();
  silence(s, "wizard", 3, 0);
  s.entities.cleric.pos = { q: 3, r: 0, z: 0 };                    // inside the sphere
  const slots = { ...s.entities.cleric.slots }, before = JSON.stringify(s.entities.cleric), seq = s.seq;
  const r = apply(s, { type: "cast", actor: "cleric", spell: "bless", targets: ["cleric"] }, DM);
  assert.equal(r.ok, false);
  assert.match(r.error, /Verbal component.*Sphere of Silence/);
  assert.deepEqual(s.entities.cleric.slots, slots);
  assert.equal(JSON.stringify(s.entities.cleric), before, "a rejected action changes nothing");
  assert.equal(s.seq, seq);
  s.entities.cleric.pos = { q: -9, r: 0, z: 0 };                   // far outside (20 feet is 4 hexes)
  ok(apply(s, { type: "cast", actor: "cleric", spell: "bless", targets: ["cleric"] }, DM));
});

test("Silence: the caster inside its own sphere cannot cast a Verbal spell either; the refusal names the sphere", () => {
  const s = field();
  silence(s, "wizard", 0, 0);
  const r = apply(s, { type: "cast", actor: "wizard", spell: "mage-armor", target: "wizard" }, DM);
  assert.equal(r.ok, false); assert.match(r.error, /Sphere of Silence/);
});

test("Silence: a creature entirely inside takes no Thunder damage; one outside, or hurt by another type inside, takes it", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 10, 0), h = spawn(s, "goblin-warrior", 3, 1);
  silence(s, "wizard", 3, 0);
  ok(apply(s, { type: "harm", actor: h.id, amount: 10, dtype: "thunder" }, DM));
  assert.equal(h.hp, 300, "inside: immune");
  ok(apply(s, { type: "harm", actor: h.id, amount: 10, dtype: "fire" }, DM));
  assert.equal(h.hp, 290, "other damage types hurt it");
  ok(apply(s, { type: "harm", actor: g.id, amount: 10, dtype: "thunder" }, DM));
  assert.equal(g.hp, 290, "outside: not immune");
});

test("Silence: it ends with the spell, and then Verbal spells and Thunder damage work again", () => {
  const s = field();
  const h = spawn(s, "goblin-warrior", 3, 1);
  silence(s, "wizard", 3, 0);
  s.entities.cleric.pos = { q: 3, r: 0, z: 0 };
  assert.equal(apply(s, { type: "cast", actor: "cleric", spell: "bless", targets: ["cleric"] }, DM).ok, false);
  ok(apply(s, { type: "endEffect", actor: "wizard", effect: sphere(s).id }, DM));
  assert.equal(sphere(s), undefined);
  ok(apply(s, { type: "cast", actor: "cleric", spell: "bless", targets: ["cleric"] }, DM));
  ok(apply(s, { type: "harm", actor: h.id, amount: 10, dtype: "thunder" }, DM));
  assert.equal(h.hp, 290);
});

// ---------- See Invisibility ----------
test("See Invisibility: assist; lints; the entry reads in plain words with no problem", () => {
  const def = SPELLS["see-invisibility"].def;
  assert.equal(def.tier, "assist"); assert.equal(def.checked, true);
  assert.deepEqual(lint(def), []);
  assert.deepEqual(readEntry("spell", def, {}).problems ?? [], []);
  assert.ok(lint({ ...def, effects: [{ modifier: { on: "invisible", op: "immune", value: 1 } }] }).length, "no extra keys");
  assert.ok(lint({ ...def, effects: [{ modifier: { on: "invisible", op: "advantage" } }] }).length);
});

test("See Invisibility: the caster sees an Invisible creature as if it were visible; before the spell, and after it ends, it does not", () => {
  const s = field();
  s.settings.sight = "light";
  const g = spawn(s, "goblin-warrior", 3, 0);
  ok(apply(s, { type: "condition", actor: g.id, condition: "invisible" }, DM));
  assert.equal(canSee(s, s.entities.wizard, s.entities[g.id]), "no", "unseen at first");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "see-invisibility", target: "wizard" }, DM));
  const fx = s.effects.find((x) => x.name === "See Invisibility");
  assert.ok(fx, "the spell lasts");
  assert.equal(canSee(s, s.entities.wizard, s.entities[g.id]), "yes");
  assert.ok(view(s, { role: "dm", userId: "dm" }).entities[g.id]);
  ok(apply(s, { type: "endEffect", actor: "wizard", effect: fx.id }, DM));
  assert.equal(canSee(s, s.entities.wizard, s.entities[g.id]), "no");
});

test("See Invisibility: only the caster sees the Invisible: another creature gets nothing", () => {
  const s = field();
  s.settings.sight = "light";
  const g = spawn(s, "goblin-warrior", 3, 0);
  ok(apply(s, { type: "condition", actor: g.id, condition: "invisible" }, DM));
  ok(apply(s, { type: "cast", actor: "wizard", spell: "see-invisibility", target: "wizard" }, DM));
  assert.equal(canSee(s, s.entities.wizard, s.entities[g.id]), "yes");
  assert.equal(canSee(s, s.entities.cleric, s.entities[g.id]), "no", "another creature gets nothing");
});

test("See Invisibility: a creature that is not Invisible is seen as before", () => {
  const s = field();
  s.settings.sight = "light";
  const g = spawn(s, "goblin-warrior", 3, 0);
  assert.equal(canSee(s, s.entities.wizard, s.entities[g.id]), "yes");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "see-invisibility", target: "wizard" }, DM));
  assert.equal(canSee(s, s.entities.wizard, s.entities[g.id]), "yes");
});

test("Silence: a creature only partly inside the sphere is not entirely inside it: a Large one on its edge takes Thunder damage, one at the middle does not", () => {
  const s = field();
  const ogre = spawn(s, "ogre", 3, 0), edge = spawn(s, "ogre", 8, 0);
  silence(s, "wizard", 3, 0);
  s.entities[edge.id].pos = { q: 7, r: 0, z: 0 };                  // its first hex is inside, its other hexes are not all
  const { silentAll, silentAt } = terrain;
  assert.equal(silentAll(s, ogre), true);
  assert.equal(silentAt(s, edge.pos), true);
  assert.equal(silentAll(s, edge), false, "a hex of its space is outside");
  ok(apply(s, { type: "harm", actor: edge.id, amount: 10, dtype: "thunder" }, DM));
  assert.equal(edge.hp, 290);
});
