// The size limit on conditions (issue #495, DEBT W9; docs/specs/grapple-shove.md, the amendment of #495).
// SRD 5.2.1 stat blocks: "If the target is a Medium or smaller creature, it has the Prone condition" (Wolf Bite) and its kin. G4 (#481)
// added `largest` for grapples; any other condition step may now say it too, and the engine passes over a bigger target and tells the table.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { CONTENT } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { walk } from "../src/effects.js";
import { viewEvents } from "../src/view.js";

const MONSTERS = CONTENT.monsters;
const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const clone = (x) => JSON.parse(JSON.stringify(x));

// What the stat blocks say (reference/srd52/srd52-flow.txt, grep "or smaller"), written out again so that the data is held to it:
// monster, action, the condition the size limit is on, the biggest size it works on.
const SRD = [
  ["wolf", "bite", "prone", "medium"], ["mastiff", "bite", "prone", "medium"], ["brown-bear", "claw", "prone", "large"], ["dire-wolf", "bite", "prone", "large"],
  ["tiger", "rend", "prone", "large"], ["winter-wolf", "bite", "prone", "large"], ["chimera", "ram", "prone", "medium"], ["ettin", "battleaxe", "prone", "large"],
  ["hill-giant", "tree-club", "prone", "large"], ["stone-giant", "boulder", "prone", "large"], ["giant-ape", "boulder-toss", "prone", "large"],
  ["djinni", "storm-bolt", "prone", "large"], ["earth-elemental", "rock-launch", "prone", "large"], ["water-elemental", "slam", "prone", "medium"],
  ["gibbering-mouther", "bite", "prone", "medium"], ["gladiator", "shield-bash", "prone", "medium"], ["swarm-of-crawling-claws", "swarm-of-grasping-hands", "prone", "medium"],
  ["ankylosaurus", "tail", "prone", "huge"], ["dragon-turtle", "tail", "prone", "huge"], ["tarrasque", "tail", "prone", "huge"],
  ["giant-crocodile", "tail", "prone", "large"], ["tyrannosaurus-rex", "tail", "prone", "huge"], ["air-elemental", "whirlwind", "prone", "medium"],
  ["balor", "flame-whip", "prone", "huge"], ["cloaker", "attach", "blinded", "large"], ["ettercap", "web-strand", "restrained", "large"],
];
// The pushes and pulls with a size limit (`largest` on a `move` step, from Repelling Blast on).
const MOVES = [["air-elemental", "whirlwind", "medium"], ["balor", "flame-whip", "huge"], ["satyr", "hooves", "medium"], ["shambling-mound", "charged-tendril", "medium"], ["tough-boss", "warhammer", "large"], ["merrow", "harpoon", "large"], ["merrow", "harpoon-thrown", "large"]];

const steps = (m, a, key) => { const out = []; walk(MONSTERS[m].actions.find((x) => x.id === a).effects, (st) => { if (st && key in st) out.push(st); }); return out; };
const stepsOf = () => {
  const out = [];
  for (const m of Object.values(MONSTERS)) for (const a of m.actions ?? []) if (a.effects) walk(a.effects, (st) => { if (st && "condition" in st && st.condition !== "grappled" && st.largest !== undefined) out.push([m.id, a.id, st.condition, st.largest]); });
  return out;
};

test("each condition step the SRD limits by size carries its limit, and no other step but a grapple's does", () => {
  for (const [m, a, cond, largest] of SRD) {
    const st = steps(m, a, "condition").filter((x) => x.condition === cond);
    assert.equal(st.length, 1, `${m} ${a}: one ${cond} step`);
    assert.equal(st[0].largest, largest, `${m} ${a}`);
  }
  assert.deepEqual(stepsOf().sort(), SRD.map((x) => [...x]).sort(), "no condition step has a limit that is not in the table");
  for (const [m, a, largest] of MOVES) assert.equal(steps(m, a, "move")[0].largest, largest, `${m} ${a}`);
});

test("the stat blocks the SRD does not limit have no `largest`: the Bronze dragons' Repulsion Breath, the Sphinx's Third Roar, the Fire Giant's Hammer Throw", () => {
  for (const [m, a] of [["adult-bronze-dragon", "repulsion-breath"], ["young-bronze-dragon", "repulsion-breath"], ["sphinx-of-valor", "third-roar"], ["fire-giant", "hammer-throw"]]) {
    for (const key of ["condition", "move"]) for (const st of steps(m, a, key)) assert.equal(st.largest, undefined, `${m} ${a}`);
  }
});

