// Issue #416 (DEBT T32, T33): four places where an entry said more than the engine did. Each test below fails on the
// engine before the fix. The spells here are invented for these tests (no SRD spell uses these shapes), checked by the
// pack linter and put in the lookups as effects.test.js does: a homebrew pack cannot carry some of these shapes, since
// the homebrew budget in content/schema.js sets no length for them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";
import { spellProfile } from "../src/effects.js";
import { derive } from "../src/derive.js";
import { apply, current, makeEntity } from "../src/engine.js";
import { gridOf } from "../src/grid.js";
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

// ---------- 2. a summon on spaces keeps its bond's command `range` ----------
const PAT = { role: "player", userId: "pat" };
function summoner() {
  const s = newGame(5);
  s.settings.autoEngage = false;
  const d = derive({ name: "Ven", class: "wizard", level: 17, abilities: { str: 10, dex: 14, con: 14, int: 16, wis: 12, cha: 16 }, skills: [], armour: "leather-armor", weapons: ["quarterstaff"], spells: ["animate-objects"] });
  const G = gridOf(s.map);
  const spot = G.range(s.entities.fighter.pos, 4).find((h) => apply(structuredClone(s), { type: "spawn", monster: "wolf", at: h }, DM).ok);
  s.entities.ven = makeEntity(d.record, { id: "ven", kind: "pc", side: "party", pos: { ...spot, z: 0 } });
  assert.ok(apply(s, { type: "claim", entity: "ven", user: "pat", userName: "Pat" }, PAT).ok);
  const at = G.range(s.entities.ven.pos, 4).filter((h) => apply(structuredClone(s), { type: "spawn", monster: "wolf", at: h }, DM).ok)[5];
  return { s, at };
}

test("Animate Objects: the object's bond carries the 500 ft command range, and a command beyond it is refused", () => {
  const { s, at } = summoner();
  const r = apply(s, { type: "cast", actor: "ven", spell: "animate-objects", slot: 5, summon: { variant: "medium", at: [at] } }, PAT);
  assert.ok(r.ok, r.error);
  const id = r.events.find((e) => e.type === "summoned").id;
  assert.equal(s.entities[id].bond.range, 500);
  assert.ok(apply(structuredClone(s), { type: "command", actor: "ven", ids: [id], order: "guard" }, PAT).ok, "near: obeys");
  s.entities[id].pos = { q: 150, r: 0, z: 0 };                      // 150 hexes: 750 ft from the caster, which is near the origin
  const before = json(s), far = apply(s, { type: "command", actor: "ven", ids: [id], order: "guard" }, PAT);
  assert.equal(far.ok, false);
  assert.match(far.error, /A command reaches 500 ft/);
  assert.equal(json(s), before, "a refused command changes nothing");
});

test("Animate Objects: undo, redo and replay are exact", () => {
  const { s, at } = summoner();
  exact(s, [{ type: "cast", actor: "ven", spell: "animate-objects", slot: 5, summon: { variant: "medium", at: [at] } }]);
});

// ---------- 4. endings in an instant spell (T32 (3) and (4)) ----------
const effectsOfSpell = (s, id) => (s.effects ?? []).filter((x) => x.spell === id);
const manuals = (r) => r.events.filter((e) => e.type === "manual").map((e) => e.text).join("\n");
const endTurns = (s, until) => { for (let i = 0; i < 40 && !until(); i++) assert.ok(apply(s, { type: "endTurn", actor: current(s) }, DM).ok); };

const HEX = define(spell("lone-damaged", { effects: [{ condition: "frightened", ends: { on: "damaged" } }] }));

test("an instant spell whose only ending is `damaged` keeps its condition until the creature takes damage", () => {
  const { s, ids: [goblin] } = table([HEX.id, "magic-missile"], [["goblin-warrior", { q: 2, r: 0 }]]);
  const r = apply(s, { type: "cast", actor: "wizard", spell: HEX.id, target: goblin }, DM);
  assert.ok(r.ok, r.error);
  assert.ok(s.entities[goblin].cond.frightened, "frightened");
  assert.equal(effectsOfSpell(s, HEX.id).length, 1, "an effect holds it");
  assert.ok(!/Nothing ends it yet/.test(manuals(r)), "the DM is not told it never ends");
  endTurns(s, () => current(s) === "wizard" && s.entities[goblin].cond.frightened && s.encounter.round > 1);   // a round passes: still there
  assert.ok(s.entities[goblin].cond.frightened, "it lasts past turns");
  const d = apply(s, { type: "cast", actor: "wizard", spell: "magic-missile", target: goblin, slot: 1 }, DM);
  assert.ok(d.ok, d.error);
  assert.ok(d.events.some((e) => e.type === "damage" && e.target === goblin && e.amount > 0));
  assert.ok(!s.entities[goblin].cond.frightened, "damage ends it");
  assert.equal(effectsOfSpell(s, HEX.id).length, 0, "and the effect with it");
});

// The endTurn actions that bring the wizard's next turn round (worked out on a copy).
const toWizard = (s) => { const c = structuredClone(s), out = []; do { out.push({ type: "endTurn", actor: current(c) }); assert.ok(apply(c, out.at(-1), DM).ok); } while (current(c) !== "wizard" && out.length < 40); return out; };

