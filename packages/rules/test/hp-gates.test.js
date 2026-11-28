// Hit Point gates on effect steps (#907): `target.hpAtMost:N` and `target.hpAbove:N` on a step's `when`, and the three spells they let the engine run
// (SRD 5.2.1): Power Word Kill (100 or fewer dies, else 12d12 Psychic), Power Word Stun (150 or fewer Stunned, else Speed 0 until the start of the caster's
// next turn), Divine Word (Charisma save; by current Hit Points 20-: dies, 21-30 Blinded, Deafened, Stunned, 31-40 Blinded, Deafened, 41-50 Deafened).
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { HP_TAG, lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { derive } from "../src/derive.js";
import { apply, makeEntity } from "../src/engine.js";
import { judge } from "../src/modifiers.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const wizard = { name: "Wen", class: "wizard", level: 20, subclass: "evoker", abilities: { str: 8, dex: 14, con: 14, int: 20, wis: 10, cha: 10 }, skills: ["arcana", "history"], spells: ["power-word-kill", "power-word-stun"] };
const cleric = { name: "Pia", class: "cleric", level: 20, subclass: "life", abilities: { str: 10, dex: 10, con: 14, int: 10, wis: 20, cha: 10 }, skills: ["insight", "medicine"], spells: ["divine-word"] };

function table(sheet, id, seed = 5) {
  const s = newGame(seed);
  for (const k of Object.keys(s.entities)) delete s.entities[k];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  s.settings.strikeFirst = "all";
  s.entities[id] = makeEntity(derive(sheet).record, { id, kind: "pc", side: "party", owner: "pat", ownerName: "Pat", pos: { q: 0, r: 0, z: 0 } });
  s.entities[id].sheet = structuredClone(sheet);
  return s;
}
// A goblin (cha 1: it cannot pass a Charisma save against this DC) with `hp` Hit Points and `temp` Temporary ones.
function foe(s, hp, temp = 0, at = { q: -1, r: 0 }) {
  const id = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at }, DM)).events[0].id;
  const g = s.entities[id];
  g.abilities = { ...g.abilities, cha: 1 }; g.hpMax = Math.max(g.hpMax, hp); g.hp = hp; g.tempHp = temp;
  return g;
}
const cast = (s, actor, spell, extra) => ok(apply(s, { type: "cast", actor, spell, ...extra }, DM));
const manuals = (r) => r.events.filter((e) => e.type === "manual");

test("the linter takes the two forms by pattern on a step's when, and nothing else of that shape", () => {
  for (const t of ["target.hpAtMost:1", "target.hpAbove:999", "target.hpAtMost:150"]) assert.ok(HP_TAG.test(t), t);
  for (const t of ["target.hpAtMost:0", "target.hpAtMost:1000", "target.hpAbove:-5", "target.hpAbove:07", "target.hpAbove:2.5", "target.hpAtLeast:5", "target.hpAbove:", "target.hpAbove", " target.hpAbove:5", "target.hpAbove:5 "]) assert.ok(!HP_TAG.test(t), t);
  const def = (when) => ({ ...structuredClone(SPELLS["power-word-stun"].def), effects: [{ damage: "1d4", type: "psychic", when }] });
  assert.deepEqual(lintEntry("spells", def(["target.hpAtMost:30", "target.hpAbove:10"]), { strict: false }), []);
  for (const bad of ["target.hpAtMost:0", "target.hpAbove:1000", "target.hpAbove:x", "target.hpAtLeast:5"]) assert.ok(lintEntry("spells", def([bad]), { strict: false }).some((p) => /unknown situation tag/.test(p)), bad);
  // Only a step's `when`: a modifier's `when` and a save's `advantageIf` do not take them.
  const mod = { ...structuredClone(SPELLS["power-word-stun"].def), effects: [{ modifier: { on: "ac", op: "add", value: 1, when: ["target.hpAbove:5"] } }] };
  assert.ok(lintEntry("spells", mod, { strict: false }).some((p) => /unknown situation tag/.test(p)));
  const adv = { ...structuredClone(SPELLS["power-word-stun"].def), effects: [{ save: "wis", advantageIf: ["target.hpAbove:5"], onFail: [{ condition: "stunned" }] }] };
  assert.ok(lintEntry("spells", adv, { strict: false }).some((p) => /unknown situation tag/.test(p)));
  // A `kill` stands on a Hit Points tag, and on nothing else.
  const k = (when) => ({ ...structuredClone(SPELLS["power-word-kill"].def), effects: [{ kill: true, ...(when ? { when } : {}) }] });
  assert.deepEqual(lintEntry("spells", k(["target.hpAtMost:10"]), { strict: false }), []);
  assert.ok(lintEntry("spells", k(), { strict: false }).some((p) => /kill/.test(p)));
  assert.ok(lintEntry("spells", k(["target.prone"]), { strict: false }).some((p) => /kill/.test(p)));
});

