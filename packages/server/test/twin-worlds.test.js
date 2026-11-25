// The hand-made "twin" tests of the rules and server suites, as one-liners on the harness (twin.js): the same script in two worlds that
// differ only in a hidden thing, through the table server, and every player sent the same bytes in both. Ported from
// rules/test/monster-area-choose.test.js (creatures), server/test/sight.test.js (sight), server/test/travel-view.test.js (travel W4),
// server/test/shops.test.js (hidden lines and stalls), server/test/packs.test.js (homebrew monsters) and rules/test/grapple*.test.js (grapple).
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import * as H from "../../rules/src/hex.js";
import { newMap } from "../../rules/src/map.js";
import { CONTENT } from "../../rules/src/content/index.js";
import { riverPack } from "../../rules/test/fixtures/world-pack.js";
import { createAssets } from "../src/assets.js";
import { worldAssets } from "../src/tables.js";
import { current, makeEntity } from "../../rules/src/engine.js";
import { derive } from "../../rules/src/derive.js";
import { startEffect } from "../../rules/src/durations.js";
import { twin } from "./twin.js";

const dirs = [];
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
const turnOf = (w, id) => { for (let i = 0; i < 30 && current(w.state) !== id; i++) w.must({ type: "endTurn", actor: current(w.state) }); };
// What a hidden creature costs a world that has none: the ids and the fight's number come from one counter (DEBT T11, issue #630),
// so the plain world makes one and drops it, and the twin tests what else a hidden creature does.
const burn = (w, at = { q: 8, r: -6 }) => { w.must({ type: "spawn", monster: "goblin-warrior", at, name: "Burnt", hidden: true }); delete w.state.entities[byName(w, "Burnt").id]; };
const byName = (w, name) => Object.values(w.state.entities).find((e) => e.name === name);

// ---- creatures: a hidden creature in the area of a player's area action (was monster-area-choose.test.js) ----
const BLAST = { id: "blast", name: "Blast", target: { area: { shape: "emanation", size: 30, exceptCaster: true, choose: 2 } },
  effects: [{ save: "dex", dc: 30, half: false, onFail: [{ damage: "1d4", type: "fire" }] }] };
test("creatures: a player's area action with `choose` is told and sent the same with and without a hidden creature in the area", () => {
  const goblin = (w, at, name) => { w.must({ type: "spawn", monster: "goblin-warrior", at, name }); const g = byName(w, name); Object.assign(g, { hp: 500, maxHp: 500, saveBonus: { dex: -100 } }); return g.id; };
  twin({
    players: ["Pat"],
    setup(w) {
      const s = w.state;
      for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
      for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
      w.must({ type: "setting", key: "autoEngage", value: false });
      for (const [id, q, r] of [["fighter", 0, 0], ["rogue", -8, 0], ["cleric", -8, 1], ["wizard", -8, 2]]) w.must({ type: "place", actor: id, to: { q, r } });
      Object.assign(s.entities.fighter, { owner: w.ids.Pat, ownerName: "Pat", hp: 500, maxHp: 500, actions: [BLAST] });
      goblin(w, { q: 2, r: 0 }, "A"); goblin(w, { q: 3, r: 0 }, "B");
      w.putIn();                                                  // the hidden creature exists before the fight, which leaves it outside the arena
      w.must({ type: "startEncounter", center: { q: 0, r: 0 }, radius: 3 });
      turnOf(w, "fighter");
    },
    steps: [
      { by: "Pat", act: { type: "act", actor: "fighter", action: "blast", targets: ["nobody"] } },     // refused, the same words
      { by: "Pat", act: { type: "act", actor: "fighter", action: "blast" } },                           // two seen in the area: no pick needed
      { by: "Pat", act: { type: "endTurn", actor: "fighter" } },
    ],
  }, { hide: (w) => { w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 5, r: 0 }, name: "Ghost", hidden: true }); Object.assign(byName(w, "Ghost"), { hp: 500, maxHp: 500, saveBonus: { dex: -100 } }); }, plain: burn });
});

// ---- Death Ward (#726 job 3): a hidden creature under the ward, caught by a player's area action ----
test("death ward: damage the DM does to a hidden warded creature, enough to drop it to 0 Hit Points, is sent the same as with no creature there", () => {
  const WARD = { target: null, modifier: { on: "hp.zero", op: "min", value: 1, uses: 1 } };
  twin({
    players: ["Pat"],
    setup(w) {
      const s = w.state;
      for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
      for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
      w.must({ type: "setting", key: "autoEngage", value: false });
      for (const [id, q, r] of [["fighter", 0, 0], ["rogue", -8, 0], ["cleric", -8, 1], ["wizard", -8, 2]]) w.must({ type: "place", actor: id, to: { q, r } });
      Object.assign(s.entities.fighter, { owner: w.ids.Pat, ownerName: "Pat", hp: 500, maxHp: 500, actions: [{ ...BLAST, target: { area: { shape: "emanation", size: 30, exceptCaster: true } } }] });
      w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 2, r: 0 }, name: "Seen" });
      Object.assign(byName(w, "Seen"), { hp: 500, maxHp: 500, saveBonus: { dex: -100 } });
      w.putIn();                                                  // the hidden creature exists before the fight, which leaves it outside the arena
      w.must({ type: "startEncounter", center: { q: 0, r: 0 }, radius: 3 });
      turnOf(w, "fighter");
    },
    steps: [
      (w) => {                                                    // a player's own hostile area would reveal it (by design), so the DM does the harm
        const g = byName(w, "Ghost");
        if (!g) return;
        w.must({ type: "harm", actor: g.id, amount: 50, dtype: "fire" });
        assert.equal([g.hp, g.dead, w.state.effects.some((fx) => fx.parts.some((p) => !p.ended))].join(), "1,false,false", "the ward held and ended");
      },
      { by: "Pat", act: { type: "endTurn", actor: "fighter" } },
    ],
  }, {
    hide: (w) => {
      w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 5, r: 0 }, name: "Ghost", hidden: true });
      const g = byName(w, "Ghost");
      Object.assign(g, { hp: 1, maxHp: 7, saveBonus: { dex: -100 } });
      const fx = startEffect(w.state, { name: "Death Ward", spell: "death-ward", source: g.id, duration: "8 hours" });
      fx.parts.push({ ...WARD, target: g.id });
    },
    plain: (w) => { burn(w, { q: 5, r: 0 }); w.state.seq++; },
  });
});

