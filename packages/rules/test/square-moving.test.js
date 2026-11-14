// Moving on squares (docs/specs/square-grid.md, task S6; issue #252 with the owner's answers of
// 14 November): square maps play. Diagonals by the table rule `diagonals` ('real', the default:
// a diagonal costs 5 x √2 ft and the last square may be entered on what is left; 'srd': every
// diagonal 5 ft, SRD 5.2.1 1814-1823; 'alternate': every second diagonal 10 ft, a table rule). The
// corner rule (1824-1825). Footprints 2 by 2 and up (1893-1943), Tiny sharing (1913). Reach and
// range by the table rule `squareRange` (real distance rounded down, or the SRD's count,
// 1826-1829, 2075-2078). The arena, marching, flyers and loadMap on squares. Hex maps as before.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { apply, current, makeEntity, moveOptions, SETTINGS, targetsFor } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { barriers } from "../src/walls.js";
import { SETTING_TEXT } from "../src/engine/dm.js";
import { below, EPS_FT, route } from "../src/engine/world.js";
import { gridOf, SQUARE } from "../src/grid.js";
import { lintMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";
import { apart, footprint, gap } from "../src/space.js";
import { view } from "../src/view.js";
import { squareRoom } from "./fixtures/square-room.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); return r; };
const D = 5 * Math.SQRT2;                                    // a diagonal step under 'real'
const near = (a, b) => Math.abs(a - b) < 1e-9;

// The valley's party in the square room, out of the way along the south wall; the monsters stay
// behind in the valley. `edit` changes the map before it is loaded.
function room({ diagonals, squareRange, edit, seed = 14 } = {}) {
  const s = newGame(seed), map = squareRoom();
  if (edit) edit(map);
  ok(apply(s, { type: "loadMap", map }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  if (diagonals) ok(apply(s, { type: "setting", key: "diagonals", value: diagonals }, DM));
  if (squareRange) ok(apply(s, { type: "setting", key: "squareRange", value: squareRange }, DM));
  [["fighter", 1, 1], ["rogue", 0, 14], ["cleric", 1, 14], ["wizard", 2, 14]].forEach(([id, q, r]) => { s.entities[id].pos = { q, r, z: 0 }; });
  return s;
}
const spawn = (s, q, r, monster = "goblin-warrior") => s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id];
const fight = (s, center = { q: 7, r: 7 }) => ok(apply(s, { type: "startEncounter", center, radius: 6 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 30 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
// The fighter's turn in a fight in the room, with its whole Speed (30) to spend. A goblin in the
// far corner keeps the fight going.
function fighterTurn(opts) {
  const s = room(opts);
  spawn(s, 13, 13);
  fight(s); turnOf(s, "fighter");
  assert.equal(s.encounter.budget.move, 30);
  return s;
}
const stop = (s, id, q, r) => moveOptions(s, s.entities[id]).get(`${q},${r}`);
const canStop = (s, id, q, r) => !!stop(s, id, q, r)?.canStop;
// How many squares the fighter gets from where it stands stepping (dq, dr) each time.
const run = (s, dq, dr) => { const p = s.entities.fighter.pos; let n = 0; while (canStop(s, "fighter", p.q + dq * (n + 1), p.r + dr * (n + 1))) n++; return n; };

test("a square map lints and loads; the party is seated at its start; settings and their words", () => {
  assert.deepEqual(lintMap(squareRoom()), []);
  const s = newGame(14);
  const r = ok(apply(s, { type: "loadMap", map: squareRoom() }, DM));
  assert.equal(gridOf(s.map), SQUARE);
  assert.deepEqual(r.events.find((e) => e.type === "map"), { type: "map", map: "square-room", name: "Square room" });
  const seats = ["fighter", "rogue", "cleric", "wizard"].map((id) => s.entities[id].pos);
  assert.deepEqual(seats[0], { q: 1, r: 1, z: 0 });
  assert.equal(new Set(seats.map((p) => `${p.q},${p.r}`)).size, 4);
  for (const p of seats) assert.ok(SQUARE.dist(p, seats[0]) <= 1, "seated round the start");
  assert.equal(Object.values(s.entities).filter((e) => e.side !== "party").length, 0, "the valley's monsters stay behind");
  // The settings: data, with words for each value; absent means the first.
  assert.deepEqual(SETTINGS.diagonals, ["real", "srd", "alternate"]);
  assert.deepEqual(SETTINGS.squareRange, ["real", "srd"]);
  for (const k of ["diagonals", "squareRange"]) assert.deepEqual(Object.keys(SETTING_TEXT[k]), SETTINGS[k], k);
  assert.match(SETTING_TEXT.diagonals.alternate, /not in the SRD/);
  assert.equal(s.settings.diagonals, undefined);
  no(apply(s, { type: "setting", key: "diagonals", value: "manhattan" }, DM), /real, srd, alternate/);
  no(apply(s, { type: "setting", key: "diagonals", value: "srd" }, PAT), /Only the DM/);
  // Players are sent the setting as any other.
  ok(apply(s, { type: "setting", key: "diagonals", value: "alternate" }, DM));
  assert.equal(view(s, PAT).settings.diagonals, "alternate");
});

test("Speed 30 in a straight line is 6 squares under every rule, and nothing is left over", () => {
  for (const diagonals of ["real", "srd", "alternate"]) {
    const s = fighterTurn({ diagonals });
    assert.equal(run(s, 1, 0), 6, diagonals);
    assert.equal(run(s, 0, 1), 6, diagonals);
    assert.equal(stop(s, "fighter", 7, 1).cost, 30);
    ok(apply(s, { type: "move", actor: "fighter", to: { q: 7, r: 1 } }, DM));
    assert.equal(s.encounter.budget.move, 0);
    assert.equal(moveOptions(s, s.entities.fighter).size, 1, `${diagonals}: no bonus square on a straight run`);
  }
});

test("Speed 30 diagonally: 6 squares by the SRD (1814-1821), 5 for real (4 paid, the fifth on what is left), 4 every second diagonal double", () => {
  const srd = fighterTurn({ diagonals: "srd" });
  assert.equal(run(srd, 1, 1), 6);
  ok(apply(srd, { type: "move", actor: "fighter", to: { q: 7, r: 7 } }, DM));
  assert.equal(srd.encounter.budget.move, 0);

  const real = fighterTurn();                                    // 'real' is the default
  assert.equal(real.settings.diagonals, undefined);
  assert.equal(run(real, 1, 1), 5);
  for (let n = 1; n <= 4; n++) assert.ok(near(stop(real, "fighter", 1 + n, 1 + n).cost, n * D), `${n} diagonals cost ${n} x 5√2`);
  assert.equal(stop(real, "fighter", 6, 6).cost, 30, "the fifth uses up what is left");
  no(apply(real, { type: "move", actor: "fighter", to: { q: 7, r: 7 } }, DM), /Too far\. .* has 30 ft of movement left\./);
  const r = ok(apply(real, { type: "move", actor: "fighter", to: { q: 6, r: 6 } }, DM));
  assert.deepEqual(r.events.find((e) => e.type === "moved").path.map((h) => [h.q, h.r]), [[2, 2], [3, 3], [4, 4], [5, 5], [6, 6]]);
  assert.equal(real.encounter.budget.move, 0, "exactly nothing left");
  assert.equal(moveOptions(real, real.entities.fighter).size, 1);

  const alt = fighterTurn({ diagonals: "alternate" });
  assert.equal(run(alt, 1, 1), 4);
  assert.deepEqual([2, 3, 4, 5].map((n) => stop(alt, "fighter", n, n).cost), [5, 15, 20, 30]);
});

test("'real': a fraction left over carries through the turn, any of it lets a creature enter one more square, and messages say whole feet", () => {
  const s = fighterTurn();
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 3, r: 3 } }, DM));
  assert.ok(near(s.encounter.budget.move, 30 - 2 * D));          // 15.857...
  // 15.86 ft: two diagonals more cost 14.14, a third is the bonus square.
  assert.equal(run(s, 1, 1), 3);
  assert.ok(canStop(s, "fighter", 6, 6));
  assert.ok(!canStop(s, "fighter", 7, 7));
  no(apply(s, { type: "move", actor: "fighter", to: { q: 7, r: 7 } }, DM), /has 15 ft of movement left\./);
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 5, r: 5 } }, DM));
  const left = s.encounter.budget.move;
  assert.ok(left > 1.7 && left < 1.72, `${left}`);
  // 1.72 ft: a side step or a diagonal, once.
  assert.ok(canStop(s, "fighter", 6, 5) && canStop(s, "fighter", 6, 6) && !canStop(s, "fighter", 7, 5));
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 6, r: 5 } }, DM));
  assert.equal(s.encounter.budget.move, 0);
  // What players are sent is the number itself, so their screens find the same squares.
  const v = room(); spawn(v, 13, 13); fight(v); turnOf(v, "fighter");
  ok(apply(v, { type: "claim", entity: "fighter", user: "pat", userName: "Pat" }, PAT));
  ok(apply(v, { type: "move", actor: "fighter", to: { q: 2, r: 2 } }, PAT));
  const seen = view(v, PAT);
  assert.equal(seen.encounter.budget.move, v.encounter.budget.move);
  const mine = [...moveOptions(seen, seen.entities.fighter)].filter(([, o]) => o.canStop).map(([k]) => k).sort();
  const truth = [...moveOptions(v, v.entities.fighter)].filter(([, o]) => o.canStop).map(([k]) => k).sort();
  assert.deepEqual(mine, truth);
});

