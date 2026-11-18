// Dragging (issue #473, stage G3 of docs/specs/grapple-shove.md, Decision 6; DEBT T61).
// SRD 5.2 "Grappled": "Movable. The grappler can drag or carry you when it moves, but every foot of movement costs it 1 extra foot
// unless you are Tiny or two or more sizes smaller than it." Grappler feat, Fast Wrestler: "you don't spend extra movement to move a
// creature grappled by you that is your size or smaller." Opportunity Attacks: none "if you move without using your movement, action
// or Reaction" (a creature moved by another). Walls, doors and creatures stop a forced move.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity, moveOptions } from "../src/engine.js";
import { dragExtra } from "../src/engine/world.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { aiStep } from "../src/ai.js";
import { newMap } from "../src/map.js";
import * as H from "../src/hex.js";
import { viewEvents } from "../src/view.js";
import { squareRoom } from "./fixtures/square-room.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const fighter = (abilities, more = {}) => ({ name: "Fi", class: "fighter", level: 5, subclass: "champion", abilities,
  skills: ["athletics", "perception"], choices: { "fighting-style": "defense" }, weapons: [], ...more });
const STR16 = { str: 16, dex: 14, con: 14, int: 10, wis: 8, cha: 8 };
const GRAPPLER = { feats: [{ id: "grappler", at: "ability-score-improvement-4", abilities: { str: 1 } }] };
const refused = (s, action, re) => { const before = JSON.stringify(s), r = apply(s, action, DM); assert.equal(r.ok, false, "should have been refused"); assert.match(r.error, re); assert.equal(JSON.stringify(s), before, "a refusal changes nothing"); };
const pos = (s, id) => `${s.entities[id].pos.q},${s.entities[id].pos.r}`;
const turnOf = (s, id) => { for (let i = 0; i < 12 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const held = (by, extra = {}) => ({ by, with: "hand", escape: 14, range: 5, ...extra });
// The hold the DM's state carries: set directly, so a test does not depend on a save.
const hold = (s, id, by = "hero", extra = {}) => { const c = s.entities[id].cond; (c.grappled ??= { source: by, holds: [] }).holds.push(held(by, extra)); };

// A hero (built from `sheet`) and a goblin held by it, in a fight and the hero's turn. Hex: hero 0,0, goblins at 1,0, 0,1 and -1,1
// (`foes`). Square: the square room, hero at 9,7 and the goblins at 10,7, 9,8 and 8,8.
function field(sheet = fighter(STR16), { square = false, foes = 1, fight = true, keep = false } = {}) {
  const s = newGame(7);
  if (square) ok(apply(s, { type: "loadMap", map: squareRoom() }, DM));
  for (const id of Object.keys(s.entities)) if (!(keep && id === "wizard")) delete s.entities[id];
  if (!square) for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  const at = square ? { q: 9, r: 7 } : { q: 0, r: 0 };
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { ...at, z: 0 } });
  s.foes = [];
  const around = square ? [{ q: 10, r: 7 }, { q: 9, r: 8 }, { q: 8, r: 8 }] : [{ q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 }];
  for (const to of around.slice(0, foes)) {
    const id = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: to }, DM)).events.find((e) => e.type === "spawned").id;
    Object.assign(s.entities[id], { hp: 500, maxHp: 500, ac: 1 });
    s.foes.push(id);
  }
  s.foe = s.foes[0];
  if (fight) { ok(apply(s, { type: "startEncounter", center: at, radius: 8 }, DM)); turnOf(s, "hero"); }
  return s;
}
const GRIDS = [["hex", false], ["square", true]];

