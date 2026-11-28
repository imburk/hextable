// Legendary actions, stage L1b: the window between turns (docs/specs/legendary.md, Decisions 3 and 4, tests 1, 2, 3, 5 and 7).
// A taken turn is followed by a pause for a legendary creature that could act; `skip` and `done` close it; nothing else is accepted meanwhile.
import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTION_TYPES, apply, current } from "../src/engine.js";
import { BETWEEN_OK } from "../src/reactions.js";
import { BETWEEN_REFUSAL, offeredAfter } from "../src/engine/legendary.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { newGame } from "../src/scenario.js";
import { view } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const ok = (s, a, ctx = DM) => { const r = apply(s, a, ctx); assert.ok(r.ok, `${a.type}: ${r.error}`); return r; };
const types = (r) => r.events.map((e) => e.type);

// The party (fighter, rogue, cleric, wizard) and the adult green dragon "Verdigris" beside the fighter, a fight begun.
function dragonFight(seed = 5, { monster = "adult-green-dragon", fight = true } = {}) {
  const s = newGame(seed);
  ok(s, { type: "setting", key: "autoEngage", value: false });
  ok(s, { type: "setting", key: "legendaryWindows", value: true });
  const f = s.entities.fighter.pos;
  ok(s, { type: "spawn", monster, at: { q: f.q + 3, r: f.r }, name: "Verdigris" });
  const d = Object.values(s.entities).find((e) => e.name === "Verdigris");
  if (fight) ok(s, { type: "startEncounter", center: s.entities.fighter.pos });
  return { s, d };
}
const end = (s) => apply(s, { type: "endTurn", actor: current(s) }, DM);
const clear = (s, id) => { for (let i = 0; i < 20 && s.encounter?.between; i++) skip(s, id); };      // closing one can open the next, after a death save
const skip = (s, id) => apply(s, { type: "legendary", actor: id, skip: true }, DM);

test("2: a window after each other creature's turn, none after the dragon's own, none before the first turn", () => {
  const { s, d } = dragonFight();
  assert.equal(s.encounter.between, undefined, "no window before the first turn");
  const order = s.encounter.order.map((o) => o.id);
  const seen = [];
  for (let i = 0; i < order.length * 2; i++) {
    const who = current(s), r = end(s);
    assert.ok(r.ok, r.error);
    const opened = !!s.encounter.between;
    seen.push([who, opened]);
    assert.equal(opened, who !== d.id, `after ${who}'s turn`);
    if (opened) {
      assert.deepEqual(types(r).filter((t) => t === "legendaryWindow"), ["legendaryWindow"]);
      assert.equal(s.encounter.between.after, who);
      assert.deepEqual(s.encounter.between.offered, [d.id]);
      assert.equal(current(s), who, "the turn has not moved on");
      assert.ok(!r.events.some((e) => e.type === "turn"), "no next turn has begun");
      ok(s, { type: "legendary", actor: d.id, skip: true });
      assert.equal(s.encounter.between, undefined);
    } else assert.ok(r.events.some((e) => e.type === "turn"), "the dragon's turn ends and the next begins in the same action");
  }
  assert.ok(seen.some(([, o]) => o) && seen.some(([, o]) => !o));
});

test("2: the window after a round's last turn is before the round number moves", () => {
  const { s, d } = dragonFight();
  const last = s.encounter.order.at(-1).id;
  while (current(s) !== last) { end(s); if (s.encounter.between) ok(s, { type: "legendary", actor: d.id, skip: true }); }
  if (last === d.id) return;                            // the dragon last: no window after its own turn
  const round = s.encounter.round;
  const r = end(s);
  assert.ok(r.ok);
  assert.equal(s.encounter.round, round, "the round has not moved");
  assert.equal(s.encounter.between.round, round);
  ok(s, { type: "legendary", actor: d.id, skip: true });
  assert.equal(s.encounter.round, round + 1);
});

