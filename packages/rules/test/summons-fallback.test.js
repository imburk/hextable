// Companions, stage C3b (#332; docs/specs/companions.md, "C3b, a summon cast with no picks"): a cast of a spell
// with a `summon` step and no `summon` field (what the client sends until the cast chooser, C8) is not refused. It
// takes the manual path: the slot is spent, Concentration starts, nothing is made, and the DM alone is told what to
// add with the numbers the block would be baked with. A cast with picks builds as in C3; a malformed `summon` is
// refused with nothing changed. Giant Insect (auto) and a test-only `assist` entry; hexes and squares; a foe's cast;
// twin runs for a hidden caster against a plain manual spell; undo, redo, replay and a save in the middle of a fight.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { migrate } from "../src/migrate.js";
import { gridOf } from "../src/grid.js";
import { spellProfile } from "../src/effects.js";
import { startEffect } from "../src/durations.js";
import { aiStep } from "../src/ai.js";
import { CONTENT, SPELLS, summonTemplate } from "../src/content/index.js";
import { summonCaster } from "../src/engine/world.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const U2 = { role: "player", userId: "u2" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (s) => JSON.stringify(s);
function refused(s, action, ctx, words) {
  const before = json(s), r = apply(s, action, ctx);
  assert.equal(r.ok, false, `${action.type} should be refused`);
  if (words) assert.match(r.error, words);
  assert.equal(json(s), before, "a refused action changes nothing");
  return r;
}

// Two test-only spells, added to the loaded spells for this file only (never to the pack):
// - an `assist` summon, Giant Insect's data with its tier lowered and a line for the DM;
// - a plain manual spell with Giant Insect's level, time, range, duration and Concentration, aimed at nothing the
//   engine can aim (so its caster is not revealed, as a summon's is not), whose one step is `manual`: what Giant
//   Insect was before C3, for the twin runs.
const GI = CONTENT.spells["giant-insect"];
const ASSIST = { ...structuredClone(GI), id: "test-assist-insect", name: "Test Assist Insect", tier: "assist", text: "Test only: the DM also does a thing." };
const PLAIN = { ...structuredClone(GI), id: "test-plain-insect", name: "Test Plain Insect", tier: "manual", target: { area: { shape: "line", size: 60 } },
  effects: [{ manual: "Test only: the DM adds a giant insect." }] };
for (const def of [ASSIST, PLAIN]) SPELLS[def.id] = spellProfile(def);
assert.equal(SPELLS["test-plain-insect"].aim, "none");

const ABIL = { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 };
const druidSheet = (name) => ({ name, class: "druid", level: 17, subclass: "land", abilities: ABIL, skills: ["nature", "perception"],
  choices: { "primal-order": "warden", "elemental-fury": "primal-strike", "natures-ward": "polar" },
  armour: "leather-armor", shield: true, weapons: ["quarterstaff"], spells: ["produce-flame", "giant-insect"] });
