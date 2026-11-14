// Items between creatures (docs/specs/table-ui.md E17 and T6g, DEBT C14; #290): `pass` to a creature on the same
// side within 5 ft, `drop` onto a `pile` on the map, `pickUp` from one. One `gear` event per side with `why` and
// `with` (or `object`); Attunement ends with an item that leaves; in a fight each is an object interaction; both
// grids; a pile is seen only where it is in view; undo; a refused action changes nothing.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity, passTargets, pickUpsFor } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { CONTENT, PACKS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";
import { lintMap, newMap } from "../src/map.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import * as H from "../src/hex.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";
import { squareRoom } from "./fixtures/square-room.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const SAM = { role: "player", userId: "sam" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false); if (re) assert.match(r.error, re); };
const A = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 };
const fighter = (items) => ({ name: "Brenna", class: "fighter", level: 5, subclass: "champion", abilities: A, skills: ["athletics", "perception"],
  choices: { "fighting-style": "defense" }, weapons: ["longbow"], ...(items ? { items } : {}) });
const wizard = (items) => ({ name: "Tavin", class: "wizard", level: 5, subclass: "evoker", abilities: { ...A, int: 16, str: 8 }, skills: ["arcana", "history"],
  weapons: ["dagger"], spells: ["fire-bolt"], ...(items ? { items } : {}) });
const built = (s, id, sheet, pos, owner) => {
  s.entities[id] = makeEntity(derive(sheet).record, { id, kind: "pc", side: "party", pos: { ...pos, z: 0 }, owner, ownerName: owner });
  s.entities[id].sheet = structuredClone(sheet);
};
// Brenna ("hero", Pat's) and Tavin ("mage", Sam's) side by side, the rogue (typed in by hand, nobody's) two hexes
// off, the goblin m1 three hexes off.
function field(heroItems, mageItems) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (!["m1", "rogue"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  built(s, "hero", fighter(heroItems), { q: 0, r: 0 }, "pat");
  built(s, "mage", wizard(mageItems), { q: 1, r: 0 }, "sam");
  ok(apply(s, { type: "place", actor: "m1", to: { q: 3, r: 0 } }, DM));
  ok(apply(s, { type: "place", actor: "rogue", to: { q: -2, r: 0 } }, DM));
  return s;
}
const gears = (r) => r.events.filter((e) => e.type === "gear");
const fight = (s, who = "hero") => {
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, DM));
  for (let i = 0; i < 20 && current(s) !== who; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  assert.equal(current(s), who);
};
const refusedClean = (s, action, ctx, re) => { const was = JSON.stringify(s); no(apply(s, action, ctx), re); assert.equal(JSON.stringify(s), was, `${action.type} refused and changed nothing`); };

test("the pile: a content object the linter knows; a pile with uses, triggers or a second state is refused", () => {
  const pile = CONTENT.objects.pile;
  assert.equal(pile.kind, "pile");
  assert.deepEqual(lintPack({ pack: PACKS[0].pack, objects: [pile] }), []);
  const bad = (change) => { const o = structuredClone(pile); change(o); return lintPack({ pack: PACKS[0].pack, objects: [o] }).join(" | "); };
  assert.match(bad((o) => { o.use = [{ id: "kick", name: "Kick", from: ["lying"], to: "lying", time: "free" }]; }), /no uses/);
  assert.match(bad((o) => { o.states.heap = { name: "a heap", blocks: [] }; }), /one state/);
  assert.match(bad((o) => { o.states.lying.blocks = ["move"]; }), /blocks nothing/);
  // A map may carry a pile the DM laid down with things on it.
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 3).map((h) => [H.col(h), { t: "stone" }]));
  const map = newMap({ id: "p", name: "P", starts: [{ q: 0, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }],
    objects: [{ id: "loot", def: "pile", level: "ground", at: { q: 1, r: 0 }, state: "lying", contents: [{ id: "c1", name: "Rope" }, { id: "c2", item: "potion-of-healing" }] }] });
  assert.deepEqual(lintMap(map), []);
  const edge = structuredClone(map); edge.objects[0].edge = 0;
  assert.ok(lintMap(edge).length, "a pile stands in a cell, not on an edge");
});