for (const [grid, square] of GRIDS) {
  test(`${grid}: 30 ft of Speed drags a Medium creature 15 ft, and the held creature ends beside the grappler`, () => {
    const s = field(fighter(STR16), { square });
    hold(s, s.foe);
    const o = s.entities.hero.pos, west = (n) => ({ q: o.q - n, r: o.r });
    const reach = moveOptions(s, s.entities.hero);
    assert.equal(reach.get(`${west(3).q},${west(3).r}`).cost, 30, "three steps, 10 ft each");
    assert.equal(reach.has(`${west(4).q},${west(4).r}`), false, "a fourth is out of reach");
    const r = ok(apply(s, { type: "move", actor: "hero", to: west(3) }, DM));
    assert.equal(s.encounter.budget.move, 0);
    assert.equal(pos(s, "hero"), `${west(3).q},${west(3).r}`);
    assert.equal(pos(s, s.foe), `${west(2).q},${west(2).r}`, "pulled behind it, not left");
    assert.ok(s.entities[s.foe].cond.grappled, "the hold is not ended by a move the grappler chose");
    const pulls = r.events.filter((e) => e.type === "moved" && e.id === s.foe);
    assert.equal(pulls.length, 3, "one pull a step");
    assert.ok(pulls.every((e) => e.forced === true));
    // The order told: the grappler's step, then the pull.
    const kinds = r.events.filter((e) => e.type === "moved").map((e) => e.id);
    assert.deepEqual(kinds, ["hero", s.foe, "hero", s.foe, "hero", s.foe]);
    refused(s, { type: "move", actor: "hero", to: west(4) }, /Too far\. Fi has 0 ft/);
  });

  test(`${grid}: a Tiny held creature costs nothing extra; two held cost triple`, () => {
    const s = field(fighter(STR16), { square });
    hold(s, s.foe);
    s.entities[s.foe].size = "tiny";
    const o = s.entities.hero.pos;
    assert.equal(moveOptions(s, s.entities.hero).get(`${o.q - 6},${o.r}`).cost, 30, "6 steps of 5 ft");
    ok(apply(s, { type: "move", actor: "hero", to: { q: o.q - 6, r: o.r } }, DM));
    assert.equal(s.encounter.budget.move, 0);
    assert.ok(s.entities[s.foe].cond.grappled);
    assert.ok(Math.max(Math.abs(s.entities[s.foe].pos.q - s.entities.hero.pos.q), Math.abs(s.entities[s.foe].pos.r - s.entities.hero.pos.r)) <= 1);

    const t = field(fighter(STR16), { square, foes: 2 });
    hold(t, t.foes[0]); hold(t, t.foes[1]);
    const p = t.entities.hero.pos, reach = moveOptions(t, t.entities.hero);
    assert.equal(reach.get(`${p.q - 2},${p.r}`).cost, 30, "two held: 15 ft a step, so two steps");
    assert.equal(reach.has(`${p.q - 3},${p.r}`), false);
    ok(apply(t, { type: "move", actor: "hero", to: { q: p.q - 2, r: p.r } }, DM));
    for (const id of t.foes) {
      assert.ok(t.entities[id].cond.grappled, "both still held");
      const g = t.entities[id].pos, h = t.entities.hero.pos;
      assert.ok(Math.max(Math.abs(g.q - h.q), Math.abs(g.r - h.r)) <= 1, "and beside it");
    }
    // Tiny and ordinary: 1 extra foot a foot, not two.
    const u = field(fighter(STR16), { square, foes: 2 });
    hold(u, u.foes[0]); hold(u, u.foes[1]);
    u.entities[u.foes[1]].size = "tiny";
    assert.equal(moveOptions(u, u.entities.hero).get(`${u.entities.hero.pos.q - 3},${u.entities.hero.pos.r}`).cost, 30);
  });
}

test("the extra foot, by size: Tiny or two or more sizes smaller is free; Fast Wrestler frees the grappler's size or smaller", () => {
  const g = (size, feat = false) => ({ size, feats: feat ? [{ id: "feat-grappler" }] : [] });
  assert.equal(dragExtra(g("medium"), g("small")), 1, "one size smaller still costs");
  assert.equal(dragExtra(g("medium"), g("medium")), 1);
  assert.equal(dragExtra(g("medium"), g("large")), 1);
  assert.equal(dragExtra(g("medium"), g("tiny")), 0);
  assert.equal(dragExtra(g("large"), g("small")), 0, "two sizes smaller");
  assert.equal(dragExtra(g("large"), g("medium")), 1);
  assert.equal(dragExtra(g("huge"), g("medium")), 0);
  assert.equal(dragExtra(g("tiny"), g("tiny")), 0, "a Tiny creature is exempt whatever the grappler's size");
  assert.equal(dragExtra(g("medium", true), g("medium")), 0, "Fast Wrestler: its own size");
  assert.equal(dragExtra(g("medium", true), g("small")), 0);
  assert.equal(dragExtra(g("medium", true), g("large")), 1, "but not a larger one");
  assert.equal(dragExtra({}, {}), 1, "no size is Medium");
});

