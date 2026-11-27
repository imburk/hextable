// Companions, stage C3 (docs/specs/companions.md): summon blocks baked for a casting (summons.js), the `summon`
// step and the cast's `summon` field, the DM's `spawn` of a block, Giant Insect, what players are sent of a summon
// (twin runs against an unbonded creature, on hexes and on squares), undo, redo, replay and a save in the middle
// of a fight, and a seeded run that holds every creature to one turn a round.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { migrate } from "../src/migrate.js";
import { gridOf } from "../src/grid.js";
import { footprint, gap, FT } from "../src/space.js";
import { startEffect } from "../src/durations.js";
import { aiStep } from "../src/ai.js";
import { bake, castings } from "../src/summons.js";
import { CONTENT, PACKS, SPELLS } from "../src/content/index.js";
import { lintBaked, lintPack, STEPS, SUMMON_KINDS, SUMMON_MOST } from "../src/content/schema.js";
import { BOND_KINDS } from "../src/engine/companions.js";
import { summonCaster } from "../src/engine/world.js";
import { squareRoom } from "./fixtures/square-room.js";

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
const [srd] = PACKS;
const BLOCK = CONTENT.summons["giant-insect"];
const VARIANTS = ["centipede", "spider", "wasp"];

const ABIL = { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 };
const druidSheet = (name = "Ven") => ({ name, class: "druid", level: 17, subclass: "land", abilities: ABIL, skills: ["nature", "perception"],
  choices: { "primal-order": "warden", "elemental-fury": "primal-strike", "natures-ward": "polar" },
  armour: "leather-armor", shield: true, weapons: ["quarterstaff"], spells: ["produce-flame", "giant-insect"] });
const druid = (id, side, pos, name) => makeEntity(derive(druidSheet(name)).record, { id, kind: side === "party" ? "pc" : "npc", side, pos: { ...pos, z: 0 } });

// Free cells near a position where a creature of that monster's size can be added (the n-th of them).
function spot(s, near, n = 0, r = 3, monster = "wolf") {
  const G = gridOf(s.map), out = [];
  for (const h of G.range(near, r)) if (apply(structuredClone(s), { type: "spawn", monster, at: h }, DM).ok) out.push(h);
  return out[n];
}
const big = (s, near, n = 0, r = 4) => spot(s, near, n, r, "giant-spider");
// A free cell exactly `d` cells from a position (outside an arena of radius below d).
function ring(s, near, d) {
  const G = gridOf(s.map);
  return [...G.range(near, d)].find((h) => G.dist(h, near) === d && apply(structuredClone(s), { type: "spawn", monster: "wolf", at: h }, DM).ok);
}
// The valley with Ven, a party druid of level 17, beside the fighter, played by Pat.
function table(grid, seed = 5, claim = true) {
  const s = newGame(seed, grid ? { grid } : {});
  s.settings.autoEngage = false;
  s.entities.ven = druid("ven", "party", spot(s, s.entities.fighter.pos, 0, 2), "Ven");
  if (claim) ok(apply(s, { type: "claim", entity: "ven", user: "pat", userName: "Pat" }, PAT));
  return s;
}
const cast = (s, at, { variant = "wasp", slot = 4, actor = "ven", ctx = PAT, ...more } = {}) =>
  apply(s, { type: "cast", actor, spell: "giant-insect", slot, summon: { variant, at: [at] }, ...more }, ctx);
const summonedId = (r) => r.events.find((e) => e.type === "summoned").id;
const ids = (s) => s.encounter.order.map((o) => o.id);
const endTurn = (s) => ok(apply(s, { type: "endTurn", actor: current(s) }, DM));

// ---------- the block and the linter ----------

test("Giant Insect baked at every level 4 to 9, each variant: it lints as a monster, with the SRD's numbers", () => {
  const caster = { attack: 9, dc: 17, pb: 6, mod: 3 };
  assert.equal(castings(BLOCK).length, 6 * 3);
  for (const { slot, variant } of castings(BLOCK)) {
    const t = bake(BLOCK, { slot, variant, caster });
    const at = `level ${slot} ${variant}`;
    assert.deepEqual(lintBaked(t), [], at);
    assert.equal(t.ac, 11 + slot, at);                           // AC 11 + the spell's level
    assert.equal(t.hp, 30 + 10 * (slot - 4), at);                // HP 30 + 10 for each spell level above 4
    assert.equal(t.pb, 6, at);                                   // PB equals your Proficiency Bonus
    assert.deepEqual([t.cr, t.xp], [null, 0], at);               // CR None (XP 0)
    assert.deepEqual(t.speed, variant === "wasp" ? { walk: 40, climb: 40, fly: 40 } : { walk: 40, climb: 40 }, at);
    assert.equal(t.size, "large"); assert.equal(t.type, "beast");
    assert.deepEqual(t.abilities, { str: 17, dex: 13, con: 15, int: 4, wis: 14, cha: 3 });
    assert.deepEqual(t.senses, { darkvision: 60 });
    const act = (id) => t.actions.find((a) => a.id === id);
    assert.deepEqual(t.actions.map((a) => a.id), ["multiattack", "poison-jab", ...(variant === "spider" ? ["web-bolt"] : []), ...(variant === "centipede" ? ["venomous-spew"] : [])], at);
    assert.deepEqual(act("multiattack").multiattack, [{ action: variant === "spider" ? ["poison-jab", "web-bolt"] : "poison-jab", times: Math.floor(slot / 2) }], at);
    const jab = act("poison-jab");
    assert.deepEqual(jab.target, { creature: { reach: 10 } });
    assert.equal(jab.effects[0].bonus, 9, "Poison Jab: the caster's spell attack modifier");
    assert.deepEqual(jab.effects[0].onHit, [{ damage: `1d6+${3 + slot}`, type: "piercing" }, { damage: "1d4", type: "poison" }], at);
    if (variant === "spider") {
      const web = act("web-bolt").effects[0];
      assert.equal(web.bonus, 9); assert.deepEqual(act("web-bolt").target, { creature: { range: [60, 60] } });
      assert.deepEqual(web.onHit[0], { damage: `1d10+${3 + slot}`, type: "bludgeoning" });
    }
    if (variant === "centipede") {
      const spew = act("venomous-spew");
      assert.equal(spew.time, "bonus"); assert.equal(spew.effects[0].dc, 17); assert.equal(spew.effects[0].save, "con");
      assert.deepEqual(spew.target, { creature: { range: [10, 10] } });
    }
    assert.ok(!json(t).includes('"only"') && !json(t).includes('"plus"') && !json(t).includes('"caster"'), "no amount is left");
  }
});