test("pass a name: to a party member within 5 ft; one gear event each side with why and with; players of both see them", () => {
  const s = field();
  s.entities.hero.gear.push("Rope");
  const r = ok(apply(s, { type: "pass", actor: "hero", item: "rope", to: "mage" }, PAT));
  assert.deepEqual(gears(r), [
    { type: "gear", id: "hero", item: "Rope", why: "pass", with: "mage", taken: true },
    { type: "gear", id: "mage", item: "Rope", why: "pass", with: "hero" },
  ]);
  assert.ok(!s.entities.hero.gear.includes("Rope") && s.entities.mage.gear.includes("Rope"));
  for (const who of [PAT, SAM]) assert.deepEqual(viewEvents(r.events, s, who).filter((e) => e.type === "gear"), gears(r), "the party's players see both sides");
  // Not too far, not to a foe, not to oneself, not what one has not got; refused, nothing changes.
  s.entities.hero.gear.push("Torch");
  refusedClean(s, { type: "pass", actor: "hero", item: "Torch", to: "rogue" }, DM, /more than 5 feet/);
  refusedClean(s, { type: "pass", actor: "hero", item: "Torch", to: "m1" }, DM, /not on Brenna's side/);
  refusedClean(s, { type: "pass", actor: "hero", item: "Torch", to: "hero" }, DM, /already holds it/);
  refusedClean(s, { type: "pass", actor: "hero", item: "Lantern", to: "mage" }, DM, /has no Lantern/);
  refusedClean(s, { type: "pass", actor: "hero", item: "Torch", to: "mage" }, SAM, /isn't yours|not yours|control/i);
  refusedClean(s, { type: "pass", actor: "hero", item: "Torch" }, PAT, /Name who/);
  // One who is down can't take it.
  s.entities.mage.hp = 0; s.entities.mage.cond.unconscious = true;
  refusedClean(s, { type: "pass", actor: "hero", item: "Torch", to: "mage" }, PAT, /can't take it/);
});

test("a hidden creature as `to` is answered as one that is not there; the DM may still name it", () => {
  const s = field();
  s.entities.hero.gear.push("Rope");
  const mine = apply(structuredClone(s), { type: "pass", actor: "hero", item: "Rope", to: "m1" }, PAT);
  const ghost = apply(s, { type: "pass", actor: "hero", item: "Rope", to: "m99" }, PAT);
  assert.deepEqual(ghost, { ok: false, error: "No such creature.", events: [] });
  assert.notDeepEqual(mine.error, ghost.error, "a goblin they can see is refused as a foe");
  // A hidden foe's id gets exactly the nobody answer.
  const g = s.entities[ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 0, r: -1 }, hidden: true }, DM)).events[0].id];
  assert.deepEqual(apply(s, { type: "pass", actor: "hero", item: "Rope", to: g.id }, PAT), ghost);
});

test("a magic item: off one sheet onto the other with its charges; an Attunement ends and is said to; worn is refused", () => {
  const s = field([{ id: "i1", item: "wand-of-magic-missiles", charges: 4 }, { id: "i2", item: "cloak-of-protection", equipped: true, attuned: true },
    { id: "i3", item: "ring-of-protection" }], [{ id: "i1", item: "potion-of-healing" }]);
  refusedClean(s, { type: "pass", actor: "hero", item: "i2", to: "mage" }, PAT, /has Cloak of Protection on. Take it off first/);
  const r = ok(apply(s, { type: "pass", actor: "hero", item: "i1", to: "mage" }, PAT));
  assert.deepEqual(gears(r), [
    { type: "gear", id: "hero", item: "Wand of Magic Missiles", pack: "wand-of-magic-missiles", why: "pass", key: "i1", with: "mage", taken: true },
    { type: "gear", id: "mage", item: "Wand of Magic Missiles", pack: "wand-of-magic-missiles", why: "pass", key: "i2", with: "hero" },
  ]);
  assert.deepEqual(s.entities.mage.sheet.items.find((x) => x.id === "i2"), { id: "i2", item: "wand-of-magic-missiles", charges: 4 }, "the charges go with it");
  assert.ok(!s.entities.hero.sheet.items.some((x) => x.item === "wand-of-magic-missiles"));
  // Attuned and about to be attuned: taken off (outside a fight), then handed over, the Attunement ends.
  ok(apply(s, { type: "equip", actor: "hero", item: "i2", on: false }, PAT));
  const ac = s.entities.hero.ac;
  const c = ok(apply(s, { type: "pass", actor: "hero", item: "i2", to: "mage" }, PAT));
  assert.equal(gears(c)[0].unattuned, true, "said: Brenna is no longer attuned to it");
  assert.deepEqual(s.entities.mage.sheet.items.find((x) => x.item === "cloak-of-protection"), { id: "i3", item: "cloak-of-protection" }, "Tavin holds it unattuned");
  assert.equal(viewEvents(c.events, s, PAT).find((e) => e.type === "gear" && e.id === "hero").unattuned, true);
  assert.equal(s.entities.hero.ac, ac, "it was off already, so no change");
  ok(apply(s, { type: "attune", actor: "hero", item: "i3" }, PAT));
  const ring = ok(apply(s, { type: "pass", actor: "hero", item: "i3", to: "mage" }, PAT));
  assert.ok(ring.events.some((e) => e.type === "attuning" && e.id === "hero" && e.cleared), "the attuning that named it is cleared");
  assert.equal(s.entities.hero.sheet.attuning, undefined);
  assert.equal(s.entities.hero.sheet.items, undefined);
  // To a creature typed in by hand: the item's name only, as `give` does.
  s.entities.rogue.pos = { q: 0, r: 1, z: 0 };
  const p = ok(apply(s, { type: "pass", actor: "mage", item: "i1", to: "rogue" }, SAM));
  assert.deepEqual(gears(p)[1], { type: "gear", id: "rogue", item: "Potion of Healing", pack: "potion-of-healing", why: "pass", with: "mage", nameOnly: true });
  assert.ok(s.entities.rogue.gear.includes("Potion of Healing"));
});

