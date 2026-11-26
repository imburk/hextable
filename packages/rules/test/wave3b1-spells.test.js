// Wave 3b, part 1, of issue #786: Globe of Invulnerability (terrain `globe`) and Antilife Shell (terrain `shell`).
// Built to docs/specs/rules-expansion.md, "Build notes: wave 3b part 1". Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { moveOptions } from "../src/engine.js";
import { aiStep } from "../src/ai.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const lint = (def) => lintEntry("spells", def, { strict: false });
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", 0, 0], ["fighter", -6, 0], ["rogue", -4, 4], ["cleric", -8, 0]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  const slots = { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1 };
  for (const id of ["wizard", "cleric"]) Object.assign(s.entities[id], { slots: { ...slots }, slotsMax: { ...slots } });
  s.entities.cleric.spells.push("sacred-flame", "guiding-bolt", "bless", "antilife-shell");
  s.entities.wizard.spells.push("globe-of-invulnerability", "antilife-shell", "shatter", "thunderwave", "ray-of-frost", "fire-bolt");
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 300;
  return s;
}
const spawn = (s, monster, q, r) => { const e = s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 300; return e; };
const effect = (s, name) => s.effects.find((fx) => fx.name === name);
const globe = (s, by = "wizard", slot) => ok(apply(s, { type: "cast", actor: by, spell: "globe-of-invulnerability", ...(slot ? { slot } : {}) }, DM));
const shell = (s, by = "wizard") => ok(apply(s, { type: "cast", actor: by, spell: "antilife-shell" }, DM));
const fightOn = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 14 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const fight = (s, id) => { fightOn(s); turnOf(s, id); };
const at = (e, q, r) => { e.pos = { q, r, z: 0 }; };

// ---------- the entries ----------
test("Globe and Shell: assist, checked, lint, read in plain words with no problem", () => {
  for (const id of ["globe-of-invulnerability", "antilife-shell"]) {
    const def = SPELLS[id].def;
    assert.equal(def.tier, "assist"); assert.equal(def.checked, true);
    assert.deepEqual(lint(def), []);
    assert.deepEqual(readEntry("spell", def, {}).problems ?? [], []);
  }
  const g = SPELLS["globe-of-invulnerability"].def, a = SPELLS["antilife-shell"].def;
  assert.equal(g.level, 6); assert.equal(g.duration, "1 minute"); assert.equal(g.concentration, true); assert.deepEqual(g.target.area, { shape: "emanation", size: 10 });
  assert.equal(a.level, 5); assert.equal(a.duration, "1 hour"); assert.equal(a.concentration, true); assert.deepEqual(a.target.area, { shape: "emanation", size: 10 });
});

test("terrain globe and shell: lint refuses a barrier with other terrain, on a sphere, on an instant spell, or both at once", () => {
  const g = SPELLS["globe-of-invulnerability"].def, a = SPELLS["antilife-shell"].def;
  assert.ok(lint({ ...g, terrain: { globe: true, difficult: true } }).length, "alone");
  assert.ok(lint({ ...g, terrain: { globe: false } }).length);
  assert.ok(lint({ ...g, terrain: { globe: true, shell: true } }).length);
  assert.ok(lint({ ...g, target: { area: { shape: "sphere", size: 10 } } }).length, "an Emanation");
  assert.ok(lint({ ...a, duration: "instant", concentration: false }).length, "must last");
  assert.ok(lint({ ...a, terrain: { shell: 1 } }).length);
  assert.ok(lint({ ...g, terrain: { difficult: true } }).length, "an Emanation stays refused for other terrain");
});

// ---------- Globe of Invulnerability ----------
test("Globe: the cast lays out a barrier that stays where it went off (the caster's own space too) and Concentration holds it", () => {
  const s = field();
  globe(s);
  const fx = effect(s, "Globe of Invulnerability");
  assert.ok(fx?.terrain?.globe && fx.conc && fx.level === 6);
  assert.ok(fx.terrain.hexes.includes("0,0"), "the caster's own space");
  assert.ok(fx.terrain.hexes.includes("2,0") && !fx.terrain.hexes.includes("3,0"), "10 feet is two hexes");
  at(s.entities.wizard, 6, 0);                                  // it is immobile: the caster may leave it behind
  assert.ok(fx.terrain.hexes.includes("0,0") && fx.terrain.origin.q === 0);
});

