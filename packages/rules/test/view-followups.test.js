// What players are sent of Temporary Hit Points, of a single-use modifier a save spends, and of
// the turns of creatures the party cannot see (DEBT S10, P15).
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, SPELLS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";
import { spellProfile } from "../src/effects.js";
import { apply, current } from "../src/engine.js";
import { migrate } from "../src/migrate.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" }, PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const pack = { id: "test", name: "t", license: "x", attribution: "x" };

function field(seed = 5) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  ok(apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM));
  Object.assign(s.entities.wizard, { slots: { 1: 9 }, slotsMax: { 1: 9 }, hp: 200, maxHp: 200 });
  const goblin = s.entities[ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 2, r: 0 } }, DM)).events[0].id];
  Object.assign(goblin, { hp: 500, maxHp: 500 });
  return { s, goblin, wizard: s.entities.wizard };
}
// A fight around the wizard, on the turn of `id`.
function inTurn(s, id) {
  if (!s.encounter) ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.equal(current(s), id);
}
function learn(s, who, over) {
  const def = { ...structuredClone(CONTENT.spells["fire-bolt"]), higher: undefined, level: 1, range: 60, ...over };
  assert.deepEqual(lintPack({ pack, spells: [def] }), [], def.id);
  SPELLS[def.id] = spellProfile(def);
  s.entities[who].spells.push(def.id);
  return def.id;
}

test("Temporary Hit Points: a player is told of their own characters', never of a creature not theirs", () => {
  const { s, goblin, wizard } = field();
  const ward = learn(s, "wizard", { id: "test-ward", name: "Test Ward", target: { creature: {} }, duration: "1 hour", concentration: false, effects: [{ tempHp: "2d4+4" }] });
  const mine = ok(apply(s, { type: "cast", actor: "wizard", spell: ward, target: "wizard" }, DM));
  const got = wizard.tempHp;
  assert.ok(got >= 6);
  const [told0] = viewEvents(mine.events, s, PAT).filter((e) => e.type === "tempHp");
  assert.deepEqual({ ...told0, dice: undefined, bonus: undefined }, { type: "tempHp", id: "wizard", amount: got, tempHp: got, dice: undefined, bonus: undefined });
  assert.equal(told0.dice.length, 2, "the faces of the wizard's own roll go with it (docs/specs/dice.md)");
  assert.equal(told0.bonus, 4);
  const theirs = ok(apply(s, { type: "cast", actor: "wizard", spell: ward, target: goblin.id }, DM));
  assert.ok(theirs.events.some((e) => e.type === "tempHp" && e.id === goblin.id));
  assert.deepEqual(viewEvents(theirs.events, s, PAT).filter((e) => e.type === "tempHp"), [], "a goblin's hit points are its own business");
  assert.equal(JSON.stringify(view(s, PAT).entities[goblin.id]).includes("tempHp"), false);
  // Losing them when the effect that gave them ends: told for ours, not for theirs.
  const end = ok(apply(s, { type: "advanceTime", minutes: 61 }, DM));
  const told = viewEvents(end.events, s, PAT).filter((e) => e.type === "tempHp");
  assert.deepEqual(told.map((e) => e.id), ["wizard"]);
  assert.equal(told[0].amount, -got);
});

test("a single-use modifier that a saving throw spends ends with an effectEnd event, after the save, sent as other ends are", () => {
  const { s, goblin } = field();
  const luck = learn(s, "wizard", { id: "test-luck", name: "Test Luck", target: { creature: {} }, duration: "1 minute", concentration: false,
    effects: [{ modifier: { on: "save", op: "advantage", uses: 1 } }] });
  const flame = learn(s, "wizard", { id: "test-flame", name: "Test Flame", level: 0, target: { creature: {} },
    effects: [{ save: "dex", onFail: [{ damage: "1d4", type: "radiant" }] }], dc: 10 });
  inTurn(s, "wizard");
  ok(apply(s, { type: "cast", actor: "wizard", spell: luck, target: goblin.id }, DM));
  assert.equal(s.effects.length, 1);
  s.encounter.budget.action = 1;
  const res = ok(apply(s, { type: "cast", actor: "wizard", spell: flame, target: goblin.id }, DM));
  const types = res.events.map((e) => e.type), save = types.indexOf("save"), end = types.indexOf("effectEnd");
  assert.ok(save >= 0 && end > save, `the save, then the end: ${types}`);
  assert.equal(res.events[save].mode, "adv");
  assert.equal(res.events[end].why, "it was used");
  assert.equal("used" in res.events[save], false, "the parts it used are not part of the save's event");
  assert.deepEqual(s.effects, []);
  // The wizard's own effect: players are told it ended, as they are told any other end.
  const told = viewEvents(res.events, s, PAT).find((e) => e.type === "effectEnd");
  assert.deepEqual(told, { type: "effectEnd", fx: res.events[end].fx, name: "Test Luck", source: "wizard", why: "it was used", targets: [goblin.id] });
  // The same luck on a goblin from a goblin is not theirs to hear about.
  const s2 = field().s, g2 = Object.values(s2.entities).find((e) => e.side !== "party");
  learn(s2, g2.id, { id: "test-luck", name: "Test Luck", target: { creature: {} }, duration: "1 minute", concentration: false, effects: [{ modifier: { on: "save", op: "advantage", uses: 1 } }] });
  g2.slots = { 1: 3 }; g2.slotsMax = { 1: 3 };
  inTurn(s2, g2.id);
  ok(apply(s2, { type: "cast", actor: g2.id, spell: "test-luck", target: g2.id }, DM));
  learn(s2, "wizard", { id: "test-flame", name: "Test Flame", level: 0, target: { creature: {} }, effects: [{ save: "dex", onFail: [{ damage: "1d4", type: "radiant" }] }], dc: 10 });
  inTurn(s2, "wizard");
  const r2 = ok(apply(s2, { type: "cast", actor: "wizard", spell: "test-flame", target: g2.id }, DM));
  assert.ok(r2.events.some((e) => e.type === "effectEnd"));
  assert.equal(viewEvents(r2.events, s2, PAT).some((e) => e.type === "effectEnd"), false);
});

test("the table rule for unseen turns: say by default, quiet by choice, the DM's to set, and given to older saved tables", () => {
  const s = newGame(3);
  assert.equal(s.settings.unseenTurns, "say");
  assert.equal(apply(s, { type: "setting", key: "unseenTurns", value: "quiet" }, PAT).error, "Only the DM can change table settings.");
  assert.equal(apply(s, { type: "setting", key: "unseenTurns", value: "whisper" }, DM).error, "That setting can be: say, quiet.");
  ok(apply(s, { type: "setting", key: "unseenTurns", value: "quiet" }, DM));
  const old = JSON.parse(JSON.stringify(newGame(3)));
  delete old.settings.unseenTurns;
  assert.equal(migrate(old).settings.unseenTurns, "say");
});
