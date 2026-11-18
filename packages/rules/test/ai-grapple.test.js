// The AI and holds (issue #482, stage G5 of docs/specs/grapple-shove.md, Decision 8; DEBT T61, T74).
// SRD 5.2 "Grappling": a held creature uses its action for a Strength (Athletics) or Dexterity (Acrobatics) check against the escape DC
// to end the grapple; the grappler may release at any time; "Grappled": Speed 0, and the grappler drags it at 1 extra foot for each foot.
// The monster AI (ai.js) learns only what the engine would otherwise refuse or waste: it escapes when it is held and has nothing to
// hit, it is not offered a part that is full, it never lets go, and its walk goes through the cost of dragging.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { aiStep } from "../src/ai.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const fighter = { name: "Fi", class: "fighter", level: 5, subclass: "champion", abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 8, cha: 8 },
  skills: ["athletics", "perception"], choices: { "fighting-style": "defense" }, weapons: [] };

// A grass map with a hero (a built fighter, party) at `hero`, `mons` ({ id, monster, q, r, side? }) spawned, a fight begun and `turn` the creature
// whose turn it is. Every creature has plenty of Hit Points and Armor Class 1.
function field(hero, mons, turn) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(fighter).record, { id: "hero", kind: "pc", side: "party", pos: { q: hero.q, r: hero.r, z: 0 } });
  Object.assign(s.entities.hero, { hp: 500, maxHp: 500, ac: 1 });
  const ids = {};
  for (const m of mons) {
    const id = ok(apply(s, { type: "spawn", monster: m.monster, at: { q: m.q, r: m.r } }, DM)).events.find((e) => e.type === "spawned").id;
    Object.assign(s.entities[id], { hp: 500, maxHp: 500, ac: 1, ...(m.side ? { side: m.side } : {}) });
    ids[m.id] = id;
  }
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }, DM));
  turnOf(s, turn === "hero" ? "hero" : ids[turn]);
  return { s, ids };
}
// A hold put on directly, so the test does not depend on a save.
const hold = (s, id, by, extra = {}) => { const c = s.entities[id].cond; (c.grappled ??= { source: by, holds: [] }).holds.push({ by, with: "hand", escape: 14, range: 5, ...extra }); };
// What the AI does for `id` over one whole turn, each action sent through apply() as the DM's auto-play does; the list of what it sent.
function turn(s, id) {
  const sent = [];
  for (let i = 0; i < 12; i++) {
    const a = aiStep(s, id);
    if (!a) break;
    sent.push(a);
    if (!apply(s, a, DM).ok || a.type === "endTurn") break;
  }
  return sent;
}

test("a held monster with nothing in reach takes the Escape action, from the hold with the lowest escape DC", () => {
  // A zombie has only a melee Slam (reach 5); the hero holds it from 10 feet (a hold's range may be more than 5).
  const { s, ids } = field({ q: 2, r: 0 }, [{ id: "z", monster: "zombie", q: 0, r: 0, side: "enemy" }], "z");
  hold(s, ids.z, "hero", { range: 10, escape: 18 });
  const a = aiStep(s, ids.z);
  assert.deepEqual(a, { type: "escape", actor: ids.z, from: "hero" });
  const r = ok(apply(s, a, DM));
  assert.ok(r.events.some((e) => e.type === "check" && e.escape === "hero"), "it made the escape check");
  assert.equal(s.encounter.budget.action, 0, "and it cost the action");

  // Two holds: the easier one.
  const t = field({ q: 2, r: 0 }, [{ id: "z", monster: "zombie", q: 0, r: 0, side: "enemy" }, { id: "w", monster: "zombie", q: -2, r: 0, side: "party" }], "z");
  hold(t.s, t.ids.z, "hero", { range: 10, escape: 18 });
  hold(t.s, t.ids.z, t.ids.w, { range: 10, escape: 11 });
  assert.deepEqual(aiStep(t.s, t.ids.z), { type: "escape", actor: t.ids.z, from: t.ids.w });
});