// ---- Revivify (#726 job 6): a hidden body, and a player's cast of a spell aimed at the dead ----
test("revivify: a hidden dead creature beside a player's Revivify of a seen body, and an aim at the hidden body, is sent the same as with no creature there", () => {
  twin({
    players: ["Pat"],
    setup(w) {
      const s = w.state;
      for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
      for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
      w.must({ type: "setting", key: "autoEngage", value: false });
      for (const [id, q, r] of [["fighter", -8, 0], ["rogue", 1, 0], ["cleric", 0, 0], ["wizard", -8, 2]]) w.must({ type: "place", actor: id, to: { q, r } });
      Object.assign(s.entities.cleric, { owner: w.ids.Pat, ownerName: "Pat", level: 13, spells: [...new Set([...(s.entities.cleric.spells ?? []), "revivify"])] });
      s.entities.cleric.slots = { ...s.entities.cleric.slots, 3: 3 };
      s.entities.cleric.slotsMax = { ...s.entities.cleric.slotsMax, 3: 3 };
      w.must({ type: "harm", actor: "rogue", amount: 999, dtype: "necrotic" });
      assert.equal(s.entities.rogue.dead, true);
    },
    steps: [
      { by: "Pat", act: (w) => ({ type: "cast", actor: "cleric", spell: "revivify", target: byName(w, "Ghost")?.id ?? "m99" }), allowError: true },       // refused the same words: nobody the party knows of
      { by: "Pat", act: { type: "cast", actor: "cleric", spell: "revivify", target: "rogue" } },
      { by: "Pat", act: { type: "cast", actor: "cleric", spell: "revivify", target: "rogue" }, allowError: true },                                           // up again: refused
    ],
  }, {
    hide: (w) => {
      w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 1 }, name: "Ghost", hidden: true });
      w.must({ type: "harm", actor: byName(w, "Ghost").id, amount: 999, dtype: "necrotic" });
      assert.equal(byName(w, "Ghost").dead, true);
      assert.ok(Number.isFinite(byName(w, "Ghost").diedAt));
    },
    plain: (w) => burn(w, { q: 1, r: 1 }),
  });
});

test("revivify: a seen body that died over a minute ago (the old-body note) is sent the same with and without a hidden creature", () => {
  twin({
    players: ["Pat"],
    setup(w) {
      const s = w.state;
      for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
      for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
      w.must({ type: "setting", key: "autoEngage", value: false });
      for (const [id, q, r] of [["fighter", -8, 0], ["rogue", 1, 0], ["cleric", 0, 0], ["wizard", -8, 2]]) w.must({ type: "place", actor: id, to: { q, r } });
      Object.assign(s.entities.cleric, { owner: w.ids.Pat, ownerName: "Pat", level: 13, spells: [...new Set([...(s.entities.cleric.spells ?? []), "revivify"])] });
      s.entities.cleric.slots = { ...s.entities.cleric.slots, 3: 3 };
      s.entities.cleric.slotsMax = { ...s.entities.cleric.slotsMax, 3: 3 };
      w.must({ type: "harm", actor: "rogue", amount: 999, dtype: "necrotic" });
      assert.equal(s.entities.rogue.dead, true);
      w.must({ type: "advanceTime", minutes: 2 });
    },
    steps: [
      { by: "Pat", act: { type: "cast", actor: "cleric", spell: "revivify", target: "rogue" } },     // slot spent, nothing happens, the note
    ],
  }, {
    hide: (w) => {
      w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 1 }, name: "Ghost", hidden: true });
      w.must({ type: "harm", actor: byName(w, "Ghost").id, amount: 999, dtype: "necrotic" });
      assert.equal(byName(w, "Ghost").dead, true);
    },
    plain: (w) => burn(w, { q: 1, r: 1 }),
  });
});

// ---- grapple: a hidden creature beside a player's grapple and drag (was the hidden-grappler and drag cases of grapple*.test.js) ----
test("grapple: grappling and dragging a seen creature sends the same with and without a hidden one beside the path", () => {
  const { plain } = twin({
    players: ["Pat"],
    setup(w) {
      const s = w.state;
      for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
      for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
      w.must({ type: "setting", key: "autoEngage", value: false });
      for (const [id, q, r] of [["fighter", 0, 0], ["rogue", -8, 0], ["cleric", -8, 1], ["wizard", -8, 2]]) w.must({ type: "place", actor: id, to: { q, r } });
      Object.assign(s.entities.fighter, { owner: w.ids.Pat, ownerName: "Pat", hp: 500, maxHp: 500 });
      s.entities.fighter.attacks = [{ id: "unarmed-strike", name: "Unarmed Strike", type: "melee", bonus: 40, damage: "+1", dtype: "bludgeoning", reach: 5, abil: "str", dc: 12 }];
      w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 }, name: "Seen" });
      const g = byName(w, "Seen");
      Object.assign(g, { hp: 500, maxHp: 500, ac: 1, saveBonus: { str: -100, dex: -100 } });
      w.putIn();
      w.must({ type: "startEncounter", center: { q: 0, r: 0 }, radius: 4 });
      turnOf(w, "fighter");
    },
    steps: [
      { by: "Pat", act: (w) => ({ type: "attack", actor: "fighter", attack: "unarmed-strike", option: "grapple", target: byName(w, "Seen").id }) },
      { by: "Pat", act: { type: "move", actor: "fighter", to: { q: -2, r: 0 } } },
      { by: "Pat", act: { type: "endTurn", actor: "fighter" } },
    ],
  }, { hide: (w) => { w.must({ type: "spawn", monster: "goblin-warrior", at: { q: -5, r: 2 }, name: "Lurker", hidden: true }); }, plain: burn });
  assert.ok(JSON.stringify(plain.raw.Pat).includes("grappled"), "the script did grapple the goblin");
  assert.ok(!plain.raw.Pat.some((m) => m.t === "error"), "and nothing was refused");
});

// ---- sight/regions: a creature behind a wall (was sight.test.js) ----
function wallMap() {
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 7).map((h) => [H.col(h), { t: "stone" }]));
  return newMap({ id: "w", name: "Wall", starts: [{ q: -3, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }], walls: [{ id: "w", level: "ground", a: [2.5, -100], b: [2.5, -2], kind: "wall" }] });
}
test("sight: a goblin out of sight behind a wall, moving, with undo and redo, changes nothing any player is sent", () => {
  const { plain, hidden } = twin({
    setup(w) {
      for (const [n, id] of [["Pat", "fighter"], ["Sam", "cleric"]]) w.state.entities[id].owner = w.ids[n];
      w.must({ type: "loadMap", map: wallMap() });
      w.must({ type: "setting", key: "autoEngage", value: false });
      w.must({ type: "setting", key: "sight", value: "los" });
    },
    steps: [
      { by: "dm", allowError: true, act: (w) => ({ type: "move", actor: byName(w, "Grishnak")?.id ?? "none", to: { q: 5, r: -4 } }) },
      { by: "dm", act: { type: "advanceTime", minutes: 1 } },
      { by: "dm", send: { t: "undo" } }, { by: "dm", send: { t: "redo" } }, { by: "dm", send: { t: "undo" } }, { by: "dm", send: { t: "undo" } },
      { by: "Pat", send: { t: "history", limit: 200 } },
      { by: "Sam", act: { type: "say", as: "cleric", text: "Anything out there?" } },
    ],
  }, { hide: (w) => w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 4, r: -3 }, name: "Grishnak" }), plain: (w) => burn(w, { q: 6, r: 1 }) });
  assert.ok(!JSON.stringify(plain.raw.Pat).includes("Grishnak"));
  assert.ok(JSON.stringify(hidden.raw.dm).includes("Grishnak"), "the goblin is there, for the DM");
});

