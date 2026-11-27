// Deep pits (#806, docs/specs/maps-and-objects.md "Amendment: deep pits"): a placement's `fall` sets a pit's depth; a pit that
// reaches a floor below drops the creature onto it at the same column.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT } from "../src/content/index.js";
import { apply } from "../src/engine.js";
import * as H from "../src/hex.js";
import { lintMap, newMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const tiles = (n) => Object.fromEntries(H.range({ q: 0, r: 0 }, n).map((h) => [H.col(h), { t: "stone" }]));
const pit = (more = {}, def = "spiked-pit") => ({ id: "pit", def, level: "ground", at: { q: 1, r: 0 }, state: "open", ...more });
// Ground at z 0, a cellar at z -30 under it (tiles everywhere), the fighter at -2,0.
function world(objects, lower = { id: "cellar", name: "Cellar", z: -30, tiles: tiles(6) }) {
  const s = newGame(8);
  const levels = [{ id: "ground", name: "Ground", z: 0, tiles: tiles(6) }];
  if (lower) levels.push(lower);
  ok(apply(s, { type: "loadMap", map: newMap({ id: "p", name: "Pits", starts: [{ q: -4, r: 0 }], levels, objects }) }, DM));
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  apply(s, { type: "claim", entity: "fighter", user: "pat", userName: "Pat" }, PAT);
  ok(apply(s, { type: "place", actor: "fighter", to: { q: -2, r: 0 } }, DM));
  return s;
}
const walkIn = (s) => ok(apply(s, { type: "move", actor: "fighter", to: { q: 1, r: 0 } }, PAT));
const fell = (r) => r.events.find((e) => e.type === "fell");

test("a 30 ft pit over a cellar lands the creature on the cellar floor, same column, with 3d6 and Prone", () => {
  const s = world([pit({ fall: 30 }, "pit-trap")]);
  ok(apply(s, { type: "setObject", object: "pit", state: "found" }, DM));
  const r = walkIn(s);
  assert.equal(fell(r).feet, 30);
  assert.deepEqual(s.entities.fighter.pos, { q: 1, r: 0, z: -30 });
  const hit = r.events.find((e) => e.type === "damage");
  assert.ok(hit.amount >= 3 && hit.amount <= 18, `3d6 gives 3 to 18, got ${hit.amount}`);
  assert.equal(hit.dice.length, 3);
  assert.ok(r.events.some((e) => e.type === "cond" && e.cond === "prone"));
});

test("the actual drop is what is rolled: a 60 ft pit over a floor 20 ft down is 2d6, and the highest floor catches it", () => {
  const s = world([pit({ fall: 60 }, "pit-trap")], { id: "cellar", name: "Cellar", z: -20, tiles: tiles(6) });
  ok(apply(s, { type: "setObject", object: "pit", state: "found" }, DM));
  const r = walkIn(s);
  assert.equal(fell(r).feet, 20);
  assert.equal(s.entities.fighter.pos.z, -20);
  assert.equal(r.events.find((e) => e.type === "damage").dice.length, 2);
});

test("a spiked pit adds its piercing damage after it lands", () => {
  const s = world([pit({ fall: 30 })]);
  const r = walkIn(s);
  const types = r.events.map((e) => e.type);
  assert.ok(types.indexOf("fell") < types.lastIndexOf("damage"));
  assert.equal(s.entities.fighter.pos.z, -30);
  assert.ok(r.events.filter((e) => e.type === "damage").some((e) => e.dmgType === "piercing" || e.damageType === "piercing" || JSON.stringify(e).includes("piercing")));
});

test("the default 10 ft pit plays as before, even over a lower level: the creature stays on its level", () => {
  const s = world([pit()]);
  const r = walkIn(s);
  assert.equal(fell(r).feet, 10);
  assert.deepEqual(s.entities.fighter.pos, { q: 1, r: 0, z: 0 });
  const t = world([pit({ fall: 10 })]);
  walkIn(t);
  assert.deepEqual(t.entities.fighter.pos, { q: 1, r: 0, z: 0 });
});

test("a hidden pit with a depth springs by its save, and a creature that leaps clear stays up", () => {
  const s = world([pit({ fall: 30, state: "hidden" }, "pit-trap")]);
  let landed = false;
  for (let seed = 1; seed < 60 && !landed; seed++) {
    const c = structuredClone(s); c.rng = seed;
    const r = walkIn(c);
    if (fell(r)) { landed = true; assert.equal(c.entities.fighter.pos.z, -30); } else assert.equal(c.entities.fighter.pos.z, 0);
  }
  assert.ok(landed);
});

test("a creature already standing where it would land: it lands on the nearest free place", () => {
  const s = world([pit({ fall: 30 }, "pit-trap")]);
  ok(apply(s, { type: "setObject", object: "pit", state: "found" }, DM));
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0, z: -30 } }, DM));
  walkIn(s);
  const p = s.entities.fighter.pos;
  assert.equal(p.z, -30);
  assert.notDeepEqual([p.q, p.r], [1, 0]);
});

