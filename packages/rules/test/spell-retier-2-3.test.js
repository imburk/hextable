// The spell re-tiering pass, levels 2 and 3 (docs/DEBT.md, Spells): Zone of Truth.
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
  ok(apply(s, { type: "place", actor: "cleric", to: { q: 0, r: 0 } }, DM));
  Object.assign(s.entities.cleric, { slots: { 1: 4, 2: 3 }, slotsMax: { 1: 4, 2: 3 } });
  s.entities.cleric.spells.push("zone-of-truth");
  return s;
}
const spawn = (s, q, r) => { const e = s.entities[ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 300; return e; };
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };

test("Zone of Truth: a Charisma save when a creature enters the sphere or starts its turn there, once a turn; a failure is handed to the DM", () => {
  assert.deepEqual([SPELLS["zone-of-truth"].def.tier, SPELLS["zone-of-truth"].def.zone.on], ["assist", ["enter", "turnStart"]]);
  const s = field(), g = spawn(s, 8, 0), far = spawn(s, 4, 4);
  g.abil.cha = 1; far.abil.cha = 1;
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 14 }, DM)); turnOf(s, "cleric");
  const cast = ok(apply(s, { type: "cast", actor: "cleric", spell: "zone-of-truth", hex: { q: 6, r: 0 } }, DM));
  assert.equal(cast.events.some((e) => e.type === "save"), false, "nobody saves as it appears (it is not 'atCast')");
  const fx = s.effects.find((x) => x.name === "Zone of Truth");
  assert.ok(fx.zone.hexes.includes("6,0") && fx.zone.hexes.includes("8,0"), "a sphere of 15 feet radius is 3 hexes");
  assert.equal(fx.zone.hexes.includes("4,4"), false);
  // The goblin starts its turn inside: one save, a manual event for the DM if it fails; the far one is left alone.
  turnOf(s, g.id);
  let saw = [];
  const r = ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); saw.push(...r.events);
  for (let i = 0; i < 12 && current(s) !== g.id; i++) saw.push(...ok(apply(s, { type: "endTurn", actor: current(s) }, DM)).events);
  const saves = saw.filter((e) => e.type === "save" && e.id === g.id);
  assert.equal(saves.length, 1);
  assert.equal(saw.some((e) => e.type === "save" && e.id === far.id), false);
  if (!saves[0].success) assert.ok(saw.some((e) => e.type === "manual" && /deliberate lie/.test(e.text)));
});
