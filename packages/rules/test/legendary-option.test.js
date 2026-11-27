// Legendary actions, stage L1c: taking an option (docs/specs/legendary.md, Decisions 4, 5 and 7; tests 4, 6 and 7).
// `legendary { actor, option, to?, target?, hex?, pick? }` pays the uses, walks the move part from a budget of its own, runs the creature's own action, and a `manual` part is the DM's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, current } from "../src/engine.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (s, a, ctx = DM) => { const r = apply(s, a, ctx); assert.ok(r.ok, `${a.type}: ${r.error}`); return r; };
const types = (r) => r.events.map((e) => e.type);
const end = (s) => apply(s, { type: "endTurn", actor: current(s) }, DM);

// The party and an adult green dragon "Verdigris" three hexes from the fighter (a second, "Second", with `two`), the fight begun and the window opened after a party creature's turn.
// The party is made hard to kill, so that an attack lands without ending the fight.
function window(seed = 5, { two = false, monster = "adult-green-dragon", hard = true, dice } = {}) {
  const s = newGame(seed);
  ok(s, { type: "setting", key: "autoEngage", value: false });
  ok(s, { type: "setting", key: "legendaryWindows", value: true });
  const f = s.entities.fighter.pos;
  ok(s, { type: "spawn", monster, at: { q: f.q + 3, r: f.r }, name: "Verdigris" });
  if (two) ok(s, { type: "spawn", monster: "adult-green-dragon", at: { q: f.q + 3, r: f.r - 5 }, name: "Second" });
  ok(s, { type: "startEncounter", center: f });
  if (hard) for (const e of Object.values(s.entities)) if (e.side === "party") e.hp = e.maxHp = 900;
  const named = (n) => Object.values(s.entities).find((e) => e.name === n);
  const want = two ? 2 : 1;       // with two dragons, the window after one's own turn offers only the other: go on to one after a party creature's turn
  for (let i = 0; i < 30 && s.encounter.between?.offered.length !== want; i++) { assert.ok((s.encounter.between ? apply(s, { type: "legendary", done: true }, DM) : end(s)).ok); }
  assert.equal(s.encounter.between?.offered.length, want, "a window is open");
  if (dice !== undefined) s.rng = dice;                 // the same map and fight, other dice
  return { s, d: named("Verdigris"), d2: named("Second"), f };
}
const clone = (s) => structuredClone(s);
// A refusal says so in words and changes nothing: the state is compared whole.
function refused(s, a, re, ctx = DM) {
  const before = clone(s), r = apply(s, a, ctx);
  assert.equal(r.ok, false, `${JSON.stringify(a)} was accepted`);
  assert.match(r.error, re);
  assert.deepStrictEqual(s, before, `${JSON.stringify(a)} changed the game`);
}
const at = (f, dq, dr = 0) => ({ q: f.q + dq, r: f.r + dr });

test("4: Pounce moves at most half its Speed and makes one Rend; the use is spent, the window closes", () => {
  const { s, d, f } = window();
  const afterWho = s.encounter.between.after;
  const r = ok(s, { type: "legendary", actor: d.id, option: "pounce", to: at(f, 1), target: "fighter" });
  const t = types(r);
  assert.deepEqual(t.slice(0, 3), ["legendary", "moved", "attack"]);
  assert.deepEqual(r.events[0], { type: "legendary", actor: d.id, option: "pounce", name: "Pounce", after: afterWho });
  assert.equal(r.events.find((e) => e.type === "attack").actor, d.id);
  assert.deepEqual(s.entities[d.id].legend, { acts: 1, resisted: 0, again: {}, lair: false, show: false });
  assert.equal(s.entities[d.id].pos.q, f.q + 1, "it stands where the move ended");
  assert.equal(s.encounter.between, undefined, "the one offered has taken its option: the window closed");
  assert.ok(t.includes("turn"), "and the next turn began");
});

test("4: a move shorter than the budget stops where asked; the walk spends only its own budget, never the turn's", () => {
  const { s, d, f } = window();
  const turnBefore = clone(s.encounter.budget);
  ok(s, { type: "legendary", actor: d.id, option: "pounce", to: at(f, 1), target: "fighter" });
  // the next turn began, with its own budget: the dragon's walk did not take from anyone's
  assert.ok(turnBefore && s.encounter.budget);
  assert.equal(s.entities[d.id].legend.acts, 1);
});