// ---- travel W4: a place nobody has been to, in a world with a split party (was travel-view.test.js) ----
const SECRET = "Hidden Vault";
test("travel: a place nobody has been to, in a world with a split party, is in nothing any player is sent", () => {
  const dir = mkdtempSync(join(tmpdir(), "hextable-twin-"));
  dirs.push(dir);
  const { plain, hidden } = twin({
    tables: () => worldAssets(() => createAssets({ dir })),
    mask: (w) => Object.values(w.t.world?.assets ?? {}).map((a) => a.id),          // a stored picture's id is made at random
    setup(w) {
      w.pack = riverPack();
      w.putIn();                                                   // the hidden world's pack has the vault
      w.dm.say({ t: "world", pack: w.pack });
      assert.equal(w.last("dm", "error")?.error, undefined);
      for (const id of ["fighter", "rogue"]) w.state.entities[id].owner = w.ids.Pat;
      for (const id of ["cleric", "wizard"]) w.state.entities[id].owner = w.ids.Sam;
      w.must({ type: "loadMap", node: "keep", entry: "gate" });
      w.must({ type: "loadMap", node: "tavern", entry: "door", who: ["fighter", "rogue"] });
    },
    steps: [
      { by: "dm", act: { type: "advanceTime", minutes: 7 } },
      { by: "Pat", act: { type: "say", as: "fighter", text: "Ale for the road" } },
      { by: "Sam", act: { type: "say", as: "cleric", text: "Quiet here" } },
      { by: "dm", act: { type: "goTo", node: "keep" } },
      { by: "dm", act: { type: "goTo", node: "tavern" } },
      { by: "Pat", act: { type: "goTo", node: "vault" } },       // refused the same as a place that is nothing
      { by: "Pat", act: { type: "goTo", node: "pl9" } },
      { by: "dm", act: { type: "advanceTime", minutes: 30 } },
      { by: "Sam", send: { t: "history", types: ["say"] } },
    ],
  }, (w) => {
    const p = w.pack;
    p.maps["vault-map"] = { ...structuredClone(p.maps["tavern-map"]), id: "vault-map", name: SECRET };
    p.nodes.push({ id: "vault", kind: "map", scale: "tactical", parent: "continent", map: "vault-map", name: SECRET });
    p.nodes[0].pins.push({ id: "p-vault", at: [400, 400], name: SECRET, to: "vault" });
  });
  assert.ok(!JSON.stringify(plain.raw.Pat).includes(SECRET));
  assert.ok(JSON.stringify(hidden.raw.dm).includes(SECRET), "the vault is there, for the DM");
});

// ---- travel: the arrival line (#650): a group arrives at places the players know, and a vault in the pack that nobody has been told of stays out ----
test("travel: a group's arrival line is sent the same with and without a place in the pack nobody has been to, and says nothing of it", () => {
  const dir = mkdtempSync(join(tmpdir(), "hextable-twin-"));
  dirs.push(dir);
  const { plain, hidden } = twin({
    tables: () => worldAssets(() => createAssets({ dir })),
    mask: (w) => Object.values(w.t.world?.assets ?? {}).map((a) => a.id),
    setup(w) {
      w.pack = riverPack();
      w.putIn();
      w.dm.say({ t: "world", pack: w.pack });
      assert.equal(w.last("dm", "error")?.error, undefined);
      for (const id of ["fighter", "rogue"]) w.state.entities[id].owner = w.ids.Pat;
      for (const id of ["cleric", "wizard"]) w.state.entities[id].owner = w.ids.Sam;
      w.must({ type: "loadMap", node: "keep", entry: "gate" });
    },
    steps: [
      { by: "dm", act: (w) => ({ type: "loadMap", node: w.tav ?? "tavern", entry: w.door ?? "door", who: ["fighter", "rogue"] }) },       // the keep keeps the others
      { by: "dm", act: { type: "goTo", node: "keep" } },
      { by: "dm", act: (w) => ({ type: "loadMap", node: w.tav ?? "tavern", entry: w.door ?? "door", who: ["cleric", "wizard"] }) },        // the whole party, at the tavern
      { by: "Pat", act: { type: "loadMap", node: "vault" } },                                                   // refused the same as a place that is nothing
      { by: "Sam", act: { type: "enter", pin: "p-vault" } },
      { by: "dm", act: { type: "advanceTime", minutes: 10 } },
      { by: "Sam", send: { t: "history", types: ["arrived"] } },
    ],
  }, (w) => {
    const p = w.pack;
    p.maps["vault-map"] = { ...structuredClone(p.maps["tavern-map"]), id: "vault-map", name: SECRET };
    p.nodes.push({ id: "vault", kind: "map", scale: "tactical", parent: "continent", map: "vault-map", name: SECRET });
    p.nodes[0].pins.push({ id: "p-vault", at: [400, 400], name: SECRET, to: "vault" });
    // The same place under another node id and another entry id in the hidden world: a raw id in a player's stream is a difference.
    w.tav = "tavern-zzz-raw"; w.door = "door-zzz-raw";
    const tav = p.nodes.find((n) => n.id === "tavern");
    tav.id = w.tav;
    for (const pin of p.nodes.find((n) => n.id === "port").pins) { pin.to = w.tav; pin.entry = w.door; }
    const m = p.maps["tavern-map"];
    m.entries[0].id = w.door;
    for (const st of m.starts) if (st.entry === "door") st.entry = w.door;
  });
  const arrivals = (who, w) => w.raw[who].flatMap((m) => (m.events ?? []).filter((e) => e.type === "arrived"));
  for (const who of ["Pat", "Sam"]) {
    const got = arrivals(who, plain);
    assert.ok(got.length >= 2, `${who} is told of the arrivals`);
    for (const e of got) assert.deepEqual(Object.keys(e).sort(), ["ids", "name", "node", "type"], "an allow list: no entry, pin or from");
    assert.ok(got.every((e) => /^pl[0-9]+$/.test(e.node) && typeof e.name === "string"));
    assert.ok(!JSON.stringify(plain.raw[who]).includes(SECRET));
  }
  assert.ok(arrivals("dm", hidden).every((e) => ["keep", "tavern-zzz-raw"].includes(e.node)), "the DM is sent the arrivals, with the pack's ids");
  assert.ok(arrivals("dm", hidden).some((e) => e.entry === "door-zzz-raw"));
  for (const who of ["Pat", "Sam"]) assert.ok(!JSON.stringify(hidden.raw[who]).includes("zzz-raw"), "no raw id");
  assert.ok(JSON.stringify(hidden.raw.dm).includes(SECRET), "the vault is there, for the DM");
});

