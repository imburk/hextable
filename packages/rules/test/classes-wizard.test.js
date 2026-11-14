// Wizard features at levels 7 to 15 (SRD 5.2.1, Wizard and Evoker): Ability Score Improvement at 8
// and 12, Empowered Evocation (the Intelligence modifier on one damage roll of a Wizard Evocation
// spell, the player's pick where there are several) and Overchannel (maximum damage, and Necrotic
// damage to the caster from the second use before a Long Rest, ignoring Resistance and Immunity).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, featChoices, validate } from "../src/derive.js";
import { lintRecord } from "../src/content/schema.js";
import { SPELLS as BOOK } from "../src/content/index.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "refused"); if (re) assert.match(r.error, re); };
const A = { str: 8, dex: 14, con: 14, int: 18, wis: 12, cha: 10 };
const SPELLS = ["fire-bolt", "ray-of-sickness", "magic-missile", "scorching-ray", "fireball", "ice-storm", "hold-person", "cone-of-cold", "lightning-bolt"];
const wiz = (level, more = {}) => ({ name: "Vex", class: "wizard", level, ...(level >= 3 ? { subclass: "evoker" } : {}), abilities: A, skills: ["arcana", "history"], spells: SPELLS, ...more });

// The wizard at a distance from two tough monsters standing side by side.
function field(level) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (!["m1", "m2"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(wiz(level)).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  ok(apply(s, { type: "place", actor: "m1", to: { q: 6, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "m2", to: { q: 7, r: 0 } }, DM));
  for (const e of Object.values(s.entities)) { e.hp = e.maxHp = 400; e.ac = 1; }
  return s;
}
const turnOf = (s, id) => { for (let i = 0; i < 30 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const ready = (level, seed = 11) => {
  const s = field(level);
  s.rng = seed;
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }, DM));
  turnOf(s, "hero");
  return s;
};
const cast = (s, x) => apply(s, { type: "cast", actor: "hero", ...x }, DM);
const hits = (r, id) => r.events.filter((x) => x.type === "damage" && x.target === id);
const notes = (r) => r.events.filter((x) => x.type === "note").map((x) => x.text);
const manuals = (r) => r.events.filter((x) => x.type === "manual").map((x) => x.text);

test("the wizard's features at levels 7 to 15 appear at their levels, and the records are valid", () => {
  const ids = (l) => derive(wiz(l)).record.feats.map((f) => f.id);
  for (const [id, level] of [["empowered-evocation", 10], ["overchannel", 14]]) {
    assert.ok(!ids(level - 1).includes(id), `${id} before ${level}`);
    assert.ok(ids(level).includes(id), `${id} at ${level}`);
  }
  for (let l = 9; l <= 20; l++) { assert.deepEqual(validate(wiz(l)), [], `level ${l}`); assert.deepEqual(lintRecord(derive(wiz(l)).record, { spells: BOOK }), [], `record ${l}`); }
  for (let l = 1; l <= 8; l++) { const sh = wiz(l, { spells: ["fire-bolt", "magic-missile"] }); assert.deepEqual(validate(sh), [], `level ${l}`); assert.deepEqual(lintRecord(derive(sh).record, { spells: BOOK }), [], `record ${l}`); }
  // Ability Score Improvement at 8 and 12: a place for a feat each.
  const at = (l) => featChoices(wiz(l)).map((c) => c.at);
  assert.ok(!at(7).includes("ability-score-improvement-8") && at(8).includes("ability-score-improvement-8"));
  assert.ok(!at(11).includes("ability-score-improvement-12") && at(12).includes("ability-score-improvement-12"));
  const taken = derive(wiz(8, { abilities: { ...A, int: 18 }, feats: [{ id: "ability-score-improvement", at: "ability-score-improvement-8", abilities: { int: 2 } }] })).record;
  assert.equal(taken.abil.int, 20, "the feat taken at level 8 raises Intelligence");
});

test("Empowered Evocation: the Intelligence modifier on Fireball's one roll, from level 10, not without it, not when declined", () => {
  const fire = (level, more = {}) => { const s = ready(level); return ok(cast(s, { spell: "fireball", hex: { q: 6, r: 0 }, ...more })); };
  const r9 = fire(9), r10 = fire(10), off = fire(10, { empower: false });
  const total = (r) => hits(r, "m1")[0];
  // The same dice with the same seed: the roll is 4 more (Intelligence 18), shared by both creatures it hits.
  assert.equal(total(r10).bonus, total(r9).bonus + 4);
  assert.equal(hits(r10, "m2")[0].bonus, total(r9).bonus + 4);
  assert.ok(notes(r10).includes("Empowered Evocation: +4 damage"));
  assert.deepEqual(hits(off, "m1").map((x) => x.amount), hits(r9, "m1").map((x) => x.amount), "declined: as at level 9");
  assert.ok(!notes(off).some((t) => /Empowered/.test(t)));
});

test("Empowered Evocation: a spell with two damage steps takes the player's pick, or goes to the DM; another school is refused", () => {
  // Ice Storm: bludgeoning and cold, two rolls. Without a pick nothing is added and the DM is told.
  const s1 = ready(10), r1 = ok(cast(s1, { spell: "ice-storm", hex: { q: 6, r: 0 } }));
  assert.ok(manuals(r1).some((t) => /Empowered Evocation: .*several/.test(t)));
  assert.ok(!notes(r1).some((t) => /Empowered/.test(t)));
  // Picking the second (cold): the cold roll is 4 more than without the feature.
  const s9 = ready(9), r9 = ok(cast(s9, { spell: "ice-storm", hex: { q: 6, r: 0 } }));
  const s2 = ready(10), r2 = ok(cast(s2, { spell: "ice-storm", hex: { q: 6, r: 0 }, empower: 1 }));
  const by = (r, t) => hits(r, "m1").find((x) => x.dtype === t);
  assert.equal(by(r2, "cold").bonus, by(r9, "cold").bonus + 4);
  assert.equal(by(r2, "bludgeoning").bonus, by(r9, "bludgeoning").bonus);
  // A roll that is not there, a non-Evocation spell, and a wizard without the feature: refused, nothing changed.
  for (const [lvl, x, re] of [[10, { spell: "ice-storm", hex: { q: 6, r: 0 }, empower: 2 }, /2 damage rolls/], [10, { spell: "ray-of-sickness", target: "m1", empower: 0 }, /Evocation/], [9, { spell: "fireball", hex: { q: 6, r: 0 }, empower: 0 }, /no feature/]]) {
    const s = ready(lvl), before = structuredClone(s);
    no(cast(s, x), re);
    assert.deepEqual(s, before);
  }
});

test("Empowered Evocation: rays aimed at several creatures take the ray named, and only that ray's roll", () => {
  // Find a seed where all three rays hit, then pick the third.
  for (let seed = 1; seed < 200; seed++) {
    const s = ready(10, seed), r = cast(structuredClone(s), { spell: "scorching-ray", targets: ["m1", "m2", "m2"], empower: 2 });
    if (!r.ok || r.events.filter((x) => x.type === "attack" && x.hit).length < 3) continue;
    const s9 = ready(9, seed), r9 = ok(cast(s9, { spell: "scorching-ray", targets: ["m1", "m2", "m2"] }));
    const rolls = (x) => x.events.filter((e) => e.type === "damage").map((e) => e.bonus);
    assert.deepEqual(rolls(r), [rolls(r9)[0], rolls(r9)[1], rolls(r9)[2] + 4]);
    // No pick: the DM is told and nothing is added.
    const told = ok(cast(ready(10, seed), { spell: "scorching-ray", targets: ["m1", "m2", "m2"] }));
    assert.ok(manuals(told).some((t) => /Empowered Evocation/.test(t)));
    assert.deepEqual(rolls(told), rolls(r9));
    no(cast(ready(10, seed), { spell: "scorching-ray", targets: ["m1", "m2", "m2"], empower: 3 }), /3 rays or darts/);
    return;
  }
  assert.fail("no seed");
});

test("Overchannel: Fireball at its maximum, free the first time, then 2d12 and 3d12 Necrotic per slot level, ignoring Resistance; a Long Rest resets it", () => {
  const s = ready(14), e = s.entities.hero;
  e.resist = ["necrotic"]; e.immune = ["necrotic"];
  const r1 = ok(cast(s, { spell: "fireball", hex: { q: 6, r: 0 }, overchannel: true }));
  const d = hits(r1, "m1")[0];
  assert.ok(d.dice.every((x) => x.value === 6 && x.max), "every die at its highest, marked as such");
  assert.equal(d.dice.length, 8);
  assert.equal(e.uses.overchannel, 1);
  assert.equal(hits(r1, "hero").length, 0, "the first use costs nothing");
  // The second use, a level 3 slot: 6d12 Necrotic (2d12 per level), Immunity and Resistance ignored.
  turnOf(s, "m1"); turnOf(s, "hero");
  const hp = e.hp, r2 = ok(cast(s, { spell: "fireball", hex: { q: 6, r: 0 }, overchannel: true }));
  const self = hits(r2, "hero")[0];
  assert.equal(self.dtype, "necrotic");
  assert.equal(self.dice.length, 6);
  assert.equal(self.amount, self.dice.reduce((n, x) => n + x.value, 0), "not halved, not stopped");
  assert.equal(e.hp, hp - self.amount);
  // The third, with a level 4 slot: 3d12 per level, 12d12.
  turnOf(s, "m1"); turnOf(s, "hero");
  const r3 = ok(cast(s, { spell: "fireball", hex: { q: 6, r: 0 }, slot: 4, overchannel: true }));
  assert.equal(hits(r3, "hero")[0].dice.length, 12);
  assert.equal(e.uses.overchannel, 3);
  // Without it, Fireball's dice are rolled as ever.
  turnOf(s, "m1"); turnOf(s, "hero");
  const plain = ok(cast(s, { spell: "fireball", hex: { q: 6, r: 0 }, slot: 5 }));
  assert.ok(hits(plain, "m1")[0].dice.every((x) => !x.max));
  assert.equal(e.uses.overchannel, 3);
  ok(apply(s, { type: "endEncounter" }, DM));
  ok(apply(s, { type: "rest" }, DM));
  assert.equal(e.uses.overchannel, undefined, "a Long Rest makes the next use free again");
});

test("Overchannel is refused for a cantrip, a slot above 5, a spell with no damage, and below level 14; nothing changes", () => {
  for (const [lvl, x, re] of [
    [14, { spell: "fire-bolt", target: "m1", overchannel: true }, /spell slot of level 1 to 5/],
    [14, { spell: "fireball", hex: { q: 6, r: 0 }, slot: 6, overchannel: true }, /level 1 to 5/],
    [14, { spell: "hold-person", target: "m1", overchannel: true }, /no damage/],
    [13, { spell: "fireball", hex: { q: 6, r: 0 }, overchannel: true }, /can't Overchannel/],
  ]) {
    const s = ready(lvl), before = structuredClone(s);
    no(cast(s, x), re);
    assert.deepEqual(s, before);
  }
  // A remade sheet keeps the count of uses.
  const s = ready(14);
  ok(cast(s, { spell: "fireball", hex: { q: 6, r: 0 }, overchannel: true }));
  ok(apply(s, { type: "endEncounter" }, DM));
  ok(apply(s, { type: "setSheet", id: "hero", sheet: wiz(14) }, DM));
  assert.equal(s.entities.hero.uses.overchannel, 1);
});
