// Ability checks, the Search action and noticing things in passing (task M5 of docs/specs/maps-and-objects.md).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CONTENT } from "../src/content/index.js";
import { apply, checkBonus, current, passive } from "../src/engine.js";
import * as H from "../src/hex.js";
import { newMap } from "../src/map.js";
import { migrate } from "../src/migrate.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const obj = (s, id) => s.map.objects.find((o) => o.id === id);
const thing = (id, def, q, r, more = {}) => ({ id, def, level: "ground", at: { q, r }, state: CONTENT.objects[def].initial, ...more });

function floor(objects = [], walls = []) {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 7).map((h) => [H.col(h), { t: "stone" }]));
  const s = newGame(9);
  ok(apply(s, { type: "loadMap", map: newMap({ id: "floor", name: "A floor", starts: [{ q: -5, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }], walls, objects }) }, DM));
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  apply(s, { type: "claim", entity: "fighter", user: "pat", userName: "Pat" }, PAT);
  ok(apply(s, { type: "place", actor: "fighter", to: { q: -2, r: 0 } }, DM));
  return s;
}
// Try an action on copies of the state with different dice until `want` holds.
function until(s, act, want) {
  for (let seed = 1; seed < 500; seed++) { const c = structuredClone(s); c.rng = seed; const r = act(c); if (want(r, c)) return { s: c, r }; }
  throw new Error("no seed gave the wanted outcome");
}

test("a check adds the ability, proficiency in the skill or tool, twice for Expertise, or a monster's listed bonus", () => {
  const s = newGame(1), { fighter, rogue, wizard, m1 } = s.entities;
  assert.equal(checkBonus(fighter, { skill: "athletics" }), 3 + 2);
  assert.equal(checkBonus(fighter, { skill: "stealth" }), 1);                      // not proficient
  assert.equal(checkBonus(rogue, { skill: "stealth" }), 3 + 4);                    // Expertise
  assert.equal(checkBonus(rogue, { ability: "dex", tool: "thieves-tools" }), 3 + 2);
  assert.equal(checkBonus(fighter, { ability: "dex", tool: "thieves-tools" }), 1);
  assert.equal(checkBonus(wizard, { ability: "int" }), 3);
  assert.equal(m1.tpl, "goblin-warrior");
  assert.equal(checkBonus(m1, { skill: "stealth" }), 6);
  assert.equal(checkBonus(m1, { skill: "perception" }), -1);
  assert.equal(passive(s, fighter, "perception"), 10 + 1 + 2);
  ok(apply(s, { type: "condition", actor: "fighter", condition: "poisoned" }, DM));
  assert.equal(passive(s, fighter, "perception"), 13 - 5);                        // Disadvantage is 5 less on a passive score
});

test("anyone can roll a check for their character; only the DM sets a DC, and players are told neither it nor the outcome", () => {
  const s = floor();
  const mine = ok(apply(s, { type: "check", actor: "fighter", skill: "athletics" }, PAT));
  assert.deepEqual(Object.keys(mine.events[0]).sort(), ["ability", "bonus", "id", "roll", "skill", "total", "type"]);
  assert.equal(mine.events[0].total, mine.events[0].roll + 5);
  assert.equal(apply(s, { type: "check", actor: "fighter", skill: "athletics", dc: 12 }, PAT).error, "Only the DM sets a DC.");
  assert.equal(apply(s, { type: "check", actor: "fighter", skill: "juggling" }, PAT).error, "Unknown skill.");
  assert.equal(apply(s, { type: "check", actor: "fighter" }, PAT).error, "Name a skill or an ability.");
  assert.equal(apply(s, { type: "check", actor: "rogue", skill: "stealth" }, PAT).error, "Pip isn't yours to control.");
  const called = ok(apply(s, { type: "check", actor: "fighter", skill: "insight", dc: 14 }, DM));
  assert.equal(called.events[0].success, called.events[0].total >= 14);
  const theirs = viewEvents(called.events, s, PAT)[0];
  assert.equal(theirs.total, called.events[0].total);
  assert.equal("dc" in theirs || "success" in theirs, false);
  // A raw ability, with Disadvantage from a condition: two dice, the lower counts.
  ok(apply(s, { type: "condition", actor: "fighter", condition: "poisoned" }, DM));
  const dis = ok(apply(s, { type: "check", actor: "fighter", ability: "str" }, PAT)).events[0];
  assert.equal(dis.mode, "dis");
  assert.equal(dis.roll, Math.min(...dis.rolls));
  // A monster's check is the DM's business.
  const gob = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 3, r: 0 } }, DM)).events[0].id;
  assert.deepEqual(viewEvents(ok(apply(s, { type: "check", actor: gob, skill: "stealth" }, DM)).events, s, PAT), []);
});