test("the pack lints clean with its summon blocks; the linter catches summon amounts out of place and broken blocks and steps", () => {
  assert.deepEqual(lintPack(srd), []);
  assert.ok(STEPS.includes("summon"));
  assert.deepEqual(SUMMON_KINDS, BOND_KINDS, "the summon bond's kinds are Decision 1's");
  assert.equal(SUMMON_MOST, 30, "owner's answer 7");
  const clone = (x) => structuredClone(x);
  const withBlock = (change) => { const b = clone(BLOCK); change(b); return lintPack({ ...srd, summons: [b] }).join("\n"); };
  assert.match(withBlock((b) => { b.ac = { mod: "wis" }; }), /class amounts are for class features/);
  assert.match(withBlock((b) => { b.name.spider = undefined; delete b.name.spider; }), /nothing for "spider"/);
  assert.match(withBlock((b) => { b.actions[2].only = { variant: ["moth"] }; }), /only.variant/);
  assert.match(withBlock((b) => { b.hp = { slot: 0.5, base: 30 }; }), /needs `round`/);
  assert.match(withBlock((b) => { b.cr = 1; }), /no cr or xp/);
  assert.match(withBlock((b) => { b.speed.walk = -5; }), /speed/);
  const withMonster = (change) => { const m = clone(srd.monsters[0]); change(m); return lintPack({ ...srd, monsters: [m, ...srd.monsters.slice(1)] }).join("\n"); };
  assert.match(withMonster((m) => { m.ac = { slot: 1, base: 11 }; }), /summon amounts are for summon blocks/);
  assert.match(withMonster((m) => { m.traits = [...m.traits, { id: "x", name: "X", text: "x", modifiers: [], only: { slot: 4 } }]; }), /`only` is for summon blocks/);
  const gi = srd.spells.find((x) => x.id === "giant-insect");
  const withStep = (change) => { const sp = clone(gi); change(sp, sp.effects[0]); return lintPack({ ...srd, spells: [sp, ...srd.spells.filter((x) => x.id !== "giant-insect")] }).join("\n"); };
  // Since C5c (#342) one per master runs: `replace` lints, `reform` wants forms, and nothing else is a choice.
  assert.equal(withStep((sp, st) => { st.one = "replace"; }), "");
  assert.match(withStep((sp, st) => { st.one = "reform"; }), /`one: "reform"` gives the creature a new form: the step lists `forms`/);
  assert.match(withStep((sp, st) => { st.one = "twice"; }), /`one` is reform or replace/);
  assert.match(withStep((sp, st) => { st.bond.turn = "none"; }), /stages C5 and C6/);
  // Since C5b (#340) commands and corpses run: a command needs its range, and a step on corpses names corpses only
  // (companions-corpses.test.js has the rest).
  assert.match(withStep((sp, st) => { st.bond.orders = "command"; }), /how far they reach/);
  assert.match(withStep((sp, st) => { st.on = "corpse"; }), /on corpses has no `variants`/);
  assert.match(withStep((sp, st) => { st.variants = ["centipede", "wasp"]; }), /variants must be the block's/);
  assert.match(withStep((sp, st) => { st.summon = "owlbear-spirit"; }), /neither a summon block nor a pack monster/);
  assert.match(withStep((sp) => { sp.target = { creature: { count: 1 } }; }), /aimed at its caster/);
  assert.match(withStep((sp) => { sp.range = "self"; }), /range in feet/);
  assert.match(withStep((sp, st) => { delete st.bond; }), /needs `bond`/);
  assert.match(withStep((sp, st) => { sp.effects = [{ save: "dex", onFail: [st] }]; }), /one summon step, in its own list/);
  assert.match(lintPack({ ...srd, monsters: [{ ...clone(srd.monsters[0]), actions: [{ id: "call", name: "Call", text: "x", target: { self: true }, effects: [clone(gi.effects[0])] }] }] }).join("\n"), /summon step is for a spell/);
  // Giant Insect is now played by the engine, and the cast chooser can read what it summons.
  assert.equal(gi.tier, "auto");
  assert.deepEqual(SPELLS["giant-insect"].summon, { of: "giant-insect", count: 1, variants: VARIANTS, kind: "summon" });
});

// ---------- casting it ----------

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";

  test(`Giant Insect at levels 4 to 9, each variant: a creature with the baked numbers, bonded to its caster, kept by the spell${on}`, () => {
    const base = table(grid), at = big(base, base.entities.fighter.pos, 2);
    const caster = summonCaster(base, base.entities.ven, "giant-insect");
    assert.deepEqual(caster, { attack: 9, dc: 17, pb: 6, mod: 3 }, "Wisdom 16 and Proficiency +6 at level 17");
    for (let slot = 4; slot <= 9; slot++) for (const variant of VARIANTS) {
      const s = structuredClone(base), slots = s.entities.ven.slots[slot];
      const r = ok(cast(s, at, { variant, slot }));
      const id = summonedId(r), e = s.entities[id], fx = s.effects.find((x) => x.spell === "giant-insect");
      const say = `level ${slot} ${variant}`;
      assert.equal(e.name, `Ven's Giant ${variant[0].toUpperCase()}${variant.slice(1)}`, say);
      assert.equal(e.ac, 11 + slot, say);
      assert.equal(e.maxHp, 30 + 10 * (slot - 4), say); assert.equal(e.hp, e.maxHp);
      assert.deepEqual(e.speeds, variant === "wasp" ? { climb: 40, fly: 40 } : { climb: 40 }, say);
      assert.equal(e.speed, 40); assert.equal(e.prof, 6); assert.equal(e.type, "beast"); assert.equal(e.size, "large"); assert.equal(e.tpl, "giant-insect");
      assert.equal(e.actions.find((a) => a.id === "poison-jab").effects[0].bonus, caster.attack, "the master's attack bonus on Poison Jab");
      assert.equal(e.actions.find((a) => a.id === "multiattack").multiattack[0].times, Math.floor(slot / 2));
      assert.deepEqual([e.side, e.kind, e.owner], ["party", "npc", null]);
      assert.deepEqual(e.bond, { to: "ven", kind: "summon", source: "giant-insect", fx: fx.id, turn: "after", orders: "free", at0: "vanish", ends: [], slot, commanded: null, auto: false });
      assert.deepEqual(fx.parts, [{ target: id, summon: true }]);
      assert.ok(fx.conc);
      assert.equal(s.entities.ven.slots[slot], slots - 1, "the slot is spent");
      assert.deepEqual(r.events.find((x) => x.type === "summoned"), { type: "summoned", id, by: "ven", kind: "summon", fx: fx.id });
      // Ven's player plays it, nobody else does.
      ok(apply(structuredClone(s), { type: "move", actor: id, to: big(s, e.pos, 0, 2) }, PAT));
      refused(s, { type: "move", actor: id, to: big(s, e.pos, 0, 2) }, U2);
      // The party's own: Open to the players, bond and all.
      assert.deepEqual(view(s, PAT).entities[id].bond, e.bond);
      assert.deepEqual(viewEvents(r.events, s, PAT).find((x) => x.type === "summoned"), { type: "summoned", id, by: "ven", kind: "summon", fx: fx.id });
    }
  });

  test(`a summon is refused out of range, where its caster cannot see, where a creature it knows of stands, or with the wrong choices, and nothing changes${on}`, () => {
    const s = table(grid), ven = s.entities.ven, G = gridOf(s.map);
    const good = big(s, s.entities.fighter.pos, 2);
    // Beyond 60 feet: the nearest floor where a Large insect fits that is 65 feet or more away.
    const far = [...G.range(ven.pos, 16)].find((h) => gap(s, ven.pos, h) * FT > 60 && gap(s, ven.pos, h) * FT <= 75 && apply(structuredClone(s), { type: "spawn", monster: "giant-spider", at: h }, DM).ok);
    refused(s, { type: "cast", actor: "ven", spell: "giant-insect", slot: 4, summon: { variant: "wasp", at: [far] } }, PAT, /reaches 60 ft/);
    refused(s, { type: "cast", actor: "ven", spell: "giant-insect", slot: 4, summon: { variant: "wasp", at: [s.entities.fighter.pos] } }, PAT, /occupied/);
    refused(s, { type: "cast", actor: "ven", spell: "giant-insect", slot: 4, summon: { variant: "moth", at: [good] } }, PAT, /centipede, spider, wasp/);
    refused(s, { type: "cast", actor: "ven", spell: "giant-insect", slot: 4, summon: { at: [good] } }, PAT, /Choose what/);
    refused(s, { type: "cast", actor: "ven", spell: "giant-insect", slot: 4, summon: { variant: "wasp", at: [good, good] } }, PAT, /one space/);
    refused(s, { type: "cast", actor: "ven", spell: "giant-insect", slot: 4, summon: null }, PAT, /Pick where/);      // no field at all is the manual path (#332)
    refused(s, { type: "cast", actor: "ven", spell: "giant-insect", slot: 4, summon: { variant: "wasp", type: "fey", at: [good] } }, PAT, /no choice of creature type/);
    refused(s, { type: "cast", actor: "ven", spell: "giant-insect", slot: 4, summon: { variant: "wasp", at: [good], how: 1 } }, PAT, /not "how"/);
    refused(s, { type: "cast", actor: "ven", spell: "produce-flame", summon: { at: [good] } }, PAT);
    refused(s, { type: "cast", actor: "ven", spell: "giant-insect", slot: 3, summon: { variant: "wasp", at: [good] } }, PAT, /level 4 or higher/);
    // A blinded caster can see no space.
    const b = structuredClone(s);
    ok(apply(b, { type: "condition", actor: "ven", condition: "blinded" }, DM));
    refused(b, { type: "cast", actor: "ven", spell: "giant-insect", slot: 4, summon: { variant: "wasp", at: [good] } }, PAT, /can't see that space/);
    // A creature Ven cannot know of in that space does not stop the spell (a refusal would give it away): the
    // insect appears in the nearest free space, and the DM is told why.
    const h = structuredClone(s);
    const gob = ok(apply(h, { type: "spawn", monster: "goblin-warrior", at: good, hidden: true }, DM)).events[0].id;
    const r = ok(cast(h, good));
    const e = h.entities[summonedId(r)];
    assert.ok(!footprint(e, e.pos, G).some((f) => f.q === h.entities[gob].pos.q && f.r === h.entities[gob].pos.r), "beside, not on, the hidden goblin");
    assert.ok(r.events.some((x) => x.type === "manual" && x.partial && /did not know of/.test(x.text)));
    assert.ok(!json(viewEvents(r.events, h, PAT)).includes(gob), "players hear nothing of the goblin");
    ok(cast(s, good));                                            // and the good space is fine
  });

  test(`ending the spell ends the insect: dropping Concentration, Incapacitated, the caster dying; at 0 Hit Points it vanishes${on}`, () => {
    const base = table(grid), at = big(base, base.entities.fighter.pos, 2);
    // Dropping Concentration (the caster ends the effect).
    let s = structuredClone(base), id = summonedId(ok(cast(s, at)));
    let r = ok(apply(s, { type: "endEffect", effect: s.effects.find((x) => x.spell === "giant-insect").id }, PAT));
    assert.ok(!s.entities[id]);
    assert.deepEqual(r.events.find((x) => x.type === "vanished"), { type: "vanished", id, name: "Ven's Giant Wasp", why: "ended", seen: true, party: true });
    // Concentration broken by the Incapacitated condition.
    s = structuredClone(base); id = summonedId(ok(cast(s, at)));
    r = ok(apply(s, { type: "condition", actor: "ven", condition: "incapacitated" }, DM));
    assert.ok(!s.entities[id] && r.events.some((x) => x.type === "vanished" && x.why === "ended"));
    // The caster down.
    s = structuredClone(base); id = summonedId(ok(cast(s, at)));
    ok(apply(s, { type: "setHp", actor: "ven", hp: 0 }, DM));
    assert.ok(!s.entities[id]);
    // At 0 Hit Points: it vanishes, and with it gone the effect has nothing left and ends.
    s = structuredClone(base); id = summonedId(ok(cast(s, at)));
    r = ok(apply(s, { type: "setHp", actor: id, hp: 0 }, DM));
    assert.ok(!s.entities[id] && r.events.some((x) => x.type === "vanished" && x.why === "hp0"));
    assert.ok(!s.effects.some((x) => x.spell === "giant-insect"));
    // A new casting while it lasts: the old one ends (Concentration), the new one stands.
    s = structuredClone(base); id = summonedId(ok(cast(s, at)));
    const id2 = summonedId(ok(cast(s, big(s, s.entities.fighter.pos, 0, 6), { variant: "spider" })));
    assert.ok(!s.entities[id] && s.entities[id2]);
  });

  test(`in a fight: cast on the druid's turn, the insect acts next, on the druid's count, and leaves the order when it ends${on}`, () => {
    const s = table(grid), f = s.entities.fighter;
    s.entities.ven.initBonus = 40;                                // first
    ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: spot(s, f.pos, 5, 4) }, DM));
    ok(apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM));
    assert.equal(current(s), "ven");
    const r = ok(cast(s, big(s, f.pos, 1, 3)));
    const id = summonedId(r), entry = s.encounter.order.find((o) => o.id === id);
    assert.equal(ids(s)[ids(s).indexOf("ven") + 1], id, "straight after the druid");
    assert.deepEqual([entry.after, entry.init], ["ven", s.encounter.order.find((o) => o.id === "ven").init]);
    assert.deepEqual(viewEvents(r.events, s, PAT).find((x) => x.type === "joined"), r.events.find((x) => x.type === "joined"), "the party's own: after and all");
    endTurn(s);
    assert.equal(current(s), id, "the insect's turn comes next");
    // Its Multiattack: two attacks at level 4.
    ok(apply(s, { type: "act", actor: id, action: "multiattack" }, PAT));
    assert.deepEqual(s.encounter.budget.attacks, [[{ action: "poison-jab", left: 2 }]]);
    endTurn(s);
    ok(apply(s, { type: "endEffect", effect: s.effects.find((x) => x.spell === "giant-insect").id }, PAT));
    assert.ok(!ids(s).includes(id));
    // A point outside the arena is refused while the caster is in the fight.
    const out = [...gridOf(s.map).range(s.entities.ven.pos, 12)].find((h) => !s.encounter.arena[`${h.q},${h.r}`] && gap(s, s.entities.ven.pos, h) * FT <= 60
      && apply(structuredClone(s), { type: "spawn", monster: "giant-spider", at: h }, DM).ok);
    if (out) {
      while (current(s) !== "ven") endTurn(s);
      refused(s, { type: "cast", actor: "ven", spell: "giant-insect", slot: 5, summon: { variant: "wasp", at: [out] } }, PAT, /arena is locked/);
    }
  });
}