for (const [grid, square] of GRIDS) {
  test(`${grid}: Fast Wrestler: a Grappler drags a creature of its size or smaller for nothing`, () => {
    const s = field(fighter(STR16, GRAPPLER), { square });
    assert.ok(s.entities.hero.feats.some((f) => f.id === "feat-grappler"));
    hold(s, s.foe);                                                      // a Small goblin: no larger than a Medium grappler
    const o = s.entities.hero.pos;
    assert.equal(moveOptions(s, s.entities.hero).get(`${o.q - 6},${o.r}`).cost, 30);
    ok(apply(s, { type: "move", actor: "hero", to: { q: o.q - 6, r: o.r } }, DM));
    assert.ok(s.entities[s.foe].cond.grappled);
    // A Large creature is not free.
    const t = field(fighter(STR16, GRAPPLER), { square });
    hold(t, t.foe); t.entities[t.foe].size = "large";
    assert.equal(moveOptions(t, t.entities.hero).get(`${t.entities.hero.pos.q - 3},${t.entities.hero.pos.r}`).cost, 30, "10 ft a step");
  });
}

test("Difficult Terrain and dragging add: each foot costs 1 extra foot for each, so 3 ft a foot with one held", () => {
  const s = field();
  hold(s, s.foe);
  s.map.levels[0].tiles["-1,0"].t = "forest";                            // Difficult Terrain
  const cost = moveOptions(s, s.entities.hero).get("-1,0").cost;
  const alone = field(); alone.map.levels[0].tiles["-1,0"].t = "forest";
  assert.equal(moveOptions(alone, alone.entities.hero).get("-1,0").cost, 10);
  assert.equal(cost, 15, "10 ft of terrain and 5 more for the hold");
});

test("the dragged creature provokes no Opportunity Attack, and does not make one on its grappler; the grappler provokes as usual", () => {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(fighter(STR16)).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  s.entities.ally = makeEntity(derive(fighter(STR16, { weapons: ["longsword"] })).record, { id: "ally", kind: "pc", side: "party", pos: { q: 2, r: -1, z: 0 } });
  const spawn = (at) => { const id = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at }, DM)).events.find((e) => e.type === "spawned").id; Object.assign(s.entities[id], { hp: 500, maxHp: 500, ac: 1 }); return id; };
  const gob = spawn({ q: 1, r: 0 }), guard = spawn({ q: 1, r: -1 });        // the held one beside the ally; a guard beside the hero
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  turnOf(s, "hero");
  hold(s, gob);
  assert.equal(s.entities.ally.reactionUsed ?? false, false);
  const r = ok(apply(s, { type: "move", actor: "hero", to: { q: -1, r: 0 } }, DM));
  const oas = r.events.filter((e) => e.type === "reaction" && e.reaction === "opportunity-attack");
  assert.ok(oas.some((e) => e.id === guard && e.against === "hero"), "the grappler left the guard's reach: it provoked");
  assert.ok(!oas.some((e) => e.against === gob), "the held creature provoked nothing");
  assert.ok(!oas.some((e) => e.id === gob), "and made none on its grappler, who took it along");
  assert.equal(s.entities.ally.reactionUsed ?? false, false, "the ally beside the held creature's old place made none either");
  assert.equal(pos(s, gob), "0,0", "pulled into the place the grappler left");
});

