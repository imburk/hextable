// Wave 4, part 6, of issue #786: Knock (assist), through a spell that can be aimed at a map object (`target.object`).
// Built to docs/specs/rules-expansion.md, "Build notes: wave 4 part 6". Every test goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { apply } from "../src/engine.js";
import * as H from "../src/hex.js";
import { newMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";
import { viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const thing = (id, def, q, r, more = {}) => ({ id, def, level: "ground", at: { q, r }, state: CONTENT.objects[def].initial, ...(CONTENT.objects[def].kind === "door" ? { edge: 0 } : {}), ...more });

function floor(objects = [], walls = []) {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 30).map((h) => [H.col(h), { t: "stone" }]));
  const s = newGame(9);
  ok(apply(s, { type: "loadMap", map: newMap({ id: "floor", name: "A floor", starts: [{ q: 0, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }], walls, objects }) }, DM));
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const [i, id] of ["fighter", "rogue", "cleric"].entries()) ok(apply(s, { type: "place", actor: id, to: { q: -20, r: 5 + i } }, DM));
  ok(apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM));
  Object.assign(s.entities.wizard, { slots: { 1: 4, 2: 3 }, slotsMax: { 1: 4, 2: 3 } });
  s.entities.wizard.spells.push("knock");
  return s;
}
const knock = (s, object, who = DM) => apply(s, { type: "cast", actor: "wizard", spell: "knock", slot: 2, object }, who);
const lint = (def) => lintEntry("spells", def, { strict: false });
const toDm = (r) => r.events.filter((e) => e.type === "manual" && e.partial).map((e) => e.text).join("\n");

test("tier and shape: Knock is assist, aimed at a map object within 60 feet", () => {
  const sp = SPELLS.knock;
  assert.equal(sp.def.tier, "assist");
  assert.equal(sp.aim, "object");
  assert.equal(sp.range, 60);
  assert.deepEqual(lint(sp.def), []);
});

test("an object-aimed spell is linted: a range in feet, and a step that works on the object", () => {
  const base = structuredClone(SPELLS.knock.def);
  assert.ok(lint({ ...base, range: "touch" }).some((m) => /range in feet/.test(m)));
  assert.ok(lint({ ...base, effects: [{ manual: "x" }] }).some((m) => /`set` or `reveal`/.test(m)));
  assert.ok(lint({ ...base, target: { object: { x: 1 } } }).length);
  assert.ok(lint({ ...base, effects: [{ set: "closed", from: "Not A State" }, { manual: "x" }] }).length);
});

test("a locked iron door within 60 feet is unlocked; the slot and nothing else is spent", () => {
  const s = floor([thing("c1", "door-iron", 5, 0, { state: "locked", key: "iron-key" })]);
  const r = ok(knock(s, "c1"));
  assert.equal(s.map.objects[0].state, "closed");
  assert.equal(s.entities.wizard.slots[2], 2);
  const o = r.events.find((e) => e.type === "object");
  assert.equal(o.state, "closed");
  assert.equal(r.events.find((e) => e.type === "cast").object, "c1");
  assert.ok(r.events.some((e) => e.type === "manual" && /audible up to 300 feet/.test(e.text) && /Arcane Lock/.test(e.text)), "the DM is handed the knock, Arcane Lock and the rest");
});

test("a locked chest is unlocked; one lock only (the object has one)", () => {
  const s = floor([thing("box", "chest", 3, 3, { state: "locked" })]);
  ok(knock(s, "box"));
  assert.equal(s.map.objects[0].state, "closed");
});

test("an object that is not locked is left as it is, and the cast is still made and paid for", () => {
  const s = floor([thing("d", "door-wooden", 4, 0, { state: "open" }), thing("e", "door-wooden", 4, 2, { state: "closed" })]);
  const r = ok(knock(s, "d"));
  assert.equal(s.map.objects[0].state, "open", "an open door is not closed by it");
  assert.equal(s.entities.wizard.slots[2], 2);
  assert.ok(r.events.some((e) => e.type === "note" && /nothing is held shut/.test(e.text)));
  ok(knock(s, "e"));
  assert.equal(s.map.objects[1].state, "closed");
});

test("refused before anything is spent: out of range, out of sight, not lockable, no object, not a name", () => {
  const s = floor([
    thing("far", "door-iron", 15, 0, { state: "locked" }),                    // 75 feet
    thing("lever", "lever", 3, 0),
    thing("near", "door-iron", 3, 2, { state: "locked" }),
  ], [{ id: "w", level: "ground", a: [-100, 9], b: [100, 9], kind: "wall" }]);
  s.map.objects.push(thing("behind", "door-iron", 0, 8, { state: "locked" }));
  const before = JSON.stringify(s);
  for (const [object, re] of [["far", /75 ft away/], ["behind", /can't see/], ["lever", /has none/], ["nobody", /No such object/], [7, /Pick an object/], [undefined, /Pick an object/]]) {
    const r = knock(s, object);
    assert.equal(r.ok, false, String(object));
    assert.match(r.error, re);
    assert.equal(JSON.stringify(s), before, "a rejected action changes nothing");
  }
  s.entities.wizard.cond.blinded = true;
  assert.match(knock(s, "near").error, /Blinded/);
});

test("a creature's player cannot name an undiscovered secret door: the refusal is that of an object that is not there", () => {
  const s = floor([thing("sd", "secret-door", 4, 0)]);
  const P = { role: "player", userId: "pat" };
  s.entities.wizard.owner = "pat";
  s.entities.wizard.spells.push("knock");
  const hidden = knock(s, "sd", P), absent = knock(s, "nothing-here", P);
  assert.equal(hidden.ok, false);
  assert.equal(hidden.error, absent.error, "the same words either way");
  assert.equal(s.entities.wizard.slots[2], 3);
  assert.equal(s.map.objects[0].state, "secret");
});

test("a player sees the unlock and the knock's cast as any object event; the DM-only notes stay with the DM", () => {
  const s = floor([thing("c1", "door-iron", 5, 0, { state: "locked", key: "iron-key" })]);
  const P = { role: "player", userId: "pat" };
  const r = ok(knock(s, "c1"));
  const seen = JSON.stringify(viewEvents(r.events, s, P));
  assert.match(seen, /"object":"c1"/);
  assert.ok(toDm(r) === "" || !seen.includes(toDm(r)), "partial manual notes are not sent");
});
