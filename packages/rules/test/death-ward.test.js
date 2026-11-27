// Death Ward, job 3 of issue #726. SRD 5.2.1: "The first time the target would drop to 0 Hit Points before the spell ends, the target
// instead drops to 1 Hit Point, and the spell ends. If the spell is still in effect when the target is subjected to an effect that would
// kill it instantly without dealing damage, that effect is negated against the target, and the spell ends." It is a modifier step on the
// hook `hp.zero` (docs/specs/rules-expansion.md, "Build notes: Death Ward").
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { derive } from "../src/derive.js";
import { apply, current, makeEntity } from "../src/engine.js";
import { kill } from "../src/engine/rolls.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { modifiers } from "../src/modifiers.js";
import { newGame } from "../src/scenario.js";
import { viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
const WARD = { on: "hp.zero", op: "min", value: 1, uses: 1 };
const cleric = { name: "Pia", class: "cleric", level: 13, subclass: "life", abilities: { str: 10, dex: 10, con: 14, int: 10, wis: 18, cha: 10 }, skills: ["insight", "medicine"], spells: ["death-ward", "disintegrate", "bless"] };

// A cleric of level 13 (Pat's) on open grass with a goblin beside her; the valley's fighter beside her.
function table(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (id !== "fighter") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  s.settings.strikeFirst = "all";               // a hostile cast outside a fight lands, then the fight starts
  s.entities.pia = makeEntity(derive(cleric).record, { id: "pia", kind: "pc", side: "party", owner: "pat", ownerName: "Pat", pos: { q: 0, r: 0, z: 0 } });
  s.entities.pia.sheet = structuredClone(cleric);
  s.entities.fighter.pos = { q: 1, r: 0, z: 0 };
  const g = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: -1, r: 0 } }, DM)).events[0].id;
  return { s, g };
}
const ward = (s, target) => ok(apply(s, { type: "cast", actor: "pia", spell: "death-ward", target }, DM));
const harm = (s, actor, amount, dtype) => ok(apply(s, { type: "harm", actor, amount, ...(dtype ? { dtype } : {}) }, DM));
const warded = (s, id) => s.effects.some((fx) => fx.spell === "death-ward" && fx.parts.some((p) => p.target === id && !p.ended));

test("the entry: a modifier step on hp.zero, assist, and the linter takes that shape only", () => {
  const def = SPELLS["death-ward"].def;
  assert.deepEqual(def.effects, [{ modifier: WARD }]);
  assert.equal(def.tier, "assist");
  assert.equal(def.duration, "8 hours");
  assert.deepEqual(lintEntry("spells", def, { strict: false }), []);
  const lint = (modifier) => lintEntry("spells", { ...structuredClone(def), effects: [{ modifier }] }, { strict: false });
  for (const bad of [{ ...WARD, op: "add" }, { ...WARD, value: 2 }, { on: "hp.zero", op: "min", value: 1 }, { ...WARD, when: ["target.prone"] }, { ...WARD, op: "set" }]) {
    assert.ok(lint(bad).some((p) => /hp\.zero/.test(p)), json(bad));
  }
});

test("the first drop to 0 Hit Points leaves 1 and ends the spell; the next one is a drop", () => {
  const { s } = table();
  const r0 = ward(s, "fighter");
  assert.ok(r0.events.some((e) => e.type === "effectStart" && e.name === "Death Ward" && e.lasts === "8 hours"));
  assert.ok(warded(s, "fighter"));
  // Damage that leaves it standing does not touch the ward.
  const f = s.entities.fighter;
  harm(s, "fighter", f.hp - 3);
  assert.equal(f.hp, 3);
  assert.ok(warded(s, "fighter"), "still warded above 0");
  const r = harm(s, "fighter", 10, "fire");
  assert.equal(f.hp, 1);
  assert.deepEqual(f.cond, {}, "not Unconscious, not Prone");
  assert.deepEqual(r.events.map((e) => e.type), ["damage", "note", "effectEnd"]);
  assert.equal(r.events[0].amount, 10);
  assert.equal(r.events[0].hp, 1, "the damage event says what is left");
  assert.deepEqual(r.events[1], { type: "note", id: "fighter", text: "Death Ward: 1 Hit Point left instead of 0" });
  assert.equal(r.events[2].name, "Death Ward");
  assert.ok(!warded(s, "fighter"), "the spell ended");
  assert.equal(s.effects.length, 0);
  const r2 = harm(s, "fighter", 1);
  assert.equal(f.hp, 0);
  assert.ok(r2.events.some((e) => e.type === "down"));
});