test("the spider's Web Bolt stops its target until the insect's next turn; the centipede's Venomous Spew uses the caster's DC", () => {
  let hit = false;
  for (let seed = 1; seed < 20 && !hit; seed++) {
    const s = table(null, seed, false), m1 = s.entities.m1;
    m1.hp = m1.maxHp = 300;
    const id = summonedId(ok(cast(s, big(s, s.entities.fighter.pos, 2), { variant: "spider", ctx: DM })));
    m1.pos = { ...spot(s, s.entities[id].pos, 0, 5), z: 0 };
    ok(apply(s, { type: "startEncounter", center: s.entities.fighter.pos, radius: 7 }, DM));
    while (current(s) !== id) endTurn(s);
    const r = ok(apply(s, { type: "act", actor: id, action: "web-bolt", target: "m1" }, DM));
    if (!r.events.some((e) => e.type === "attack" && e.hit)) continue;
    const fx = s.effects.find((x) => x.parts.some((p) => p.target === "m1" && p.modifier?.on === "speed"));
    assert.ok(fx, "a Speed of 0 on the target");
    endTurn(s);
    while (current(s) !== id) { if (current(s) === "m1") assert.ok(s.effects.includes(fx), "still stopped on its own turn"); endTurn(s); }
    assert.ok(!s.effects.includes(fx), "gone at the start of the insect's turn");
    hit = true;
  }
  assert.ok(hit, "a Web Bolt hit in one of the seeds");
  const s = table(null, 4, false);
  const id = summonedId(ok(cast(s, big(s, s.entities.fighter.pos, 2), { variant: "centipede", slot: 7, ctx: DM })));
  const spew = s.entities[id].actions.find((a) => a.id === "venomous-spew");
  assert.deepEqual([spew.time, spew.effects[0].dc], ["bonus", summonCaster(s, s.entities.ven, "giant-insect").dc]);
});