test("mixed paths: the cheapest way is found, and the way walked is the way costed", () => {
  const s = fighterTurn();
  // Five east and two south: two diagonals and three side steps, 29.14 ft, the cheapest of the ways.
  const there = stop(s, "fighter", 6, 3);
  assert.ok(near(there.cost, 2 * D + 15), `${there.cost}`);
  const way = route(moveOptions(s, s.entities.fighter), "6,3");
  assert.equal(way.filter((x) => x.diag).length, 2);
  assert.ok(near(way.at(-1).cost, there.cost));
  // From there, one more square on what is left: 7,3 by a side step and 7,4 by a diagonal.
  assert.ok(canStop(s, "fighter", 7, 3) && canStop(s, "fighter", 7, 4));
  assert.ok(!canStop(s, "fighter", 8, 3));
  // Six east and one south: one diagonal and four side steps (27.07 ft), then the last on the rest.
  assert.ok(canStop(s, "fighter", 7, 2) && !canStop(s, "fighter", 8, 2));
  const r = ok(apply(s, { type: "move", actor: "fighter", to: { q: 6, r: 3 } }, DM));
  const path = r.events.find((e) => e.type === "moved").path;
  assert.equal(path.length, 5);
  assert.ok(near(s.encounter.budget.move, 30 - there.cost));
  // Every square shown as reachable is accepted, and costs what was shown.
  const t = fighterTurn();
  const opts = [...moveOptions(t, t.entities.fighter)].filter(([, o]) => o.canStop);
  assert.ok(opts.length > 40);
  for (const [k, o] of opts) {
    const u = structuredClone(t);
    ok(apply(u, { type: "move", actor: "fighter", to: { q: o.h.q, r: o.h.r } }, DM));
    assert.equal(u.encounter.budget.move, 30 - o.cost, k);
  }
  // Under the SRD count the same place is 5 squares away, 25 ft; under 'alternate' 30 ft (5, 10 and three 5s).
  assert.equal(stop(fighterTurn({ diagonals: "srd" }), "fighter", 6, 3).cost, 25);
  assert.equal(stop(fighterTurn({ diagonals: "alternate" }), "fighter", 6, 3).cost, 30);
});

