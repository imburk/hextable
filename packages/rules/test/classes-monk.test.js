// Monk features at levels 7 to 15 (SRD 5.2.1) and the engine parts they use: Evasion on a
// Dexterity save for half damage, moving up walls and across water, a feature's action that takes
// other actions (Patient Defense, Step of the Wind), conditions ended at the end of a turn, a
// reaction widened to every damage type, a failed save rolled again for a Focus Point, Focus Points
// on rolling Initiative (Uncanny Metabolism, Perfect Focus) and Step of the Wind after another Bonus
// Action (Fleet Step).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity, moveOptions } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { lintRecord } from "../src/content/schema.js";

import * as H from "../src/hex.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "refused"); if (re) assert.match(r.error, re); };
const monk = (level, more = {}) => ({ name: "Lo", class: "monk", level, ...(level >= 3 ? { subclass: "open-hand" } : {}), abilities: { str: 10, dex: 16, con: 14, int: 10, wis: 14, cha: 8 }, skills: ["acrobatics", "insight"], weapons: ["quarterstaff"], ...more });
const sorc = { name: "Ash", class: "sorcerer", level: 5, subclass: "draconic", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 16 }, skills: ["arcana", "insight"], spells: ["fire-bolt", "burning-hands"] };
const feat = (level, id) => derive(monk(level)).record.feats.find((f) => f.id === id);

