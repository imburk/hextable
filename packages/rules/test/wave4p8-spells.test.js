// Wave 4, part 8, of issue #786: Jump (auto), through the movement action `leap` (SRD "Long Jump") and the modifier hook `leap`.
// Built to docs/specs/rules-expansion.md, "Build notes: wave 4 part 8". Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { apply, current } from "../src/engine.js";
import * as H from "../src/hex.js";
import { newMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";
import { edgeSegment } from "../src/walls.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "should be refused"); if (re) assert.match(r.error, re); return r; };
const lint = (def) => lintEntry("spells", def, { strict: false });
const leap = (s, q, r, more = {}, id = "fighter", who = DM) => apply(s, { type: "leap", actor: id, to: { q, r }, ...more }, who);
const thing = (id, def, q, r, more = {}) => ({ id, def, level: "ground", at: { q, r }, state: CONTENT.objects[def].initial, ...more });

// A stone-and-grass floor, the fighter (Strength 15) at -6,0, nobody else about; `objects` and `walls` as given.
function floor({ objects = [], walls = [], tile = "grass" } = {}) {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 12).map((h) => [H.col(h), { t: tile }]));
  const s = newGame(8);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  ok(apply(s, { type: "loadMap", map: newMap({ id: "floor", name: "A floor", starts: [{ q: -6, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }], walls, objects }) }, DM));
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  ok(apply(s, { type: "place", actor: "fighter", to: { q: -6, r: 0 } }, DM));
  for (const [id, q, r] of [["wizard", -6, 6], ["rogue", -6, 7], ["cleric", -6, 8]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  s.entities.fighter.abil.str = 15;
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 300;
  return s;
}
// A fight with the fighter to move, a goblin far off so it is a fight.
function fight(s) {
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 6, r: -3 }, name: "Gob" }, DM));
  const gob = Object.values(s.entities).find((e) => e.name === "Gob");
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 12 }, DM));
  for (let i = 0; i < 30 && current(s) !== "fighter"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.equal(current(s), "fighter");
  return gob;
}
const left = (s) => s.encounter.budget.move;
const pos = (s, id = "fighter") => [s.entities[id].pos.q, s.entities[id].pos.r];
const stay = (s, act) => { const before = JSON.stringify(s); const r = act(s); assert.equal(r.ok, false); assert.equal(JSON.stringify(s), before, "a refused leap changes nothing"); return r; };

test("the Jump entry is auto and checked, lends the leap hook, lints and reads; the hook's lint is strict", () => {
  const d = SPELLS.jump.def;
  assert.equal(d.tier, "auto");
  assert.equal(d.checked, true);
  assert.deepEqual([d.time, d.range, d.duration, d.concentration, d.level, d.higher], ["bonus", "touch", "1 minute", false, 1, { slot: { targets: 1 } }]);
  assert.deepEqual(d.effects, [{ modifier: { on: "leap", op: "set", value: 30 } }]);
  assert.deepEqual(lint(d), []);
  assert.deepEqual(readEntry("spell", d, {}).problems ?? [], []);
  assert.match(JSON.stringify(readEntry("spell", d, {})), /leap of up to 30 feet for 10 feet of movement/);
  for (const bad of [{ on: "leap", op: "add", value: 30 }, { on: "leap", op: "set", value: 32 }, { on: "leap", op: "set", value: 400 }, { on: "leap", op: "set", value: 30, once: "turn" }, { on: "leap", op: "set" }])
    assert.ok(lint({ ...d, effects: [{ modifier: bad }] }).length, JSON.stringify(bad));
});

