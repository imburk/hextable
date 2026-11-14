// Rogue features at levels 7 to 15 (SRD 5.2.1) and the engine parts they use: Reliable Talent (a
// d20 floor on proficient checks), Evasion, Cunning Strike with its later options (Sneak Attack
// dice traded for effects after the damage: Improved Cunning Strike, Devious Strikes, Supreme
// Sneak's Stealth Attack), Slippery Mind, and Use Magic Device's fourth attunement.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { lintRecord } from "../src/content/schema.js";
import { newMap } from "../src/map.js";
import { newGame } from "../src/scenario.js";
import { edgeSegment } from "../src/walls.js";
import * as H from "../src/hex.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "refused"); if (re) assert.match(r.error, re); };
const A = { str: 10, dex: 18, con: 14, int: 12, wis: 12, cha: 10 };
const rogue = (level, more = {}) => ({ name: "Sly", class: "rogue", level, ...(level >= 3 ? { subclass: "thief" } : {}), abilities: A,
  skills: ["stealth", "perception", "acrobatics", "deception"], expertise: level >= 6 ? ["stealth", "perception", "acrobatics", "deception"] : ["stealth", "perception"], weapons: ["rapier", "shortbow", "club"], ...more });
const sorc = { name: "Ash", class: "sorcerer", level: 5, subclass: "draconic", abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 10, cha: 16 }, skills: ["arcana", "insight"], spells: ["burning-hands"] };

// The rogue beside a tough goblin, with the fighter (an ally) beside the goblin too, so Sneak Attack applies.
function field(level, more = {}) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (id !== "fighter") delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(rogue(level, more)).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  ok(apply(s, { type: "place", actor: "fighter", to: { q: 2, r: 0 } }, DM));
  s.foe = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 } }, DM)).events[0].id;
  const f = s.entities[s.foe];
  f.hp = f.maxHp = 500; f.ac = 5;
  return s;
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 20 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const stab = (s, more = {}) => apply(s, { type: "attack", actor: "hero", target: s.foe, attack: "rapier", ...more }, DM);
// A fight on the rogue's turn whose next rapier attack hits (found by trying seeds).
function ready(level, more = {}, prep = () => {}) {
  for (let seed = 1; seed < 200; seed++) {
    const s = field(level, more);
    s.rng = seed * 7919;
    fight(s); turnOf(s, "hero"); prep(s);
    const probe = structuredClone(s), r = stab(probe);
    if (r.ok && r.events.find((x) => x.type === "attack").hit) return s;
  }
  throw new Error("no seed");
}
// Hit with these Cunning Strike effects until the target fails its save (or the predicate says it is done).
function landed(level, cunning, more = {}, prep = () => {}) {
  for (let seed = 1; seed < 300; seed++) {
    const s = field(level, more);
    s.rng = seed * 104729;
    fight(s); turnOf(s, "hero"); prep(s);
    const r = stab(s, { cunning });
    if (!r.ok) return { s, r };
    if (!r.events.find((x) => x.type === "attack").hit) continue;
    const sv = r.events.find((x) => x.type === "save" && x.id === s.foe);
    if (!sv || !sv.success) return { s, r };
  }
  throw new Error("no seed");
}

test("the rogue's features at levels 7 to 15 appear at their levels, and the records are valid", () => {
  const at = (l) => derive(rogue(l)).record.feats.map((f) => f.id);
  for (const [id, level] of [["evasion", 7], ["reliable-talent", 7], ["supreme-sneak", 9], ["improved-cunning-strike", 11], ["use-magic-device", 13], ["devious-strikes", 14], ["slippery-mind", 15]]) {
    assert.ok(!at(level - 1).includes(id), `${id} before ${level}`);
    assert.ok(at(level).includes(id), `${id} at ${level}`);
  }
  for (let l = 1; l <= 20; l++) { assert.deepEqual(validate(rogue(l)), [], `level ${l}`); assert.deepEqual(lintRecord(derive(rogue(l)).record), [], `record ${l}`); }
  const opt = derive(rogue(14)).record.feats.find((f) => f.id === "devious-strikes").cunning.options.find((o) => o.id === "knock-out");
  assert.equal(opt.effects[0].dc, 8 + 5 + 4, "8 + Dexterity modifier + Proficiency Bonus");
  // Slippery Mind: Wisdom and Charisma saves from level 15.
  assert.deepEqual(derive(rogue(14)).record.saveProf, ["dex", "int"]);
  assert.deepEqual(derive(rogue(15)).record.saveProf, ["dex", "int", "wis", "cha"]);
});

