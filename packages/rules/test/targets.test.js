// More than one target (DEBT S2): `target.creature.count`, rays and darts that may repeat a
// target, more targets with higher slots, and areas whose caster picks who is affected.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PLAYER = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  ok(apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM));
  Object.assign(s.entities.wizard, { slots: { 1: 4, 2: 3, 3: 3, 4: 2, 5: 2, 6: 1, 7: 1 }, slotsMax: { 1: 4, 2: 3, 3: 3, 4: 2, 5: 2, 6: 1, 7: 1 } });
  return s;
}
const spawn = (s, monster, q, r) => { const e = s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 300; return e; };
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 30 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const know = (s, ...ids) => { s.entities.wizard.spells.push(...ids); };
const cast = (s, spell, extra) => apply(s, { type: "cast", actor: "wizard", spell, ...extra }, DM);
const fresh = (s) => { s.encounter.budget.action = 1; s.encounter.budget.bonus = 1; s.encounter.flags = {}; };

test("Magic Missile's darts go where the caster sends them, one creature or several", () => {
  const s = field(), a = spawn(s, "goblin-warrior", 3, 0), b = spawn(s, "goblin-warrior", 3, 2);
  assert.equal(SPELLS["magic-missile"].def.tier, "auto");
  fight(s); turnOf(s, "wizard");
  const res = ok(cast(s, "magic-missile", { targets: [a.id, a.id, b.id] }));
  const hits = res.events.filter((e) => e.type === "damage");
  assert.deepEqual(hits.map((e) => e.target), [a.id, a.id, b.id]);
  assert.ok(hits.every((e) => e.amount >= 2 && e.amount <= 5));
  assert.equal(res.events.some((e) => e.type === "manual"), false);
  fresh(s);
  assert.match(cast(s, "magic-missile", { targets: [a.id, a.id, a.id, a.id] }).error, /has 3 targets/);
  assert.match(cast(s, "magic-missile", { targets: [] }).error, /Pick a target/);
});

test("Scorching Ray rolls an attack for each ray, and a higher slot adds one", () => {
  const s = field(), a = spawn(s, "goblin-warrior", 3, 0), b = spawn(s, "goblin-warrior", 3, 2);
  know(s, "scorching-ray");
  fight(s); turnOf(s, "wizard");
  assert.match(cast(s, "scorching-ray", { targets: [a.id, a.id, b.id, b.id] }).error, /has 3 targets/);
  const res = ok(cast(s, "scorching-ray", { targets: [a.id, a.id, b.id, b.id], slot: 3 }));
  assert.deepEqual(res.events.filter((e) => e.type === "attack").map((e) => e.target), [a.id, a.id, b.id, b.id]);
});

test("a spell that may not repeat a target refuses the same creature twice; Hold Monster takes one more per slot", () => {
  const s = field(), a = spawn(s, "goblin-warrior", 3, 0), b = spawn(s, "goblin-warrior", 3, 2);
  know(s, "hold-monster");
  assert.equal(SPELLS["hold-monster"].def.tier, "auto");
  fight(s); turnOf(s, "wizard");
  assert.match(cast(s, "hold-monster", { targets: [a.id, b.id] }).error, /has one target/);
  assert.match(cast(s, "hold-monster", { targets: [a.id, a.id], slot: 6 }).error, /same creature twice/);
  const res = ok(cast(s, "hold-monster", { targets: [a.id, b.id], slot: 6 }));
  assert.deepEqual(res.events.filter((e) => e.type === "save").map((e) => e.id), [a.id, b.id]);
  assert.deepEqual(res.events.find((e) => e.type === "effectStart").targets, [a.id, b.id]);
});

test("Chain Lightning: the others within 30 ft of the first, one damage roll for all", () => {
  const s = field(), a = spawn(s, "goblin-warrior", 4, 0), b = spawn(s, "goblin-warrior", 6, 0), far = spawn(s, "goblin-warrior", 4, -8);
  know(s, "chain-lightning");
  for (const g of [a, b]) g.abil.dex = 1;
  fight(s); turnOf(s, "wizard");
  assert.match(cast(s, "chain-lightning", { targets: [a.id, far.id] }).error, /more than 30 ft from/);
  const res = ok(cast(s, "chain-lightning", { targets: [a.id, b.id] }));
  const saves = res.events.filter((e) => e.type === "save"), hits = res.events.filter((e) => e.type === "damage");
  const full = hits.map((h, i) => (saves[i].success ? h.amount * 2 : h.amount));
  assert.ok(Math.abs(full[0] - full[1]) <= 1, "rolled once for everyone who saves against it");
});

