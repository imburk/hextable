// Issue #385: the spells of the group "a summon or a thing that acts on later turns" (docs/PATH-TO-0.2.md, section 2),
// read against reference/srd52/srd52-flow.txt. Two entries changed: Animate Objects' objects take commands within
// 500 ft (SRD lines 24092-24101), and Phantom Steed's text (riding works since C6). The others need a mechanism the
// vocabulary lacks and are unchanged; the last test pins that they stay manual or assist with no summon step.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { gridOf } from "../src/grid.js";
import { CONTENT } from "../src/content/index.js";
import { summonCaster } from "../src/engine/world.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (s) => JSON.stringify(s);
function refused(s, action, ctx, words) {
  const before = json(s), r = apply(s, action, ctx);
  assert.equal(r.ok, false, `${action.type} should be refused`);
  if (words) assert.match(r.error, words);
  assert.equal(json(s), before, "a refused action changes nothing");
}
const ABIL = { str: 10, dex: 14, con: 14, int: 16, wis: 12, cha: 16 };
const sheet = (cls, spells) => ({ name: "Ven", class: cls, level: 17, abilities: ABIL, skills: [], ...(cls === "wizard" ? {} : { armour: "leather-armor" }), weapons: ["quarterstaff"], spells });
function spots(s, near, r, monster) {
  const G = gridOf(s.map), out = [];
  for (const h of G.range(near, r)) if (apply(structuredClone(s), { type: "spawn", monster, at: h }, DM).ok) out.push(h);
  return out;
}
function table(cls, spells) {
  const s = newGame(5);
  s.settings.autoEngage = false;
  const d = derive(sheet(cls, spells));
  s.entities.ven = makeEntity(d.record, { id: "ven", kind: "pc", side: "party", pos: { ...spots(s, s.entities.fighter.pos, 2, "wolf")[0], z: 0 } });
  ok(apply(s, { type: "claim", entity: "ven", user: "pat", userName: "Pat" }, PAT));
  return s;
}
const made = (r) => r.events.find((e) => e.type === "summoned").id;

test("Animate Objects (SRD 24073-24135) at levels 5 and 7: the object's numbers, and it takes the caster's commands", () => {
  const base = table("wizard", ["animate-objects"]);
  const caster = summonCaster(base, base.entities.ven, "animate-objects");
  // HP 10 (Medium or smaller), 20 (Large), 40 (Huge); AC 15; Slam 1d4 + 3 / 2d6 + 3 + mod / 2d12 + 3 + mod, Force,
  // and 1d4 / 1d6 / 1d12 more for each slot level above 5.
  const want = { medium: [10, "1d4+3", "1d4"], large: [20, `2d6+${3 + caster.mod}`, "1d6"], huge: [40, `2d12+${3 + caster.mod}`, "1d12"] };
  for (const slot of [5, 7]) for (const [variant, [hp, dice, more]] of Object.entries(want)) {
    const s = structuredClone(base), at = spots(s, s.entities.ven.pos, 4, variant === "huge" ? "giant-spider" : "wolf")[5];
    const id = made(ok(apply(s, { type: "cast", actor: "ven", spell: "animate-objects", slot, summon: { variant, at: [at] } }, PAT)));
    const e = s.entities[id], say = `level ${slot} ${variant}`;
    assert.deepEqual([e.maxHp, e.ac, e.size, e.type], [hp, 15, variant, "construct"], say);
    const slam = e.actions.find((a) => a.id === "slam").effects[0];
    assert.equal(slam.bonus, caster.attack, "Bonus equals your spell attack modifier");
    assert.deepEqual(slam.onHit, [{ damage: dice, type: "force" }, ...Array(slot - 5).fill({ damage: more, type: "force" })], say);
    // "takes its turn immediately after yours"; "a Bonus Action to mentally command any creature you made".
    assert.deepEqual([e.bond.kind, e.bond.turn, e.bond.orders, e.bond.at0, e.bond.source], ["object", "after", "command", "vanish", "animate-objects"], say);
    ok(apply(s, { type: "command", actor: "ven", ids: [id], order: "guard the door" }, PAT));
    assert.equal(s.entities[id].bond.standing, "guard the door");
  }
  // A creature made by another spell (or none) is not commanded by this one; a free-played one takes no command.
  const s = structuredClone(base), at = spots(s, s.entities.ven.pos, 4, "wolf")[5];
  ok(apply(s, { type: "spawn", monster: "wolf", at }, DM));
  const wolf = Object.keys(s.entities).find((k) => s.entities[k].tpl === "wolf" && !s.entities[k].bond);
  ok(apply(s, { type: "bond", actor: wolf, to: "ven", kind: "pet" }, DM));
  refused(s, { type: "command", actor: "ven", ids: [wolf] }, PAT, /takes no commands/);
});

test("Phantom Steed (SRD 29404-29428): the Riding Horse block with Speed 100, and its caster can ride it", () => {
  const base = table("wizard", ["phantom-steed"]);
  const horse = CONTENT.monsters["riding-horse"];
  let done = false;
  for (const at of spots(base, base.entities.ven.pos, 2, "giant-spider")) {
    const s = structuredClone(base);
    const id = made(ok(apply(s, { type: "cast", actor: "ven", spell: "phantom-steed", slot: 3, summon: { at: [at] } }, PAT)));
    const e = s.entities[id];
    assert.deepEqual([e.tpl, e.maxHp, e.ac, e.speed, e.size], ["riding-horse", horse.hp, horse.ac, 100, "large"]);
    const hoof = horse.actions.find((a) => a.effects?.some((x) => x.attack));
    assert.deepEqual(e.actions.find((a) => a.id === hoof.id).effects, hoof.effects, "the Riding Horse's own attack");
    const r = apply(s, { type: "mount", actor: "ven", mount: id }, PAT);
    if (!r.ok) { assert.match(r.error, /within 5 ft|wall/); continue; }
    assert.equal(s.entities.ven.riding.on, id);
    done = true; break;
  }
  assert.ok(done, "a space next to the caster was found");
  assert.equal(CONTENT.spells["phantom-steed"].tier, "assist", "it still does not end when the steed takes damage");
});

// The rest of the group: each needs one mechanism the vocabulary does not have (the PR's table), so none has a summon
// step and each keeps its tier. If one of these moves, its test belongs with the work that moved it.
const LEFT = {
  "mage-hand": "manual", "floating-disk": "manual", "unseen-servant": "manual", "flaming-sphere": "manual",
  "conjure-animals": "manual", "faithful-hound": "manual",
  "arcane-hand": "manual", "conjure-elemental": "manual", "conjure-fey": "manual", "planar-ally": "manual",
  "arcane-sword": "manual", "finger-of-death": "assist", "simulacrum": "manual",
};
test("the spells of the group that need a mechanism the vocabulary lacks have no summon step and keep their tiers", () => {
  for (const [id, tier] of Object.entries(LEFT)) {
    const sp = CONTENT.spells[id];
    assert.equal(sp.tier, tier, id);
    assert.ok(!json(sp.effects).includes('"summon"'), id);
  }
  // Already entered with a summon step and assist: Find Steed (Life Bond), Animate Dead (bones), Create Undead (night, Ghasts...). Spiritual Weapon (#786) joins them; Guardian of Faith has no summon step and left this list when it went to assist.
  for (const id of ["find-steed", "animate-dead", "create-undead", "animate-objects", "phantom-steed"]) {
    assert.equal(CONTENT.spells[id].tier, "assist", id);
    assert.ok(CONTENT.spells[id].effects.some((x) => "summon" in x), id);
  }
});
