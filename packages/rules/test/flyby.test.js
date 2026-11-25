// Flyby (DEBT W25; docs/specs/rules-expansion.md, "Build notes: Flyby", #726 job 9): a trait `flyby: true`; a creature that has it
// provokes no Opportunity Attack when it moves out of an enemy's reach, whether it is a monster, a familiar, a summon or a
// druid in the form of a beast that has it. The brain's guard does not look for foes that could make one.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { CONTENT } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { flyby } from "../src/modifiers.js";
import { aiStep } from "../src/ai.js";
import { apart } from "../src/space.js";
import { viewEvents } from "../src/view.js";
import * as kit from "./c7-brain-kit.js";

const DM = { role: "dm", userId: "dm" }, PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); };
const TAGGED = ["flying-snake", "gargoyle", "giant-owl", "giant-wasp", "hippogriff", "owl", "pteranodon"];

// The wizard (Pat's) and one goblin; `foe` is the creature beside the wizard that moves away.
function field(foe) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (id !== "wizard") delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  ok(apply(s, { type: "claim", entity: "wizard", user: "pat", userName: "Pat" }, PAT));
  ok(apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM));
  s.entities.wizard.hp = s.entities.wizard.maxHp = 500;
  const id = ok(apply(s, { type: "spawn", monster: foe, at: { q: 1, r: 0 } }, DM)).events.find((e) => e.type === "spawned").id;
  return { s, id };
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 20 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const leave = (foe, to = { q: 3, r: 0 }) => {
  const { s, id } = field(foe);
  fight(s); turnOf(s, id);
  const r = ok(apply(s, { type: "move", actor: id, to }, DM));
  return { s, id, r };
};
const struck = (r, by) => r.events.some((e) => e.type === "attack" && e.opportunity && e.actor === by);

test("the seven SRD creatures with Flyby carry the tag, and no other does", () => {
  const has = Object.values(CONTENT.monsters).filter((m) => m.traits?.some((t) => t.flyby === true)).map((m) => m.id).sort();
  assert.deepEqual(has, TAGGED);
  const text = Object.values(CONTENT.monsters).filter((m) => m.traits?.some((t) => t.id === "flyby")).map((m) => m.id).sort();
  assert.deepEqual(text, TAGGED, "every trait named Flyby has the tag");
});

test("a flyby monster leaving a foe's reach draws no Opportunity Attack; a creature without the trait does", () => {
  for (const foe of ["owl", "giant-wasp", "pteranodon"]) {
    const { s, id, r } = leave(foe);
    assert.ok(!struck(r, "wizard") && !r.events.some((e) => e.type === "reaction"), foe);
    assert.equal(s.entities.wizard.reactionUsed, false, "the wizard's Reaction is not spent");
    assert.ok(apart(s, s.entities[id], s.entities.wizard) > 1, "it did leave");
  }
  const g = leave("goblin-warrior");
  assert.ok(struck(g.r, "wizard"), "a goblin provokes");
  assert.equal(g.s.entities.wizard.reactionUsed, true);
});

test("the tag is read from the stat block, not the name: the same walk with it taken away provokes", () => {
  const { s, id } = field("owl");
  fight(s); turnOf(s, id);
  assert.ok(flyby(s.entities[id]));
  const owl = CONTENT.monsters.owl, was = owl.traits[0].flyby;
  try {
    delete owl.traits[0].flyby;
    assert.ok(!flyby(s.entities[id]));
    assert.ok(struck(ok(apply(s, { type: "move", actor: id, to: { q: 3, r: 0 } }, DM)), "wizard"));
  } finally { owl.traits[0].flyby = was; }
});

test("a familiar owl on the party's side leaves a foe's reach unpunished; the DM's foe at 1 Hit Point is not asked", () => {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (id !== "wizard") delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  ok(apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM));
  const owl = ok(apply(s, { type: "spawn", monster: "owl", at: { q: 1, r: 1 } }, DM)).events.find((e) => e.type === "spawned").id;
  const gob = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 2, r: 0 } }, DM)).events.find((e) => e.type === "spawned").id;
  s.entities[owl].side = "party"; s.entities[owl].hp = 1;
  fight(s); turnOf(s, owl);
  const r = ok(apply(s, { type: "move", actor: owl, to: { q: -2, r: 2 } }, DM));
  assert.ok(!struck(r, gob), "no Opportunity Attack");
  assert.equal(s.entities[owl].hp, 1);
  assert.equal(s.entities[gob].reactionUsed, false);
});

