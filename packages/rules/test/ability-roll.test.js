// Ability scores rolled at the table (docs/specs/ability-scores.md, #557, part 2): the actions rollAbilityScores and rerollAbilityScore, the table's rule for
// rerolls (settings scoreReroll, scoreRerollBelow, scoreRerollResult), who is sent which rolls, replay from the seed, undo, and the state version 25.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, SETTINGS, SETTING_TEXT } from "../src/engine.js";
import { newGame } from "../src/scenario.js";
import { migrate, VERSION } from "../src/migrate.js";
import { view, viewEvents } from "../src/view.js";
import { keyedRng } from "../src/rng.js";
import { topThree, tableRule, rollScores, checkScores } from "../src/scores.js";
import { validate } from "../src/derive.js";
import { createHistory, describeStep, mark } from "../src/history.js";

const DM = { role: "dm", userId: "dm" }, ANA = { role: "player", userId: "ana" }, BEN = { role: "player", userId: "ben" };
const KEY = "0123456789abcdef".repeat(4);
const game = () => { const s = newGame(7); s.rng = keyedRng(KEY); return s; };
const run = (s, a, ctx) => apply(s, a, ctx);
const json = (x) => JSON.stringify(x);
const set = (s, key, value) => assert.ok(run(s, { type: "setting", key, value }, DM).ok);

test("the rule is three table settings, the SRD's by default; only the DM changes them, and only to what they allow", () => {
  assert.deepEqual(SETTINGS.scoreReroll, ["none", "below", "each"]);
  assert.deepEqual(SETTINGS.scoreRerollBelow, [10, 8, 9, 11, 12, 13, 14]);
  assert.deepEqual(SETTINGS.scoreRerollResult, ["new", "higher"]);
  for (const k of ["scoreReroll", "scoreRerollResult"]) for (const v of SETTINGS[k]) assert.ok(SETTING_TEXT[k][v], `${k} ${v} has words`);
  const s = game();
  assert.deepEqual(tableRule(s.settings), { reroll: "none", result: "new" });
  set(s, "scoreReroll", "below"); set(s, "scoreRerollBelow", 12); set(s, "scoreRerollResult", "higher");
  assert.deepEqual(tableRule(s.settings), { reroll: "below", below: 12, result: "higher" });
  const before = json(s);
  assert.equal(run(s, { type: "setting", key: "scoreReroll", value: "always" }, DM).ok, false);
  assert.equal(run(s, { type: "setting", key: "scoreRerollBelow", value: 3 }, DM).ok, false);
  assert.equal(run(s, { type: "setting", key: "scoreReroll", value: "each" }, ANA).ok, false);
  assert.equal(json(s), before, "a refused setting changes nothing");
});

test("rollAbilityScores rolls six scores from the game's seed: the same seed gives the same rolls, the rng moves 24 places, and the event has the faces", () => {
  const a = game(), b = game();
  const r = run(a, { type: "rollAbilityScores" }, ANA), q = run(b, { type: "rollAbilityScores" }, ANA);
  assert.ok(r.ok, r.error);
  assert.equal(json(r.events), json(q.events));
  assert.equal(a.rng.n, 24);
  const [ev] = r.events;
  assert.equal(ev.type, "scoresRolled"); assert.equal(ev.by, "ana"); assert.equal(ev.sets.length, 6);
  assert.deepEqual(ev.sets.map((x) => x.total), rollScores({ rng: keyedRng(KEY) }).sets.map((x) => x.total), "the rules package's own roll");
  for (const x of ev.sets) {
    assert.equal(x.dice.length, 4); assert.equal(x.dice.filter((d) => d.drop).length, 1);
    assert.equal(x.total, x.dice.filter((d) => !d.drop).reduce((n, d) => n + d.value, 0));
  }
  assert.deepEqual(a.scoreRolls.ana.sets.map((x) => topThree(x.dice)), ev.sets.map((x) => x.total));
  assert.equal(typeof ev.at, "number");
});

test("a member rolls once; the refusal changes nothing, not even the rng; the DM may roll a fresh set; a member with no user id cannot", () => {
  const s = game();
  assert.ok(run(s, { type: "rollAbilityScores" }, ANA).ok);
  const before = json(s);
  const again = run(s, { type: "rollAbilityScores" }, ANA);
  assert.equal(again.ok, false); assert.match(again.error, /already rolled your ability scores/);
  assert.equal(json(s), before);
  assert.ok(run(s, { type: "rollAbilityScores" }, BEN).ok, "another member has their own roll");
  assert.ok(run(s, { type: "rollAbilityScores" }, DM).ok);
  const first = json(s.scoreRolls.dm);
  assert.ok(run(s, { type: "rollAbilityScores" }, DM).ok, "the DM is not limited");
  assert.notEqual(json(s.scoreRolls.dm), first);
  const anon = run(game(), { type: "rollAbilityScores" }, { role: "player" });
  assert.equal(anon.ok, false); assert.match(anon.error, /Only someone at the table/);
  assert.ok(run(game(), { type: "rollAbilityScores" }, { role: "dm" }).ok, "a game on one device has a DM with no user id");
});

