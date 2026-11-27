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
import { apply, current, makeEntity } from "../../rules/src/engine.js";
import { derive } from "../../rules/src/derive.js";
import { startEffect } from "../../rules/src/durations.js";
import { describe, diffStreams, twin, twinRun } from "./twin.js";

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

// ---- Heroism and Regenerate (#726 job 2): a hidden creature's own turn starts, and its eachTurn part runs ----
test("regenerate: a hidden creature holding an eachTurn part, outside the arena (a hidden creature that joins a fight is revealed, by design), changes nothing a player is sent as the fight's turns start, sent the same as with no creature there", () => {
  twin({
    players: ["Pat"],
    setup(w) {
      const s = w.state;
      for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
      for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
      w.must({ type: "setting", key: "autoEngage", value: false });
      for (const [id, q, r] of [["fighter", 0, 0], ["rogue", -8, 0], ["cleric", -8, 1], ["wizard", -8, 2]]) w.must({ type: "place", actor: id, to: { q, r } });
      Object.assign(s.entities.fighter, { owner: w.ids.Pat, ownerName: "Pat" });
      w.putIn();
      w.must({ type: "startEncounter", center: { q: 0, r: 0 }, radius: 3 });
    },
    steps: [
      { by: "Pat", act: (w) => ({ type: "endTurn", actor: current(w.state) }), allowError: true },
      { by: "Pat", act: (w) => ({ type: "endTurn", actor: current(w.state) }), allowError: true },
      { by: "Pat", act: (w) => ({ type: "endTurn", actor: current(w.state) }), allowError: true },
    ],
  }, {
    hide: (w) => {
      w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 5, r: 0 }, name: "Ghost", hidden: true });
      const g = byName(w, "Ghost");
      Object.assign(g, { hp: 3, maxHp: 7 });
      const fx = startEffect(w.state, { name: "Regenerate", spell: "regenerate", source: g.id, duration: "1 hour" });
      fx.parts.push({ target: g.id, turn: { steps: [{ heal: "+1" }], src: { name: "Regenerate", spell: "regenerate" } } });
    },
    plain: (w) => { burn(w, { q: 5, r: 0 }); w.state.seq++; },
  });
});

// ---- Guardian of Faith (#786 wave 1): a zone with a damage budget it keeps on its effect ----
test("guardian of faith: a player's cast of it with a hidden creature in the area, outside the arena, and the party's turns after, are sent the same as with no creature there", () => {
  twin({
    players: ["Pat"],
    setup(w) {
      const s = w.state;
      for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
      for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
      w.must({ type: "setting", key: "autoEngage", value: false });
      for (const [id, q, r] of [["fighter", -8, 0], ["rogue", -8, 1], ["cleric", 0, 0], ["wizard", -8, 2]]) w.must({ type: "place", actor: id, to: { q, r } });
      Object.assign(s.entities.cleric, { owner: w.ids.Pat, ownerName: "Pat", spells: [...s.entities.cleric.spells, "guardian-of-faith"], slots: { ...s.entities.cleric.slots, 4: 1 }, slotsMax: { ...s.entities.cleric.slotsMax, 4: 1 } });
      w.putIn();
      w.must({ type: "startEncounter", center: { q: 0, r: 0 }, radius: 3 });
      turnOf(w, "cleric");
    },
    steps: [
      { by: "Pat", act: { type: "cast", actor: "cleric", spell: "guardian-of-faith", slot: 4, hex: { q: 4, r: 0 } } },
      { by: "Pat", act: (w) => ({ type: "endTurn", actor: current(w.state) }), allowError: true },
      { by: "Pat", act: (w) => ({ type: "endTurn", actor: current(w.state) }), allowError: true },
      { by: "Pat", act: (w) => ({ type: "endTurn", actor: current(w.state) }), allowError: true },
    ],
  }, {
    hide: (w) => { w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 5, r: 0 }, name: "Ghost", hidden: true }); },
    plain: (w) => { burn(w, { q: 5, r: 0 }); },
  });
});

// ---- Flaming Sphere (#786 wave 2): a zone that rolls, and a placed wall's hexes, are never sent ----
test("flaming sphere: a player's cast with a hidden creature in the area, and the sphere rolled away, are sent the same as with no creature there", () => {
  twin({
    players: ["Pat"],
    setup(w) {
      const s = w.state;
      for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
      for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
      w.must({ type: "setting", key: "autoEngage", value: false });
      for (const [id, q, r] of [["fighter", -8, 0], ["rogue", -8, 1], ["wizard", 0, 0], ["cleric", -8, 2]]) w.must({ type: "place", actor: id, to: { q, r } });
      Object.assign(s.entities.wizard, { owner: w.ids.Pat, ownerName: "Pat", spells: [...s.entities.wizard.spells, "flaming-sphere", "wall-of-fire"], slots: { ...s.entities.wizard.slots, 2: 2, 4: 1 }, slotsMax: { ...s.entities.wizard.slotsMax, 2: 2, 4: 1 } });
      w.putIn();
      w.must({ type: "startEncounter", center: { q: 0, r: 0 }, radius: 3 });
      turnOf(w, "wizard");
    },
    steps: [
      { by: "Pat", act: { type: "cast", actor: "wizard", spell: "flaming-sphere", slot: 2, hex: { q: 4, r: 0 } } },
      { by: "Pat", act: { type: "moveZone", actor: "wizard", to: { q: 4, r: 3 } } },
      { by: "Pat", act: (w) => ({ type: "endTurn", actor: current(w.state) }), allowError: true },
      { by: "Pat", act: (w) => ({ type: "endTurn", actor: current(w.state) }), allowError: true },
    ],
  }, {
    hide: (w) => { w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 5, r: 0 }, name: "Ghost", hidden: true }); },
    plain: (w) => { burn(w, { q: 5, r: 0 }); },
  });
});

test("flaming sphere: a player's cast on the very hex of a hidden creature is accepted and sent the same as the cast on an empty hex (the refusal must not tell it is there)", () => {
  twin({
    players: ["Pat"],
    setup(w) {
      const s = w.state;
      for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
      for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
      w.must({ type: "setting", key: "autoEngage", value: false });
      for (const [id, q, r] of [["fighter", -8, 0], ["rogue", -8, 1], ["wizard", 0, 0], ["cleric", -8, 2]]) w.must({ type: "place", actor: id, to: { q, r } });
      Object.assign(s.entities.wizard, { owner: w.ids.Pat, ownerName: "Pat", spells: [...s.entities.wizard.spells, "flaming-sphere"], slots: { ...s.entities.wizard.slots, 2: 2 }, slotsMax: { ...s.entities.wizard.slotsMax, 2: 2 } });
      w.putIn();
      w.must({ type: "startEncounter", center: { q: 0, r: 0 }, radius: 3 });
      turnOf(w, "wizard");
    },
    steps: [
      { by: "Pat", act: { type: "cast", actor: "wizard", spell: "flaming-sphere", slot: 2, hex: { q: 5, r: 0 } } },
    ],
  }, {
    hide: (w) => { w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 5, r: 0 }, name: "Ghost", hidden: true }); },
    plain: (w) => { burn(w, { q: 5, r: 0 }); },
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

test("characters: Sam's offer, declined with a note, is in nothing Pat is sent (the plain world has no offer at all)", () => {
  const OFFER = { name: "Kerrin", class: "fighter", level: 1, abilities: { str: 15, dex: 13, con: 14, int: 8, wis: 12, cha: 10 }, skills: ["athletics", "perception"], choices: { "fighting-style": "defense" }, armour: "chain-mail", weapons: ["longsword"] };
  // Sam is told his own offer was declined, so Sam is the one player who may tell the worlds apart; Pat may not.
  const { plain, hidden } = twinRun({
    players: ["Pat", "Sam"],
    steps: [(w) => w.say("Pat", { t: "sync" })],
  }, {
    hide(w) {
      const was = w.act("Sam", { type: "offer", sheet: OFFER });
      assert.equal(was, undefined, `Sam's offer was refused: ${was}`);
      w.must({ type: "decline", user: w.ids.Sam, note: "Please bring a level 1" });
    },
    plain() {},
  });
  const diffs = diffStreams(plain, hidden, ["Pat"]);
  if (diffs.length) assert.fail(`twin: ${describe(diffs)}`);
  assert.ok(plain.streams.Pat.length > 3, "Pat was sent something to compare");
  assert.ok(JSON.stringify(hidden.raw.Sam).includes("Please bring a level 1"), "Sam is sent the DM's note");
  assert.ok(!JSON.stringify(hidden.raw.Pat).includes("Please bring a level 1"), "Pat is not");
});

// ---- Flyby (#726 job 9): a hidden flyer leaves a player's creature's reach ----
test("flyby: a hidden owl (outside the arena: a hidden creature in it is revealed when the fight starts, so it cannot be in reach of a player's creature) that moves is sent the same as with no creature there", () => {
  twin({
    players: ["Pat"],
    setup(w) {
      const s = w.state;
      for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
      for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
      w.must({ type: "setting", key: "autoEngage", value: false });
      for (const [id, q, r] of [["fighter", 0, 0], ["rogue", -8, 0], ["cleric", -8, 1], ["wizard", -8, 2]]) w.must({ type: "place", actor: id, to: { q, r } });
      Object.assign(s.entities.fighter, { owner: w.ids.Pat, ownerName: "Pat", hp: 500, maxHp: 500 });
      w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 2, r: 0 }, name: "Seen" });
      Object.assign(byName(w, "Seen"), { hp: 500, maxHp: 500 });
      w.putIn();                                                  // the hidden creature exists before the fight
      w.must({ type: "startEncounter", center: { q: 0, r: 0 }, radius: 4 });
      turnOf(w, "fighter");
    },
    steps: [
      (w) => { const o = byName(w, "Ghost"); if (!o) return; w.must({ type: "move", actor: o.id, to: { q: 6, r: 0 } }); },
      { by: "Pat", act: { type: "endTurn", actor: "fighter" } },
    ],
  }, {
    hide: (w) => { w.must({ type: "spawn", monster: "owl", at: { q: 5, r: 0 }, name: "Ghost", hidden: true }); },
    plain: (w) => { burn(w, { q: 5, r: 0 }); w.state.seq++; },
  });
});

// ---- See Invisibility (#786 wave 3a part 3): an Invisible creature, and a character that does or does not have the spell ----
// Put in through the rules, not the table (the harness syncs everyone after): the spawn must not tell the players of it before it is Invisible.
const unseen = (w, at, name) => { const r = apply(w.state, { type: "spawn", monster: "goblin-warrior", at, name }, { role: "dm", userId: "dm" }); assert.ok(r.ok, r.error); const g = byName(w, name); Object.assign(g, { hp: 500, maxHp: 500 }); const c = apply(w.state, { type: "condition", actor: g.id, condition: "invisible" }, { role: "dm", userId: "dm" }); assert.ok(c.ok, c.error); };
const seeInvisibleSetup = (w) => {
  const s = w.state;
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  w.must({ type: "setting", key: "autoEngage", value: false });
  w.must({ type: "setting", key: "sight", value: "light" });
  for (const [id, q, r] of [["fighter", 0, 0], ["rogue", -8, 0], ["cleric", -8, 1], ["wizard", -2, 0]]) w.must({ type: "place", actor: id, to: { q, r } });
  Object.assign(s.entities.fighter, { owner: w.ids.Pat, ownerName: "Pat", hp: 500, maxHp: 500 });
  Object.assign(s.entities.wizard, { owner: w.ids.Sam, ownerName: "Sam", slots: { 2: 3 }, slotsMax: { 2: 3 } });
  s.entities.wizard.spells.push("see-invisibility");
};
test("see invisibility: with no See Invisibility at the table, an Invisible creature in plain view is sent to no player: the worlds with and without it are the same", () => {
  twin({
    players: ["Pat", "Sam"],
    setup: seeInvisibleSetup,
    steps: [
      { by: "dm", act: { type: "advanceTime", minutes: 1 } },
      { by: "Pat", act: { type: "say", as: "fighter", text: "Anything there?" } },
      { by: "dm", act: (w) => ({ type: "move", actor: byName(w, "Wisp")?.id ?? "none", to: { q: 4, r: 1 } }), allowError: true },
    ],
  }, { hide: (w) => unseen(w, { q: 3, r: 0 }, "Wisp"), plain: (w) => burn(w, { q: 6, r: 1 }) });
});
test("see invisibility: the caster's table is sent the Invisible creature once the spell is cast (the party shares what one of its members sees, as with Truesight), and the other worlds' bytes differ", () => {
  const scenario = {
    players: ["Pat", "Sam"],
    setup: seeInvisibleSetup,
    steps: [
      { by: "dm", act: { type: "advanceTime", minutes: 1 } },
      { by: "Sam", act: { type: "cast", actor: "wizard", spell: "see-invisibility", target: "wizard" } },
      { by: "dm", act: { type: "advanceTime", minutes: 1 } },
    ],
  };
  const { plain, hidden, diffs } = twinRun(scenario, { hide: (w) => unseen(w, { q: 3, r: 0 }, "Wisp"), plain: (w) => burn(w, { q: 6, r: 1 }) });
  assert.ok(diffs.length > 0, "the players are told the creature");
  const sent = (r, who) => JSON.stringify(r.raw[who]).includes("Wisp");
  assert.ok(sent(hidden, "Sam"), "the caster's player is sent the Invisible creature");
  assert.ok(!sent(plain, "Sam"), "not in the world with none");
  // Before the cast nothing differs: the first messages of the hidden world carry no Wisp for either player.
  const first = (r, who) => r.raw[who].findIndex((m) => JSON.stringify(m).includes("Wisp"));
  const cast = (r) => r.raw.Sam.findIndex((m) => m.t === "events" && JSON.stringify(m).includes("See Invisibility"));
  assert.ok(first(hidden, "Sam") === -1 || first(hidden, "Sam") >= cast(hidden) - 1, "not sent before the spell");
});

