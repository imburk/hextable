// E23 (#372; docs/specs/table-ui.md, E23 and its build note; the table rule `strikeFirst` since #585, which these tables
// have on): with no fight, the DM's hostile cast at a party member takes effect (its saves, damage, conditions, Concentration, the reactions it allows) and then the fight
// starts, in the same action. On hexes (the valley) and on the square room: a save spell (Sacred Flame), an attack-roll
// spell (Fire Bolt), an area catching two or more party members (Fireball), a Concentration spell (Hold Person) and a
// spell from an item (a Wand of Magic Missiles). Then: the reactions it allows (Shield, Counterspell, and a player asked),
// one undo for both, redo, a replay, a save and load in the middle, saves from main, and CAST_TAKES_FIRST_ACTION both
// ways. With `strikeFirst` off the cast starts the fight and is not cast (and e23-replay.test.js).
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import * as E from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { migrate } from "../src/migrate.js";
import { CAST_TAKES_FIRST_ACTION } from "../src/engine/casting.js";
import { squareRoom } from "./fixtures/square-room.js";
import { kit, DM, U3, GRIDS, json, ok } from "./e23-kit.js";

const { apply, current } = E;
const M = { apply, current, makeEntity: E.makeEntity, derive, newGame, squareRoom };
const K = kit(M);
const at = (r, type) => r.events.findIndex((e) => e.type === type);
const before = (r, type) => r.events.slice(0, at(r, "encounterStart")).filter((e) => e.type === type);
const turnOf = (s, id) => { for (let i = 0; i < 40 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };

test("the default: a hostile cast does not use up its caster's first turn (the owner has not decided)", () => {
  assert.equal(CAST_TAKES_FIRST_ACTION, false);
});

for (const grid of GRIDS) {
  test(`${grid}: each hostile cast lands, then the fight starts, in one action`, () => {
    for (const [name, f] of Object.entries(K.CASTS)) {
      const s = K.table(grid), slots = structuredClone(s.entities.mage.slots), fhp = s.entities.fighter.hp;
      const r = ok(apply(s, f(grid), DM));
      const types = r.events.map((e) => e.type);
      assert.ok(at(r, "encounterStart") > at(r, "cast") && at(r, "cast") >= 0, `${name}: cast, then the fight: ${json(types)}`);
      assert.ok(s.encounter, `${name}: a fight is on`);
      assert.ok(s.encounter.order.some((o) => o.id === "fighter") && s.encounter.order.some((o) => o.id === f(grid).actor), `${name}: caster and target are in it`);
      if (name === "save") assert.equal(before(r, "save").filter((e) => e.id === "fighter").length, 1, "the fighter saved before the fight");
      if (name === "attack") assert.equal(before(r, "attack").length, 1, "the attack roll was made before the fight");
      if (name === "area") {
        const savers = new Set(before(r, "save").map((e) => e.id));
        assert.ok(["fighter", "rogue", "wizard"].every((id) => savers.has(id)), `three party members caught: ${json([...savers])}`);
        assert.equal(s.entities.mage.slots[3], slots[3] - 1, "one level 3 slot, spent once");
      }
      if (name === "conc") {
        assert.equal(s.entities.mage.slots[2], slots[2] - 1);
        const failed = before(r, "save").find((e) => e.id === "fighter")?.success === false;
        const fx = s.effects.find((x) => x.spell === "hold-person");
        assert.ok(fx && fx.conc && fx.source === "mage", "the mage concentrates on it into the fight");
        assert.equal(!!s.entities.fighter.cond.paralyzed, failed, "Paralyzed into the fight if the save failed");
      }
      if (name === "item") {
        assert.ok(at(r, "item") >= 0 && at(r, "item") < at(r, "encounterStart"));
        assert.equal(s.entities.mage.sheet.items[0].charges, 6, "one charge of seven");
        assert.equal(json(s.entities.mage.slots), json(slots), "no slot");
      }
      if (name !== "conc" && name !== "save") assert.ok(s.entities.fighter.hp < fhp, `${name}: damage dealt`);
      // The caster's first turn is a whole turn (CAST_TAKES_FIRST_ACTION false).
      turnOf(s, f(grid).actor);
      assert.equal(s.encounter.budget.action, 1, `${name}: its first turn has its action`);
      assert.ok(!s.encounter.flags.slot);
    }
  });

  test(`${grid}: with strikeFirst off, nothing is cast and the fight starts (the SRD's way); on, a player's cast lands too (#585)`, () => {
    for (const autoEngage of [false, true]) {
      const s = K.table(grid, { autoEngage, strikeFirst: false }), r = ok(apply(s, K.CASTS.attack(grid), DM));
      assert.deepEqual(r.events.map((e) => e.type).slice(0, 1), ["encounterStart"]);
      assert.equal(at(r, "cast"), -1);
      const p = K.table(grid, { autoEngage, strikeFirst: false }), rp = ok(apply(p, { type: "cast", actor: "wizard", spell: "fire-bolt", target: "mage" }, U3));
      assert.equal(at(rp, "cast"), -1, "a player's cast at a foe starts the fight and is not cast");
      assert.ok(p.encounter);
    }
    // strikeFirst on: a player's cast at a foe lands, then the fight starts.
    const p = K.table(grid), rp = ok(apply(p, { type: "cast", actor: "wizard", spell: "fire-bolt", target: "mage" }, U3));
    assert.ok(at(rp, "cast") >= 0 && at(rp, "cast") < at(rp, "encounterStart"), "a player's cast at a foe: cast, then the fight");
    // The DM's harmful cast at nobody of another side (a foe at a foe): the fight starts, nothing is cast.
    const q = K.table(grid), rq = ok(apply(q, { type: "cast", actor: "mage", spell: "fire-bolt", target: "priest" }, DM));
    assert.equal(at(rq, "cast"), -1);
  });

  test(`${grid}: a refused cast changes nothing`, () => {
    const s = K.table(grid), was = json(s);
    assert.equal(apply(s, { type: "cast", actor: "mage", spell: "fireball", slot: 9, hex: K.CASTS.area(grid).hex }, DM).ok, false);
    assert.equal(apply(s, { type: "cast", actor: "mage", spell: "fire-bolt", target: "nobody" }, DM).ok, false);
    assert.equal(json(s), was);
  });

  test(`${grid}: a Shield taken during the cast stays spent until the wizard's first turn`, () => {
    let found = 0;
    for (let seed = 1; seed <= 30 && !found; seed++) {
      const s = K.table(grid, { seed, ward: { shield: "always" } });
      const r = ok(apply(s, { type: "cast", actor: "mage", spell: "fire-bolt", target: "wizard" }, DM));
      const shield = r.events.findIndex((e) => e.type === "reaction" && e.reaction === "shield");
      if (shield < 0) continue;
      found = seed;
      assert.ok(shield < at(r, "encounterStart"), "the Shield is before the fight");
      assert.equal(s.entities.wizard.reactionUsed, true, "still spent as the fight starts");
      if (current(s) !== "wizard") assert.equal(s.entities.rogue.reactionUsed, false, "the others have theirs");
      turnOf(s, "wizard");
      assert.equal(s.entities.wizard.reactionUsed, false, "back at the start of its turn");
    }
    assert.ok(found, "some seed has the Fire Bolt hit");
  });

  test(`${grid}: a Counterspell undoes the cast, and the fight still starts; a player asked answers first`, () => {
    let s, r, seed = 1;
    for (; seed <= 30; seed++) {             // a seed where the Counterspell works (the mage fails its save)
      s = K.table(grid, { seed, ward: { counterspell: "always" } });
      r = ok(apply(s, K.CASTS.attack(grid), DM));
      assert.ok(r.events.findIndex((e) => e.type === "reaction" && e.reaction === "counterspell") < at(r, "encounterStart"));
      if (at(r, "countered") >= 0) break;
    }
    assert.ok(at(r, "countered") >= 0 && at(r, "countered") < at(r, "encounterStart"), json(r.events.map((e) => e.type)));
    assert.equal(at(r, "attack"), -1, "no attack roll: the spell dissipated");
    assert.equal(s.entities.wizard.reactionUsed, true);
    // Its instruction `ask`: the cast waits for Cy, nothing has started; the answer runs the cast, then the fight.
    const t = K.table(grid, { seed, ward: { counterspell: "ask" } });
    const q = ok(apply(t, K.CASTS.attack(grid), DM));
    assert.deepEqual(q.events.map((e) => e.type), ["reactionAsked"]);
    assert.ok(t.pending && !t.encounter);
    const a = ok(apply(t, { type: "react", prompt: t.pending.n, take: "counterspell" }, U3));
    assert.ok(at(a, "reaction") >= 0 && at(a, "reaction") < at(a, "encounterStart"), "the Counterspell, then the fight");
    assert.ok(t.encounter && !t.pending);
    // Declined: the spell lands, then the fight.
    const u = K.table(grid, { ward: { counterspell: "ask" } });
    ok(apply(u, K.CASTS.attack(grid), DM));
    const d = ok(apply(u, { type: "react", prompt: u.pending.n, take: null }, U3));
    assert.ok(at(d, "attack") >= 0 && at(d, "attack") < at(d, "encounterStart"));
    assert.equal(u.entities.wizard.reactionUsed, false, "a declined reaction spends nothing");
  });

  test(`${grid}: one undo takes back the cast and the fight; redo, a replay and a save and load give the same`, () => {
    for (const name of Object.keys(K.CASTS)) {
      const s = K.table(grid), start = json(s), h = createHistory();
      const a = K.CASTS[name](grid), m = mark(s), r = ok(apply(s, a, DM));
      h.record(m, s, describeStep(a, r.events, m, s));
      const after = json(s);
      assert.ok(h.undo(s));
      assert.equal(json(s), start, `${name}: one step back is before the cast`);
      assert.ok(!s.encounter);
      assert.ok(h.redo(s));
      assert.equal(json(s), after, `${name}: redo`);
      // A replay of the same actions from the same table, and a save and load after the cast, play on the same.
      const t = K.table(grid);
      ok(apply(t, a, DM));
      assert.equal(json(t), after, `${name}: replay`);
      const loaded = migrate(JSON.parse(json(s)));
      K.endTurns(s, 8); K.endTurns(loaded, 8);
      assert.equal(json(loaded), json(s), `${name}: save and load`);
    }
  });

  test(`${grid}: saves made by main load, and play on`, () => {
    const saves = JSON.parse(readFileSync(new URL("./fixtures/e23-main-saves.json", import.meta.url), "utf8")).saves.filter((x) => x.grid === grid);
    for (const sv of saves) {
      const s = migrate(structuredClone(sv.state));
      if (sv.at === "before") {
        const r = ok(apply(s, K.CASTS.attack(grid), DM));
        assert.ok(at(r, "attack") >= 0 && at(r, "attack") < at(r, "encounterStart"), "the cast lands now");
      } else {
        assert.ok(s.encounter, "the fight main started");
        K.endTurns(s, 10);
        assert.ok(s.encounter);
      }
    }
  });
}

// CAST_TAKES_FIRST_ACTION true: this branch's rules copied with the one line changed, and the same tables played.
test("CAST_TAKES_FIRST_ACTION true: the caster's first turn has no action and no slot left, and says so", async () => {
  const src = fileURLToPath(new URL("../src/", import.meta.url)), dir = mkdtempSync(join(tmpdir(), "e23-"));
  try {
    cpSync(src, join(dir, "src"), { recursive: true });
    const p = join(dir, "src/engine/casting.js"), code = readFileSync(p, "utf8");
    assert.ok(code.includes("export const CAST_TAKES_FIRST_ACTION = false;"));
    writeFileSync(p, code.replace("export const CAST_TAKES_FIRST_ACTION = false;", "export const CAST_TAKES_FIRST_ACTION = true;"));
    const E2 = await import(join(dir, "src/engine.js")), C2 = await import(join(dir, "src/engine/casting.js"));
    assert.equal(C2.CAST_TAKES_FIRST_ACTION, true);
    const K2 = kit({ apply: E2.apply, current: E2.current, makeEntity: E2.makeEntity, derive: (await import(join(dir, "src/derive.js"))).derive, newGame: (await import(join(dir, "src/scenario.js"))).newGame, squareRoom });
    for (const grid of GRIDS) for (const name of ["attack", "area"]) {
      const s = K2.table(grid), a = K2.CASTS[name](grid);
      const c = ok(E2.apply(s, a, DM));
      if (E2.current(s) !== a.actor) assert.deepEqual(s.encounter.owed, { [a.actor]: { time: "action", slot: name === "area", spell: name === "area" ? "Fireball" : "Fire Bolt" } }, "kept until its turn");
      let r = null;
      for (let i = 0; i < 40 && E2.current(s) !== a.actor; i++) r = ok(E2.apply(s, { type: "endTurn", actor: E2.current(s) }, DM));
      assert.equal(E2.current(s), a.actor);
      assert.equal(s.encounter.budget.action, 0, `${grid} ${name}: no action`);
      assert.equal(!!s.encounter.flags.slot, name === "area", "a slot spell's turn spent its one slot");
      assert.ok(!s.encounter.owed);
      assert.ok((r ?? c).events.some((e) => e.type === "note" && e.id === a.actor && /as the fight began/.test(e.text)), "the caster's turn says why");
      assert.equal(E2.apply(s, { type: "cast", actor: a.actor, spell: "fire-bolt", target: "fighter" }, DM).ok, false, "no second action spell");
      // The default code on the same table: a whole turn.
      const d = K.table(grid);
      ok(apply(d, K.CASTS[name](grid), DM));
      assert.equal(d.encounter.owed, undefined);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
