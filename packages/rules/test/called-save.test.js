// PB-5 (#676): a saving throw the DM calls for, and Advantage or Disadvantage the DM grants (docs/specs/prompts.md, "Call for a roll").
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); assert.match(r.error, re); return r; };
const game = (seed = 1) => {
  const s = newGame(seed);
  ok(apply(s, { type: "claim", entity: "fighter", user: "pat", userName: "Pat" }, PAT));
  return s;
};
const saves = (r) => r.events.filter((e) => e.type === "save");
const hits = (r) => r.events.filter((e) => e.type === "damage");
const call = (s, over, ctx = DM) => apply(s, { type: "save", who: "fighter", ability: "con", dc: 10, ...over }, ctx);

test("a called save: each creature rolls its own with its own bonus", () => {
  const s = game(), fighter = s.entities.fighter, rogue = s.entities.rogue, gob = s.entities.m1;
  const r = ok(call(s, { who: ["fighter", "rogue", "m1"], ability: "dex", dc: 12 }));
  assert.deepEqual(saves(r).map((e) => e.id), ["fighter", "rogue", "m1"]);
  assert.ok(saves(r).every((e) => e.called && e.dc === 12 && e.abil === "dex"));
  const [f, p, g] = saves(r);
  assert.equal(f.bonus, Math.floor((fighter.abil.dex - 10) / 2));                                         // not proficient
  assert.equal(p.bonus, Math.floor((rogue.abil.dex - 10) / 2) + rogue.prof);                              // proficient
  assert.equal(g.bonus, gob.saveBonus?.dex ?? Math.floor((gob.abil.dex - 10) / 2));
  for (const e of saves(r)) assert.equal(e.success, e.total >= 12);
  // One id is the same as a list of one.
  ok(call(game(), { who: "fighter" }));
});

test("damage on a failure, half (rounded down) on a success if half, none if not; one roll for all", () => {
  const s = game();
  const hp = (id) => s.entities[id].hp;
  const before = { fighter: hp("fighter"), rogue: hp("rogue") };
  // DC 40 cannot be met, DC 1 cannot be missed.
  const lose = ok(call(s, { who: ["fighter", "rogue"], dc: 40, damage: { dice: "3d4+2", type: "fire" } }));
  const [a, b] = hits(lose);
  assert.equal(a.amount, b.amount);                                                                          // rolled once
  assert.equal(before.fighter - hp("fighter") + before.rogue - hp("rogue") > 0, true);
  const t = game(2), h0 = t.entities.fighter.hp;
  const none = ok(call(t, { dc: 1, damage: { dice: "3d4+2", type: "fire" } }));
  assert.deepEqual([hits(none).length, t.entities.fighter.hp], [0, h0]);
  const u = game(2);
  const half = ok(call(u, { dc: 1, damage: { dice: "3d4+2", type: "fire", half: true } }));
  const full = ok(call(game(2), { dc: 40, damage: { dice: "3d4+2", type: "fire", half: true } }));
  assert.equal(hits(half)[0].amount, Math.floor(hits(full)[0].amount / 2));                                  // the same seed, the same dice
  assert.equal(hits(half)[0].rolled, hits(full)[0].amount);
});

test("Resistance and Immunity apply to a called save's damage", () => {
  const s = game();
  s.entities.fighter.resist = ["fire"];
  const r = ok(call(s, { who: ["fighter", "m5"], dc: 40, damage: { dice: "4d6", type: "fire" } }));
  const [f, sk] = hits(r);
  assert.equal(f.amount, Math.floor(f.rolled / 2));
  assert.equal(sk.amount, sk.rolled ?? sk.amount);                                                           // the skeleton does not resist fire
  const p = game();
  const r2 = ok(call(p, { who: "m5", dc: 40, damage: { dice: "4d6", type: "poison" } }));
  assert.equal(hits(r2).reduce((n, e) => n + e.amount, 0), 0);                                               // immune
  assert.equal(p.entities.m5.hp, 13);
});

test("a condition on a failure only; immune creatures are told, not given it", () => {
  const s = game();
  const r = ok(call(s, { who: ["fighter", "m5"], dc: 40, condition: "poisoned" }));
  assert.ok(s.entities.fighter.cond.poisoned);
  assert.equal(s.entities.m5.cond.poisoned, undefined);                                                      // the skeleton is immune
  assert.ok(r.events.some((e) => e.type === "note" && e.id === "m5" && /immune/.test(e.text)));
  const t = game();
  ok(call(t, { dc: 1, condition: "poisoned" }));
  assert.equal(t.entities.fighter.cond.poisoned, undefined);
});

