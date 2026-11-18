// Issue #425, fix round 1: the copy `apply()` keeps for a restore holds the terrain (`map.levels`, `map.walls`) BY REFERENCE for every
// action except those in TERRAIN_ACTIONS, so that it does not grow with the size of the map. That is sound only if no other action ever
// changes the terrain in place. This file shows it: every action type in the handler table is played, with many varied payloads, in games
// whose terrain is deeply frozen (a write to it in place would throw), and the terrain's hash is compared before and after each. Then: an
// action that is on the list still restores the terrain, objects (a door opened, a trap fired) are restored with the copy, and the copy
// does not grow with the map.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ACTION_TYPES, apply, current, TERRAIN_ACTIONS } from "../src/engine.js";
import { aiStep } from "../src/ai.js";
import { newMap } from "../src/map.js";
import * as H from "../src/hex.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const json = (x) => JSON.stringify(x);
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const terrain = (s) => json([s.map.levels, s.map.walls]);
function deepFreeze(x) { if (x && typeof x === "object" && !Object.isFrozen(x)) { Object.freeze(x); for (const v of Object.values(x)) deepFreeze(v); } return x; }
const WRITE = /read.only|not extensible|Cannot delete property|Cannot define property|object is not extensible/;

// A small stone floor with a wooden door, a hidden pit trap and a lever; the party at its start; a goblin; optionally in a fight.
function world({ fight = false } = {}) {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 6).map((h) => [H.col(h), { t: "stone" }]));
  const s = newGame(8);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  ok(apply(s, { type: "loadMap", map: newMap({ id: "floor", name: "A floor", starts: [{ q: -4, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }],
    walls: [{ id: "w1", kind: "wall", level: "ground", at: { q: 3, r: 3 }, edge: 0 }].slice(0, 0),
    objects: [
      { id: "door", def: "door-wooden", level: "ground", at: { q: 1, r: 1 }, edge: 0, state: "closed" },
      { id: "pit", def: "pit-trap", level: "ground", at: { q: 2, r: 0 }, state: "hidden" },
      { id: "lever", def: "lever", level: "ground", at: { q: -2, r: 2 }, state: "up" },
    ] }) }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 3, r: -1 } }, DM));
  if (fight) {
    ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
    for (let i = 0; i < 30 && current(s) !== "fighter"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  }
  return s;
}

// The goblin of `world()`: its id is whatever the engine gave it.
const GOB = (() => { const s = world(); return Object.keys(s.entities).find((id) => s.entities[id].side !== "party"); })();

