// The table rule `strikeFirst` (#585; docs/specs/table-ui.md, E23 as amended). 'off' (the SRD's way, and a new table's): an
// attack, a hostile cast or a monster's action outside a fight starts the fight and is not made; everyone rolls Initiative
// and the creature makes it on its turn. 'all' (a house rule): it lands first, then the fight starts, in the same action.
// 'casts' (the rule as #372 built it, which a table saved before #585 gets) is tested in e23-*.test.js; here only that
// it lands no attack and no action. "On" below is 'all'. And the review of #594: a hiding creature's strike (M1), a
// creature in a place not yet seen (M2).
// Here: the setting, both ways for a character's attack, a monster's `act` (and `attack` with a monster's action) and a
// cast; a player's attack at a foe; what a strike made first refuses; a refused strike changes nothing; a Reaction taken
// during it; a player asked; undo, replay and a save and load; a hidden monster's strike (twin runs); the migration.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as E from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { migrate, VERSION } from "../src/migrate.js";
import { viewEvents, view } from "../src/view.js";
import { squareRoom } from "./fixtures/square-room.js";
import { kit, DM, U1, U3, PLAYERS, GRIDS, SPOTS, json, ok } from "./e23-kit.js";

const { apply, current, SETTINGS } = E;
const K = kit({ apply, current, makeEntity: E.makeEntity, derive, newGame, squareRoom });
const at = (r, type) => r.events.findIndex((e) => e.type === type);
const types = (r) => r.events.map((e) => e.type);
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
// A goblin warrior (a pack monster: its Scimitar is an action) beside the fighter.
const next = (grid) => { const F = SPOTS[grid].fighter; return { q: F.q, r: F.r - 1 }; };
function goblin(s, grid, { hidden = false, name = null } = {}) {
  ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: next(grid), ...(hidden ? { hidden: true } : {}) }, DM));
  const id = Object.keys(s.entities).find((k) => s.entities[k].tpl === "goblin-warrior");
  if (name) s.entities[id].name = name;
  return id;
}
// The priest (a character sheet: its Mace is a flat attack) beside the cleric, as e23-scenarios.js has it.
const priestBy = (s, grid) => { const C = SPOTS[grid].cleric; ok(apply(s, { type: "place", actor: "priest", to: { q: C.q + 1, r: C.r } }, DM)); };
const MACE = { type: "attack", actor: "priest", target: "cleric", attack: "mace" };
const ON = { strikeFirst: "all" };

test("the setting: off unless set (a new game has none), the DM's to switch, 'off', 'casts' or 'all'", () => {
  assert.deepEqual(SETTINGS.strikeFirst, ["off", "casts", "all"]);
  const s = newGame(5);
  assert.equal(s.settings.strikeFirst, undefined, "a new table: off");
  assert.equal(apply(s, { type: "setting", key: "strikeFirst", value: "all" }, U1).ok, false);
  for (const v of [true, false, "yes"]) assert.equal(apply(s, { type: "setting", key: "strikeFirst", value: v }, DM).ok, false);
  for (const v of ["all", "casts", "off"]) { ok(apply(s, { type: "setting", key: "strikeFirst", value: v }, DM)); assert.equal(s.settings.strikeFirst, v); }
});

test("the migration: a table saved before version 27 gets 'casts' where autoEngage was on (or unset), else 'off'; a new one is left as it is", () => {
  assert.equal(VERSION, 31);
  for (const on of [true, false, undefined]) {
    const old = newGame(5); old.version = 26; if (on === undefined) delete old.settings.autoEngage; else old.settings.autoEngage = on;
    migrate(old);
    assert.equal(old.settings.strikeFirst, on === false ? "off" : "casts");
    assert.equal(old.version, 31);
    const again = json(old); migrate(old); assert.equal(json(old), again, "migrating again changes nothing");
  }
  const fresh = newGame(5), f = json(fresh); migrate(fresh); assert.equal(json(fresh), f);
  const off = newGame(5); off.settings.strikeFirst = "all"; off.settings.autoEngage = false; migrate(off);
  assert.equal(off.settings.strikeFirst, "all", "a choice made at version 27 is kept");
});

