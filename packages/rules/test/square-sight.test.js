// Sight, cover and what players are sent on square maps (docs/specs/square-grid.md, task S8; issue
// #259). Cover by the owner's rule (#240, 14 November), table rule `squareCover: 'obstacle'`, the
// default on squares; the four-corner count as `squareCover: 'corners'`. SRD 5.2.1 Cover,
// reference/srd52/srd52-flow.txt 1992-2030: Half +2, Three-Quarters +5 to AC and Dexterity saving
// throws, Total "can't be targeted directly"; only the most protective degree applies; cover counts
// only when the attack or effect originates on the opposite side. Hex maps keep their own method.
import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import { apply, ACTION_TYPES, clear, current, moveOptions, SETTINGS } from "../src/engine.js";
import { gridOf, SQUARE, col, parse } from "../src/grid.js";
import * as H from "../src/hex.js";
import { lintMap, newMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";
import { canSee, coverOf, inView, inViewOf, lightAt, sightline, SQUARE_COVERS, SQUARE_COVER_TEXT } from "../src/sight.js";
import { concealed, footprint } from "../src/space.js";
import { clipWall, view, viewEvents } from "../src/view.js";
import { partyView, seesPlace, tilesInSight, unknown } from "../src/vision.js";
import { distToSegment, objectHexes } from "../src/walls.js";
import { squareRoom } from "./fixtures/square-room.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" }, KIM = { role: "player", userId: "kim" }, LEE = { role: "player", userId: "lee" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const at = (q, r, z = 0) => ({ q, r, z });
const P = (q, r, z = 0) => ({ pos: at(q, r, z) });           // a Medium body standing on a square, for coverOf
const REACH = SQUARE.cornerReach + 0.02;

// The square room (fixture) with the valley's party in it, away along the south wall, and no
// monsters. `edit` changes the map before it is loaded.
function room({ edit, cover, seed = 14 } = {}) {
  const s = newGame(seed), map = squareRoom();
  if (edit) edit(map);
  ok(apply(s, { type: "loadMap", map }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  if (cover) ok(apply(s, { type: "setting", key: "squareCover", value: cover }, DM));
  [["fighter", 1, 1], ["rogue", 0, 14], ["cleric", 1, 14], ["wizard", 2, 14]].forEach(([id, q, r]) => { s.entities[id].pos = at(q, r); });
  ok(apply(s, { type: "claim", entity: "fighter", user: "pat", userName: "Pat" }, PAT));
  return s;
}
const spawn = (s, q, r, monster = "goblin-warrior", extra = {}) => s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r }, ...extra }, DM)).events[0].id];
const wallAt = (kind, a, b, id = `${kind}-${a}-${b}`) => (m) => { m.walls.push({ id, level: "ground", a, b, kind }); };
const turnOf = (s, id) => { for (let i = 0; i < 30 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
// A pillar of four walls round square q,r (solid: it blocks movement and sight).
const pillarOfWalls = (q, r) => (m) => {
  const [x, y] = [5 * q, 5 * r], d = 2.5, c = [[x - d, y - d], [x + d, y - d], [x + d, y + d], [x - d, y + d]];
  c.forEach((p, i) => m.walls.push({ id: `pw${i}`, level: "ground", a: p, b: c[(i + 1) % 4], kind: "wall" }));
};

// ---------- the setting ----------
test("the table rule squareCover: obstacle (the default) or corners, with words for each; it only means anything on squares", () => {
  assert.deepEqual(SETTINGS.squareCover, ["obstacle", "corners"]);
  assert.deepEqual(SQUARE_COVERS, SETTINGS.squareCover);
  assert.deepEqual(Object.keys(SQUARE_COVER_TEXT), SETTINGS.squareCover);
  const s = room();
  assert.equal(s.settings.squareCover, undefined, "absent means the owner's rule");
  assert.equal(apply(s, { type: "setting", key: "squareCover", value: "maybe" }, DM).error, "That setting can be: obstacle, corners.");
  assert.equal(apply(s, { type: "setting", key: "squareCover", value: "corners" }, PAT).ok, false);
  ok(apply(s, { type: "setting", key: "squareCover", value: "corners" }, DM));
  assert.equal(view(s, PAT).settings.squareCover, "corners");
});

// ---------- cover by the owner's rule ----------
// The room's squares are 5 ft; a square's centre is at 5q, 5r. In the pictures A is the attacker,
// T the target, # a wall, o a statue (it fills its square: blocks movement, not sight), = a window.
test("owner's rule: open ground is no cover; a statue beside the line or in front of the target is Half; a walled pillar in front is Three-Quarters", () => {
  const s = room();
  assert.equal(coverOf(s, P(1, 1), P(5, 1)), "none");
  //   . . A . .        the statue at 10,3 is beside the line from 8,1 to 10,5: the middle of T is
  //   . . . . .        in view, one corner of T is not. Half (SRD: covers at least half of it).
  //   . . . . o
  //   . . . . .
  //   . . . . T
  assert.equal(coverOf(s, P(8, 1), P(10, 5)), "half");
  assert.equal(coverOf(s, P(8, 1), P(11, 5)), "half");
  //   A                straight in front, the statue is on T's middle line and every corner line, but
  //   .                the map does not say it is as tall and wide as T: a thing that fills its
  //   o                square gives at most Half (review of #262, M1).
  //   .
  //   T
  assert.equal(coverOf(s, P(10, 1), P(10, 5)), "half");
  // A walled pillar (solid) beside the line is Half too; right in front with T showing round it, Three-Quarters.
  const w = room({ edit: (m) => { m.objects = m.objects.filter((o) => o.id !== "pillar"); pillarOfWalls(10, 3)(m); } });
  assert.equal(coverOf(w, P(8, 1), P(10, 5)), "half");
  assert.equal(coverOf(w, P(9, 1), P(10, 6)), "threeQuarters");
});

test("owner's rule: a wall end hiding the middle with part of the target round it is Three-Quarters; all of it behind the wall is Total", () => {
  const s = room();
  //   A . #            the stub wall at x = 12.5 ft (between columns 2 and 3, rows 6 and 7):
  //   . . # . T        from 0,6 the line to the middle of 4,8 is stopped by its end, and the
  //   . . . . T        target's lower corners show below it: askew, Three-Quarters.
  assert.equal(coverOf(s, P(0, 6), P(4, 8)), "threeQuarters");
  //   A . # . T        wholly behind it: Total, and it cannot be targeted.
  assert.equal(coverOf(s, P(0, 6), P(4, 7)), "total");
  assert.equal(coverOf(s, P(0, 6), P(4, 6)), "total");
  // From the other side of the target, the wall behind it is no cover (SRD: only an attack that
  // originates on the opposite side of the cover).
  assert.equal(coverOf(s, P(6, 7), P(4, 7)), "none");
  assert.equal(coverOf(s, P(4, 7), P(0, 6)), "total", "and Total is the same both ways");
});

test("owner's rule: everything behind a window, a rail or a lowered grille is Three-Quarters; part of it is Half; a curtain is no cover", () => {
  const across = [37.5, -2.5], to = [37.5, 72.5];                // a line between columns 7 and 8, the room's full depth
  for (const kind of ["window", "rail"]) {
    const s = room({ edit: wallAt(kind, across, to) });
    //   A . = . T      the window covers all of T, but it can be seen and shot through.
    assert.equal(coverOf(s, P(5, 7), P(10, 7)), "threeQuarters", kind);
    // A short stretch of it in front of part of T only: Half.
    const short = room({ edit: wallAt(kind, [37.5, 32.5], [37.5, 36]) });
    assert.equal(coverOf(short, P(5, 7), P(10, 7)), "half", `a short ${kind}`);
  }
  // A portcullis lowered across a doorway blocks movement and not sight: the same.
  const g = room({ edit: (m) => { m.walls.push({ id: "n", level: "ground", a: [37.5, -2.5], b: [37.5, 32.5], kind: "wall" }, { id: "s", level: "ground", a: [37.5, 37.5], b: [37.5, 72.5], kind: "wall" }); m.objects.push({ id: "grille", def: "portcullis", level: "ground", at: { q: 7, r: 7 }, edge: 0, state: "lowered" }); } });
  assert.equal(coverOf(g, P(5, 7), P(10, 7)), "threeQuarters");
  ok(apply(g, { type: "setObject", object: "grille", state: "raised" }, DM));
  assert.equal(coverOf(g, P(5, 7), P(10, 7)), "none", "raised, the doorway is open");
  // A curtain blocks sight and not movement: no cover, and the target is out of sight (an attack at
  // a target it cannot see, as on hexes: the engine gives the attack Disadvantage).
  const c = room({ edit: wallAt("curtain", across, to) });
  assert.equal(coverOf(c, P(5, 7), P(10, 7)), "none");
  const gob = spawn(c, 10, 7);
  c.entities.fighter.pos = at(5, 7);
  assert.equal(canSee(c, c.entities.fighter, gob), "no");
});

test("owner's rule: another creature on the line is Half; the most protective degree applies, never the sum", () => {
  const s = room(), between = spawn(s, 3, 1), far = spawn(s, 6, 1);
  const all = Object.values(s.entities);
  const f = s.entities.fighter;
  assert.equal(coverOf(s, f, far, all), "half");
  assert.equal(coverOf(s, f, between, all), "none", "nobody between the fighter and the one beside it");
  // From a point an effect starts at, a creature standing on that point covers nobody.
  assert.equal(coverOf(s, at(1, 1), between, all), "none");
  assert.equal(coverOf(s, at(1, 1), far, all), "half");
  ok(apply(s, { type: "setting", key: "creatureCover", value: "off" }, DM));
  assert.equal(coverOf(s, f, far, Object.values(s.entities)), "none");
  // A creature in front of a target already Three-Quarters behind the wall end: still Three-Quarters.
  const w = room(), t = spawn(w, 4, 8), mid = spawn(w, 2, 7);
  assert.equal(coverOf(w, P(0, 6), t, Object.values(w.entities)), "threeQuarters");
  assert.ok(Object.values(w.entities).includes(mid));
});

test("M1: a chest, a crate or a statue gives at most Half Cover, at any distance, and nobody Hides behind one in plain view", () => {
  for (const def of ["chest", "crate", "statue"]) {
    //   A A A . o . T    the thing at 5,4 is on every line from the party to the goblin at 7,4.
    const s = room({ edit: (m) => { m.objects.push({ id: "box", def, level: "ground", at: { q: 5, r: 4 }, state: def === "chest" ? "closed" : "standing" }); } });
    [["fighter", 1, 4], ["rogue", 2, 4], ["cleric", 3, 4], ["wizard", 0, 4]].forEach(([id, q, r]) => { s.entities[id].pos = at(q, r); });
    const g = spawn(s, 7, 4);
    for (const id of ["fighter", "rogue", "cleric", "wizard"]) assert.equal(coverOf(s, s.entities[id], g), "half", `${def} from ${id}`);
    assert.equal(coverOf(s, P(4, 4), P(6, 4)), "half", `${def}, close`);
    const before = JSON.stringify(s), r = apply(s, { type: "hide", actor: g.id }, DM);
    assert.equal(r.ok, false, `${def}: the goblin hid behind it`);
    assert.equal(JSON.stringify(s), before);
    // Behind a thing and a window at once, the window's Three-Quarters stands.
    const w = room({ edit: (m) => { m.objects.push({ id: "box", def, level: "ground", at: { q: 5, r: 4 }, state: def === "chest" ? "closed" : "standing" }); m.walls.push({ id: "win", level: "ground", a: [32.5, -2.5], b: [32.5, 72.5], kind: "window" }); } });
    assert.equal(coverOf(w, P(3, 4), P(7, 4)), "threeQuarters");
  }
});

test("the parts of the rule a test must pin: floors, the creature on the line, a corner behind a wall in the target's own square", () => {
  // A floor between levels: a loft 10 ft up over 5..8 by 5..8. From under it to on it: Total, both ways.
  const loft = room({ edit: (m) => { const tiles = {}; for (let q = 5; q <= 8; q++) for (let r = 5; r <= 8; r++) tiles[`${q},${r}`] = { t: "stone" }; m.levels.push({ id: "loft", name: "Loft", z: 10, tiles }); } });
  assert.equal(coverOf(loft, P(6, 6), P(6, 6, 10)), "total");
  assert.equal(coverOf(loft, P(6, 6, 10), P(6, 6)), "total");
  assert.equal(coverOf(loft, P(2, 2), P(3, 3)), "none", "and nothing between two places on the ground");
  // The creature on the line: up to 10 ft above or below the lower end it counts; higher, or dead, it does not.
  for (const [z, dead, want] of [[0, false, "half"], [5, false, "half"], [10, false, "none"], [15, false, "none"], [0, true, "none"]]) {
    const s = room(), mid = spawn(s, 3, 1), far = spawn(s, 6, 1);
    mid.pos.z = z; if (dead) mid.dead = true;
    assert.equal(coverOf(s, s.entities.fighter, far, Object.values(s.entities)), want, `a creature ${z} ft up${dead ? ", dead" : ""}`);
  }
  // A short wall through the target's own square (a map traced off the grid): from the north, the
  // lines reach its two east corners, but they are on the far side of the wall from its middle.
  const cut = room({ edit: wallAt("wall", [26, 23], [26, 28]) });
  assert.equal(coverOf(cut, P(5, 0), P(5, 5)), "half");
  assert.equal(coverOf(room(), P(5, 0), P(5, 5)), "none");
  // The four-corner count's bands: 4 corners none, 3 and 2 Half, 1 Three-Quarters, 0 Total (the stub wall).
  const c = room({ cover: "corners" });
  for (const [a, t, n, want] of [[[0, 3], [3, 4], 4, "none"], [[0, 4], [4, 10], 3, "half"], [[0, 3], [4, 10], 2, "half"], [[0, 3], [3, 6], 1, "threeQuarters"], [[0, 3], [3, 7], 0, "total"]]) {
    const A = at(...a), T = at(...t);
    assert.equal(Math.max(sightline(c.map, A, T).corners, sightline(c.map, T, A).corners), n, `${a} -> ${t}`);
    assert.equal(coverOf(c, { pos: A }, { pos: T }), want, `${n} corners`);
  }
});

test("L1, L3: a Tiny creature sharing either end's square covers nobody; Total from an effect's point agrees with whether the area reaches", () => {
  const s = room(), far = spawn(s, 6, 1), tinyT = spawn(s, 6, 3, "rat"), tinyA = spawn(s, 1, 3, "rat");
  assert.equal(tinyT.size, "tiny");
  tinyT.pos = at(6, 1); tinyA.pos = at(1, 1);                   // Tiny creatures share a square (SRD 1913)
  assert.equal(coverOf(s, s.entities.fighter, far, Object.values(s.entities)), "none", "rats sharing the fighter's and the goblin's squares");
  // From a point an effect starts at, Total only where no line reaches the target from that
  // point's square either way, as `clear` judges an area (sight.js inSight).
  const pick = chooser(262);
  let totals = 0;
  for (let n = 0; n < 30; n++) {
    const walls = Array.from({ length: 6 }, (_, i) => randomWall(pick, i));
    const r = room({ edit: (m) => { m.walls.push(...walls); } });
    for (let k = 0; k < 40; k++) {
      const o = at(pick(15), pick(15)), t = at(pick(15), pick(15));
      if (col(o) === col(t)) continue;
      const total = coverOf(r, o, { pos: t }) === "total";
      if (total) totals++;
      assert.equal(total, !clear(r, o, t), `origin ${col(o)}, target ${col(t)}`);
    }
  }
  assert.ok(totals > 20, `${totals} Totals`);
});

test("cover in play: +2 and +5 to Armor Class and to Dexterity saves; Total refuses the attack; the table rule cover off leaves only Total", () => {
  const s = room({ edit: wallAt("window", [37.5, -2.5], [37.5, 72.5]) });
  const gob = spawn(s, 10, 7), f = s.entities.fighter;
  f.pos = at(5, 7);
  ok(apply(s, { type: "startEncounter", center: { q: 7, r: 7 }, radius: 6 }, DM));
  turnOf(s, "fighter");
  const atk = ok(apply(s, { type: "attack", actor: "fighter", target: gob.id, attack: "javelin" }, PAT)).events.find((e) => e.type === "attack");
  assert.equal(atk.cover, "threeQuarters");
  assert.equal(atk.ac, 15 + 5);
  // Half: a short rail in front of part of it.
  const h = room({ edit: wallAt("rail", [37.5, 32.5], [37.5, 36]) }), g2 = spawn(h, 10, 7);
  h.entities.fighter.pos = at(5, 7);
  ok(apply(h, { type: "startEncounter", center: { q: 7, r: 7 }, radius: 6 }, DM));
  turnOf(h, "fighter");
  const a2 = ok(apply(h, { type: "attack", actor: "fighter", target: g2.id, attack: "javelin" }, PAT)).events.find((e) => e.type === "attack");
  assert.equal(a2.cover, "half");
  assert.equal(a2.ac, 15 + 2);
  // A Dexterity save against a spell from behind the window: +5.
  const d = room({ edit: wallAt("window", [37.5, -2.5], [37.5, 72.5]) }), g3 = spawn(d, 9, 7);
  d.entities.wizard.pos = at(6, 7);
  ok(apply(d, { type: "startEncounter", center: { q: 7, r: 7 }, radius: 6 }, DM));
  turnOf(d, "wizard");
  const cast = ok(apply(d, { type: "cast", actor: "wizard", spell: "burning-hands", hex: { q: 7, r: 7 } }, DM));
  const save = cast.events.find((e) => e.type === "save" && e.id === g3.id);
  assert.equal(save.cover, "threeQuarters");
  assert.equal(save.total, save.roll + 2 + 5);                    // the goblin's Dexterity +2, Three-Quarters +5
  // Total: the attack is refused and nothing changes.
  const t = room(), hid = spawn(t, 4, 7);
  t.entities.fighter.pos = at(0, 6);
  const before = JSON.stringify(t);
  assert.equal(apply(t, { type: "attack", actor: "fighter", target: hid.id, attack: "javelin" }, PAT).error, `There is a wall between Brenna and ${hid.name}.`);
  assert.equal(JSON.stringify(t), before);
  // cover off: what the DM sets by hand. Only Total is left.
  ok(apply(s, { type: "setting", key: "cover", value: "off" }, DM));
  assert.equal(coverOf(s, f, gob), "none");
  ok(apply(t, { type: "setting", key: "cover", value: "off" }, DM));
  assert.equal(coverOf(t, t.entities.fighter, hid), "total");
});

test("big creatures: the target's whole space (its middle and outer corners); the attacker's best square", () => {
  // A Large target at 3,7 fills 3..4 by 7..8. From 0,6 its middle (17.5 by 37.5 ft... the corner
  // of its four squares) is behind the stub's end and its lower corners show: Three-Quarters.
  const s = room(), ogre = spawn(s, 3, 7, "ogre");
  assert.deepEqual(footprint(ogre, ogre.pos, SQUARE).map(col), ["3,7", "4,7", "3,8", "4,8"]);
  assert.equal(coverOf(s, P(0, 6), ogre), "threeQuarters");
  // The same ogre one row up is wholly behind the stub from 0,6, and a Medium attacker there gets Total.
  const t = room(), hidden = spawn(t, 3, 5, "ogre");
  assert.equal(coverOf(t, P(0, 5), hidden), "half", "its middle shows over the stub's top end; its lower corners do not");
  const u = room(), behind = spawn(u, 3, 6, "ogre");
  assert.equal(coverOf(u, P(0, 6), behind), "total");
  // A Large attacker uses the best of its squares: the fighter made Large at 0,5 fills 0..1 by 5..6;
  // from 0,5 or 1,5 the line passes over the stub's top end, so it is not Total.
  u.entities.fighter.pos = at(0, 5);
  ok(apply(u, { type: "setSize", actor: "fighter", size: "large" }, DM));
  assert.notEqual(coverOf(u, u.entities.fighter, behind), "total");
  assert.equal(coverOf(u, P(0, 6), behind), "total", "where its lowest square alone would see nothing");
  // A Gargantuan attacker beside the stub: at least one of its squares sees round it.
  u.entities.fighter.pos = at(0, 2);
  ok(apply(u, { type: "setSize", actor: "fighter", size: "gargantuan" }, DM));
  assert.equal(coverOf(u, u.entities.fighter, behind), "none");
});

test("the four-corner count, as a table rule: a walled pillar beside the line is Half, a wall end Three-Quarters, and a statue is no cover, as on hexes", () => {
  const s = room({ cover: "corners", edit: (m) => { m.objects = m.objects.filter((o) => o.id !== "pillar"); pillarOfWalls(10, 3)(m); } });
  assert.equal(coverOf(s, P(1, 1), P(5, 1)), "none");
  assert.equal(coverOf(s, P(8, 1), P(11, 6)), "half");
  assert.equal(coverOf(s, P(8, 0), P(11, 5)), "total", "the count can make a 5-ft pillar Total");
  assert.equal(coverOf(s, P(0, 6), P(4, 8)), "threeQuarters");
  assert.equal(coverOf(s, P(0, 6), P(4, 7)), "total");
  const st = room({ cover: "corners" });
  assert.equal(coverOf(st, P(10, 1), P(10, 5)), "none", "a statue blocks neither movement lines nor sight here");
  // A window across everything: the corner count does not count windows (as on hexes); a rail is Half.
  assert.equal(coverOf(room({ cover: "corners", edit: wallAt("window", [37.5, -2.5], [37.5, 72.5]) }), P(5, 7), P(10, 7)), "none");
  assert.equal(coverOf(room({ cover: "corners", edit: wallAt("rail", [37.5, -2.5], [37.5, 72.5]) }), P(5, 7), P(10, 7)), "half");
});

test("hex maps keep their own method: squareCover changes nothing there", () => {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 6).map((h) => [H.col(h), { t: "stone" }]));
  const walls = [{ id: "n", level: "ground", a: [1.25, -100], b: [1.25, -2.2], kind: "wall" }, { id: "w", level: "ground", a: [1.25, 2.2], b: [1.25, 100], kind: "window" }];
  const s = newGame(31);
  ok(apply(s, { type: "loadMap", map: newMap({ id: "f", name: "Floor", starts: [{ q: -5, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }], walls }) }, DM));
  const pairs = H.range({ q: 0, r: 0 }, 4).flatMap((a) => [{ q: 2, r: 0 }, { q: 2, r: -3 }, { q: 3, r: 2 }].map((b) => [a, b]));
  const ask = () => pairs.map(([a, b]) => coverOf(s, P(a.q, a.r), P(b.q, b.r))).join();
  const before = ask();
  for (const v of ["corners", "obstacle"]) { ok(apply(s, { type: "setting", key: "squareCover", value: v }, DM)); assert.equal(ask(), before, v); }
  assert.ok(before.includes("total") && before.includes("none"), before);
});

