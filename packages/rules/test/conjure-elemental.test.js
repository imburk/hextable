// Conjure Elemental (#921, B3c of #786): a zone that holds one creature. Every test goes through apply().
// Built to docs/specs/rules-expansion.md, "Build notes: Conjure Elemental (#921)".
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const bad = (r, re) => { assert.ok(!r.ok, "expected a refusal"); if (re) assert.match(r.error, re); return r; };
const lint = (def) => lintEntry("spells", def, { strict: false });
const byName = (s, name) => Object.values(s.entities).find((e) => e.name === name);
const SPIRIT = { q: 4, r: 0 };      // a Large space: (4,0), (4,1), (5,0); the area is every hex within 5 feet of them

// A grass field, the party placed, the cleric (the caster) with Conjure Elemental and slots of 5 and 6.
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (let q = -16; q <= 40; q++) for (let r = -8; r <= 8; r++) s.map.levels[0].tiles[`${q},${r}`] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", -6, 0], ["fighter", -8, 0], ["rogue", -8, 2], ["cleric", 0, 0]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  Object.assign(s.entities.cleric, { slots: { 5: 2, 6: 1 }, slotsMax: { 5: 2, 6: 1 } });
  s.entities.cleric.spells.push("conjure-elemental");
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 80;
  return s;
}
const spawn = (s, monster, q, r, name) => { ok(apply(s, { type: "spawn", monster, at: { q, r }, name }, DM)); const m = byName(s, name); m.hp = m.maxHp = 600; return m; };
const conjure = (s, extra = {}) => apply(s, { type: "cast", actor: "cleric", spell: "conjure-elemental", hex: SPIRIT, slot: 5, choice: "fire", ...extra }, DM);
const fxOf = (s) => s.effects.find((x) => x.name === "Conjure Elemental");
const fails = (e) => { e.saveBonus = { ...(e.saveBonus ?? {}), dex: -100 }; };      // always fails its Dexterity save
const passes = (e) => { e.saveBonus = { ...(e.saveBonus ?? {}), dex: 100 }; };      // always makes it
const saves = (r, id) => r.events.filter((e) => e.type === "save" && e.id === id);
const hits = (r, id) => r.events.filter((e) => e.type === "damage" && e.target === id);
// A creature walks on its own turn (the turn comes round first): the zone goes off on entering.
const walk = (s, name, q, r) => { const id = byName(s, name)?.id ?? name; nextTurnOf(s, id); return apply(s, { type: "move", actor: id, to: { q, r } }, DM); };
const nextTurnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
// Start a fight and carry on to the turn before `id`'s (so that its turn starts on the next endTurn).
function fight(s) { if (s.encounter) return; ok(apply(s, { type: "startEncounter", center: { q: 4, r: 0 }, radius: 16 }, DM)); }
// The fight, the cleric's turn, and the cast: a cast near a foe starts the fight first.
const cast = (s, extra = {}) => { fight(s); nextTurnOf(s, "cleric"); return conjure(s, extra); };

test("Conjure Elemental: assist, lints, reads with no problem; its hold and release are held to their place", () => {
  const d = SPELLS["conjure-elemental"].def;
  assert.equal(d.tier, "assist");
  assert.deepEqual(lint(d), []);
  assert.deepEqual(readEntry("spell", d, {}).problems ?? [], []);
  assert.ok(lint({ ...d, zone: { ...d.zone, hold: false } }).length, "`hold` is true");
  const { hold: _h, ...noHold } = d.zone;
  assert.ok(lint({ ...d, zone: noHold }).length, "a release step needs a zone that holds");
  assert.ok(lint({ ...d, effects: [{ save: "dex", onFail: [{ damage: "8d8", type: "chosen" }] }] }).length, "a hold needs a Restrained step and a release");
  assert.ok(lint({ ...d, effects: [{ release: true }] }).length, "`release` is inside an eachTurn");
  assert.ok(lint({ ...d, effects: [{ save: "dex", onFail: [{ condition: "restrained" }, { eachTurn: [{ save: "dex", onFail: [{ heal: "1d4" }] }] }] }] }).length, "a failed save inside eachTurn does damage, not a heal");
  assert.ok(lint({ ...d, effects: [{ save: "dex", onFail: [{ condition: "restrained" }, { eachTurn: [{ save: "dex", onSuccess: [{ damage: "1d4", type: "fire" }] }] }] }] }).length, "a success inside eachTurn lets go or ends the spell");
  assert.ok(lint({ ...d, zone: { ...d.zone, hold: true }, target: { area: { shape: "sphere", size: 5, space: "large" } }, effects: d.effects, duration: "instant" }).length, "a zone needs a duration");
});