test("the linter takes a depth only as a multiple of 10 up to 200, only on something that falls, and only with a floor below", () => {
  const lint = (objects, lower) => {
    const levels = [{ id: "ground", name: "Ground", z: 0, tiles: tiles(6) }, ...(lower === null ? [] : [lower ?? { id: "cellar", name: "Cellar", z: -30, tiles: tiles(6) }])];
    return lintMap(newMap({ id: "p", name: "Pits", starts: [{ q: -4, r: 0 }], levels, objects })).join(" | ");
  };
  assert.equal(lint([pit({ fall: 30 })]), "");
  const refused = apply(newGame(8), { type: "loadMap", map: newMap({ id: "p", name: "Pits", starts: [{ q: -4, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles: tiles(6) }], objects: [pit({ fall: 30 })] }) }, DM);
  assert.ok(!refused.ok, "a map cannot be loaded with a pit that has nothing below");
  assert.equal(lint([pit({ fall: 10 })], null), "");
  assert.match(lint([pit({ fall: 30 })], null), /no floor within 30 feet below/);
  assert.match(lint([pit({ fall: 30 })], { id: "cellar", name: "Cellar", z: -50, tiles: tiles(6) }), /no floor within 30 feet below/);
  assert.match(lint([pit({ fall: 30 })], { id: "cellar", name: "Cellar", z: -30, tiles: { "9,9": { t: "stone" } } }), /no floor within 30 feet/);
  assert.match(lint([pit({ fall: 25 })]), /multiple of 10/);
  assert.match(lint([pit({ fall: 0 })]), /multiple of 10/);
  assert.match(lint([pit({ fall: 210 })]), /multiple of 10 from 10 to 200/);
  assert.match(lint([pit({ fall: "30" })]), /multiple of 10/);
  assert.match(lint([{ id: "l", def: "lever", level: "ground", at: { q: 1, r: 0 }, state: CONTENT.objects.lever.initial, fall: 30 }]), /its kind does not fall/);
});

test("the map editor accepts a depth, lints it, and keeps the map as it was when refused", () => {
  const s = world([pit({ state: "found" })]);
  const before = structuredClone(s.map);
  const r = apply(s, { type: "mapEdit", ops: [{ op: "object", object: { ...pit({ state: "found" }), fall: 25 } }] }, DM);
  assert.ok(!r.ok);
  assert.match(r.error, /multiple of 10/);
  assert.deepEqual(s.map, before);
  ok(apply(s, { type: "mapEdit", ops: [{ op: "object", object: { ...pit({ state: "found" }), fall: 30 } }] }, DM));
  assert.equal(s.map.objects[0].fall, 30);
  assert.ok(!apply(s, { type: "mapEdit", ops: [{ op: "unlevel", id: "cellar" }] }, DM).ok, "taking the floor away from a deep pit is refused");
  walkIn(s);
  assert.equal(s.entities.fighter.pos.z, -30);
});

// ---- the DM's branches, big creatures, raised tiles and where it stands (review of #806) ----
import { viewEvents } from "../src/view.js";
const manuals = (r) => r.events.filter((e) => e.type === "manual");
const found = (objects, lower) => { const s = world(objects, lower); ok(apply(s, { type: "setObject", object: "pit", state: "found" }, DM)); return s; };

