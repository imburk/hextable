// Companions C7 (#366): four engine follow-ups from the review of C6b (#363), on hexes and on the square room.
//   W13: a rider or its mount can change size or be remade (setSize, editCharacter, setSheet's remake, Wild Shape): the
//        other half of the pair is not "in the way"; a rider no longer smaller than its mount is set down beside it.
//   W16: attacks see and aim from the rider's raised eye (sight.js), as the party's view already does (vision.js).
//   W18: the DM's setHp does not bring a dead rider back under the mount that stands on its body.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { apart, overlapAt } from "../src/space.js";
import { canSee, coverOf } from "../src/sight.js";
import { gridOf } from "../src/grid.js";
import { squareRoom } from "./fixtures/square-room.js";

const DM = { role: "dm", userId: "dm" }, U1 = { role: "player", userId: "u1" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); };
const json = (x) => JSON.stringify(x);
const GRIDS = ["hex", "square"];
const SPOTS = {
  hex: { fighter: { q: -6, r: 2 }, rogue: { q: -7, r: 3 }, cleric: { q: -7, r: 2 }, wizard: { q: -8, r: 3 }, goblin: { q: 2, r: 2 } },
  square: { fighter: { q: 3, r: 3 }, rogue: { q: 1, r: 12 }, cleric: { q: 2, r: 12 }, wizard: { q: 3, r: 12 }, goblin: { q: 11, r: 11 } },
};
const CENTER = { hex: { q: -2, r: 2 }, square: { q: 7, r: 7 } };
const spawn = (s, monster, at, more = {}) => ok(apply(s, { type: "spawn", monster, at, ...more }, DM)).events.find((e) => e.type === "spawned").id;
function beside(s, id, monster, more = {}) {
  const G = gridOf(s.map), e = s.entities[id];
  for (const h of G.range(e.pos, 3).sort((a, b) => G.dist(a, e.pos) - G.dist(b, e.pos) || a.q - b.q || a.r - b.r)) {
    const t = structuredClone(s), r = apply(t, { type: "spawn", monster, at: h, ...more }, DM);
    if (!r.ok || apart(t, e, t.entities[r.events.find((x) => x.type === "spawned").id]) > 1) continue;
    return spawn(s, monster, h, more);
  }
  throw new Error(`no room beside ${id}`);
}
const turnOf = (s, id) => { for (let i = 0; i < 60 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
function table(grid, { fight = false } = {}) {
  const s = newGame(5);
  if (grid === "square") ok(apply(s, { type: "loadMap", map: squareRoom() }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  for (const id of Object.keys(s.entities)) if (/^m\d+$/.test(id)) ok(apply(s, { type: "remove", actor: id }, DM));
  for (const id of ["fighter", "rogue", "cleric", "wizard"]) s.entities[id].pos = { ...SPOTS[grid][id], z: 0 };
  ok(apply(s, { type: "claim", entity: "fighter", user: "u1", userName: "Ann" }, U1));
  const horse = beside(s, "fighter", "warhorse", { name: "Warhorse" });
  s.entities[horse].side = "party";
  if (fight) {
    spawn(s, "goblin-warrior", SPOTS[grid].goblin);
    ok(apply(s, { type: "startEncounter", center: CENTER[grid], radius: 6 }, DM));
    turnOf(s, "fighter");
  }
  ok(apply(s, { type: "mount", actor: "fighter", mount: horse }, U1));
  return { s, horse };
}
const whole = (s, r, m) => s.entities[r].riding?.on === m && s.entities[m].rider === r && json(s.entities[r].pos) === json(s.entities[m].pos);
const noOverlap = (s) => {
  const G = gridOf(s.map), alive = Object.values(s.entities).filter((e) => !e.dead);
  for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
    const a = alive[i], b = alive[j];
    if (a.riding?.on === b.id || b.riding?.on === a.id) continue;
    assert.ok(!overlapAt(a, a.pos, b, b.pos, G), `${a.id} and ${b.id} overlap`);
  }
};

// ---------- W13: growth and remaking for a pair ----------
for (const grid of GRIDS) for (const fighting of [false, true]) {
  const where = fighting ? "in a fight" : "out of a fight";
  test(`${grid}, ${where}: setSize of a rider or its mount is no longer refused as "someone is in the way"; the rider makes no difference`, () => {
    for (const [who, size] of [["fighter", "medium"], ["fighter", "small"], ["horse", "large"], ["horse", "huge"], ["horse", "gargantuan"]]) {
      const { s, horse } = table(grid, { fight: fighting }), id = who === "horse" ? horse : who;
      // The same change with nobody on the horse (the pair parted by hand): it must get the same answer.
      const lone = structuredClone(s);
      delete lone.entities.fighter.riding; delete lone.entities[horse].rider;
      lone.entities.fighter.pos = { q: 40, r: 40, z: 0 };
      const r = apply(s, { type: "setSize", actor: id, size }, DM), l = apply(lone, { type: "setSize", actor: id, size }, DM);
      if (who === "horse") assert.equal(r.ok, l.ok, `${who} ${size}: ${r.error} / ${l.error}`);
      else ok(r);
      if (!r.ok) continue;                     // refused for a third party or a wall, exactly as with nobody on the horse
      assert.equal(s.entities[id].size, size);
      assert.ok(whole(s, "fighter", horse), `${who} ${size}: the ride holds`);
      assert.equal(s.entities.fighter.riding.size, s.entities[horse].size, "the ride's size is the mount's");
      noOverlap(s);
    }
  });

  test(`${grid}, ${where}: a rider grown to its mount's size is set down beside it (why: size), never left overlapping`, () => {
    const { s, horse } = table(grid, { fight: fighting });
    const r = ok(apply(s, { type: "setSize", actor: "fighter", size: "large" }, DM));
    const off = r.events.find((e) => e.type === "dismounted" && e.id === "fighter");
    assert.ok(off, `set down: ${json(r.events.map((e) => e.type))}`);
    assert.equal(off.why, "size");
    assert.ok(!s.entities.fighter.riding && s.entities[horse].rider === undefined);
    noOverlap(s);
  });

  test(`${grid}, ${where}: a ridden mount that would grow into someone else is still refused, and nothing changes`, () => {
    const { s, horse } = table(grid, { fight: fighting });
    // Somebody beside the pair: the horse can't grow to Huge (or Gargantuan) without filling their space.
    let blocked = false;
    for (const size of ["huge", "gargantuan"]) {
      const t = structuredClone(s);
      beside(t, horse, "goblin-warrior");
      const before = json(t), r = apply(t, { type: "setSize", actor: horse, size }, DM);
      if (!r.ok) { assert.match(r.error, /in the way|isn't room/); assert.equal(json(t), before); blocked = true; }
    }
    assert.ok(blocked, "some growth was refused");
  });
}

for (const grid of GRIDS) {
  test(`${grid}: a rider can be remade from its sheet (editCharacter, setSheet) while it rides`, () => {
    const { s, horse } = table(grid);
    const sheet = { name: "Brenna", class: "fighter", level: 1, abilities: { str: 16, dex: 12, con: 14, int: 10, wis: 12, cha: 10 }, skills: ["athletics", "perception"], choices: { "fighting-style": "defense" }, armour: "chain-mail", weapons: ["longsword"] };
    ok(apply(s, { type: "editCharacter", actor: "fighter", record: derive(sheet).record }, DM));
    assert.ok(whole(s, "fighter", horse), "editCharacter: still riding");
    ok(apply(s, { type: "setSheet", actor: "fighter", sheet }, DM));
    assert.ok(whole(s, "fighter", horse), "setSheet: still riding");
    noOverlap(s);
  });

  test(`${grid}: a druid riding a warhorse takes the shape of a Large beast: no longer smaller, it is set down beside the horse`, () => {
    const { s, horse } = table(grid);
    const druid = { name: "Ven", class: "druid", level: 8, subclass: "land", abilities: { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 }, skills: ["nature", "perception"], choices: { "primal-order": "warden" }, armour: "leather-armor", shield: true, weapons: ["quarterstaff"], spells: ["produce-flame", "cure-wounds"] };
    ok(apply(s, { type: "dismount", actor: "fighter" }, U1));
    const at = s.entities.fighter.pos;
    ok(apply(s, { type: "remove", actor: "fighter" }, DM));
    s.entities.ven = makeEntity(derive(druid).record, { id: "ven", kind: "pc", side: "party", pos: { ...at } });
    ok(apply(s, { type: "mount", actor: "ven", mount: horse }, DM));
    const r = ok(apply(s, { type: "feature", actor: "ven", feature: "wild-shape", form: "brown-bear" }, DM));
    assert.equal(s.entities.ven.size, "large");
    assert.equal(r.events.find((e) => e.type === "dismounted")?.why, "size", json(r.events.map((e) => e.type)));
    noOverlap(s);
    // A Medium form (a wolf) on the Large horse rides on.
    const t = table(grid).s;
    ok(apply(t, { type: "dismount", actor: "fighter" }, U1));
    const p = t.entities.fighter.pos, h2 = Object.values(t.entities).find((e) => e.name === "Warhorse").id;
    ok(apply(t, { type: "remove", actor: "fighter" }, DM));
    t.entities.ven = makeEntity(derive(druid).record, { id: "ven", kind: "pc", side: "party", pos: { ...p } });
    ok(apply(t, { type: "mount", actor: "ven", mount: h2 }, DM));
    ok(apply(t, { type: "feature", actor: "ven", feature: "wild-shape", form: "wolf" }, DM));
    assert.ok(whole(t, "ven", h2), "a wolf rides on");
  });
}

// ---------- W16: attacks from the rider's raised eye ----------
// The square room's stub wall (x = 12.5 ft, rows 6 and 7) stands 10 ft high: from horseback (a Large horse is 10 ft
// tall) a rider sees and throws over it where a creature on foot can't.
test("square: a rider's attack looks from its raised eye: a goblin seen only from horseback can be attacked from the saddle, and not on foot", () => {
  const { s, horse } = table("square", { fight: true });
  ok(apply(s, { type: "setting", key: "sight", value: "los" }, DM));
  const r = s.entities.fighter;
  r.pos = { q: 3, r: 6, z: 0 }; s.entities[horse].pos = { q: 3, r: 6, z: 0 };
  let found = null;
  for (const q of [0, 1, 2]) for (const row of [5, 6, 7, 8]) {
    const t = structuredClone(s), res = apply(t, { type: "spawn", monster: "goblin-warrior", at: { q, r: row } }, DM);
    if (!res.ok) continue;
    const g = t.entities[res.events[0].id], foot = structuredClone(t);
    delete foot.entities.fighter.riding; delete foot.entities[horse].rider;
    if (coverOf(t, t.entities.fighter, g) !== "total" && coverOf(foot, foot.entities.fighter, foot.entities[g.id]) === "total") { found = { t, foot, id: g.id }; break; }
  }
  assert.ok(found, "a place behind the low wall, open to the saddle only");
  const { t, foot, id } = found;
  assert.notEqual(canSee(t, t.entities.fighter, t.entities[id]), "no", "seen from the saddle");
  ok(apply(t, { type: "attack", actor: "fighter", target: id, attack: "javelin-thrown" }, U1));
  const before = json(foot);
  no(apply(foot, { type: "attack", actor: "fighter", target: id, attack: "javelin-thrown" }, U1), /wall/);
  assert.equal(json(foot), before, "refused on foot, and nothing changed");
  // The goblin sees the rider too: the raised eye works both ways (cover of the rider from the goblin).
  assert.notEqual(coverOf(t, t.entities[id], t.entities.fighter), "total");
});

test("hex: a rider's attack looks from its raised eye over a low wall", () => {
  const { s, horse } = table("hex", { fight: true });
  ok(apply(s, { type: "setting", key: "sight", value: "los" }, DM));
  const r = s.entities.fighter, G = gridOf(s.map);
  const c = G.center({ q: r.pos.q - 1, r: r.pos.r }), [cx, cz] = c, [wx, wz] = G.center(r.pos);
  const mid = { x: (cx + wx) / 2, z: (cz + wz) / 2 }, dx = wz - cz, dz = cx - wx, n = Math.hypot(dx, dz);
  s.map.walls.push({ id: "low", level: "ground", kind: "wall", a: [mid.x + (dx / n) * 15, mid.z + (dz / n) * 15], b: [mid.x - (dx / n) * 15, mid.z - (dz / n) * 15] });
  let found = null;
  for (const h of G.range(r.pos, 4)) {
    const t = structuredClone(s), res = apply(t, { type: "spawn", monster: "goblin-warrior", at: h }, DM);
    if (!res.ok) continue;
    const id = res.events[0].id, foot = structuredClone(t);
    if (!t.encounter.order.some((o) => o.id === id)) continue;           // inside the fight's arena only
    delete foot.entities.fighter.riding; delete foot.entities[horse].rider;
    if (coverOf(t, t.entities.fighter, t.entities[id]) !== "total" && coverOf(foot, foot.entities.fighter, foot.entities[id]) === "total") { found = { t, foot, id }; break; }
  }
  assert.ok(found, "a hex behind the low wall, open to the saddle only");
  ok(apply(found.t, { type: "attack", actor: "fighter", target: found.id, attack: "javelin-thrown" }, U1));
  no(apply(found.foot, { type: "attack", actor: "fighter", target: found.id, attack: "javelin-thrown" }, U1), /wall/);
});

test("the raised eye lifts only the record in the state: a copy (vision.js passes riders raised already) is not lifted twice", () => {
  const { s, horse } = table("square");
  const r = s.entities.fighter, copy = { ...r, pos: { ...r.pos, z: r.pos.z + 10 } };
  const g = { id: "x", pos: { q: 9, r: 9, z: 0 }, size: "medium" };
  assert.equal(coverOf(s, r, g), coverOf(s, copy, g), "the record and its raised copy look from the same height");
  assert.ok(s.entities[horse]);
});

// ---------- W18: setHp does not revive a rider under its mount ----------
for (const grid of GRIDS) {
  test(`${grid}: the DM's setHp is refused for a dead rider whose mount stands on its body, and allowed once it is moved`, () => {
    const { s, horse } = table(grid);
    ok(apply(s, { type: "harm", actor: "fighter", amount: 999 }, DM));
    assert.ok(s.entities.fighter.dead && !s.entities.fighter.riding);
    const G = gridOf(s.map), f = s.entities.fighter, h = s.entities[horse];
    assert.ok(overlapAt(h, h.pos, f, f.pos, G), "the horse stands on her body");
    const before = json(s);
    no(apply(s, { type: "setHp", actor: "fighter", hp: 10 }, DM), /stands where Brenna's body lies/);
    assert.equal(json(s), before, "nothing changed");
    // The horse led off: she can be brought back where she lies.
    const away = G.range(h.pos, 4).sort((a, b) => G.dist(b, h.pos) - G.dist(a, h.pos) || a.q - b.q || a.r - b.r);
    assert.ok(away.some((to) => apply(s, { type: "place", actor: horse, to }, DM).ok), "the horse is moved off");
    ok(apply(s, { type: "setHp", actor: "fighter", hp: 10 }, DM));
    assert.ok(!s.entities.fighter.dead && s.entities.fighter.hp === 10);
    noOverlap(s);
    // A living creature's setHp is unchanged (the check is only for bringing back the dead).
    ok(apply(s, { type: "setHp", actor: horse, hp: 3 }, DM));
  });
}

// ---------- found by the C7 stress loop: a mount that vanishes leaves its rider down in the same action ----------
for (const grid of GRIDS) {
  test(`${grid}: the fighter on the cleric's Find Steed: the cleric dies, the steed vanishes, and the fighter is down from it in that same action`, () => {
    const { s, horse } = table(grid);
    ok(apply(s, { type: "dismount", actor: "fighter" }, U1));
    ok(apply(s, { type: "remove", actor: horse }, DM));
    if (grid === "square") ok(apply(s, { type: "place", actor: "fighter", to: { q: 7, r: 7 } }, DM));
    const c = s.entities.cleric;
    c.spells.push("find-steed"); c.slots[2] = 1;
    const G = gridOf(s.map), f = s.entities.fighter;
    let steed = null;
    for (const h of G.range(f.pos, 3)) {
      const t = structuredClone(s), r = apply(t, { type: "cast", actor: "cleric", spell: "find-steed", slot: 2, summon: { type: "celestial", at: [h] } }, DM);
      if (!r.ok) continue;
      const id = r.events.find((e) => e.type === "summoned").id;
      if (apart(t, t.entities.fighter, t.entities[id]) > 1) continue;
      steed = ok(apply(s, { type: "cast", actor: "cleric", spell: "find-steed", slot: 2, summon: { type: "celestial", at: [h] } }, DM)).events.find((e) => e.type === "summoned").id;
      break;
    }
    assert.ok(steed, "a steed beside the fighter");
    ok(apply(s, { type: "mount", actor: "fighter", mount: steed }, DM));
    const r = ok(apply(s, { type: "harm", actor: "cleric", amount: 999 }, DM));
    const types = r.events.map((e) => e.type);
    assert.ok(types.includes("vanished"), json(types));
    assert.equal(r.events.find((e) => e.type === "dismounted" && e.id === "fighter")?.why, "gone", json(types));
    assert.equal(s.entities.fighter.riding, undefined, "no half a pair after the action");
  });
}