// Payloads that make sense on `world()`: every kind of action, so that the frozen-terrain run reaches into the handlers and not only
// into their refusals. (GOB is the goblin; `door`, `pit` and `lever` are the objects.)
const SENSE = [
  { type: "move", actor: "fighter", to: { q: -3, r: 1 } }, { type: "move", actor: "fighter", to: { q: 3, r: 0 } }, { type: "dash", actor: "fighter" }, { type: "stand", actor: "fighter" },
  { type: "disengage", actor: "fighter" }, { type: "follow", actor: "rogue", leader: "fighter" }, { type: "follow", actor: "rogue", leader: null },
  { type: "marchingOrder", order: ["rogue", "fighter", "cleric", "wizard"] }, { type: "partyFollow", leader: "fighter", shape: "line" }, { type: "formation", leader: "fighter", shape: "line" },
  { type: "mount", actor: "fighter", mount: GOB }, { type: "dismount", actor: "fighter" },
  { type: "attack", actor: "fighter", target: GOB }, { type: "act", actor: GOB, action: "scimitar", target: "fighter" }, { type: "dodge", actor: "fighter" },
  { type: "reactions", actor: "wizard", set: { shield: "always" } }, { type: "endTurn", actor: "fighter" },
  { type: "cast", actor: "wizard", spell: "fire-bolt", target: GOB }, { type: "cast", actor: "wizard", spell: "moonbeam", hex: { q: 3, r: -1 } }, { type: "cast", actor: "wizard", spell: "web", hex: { q: 3, r: -1 } },
  { type: "secondWind", actor: "fighter" }, { type: "feature", actor: "fighter", feature: "second-wind" }, { type: "use", actor: "fighter", object: "lever", verb: "pull" }, { type: "use", actor: "fighter", object: "door", verb: "open" },
  { type: "check", actor: "fighter", skill: "perception" }, { type: "search", actor: "rogue" }, { type: "hide", actor: "rogue" },
  { type: "setSpeed", actor: "fighter", mode: "fly", feet: 30 }, { type: "setSize", actor: "fighter", size: "large" }, { type: "give", actor: "fighter", item: "Rope" }, { type: "drop", actor: "fighter", item: "Rope" },
  { type: "pass", actor: "fighter", item: "Rope", to: "rogue" }, { type: "levelUp", actor: "fighter" },
  { type: "rest" }, { type: "shortRest" }, { type: "advanceTime", minutes: 60 }, { type: "chronicle", title: "t" }, { type: "conclusion", edit: {} },
  { type: "claim", entity: "fighter", user: "pat", userName: "Pat" }, { type: "release", entity: "fighter" }, { type: "stepAway", actor: "rogue" }, { type: "stepBack", actor: "rogue" },
  { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, { type: "endEncounter" }, { type: "spawn", monster: "wolf", at: { q: 2, r: 2 } }, { type: "place", actor: "fighter", to: { q: 1, r: 0 } },
  { type: "place", actor: "fighter", to: { q: 2, r: 0 } }, { type: "revealRegion", region: "r1", revealed: true }, { type: "setObject", object: "door", state: "open" }, { type: "setObject", object: "pit", state: "open" },
  { type: "remove", actor: GOB }, { type: "setLight", actor: "fighter", item: "torch" }, { type: "reveal", actor: GOB, hidden: true }, { type: "condition", actor: "fighter", condition: "prone", on: true },
  { type: "setHp", actor: "fighter", hp: 3 }, { type: "harm", actor: "fighter", amount: 4 }, { type: "mend", actor: "fighter", amount: 4 },
  { type: "handout", id: "h1", title: "T", text: "x" }, { type: "note", to: "pat", text: "x" }, { type: "scene", id: "s1", title: "S" }, { type: "endScene" }, { type: "say", text: "hi" },
  { type: "askCheck", actor: "fighter", skill: "perception", dc: 10 }, { type: "setting", key: "autoEngage", value: true }, { type: "setPacks", packs: [] },
  { type: "bond", actor: GOB, to: "wizard", kind: "pet" }, { type: "companionOrder", actor: GOB, order: "follow" }, { type: "command", actor: "wizard", ids: [GOB], order: "attack" },
  { type: "companion", actor: GOB, auto: true }, { type: "dismiss", actor: GOB }, { type: "recall", actor: GOB },
  { type: "pickUp", actor: "fighter", object: "pile" }, { type: "equip", actor: "fighter", item: "x" }, { type: "attune", actor: "fighter", item: null },
];
// The same, where the game must first be put in a state for the action to make sense (`pre`), or the payload is read from that state.
const turnOf = (s, id) => { for (let i = 0; i < 30 && s.encounter && current(s) !== id; i++) apply(s, { type: "endTurn", actor: current(s) }, DM); };
const lastObj = (s) => s.map.objects.at(-1)?.id;
const lasting = (s) => s.effects?.[0]?.id;
const SENSE2 = [
  // A hold (docs/specs/grapple-shove.md, stage G2): the fighter holds the goblin, or the goblin the fighter, with a range no base passes.
  { pre: (s) => { s.entities[GOB].cond.grappled = { source: "fighter", holds: [{ by: "fighter", with: "hand", escape: 10, range: 300 }] }; }, a: { type: "letGo", actor: "fighter", target: GOB } },
  { pre: (s) => { s.entities.fighter.cond.grappled = { source: GOB, holds: [{ by: GOB, with: "hand", escape: 10, range: 300 }] }; }, a: { type: "escape", actor: "fighter" } },
  { pre: (s) => apply(s, { type: "condition", actor: "fighter", condition: "prone", on: true }, DM), a: { type: "stand", actor: "fighter" } },
  { pre: (s) => apply(s, { type: "setSize", actor: GOB, size: "large" }, DM), a: { type: "mount", actor: "fighter", mount: GOB } },
  { pre: (s) => { apply(s, { type: "setSize", actor: GOB, size: "large" }, DM); apply(s, { type: "mount", actor: "fighter", mount: GOB }, DM); }, a: { type: "dismount", actor: "fighter" } },
  { a: (s) => ({ type: "attack", actor: "fighter", attack: s.entities.fighter.actions?.[0]?.id ?? "x", target: GOB }) },
  { pre: (s) => turnOf(s, GOB), a: (s) => ({ type: "act", actor: GOB, action: s.entities[GOB].actions?.[0]?.id, target: "fighter" }) },
  { pre: (s) => apply(s, { type: "setHp", actor: "fighter", hp: 3 }, DM), a: { type: "secondWind", actor: "fighter" } },
  { pre: (s) => apply(s, { type: "place", actor: "fighter", to: { q: -2, r: 1 } }, DM), a: { type: "use", actor: "fighter", object: "lever", verb: "pull" } },
  { pre: (s) => apply(s, { type: "give", actor: "fighter", item: "Rope" }, DM), a: { type: "pass", actor: "fighter", item: "Rope", to: "rogue" } },
  { pre: (s) => apply(s, { type: "give", actor: "fighter", item: "Rope" }, DM), a: { type: "drop", actor: "fighter", item: "Rope" } },
  { pre: (s) => { apply(s, { type: "give", actor: "fighter", item: "Rope" }, DM); apply(s, { type: "drop", actor: "fighter", item: "Rope" }, DM); }, a: (s) => ({ type: "pickUp", actor: "fighter", object: lastObj(s) }) },
  { pre: (s) => apply(s, { type: "claim", entity: "fighter", user: "pat", userName: "Pat" }, { role: "player", userId: "pat" }), a: { type: "release", entity: "fighter" } },
  { pre: (s) => apply(s, { type: "stepAway", actor: "rogue" }, DM), a: { type: "stepBack", actor: "rogue" } },
  { pre: (s) => apply(s, { type: "mapEdit", ops: [{ op: "region", region: { id: "r1", name: "R", level: "ground", hexes: ["0,0", "1,0"] } }] }, DM), a: { type: "revealRegion", region: "r1", revealed: true } },
  { a: { type: "handout", handout: { title: "H", text: "x" } } },
  { pre: (s) => apply(s, { type: "handout", handout: { title: "H", text: "x" } }, DM), a: (s) => ({ type: "showHandout", handout: s.handouts?.[0]?.id, to: "all" }) },
  { pre: (s) => apply(s, { type: "handout", handout: { title: "H", text: "x" } }, DM), a: (s) => ({ type: "hideHandout", handout: s.handouts?.[0]?.id }) },
  { pre: (s) => apply(s, { type: "handout", handout: { title: "H", text: "x" } }, DM), a: (s) => ({ type: "removeHandout", handout: s.handouts?.[0]?.id }) },
  { pre: (s) => apply(s, { type: "bond", actor: GOB, to: "wizard", kind: "familiar" }, DM), a: { type: "companionOrder", actor: "wizard", id: GOB, order: "stay" } },
  { pre: (s) => apply(s, { type: "bond", actor: GOB, to: "wizard", kind: "familiar" }, DM), a: { type: "command", actor: "wizard", ids: [GOB], order: "stay" } },
  { pre: (s) => apply(s, { type: "bond", actor: GOB, to: "wizard", kind: "familiar" }, DM), a: { type: "dismiss", actor: "wizard", id: GOB } },
  { pre: (s) => { apply(s, { type: "bond", actor: GOB, to: "wizard", kind: "familiar" }, DM); apply(s, { type: "dismiss", actor: "wizard", id: GOB }, DM); }, a: { type: "recall", actor: "wizard", id: GOB } },
  { pre: (s) => apply(s, { type: "bond", actor: GOB, to: "wizard", kind: "familiar" }, DM), a: { type: "companion", actor: GOB, auto: true } },
  { pre: (s) => apply(s, { type: "cast", actor: "wizard", spell: "moonbeam", hex: { q: 3, r: -1 } }, DM), a: (s) => ({ type: "endEffect", effect: lasting(s) }) },
  { pre: (s) => apply(s, { type: "scene", scene: { title: "S" } }, DM), a: { type: "endScene" } },
];
const lcg = (n) => () => (n = (Math.imul(n, 1103515245) + 12345) >>> 0) / 4294967296;
const HEX = [{ q: 0, r: 0 }, { q: 2, r: 1 }, { q: -1, r: 0 }, { q: 2, r: 0 }, { q: 4, r: -1 }, { q: 1, r: 1, z: 0 }];
const WHO = ["wizard", "fighter", "rogue", "cleric", GOB, "door", "pit", "lever", "nobody"];
const POOL = {
  actor: WHO, target: WHO, entity: WHO, id: WHO, object: ["door", "pit", "lever"], to: [...HEX, ...WHO], at: HEX, hex: HEX, center: HEX, from: HEX,
  state: ["open", "closed", "locked", "found", "pressed", "down"], spell: ["fire-bolt", "magic-missile", "web", "shield", "light", "misty-step", "moonbeam"],
  action: ["scimitar", "dodge", "bite"], item: ["torch", "lamp", "rope", "dagger", null], amount: [1, 5, 40], hp: [0, 1, 9], minutes: [10, 60, 480],
  text: ["hello"], title: ["t"], name: ["n"], key: ["autoEngage", "sight", "pace"], value: [false, true, "all", "ask"], condition: ["prone", "blinded", "stunned"],
  on: [true, false], mode: ["walk", "fly", "swim"], feet: [0, 30, 40], kind: ["familiar", "pet", "summon"], radius: [4, 8], region: ["r1", "start"],
  monster: ["goblin-warrior", "wolf", "skeleton"], level: [1, 2], slot: [1, 2], take: ["shield", null], prompt: [1, 2], order: [["fighter", "wizard"], "before", "after"],
  ids: [["wizard"], ["fighter", "rogue"], [GOB]], targets: [[GOB], ["wizard", "fighter"]], leader: WHO, master: WHO, dir: ["away", "toward"], user: ["u1"], userName: ["U"],
  scene: ["s1"], line: ["x"], packs: [[]], handout: ["h1"], feature: ["second-wind", "rage", "wild-shape"], ability: ["str", "dex"], skill: ["stealth", "perception"],
  type2: ["x"], dtype: ["fire", "untyped"], rest: ["short", "long"], list: [[]],
};
const KEYS = Object.keys(POOL);

// Fuzz: for each type, many payloads built from the pools.
function payloads(type, n, R) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = { type }, k = 1 + Math.floor(R() * 6);
    for (let j = 0; j < k; j++) { const key = KEYS[Math.floor(R() * KEYS.length)], pool = POOL[key]; a[key] = pool[Math.floor(R() * pool.length)]; }
    out.push(a);
  }
  return out;
}

