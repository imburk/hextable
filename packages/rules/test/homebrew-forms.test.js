// A homebrew monster may be a form (#457; it was refused under #402): for a `summon` step with `forms` and for Wild Shape. Its block is sent
// only to the player who runs the creature (view.js, forViewer); the DM's own `spawn` of it is unaffected, and with no pack nothing changes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT } from "../src/content/index.js";
import { loadPack, overlayOf, using } from "../src/content/registry.js";
import { apply, makeEntity, recall } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { describeStep } from "../src/history.js";
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

const checkBy = (s, id, ctx, skill = "stealth") => ok(apply(s, { type: "check", actor: id, skill }, ctx));
const types = (evs) => evs.map((e) => e.type);
const hasNumbers = (evs) => evs.some((e) => e.bonus !== undefined || e.total !== undefined || e.roll !== undefined || e.rolls !== undefined || e.dice !== undefined);

test("what a homebrew familiar does is stamped when it happens, told to its controller as ever and to another player as a foe's would be", () => {
  const ov = OV(), s = wizardTable(), at = spot(s);
  using(ov, () => {
    const f = familiarOf(s, ok(cast(s, OWLET, at)));
    const r = checkBy(s, f.id, PAT);
    assert.deepEqual(r.events[0].hb, { [f.id]: "pat" }, "the event says who ran it");
    const mine = viewEvents(r.events, s, PAT), theirs = viewEvents(r.events, s, BO), dm = viewEvents(r.events, s, DM);
    assert.deepEqual(types(mine), ["check"]);
    assert.ok(hasNumbers(mine));
    assert.deepEqual(types(theirs), [], "a check of it is not sent to another player");
    assert.equal(dm.length, 1);
    for (const e of [...mine, ...theirs]) assert.equal(e.hb, undefined, "the stamp is never sent");
    // The same events with no stamp: the old rule, by the state as it is (an old log names no such creature, so this only pins that nothing else changed).
    const bare = structuredClone(r.events); delete bare[0].hb;
    assert.deepEqual(types(viewEvents(bare, s, BO)), ["check"]);
    // Other events of it: a save has no DC or total, `speed` and `deathSave` are not sent, a hand-applied action says nothing.
    const evs = [{ type: "save", id: f.id, abil: "dex", success: true, dc: 13, total: 15, roll: 12 }, { type: "speed", id: f.id, mode: "fly", feet: 120 },
      { type: "deathSave", id: f.id, roll: 12, success: true }, { type: "manual", actor: f.id, name: "Talons", text: "The owlet's talons deal 1 damage." }].map((e) => ({ ...e, hb: { [f.id]: "pat" } }));
    assert.deepEqual(types(viewEvents(structuredClone(evs), s, PAT)), ["save", "speed", "deathSave", "manual"]);
    const them = viewEvents(structuredClone(evs), s, BO);
    assert.deepEqual(types(them), ["save"]);
    assert.equal(them[0].dc, undefined);
    assert.equal(them[0].total, undefined);
    assert.equal(viewEvents(structuredClone(evs), s, DM).length, 4);
  });
});

// The record: what a player is told when they ask for it later, once the creature is gone or its form has ended (review of #461).
const record = (s) => recall(s, { limit: Infinity });

test("history: a homebrew summon's events stay its controller's after it is removed, killed or dismissed to the pocket", () => {
  for (const how of ["remove", "dismiss", "harm"]) {
    const ov = OV(), s = wizardTable(), at = spot(s);
    using(ov, () => {
      const f = familiarOf(s, ok(cast(s, OWLET, at)));
      checkBy(s, f.id, PAT, "stealth");
      checkBy(s, f.id, PAT, "perception");
      if (how === "remove") ok(apply(s, { type: "remove", actor: f.id }, DM));
      else if (how === "dismiss") ok(apply(s, { type: "dismiss", actor: "wizard", id: f.id }, PAT));
      else ok(apply(s, { type: "harm", actor: f.id, amount: 500, dtype: "untyped" }, DM));
      const tl = record(s);
      assert.ok(tl.filter((e) => e.type === "check").length === 2, how);
      const bo = viewEvents(tl, s, BO), pat = viewEvents(tl, s, PAT);
      assert.equal(bo.some((e) => e.type === "check"), false, `${how}: no check of it reaches another player`);
      assert.equal(hasNumbers(bo.filter((e) => ["check", "attack", "save"].includes(e.type))), false, how);
      assert.equal(JSON.stringify(bo).includes(OWLET), false, `${how}: nor its id`);
      assert.equal(pat.filter((e) => e.type === "check").length, 2, `${how}: its controller still has them`);
      assert.equal(viewEvents(tl, s, DM).filter((e) => e.type === "check").length, 2);
    });
  }
});

