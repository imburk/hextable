// A homebrew monster may be a form (#457; it was refused under #402): for a `summon` step with `forms` and for Wild Shape. Its block is sent
// only to the player who runs the creature (view.js, forViewer); the DM's own `spawn` of it is unaffected, and with no pack nothing changes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT } from "../src/content/index.js";
import { loadPack, overlayOf, using } from "../src/content/registry.js";
import { apply, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { controlledBy, forViewer, homebrewBlock, playerView, view, viewEvents } from "../src/view.js";
import { spellProfile } from "../src/effects.js";
import { isHomebrew } from "../src/summons.js";

const DM = { role: "dm", userId: "dm" }, PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };

const hb = (name, base, over = {}) => ({ ...structuredClone(CONTENT.monsters[base]), id: `hb-ember-folk-${name}`, name: `Ember ${name}`, source: "homebrew:ember-folk", checked: false, text: "An ember beast.", ...over });
const OWLET = "hb-ember-folk-owlet", WOLFLING = "hb-ember-folk-wolfling", ASH = "hb-ember-folk-ash-sprite";
const PACK = { format: "hextable-pack", v: 1, pack: { id: "ember-folk", name: "ember-folk", version: 1, license: "CC0, by the author", attribution: "Written for a test." },
  monsters: [hb("owlet", "owl"), hb("wolfling", "wolf"), hb("ash-sprite", "owl", { type: "fey" })] };
const loaded = () => { const r = loadPack(PACK); assert.ok(r.ok, r.problems?.join("; ")); return r.pack; };
const OV = () => overlayOf([loaded()]);

function wizardTable() {
  const s = newGame(5);
  s.settings.autoEngage = false;
  s.entities.wizard.spells.push("find-familiar");
  ok(apply(s, { type: "claim", entity: "wizard", user: "pat", userName: "Pat" }, PAT));
  return s;
}
// A space that works for an SRD form, found by trying the neighbours with the control cast on a copy.
function spot(s) {
  const p = s.entities.wizard.pos;
  for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2], [1, 1], [-1, -1]]) {
    const at = { q: p.q + dq, r: p.r + dr }, c = structuredClone(s);
    if (apply(c, { type: "cast", actor: "wizard", spell: "find-familiar", slot: 1, summon: { form: "owl", type: "fey", at: [at] } }, PAT).ok) return at;
  }
  assert.fail("no free space");
}
const cast = (s, form, at, ctx = PAT) => apply(s, { type: "cast", actor: "wizard", spell: "find-familiar", slot: 1, summon: { form, type: "fey", at: [at] } }, ctx);

const BO = { role: "player", userId: "bo" };
// What the block of a creature is, as a player's record would hold it: its numbers and its attacks.
const OPEN_KEYS = ["ac", "maxHp", "abil", "actions", "speeds", "senses", "attacks"];
const isOpen = (rec) => OPEN_KEYS.every((k) => rec[k] !== undefined);
const isSeenOnly = (rec) => OPEN_KEYS.every((k) => rec[k] === undefined) && rec.tpl !== undefined;
const familiarOf = (s, r) => s.entities[r.events.find((e) => e.type === "summoned").id];

test("Find Familiar with a homebrew Beast of Challenge Rating 0 works for a player and for the DM (#457)", () => {
  const ov = OV(), s = wizardTable(), at = spot(s);
  using(ov, () => {
    assert.ok(CONTENT.monsters[OWLET] && isHomebrew(CONTENT.monsters[OWLET]) && !isHomebrew(CONTENT.monsters.owl));
    for (const ctx of [PAT, DM]) {
      const c = structuredClone(s), r = cast(c, OWLET, at, ctx);
      ok(r);
      const f = familiarOf(c, r);
      assert.equal(f.tpl, OWLET);
      assert.equal(f.bond.to, "wizard");
      assert.equal(f.side, "party");
    }
    // An SRD form still works in the same overlay.
    const r = cast(s, "owl", at);
    ok(r);
    assert.equal(familiarOf(s, r).tpl, "owl");
  });
});

test("a type-and-rating filter now matches a homebrew monster of the table's packs, and still refuses the wrong type or rating", () => {
  const ov = OV(), s = wizardTable(), at = spot(s);
  using(ov, () => {
    assert.deepEqual(spellProfile(CONTENT.spells["find-familiar"]).summon.forms, { type: "beast", cr: 0 });
    for (const id of [WOLFLING, ASH]) {      // a Challenge Rating 1/4 Beast, and a Fey
      const was = JSON.stringify(s), r = cast(s, id, at);
      assert.equal(r.ok, false);
      assert.equal(r.error, "Choose a form Find Familiar can take.");
      assert.equal(JSON.stringify(s), was, "a rejected action changes nothing");
    }
    ok(cast(structuredClone(s), OWLET, at));
  });
});