test("outside a fight: Strength 15 leaps 15 feet (a free run-up), no movement is spent, 20 is refused and changes nothing", () => {
  const s = floor();
  stay(s, (c) => leap(c, -2, 0));                                         // 4 hexes: 20 ft
  const r = ok(leap(s, -3, 0));                                           // 3 hexes: 15 ft
  assert.deepEqual(pos(s), [-3, 0]);
  assert.ok(r.events.some((e) => e.type === "moved" && e.id === "fighter"));
  assert.match(r.events.find((e) => e.type === "note").text, /leaps 15 ft/);
  ok(leap(s, 0, 0));                                                      // and again, at once: nothing is counted outside a fight
  assert.deepEqual(pos(s), [0, 0]);
  stay(s, (c) => leap(c, 0, 0));                                          // already there
  s.entities.fighter.abil.str = 14;                                       // 14 ft is 10 in whole 5 ft
  stay(s, (c) => leap(c, 3, 0));
  ok(leap(s, 2, 0));
});

test("in a fight: standing is half (15 -> 5 ft, 7 rounded down), a running start is Strength; each foot costs a foot of movement", () => {
  const s = floor(); fight(s);
  const speed = left(s);
  assert.equal(speed, 30);
  no(stay(s, (c) => leap(c, -4, 0)), /Too far: Brenna can leap 5 ft from a standing start.*running start.*15 ft/);
  ok(leap(s, -5, 0));                                                     // 5 ft standing
  assert.equal(left(s), speed - 5);
  no(stay(s, (c) => leap(c, -2, 0)), /Too far/);                           // no 10 ft walked since the leap: standing again
  ok(apply(s, { type: "move", actor: "fighter", to: { q: -3, r: 0 } }, DM)); // walks 10 ft
  assert.equal(left(s), speed - 5 - 10);
  ok(leap(s, 0, 0));                                                      // running: 15 ft
  assert.equal(left(s), speed - 5 - 10 - 15);
  assert.deepEqual(pos(s), [0, 0]);
});

test("in a fight: a leap with too little movement left is refused in the words a walk uses, and changes nothing", () => {
  const s = floor(); fight(s);
  ok(apply(s, { type: "move", actor: "fighter", to: { q: -4, r: 0 } }, DM));
  s.encounter.budget.move = 10;
  const walkWords = apply(structuredClone(s), { type: "move", actor: "fighter", to: { q: 5, r: 0 } }, DM).error;
  const r = stay(s, (c) => leap(c, -1, 0));
  assert.equal(r.error, "Too far. Brenna has 10 ft of movement left.");
  assert.match(walkWords, /^Too far\. Brenna has 10 ft of movement left\.$/);
});

test("the Jump spell: 30 ft for 10 ft of movement once a turn; a second leap falls back to the ordinary rule; it ends after a minute", () => {
  const s = floor();
  s.entities.wizard.spells.push("jump");
  Object.assign(s.entities.wizard, { slots: { 1: 4 }, slotsMax: { 1: 4 } });
  ok(apply(s, { type: "place", actor: "wizard", to: { q: -6, r: 1 } }, DM));
  ok(apply(s, { type: "cast", actor: "wizard", spell: "jump", target: "fighter", slot: 1 }, DM));
  // Outside a fight the spell's reach is the limit, and nothing is counted.
  ok(leap(s, 0, 0));                                                      // 30 ft from a standstill
  stay(s, (c) => leap(c, 7, 0));                                          // 35 ft
  ok(leap(s, -6, 0));
  const g = fight(s);
  assert.ok(g);
  const start = left(s);
  const r1 = ok(leap(s, 0, 0));                                           // 6 hexes, standing: only the spell reaches
  assert.equal(left(s), start - 10);
  assert.match(r1.events.find((e) => e.type === "note").text, /leaps 30 ft \(Jump\)/);
  no(stay(s, (c) => leap(c, 6, 0)), /Too far/);                            // the spell is used: 30 ft is out of reach again
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 2, r: 0 } }, DM)); // 10 ft walked
  const before = left(s);
  ok(leap(s, 4, 0));                                                      // 10 ft the ordinary way, costing 10
  assert.equal(left(s), before - 10);
  // Next turn the spell's leap is back.
  for (let i = 0; i < 10; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  while (current(s) !== "fighter") ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  const t = left(s);
  ok(leap(s, 8, 0, { spell: true }));                                     // 20 ft for 10, `spell: true` asks for it
  assert.equal(left(s), t - 10);
  no(stay(s, (c) => leap(c, 11, 0, { spell: true })), /already made its spell's leap/);
  ok(apply(s, { type: "endEncounter" }, DM));
  ok(apply(s, { type: "advanceTime", minutes: 2 }, DM));
  stay(s, (c) => leap(c, 0, 0, { spell: true }));
  no(leap(s, 0, 0, { spell: true }), /no spell that lends it a leap/);
});