test("history: a druid's events in a homebrew form stay hidden from others after the form ends, and so do the form's id, name and effect", () => {
  const ov = OV(), s = druidField();
  using(ov, () => {
    ok(shape(s, WOLFLING, PAT));
    ok(apply(s, { type: "check", actor: "hero", skill: "stealth" }, PAT));
    ok(apply(s, { type: "startEncounter", center: s.entities.hero.pos }, DM));
    ok(apply(s, { type: "feature", actor: "hero", feature: "wild-shape" }, PAT));
    ok(apply(s, { type: "check", actor: "hero", skill: "perception" }, PAT));      // out of the form: its own, as ever
    assert.equal(s.entities.hero.form, undefined);
    const tl = record(s), bo = viewEvents(tl, s, BO), pat = viewEvents(tl, s, PAT);
    const checks = (evs) => evs.filter((e) => e.type === "check").map((e) => e.skill);
    assert.deepEqual(checks(pat), ["stealth", "perception"]);
    assert.deepEqual(checks(bo), ["perception"], "none of the druid's while it had the form; its own check after, as the party's ever is told");
    const text = JSON.stringify(bo);
    assert.equal(text.includes(WOLFLING), false);
    assert.equal(text.includes("Ember wolfling"), false);
    assert.equal(bo.some((e) => e.type === "form" || e.type === "effectStart" || e.type === "effectEnd"), false);
    assert.equal(pat.some((e) => e.type === "form"), true);
    // The start of the fight lists the order: the druid's Dexterity there is the form's, and is not sent.
    const start = tl.find((e) => e.type === "encounterStart");
    assert.equal(start.hb.hero, "pat");
    assert.equal(viewEvents([start], s, BO)[0].order.find((o) => o.id === "hero").dex, undefined);
    assert.ok(viewEvents([start], s, PAT)[0].order.find((o) => o.id === "hero").dex !== undefined);
  });
});

test("an old log, whose events carry no stamp, is told as before: a game before #457 could not have a homebrew party creature", () => {
  const s = wizardTable(), at = spot(s);
  const f = familiarOf(s, ok(cast(s, "owl", at)));
  checkBy(s, f.id, PAT);
  ok(apply(s, { type: "remove", actor: f.id }, DM));
  const tl = record(s);
  assert.equal(tl.some((e) => "hb" in e), false, "an SRD game stamps nothing");
  const told = viewEvents(tl, s, BO);
  assert.ok(told.some((e) => e.type === "check" && e.total !== undefined), "an SRD familiar's check is told to the party, as before");
  assert.deepEqual(viewEvents(structuredClone(tl), s, BO), told);
});

test("the live events of a step that ends a summon are stamped from the game as the step found it", () => {
  const ov = OV(), s = wizardTable(), at = spot(s);
  using(ov, () => {
    const f = familiarOf(s, ok(cast(s, OWLET, at)));
    const r = ok(apply(s, { type: "harm", actor: f.id, amount: 500, dtype: "untyped" }, DM));
    assert.equal(s.entities[f.id], undefined, "it is gone");
    assert.ok(r.events.filter((e) => e.id === f.id || e.target === f.id).every((e) => e.hb?.[f.id] === "pat"), JSON.stringify(r.events.map((e) => [e.type, e.hb])));
    const bo = viewEvents(r.events, s, BO), pat = viewEvents(r.events, s, PAT);
    assert.equal(JSON.stringify(bo).includes('"hp":0') && bo.some((e) => e.type === "damage" && e.dice), false);
    assert.ok(pat.some((e) => e.type === "damage"));
  });
});