test("no action type outside TERRAIN_ACTIONS changes the terrain: every type played, many payloads, terrain frozen, hash compared", () => {
  const near = world({ fight: true });                                   // the fighter's turn, a goblin beside it
  ok(apply(near, { type: "place", actor: GOB, to: { q: near.entities.fighter.pos.q + 1, r: near.entities.fighter.pos.r } }, DM));
  const bases = [world(), world({ fight: true }), near];
  const R = lcg(425), accepted = new Map(), bad = [];
  const roles = [DM, { role: "player", userId: "u1" }];
  for (const type of ACTION_TYPES) {
    const sense = [...SENSE.filter((x) => x.type === type).map((a) => ({ a })), ...SENSE2.filter((x) => (typeof x.a === "function" ? x.a(bases[0]) : x.a).type === type)];
    const plays = [...sense.flatMap((x) => bases.map((_, b) => [x, b])), ...payloads(type, 30, R).map((x, i) => [{ a: x, fuzz: i }, i % 3])];
    for (const [x, b] of plays) {
      const s = structuredClone(bases[b]);
      try { x.pre?.(s); } catch { /* a setup that does not apply here: the action is tried all the same */ }
      deepFreeze(s.map.levels); deepFreeze(s.map.walls);
      const before = terrain(s), a = typeof x.a === "function" ? x.a(s) : x.a;
      let r;
      try { r = apply(s, a, x.fuzz % 4 === 3 ? roles[1] : roles[0]); } catch (err) {
        if (err instanceof TypeError && WRITE.test(err.message)) bad.push(`${type}: wrote to the terrain in place (${err.message})`);
        continue;
      }
      if (r.ok) accepted.set(type, (accepted.get(type) ?? 0) + 1); 
      if (terrain(s) !== before && !TERRAIN_ACTIONS.has(type)) bad.push(`${type}: the terrain changed`);
    }
  }
  assert.deepEqual(bad, []);
  // The types the scripted payloads never got accepted (they need a built sheet, a waiting question, a reward, a scene, a spell's lasting effect or a
  // companion of a spell): only their refusals were played with the terrain frozen; the static scan below covers what they could do.
  const never = ACTION_TYPES.filter((x) => !accepted.has(x) && !TERRAIN_ACTIONS.has(x));
  const KNOWN = ["attack", "reactions", "endEffect", "feature", "hide", "addCharacter", "editCharacter", "setSheet", "levelUp", "equip", "shield", "attune", "conclusion", "scene", "sceneNpc", "sceneChronicle", "companionOrder", "command", "dismiss", "recall", "react"];
  assert.deepEqual(never.filter((x) => !KNOWN.includes(x)), [], "an action type that used to be reached is no longer: extend the payloads");
  assert.ok(accepted.size >= 25, `the payloads were accepted for ${accepted.size} action types`);
});

