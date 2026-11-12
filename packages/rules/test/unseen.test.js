// Seeing (task S5 of docs/specs/sight.md): canSee from line of sight, light, senses and conditions,
// and the SRD's Unseen Attackers and Targets, Blinded, Invisible, Dodge and close-combat rules.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, rollMode } from "../src/engine.js";
import * as H from "../src/hex.js";
import { newMap } from "../src/map.js";
import { modifiers } from "../src/modifiers.js";
import { newGame } from "../src/scenario.js";
import { canSee, sees } from "../src/sight.js";
import { PREGENS } from "../src/content/index.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const at = (q, r, z = 0) => ({ q, r, z });

function cave({ light = "dark", walls = [] } = {}) {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 12).map((h) => [H.col(h), { t: "stone" }]));
  const s = newGame(31);
  ok(apply(s, { type: "loadMap", map: newMap({ id: "c", name: "Cave", starts: [{ q: -10, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles, ...(light ? { light } : {}) }], walls }) }, DM));
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  for (const [id, q, r] of [["fighter", 0, 0], ["rogue", -10, 2], ["cleric", -10, 3], ["wizard", -9, 3]]) s.entities[id].pos = at(q, r);
  const add = (q, r, monster = "goblin-warrior") => s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id];
  return { s, add, f: s.entities.fighter };
}
const javelin = { type: "ranged", range: [30, 120], bonus: 5 }, sword = { type: "melee", reach: 5, bonus: 5 };
const mode = (s, a, t, atk) => { const m = rollMode(s, a, t, atk); return [m.mode, ...m.adv.map((x) => `+${x}`), ...m.dis.map((x) => `-${x}`)]; };
const give = (s, e, cond) => ok(apply(s, { type: "condition", actor: e.id, condition: cond }, DM));

test("attacking into darkness has Disadvantage, Darkvision removes it, and the unseen get Advantage", () => {
  const { s, add, f } = cave(), gob = add(3, 0);
  assert.deepEqual(f.senses, {});                                       // the pregens have no special senses
  assert.ok(Object.values(PREGENS).every((p) => !p.senses || !Object.keys(p.senses).length));
  assert.deepEqual(sees(s, f, gob), { see: "no", why: "dark" });
  assert.equal(canSee(s, gob, f), "dim");                              // Darkvision 60: darkness is dim for the goblin
  assert.deepEqual(mode(s, f, gob, javelin), ["dis", "-target in darkness"]);
  assert.deepEqual(mode(s, gob, f, sword), ["adv", "+attacker in darkness"]);
  // Darkvision on the fighter: she sees the goblin dimly, which does not change an attack roll.
  f.senses = { darkvision: 60 };
  assert.equal(canSee(s, f, gob), "dim");
  assert.deepEqual(mode(s, f, gob, javelin), ["normal"]);
  assert.deepEqual(mode(s, gob, f, sword), ["normal"]);
  // ...but only within its range.
  f.senses = { darkvision: 10 };
  assert.equal(canSee(s, f, gob), "no");
});

test("a torch lights the way: the bearer is seen, and sees what the light reaches", () => {
  const { s, add, f } = cave(), near = add(3, 0), mid = add(6, 0), far = add(10, 0);
  ok(apply(s, { type: "setLight", actor: "fighter", item: "torch" }, DM));
  assert.deepEqual([canSee(s, f, near), canSee(s, f, mid), canSee(s, f, far)], ["yes", "dim", "no"]);
  assert.deepEqual(mode(s, f, far, javelin), ["dis", "-long range", "-target in darkness"]);
  // The goblin far off, in the dark, sees the lit fighter plainly; so do goblins without Darkvision.
  far.senses = {};
  assert.equal(canSee(s, far, f), "yes");
  assert.deepEqual(mode(s, far, f, javelin), ["normal", "+attacker in darkness", "-long range"]);      // but she cannot see it
});

test("a curtain hides who is behind it: an attack through one is at a target out of sight", () => {
  const { s, add, f } = cave({ light: null, walls: [{ id: "c", level: "ground", a: [2.5, -100], b: [2.5, 100], kind: "curtain" }] }), gob = add(2, 0);
  assert.deepEqual(sees(s, f, gob), { see: "no", why: "out of sight" });
  const m = rollMode(s, f, gob, javelin);
  assert.deepEqual([m.mode, m.adv, m.dis], ["normal", ["attacker out of sight"], ["target out of sight"]]);      // each unseen by the other: they cancel
  // In the valley, in daylight, everyone sees everyone they have a line to.
  const v = newGame(3);
  assert.equal(canSee(v, v.entities.fighter, v.entities.m1), "yes");
  assert.deepEqual(mode(v, v.entities.fighter, v.entities.m1, javelin)[0], "dis");     // long range is still long range
});