test("'alternate': the count of diagonals goes on through the turn, and starts again next turn", () => {
  const s = fighterTurn({ diagonals: "alternate" });
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 2, r: 2 } }, DM));      // the first: 5 ft
  assert.equal(s.encounter.budget.move, 25);
  assert.equal(s.encounter.budget.diagonals, 1);
  assert.equal(stop(s, "fighter", 3, 3).cost, 10, "the next diagonal is the second: 10 ft");
  assert.equal(stop(s, "fighter", 3, 2).cost, 5);
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 3, r: 3 } }, DM));
  assert.equal(s.encounter.budget.move, 15);
  assert.equal(s.encounter.budget.diagonals, 0);
  assert.equal(stop(s, "fighter", 4, 4).cost, 5);
  // A new turn: a clean count.
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 4, r: 4 } }, DM));
  ok(apply(s, { type: "endTurn", actor: "fighter" }, DM)); turnOf(s, "fighter");
  assert.equal(s.encounter.budget.diagonals | 0, 0);
  assert.deepEqual([5, 6].map((n) => stop(s, "fighter", n, n).cost), [5, 15]);
});

test("Difficult Terrain doubles a diagonal's real cost; Dash adds a Speed; standing up is paid before moving", () => {
  // Forest (Difficult Terrain) on 2,2: a diagonal into it costs 2 x 5√2.
  const s = fighterTurn({ edit: (m) => { m.levels[0].tiles["2,2"] = { t: "forest" }; } });
  assert.ok(near(stop(s, "fighter", 2, 2).cost, 2 * D));
  assert.equal(stop(fighterTurn({ diagonals: "srd", edit: (m) => { m.levels[0].tiles["2,2"] = { t: "forest" }; } }), "fighter", 2, 2).cost, 10);
  assert.equal(stop(fighterTurn({ diagonals: "alternate", edit: (m) => { m.levels[0].tiles["2,2"] = { t: "forest" }; } }), "fighter", 2, 2).cost, 10);
  // A room all of forest: a diagonal 14.14 a square, so 2 paid and a third on the rest; a straight run 3.
  const f = fighterTurn({ edit: (m) => { for (const t of Object.values(m.levels[0].tiles)) if (t.t === "stone") t.t = "forest"; } });
  assert.equal(run(f, 1, 1), 3);
  assert.equal(stop(f, "fighter", 4, 4).cost, 30);
  assert.equal(run(f, 1, 0), 3);
  assert.equal(stop(f, "fighter", 4, 1).cost, 30);

  // Dash: 60 ft, so 8 diagonals paid (56.6) and a ninth.
  const d = fighterTurn();
  ok(apply(d, { type: "dash", actor: "fighter" }, DM));
  assert.equal(run(d, 1, 1), 9);
  // Dash after a move that used everything up: Speed again from nothing.
  const e = fighterTurn();
  ok(apply(e, { type: "move", actor: "fighter", to: { q: 6, r: 6 } }, DM));
  assert.equal(e.encounter.budget.move, 0);
  ok(apply(e, { type: "dash", actor: "fighter" }, DM));
  assert.equal(e.encounter.budget.move, 30);
  assert.ok(near(stop(e, "fighter", 10, 10).cost, 4 * D));
  assert.equal(stop(e, "fighter", 11, 11).cost, 30, "the fifth on the rest");
  // Dash with a fraction left: 15.86 + 30.
  const g = fighterTurn();
  ok(apply(g, { type: "move", actor: "fighter", to: { q: 3, r: 3 } }, DM));
  ok(apply(g, { type: "dash", actor: "fighter" }, DM));
  assert.ok(near(g.encounter.budget.move, 60 - 2 * D));
  assert.ok(canStop(g, "fighter", 10, 10) && !canStop(g, "fighter", 11, 11));      // 6 paid (42.4 of 45.9), the seventh on the rest

  // Standing up from Prone costs half the Speed, 15 ft; then 2 diagonals paid and a third.
  const p = fighterTurn();
  ok(apply(p, { type: "condition", actor: "fighter", condition: "prone" }, DM));
  ok(apply(p, { type: "stand", actor: "fighter" }, DM));
  assert.equal(p.encounter.budget.move, 15);
  assert.equal(run(p, 1, 1), 3);
  ok(apply(p, { type: "move", actor: "fighter", to: { q: 3, r: 3 } }, DM));
  // 0.86 ft left: not enough to stand up again, but a square more.
  ok(apply(p, { type: "condition", actor: "fighter", condition: "prone" }, DM));
  const before = JSON.stringify(p);
  no(apply(p, { type: "stand", actor: "fighter" }, DM), /Standing up takes 15 ft of movement; .* has 0 ft left\./);
  assert.equal(JSON.stringify(p), before, "a refused action changes nothing");
});

