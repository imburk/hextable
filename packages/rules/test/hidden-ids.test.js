// To a player, a creature the party does not know of is the same as one that does not exist
// (security review #132, H1; issue #136). Whatever field of whatever action a player puts its id
// in, the answer and the game afterwards must be exactly what they are for an id that is nothing.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { apply, ACTION_TYPES, current } from "../src/engine.js";
import * as H from "../src/hex.js";
import { newMap } from "../src/map.js";
import { viewEvents } from "../src/view.js";
import { newGame } from "../src/scenario.js";
import { startEffect } from "../src/durations.js";
import { unknown } from "../src/vision.js";

const DM = { role: "dm", userId: "dm" };
const P = { role: "player", userId: "u1" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };

// Every field any action handler reads (`a.<field>`), so a field added later is walked too.
const src = ["engine.js", "scenes.js", "handouts.js"].map((f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8")).join("\n");
const FIELDS = [...new Set([...src.matchAll(/\ba\.([a-zA-Z]+)\b/g)].map((m) => m[1]))].filter((k) => k !== "type").sort();

// The player plays the wizard and the cleric. Two creatures they may not know of are within
// reach of every spell they have: an ogre the DM hid, and a goblin hidden the same way next to them.
function base(fight) {
  const s = newGame(5);
  for (const id of ["wizard", "cleric"]) { s.entities[id].owner = "u1"; s.entities[id].ownerName = "Pat"; }
  const cl = s.entities.cleric;
  cl.spells.push("spirit-guardians", "bless"); cl.slots[3] = 1; cl.slotsMax = { ...cl.slotsMax, 3: 1 };
  s.entities.wizard.spells.push("sleep");
  // In a fight the hidden ones are outside the arena, which is laid out first.
  if (fight) ok(apply(s, { type: "startEncounter", center: { q: -7, r: 2 }, radius: 3 }, DM));
  const ogre = ok(apply(s, { type: "spawn", monster: "ogre", name: "Grak the Ambusher", at: fight ? { q: -1, r: 3 } : { q: -4, r: 3 }, hidden: true }, DM)).events[0].id;
  if (!fight) s.entities.m1.pos = { q: -7, r: 4, z: 0 };
  ok(apply(s, { type: "reveal", actor: "m1", hidden: true }, DM));
  for (const id of [ogre, "m1"]) assert.ok(unknown(s, s.entities[id]), `${id} is unknown to the party`);
  return { s, hidden: [ogre, "m1"] };
}

// Actions as a player would send them, so that each reaches the fields it names. Every action
// type is also tried bare, with only an actor.
const TEMPLATES = [
  { type: "cast", actor: "wizard", spell: "magic-missile", targets: [] },
  { type: "cast", actor: "wizard", spell: "fire-bolt", target: null },
  { type: "cast", actor: "wizard", spell: "sleep", hex: { q: -6, r: 3 } },
  { type: "cast", actor: "wizard", spell: "burning-hands", hex: { q: -7, r: 3 } },
  { type: "cast", actor: "cleric", spell: "spirit-guardians", slot: 3, spare: [] },
  { type: "cast", actor: "cleric", spell: "bless", targets: ["wizard"] },
  { type: "cast", actor: "cleric", spell: "sacred-flame", target: null },
  { type: "cast", actor: "cleric", spell: "cure-wounds", target: "wizard" },
  { type: "attack", actor: "wizard", attack: "dagger", target: null },
  { type: "follow", actor: "wizard", leader: "cleric" },
  { type: "move", actor: "wizard", to: { q: -8, r: 4 } },
  { type: "say", as: "wizard", text: "Hello" },
  { type: "askCheck", actor: "wizard", skill: "perception" },
  { type: "note", to: "dm", text: "psst" },
  { type: "claim", entity: "fighter", user: "u1" },
  { type: "release", entity: "wizard" },
  { type: "react", prompt: 1, take: null },
  { type: "endEffect", effect: "fx1" },
  { type: "reactions", actor: "wizard", set: {} },
  ...ACTION_TYPES.map((type) => ({ type, actor: "wizard" })),
];
const forms = (id) => [id, [id], [id, "wizard"], { id }];

function run(s, action) {
  const c = structuredClone(s);
  let r;
  try { r = apply(c, structuredClone(action), P); } catch (err) { r = { threw: err.message }; }
  return { r, c };
}
// The fields of an action its handler reads (through a Proxy), so that only those are walked.
function reads(s, action) {
  const seen = new Set(Object.keys(action));
  const spy = new Proxy(action, { get: (o, k) => { if (typeof k === "string") seen.add(k); return o[k]; }, has: (o, k) => { if (typeof k === "string") seen.add(k); return k in o; } });
  try { apply(structuredClone(s), spy, P); } catch { for (const k of FIELDS) seen.add(k); }
  seen.delete("type");
  return [...seen];
}

for (const fight of [false, true]) {
  test(`a hidden creature's id is answered as an id that is nothing, in every field of every action${fight ? " (in a fight)" : ""}`, () => {
    const { s, hidden } = base(fight);
    const nothing = "m99";
    assert.equal(s.entities[nothing], undefined);
    const leaks = [];
    let tried = 0;
    for (const tpl of TEMPLATES) for (const k of reads(s, tpl)) {
      // Every form with the ogre; the plain id with the goblin too.
      for (const [h, f] of [...forms("x").map((_, i) => [hidden[0], i]), [hidden[1], 0]]) {
        const x = run(s, { ...tpl, [k]: forms(h)[f] }), y = run(s, { ...tpl, [k]: forms(nothing)[f] });
        tried++;
        // An id the player sent and that comes back (in a line said, say) is the player's own.
        const norm = (v) => JSON.stringify(v).replaceAll(h, "<id>").replaceAll(nothing, "<id>");
        const said = (o) => norm(o.r);
        const same = said(x) === said(y) && (x.r.ok === false ? true : norm(x.c) === norm(y.c));
        if (!same) leaks.push(`${tpl.type}.${k}=${JSON.stringify(forms(h)[f])}: ${said(x).slice(0, 160)} | nothing: ${said(y).slice(0, 160)}`);
      }
    }
    assert.ok(tried > 500, `walked ${tried}`);
    assert.deepEqual([...new Set(leaks)], []);
  });
}

test("the review's case: naming a hidden ogre in `targets` neither reveals it nor starts a fight", () => {
  const { s, hidden: [ogre] } = base(false);
  const before = JSON.stringify(s);
  const r = apply(s, { type: "cast", actor: "wizard", spell: "magic-missile", targets: [ogre] }, P);
  assert.deepEqual(r, { ok: false, error: "No such creature.", events: [] });
  assert.equal(JSON.stringify(s), before);
  assert.equal(s.encounter, null);
  // The DM may still name it.
  ok(apply(s, { type: "cast", actor: "wizard", spell: "magic-missile", targets: [ogre] }, DM));
  assert.ok(s.encounter);
});

test("a lasting effect of a hidden creature is answered as an effect that is nothing", () => {
  const { s, hidden: [ogre] } = base(false);
  const fx = startEffect(s, { name: "Grak's Secret Ward", spell: null, source: ogre, conc: true, duration: "1 minute" });
  const before = JSON.stringify(s);
  const mine = apply(s, { type: "endEffect", effect: fx.id }, P), none = apply(s, { type: "endEffect", effect: "fx999" }, P);
  assert.deepEqual(mine, none);
  assert.deepEqual(none, { ok: false, error: "No such effect.", events: [] });
  assert.equal(JSON.stringify(s), before);
  // One the party can see, cast by a creature they know of, is just not theirs to end.
  const seen = startEffect(s, { name: "Goblin Ward", spell: null, source: "m2", conc: true, duration: "1 minute" });
  assert.match(apply(s, { type: "endEffect", effect: seen.id }, P).error, /isn't yours to end/);
});

// Review #132, L1: a reaction's `against` is recorded as unseen, so a history read after the
// attacker comes into sight does not say who the unseen attacker was.
test("a Shield cast against an attacker in the dark does not name it in the record once it is seen", () => {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 12).map((h) => [H.col(h), { t: "stone" }]));
  const s = newGame(31);
  ok(apply(s, { type: "loadMap", map: newMap({ id: "c", name: "Cave", starts: [{ q: -10, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles, light: "dark" }] }) }, DM));
  ok(apply(s, { type: "setting", key: "sight", value: "light" }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  for (const [id, q, r] of [["fighter", -10, 0], ["rogue", -10, 2], ["cleric", -10, 3], ["wizard", 0, 0]]) s.entities[id].pos = { q, r, z: 0 };
  const w = s.entities.wizard; w.owner = "u1"; w.spells.push("shield");
  ok(apply(s, { type: "reactions", actor: "wizard", set: { shield: "always" } }, DM));
  const g = s.entities[ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 } }, DM)).events[0].id];
  assert.ok(unknown(s, g));
  s.rng = 1;
  ok(apply(s, { type: "attack", actor: g.id, target: "wizard", attack: "scimitar" }, DM));      // initiative
  for (let i = 0; i < 10 && current(s) !== g.id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  ok(apply(s, { type: "attack", actor: g.id, target: "wizard", attack: "scimitar" }, DM));
  const rec = s.timeline.find((e) => e.type === "reaction");
  assert.equal(rec?.against, g.id, "Shield was cast against the goblin");
  assert.ok(unknown(s, g), "and the goblin is still in the dark");
  assert.deepEqual(rec.unseen, [g.id]);
  // Light comes: the goblin is seen now. What the record says of then does not change.
  ok(apply(s, { type: "setLight", actor: "wizard", item: "torch" }, DM));
  assert.ok(!unknown(s, g));
  const told = viewEvents(s.timeline, s, P).find((e) => e.type === "reaction");
  assert.ok(told, "players still read that Shield was cast");
  assert.equal(told.against, undefined);
});