test("the rules' automatic failures hold: Paralyzed fails a Dexterity save outright", () => {
  const s = game();
  ok(apply(s, { type: "condition", actor: "wizard", condition: "paralyzed", on: true }, DM));
  const r = ok(call(s, { who: ["wizard", "rogue"], ability: "dex", dc: 1 }));
  const [w, p] = saves(r);
  assert.deepEqual([w.success, w.roll], [false, 0]);
  assert.equal(p.success, true);
});

test("damage from a called save is the usual damage: Concentration is tested", () => {
  const s = game();
  ok(apply(s, { type: "cast", actor: "cleric", spell: "shield-of-faith", targets: ["fighter"], slot: 1 }, DM));
  assert.equal(s.effects.length, 1);
  const r = ok(call(s, { who: "cleric", dc: 40, damage: { dice: "1d4", type: "fire" } }));
  assert.ok(r.events.some((e) => e.type === "concentration" && e.id === "cleric" && e.dc === 10));
});

test("secret: a player sees the roll of their own creature but never the DC or the outcome, and nothing of a monster", () => {
  const s = game();
  const r = ok(call(s, { who: ["fighter", "rogue", "m1"], dc: 15, secret: true }));
  const seen = viewEvents(r.events, s, PAT).filter((e) => e.type === "save");
  assert.ok(seen.length >= 1);
  for (const e of seen) {
    assert.equal(e.dc, undefined);
    assert.equal(e.success, undefined);
    assert.notEqual(e.id, "m1");
  }
  assert.equal(seen.find((e) => e.id === "fighter").total, saves(r)[0].total);                              // their own roll
  // Not secret: the creature of theirs is told the lot; a foe, the outcome and the DC but not how it was rolled.
  const t = game();
  const r2 = ok(call(t, { who: ["fighter", "m1"], dc: 15 }));
  const open = viewEvents(r2.events, t, PAT).filter((e) => e.type === "save");
  assert.equal(open.find((e) => e.id === "fighter").dc, 15);
  const foe = open.find((e) => e.id === "m1");
  if (foe) assert.deepEqual(Object.keys(foe).sort(), ["abil", "called", "dc", "id", "success", "type"]);
});

test("only the DM calls a save or grants Advantage or Disadvantage; a refusal changes nothing", () => {
  const s = game();
  const was = JSON.stringify(s);
  no(call(s, {}, PAT), /Only the DM/);
  no(apply(s, { type: "check", actor: "fighter", skill: "athletics", adv: "advantage" }, PAT), /Only the DM/);
  no(apply(s, { type: "attack", actor: "fighter", target: "m1", attack: "javelin", adv: "advantage" }, PAT), /Only the DM/);
  no(apply(s, { type: "act", actor: "m1", action: "scimitar", target: "fighter", adv: "advantage" }, PAT), /./);
  no(call(s, { adv: "advantage" }, PAT), /Only the DM/);
  for (const bad of [{ dc: 0 }, { dc: 41 }, { dc: 1.5 }, { ability: "luck" }, { who: [] }, { who: ["fighter", "fighter"] }, { who: "nobody" }, { adv: "sure" },
    { damage: { dice: "lots", type: "fire" } }, { damage: { dice: "1d6", type: "mauve" } }, { damage: "1d6" }, { condition: "sleepy" }, { secret: "yes" }]) no(call(s, bad), /./);
  no(apply(s, { type: "check", actor: "fighter", skill: "athletics", adv: "sure" }, DM), /advantage/);
  assert.equal(JSON.stringify(s), was);
  const dead = game();
  dead.entities.m1.dead = true;
  const d0 = JSON.stringify(dead);
  no(call(dead, { who: ["fighter", "m1"] }), /dead/);
  assert.equal(JSON.stringify(dead), d0);                                                                    // the fighter did not roll first
});

