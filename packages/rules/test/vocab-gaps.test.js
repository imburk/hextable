// Issue #416 (DEBT T32, T33): four places where an entry said more than the engine did. Each test below fails on the
// engine before the fix. The spells here are invented for these tests (no SRD spell uses these shapes), checked by the
// pack linter and put in the lookups as effects.test.js does: a homebrew pack cannot carry some of these shapes, since
// the homebrew budget in content/schema.js sets no length for them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";
import { spellProfile } from "../src/effects.js";
import { apply, current } from "../src/engine.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const json = (x) => JSON.stringify(x);

const spell = (id, over = {}) => ({
  id: `hb-vg-${id}`, name: `Vg ${id}`, source: "homebrew:vg", level: 1, school: "evocation", classes: ["wizard"], time: "action", range: 60,
  components: ["v", "s"], duration: "instant", concentration: false, ritual: false, target: { creature: { count: 1 } },
  effects: [{ save: "dex", half: true, onFail: [{ damage: "3d6", type: "fire" }] }], tier: "auto", checked: false, text: "Invented for a test.", ...over,
});
const define = (def) => {
  assert.deepEqual(lintPack({ pack: { id: "vg", name: "vg", license: "x", attribution: "x" }, spells: [def] }), [], def.id);
  SPELLS[def.id] = spellProfile(def);
  return def;
};

// The wizard on its turn in a fight, with `spells` known and level 1-4 slots; `others` are monsters at hexes.
function table(spells, others, seed = 11) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM);
  Object.assign(s.entities.wizard, { slots: { 1: 4, 2: 4, 3: 4, 4: 4 }, slotsMax: { 1: 4, 2: 4, 3: 4, 4: 4 } });
  s.entities.wizard.spells.push(...spells);
  const ids = others.map(([monster, at]) => { const r = apply(s, { type: "spawn", monster, at }, DM); assert.ok(r.ok, r.error); return r.events[0].id; });
  apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM);
  for (let i = 0; i < 20 && current(s) !== "wizard"; i++) apply(s, { type: "endTurn", actor: current(s) }, DM);
  assert.equal(current(s), "wizard");
  return { s, ids };
}

// Plays `acts`, then undoes every one, redoes every one, and replays from the start: all must give the same state.
function exact(s, acts) {
  const start = json(s), h = createHistory(), states = [start];
  {
    for (const a of acts) {
      const before = mark(s), r = apply(s, a, DM);
      assert.ok(r.ok, r.error);
      h.record(before, s, describeStep(a, r.events, before, s));
      states.push(json(s));
    }
    const end = json(s);
    for (let n = acts.length - 1; n >= 0; n--) { h.undo(s); assert.equal(json(s), states[n], `undo to step ${n}`); }
    for (let n = 0; n < acts.length; n++) h.redo(s);
    assert.equal(json(s), end, "redo");
    const again = JSON.parse(start);
    for (const a of acts) assert.ok(apply(again, a, DM).ok);
    assert.equal(json(again), end, "replay");
  }
}

// ---------- 1. a spell area's `types` ----------
const TURN = define(spell("turn-burst", { range: 60, target: { area: { shape: "sphere", size: 20, types: ["undead"] } },
  effects: [{ save: "dex", half: true, onFail: [{ damage: "6d6", type: "radiant" }] }] }));

test("a spell area with `types` affects only creatures of those types, as a monster action's does", () => {
    const { s, ids: [skel, goblin] } = table([TURN.id], [["skeleton", { q: 7, r: 0 }], ["goblin-warrior", { q: 7, r: 1 }]]);
  const at = { q: 7, r: 0 };
  const a = { type: "cast", actor: "wizard", spell: TURN.id, hex: at };
  const hp = (id) => s.entities[id].hp;
  const [skel0, gob0] = [hp(skel), hp(goblin)];
  const r = apply(s, a, DM);
  assert.ok(r.ok, r.error);
  const cast = r.events.find((e) => e.type === "cast");
  assert.deepEqual(cast.targets, [skel], "only the Undead is caught");
  assert.equal(hp(goblin), gob0, "the goblin is untouched");
  assert.ok(hp(skel) < skel0, "the skeleton took damage");
  assert.ok(!r.events.some((e) => e.target === goblin || e.id === goblin), "no event names the goblin");
});

test("a spell area with `types` and nothing of that type in it catches no one", () => {
    const { s, ids: [goblin] } = table([TURN.id], [["goblin-warrior", { q: 7, r: 0 }]]);
  const gob0 = s.entities[goblin].hp;
  const r = apply(s, { type: "cast", actor: "wizard", spell: TURN.id, hex: { q: 7, r: 0 } }, DM);
  assert.ok(r.ok, r.error);
  assert.deepEqual(r.events.find((e) => e.type === "cast").targets, []);
  assert.equal(s.entities[goblin].hp, gob0);
});

test("a typed spell area: undo, redo and replay are exact", () => {
    const { s } = table([TURN.id], [["skeleton", { q: 7, r: 0 }], ["goblin-warrior", { q: 7, r: 1 }]]);
  exact(s, [{ type: "cast", actor: "wizard", spell: TURN.id, hex: { q: 7, r: 0 } }]);
});

test("an untyped spell area still catches everyone", () => {
  const plain = define(spell("plain-burst", { target: { area: { shape: "sphere", size: 20 } } }));
  const { s, ids: [skel, goblin] } = table([plain.id], [["skeleton", { q: 7, r: 0 }], ["goblin-warrior", { q: 7, r: 1 }]]);
  const r = apply(s, { type: "cast", actor: "wizard", spell: plain.id, hex: { q: 7, r: 0 } }, DM);
  assert.ok(r.ok, r.error);
  assert.deepEqual([...r.events.find((e) => e.type === "cast").targets].sort(), [skel, goblin].sort());
});