test("the corner rule (1824-1825): no diagonal past a pillar, rock or the end of a wall; the side route is open", () => {
  for (const diagonals of ["real", "srd"]) {
    const s = room({ diagonals });
    const at = (q, r) => { s.entities.fighter.pos = { q, r, z: 0 }; return moveOptions(s, s.entities.fighter); };
    const side = diagonals === "real" ? 10 : 10, diag = diagonals === "real" ? D : 5;
    // The pillar (a statue) on 10,3: 9,3 to 10,2 and 9,4 to 10,4... the steps that pass its corners.
    let o = at(9, 3);
    assert.equal(o.get("10,2").cost, side, `${diagonals}: round by 9,2, not past the pillar`);
    assert.equal(o.get("10,4").cost, side);
    assert.ok(near(o.get("8,2").cost, diag), "a diagonal away from it is open");
    assert.deepEqual(route(o, "10,2").map((x) => [x.h.q, x.h.r]), [[9, 2], [10, 2]]);
    // Rock on 12,12.
    o = at(11, 12);
    assert.equal(o.get("12,11").cost, side);
    assert.equal(o.get("12,13").cost, side);
    // The stub of wall on x = 12.5 ft ends on the corner of 2,5 / 3,5 / 2,6 / 3,6.
    o = at(2, 5);
    assert.equal(o.get("3,6").cost, side, "not across the wall's end");
    assert.deepEqual(route(o, "3,6").map((x) => [x.h.q, x.h.r]), [[3, 5], [3, 6]]);
    o = at(3, 5);
    assert.equal(o.get("2,6").cost, side);
    // A creature is not a terrain feature: a diagonal between two of them is allowed.
    s.entities.rogue.pos = { q: 6, r: 7, z: 0 }; s.entities.cleric.pos = { q: 7, r: 6, z: 0 };
    o = at(6, 6);
    assert.ok(near(o.get("7,7").cost, diag));
  }
});

test("a Large creature fills 2 by 2 (1893-1943): through the 10-ft corridor, not the 5-ft one; its parts obey the corners", () => {
  const s = room();
  const ogre = spawn(s, 11, 3, "ogre");
  assert.equal(ogre.size, "large");
  assert.deepEqual(footprint(ogre, ogre.pos, SQUARE).map((f) => [f.q, f.r]), [[11, 3], [12, 3], [11, 4], [12, 4]]);
  const o = moveOptions(s, ogre);
  assert.ok([...o.values()].some((v) => v.canStop && v.h.q === 21 && v.h.r === 3), "to the end of the wide corridor");
  assert.ok(![...o.values()].some((v) => v.h.q >= 15 && v.h.r >= 9), "not into the narrow one");
  // A Medium creature goes down the narrow corridor as far as the shut door.
  s.entities.fighter.pos = { q: 13, r: 10, z: 0 };
  const f = moveOptions(s, s.entities.fighter);
  assert.ok(f.get("18,10") && !f.get("19,10"));
  // Nobody stops in any of its four squares; it is beside whoever stands by any of them.
  for (const [q, r] of [[11, 3], [12, 3], [11, 4], [12, 4]]) assert.ok(!canStop(s, "fighter", q, r), `${q},${r}`);
  s.entities.fighter.pos = { q: 13, r: 5, z: 0 };                 // diagonal to 12,4
  assert.equal(apart(s, s.entities.fighter, ogre), 1);
  // The pillar on 10,3: the ogre at 11,3 cannot step diagonally to 10,2 / 10,4 past it, nor stand on it.
  assert.ok(o.get("10,4")?.canStop);
  assert.deepEqual(route(o, "10,4").map((x) => [x.h.q, x.h.r]), [[11, 4], [10, 4]], "down, then west: not diagonally past the pillar");
  assert.ok(![...o.values()].some((v) => footprint(ogre, v.h, SQUARE).some((p) => p.q === 10 && p.r === 3)));
});

test("Tiny creatures share a square four at a time (1913); a fifth cannot", () => {
  const s = room();
  const rats = [0, 1, 2, 3, 4].map((i) => spawn(s, 5 + i, 8, "rat"));
  for (const r of rats) assert.equal(r.size, "tiny");
  for (let i = 1; i <= 3; i++) ok(apply(s, { type: "move", actor: rats[i].id, to: { q: 5, r: 8 } }, DM));
  assert.equal(rats.filter((r) => r.pos.q === 5 && r.pos.r === 8).length, 4);
  assert.equal(stop(s, rats[4].id, 5, 8)?.canStop ?? false, false);
  no(apply(s, { type: "move", actor: rats[4].id, to: { q: 5, r: 8 } }, DM));
  assert.equal(rats[4].pos.q, 9);
});