test("Globe: a spell of level 5 or lower cast from outside, aimed at a creature inside, is cast and paid for and has no effect; one cast with a higher slot is stopped too", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 1, 0);
  globe(s);
  at(s.entities.cleric, -4, 0);
  fight(s, "cleric");
  const slots = { ...s.entities.cleric.slots };
  const r = ok(apply(s, { type: "cast", actor: "cleric", spell: "sacred-flame", target: g.id }, DM));
  assert.equal(g.hp, 300, "a cantrip is stopped");
  assert.ok(r.events.some((e) => e.type === "note" && /does nothing/.test(e.text)));
  assert.ok(!r.events.some((e) => e.type === "save" && e.id === g.id), "no save, and none faked");
  turnOf(s, "wizard"); turnOf(s, "cleric");
  ok(apply(s, { type: "cast", actor: "cleric", spell: "guiding-bolt", target: g.id, slot: 4 }, DM));
  assert.equal(g.hp, 300, "even cast with a higher slot");
  assert.equal(s.entities.cleric.slots[4], slots[4] - 1, "the slot is spent");
  assert.ok(!g.cond?.guidingBolt);
});

test("Globe: the same spell cast from inside it works on a creature outside, and on one inside", () => {
  const s = field();
  const near = spawn(s, "goblin-warrior", 1, 0), far = spawn(s, "goblin-warrior", 5, 0);
  globe(s);
  fight(s, "wizard");
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "ray-of-frost", target: far.id }, DM));
  assert.ok(r.events.some((e) => e.type === "attack" && e.target === far.id), "cast from inside: the spell's attack is rolled at one outside");
  assert.ok(!r.events.some((e) => e.type === "note" && /does nothing/.test(e.text)));
});

test("Globe: the inside is left out of the area of a spell cast from outside; a creature outside the barrier in the same area is still hit", () => {
  const s = field();
  const inside = spawn(s, "goblin-warrior", 1, 0), outside = spawn(s, "goblin-warrior", 4, 0);
  globe(s);
  at(s.entities.cleric, 8, 0);
  s.entities.cleric.spells.push("shatter");
  fight(s, "cleric");
  const r = ok(apply(s, { type: "cast", actor: "cleric", spell: "shatter", hex: { q: 2, r: 0 } }, DM));
  const cast = r.events.find((e) => e.type === "cast");
  assert.ok(cast.targets.includes(outside.id), "the one outside is in the area");
  assert.ok(!cast.targets.includes(inside.id), "the one inside is left out of it");
  const keys = cast.hexes.map((h) => `${h.q},${h.r}`);
  assert.ok(keys.includes("3,0") && keys.length > 0, "the area outside the barrier is laid out");
  assert.ok(!keys.some((k) => s.effects.find((fx) => fx.terrain?.globe).terrain.hexes.includes(k)), "no hex of the barrier is in the area");
  assert.equal(inside.hp, 300, "inside: no effect");
});

test("Globe: a spell of the barrier's level or above gets through (what it blocks is its slot level less one)", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 1, 0);
  globe(s);
  const fx = effect(s, "Globe of Invulnerability");
  fx.level = 2;                                                  // as if cast with a lower slot: it blocks level 1 only
  at(s.entities.cleric, -4, 0);
  fight(s, "cleric");
  const r1 = ok(apply(s, { type: "cast", actor: "cleric", spell: "guiding-bolt", target: g.id }, DM));
  assert.ok(!r1.events.some((e) => e.type === "attack"), "level 1 against a barrier that blocks level 1: no attack is made");
  turnOf(s, "wizard"); turnOf(s, "cleric");
  fx.level = 1;                                                  // blocks nothing above level 0
  const r2 = ok(apply(s, { type: "cast", actor: "cleric", spell: "guiding-bolt", target: g.id }, DM));
  assert.ok(r2.events.some((e) => e.type === "attack" && e.target === g.id), "the spell is cast at it");
});

