// Legendary Resistance, stage L2a (docs/specs/legendary.md, Decisions 6, 7 and 9; tests 8, 10, 11 and 12). Built a part at a time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apply } from "../src/engine.js";
import { failureMatters, resistFailure } from "../src/engine/rolls.js";
import { RESISTANCE } from "../src/reactions.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (s, a, ctx = DM) => { const r = apply(s, a, ctx); assert.ok(r.ok, `${a.type}: ${r.error}`); return r; };
const clone = (s) => structuredClone(s);

// A game with an adult green dragon "Verdigris" (3 uses of Legendary Resistance a day, immune to poison) and the party, no fight; `on`: the table setting.
function game({ on = true, monster = "adult-green-dragon" } = {}) {
  const s = newGame(5);
  const f = s.entities.fighter.pos;
  ok(s, { type: "spawn", monster, at: { q: f.q + 3, r: f.r }, name: "Verdigris" });
  if (on) ok(s, { type: "setting", key: "legendaryResistance", value: true });
  const d = Object.values(s.entities).find((e) => e.name === "Verdigris");
  return { s, d };
}
const failed = () => ({ roll: 3, total: 3, success: false, dice: [3], bonus: 0 });

test("1: the setting is off by default and the DM turns it on", () => {
  const { s: a } = game({ on: false });
  assert.notEqual(a.settings?.legendaryResistance, true);
  const { s: b } = game();
  assert.equal(b.settings.legendaryResistance, true);
  const r = apply(b, { type: "setting", key: "legendaryResistance", value: "yes" }, DM);
  assert.equal(r.ok, false);
});

test("1: with the setting off, resistFailure returns at once and changes nothing", () => {
  const { s, d } = game({ on: false });
  ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "always" } });
  const before = clone(s), sv = failed(), ev = [], evt = { type: "save" };
  assert.equal(resistFailure(s, d, sv, { matters: true }, ev, evt), false);
  assert.deepStrictEqual(s, before);
  assert.deepStrictEqual(sv, failed());
  assert.deepStrictEqual(ev, []);
  assert.deepStrictEqual(evt, { type: "save" });
});

test("1: `always` spends a use: the save is a success with its roll kept, the count goes up, the event says so", () => {
  const { s, d } = game();
  ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "always" } });
  const sv = failed(), evt = { type: "save", success: false, total: 3 };
  assert.equal(resistFailure(s, d, sv, { onFail: [] }, [], evt), true);
  assert.equal(sv.success, true); assert.equal(sv.resisted, true); assert.equal(sv.total, 3, "the roll is kept");
  assert.equal(evt.success, true); assert.equal(evt.resisted, true);
  assert.equal(d.legend.resisted, 1);
});

test("1: a success, `never`, no use left, and a creature with no Legendary Resistance: nothing is spent", () => {
  const { s, d } = game();
  ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "always" } });
  const won = { ...failed(), success: true };
  assert.equal(resistFailure(s, d, won, { matters: true }, []), false);
  assert.equal(d.legend.resisted, 0);
  ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "never" } });
  assert.equal(resistFailure(s, d, failed(), { matters: true }, []), false);
  ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "always" } });
  d.legend.resisted = 3;
  const sv = failed();
  assert.equal(resistFailure(s, d, sv, { matters: true }, []), false);
  assert.equal(sv.success, false);
  assert.equal(resistFailure(s, s.entities.fighter, failed(), { matters: true }, []), false);
});

test("1: `matters` (the default) spends on a failure that matters and lets one that changes nothing stand", () => {
  const { s, d } = game();
  const para = [{ condition: "paralyzed" }], poison = [{ damage: "8d6", type: "poison" }], fire = [{ damage: "8d6", type: "fire" }];
  assert.equal(failureMatters(s, d, { onFail: para }), true);
  assert.equal(failureMatters(s, d, { onFail: fire, half: true }), true);
  assert.equal(failureMatters(s, d, { onFail: poison }), false, "immune to poison");
  assert.equal(failureMatters(s, d, { onFail: [{ condition: "poisoned" }] }), false, "immune to the condition");
  assert.equal(failureMatters(s, d, { onFail: [] }), false);
  assert.equal(failureMatters(s, d, { onFail: [{ heal: "1d4" }] }), false, "nothing that changes it");
  assert.equal(failureMatters(s, d, { onFail: [{ manual: "The DM decides." }] }), null, "a manual step is not read");
  assert.equal(failureMatters(s, d, { onFail: [{ damage: "2d6", type: "chosen" }] }), null);
  assert.equal(failureMatters(s, d, { onFail: [{ kill: true }] }), true);
  assert.equal(failureMatters(s, d, { onFail: [{ save: "con", dc: 15, onFail: [{ condition: "stunned" }] }] }), true, "a step inside a branch");
  assert.equal(failureMatters(s, d, { matters: true }), true);
  assert.equal(failureMatters(s, d, { unread: true }), null);
  d.cond.paralyzed = {};
  assert.equal(failureMatters(s, d, { onFail: para }), false, "already so");
  assert.equal(resistFailure(s, d, failed(), { onFail: poison }, []), false);
  assert.equal(d.legend.resisted, 0);
  delete d.cond.paralyzed;
  const sv = failed();
  assert.equal(resistFailure(s, d, sv, { onFail: para }, []), true);
  assert.equal(sv.success, true);
});

test("1: `matters` on a failure the engine cannot read, and `ask`, apply the failure and tell the DM a use is left", () => {
  const { s, d } = game();
  let ev = [], sv = failed();
  assert.equal(resistFailure(s, d, sv, { onFail: [{ manual: "x" }] }, ev), false);
  assert.equal(sv.success, false);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, "manual"); assert.equal(ev[0].actor, d.id);
  assert.match(ev[0].text, /3 uses of Legendary Resistance left/);
  ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "ask" } });
  ev = []; sv = failed();
  assert.equal(resistFailure(s, d, sv, { matters: true }, ev), false);
  assert.equal(ev.length, 1);
  assert.equal(d.legend.resisted, 0);
});

test("1: the instruction is listed with `reactionsOf` and set by the existing `reactions` action; `matters` is the default and not stored", () => {
  const { s, d } = game();
  ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "never" } });
  assert.equal(d.reactions[RESISTANCE], "never");
  ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "matters" } });
  assert.equal(d.reactions, undefined);
  const r = apply(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "sometimes" } }, DM);
  assert.equal(r.ok, false);
  const f = apply(s, { type: "reactions", actor: "fighter", set: { [RESISTANCE]: "always" } }, DM);
  assert.equal(f.ok, false, "a creature with no Legendary Resistance has no such instruction");
});
