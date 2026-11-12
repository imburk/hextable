// Hiding (task S6 of docs/specs/sight.md): the SRD's Hide action, finding by Search and by
// passive Perception, what ends hiding, the monster AI, and what players are told.
import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep, aware } from "../src/ai.js";
import { apply, current, hideProblem, inFight, rollMode } from "../src/engine.js";
import * as H from "../src/hex.js";
import { newMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";
import { canSee } from "../src/sight.js";
import { view, viewEvents } from "../src/view.js";
import { edgeSegment } from "../src/walls.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const at = (q, r, z = 0) => ({ q, r, z });

// An open floor with a solid pillar at 2,0. Pip the rogue (Pat's) stands behind it at 1,0; a
// goblin at 6,0 has total cover from Pip. The rest of the party stands well back to the west.
function hall({ light = null, seed = 5 } = {}) {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 10).map((h) => [H.col(h), { t: "stone" }]));
  const walls = [0, 1, 2, 3, 4, 5].map((i) => { const [a, b] = edgeSegment({ q: 2, r: 0 }, i); return { id: `p${i}`, level: "ground", a, b, kind: "wall" }; });
  const s = newGame(seed);
  ok(apply(s, { type: "loadMap", map: newMap({ id: "h", name: "Hall", starts: [{ q: -8, r: 0 }], levels: [{ id: "ground", name: "G", z: 0, tiles, ...(light ? { light } : {}) }], walls }) }, DM));
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  apply(s, { type: "claim", entity: "rogue", user: "pat", userName: "Pat" }, PAT);
  for (const [id, q, r] of [["fighter", -6, 0], ["rogue", 1, 0], ["cleric", -8, 3], ["wizard", -7, 3]]) s.entities[id].pos = at(q, r);
  const add = (q, r, monster = "goblin-warrior") => s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id];
  return { s, add, pip: s.entities.rogue };
}
// Try to hide until it works (outside a fight a failed try costs nothing). Returns the events of the try that worked.
function hideNow(s, who, ctx = DM) {
  for (let i = 0; i < 40; i++) {
    const res = ok(apply(s, { type: "hide", actor: who.id }, ctx)), check = res.events.find((e) => e.type === "check");
    assert.equal(check.success, check.total >= 15);
    assert.equal(check.skill, "stealth");
    if (check.success) return res;
    assert.equal(who.hiding, undefined);
  }
  assert.fail("never hid");
}
const fightAs = (s, id) => { while (current(s) !== id) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); };
const knife = { type: "melee", reach: 5, bonus: 5 };

test("a rogue hides behind a pillar, steps out and attacks with Advantage, and is seen again", () => {
  const { s, add, pip } = hall(), gob = add(6, 0);
  assert.equal(hideProblem(s, pip), "");
  const res = hideNow(s, pip, PAT);
  assert.ok(pip.hiding.dc >= 15);
  assert.equal(pip.hiding.dc, res.events[0].total);                   // the check total is the DC to find it
  assert.deepEqual(viewEvents(res.events, s, PAT).map((e) => e.type), ["check", "hid"]);
  assert.equal(canSee(s, gob, pip), "no");
  // Still hidden after stepping out into the open: hiding lasts until it is found or gives itself away.
  ok(apply(s, { type: "place", actor: "rogue", to: at(5, 0) }, DM));
  assert.ok(pip.hiding);
  assert.deepEqual(rollMode(s, pip, gob, knife).adv, ["attacker hidden"]);
  assert.deepEqual(rollMode(s, gob, pip, knife).dis, ["target hidden"]);
  ok(apply(s, { type: "startEncounter", center: at(4, 0), radius: 6 }, DM));
  assert.ok(pip.hiding, "a fight starting does not find anyone");
  fightAs(s, "rogue");
  const atk = ok(apply(s, { type: "attack", actor: "rogue", target: gob.id, attack: pip.attacks.find((a) => a.type === "melee").id }, PAT));
  const types = atk.events.map((e) => e.type);
  assert.ok(types.indexOf("unhidden") < types.indexOf("attack"));
  assert.equal(atk.events.find((e) => e.type === "attack").mode, "adv");
  assert.deepEqual(atk.events.find((e) => e.type === "unhidden"), { type: "unhidden", id: "rogue", why: "attack" });
  assert.equal(pip.hiding, undefined);
});

