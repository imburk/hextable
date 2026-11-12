// The object pack as a whole, and the SRD sample traps fired through the engine (task M13).
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, PACKS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";
import { apply } from "../src/engine.js";
import * as H from "../src/hex.js";
import { newMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const types = (r) => r.events.map((e) => e.type);

// An open stone floor with the given objects on it; the fighter is Pat's and stands at -2,0.
function floor(objects = []) {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 6).map((h) => [H.col(h), { t: "stone" }]));
  const s = newGame(8);
  ok(apply(s, { type: "loadMap", map: newMap({ id: "floor", name: "A floor", starts: [{ q: -4, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }], objects }) }, DM));
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  apply(s, { type: "claim", entity: "fighter", user: "pat", userName: "Pat" }, PAT);
  ok(apply(s, { type: "place", actor: "fighter", to: { q: -2, r: 0 } }, DM));
  return s;
}
// Run `act` on copies of the state with different dice until `want` holds.
function until(s, act, want) {
  for (let seed = 1; seed < 400; seed++) {
    const c = structuredClone(s); c.rng = seed;
    const r = act(c);
    if (want(r, c)) return { s: c, r };
  }
  throw new Error("no seed gave the wanted outcome");
}
const thing = (id, def, q, r, more = {}) => ({ id, def, level: "ground", at: { q, r }, state: CONTENT.objects[def].initial, ...more });
const walk = (c) => apply(c, { type: "move", actor: "fighter", to: { q: 3, r: 0 } }, PAT);
const NEW_TRAPS = ["collapsing-roof", "falling-net", "fire-casting-statue", "hidden-pit", "poisoned-darts", "poisoned-needle", "rolling-stone", "spiked-pit"];
const FURNITURE = ["door-iron", "trapdoor", "chest", "statue", "crate", "campfire", "brazier", "winch"];

test("the whole pack lints clean and every object starts in a state it has", () => {
  assert.deepEqual(lintPack(PACKS[0]), []);
  for (const o of PACKS[0].objects) assert.ok(Object.hasOwn(o.states, o.initial), `${o.id} starts in a state it does not have`);
});

test("the new entries are labelled by source, tier and checking", () => {
  for (const id of NEW_TRAPS) assert.equal(CONTENT.objects[id].source, "SRD 5.2.1", id);
  for (const id of FURNITURE) assert.equal(CONTENT.objects[id].source, "Hextable", id);
  for (const id of [...NEW_TRAPS, ...FURNITURE]) assert.equal(typeof CONTENT.objects[id].checked, "boolean", id);
  assert.equal(CONTENT.objects["rolling-stone"].tier, "manual");
  assert.equal(new Set(PACKS[0].objects.map((o) => o.id)).size, PACKS[0].objects.length);
});

test("a hidden pit drops whoever steps on it, 1d6 and no save, and a spiked pit adds 2d8 piercing", () => {
  const s0 = floor([thing("pit", "hidden-pit", 1, 0), thing("spikes", "spiked-pit", 1, 1)]);
  const r = walk(structuredClone(s0));
  ok(r);
  assert.deepEqual(types(r).slice(0, 4), ["moved", "triggered", "object", "fell"]);
  assert.equal(r.events.some((e) => e.type === "save"), false);
  assert.equal(r.events.find((e) => e.type === "fell").feet, 10);
  const c = structuredClone(s0);
  ok(apply(c, { type: "place", actor: "fighter", to: { q: 0, r: 1 } }, DM));
  const spiked = ok(apply(c, { type: "move", actor: "fighter", to: { q: 1, r: 1 } }, PAT));
  const dmg = spiked.events.filter((e) => e.type === "damage");
  assert.ok(dmg.length >= 2, "fall damage and spike damage are two separate hits");
  assert.equal(c.map.objects.find((o) => o.id === "spikes").state, "open");
});

test("a collapsing roof makes a Dexterity save at DC 13 and hurts on a fail, half or nothing on a success", () => {
  const s0 = floor([thing("roof", "collapsing-roof", 1, 0)]);
  const hurt = until(s0, walk, (r) => r.events.some((e) => e.type === "save" && !e.success));
  const save = hurt.r.events.find((e) => e.type === "save");
  assert.equal(save.dc, 13);
  assert.equal(save.abil, "dex");
  const hit = hurt.r.events.find((e) => e.type === "damage");
  assert.ok(hit && hit.amount >= 2 && hit.amount <= 20);
  assert.equal(hurt.s.map.objects[0].state, "sprung");
  assert.ok(types(hurt.r).includes("manual"), "the rest of the ceiling is handed to the DM");
  const spared = until(s0, walk, (r) => r.events.some((e) => e.type === "save" && e.success));
  assert.equal(spared.s.map.objects[0].state, "sprung");
});

test("a falling net restrains on a failed DC 10 save", () => {
  const s0 = floor([thing("net", "falling-net", 1, 0)]);
  const caught = until(s0, walk, (r) => r.events.some((e) => e.type === "save" && !e.success));
  assert.equal(caught.r.events.find((e) => e.type === "save").dc, 10);
  assert.ok(caught.r.events.some((e) => e.type === "cond" && e.cond === "restrained"));
});

test("a poisoned needle sets off when the lock is opened wrongly", () => {
  const s0 = floor([thing("needle", "poisoned-needle", 0, 0, { state: "found" })]);
  ok(apply(s0, { type: "move", actor: "fighter", to: { q: -1, r: 0 } }, PAT));
  const hurt = until(s0, (c) => apply(c, { type: "use", actor: "fighter", object: "needle", verb: "open-lock" }, PAT), (r) => r.ok && r.events.some((e) => e.type === "save" && !e.success));
  assert.equal(hurt.r.events.find((e) => e.type === "save").dc, 11);
  assert.equal(hurt.r.events.find((e) => e.type === "save").abil, "con");
  assert.equal(hurt.s.map.objects[0].state, "sprung");
  assert.ok(hurt.r.events.some((e) => e.type === "damage"));
  assert.ok(hurt.r.events.some((e) => e.type === "cond" && e.cond === "poisoned"));
});

test("the rolling stone hands everything to the DM and the fire statue fires on the plate", () => {
  const stone = apply(floor([thing("stone", "rolling-stone", 1, 0)]), { type: "move", actor: "fighter", to: { q: 3, r: 0 } }, PAT);
  ok(stone);
  assert.ok(types(stone).includes("manual"));
  assert.equal(types(stone).includes("damage"), false);
  const s1 = floor([thing("statue", "fire-casting-statue", 1, 0)]);
  const burnt = until(s1, walk, (r) => r.events.some((e) => e.type === "save" && !e.success));
  assert.equal(burnt.r.events.find((e) => e.type === "save").dc, 15);
  assert.ok(burnt.r.events.some((e) => e.type === "damage"));
  assert.equal(burnt.s.map.objects[0].state, "pressed");
});

test("a statue and a crate cannot be walked onto, a campfire can", () => {
  for (const def of ["statue", "crate"]) {
    const s = floor([thing("x", def, 1, 0)]);
    assert.equal(apply(s, { type: "move", actor: "fighter", to: { q: 1, r: 0 } }, PAT).ok, false, def);
  }
  const s = floor([thing("cf", "campfire", 1, 0)]);
  ok(apply(s, { type: "move", actor: "fighter", to: { q: 1, r: 0 } }, PAT));
});