// ---- shops: a hidden line and a stall nobody was shown (was shops.test.js) ----
const market = (hiddenLine) => ({
  format: "hextable-market", v: 1, id: "port-goods", name: "Port city goods", version: 1,
  lists: [{ id: "standard", name: "Standard goods", lines: [{ id: "rope", name: "Rope", price: "1 GP", kind: "gear" }] }],
  stores: [{ id: "outfitter", name: "Outfitter", lists: ["standard"], special: hiddenLine ? [{ id: "canary-orb", name: "CANARY ORB", price: "999 GP", kind: "valuable", qty: 1, hidden: true }] : [] }],
  loot: [],
});
const outfitter = (w) => Object.values(w.state.shops ?? {}).find((x) => x.name === "Outfitter").id;       // ids count every shop made (see burn)
const SHOP_STEPS = [
  { by: "dm", act: (w) => ({ type: "showShop", shop: outfitter(w), to: [w.ids.Pat] }) },
  { by: "dm", act: { type: "give", actor: "fighter", coins: { gp: 5 } } },
  { by: "Pat", act: (w) => ({ type: "buy", actor: "fighter", shop: outfitter(w), line: "rope" }) },       // the valley has no shop area: refused, in the same words
  { by: "Sam", act: (w) => ({ type: "buy", actor: "fighter", shop: outfitter(w), line: "rope" }) },
  { by: "Pat", act: (w) => ({ type: "buy", actor: "fighter", shop: outfitter(w), line: "canary-orb" }) },
  { by: "dm", act: (w) => ({ type: "buy", actor: "fighter", shop: outfitter(w), line: "rope" }) },
  { by: "dm", act: (w) => ({ type: "showShop", shop: outfitter(w), to: "none" }) },
];
test("shops: a store's hidden line, never revealed, is in nothing any player is sent", () => {
  const { hidden } = twin({
    setup(w) { w.state.entities.fighter.owner = w.ids.Pat; w.putIn(); },
    steps: [
      (w) => w.must({ type: "market", add: market(w.hiddenLine) }),
      { by: "dm", act: { type: "openShop", kind: "store", market: "port-goods", template: "outfitter", name: "Outfitter" } },
      ...SHOP_STEPS,
    ],
  }, (w) => { w.hiddenLine = true; });
  assert.ok(JSON.stringify(hidden.raw.dm).includes("CANARY ORB"), "the DM has the line");
});
const STALL = { type: "openShop", kind: "store", market: "port-goods", template: "outfitter", name: "SECRET-STALL" };
const stallScenario = {
  setup(w) { w.state.entities.fighter.owner = w.ids.Pat; w.must({ type: "market", add: market(false) }); },
  steps: [{ by: "dm", act: { type: "openShop", kind: "store", market: "port-goods", template: "outfitter", name: "Outfitter" } }, ...SHOP_STEPS],
};
test("shops: a stall opened and never shown to anyone is in nothing any player is sent (the plain world burns its shop id)", () => {
  twin(stallScenario, { hide: (w) => w.must(STALL), plain: (w) => { w.must({ ...STALL, name: "Burnt" }); w.must({ type: "closeShop", shop: Object.values(w.state.shops).find((x) => x.name === "Burnt").id }); } });
});
// Found by this harness: the shop's id (and the fight's number) count what players were not shown. Issue #630.
test("shops: the id of a shop does not tell how many unshown shops there are", () => {
  twin(stallScenario, (w) => w.must(STALL));
});
test("creatures: a fight's number does not tell how many hidden creatures there are (DEBT T11)", { todo: "DEBT T11: creature ids still share one counter (fight numbers fixed by #630)" }, () => {
  twin({
    players: ["Pat"],
    setup(w) { w.state.entities.fighter.owner = w.ids.Pat; w.must({ type: "setting", key: "autoEngage", value: false }); w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 }, name: "Seen" }); w.putIn(); w.must({ type: "startEncounter", center: { q: 0, r: 0 }, radius: 3 }); },
    steps: [{ by: "Pat", act: { type: "endTurn", actor: "fighter" } }],
  }, (w) => w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 8, r: -6 }, name: "Ghost", hidden: true }));
});

// ---- homebrew monsters: one in the DM's pack, and one the DM hid on the map (was packs.test.js) ----
const HB_NAME = "Zorblax Quillwraith", HB_TEXT = "Gazeblight spoor of the Quillwraith", HB_NOTE = "Secret plan: ambush at the ford", HB_ATTACK = "Gazeblight Claw", WRAITH = "hb-ember-folk-quillwraith";
const hbSpell = { id: "hb-ember-folk-cinder-lash", name: "Cinder Lash", source: "homebrew:ember-folk", level: 1, school: "evocation", classes: ["wizard"], time: "action", range: 60,
  components: ["v", "s"], duration: "instant", concentration: false, ritual: false, target: { creature: { count: 1 } },
  effects: [{ save: "dex", half: true, onFail: [{ damage: "3d6", type: "fire" }] }], tier: "auto", checked: false, text: "A lash of embers." };
function hbPack(withMonster) {
  const m = { ...structuredClone(CONTENT.monsters["goblin-warrior"]), id: WRAITH, name: HB_NAME, source: "homebrew:ember-folk", checked: false, text: HB_TEXT};
  m.actions = m.actions.map((a) => ({ ...a, name: HB_ATTACK }));
  return { format: "hextable-pack", v: 1, pack: { id: "ember-folk", name: "The ember-folk pack", version: 1, license: "CC0, by the author", attribution: "Written for a test." },
    spells: [hbSpell], ...(withMonster ? { monsters: [m] } : {}) };
}
const everything = (w) => JSON.stringify(w.raw.Pat) + JSON.stringify(w.raw.Sam);
test("homebrew monsters: a monster in the DM's pack, never spawned, is in nothing any player is sent", () => {
  const { hidden } = twin({
    setup(w) { w.hb = false; w.putIn(); w.say("dm", { t: "pack", op: "add", pack: hbPack(w.hb) }); assert.equal(w.last("dm", "error"), undefined); },
    steps: [
      { by: "Pat", send: { t: "sync" } },
      { by: "dm", act: { type: "advanceTime", minutes: 10 } },
      { by: "Sam", send: { t: "history", limit: 200 } },
    ],
  }, (w) => { w.hb = true; });
  assert.ok(JSON.stringify(hidden.raw.dm).includes(HB_NAME), "the DM has the monster");
  assert.ok(![HB_NAME, HB_TEXT, HB_NOTE, HB_ATTACK, WRAITH].some((x) => everything(hidden).includes(x)));
});
test("homebrew monsters: one the DM hid outside the arena, through a fight, is in nothing any player is sent (the plain world burns its id)", () => {
  const { hidden } = twin({
    setup(w) {
      w.state.entities.fighter.owner = w.ids.Pat;
      w.must({ type: "setting", key: "autoEngage", value: false });
      w.say("dm", { t: "pack", op: "add", pack: hbPack(true) });
      for (const [id, q, r] of [["fighter", 0, 0], ["rogue", -8, 0], ["cleric", -8, 1], ["wizard", -8, 2]]) w.must({ type: "place", actor: id, to: { q, r } });
      w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 }, name: "Seen" });
      w.putIn();
      w.must({ type: "startEncounter", center: { q: 0, r: 0 }, radius: 3 });
    },
    steps: [
      (w) => { for (let i = 0; i < 30 && current(w.state) !== "fighter"; i++) w.must({ type: "endTurn", actor: current(w.state) }); },
      { by: "Pat", act: { type: "endTurn", actor: "fighter" } },
      { by: "Pat", send: { t: "history", limit: 200 } },
    ],
  }, { hide: (w) => w.must({ type: "spawn", monster: WRAITH, at: { q: 8, r: -6 }, name: "Shape in the reeds", hidden: true }), plain: burn });
  assert.ok(JSON.stringify(hidden.raw.dm).includes("Shape in the reeds"), "the DM has the creature");
  assert.ok(![HB_NAME, HB_TEXT, HB_NOTE, HB_ATTACK, WRAITH, "Shape in the reeds"].some((x) => everything(hidden).includes(x)));
});

