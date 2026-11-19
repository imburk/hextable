// Homebrew subclasses, addition F of docs/specs/homebrew-subclasses.md: "the die just rolled" (a modifier value `{ rolled: true }` that takes the number the
// damage step before it rolled) and `after: 'weaponHit'` (a feature's action used once on a turn, on a creature the holder hit with a weapon).
// The college is invented for this test ("College of Whirling Steel", a pack "whirling-folk"); no published subclass is used.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { CONTENT } from "../src/content/index.js";
import { loadPack, overlayOf, using } from "../src/content/registry.js";
import { lintEntry, lintRecord, rolledIn } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { forPlayers } from "../src/content/packs.js";
import { modifiers, speedOf } from "../src/modifiers.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "it was refused"); if (re) assert.match(r.error, re); return r; };
const json = (x) => JSON.stringify(x);

// ---------- the invented pack ----------
const P = "whirling-folk", hb = (n) => `hb-${P}-${n}`, SRC = `homebrew:${P}`;
const doc = (lists) => ({ format: "hextable-pack", v: 1, pack: { id: P, name: "Whirling Folk", version: 1, license: "CC0, by the author", attribution: "Written for a test." }, ...lists });
const feature = (id, level, grants, more = {}) => ({ id: hb(id), name: id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()), level, tier: "auto", checked: false, text: `The ${id}, in the pack's own words.`, ...(grants ? { grants } : {}), ...more });
const sub = (id, name, cls, features) => ({ id: hb(id), name, class: cls, source: SRC, checked: false, text: "Sworn to the whirl of the blade.", features });
// Guard: after a weapon hit, the Bardic die as slashing damage to the creature hit, and the same number added to the holder's Armor Class until the start of its next turn.
// Dash: the same, with the number added to the holder's Speed. Choice: one of the two, named when it is used. Any: after any hit, the damage alone.
const STEP = { damage: { column: "bardic-die" }, type: "slashing" };
const till = { on: "turnStart" };
const GUARD = { action: { time: "free", after: "weaponHit", target: { creature: { range: [5, 5] } }, cost: { resource: "bardic-inspiration" },
  effects: [STEP, { modifier: { on: "ac", op: "add", value: { rolled: true } }, to: "caster", ends: till }] } };
const DASH = { action: { time: "free", after: "weaponHit", target: { creature: { range: [5, 5] } }, cost: { resource: "bardic-inspiration" },
  effects: [STEP, { modifier: { on: "speed", op: "add", value: { rolled: true } }, to: "caster", ends: till }] } };
const CHOICE = { action: { time: "free", after: "weaponHit", target: { creature: { range: [5, 5] } }, cost: { resource: "bardic-inspiration" }, modes: [
  { id: "guard", name: "Guard", effects: [STEP, { modifier: { on: "ac", op: "add", value: { rolled: true } }, to: "caster", ends: till }] },
  { id: "dash", name: "Dash", effects: [STEP, { modifier: { on: "speed", op: "add", value: { rolled: true } }, to: "caster", ends: till }] }] } };
const ANY = { action: { time: "free", after: "hit", target: { creature: { range: [60, 60] } }, cost: { resource: "bardic-inspiration" }, effects: [STEP] } };
const WHIRL = sub("college-of-whirling-steel", "College of Whirling Steel", "bard", [
  feature("whirl-guard", 3, GUARD), feature("whirl-dash", 3, DASH), feature("whirl-choice", 3, CHOICE), feature("whirl-any", 3, ANY),
]);
const pack = (d) => { const r = loadPack(d); assert.ok(r.ok, (r.problems ?? []).join("; ")); return r.pack; };
const PACK = pack(doc({ subclasses: [WHIRL] })), ON = overlayOf([PACK]), OFF = overlayOf([]);
const problems = (...subs) => (loadPack(doc({ subclasses: subs })).problems ?? []).join("\n");
const one = (grants, more = {}) => problems(sub("college-x", "College of X", "bard", [feature("x-feature", 3, grants, more)]));
const acts = (action) => ({ action: { ...GUARD.action, ...action } });
const effects = (...effects) => acts({ effects });

