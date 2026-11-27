// Issue #859 (part of #786): three spells that were `manual` and now run what the existing vocabulary can say: Continual Flame, Conjure Fey and
// Conjure Celestial (Wind Walk stays manual). Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS, CONTENT } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
const lint = (def) => lintEntry("spells", def, { strict: false });
const live = (s, spell) => s.effects.find((fx) => fx.spell === spell);

function field() {
  const s = newGame(5);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", 0, 0], ["fighter", -2, 0], ["rogue", -4, 4], ["cleric", -3, 0]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  const slots = { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 };
  for (const id of ["wizard", "cleric"]) Object.assign(s.entities[id], { slots: { ...slots }, slotsMax: { ...slots } });
  s.entities.wizard.spells.push("continual-flame", "conjure-fey");
  s.entities.cleric.spells.push("conjure-celestial");
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 300;
  return s;
}
const spawn = (s, monster, q, r) => { const e = s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 500; e.ac = 1; return e; };
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 12 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };

test("the three entries are assist, checked, lint clean and say what stays the DM's", () => {
  for (const id of ["continual-flame", "conjure-fey", "conjure-celestial"]) {
    const def = SPELLS[id].def;
    assert.equal(def.tier, "assist", id); assert.equal(def.checked, true, id);
    assert.deepEqual(lint(def), [], id);
  }
  assert.ok(SPELLS["continual-flame"].def.effects.some((x) => "manual" in x));
  // Wind Walk stays manual: its Fly Speed of 300 feet is above HOMEBREW_RANGES `speedModifier.value` (120), which schema.js owns (#859).
  assert.equal(SPELLS["wind-walk"].def.tier, "manual");
  assert.ok(SPELLS["conjure-celestial"].def.effects.some((x) => "manual" in x));
  assert.equal(SPELLS["conjure-fey"].def.effects[0].summon, "fey-spirit");
  assert.equal(CONTENT.summons["fey-spirit"].tier, "auto");
});

test("Continual Flame: the caster sheds Bright Light 20 feet and Dim Light 20 feet more, with no end but a dispel", () => {
  const s = field();
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "continual-flame", slot: 2 }, DM));
  assert.deepEqual([s.entities.wizard.light.bright, s.entities.wizard.light.dim], [20, 20], json(r.events.map((e) => e.type)));
  assert.ok(live(s, "continual-flame"), "it is a lasting effect");
  assert.ok(!live(s, "continual-flame").conc, "it needs no Concentration");
  const fx = live(s, "continual-flame");
  ok(apply(s, { type: "endEffect", actor: "wizard", effect: fx.id }, DM));
  assert.ok(!s.entities.wizard.light || !s.entities.wizard.light.bright, "dispelled, the light goes");
});

test("Conjure Fey: the spirit appears, attacks with the caster's spell attack for psychic damage and frightens, and nothing hurts it", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 3, 0);
  s.entities.wizard.owner = "pat";
  fight(s);
  turnOf(s, "wizard");
  const PAT = { role: "player", userId: "pat" };
  const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "conjure-fey", slot: 6, summon: { at: [{ q: 2, r: 0 }] } }, PAT));
  const id = r.events.find((e) => e.type === "summoned").id, w = s.entities[id];
  assert.equal(w.type, "fey");
  assert.equal(w.bond.to, "wizard");
  assert.equal(live(s, "conjure-fey").conc, true);
  assert.ok(w.immune.length >= 13);
  ok(apply(s, { type: "endTurn", actor: "wizard" }, PAT));
  assert.equal(current(s), id);
  ok(apply(s, { type: "move", actor: id, to: { q: 2, r: 0 } }, PAT));
  const a = ok(apply(s, { type: "act", actor: id, action: "fey-strike", target: g.id }, PAT));
  const at = a.events.find((e) => e.type === "attack");
  assert.equal(at.bonus, s.entities.wizard.prof + Math.floor((s.entities.wizard.abil[s.entities.wizard.castAbil] - 10) / 2), "the caster's spell attack bonus");
  assert.ok(at.hit, json(at));
  {
    const d = a.events.find((e) => e.type === "damage" && e.target === g.id);
    assert.equal(d.dtype, "psychic");
    assert.deepEqual([d.dice.length, d.dice[0].sides], [3, 12]);
    assert.ok(json(g.cond ?? g.conditions).includes("frightened"), json(g.cond));
    const fe = s.effects.find((f) => f.name === "Fey Strike"); assert.ok(json(fe).includes("turnStart"), "ends at the start of the caster's next turn: " + json(fe)); assert.ok(json(fe).includes("\"of\":\"source\"") || json(fe).includes("wizard"), json(fe));
  }
});

