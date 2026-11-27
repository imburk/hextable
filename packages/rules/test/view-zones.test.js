// Players are sent the lasting zones they could see (#842; docs/specs/hidden-information.md, "Lasting zones"): each zone's public shape
// (view-fields.js, ZONE_FIELDS), and never how it works, whose numbers it runs on, or who it spares. Built on the crypt of sight-views.test.js:
// a hall to the west (a region the party stands in) and a vault to the east behind a wall (a region that is not revealed).
import assert from "node:assert/strict";
import { test } from "node:test";
import { SPELLS } from "../src/content/index.js";
import { derive } from "../src/derive.js";
import { apply, current, makeEntity } from "../src/engine.js";
import * as H from "../src/hex.js";
import { newMap } from "../src/map.js";
import { applyPatch, diff, snapshot } from "../src/patch.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";
import { partyView } from "../src/vision.js";
import { ZONE_FIELDS } from "../src/view-fields.js";

const DM = { role: "dm", userId: "dm" }, PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const at = (q, r, z = 0) => ({ q, r, z });
const json = (x) => JSON.stringify(x);
const TILES = H.range({ q: 0, r: 0 }, 8).filter((h) => Math.abs(h.r) <= 5);
const westOf = (h) => 5 * (h.q + h.r / 2) < 12.5;
const A = { str: 10, dex: 14, con: 14, int: 16, wis: 16, cha: 10 };
const SHEET = (name, cls) => ({ name, class: cls, level: 9, abilities: A, skills: [], weapons: ["dagger"],
  spells: ["moonbeam", "spike-growth", "flaming-sphere", "spirit-guardians", "web", "magic-circle", "conjure-animals", "fire-bolt"] });