// ---------- the table ----------
const A = { str: 10, dex: 14, con: 12, int: 10, wis: 10, cha: 18 };
const bard = (level = 5, over = {}) => ({ name: "Zaa", class: "bard", level, subclass: hb("college-of-whirling-steel"), abilities: A,
  skills: ["performance", "persuasion", "insight"], expertise: ["performance", "persuasion"], weapons: ["dagger"], spells: ["vicious-mockery"], ...over });
const ID = (n) => hb(n);
const feat = (r, id) => r.feats.find((f) => f.id === id);
const ZAP = { id: "zap", name: "Zap", type: "ranged", bonus: 30, damage: "1d4", dtype: "fire", range: [60, 120], spell: true };

// The hero in a grass field with a goblin beside it (300 Hit Points, Armor Class 1, so that only a natural 1 misses). No fight yet unless asked.
function field(sheet = bard(), { foe = [1, 0], seed = 7 } = {}) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  s.entities.hero.sheet = structuredClone(sheet);
  s.entities.hero.attacks.push(structuredClone(ZAP));
  ok(apply(s, { type: "claim", entity: "hero", user: "pat", userName: "Pat" }, PAT));
  s.gob = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: foe[0], r: foe[1] }, name: "Gob" }, DM)).events[0].id;
  Object.assign(s.entities[s.gob], { hp: 300, maxHp: 300, ac: 1 });
  return s;
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 4 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 60 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const use = (s, f, more = {}, ctx = PAT) => apply(s, { type: "feature", actor: "hero", feature: ID(f), target: s.gob, ...more }, ctx);
const swing = (s, attack = "dagger") => { s.encounter.budget.action = 1; return ok(apply(s, { type: "attack", actor: "hero", attack, target: s.gob }, PAT)).events.find((x) => x.type === "attack"); };
// A fight on the hero's turn in which the hero has hit the goblin with `attack` (the seed is changed until it hits: a natural 1 misses).
function hitFight(attack = "dagger", sheet = bard(), { foe, from = 1 } = {}) {
  for (let seed = from; seed < from + 60; seed++) {
    const s = field(sheet, { seed, foe });
    fight(s); turnOf(s, "hero");
    if (swing(s, attack).hit) return s;
  }
  throw new Error("no seed hit");
}
// Armor Class as the engine reads it (engine/rolls.js acOf): the base, or what a modifier sets, plus what modifiers add.
const acOf = (s, t) => { const m = modifiers(s, t, "ac", { target: t }); return (m.set ?? t.ac) + m.add; };

// ---------- the gate and the reading ----------
test("the pack loads in strict mode, its entries lint, and `after` and `rolled` are read in words", () => {
  assert.deepEqual(lintEntry("subclasses", WHIRL, { pack: P, srd: CONTENT }), []);
  const read = readEntry("subclasses", WHIRL, { spells: [] });
  assert.deepEqual(read.problems, []);
  const lines = read.lines.join("\n");
  assert.match(lines, /It follows a hit the holder made with a weapon this turn, on the creature it hit, once a turn\. A spell attack and an Unarmed Strike are not a weapon here\./);
  assert.match(lines, /It follows a hit the holder made this turn, once a turn\./, "after: hit is read as it was");
  assert.match(lines, /an addition to its Armor Class equal to the number the damage step just before it rolled \(the same roll, not a new one\)/);
  assert.match(lines, /an addition to its Speed equal to the number the damage step just before it rolled/);
});