test("a goblin diagonal to the fighter is within reach, and walking away provokes an Opportunity Attack (1826-1829, 2075)", () => {
  for (const squareRange of ["real", "srd"]) {
    const s = room({ squareRange });
    const gob = spawn(s, 5, 5);
    s.entities.fighter.pos = { q: 4, r: 4, z: 0 };
    assert.equal(apart(s, s.entities.fighter, gob), 1, squareRange);
    for (const e of Object.values(s.entities)) e.hp = e.maxHp = 500;
    fight(s); turnOf(s, gob.id);
    const r = ok(apply(s, { type: "move", actor: gob.id, to: { q: 7, r: 7 } }, DM));
    assert.ok(r.events.some((e) => e.type === "reaction" && e.id === "fighter" && e.reaction === "opportunity-attack" && e.against === gob.id), squareRange);
    // The fighter can attack it diagonally too.
    s.entities.fighter.pos = { q: 6, r: 6, z: 0 }; gob.pos = { q: 7, r: 7, z: 0 };
    const atk = s.entities.fighter.attacks.find((a) => a.type === "melee");
    assert.ok(targetsFor(s, s.entities.fighter, { attack: atk.id }).includes(gob.id), squareRange);
  }
});

test("reach and range on squares: real distance rounded down, or the SRD's count; through the same measure everywhere", () => {
  const real = room(), srd = room({ squareRange: "srd" });
  const P = (q, r) => ({ q, r, z: 0 });
  // Centre to centre for real, rounded down to a whole 5 ft: the eight round about are 5 ft.
  for (const [q, r, feetReal, feetSrd] of [[1, 0, 5, 5], [1, 1, 5, 5], [2, 1, 10, 10], [2, 2, 10, 10], [3, 3, 20, 15], [4, 3, 25, 20], [6, 6, 40, 30], [5, 0, 25, 25]]) {
    assert.equal(gap(real, P(0, 0), P(q, r)) * 5, feetReal, `${q},${r} real`);
    assert.equal(gap(srd, P(0, 0), P(q, r)) * 5, feetSrd, `${q},${r} srd`);
  }
  // A spell's range: Sacred Flame (60 ft) from 1,1 at a goblin ten squares diagonally away, on 11,11:
  // 70 ft for real (14.1 squares), out of range; 50 ft by the SRD's count, in range. The cast agrees.
  for (const [s, inRange] of [[real, false], [srd, true]]) {
    const gob = spawn(s, 11, 11);
    s.entities.cleric.pos = P(1, 1);
    assert.equal(targetsFor(s, s.entities.cleric, { spell: "sacred-flame" }).includes(gob.id), inRange);
    const r = apply(s, { type: "cast", actor: "cleric", spell: "sacred-flame", target: gob.id }, DM);
    if (inRange) ok(r); else no(r, /is 70 ft away\. Sacred Flame reaches 60 ft\./);
  }
  // Hexes measure as they always did, whatever the setting.
  const h = newGame(3);
  ok(apply(h, { type: "setting", key: "squareRange", value: "real" }, DM));
  assert.equal(gap(h, P(0, 0), P(3, 3)), 6);
});

test("the arena on squares is the 13 by 13 block; a follower keeps up in marching order; a flyer moves in 8 directions", () => {
  const s = room();
  fight(s);
  const arena = Object.keys(s.encounter.arena);
  assert.equal(arena.length, 169);
  for (const k of arena) { const [q, r] = k.split(",").map(Number); assert.ok(q >= 1 && q <= 13 && r >= 1 && r <= 13, k); }
  ok(apply(s, { type: "endEncounter" }, DM));

  // Marching: the rogue follows the fighter down the room diagonally and stays close behind.
  const m = room();
  m.entities.rogue.pos = { q: 1, r: 2, z: 0 };
  ok(apply(m, { type: "follow", actor: "rogue", leader: "fighter" }, DM));
  const r = ok(apply(m, { type: "move", actor: "fighter", to: { q: 8, r: 8 } }, DM));
  assert.ok(r.events.some((e) => e.type === "moved" && e.id === "rogue"));
  assert.ok(apart(m, m.entities.rogue, m.entities.fighter) <= 2, JSON.stringify(m.entities.rogue.pos));
  assert.equal(m.entities.rogue.follow, "fighter");

  // A flyer (a Giant Eagle, Large: 2 by 2) moves in the 8 directions, and up or down as it goes.
  const f = room();
  const bat = spawn(f, 7, 7, "giant-eagle");
  const o = moveOptions(f, bat);
  for (const [dq, dr] of SQUARE.DIRS) assert.ok(o.has(`${7 + dq},${7 + dr},5`), `${dq},${dr}`);
  const aloftDiag = [...o.values()].find((v) => v.h.q === 8 && v.h.r === 8 && v.h.z === 5);
  assert.ok(aloftDiag, "up 5 ft and diagonally");
  assert.ok(near(aloftDiag.cost, D));
});