// ---- imbue: what a refused Magic Weapon on a foe says of the foe's weapons (O4, #666) ----
test("imbue: a player's Magic Weapon refused on a foe is told the same whether the foe's club is magic or it has no weapon", () => {
  const club = { id: "club", name: "Club", weapon: "club", bonus: 4, damage: "1d4+2", dtype: "bludgeoning", type: "melee", die: "1d4", plus: 1, magic: true };
  twin({
    players: ["Pat"],
    setup(w) {
      const s = w.state;
      for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
      for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
      w.must({ type: "setting", key: "autoEngage", value: false });
      for (const [id, q, r] of [["fighter", 0, 0], ["rogue", -8, 0], ["cleric", -8, 1], ["wizard", -8, 2]]) w.must({ type: "place", actor: id, to: { q, r } });
      Object.assign(s.entities.fighter, { owner: w.ids.Pat, ownerName: "Pat", spells: [...(s.entities.fighter.spells ?? []), "magic-weapon"], slots: { 2: 2 } });
      w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 }, name: "Foe" });
      byName(w, "Foe").attacks = [];
    },
    steps: [
      { by: "Pat", act: (w) => ({ type: "cast", actor: "fighter", spell: "magic-weapon", target: byName(w, "Foe").id, weapon: "club" }) },
      { by: "Pat", act: (w) => ({ type: "cast", actor: "fighter", spell: "magic-weapon", target: byName(w, "Foe").id }) },
    ],
  }, (w) => { byName(w, "Foe").attacks = [club]; });
});

// ---- Armor Class: an effect of a DM-hidden creature, on that creature (#674) ----
// The view sends `acNow` and `acWhy` for the party's creatures from the effects that sit on them. A hidden creature's Barkskin on itself changes
// nothing a player is sent; one on a party creature would be sent as any effect of a hidden source is (its name, never its source).
test("armor class: a hidden creature's Barkskin on itself changes nothing the players are sent, `acNow` and `acWhy` included", () => {
  twin({
    players: ["Pat"],
    setup(w) {
      w.state.entities.fighter.owner = w.ids.Pat;
      w.putIn();
    },
    steps: [
      { by: "Pat", act: { type: "check", actor: "fighter", skill: "athletics" } },
      { by: "Pat", act: { type: "check", actor: "fighter", skill: "perception" } },
    ],
  }, {
    hide: (w) => {
      w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 8, r: -6 }, name: "Ghost", hidden: true });
      const g = byName(w, "Ghost");
      w.state.effects.push({ id: `fx${++w.state.seq}`, name: "Barkskin", spell: "barkskin", source: g.id, conc: false, lasts: "1 hour", until: { clock: w.state.clock + 60 }, parts: [{ target: g.id, modifier: { on: "ac", op: "min", value: 17 } }] });
    },
    plain: (w) => { burn(w); w.state.seq++; },
  });
});

// ---- called saves (#676, docs/specs/prompts.md): the DM calls a secret save for a seen creature and a hidden one ----
test("called save: a secret save naming a hidden creature is sent the same as one naming only the seen creature", () => {
  twin({
    players: ["Pat"],
    setup(w) {
      const s = w.state;
      for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
      w.must({ type: "setting", key: "autoEngage", value: false });
      Object.assign(s.entities.fighter, { owner: w.ids.Pat, ownerName: "Pat" });
    },
    // The hidden creature's save is the last roll: it takes dice from the one seed, as any creature's roll does.
    steps: [
      { by: "dm", act: { type: "save", who: "fighter", ability: "dex", dc: 15, damage: { dice: "1d4", type: "fire" }, condition: "poisoned" } },
      { by: "dm", act: (w) => ({ type: "save", who: ["fighter", ...(byName(w, "Ghost") ? [byName(w, "Ghost").id] : [])], ability: "con", dc: 15, secret: true }) },
    ],
  }, { hide: (w) => { w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 5, r: 0 }, name: "Ghost", hidden: true }); }, plain: (w) => burn(w) });
});

test("called save: an open call with damage and a condition naming a hidden creature is sent the same as one naming only the seen creature", () => {
  twin({
    players: ["Pat"],
    setup(w) {
      const s = w.state;
      for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
      w.must({ type: "setting", key: "autoEngage", value: false });
      Object.assign(s.entities.fighter, { owner: w.ids.Pat, ownerName: "Pat" });
    },
    steps: [
      { by: "dm", act: (w) => ({ type: "save", who: ["fighter", ...(byName(w, "Ghost") ? [byName(w, "Ghost").id] : [])], ability: "dex", dc: 15, damage: { dice: "2d6", type: "fire", half: true }, condition: "prone" }) },
    ],
  }, { hide: (w) => { w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 5, r: 0 }, name: "Ghost", hidden: true }); }, plain: (w) => burn(w) });
});

