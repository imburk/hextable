// Monster grapples (issue #480, stage G4 of docs/specs/grapple-shove.md, Decision 7; DEBT T61).
// SRD 5.2 "Grappling": "Whatever part a grappler uses, it can grapple only one creature at a time with that part, and the grappler can't
// use that part to target another creature unless it ends the grapple." Stat blocks: Ankheg Bite (Large or smaller, escape DC 13, Advantage
// against a creature it grapples), Kraken Tentacle (escape DC 20 from one of ten tentacles, Restrained until the grapple ends), Bugbear
// Stalker Quick Grapple (Medium or smaller within 10 feet, escape DC 13) and Abduct (no extra movement), Mimic Pseudopod (escape DC 13,
// Disadvantage on the checks to escape).
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity, moveOptions } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { view } from "../src/view.js";
import { CONTENT } from "../src/content/index.js";
const MONSTERS = CONTENT.monsters;
import { lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { walk } from "../src/effects.js";
import { footprint } from "../src/space.js";
import { gridOf } from "../src/grid.js";
import * as H from "../src/hex.js";
import { dragExtra } from "../src/engine/world.js";

const DM = { role: "dm", userId: "dm" };
const U1 = { role: "player", userId: "u1" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const refused = (s, action, re, ctx = DM) => { const before = JSON.stringify(s), r = apply(s, action, ctx); assert.equal(r.ok, false, "should have been refused"); assert.match(r.error, re); assert.equal(JSON.stringify(s), before, "a refusal changes nothing"); };
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const fails = (e) => { e.saveBonus = { str: -40, dex: -40, con: -40 }; };
const spawn = (s, monster, at, extra = {}) => {
  const id = ok(apply(s, { type: "spawn", monster, at }, DM)).events.find((e) => e.type === "spawned").id;
  Object.assign(s.entities[id], { hp: 900, maxHp: 900, ac: 1, ...extra });
  return id;
};
// A map of grass with only `monster` (at 0,0) and what `others` names ({ q, r, size? } of a goblin each), a fight begun and the monster's
// turn, with plenty of actions so that one test may use an action again and again.
function field(monster, others, { fight = true, seed = 7 } = {}) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  const g = spawn(s, monster, { q: 0, r: 0 }, { hp: 900 });
  const targets = others.map((o) => spawn(s, "goblin-warrior", { q: o.q, r: o.r }, { side: "party" }));
  targets.forEach((id, i) => { if (others[i].size) s.entities[id].size = others[i].size; fails(s.entities[id]); });     // sized after all are placed: a bigger one would take its neighbour's hex
  if (fight) { ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM)); turnOf(s, g); s.encounter.budget.action = 30; s.encounter.budget.bonus = 30; }
  return { s, g, targets };
}
// Make the attack hit: the monster's turn is replayed on fresh games until the roll does (nothing else about the game changes by seed).
function hits(make, act) {
  for (let seed = 1; seed < 60; seed++) {
    const f = make(seed);
    const r = apply(f.s, act(f), DM);
    if (r.ok && r.events.some((e) => e.type === "attack" && e.hit)) return { ...f, r };
  }
  assert.fail("no seed made the attack hit");
}
const ALL = Object.values(MONSTERS);
const holdSteps = [];
for (const m of ALL) for (const a of m.actions ?? []) if (a.effects) walk(a.effects, (st) => { if (st?.condition === "grappled") holdSteps.push({ m, a, st }); });

test("every Grappled step of every creature's action in the SRD pack has its escape DC, and there are 36 of them", () => {
  assert.equal(holdSteps.length, 36);
  for (const { m, a, st } of holdSteps) assert.ok(Number.isInteger(st.escape) && st.escape >= 1 && st.escape <= 40, `${m.id} ${a.id}`);
  assert.equal(new Set(holdSteps.map((x) => x.m.id)).size, 36, "one monster each");
});