test("Conjure Celestial: the cylinder sears an enemy that fails the save and heals an ally in it", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 6, 0);
  g.abil.dex = 1;
  const f = s.entities.fighter; f.hp = 100;
  ok(apply(s, { type: "place", actor: "fighter", to: { q: 6, r: 1 } }, DM));
  s.entities.cleric.owner = "pat";
  fight(s);
  turnOf(s, "cleric");
  const hpG = g.hp;
  const r = ok(apply(s, { type: "cast", actor: "cleric", spell: "conjure-celestial", slot: 7, hex: { q: 6, r: 0 } }, DM));
  assert.ok(live(s, "conjure-celestial").conc);
  const dmg = r.events.find((e) => e.type === "damage" && e.target === g.id);
  assert.ok(dmg, json(r.events.map((e) => e.type)));
  assert.equal(dmg.dtype, "radiant");
  assert.equal(dmg.dice.length, 6, "6d12 at a 7th-level slot");
  assert.ok(g.hp < hpG);
  const heal = r.events.find((e) => e.type === "heal" && e.target === "fighter");
  assert.ok(heal, json(r.events.map((e) => [e.type, e.target])));
  assert.ok(f.hp > 100);
});

test("Conjure Fey: the fear lasts until the spirit's next turn starts, which follows the caster's straight away", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 3, 0);
  s.entities.wizard.owner = "pat";
  fight(s);
  turnOf(s, "wizard");
  const PAT = { role: "player", userId: "pat" };
  const id = ok(apply(s, { type: "cast", actor: "wizard", spell: "conjure-fey", slot: 6, summon: { at: [{ q: 2, r: 0 }] } }, PAT)).events.find((e) => e.type === "summoned").id;
  ok(apply(s, { type: "endTurn", actor: "wizard" }, PAT));
  ok(apply(s, { type: "act", actor: id, action: "fey-strike", target: g.id }, PAT));
  assert.ok(g.cond.frightened);
  ok(apply(s, { type: "endTurn", actor: id }, PAT));
  for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.equal(current(s), id);
  assert.ok(!g.cond.frightened, "gone when the spirit's turn starts");
});

// The dice a cast rolled on one creature, summed over the damage (or heal) events.
const dice = (events, type, id) => events.filter((e) => e.type === type && e.target === id).reduce((n, e) => n + (e.dice?.length ?? 0), 0);

test("Conjure Celestial at an 8th-level slot: 7d12 to a foe and 5d12 to an ally, rolled", () => {
  const s = field();
  s.entities.cleric.slots[8] = 1; s.entities.cleric.slotsMax[8] = 1;
  const g = spawn(s, "goblin-warrior", 6, 0); g.abil.dex = 1;
  s.entities.fighter.hp = 100;
  ok(apply(s, { type: "place", actor: "fighter", to: { q: 6, r: 1 } }, DM));
  fight(s); turnOf(s, "cleric");
  const r = ok(apply(s, { type: "cast", actor: "cleric", spell: "conjure-celestial", slot: 8, hex: { q: 6, r: 0 } }, DM));
  assert.equal(dice(r.events, "damage", g.id), 7, json(r.events.map((e) => [e.type, e.target, e.dice?.length])));
  assert.equal(dice(r.events, "heal", "fighter"), 5, json(r.events.map((e) => [e.type, e.target, e.dice?.length])));
});