// Review #132, L3: map objects go to players by an allow list, and a ladder's `to` only once
// the place it leads to is sent.
test("a map object is sent by an allow list, and where a ladder leads only once that place is shown", async () => {
  const { view } = await import("../src/view.js");
  const ground = Object.fromEntries(H.range({ q: 0, r: 0 }, 6).map((h) => [H.col(h), { t: "stone" }]));
  const attic = Object.fromEntries(H.range({ q: 4, r: 0 }, 1).map((h) => [H.col(h), { t: "stone" }]));
  const s = newGame(5);
  ok(apply(s, { type: "loadMap", map: newMap({ id: "h", name: "House", starts: [{ q: -2, r: 0 }],
    levels: [{ id: "ground", name: "Ground", z: 0, tiles: ground }, { id: "attic", name: "Attic", z: 10, tiles: attic }],
    objects: [{ id: "ladder", def: "ladder", level: "ground", at: { q: 0, r: 0 }, state: "there", to: { q: 4, r: 0, z: 10 }, plot: "SECRET-zq" }],
    regions: [{ id: "attic", name: "The attic", level: "attic", hexes: Object.keys(attic) }] }) }, DM));
  const sent = () => view(s, P).map.objects.find((o) => o.id === "ladder");
  assert.ok(sent(), "the ladder is sent");
  assert.equal(sent().to, undefined, "not where it leads: the attic is not shown");
  assert.ok(!JSON.stringify(view(s, P)).includes("SECRET-zq"), "a field not on the allow list is not sent");
  ok(apply(s, { type: "revealRegion", region: "attic" }, DM));
  assert.deepEqual(sent().to, { q: 4, r: 0, z: 10 });
  assert.ok(!JSON.stringify(view(s, P)).includes("SECRET-zq"));
  assert.equal(view(s, DM).map.objects.find((o) => o.id === "ladder").plot, "SECRET-zq", "the DM has all of it");
});