test("on square-room a Large insect fills 2 by 2 squares and is refused where it does not fit", () => {
  const s = newGame(14);
  ok(apply(s, { type: "loadMap", map: squareRoom() }, DM));
  s.settings.autoEngage = false;
  [["fighter", 1, 1], ["rogue", 0, 14], ["cleric", 1, 14], ["wizard", 2, 14]].forEach(([id, q, r]) => { s.entities[id].pos = { q, r, z: 0 }; });
  s.entities.ven = druid("ven", "party", { q: 7, r: 7 }, "Ven");
  const G = gridOf(s.map);
  const r = ok(cast(s, { q: 9, r: 7 }, { ctx: DM }));
  const e = s.entities[summonedId(r)];
  assert.deepEqual(footprint(e, e.pos, G).map((f) => `${f.q},${f.r}`).sort(), ["10,7", "10,8", "9,7", "9,8"]);
  const s2 = structuredClone(s);
  ok(apply(s2, { type: "endEffect", effect: s2.effects[0].id }, DM));
  // Against the east wall (column 15 is wall, rows 5 to 9): no room for 2 by 2.
  refused(s2, { type: "cast", actor: "ven", spell: "giant-insect", slot: 4, summon: { variant: "wasp", at: [{ q: 14, r: 6 }] } }, DM, /There isn't room for something large there/);
  // Against the statue at 10,3.
  refused(s2, { type: "cast", actor: "ven", spell: "giant-insect", slot: 4, summon: { variant: "wasp", at: [{ q: 9, r: 2 }] } }, DM, /There isn't room/);
  // Over the insect already there.
  refused(s, { type: "cast", actor: "ven", spell: "giant-insect", slot: 4, summon: { variant: "spider", at: [{ q: 10, r: 8 }] } }, DM, /occupied/);
  // The wasp flies: given a height, it can be put in the air; the others need a floor.
  const s3 = structuredClone(s2);
  const w = s3.entities[summonedId(ok(cast(s3, { q: 5, r: 5, z: 10 }, { ctx: DM })))];
  assert.equal(w.pos.z, 10);
  const s4 = structuredClone(s2);
  const c = s4.entities[summonedId(ok(cast(s4, { q: 5, r: 5, z: 10 }, { ctx: DM, variant: "centipede" })))];
  assert.equal(c.pos.z, 0, "a centipede lands on the floor");
});

test("the DM's spawn shares the place checks and can add a summon block, unbonded", () => {
  const s = table(null), f = s.entities.fighter;
  refused(s, { type: "spawn", monster: "giant-insect", at: big(s, f.pos, 2) }, DM, /level 4 to 9/);
  refused(s, { type: "spawn", monster: "giant-insect", at: big(s, f.pos, 2), slot: 5 }, DM, /Choose one of/);
  refused(s, { type: "spawn", monster: "giant-insect", at: big(s, f.pos, 2), slot: 5, variant: "wasp" }, DM, /No such creature/);
  refused(s, { type: "spawn", monster: "wolf", at: big(s, f.pos, 2), slot: 5 }, DM, /for a summon block/);
  refused(s, { type: "spawn", monster: "giant-spider", at: f.pos }, DM, /occupied/);
  refused(s, { type: "spawn", monster: "giant-insect", at: big(s, f.pos, 2), slot: 5, variant: "wasp", caster: "ven" }, PAT, /Only the DM/);
  const id = ok(apply(s, { type: "spawn", monster: "giant-insect", at: big(s, f.pos, 2), slot: 5, variant: "wasp", caster: "ven" }, DM)).events[0].id;
  const e = s.entities[id];
  assert.deepEqual([e.name, e.ac, e.maxHp, e.side, e.bond, e.type], ["Giant Wasp 1", 16, 40, "foe", undefined, "beast"]);
});

test("a cast is refused for a master with 30 companions, and for a companion; 29 leave room for one", () => {
  const s = table(null), f = s.entities.fighter, at = big(s, f.pos, 2);
  for (let i = 0; i < 29; i++) {
    s.entities[`w${i}`] = makeEntity({ name: "Wolf", size: "medium", ac: 13, hp: 11, speed: 40, abil: ABIL, prof: 2 }, { id: `w${i}`, tpl: "wolf", side: "party", pos: { q: 40 + i, r: 40, z: 0 },
      bond: { to: "ven", kind: "pet", fx: null, turn: "own", orders: "free", at0: "dies", ends: [], commanded: null, auto: false } });
  }
  const s30 = structuredClone(s);
  s30.entities.w29 = { ...structuredClone(s.entities.w0), id: "w29", pos: { q: 70, r: 40, z: 0 } };
  refused(s30, { type: "cast", actor: "ven", spell: "giant-insect", slot: 4, summon: { variant: "wasp", at: [at] } }, PAT, /can have at most 30 companions\./);
  ok(cast(s, at));
  // A companion casting a summon: a companion has no companions of its own.
  const c = table(null);
  c.entities.ven.bond = { to: "fighter", kind: "pet", fx: null, turn: "own", orders: "free", at0: "dies", ends: [], commanded: null, auto: false };
  refused(c, { type: "cast", actor: "ven", spell: "giant-insect", slot: 4, summon: { variant: "wasp", at: [big(c, c.entities.fighter.pos, 2)] } }, PAT, /companion itself/);
});

// ---------- what players are sent ----------

// What players get of a run: every action's events, the view after each, the record, and the counter.
const seenBy = (s, results) => [PAT, U2].map((u) => ({ ev: results.map((r) => json(viewEvents(r.events, s, u))), view: json(view(s, u)), tl: json(viewEvents(s.timeline, s, u)) }));

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";
  // A foe druid the DM hid casts Giant Insect (A), or (B) the DM adds the same block unbonded with the same numbers,
  // with the druid holding a lasting effect of its own (as the spell would), so the counter moves the same way.
  // Then a fight: the insect takes its turns and attacks; the party acts. Players must get the same in both.
  // The druid stands outside the arena, so it stays hidden from the party all through. What players get is taken
  // after each action, as the server sends it.
  const twin = (setup) => {
    const run = (summoned) => {
      const s = table(grid), f = s.entities.fighter, out = [], sent = [];
      s.entities.mage = druid("mage", "foe", ring(s, f.pos, 9), "Mira");
      ok(apply(s, { type: "reveal", actor: "mage", hidden: true }, DM));
      const at = big(s, f.pos, 3, 3);
      setup?.(s);
      if (summoned) out.push(ok(apply(s, { type: "cast", actor: "mage", spell: "giant-insect", slot: 5, summon: { variant: "spider", at: [at] } }, DM)));
      else {
        startEffect(s, { name: "Giant Insect", spell: "giant-insect", source: "mage", conc: true, duration: "10 minutes" });
        s.entities.mage.slots[5]--;
        out.push(ok(apply(s, { type: "spawn", monster: "giant-insect", at, slot: 5, variant: "spider", caster: "mage" }, DM)));
      }
      const id = out[0].events.find((e) => e.type === "summoned" || e.type === "spawned").id;
      const tell = (r) => { out.push(r); sent.push([PAT, U2].map((u) => [json(viewEvents(r.events, s, u)), json(view(s, u))])); };
      sent.push([PAT, U2].map((u) => [json(viewEvents(out[0].events, s, u)), json(view(s, u))]));
      tell(ok(apply(s, { type: "startEncounter", center: f.pos, radius: 6 }, DM)));
      assert.ok(!ids(s).includes("mage") && ids(s).includes(id), "the druid is outside the fight; its insect is in it");
      for (let i = 0; i < 3 * ids(s).length && s.encounter; i++) {
        for (let n = 0; n < 6 && current(s) === id; n++) {
          const step = aiStep(s, id);
          if (!step || step.type === "endTurn") break;
          tell(ok(apply(s, step, DM)));
        }
        tell(endTurn(s));
      }
      return { s, id, out, seen: { sent, tl: [PAT, U2].map((u) => json(viewEvents(s.timeline, s, u))) }, seq: s.seq, dm: out.flatMap((r) => r.events) };
    };
    const A = run(true), B = run(false);
    assert.deepEqual(A.seen.sent, B.seen.sent, "players' events and view after each action");
    assert.deepEqual(A.seen.tl, B.seen.tl, "the record");
    assert.equal(A.seq, B.seq);
    assert.equal(A.id, B.id);
    return { A, B };
  };

  test(`a hidden foe's summon reaches players exactly as a creature the DM adds: events, views, record, counter${on}`, () => {
    const { A } = twin();
    const sent = json(A.seen);
    assert.ok(!sent.includes('\\"mage\\"') && !sent.includes("Mira"), "nothing names the hidden druid");
    assert.ok(!sent.includes('"summoned"') && !sent.includes('"bond"') && !sent.includes('"after"'), "nothing says it has a master");
    assert.equal(A.seen.sent[0][0][0], json([{ id: A.id, type: "spawned" }]));
    assert.ok(A.s.entities[A.id].bond, "it is bonded, for the DM");
    assert.ok(A.dm.some((e) => e.type === "summoned" && e.by === "mage"), "the DM is told who summoned it");
    assert.ok(A.dm.some((e) => e.type === "attack" && e.actor === A.id) || A.dm.some((e) => e.type === "moved" && e.id === A.id), "the insect played its turns");
  });

  test(`a hidden foe's hidden summon that ends with its master's Concentration: players get what an unbonded hidden creature gives${on}`, () => {
    const run = (summoned) => {
      const s = table(grid), f = s.entities.fighter, out = [];
      s.entities.mage = druid("mage", "foe", ring(s, f.pos, 9), "Mira");
      ok(apply(s, { type: "reveal", actor: "mage", hidden: true }, DM));
      const at = big(s, f.pos, 3, 3);
      if (summoned) out.push(ok(apply(s, { type: "cast", actor: "mage", spell: "giant-insect", slot: 4, summon: { variant: "wasp", at: [at] } }, DM)));
      else {
        startEffect(s, { name: "Giant Insect", spell: "giant-insect", source: "mage", conc: true, duration: "10 minutes" });
        s.entities.mage.slots[4]--;
        out.push(ok(apply(s, { type: "spawn", monster: "giant-insect", at, slot: 4, variant: "wasp", caster: "mage" }, DM)));
      }
      const id = out[0].events.find((e) => e.type === "summoned" || e.type === "spawned").id;
      out.push(ok(apply(s, { type: "reveal", actor: id, hidden: true }, DM)));
      out.push(ok(apply(s, { type: "endEffect", effect: s.effects.find((x) => x.source === "mage").id }, DM)));
      out.push(ok(apply(s, { type: "advanceTime", minutes: 30 }, DM)));
      return { s, id, seen: seenBy(s, out), seq: s.seq };
    };
    const A = run(true), B = run(false);
    assert.deepEqual(A.seen, B.seen);
    assert.equal(A.seq, B.seq);
    assert.equal(A.s.entities[A.id].vanished, "ended", "the husk an unseen vanish leaves");
  });

  test(`a foe druid the party sees casts it: players learn who and what kind, never the effect, the bond, the numbers or its place behind its master${on}`, () => {
    const s = table(grid), f = s.entities.fighter;
    s.entities.mage = druid("mage", "foe", spot(s, f.pos, 6, 5), "Mira");
    const r = ok(apply(s, { type: "cast", actor: "mage", spell: "giant-insect", slot: 6, summon: { variant: "centipede", at: [big(s, f.pos, 3, 3)] } }, DM));
    const id = summonedId(r);
    assert.equal(s.entities[id].name, "Giant Centipede 1", "a foe's summon is not named after its master");
    assert.deepEqual(viewEvents(r.events, s, PAT).find((x) => x.id === id), { type: "summoned", id, by: "mage", kind: "summon" });
    const v = view(s, PAT).entities[id];
    for (const k of ["bond", "ac", "maxHp", "actions", "abil"]) assert.equal(v[k], undefined, k);
    assert.equal(v.hp, 1);
    ok(apply(s, { type: "startEncounter", center: f.pos, radius: 7 }, DM));
    assert.ok(s.encounter.order.find((o) => o.id === id).after === "mage");
    assert.deepEqual(view(s, PAT).encounter.order.find((o) => o.id === id), { id }, "a foe's entry is only its id");
    assert.ok(!json(viewEvents(s.timeline, s, PAT)).includes('"after":"mage"'));
  });
}

// A player's Giant Insect whose space, and every space near it, is taken by creatures the party does not know of:
// nothing appears, the DM alone is told why (review of #326, M1). A small map of floor only, the party on one side,
// hidden goblins on every other cell. Players get exactly the same whether the goblin in the space is an unbonded
// creature the DM added or a hidden foe's companion.
for (const grid of ["hex", "square"]) {
  test(`a player's summon with no free space near: nothing reaches the player of the creatures there or of why (${grid === "hex" ? "hexes" : "squares"})`, () => {
    const run = (bonded) => {
      const s = newGame(9), G0 = gridOf({ grid }), tiles = {};
      for (const h of G0.range({ q: 0, r: 0 }, 4)) tiles[`${h.q},${h.r}`] = { t: "stone" };
      ok(apply(s, { type: "loadMap", map: { format: 2, id: "tiny", name: "Tiny", grid, cellFeet: 5, levels: [{ id: "ground", name: "Ground", z: 0, light: "bright", tiles }], walls: [], objects: [], regions: [], starts: [{ q: -3, r: 0 }] } }, DM));
      s.settings.autoEngage = false;
      const G = gridOf(s.map), cells = [...G.range({ q: 0, r: 0 }, 4)];
      const party = ["fighter", "rogue", "cleric", "wizard"];
      s.entities.ven = druid("ven", "party", s.entities.fighter.pos, "Ven");
      s.entities.fighter.pos = { q: 40, r: 40, z: 0 };                          // off the little map, out of the way
      ok(apply(s, { type: "claim", entity: "ven", user: "pat", userName: "Pat" }, PAT));
      const taken = new Set(Object.values(s.entities).filter((e) => party.includes(e.id) || e.id === "ven").map((e) => `${e.pos.q},${e.pos.r}`));
      const gobs = [];
      for (const h of cells) if (!taken.has(`${h.q},${h.r}`)) gobs.push(ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: h, hidden: true }, DM)).events[0].id);
      // A space for the insect that only hidden goblins stand in, as far from the party as the little map goes.
      const want = cells.filter((h) => footprint({ size: "large" }, h, G).every((f) => cells.some((c) => c.q === f.q && c.r === f.r) && !taken.has(`${f.q},${f.r}`)))
        .sort((a, b) => G.dist(b, s.entities.ven.pos) - G.dist(a, s.entities.ven.pos))[0];
      const under = gobs.find((id) => footprint({ size: "large" }, want, G).some((f) => f.q === s.entities[id].pos.q && f.r === s.entities[id].pos.r));
      if (bonded) { s.entities[under].hidden = false; ok(apply(s, { type: "bond", actor: under, to: gobs.find((x) => x !== under), kind: "summon" }, DM)); s.entities[under].hidden = true; }
      const r = ok(cast(s, want));
      return { s, r, gobs, seen: [PAT, U2].map((u) => [json(viewEvents(r.events, s, u)), json(view(s, u)), json(viewEvents(s.timeline.slice(-r.events.length), s, u))]), seq: s.seq };
    };
    const A = run(false), B = run(true);
    assert.ok(!A.r.events.some((e) => e.type === "summoned"), "nothing appeared");
    const told = A.r.events.find((e) => e.type === "manual" && /found no unoccupied space/.test(e.text));
    assert.ok(told && told.partial, "the DM is told, and only the DM");
    const mine = viewEvents(A.r.events, A.s, PAT);
    assert.ok(!mine.some((e) => e.type === "manual"), "no line for the player");
    assert.ok(!A.gobs.some((id) => json(A.seen).includes(`"${id}"`)), "no goblin's id reaches a player");
    assert.deepEqual(A.seen, B.seen, "the same for an unbonded creature and a foe's companion");
    assert.equal(A.seq, B.seq);
  });
}