test("a sheet that can't take it refuses the whole pass: both creatures as they were", () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ id: `k${i}`, item: "potion-of-healing" }));
  const s = field([{ id: "i1", item: "potion-of-healing" }], many);
  refusedClean(s, { type: "pass", actor: "hero", item: "i1", to: "mage" }, PAT, /60/);
  assert.equal(s.entities.hero.sheet.items.length, 1);
});

test("drop and pick up: a pile in the cell, added to; seen by players with what is on it but never charges; gone when empty", () => {
  const s = field([{ id: "i1", item: "wand-of-magic-missiles", charges: 2 }]);
  s.entities.hero.gear.push("Rope", "Torch");
  const d = ok(apply(s, { type: "drop", actor: "hero", item: "Rope" }, PAT));
  const pile = s.map.objects.find((o) => o.def === "pile");
  assert.ok(pile && pile.at.q === 0 && pile.at.r === 0 && pile.level === "ground");
  assert.deepEqual(pile.contents, [{ id: "c1", name: "Rope" }]);
  assert.deepEqual(gears(d), [{ type: "gear", id: "hero", item: "Rope", why: "drop", object: pile.id, taken: true, seen: true }]);
  assert.equal(viewEvents(d.events, s, PAT).find((e) => e.type === "gear").seen, undefined, "`seen` is the engine's, not sent");
  assert.ok(d.events.some((e) => e.type === "object" && e.object === pile.id && e.verb === "drop" && e.placed));
  ok(apply(s, { type: "drop", actor: "hero", item: "i1" }, PAT));
  assert.equal(s.map.objects.filter((o) => o.def === "pile").length, 1, "the same pile");
  assert.deepEqual(pile.contents[1], { id: "c2", item: "wand-of-magic-missiles", charges: 2 });
  const seen = view(s, SAM).map.objects.find((o) => o.id === pile.id);
  assert.deepEqual(seen.contents, [{ id: "c1", name: "Rope" }, { id: "c2", item: "wand-of-magic-missiles" }], "what it is, not its charges");
  assert.equal(view(s, DM).map.objects.find((o) => o.id === pile.id).contents[1].charges, 2);
  // The wizard beside it picks the wand up: it lands on the sheet with its charges.
  assert.deepEqual(pickUpsFor(s, s.entities.mage).map((p) => [p.object, p.items.map((x) => x.name)]), [[pile.id, ["Rope", "Wand of Magic Missiles"]]]);
  refusedClean(s, { type: "pickUp", actor: "mage", object: pile.id, item: "c9" }, SAM, /not there/);
  const u = ok(apply(s, { type: "pickUp", actor: "mage", object: pile.id, item: "c2" }, SAM));
  assert.deepEqual(gears(u), [{ type: "gear", id: "mage", item: "Wand of Magic Missiles", pack: "wand-of-magic-missiles", why: "pickup", key: "i1", object: pile.id }]);
  assert.deepEqual(s.entities.mage.sheet.items, [{ id: "i1", item: "wand-of-magic-missiles", charges: 2 }]);
  // Too far, then the last thing: the pile goes.
  s.entities.rogue.pos = { q: -3, r: 0, z: 0 };
  refusedClean(s, { type: "pickUp", actor: "rogue", object: pile.id }, DM, /too far/);
  const last = ok(apply(s, { type: "pickUp", actor: "hero", object: pile.id }, PAT));
  assert.equal(gears(last)[0].item, "Rope");
  assert.ok(!s.map.objects.some((o) => o.id === pile.id), "an empty pile leaves the map");
  assert.ok(last.events.some((e) => e.type === "object" && e.gone));
  refusedClean(s, { type: "pickUp", actor: "hero", object: pile.id }, PAT, /No such object/);
  // Something that is not a pile is not picked up.
  s.map.objects.push({ id: "box", def: "crate", level: "ground", at: { q: -1, r: 0 }, state: "standing" });
  refusedClean(s, { type: "pickUp", actor: "hero", object: "box" }, PAT, /not something to pick up/);
});