test("Reliable Talent: a d20 of 9 or lower counts as 10 on a check with a proficiency, not on one without, and not before level 7", () => {
  const roll = (level, skill, seed) => { const s = field(level); s.rng = seed * 7919; return ok(apply(s, { type: "check", actor: "hero", skill }, DM)).events.find((x) => x.type === "check"); };
  let floored = 0, low = 0, low6 = 0;
  for (let seed = 1; seed < 60; seed++) {
    const c = roll(7, "stealth", seed);
    assert.ok(c.roll >= 10, "at least 10 with a proficiency");
    if (c.floor) { floored++; assert.deepEqual(c.floor, { name: "Reliable Talent", value: 10 }); assert.equal(c.roll, 10); assert.equal(c.total, 10 + c.bonus); }
    if (roll(7, "arcana", seed).roll < 10) low++;
    if (roll(6, "stealth", seed).roll < 10) low6++;
  }
  assert.ok(floored > 0, "a low roll was lifted");
  assert.ok(low > 0, "without the proficiency it can be lower");
  assert.ok(low6 > 0, "level 6");
});

test("Evasion for the rogue: no damage on a successful Dexterity save for half", () => {
  let seen = false;
  for (let seed = 1; seed < 60 && !seen; seed++) {
    const s = field(7);
    s.entities.evil = makeEntity(derive(sorc).record, { id: "evil", kind: "npc", side: "foe", pos: { q: -2, r: 0, z: 0 } });
    s.rng = seed * 7919;
    fight(s); turnOf(s, "evil");
    const r = ok(apply(s, { type: "cast", actor: "evil", spell: "burning-hands", hex: { q: 0, r: 0 }, slot: 1 }, DM));
    if (!r.events.find((x) => x.type === "save" && x.id === "hero").success) continue;
    seen = true;
    assert.ok(!r.events.some((x) => x.type === "damage" && x.target === "hero"));
  }
  assert.ok(seen);
});

test("Cunning Strike: Trip costs a Sneak Attack die before the roll, then a Dexterity save or Prone", () => {
  const { s, r } = landed(5, ["trip"]);
  const dmg = r.events.find((x) => x.type === "damage" && x.target === s.foe);
  assert.equal(dmg.dice.filter((d) => d.sides === 6).length, r.events.find((x) => x.type === "attack").crit ? 4 : 2, "3d6 less 1d6");
  assert.ok(r.events.some((x) => x.type === "note" && /Sneak Attack, Cunning Strike: Trip/.test(x.text)));
  const sv = r.events.find((x) => x.type === "save" && x.id === s.foe);
  assert.equal(sv.abil, "dex"); assert.equal(sv.dc, 8 + 4 + 3);
  assert.ok(s.entities[s.foe].cond.prone);
  // The damage comes before the effect.
  assert.ok(r.events.indexOf(dmg) < r.events.indexOf(sv));
});

