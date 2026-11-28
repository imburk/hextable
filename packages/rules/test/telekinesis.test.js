// Telekinesis (#910, B5b): a `move` step with `dir: "chosen"` puts the target in the space the cast names (`hex`), refused at the cast when it does not fit.
// Built to docs/specs/rules-expansion.md, "Build notes: B5b". Every cast goes through apply().
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { apply } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const lint = (def) => lintEntry("spells", def, { strict: false });

// The wizard at 0,0 with level-5 slots; a goblin 4 hexes away (20 ft). A big open field.
function field(monster = "goblin-warrior", at = { q: 4, r: 0 }) {
  const s = newGame(5);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (let q = -16; q <= 40; q++) for (let r = -12; r <= 12; r++) s.map.levels[0].tiles[`${q},${r}`] = { t: "grass" };
  s.settings.autoEngage = false;
  for (const [id, q, r] of [["wizard", 0, 0], ["fighter", -2, 0], ["rogue", -4, 2], ["cleric", -3, 0]]) ok(apply(s, { type: "place", actor: id, to: { q, r } }, DM));
  Object.assign(s.entities.wizard, { slots: { 5: 2 }, slotsMax: { 5: 2 }, level: 9 });
  s.entities.wizard.spells.push("telekinesis");
  const id = Object.keys(ok(apply(s, { type: "spawn", monster, at }, DM)).state?.entities ?? s.entities).find((k) => !s.entities[k].side || s.entities[k].side !== "party");
  ok(apply(s, { type: "startEncounter", center: { q: 6, r: 0 }, radius: 14 }, DM));      // a harmful cast outside a fight starts one instead of casting
  for (let i = 0; i < 6 && s.encounter.order[s.encounter.turn].id !== "wizard"; i++) ok(apply(s, { type: "endTurn", actor: s.encounter.order[s.encounter.turn].id }, DM));
  return { s, g: id };
}
const cast = (s, g, hex, ctx = DM) => apply(s, { type: "cast", actor: "wizard", spell: "telekinesis", slot: 5, targets: [g], hex }, ctx);
const refused = (s, g, hex, re) => { const was = JSON.stringify(s); const r = cast(s, g, hex); assert.ok(!r.ok, "refused"); if (re) assert.match(r.error, re); assert.equal(JSON.stringify(s), was, "nothing changed"); };
const weak = (s, g) => { s.entities[g].saveBonus = { ...s.entities[g].saveBonus, str: -40 }; };
const strong = (s, g) => { s.entities[g].saveBonus = { ...s.entities[g].saveBonus, str: 40 }; };

test("B5b: Telekinesis is assist, lints, and reads in plain words", () => {
  const d = SPELLS.telekinesis.def;
  assert.equal(d.tier, "assist");
  assert.deepEqual(lint(d), []);
  const r = readEntry("spell", d, {});
  assert.deepEqual(r.problems ?? [], []);
  assert.match(JSON.stringify(r), /moved up to 30 feet to a space the caster chooses/);
  assert.ok(lint({ ...d, effects: [{ save: "str", onFail: [{ move: 30, dir: "sideways" }] }] }).length, "a bad dir is refused");
});

test("B5b: a failed save moves the target to the named space and Restrains it until the end of the caster's next turn", () => {
  const { s, g } = field(); weak(s, g);
  const slots = s.entities.wizard.slots[5];
  const r = ok(cast(s, g, { q: 6, r: 3 }));
  assert.deepEqual([s.entities[g].pos.q, s.entities[g].pos.r], [6, 3]);
  assert.equal(s.entities.wizard.slots[5], slots - 1);
  assert.ok(r.events.some((e) => e.type === "moved" && e.id === g && e.forced && e.path.length === 1));
  assert.ok(s.entities[g].cond.restrained, "restrained");
  assert.ok(s.effects.some((x) => /Telekinesis/.test(x.name)), "Concentration effect");
});

test("B5b: a passed save leaves it where it stood and unrestrained", () => {
  const { s, g } = field(); strong(s, g);
  const was = { ...s.entities[g].pos };
  ok(cast(s, g, { q: 6, r: 3 }));
  assert.deepEqual({ ...s.entities[g].pos }, was);
  assert.ok(!s.entities[g].cond.restrained);
});

test("B5b: a space too far from the target, out of the spell's range, off the map, on top of a creature or at a height is refused before anything changes", () => {
  const { s, g } = field(); weak(s, g);
  refused(s, g, undefined, /Pick the space/);
  refused(s, g, { q: 4, r: 0 }, /already there/);
  refused(s, g, { q: 4 + 7, r: 0 }, /30 ft/);                 // 35 ft from the goblin
  refused(s, g, { q: 100, r: 0 }, /stand on/);
  refused(s, g, { q: -2, r: 0 }, /occupied/);                  // the fighter
  refused(s, g, { q: 4, r: 1, z: 20 }, /ground only|stand on/);
  // Out of the caster's 60 feet: the goblin at 9 hexes (45 ft), the space 30 ft further on.
  const f = field("goblin-warrior", { q: 11, r: 0 }); weak(f.s, f.g);
  refused(f.s, f.g, { q: 16, r: 0 }, /reaches 60 ft/);
  assert.ok(cast(f.s, f.g, { q: 12, r: 0 }).ok, "inside both limits");
});

test("B5b: a target bigger than Huge is not moved (and not Restrained), the cast stands", () => {
  const { s, g } = field(); weak(s, g); s.entities[g].size = "gargantuan";
  const was = { ...s.entities[g].pos };
  const r = ok(cast(s, g, { q: was.q + 1, r: was.r + 3 }));
  assert.deepEqual({ ...s.entities[g].pos }, was);
  assert.ok(!s.entities[g].cond.restrained);
  assert.ok(r.events.some((e) => e.type === "note" && /bigger than Huge/.test(e.text)));
});

test("B5b: the Restrained condition ends with the caster's next turn", () => {
  const { s, g } = field(); weak(s, g);
  ok(cast(s, g, { q: 6, r: 3 }));
  assert.ok(s.entities[g].cond.restrained);
  for (let i = 0; i < 12 && s.entities[g].cond.restrained; i++) {
    const cur = s.encounter.order[s.encounter.turn].id; ok(apply(s, { type: "endTurn", actor: cur }, DM));
  }
  assert.ok(!s.entities[g].cond.restrained, "gone by the end of the caster's next turn");
});

// #911 review: a creature the party does not know of on the named space. Landing anywhere else would tell the players something stands there,
// so the target lands where it was put, shares the space for now, and only the DM is told (as a teleport into an unknown creature's space).
test("B5b: a hidden creature on the named space: the target lands there all the same and the DM alone is told", () => {
  const { s, g } = field(); weak(s, g);
  const r0 = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 6, r: 3 } }, DM));
  const h = Object.keys(s.entities).find((k) => k !== g && s.entities[k].side !== "party");
  assert.ok(h && r0.ok);
  s.entities[h].hidden = true;
  const r = ok(cast(s, g, { q: 6, r: 3 }));
  assert.deepEqual([s.entities[g].pos.q, s.entities[g].pos.r], [6, 3], "on the named space, as with nobody there");
  assert.ok(r.events.some((e) => e.type === "moved" && e.id === g && e.path[0].q === 6 && e.path[0].r === 3));
  assert.ok(r.events.some((e) => e.type === "manual" && /did not know of/.test(e.text)), "the DM is told");
});