// The SRD text itself: every "If the target is a <size> or smaller creature, it has the Prone condition" in the stat blocks is one of the entries
// above (the Air Elemental's limit is on who it may choose, so its sentence reads differently); a charge ("... moved 20+ feet straight toward it
// immediately before the hit") has no step the vocabulary can say, so those stay manual steps with the size in their text and no Prone step.
test("every stat block line of the SRD that limits Prone by size is accounted for", async () => {
  const { readFileSync } = await import("node:fs");
  const text = readFileSync(new URL("../../../reference/srd52/srd52-flow.txt", import.meta.url), "utf8").split("\n").slice(43000).join(" ").replace(/\s+/g, " ");
  const plain = [...text.matchAll(/If (?:the )?target is (?:a )?(\w+) or smaller(?: creature)?, (?:it has|the \w+ pulls)[^.]*?Prone condition/g)];
  assert.equal(plain.length, SRD.filter((x) => x[2] === "prone" && x[0] !== "air-elemental").length);
  for (const [m, a] of [["boar", "gore"], ["rhinoceros", "gore"], ["giant-elk", "ram"], ["elk", "ram"], ["elephant", "gore"], ["wereboar", "tusk"], ["gorgon", "gore"], ["mammoth", "gore"],
    ["triceratops", "gore"], ["warhorse", "hooves"], ["giant-boar", "gore"], ["giant-goat", "ram"], ["minotaur-of-baphomet", "gore"], ["minotaur-skeleton", "gore"], ["warhorse-skeleton", "hooves"], ["allosaurus", "claws"]]) {
    assert.equal(steps(m, a, "condition").length, 0, `${m} ${a} stays manual`);
    assert.ok(/Prone/.test(JSON.stringify(MONSTERS[m].actions.find((x) => x.id === a).effects)), `${m} ${a} says Prone in its manual step`);
  }
});

// A map of grass with `monster` at 0,0 and goblin-warriors for `others` ({ q, r, size }) that fail every save; the monster's turn.
function field(monster, others, seed = 7) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  const spawn = (mon, at, extra) => { const id = ok(apply(s, { type: "spawn", monster: mon, at }, DM)).events.find((e) => e.type === "spawned").id; Object.assign(s.entities[id], { hp: 900, maxHp: 900, ac: 1, ...extra }); return id; };
  const g = spawn(monster, { q: 0, r: 0 }, {});
  const targets = others.map((o) => spawn("goblin-warrior", { q: o.q, r: o.r }, { side: "party" }));
  targets.forEach((id, i) => { if (others[i].size) s.entities[id].size = others[i].size; s.entities[id].saveBonus = { str: -40, dex: -40, con: -40 }; });
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  for (let i = 0; i < 40 && current(s) !== g; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  s.encounter.budget.action = 30; s.encounter.budget.bonus = 30;
  return { s, g, targets };
}
// Replay the turn on fresh games until the attack hits.
function hits(make, act) {
  for (let seed = 1; seed < 60; seed++) {
    const f = make(seed), r = apply(f.s, act(f), DM);
    if (r.ok && r.events.some((e) => e.type === "attack" && e.hit)) return { ...f, r };
  }
  assert.fail("no seed made the attack hit");
}
const notes = (r, id) => r.events.filter((e) => e.type === "note" && e.id === id).map((e) => e.text);

test("the wolf's Bite knocks a Medium target Prone and does not knock a Large one, and the table is told", () => {
  const a = hits((seed) => field("wolf", [{ q: -1, r: 0, size: "medium" }], seed), (f) => ({ type: "act", actor: f.g, action: "bite", target: f.targets[0] }));
  assert.ok(a.s.entities[a.targets[0]].cond.prone, "a Medium target is knocked Prone");
  assert.deepEqual(notes(a.r, a.targets[0]), []);
  const b = hits((seed) => field("wolf", [{ q: -1, r: 0, size: "large" }], seed), (f) => ({ type: "act", actor: f.g, action: "bite", target: f.targets[0] }));
  const big = b.targets[0];
  assert.equal(b.s.entities[big].cond.prone, undefined, "a Large target is not");
  assert.ok(b.r.events.some((e) => e.type === "damage" && e.target === big), "it was bitten all the same");
  assert.ok(!b.r.events.some((e) => e.type === "cond" && e.id === big));
  assert.deepEqual(notes(b.r, big), [`${b.s.entities[big].name} is bigger than Medium, so Bite does not give it the Prone condition`]);
  // A Small and a Tiny target are within the limit.
  for (const size of ["small", "tiny"]) {
    const c = hits((seed) => field("wolf", [{ q: -1, r: 0, size }], seed), (f) => ({ type: "act", actor: f.g, action: "bite", target: f.targets[0] }));
    assert.ok(c.s.entities[c.targets[0]].cond.prone, size);
  }
});