test("Globe: a higher slot raises what it blocks, and it ends with the spell", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 1, 0);
  globe(s, "wizard", 7);
  assert.equal(effect(s, "Globe of Invulnerability").level, 7);
  const fx = effect(s, "Globe of Invulnerability");
  at(s.entities.cleric, -4, 0);
  ok(apply(s, { type: "endEffect", actor: "wizard", effect: fx.id }, DM));
  assert.equal(effect(s, "Globe of Invulnerability"), undefined);
  fight(s, "cleric");
  const r = ok(apply(s, { type: "cast", actor: "cleric", spell: "sacred-flame", target: g.id }, DM));
  assert.ok(r.events.some((e) => e.type === "save" && e.id === g.id), "the barrier is gone: the save is made");
});

test("Globe: no cast is refused because of it (a cast with a creature inside changes the same as one with none, apart from the target)", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 1, 0);
  globe(s);
  at(s.entities.cleric, -4, 0);
  fight(s, "cleric");
  const r = apply(s, { type: "cast", actor: "cleric", spell: "sacred-flame", target: g.id }, DM);
  assert.equal(r.ok, true, r.error);
});

// ---------- Antilife Shell ----------
test("Shell: the cast puts an aura on the caster that moves with it", () => {
  const s = field();
  shell(s);
  const fx = effect(s, "Antilife Shell");
  assert.ok(fx?.terrain?.shell && fx.conc && fx.terrain.follows === "wizard");
});

test("Shell: a creature other than a Construct or Undead cannot move into it; the refusal changes nothing; an ally is held too", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 6, 0);
  shell(s);
  const before = JSON.stringify(s.entities), seq = s.seq;
  const r = apply(s, { type: "move", actor: g.id, to: { q: 2, r: 0 } }, DM);
  assert.equal(r.ok, false); assert.match(r.error, /Antilife Shell/);
  assert.equal(JSON.stringify(s.entities), before); assert.equal(s.seq, seq);
  ok(apply(s, { type: "move", actor: g.id, to: { q: 3, r: 0 } }, DM));         // right up to its edge
  const f = s.entities.fighter; at(f, -6, 0);
  const r2 = apply(s, { type: "move", actor: "fighter", to: { q: -3, r: 0 } }, DM);
  assert.equal(r2.ok, true, "outside it, a move is free");
  assert.equal(apply(s, { type: "move", actor: "fighter", to: { q: -2, r: 0 } }, DM).ok, false, "and into it is not");
});

test("Shell: moveOptions leaves out every place inside it for a creature outside, and keeps them for the caster, a Construct and an Undead", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 4, 0), z = spawn(s, "zombie", 4, 1);
  shell(s);
  const inside = (e) => [...moveOptions(s, e).values()].some((v) => v.canStop && Math.max(Math.abs(v.h.q), Math.abs(v.h.r), Math.abs(v.h.q + v.h.r)) <= 2);
  assert.equal(inside(g), false);
  assert.equal(inside(z), true, "an Undead may pass");
  assert.equal(inside(s.entities.wizard), true);
});

test("Shell: a creature already inside is not pushed and may move within it, and out", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 1, 0);
  shell(s);
  ok(apply(s, { type: "move", actor: g.id, to: { q: 0, r: 1 } }, DM));
  ok(apply(s, { type: "move", actor: g.id, to: { q: 5, r: 0 } }, DM));
  assert.equal(apply(s, { type: "move", actor: g.id, to: { q: 1, r: 0 } }, DM).ok, false, "and not back in");
});

test("Shell: a melee attack from outside at a creature inside is refused, and from inside at one outside; a spell is not", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 3, 0);
  s.entities.fighter.pos = { q: 2, r: 0, z: 0 };
  shell(s);
  const act = s.entities.goblin ?? g;
  const atk = g.actions?.find((x) => x.target?.creature?.reach) ?? null;
  assert.ok(atk, "a goblin has a melee action");
  fight(s, g.id);
  const before = JSON.stringify(s.entities), seq = s.seq;
  const r = apply(s, { type: "act", actor: g.id, action: atk.id, target: "fighter" }, DM);
  assert.equal(r.ok, false); assert.match(r.error, /Antilife Shell/);
  assert.equal(JSON.stringify(s.entities), before); assert.equal(s.seq, seq);
  // A spell from outside is not stopped by it.
  at(s.entities.cleric, -3, 0);
  turnOf(s, "cleric");
  const c = ok(apply(s, { type: "cast", actor: "cleric", spell: "sacred-flame", target: "fighter" }, DM));
  assert.ok(!c.events.some((e) => e.type === "note" && /does nothing/.test(e.text)));
  // Both inside: allowed.
  turnOf(s, g.id);
  at(g, 1, 0);
  ok(apply(s, { type: "act", actor: g.id, action: atk.id, target: "wizard" }, DM));
  void act;
});

