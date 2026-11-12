// "Until the start of your next turn", "until the end of its next turn" (DEBT S5): endings tied to a
// turn boundary of the caster or the target, and a modifier used up by the roll it applies to.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current } from "../src/engine.js";
import { modifiers, speedOf } from "../src/modifiers.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", 0, 0], ["fighter", 1, 0], ["rogue", -4, 4], ["cleric", 1, -1]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  for (const id of ["wizard", "cleric"]) Object.assign(s.entities[id], { slots: { 1: 4, 2: 3 }, slotsMax: { 1: 4, 2: 3 } });
  s.entities.wizard.spells.push("ray-of-frost", "ray-of-sickness", "color-spray");
  s.entities.cleric.spells.push("guiding-bolt", "vicious-mockery");
  return s;
}
const spawn = (s, monster, q, r) => { const e = s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 300; return e; };
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const end = (s) => ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
// Cast until it lands (a hit, or a failed save), giving back the action each time.
function land(s, actor, spell, target, landed) {
  for (let i = 0; i < 30; i++) {
    s.encounter.budget.action = 1; s.encounter.flags = {};
    const r = ok(apply(s, { type: "cast", actor, spell, target }, DM));
    if (landed(r.events)) return r;
  }
  assert.fail(`${spell} never landed`);
}
const hit = (ev) => ev.some((e) => e.type === "attack" && e.hit);

test("Ray of Frost slows the target until the start of the caster's next turn, then the effect is gone", () => {
  const s = field(), g = spawn(s, "goblin-warrior", 4, 0);
  g.ac = 1;
  fight(s); turnOf(s, "wizard");
  const res = land(s, "wizard", "ray-of-frost", g.id, hit);
  assert.equal(speedOf(s, g), g.speed - 10);
  assert.ok(res.events.some((e) => e.type === "effectStart" && e.name === "Ray of Frost"));
  end(s);
  turnOf(s, g.id);
  assert.equal(speedOf(s, g), g.speed - 10, "still slow on its own turn");
  turnOf(s, "wizard");
  assert.equal(speedOf(s, g), g.speed);
  assert.equal(s.effects.some((fx) => fx.name === "Ray of Frost"), false);
});

test("a ray that misses leaves no effect behind", () => {
  const s = field(), g = spawn(s, "goblin-warrior", 4, 0);
  g.ac = 99;
  fight(s); turnOf(s, "wizard");
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "ray-of-frost", target: g.id }, DM));
  assert.equal(r.events.some((e) => e.type === "effectStart"), false);
  assert.equal((s.effects ?? []).length, 0);
});

test("Ray of Sickness: Poisoned until the end of the caster's next turn, not the end of this one", () => {
  const s = field(), g = spawn(s, "goblin-warrior", 4, 0);
  g.ac = 1;
  fight(s); turnOf(s, "wizard");
  land(s, "wizard", "ray-of-sickness", g.id, hit);
  assert.ok(g.cond.poisoned);
  end(s);
  assert.ok(g.cond.poisoned, "the end of the turn it was cast in does not count");
  turnOf(s, "wizard");
  assert.ok(g.cond.poisoned);
  end(s);
  assert.equal(g.cond.poisoned, undefined);
});

test("a dust mephit's Blinding Breath lasts until the end of the mephit's next turn", () => {
  const s = field(), m = spawn(s, "dust-mephit", 2, 0);
  s.entities.fighter.abil.dex = 1;
  fight(s);
  for (let i = 0; i < 30 && !s.entities.fighter.cond.blinded; i++) {
    turnOf(s, m.id);
    delete m.spent;
    apply(s, { type: "act", actor: m.id, action: "blinding-breath", hex: { q: 1, r: 0 } }, DM);
    if (!s.entities.fighter.cond.blinded) end(s);
  }
  assert.ok(s.entities.fighter.cond.blinded);
  end(s);
  assert.ok(s.entities.fighter.cond.blinded, "still blind after the mephit's own turn ends");
  turnOf(s, m.id);
  end(s);
  assert.equal(s.entities.fighter.cond.blinded, undefined);
});

test("Guiding Bolt's Advantage is used by the next attack, and outlasts its 1-round duration until the end of the caster's next turn", () => {
  const s = field(), g = spawn(s, "goblin-warrior", 3, 0);
  g.ac = 1;
  fight(s); turnOf(s, "cleric");
  land(s, "cleric", "guiding-bolt", g.id, hit);
  assert.equal(modifiers(s, g, "attack.received").advantage.length, 1);
  // The next attack against it, before the end of the cleric's next turn, uses it.
  end(s);
  turnOf(s, "fighter");
  ok(apply(s, { type: "place", actor: "fighter", to: { q: 2, r: 0 } }, DM));
  const atk = ok(apply(s, { type: "attack", actor: "fighter", target: g.id, attack: s.entities.fighter.attacks[0].id }, DM)).events.find((e) => e.type === "attack");
  assert.equal(atk.mode, "adv");
  assert.ok(atk.why.includes("Guiding Bolt"));
  assert.equal(modifiers(s, g, "attack.received").advantage.length, 0, "used up");
  // Unused, it lasts past the start of the cleric's next turn (its 1 round) to the end of that turn.
  turnOf(s, "cleric");
  land(s, "cleric", "guiding-bolt", g.id, hit);
  end(s);
  turnOf(s, "cleric");
  assert.equal(modifiers(s, g, "attack.received").advantage.length, 1, "still there at the start of the caster's next turn");
  end(s);
  assert.equal(modifiers(s, g, "attack.received").advantage.length, 0);
  assert.equal(s.effects.some((fx) => fx.name === "Guiding Bolt"), false);
});

test("Vicious Mockery: Disadvantage on the target's next attack roll only", () => {
  const s = field(), g = spawn(s, "goblin-warrior", 2, -1);
  g.abil.wis = 1;
  fight(s); turnOf(s, "cleric");
  land(s, "cleric", "vicious-mockery", g.id, (ev) => ev.some((e) => e.type === "save" && !e.success));
  assert.equal(modifiers(s, g, "attack.roll").disadvantage.length, 1);
  turnOf(s, g.id);
  const rend = g.actions.find((a) => a.effects?.[0]?.attack === "melee").id;
  const first = ok(apply(s, { type: "act", actor: g.id, action: rend, target: "cleric" }, DM)).events.find((e) => e.type === "attack");
  assert.equal(first.mode, "dis");
  assert.equal(modifiers(s, g, "attack.roll").disadvantage.length, 0);
});
