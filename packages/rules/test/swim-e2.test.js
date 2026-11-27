// Swimming, stage E2 of docs/specs/fly-swim-control.md (#840): holding breath under water (SRD "Suffocation"), underwater combat (SRD "Underwater Combat"),
// Water Breathing, and the monster brain that comes up for air.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current } from "../src/engine.js";
import { rollMode } from "../src/engine/rolls.js";
import { newGame } from "../src/scenario.js";
import { submerged } from "../src/space.js";
import { breathOf } from "../src/modifiers.js";
import { aiStep } from "../src/ai.js";
import { CONTENT } from "../src/content/index.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "it was refused"); if (re) assert.match(r.error, re); return r; };

// The valley with its creatures gone but the fighter (Constitution 15: three minutes of breath) and, if asked, the wizard; grass all over, and a pool of water 40 feet deep
// from q = 1 to q = 4. The fighter is at 0,0 on its shore. `foe`: a goblin far off, so that a fight started here goes on.
function pool({ depth = 40, wizard = false, foe = false } = {}) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (id !== "fighter" && !(wizard && id === "wizard")) delete s.entities[id];
  const tiles = s.map.levels[0].tiles;
  for (const t of Object.values(tiles)) { t.t = "grass"; delete t.depth; }
  for (let q = 1; q <= 4; q++) for (let r = -4; r <= 4; r++) if (tiles[`${q},${r}`]) tiles[`${q},${r}`] = { t: "water", depth };
  s.settings.autoEngage = false;
  if (foe) { const id = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: -8, r: 0 } }, DM)).events.find((e) => e.type === "spawned").id; Object.assign(s.entities[id], { hp: 5000, maxHp: 5000 }); }
  if (wizard) { Object.assign(s.entities.wizard, { pos: { q: 0, r: 1, z: 0 }, slots: { 3: 3 }, slotsMax: { 3: 3 } }); s.entities.wizard.spells.push("water-breathing"); }
  Object.assign(s.entities.fighter, { pos: { q: 0, r: 0, z: 0 }, hp: 500, maxHp: 500 });
  s.breathAt = s.clock;                            // as a loaded game has it (migrate.js)
  return s;
}
const dive = (s, id = "fighter", z = -10, q = 2) => { s.entities[id].pos = { q, r: 0, z }; };
const wait = (s, minutes) => ok(apply(s, { type: "advanceTime", minutes }, DM));
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 60 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const exh = (e) => e.cond.exhaustion?.level ?? 0;

// ---------- holding breath ----------

test("a creature under the surface holds its breath for 1 + its Constitution modifier minutes; then 1 Exhaustion level for each 6 seconds out of breath (outside a fight)", () => {
  const s = pool(), f = s.entities.fighter;
  dive(s);
  assert.ok(submerged(s, f));
  wait(s, 3);                                                     // Constitution 15: 3 minutes
  assert.equal(exh(f), 0, "the breath lasts the three minutes");
  assert.deepEqual([f.breath.held, f.breath.gave], [180, 0]);
  wait(s, 0.1);
  assert.equal(exh(f), 1, "6 seconds more: it has run out, and a turn has passed");
  const r = wait(s, 0.2);
  assert.equal(exh(f), 3);
  assert.deepEqual(r.events.filter((e) => e.type === "cond").map((e) => [e.level, e.why]), [[2, "suffocation"], [3, "suffocation"]]);
  assert.ok(r.events.some((e) => e.type === "note" && /out of breath/.test(e.text)) || f.breath.out);
  assert.equal(f.breath.gave, 3);
});

test("the minimum is 30 seconds, and a Hold Breath trait is an hour", () => {
  const s = pool(), f = s.entities.fighter;
  f.abil.con = 1;                                                 // -5: 1 minute less 5, 30 seconds at least
  assert.equal(breathOf(s, f).hold, 30);
  f.abil.con = 10;
  assert.equal(breathOf(s, f).hold, 60);
  f.abil.con = 20;
  assert.equal(breathOf(s, f).hold, 360);
  const c = ok(apply(s, { type: "spawn", monster: "crocodile", at: { q: 5, r: 0 } }, DM)).events.find((e) => e.type === "spawned").id;
  assert.equal(CONTENT.monsters.crocodile.traits.some((t) => t.id === "hold-breath"), true);
  assert.equal(breathOf(s, s.entities[c]).hold, 3600);
});