for (const grid of GRIDS) {
  test(`${grid}: off (the SRD's way): an attack, a monster's action and a cast start the fight and are not made; 'casts' lands no attack or action`, () => {
    for (const autoEngage of [true, false]) {
      for (const sf of ["off", "casts"]) {
        const a = K.table(grid, { autoEngage, strikeFirst: sf }); priestBy(a, grid);
        assert.equal(types(ok(apply(a, MACE, DM))).includes("attack"), false, sf);
        const b = K.table(grid, { autoEngage, strikeFirst: sf }), g = goblin(b, grid);
        assert.equal(types(ok(apply(b, { type: "act", actor: g, action: "scimitar", target: "fighter" }, DM))).includes("attack"), false, sf);
        assert.ok(b.encounter);
      }
      const a = K.table(grid, { autoEngage, strikeFirst: "off" }); priestBy(a, grid);
      const ra = ok(apply(a, MACE, DM));
      assert.equal(types(ra).includes("attack"), false); assert.ok(a.encounter && at(ra, "encounterStart") >= 0);
      const b = K.table(grid, { autoEngage, strikeFirst: "off" }), g = goblin(b, grid);
      for (const act of [{ type: "act", actor: g, action: "scimitar", target: "fighter" }, { type: "attack", actor: g, target: "fighter", attack: "scimitar" }]) {
        const t = structuredClone(b), r = ok(apply(t, act, DM));
        assert.equal(types(r).includes("attack"), false, act.type); assert.ok(t.encounter);
        assert.equal(t.entities.fighter.hp, b.entities.fighter.hp);
      }
      const c = K.table(grid, { autoEngage, strikeFirst: "off" }), rc = ok(apply(c, K.CASTS.attack(grid), DM));
      assert.equal(at(rc, "cast"), -1); assert.ok(c.encounter);
      const p = K.table(grid, { autoEngage, strikeFirst: "off" }), gp = goblin(p, grid);
      const rp = ok(apply(p, { type: "attack", actor: "fighter", target: gp, attack: "longsword" }, U1));
      assert.equal(types(rp).includes("attack"), false, "a player's attack too"); assert.ok(p.encounter);
    }
  });

  test(`${grid}: on: a character's attack, a monster's action and a player's attack land, then the fight starts; the first turn is whole`, () => {
    const a = K.table(grid, ON); priestBy(a, grid);
    const ra = ok(apply(a, MACE, DM));
    assert.ok(at(ra, "attack") >= 0 && at(ra, "attack") < at(ra, "encounterStart"), json(types(ra)));
    assert.ok(a.encounter.order.some((o) => o.id === "priest") && a.encounter.order.some((o) => o.id === "cleric"));
    turnOf(a, "priest");
    assert.equal(a.encounter.budget.action, 1, "the attacker's first turn has its action");
    const b = K.table(grid, ON), g = goblin(b, grid);
    for (const act of [{ type: "act", actor: g, action: "scimitar", target: "fighter" }, { type: "attack", actor: g, target: "fighter", attack: "scimitar" }]) {
      const t = structuredClone(b), r = ok(apply(t, act, DM));
      assert.ok(at(r, "attack") >= 0 && at(r, "attack") < at(r, "encounterStart"), `${act.type}: ${json(types(r))}`);
      assert.ok(t.encounter.order.some((o) => o.id === g) && t.encounter.order.some((o) => o.id === "fighter"));
    }
    const p = K.table(grid, ON), gp = goblin(p, grid);
    const rp = ok(apply(p, { type: "attack", actor: "fighter", target: gp, attack: "longsword" }, U1));
    assert.ok(at(rp, "attack") >= 0 && at(rp, "attack") < at(rp, "encounterStart"), "a player's attack at a foe lands first");
    // Not at a creature of another side (the goblin at a foe): the fight starts and nothing is made, as with the rule off.
    const q = K.table(grid, ON), gq = goblin(q, grid); ok(apply(q, { type: "place", actor: "priest", to: { ...next(grid), q: next(grid).q + 1 } }, DM));
    const rq = ok(apply(q, { type: "act", actor: gq, action: "scimitar", target: "priest" }, DM));
    assert.equal(types(rq).includes("attack"), false);
  });

  test(`${grid}: on: what needs a turn in a fight is refused before anything changes; a refused strike changes nothing`, () => {
    const s = K.table(grid, ON), g = goblin(s, grid), was = json(s);
    for (const extra of [{ brutal: "topple" }, { cunning: [] }, { prey: g }, { grab: true }]) {
      const r = apply(s, { type: "attack", actor: "fighter", target: g, attack: "longsword", ...extra }, U1);
      assert.equal(r.ok, false, json(extra));
      assert.equal(json(s), was, `${json(extra)}: nothing changed`);
    }
    assert.equal(apply(s, { type: "attack", actor: "priest", target: "cleric", attack: "mace" }, DM).ok, false, "out of reach");
    assert.equal(apply(s, { type: "act", actor: g, action: "scimitar", target: "wizard" }, DM).ok, false, "out of reach");
    assert.equal(json(s), was);
    assert.equal(apply(s, { type: "act", actor: g, action: "multiattack", target: "fighter" }, DM).ok, false);
    assert.equal(json(s), was);
  });

  test(`${grid}: on: a Shield taken during the attack stays spent into the fight; a player asked answers first`, () => {
    let found = 0;
    for (let seed = 1; seed <= 40 && !found; seed++) {
      const s = K.table(grid, { ...ON, seed, ward: { shield: "always" } }), g = goblin(s, grid);
      ok(apply(s, { type: "place", actor: g, to: { ...SPOTS[grid].wizard, q: SPOTS[grid].wizard.q + 1 } }, DM));
      const r = ok(apply(s, { type: "act", actor: g, action: "scimitar", target: "wizard" }, DM));
      const sh = r.events.findIndex((e) => e.type === "reaction" && e.reaction === "shield");
      if (sh < 0) continue;
      found = seed;
      assert.ok(sh < at(r, "encounterStart"));
      assert.equal(s.entities.wizard.reactionUsed, true, "still spent as the fight starts");
      turnOf(s, "wizard");
      assert.equal(s.entities.wizard.reactionUsed, false, "back at the start of its turn");
      // Asked: the whole act waits, nothing has started; the answer makes it, then the fight starts.
      const t = K.table(grid, { ...ON, seed, ward: { shield: "ask" } }), h = goblin(t, grid);
      ok(apply(t, { type: "place", actor: h, to: { ...SPOTS[grid].wizard, q: SPOTS[grid].wizard.q + 1 } }, DM));
      const q = ok(apply(t, { type: "act", actor: h, action: "scimitar", target: "wizard" }, DM));
      assert.deepEqual(types(q), ["reactionAsked"]);
      assert.ok(t.pending && !t.encounter);
      const a = ok(apply(t, { type: "react", prompt: t.pending.n, take: "shield" }, U3));
      assert.ok(at(a, "attack") >= 0 && at(a, "attack") < at(a, "encounterStart"), json(types(a)));
      assert.ok(t.encounter && !t.pending);
    }
    assert.ok(found, "some seed has the Scimitar hit");
  });

  test(`${grid}: on: one undo takes back the strike and the fight; redo, a replay and a save and load give the same`, () => {
    const build = () => { const s = K.table(grid, ON); priestBy(s, grid); return s; };
    const s = build(), start = json(s), h = createHistory(), m = mark(s), r = ok(apply(s, MACE, DM));
    h.record(m, s, describeStep(MACE, r.events, m, s));
    const after = json(s);
    assert.ok(h.undo(s)); assert.equal(json(s), start); assert.ok(!s.encounter);
    assert.ok(h.redo(s)); assert.equal(json(s), after);
    const t = build(); ok(apply(t, MACE, DM)); assert.equal(json(t), after, "replay");
    const loaded = migrate(JSON.parse(json(s)));
    K.endTurns(s, 8); K.endTurns(loaded, 8);
    assert.equal(json(loaded), json(s), "save and load");
  });

  // Hidden information (hidden-information.md, sections 3 and 5): a goblin the DM hid strikes the fighter first. Two
  // worlds that differ only in its name give every player the same events up to the fight's start, and none names it.
  test(`${grid}: on: a hidden monster's strike tells players what an unseen creature's attack tells them, then the fight reveals it`, () => {
    const NAMES = ["Snik", "Grub"];
    for (const act of ["act", "attack"]) {
      const runs = NAMES.map((n) => {
        const s = K.table(grid, ON), g = goblin(s, grid, { hidden: true, name: n }), tl = s.timeline.length;
        const a = act === "act" ? { type: "act", actor: g, action: "scimitar", target: "fighter" } : { type: "attack", actor: g, target: "fighter", attack: "scimitar" };
        return { s, g, tl, r: ok(apply(s, a, DM)) };
      });
      assert.equal(runs[0].g, runs[1].g);
      const g = runs[0].g, part = (evs) => { const i = evs.findIndex((e) => e.type === "encounterStart"); return evs.slice(0, i).filter((e) => !(e.type === "revealed" && e.id === g)); };
      assert.ok(runs[0].r.events.slice(0, at(runs[0].r, "encounterStart")).some((e) => e.type === "attack" && e.actor === g), "the attack was made before the fight");
      for (const u of PLAYERS) {
        const live = runs.map(({ s, r }) => viewEvents(r.events, s, u)), told = runs.map(({ s, tl }) => viewEvents(s.timeline.slice(tl), s, u));
        assert.deepEqual(part(live[0]), part(live[1]), `${act}: the same for ${u.userId} in both worlds`);
        assert.deepEqual(part(told[0]).map(({ t, ...e }) => e), part(live[0]), `${act}: the record tells ${u.userId} the same`);
        for (const [i, evs] of [...live, ...told].entries()) {
          const text = json(part(evs));
          assert.ok(!text.includes(`"${g}"`) && !text.includes(NAMES[i % 2]), `${act}: nothing names the goblin before the fight: ${text}`);
          assert.ok(!part(evs).some((e) => e.type === "attack" || e.by !== undefined), `${act}: no attack event, no by`);
          assert.deepEqual(evs.find((e) => e.type === "encounterStart").order.find((o) => o.id === g), { id: g });
        }
      }
      for (const { s } of runs) assert.ok(view(s, PLAYERS[0]).entities[g], "Seen once the fight starts");
    }
  });

  // Review of #594, M1: a creature that took the Hide action gives itself away with its attack roll or a Verbal component,
  // during the act. What the party did not know of when the act began is decided before it runs: two worlds that differ
  // only in the hiding creature's name give every player the same events up to the fight's start, and none names it.
  test(`${grid}: a hiding creature's strike made first (act, attack, cast) is told as an unseen creature's`, () => {
    const NAMES = ["Snik", "Grub"];
    const cases = {
      act: (g) => ({ type: "act", actor: g, action: "scimitar", target: "fighter" }),
      attack: (g) => ({ type: "attack", actor: g, target: "fighter", attack: "scimitar" }),
      cast: () => K.CASTS.attack(grid),
    };
    for (const [name, mk] of Object.entries(cases)) for (const sf of name === "cast" ? ["casts", "all"] : ["all"]) {
      const runs = NAMES.map((n) => {
        const s = K.table(grid, { strikeFirst: sf });
        let id;
        if (name === "cast") { id = "mage"; s.entities.mage.name = n; } else id = goblin(s, grid, { name: n });
        s.entities[id].hiding = { dc: 30 };
        assert.ok(view(s, PLAYERS[0]).entities[id] === undefined, "unknown to the party before");
        const tl = s.timeline.length;
        return { s, id, tl, r: ok(apply(s, mk(id), DM)) };
      });
      const id = runs[0].id, part = (evs) => { const i = evs.findIndex((e) => e.type === "encounterStart"); return evs.slice(0, i).filter((e) => !(e.type === "revealed" && e.id === id)); };
      assert.ok(runs[0].r.events.slice(0, at(runs[0].r, "encounterStart")).some((e) => (e.type === "attack" || e.type === "cast") && e.actor === id), `${name}: made before the fight`);
      for (const u of PLAYERS) {
        const live = runs.map(({ s, r }) => viewEvents(r.events, s, u)), told = runs.map(({ s, tl }) => viewEvents(s.timeline.slice(tl), s, u));
        assert.deepEqual(part(live[0]), part(live[1]), `${name} ${sf}: the same for ${u.userId} in both worlds`);
        assert.deepEqual(part(told[0]).map(({ t, ...e }) => e), part(live[0]), `${name} ${sf}: the record tells ${u.userId} the same`);
        for (const [i, evs] of [...live, ...told].entries()) {
          const text = json(part(evs));
          assert.ok(!text.includes(`"${id}"`) && !text.includes(NAMES[i % 2]), `${name} ${sf}: nothing names it before the fight: ${text}`);
          assert.ok(!part(evs).some((e) => ["attack", "cast"].includes(e.type) || e.by !== undefined), `${name} ${sf}: no attack or cast event, no by`);
        }
      }
      for (const { s } of runs) assert.ok(view(s, PLAYERS[0]).entities[id], "Seen once the fight starts");
    }
  });

  // Review of #594, M2: a monster in a place the party has not seen strikes first. Where it and its target stand is shown
  // before the act (the `region` event comes first, outside what is marked unseen), so it is in the fight it starts.
  test(`${grid}: a monster in a place not yet seen that strikes first is in the fight`, () => {
    for (const sf of ["off", "all"]) {
      const s = K.table(grid, { strikeFirst: sf }), g = goblin(s, grid), p = s.entities[g].pos;
      s.map.regions.push({ id: "nook", name: "The nook", level: s.map.levels[0].id, hexes: [`${p.q},${p.r}`], revealed: false });
      const r = ok(apply(s, { type: "act", actor: g, action: "scimitar", target: "fighter" }, DM));
      const reg = at(r, "region");
      assert.ok(reg >= 0, `${sf}: the place is shown: ${json(types(r))}`);
      assert.equal(r.events[reg].unseen, undefined, "the reveal is not marked unseen");
      if (sf === "all") assert.ok(reg < at(r, "attack") && at(r, "attack") < at(r, "encounterStart"));
      assert.ok(s.encounter.order.some((o) => o.id === g), `${sf}: the goblin is in the fight`);
    }
  });

  // Re-review of #594: the actor is never "caught" by its own act. A mage the DM hid casts Fireball on the fighter with
  // itself in the area: its `revealed` as it is caught does not tell the party of it, so the cast is told as an unseen
  // caster's, the same in two worlds that differ in its name, until the fight's start.
  test(`${grid}: a hidden caster caught in its own area stays unseen until the fight starts`, () => {
    const NAMES = ["Vex", "Zed"];
    for (const sf of ["casts", "all"]) {
      const runs = NAMES.map((n) => {
        const s = K.table(grid, { strikeFirst: sf, hidden: true });
        s.entities.mage.name = n;
        const F = SPOTS[grid].fighter;
        ok(apply(s, { type: "place", actor: "mage", to: grid === "hex" ? { q: F.q + 2, r: F.r - 1 } : { q: F.q + 1, r: F.r - 2 } }, DM));
        const tl = s.timeline.length, r = ok(apply(s, K.CASTS.area(grid), DM));
        return { s, r, tl };
      });
      const r0 = runs[0].r, cut = at(r0, "encounterStart");
      assert.ok(r0.events.slice(0, cut).some((e) => e.type === "revealed" && e.id === "mage"), `${sf}: the mage is caught in its own Fireball`);
      assert.ok(r0.events.slice(0, cut).some((e) => e.type === "save" && e.id === "mage"), `${sf}: and saves`);
      const part = (evs) => { const i = evs.findIndex((e) => e.type === "encounterStart"); return evs.slice(0, i).filter((e) => !(e.type === "revealed" && e.id === "mage")); };
      for (const u of PLAYERS) {
        const live = runs.map(({ s, r }) => viewEvents(r.events, s, u)), told = runs.map(({ s, tl }) => viewEvents(s.timeline.slice(tl), s, u));
        assert.deepEqual(part(live[0]), part(live[1]), `${sf}: the same for ${u.userId} in both worlds`);
        assert.deepEqual(part(told[0]).map(({ t, ...e }) => e), part(live[0]), `${sf}: the record tells ${u.userId} the same`);
        for (const [i, evs] of [...live, ...told].entries()) {
          const text = json(part(evs));
          assert.ok(!text.includes('"mage"') && !text.includes(NAMES[i % 2]), `${sf}: nothing names the caster before the fight: ${text}`);
          assert.ok(!part(evs).some((e) => e.type === "cast" || e.by !== undefined || e.source !== undefined), `${sf}: no cast, no by, no source`);
        }
      }
    }
  });
}