test("Hide needs cover or darkness and no enemy that sees: the SRD's conditions", () => {
  const { s, add, pip } = hall(), gob = add(6, 0);
  pip.pos = at(3, 0);                                                  // in the open, in daylight
  assert.equal(hideProblem(s, pip), `${gob.name} can see Pip.`);
  assert.equal(apply(s, { type: "hide", actor: "rogue" }, PAT).error, `${gob.name} can see Pip.`);
  assert.equal(pip.hiding, undefined);
  // In darkness Pip cannot see the goblin, so cannot tell that it sees Pip by Darkvision: the
  // attempt is made, and the goblin finds Pip at once.
  const dark = hall({ light: "dark" }), g2 = dark.add(6, 0);
  dark.pip.pos = at(3, 0);
  assert.equal(hideProblem(dark.s, dark.pip), "");
  const spotted = hideNow(dark.s, dark.pip, PAT);
  assert.deepEqual(spotted.events.at(-1), { type: "unhidden", id: "rogue", why: "found", by: g2.id });
  assert.deepEqual(viewEvents(spotted.events, dark.s, PAT).at(-1), { type: "unhidden", id: "rogue", why: "found", by: g2.id });     // the room is revealed: they know of the goblin
  assert.equal(dark.pip.hiding, undefined);
  // Without Darkvision the goblin cannot: Pip is Heavily Obscured to it, and hides in the open.
  g2.senses = {};
  hideNow(dark.s, dark.pip, PAT);
  assert.ok(dark.pip.hiding);
  // Blinded but in daylight, the goblin cannot see Pip, yet Pip is neither in darkness nor behind cover.
  const { s: t, add: add2, pip: p2 } = hall(), g3 = add2(6, 0);
  ok(apply(t, { type: "condition", actor: g3.id, condition: "blinded" }, DM));
  p2.pos = at(3, 0);
  assert.equal(hideProblem(t, p2), `Pip is neither Heavily Obscured nor behind cover from ${g3.name}.`);
  assert.equal(apply(t, { type: "hide", actor: "rogue" }, PAT).error, `Pip is neither Heavily Obscured nor behind cover from ${g3.name}.`);
});

test("hiding in a fight takes the action, or the Bonus Action with Nimble Escape", () => {
  const { s, add, pip } = hall(), gob = add(6, 0);
  gob.pos = at(4, -3);                                                  // out in the open, north of the pillar
  ok(apply(s, { type: "startEncounter", center: at(3, 0), radius: 6 }, DM));
  fightAs(s, gob.id);
  assert.match(hideProblem(s, gob), /can see/);
  ok(apply(s, { type: "place", actor: gob.id, to: at(3, 0) }, DM));       // right behind the pillar from the whole party
  assert.equal(hideProblem(s, gob), "");
  const before = { ...s.encounter.budget };
  ok(apply(s, { type: "hide", actor: gob.id }, DM));
  assert.deepEqual([s.encounter.budget.action, s.encounter.budget.bonus], [before.action, before.bonus - 1]);
  if (!gob.hiding) assert.equal(apply(s, { type: "hide", actor: gob.id }, DM).error, `${gob.name} has already used a Bonus Action this turn.`);
  fightAs(s, "rogue");
  const b = { ...s.encounter.budget };
  ok(apply(s, { type: "hide", actor: "rogue" }, PAT));
  assert.deepEqual([s.encounter.budget.action, s.encounter.budget.bonus], [b.action - 1, b.bonus]);
});