test("searching finds what is hidden nearby if the roll meets its DC, and not otherwise", () => {
  const s0 = floor([thing("pit", "pit-trap", 0, 0), thing("far", "pit-trap", 4, 0), { id: "sd", def: "secret-door", level: "ground", at: { q: -2, r: 1 }, edge: 5, state: "secret", dc: { find: 12 } }]);
  const search = (c) => apply(c, { type: "search", actor: "fighter" }, PAT);
  // Brenna's Perception is +3: a total of 12 to 14 finds the door (DC 12) but not the pit (DC 15).
  const some = until(s0, search, (r) => r.events[0].total >= 12 && r.events[0].total < 15);
  assert.deepEqual(some.r.events.map((e) => [e.type, e.object ?? e.found]), [["check", 1], ["object", "sd"]]);
  assert.equal(obj(some.s, "sd").state, "closed");
  assert.equal(obj(some.s, "pit").state, "hidden");
  const all = until(s0, search, (r) => r.events[0].total >= 15);
  assert.deepEqual(all.r.events.map((e) => e.object ?? e.found), [2, "pit", "sd"]);
  assert.equal(obj(all.s, "pit").state, "found");
  assert.equal(obj(all.s, "far").state, "hidden");                                 // 30 ft away is out of reach of a search
  const none = until(s0, search, (r) => r.events[0].total < 12);
  assert.deepEqual(none.r.events.map((e) => e.type), ["check"]);
  assert.equal(none.r.events[0].found, 0);
  // What players are sent: their roll and how many things turned up. Never a DC, and nothing of what stayed hidden.
  const sent = JSON.stringify([viewEvents(some.r.events, some.s, PAT), view(some.s, PAT)]);
  for (const word of ['"dc"', "pit", "Pit trap"]) assert.equal(sent.includes(word), false, word);
});

test("a search does not reach through a wall, and in a fight it takes the action", () => {
  const wall = { id: "w", level: "ground", a: [-7.5, -30], b: [-7.5, 30], kind: "wall" };          // between q = -2 and q = -1 on row 0
  const s0 = floor([thing("pit", "pit-trap", 0, 0, { dc: { find: 1 } })], [wall]);
  assert.equal(ok(apply(structuredClone(s0), { type: "search", actor: "fighter" }, PAT)).events[0].found, 0);
  const s = floor([thing("pit", "pit-trap", 0, 0, { dc: { find: 1 } })]);
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 5, r: 0 } }, DM));
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 7 }, DM));
  if (current(s) === "fighter") ok(apply(s, { type: "endTurn", actor: "fighter" }, DM));
  assert.equal(apply(s, { type: "search", actor: "fighter" }, PAT).error, "It isn't Brenna's turn.");
  while (current(s) !== "fighter") ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.equal(ok(apply(s, { type: "search", actor: "fighter" }, PAT)).events[0].found, 1);
  assert.equal(s.encounter.budget.action, 0);
  assert.equal(apply(s, { type: "search", actor: "fighter" }, PAT).error, "Brenna has already used an action this turn.");
});