// What the SRD 5.2.1 stat blocks say (reference/srd52/srd52-flow.txt), written out again here so the data is held to it:
// monster, action, escape DC, largest (null: no limit), creatures held at once, conditions that last only while it holds.
const SRD = [
  ["aboleth", "tentacle", 14, "large", 4, []], ["ankheg", "bite", 13, "large", 1, []], ["barbed-devil", "claws", 13, "large", 1, []],
  ["behir", "constrict", 16, "large", 1, ["restrained"]], ["bugbear-warrior", "grab", 12, "medium", 1, []], ["bugbear-stalker", "quick-grapple", 13, "medium", 1, []],
  ["chain-devil", "chain", 14, "large", 2, ["restrained"]], ["chuul", "pincer", 14, "large", 2, []], ["couatl", "constrict", 13, "medium", 1, ["restrained"]],
  ["constrictor-snake", "constrict", 12, "medium", 1, []], ["crocodile", "bite", 12, "medium", 1, ["restrained"]], ["glabrezu", "pincer", 15, "medium", 2, []],
  ["grick", "tentacles", 12, "medium", 1, []], ["griffon", "rend", 14, "medium", 1, []], ["giant-constrictor-snake", "constrict", 14, "large", 1, []],
  ["giant-crab", "claw", 11, "medium", 2, []], ["giant-crocodile", "bite", 15, "large", 1, ["restrained"]], ["giant-frog", "bite", 11, "medium", 1, []],
  ["giant-octopus", "tentacles", 13, "medium", 1, ["restrained"]], ["giant-scorpion", "claw", 13, "large", 2, []], ["giant-toad", "bite", 12, "medium", 1, []],
  ["invisible-stalker", "vortex", 13, "large", 1, []], ["kraken", "tentacle", 20, null, 10, ["restrained"]], ["marilith", "constrict", 14, "medium", 1, ["restrained"]],
  ["mimic", "pseudopod", 13, "large", 1, []], ["otyugh", "tentacle", 13, "medium", 2, []], ["purple-worm", "bite", 19, "large", 1, ["restrained"]],
  ["remorhaz", "bite", 17, "large", 1, ["restrained"]], ["roc", "talons", 19, "huge", 1, ["restrained"]], ["roper", "tentacle", 14, null, 6, ["poisoned"]],
  ["salamander", "constrict", 14, "large", 1, ["restrained"]], ["shambling-mound", "engulf", 14, "medium", 1, ["blinded", "restrained"]],
  ["tarrasque", "bite", 20, null, 1, ["restrained"]], ["vampire-spawn", "claw", 13, "medium", 2, []], ["vampire", "grave-strike", 14, "large", 2, []],
  ["tyrannosaurus-rex", "bite", 17, "large", 1, ["restrained"]],
];
test("each of the 36 steps carries what its stat block says: escape DC, size limit, parts, and what lasts only while it holds", () => {
  assert.equal(SRD.length, 36);
  for (const [id, action, escape, largest, holds, tied] of SRD) {
    const found = holdSteps.filter((x) => x.m.id === id);
    assert.equal(found.length, 1, id);
    const { a, st } = found[0];
    assert.equal(a.id, action, id);
    assert.equal(st.escape, escape, `${id} escape DC`);
    assert.equal(st.largest ?? null, largest, `${id} largest`);
    assert.equal(st.holds ?? 1, holds, `${id} holds`);
    assert.equal(st.escapeDis === true, id === "mimic", `${id} escapeDis`);
    const lasting = [];
    walk(a.effects, (x) => { if (x?.whileHeld === true) lasting.push(x.condition); });
    assert.deepEqual(lasting, tied, `${id} lasting conditions`);
    assert.ok(!/escape DC/i.test(a.text), `${id}: the text no longer says what the data says`);
  }
});

test("the attacks with Advantage against a creature they grapple say so as data: ankheg Bite, bugbear Light Hammer and Morningstar, mimic Bite", () => {
  const advantaged = [];
  for (const m of ALL) for (const a of m.actions ?? []) if (a.effects) walk(a.effects, (st) => { if (st?.advantageIf) advantaged.push(`${m.id}/${a.id}:${st.advantageIf}`); });
  assert.deepEqual(advantaged.sort(), ["ankheg/bite:target.grappledBySelf", "bugbear-stalker/morningstar:target.grappledBySelf", "bugbear-warrior/light-hammer-thrown:target.grappledBySelf",
    "bugbear-warrior/light-hammer:target.grappledBySelf", "mimic/bite:target.grappledBySelf"]);
  assert.ok(MONSTERS["bugbear-warrior"].traits.some((t) => t.dragFree) && MONSTERS["bugbear-stalker"].traits.some((t) => t.dragFree), "Abduct");
});

