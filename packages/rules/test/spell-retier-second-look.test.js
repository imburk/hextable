// A second look at levels 1 to 3 (docs/DEBT.md, Spells): spells where the engine now does the numbers and the DM
// only the rider, moved from manual to assist: Sleep, Ray of Enfeeblement, Pass without Trace, Sleet Storm.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { apply, current } from "../src/engine.js";
import { modifiers } from "../src/modifiers.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
function field() {
  const s = newGame(5);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.encounter = null; s.settings.autoEngage = false;
  ok(apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "fighter", to: { q: 1, r: 0 } }, DM));
  Object.assign(s.entities.wizard, { slots: { 1: 4, 2: 3, 3: 3 }, slotsMax: { 1: 4, 2: 3, 3: 3 }, hp: 500, maxHp: 500 });
  s.entities.wizard.spells.push("sleep", "ray-of-enfeeblement", "pass-without-trace", "sleet-storm");
  return s;
}
const spawn = (s, q, r) => { const e = s.entities[ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 300; return e; };
const turnOf = (s, id) => { for (let i = 0; i < 60 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 14 }, DM));
const flunk = (e, abil) => { e.abil[abil] = 1; e.saveBonus = { ...(e.saveBonus ?? {}), [abil]: -10 }; };
const pass = (e, abil) => { e.abil[abil] = 30; e.saveBonus = { ...(e.saveBonus ?? {}), [abil]: 30 }; };

test("tiers", () => {
  for (const id of ["sleep", "ray-of-enfeeblement", "pass-without-trace", "sleet-storm"]) assert.equal(SPELLS[id].def.tier, "assist", id);
});

test("Sleep: a failed save is Incapacitated until the end of its next turn, and the DM is told about the second save", () => {
  const s = field(), a = spawn(s, 4, 0), b = spawn(s, 4, 1), far = spawn(s, 4, 5);
  flunk(a, "wis"); pass(b, "wis"); flunk(far, "wis");
  fight(s); turnOf(s, "wizard");
  const cast = ok(apply(s, { type: "cast", actor: "wizard", spell: "sleep", hex: { q: 4, r: 0 } }, DM));
  assert.ok(a.cond.incapacitated, "failed: Incapacitated");
  assert.equal(b.cond.incapacitated, undefined, "passed");
  assert.equal(far.cond.incapacitated, undefined, "outside the sphere");
  assert.ok(cast.events.some((e) => e.type === "manual" && /Unconscious/.test(e.text)));
  turnOf(s, a.id);
  assert.ok(a.cond.incapacitated, "still, on its own turn");
  ok(apply(s, { type: "endTurn", actor: a.id }, DM));
  assert.equal(a.cond.incapacitated, undefined, "ends at the end of its next turn");
});

test("Ray of Enfeeblement: a failed save gives Disadvantage on Strength tests and -1d8 to damage", () => {
  const s = field(), a = spawn(s, 4, 0);
  flunk(a, "con");
  fight(s); turnOf(s, "wizard");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "ray-of-enfeeblement", target: a.id }, DM));
  const m = (e, hook, sit) => modifiers(s, e, hook, sit);
  assert.ok(m(a, "save.str", { ability: "str" }).disadvantage.length > 0, "Strength saves at Disadvantage");
  assert.equal(m(a, "save.dex", { ability: "dex" }).disadvantage.length, 0, "other saves are not");
  assert.ok(m(a, "check", { ability: "str", skill: "athletics" }).disadvantage.length > 0, "Strength checks");
  assert.equal(m(a, "check", { ability: "dex", skill: "stealth" }).disadvantage.length, 0);
  assert.ok(m(a, "damage.dealt", { attacker: a, target: s.entities.wizard }).dealt.some((x) => x.value === "-1d8"));
});

test("Ray of Enfeeblement: a successful save gives Disadvantage on the next attack roll only", () => {
  const s = field(), b = spawn(s, 4, 1);
  pass(b, "con");
  fight(s); turnOf(s, "wizard");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "ray-of-enfeeblement", target: b.id }, DM));
  const m = (e, hook, sit) => modifiers(s, e, hook, sit);
  assert.ok(m(b, "attack.roll", { attack: "melee", target: s.entities.wizard }).disadvantage.length > 0);
  assert.equal(m(b, "save.str", { ability: "str" }).disadvantage.length, 0, "no Strength penalty on a success");
  assert.equal(m(b, "damage.dealt", { attacker: b, target: s.entities.wizard }).dealt.length, 0);
});

test("Pass without Trace: +10 to Stealth checks, and only to Stealth, for the caster and the creatures chosen in the aura", () => {
  const s = field(), w = s.entities.wizard, f = s.entities.fighter;
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "pass-without-trace", targets: [f.id] }, DM));
  assert.equal(s.encounter, null, "no fight");
  const stealth = (e) => modifiers(s, e, "check", { ability: "dex", skill: "stealth" }).add;
  assert.deepEqual([stealth(w), stealth(f)], [10, 10]);
  assert.equal(modifiers(s, f, "check", { ability: "dex", skill: "acrobatics" }).add, 0);
  assert.ok(r.events.some((e) => e.type === "manual" && /leaves the aura|leaves tracks|no tracks/.test(e.text)));
});

test("Sleet Storm: a creature in the cylinder as it is entered or on its turn saves, and falls Prone; the DM is told about Concentration", () => {
  const s = field(), a = spawn(s, 5, 0);
  flunk(a, "dex");
  fight(s); turnOf(s, "wizard");
  const cast = ok(apply(s, { type: "cast", actor: "wizard", spell: "sleet-storm", hex: { q: 5, r: 0 } }, DM));
  assert.equal(cast.events.some((e) => e.type === "save" && e.id === a.id), false, "not 'atCast'");
  const seen = [];
  for (let i = 0; i < 12 && !seen.some((e) => e.type === "zone" && e.id === a.id); i++) seen.push(...ok(apply(s, { type: "endTurn", actor: current(s) }, DM)).events);
  assert.ok(seen.some((e) => e.type === "save" && e.id === a.id), "it starts its turn in the storm and saves");
  assert.ok(seen.some((e) => e.type === "cond" && e.id === a.id && e.cond === "prone"), "and falls Prone");
});