test("damage as large as you like: no instant death, and every part of one hit reads 1", () => {
  const { s } = table();
  ward(s, "fighter");
  const f = s.entities.fighter;
  const r = harm(s, "fighter", f.maxHp * 5);
  assert.equal(f.hp, 1);
  assert.equal(f.dead, false);
  assert.ok(!r.events.some((e) => e.type === "died" || e.type === "down"));
});

test("a monster is kept alive at 1 the same way", () => {
  const { s, g } = table();
  ward(s, g);
  const r = harm(s, g, 400);
  assert.equal(s.entities[g].hp, 1);
  assert.equal(s.entities[g].dead, false);
  assert.ok(r.events.some((e) => e.type === "note" && e.id === g));
  harm(s, g, 1);
  assert.equal(s.entities[g].dead, true);
});

test("a creature already at 0 Hit Points is not dropping to 0: damage counts against its death saves and the ward stays", () => {
  const { s } = table();
  const f = s.entities.fighter;
  harm(s, "fighter", f.hp);
  assert.equal(f.hp, 0);
  ward(s, "fighter");
  harm(s, "fighter", 1);
  assert.equal(f.hp, 0);
  assert.equal(f.death.f, 1);
  assert.ok(warded(s, "fighter"));
});

test("the DM setting Hit Points to 0 is the DM's word: not warded", () => {
  const { s } = table();
  ward(s, "fighter");
  ok(apply(s, { type: "setHp", actor: "fighter", hp: 0 }, DM));
  assert.equal(s.entities.fighter.hp, 0);
  assert.ok(warded(s, "fighter"));
});

test("Concentration: the warded caster at 1 Hit Point is still up and makes the save for the damage", () => {
  const { s } = table();
  ok(apply(s, { type: "cast", actor: "pia", spell: "bless", targets: ["pia", "fighter"] }, DM));
  ward(s, "pia");
  const r = harm(s, "pia", 300);
  assert.equal(s.entities.pia.hp, 1);
  const save = r.events.find((e) => e.type === "concentration" && e.id === "pia");
  assert.ok(save, "a Constitution save to keep Concentration");
  assert.equal(save.dc, 30, "half the damage, at most 30");
  assert.ok(!r.events.some((e) => e.type === "down"));
});

test("Disintegrate on a warded creature: 1 Hit Point, no dust; a kill step itself is undone and ends the ward", () => {
  let failed = 0;
  for (let seed = 1; seed <= 30 && !failed; seed++) {
    const { s, g } = table(seed);
    ward(s, g);
    s.entities[g].saveBonus = { dex: -100 };
    const r = ok(apply(s, { type: "cast", actor: "pia", spell: "disintegrate", target: g }, DM));
    if (!r.events.some((e) => e.type === "damage" && e.target === g)) continue;
    failed++;
    assert.equal(s.entities[g].hp, 1);
    assert.equal(s.entities[g].dead, false);
    assert.equal(s.entities[g].remains, undefined);
    assert.ok(!warded(s, g));
  }
  assert.ok(failed, "some goblin was hit by it");
  // The step alone, as an effect that kills with no damage would run it.
  const { s, g } = table();
  ward(s, g);
  const ev = [];
  kill(s, s.entities[g], ev);
  assert.equal(s.entities[g].dead, false);
  assert.equal(s.entities[g].hp, s.entities[g].maxHp);
  assert.deepEqual(ev.map((e) => e.type), ["note", "effectEnd"]);
  assert.equal(ev[0].text, "Death Ward: not killed");
  assert.ok(!warded(s, g));
  kill(s, s.entities[g], ev);
  assert.equal(s.entities[g].dead, true, "unwarded, it dies");
});

