// Revivify, job 6 of issue #726. SRD 5.2.1: "You touch a creature that has died within the last minute. That creature revives with 1 Hit Point. This spell
// can't revive a creature that has died of old age, nor does it restore any missing body parts." It is a `revive` step in a spell whose creature target says
// `dead: true`, and a creature that dies keeps the game clock of its death (`diedAt`): docs/specs/rules-expansion.md, "Build notes: Revivify".
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { derive } from "../src/derive.js";
import { apply, current, makeEntity, targetsFor } from "../src/engine.js";
import { migrate, VERSION } from "../src/migrate.js";
import { newGame } from "../src/scenario.js";
import { view } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
const cleric = { name: "Pia", class: "cleric", level: 13, subclass: "life", abilities: { str: 10, dex: 10, con: 14, int: 10, wis: 18, cha: 10 }, skills: ["insight", "medicine"],
  spells: ["revivify", "cure-wounds", "bless", "spare-the-dying"] };

// Pia the cleric (Pat's) beside the valley's fighter on open grass, and a bandit 10 feet off with plenty of Hit Points.
function table(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (id !== "fighter") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  s.entities.pia = makeEntity(derive(cleric).record, { id: "pia", kind: "pc", side: "party", owner: "pat", ownerName: "Pat", pos: { q: 0, r: 0, z: 0 } });
  s.entities.pia.sheet = structuredClone(cleric);
  s.entities.fighter.pos = { q: 1, r: 0, z: 0 };
  return s;
}
const slain = (s, id) => { ok(apply(s, { type: "harm", actor: id, amount: 9999, dtype: "necrotic" }, DM)); assert.equal(s.entities[id].dead, true); };
const revivify = (s, target, who = "pia", ctx = DM) => apply(s, { type: "cast", actor: who, spell: "revivify", target }, ctx);
const same = (a, b) => assert.equal(json(a), json(b));
const told = (r) => r.events.filter((e) => e.type === "manual" && !e.standing);       // the DM's notes of this cast, not the standing one every assist entry sends
const notes = (r) => r.events.filter((e) => e.type === "note").map((e) => e.text);

test("the entry: a revive step in a spell aimed at the dead, assist, and the linter holds its numbers and its pairing", () => {
  const def = SPELLS.revivify.def;
  assert.deepEqual(def.effects, [{ revive: 1, within: 1 }]);
  assert.equal(def.target.creature.dead, true);
  assert.equal(def.tier, "assist");
  assert.deepEqual(lintEntry("spells", def, { strict: false }), []);
  const lint = (patch) => lintEntry("spells", { ...structuredClone(def), ...patch }, { strict: false });
  for (const bad of [{ revive: 0, within: 1 }, { revive: 1 }, { revive: 1, within: 0 }, { revive: true, within: 1 }]) assert.ok(lint({ effects: [bad] }).length, json(bad));
  assert.ok(lint({ target: { creature: { count: 1 } } }).some((p) => /revive/.test(p)), "a revive step needs a dead target");
  assert.ok(lint({ effects: [{ heal: "1d4" }] }).some((p) => /revive/.test(p)), "a dead target needs a revive step");
  assert.ok(lint({ target: { creature: { count: 1, dead: false } } }).length);
  const monster = { id: "t-rev", name: "T", source: "x", size: "medium", type: "humanoid", cr: 1, hp: 5, ac: 10, speed: 30, abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, text: "x",
    actions: [{ id: "a", name: "A", target: { creature: { reach: 5 } }, effects: [{ revive: 1, within: 1 }] }] };
  assert.ok(lintEntry("monsters", monster, { strict: false }).some((p) => /revive/.test(p)), "a creature's action has no revive step");
});

test("a creature that dies keeps the game clock: by damage, by three failed death saves, by a kill step", () => {
  const s = table();
  s.clock = 123.4;
  slain(s, "fighter");
  assert.equal(s.entities.fighter.diedAt, 123.4);
  // A character at 0 Hit Points that fails its third Death Saving Throw.
  const t = table();
  t.clock = 50;
  Object.assign(t.entities.fighter, { hp: 0, death: { s: 0, f: 2 } });
  t.entities.fighter.cond.unconscious = {};
  const bandit = ok(apply(t, { type: "spawn", monster: "bandit", at: { q: 4, r: 0 } }, DM)).events[0].id;
  void bandit;
  ok(apply(t, { type: "harm", actor: "fighter", amount: 1, dtype: "slashing" }, DM));
  assert.equal(t.entities.fighter.dead, true);
  assert.equal(t.entities.fighter.diedAt, 50);
  // A creature that is not dead has none.
  assert.equal(table().entities.pia.diedAt, undefined);
});

