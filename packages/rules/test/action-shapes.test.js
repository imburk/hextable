// #691: every action in the engine's table, from the DM and from a player, with a field missing or of the wrong kind (null, a string for
// an object, an object for a string, NaN, a list), is refused with a sentence: it never throws, and a refusal changes nothing (JSON before
// and after). A bare { type: 'startEncounter' } once threw a TypeError out of hex.js; so did move and place with `to: null`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, ACTION_TYPES } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" }, PLAYER = { role: "player", userId: "u1" };
const WRONG = [null, "x", NaN, {}, { q: "a", r: "b" }, ["a"]];
const world = (fight) => {
  const s = newGame(5);
  apply(s, { type: "claim", entity: Object.keys(s.entities)[0], user: "u1", userName: "P" }, DM);
  apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: -6, r: 2 } }, DM);
  if (fight) assert.ok(apply(s, { type: "startEncounter", center: { q: -6, r: 2 }, radius: 8 }, DM).ok);
  return s;
};
const GOOD = (s) => { const id = Object.keys(s.entities)[0]; return { actor: id, entity: id, target: id, id, center: { q: 0, r: 0 }, at: { q: 0, r: 0 }, to: { q: 1, r: 0 }, pos: { q: 0, r: 0 }, radius: 3, spell: "fire-bolt", attack: "x", monster: "goblin-warrior", amount: 3, value: 1, key: "autoEngage", condition: "prone", minutes: 5, hp: 3, name: "n", text: "t", item: "x", slot: 1, user: "u1" }; };

test("a bare startEncounter is refused with a sentence, and nothing changes", () => {
  for (const bad of [undefined, null, "x", NaN, {}, [], { q: 1 }, { q: 0.5, r: 0 }]) {
    const s = world(false), before = JSON.stringify(s);
    const r = apply(s, bad === undefined ? { type: "startEncounter" } : { type: "startEncounter", center: bad }, DM);
    assert.equal(r.ok, false);
    assert.match(r.error, /centred/);
    assert.equal(JSON.stringify(s), before);
  }
  for (const radius of ["x", NaN, -1, 0, 1.5, {}, [], 101, 1e9]) {
    const s = world(false), before = JSON.stringify(s);
    assert.equal(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius }, DM).ok, false);
    assert.equal(JSON.stringify(s), before);
  }
  const s = world(false);
  assert.ok(apply(s, { type: "startEncounter", center: { q: -6, r: 2 } }, DM).ok, "a well-formed call still starts the fight");
});

test("every action refuses malformed fields without throwing, and leaves the game byte-identical", () => {
  const threw = [], changed = [];
  for (const type of ACTION_TYPES) for (const [fight, ctx] of [[false, DM], [true, DM], [false, PLAYER]]) {
    const base = world(fight), good = GOOD(base);
    const baseText = JSON.stringify(base);
    let cur = structuredClone(base), before = baseText;       // `before` is the last "after": the game is only written out once per action
    const variants = [{ type }];
    for (const k of Object.keys(good)) for (const v of WRONG) variants.push({ type, ...good, [k]: v });
    for (const v of WRONG) variants.push({ type, ...Object.fromEntries(Object.keys(good).map((k) => [k, v])) });
    for (const a of variants) {
      let r;
      try { r = apply(cur, structuredClone(a), ctx); } catch (e) { threw.push(`${ctx.role} ${JSON.stringify(a).slice(0, 160)}: ${e.message}`); cur = structuredClone(base); before = baseText; continue; }
      if (r.ok) { cur = structuredClone(base); before = baseText; continue; }
      assert.equal(typeof r.error, "string");
      const after = JSON.stringify(cur);
      // apply() puts the game back after a refusal that had already changed something, so a handler that mutates and then refuses cannot be seen
      // from here (refusal-fuzz.test.js's cast-flag case guards the restore itself); this checks what a caller sees: nothing changed.
      if (after !== before) { changed.push(`${ctx.role} ${JSON.stringify(a).slice(0, 160)}`); cur = structuredClone(base); before = baseText; } else before = after;
    }
  }
  assert.deepEqual(threw.slice(0, 5), [], "no action throws on a malformed shape");
  assert.deepEqual(changed.slice(0, 5), [], "a refused action changes nothing");
});