test("a summon's count that grows with the slot must stay 1 to 30 at every level; a foe's variants are numbered apart", () => {
  const gi = srd.spells.find((x) => x.id === "giant-insect");
  const withCount = (count) => { const sp = structuredClone(gi); Object.assign(sp.effects[0], { on: "space", count }); return lintPack({ ...srd, spells: [sp, ...srd.spells.filter((x) => x.id !== "giant-insect")] }).join("\n"); };
  assert.match(withCount({ slot: 4, base: 0 }), /makes 32 creatures at level 8/);
  assert.match(withCount({ slot: 1000 }), /must be 1 to 30/);
  assert.match(withCount({ slot: 1, base: 0, above: 4 }), /makes 0 creatures at level 4/);
  assert.equal(withCount({ slot: 2, base: 1, above: 4 }), "");
  const s = table(null);
  s.entities.mage = druid("mage", "foe", ring(s, s.entities.fighter.pos, 5), "Mira");
  const a = summonedId(ok(apply(s, { type: "cast", actor: "mage", spell: "giant-insect", slot: 4, summon: { variant: "wasp", at: [big(s, s.entities.fighter.pos, 2)] } }, DM)));
  const b = ok(apply(s, { type: "spawn", monster: "giant-insect", at: big(s, s.entities.fighter.pos, 4, 5), slot: 4, variant: "spider", caster: "mage" }, DM)).events[0].id;
  const c = ok(apply(s, { type: "spawn", monster: "giant-insect", at: big(s, s.entities.fighter.pos, 6, 6), slot: 4, variant: "wasp", caster: "mage" }, DM)).events[0].id;
  assert.deepEqual([s.entities[a].name, s.entities[b].name, s.entities[c].name], ["Giant Wasp 1", "Giant Spider 1", "Giant Wasp 2"]);
});