// ---- True Seeing (#786 wave 4 part 3): Truesight lent for an hour shows an Invisible creature; a player is sent what the sight rules give a Truesight creature ----
const trueSeeingSetup = (w) => { seeInvisibleSetup(w); Object.assign(w.state.entities.wizard, { slots: { 2: 3, 6: 2 }, slotsMax: { 2: 3, 6: 2 } }); w.state.entities.wizard.spells.push("true-seeing"); };
test("true seeing: before the spell an Invisible creature in range is sent to no player (the same as a bare cell); after it the caster's player is sent exactly what See Invisibility's sight gives, no more", () => {
  const sides = { hide: (w) => unseen(w, { q: 3, r: 0 }, "Wisp"), plain: (w) => burn(w, { q: 6, r: 1 }) };
  const before = { players: ["Pat", "Sam"], setup: trueSeeingSetup, steps: [{ by: "dm", act: { type: "advanceTime", minutes: 1 } }, { by: "Pat", act: { type: "say", as: "fighter", text: "Anything there?" } }] };
  twin(before, sides);
  const cast = { players: ["Pat", "Sam"], setup: trueSeeingSetup, steps: [{ by: "dm", act: { type: "advanceTime", minutes: 1 } }, { by: "Sam", act: { type: "cast", actor: "wizard", spell: "true-seeing", target: "wizard", slot: 6 } }, { by: "dm", act: { type: "advanceTime", minutes: 1 } }] };
  const { plain, hidden, diffs } = twinRun(cast, sides);
  assert.ok(diffs.length > 0, "the players are told the creature once the spell is cast");
  const sent = (r, who) => JSON.stringify(r.raw[who]).includes("Wisp");
  assert.ok(sent(hidden, "Sam") && !sent(plain, "Sam"));
  // The same in the world where the sight comes from See Invisibility: Truesight shows the creature, and what is sent about it is what the sight rules already give.
  const sight = (r) => r.raw.Sam.filter((m) => m.t === "events" ? false : JSON.stringify(m).includes("Wisp")).length > 0;
  assert.equal(sight(hidden), true);
  const seeInv = { ...cast, steps: [cast.steps[0], { by: "Sam", act: { type: "cast", actor: "wizard", spell: "see-invisibility", target: "wizard" } }, cast.steps[2]] };
  const other = twinRun(seeInv, sides).hidden;
  const wisp = (r) => r.raw.Sam.flatMap((m) => JSON.stringify(m).match(/"name":"Wisp"[^}]*/g) ?? []).at(-1);
  assert.equal(wisp(hidden), wisp(other), "the creature is described to the player in the same way");
});

test("true seeing: an Invisible creature just past 120 feet, and one behind a wall within 120 feet, are sent to the players as a bare cell is, after the cast", () => {
  const cast = (setup) => ({ players: ["Pat", "Sam"], setup: (w) => { trueSeeingSetup(w); setup(w); }, steps: [{ by: "dm", act: { type: "advanceTime", minutes: 1 } }, { by: "Sam", act: { type: "cast", actor: "wizard", spell: "true-seeing", target: "wizard", slot: 6 } }, { by: "dm", act: { type: "advanceTime", minutes: 1 } }, { by: "Pat", act: { type: "say", as: "fighter", text: "Anything there?" } }] });
  // 125 feet: the wizard stands at the west edge, the creature 25 hexes east.
  const far = twin(cast((w) => w.must({ type: "place", actor: "wizard", to: { q: -12, r: 0 } })), { hide: (w) => unseen(w, { q: 13, r: 0 }, "Wisp"), plain: (w) => burn(w, { q: 12, r: 0 }) });
  assert.ok(!JSON.stringify(far.hidden.raw.Sam).includes("Wisp"), "125 feet: Sam is told of nothing");
  // Behind a wall, 30 feet away: Truesight does not see through it.
  const walled = twin(cast((w) => { w.state.map.walls.push({ id: "wallT", level: "ground", a: [-70, 11], b: [70, 11], kind: "wall" }); }), { hide: (w) => unseen(w, { q: -2, r: 6 }, "Wisp"), plain: (w) => burn(w, { q: -2, r: 7 }) });
  assert.ok(!JSON.stringify(walled.hidden.raw.Sam).includes("Wisp"), "behind a wall: Sam is told of nothing");
});

// ---- Antilife Shell (#786 wave 3b part 1): a hidden caster's shell ----
// A shell refuses a move into it, which would tell the players something stands there. The engine does not enforce the shell of a caster the party does not know of
// (shellSeen), so a visible creature walking into it is sent what it would be sent on a bare cell.
const shellOf = (w, caster) => {
  const g = byName(w, caster), fx = startEffect(w.state, { name: "Antilife Shell", spell: "antilife-shell", source: g.id, conc: true, duration: "1 hour", level: 5 });
  fx.parts.push({ target: g.id, ends: { on: "concentration" } });
  fx.terrain = { area: { shape: "emanation", size: 10 }, hexes: [], origin: { ...g.pos }, shell: true, follows: g.id };
};
test("antilife shell: a visible creature that moves into the shell of a hidden caster is sent the same as it would be on a bare cell", () => {
  const { plain, hidden } = twin({
    players: ["Pat"],
    setup(w) {
      const s = w.state;
      for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
      for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
      w.must({ type: "setting", key: "autoEngage", value: false });
      for (const [id, q, r] of [["fighter", 0, 0], ["rogue", -8, 0], ["cleric", -8, 1], ["wizard", -8, 2]]) w.must({ type: "place", actor: id, to: { q, r } });
      Object.assign(s.entities.fighter, { owner: w.ids.Pat, ownerName: "Pat", hp: 500, maxHp: 500 });
      w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 5, r: 0 }, name: "Seen" });
      Object.assign(byName(w, "Seen"), { hp: 500, maxHp: 500 });
      w.putIn();
    },
    steps: [
      { by: "dm", act: (w) => ({ type: "move", actor: byName(w, "Seen").id, to: { q: 8, r: 0 } }), allowError: true },
      { by: "dm", act: (w) => ({ type: "move", actor: byName(w, "Seen").id, to: { q: 5, r: 0 } }), allowError: true },
      { by: "Pat", act: { type: "say", as: "fighter", text: "What was that?" } },
    ],
  }, {
    hide: (w) => { w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 7, r: 1 }, name: "Ghost", hidden: true }); shellOf(w, "Ghost"); },
    plain: (w) => { burn(w, { q: 7, r: 1 }); },
  });
  const moved = (r) => JSON.stringify(r.raw.Pat).includes('"moved"');
  assert.ok(moved(plain) && moved(hidden), "the visible creature moved in both: the shell of a hidden caster refuses nothing");
});

// ---- Globe of Invulnerability (#786 wave 3b part 1): a hidden creature inside the barrier, and a spell cast from outside at the area ----
// The barrier leaves the inside out of the area by place, so a hidden creature there is neither hit nor found by it: the same bytes as a bare cell.
test("globe of invulnerability: a spell cast from outside at an area over a hidden creature inside the barrier is sent the same as over a bare cell", () => {
  twin({
    players: ["Pat", "Sam"],
    setup(w) {
      const s = w.state;
      for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
      for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
      w.must({ type: "setting", key: "autoEngage", value: false });
      for (const [id, q, r] of [["wizard", 0, 0], ["rogue", -8, 3], ["fighter", -8, 4], ["cleric", -6, 0]]) w.must({ type: "place", actor: id, to: { q, r } });
      Object.assign(s.entities.wizard, { owner: w.ids.Pat, ownerName: "Pat", slots: { 6: 2 }, slotsMax: { 6: 2 }, spells: [...s.entities.wizard.spells, "globe-of-invulnerability"] });
      Object.assign(s.entities.cleric, { owner: w.ids.Sam, ownerName: "Sam", slots: { 1: 3 }, slotsMax: { 1: 3 }, spells: [...s.entities.cleric.spells, "fog-cloud"] });
      w.must({ type: "cast", actor: "wizard", spell: "globe-of-invulnerability" });
      w.putIn();
    },
    steps: [
      { by: "Sam", act: { type: "cast", actor: "cleric", spell: "fog-cloud", hex: { q: 1, r: 0 } } },
      { by: "Pat", act: { type: "say", as: "wizard", text: "Anything?" } },
    ],
  }, {
    hide: (w) => { w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 1 }, name: "Ghost", hidden: true }); },
    plain: (w) => { burn(w, { q: 1, r: 1 }); },
  });
});

// ---- Confusion (#786 wave 3b part 2): a confused creature's d10 and its pick, with a hidden creature in its reach ----
// A 7 or 8 picks a creature within reach to attack. The pick is made only among creatures the party knows of, and the die for it is drawn whatever the
// number of them, so a hidden creature changes nothing the players are sent: not the flags (`confusedFoe:<id>:<foe>`), not the turn, not the dice after it.
// The hidden creature stands outside the arena, as in the other scenarios of a fight: one the DM hides is never in the fight, and one forced into it (a creature
// that is hiding) shows as `someone` in the order by design, so a hidden creature in the confused one's reach cannot be built here. That the pick leaves out a creature
// the party does not know of is tested in packages/rules/test/wave3b2-spells.test.js.
const CONFUSED = (seed) => ({
  players: ["Pat"],
  seed,
  setup(w) {
    const s = w.state;
    for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
    for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
    w.must({ type: "setting", key: "autoEngage", value: false });
    for (const [id, q, r] of [["fighter", 0, 0], ["rogue", 2, 0], ["cleric", -8, 1], ["wizard", -8, 2]]) w.must({ type: "place", actor: id, to: { q, r } });
    Object.assign(s.entities.fighter, { owner: w.ids.Pat, ownerName: "Pat", hp: 500, maxHp: 500 });
    s.entities.rogue.hp = s.entities.rogue.maxHp = 500;
    w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 }, name: "Seen" });
    const g = byName(w, "Seen");
    Object.assign(g, { hp: 500, maxHp: 500, reactionUsed: true });
    const fx = startEffect(s, { name: "Confusion", spell: "confusion", source: "wizard", conc: true, duration: "1 minute", level: 4 });
    fx.parts.push({ target: g.id, confuse: { had: false }, ends: { on: "save", save: "wis", at: "turnEnd" }, dc: 13 });
    w.putIn();                                                  // the hidden creature exists before the fight, which leaves it outside the arena
    w.must({ type: "startEncounter", center: { q: 0, r: 0 }, radius: 3 });
    turnOf(w, "fighter");
  },
  steps: [
    { by: "Pat", act: { type: "endTurn", actor: "fighter" } },
    (w) => turnOf(w, byName(w, "Seen").id),                     // the start of its turn: the d10 is rolled here
    { by: "dm", act: (w) => ({ type: "attack", actor: byName(w, "Seen").id, target: "fighter", attack: byName(w, "Seen").actions.find((x) => !x.multiattack).id }), allowError: true },
    { by: "dm", act: (w) => ({ type: "attack", actor: byName(w, "Seen").id, target: "rogue", attack: byName(w, "Seen").actions.find((x) => !x.multiattack).id }), allowError: true },
    { by: "dm", act: (w) => ({ type: "endTurn", actor: byName(w, "Seen").id }), allowError: true },
    { by: "Pat", act: { type: "say", as: "fighter", text: "What was that?" } },
  ],
});
test("confusion: the roll, the pick and the turn of a confused creature are told to the DM alone, and the players are sent the same with a hidden creature on the map as without", () => {
  const sides = { hide: (w) => { w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 6, r: 1 }, name: "Ghost", hidden: true }); Object.assign(byName(w, "Ghost"), { hp: 500, maxHp: 500 }); }, plain: (w) => { burn(w, { q: 6, r: 1 }); } };
  let seed = 5;
  for (; seed < 120; seed++) { const { plain } = twinRun(CONFUSED(seed), sides); if (/rolled [78] on the d10/.test(JSON.stringify(plain.raw.dm))) break; }
  assert.ok(seed < 120, "a seed that rolls a 7 or 8");
  const { plain, hidden } = twin(CONFUSED(seed), sides);
  assert.ok(/rolled [78] on the d10/.test(JSON.stringify(hidden.raw.dm)), "the DM is told of the roll in both worlds");
  assert.ok(!/on the d10|Confused/.test(JSON.stringify(hidden.raw.Pat)) && !/on the d10|Confused/.test(JSON.stringify(plain.raw.Pat)), "the player is told of none of it");
  assert.ok(!JSON.stringify(hidden.raw.Pat).includes("Ghost"));
});