test("noticing things in passing is a table rule: off, traps only, or everything", () => {
  const objects = [thing("pit", "pit-trap", 1, 0, { dc: { find: 12 } }), thing("deep", "pit-trap", 1, 3), { id: "sd", def: "secret-door", level: "ground", at: { q: 0, r: -1 }, edge: 2, state: "secret", dc: { find: 10 } }];
  const walk = (s) => apply(s, { type: "move", actor: "fighter", to: { q: 3, r: 0 } }, PAT);
  // Off, as a new game is: Brenna walks onto the pit.
  const off = floor(objects);
  assert.equal(off.settings.passiveFind, "off");
  assert.ok(ok(walk(off)).events.some((e) => e.type === "triggered"));
  // Traps only: her passive Perception of 13 beats the pit's DC 12 as she comes within 10 ft, and she stops.
  const traps = floor(objects);
  ok(apply(traps, { type: "setting", key: "passiveFind", value: "traps" }, DM));
  const res = ok(walk(traps));
  assert.deepEqual(res.events.map((e) => e.type), ["moved", "noticed", "object"]);
  assert.deepEqual(traps.entities.fighter.pos, { q: -1, r: 0, z: 0 });
  assert.equal(obj(traps, "pit").state, "found");
  assert.equal(obj(traps, "sd").state, "secret");                                  // not a trap
  assert.deepEqual(viewEvents(res.events, traps, PAT).map((e) => e.type), ["moved", "noticed", "object"]);
  assert.equal(JSON.stringify(viewEvents(res.events, traps, PAT)).includes('"dc"'), false);
  ok(walk(traps));                                                                 // tapping again walks around it
  assert.deepEqual(traps.entities.fighter.pos, { q: 3, r: 0, z: 0 });
  assert.equal(traps.entities.fighter.hp, traps.entities.fighter.maxHp);
  // A pit with DC 15 is beyond her: under the same rule she walks onto it.
  ok(apply(traps, { type: "move", actor: "fighter", to: { q: 1, r: 2 } }, PAT));
  assert.ok(ok(apply(traps, { type: "move", actor: "fighter", to: { q: 1, r: 3 } }, PAT)).events.some((e) => e.type === "triggered"));
  // Everything: the secret door is noticed too, before a step is taken if it is already close.
  const all = floor(objects);
  ok(apply(all, { type: "setting", key: "passiveFind", value: "all" }, DM));
  ok(apply(all, { type: "place", actor: "fighter", to: { q: 0, r: 1 } }, DM));
  const first = ok(apply(all, { type: "move", actor: "fighter", to: { q: -3, r: 1 } }, PAT));
  assert.deepEqual(first.events.map((e) => [e.type, e.object]), [["noticed", "pit"], ["object", "pit"], ["noticed", "sd"], ["object", "sd"]]);
  assert.deepEqual(all.entities.fighter.pos, { q: 0, r: 1, z: 0 });
  assert.equal(apply(all, { type: "setting", key: "passiveFind", value: "sometimes" }, DM).error, "That setting can be: off, traps, all.");
  assert.equal(apply(all, { type: "setting", key: "rng", value: 1 }, DM).error, "Unknown setting.");
});

test("a spotted trap can be disarmed with tools; a failed try leaves it armed", () => {
  const s0 = floor([thing("pit", "pit-trap", 0, 0, { state: "found" })]);
  ok(apply(s0, { type: "place", actor: "rogue", to: { q: -1, r: 0 } }, DM));
  assert.equal(apply(s0, { type: "use", actor: "fighter", object: "pit", verb: "disarm" }, PAT).error, "Brenna is too far from the pit trap.");
  const tryIt = (c) => apply(c, { type: "use", actor: "rogue", object: "pit", verb: "disarm" }, DM);
  const done = until(s0, tryIt, (r) => r.events[0].success);
  assert.equal(obj(done.s, "pit").state, "safe");
  const over = ok(apply(done.s, { type: "move", actor: "rogue", to: { q: 2, r: 0 } }, DM));
  assert.deepEqual(over.events.map((e) => e.type), ["moved"]);
  assert.ok(over.events[0].path.some((h) => h.q === 0 && h.r === 0));               // straight across it
  const not = until(s0, tryIt, (r) => !r.events[0].success);
  assert.equal(obj(not.s, "pit").state, "found");
});

test("a table saved before checks existed gets its characters' skills and the new table rule", () => {
  const saved = JSON.parse(readFileSync(new URL("./fixtures/table-v1.json", import.meta.url), "utf8")).state;
  const s = migrate(structuredClone(saved));
  assert.equal(s.version, 5);
  assert.deepEqual(s.entities.rogue.expertise, ["sleight-of-hand", "stealth"]);
  assert.deepEqual(s.entities.rogue.tools, ["thieves-tools"]);
  assert.ok(s.entities.fighter.skills.includes("perception"));
  assert.equal(s.settings.passiveFind, "off");
  for (const e of Object.values(s.entities)) assert.ok(Array.isArray(e.skills) && e.skillBonus, e.id);
});
