// A spell limited to some creature types (`target.creature.types`), issue #727.
// SRD 5.2.1, Hold Person: "Choose a Humanoid that you can see within range." Spells, "Invalid Targets": "If you cast a spell on someone or
// something that can't be affected by it, nothing happens to that target, but if you used a spell slot to cast the spell, the slot is still
// expended. If the spell normally has no effect on a target that succeeds on a saving throw, the invalid target appears to have succeeded on
// its saving throw, even though it didn't attempt one (giving no hint that the creature is an invalid target). Otherwise, you perceive that
// the spell did nothing to the target." The vocabulary is in docs/specs/rules-expansion.md, "Build notes: a creature-type limit on a target".
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { derive } from "../src/derive.js";
import { apply, makeEntity } from "../src/engine.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { newGame } from "../src/scenario.js";
import { viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (x) => JSON.stringify(x);
const A = { str: 10, dex: 14, con: 12, int: 18, wis: 12, cha: 10 };

// A wizard of level 9 on open grass with the spells named, and one creature of each monster named, 10 feet apart from it in a row.
function table(spells, monsters, seed = 11) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.settings.autoEngage = false;
  s.settings.strikeFirst = "all";               // a hostile cast outside a fight lands, then the fight starts
  const sheet = { name: "Wyn", class: "wizard", level: 9, abilities: A, skills: ["arcana", "history"], spells };
  const e = makeEntity(derive(sheet).record, { id: "wyn", kind: "pc", side: "party", owner: "pat", ownerName: "Pat", pos: { q: 3, r: 3, z: 0 } });
  e.sheet = structuredClone(sheet);
  s.entities.wyn = e;
  const ids = [];
  monsters.forEach((m, i) => {
    const before = new Set(Object.keys(s.entities));
    ok(apply(s, { type: "spawn", monster: m, at: { q: 5 + i, r: 3 } }, DM));
    ids.push(Object.keys(s.entities).find((id) => !before.has(id)));
  });
  return { s, ids };
}
const cast = (s, spell, more) => apply(s, { type: "cast", actor: "wyn", spell, ...more }, DM);

test("the linter: `types` on a creature target lists creature types, for a spell only", () => {
  const lint = (d) => lintEntry("spells", d, { strict: false });
  const hold = structuredClone(SPELLS["hold-person"].def);
  assert.deepEqual(hold.target.creature.types, ["humanoid"]);
  assert.deepEqual(lint(hold), []);
  for (const bad of [[], ["person"], "humanoid", ["humanoid", "humanoid"]]) {
    const d = structuredClone(hold); d.target.creature.types = bad;
    assert.ok(lint(d).some((p) => p.includes("`types` lists creature types")), json(bad));
  }
  assert.equal(SPELLS["hold-person"].types[0], "humanoid", "the profile carries it, for a screen that wants to say so");
  assert.equal(SPELLS["hold-person"].def.tier, "auto");
  for (const [id, t] of [["charm-person", "humanoid"], ["dominate-person", "humanoid"], ["animal-friendship", "beast"], ["dominate-beast", "beast"]]) assert.deepEqual(SPELLS[id].def.target.creature.types, [t], id);
});

test("the reader says the limit in plain words", () => {
  const r = readEntry("spells", SPELLS["hold-person"].def);
  assert.deepEqual(r.problems, []);
  assert.ok(r.lines.some((l) => /limits it to Humanoid/.test(l.text ?? l)), json(r.lines));
});

test("Hold Person on a Humanoid: the save is rolled and a failure paralyses", () => {
  let held = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const { s, ids: [b] } = table(["hold-person"], ["bandit"], seed);
    const r = ok(cast(s, "hold-person", { target: b }));
    const sv = r.events.find((e) => e.type === "save" && e.id === b);
    assert.ok(sv && sv.invalid === undefined && typeof sv.total === "number", "a real save");
    assert.equal(!!s.entities[b].cond.paralyzed, !sv.success);
    if (!sv.success) held++;
    assert.equal(r.events.filter((e) => e.type === "manual").length, 0, "nothing is left to the DM");
  }
  assert.ok(held > 0, "some bandit failed");
});