test("within the minute: Revivify brings the body back with 1 Hit Point, spends the slot, and tells the DM what it cannot judge", () => {
  const s = table();
  s.clock = 10;
  slain(s, "fighter");
  const slots = s.entities.pia.slots[3], body = s.entities.fighter.maxHp;
  void body;
  s.clock = 10.9;
  const r = ok(revivify(s, "fighter"));
  const f = s.entities.fighter;
  assert.deepEqual([f.dead, f.hp, f.diedAt, f.death.f, f.cond.unconscious], [false, 1, undefined, 0, undefined]);
  assert.equal(s.entities.pia.slots[3], slots - 1);
  assert.ok(notes(r).includes("Revivify: Brenna returns to life"));
  assert.ok(r.events.some((e) => e.type === "heal" && e.target === "fighter" && e.hp === 1));
  const m = told(r);
  assert.equal(m.length, 1);
  assert.ok(m[0].partial && /old age/.test(m[0].text) && /body parts/.test(m[0].text) && /diamond worth 300 GP/.test(m[0].text));
  // It is a creature that is up again: it can be hurt and healed.
  ok(apply(s, { type: "harm", actor: "fighter", amount: 1, dtype: "slashing" }, DM));
  assert.equal(s.entities.fighter.hp, 0);
});

test("more than a minute: an invalid target. The slot is spent, nothing happens, and the body stays dead", () => {
  const s = table();
  s.clock = 10;
  slain(s, "fighter");
  s.clock = 11.2;
  const slots = s.entities.pia.slots[3];
  const r = ok(revivify(s, "fighter"));
  assert.equal(s.entities.fighter.dead, true);
  assert.equal(s.entities.fighter.diedAt, 10);
  assert.equal(s.entities.pia.slots[3], slots - 1);
  assert.deepEqual(notes(r).filter((t) => /ago/.test(t)), ["Brenna died more than a minute ago, so Revivify does nothing to it."]);
  assert.ok(!r.events.some((e) => e.type === "heal") && !told(r).length);
});

