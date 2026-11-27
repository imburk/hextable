// Companions, stage C5c (docs/specs/companions.md, Decisions 1, 2, 6, 10 and 11): a familiar dismissed to its master's
// pocket dimension or forever and recalled (`dismiss`, `recall`), one per master (`one: 'reform'` for Find Familiar,
// `one: 'replace'` for Find Steed), and a touch spell delivered by the familiar with its Reaction (`cast { deliver }`).
// Every rule is from reference/srd52/srd52-flow.txt, Find Familiar (26772-26822) and Find Steed (26824-26853). With
// refusals, a twin run for a hidden master, old saves, and undo, redo, replay, save and load.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity, ownerOf } from "../src/engine.js";
import { unknown } from "../src/vision.js";
import { view, viewEvents } from "../src/view.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { gridOf } from "../src/grid.js";
import { apart, FT, gap } from "../src/space.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { migrate } from "../src/migrate.js";
import { newMap } from "../src/map.js";
import { SHEETS } from "./fixtures/sheets.js";
import { CONTENT, PACKS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const BO = { role: "player", userId: "bo" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const json = (s) => JSON.stringify(s);
function refused(s, action, ctx, words) {
  const before = json(s), r = apply(s, action, ctx);
  assert.equal(r.ok, false, `${action.type} should be refused`);
  if (words) assert.match(r.error, words);
  assert.equal(json(s), before, "a refused action changes nothing");
  return r;
}
const ABIL = { str: 10, dex: 14, con: 14, int: 16, wis: 12, cha: 16 };
const sheet = (cls, spells, name = "Ven") => ({ name, class: cls, level: 17, abilities: ABIL, skills: [], ...(cls === "wizard" ? {} : { armour: "leather-armor" }), weapons: ["quarterstaff"], spells });
// Free cells near `near`, where a creature of that size could be put.
function spots(s, near, r = 3, monster = "wolf") {
  const G = gridOf(s.map), out = [];
  for (const h of G.range(near, r)) if (apply(structuredClone(s), { type: "spawn", monster, at: h }, DM).ok) out.push(h);
  return out;
}
// A free cell whose distance from `from` is exactly `feet` by `measure`.
function at(s, from, feet, measure, monster = "wolf") {
  const G = gridOf(s.map);
  return [...G.range(from.pos, Math.ceil(feet / FT) + 2)].find((h) => measure(h) === feet && apply(structuredClone(s), { type: "spawn", monster, at: h }, DM).ok);
}
// The valley with Ven, a party wizard of level 17 played by Pat, beside the fighter (played by Bo).
function table(grid, cls = "wizard", spells = ["find-familiar", "shocking-grasp", "giant-insect"]) {
  const s = newGame(5, grid ? { grid } : {});
  s.settings.autoEngage = false;
  const d = derive(sheet(cls, spells));
  s.entities.ven = makeEntity(d.record, { id: "ven", kind: "pc", side: "party", pos: { ...spots(s, s.entities.fighter.pos, 2)[0], z: 0 } });
  ok(apply(s, { type: "claim", entity: "ven", user: "pat", userName: "Pat" }, PAT));
  ok(apply(s, { type: "claim", entity: "fighter", user: "bo", userName: "Bo" }, BO));
  return s;
}
const made = (r) => r.events.find((e) => e.type === "summoned").id;
function familiar(s, form = "owl", ctx = PAT, actor = "ven") {
  const free = spots(s, s.entities[actor].pos, 2).filter((h) => gap(s, s.entities[actor].pos, h) * FT <= 10);
  return made(ok(apply(s, { type: "cast", actor, spell: "find-familiar", slot: 1, summon: { form, type: "fey", at: [free.at(-1)] } }, ctx)));
}
const spawn = (s, monster, where, name) => ok(apply(s, { type: "spawn", monster, at: where, ...(name ? { name } : {}) }, DM)).events.find((e) => e.type === "spawned").id;
const endTurn = (s) => ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
function toTurn(s, id) {
  for (let i = 0; i < 60 && s.encounter && current(s) !== id; i++) endTurn(s);
  assert.equal(current(s), id, `${id}'s turn came`);
}
// Ven and the fighter on an open stone field, big enough to stand 105 ft apart on either grid.
function field(grid) {
  const s = table(grid), probe = gridOf(newMap({ id: "x", name: "x", ...(grid ? { grid } : {}), starts: [{ q: 0, r: 0 }], levels: [{ id: "g", name: "g", z: 0, tiles: { "0,0": { t: "stone" } } }] }));
  const tiles = Object.fromEntries([...probe.range({ q: 0, r: 0 }, 30)].map((h) => [`${h.q},${h.r}`, { t: "stone" }]));
  ok(apply(s, { type: "loadMap", map: newMap({ id: "field", name: "Field", ...(grid ? { grid } : {}), starts: [{ q: 0, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }] }) }, DM));
  for (const id of Object.keys(s.entities)) if (!["ven", "fighter"].includes(id)) delete s.entities[id];
  s.entities.ven.pos = { q: -12, r: 0, z: 0 }; s.entities.fighter.pos = { q: -12, r: 2, z: 0 };
  return s;
}
// Put the familiar at a cell at exactly `feet` from Ven (by the nearest parts, as `deliver` measures), a goblin beside it.
function reach(s, owl, feet) {
  const o = s.entities[owl], v = s.entities.ven;
  const h = at(s, v, feet, (h) => apart(s, v, { ...o, pos: { ...h, z: 0 } }) * FT);
  assert.ok(h, `a cell ${feet} ft from Ven`);
  o.pos = { ...h, z: 0 };
  return spawn(s, "goblin-warrior", spots(s, o.pos, 1).find((x) => apart(s, v, { ...o, pos: { ...x, z: 0 } }) * FT >= feet - 5), "Gob");
}

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";

  // ---------- touch delivery ----------

  test(`Shocking Grasp delivered by an owl within 100 ft uses the owl's Reaction; refused at 105 ft, with no Reaction, or Incapacitated${on}`, () => {
    const base = field(grid), owl = familiar(base, "owl", DM);
    const gob = reach(base, owl, 100);
    ok(apply(base, { type: "startEncounter", center: base.entities[owl].pos, radius: 24 }, DM));
    toTurn(base, "ven");
    assert.ok(!base.entities[owl].reactionUsed);
    let s = structuredClone(base);
    const r = ok(apply(s, { type: "cast", actor: "ven", spell: "shocking-grasp", target: gob, deliver: owl }, PAT));
    const atk = r.events.find((e) => e.type === "attack");
    assert.deepEqual([atk.actor, atk.target, atk.name], ["ven", gob, "Shocking Grasp"], "the caster's attack roll on the goblin beside the owl");
    assert.ok(r.events.some((e) => e.type === "delivered" && e.id === owl && e.by === "ven" && e.spell === "shocking-grasp"));
    assert.equal(s.entities[owl].reactionUsed, true, "the owl's Reaction is spent");
    assert.equal(s.encounter.budget.action, 0, "the cast is Ven's action");
    assert.deepEqual(viewEvents(r.events, s, PAT).find((e) => e.type === "delivered"), { type: "delivered", id: owl, by: "ven", spell: "shocking-grasp" }, "the party's own delivery is told to the party");
    // Without the owl the goblin is out of reach.
    refused(structuredClone(base), { type: "cast", actor: "ven", spell: "shocking-grasp", target: gob }, PAT, /reaches touch \(5 ft\)/);
    // No Reaction left.
    s = structuredClone(base); s.entities[owl].reactionUsed = true;
    refused(s, { type: "cast", actor: "ven", spell: "shocking-grasp", target: gob, deliver: owl }, PAT, /already used its Reaction/);
    // Incapacitated (Stunned).
    s = structuredClone(base); ok(apply(s, { type: "condition", actor: owl, condition: "stunned" }, DM));
    refused(s, { type: "cast", actor: "ven", spell: "shocking-grasp", target: gob, deliver: owl }, PAT, /Stunned and can't take a Reaction/);
    // Not a touch spell; not a familiar; the goblin out of the owl's reach.
    s = structuredClone(base); s.entities.ven.spells.push("fire-bolt");
    refused(s, { type: "cast", actor: "ven", spell: "fire-bolt", target: gob, deliver: owl }, PAT, /range of Touch/);
    refused(structuredClone(base), { type: "cast", actor: "ven", spell: "shocking-grasp", target: gob, deliver: "fighter" }, PAT, /is not Ven's familiar/);
    refused(structuredClone(base), { type: "cast", actor: "ven", spell: "shocking-grasp", target: gob, deliver: 7 }, PAT, /No such creature/);      // a number is no id: refused before the handler, as an id that is nothing (#532, H1)
    // 105 ft: refused, changing nothing.
    const far = field(grid), owl2 = familiar(far, "owl", DM), gob2 = reach(far, owl2, 105);
    ok(apply(far, { type: "startEncounter", center: far.entities[owl2].pos, radius: 24 }, DM));
    toTurn(far, "ven");
    refused(far, { type: "cast", actor: "ven", spell: "shocking-grasp", target: gob2, deliver: owl2 }, PAT, /105 ft from Ven\. A familiar delivers a touch within 100 ft/);
  });

  // ---------- the pocket dimension ----------

  test(`a pocketed familiar is in no player view, and comes back with its Hit Points within 30 ft on an unoccupied space${on}`, () => {
    const s = table(grid), owl = familiar(s);
    ok(apply(s, { type: "setHp", actor: owl, hp: 0 + 1 }, DM));
    s.entities[owl].gear = ["a note"];
    const was = s.entities[owl].pos;
    const r = ok(apply(s, { type: "dismiss", actor: "ven", id: owl }, PAT));
    assert.ok(!s.entities[owl], "off the map");
    assert.equal(s.entities.ven.pocket[owl].hp, 1);
    assert.deepEqual(s.entities.ven.pocket[owl].gear, [], "what it carried stays behind");
    assert.ok(s.map.objects.some((o) => o.def === "pile" && o.at.q === was.q && o.at.r === was.r && o.contents.some((c) => c.name === "a note")), "in its space");
    assert.deepEqual(viewEvents(r.events, s, PAT).filter((e) => e.type === "pocketed"), [{ type: "pocketed", id: owl, by: "ven", name: "Ven's Owl" }]);
    for (const u of [PAT, BO]) {
      const v = view(s, u);
      assert.equal(v.entities[owl], undefined, "no creature on the map for players");
      assert.equal(v.entities.ven.pocket[owl].hp, 1, "the party's own pocket is on its master's open record");
    }
    // Back: beyond 30 ft refused, an occupied space refused, then within 30 ft.
    const v = s.entities.ven;
    const far = at(s, v, 35, (h) => gap(s, v.pos, h) * FT, "owl");
    refused(s, { type: "recall", actor: "ven", id: owl, at: far }, PAT, /35 ft away\. Ven's Owl comes back within 30 ft/);
    refused(s, { type: "recall", actor: "ven", id: owl, at: s.entities.fighter.pos }, PAT, /is occupied/);
    refused(s, { type: "recall", actor: "ven", id: owl, at: s.entities.fighter.pos }, BO, /isn't yours to control/);
    refused(s, { type: "recall", actor: "ven", id: "m999", at: far }, PAT, /No such creature/);
    refused(s, { type: "dismiss", actor: "ven", id: owl }, PAT, /already in a pocket dimension/);
    const near = at(s, v, 30, (h) => gap(s, v.pos, h) * FT, "owl");
    const back = ok(apply(s, { type: "recall", actor: "ven", id: owl, at: near }, PAT));
    assert.equal(s.entities[owl].hp, 1, "the same Hit Points");
    assert.deepEqual([s.entities[owl].pos.q, s.entities[owl].pos.r], [near.q, near.r]);
    assert.equal(s.entities.ven.pocket, undefined, "an empty pocket leaves no field");
    assert.deepEqual(viewEvents(back.events, s, PAT).filter((e) => e.type === "recalled"), [{ type: "recalled", id: owl, by: "ven", at: { ...s.entities[owl].pos } }]);
    assert.equal(ownerOf(s, s.entities[owl]), "pat", "still Pat's");
    refused(s, { type: "recall", actor: "ven", id: owl, at: near }, PAT, /is not in a pocket dimension/);
  });

  test(`dismiss forever removes the familiar, on the map or from the pocket; the master's death leaves it in the pocket${on}`, () => {
    let s = table(grid), owl = familiar(s);
    const r = ok(apply(s, { type: "dismiss", actor: "ven", id: owl, forever: true }, PAT));
    assert.ok(!s.entities[owl] && !s.entities.ven.pocket);
    assert.ok(r.events.some((e) => e.type === "vanished" && e.id === owl && e.why === "dismissed"));
    s = table(grid); owl = familiar(s);
    ok(apply(s, { type: "dismiss", actor: "ven", id: owl }, PAT));
    // The SRD ends a familiar with nothing at its master's death: it stays in the pocket (and can't be recalled by a dead master).
    s.entities.ven.dead = true; s.entities.ven.hp = 0;
    ok(apply(s, { type: "advanceTime", minutes: 1 }, DM));
    assert.ok(s.entities.ven.pocket[owl]);
    refused(s, { type: "recall", actor: "ven", id: owl, at: spots(s, s.entities.ven.pos, 2)[0] }, PAT, /is down/);
    s.entities.ven.dead = false; s.entities.ven.hp = 5;
    refused(s, { type: "dismiss", actor: "ven", id: owl, forever: "yes" }, PAT, /forever: true/);
    const gone = ok(apply(s, { type: "dismiss", actor: "ven", id: owl, forever: true }, PAT));
    assert.equal(s.entities.ven.pocket, undefined);
    assert.deepEqual(viewEvents(gone.events, s, PAT), [{ type: "vanished", id: owl, name: "Ven's Owl", why: "dismissed" }]);
  });

  test(`dismiss and recall are Magic actions: in a fight on the master's turn with its action left, the familiar leaving and rejoining the order${on}`, () => {
    const s = table(grid), owl = familiar(s), f = s.entities.fighter;
    spawn(s, "goblin-warrior", spots(s, f.pos, 5).filter((h) => gridOf(s.map).dist(h, f.pos) >= 5)[0], "Gob");
    ok(apply(s, { type: "startEncounter", center: s.entities.ven.pos, radius: 6 }, DM));
    assert.ok(s.encounter.order.some((o) => o.id === owl), "the familiar rolled its own Initiative");
    toTurn(s, "fighter");
    refused(s, { type: "dismiss", actor: "ven", id: owl }, PAT, /isn't Ven's turn/);
    toTurn(s, "ven");
    const r = ok(apply(s, { type: "dismiss", actor: "ven", id: owl }, PAT));
    assert.ok(!s.encounter.order.some((o) => o.id === owl), "out of the order");
    assert.equal(s.encounter.budget.action, 0);
    assert.ok(r.events.some((e) => e.type === "pocketed"));
    const near = spots(s, s.entities.ven.pos, 2).find((h) => gap(s, s.entities.ven.pos, h) * FT <= 30);
    refused(s, { type: "recall", actor: "ven", id: owl, at: near }, PAT, /already used an action/);
    endTurn(s);
    toTurn(s, "ven");
    // Action Surge's extra action is not for a Magic action (as casting reads it).
    const t = structuredClone(s); t.encounter.flags["surge:ven"] = true; t.encounter.flags["magic:ven"] = true;
    refused(t, { type: "recall", actor: "ven", id: owl, at: near }, PAT, /Action Surge/);
    const back = ok(apply(s, { type: "recall", actor: "ven", id: owl, at: near }, PAT));
    assert.ok(back.events.some((e) => e.type === "joined" && e.id === owl), "it joins the fight again");
    assert.ok(s.encounter.order.some((o) => o.id === owl));
    // A free familiar is played freely: the C5a lock is not for it.
    toTurn(s, owl);
    assert.equal(ownerOf(s, s.entities[owl]), "pat");
    ok(apply(s, { type: "dash", actor: owl }, PAT));
  });

  // ---------- one per master ----------

  test(`a second Find Familiar gives the one familiar its new form, where it is; a second Find Steed replaces the old${on}`, () => {
    const s = table(grid), owl = familiar(s);
    ok(apply(s, { type: "setHp", actor: owl, hp: 1 }, DM));
    ok(apply(s, { type: "condition", actor: owl, condition: "poisoned" }, DM));
    const pos = { ...s.entities[owl].pos }, n = Object.keys(s.entities).length, seq = s.seq;
    refused(s, { type: "cast", actor: "ven", spell: "find-familiar", slot: 1, summon: { form: "cat", type: "fiend", at: [spots(s, s.entities.ven.pos, 2)[0]] } }, PAT, /name no space/);
    const r = ok(apply(s, { type: "cast", actor: "ven", spell: "find-familiar", slot: 1, summon: { form: "cat", type: "fiend" } }, PAT));
    const c = s.entities[owl], cat = CONTENT.monsters.cat;
    assert.equal(Object.keys(s.entities).length, n, "no new creature");
    assert.equal(s.seq, seq, "no new id");
    assert.deepEqual([c.tpl, c.type, c.name, c.maxHp, c.hp, c.ac], ["cat", "fiend", "Ven's Cat", cat.hp, cat.hp, cat.ac], "the new form's statistics, at its full Hit Points");
    assert.deepEqual(c.pos, pos, "where it was");
    assert.ok(c.cond.poisoned, "what is going on with it stays");
    assert.deepEqual([c.bond.to, c.bond.kind, c.bond.source], ["ven", "familiar", "find-familiar"]);
    assert.deepEqual(viewEvents(r.events, s, PAT).find((e) => e.type === "reformed"), { type: "reformed", id: owl, by: "ven", form: "cat", name: "Ven's Cat" });
    // A cast with no picks (the client until C8) changes nothing, and tells the DM what the spell does to the one it has.
    const t = structuredClone(s), hand = ok(apply(t, { type: "cast", actor: "ven", spell: "find-familiar", slot: 1 }, PAT));
    assert.equal(t.entities[owl].tpl, "cat");
    assert.ok(hand.events.some((e) => e.type === "manual" && e.partial && /Ven already has Ven's Cat: by the spell it takes the new form/.test(e.text)));
    // In the pocket it takes the new form there.
    ok(apply(s, { type: "dismiss", actor: "ven", id: owl }, PAT));
    ok(apply(s, { type: "cast", actor: "ven", spell: "find-familiar", slot: 1, summon: { form: "hawk", type: "celestial" } }, PAT));
    assert.equal(s.entities.ven.pocket[owl].tpl, "hawk");
    assert.ok(!s.entities[owl]);

    // Find Steed: the old one goes (`replaced`), the new one may stand in its space.
    const p = table(grid, "paladin", ["find-steed"]);
    const free = spots(p, p.entities.ven.pos, 4, "giant-spider").filter((h) => gap(p, p.entities.ven.pos, h) * FT <= 30);
    const old = made(ok(apply(p, { type: "cast", actor: "ven", spell: "find-steed", slot: 2, summon: { type: "fey", at: [free.at(-1)] } }, PAT)));
    const where = { ...p.entities[old].pos };
    const r2 = ok(apply(p, { type: "cast", actor: "ven", spell: "find-steed", slot: 3, summon: { type: "fiend", at: [{ q: where.q, r: where.r }] } }, PAT));
    const steed = made(r2);
    assert.ok(!p.entities[old] && p.entities[steed], "one steed");
    assert.ok(r2.events.some((e) => e.type === "vanished" && e.id === old && e.why === "replaced"));
    assert.deepEqual([p.entities[steed].type, p.entities[steed].maxHp, p.entities[steed].pos.q, p.entities[steed].pos.r], ["fiend", 35, where.q, where.r]);
    assert.deepEqual(viewEvents(r2.events, p, PAT).find((e) => e.type === "vanished"), { type: "vanished", id: old, name: "Ven's Otherworldly Steed", why: "replaced" });
  });

  test(`dismissing a summon: Concentration's ends at once, a steed's spell gives no way, and nothing is dismissed forever but a familiar${on}`, () => {
    const s = table(grid), free = spots(s, s.entities.ven.pos, 4, "giant-spider").filter((h) => gap(s, s.entities.ven.pos, h) * FT <= 60);
    const bug = made(ok(apply(s, { type: "cast", actor: "ven", spell: "giant-insect", slot: 4, summon: { variant: "wasp", at: [free.at(-1)] } }, PAT)));
    refused(s, { type: "dismiss", actor: "ven", id: bug, forever: true }, PAT, /Only a familiar/);
    const r = ok(apply(s, { type: "dismiss", actor: "ven", id: bug }, PAT));
    assert.ok(!s.entities[bug] && r.events.some((e) => e.type === "vanished" && e.why === "ended"), "the effect ended, and the insect with it");
    assert.ok(!s.effects.some((x) => x.spell === "giant-insect"));
    const p = table(grid, "paladin", ["find-steed"]);
    const at2 = spots(p, p.entities.ven.pos, 4, "giant-spider").filter((h) => gap(p, p.entities.ven.pos, h) * FT <= 30).at(-1);
    const steed = made(ok(apply(p, { type: "cast", actor: "ven", spell: "find-steed", slot: 2, summon: { type: "fey", at: [at2] } }, PAT)));
    refused(p, { type: "dismiss", actor: "ven", id: steed }, PAT, /Find Steed is instantaneous, so it does not end when Ven wishes/);
    // Another master's companion, a stranger, an id that is nothing: refused, with nothing told of a foe's bond.
    refused(p, { type: "dismiss", actor: "ven", id: "fighter" }, PAT, /is not Ven's companion/);
    refused(p, { type: "dismiss", actor: "ven", id: "nobody" }, PAT, /No such creature/);
    refused(p, { type: "dismiss", actor: "ven", id: steed }, BO, /isn't yours to control/);
    // A DM's familiar (no spell made it) has no pocket dimension.
    const wolf = spawn(p, "wolf", spots(p, p.entities.fighter.pos, 2).at(-1), "Wolf");
    ok(apply(p, { type: "bond", actor: wolf, to: "fighter", kind: "familiar" }, DM));
    refused(p, { type: "dismiss", actor: "fighter", id: wolf }, BO, /was bonded by the DM, and no spell keeps it, so there is nothing to dismiss/);
  });

  test(`a pocketed familiar still counts toward the cap of 30${on}`, () => {
    const s = table(grid), owl = familiar(s);
    ok(apply(s, { type: "dismiss", actor: "ven", id: owl }, PAT));
    const free = spots(s, s.entities.ven.pos, 5);
    for (let i = 0; i < 29; i++) { const w = spawn(s, "rat", free[i], `Rat ${i}`); ok(apply(s, { type: "bond", actor: w, to: "ven" }, DM)); }
    const one = spawn(s, "rat", free[29], "Rat 29");
    refused(s, { type: "bond", actor: one, to: "ven" }, DM, /at most 30 companions/);
    // Taken out of the pocket for good, there is room again.
    ok(apply(s, { type: "dismiss", actor: "ven", id: owl, forever: true }, PAT));
    ok(apply(s, { type: "bond", actor: one, to: "ven" }, DM));
  });
}

// ---------- review of #343 ----------

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";

  // B1: whatever makes a character again from its sheet or a record keeps its pocket.
  test(`the pocket stays with its master when the character is made again: level up, a new sheet, items given and attuned at a rest, an edit${on}`, () => {
    const s = newGame(5, grid ? { grid } : {});
    s.settings.autoEngage = false;
    const w = { ...SHEETS.wizard, level: 1, spells: ["fire-bolt", "magic-missile", "find-familiar"] };
    const id = ok(apply(s, { type: "setSheet", sheet: w }, DM)).events.find((e) => e.type === "spawned").id;
    const owl = familiar(s, "owl", DM, id);
    ok(apply(s, { type: "setHp", actor: owl, hp: 1 }, DM));
    ok(apply(s, { type: "dismiss", actor: id, id: owl }, DM));
    const kept = json(s.entities[id].pocket);
    const check = (what) => assert.equal(json(s.entities[id].pocket), kept, `${what} keeps the pocket`);
    ok(apply(s, { type: "levelUp", actor: id, sheet: { ...s.entities[id].sheet, level: 2 } }, DM)); check("levelUp");
    ok(apply(s, { type: "setSheet", actor: id, sheet: s.entities[id].sheet }, DM)); check("setSheet");
    ok(apply(s, { type: "give", actor: id, item: "potion-of-healing" }, DM)); check("give");
    ok(apply(s, { type: "give", actor: id, item: "ring-of-protection" }, DM)); check("give");
    const ring = s.entities[id].sheet.items.find((x) => x.item === "ring-of-protection").id;
    ok(apply(s, { type: "equip", actor: id, item: ring }, DM)); check("equip");
    ok(apply(s, { type: "attune", actor: id, item: ring }, DM));
    const att = ok(apply(s, { type: "shortRest" }, DM)).events.find((x) => x.type === "attuned" && x.id === id);
    assert.ok(att && !att.failed, att?.failed); check("attunement at a rest");
    ok(apply(s, { type: "editCharacter", actor: id, record: derive(w).record }, DM)); check("editCharacter");
    // A record typed in brings no pocket of its own.
    refused(s, { type: "editCharacter", actor: id, record: { ...derive(w).record, pocket: { x: { id: "x" } } } }, DM, /"pocket" is not something a character record has/);
    // The DM can't remove a master with a familiar in its pocket: it would go with it, untold.
    refused(s, { type: "remove", actor: id }, DM, /in a pocket dimension\. Recall it or dismiss it forever first/);
    const back = spots(s, s.entities[id].pos, 2).find((h) => gap(s, s.entities[id].pos, h) * FT <= 30);
    ok(apply(s, { type: "recall", actor: id, id: owl, at: back }, DM));
    assert.equal(s.entities[owl].hp, 1);
    ok(apply(s, { type: "remove", actor: id }, DM));
  });

  // M2: a time-span summon is dismissed by its caster with no action (SRD Spells, Duration: Time Span), but not while
  // Incapacitated; an Instantaneous one is not.
  test(`a time-span summon is dismissed with no action unless its caster is Incapacitated; Concentration's too; Instantaneous ones are not${on}`, () => {
    const s = table(grid, "wizard", ["phantom-steed", "giant-insect"]), v = s.entities.ven;
    const free = spots(s, v.pos, 4, "giant-spider").filter((h) => gap(s, v.pos, h) * FT <= 30);
    const horse = made(ok(apply(s, { type: "cast", actor: "ven", spell: "phantom-steed", slot: 3, summon: { at: [free.at(-1)] } }, PAT)));
    const t = structuredClone(s);
    ok(apply(t, { type: "condition", actor: "ven", condition: "stunned" }, DM));
    refused(t, { type: "dismiss", actor: "ven", id: horse }, PAT, /Ven is Stunned, and a spell is dismissed only by a caster who isn't Incapacitated/);
    const r = ok(apply(s, { type: "dismiss", actor: "ven", id: horse }, PAT));
    assert.ok(!s.entities[horse] && r.events.some((e) => e.type === "vanished" && e.id === horse && e.why === "ended"));
    assert.ok(!s.effects.some((x) => x.spell === "phantom-steed"));
    // In a fight it costs nothing.
    const bug = made(ok(apply(s, { type: "cast", actor: "ven", spell: "giant-insect", slot: 4, summon: { variant: "wasp", at: [free.at(-2)] } }, PAT)));
    spawn(s, "goblin-warrior", spots(s, s.entities.fighter.pos, 5).filter((h) => gridOf(s.map).dist(h, s.entities.fighter.pos) >= 5)[0], "Gob");
    ok(apply(s, { type: "startEncounter", center: v.pos, radius: 6 }, DM));
    toTurn(s, "ven");
    const budget = json(s.encounter.budget);
    ok(apply(s, { type: "dismiss", actor: "ven", id: bug }, PAT));
    assert.ok(!s.entities[bug]);
    assert.equal(json(s.encounter.budget), budget, "no action spent");
  });

  // L2: a light it carried is something it carried: it stays behind. L4: its id is checked before it comes back.
  test(`a familiar's torch stays behind when it goes to the pocket, and it comes back without it; a taken id is refused${on}`, () => {
    const s = table(grid), owl = familiar(s);
    ok(apply(s, { type: "setLight", actor: owl, item: "torch" }, DM));
    const was = { ...s.entities[owl].pos };
    ok(apply(s, { type: "dismiss", actor: "ven", id: owl }, PAT));
    assert.equal(s.entities.ven.pocket[owl].light, undefined);
    assert.ok(s.map.objects.some((o) => o.def === "pile" && o.at.q === was.q && o.at.r === was.r && o.contents.some((c) => /torch/i.test(c.name ?? ""))), "the torch is in its space");
    const near = spots(s, s.entities.ven.pos, 2).find((h) => gap(s, s.entities.ven.pos, h) * FT <= 30);
    const t = structuredClone(s); t.entities[owl] = structuredClone(t.entities.fighter); t.entities[owl].id = owl;
    refused(t, { type: "recall", actor: "ven", id: owl, at: near }, DM, /already has that id/);
    ok(apply(s, { type: "recall", actor: "ven", id: owl, at: near }, PAT));
    assert.equal(s.entities[owl].light, undefined, "it comes back unlit");
  });
}

// ---------- review of #343, round 2: an unseen familiar in a fight, a raised master's pocket, a fight's XP ----------

const unknownTo = (s, id) => unknown(s, s.entities[id]);
const ZED = { role: "player", userId: "zed" };          // a player with no creature of their own
const VIEWERS = [PAT, BO, ZED];
// A foe wizard, Hex, beside the party, with a familiar of its own (cast by the DM). `type` so that its corpse is a Humanoid's.
function foeMaster(s, hidden = false) {
  const d = derive(sheet("wizard", ["find-familiar"], "Hex"));
  s.entities.hex = makeEntity(d.record, { id: "hex", kind: "npc", side: "foe", type: "humanoid", pos: { ...spots(s, s.entities.fighter.pos, 5).at(-1), z: 0 } });
  if (hidden) ok(apply(s, { type: "reveal", actor: "hex", hidden: true }, DM));
  return familiar(s, "owl", DM, "hex");
}

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";

  // M1, option (b): the review's scenario (a hiding foe master and its hiding owl in a fight, a seen goblin between them).
  // Sending the owl away is refused, changing nothing, so players get exactly what they get when nothing is tried.
  test(`in a fight, an unseen familiar is not sent to the pocket or brought back: refused, and players get the same as with nothing${on}`, () => {
    const run = (trying) => {
      const s = table(grid), log = [];
      const owl = foeMaster(s, true);
      ok(apply(s, { type: "reveal", actor: owl, hidden: true }, DM));
      const gob = spawn(s, "goblin-warrior", spots(s, s.entities.fighter.pos, 3).filter((h) => gridOf(s.map).dist(h, s.entities.fighter.pos) >= 2)[0], "Gob");
      ok(apply(s, { type: "startEncounter", center: s.entities.fighter.pos, radius: 14 }, DM));
      // The order the review used: Hex, the goblin, the owl, then the party; both unseen ones hiding.
      const by = Object.fromEntries(s.encounter.order.map((o) => [o.id, o]));
      s.encounter.order = ["hex", gob, owl, "fighter", "ven"].filter((i) => by[i]).map((i, k) => ({ ...by[i], init: 30 - k * 2 }));
      s.entities.hex.hiding = { dc: 10 }; s.entities[owl].hiding = { dc: 10 };
      s.encounter.turn = 0;
      assert.equal(current(s), "hex");
      assert.ok(VIEWERS.every(() => true) && apply(structuredClone(s), { type: "endTurn", actor: "hex" }, DM).ok);
      if (trying) {
        refused(s, { type: "dismiss", actor: "hex", id: owl }, DM, /out of the party's sight in this fight\. The engine can't send it away without the players noticing/);
        refused(s, { type: "dismiss", actor: "hex", id: owl, forever: true }, DM, /out of the party's sight/);
        for (const u of VIEWERS) refused(s, { type: "dismiss", actor: "hex", id: owl }, u, /No such creature/);
      }
      for (let i = 0; i < 8 && current(s) !== "ven"; i++) log.push(endTurn(s));
      assert.equal(s.encounter.gone, undefined, "nothing unseen reaches the fight's list of those gone");
      return { s, seen: VIEWERS.map((u) => log.map((r) => json(viewEvents(r.events, s, u))).filter((x) => x !== "[]")), view: VIEWERS.map((u) => json(view(s, u))), tl: VIEWERS.map((u) => json(viewEvents(s.timeline, s, u))), seq: s.seq, all: json(s) };
    };
    const A = run(true), B = run(false);
    assert.deepEqual(A.seen, B.seen, "the events players get");
    assert.deepEqual(A.view, B.view, "their view");
    assert.deepEqual(A.tl, B.tl, "the record");
    assert.equal(A.seq, B.seq);
    assert.equal(A.all, B.all, "the very same game");
  });

  test(`in a fight, an unseen familiar is not recalled from the pocket; a seen one is, and the party's own always${on}`, () => {
    const s = table(grid), owl = foeMaster(s);
    ok(apply(s, { type: "reveal", actor: owl, hidden: true }, DM));
    ok(apply(s, { type: "dismiss", actor: "hex", id: owl }, DM));        // outside the fight: nothing changes there
    const mine = familiar(s);
    ok(apply(s, { type: "dismiss", actor: "ven", id: mine }, PAT));
    spawn(s, "goblin-warrior", spots(s, s.entities.fighter.pos, 3).filter((h) => gridOf(s.map).dist(h, s.entities.fighter.pos) >= 2)[0], "Gob");
    ok(apply(s, { type: "startEncounter", center: s.entities.fighter.pos, radius: 14 }, DM));
    toTurn(s, "hex");
    const near = spots(s, s.entities.hex.pos, 2).find((h) => gap(s, s.entities.hex.pos, h) * FT <= 30);
    refused(s, { type: "recall", actor: "hex", id: owl, at: near }, DM, /out of the party's sight in this fight\. The engine can't bring it back/);
    // Forever, from the pocket, is nothing on the map or in the order: it may go.
    const t = structuredClone(s);
    ok(apply(t, { type: "dismiss", actor: "hex", id: owl, forever: true }, DM));
    endTurn(s);
    toTurn(s, "ven");
    ok(apply(s, { type: "recall", actor: "ven", id: mine, at: spots(s, s.entities.ven.pos, 2).find((h) => gap(s, s.entities.ven.pos, h) * FT <= 30) }, PAT));
  });

  // L6: a foe familiar the party saw go to the pocket in a fight is kept by the fight once, and not twice if it comes back.
  test(`a seen foe familiar pocketed in a fight is counted once for the fight's XP, and not twice when recalled into it${on}`, () => {
    const s = table(grid), owl = foeMaster(s);
    const gob = spawn(s, "goblin-warrior", spots(s, s.entities.fighter.pos, 3).filter((h) => gridOf(s.map).dist(h, s.entities.fighter.pos) >= 2)[0], "Gob");
    ok(apply(s, { type: "startEncounter", center: s.entities.fighter.pos, radius: 14 }, DM));
    assert.ok(!unknownTo(s, owl), "the party sees the owl");
    toTurn(s, "hex");
    const r = ok(apply(s, { type: "dismiss", actor: "hex", id: owl }, DM));
    for (const u of VIEWERS) assert.deepEqual(viewEvents(r.events, s, u).filter((e) => e.id === owl), [{ type: "vanished", id: owl }], "seen to vanish, its master not named");
    assert.deepEqual(s.encounter.gone.map((g) => g.id), [owl]);
    endTurn(s); toTurn(s, "hex");
    ok(apply(s, { type: "recall", actor: "hex", id: owl, at: spots(s, s.entities.hex.pos, 2).find((h) => gap(s, s.entities.hex.pos, h) * FT <= 30) }, DM));
    assert.ok(s.encounter.order.some((o) => o.id === owl));
    assert.equal(s.encounter.gone, undefined, "back in the fight, it is not one that left it");
    endTurn(s); toTurn(s, "hex");
    ok(apply(s, { type: "dismiss", actor: "hex", id: owl }, DM));
    assert.deepEqual(s.encounter.gone.map((g) => g.id), [owl], "once");
    for (const id of [gob, "hex"]) ok(apply(s, { type: "setHp", actor: id, hp: 0 }, DM));
    if (s.encounter) ok(apply(s, { type: "endEncounter" }, DM));
    const foes = s.conclusion.foes.filter((f) => f.id === owl);
    assert.equal(foes.length, 1, "listed once");
    assert.ok(foes[0].counts && foes[0].gone);
    if (!s.conclusion.published) ok(apply(s, { type: "conclusion", publish: true }, DM));
    const card = json(view(s, PAT).conclusion ?? null) + json(view(s, PAT).chronicle ?? null);
    assert.equal(card.split(`"${owl}"`).length - 1, 1, "the party's card names it once");
  });

  // B1, the corpse: a master raised as undead loses what was in its pocket, and the DM is told.
  test(`a master's corpse raised as undead: its pocketed familiar vanishes, the DM is told, players learn nothing of a foe's${on}`, () => {
    const s = table(grid, "wizard", ["find-familiar", "animate-dead"]), owl = foeMaster(s);
    ok(apply(s, { type: "dismiss", actor: "hex", id: owl }, DM));
    // Hex dies beside Ven.
    s.entities.hex.pos = { ...spots(s, s.entities.ven.pos, 2).find((h) => apart(s, s.entities.ven, { ...s.entities.ven, pos: { ...h, z: 0 } }) * FT <= 10), z: 0 };
    ok(apply(s, { type: "setHp", actor: "hex", hp: 0 }, DM));
    if (!s.entities.hex.dead) ok(apply(s, { type: "kill", actor: "hex" }, DM));
    assert.ok(s.entities.hex.dead && s.entities.hex.pocket[owl]);
    const r = ok(apply(s, { type: "cast", actor: "ven", spell: "animate-dead", slot: 3, summon: { ids: ["hex"] } }, PAT));
    assert.ok(!s.entities.hex, "the corpse rose");
    assert.ok(r.events.some((e) => e.type === "vanished" && e.id === owl && e.why === "master" && e.pocket === true && !e.seen));
    assert.ok(r.events.some((e) => e.type === "manual" && e.partial && /pocket dimension when Hex's corpse rose/.test(e.text)), "the DM is told");
    for (const u of VIEWERS) assert.ok(!json(viewEvents(r.events, s, u)).includes(owl) && !json(view(s, u)).includes(owl), "players learn nothing of the foe's familiar");
  });
}

// ---------- review of #343, round 3 ----------

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";
  const fightOn = (s, center, radius = 14) => {
    spawn(s, "goblin-warrior", spots(s, s.entities.fighter.pos, 3).filter((h) => gridOf(s.map).dist(h, s.entities.fighter.pos) >= 2)[0], "Gob");
    ok(apply(s, { type: "startEncounter", center, radius }, DM));
  };

  // M-1: a master who can't act can't recall or dismiss; the DM may still release its familiar from the pocket for good.
  test(`the DM releases a familiar from the pocket of a dead, dying or Stunned master; a player can't; then the master can be removed${on}`, () => {
    for (const how of ["dead", "down", "stunned"]) {
      const s = table(grid), owl = familiar(s);
      ok(apply(s, { type: "dismiss", actor: "ven", id: owl }, PAT));
      if (how === "stunned") ok(apply(s, { type: "condition", actor: "ven", condition: "stunned" }, DM));
      else { s.entities.ven.hp = 0; if (how === "dead") s.entities.ven.dead = true; else s.entities.ven.cond.stable = true; }
      refused(s, { type: "remove", actor: "ven" }, DM, /in a pocket dimension/);
      refused(s, { type: "dismiss", actor: "ven", id: owl, forever: true }, PAT, how === "stunned" ? /Stunned and can't act/ : /is down/);
      refused(s, { type: "dismiss", actor: "ven", id: owl }, DM, /already in a pocket dimension/);
      const r = ok(apply(s, { type: "dismiss", actor: "ven", id: owl, forever: true }, DM));
      assert.deepEqual(r.events.map((e) => [e.type, e.id, e.why]), [["vanished", owl, "dismissed"]], how);
      assert.equal(s.entities.ven.pocket, undefined, how);
      ok(apply(s, { type: "remove", actor: "ven" }, DM));
      assert.ok(!s.entities.ven);
    }
  });

  // M-2: the same refusal for a summon its master dismisses: a hiding foe master's hiding wasp, in a fight.
  test(`in a fight, a summon the party can't see is not dismissed: refused, and players get the same as with nothing${on}`, () => {
    const setup = () => {
      const s = table(grid);
      const d = derive(sheet("wizard", ["giant-insect"], "Hex"));
      s.entities.hex = makeEntity(d.record, { id: "hex", kind: "npc", side: "foe", type: "humanoid", pos: { ...spots(s, s.entities.fighter.pos, 5).at(-1), z: 0 } });
      const free = spots(s, s.entities.hex.pos, 4, "giant-spider").filter((h) => gap(s, s.entities.hex.pos, h) * FT <= 60);
      const wasp = made(ok(apply(s, { type: "cast", actor: "hex", spell: "giant-insect", slot: 4, summon: { variant: "wasp", at: [free.at(-1)] } }, DM)));
      return { s, wasp };
    };
    const run = (trying) => {
      const { s, wasp } = setup(), log = [];
      ok(apply(s, { type: "reveal", actor: "hex", hidden: true }, DM));
      ok(apply(s, { type: "reveal", actor: wasp, hidden: true }, DM));
      const gob = spawn(s, "goblin-warrior", spots(s, s.entities.fighter.pos, 3).filter((h) => gridOf(s.map).dist(h, s.entities.fighter.pos) >= 2)[0], "Gob");
      ok(apply(s, { type: "startEncounter", center: s.entities.fighter.pos, radius: 14 }, DM));
      const by = Object.fromEntries(s.encounter.order.map((o) => [o.id, o]));
      s.encounter.order = ["hex", gob, wasp, "fighter", "ven"].filter((i) => by[i]).map((i, k) => ({ ...by[i], init: 30 - k * 2 }));
      for (const o of s.encounter.order) { delete o.after; delete o.before; }
      s.entities.hex.hiding = { dc: 10 }; s.entities[wasp].hiding = { dc: 10 };
      s.encounter.turn = 0;
      assert.ok(s.encounter.order.some((o) => o.id === wasp) && unknownTo(s, wasp));
      if (trying) {
        refused(s, { type: "dismiss", actor: "hex", id: wasp }, DM, /out of the party's sight in this fight\. The engine can't end it without the players noticing/);
        for (const u of VIEWERS) refused(s, { type: "dismiss", actor: "hex", id: wasp }, u, /No such creature/);
      }
      for (let i = 0; i < 8 && current(s) !== "ven"; i++) log.push(endTurn(s));
      return { seen: VIEWERS.map((u) => log.map((r) => json(viewEvents(r.events, s, u))).filter((x) => x !== "[]")), view: VIEWERS.map((u) => json(view(s, u))), tl: VIEWERS.map((u) => json(viewEvents(s.timeline, s, u))), seq: s.seq, all: json(s) };
    };
    const A = run(true), B = run(false);
    assert.deepEqual(A.seen, B.seen); assert.deepEqual(A.view, B.view); assert.deepEqual(A.tl, B.tl);
    assert.equal(A.seq, B.seq); assert.equal(A.all, B.all);
    // Seen, it is dismissed in the fight as before; outside a fight, a hidden one is too.
    const { s, wasp } = setup();
    fightOn(s, s.entities.fighter.pos);
    toTurn(s, "hex");
    assert.ok(!unknownTo(s, wasp));
    ok(apply(s, { type: "dismiss", actor: "hex", id: wasp }, DM));
    assert.ok(!s.entities[wasp]);
    const out = setup();
    ok(apply(out.s, { type: "reveal", actor: out.wasp, hidden: true }, DM));
    ok(apply(out.s, { type: "dismiss", actor: "hex", id: out.wasp }, DM));
    assert.ok(!out.s.effects.some((x) => x.spell === "giant-insect"));
    // Each refusal in its own words: a lasting effect that is another's, one that is gone.
    const t = setup();
    const fx = t.s.effects.find((x) => x.spell === "giant-insect");
    const other = structuredClone(t.s); other.effects.find((x) => x.id === fx.id).source = "fighter";
    refused(other, { type: "dismiss", actor: "hex", id: t.wasp }, DM, /is kept by Giant Insect, which is not Hex's to dismiss/);
    const gone = structuredClone(t.s); gone.entities[t.wasp].bond.fx = "fx999";
    refused(gone, { type: "dismiss", actor: "hex", id: t.wasp }, DM, /nothing that lasts keeps it now/);
  });

  // Only a familiar in the fight: one outside the arena, out of its order, is not refused.
  test(`an unseen familiar outside the arena is dismissed by a master in the fight${on}`, () => {
    const s = table(grid), owl = foeMaster(s);
    const far = [...gridOf(s.map).range(s.entities.fighter.pos, 14)].find((h) => gridOf(s.map).dist(h, s.entities.fighter.pos) >= 9 && apply(structuredClone(s), { type: "spawn", monster: "owl", at: h }, DM).ok);
    assert.ok(far, "a cell far from the party");
    s.entities[owl].pos = { ...far, z: 0 };
    ok(apply(s, { type: "reveal", actor: owl, hidden: true }, DM));
    fightOn(s, s.entities.fighter.pos, 6);
    assert.ok(s.encounter.order.some((o) => o.id === "hex") && !s.encounter.order.some((o) => o.id === owl) && unknownTo(s, owl));
    toTurn(s, "hex");
    ok(apply(s, { type: "dismiss", actor: "hex", id: owl }, DM));
    assert.ok(s.entities.hex.pocket[owl]);
  });
}

// ---------- what players are sent ----------

for (const grid of [null, "square"]) {
  const on = grid ? " (squares)" : " (hexes)";
  // A hidden foe wizard with a familiar the DM hid: two runs, one where it dismisses the familiar to its pocket, reforms
  // it there and recalls it to the same space, and one where it does nothing. Players get the same.
  test(`a hidden foe master's dismiss, pocket and recall: players' events, views, record and seq as with none${on}`, () => {
    const run = (doing) => {
      const s = table(grid), log = [];
      const d = derive(sheet("wizard", ["find-familiar"], "Hex"));
      const place = spots(s, s.entities.fighter.pos, 5).at(-1);
      s.entities.hex = makeEntity(d.record, { id: "hex", kind: "npc", side: "foe", pos: { ...place, z: 0 } });
      log.push(ok(apply(s, { type: "reveal", actor: "hex", hidden: true }, DM)));
      const owl = familiar(s, "owl", DM, "hex");
      log.push(ok(apply(s, { type: "reveal", actor: owl, hidden: true }, DM)));
      const where = { q: s.entities[owl].pos.q, r: s.entities[owl].pos.r };
      if (doing) {
        log.push(ok(apply(s, { type: "dismiss", actor: "hex", id: owl }, DM)));
        assert.ok(s.entities.hex.pocket[owl]);
        const pv = json(view(s, PAT));
        assert.ok(!pv.includes(owl) && !pv.includes("pocket"), "a pocketed foe familiar is in no player view");
        log.push(ok(apply(s, { type: "cast", actor: "hex", spell: "find-familiar", slot: 1, summon: { form: "owl", type: "fiend" } }, DM)));
        log.push(ok(apply(s, { type: "recall", actor: "hex", id: owl, at: where }, DM)));
        assert.ok(s.entities[owl].hidden, "still hidden");
      }
      log.push(ok(apply(s, { type: "advanceTime", minutes: 1 }, DM)));
      return { s, seen: [PAT, BO].map((u) => log.map((r) => json(viewEvents(r.events, s, u))).filter((x) => x !== "[]")), view: [PAT, BO].map((u) => json(view(s, u))), tl: [PAT, BO].map((u) => json(viewEvents(s.timeline, s, u))), seq: s.seq };
    };
    const A = run(true), B = run(false);
    assert.ok(A.s.timeline.some((e) => e.type === "pocketed") && A.s.timeline.some((e) => e.type === "recalled"), "the DM's record has them");
    assert.deepEqual(A.seen, B.seen, "the events players get");
    assert.deepEqual(A.view, B.view, "their view");
    assert.deepEqual(A.tl, B.tl, "the record");
    assert.equal(A.seq, B.seq);
  });

  test(`a seen foe familiar going to the pocket is seen to vanish; back, it is seen to appear; its master is never named${on}`, () => {
    const s = table(grid);
    const d = derive(sheet("wizard", ["find-familiar"], "Hex"));
    s.entities.hex = makeEntity(d.record, { id: "hex", kind: "npc", side: "foe", pos: { ...spots(s, s.entities.fighter.pos, 5).at(-1), z: 0 } });
    ok(apply(s, { type: "reveal", actor: "hex", hidden: true }, DM));
    const owl = familiar(s, "owl", DM, "hex");
    const where = { q: s.entities[owl].pos.q, r: s.entities[owl].pos.r };
    const r = ok(apply(s, { type: "dismiss", actor: "hex", id: owl }, DM));
    assert.deepEqual(viewEvents(r.events, s, PAT), [{ type: "vanished", id: owl }]);
    const b = ok(apply(s, { type: "recall", actor: "hex", id: owl, at: where }, DM));
    assert.deepEqual(viewEvents(b.events, s, PAT), [{ type: "spawned", id: owl }]);
    assert.ok(!("bond" in view(s, PAT).entities[owl]));
    const label = describeStep({ type: "recall", actor: "hex", id: owl, at: where }, b.events, mark(s), s);
    assert.equal(label.label, "Hex called Owl 1 back");
    assert.equal(label.shown, null, "players are not told whose it is");
  });
}

// ---------- the vocabulary ----------

test("`one` in the content vocabulary: Find Familiar reforms, Find Steed replaces, and the linter holds the rest", () => {
  assert.equal(CONTENT.spells["find-familiar"].effects[0].one, "reform");
  assert.equal(CONTENT.spells["find-steed"].effects[0].one, "replace");
  assert.deepEqual(["find-familiar", "find-steed"].map((id) => CONTENT.spells[id].tier), ["assist", "assist"], "telepathy for one, riding for the other, are still the DM's");
  const [srd] = PACKS, ff = srd.spells.find((x) => x.id === "find-familiar");
  const withFF = (change) => { const sp = structuredClone(ff); change(sp.effects[0]); return lintPack({ ...srd, spells: [sp, ...srd.spells.filter((x) => x.id !== ff.id)] }).join("\n"); };
  assert.equal(withFF(() => {}), "");
  assert.match(withFF((st) => { st.one = "both"; }), /`one` is reform or replace/);
  assert.match(withFF((st) => { st.on = "space"; st.count = 2; }), /`one` makes one creature/);
  assert.match(withFF((st) => { delete st.forms; st.summon = "owl"; st.one = "reform"; }), /lists `forms`/);
});

// ---------- old saves, undo, redo, replay, save and load ----------

test("old saves without a pocket load unchanged and play on", () => {
  for (const grid of [null, "square"]) {
    const s = table(grid), owl = familiar(s);
    const saved = json(s), loaded = JSON.parse(saved);
    migrate(loaded);
    assert.equal(json(loaded), saved, "loads unchanged");
    ok(apply(loaded, { type: "dismiss", actor: "ven", id: owl }, PAT));
    assert.ok(loaded.entities.ven.pocket[owl]);
  }
});

for (const grid of [null, "square"]) {
  test(`undo, redo and replay give back exactly what the pocket, a reform and a delivery did, and a save with a familiar in the pocket loads byte-exact${grid ? " (squares)" : " (hexes)"}`, () => {
    const build = () => {
      const s = table(grid), owl = familiar(s);
      const gob = spawn(s, "goblin-warrior", spots(s, s.entities[owl].pos, 1)[0], "Gob");
      return { s, owl, gob };
    };
    const { s, owl, gob } = build();
    const h = createHistory({ limit: 200 }), states = [json(s)], done = [], labels = [];
    let saved = null, savedAt = -1;
    const play = (a, ctx = DM) => {
      const before = mark(s), r = ok(apply(s, a, ctx));
      const label = describeStep(a, r.events, before, s);
      h.record(before, s, label);
      labels.push(label); done.push(a); states.push(json(s));
    };
    const where = () => ({ ...spots(s, s.entities.ven.pos, 2).find((x) => gap(s, s.entities.ven.pos, x) * FT <= 30) });
    play({ type: "dismiss", actor: "ven", id: owl });
    play({ type: "cast", actor: "ven", spell: "find-familiar", slot: 1, summon: { form: "cat", type: "fey" } });
    play({ type: "startEncounter", center: s.entities.ven.pos, radius: 6 });
    let rounds = 0;
    for (let i = 0; i < 40 && s.encounter && rounds < 4; i++) {
      if (current(s) === "ven") {
        rounds++;
        if (s.entities.ven.pocket) { play({ type: "recall", actor: "ven", id: owl, at: where() }); if (!saved) { saved = json(s); savedAt = done.length; } }
        else if (rounds === 2 && apart(s, s.entities[owl], s.entities[gob]) <= 1) play({ type: "cast", actor: "ven", spell: "shocking-grasp", target: gob, deliver: owl });
        else play({ type: "dismiss", actor: "ven", id: owl });
      }
      play({ type: "endTurn", actor: current(s) });
    }
    assert.ok(saved, "the familiar was recalled in the fight");
    assert.ok(labels.some((l) => l.label === "Ven dismissed Ven's Owl to a pocket dimension" && l.shown === l.label));
    assert.ok(labels.some((l) => l.label === "Ven called Ven's Cat back"));
    for (let i = done.length - 1; i >= 0; i--) { h.undo(s); assert.equal(json(s), states[i], `undo ${i}`); }
    for (let i = 1; i <= done.length; i++) { h.redo(s); assert.equal(json(s), states[i], `redo ${i}`); }
    const again = build().s;
    for (const a of done) ok(apply(again, a, DM));
    assert.equal(json(again), states.at(-1), "replayed, the same");
    // A save taken with the familiar in the pocket, mid-fight.
    const mid = states.findIndex((x, i) => i > 3 && JSON.parse(x).entities.ven.pocket && JSON.parse(x).encounter);
    assert.ok(mid > 0, "a state in the fight with the familiar in the pocket");
    for (const [snap, from] of [[states[mid], mid], [saved, savedAt]]) {
      const loaded = JSON.parse(snap);
      migrate(loaded);
      assert.equal(json(loaded), snap, "loads unchanged");
      for (const a of done.slice(from)) ok(apply(loaded, a, DM));
      assert.equal(json(loaded), states.at(-1), "played on from the save, the same");
    }
  });
}