test("Invisible: attacks against it have Disadvantage and its own Advantage, except against what can see it", () => {
  const { s, add, f } = cave({ light: null }), gob = add(1, 0);
  give(s, gob, "invisible");
  assert.deepEqual(sees(s, f, gob), { see: "no", why: "invisible" });
  assert.deepEqual(mode(s, f, gob, sword), ["dis", "-target invisible"]);
  assert.deepEqual(mode(s, gob, f, sword), ["adv", "+attacker invisible"]);
  for (const sense of [{ truesight: 30 }, { blindsight: 10 }]) {
    f.senses = sense;
    assert.equal(canSee(s, f, gob), "yes", JSON.stringify(sense));
    assert.deepEqual(mode(s, f, gob, sword), ["normal"]);
    assert.deepEqual(mode(s, gob, f, sword), ["normal"]);
  }
  f.senses = { blindsight: 10 };
  gob.pos = at(4, 0);                                                    // out of Blindsight's range
  assert.deepEqual(mode(s, f, gob, javelin), ["dis", "-target invisible"]);
  // Invisible still gives Advantage on Initiative, whoever is watching.
  assert.deepEqual(modifiers(s, gob, "initiative").advantage, ["attacker invisible"]);
});

test("Blinded: by the SRD its attack effects hold whatever the senses, and it sees nothing but by Blindsight", () => {
  const { s, add, f } = cave({ light: null }), gob = add(1, 0);
  give(s, f, "blinded");
  assert.deepEqual(sees(s, f, gob), { see: "no", why: "blinded" });
  assert.deepEqual(mode(s, f, gob, sword), ["dis", "-attacker blinded"]);            // once, from its own data
  assert.deepEqual(mode(s, gob, f, sword), ["adv", "+target blinded"]);
  f.senses = { blindsight: 10 };
  assert.equal(canSee(s, f, gob), "yes");
  assert.deepEqual(mode(s, f, gob, sword), ["dis", "-attacker blinded"]);
  // Blindsight does not see past total cover.
  const { s: t, add: add2 } = cave({ light: null, walls: [{ id: "w", level: "ground", a: [2.5, -100], b: [2.5, 100], kind: "wall" }] }), behind = add2(1, 0);
  t.entities.fighter.senses = { blindsight: 30 };
  assert.equal(canSee(t, t.entities.fighter, behind), "no");
});

test("Dodge gives Disadvantage only against an attacker the dodger can see, and not while Incapacitated (DEBT W5)", () => {
  const { s, add, f } = cave({ light: null }), gob = add(1, 0);
  ok(apply(s, { type: "startEncounter", center: at(0, 0), radius: 6 }, DM));
  while (current(s) !== "fighter") ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  ok(apply(s, { type: "dodge", actor: "fighter" }, DM));
  assert.deepEqual(mode(s, gob, f, sword), ["dis", "-target dodging"]);
  assert.deepEqual(modifiers(s, f, "save.dex", { target: f }, "").advantage, ["Dodging"]);
  give(s, gob, "invisible");
  assert.deepEqual(mode(s, gob, f, sword), ["adv", "+attacker invisible"]);             // she cannot see it: no Disadvantage from dodging
  ok(apply(s, { type: "condition", actor: gob.id, condition: "invisible", on: false }, DM));
  give(s, f, "stunned");
  assert.ok(!mode(s, gob, f, sword).includes("-target dodging"));
  assert.deepEqual(modifiers(s, f, "save.dex", { target: f }, "").advantage, []);
});

test("a ranged attack beside an enemy is at Disadvantage only if that enemy can see the archer (DEBT W4)", () => {
  const { s, add, f } = cave(), gob = add(1, 0), target = add(5, 0);
  ok(apply(s, { type: "setLight", actor: "fighter", item: "torch" }, DM));
  assert.ok(mode(s, f, target, javelin).includes("-enemy within 5 ft"));
  gob.senses = {};
  give(s, gob, "blinded");
  assert.ok(!mode(s, f, target, javelin).includes("-enemy within 5 ft"));
  // In darkness, an enemy beside the archer that cannot see in the dark does not count either.
  ok(apply(s, { type: "condition", actor: gob.id, condition: "blinded", on: false }, DM));
  ok(apply(s, { type: "setLight", actor: "fighter", item: null }, DM));
  f.senses = { darkvision: 60 };
  assert.ok(!mode(s, f, target, javelin).includes("-enemy within 5 ft"));
});

test("no Opportunity Attack from a creature that cannot see the one leaving", () => {
  const { s, add, f } = cave({ light: null }), gob = add(1, 0);
  ok(apply(s, { type: "startEncounter", center: at(0, 0), radius: 6 }, DM));
  while (current(s) !== "fighter") ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  give(s, gob, "blinded");
  const res = ok(apply(s, { type: "move", actor: "fighter", to: at(-3, 0) }, DM));
  assert.equal(res.events.some((e) => e.type === "attack"), false);
});