test("no action type outside the list changes the terrain in ordinary AI-played fights either (frozen terrain, 6 fights)", () => {
  for (let seed = 1; seed <= 6; seed++) {
    const s = newGame(seed);
    deepFreeze(s.map.levels); deepFreeze(s.map.walls);
    const before = terrain(s);
    ok(apply(s, { type: "startEncounter", center: { q: 2, r: 0 }, radius: 10 }, DM));
    for (let i = 0; i < 200 && s.encounter; i++) {
      const id = current(s);
      const a = aiStep(s, id) ?? { type: "endTurn", actor: id };
      if (!apply(s, a, DM).ok) apply(s, { type: "endTurn", actor: id }, DM);
    }
    assert.equal(terrain(s), before, `seed ${seed}`);
  }
});

test("the list is not empty words: mapEdit and loadMap do change the terrain, and still restore it if they throw", () => {
  assert.deepEqual([...TERRAIN_ACTIONS].sort(), ["loadMap", "mapEdit"]);
  const s = world(), before = json(s), t0 = terrain(s);
  const real = Array.prototype.push, boom = new Error("boom");
  let changed = null;
  Array.prototype.push = function (...x) { if (changed === null && this !== s.timeline && x.some((e) => e && e.type === "mapEdit")) { changed = terrain(s) !== t0 || s.map !== undefined; throw boom; } return real.apply(this, x); };
  try { assert.throws(() => apply(s, { type: "mapEdit", ops: [{ op: "tile", level: "ground", at: { q: 9, r: 9 }, tile: { t: "stone" } }] }, DM), (e) => e === boom); } finally { Array.prototype.push = real; }
  assert.equal(changed, true);
  assert.equal(json(s), before);
  ok(apply(s, { type: "mapEdit", ops: [{ op: "tile", level: "ground", at: { q: 9, r: 9 }, tile: { t: "stone" } }] }, DM));
  assert.notEqual(terrain(s), t0);
});