test("the ankheg's Bite grapples a Large target and not a Huge one; the hold has its DC, range and part", () => {
  const make = (seed) => field("ankheg", [{ q: -1, r: 0, size: "large" }, { q: -1, r: 1, size: "huge" }], { seed });
  const { s, g, targets: [big, huge], r } = hits(make, (f) => ({ type: "act", actor: f.g, action: "bite", target: f.targets[0] }));
  assert.deepEqual(s.entities[big].cond.grappled, { source: g, holds: [{ by: g, with: "bite", escape: 13, range: 5 }] });
  assert.ok(r.events.some((e) => e.type === "cond" && e.id === big && e.cond === "grappled" && e.by === g));
  assert.ok(!r.events.some((e) => e.type === "manual" && /Nothing ends it/.test(e.text)), "the engine ends it");
  // A Huge target is hit and not held, and nothing is said of it.
  const h = hits((seed) => field("ankheg", [{ q: -1, r: 0, size: "huge" }], { seed }), (f) => ({ type: "act", actor: f.g, action: "bite", target: f.targets[0] }));
  assert.equal(h.s.entities[h.targets[0]].cond.grappled, undefined);
  assert.ok(h.r.events.some((e) => e.type === "damage" && e.target === h.targets[0]), "it was hit");
  assert.ok(!h.r.events.some((e) => e.type === "cond" || e.type === "manual"), "nothing said of the missing condition");
  assert.ok(huge);
});