test("Conjure Elemental: a foe the caster can see that enters within 5 feet makes a Dexterity save: 8d8 of the element and Restrained on a failure, nothing on a success", () => {
  const s = field();
  const a = spawn(s, "goblin-warrior", 9, 0, "A"), b = spawn(s, "goblin-warrior", 9, 2, "B");
  ok(cast(s));
  assert.equal(s.entities.cleric.slots[5], 1);
  assert.deepEqual(fxOf(s).zone.on, ["enter", "turnStart"]);
  fails(a); passes(b);
  const far = walk(s, "A", 8, 0);
  ok(far);
  assert.equal(saves(far, a.id).length, 0, "out of reach: nothing");
  const r = ok(walk(s, "A", 6, 0));
  const sv = saves(r, a.id);
  assert.equal(sv.length, 1);
  assert.equal(sv[0].abil, "dex");
  assert.ok(!sv[0].success);
  const dmg = hits(r, a.id);
  assert.equal(dmg.length, 1);
  assert.equal(dmg[0].dtype, "fire");
  assert.equal(dmg[0].dice.length, 8);
  assert.ok(dmg[0].dice.every((x) => x.sides === 8));
  assert.ok(a.cond.restrained, "Restrained until the spell ends");
  assert.equal(a.cond.restrained.effect, fxOf(s).id);
  // a foe that makes the save: nothing happens to it (the spirit holds no one yet to stop it being forced, so it is: but it holds A now, so use a fresh spirit for B)
  const t = field(), b2 = spawn(t, "goblin-warrior", 9, 2, "B");
  ok(cast(t));
  passes(b2);
  const r2 = ok(walk(t, "B", 5, 1));
  assert.equal(saves(r2, b2.id).length, 1);
  assert.ok(saves(r2, b2.id)[0].success);
  assert.equal(hits(r2, b2.id).length, 0);
  assert.ok(!b2.cond.restrained);
  void b;
});

test("Conjure Elemental: while one creature is Restrained the spirit forces no one else; nothing is rolled, said or used up", () => {
  const s = field();
  const a = spawn(s, "goblin-warrior", 9, 0, "A"), b = spawn(s, "goblin-warrior", 9, 2, "B");
  ok(cast(s));
  fails(a); fails(b);
  ok(walk(s, "A", 6, 0));
  assert.ok(a.cond.restrained);
  const hp = b.hp;
  assert.ok(fxOf(s).zone.hexes.includes("5,1"), "B walks into the area");
  const r = ok(walk(s, "B", 5, 1));
  assert.equal(saves(r, b.id).length, 0);
  assert.equal(r.events.filter((e) => e.type === "zone").length, 0, "the zone did not go off");
  assert.equal(hits(r, b.id).length, 0);
  assert.equal(b.hp, hp);
  assert.ok(!b.cond.restrained);
});

test("Conjure Elemental: a foe that starts its turn within 5 feet is forced; the Restrained one repeats the save at the start of each of its turns: 4d8 on a failure, freed on a success", () => {
  const s = field();
  const a = spawn(s, "goblin-warrior", 6, 0, "A"), b = spawn(s, "goblin-warrior", 6, 1, "B");
  ok(cast(s));
  fails(a); fails(b);
  fight(s);
  // A's turn starts first or second: whoever of A and B starts a turn first is held; the other is then not forced
  const order = [];
  for (let i = 0; i < 40 && !a.cond.restrained && !b.cond.restrained; i++) { const r = ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); order.push(...r.events.filter((e) => e.type === "zone").map((e) => e.id)); }
  const held = a.cond.restrained ? a : b, other = held === a ? b : a;
  assert.deepEqual(order, [held.id], "the zone went off on the first to start its turn, and then on no one");
  const hp = held.hp;
  // the held creature's next turn: the repeated save at its start, 4d8 on a failure
  nextTurnOf(s, other.id);
  const r1 = ok(apply(s, { type: "endTurn", actor: other.id }, DM));
  void r1;
  let again = null;
  for (let i = 0; i < 40 && !again; i++) { const r = ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); if (hits(r, held.id).length) again = r; }
  assert.ok(again, "the held creature took damage at the start of its turn");
  const d = hits(again, held.id);
  assert.equal(d.length, 1);
  assert.equal(d[0].dtype, "fire");
  assert.equal(d[0].dice.length, 4);
  assert.ok(d[0].dice.every((x) => x.sides === 8));
  assert.ok(held.hp < hp);
  assert.ok(held.cond.restrained, "still Restrained after a failed save");
  assert.ok(again.events.some((e) => e.type === "save" && e.id === held.id && !e.success));
  // now it makes the save: freed, nothing else happens to it, and the spell goes on
  passes(held);
  const hp2 = held.hp;
  let freed = null;
  for (let i = 0; i < 40 && !freed; i++) { const r = ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); if (r.events.some((e) => e.type === "condEnd" && e.id === held.id && e.cond === "restrained")) freed = r; }
  assert.ok(freed, "the Restrained condition ended");
  assert.equal(held.hp, hp2, "no damage on a success");
  assert.ok(!held.cond.restrained);
  assert.ok(fxOf(s), "the spell goes on");
  assert.ok(!fxOf(s).parts.some((p) => p.target === held.id), "nothing of it is left on the freed creature");
  assert.ok(!fxOf(s).parts.some((p) => p.turn && p.target === held.id));
});