// ---------- objects are restored with the copy ----------
function throwingAt(s, type, fn) {
  const real = Array.prototype.push, out = { err: null, injected: null, objects: null };
  const before = json(s.map.objects);
  Array.prototype.push = function (...items) {
    if (out.injected === null && this !== s.timeline && items.some((x) => x && x.type === type)) { out.injected = new Error(`injected at ${type}`); out.objects = json(s.map.objects) !== before; throw out.injected; }
    return real.apply(this, items);
  };
  try { fn(); } catch (err) { out.err = err; } finally { Array.prototype.push = real; }
  return out;
}
test("a door opened and a trap fired in the action that then throws: the objects, the terrain and the whole game are restored", () => {
  for (const [name, action] of [["door", { type: "setObject", object: "door", state: "open" }], ["trap", { type: "move", actor: "fighter", to: { q: 3, r: 0 } }]]) {
    const s = world(), before = json(s), objs = json(s.map.objects), levels = s.map.levels, walls = s.map.walls;
    // Walk the fighter next to the pit first, so that one move fires it (the pit is hidden: it fires on entering).
    if (name === "trap") { ok(apply(s, { type: "place", actor: "fighter", to: { q: 0, r: 0 } }, DM)); }
    const was = json(s);
    const out = throwingAt(s, "object", () => apply(s, action, DM));
    assert.ok(out.injected, `${name}: an object event was pushed`);
    assert.equal(out.objects, true, `${name}: the object's state had already changed`);
    assert.equal(out.err, out.injected);
    assert.equal(json(s), was, `${name}: byte-identical`);
    assert.equal(json(s.map.objects), name === "trap" ? json(s.map.objects) : objs);
    assert.equal(s.map.levels, levels, "the terrain is the very same object");
    assert.equal(s.map.walls, walls);
    assert.equal(s.map.objects.find((o) => o.id === "door").state, "closed");
    assert.equal(s.map.objects.find((o) => o.id === "pit").state, "hidden");
    void before;
    // And the same action then plays.
    ok(apply(s, action, DM));
  }
});