test("judge: current Hit Points against N, Temporary ones never, and null with no target", () => {
  const t = { hp: 20, tempHp: 50 };
  assert.equal(judge("target.hpAtMost:20", { target: t }, {}), true);
  assert.equal(judge("target.hpAtMost:19", { target: t }, {}), false);
  assert.equal(judge("target.hpAbove:20", { target: t }, {}), false);
  assert.equal(judge("target.hpAbove:19", { target: t }, {}), true);
  assert.equal(judge("target.hpAbove:19", {}, {}), null);
  assert.equal(judge("target.hpAtMost:19", { attacker: {} }, {}), null);
  assert.equal(judge("target.hpAtMost:0", { target: t }, {}), null, "not the form");
  assert.equal(judge("target.hpAtMost:20 ", { target: t }, {}), null);
});

test("Power Word Kill: 100 or fewer dies, 101 takes 12d12 Psychic, Temporary Hit Points do not count", () => {
  assert.equal(SPELLS["power-word-kill"].def.tier, "auto");
  for (const [hp, temp, dies] of [[100, 0, true], [1, 0, true], [101, 0, false], [100, 200, true], [101, 0, false]]) {
    const s = table(wizard, "wen"), g = foe(s, hp, temp);
    const r = cast(s, "wen", "power-word-kill", { target: g.id });
    assert.equal(manuals(r).length, 0, "nothing is left to the DM");
    if (dies) assert.ok(g.dead || g.hp === 0 && g.dying !== undefined || g.hp <= 0, `hp ${hp} temp ${temp} dies`);
    else { assert.ok(!g.dead); assert.ok(r.events.some((e) => e.type === "damage" && e.target === g.id && e.dtype === "psychic" && e.amount >= 12), "12d12 Psychic"); }
  }
});

test("Power Word Kill: a creature at 101 Hit Points with 5 Temporary is not killed outright; one at 100 with 500 Temporary is", () => {
  const s1 = table(wizard, "wen"), g1 = foe(s1, 101, 5);
  cast(s1, "wen", "power-word-kill", { target: g1.id });
  assert.ok(!g1.dead);
  const s2 = table(wizard, "wen"), g2 = foe(s2, 100, 500);
  cast(s2, "wen", "power-word-kill", { target: g2.id });
  assert.ok(g2.dead || g2.hp === 0);
});

test("Power Word Stun: 150 or fewer is Stunned (a Constitution save at the end of its turns ends it), more has Speed 0 until the caster's next turn", () => {
  assert.equal(SPELLS["power-word-stun"].def.tier, "auto");
  const a = table(wizard, "wen"), ga = foe(a, 150, 0);
  const ra = cast(a, "wen", "power-word-stun", { target: ga.id });
  assert.ok(ga.cond.stunned, "150 is Stunned");
  assert.equal(manuals(ra).length, 0);
  const b = table(wizard, "wen"), gb = foe(b, 151, 0);
  cast(b, "wen", "power-word-stun", { target: gb.id });
  assert.ok(!gb.cond.stunned, "151 is not");
  assert.ok(JSON.stringify(b.effects).includes('"speed"') && JSON.stringify(b.effects).includes("151") === false, "151 has the Speed 0 effect on");
  assert.ok(JSON.stringify(a.effects).includes('"speed"') === false, "150 does not");
  const c = table(wizard, "wen"), gc = foe(c, 150, 400);
  cast(c, "wen", "power-word-stun", { target: gc.id });
  assert.ok(gc.cond.stunned, "Temporary Hit Points do not lift it over the line");
});

test("Divine Word: each band, Temporary Hit Points ignored, above 50 nothing", () => {
  const def = SPELLS["divine-word"].def;
  assert.equal(def.tier, "assist");
  const want = (hp) => (hp <= 20 ? "dead" : hp <= 30 ? ["blinded", "deafened", "stunned"] : hp <= 40 ? ["blinded", "deafened"] : hp <= 50 ? ["deafened"] : []);
  for (const [hp, temp] of [[1, 0], [20, 0], [21, 0], [30, 0], [31, 0], [40, 0], [41, 0], [50, 0], [51, 0], [100, 0], [51, 0], [20, 90], [51, 0]]) {
    const s = table(cleric, "pia"), g = foe(s, hp, temp);
    cast(s, "pia", "divine-word", { targets: [g.id] });
    const w = want(hp);
    if (w === "dead") { assert.ok(g.dead || g.hp === 0, `hp ${hp} dies`); continue; }
    assert.ok(!g.dead && g.hp === hp, `hp ${hp} lives`);
    assert.deepEqual(["blinded", "deafened", "stunned"].filter((c) => g.cond[c]), w, `hp ${hp} temp ${temp}`);
  }
});

test("the reader says the two forms in words, and is not confused by a number it does not take", () => {
  const r = JSON.stringify(readEntry("spells", SPELLS["power-word-kill"].def));
  assert.match(r, /100 Hit Points or fewer/);
  assert.match(r, /more than 100 Hit Points/);
  assert.match(JSON.stringify(readEntry("spells", SPELLS["power-word-stun"].def)), /150 Hit Points or fewer/);
});