test("the gate refuses `{ rolled: true }` that has no die before it, each with a sentence", () => {
  const RO = { modifier: { on: "ac", op: "add", value: { rolled: true } }, to: "caster", ends: till };
  const reason = /takes the number the damage step just before it rolled/;
  assert.equal(effects(STEP, RO) && one(effects(STEP, RO)), "");
  assert.equal(one(effects({ damage: "1d8", type: "slashing" }, RO)), "", "a plain die written out");
  assert.match(one(effects(RO)), new RegExp(`${reason.source}, and the step before it is not a damage step`), "nothing before it");
  assert.match(one(effects({ heal: "1d8" }, RO)), /the step before it is not a damage step/, "a step that is not damage");
  assert.match(one(effects(STEP, { condition: "prone" }, RO)), /the step before it is not a damage step/, "a step between");
  assert.match(one(effects(RO, STEP)), /the step before it is not a damage step/, "after it, not before");
  assert.match(one(effects({ damage: "1d8+2", type: "slashing" }, RO)), /must be plain dice \(like 1d8, no flat part\) with no `times` and no `when`/);
  assert.match(one(effects({ damage: "2d6", type: "slashing", times: 2 }, RO)), /with no `times` and no `when`/);
  assert.match(one(effects({ damage: "1d8", type: "slashing", when: ["melee"] }, RO)), /with no `times` and no `when`/);
  // inside a branch the step before is in the same list
  assert.equal(one(effects({ save: "dex", dc: 12, onFail: [{ damage: "1d8", type: "slashing" }, RO] })), "");
  assert.match(one(effects({ damage: "1d8", type: "slashing" }, { save: "dex", dc: 12, onFail: [RO] })), /the step before it is not a damage step/);
  // the value itself
  const val = (value, op = "add") => one(effects(STEP, { modifier: { on: "ac", op, value }, to: "caster", ends: till }));
  assert.match(val({ rolled: false }), /a modifier value that is the number rolled is `\{ rolled: true \}`/);
  assert.match(val({ rolled: true, perLevel: 1 }), /modifier value is a number|is `\{ rolled: true \}`/);
  assert.match(val({ rolled: true }, "set"), /goes with the op "add"/);
  assert.match(val({ rolled: true }, "min"), /goes with the op "add"/);
  assert.equal(rolledIn("not a list"), null);
});

test("where `{ rolled: true }` may not be: a feat, an item, a trait's modifier, a zone, a spell; and where `after` may not", () => {
  const RO = { modifier: { on: "ac", op: "add", value: { rolled: true } }, to: "caster", ends: till };
  const why = /is for a modifier step of a subclass feature's action, right after its damage step/;
  const plain = { action: { time: "bonus", target: { self: true }, duration: "1 minute", effects: [{ modifier: { on: "ac", op: "add", value: { rolled: true } } }] } };
  const feats = { id: hb("rolled-feat"), name: "Rolled Feat", category: "general", tier: "assist", source: SRC, checked: false, text: "t", grants: plain };
  assert.match((loadPack(doc({ feats: [feats] })).problems ?? []).join("\n"), why);
  const item = { id: hb("rolled-ring"), name: "Rolled Ring", category: "wondrous", rarity: "rare", wear: "carried", tier: "assist", source: SRC, checked: false, text: "t", grants: plain };
  assert.match((loadPack(doc({ items: [item] })).problems ?? []).join("\n"), why);
  assert.match((loadPack(doc({ feats: [{ ...feats, id: hb("rolled-trait"), grants: { modifiers: [{ on: "ac", op: "add", value: { rolled: true } }] } }] })).problems ?? []).join("\n"), why);
  assert.match(one({ modifiers: [{ on: "ac", op: "add", value: { rolled: true } }] }), why, "a feature's own always-on modifier has no die before it");
  // a spell and a monster
  const spell = { id: hb("rolled-spell"), name: "Rolled Spell", source: SRC, level: 1, school: "evocation", classes: ["bard"], time: "action", range: 30, components: ["verbal"], duration: "1 minute", concentration: false, target: { creature: { range: [30, 30] } },
    effects: [{ damage: "1d8", type: "fire" }, { modifier: { on: "ac", op: "add", value: { rolled: true } }, ends: till }], tier: "auto", checked: false, text: "t" };
  assert.match((loadPack(doc({ spells: [spell] })).problems ?? []).join("\n"), why);
  // a zone's steps run on each creature that enters
  const zone = { time: "bonus", duration: "1 minute", target: { area: { shape: "emanation", size: 10 } }, zone: { on: ["enter"] }, effects: [{ damage: "1d6", type: "fire" }, RO] };
  assert.match(one({ action: zone }), /a modifier of `\{ rolled: true \}` cannot be one of them/);
  // after
  assert.equal(one(acts({ after: "weaponHit" })), "");
  assert.match(one(acts({ after: "weapon" })), /action after is "hit" or "weaponHit", on a creature/);
  assert.match(one(acts({ after: "weaponHit", target: { self: true } })), /action after is "hit" or "weaponHit", on a creature/);
});