test("a rider or a ridden creature is handed to the DM, not moved, and players are sent no note", () => {
  const s = found([pit({ fall: 30 }, "pit-trap")]);
  s.entities.fighter.riding = "cleric";                       // the pair is the DM's
  const r = walkIn(s);
  const m = manuals(r);
  assert.equal(m.length, 1);
  assert.equal(m[0].partial, true);
  assert.match(m[0].text, /riding or being ridden/);
  assert.equal(s.entities.fighter.pos.z, 0);
  assert.equal(viewEvents(r.events, s, PAT).filter((e) => e.type === "manual").length, 0);
});

test("with no room to land the DM is told, nothing moves, and players are sent no note", () => {
  const s = found([pit({ fall: 30 }, "pit-trap")], { id: "cellar", name: "Cellar", z: -30, tiles: { "1,0": { t: "stone" } } });
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0, z: -30 } }, DM));
  const r = walkIn(s);
  const m = manuals(r);
  assert.equal(m.length, 1);
  assert.equal(m[0].partial, true);
  assert.match(m[0].text, /no room/);
  assert.equal(s.entities.fighter.pos.z, 0);
  assert.equal(viewEvents(r.events, s, PAT).filter((e) => e.type === "manual").length, 0);
});

test("a pit on a raised tile drops from the tile's top: the floor is measured from the tile, not the level", () => {
  const up = { ...tiles(6), "1,0": { t: "stone", h: 5 } };
  const s = world([pit({ fall: 40 }, "pit-trap")], { id: "cellar", name: "Cellar", z: -35, tiles: tiles(6) });
  s.map.levels[0].tiles = up;
  ok(apply(s, { type: "setObject", object: "pit", state: "found" }, DM));
  assert.equal(lintMap(structuredClone(s.map)).join(), "");
  const r = walkIn(s);
  assert.equal(fell(r).feet, 40);
  assert.equal(s.entities.fighter.pos.z, -35);
  assert.ok(lintMap(newMap({ id: "p", name: "P", starts: [{ q: -4, r: 0 }], levels: [{ id: "ground", name: "G", z: 0, tiles: up }, { id: "cellar", name: "C", z: -35, tiles: tiles(6) }], objects: [pit({ fall: 30 })] })).join().includes("no floor within 30"), "from 5 up, 30 ft reaches -25 only");
});

test("a Large creature that triggers the pit by a hex it covers, its anchor elsewhere, lands under its anchor column", () => {
  const s = found([pit({ fall: 30 }, "pit-trap")]);
  Object.assign(s.entities.fighter, { size: "large" });
  const r = apply(s, { type: "move", actor: "fighter", to: { q: 0, r: 0 } }, PAT);
  assert.ok(r.ok, r.error);
  assert.ok(r.events.some((e) => e.type === "triggered"));
  assert.equal(fell(r).feet, 30);
  assert.deepEqual(s.entities.fighter.pos, { q: 0, r: 0, z: -30 }, "under where it stands, not under the pit hex");
});

test("a Large creature that triggers the pit by a hex it covers, with no floor under its anchor hex, is handed to the DM, not hurt for a fall it did not make", () => {
  const cellar = { id: "cellar", name: "Cellar", z: -30, tiles: Object.fromEntries(Object.entries(tiles(6)).filter(([k]) => k !== "0,0")) };
  const s = found([pit({ fall: 30 }, "pit-trap")], cellar);
  Object.assign(s.entities.fighter, { size: "large" });
  const hp = s.entities.fighter.hp;
  const r = apply(s, { type: "move", actor: "fighter", to: { q: 0, r: 0 } }, PAT);
  assert.ok(r.ok, r.error);
  assert.ok(r.events.some((e) => e.type === "triggered"), "the pit went off");
  assert.deepEqual(s.entities.fighter.pos, { q: 0, r: 0, z: 0 }, "the creature's anchor is not on the pit hex");
  assert.equal(manuals(r).length, 1);
  assert.equal(manuals(r)[0].partial, true);
  assert.match(manuals(r)[0].text, /no floor within that depth/);
  assert.equal(s.entities.fighter.hp, hp);
  assert.ok(!fell(r));
});