// ---- on-hit O1: a smite asked at the hit (docs/specs/on-hit.md, Decisions 6 and 11): the question, its answer, the cast and its damage ----
test("on-hit: a player's Divine Smite, asked at the hit and answered, sends the same with and without a hidden creature beside the fight", () => {
  const { plain } = twin({
    players: ["Pat", "Sam"],
    setup(w) {
      const s = w.state;
      for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
      for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
      w.must({ type: "setting", key: "autoEngage", value: false });
      for (const [id, q, r] of [["rogue", -8, 0], ["cleric", -8, 1], ["wizard", -8, 2]]) w.must({ type: "place", actor: id, to: { q, r } });
      const sheet = { name: "Ka", class: "paladin", level: 5, subclass: "devotion", abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 16 }, skills: ["athletics", "religion"], choices: { "fighting-style": "defense" }, armour: "chain-mail", weapons: ["longsword"] };
      s.entities.fighter = makeEntity(derive(sheet).record, { id: "fighter", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 }, owner: w.ids.Pat, ownerName: "Pat" });
      Object.assign(s.entities.fighter, { hp: 500, maxHp: 500 });
      w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 }, name: "Seen" });
      Object.assign(byName(w, "Seen"), { hp: 500, maxHp: 500, ac: 1 });
      w.putIn();
      w.must({ type: "startEncounter", center: { q: 0, r: 0 }, radius: 4 });
      turnOf(w, "fighter");
    },
    steps: [
      { by: "Pat", act: (w) => ({ type: "hitChoices", actor: "fighter", set: { "divine-smite": "ask" } }) },
      { by: "Pat", act: (w) => ({ type: "attack", actor: "fighter", attack: "longsword", target: byName(w, "Seen").id }) },
      { by: "Sam", act: (w) => ({ type: "endTurn", actor: "rogue" }), allowError: true },
      { by: "Pat", act: (w) => ({ type: "react", prompt: w.state.pending.n, take: "divine-smite", slot: 2 }) },
      { by: "Pat", act: { type: "endTurn", actor: "fighter" } },
    ],
  }, { hide: (w) => { w.must({ type: "spawn", monster: "goblin-warrior", at: { q: -5, r: 2 }, name: "Lurker", hidden: true }); }, plain: burn });
  const text = JSON.stringify(plain.raw.Pat);
  assert.ok(text.includes("ownHit"), "Pat was asked");
  assert.ok(text.includes("Divine Smite"), "and the smite was cast");
  assert.ok(!JSON.stringify(plain.raw.Sam).includes("ownHit"), "Sam was not told what the question was");
  assert.ok(!JSON.stringify(plain.raw.Sam).includes("divine-smite\":\"ask"), "nor the instruction");
});

// The same fight with the hidden creature in it: the TARGET of the smite (a goblin the party has not found, with a distinctive Armor Class), and the ATTACKER (a
// hidden paladin on the party's side, which the DM plays, smiting a hidden goblin). A player is never told of either, nor of the foe's Armor Class.
const SHEET = { name: "Ka", class: "paladin", level: 5, subclass: "devotion", abilities: { str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 16 }, skills: ["athletics", "religion"], choices: { "fighting-style": "defense" }, armour: "chain-mail", weapons: ["longsword"] };
function smiteField(w, between) {
  const s = w.state;
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  w.must({ type: "setting", key: "autoEngage", value: false });
  for (const [id, q, r] of [["rogue", -8, 0], ["cleric", -8, 1], ["wizard", -8, 2]]) w.must({ type: "place", actor: id, to: { q, r } });
  s.entities.fighter = makeEntity(derive(SHEET).record, { id: "fighter", kind: "pc", side: "party", pos: { q: 4, r: 0, z: 0 }, owner: w.ids.Pat, ownerName: "Pat" });
  Object.assign(s.entities.fighter, { hp: 500, maxHp: 500 });
  w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 3, r: 0 }, name: "Seen" });
  Object.assign(byName(w, "Seen"), { hp: 500, maxHp: 500, ac: 1 });
  w.putIn();
  between?.();
  w.must({ type: "startEncounter", center: { q: 0, r: 0 }, radius: 4 });
  turnOf(w, "fighter");
}
// The hidden goblin gets an Armor Class no one else has, so a leak of it is a string to look for.
const lurker = (w, at, hide = true) => { w.must({ type: "spawn", monster: "goblin-warrior", at, name: "Lurker", ...(hide ? { hidden: true } : {}) }); Object.assign(byName(w, "Lurker"), { hp: 500, maxHp: 500, ac: 23 }); w.lurkId = byName(w, "Lurker").id; };
const noFoeAc = (plain, hid) => { for (const who of ["Pat", "Sam"]) for (const world of [plain, hid]) assert.ok(!JSON.stringify(world.raw[who]).includes('"ac":23'), `${who} was sent the hidden foe's Armor Class`); };
test("on-hit: a Divine Smite aimed at a hidden target sends the other player nothing of it, nor the foe's Armor Class", () => {
  const { plain, hidden } = twin({
    players: ["Pat", "Sam"],
    setup: (w) => smiteField(w),
    steps: [
      { by: "Pat", act: { type: "hitChoices", actor: "fighter", set: { "divine-smite": "ask" } } },
      { by: "Pat", act: (w) => ({ type: "attack", actor: "fighter", attack: "longsword", target: w.lurkId }) },
      { by: "Sam", act: { type: "hitChoices", actor: "fighter", set: { "divine-smite": "always" } }, allowError: true },
      { by: "Pat", act: { type: "endTurn", actor: "fighter" } },
    ],
  }, { hide: (w) => lurker(w, { q: 5, r: 0 }), plain: (w) => { lurker(w, { q: 5, r: 0 }); delete w.state.entities[w.lurkId]; } });
  assert.ok(JSON.stringify(hidden.raw.Pat).includes("No such creature"), "the attempt was answered the same as for a creature that is not there");
  noFoeAc(plain, hidden);
});
// The engine keeps a hidden creature out of a fight (it is revealed when one starts around it, or when it is spawned into one), and an attack that names a smite
// needs a turn in a fight, so a creature the players do not know of cannot smite anyone. The DM's try is refused, and the fight the party plays goes on, sent the
// same as in a world without the pair, with no foe Armor Class in it.
test("on-hit: a hidden foe paladin cannot smite a hidden goblin, and the fight beside them sends both players the same as a world without them", () => {
  let refusal;
  const { plain, hidden } = twin({
    players: ["Pat", "Sam"],
    setup: (w) => smiteField(w),
    steps: [
      (w) => { if (w.state.entities.shade) refusal = w.act("dm", { type: "attack", actor: "shade", attack: "longsword", target: w.lurkId, onHit: [{ spell: "divine-smite" }] }); },
      { by: "Pat", act: { type: "hitChoices", actor: "fighter", set: { "divine-smite": "ask" } } },
      { by: "Pat", act: (w) => ({ type: "attack", actor: "fighter", attack: "longsword", target: byName(w, "Seen").id }) },
      { by: "Pat", act: (w) => ({ type: "react", prompt: w.state.pending.n, take: "divine-smite", slot: 1 }) },
      { by: "Pat", act: { type: "endTurn", actor: "fighter" } },
    ],
  }, { hide: (w) => { lurker(w, { q: -6, r: 6 }); w.state.entities.shade = makeEntity(derive(SHEET).record, { id: "shade", kind: "monster", side: "foe", pos: { q: -5, r: 6, z: 0 }, hidden: true }); },
    plain: (w) => { lurker(w, { q: -6, r: 6 }); delete w.state.entities[w.lurkId]; } });
  assert.match(refusal ?? "", /fight|battle|turn/i, "the DM's smite by a hidden creature was refused");
  assert.equal(hidden.w.state.entities[hidden.w.lurkId].hp, 500, "and nothing was done to the goblin");
  for (const who of ["Pat", "Sam"]) { const t = JSON.stringify(hidden.raw[who]); assert.ok(!t.includes('"ac":23') && !t.includes("shade") && !t.includes("Lurker"), `${who} was told of the hidden pair`); }
  noFoeAc(plain, hidden);
});