// ---------- derive, the record and what players are sent ----------
test("derive: the record's action carries `after` and the value as data, the class's content and an SRD-only sheet are not changed", () => {
  const before = json(CONTENT.classes.bard);
  using(ON, () => {
    assert.deepEqual(validate(bard()), []);
    const r = derive(bard()).record;
    const guard = feat(r, ID("whirl-guard")).action;
    assert.equal(guard.after, "weaponHit");
    assert.deepEqual(guard.effects[0], { damage: "1d8", type: "slashing" }, "the Bardic die at level 5, put in");
    assert.deepEqual(guard.effects[1].modifier.value, { rolled: true }, "the number rolled stays a marker until the step runs");
    assert.deepEqual(lintRecord(r, { spells: CONTENT.spells }), []);
    assert.equal(feat(derive(bard(3)).record, ID("whirl-guard")).action.effects[0].damage, "1d6", "and 1d6 at level 3");
  });
  assert.equal(json(CONTENT.classes.bard), before);
  const plain = derive({ ...bard(), subclass: "lore", skills: ["performance", "persuasion", "insight", "history", "arcana", "deception"] }).record;
  using(ON, () => assert.equal(json(derive({ ...bard(), subclass: "lore", skills: ["performance", "persuasion", "insight", "history", "arcana", "deception"] }).record), json(plain)));
  for (const c of Object.values(CONTENT.classes)) for (const f of [...c.features, ...(c.subclass?.features ?? [])]) {
    assert.ok(!["weaponHit"].includes(f.grants?.action?.after), `${c.id}/${f.id}`);
    assert.ok(!json(f.grants ?? {}).includes('"rolled"'), `${c.id}/${f.id}`);
  }
});

test("what players are sent: the pack's copy carries the data; the view and events are the kinds a use always makes; the new flag is filtered as `hit:` is", () => {
  const copy = forPlayers(doc({ subclasses: [{ ...WHIRL, dmNotes: "The DM's own note." }] })).data.subclasses[0];
  assert.equal(copy.dmNotes, undefined);
  assert.deepEqual(copy.features[0].grants.action.effects[1].modifier.value, { rolled: true });
  assert.equal(copy.features[0].grants.action.after, "weaponHit");
  using(ON, () => {
    const keys = (s) => Object.keys(view(s, PAT).entities.hero).sort();
    const srd = field({ ...bard(), subclass: "lore", skills: ["performance", "persuasion", "insight", "history", "arcana", "deception"] });
    const s = hitFight();
    assert.deepEqual(keys(s), keys(srd), "a hero with the pack's subclass is sent the same fields of a creature as one of an SRD subclass");
    // the flags: a weapon hit is `hit:` and `whit:`; a spell hit is `hit:` only
    const flags = view(s, PAT).encounter.flags;
    assert.equal(flags["hit:hero:" + s.gob], true); assert.equal(flags["whit:hero:" + s.gob], true, "players now see `whit:` flags beside `hit:` ones");
    assert.equal(flags["attacked:hero"], true);
    const used = ok(use(s, "whirl-guard"));
    const kinds = used.events.map((x) => x.type);
    assert.deepEqual(kinds.filter((k) => !["std", "damage", "effectStart"].includes(k)), [], `only the kinds a feature makes: ${kinds}`);
    assert.deepEqual(viewEvents(used.events, s, PAT).map((x) => x.type), kinds);
    assert.deepEqual(keys(s), keys(srd));
    // the DM is told as before; a hidden creature's flags are filtered, `whit:` exactly as `hit:`
    const dm = view(s, DM).encounter.flags;
    assert.ok(dm["hit:hero:" + s.gob] && dm["whit:hero:" + s.gob]);
    // a creature the party does not know of (the DM's, outside the arena): the flags that name it are filtered, `whit:` exactly as `hit:`
    const ambush = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: -6, r: 2 }, name: "Ambusher", hidden: true }, DM)).events[0].id;
    Object.assign(s.encounter.flags, { [`hit:${ambush}:hero`]: true, [`whit:${ambush}:hero`]: true, [`hit:hero:${ambush}`]: true, [`whit:hero:${ambush}`]: true, [`attacked:${ambush}`]: true });
    const pv = view(s, PAT), seen = Object.keys(pv.encounter.flags);
    assert.ok(!seen.some((k) => k.includes(ambush)), `no flag that names the hidden creature: ${seen}`);
    assert.ok(!json(pv).includes(`"${ambush}"`) && !json(pv).includes(`:${ambush}`), "no trace of it");
    assert.ok(seen.includes("attacked:hero") && seen.includes("whit:hero:" + s.gob), "the flags about known creatures stay");
    const dv = Object.keys(view(s, DM).encounter.flags);
    for (const k of [`hit:${ambush}:hero`, `whit:${ambush}:hero`, `hit:hero:${ambush}`, `whit:hero:${ambush}`]) assert.ok(dv.includes(k), `the DM keeps ${k}`);
  });
});