test("Mass Healing Word heals up to six; Eldritch Blast fires more beams as the caster rises in level", () => {
  const s = field();
  know(s, "mass-healing-word", "eldritch-blast");
  const party = ["fighter", "rogue", "cleric", "wizard"];
  for (const id of party) s.entities[id].hp = 1;
  for (const [i, id] of ["fighter", "rogue", "cleric"].entries()) ok(apply(s, { type: "place", actor: id, to: { q: 1, r: i } }, DM));
  const res = ok(cast(s, "mass-healing-word", { targets: party }));
  assert.deepEqual(res.events.filter((e) => e.type === "heal").map((e) => e.target), party);
  const g = spawn(s, "goblin-warrior", 3, 0);
  fight(s); turnOf(s, "wizard");
  assert.match(cast(s, "eldritch-blast", { targets: [g.id, g.id] }).error, /has one target/);
  s.entities.wizard.level = 5;
  const blast = ok(cast(s, "eldritch-blast", { targets: [g.id, g.id] }));
  assert.equal(blast.events.filter((e) => e.type === "attack").length, 2);
});

test("an area whose caster picks among those caught: Slow and Mass Cure Wounds", () => {
  const s = field();
  know(s, "slow", "mass-cure-wounds");
  const foes = [[5, 0], [6, 0], [5, 1], [6, 1], [7, 0], [7, -1], [6, -1]].map(([q, r]) => spawn(s, "goblin-warrior", q, r));
  fight(s); turnOf(s, "wizard");
  assert.match(cast(s, "slow", { hex: { q: 5, r: 0 } }).error, /up to 6 creatures/);
  const outside = spawn(s, "goblin-warrior", -5, 0);
  assert.match(cast(s, "slow", { hex: { q: 5, r: 0 }, targets: [outside.id] }).error, /not in the area/);
  const res = ok(cast(s, "slow", { hex: { q: 5, r: 0 }, targets: foes.slice(0, 2).map((f) => f.id) }));
  assert.deepEqual(res.events.filter((e) => e.type === "save").map((e) => e.id), foes.slice(0, 2).map((f) => f.id));
  // Mass Cure Wounds heals only those picked, though others stand in the sphere.
  fresh(s); s.encounter.flags = {};
  for (const id of ["fighter", "rogue"]) { s.entities[id].hp = 1; }
  ok(apply(s, { type: "place", actor: "fighter", to: { q: 1, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "rogue", to: { q: 1, r: 1 } }, DM));
  const heal = ok(cast(s, "mass-cure-wounds", { hex: { q: 1, r: 0 }, targets: ["fighter", "rogue"] }));
  assert.deepEqual(heal.events.filter((e) => e.type === "heal").map((e) => e.target), ["fighter", "rogue"]);
});

test("a manual spell on several creatures tells the DM once, and players never learn of hidden targets", () => {
  const s = field();
  know(s, "water-breathing");
  for (const [i, id] of ["fighter", "rogue"].entries()) ok(apply(s, { type: "place", actor: id, to: { q: 1, r: i } }, DM));
  const res = ok(cast(s, "water-breathing", { targets: ["fighter", "rogue", "wizard"] }));
  assert.equal(res.events.filter((e) => e.type === "manual").length, 1);
  // A creature in a part of the map the players have not been shown stays unnamed in what they are sent.
  const seen = spawn(s, "goblin-warrior", 3, 1), unseen = spawn(s, "goblin-warrior", 3, 0);
  fight(s); turnOf(s, "wizard");
  const mm = ok(cast(s, "magic-missile", { targets: [seen.id, unseen.id, unseen.id] }));
  s.entities[unseen.id].hidden = true;                                  // as the view would class a creature it must not name
  const sent = viewEvents(mm.events, s, PLAYER).find((e) => e.type === "cast");
  assert.deepEqual(sent.targets, [seen.id]);
});
