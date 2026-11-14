// Warlock features at levels 7 to 15 (SRD 5.2.1, Warlock and Fiend Patron): more Eldritch
// Invocations (the Invocations column, with their prerequisites; Eldritch Invocations at level 1 is
// built here, as the invocations gained at 7 to 15 are what it gives), Ability Score Improvement at
// 8 and 12, Contact Patron, Fiendish Resilience, Mystic Arcanum (levels 6, 7 and 8 spells) and Hurl
// Through Hell.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, featChoices, validate } from "../src/derive.js";
import { lintRecord } from "../src/content/schema.js";
import { SPELLS as BOOK } from "../src/content/index.js";
import { newGame } from "../src/scenario.js";
import { migrate, VERSION } from "../src/migrate.js";
import { readFileSync } from "node:fs";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "refused"); if (re) assert.match(r.error, re); };
const A = { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 18 };
const COUNT = [1, 3, 3, 3, 5, 5, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 9, 10, 10, 10];
const INV = ["agonizing-blast-eldritch-blast", "eldritch-mind", "armor-of-shadows", "repelling-blast-eldritch-blast", "fiendish-vigor", "one-with-shadows", "whispers-of-the-grave", "eldritch-spear-eldritch-blast", "pact-of-the-chain", "witch-sight"];
// Invocations a level can take: in this order, so many as the column gives, each whose prerequisite the level meets.
const NEEDS = { "repelling-blast-eldritch-blast": 2, "agonizing-blast-eldritch-blast": 2, "fiendish-vigor": 2, "eldritch-spear-eldritch-blast": 2, "one-with-shadows": 5, "whispers-of-the-grave": 7, "witch-sight": 15 };
const invFor = (level) => INV.filter((id) => (NEEDS[id] ?? 1) <= level).slice(0, COUNT[level - 1]);
const wl = (level, inv = invFor(level), more = {}) => ({ name: "Mor", class: "warlock", level, ...(level >= 3 ? { subclass: "fiend" } : {}), abilities: A, skills: ["arcana", "deception"],
  spells: level >= 3 ? ["eldritch-blast", "chill-touch", "hex", "hold-person"].slice(0, 2 + Math.min(2, level)) : ["eldritch-blast", "chill-touch", "hex"],
  choices: { "eldritch-invocations": inv, ...(level >= 10 ? { "fiendish-resilience": "fire" } : {}), ...(level >= 11 ? { "mystic-arcanum": "circle-of-death" } : {}), ...(level >= 13 ? { "mystic-arcanum-7": "finger-of-death" } : {}), ...(level >= 15 ? { "mystic-arcanum-8": "dominate-monster" } : {}), ...(level >= 17 ? { "mystic-arcanum-9": "foresight" } : {}) }, ...more });