test("a pile the DM laid down: malformed things on it are never offered, sent or picked up", () => {
  const s = field();
  ok(apply(s, { type: "mapEdit", ops: [{ op: "object", object: { id: "loot", def: "pile", level: "ground", at: { q: 0, r: 1 },
    contents: [{ id: "c1", name: "Silver Comb" }, { id: "c2", item: "no-such-item" }, { id: "c3", name: "Rope", secret: "SECRET-x" }, "junk"] } }] }, DM));
  assert.deepEqual(view(s, PAT).map.objects.find((o) => o.id === "loot").contents, [{ id: "c1", name: "Silver Comb" }]);
  assert.ok(!JSON.stringify(view(s, PAT)).includes("SECRET-x"));
  ok(apply(s, { type: "pickUp", actor: "hero", object: "loot" }, PAT));
  assert.ok(s.entities.hero.gear.includes("Silver Comb"));
  assert.ok(!s.map.objects.some((o) => o.id === "loot"));
});

test("in a fight: on its own turn; the first interaction is free, the next takes the action, then nothing; one thing a pick-up", () => {
  const s = field();
  s.entities.hero.gear.push("Rope", "Torch", "Chalk", "Bell");
  fight(s);
  assert.equal(passTargets(s, s.entities.hero).find((t) => t.id === "mage").time, "free");
  ok(apply(s, { type: "pass", actor: "hero", item: "Rope", to: "mage" }, PAT));
  assert.equal(s.encounter.budget.action, 1, "the free interaction");
  assert.equal(passTargets(s, s.entities.hero)[0].time, "action");
  ok(apply(s, { type: "drop", actor: "hero", item: "Torch" }, PAT));
  assert.equal(s.encounter.budget.action, 0, "the Utilize action");
  refusedClean(s, { type: "drop", actor: "hero", item: "Chalk" }, PAT, /already/);
  assert.ok(passTargets(s, s.entities.hero)[0].why, "the reason is offered");
  refusedClean(s, { type: "pass", actor: "mage", item: "Rope", to: "hero" }, SAM, /isn't Tavin's turn/);
  // Next turn of the hero: a pile of two is picked up one thing at a time.
  ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
  for (let i = 0; i < 20 && current(s) !== "hero"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  ok(apply(s, { type: "drop", actor: "hero", item: "Chalk" }, PAT));
  const pile = s.map.objects.find((o) => o.def === "pile");
  refusedClean(s, { type: "pickUp", actor: "hero", object: pile.id }, PAT, /Name one thing/);
  ok(apply(s, { type: "pickUp", actor: "hero", object: pile.id, item: pile.contents[0].id }, PAT));
});

test("on squares: within 5 ft is the next square, a diagonal too; 10 ft is not; a pile beside is in reach", () => {
  const s = newGame(14);
  ok(apply(s, { type: "loadMap", map: squareRoom() }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  [["fighter", 3, 3], ["cleric", 4, 4], ["rogue", 5, 3], ["wizard", 8, 8]].forEach(([id, q, r]) => { s.entities[id].pos = { q, r, z: 0 }; });
  s.entities.fighter.gear.push("Rope", "Chalk");
  ok(apply(s, { type: "pass", actor: "fighter", item: "Rope", to: "cleric" }, DM));
  no(apply(s, { type: "pass", actor: "fighter", item: "Chalk", to: "rogue" }, DM), /more than 5 feet/);
  ok(apply(s, { type: "drop", actor: "cleric", item: "Rope" }, DM));
  const pile = s.map.objects.find((o) => o.def === "pile");
  assert.deepEqual(pile.at, { q: 4, r: 4 });
  ok(apply(s, { type: "pickUp", actor: "fighter", object: pile.id }, DM));
  assert.ok(s.entities.fighter.gear.includes("Rope"));
});

test("hidden information: a pile in a room not revealed is not sent and can't be named; once revealed it is", () => {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 8).map((h) => [H.col(h), { t: "stone" }]));
  const s = newGame(5);
  const back = H.range({ q: 6, r: 0 }, 1).map(H.col);
  ok(apply(s, { type: "loadMap", map: newMap({ id: "h", name: "Hall", starts: [{ q: -5, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }],
    regions: [{ id: "back", name: "Back room", level: "ground", hexes: back }],
    objects: [{ id: "stash", def: "pile", level: "ground", at: { q: 6, r: 0 }, state: "lying", contents: [{ id: "c1", name: "Gold ring" }] }] }) }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  s.entities.fighter.owner = "pat";
  assert.ok(!view(s, PAT).map.objects.some((o) => o.id === "stash"));
  assert.ok(!JSON.stringify(view(s, PAT)).includes("Gold ring"));
  s.entities.fighter.pos = { q: 5, r: 0, z: 0 };            // beside it, but the room is not revealed until the DM says
  const hid = apply(structuredClone(s), { type: "pickUp", actor: "fighter", object: "stash" }, PAT);
  assert.deepEqual(hid, apply(structuredClone(s), { type: "pickUp", actor: "fighter", object: "nothing" }, PAT));
  ok(apply(s, { type: "revealRegion", region: "back" }, DM));
  assert.deepEqual(view(s, PAT).map.objects.find((o) => o.id === "stash").contents, [{ id: "c1", name: "Gold ring" }]);
  // A foe's drop in that room: players see the pile and what is on it, never the foe's gear event.
  const g = s.entities[ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 6, r: 1 } }, DM)).events[0].id];
  g.gear.push("Bone dice");
  const r = ok(apply(s, { type: "drop", actor: g.id, item: "Bone dice" }, DM));
  assert.ok(!viewEvents(r.events, s, PAT).some((e) => e.type === "gear"));
  assert.ok(view(s, PAT).map.objects.some((o) => o.contents?.some((x) => x.name === "Bone dice")));
});