// ---------- properties of the owner's rule ----------
function chooser(seed) { let x = seed >>> 0; return (n) => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x % n; }; }
const KINDS = ["wall", "wall", "window", "rail", "curtain"];
// A random wall on a square's side or across the room, in feet.
function randomWall(pick, i, kind = KINDS[pick(KINDS.length)]) {
  const x = 5 * pick(15) - 2.5, y = 5 * pick(15) - 2.5, len = 5 * (1 + pick(4));
  return pick(2) ? { id: `r${i}`, level: "ground", a: [x, y], b: [x + len, y], kind } : { id: `r${i}`, level: "ground", a: [x, y], b: [x, y + len], kind };
}
const SIZES = ["medium", "medium", "large", "huge", "gargantuan"];
test("property: another solid wall never lowers cover; Total means the middle line is blocked; Total is the same both ways", () => {
  const pick = chooser(259), rank = { none: 0, half: 1, threeQuarters: 2, total: 3 };
  let totals = 0, raised = 0, pairs = 0;
  for (let n = 0; n < 40; n++) {
    const walls = Array.from({ length: 3 + pick(5) }, (_, i) => randomWall(pick, i));
    const extra = randomWall(pick, 99, "wall");
    const s0 = room({ edit: (m) => { m.walls.push(...walls); } }), s1 = room({ edit: (m) => { m.walls.push(...walls, extra); } });
    for (let k = 0; k < 25; k++) {
      const sa = SIZES[pick(SIZES.length)], sb = SIZES[pick(SIZES.length)];
      const a = { pos: at(pick(11), pick(11)), size: sa }, b = { pos: at(pick(11), pick(11)), size: sb };
      if (footprint(a, a.pos, SQUARE).some((x) => footprint(b, b.pos, SQUARE).some((y) => col(x) === col(y)))) continue;
      pairs++;
      const c0 = coverOf(s0, a, b), c1 = coverOf(s1, a, b);
      assert.ok(rank[c1] >= rank[c0], `walls ${JSON.stringify(walls)} + ${JSON.stringify(extra)}: ${sa} at ${col(a.pos)} -> ${sb} at ${col(b.pos)}: ${c0} then ${c1}`);
      if (rank[c1] > rank[c0]) raised++;
      for (const [s, c] of [[s0, c0], [s1, c1]]) {
        assert.equal(coverOf(s, b, a) === "total", c === "total", `Total both ways: ${sa} at ${col(a.pos)}, ${sb} at ${col(b.pos)}`);
        if (c !== "total") continue;
        totals++;
        // From every square of the attacker, the line to the middle of the target's space is stopped by something solid.
        const xs = footprint(b, b.pos, SQUARE).map((h) => SQUARE.center(h));
        const mid = [(Math.min(...xs.map((p) => p[0])) + Math.max(...xs.map((p) => p[0]))) / 2, (Math.min(...xs.map((p) => p[1])) + Math.max(...xs.map((p) => p[1]))) / 2];
        for (const o of footprint(a, a.pos, SQUARE)) {
          const p = SQUARE.center(o);
          assert.ok(s.map.walls.some((w) => ["wall"].includes(w.kind) && segmentsMeet(p, mid, w.a, w.b)), `Total, but the middle line from ${col(o)} is open`);
        }
      }
    }
  }
  assert.ok(pairs > 500 && totals > 20 && raised > 10, JSON.stringify({ pairs, totals, raised }));
});
function segmentsMeet(p, q, a, b) {
  const o = (x, y, z) => (y[0] - x[0]) * (z[1] - x[1]) - (y[1] - x[1]) * (z[0] - x[0]), E = 1e-9;
  const on = (x, y, z) => Math.min(x[0], y[0]) - E <= z[0] && z[0] <= Math.max(x[0], y[0]) + E && Math.min(x[1], y[1]) - E <= z[1] && z[1] <= Math.max(x[1], y[1]) + E;
  const d1 = o(p, q, a), d2 = o(p, q, b), d3 = o(a, b, p), d4 = o(a, b, q);
  if (((d1 > E && d2 < -E) || (d1 < -E && d2 > E)) && ((d3 > E && d4 < -E) || (d3 < -E && d4 > E))) return true;
  return (Math.abs(d1) <= E && on(p, q, a)) || (Math.abs(d2) <= E && on(p, q, b)) || (Math.abs(d3) <= E && on(a, b, p)) || (Math.abs(d4) <= E && on(a, b, q));
}

