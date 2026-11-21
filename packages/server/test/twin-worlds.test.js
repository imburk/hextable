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
import { current } from "../../rules/src/engine.js";
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