test("under the light rule a remembered pile is sent without what is on it", () => {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 10).map((h) => [H.col(h), { t: "stone" }]));
  const s = newGame(5);
  ok(apply(s, { type: "loadMap", map: newMap({ id: "c", name: "Cave", starts: [{ q: 0, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles, light: "dark" }] }) }, DM));
  ok(apply(s, { type: "setting", key: "sight", value: "light" }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  for (const id of ["rogue", "cleric", "wizard"]) delete s.entities[id];
  s.entities.fighter.owner = "pat"; s.entities.fighter.pos = { q: 0, r: 0, z: 0 };
  s.entities.fighter.senses = {};
  ok(apply(s, { type: "setLight", actor: "fighter", item: "torch" }, DM));
  s.entities.fighter.gear.push("Rope");
  ok(apply(s, { type: "drop", actor: "fighter", item: "Rope" }, PAT));
  const pile = s.map.objects.find((o) => o.def === "pile");
  assert.deepEqual(view(s, PAT).map.objects.find((o) => o.id === pile.id).contents, [{ id: "c1", name: "Rope" }]);
  ok(apply(s, { type: "place", actor: "fighter", to: { q: -9, r: 0 } }, DM));     // far off in the dark: out of view
  const sent = view(s, PAT).map.objects.find((o) => o.id === pile.id);
  if (sent) assert.equal(sent.contents, undefined, "remembered, without its contents");
});

test("a lit torch handed over takes its light along; dropped, the light goes and the DM is told it burns on", () => {
  const s = field();
  s.entities.hero.gear.push("Torch");
  ok(apply(s, { type: "setLight", actor: "hero", item: "torch" }, DM));
  ok(apply(s, { type: "setLight", actor: "mage", item: "candle" }, DM));
  refusedClean(s, { type: "pass", actor: "hero", item: "Torch", to: "mage" }, PAT, /already carries a light/);
  ok(apply(s, { type: "setLight", actor: "mage", item: null }, DM));
  const r = ok(apply(s, { type: "pass", actor: "hero", item: "Torch", to: "mage" }, PAT));
  assert.equal(s.entities.hero.light, undefined);
  assert.deepEqual(s.entities.mage.light, { bright: 20, dim: 20, item: "torch" });
  assert.ok(r.events.some((e) => e.type === "light" && e.id === "mage" && e.bright === 20));
  const d = ok(apply(s, { type: "drop", actor: "mage", item: "Torch" }, SAM));
  assert.equal(s.entities.mage.light, undefined);
  const m = d.events.find((e) => e.type === "manual");
  assert.ok(m && m.partial && /burns on/.test(m.text));
  assert.ok(!viewEvents(d.events, s, SAM).some((e) => e.type === "manual"), "for the DM");
});