test("Conjure Celestial heals the caster in its own cylinder", () => {
  const s = field();
  s.entities.cleric.hp = 100;
  spawn(s, "goblin-warrior", 0, 6);
  fight(s); turnOf(s, "cleric");
  const r = ok(apply(s, { type: "cast", actor: "cleric", spell: "conjure-celestial", slot: 7, hex: { q: -3, r: 0 } }, DM));
  assert.ok(r.events.some((e) => e.type === "heal" && e.target === "cleric"), json(r.events.map((e) => [e.type, e.target])));
  assert.ok(s.entities.cleric.hp > 100);
});

test("Conjure Celestial: a creature that enters it and ends its turn there in one turn is affected once", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 3, 3); g.abil.dex = 1;
  fight(s); turnOf(s, "cleric");
  ok(apply(s, { type: "cast", actor: "cleric", spell: "conjure-celestial", slot: 7, hex: { q: 6, r: 0 } }, DM));
  for (let i = 0; i < 40 && current(s) !== g.id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.equal(current(s), g.id);
  const hp0 = g.hp;
  const hit = [];
  const log = (r) => { for (const e of r.events) if (e.type === "damage" && e.target === g.id) hit.push(e); return r; };
  g.pos = { q: 6, r: 0, z: 0 };                                    // the DM puts it inside: no entering by walking here
  log(ok(apply(s, { type: "endTurn", actor: g.id }, DM)));
  assert.equal(hit.length, 1, "ending the turn inside is one dose");
  const first = hp0 - g.hp;
  assert.ok(first > 0);
  assert.equal(hit.length, 1);
});

test("Conjure Celestial: a creature the caster cannot see is not bathed when it ends its turn in the cylinder (`seen`)", () => {
  const s = field();
  const g = spawn(s, "goblin-warrior", 3, 3); g.abil.dex = 1;
  g.cond.invisible = { source: "test" };
  fight(s); turnOf(s, "cleric");
  ok(apply(s, { type: "cast", actor: "cleric", spell: "conjure-celestial", slot: 7, hex: { q: 6, r: 0 } }, DM));
  for (let i = 0; i < 40 && current(s) !== g.id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  g.pos = { q: 6, r: 0, z: 0 };
  const r = ok(apply(s, { type: "endTurn", actor: g.id }, DM));
  assert.ok(!r.events.some((e) => e.target === g.id && (e.type === "damage" || e.type === "save")), json(r.events.map((e) => [e.type, e.target])));
  // Not the same as a creature the caster sees: it is bathed.
  g.cond.invisible = undefined; delete g.cond.invisible;
  for (let i = 0; i < 40 && current(s) !== g.id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  const r2 = ok(apply(s, { type: "endTurn", actor: g.id }, DM));
  assert.ok(r2.events.some((e) => e.target === g.id && e.type === "damage"), json(r2.events.map((e) => [e.type, e.target])));
});

test("Conjure Fey at a 7th-level slot adds 1d12", () => {
  const s = field();
  s.entities.wizard.slots[7] = 1; s.entities.wizard.slotsMax[7] = 1;
  const g = spawn(s, "goblin-warrior", 3, 0);
  s.entities.wizard.owner = "pat";
  fight(s); turnOf(s, "wizard");
  const PAT = { role: "player", userId: "pat" };
  const id = ok(apply(s, { type: "cast", actor: "wizard", spell: "conjure-fey", slot: 7, summon: { at: [{ q: 2, r: 0 }] } }, PAT)).events.find((e) => e.type === "summoned").id;
  ok(apply(s, { type: "endTurn", actor: "wizard" }, PAT));
  const a = ok(apply(s, { type: "act", actor: id, action: "fey-strike", target: g.id }, PAT));
  assert.ok(a.events.find((e) => e.type === "attack").hit);
  assert.equal(dice(a.events, "damage", g.id), 4, json(a.events.map((e) => [e.type, e.dice?.length])));
});