// A table that rolled, with the first roll's scores known.
const rolled = (rule = {}, who = ANA) => { const s = game(); for (const [k, v] of Object.entries(rule)) set(s, k, v); run(s, { type: "rollAbilityScores" }, who); return s; };
const totals = (s, who = "ana") => s.scoreRolls[who].sets.map((x) => topThree(x.dice));
const lows = (s, n) => totals(s).flatMap((t, i) => (t < n ? [i] : []));

test("rule none: no score may be rolled again, and the refusal says so and changes nothing", () => {
  const s = rolled(), before = json(s);
  const r = run(s, { type: "rerollAbilityScore", index: 0 }, ANA);
  assert.equal(r.ok, false); assert.equal(r.error, "This table does not allow a score to be rolled again.");
  assert.equal(json(s), before);
});

test("rule below N: a score below N may be rolled again, once; others may not, judged on the first roll", () => {
  const s = rolled({ scoreReroll: "below", scoreRerollBelow: 14 });
  const t = totals(s), low = t.findIndex((x) => x < 14), high = t.findIndex((x) => x >= 14);
  assert.ok(low >= 0, "the seed has a score below 14");
  if (high >= 0) {
    const before = json(s), r = run(s, { type: "rerollAbilityScore", index: high }, ANA);
    assert.equal(r.ok, false); assert.equal(r.error, `This table allows a score below 14 to be rolled again; this one is ${t[high]}.`);
    assert.equal(json(s), before);
  }
  const n = s.rng.n, r = run(s, { type: "rerollAbilityScore", index: low }, ANA);
  assert.ok(r.ok, r.error);
  assert.equal(s.rng.n, n + 4);
  const [ev] = r.events;
  assert.equal(ev.type, "scoreRerolled"); assert.equal(ev.index, low); assert.equal(ev.from.total, t[low]);
  assert.equal(ev.to.total, topThree(s.scoreRolls.ana.sets[low].again));
  const again = json(s), twice = run(s, { type: "rerollAbilityScore", index: low }, ANA);
  assert.equal(twice.ok, false); assert.equal(twice.error, "That score has been rolled again already.");
  assert.equal(json(s), again, "once only");
});

test("rule each: every score may be rolled again, once", () => {
  const s = rolled({ scoreReroll: "each" });
  for (let i = 0; i < 6; i++) assert.ok(run(s, { type: "rerollAbilityScore", index: i }, ANA).ok, `score ${i}`);
  for (let i = 0; i < 6; i++) assert.equal(run(s, { type: "rerollAbilityScore", index: i }, ANA).ok, false);
});

test("the result that stands: the new roll even if lower, or the higher of the two", () => {
  // Find a reroll that is lower and one that is higher by trying scores until both have been seen, on separate tables of the same seed.
  const seen = { lower: false, higher: false };
  for (const result of ["new", "higher"]) {
    for (let i = 0; i < 6; i++) {
      const s = rolled({ scoreReroll: "each", scoreRerollResult: result }), ev = run(s, { type: "rerollAbilityScore", index: i }, ANA).events[0];
      if (ev.to.total < ev.from.total) {
        seen.lower = true;
        assert.equal(ev.stands, result === "new" ? "new" : "old");
        assert.equal(ev.total, result === "new" ? ev.to.total : ev.from.total);
      } else if (ev.to.total > ev.from.total) {
        seen.higher = true; assert.equal(ev.stands, "new"); assert.equal(ev.total, ev.to.total);
      } else { assert.equal(ev.stands, "new"); assert.equal(ev.total, ev.to.total); }
    }
  }
  assert.ok(seen.lower && seen.higher, "both a lower and a higher reroll came up");
});