test("2: a dying character's death save is a turn taken; a turn played for one set aside is too; a held turn is not", () => {
  const a = dragonFight();
  const dying = a.s.encounter.order.map((o) => o.id).find((id) => id !== a.d.id && id !== current(a.s));
  ok(a.s, { type: "setHp", actor: dying, hp: 0 });
  let sawSave = false;
  const check = (r) => {
    if (!r.events.some((e) => e.type === "deathSave")) return;
    sawSave = true;
    assert.equal(a.s.encounter.between?.after, dying, "a window after the death save");
    assert.ok(!r.events.some((e) => e.type === "turn" && e.id !== dying && r.events.findIndex((x) => x.type === "deathSave") < r.events.indexOf(e)), "nobody's next turn has begun");
  };
  for (let i = 0; i < 12 && !sawSave; i++) {
    const r = end(a.s);
    assert.ok(r.ok, r.error);
    check(r);
    for (let k = 0; k < 20 && a.s.encounter.between; k++) { const q = skip(a.s, a.d.id); assert.ok(q.ok, q.error); check(q); }
  }
  assert.ok(sawSave, "the dying one rolled a death save");

  const b = dragonFight();
  const away = b.s.encounter.order.map((o) => o.id).find((id) => id !== b.d.id && id !== current(b.s));
  ok(b.s, { type: "stepAway", actor: away, how: "dodge" });
  for (let i = 0; i < 20 && b.s.encounter.between?.after !== away; i++) {
    const r = b.s.encounter.between ? skip(b.s, b.d.id) : end(b.s);
    assert.ok(r.ok, r.error);
  }
  assert.equal(b.s.encounter.between?.after, away, "a window after the turn played for the creature set aside");

  const c = dragonFight();
  const held = c.s.encounter.order.map((o) => o.id).find((id) => id !== c.d.id && id !== current(c.s));
  ok(c.s, { type: "stepAway", actor: held, how: "hold" });
  for (let i = 0; i < 12; i++) {
    const was = current(c.s), r = end(c.s);
    assert.ok(r.ok, r.error);
    while (c.s.encounter.between) { assert.notEqual(c.s.encounter.between.after, held, "no window after a held turn"); skip(c.s, c.d.id); }
    if (was === held) break;
  }
});

test("3: who is offered", () => {
  // Asked directly after the party's current creature: a dragon dead or down would end the fight, and these are the creatures' states, not a fight's.
  const offered = (s) => { const o = offeredAfter(s, s.encounter.order.map((x) => x.id).find((id) => id !== s.encounter.order.find((y) => s.entities[y.id].legendary)?.id)); return o.length ? o : null; };
  // Incapacitated
  let { s, d } = dragonFight();
  ok(s, { type: "condition", actor: d.id, condition: "stunned", on: true });
  assert.equal(offered(s), null, "a stunned dragon is not offered");
  // Down and dead
  ({ s, d } = dragonFight());
  s.entities[d.id].hp = 0;
  assert.equal(offered(s), null, "a dragon at 0 is not offered");
  ({ s, d } = dragonFight());
  s.entities[d.id].dead = true;
  assert.equal(offered(s), null, "a dead dragon is not offered");
  // Set aside
  ({ s, d } = dragonFight());
  s.entities[d.id].away = { how: "hold", by: "dm" };
  assert.equal(offered(s), null, "a set-aside dragon is not offered");
  // No use left
  ({ s, d } = dragonFight());
  ok(s, { type: "legendarySet", actor: d.id, set: { acts: 3 } });
  assert.equal(offered(s), null, "no use left");
  // Only options barred by `again`, or a spent breath, or nothing to aim at
  ({ s, d } = dragonFight());
  s.entities[d.id].legendary.actions.options = [{ id: "mind", name: "Mind", again: "nextTurn", manual: "x" }];
  s.entities[d.id].legend.again = { mind: true };
  assert.equal(offered(s), null, "its only option is barred by again");
  ({ s, d } = dragonFight());
  s.entities[d.id].legendary.actions.options = [{ id: "breath", name: "Breath", use: ["poison-breath"] }];
  s.entities[d.id].actions = [{ id: "poison-breath", name: "Poison Breath", recharge: [5, 6] }];
  s.entities[d.id].spent = { "poison-breath": true };
  assert.equal(offered(s), null, "a spent breath");
  ({ s, d } = dragonFight());
  s.entities[d.id].legendary.actions.options = [{ id: "rend", name: "Rend", use: [s.entities[d.id].actions[0].id] }];
  assert.deepEqual(offeredAfter(s, "fighter"), [d.id], "a foe to aim at");
  for (const e of Object.values(s.entities)) if (e.side === "party") e.dead = true;       // asked directly: ending the turn would end the fight
  assert.deepEqual(offeredAfter(s, "fighter"), [], "nothing to aim at");
  // A cost over the uses left
  ({ s, d } = dragonFight());
  s.entities[d.id].legendary.actions.options = [{ id: "big", name: "Big", cost: 3, manual: "x" }];
  ok(s, { type: "legendarySet", actor: d.id, set: { acts: 1 } });
  assert.equal(offered(s), null, "its option costs more than it has left");
  // And the plain case, with nothing in the way
  ({ s, d } = dragonFight());
  assert.deepEqual(offered(s), [d.id]);
});