// ---- Find Traps and Detect Magic (#786 wave 4 part 2): what the spells find is told to the DM alone ----
const SENSE = (spell, slot, seed = 5) => ({
  players: ["Pat"],
  seed,
  setup(w) {
    const s = w.state;
    for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
    for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
    s.map.walls.push({ id: "wall1", level: "ground", a: [-70, 11], b: [70, 11], kind: "wall" });          // between row 2 and row 3
    w.must({ type: "setting", key: "autoEngage", value: false });
    for (const [id, q, r] of [["fighter", -8, 4], ["rogue", -8, 5], ["cleric", -8, 6], ["wizard", 0, 0]]) w.must({ type: "place", actor: id, to: { q, r } });
    Object.assign(s.entities.wizard, { owner: w.ids.Pat, ownerName: "Pat", slots: { 1: 4, 2: 3 }, slotsMax: { 1: 4, 2: 3 } });
    s.entities.wizard.spells.push("find-traps", "detect-magic");
  },
  steps: [
    { by: "Pat", act: { type: "cast", actor: "wizard", spell, slot } },
    { by: "Pat", act: { type: "say", as: "wizard", text: "Well?" } },
  ],
});
const trapAt = (q, r) => (w) => { w.state.map.objects.push({ id: "trap1", def: "spiked-pit", level: "ground", at: { q, r }, state: "hidden" }); };
test("find traps: a hidden trap in range is told to the DM alone; the players are sent the same as with a bare cell, and the same for one behind a wall", () => {
  for (const [label, at] of [["in sight", [3, 0]], ["behind a wall", [0, 6]]]) {
    const { plain, hidden } = twin(SENSE("find-traps", 2), { hide: trapAt(...at), plain: () => {} });
    assert.ok(!/trap that poses/.test(JSON.stringify(hidden.raw.Pat)), `${label}: Pat was told what the trap is`);
    assert.ok(/found no trap|senses \d trap/.test(JSON.stringify(hidden.raw.dm)), `${label}: the DM is told`);
    if (label === "in sight") assert.ok(/senses 1 trap/.test(JSON.stringify(hidden.raw.dm)) && /found no trap/.test(JSON.stringify(plain.raw.dm)), "the DM is told of the trap in one world and of none in the other");
    else assert.ok(/found no trap/.test(JSON.stringify(hidden.raw.dm)), "a trap behind a wall is not sensed");
  }
});
test("detect magic: a hidden creature carrying a magic item within 30 feet is told to the DM alone; the players are sent the same as with none there", () => {
  const sides = { hide: (w) => { w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 3, r: 0 }, name: "Ghost", hidden: true }); const g = byName(w, "Ghost"); g.sheet = { items: [{ id: "i1", item: "ring-of-protection" }] }; }, plain: (w) => { burn(w, { q: 3, r: 0 }); } };
  const { hidden } = twin(SENSE("detect-magic", 1), sides);
  assert.ok(/Ghost: Ring of Protection/.test(JSON.stringify(hidden.raw.dm)), "the DM is told of it");
  assert.ok(!JSON.stringify(hidden.raw.Pat).includes("Ghost") && !/Ring of Protection/.test(JSON.stringify(hidden.raw.Pat)), "the player is told of none of it");
});

// ---- Teleport (#786 wave 4 part 4): the Teleportation Outcome roll is told to the DM alone; a hidden creature near the destination changes nothing a player is sent ----
const TELEPORT = (choice, seed = 5) => ({
  players: ["Pat"],
  seed,
  setup(w) {
    const s = w.state;
    for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
    for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
    w.must({ type: "setting", key: "autoEngage", value: false });
    for (const [id, q, r] of [["fighter", -8, 4], ["rogue", -8, 5], ["cleric", -8, 6], ["wizard", 0, 0]]) w.must({ type: "place", actor: id, to: { q, r } });
    Object.assign(s.entities.wizard, { owner: w.ids.Pat, ownerName: "Pat", slots: { 7: 1 }, slotsMax: { 7: 1 } });
    s.entities.wizard.spells.push("teleport");
  },
  steps: [
    { by: "Pat", act: { type: "cast", actor: "wizard", spell: "teleport", slot: 7, choice, hex: { q: 6, r: 0 } } },
    { by: "Pat", act: { type: "say", as: "wizard", text: "Well?" } },
  ],
});
test("teleport: the roll and its outcome are told to the DM alone; a hidden creature near the destination changes nothing the player is sent", () => {
  const sides = { hide: (w) => w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 6, r: 2 }, name: "Ghost", hidden: true }), plain: (w) => burn(w, { q: 6, r: 2 }) };
  for (const [choice, said] of [["permanent-circle", /on target/], ["false-destination", /Similar Area/]]) {
    const { hidden } = twin(TELEPORT(choice), sides);
    assert.ok(said.test(JSON.stringify(hidden.raw.dm)), `${choice}: the DM is told`);
    assert.ok(!/Teleport \(|\): on target|\): Similar Area/.test(JSON.stringify(hidden.raw.Pat)), `${choice}: the player is told none of the roll`);
    assert.ok(!JSON.stringify(hidden.raw.Pat).includes("Ghost"));
  }
});

test("teleport, very familiar: Mishap damage and Off Target are told to the DM alone, and a hidden creature near the destination changes nothing the player is sent", () => {
  const sides = { hide: (w) => w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 6, r: 2 }, name: "Ghost", hidden: true }), plain: (w) => burn(w, { q: 6, r: 2 }) };
  const told = { mishap: false, off: false };
  for (let seed = 1; seed <= 60 && !(told.mishap && told.off); seed++) {
    const { hidden } = twin(TELEPORT("very-familiar", seed), sides);
    const dm = JSON.stringify(hidden.raw.dm), pat = JSON.stringify(hidden.raw.Pat);
    if (/A Mishap|Mishaps/.test(dm)) told.mishap = true;
    if (/Off Target\./.test(dm)) told.off = true;
    assert.ok(!/Teleport \(|miles|Off Target\.|A Mishap:/.test(pat), `seed ${seed}: the player is told none of the roll`);
  }
  assert.ok(told.mishap && told.off, JSON.stringify(told));
});
// A creature the party does not know of stands ON the destination: the caster arrives as intended, as it would on a bare cell, and the DM alone is told
// to settle it (one rule for every teleport, Misty Step too). The players are sent the same bytes in both worlds.
test("teleport: a hidden creature on the destination changes nothing the player is sent; the DM is told", () => {
  const sides = { hide: (w) => w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 6, r: 0 }, name: "Ghost", hidden: true }), plain: (w) => burn(w, { q: 6, r: 0 }) };
  const { hidden } = twin(TELEPORT("permanent-circle"), sides);
  assert.ok(/did not know of/.test(JSON.stringify(hidden.raw.dm)), "the DM is told");
});
test("misty step: a hidden creature on the landing changes nothing the player is sent; the DM is told", () => {
  const sides = { hide: (w) => w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 4, r: 0 }, name: "Ghost", hidden: true }), plain: (w) => burn(w, { q: 4, r: 0 }) };
  const MISTY = {
    players: ["Pat"],
    seed: 5,
    setup(w) {
      TELEPORT("permanent-circle").setup(w);
      Object.assign(w.state.entities.wizard, { slots: { 2: 1 }, slotsMax: { 2: 1 } });
      w.state.entities.wizard.spells.push("misty-step");
    },
    steps: [
      { by: "Pat", act: { type: "cast", actor: "wizard", spell: "misty-step", slot: 2, hex: { q: 4, r: 0 } } },
      { by: "Pat", act: { type: "say", as: "wizard", text: "Well?" } },
    ],
  };
  const { hidden } = twin(MISTY, sides);
  assert.ok(/did not know of/.test(JSON.stringify(hidden.raw.dm)), "the DM is told");
});

// ---- deep pits (#806): a party member that falls into a region on the level below ----
// By the existing rules a party member that lands in a region reveals it (lookAround: it stands in it), so the landing room is
// sent to the players in both worlds. A second room of that level, far from the landing and unrevealed, is a bare cell in the
// plain world and a whole layout in the other; the players are sent the same in both.
const ROOM_B = "5,-3";
const pitWorld = () => {
  const ground = Object.fromEntries(H.range({ q: 0, r: 0 }, 6).map((h) => [H.col(h), { t: "grass" }]));
  const cellar = { "0,0": { t: "stone" }, "1,0": { t: "stone" }, [ROOM_B]: { t: "stone" } };
  return newMap({ id: "deep", name: "Deep", starts: [{ q: -4, r: 0 }],
    levels: [{ id: "ground", name: "Ground", z: 0, tiles: ground }, { id: "cellar", name: "Cellar", z: -30, tiles: cellar }],
    regions: [{ id: "landing", name: "Landing", level: "cellar", hexes: ["0,0", "1,0"], revealed: false }, { id: "far", name: "Far room", level: "cellar", hexes: [ROOM_B], revealed: false }],
    objects: [{ id: "pit1", def: "hidden-pit", level: "ground", at: { q: 1, r: 0 }, state: "hidden", fall: 30 }] });
};
test("deep pits: a party member that falls into the room below reveals that room by the usual rules, and sends players nothing of another unrevealed room there", () => {
  const { hidden } = twin({
    setup(w) {
      for (const [n, id] of [["Pat", "fighter"], ["Sam", "cleric"]]) w.state.entities[id].owner = w.ids[n];
      w.must({ type: "loadMap", map: pitWorld() });
      w.must({ type: "setting", key: "autoEngage", value: false });
      Object.assign(w.state.entities.fighter, { hp: 500, maxHp: 500 });
    },
    steps: [
      { by: "Pat", act: { type: "move", actor: "fighter", to: { q: 1, r: 0 } } },
      { by: "Pat", send: { t: "sync" } },
      { by: "Pat", act: { type: "say", as: "fighter", text: "Ow." } },
    ],
  }, { hide: (w) => w.must({ type: "mapEdit", ops: [{ op: "tile", level: "cellar", at: { q: 6, r: -3 }, tile: { t: "stone" } }, { op: "tile", level: "cellar", at: { q: 5, r: -2 }, tile: { t: "stone" } },
      { op: "region", region: { id: "far", name: "Far room", level: "cellar", hexes: [ROOM_B, "6,-3", "5,-2"], revealed: false } }] }), plain: () => {} });
  const st = hidden.w.state;
  assert.deepEqual(st.entities.fighter.pos, { q: 1, r: 0, z: -30 }, "the fighter fell to the cellar");
  assert.equal(st.map.regions.find((r) => r.id === "landing").revealed, true, "the landing room is revealed by the fall");
  assert.equal(st.map.regions.find((r) => r.id === "far").revealed, false);
  assert.ok(JSON.stringify(hidden.raw.Pat).includes("cellar"), "Pat is sent the room the party fell into");
  { const t = JSON.stringify(hidden.raw.Pat); const m = t.match(/.{150}(6,-3|5,-2)\\*":\\*\{\\*"t\\*":\\*"stone.{40}/); assert.ok(!m, "and nothing of the far room: " + m?.[0]); }
});

