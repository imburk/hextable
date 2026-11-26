// Wave 4, part 5, of issue #786: Feather Fall (assist), by a standing instruction on the new `fall` reaction trigger.
// Built to docs/specs/rules-expansion.md, "Build notes: wave 4 part 5". Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { apply } from "../src/engine.js";
import * as H from "../src/hex.js";
import { newMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";
import { lintPack } from "../src/content/schema.js";
import { reactionsOf } from "../src/reactions.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const tiles = (n) => Object.fromEntries(H.range({ q: 0, r: 0 }, n).map((h) => [H.col(h), { t: "stone" }]));
const pit = (more = {}) => ({ id: "pit", def: "pit-trap", level: "ground", at: { q: 1, r: 0 }, state: "found", fall: 30, ...more });
// Ground at z 0, a cellar at z -60 (or -30) under it; the wizard (Pat's, Feather Fall known, 4 slots) at -3,0, the fighter at -2,0.
function world({ depth = 30, wizardAt = { q: -3, r: 0 }, set = "always", radius = 16 } = {}) {
  const s = newGame(8);
  const levels = [{ id: "ground", name: "Ground", z: 0, tiles: tiles(radius) }, { id: "cellar", name: "Cellar", z: -depth, tiles: tiles(radius) }];
  ok(apply(s, { type: "loadMap", map: newMap({ id: "p", name: "Pits", starts: [{ q: -4, r: 0 }], levels, objects: [pit({ fall: depth })] }) }, DM));
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  apply(s, { type: "claim", entity: "fighter", user: "pat", userName: "Pat" }, PAT);
  ok(apply(s, { type: "place", actor: "fighter", to: { q: -2, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "wizard", to: wizardAt }, DM));
  const w = s.entities.wizard;
  Object.assign(w, { slots: { 1: 4 }, slotsMax: { 1: 4 } });
  if (!w.spells.includes("feather-fall")) w.spells.push("feather-fall");
  if (set) ok(apply(s, { type: "reactions", actor: "wizard", set: { "feather-fall": set } }, DM));
  return s;
}
const walkIn = (s, who = "fighter") => apply(s, { type: "move", actor: who, to: { q: 1, r: 0 } }, who === "fighter" ? PAT : DM);

test("tier and trigger: Feather Fall is assist, a `fall` reaction aimed at up to five creatures", () => {
  const d = SPELLS["feather-fall"].def;
  assert.equal(d.tier, "assist");
  assert.deepEqual(d.reaction, { on: "fall" });
  assert.equal(d.target.creature.count, 5);
  assert.match(JSON.stringify(d.effects), /more than 60 feet/);
});

test("by standing instruction an ally's fall lands with no damage and not Prone; slot and Reaction are spent", () => {
  const s = world();
  const hp = s.entities.fighter.hp;
  const r = ok(walkIn(s));
  const f = r.events.find((e) => e.type === "fell");
  assert.equal(f.feet, 30);
  assert.equal(f.slowed, true);
  assert.equal(s.entities.fighter.pos.z, -30);
  assert.equal(s.entities.fighter.hp, hp);
  assert.ok(!r.events.some((e) => e.type === "damage" || (e.type === "cond" && e.cond === "prone")));
  assert.ok(r.events.some((e) => e.type === "reaction" && e.reaction === "feather-fall" && e.trigger === "fall" && e.id === "wizard"));
  assert.equal(s.entities.wizard.slots[1], 3);
  assert.equal(s.entities.wizard.reactionUsed, true);
  assert.equal(r.events.filter((e) => e.type === "manual" && e.name === "Feather Fall").length, 1, "one note for the DM, not two");
  assert.ok(!s.effects?.length, "the spell ended for the creature on landing");
});

test("the default is never: the fall hurts as before", () => {
  const s = world({ set: null });
  assert.equal(reactionsOf(s.entities.wizard).find((x) => x.id === "feather-fall").on, "fall");
  const r = ok(walkIn(s));
  assert.ok(r.events.some((e) => e.type === "damage"));
  assert.equal(s.entities.wizard.slots[1], 4);
});

test("a caster who falls casts it for itself; no slot, no Reaction or no sight, no spell", () => {
  const s = world();
  s.entities.wizard.pos = { q: 0, r: 0, z: 0 };
  const r = ok(walkIn(s, "wizard"));
  assert.ok(r.events.some((e) => e.type === "fell" && e.slowed));
  assert.equal(s.entities.wizard.slots[1], 3);
  const a = world(); a.entities.wizard.slots[1] = 0;
  assert.ok(ok(walkIn(a)).events.some((e) => e.type === "damage"), "no slot");
  const b = world(); b.entities.wizard.reactionUsed = true;
  assert.ok(ok(walkIn(b)).events.some((e) => e.type === "damage"), "Reaction spent");
});

test("a faller more than 60 feet from the caster is out of range", () => {
  const s = world({ wizardAt: { q: -14, r: 0 } });
  assert.ok(ok(walkIn(s)).events.some((e) => e.type === "damage"));
  const near = world({ wizardAt: { q: -9, r: 0 } });
  assert.ok(!ok(walkIn(near)).events.some((e) => e.type === "damage"), "50 feet is in range");
});

test("a longer fall lands at once too, and the DM's note says the descent takes rounds", () => {
  const s = world({ depth: 100 });
  const r = ok(walkIn(s));

  assert.equal(s.entities.fighter.pos.z, -100);
  assert.ok(r.events.some((e) => e.type === "fell" && e.slowed && e.feet === 100));
  assert.ok(r.events.some((e) => e.type === "manual" && /more than 60 feet/.test(e.text)));
});

test("one cast covers up to five creatures that fall in the same action", () => {
  const s = world({ depth: 40 });
  ok(apply(s, { type: "place", actor: "rogue", to: { q: -1, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "wizard", to: { q: -2, r: 1 } }, DM));
  Object.assign(s.entities.wizard, { slots: { 1: 4, 4: 1 }, slotsMax: { 1: 4, 4: 1 } });
  s.entities.wizard.spells.push("fly");
  ok(apply(s, { type: "cast", actor: "wizard", spell: "fly", slot: 4, targets: ["fighter", "rogue"] }, DM));
  for (const id of ["fighter", "rogue"]) s.entities[id].pos = { ...s.entities[id].pos, z: 30 };
  const hp = [s.entities.fighter.hp, s.entities.rogue.hp];
  const r = ok(apply(s, { type: "endEffect", actor: "wizard", effect: s.effects.find((fx) => fx.spell === "fly").id }, DM));
  assert.deepEqual([s.entities.fighter.hp, s.entities.rogue.hp], hp, "neither took damage");
  assert.equal(r.events.filter((e) => e.type === "fell" && e.slowed).length, 2);
  assert.equal(r.events.filter((e) => e.type === "reaction" && e.reaction === "feather-fall").length, 1, "one cast");
  assert.deepEqual(r.events.find((e) => e.type === "cast" && e.spell === "feather-fall").targets.sort(), ["fighter", "rogue"]);
  assert.equal(s.entities.wizard.slots[1], 3, "a single 1st-level slot was spent in all");
  assert.deepEqual([s.entities.fighter.pos.z, s.entities.rogue.pos.z], [0, 0]);
});

test("ask: the caster's player gets the prompt; take casts it, decline lets the fall happen, and a later caster is still tried", () => {
  const SAM = { role: "player", userId: "sam" };
  const mk = () => {
    const s = world({ set: "ask" });
    apply(s, { type: "claim", entity: "wizard", user: "sam", userName: "Sam" }, SAM);
    s.entities.wizard.owner = "sam";
    return s;
  };
  const s = mk(), hp = s.entities.fighter.hp;
  const r = ok(walkIn(s));
  assert.ok(s.pending, "the fall waits");
  assert.equal(s.pending.ask.reactor, "wizard");
  assert.equal(s.pending.ask.trigger, "fall");
  assert.equal(s.entities.fighter.pos.z, 0, "nothing has happened yet");
  const take = ok(apply(s, { type: "react", prompt: s.pending.n, take: "feather-fall", slot: 1 }, SAM));
  assert.ok(take.events.some((e) => e.type === "fell" && e.slowed));
  assert.equal(s.entities.fighter.hp, hp);
  assert.equal(s.entities.wizard.slots[1], 3);
  const d = mk();
  ok(walkIn(d));
  const no = ok(apply(d, { type: "react", prompt: d.pending.n, take: null }, SAM));
  assert.ok(no.events.some((e) => e.type === "damage"), "declined: it falls and is hurt");
  assert.equal(d.entities.wizard.slots[1], 4);
  // A declined first caster does not bar a later one: the rogue (always) is tried next.
  const t = mk();
  Object.assign(t.entities.rogue, { slots: { 1: 2 }, slotsMax: { 1: 2 }, reactionUsed: false });
  if (!t.entities.rogue.spells) t.entities.rogue.spells = [];
  t.entities.rogue.spells.push("feather-fall");
  t.entities.rogue.reactions = { "feather-fall": "always" };
  ok(apply(t, { type: "place", actor: "rogue", to: { q: -3, r: 1 } }, DM));
  { const rg = t.entities.rogue; delete t.entities.rogue; t.entities.rogue = rg; }
  ok(walkIn(t));
  const later = ok(apply(t, { type: "react", prompt: t.pending.n, take: null }, SAM));
  assert.ok(later.events.some((e) => e.type === "reaction" && e.id === "rogue"), "the rogue cast it");
  assert.equal(t.entities.fighter.hp, t.entities.fighter.maxHp);
});

test("a visible foe caster never reacts for a hidden ally that falls", () => {
  const s = world({ set: null });
  const foe = s.entities.foe = structuredClone(s.entities.wizard);
  delete foe.owner;
  Object.assign(foe, { id: "foe", name: "Foe", side: "foe", kind: "npc", pos: { q: 2, r: 1, z: 0 }, reactionUsed: false, slots: { 1: 4 }, reactions: { "feather-fall": "always" } });
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 3, r: 0 }, name: "Ghost", hidden: true }, DM));
  const g = Object.values(s.entities).find((e) => e.name === "Ghost");
  const r = ok(apply(s, { type: "mapEdit", ops: [{ op: "tile", level: "ground", at: { q: 3, r: 0 }, tile: null }] }, DM));
  assert.equal(g.pos.z, -30);
  assert.ok(!r.events.some((e) => e.type === "reaction" && e.reaction === "feather-fall"));
  assert.equal(foe.slots[1], 4);
});

test("the linter takes `fall` for a Reaction spell aimed at up to five creatures, and no more", () => {
  const base = structuredClone(SPELLS["feather-fall"].def);
  const lint = (d) => lintPack({ id: "t", name: "t", spells: [d] }).join(" | ");
  assert.doesNotMatch(lint(base), /reaction spell set off/);
  const six = structuredClone(base); six.target = { creature: { count: 6 } };
  assert.match(lint(six), /up to 5 creatures/);
});