test("adv on a check or a save: one source, and any Advantage with any Disadvantage is neither", () => {
  const run = (adv, setup = () => {}) => { const s = game(3); setup(s); return ok(apply(s, { type: "check", actor: "fighter", skill: "athletics", ...(adv ? { adv } : {}) }, DM)).events[0]; };
  const plain = run(null), a = run("advantage"), d = run("disadvantage");
  assert.equal(plain.rolls, undefined);
  assert.deepEqual([a.mode, d.mode], ["adv", "dis"]);
  assert.deepEqual([a.why, d.why], [["DM grants Advantage"], ["DM grants Disadvantage"]]);
  assert.equal(a.roll, Math.max(...a.rolls));
  assert.equal(d.roll, Math.min(...d.rolls));
  const poisoned = (s) => ok(apply(s, { type: "condition", actor: "fighter", condition: "poisoned", on: true }, DM));      // Disadvantage on checks of its own
  assert.equal(run(null, poisoned).mode, "dis");
  assert.equal(run("advantage", poisoned).rolls, undefined);                                                // cancelled: a plain roll
  assert.equal(run("disadvantage", poisoned).mode, "dis");                                                  // two of one kind are still one
  // A save.
  const sv = (adv) => saves(ok(call(game(3), { adv, dc: 10 })))[0];
  assert.deepEqual([sv("advantage").mode, sv("disadvantage").mode, sv(undefined).mode], ["adv", "dis", undefined]);
  const s2 = game(3); ok(apply(s2, { type: "condition", actor: "fighter", condition: "restrained", on: true }, DM));      // Disadvantage on Dexterity saves
  assert.equal(saves(ok(call(s2, { ability: "dex" })))[0].mode, "dis");
  assert.equal(saves(ok(call(s2, { ability: "dex", adv: "advantage" })))[0].mode, undefined);
});

test("adv on an attack: the attacker's roll only, combined with the rest; said when no attack roll was made", () => {
  const near = () => { const s = game(4); ok(apply(s, { type: "place", actor: "m1", to: { q: -5, r: 2 } }, DM)); ok(apply(s, { type: "startEncounter", center: { q: -6, r: 2 }, radius: 8 }, DM)); while (s.encounter.order[s.encounter.turn].id !== "fighter") ok(apply(s, { type: "endTurn", actor: s.encounter.order[s.encounter.turn].id }, DM)); return s; };
  const atk = (adv) => { const s = near(); const r = ok(apply(s, { type: "attack", actor: "fighter", target: "m1", attack: "longsword", ...(adv ? { adv } : {}) }, DM)); return r.events.find((e) => e.type === "attack"); };
  const [p, a, d] = [atk(null), atk("advantage"), atk("disadvantage")];
  assert.equal(p.mode, "normal");
  assert.deepEqual([a.mode, d.mode], ["adv", "dis"]);
  assert.deepEqual([a.why, d.why], [["DM grants Advantage"], ["DM grants Disadvantage"]]);
  // With a Disadvantage of its own (Poisoned), the DM's Advantage cancels it.
  const s = near(); ok(apply(s, { type: "condition", actor: "fighter", condition: "poisoned", on: true }, DM));
  const r = ok(apply(s, { type: "attack", actor: "fighter", target: "m1", attack: "longsword", adv: "advantage" }, DM));
  assert.equal(r.events.find((e) => e.type === "attack").mode, "normal");
  // The grant is the attacker's own: it is gone once the action ends.
  const t = near();
  ok(apply(t, { type: "attack", actor: "fighter", target: "m1", attack: "longsword", adv: "advantage" }, DM));
  assert.equal(ok(apply(t, { type: "check", actor: "fighter", skill: "athletics" }, DM)).events[0].rolls, undefined);
  // An attack that starts a fight is not rolled: the grant is not dropped quietly.
  const u = game(4); ok(apply(u, { type: "place", actor: "m1", to: { q: -5, r: 2 } }, DM));
  const start = ok(apply(u, { type: "attack", actor: "fighter", target: "m1", attack: "longsword", adv: "advantage" }, DM));
  if (!start.events.some((e) => e.type === "attack")) assert.ok(start.events.some((e) => e.type === "manual" && /DM grants Advantage/.test(e.name)));
});

test("the same game and the same calls give the same rolls, and the dice are the seed's", () => {
  const play = () => { const s = game(7); const r = ok(call(s, { who: ["fighter", "rogue", "m1", "m4"], ability: "wis", dc: 11, adv: "advantage", damage: { dice: "2d8", type: "cold", half: true }, condition: "frightened" })); return { s, r }; };
  const [x, y] = [play(), play()];
  assert.deepEqual(x.r.events, y.r.events);
  assert.deepEqual(x.s, y.s);
});