// ---- Feather Fall (#786 wave 4 part 5): a caster of the DM's side with the instruction set, and a hidden ally of it that falls ----
// The floor under the hidden creature is taken away (a mapEdit), so it falls. A visible foe caster must not react for a creature the party does
// not know of (its Reaction and cast would be sent to the players); a hidden caster may, and is sent to nobody.
const fallWorld = () => newMap({ id: "drop", name: "Drop", starts: [{ q: -4, r: 0 }],
  levels: [{ id: "ground", name: "Ground", z: 0, tiles: Object.fromEntries(H.range({ q: 0, r: 0 }, 6).map((h) => [H.col(h), { t: "grass" }])) },
    { id: "cellar", name: "Cellar", z: -30, tiles: Object.fromEntries(H.range({ q: 0, r: 0 }, 6).map((h) => [H.col(h), { t: "stone" }])) }] });
function fallTwin(casterHidden) {
  const caster = (w) => {
    const c = w.state.entities.foe = structuredClone(w.state.entities.wizard);
    delete c.owner; delete c.reactions;
    Object.assign(c, { id: "foe", name: "Foe", side: "foe", kind: "npc", pos: { q: 2, r: 1, z: 0 }, reactionUsed: false, slots: { 1: 4 }, slotsMax: { 1: 4 }, ...(casterHidden ? { hidden: true } : {}) });
    if (!c.spells.includes("feather-fall")) c.spells.push("feather-fall");
    c.reactions = { "feather-fall": "always" };
    return c;
  };
  const ghost = (w) => { w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 3, r: 0 }, name: "Ghost", hidden: true }); };
  return twin({
    setup(w) {
      for (const [n, id] of [["Pat", "fighter"], ["Sam", "wizard"]]) w.state.entities[id].owner = w.ids[n];
      w.must({ type: "loadMap", map: fallWorld() });
      w.must({ type: "setting", key: "autoEngage", value: false });
      for (const id of Object.keys(w.state.entities)) if (w.state.entities[id].side === "foe") delete w.state.entities[id];
      w.must({ type: "place", actor: "fighter", to: { q: 0, r: 0 } });
      w.must({ type: "place", actor: "wizard", to: { q: 0, r: 1 } });
      caster(w);
    },
    steps: [
      { by: "dm", act: { type: "mapEdit", ops: [{ op: "tile", level: "ground", at: { q: 3, r: 0 }, tile: null }] } },
      { by: "Pat", send: { t: "sync" } },
      { by: "Sam", act: { type: "say", as: "wizard", text: "What was that?" } },
    ],
  }, { hide: ghost, plain: (w) => burn(w, { q: 3, r: 0 }) });
}
test("feather fall: a visible foe caster with the instruction does not react for a hidden ally that falls: the players are sent the same as with no creature there", () => {
  const { hidden } = fallTwin(false);
  const g = byName(hidden.w, "Ghost");
  assert.equal(g.pos.z, -30, "it fell");
  assert.equal(hidden.w.state.entities.foe.slots[1], 4, "and the caster spent nothing");
  assert.ok(g.hp < g.maxHp, "and was hurt");
});
// The other way round: a hidden caster must not react for a VISIBLE ally that falls. Its saving fall (no damage) would tell the players that
// something they do not know of is there, where a bare cell lets the fall hurt. The hidden thing here is the caster; the faller is in both worlds.
test("feather fall: a hidden caster does not react for a visible ally that falls: the players are sent the same as with no caster there", () => {
  const { hidden } = twin({
    setup(w) {
      for (const [n, id] of [["Pat", "fighter"], ["Sam", "wizard"]]) w.state.entities[id].owner = w.ids[n];
      w.must({ type: "loadMap", map: fallWorld() });
      w.must({ type: "setting", key: "autoEngage", value: false });
      for (const id of Object.keys(w.state.entities)) if (w.state.entities[id].side === "foe") delete w.state.entities[id];
      w.must({ type: "place", actor: "fighter", to: { q: 0, r: 0 } });
      w.must({ type: "place", actor: "wizard", to: { q: 0, r: 1 } });
      w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 3, r: 0 }, name: "Faller" });
    },
    steps: [
      { by: "dm", act: { type: "mapEdit", ops: [{ op: "tile", level: "ground", at: { q: 3, r: 0 }, tile: null }] } },
      { by: "Pat", send: { t: "sync" } },
      { by: "Sam", act: { type: "say", as: "wizard", text: "What was that?" } },
    ],
  }, {
    hide: (w) => {
      const c = w.state.entities.foe = structuredClone(w.state.entities.wizard);
      delete c.owner; delete c.reactions;
      Object.assign(c, { id: "foe", name: "Foe", side: "foe", kind: "npc", pos: { q: 2, r: 1, z: 0 }, reactionUsed: false, slots: { 1: 4 }, slotsMax: { 1: 4 }, hidden: true });
      if (!c.spells.includes("feather-fall")) c.spells.push("feather-fall");
      c.reactions = { "feather-fall": "always" };
    },
    plain: (w) => burn(w, { q: 2, r: 1 }),
  });
  assert.equal(hidden.w.state.entities.foe.slots[1], 4, "the hidden caster spent nothing");
  const f = byName(hidden.w, "Faller");
  assert.ok(f.hp < f.maxHp, "the visible faller was hurt, as on a bare cell");
});
test("feather fall: a hidden caster may react for its hidden ally, and the players are sent the same as with neither there", () => {
  const { hidden } = fallTwin(true);
  assert.equal(byName(hidden.w, "Ghost").pos.z, -30);
});

// ---- Knock (#786 wave 4 part 6): a spell aimed at a map object. An undiscovered secret door is refused in the same words as an object that is not there ----
const KNOCK = (seed = 5) => ({
  players: ["Pat"],
  seed,
  setup(w) {
    const s = w.state;
    for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
    for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
    w.must({ type: "setting", key: "autoEngage", value: false });
    for (const [id, q, r] of [["fighter", -8, 4], ["rogue", -8, 5], ["cleric", -8, 6], ["wizard", 0, 0]]) w.must({ type: "place", actor: id, to: { q, r } });
    Object.assign(s.entities.wizard, { owner: w.ids.Pat, ownerName: "Pat", slots: { 1: 4, 2: 3 }, slotsMax: { 1: 4, 2: 3 } });
    s.entities.wizard.spells.push("knock");
    s.map.objects.push({ id: "c1", def: "door-iron", level: "ground", at: { q: 2, r: 1 }, edge: 0, state: "locked", key: "iron-key" });
  },
  steps: [
    { by: "Pat", act: { type: "cast", actor: "wizard", spell: "knock", slot: 2, object: "sd" }, allowError: true },      // the secret door, or nothing: refused the same words, and nothing spent
    { by: "Pat", act: { type: "cast", actor: "wizard", spell: "knock", slot: 2, object: "c1" } },                         // the locked iron door: unlocked
    { by: "Pat", act: { type: "say", as: "wizard", text: "Open." } },
  ],
});
test("knock: a player naming an undiscovered secret door is refused in the same words as for an object that is not there, and the players are sent the same", () => {
  const { plain, hidden } = twin(KNOCK(), {
    hide: (w) => { w.state.map.objects.push({ id: "sd", def: "secret-door", level: "ground", at: { q: 3, r: 0 }, edge: 0, state: "secret" }); },
    plain: (w) => { w.state.map.walls.push({ id: "w0", level: "ground", kind: "wall", a: [17.5, -1.4433756729740645], b: [17.5, 1.4433756729740645] }); },       // a secret door looks like the wall it stands in
  });
  const refused = (world) => world.raw.Pat.filter((m) => m.t === "error").map((m) => m.error);
  assert.deepEqual(refused(hidden), refused(plain));
  assert.match(refused(hidden)[0], /No such object/);
  assert.equal(hidden.w.state.map.objects.find((o) => o.id === "sd").state, "secret", "the secret door stays undiscovered");
  assert.equal(hidden.w.state.map.objects.find((o) => o.id === "c1").state, "closed", "the known locked door was unlocked, as in the other world");
  assert.equal(hidden.w.state.entities.wizard.slots[2], 2, "the refused cast spent nothing: only the second was paid for");
});

// ---- Stone Shape (#817, wave 4 part 9): a cut through a wall. An undiscovered secret door on the cut stretch stands as the wall it passes for, and is cut away with it ----
const STONE = (seed = 5) => ({
  players: ["Pat"],
  seed,
  setup(w) {
    const s = w.state;
    for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
    for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
    w.must({ type: "setting", key: "autoEngage", value: false });
    for (const [id, q, r] of [["fighter", -8, 4], ["rogue", -8, 5], ["cleric", -8, 6], ["wizard", 3, 0]]) w.must({ type: "place", actor: id, to: { q, r } });
    Object.assign(s.entities.wizard, { owner: w.ids.Pat, ownerName: "Pat", slots: { 1: 4, 4: 3 }, slotsMax: { 1: 4, 4: 3 } });
    s.entities.wizard.spells.push("stone-shape");
  },
  steps: [
    { by: "Pat", act: { type: "cast", actor: "wizard", spell: "stone-shape", slot: 4, choice: "passage", wall: { level: "ground", x: 17.5, y: 30 } }, allowError: true },     // no wall there: refused
    { by: "Pat", act: { type: "cast", actor: "wizard", spell: "stone-shape", slot: 4, choice: "passage", wall: { level: "ground", x: 17.5, y: 0 } } },                        // the secret door, or the wall: cut
    { by: "Pat", act: { type: "say", as: "wizard", text: "Done." } },
  ],
});
test("stone shape: a secret door on the cut stretch is cut away with the wall, and the players are sent the same as for a plain wall", () => {
  const { plain, hidden } = twin(STONE(), {
    hide: (w) => { w.state.map.objects.push({ id: "sd", def: "secret-door", level: "ground", at: { q: 3, r: 0 }, edge: 0, state: "secret" }); },
    plain: (w) => { w.state.map.walls.push({ id: "w0", level: "ground", kind: "wall", a: [17.5, -1.4433756729740645], b: [17.5, 1.4433756729740645] }); },
  });
  assert.equal(hidden.w.state.map.objects.some((o) => o.id === "sd"), false, "the door went with the cut");
  assert.equal(plain.w.state.map.walls.length, 0);
  assert.equal(hidden.w.state.entities.wizard.slots[4], 2, "the refused cast spent nothing");
});

// Stone Shape, review of #820: a wall the players are not sent is refused as no wall, even when it lies within a foot of the aimed point; and a refusal from the map edit names no hidden creature.
const SEG_ = [[17.5, -1.4433756729740645], [17.5, 1.4433756729740645]];
const unexploredEast = (w) => { const keys = Object.keys(w.state.map.levels[0].tiles).filter((k) => Number(k.split(",")[0]) >= 4); w.state.map.regions.push({ id: "r1", name: "Hid", level: "ground", hexes: keys, revealed: false }); };
const stoneTwin = (casts, setup, sides) => twinRun({ ...STONE(), setup(w) { STONE().setup(w); setup?.(w); },
  steps: [...casts.map((c) => ({ by: "Pat", act: { type: "cast", actor: "wizard", spell: "stone-shape", slot: 4, choice: "passage", wall: { level: "ground", ...c } }, allowError: true })), { by: "Pat", act: { type: "say", as: "wizard", text: "Done." } }] }, sides);