// ---------- played ----------
test("after a weapon hit: extra damage of the die, and the same number added to Armor Class until the start of the holder's next turn", () => {
  using(ON, () => {
    let s = hitFight();
    const e = s.entities.hero, t = s.entities[s.gob], base = acOf(s, e), dice = e.uses["bardic-inspiration"], hp = t.hp;
    assert.equal(e.uses["bardic-inspiration"], dice, "the swing spent nothing of the die's pool");
    const r = ok(use(s, "whirl-guard"));
    const dmg = r.events.find((x) => x.type === "damage");
    assert.equal(dmg.dtype, "slashing");
    assert.equal(dmg.dice.length, 1); assert.equal(dmg.dice[0].sides, 8, "one die, the Bardic die of a level 5 bard");
    assert.equal(hp - t.hp, dmg.amount); assert.ok(dmg.amount >= 1 && dmg.amount <= 8);
    assert.equal(acOf(s, e) - base, dmg.amount, "the Armor Class goes up by the number the damage rolled");
    assert.equal(e.uses["bardic-inspiration"], dice - 1, "a use of the Bardic die");
    assert.equal(s.encounter.budget.bonus, 1, "free: no Bonus Action spent");
    // it lasts through the other creatures' turns and ends at the start of the holder's next turn
    ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
    assert.equal(acOf(s, e) - base, dmg.amount, "still there on the goblin's turn");
    turnOf(s, "hero");
    assert.equal(acOf(s, e), base, "gone at the start of the holder's next turn");
    assert.ok(!s.effects.some((x) => x.name === "Whirl guard" && x.parts.some((p) => !p.ended)));
    // the same die and the damage are one roll: the damage's amount is the one added, whatever the seed
    const seen = new Set();
    for (let from = 1; from <= 400; from += 61) {
      s = hitFight("dagger", bard(), { from });
      const b = acOf(s, s.entities.hero), g = ok(use(s, "whirl-guard")).events.find((x) => x.type === "damage");
      assert.equal(acOf(s, s.entities.hero) - b, g.amount, `from seed ${from}`);
      seen.add(g.amount);
    }
    assert.ok(seen.size > 1, "the number differs from one roll to another");
  });
});

test("the same die added to a Speed, and the choice of one of two", () => {
  using(ON, () => {
    const s = hitFight();
    const e = s.entities.hero, base = speedOf(s, e);
    const dmg = ok(use(s, "whirl-dash")).events.find((x) => x.type === "damage");
    assert.equal(speedOf(s, e) - base, dmg.amount, "the number rolled, in feet");
    const c = hitFight();
    const b = acOf(c, c.entities.hero), sp = speedOf(c, c.entities.hero);
    // no mode named: as for any feature with modes, the DM is handed it and nothing is rolled
    const none = ok(use(c, "whirl-choice"));
    assert.ok(none.events.some((x) => x.type === "manual") && !none.events.some((x) => x.type === "damage"));
    assert.equal(acOf(c, c.entities.hero), b);
    c.encounter.flags = { ...c.encounter.flags }; delete c.encounter.flags[`after:${ID("whirl-choice")}:hero`];
    const d = ok(use(c, "whirl-choice", { mode: "dash" })).events.find((x) => x.type === "damage");
    assert.equal(speedOf(c, c.entities.hero) - sp, d.amount); assert.equal(acOf(c, c.entities.hero), b, "only the mode chosen");
    const g = hitFight();
    const gb = acOf(g, g.entities.hero);
    const gd = ok(use(g, "whirl-choice", { mode: "guard" })).events.find((x) => x.type === "damage");
    assert.equal(acOf(g, g.entities.hero) - gb, gd.amount);
  });
});

