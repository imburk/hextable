// Issue #425 (DEBT T55, found by #422): apply() puts the game back, byte for byte, after ANY throw that is not a rule refusal, from any
// handler or from the settle phase after it, and then throws the same error again. Before, only `act`, `cast` and the actions that might
// ask or be heavy kept a copy; any other handler that threw after it had changed something left the game half-changed.
//
// The throws are made without touching the engine: while one action runs, `Array.prototype.push` throws a plain Error when a handler
// pushes the first event of a given type (handlers push their events after they have changed the state, and the test checks that the
// state had changed by then); the settle phase is made to throw by an accessor on a creature (read by `gravity`) and on the settings
// (read by `look`) that throws only when the engine is in that function (read from the stack).
import { typed } from "./fixtures/typed.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current } from "../src/engine.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" }, KIM = { role: "player", userId: "kim" };
const json = (x) => JSON.stringify(x);
const ok = (r) => { assert.ok(r.ok, r.error); return r; };

// The wizard, the fighter, the rogue and the cleric, and one goblin (`g`), in a fight on the wizard's turn (or out of the fight).
function table({ fight = true } = {}) {
  const s = newGame(5);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  ok(apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM));
  const g = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 } }, DM)).events[0].id;
  if (fight) {
    ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
    for (let i = 0; i < 30 && current(s) !== "wizard"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    assert.equal(current(s), "wizard");
  }
  return { s, g };
}
const afterFight = () => { const t = table(); ok(apply(t.s, { type: "endEncounter" }, DM)); return t; };

// One case for each handler family: a table, an action that works on it, and the event the handler pushes after it has changed the state.
const CASES = [
  { family: "movement", name: "move", make: table, action: () => ({ type: "move", actor: "wizard", to: { q: -1, r: 0 } }), at: "moved" },
  { family: "movement", name: "dash", make: table, action: () => ({ type: "dash", actor: "wizard" }), at: "std" },
  { family: "attacks", name: "endTurn", make: table, action: () => ({ type: "endTurn", actor: "wizard" }), at: "turn" },
  { family: "attacks", name: "dodge", make: table, action: () => ({ type: "dodge", actor: "wizard" }), at: "std" },
  { family: "casting", name: "cast", make: table, action: ({ g }) => ({ type: "cast", actor: "wizard", spell: "fire-bolt", target: g }), at: "damage" },
  { family: "features", name: "secondWind", make: () => { const t = table(); typed(t.s, "fighter").hp = 3; for (let i = 0; i < 30 && current(t.s) !== "fighter"; i++) ok(apply(t.s, { type: "endTurn", actor: current(t.s) }, DM)); return t; }, action: () => ({ type: "secondWind", actor: "fighter" }), at: "heal" },
  { family: "characters", name: "setSpeed", make: table, action: () => ({ type: "setSpeed", actor: "wizard", mode: "walk", feet: 40 }), at: "speed" },
  { family: "rests", name: "shortRest", make: afterFight, action: () => ({ type: "shortRest" }), at: "rest" },
  { family: "rests", name: "advanceTime", make: afterFight, action: () => ({ type: "advanceTime", minutes: 30 }), at: "time" },
  { family: "dm", name: "harm", make: table, action: () => ({ type: "harm", actor: "wizard", amount: 2 }), at: "damage" },
  { family: "dm", name: "condition", make: table, action: () => ({ type: "condition", actor: "wizard", condition: "prone", on: true }), at: "cond" },
  { family: "dm", name: "setSetting", make: table, action: () => ({ type: "setting", key: "autoEngage", value: true }), at: null },
  { family: "companions", name: "bond", make: afterFight, action: ({ g }) => ({ type: "bond", actor: g, to: "wizard", kind: "familiar" }), at: "bonded" },
];

// Runs `fn` with `Array.prototype.push` set to throw a plain Error the first time an event of `type` is pushed (not onto the timeline).
// Gives { err, changed }: what was thrown, and whether the state was already different when it was.
function throwingAt(s, type, fn) {
  const real = Array.prototype.push, before = json(s), out = { err: null, changed: null, injected: null };
  Array.prototype.push = function (...items) {
    if (out.injected === null && this !== s.timeline && items.some((x) => x && x.type === type)) {
      out.injected = new Error(`injected at ${type}`);
      out.changed = json(s) !== before;
      throw out.injected;
    }
    return real.apply(this, items);
  };
  try { fn(); } catch (err) { out.err = err; } finally { Array.prototype.push = real; }
  return out;
}

// What an ordinary run of the same action does on a fresh table: the game after it, and its events.
function fresh(c) {
  const t = c.make(), r = apply(t.s, c.action(t), DM);
  assert.ok(r.ok, `${c.name}: ${r.error}`);
  return { state: json(t.s), events: json(r.events) };
}

for (const c of CASES.filter((x) => x.at)) {
  test(`${c.family}: ${c.name} that throws a plain Error after it changed the game leaves the game byte-identical, and throws it again`, () => {
    const t = c.make(), { s } = t, action = c.action(t);
    const before = json(s), hist = createHistory(), mk = mark(s);
    const out = throwingAt(s, c.at, () => apply(s, action, DM));
    assert.ok(out.injected, `the handler pushed a "${c.at}" event`);
    assert.equal(out.err, out.injected, "the very same error reaches the caller");
    assert.equal(out.changed, true, "the state had already been changed when it threw");
    assert.equal(json(s), before, "seed, timeline, history, pending question, effect stack: all as they were");
    assert.equal(s.stack, undefined);
    assert.equal(hist.dump().undos.length, 0, "a throw records nothing");
    void mk;
    // The next ordinary action works, and comes out exactly as on a table that never saw the throw (the dice included).
    const r = apply(s, action, DM);
    assert.ok(r.ok, r.error);
    const want = fresh(c);
    assert.equal(json(s), want.state);
    assert.equal(json(r.events), want.events);
  });
}