const noDiffs = (r) => { if (r.diffs.length) assert.fail(describe(r.diffs)); };
for (const kind of ["wall", "window"]) test(`stone shape: an unsent ${kind} just beyond the aimed point is refused as no wall`, () => {
  const r = stoneTwin([{ x: 17.8, y: 0 }], unexploredEast, { hide: (w) => { w.state.map.walls.push({ id: "h", level: "ground", kind, a: [18.6, -1], b: [18.6, 1] }); }, plain: () => {} });
  noDiffs(r);
  assert.equal(r.hidden.w.state.map.walls.length, 1, "nothing was cut");
});
test("stone shape: a refusal from the cut names no hidden creature", () => {
  const spawn = (w) => { w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 8, r: 3 }, name: "Skulker", hidden: true }); };
  const r = stoneTwin([{ x: 17.5, y: 0 }], (w) => { w.state.map.walls.push({ id: "w0", level: "ground", kind: "wall", a: SEG_[0], b: SEG_[1] }); }, {
    hide: (w) => { spawn(w); delete w.state.map.levels[0].tiles["8,3"]; },
    plain: (w) => { spawn(w); delete w.state.entities[Object.values(w.state.entities).find((e) => e.name === "Skulker").id]; delete w.state.map.levels[0].tiles["8,3"]; } });
  noDiffs(r);
});

test("stone shape: a lever linked to the secret door that was cut loses the link; the cut is not refused (second review of #820)", () => {
  const lever = (links) => (w) => { w.state.map.objects.push({ id: "lv", def: "lever", level: "ground", at: { q: 2, r: 2 }, state: "up", ...(links ? { links } : {}) }); };
  const r = stoneTwin([{ x: 17.5, y: 0 }], null, {
    hide: (w) => { lever([{ object: "sd", when: "down", sets: "open" }])(w); w.state.map.objects.push({ id: "sd", def: "secret-door", level: "ground", at: { q: 3, r: 0 }, edge: 0, state: "secret" }); },
    plain: (w) => { lever(null)(w); w.state.map.walls.push({ id: "w0", level: "ground", kind: "wall", a: SEG_[0], b: SEG_[1] }); } });
  noDiffs(r);
  assert.equal(r.hidden.w.state.map.objects.some((o) => o.id === "sd"), false, "the door was cut away");
  assert.equal(r.hidden.w.state.map.objects.find((o) => o.id === "lv").links, undefined, "the lever's link to it went too");
});

// ---- leap (#813, wave 4 part 8): what a Long Jump passes over is not entered, so a hidden thing there is not found and does not stop it ----
const leapScene = (w) => {
  const s = w.state;
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 12).map((h) => [H.col(h), { t: "grass" }]));
  w.must({ type: "loadMap", map: newMap({ id: "leap", name: "Leap", starts: [{ q: 0, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }] }) });
  w.must({ type: "setting", key: "autoEngage", value: false });
  for (const [id, q, r] of [["fighter", 0, 0], ["rogue", -8, 0], ["cleric", -8, 1], ["wizard", -8, 2]]) w.must({ type: "place", actor: id, to: { q, r } });
  Object.assign(s.entities.fighter, { owner: w.ids.Pat, ownerName: "Pat", hp: 500, maxHp: 500 });
  s.entities.fighter.abil.str = 40;                              // 40 ft: eight hexes, a free run-up outside a fight
  w.putIn();                                                     // the hidden thing is in before the script starts
};
const LEAP = { by: "Pat", act: { type: "leap", actor: "fighter", to: { q: 7, r: 0 } } };
test("leap: a hidden creature on a hex the leap passes over: the players are sent what a bare cell sends them", () => {
  const { plain } = twin({ players: ["Pat"], setup: leapScene, steps: [LEAP, { by: "Pat", act: { type: "leap", actor: "fighter", to: { q: 0, r: 0 } } }] },
    { hide: (w) => { w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 3, r: 0 }, name: "Lurker", hidden: true }); }, plain: burn });
  assert.ok(!plain.raw.Pat.some((m) => m.t === "error"), "and the leaps were not refused");
  assert.ok(JSON.stringify(plain.raw.Pat).includes("leaps"), "the script did leap");
});
test("leap: a hidden trap on a hex the leap passes over: the players are sent what a bare cell sends them (it is not set off, found or told)", () => {
  const { plain, hidden } = twin({ players: ["Pat"], setup: leapScene, steps: [LEAP, { by: "Pat", act: { type: "leap", actor: "fighter", to: { q: 0, r: 0 } } }] },
    { hide: (w) => { w.state.map.objects.push({ id: "trap1", def: "spiked-pit", level: "ground", at: { q: 3, r: 0 }, state: "hidden" }); }, plain: () => {} });
  assert.ok(!plain.raw.Pat.some((m) => m.t === "error"));
  assert.ok(!JSON.stringify(hidden.raw.Pat).includes("trap1") && !JSON.stringify(hidden.raw.Pat).includes("triggered"), "nothing of the trap reached the player");
  assert.ok(JSON.stringify(hidden.raw.dm).includes("trap1"), "the trap is there, for the DM");
});
test("leap: a hidden pit that is not found, as a creature's own pit: an undiscovered pit-trap on the line, same bytes", () => {
  twin({ players: ["Pat"], setup: leapScene, steps: [LEAP] },
    { hide: (w) => { w.state.map.objects.push({ id: "pit1", def: "pit-trap", level: "ground", at: { q: 4, r: 0 }, state: "hidden" }); }, plain: () => {} });
});

// ---- Meld into Stone (#824, wave 4 part 10): a creature merged with a wall is, to players who do not run it, exactly as if it were not there ----
// (a) A hostile creature (hidden by the DM from the start) melds into the wall beside the party; the other world has no creature. Before, while the party walks onto its
// space, Searches and casts an area spell over it, and when it leaves the stone unseen: every player is sent the same bytes in both worlds.
const MELD_WALL = [[17.5, -30], [17.5, 30]];
const meldScene = (w, { fight = false } = {}) => {
  const s = w.state;
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  s.map.walls.push({ id: "mw", level: "ground", kind: "wall", a: MELD_WALL[0], b: MELD_WALL[1] });
  w.must({ type: "setting", key: "autoEngage", value: false });
  for (const [id, q, r] of [["fighter", 1, 0], ["rogue", -8, 5], ["cleric", -8, 6], ["wizard", 3, 0]]) w.must({ type: "place", actor: id, to: { q, r } });
  Object.assign(s.entities.fighter, { owner: w.ids.Pat, ownerName: "Pat", hp: 500, maxHp: 500 });
  Object.assign(s.entities.wizard, { owner: w.ids.Pat, ownerName: "Pat", hp: 500, maxHp: 500, slots: { 1: 4, 3: 3 }, slotsMax: { 1: 4, 3: 3 } });
  s.entities.wizard.spells.push("fireball");
};
const MELDED_FOE_SEQ = 2;           // the ids a melded foe uses up in the world that has it (its creature and the spell's effect), spent in the other as well (DEBT T11)
const meldFoe = (w, { seen = false } = {}) => {
  w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 3, r: 1 }, name: "Wallflower", hidden: true });
  const g = byName(w, "Wallflower");
  Object.assign(g, { hp: 500, maxHp: 500, slots: { 3: 2 }, slotsMax: { 3: 2 }, spells: ["meld-into-stone"], castAbil: "wis", prof: 2, abil: { ...g.abil, wis: 14 } });
  w.must({ type: "cast", actor: g.id, spell: "meld-into-stone", slot: 3, wall: { level: "ground", x: 17.5, y: 4 } });
  assert.ok(g.melded, "it is merged");
  if (seen) delete g.hidden;           // no one was sent anything while it was hidden: from here only its being merged keeps it from them
};
const meldTwin = (extra = {}) => ({
  players: ["Pat", "Sam"],
  seed: 7,
  setup: (w) => meldScene(w),
  steps: [
    { by: "Pat", act: { type: "move", actor: "fighter", to: { q: 2, r: 1 } } },                                     // walks past
    { by: "Pat", act: { type: "move", actor: "fighter", to: { q: 3, r: 1 } } },                                     // onto the space the creature stands in
    { by: "Pat", act: { type: "search", actor: "wizard" }, allowError: true },                                      // looks for it
    { by: "Pat", act: { type: "cast", actor: "wizard", spell: "fireball", slot: 3, hex: { q: 3, r: 1 } }, allowError: true },    // an area spell over its space
    { by: "Pat", act: { type: "say", as: "wizard", text: "Hm." } },
    (w) => { const g = byName(w, "Wallflower"); if (g) { const fx = w.state.effects.find((f) => f.source === g.id); w.must({ type: "endEffect", effect: fx.id }); } },     // it leaves the stone, unseen
    { by: "Pat", act: { type: "say", as: "wizard", text: "Nothing." } },
  ],
  ...extra,
});
const meldSides = { hide: (w) => meldFoe(w), plain: (w) => { w.state.seq += MELDED_FOE_SEQ; } };
test("meld into stone: a hidden foe merged with a wall beside the party, and none, are sent the same, as the party walks onto it, Searches, casts over it and it leaves", () => {
  twin(meldTwin(), meldSides);
});
// (b) The same, but the DM never hid the creature: it stands in plain view in the open and merges before anyone is sent anything, so it is the merging alone that keeps it from the players
// (no leaving: a creature that steps out in view is seen).
test("meld into stone: a foe the DM never hid, merged with a wall, is sent as no creature at all, through the same walk, Search and area spell", () => {
  const sc = meldTwin();
  sc.steps = sc.steps.filter((s) => typeof s !== "function");
  twin(sc, { hide: (w) => meldFoe(w, { seen: true }), plain: (w) => { w.state.seq += MELDED_FOE_SEQ; } });
});
// (c) The same under the table's sight rules: the party is sent only what it sees, and a creature merged with stone is seen by no one (partyView, `unknown`, `sees`).
for (const rule of ["los", "light"]) test(`meld into stone: under the ${rule} sight rule a foe in plain view, merged with a wall, is sent as no creature at all`, () => {
  const sc = meldTwin();
  sc.steps = sc.steps.filter((s) => typeof s !== "function");
  const setup = sc.setup;
  sc.setup = (w) => { setup(w); w.must({ type: "setting", key: "sight", value: rule }); };
  twin(sc, { hide: (w) => meldFoe(w, { seen: true }), plain: (w) => { w.state.seq += MELDED_FOE_SEQ; } });
});

// ---- Darkvision (#786 wave 5 part 1): Darkvision lent for 8 hours shows a creature in the dark out to 150 feet; the players are sent what the sight rules give a creature with Darkvision ----
const lurk = (w, at, name) => { const r = apply(w.state, { type: "spawn", monster: "goblin-warrior", at, name }, { role: "dm", userId: "dm" }); assert.ok(r.ok, r.error); Object.assign(byName(w, name), { hp: 500, maxHp: 500 }); };
const darkvisionSetup = (w) => {
  seeInvisibleSetup(w);
  const s = w.state;
  for (let q = -16; q <= 17; q++) s.map.levels[0].tiles[`${q},0`] = { t: "grass" };           // a row long enough for 150 feet
  w.must({ type: "mapEdit", ops: [{ op: "level", level: { id: "ground", light: "dark" } }] });
  w.must({ type: "place", actor: "wizard", to: { q: -14, r: 0 } });
  s.entities.wizard.spells.push("darkvision");
};
test("darkvision: before the spell a creature 140 feet off in the dark is sent to no player (a bare cell); after it the caster's player is sent it; a creature at 155 feet and one behind a wall are sent as a bare cell is", () => {
  const cast = (setup) => ({ players: ["Pat", "Sam"], setup: (w) => { darkvisionSetup(w); setup(w); }, steps: [{ by: "dm", act: { type: "advanceTime", minutes: 1 } }, { by: "Sam", act: { type: "cast", actor: "wizard", spell: "darkvision", target: "wizard", slot: 2 } }, { by: "dm", act: { type: "advanceTime", minutes: 1 } }, { by: "Pat", act: { type: "say", as: "fighter", text: "Anything there?" } }] });
  const before = { players: ["Pat", "Sam"], setup: darkvisionSetup, steps: [{ by: "dm", act: { type: "advanceTime", minutes: 1 } }, { by: "Pat", act: { type: "say", as: "fighter", text: "Anything there?" } }] };
  twin(before, { hide: (w) => lurk(w, { q: 14, r: 0 }, "Lurker"), plain: (w) => burn(w, { q: 13, r: 0 }) });
  const near = twinRun(cast(() => {}), { hide: (w) => lurk(w, { q: 14, r: 0 }, "Lurker"), plain: (w) => burn(w, { q: 13, r: 0 }) });
  assert.ok(near.diffs.length > 0, "the players are told the creature once the spell is cast");
  const sent = (r, who) => JSON.stringify(r.raw[who]).includes("Lurker");
  assert.ok(sent(near.hidden, "Sam") && !sent(near.plain, "Sam"), "the caster's player is sent the creature at 140 feet");
  const far = twin(cast(() => {}), { hide: (w) => lurk(w, { q: 17, r: 0 }, "Lurker"), plain: (w) => burn(w, { q: 16, r: 0 }) });
  assert.ok(!JSON.stringify(far.hidden.raw.Sam).includes("Lurker"), "155 feet: Sam is told of nothing");
  const walled = twin(cast((w) => { w.state.map.walls.push({ id: "wallD", level: "ground", a: [-70, 11], b: [70, 11], kind: "wall" }); w.must({ type: "place", actor: "wizard", to: { q: -2, r: 0 } }); }), { hide: (w) => lurk(w, { q: -2, r: 6 }, "Lurker"), plain: (w) => burn(w, { q: -2, r: 7 }) });
  assert.ok(!JSON.stringify(walled.hidden.raw.Sam).includes("Lurker"), "behind a wall: Sam is told of nothing");
});

