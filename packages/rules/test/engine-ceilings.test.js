// The engine's own ceilings (#395, DEBT T35 and T40; docs/specs/homebrew.md, build notes on the engine's own ceilings).
// The gate (content/schema.js) refuses these entries; here they skip it, as a saved state or a future import path might, and
// the engine must hold on its own: an area is clipped to the map, an action over the work ceiling is refused with nothing
// changed (or, where no copy was taken, stopped with a `manual` event), a Multiattack of thousands of attacks is refused, and
// the monster AI's search stays bounded. The entries are the reviewers' repros from the review of #389.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, HOMEBREW_LOOKUPS, MONSTERS } from "../src/content/index.js";
import { aiStep } from "../src/ai.js";
import { WORK, loadOf } from "../src/effects.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { newMap } from "../src/map.js";
import * as H from "../src/hex.js";

const DM = { role: "dm", userId: "dm" };
const json = (s) => JSON.stringify(s);

// Puts entries into the lookups for the length of `fn` (the registry's gate is bypassed on purpose) and takes them out again.
function withEntries(entries, fn) {
  const put = [];
  try {
    for (const [kind, def] of entries) for (const [target, make] of HOMEBREW_LOOKUPS[kind]) { assert.ok(!Object.hasOwn(target, def.id)); target[def.id] = make(def); put.push([target, def.id]); }
    return fn();
  } finally { for (const [target, id] of put) delete target[id]; }
}

const spell = (id, over = {}) => ({
  id, name: "Boom", source: "homebrew:x", level: 1, school: "evocation", classes: ["wizard"], time: "action", range: 60,
  components: ["v", "s"], duration: "instant", concentration: false, ritual: false, target: { creature: { count: 1 } },
  effects: [{ save: "dex", half: true, onFail: [{ damage: "3d6", type: "fire" }] }], tier: "auto", checked: false, text: "x", ...over,
});
const attackAction = (id, onHit, over = {}) => ({ id, name: "Rend", target: { creature: { reach: 120 } }, effects: [{ attack: "melee", kind: "weapon", bonus: 40, onHit }], ...over });
const monsterOf = (id, actions, over = {}) => ({ ...structuredClone(CONTENT.monsters["goblin-warrior"]), id, name: "Dire Thing", source: "homebrew:x", checked: false, text: "x", hp: 1400, actions, ...over });

// The wizard on its turn in a fight with `crowd` goblin warriors near it; `at` is where they stand.
function table(crowd = 1, { spells = [], seed = 5 } = {}) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM);
  Object.assign(s.entities.wizard, { slots: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4 }, slotsMax: { 1: 4, 2: 4, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4, 8: 4, 9: 4 } });
  s.entities.wizard.spells.push(...spells);
  const ids = [];
  for (let i = 0; ids.length < crowd && i < crowd * 3; i++) {
    const r = apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: -6 + (i % 12), r: 2 + Math.floor(i / 12) } }, DM);
    if (r.ok) ids.push(r.events[0].id);
  }
  assert.equal(ids.length, crowd);
  for (const id of ids) s.entities[id].hp = s.entities[id].hpMax = 1e6;
  apply(s, { type: "startEncounter", center: { q: -2, r: 2 }, radius: 12 }, DM);
  for (let i = 0; i < 400 && current(s) !== "wizard"; i++) apply(s, { type: "endTurn", actor: current(s) }, DM);
  assert.equal(current(s), "wizard");
  return { s, ids };
}
const timed = (fn) => { const t = performance.now(); const r = fn(); return { r, ms: performance.now() - t }; };
// Refused: the sentence, and the game exactly as it was, whatever the ceiling counted.
const refused = (s, action, re, ms = 1000) => {
  const before = json(s);
  const { r, ms: took } = timed(() => apply(s, action, DM));
  assert.equal(r.ok, false, "refused");
  assert.match(r.error, re);
  assert.equal(json(s), before, "nothing changed, not the dice either");
  assert.equal(s.stack, undefined);
  assert.ok(took < ms, `took ${Math.round(took)} ms`);
  return r;
};