test("undo: each of pass, drop and pickUp is taken back exactly; labels never name the item", () => {
  const s = field([{ id: "i1", item: "ring-of-protection", attuned: true, equipped: true }]);
  s.entities.hero.gear.push("Rope");
  const h = createHistory();
  ok(apply(s, { type: "equip", actor: "hero", item: "i1", on: false }, PAT));
  const steps = [];
  for (const action of [
    { type: "pass", actor: "hero", item: "i1", to: "mage" },
    { type: "drop", actor: "hero", item: "Rope" },
    () => ({ type: "pickUp", actor: "mage", object: s.map.objects.find((o) => o.def === "pile").id }),
  ]) {
    const a = typeof action === "function" ? action() : action;
    const before = mark(s), was = JSON.stringify(s);
    const res = ok(apply(s, a, DM));
    const step = describeStep(a, res.events, before, s);
    steps.push(step);
    h.record(before, s, step);
    const after = JSON.stringify(s);
    h.undo(s);
    assert.equal(JSON.stringify(s), was, `${a.type} undone`);
    h.redo(s);
    assert.equal(JSON.stringify(s), after, `${a.type} redone`);
  }
  assert.deepEqual(steps.map((x) => x.label), ["Brenna handed something to Tavin", "Brenna dropped something", "Tavin picked something up"]);
  assert.ok(steps.every((x) => x.shown === x.label), "the party sees its own steps");
});

// DEBT C14 (review of #287): a spell from an item, for a user with no spellcasting ability, has save DC 8 + the
// Proficiency Bonus and attack bonus + the Proficiency Bonus (SRD "Spells Cast from Items"; features.js itemSpell).
// No item of the pack gives a save or attack spell without its own DC, so the test lends one for the run.
test("an item's spell for a user with no spellcasting ability: DC 8 + Proficiency Bonus, attack + Proficiency Bonus", () => {
  const wand = CONTENT.items["wand-of-magic-missiles"];
  CONTENT.items["test-wand"] = { ...structuredClone(wand), id: "test-wand", name: "Test Wand",
    activate: [{ ...wand.activate[0], spell: "sacred-flame", level: 0, upTo: undefined }, { ...wand.activate[0], spell: "fire-bolt", level: 0, upTo: undefined }] };
  try {
    const s = field([{ id: "w", item: "test-wand", equipped: true }]);
    const hero = s.entities.hero;
    assert.equal(hero.castAbil, undefined, "a Champion casts no spells");
    assert.equal(hero.prof, 3);
    fight(s);
    const flame = ok(apply(s, { type: "use", actor: "hero", item: "w", which: 0, target: "m1" }, PAT));
    assert.equal(flame.events.find((e) => e.type === "save" && e.id === "m1").dc, 11, "8 + 3");
    for (let i = 0; i < 20 && (current(s) !== "hero" || s.encounter.budget.action < 1); i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    const bolt = ok(apply(s, { type: "use", actor: "hero", item: "w", which: 1, target: "m1" }, PAT));
    const atk = bolt.events.find((e) => e.type === "attack" && e.actor === "hero");
    assert.ok(atk, "Fire Bolt is an attack roll");
    assert.equal(atk.bonus, 3, "+3, the Proficiency Bonus alone");
  } finally { delete CONTENT.items["test-wand"]; }
});

// ---------- review of #291 ----------
// A hidden creature's drop: the pile (and what is on it) is not sent until the party knows who dropped it, on every
// sight rule and both grids; the id of a pile says nothing of other piles.
const SIGHT = ["rooms", "los", "light"];
function place(grid, rule) {
  const s = newGame(5);
  const map = grid === "square" ? squareRoom()
    : newMap({ id: "h", name: "Hall", starts: [{ q: 0, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, light: "bright", tiles: Object.fromEntries(H.range({ q: 0, r: 0 }, 8).map((h) => [H.col(h), { t: "stone" }])) }] });
  ok(apply(s, { type: "loadMap", map }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  if (rule !== "rooms") ok(apply(s, { type: "setting", key: "sight", value: rule }, DM));
  for (const id of ["rogue", "cleric", "wizard"]) delete s.entities[id];
  const at = grid === "square" ? [{ q: 2, r: 2 }, { q: 4, r: 2 }, { q: 2, r: 3 }] : [{ q: 0, r: 0 }, { q: 2, r: 0 }, { q: 0, r: 1 }];
  s.entities.fighter.owner = "pat"; s.entities.fighter.pos = { ...at[0], z: 0 };
  const g = s.entities[ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: at[1], hidden: true }, DM)).events[0].id];
  g.gear.push("Bone dice");
  return { s, g, at };
}
for (const grid of ["hex", "square"]) for (const rule of SIGHT) {
  test(`a hidden creature's drop is not sent until it is known (${grid}, ${rule}); pile ids say nothing of other piles`, () => {
    const { s, g, at } = place(grid, rule);
    const objects = () => JSON.stringify(view(s, PAT).map.objects);
    const before = objects();
    const r = ok(apply(s, { type: "drop", actor: g.id, item: "Bone dice" }, DM));
    const pile = s.map.objects.find((o) => o.def === "pile");
    assert.equal(pile.by, g.id, "marked: dropped unseen");
    assert.equal(objects(), before, "players' map is as it was");
    assert.ok(!JSON.stringify(view(s, PAT)).includes("Bone dice"));
    assert.deepEqual(viewEvents(r.events, s, PAT), []);
    // It can't be named by a player: the answer is the one for no object.
    assert.equal(pile.id, `pile-ground-${at[1].q}_${at[1].r}-h1`, "named from where it lies, not counted");
    const nothing = apply(structuredClone(s), { type: "pickUp", actor: "fighter", object: "no-such" }, PAT);
    assert.deepEqual(apply(structuredClone(s), { type: "pickUp", actor: "fighter", object: pile.id }, PAT), nothing);
    // The party's own drop: its id is what it would have been with no hidden pile.
    s.entities.fighter.gear.push("Rope");
    const fresh = place(grid, rule).s; fresh.entities.fighter.gear.push("Rope");
    ok(apply(s, { type: "drop", actor: "fighter", item: "Rope" }, PAT));
    ok(apply(fresh, { type: "drop", actor: "fighter", item: "Rope" }, PAT));
    const mine = s.map.objects.filter((o) => o.def === "pile").at(-1);
    assert.equal(mine.id, fresh.map.objects.find((o) => o.def === "pile").id);
    assert.deepEqual(view(s, PAT).map.objects.find((o) => o.id === mine.id).contents, [{ id: "c1", name: "Rope" }]);
    // The DM reveals the goblin: the mark comes off and the pile is there for players.
    ok(apply(s, { type: "reveal", actor: g.id, hidden: false }, DM));
    assert.equal(pile.by, undefined);
    assert.equal(pile.id, `pile-ground-${at[1].q}_${at[1].r}`, "now the cell's open pile");
    assert.deepEqual(view(s, PAT).map.objects.find((o) => o.id === pile.id)?.contents, [{ id: "c1", name: "Bone dice" }]);
    void at;
  });
}