test("the hill giant's Tree Club: Large is knocked Prone, Huge is not (a limit one size up)", () => {
  const a = hits((seed) => field("hill-giant", [{ q: -4, r: 0, size: "large" }], seed), (f) => ({ type: "act", actor: f.g, action: "tree-club", target: f.targets[0] }));
  assert.ok(a.s.entities[a.targets[0]].cond.prone);
  const b = hits((seed) => field("hill-giant", [{ q: -4, r: 0, size: "huge" }], seed), (f) => ({ type: "act", actor: f.g, action: "tree-club", target: f.targets[0] }));
  assert.equal(b.s.entities[b.targets[0]].cond.prone, undefined);
  assert.match(notes(b.r, b.targets[0])[0], /bigger than Large/);
});

test("the Whirlwind: a Medium creature is pushed and knocked Prone, a Large one is neither and still takes the damage", () => {
  const run = (size) => {
    const f = field("air-elemental", [{ q: -1, r: 0, size }]);
    return { ...f, r: ok(apply(f.s, { type: "act", actor: f.g, action: "whirlwind", target: f.targets[0] }, DM)), t: f.targets[0] };
  };
  const a = run("medium");
  assert.ok(a.s.entities[a.t].cond.prone, "Prone");
  assert.ok(a.r.events.some((e) => e.type === "moved" && e.id === a.t), "pushed");
  const b = run("large");
  assert.ok(b.r.events.some((e) => e.type === "damage" && e.target === b.t), "it takes the damage");
  assert.equal(b.s.entities[b.t].cond.prone, undefined, "not Prone");
  assert.ok(!b.r.events.some((e) => e.type === "moved" && e.id === b.t), "not pushed");
  assert.match(notes(b.r, b.t)[0], /bigger than Medium/);
});

test("the Balor's Flame Whip pulls a Huge target and knocks it Prone; a Gargantuan one is neither", () => {
  const a = hits((seed) => field("balor", [{ q: -5, r: 0, size: "huge" }], seed), (f) => ({ type: "act", actor: f.g, action: "flame-whip", target: f.targets[0] }));
  const t = a.targets[0];
  assert.ok(a.s.entities[t].cond.prone, "Prone");
  assert.ok(a.r.events.some((e) => e.type === "moved" && e.id === t), "pulled");
  const b = hits((seed) => field("balor", [{ q: -5, r: 0, size: "gargantuan" }], seed), (f) => ({ type: "act", actor: f.g, action: "flame-whip", target: f.targets[0] }));
  const big = b.targets[0];
  assert.equal(b.s.entities[big].cond.prone, undefined);
  assert.ok(!b.r.events.some((e) => e.type === "moved" && e.id === big), "not pulled");
  assert.match(notes(b.r, big)[0], /bigger than Huge/);
});

test("a grapple's `largest` is unchanged: a bigger target is not held and nothing is said", () => {
  const a = hits((seed) => field("ankheg", [{ q: -1, r: 0, size: "huge" }], seed), (f) => ({ type: "act", actor: f.g, action: "bite", target: f.targets[0] }));
  assert.equal(a.s.entities[a.targets[0]].cond.grappled, undefined);
  assert.deepEqual(notes(a.r, a.targets[0]), []);
});