// ---------- sight on squares ----------
test("sight is through the map's grid: four corners a square, and seeing is the same both ways", () => {
  const s = room();
  assert.equal(sightline(s.map, at(1, 1), at(1, 1)).corners, 4);
  assert.deepEqual(sightline(s.map, at(1, 1), at(6, 1)), { centre: true, corners: 4, low: false });
  const pick = chooser(7);
  for (let n = 0; n < 20; n++) {
    const walls = Array.from({ length: 6 }, (_, i) => randomWall(pick, i));
    const r = room({ edit: (m) => { m.walls.push(...walls); } });
    for (let k = 0; k < 30; k++) {
      const a = at(pick(15), pick(15)), b = at(pick(15), pick(15));
      assert.equal(inView(r.map, a, b), inView(r.map, b, a));
      const A = { pos: a, size: SIZES[pick(5)] }, B = { pos: b, size: SIZES[pick(5)] };
      assert.equal(inViewOf(r.map, A, B), inViewOf(r.map, B, A));
    }
  }
});

test("corners: no line of sight through the point where two walls meet; a line passes beside the end of one wall, which a diagonal step may not cross", () => {
  // Two rooms that touch only at the point 22.5, 22.5 (a cross of walls there): 4,4 and 5,5 are
  // diagonal neighbours through that point. They neither see each other nor can step across.
  const plus = room({ edit: (m) => { m.walls.push(
    { id: "a", level: "ground", a: [22.5, 2.5], b: [22.5, 42.5], kind: "wall" },
    { id: "b", level: "ground", a: [2.5, 22.5], b: [42.5, 22.5], kind: "wall" }); } });
  assert.equal(inView(plus.map, at(4, 4), at(5, 5)), false);
  assert.equal(inView(plus.map, at(5, 5), at(4, 4)), false);
  assert.equal(coverOf(plus, P(4, 4), P(5, 5)), "total");
  plus.entities.fighter.pos = at(4, 4);
  assert.equal(moveOptions(plus, plus.entities.fighter).get("5,5")?.cost === 5 * Math.SQRT2, false, "no diagonal step across the point");
  // The same with the room corner made by one wall turning (an L): from inside the corner nothing outside is seen past it.
  const ell = room({ edit: (m) => { m.walls.push({ id: "a", level: "ground", a: [22.5, 2.5], b: [22.5, 22.5], kind: "wall" }, { id: "b", level: "ground", a: [2.5, 22.5], b: [22.5, 22.5], kind: "wall" }); } });
  assert.equal(inView(ell.map, at(4, 4), at(5, 5)), false);
  // One wall that simply ends at 22.5, 22.5: the diagonal step past its end is refused (SRD
  // 1824-1825), but one can see round the end, and the target has cover from it.
  const one = room({ edit: (m) => { m.walls.push({ id: "a", level: "ground", a: [22.5, 2.5], b: [22.5, 22.5], kind: "wall" }); } });
  assert.equal(inView(one.map, at(4, 4), at(5, 5)), true);
  assert.equal(coverOf(one, P(4, 4), P(5, 5)), "threeQuarters");
  one.entities.fighter.pos = at(4, 4);
  const step = moveOptions(one, one.entities.fighter).get("5,5");
  assert.ok(!step || step.cost > 5 * Math.SQRT2 + 1e-9, "the step goes round, not across the corner");
});