// ---------- undo, redo, replay, a save in the middle of a fight, and one turn each a round ----------

// A seeded fight: Ven and a foe druid summon, the insects fight (the AI plays every creature that is not a
// party character), creatures join, the DM breaks Concentration and drops creatures to 0. Returns the actions
// sent, in order, with the state after each.
function stress(grid, seed) {
  let x = seed;
  const rnd = (n) => { x = (x * 1103515245 + 12345) % 2147483648; return Math.floor(x / 65536) % n; };
  const build = () => {
    const s = table(grid, seed, false), f = s.entities.fighter;
    s.entities.mage = druid("mage", "foe", spot(s, f.pos, 6, 5), "Mira");
    ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: spot(s, f.pos, 8, 4) }, DM));
    return s;
  };
  const s = build(), acts = [], states = [json(s)], h = createHistory({ limit: 1000, maxBytes: 1e9 }), rounds = [];
  const send = (a) => {
    const before = mark(s), r = apply(s, a, DM);
    if (!r.ok) return null;
    h.record(before, s, describeStep(a, r.events, before, s));
    acts.push(a); states.push(json(s));
    for (const e of r.events) if (e.type === "turn") rounds.push(e);
    return r;
  };
  send({ type: "startEncounter", center: s.entities.fighter.pos, radius: 6 });
  let save = null;
  for (let i = 0; i < 90 && s.encounter; i++) {
    if (i === 45) save = { at: acts.length, state: json(s) };
    const id = current(s), e = s.entities[id], roll = rnd(20);
    // Now and then the DM steps in: a goblin joins, a master loses Concentration, a summon drops to 0.
    if (roll === 0) send({ type: "spawn", monster: "goblin-warrior", at: spot(s, s.entities.fighter.pos, rnd(4), 5) ?? s.entities.fighter.pos });
    const summons = Object.values(s.entities).filter((o) => o.bond && !o.vanished);
    if (roll === 1 && summons.length) send({ type: "setHp", actor: summons[rnd(summons.length)].id, hp: 0 });
    if (roll === 2) { const m = ["ven", "mage"][rnd(2)]; if (s.entities[m] && !s.entities[m].cond.incapacitated && s.entities[m].hp > 0) send({ type: "condition", actor: m, condition: "incapacitated" }); }
    if (roll === 3 || roll === 4) for (const m of ["ven", "mage"]) if (s.entities[m]?.cond.incapacitated) send({ type: "condition", actor: m, condition: "incapacitated", on: false });
    if (!s.encounter || current(s) !== id) continue;
    if ((id === "ven" || id === "mage") && e.hp > 0 && rnd(2) === 0) {
      const slot = 4 + rnd(3), variant = VARIANTS[rnd(3)];
      for (let n = 0; n < 6; n++) {
        const at = big(s, s.entities.fighter.pos, rnd(10), 4);
        if (at && send({ type: "cast", actor: id, spell: "giant-insect", slot, summon: { variant, at: [at] } })) break;
      }
    } else if (e.kind !== "pc" && s.entities[id]) {
      for (let n = 0; n < 6 && s.encounter && current(s) === id; n++) {
        const step = aiStep(s, id);
        if (!step || step.type === "endTurn" || !send(step)) break;
      }
    }
    if (s.encounter && current(s) === id) send({ type: "endTurn", actor: id });
  }
  return { build, s, acts, states, h, rounds, save };
}

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";
  test(`a seeded fight with summons: one turn each a round, and undo, redo, replay and a save in the middle all give back exactly the same${on}`, () => {
    for (const seed of [3, 7, 11]) {
      const { build, s, acts, states, h, rounds, save } = stress(grid, seed);
      assert.ok(acts.some((a) => a.type === "cast"), `seed ${seed}: something was summoned`);
      // No double turn, no lost turn: within each round, every id has at most one turn; a creature in the order and
      // up at both ends of a round, and never dead between, had one.
      const byRound = {};
      for (const t of rounds) if (t.id) (byRound[t.round] ??= []).push(t.id);
      for (const [round, who] of Object.entries(byRound)) assert.equal(new Set(who).size, who.length, `${grid ?? "hex"} seed ${seed} round ${round}: ${who.join(" ")}`);
      const starts = [];
      states.forEach((st, i) => { const x = JSON.parse(st); if (x.encounter && (i === 0 || JSON.parse(states[i - 1]).encounter?.round !== x.encounter.round)) starts.push(x); });
      for (let k = 0; k + 1 < starts.length; k++) {
        const a = starts[k], b = starts[k + 1], r = a.encounter.round;
        for (const o of a.encounter.order) {
          const ea = a.entities[o.id], eb = b.entities[o.id];
          if (!ea || !eb || ea.dead || eb.dead || ea.hp <= 0 || eb.hp <= 0 || !b.encounter.order.some((y) => y.id === o.id)) continue;
          // Dead at any point in the round (and so skipped) is not a lost turn.
          const fell = states.some((st) => { const x = JSON.parse(st); return x.encounter?.round === r && (x.entities[o.id]?.dead || (x.entities[o.id]?.hp ?? 1) <= 0); });
          if (fell) continue;
          assert.ok((byRound[r] ?? []).includes(o.id), `${grid ?? "hex"} seed ${seed} round ${r}: ${o.id} lost its turn`);
        }
      }
      // Undo all the way back, then redo all the way forward.
      for (let i = acts.length - 1; i >= 0; i--) { h.undo(s); assert.equal(json(s), states[i], `seed ${seed}: undo ${i}`); }
      for (let i = 1; i <= acts.length; i++) { h.redo(s); assert.equal(json(s), states[i], `seed ${seed}: redo ${i}`); }
      // The same actions on a fresh table replay exactly.
      const again = build();
      for (const a of acts) ok(apply(again, a, DM));
      assert.equal(json(again), states.at(-1), `seed ${seed}: replayed`);
      // Saved in the middle of the fight and loaded (a round trip through JSON and the migration), it plays on the same.
      if (save) {
        const loaded = migrate(JSON.parse(save.state));
        for (const a of acts.slice(save.at)) ok(apply(loaded, a, DM));
        assert.equal(json(loaded), states.at(-1), `seed ${seed}: loaded mid-fight`);
      }
    }
  });
}
