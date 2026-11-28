// Conjure Minor Elementals (#916): a lasting `damage.dealt` modifier on the caster judged by `target.within:N`, its type picked from four by the
// type that hurts most, dice that grow with the slot, and a following Emanation that is Difficult Terrain for the caster's foes only (`terrain.difficult: "foes"`).
// Every play goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { judge } from "../src/modifiers.js";
import { apply, current, moveOptions } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const lint = (def) => lintEntry("spells", def, { strict: false });
const DEF = SPELLS["conjure-minor-elementals"].def;
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", 0, 6], ["fighter", 0, 0], ["rogue", -4, 4], ["cleric", -8, 0]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  const slots = { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1 };
  Object.assign(s.entities.fighter, { slots: { ...slots }, slotsMax: { ...slots } });
  s.entities.fighter.spells.push("conjure-minor-elementals", "fire-bolt");
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 300;
  return s;
}
const spawn = (s, monster, q, r) => { const e = s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 300; return e; };
const cast = (s, slot) => ok(apply(s, { type: "cast", actor: "fighter", spell: "conjure-minor-elementals", ...(slot ? { slot } : {}) }, DM));
const effect = (s) => s.effects.find((fx) => fx.spell === "conjure-minor-elementals");
const extra = (r) => r.events.filter((e) => e.type === "damage" && ["acid", "cold", "fire", "lightning"].includes(e.dtype));
// The fighter swings at `t` until a swing is rolled; the target's AC says whether it hits. Returns the events of one attack.
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const swing = (s, t, ac) => {
  if (!s.encounter) ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 14 }, DM));
  else if (current(s) === "fighter") ok(apply(s, { type: "endTurn", actor: "fighter" }, DM));      // a fresh turn, a fresh action
  turnOf(s, "fighter");
  t.ac = ac; s.entities.fighter.hp = 300;
  return ok(apply(s, { type: "attack", actor: "fighter", target: t.id, attack: "longsword" }, DM));
};

test("the entry: auto, checked, lint and reader clean, SRD numbers", () => {
  assert.equal(DEF.tier, "auto"); assert.equal(DEF.checked, true);
  assert.deepEqual(lint(DEF), []);
  assert.deepEqual(readEntry("spell", DEF, {}).problems ?? [], []);
  assert.equal(DEF.level, 4); assert.equal(DEF.duration, "10 minutes"); assert.equal(DEF.concentration, true);
  assert.deepEqual(DEF.target, { self: true });
  const m = DEF.effects[0].modifier;
  assert.equal(m.value, "2d8"); assert.deepEqual(m.types, ["acid", "cold", "fire", "lightning"]); assert.deepEqual(m.when, ["attack.hit", "target.within:15"]);
  assert.deepEqual(DEF.higher, { slot: { damage: "1d8" } });
  assert.deepEqual(DEF.terrain, { difficult: "foes", size: 15 });
});

test("lint: target.within:N wants a multiple of 5 up to 300, and only where a damage.dealt modifier or a step takes it; difficult foes is alone on a lasting Emanation", () => {
  const mod = (when, on = "damage.dealt") => ({ ...DEF, effects: [{ modifier: { ...DEF.effects[0].modifier, on, when }, to: "caster" }] });
  assert.deepEqual(lint(mod(["attack.hit", "target.within:300"])), []);
  for (const bad of ["target.within:0", "target.within:7", "target.within:305", "target.within:", "target.within:15x"]) assert.ok(lint(mod([bad])).length, bad);
  assert.ok(lint(mod(["target.within:15"], "attack.roll")).length, "not on another hook");
  assert.ok(lint({ ...DEF, terrain: { difficult: "foes", size: 15, obscured: "light" } }).length);
  assert.ok(lint({ ...DEF, terrain: { difficult: "foes" } }).length, "a size");
  for (const size of [0, 7, 35, "15"]) assert.ok(lint({ ...DEF, terrain: { difficult: "foes", size } }).length, `size ${size}`);
  assert.ok(lint({ ...DEF, terrain: { difficult: true, size: 15 } }).length, "size is for foes");
  assert.ok(lint({ ...DEF, duration: "instant", concentration: false }).length);
  assert.ok(lint({ ...DEF, terrain: { difficult: "friends", size: 15 } }).length);
  assert.ok(lint({ ...DEF, target: { area: { shape: "sphere", size: 15 } } }).length, "aimed at its caster");
});

test("judge: within N feet is the distance attacks measure, null when either is unknown", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 3, 0), f = s.entities.fighter;
  assert.equal(judge("target.within:15", { attacker: f, target: g }, s), true, "three hexes");
  assert.equal(judge("target.within:10", { attacker: f, target: g }, s), false);
  assert.equal(judge("target.within:15", { attacker: f }, s), null);
});