test("surfacing resets the count and takes off the Exhaustion suffocation gave, and only that", () => {
  const s = pool(), f = s.entities.fighter;
  f.cond.exhaustion = { level: 1 };                               // from something else
  dive(s);
  wait(s, 3.3);                                                   // 18 seconds out of breath: 3 levels
  assert.equal(exh(f), 4);
  dive(s, "fighter", 0);                                          // at the surface
  assert.equal(submerged(s, f), false);
  const r = wait(s, 0.1);
  assert.equal(exh(f), 1, "the one from elsewhere stays");
  assert.equal(f.breath, undefined, "and the count is gone");
  assert.ok(r.events.some((e) => e.type === "cond" && e.cond === "exhaustion" && e.level === 1));
  // With none of its own, the condition goes altogether.
  const t = pool(), g = t.entities.fighter;
  dive(t); wait(t, 3.1);
  assert.equal(exh(g), 1);
  dive(t, "fighter", 0); wait(t, 0.1);
  assert.equal(g.cond.exhaustion, undefined);
  // Out of the water on dry land is the same.
  const u = pool(), h = u.entities.fighter;
  dive(u); wait(u, 3.2);
  h.pos = { q: 0, r: 0, z: 0 }; wait(u, 0.1);
  assert.equal(exh(h), 0);
  // It starts again from nothing at the next dive.
  dive(u); wait(u, 3); assert.equal(exh(h), 0); wait(u, 0.1); assert.equal(exh(h), 1);
});

test("the sixth level is death", () => {
  const s = pool(), f = s.entities.fighter;
  dive(s);
  wait(s, 3 + 0.6);                                               // 36 seconds out of breath: six levels
  assert.equal(f.dead, true);
});

test("in a fight the breath is counted in rounds, and Exhaustion comes at the end of each of its turns once it has run out", () => {
  const s = pool({ foe: true }), f = s.entities.fighter;
  dive(s);
  fight(s);
  turnOf(s, "fighter");
  let rounds = 0, levels = [];
  // 30 rounds are 3 minutes. Go round the order, noting the fighter's Exhaustion at the end of each of its own turns.
  while (s.encounter.round < 34) {
    const round = s.encounter.round;
    ok(apply(s, { type: "endTurn", actor: "fighter" }, DM));
    levels.push([round, exh(f)]);
    turnOf(s, "fighter");
    if (++rounds > 40) break;
  }
  const first = levels.find(([, n]) => n > 0);
  assert.ok(first, "it ran out");
  assert.equal(first[0], 31, "30 rounds of 6 seconds are held, the 31st is the first without breath");
  assert.equal(levels.find(([r]) => r === first[0] + 2)[1], first[1] + 2, "one a turn after that");
});

test("a creature that needs no air under water is not counted: a Water Breathing or Amphibious trait, a form's, and the spell", () => {
  const s = pool(), f = s.entities.fighter;
  let water = 0;
  for (const [tpl, m] of Object.entries(CONTENT.monsters)) {
    const traits = (m.traits ?? []).map((t) => t.id), wet = traits.includes("amphibious") || traits.includes("water-breathing");
    assert.equal(breathOf(s, { id: "x", tpl, abil: { con: 10 }, cond: {} }).water, wet, tpl);
    if (wet) water++;
  }
  assert.ok(water > 20, `${water} creatures of the pack breathe water`);
  // The form of a Wild Shape brings its traits: a druid in a Water Breathing beast's shape breathes water, and its kind is the same.
  const shark = Object.entries(CONTENT.monsters).find(([, m]) => m.traits?.some((t) => t.id === "water-breathing"))[0];
  assert.equal(breathOf(s, { id: "d", kind: "pc", abil: { con: 10 }, cond: {}, form: { block: shark } }).water, true);
  assert.equal(breathOf(s, f).water, false, "a fighter breathes air");
});

test("a creature of a kind the SRD does not say breathes is the DM's: told once, never counted", () => {
  const s = pool();
  const z = ok(apply(s, { type: "spawn", monster: "zombie", at: { q: -3, r: 0 } }, DM)).events.find((e) => e.type === "spawned").id;
  const zed = s.entities[z];
  zed.pos = { q: 2, r: 0, z: -10 };
  assert.equal(breathOf(s, zed).judged, false);
  const r1 = wait(s, 5);
  const told = r1.events.filter((e) => e.type === "manual" && e.actor === z);
  assert.equal(told.length, 1);
  assert.equal(told[0].partial, true, "for the DM only");
  assert.equal(exh(zed), 0);
  const r2 = wait(s, 5);
  assert.equal(r2.events.filter((e) => e.type === "manual" && e.actor === z).length, 0, "once");
  dive(s, z, 0); wait(s, 1); dive(s, z, -10);
  assert.equal(wait(s, 5).events.filter((e) => e.type === "manual" && e.actor === z).length, 0, "once, not once a dive");
  assert.equal(zed.breath.held, 0);
});

// ---------- Water Breathing ----------