// ---- Produce Flame (#786 wave 5 part 1): the flame the caster carries lights 40 feet round it, and no more ----
test("produce flame: a creature in the dark just past the flame's 40 feet is sent as a bare cell is; one inside it is sent to the caster's player after the cast", () => {
  const cast = { players: ["Pat", "Sam"], setup: (w) => { darkvisionSetup(w); w.state.entities.wizard.spells.push("produce-flame"); w.must({ type: "place", actor: "wizard", to: { q: -2, r: 0 } }); }, steps: [{ by: "dm", act: { type: "advanceTime", minutes: 1 } }, { by: "Sam", act: { type: "cast", actor: "wizard", spell: "produce-flame" } }, { by: "dm", act: { type: "advanceTime", minutes: 1 } }, { by: "Pat", act: { type: "say", as: "fighter", text: "Anything there?" } }] };
  const sent = (r, who) => JSON.stringify(r.raw[who]).includes("Lurker");
  const outside = twin(cast, { hide: (w) => lurk(w, { q: 7, r: 0 }, "Lurker"), plain: (w) => burn(w, { q: 8, r: 0 }) });      // 45 feet
  assert.ok(!sent(outside.hidden, "Sam"), "45 feet: Sam is told of nothing");
  const inside = twinRun(cast, { hide: (w) => lurk(w, { q: 4, r: 0 }, "Lurker"), plain: (w) => burn(w, { q: 5, r: 0 }) });     // 30 feet
  assert.ok(inside.diffs.length > 0 && sent(inside.hidden, "Sam") && !sent(inside.plain, "Sam"), "30 feet: the flame shows it");
});

// ---- A light carried by a creature the DM keeps hidden (review of #830, F1): it lights nothing the players are sent ----
test("a DM-hidden foe carrying a light lights nothing the players are sent (sight rule 'light', a dark level)", () => {
  const byN = (w, name) => Object.values(w.state.entities).find((e) => e.name === name);
  const setup = (w) => {
    const s = w.state;
    for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
    for (let q = -16; q <= 17; q++) for (let r = -3; r <= 3; r++) s.map.levels[0].tiles[`${q},${r}`] = { t: "grass" };
    w.must({ type: "setting", key: "autoEngage", value: false });
    w.must({ type: "setting", key: "sight", value: "light" });
    w.must({ type: "mapEdit", ops: [{ op: "level", level: { id: "ground", light: "dark" } }] });
    for (const [id, q, r] of [["fighter", 0, 0], ["rogue", -8, 0], ["cleric", -8, 1], ["wizard", -2, 0]]) w.must({ type: "place", actor: id, to: { q, r } });
    Object.assign(s.entities.fighter, { owner: w.ids.Pat, ownerName: "Pat", hp: 500, maxHp: 500 });
    Object.assign(s.entities.wizard, { owner: w.ids.Sam, ownerName: "Sam" });
  };
  const r = twinRun({ players: ["Pat", "Sam"], setup, steps: [{ by: "dm", act: { type: "advanceTime", minutes: 1 } }, { by: "Pat", act: { type: "say", as: "fighter", text: "Anything?" } }] }, {
    hide: (w) => { w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 8, r: 0 }, name: "Lurker", hidden: true }); Object.assign(byN(w, "Lurker"), { light: { bright: 20, dim: 20 } }); },
    plain: (w) => { w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 9, r: 0 }, name: "Burnt", hidden: true }); delete w.state.entities[byN(w, "Burnt").id]; },
  });
  if (r.diffs.length) assert.fail(describe(r.diffs));
});

// ---- Daylight (#786 wave 5 part 2): a lit sphere is cast where everyone sees it, and the light shows a DM-hidden creature in it to nobody ----
// What the rule shows: the sphere lights the cells (the players are sent the lit area either way); a creature the DM keeps hidden is withheld from the view whether it stands in the light or not.
const daylightSetup = (w) => {
  darkvisionSetup(w);
  const s = w.state;
  w.must({ type: "place", actor: "wizard", to: { q: -2, r: 0 } });
  Object.assign(s.entities.wizard, { slots: { 3: 3 }, slotsMax: { 3: 3 } });
  s.entities.wizard.spells.push("daylight");
};
test("daylight: a DM-hidden creature standing in the lit sphere (or just past its Dim Light) is sent to no player: the worlds with and without it are the same", () => {
  const script = { players: ["Pat", "Sam"], setup: daylightSetup, steps: [{ by: "dm", act: { type: "advanceTime", minutes: 1 } }, { by: "Sam", act: { type: "cast", actor: "wizard", spell: "daylight", hex: { q: 4, r: 0 }, slot: 3 } }, { by: "dm", act: { type: "advanceTime", minutes: 1 } }, { by: "Pat", act: { type: "say", as: "fighter", text: "Anything there?" } }] };
  const sit = (w, at) => { w.must({ type: "spawn", monster: "goblin-warrior", at, name: "Lurker", hidden: true }); Object.assign(byName(w, "Lurker"), { hp: 500, maxHp: 500 }); };
  for (const q of [8, 4 + 12, 4 + 13]) {
    const r = twin(script, { hide: (w) => sit(w, { q, r: 0 }), plain: (w) => burn(w, { q: q - 1, r: 0 }) });
    for (const who of ["Pat", "Sam"]) assert.ok(!JSON.stringify(r.hidden.raw[who]).includes("Lurker"), `${who} is told of nothing (q ${q})`);
  }
});

// ---- Enlarge/Reduce (#786 wave 5 part 2): growth is judged on what the caster's side knows, so a DM-hidden creature in the new space neither stops it nor is told of ----
test("enlarge: a Large fighter growing into the spaces of hidden creatures (all six neighbours) is sent the same as with a bare cell: the growth is not refused or shoved", () => {
  const ring = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  const setup = (w) => {
    seeInvisibleSetup(w);
    const s = w.state;
    w.must({ type: "place", actor: "fighter", to: { q: 0, r: 0 } });
    w.must({ type: "place", actor: "wizard", to: { q: -3, r: 0 } });
    Object.assign(s.entities.wizard, { slots: { 2: 3 }, slotsMax: { 2: 3 } });
    s.entities.wizard.spells.push("enlarge-reduce");
  };
  const script = { players: ["Pat", "Sam"], setup, steps: [{ by: "dm", act: { type: "advanceTime", minutes: 1 } }, { by: "Sam", act: { type: "cast", actor: "wizard", spell: "enlarge-reduce", target: "fighter", choice: "enlarge", slot: 2 } }, { by: "dm", act: { type: "advanceTime", minutes: 1 } }, { by: "Pat", act: { type: "say", as: "fighter", text: "Bigger." } }] };
  const sit = (w) => ring.forEach(([dq, dr], i) => { w.must({ type: "spawn", monster: "goblin-warrior", at: { q: dq, r: dr }, name: `Lurker${i}`, hidden: true }); });
  const r = twin(script, { hide: sit, plain: (w) => ring.forEach(([dq, dr]) => burn(w, { q: dq + 8, r: dr - 6 })) });
  for (const who of ["Pat", "Sam"]) assert.ok(!JSON.stringify(r.hidden.raw[who]).includes("Lurker"), `${who} is told of nothing`);
  assert.ok(JSON.stringify(r.hidden.raw.Pat).includes('"size":"large"'), "it grew (the players are sent the new size)");
});

// ---- review of #832: a non-party caster, and a DM-hidden Daylight caster ----
const wait1 = [{ by: "dm", act: { type: "advanceTime", minutes: 1 } }, { by: "Pat", act: { type: "say", as: "fighter", text: "Anything?" } }];
test("enlarge: a visible foe enlarging itself next to hidden creatures is sent the same as with bare cells (room is judged on what the players know)", () => {
  const ring = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  const setup = (w) => { seeInvisibleSetup(w); w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 4, r: 0 }, name: "Shaman" }); Object.assign(byName(w, "Shaman"), { size: "medium", hp: 500, maxHp: 500, spells: ["enlarge-reduce"], slots: { 2: 3 }, slotsMax: { 2: 3 } }); };
  const script = { players: ["Pat", "Sam"], setup, steps: [{ by: "dm", act: (w) => ({ type: "cast", actor: byName(w, "Shaman").id, spell: "enlarge-reduce", target: byName(w, "Shaman").id, choice: "enlarge", slot: 2 }) }, ...wait1] };
  twin(script, { hide: (w) => ring.forEach(([dq, dr], i) => w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 4 + dq, r: dr }, name: `Lurker${i}`, hidden: true })), plain: (w) => ring.forEach(([dq, dr]) => burn(w, { q: 12 + dq, r: dr - 6 })) });
});
test("daylight: a DM-hidden caster's sphere lights nothing the players are sent (the cast is not public either)", () => {
  const script = { players: ["Pat", "Sam"], setup: darkvisionSetup, steps: wait1 };
  twin(script, {
    hide: (w) => { w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 10, r: 0 }, name: "Mage", hidden: true }); Object.assign(byName(w, "Mage"), { hp: 500, maxHp: 500, spells: ["daylight"], slots: { 3: 3 }, slotsMax: { 3: 3 } }); w.must({ type: "cast", actor: byName(w, "Mage").id, spell: "daylight", hex: { q: 8, r: 0 }, slot: 3 }); },
    plain: (w) => burn(w, { q: 10, r: 0 }),
  });
});