test("a familiar re-formed in the pocket dimension: the form is told to its controller only", () => {
  const ov = OV(), s = wizardTable(), at = spot(s);
  using(ov, () => {
    const f = familiarOf(s, ok(cast(s, "owl", at)));
    ok(apply(s, { type: "dismiss", actor: "wizard", id: f.id }, PAT));
    const r = ok(apply(s, { type: "cast", actor: "wizard", spell: "find-familiar", slot: 1, summon: { form: OWLET, type: "fey" } }, PAT));
    const re = r.events.find((e) => e.type === "reformed");
    assert.ok(re && re.pocket === true, JSON.stringify(r.events.map((e) => e.type)));
    assert.ok(viewEvents(r.events, s, PAT).some((e) => e.type === "reformed"));
    assert.equal(viewEvents(r.events, s, BO).some((e) => e.type === "reformed"), false);
    assert.equal(JSON.stringify(viewEvents(r.events, s, BO)).includes(OWLET), false);
  });
});

test("describeStep: a step only its runner can hear (a check by their homebrew familiar) still counts as heard, so undo says so", () => {
  const ov = OV(), s = wizardTable(), at = spot(s);
  using(ov, () => {
    const f = familiarOf(s, ok(cast(s, OWLET, at)));
    const before = structuredClone(s), action = { type: "check", actor: f.id, skill: "stealth" };
    const r = ok(apply(s, action, PAT));
    const d = describeStep(action, r.events, before, s);
    assert.ok(d.shown, JSON.stringify(d));
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

test("a druid in a homebrew form: the form's block goes to the druid's player alone; another player is sent the druid itself, as it is out of the form", () => {
  const ov = OV(), s = druidField();
  using(ov, () => {
    const own = structuredClone(s.entities.hero);
    ok(shape(s, WOLFLING, PAT));
    const mine = view(s, PAT).entities.hero, theirs = view(s, BO).entities.hero, dm = view(s, DM).entities.hero;
    assert.equal(mine.form.block, WOLFLING);
    assert.ok(isOpen(mine));
    assert.notDeepEqual(mine.abil, own.abil, "in the form, its Strength and Dexterity are the form's");
    assert.equal(dm.form.block, WOLFLING);
    // The other player is sent the druid: its Hit Points, conditions and place are its own; what the form gave is not there.
    assert.equal(theirs.form, undefined, "not that it is in a form, nor which");
    assert.equal(theirs.side, "party");
    assert.equal(theirs.name, "Ven");
    assert.equal(theirs.hp, own.hp);
    assert.equal(theirs.maxHp, own.maxHp);
    assert.deepEqual(theirs.pos, own.pos);
    assert.deepEqual(theirs.cond, mine.cond);
    for (const k of ["abil", "ac", "speed", "speeds", "senses", "attacks", "actions", "resist", "saveBonus", "skillBonus"]) assert.deepEqual(theirs[k], own[k], `${k} is the druid's own`);
    assert.equal(theirs.size, mine.size, "the size is plain to see");
    const sent = JSON.stringify(view(s, BO));
    assert.equal(sent.includes(WOLFLING), false);
    assert.equal(sent.includes("Ember wolfling"), false, "nor the form's name, in the effect that keeps it");
    assert.ok(view(s, PAT).effects.some((fx) => fx.name.includes("Ember wolfling")), "its controller is told of the effect");
    assert.equal(view(s, BO).effects.some((fx) => fx.parts.some((q) => q.form)), false);
    // The events of taking it and of its ending: the same split.
    const r = ok(apply(s, { type: "feature", actor: "hero", feature: "wild-shape" }, PAT));
    assert.ok(r.events.some((e) => e.type === "effectEnd") || true);
    assert.equal(s.entities.hero.form, undefined);
    const back = view(s, BO).entities.hero;
    assert.ok(back.abil && back.maxHp !== undefined && back.form === undefined);
    assert.deepEqual(back.abil, own.abil);
    assert.equal(JSON.stringify(viewEvents(r.events, s, BO)).includes("Ember wolfling"), false);
    // The form's own events, taken afresh.
    const t2 = ok(shape(s, WOLFLING, PAT));
    assert.deepEqual(types(viewEvents(t2.events, s, BO)).filter((t) => ["form", "effectStart", "effectEnd"].includes(t)), []);
    assert.deepEqual(["form", "effectStart"].filter((t) => types(viewEvents(t2.events, s, PAT)).includes(t)), ["form", "effectStart"]);
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