test("a lone `damaged` ending: undo, redo and replay are exact", () => {
  const { s, ids: [goblin] } = table([HEX.id, "magic-missile"], [["goblin-warrior", { q: 2, r: 0 }]]);
  const first = { type: "cast", actor: "wizard", spell: HEX.id, target: goblin }, c = structuredClone(s);
  apply(c, first, DM);
  exact(s, [first, ...toWizard(c), { type: "cast", actor: "wizard", spell: "magic-missile", target: goblin, slot: 1 }]);
});

const MIXED = define(spell("mixed-ends", { effects: [
  { condition: "poisoned" },
  { condition: "frightened", ends: { on: "turnEnd" } },
  { modifier: { on: "ac", op: "add", value: -2 } },
  { modifier: { on: "speed", op: "set", value: 0 }, ends: { on: "turnEnd" } }] }));

test("an instant spell made lasting by one step's ending: a step with no ending of its own is handed to the DM, not held for ever", () => {
  const { s, ids: [goblin] } = table([MIXED.id], [["goblin-warrior", { q: 2, r: 0 }]]);
  const r = apply(s, { type: "cast", actor: "wizard", spell: MIXED.id, target: goblin }, DM);
  assert.ok(r.ok, r.error);
  const g = s.entities[goblin], [fx] = effectsOfSpell(s, MIXED.id);
  assert.ok(g.cond.poisoned && g.cond.frightened);
  assert.equal(g.cond.poisoned.effect, undefined, "the condition with no ending is not tied to the effect");
  assert.equal(g.cond.frightened.effect, fx.id);
  assert.deepEqual(fx.parts.map((p) => p.cond ?? Object.values(p.modifier).join(":")), ["frightened", "speed:set:0"], "held: only what ends");
  const text = manuals(r);
  assert.match(text, /poisoned/i);
  assert.match(text, /Nothing ends it yet: the DM removes it/, "the DM is told the Poisoned condition stays");
  assert.match(text, /nothing in it says when that ends/, "and that the -2 to AC was not applied");
  // The effect ends with its own parts; the Poisoned condition stays for the DM, as it was told.
  endTurns(s, () => !g.cond.frightened);
  assert.equal(effectsOfSpell(s, MIXED.id).length, 0, "the effect ended with its last part");
  assert.ok(g.cond.poisoned, "the DM's condition is still there");
});

test("a modifier used up by use (`uses`) is held by an instant spell's effect, as before (Staggering Blow's shape)", () => {
  const ONCE = define(spell("once-ends", { effects: [{ modifier: { on: "save", op: "disadvantage", uses: 1 } }, { condition: "frightened", ends: { on: "turnEnd" } }] }));
  const { s, ids: [goblin] } = table([ONCE.id], [["goblin-warrior", { q: 2, r: 0 }]]);
  assert.ok(apply(s, { type: "cast", actor: "wizard", spell: ONCE.id, target: goblin }, DM).ok);
  const [fx] = effectsOfSpell(s, ONCE.id);
  assert.deepEqual(fx.parts.map((p) => p.cond ?? "uses"), ["uses", "frightened"]);
});

test("an instant spell with endings and others: undo, redo and replay are exact", () => {
  const { s, ids: [goblin] } = table([MIXED.id], [["goblin-warrior", { q: 2, r: 0 }]]);
  exact(s, [{ type: "cast", actor: "wizard", spell: MIXED.id, target: goblin }, { type: "endTurn", actor: "wizard" }]);
});

// ---------- 3. `fall: "surface"` ----------
const DROP = define(spell("drop", { effects: [{ fall: "surface" }] }));

test("fall \"surface\": a creature in the air drops to the surface under it, takes falling damage and lands Prone", () => {
  const { s, ids: [goblin] } = table([DROP.id], [["goblin-warrior", { q: 2, r: 0 }]]);
  const g = s.entities[goblin];
  g.pos = { ...g.pos, z: 40 };
  const hp0 = g.hp;
  const r = apply(s, { type: "cast", actor: "wizard", spell: DROP.id, target: goblin }, DM);
  assert.ok(r.ok, r.error);
  assert.deepEqual(r.events.find((e) => e.type === "fell"), { type: "fell", id: goblin, feet: 40 });
  const dmg = r.events.filter((e) => e.type === "damage" && e.target === goblin);
  assert.ok(dmg.length === 1 && dmg[0].dtype === "bludgeoning" && dmg[0].dice.length === 4, "4d6 for 40 feet");
  assert.equal(g.pos.z, 0, "it is on the ground");
  assert.ok(g.hp < hp0 || g.dead);
  assert.ok(g.cond.prone || g.dead, "Prone");
});

test("fall \"surface\": a creature already on a surface does not fall, and the log says so", () => {
  const { s, ids: [goblin] } = table([DROP.id], [["goblin-warrior", { q: 2, r: 0 }]]);
  const hp0 = s.entities[goblin].hp;
  const r = apply(s, { type: "cast", actor: "wizard", spell: DROP.id, target: goblin }, DM);
  assert.ok(r.ok, r.error);
  assert.ok(!r.events.some((e) => e.type === "fell" || e.type === "damage"));
  assert.ok(r.events.some((e) => e.type === "note" && /does not fall/.test(e.text)));
  assert.equal(s.entities[goblin].hp, hp0);
});

test("fall \"surface\": undo, redo and replay are exact", () => {
  const { s, ids: [goblin] } = table([DROP.id], [["goblin-warrior", { q: 2, r: 0 }]]);
  s.entities[goblin].pos = { ...s.entities[goblin].pos, z: 40 };
  exact(s, [{ type: "cast", actor: "wizard", spell: DROP.id, target: goblin }]);
});