// ---- Conjure Animals and Magic Circle (#786 wave 5 part 3, issue #833) ----
// The pack and the circle are public (their cast shows the cells), but nothing about a DM-hidden creature may reach a player: not a save, an event, a refusal, a stop or a count.
const w5p3Field = (w, { fey = false } = {}) => {
  const s = w.state;
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (let q = -16; q <= 24; q++) for (let r = -8; r <= 8; r++) s.map.levels[0].tiles[`${q},${r}`] = { t: "grass" };
  w.must({ type: "setting", key: "autoEngage", value: false });
  for (const [id, q, r] of [["fighter", fey ? 14 : -8, 0], ["rogue", -8, 1], ["wizard", -8, 2], ["cleric", 0, 0]]) w.must({ type: "place", actor: id, to: { q, r } });
  Object.assign(s.entities.cleric, { owner: w.ids.Pat, ownerName: "Pat", spells: [...s.entities.cleric.spells, "conjure-animals", "magic-circle"], slots: { ...s.entities.cleric.slots, 3: 3 }, slotsMax: { ...s.entities.cleric.slotsMax, 3: 3 } });
  Object.assign(s.entities.fighter, { owner: w.ids.Pat, ownerName: "Pat", hp: 500, maxHp: 500 });
  if (fey) s.entities.fighter.type = "fey";
};
const packScript = (steps) => ({
  players: ["Pat"],
  setup(w) { w5p3Field(w); w.putIn(); w.must({ type: "startEncounter", center: { q: 0, r: 0 }, radius: 3 }); turnOf(w, "cleric"); },
  steps,
});
const ghost = (q, r) => ({ hide: (w) => { w.must({ type: "spawn", monster: "goblin-warrior", at: { q, r }, name: "Ghost", hidden: true }); }, plain: (w) => { burn(w, { q, r }); } });
test("conjure animals: a cast on a space a hidden creature stands in, and the pack moved onto another hidden creature's space and over a third, is accepted and sent the same as over bare cells", () => {
  twin(packScript([
    { by: "Pat", act: { type: "cast", actor: "cleric", spell: "conjure-animals", slot: 3, hex: { q: 4, r: 0 } } },
    { by: "Pat", act: { type: "move", actor: "cleric", to: { q: -1, r: 0 } } },
    { by: "Pat", act: { type: "moveZone", actor: "cleric", to: { q: 8, r: 0 } } },
    { by: "Pat", act: { type: "say", as: "fighter", text: "Anything?" } },
  ]), {
    hide: (w) => { for (const [q, r, n] of [[5, 0, "GhostA"], [8, 0, "GhostB"], [11, 0, "GhostC"]]) w.must({ type: "spawn", monster: "goblin-warrior", at: { q, r }, name: n, hidden: true }); },
    plain: (w) => { for (const [q, r] of [[5, 0], [8, 0], [11, 0]]) burn(w, { q, r }); },
  });
});
test("conjure animals: a hidden creature the pack's zone reaches, by the pack moving to it and by it walking in, is made to save nothing and sent no player", () => {
  const r = twin(packScript([
    { by: "Pat", act: { type: "cast", actor: "cleric", spell: "conjure-animals", slot: 3, hex: { q: 4, r: 0 } } },
    { by: "Pat", act: { type: "move", actor: "cleric", to: { q: -1, r: 0 } } },
    { by: "Pat", act: { type: "moveZone", actor: "cleric", to: { q: 9, r: 0 } } },
    { by: "dm", act: (w) => ({ type: "move", actor: byName(w, "Ghost")?.id ?? "nobody", to: { q: 12, r: 1 } }), allowError: true },
    { by: "Pat", act: { type: "check", actor: "fighter", skill: "athletics" } },
    { by: "Pat", act: { type: "say", as: "fighter", text: "Anything?" } },
  ]), ghost(11, 0));
  assert.ok(!JSON.stringify(r.hidden.raw.Pat).includes("Ghost"));
});
const circleScript = (steps, { fey = false } = {}) => ({
  players: ["Pat"],
  setup(w) { w5p3Field(w, { fey }); w.must({ type: "place", actor: "cleric", to: { q: 6, r: 0 } }); w.putIn(); },
  steps: [{ by: "Pat", act: { type: "cast", actor: "cleric", spell: "magic-circle", slot: 3, hex: { q: 8, r: 0 }, choice: ["fey"] } }, ...steps],
});
test("magic circle: a DM-hidden creature of a chosen type that tries to walk in, and one that walks up to the edge, is sent no player and changes nothing they see", () => {
  const r = twin(circleScript([
    { by: "dm", act: (w) => ({ type: "move", actor: byName(w, "Ghost")?.id ?? "nobody", to: { q: 8, r: 0 } }), allowError: true },
    { by: "dm", act: (w) => ({ type: "move", actor: byName(w, "Ghost")?.id ?? "nobody", to: { q: 11, r: 0 } }), allowError: true },
    { by: "Pat", act: { type: "say", as: "fighter", text: "Anything?" } },
  ]), ghost(14, 3));
  assert.ok(!JSON.stringify(r.hidden.raw.Pat).includes("Ghost"));
});
test("magic circle: a party creature of a chosen type that tries to walk into a hidden creature's space inside the circle, or ends its move beside the circle, is refused and sent the same as over a bare cell", () => {
  const r = twin(circleScript([
    { by: "Pat", act: { type: "move", actor: "fighter", to: { q: 8, r: 0 } }, allowError: true },
    { by: "Pat", act: { type: "move", actor: "fighter", to: { q: 9, r: 0 } }, allowError: true },
    { by: "Pat", act: { type: "move", actor: "fighter", to: { q: 11, r: 0 } }, allowError: true },
    { by: "Pat", act: { type: "move", actor: "fighter", to: { q: 11, r: 1 } }, allowError: true },
  ], { fey: true }), ghost(8, 0));
  assert.ok(!JSON.stringify(r.hidden.raw.Pat).includes("Ghost"));
  assert.ok(JSON.stringify(r.hidden.raw.Pat).includes("keeps"), "the party's creature was refused by the circle");
});

// ---- review of #837: a circle cast by a DM-hidden creature binds nothing the players are sent (attack Disadvantage, Charmed/Frightened refusal) ----
const hiddenCircle = (w) => {
  w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 6, r: 0 }, name: "Ghost", hidden: true });
  Object.assign(byName(w, "Ghost"), { hp: 500, maxHp: 500, spells: ["magic-circle"], slots: { 3: 3 }, slotsMax: { 3: 3 } });
  w.must({ type: "cast", actor: byName(w, "Ghost").id, spell: "magic-circle", hex: { q: 8, r: 0 }, slot: 3, choice: ["fey"] });
};
// The plain world spends the same ids (creature and effect counters are shared, DEBT T11) and then drops both the caster and its circle.
const burnCircle = (w) => { hiddenCircle(w); delete w.state.entities[byName(w, "Ghost").id]; w.state.effects = w.state.effects.filter((fx) => !fx.zone?.ward); };
const seenInCircle = (w, monster = "goblin-warrior") => { w.must({ type: "spawn", monster, at: { q: 10, r: 0 }, name: "Seen" }); Object.assign(byName(w, "Seen"), { hp: 500, maxHp: 500 }); };
test("magic circle: a party creature of a chosen type attacking a target inside a hidden caster's circle (a fight started with the caster outside) rolls as it would with no circle", () => {
  const script = {
    players: ["Pat"],
    setup(w) { w5p3Field(w, { fey: true }); w.must({ type: "place", actor: "fighter", to: { q: 11, r: 0 } }); seenInCircle(w); w.putIn(); },
    steps: [
      { by: "dm", act: { type: "startEncounter", center: { q: 11, r: 0 }, radius: 3 } },
      { by: "Pat", act: (w) => { turnOf(w, "fighter"); return { type: "attack", actor: "fighter", attack: "longsword", target: byName(w, "Seen").id }; } },
    ],
  };
  const r = twin(script, { hide: hiddenCircle, plain: burnCircle });
  assert.ok(!JSON.stringify(r.hidden.raw.Pat).includes("Ghost"));
});
test("magic circle: a party creature of a chosen type giving Charmed to a target inside a hidden caster's circle is sent the same as with no circle (no refusal note)", () => {
  const script = {
    players: ["Pat"],
    setup(w) { w5p3Field(w, { fey: true }); w.must({ type: "place", actor: "wizard", to: { q: 13, r: 0 } }); seenInCircle(w, "bandit"); byName(w, "Seen").abil.wis = 1; Object.assign(w.state.entities.wizard, { type: "fey", spells: [...w.state.entities.wizard.spells, "charm-person"], slots: { 1: 3 }, slotsMax: { 1: 3 } }); w.putIn(); },
    steps: [{ by: "dm", act: { type: "startEncounter", center: { q: 11, r: 0 }, radius: 4 } }, { by: "dm", act: (w) => { turnOf(w, "wizard"); return { type: "cast", actor: "wizard", spell: "charm-person", target: byName(w, "Seen").id, slot: 1 }; } }],
  };
  const r = twin(script, { hide: hiddenCircle, plain: burnCircle });
  assert.ok(!JSON.stringify(r.hidden.raw.Pat).includes("Ghost"));
  assert.ok(!JSON.stringify(r.hidden.raw.Pat).includes("keeps"), "no refusal told");
});

// ---- Lasting zones (#842): what players are sent of a zone, and what they are not ----
// A zone is put in through the rules, as a cast leaves it (rules zones.js: area, on, follows or hexes and origin, spare, steps, src, last), because a creature the DM
// has hidden cannot cast in a fight, and one that casts is told of. The players are kept clear of every zone: a creature that walked into one would be hurt by it, and
// that is a real difference between the worlds.
const zoneWorld = (w, fighterAt = { q: -4, r: 0 }) => {
  const s = w.state;
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  w.must({ type: "setting", key: "autoEngage", value: false });
  for (const [id, q, r] of [["fighter", fighterAt.q, fighterAt.r], ["rogue", -8, 0], ["cleric", -8, 1], ["wizard", -8, 2]]) w.must({ type: "place", actor: id, to: { q, r } });
  Object.assign(s.entities.fighter, { owner: w.ids.Pat, ownerName: "Pat", hp: 500, maxHp: 500 });
};
const STEPS = [{ save: "dex", dc: 14, half: true, onFail: [{ damage: "3d8", type: "radiant" }] }];
// A zone of `who` as a cast makes it. `shape` is what differs: `follows`, or `hexes` and `origin`, with `area`.
const zoneFor = (w, who, spell, name, shape, more = {}) => {
  const fx = startEffect(w.state, { name, spell, source: who.id, conc: true, duration: "1 minute", level: 2 });
  fx.zone = { on: ["enter", "turnEnd"], spare: [], steps: structuredClone(STEPS), src: { name, dc: 14, range: 60 }, last: {}, ...shape, ...more };
  return fx;
};
const cellsAround = (at, n) => H.range(at, n).map(H.col);
const hideOne = (w, at, name = "Ghost", monster = "goblin-warrior") => { w.must({ type: "spawn", monster, at, name, hidden: true }); const g = byName(w, name); Object.assign(g, { hp: 500, maxHp: 500 }); return g; };
const walk = (name, ...to) => to.map((t) => (w) => { const o = byName(w, name) ?? (name === "Ghost" ? byName(w, "Other") : null); if (!o) return; w.must({ type: "move", actor: o.id, to: t }); });

test("zones: Spirit Guardians round a hidden caster that walks about is sent the same as with no caster there, and its cells follow nothing", () => {
  twin({
    players: ["Pat"],
    setup: (w) => zoneWorld(w),
    steps: [
      ...walk("Ghost", { q: 5, r: 1 }, { q: 4, r: 3 }, { q: 6, r: -2 }),
      { by: "Pat", act: { type: "move", actor: "fighter", to: { q: -5, r: 1 } } },
      ...walk("Ghost", { q: 3, r: 4 }),
    ],
  }, {
    hide: (w) => { const g = hideOne(w, { q: 5, r: 0 }); zoneFor(w, g, "spirit-guardians", "Spirit Guardians", { area: { shape: "emanation", size: 15 }, follows: g.id }); },
    plain: (w) => { burn(w, { q: 5, r: 0 }); w.state.seq++; },
  });
});

test("zones: a zone whose `spare` names a creature the DM has hidden is sent the same as one that names nobody", () => {
  twin({
    players: ["Pat"],
    setup(w) {
      zoneWorld(w);
      w.putIn();
      Object.assign(w.state.entities.cleric, { owner: w.ids.Pat, ownerName: "Pat", spells: [...w.state.entities.cleric.spells, "spirit-guardians"], slots: { ...w.state.entities.cleric.slots, 3: 2 }, slotsMax: { ...w.state.entities.cleric.slotsMax, 3: 2 } });
      w.must({ type: "place", actor: "cleric", to: { q: -6, r: 0 } });
      w.must({ type: "startEncounter", center: { q: -6, r: 0 }, radius: 1 });
      turnOf(w, "cleric");
    },
    steps: [
      // The DM casts for the cleric: a player's own cast that names a creature they cannot see is refused (`No such creature.`), the same whether or not it is there.
      { by: "dm", act: (w) => ({ type: "cast", actor: "cleric", spell: "spirit-guardians", slot: 3, choice: "radiant", spare: w.variant === "hidden" ? ["fighter", byName(w, "Ghost").id] : ["fighter"] }) },
      { by: "Pat", act: (w) => ({ type: "endTurn", actor: current(w.state) }), allowError: true },
    ],
  }, {
    hide: (w) => { hideOne(w, { q: 5, r: 0 }); },
    plain: (w) => { hideOne(w, { q: 5, r: 0 }); },
  });
});

