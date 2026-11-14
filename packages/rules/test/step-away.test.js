// Stepping away during a fight (docs/specs/table-ui.md, "E20: stepping away"; issue #300, from the
// owner's first comment on #246): a creature set aside in the turn order by the DM or by its own
// player, the table rules `away` and `breaks`, and what is played for it. A table convenience: the
// SRD has no rule for delaying a turn.
import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import { apply, AWAY, awayHow, current, moveOptions, SETTING_TEXT, SETTINGS } from "../src/engine.js";
import * as H from "../src/hex.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { newGame } from "../src/scenario.js";
import { classify, view, viewEvents } from "../src/view.js";
import { migrate, VERSION } from "../src/migrate.js";
import { startEffect, turnKey } from "../src/durations.js";
import { turnInZones } from "../src/zones.js";
import { KIT } from "../src/engine/resolve.js";

const DM = { role: "dm", userId: "dm" }, PAT = { role: "player", userId: "pat" }, SAM = { role: "player", userId: "sam" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const ids = (s) => s.encounter.order.map((o) => o.id);

// Seed 1, everyone in the fight. The order is m6 m1 wizard m4 m3 fighter m5 cleric m2 rogue; Pat plays
// the wizard and the fighter, Sam the cleric and the rogue.
function fight(opts = {}, settings = {}) {
  const s = newGame(1, opts);
  for (const id of ["wizard", "fighter"]) { s.entities[id].owner = "pat"; s.entities[id].ownerName = "Pat"; }
  for (const id of ["cleric", "rogue"]) { s.entities[id].owner = "sam"; s.entities[id].ownerName = "Sam"; }
  for (const [key, value] of Object.entries(settings)) ok(apply(s, { type: "setting", key, value }, DM));
  ok(apply(s, { type: "startEncounter", center: s.entities.fighter.pos, radius: 30 }, DM));
  return s;
}
// End turns (as the DM's Skip turn does) until it is this creature's turn. Returns every event.
function until(s, id, cap = 40) {
  const all = [];
  for (let i = 0; i < cap && current(s) !== id; i++) all.push(...ok(apply(s, { type: "endTurn", actor: current(s) }, DM)).events);
  assert.equal(current(s), id);
  return all;
}
const skip = (s) => ok(apply(s, { type: "endTurn", actor: current(s) }, DM)).events;
// End turns until the next round starts. Returns every event.
function nextRound(s) {
  const r = s.encounter.round, all = [];
  for (let i = 0; i < 40 && s.encounter.round === r; i++) all.push(...skip(s));
  assert.equal(s.encounter.round, r + 1);
  return all;
}

test("the table rules: what is done with a turn set aside, and what a player's break does; words for each", () => {
  assert.deepEqual(AWAY, ["dodge", "end", "endKeep", "hold", "standIn"]);
  assert.deepEqual(SETTINGS.away, AWAY);
  assert.deepEqual(SETTINGS.breaks, ["on", "ask", "off"]);
  for (const k of ["away", "breaks"]) for (const v of SETTINGS[k]) assert.ok(SETTING_TEXT[k][v]?.length > 20, `${k}: ${v}`);
  const s = newGame(1);
  assert.equal(s.settings.away, undefined, "absent means the first: an old table needs no migration");
  assert.equal(apply(s, { type: "setting", key: "away", value: "hold" }, PAT).error, "Only the DM can change table settings.");
  assert.equal(apply(s, { type: "setting", key: "away", value: "skip" }, DM).error, "That setting can be: dodge, end, endKeep, hold, standIn.");
});

test("dodge (the default): on its turn a creature set aside takes the Dodge action, stays put, and the turn passes", () => {
  const s = fight();
  const r = ok(apply(s, { type: "stepAway", actor: "wizard" }, PAT));
  assert.deepEqual(s.entities.wizard.away, { how: "dodge", by: "player" });
  assert.deepEqual(r.events, [{ type: "away", id: "wizard", how: "dodge", by: "player" }]);
  const pos = { ...s.entities.wizard.pos };
  const ev = until(s, "m4");
  assert.ok(ev.some((e) => e.type === "turn" && e.id === "wizard"), "its turn starts");
  assert.ok(ev.some((e) => e.type === "std" && e.id === "wizard" && e.action === "Dodge"));
  assert.ok(ev.some((e) => e.type === "awayTurn" && e.id === "wizard" && e.how === "dodge"));
  assert.ok(s.entities.wizard.cond.dodging);
  assert.deepEqual(s.entities.wizard.pos, pos);
  assert.equal(s.encounter.round, 1);
  // Back: its next turn is its own again.
  ok(apply(s, { type: "stepBack", actor: "wizard" }, PAT));
  assert.equal(s.entities.wizard.away, undefined);
  until(s, "wizard");
  assert.equal(s.encounter.round, 2);
  assert.equal(s.encounter.budget.action, 1);
});

test("set aside on its own turn under dodge: the Dodge action if the action is left, and the turn ends", () => {
  const s = fight();
  until(s, "wizard");
  const r = ok(apply(s, { type: "stepAway", actor: "wizard" }, PAT));
  assert.equal(current(s), "m4");
  assert.ok(r.events.some((e) => e.type === "std" && e.action === "Dodge"));
  // With the action already spent there is no Dodge, but the turn still ends.
  const t = fight();
  until(t, "fighter");
  ok(apply(t, { type: "dodge", actor: "fighter" }, PAT));
  delete t.entities.fighter.cond.dodging;
  const r2 = ok(apply(t, { type: "stepAway", actor: "fighter" }, PAT));
  assert.ok(!r2.events.some((e) => e.type === "std" && e.action === "Dodge"));
  assert.equal(current(t), "m5");
});

test("end: the turn moves to the end of the round, is played there if back, and the place comes back next round", () => {
  const s = fight({}, { away: "end" });
  ok(apply(s, { type: "stepAway", actor: "fighter" }, PAT));
  const ev = until(s, "m5");
  assert.ok(!ev.some((e) => e.type === "turn" && e.id === "fighter"), "no turn where it stood");
  assert.ok(ev.some((e) => e.type === "turnMoved" && e.id === "fighter" && e.to === "end"));
  assert.deepEqual(ids(s), ["m6", "m1", "wizard", "m4", "m3", "m5", "cleric", "m2", "rogue", "fighter"]);
  ok(apply(s, { type: "stepBack", actor: "fighter" }, PAT));
  until(s, "fighter");
  assert.equal(s.encounter.round, 1, "its turn at the end of the same round");
  assert.equal(s.encounter.budget.action, 1, "a whole turn, played by its player");
  skip(s);
  assert.equal(s.encounter.round, 2);
  assert.deepEqual(ids(s), ["m6", "m1", "wizard", "m4", "m3", "fighter", "m5", "cleric", "m2", "rogue"], "its place again");
});

test("end, still away at the end of the round: it takes the Dodge action there; endKeep keeps the place at the end", () => {
  const s = fight({}, { away: "end" });
  ok(apply(s, { type: "stepAway", actor: "fighter" }, PAT));
  const ev = nextRound(s);
  assert.equal(current(s), "m6");
  assert.equal(ev.filter((e) => e.type === "turn" && e.id === "fighter").length, 1, "one turn in the round");
  assert.ok(ev.some((e) => e.type === "std" && e.id === "fighter" && e.action === "Dodge"));
  assert.equal(ids(s).indexOf("fighter"), 5, "its place back in round 2");

  const k = fight({}, { away: "endKeep" });
  ok(apply(k, { type: "stepAway", actor: "fighter" }, PAT));
  until(k, "m5");
  ok(apply(k, { type: "stepBack", actor: "fighter" }, PAT));
  until(k, "fighter");
  skip(k);
  assert.equal(k.encounter.round, 2);
  assert.equal(ids(k).at(-1), "fighter", "kept at the end");
  until(k, "fighter");
  assert.equal(k.encounter.round, 2);
  assert.equal(k.encounter.turn, 9);
});

test("end, set aside part-way through its own turn: the rest of that turn waits at the end of the round", () => {
  const s = fight({}, { away: "end" });
  until(s, "fighter");
  const spot = H.parse([...moveOptions(s, s.entities.fighter)].find(([, v]) => v.canStop && v.cost > 0)[0]);
  ok(apply(s, { type: "move", actor: "fighter", to: spot }, PAT));
  const left = s.encounter.budget.move;
  assert.ok(left < 30);
  ok(apply(s, { type: "stepAway", actor: "fighter" }, PAT));
  assert.equal(current(s), "m5", "the creature after it is next");
  ok(apply(s, { type: "stepBack", actor: "fighter" }, PAT));
  const ev = until(s, "fighter");
  assert.equal(s.encounter.round, 1);
  assert.equal(s.encounter.budget.move, left, "the same turn, not a fresh one");
  assert.ok(ev.some((e) => e.type === "awayTurn" && e.id === "fighter" && e.how === "resumed"));
  skip(s);
  assert.equal(s.encounter.round, 2);
  assert.equal(ids(s).indexOf("fighter"), 5);
});

test("hold: the turn passes untaken; back within the round, it is taken after the turn going on", () => {
  const s = fight({}, { away: "hold" });
  ok(apply(s, { type: "stepAway", actor: "wizard" }, PAT));
  const ev = until(s, "m4");
  assert.ok(!ev.some((e) => e.type === "turn" && e.id === "wizard"), "no turn, nothing started");
  assert.ok(ev.some((e) => e.type === "awayTurn" && e.id === "wizard" && e.how === "hold"));
  until(s, "fighter");
  const r = ok(apply(s, { type: "stepBack", actor: "wizard" }, PAT));
  assert.ok(r.events.some((e) => e.type === "turnMoved" && e.to === "next"));
  assert.equal(current(s), "fighter", "the turn going on is not taken away");
  skip(s);
  assert.equal(current(s), "wizard");
  assert.equal(s.encounter.round, 1);
  skip(s);
  assert.equal(current(s), "m5");
  nextRound(s);
  assert.equal(ids(s).indexOf("wizard"), 2, "its place again next round");
  // A turn held in an earlier round is gone.
  const t = fight({}, { away: "hold" });
  ok(apply(t, { type: "stepAway", actor: "wizard" }, PAT));
  nextRound(t);
  ok(apply(t, { type: "stepBack", actor: "wizard" }, PAT));
  assert.equal(skip(t).find((e) => e.type === "turn").id, "m1");
});

test("standIn: the turn starts as any does and waits; the monster AI can play it; the engine plays nothing", () => {
  const s = fight({}, { away: "standIn" });
  ok(apply(s, { type: "stepAway", actor: "wizard" }, DM));
  assert.deepEqual(s.entities.wizard.away, { how: "standIn", by: "dm" });
  const ev = until(s, "wizard");
  assert.ok(ev.some((e) => e.type === "awayTurn" && e.how === "standIn"));
  assert.equal(s.encounter.budget.action, 1, "nothing was done for it");
  assert.equal(awayHow(s, s.entities.wizard), "standIn");
  assert.ok(aiStep(s, "wizard"), "the AI has something to send for it");
});

test("nobody present: after a lap of turns played for those set aside, the next turn waits for the DM", () => {
  const s = fight();
  for (const id of ids(s)) ok(apply(s, { type: "stepAway", actor: id }, DM));
  const r = skip(s);
  assert.ok(s.encounter, "the fight goes on");
  assert.ok(r.filter((e) => e.type === "awayTurn").length <= ids(s).length);
  assert.equal(s.encounter.budget.action, 1, "a turn that waits");
});

test("who may: a player for their own, as `breaks` allows; the DM for anyone and how; one aside at a time", () => {
  const s = fight();
  assert.equal(apply(s, { type: "stepAway", actor: "cleric" }, PAT).error, `${s.entities.cleric.name} isn't yours to control.`);
  assert.equal(apply(s, { type: "stepAway", actor: "wizard", how: "hold" }, PAT).error, "Only the DM chooses what is done with the turns of someone set aside.");
  assert.equal(apply(s, { type: "stepAway", actor: "wizard", how: "nap" }, DM).error, "That can be: dodge, end, endKeep, hold, standIn.");
  ok(apply(s, { type: "stepAway", actor: "wizard" }, PAT));
  assert.equal(apply(s, { type: "stepAway", actor: "wizard" }, PAT).error, `${s.entities.wizard.name} is already set aside.`);
  ok(apply(s, { type: "stepAway", actor: "wizard", how: "hold" }, DM));
  assert.deepEqual(s.entities.wizard.away, { how: "hold", by: "player" }, "the DM changes how; the break is still the player's");
  assert.equal(apply(s, { type: "stepBack", actor: "fighter" }, PAT).error, `${s.entities.fighter.name} is not set aside.`);
  ok(apply(s, { type: "stepAway", actor: "m1" }, DM));
  ok(apply(s, { type: "stepBack", actor: "wizard" }, PAT));
  // `ask`: the press asks; nothing changes in the turns until the DM steps them aside.
  const a = fight({}, { breaks: "ask" });
  const r = ok(apply(a, { type: "stepAway", actor: "wizard" }, PAT));
  assert.deepEqual(r.events, [{ type: "away", id: "wizard", by: "player", asked: true }]);
  assert.equal(awayHow(a, a.entities.wizard), null);
  assert.equal(apply(a, { type: "stepAway", actor: "wizard" }, PAT).error, `${a.entities.wizard.name} has already asked to step away.`);
  until(a, "wizard");
  assert.equal(a.encounter.budget.action, 1, "asking is not stepping away");
  ok(apply(a, { type: "stepAway", actor: "wizard" }, DM));
  assert.equal(current(a), "m4", "granted on its turn: the Dodge, and the turn passes");
  // `off`: only the DM.
  const o = fight({}, { breaks: "off" });
  assert.equal(apply(o, { type: "stepAway", actor: "wizard" }, PAT).error, "At this table only the DM sets a character aside.");
  ok(apply(o, { type: "stepAway", actor: "wizard" }, DM));
  assert.deepEqual(o.entities.wizard.away, { how: "dodge", by: "dm" });
  assert.equal(apply(o, { type: "stepBack", actor: "wizard" }, PAT).error, `The DM set ${o.entities.wizard.name} aside; only the DM can bring them back.`);
  ok(apply(o, { type: "stepBack", actor: "wizard" }, DM));
  // Granted on request, the break is the player's: they come back by themselves.
  ok(apply(a, { type: "stepBack", actor: "wizard" }, PAT));
});

test("only in a fight, and the end of the fight brings everyone back", () => {
  const s = newGame(1);
  s.entities.wizard.owner = "pat";
  assert.equal(apply(s, { type: "stepAway", actor: "wizard" }, PAT).error, `${s.entities.wizard.name} can be set aside only in a fight.`);
  assert.equal(apply(s, { type: "stepAway", actor: "wizard" }, DM).error, `${s.entities.wizard.name} can be set aside only in a fight.`);
  const f = fight({}, { breaks: "ask" });
  ok(apply(f, { type: "stepAway", actor: "wizard" }, PAT));
  ok(apply(f, { type: "stepAway", actor: "m1" }, DM));
  const r = ok(apply(f, { type: "endEncounter" }, DM));
  assert.equal(f.entities.wizard.away, undefined, "a request too");
  assert.equal(f.entities.m1.away, undefined);
  assert.deepEqual(viewEvents(r.events, f, PAT).filter((e) => e.type === "back"), [{ type: "back", id: "wizard", why: "fightOver" }]);
  ok(apply(f, { type: "startEncounter", center: f.entities.fighter.pos, radius: 30 }, DM));
  assert.ok(Object.values(f.entities).every((e) => !e.away), "the next fight starts with nobody aside");
});

test("players are told of their party's stepping away, and nothing of a foe the DM sets aside", () => {
  const s = fight({}, { away: "end" });
  // A party creature: the whole table is told.
  const mine = ok(apply(s, { type: "stepAway", actor: "wizard" }, PAT)).events;
  assert.deepEqual(viewEvents(mine, s, SAM), mine);
  assert.deepEqual(view(s, SAM).entities.wizard.away, { how: "end", by: "player" });
  // A foe they can see: no event, no field, no bookkeeping in the encounter.
  const foe = ok(apply(s, { type: "stepAway", actor: "m4" }, DM)).events;
  assert.deepEqual(viewEvents(foe, s, SAM), []);
  const ev = until(s, "m3");
  const seen = viewEvents(ev, s, SAM);
  assert.ok(!seen.some((e) => e.id === "m4" && ["away", "awayTurn", "turnMoved"].includes(e.type)));
  assert.ok(seen.some((e) => e.type === "turnMoved" && e.id === "wizard"), "their own is told");
  const v = view(s, SAM);
  assert.equal(v.entities.m4.away, undefined);
  assert.deepEqual(Object.keys(v.encounter).sort(), ["arena", "budget", "center", "flags", "id", "order", "radius", "round", "turn"]);
  assert.deepEqual(Object.keys(v.encounter.order[0]).sort(), ["id"]);
  // Undo's words: the DM's say who; players are told only that the order changed.
  const before = mark(s), r = ok(apply(s, { type: "stepAway", actor: "m5" }, DM)), step = describeStep({ type: "stepAway", actor: "m5" }, r.events, before, s);
  assert.equal(step.label, `${s.entities.m5.name} was set aside`);
  assert.ok(step.shown === null || step.shown === "The turn order was changed");
  const b2 = mark(s), r2 = ok(apply(s, { type: "stepBack", actor: "wizard" }, PAT));
  assert.deepEqual(describeStep({ type: "stepBack", actor: "wizard" }, r2.events, b2, s), { label: `${s.entities.wizard.name} came back`, shown: `${s.entities.wizard.name} came back` });
});

test("a creature hidden from the party set aside by the DM: no event, no name, no slot moved by an event", () => {
  const s = fight({}, { away: "end" });
  s.entities.m5.hiding = true;                                   // hiding from the party: unknown to them
  const r = ok(apply(s, { type: "stepAway", actor: "m5" }, DM));
  assert.deepEqual(viewEvents(r.events, s, PAT), []);
  const before = mark(s);
  const ev = until(s, "cleric");
  assert.ok(!viewEvents(ev, s, PAT).some((e) => e.id === "m5" || e.type === "turnMoved"));
  assert.ok(!JSON.stringify(view(s, PAT)).includes('"m5"'));
  const step = describeStep({ type: "stepAway", actor: "m5" }, r.events, before, s);
  assert.equal(step.shown, null);
});

test("recorded and undoable, and the same actions replay the same", () => {
  const play = () => {
    const s = fight({}, { away: "end" }), h = createHistory();
    const act = (a, ctx = DM) => { const b = mark(s); const r = ok(apply(s, a, ctx)); h.record(b, s, describeStep(a, r.events, b, s)); };
    const start = JSON.stringify(s);
    act({ type: "stepAway", actor: "fighter" }, PAT);
    for (let i = 0; i < 12; i++) act({ type: "endTurn", actor: current(s) });
    act({ type: "stepBack", actor: "fighter" }, PAT);
    for (let i = 0; i < 5; i++) act({ type: "endTurn", actor: current(s) });
    return { s, h, start };
  };
  const a = play(), b = play();
  assert.equal(JSON.stringify(a.s), JSON.stringify(b.s));
  assert.ok(a.s.timeline.some((e) => e.type === "away"));
  while (a.h.undo(a.s));
  assert.equal(JSON.stringify(a.s), a.start);
});

test("the same on a square map", () => {
  const s = newGame(1, { grid: "square" });
  s.entities.wizard.owner = "pat";
  ok(apply(s, { type: "startEncounter", center: s.entities.fighter.pos, radius: 30 }, DM));
  ok(apply(s, { type: "stepAway", actor: "wizard" }, PAT));
  const pos = { ...s.entities.wizard.pos };
  const order = ids(s), next = order[(order.indexOf("wizard") + 1) % order.length];
  const ev = until(s, next);
  assert.ok(ev.some((e) => e.type === "std" && e.id === "wizard" && e.action === "Dodge"));
  assert.deepEqual(s.entities.wizard.pos, pos);
});

// A turn is named by its fight, round and creature (turnKey), not by its place in the order, so a
// turn moved or resumed keeps its name and what was made in it ends when it should (review of #306).
const blind = (s, source, target, on) => {
  const fx = startEffect(s, { name: "Test", source, duration: "1 minute" });
  fx.parts.push({ target, cond: "blinded", ends: { on, of: "source" }, born: turnKey(s) });
  s.entities[target].cond.blinded = true;
  return fx;
};
const lasts = (s, fx) => !fx.parts[0].ended;
for (const grid of ["hex", "square"]) {
  const opts = grid === "square" ? { grid } : {};
  // The order on squares differs: work from whatever it is.
  const later = (s, id) => { const o = ids(s), i = o.indexOf(id); return o.slice(i + 1).find((x) => s.entities[x].side === "party" && x !== id); };

  test(`an effect lasting to the end of its source's next turn, across a turn resumed at the end of the round (end, endKeep; ${grid})`, () => {
    for (const how of ["end", "endKeep"]) {
      const s = fight(opts);
      until(s, "fighter");
      const key = turnKey(s), fx = blind(s, "fighter", "m1", "turnEnd");
      ok(apply(s, { type: "stepAway", actor: "fighter", how }, DM));
      assert.notEqual(turnKey(s), key, "the next creature's turn has a name of its own");
      ok(apply(s, { type: "stepBack", actor: "fighter" }, DM));
      until(s, "fighter");
      assert.equal(turnKey(s), key, "the same turn, the same name");
      skip(s);
      assert.ok(lasts(s, fx), "not ended by the end of the turn it was made in");
      until(s, "fighter");
      skip(s);
      assert.ok(!lasts(s, fx), "ended at the end of the next one");
    }
  });

  test(`an effect lasting to the end of the turn going on, when a held turn is put after it (hold; ${grid})`, () => {
    const s = fight(opts, { away: "hold" });
    const held = ids(s).find((x) => s.entities[x].side === "party"), next = later(s, held);
    ok(apply(s, { type: "stepAway", actor: held }, DM));
    until(s, next);
    const key = turnKey(s), fx = blind(s, next, "m1", "turnEnd"), start = blind(s, next, "m2", "turnStart");
    ok(apply(s, { type: "stepBack", actor: held }, DM));
    assert.equal(turnKey(s), key, "the turn going on keeps its name when a place before it moves");
    skip(s);
    assert.equal(current(s), held);
    assert.ok(lasts(s, fx) && lasts(s, start));
    until(s, next);
    assert.ok(!lasts(s, start), "ended at the start of its source's next turn");
    skip(s);
    assert.ok(!lasts(s, fx), "ended at the end of it");
  });

  test(`a stand-in's turn and a dodged turn are ordinary turns for what lasts (standIn, dodge; ${grid})`, () => {
    for (const how of ["standIn", "dodge"]) {
      const s = fight(opts);
      until(s, "fighter");
      const fx = blind(s, "fighter", "m1", "turnEnd"), start = blind(s, "fighter", "m2", "turnStart");
      ok(apply(s, { type: "stepAway", actor: "fighter", how }, DM));
      if (how === "standIn") skip(s);
      assert.ok(lasts(s, fx) && lasts(s, start), how);
      until(s, ids(s)[0]);
      for (let i = 0; i < 20 && lasts(s, fx); i++) skip(s);
      assert.ok(!lasts(s, start) && !lasts(s, fx), how);
      assert.equal(s.encounter.round, 2, "within its next turn");
    }
  });

  test(`a zone works once a turn on a creature, also when the turn's place moves (${grid})`, () => {
    const s = fight(opts, { away: "hold" });
    const held = ids(s).find((x) => s.entities[x].side === "party"), next = later(s, held);
    ok(apply(s, { type: "stepAway", actor: held }, DM));
    until(s, next);
    const fx = startEffect(s, { name: "Test zone", source: next, duration: "1 minute" });
    fx.zone = { area: { shape: "emanation", size: 300 }, on: ["turnEnd"], once: "turn", follows: next, spare: [], steps: [], src: {}, last: {} };
    const ev = [];
    turnInZones(s, ev, KIT, s.entities.m1, "turnEnd");
    ok(apply(s, { type: "stepBack", actor: held }, DM));
    turnInZones(s, ev, KIT, s.entities.m1, "turnEnd");
    assert.equal(ev.filter((e) => e.type === "zone").length, 1, "the same turn: once");
    skip(s);
    turnInZones(s, ev, KIT, s.entities.m1, "turnEnd");
    assert.equal(ev.filter((e) => e.type === "zone").length, 2, "the held creature's turn is another turn");
  });
}

// ---- review of #306, second round: turn stamps are never sent, and stamps from before version 22 ----

test("players are sent no turn stamp and no id of a creature they do not know of, under rooms, los and light", () => {
  for (const sight of ["rooms", "los", "light"]) for (const how of ["hidden", "hiding"]) {
    const s = fight({}, { sight });
    const g = s.entities.m1;
    until(s, "m1");
    if (how === "hidden") g.hidden = true; else g.hiding = true;
    assert.equal(classify(s, "m1"), "hidden", `${sight} ${how}`);
    // In its turn it marks the wizard: a part stamped with this turn, a modifier against it, a condition from it.
    const fx = startEffect(s, { name: "Mark", source: "m1", duration: "1 minute" });
    fx.parts.push({ target: "wizard", modifier: { on: "attack.received", op: "advantage" }, against: "m1", ends: { on: "turnEnd", of: "source" }, born: turnKey(s) });
    s.entities.wizard.cond.frightened = { source: "m1", effect: fx.id };
    const v = view(s, PAT), text = JSON.stringify({ ...v, map: null });
    assert.ok(!text.includes('"m1"'), `${sight} ${how}: ${text.match(/.{60}"m1".{20}/)?.[0]}`);
    assert.ok(!text.includes("born"), `${sight} ${how}`);
    assert.equal(v.entities.wizard.cond.frightened.source, "someone");
    assert.equal(v.effects.find((x) => x.id === fx.id).parts[0].against, "someone");
    const ev = skip(s);
    assert.ok(!JSON.stringify(viewEvents(ev, s, PAT)).includes('"m1"'), `${sight} ${how}: events`);
  }
  // A creature they know of is named as before.
  const s = fight();
  const fx = startEffect(s, { name: "Mark", source: "m1", duration: "1 minute" });
  fx.parts.push({ target: "wizard", modifier: { on: "attack.received", op: "advantage" }, against: "m1", born: turnKey(s) });
  assert.equal(view(s, PAT).effects.find((x) => x.id === fx.id).parts[0].against, "m1");
});

// A fight saved at version 21: the cleric's turn (place 7 in the order) is going on; a part made in it lasts
// to the end of the cleric's next turn, and a zone has worked on the rogue in it. Stamps name the place.
function oldTable() {
  const s = fight();
  until(s, "cleric");
  const enc = s.encounter, old = `${enc.id}:${enc.round}:${enc.turn}`;
  assert.equal(enc.turn, 7);
  const fx = startEffect(s, { name: "Bolt", source: "cleric", duration: "1 minute" });
  fx.parts.push({ target: "m2", cond: "blinded", ends: { on: "turnEnd", of: "source" }, born: old });
  s.entities.m2.cond.blinded = {};
  const z = startEffect(s, { name: "Zone", source: "cleric", duration: "1 minute" });
  z.zone = { area: { shape: "emanation", size: 300 }, on: ["turnEnd"], once: "turn", follows: "cleric", spare: [], steps: [], src: {}, last: { rogue: old, m1: `${enc.id}:${enc.round}:0` } };
  s.version = 21;
  return { s: JSON.parse(JSON.stringify(s)), old, fx: fx.id, z: z.id };
}
const partOf = (s, id) => s.effects.find((x) => x.id === id)?.parts[0];
const over = (s, id) => !partOf(s, id) || partOf(s, id).ended;

test("version 22: a table saved before has its turn stamps named by creature, and plays through the round", () => {
  const { s, fx, z } = oldTable();
  migrate(s);
  assert.equal(s.version, VERSION); assert.equal(VERSION, 22);
  const enc = s.encounter;
  assert.equal(partOf(s, fx).born, `${enc.id}:1:cleric`);
  assert.deepEqual(s.effects.find((x) => x.id === z).zone.last, { rogue: `${enc.id}:1:cleric`, m1: `${enc.id}:1:m6` });
  migrate(s);
  assert.equal(partOf(s, fx).born, `${enc.id}:1:cleric`, "safe to run again");
  const ev = [];
  turnInZones(s, ev, KIT, s.entities.rogue, "turnEnd");
  assert.equal(ev.length, 0, "the zone has worked on the rogue this turn already");
  skip(s);
  assert.ok(!over(s, fx), "not ended by the end of the turn it was made in");
  until(s, "cleric");
  assert.equal(enc.round, 2);
  skip(s);
  assert.ok(over(s, fx), "ended at the end of the cleric's next turn");
  // And the table goes on playing, monsters and all.
  for (let i = 0; i < 60 && s.encounter; i++) {
    const id = current(s), a = s.entities[id].side === "party" ? null : aiStep(s, id);
    if (!a || !apply(s, a, DM).ok) apply(s, { type: "endTurn", actor: current(s) }, DM);
  }
});

test("a stamp in the old form that comes back unmigrated (an undo step, a copy kept from before) still works", () => {
  const { s, fx, z } = oldTable();
  s.version = VERSION;                                       // as if an undo had put back a part of the state from before
  const ev = [];
  turnInZones(s, ev, KIT, s.entities.rogue, "turnEnd");
  assert.equal(ev.length, 0, "once a turn, by the old stamp");
  skip(s);
  assert.ok(!over(s, fx));
  until(s, "cleric");
  skip(s);
  assert.ok(over(s, fx));
  assert.ok(s.effects.find((x) => x.id === z));
});

test("undo across the update is exact: a step taken on an old-form stamp undoes to it byte for byte, and plays the same again", () => {
  const { s, fx } = oldTable();
  s.version = VERSION;
  const h = createHistory(), start = JSON.stringify(s);
  const act = (a) => { const b = mark(s); const r = ok(apply(s, a, DM)); h.record(b, s, describeStep(a, r.events, b, s)); };
  act({ type: "stepAway", actor: "cleric", how: "end" });
  act({ type: "stepBack", actor: "cleric" });
  for (let i = 0; i < 4; i++) act({ type: "endTurn", actor: current(s) });
  const end = JSON.stringify(s);
  while (h.undo(s));
  assert.equal(JSON.stringify(s), start);
  assert.equal(partOf(s, fx).born.split(":")[2], "7", "the old stamp is back as it was");
  while (h.redo(s));
  assert.equal(JSON.stringify(s), end);
  // The cleric's turn, resumed at the end of round 1, ended within those steps: it was the turn the part was
  // made in, so the part lasted past it (the old stamp was named by creature before the place moved).
  assert.equal(s.encounter.round, 2);
  assert.ok(!over(s, fx), "the old stamp is read as the cleric's turn wherever its place went");
  until(s, "cleric");
  skip(s);
  assert.ok(over(s, fx), "and it ends at the end of the next one");
});