test("the use is once a turn, and a new turn needs a new hit", () => {
  using(ON, () => {
    const s = hitFight();
    ok(use(s, "whirl-guard"));
    const before = json(s);
    no(use(s, "whirl-guard"), /has already used Whirl guard this turn/);
    assert.equal(json(s), before, "a refusal changes nothing");
    ok(use(s, "whirl-dash"), "another feature has its own use");
    ok(apply(s, { type: "endTurn", actor: "hero" }, DM));
    turnOf(s, "hero");
    no(use(s, "whirl-guard"), /has not hit Gob with a weapon this turn/);
  });
});

test("refused with no weapon hit this turn, and nothing changes: not in a fight, no attack, a miss, another creature, a spell attack, an Unarmed Strike", () => {
  using(ON, () => {
    // not in a fight
    let s = field();
    let before = json(s);
    no(use(s, "whirl-guard"), /follows a hit with a weapon in a fight/);
    assert.equal(json(s), before);
    // in a fight, no attack yet
    fight(s); turnOf(s, "hero"); before = json(s);
    no(use(s, "whirl-guard"), /follows a hit with a weapon: Zaa has not hit Gob with a weapon this turn/);
    assert.equal(json(s), before, "the die, the effect and the state are as they were");
    // a miss: the goblin's Armor Class too high for a natural 20-less roll is not reliable, so set the hero's bonus down
    // (only a natural 1 misses a goblin of Armor Class 1: a seed is found for it)
    let miss = null;
    for (let seed = 1; seed < 400 && !miss; seed++) { const t = field(bard(), { seed }); fight(t); turnOf(t, "hero"); if (!swing(t).hit) miss = t; }
    assert.ok(miss, "a miss was found");
    s = miss;
    assert.equal(s.encounter.flags[`hit:hero:${s.gob}`], undefined); assert.equal(s.encounter.flags[`whit:hero:${s.gob}`], undefined);
    before = json(s);
    no(use(s, "whirl-guard"), /has not hit Gob with a weapon this turn/);
    assert.equal(json(s), before);
    // a weapon hit on another creature is not a hit on this one
    s.encounter.flags[`whit:hero:someone-else`] = true; s.encounter.flags[`whit:other:${s.gob}`] = true;
    before = json(s);
    no(use(s, "whirl-guard"), /has not hit Gob with a weapon this turn/);
    assert.equal(json(s), before);
  });
  // a spell attack and an Unarmed Strike hit, but are not a weapon hit; `after: 'hit'` follows either as it did
  for (const attack of ["zap", "unarmed-strike"]) {
    using(ON, () => {
      const s = hitFight(attack);
      const flags = s.encounter.flags;
      assert.equal(flags[`hit:hero:${s.gob}`], true, `${attack} hit`);
      assert.equal(flags[`whit:hero:${s.gob}`], undefined, `${attack} is not a weapon hit`);
      const before = json(s);
      no(use(s, "whirl-guard"), /has not hit Gob with a weapon this turn/);
      assert.equal(json(s), before);
      ok(use(s, "whirl-any"));
    });
  }
  // a thrown weapon is a weapon
  using(ON, () => {
    const s = hitFight("dagger-thrown");
    assert.equal(s.encounter.flags[`whit:hero:${s.gob}`], true);
    ok(use(s, "whirl-guard"));
  });
});