// ---- following: a hidden creature on the only level way between the one in front and a follower's place (#736) ----
// A platform 7.5 feet up (q <= 0), a pit at its foot (1,0), and a low terrace east of the pit (q >= 2, 2.5 feet up) that runs south and
// up a ramp, (1,3), onto the platform. The place two squares east of the leader, (2,0), shares its footing only by that ramp
// (`footingOf`), and the hidden goblin stands on the ramp, three squares from everything anyone walks (so nobody spots it: ENGAGE_RANGE).
// The engine once worked the footing out on the game as it is, so the goblin barred it and the follower stopped somewhere else.
const terrace = () => {
  const tiles = {};
  for (let q = -6; q <= 0; q++) for (let r = -6; r <= 3; r++) tiles[`${q},${r}`] = { t: "stone", h: 7.5 };
  tiles["1,0"] = { t: "stone" };
  for (let q = 2; q <= 62; q++) for (let r = -1; r <= 0; r++) tiles[`${q},${r}`] = { t: "stone", h: 2.5 };
  for (let r = 1; r <= 3; r++) tiles[`2,${r}`] = { t: "stone", h: 2.5 };
  tiles["1,3"] = { t: "stone", h: 5 };
  return newMap({ id: "terrace", name: "A terrace", grid: "square", starts: [{ q: 5, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }] });
};
const RAMP = { q: 1, r: 3 };
function terraceField(w, leaderAt, followers) {
  const s = w.state;
  w.must({ type: "loadMap", map: terrace() });
  w.must({ type: "setting", key: "autoEngage", value: false });
  for (const id of Object.keys(s.entities)) if (id !== "fighter" && !followers.some(([f]) => f === id)) delete s.entities[id];
  Object.assign(s.entities.fighter, { owner: w.ids.Pat, ownerName: "Pat", pos: leaderAt });
  for (const [id, pos] of followers) { s.entities[id].pos = pos; w.must({ type: "follow", actor: id, leader: "fighter" }); }
}
const hiddenOnRamp = { hide: (w) => w.must({ type: "spawn", monster: "goblin-warrior", at: RAMP, name: "Ghost", hidden: true }), plain: (w) => burn(w, RAMP) };
const stillHidden = (hidden) => assert.equal(byName(hidden.w, "Ghost").hidden, true, "nobody found the hidden goblin, so the two worlds must look the same");

for (const climbing of ["on", "off"]) test(`following (column, climbing ${climbing}): a follower stops in the same place with and without a hidden creature on the ramp between it and its leader`, () => {
  const { plain, hidden } = twin({
    players: ["Pat"], grid: "square",
    setup(w) {
      terraceField(w, { q: -4, r: 0, z: 7.5 }, [["rogue", { q: 60, r: 0, z: 2.5 }]]);
      if (climbing === "off") w.must({ type: "setting", key: "climbing", value: "off" });
    },
    steps: [{ by: "Pat", act: { type: "move", actor: "fighter", to: { q: 0, r: 0, z: 7.5 } } }],
  }, hiddenOnRamp);
  for (const world of [plain, hidden]) assert.deepEqual(world.w.state.entities.rogue.pos, { q: 2, r: 0, z: 2.5 }, "the follower came up to the place on its leader's footing");
  stillHidden(hidden);
});

test("following (formation): the party takes the same places with and without a hidden creature on the ramp between the leader and a slot", () => {
  const { plain, hidden } = twin({
    players: ["Pat"], grid: "square",
    setup(w) {
      terraceField(w, { q: 0, r: -4, z: 7.5 }, [["rogue", { q: 8, r: 0, z: 2.5 }], ["cleric", { q: -1, r: -5, z: 7.5 }]]);
      w.must({ type: "formation", leader: "fighter", slots: { rogue: { back: 0, side: -2 }, cleric: { back: 1, side: 1 } } });
    },
    steps: [{ by: "Pat", act: { type: "move", actor: "fighter", to: { q: 0, r: 0, z: 7.5 } } }],
  }, hiddenOnRamp);
  for (const world of [plain, hidden]) assert.deepEqual(world.w.state.entities.rogue.pos, { q: 2, r: 0, z: 2.5 }, "the rogue took its slot on the terrace");
  stillHidden(hidden);
});

// ---- Dispel Magic (#726 job 5): a lasting spell keeps its level and whom it was aimed at, which no player is sent ----
const WYN = { name: "Wyn", class: "wizard", level: 9, subclass: "evoker", abilities: { str: 10, dex: 14, con: 12, int: 18, wis: 12, cha: 10 }, skills: ["arcana", "history"], spells: ["dispel-magic", "mage-armor", "light"] };
test("dispel: casting and dispelling spells sends the same with and without a hidden creature that has a spell on it, and no level or aim is sent", () => {
  const { plain, hidden } = twin({
    players: ["Pat", "Sam"],
    setup(w) {
      const s = w.state;
      for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
      for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
      w.must({ type: "setting", key: "autoEngage", value: false });
      for (const [id, q, r] of [["fighter", 1, 0], ["rogue", -8, 0], ["cleric", -8, 1], ["wizard", -8, 2]]) w.must({ type: "place", actor: id, to: { q, r } });
      s.entities.wyn = makeEntity(derive(WYN).record, { id: "wyn", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 }, owner: w.ids.Pat, ownerName: "Pat" });
      s.entities.wyn.sheet = structuredClone(WYN);
    },
    steps: [
      { by: "Pat", act: { type: "cast", actor: "wyn", spell: "mage-armor", target: "wyn" } },
      { by: "Pat", act: { type: "cast", actor: "wyn", spell: "light", target: "wyn" } },
      { by: "Pat", act: { type: "cast", actor: "wyn", spell: "dispel-magic", target: "fighter" } },      // nothing on the fighter
      { by: "Pat", act: (w) => ({ type: "cast", actor: "wyn", spell: "dispel-magic", target: w.lurkId ?? "nobody" }), allowError: true },   // a creature they do not know of: refused the same
      { by: "Pat", act: { type: "cast", actor: "wyn", spell: "dispel-magic", target: "wyn", slot: 4 } },
    ],
  }, {
    hide(w) {
      w.must({ type: "spawn", monster: "bandit", at: { q: 3, r: 0 }, name: "Ghost", hidden: true });
      w.lurkId = byName(w, "Ghost").id;
      w.state.effects.push({ id: "fxghost", name: "Mage Armor", spell: "mage-armor", source: w.lurkId, conc: false, lasts: "8 hours", level: 1, aimed: [w.lurkId], parts: [{ target: w.lurkId, modifier: { on: "ac", op: "add", value: 1 } }], until: null });
    },
    plain: (w) => { burn(w, { q: 3, r: 0 }); },
  });
  assert.deepEqual(hidden.w.state.effects.map((fx) => fx.id), ["fxghost"], "Wyn's spells ended and the hidden creature's stayed");
  for (const world of [plain, hidden]) for (const who of ["Pat", "Sam"]) {
    const sent = JSON.stringify(world.raw[who]);
    assert.ok(!sent.includes('"aimed"'), `${who} was sent whom a spell was aimed at`);
    assert.ok(!/"effects":\[[^\]]*"level":/.test(sent), `${who} was sent a spell's level`);
    assert.ok(sent.includes("spells end") || who !== "Pat", "the script did dispel something");
  }
  assert.ok(JSON.stringify(hidden.raw.Pat).includes("No such creature"), "the cast at the hidden creature was answered as for one that is not there");
  assert.ok(JSON.stringify(plain.raw.dm).includes('"aimed"'), "the DM's own view has them, so the check above is not empty");
});