test("a hold with a longer reach is not pulled until the grappler steps beyond it, and is then not an Opportunity Attacker's to be left", () => {
  const s = field();
  s.entities[s.foe].pos = { q: 2, r: 0, z: 0 };
  hold(s, s.foe, "hero", { range: 10 });
  ok(apply(s, { type: "move", actor: "hero", to: { q: -1, r: 0 } }, DM));         // now 15 ft away: pulled one step
  assert.equal(pos(s, s.foe), "1,0");
  assert.ok(s.entities[s.foe].cond.grappled);
});

test("square: a wall stops the pull and so the walk: no step the held creature could not follow is offered, so the grappler goes round", () => {
  const s = field(fighter(STR16), { square: true });
  // The wall stands between columns 2 and 3 on rows 6 and 7, ending at the corner of 2,5 and 3,6.
  s.entities.hero.pos = { q: 2, r: 5, z: 0 };
  s.entities[s.foe].pos = { q: 3, r: 6, z: 0 };
  hold(s, s.foe);
  // West from 2,5 the goblin at 3,6 could not follow (the corner of the wall), so a way that begins there is not offered; the grappler
  // reaches 1,5 round the other way, by 2,4, and the goblin comes along.
  const r0 = ok(apply(s, { type: "move", actor: "hero", to: { q: 1, r: 5 } }, DM));
  assert.deepEqual(r0.events.find((e) => e.type === "moved" && e.id === "hero").path[0], { q: 2, r: 4, z: 0 }, "it goes round");
  assert.ok(s.entities[s.foe].cond.grappled);
  const near = (a, b) => Math.max(Math.abs(a.q - b.q), Math.abs(a.r - b.r)) <= 1;
  assert.ok(near(s.entities.hero.pos, s.entities[s.foe].pos), "and the goblin came along");
  // From 3,5 the way west by 2,5 is not offered either (the goblin at 3,6 could not follow the second step): it goes round, and the hold stays.
  const t = field(fighter(STR16), { square: true });
  t.entities.hero.pos = { q: 3, r: 5, z: 0 };
  t.entities[t.foe].pos = { q: 3, r: 6, z: 0 };
  hold(t, t.foe);
  const r = ok(apply(t, { type: "move", actor: "hero", to: { q: 1, r: 5 } }, DM));
  assert.equal(pos(t, "hero"), "1,5");
  assert.ok(near(t.entities.hero.pos, t.entities[t.foe].pos), "the goblin came along");
  assert.ok(t.entities[t.foe].cond.grappled, "the hold is never ended by a move the grappler chose");
  assert.ok(!r.events.some((e) => e.type === "note" && /can't drag/.test(e.text)));
});

test("square: a shut door stops the pull of a hold that reaches through it", () => {
  const s = field(fighter(STR16), { square: true, fight: false });
  // The door is on the east side of 18,10. The grappler at 17,10 holds a creature at 19,10 (a hold with 10 ft of reach).
  s.entities.hero.pos = { q: 17, r: 10, z: 0 };
  s.entities[s.foe].pos = { q: 19, r: 10, z: 0 };
  hold(s, s.foe, "hero", { range: 10 });
  assert.ok(moveOptions(s, s.entities.hero, { unchecked: true }).has("16,10"), "the way west is open to the grappler alone");
  assert.equal(moveOptions(s, s.entities.hero).has("16,10"), false, "but it is not offered: what it holds could not follow");
  refused(s, { type: "move", actor: "hero", to: { q: 16, r: 10 } }, /Fi can't drag Goblin Warrior \d+ that way\./);
  assert.deepEqual(s.entities[s.foe].pos, { q: 19, r: 10, z: 0 });
});

test("two held that need the same cell: the step is asked as a whole before anything happens, so no Opportunity Attack, no zone, no spent step", () => {
  const s = field(fighter(STR16), { foes: 1 });
  const spawn = (at) => { const id = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at }, DM)).events.find((e) => e.type === "spawned").id; Object.assign(s.entities[id], { hp: 500, maxHp: 500, ac: 1 }); return id; };
  const b = spawn({ q: 1, r: -1 }), blocker = spawn({ q: 0, r: -1 }), guard = spawn({ q: 0, r: 1 });
  hold(s, s.foe); hold(s, b);
  // Each could be pulled into 0,0 alone, and that is the only cell they share; a hostile creature beside the hero would have its Opportunity Attack.
  assert.equal(moveOptions(s, s.entities.hero).has("-1,0"), false, "not offered");
  assert.ok(moveOptions(s, s.entities.hero, { unchecked: true }).has("-1,0"));
  refused(s, { type: "move", actor: "hero", to: { q: -1, r: 0 } }, /Fi can't drag Goblin Warrior \d+ and Goblin Warrior \d+ that way/);
  assert.equal(s.entities[guard].reactionUsed ?? false, false, "(and the state is as it was, byte for byte)");
});

test("Dash works for a holder, and moving outside a fight drags at the same cost", () => {
  const s = field();
  hold(s, s.foe);
  ok(apply(s, { type: "dash", actor: "hero" }, DM));
  assert.equal(s.encounter.budget.move, 60);
  ok(apply(s, { type: "move", actor: "hero", to: { q: -6, r: 0 } }, DM));
  assert.equal(pos(s, "hero"), "-6,0");
  assert.equal(pos(s, s.foe), "-5,0");
  assert.equal(s.encounter.budget.move, 0);
  const t = field(fighter(STR16), { fight: false });
  hold(t, t.foe);
  ok(apply(t, { type: "move", actor: "hero", to: { q: -3, r: 0 } }, DM));
  assert.equal(pos(t, t.foe), "-2,0");
  assert.ok(t.entities[t.foe].cond.grappled);
});

test("off the ground: a grappler whose way would leave it (climbing, flying) is refused, with the reason, and may walk on the ground", () => {
  const s = field();
  s.map.levels[0].tiles["-1,0"].h = 10;                                  // a ledge 10 ft up: a climb
  ok(apply(s, { type: "setSpeed", actor: "hero", mode: "climb", feet: 30 }, DM));
  const ledge = (reach) => [...reach.values()].some((v) => v.h.q === -1 && v.h.r === 0 && v.h.z === 10);
  assert.ok(ledge(moveOptions(s, s.entities.hero)), "alone it climbs there");
  hold(s, s.foe);
  assert.equal(ledge(moveOptions(s, s.entities.hero)), false, "holding, it is offered the ground only");
  assert.ok(ledge(moveOptions(s, s.entities.hero, { aerial: true })), "(aerial: laid out as the refusal asks)");
  refused(s, { type: "move", actor: "hero", to: { q: -1, r: 0, z: 10 } }, /The engine drags along the ground only\. Release Goblin Warrior \d+ first, or the DM moves both\./);
  ok(apply(s, { type: "move", actor: "hero", to: { q: 0, r: -1 } }, DM));         // along the ground: fine
  const t = field();
  ok(apply(t, { type: "setSpeed", actor: "hero", mode: "fly", feet: 30 }, DM));
  hold(t, t.foe);
  refused(t, { type: "move", actor: "hero", to: { q: -1, r: 0, z: 15 } }, /drags along the ground only/);
  ok(apply(t, { type: "letGo", actor: "hero", target: t.foe }, DM));
  ok(apply(t, { type: "move", actor: "hero", to: { q: -1, r: 0, z: 15 } }, DM));    // released: it flies
});

test("a mount carrying a rider who holds a creature drags it: the mount pays the cost and the held creature is pulled", () => {
  const s = field(fighter(STR16), { fight: false });
  const horse = ok(apply(s, { type: "spawn", monster: "riding-horse", at: { q: -2, r: 0 } }, DM)).events.find((e) => e.type === "spawned").id;   // Large: 3 hexes
  s.entities[horse].side = "party";
  ok(apply(s, { type: "mount", actor: "hero", mount: horse }, DM));
  assert.equal(pos(s, "hero"), pos(s, horse), "mounted");
  s.entities[s.foe].pos = { q: -3, r: 0, z: 0 };
  hold(s, s.foe);
  assert.equal(moveOptions(s, s.entities[horse]).get("-1,0")?.cost, 10, "one step costs the extra foot, paid by the mount");
  ok(apply(s, { type: "move", actor: "hero", to: { q: 1, r: 0 } }, DM));
  assert.equal(pos(s, horse), "1,0");
  assert.equal(pos(s, "hero"), "1,0");
  assert.equal(pos(s, s.foe), "0,0", "the creature the rider holds came along");
  assert.ok(s.entities[s.foe].cond.grappled);
});

test("a follower that holds a creature stays where it is when the column walks, and a note says so", () => {
  const s = field(fighter(STR16), { fight: false });
  s.entities.ally = makeEntity(derive(fighter(STR16)).record, { id: "ally", kind: "pc", side: "party", pos: { q: 1, r: -1, z: 0 } });
  s.entities.mate = makeEntity(derive(fighter(STR16)).record, { id: "mate", kind: "pc", side: "party", pos: { q: 0, r: -1, z: 0 } });
  ok(apply(s, { type: "follow", actor: "ally", leader: "hero" }, DM));
  ok(apply(s, { type: "follow", actor: "mate", leader: "hero" }, DM));
  hold(s, s.foe, "ally");
  const r = ok(apply(s, { type: "move", actor: "hero", to: { q: -4, r: 0 } }, DM));
  assert.deepEqual(s.entities.ally.pos, { q: 1, r: -1, z: 0 }, "the holder stayed");
  assert.deepEqual(s.entities[s.foe].cond.grappled.holds.map((x) => x.by), ["ally"], "with its hold");
  assert.ok(r.events.some((e) => e.type === "note" && e.id === "ally" && /is holding .* so it stays where it is while the party walks on/.test(e.text)));
  assert.ok(r.events.some((e) => e.type === "moved" && e.id === "mate"), "the others walked");
  assert.equal(s.entities.ally.follow, "hero", "it still follows");
});

test("the AI's approach goes through moveOptions, so a monster that holds a creature walks no further than the cost allows and drags it", () => {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(fighter(STR16)).record, { id: "hero", kind: "pc", side: "party", pos: { q: -6, r: 0, z: 0 } });
  const spawn = (monster, at) => { const id = ok(apply(s, { type: "spawn", monster, at }, DM)).events.find((e) => e.type === "spawned").id; Object.assign(s.entities[id], { hp: 500, maxHp: 500 }); return id; };
  const bug = spawn("bugbear-warrior", { q: 0, r: 0 }), gob = spawn("goblin-warrior", { q: 1, r: 0 });
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }, DM));
  s.entities[gob].hp = 0;                                                 // down: not a foe it fights, but still held
  hold(s, gob, bug);
  turnOf(s, bug);
  const speed = s.encounter.budget.move;
  const a = aiStep(s, bug);
  assert.equal(a.type, "move", JSON.stringify(a));
  const from = s.entities[bug].pos, cost = moveOptions(s, s.entities[bug]).get(`${a.to.q},${a.to.r}`).cost;
  assert.equal(cost, 10 * Math.abs(a.to.q - from.q), "10 ft a step: the AI saw the cost of dragging");
  assert.equal(a.to.q - from.q, -Math.floor(speed / 10), "it goes as far as the budget allows, toward the hero");
  ok(apply(s, a, DM));
  assert.ok(s.entities[gob].cond.grappled, "still held");
  assert.ok(s.entities[gob].pos.q < 1, "and dragged along");
});