test("in a fight the clock counts rounds: ten rounds are a minute", () => {
  let tried = 0;
  for (const [rounds, revived] of [[9, true], [10, true], [11, false]]) {
    const s = table();
    const b = ok(apply(s, { type: "spawn", monster: "bandit", at: { q: 4, r: 0 } }, DM)).events[0].id;
    Object.assign(s.entities[b], { hp: 500, maxHp: 500 });
    ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, DM));
    // Wait for round 1, kill the fighter, then let rounds pass.
    for (let i = 0; i < 20 && current(s) !== "pia"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    slain(s, "fighter");
    const born = s.encounter.round;
    for (let i = 0; i < 400 && s.encounter.round < born + rounds; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    assert.equal(s.encounter.round, born + rounds);
    for (let i = 0; i < 30 && current(s) !== "pia"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    s.entities[b].hp = 500;
    const round = s.encounter.round;
    if (round - born > rounds) continue;                      // Pia's turn came in a later round: not the case being tried
    tried++;
    const r = ok(revivify(s, "fighter"));
    assert.equal(s.entities.fighter.dead, !revived, `${rounds} rounds`);
    assert.equal(told(r).length > 0, revived);
    if (revived) assert.equal(s.entities.fighter.hp, 1);
  }
  assert.equal(tried, 3, "each case was played");
});

test("outside a fight the clock is the world's: time the DM lets pass", () => {
  const s = table();
  slain(s, "fighter");
  ok(apply(s, { type: "advanceTime", minutes: 0.5 }, DM));
  const keep = structuredClone(s);
  ok(apply(keep, { type: "advanceTime", minutes: 1 }, DM));
  ok(revivify(keep, "fighter"));
  assert.equal(keep.entities.fighter.dead, true, "1.5 minutes after");
  ok(revivify(s, "fighter"));
  assert.equal(s.entities.fighter.dead, false, "half a minute after");
});

test("a body with no time of death (it died before the engine kept one) is the DM's to judge: not revived, and the DM is told", () => {
  const s = table();
  slain(s, "fighter");
  delete s.entities.fighter.diedAt;
  const slots = s.entities.pia.slots[3];
  const r = ok(revivify(s, "fighter"));
  assert.equal(s.entities.fighter.dead, true);
  assert.equal(s.entities.pia.slots[3], slots - 1);
  const m = told(r);
  assert.equal(m.length, 1);
  assert.match(m[0].text, /does not know when Brenna died/);
});

test("what it refuses, and changes nothing: a creature that is up, dust, a vanished body, a body under another creature, out of reach", () => {
  const s = table();
  slain(s, "fighter");
  const refuse = (state, target, re, who = "pia") => {
    const before = json(state), r = revivify(state, target, who);
    assert.equal(r.ok, false, `refused: ${target}`);
    assert.match(r.error, re);
    assert.equal(json(state), before, "nothing changed");
  };
  refuse(s, "pia", /has not/);                                              // the caster is up
  const dust = structuredClone(s); dust.entities.fighter.remains = "dust";
  refuse(dust, "fighter", /Nothing is left of Brenna but dust/);
  const gone = structuredClone(s); gone.entities.fighter.vanished = true;
  refuse(gone, "fighter", /no body/);
  const over = structuredClone(s);
  const b = ok(apply(over, { type: "spawn", monster: "bandit", at: { q: 4, r: 0 } }, DM)).events[0].id;
  over.entities[b].pos = { ...over.entities.fighter.pos };
  refuse(over, "fighter", /stands where Brenna's body lies/);
  const far = structuredClone(s); far.entities.fighter.pos = { q: 5, r: 0, z: 0 };
  refuse(far, "fighter", /touch/);
  // No slot left.
  const dry = structuredClone(s); dry.entities.pia.slots[3] = 0; dry.entities.pia.slots[4] = 0;
  const before = json(dry);
  assert.equal(revivify(dry, "fighter").ok, false);
  assert.equal(json(dry), before);
});

test("every other spell still refuses a dead target exactly as before, and Revivify's targets are bodies", () => {
  const s = table();
  slain(s, "fighter");
  const before = json(s);
  for (const spell of ["cure-wounds", "spare-the-dying", "bless"]) {
    const r = apply(s, { type: "cast", actor: "pia", spell, target: "fighter" }, DM);
    assert.equal(r.ok, false, spell);
    assert.equal(r.error, "Brenna is dead.", spell);
  }
  assert.equal(json(s), before);
  assert.deepEqual(targetsFor(s, s.entities.pia, { spell: "revivify" }), ["fighter"]);
  assert.deepEqual(targetsFor(s, s.entities.pia, { spell: "cure-wounds" }), ["pia"]);
});

test("a player casts it too, and may not aim it at a creature the party has not been told of", () => {
  const s = table();
  slain(s, "fighter");
  const ghost = ok(apply(s, { type: "spawn", monster: "bandit", at: { q: 1, r: 1 }, hidden: true }, DM)).events[0].id;
  slain(s, ghost);
  const before = json(s);
  const r = apply(s, { type: "cast", actor: "pia", spell: "revivify", target: ghost }, PAT);
  assert.equal(r.ok, false);
  assert.equal(r.error, "No such creature.");
  assert.equal(json(s), before);
  ok(revivify(s, "fighter", "pia", PAT));
  assert.equal(s.entities.fighter.dead, false);
});

test("the time of death is withheld from every player's view and survives a save and a load", () => {
  const s = table();
  slain(s, "fighter");
  assert.ok(Number.isFinite(s.entities.fighter.diedAt));
  assert.ok(!json(view(s, PAT)).includes("diedAt"));
  const back = migrate(JSON.parse(json(s)));
  assert.equal(back.entities.fighter.diedAt, s.entities.fighter.diedAt);
  assert.equal(back.version, VERSION);
  ok(revivify(back, "fighter"));
  assert.equal(back.entities.fighter.dead, false);
});

test("the arena: a body in a fight comes back into it, and the fight is not over for it", () => {
  const s = table();
  const b = ok(apply(s, { type: "spawn", monster: "bandit", at: { q: 4, r: 0 } }, DM)).events[0].id;
  Object.assign(s.entities[b], { hp: 500, maxHp: 500 });
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, DM));
  for (let i = 0; i < 20 && current(s) !== "pia"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  slain(s, "fighter");
  ok(revivify(s, "fighter"));
  assert.equal(s.entities.fighter.dead, false);
  assert.ok(s.encounter.order.some((o) => o.id === "fighter"));
  // And a turn taken later: it is up, so it takes its turn.
  const seen = new Set();
  for (let i = 0; i < 12; i++) { seen.add(current(s)); ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); }
  assert.ok(seen.has("fighter"));
});