test("loadMap ends the lasting areas of the old map (E8) and migrates a format 1 map it is sent", () => {
  // A Fog Cloud in the valley; then the party goes to the square room.
  const s = newGame(14);
  s.entities.wizard.spells.push("fog-cloud");
  s.entities.wizard.slots[1] = 2;
  const c = apply(s, { type: "cast", actor: "wizard", spell: "fog-cloud", hex: { q: s.entities.wizard.pos.q + 3, r: s.entities.wizard.pos.r } }, DM);
  ok(c);
  const fx = s.effects.find((x) => x.terrain);
  assert.ok(fx, "the fog is laid on the valley's hexes");
  const r = ok(apply(s, { type: "loadMap", map: squareRoom() }, DM));
  assert.ok(r.events.some((e) => e.type === "effectEnd" && e.fx === fx.id));
  assert.ok(!s.effects.some((x) => x.terrain || x.zone));
  // A format 1 document is brought up to format 2 by loadMap itself.
  const t = newGame(14), old = structuredClone(squareRoom());
  delete old.grid; delete old.cellFeet; old.format = 1; old.hexFeet = 5;
  ok(apply(t, { type: "loadMap", map: old }, DM));
  assert.equal(t.map.format, 2);
  assert.equal(t.map.grid, "hex", "a format 1 map is a hex map, whatever it looks like");
});

test("one tolerance for feet: equal routes compare equal, different ones never do", () => {
  assert.equal(EPS_FT, 1e-6);
  assert.ok(!below(2 * D + 5, 5 + D + D));
  assert.ok(!below(5 + D + D, 2 * D + 5));
  assert.ok(below(4 * D, 30));
  assert.ok(below(29, 29.5));
});

test("fractions of a foot replay exactly: the same actions on the same seed give the same state, bit for bit", () => {
  const play = () => {
    const s = fighterTurn();
    for (const to of [{ q: 2, r: 2 }, { q: 3, r: 4 }, { q: 5, r: 5 }]) ok(apply(s, { type: "move", actor: "fighter", to }, DM));
    ok(apply(s, { type: "dash", actor: "fighter" }, DM));
    ok(apply(s, { type: "move", actor: "fighter", to: { q: 10, r: 9 } }, DM));
    return s;
  };
  const a = play(), b = play();
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.ok(!Number.isInteger(a.encounter.budget.move) || a.encounter.budget.move === 0);
  // A refused move changes nothing.
  const before = JSON.stringify(a);
  no(apply(a, { type: "move", actor: "fighter", to: { q: 13, r: 1 } }, DM), /Too far/);
  assert.equal(JSON.stringify(a), before);
});

test("on a hex map the square settings change nothing", () => {
  const base = newGame(9);
  const shape = (s) => JSON.stringify([...moveOptions(s, s.entities.fighter)]);
  const want = shape(base), wantGap = gap(base, base.entities.fighter.pos, base.entities.m1.pos);
  for (const [key, value] of [["diagonals", "real"], ["diagonals", "srd"], ["diagonals", "alternate"], ["squareRange", "real"], ["squareRange", "srd"]]) {
    const s = newGame(9);
    ok(apply(s, { type: "setting", key, value }, DM));
    assert.equal(shape(s), want, `${key} ${value}`);
    assert.equal(gap(s, s.entities.fighter.pos, s.entities.m1.pos), wantGap);
  }
});

// ---------- the review of #255: the map's grid everywhere, and the fixes ----------

test("H1: no size change puts two creatures in one square; a change that cannot fit is refused and changes nothing", () => {
  // setSize: a goblin on 7,7 is the fourth square of a Large fighter at 6,6; on 10,10, of a Huge one at 8,8.
  for (const [size, at, gob] of [["large", [6, 6], [7, 7]], ["huge", [8, 8], [10, 10]], ["gargantuan", [8, 8], [11, 11]]]) {
    const s = room();
    s.entities.fighter.pos = { q: at[0], r: at[1], z: 0 };
    spawn(s, ...gob);
    const before = JSON.stringify(s);
    no(apply(s, { type: "setSize", actor: "fighter", size }, DM), /Someone is in the way of Brenna growing|in the way/);
    assert.equal(JSON.stringify(s), before, size);
  }
  // editCharacter with a Large record, likewise.
  const A = { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 10 };
  const fighterSheet = { name: "Big", class: "fighter", level: 1, abilities: A, skills: ["athletics", "perception"], armour: "chain-mail", weapons: ["longsword"] };
  const e = room();
  const rec = derive(fighterSheet).record;
  e.entities.hero = makeEntity(rec, { id: "hero", kind: "pc", side: "party", pos: { q: 6, r: 6, z: 0 } });
  spawn(e, 7, 7);
  const before = JSON.stringify(e);
  no(apply(e, { type: "editCharacter", actor: "hero", record: { ...rec, size: "large" } }, DM), /in the way/);
  assert.equal(JSON.stringify(e), before);
  // Wild Shape into a Brown Bear (Large) by the player, with a goblin on the bear's fourth square.
  const sheet = { name: "Ven", class: "druid", level: 8, subclass: "land", abilities: { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 }, skills: ["nature", "perception"],
    choices: { "primal-order": "warden" }, armour: "leather-armor", shield: true, weapons: ["quarterstaff"], spells: ["produce-flame", "cure-wounds"] };
  const w = room();
  w.entities.druid = makeEntity(derive(sheet).record, { id: "druid", kind: "pc", side: "party", pos: { q: 6, r: 6, z: 0 } });
  ok(apply(w, { type: "claim", entity: "druid", user: "pat", userName: "Pat" }, PAT));
  spawn(w, 7, 7);
  const b = JSON.stringify(w);
  no(apply(w, { type: "feature", actor: "druid", feature: "wild-shape", form: "brown-bear" }, PAT), /in the way/);
  assert.equal(JSON.stringify(w), b);
  // With room, the bear takes 2 by 2.
  w.entities.druid.pos = { q: 2, r: 8, z: 0 };
  ok(apply(w, { type: "feature", actor: "druid", feature: "wild-shape", form: "brown-bear" }, PAT));
  assert.equal(footprint(w.entities.druid, w.entities.druid.pos, SQUARE).length, 4);
  // Misty Step onto the fourth square of an ogre the wizard can see is refused (not moved aside).
  const m = room();
  const wiz = m.entities.wizard;
  wiz.spells.push("misty-step"); wiz.slots[2] = 2; wiz.pos = { q: 5, r: 9, z: 0 };
  spawn(m, 5, 5, "ogre");
  const mb = JSON.stringify(m);
  no(apply(m, { type: "cast", actor: "wizard", spell: "misty-step", hex: { q: 6, r: 6 } }, DM), /occupied/);
  assert.equal(JSON.stringify(m), mb);
});

