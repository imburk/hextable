// Companions, stage C5b (#340; docs/specs/companions.md, Decision 7 and the C5b build notes): corpses, Animate Dead
// and Create Undead. A summon step `on: 'corpse'`: the cast names dead Medium or Small Humanoids in range
// (`summon: { ids }`), each replaced in its space by the step's creature, bonded to the caster with `orders: 'command'`
// and a command range, under its control for 24 hours (a lasting effect with a `bond` part); then the bond ends and the
// creature is a foe, and the DM is told. Casting again on the caster's own creatures of the spell within the time
// keeps them (`reassert`). With refusals (range, size and type, a corpse used once, a vanished husk, mixing), the C5a
// lock on a never-commanded creature, the cap of 30, slot and action economy, the manual hand-off with no picks, twin
// runs for a hidden necromancer, the lifted linter rules, undo, redo, replay, save and load, and old saves. Hexes and
// squares.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity, ownerOf } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { migrate } from "../src/migrate.js";
import { gridOf } from "../src/grid.js";
import { apart, FT } from "../src/space.js";
import { startEffect } from "../src/durations.js";
import { spellProfile } from "../src/effects.js";
import { CONTENT, PACKS, SPELLS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";

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
const LOCK = /no command to follow/;
const DAY = 24 * 60;

// A test-only plain manual spell: Animate Dead's level, time, range and components, aimed at nothing the engine can aim
// (so its caster is not revealed, as a summon's is not), with one manual step: what Animate Dead was before C5b.
const AD = CONTENT.spells["animate-dead"];
const PLAIN = { ...structuredClone(AD), id: "test-plain-animate", name: "Test Plain Animate", tier: "manual", target: { area: { shape: "line", size: 60 } },
  effects: [{ manual: "Test only: the DM raises a corpse." }] };
SPELLS[PLAIN.id] = spellProfile(PLAIN);
assert.equal(SPELLS[PLAIN.id].aim, "none");

const ABIL = { str: 8, dex: 14, con: 14, int: 18, wis: 12, cha: 10 };
const wizard = (id, side, pos, name) => {
  const e = makeEntity(derive({ name, class: "wizard", level: 17, abilities: ABIL, skills: ["arcana", "history"], spells: ["animate-dead", "create-undead"] }).record,
    { id, kind: side === "party" ? "pc" : "npc", side, pos: { ...pos, z: 0 } });
  e.spells.push(PLAIN.id, "bless");
  return e;
};
function free(s, near, r = 4) {
  const G = gridOf(s.map), out = [];
  for (const h of G.range(near, r)) if (apply(structuredClone(s), { type: "spawn", monster: "wolf", at: h }, DM).ok) out.push(h);
  return out;
}
const spawn = (s, monster, at, more = {}) => ok(apply(s, { type: "spawn", monster, at, ...more }, DM)).events.find((e) => e.type === "spawned").id;
// A dead creature of that monster, at a free cell whose nearest part is `feet` from the caster (by the table's measure).
function corpse(s, monster, feet, caster = "nia", more = {}) {
  const c = s.entities[caster];
  for (const h of free(s, c.pos, 5)) {
    const t = structuredClone(s), id = spawn(t, monster, h);
    if (apart(t, c, t.entities[id]) * FT !== feet) continue;
    const real = spawn(s, monster, h, more);
    ok(apply(s, { type: "setHp", actor: real, hp: 0 }, DM));
    assert.ok(s.entities[real].dead, "a corpse");
    return real;
  }
  throw new Error(`no free cell ${feet} ft from ${caster}`);
}
// The valley with Nia, a party wizard of level 17, beside the fighter, played by Pat.
function table(grid, seed = 5) {
  const s = newGame(seed, grid ? { grid } : {});
  s.settings.autoEngage = false;
  s.entities.nia = wizard("nia", "party", free(s, s.entities.fighter.pos, 2)[0], "Nia");
  ok(apply(s, { type: "claim", entity: "nia", user: "pat", userName: "Pat" }, PAT));
  return s;
}
const raise = (s, ids, { slot = 3, spell = "animate-dead", actor = "nia", ctx = PAT } = {}) => apply(s, { type: "cast", actor, spell, slot, summon: { ids } }, ctx);
const made = (r) => r.events.filter((e) => e.type === "summoned").map((e) => e.id);
const endTurn = (s) => ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
function toTurn(s, id) {
  for (let i = 0; i < 100 && s.encounter && current(s) !== id; i++) endTurn(s);
  assert.equal(current(s), id, `${id}'s turn came`);
}

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";

  test(`a corpse 15 ft away is refused at range 10; one 10 ft away rises${on}`, () => {
    const s = table(grid), far = corpse(s, "bandit", 15), near = corpse(s, "bandit", 10);
    refused(s, { type: "cast", actor: "nia", spell: "animate-dead", slot: 3, summon: { ids: [far] } }, PAT, /15 ft away\. Animate Dead reaches 10 ft/);
    refused(s, { type: "cast", actor: "nia", spell: "animate-dead", slot: 3, summon: { ids: [far] } }, DM, /reaches 10 ft/);
    const r = ok(raise(s, [near]));
    assert.equal(made(r).length, 1);
  });

  test(`a Medium or Small Humanoid corpse becomes a Zombie in its space, bonded and never commanded, under the C5a lock${on}`, () => {
    for (const size of ["medium", "small"]) {
      const s = table(grid), c = corpse(s, "commoner", 5);
      s.entities[c].size = size;
      const pos = { ...s.entities[c].pos }, slots = s.entities.nia.slots[3];
      const r = ok(raise(s, [c]));
      const [z] = made(r), e = s.entities[z];
      assert.ok(!s.entities[c], "the corpse record goes");
      assert.deepEqual(e.pos, pos, "in the corpse's space");
      assert.equal(e.tpl, "zombie"); assert.equal(e.name, "Nia's Zombie"); assert.equal(e.side, "party");
      assert.deepEqual([e.ac, e.hp, e.maxHp], [8, 15, 15], "the pack's Zombie");
      assert.equal(e.bond.to, "nia"); assert.equal(e.bond.kind, "undead"); assert.equal(e.bond.orders, "command");
      assert.equal(e.bond.range, 60); assert.equal(e.bond.turn, "own"); assert.equal(e.bond.at0, "dies"); assert.equal(e.bond.source, "animate-dead");
      assert.equal(e.bond.commanded, null); assert.ok(!e.bond.standing, "never commanded");
      const fx = s.effects.find((x) => x.id === e.bond.fx);
      assert.ok(fx && !fx.conc && fx.lasts === "24 hours" && fx.source === "nia");
      assert.deepEqual(fx.parts, [{ target: z, bond: true }]);
      assert.equal(s.entities.nia.slots[3], slots - 1, "the slot is spent");
      // The player is told it was summoned by their caster, and nothing of the corpse's name.
      const mine = viewEvents(r.events, s, PAT);
      assert.ok(mine.some((x) => x.type === "summoned" && x.id === z && x.by === "nia" && x.kind === "undead"));
      // The C5a lock: outside a fight its player moves it, but it does nothing else until commanded.
      assert.equal(ownerOf(s, e), "pat");
      refused(s, { type: "search", actor: z }, PAT, LOCK);
      refused(s, { type: "search", actor: z }, DM, LOCK);
      // In a fight it is the DM's and may only Dodge and move.
      const G = gridOf(s.map), gob = spawn(s, "goblin-warrior", free(s, s.entities.fighter.pos, 5).filter((h) => G.dist(h, e.pos) >= 3)[0]);
      ok(apply(s, { type: "startEncounter", center: s.entities.fighter.pos, radius: 7 }, DM));
      toTurn(s, z);
      assert.equal(ownerOf(s, e), null);
      refused(s, { type: "attack", actor: z, target: gob, attack: "slam" }, DM, LOCK);
      ok(apply(s, { type: "dodge", actor: z }, DM));
    }
  });

  test(`a non-Humanoid, a Large, a dusty, a living and a player's corpse are refused with nothing changed${on}`, () => {
    const s = table(grid);
    const wolf = corpse(s, "wolf", 5), big = corpse(s, "bandit", 10), dust = corpse(s, "guard", 5), alive = spawn(s, "bandit", free(s, s.entities.nia.pos, 2).at(-1));
    s.entities[big].size = "large";
    s.entities[dust].remains = "dust";
    for (const ctx of [PAT, DM]) {
      refused(s, { type: "cast", actor: "nia", spell: "animate-dead", slot: 3, summon: { ids: [wolf] } }, ctx, /not the corpse of a Medium or Small Humanoid/);
      refused(s, { type: "cast", actor: "nia", spell: "animate-dead", slot: 3, summon: { ids: [big] } }, ctx, /not the corpse of a Medium or Small Humanoid/);
      refused(s, { type: "cast", actor: "nia", spell: "animate-dead", slot: 3, summon: { ids: [dust] } }, ctx, /dust: there is no corpse/);
    }
    assert.ok(apart(s, s.entities.nia, s.entities[alive]) * FT <= 10);
    refused(s, { type: "cast", actor: "nia", spell: "animate-dead", slot: 3, summon: { ids: [alive] } }, PAT, /neither a corpse nor a creature Nia made/);
    // A dead player's character is the player's record: refused, the DM's to decide.
    const pc = structuredClone(s);
    pc.entities.rogue.pos = { ...pc.entities[wolf].pos };
    delete pc.entities[wolf];
    pc.entities.rogue.dead = true; pc.entities.rogue.hp = 0;
    refused(pc, { type: "cast", actor: "nia", spell: "animate-dead", slot: 3, summon: { ids: ["rogue"] } }, DM, /player's character/);
    // Malformed picks, and picks of the space kind.
    for (const summon of [null, {}, { ids: [] }, { ids: "x" }, { ids: [wolf, wolf] }, { at: [s.entities[wolf].pos] }, { ids: [wolf], at: [] }, { ids: [1] }])
      refused(s, { type: "cast", actor: "nia", spell: "animate-dead", slot: 3, summon }, DM);
    // Too many: one corpse at level 3, three at level 4.
    const c1 = corpse(s, "bandit", 5), c2 = corpse(s, "bandit", 5), c3 = corpse(s, "bandit", 5), c4 = corpse(s, "bandit", 10);
    refused(s, { type: "cast", actor: "nia", spell: "animate-dead", slot: 3, summon: { ids: [c1, c2] } }, PAT, /animates one corpse at level 3/);
    refused(s, { type: "cast", actor: "nia", spell: "animate-dead", slot: 4, summon: { ids: [c1, c2, c3, c4] } }, PAT, /up to 3 corpses at level 4/);
    const r = ok(raise(s, [c1, c2, c3], { slot: 4 }));
    assert.equal(made(r).length, 3, "three Zombies from a level 4 slot");
    assert.equal(new Set(made(r).map((id) => s.entities[id].bond.fx)).size, 3, "each its own 24 hours");
  });

  test(`a corpse used once is not found again; a vanished creature is not a corpse; an unseen one is no creature to a player${on}`, () => {
    const s = table(grid), c = corpse(s, "bandit", 5);
    ok(raise(s, [c]));
    refused(s, { type: "cast", actor: "nia", spell: "animate-dead", slot: 4, summon: { ids: [c] } }, PAT, /No such creature/);
    refused(s, { type: "cast", actor: "nia", spell: "animate-dead", slot: 4, summon: { ids: [c] } }, DM, /No such creature/);
    // The husk an unseen vanish leaves: dead, hidden for good, marked `vanished`.
    const h = corpse(s, "bandit", 5);
    Object.assign(s.entities[h], { hidden: true, vanished: "leash" });
    refused(s, { type: "cast", actor: "nia", spell: "animate-dead", slot: 4, summon: { ids: [h] } }, DM, /gone: there is no corpse/);
    refused(s, { type: "cast", actor: "nia", spell: "animate-dead", slot: 4, summon: { ids: [h] } }, PAT, /^No such creature\.$/);
    // A corpse the DM hid: no creature to a player, whatever it is; the DM may raise it.
    const hid = corpse(s, "bandit", 5, "nia", { hidden: true });
    refused(s, { type: "cast", actor: "nia", spell: "animate-dead", slot: 4, summon: { ids: [hid] } }, PAT, /^No such creature\.$/);
    refused(s, { type: "cast", actor: "nia", spell: "animate-dead", slot: 4, summon: { ids: ["constructor"] } }, PAT, /^No such creature\.$/);
    ok(raise(s, [hid], { ctx: DM, slot: 4 }));
  });

  test(`after 24 hours the Zombie is a foe with a manual event and the bond ends; a reassert within the time keeps it${on}`, () => {
    const s = table(grid), [a, b] = [corpse(s, "bandit", 5), corpse(s, "bandit", 5)];
    const za = made(ok(raise(s, [a])))[0];
    ok(apply(s, { type: "advanceTime", minutes: 60 }, DM));
    const zb = made(ok(raise(s, [b])))[0];
    ok(apply(s, { type: "advanceTime", minutes: 20 * 60 }, DM));
    // Reassert the first within its time: a new 24 hours from now; the old effect ends.
    const old = s.entities[za].bond.fx;
    const r = ok(raise(s, [za]));
    assert.equal(made(r).length, 0, "nothing new is made");
    assert.notEqual(s.entities[za].bond.fx, old);
    assert.ok(!s.effects.some((x) => x.id === old), "the old 24 hours end");
    assert.ok(r.events.some((e) => e.type === "reasserted" && e.id === za && e.by === "nia"));
    assert.ok(viewEvents(r.events, s, PAT).some((e) => e.type === "reasserted" && e.id === za), "the party is told of its own");
    // 24 hours after the second was made: it lapses, the first is still held.
    const lapsed = ok(apply(s, { type: "advanceTime", minutes: 4 * 60 }, DM));
    assert.equal(s.entities[zb].side, "foe"); assert.ok(!s.entities[zb].bond, "its bond ends");
    assert.ok(!s.entities[zb].dead, "it stays, alive");
    assert.ok(lapsed.events.some((e) => e.type === "manual" && e.partial && /no longer under Nia's control/.test(e.text) && /joined the foes/.test(e.text)), "the DM is told");
    assert.ok(viewEvents(lapsed.events, s, PAT).some((e) => e.type === "manual" && /no longer obeys Nia/.test(e.text)), "Nia's player is told it no longer obeys");
    assert.ok(!json(viewEvents(lapsed.events, s, PAT)).includes("joined the foes"));
    assert.equal(s.entities[za].side, "party"); assert.equal(s.entities[za].bond.to, "nia");
    // It is no longer the player's, and a reassert on it is refused: it is no longer Nia's.
    refused(s, { type: "move", actor: zb, to: s.entities[zb].pos }, PAT, /isn't yours to control/);
    refused(s, { type: "cast", actor: "nia", spell: "animate-dead", slot: 3, summon: { ids: [zb] } }, PAT, /neither a corpse nor a creature Nia made/);
    // The first lapses 24 hours after its reassert.
    ok(apply(s, { type: "advanceTime", minutes: 19 * 60 }, DM));
    assert.equal(s.entities[za].side, "party");
    ok(apply(s, { type: "advanceTime", minutes: 61 }, DM));
    assert.equal(s.entities[za].side, "foe");
    assert.ok(!s.effects.some((x) => x.spell === "animate-dead"));
  });

  test(`reasserting: up to four at level 3, two more a level; not mixed with corpses; not another spell's or master's${on}`, () => {
    const s = table(grid), cs = Array.from({ length: 6 }, () => corpse(s, "bandit", 5));
    const zs = made(ok(raise(s, cs.slice(0, 5), { slot: 5 })));
    assert.equal(zs.length, 5);
    refused(s, { type: "cast", actor: "nia", spell: "animate-dead", slot: 3, summon: { ids: zs } }, PAT, /up to 4 of Nia's creatures under control at level 3/);
    refused(s, { type: "cast", actor: "nia", spell: "animate-dead", slot: 3, summon: { ids: [zs[0], cs[5]] } }, PAT, /not both in one casting/);
    refused(s, { type: "cast", actor: "nia", spell: "create-undead", slot: 6, summon: { ids: [zs[0]] } }, PAT, /neither a corpse nor a creature Nia made with Create Undead/);
    // A Zombie the DM bonded to Nia was not made with the spell.
    const dmz = spawn(s, "zombie", free(s, s.entities.nia.pos, 1)[0] ?? free(s, s.entities.nia.pos, 2)[0]);
    ok(apply(s, { type: "bond", actor: dmz, to: "nia", kind: "undead", orders: "command" }, DM));
    assert.ok(apart(s, s.entities.nia, s.entities[dmz]) * FT <= 10);
    refused(s, { type: "cast", actor: "nia", spell: "animate-dead", slot: 3, summon: { ids: [dmz] } }, PAT, /neither a corpse nor/);
    const r = ok(raise(s, zs.slice(0, 4)));
    assert.equal(r.events.filter((e) => e.type === "reasserted").length, 4);
    ok(raise(s, zs, { slot: 4 }));
    assert.equal(SPELLS["animate-dead"].summon.reassert.base, 4);
  });

  test(`Create Undead: Ghouls, range 120 for commands, three at level 6 to six at level 9${on}`, () => {
    for (const [slot, n] of [[6, 3], [7, 4], [8, 5], [9, 6]]) {
      const s = table(grid), cs = Array.from({ length: n + 1 }, () => corpse(s, "bandit", 5));
      refused(s, { type: "cast", actor: "nia", spell: "create-undead", slot, summon: { ids: cs } }, PAT, new RegExp(`up to ${n} corpses at level ${slot}`));
      const zs = made(ok(raise(s, cs.slice(0, n), { slot, spell: "create-undead" })));
      assert.equal(zs.length, n);
      for (const z of zs) {
        const e = s.entities[z];
        assert.equal(e.tpl, "ghoul"); assert.equal(e.bond.range, 120); assert.equal(e.bond.source, "create-undead"); assert.equal(e.bond.orders, "command");
        assert.deepEqual([e.ac, e.hp], [12, 22]);
      }
      // It reasserts as many as it animates: three at level 6.
      if (n >= 4) refused(s, { type: "cast", actor: "nia", spell: "create-undead", slot: 6, summon: { ids: zs.slice(0, 4) } }, PAT, /up to 3 of Nia's creatures under control at level 6/);
      s.entities.nia.slots[6] = 1;
      ok(raise(s, zs.slice(0, 3), { slot: 6, spell: "create-undead" }));
    }
  });

  test(`commands reach 60 ft for Animate Dead; a commanded Zombie is its player's that turn${on}`, () => {
    const s = table(grid), c = corpse(s, "bandit", 5);
    const [z] = made(ok(raise(s, [c])));
    ok(apply(s, { type: "command", actor: "nia", ids: [z], order: "guard Nia" }, PAT));
    assert.equal(s.entities[z].bond.standing, "guard Nia");
    // Moved far away by hand (outside 60 ft): refused.
    const G = gridOf(s.map), far = [...G.range(s.entities.nia.pos, 14)].find((h) => G.dist(h, s.entities.nia.pos) === 13 && apply(structuredClone(s), { type: "place", actor: z, to: h }, DM).ok);
    assert.ok(far, "a cell 65 ft away");
    ok(apply(s, { type: "place", actor: z, to: far }, DM));
    refused(s, { type: "command", actor: "nia", ids: [z] }, PAT, /A command reaches 60 ft/);
  });

  test(`the cap: a master with 29 companions raises one corpse, not two${on}`, () => {
    const s = table(grid), [a, b] = [corpse(s, "bandit", 5), corpse(s, "bandit", 5)];
    for (let i = 0; i < 29; i++) {
      const w = spawn(s, "wolf", free(s, s.entities.fighter.pos, 9).at(-1));
      ok(apply(s, { type: "bond", actor: w, to: "nia", kind: "pet" }, DM));
    }
    refused(s, { type: "cast", actor: "nia", spell: "animate-dead", slot: 4, summon: { ids: [a, b] } }, PAT, /at most 30 companions/);
    const [z] = made(ok(raise(s, [a], { slot: 4 })));
    refused(s, { type: "cast", actor: "nia", spell: "animate-dead", slot: 4, summon: { ids: [b] } }, PAT, /at most 30 companions/);
    // Reasserting adds none, so a master at the cap may still do it.
    ok(raise(s, [z]));
  });

  test(`slot and action economy: no Concentration is touched; not in a fight (a minute to cast); a companion can't cast it${on}`, () => {
    const s = table(grid), c = corpse(s, "bandit", 5);
    const bless = startEffect(s, { name: "Bless", spell: "bless", source: "nia", conc: true, duration: "1 minute" });
    const fx = s.effects.length;
    ok(raise(s, [c], { slot: 5 }));
    assert.equal(s.entities.nia.slots[5], 1, "a level 5 slot spent (two at level 17)");
    assert.ok(s.effects.some((x) => x.id === bless.id), "Concentration on Bless goes on: Animate Dead needs none");
    assert.equal(s.effects.length, fx + 1, "one 24-hour effect, no Concentration");
    assert.ok(!s.effects.find((x) => x.spell === "animate-dead").conc);
    const d = corpse(s, "bandit", 5);
    const G = gridOf(s.map), gob = spawn(s, "goblin-warrior", free(s, s.entities.fighter.pos, 5).filter((h) => G.dist(h, s.entities.nia.pos) >= 3)[0]);
    ok(apply(s, { type: "startEncounter", center: s.entities.fighter.pos, radius: 7 }, DM));
    assert.ok(gob);
    refused(s, { type: "cast", actor: "nia", spell: "animate-dead", slot: 3, summon: { ids: [d] } }, DM, /longer than a turn/);
    const comp = table(grid), e = corpse(comp, "bandit", 5);
    comp.entities.nia.bond = { to: "fighter", kind: "pet", fx: null, turn: "own", orders: "free", at0: "dies", ends: [], commanded: null, auto: false };
    refused(comp, { type: "cast", actor: "nia", spell: "animate-dead", slot: 3, summon: { ids: [e] } }, DM, /companion itself/);
    refused(comp, { type: "cast", actor: "nia", spell: "animate-dead", slot: 3 }, DM, /companion itself/);
    const none = table(grid), f = corpse(none, "bandit", 5);
    none.entities.nia.slots[3] = 0;
    refused(none, { type: "cast", actor: "nia", spell: "animate-dead", slot: 3, summon: { ids: [f] } }, PAT, /no level 3 spell slots/);
  });

  test(`a cast with no picks is the manual hand-off: the slot spent, nothing changed, one public line with no numbers${on}`, () => {
    const s = table(grid), c = corpse(s, "bandit", 5);
    const before = structuredClone(s.entities), seq = s.seq;
    const r = ok(apply(s, { type: "cast", actor: "nia", spell: "animate-dead", slot: 4 }, PAT));
    assert.equal(s.entities.nia.slots[4], 2);
    assert.deepEqual(Object.keys(s.entities).sort(), Object.keys(before).sort(), "nothing made, the corpse stays");
    assert.ok(s.entities[c].dead);
    assert.equal(s.seq, seq, "the counter does not move: an instant spell, nothing made");
    const told = r.events.find((e) => e.type === "manual" && e.partial && /changed nothing/.test(e.text));
    assert.ok(told && /up to 3 corpses/.test(told.text) && /Zombie \(AC 8, 15 Hit Points, Speed 20 ft\.\)/.test(told.text) && /up to 6 of the creatures/.test(told.text));
    assert.ok(told.text.includes(AD.text), "the tier note, in the DM's line");
    const mine = viewEvents(r.events, s, PAT);
    assert.deepEqual(mine.filter((e) => e.type === "manual").map((e) => e.text), ["Animate Dead: the DM applies it."]);
    assert.ok(!json(mine).includes("Hit Points") && !json(mine).includes("Zombie") && !json(mine).includes(c));
    // Create Undead's: the Ghasts, Wights and Mummies of a higher slot are in the DM's note.
    const t = table(grid);
    const r2 = ok(apply(t, { type: "cast", actor: "nia", spell: "create-undead", slot: 9 }, PAT));
    const told2 = r2.events.find((e) => e.type === "manual" && e.partial);
    assert.ok(/up to 6 corpses/.test(told2.text) && /Ghoul \(AC 12, 22 Hit Points/.test(told2.text) && /Mummies/.test(told2.text));
  });

  // A foe necromancer the DM hid raises (A) a corpse the party saw die and one it never saw, or (B) casts a plain manual
  // spell while the DM does the same by hand (removes each corpse, spawns a Zombie in its space, and the 24 hours as a
  // lasting effect of its own, so the counter moves the same way). Then the time runs out. Players must get the same:
  // events, views, record and counter, and nothing of the corpses' names or of a master.
  test(`a hidden necromancer raising corpses reaches players exactly as the plain manual spell and the DM's own hand${on}`, () => {
    const run = (engine) => {
      const s = table(grid), out = [], sent = [];
      s.entities.mage = wizard("mage", "foe", free(s, s.entities.nia.pos, 4).at(-1), "Morwen");
      ok(apply(s, { type: "reveal", actor: "mage", hidden: true }, DM));
      const seen = corpse(s, "bandit", 5, "mage"), unseen = corpse(s, "bandit", 10, "mage", { hidden: true });
      s.entities[seen].name = "Corwin"; s.entities[unseen].name = "Dorrit";
      assert.ok(json(view(s, PAT)).includes("Corwin") && !json(view(s, PAT)).includes("Dorrit"), "the party sees one corpse, not the other");
      const tell = (rs) => { out.push(...rs); sent.push([PAT, U2].map((u) => [json(rs.flatMap((r) => viewEvents(r.events, s, u))), json(view(s, u))])); };
      if (engine) tell([ok(apply(s, { type: "cast", actor: "mage", spell: "animate-dead", slot: 4, summon: { ids: [seen, unseen] } }, DM))]);
      else {
        const rs = [ok(apply(s, { type: "cast", actor: "mage", spell: PLAIN.id, slot: 4 }, DM))];
        for (const c of [seen, unseen]) {
          const at = { ...s.entities[c].pos };
          rs.push(ok(apply(s, { type: "remove", actor: c }, DM)));
          rs.push(ok(apply(s, { type: "spawn", monster: "zombie", at }, DM)));
          startEffect(s, { name: "Animate Dead", spell: "animate-dead", source: "mage", conc: false, duration: "24 hours" });
        }
        tell(rs);
      }
      assert.ok(s.entities.mage.hidden, "still hidden");
      tell([ok(apply(s, { type: "advanceTime", minutes: 60 }, DM))]);
      tell([ok(apply(s, { type: "advanceTime", minutes: DAY }, DM))]);
      return { s, sent, tl: [PAT, U2].map((u) => json(viewEvents(s.timeline, s, u))), seq: s.seq, dm: out.flatMap((r) => r.events) };
    };
    const A = run(true), B = run(false);
    assert.deepEqual(A.sent, B.sent, "players' events and view after each action");
    assert.deepEqual(A.tl, B.tl, "the record");
    assert.equal(A.seq, B.seq, "the counter");
    assert.equal((json(A.sent[0]).match(/spawned/g) ?? []).length, 4, "both players see two creatures appear");
    const all = json(A.sent) + json(A.tl);
    for (const w of ["Morwen", '\\"mage\\"', "Corwin", "Dorrit", '"summoned"', '"bond"', "Animate Dead"]) assert.ok(!all.includes(w), `nothing says ${w}`);
    assert.ok(A.dm.some((e) => e.type === "summoned" && e.by === "mage"), "the DM is told who raised them");
    assert.ok(A.dm.some((e) => e.type === "manual" && e.partial && /no longer under Morwen's control/.test(e.text)), "and when they stop obeying");
    const zs = Object.values(A.s.entities).filter((e) => e.tpl === "zombie");
    assert.equal(zs.length, 2);
    assert.ok(zs.every((e) => e.side === "foe" && !e.bond && /^Zombie \d$/.test(e.name)));
  });

  test(`a foe necromancer's Zombie killed in a fight counts toward its XP (A3)${on}`, () => {
    const s = table(grid);
    s.entities.mage = wizard("mage", "foe", free(s, s.entities.nia.pos, 4).at(-1), "Morwen");
    const c = corpse(s, "bandit", 5, "mage");
    const [z] = made(ok(raise(s, [c], { actor: "mage", ctx: DM })));
    ok(apply(s, { type: "startEncounter", center: s.entities[z].pos, radius: 2 }, DM));
    assert.ok(s.encounter.order.some((o) => o.id === z));
    ok(apply(s, { type: "setHp", actor: z, hp: 0 }, DM));
    assert.ok(s.entities[z].dead, "it dies (at0: dies) and stays as a corpse");
    if (s.encounter) ok(apply(s, { type: "endEncounter" }, DM));
    const line = s.conclusion?.foes.find((f) => f.id === z);
    assert.ok(line && line.counts && line.xp === 50, json(s.conclusion?.foes));
  });

  test(`undo, redo, replay and a save in the middle of a fight, with raising, commands and a reassert, are exact${on}`, () => {
    const build = () => {
      const s = table(grid, 7);
      for (let i = 0; i < 2; i++) corpse(s, "bandit", 5);
      const G = gridOf(s.map);
      spawn(s, "goblin-warrior", free(s, s.entities.fighter.pos, 5).filter((h) => G.dist(h, s.entities.nia.pos) >= 4)[0]);
      return s;
    };
    const s = build(), acts = [], states = [json(s)], h = createHistory({ limit: 1000, maxBytes: 1e9 });
    const send = (a, ctx = DM) => {
      const before = mark(s), r = ok(apply(s, a, ctx));
      h.record(before, s, describeStep(a, r.events, before, s));
      acts.push([a, ctx]); states.push(json(s));
      return r;
    };
    const cs = Object.values(s.entities).filter((e) => e.dead && e.tpl === "bandit").map((e) => e.id);
    const zs = made(send({ type: "cast", actor: "nia", spell: "animate-dead", slot: 4, summon: { ids: cs } }, PAT));
    send({ type: "advanceTime", minutes: 30 });
    send({ type: "startEncounter", center: s.entities.fighter.pos, radius: 7 });
    let save = null, told = null;
    for (let i = 0; i < 16 && s.encounter; i++) {
      if (i === 5) save = { at: acts.length, state: json(s) };
      const id = current(s);
      if (id === "nia" && told !== s.encounter.round) { send({ type: "command", actor: "nia", ids: zs, ...(told === null ? { order: "hold" } : {}) }, PAT); told = s.encounter.round; }
      else if (zs.includes(id)) send({ type: "dodge", actor: id });
      send({ type: "endTurn", actor: current(s) });
    }
    if (s.encounter) send({ type: "endEncounter" });
    send({ type: "cast", actor: "nia", spell: "animate-dead", slot: 3, summon: { ids: zs } }, PAT);
    send({ type: "advanceTime", minutes: DAY + 1 });
    assert.ok(zs.every((z) => s.entities[z].side === "foe"), "the reassert ran out too");
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

  test(`old saves: a DM-bonded Zombie with no 24 hours stays bonded; a save loads unchanged${on}`, () => {
    const s = table(grid), z = spawn(s, "zombie", free(s, s.entities.nia.pos, 2)[0]);
    ok(apply(s, { type: "bond", actor: z, to: "nia", kind: "undead", orders: "command" }, DM));
    const saved = json(s), loaded = migrate(JSON.parse(saved));
    assert.equal(json(loaded), saved, "nothing to migrate");
    ok(apply(loaded, { type: "advanceTime", minutes: 3 * DAY }, DM));
    assert.equal(loaded.entities[z].bond.to, "nia", "a bond with no lasting effect does not lapse");
    assert.equal(loaded.entities[z].side, "party");
  });
}

// ---------- the content and the linter ----------

test("Animate Dead and Create Undead are assist, checked, with the SRD's numbers; the pack lints clean", () => {
  assert.deepEqual(lintPack(srd), []);
  const ad = CONTENT.spells["animate-dead"], cu = CONTENT.spells["create-undead"];
  for (const sp of [ad, cu]) { assert.equal(sp.tier, "assist"); assert.equal(sp.checked, true); assert.equal(sp.range, 10); assert.equal(sp.duration, "instant"); assert.equal(sp.concentration, false); assert.equal(sp.time, "minute"); }
  const count = (c, l) => (c.base ?? 0) + c.slot * (l - (c.above ?? 0));
  const [sa] = ad.effects, [sc] = cu.effects;
  assert.equal(sa.summon, "zombie"); assert.equal(sa.on, "corpse");
  assert.deepEqual([3, 4, 5, 9].map((l) => count(sa.count, l)), [1, 3, 5, 13], "one, and two more per slot level above 3");
  assert.deepEqual([3, 4, 9].map((l) => count(sa.reassert, l)), [4, 6, 16], "up to four, and two more per slot level above 3");
  assert.deepEqual(sa.bond, { kind: "undead", turn: "own", orders: "command", range: 60, at0: "dies" });
  assert.equal(sc.summon, "ghoul"); assert.equal(sc.on, "corpse"); assert.equal(sc.reassert, undefined);
  assert.deepEqual([6, 7, 8, 9].map((l) => count(sc.count, l)), [3, 4, 5, 6]);
  assert.deepEqual(sc.bond, { kind: "undead", turn: "own", orders: "command", range: 120, at0: "dies" });
  assert.equal(cu.costly, true);
  assert.deepEqual(SPELLS["animate-dead"].summon, { of: "zombie", count: sa.count, kind: "undead", on: "corpse", reassert: sa.reassert });
  assert.deepEqual(SPELLS["create-undead"].summon, { of: "ghoul", count: sc.count, kind: "undead", on: "corpse", reassert: sc.count });
});

test("the lifted linter rules: commands with a range, corpses with reassert; what stays refused", () => {
  const ad = srd.spells.find((x) => x.id === "animate-dead"), gi = srd.spells.find((x) => x.id === "giant-insect");
  const lint = (sp) => lintPack({ ...srd, spells: [sp, ...srd.spells.filter((x) => x.id !== sp.id)] }).join("\n");
  const withAD = (change) => { const sp = structuredClone(ad); change(sp, sp.effects[0]); return lint(sp); };
  const withGI = (change) => { const sp = structuredClone(gi); change(sp, sp.effects[0]); return lint(sp); };
  assert.equal(withAD(() => {}), "");
  // Commands: allowed, with a range in feet; a range without commands is refused.
  assert.equal(withGI((sp, st) => { st.bond.orders = "command"; st.bond.range = 60; }), "");
  assert.match(withGI((sp, st) => { st.bond.orders = "command"; }), /how far they reach/);
  assert.match(withGI((sp, st) => { st.bond.range = 60; }), /`range` is for one that takes commands/);
  assert.match(withAD((sp, st) => { st.bond.range = 62; }), /multiple of 5/);
  assert.match(withAD((sp, st) => { st.bond.range = "60"; }), /how far they reach/);
  assert.match(withGI((sp, st) => { st.bond.orders = "obey"; }), /orders are "free" or "command"/);
  assert.match(withGI((sp, st) => { st.on = "space"; st.count = 1; st.reassert = 2; }), /`reassert` is for a summon step on corpses/);
  // Corpses: only the corpses to pick, and creatures that take commands.
  assert.match(withGI((sp, st) => { st.on = "corpse"; }), /has no `variants`/);
  assert.match(withAD((sp, st) => { st.bond.orders = "free"; delete st.bond.range; }), /on corpses makes creatures that take commands/);
  assert.match(withAD((sp, st) => { st.types = ["undead", "fiend"]; }), /has no `types`/);
  assert.match(withAD((sp, st) => { st.over = { speed: { walk: 30 } }; }), /has no `over`/);
  assert.match(withAD((sp, st) => { st.on = "bones"; }), /`on` is "space" or "corpse"/);
  assert.match(withAD((sp, st) => { st.reassert = 0; }), /`reassert` is a whole number/);
  assert.match(withAD((sp, st) => { st.reassert = { slot: 5, base: 4, above: 3 }; }), /`reassert` makes 34 creatures at level 9/);
  assert.match(withAD((sp, st) => { st.count = { slot: 5, base: 1, above: 3 }; }), /`count` makes 31 creatures at level 9/);
  assert.match(withAD((sp, st) => { delete st.count; st.reassert = 4; delete st.on; }), /`reassert` is for a summon step on corpses/);
  assert.match(withAD((sp, st) => { st.range = 10; st.summon = "owlbear-spirit"; }), /neither a summon block nor a pack monster/);
  // Still refused until their stages: a turn of none (C5c, C6), one per master (C5c), riding (C6); `range` on the step itself.
  assert.match(withAD((sp, st) => { st.bond.turn = "none"; }), /stages C5 and C6/);
  assert.match(withAD((sp, st) => { st.one = "replace"; }), /stage C5/);
  assert.match(withAD((sp, st) => { st.bond.mount = "controlled"; }), /stage C6/);
  assert.match(withAD((sp, st) => { st.range = 60; }), /a summon step has no "range"/);
});