test("Water Breathing is an automatic spell: a lasting modifier on up to ten willing creatures that keeps them from running out of breath, for the 24 hours", () => {
  const sp = CONTENT.spells ? CONTENT.spells["water-breathing"] : null;
  const def = (sp?.def ?? sp) ?? null;
  assert.ok(def, "the spell is in the pack");
  assert.equal(def.tier, "auto");
  assert.deepEqual(def.effects, [{ modifier: { on: "breath", op: "immune" } }]);
  assert.deepEqual([def.level, def.range, def.duration, def.ritual, def.target.creature.count], [3, 30, "24 hours", true, 10]);
  const s = pool({ wizard: true }), f = s.entities.fighter;
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "water-breathing", targets: ["fighter", "wizard"], slot: 3 }, DM));
  assert.equal(r.events.some((e) => e.type === "manual" && !e.partial), false, "nothing is left to the DM");
  dive(s); dive(s, "wizard", -10, 3);
  wait(s, 60);                                                    // an hour
  assert.equal(exh(f), 0);
  assert.equal(f.breath, undefined);
  assert.equal(breathOf(s, f).water, true);
  // It runs 24 hours and no more: the next 24 hours and a little take it out, and the count begins then.
  wait(s, 23 * 60 + 1);
  assert.equal(breathOf(s, f).water, false, "it has ended");
  wait(s, 3); assert.equal(exh(f), 0);
  wait(s, 0.2); assert.ok(exh(f) >= 1);
});

test("Water Breathing taken off (it ends) leaves the creature under the surface counting from then", () => {
  const s = pool({ wizard: true }), f = s.entities.fighter;
  ok(apply(s, { type: "cast", actor: "wizard", spell: "water-breathing", targets: ["fighter"], slot: 3 }, DM));
  dive(s);
  wait(s, 10);
  const fx = s.effects.find((x) => x.spell === "water-breathing");
  assert.ok(fx);
  ok(apply(s, { type: "endEffect", effect: fx.id }, DM));
  wait(s, 1);
  assert.equal(f.breath.held, 60);
});

// ---------- underwater combat ----------

// The fighter and a goblin, side by side, both under the surface unless `wet` says one is not.
function duel({ fighter = -10, goblin = -10, gq = 3, swim = 0 } = {}) {
  const s = pool({ foe: true });
  const g = Object.keys(s.entities).find((id) => id !== "fighter");
  Object.assign(s.entities.fighter, { pos: { q: 2, r: 0, z: fighter }, ...(swim ? { speeds: { swim } } : {}) });
  Object.assign(s.entities[g], { pos: { q: gq, r: 0, z: goblin }, ac: 30 });
  fight(s);
  s.entities.fighter.pos = { q: 2, r: 0, z: fighter }; s.entities[g].pos = { q: gq, r: 0, z: goblin };
  turnOf(s, "fighter");
  return { s, g };
}
const hit = (s, g, attack) => ok(apply(s, { type: "attack", actor: "fighter", target: g, attack }, DM)).events.find((e) => e.type === "attack");

test("a melee weapon attack by a creature under the surface without a Swim Speed has Disadvantage unless the weapon deals Piercing damage", () => {
  const { s, g } = duel();
  const sword = hit(s, g, "longsword");
  assert.equal(sword.mode, "dis");
  assert.deepEqual(sword.why, ["weapon underwater"]);
  const { s: t, g: h } = duel();
  assert.notEqual(hit(t, h, "javelin").mode, "dis", "a javelin is Piercing");
  // A Swim Speed lifts it.
  const { s: u, g: i } = duel({ swim: 30 });
  assert.notEqual(hit(u, i, "longsword").mode, "dis");
  // An Unarmed Strike is not a weapon.
  const { s: v, g: j } = duel();
  assert.notEqual(hit(v, j, "unarmed-strike").mode, "dis");
});

test("the attacker decides a melee attack: at the surface, or on the shore, it is not under water, whatever its target is", () => {
  const mode = (fighter, goblin) => { const { s, g } = duel({ fighter, goblin }); return rollMode(s, s.entities.fighter, s.entities[g], s.entities.fighter.attacks.find((a) => a.id === "longsword")).dis.filter((x) => /underwater/.test(x)); };
  assert.deepEqual(mode(0, -5), [], "swimming at the surface is not under the surface");
  assert.deepEqual(mode(-5, 0), ["weapon underwater"], "under the surface, striking up at one on it");
  assert.deepEqual(mode(-5, -5), ["weapon underwater"]);
});