test("H2: a Large, Huge or Gargantuan party member sees from its own squares only, not through a wall", () => {
  const wallAt = (m) => { m.walls.push({ id: "w", level: "ground", a: [37.5, -2.5], b: [37.5, 72.5], kind: "wall" }); };
  // The wall runs between columns 7 and 8. Each viewer stands wholly on one side, the goblin on the other.
  const cases = [
    ["large", [8, 8], [5, 8]], ["huge", [8, 8], [5, 8]], ["gargantuan", [8, 8], [5, 8]],
    ["large", [5, 5], [10, 8]], ["huge", [4, 4], [10, 8]], ["gargantuan", [3, 3], [10, 8]],
  ];
  for (const [size, at, gob] of cases) {
    const s = room({ edit: wallAt });
    for (const id of ["rogue", "cleric", "wizard"]) delete s.entities[id];
    ok(apply(s, { type: "setting", key: "sight", value: "los" }, DM));
    const f = s.entities.fighter;
    f.pos = { q: at[0], r: at[1], z: 0 };
    ok(apply(s, { type: "setSize", actor: "fighter", size }, DM));
    assert.ok(footprint(f, f.pos, SQUARE).every((p) => (p.q >= 8) === (at[0] >= 8)), `${size} wholly on one side`);
    const g = spawn(s, ...gob), friend = spawn(s, at[0] >= 8 ? 13 : 1, 13);
    ok(apply(s, { type: "claim", entity: "fighter", user: "pat", userName: "Pat" }, PAT));
    const v = view(s, PAT);
    assert.equal(!!v.entities[g.id], false, `${size} at ${at}: the goblin beyond the wall is not sent`);
    assert.equal(!!v.entities[friend.id], true, `${size} at ${at}: one on its own side is`);
  }
});

test("M1: the last square on what is left is for a step on the flat; climbing or a step up is paid in full", () => {
  for (const h of [10, 30]) {
    const s = fighterTurn({ edit: (m) => { m.levels[0].tiles["7,1"] = { t: "stone", h }; } });
    ok(apply(s, { type: "move", actor: "fighter", to: { q: 6, r: 1 } }, DM));
    assert.equal(s.encounter.budget.move, 5);
    assert.equal(stop(s, "fighter", 7, 1), undefined);
    assert.equal(moveOptions(s, s.entities.fighter).get(`7,1,${h}`), undefined, `a ${h}-ft face is not climbed on 5 ft`);
    assert.ok(canStop(s, "fighter", 6, 2), "a step on the flat is");
  }
  // 1.72 ft left after 4 diagonals and a side step... here: 5,5 after four diagonals; 6,6 is a step up 4 ft (Difficult).
  const t = fighterTurn({ edit: (m) => { m.levels[0].tiles["6,6"] = { t: "stone", h: 4 }; m.levels[0].tiles["6,5"] = { t: "forest" }; } });
  ok(apply(t, { type: "move", actor: "fighter", to: { q: 5, r: 5 } }, DM));
  assert.ok(t.encounter.budget.move > 1.7 && t.encounter.budget.move < 1.72);
  const o = moveOptions(t, t.entities.fighter);
  assert.equal(o.get("6,6,4"), undefined, "a step up 4 ft is not on the flat");
  assert.equal(o.get("6,5")?.canStop, true, "Difficult Terrain on the flat still is");
  assert.equal(o.get("6,5").cost, t.encounter.budget.move, "and uses up the rest");
  // Flying: level, yes; up, no. A Giant Eagle (fly 80 ft) left with a fraction.
  const f = fighterTurn();
  const eagle = spawn(f, 3, 9, "giant-eagle");
  turnOf(f, eagle.id);
  f.encounter.budget.move = 1 - (eagle.speeds.fly - eagle.speed);     // 1 ft of flying left this turn
  const fo = moveOptions(f, eagle);
  assert.ok([...fo.values()].some((v) => v.h.z === 0 && v.h.q === 4 && v.h.r === 9), "level: on what is left");
  assert.ok(![...fo.values()].some((v) => v.h.z === 5), "up: paid in full, and there is not enough");
});

