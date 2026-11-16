// The re-review of #368, N1 to N3 (#372; movement.js `move`, walkKnown): a party creature's move laid out on what the
// party knows, with a creature it does not know of (hidden by the DM, or hiding) near its way. On hexes and the square
// room, with the rogue and the wizard following the fighter:
//   N2: allies on every cell before the creature: the fighter goes to the nearest place beside it it can reach (no more
//       "no move, and found from three cells off"); already beside it, no move (hidden-information.md section 5);
//   N1: a move that stops short of it brings the followers after the leader;
//   N3: a creature spotted on the way (the DM's hidden one, within ENGAGE_RANGE) is known from then on: the rest of the
//       way is laid out again, and the fighter gets where it was going, as main's walk did.
// Twin runs: the creature on the route, beside it, on the destination and far off, against the same world with it far
// off: every player's events and view are the same after every action until an existing reveal rule fires, and the
// reveal is one of those rules (spotted within ENGAGE_RANGE in passing, or found from beside it).
import assert from "node:assert/strict";
import { test } from "node:test";
import * as E from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { viewEvents, view } from "../src/view.js";
import { apart } from "../src/space.js";
import { gridOf } from "../src/grid.js";
import { squareRoom } from "./fixtures/square-room.js";
import { kit, DM, U1, U3, PLAYERS, GRIDS, SPOTS, json, ok } from "./e23-kit.js";

const { apply, ENGAGE_RANGE } = E;
const K = kit({ apply, current: E.current, makeEntity: E.makeEntity, derive, newGame, squareRoom });
const EAST = { hex: [0, 1], square: [1, 0] };          // straight ways on each map (the valley has rough ground east of the party)
const at = (p, n, grid) => ({ q: p.q + EAST[grid][0] * n, r: p.r + EAST[grid][1] * n });
const cell = (p) => ({ q: p.q, r: p.r });
const seen = (s, r) => PLAYERS.map((u) => json([viewEvents(r.events, s, u), view(s, u)]));
// A table for walking: no casters, autoEngage off, the fighter with the rogue and the wizard behind it (or, `line`, on
// the two cells in front of it), following it.
function walkers(grid, { line = false, follow = true } = {}) {
  const s = K.table(grid, { autoEngage: false });
  for (const id of ["mage", "priest"]) ok(apply(s, { type: "remove", actor: id }, DM));
  const F = SPOTS[grid].fighter;
  ok(apply(s, { type: "place", actor: "rogue", to: line ? at(F, 1, grid) : at(F, -1, grid) }, DM));
  ok(apply(s, { type: "place", actor: "wizard", to: line ? at(F, 2, grid) : { q: F.q - 1, r: F.r + 1 } }, DM));
  if (follow) { ok(apply(s, { type: "follow", actor: "rogue", leader: "fighter" }, DM)); ok(apply(s, { type: "follow", actor: "wizard", leader: "fighter" }, U3)); }
  return s;
}
const lurk = (s, pos, kind) => {
  const r = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: cell(pos), name: "Lurker" }, DM));
  const id = r.events.find((e) => e.type === "spawned").id;
  if (kind === "hidden") ok(apply(s, { type: "reveal", actor: id, hidden: true }, DM)); else s.entities[id].hiding = { dc: 30 };
  return id;
};
const pathOf = (r, id) => r.events.filter((e) => e.type === "moved" && e.id === id).flatMap((e) => e.path);
// Who was walking, and where it stood, when the lurker was revealed or found (the DM's events, in order): the leader,
// or a follower marching after it.
function revealAt(s, r, mover, lurker, from) {
  let pos = from, who = mover;
  for (const e of r.events) {
    if (e.type === "moved") { pos = e.path.at(-1); who = e.id; }
    if ((e.type === "revealed" || e.type === "unhidden") && e.id === lurker) return { pos, how: e.type, who };
  }
  return null;
}
const found = (r, id) => r.events.some((e) => (e.type === "revealed" || e.type === "unhidden") && e.id === id);