test("the homebrew familiar's block goes to its controller alone: another player is sent what a foe they can see is, the DM everything", () => {
  const ov = OV(), s = wizardTable(), at = spot(s);
  using(ov, () => {
    const f = familiarOf(s, ok(cast(s, OWLET, at)));
    const mine = view(s, PAT).entities[f.id], theirs = view(s, BO).entities[f.id], dm = view(s, DM).entities[f.id];
    assert.ok(isOpen(mine), "its controller is sent its block");
    assert.equal(mine.ac, f.ac);
    assert.ok(mine.attacks.length > 0 || mine.actions.length > 0);
    assert.ok(isSeenOnly(theirs), `another player is not: ${Object.keys(theirs)}`);
    assert.equal(theirs.side, "party");
    assert.equal(theirs.tpl, OWLET);
    assert.equal(theirs.id, f.id);
    assert.ok(isOpen(dm));
    // Not a number of it, nowhere in what the other player is sent.
    const sent = JSON.stringify(view(s, BO));
    assert.equal(sent.includes('"talons"'), false);
    assert.equal(sent.includes('"bond"'), false, "nor that it has a master");
    // The user who is not at the table at all, and a viewer with no user id, are not its controller either.
    for (const v of [{ role: "player" }, { role: "player", userId: "" }, { role: "player", userId: "wizard" }]) assert.ok(isSeenOnly(view(s, v).entities[f.id]));
  });
});

test("an SRD familiar is sent whole to every player, as before; with no homebrew creature in the party the view is the shared one", () => {
  const s = wizardTable(), at = spot(s);
  const f = familiarOf(s, ok(cast(s, "owl", at)));
  for (const v of [PAT, BO, DM]) assert.ok(isOpen(view(s, v).entities[f.id]));
  const base = playerView(s);
  assert.equal(forViewer(base, s, BO), base, "the same object: nothing was changed");
  assert.equal(forViewer(base, s, DM), base);
  assert.deepEqual(view(s, BO).entities, base.entities);
});

test("what a homebrew familiar does is told to its controller as ever and to another player as a foe's would be", () => {
  const ov = OV(), s = wizardTable(), at = spot(s);
  using(ov, () => {
    const f = familiarOf(s, ok(cast(s, OWLET, at)));
    const evs = [{ type: "check", id: f.id, skill: "perception", roll: 14, total: 19, dc: 12, success: true },
      { type: "manual", actor: f.id, name: "Talons", text: "The owlet's talons deal 1 damage." },
      { type: "save", id: f.id, abil: "dex", success: true, dc: 13, total: 15, roll: 12 }];
    const mine = viewEvents(structuredClone(evs), s, PAT), theirs = viewEvents(structuredClone(evs), s, BO);
    assert.deepEqual(mine.map((e) => e.type), ["check", "manual", "save"]);
    assert.equal(mine[0].total, 19);
    assert.deepEqual(theirs.map((e) => e.type), ["save"], "a check and what a hand-applied action says are not sent");
    assert.equal(theirs[0].dc, undefined, "nor the DC of a save, nor what it rolled");
    assert.equal(theirs[0].total, undefined);
    assert.equal(viewEvents(structuredClone(evs), s, DM).length, 3);
  });
});

test("controlledBy and homebrewBlock: the master's player runs its companion even on a turn the DM does, and only an id of a homebrew monster counts", () => {
  const ov = OV(), s = wizardTable(), at = spot(s);
  using(ov, () => {
    const f = familiarOf(s, ok(cast(s, OWLET, at)));
    assert.equal(controlledBy(s, f, "pat"), true);
    assert.equal(controlledBy(s, f, "bo"), false);
    assert.equal(controlledBy(s, f, undefined), false);
    assert.equal(controlledBy(s, null, "pat"), false);
    // A commanded creature is the DM's on a turn its master did not command it (ownerOf is null); its master's player still is sent it whole.
    f.bond.orders = "command";
    ok(apply(s, { type: "startEncounter", center: at }, DM));
    assert.equal(controlledBy(s, f, "pat"), true);
    assert.ok(isOpen(view(s, PAT).entities[f.id]) && isSeenOnly(view(s, BO).entities[f.id]));
    assert.equal(homebrewBlock(f), true);
    assert.equal(homebrewBlock(s.entities.wizard), false);
    assert.equal(homebrewBlock({ tpl: "owl" }), false);
    assert.equal(homebrewBlock({ tpl: "wolf", form: { block: WOLFLING } }), true);
    assert.equal(homebrewBlock({ tpl: "wolf", form: { block: "wolf" } }), false);
    assert.equal(homebrewBlock(undefined), false);
  });
});