test("a hidden creature's drop onto a pile the party sees: the pile stays as it was for players; they can't pick it", () => {
  const { s, g } = place("hex", "rooms");
  s.entities.fighter.gear.push("Rope");
  ok(apply(s, { type: "place", actor: g.id, to: { q: 3, r: 0 } }, DM));
  s.entities.fighter.pos = { q: 2, r: 0, z: 0 };
  ok(apply(s, { type: "drop", actor: "fighter", item: "Rope" }, PAT));
  const pile = s.map.objects.find((o) => o.def === "pile");
  s.entities.fighter.pos = { q: 1, r: 0, z: 0 };
  ok(apply(s, { type: "place", actor: g.id, to: { q: 2, r: 0 } }, DM));
  ok(apply(s, { type: "drop", actor: g.id, item: "Bone dice" }, DM));
  assert.deepEqual(view(s, PAT).map.objects.find((o) => o.id === pile.id).contents, [{ id: "c1", name: "Rope" }]);
  no(apply(structuredClone(s), { type: "pickUp", actor: "fighter", object: pile.id, item: "c2" }, PAT), /not there/);
  const all = ok(apply(s, { type: "pickUp", actor: "fighter", object: pile.id }, PAT));
  assert.deepEqual(gears(all).map((e) => e.item), ["Rope"], "only what they may know of");
  assert.ok(all.events.some((e) => e.type === "object" && e.gone), "the pile they saw is gone");
  const dice = s.map.objects.find((o) => o.def === "pile");
  assert.ok(dice && dice.by === g.id && dice.contents[0].name === "Bone dice", "the dice stay, on a pile of their own, for the DM");
  assert.ok(!view(s, PAT).map.objects.some((o) => o.def === "pile"), "and no pile is sent");
  // The goblin is revealed: the dice become the cell's pile.
  ok(apply(s, { type: "reveal", actor: g.id, hidden: false }, DM));
  assert.equal(view(s, PAT).map.objects.find((o) => o.def === "pile").id, pile.id);
});