// One lasting spell on a visible and a hidden creature: a Dispel Magic aimed at the visible one ends it whole, on the hidden one too.
// effectEnd names every creature the spell was on (`targets`); view.js sends each player only those they know of.
const dispelWorld = (extra = () => {}) => ({
  players: ["Pat", "Sam"],
  setup(w) {
    const s = w.state;
    for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
    for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
    w.must({ type: "setting", key: "autoEngage", value: false });
    for (const [id, q, r] of [["fighter", 1, 0], ["rogue", -8, 0], ["cleric", -8, 1], ["wizard", -8, 2]]) w.must({ type: "place", actor: id, to: { q, r } });
    s.entities.wyn = makeEntity(derive(WYN).record, { id: "wyn", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 }, owner: w.ids.Pat, ownerName: "Pat" });
    s.entities.wyn.sheet = structuredClone(WYN);
    extra(w);
  },
});
const armor = (level, ids) => ({ id: "fxtwo", name: "Mage Armor", spell: "mage-armor", source: "wyn", conc: false, lasts: "8 hours", level, aimed: ids,
  parts: ids.map((target) => ({ target, modifier: { on: "ac", op: "add", value: 1 } })), until: null });
const sharedHidden = (level) => ({
  hide(w) { w.must({ type: "spawn", monster: "bandit", at: { q: 3, r: 0 }, name: "Ghost", hidden: true }); w.state.effects.push(armor(level, ["fighter", byName(w, "Ghost").id])); },
  plain(w) { burn(w, { q: 3, r: 0 }); w.state.effects.push(armor(level, ["fighter"])); },
});
const DISPEL_FIGHTER = [{ by: "Pat", act: { type: "cast", actor: "wyn", spell: "dispel-magic", target: "fighter" } }];

// TODO(effectEnd key order): nothing the player may not know is sent, but the two worlds do not send the same bytes. With a hidden creature on the spell,
// view.js builds the event again and puts `why` after `targets`; without one it keeps the order the engine made (`why` before `targets`).
test("dispel: one spell on a visible and a hidden creature ends whole when dispelled from the visible one, and the players are sent the same", () => {
  const { plain, hidden } = twin({ ...dispelWorld(), steps: DISPEL_FIGHTER }, sharedHidden(1));
  assert.equal(hidden.w.state.effects.length, 0, "the spell ended whole, the hidden creature's part with it");
  assert.equal(plain.w.state.effects.length, 0);
  for (const world of [plain, hidden]) for (const who of ["Pat", "Sam"]) assert.ok(JSON.stringify(world.raw[who]).includes('"effectEnd"'), `${who} was told the spell ended`);
  assert.ok(JSON.stringify(hidden.raw.dm).includes(byName(hidden.w, "Ghost").id), "the DM's own stream names the hidden creature, so the check is not empty");
});

test("dispel: a level 5 spell on a visible and a hidden creature, the caster's ability unknown: the `manual` event the DM gets and what players are sent are the same", () => {
  const { plain, hidden } = twin({ ...dispelWorld((w) => { delete w.state.entities.wyn.castAbil; }), steps: DISPEL_FIGHTER }, sharedHidden(5));
  for (const world of [plain, hidden]) {
    assert.equal(world.w.state.effects.length, 1, "left for the DM");
    assert.ok(JSON.stringify(world.raw.dm).includes("the DM rolls it"), "the DM was handed the check, so the twin is not empty");
  }
});

// ---- offered characters (#757 part 1; docs/specs/portable-characters.md, A4, A5): an offer the DM has not answered ----
// One world has a player's offered sheet waiting, the other none. The offering player is sent nothing either (the client part will tell them, in a
// field or event only they get), so every player's bytes are the same in both, to the end: a player's action, the DM's settings, and a seat taken.
const offeredSheet = (name) => ({ name, class: "fighter", level: 1, abilities: { str: 17, dex: 13, con: 15, int: 8, wis: 12, cha: 10 },
  skills: ["perception", "survival"], extraSkills: ["athletics", "intimidation"], choices: { "fighting-style": "archery" },
  armour: "chain-mail", shield: true, weapons: ["longsword", "javelin"], gear: ["Chain Mail", "Shield", "Longsword", "4 Javelins", "Explorer's Pack"] });
test("offers: a character a player has offered and the DM has not admitted is sent to no player, whatever happens at the table meanwhile", () => {
  const { hidden } = twin({
    players: ["Pat", "Sam"],
    steps: [
      { by: "dm", act: { type: "setting", key: "level", value: { min: 1, max: 3 } } },
      { by: "dm", act: { type: "setting", key: "characters", value: "own" } },
      { by: "Pat", act: { type: "claim", entity: "fighter" } },
      { by: "Pat", act: { type: "say", text: "Hello" } },
      { by: "Sam", act: { type: "release", entity: "fighter" }, allowError: true },
      { by: "dm", act: { type: "setting", key: "characters", value: "own-trusted" } },
    ],
  }, (w) => { assert.equal(w.act("Sam", { type: "offer", sheet: offeredSheet("Secretly Kerrin") }), undefined); });
  assert.equal(hidden.w.state.offers.length, 1, "the offer is waiting in the world that has one");
  assert.ok(JSON.stringify(hidden.raw.dm).includes("Secretly Kerrin"), "the DM is sent it, so the check is not empty");
  for (const who of ["Pat", "Sam"]) assert.ok(!JSON.stringify(hidden.raw[who]).includes("Secretly Kerrin"), `${who} was sent the offered name`);
});