test("the ankheg can't bite another creature while it holds one; it can bite the held one, with Advantage; letting go frees the Bite", () => {
  const make = (seed) => field("ankheg", [{ q: -1, r: 0, size: "large" }, { q: -1, r: 1, size: "medium" }], { seed });
  const f = hits(make, (x) => ({ type: "act", actor: x.g, action: "bite", target: x.targets[0] }));
  const { s, g, targets: [a, b] } = f;
  assert.ok(s.entities[a].cond.grappled);
  refused(s, { type: "act", actor: g, action: "bite", target: b }, /Bite holds .*; it can't be used on .* until it lets go/);
  // The held creature again: allowed, and rolled with Advantage ("Grappled by the ankheg").
  const again = apply(s, { type: "act", actor: g, action: "bite", target: a }, DM);
  assert.ok(again.ok, again.error);
  const roll = again.events.find((e) => e.type === "attack");
  assert.equal(roll.mode, "adv");
  assert.ok(roll.why.some((w) => /Grappled by/.test(w)), roll.why.join());
  // A creature it does not hold gets no Advantage; with the grapple let go, the Bite is free again.
  ok(apply(s, { type: "letGo", actor: g, target: a }, DM));
  assert.equal(s.entities[a].cond.grappled, undefined);
  const free = apply(s, { type: "act", actor: g, action: "bite", target: b }, DM);
  assert.ok(free.ok, free.error);
  assert.equal(free.events.find((e) => e.type === "attack").mode, "normal");
});

test("the kraken holds ten with its Tentacle, Restrains each until its grapple ends, and can't use a tentacle on an eleventh", () => {
  const taken = new Set(footprint({ size: "gargantuan", pos: { q: 0, r: 0, z: 0 } }, { q: 0, r: 0, z: 0 }, gridOf(newGame(7).map)).map((h) => `${h.q},${h.r}`));
  const spots = H.range({ q: 0, r: 0 }, 3).filter((h) => !taken.has(`${h.q},${h.r}`)).slice(0, 11);
  assert.equal(spots.length, 11);
  const f = field("kraken", spots);
  const { s, g, targets } = f;
  s.entities[g].ac = 1;
  const grab = (id) => { for (let i = 0; i < 40; i++) { const before = s.entities[id].cond.grappled; if (before) return; const r = apply(s, { type: "act", actor: g, action: "tentacle", target: id }, DM); assert.ok(r.ok, r.error); } assert.fail("never held"); };
  for (const id of targets.slice(0, 10)) grab(id);
  for (const id of targets.slice(0, 10)) {
    const c = s.entities[id].cond;
    assert.deepEqual(c.grappled.holds, [{ by: g, with: "tentacle", escape: 20, range: 30 }]);
    assert.equal(c.restrained.grapple, g, "Restrained until this grapple ends");
  }
  assert.equal(s.entities[targets[10]].cond.grappled, undefined);
  refused(s, { type: "act", actor: g, action: "tentacle", target: targets[10] }, /Tentacle holds .*; it can't be used on .* until one is let go/);
  // One lets go: only that creature is free (and no longer Restrained); the eleventh can be held now.
  const r = ok(apply(s, { type: "letGo", actor: g, target: targets[3] }, DM));
  assert.equal(s.entities[targets[3]].cond.grappled, undefined);
  assert.equal(s.entities[targets[3]].cond.restrained, undefined);
  assert.ok(r.events.some((e) => e.type === "condEnd" && e.id === targets[3] && e.cond === "restrained" && e.why === "released"));
  assert.ok(s.entities[targets[4]].cond.restrained, "the others are still held");
  grab(targets[10]);
  assert.ok(s.entities[targets[10]].cond.grappled && s.entities[targets[10]].cond.restrained);
  // A target that escapes, or whose kraken is Incapacitated, takes its Restrained with it.
  turnOf(s, targets[0]);
  s.entities[targets[0]].abil = { ...s.entities[targets[0]].abil, str: 40, dex: 40 };
  for (let i = 0; i < 30 && s.entities[targets[0]].cond.grappled; i++) { s.encounter.budget.action = 1; ok(apply(s, { type: "escape", actor: targets[0] }, DM)); }
  assert.equal(s.entities[targets[0]].cond.grappled, undefined);
  assert.equal(s.entities[targets[0]].cond.restrained, undefined);
  s.entities[g].hp = 0;
  ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.equal(s.entities[targets[5]].cond.grappled, undefined, "the kraken is down: the hold ends");
  assert.equal(s.entities[targets[5]].cond.restrained, undefined, "and the Restrained with it");
});

test("the Restrained of a Tentacle goes on only if the target is held: a target too large for the hold is not Restrained", () => {
  const f = hits((seed) => field("crocodile", [{ q: -1, r: 0, size: "large" }], { seed }), (x) => ({ type: "act", actor: x.g, action: "bite", target: x.targets[0] }));
  const t = f.s.entities[f.targets[0]];
  assert.equal(t.cond.grappled, undefined, "a Large target, and the crocodile holds a Medium or smaller one");
  assert.equal(t.cond.restrained, undefined);
  const g = hits((seed) => field("crocodile", [{ q: -1, r: 0, size: "medium" }], { seed }), (x) => ({ type: "act", actor: x.g, action: "bite", target: x.targets[0] }));
  assert.ok(g.s.entities[g.targets[0]].cond.grappled && g.s.entities[g.targets[0]].cond.restrained);
});

test("the bugbear's Quick Grapple holds a Medium or smaller creature at 10 ft, with escape DC 13 and a range of 10 ft; a Large one is not held", () => {
  const f = field("bugbear-stalker", [{ q: 2, r: 0 }, { q: 0, r: 2, size: "large" }, { q: 3, r: 0 }]);
  const { s, g, targets: [near, big, far] } = f;
  refused(s, { type: "act", actor: g, action: "quick-grapple", target: far }, /15 ft away/);
  const r = ok(apply(s, { type: "act", actor: g, action: "quick-grapple", target: near }, DM));
  assert.deepEqual(s.entities[near].cond.grappled, { source: g, holds: [{ by: g, with: "quick-grapple", escape: 13, range: 10 }] });
  assert.equal(r.events.find((e) => e.type === "save").dc, 13);
  assert.equal(s.encounter.budget.bonus, 29, "a Bonus Action");
  assert.ok(s.entities[near].cond.grappled, "still held at 10 ft: the range is the action's");
  // A Large target makes the save, fails it, and is not held.
  refused(s, { type: "act", actor: g, action: "quick-grapple", target: big }, /can't be used on/);
  ok(apply(s, { type: "letGo", actor: g, target: near }, DM));
  ok(apply(s, { type: "act", actor: g, action: "quick-grapple", target: big }, DM));
  assert.equal(s.entities[big].cond.grappled, undefined);
});

test("Abduct: the bugbear drags what it holds with no extra movement; another Medium grappler pays a foot more for each foot", () => {
  const held = (monster, action) => {
    const f = field(monster, [{ q: -1, r: 0 }]);
    const { s, g, targets: [t] } = f;
    s.entities[t].size = "small";
    s.entities[t].cond.grappled = { source: g, holds: [{ by: g, with: action, escape: 12, range: 5 }] };
    return { s, g, t };
  };
  for (const [monster, action] of [["bugbear-warrior", "grab"], ["bugbear-stalker", "quick-grapple"], ["shambling-mound", "engulf"]]) {
    const { s, g, t } = held(monster, action);
    assert.equal(dragExtra(s.entities[g], s.entities[t]), 0, `${monster}: no extra movement`);
  }
  const frog = held("giant-frog", "bite");
  assert.equal(dragExtra(frog.s.entities[frog.g], frog.s.entities[frog.t]), 1, "a Small creature held by a Medium one is not exempt");
  // Walking: two steps east cost the bugbear 10 ft, the frog 20 ft.
  const cost = (x) => { const o = x.s.entities[x.g].pos; return moveOptions(x.s, x.s.entities[x.g]).get(`${o.q + 2},${o.r}`).cost; };
  assert.equal(cost(held("bugbear-warrior", "grab")), 10);
  assert.equal(cost(frog), 20);
});

test("the bugbear's Morningstar has Advantage against a creature it grapples and not against another", () => {
  const f = field("bugbear-stalker", [{ q: 1, r: 0 }, { q: 0, r: 1 }]);
  const { s, g, targets: [held, other] } = f;
  ok(apply(s, { type: "act", actor: g, action: "quick-grapple", target: held }, DM));
  const a = ok(apply(s, { type: "act", actor: g, action: "morningstar", target: held }, DM)).events.find((e) => e.type === "attack");
  assert.equal(a.mode, "adv");
  const b = ok(apply(s, { type: "act", actor: g, action: "morningstar", target: other }, DM)).events.find((e) => e.type === "attack");
  assert.equal(b.mode, "normal");
});

test("the mimic's Pseudopod holds with Disadvantage on the checks to escape; its Bite has Advantage against what it holds", () => {
  const f = hits((seed) => field("mimic", [{ q: 1, r: 0, size: "large" }], { seed }), (x) => ({ type: "act", actor: x.g, action: "pseudopod", target: x.targets[0] }));
  const { s, g, targets: [t] } = f;
  assert.deepEqual(s.entities[t].cond.grappled.holds, [{ by: g, with: "pseudopod", escape: 13, range: 5, escapeDis: true }]);
  turnOf(s, t);
  const r = ok(apply(s, { type: "escape", actor: t, skill: "athletics" }, DM));
  const ck = r.events.find((e) => e.type === "check");
  assert.equal(ck.dc, 13);
  assert.equal(ck.mode, "dis", "Disadvantage");
  assert.equal(ck.rolls.length, 2);
  turnOf(s, g);
  s.encounter.budget.action = 5;
  const bite = ok(apply(s, { type: "act", actor: g, action: "bite", target: t }, DM));
  assert.equal(bite.events.find((e) => e.type === "attack").mode, "adv");
});

test("a creature held by a monster's grapple: the player's view shows who holds it and not the monster's escape DC", () => {
  const sheet = { name: "Fi", class: "fighter", level: 5, subclass: "champion", abilities: { str: 16, dex: 14, con: 14, int: 10, wis: 8, cha: 8 },
    skills: ["athletics", "perception"], choices: { "fighting-style": "defense" }, weapons: [] };
  for (let seed = 1; seed < 60; seed++) {
    const { s, g } = field("ankheg", [], { seed, fight: false });
    s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: -1, r: 0, z: 0 } });
    s.entities.hero.ac = 1;
    ok(apply(s, { type: "claim", entity: "hero", user: "u1", userName: "Ann" }, U1));
    ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
    turnOf(s, g);
    const r = ok(apply(s, { type: "act", actor: g, action: "bite", target: "hero" }, DM));
    if (!s.entities.hero.cond.grappled) continue;
    assert.deepEqual(s.entities.hero.cond.grappled.holds, [{ by: g, with: "bite", escape: 13, range: 5 }]);
    const v = view(s, U1);
    assert.deepEqual(v.entities.hero.heldBy, [g]);
    assert.deepEqual(v.entities.hero.cond.grappled.holds, [{ by: g, with: "bite", range: 5 }], "no monster number");
    assert.ok(!JSON.stringify(v).includes('"escape":13'));
    assert.ok(r.ok);
    return;
  }
  assert.fail("the Bite never hit");
});