test("`spell: true` insists on the spell's leap, even where the ordinary one would be cheaper to use; a leap that either could make costs the cheaper", () => {
  const s = floor();
  s.entities.wizard.spells.push("jump");
  Object.assign(s.entities.wizard, { slots: { 1: 4 }, slotsMax: { 1: 4 } });
  ok(apply(s, { type: "place", actor: "wizard", to: { q: -6, r: 1 } }, DM));
  ok(apply(s, { type: "cast", actor: "wizard", spell: "jump", target: "fighter", slot: 1 }, DM));
  fight(s);
  const a = left(s);
  ok(leap(s, -5, 0));                                                     // 5 ft: the ordinary leap is cheaper than the spell's 10
  assert.equal(left(s), a - 5);
  ok(apply(s, { type: "move", actor: "fighter", to: { q: -3, r: 0 } }, DM));
  const b = left(s);
  ok(leap(s, 0, 0, { spell: true }));                                     // 15 ft, asked for the spell's: costs 10
  assert.equal(left(s), b - 10);
});

test("a trap, pit or zone on a hex passed over does not fire; one on the landing hex does", () => {
  const s0 = floor({ objects: [thing("pit", "pit-trap", -4, 0), thing("pit2", "pit-trap", -2, 0)] });
  const over = (c) => leap(c, -3, 0);
  const r = ok(over(s0));
  assert.deepEqual(r.events.map((e) => e.type), ["moved", "note"]);
  assert.equal(s0.map.objects.find((o) => o.id === "pit").state, CONTENT.objects["pit-trap"].initial);
  const s1 = floor({ objects: [thing("pit", "pit-trap", -4, 0), thing("pit2", "pit-trap", -3, 0)] });
  const hit = ok(over(s1));
  assert.ok(hit.events.some((e) => e.type === "triggered" && e.object === "pit2"), "the landing hex's pit goes off");
  assert.ok(!hit.events.some((e) => e.type === "triggered" && e.object === "pit"));
  assert.deepEqual(pos(s1), [-3, 0]);
});

test("a zone on hexes passed over (Spike Growth) does nothing to the leaper; one on the landing hex goes off", () => {
  const mk = () => {
    const s = floor();
    ok(apply(s, { type: "place", actor: "fighter", to: { q: -12, r: 0 } }, DM));
    s.entities.fighter.abil.str = 100;
    s.entities.wizard.spells.push("spike-growth");
    Object.assign(s.entities.wizard, { slots: { 2: 3 }, slotsMax: { 2: 3 } });
    ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 6, r: -3 }, name: "Gob" }, DM));
    ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 12 }, DM));
    for (let i = 0; i < 30 && current(s) !== "wizard"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    ok(apply(s, { type: "cast", actor: "wizard", spell: "spike-growth", hex: { q: -5, r: 0 }, slot: 2 }, DM));   // -9 to -1
    assert.ok(s.effects.some((x) => x.name === "Spike Growth"));
    for (let i = 0; i < 30 && current(s) !== "fighter"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    Object.assign(s.encounter.budget, { dashes: 6, move: 210 });                  // plenty of movement for a 50 ft leap
    ok(apply(s, { type: "move", actor: "fighter", to: { q: -10, r: 0 } }, DM));  // 10 ft walked, still outside the area
    return s;
  };
  const hp = mk().entities.fighter.hp;
  const w = mk();                                                         // landing inside it: it goes off, once
  const hit = ok(leap(w, -2, 0));
  assert.ok(hit.events.some((e) => e.type === "zone") && w.entities.fighter.hp < hp, "the landing hex's zone goes off");
  const s = mk();
  const r = ok(leap(s, 0, 0));
  assert.deepEqual(pos(s), [0, 0]);
  assert.ok(!r.events.some((e) => e.type === "zone" || e.type === "damage"), "nothing fired");
  assert.equal(s.entities.fighter.hp, hp);
});