test("the ceilings are far above what the SRD pack does (measured: 106 steps, 113 events, 40 dice, 7 attacks)", () => {
  assert.deepEqual({ ...WORK }, { steps: 2000, events: 2000, dice: 2000, attacks: 50 });
  assert.ok(WORK.steps >= 5 * 106 && WORK.events >= 5 * 113 && WORK.dice >= 5 * 40 && WORK.attacks >= 5 * 7);
  // And no SRD spell or monster action reads as heavy to apply(), at a table of 100: nothing there takes a copy it need not.
  let most = { steps: 0, dice: 0 };
  const walk = (steps) => { const l = loadOf(steps); most = { steps: Math.max(most.steps, l.steps), dice: Math.max(most.dice, l.dice) }; };
  for (const sp of Object.values(CONTENT.spells)) walk(sp.effects);
  assert.ok(most.steps < 60, `the largest SRD spell reads as ${most.steps} steps for one creature`);
});

test("an area larger than the map is clipped to it: a 20,000-ft sphere is cast in well under a second", () => {
  const id = "hb-x-boom";
  withEntries([["spells", spell(id, { range: 10560000, target: { area: { shape: "sphere", size: 20000 } } })], ], () => {
    const { s, ids } = table(8, { spells: [id] });
    const size = json(s).length;
    const { r, ms } = timed(() => apply(s, { type: "cast", actor: "wizard", spell: id, hex: { q: -2, r: 2 } }, DM));
    assert.ok(r.ok, r.error);
    assert.ok(ms < 1000, `took ${Math.round(ms)} ms`);
    assert.ok(r.events.some((e) => e.type === "cast" && e.targets.length >= 1), "it reached the crowd");
    assert.ok(json(s).length - size < 20000, "a plain cast's worth of state");
  });
});

test("an area of every shape and 20,000 ft is clipped on the valley and the square room", async () => {
  const { squareRoom } = await import("./fixtures/square-room.js");
  for (const grid of ["hex", "square"]) for (const shape of ["sphere", "cylinder", "emanation", "cone", "line", "cube"]) {
    const id = "hb-x-big";
    withEntries([["spells", spell(id, { range: shape === "line" || shape === "cone" ? 0 : 10560000, target: { area: { shape, size: 20000 } } })]], () => {
      const { s } = table(3, { spells: [id] });
      if (grid === "square") apply(s, { type: "loadMap", map: squareRoom() }, DM);
      const { ms } = timed(() => apply(s, { type: "cast", actor: "wizard", spell: id, hex: { q: 3, r: 3 } }, DM));
      assert.ok(ms < 1000, `${grid} ${shape}: ${Math.round(ms)} ms`);
    });
  }
});

test("a damage step repeated a hundred million times is refused with nothing changed, at once", () => {
  for (const times of [1e6, 1e8]) {
    const id = "hb-x-times";
    withEntries([["spells", spell(id, { effects: [{ save: "dex", half: true, onFail: [{ damage: "3d6", type: "fire", times }] }] })]], () => {
      const { s, ids } = table(1, { spells: [id] });
      refused(s, { type: "cast", actor: "wizard", spell: id, targets: [ids[0]] }, /more than 2,000 (steps|dice|events)/);
    });
  }
});

test("a Multiattack of 2,000 attacks is refused before anything is spent", () => {
  const id = "hb-x-hydra", a1 = attackAction("a1", [{ damage: "1d6", type: "slashing" }]);
  withEntries([["monsters", monsterOf(id, [a1, { id: "multi", name: "Multiattack", multiattack: Array(200).fill({ action: "a1", times: 10 }), target: { self: true }, effects: [] }])]], () => {
    const { s } = table(1);
    const spawned = apply(s, { type: "spawn", monster: id, at: { q: 5, r: 0 } }, DM);
    assert.ok(spawned.ok, spawned.error);
    const m = spawned.events[0].id;
    for (let i = 0; i < 100 && current(s) !== m; i++) apply(s, { type: "endTurn", actor: current(s) }, DM);
    assert.equal(current(s), m);
    refused(s, { type: "act", actor: m, action: "multi" }, /would make 2,000 attacks; the engine allows at most 50/);
  });
});