test("Conjure Elemental: after a release the spirit may hold another creature", () => {
  const s = field();
  const a = spawn(s, "goblin-warrior", 9, 0, "A"), b = spawn(s, "goblin-warrior", 9, 2, "B");
  ok(cast(s));
  fails(a); fails(b);
  ok(walk(s, "A", 6, 0));
  assert.ok(a.cond.restrained);
  fight(s);
  // A is released at the start of its turn; then B, standing in the zone, is forced at the start of its own
  passes(a);
  ok(walk(s, "B", 5, 1));
  assert.ok(!b.cond.restrained, "held off while A is Restrained");
  nextTurnOf(s, a.id);
  for (let i = 0; i < 40 && a.cond.restrained; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.ok(!a.cond.restrained, "released on a successful save");
  const before = b.hp;
  for (let i = 0; i < 40 && !b.cond.restrained; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.ok(b.cond.restrained, "the spirit holds the next one");
  assert.ok(b.hp < before);
  assert.equal(fxOf(s).parts.filter((p) => p.cond === "restrained" && !p.ended).length, 1);
});

test("Conjure Elemental: the element sets the damage type, on both damage steps; a type outside the four is refused", () => {
  for (const [choice, type] of [["lightning", "lightning"], ["thunder", "thunder"], ["cold", "cold"]]) {
    const s = field();
    const a = spawn(s, "goblin-warrior", 9, 0, "A");
    ok(cast(s, { choice }));
    fails(a);
    const r = ok(walk(s, "A", 6, 0));
    assert.equal(hits(r, a.id)[0].dtype, type);
    assert.deepEqual(fxOf(s).zone.steps[0].onFail[0], { damage: "8d8", type });
    assert.equal(fxOf(s).parts.find((p) => p.turn).turn.steps[0].onFail[0].type, type, "the repeated damage has it too");
  }
  const s = field();
  spawn(s, "goblin-warrior", 9, 0, "A");
  fight(s); nextTurnOf(s, "cleric");
  bad(conjure(s, { choice: "acid" }), /damage type/i);
  bad(conjure(s, { choice: undefined }), /damage type/i);
  assert.equal(s.entities.cleric.slots[5], 2, "nothing was spent");
});

test("Conjure Elemental: a higher slot adds 1d8 per level above 5 to the 8d8 and to the 4d8", () => {
  const s = field();
  const a = spawn(s, "goblin-warrior", 9, 0, "A");
  ok(cast(s, { slot: 6 }));
  fails(a);
  const r = ok(walk(s, "A", 6, 0));
  assert.equal(hits(r, a.id)[0].dice.length, 9);
  const turn = fxOf(s).parts.find((p) => p.turn).turn.steps[0].onFail[0];
  assert.equal(turn.damage, "5d8");
  assert.equal(fxOf(s).zone.steps[0].onFail[0].damage, "9d8");
  assert.equal(s.entities.cleric.slots[6], 0);
});

test("Conjure Elemental: an ally is spared, and so is a creature the caster cannot see", () => {
  const s = field();
  const f = s.entities.fighter, hid = spawn(s, "goblin-warrior", 9, 0, "Hid");
  ok(apply(s, { type: "place", actor: "fighter", to: { q: 9, r: 3 } }, DM));
  ok(cast(s));
  fails(f); fails(hid);
  hid.hidden = true;
  const r1 = ok(walk(s, "fighter", 5, 1));
  assert.equal(r1.events.filter((e) => e.type === "zone").length, 0, "an ally is not forced");
  assert.ok(!f.cond.restrained);
  const r2 = ok(walk(s, "Hid", 6, 0));
  assert.equal(r2.events.filter((e) => e.type === "zone").length, 0, "one the caster cannot see is not forced");
  assert.ok(!hid.cond.restrained);
});

test("Conjure Elemental: Concentration ending frees the held creature and ends the spell", () => {
  const s = field();
  const a = spawn(s, "goblin-warrior", 9, 0, "A");
  ok(cast(s));
  fails(a);
  ok(walk(s, "A", 6, 0));
  assert.ok(a.cond.restrained);
  const r = ok(apply(s, { type: "endEffect", actor: "cleric", effect: fxOf(s).id }, DM));
  assert.ok(r.events.some((e) => e.type === "condEnd" && e.id === a.id && e.cond === "restrained"));
  assert.ok(!a.cond.restrained);
  assert.equal(fxOf(s), undefined);
  // and with it gone the held creature has no turn steps left
  passes(a);
  fight(s);
  for (let i = 0; i < 6; i++) { const r2 = ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(hits(r2, a.id).length, 0); }
});

test("Conjure Elemental: a held creature that dies no longer holds the spirit", () => {
  const s = field();
  const a = spawn(s, "goblin-warrior", 9, 0, "A"), b = spawn(s, "goblin-warrior", 9, 2, "B");
  ok(cast(s));
  fails(a); fails(b);
  ok(walk(s, "A", 6, 0));
  a.hp = 0; a.dead = true;
  const r = ok(walk(s, "B", 5, 1));
  assert.equal(saves(r, b.id).length, 1, "forced once the held one is dead");
  assert.ok(b.cond.restrained);
});