test("creatures on the line do not block a leap; a creature on the landing hex refuses it before anything is spent", () => {
  const s = floor();
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: -5, r: 0 }, name: "Gob" }, DM));
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: -4, r: 0 }, name: "Gob2" }, DM));
  const hp = s.entities.fighter.hp;
  ok(leap(s, -3, 0));
  assert.deepEqual(pos(s), [-3, 0]);
  assert.equal(s.entities.fighter.hp, hp);
  const t = floor(); fight(t);
  ok(apply(t, { type: "spawn", monster: "goblin-warrior", at: { q: -5, r: 0 }, name: "Near" }, DM));
  const m = t.encounter.budget.move;
  no(stay(t, (c) => leap(c, -5, 0)), /occupied/);
  assert.equal(left(t), m);
});

test("landing in Difficult Terrain: a DC 10 Dexterity (Acrobatics) check, or Prone; open ground asks nothing", () => {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 12).map((h) => [H.col(h), { t: h.q === -3 && h.r === 0 ? "forest" : "grass" }]));
  const mk = () => {
    const s = floor();
    s.map.levels[0].tiles = tiles;
    return s;
  };
  const results = new Set();
  for (let seed = 1; seed < 60 && results.size < 2; seed++) {
    const s = mk(); s.rng = seed;
    const r = ok(leap(s, -3, 0));
    const c = r.events.find((e) => e.type === "check");
    assert.ok(c, "the check is rolled");
    assert.deepEqual([c.skill, c.ability, c.dc], ["acrobatics", "dex", 10]);
    assert.equal(c.success, c.total >= 10);
    assert.equal(!!s.entities.fighter.cond.prone, !c.success);
    results.add(c.success);
  }
  assert.equal(results.size, 2, "both outcomes were seen");
  const open = floor();
  assert.ok(!ok(leap(open, -3, 0)).events.some((e) => e.type === "check"));
});

test("a wall on the line refuses; a door left open lets the leap through; a secret door is refused like a wall", () => {
  const [a, b] = edgeSegment({ q: -5, r: 0 }, 0);                          // the edge between -5,0 and -4,0
  const s = floor({ walls: [{ id: "w1", level: "ground", a, b, kind: "wall" }] });
  const r = stay(s, (c) => leap(c, -3, 0));
  assert.equal(r.error, "A wall or a shut door is in the way.");
  const d = floor({ objects: [{ id: "door", def: "door-wooden", level: "ground", at: { q: -5, r: 0 }, edge: 0, state: "closed" }] });
  const closed = stay(d, (c) => leap(c, -3, 0));
  assert.equal(closed.error, "A wall or a shut door is in the way.");
  ok(apply(d, { type: "setObject", object: "door", state: "open" }, DM));
  ok(leap(d, -3, 0));
  const sec = floor({ objects: [{ id: "sd", def: "secret-door", level: "ground", at: { q: -5, r: 0 }, edge: 0, state: "secret" }] });
  assert.equal(stay(sec, (c) => leap(c, -3, 0)).error, closed.error);
});