function field(level, inv, foe = "goblin-warrior") {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(wl(level, inv)).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  s.m1 = ok(apply(s, { type: "spawn", monster: foe, at: { q: 4, r: 0 } }, DM)).events[0].id;
  const m = s.entities[s.m1]; m.hp = m.maxHp = 300; m.ac = 1;
  s.entities.hero.hp = s.entities.hero.maxHp = 300;
  return s;
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 12 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 30 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const ready = (level, inv, seed = 3, foe) => { const s = field(level, inv, foe); s.rng = seed; fight(s); turnOf(s, "hero"); return s; };
const cast = (s, x) => apply(s, { type: "cast", actor: "hero", ...x }, DM);
const hits = (r, id) => r.events.filter((x) => x.type === "damage" && x.target === id);

test("the warlock's features at levels 7 to 15 appear at their levels; invocations by the column, with prerequisites", () => {
  const ids = (l) => derive(wl(l)).record.feats.map((f) => f.id);
  for (const [id, level] of [["contact-patron", 9], ["fiendish-resilience", 10], ["mystic-arcanum", 11], ["mystic-arcanum-7", 13], ["hurl-through-hell", 14], ["mystic-arcanum-8", 15]]) {
    assert.ok(!ids(level - 1).includes(id), `${id} before ${level}`);
    assert.ok(ids(level).includes(id), `${id} at ${level}`);
  }
  for (let l = 1; l <= 20; l++) { assert.deepEqual(validate(wl(l)), [], `level ${l}`); assert.deepEqual(lintRecord(derive(wl(l)).record, { spells: BOOK }), [], `record ${l}`); }
  // The column: 7 at 9, one more at 12 and at 15 (the table's 7, 8, 9).
  const pick = (l, n) => validate(wl(l, INV.filter((id) => (NEEDS[id] ?? 1) <= l).slice(0, n)));
  assert.deepEqual(pick(9, 7), []); assert.ok(pick(9, 8).some((p) => /up to 7/.test(p)));
  assert.ok(pick(12, 8).length === 0 && pick(15, 9).length === 0);
  // Prerequisites: level, another invocation, a cantrip known.
  assert.ok(validate(wl(14, ["witch-sight"])).some((p) => /Witch Sight needs Warlock level 15/.test(p)));
  assert.ok(validate(wl(6, ["whispers-of-the-grave"])).some((p) => /level 7/.test(p)));
  assert.ok(validate(wl(12, ["lifedrinker"])).some((p) => /needs Pact of the Blade/.test(p)));
  assert.deepEqual(validate(wl(12, ["pact-of-the-blade", "thirsting-blade", "devouring-blade", "lifedrinker"])), []);
  assert.ok(validate(wl(9, ["agonizing-blast-poison-spray"])).some((p) => /Poison Spray among/.test(p)));
  // The manual ones are on the record, marked so.
  assert.equal(derive(wl(12, ["pact-of-the-blade", "lifedrinker"])).record.feats.find((f) => f.id === "eldritch-invocations-lifedrinker").tier, "manual");
  // Ability Score Improvement at 8 and 12.
  const at = (l) => featChoices(wl(l)).map((c) => c.at);
  assert.ok(!at(7).includes("ability-score-improvement-8") && at(8).includes("ability-score-improvement-8"));
  assert.ok(!at(11).includes("ability-score-improvement-12") && at(12).includes("ability-score-improvement-12"));
  // Mystic Arcanum: a level 6 spell, not one of another level; Fiendish Resilience: not Force.
  assert.ok(validate({ ...wl(11), choices: { ...wl(11).choices, "mystic-arcanum": "finger-of-death" } }).some((p) => /no option/.test(p)));
  assert.ok(validate({ ...wl(10), choices: { ...wl(10).choices, "fiendish-resilience": "force" } }).some((p) => /no option/.test(p)));
});

test("Agonizing Blast: the Charisma modifier on each Eldritch Blast beam, not on Chill Touch", () => {
  const blast = (inv, spell = "eldritch-blast", targets) => { const s = ready(11, inv); return ok(cast(s, { spell, ...(targets ? { targets: targets(s) } : { target: s.m1 }) })); };
  const three = (s) => [s.m1, s.m1, s.m1];
  const withIt = blast(["agonizing-blast-eldritch-blast"], "eldritch-blast", three), without = blast(["eldritch-mind"], "eldritch-blast", three);
  const bonus = (r) => hits(r, r.events.find((x) => x.type === "attack").target).map((x) => x.bonus);
  assert.equal(bonus(withIt).length, bonus(without).length);
  assert.ok(bonus(withIt).length > 0, "some beam hit");
  assert.deepEqual(bonus(withIt), bonus(without).map((b) => b + 4));
  // Chill Touch is a melee spell attack: bring the goblin close.
  const s = ready(11, ["agonizing-blast-eldritch-blast"]), t = ready(11, ["eldritch-mind"]);
  for (const x of [s, t]) ok(apply(x, { type: "place", actor: x.m1, to: { q: 1, r: 0 } }, DM));
  const a = ok(cast(s, { spell: "chill-touch", target: s.m1 })), b = ok(cast(t, { spell: "chill-touch", target: t.m1 }));
  assert.deepEqual(hits(a, s.m1).map((x) => x.amount), hits(b, t.m1).map((x) => x.amount));
});

test("Eldritch Spear: Eldritch Blast reaches 30 feet more per Warlock level", () => {
  const far = (inv) => {
    const s = field(2, inv);
    ok(apply(s, { type: "place", actor: "hero", to: { q: -13, r: 0 } }, DM));
    ok(apply(s, { type: "place", actor: s.m1, to: { q: 13, r: 0 } }, DM));
    s.rng = 3; ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 13 }, DM)); turnOf(s, "hero");
    return cast(s, { spell: "eldritch-blast", target: s.m1 });
  };
  no(far(["eldritch-mind"]), /reaches 120/);
  ok(far(["eldritch-spear-eldritch-blast"]));
  assert.equal(derive(wl(2, ["eldritch-spear-eldritch-blast"])).record.feats.find((f) => f.spellRange).spellRange.add, 60);
});