// ---------- a druid in a flyby form ----------
const druid = { name: "Ven", class: "druid", level: 8, subclass: "land", abilities: { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 },
  skills: ["nature", "perception"], choices: { "primal-order": "warden" }, armour: "leather-armor", shield: true, weapons: ["quarterstaff"], spells: ["produce-flame", "cure-wounds"] };
function druidField() {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (!["rogue"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(druid).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  ok(apply(s, { type: "claim", entity: "hero", user: "pat", userName: "Pat" }, PAT));
  ok(apply(s, { type: "place", actor: "rogue", to: { q: -5, r: 0 } }, DM));
  const gob = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 } }, DM)).events.find((e) => e.type === "spawned").id;
  s.entities[gob].hp = s.entities[gob].maxHp = 300;
  return { s, gob };
}
const away = (s, gob) => { fight(s); turnOf(s, "hero"); return apply(s, { type: "move", actor: "hero", to: { q: -3, r: 0 } }, DM); };

test("a druid in the form of an owl leaves a goblin's reach unpunished; in a wolf's, or out of any form, it provokes", () => {
  for (const [form, flies] of [["owl", true], ["wolf", false], [null, false]]) {
    const { s, gob } = druidField();
    if (form) { ok(apply(s, { type: "feature", actor: "hero", feature: "wild-shape", form }, DM)); assert.equal(s.entities.hero.form.block, form); }
    assert.equal(flyby(s.entities.hero), flies, String(form));
    const r = ok(away(s, gob));
    assert.equal(struck(r, gob), !flies, `${form}: ${r.events.map((e) => e.type)}`);
    assert.equal(s.entities[gob].reactionUsed, !flies);
  }
});

test("a rejected move changes nothing", () => {
  const { s, id } = field("owl");
  fight(s); turnOf(s, id);
  const snap = JSON.stringify(s);
  no(apply(s, { type: "move", actor: id, to: { q: 40, r: 0 } }, DM));
  assert.equal(JSON.stringify(s), snap);
  no(apply(s, { type: "move", actor: "wizard", to: { q: -1, r: 0 } }, PAT), /turn/i);
  assert.equal(JSON.stringify(s), snap);
});

test("a hidden flyer leaving a foe's reach: the tag only removes the prompt, so the players are told no more than before", () => {
  // The Opportunity Attack on a hidden mover is what would find it (the walk makes it known first); with the tag there is none, so a hidden
  // flyer stays as hidden as it was, and what a player is sent is what it is sent with no such creature near.
  const { s, id } = field("owl");
  s.entities[id].hidden = true;
  fight(s); turnOf(s, id);
  const r = ok(apply(s, { type: "move", actor: id, to: { q: 3, r: 0 } }, DM));
  assert.ok(!struck(r, "wizard") && !r.events.some((e) => e.type === "reaction"));
  assert.equal(s.entities.wizard.reactionUsed, false);
  assert.deepEqual(viewEvents(r.events, s, PAT).map((e) => e.type), r.events.map((e) => e.type), "the player is sent only the move: no attack, no prompt, no Reaction spent");
  assert.deepEqual(r.events.map((e) => e.type), ["moved"]);
});

// ---------- the brain ----------
test("the brain's guard: a familiar owl beside a goblin steps out of its reach and is not struck; without the trait it Dodges and stays", () => {
  for (const grid of kit.GRIDS) {
    const run = () => {
      const s = kit.table(grid);
      const c = kit.near(s, "cleric", "owl", { name: "Pet" }, { min: 2, max: 3 });
      ok(apply(s, { type: "bond", actor: c, to: "cleric", kind: "familiar", orders: "command" }, kit.DM));
      kit.near(s, c, "goblin-warrior", { name: "Goblin" });
      kit.fight(s, grid); kit.turnOf(s, c);
      return kit.autoTurn(s, c).map((x) => x.a.type);
    };
    assert.deepEqual(run(), ["dodge", "move", "endTurn"], grid);
    const owl = CONTENT.monsters.owl, was = owl.traits[0].flyby;
    try { delete owl.traits[0].flyby; assert.deepEqual(run(), ["dodge", "endTurn"], `${grid}: no trait, so it stays`); } finally { owl.traits[0].flyby = was; }
  }
});

// ---------- the vocabulary ----------
test("the linter and the reader know the tag; a homebrew monster may carry it", () => {
  const base = structuredClone(CONTENT.monsters.owl);
  assert.deepEqual(lintEntry("monsters", base, { strict: false }), []);
  const bad = structuredClone(base); bad.traits[0].flyby = "yes";
  assert.match(lintEntry("monsters", bad, { strict: false }).join(), /flyby is true or left out/);
  const text = readEntry("monsters", base);
  assert.match(JSON.stringify(text), /provokes no Opportunity Attack/);
});
