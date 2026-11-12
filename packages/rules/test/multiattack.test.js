// Monsters play from their actions (`act`), Multiattack, Extra Attack, and the AI that uses them.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import { CONTENT, MONSTERS, PACKS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";
import { apply, current, inFight } from "../src/engine.js";
import * as H from "../src/hex.js";
import { migrate, VERSION } from "../src/migrate.js";
import { newGame } from "../src/scenario.js";
import { footprint } from "../src/space.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PLAYER = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const clone = (x) => structuredClone(x);

// The heroes alone on a flat field, the goblins gone.
function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  return s;
}
const put = (s, id, q, r) => ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
const spawn = (s, monster, q, r) => s.entities[ok(apply(s, { type: "spawn", monster, at: { q, r } }, DM)).events[0].id];
const fight = (s, at = { q: 0, r: 0 }) => ok(apply(s, { type: "startEncounter", center: at, radius: 8 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 20 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
// Hexes beside a creature, whatever its size, nearest the first part of it first.
const beside = (s, e) => {
  const body = footprint(e, e.pos), taken = (h) => Object.values(s.entities).some((o) => footprint(o, o.pos).some((f) => H.col(f) === H.col(h)));
  return body.flatMap((f) => H.neighbors(f)).filter((h, i, all) => !taken(h) && all.findIndex((x) => H.col(x) === H.col(h)) === i);
};
const putBeside = (s, id, e, n = 0) => { const h = beside(s, e)[n]; put(s, id, h.q, h.r); };
const tough = (s) => { for (const e of Object.values(s.entities)) e.hp = e.maxHp = 500; };
// Run the AI for one creature's turn; every step must be accepted. Returns the events.
function aiTurn(s, id) {
  const all = [];
  for (let i = 0; i < 40 && current(s) === id; i++) {
    const a = aiStep(s, id);
    if (!a) break;
    const r = apply(s, a, DM);
    assert.ok(r.ok, `${JSON.stringify(a)}: ${r.error}`);
    all.push(...r.events);
    if (a.type === "endTurn") break;
  }
  return all;
}

test("a creature made from a pack monster carries its actions; the flat summary stays as it was", () => {
  const s = field(), troll = spawn(s, "troll", 3, 0);
  assert.deepEqual(troll.actions.map((a) => a.id), ["multiattack", "rend"]);
  assert.deepEqual(troll.actions[0].multiattack, [{ action: "rend", times: 3 }]);
  assert.equal("text" in troll.actions[1], false);                   // the text stays in the pack
  troll.actions[1].effects[0].bonus = 99;                             // its own copy
  assert.equal(CONTENT.monsters.troll.actions[1].effects[0].bonus, 7);
  assert.deepEqual(MONSTERS.troll.attacks.map((a) => a.id), ["rend"]);
});

test("Multiattack spends the action once and gives every attack it lists, which can go to two targets", () => {
  const s = field(); tough(s);
  const troll = spawn(s, "troll", 0, 0); tough(s);
  putBeside(s, "fighter", troll); putBeside(s, "rogue", troll, 3);
  fight(s); turnOf(s, troll.id);
  ok(apply(s, { type: "act", actor: troll.id, action: "multiattack" }, DM));
  assert.equal(s.encounter.budget.action, 0);
  assert.deepEqual(s.encounter.budget.attacks, [[{ action: "rend", left: 3 }]]);
  const targets = [];
  for (const t of ["fighter", "rogue", "fighter"]) {
    const r = ok(apply(s, { type: "act", actor: troll.id, action: "rend", target: t }, DM));
    targets.push(r.events.find((e) => e.type === "attack").target);
  }
  assert.deepEqual(targets, ["fighter", "rogue", "fighter"]);
  assert.equal(s.encounter.budget.attacks, undefined);
  const fourth = apply(s, { type: "act", actor: troll.id, action: "rend", target: "fighter" }, DM);
  assert.equal(fourth.ok, false);
  assert.match(fourth.error, /already used an action/);
  // The old `attack` action with an attack id still works and is the same action.
  ok(apply(s, { type: "endTurn", actor: troll.id }, DM));
  turnOf(s, troll.id);
  const r = ok(apply(s, { type: "attack", actor: troll.id, target: "fighter", attack: "rend" }, DM));
  assert.equal(r.events.find((e) => e.type === "attack").name, "Rend");
  assert.equal(s.encounter.budget.action, 0);
});

test("a creature can move between the attacks of a Multiattack, and what it does not make is lost at the end of its turn", () => {
  const s = field(); tough(s);
  const bear = spawn(s, "brown-bear", 0, 0); tough(s);
  putBeside(s, "fighter", bear); put(s, "rogue", -3, 0);
  fight(s); turnOf(s, bear.id);
  ok(apply(s, { type: "act", actor: bear.id, action: "multiattack" }, DM));
  ok(apply(s, { type: "act", actor: bear.id, action: "bite", target: "fighter" }, DM));
  // Bite is spent: only the Claw is left.
  assert.equal(apply(s, { type: "act", actor: bear.id, action: "bite", target: "fighter" }, DM).ok, false);
  ok(apply(s, { type: "move", actor: bear.id, to: { q: -2, r: 0 } }, DM));
  const r = ok(apply(s, { type: "act", actor: bear.id, action: "claw", target: "rogue" }, DM));
  assert.equal(r.events.find((e) => e.type === "attack").target, "rogue");
  // Next turn: nothing carried over.
  assert.equal(apply(s, { type: "act", actor: bear.id, action: "multiattack" }, DM).ok, false, "a second Multiattack in one turn");
  ok(apply(s, { type: "endTurn", actor: bear.id }, DM));
  turnOf(s, bear.id);
  assert.equal(s.encounter.budget.attacks, undefined);
  ok(apply(s, { type: "act", actor: bear.id, action: "multiattack" }, DM));
  ok(apply(s, { type: "act", actor: bear.id, action: "claw", target: "rogue" }, DM));
  ok(apply(s, { type: "endTurn", actor: bear.id }, DM));
  turnOf(s, bear.id);
  assert.equal(s.encounter.budget.attacks, undefined, "the unmade Bite did not carry over");
  ok(apply(s, { type: "act", actor: bear.id, action: "bite", target: "rogue" }, DM));
  assert.equal(apply(s, { type: "act", actor: bear.id, action: "claw", target: "rogue" }, DM).ok, false, "a lone attack spends the action");
});

test("alternatives: each attack narrows which of them is being made", () => {
  const s = field(); tough(s);
  const wolf = spawn(s, "werewolf", 0, 0); tough(s);
  put(s, "fighter", 1, 0);
  fight(s); turnOf(s, wolf.id);
  ok(apply(s, { type: "act", actor: wolf.id, action: "multiattack" }, DM));
  ok(apply(s, { type: "act", actor: wolf.id, action: "bite", target: "fighter" }, DM));
  // Having bitten, only one Scratch or Longbow is left, and no second Bite.
  assert.equal(apply(s, { type: "act", actor: wolf.id, action: "bite", target: "fighter" }, DM).ok, false);
  ok(apply(s, { type: "act", actor: wolf.id, action: "scratch", target: "fighter" }, DM));
  assert.equal(s.encounter.budget.attacks, undefined);
});

test("an attack with two kinds of damage rolls both", () => {
  const s = field(); tough(s);
  const dragon = spawn(s, "red-dragon-wyrmling", 0, 0); tough(s);
  put(s, "fighter", 1, 0);
  s.entities.fighter.ac = 1;                                          // so that it hits
  fight(s); turnOf(s, dragon.id);
  const r = ok(apply(s, { type: "act", actor: dragon.id, action: "rend", target: "fighter" }, DM));
  const hit = r.events.find((e) => e.type === "attack");
  assert.ok(hit.hit, "a natural 1 misses; pick another seed if this fails");
  assert.deepEqual(r.events.filter((e) => e.type === "damage").map((e) => e.dtype), ["slashing", "fire"]);
});

test("the AI breathes on a cluster: each makes the save, and a success takes half of the one roll", () => {
  const s = field(); tough(s);
  const dragon = spawn(s, "red-dragon-wyrmling", 0, 0); tough(s);
  put(s, "fighter", 2, 0); put(s, "rogue", 2, -1); put(s, "cleric", 3, -1); put(s, "wizard", -8, 6);
  fight(s); turnOf(s, dragon.id);
  const a = aiStep(s, dragon.id);
  assert.equal(a.type, "act");
  assert.equal(a.action, "fire-breath");
  const r = ok(apply(s, a, DM));
  const act = r.events.find((e) => e.type === "act");
  assert.equal(act.name, "Fire Breath");
  const saves = r.events.filter((e) => e.type === "save");
  assert.ok(saves.length >= 2);
  for (const sv of saves) assert.deepEqual([sv.abil, sv.dc], ["dex", 13]);
  const dmg = Object.fromEntries(r.events.filter((e) => e.type === "damage").map((e) => [e.target, e.amount]));
  const failed = saves.filter((x) => !x.success).map((x) => dmg[x.id]), passed = saves.filter((x) => x.success).map((x) => dmg[x.id]);
  const full = failed[0] ?? null;
  for (const n of failed) assert.equal(n, full, "everyone who fails takes the same roll");
  if (full !== null) for (const n of passed) assert.equal(n, Math.floor(full / 2));
  else for (const n of passed) assert.equal(n, passed[0]);
  assert.ok(failed.length + passed.length === saves.length);
});

test("the AI makes every attack of a Multiattack in one turn, walking in first", () => {
  const s = field(); tough(s);
  const troll = spawn(s, "troll", 0, 0); tough(s);
  put(s, "fighter", 5, 0); put(s, "rogue", -8, 6); put(s, "cleric", -8, 5); put(s, "wizard", -7, 6);
  fight(s, { q: 2, r: 0 }); turnOf(s, troll.id);
  const ev = aiTurn(s, troll.id);
  assert.ok(ev.some((e) => e.type === "moved" && e.id === troll.id), "it walked in");
  assert.equal(ev.filter((e) => e.type === "attack" && e.actor === troll.id).length, 3);
});

test("a monster with a Multiattack never gets stuck: every one with a Multiattack plays three whole turns", () => {
  const withMulti = PACKS[0].monsters.filter((m) => m.actions.some((a) => a.multiattack)).map((m) => m.id);
  assert.ok(withMulti.length >= 140, `${withMulti.length}`);
  for (const id of withMulti) {
    const s = field(7);
    let m = null;
    for (const [q, r] of [[2, 0], [3, 0], [4, -1], [5, 0], [-4, 3]]) { const res = apply(s, { type: "spawn", monster: id, at: { q, r } }, DM); if (res.ok) { m = s.entities[res.events[0].id]; break; } }
    assert.ok(m, id);
    for (const p of ["fighter", "rogue", "cleric", "wizard"]) s.entities[p].hp = s.entities[p].maxHp = 400;
    fight(s, m.pos);
    for (let round = 0; round < 3 && s.encounter; round++) {
      turnOf(s, m.id);
      aiTurn(s, m.id);
      if (s.encounter && current(s) === m.id) ok(apply(s, { type: "endTurn", actor: m.id }, DM));
    }
  }
});

test("Extra Attack: a level 5 fighter attacks twice with the Attack action, and not a third time", () => {
  const s = field();
  const record = { ...clone(Object.fromEntries(Object.entries(s.entities.fighter).filter(([k]) => ["name", "cls", "ac", "hp", "speed", "prof", "abil", "saveProf", "attacks"].includes(k)))),
    level: 5, prof: 3, features: { extraAttack: 1 } };
  const id = ok(apply(s, { type: "addCharacter", record, at: { q: 0, r: 0 } }, DM)).events[0].id;
  const goblin = spawn(s, "goblin-warrior", 1, 0); tough(s);
  put(s, id, 0, 0);
  fight(s); turnOf(s, id);
  ok(apply(s, { type: "attack", actor: id, target: goblin.id, attack: "longsword" }, DM));
  assert.equal(s.encounter.budget.action, 0);
  ok(apply(s, { type: "attack", actor: id, target: goblin.id, attack: "javelin" }, DM));
  const third = apply(s, { type: "attack", actor: id, target: goblin.id, attack: "longsword" }, DM);
  assert.equal(third.ok, false);
  // The second attack is not carried into the next turn.
  ok(apply(s, { type: "endTurn", actor: id }, DM));
  turnOf(s, id);
  assert.equal(s.encounter.budget.attacks, undefined);
  // The level 1 fighter has no Extra Attack.
  turnOf(s, "fighter");
  put(s, "fighter", 1, -1);
  ok(apply(s, { type: "attack", actor: "fighter", target: goblin.id, attack: "longsword" }, DM));
  assert.equal(apply(s, { type: "attack", actor: "fighter", target: goblin.id, attack: "longsword" }, DM).ok, false);
});

test("Extra Attack is a feature a typed-in record may have, from 1 to 3", async () => {
  const { lintRecord } = await import("../src/content/schema.js");
  const base = { name: "Vex", level: 11, ac: 18, hp: 90, speed: 30, prof: 4, abil: { str: 18, dex: 12, con: 16, int: 10, wis: 12, cha: 8 } };
  assert.deepEqual(lintRecord({ ...base, features: { extraAttack: 2 } }), []);
  assert.match(lintRecord({ ...base, features: { extraAttack: 4 } }).join(), /features can be/);
  assert.match(lintRecord({ ...base, features: { extraAttack: "two" } }).join(), /features can be/);
});

test("Sneak Attack stays once a turn with two attacks", () => {
  const s = field();
  const rogue = s.entities.rogue;
  rogue.features.extraAttack = 1;
  rogue.attacks[0].bonus = 40;                                        // always hits unless a 1
  const goblin = spawn(s, "goblin-warrior", 1, 0); tough(s);
  put(s, "rogue", 0, 0); put(s, "fighter", 2, -1);                    // an ally beside the goblin
  fight(s); turnOf(s, "rogue");
  const notes = [];
  for (let i = 0; i < 2; i++) notes.push(...ok(apply(s, { type: "attack", actor: "rogue", target: goblin.id, attack: "shortsword" }, DM)).events.filter((e) => e.type === "note"));
  assert.ok(notes.filter((n) => /Sneak Attack/.test(n.text)).length <= 1);
});

test("an Opportunity Attack is made with the first melee attack action", () => {
  const s = field(); tough(s);
  const troll = spawn(s, "troll", 0, 0); tough(s);
  put(s, "fighter", 2, 0);
  fight(s); turnOf(s, "fighter");
  const r = ok(apply(s, { type: "move", actor: "fighter", to: { q: 5, r: 0 } }, DM));
  const oa = r.events.find((e) => e.type === "attack" && e.opportunity);
  assert.ok(oa);
  assert.deepEqual([oa.actor, oa.name], [troll.id, "Rend"]);
  assert.equal(s.entities[troll.id].reactionUsed, true);
});

test("an old saved table loads, its goblins get their actions, and they can still attack", () => {
  const saved = JSON.parse(readFileSync(new URL("./fixtures/table-v1.json", import.meta.url), "utf8")).state;
  migrate(saved);
  assert.equal(saved.version, VERSION);
  assert.equal(VERSION, 12);
  const goblins = Object.values(saved.entities).filter((e) => e.tpl === "goblin-warrior");
  assert.ok(goblins.length > 0);
  for (const g of goblins) assert.deepEqual(g.actions.map((a) => a.id), ["scimitar", "shortbow"]);
  const once = JSON.stringify(saved);
  assert.equal(JSON.stringify(migrate(saved)), once);
  const g = goblins.find((x) => x.hp > 0 && !x.dead), wiz = saved.entities.wizard;
  saved.settings.autoEngage = false;
  ok(apply(saved, { type: "place", actor: g.id, to: H.neighbors(wiz.pos).find((h) => !Object.values(saved.entities).some((e) => H.col(e.pos) === H.col(h)) && saved.map.levels[0].tiles[H.col(h)]) }, DM));
  if (!saved.encounter) fight(saved, wiz.pos);
  turnOf(saved, g.id);
  const r = ok(apply(saved, { type: "attack", actor: g.id, target: "wizard", attack: "scimitar" }, DM));
  assert.ok(r.events.some((e) => e.type === "attack" && e.actor === g.id && e.name === "Scimitar"));
});

test("a creature saved without a template keeps playing from its flat attacks", () => {
  const s = field(); tough(s);
  const g = spawn(s, "goblin-warrior", 1, 0); tough(s);
  delete g.actions; g.tpl = "nothing-like-it";
  put(s, "fighter", 0, 0);
  fight(s); turnOf(s, g.id);
  const ev = aiTurn(s, g.id);
  assert.ok(ev.some((e) => e.type === "attack" && e.actor === g.id));
});

test("players are never sent a monster's actions, bonuses, DCs or what it does by hand", () => {
  const s = newGame(3);
  const goblin = s.entities.m1;
  goblin.actions.push({ id: "canary", name: "Canary Spit", target: { creature: { reach: 5 } },
    effects: [{ save: "con", dc: 77, onFail: [{ damage: "1d4", type: "poison" }, { manual: "SECRET-STEP the DM reads this" }] }] });
  goblin.actions[0].effects[0].bonus = 61;
  goblin.actions.unshift({ id: "multiattack", name: "Multiattack", multiattack: [{ action: "scimitar", times: 1 }, { action: "canary", times: 1 }] });
  for (const e of Object.values(s.entities)) e.hp = e.maxHp = 300;
  ok(apply(s, { type: "startEncounter", center: goblin.pos, radius: 30 }, DM));
  const sent = [];
  for (let i = 0; i < 600 && s.encounter; i++) {
    const id = current(s);
    let a = aiStep(s, id) ?? { type: "endTurn", actor: id };
    // Walk the goblin to the fighter and use the canary by hand once it is in reach.
    if (id === "m1" && s.encounter.budget.attacks && Object.values(s.entities).some((x) => x.side === "party" && H.dist(x.pos, goblin.pos) <= 1)) {
      const t = Object.values(s.entities).find((x) => x.side === "party" && H.dist(x.pos, goblin.pos) <= 1);
      a = { type: "act", actor: "m1", action: "canary", target: t.id };
    }
    let r = apply(s, a, DM);
    if (!r.ok) r = apply(s, { type: "endTurn", actor: id }, DM);
    const shown = viewEvents(r.events, s, PLAYER);
    // A hero's own saving throw shows its DC, as it always has; nothing else may.
    for (const e of shown) if (JSON.stringify(e).includes('"dc":77')) assert.ok(e.type === "save" && s.entities[e.id].side === "party", JSON.stringify(e));
    sent.push(JSON.stringify(shown.filter((e) => e.type !== "save" || s.entities[e.id].side !== "party")), JSON.stringify(view(s, PLAYER)));
    if (s.timeline.filter((e) => e.type === "save" && e.dc === 77).length >= 2) break;
  }
  const dm = JSON.stringify(s.timeline);
  assert.ok(dm.includes('"dc":77') && dm.includes("SECRET-STEP") && dm.includes('"total"'), "the canary was used, so the check below means something");
  const text = sent.join("\n");
  assert.equal(text.includes('"actions"'), false);
  assert.equal(text.includes("multiattack"), false);
  assert.equal(text.includes('"bonus":61'), false);
  assert.equal(text.includes('"dc":77'), false);
  assert.equal(text.includes("SECRET-STEP"), false);
  assert.equal(text.includes('"attacks":[['), false, "attacks left this turn are the monster's business");
  // What players do see: that it used Canary Spit, and the save their hero made.
  assert.ok(text.includes("Canary Spit"));
});

test("the vocabulary: a multiattack names this creature's own actions, a recharge is [min, 6], uses are per day", () => {
  const troll = clone(CONTENT.monsters.troll);
  const lint = (m) => lintPack({ pack: PACKS[0].pack, monsters: [m] }).join(" | ");
  assert.equal(lint(troll), "");
  const bad = (change) => { const m = clone(troll); change(m); return lint(m); };
  assert.match(bad((m) => { m.actions[0].multiattack = [{ action: "bite", times: 2 }]; }), /not one of this creature's actions/);
  assert.match(bad((m) => { m.actions[0].multiattack = [{ action: "rend", times: 0 }]; }), /times/);
  assert.match(bad((m) => { m.actions[0].multiattack = [{ action: "multiattack", times: 1 }]; }), /cannot name another multiattack/);
  assert.match(bad((m) => { m.actions[0].multiattack = { or: [[{ action: "rend", times: 2 }]] }; }), /multiattack must be/);
  assert.match(bad((m) => { m.actions[0].effects = [{ manual: "x" }]; }), /no target and no effects/);
  assert.match(bad((m) => { m.actions[1].recharge = [5, 5]; }), /recharge must be/);
  assert.match(bad((m) => { m.actions[1].uses = { per: "week", n: 1 }; }), /uses must be/);
  assert.match(bad((m) => { m.actions[1].recharge = [5, 6]; }), /has a recharge or uses/);
  assert.equal(bad((m) => { m.actions[0].multiattack = { or: [[{ action: "rend", times: 2 }], [{ action: ["rend"], times: 1 }]] }; }), "");
});

test("a monster still in the fight but out of reach of everything ends its turn instead of looping", () => {
  const s = field(); tough(s);
  const troll = spawn(s, "troll", 0, 0); tough(s);
  put(s, "fighter", 6, 0);
  fight(s, { q: 3, r: 0 }); turnOf(s, troll.id);
  s.entities[troll.id].speed = 0;
  const ev = aiTurn(s, troll.id);
  assert.ok(ev.some((e) => e.type === "turn"));
  assert.notEqual(current(s), troll.id);
  assert.ok(inFight(s, troll.id));
});

test("recharge: a breath weapon once used is refused until a roll at the start of a turn recharges it", () => {
  const s = field(); tough(s);
  const dragon = spawn(s, "red-dragon-wyrmling", 0, 0); tough(s);
  put(s, "fighter", 2, 0);
  assert.deepEqual(dragon.actions.find((a) => a.id === "fire-breath").recharge, [5, 6]);
  fight(s); turnOf(s, dragon.id);
  ok(apply(s, { type: "act", actor: dragon.id, action: "fire-breath", hex: { q: 2, r: 0 } }, DM));
  assert.equal(dragon.spent["fire-breath"], true);
  let rolls = [];
  for (let turn = 0; turn < 30 && dragon.spent["fire-breath"]; turn++) {
    ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    turnOf(s, dragon.id);
    const ev = s.timeline.filter((e) => e.type === "recharge" && e.id === dragon.id).at(-1);
    rolls.push(ev.roll);
    assert.equal(ev.ready, ev.roll >= 5);
    if (!ev.ready) assert.match(apply(s, { type: "act", actor: dragon.id, action: "fire-breath", hex: { q: 2, r: 0 } }, DM).error, /not recharged/);
  }
  assert.equal(dragon.spent["fire-breath"], undefined, `never recharged: ${rolls}`);
  ok(apply(s, { type: "act", actor: dragon.id, action: "fire-breath", hex: { q: 2, r: 0 } }, DM));
  // The AI does not try a spent breath: it bites instead.
  ok(apply(s, { type: "endTurn", actor: dragon.id }, DM));
  turnOf(s, dragon.id);
  if (dragon.spent["fire-breath"]) assert.notEqual(aiStep(s, dragon.id).action, "fire-breath");
});

test("uses per day: a 1/Day action is refused the second time", () => {
  const s = field(); tough(s);
  const quasit = spawn(s, "quasit", 0, 0); tough(s);
  put(s, "fighter", 1, 0);
  assert.deepEqual(quasit.actions.find((a) => a.id === "scare").uses, { per: "day", n: 1 });
  fight(s); turnOf(s, quasit.id);
  const scare = quasit.actions.find((a) => a.id === "scare");
  const use = () => apply(s, { type: "act", actor: quasit.id, action: "scare", ...(scare.target.creature ? { target: "fighter" } : { hex: { q: 1, r: 0 } }) }, DM);
  ok(use());
  assert.equal(quasit.charges.scare, 0);
  ok(apply(s, { type: "endTurn", actor: quasit.id }, DM));
  turnOf(s, quasit.id);
  assert.match(use().error, /no uses of Scare left/);
});

test("a Bonus Action costs the Bonus Action, not the action", () => {
  const s = field(); tough(s);
  const medusa = spawn(s, "medusa", 0, 0); tough(s);
  putBeside(s, "fighter", medusa);
  fight(s); turnOf(s, medusa.id);
  const f = s.entities.fighter;
  ok(apply(s, { type: "act", actor: medusa.id, action: "petrifying-gaze", hex: { q: f.pos.q, r: f.pos.r } }, DM));
  assert.deepEqual([s.encounter.budget.action, s.encounter.budget.bonus], [1, 0]);
  ok(apply(s, { type: "act", actor: medusa.id, action: "multiattack" }, DM));
});

test("condition immunities: a Skeleton cannot be Poisoned, by a spell, an attack or the DM", () => {
  const s = field(); tough(s);
  const skel = spawn(s, "skeleton", 0, 0); tough(s);
  assert.deepEqual(skel.conditionImmune, ["exhaustion", "poisoned"]);
  const res = apply(s, { type: "condition", actor: skel.id, condition: "poisoned", on: true }, DM);
  assert.equal(res.ok, false);
  assert.match(res.error, /immune to Poisoned/);
  ok(apply(s, { type: "condition", actor: skel.id, condition: "prone", on: true }, DM));
  // An effect step that would poison it says it is immune and does nothing.
  skel.actions.push({ id: "self-poison", name: "Test Poison", target: { self: true }, effects: [{ condition: "poisoned" }] });
  const r = ok(apply(s, { type: "act", actor: skel.id, action: "self-poison" }, DM));
  assert.equal(skel.cond.poisoned, undefined);
  assert.ok(r.events.some((e) => e.type === "note" && /Immune to Poisoned/.test(e.text)));
  // Saved before the field: filled in from the template.
  const saved = clone(s); delete saved.entities[skel.id].conditionImmune;
  migrate(saved);
  assert.deepEqual(saved.entities[skel.id].conditionImmune, ["exhaustion", "poisoned"]);
  assert.ok(PACKS[0].monsters.filter((m) => m.conditionImmune).length >= 90);
});

test("one hit that does two kinds of damage is one instance: one death-save failure (two on a crit), one Concentration save", () => {
  const s = field(); tough(s);
  const dragon = spawn(s, "red-dragon-wyrmling", 0, 0); tough(s);
  put(s, "fighter", 1, 0); put(s, "wizard", 0, 1);
  s.entities.fighter.ac = 1;
  fight(s); turnOf(s, dragon.id);
  // A dying fighter: a hit within 5 ft is a critical hit, so two failures, not four.
  const f = s.entities.fighter;
  f.hp = 0; f.cond.unconscious = {}; f.cond.prone = {}; f.death = { s: 0, f: 0 };
  let r = null;
  for (let i = 0; i < 20; i++) {
    const c = clone(s);
    const res = ok(apply(c, { type: "act", actor: dragon.id, action: "rend", target: "fighter" }, DM));
    if (res.events.some((e) => e.type === "attack" && e.hit)) { r = { c, res }; break; }
    s.rng = c.rng;
  }
  assert.ok(r, "no hit in twenty tries");
  assert.equal(r.res.events.filter((e) => e.type === "damage").length, 2);
  assert.equal(r.c.entities.fighter.death.f, 2);
  // A concentrating wizard hit by both parts makes one Concentration save, against the total.
  const w = s.entities.wizard;
  w.ac = 1; w.hp = w.maxHp = 300;
  ok(apply(s, { type: "endTurn", actor: dragon.id }, DM));
  turnOf(s, "wizard");
  let tested = false;
  w.spells.push("detect-magic");                                      // a Concentration spell on itself
  {
    ok(apply(s, { type: "cast", actor: "wizard", spell: "detect-magic" }, DM));
    assert.ok(s.effects.some((fx) => fx.source === "wizard" && fx.conc));
    turnOf(s, dragon.id);
    for (let i = 0; i < 20; i++) {
      const res = ok(apply(clone(s), { type: "act", actor: dragon.id, action: "rend", target: "wizard" }, DM));
      if (res.events.some((e) => e.type === "attack" && e.hit)) {
        const dmg = res.events.filter((e) => e.type === "damage").reduce((n, e) => n + e.amount, 0);
        const saves = res.events.filter((e) => e.type === "concentration");
        assert.equal(saves.length, 1);
        assert.equal(saves[0].dc, Math.max(10, Math.floor(dmg / 2)));
        tested = true;
        break;
      }
      s.rng += 1;
    }
    assert.ok(tested, "no hit in twenty tries");
  }
});