test("Hold Person on a creature that is not a Humanoid: the slot and the action are spent, no die is rolled, nothing happens, and it reads as a made save", () => {
  for (const monster of ["wolf", "skeleton", "goblin-warrior"]) {
    const { s, ids: [w] } = table(["hold-person"], [monster]);
    const slots = s.entities.wyn.slots[2], rng = json(s.rng ?? s.seed);
    const r = ok(cast(s, "hold-person", { target: w }));
    assert.equal(s.entities.wyn.slots[2], slots - 1, "the slot is still expended");
    assert.deepEqual(s.entities[w].cond, {}, monster);
    const saves = r.events.filter((e) => e.type === "save");
    assert.equal(saves.length, 1);
    assert.deepEqual({ id: saves[0].id, abil: saves[0].abil, success: saves[0].success, invalid: saves[0].invalid }, { id: w, abil: "wis", success: true, invalid: true });
    assert.equal(saves[0].total, undefined, "no roll");
    assert.deepEqual(r.events.find((e) => e.type === "cast").targets, [w], "it was aimed at it");
    assert.ok(!(s.effects ?? []).some((fx) => fx.parts.some((p) => p.target === w)), "no part of the spell is on it");
    assert.ok(s.encounter, "a hostile cast all the same: the fight starts");
    // What its caster's player is sent: the outcome alone, as for any creature not theirs, with no mark.
    const mine = viewEvents(r.events, s, PAT);
    assert.deepEqual(mine.filter((e) => e.type === "save").map((e) => Object.keys(e).filter((k) => k !== "dc").sort()), [["abil", "id", "success", "type"]]);
    assert.ok(!json(mine).includes("invalid"));
    assert.deepEqual(mine.find((e) => e.type === "effectStart").targets, [w], "the effect is announced as aimed, as when a Humanoid makes its save");
  }
});

test("no hint: what the caster's player is sent for an invalid target is what a made save sends", () => {
  // Everything up to the fight's start (the Initiative dice differ: no save die was rolled for the invalid target).
  const sent = (monster, seed) => {
    const { s, ids: [m] } = table(["hold-person"], [monster], seed);
    const r = ok(cast(s, "hold-person", { target: m }));
    const mine = viewEvents(r.events, s, PAT);
    return { made: r.events.find((e) => e.type === "save").success, sent: json(mine.slice(0, mine.findIndex((e) => e.type === "encounterStart"))) };
  };
  let compared = 0;
  for (let seed = 1; seed <= 30 && !compared; seed++) {
    const real = sent("bandit", seed);
    if (!real.made) continue;
    assert.equal(sent("wolf", seed).sent, real.sent);
    compared++;
  }
  assert.ok(compared, "some bandit made its save");
});

test("with a higher slot: the Humanoids save, the other is left alone, and no part of the effect is on it", () => {
  const { s, ids: [b1, w, b2] } = table(["hold-person"], ["bandit", "wolf", "bandit"]);
  const r = ok(cast(s, "hold-person", { targets: [b1, w, b2], slot: 4 }));
  const saves = r.events.filter((e) => e.type === "save");
  assert.deepEqual(saves.filter((e) => e.invalid).map((e) => e.id), [w]);
  assert.deepEqual(saves.filter((e) => !e.invalid).map((e) => e.id).sort(), [b1, b2].sort());
  // The effect is announced as aimed (one that makes its save is named there too), so the list gives no hint; no part of it is on the wolf.
  assert.deepEqual(r.events.find((e) => e.type === "effectStart").targets.sort(), [b1, w, b2].sort());
  assert.ok(!s.effects.some((fx) => fx.parts.some((p) => p.target === w)));
  assert.deepEqual(s.entities[w].cond, {});
});