test("a companion that holds a creature and has another foe beside it may step away, paying the cost; the creature it holds is no reason to", () => {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(fighter(STR16)).record, { id: "hero", kind: "pc", side: "party", pos: { q: -3, r: 0, z: 0 } });
  const spawn = (monster, at, more = {}) => { const id = ok(apply(s, { type: "spawn", monster, at }, DM)).events.find((e) => e.type === "spawned").id; Object.assign(s.entities[id], { hp: 500, maxHp: 500 }, more); return id; };
  const skel = spawn("skeleton", { q: 0, r: 0 }), held1 = spawn("goblin-warrior", { q: 1, r: 0 });
  ok(apply(s, { type: "bond", actor: skel, to: "hero", kind: "undead", orders: "command" }, DM));
  s.entities[skel].side = "party";
  ok(apply(s, { type: "condition", actor: held1, condition: "blinded" }, DM));
  hold(s, held1, skel);
  const other = spawn("goblin-warrior", { q: 0, r: 1 });
  ok(apply(s, { type: "condition", actor: other, condition: "blinded" }, DM));
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }, DM));
  turnOf(s, skel);
  ok(apply(s, { type: "dodge", actor: skel }, DM));
  const a = aiStep(s, skel);
  assert.ok(a && (a.type === "move" || a.type === "endTurn"), JSON.stringify(a));
  if (a.type === "move") {
    ok(apply(s, a, DM));
    assert.ok(s.entities[held1].cond.grappled, "its hold stays");
    const sk = s.entities[skel].pos, g = s.entities[held1].pos;
    assert.ok(Math.max(Math.abs(sk.q - g.q), Math.abs(sk.r - g.r), Math.abs(sk.q + sk.r - g.q - g.r)) <= 1, "and the held creature came along");
  }
});