test("Cunning Strike is refused, changing nothing, for unknown or repeated effects, too many, too costly, a Huge target, no Poisoner's Kit, or a weapon without Sneak Attack", () => {
  const s = ready(10);
  const snap = JSON.stringify(s);
  no(stab(s, { cunning: ["trip", "poison"] }), /one Cunning Strike effect/);
  no(stab(s, { cunning: ["trip", "trip"] }), /each once/);
  no(stab(s, { cunning: ["knock-out"] }), /Choose Cunning Strike effects from: Poison, Trip, Withdraw, Stealth Attack/);
  no(stab(s, { cunning: "trip" }), /each once/);
  no(stab(s, { cunning: ["poison"] }), /needs a Poisoner's Kit/);
  no(stab(s, { cunning: ["stealth-attack"] }), /made while hidden/);
  no(apply(s, { type: "attack", actor: "hero", target: s.foe, attack: "club", cunning: ["trip"] }, DM), /Finesse or Ranged/);
  s.entities[s.foe].size = "huge";
  no(stab(s, { cunning: ["trip"] }), /Large size or smaller/);
  s.entities[s.foe].size = "small";
  assert.equal(JSON.stringify(s), snap.replace('"size":"huge"', '"size":"small"'), "nothing changed");
  // More dice than the Sneak Attack has: Knock Out and Obscure cost 9 of a level 14 rogue's 7d6.
  const t = ready(14);
  no(apply(t, { type: "attack", actor: "hero", target: t.foe, attack: "rapier", cunning: ["knock-out", "obscure"] }, DM), /cost 9 Sneak Attack dice; Sly's Sneak Attack is 7d6/);
});

test("Improved Cunning Strike: two effects at level 11, paying for each", () => {
  const { s, r } = landed(11, ["trip", "withdraw"]);
  const dmg = r.events.find((x) => x.type === "damage" && x.target === s.foe), crit = r.events.find((x) => x.type === "attack").crit;
  assert.equal(dmg.dice.filter((d) => d.sides === 6).length, crit ? 8 : 4, "6d6 less 2d6");
  assert.ok(r.events.some((x) => x.type === "manual" && /Withdraw: right after the attack/.test(x.text)), "Withdraw's move is the DM's");
  assert.ok(s.entities[s.foe].cond.prone);
});

test("Cunning Strike Poison: with a Poisoner's Kit, a Constitution save or Poisoned for a minute, repeating the save", () => {
  const { s } = landed(5, ["poison"], { gear: ["Poisoner's Kit"] });
  const f = s.entities[s.foe];
  assert.ok(f.cond.poisoned);
  const fx = s.effects.find((x) => x.name === "Poison");
  assert.equal(fx.lasts, "1 minute");
  const part = fx.parts.find((p) => p.cond === "poisoned");
  assert.deepEqual(part.ends, { on: "save", save: "con", at: "turnEnd" });
  assert.equal(part.dc, 15, "the same DC");
});

test("Devious Strikes: Knock Out (Unconscious until a save or any damage), Obscure (Blinded to the end of its next turn), Daze (the DM's limit)", () => {
  const { s } = landed(14, ["knock-out"]);
  const f = s.entities[s.foe];
  assert.ok(f.cond.unconscious);
  const part = s.effects.find((x) => x.name === "Knock Out").parts.find((p) => p.cond === "unconscious");
  assert.deepEqual(part.ends, { on: "save", save: "con", at: "turnEnd", orDamaged: true });
  ok(apply(s, { type: "harm", actor: s.foe, amount: 1, dtype: "fire" }, DM));
  assert.ok(!f.cond.unconscious, "any damage ends it");

  const o = landed(14, ["obscure"]);
  const of = o.s.entities[o.s.foe];
  assert.ok(of.cond.blinded);
  ok(apply(o.s, { type: "endTurn", actor: "hero" }, DM));
  assert.ok(of.cond.blinded, "through the rogue's turn's end");
  turnOf(o.s, o.s.foe);
  ok(apply(o.s, { type: "endTurn", actor: o.s.foe }, DM));
  assert.ok(!of.cond.blinded, "until the end of its next turn");

  const d = landed(14, ["daze"]);
  assert.ok(d.r.events.some((x) => x.type === "manual" && /Daze: on its next turn/.test(x.text)));
  // Not before level 14.
  no(stab(ready(13), { cunning: ["obscure"] }), /Choose Cunning Strike effects/);
});

test("Cunning Strike without Sneak Attack does nothing and costs nothing", () => {
  const s = ready(5);
  ok(apply(s, { type: "place", actor: "fighter", to: { q: -5, r: 0 } }, DM));     // no ally beside the goblin, no Advantage
  const r = ok(stab(s, { cunning: ["trip"] }));
  assert.ok(r.events.some((x) => x.type === "note" && x.text === "No Sneak Attack, so no Cunning Strike"));
  assert.ok(!r.events.some((x) => x.type === "save"));
  assert.ok(!s.entities[s.foe].cond.prone);
});

test("Supreme Sneak, Stealth Attack: a hidden rogue's attack keeps it hidden only if it ends the turn behind Three-Quarters or Total Cover", () => {
  // In the open: hidden right after the attack, found at the end of the turn.
  const s = ready(9, {}, (s) => { s.entities.hero.hiding = { dc: 30 }; });
  const r = ok(stab(s, { cunning: ["stealth-attack"] }));
  assert.ok(r.events.find((x) => x.type === "attack").hit);
  assert.ok(s.entities.hero.hiding, "still hidden after the attack");
  const end = ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
  assert.ok(end.events.some((x) => x.type === "unhidden" && x.id === "hero"));
  assert.equal(s.entities.hero.hiding, undefined);
  // Without Stealth Attack the attack itself ends it.
  const t = ready(9, {}, (s) => { s.entities.hero.hiding = { dc: 30 }; });
  ok(stab(t));
  assert.equal(t.entities.hero.hiding, undefined);

  // Behind a pillar at the end of the turn: still hidden.
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 10).map((h) => [H.col(h), { t: "stone" }]));
  const walls = [0, 1, 2, 3, 4, 5].map((i) => { const [a, b] = edgeSegment({ q: 2, r: 0 }, i); return { id: `p${i}`, level: "ground", a, b, kind: "wall" }; });
  let done = false;
  for (let seed = 1; seed < 100 && !done; seed++) {
    const u = newGame(5);
    ok(apply(u, { type: "loadMap", map: newMap({ id: "h", name: "Hall", starts: [{ q: -8, r: 0 }], levels: [{ id: "ground", name: "G", z: 0, tiles }], walls }) }, DM));
    u.settings.autoEngage = false;
    for (const id of Object.keys(u.entities)) delete u.entities[id];
    u.entities.hero = makeEntity(derive(rogue(9)).record, { id: "hero", kind: "pc", side: "party", pos: { q: 2, r: -1, z: 0 } });
    const g = ok(apply(u, { type: "spawn", monster: "goblin-warrior", at: { q: 6, r: 0 } }, DM)).events[0].id;
    u.entities[g].hp = u.entities[g].maxHp = 500; u.entities[g].ac = 5;
    u.rng = seed * 7919;
    fight(u); turnOf(u, "hero");
    u.entities.hero.hiding = { dc: 30 };
    const x = ok(apply(u, { type: "attack", actor: "hero", target: g, attack: "shortbow", cunning: ["stealth-attack"] }, DM));
    if (!x.events.find((y) => y.type === "attack").hit) continue;
    done = true;
    assert.ok(x.events.some((y) => y.type === "note" && /Cunning Strike: Stealth Attack/.test(y.text)));
    ok(apply(u, { type: "move", actor: "hero", to: { q: 1, r: 0 } }, DM));
    ok(apply(u, { type: "endTurn", actor: "hero" }, DM));
    assert.ok(u.entities.hero.hiding, "behind Total Cover: still hidden");
  }
  assert.ok(done);
});

test("Use Magic Device: four attuned magic items from level 13, three before", () => {
  const items = ["ring-of-protection", "cloak-of-protection", "amulet-of-health", "ring-of-warmth"].map((item, i) => ({ id: `i${i}`, item, equipped: true, attuned: true }));
  assert.deepEqual(validate(rogue(13, { items })), []);
  assert.match(validate(rogue(12, { items })).join(" "), /attuned to 3 magic items at most; 4 are marked attuned/);
});