test("a hiding goblin is not in any message to a player, and a guessed id answers as one that does not exist", () => {
  const { s, add } = hall();
  const gob = add(3, 0);
  s.entities.rogue.pos = at(-4, 0);
  const hid = hideNow(s, gob);                                          // the pillar is between it and the party
  assert.equal(view(s, PAT).entities[gob.id], undefined);
  assert.deepEqual(viewEvents(hid.events, s, PAT), []);
  const moved = ok(apply(s, { type: "move", actor: gob.id, to: at(4, 2) }, DM));
  const text = JSON.stringify([view(s, PAT), viewEvents(moved.events, s, PAT)]);
  assert.equal(text.includes(`"${gob.id}"`), false);
  assert.equal(text.includes("Goblin"), false);
  const real = apply(s, { type: "attack", actor: "rogue", target: gob.id, attack: "dagger" }, PAT), fake = apply(s, { type: "attack", actor: "rogue", target: "m404", attack: "dagger" }, PAT);
  assert.deepEqual(real, fake);
  assert.equal(real.error, "No such creature.");
  // Found later, the record still does not tell the players where it went while hidden.
  ok(apply(s, { type: "reveal", actor: gob.id, hidden: false }, DM));
  assert.ok(view(s, PAT).entities[gob.id]);
  const told = viewEvents(s.timeline, s, PAT);
  assert.deepEqual(told.filter((e) => [e.id, e.actor, e.target].includes(gob.id)).map((e) => e.why ? [e.type, e.why] : [e.type]), [["unhidden", "noise"], ["spawned"]]);       // (a creature is introduced first)
  assert.ok(s.timeline.some((e) => e.type === "hid" && e.id === gob.id), "the DM's record has it all");
  assert.equal(JSON.stringify(told).includes("unseen"), false);
});

test("a search finds a hiding goblin; it then counts for everyone", () => {
  const { s, add } = hall({ seed: 9 });
  const gob = add(3, 0);
  s.entities.rogue.pos = at(-4, 0);
  hideNow(s, gob);
  ok(apply(s, { type: "place", actor: gob.id, to: at(3, -3) }, DM));     // out from behind the pillar, still hidden
  gob.hiding.dc = 12;
  let res = null;
  for (let i = 0; i < 60 && gob.hiding; i++) {
    res = ok(apply(s, { type: "search", actor: "rogue" }, PAT));
    assert.equal(!gob.hiding, res.events.find((e) => e.type === "check").total >= 12);
  }
  assert.equal(gob.hiding, undefined, "found in the end");
  assert.deepEqual(res.events.find((e) => e.type === "unhidden"), { type: "unhidden", id: gob.id, why: "found", by: "rogue" });
  assert.equal(res.events.find((e) => e.type === "check").found, 1);
  const seen = viewEvents(res.events, s, PAT);
  assert.equal(seen[0].type, "unhidden");                               // it is introduced before anything else is said
  assert.ok(view(s, PAT).entities[gob.id]);
  // A search cannot find what the searcher could not see anyway: the pillar is in the way.
  const t = hall(), g2 = t.add(3, 0);
  t.s.entities.rogue.pos = at(-4, 0);
  hideNow(t.s, g2);
  ok(apply(t.s, { type: "place", actor: "rogue", to: at(1, 0) }, DM));
  g2.hiding.dc = 1;
  ok(apply(t.s, { type: "search", actor: "rogue" }, PAT));
  assert.ok(g2.hiding);
});

test("passive Perception finds a hider in view when the table rule says so, less 5 in Dim Light", () => {
  const { s, add } = hall(), gob = add(3, 0);
  s.entities.rogue.pos = at(-4, 0);
  hideNow(s, gob);
  ok(apply(s, { type: "place", actor: gob.id, to: at(3, -3) }, DM));     // out in the open, still hidden
  gob.hiding.dc = 99;
  ok(apply(s, { type: "setting", key: "passiveFind", value: "all" }, DM));
  ok(apply(s, { type: "move", actor: "fighter", to: at(-5, 0) }, DM));
  assert.ok(gob.hiding, "too well hidden");
  // The best passive Perception in the party (10 + Wisdom modifier + proficiency), exactly met.
  const pp = Math.max(...["fighter", "rogue", "cleric", "wizard"].map((id) => {
    const e = s.entities[id];
    return 10 + Math.floor((e.abil.wis - 10) / 2) + (e.skills.includes("perception") ? e.prof : 0);
  }));
  gob.hiding.dc = pp;
  ok(apply(s, { type: "setting", key: "passiveFind", value: "traps" }, DM));
  ok(apply(s, { type: "move", actor: "fighter", to: at(-6, 0) }, DM));
  assert.ok(gob.hiding, "the traps rule does not look for creatures");
  // In Dim Light the same score is 5 short.
  ok(apply(s, { type: "mapEdit", ops: [{ op: "level", level: { id: "ground", light: "dim" } }] }, DM));
  ok(apply(s, { type: "setting", key: "passiveFind", value: "all" }, DM));
  assert.ok(gob.hiding, "dim light: passive Perception is 5 less");
  const res = ok(apply(s, { type: "mapEdit", ops: [{ op: "level", level: { id: "ground", light: null } }] }, DM));
  assert.equal(gob.hiding, undefined);
  assert.equal(res.events.at(-1).type, "unhidden");
  assert.equal(res.events.at(-1).why, "found");
});