for (const grid of GRIDS) {
  const F = SPOTS[grid].fighter, DEST = at(F, 6, grid), FAR = SPOTS[grid].far;
  // The twin: the lurker far off. Its route is where the lurker goes in the other world.
  const twin = (kind) => { const s = walkers(grid); const id = lurk(s, FAR, kind); const r = ok(apply(s, { type: "move", actor: "fighter", to: DEST }, U1)); return { s, id, r, path: pathOf(r, "fighter") }; };
  for (const kind of ["hidden", "hiding"]) {
    test(`${grid}, ${kind}: on the route, beside it, on the destination, far: the same for players until a reveal rule fires`, () => {
      const B = twin(kind);
      assert.ok(B.path.length >= 5, `a route: ${json(B.path)}`);
      assert.deepEqual(cell(B.s.entities.fighter.pos), cell(DEST));
      const G = gridOf(B.s.map), mid = B.path[2];
      const beside = G.range(mid, 1).find((h) => G.dist(h, mid) === 1 && !B.path.some((p) => p.q === h.q && p.r === h.r) && apply(structuredClone(walkers(grid)), { type: "spawn", monster: "goblin-warrior", at: h }, DM).ok);
      const places = { route: mid, beside, destination: DEST, far: FAR };
      for (const [where, pos] of Object.entries(places)) {
        const A = walkers(grid), b = walkers(grid);
        const ga = lurk(A, pos, kind), gb = lurk(b, FAR, kind);
        assert.equal(ga, gb);
        assert.deepEqual(PLAYERS.map((u) => json(view(A, u))), PLAYERS.map((u) => json(view(b, u))), `${where}: the tables look the same`);
        const ra = apply(A, { type: "move", actor: "fighter", to: DEST }, U1), rb = ok(apply(b, { type: "move", actor: "fighter", to: DEST }, U1));
        assert.ok(ra.ok, `${where}: never refused (${ra.error})`);
        if (!found(ra, ga)) {
          const [x, y] = [seen(A, ra), seen(b, rb)];
            assert.deepEqual(x, y, `${where}: nothing found, nothing different`);
          continue;
        }
        assert.notEqual(where, "far");
        // Found by a rule of the engine's own: spotted within ENGAGE_RANGE (the DM's hidden one, in passing), or from beside it.
        const how = revealAt(A, ra, "fighter", ga, F);
        const d = apart(A, { ...A.entities[how.who], pos: { ...how.pos, z: 0 } }, A.entities[ga]);
        assert.ok(how.how === "revealed" ? kind === "hidden" && d <= ENGAGE_RANGE : d <= 1, `${where}: found ${how.how} by ${how.who} at ${d}`);
        // Its followers came after it (N1), whichever way the move ended.
        if (key(A.entities.fighter.pos) !== key(F)) for (const id of ["rogue", "wizard"]) assert.ok(pathOf(ra, id).length > 0, `${where}: ${id} followed`);
        // N3: the DM's hidden one, spotted on the way, is walked round: the fighter gets there.
        if (kind === "hidden" && where !== "destination") assert.deepEqual(cell(A.entities.fighter.pos), cell(DEST), `${where}: it got there`);
        if (kind === "hiding" && where === "route") assert.ok(apart(A, A.entities.fighter, A.entities[ga]) <= 1, "stopped before it, beside it");
      }
    });

    test(`${grid}, ${kind}: allies on every cell before it (N2): to the nearest place beside it; already beside it, no move`, () => {
      const make = () => { const s = walkers(grid, { line: true, follow: false }); return { s, g: lurk(s, at(F, 3, grid), kind) }; };
      const { s, g } = make(), to = at(F, 5, grid);
      const r = ok(apply(s, { type: "move", actor: "fighter", to }, U1));
      assert.ok(found(r, g), json(r.events.map((e) => e.type)));
      const how = revealAt(s, r, "fighter", g, F);
      const d = apart(s, { ...s.entities.fighter, pos: { ...how.pos, z: 0 } }, s.entities[g]);
      assert.ok(how.how === "revealed" ? d <= ENGAGE_RANGE : d <= 1, `found from ${d} (${how.how}), not from where it set off (3)`);
      assert.ok(pathOf(r, "fighter").length > 0, "it moved");
      if (kind === "hiding") assert.ok(apart(s, s.entities.fighter, s.entities[g]) <= 1, "it stands beside it");
      // The twin with no lurker near walks through its allies to the place: nothing was sent before the move.
      // Beside it already: no move, found (section 5).
      const t = walkers(grid, { line: true, follow: false });
      ok(apply(t, { type: "place", actor: "wizard", to: at(F, -1, grid) }, DM));
      ok(apply(t, { type: "place", actor: "rogue", to: { q: F.q - 1, r: F.r + 1 } }, DM));
      const g2 = lurk(t, at(F, 1, grid), kind), was = json(t.entities.fighter.pos);
      const r2 = ok(apply(t, { type: "move", actor: "fighter", to: at(F, 3, grid) }, U1));
      assert.ok(found(r2, g2));
      assert.equal(pathOf(r2, "fighter").length, 0);
      assert.equal(json(t.entities.fighter.pos), was);
    });

    test(`${grid}, ${kind}: a move that stops short of it brings the followers (N1)`, () => {
      const s = walkers(grid), g = lurk(s, at(F, 3, grid), kind);
      const from = { rogue: json(s.entities.rogue.pos), wizard: json(s.entities.wizard.pos) };
      const r = ok(apply(s, { type: "move", actor: "fighter", to: DEST }, U1));
      assert.ok(found(r, g));
      for (const id of ["rogue", "wizard"]) { assert.notEqual(json(s.entities[id].pos), from[id], `${id} followed`); assert.equal(s.entities[id].follow, "fighter"); }
    });
  }
}
const key = (p) => `${p.q},${p.r},${p.z ?? 0}`;

// In a fight (a creature hiding from the fighter, on its route or behind its allies): never refused, the movement spent
// is the cells walked, and the creature is found only from beside it.
for (const grid of GRIDS) {
  const F = SPOTS[grid].fighter;
  test(`${grid}: in a fight, a hiding creature on the route or behind allies: found from beside it, movement spent as walked`, () => {
    for (const line of [false, true]) {
      const s = walkers(grid, { line, follow: false }), g = lurk(s, at(F, 3, grid), "hiding");
      ok(apply(s, { type: "startEncounter", center: cell(at(F, 2, grid)), radius: 8 }, DM));
      for (let i = 0; i < 40 && E.current(s) !== "fighter"; i++) ok(apply(s, { type: "endTurn", actor: E.current(s) }, DM));
      const budget = s.encounter.budget.move;
      const r = apply(s, { type: "move", actor: "fighter", to: at(F, 4, grid) }, U1);
      assert.ok(r.ok, r.error);
      assert.ok(r.events.some((e) => e.type === "unhidden" && e.id === g), `${line}: found`);
      assert.ok(apart(s, s.entities.fighter, s.entities[g]) <= 1, `${line}: from beside it`);
      const cells = pathOf(r, "fighter").length;
      assert.ok(cells > 0, `${line}: it moved`);
      // Spent as walked: at least 5 ft a cell (the valley's forest is difficult ground), never what the destination would cost.
      const spent = budget - s.encounter.budget.move;
      assert.ok(spent >= cells * 5 && spent <= cells * 10, `${line}: ${spent} ft for ${cells} cells`);
    }
  });
}