test("Repelling Blast: a hit pushes a Large or smaller target up to 10 feet away, as the caster says", () => {
  for (let seed = 1; seed < 200; seed++) {
    const s = ready(5, ["repelling-blast-eldritch-blast"], seed);
    const probe = structuredClone(s), r0 = cast(probe, { spell: "eldritch-blast", targets: [s.m1, s.m1], repel: 10 });
    if (!r0.ok || !r0.events.some((x) => x.type === "attack" && x.hit)) continue;
    const r = ok(cast(s, { spell: "eldritch-blast", targets: [s.m1, s.m1], repel: 10 }));
    const pushes = r.events.filter((x) => x.type === "moved" && x.id === s.m1 && x.forced);
    assert.equal(pushes.length, r.events.filter((x) => x.type === "attack" && x.hit).length, "one push for each beam that hit");
    for (const p of pushes) assert.equal(p.path.length, 2, "10 feet");
    // Left out: no push. More than 10 feet, or without the invocation: refused.
    const t = ready(5, ["repelling-blast-eldritch-blast"], seed);
    assert.ok(!ok(cast(t, { spell: "eldritch-blast", targets: [t.m1, t.m1] })).events.some((x) => x.type === "moved"));
    no(cast(ready(5, ["repelling-blast-eldritch-blast"], seed), { spell: "eldritch-blast", target: s.m1, repel: 15 }), /up to 10 ft/);
    no(cast(ready(5, ["eldritch-mind"], seed), { spell: "eldritch-blast", target: s.m1, repel: 10 }), /can't push/);
    // A Huge target is not pushed.
    const u = ready(5, ["repelling-blast-eldritch-blast"], seed);
    u.entities[u.m1].size = "huge";
    const ru = cast(u, { spell: "eldritch-blast", targets: [u.m1, u.m1], repel: 10 });
    if (ru.ok) assert.ok(!ru.events.some((x) => x.type === "moved"));
    return;
  }
  assert.fail("no seed");
});

test("Armor of Shadows, Fiendish Vigor, Whispers of the Grave: their spells at will, without a slot, and on the warlock alone where the text says", () => {
  const s = field(5, ["armor-of-shadows", "fiendish-vigor", "eldritch-mind"]), e = s.entities.hero, slots = { ...e.slots };
  ok(cast(s, { spell: "mage-armor", target: "hero", via: "eldritch-invocations-armor-of-shadows" }));
  ok(cast(s, { spell: "mage-armor", target: "hero", via: "eldritch-invocations-armor-of-shadows" }));
  assert.deepEqual(e.slots, slots);
  ok(apply(s, { type: "spawn", monster: "commoner", at: { q: -1, r: 0 }, side: "party" }, DM));
  const ally = Object.keys(s.entities).find((id) => s.entities[id].tpl === "commoner");
  const before = structuredClone(s);
  no(cast(s, { spell: "mage-armor", target: ally, via: "eldritch-invocations-armor-of-shadows" }), /on Mor only/);
  assert.deepEqual(s, before);
  // Fiendish Vigor: False Life's 2d4 + 4 at its highest, 12, every time.
  const r = ok(cast(s, { spell: "false-life", via: "eldritch-invocations-fiendish-vigor" }));
  assert.equal(e.tempHp, 12);
  const th = r.events.find((x) => x.type === "tempHp");
  assert.ok(th.dice.length === 2 && th.dice.every((d) => d.max && d.value === 4), "the faces are marked as at their highest, not rolled");
  // Whispers of the Grave needs level 7; at 7 it is cast at will.
  const w = field(7, ["whispers-of-the-grave"]);
  ok(cast(w, { spell: "speak-with-dead", via: "eldritch-invocations-whispers-of-the-grave" }));
  ok(cast(w, { spell: "speak-with-dead", via: "eldritch-invocations-whispers-of-the-grave" }));
  no(cast(field(5, ["armor-of-shadows"]), { spell: "speak-with-dead", via: "eldritch-invocations-whispers-of-the-grave" }), /no feature/);
});

test("One with Shadows: Invisibility at will in Dim Light or Darkness, not in Bright Light", () => {
  const s = field(5, ["one-with-shadows"]);
  no(cast(s, { spell: "invisibility", target: "hero", via: "eldritch-invocations-one-with-shadows" }), /Dim Light or Darkness/);
  s.map.levels[0].light = "dark";
  ok(cast(s, { spell: "invisibility", target: "hero", via: "eldritch-invocations-one-with-shadows" }));
  assert.ok(s.entities.hero.cond.invisible);
});

test("Eldritch Mind: Advantage on the Constitution save to keep Concentration", () => {
  const conc = (inv) => {
    const s = ready(5, inv);
    ok(cast(s, { spell: "hex", target: s.m1, choice: "str", slot: 3 }));
    return ok(apply(s, { type: "harm", actor: "hero", amount: 30 }, DM)).events.find((x) => x.type === "concentration");
  };
  assert.equal(conc(["eldritch-mind"]).mode, "adv");
  assert.notEqual(conc(["armor-of-shadows"]).mode, "adv");
});

test("Witch Sight: Truesight 30 feet from level 15", () => {
  assert.deepEqual(derive(wl(15, ["witch-sight"])).record.senses, { truesight: 30 });
  assert.ok(validate(wl(14, ["witch-sight"])).length, "not before 15");
});

test("Pact of the Chain: Find Familiar as a Magic action without a slot, even in a fight", () => {
  const s = ready(9, ["pact-of-the-chain"]), e = s.entities.hero, slots = { ...e.slots };
  no(cast(s, { spell: "find-familiar" }), /takes longer than a turn/);
  const r = ok(cast(s, { spell: "find-familiar", via: "eldritch-invocations-pact-of-the-chain" }));
  assert.equal(s.encounter.budget.action, 0);
  assert.deepEqual(e.slots, slots);
  assert.ok(r.events.some((x) => x.type === "manual"), "the familiar itself is the DM's");
});

test("Contact Patron: Contact Other Plane once per Long Rest without a slot, its save a success", () => {
  const s = field(9), e = s.entities.hero, slots = { ...e.slots };
  const r = ok(cast(s, { spell: "contact-other-plane", via: "contact-patron" }));
  const sv = r.events.find((x) => x.type === "save" && x.id === "hero");
  assert.ok(sv.success && sv.sure && !sv.dice, "no roll, a success");
  assert.ok(!r.events.some((x) => x.type === "damage"));
  assert.deepEqual(e.slots, slots);
  assert.equal(e.uses["contact-patron"], 0);
  no(cast(s, { spell: "contact-other-plane", via: "contact-patron" }), /no uses/);
  ok(apply(s, { type: "rest" }, DM));
  assert.equal(e.uses["contact-patron"], 1);
  assert.ok(!derive(wl(8)).record.feats.some((f) => f.id === "contact-patron"));
});

test("Mystic Arcanum: the level 6, 7 and 8 spells chosen, each once per Long Rest without a slot", () => {
  const s = ready(15), e = s.entities.hero, slots = { ...e.slots };
  ok(apply(s, { type: "place", actor: s.m1, to: { q: 2, r: 0 } }, DM));
  no(cast(s, { spell: "circle-of-death", hex: { q: 3, r: 0 } }), /level 6 spell slots/);
  ok(cast(s, { spell: "circle-of-death", hex: { q: 3, r: 0 }, via: "mystic-arcanum-circle-of-death" }));
  assert.deepEqual(e.slots, slots);
  assert.equal(e.uses["mystic-arcanum-circle-of-death"], 0);
  turnOf(s, s.m1); turnOf(s, "hero");
  no(cast(s, { spell: "circle-of-death", hex: { q: 3, r: 0 }, via: "mystic-arcanum-circle-of-death" }), /no uses/);
  ok(cast(s, { spell: "finger-of-death", target: s.m1, via: "mystic-arcanum-7-finger-of-death" }));
  no(cast(s, { spell: "finger-of-death", target: s.m1, via: "mystic-arcanum-circle-of-death" }), /can't cast that spell/);
  assert.equal(e.uses["mystic-arcanum-8-dominate-monster"], 1);
  ok(apply(s, { type: "endEncounter" }, DM));
  ok(apply(s, { type: "rest" }, DM));
  assert.equal(e.uses["mystic-arcanum-circle-of-death"], 1);
  assert.equal(e.uses["mystic-arcanum-7-finger-of-death"], 1);
});

test("Fiendish Resilience: Resistance to the damage type chosen, and another after a change on the sheet", () => {
  const s = field(10);
  assert.equal(ok(apply(s, { type: "harm", actor: "hero", amount: 20, dtype: "fire" }, DM)).events.find((x) => x.type === "damage").amount, 10);
  assert.equal(ok(apply(s, { type: "harm", actor: "hero", amount: 20, dtype: "cold" }, DM)).events.find((x) => x.type === "damage").amount, 20);
  ok(apply(s, { type: "setSheet", actor: "hero", sheet: { ...wl(10), choices: { ...wl(10).choices, "fiendish-resilience": "cold" } } }, DM));
  assert.deepEqual(s.entities.hero.resist, ["cold"]);
  assert.equal(ok(apply(s, { type: "harm", actor: "hero", amount: 20, dtype: "fire" }, DM)).events.find((x) => x.type === "damage").amount, 20);
  assert.equal(derive(wl(9)).record.resist, undefined);
});

test("Hurl Through Hell: after a hit, a Charisma save or 8d10 Psychic and Incapacitated to the end of the warlock's next turn", () => {
  for (let seed = 1; seed < 400; seed++) {
    const s = ready(14, undefined, seed), e = s.entities.hero, t = s.entities[s.m1];
    // Not before a hit this turn.
    let before = structuredClone(s);
    no(apply(s, { type: "feature", actor: "hero", feature: "hurl-through-hell", target: s.m1 }, DM), /has not hit/);
    assert.deepEqual(s, before);
    const r1 = ok(cast(s, { spell: "eldritch-blast", target: s.m1 }));
    if (!r1.events.some((x) => x.type === "attack" && x.hit)) continue;
    t.abil.cha = 1;
    const r = ok(apply(s, { type: "feature", actor: "hero", feature: "hurl-through-hell", target: s.m1 }, DM));
    const sv = r.events.find((x) => x.type === "save" && x.id === s.m1);
    if (sv.success) continue;
    const d = hits(r, s.m1)[0];
    assert.equal(d.dtype, "psychic");
    assert.equal(d.dice.length, 8); assert.ok(d.dice.every((x) => x.sides === 10));
    assert.ok(t.cond.incapacitated);
    assert.ok(r.events.some((x) => x.type === "manual" && /Lower Planes/.test(x.text)), "its vanishing is the DM's");
    assert.equal(e.uses["hurl-through-hell"], 0);
    // Once a turn, even with a slot.
    no(apply(s, { type: "feature", actor: "hero", feature: "hurl-through-hell", target: s.m1, slot: 5 }, DM), /already used/);
    ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
    assert.ok(t.cond.incapacitated, "still, after the warlock's turn ends");
    turnOf(s, "hero");
    // With no use left: refused without a slot; a Pact Magic slot restores it.
    const r2 = ok(cast(s, { spell: "eldritch-blast", target: s.m1 }));
    if (r2.events.some((x) => x.type === "attack" && x.hit)) {
      before = structuredClone(s);
      no(apply(s, { type: "feature", actor: "hero", feature: "hurl-through-hell", target: s.m1 }, DM), /Pact Magic slot can restore it/);
      assert.deepEqual(s, before);
      no(apply(s, { type: "feature", actor: "hero", feature: "hurl-through-hell", target: s.m1, slot: 4 }, DM), /no Pact Magic slot of level 4/);
      const slots = e.slots[5];
      ok(apply(s, { type: "feature", actor: "hero", feature: "hurl-through-hell", target: s.m1, slot: 5 }, DM));
      assert.equal(e.slots[5], slots - 1);
    }
    ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
    if (!r2.events.some((x) => x.type === "attack" && x.hit)) assert.ok(!t.cond.incapacitated, "gone at the end of the warlock's next turn");
    return;
  }
  assert.fail("no seed");
});

test("Hurl Through Hell: a Fiend takes no Psychic damage but is still Incapacitated; below level 14 there is none", () => {
  for (let seed = 1; seed < 400; seed++) {
    const s = ready(14, undefined, seed, "imp"), t = s.entities[s.m1];
    t.ac = 1;
    const r1 = ok(cast(s, { spell: "eldritch-blast", target: s.m1 }));
    if (!r1.events.some((x) => x.type === "attack" && x.hit)) continue;
    t.abil.cha = 1; t.saveProf = [];
    const r = ok(apply(s, { type: "feature", actor: "hero", feature: "hurl-through-hell", target: s.m1 }, DM));
    if (r.events.find((x) => x.type === "save" && x.id === s.m1).success) continue;
    assert.equal(hits(r, s.m1).length, 0);
    assert.ok(t.cond.incapacitated);
    no(apply(ready(13), { type: "feature", actor: "hero", feature: "hurl-through-hell", target: "x" }, DM), /no such feature/);
    return;
  }
  assert.fail("no seed");
});

test("a version 20 table saved before #232 loads and plays; its ranger, warlock and wizard get the new features when made again from their sheets", () => {
  // Saved by the engine on main before this change: a level 13 Hunter, a level 14 Fiend warlock and a level 14 Evoker beside a goblin.
  const s = migrate(JSON.parse(readFileSync(new URL("./fixtures/v20-casters-232.json", import.meta.url), "utf8")));
  assert.equal(VERSION, 20, "no state version change");
  assert.equal(s.version, 20);
  const id = (name) => Object.values(s.entities).find((e) => e.name === name).id;
  const R = id("Rook"), W = id("Mor"), V = id("Vex"), G = id("Goblin Warrior 1");
  assert.equal(s.entities[V].feats.find((f) => f.id === "overchannel").overchannel, undefined, "the saved records are the old ones");
  assert.equal(s.entities[R].feats.find((f) => f.id === "relentless-hunter").steadfast, undefined);
  assert.equal(s.entities[W].feats.find((f) => f.id === "hurl-through-hell").action, undefined);
  // It plays by the old records: Overchannel is not there, Hunter's Mark's Concentration is saved for.
  s.entities[G].hp = s.entities[G].maxHp = 500;
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }, DM));
  turnOf(s, V);
  no(apply(s, { type: "cast", actor: V, spell: "fireball", hex: { q: 6, r: 0 }, overchannel: true }, DM), /can't Overchannel/);
  ok(apply(s, { type: "cast", actor: V, spell: "fireball", hex: { q: 6, r: 0 } }, DM));
  turnOf(s, R);
  ok(apply(s, { type: "cast", actor: R, spell: "hunters-mark", target: G }, DM));
  assert.equal(ok(apply(s, { type: "harm", actor: R, amount: 10 }, DM)).events.filter((x) => x.type === "concentration").length, 1);
  ok(apply(s, { type: "endEncounter" }, DM));
  // Made again from their sheets, they have the new features, which work.
  ok(apply(s, { type: "setSheet", actor: V, sheet: s.entities[V].sheet }, DM));
  assert.deepEqual(s.entities[V].feats.find((f) => f.id === "overchannel").overchannel, { list: "wizard", maxSlot: 5, die: 12 });
  ok(apply(s, { type: "setSheet", actor: R, sheet: s.entities[R].sheet }, DM));
  ok(apply(s, { type: "rest" }, DM));
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }, DM));
  turnOf(s, R);
  ok(apply(s, { type: "cast", actor: R, spell: "hunters-mark", target: G }, DM));
  assert.equal(ok(apply(s, { type: "harm", actor: R, amount: 10 }, DM)).events.filter((x) => x.type === "concentration").length, 0, "Relentless Hunter");
  ok(apply(s, { type: "endEncounter" }, DM));
  // The old warlock sheet has no Fiendish Resilience or Mystic Arcanum chosen: the DM is told to choose, and nothing changes.
  const before = structuredClone(s.entities[W]);
  no(apply(s, { type: "setSheet", actor: W, sheet: s.entities[W].sheet }, DM), /Choose an option for Fiendish Resilience/);
  assert.deepEqual(s.entities[W], before);
  const sheet = { ...s.entities[W].sheet, choices: { "fiendish-resilience": "fire", "mystic-arcanum": "eyebite", "mystic-arcanum-7": "plane-shift", "eldritch-invocations": ["eldritch-mind"] } };
  ok(apply(s, { type: "setSheet", actor: W, sheet }, DM));
  assert.deepEqual(s.entities[W].resist, ["fire"]);
  assert.ok(s.entities[W].feats.find((f) => f.id === "hurl-through-hell").action);
});
