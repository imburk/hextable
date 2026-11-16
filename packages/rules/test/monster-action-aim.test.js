// Issue #421, item 4 (DEBT T54): a creature target with neither `reach` nor `range`. The linter refuses it (ordinary and strict, and so
// loadPack); if one is met anyway (a saved game, an entry that skipped the gate) the engine refuses the action with a sentence and
// changes nothing, and the monster AI skips the action and plays on.
import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import { CONTENT } from "../src/content/index.js";
import { loadPack } from "../src/content/registry.js";
import { lintEntry, lintPack } from "../src/content/schema.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const P = "ember-folk", SRC = `homebrew:${P}`;
const monster = (actions) => ({
  id: `hb-${P}-cinderling`, name: "Cinderling", source: SRC, size: "small", type: "elemental", cr: 0.25, xp: 50, pb: 2, ac: 13, hp: 9, speed: { walk: 30 },
  abilities: { str: 8, dex: 14, con: 10, int: 6, wis: 10, cha: 8 }, resist: [], vulnerable: [], immune: [], traits: [], actions,
  tier: "auto", checked: false, text: "A small spirit of embers.",
});
const act = (target) => ({ id: "scorch", name: "Scorch", text: "A burning touch.", target, effects: [{ attack: "melee", kind: "weapon", bonus: 4, onHit: [{ damage: "1d6+2", type: "fire" }] }] });
const DOC = (m) => ({ format: "hextable-pack", v: 1, pack: { id: P, name: "Ember Folk", version: 1, license: "CC0, by the author", attribution: "Written for a test." }, monsters: [m] });

test("the linter refuses a creature target with neither reach nor range: ordinary, strict, as a pack and in loadPack", () => {
  for (const target of [{ creature: {} }, { creature: { count: 2 } }, { creature: { repeat: true } }]) {
    const m = monster([act(target)]);
    assert.match(lintEntry("monsters", m, { strict: false }).join("\n"), /action scorch: a creature target needs `reach`/);
    assert.match(lintEntry("monsters", m, { pack: P, srd: CONTENT }).join("\n"), /a creature target needs `reach`/);
    assert.match(lintPack(DOC(m)).join("\n"), /a creature target needs `reach`/);
    const loaded = loadPack(DOC(m));
    assert.equal(loaded.ok, false);
    assert.match(loaded.problems.join("\n"), /a creature target needs `reach`/);
  }
  for (const target of [{ creature: { reach: 5 } }, { creature: { range: [30, 120] } }, { creature: { reach: 5, range: [20, 60] } }]) {
    assert.deepEqual(lintEntry("monsters", monster([act(target)]), { pack: P, srd: CONTENT }), []);
    assert.equal(loadPack(DOC(monster([act(target)]))).ok, true);
  }
});

// Open ground, a goblin beside the wizard whose first action has nothing to aim by.
function field(actions) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM);
  apply(s, { type: "place", actor: "fighter", to: { q: -6, r: 0 } }, DM);
  const g = s.entities[ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 } }, DM)).events[0].id];
  g.actions = [...actions, ...g.actions];
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  for (let i = 0; i < 20 && current(s) !== g.id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  return { s, g };
}
const BAD = { id: "bad-touch", name: "Bad Touch", target: { creature: {} }, effects: [{ attack: "melee", kind: "weapon", bonus: 9, onHit: [{ damage: "1d6", type: "fire" }] }] };

test("the engine refuses an action it cannot aim with a sentence, and nothing changes", () => {
  const { s, g } = field([BAD]);
  const before = JSON.stringify(s);
  let r;
  assert.doesNotThrow(() => { r = apply(s, { type: "act", actor: g.id, action: "bad-touch", target: "wizard" }, DM); });
  assert.equal(r.ok, false);
  assert.match(r.error, /Goblin Warrior 1's Bad Touch says neither how far it reaches nor how far it shoots/);
  assert.equal(JSON.stringify(s), before, "the game is as it was");
});
test("a Multiattack made of one it cannot aim is refused the same way, with nothing spent", () => {
  const { s, g } = field([BAD, { id: "flurry", name: "Flurry", multiattack: [{ action: "bad-touch", times: 2 }] }]);
  ok(apply(s, { type: "act", actor: g.id, action: "flurry" }, DM));
  const before = JSON.stringify(s);
  const r = apply(s, { type: "act", actor: g.id, action: "bad-touch", target: "wizard" }, DM);
  assert.equal(r.ok, false);
  assert.match(r.error, /cannot be aimed/);
  assert.equal(JSON.stringify(s), before);
});
test("the monster AI skips an action it cannot aim and plays on with the rest", () => {
  const { s, g } = field([BAD]);
  let a;
  assert.doesNotThrow(() => { a = aiStep(s, g.id); });
  assert.ok(a);
  assert.notEqual(a.action, "bad-touch");
  // With nothing else it could do, it ends its turn rather than throw.
  g.actions = [BAD];
  assert.doesNotThrow(() => { a = aiStep(s, g.id); });
  assert.ok(["endTurn", "move", "dash"].includes(a.type), a.type);
});

// What apply() does when a handler throws something that is not a rule refusal, after it has changed things (#421, last part of item 4).
// Content cannot do this through the gate; a saved game or an entry that skipped it can, and so can a bug.
const BOOM = { id: "boom", name: "Boom", target: { creature: { reach: 5 } }, effects: [{ condition: "prone" }, { damage: null, type: "fire" }] };
test("an action that throws part way, after it changed things, leaves the game as it was, and still throws", () => {
  const { s, g } = field([BOOM]);
  const before = JSON.stringify(s), dm = s.entities.wizard;
  assert.throws(() => apply(s, { type: "act", actor: g.id, action: "boom", target: "wizard" }, DM), /Bad dice expression/);
  assert.equal(JSON.stringify(s), before, "no condition, no spent action, no Hit Points lost, no stack left over");
  assert.equal(s.stack, undefined);
  assert.equal(s.entities.wizard.cond.prone, undefined);
  assert.ok(dm.id === "wizard");
  // The same game goes on: the creature can still do something else, and the dice are where they were.
  ok(apply(s, { type: "act", actor: g.id, action: g.actions.find((a) => a.id !== "boom").id, target: "wizard" }, DM));
});
test("a refusal and a throw each leave the game as it was, and a throw is not turned into a refusal", () => {
  const { s, g } = field([BOOM, BAD]);
  const before = JSON.stringify(s);
  assert.equal(apply(s, { type: "act", actor: g.id, action: "bad-touch", target: "wizard" }, DM).ok, false);
  assert.equal(JSON.stringify(s), before);
  assert.throws(() => apply(s, { type: "act", actor: g.id, action: "boom", target: "wizard" }, DM));
  assert.equal(JSON.stringify(s), before);
});