// Review of #291, second round: a party drop (and the pick-up after it) where a hidden pile lies is, for a player,
// exactly a drop onto a bare cell: ids, flags, refusals, event order and what the record says.
for (const grid of ["hex", "square"]) for (const rule of SIGHT) {
  test(`a drop where a hidden pile lies is, to players, a drop on a bare cell (${grid}, ${rule})`, () => {
    const runs = [0, 1, 40].map((hidden) => {
      const { s, g, at } = place(grid, rule);
      ok(apply(s, { type: "place", actor: g.id, to: at[2] }, DM));
      g.gear.push(...Array.from({ length: hidden }, (_, i) => `Pebble ${i}`));
      for (let i = 0; i < hidden; i++) ok(apply(s, { type: "drop", actor: g.id, item: `Pebble ${i}` }, DM));
      ok(apply(s, { type: "place", actor: g.id, to: at[1] }, DM));
      assert.equal(s.map.objects.filter((o) => o.def === "pile").length, hidden ? 1 : 0);
      s.entities.fighter.pos = { ...at[2], z: 0 };
      s.entities.fighter.gear.push(...Array.from({ length: 41 }, (_, i) => `Coin ${i}`));
      const out = [];
      const see = (r) => out.push(r.ok ? viewEvents(r.events, s, PAT) : r, JSON.stringify(view(s, PAT).map.objects), JSON.stringify(view(s, PAT).entities?.fighter?.gear ?? null));
      for (let i = 0; i < 41; i++) see(apply(s, { type: "drop", actor: "fighter", item: `Coin ${i}` }, PAT));
      const mine = s.map.objects.find((o) => o.def === "pile" && !o.by);
      for (let i = 0; i < 40; i++) see(apply(s, { type: "pickUp", actor: "fighter", object: mine?.id ?? "x", item: `c${i + 1}` }, PAT));
      out.push(JSON.stringify(viewEvents(s.timeline, s, PAT).filter((e) => ["gear", "object"].includes(e.type))));
      return out;
    });
    assert.deepEqual(runs[1], runs[0], "one hidden thing there changes nothing players see");
    assert.deepEqual(runs[2], runs[0], "nor forty");
    assert.ok(JSON.stringify(runs[0]).includes('"placed":true') && JSON.stringify(runs[0]).includes('"gone":true'));
    assert.ok(JSON.stringify(runs[0]).includes("40 things lie there already"), "the open pile's own room");
  });
}

test("pickUp through a wall is refused, as pass is: on squares (the stub wall) and on hexes", () => {
  const s = newGame(14);
  ok(apply(s, { type: "loadMap", map: squareRoom() }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  [["fighter", 2, 6], ["cleric", 3, 6], ["rogue", 0, 14], ["wizard", 2, 14]].forEach(([id, q, r]) => { s.entities[id].pos = { q, r, z: 0 }; });
  s.entities.cleric.gear.push("Rope");
  no(apply(structuredClone(s), { type: "pass", actor: "cleric", item: "Rope", to: "fighter" }, DM), /wall/);
  ok(apply(s, { type: "drop", actor: "cleric", item: "Rope" }, DM));
  const pile = s.map.objects.find((o) => o.def === "pile");
  refusedClean(s, { type: "pickUp", actor: "fighter", object: pile.id }, DM, /too far/);
  assert.deepEqual(pickUpsFor(s, s.entities.fighter), []);
  s.entities.fighter.pos = { q: 3, r: 5, z: 0 };            // round the end of the stub
  ok(apply(s, { type: "pickUp", actor: "fighter", object: pile.id }, DM));
  // Hexes: a wall on the edge between (0,0) and (1,0).
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 4).map((h) => [H.col(h), { t: "stone" }]));
  const t = newGame(5);
  ok(apply(t, { type: "loadMap", map: newMap({ id: "w", name: "W", starts: [{ q: -3, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }],
    walls: [{ id: "w1", level: "ground", a: [2.5, 1.4433756729740645], b: [2.5, -1.4433756729740645], kind: "wall" }],
    objects: [{ id: "loot", def: "pile", level: "ground", at: { q: 1, r: 0 }, state: "lying", contents: [{ id: "c1", name: "Rope" }] }] }) }, DM));
  t.entities.fighter.pos = { q: 0, r: 0, z: 0 };
  refusedClean(t, { type: "pickUp", actor: "fighter", object: "loot" }, DM, /too far/);
  t.entities.fighter.pos = { q: 1, r: -1, z: 0 };
  ok(apply(t, { type: "pickUp", actor: "fighter", object: "loot" }, DM));
});

test("picking a pile to nothing: the last gear event keeps its pile and the pile's going reaches players who saw it", () => {
  const s = field();
  s.entities.hero.gear.push("Rope");
  ok(apply(s, { type: "drop", actor: "hero", item: "Rope" }, PAT));
  const pile = s.map.objects.find((o) => o.def === "pile");
  const r = ok(apply(s, { type: "pickUp", actor: "mage", object: pile.id }, SAM));
  const told = viewEvents(r.events, s, PAT);
  assert.equal(told.find((e) => e.type === "gear").object, pile.id);
  const gone = told.find((e) => e.type === "object");
  assert.ok(gone && gone.gone && gone.seen === undefined, "the pile went, and `seen` is not sent");
  const later = viewEvents(s.timeline, s, SAM).filter((e) => e.type === "object" && e.object === pile.id);
  assert.equal(later.length, 2, "from the record too: dropped and gone");
});