test("a reroll with no roll, a bad index, or no user id is refused with a sentence and changes nothing", () => {
  const s = game(); set(s, "scoreReroll", "each");
  const before = json(s);
  assert.match(run(s, { type: "rerollAbilityScore", index: 0 }, ANA).error, /Roll your ability scores first/);
  run(s, { type: "rollAbilityScores" }, ANA);
  const mid = json(s);
  for (const index of [-1, 6, 1.5, "0", undefined]) assert.match(run(s, { type: "rerollAbilityScore", index }, ANA).error, /Which score/);
  assert.equal(json(s), mid);
  assert.match(run(s, { type: "rerollAbilityScore", index: 0 }, BEN).error, /Roll your ability scores first/, "another member's roll is not yours");
  assert.ok(before);
});

test("what the table is sent: the roller and the DM see the numbers; every other player is told only that it happened; a player's view never carries them (the DM's is the whole state)", () => {
  const s = game(); set(s, "scoreReroll", "each");
  const roll = run(s, { type: "rollAbilityScores" }, ANA), re = run(s, { type: "rerollAbilityScore", index: 0 }, ANA);
  const events = [...roll.events, ...re.events];
  assert.deepEqual(viewEvents(events, s, ANA), events);
  assert.deepEqual(viewEvents(events, s, DM), events);
  const other = viewEvents(events, s, BEN);
  assert.deepEqual(other, [{ type: "scoresRolled" }, { type: "scoreRerolled" }]);
  assert.deepEqual(viewEvents(events, s, {}), [{ type: "scoresRolled" }, { type: "scoreRerolled" }], "a viewer with no id too");
  assert.equal(Object.hasOwn(view(s, DM), "scoreRolls"), true, "the DM's view is the whole state");
  for (const u of [ANA, BEN, {}]) {
    const v = view(s, u), text = json(v);
    assert.equal(Object.hasOwn(v, "scoreRolls"), false, "no `scoreRolls` in a view");
    for (const t of s.scoreRolls.ana.sets) assert.ok(!text.includes(json(t.dice)), "no rolled faces in a view");
  }
});

test("undo takes a roll back whole, and replay from the seed gives the same rolls", () => {
  const s = game(); set(s, "scoreReroll", "each");
  const before = json(s);
  const h = createHistory(), m = mark(s), action = { type: "rollAbilityScores" };
  const r = run(s, action, ANA);
  assert.ok(r.ok);
  h.record(m, s, describeStep(action, r.events, m, s));
  const u = h.undo(s);
  assert.ok(u, "the roll can be undone");
  assert.equal(json(s), before, "undone: no rolls, the rng back");
  const a = game(), b = game();
  for (const g of [a, b]) { run(g, { type: "rollAbilityScores" }, ANA); run(g, { type: "setting", key: "scoreReroll", value: "each" }, DM); run(g, { type: "rerollAbilityScore", index: 2 }, ANA); }
  assert.equal(json(a), json(b));
});

test("a sheet made from the table's roll carries its record: the faces, the rule, 'table' and the event's place; it validates and the DM's line says it was rolled at the table", () => {
  const s = game(); set(s, "scoreReroll", "below"); set(s, "scoreRerollBelow", 14); set(s, "scoreRerollResult", "higher");
  const ev = run(s, { type: "rollAbilityScores" }, ANA).events[0];
  const low = s.scoreRolls.ana.sets.findIndex((x) => topThree(x.dice) < 14);
  run(s, { type: "rerollAbilityScore", index: low }, ANA);
  const rule = tableRule(s.settings), sets = s.scoreRolls.ana.sets.map((x) => structuredClone(x));
  const stand = sets.map((x) => (x.again ? Math.max(topThree(x.dice), topThree(x.again)) : topThree(x.dice)));
  const abil = ["str", "dex", "con", "int", "wis", "cha"], base = Object.fromEntries(abil.map((a, i) => [a, stand[i]]));
  const sheet = { name: "Kerrin", class: "fighter", level: 1, abilities: base, skills: ["athletics", "perception"], choices: { "fighting-style": "defense" },
    scores: { method: "roll", base, rolls: sets, rule, by: "table", at: ev.at } };
  assert.deepEqual(checkScores(sheet), []);
  assert.deepEqual(validate(sheet), []);
  const added = run(s, { type: "setSheet", sheet }, DM);
  assert.ok(added.ok, added.error);
});