// ---------- fix round 1 of #474 (review) ----------
test("a held creature on a 5 ft ledge: the steps it could not be pulled down from are not offered, and the AI is never sent a move that would be refused", () => {
  const ground = Object.fromEntries(H.range({ q: 0, r: 0 }, 8).map((h) => [H.col(h), { t: "grass" }]));
  const ledge = { "1,0": { t: "stone" }, "1,-1": { t: "stone" } };
  delete ground["1,0"]; delete ground["1,-1"];
  const s = newGame(7);
  ok(apply(s, { type: "loadMap", map: newMap({ id: "m", name: "m", starts: [{ q: 0, r: 0 }], levels: [{ id: "ground", name: "G", z: 0, tiles: ground }, { id: "ledge", name: "L", z: 5, tiles: ledge }] }) }, DM));
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(fighter(STR16)).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  const a = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0, z: 5 } }, DM)).events.find((e) => e.type === "spawned").id;
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM)); turnOf(s, "hero");
  hold(s, a);
  const offered = moveOptions(s, s.entities.hero), free = moveOptions(s, s.entities.hero, { unchecked: true });
  assert.equal(offered.has("-1,0"), false, "straight away from it: the goblin could not step down 5 ft, as a pull steps only 2.5");
  assert.ok(free.has("-1,0"), "(it is a place the grappler alone reaches)");
  for (const [k, v] of offered) {                                   // whatever is offered, the engine takes
    if (!v.canStop) continue;
    const c = structuredClone(s);
    const [q, r] = k.split(",").map(Number);
    const res = apply(c, { type: "move", actor: "hero", to: { q, r } }, DM);
    assert.ok(res.ok, `${k}: ${res.error}`);
  }
  refused(s, { type: "move", actor: "hero", to: { q: -1, r: 0 } }, /Fi can't drag Goblin Warrior \d+ that way\./);
});