test("one attack of 18 damage steps of 50d100+140 repeated 10 times is refused: it would write over 2,000 dice", () => {
  const id = "hb-x-heavy", hit = Array(18).fill({ damage: "50d100+140", type: "slashing", times: 10 });
  withEntries([["monsters", monsterOf(id, [attackAction("a1", hit)])]], () => {
    const { s, ids } = table(1);
    const spawned = apply(s, { type: "spawn", monster: id, at: { q: 1, r: 0 } }, DM);
    const m = spawned.events[0].id;
    s.entities[ids[0]].side = "party";
    for (let i = 0; i < 100 && current(s) !== m; i++) apply(s, { type: "endTurn", actor: current(s) }, DM);
    assert.equal(current(s), m);
    // It would hit: the bonus is 40. A refused attack changes nothing, so the monster may try again and the state never grows.
    const before = json(s).length;
    for (let i = 0; i < 20; i++) refused(s, { type: "act", actor: m, action: "a1", target: "wizard" }, /roll more than 2,000 dice/);
    assert.equal(json(s).length, before);
  });
});

test("a ceiling-sized area spell (a dozen saves, 1,000 ft) at a table of 100 is refused, and at 30 it still goes", () => {
  const id = "hb-x-nova";
  const nova = spell(id, { range: 10560000, target: { area: { shape: "sphere", size: 1000 } }, effects: Array(12).fill({ save: "dex", dc: 50, half: true, onFail: [{ damage: "50d100+140", type: "thunder", times: 3 }] }) });
  withEntries([["spells", nova]], () => {
    const big = table(100, { spells: [id] });
    refused(big.s, { type: "cast", actor: "wizard", spell: id, hex: { q: -2, r: 2 } }, /more than 2,000 (steps|dice|events)/);
    // The slot was not spent and no turn went by: the same action may still be tried.
    assert.equal(big.s.entities.wizard.slots[1], 4);
    const small = table(6, { spells: [id] });
    const { r, ms } = timed(() => apply(small.s, { type: "cast", actor: "wizard", spell: id, hex: { q: -2, r: 2 } }, DM));
    assert.ok(r.ok, r.error);
    assert.ok(ms < 1000);
    assert.ok(r.events.length < WORK.events);
  });
});

test("targets added by a higher slot count: 20 + 8 x 20 targets of an 11-step effect stays within the ceiling or is refused clean", () => {
  const id = "hb-x-more";
  withEntries([["spells", spell(id, { range: 10560000, target: { creature: { count: 20 } }, higher: { slot: { targets: 20 } }, effects: [{ save: "dex", dc: 50, half: true, onFail: [{ damage: "50d100+140", type: "fire", times: 10 }] }] })]], () => {
    const { s, ids } = table(100, { spells: [id] });
    const before = json(s), size = before.length;
    const { r, ms } = timed(() => apply(s, { type: "cast", actor: "wizard", spell: id, slot: 9, targets: ids }, DM));
    assert.ok(ms < 1000, `took ${Math.round(ms)} ms`);
    if (r.ok) assert.ok(r.events.length <= WORK.events);
    else assert.equal(json(s), before);
    assert.ok(json(s).length - size < 1.5e6, "state grew by a bounded amount");
  });
});