test("state version 25: a new game has no rolled scores; an older state gets an empty record, once; nothing else moves", () => {
  assert.equal(VERSION, 27);                                   // 26: places of a world (#579); 27: purses and shops (#596)
  const s = newGame(5);
  assert.deepEqual(s.scoreRolls, {}); assert.equal(s.version, 27);
  const old = newGame(5); delete old.scoreRolls; old.version = 24;
  migrate(old);
  assert.deepEqual(old.scoreRolls, {}); assert.equal(old.version, 27);
  const { world, place, parked, journey, markets, shops, ...rest } = old;       // version 26 adds the places of a world, empty
  assert.deepEqual({ world, place, parked, journey }, { world: null, place: null, parked: {}, journey: null });
  assert.deepEqual({ markets, shops }, { markets: [], shops: [] });                 // version 27 (#596) adds the markets and shops, empty
  assert.deepEqual(rest, s);
  const again = json(old); migrate(old); assert.equal(json(old), again, "migrating again changes nothing");
  const kept = newGame(5); kept.scoreRolls = { ana: { sets: [] } }; migrate(kept);
  assert.deepEqual(kept.scoreRolls, { ana: { sets: [] } }, "a roll already there is kept");
});

test("the event number on a roll is a counter in `scoreRolls`, not a place in the timeline: it keeps counting when the timeline is cut", () => {
  const s = game(); set(s, "scoreReroll", "each");
  const a = run(s, { type: "rollAbilityScores" }, ANA).events[0].at;
  s.timeline.splice(0, s.timeline.length);                      // what the cap does, all at once
  const b = run(s, { type: "rollAbilityScores" }, BEN).events[0].at;
  s.timeline.length = 0;
  const c = run(s, { type: "rerollAbilityScore", index: 0 }, ANA).events[0].at;
  assert.deepEqual([a, b, c], [1, 2, 3]);
  assert.equal(new Set([a, b, c]).size, 3);
  assert.equal(run(s, { type: "rollAbilityScores" }, { role: "player", userId: "#seq" }).ok, false, "the counter's key is not anyone's");
});

const X = { role: "player", userId: "x" };
test("a hand-edited record of a roll is refused cleanly, never a TypeError; the DM puts it right by rolling for that member", () => {
  for (const bad of [{}, { sets: [] }, { sets: [{}, {}, {}, {}, {}, {}] }, { sets: Array(6).fill({ dice: [1, 2, 3] }) }, { sets: Array(6).fill({ dice: [1, 2, 3, 9] }) }, { sets: Array(5).fill({ dice: [1, 2, 3, 4] }) }, 5, null]) {
    const s = game(); set(s, "scoreReroll", "each"); s.scoreRolls.x = bad;
    const before = json(s);
    assert.equal(run(s, { type: "rerollAbilityScore", index: 0 }, X).ok, false, json(bad));
    assert.equal(run(s, { type: "rollAbilityScores" }, X).ok, false, "a second roll is refused");
    assert.equal(json(s), before, "nothing changed, the counter too");
    const f = run(s, { type: "rollAbilityScores", for: "x" }, DM);          // the DM at a real table: with an id of their own
    assert.ok(f.ok, f.error);
    assert.equal(f.events[0].by, "x");
    assert.equal(s.scoreRolls.dm, undefined, "the DM's own record is not made");
    assert.ok(run(s, { type: "rerollAbilityScore", index: 0 }, X).ok, "the member can reroll what is now sound");
  }
  const t = game(); t.scoreRolls = "junk";
  assert.ok(run(t, { type: "rollAbilityScores" }, ANA).ok, "a scoreRolls that is not a record is made one");
  const u = game(); set(u, "scoreReroll", "each"); u.scoreRolls.x = { sets: Array.from({ length: 6 }) };
  assert.equal(run(u, { type: "rerollAbilityScore", index: 0 }, X).ok, false, "holes are a damaged record");
});

test("the DM rolls for a member: DM only, checked before anything changes, told to that member and the DM and no one else", () => {
  const s = game(); set(s, "scoreReroll", "each");
  assert.ok(run(s, { type: "rollAbilityScores" }, ANA).ok);
  const before = json(s);
  for (const [a, ctx] of [[{ type: "rollAbilityScores", for: "ana" }, ANA], [{ type: "rollAbilityScores", for: "ben" }, BEN], [{ type: "rollAbilityScores", for: "" }, DM],
    [{ type: "rollAbilityScores", for: 7 }, DM], [{ type: "rollAbilityScores", for: "#seq" }, DM], [{ type: "rollAbilityScores", for: "x".repeat(101) }, DM], [{ type: "rollAbilityScores", for: null }, DM]]) {
    assert.equal(run(s, a, ctx).ok, false, json(a));
    assert.equal(json(s), before, "refused before anything changed");
  }
  const old = json(s.scoreRolls.ana);
  const r = run(s, { type: "rollAbilityScores", for: "ana" }, DM);
  assert.ok(r.ok, r.error);
  assert.notEqual(json(s.scoreRolls.ana), old, "a fresh set in place of the old");
  assert.equal(Object.keys(s.scoreRolls).filter((k) => k !== "#seq").join(), "ana");
  assert.ok(run(s, { type: "rerollAbilityScore", index: 0 }, ANA).ok, "and the member can reroll from it");
  const e = r.events[0];
  assert.equal(viewEvents([e], s, { role: "player", userId: "ana" })[0].sets.length, 6, "the member is told the roll");
  assert.equal(viewEvents([e], s, { role: "dm", userId: "dm" })[0].sets.length, 6);
  assert.deepEqual(viewEvents([e], s, { role: "player", userId: "ben" }), [{ type: "scoresRolled" }], "no one else is told anything");
  assert.equal(run(game(), { type: "rollAbilityScores", for: "ben" }, DM).ok, true, "a member who has not rolled can be rolled for");
});