test("every check is before the payment: a use short, a use spent, and the data wrong each leave everything as it was", () => {
  using(ON, () => {
    const s = hitFight();
    const e = s.entities.hero;
    e.uses["bardic-inspiration"] = 0;
    let before = json(s);
    no(use(s, "whirl-guard"), /no uses of Bardic Inspiration left/);
    assert.equal(json(s), before);
    e.uses["bardic-inspiration"] = 3;
    // a record that skipped the gate: a rolled value with no die before it
    const f = e.feats.find((x) => x.id === ID("whirl-guard"));
    f.action.effects.shift();
    before = json(s);
    no(use(s, "whirl-guard"), /its data is wrong \(a modifier whose value is `\{ rolled: true \}` takes the number the damage step just before it rolled/);
    assert.equal(json(s), before, "nothing was paid, no flag set");
    // a target out of reach is refused by the aim, before the payment
    const e2 = e.feats.find((x) => x.id === ID("whirl-dash"));
    e2.action.effects[0].damage = "1d8+2";
    before = json(s);
    no(use(s, "whirl-dash"), /plain dice/);
    assert.equal(json(s), before);
  });
});

test("`after: 'hit'` is as it was: it follows a spell hit, an Unarmed Strike and a weapon hit", () => {
  using(ON, () => {
    for (const attack of ["zap", "unarmed-strike", "dagger"]) {
      const s = hitFight(attack);
      const r = ok(use(s, "whirl-any"));
      assert.equal(r.events.filter((x) => x.type === "damage").length, 1, attack);
    }
  });
});

test("a creature that resists changes the damage dealt, and not the number rolled", () => {
  using(ON, () => {
    const s = hitFight();
    s.entities[s.gob].resist = ["slashing"];
    const e = s.entities.hero, base = acOf(s, e);
    const dmg = ok(use(s, "whirl-guard")).events.find((x) => x.type === "damage");
    const added = acOf(s, e) - base;
    assert.ok(added >= 1 && added <= 8, "the die as rolled, whatever Resistance did to the damage");
    assert.equal(dmg.amount, Math.floor(added / 2), "half of it, rounded down, dealt: Resistance cut the damage, not the number added");
  });
});

test("the overlay away: the feature is not there to use", () => {
  const s = newGame(5, { party: [{ sheet: { ...bard(4), subclass: "lore", skills: ["performance", "persuasion", "insight", "history", "arcana", "deception"] } }] });
  let hero;
  using(ON, () => { hero = ok(apply(s, { type: "setSheet", sheet: bard(5) }, DM)).events.find((x) => x.type === "spawned").id; });
  assert.ok(feat(s.entities[hero], ID("whirl-guard")).action.after);
  ok(apply(s, { type: "refresh", actor: hero }, DM));
  assert.equal(feat(s.entities[hero], ID("whirl-guard")), undefined);
  using(OFF, () => no(apply(s, { type: "feature", actor: hero, feature: ID("whirl-guard") }, DM), /no such feature/));
});

test("an SRD-only game is as it was: the same state and view with the pack lent", () => {
  const sheet = { ...bard(), subclass: "lore", skills: ["performance", "persuasion", "insight", "history", "arcana", "deception"] };
  const run = () => { const s = field(sheet); fight(s); turnOf(s, "hero"); const hit = swing(s).hit; return { s, hit }; };
  const a = run();
  using(ON, () => { const b = run(); assert.equal(json(b.s), json(a.s)); assert.equal(b.hit, a.hit); });
  assert.equal(view(a.s, PAT).encounter.flags[`hit:hero:${a.s.gob}`] !== undefined, a.hit);
  // the SRD's own `after: hit` (Hurl Through Hell) is unchanged: the flag it follows is the same one
  const hurl = [...CONTENT.classes.warlock.features, ...(CONTENT.classes.warlock.subclass?.features ?? [])].find((f) => f.id === "hurl-through-hell");
  assert.equal(hurl.grants.action.after, "hit");
});

// ---------- replay ----------
test("replay: the same actions from the same seed give the same state and the same events", () => {
  const run = () => {
    const out = [];
    using(ON, () => {
      const s = hitFight();
      out.push(...ok(use(s, "whirl-guard")).events);
      out.push(...ok(use(s, "whirl-dash")).events);
      out.push(s);
    });
    return out;
  };
  const a = run(), b = run();
  assert.deepEqual(a, b);
  assert.ok(a.some((e) => e.type === "damage"));
});