function field(level, more = {}) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  const { noInstructions, ...sheet } = more;
  s.entities.hero = makeEntity(derive(monk(level, sheet)).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  s.entities.evil = makeEntity(derive(sorc).record, { id: "evil", kind: "npc", side: "foe", pos: { q: 2, r: 0, z: 0 } });
  s.entities.evil.hp = s.entities.evil.maxHp = 300;
  // Uncanny Metabolism and Disciplined Survivor spend something, so their default is never; these tests set them to always.
  const set = {};
  if (level >= 2 && !more.noInstructions) set["uncanny-metabolism"] = "always";
  if (level >= 14 && !more.noInstructions) set["disciplined-survivor"] = "always";
  if (Object.keys(set).length) ok(apply(s, { type: "reactions", actor: "hero", set }, DM));
  return s;
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 20 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const use = (s, feature, more = {}) => apply(s, { type: "feature", actor: "hero", feature, ...more }, DM);
const burn = (s) => ok(apply(s, { type: "cast", actor: "evil", spell: "burning-hands", hex: { q: 0, r: 0 }, slot: 1 }, DM));

test("the monk's features at levels 7 to 15 appear at their levels, and the records are valid", () => {
  const at = (l) => derive(monk(l)).record.feats.map((f) => f.id);
  for (const [id, level] of [["evasion", 7], ["acrobatic-movement", 9], ["heightened-focus", 10], ["self-restoration", 10], ["fleet-step", 11], ["deflect-energy", 13], ["disciplined-survivor", 14], ["perfect-focus", 15]]) {
    assert.ok(!at(level - 1).includes(id), `${id} before ${level}`);
    assert.ok(at(level).includes(id), `${id} at ${level}`);
  }
  for (let l = 1; l <= 20; l++) { assert.deepEqual(validate(monk(l)), [], `level ${l}`); assert.deepEqual(lintRecord(derive(monk(l)).record), [], `record ${l}`); }
  assert.deepEqual(feat(12, "deflect-attacks").reaction.types, ["bludgeoning", "piercing", "slashing"]);
  assert.equal(feat(13, "deflect-attacks").reaction.types, undefined, "any damage type");
  assert.deepEqual(derive(monk(14)).record.saveProf, ["str", "dex", "con", "int", "wis", "cha"]);
  assert.equal(feat(10, "flurry-of-blows").action.gain.attacks.n, 3, "three strikes from level 10");
  assert.equal(feat(9, "flurry-of-blows").action.gain.attacks.n, 2);
  assert.equal(feat(2, "uncanny-metabolism").initiative.heal, "1d6+2", "Martial Arts die + Monk level");
  assert.equal(feat(11, "uncanny-metabolism").initiative.heal, "1d10+11");
});

test("Evasion: a Dexterity save for half damage does none on a success and half on a failure; not while Incapacitated or before level 7", () => {
  const seen = new Set();
  for (let seed = 1; seed < 80 && seen.size < 2; seed++) {
    const s = field(7), e = s.entities.hero;
    s.rng = seed * 7919;
    fight(s); turnOf(s, "evil");
    const before = e.hp, r = burn(s);
    const sv = r.events.find((x) => x.type === "save" && x.id === "hero"), dmg = r.events.find((x) => x.type === "damage" && x.target === "hero");
    if (sv.success) {
      seen.add("saved");
      assert.equal(dmg, undefined, "no damage on a success");
      assert.equal(e.hp, before);
      assert.ok(r.events.some((x) => x.type === "note" && x.text === "Evasion: no damage"));
    } else {
      seen.add("failed");
      assert.ok(r.events.some((x) => x.type === "note" && x.text === "Evasion: half damage"));
      const rolled = dmg.rolled ?? dmg.amount;
      assert.equal(dmg.amount, Math.floor(rolled / 2), "half of what was rolled");
    }
  }
  assert.equal(seen.size, 2, "both outcomes seen");
  // Incapacitated, or level 6: the usual half on a success.
  for (const [level, stun] of [[7, true], [6, false]]) {
    let checked = false;
    for (let seed = 1; seed < 80 && !checked; seed++) {
      const s = field(level), e = s.entities.hero;
      s.rng = seed * 7919;
      fight(s); turnOf(s, "evil");
      if (stun) ok(apply(s, { type: "condition", actor: "hero", condition: "incapacitated" }, DM));
      const r = burn(s), sv = r.events.find((x) => x.type === "save" && x.id === "hero");
      assert.ok(!r.events.some((x) => x.type === "note" && /Evasion/.test(x.text)));
      if (sv.success) { checked = true; assert.ok(r.events.some((x) => x.type === "damage" && x.target === "hero"), "half damage on a success"); }
      void e;
    }
    assert.ok(checked);
  }
});

test("Acrobatic Movement: across water (not stopping on it), without armor or Shield; climbing costs as usual", () => {
  const s = field(9);
  const tiles = s.map.levels[0].tiles;
  for (const h of [{ q: 1, r: 0 }, { q: 2, r: 0 }]) tiles[H.col(h)].t = "water";
  delete s.entities.evil;
  const reach = moveOptions(s, s.entities.hero);
  const at = (q) => [...reach.values()].find((v) => v.h.q === q && v.h.r === 0);
  assert.ok(at(1) && !at(1).canStop, "water is crossed but not stood on");
  assert.ok(at(3)?.canStop, "the far bank is reached");
  // In armor, or at level 8: no way across.
  const t = field(9, { armour: "leather-armor" });
  for (const h of [{ q: 1, r: 0 }, { q: 2, r: 0 }]) t.map.levels[0].tiles[H.col(h)].t = "water";
  delete t.entities.evil;
  assert.equal([...moveOptions(t, t.entities.hero).values()].find((v) => v.h.q === 1 && v.h.r === 0), undefined, "in armor");
  const u = field(8);
  for (const h of [{ q: 1, r: 0 }, { q: 2, r: 0 }]) u.map.levels[0].tiles[H.col(h)].t = "water";
  delete u.entities.evil;
  assert.equal([...moveOptions(u, u.entities.hero).values()].find((v) => v.h.q === 1 && v.h.r === 0), undefined, "level 8");
  // A ledge 15 feet up is climbed as anyone climbs: the SRD gives no Climb Speed, so no cheaper climb.
  const w = field(9), wt = w.map.levels[0].tiles;
  delete w.entities.evil;
  wt[H.col({ q: 1, r: 0 })].h = 15;
  const cost9 = [...moveOptions(w, w.entities.hero).values()].find((v) => v.h.q === 1 && v.h.r === 0).cost;
  const v8 = field(8);
  delete v8.entities.evil;
  v8.map.levels[0].tiles[H.col({ q: 1, r: 0 })].h = 15;
  const cost8 = [...moveOptions(v8, v8.entities.hero).values()].find((v) => v.h.q === 1 && v.h.r === 0).cost;
  assert.equal(cost9, cost8, "the same cost with or without it");
});

test("Patient Defense with a Focus Point: Disengage and Dodge as a Bonus Action, and from level 10 Temporary Hit Points", () => {
  const s = field(10), e = s.entities.hero;
  fight(s); turnOf(s, "hero");
  const focus = e.uses["monks-focus"];
  const r = ok(use(s, "patient-defense"));
  assert.equal(e.uses["monks-focus"], focus - 1);
  assert.equal(s.encounter.budget.bonus, 0);
  assert.equal(s.encounter.budget.action, 1);
  assert.ok(e.cond.dodging && e.cond.disengaged);
  const thp = r.events.find((x) => x.type === "tempHp" && x.id === "hero");
  assert.ok(thp.amount >= 2 && thp.amount <= 16, "two rolls of the d8 Martial Arts die");
  assert.equal(thp.dice.length, 2);
  // At level 9 no Temporary Hit Points; the free Disengage is still the disengage action.
  const t = field(9), te = t.entities.hero;
  fight(t); turnOf(t, "hero");
  const r9 = ok(apply(t, { type: "feature", actor: "hero", feature: "patient-defense" }, DM));
  assert.ok(!r9.events.some((x) => x.type === "tempHp"));
  assert.ok(te.cond.dodging && te.cond.disengaged);
  const u = field(9);
  fight(u); turnOf(u, "hero");
  const f0 = u.entities.hero.uses["monks-focus"];
  ok(apply(u, { type: "disengage", actor: "hero", bonus: true }, DM));
  assert.equal(u.entities.hero.uses["monks-focus"], f0, "the free version costs no Focus");
  // Outside a fight below level 10 it would do nothing: refused, and no Focus Point spent.
  const w = field(9);
  no(apply(w, { type: "feature", actor: "hero", feature: "patient-defense" }, DM), /only matters in a fight/);
  assert.equal(w.entities.hero.uses["monks-focus"], 9);
  // With no Focus Points it is refused and nothing changes.
  const v = field(10);
  fight(v); turnOf(v, "hero");
  v.entities.hero.uses["monks-focus"] = 0;
  const snap = JSON.stringify(v);
  no(apply(v, { type: "feature", actor: "hero", feature: "patient-defense" }, DM), /no uses of Monk's Focus left/);
  assert.equal(JSON.stringify(v), snap);
});

test("Step of the Wind with a Focus Point: Disengage and Dash as a Bonus Action; the jump and carrying a creature are the DM's", () => {
  const s = field(10), e = s.entities.hero;
  fight(s); turnOf(s, "hero");
  const move = s.encounter.budget.move;
  const r = ok(use(s, "step-of-the-wind"));
  assert.ok(e.cond.disengaged);
  assert.equal(s.encounter.budget.move, move + 50, "its Speed (50) added: a Dash");
  const manual = r.events.filter((x) => x.type === "manual").map((x) => x.text);
  assert.ok(manual.some((t) => /jump distance is doubled/.test(t)));
  assert.ok(manual.some((t) => /willing Large or smaller creature/.test(t)), "Heightened Focus at 10");
  const t = field(9);
  fight(t); turnOf(t, "hero");
  assert.ok(!ok(apply(t, { type: "feature", actor: "hero", feature: "step-of-the-wind" }, DM)).events.some((x) => x.type === "manual" && /willing/.test(x.text)));
});

test("Self-Restoration: at the end of each of its turns, the one of Charmed, Frightened or Poisoned its player picks ends", () => {
  const s = field(10), e = s.entities.hero;
  fight(s); turnOf(s, "hero");
  e.cond.charmed = {}; e.cond.poisoned = {};
  // A pick it cannot make is refused, and nothing changes.
  const snap = JSON.stringify(s);
  no(apply(s, { type: "endTurn", actor: "hero", cure: "frightened" }, DM), /can end Charmed or Poisoned/);
  no(apply(s, { type: "endTurn", actor: "hero", cure: 3 }, DM));
  assert.equal(JSON.stringify(s), snap);
  // The player's pick: Poisoned, though Charmed comes first in the list.
  const r = ok(apply(s, { type: "endTurn", actor: "hero", cure: "poisoned" }, DM));
  assert.ok(r.events.some((x) => x.type === "condEnd" && x.id === "hero" && x.cond === "poisoned"));
  assert.ok(e.cond.charmed && !e.cond.poisoned, "the one picked, not both");
  // Two again and no pick: the DM is told, and the engine ends neither.
  turnOf(s, "hero");
  e.cond.frightened = {};
  const r2 = ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
  assert.ok(r2.events.some((x) => x.type === "manual" && /none was sent, so the DM removes the one the player picks/.test(x.text)));
  assert.ok(e.cond.charmed && e.cond.frightened);
  // Only one: no pick needed.
  delete e.cond.charmed;
  turnOf(s, "hero");
  ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
  assert.ok(!e.cond.frightened, "the only one ends");
  // Nothing to end: a pick is refused.
  turnOf(s, "hero");
  no(apply(s, { type: "endTurn", actor: "hero", cure: "poisoned" }, DM), /has none of the conditions/);
  const t = field(9);
  fight(t); turnOf(t, "hero");
  t.entities.hero.cond.frightened = {};
  ok(apply(t, { type: "endTurn", actor: "hero" }, DM));
  assert.ok(t.entities.hero.cond.frightened, "level 9");
});

test("Deflect Energy: Deflect Attacks against a Fire Bolt from level 13, not at 12", () => {
  const reacted = (level) => {
    for (let seed = 1; seed < 60; seed++) {
      const s = field(level);
      s.rng = seed * 7919;
      fight(s); turnOf(s, "evil");
      const r = ok(apply(s, { type: "cast", actor: "evil", spell: "fire-bolt", target: "hero" }, DM));
      if (!r.events.find((x) => x.type === "attack")?.hit) continue;
      return r.events.find((x) => x.type === "reaction" && x.id === "hero" && x.reaction === "deflect-attacks") ?? null;
    }
    throw new Error("never hit");
  };
  const re = reacted(13);
  assert.ok(re, "taken against Fire damage");
  assert.ok(re.amount > 0);
  assert.equal(reacted(12), null);
});

test("Disciplined Survivor: a failed save rolled again for 1 Focus Point, the new roll standing", () => {
  let seen = 0;
  for (let seed = 1; seed < 200 && seen < 2; seed++) {
    const s = field(14), e = s.entities.hero;
    s.rng = seed * 7919;
    fight(s); turnOf(s, "evil");
    const focus = e.uses["monks-focus"];
    const sv = burn(s).events.find((x) => x.type === "save" && x.id === "hero");
    if (!sv.reroll) { assert.equal(e.uses["monks-focus"], focus); continue; }
    seen++;
    assert.equal(sv.reroll.name, "Disciplined Survivor");
    assert.equal(sv.reroll.add, undefined, "no bonus");
    assert.equal(e.uses["monks-focus"], focus - 1);
    assert.equal(sv.total, sv.roll + sv.bonus);
  }
  assert.equal(seen, 2);
  // By default (never), no Focus Point is spent on a failed save.
  for (let seed = 1; seed < 30; seed++) {
    const s = field(14, { noInstructions: true });
    s.rng = seed * 7919;
    fight(s); turnOf(s, "evil");
    const f0 = s.entities.hero.uses["monks-focus"];
    assert.ok(!burn(s).events.find((x) => x.type === "save" && x.id === "hero").reroll);
    assert.equal(s.entities.hero.uses["monks-focus"], f0);
  }
  // With no Focus Points left, or an instruction of never, nothing is rolled again.
  for (const prep of [(s) => { s.entities.hero.uses["monks-focus"] = 0; }, (s) => ok(apply(s, { type: "reactions", actor: "hero", set: { "disciplined-survivor": "never" } }, DM))]) {
    for (let seed = 1; seed < 30; seed++) {
      const s = field(14);
      s.rng = seed * 7919;
      fight(s); turnOf(s, "evil"); prep(s);
      assert.ok(!burn(s).events.find((x) => x.type === "save" && x.id === "hero").reroll);
    }
  }
});

test("Uncanny Metabolism and Perfect Focus on rolling Initiative", () => {
  // Uncanny Metabolism: all Focus Points back and Monk level + a Martial Arts die in Hit Points, once a Long Rest.
  const s = field(15), e = s.entities.hero;
  e.uses["monks-focus"] = 1; e.hp = 20;
  const r = fight(s);
  assert.equal(e.uses["monks-focus"], 15);
  assert.equal(e.uses["uncanny-metabolism"], 0);
  const h = r.events.find((x) => x.type === "heal" && x.target === "hero");
  assert.ok(h.amount >= 16 && h.amount <= 25, "15 + 1d10");
  assert.ok(!r.events.some((x) => x.type === "std" && /^Perfect Focus/.test(x.action)), "not both");
  ok(apply(s, { type: "endEncounter" }, DM));
  // Perfect Focus, with Uncanny Metabolism spent: up to 4 if 3 or fewer.
  e.uses["monks-focus"] = 1;
  fight(s);
  assert.equal(e.uses["monks-focus"], 4);
  ok(apply(s, { type: "endEncounter" }, DM));
  e.uses["monks-focus"] = 6;
  fight(s);
  assert.equal(e.uses["monks-focus"], 6, "4 or more: nothing");
  ok(apply(s, { type: "endEncounter" }, DM));
  // Uncanny Metabolism kept when there is nothing to give back; never by instruction; level 14 has no Perfect Focus.
  const t = field(14), te = t.entities.hero;
  fight(t);
  assert.equal(te.uses["uncanny-metabolism"], 1, "full Focus and Hit Points: kept");
  ok(apply(t, { type: "endEncounter" }, DM));
  ok(apply(t, { type: "reactions", actor: "hero", set: { "uncanny-metabolism": "never" } }, DM));
  te.uses["monks-focus"] = 1;
  fight(t);
  assert.equal(te.uses["monks-focus"], 1, "never, and no Perfect Focus at 14");
  assert.equal(te.uses["uncanny-metabolism"], 1);
  no(apply(t, { type: "feature", actor: "hero", feature: "uncanny-metabolism" }, DM), /used when Lo rolls Initiative/);
  // With no instruction set (the default, never), nothing is spent: Focus Points and the use stay as they were.
  const d = field(14, { noInstructions: true }), de = d.entities.hero;
  de.uses["monks-focus"] = 2; de.hp = 20;
  fight(d);
  assert.equal(de.uses["monks-focus"], 2);
  assert.equal(de.uses["uncanny-metabolism"], 1);
  assert.equal(de.hp, 20);
});

test("Fleet Step: Step of the Wind without a Bonus Action after another Bonus Action, once a turn, not after Step of the Wind itself", () => {
  const s = field(11), e = s.entities.hero;
  fight(s); turnOf(s, "hero");
  ok(use(s, "flurry-of-blows"));
  assert.equal(s.encounter.budget.bonusAttacks.left, 3, "Heightened Focus: three Unarmed Strikes");
  assert.equal(s.encounter.budget.bonus, 0);
  const move = s.encounter.budget.move;
  ok(apply(s, { type: "dash", actor: "hero", bonus: true }, DM));
  assert.equal(s.encounter.budget.move, move + 50);
  no(apply(s, { type: "dash", actor: "hero", bonus: true }, DM), /already used a Bonus Action/);
  no(use(s, "step-of-the-wind"), /already used a Bonus Action/, "once a turn");
  // After Step of the Wind itself: not again.
  ok(apply(s, { type: "endTurn", actor: "hero" }, DM)); turnOf(s, "hero");
  ok(use(s, "step-of-the-wind"));
  no(apply(s, { type: "dash", actor: "hero", bonus: true }, DM), /already used a Bonus Action/);
  // The Focus Point version after another Bonus Action.
  ok(apply(s, { type: "endTurn", actor: "hero" }, DM)); turnOf(s, "hero");
  ok(apply(s, { type: "disengage", actor: "hero", bonus: true }, DM));
  const f = e.uses["monks-focus"];
  ok(use(s, "step-of-the-wind"));
  assert.equal(e.uses["monks-focus"], f - 1);
  // Level 10: no Fleet Step.
  const t = field(10);
  fight(t); turnOf(t, "hero");
  ok(apply(t, { type: "feature", actor: "hero", feature: "flurry-of-blows" }, DM));
  no(apply(t, { type: "dash", actor: "hero", bonus: true }, DM), /already used a Bonus Action/);
});
