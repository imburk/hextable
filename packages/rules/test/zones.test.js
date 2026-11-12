// Lasting zones (DEBT S4): an area that stays and works on a creature that enters it, or starts
// or ends its turn there. Moonbeam, Spirit Guardians, Web.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PLAYER = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", 0, 0], ["fighter", -2, 0], ["rogue", -4, 4], ["cleric", -1, 1]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  for (const id of ["wizard", "cleric"]) Object.assign(s.entities[id], { slots: { 1: 4, 2: 3, 3: 3 }, slotsMax: { 1: 4, 2: 3, 3: 3 } });
  s.entities.wizard.spells.push("moonbeam", "web", "thunderwave");
  s.entities.cleric.spells.push("spirit-guardians");
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 300;
  return s;
}
const spawn = (s, monster, q, r) => { const e = s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 300; return e; };
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const savesBy = (events, id) => events.filter((e) => e.type === "save" && e.id === id);

test("Moonbeam: a save as it appears, when a creature walks in, and at the end of a turn there, once a turn", () => {
  const s = field(), a = spawn(s, "goblin-warrior", 4, 0), b = spawn(s, "goblin-warrior", 4, 3);
  fight(s); turnOf(s, "wizard");
  const cast = ok(apply(s, { type: "cast", actor: "wizard", spell: "moonbeam", hex: { q: 4, r: 0 } }, DM));
  assert.equal(savesBy(cast.events, a.id).length, 1, "it appears on the first goblin");
  const fx = s.effects.find((x) => x.name === "Moonbeam");
  assert.ok(fx.zone.hexes.includes("4,1"));
  // The second goblin walks in on its turn: one save, and the walk stops there; ending its turn there is the same turn.
  turnOf(s, b.id);
  const walk = ok(apply(s, { type: "move", actor: b.id, to: { q: 4, r: 1 } }, DM));
  assert.equal(savesBy(walk.events, b.id).length, 1);
  assert.deepEqual([b.pos.q, b.pos.r], [4, 1]);
  const end = ok(apply(s, { type: "endTurn", actor: b.id }, DM));
  assert.equal(savesBy(end.events, b.id).length, 0, "only once a turn");
  // The first goblin ends a later turn there: another save.
  let later = [];
  for (let i = 0; i < 10 && current(s) !== a.id; i++) later.push(...ok(apply(s, { type: "endTurn", actor: current(s) }, DM)).events);
  later = ok(apply(s, { type: "endTurn", actor: a.id }, DM)).events;
  assert.equal(savesBy(later, a.id).length, 1);
  // Players are not sent the zone itself, nor the zone event; they see the save and the damage.
  s.entities.wizard.owner = "pat";
  assert.equal("zone" in view(s, PLAYER).effects.find((x) => x.name === "Moonbeam"), false);
  assert.equal(viewEvents(later, s, PLAYER).some((e) => e.type === "zone"), false);
});

test("Spirit Guardians moves with the cleric, spares whom it names, and uses the damage type chosen", () => {
  const s = field(), g = spawn(s, "goblin-warrior", 1, 1), far = spawn(s, "goblin-warrior", -1, 6);
  for (const x of [g, far]) x.abil.wis = 1;
  fight(s); turnOf(s, "cleric");
  assert.match(apply(s, { type: "cast", actor: "cleric", spell: "spirit-guardians", spare: ["fighter", "wizard", "rogue"] }, DM).error, /Choose a damage type/);
  const cast = ok(apply(s, { type: "cast", actor: "cleric", spell: "spirit-guardians", choice: "radiant", spare: ["fighter", "wizard", "rogue"] }, DM));
  assert.equal(cast.events.filter((e) => e.type === "save").length, 0, "nobody saves as it appears");
  // The cleric walks toward the far goblin: the emanation reaches it.
  const walk = ok(apply(s, { type: "move", actor: "cleric", to: { q: -1, r: 3 } }, DM));
  const sv = savesBy(walk.events, far.id);
  assert.equal(sv.length, 1);
  const dmg = walk.events.filter((e) => e.type === "damage" && e.target === far.id);
  if (!sv[0].success) assert.equal(dmg[0].dtype, "radiant");
  assert.equal(savesBy(walk.events, "fighter").length + savesBy(walk.events, "wizard").length, 0, "spared");
  // The near goblin ends its turn inside: a save.
  ok(apply(s, { type: "endTurn", actor: "cleric" }, DM));
  let evs = [];
  for (let i = 0; i < 10; i++) {
    const cur = current(s);
    evs = ok(apply(s, { type: "endTurn", actor: cur }, DM)).events;
    if (cur === g.id || cur === far.id) assert.ok(savesBy(evs, cur).length <= 1);
    if (cur === "cleric") break;
  }
});

test("Web: a save on starting a turn in it; the Restrained it gives ends with the spell", () => {
  const s = field(), g = spawn(s, "goblin-warrior", 5, 0);
  g.abil.dex = 1;
  fight(s); turnOf(s, "wizard");
  const cast = ok(apply(s, { type: "cast", actor: "wizard", spell: "web", hex: { q: 5, r: 0 } }, DM));
  assert.equal(savesBy(cast.events, g.id).length, 0, "appearing is not entering");
  for (let i = 0; i < 6 && !g.cond.restrained; i++) { turnOf(s, g.id); if (!g.cond.restrained) ok(apply(s, { type: "endTurn", actor: g.id }, DM)); }
  assert.ok(g.cond.restrained, "it failed a save at the start of a turn in the web");
  const fx = s.effects.find((x) => x.name === "Web");
  assert.ok(fx.parts.some((p) => p.cond === "restrained" && p.target === g.id));
  // Concentration ends: the web goes, and the Restrained with it.
  s.entities.wizard.hp = 1;
  ok(apply(s, { type: "setHp", actor: "wizard", hp: 0 }, DM));
  assert.equal(s.effects.some((x) => x.name === "Web"), false);
  assert.equal(g.cond.restrained, undefined);
});

test("a creature pushed into a zone by another spell saves once that spell is done", () => {
  const s = field(), g = spawn(s, "goblin-warrior", 1, 0);
  g.abil.con = 1;
  fight(s); turnOf(s, "wizard");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "moonbeam", hex: { q: 3, r: 0 } }, DM));
  s.encounter.budget.action = 1; s.encounter.flags = {};
  let res = null;
  for (let i = 0; i < 20; i++) {
    res = ok(apply(s, { type: "cast", actor: "wizard", spell: "thunderwave", hex: { q: 1, r: 0 } }, DM));
    if (g.pos.q >= 2) break;
    s.encounter.budget.action = 1; s.encounter.flags = {}; s.entities.wizard.slots[1] = 4;
    ok(apply(s, { type: "place", actor: g.id, to: { q: 1, r: 0 } }, DM));
  }
  assert.ok(g.pos.q >= 2, "pushed toward the beam");
  const types = res.events.map((e) => e.type);
  const pushed = types.indexOf("moved"), zone = types.indexOf("zone");
  assert.equal(g.pos.q, 3, "pushed the full 10 feet, into the beam");
  { assert.ok(zone > pushed, "the zone goes off after the push, once Thunderwave is resolved"); assert.equal(savesBy(res.events, g.id).length, 2); }
});