// ---------- the copy does not grow with the map ----------
test("the copy kept for a restore holds the terrain by reference: a big map adds nothing to what an action copies", () => {
  const s = world();
  const tiles = s.map.levels[0].tiles;
  for (const h of H.range({ q: 0, r: 0 }, 60)) tiles[H.col(h)] ??= { t: "stone" };
  assert.ok(Object.keys(tiles).length > 10000);
  const levels = s.map.levels, walls = s.map.walls;
  const real = globalThis.structuredClone; let bytes = 0;
  globalThis.structuredClone = (x, o) => { bytes += json(x)?.length ?? 0; return real(x, o); };
  try { ok(apply(s, { type: "say", text: "hi" }, DM)); } finally { globalThis.structuredClone = real; }
  assert.ok(bytes < 200000, `an action cloned ${bytes} bytes of a map of ${Object.keys(tiles).length} tiles`);
  assert.equal(s.map.levels, levels);
  assert.equal(s.map.walls, walls);
});

// ---------- and by reading the source ----------
test("nothing in the engine writes to a level's tiles, the levels or the walls in place, except the map edits that mapEdit applies to a copy", async () => {
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const src = new URL("../src/", import.meta.url).pathname;
  const files = [];
  (function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== "srd52" && f !== "maps") walk(p); } else if (f.endsWith(".js")) files.push(p); } })(src);
  const WRITES = [/\.tiles\[[^\]]*\]\s*=[^=]/, /delete [^;\n]*\.tiles\b/, /\.levels\.(push|splice|sort|pop|shift|unshift|reverse)\(/, /\.walls\.(push|splice|sort|pop|shift|unshift)\(/, /\.walls\s*=[^=]/, /\.walls\[[^\]]*\]\s*=[^=]/, /\.levels\s*=[^=]/, /\btile\.(t|lift)\s*=[^=]/];
  const found = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    text.split("\n").forEach((line, i) => { if (!/^\s*\/\//.test(line) && WRITES.some((re) => re.test(line))) found.push(`${f.slice(src.length)}:${i + 1}`); });
  }
  // map.js's EDITS (applied by dm.js to `structuredClone(s.map)`); nothing else.
  assert.ok(found.every((x) => x.startsWith("map.js:")), `writes to the terrain outside map.js: ${found.join(", ")}`);
  const users = files.filter((f) => /\bEDITS\b/.test(readFileSync(f, "utf8"))).map((f) => f.slice(src.length)).sort();
  assert.deepEqual(users, ["engine/dm.js", "map.js"]);
  assert.match(readFileSync(join(src, "engine/dm.js"), "utf8"), /const map = structuredClone\(s\.map\);[\s\S]*?EDITS|structuredClone\(s\.map\)[\s\S]{0,400}edit\(map, op\)/);
});