test("3: with nobody offered the next turn starts in the same action, as it always did", () => {
  const { s, d } = dragonFight();
  ok(s, { type: "legendarySet", actor: d.id, set: { acts: 3 } });
  const who = current(s) === d.id ? (end(s), current(s)) : current(s);
  const r = apply(s, { type: "endTurn", actor: who }, DM);
  assert.ok(r.ok);
  assert.ok(r.events.some((e) => e.type === "turn"));
  assert.ok(!r.events.some((e) => e.type === "legendaryWindow"));
  assert.equal(s.encounter.between, undefined);
});

test("1: a fight with no legendary creature has no window and its state has no new key", () => {
  const s = newGame(5);
  ok(s, { type: "startEncounter", center: s.entities.fighter.pos });
  for (let i = 0; i < 12 && s.encounter; i++) {
    const r = end(s);
    assert.ok(r.ok, r.error);
    assert.ok(!r.events.some((e) => e.type === "legendaryWindow"));
    assert.ok(!s.encounter || !("between" in s.encounter));
  }
});

test("skip and done: validated, and a refusal changes nothing", () => {
  const { s, d } = dragonFight();
  const who = current(s) === d.id ? (end(s), current(s)) : current(s);
  const players = { role: "player", userId: "u1" };
  assert.match(apply(s, { type: "legendary", actor: d.id, skip: true }, DM).error, /No creature is choosing/, "no window yet");
  ok(s, { type: "endTurn", actor: who });
  assert.ok(s.encounter.between);
  const snap = JSON.stringify(s);
  const bad = (a, re, ctx = DM) => { const r = apply(s, a, ctx); assert.equal(r.ok, false); assert.match(r.error, re); assert.equal(JSON.stringify(s), snap, `${JSON.stringify(a)} changed something`); };
  bad({ type: "legendary", actor: d.id }, /Say what to do/);
  bad({ type: "legendary", actor: d.id, option: "no-such-option" }, /no legendary action called that/);       // taking an option is built in L1c (legendary-option.test.js)
  bad({ type: "legendary", actor: who, skip: true }, /not offered/);
  bad({ type: "legendary", done: true }, /Only the DM/, players);
  bad({ type: "legendary", actor: d.id, skip: true }, /isn't yours/, players);
  bad({ type: "legendary", actor: "nobody", skip: true }, /No such creature/);
  bad({ type: "legendary", done: "yes" }, /true or left out/);
  // done closes it, skipping whoever is left
  const r = ok(s, { type: "legendary", done: true });
  assert.deepEqual(types(r).slice(0, 2), ["legendarySkip", "turn"]);
  assert.equal(s.encounter.between, undefined);
});

test("legendarySet: the DM's counters, validated, nothing changed on a refusal", () => {
  const { s, d } = dragonFight(5, { fight: false });
  const snap = JSON.stringify(s);
  const bad = (a, re, ctx = DM) => { const r = apply(s, a, ctx); assert.equal(r.ok, false); assert.match(r.error, re); assert.equal(JSON.stringify(s), snap); };
  bad({ type: "legendarySet", actor: d.id, set: { acts: 1 } }, /Only the DM/, { role: "player", userId: "u1" });
  bad({ type: "legendarySet", actor: d.id, set: {} }, /Say what to set/);
  bad({ type: "legendarySet", actor: d.id, set: { nonsense: 1 } }, /not something to set/);
  bad({ type: "legendarySet", actor: d.id, set: { acts: 4 } }, /from 0 to 3/);
  bad({ type: "legendarySet", actor: d.id, set: { acts: 1.5 } }, /from 0 to 3/);
  bad({ type: "legendarySet", actor: d.id, set: { resisted: 4 } }, /from 0 to 3/);
  bad({ type: "legendarySet", actor: d.id, set: { lair: "yes" } }, /true or false/);
  bad({ type: "legendarySet", actor: "fighter", set: { acts: 1 } }, /no legendary/);
  const r = ok(s, { type: "legendarySet", actor: d.id, set: { lair: true, acts: 4, resisted: 4, show: true } });
  assert.deepEqual(types(r), ["legendarySet"]);
  assert.deepEqual(s.entities[d.id].legend, { acts: 4, resisted: 4, again: {}, lair: true, show: true });
});

test("5: between turns nothing else: every action type is tried, only BETWEEN_OK gets past the window", () => {
  const { s, d } = dragonFight();
  while (current(s) === d.id) end(s);
  ok(s, { type: "endTurn", actor: current(s) });
  assert.ok(s.encounter.between);
  assert.ok(ACTION_TYPES.length > 40);
  for (const type of BETWEEN_OK) assert.ok(ACTION_TYPES.includes(type), `${type} is an action`);
  for (const type of ACTION_TYPES) {
    if (BETWEEN_OK.has(type)) continue;
    const c = structuredClone(s), before = JSON.stringify(c);
    const r = apply(c, { type, actor: current(c), target: "rogue", to: { q: 0, r: 0 } }, DM);
    assert.equal(r.ok, false, `${type} was accepted in a window`);
    assert.equal(r.error, BETWEEN_REFUSAL, `${type}: ${r.error}`);
    assert.equal(JSON.stringify(c), before, `${type} changed the game`);
  }
  // a player's action is refused in the same words
  const r = apply(structuredClone(s), { type: "endTurn", actor: "fighter" }, { role: "player", userId: "u1" });
  assert.equal(r.error, BETWEEN_REFUSAL);
  // and what is allowed still works
  ok(s, { type: "harm", actor: "rogue", amount: 1 });
  ok(s, { type: "say", text: "hello" });
});

test("a fight ended in the window takes the window with it", () => {
  const { s } = dragonFight();
  while (!s.encounter.between) end(s);
  ok(s, { type: "endEncounter" });
  assert.equal(s.encounter, null);
});

test("7: undo of a skip reopens the window; undo of the endTurn goes back into that turn; redo gives the same state", () => {
  const { s, d } = dragonFight();
  while (current(s) === d.id) end(s);
  const h = createHistory();
  const act = (a) => { const before = mark(s), r = apply(s, a, DM); assert.ok(r.ok, r.error); h.record(before, s, describeStep(a, r.events, before, s)); return r; };
  const who = current(s), s0 = JSON.stringify(s);
  act({ type: "endTurn", actor: who });
  const s1 = JSON.stringify(s);
  assert.ok(s.encounter.between);
  act({ type: "legendary", actor: d.id, skip: true });
  const s2 = JSON.stringify(s);
  assert.equal(s.encounter.between, undefined);
  assert.notEqual(current(s), who);
  assert.deepEqual(h.list(), [`Skipped ${d.name}'s legendary action`, `${s.entities[who].name} ended their turn`]);
  h.undo(s);
  assert.equal(JSON.stringify(s), s1, "undo of the skip reopens the window as it was");
  assert.deepEqual(s.encounter.between.offered, [d.id]);
  h.undo(s);
  assert.equal(JSON.stringify(s), s0, "undo of the endTurn goes back into that turn");
  assert.equal(current(s), who);
  h.redo(s);
  assert.equal(JSON.stringify(s), s1);
  h.redo(s);
  assert.equal(JSON.stringify(s), s2, "redo gives the same state");
  // done, too
  act({ type: "endTurn", actor: current(s) });
  const t1 = JSON.stringify(s);
  if (s.encounter.between) {
    act({ type: "legendary", done: true });
    h.undo(s);
    assert.equal(JSON.stringify(s), t1);
  }
});

test("a player is sent only that the table waits (between: true), never for whom", () => {
  const { s, d } = dragonFight();
  while (current(s) === d.id) end(s);
  ok(s, { type: "endTurn", actor: current(s) });
  const v = view(s, { role: "player", userId: "u1" });
  assert.equal(v.encounter.between, true);
  assert.ok(!JSON.stringify(v).includes("offered"));
  ok(s, { type: "legendary", actor: d.id, skip: true });
  assert.ok(!("between" in view(s, { role: "player", userId: "u1" }).encounter));
});

test("an offered creature that the DM's tools drop, stun or kill leaves the window, and an empty window closes and the next turn begins", () => {
  const openOne = () => { const g = dragonFight(); while (current(g.s) === g.d.id) end(g.s); ok(g.s, { type: "endTurn", actor: current(g.s) }); assert.ok(g.s.encounter.between); return g; };
  for (const [name, act] of [["set to 0 Hit Points", (d) => ({ type: "setHp", actor: d, hp: 0 })], ["stunned", (d) => ({ type: "condition", actor: d, condition: "stunned", on: true })], ["paralyzed", (d) => ({ type: "condition", actor: d, condition: "paralyzed", on: true })]]) {
    const { s, d } = openOne(), after = s.encounter.between.after;
    const r = ok(s, act(d.id));
    if (name === "set to 0 Hit Points" && !s.encounter) continue;       // the last foe down ends the fight, and the window with it
    assert.equal(s.encounter.between, undefined, `${name}: the window is closed`);
    assert.ok(r.events.some((e) => e.type === "turn"), `${name}: the next turn began in the same action`);
    assert.notEqual(current(s), after);
  }
  // a creature of the window that is still there keeps it open
  const { s } = openOne();
  ok(s, { type: "harm", actor: "rogue", amount: 1 });
  assert.ok(s.encounter.between, "harm to someone else leaves the window");
});

test("a legendary creature the party does not know of is offered no window", () => {
  const { s, d } = dragonFight();
  while (current(s) === d.id) end(s);
  assert.deepEqual(offeredAfter(s, current(s)), [d.id]);
  s.entities[d.id].melded = true;
  assert.deepEqual(offeredAfter(s, current(s)), [], "melded into the stone: not known, not offered");
  const r = end(s);
  assert.ok(r.ok && !s.encounter.between && r.events.some((e) => e.type === "turn"), "the next turn starts in the same action");
});

test("with the table setting legendaryWindows off (the default) a dragon's fight has no window", () => {
  const { s, d } = dragonFight();
  assert.ok(offeredAfter(s, s.encounter.order.find((o) => o.id !== d.id).id).includes(d.id), "it could act");
  assert.equal(apply(s, { type: "setting", key: "legendaryWindows", value: false }, DM).ok, true);
  for (let i = 0; i < 8; i++) { const r = end(s); assert.ok(r.ok, r.error); assert.ok(!s.encounter.between); assert.ok(!r.events.some((e) => e.type === "legendaryWindow")); }
  assert.equal(newGame(5).settings.legendaryWindows, undefined, "absent in a new game: no state changes");
});

// ---------- L4b: on by default ----------
test("L4b: with both settings absent a window opens; set to false the fight plays as before (the state whole)", () => {
  const run = (value) => {
    const s = newGame(5);
    ok(s, { type: "setting", key: "autoEngage", value: false });
    if (value !== undefined) { ok(s, { type: "setting", key: "legendaryWindows", value }); ok(s, { type: "setting", key: "legendaryResistance", value }); }
    const f = s.entities.fighter.pos;
    ok(s, { type: "spawn", monster: "adult-green-dragon", at: { q: f.q + 3, r: f.r }, name: "Verdigris" });
    ok(s, { type: "startEncounter", center: s.entities.fighter.pos });
    return s;
  };
  const a = run(undefined), b = run(true);
  assert.equal(a.settings.legendaryWindows, undefined, "absent");
  const ra = end(a), rb = end(b);
  assert.ok(!!a.encounter.between, "a window opens with the setting absent");
  assert.deepEqual(types(ra), types(rb));
  assert.deepEqual(a.encounter.between, b.encounter.between);
  // false: no window, and the turn moves on as it did before L4.
  const off = run(false);
  assert.ok(end(off).ok);
  assert.equal(off.encounter.between, undefined);
});