test("a held creature the mover cannot see is dragged at the same cost, from the true state", () => {
  const s = field(fighter(STR16), { foes: 1 });
  hold(s, s.foe);
  s.entities[s.foe].hiding = { dc: 30 };                              // it took Hide: unseen by the party
  const o = s.entities.hero.pos;
  assert.equal(moveOptions(s, s.entities.hero).has(`${o.q - 6},${o.r}`), false);
  assert.equal(moveOptions(s, s.entities.hero).get(`${o.q - 3},${o.r}`).cost, 30);
  refused(s, { type: "move", actor: "hero", to: { q: o.q - 6, r: o.r } }, /Too far/);
  const r = ok(apply(s, { type: "move", actor: "hero", to: { q: o.q - 3, r: o.r } }, DM));
  assert.equal(s.encounter.budget.move, 0, "three steps of 10 ft");
  assert.equal(pos(s, s.foe), `${o.q - 2},${o.r}`);
  // What a player is sent of the hidden creature stays as it was: none of its movement.
  s.entities.hero.owner = "u1";
  const seen = viewEvents(r.events, s, { role: "player", userId: "u1" });
  assert.ok(!seen.some((e) => e.type === "moved" && e.id === s.foe), "the hidden creature's pulls are not sent");
});

test("a zone is not entered by a creature that was not pulled: two held that need the same cell are stopped before any effect", () => {
  const s = field(fighter(STR16), { foes: 1, keep: true, fight: false });
  const spawn = (at) => { const id = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at }, DM)).events.find((e) => e.type === "spawned").id; Object.assign(s.entities[id], { hp: 500, maxHp: 500, ac: 1 }); return id; };
  const b = spawn({ q: 1, r: -1 }); spawn({ q: 0, r: -1 }); spawn({ q: 0, r: 1 });
  Object.assign(s.entities.wizard, { slots: { 1: 4, 2: 3, 3: 3 }, slotsMax: { 1: 4, 2: 3, 3: 3 } });
  s.entities.wizard.spells.push("moonbeam");
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  turnOf(s, "wizard");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "moonbeam", hex: { q: -1, r: 0 } }, DM));
  turnOf(s, "hero");
  hold(s, s.foe); hold(s, b);
  const hp = s.entities[s.foe].hp, before = JSON.stringify(s);
  refused(s, { type: "move", actor: "hero", to: { q: -1, r: 0 } }, /can't drag/);
  assert.equal(JSON.stringify(s), before);
  assert.equal(s.entities[s.foe].hp, hp);
});