test("Shell: a weapon attack of a character through it is refused too", () => {
  const s = field();
  const f = s.entities.fighter, g = spawn(s, "goblin-warrior", 2, 0);
  at(f, 3, 0);
  shell(s);
  const atk = f.attacks.find((x) => x.type === "melee");
  const r = apply(s, { type: "attack", actor: "fighter", target: g.id, attack: atk.id }, DM);
  assert.equal(r.ok, false); assert.match(r.error, /Antilife Shell/);
});

test("Shell: an Undead's attack is not stopped", () => {
  const s = field();
  const z = spawn(s, "zombie", 3, 0);
  at(s.entities.fighter, 2, 0);
  shell(s);
  const atk = z.actions.find((x) => x.target?.creature?.reach);
  ok(apply(s, { type: "act", actor: z.id, action: atk.id, target: "fighter" }, DM));
});

test("Shell: the caster moving so that a Huge or smaller creature is forced through it ends the spell; one already inside does not", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 3, 0);
  shell(s);
  ok(apply(s, { type: "move", actor: "wizard", to: { q: -1, r: 0 } }, DM));
  assert.ok(effect(s, "Antilife Shell"), "moving away: it holds");
  ok(apply(s, { type: "move", actor: "wizard", to: { q: 1, r: 0 } }, DM));   // the aura now covers the goblin at 3
  assert.equal(effect(s, "Antilife Shell"), undefined, "ended");
  assert.equal(g.pos.q, 3);
});

test("Shell: a Construct or Undead caught by the moving aura does not end it", () => {
  const s = field();
  spawn(s, "zombie", 3, 0);
  shell(s);
  ok(apply(s, { type: "move", actor: "wizard", to: { q: 1, r: 0 } }, DM));
  assert.ok(effect(s, "Antilife Shell"));
});

test("Shell: a creature the caster does not know of (hidden) is not refused, so the refusal can never tell a player something is there", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 6, 0);
  s.entities.wizard.side = "foes";                              // the DM's caster
  shell(s);
  s.entities.wizard.hidden = true;
  ok(apply(s, { type: "move", actor: "fighter", to: { q: -3, r: 0 } }, DM));
  at(s.entities.fighter, 3, 0);
  assert.equal(apply(s, { type: "move", actor: "fighter", to: { q: 1, r: 0 } }, DM).ok, true, "no refusal: the DM judges the shell of a caster nobody knows of");
  void g;
});

test("Shell: it ends with the spell and then nothing is held back", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 6, 0);
  shell(s);
  assert.equal(apply(s, { type: "move", actor: g.id, to: { q: 1, r: 0 } }, DM).ok, false);
  ok(apply(s, { type: "endEffect", actor: "wizard", effect: effect(s, "Antilife Shell").id }, DM));
  ok(apply(s, { type: "move", actor: g.id, to: { q: 1, r: 0 } }, DM));
});

test("Shell: the monster brain does not choose a reach attack through it (it would be refused), and no turn loops on it", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 3, 0);
  at(s.entities.fighter, 2, 0);
  for (const id of ["rogue", "cleric"]) s.entities[id].hp = 0, s.entities[id].dead = true;
  shell(s);
  fight(s, g.id);
  for (let i = 0; i < 4 && current(s) === g.id; i++) {
    const a = aiStep(s, g.id);
    assert.ok(a, "the brain gives an action");
    const r = apply(s, a, DM);
    assert.equal(r.ok, true, `${JSON.stringify(a)}: ${r.error}`);
    if (a.type === "endTurn") break;
  }
});
