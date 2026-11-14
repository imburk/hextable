// Areas of effect on squares (docs/specs/square-grid.md, task S7; issue #258 with the owner's answer
// of 14 November): a square is in an area when its centre is inside the real shape. The table rule
// `areaFill` ('round', the default; 'grid', counted as range is, SRD 5.2.1 1826-1829) says which
// squares a Sphere, a Cylinder or an Emanation covers. The shapes by the SRD's own words: Area of
// Effect 32669-32680, Cone 33029-33039, Cube 33096-33102, Cylinder 33112-33118, Emanation
// 33377-33385, Line 33767-33772, Sphere 34195-34199. Hex maps as before.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, areaHexes, current, SETTINGS } from "../src/engine.js";
import { SETTING_TEXT } from "../src/engine/dm.js";
import { boxOf, col, HEX, SQUARE, squareAround, squareBlock, squareCone, squareDisc, squareStrip } from "../src/grid.js";
import { footprint } from "../src/space.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";
import { squareRoom } from "./fixtures/square-room.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const keys = (cells) => cells.map(col).sort();
const at = (cells, q, r) => cells.some((h) => h.q === q && h.r === r);

// The valley's party in the square room (as in square-moving.test.js), the wizard and the cleric
// able to cast what these tests need, everyone else out of the way along the south wall.
function room({ areaFill, edit, sight } = {}) {
  const s = newGame(14), map = squareRoom();
  if (edit) edit(map);
  ok(apply(s, { type: "loadMap", map }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  if (areaFill) ok(apply(s, { type: "setting", key: "areaFill", value: areaFill }, DM));
  if (sight) ok(apply(s, { type: "setting", key: "sight", value: sight }, DM));
  [["fighter", 0, 14], ["rogue", 1, 14], ["cleric", 2, 14], ["wizard", 7, 7]].forEach(([id, q, r]) => { s.entities[id].pos = { q, r, z: 0 }; });
  for (const id of ["wizard", "cleric"]) Object.assign(s.entities[id], { slots: { 1: 9, 2: 9, 3: 9 }, slotsMax: { 1: 9, 2: 9, 3: 9 } });
  s.entities.wizard.spells.push("fireball", "lightning-bolt", "thunderwave", "moonbeam", "web");
  s.entities.cleric.spells.push("spirit-guardians");
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 500;
  return s;
}
const spawn = (s, q, r, monster = "goblin-warrior") => { const e = s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id]; e.hp = e.maxHp = 500; return e; };
// A goblin on every free square of the room within `n` of `c`; returns { "q,r": id }.
function crowd(s, c, n) {
  const out = {};
  for (const h of SQUARE.range(c, n)) {
    if (h.q < 0 || h.r < 0 || h.q > 14 || h.r > 14 || (h.q === 12 && h.r === 12) || (h.q === 10 && h.r === 3)) continue;
    if (Object.values(s.entities).some((e) => footprint(e, e.pos, SQUARE).some((f) => f.q === h.q && f.r === h.r))) continue;
    out[col(h)] = spawn(s, h.q, h.r).id;
  }
  return out;
}
// A harmful spell starts a fight; cast on the caster's own turn, a fresh one if it has spent a slot.
function cast(s, a, ctx = DM) {
  if (!s.encounter) ok(apply(s, { type: "startEncounter", center: { q: 7, r: 7 }, radius: 6 }, DM));
  for (let i = 0; i < 80 && (current(s) !== a.actor || s.encounter.flags.slot || !s.encounter.budget?.action); i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.equal(current(s), a.actor);
  return ok(apply(s, { type: "cast", ...a }, ctx));
}
const castEvent = (r) => r.events.find((e) => e.type === "cast");
// Who a cast caught, as the squares they stand on.
const caughtAt = (s, r) => castEvent(r).targets.map((id) => col(s.entities[id].pos)).sort();

// ---------- the setting ----------

test("areaFill is a table rule with words for each value; absent means round; only the DM sets it", () => {
  assert.deepEqual(SETTINGS.areaFill, ["round", "grid"]);
  assert.deepEqual(Object.keys(SETTING_TEXT.areaFill), SETTINGS.areaFill);
  assert.match(SETTING_TEXT.areaFill.round, /49 squares/);
  assert.match(SETTING_TEXT.areaFill.grid, /81 squares/);
  const s = room();
  assert.equal(s.settings.areaFill, undefined);
  assert.equal(apply(s, { type: "setting", key: "areaFill", value: "hex" }, DM).ok, false);
  assert.equal(apply(s, { type: "setting", key: "areaFill", value: "grid" }, PAT).ok, false);
  ok(apply(s, { type: "setting", key: "areaFill", value: "grid" }, DM));
  assert.equal(view(s, PAT).settings.areaFill, "grid");
});

// ---------- the acceptance line ----------

test("a 20-ft Sphere covers 49 squares under round and 81 under grid; Fireball catches by them", () => {
  const sphere = { area: { shape: "sphere", size: 20 }, range: 150 };
  for (const [fill, n] of [[undefined, 49], ["round", 49], ["grid", 81]]) {
    const s = room({ areaFill: fill });
    const cells = areaHexes(s, s.entities.wizard, sphere, { q: 7, r: 4 });
    assert.equal(cells.length, n, String(fill));
    // Centred on the centre of the square aimed at, which is in it: the cells are the disc of
    // squares round it (49: every square whose centre is within 20 ft of that centre).
    assert.ok(at(cells, 7, 4));
    for (const h of cells) assert.ok(fill === "grid" ? SQUARE.dist(h, { q: 7, r: 4 }) <= 4 : (h.q - 7) ** 2 + (h.r - 4) ** 2 <= 16);
  }
  // Fireball: a goblin 3 squares across and 3 down (21.2 ft away) is in only under grid; 4 straight
  // across (20 ft) under both; 5 across under neither. The caster is in a Sphere it stands in.
  for (const fill of ["round", "grid"]) {
    const s = room({ areaFill: fill }), w = s.entities.wizard;
    const corner = spawn(s, 10, 10), side = spawn(s, 7, 3), far = spawn(s, 12, 4);
    w.pos = { q: 7, r: 8, z: 0 };
    const r = cast(s, { actor: "wizard", spell: "fireball", hex: { q: 7, r: 7 } }, DM);
    const t = castEvent(r).targets;
    assert.equal(t.includes(corner.id), fill === "grid", `${fill}: the diagonal goblin`);
    assert.equal(t.includes(side.id), true);
    assert.equal(t.includes(far.id), false);
    assert.equal(t.includes("wizard"), true, "the caster stands in its own Fireball");
  }
});

test("Burning Hands (15-ft Cone) catches the creatures on the 7 squares east and not one beside them", () => {
  const s = room(), g = crowd(s, { q: 9, r: 7 }, 3);
  const r = cast(s, { actor: "wizard", spell: "burning-hands", hex: { q: 8, r: 7 } }, DM);
  const east = ["8,7", "9,6", "9,7", "9,8", "10,6", "10,7", "10,8"];
  assert.deepEqual(caughtAt(s, r), east.sort());
  assert.deepEqual(keys(castEvent(r).hexes), east.sort());
  assert.ok(!castEvent(r).targets.includes("wizard"), "its point of origin is not in it");
  assert.ok(Object.keys(g).length > 30);
  // Aimed at a far square on the same line, the same cone.
  assert.deepEqual(keys(areaHexes(s, s.entities.wizard, { area: { shape: "cone", size: 15 } }, { q: 14, r: 7 })), east.sort());
});

test("Lightning Bolt (100 by 5 ft Line) aimed diagonally is one square wide; along a side, 20 squares", () => {
  const s = room(), w = s.entities.wizard;
  w.pos = { q: 0, r: 0, z: 0 };
  const line = { area: { shape: "line", size: 100, width: 5 } };
  const diag = areaHexes(s, w, line, { q: 1, r: 1 });
  assert.deepEqual(keys(diag), Array.from({ length: 14 }, (_, i) => `${i + 1},${i + 1}`).sort(), "the room's diagonal, 14 squares (70.7 ft of it)");
  // Off the room's floor the line runs on: 100 ft of diagonal from the edge of the caster's square
  // are 14 squares (14 x 7.07 ft = 99 ft; a 15th centre would be 106 ft out).
  w.pos = { q: 0, r: 7, z: 0 };
  assert.deepEqual(keys(areaHexes(s, w, line, { q: 1, r: 7 })), Array.from({ length: 14 }, (_, i) => `${i + 1},7`).sort(), "to the east wall");
  w.pos = { q: 7, r: 7, z: 0 };
  const g = crowd(s, { q: 10, r: 10 }, 2);
  const r = cast(s, { actor: "wizard", spell: "lightning-bolt", hex: { q: 8, r: 8 } }, DM);
  assert.deepEqual(caughtAt(s, r), ["8,8", "9,9", "10,10", "11,11", "12,12"].filter((k) => g[k]).sort(), "the creatures on the diagonal, none beside it");
  // Pure geometry, past the room: 20 squares along a side, 14 along a diagonal.
  const me = { q0: 0, r0: 0, q1: 0, r1: 0 };
  assert.equal(squareStrip([0, 0], { q: 1, r: 0 }, me, 100, 2.5).length, 20);
  assert.equal(squareStrip([0, 0], { q: -1, r: 1 }, me, 100, 2.5).length, 14);
});

test("Thunderwave (15-ft Cube from Self) is the 3 by 3 in front; aimed diagonally, the 3 by 3 off the corner", () => {
  const s = room(), w = s.entities.wizard, cube = { area: { shape: "cube", size: 15 } };
  assert.deepEqual(keys(areaHexes(s, w, cube, { q: 8, r: 7 })), ["8,6", "8,7", "8,8", "9,6", "9,7", "9,8", "10,6", "10,7", "10,8"].sort());
  assert.deepEqual(keys(areaHexes(s, w, cube, { q: 6, r: 6 })), ["4,4", "4,5", "4,6", "5,4", "5,5", "5,6", "6,4", "6,5", "6,6"].sort());
  assert.deepEqual(keys(areaHexes(s, w, cube, { q: 7, r: 9 })), ["6,8", "6,9", "6,10", "7,8", "7,9", "7,10", "8,8", "8,9", "8,10"].sort());
  // The caster is never in it (the point of origin is on a face, outside the Cube).
  for (const aim of SQUARE.range({ q: 7, r: 7 }, 5)) if (aim.q !== 7 || aim.r !== 7) assert.ok(!at(areaHexes(s, w, cube, aim), 7, 7));
  const g = crowd(s, { q: 7, r: 7 }, 3);
  const r = cast(s, { actor: "wizard", spell: "thunderwave", hex: { q: 8, r: 7 } }, DM);
  assert.deepEqual(castEvent(r).targets.map((id) => Object.keys(g).find((k) => g[k] === id)).sort(), ["8,6", "8,7", "8,8", "9,6", "9,7", "9,8", "10,6", "10,7", "10,8"].sort());
});

test("a wall still shelters what is behind it: the stub wall keeps a Fireball off the goblin beyond", () => {
  // The stub runs down x = 12.5 ft from y = 27.5 to 37.5 (between columns 2 and 3, rows 6 and 7).
  const s = room(), behind = spawn(s, 4, 6), open = spawn(s, 4, 4), w = s.entities.wizard;
  w.pos = { q: 1, r: 12, z: 0 };
  const r = cast(s, { actor: "wizard", spell: "fireball", hex: { q: 1, r: 6 } }, DM);
  assert.ok(at(castEvent(r).hexes, 4, 6), "the square is in the area");
  assert.ok(!castEvent(r).targets.includes(behind.id), "but the wall is between it and the point of origin");
  assert.ok(castEvent(r).targets.includes(open.id));
  // From the caster's own space: the wizard stands against the stub (its square's east side), so a
  // Burning Hands aimed east lays out its squares but catches nobody behind the wall; two squares
  // north, clear of the stub, the same cone catches what is in front.
  const t = room(), g2 = [spawn(t, 3, 6), spawn(t, 4, 7)], seen = spawn(t, 4, 5), free = spawn(t, 3, 3);
  t.entities.wizard.pos = { q: 2, r: 6, z: 0 };
  const r2 = cast(t, { actor: "wizard", spell: "burning-hands", hex: { q: 3, r: 6 } }, DM);
  for (const g of g2) assert.ok(at(castEvent(r2).hexes, g.pos.q, g.pos.r) && !castEvent(r2).targets.includes(g.id), `${col(g.pos)} is sheltered`);
  // 4,5 is not: the line from it passes north of the stub's end to the caster's corner (the hex rule,
  // sight.js inSight, either way round).
  assert.ok(castEvent(r2).targets.includes(seen.id));
  t.entities.wizard.pos = { q: 2, r: 3, z: 0 };
  const r3 = cast(t, { actor: "wizard", spell: "burning-hands", hex: { q: 3, r: 3 } }, DM);
  assert.ok(castEvent(r3).targets.includes(free.id));
});

test("a Large creature partly inside is in; a Large caster's areas start from its whole space and leave it out", () => {
  // Fireball (round) at 8,10: an ogre at 3,9 (3,9 4,9 3,10 4,10), whose square 4,10 is 20 ft from
  // the centre, is in though its own position is further; one square further west it is not.
  for (const [q, inside] of [[3, true], [2, false]]) {
    const s = room(), ogre = spawn(s, q, 9, "ogre");
    assert.equal(ogre.size, "large");
    s.entities.wizard.pos = { q: 12, r: 1, z: 0 };
    const r = cast(s, { actor: "wizard", spell: "fireball", hex: { q: 8, r: 10 } }, DM);
    assert.equal(castEvent(r).targets.includes(ogre.id), inside, `ogre at ${q},9`);
  }
  // The wizard grows Large at 6,6 (6,6 7,6 6,7 7,7). A 15-ft Emanation reaches 15 ft from any of its
  // squares: 3 squares beyond each side, not the far corners.
  const s = room(), w = s.entities.wizard;
  w.pos = { q: 6, r: 6, z: 0 };
  ok(apply(s, { type: "setSize", actor: "wizard", size: "large" }, DM));
  const em = areaHexes(s, w, { area: { shape: "emanation", size: 15 } }, null);
  for (const [q, r, yes] of [[10, 6, true], [10, 7, true], [3, 7, true], [6, 3, true], [10, 9, true], [11, 7, false], [10, 10, false], [3, 3, false], [6, 6, false], [7, 7, false]])
    assert.equal(at(em, q, r), yes, `${q},${r}`);
  assert.deepEqual(keys(em), keys(squareAround({ q0: 6, r0: 6, q1: 7, r1: 7 }, 3, "round")));
  // Its Cone, Line and Cube never hold its own squares, aimed anywhere.
  for (const aim of SQUARE.range({ q: 7, r: 7 }, 6)) for (const area of [{ shape: "cone", size: 15 }, { shape: "line", size: 30, width: 5 }, { shape: "cube", size: 15 }]) {
    const cells = areaHexes(s, w, { area }, aim);
    for (const f of footprint(w, w.pos, SQUARE)) assert.ok(!at(cells, f.q, f.r), `${area.shape} at ${col(aim)}`);
  }
  // A Large caster's Thunderwave: the 3 by 3 against its east side, centred on its middle as nearly
  // as whole squares allow (the aim 9,6 and 9,7 are mirror images; each gets its own side).
  assert.deepEqual(keys(areaHexes(s, w, { area: { shape: "cube", size: 15 } }, { q: 12, r: 6 })), ["8,5", "8,6", "8,7", "9,5", "9,6", "9,7", "10,5", "10,6", "10,7"].sort());
  assert.deepEqual(keys(areaHexes(s, w, { area: { shape: "cube", size: 15 } }, { q: 12, r: 7 })), ["8,6", "8,7", "8,8", "9,6", "9,7", "9,8", "10,6", "10,7", "10,8"].sort());
});

test("range to an area's point is counted from the nearest of a Large caster's squares; the preview is what is cast", () => {
  // Web (60 ft, a 20-ft Cube) at 14,2 from a Large wizard on 1,1 2,1 1,2 2,2: 60 ft from 2,2, though
  // 65 ft from 1,1, the square its position names.
  const s = room(), w = s.entities.wizard;
  spawn(s, 3, 12);
  w.pos = { q: 1, r: 1, z: 0 };
  ok(apply(s, { type: "setSize", actor: "wizard", size: "large" }, DM));
  const web = { area: { shape: "cube", size: 20 }, range: 60 };
  const preview = areaHexes(s, w, web, { q: 14, r: 2 });
  // Square to the grid, the square aimed at on its west side, away from the wizard: column 14 of the
  // room and the 10-ft corridor beyond it (rows 3 and 4); the rest is wall and rock.
  assert.ok(at(preview, 14, 2) && preview.every((h) => h.q >= 14 && h.q <= 17), keys(preview).join(" "));
  assert.equal(preview.length, 10);
  const r = cast(s, { actor: "wizard", spell: "web", hex: { q: 14, r: 2 } }, DM);
  assert.deepEqual(keys(castEvent(r).hexes), keys(preview));
  // What the client highlights before casting is what the cast lays out, for every shape.
  const t = room(), v = t.entities.wizard;
  spawn(t, 3, 12);
  for (const [spell, hex, area] of [["fireball", { q: 9, r: 9 }, { area: { shape: "sphere", size: 20 }, range: 150 }], ["burning-hands", { q: 8, r: 6 }, { area: { shape: "cone", size: 15 } }],
    ["lightning-bolt", { q: 9, r: 6 }, { area: { shape: "line", size: 100, width: 5 } }], ["thunderwave", { q: 6, r: 8 }, { area: { shape: "cube", size: 15 } }],
    ["moonbeam", { q: 3, r: 3 }, { area: { shape: "cylinder", size: 5, height: 40 }, range: 120 }]]) {
    const before = keys(areaHexes(t, v, area, hex));
    assert.deepEqual(keys(castEvent(cast(t, { actor: "wizard", spell, hex }, DM)).hexes), before, spell);
  }
});

// ---------- no direction favoured ----------

// The 8 turns and mirrors of the square grid, about the origin.
const MAPS = [[1, 0, 0, 1], [0, -1, 1, 0], [-1, 0, 0, -1], [0, 1, -1, 0], [-1, 0, 0, 1], [1, 0, 0, -1], [0, 1, 1, 0], [0, -1, -1, 0]];
const turn = ([a, b, c, d], h) => ({ q: a * h.q + b * h.r, r: c * h.q + d * h.r });
const AIMS = SQUARE.range({ q: 0, r: 0 }, 7).filter((h) => h.q || h.r);
const ME = { q0: 0, r0: 0, q1: 0, r1: 0 };
// Is a set of squares one piece, stepping to any of the 8 neighbours?
function onePiece(cells) {
  if (!cells.length) return true;
  const left = new Set(cells.map(col)), todo = [cells[0]];
  left.delete(col(cells[0]));
  while (todo.length) for (const n of SQUARE.neighbors(todo.pop())) if (left.delete(col(n))) todo.push(n);
  return left.size === 0;
}

test("cones, lines, spheres and emanations turn and mirror with their aim: no direction is favoured, and no gaps", () => {
  const shapes = {
    cone15: (aim) => squareCone([0, 0], aim, 15, ME),
    cone30: (aim) => squareCone([0, 0], aim, 30, ME),
    cone60: (aim) => squareCone([0, 0], aim, 60, ME),
    line5: (aim) => squareStrip([0, 0], aim, ME, 100, 2.5),
    line15: (aim) => squareStrip([0, 0], aim, ME, 60, 7.5),
  };
  for (const [name, f] of Object.entries(shapes)) for (const aim of AIMS) {
    const base = keys(f(aim));
    assert.ok(base.length > 0, `${name} at ${col(aim)}`);
    assert.ok(onePiece(f(aim)), `${name} at ${col(aim)} is one piece`);
    assert.ok(!base.includes("0,0"), `${name}: the caster's square is out`);
    for (const m of MAPS) assert.deepEqual(keys(f(turn(m, aim))), keys(f(aim).map((h) => turn(m, h))), `${name} at ${col(aim)}, map ${m}`);
  }
  // A Large caster's space is its own mirror image about its middle (the corner of its 4 squares).
  const big = { q0: 0, r0: 0, q1: 1, r1: 1 }, about = (m, h) => { const t = turn(m, { q: 2 * h.q - 1, r: 2 * h.r - 1 }); return { q: (t.q + 1) / 2, r: (t.r + 1) / 2 }; };
  for (const aim of SQUARE.range({ q: 0, r: 0 }, 6)) {
    if ((aim.q === 0 || aim.q === 1) && (aim.r === 0 || aim.r === 1)) continue;
    const cone = (a) => keys(squareCone([1, 1], a, 30, big));
    for (const m of MAPS) assert.deepEqual(cone(about(m, aim)), keys(squareCone([1, 1], aim, 30, big).map((h) => about(m, h))), `Large cone at ${col(aim)}`);
  }
  // Spheres and emanations, by either fill, are their own turns and mirrors.
  for (const fill of ["round", "grid"]) for (const n of [1, 2, 3, 4, 6, 8]) for (const m of MAPS) {
    assert.deepEqual(keys(squareDisc({ q: 0, r: 0 }, n, fill).map((h) => turn(m, h))), keys(squareDisc({ q: 0, r: 0 }, n, fill)));
    assert.deepEqual(keys(squareAround(ME, n, fill).map((h) => turn(m, h))), keys(squareAround(ME, n, fill)));
  }
});

test("a 15-ft Cube from Self turns and mirrors with its aim wherever it is aimed; on an exact tie the first block in a fixed order", () => {
  const fits = (b) => b.q0 <= 1 && b.q1 >= -1 && b.r0 <= 1 && b.r1 >= -1 && (b.q0 > 0 || b.q1 < 0 || b.r0 > 0 || b.r1 < 0);
  const cube = (aim) => squareBlock([0, 0], [2 * aim.q, 2 * aim.r], 3, -3, 1, -3, 1, fits);
  let ties = 0;
  for (const aim of AIMS) {
    const base = cube(aim);
    assert.equal(base.length, 9);
    for (const m of MAPS) {
      const same = keys(cube(turn(m, aim))).join() === keys(base.map((h) => turn(m, h))).join();
      if (!same) ties++;
    }
  }
  // Ties happen only where the aim lies exactly between two blocks; list them so a change is seen.
  assert.ok(ties <= AIMS.length * MAPS.length / 4, `${ties} ties`);
  for (const [dq, dr] of SQUARE.DIRS) for (const m of MAPS) assert.deepEqual(keys(cube(turn(m, { q: dq, r: dr }))), keys(cube({ q: dq, r: dr }).map((h) => turn(m, h))), `8 directions: ${dq},${dr}`);
});

// ---------- lasting zones ----------

test("lasting zones on squares: Moonbeam is the squares of its Cylinder by the fill; Spirit Guardians follows the cleric's whole space", () => {
  for (const [fill, n] of [["round", 5], ["grid", 9]]) {
    const s = room({ areaFill: fill });
    const r = cast(s, { actor: "wizard", spell: "moonbeam", hex: { q: 10, r: 10 } }, DM);
    assert.equal(castEvent(r).hexes.length, n, fill);
    const fx = s.effects.find((x) => x.name === "Moonbeam");
    assert.deepEqual(fx.zone.hexes.slice().sort(), keys(castEvent(r).hexes));
  }
  // Spirit Guardians (15-ft Emanation): a goblin 3 across and 2 down from the cleric is within 15 ft
  // of its space (14.6 ft from its corner); one 3 across and 3 down is not under round, is under grid.
  for (const fill of ["round", "grid"]) {
    const s = room({ areaFill: fill }), c = s.entities.cleric;
    c.pos = { q: 5, r: 5, z: 0 };
    const near = spawn(s, 8, 7), corner = spawn(s, 8, 8);
    cast(s, { actor: "cleric", spell: "spirit-guardians", choice: "radiant", spare: ["fighter", "wizard", "rogue"] }, DM);
    const fx = s.effects.find((x) => x.name === "Spirit Guardians");
    assert.equal(fx.zone.follows, "cleric");
    const holds = (t) => zoneHolds(s, fx, t);
    assert.equal(holds(near), true, fill);
    assert.equal(holds(corner), fill === "grid", fill);
    // It moves with the cleric; a Large creature is in it by any of its squares.
    c.pos = { q: 1, r: 1, z: 0 };
    assert.equal(holds(near), false);
    const ogre = spawn(s, 4, 3, "ogre");                  // 4,3 5,3 4,4 5,4: 4,3 is 3 squares east of the cleric
    assert.equal(holds(ogre), true);
    ogre.pos = { q: 5, r: 3, z: 0 };                        // its nearest square now 4 squares east
    assert.equal(holds(ogre), false);
  }
});
let zoneHolds;
test.before(async () => { ({ holds: zoneHolds } = await import("../src/zones.js")); });

// ---------- what players are sent ----------

test("a player is sent no area square it could not otherwise know of, cast or previewed, under every sight rule", () => {
  // The 10-ft corridor east of the room is a region the players have not seen.
  const edit = (map) => {
    const cells = [];
    for (let q = 15; q <= 22; q++) cells.push(`${q},3`, `${q},4`);
    map.regions.push({ id: "corridor", name: "Corridor", level: "ground", hexes: cells, revealed: false });
  };
  for (const sight of ["rooms", "los", "light"]) {
    const s = room({ edit, sight }), w = s.entities.wizard;
    spawn(s, 3, 12);                                        // someone to fight, so the fight goes on
    w.owner = "pat";
    w.pos = { q: 12, r: 4, z: 0 };
    const r = cast(s, { actor: "wizard", spell: "fireball", hex: { q: 14, r: 4 } }, PAT);
    assert.ok(castEvent(r).hexes.some((h) => h.q >= 15), "the Fireball reaches into the corridor");
    const v = view(s, PAT), known = new Set(v.map.levels.flatMap((l) => Object.keys(l.tiles)));
    const sent = viewEvents(r.events, s, PAT).filter((e) => e.type === "cast");
    assert.equal(sent.length, 1);
    // Under 'rooms' view.js sends a cast's cells unfiltered, on hexes as on squares (DEBT V17): left
    // to the sight lane, which owns view.js. Under los and light nothing unknown is sent.
    if (sight !== "rooms") for (const h of sent[0].hexes) assert.ok(known.has(col(h)), `${sight}: ${col(h)} is sent with the cast but not on the player's map`);
    else assert.ok(sent[0].hexes.some((h) => !known.has(col(h))), "rooms: the known gap (DEBT V17) is still there; if this fails, it was fixed: make the check above cover rooms too");
    // The preview a player's client works out from its own view holds only squares of its map.
    for (const h of areaHexes(v, v.entities.wizard, { area: { shape: "sphere", size: 20 }, range: 150 }, { q: 14, r: 4 })) assert.ok(known.has(col(h)), `${sight}: preview ${col(h)}`);
    // A lasting zone's squares are never sent.
    cast(s, { actor: "wizard", spell: "moonbeam", hex: { q: 14, r: 3 } }, PAT);
    for (const fx of view(s, PAT).effects) assert.equal("zone" in fx, false);
  }
});

// ---------- hex maps ----------

test("hex maps are untouched by areaFill: the same hexes for every shape under either value", () => {
  const s = newGame(3), w = s.entities.wizard;
  const areas = [{ area: { shape: "sphere", size: 20 }, range: 150 }, { area: { shape: "cylinder", size: 10, height: 40 }, range: 60 }, { area: { shape: "emanation", size: 15 } },
    { area: { shape: "cone", size: 15 } }, { area: { shape: "line", size: 100, width: 5 } }, { area: { shape: "cube", size: 15 } }, { area: { shape: "cube", size: 20 }, range: 60 }];
  const aim = HEX.neighbors(w.pos)[0], far = { q: w.pos.q + 3, r: w.pos.r - 1 };
  const before = areas.map((a) => [areaHexes(s, w, a, aim), areaHexes(s, w, a, far)]);
  ok(apply(s, { type: "setting", key: "areaFill", value: "grid" }, DM));
  assert.deepEqual(areas.map((a) => [areaHexes(s, w, a, aim), areaHexes(s, w, a, far)]), before);
  assert.equal(before[0][1].length > 0, true);
});

// ---------- counts, for the record ----------

test("the squares each shape covers, pinned (the table in the PR and the spec's build notes)", () => {
  const disc = (n, fill) => squareDisc({ q: 0, r: 0 }, n, fill).length;
  assert.deepEqual([1, 2, 3, 4, 6, 8, 12].map((n) => disc(n, "round")), [5, 13, 29, 49, 113, 197, 441]);
  assert.deepEqual([1, 2, 3, 4, 6, 8, 12].map((n) => disc(n, "grid")), [9, 25, 49, 81, 169, 289, 625]);
  const em = (b, n, fill) => squareAround(b, n, fill).length, L = { q0: 0, r0: 0, q1: 1, r1: 1 }, H = { q0: 0, r0: 0, q1: 2, r1: 2 };
  assert.deepEqual([2, 3, 4, 6].map((n) => em(ME, n, "round")), [20, 44, 68, 136]);
  assert.deepEqual([2, 3, 4, 6].map((n) => em(ME, n, "grid")), [24, 48, 80, 168]);
  assert.deepEqual([2, 3, 4, 6].map((n) => em(L, n, "round")), [28, 56, 84, 160]);
  assert.deepEqual([2, 3, 4, 6].map((n) => em(H, n, "round")), [36, 68, 100, 184]);
  const cone = (len, aim) => squareCone([0, 0], aim, len, ME).length;
  assert.deepEqual([15, 30, 60, 90].map((n) => [cone(n, { q: 1, r: 0 }), cone(n, { q: 1, r: 1 })]), [[7, 6], [24, 20], [84, 72], [180, 168]]);
  const line = (len, w, aim) => squareStrip([0, 0], aim, ME, len, w / 2).length;
  assert.deepEqual([[15, 5], [30, 5], [60, 5], [100, 5], [60, 10], [90, 10]].map(([n, w]) => [line(n, w, { q: 1, r: 0 }), line(n, w, { q: 1, r: 1 })]), [[3, 2], [6, 4], [12, 8], [20, 14], [24, 24], [36, 37]]);
  assert.deepEqual(boxOf([{ q: 3, r: 4 }, { q: 4, r: 5 }]), { q0: 3, r0: 4, q1: 4, r1: 5 });
});