test("a held monster that can hit a foe from where it stands fights as it did, and so does one whose hold has no escape DC in the game", () => {
  const near = field({ q: 1, r: 0 }, [{ id: "z", monster: "zombie", q: 0, r: 0, side: "enemy" }], "z");
  hold(near.s, near.ids.z, "hero");
  const a = aiStep(near.s, near.ids.z);
  assert.equal(a.type, "act", "the Slam reaches the one that holds it");
  // The DM's grapple: a Grappled condition with no holds. The engine cannot end it, so the AI does not try.
  const dm = field({ q: 2, r: 0 }, [{ id: "z", monster: "zombie", q: 0, r: 0, side: "enemy" }], "z");
  dm.s.entities[dm.ids.z].cond.grappled = { source: "hero" };
  assert.notEqual(aiStep(dm.s, dm.ids.z).type, "escape");
  // Speed 0 and nothing to hit: it ends its turn rather than be refused.
  assert.ok(["endTurn", "dash"].includes(aiStep(dm.s, dm.ids.z).type));
});

test("a monster that holds a creature never lets it go, over a whole turn", () => {
  const { s, ids } = field({ q: 2, r: 0 }, [{ id: "g", monster: "ankheg", q: 0, r: 0, side: "enemy" }], "g");
  s.entities.hero.size = "large";
  s.entities.hero.cond.grappled = { source: ids.g, holds: [{ by: ids.g, with: "bite", escape: 13, range: 5 }] };
  const sent = turn(s, ids.g);
  assert.ok(sent.length > 0);
  assert.ok(!sent.some((a) => a.type === "letGo" || a.type === "release"), JSON.stringify(sent));
  assert.ok(s.entities.hero.cond.grappled, "still held");
});

test("a Bite that is full is not offered against another creature: the monster bites the one it holds", () => {
  const { s, ids } = field({ q: 2, r: 0 }, [{ id: "g", monster: "ankheg", q: 0, r: 0, side: "enemy" }, { id: "o", monster: "goblin-warrior", q: -2, r: 0, side: "party" }], "g");
  s.entities.hero.size = "large";
  s.entities[ids.o].hp = 1;                                                   // the most hurt, and as near: it would be the pick
  s.entities.hero.cond.grappled = { source: ids.g, holds: [{ by: ids.g, with: "bite", escape: 13, range: 5 }] };
  let bites = 0;
  for (let i = 0; i < 6 && current(s) === ids.g; i++) {
    const a = aiStep(s, ids.g);
    if (a.type === "endTurn") break;
    if (a.type === "act" && a.action === "bite") { bites++; assert.equal(a.target, "hero", "never the other creature"); }
    if (!apply(s, a, DM).ok) break;
  }
  assert.ok(bites > 0, "it did bite");
});

test("a monster that holds a creature drags it when it walks: the AI's move pays the extra foot and the creature comes along", () => {
  // A giant frog (no Abduct) holds the goblin from 10 feet; its Bite reaches only 5, so it walks in toward the hero it cannot yet bite.
  const { s, ids } = field({ q: -6, r: 0 }, [{ id: "g", monster: "giant-frog", q: 0, r: 0, side: "enemy" }, { id: "o", monster: "goblin-warrior", q: 1, r: 0, side: "party" }], "g");
  hold(s, ids.o, ids.g, { range: 5 });
  s.entities[ids.o].hp = 0;
  const speed = s.encounter.budget.move, a = aiStep(s, ids.g);
  assert.equal(a.type, "move");
  const from = s.entities[ids.g].pos;
  ok(apply(s, a, DM));
  const walked = Math.abs(a.to.q - from.q);
  assert.equal(walked, Math.floor(speed / 10), "10 ft a step: it knew the cost");
  assert.ok(s.entities[ids.o].cond.grappled, "still held");
  assert.ok(s.entities[ids.o].pos.q < 1, "and dragged");
});

test("the AI never grapples or shoves with an Unarmed Strike: a creature with flat attack records only punches, as before", () => {
  const { s } = field({ q: 1, r: 0 }, [{ id: "g", monster: "goblin-warrior", q: 0, r: 0, side: "enemy" }], "g");
  for (const a of turn(s, Object.keys(s.entities).find((k) => k !== "hero"))) assert.ok(a.option === undefined && a.grab === undefined && a.shove === undefined, JSON.stringify(a));
});