test("a hit inside 15 feet gets the 2d8, outside it does not, a miss does not", () => {
  const s = field();
  const near = spawn(s, "goblin-warrior", 1, 0), far = spawn(s, "goblin-warrior", 4, 0);
  cast(s);
  const hitNear = swing(s, near, 1);
  const x = extra(hitNear);
  assert.equal(x.length, 1, "one extra part"); 
  assert.equal(x[0].dice.length, 2, "2d8"); assert.ok(x[0].dice.every((d) => d.sides === 8 && d.value >= 1 && d.value <= 8));
  // Outside the Emanation: a spell attack (Guiding Bolt, radiant) from a target 20 feet off adds nothing, from 15 feet it does.
  s.entities.fighter.spells.push("guiding-bolt");
  const bolt = (t) => { t.ac = 1; return ok(apply(s, { type: "cast", actor: "fighter", spell: "guiding-bolt", target: t.id }, DM)); };
  turnOf(s, "fighter"); ok(apply(s, { type: "endTurn", actor: "fighter" }, DM)); turnOf(s, "fighter");
  const out = bolt(far);
  assert.ok(out.events.some((e) => e.type === "damage" && e.dtype === "radiant"), "the bolt hit");
  assert.equal(extra(out).length, 0, "20 feet is outside the Emanation");
  far.pos = { q: 3, r: 0, z: 0 };
  ok(apply(s, { type: "endTurn", actor: "fighter" }, DM)); turnOf(s, "fighter");
  assert.equal(extra(bolt(far)).length, 1, "15 feet is inside");
  const miss = (() => { ok(apply(s, { type: "endTurn", actor: "fighter" }, DM)); turnOf(s, "fighter"); far.ac = 99; return ok(apply(s, { type: "cast", actor: "fighter", spell: "guiding-bolt", target: far.id }, DM)); })();
  assert.equal(extra(miss).length, 0, "a miss adds nothing");
});

test("the type is the one that hurts the target most: a fire-vulnerable creature takes fire; resisting three of four, the fourth", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 1, 0);
  g.vuln = ["fire"]; g.resist = ["acid", "cold"]; g.immune = ["lightning"];
  cast(s);
  const x = extra(swing(s, g, 1));
  assert.equal(x[0].dtype, "fire");
});

test("a higher slot adds 1d8 for each level above 4", () => {
  for (const [slot, dice] of [[undefined, "2d8"], [5, "3d8"], [6, "4d8"]]) {
    const s = field();
    cast(s, slot);
    const fx = effect(s), m = fx.parts.find((p) => p.modifier)?.modifier; assert.ok(m, JSON.stringify(s.effects));
    assert.equal(m.value, dice, `slot ${slot ?? 4}`);
  }
});

test("Difficult Terrain for foes only: an ally walks through at the plain cost, a foe pays double, and the cost goes with the caster", () => {
  const s = field();
  const foe = spawn(s, "goblin-warrior", 6, 0);
  const ally = s.entities.cleric; ally.pos = { q: 6, r: 1, z: 0 };
  cast(s);
  const fx = effect(s);
  assert.equal(fx.terrain.difficult, "foes"); assert.equal(fx.terrain.follows, "fighter");
  const reach = (e, q, r) => [...moveOptions(s, e).values()].find((v) => v.h.q === q && v.h.r === r);
  const cost = (e, q, r) => reach(e, q, r)?.cost ?? reach(e, q, r)?.spent;
  // Both start outside the Emanation (15 feet = 3 hexes from the fighter at 0,0) and walk in.
  const foeIn = cost(foe, 2, 0), foeOut = cost(foe, 5, 0);
  assert.ok(foeIn !== undefined && foeOut !== undefined, "reachable");
  const allyIn = cost(ally, 2, 1);
  assert.ok(allyIn !== undefined);
  // A foe's step inside is dearer than the same walk without the spell.
  const plain = field(); const foe2 = spawn(plain, "goblin-warrior", 6, 0);
  const plainIn = [...moveOptions(plain, foe2).values()].find((v) => v.h.q === 2 && v.h.r === 0);
  const was = plainIn.cost ?? plainIn.spent;
  assert.ok(foeIn > was, `a foe pays more inside (${foeIn} vs ${was})`);
  const plainAlly = (() => { const p = field(); const a = p.entities.cleric; a.pos = { q: 6, r: 1, z: 0 }; const v = [...moveOptions(p, a).values()].find((o) => o.h.q === 2 && o.h.r === 1); return v.cost ?? v.spent; })();
  assert.equal(allyIn, plainAlly, "an ally pays nothing extra");
});

test("the Emanation moves with the caster, and Concentration ends it", () => {
  const s = field();
  const foe = spawn(s, "goblin-warrior", 9, 0);
  cast(s);
  const fx = effect(s);
  const price = () => [...moveOptions(s, foe).values()].find((v) => v.h.q === 6 && v.h.r === 0);
  const before = price();
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 5, r: 0 } }, DM));
  const after = price();
  assert.ok(!before || !after || (after.cost ?? after.spent) > (before.cost ?? before.spent), "the ground there is dearer now the caster is near");
  assert.ok(effect(s) && effect(s) === fx, "still lasting after the walk");
  // A new Concentration spell ends it.
  s.entities.fighter.spells.push("bless");
  ok(apply(s, { type: "cast", actor: "fighter", spell: "bless", target: "fighter" }, DM));
  assert.equal(effect(s), undefined, "ended");
  const r = swing(s, spawn(s, "goblin-warrior", 6, 0), 1);
  assert.equal(extra(r).length, 0, "no extra damage once it ended");
});

test("the reader says the distance tag and the foes-only ground in plain words, and reads them without a problem or a hand-over", () => {
  const r = readEntry("spell", DEF), all = r.lines.join("\n");
  assert.match(all, /the target is within 15 feet of the one the modifier is for/);
  assert.match(all, /15-foot Emanation moves with the caster/);
  assert.match(all, /hostile to the caster/);
  assert.match(all, /1d8 per slot level|\+1d8/);
  assert.deepEqual(r.problems, []); assert.deepEqual(r.doesNot, []);
  const bad = readEntry("spell", { ...DEF, effects: [{ modifier: { ...DEF.effects[0].modifier, when: ["attack.hit", "target.within:12"] }, to: "caster" }] });
  assert.ok(bad.problems.length, "a distance that is not a multiple of 5 is a problem, not a quiet skip");
});