test("a homebrew familiar dismissed to its master's pocket dimension is in the master's record for its controller only", () => {
  const ov = OV(), s = wizardTable(), at = spot(s);
  using(ov, () => {
    const f = familiarOf(s, ok(cast(s, OWLET, at)));
    ok(apply(s, { type: "dismiss", actor: "wizard", id: f.id }, PAT));
    assert.equal(s.entities[f.id], undefined);
    assert.ok(Object.keys(s.entities.wizard.pocket).includes(f.id));
    assert.ok(isOpen(view(s, PAT).entities.wizard.pocket[f.id]));
    assert.equal(view(s, BO).entities.wizard.pocket?.[f.id], undefined);
    assert.equal(JSON.stringify(view(s, BO)).includes(OWLET), false, "its id is not in what the other player is sent");
    assert.ok(view(s, BO).entities.wizard.abil, "the master's own record is still theirs to read");
    assert.ok(isOpen(view(s, DM).entities.wizard.pocket[f.id]));
  });
});

test("in a fight, a homebrew familiar's turn shows another player no initiative, Dexterity or budget (its Speed)", () => {
  const ov = OV(), s = wizardTable(), at = spot(s);
  using(ov, () => {
    const f = familiarOf(s, ok(cast(s, OWLET, at)));
    ok(apply(s, { type: "startEncounter", center: at }, DM));
    const enc = s.encounter;
    assert.ok(enc.order.some((o) => o.id === f.id));
    enc.turn = enc.order.findIndex((o) => o.id === f.id);
    enc.budget.move = 60;
    const mine = view(s, PAT).encounter, theirs = view(s, BO).encounter;
    assert.equal(mine.order.find((o) => o.id === f.id).init, enc.order.find((o) => o.id === f.id).init);
    assert.equal(mine.budget.move, 60);
    assert.deepEqual(theirs.order.find((o) => o.id === f.id), { id: f.id });
    assert.deepEqual(theirs.budget, { move: 0, action: 0, bonus: 0 });
    assert.ok(theirs.order.find((o) => o.id === "wizard").init !== undefined, "the party's others are as before");
  });
});

test("the DM's spawn of the same homebrew monster still works", () => {
  const ov = OV(), s = wizardTable();
  const r = using(ov, () => apply(s, { type: "spawn", monster: OWLET, at: { q: 3, r: 3 } }, DM));
  ok(r);
  assert.equal(s.entities[r.events[0].id].tpl, OWLET);
});

// ---------- Wild Shape ----------
const A = { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 };
const druid = { name: "Ven", class: "druid", level: 2, abilities: A, skills: ["nature", "perception"], choices: { "primal-order": "warden" },
  armour: "leather-armor", shield: true, weapons: ["quarterstaff"], spells: ["produce-flame", "cure-wounds"] };