test("a lasting zone that meets the ceiling on a later turn, where no copy was taken, stops with a manual event that says what was not applied", () => {
  const id = "hb-x-zone";
  // At 100 steps a target it passes every check at the cast; at 3,000 repeats the turn's own steps meet the ceiling, with no copy of the game taken for an end of turn.
  const zone = spell(id, { range: "self", level: 3, duration: "1 minute", concentration: true, target: { area: { shape: "emanation", size: 30 } }, zone: { on: ["turnEnd"], once: "turn" },
    effects: [{ save: "dex", dc: 50, half: true, onFail: [{ damage: "1d6", type: "fire", times: 3000 }] }] });
  withEntries([["spells", zone]], () => {
    const { s, ids } = table(1, { spells: [id] });
    const cast = apply(s, { type: "cast", actor: "wizard", spell: id, slot: 3, hex: undefined }, DM);
    // The cast itself reads as heavy and is refused clean, because its steps could run (a zone's `times` is counted too).
    assert.equal(cast.ok, false);
    assert.match(cast.error, /more than 2,000 steps/);
  });
});

test("the manual stop: work with no copy taken is stopped, not silently cut short", async () => {
  // A zone already laid in a saved state (nothing at the cast to count) whose turn's steps meet the ceiling.
  const id = "hb-x-saved";
  withEntries([["spells", spell(id, { level: 3, duration: "1 minute", concentration: true, range: "self", target: { area: { shape: "emanation", size: 30 } }, zone: { on: ["turnEnd"], once: "turn" }, effects: [{ save: "dex", dc: 50, half: true, onFail: [{ damage: "1d6", type: "fire" }] }] })]], () => {
    const { s, ids } = table(1, { spells: [id] });
    s.entities[ids[0]].pos = { q: 1, r: 0, z: 0 };
    const cast = apply(s, { type: "cast", actor: "wizard", spell: id, slot: 3 }, DM);
    assert.ok(cast.ok, cast.error);
    const fx = s.effects.find((x) => x.zone);
    assert.ok(fx, "a zone is laid");
    fx.zone.steps = [{ save: "dex", dc: 50, half: true, onFail: [{ damage: "1d6", type: "fire", times: 5000 }] }];     // as a saved state, or an import, might hold it
    for (let i = 0; i < 20 && current(s) !== ids[0]; i++) apply(s, { type: "endTurn", actor: current(s) }, DM);
    const before = json(s).length;
    const { r, ms } = timed(() => apply(s, { type: "endTurn", actor: ids[0] }, DM));
    assert.ok(ms < 1000, `took ${Math.round(ms)} ms`);
    assert.ok(r.ok, r.error);
    const note = r.events.find((e) => e.type === "manual" && /more than 2,000 steps/.test(e.text));
    assert.ok(note, "a manual event says it was stopped");
    assert.match(note.text, /the rest was not applied/);
    assert.equal(note.name, "Boom");
    assert.ok(json(s).length - before < 100000, "bounded growth");
  });
});

test("the monster AI's search is bounded: 30 monsters with a 1,000-ft emanation each step quickly", () => {
  const id = "hb-x-aura", aura = { id: "roar", name: "Roar", time: "bonus", target: { area: { shape: "emanation", size: 1000 } }, effects: [{ save: "dex", dc: 50, half: true, onFail: [{ damage: "2d6", type: "thunder" }] }] };
  withEntries([["monsters", monsterOf(id, [attackAction("a1", [{ damage: "1d6", type: "slashing" }]), aura])]], () => {
    const { s } = table(1);
    const made = [];
    for (let i = 0; i < 30; i++) { const r = apply(s, { type: "spawn", monster: id, at: { q: -6 + (i % 12), r: -4 - Math.floor(i / 12) } }, DM); if (r.ok) made.push(r.events[0].id); }
    assert.ok(made.length >= 24);
    for (const m of made) { s.entities[m].hp = s.entities[m].hpMax = 1e6; }
    // Each stands in its own turn: ask the AI for a step as that creature, on a copy.
    let worst = 0;
    for (const m of made) {
      const c = structuredClone(s);
      c.encounter.order = [{ id: m, init: 99, dex: 10 }, ...c.encounter.order.filter((x) => x.id !== m)]; c.encounter.turn = 0;
      const { ms } = timed(() => aiStep(c, m));
      worst = Math.max(worst, ms);
    }
    assert.ok(worst < 400, `the slowest aiStep took ${Math.round(worst)} ms`);
  });
});