test("a throw is no step: undo and redo are exact around it", () => {
  const { s } = table();
  const h = createHistory(), start = json(s);
  const step = (a) => { const b = mark(s), r = ok(apply(s, a, DM)); h.record(b, s, describeStep(a, r.events, b, s)); };
  step({ type: "harm", actor: "wizard", amount: 2 });
  const one = json(s), dump = json(h.dump());
  const out = throwingAt(s, "cond", () => apply(s, { type: "condition", actor: "wizard", condition: "prone", on: true }, DM));
  assert.ok(out.err && out.changed);
  assert.equal(json(s), one);
  assert.equal(json(h.dump()), dump);
  h.undo(s); assert.equal(json(s), start);
  h.redo(s); assert.equal(json(s), one);
});

// ---------- the settle phase ----------
// An accessor that reads like a plain field, and throws only when the engine is inside the function named.
function trapIn(obj, key, fn) {
  let value = obj[key];
  Object.defineProperty(obj, key, { configurable: true, enumerable: true, get() { if (new RegExp(`at ${fn} \\(`).test(new Error().stack)) throw new Error(`settle ${fn}`); return value; }, set(v) { value = v; } });
}
for (const c of CASES) {
  for (const fn of ["gravity", "look"]) {
    test(`${c.family}: ${c.name} whose settle phase (${fn}) throws a plain Error leaves the game byte-identical, and throws it again`, () => {
      const t = c.make(), { s } = t, action = c.action(t);
      if (fn === "gravity") trapIn(s.entities[t.g], "pos", "gravity"); else trapIn(s.settings, "sight", "look");
      const before = json(s), tl = s.timeline.length;
      assert.throws(() => apply(s, action, DM), new RegExp(`^Error: settle ${fn}$`));
      assert.equal(json(s), before, "the handler's own changes are taken back too");
      assert.equal(s.timeline.length, tl);
      assert.equal(s.stack, undefined);
      // The accessor went with the copy it replaced: the game is plain again, and the same action now plays as on a fresh table.
      assert.ok(Object.getOwnPropertyDescriptor(fn === "gravity" ? s.entities[t.g] : s.settings, fn === "gravity" ? "pos" : "sight").hasOwnProperty("value"));
      const r = apply(s, action, DM);
      assert.ok(r.ok, r.error);
      const want = fresh(c);
      assert.equal(json(s), want.state);
      assert.equal(json(r.events), want.events);
    });
  }
}

test("a throw while the record is written takes back what was written, and the game", () => {
  const { s } = table();
  const before = json(s), tl = s.timeline.length;
  let n = 0;
  s.timeline.push = function (...a) { if (++n === 2) throw new Error("record boom"); return Array.prototype.push.apply(this, a); };
  assert.throws(() => apply(s, { type: "move", actor: "wizard", to: { q: -1, r: 0 } }, DM), /record boom/);
  assert.ok(n >= 2, "the first entry had been written");
  delete s.timeline.push;
  assert.equal(s.timeline.length, tl);
  assert.equal(json(s), before);
});

// ---------- what does not change ----------
test("a rule refusal is still a clean rejection with its message, and changes nothing", () => {
  const { s } = table();
  const before = json(s);
  assert.deepEqual(apply(s, { type: "harm", actor: "wizard", amount: 0 }, DM), { ok: false, error: "Damage must be a whole number above 0.", events: [] });
  assert.deepEqual(apply(s, { type: "move", actor: "nobody", to: { q: 0, r: 0 } }, DM), { ok: false, error: "No such creature.", events: [] });
  assert.equal(apply(s, { type: "nonsense" }, DM).error, "Unknown action: nonsense");
  assert.equal(apply(s, { type: "harm", actor: "wizard", amount: 2 }, { role: "player", userId: "pat" }).ok, false);
  assert.equal(json(s), before);
});

test("a throw while a question waits leaves the question waiting, byte for byte, and the answer still works", () => {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (!["wizard", "fighter", "m1"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.wizard.spells.push("shield");
  ok(apply(s, { type: "claim", entity: "wizard", user: "pat", userName: "Pat" }, PAT));
  ok(apply(s, { type: "claim", entity: "fighter", user: "kim", userName: "Kim" }, KIM));
  ok(apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "m1", to: { q: 1, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "fighter", to: { q: -3, r: 0 } }, DM));
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 500;
  ok(apply(s, { type: "reactions", actor: "wizard", set: { shield: "ask" } }, PAT));
  s.entities.m1.actions.find((a) => a.id === "scimitar").effects[0].bonus = 40;
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  for (let i = 0; i < 20 && current(s) !== "m1"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  s.encounter.budget.action = 1;
  const asked = ok(apply(s, { type: "act", actor: "m1", action: "scimitar", target: "wizard" }, DM));
  assert.deepEqual(asked.events.map((e) => e.type), ["reactionAsked"], "it still pauses");
  assert.ok(s.pending);
  const waiting = json(s);
  const out = throwingAt(s, "reaction", () => apply(s, { type: "react", prompt: s.pending.n, take: "shield" }, PAT));
  assert.ok(out.err && out.changed, "the answer threw after it spent the slot");
  assert.equal(json(s), waiting, "the question is still waiting, nothing else moved");
  const done = apply(s, { type: "react", prompt: s.pending.n, take: "shield" }, PAT);
  assert.ok(done.ok, done.error);
  assert.equal(s.pending, undefined);
  assert.equal(s.entities.wizard.slots[1], 1);
});