test("M2 and L2: a push on squares moves every part past no wall or corner, and counts diagonals by the rule", () => {
  // The reviewer's case: a wall from 27.5,17.5 to 27.5,22.5 ends on the corner of 5,4 / 6,4 / 5,5 / 6,5.
  const stub = (m) => { m.walls = m.walls.filter((w) => w.id !== "stub"); m.walls.push({ id: "st", level: "ground", a: [27.5, 17.5], b: [27.5, 22.5], kind: "wall" }); };
  let pushedOgre = 0;
  for (let seed = 1; seed < 60 && pushedOgre < 3; seed++) {
    const s = room({ seed, edit: stub });
    const w = s.entities.wizard;
    w.spells.push("thunderwave"); w.slots[1] = 3;
    const og = spawn(s, 4, 4, "ogre"); og.hp = og.maxHp = 999;
    w.pos = { q: 3, r: 3, z: 0 };
    fight(s); turnOf(s, "wizard");
    const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "thunderwave", hex: { q: 4, r: 4 } }, DM));
    const mv = r.events.find((e) => e.type === "moved" && e.forced && e.id === og.id);
    if (!mv) continue;
    pushedOgre++;
    const B = barriers(s.map);
    let at = { q: 4, r: 4 };
    for (const step of mv.path) {
      const parts = footprint(og, at, SQUARE), next = footprint(og, step, SQUARE);
      parts.forEach((p, j) => assert.ok(!B.blocked("ground", p, next[j]), `seed ${seed}: part ${p.q},${p.r} -> ${next[j].q},${next[j].r} crosses a wall`));
      at = step;
    }
  }
  assert.ok(pushedOgre > 0, "some seed pushes the ogre");
  // Thunderwave's 10 ft, diagonally: one square for real (7.07 ft; a second would be 14.1), two by the
  // SRD's count; under 'alternate' a diagonal (5) and then, the next diagonal being 10, a side step (5).
  for (const [diagonals, n] of [["real", 1], ["srd", 2], ["alternate", 2]]) {
    let seen = 0;
    for (let seed = 1; seed < 60 && !seen; seed++) {
      const s = room({ seed, diagonals });
      const w = s.entities.wizard;
      w.spells.push("thunderwave"); w.slots[1] = 3;
      const g = spawn(s, 4, 4); g.hp = g.maxHp = 999;
      w.pos = { q: 3, r: 3, z: 0 };
      fight(s); turnOf(s, "wizard");
      const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "thunderwave", hex: { q: 4, r: 4 } }, DM));
      const mv = r.events.find((e) => e.type === "moved" && e.forced && e.id === g.id);
      if (!mv) continue;
      seen++;
      assert.deepEqual(mv.path.map((p) => [p.q, p.r]), (diagonals === "alternate" ? [[5, 5], [6, 5]] : [[5, 5], [6, 6]]).slice(0, n), `${diagonals}: ${JSON.stringify(mv.path)}`);
    }
    assert.ok(seen, diagonals);
  }
});

test("L1: a map that cannot be copied is refused with a sentence, not a throw", () => {
  const s = newGame(3), before = JSON.stringify(s);
  no(apply(s, { type: "loadMap", map: { f() {} } }, DM), /^That map can't be used\. It is not a map document\.$/);
  assert.equal(JSON.stringify(s), before);
});

test("every caller of footprint, shapeOf and overlapAt in the rules and the client passes the map's grid", () => {
  const want = { footprint: 3, shapeOf: 2, overlapAt: 5 };
  const roots = [new URL("../src/", import.meta.url), new URL("../src/engine/", import.meta.url), new URL("../../client/", import.meta.url)];
  const args = (src, open) => {                       // the top-level arguments of the call whose "(" is at `open`
    let depth = 0, n = 0, any = false;
    for (let i = open; i < src.length; i++) {
      const c = src[i];
      if ("([{".includes(c)) { depth++; continue; }
      if (")]}".includes(c)) { depth--; if (depth === 0) return any ? n + 1 : 0; continue; }
      if (depth === 1 && c === ",") n++;
      else if (depth === 1 && !/\s/.test(c)) any = true;
    }
    return -1;
  };
  let calls = 0;
  for (const root of roots) for (const f of readdirSync(root).filter((x) => x.endsWith(".js"))) {
    const path = new URL(f, root), src = readFileSync(path, "utf8");
    if (f === "space.js" && root.href.endsWith("/src/")) continue;    // where they are defined
    for (const [name, n] of Object.entries(want)) {
      if (new RegExp(`const ${name} = `).test(src)) continue;          // a file with its own function of that name (the renderers' shapeOf)
      for (const m of src.matchAll(new RegExp(`(?<![\\w.$])${name}\\(`, "g"))) {
        calls++;
        assert.equal(args(src, m.index + name.length), n, `${f}: ${src.slice(m.index, src.indexOf("\n", m.index)).slice(0, 120)}`);
      }
    }
  }
  assert.ok(calls > 30, `${calls} calls checked`);
});