test("Blindsight and Truesight see a hider; Tremorsense knows where it is but does not see it", () => {
  const { s, add, pip } = hall(), gob = add(6, 0);
  hideNow(s, pip, PAT);
  ok(apply(s, { type: "place", actor: "rogue", to: at(5, 0) }, DM));
  gob.senses = { tremorsense: 30 };
  assert.equal(aware(s, gob, pip), true);
  assert.equal(canSee(s, gob, pip), "no");
  assert.deepEqual(rollMode(s, gob, pip, knife).dis, ["target hidden"]);
  gob.senses = {};
  assert.equal(aware(s, gob, pip), false);
  gob.senses = { truesight: 10 };
  assert.equal(canSee(s, gob, pip), "yes");
  gob.senses = { blindsight: 10 };
  assert.equal(canSee(s, gob, pip), "yes");
  const res = ok(apply(s, { type: "advanceTime", minutes: 1 }, DM));        // any action: whatever sees a hider has found it
  assert.equal(pip.hiding, undefined, "seen by Blindsight: found");
  assert.deepEqual(res.events.at(-1), { type: "unhidden", id: "rogue", why: "found", by: gob.id });
  // Found by something the players do not know of: they are told that, and not by what.
  gob.senses = {};
  ok(apply(s, { type: "place", actor: "rogue", to: at(1, 0) }, DM));
  hideNow(s, pip, PAT);
  ok(apply(s, { type: "place", actor: "rogue", to: at(5, 0) }, DM));
  ok(apply(s, { type: "reveal", actor: gob.id, hidden: true }, DM));
  gob.senses = { truesight: 10 };
  const unseen = ok(apply(s, { type: "advanceTime", minutes: 1 }, DM));
  assert.deepEqual(viewEvents(unseen.events, s, PAT).filter((e) => e.type === "unhidden"), [{ type: "unhidden", id: "rogue", why: "found" }]);
});

test("hiding ends with a spell that has a Verbal component, and with a noise the DM rules on", () => {
  const { s, add } = hall(), gob = add(6, 0), wiz = s.entities.wizard;
  wiz.pos = at(1, 0); s.entities.rogue.pos = at(-4, 2);
  hideNow(s, wiz);
  ok(apply(s, { type: "place", actor: "wizard", to: at(3, 0) }, DM));
  ok(apply(s, { type: "startEncounter", center: at(3, 0), radius: 6 }, DM));
  fightAs(s, "wizard");
  assert.ok(wiz.hiding);
  const cast = ok(apply(s, { type: "cast", actor: "wizard", spell: "fire-bolt", target: gob.id }, DM));
  assert.ok(cast.events.some((e) => e.type === "unhidden" && e.why === "spell"));
  // A noise: the DM's reveal action ends the Hide action's hiding too.
  wiz.pos = at(1, 0);
  if (s.encounter) ok(apply(s, { type: "endEncounter" }, DM));
  hideNow(s, wiz);
  assert.deepEqual(ok(apply(s, { type: "reveal", actor: "wizard", hidden: false }, DM)).events, [{ type: "unhidden", id: "wizard", why: "noise" }]);
  assert.equal(apply(s, { type: "reveal", actor: "wizard", hidden: false }, DM).error, "Isolde isn't hidden.".replace("Isolde", wiz.name));
});