test("a spell that is not all-or-nothing on a save says that it did nothing (a homebrew spell with half damage)", () => {
  const { s, ids: [w] } = table(["hold-person"], ["wolf"]);
  const def = { ...structuredClone(SPELLS["blight"].def), id: "hb-wither-folk", name: "Wither Folk", target: { creature: { count: 1, types: ["humanoid"] } }, classes: ["wizard"], checked: false, tier: "auto", text: "A Humanoid makes a Constitution save, taking necrotic damage on a failure or half on a success." };
  assert.deepEqual(lintEntry("spells", def, { strict: false }), []);
  // Run through the real cast with the spell lent as the table's homebrew would be.
  SPELLS[def.id] = { ...SPELLS["blight"], id: def.id, name: def.name, types: ["humanoid"], def };
  try {
    s.entities.wyn.spells = [...(s.entities.wyn.spells ?? []), def.id];
    if (s.entities.wyn.prepared) s.entities.wyn.prepared.push(def.id);
    const hp = s.entities[w].hp;
    const r = ok(cast(s, def.id, { target: w }));
    assert.equal(s.entities[w].hp, hp);
    assert.equal(r.events.filter((e) => e.type === "save" || e.type === "damage").length, 0);
    assert.ok(r.events.some((e) => e.type === "note" && e.id === w && /does nothing to/.test(e.text)));
  } finally { delete SPELLS[def.id]; }
});

test("a creature whose type the engine cannot tell is treated as valid and the DM is told", () => {
  const { s, ids: [b] } = table(["hold-person"], ["bandit"]);
  delete s.entities[b].tpl; delete s.entities[b].type;
  const r = ok(cast(s, "hold-person", { target: b }));
  assert.ok(r.events.some((e) => e.type === "save" && e.id === b && e.invalid === undefined));
  assert.ok(r.events.some((e) => e.type === "manual" && /cannot tell what kind of creature/.test(e.text)));
});

test("Animal Friendship: nothing to a Humanoid; a Beast that fails is charmed until its caster's side damages it", () => {
  let charmed = 0;
  for (let seed = 1; seed <= 12 && !charmed; seed++) {
    const { s, ids: [w, b] } = table(["animal-friendship", "fire-bolt"], ["wolf", "bandit"], seed);
    const r0 = ok(cast(s, "animal-friendship", { targets: [w, b], slot: 2 }));
    assert.ok(r0.events.some((e) => e.type === "save" && e.id === b && e.invalid && e.success), "the bandit is no Beast");
    assert.deepEqual(s.entities[b].cond, {});
    if (!s.entities[w].cond.charmed) continue;
    charmed++;
    ok(apply(s, { type: "harm", actor: w, amount: 1 }, DM));
    assert.ok(s.entities[w].cond.charmed, "damage from no creature does not end it");
    const fx = s.effects.find((x) => x.spell === "animal-friendship");
    assert.equal(fx.parts.find((p) => p.target === w).ends.by, "source");
  }
  assert.ok(charmed, "some wolf failed");
});

test("undo, redo and a replay give the same state", () => {
  const { s, ids: [w, b] } = table(["hold-person"], ["wolf", "bandit"]);
  const acts = [{ type: "cast", actor: "wyn", spell: "hold-person", targets: [w, b], slot: 3 }];
  const start = json(s), h = createHistory();
  for (const a of acts) { const bfr = mark(s), r = ok(apply(s, a, DM)); h.record(bfr, s, describeStep(a, r.events, bfr, s)); }
  const end = json(s);
  h.undo(s); assert.equal(json(s), start, "undo");
  h.redo(s); assert.equal(json(s), end, "redo");
  const again = JSON.parse(start);
  for (const a of acts) ok(apply(again, a, DM));
  assert.equal(json(again), end, "replay");
});