test("the vision flood runs over the grid's eight neighbours, and stops at walls", () => {
  const s = room();
  const seen = tilesInSight(s.map, at(1, 1));
  assert.ok(seen.has("ground|14,14"), "the far diagonal corner of the room");
  assert.ok(seen.has("ground|0,0") && seen.has("ground|2,2"));
  assert.equal([...seen.keys()].some((k) => parse(k.split("|")[1]).q > 18 && parse(k.split("|")[1]).r === 10), false, "nothing past the shut door");
  // Behind the stub, from right against its west face.
  const behind = tilesInSight(s.map, at(2, 6));
  assert.equal(behind.has("ground|3,6"), false);
  assert.equal(behind.has("ground|4,7"), false);
  assert.equal(behind.has("ground|3,5"), true);
});

test("light on squares: a torch lights what it has a line to, by the map's measure; the stub wall shades what is behind it", () => {
  const s = room({ edit: (m) => { m.levels[0].light = "dark"; } });
  ok(apply(s, { type: "setLight", actor: "fighter", item: "torch" }, DM));
  s.entities.fighter.pos = at(0, 7);
  assert.equal(lightAt(s, at(0, 3)), "bright");
  assert.equal(lightAt(s, at(4, 7)), "dark", "behind the stub");
  assert.equal(lightAt(s, at(3, 10)), "bright", "round it, 21 ft away by the real measure: 20");
  assert.equal(lightAt(s, at(4, 11)), "dim", "28 ft away");
  assert.equal(lightAt(s, at(6, 2)), "dim", "35 ft away: past the Bright Light's 20");
  assert.equal(lightAt(s, at(8, 7)), "dark", "behind the stub, though within 40 ft");
  assert.equal(lightAt(s, at(9, 13)), "dark", "beyond 40 ft");
});

