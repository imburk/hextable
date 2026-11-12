// The spell re-tiering pass, levels 4 and 5 (docs/DEBT.md, Spells): Conjure Woodland Beings, Fire Shield,
// Mislead (manual to assist), Black Tentacles and Insect Plague (assist, now run as zones).
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
function field() {
  const s = newGame(5);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.encounter = null; s.settings.autoEngage = false;
  ok(apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM));
  Object.assign(s.entities.wizard, { slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 }, slotsMax: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 }, hp: 500, maxHp: 500 });
  s.entities.wizard.spells.push("conjure-woodland-beings", "fire-shield", "mislead", "black-tentacles", "insect-plague");
  return s;
}
const spawn = (s, q, r) => { const e = s.entities[ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 300; return e; };
const turnOf = (s, id) => { for (let i = 0; i < 60 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 14 }, DM));

test("tiers", () => {
  for (const id of ["conjure-woodland-beings", "fire-shield", "mislead"]) assert.equal(SPELLS[id].def.tier, "assist", id);
  for (const id of ["black-tentacles", "insect-plague"]) assert.deepEqual([SPELLS[id].def.tier, SPELLS[id].def.zone.on, SPELLS[id].def.zone.atCast], ["assist", ["enter", "turnEnd"], true], id);
});

test("Conjure Woodland Beings: an emanation that moves with the caster; a save on entering or ending a turn inside, force damage", () => {
  const s = field(), g = spawn(s, 1, 1), far = spawn(s, 6, 0);
  for (const x of [g, far]) x.abil.wis = 1;
  fight(s); turnOf(s, "wizard");
  const cast = ok(apply(s, { type: "cast", actor: "wizard", spell: "conjure-woodland-beings", spare: [] }, DM));
  assert.equal(cast.events.some((e) => e.type === "save"), false, "nobody saves as it appears");
  const fx = s.effects.find((x) => x.name === "Conjure Woodland Beings");
  assert.equal(fx.zone.follows, "wizard");
  // The goblin beside the wizard ends its turn inside the emanation: a Wisdom save, and force damage on a failure.
  turnOf(s, g.id);
  const end = ok(apply(s, { type: "endTurn", actor: g.id }, DM));
  assert.ok(end.events.some((e) => e.type === "save" && e.id === g.id), "the goblin saves");
  assert.ok(end.events.some((e) => e.type === "damage" && e.target === g.id && e.dtype === "force"));
  assert.equal(end.events.some((e) => e.type === "save" && e.id === far.id), false);
});

test("Fire Shield: Resistance to the type chosen (Cold for the warm shield), the retaliation left to the DM", () => {
  const s = field(), w = s.entities.wizard;
  assert.match(apply(s, { type: "cast", actor: "wizard", spell: "fire-shield" }, DM).error, /Choose a damage type/);
  assert.equal(apply(s, { type: "cast", actor: "wizard", spell: "fire-shield", choice: "acid" }, DM).ok, false, "only cold or fire");
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "fire-shield", choice: "cold" }, DM));
  assert.ok(r.events.some((e) => e.type === "manual" && /2d8/.test(e.text)));
  const g = spawn(s, 3, 0);
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }, DM));
  w.hp = 500;
  const hp0 = w.hp;
  // Resistance: 10 cold damage becomes 5; fire is not resisted.
  ok(apply(s, { type: "harm", actor: "wizard", amount: 10, dtype: "cold" }, DM));
  assert.equal(hp0 - w.hp, 5);
  ok(apply(s, { type: "harm", actor: "wizard", amount: 10, dtype: "fire" }, DM));
  assert.equal(hp0 - w.hp, 15);
  assert.ok(g);
});

test("Mislead: the caster is Invisible, and the DM is told about the double and when it ends", () => {
  const s = field(), w = s.entities.wizard;
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "mislead" }, DM));
  assert.ok(w.cond.invisible);
  assert.equal(s.encounter, null, "a helpful spell starts no fight");
  assert.ok(r.events.some((e) => e.type === "manual" && /double/.test(e.text)));
});

test("Black Tentacles and Insect Plague: a creature in the area as it appears saves, and one that ends its turn there saves", () => {
  for (const [spell, hex, save] of [["black-tentacles", { q: 4, r: 0 }, "str"], ["insect-plague", { q: 5, r: 0 }, "con"]]) {
    const s = field(), a = spawn(s, hex.q, hex.r), far = spawn(s, 4, 6);
    for (const x of [a, far]) { x.abil[save] = 1; }
    fight(s); turnOf(s, "wizard");
    const cast = ok(apply(s, { type: "cast", actor: "wizard", spell, hex }, DM));
    assert.equal(cast.events.filter((e) => e.type === "save" && e.id === a.id).length, 1, `${spell}: it appears on a creature`);
    assert.equal(cast.events.some((e) => e.type === "save" && e.id === far.id), false);
    // Its own turn is a different turn from the casting one: ending it inside the area is one more save.
    turnOf(s, a.id);
    const end = ok(apply(s, { type: "endTurn", actor: a.id }, DM));
    assert.equal(end.events.filter((e) => e.type === "save" && e.id === a.id).length, 1, `${spell}: ending a turn inside the area`);
    assert.equal(end.events.some((e) => e.type === "save" && e.id === far.id), false);
  }
});