test("walking onto a hiding creature's hex stops beside it and finds it", () => {
  const { s, add } = hall(), gob = add(3, 0);
  s.entities.rogue.pos = at(-4, 0);
  hideNow(s, gob);
  ok(apply(s, { type: "place", actor: gob.id, to: at(-2, 2) }, DM));
  const res = ok(apply(s, { type: "move", actor: "rogue", to: at(-2, 2) }, PAT));
  assert.equal(gob.hiding, undefined);
  assert.equal(H.dist(s.entities.rogue.pos, gob.pos), 1);
  assert.deepEqual(viewEvents(res.events, s, PAT).map((e) => e.type).slice(0, 2), ["unhidden", "moved"]);
});

test("a hiding creature rolls Initiative with Advantage and a walk past it starts no fight", () => {
  const { s, add } = hall(), gob = add(3, 0);
  s.entities.rogue.pos = at(-4, 0);
  hideNow(s, gob);
  ok(apply(s, { type: "setting", key: "autoEngage", value: true }, DM));
  ok(apply(s, { type: "place", actor: gob.id, to: at(-3, -3) }, DM));
  ok(apply(s, { type: "move", actor: "rogue", to: at(-4, -1) }, PAT));      // within 10 ft, in plain view, but it is hidden
  assert.equal(s.encounter, null);
  const start = ok(apply(s, { type: "startEncounter", center: at(-3, 0), radius: 6 }, DM));
  assert.ok(inFight(s, gob.id));
  assert.ok(gob.hiding);
  const order = start.events.find((e) => e.type === "encounterStart").order;
  assert.ok(order.some((o) => o.id === gob.id));
  assert.equal(viewEvents(start.events, s, PAT).find((e) => e.type === "encounterStart").order.some((o) => o.id === gob.id), false);
  assert.equal(view(s, PAT).encounter.order.some((o) => o.id === gob.id), false);
});

test("the monster AI ignores what it has not found, and a stealthy one opens by hiding", () => {
  const { s, add, pip } = hall(), gob = add(6, 0);
  hideNow(s, pip, PAT);
  for (const id of ["fighter", "cleric", "wizard"]) s.entities[id].pos = at(-9 + ["fighter", "cleric", "wizard"].indexOf(id), 5);
  ok(apply(s, { type: "place", actor: "rogue", to: at(5, 0) }, DM));       // right beside the goblin, hidden
  ok(apply(s, { type: "startEncounter", center: at(4, 0), radius: 4 }, DM));
  fightAs(s, gob.id);
  s.encounter.round = 2;                                                 // past its opening
  const step = aiStep(s, gob.id);
  assert.notEqual(step.target, "rogue");
  assert.equal(step.type, "endTurn");                                   // nobody it knows of is in the fight
  // A goblin (Stealth +6, Nimble Escape) in its first round, behind the pillar from everyone: it hides as a Bonus Action.
  const t = hall(), g2 = t.add(3, 0);
  t.s.entities.rogue.pos = at(-4, 0);
  ok(apply(t.s, { type: "startEncounter", center: at(0, 0), radius: 6 }, DM));
  fightAs(t.s, g2.id);
  assert.equal(t.s.encounter.round, 1);
  assert.deepEqual(aiStep(t.s, g2.id), { type: "hide", actor: g2.id });
  ok(apply(t.s, { type: "hide", actor: g2.id }, DM));
  assert.notEqual(aiStep(t.s, g2.id)?.type, "hide");                    // once only
  // Where it can be seen, it does not try.
  const u = hall(), g3 = u.add(3, -3);
  ok(apply(u.s, { type: "startEncounter", center: at(0, 0), radius: 6 }, DM));
  fightAs(u.s, g3.id);
  assert.notEqual(aiStep(u.s, g3.id)?.type, "hide");
});

test("in the valley, in daylight, nobody can hide and the AI plays as before", () => {
  const s = newGame(3);
  for (const id of ["m1", "m2", "m3"]) assert.match(hideProblem(s, s.entities[id]), /can see|neither/);
});