// ---------- what players are sent ----------
// The annex: the room's west part (columns 0 to 9) and, east of a line at x = 47.5 ft, five closets
// three rows deep (columns 10 to 12), each shut off from the next by a wall. Each closet's west side
// is one kind: A a wall, B a window, C a rail, D a curtain, E a wall with a shut wooden door in it.
// North of the room, a closet F behind a secret door. Each closet is its own region, with a goblin
// and a chest in it; A and B have a lit brazier, A a goblin carrying a torch.
const ROOM = []; for (let q = 0; q <= 9; q++) for (let r = 0; r <= 14; r++) ROOM.push({ q, r });
const CLOSET = (r0) => { const out = []; for (let q = 10; q <= 12; q++) for (let r = r0; r <= r0 + 2; r++) out.push({ q, r }); return out; };
const CLOSETS = { A: CLOSET(0), B: CLOSET(3), C: CLOSET(6), D: CLOSET(9), E: CLOSET(12) };
const F = []; for (let q = 0; q <= 3; q++) for (let r = -3; r <= -1; r++) F.push({ q, r });
function annex({ rule = "light", seed = 5 } = {}) {
  const tiles = Object.fromEntries([...ROOM, ...Object.values(CLOSETS).flat(), ...F].map((h) => [col(h), { t: "stone" }]));
  const W = (id, a, b, kind = "wall") => ({ id, level: "ground", a, b, kind });
  const walls = [
    W("north-1", [-2.5, -2.5], [2.5, -2.5]), W("north-2", [7.5, -2.5], [62.5, -2.5]), W("west", [-2.5, -2.5], [-2.5, 72.5]), W("south", [-2.5, 72.5], [62.5, 72.5]),
    W("east", [62.5, -2.5], [62.5, 72.5]),
    W("side-A", [47.5, -2.5], [47.5, 12.5]), W("side-B", [47.5, 12.5], [47.5, 27.5], "window"), W("side-C", [47.5, 27.5], [47.5, 42.5], "rail"),
    W("side-D", [47.5, 42.5], [47.5, 57.5], "curtain"), W("E-1", [47.5, 57.5], [47.5, 62.5]), W("E-2", [47.5, 67.5], [47.5, 72.5]),
    ...[12.5, 27.5, 42.5, 57.5].map((y, i) => W(`x${i}`, [47.5, y], [62.5, y])),
    W("F-w", [-2.5, -17.5], [-2.5, -2.5]), W("F-n", [-2.5, -17.5], [17.5, -17.5]), W("F-e", [17.5, -17.5], [17.5, -2.5]),
  ];
  const objects = [
    { id: "door-E", def: "door-wooden", level: "ground", at: { q: 9, r: 13 }, edge: 0, state: "closed" },
    { id: "door-F", def: "secret-door", level: "ground", at: { q: 1, r: 0 }, edge: 1, state: "secret" },
    ...Object.keys(CLOSETS).map((k) => ({ id: `chest-${k}`, def: "chest", level: "ground", at: CLOSETS[k][4], state: "closed" })),
    { id: "chest-F", def: "chest", level: "ground", at: { q: 2, r: -2 }, state: "closed" },
    { id: "brazier-A", def: "brazier", level: "ground", at: CLOSETS.A[8], state: "lit" },
    { id: "brazier-B", def: "brazier", level: "ground", at: CLOSETS.B[8], state: "lit" },
  ];
  const regions = [...Object.entries(CLOSETS).map(([k, hs]) => ({ id: k, name: `Closet ${k}`, level: "ground", hexes: hs.map(col) })), { id: "F", name: "Closet F", level: "ground", hexes: F.map(col) }];
  const map = { format: 2, id: "annex", name: "The annex", grid: "square", cellFeet: 5, levels: [{ id: "ground", name: "Ground", z: 0, light: "bright", tiles }], walls, objects, regions, starts: [{ q: 2, r: 7 }] };
  assert.deepEqual(lintMap(map), []);
  const s = newGame(seed);
  ok(apply(s, { type: "loadMap", map }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  for (const [id, user] of [["fighter", "pat"], ["rogue", "kim"], ["cleric", "lee"]]) ok(apply(s, { type: "claim", entity: id, user, userName: user }, { role: "player", userId: user }));
  // The party in the room's south-west; the fighter is the viewer that moves about.
  [["fighter", 2, 7], ["rogue", 0, 14], ["cleric", 1, 14], ["wizard", 0, 13]].forEach(([id, q, r]) => { s.entities[id].pos = at(q, r); });
  const gob = {};
  for (const k of [...Object.keys(CLOSETS), "F"]) gob[k] = spawn(s, ...(k === "F" ? [1, -2] : [CLOSETS[k][3].q, CLOSETS[k][3].r]), "goblin-warrior", { name: `Lurker${k}x` });
  ok(apply(s, { type: "setLight", actor: gob.A.id, item: "torch" }, DM));
  if (rule) ok(apply(s, { type: "setting", key: "sight", value: rule }, DM));
  return { s, gob };
}
// Everything a player is sent, as text and as the view.
const sentTo = (s, who = PAT, events = []) => { const v = view(s, who); return { v, text: JSON.stringify([v, viewEvents(events, s, who)]) }; };
const tileCentres = (v) => v.map.levels.flatMap((l) => Object.keys(l.tiles).map((k) => ({ level: l.id, c: SQUARE.center(parse(k)) })));
// The checks that hold for any viewer: every sent tile is one the party makes out (or remembers),
// every wall piece lies within a corner of a sent tile, every object touches one, the creatures sent
// are the ones the party sees, and a client working out moves on its view finds only sent tiles.
function nothingBeyond(s, who = PAT) {
  const { v, text } = sentTo(s, who), pv = partyView(s);
  const centres = tileCentres(v), sentCols = new Set(v.map.levels.flatMap((l) => Object.keys(l.tiles)));
  for (const k of sentCols) assert.ok(s.map.seen.tiles.ground.includes(k), `tile ${k} sent, never made out`);
  for (const w of v.map.walls) assert.ok(centres.some((t) => t.level === w.level && distToSegment(t.c, [w.a, w.b]) <= REACH + 1e-9), `wall piece ${JSON.stringify(w)} beside no sent tile`);
  for (const o of v.map.objects) { const src = s.map.objects.find((x) => x.id === o.id); assert.ok(objectHexes(src, SQUARE).some((h) => sentCols.has(col(h))), `${o.id} sent, touching no sent tile`); }
  for (const e of Object.values(s.entities)) if (e.side !== "party") assert.equal(!!v.entities[e.id], pv.creatures.has(e.id), `${e.name}: sent ${!!v.entities[e.id]}, seen ${pv.creatures.has(e.id)}`);
  for (const r of v.map.regions) for (const k of r.hexes) assert.ok(sentCols.has(k), `region ${r.id} names ${k}, not sent`);
  for (const id of Object.keys(v.entities)) if (v.entities[id].side === "party" && v.entities[id].owner === who.userId) for (const [k] of moveOptions(v, v.entities[id])) assert.ok(sentCols.has(k.split(",").slice(0, 2).join(",")), `a move to ${k}, not sent`);
  assert.equal(text.includes('"zone"'), false);
  return { v, text, sentCols };
}
const VIEWERS = [["medium", [2, 7]], ["large", [2, 6]], ["huge", [2, 6]], ["gargantuan", [1, 5]]];
test("views on squares: a player is sent nothing beyond the party's sight, for Medium, Large, Huge and Gargantuan viewers", () => {
  for (const [size, [q, r]] of VIEWERS) {
    const { s, gob } = annex();
    for (const id of ["rogue", "cleric", "wizard"]) delete s.entities[id];        // the fighter sees alone
    s.entities.fighter.pos = at(q, r);
    if (size !== "medium") ok(apply(s, { type: "setSize", actor: "fighter", size }, DM));
    ok(apply(s, { type: "advanceTime", minutes: 1 }, DM));                      // the party looks about
    const { v, text, sentCols } = nothingBeyond(s);
    const why = `${size} at ${q},${r}`;
    // Through the window and over the rail: seen, and their closets revealed, their chests and brazier sent.
    for (const k of ["B", "C"]) {
      assert.ok(v.entities[gob[k].id], `${why}: the goblin behind the ${k === "B" ? "window" : "rail"} is seen`);
      assert.ok(v.map.regions.some((x) => x.id === k), `${why}: closet ${k} revealed`);
      assert.ok(v.map.objects.some((o) => o.id === `chest-${k}`), `${why}: chest ${k}`);
    }
    assert.ok(v.map.objects.some((o) => o.id === "brazier-B"));
    // Behind the wall, the curtain, the shut door and the secret door: nothing at all.
    for (const k of ["A", "D", "E", "F"]) {
      assert.equal(text.includes(gob[k].id + '"') || text.includes(gob[k].name), false, `${why}: goblin ${k} reached the player`);
      assert.equal(v.map.regions.some((x) => x.id === k), false, `${why}: closet ${k}`);
      assert.equal(text.includes(`chest-${k}`), false, `${why}: chest ${k}`);
      for (const h of k === "F" ? F : CLOSETS[k]) assert.equal(sentCols.has(col(h)), false, `${why}: tile ${col(h)} of ${k}`);
    }
    assert.equal(text.includes("brazier-A"), false, `${why}: the brazier behind the wall`);
    assert.equal(text.includes('"torch"') || JSON.stringify(Object.values(v.entities).filter((e) => e.light && e.side !== "party")) !== "[]", false, `${why}: the torch behind the wall`);
    // The secret door is sent as wall, and nothing names it; the shut door E is sent (its side is seen).
    assert.equal(text.includes("door-F") || text.includes("secret"), false, `${why}: the secret door`);
    assert.ok(v.map.objects.some((o) => o.id === "door-E"), `${why}: the shut door, seen from the room`);
    assert.ok(v.map.walls.some((w) => w.a[1] === -2.5 && w.b[1] === -2.5 && Math.min(w.a[0], w.b[0]) <= 2.5 && Math.max(w.a[0], w.b[0]) >= 7.5), `${why}: the north wall unbroken where the secret door is`);
    // No wall piece inside a closet that is not sent: none on A's north side east of the line, none of F's walls.
    assert.equal(v.map.walls.some((w) => w.a[1] === -2.5 && w.b[1] === -2.5 && Math.max(w.a[0], w.b[0]) > 47.5 + REACH - 2.5 + 1e-6 && Math.min(w.a[0], w.b[0]) > 47.5 - 1e-6), false, `${why}: A's north wall`);
    assert.equal(v.map.walls.some((w) => w.a[1] < -2.6 || w.b[1] < -2.6), false, `${why}: F's walls`);
  }
});

test("views on squares: at a corner where two walls meet, and through the meeting point, nothing is sent", () => {
  // The fighter in the room's corner square 9,2, diagonal to closet A's 10,2... wait: 9,3 is
  // diagonal to 10,2 through the point 47.5, 12.5 where A's west wall ends and its south wall
  // begins. Nothing of A is seen from there.
  for (const [size, q, r] of [["medium", 9, 3], ["large", 8, 3], ["huge", 7, 3], ["gargantuan", 6, 3]]) {
    const { s, gob } = annex();
    for (const id of ["rogue", "cleric", "wizard"]) delete s.entities[id];
    s.entities.fighter.pos = at(q, r);
    if (size !== "medium") ok(apply(s, { type: "setSize", actor: "fighter", size }, DM));
    assert.ok(footprint(s.entities.fighter, s.entities.fighter.pos, SQUARE).every((h) => h.q <= 9 && h.r >= 3), size);
    ok(apply(s, { type: "advanceTime", minutes: 1 }, DM));
    const { v, text, sentCols } = nothingBeyond(s);
    assert.equal(inViewOf(s.map, s.entities.fighter, gob.A), false);
    assert.equal(text.includes(gob.A.name), false, size);
    for (const h of CLOSETS.A) assert.equal(sentCols.has(col(h)), false, `${size}: ${col(h)}`);
    assert.ok(v.entities[gob.B.id], `${size}: the goblin through the window is seen`);
  }
});

test("views on squares: a wall is sent only where it runs beside a shown square, a corner's reach of it", () => {
  // The wall piece beside one square is that square's whole side (and a hair more): the reach is the
  // square's corner, 5/√2 ft from its centre, not the hex's 5/√3.
  const pieces = clipWall({ id: "w", level: "g", kind: "wall", a: [-20, 2.5], b: [20, 2.5] }, [[0, 0]], REACH);
  assert.equal(pieces.length, 1);
  assert.ok(pieces[0].a[0] <= -2.5 && pieces[0].b[0] >= 2.5 && pieces[0].a[0] > -2.6 && pieces[0].b[0] < 2.6, JSON.stringify(pieces));
  // A wall one square away (beside a square not shown) is not sent at all.
  assert.deepEqual(clipWall({ id: "w", level: "g", kind: "wall", a: [-20, 7.5], b: [20, 7.5] }, [[0, 0]], REACH), []);
  // In play: under the light rule the fighter alone in the dark room, with a candle, is sent the
  // walls round what it has made out and nothing of the far walls.
  const s = room({ edit: (m) => { m.levels[0].light = "dark"; } });
  for (const id of ["rogue", "cleric", "wizard"]) delete s.entities[id];
  ok(apply(s, { type: "setting", key: "sight", value: "light" }, DM));
  ok(apply(s, { type: "setLight", actor: "fighter", item: "candle" }, DM));
  ok(apply(s, { type: "place", actor: "fighter", to: at(1, 1) }, DM));
  const v = view(s, PAT), sent = Object.keys(v.map.levels[0].tiles);
  assert.ok(sent.length > 4 && sent.length < 40, `${sent.length} squares made out by a candle`);
  const north = v.map.walls.filter((w) => w.a[1] === -2.5 && w.b[1] === -2.5);
  assert.ok(north.length >= 1);
  const top = sent.map(parse).filter((h) => h.r === 0).map((h) => h.q), east = Math.max(...top);
  // The north wall is sent along the whole side of every sent square on row 0, and stops within a hair of the last one.
  assert.ok(north.some((w) => Math.min(w.a[0], w.b[0]) <= -2.5 + 1e-9 && Math.max(w.a[0], w.b[0]) >= 5 * east + 2.5 - 1e-9), JSON.stringify({ north, top }));
  assert.ok(north.every((w) => Math.max(w.a[0], w.b[0]) < 5 * east + 2.6), JSON.stringify(north));
  assert.equal(v.map.walls.some((w) => w.a[0] === 72.5 || w.a[1] === 72.5), false, "nothing of the east or south walls");
});

test("views on squares under los: regions revealed by a line of sight, the secret door as wall, found and then shown", () => {
  const { s, gob } = annex({ rule: "los" });
  for (const id of ["rogue", "cleric", "wizard"]) delete s.entities[id];
  ok(apply(s, { type: "advanceTime", minutes: 1 }, DM));
  const rev = (id) => !!s.map.regions.find((r) => r.id === id).revealed;
  assert.deepEqual(["A", "B", "C", "D", "E", "F"].map(rev), [false, true, true, false, false, false]);
  // Opening door E: closet E is in sight, and revealed; its goblin is seen.
  // (Opened by the DM: a player's `use` of a door on a square's side is measured as a hex edge
  // today, features.js nearObject; docs/DEBT.md T22.)
  ok(apply(s, { type: "place", actor: "fighter", to: at(8, 13) }, DM));
  ok(apply(s, { type: "setObject", object: "door-E", state: "open" }, DM));
  assert.equal(rev("E"), true);
  assert.ok(view(s, PAT).entities[gob.E.id]);
  // The secret door: sent as wall until found; found and opened, closet F follows.
  assert.equal(JSON.stringify(view(s, PAT)).includes("door-F"), false);
  ok(apply(s, { type: "setObject", object: "door-F", state: "closed" }, DM));
  ok(apply(s, { type: "place", actor: "fighter", to: at(1, 0) }, DM));
  assert.ok(view(s, PAT).map.objects.some((o) => o.id === "door-F"), "a found door is a door");
  assert.equal(rev("F"), false);
  ok(apply(s, { type: "setObject", object: "door-F", state: "open" }, DM));
  assert.equal(rev("F"), true);
  assert.ok(view(s, PAT).entities[gob.F.id]);
  nothingBeyondLos(s);
});
// Under los every tile of a revealed region (or of none) is sent; the creatures and things are the
// ones in view or remembered.
function nothingBeyondLos(s, who = PAT) {
  const v = view(s, who), pv = partyView(s);
  for (const e of Object.values(s.entities)) if (e.side !== "party") assert.equal(!!v.entities[e.id], pv.creatures.has(e.id), e.name);
  for (const r of s.map.regions) if (!r.revealed) for (const k of r.hexes) assert.equal(!!v.map.levels[0].tiles[k], false, `${r.id} ${k}`);
}

test("hidden creatures on squares: one Hidden behind the window's Three-Quarters Cover is not sent", () => {
  const { s, gob } = annex({ rule: "los" });
  for (const id of ["cleric", "wizard"]) delete s.entities[id];
  s.entities.rogue.pos = at(2, 13);
  const g = gob.B;
  assert.equal(coverOf(s, s.entities.fighter, g), "threeQuarters", "behind the window");
  ok(apply(s, { type: "hide", actor: g.id }, DM));
  assert.ok(g.hiding, "Three-Quarters Cover lets it hide");
  assert.equal(unknown(s, g), true);
  assert.equal(JSON.stringify(view(s, PAT)).includes(g.name), false);
});

// ---------- the long random game on a square map ----------
// The square crypt: a hall to the west (columns 0 to 6) and a vault to the east (7 to 12) behind a
// wall at x = 32.5 with a door in it at row 3, each its own region; a walled pillar at 3,1; a curtain
// across the south of the hall; a brazier in the vault, which is dark; a hidden pressure plate.
const CRYPT = []; for (let q = 0; q <= 12; q++) for (let r = 0; r <= 8; r++) CRYPT.push({ q, r });
const westOfWall = (h) => h.q <= 6;
function squareCrypt({ rule = "los", seed = 7 } = {}) {
  const tiles = Object.fromEntries(CRYPT.map((h) => [col(h), { t: "stone" }]));
  const W = (id, a, b, kind = "wall") => ({ id, level: "ground", a, b, kind });
  const walls = [W("n", [-2.5, -2.5], [62.5, -2.5]), W("s", [-2.5, 42.5], [62.5, 42.5]), W("w", [-2.5, -2.5], [-2.5, 42.5]), W("e", [62.5, -2.5], [62.5, 42.5]),
    W("mid-n", [32.5, -2.5], [32.5, 12.5]), W("mid-s", [32.5, 17.5], [32.5, 42.5]), W("cur", [-2.5, 27.5], [17.5, 27.5], "curtain"), W("win", [42.5, 27.5], [42.5, 42.5], "window")];
  pillarOfWalls(3, 1)({ walls });
  const map = { format: 2, id: "sq-crypt", name: "The square crypt", grid: "square", cellFeet: 5, levels: [{ id: "ground", name: "Ground", z: 0, tiles }], walls,
    objects: [{ id: "door", def: "door-wooden", level: "ground", at: { q: 6, r: 3 }, edge: 0, state: "closed" },
      { id: "brazier", def: "brazier", level: "ground", at: { q: 10, r: 2 }, state: "lit" },
      { id: "plate", def: "pressure-plate", level: "ground", at: { q: 2, r: 4 }, state: "hidden" }],
    regions: [{ id: "hall", name: "The hall", level: "ground", hexes: CRYPT.filter(westOfWall).map(col) },
      { id: "vault", name: "The vault", level: "ground", hexes: CRYPT.filter((h) => !westOfWall(h)).map(col), light: "dark" }],
    starts: [{ q: 0, r: 3 }] };
  assert.deepEqual(lintMap(map), []);
  const s = newGame(seed);
  ok(apply(s, { type: "loadMap", map }, DM));
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  for (const [id, user] of [["fighter", "pat"], ["rogue", "kim"], ["cleric", "lee"]]) apply(s, { type: "claim", entity: id, user, userName: user }, { role: "player", userId: user });
  for (const [id, q, r] of [["fighter", 1, 3], ["rogue", 0, 4], ["cleric", 0, 3], ["wizard", 1, 2]]) s.entities[id].pos = at(q, r);
  if (rule !== "rooms") ok(apply(s, { type: "setting", key: "sight", value: rule }, DM));
  return s;
}
const PARTY = ["fighter", "rogue", "cleric", "wizard"];
const PLAYERS = [PAT, KIM, LEE];
const owner = { fighter: PAT, rogue: KIM, cleric: LEE, wizard: DM };
const NAMES = ["Zorgax", "Keshtel", "Vlimmer", "Drossik"];
const up = (e) => !e.dead && e.hp > 0;
const uniqueName = (s) => { const k = Object.values(s.entities).filter((e) => e.side !== "party").length; return `${NAMES[k % NAMES.length]}${k}q`; };
// What the party can see by the rule, worked out directly (no flood, no cache): the oracle.
function oracle(s) {
  const rule = s.settings.sight, eyes = PARTY.map((id) => s.entities[id]).filter((e) => e && up(e));
  const creatures = new Set();
  for (const c of Object.values(s.entities)) {
    if (c.side === "party" || concealed(s.map, c)) continue;
    if (rule === "rooms" || eyes.some((v) => (rule === "los" ? inViewOf(s.map, v, c) : canSee(s, v, c) !== "no"))) creatures.add(c.id);
  }
  const places = new Set();
  if (rule !== "rooms") for (const l of s.map.levels) for (const k in l.tiles) {
    const h = parse(k), p = at(h.q, h.r, l.z + (l.tiles[k].h ?? 0));
    if (eyes.some((v) => seesPlace(s, v, p, rule))) places.add(`${l.id}|${k}`);
  }
  return { rule, creatures, places };
}
function randomAction(s, pick) {
  const monsters = Object.values(s.entities).filter((e) => e.side !== "party" && !e.dead);
  const any = (list) => list[pick(list.length)];
  const roll = pick(100);
  if (s.encounter && roll < 30) {
    const id = current(s), e = s.entities[id];
    if (e?.side !== "party") return [aiStep(s, id) ?? { type: "endTurn", actor: id }, DM];
    if (pick(3) === 0) return [{ type: "endTurn", actor: id }, owner[id]];
  }
  if (roll < 40) {
    const id = any(PARTY), e = s.entities[id], opts = [...moveOptions(s, e).values()].filter((o) => o.canStop);
    if (opts.length) return [{ type: "move", actor: id, to: any(opts).h }, owner[id]];
  }
  if (roll < 52 && monsters.length) {
    const m = any(monsters), opts = [...moveOptions(s, m).values()].filter((o) => o.canStop);
    if (opts.length) return [{ type: "move", actor: m.id, to: any(opts).h }, DM];
  }
  if (roll < 57 && monsters.length) return [{ type: "place", actor: any(monsters).id, to: any(CRYPT) }, DM];
  if (roll < 60) return [{ type: "setLight", actor: any([...PARTY, ...monsters.map((m) => m.id)]), item: any(["torch", "candle", null]) }, DM];
  if (roll < 64) return [{ type: "setObject", object: any(["door", "brazier"]), state: any(["open", "closed", "lit", "out"]) }, DM];
  if (roll < 67) return [{ type: "use", actor: any(PARTY), object: "door", verb: any(["open", "close"]) }, PAT];
  if (roll < 70 && monsters.length) return [{ type: "hide", actor: any(monsters).id }, DM];
  if (roll < 73) return [{ type: "search", actor: "rogue" }, KIM];
  if (roll < 75) return [{ type: "hide", actor: "rogue" }, KIM];
  if (roll < 78) return [{ type: "condition", actor: any([...PARTY, ...monsters.map((m) => m.id)]), condition: any(["blinded", "invisible"]), on: pick(2) === 0 }, DM];
  if (roll < 81) return [{ type: "setSize", actor: any(PARTY), size: any(["medium", "large", "huge", "gargantuan", "medium"]) }, DM];
  if (roll < 82) return [{ type: "mapEdit", ops: [{ op: "level", level: { id: "ground", light: any(["bright", "dim", "dark", null]) } }] }, DM];
  if (roll < 84) return [{ type: "setting", key: "sight", value: any(["los", "light", "light", "los", "rooms"]) }, DM];
  if (roll < 87 && monsters.length < 4) return [{ type: "spawn", monster: any(["goblin-warrior", "goblin-warrior", "ogre"]), at: any(CRYPT), name: uniqueName(s), hidden: pick(4) === 0 }, DM];
  if (roll < 89 && !s.encounter) return [{ type: "startEncounter", center: s.entities.fighter.pos, radius: 8 }, DM];
  if (roll < 91 && s.encounter) return [{ type: "endEncounter" }, DM];
  if (roll < 94 && monsters.length) return [{ type: "attack", actor: "fighter", target: any(monsters).id, attack: "javelin" }, PAT];
  if (roll < 96) return [{ type: "revealRegion", region: "vault" }, DM];
  if (roll < 97) return [{ type: "mapEdit", ops: [{ op: "forget" }] }, DM];
  return [{ type: "advanceTime", minutes: 1 }, DM];
}
function playChecked(seed, steps, startRule) {
  const pick = chooser(seed), s = squareCrypt({ rule: startRule, seed });
  const wasSeen = new Map(), placesEver = new Set(), knownAt = [];
  let checked = 0, hiddenChecks = 0, sizes = new Set();
  const visit = (res) => {
    const o = oracle(s), G = gridOf(s.map);
    for (const p of o.places) placesEver.add(p);
    const note = (ob) => (wasSeen.get(ob.id) ?? wasSeen.set(ob.id, new Set()).get(ob.id)).add(ob.state);
    for (const ob of s.map.objects) if (o.rule === "rooms" || objectHexes(ob, G).some((h) => o.places.has(`${ob.level}|${col(h)}`))) note(ob);
    const sentTiles = view(s, PAT).map.levels.flatMap((l) => Object.keys(l.tiles).map((k) => `${l.id}|${k}`));
    for (const ob of s.map.objects) if (ob.edge !== undefined && !s.map.seen?.objects?.[ob.id] && objectHexes(ob, G).some((h) => sentTiles.includes(`${ob.level}|${col(h)}`))) note(ob);
    while (knownAt.length < s.timeline.length) knownAt.push(new Set(o.creatures));
    const unseen = Object.values(s.entities).filter((e) => e.side !== "party" && !o.creatures.has(e.id));
    for (const who of PLAYERS) {
      const v = view(s, who), evs = viewEvents(res.events, s, who), history = viewEvents(s.timeline.slice(-60), s, who);
      const text = JSON.stringify([v, evs, history]);
      for (const e of unseen) {
        assert.equal(text.includes(`"${e.id}"`), false, `seed ${seed}: ${e.id} (${e.name}) reached ${who.userId} under ${o.rule}`);
        assert.equal(text.includes(e.name), false, `seed ${seed}: ${e.name} reached ${who.userId} under ${o.rule}`);
        hiddenChecks++;
      }
      assert.equal(text.includes('"unseen"'), false);
      if (o.rule === "rooms") continue;
      const centres = tileCentres(v), sentCols = new Set(v.map.levels.flatMap((l) => Object.keys(l.tiles)));
      for (const l of v.map.levels) for (const k in l.tiles) if (o.rule === "light") assert.ok(placesEver.has(`${l.id}|${k}`), `seed ${seed}: tile ${k} sent unseen`);
      for (const w of v.map.walls) assert.ok(centres.some((t) => t.level === w.level && distToSegment(t.c, [w.a, w.b]) <= REACH + 1e-9), `seed ${seed}: a wall piece beside no sent square`);
      for (const ob of v.map.objects) assert.ok(wasSeen.get(ob.id)?.has(ob.state), `seed ${seed}: ${ob.id} sent as ${ob.state}, never seen so`);
      for (const ev of evs) {
        for (const h of ev.hexes ?? []) assert.ok(sentCols.has(col(h)), `seed ${seed}: ${ev.type} names ${col(h)}, not sent`);
        if (["object", "triggered", "noticed"].includes(ev.type)) { const obj = s.map.objects.find((x) => x.id === ev.object); assert.ok(objectHexes(obj, G).some((h) => o.places.has(`${obj.level}|${col(h)}`)), `seed ${seed}: event about ${ev.object} out of view`); }
        if (ev.type === "moved" && s.entities[ev.id]?.side !== "party") for (const h of ev.path) assert.ok([...o.places].some((p) => p.endsWith(`|${col(h)}`)), `seed ${seed}: path through ${col(h)} out of view`);
      }
    }
    // A guessed id: the same answer as one that does not exist, and nothing changes.
    if (unseen.length && checked % 3 === 0) {
      const e = unseen[checked % unseen.length], before = JSON.stringify(s);
      for (const [type, extra] of [["attack", { attack: "javelin" }], ["move", { to: at(0, 0) }]]) {
        const key = type === "attack" ? "target" : "actor";
        assert.deepEqual(apply(s, { type, actor: "fighter", ...extra, [key]: e.id }, PAT), apply(s, { type, actor: "fighter", ...extra, [key]: "m9999" }, PAT), `seed ${seed}: guessing ${e.id} gave something away`);
      }
      assert.equal(JSON.stringify(s), before);
    }
    checked++;
  };
  visit({ events: [] });
  for (let i = 0; i < steps; i++) {
    const [action, ctx] = randomAction(s, pick);
    const res = apply(s, action, ctx);
    if (!res.ok) continue;
    for (const id of PARTY) sizes.add(s.entities[id].size);
    visit(res);
  }
  for (const who of PLAYERS) s.timeline.forEach((entry, i) => {
    for (const e of viewEvents([entry], s, who)) for (const id of [e.id, e.actor, e.target, ...(e.targets ?? [])]) {
      if (typeof id === "string" && s.entities[id]?.side !== "party" && s.entities[id]) assert.ok(knownAt[i]?.has(id), `seed ${seed}: entry ${i} (${entry.type}) names ${id}, unseen then`);
    }
  });
  return { checked, hiddenChecks, sizes };
}
for (const seed of [1, 2, 3]) {
  test(`property: over a long random game on a square map (seed ${seed}) nothing the party cannot see reaches any player`, () => {
    const r = playChecked(seed, 300, seed % 2 ? "los" : "light");
    if (process.env.SIGHT_STATS) console.log(JSON.stringify({ seed, checked: r.checked, hiddenChecks: r.hiddenChecks, sizes: [...r.sizes] }));
    assert.ok(r.checked > 120, `only ${r.checked} actions went through`);
    assert.ok(r.hiddenChecks > 60, `only ${r.hiddenChecks} unseen creatures were checked`);
    assert.ok(r.sizes.size >= 2, `sizes played: ${[...r.sizes]}`);
  });
}

// ---------- a hidden creature's id on a square map ----------
// As hidden-ids.test.js on the valley: whatever field of whatever action a player puts a hidden
// creature's id in, the answer and the game afterwards are those for an id that is nothing.
const engineSrc = await (async () => { const { readFileSync, readdirSync } = await import("node:fs"); const parts = readdirSync(new URL("../src/engine/", import.meta.url)).filter((f) => f.endsWith(".js")).sort().map((f) => `engine/${f}`); return ["engine.js", ...parts, "scenes.js", "handouts.js"].map((f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8")).join("\n"); })();
const FIELDS = [...new Set([...engineSrc.matchAll(/\ba\.([a-zA-Z]+)\b/g)].map((m) => m[1]))].filter((k) => k !== "type").sort();
const U1 = { role: "player", userId: "u1" };
function hiddenBase(fight) {
  const s = room();
  for (const id of ["wizard", "cleric"]) { s.entities[id].owner = "u1"; s.entities[id].ownerName = "Pat"; }
  const cl = s.entities.cleric;
  cl.spells.push("spirit-guardians", "bless"); cl.slots[3] = 1; cl.slotsMax = { ...cl.slotsMax, 3: 1 };
  s.entities.wizard.spells.push("sleep");
  s.entities.wizard.pos = at(4, 9); s.entities.cleric.pos = at(5, 9);
  if (fight) ok(apply(s, { type: "startEncounter", center: { q: 4, r: 9 }, radius: 3 }, DM));
  // An ogre the DM hid (Large: 2 by 2) and a goblin hidden the same way, both near.
  const ogre = spawn(s, ...(fight ? [9, 12] : [7, 10]), "ogre", { name: "Grak the Ambusher", hidden: true });
  const gob = spawn(s, fight ? 9 : 3, fight ? 9 : 10, "goblin-warrior", { hidden: true });
  for (const e of [ogre, gob]) assert.ok(unknown(s, e), `${e.id} is unknown to the party`);
  return { s, hidden: [ogre.id, gob.id] };
}
const TEMPLATES = [
  { type: "cast", actor: "wizard", spell: "magic-missile", targets: [] },
  { type: "cast", actor: "wizard", spell: "fire-bolt", target: null },
  { type: "cast", actor: "wizard", spell: "sleep", hex: { q: 6, r: 10 } },
  { type: "cast", actor: "wizard", spell: "burning-hands", hex: { q: 5, r: 10 } },
  { type: "cast", actor: "cleric", spell: "spirit-guardians", slot: 3, spare: [] },
  { type: "cast", actor: "cleric", spell: "bless", targets: ["wizard"] },
  { type: "cast", actor: "cleric", spell: "sacred-flame", target: null },
  { type: "attack", actor: "wizard", attack: "dagger", target: null },
  { type: "follow", actor: "wizard", leader: "cleric" },
  { type: "move", actor: "wizard", to: { q: 4, r: 10 } },
  { type: "askCheck", actor: "wizard", skill: "perception" },
  { type: "react", prompt: 1, take: null },
  { type: "endEffect", effect: "fx1" },
  ...ACTION_TYPES.map((type) => ({ type, actor: "wizard" })),
];
const forms = (id) => [id, [id], [id, "wizard"], { id }];
function runOn(s, action) {
  const c = structuredClone(s);
  let r;
  try { r = apply(c, structuredClone(action), U1); } catch (err) { r = { threw: err.message }; }
  return { r, c };
}
function reads(s, action) {
  const seen = new Set(Object.keys(action));
  const spy = new Proxy(action, { get: (o, k) => { if (typeof k === "string") seen.add(k); return o[k]; }, has: (o, k) => { if (typeof k === "string") seen.add(k); return k in o; } });
  try { apply(structuredClone(s), spy, U1); } catch { for (const k of FIELDS) seen.add(k); }
  seen.delete("type");
  return [...seen];
}
for (const fight of [false, true]) {
  test(`square map: a hidden creature's id is answered as an id that is nothing, in every field of every action${fight ? " (in a fight)" : ""}`, () => {
    const { s, hidden } = hiddenBase(fight), nothing = "m99";
    assert.equal(s.entities[nothing], undefined);
    const leaks = [];
    let tried = 0;
    for (const tpl of TEMPLATES) for (const k of reads(s, tpl)) {
      for (const [h, f] of [...forms("x").map((_, i) => [hidden[0], i]), [hidden[1], 0]]) {
        const x = runOn(s, { ...tpl, [k]: forms(h)[f] }), y = runOn(s, { ...tpl, [k]: forms(nothing)[f] });
        tried++;
        const norm = (v) => JSON.stringify(v).replaceAll(h, "<id>").replaceAll(nothing, "<id>");
        const same = norm(x.r) === norm(y.r) && (x.r.ok === false ? true : norm(x.c) === norm(y.c));
        if (!same) leaks.push(`${tpl.type}.${k}=${JSON.stringify(forms(h)[f])}: ${norm(x.r).slice(0, 160)} | nothing: ${norm(y.r).slice(0, 160)}`);
      }
    }
    assert.ok(tried > 400, `walked ${tried}`);
    assert.deepEqual([...new Set(leaks)], []);
  });
}
