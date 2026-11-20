// The table rule `strikeFirst` (#585; docs/specs/table-ui.md, E23 as amended). Off (the SRD's way, and a new table's): an
// attack, a hostile cast or a monster's action outside a fight starts the fight and is not made; everyone rolls Initiative
// and the creature makes it on its turn. On (a house rule): it lands first, then the fight starts, in the same action.
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

test("the setting: off unless set (a new game has none), the DM's to switch, true or false", () => {
  assert.deepEqual(SETTINGS.strikeFirst, [false, true]);
  const s = newGame(5);
  assert.equal(s.settings.strikeFirst, undefined, "a new table: off");
  assert.equal(apply(s, { type: "setting", key: "strikeFirst", value: true }, U1).ok, false);
  assert.equal(apply(s, { type: "setting", key: "strikeFirst", value: "yes" }, DM).ok, false);
  ok(apply(s, { type: "setting", key: "strikeFirst", value: true }, DM));
  assert.equal(s.settings.strikeFirst, true);
});

test("the migration: a table saved before version 27 has the rule as its autoEngage was; a new one is left as it is", () => {
  assert.equal(VERSION, 27);
  for (const on of [true, false]) {
    const old = newGame(5); old.version = 26; old.settings.autoEngage = on;
    migrate(old);
    assert.equal(old.settings.strikeFirst, on);
    assert.equal(old.version, 27);
    const again = json(old); migrate(old); assert.equal(json(old), again, "migrating again changes nothing");
  }
  const fresh = newGame(5), f = json(fresh); migrate(fresh); assert.equal(json(fresh), f);
  const off = newGame(5); off.settings.strikeFirst = false; off.settings.autoEngage = true; migrate(off);
  assert.equal(off.settings.strikeFirst, false, "a choice made at version 27 is kept");
});

for (const grid of GRIDS) {
  test(`${grid}: off (the SRD's way): an attack, a monster's action and a cast start the fight and are not made`, () => {
    for (const autoEngage of [true, false]) {
      const a = K.table(grid, { autoEngage, strikeFirst: false }); priestBy(a, grid);
      const ra = ok(apply(a, MACE, DM));
      assert.equal(types(ra).includes("attack"), false); assert.ok(a.encounter && at(ra, "encounterStart") >= 0);
      const b = K.table(grid, { autoEngage, strikeFirst: false }), g = goblin(b, grid);
      for (const act of [{ type: "act", actor: g, action: "scimitar", target: "fighter" }, { type: "attack", actor: g, target: "fighter", attack: "scimitar" }]) {
        const t = structuredClone(b), r = ok(apply(t, act, DM));
        assert.equal(types(r).includes("attack"), false, act.type); assert.ok(t.encounter);
        assert.equal(t.entities.fighter.hp, b.entities.fighter.hp);
      }
      const c = K.table(grid, { autoEngage, strikeFirst: false }), rc = ok(apply(c, K.CASTS.attack(grid), DM));
      assert.equal(at(rc, "cast"), -1); assert.ok(c.encounter);
      const p = K.table(grid, { autoEngage, strikeFirst: false }), gp = goblin(p, grid);
      const rp = ok(apply(p, { type: "attack", actor: "fighter", target: gp, attack: "longsword" }, U1));
      assert.equal(types(rp).includes("attack"), false, "a player's attack too"); assert.ok(p.encounter);
    }
  });

  test(`${grid}: on: a character's attack, a monster's action and a player's attack land, then the fight starts; the first turn is whole`, () => {
    const a = K.table(grid); priestBy(a, grid);
    const ra = ok(apply(a, MACE, DM));
    assert.ok(at(ra, "attack") >= 0 && at(ra, "attack") < at(ra, "encounterStart"), json(types(ra)));
    assert.ok(a.encounter.order.some((o) => o.id === "priest") && a.encounter.order.some((o) => o.id === "cleric"));
    turnOf(a, "priest");
    assert.equal(a.encounter.budget.action, 1, "the attacker's first turn has its action");
    const b = K.table(grid), g = goblin(b, grid);
    for (const act of [{ type: "act", actor: g, action: "scimitar", target: "fighter" }, { type: "attack", actor: g, target: "fighter", attack: "scimitar" }]) {
      const t = structuredClone(b), r = ok(apply(t, act, DM));
      assert.ok(at(r, "attack") >= 0 && at(r, "attack") < at(r, "encounterStart"), `${act.type}: ${json(types(r))}`);
      assert.ok(t.encounter.order.some((o) => o.id === g) && t.encounter.order.some((o) => o.id === "fighter"));
    }
    const p = K.table(grid), gp = goblin(p, grid);
    const rp = ok(apply(p, { type: "attack", actor: "fighter", target: gp, attack: "longsword" }, U1));
    assert.ok(at(rp, "attack") >= 0 && at(rp, "attack") < at(rp, "encounterStart"), "a player's attack at a foe lands first");
    // Not at a creature of another side (the goblin at a foe): the fight starts and nothing is made, as with the rule off.
    const q = K.table(grid), gq = goblin(q, grid); ok(apply(q, { type: "place", actor: "priest", to: { ...next(grid), q: next(grid).q + 1 } }, DM));
    const rq = ok(apply(q, { type: "act", actor: gq, action: "scimitar", target: "priest" }, DM));
    assert.equal(types(rq).includes("attack"), false);
  });

  test(`${grid}: on: what needs a turn in a fight is refused before anything changes; a refused strike changes nothing`, () => {
    const s = K.table(grid), g = goblin(s, grid), was = json(s);
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
      const s = K.table(grid, { seed, ward: { shield: "always" } }), g = goblin(s, grid);
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
      const t = K.table(grid, { seed, ward: { shield: "ask" } }), h = goblin(t, grid);
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
    const build = () => { const s = K.table(grid); priestBy(s, grid); return s; };
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
        const s = K.table(grid), g = goblin(s, grid, { hidden: true, name: n }), tl = s.timeline.length;
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
}