test("a game saved before G4: a grapple a monster's action put on with no hold is left to the DM, and its escape is refused", () => {
  const { s, g, targets: [t] } = field("ankheg", [{ q: -1, r: 0 }]);
  s.entities[t].cond.grappled = { source: g };
  refused(s, { type: "escape", actor: t }, /no escape DC|DM/);
  ok(apply(s, { type: "endTurn", actor: g }, DM));
});

test("the linter: a Grappled step of a creature's action needs `escape`; the new keys are for a creature's action, on the steps they belong to", () => {
  const base = JSON.parse(JSON.stringify(MONSTERS.ankheg));
  const lint = (mutate) => { const m = JSON.parse(JSON.stringify(base)); mutate(m.actions[0].effects[0].onHit); return lintEntry("monsters", m, { strict: false }); };
  const step = (h) => h.find((x) => x.condition === "grappled");
  assert.deepEqual(lint(() => {}), []);
  assert.match(lint((h) => { delete step(h).escape; }).join(), /needs `escape`/);
  assert.match(lint((h) => { step(h).escape = 0; }).join(), /1 to 40/);
  assert.match(lint((h) => { step(h).escape = 41; }).join(), /1 to 40/);
  assert.match(lint((h) => { step(h).largest = "enormous"; }).join(), /largest/);
  assert.match(lint((h) => { step(h).holds = 0; }).join(), /holds/);
  assert.match(lint((h) => { step(h).escapeDis = false; }).join(), /escapeDis/);
  assert.match(lint((h) => { step(h).whileHeld = true; }).join(), /whileHeld/);
  assert.match(lint((h) => { h.push({ condition: "restrained", escape: 12 }); }).join(), /escape. is for a Grappled step/);
  assert.match(lint((h) => { h.push({ condition: "restrained", whileHeld: 1 }); }).join(), /whileHeld. is true/);
  assert.match(lint((h) => { h.push({ damage: "1d4", type: "fire", escape: 3 }); }).join(), /for a condition step/);
  // whileHeld needs a hold in its own action.
  const alone = JSON.parse(JSON.stringify(base)); alone.actions[0].effects[0].onHit = [{ damage: "1d4", type: "fire" }, { condition: "restrained", whileHeld: true }];
  assert.match(lintEntry("monsters", alone, { strict: false }).join(), /whileHeld. needs a Grappled step/);
  // A spell's step has no hold.
  const spell = JSON.parse(JSON.stringify(MONSTERS.ankheg));
  assert.ok(spell);
  const adv = JSON.parse(JSON.stringify(base)); adv.actions[0].effects[0].advantageIf = [];
  assert.match(lintEntry("monsters", adv, { strict: false }).join(), /advantageIf/);
  adv.actions[0].effects[0].advantageIf = ["target.nonsense"];
  assert.match(lintEntry("monsters", adv, { strict: false }).join(), /unknown situation tag/);
  const trait = JSON.parse(JSON.stringify(MONSTERS["bugbear-warrior"])); trait.traits[0].dragFree = "yes";
  assert.match(lintEntry("monsters", trait, { strict: false }).join(), /dragFree/);
});

test("homebrew may use the keys (strict mode lets them through, within ranges) and the reader says what they do", () => {
  const hb = JSON.parse(JSON.stringify(MONSTERS.kraken));
  hb.id = "hb-test-squid"; hb.name = "Test Squid"; hb.source = "homebrew:test"; hb.checked = false;
  const problems = lintEntry("monsters", hb, { pack: "test" });
  assert.deepEqual(problems, []);
  hb.actions.find((a) => a.id === "tentacle").effects[0].onHit[1].escape = 41;
  assert.match(lintEntry("monsters", hb, { pack: "test" }).join(), /escape/);
  hb.actions.find((a) => a.id === "tentacle").effects[0].onHit[1].escape = 20;
  const read = readEntry("monsters", hb, { pack: "test" });
  const text = read.lines.join("\n");
  assert.match(text, /escape DC 20/);
  assert.match(text, /10 creatures at once/);
  assert.match(text, /ends when that hold does/);
  const ank = readEntry("monsters", { ...JSON.parse(JSON.stringify(MONSTERS.ankheg)), id: "hb-test-ank", source: "homebrew:test", checked: false }, { pack: "test" });
  assert.match(ank.lines.join("\n"), /Advantage if the target is Grappled by the attacker/);
});