test("before Relentless Rage: a warded, raging barbarian never reaches 0, so no save is made and no use counted", () => {
  const { s } = table();
  const sheet = { name: "Ur", class: "barbarian", level: 11, subclass: "berserker", abilities: { str: 18, dex: 14, con: 16, int: 8, wis: 12, cha: 10 }, skills: ["athletics", "survival", "perception"], weapons: ["greataxe"] };
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 1, z: 0 } });
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  for (let i = 0; i < 20 && current(s) !== "hero"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  ok(apply(s, { type: "feature", actor: "hero", feature: "rage" }, DM));
  s.effects.push({ id: "fxw", name: "Death Ward", spell: "death-ward", source: "pia", conc: false, lasts: "8 hours", parts: [{ target: "hero", modifier: { ...WARD } }], until: { clock: s.clock + 28800 } });
  const r = harm(s, "hero", s.entities.hero.hp + 40, "force");
  assert.equal(s.entities.hero.hp, 1);
  assert.ok(!r.events.some((e) => e.type === "save"), "no Relentless Rage save");
  assert.equal(s.entities.hero.uses?.["relentless-rage"], undefined);
  // With the ward gone the next drop is Relentless Rage's.
  const r2 = harm(s, "hero", 5, "force");
  assert.ok(r2.events.some((e) => e.type === "save" && e.against === "Relentless Rage"));
  assert.equal(s.entities.hero.uses["relentless-rage"], 1);
});

test("asking what applies changes nothing, and a trait cannot carry the ward", () => {
  const { s } = table();
  ward(s, "fighter");
  const before = json(s);
  const m = modifiers(s, s.entities.fighter, "hp.zero", { target: s.entities.fighter });
  assert.equal(m.min, 1);
  assert.equal(m.used.length, 1);
  assert.equal(json(s), before);
  assert.equal(modifiers(s, s.entities.pia, "hp.zero", { target: s.entities.pia }).min, null);
  const goblin = structuredClone(CONTENT.monsters["goblin-warrior"]);
  assert.deepEqual(lintEntry("monsters", goblin, { strict: false }), []);
  goblin.traits = [...(goblin.traits ?? []), { id: "deathless", name: "Deathless", text: "Invented.", modifiers: [{ ...WARD }] }];
  assert.ok(lintEntry("monsters", goblin, { strict: false }).some((p) => /hp\.zero/.test(p)), "a trait has no use to spend");
});

test("a hidden creature's ward tells the players nothing", () => {
  const { s, g } = table();
  ward(s, g);
  ok(apply(s, { type: "reveal", actor: g, hidden: true }, DM));
  const r = harm(s, g, 400);
  assert.equal(s.entities[g].hp, 1);
  assert.deepEqual(viewEvents(r.events, s, PAT).filter((e) => e.type !== "effectEnd"), [], "nothing of the damage or the note");
  assert.ok(!json(viewEvents(r.events, s, PAT)).includes(g), "and the effect's end does not name it");
});

test("undo, redo and a replay give the same state", () => {
  const { s } = table();
  const acts = [{ type: "cast", actor: "pia", spell: "death-ward", target: "fighter" }, { type: "harm", actor: "fighter", amount: 200 }, { type: "harm", actor: "fighter", amount: 1 }];
  const start = json(s), h = createHistory();
  for (const a of acts) { const b = mark(s), r = ok(apply(s, a, DM)); h.record(b, s, describeStep(a, r.events, b, s)); }
  const end = json(s);
  for (let i = 0; i < acts.length; i++) h.undo(s);
  assert.equal(json(s), start, "undo");
  for (let i = 0; i < acts.length; i++) h.redo(s);
  assert.equal(json(s), end, "redo");
  const again = JSON.parse(start);
  for (const a of acts) ok(apply(again, a, DM));
  assert.equal(json(again), end, "replay");
});
