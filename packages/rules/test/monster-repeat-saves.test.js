// Issue #421, item 1 (DEBT T54): a repeated save that ends a condition a creature's action put on is rolled against a DC,
// and a success ends it. Fifteen SRD monsters have one. The DCs and saves below are those of reference/srd52.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT } from "../src/content/index.js";
import { walk } from "../src/effects.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };

// monster, action, the save that puts it on and ends it, the DC, the condition, how the action is aimed.
const SRD = [
  ["basilisk", "petrifying-gaze", "con", 12, "restrained", "area"],
  ["brass-dragon-wyrmling", "sleep-breath", "con", 11, "incapacitated", "area"],
  ["young-brass-dragon", "sleep-breath", "con", 14, "incapacitated", "area"],
  ["adult-brass-dragon", "sleep-breath", "con", 18, "incapacitated", "area"],
  ["ancient-brass-dragon", "sleep-breath", "con", 21, "incapacitated", "area"],
  ["adult-silver-dragon", "paralyzing-breath", "con", 20, "incapacitated", "area"],
  ["ancient-silver-dragon", "paralyzing-breath", "con", 24, "incapacitated", "area"],
  ["chuul", "paralyzing-tentacles", "con", 13, "poisoned", "creature"],
  ["quasit", "scare", "wis", 10, "frightened", "creature"],
  ["sphinx-of-valor", "second-roar", "wis", 20, "paralyzed", "area"],
  ["vrock", "spores", "con", 15, "poisoned", "area"],
  ["doppelganger", "unsettling-visage", "wis", 12, "frightened", "area"],
  ["gorgon", "petrifying-breath", "con", 15, "restrained", "area"],
  ["harpy", "luring-song", "wis", 11, "charmed", "area"],
  ["medusa", "petrifying-gaze", "con", 13, "restrained", "area"],
];

// Open ground; the wizard at the centre, the monster a few hexes off (beside it where the reach or the area is 15 feet or less), the other party members far away.
function field(monster) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM);
  apply(s, { type: "place", actor: "fighter", to: { q: -6, r: 0 } }, DM);
  Object.assign(s.entities.wizard, { hp: 900, maxHp: 900 });
  const m = s.entities[ok(apply(s, { type: "spawn", monster, at: { q: ["chuul", "brass-dragon-wyrmling", "doppelganger"].includes(monster) ? 1 : 4, r: 0 } }, DM)).events[0].id];
  Object.assign(m, { hp: 900, maxHp: 900 });
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  return { s, m, w: s.entities.wizard };
}
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const partsOn = (s, id) => (s.effects ?? []).flatMap((fx) => fx.parts).filter((p) => p.target === id && p.ends?.on === "save" && !p.ended);

test("the fifteen monsters are exactly those whose actions end a condition on a repeated save", () => {
  const found = new Set();
  for (const m of Object.values(CONTENT.monsters)) for (const a of m.actions) walk(a.effects ?? [], (st) => { if (st.ends?.on === "save") found.add(`${m.id}/${a.id}`); });
  assert.deepEqual([...found].sort(), SRD.map(([m, a]) => `${m}/${a}`).sort());
  assert.equal(new Set(SRD.map(([m]) => m)).size, 15);
});

for (const [monster, action, save, dc, cond, aim] of SRD) {
  test(`${monster}: ${action} puts on ${cond}; the ${save.toUpperCase()} save at the end of each turn is against DC ${dc}; a failure keeps it, a success ends it`, () => {
    const { s, m, w } = field(monster);
    w.saveBonus = { [save]: -100 };
    turnOf(s, m.id);
    const r = ok(apply(s, { type: "act", actor: m.id, action, ...(aim === "area" ? { hex: w.pos } : { target: w.id }) }, DM));
    assert.ok(w.cond[cond], `${cond} is on the wizard`);
    const [part, ...more] = partsOn(s, w.id);
    assert.equal(more.length, 0);
    assert.equal(part.dc, dc, "the repeated save has the SRD's DC");
    const first = r.events.find((e) => e.type === "save" && e.id === w.id);
    assert.equal(first.dc, dc);
    // The end of its turn, saving at -100: a failure; the condition stays and the save was made against the DC.
    turnOf(s, w.id);
    let e = ok(apply(s, { type: "endTurn", actor: w.id }, DM)).events.find((x) => x.type === "save" && x.id === w.id && x.against);
    assert.ok(e, "a repeated save is rolled");
    assert.equal(e.abil, save); assert.equal(e.dc, dc); assert.equal(e.success, false);
    assert.ok(w.cond[cond], "a failed save does not end it");
    // The next end of its turn, saving at +100: it ends.
    w.saveBonus = { [save]: 100 };
    turnOf(s, w.id);
    const out = ok(apply(s, { type: "endTurn", actor: w.id }, DM)).events;
    e = out.find((x) => x.type === "save" && x.id === w.id && x.against);
    assert.equal(e.success, true); assert.equal(e.dc, dc);
    assert.equal(w.cond[cond], undefined, "a success ends it");
    assert.equal(partsOn(s, w.id).length, 0);
  });
}

// The other sources of the DC, on an action built into a spawned creature (its saves rigged to fail).
function withAction(effects) {
  const { s, m, w } = field("goblin-warrior");
  w.saveBonus = { wis: -100, con: -100 };
  m.actions = [{ id: "dread", name: "Dread", target: { creature: { reach: 60 } }, effects }];
  turnOf(s, m.id);
  return { s, m, w, r: ok(apply(s, { type: "act", actor: m.id, action: "dread", target: w.id }, DM)) };
}
test("a condition with an ending DC of its own and no save above it is rolled against that DC", () => {
  const { s, w } = withAction([{ condition: "frightened", ends: { on: "save", save: "wis", at: "turnEnd", dc: 17 } }]);
  assert.ok(w.cond.frightened);
  assert.equal(partsOn(s, w.id)[0].dc, 17);
});
test("an ending DC of its own wins over the DC of the save that put the condition on; without one, the innermost save's DC", () => {
  const own = withAction([{ save: "wis", dc: 9, onFail: [{ condition: "frightened", ends: { on: "save", save: "wis", at: "turnEnd", dc: 17 } }] }]);
  assert.equal(partsOn(own.s, own.w.id)[0].dc, 17);
  const two = withAction([{ save: "wis", dc: 9, onFail: [{ save: "con", dc: 14, onFail: [{ condition: "poisoned", ends: { on: "save", save: "con", at: "turnEnd" } }] }] }]);
  assert.equal(partsOn(two.s, two.w.id)[0].dc, 14);
});
test("a condition that ends on a save with no DC anywhere is not left to a save that can never succeed: the DM is told", () => {
  const { w, r } = withAction([{ condition: "frightened", ends: { on: "save", save: "wis", at: "turnEnd" } }]);
  assert.ok(w.cond.frightened);
  assert.ok(r.events.some((e) => e.type === "manual" && /no DC entered/.test(e.text)));
});
