// Riding, stage C6b (docs/specs/companions.md, Decision 8 and the C6b build notes; SRD 5.2.1 "Mounted Combat",
// 2099-2133, "Opportunity Attacks", 2082-2098, "Teleportation", 34451-34461, Find Steed, 26824-26853): falling off (the
// DC 10 Dexterity save when the rider or the mount is knocked Prone, or the mount is about to be pushed or pulled),
// the pair pushed together, a teleport ending a ride, a mount gone from under its rider (in the air: the rider falls),
// Opportunity Attacks for the pair (the attacker choosing the rider or the mount), Find Steed as a controlled mount,
// the rider's raised eye, and a stepped-away rider's mount taking its own turns (DEBT W14). On hexes and on the square
// room, with twin runs for hidden creatures.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { migrate } from "../src/migrate.js";
import { apart, footprint, overlapAt } from "../src/space.js";
import { gridOf } from "../src/grid.js";
import { derive } from "../src/derive.js";
import { unknown, raised } from "../src/vision.js";
import { OPPORTUNITY } from "../src/reactions.js";
import { OPPORTUNITY_RIDER } from "../src/engine/movement.js";
import { RIDE_DC } from "../src/engine/resolve.js";
import { squareRoom } from "./fixtures/square-room.js";

const DM = { role: "dm", userId: "dm" };
const U1 = { role: "player", userId: "u1" };
const U2 = { role: "player", userId: "u2" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
const GRIDS = ["hex", "square"];
const SPOTS = {
  hex: { fighter: { q: -6, r: 2 }, rogue: { q: -7, r: 3 }, cleric: { q: -7, r: 2 }, wizard: { q: -8, r: 3 }, goblin: { q: 2, r: 2 } },
  square: { fighter: { q: 3, r: 3 }, rogue: { q: 1, r: 12 }, cleric: { q: 2, r: 12 }, wizard: { q: 3, r: 12 }, goblin: { q: 11, r: 11 } },
};
const CENTER = { hex: { q: -2, r: 2 }, square: { q: 7, r: 7 } };
const spawn = (s, monster, at, more = {}) => ok(apply(s, { type: "spawn", monster, at, ...more }, DM)).events.find((e) => e.type === "spawned").id;
// A creature spawned as near `id` as it fits, within 5 ft of it (nearest cells first, a fixed order).
function beside(s, id, monster, more = {}) {
  const G = gridOf(s.map), e = s.entities[id];
  for (const h of G.range(e.pos, 3).sort((a, b) => G.dist(a, e.pos) - G.dist(b, e.pos) || a.q - b.q || a.r - b.r)) {
    const t = structuredClone(s), r = apply(t, { type: "spawn", monster, at: h, ...more }, DM);
    if (!r.ok) continue;
    if (apart(t, e, t.entities[r.events.find((x) => x.type === "spawned").id]) > 1) continue;
    return spawn(s, monster, h, more);
  }
  throw new Error(`no room beside ${id}`);
}
// A free cell within 5 ft of a creature (for setting another there by hand), the nth found.
function besidePos(s, id, n = 0) {
  const G = gridOf(s.map), m = s.entities[id], out = [];
  for (const h of G.range(m.pos, 3)) {
    const t = structuredClone(s), r = apply(t, { type: "spawn", monster: "goblin-warrior", at: h }, DM);
    if (r.ok && apart(t, m, t.entities[r.events[0].id]) <= 1) out.push(t.entities[r.events[0].id].pos);
  }
  if (!out[n]) throw new Error("no room");
  return out[n];
}
const turnOf = (s, id) => { for (let i = 0; i < 60 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
// The valley's party (hexes) or the square room, the fighter (Brenna, Ann, u1) and the rogue (u2) claimed, a party
// warhorse beside the fighter, and Brenna on it. `fight`: a fight with a goblin far off, on Brenna's turn.
function table(grid, { fight = false, seed = 5 } = {}) {
  const s = newGame(seed);
  if (grid === "square") ok(apply(s, { type: "loadMap", map: squareRoom() }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  for (const id of ["m1", "m2", "m3", "m4", "m5", "m6"]) if (s.entities[id]) ok(apply(s, { type: "remove", actor: id }, DM));
  const P = SPOTS[grid];
  for (const id of ["fighter", "rogue", "cleric", "wizard"]) s.entities[id].pos = { ...P[id], z: 0 };
  ok(apply(s, { type: "claim", entity: "fighter", user: "u1", userName: "Ann" }, U1));
  ok(apply(s, { type: "claim", entity: "rogue", user: "u2", userName: "Bo" }, U2));
  const horse = beside(s, "fighter", "warhorse", { name: "Warhorse" });
  s.entities[horse].side = "party";
  let goblin = null;
  if (fight) {
    goblin = spawn(s, "goblin-warrior", P.goblin);
    ok(apply(s, { type: "startEncounter", center: CENTER[grid], radius: 6 }, DM));
    turnOf(s, "fighter");
  }
  ok(apply(s, { type: "mount", actor: "fighter", mount: horse }, U1));
  return { s, horse, goblin, P };
}
const off = (r, id = "fighter") => r.events.find((e) => e.type === "dismounted" && e.id === id);
const saves = (r, id = "fighter") => r.events.filter((e) => e.type === "save" && e.id === id && e.against === "Falling Off");
// Nobody overlaps anybody but its own rider or mount.
function noOverlap(s) {
  const G = gridOf(s.map), alive = Object.values(s.entities).filter((e) => !e.dead && !e.vanished);
  for (const a of alive) for (const b of alive) if (a.id < b.id && overlapAt(a, a.pos, b, b.pos, G)) return `${a.id} and ${b.id} overlap`;
  for (const e of alive) if (e.riding && (s.entities[e.riding.on]?.rider !== e.id || json(s.entities[e.riding.on].pos) !== json(e.pos))) return `${e.id}'s ride is not whole`;
  return null;
}
const dex = (s, id, n) => { s.entities[id].saveBonus = { ...(s.entities[id].saveBonus ?? {}), dex: n }; };

// ---------- falling off ----------

for (const grid of GRIDS) {
  for (const who of ["rider", "mount"]) test(`${grid}: the ${who} knocked Prone: the rider's DC 10 Dexterity save; on a failure it falls off, Prone, within 5 ft (SRD 2126-2133)`, () => {
    assert.equal(RIDE_DC, 10);
    const a = table(grid, { fight: true });
    const target = who === "rider" ? "fighter" : a.horse;
    dex(a.s, "fighter", -40);
    const r = ok(apply(a.s, { type: "condition", actor: target, condition: "prone" }, DM));
    assert.equal(saves(r).length, 1);
    assert.equal(saves(r)[0].dc, 10);
    assert.equal(saves(r)[0].success, false);
    const d = off(r);
    assert.ok(d && d.fell === true && d.why === "prone", "fell off");
    assert.equal(a.s.entities.fighter.riding, undefined);
    assert.equal(a.s.entities[a.horse].rider, undefined);
    assert.ok(a.s.entities.fighter.cond.prone, "landing Prone");
    assert.ok(apart(a.s, a.s.entities.fighter, a.s.entities[a.horse]) <= 1, "within 5 ft of the mount");
    assert.deepEqual(d.at, { ...a.s.entities.fighter.pos });
    assert.equal(noOverlap(a.s), null);
    assert.equal(a.s.encounter.budget.mount, undefined, "the mount's budget goes with the ride");
    // A success: it stays on, and the save is made once for that Prone.
    const b = table(grid, { fight: true });
    dex(b.s, "fighter", 40);
    const t = who === "rider" ? "fighter" : b.horse;
    const r2 = ok(apply(b.s, { type: "condition", actor: t, condition: "prone" }, DM));
    assert.equal(saves(r2).length, 1); assert.equal(saves(r2)[0].success, true);
    assert.ok(b.s.entities.fighter.riding, "stays on");
    const r3 = ok(apply(b.s, { type: "endTurn", actor: "fighter" }, U1));
    assert.equal(saves(r3).length, 0, "the next action makes no second save");
    const r4 = ok(apply(b.s, { type: "condition", actor: "rogue", condition: "prone" }, DM));
    assert.equal(saves(r4).length, 0, "no second save for the same Prone");
  });

  test(`${grid}: a rider dropped to 0 Hit Points is Unconscious and Prone: it fails the save and falls off`, () => {
    const { s, horse } = table(grid, { fight: true });
    const r = ok(apply(s, { type: "harm", actor: "fighter", amount: s.entities.fighter.hp }, DM));
    assert.equal(saves(r)[0].success, false);
    assert.ok(off(r)?.fell);
    assert.equal(s.entities.fighter.riding, undefined);
    assert.ok(apart(s, s.entities.fighter, s.entities[horse]) <= 1);
    assert.equal(noOverlap(s), null);
  });

  test(`${grid}: a mount that dies under its rider leaves it where it stands; one removed in the air drops it (it falls)`, () => {
    const { s, horse } = table(grid, { fight: true });
    const at = { ...s.entities.fighter.pos };
    const r = ok(apply(s, { type: "harm", actor: horse, amount: 500 }, DM));
    assert.equal(off(r)?.why, "gone");
    assert.deepEqual(s.entities.fighter.pos, at);
    assert.equal(s.entities.fighter.riding, undefined);
    // A flying mount 30 ft up: the rider is held up by it; the mount gone, it falls (1d6 per 10 ft).
    const t = table(grid);
    const eagle = beside(t.s, "rogue", "giant-eagle");
    ok(apply(t.s, { type: "dismount", actor: "fighter" }, DM));
    for (const id of [eagle, "rogue"]) t.s.entities[id].pos = { ...t.s.entities[eagle].pos, z: 30 };
    t.s.entities[eagle].side = "party";
    t.s.entities.rogue.riding = { on: eagle, controlled: false, size: "large" }; t.s.entities[eagle].rider = "rogue";
    ok(apply(t.s, { type: "condition", actor: "cleric", condition: "prone" }, DM));       // any action: the gravity pass runs
    assert.equal(t.s.entities.rogue.pos.z, 30, "held up by its flying mount");
    const hp = t.s.entities.rogue.hp;
    const r2 = ok(apply(t.s, { type: "remove", actor: eagle }, DM));
    assert.equal(off(r2, "rogue")?.why, "gone");
    assert.ok(r2.events.some((e) => e.type === "fell" && e.id === "rogue" && e.feet === 30), "it falls 30 ft");
    assert.equal(t.s.entities.rogue.pos.z, 0);
    assert.ok(t.s.entities.rogue.hp < hp, "and takes falling damage");
  });
}

// ---------- pushed together ----------

// Thunderwave from the wizard, aimed so that the horse is in it and pushed: the aim found by trying each.
function wave(s, horse) {
  const G = gridOf(s.map);
  for (const aim of G.range(s.entities.wizard.pos, 1)) {
    const t = structuredClone(s), r = apply(t, { type: "cast", actor: "wizard", spell: "thunderwave", hex: aim }, DM);
    if (r.ok && r.events.some((e) => e.type === "moved" && e.id === horse && e.forced)) return aim;
  }
  return null;
}
function waveTable(grid) {
  const t = table(grid, { fight: true });
  const { s, horse } = t;
  ok(apply(s, { type: "endTurn", actor: "fighter" }, U1));
  s.entities.wizard.pos = besidePos(s, horse);
  s.entities.wizard.spells.push("thunderwave");
  s.entities[horse].saveBonus = { con: -40 };
  s.entities.fighter.saveBonus = { con: 40 };
  turnOf(s, "wizard");
  t.aim = wave(s, horse);
  assert.ok(t.aim, "an aim that pushes the horse");
  return t;
}
for (const grid of GRIDS) {
  test(`${grid}: Thunderwave pushing the horse: the rider saves DC 10 first; on a success the pair moves together, on a failure it falls off Prone where the horse stood`, () => {
    const a = waveTable(grid);
    dex(a.s, "fighter", 40);
    const r = ok(apply(a.s, { type: "cast", actor: "wizard", spell: "thunderwave", hex: a.aim }, DM));
    assert.equal(saves(r).length, 1); assert.equal(saves(r)[0].success, true);
    const mh = r.events.find((e) => e.type === "moved" && e.id === a.horse), mf = r.events.find((e) => e.type === "moved" && e.id === "fighter");
    assert.ok(mh && mf && mf.forced, "both moved");
    assert.deepEqual(mf.path, mh.path);
    assert.ok(a.s.entities.fighter.riding);
    assert.deepEqual(a.s.entities.fighter.pos, a.s.entities[a.horse].pos);
    assert.equal(noOverlap(a.s), null);
    // The save comes before the push: a failure leaves the rider Prone within 5 ft of where the horse stood.
    const b = waveTable(grid);
    dex(b.s, "fighter", -40);
    const was = structuredClone(b.s.entities[b.horse]);
    const r2 = ok(apply(b.s, { type: "cast", actor: "wizard", spell: "thunderwave", hex: b.aim }, DM));
    const d = off(r2), types = r2.events.map((e) => e.type);
    assert.ok(d && d.fell && d.why === "pushed");
    // Fix round 1 of #363, M2: the push is worked out with the rider out of the way, and the rider lands after it.
    assert.equal(r2.events.find((e) => e.type === "moved" && e.id === b.horse).path.length, mh.path.length, "the fall does not shorten the push");
    assert.ok(types.indexOf("save") < types.indexOf("dismounted"));
    assert.ok(apart(b.s, b.s.entities.fighter, was) <= 1, "within 5 ft of the mount, as it stood");
    assert.ok(b.s.entities.fighter.cond.prone);
    assert.ok(!r2.events.some((e) => e.type === "moved" && e.id === "fighter"));
    assert.equal(noOverlap(b.s), null);
  });

  test(`${grid}: fix round 1 of #363, M2: a failed save never cuts the push short: every wizard cell and aim, the horse moves as far as with the rider on`, () => {
    const t = table(grid, { fight: true });
    ok(apply(t.s, { type: "endTurn", actor: "fighter" }, U1));
    t.s.entities.wizard.spells.push("thunderwave");
    t.s.entities[t.horse].saveBonus = { con: -40 };
    t.s.entities.fighter.saveBonus = { con: 40 };
    if (grid === "hex") {                       // the reviewer's recipe: the pair at (-6,3), the wizard at (-4,2), aimed at (-5,3)
      for (const id of ["fighter", t.horse]) t.s.entities[id].pos = { q: -6, r: 3, z: 0 };
    }
    turnOf(t.s, "wizard");
    const G = gridOf(t.s.map);
    let pushes = 0;
    const cells = grid === "hex" ? [{ q: -4, r: 2, z: 0 }, ...[0, 1, 2, 3].map((n) => { try { return besidePos(t.s, t.horse, n); } catch { return null; } })] : [0, 1, 2, 3, 4, 5].map((n) => { try { return besidePos(t.s, t.horse, n); } catch { return null; } });
    for (const at of cells.filter(Boolean)) {
      const base = structuredClone(t.s);
      base.entities.wizard.pos = { ...at, z: 0 };
      for (const aim of G.range(at, 1)) {
        const run = (d) => { const u = structuredClone(base); dex(u, "fighter", d); const r = apply(u, { type: "cast", actor: "wizard", spell: "thunderwave", hex: aim }, DM); return { u, r }; };
        const on = run(40), off_ = run(-40);
        if (!on.r.ok) continue;
        const p1 = on.r.events.find((e) => e.type === "moved" && e.id === t.horse)?.path ?? [];
        if (!p1.length) continue;
        pushes++;
        const p2 = off_.r.events.find((e) => e.type === "moved" && e.id === t.horse)?.path ?? [];
        assert.deepEqual(p2, p1, `wizard ${json(at)} aim ${json(aim)}: the same push`);
        const d = off(off_.r);
        assert.ok(d?.fell, "fell off");
        assert.equal(noOverlap(off_.u), null);
      }
    }
    assert.ok(pushes >= 2, "pushes were tried");
  });

  test(`${grid}: a push of the rider itself the SRD has no rule for: it stays riding and the DM is told`, () => {
    const a = waveTable(grid);
    a.s.entities[a.horse].saveBonus = { con: 40 }; a.s.entities.fighter.saveBonus = { con: -40, dex: 40 };
    const r = ok(apply(a.s, { type: "cast", actor: "wizard", spell: "thunderwave", hex: a.aim }, DM));
    assert.ok(r.events.some((e) => e.type === "manual" && e.name === "Mounted combat" && /pushed 10 ft while riding/.test(e.text) && e.partial));
    assert.ok(!r.events.some((e) => e.type === "moved" && (e.id === "fighter" || e.id === a.horse)));
    assert.ok(a.s.entities.fighter.riding);
  });
}

// ---------- teleports ----------

for (const grid of GRIDS) {
  test(`${grid}: a teleport takes only the one who teleports (SRD 34458-34461): a rider's Misty Step gets it down; a mount's leaves its rider`, () => {
    const { s, horse } = table(grid);
    ok(apply(s, { type: "dismount", actor: "fighter" }, DM));
    s.entities.wizard.spells.push("misty-step"); s.entities.wizard.slots[2] = 1;
    s.entities.wizard.pos = besidePos(s, horse);
    ok(apply(s, { type: "mount", actor: "wizard", mount: horse }, DM));
    const G = gridOf(s.map), to = G.range(s.entities.wizard.pos, 5).find((h) => G.dist(h, s.entities.wizard.pos) === 5 && apply(structuredClone(s), { type: "cast", actor: "wizard", spell: "misty-step", hex: h }, DM).ok);
    const at = { ...s.entities[horse].pos };
    const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "misty-step", hex: to }, DM));
    const d = off(r, "wizard");
    assert.equal(d?.why, "teleport");
    assert.deepEqual(d.at, { ...s.entities.wizard.pos });
    assert.equal(s.entities.wizard.pos.q, to.q); assert.equal(s.entities.wizard.pos.r, to.r);
    assert.deepEqual(s.entities[horse].pos, at, "the horse stays");
    assert.equal(s.entities.wizard.riding, undefined); assert.equal(s.entities[horse].rider, undefined);
    assert.equal(noOverlap(s), null);
    // A Small goblin rides the wizard (the DM's pair), and the wizard teleports: the goblin is left where it was.
    const t = table(grid);
    t.s.entities.wizard.spells.push("misty-step"); t.s.entities.wizard.slots[2] = 1;
    const gob = beside(t.s, "wizard", "goblin-warrior");
    t.s.entities[gob].side = "party";
    ok(apply(t.s, { type: "mount", actor: gob, mount: "wizard" }, DM));
    const spot = { ...t.s.entities.wizard.pos };
    const G2 = gridOf(t.s.map), to2 = G2.range(spot, 5).find((h) => G2.dist(h, spot) === 5 && apply(structuredClone(t.s), { type: "cast", actor: "wizard", spell: "misty-step", hex: h }, DM).ok);
    const r2 = ok(apply(t.s, { type: "cast", actor: "wizard", spell: "misty-step", hex: to2 }, DM));
    assert.equal(off(r2, gob)?.why, "teleport");
    assert.deepEqual(t.s.entities[gob].pos, spot);
    assert.equal(noOverlap(t.s), null);
  });
}

// ---------- Opportunity Attacks for the pair ----------

// A goblin of the DM's on a warhorse of the DM's (controlled: both foes, trained), beside Brenna (u1) whose
// Opportunity Attack instruction is `ask`. On the goblin's turn the horse walks out of her reach.
function oaTable(grid, { hideRider = false, noRider = false } = {}) {
  const s = newGame(5);
  if (grid === "square") ok(apply(s, { type: "loadMap", map: squareRoom() }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  for (const id of ["m1", "m2", "m3", "m4", "m5", "m6"]) if (s.entities[id]) ok(apply(s, { type: "remove", actor: id }, DM));
  const P = SPOTS[grid];
  for (const id of ["fighter", "rogue", "cleric", "wizard"]) s.entities[id].pos = { ...P[id], z: 0 };
  ok(apply(s, { type: "claim", entity: "fighter", user: "u1", userName: "Ann" }, U1));
  ok(apply(s, { type: "reactions", actor: "fighter", set: { [OPPORTUNITY]: "ask" } }, U1));
  const horse = beside(s, "fighter", "warhorse", { name: "Warhorse" });
  const gob = noRider ? null : beside(s, horse, "goblin-warrior", { name: "Rider" });
  if (gob) ok(apply(s, { type: "mount", actor: gob, mount: horse }, DM));
  ok(apply(s, { type: "startEncounter", center: CENTER[grid], radius: 6 }, DM));
  if (gob && hideRider) s.entities[gob].hidden = true;          // the DM hid one half (DEBT W12): the party knows of the horse alone
  turnOf(s, gob ?? horse);
  const G = gridOf(s.map), m = s.entities[horse], f = s.entities.fighter;
  const to = G.range(m.pos, 3).filter((h) => G.dist(h, m.pos) === 3).sort((a, b) => G.dist(b, f.pos) - G.dist(a, f.pos) || a.q - b.q || a.r - b.r)
    .find((h) => { const t = structuredClone(s); t.entities.fighter.reactions = { [OPPORTUNITY]: "never" }; const r = apply(t, { type: "move", actor: horse, to: h }, DM); return r.ok && apart(t, t.entities.fighter, t.entities[horse]) > 1; });
  assert.ok(to, "a cell out of Brenna's reach");
  return { s, horse, gob, to };
}
for (const grid of GRIDS) {
  test(`${grid}: the mount provokes: its attacker chooses the mount or its rider (one Reaction); the rider itself does not provoke`, () => {
    const a = oaTable(grid);
    const r = ok(apply(a.s, { type: "move", actor: a.horse, to: a.to }, DM));
    const asked = r.events.find((e) => e.type === "reactionAsked");
    assert.ok(asked, "Ann is asked");
    assert.deepEqual(asked.ask.options.map((o) => o.reaction), [OPPORTUNITY, OPPORTUNITY_RIDER]);
    assert.equal(asked.ask.options[1].against, a.gob);
    assert.equal(asked.ask.by, a.horse, "set off by the mount");
    const v = view(a.s, U1).prompt;
    assert.deepEqual(v.options.map((o) => o.reaction), [OPPORTUNITY, OPPORTUNITY_RIDER]);
    assert.equal(v.options[1].against, a.gob);
    // Against the rider.
    const b = structuredClone(a.s);
    const r2 = ok(apply(b, { type: "react", prompt: asked.n, take: OPPORTUNITY_RIDER }, U1));
    assert.ok(r2.events.some((e) => e.type === "reaction" && e.id === "fighter" && e.against === a.gob));
    assert.ok(r2.events.some((e) => e.type === "attack" && e.actor === "fighter" && e.target === a.gob));
    assert.equal(r2.events.filter((e) => e.type === "attack" && e.actor === "fighter").length, 1, "one Reaction");
    // Against the mount.
    const c = structuredClone(a.s);
    const r3 = ok(apply(c, { type: "react", prompt: asked.n, take: OPPORTUNITY }, U1));
    assert.ok(r3.events.some((e) => e.type === "attack" && e.actor === "fighter" && e.target === a.horse));
    assert.ok(!r3.events.some((e) => e.type === "manual" && /carried out of/.test(e.text)), "no hand-off any more");
    // `always`: the creature that provoked, the mount.
    const d = oaTable(grid);
    ok(apply(d.s, { type: "reactions", actor: "fighter", set: { [OPPORTUNITY]: "always" } }, U1));
    const r4 = ok(apply(d.s, { type: "move", actor: d.horse, to: d.to }, DM));
    assert.ok(r4.events.some((e) => e.type === "attack" && e.actor === "fighter" && e.target === d.horse));
    // The mount Disengaged: no Opportunity Attack at all (review of #350, L3).
    const e = oaTable(grid);
    ok(apply(e.s, { type: "disengage", actor: e.horse }, DM));
    const r5 = ok(apply(e.s, { type: "move", actor: e.horse, to: e.to }, DM));
    assert.ok(!r5.events.some((x) => x.type === "reactionAsked" || x.type === "attack" || (x.type === "manual" && x.name === "Opportunity Attack")));
  });

  test(`${grid}: twin run: an Opportunity Attack prompt never names a rider the party does not know of`, () => {
    const A = oaTable(grid, { hideRider: true }), B = oaTable(grid, { noRider: true });
    assert.deepEqual(A.to, B.to);
    const ra = ok(apply(A.s, { type: "move", actor: A.horse, to: A.to }, DM)), rb = ok(apply(B.s, { type: "move", actor: B.horse, to: B.to }, DM));
    assert.deepEqual(viewEvents(ra.events, A.s, U1).find((e) => e.type === "reactionAsked").ask, viewEvents(rb.events, B.s, U1).find((e) => e.type === "reactionAsked").ask);
    assert.equal(json(view(A.s, U1).prompt), json(view(B.s, U1).prompt));
  });
}

// ---------- hidden creatures where a rider lands ----------

for (const grid of GRIDS) {
  test(`${grid}: twin runs: falling off chooses where to land by what the party knows; a hidden creature there is found as a move onto it finds it`, () => {
    // World B: no one hidden. Where does Brenna land?
    const B = table(grid);
    dex(B.s, "fighter", -40);
    const vb = json(view(B.s, U1)), seqB = B.s.seq;
    const rb = ok(apply(B.s, { type: "condition", actor: B.horse, condition: "prone" }, DM));
    const land = off(rb).at;
    // World A: a hidden goblin on that cell (or anywhere else beside the horse). Players see the same until the
    // goblin is found; finding it is `revealed` and `unhidden { why: 'found' }`, as a move onto it.
    const A = table(grid);
    dex(A.s, "fighter", -40);
    const gob = spawn(A.s, "goblin-warrior", { q: land.q, r: land.r }, { hidden: true });
    A.s.seq = seqB;
    assert.equal(json(view(A.s, U1)), vb, "the same view before");
    const ra = ok(apply(A.s, { type: "condition", actor: A.horse, condition: "prone" }, DM));
    const ea = viewEvents(ra.events, A.s, U1), eb = viewEvents(rb.events, B.s, U1);
    const k = ea.findIndex((e, i) => json(e) !== json(eb[i]));
    assert.ok(k >= 0, "the worlds part");
    assert.equal(ea[k].type, "revealed"); assert.equal(ea[k].id, gob);
    // The reveal is the one a plain move onto a hidden creature's space gives (the rogue, beside a hidden goblin).
    const E = table(grid), at = besidePos(E.s, "rogue");
    const g3 = spawn(E.s, "goblin-warrior", at, { hidden: true });
    const re = ok(apply(E.s, { type: "move", actor: "rogue", to: at }, U2));
    const finds = (r, id) => r.events.filter((e) => ["revealed", "unhidden"].includes(e.type) && e.id === id).map((e) => [e.type, e.why ?? null]);
    assert.ok(finds(re, g3).length > 0, "the move finds it");
    assert.deepEqual(finds(ra, gob), finds(re, g3));
    assert.ok(off(ra) && json(off(ra).at) !== json(land), "lands on the next free cell, with the goblin known");
    assert.equal(noOverlap(A.s), null);
    // A hidden creature elsewhere changes nothing a player is sent.
    const C = table(grid);
    dex(C.s, "fighter", -40);
    const far = grid === "square" ? { q: 12, r: 2 } : { q: 6, r: -6 };
    spawn(C.s, "goblin-warrior", far, { hidden: true });
    const D = table(grid);
    dex(D.s, "fighter", -40);
    D.s.seq = C.s.seq;
    const rc = ok(apply(C.s, { type: "condition", actor: C.horse, condition: "prone" }, DM)), rd = ok(apply(D.s, { type: "condition", actor: D.horse, condition: "prone" }, DM));
    assert.equal(json(viewEvents(rc.events, C.s, U1)), json(viewEvents(rd.events, D.s, U1)));
    assert.equal(json(view(C.s, U1)), json(view(D.s, U1)));
  });

  test(`${grid}: twin run: a hidden pair falling off sends players exactly what no pair sends`, () => {
    const A = table(grid), B = table(grid);
    const far = grid === "square" ? [{ q: 12, r: 2 }, { q: 12, r: 4 }] : [{ q: 6, r: -6 }, { q: 6, r: -4 }];
    const gob = spawn(A.s, "goblin-warrior", far[0], { hidden: true }), wolf = spawn(A.s, "dire-wolf", far[1], { hidden: true });
    A.s.entities[gob].pos = { q: far[1].q, r: far[1].r - 1, z: 0 };
    ok(apply(A.s, { type: "mount", actor: gob, mount: wolf }, DM));
    dex(A.s, gob, -40);
    B.s.seq = A.s.seq;
    const script = [[{ type: "condition", actor: wolf, condition: "prone" }, DM], [{ type: "move", actor: "fighter", to: B.s.entities.fighter.pos }, U1]];
    const seen = (t) => script.map(([a, ctx]) => json(viewEvents(apply(t.s, a, ctx).events, t.s, U1)));
    assert.deepEqual(seen(A), seen(B));
    assert.equal(json(view(A.s, U1)), json(view(B.s, U1)));
    assert.equal(A.s.entities[gob].riding, undefined, "world A did fall off");
  });
}

// ---------- Find Steed ----------

const ABIL = { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 16 };
function paladin(grid) {
  const s = newGame(5);
  if (grid === "square") ok(apply(s, { type: "loadMap", map: squareRoom() }, DM));
  s.settings.autoEngage = false;
  for (const id of ["m1", "m2", "m3", "m4", "m5", "m6"]) if (s.entities[id]) ok(apply(s, { type: "remove", actor: id }, DM));
  const P = SPOTS[grid];
  for (const id of ["fighter", "rogue", "cleric", "wizard"]) s.entities[id].pos = { ...P[id], z: 0 };
  const d = derive({ name: "Ven", class: "paladin", level: 7, abilities: ABIL, skills: [], armour: "chain-mail", weapons: ["longsword"], spells: ["find-steed"] });
  s.entities.ven = makeEntity(d.record, { id: "ven", kind: "pc", side: "party", pos: { ...besidePos(s, "fighter", 2), z: 0 } });
  ok(apply(s, { type: "claim", entity: "ven", user: "pat", userName: "Pat" }, { role: "player", userId: "pat" }));
  const G = gridOf(s.map);
  const at = G.range(s.entities.ven.pos, 3).find((h) => G.dist(h, s.entities.ven.pos) >= 2 && apply(structuredClone(s), { type: "cast", actor: "ven", spell: "find-steed", slot: 2, summon: { type: "celestial", at: [h] } }, { role: "player", userId: "pat" }).ok);
  const r = ok(apply(s, { type: "cast", actor: "ven", spell: "find-steed", slot: 2, summon: { type: "celestial", at: [at] } }, { role: "player", userId: "pat" }));
  const steed = r.events.find((e) => e.type === "summoned").id;
  return { s, steed };
}
const PAT = { role: "player", userId: "pat" };
for (const grid of GRIDS) {
  test(`${grid}: Find Steed: "it functions as a controlled mount while you ride it"; Incapacitated, its rider's steed takes its turn straight after its rider's`, () => {
    const { s, steed } = paladin(grid);
    assert.equal(s.entities[steed].bond.mount, "controlled");
    // Walk the paladin beside it (outside a fight), and mount as a player.
    const G = gridOf(s.map), m = s.entities[steed];
    s.entities.ven.pos = { ...besidePos(s, steed), z: 0 };
    void G; void m;
    const r = ok(apply(s, { type: "mount", actor: "ven", mount: steed }, PAT));
    assert.ok(r.events.some((e) => e.type === "mounted" && e.controlled === true));
    const gob = spawn(s, "goblin-warrior", SPOTS[grid].goblin);
    void gob;
    ok(apply(s, { type: "startEncounter", center: CENTER[grid], radius: 9 }, DM));
    assert.equal(s.encounter.order.filter((o) => o.id === "ven" || o.id === steed).length, 2);
    turnOf(s, "ven");
    assert.deepEqual(s.encounter.budget.mount, { move: 60, action: 1, dashes: 0 });
    ok(apply(s, { type: "endTurn", actor: "ven" }, PAT));
    // Next round, Stunned before its turn: the steed's turn comes straight after the paladin's.
    ok(apply(s, { type: "condition", actor: "ven", condition: "stunned" }, DM));
    const turns = [];
    for (let i = 0; i < 30 && turns.filter((x) => x === "ven").length < 1; i++) for (const e of ok(apply(s, { type: "endTurn", actor: current(s) }, DM)).events) if (e.type === "turn") turns.push(e.id);
    ok(apply(s, { type: "endTurn", actor: "ven" }, DM));
    assert.equal(current(s), steed, "the steed's turn is straight after its rider's");
    assert.ok(s.entities.ven.riding, "a Stunned rider is not Prone, so it stays on");
  });
}

// ---------- the rider's raised eye ----------

test("the rider's eye is raised by its mount's height (Decision 8): from a warhorse, a goblin behind the room's low wall is in sight", () => {
  const { s } = table("square");
  ok(apply(s, { type: "setting", key: "sight", value: "los" }, DM));
  const r = s.entities.fighter, horse = r.riding.on;
  // The others go behind the shut door, out of the room; the pair stands beside the stub wall (x = 12.5 ft, rows 6-7).
  [["rogue", 20], ["cleric", 21], ["wizard", 22]].forEach(([id, q]) => { s.entities[id].pos = { q, r: 10, z: 0 }; });
  r.pos = { q: 3, r: 6, z: 0 }; s.entities[horse].pos = { q: 3, r: 6, z: 0 };
  assert.equal(raised(r).pos.z, r.pos.z + 10, "a Large mount is 10 ft tall");
  assert.equal(raised(s.entities.rogue), s.entities.rogue, "a creature on foot is as it stands");
  // Somewhere a goblin is out of sight of everyone on foot, but in sight of Brenna on her horse.
  const G = gridOf(s.map);
  let found = null;
  for (const h of G.range(r.pos, 6)) {
    const t = structuredClone(s), res = apply(t, { type: "spawn", monster: "goblin-warrior", at: h }, DM);
    if (!res.ok) continue;
    const id = res.events[0].id;
    const seenMounted = !unknown(t, t.entities[id]);
    const u = structuredClone(t);
    delete u.entities.fighter.riding; delete u.entities[horse].rider;
    if (seenMounted && unknown(u, u.entities[id])) { found = h; break; }
  }
  assert.ok(found, "a cell seen only from horseback");
});

// ---------- a stepped-away rider (DEBT W14) ----------

for (const grid of GRIDS) {
  test(`${grid}: W14: a rider set aside (stepped away) leaves its mount its own turns`, () => {
    const { s, horse } = table(grid, { fight: true });
    ok(apply(s, { type: "endTurn", actor: "fighter" }, U1));
    ok(apply(s, { type: "stepAway", actor: "fighter", how: "dodge" }, DM));
    const r0 = s.encounter.round, turns = [];
    for (let i = 0; i < 60 && s.encounter.round < r0 + 3; i++) for (const e of ok(apply(s, { type: "endTurn", actor: current(s) }, DM)).events) if (e.type === "turn") turns.push([e.round, e.id]);
    for (const round of [r0 + 1, r0 + 2]) assert.equal(turns.filter(([x, id]) => x === round && id === horse).length, 1, `the horse's own turn in round ${round}`);
  });
}

// ---------- undo, redo, replay, save and load, mid-fall and mid-prompt; an old save ----------

for (const grid of GRIDS) {
  test(`${grid}: undo, redo, replay and save and load through a fall and an Opportunity Attack prompt`, () => {
    const a = oaTable(grid);
    const s = a.s, start = structuredClone(s), h = createHistory(), log = [];
    const step = (act, ctx = DM) => { const before = mark(s), r = ok(apply(s, act, ctx)); h.record(before, s, describeStep(act, r.events, before, s)); log.push([act, ctx]); return r; };
    dex(s, a.gob, -40); dex(start, a.gob, -40);
    const asked = step({ type: "move", actor: a.horse, to: a.to }).events.find((e) => e.type === "reactionAsked");
    assert.ok(s.pending);
    const mid = json(s);
    // Save and load mid-prompt, then answer it in both.
    const loaded = migrate(JSON.parse(mid));
    assert.equal(json(loaded), mid);
    ok(apply(loaded, { type: "react", prompt: asked.n, take: OPPORTUNITY_RIDER }, U1));
    step({ type: "react", prompt: asked.n, take: OPPORTUNITY_RIDER }, U1);
    assert.equal(json(loaded), json(s));
    step({ type: "condition", actor: a.horse, condition: "prone" });
    assert.equal(s.entities[a.gob].riding, undefined, "fell off");
    const end = json(s);
    // Mid-fall saves load too (the ride's `told` flag, a Prone rider).
    assert.equal(json(migrate(JSON.parse(end))), end);
    h.undo(s); h.undo(s); h.undo(s);
    assert.equal(json({ ...s, timeline: null }), json({ ...start, timeline: null }));
    h.redo(s); h.redo(s); h.redo(s);
    assert.equal(json(s), end);
    const again = structuredClone(start);
    for (const [act, ctx] of log) ok(apply(again, act, ctx));
    assert.equal(json(again), end);
  });
}

// A save made with main's code before C6b (origin/main 55e1302, C6a): a rider on a warhorse in a fight, the horse
// Prone and the DM already told (`riding.told`). It loads unchanged and plays on: the old Prone is not saved against
// again (it was the DM's then), the pair walks together, and a new Prone is saved against.
import { readFileSync } from "node:fs";
const OLD = JSON.parse(readFileSync(new URL("./fixtures/c6a-riding-saves.json", import.meta.url), "utf8"));
for (const grid of GRIDS) {
  test(`${grid}: an old save from main (C6a) loads and plays`, () => {
    const { horse, save } = OLD[grid];
    const s = migrate(structuredClone(save));
    const { packs, world, place, parked, journey, ...rest } = s;                    // version 24 (#390) raises the version and adds `packs: []`
    assert.deepEqual(packs, []);
    assert.deepEqual({ world, place, parked, journey }, { world: null, place: null, parked: {}, journey: null });   // version 25 (#579) adds the places of a world
    assert.equal(json({ ...rest, version: save.version }), json(save), "loads unchanged");
    assert.equal(s.entities.fighter.riding.on, horse);
    assert.equal(s.entities.fighter.riding.told, true);
    const r2 = ok(apply(s, { type: "condition", actor: "rogue", condition: "prone" }, DM));
    assert.equal(saves(r2).length, 0, "the Prone told of under main is not saved against again");
    for (let i = 0; i < 30 && !(current(s) === "fighter" && s.encounter.round === save.encounter.round + 1); i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    assert.ok(!s.entities[horse].cond.prone, "the horse stood at its rider's turn");
    assert.equal(s.entities.fighter.riding.told, undefined);
    dex(s, "fighter", -40);
    const r3 = ok(apply(s, { type: "condition", actor: "fighter", condition: "prone" }, DM));
    assert.equal(saves(r3).length, 1);
    assert.ok(off(r3)?.fell);
    assert.equal(noOverlap(s), null);
  });
}

// ---------- fix round 1 (review of #363) ----------

function refusedSame(s, action, ctx, words) {
  const before = json(s), r = apply(s, action, ctx);
  assert.equal(r.ok, false, `${action.type} should be refused`);
  if (words) assert.match(r.error, words);
  assert.equal(json(s), before, "a refused action changes nothing");
}
// A rider on a giant eagle 30 ft up (set by hand: the eagle is the DM's to fly), on either grid.
function aloftPair(grid) {
  const t = table(grid);
  const eagle = beside(t.s, "rogue", "giant-eagle");
  ok(apply(t.s, { type: "dismount", actor: "fighter" }, DM));
  for (const id of [eagle, "rogue"]) t.s.entities[id].pos = { ...t.s.entities[eagle].pos, z: 30 };
  t.s.entities[eagle].side = "party";
  t.s.entities.rogue.riding = { on: eagle, controlled: false, size: "large" }; t.s.entities[eagle].rider = "rogue";
  ok(apply(t.s, { type: "condition", actor: "cleric", condition: "prone" }, DM));
  assert.equal(t.s.entities.rogue.pos.z, 30);
  return { ...t, eagle };
}
for (const grid of GRIDS) {
  test(`${grid}: M1: the DM can't place one half of a pair on another cell of the other (occupied, as before C6b); placed clear of it, the ride ends with no overlap`, () => {
    const { s, horse } = table(grid);
    const G = gridOf(s.map), anchor = s.entities[horse].pos;
    const cells = footprint(s.entities[horse], anchor, G).filter((c) => c.q !== anchor.q || c.r !== anchor.r);
    assert.ok(cells.length >= 2);
    for (const c of cells) {
      refusedSame(s, { type: "place", actor: "fighter", to: { q: c.q, r: c.r } }, DM, /occupied/);
      refusedSame(s, { type: "place", actor: horse, to: { q: c.q, r: c.r } }, DM, /occupied/);
    }
    const far = grid === "square" ? { q: 10, r: 10 } : { q: 3, r: -3 };
    const r = ok(apply(s, { type: "place", actor: "fighter", to: far }, DM));
    assert.equal(off(r)?.why, "apart");
    assert.equal(noOverlap(s), null);
  });

  test(`${grid}: M3: a rider that falls off its flying mount in the air comes off and falls (Prone with a failed save, or at 0 Hit Points)`, () => {
    for (const how of ["prone", "down"]) {
      const { s, eagle } = aloftPair(grid);
      dex(s, "rogue", -40);
      const r = ok(apply(s, how === "prone" ? { type: "condition", actor: "rogue", condition: "prone" } : { type: "harm", actor: "rogue", amount: s.entities.rogue.hp }, DM));
      assert.equal(saves(r, "rogue")[0]?.success, false);
      assert.ok(off(r, "rogue")?.fell, "off");
      assert.ok(r.events.some((e) => e.type === "fell" && e.id === "rogue" && e.feet === 30), "falls 30 ft");
      assert.ok(!r.events.some((e) => e.type === "manual" && e.name === "Mounted combat"), "no hand-off");
      assert.equal(s.entities.rogue.pos.z, 0);
      assert.equal(s.entities.rogue.riding, undefined); assert.equal(s.entities[eagle].rider, undefined);
      assert.equal(noOverlap(s), null);
    }
  });

  test(`${grid}: L1: a rider killed on its flying mount comes down with the action; L2: a second knock-down is saved against again`, () => {
    const { s } = aloftPair(grid);
    ok(apply(s, { type: "harm", actor: "rogue", amount: 999 }, DM));
    assert.ok(s.entities.rogue.dead);
    assert.equal(s.entities.rogue.pos.z, 0, "the body comes down at once");
    const t = table(grid, { fight: true });
    dex(t.s, "fighter", 40);
    const r1 = ok(apply(t.s, { type: "condition", actor: t.horse, condition: "prone" }, DM));
    assert.equal(saves(r1).length, 1);
    const r2 = ok(apply(t.s, { type: "condition", actor: "fighter", condition: "prone" }, DM));
    assert.equal(saves(r2).length, 1, "the rider knocked Prone too: the same save again");
    const r3 = ok(apply(t.s, { type: "condition", actor: "rogue", condition: "prone" }, DM));
    assert.equal(saves(r3).length, 0, "nothing new: no save");
  });

  test(`${grid}: twin run: a hidden Opportunity Attacker beside a party pair: no prompt and nothing told to players that a world without it would not tell`, () => {
    // A party pair (Brenna on the horse) walks away; in world A a goblin that took the Hide action stands beside it,
    // its instruction `ask` (the DM's creature: the DM alone is told). World B has no goblin.
    const mk = (withGob) => {
      const t = table(grid, { fight: true });
      if (withGob) {
        const g = beside(t.s, t.horse, "goblin-warrior");
        t.s.entities[g].hiding = { dc: 30 };
        t.s.entities[g].reactions = { [OPPORTUNITY]: "ask" };
        t.gob = g;
      }
      return t;
    };
    const A = mk(true), B = mk(false);
    assert.ok(unknown(A.s, A.s.entities[A.gob]), "the party does not know of it");
    const G = gridOf(A.s.map), m = A.s.entities[A.horse], g = A.s.entities[A.gob];
    const to = G.range(m.pos, 3).filter((h) => G.dist(h, m.pos) === 3).sort((a, b) => G.dist(b, g.pos) - G.dist(a, g.pos) || a.q - b.q || a.r - b.r)
      .find((h) => { const u = structuredClone(A.s), r = apply(u, { type: "move", actor: "fighter", to: h }, U1); return r.ok && apart(u, u.entities[A.gob], u.entities[A.horse]) > 1; });
    assert.ok(to, "a cell out of its reach");
    A.s.seq = B.s.seq;
    const ra = ok(apply(A.s, { type: "move", actor: "fighter", to }, U1)), rb = ok(apply(B.s, { type: "move", actor: "fighter", to }, U1));
    assert.ok(ra.events.some((e) => e.type === "manual" && e.name === "Opportunity Attack" && e.partial), "the DM is told");
    assert.ok(!ra.events.some((e) => e.type === "reactionAsked"));
    assert.equal(json(viewEvents(ra.events, A.s, U1)), json(viewEvents(rb.events, B.s, U1)));
    assert.equal(view(A.s, U1).prompt ?? null, null);
  });
}

test("hex: the rider's raised eye: on a hex map with a low wall, a goblin behind it is in sight from horseback only", () => {
  const { s } = table("hex");
  ok(apply(s, { type: "setting", key: "sight", value: "los" }, DM));
  const r = s.entities.fighter, horse = r.riding.on, G = gridOf(s.map);
  // A 10-ft wall (the map's walls stand WALL_HEIGHT high) just west of the pair, across the valley's open ground.
  const c = G.center({ q: r.pos.q - 1, r: r.pos.r });
  const [cx, cz] = c, [wx, wz] = G.center(r.pos), mid = { x: (cx + wx) / 2, z: (cz + wz) / 2 }, dx = wz - cz, dz = cx - wx, n = Math.hypot(dx, dz);
  s.map.walls.push({ id: "low", level: "ground", kind: "wall", a: [mid.x + (dx / n) * 15, mid.z + (dz / n) * 15], b: [mid.x - (dx / n) * 15, mid.z - (dz / n) * 15] });
  for (const id of ["rogue", "cleric", "wizard"]) s.entities[id].hp = 0;                  // only Brenna's eyes count
  let found = null;
  for (const h of G.range(r.pos, 6)) {
    const t = structuredClone(s), res = apply(t, { type: "spawn", monster: "goblin-warrior", at: h }, DM);
    if (!res.ok) continue;
    const id = res.events[0].id;
    const u = structuredClone(t);
    delete u.entities.fighter.riding; delete u.entities[horse].rider;
    if (!unknown(t, t.entities[id]) && unknown(u, u.entities[id])) { found = h; break; }
  }
  assert.ok(found, "a cell seen only from horseback");
});
