// Wave 4, part 2, of issue #786: Find Traps and Detect Magic (assist, through the new `sense` step), Knock (kept manual, on purpose).
// Built to docs/specs/rules-expansion.md, "Build notes: wave 4 part 2". Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, SPELLS } from "../src/content/index.js";
import { apply } from "../src/engine.js";
import * as H from "../src/hex.js";
import { newMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";
import { startEffect } from "../src/durations.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const thing = (id, def, q, r, more = {}) => ({ id, def, level: "ground", at: { q, r }, state: CONTENT.objects[def].initial, ...more });

function floor(objects = [], walls = []) {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 30).map((h) => [H.col(h), { t: "stone" }]));
  const s = newGame(9);
  ok(apply(s, { type: "loadMap", map: newMap({ id: "floor", name: "A floor", starts: [{ q: 0, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }], walls, objects }) }, DM));
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const [i, id] of ["fighter", "rogue", "cleric"].entries()) ok(apply(s, { type: "place", actor: id, to: { q: -20, r: 5 + i } }, DM));
  ok(apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM));
  const w = s.entities.wizard;
  Object.assign(w, { slots: { 1: 4, 2: 3 }, slotsMax: { 1: 4, 2: 3 } });
  w.spells.push("find-traps", "detect-magic", "knock");
  return s;
}
const cast = (s, spell, slot) => ok(apply(s, { type: "cast", actor: "wizard", spell, slot }, DM));
const toDm = (r) => r.events.filter((e) => e.type === "manual" && e.partial).map((e) => e.text).join("\n");

test("tiers: Find Traps and Detect Magic are assist; Knock stays manual (a spell cannot be aimed at an object)", () => {
  assert.equal(SPELLS["find-traps"].def.tier, "assist");
  assert.equal(SPELLS["detect-magic"].def.tier, "assist");
  assert.equal(SPELLS.knock.def.tier, "manual");
});

test("Find Traps: the DM is told which traps are in line of sight within 120 feet and their general danger, not where", () => {
  const s = floor([
    thing("pit", "spiked-pit", 3, 0),                                              // covered: fall and piercing damage
    thing("dart", "arrow-trap", -2, 1, { state: "found" }),                       // spotted already: still a trap
    thing("gone", "arrow-trap", 4, -2, { state: "sprung" }),                      // sprung: no longer a danger
    thing("safe", "pit-trap", 5, -2, { state: "safe" }),                          // wedged shut
    thing("plate", "pressure-plate", 2, 2),                                       // a trigger, not a danger in itself
    thing("far", "pit-trap", 28, 0),                                              // 140 feet: out of range
    thing("hid", "pit-trap", 0, 6),                                               // behind the wall below
  ], [{ id: "w", level: "ground", a: [-100, 11], b: [100, 11], kind: "wall" }]);
  const r = cast(s, "find-traps", 2);
  const text = toDm(r);
  assert.match(text, /senses \d traps? within 120 ft/);
  assert.match(text, /a fall, piercing damage/);
  assert.match(text, /piercing damage/);
  assert.ok(!/"q"|, r:|\(\d+ ft\)/.test(text), "no place and no distance");
  const named = text.match(/a trap that poses/g).length;
  assert.equal(named, 2, "the covered pit and the spotted dart trap; not the sprung, wedged, plate, far or walled-off ones");
  const open = floor([thing("hid", "pit-trap", 0, 6)]);
  assert.match(toDm(cast(open, "find-traps", 2)), /senses 1 trap/, "the pit behind the wall is found when there is no wall");
});

test("Find Traps: with no trap in sight the DM is told so, and the same is sent to a player as with a trap on the map", () => {
  const bare = floor(), trapped = floor([thing("pit", "pit-trap", 3, 0)]);
  const a = cast(bare, "find-traps", 2), b = cast(trapped, "find-traps", 2);
  assert.match(toDm(a), /found no trap/);
  assert.match(toDm(b), /senses 1 trap/);
  const P = { role: "player", userId: "pat" };
  const seen = (s, r) => JSON.stringify(viewEvents(r.events, s, P));
  assert.equal(seen(bare, a), seen(trapped, b), "a player is sent the same either way");
  assert.ok(!/found no trap|senses 1 trap/.test(seen(trapped, b)));
});

test("Detect Magic: the DM is told of magic items carried and in a pile, and spells running, within 30 feet; nothing farther", () => {
  const s = floor([
    { id: "cache", def: "pile", level: "ground", at: { q: 3, r: 0 }, state: "lying", contents: [{ id: "a", item: "ring-of-protection" }, { id: "b", name: "a rope" }] },
    { id: "farcache", def: "pile", level: "ground", at: { q: 8, r: 0 }, state: "lying", contents: [{ id: "c", item: "ring-of-protection" }] },
  ]);
  assert.ok(CONTENT.items["ring-of-protection"], "the fixture item exists");
  startEffect(s, { name: "Shield of Faith", spell: "shield-of-faith", source: "cleric", conc: true, duration: "10 minutes", level: 1 }).parts.push({ target: "wizard", cond: "x" });
  const r = cast(s, "detect-magic", 1);
  const text = toDm(r);
  assert.match(text, /Ring of Protection/i);
  assert.match(text, /Shield of Faith, abjuration/);
  assert.equal((text.match(/Ring of Protection/gi) ?? []).length, 1, "the pile 40 feet away is left out");
  assert.ok(!/rope/.test(text), "a mundane item is no magic");
  assert.match(text, /\(15 ft\)/);
});

test("Detect Magic: a pile behind total cover is left out, and the cast never sends a player what it found", () => {
  const wall = { id: "w", level: "ground", a: [-100, 6.5], b: [100, 6.5], kind: "wall" };
  const s = floor([{ id: "cache", def: "pile", level: "ground", at: { q: 0, r: 3 }, state: "lying", contents: [{ id: "a", item: "ring-of-protection" }] }], [wall]);
  const r = cast(s, "detect-magic", 1);
    assert.match(toDm(r), /knows of no magic/);
  const P = { role: "player", userId: "pat" };
  assert.ok(!/Protection/.test(JSON.stringify(viewEvents(r.events, s, P))));
  assert.ok(!/Protection/.test(JSON.stringify(view(s, P).events ?? [])));
});

test("Knock: stays manual and still says what it does, the loud knock included", () => {
  const text = JSON.stringify(SPELLS.knock.def.effects);
  assert.match(text, /audible up to 300 feet/);
  assert.match(text, /Arcane Lock/);
});