const druid = (id, side, pos, name) => {
  const e = makeEntity(derive(druidSheet(name)).record, { id, kind: side === "party" ? "pc" : "npc", side, pos: { ...pos, z: 0 } });
  e.spells.push("test-assist-insect", "test-plain-insect");
  return e;
};
function spot(s, near, n = 0, r = 3, monster = "wolf") {
  const G = gridOf(s.map), out = [];
  for (const h of G.range(near, r)) if (apply(structuredClone(s), { type: "spawn", monster, at: h }, DM).ok) out.push(h);
  return out[n];
}
const big = (s, near, n = 0, r = 4) => spot(s, near, n, r, "giant-spider");
function ring(s, near, d) {
  const G = gridOf(s.map);
  return [...G.range(near, d)].find((h) => G.dist(h, near) === d && apply(structuredClone(s), { type: "spawn", monster: "wolf", at: h }, DM).ok);
}
function table(grid, seed = 5) {
  const s = newGame(seed, grid ? { grid } : {});
  s.settings.autoEngage = false;
  s.entities.ven = druid("ven", "party", spot(s, s.entities.fighter.pos, 0, 2), "Ven");
  ok(apply(s, { type: "claim", entity: "ven", user: "pat", userName: "Pat" }, PAT));
  return s;
}
const ids = (s) => s.encounter.order.map((o) => o.id);
const endTurn = (s) => ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
const manuals = (r) => r.events.filter((e) => e.type === "manual");
const handOver = (r) => r.events.find((e) => e.type === "manual" && /nothing picked for the engine to summon/.test(e.text));

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";

  test(`a player's Giant Insect with no summon field is cast as a manual spell: slot, Concentration, the DM told the numbers${on}`, () => {
    for (const slot of [4, 5, 7]) {
      const s = table(grid), ven = s.entities.ven, slots = ven.slots[slot], seq = s.seq, n = Object.keys(s.entities).length;
      // Concentrating on something else: the new spell ends it.
      const old = startEffect(s, { name: "Old", spell: "bless", source: "ven", conc: true, duration: "1 minute" });
      const r = ok(apply(s, { type: "cast", actor: "ven", spell: "giant-insect", slot }, PAT));
      assert.equal(ven.slots[slot], slots - 1, "the slot is spent");
      assert.ok(!s.effects.some((x) => x.id === old.id), "the old Concentration ends");
      const fx = s.effects.find((x) => x.spell === "giant-insect");
      assert.ok(fx && fx.conc && fx.source === "ven", "Concentration on Giant Insect");
      assert.deepEqual(fx.parts, [], "it keeps nothing");
      assert.equal(Object.keys(s.entities).length, n, "nothing is made");
      assert.ok(!r.events.some((e) => e.type === "summoned" || e.type === "spawned"));
      assert.equal(s.seq, seq + 2, "the counter moves only for the two effects, as for any spell");
      // The DM's line: every variant baked at this level with Ven's numbers.
      const told = handOver(r), caster = summonCaster(s, ven, "giant-insect");
      assert.ok(told && told.partial && told.actor === "ven" && told.name === "Giant Insect");
      assert.equal(manuals(r).length, 2, "the DM's line and the public one, and no tier note for an auto spell");
      assert.deepEqual(manuals(r).filter((e) => !e.partial).map((e) => e.text), ["Giant Insect: the DM adds what it summons."]);
      for (const variant of ["centipede", "spider", "wasp"]) {
        const t = summonTemplate("giant-insect", { slot, variant, caster });
        assert.ok(told.text.includes(`${t.name} (AC ${t.record.ac}, ${t.record.hp} Hit Points, Speed 40 ft., Climb 40 ft.${variant === "wasp" ? ", Fly 40 ft." : ""}, Large)`), `${variant} at ${slot}: ${told.text}`);
      }
      assert.ok(told.text.includes(`at level ${slot}`) && told.text.includes(`spell attack +${caster.attack}, spell save DC ${caster.dc}, Proficiency Bonus +${caster.pb}`));
      assert.ok(told.text.includes("within 60 ft.") && told.text.includes(`slot ${slot}`) && told.text.includes("caster ven"));
      // The player: the cast and the effect, as for any spell of theirs, and one short public line (#331 review): no numbers, no creature.
      const mine = viewEvents(r.events, s, PAT);
      assert.deepEqual(mine.map((e) => e.type), ["cast", "effectEnd", "effectStart", "manual"], "the old effect's end, the new one, then the line");
      assert.equal(mine.find((e) => e.type === "manual").text, "Giant Insect: the DM adds what it summons.");
      assert.ok(!json(mine).includes("Hit Points"));
      // It lasts as a spell does, and ends when its time runs out.
      ok(apply(s, { type: "advanceTime", minutes: 5 }, DM));
      assert.ok(s.effects.some((x) => x.id === fx.id), "still going after 5 minutes");
      ok(apply(s, { type: "advanceTime", minutes: 6 }, DM));
      assert.ok(!s.effects.some((x) => x.id === fx.id), "ended after 10 minutes");
    }
  });

  test(`an assist summon with no summon field: the DM's numbers and the entry's own note, both the DM's${on}`, () => {
    const s = table(grid), ven = s.entities.ven;
    const r = ok(apply(s, { type: "cast", actor: "ven", spell: "test-assist-insect", slot: 6 }, PAT));
    assert.equal(ven.slots[6], 0);
    assert.ok(s.effects.some((x) => x.spell === "test-assist-insect" && x.conc));
    const told = handOver(r);
    assert.ok(told && told.partial && told.text.includes("at level 6") && told.text.includes("Test Assist Insect"));
    assert.ok(told.text.endsWith(ASSIST.text), "the tier note, in the DM's line");
    assert.deepEqual(manuals(r).filter((e) => !e.partial).map((e) => e.text), ["Test Assist Insect: the DM adds what it summons."]);
    assert.ok(!json(viewEvents(r.events, s, PAT)).includes("Hit Points") && !json(viewEvents(r.events, s, PAT)).includes(ASSIST.text));
    // With picks it builds, the assist note still the DM's.
    const b = table(grid);
    const r2 = ok(apply(b, { type: "cast", actor: "ven", spell: "test-assist-insect", slot: 6, summon: { variant: "spider", at: [big(b, b.entities.fighter.pos, 2)] } }, PAT));
    assert.ok(r2.events.some((e) => e.type === "summoned") && !handOver(r2));
    assert.ok(manuals(r2).some((e) => e.partial && e.text === ASSIST.text));
  });

  test(`in a fight: the cast without picks spends the action and the turn's one slot; a foe's cast by the DM likewise${on}`, () => {
    const s = table(grid), f = s.entities.fighter;
    s.entities.ven.initBonus = 40;
    s.entities.mage = druid("mage", "foe", spot(s, f.pos, 6, 5), "Mira");
    s.entities.mage.initBonus = 30;
    ok(apply(s, { type: "startEncounter", center: f.pos, radius: 7 }, DM));
    assert.equal(current(s), "ven");
    ok(apply(s, { type: "cast", actor: "ven", spell: "giant-insect", slot: 4 }, PAT));
    assert.equal(s.encounter.budget.action, 0);
    assert.ok(s.encounter.flags.slot);
    refused(s, { type: "cast", actor: "ven", spell: "giant-insect", slot: 5 }, PAT);
    endTurn(s);
    assert.equal(current(s), "mage");
    const r = ok(apply(s, { type: "cast", actor: "mage", spell: "giant-insect", slot: 5 }, DM));
    const told = handOver(r);
    assert.ok(told && told.partial && told.actor === "mage" && told.text.includes("Mira's"));
    assert.ok(!viewEvents(r.events, s, PAT).some((e) => e.type === "manual"));
    assert.equal(ids(s).length, new Set(ids(s)).size);
    assert.ok(!Object.values(s.entities).some((e) => e.bond), "no creature is made, for either");
  });

  test(`a malformed summon field is refused and nothing changes; a companion and a full master are refused without picks too${on}`, () => {
    const s = table(grid), good = big(s, s.entities.fighter.pos, 2);
    for (const summon of [null, "wasp", 3, true, [], [good], {}, { variant: "wasp" }, { variant: "wasp", at: [] }, { variant: "wasp", at: null }, { variant: "wasp", at: [good], how: 1 }])
      refused(s, { type: "cast", actor: "ven", spell: "giant-insect", slot: 4, summon }, PAT);
    refused(s, { type: "cast", actor: "ven", spell: "giant-insect", slot: 3 }, PAT, /level 4 or higher/);
    refused(s, { type: "cast", actor: "ven", spell: "produce-flame", summon: null }, PAT, /summons nothing/);
    const out = structuredClone(s);
    out.entities.ven.slots[4] = 0;
    refused(out, { type: "cast", actor: "ven", spell: "giant-insect", slot: 4 }, PAT, /no level 4 spell slots/);
    refused(s, { type: "cast", actor: "ven", spell: "giant-insect", slot: 4 }, U2);
    const c = structuredClone(s);
    c.entities.ven.bond = { to: "fighter", kind: "pet", fx: null, turn: "own", orders: "free", at0: "dies", ends: [], commanded: null, auto: false };
    refused(c, { type: "cast", actor: "ven", spell: "giant-insect", slot: 4 }, PAT, /companion itself/);
    const full = structuredClone(s);
    for (let i = 0; i < 30; i++) {
      const id = ok(apply(full, { type: "spawn", monster: "wolf", at: spot(full, full.entities.fighter.pos, 0, 8) }, DM)).events[0].id;
      ok(apply(full, { type: "bond", actor: id, to: "ven", kind: "summon" }, DM));
    }
    refused(full, { type: "cast", actor: "ven", spell: "giant-insect", slot: 4 }, PAT, /at most 30/);
    ok(apply(s, { type: "cast", actor: "ven", spell: "giant-insect", slot: 4 }, PAT));
  });

  // A foe druid the DM hid, outside the arena, casts Giant Insect with no picks (A), or the plain manual spell (B),
  // then a fight runs and the time runs out. Players must get the same: events and view after each action, the
  // record, the counter. The druid is never revealed in either.
  test(`a hidden foe's cast without picks reaches players exactly as the same hidden foe's plain manual spell${on}`, () => {
    const run = (spell) => {
      const s = table(grid), f = s.entities.fighter, out = [], sent = [];
      s.entities.mage = druid("mage", "foe", ring(s, f.pos, 9), "Mira");
      ok(apply(s, { type: "reveal", actor: "mage", hidden: true }, DM));
      ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: spot(s, f.pos, 6, 4) }, DM));
      const tell = (r) => { out.push(r); sent.push([PAT, U2].map((u) => [json(viewEvents(r.events, s, u)), json(view(s, u))])); };
      tell(ok(apply(s, { type: "cast", actor: "mage", spell, slot: 5 }, DM)));
      assert.ok(s.entities.mage.hidden, "still hidden");
      tell(ok(apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM)));
      for (let i = 0; i < 2 * ids(s).length && s.encounter; i++) {
        const id = current(s);
        if (s.entities[id].kind !== "pc") for (let n = 0; n < 6 && current(s) === id; n++) {
          const step = aiStep(s, id);
          if (!step || step.type === "endTurn") break;
          tell(ok(apply(s, step, DM)));
        }
        if (s.encounter) tell(endTurn(s));
      }
      if (s.encounter) tell(ok(apply(s, { type: "endEncounter" }, DM)));
      tell(ok(apply(s, { type: "advanceTime", minutes: 11 }, DM)));
      assert.ok(!s.effects.some((x) => x.source === "mage"), "the spell ran out");
      return { s, sent, tl: [PAT, U2].map((u) => json(viewEvents(s.timeline, s, u))), seq: s.seq, dm: out.flatMap((r) => r.events) };
    };
    const A = run("giant-insect"), B = run("test-plain-insect");
    assert.deepEqual(A.sent, B.sent, "players' events and view after each action");
    assert.deepEqual(A.tl, B.tl, "the record");
    assert.equal(A.seq, B.seq, "the counter");
    assert.ok(!json(A.sent).includes("Mira") && !json(A.sent).includes('\\"mage\\"'), "nothing names the hidden druid");
    assert.ok(handOver({ events: A.dm }), "the DM is told what to add");
    assert.equal(A.s.entities.mage.slots[5], B.s.entities.mage.slots[5]);
  });

  test(`undo, redo, replay and a save in the middle of a fight, with casts with and without picks, are exact${on}`, () => {
    const build = () => {
      const s = table(grid, 7), f = s.entities.fighter;
      s.entities.ven.initBonus = 40;
      s.entities.mage = druid("mage", "foe", spot(s, f.pos, 6, 5), "Mira");
      ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: spot(s, f.pos, 8, 4) }, DM));
      return s;
    };
    const s = build(), acts = [], states = [json(s)], h = createHistory({ limit: 1000, maxBytes: 1e9 });
    const send = (a, ctx = DM) => {
      const before = mark(s), r = ok(apply(s, a, ctx));
      h.record(before, s, describeStep(a, r.events, before, s));
      acts.push([a, ctx]); states.push(json(s));
      return r;
    };
    send({ type: "cast", actor: "ven", spell: "giant-insect", slot: 4 }, PAT);
    send({ type: "startEncounter", center: s.entities.fighter.pos, radius: 6 });
    let save = null;
    for (let i = 0; i < 24 && s.encounter; i++) {
      if (i === 8) save = { at: acts.length, state: json(s) };
      const id = current(s);
      if (id === "ven" && i > 4 && !s.encounter.flags.slot && s.entities.ven.slots[5] > 0) send({ type: "cast", actor: "ven", spell: "giant-insect", slot: 5, summon: { variant: "wasp", at: [big(s, s.entities.fighter.pos, 1, 4)] } }, PAT);
      else if (id === "mage" && s.entities.mage.slots[6] > 0) send({ type: "cast", actor: "mage", spell: "giant-insect", slot: 6 });
      else if (s.entities[id].kind !== "pc") for (let n = 0; n < 6 && s.encounter && current(s) === id; n++) {
        const step = aiStep(s, id);
        if (!step || step.type === "endTurn") break;
        send(step);
      }
      if (s.encounter && current(s) === id) send({ type: "endTurn", actor: id });
    }
    assert.ok(acts.filter(([a]) => a.type === "cast" && !a.summon).length >= 2 && acts.some(([a]) => a.summon), "casts of both kinds");
    for (let i = acts.length - 1; i >= 0; i--) { h.undo(s); assert.equal(json(s), states[i], `undo ${i}`); }
    for (let i = 1; i <= acts.length; i++) { h.redo(s); assert.equal(json(s), states[i], `redo ${i}`); }
    const again = build();
    for (const [a, ctx] of acts) ok(apply(again, a, ctx));
    assert.equal(json(again), states.at(-1), "replayed");
    assert.ok(save, "saved mid-fight");
    const loaded = migrate(JSON.parse(save.state));
    for (const [a, ctx] of acts.slice(save.at)) ok(apply(loaded, a, ctx));
    assert.equal(json(loaded), states.at(-1), "loaded mid-fight");
  });
}