test("the event counter: a refusal leaves it alone; it is not anyone's; a bad or missing one is rebuilt from the records kept", () => {
  const s = game(); set(s, "scoreReroll", "below");
  assert.ok(run(s, { type: "rollAbilityScores" }, ANA).ok);
  const keep = () => json(s);
  let before = keep();
  assert.equal(run(s, { type: "rollAbilityScores" }, ANA).ok, false);
  assert.equal(run(s, { type: "rerollAbilityScore", index: 9 }, ANA).ok, false);
  assert.equal(run(s, { type: "rerollAbilityScore", index: 0 }, BEN).ok, false);
  assert.equal(run(s, { type: "rerollAbilityScore", index: 0 }, { role: "player", userId: "#seq" }).ok, false);
  assert.equal(run(s, { type: "rollAbilityScores" }, { role: "dm", userId: "#seq" }).ok, false);
  assert.equal(run(s, { type: "rerollAbilityScore", index: 0 }, { role: "dm", userId: "#seq" }).ok, false);
  assert.equal(keep(), before, "nothing, the counter included, moved");
  assert.equal(s.scoreRolls["#seq"], 1);
  for (const bad of [-3, 1.5, "7", null, NaN, undefined]) {
    const g = game(); run(g, { type: "rollAbilityScores" }, ANA); run(g, { type: "rollAbilityScores" }, BEN);
    g.scoreRolls["#seq"] = bad;
    const e = run(g, { type: "rollAbilityScores" }, DM).events[0];
    assert.equal(e.at, 3, `rebuilt from the two records kept, then counted: ${String(bad)}`);
  }
  const v = game(); run(v, { type: "rollAbilityScores" }, ANA); run(v, { type: "rollAbilityScores" }, BEN);
  delete v.scoreRolls["#seq"];                                              // a version 25 state with records and no counter
  assert.equal(run(v, { type: "rollAbilityScores" }, DM).events[0].at, 3);
  assert.equal(run(v, { type: "rollAbilityScores", for: "ana" }, DM).events[0].at, 4);
});

test("ids that would reach the record's prototype are no one's: refused with the state unchanged, for the DM's `for` and for a caller's own id", () => {
  const s = game(); set(s, "scoreReroll", "each"); run(s, { type: "rollAbilityScores" }, ANA);
  const before = json(s);
  for (const id of ["__proto__", "constructor", "prototype"]) {
    for (const [a, ctx] of [[{ type: "rollAbilityScores", for: id }, DM], [{ type: "rollAbilityScores" }, { role: "player", userId: id }], [{ type: "rollAbilityScores" }, { role: "dm", userId: id }],
      [{ type: "rerollAbilityScore", index: 0 }, { role: "player", userId: id }], [{ type: "rerollAbilityScore", index: 0 }, { role: "dm", userId: id }]]) {
      assert.equal(run(s, a, ctx).ok, false, `${id} ${json(a)}`);
      assert.equal(json(s), before, "unchanged");
      assert.equal(Object.getPrototypeOf(s.scoreRolls), Object.prototype);
    }
  }
});

test("a rebuilt counter can repeat a number already seen: `at` is trusted only while the counter is intact", () => {
  const s = game(); set(s, "scoreReroll", "each");
  run(s, { type: "rollAbilityScores" }, ANA); run(s, { type: "rollAbilityScores" }, BEN);
  assert.equal(run(s, { type: "rerollAbilityScore", index: 0 }, ANA).events[0].at, 3);
  delete s.scoreRolls["#seq"];                                              // the counter is lost
  assert.equal(run(s, { type: "rollAbilityScores", for: "cy" }, DM).events[0].at, 3, "rebuilt from two records: 3 again, though the reroll was 3");
});