test("a ranged weapon attack under water automatically misses beyond its normal range and has Disadvantage within it: the attacker or the target under the surface", () => {
  // Normal range of a javelin is 30 feet (6 hexes); the goblin is 1 hex away: within.
  for (const [fighter, goblin] of [[-10, -10], [-10, 0], [0, -10]]) {
    const { s, g } = duel({ fighter, goblin, gq: 4 });
    const m = rollMode(s, s.entities.fighter, s.entities[g], s.entities.fighter.attacks.find((a) => a.id === "javelin-thrown"));
    assert.deepEqual([m.dis.includes("ranged weapon underwater"), m.miss], [true, null], `${fighter}/${goblin}`);
  }
  const both = duel({ gq: 4 });
  const a = hit(both.s, both.g, "javelin-thrown");
  assert.equal(a.mode, "dis");
  assert.deepEqual(a.why, ["ranged weapon underwater"]);
  const far = duel();
  far.s.entities[far.g].pos = { q: 4, r: 0, z: -10 };
  far.s.entities.fighter.pos = { q: 1, r: -4, z: -10 };           // well over 30 feet
  const m = hit(far.s, far.g, "javelin-thrown");
  assert.equal(m.hit, false);
  assert.equal(m.crit, false);
  assert.deepEqual(m.why, ["beyond normal range underwater"]);
  // Out of the water at both ends it is the plain rule.
  const dry = duel({ fighter: 0, goblin: 0, gq: 4 });
  assert.notEqual(hit(dry.s, dry.g, "javelin-thrown").mode, "dis");
});

test("a natural 20 does not hit beyond the normal range under water: the roll is made and the attack misses", () => {
  const far = duel();
  far.s.entities[far.g].pos = { q: 4, r: 0, z: -10 };
  far.s.entities.fighter.pos = { q: 1, r: -4, z: -10 };
  for (let i = 0; i < 40; i++) {
    const t = structuredClone(far.s);
    t.rng = i * 7919;
    const a = ok(apply(t, { type: "attack", actor: "fighter", target: far.g, attack: "javelin-thrown" }, DM)).events.find((e) => e.type === "attack");
    assert.equal(a.hit, false);
  }
});

test("anything under the surface has Resistance to Fire damage; at the surface or in the air it has none", () => {
  const s = pool(), f = s.entities.fighter;
  dive(s);
  const dmg = (n) => ok(apply(s, { type: "harm", actor: "fighter", amount: n, dtype: "fire" }, DM)).events.find((e) => e.type === "damage");
  const wet = dmg(10);
  assert.deepEqual([wet.amount, wet.note], [5, "resisted"]);
  dive(s, "fighter", 0);
  assert.equal(dmg(10).amount, 10);
  dive(s); 
  const cold = ok(apply(s, { type: "harm", actor: "fighter", amount: 10, dtype: "cold" }, DM)).events.find((e) => e.type === "damage");
  assert.equal(cold.amount, 10, "only Fire");
});

// ---------- the monster brain ----------

test("a creature that would run out of breath swims up to the surface when it can", () => {
  const s = pool({ foe: true });
  const g = Object.keys(s.entities).find((id) => id !== "fighter");
  Object.assign(s.entities[g], { hp: 50, maxHp: 50, speed: 30, pos: { q: 3, r: 0, z: -20 }, speeds: {}, side: "foe" });
  s.entities.fighter.pos = { q: -6, r: 0, z: 0 };
  fight(s);
  s.entities[g].pos = { q: 3, r: 0, z: -20 };
  s.entities[g].breath = { held: 60 * 20, gave: 0 };              // as if it had been under for a long time
  s.entities[g].abil.con = 10;
  assert.ok(submerged(s, s.entities[g]));
  turnOf(s, g);
  const before = s.entities[g].pos.z;
  const r = aiStep(s, g);
  assert.equal(r.type, "move", "it comes up before anything else");
  ok(apply(s, r, DM));
  assert.ok(s.entities[g].pos.z > before || !submerged(s, s.entities[g]), `it came up: ${before} -> ${s.entities[g].pos.z}`);
});

test("a game with no `breathAt` (a new one, a save from before swimming) counts the first advance of time from what it told, and keeps the field after", () => {
  const s = pool(), f = s.entities.fighter;
  delete s.breathAt;
  dive(s);
  wait(s, 3.2);                                                   // 12 seconds out of breath
  assert.equal(exh(f), 2);
  assert.equal(s.breathAt, s.clock);
  // A long rest (8 hours) is told too.
  const t = pool(), g = t.entities.fighter;
  delete t.breathAt;
  dive(t);
  ok(apply(t, { type: "shortRest" }, DM));
  assert.equal(exh(g) > 0, true, "an hour under water");
});

test("a table that never swims is untouched: no `breathAt`, no `breath` anywhere, however much time passes", () => {
  const s = pool({ foe: true });
  delete s.breathAt;
  wait(s, 30);
  fight(s); turnOf(s, "fighter");
  for (let i = 0; i < 12; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.equal(Object.hasOwn(s, "breathAt"), false);
  assert.ok(Object.values(s.entities).every((e) => e.breath === undefined));
});