test("a hidden creature on the landing hex is found, and the leap stops in the last free hex before it (the feet are those of that shorter leap)", () => {
  // The DM's hidden creature, out of a fight: found, the leap stops short, nothing is counted.
  const s = floor();
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: -3, r: 0 }, name: "Lurker", hidden: true }, DM));
  const lurker = Object.values(s.entities).find((e) => e.name === "Lurker");
  const r = ok(leap(s, -3, 0));
  assert.deepEqual(pos(s), [-4, 0]);
  assert.equal(lurker.hidden, undefined, "found");
  assert.ok(r.events.some((e) => e.type === "revealed" && e.id === lurker.id));
  // A creature hiding in a fight (the Hide action): the same, and the feet are those of the shorter leap.
  const f = floor(); fight(f);
  ok(apply(f, { type: "move", actor: "fighter", to: { q: -4, r: 0 } }, DM));    // 10 ft: a running start
  ok(apply(f, { type: "spawn", monster: "goblin-warrior", at: { q: -1, r: 0 }, name: "Hider" }, DM));
  const hider = Object.values(f.entities).find((e) => e.name === "Hider");
  hider.hiding = { dc: 30 };
  const m = left(f);
  const r2 = ok(leap(f, -1, 0));                                          // from -4 to -1: 15 ft; it stops at -2: 10 ft
  assert.deepEqual(pos(f), [-2, 0]);
  assert.equal(left(f), m - 10);
  assert.equal(hider.hiding, undefined, "found");
  assert.ok(r2.events.some((e) => e.type === "unhidden" && e.id === hider.id));
  // Nowhere to come down short of it: no leap, and it is found.
  const g = floor();
  ok(apply(g, { type: "spawn", monster: "goblin-warrior", at: { q: -5, r: 0 }, name: "Beside", hidden: true }, DM));
  const b = Object.values(g.entities).find((e) => e.name === "Beside");
  ok(leap(g, -5, 0));
  assert.deepEqual(pos(g), [-6, 0]);
  assert.equal(b.hidden, undefined);
});

test("Opportunity Attacks: leaving a hostile's reach by a leap provokes; Disengage prevents it", () => {
  const mk = () => {
    const s = floor();
    ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: -5, r: 0 }, name: "Edge" }, DM));
    ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 12 }, DM));
    for (let i = 0; i < 30 && current(s) !== "fighter"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    for (const e of Object.values(s.entities)) if (e.name === "Edge") Object.assign(e, { hp: 300, maxHp: 300 });
    return s;
  };
  const s = mk();
  s.entities.fighter.abil.str = 30;
  const edge = Object.values(s.entities).find((e) => e.name === "Edge");
  edge.reactionUsed = false;
  const r = ok(leap(s, -3, 0));
  assert.ok(r.events.some((e) => e.type === "reaction"), "an Opportunity Attack was made");
  const d = mk();
  d.entities.fighter.abil.str = 30;
  ok(apply(d, { type: "disengage", actor: "fighter" }, DM));
  const r2 = ok(leap(d, -3, 0));
  assert.ok(!r2.events.some((e) => e.type === "reaction"));
});

test("refused: a mounted creature, Prone, no Strength score, not its turn, not a creature's own player, a fall level; the label is in history", () => {
  const s = floor();
  s.entities.fighter.cond.prone = {};
  no(stay(s, (c) => leap(c, -5, 0)), /Prone/);
  delete s.entities.fighter.cond.prone;
  delete s.entities.fighter.abil.str;
  no(stay(s, (c) => leap(c, -5, 0)), /no Strength score/);
  s.entities.fighter.abil.str = 15;
  no(stay(s, (c) => leap(c, 40, 40)), /nothing there to stand on/);
  no(stay(s, (c) => apply(c, { type: "leap", actor: "fighter", to: "nowhere" }, DM)), /Name where to leap/);
  no(stay(s, (c) => leap(c, -5, 0, { spell: "yes" })), /true or left out/);
  apply(s, { type: "claim", entity: "rogue", user: "pat", userName: "Pat" }, PAT);
  no(stay(s, (c) => leap(c, -5, 0, {}, "fighter", PAT)), /isn't yours/);
  const t = floor(); fight(t);
  no(stay(t, (c) => leap(c, -5, 7, {}, "rogue")), /isn't Rogue's turn|It isn't/);
});

test("the Ring of Jumping's activation is this Jump (self only); item-use.test.js casts it and the leap hook follows", () => {
  assert.deepEqual(CONTENT.items["ring-of-jumping"].activate, [{ time: "bonus", spell: "jump", self: true }]);
});