test("the AI is never sent into a no-op: a companion that holds two creatures behind a blocker ends its turn, and every move it sends changes something", () => {
  const s = field(fighter(STR16), { foes: 0, keep: true, fight: false });
  delete s.entities.hero;
  const spawn = (at, monster = "goblin-warrior") => { const id = ok(apply(s, { type: "spawn", monster, at }, DM)).events.find((e) => e.type === "spawned").id; Object.assign(s.entities[id], { hp: 500, maxHp: 500, ac: 1 }); return id; };
  const sk = spawn({ q: 0, r: 0 }, "skeleton");
  s.entities[sk].side = "party";
  ok(apply(s, { type: "bond", actor: sk, to: "wizard", kind: "undead", orders: "command" }, DM));
  const A = spawn({ q: 1, r: 0 }), B = spawn({ q: 1, r: -1 }), blk = spawn({ q: 0, r: -1 }), C = spawn({ q: 0, r: 1 });
  for (const x of [C, blk]) ok(apply(s, { type: "condition", actor: x, condition: "blinded" }, DM));
  hold(s, A, sk); hold(s, B, sk);
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  turnOf(s, sk);
  let ended = false;
  for (let i = 0; i < 8 && current(s) === sk; i++) {
    const a = aiStep(s, sk, {}), was = JSON.stringify(s.entities);
    assert.ok(a, "it has something to send");
    const r = apply(s, a, DM);
    assert.ok(r.ok, `${JSON.stringify(a)}: ${r.error}`);
    if (a.type === "endTurn") { ended = true; break; }
    assert.notEqual(JSON.stringify(s.entities), was, `${JSON.stringify(a)} changed nothing`);
  }
  assert.ok(ended || current(s) !== sk, "its turn ended");
});

test("a creature dragged onto a thing that goes off when stepped on is handed to the DM, as a teleport onto one is", () => {
  const s = field(fighter(STR16), { fight: false });
  hold(s, s.foe);
  s.map.objects.push({ id: "pit", def: "pit-trap", level: "ground", at: { q: 0, r: 0 }, state: "hidden" });
  s.settings.passiveFind = "off";
  const r = ok(apply(s, { type: "move", actor: "hero", to: { q: -2, r: 0 } }, DM));
  assert.ok(r.events.some((e) => e.type === "manual" && e.actor === s.foe && /was dragged onto/.test(e.text)), r.events.map((e) => e.type + (e.text ? ":" + e.text : "")).join("\n"));
});