test("the monster AI aims an area against a crowd of 100 foes, and a step stays fast", () => {
  const id = "hb-x-cone", breath = { id: "breath", name: "Breath", time: "action", target: { area: { shape: "cone", size: 1000 } }, effects: [{ save: "dex", dc: 50, half: true, onFail: [{ damage: "2d6", type: "fire" }] }] };
  withEntries([["monsters", monsterOf(id, [breath])]], () => {
    const { s } = table(100);
    const spawned = apply(s, { type: "spawn", monster: id, at: { q: 6, r: -3 } }, DM);
    const m = spawned.events[0].id;
    s.entities.wizard.side = "party";
    for (let i = 0; i < 400 && current(s) !== m; i++) apply(s, { type: "endTurn", actor: current(s) }, DM);
    const { r, ms } = timed(() => aiStep(s, m));
    assert.ok(r, "it has a step");
    assert.ok(ms < 400, `took ${Math.round(ms)} ms`);
  });
});

// The AI chooses exactly as it did before the ceilings (the lead's rule, review of #401, M1 and M2): these are the results recorded on main.
function openMap(radius) { return newMap({ id: "m", name: "m", starts: [{ q: 0, r: 0 }], levels: [{ id: "ground", name: "G", z: 0, tiles: Object.fromEntries(H.range({ q: 0, r: 0 }, radius).map((h) => [H.col(h), { t: "stone" }])) }], walls: [], objects: [] }); }
function lone(map, monster, foes, radius, party = { q: -28, r: 20, z: 0 }) {
  const s = newGame(5);
  apply(s, { type: "loadMap", map }, DM); apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  for (const k of Object.keys(s.entities)) if (/^m\d+$/.test(k)) apply(s, { type: "remove", actor: k }, DM);
  for (const k of ["fighter", "rogue", "cleric", "wizard"]) s.entities[k].pos = party;
  const d = apply(s, { type: "spawn", monster, at: { q: 0, r: 0 } }, DM).events[0].id;
  for (const at of foes) { const r = apply(s, { type: "spawn", monster: "goblin-warrior", at }, DM); if (r.ok) { const g = r.events[0].id; s.entities[g].side = "party"; s.entities[g].hp = s.entities[g].maxHp = 1e6; } }
  apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius }, DM);
  for (let i = 0; i < 200 && current(s) !== d; i++) apply(s, { type: "endTurn", actor: current(s) }, DM);
  return { s, d };
}
test("a Ghost's Horrific Visage with 40 foes near it and a pack of 37 further off is aimed where main aimed it", () => {
  const map = openMap(30);
  for (const [nNear, want] of [[39, { q: 9, r: -4 }], [40, { q: 9, r: -4 }], [44, { q: 9, r: -4 }], [52, { q: -4, r: 2 }]]) {
    const near = [];
    for (const r of [4, 5, 6, 7]) for (const h of H.range({ q: 0, r: 0 }, r).filter((x) => H.dist(x, { q: 0, r: 0 }) === r)) if (h.q <= -1 && near.length < nNear) near.push(h);
    const { s, d } = lone(map, "ghost", [...near, ...H.range({ q: 12, r: -4 }, 3)], 40);
    const a = aiStep(s, d);
    assert.equal(a.action, "horrific-visage");
    assert.deepEqual({ q: a.hex.q, r: a.hex.r }, want, `${nNear} near foes`);
  }
});
test("a Solar flies to the foe it can reach, as main chose: 28 hexes off it goes to the hex beside it", () => {
  const map = openMap(40);
  for (const [dist, want] of [[28, { q: 26, r: 0 }], [33, { q: -29, r: 28 }]]) {
    const { s, d } = lone(map, "solar", [{ q: dist, r: 0 }], 45, { q: -30, r: 30, z: 0 });
    const a = aiStep(s, d);
    assert.equal(a.type, "move");
    assert.deepEqual({ q: a.to.q, r: a.to.r }, want, `foe ${dist} hexes off`);
  }
});