function druidField() {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (!["rogue", "m1"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(druid).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  ok(apply(s, { type: "claim", entity: "hero", user: "pat", userName: "Pat" }, PAT));
  return s;
}
const shape = (s, form, ctx) => apply(s, { type: "feature", actor: "hero", feature: "wild-shape", form }, ctx);

test("Wild Shape into a homebrew Beast a level-2 druid could otherwise become works, and the same limits apply to it", () => {
  const ov = OV(), s = druidField();
  using(ov, () => {
    // A Fey is not a Beast; a Challenge Rating 1/4 Beast is within a level-2 druid's limit (the Wolf is one).
    const was = JSON.stringify(s), r = shape(s, ASH, PAT);
    assert.equal(r.ok, false);
    assert.match(r.error, /takes the form of a beast/);
    assert.equal(JSON.stringify(s), was);
    for (const ctx of [PAT, DM]) {
      const c = structuredClone(s);
      ok(shape(c, WOLFLING, ctx));
      assert.equal(c.entities.hero.form.block, WOLFLING);
    }
  });
});

test("a druid in a homebrew form: the form's block goes to the druid's player alone; another player is sent a seen record, the DM everything", () => {
  const ov = OV(), s = druidField();
  using(ov, () => {
    ok(shape(s, WOLFLING, PAT));
    const mine = view(s, PAT).entities.hero, theirs = view(s, BO).entities.hero, dm = view(s, DM).entities.hero;
    assert.equal(mine.form.block, WOLFLING);
    assert.ok(isOpen(mine));
    assert.equal(dm.form.block, WOLFLING);
    assert.equal(theirs.form, undefined, "not that it is in a form, nor which");
    for (const k of OPEN_KEYS) assert.equal(theirs[k], undefined, k);
    assert.equal(theirs.side, "party");
    assert.equal(theirs.name, "Ven");
    assert.equal(theirs.size, s.entities.hero.size);
    const sent = JSON.stringify(view(s, BO));
    assert.equal(sent.includes(WOLFLING), false);
    assert.equal(sent.includes("Ember wolfling"), false, "nor the form's name, in the effect that keeps it");
    assert.ok(view(s, PAT).effects.some((fx) => fx.name.includes("Ember wolfling")), "its controller is told of the effect");
    // The events of taking it and of its ending: the same split.
    const evs = [{ type: "form", id: "hero", form: WOLFLING, name: "Ember wolfling" },
      { type: "effectStart", fx: "x1", name: "Wild Shape (Ember wolfling)", source: "hero", conc: false, lasts: "1 hour", targets: ["hero"] },
      { type: "effectEnd", fx: "x1", name: "Wild Shape (Ember wolfling)", source: "hero", why: "Ven left the form", targets: ["hero"] }];
    assert.deepEqual(viewEvents(structuredClone(evs), s, PAT).map((e) => e.type), ["form", "effectStart", "effectEnd"]);
    assert.deepEqual(viewEvents(structuredClone(evs), s, BO), []);
    assert.equal(viewEvents(structuredClone(evs), s, DM).length, 3);
    // Leaving the form gives the other player the whole record again.
    ok(apply(s, { type: "feature", actor: "hero", feature: "wild-shape" }, PAT));
    assert.equal(s.entities.hero.form, undefined);
    const back = view(s, BO).entities.hero;
    assert.ok(back.abil && back.maxHp !== undefined && back.form === undefined);
  });
});

test("a druid in an SRD form is sent whole to every player, as before", () => {
  const s = druidField();
  ok(shape(s, "wolf", PAT));
  for (const v of [PAT, BO, DM]) assert.equal(view(s, v).entities.hero.form.block, "wolf");
  const base = playerView(s);
  assert.equal(forViewer(base, s, BO), base);
  const evs = [{ type: "form", id: "hero", form: "wolf", name: "Wolf" }, { type: "effectStart", fx: "x1", name: "Wild Shape (Wolf)", source: "hero", conc: false, lasts: "1 hour", targets: ["hero"] }];
  assert.deepEqual(viewEvents(structuredClone(evs), s, BO).map((e) => e.type), ["form", "effectStart"]);
  assert.ok(view(s, BO).effects.some((fx) => fx.name.includes("Wolf")));
});

test("a DM-run homebrew foe is still seen-only, to every player; the DM's `spawn` has no side to give it", () => {
  const ov = OV(), s = wizardTable();
  using(ov, () => {
    const r = ok(apply(s, { type: "spawn", monster: WOLFLING, at: { q: 3, r: 3 } }, DM));
    const id = r.events[0].id;
    assert.equal(s.entities[id].side, "foe");
    for (const v of [PAT, BO]) {
      const x = view(s, v).entities[id];
      if (x) for (const k of OPEN_KEYS) assert.equal(x[k], undefined, k);
    }
    assert.ok(isOpen(view(s, DM).entities[id]));
    // One of the party's side that no player runs (the DM's own ally) is no player's to be sent whole either.
    s.entities[id].side = "party";
    for (const v of [PAT, BO]) assert.ok(isSeenOnly(view(s, v).entities[id]));
    assert.ok(isOpen(view(s, DM).entities[id]));
  });
});

test("with no pack installed nothing changes: SRD forms work, an unknown id is refused as before", () => {
  const s = wizardTable(), at = spot(s);
  assert.equal(cast(s, OWLET, at).error, "Choose a form Find Familiar can take.");
  ok(cast(s, "owl", at));
  const d = druidField();
  assert.equal(shape(d, WOLFLING, PAT).error, "No such creature.");
  ok(shape(d, "wolf", PAT));
  assert.ok(!isHomebrew(null) && !isHomebrew({}) && !isHomebrew({ source: "SRD 5.2.1" }));
});