// The party in the hall in a fight with a goblin, a wizard and a cleric to cast, and `casters` of the foes' side (`{ id: { at, cls, hidden } }`) made in the fight (a creature the DM hides is hidden once the fight is over: `vanish`). `rule` is the table's sight rule.
function table({ rule = "rooms", casters = {}, fight = true, arena = { center: at(-3, 0), radius: 6 } } = {}) {
  const tiles = Object.fromEntries(TILES.map((h) => [H.col(h), { t: "stone" }]));
  const map = newMap({ id: "crypt", name: "The crypt", starts: [{ q: -6, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }],
    walls: [{ id: "wn", level: "ground", a: [12.5, -100], b: [12.5, -2.9], kind: "wall" }, { id: "ws", level: "ground", a: [12.5, 2.9], b: [12.5, 100], kind: "wall" }],
    regions: [{ id: "hall", name: "The hall", level: "ground", hexes: TILES.filter(westOf).map(H.col) },
      { id: "vault", name: "The vault", level: "ground", hexes: TILES.filter((h) => !westOf(h)).map(H.col) }] });
  const s = newGame(7);
  ok(apply(s, { type: "loadMap", map }, DM));
  ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const [id, q, r] of [["fighter", -5, 0], ["rogue", -6, 1], ["cleric", -6, 0], ["wizard", -5, -1]]) s.entities[id].pos = at(q, r);
  for (const id of ["wizard", "cleric"]) {
    const e = s.entities[id];
    e.spells = [...new Set([...e.spells, "moonbeam", "spike-growth", "flaming-sphere", "spirit-guardians", "web", "magic-circle", "conjure-animals"])];
    for (const l of [2, 3, 5]) { e.slots[l] = 4; e.slotsMax[l] = 4; }
  }
  if (rule !== "rooms") ok(apply(s, { type: "setting", key: "sight", value: rule }, DM));
  for (const [id, c] of Object.entries(casters)) foe(s, id, c.at, { cls: c.cls });
  if (!fight) return s;
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: at(-7, 3), name: "Sentry" }, DM));
  ok(apply(s, { type: "startEncounter", ...arena }, DM));
  return s;
}
// The fight over, the DM hides a creature: it was seen casting, and is not seen now.
const vanish = (s, id) => { if (s.encounter) ok(apply(s, { type: "endEncounter" }, DM)); ok(apply(s, { type: "reveal", actor: id, hidden: true }, DM)); };
// A caster of the foes' side at a place.
function foe(s, id, pos, { cls = "wizard", name = id } = {}) {
  const sheet = SHEET(name, cls);
  s.entities[id] = makeEntity(derive(sheet).record, { id, kind: "npc", side: "foe", pos: { ...pos, z: 0 } });
  s.entities[id].sheet = structuredClone(sheet);
  return s.entities[id];
}
// Pass turns until it is `id`'s.
const turn = (s, id) => { if (!s.encounter?.order.some((o) => o.id === id)) return;
  for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
// A table under line of sight with a caster of the foes' side behind the wall, in the fight: the party do not see it (`classify` says hidden).
const BEHIND = at(4, 3);
const losTable = (extra = {}) => {
  const s = table({ rule: "los", casters: { mage: { at: BEHIND, ...extra } }, arena: { center: at(0, 0), radius: 9 } });
  assert.ok(!partyView(s).creatures.has("mage"), "the party do not see the mage behind the wall");
  return s;
};
const cast = (s, actor, spell, extra = {}) => { turn(s, actor); return apply(s, { type: "cast", actor, spell, slot: SPELLS[spell].level, ...extra }, DM); };
const zones = (s, who = PAT) => view(s, who).effects.filter((fx) => fx.zone);

test("a party caster's Moonbeam is sent as its shape: cells, origin, area and a tint, and nothing of how it works", () => {
  const s = table();
  const r = ok(cast(s, "wizard", "moonbeam", { hex: at(-3, 0) }));
  const [fx] = zones(s);
  assert.equal(fx.name, "Moonbeam");
  assert.equal(fx.source, "wizard");
  assert.deepEqual(fx.zone.area, { shape: "cylinder", size: 5, height: 40 });
  assert.deepEqual(fx.zone.hexes, [...s.effects[0].zone.hexes], "the laid-out cells, as they are");
  assert.deepEqual(fx.zone.origin, { q: -3, r: 0, z: 0 });
  assert.equal(fx.zone.look, "radiant");
  for (const k of ["steps", "src", "last", "spare", "budget", "spent", "movedOn", "once", "foes"]) assert.ok(!Object.hasOwn(fx.zone, k), k);
  assert.ok(Object.keys(fx.zone).every((k) => ["area", "hexes", "origin", "body", "ward", "move", "look"].includes(k)), `only listed fields: ${Object.keys(fx.zone)}`);
  assert.ok(r.events.length);
});

test("every field of a zone the engine makes is classified in view-fields.js, and a withheld one is never sent", () => {
  const s = table();
  const made = [];
  for (const [who, spell, extra] of [["wizard", "moonbeam", { hex: at(-3, 0) }], ["cleric", "spirit-guardians", { choice: "radiant", spare: ["fighter"] }], ["wizard", "flaming-sphere", { hex: at(-2, 3) }],
    ["wizard", "conjure-animals", { hex: at(-3, 3) }], ["wizard", "magic-circle", { hex: at(-4, -1), choice: ["fiend"] }], ["wizard", "web", { hex: at(-1, -3) }]]) {
    const r = cast(s, who, spell, extra);
    if (!r.ok) continue;
    for (const fx of s.effects.filter((x) => x.zone)) made.push(...Object.keys(fx.zone));
    for (const fx of zones(s)) for (const k of Object.keys(fx.zone)) assert.ok(["area", "hexes", "origin", "body", "ward", "move", "look"].includes(k), `${spell}: ${k} is sent`);
    for (const e of Object.values(s.entities)) e.hp = e.maxHp;
    ok(apply(s, { type: "endEffect", effect: s.effects.at(-1).id }, DM));
  }
  assert.ok(made.length > 8);
  for (const k of new Set(made)) assert.ok(Object.hasOwn(ZONE_FIELDS, k), `${k} is a field of a zone and no table classifies it`);
});

test("the tint is the first kind of damage the zone deals, and neutral for a zone that deals none", () => {
  const s = table();
  ok(cast(s, "wizard", "flaming-sphere", { hex: at(-2, 3) }));
  assert.equal(zones(s)[0].zone.look, "fire");
  assert.equal(zones(s)[0].zone.move, 30, "how far it can be rolled is sent, for the roll");
  const t = table();
  ok(cast(t, "wizard", "web", { hex: at(-1, -3) }));
  assert.equal(zones(t)[0].zone.look, "neutral");
});

test("a zone that is a pack sent its own cells (`body`) beside the cells it covers, and Magic Circle's runes (`ward`)", () => {
  const s = table();
  ok(cast(s, "wizard", "conjure-animals", { hex: at(-3, 3) }));
  const z = zones(s)[0].zone, own = s.effects.find((x) => x.zone).zone;
  assert.deepEqual(z.body, own.body);
  assert.equal(z.area.space, "large");
  assert.ok(!("with" in z) && !("seen" in z) && !("foes" in z));
  const t = table({ fight: false });
  ok(cast(t, "wizard", "magic-circle", { hex: at(-4, -1), choice: ["fiend", "undead"] }));
  assert.deepEqual(zones(t)[0].zone.ward, { types: ["fiend", "undead"], reverse: false });
});

test("an Emanation is sent as the cells it covers now, never `follows`, and moves with a caster the party knows of", () => {
  const s = table();
  ok(cast(s, "cleric", "spirit-guardians", { choice: "radiant", spare: ["fighter"] }));
  const before = zones(s)[0];
  assert.ok(!("follows" in before.zone));
  assert.ok(before.zone.hexes.includes(H.col(s.entities.cleric.pos)));
  assert.ok(!json(view(s, PAT)).includes('"spare"'), "who it spares is not sent");
  s.entities.cleric.pos = at(-5, 3);
  const after = zones(s)[0];
  assert.notDeepEqual(after.zone.hexes, before.zone.hexes);
  assert.ok(after.zone.hexes.includes("-5,3"));
  // and it reaches the client as a patch like any field
  const was = view(s, PAT);
  s.entities.cleric.pos = at(-4, 3);
  const now = view(s, PAT), p = diff(snapshot(was), snapshot(now), now);
  assert.deepEqual(applyPatch(structuredClone(was), p).effects, now.effects);
  assert.ok(p.effects);
});

test("an Emanation round a caster the DM has hidden is not sent, and its cells do not follow it as it walks", () => {
  const s = table({ casters: { mage: { at: at(0, 2), cls: "cleric" } } }), mage = s.entities.mage;
  ok(cast(s, "mage", "spirit-guardians", { choice: "radiant", spare: [] }));
  assert.equal(zones(s).length, 1, "seen, the zone is drawn");
  vanish(s, "mage");
  const none = json(view(s, PAT).effects);
  assert.equal(s.effects.length, 1);
  assert.deepEqual(zones(s), []);
  for (const p of [at(-1, 2), at(-1, 0), at(-2, 1)]) { mage.pos = p; assert.equal(json(view(s, PAT).effects), none, `still nothing as it stands at ${p.q},${p.r}`); }
  assert.ok(!json(view(s, PAT)).includes('"mage"'));
  // the same caster known: the zone is sent, and moves with it
  ok(apply(s, { type: "reveal", actor: "mage", hidden: false }, DM));
  assert.equal(zones(s).length, 1);
  assert.equal(zones(s)[0].source, "mage");
});

test("a Moonbeam cast by a caster the party does not know of is sent as a zone with no source, no concentration, no end, and an id of its own", () => {
  const s = losTable(), a = s.entities.mage;
  ok(cast(s, "mage", "moonbeam", { hex: at(-3, 0) }));
  const [fx] = zones(s);
  assert.equal(fx.source, undefined);
  assert.deepEqual([fx.id, fx.conc, fx.lasts, fx.until, fx.parts], ["z1", false, null, null, []]);
  assert.equal(fx.zone.look, "radiant");
  const text = json(view(s, PAT));
  assert.ok(!text.includes(`"${s.effects[0].id}"`) && !text.includes('"mage"') && !text.includes(`"${a.name}"`), "nothing names the caster or the effect's own id");
});

test("Spike Growth is sent only to the caster's side: a party caster's is drawn, a foe's, seen or hidden, is not", () => {
  const s = table();
  ok(cast(s, "wizard", "spike-growth", { hex: at(-3, 0) }));
  assert.equal(zones(s).length, 1);
  const t = table({ casters: { mage: { at: at(-3, 3) } } });
  ok(cast(t, "mage", "spike-growth", { hex: at(-3, 0) }));
  assert.equal(t.effects.length, 1);
    assert.equal(zones(t).length, 0, "camouflaged to look natural");
  const u = losTable();
  ok(cast(u, "mage", "spike-growth", { hex: at(-3, 0) }));
  assert.equal(u.effects.length, 1);
  assert.equal(zones(u).length, 0, "a hidden foe's too");
  // Moonbeam by the same foe is drawn: it is not camouflaged
  const v = table({ casters: { mage: { at: at(-3, 3) } } });
  ok(cast(v, "mage", "moonbeam", { hex: at(-3, 0) }));
  assert.equal(zones(v).length, 1);
});

test("a zone whose `spare` names a creature the party does not know of is sent without any mention of it", () => {
  const s = table({ casters: { ghost: { at: at(2, 3) } } }), ghost = s.entities.ghost;
  vanish(s, "ghost");
  ok(apply(s, { type: "startEncounter", center: at(-5, 0), radius: 5 }, DM));
  ok(cast(s, "cleric", "spirit-guardians", { choice: "radiant", spare: ["ghost", "fighter"] }));
  assert.ok(s.effects.find((x) => x.zone).zone.spare.includes("ghost"));
  const text = json(view(s, PAT));
  assert.ok(!text.includes("ghost") && !text.includes(ghost.name), "no id or name of it");
  assert.equal(zones(s).length, 1);
});

test("a zone in a region not yet revealed is not sent until the region is; one that reaches into it is cut to what is sent", () => {
  const s = table();
  const vault = H.col({ q: 5, r: 0 });
  assert.ok(s.map.regions.find((r) => r.id === "vault").hexes.includes(vault) && !s.map.regions.find((r) => r.id === "vault").revealed);
  ok(cast(s, "wizard", "moonbeam", { hex: at(5, 0) }));
  assert.equal(s.effects.length, 1);
  assert.equal(zones(s).length, 0, "a zone in the unexplored vault is not sent");
  assert.ok(!json(view(s, PAT)).includes('"zone"'), "nothing of it in the view: the party's own effect is there as it always was, with no zone");
  const edge = table();
  ok(cast(edge, "wizard", "web", { hex: at(1, 0) }));
  const hall = new Set(edge.map.regions.find((r) => r.id === "hall").hexes);
  const sent = zones(edge)[0].zone.hexes;
  assert.ok(sent.length && sent.length < edge.effects[0].zone.hexes.length, "cut");
  assert.ok(sent.every((k) => hall.has(k)));
  assert.ok(!sent.includes(H.col({ q: 5, r: 0 })));
  ok(apply(edge, { type: "revealRegion", region: "vault" }, DM));
  assert.equal(zones(edge)[0].zone.hexes.length, edge.effects[0].zone.hexes.length, "all of it once the vault is revealed");
});

test("under line of sight only the cells the party sees now are sent: a zone behind a wall is not", () => {
  const s = table({ rule: "los" });
  ok(cast(s, "wizard", "moonbeam", { hex: at(5, 4) }));
  assert.equal(zones(s).length, 0, "behind the wall nothing is seen of it");
  ok(cast(s, "cleric", "web", { hex: at(5, 0) }));
  assert.equal(zones(s).length, 1, "through the gap in the wall it is");
  assert.equal(zones(s)[0].source, "cleric");
});

test("a zone rolled to a new place tells players `zoneMoved` with from and to; the mover only where they know of it", () => {
  const s = table();
  ok(cast(s, "wizard", "flaming-sphere", { hex: at(-2, 3) }));
  const id = s.effects[0].id;
  const r = ok(apply(s, { type: "moveZone", actor: "wizard", to: at(-2, 4) }, DM));
  const ev = viewEvents(r.events, s, PAT).find((e) => e.type === "zoneMoved");
  assert.deepEqual(ev, { by: "wizard", from: { q: -2, r: 3 }, fx: id, name: "Flaming Sphere", to: { q: -2, r: 4 }, type: "zoneMoved" });
  assert.notDeepEqual(zones(s)[0].zone.hexes, [...s.effects[0].zone.hexes].slice(0, 0));
  // a hidden caster's: no `by`, and the id players are given of the zone
  const t = losTable(), mage = t.entities.mage;
  ok(cast(t, "mage", "flaming-sphere", { hex: at(-2, 3) }));
  const m = ok(apply(t, { type: "moveZone", actor: "mage", to: at(-2, 4) }, DM));
  const told = viewEvents(m.events, t, PAT).find((e) => e.type === "zoneMoved");
  assert.deepEqual(told, { fx: "z1", from: { q: -2, r: 3 }, name: "Flaming Sphere", to: { q: -2, r: 4 }, type: "zoneMoved" });
  assert.equal(zones(t)[0].id, "z1");
  assert.ok(!json([told, view(t, PAT)]).includes(mage.id) || !json([told, view(t, PAT)]).includes('"mage"'));
  // a zone they are not sent is not told of when it moves
  const u = table();
  ok(cast(u, "wizard", "flaming-sphere", { hex: at(5, 0) }));
  const w = ok(apply(u, { type: "moveZone", actor: "wizard", to: at(5, 1) }, DM));
  assert.equal(viewEvents(w.events, u, PAT).filter((e) => e.type === "zoneMoved").length, 0);
});

test("a zone going off on a creature is told by the damage and the save, as ever; the engine's `zone` event is not sent to players", () => {
  const s = table();
  ok(cast(s, "wizard", "moonbeam", { hex: at(-3, 0) }));
  turn(s, "rogue");
  const r = ok(apply(s, { type: "move", actor: "rogue", to: at(-3, 0) }, DM));
  assert.ok(r.events.some((e) => e.type === "zone"), "the zone went off");
  assert.ok(!viewEvents(r.events, s, PAT).some((e) => e.type === "zone"));
});

test("a zone's end is not told by a leftover: after the effect ends, the view has no zone", () => {
  const s = table();
  ok(cast(s, "wizard", "moonbeam", { hex: at(-3, 0) }));
  ok(apply(s, { type: "endEffect", effect: s.effects[0].id }, DM));
  assert.equal(zones(s).length, 0);
});

test("the DM is sent the zone whole", () => {
  const s = table();
  ok(cast(s, "wizard", "moonbeam", { hex: at(-3, 0) }));
  const fx = view(s, DM).effects[0];
  assert.ok(fx.zone.steps && fx.zone.src && fx.zone.last);
  void current;
});

test("a Magic Circle of a caster the party does not know of is not sent (the engine does not enforce it against them); one of a caster they know is, with its runes", () => {
  const circle = () => ({ type: "cast", actor: "mage", spell: "magic-circle", slot: 3, hex: at(1, 2), choice: ["fiend"] });
  const known = table({ fight: false, casters: { mage: { at: at(1, 2) } } });
  ok(apply(known, circle(), DM));
  assert.equal(zones(known).length, 1);
  assert.deepEqual(zones(known)[0].zone.ward, { types: ["fiend"], reverse: false });
  ok(apply(known, { type: "reveal", actor: "mage", hidden: true }, DM));
  assert.equal(known.effects.length, 1);
  assert.deepEqual(zones(known), [], "the caster hidden again: no circle");
});