test("the linter: `largest` goes on a condition step of any entry, as a size; not with a hold's other keys or on a `whileHeld` step", () => {
  const wolf = clone(MONSTERS.wolf), hit = (m) => m.actions[0].effects[0].onHit;
  assert.deepEqual(lintEntry("monsters", wolf, { strict: false }), []);
  const bad = clone(wolf); hit(bad)[1].largest = "enormous";
  assert.match(lintEntry("monsters", bad, { strict: false }).join(), /largest. is one of/);
  const held = clone(MONSTERS.couatl); const act = held.actions.find((a) => a.id === "constrict");
  const restrained = act.effects[0].onFail.find((x) => x.whileHeld);
  restrained.largest = "medium";
  assert.match(lintEntry("monsters", held, { strict: false }).join(), /whileHeld. step has no .largest/);
  const other = clone(wolf); hit(other)[1].escape = 12;
  assert.match(lintEntry("monsters", other, { strict: false }).join(), /escape. is for a Grappled step/);
  const dmg = clone(wolf); hit(dmg)[0].largest = "large";
  assert.match(lintEntry("monsters", dmg, { strict: false }).join(), /largest. is for a condition step/);
  // A spell's condition step may carry it (it is a size limit, not a hold); its other hold keys are still for a creature's action.
  const spell = clone(CONTENT.spells["hold-person"]);
  const cond = spell.effects.flatMap(function find(x) { return [x, ...(x.onFail ?? []).flatMap(find)]; }).find((x) => x.condition);
  assert.ok(cond);
  cond.largest = "large";
  assert.deepEqual(lintEntry("spells", spell, { strict: false }), []);
  cond.largest = "giant";
  assert.match(lintEntry("spells", spell, { strict: false }).join(), /largest/);
  cond.largest = "large"; cond.holds = 2;
  assert.match(lintEntry("spells", spell, { strict: false }).join(), /holds. is for a creature's action/);
});

test("homebrew may use it (strict mode), and the reader says what it does", () => {
  const hb = clone(MONSTERS.wolf);
  hb.id = "hb-test-wolf"; hb.name = "Test Wolf"; hb.source = "homebrew:test"; hb.checked = false;
  assert.deepEqual(lintEntry("monsters", hb, { pack: "test" }), []);
  const text = readEntry("monsters", hb, { pack: "test" }).lines.join("\n");
  assert.match(text, /Only a creature that is Medium or smaller gets it; a bigger one does not, and the table is told/);
  const none = clone(hb); delete none.actions[0].effects[0].onHit[1].largest;
  assert.doesNotMatch(readEntry("monsters", none, { pack: "test" }).lines.join("\n"), /or smaller gets it/);
});

test("the note names the creature that acted: a player is sent it when they can see that creature, and nothing when it is hidden", () => {
  const U = { role: "player", userId: "u1" };
  const bite = (hidden) => hits((seed) => { const f = field("wolf", [{ q: -1, r: 0, size: "large" }], seed); if (hidden) f.s.entities[f.g].hidden = true; return f; }, (f) => ({ type: "act", actor: f.g, action: "bite", target: f.targets[0] }));
  const seen = bite(false);
  assert.equal(seen.r.events.find((e) => e.type === "note").actor, seen.g);
  const told = viewEvents(seen.r.events, seen.s, U).filter((e) => e.type === "note");
  assert.equal(told.length, 1);
  assert.match(told[0].text, /Bite does not give it the Prone condition/);
  const hid = bite(true);
  assert.ok(hid.r.events.some((e) => e.type === "note"), "the DM has it");
  const sent = viewEvents(hid.r.events, hid.s, U);
  assert.ok(!sent.some((e) => e.type === "note"), "no note for a creature they cannot see");
  assert.ok(!JSON.stringify(sent).includes("Bite"), "nothing of its action's name");
  assert.ok(sent.some((e) => e.type === "damage"), "the damage they feel is still told");
});

test("a push or pull that passes over a bigger target says so, as a condition does", () => {
  const f = field("satyr", [{ q: -1, r: 0, size: "large" }]);
  const t = f.targets[0];
  const r = hits((seed) => field("satyr", [{ q: -1, r: 0, size: "large" }], seed), (x) => ({ type: "act", actor: x.g, action: "hooves", target: x.targets[0] }));
  assert.ok(!r.r.events.some((e) => e.type === "moved" && e.id === r.targets[0]));
  assert.deepEqual(notes(r.r, r.targets[0]), [`${r.s.entities[r.targets[0]].name} is bigger than Medium, so Hooves does not push it`]);
  assert.ok(t);
});

test("`largest` is linted as a size on a move step too", () => {
  const sat = clone(MONSTERS.satyr), st = () => sat.actions.find((a) => a.id === "hooves").effects[0].onHit.find((x) => "move" in x);
  assert.deepEqual(lintEntry("monsters", sat, { strict: false }), []);
  st().largest = "giant";
  assert.match(lintEntry("monsters", sat, { strict: false }).join(), /largest. is one of/);
});