test("zones: a zone in a region the party has not explored is sent to no player, the same as with no zone there", () => {
  const vault = (w) => {
    const s = w.state, tiles = s.map.levels[0].tiles;
    s.map.regions = [{ id: "hall", name: "The hall", level: s.map.levels[0].id, hexes: Object.keys(tiles).filter((k) => H.parse(k).q < 4), revealed: true }, { id: "vault", name: "The vault", level: s.map.levels[0].id, hexes: Object.keys(tiles).filter((k) => H.parse(k).q >= 4) }];
  };
  twin({
    players: ["Pat"],
    setup(w) { zoneWorld(w); vault(w); },
    steps: [{ by: "Pat", act: { type: "move", actor: "fighter", to: { q: -5, r: 1 } } }, ...walk("Ghost", { q: 9, r: 2 })],
  }, {
    hide: (w) => { const g = hideOne(w, { q: 8, r: 0 }); zoneFor(w, g, "moonbeam", "Moonbeam", { area: { shape: "cylinder", size: 5, height: 40 }, hexes: cellsAround({ q: 8, r: 3 }, 1), origin: { q: 8, r: 3, z: 0 } }); },
    plain: (w) => { burn(w, { q: 8, r: 0 }); w.state.seq++; },
  });
});

test("zones: a Moonbeam cast by a hidden caster is sent the same whichever hidden caster it was (the zone is in both worlds; only the caster differs)", () => {
  const moonbeam = (w, g) => zoneFor(w, g, "moonbeam", "Moonbeam", { area: { shape: "cylinder", size: 5, height: 40 }, hexes: cellsAround({ q: 3, r: 1 }, 1), origin: { q: 3, r: 1, z: 0 } });
  const r = twin({
    players: ["Pat"],
    setup: (w) => zoneWorld(w),
    steps: [{ by: "Pat", act: { type: "move", actor: "fighter", to: { q: -5, r: 1 } } }, ...walk("Ghost", { q: 7, r: 0 })],
  }, {
    hide: (w) => { moonbeam(w, hideOne(w, { q: 6, r: 0 })); },
    plain: (w) => { burn(w, { q: 9, r: -4 }); moonbeam(w, hideOne(w, { q: 5, r: 3 }, "Other", "owl")); },      // the other caster has another id, and the effect another number
  });
  const text = JSON.stringify(r.hidden.raw.Pat);
  assert.ok(text.includes('"Moonbeam"') && text.includes('"zone"'), "the zone itself is sent, in both worlds");
  for (const k of ["Ghost", "Other", "\"owl\""]) assert.ok(!text.includes(k), `and nothing of whose it is: ${k} at ${text.indexOf(k)}: ${text.slice(Math.max(0, text.indexOf(k) - 80), text.indexOf(k) + 60)}`);
});

test("zones: a rolled zone of a hidden caster tells players the zone moved, and never who moved it", () => {
  const sphere = (w, g) => zoneFor(w, g, "flaming-sphere", "Flaming Sphere", { area: { shape: "sphere", size: 5 }, hexes: cellsAround({ q: 3, r: 1 }, 1), origin: { q: 3, r: 1, z: 0 } }, { move: 30 });
  const roll = (name, to) => (w) => { const o = byName(w, name) ?? byName(w, "Other"); w.must({ type: "moveZone", actor: o.id, to }); };
  const r = twin({
    players: ["Pat"],
    setup: (w) => zoneWorld(w),
    steps: [roll("Ghost", { q: 3, r: 3 }), roll("Ghost", { q: 5, r: 3 })],
  }, {
    hide: (w) => { sphere(w, hideOne(w, { q: 6, r: 0 })); },
    plain: (w) => { burn(w, { q: 9, r: -4 }); sphere(w, hideOne(w, { q: 8, r: -3 }, "Other", "owl")); },
  });
  const moved = r.hidden.raw.Pat.flatMap((m) => JSON.stringify(m).match(/"type":"zoneMoved"[^}]*}[^}]*}/g) ?? []);
  assert.ok(moved.length >= 1, "the players were told the zone moved");
  for (const m of moved) assert.ok(!m.includes('"by"') && !m.includes("Ghost"), m);
});

test("zones: Spike Growth of a foe the party sees is sent to no player; the same zone as Moonbeam is, so the twin is not empty", () => {
  const script = (spell, name) => ({
    players: ["Pat"],
    setup(w) { zoneWorld(w); w.must({ type: "spawn", monster: "goblin-warrior", at: { q: 6, r: 0 }, name: "Seen" }); Object.assign(byName(w, "Seen"), { hp: 500, maxHp: 500 }); w.putIn(); },
    steps: [{ by: "Pat", act: { type: "move", actor: "fighter", to: { q: -5, r: 1 } } }],
  });
  const put = (spell, name, area) => ({ hide: (w) => { zoneFor(w, byName(w, "Seen"), spell, name, { area, hexes: cellsAround({ q: 3, r: 1 }, 2), origin: { q: 3, r: 1, z: 0 } }); }, plain: (w) => { w.state.seq++; } });
  twin(script(), put("spike-growth", "Spike Growth", { shape: "sphere", size: 20 }));
  const control = twinRun(script(), put("moonbeam", "Moonbeam", { shape: "cylinder", size: 5, height: 40 }));
  assert.ok(control.diffs.length > 0, "a zone that is not camouflaged is told of: the worlds differ");
});

// ---- Polymorph (#786 wave 5 part 4, #835): the form is the target's, so a player is told of it; who cast it and where from are not told unless the caster is known ----
// Decided: a creature of the party that is polymorphed is sent the change (form, size, Temporary Hit Points, the effect's start and end), whoever cast it; the cast itself, the caster's name and position, and any note that
// names the caster as its actor (the DM-only hand-over, the "no room" note) go only where the caster is known to the party. Two worlds that differ in WHO the hidden caster is (name and place) must be sent the same bytes.
const polySetup = (w) => {
  seeInvisibleSetup(w);
  w.must({ type: "place", actor: "fighter", to: { q: 0, r: 0 } });
  w.must({ type: "place", actor: "wizard", to: { q: -3, r: 0 } });
  w.state.entities.fighter.saveBonus = { ...w.state.entities.fighter.saveBonus, wis: -100 };      // a foe's cast: it saves, and fails
};
const hiddenCaster = (name, at) => (w) => {
  w.must({ type: "spawn", monster: "goblin-warrior", at, name, hidden: true });
  Object.assign(byName(w, name), { hp: 500, maxHp: 500, spells: ["polymorph"], slots: { 4: 3 }, slotsMax: { 4: 3 } });
  w.must({ type: "cast", actor: byName(w, name).id, spell: "polymorph", target: "fighter", choice: "wolf", slot: 4 });
};
test("polymorph: a DM-hidden caster polymorphing a party member: the players are sent the form and not the caster, the same whoever (and wherever) the hidden caster is", () => {
  const script = { players: ["Pat", "Sam"], setup: polySetup, steps: [{ by: "dm", act: { type: "advanceTime", minutes: 1 } }, { by: "dm", act: { type: "harm", actor: "fighter", amount: 3 } }, { by: "Pat", act: { type: "say", as: "fighter", text: "Woof." } },
    { by: "dm", act: { type: "harm", actor: "fighter", amount: 30 } }, { by: "Pat", act: { type: "say", as: "fighter", text: "Back." } }] };
  const r = twin(script, { hide: hiddenCaster("Mage", { q: 6, r: 0 }), plain: hiddenCaster("Witch", { q: 9, r: 2 }) });
  for (const who of ["Pat", "Sam"]) { const raw = JSON.stringify(r.hidden.raw[who]); assert.ok(!raw.includes("Mage") && !raw.includes("Witch"), `${who} is not told who cast it`); }
  { const raw = JSON.stringify(r.hidden.raw.Pat); assert.ok(raw.includes("\"type\":\"form\"") && raw.includes('"form":"wolf"') && raw.includes('"name":"Polymorph"'), "the party member's form and the effect on it are sent (the record)"); }
});
test("polymorph: a party member polymorphed beside hidden creatures that a Large Beast would overlap is sent the same as with bare cells (not refused, not made smaller, no note)", () => {
  const ring = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
  const setup = (w) => { polySetup(w); Object.assign(w.state.entities.wizard, { slots: { 4: 3 }, slotsMax: { 4: 3 } }); w.state.entities.wizard.spells.push("polymorph"); };
  const script = { players: ["Pat", "Sam"], setup, steps: [{ by: "dm", act: { type: "advanceTime", minutes: 1 } }, { by: "Sam", act: { type: "cast", actor: "wizard", spell: "polymorph", target: "fighter", choice: "brown-bear", slot: 4 } }, { by: "dm", act: { type: "advanceTime", minutes: 1 } }, { by: "Pat", act: { type: "say", as: "fighter", text: "Grr." } }] };
  const r = twin(script, { hide: (w) => ring.forEach(([dq, dr], i) => w.must({ type: "spawn", monster: "goblin-warrior", at: { q: dq, r: dr }, name: `Lurker${i}`, hidden: true })), plain: (w) => ring.forEach(([dq, dr]) => burn(w, { q: dq + 8, r: dr - 6 })) });
  for (const who of ["Pat", "Sam"]) assert.ok(!JSON.stringify(r.hidden.raw[who]).includes("Lurker"), `${who} is told of nothing`);
  assert.ok(JSON.stringify(r.hidden.raw.Pat).includes('"size":"large"'), "it became a Large Beast");
});

// ---- swimming (#836, E1): a creature under the water is in its level, so what hides a creature on land hides it there ----
// A lake of water 15 feet deep from q = 1 east, its far water (q 5 and beyond) a region the party has not seen. The party's fighter swims in the near water, down
// to 10 feet under the surface and across. A creature swimming under the far water (not hidden by the DM: hidden by the region), and a creature the DM hid there,
// are sent to no player: the worlds with and without them are the same, in every message.
const lakeScene = (w) => {
  const s = w.state;
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  const tiles = {};
  for (let q = -4; q <= 8; q++) for (let r = -3; r <= 3; r++) tiles[H.col({ q, r })] = q >= 1 ? { t: "water", depth: 15 } : { t: "grass" };
  const far = Object.keys(tiles).filter((k) => Number(k.split(",")[0]) >= 5);
  w.must({ type: "loadMap", map: newMap({ id: "lake", name: "Lake", starts: [{ q: 0, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }], regions: [{ id: "deep", name: "Far water", level: "ground", hexes: far, revealed: false }] }) });
  w.must({ type: "setting", key: "autoEngage", value: false });
  for (const [id, q, r] of [["fighter", 0, 0], ["rogue", -3, 0], ["cleric", -3, 1], ["wizard", -3, 2]]) w.must({ type: "place", actor: id, to: { q, r } });
  Object.assign(s.entities.fighter, { owner: w.ids.Pat, ownerName: "Pat", hp: 500, maxHp: 500 });
};
const SWIM = [
  { by: "Pat", act: { type: "move", actor: "fighter", to: { q: 2, r: 0, z: 0 } } },
  { by: "Pat", act: { type: "move", actor: "fighter", to: { q: 2, r: 0, z: -10 } } },
  { by: "Pat", act: { type: "move", actor: "fighter", to: { q: 3, r: 0, z: -10 } } },
  { by: "Pat", act: { type: "say", as: "fighter", text: "Anything down here?" } },
];
const swimmer = (w, hidden) => {
  w.must({ type: "spawn", monster: "goblin-warrior", at: { q: -4, r: 0 }, name: "Lurker", hidden: true });          // spawned hidden, so no one is sent it on the shore on its way in
  Object.assign(byName(w, "Lurker"), { pos: { q: 6, r: 0, z: -10 }, hp: 500, maxHp: 500 });
  if (!hidden) delete byName(w, "Lurker").hidden;                                                                      // from here only the region hides it
};
for (const hidden of [false, true]) test(`swimming: a creature ${hidden ? "the DM hid" : "in a region the party has not seen"}, under the far water, is sent to no player; the worlds with and without it are the same`, () => {
  const r = twin({ players: ["Pat", "Sam"], setup: lakeScene, steps: SWIM }, { hide: (w) => swimmer(w, hidden), plain: (w) => burn(w, { q: -4, r: 0 }) });
  for (const who of ["Pat", "Sam"]) assert.ok(!JSON.stringify(r.hidden.raw[who]).includes("Lurker"), `${who} is told of nothing`);
  assert.ok(JSON.stringify(r.hidden.raw.dm).includes("Lurker"), "the DM is told of it");
  assert.deepEqual(r.hidden.w.state.entities.fighter.pos, { q: 3, r: 0, z: -10 }, "the swimmer went where it was sent");
  assert.equal(r.hidden.w.state.map.regions[0].revealed, false, "and the far water stayed unseen");
});