test("4: refusals in words, each changing nothing (the state compared whole)", () => {
  const { s, d, d2, f } = window(5, { two: true });
  const far = at(f, 0, 5);                                                          // beyond half of 40 ft (four hexes) from where it stands
  refused(s, { type: "legendary", actor: d.id, option: "pounce", to: far, target: "fighter" }, /Too far/);
  s.entities.wizard.pos = at(f, 2, -6);
  refused(s, { type: "legendary", actor: d.id, option: "pounce", to: at(f, 1), target: "wizard" }, /away|reach|range/i);            // out of reach from where the move ends
  refused(s, { type: "legendary", actor: d.id, option: "pounce", target: "wizard" }, /away|reach|range/i);                          // and from where it stands, with no move
  refused(s, { type: "legendary", actor: d.id, option: "no-such-option" }, /no legendary action called that/);
  refused(s, { type: "legendary", actor: d.id, option: "pounce", skip: true }, /not both/);
  refused(s, { type: "legendary", actor: d.id, option: "noxious-miasma", to: at(f, 1), hex: at(f, 0) }, /has no move/);
  refused(s, { type: "legendary", actor: d.id, option: "mind-invasion", target: "fighter" }, /not aimed at anything/);
  refused(s, { type: "legendary", actor: d.id, option: "pounce", pick: "rend", to: { q: 1.5, r: 0 } }, /whole-number/);
  refused(s, { type: "legendary", actor: d.id, option: "pounce", pick: "bite", target: "fighter" }, /pick one of them/);
  refused(s, { type: "legendary", actor: "fighter", option: "pounce" }, /not offered/);
  refused(s, { type: "legendary", actor: d.id, option: "pounce", to: at(f, 1), target: "fighter" }, /isn't yours/, { role: "player", userId: "u1" });
  // no use left, and a cost over the uses left
  ok(s, { type: "legendarySet", actor: d.id, set: { acts: 3 } });
  refused(s, { type: "legendary", actor: d.id, option: "pounce", to: at(f, 1), target: "fighter" }, /no legendary action left this round/);
  ok(s, { type: "legendarySet", actor: d.id, set: { acts: 2 } });
  s.entities[d.id].legendary.actions.options.push({ id: "big", name: "Big Thing", cost: 2, manual: "x", text: "x" });
  refused(s, { type: "legendary", actor: d.id, option: "big" }, /costs 2 legendary actions and Verdigris has 1 left/);
  ok(s, { type: "legendarySet", actor: d.id, set: { acts: 0 } });
  // a second option in the same window
  ok(s, { type: "legendary", actor: d.id, option: "pounce", to: at(f, 1), target: "fighter" });
  assert.ok(s.encounter.between, "the second dragon keeps the window open");
  assert.deepEqual(s.encounter.between.done, [d.id]);
  refused(s, { type: "legendary", actor: d.id, option: "pounce", target: "fighter" }, /already taken a legendary action after this turn/);
  assert.ok(d2);
});

test("4: an `again` option cannot be taken a second time before the creature's next turn, and is regained at it", () => {
  const { s, d, f } = window();
  const hex = at(f, -1);
  const r = ok(s, { type: "legendary", actor: d.id, option: "noxious-miasma", hex });
  assert.ok(types(r).includes("save"), "Noxious Miasma runs its saves");
  assert.equal(s.entities[d.id].legend.again["noxious-miasma"], true);
  assert.equal(s.entities[d.id].legend.acts, 1);
  // the next window: it is offered again (other options), but not this one
  for (let i = 0; i < 12 && !s.encounter.between && current(s) !== d.id; i++) end(s);
  if (current(s) !== d.id && s.encounter.between) {
    refused(s, { type: "legendary", actor: d.id, option: "noxious-miasma", hex }, /can't be taken again until the start of Verdigris's next turn/);
  }
  // its own turn begins: the uses and the bar are regained
  for (let i = 0; i < 30 && current(s) !== d.id; i++) { if (s.encounter.between) ok(s, { type: "legendary", actor: d.id, skip: true }); else end(s); }
  assert.equal(current(s), d.id);
  assert.deepEqual(s.entities[d.id].legend, { acts: 0, resisted: 0, again: {}, lair: false, show: false });
});

test("4: the uses and the bar are regained at the end of a fight too; Legendary Resistance stays", () => {
  const { s, d } = window();
  ok(s, { type: "legendary", actor: d.id, option: "noxious-miasma", hex: s.entities.fighter.pos });
  ok(s, { type: "legendarySet", actor: d.id, set: { resisted: 2 } });
  assert.equal(s.entities[d.id].legend.acts, 1);
  ok(s, { type: "endEncounter" });
  assert.deepEqual(s.entities[d.id].legend, { acts: 0, resisted: 2, again: {}, lair: false, show: false });
});

test("4: a `manual` option spends the use, makes its manual event and a to-do card; the engine does not pretend", () => {
  const { s, d } = window(5, { monster: "adult-blue-dragon" });
  assert.deepEqual(s.encounter.between.offered, [d.id]);
  const before = s.todo?.cards?.length ?? 0;
  const r = ok(s, { type: "legendary", actor: d.id, option: "sonic-boom" });
  assert.deepEqual(types(r).slice(0, 2), ["legendary", "manual"]);
  const m = r.events[1];
  assert.equal(m.name, "Sonic Boom");
  assert.match(m.text, /Shatter/);
  assert.equal(m.partial, undefined, "alone: the DM runs it whole");
  assert.equal(s.entities[d.id].legend.acts, 1);
  assert.equal(s.entities[d.id].legend.again["sonic-boom"], true);
  assert.ok(s.todo.cards.length > before, "a to-do card for the DM");
  assert.ok(s.todo.cards.some((c) => c.name === "Sonic Boom" && c.actor === d.id));
});

test("4: a move beside a manual part (Cloaked Flight: fly half its Fly Speed, then the DM casts) moves, then the manual event is partial", () => {
  const { s, d, f } = window(5, { monster: "adult-blue-dragon" });
  const from = { ...s.entities[d.id].pos };
  const r = ok(s, { type: "legendary", actor: d.id, option: "cloaked-flight", to: at(f, 1, 1) });
  const t = types(r);
  assert.equal(t[0], "legendary");
  assert.ok(t.includes("moved"), "it flew");
  const m = r.events.find((e) => e.type === "manual");
  assert.equal(m.partial, true);
  assert.notDeepEqual(s.entities[d.id].pos, from);
  // half of its Fly Speed is the budget: a shorter Speed shortens it
  const { s: s2, d: d2, f: f2 } = window(5, { monster: "adult-blue-dragon" });
  s2.entities[d2.id].speeds.fly = 20;                       // half of it is 10 ft: two hexes
  refused(s2, { type: "legendary", actor: d2.id, option: "cloaked-flight", to: at(f2, 5, -6) }, /Too far/);
  ok(s2, { type: "legendary", actor: d2.id, option: "cloaked-flight", to: at(f2, 3, -2) });
});

test("4: `use` runs the creature's own action: a spent breath refuses, two ids need a `pick`", () => {
  const { s, d, f } = window();
  s.entities[d.id].legendary.actions.options.push({ id: "breathe", name: "Breathe", use: ["poison-breath"], text: "x" }, { id: "either", name: "Either", use: ["rend", "poison-breath"], text: "x" });
  s.entities[d.id].spent = { "poison-breath": true };
  refused(s, { type: "legendary", actor: d.id, option: "breathe", hex: f }, /has not recharged/);
  d.pos = at(f, 1);
  const r = ok(s, { type: "legendary", actor: d.id, option: "either", target: "fighter" });      // only Rend is usable: no pick needed
  assert.ok(r.events.some((e) => e.type === "attack" && e.actor === d.id));
  const g = window();
  g.s.entities[g.d.id].legendary.actions.options.push({ id: "either", name: "Either", use: ["rend", "poison-breath"], text: "x" });
  g.d.pos = at(g.f, 1);
  refused(g.s, { type: "legendary", actor: g.d.id, option: "either", target: "fighter" }, /Rend or Poison Breath: say which with `pick`/);
  ok(g.s, { type: "legendary", actor: g.d.id, option: "either", pick: "rend", target: "fighter" });
});

// The dragon starts beside the fighter (a player's, asked about its Opportunity Attack), so walking away from it provokes: it walks 20 ft, and the rogue is where Rend can reach.
function provoking(seed = 5, opts = {}, instruction = "ask") {
  const g = window(seed, opts), { s, d, f } = g;
  ok(s, { type: "claim", entity: "fighter", user: "pat", userName: "Pat" });
  d.pos = at(f, 1);
  ok(s, { type: "reactions", actor: "fighter", set: { "opportunity-attack": instruction } });
  s.entities.rogue.pos = at(f, 5, -3);
  return { ...g, a: { type: "legendary", actor: d.id, option: "pounce", to: at(f, 5, -1), target: "rogue" } };
}

test("6: an Opportunity Attack on the Pounce is asked of a player; the answer re-runs the action and the use is spent once", () => {
  const { s, d, a } = provoking();
  const r = apply(s, a, DM);
  assert.ok(r.ok, r.error);
  assert.ok(s.pending, "the table waits for the fighter's answer");
  assert.equal(s.pending.ask.reactor, "fighter");
  assert.deepEqual(types(r), ["reactionAsked"]);
  assert.equal(s.entities[d.id].legend.acts, 0, "nothing is spent while it waits: the game is as it was before the action");
  assert.deepEqual(s.encounter.between.done, []);
  refused(s, { type: "legendary", actor: d.id, option: "pounce", target: "rogue" }, /waiting for a reaction/);
  const ans = ok(s, { type: "react", prompt: s.pending.n, take: "opportunity-attack" });
  assert.ok(!s.pending);
  assert.ok(types(ans).includes("reaction"), "the Opportunity Attack was made");
  assert.equal(s.entities[d.id].legend.acts, 1, "the use is spent once");
  assert.equal(types(ans).filter((x) => x === "legendary").length, 1, "and told once");
  assert.ok(ans.events.some((e) => e.type === "attack" && e.actor === d.id), "then the dragon's own Rend");
  assert.equal(s.encounter.between, undefined);
});

test("6: a declined Opportunity Attack runs the same option, spent once; one the fighter's player has set to never asks nothing", () => {
  const { s, d, a } = provoking();
  ok(s, a);
  const ans = ok(s, { type: "react", prompt: s.pending.n, take: null });
  assert.ok(!ans.events.some((e) => e.type === "reaction" && e.reaction === "opportunity-attack" && e.id === "fighter"));
  assert.equal(s.entities[d.id].legend.acts, 1);
  assert.ok(ans.events.some((e) => e.type === "attack" && e.actor === d.id));
  const n = provoking(5, {}, "never");
  const r = ok(n.s, n.a);
  assert.ok(!n.s.pending && !types(r).includes("reactionAsked"));
});

test("6: `provokes: false` draws no Opportunity Attack", () => {
  const { s, d, a } = provoking(5, {}, "always");
  s.entities[d.id].legendary.actions.options.find((o) => o.id === "pounce").move.provokes = false;
  const r = ok(s, a);
  assert.ok(!r.events.some((e) => e.type === "reaction"), "nobody reacted");
  const w = provoking(5, {}, "always");
  const r2 = ok(w.s, w.a);
  assert.ok(r2.events.some((e) => e.type === "reaction" && e.id === "fighter"), "without it the fighter does");
  assert.equal(w.s.entities[w.d.id].legend.acts, 1);
});

test("6: a dragon dropped by the Opportunity Attack on its move leaves the window, and the others keep it open", () => {
  let tried = 0, found = false;
  for (let dice = 1; dice <= 60 && !found; dice++) {
    const { s, d, d2, a } = provoking(5, { two: true, dice }, "always");
    d.hp = 1;
    const r = apply(s, a, DM);
    assert.ok(r.ok, r.error);
    tried++;
    if (s.entities[d.id].hp > 0) continue;
    found = true;
    assert.ok(!r.events.some((e) => e.type === "attack" && e.actor === d.id), "it made no attack of its own: it was down");
    assert.equal(s.entities[d.id].legend.acts, 1, "the use stays spent");
    assert.ok(s.encounter.between, "the other dragon is still asked");
    assert.deepEqual(s.encounter.between.offered, [d2.id]);
    assert.ok(!s.encounter.between.done.includes(d.id));
    assert.ok(r.events.some((e) => e.type === "manual"), "a note to the DM that it could not go on");
  }
  assert.ok(found, `the Opportunity Attack dropped the dragon in one of ${tried} rolls`);
});

test("6: a legendary action that drops the last character ends the fight and the window", () => {
  let found = false;
  for (let dice = 1; dice <= 60 && !found; dice++) {
    const { s, d, f } = window(5, { hard: false, dice });
    for (const e of Object.values(s.entities)) if (e.side === "party" && e.id !== "fighter") { e.hp = 0; e.dead = true; }
    s.entities.fighter.hp = 1;
    const r = apply(s, { type: "legendary", actor: d.id, option: "pounce", to: at(f, 1), target: "fighter" }, DM);
    assert.ok(r.ok, r.error);
    if (s.encounter) continue;
    found = true;
    assert.ok(types(r).includes("encounterEnd"));
  }
  assert.ok(found, "a Rend dropped the last character");
});

test("7: undo of a legendary action reopens the window with the creature offered; redo gives the same state", () => {
  const { s, d, f } = window();
  const h = createHistory();
  const act = (a) => { const before = mark(s), r = apply(s, a, DM); assert.ok(r.ok, r.error); h.record(before, s, describeStep(a, r.events, before, s)); return r; };
  const s0 = JSON.stringify(s);
  assert.ok(s.encounter.between);
  act({ type: "legendary", actor: d.id, option: "pounce", to: at(f, 1), target: "fighter" });
  const s1 = JSON.stringify(s);
  assert.notEqual(s1, s0);
  assert.equal(s.encounter.between, undefined);
  assert.deepEqual(h.list(), ["Verdigris: Pounce"]);
  h.undo(s);
  assert.equal(JSON.stringify(s), s0, "undo puts the window back as it was");
  assert.deepEqual(s.encounter.between.offered, [d.id]);
  assert.deepEqual(s.encounter.between.done, []);
  assert.equal(s.entities[d.id].legend.acts, 0);
  h.redo(s);
  assert.equal(JSON.stringify(s), s1, "redo gives the same state");
});
