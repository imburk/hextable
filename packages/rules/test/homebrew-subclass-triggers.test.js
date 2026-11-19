// Homebrew subclasses, addition H of docs/specs/homebrew-subclasses.md: `grants.triggers`, what the holder does sets something off: `attackAction` (taking the Attack action: modifiers
// until the end of the turn, a Speed one also as walking feet at once) and `opportunityHit` (an Opportunity Attack that hits: up to half the Speed to move afterwards, provoking nothing).
// The college and the oath are invented for this test (the "College of the Swift Needle" and the "Oath of the Hollow Bell", a pack "bell-needle-folk"); no published subclass is used.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { CONTENT } from "../src/content/index.js";
import { loadPack, overlayOf, using } from "../src/content/registry.js";
import { lintEntry, lintRecord, TRIGGER_KEYS } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { forPlayers } from "../src/content/packs.js";
import { speedOf } from "../src/modifiers.js";
import { effectsOf } from "../src/durations.js";
import { view, viewEvents } from "../src/view.js";
import { squareRoom } from "./fixtures/square-room.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "it was refused"); if (re) assert.match(r.error, re); return r; };
const json = (x) => JSON.stringify(x);

// ---------- the invented pack ----------
const P = "bell-needle-folk", hb = (n) => `hb-${P}-${n}`, SRC = `homebrew:${P}`;
const doc = (lists) => ({ format: "hextable-pack", v: 1, pack: { id: P, name: "Bell and Needle Folk", version: 1, license: "CC0, by the author", attribution: "Written for a test." }, ...lists });
const feature = (id, level, grants, more = {}) => ({ id: hb(id), name: id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()), level, tier: "auto", checked: false, text: `The ${id}, in the pack's own words.`, ...(grants ? { grants } : {}), ...more });
const sub = (id, name, cls, features) => ({ id: hb(id), name, class: cls, source: SRC, checked: false, text: `Sworn to the ${id}.`, features });
const SPEED = { on: "speed", op: "add", value: 10 };
const GUARD = { on: "ac", op: "add", value: 1 };
const DANCE = { triggers: { attackAction: { modifiers: [SPEED] } } };
const WARD = { triggers: { attackAction: { modifiers: [GUARD] } } };
const CHASE = { triggers: { opportunityHit: { move: "half" } } };
const NEEDLE = sub("college-of-the-swift-needle", "College of the Swift Needle", "bard", [feature("needle-dance", 3, DANCE), feature("needle-ward", 3, WARD)]);
const BELL = sub("oath-of-the-hollow-bell", "Oath of the Hollow Bell", "paladin", [feature("bell-chase", 3, CHASE)]);
const pack = (d) => { const r = loadPack(d); assert.ok(r.ok, (r.problems ?? []).join("; ")); return r.pack; };
// Every form of an amount a modifier value may take (derive puts the number in, as it does for a grant's modifiers): at Bard level 5 (Proficiency Bonus 3, Charisma 16, Intelligence 10), and the oath's `{ column }`.
const at = (n, value) => feature(n, 3, { triggers: { attackAction: { modifiers: [{ on: "speed", op: "add", value }] } } });
const FORMS = sub("college-of-the-forms", "College of the Forms", "bard", [at("form-prof", { prof: 1 }), at("form-mod", { mod: "cha" }), at("form-min", { mod: "int", min: 2 }), at("form-per", { perLevel: 2 }),
  at("form-by", { byLevel: { 3: 10, 6: 15 } }), at("form-late", { byLevel: { 6: 15 } }),
  feature("form-flourish", 3, { triggers: { attackAction: { modifiers: [SPEED] } },
    action: { time: "free", after: "weaponHit", target: { creature: { range: [5, 5] } }, cost: { resource: "bardic-inspiration" }, effects: [{ damage: { column: "bardic-die" }, type: "slashing" }] } })]);
const VOWS = sub("oath-of-the-forms", "Oath of the Forms", "paladin", [at("vow-column", { column: "channel-divinity" })]);
const PACK = pack(doc({ subclasses: [NEEDLE, BELL, FORMS, VOWS] })), ON = overlayOf([PACK]), OFF = overlayOf([]);
const problems = (...subs) => (loadPack(doc({ subclasses: subs })).problems ?? []).join("\n");
const bardOne = (grants, more = {}) => problems(sub("college-x", "College of X", "bard", [feature("x-feature", 3, grants, more)]));

// ---------- the table ----------
const A = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 16 };
const bard = (level = 5, over = {}) => ({ name: "Zaa", class: "bard", level, subclass: hb("college-of-the-swift-needle"), abilities: A,
  skills: ["performance", "persuasion", "insight"], expertise: ["performance", "persuasion"], weapons: ["dagger"], spells: ["vicious-mockery"], ...over });
const paladin = (level = 5, over = {}) => ({ name: "Sir Bell", class: "paladin", level, subclass: hb("oath-of-the-hollow-bell"), abilities: A, skills: ["athletics", "religion"], choices: { "fighting-style": "defense" },
  armour: "chain-mail", shield: true, weapons: ["longsword"], spells: ["bless", "cure-wounds"], ...over });
const feat = (r, id) => r.feats.find((f) => f.id === id);
const DANCE_ID = hb("needle-dance"), WARD_ID = hb("needle-ward"), CHASE_ID = hb("bell-chase");

// The hero in a field of grass with Gob beside it (1,0), Bo (2,0) and Cy (4,0); each of 300 Hit Points and Armor Class 1, so that only a natural 1 misses. No fight yet.
function field(sheet = bard(), { seed = 7, bo = { q: 2, r: 0 } } = {}) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  s.entities.hero.sheet = structuredClone(sheet);
  ok(apply(s, { type: "claim", entity: "hero", user: "pat", userName: "Pat" }, PAT));
  for (const [key, at, name] of [["gob", { q: 1, r: 0 }, "Gob"], ["bo", bo, "Bo"], ["cy", { q: 4, r: 0 }, "Cy"]]) {
    s[key] = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at, name }, DM)).events[0].id;
    Object.assign(s.entities[s[key]], { hp: 300, maxHp: 300, ac: 1 });
  }
  return s;
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 60 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const swing = (s, more = {}) => { s.encounter.budget.action = 1; return apply(s, { type: "attack", actor: "hero", attack: "dagger", target: s.gob, ...more }, PAT); };
const effectNamed = (s, id) => effectsOf(s).filter((fx) => fx.feature === id && fx.source === "hero");
const moved = (r) => r.events.filter((x) => x.type === "moved");

// ---------- the gate and the reading ----------
test("the pack loads in strict mode, its entries lint, and both triggers are read in words", () => {
  for (const x of [NEEDLE, BELL]) assert.deepEqual(lintEntry("subclasses", x, { pack: P, srd: CONTENT }), []);
  assert.deepEqual(TRIGGER_KEYS, ["attackAction", "opportunityHit"]);
  const needle = readEntry("subclasses", NEEDLE, { spells: [] });
  assert.deepEqual(needle.problems, []);
  const a = needle.lines.join("\n");
  assert.match(a, /When the holder takes the Attack action on its own turn in a fight, it gets .*Speed.* until the end of that turn, once a turn\. A second Attack action in the turn \(Action Surge\) adds nothing more\. A Speed it adds is also added to the movement it has left, at once\./);
  assert.match(a, /\+1 to its Armor Class until the end of that turn/);
  const bell = readEntry("subclasses", BELL, { spells: [] });
  assert.deepEqual(bell.problems, []);
  const b = bell.lines.join("\n");
  assert.match(b, /When the holder's Opportunity Attack hits, it may move up to half its Speed \(rounded down to 5 feet\), and that movement provokes no Opportunity Attacks\. The engine finishes the mover's whole move first, so the holder spends this movement afterwards, with a move of its own, before that turn ends; it does not move in between the mover's steps, and it can do nothing else with it\. A holder that rides or is ridden is moved by the DM\./);
});

test("the gate refuses a trigger that is not a trigger, a sentence for each", () => {
  assert.equal(bardOne(DANCE), "");
  assert.equal(bardOne({ triggers: { attackAction: { modifiers: [SPEED, GUARD] }, opportunityHit: { move: "half" } } }), "", "both at once");
  assert.match(bardOne({ triggers: {} }), /triggers is \{ attackAction\?, opportunityHit\? \}, with at least one/);
  assert.match(bardOne({ triggers: [] }), /triggers is \{ attackAction\?, opportunityHit\? \}/);
  assert.match(bardOne({ triggers: { onRest: {} } }), /"onRest" is not (a trigger a feature can state|something a trigger list has)/);
  assert.match(bardOne({ triggers: { attackAction: {} } }), /triggers\.attackAction is \{ modifiers \}|modifiers is a list of 1 to 5/);
  assert.match(bardOne({ triggers: { attackAction: { modifiers: [] } } }), /triggers\.attackAction\.modifiers is a list of 1 to 5 modifiers/);
  assert.match(bardOne({ triggers: { attackAction: { modifiers: Array(6).fill(GUARD) } } }), /triggers\.attackAction\.modifiers is a list of 1 to 5 modifiers/);
  assert.match(bardOne({ triggers: { attackAction: { modifiers: "speed" } } }), /modifiers (is a list of 1 to 5 modifiers|must be a list)/);
  assert.match(bardOne({ triggers: { attackAction: { modifiers: [SPEED], ends: "turnEnd" } } }), /triggers\.attackAction is \{ modifiers \}|"ends" is not something/);
  assert.match(bardOne({ triggers: { attackAction: { modifiers: [{ on: "ac", op: "nonsense", value: 1 }] } } }), /unknown op "nonsense"/);
  assert.match(bardOne({ triggers: { attackAction: { modifiers: [{ on: "nowhere", op: "add", value: 1 }] } } }), /unknown hook "nowhere"/);
  for (const k of ["against", "except", "uses", "onFail", "cost"]) {
    const why = bardOne({ triggers: { attackAction: { modifiers: [{ ...GUARD, [k]: k === "uses" ? 1 : k === "except" ? "source" : k === "cost" ? "bardic-inspiration" : k === "onFail" ? true : "target" }] } } });
    assert.match(why, new RegExp(`lasts for the turn and is the holder's own: \`${k}\` is not for it|\`${k}\``), `${k}`);
  }
  assert.match(bardOne({ triggers: { opportunityHit: { move: "full" } } }), /triggers\.opportunityHit is \{ move: "half" \}/);
  assert.match(bardOne({ triggers: { opportunityHit: {} } }), /triggers\.opportunityHit is \{ move: "half" \}/);
  assert.match(bardOne({ triggers: { opportunityHit: { move: "half", free: true } } }), /triggers\.opportunityHit is \{ move: "half" \}|"free" is not something/);
  assert.match(bardOne({ triggers: { opportunityHit: true } }), /triggers\.opportunityHit is \{ move: "half" \}|must be an object/);
});

test("only a subclass's feature may state a trigger: a feat and an item are refused, and what they hold changes nothing", () => {
  const feat1 = { id: "hb-bell-needle-folk-fleet", name: "Fleet", category: "general", tier: "auto", source: SRC, checked: false, text: "In the pack's own words.", grants: DANCE };
  const item1 = { id: "hb-bell-needle-folk-spurs", name: "Spurs", category: "wondrous", rarity: "rare", wear: "carried", tier: "auto", source: SRC, checked: false, text: "In the pack's own words.", grants: DANCE };
  const asPack = (lists) => (loadPack(doc(lists)).problems ?? []).join("\n");
  assert.match(asPack({ feats: [feat1] }), /Only a subclass's feature can state a trigger on what its holder does \(triggers\)/);
  assert.match(asPack({ items: [item1] }), /Only a subclass's feature can state a trigger on what its holder does \(triggers\)/);
  // Not in strict mode (an SRD-side feat), the linter takes it for a feat and refuses it for an item (the key lists), and the reading says the engine adds nothing.
  assert.deepEqual(lintEntry("feats", { ...feat1, id: "t", name: "T", source: "SRD 5.2.1" }, { strict: false }), []);
  assert.ok(lintEntry("items", { ...item1, id: "t", name: "T", source: "SRD 5.2.1" }, { strict: false }).some((m) => /does not grant "triggers"/.test(m)));
  const r = readEntry("feat", { ...feat1, id: "t", name: "T" });
  assert.ok(r.lines.some((l) => /A feat or an item belongs to no class, so the engine adds nothing/.test(l)));
  // And derive ignores it all the same (a feat is a feature of no class): the hero's record has no trigger from it.
  const sheet = { name: "Fig", class: "fighter", level: 4, abilities: A, skills: ["athletics", "perception"], choices: { "fighting-style": "defense" }, weapons: ["longsword"], armour: "chain-mail", feats: [{ id: "alert", at: "ability-score-improvement-4" }] };
  const base = derive(sheet).record;
  const lent = JSON.parse(json(CONTENT.feats.alert));
  lent.grants = { ...(lent.grants ?? {}), ...DANCE };
  const old = CONTENT.feats.alert;
  CONTENT.feats.alert = lent;
  try { assert.ok(!derive(sheet).record.feats.some((f) => f.triggers), "no feature of a feat carries it"); } finally { CONTENT.feats.alert = old; }
  assert.ok(!base.feats.some((f) => f.triggers));
});

test("a record's feature is linted: the same sentences, and a record that skipped the gate is refused", () => {
  using(ON, () => {
    const r = derive(bard()).record, f = feat(r, DANCE_ID), L = (x) => lintRecord(x, { spells: CONTENT.spells });
    assert.deepEqual(L(JSON.parse(json(r))), [], "the record the engine makes lints");
    assert.deepEqual(f.triggers, DANCE.triggers);
    const bad = JSON.parse(json(r));
    feat(bad, DANCE_ID).triggers = { attackAction: { modifiers: [] } };
    assert.ok(L(bad).some((m) => /modifiers is a list of 1 to 5 modifiers/.test(m)));
    const bad2 = JSON.parse(json(r));
    feat(bad2, DANCE_ID).triggers = { opportunityHit: { move: "double" } };
    assert.ok(L(bad2).some((m) => /opportunityHit is \{ move: "half" \}/.test(m)));
  });
});

// ---------- derive and what players are sent ----------
test("derive: the trigger is on the record of a class feature, once the subclass is in; an SRD-only record is unchanged", () => {
  using(ON, () => {
    const r = derive(bard()).record;
    assert.deepEqual(feat(r, DANCE_ID).triggers, { attackAction: { modifiers: [SPEED] } });
    assert.deepEqual(feat(r, WARD_ID).triggers, { attackAction: { modifiers: [GUARD] } });
    assert.ok(!feat(derive(bard(2, { subclass: undefined })).record ?? { feats: [] }, DANCE_ID));
    assert.deepEqual(feat(derive(paladin()).record, CHASE_ID).triggers, CHASE.triggers);
    // the subclass's level is the feature's: nothing at level 2
    const srd = derive({ ...bard(), subclass: "lore" }).record;
    assert.ok(!srd.feats.some((f) => f.triggers), "an SRD subclass has none");
  });
  const srdOnly = derive({ ...bard(), subclass: "lore" }).record;
  using(ON, () => assert.equal(json(derive({ ...bard(), subclass: "lore" }).record), json(srdOnly), "with the pack lent, an SRD-only sheet is the same"));
});

test("what players are sent: the pack's copy carries the triggers as written, a party member's record has them as data, and nothing about the owed movement reaches a creature the party is not told of", () => {
  const copy = forPlayers(doc({ subclasses: [{ ...BELL, dmNotes: "The DM's own note." }, NEEDLE] })).data.subclasses;
  assert.equal(copy[0].dmNotes, undefined);
  assert.deepEqual(copy[0].features[0].grants.triggers, CHASE.triggers);
  assert.deepEqual(copy[1].features[0].grants.triggers, DANCE.triggers);
  using(ON, () => {
    const s = field(bard());
    assert.deepEqual(feat(view(s, PAT).entities.hero, DANCE_ID).triggers, DANCE.triggers, "the party's own member is sent its feature as data");
    // a hidden creature's flag named `rmove:` is filtered as `hit:` is
    fight(s); turnOf(s, "hero");
    const ambush = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: -8, r: 3 }, name: "Ambusher", hidden: true }, DM)).events[0].id;
    Object.assign(s.encounter.flags, { [`rmove:${ambush}`]: 15, "rmove:hero": 15, [`hit:hero:${ambush}`]: true });
    const pv = view(s, PAT), seen = Object.keys(pv.encounter.flags);
    assert.ok(!seen.some((k) => k.includes(ambush)), `no flag that names the hidden creature: ${seen}`);
    assert.ok(seen.includes("rmove:hero"), "the flag of a creature the party knows stays");
    assert.ok(Object.keys(view(s, DM).encounter.flags).includes(`rmove:${ambush}`), "the DM keeps it");
  });
});

// ---------- taking the Attack action ----------
test("on taking the Attack action: the modifiers until the end of the turn, the Speed also as walking feet at once, once a turn", () => {
  using(ON, () => {
    const s = field(bard());
    fight(s); turnOf(s, "hero");
    const b = s.encounter.budget;
    assert.equal(b.move, 30); assert.equal(speedOf(s, s.entities.hero), 30);
    // 10 feet walked first (it is the Attack action that comes second): the 10 feet are added to what is left
    ok(apply(s, { type: "move", actor: "hero", to: { q: -2, r: 0 } }, PAT));
    assert.equal(b.move, 20);
    s.entities[s.gob].pos = { q: -1, r: 0, z: 0 };            // beside the hero again
    const r = ok(swing(s));
    assert.equal(s.encounter.budget.move, 30, "10 feet more walking left than before the attack");
    assert.equal(speedOf(s, s.entities.hero), 40);
    assert.equal(effectNamed(s, DANCE_ID).length, 1);
    assert.equal(s.encounter.flags[`trig:${DANCE_ID}:hero`], true, "its own mark, not the `after:` one");
    assert.ok(r.events.some((x) => x.type === "effectStart" && x.name === "Needle dance" && x.lasts === "until the end of the current turn"));
    // Armor Class +1 from the second feature, as a modifier only: no feet
    assert.equal(effectNamed(s, WARD_ID).length, 1);
    // the 30 feet can be walked, and no more
    ok(apply(s, { type: "move", actor: "hero", to: { q: -2, r: 6 } }, PAT));
    assert.equal(s.encounter.budget.move, 0);
    no(apply(s, { type: "move", actor: "hero", to: { q: -2, r: 7 } }, PAT));
    // Dash after it doubles the new Speed
    s.encounter.budget.action = 1;
    ok(apply(s, { type: "dash", actor: "hero" }, PAT));
    assert.equal(s.encounter.budget.move, 40);
    // the end of the turn: the Speed is the creature's own again
    ok(apply(s, { type: "endTurn", actor: "hero" }, PAT));
    assert.equal(effectNamed(s, DANCE_ID).length, 0); assert.equal(effectNamed(s, WARD_ID).length, 0);
    assert.equal(speedOf(s, s.entities.hero), 30);
    turnOf(s, "hero");
    assert.equal(s.encounter.budget.move, 30);
    assert.equal(s.encounter.flags[`trig:${DANCE_ID}:hero`], undefined, "a new turn, a new mark");
    s.entities[s.gob].pos = { q: -2, r: 5, z: 0 };
    ok(swing(s));
    assert.equal(s.encounter.budget.move, 40, "and it works again on the next turn");
  });
});

test("a second Attack action in a turn (a fresh action) adds nothing: once a turn", () => {
  using(ON, () => {
    const s = field(bard());
    fight(s); turnOf(s, "hero");
    ok(swing(s));
    const after = json({ move: s.encounter.budget.move, fx: effectNamed(s, DANCE_ID).length });
    ok(swing(s));                               // `swing` gives the hero a fresh action: Action Surge's second Attack action
    assert.equal(json({ move: s.encounter.budget.move, fx: effectNamed(s, DANCE_ID).length }), after);
    assert.equal(speedOf(s, s.entities.hero), 40);
  });
});

test("what is not the Attack action does not set it off: an attack of the Attack action's other attacks, a Bonus Action, a spell, an Opportunity Attack, an attack that starts the fight", () => {
  using(ON, () => {
    // the attack that starts the fight only rolls Initiative
    const s1 = field(bard());
    ok(apply(s1, { type: "attack", actor: "hero", attack: "dagger", target: s1.gob }, PAT));
    assert.ok(s1.encounter, "a fight began");
    assert.equal(effectNamed(s1, DANCE_ID).length, 0); assert.equal(s1.encounter.flags[`trig:${DANCE_ID}:hero`], undefined);
    // an Extra Attack's later attack: the Attack action was taken once
    const s = field(bard(5, { subclass: hb("college-of-the-swift-needle") }));
    s.entities.hero.features.extraAttack = 1;
    fight(s); turnOf(s, "hero");
    ok(swing(s));
    assert.equal(s.encounter.budget.move, 40);
    const fx = effectNamed(s, DANCE_ID).length;
    ok(apply(s, { type: "attack", actor: "hero", attack: "dagger", target: s.gob }, PAT));       // the second attack, from the pool
    assert.equal(s.encounter.budget.move, 40); assert.equal(effectNamed(s, DANCE_ID).length, fx);
    // a spell is not the Attack action
    const t = field(bard());
    fight(t); turnOf(t, "hero");
    ok(apply(t, { type: "cast", actor: "hero", spell: "vicious-mockery", target: t.gob }, PAT));
    assert.equal(effectNamed(t, DANCE_ID).length, 0); assert.equal(t.encounter.budget.move, 30);
  });
});

test("a refused attack changes nothing: no effect, no mark, no feet", () => {
  using(ON, () => {
    const s = field(bard());
    fight(s); turnOf(s, "hero");
    s.encounter.budget.action = 1;
    const refuse = (more, re) => { const before = json(s); no(apply(s, { type: "attack", actor: "hero", attack: "dagger", target: s.gob, ...more }, PAT), re); assert.equal(json(s), before, "nothing changed"); };
    refuse({ attack: "no-such-attack" }, /Unknown attack/);
    refuse({ target: s.cy }, /away|reaches/);
    refuse({ target: "hero" }, /can't attack itself/);
    s.encounter.budget.action = 0;
    refuse({}, /action/i);
    assert.equal(effectNamed(s, DANCE_ID).length, 0);
    assert.equal(s.encounter.budget.move, 30);
  });
});

test("an Opportunity Attack on someone else's turn is not the Attack action", () => {
  using(ON, () => {
    let seen = null;
    for (let seed = 1; seed < 60 && !seen; seed++) {
      const s = field(bard(), { seed });
      fight(s); turnOf(s, s.gob);
      const r = ok(apply(s, { type: "move", actor: s.gob, to: { q: 3, r: 0 } }, DM));
      if (r.events.some((x) => x.type === "attack" && x.actor === "hero" && x.opportunity)) seen = s;
    }
    assert.ok(seen, "the hero made an Opportunity Attack");
    assert.equal(effectNamed(seen, DANCE_ID).length, 0); assert.equal(speedOf(seen, seen.entities.hero), 30);
    assert.equal(Object.keys(seen.encounter.flags).some((k) => k.startsWith("trig:")), false);
  });
});

test("data that skipped the gate is told to the DM and left alone", () => {
  using(ON, () => {
    const s = field(bard());
    feat(s.entities.hero, DANCE_ID).triggers = { attackAction: { modifiers: "fast" } };
    feat(s.entities.hero, WARD_ID).triggers = { attackAction: { modifiers: [{ on: 7 }] } };
    fight(s); turnOf(s, "hero");
    const r = ok(swing(s));
    assert.equal(r.events.filter((x) => x.type === "manual" && /its data is wrong/.test(x.text)).length, 2);
    assert.equal(effectNamed(s, DANCE_ID).length, 0); assert.equal(s.encounter.budget.move, 30);
    assert.ok(r.events.some((x) => x.type === "attack"), "the attack itself was made");
  });
});

test("a Speed modifier that is not an `add` still gives the feet it raised, and one that lowers gives none", () => {
  using(ON, () => {
    const s = field(bard());
    feat(s.entities.hero, DANCE_ID).triggers = { attackAction: { modifiers: [{ on: "speed", op: "set", value: 50 }] } };
    fight(s); turnOf(s, "hero");
    ok(swing(s));
    assert.equal(speedOf(s, s.entities.hero), 50); assert.equal(s.encounter.budget.move, 50);
    const t = field(bard());
    feat(t.entities.hero, DANCE_ID).triggers = { attackAction: { modifiers: [{ on: "speed", op: "add", value: -10 }] } };
    fight(t); turnOf(t, "hero");
    ok(swing(t));
    assert.equal(speedOf(t, t.entities.hero), 20); assert.equal(t.encounter.budget.move, 30, "feet already counted are not taken back");
  });
});

test("the overlay away: the trigger is gone with the subclass; an SRD-only game plays the Attack action as it did", () => {
  const s = (sheet) => { const g = field(sheet); fight(g); turnOf(g, "hero"); return g; };
  const lore = (over = {}) => ({ ...bard(5), subclass: "lore", skills: ["performance", "persuasion", "insight", "history", "arcana", "deception"], ...over });
  const a = s(lore()), b = using(ON, () => s(lore()));
  ok(swing(a)); using(ON, () => ok(swing(b)));
  assert.equal(a.encounter.budget.move, 30); assert.equal(b.encounter.budget.move, 30);
  assert.equal(json(a.encounter.flags), json(b.encounter.flags));
  assert.equal(json(effectsOf(a)), json(effectsOf(b)));
});

// ---------- an Opportunity Attack that hits ----------
// A fight on Gob's turn, the hero (a paladin of the Hollow Bell) beside it and Bo on the hero's other side (so that walking off provokes Bo); Gob walks away and the hero's Opportunity
// Attack is made. `hit`: whether the seed is changed until it hits or until it misses.
function chase({ hit = true, sheet = paladin(), tweak, late, who = "gob", to = { q: 3, r: 0 } } = {}) {
  for (let seed = 1; seed < 80; seed++) {
    const s = field(sheet, { seed, bo: { q: -1, r: 0 } });
    tweak?.(s);
    fight(s); late?.(s); turnOf(s, s[who]);
    const r = ok(apply(s, { type: "move", actor: s[who], to }, DM));
    const oa = r.events.find((x) => x.type === "attack" && x.actor === "hero" && x.opportunity);
    if (oa && !!oa.hit === hit) return { s, r, oa };
  }
  throw new Error("no seed");
}
const flagOf = (s) => s.encounter.flags["rmove:hero"];

test("an Opportunity Attack that hits gives up to half the Speed to move afterwards, and tells the holder", () => {
  using(ON, () => {
    const { s, r } = chase();
    assert.equal(flagOf(s), 15, "half of 30 feet");
    assert.ok(r.events.some((x) => x.type === "note" && x.id === "hero" && /Bell chase: Sir Bell may move up to 15 ft without provoking Opportunity Attacks\. The engine finishes the other creature's move first, so Sir Bell moves afterwards, before this turn ends\./.test(x.text)));
    assert.equal(s.entities.hero.reactionUsed, true, "the one Reaction");
    // the mover's own walk went on to its end
    assert.deepEqual(s.entities[s.gob].pos, { q: 3, r: 0, z: 0 });
  });
});

test("the movement is spent with `move` out of turn, provokes nothing, and what is left is kept", () => {
  using(ON, () => {
    const { s } = chase();
    const bo = s.entities[s.bo];
    assert.equal(bo.reactionUsed ?? false, false, "Bo could make an Opportunity Attack on the hero walking away from it");
    const r = ok(apply(s, { type: "move", actor: "hero", to: { q: 1, r: 0 } }, PAT));        // one step: 5 feet, away from Bo
    assert.equal(r.events.some((x) => x.type === "reaction" || (x.type === "attack" && x.opportunity)), false, "nothing was provoked");
    assert.equal(s.entities[s.bo].reactionUsed ?? false, false);
    assert.equal(moved(r).length, 1);
    assert.deepEqual(s.entities.hero.pos, { q: 1, r: 0, z: 0 });
    assert.equal(flagOf(s), 10, "10 feet left");
    ok(apply(s, { type: "move", actor: "hero", to: { q: 2, r: 0 } }, PAT));
    assert.equal(flagOf(s), 5);
    const was = json(s);
    no(apply(s, { type: "move", actor: "hero", to: { q: 2, r: 2 } }, PAT), /Too far\. Sir Bell has 5 ft of movement left/);
    assert.equal(json(s), was);
    ok(apply(s, { type: "move", actor: "hero", to: { q: 2, r: 1 } }, PAT));
    assert.equal(flagOf(s), undefined, "none left, the flag goes");
  });
  // the same walk on the hero's own turn does provoke Bo (the control: it is the feature that provokes nothing)
  using(ON, () => {
    const s = field(paladin(), { bo: { q: -1, r: 0 } });
    s.entities[s.gob].pos = { q: 5, r: 3, z: 0 };
    fight(s); turnOf(s, "hero");
    const r = ok(apply(s, { type: "move", actor: "hero", to: { q: 1, r: 0 } }, PAT));
    assert.ok(r.events.some((x) => x.type === "reaction" && x.id === s.bo), "Bo's Opportunity Attack");
  });
});

test("the movement is only for moving: it goes no further than its feet, and no other action can use it", () => {
  using(ON, () => {
    const { s } = chase();
    // too far: 15 feet is 3 hexes
    const before = json(s);
    no(apply(s, { type: "move", actor: "hero", to: { q: -3, r: 0 } }, PAT), /Too far\. Sir Bell has 15 ft of movement left/);
    assert.equal(json(s), before, "a refused move changes nothing");
    // nothing else: every action that needs the turn is refused, and changes nothing
    const refuse = (a, re) => { const was = json(s); no(apply(s, a, PAT), re); assert.equal(json(s), was, `${a.type}: nothing changed`); };
    refuse({ type: "attack", actor: "hero", attack: "longsword", target: s.gob }, /turn|action|away|reaches/i);
    refuse({ type: "dash", actor: "hero" }, /turn|action/i);
    refuse({ type: "disengage", actor: "hero" }, /turn|action/i);
    refuse({ type: "dodge", actor: "hero" }, /turn|action/i);
    refuse({ type: "stand", actor: "hero" }, /turn|Prone|stand/i);
    refuse({ type: "endTurn", actor: "hero" }, /isn't Sir Bell's turn/);
    // `move` is also a refusal for a creature that has none
    refuse({ type: "move", actor: "hero", to: { q: 3, r: 3 } }, /Too far|Can't get there|arena/);
    // the DM's own move is the DM's: it is not the owed movement (it moves on the mover's turn only)
    no(apply(s, { type: "move", actor: s.cy, to: { q: 5, r: 0 } }, DM), /isn't Cy's turn/);
    // and another player cannot spend it for the hero
    no(apply(s, { type: "move", actor: "hero", to: { q: 1, r: 0 } }, { role: "player", userId: "lena" }));
  });
});

test("it lapses when the turn ends, and a new turn has none", () => {
  using(ON, () => {
    const { s } = chase();
    assert.equal(flagOf(s), 15);
    ok(apply(s, { type: "endTurn", actor: s.gob }, DM));
    assert.equal(flagOf(s), undefined);
    const was = json(s);
    no(apply(s, { type: "move", actor: "hero", to: { q: 1, r: 0 } }, PAT), /isn't Sir Bell's turn|moves on/);
    // (it is not the hero's turn, or it is: either way nothing is owed)
    void was;
  });
});

test("a miss, a Reaction already spent, a creature without the feature, and a Speed of 0 give nothing", () => {
  using(ON, () => {
    const { s } = chase({ hit: false, tweak: (t) => { t.entities[t.gob].ac = 40; } });
    assert.equal(flagOf(s), undefined, "an Opportunity Attack that misses");
    // the Reaction already spent: no Opportunity Attack at all
    const t = field(paladin(), { bo: { q: -1, r: 0 } });
    t.entities.hero.reactionUsed = true;
    fight(t); turnOf(t, t.gob);
    t.entities.hero.reactionUsed = true;
    const r = ok(apply(t, { type: "move", actor: t.gob, to: { q: 3, r: 0 } }, DM));
    assert.equal(r.events.some((x) => x.type === "attack" && x.actor === "hero"), false);
    assert.equal(flagOf(t), undefined);
    // another creature's Opportunity Attack (Bo has none of it): nothing owed to Bo
    const u = field(paladin(), { bo: { q: -1, r: 0 } });
    fight(u); turnOf(u, u.cy);
    ok(apply(u, { type: "move", actor: u.cy, to: { q: 6, r: 0 } }, DM));
    assert.equal(Object.keys(u.encounter.flags).some((k) => k.startsWith("rmove:")), false);
    // a hero of the SRD's own oath, in the same chase, is owed nothing
    const v = chase({ sheet: { ...paladin(5), subclass: "devotion" } });
    assert.equal(flagOf(v.s), undefined);
    // a Speed of 0 at the hit (Grappled, say) gives no feet: nothing is kept and nothing said
    const z = chase({ tweak: (g) => { g.entities.hero.cond.grappled = { by: g.bo, holds: [] }; } });
    assert.equal(flagOf(z.s), undefined);
  });
});

test("a holder that rides or is ridden is told to the DM, and nothing is kept", () => {
  using(ON, () => {
    const { s, r } = chase({ late: (g) => { Object.assign(g.entities.hero, { riding: { on: g.cy, controlled: false } }); g.entities[g.cy].rider = "hero"; g.entities[g.cy].pos = { ...g.entities.hero.pos }; } });
    assert.equal(flagOf(s), undefined);
    assert.ok(r.events.some((x) => x.type === "manual" && x.actor === "hero" && /the engine does not move a creature that rides or is ridden this way, so the DM does/.test(x.text)));
  });
});

test("a foe that holds the feature is told to the DM, not to the party, and the DM spends it", () => {
  using(ON, () => {
    // A foe built from the paladin's sheet beside the hero, which walks away on its own turn: the foe's Opportunity Attack hits.
    let made = null;
    for (let seed = 1; seed < 80 && !made; seed++) {
      const s = field(bard(), { seed });
      s.entities.foe = makeEntity(derive(paladin()).record, { id: "foe", kind: "pc", side: "foe", pos: { q: -1, r: 0, z: 0 } });
      Object.assign(s.entities.hero, { ac: 1 });
      fight(s); turnOf(s, "hero");
      const r = ok(apply(s, { type: "move", actor: "hero", to: { q: 2, r: 2 } }, PAT));
      if (r.events.some((x) => x.type === "attack" && x.actor === "foe" && x.opportunity && x.hit)) made = { s, r };
    }
    assert.ok(made, "the foe's Opportunity Attack hit");
    const { s, r } = made;
    assert.equal(s.encounter.flags["rmove:foe"], 15);
    assert.ok(r.events.some((x) => x.type === "manual" && x.actor === "foe" && /may move up to 15 ft/.test(x.text)));
    assert.ok(!viewEvents(r.events, s, PAT).some((x) => x.type === "note" && /may move up to/.test(x.text ?? "")), "the party is not sent the foe's note");
    assert.ok(Object.keys(view(s, DM).encounter.flags).includes("rmove:foe"));
  });
});

test("an `rmove:` flag made by the engine for a creature the party is not told of is kept from players", () => {
  using(ON, () => {
    let made = null;
    for (let seed = 1; seed < 120 && !made; seed++) {
      const s = field(bard(), { seed });
      s.settings.sight = "light"; s.map.levels[0].light = "dark";
      s.entities.foe = makeEntity(derive(paladin()).record, { id: "foe", kind: "pc", side: "foe", pos: { q: 0, r: 1, z: 0 } });
      s.entities.foe.senses = { darkvision: 120 };
      Object.assign(s.entities.hero, { ac: 1 });
      fight(s); turnOf(s, "hero");
      const r = ok(apply(s, { type: "move", actor: "hero", to: { q: -3, r: 0 } }, PAT));
      if (r.events.some((x) => x.type === "attack" && x.actor === "foe" && x.opportunity && x.hit)) made = { s, r };
    }
    assert.ok(made, "the unseen foe's Opportunity Attack hit");
    const { s, r } = made;
    assert.equal(s.encounter.flags["rmove:foe"], 15, "made by the engine");
    const pv = view(s, PAT);
    if (pv.entities.foe === undefined) {
      assert.ok(!Object.keys(pv.encounter.flags).some((k) => k.includes("foe")), "no flag that names it is sent");
      assert.ok(!json(viewEvents(r.events, s, PAT)).includes("may move up to"), "nor its note");
    } else assert.ok(Object.keys(pv.encounter.flags).includes("rmove:foe") === true, "told of it, so its flags go as the others' do");
    assert.ok(Object.keys(view(s, DM).encounter.flags).includes("rmove:foe"));
  });
});

test("answered when asked: an Opportunity Attack that hits gives the movement, one answered with a Grapple instead gives none", () => {
  using(ON, () => {
    const asked = (seed) => {
      const s = field(paladin(), { seed, bo: { q: -1, r: 0 } });
      s.entities.hero.reactions = { "opportunity-attack": "ask" };
      fight(s); turnOf(s, s.gob);
      const r = ok(apply(s, { type: "move", actor: s.gob, to: { q: 3, r: 0 } }, DM));
      return { s, r };
    };
    let hit = null;
    for (let seed = 1; seed < 80 && !hit; seed++) {
      const { s } = asked(seed);
      assert.ok(s.pending, "the walk waits for its player");
      assert.equal(flagOf(s), undefined, "nothing is owed while it waits");
      const r = ok(apply(s, { type: "react", prompt: s.pending.n, take: "opportunity-attack" }, PAT));
      if (r.events.some((x) => x.type === "attack" && x.actor === "hero" && x.opportunity && x.hit)) hit = s;
    }
    assert.ok(hit, "an answered Opportunity Attack hit");
    assert.equal(flagOf(hit), 15);
    const { s } = asked(1);
    ok(apply(s, { type: "react", prompt: s.pending.n, take: "opportunity-attack-grapple" }, PAT));
    assert.equal(flagOf(s), undefined, "a Grapple is not an attack roll that hit");
  });
});

test("replay: the same actions give the same game", () => {
  using(ON, () => {
    const run = () => {
      const { s } = chase();
      ok(apply(s, { type: "move", actor: "hero", to: { q: 1, r: 0 } }, PAT));
      return json(s);
    };
    assert.equal(run(), run());
  });
});

// ---------- the fix round of #535: baked amounts, the turn's own mark, the free budget's limits, giving the movement up ----------
const FORM = (n) => hb(`form-${n}`);
const forms = (over = {}) => bard(5, { subclass: hb("college-of-the-forms"), ...over });

test("an amount in an attackAction modifier is put in as a grant's modifier is: prof, mod (with min), perLevel, byLevel, and the oath's column", () => {
  using(ON, () => {
    const r = derive(forms()).record, v = (n) => feat(r, FORM(n)).triggers?.attackAction.modifiers[0].value;
    assert.equal(v("prof"), 3, "{ prof: 1 } at Bard level 5");
    assert.equal(v("mod"), 3, "Charisma 16");
    assert.equal(v("min"), 2, "Intelligence 10 gives 0, the minimum 2");
    assert.equal(v("per"), 10, "2 a level");
    assert.equal(v("by"), 10, "the highest level reached, 3");
    assert.equal(feat(r, FORM("late")).triggers, undefined, "a byLevel not yet reached gives no modifier, and so no trigger");
    assert.ok(!json(r).includes("byLevel") && !json(r).includes("perLevel"), "no amount is left on the record");
    assert.deepEqual(lintRecord(JSON.parse(json(r)), { spells: CONTENT.spells }), [], "the record lints");
    // at level 6 the byLevel's second step is reached; at level 3 the Proficiency Bonus is 2
    assert.equal(feat(derive(forms({ level: 6 })).record, FORM("late")).triggers.attackAction.modifiers[0].value, 15);
    assert.equal(feat(derive(forms({ level: 3 })).record, FORM("prof")).triggers.attackAction.modifiers[0].value, 2);
    // the oath's column of the class table (Channel Divinity uses, a number): 2 at level 5
    assert.equal(feat(derive(paladin(5, { subclass: hb("oath-of-the-forms") })).record, hb("vow-column")).triggers.attackAction.modifiers[0].value, 2);
    // the amounts do not change what the other features of the pack are
    assert.deepEqual(feat(r, DANCE_ID), undefined);
  });
});

test("the amounts reach the engine as numbers: the Speed it gives is the sum, the holder moves, and nothing is NaN", () => {
  using(ON, () => {
    const s = field(forms());
    fight(s); turnOf(s, "hero");
    ok(swing(s));
    const gain = 3 + 3 + 2 + 10 + 10 + 10;                             // prof, mod, min, per, by, and the flourish's own +10
    const h = s.entities.hero;
    assert.equal(speedOf(s, h), 30 + gain);
    assert.equal(s.encounter.budget.move, 30 + gain);
    assert.ok(Number.isFinite(speedOf(s, h)));
    for (const fx of effectsOf(s)) for (const p of fx.parts) assert.ok(typeof p.modifier.value === "number", `${fx.name}: a number`);
    s.entities[s.gob].pos = { q: 9, r: 9, z: 0 };
    ok(apply(s, { type: "move", actor: "hero", to: { q: -2, r: 0 } }, PAT));
    assert.equal(s.encounter.budget.move, 20 + gain);
  });
});

test("a Speed amount that is dice is refused by the gate, and data that skipped it is told to the DM", () => {
  const speed = (value) => bardOne({ triggers: { attackAction: { modifiers: [{ on: "speed", op: "add", value }] } } });
  assert.equal(speed({ mod: "cha", min: 1 }), "");
  assert.equal(speed({ byLevel: { 3: 5, 6: 10 } }), "");
  assert.match(speed("1d4"), /a Speed modifier of triggers\.attackAction is a number of feet/);
  assert.match(speed({ column: "bardic-die" }), /a Speed modifier of triggers\.attackAction is a number of feet/, "the bard's column holds dice");
  assert.notEqual(speed({ mod: "cha", die: 6 }), "", "dice from a modifier are refused (by the shapes in a pack, by the feet sentence in a record)");
  assert.match(speed({ byLevel: { 3: "1d6" } }), /a Speed modifier of triggers\.attackAction is a number of feet/);
  assert.equal(bardOne({ triggers: { attackAction: { modifiers: [{ on: "ac", op: "add", value: "1d4" }] } } }), "", "only Speed needs feet: a die on Armor Class is a die");
  using(ON, () => {
    const s = field(bard());
    feat(s.entities.hero, DANCE_ID).triggers = { attackAction: { modifiers: [{ on: "speed", op: "add", value: "d8" }] } };
    fight(s); turnOf(s, "hero");
    const r = ok(swing(s));
    assert.ok(r.events.some((x) => x.type === "manual" && /its data is wrong/.test(x.text)));
    assert.equal(effectNamed(s, DANCE_ID).length, 0);
    assert.equal(s.encounter.flags[`trig:${DANCE_ID}:hero`], undefined);
    assert.equal(s.encounter.budget.move, 30);
  });
});

test("a feature with the trigger and an `after:` action of its own: neither takes the other's once a turn", () => {
  using(ON, () => {
    let s = null;
    for (let seed = 1; seed < 60 && !s; seed++) {
      const g = field(forms(), { seed });
      fight(g); turnOf(g, "hero");
      const r = swing(g);
      if (r.ok && r.events.some((x) => x.type === "attack" && x.hit)) s = g;
    }
    assert.ok(s, "a weapon hit");
    const F = FORM("flourish");
    assert.equal(s.encounter.flags[`trig:${F}:hero`], true, "the trigger's mark");
    assert.equal(s.encounter.flags[`after:${F}:hero`], undefined, "the action's mark is not set by it");
    const r = ok(apply(s, { type: "feature", actor: "hero", feature: F, target: s.gob }, PAT));
    assert.ok(r.events.some((x) => x.type === "damage"), "the flourish was not refused 'already used'");
    assert.equal(s.encounter.flags[`after:${F}:hero`], true);
    assert.equal(s.encounter.flags[`trig:${F}:hero`], true, "and the trigger's mark is still its own");
    no(apply(s, { type: "feature", actor: "hero", feature: F, target: s.gob }, PAT), /already used/);
  });
});

test("the turn's mark is filtered from players as the other flags are: `trig:` names a creature", () => {
  using(ON, () => {
    const s = field(bard());
    s.entities.foe = makeEntity(derive(bard(5, { name: "Foe" })).record, { id: "foe", kind: "pc", side: "foe", pos: { q: 0, r: 3, z: 0 } });
    fight(s);
    s.entities.foe.hidden = true;
    s.encounter.flags[`trig:${DANCE_ID}:foe`] = true; s.encounter.flags[`trig:${DANCE_ID}:hero`] = true;
    const keys = Object.keys(view(s, PAT).encounter.flags);
    assert.ok(keys.includes(`trig:${DANCE_ID}:hero`), "its own party's are sent");
    assert.ok(!keys.includes(`trig:${DANCE_ID}:foe`), "a creature the party does not know of: not sent");
    assert.ok(Object.keys(view(s, DM).encounter.flags).includes(`trig:${DANCE_ID}:foe`));
  });
});

test("a free budget is held to the feet given, whatever other Speeds the holder has: Fly 60 and Climb 40 go no further than 15 feet", () => {
  for (const speeds of [{ fly: 60 }, { climb: 40 }, { fly: 60, climb: 40, swim: 30 }]) {
    using(ON, () => {
      const { s } = chase({ tweak: (t) => { t.entities.hero.speeds = speeds; } });
      assert.equal(flagOf(s), 15, json(speeds));
      const was = json(s);
      no(apply(s, { type: "move", actor: "hero", to: { q: 0, r: 4 } }, PAT), /Too far|reach|get there/, `${json(speeds)}: 20 feet`);
      assert.equal(json(s), was, "a refused move changes nothing");
      ok(apply(s, { type: "move", actor: "hero", to: { q: 0, r: 3 } }, PAT));
      assert.equal(flagOf(s), undefined, "15 feet spent");
    });
  }
});

test("the free budget carries the diagonals on squares ('alternate'): the second diagonal costs 10 across separate moves", () => {
  using(ON, () => {
    const s = newGame(14), map = squareRoom();
    ok(apply(s, { type: "loadMap", map }, DM));
    ok(apply(s, { type: "setting", key: "autoEngage", value: false }, DM));
    ok(apply(s, { type: "setting", key: "diagonals", value: "alternate" }, DM));
    for (const id of Object.keys(s.entities)) delete s.entities[id];
    s.entities.hero = makeEntity(derive(paladin()).record, { id: "hero", kind: "pc", side: "party", pos: { q: 6, r: 6, z: 0 } });
    s.entities.hero.sheet = structuredClone(paladin());
    ok(apply(s, { type: "claim", entity: "hero", user: "pat", userName: "Pat" }, PAT));
    const gob = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 11, r: 11 }, name: "Gob" }, DM)).events[0].id;
    ok(apply(s, { type: "startEncounter", center: { q: 7, r: 7 }, radius: 6 }, DM));
    turnOf(s, gob);
    s.encounter.flags["rmove:hero"] = 30;
    ok(apply(s, { type: "move", actor: "hero", to: { q: 7, r: 7 } }, PAT));
    assert.equal(s.encounter.flags["rmove:hero"], 25, "the first diagonal: 5 feet");
    assert.equal(s.encounter.flags["rdiag:hero"], true, "and the next one is a second");
    ok(apply(s, { type: "move", actor: "hero", to: { q: 8, r: 8 } }, PAT));
    assert.equal(s.encounter.flags["rmove:hero"], 15, "the second diagonal: 10 feet, as in one move");
    assert.equal(s.encounter.flags["rdiag:hero"], undefined);
    ok(apply(s, { type: "move", actor: "hero", to: { q: 9, r: 9 } }, PAT));
    assert.equal(s.encounter.flags["rmove:hero"], 10);
    // given up, both go
    ok(apply(s, { type: "forgoMove", actor: "hero" }, PAT));
    assert.equal(s.encounter.flags["rmove:hero"], undefined); assert.equal(s.encounter.flags["rdiag:hero"], undefined);
  });
});

test("forgoMove: the holder's controller gives the movement up; refused (and nothing changed) when there is none or it is not theirs", () => {
  using(ON, () => {
    const { s } = chase();
    assert.equal(flagOf(s), 15);
    const refuse = (a, ctx, re) => { const was = json(s); no(apply(s, a, ctx), re); assert.equal(json(s), was, "nothing changed"); };
    refuse({ type: "forgoMove", actor: "hero" }, { role: "player", userId: "lena" }, /isn't yours to control/);
    refuse({ type: "forgoMove", actor: s.gob }, DM, /Gob has no movement from an Opportunity Attack to give up/);
    refuse({ type: "forgoMove", actor: s.bo }, DM, /has no movement/);
    refuse({ type: "forgoMove" }, PAT, /./);
    refuse({ type: "forgoMove", actor: "nobody" }, PAT, /./);
    const r = ok(apply(s, { type: "forgoMove", actor: "hero" }, PAT));
    assert.equal(flagOf(s), undefined);
    assert.ok(r.events.some((x) => x.type === "note" && x.id === "hero" && /Sir Bell gives up the 15 ft of movement/.test(x.text)));
    assert.ok(json(viewEvents(r.events, s, PAT)).includes("gives up"), "the party is told of its own");
    refuse({ type: "forgoMove", actor: "hero" }, PAT, /has no movement from an Opportunity Attack to give up/);
    refuse({ type: "move", actor: "hero", to: { q: 1, r: 0 } }, PAT, /isn't Sir Bell's turn|moves on/);
    // the DM may give it up for the hero too
    const g = chase().s;
    ok(apply(g, { type: "forgoMove", actor: "hero" }, DM));
    assert.equal(flagOf(g), undefined);
    // some of it spent first: the rest goes
    const h = chase().s;
    ok(apply(h, { type: "move", actor: "hero", to: { q: 1, r: 0 } }, PAT));
    assert.equal(flagOf(h), 10);
    ok(apply(h, { type: "forgoMove", actor: "hero" }, PAT));
    assert.equal(flagOf(h), undefined);
  });
});

test("forgoMove outside a fight, and for a creature that is not a fighter, is refused and changes nothing", () => {
  using(ON, () => {
    const s = field(paladin());
    const was = json(s);
    no(apply(s, { type: "forgoMove", actor: "hero" }, PAT), /has no movement from an Opportunity Attack to give up/);
    assert.equal(json(s), was);
  });
});

test("forgoMove for a foe the party is not told of: the DM's alone, and the note is not sent to players", () => {
  using(ON, () => {
    let made = null;
    for (let seed = 1; seed < 120 && !made; seed++) {
      const s = field(bard(), { seed });
      s.settings.sight = "light"; s.map.levels[0].light = "dark";
      s.entities.foe = makeEntity(derive(paladin()).record, { id: "foe", kind: "pc", side: "foe", pos: { q: 0, r: 1, z: 0 } });
      s.entities.foe.senses = { darkvision: 120 };
      Object.assign(s.entities.hero, { ac: 1 });
      fight(s); turnOf(s, "hero");
      const r = ok(apply(s, { type: "move", actor: "hero", to: { q: -3, r: 0 } }, PAT));
      if (r.events.some((x) => x.type === "attack" && x.actor === "foe" && x.opportunity && x.hit)) made = { s };
    }
    assert.ok(made);
    const { s } = made;
    assert.equal(s.encounter.flags["rmove:foe"], 15);
    no(apply(s, { type: "forgoMove", actor: "foe" }, PAT), /No such creature|isn't yours to control/);
    const r = ok(apply(s, { type: "forgoMove", actor: "foe" }, DM));
    assert.equal(s.encounter.flags["rmove:foe"], undefined);
    const seen = view(s, PAT);
    if (seen.entities.foe === undefined) assert.ok(!json(viewEvents(r.events, s, PAT)).includes("gives up"), "not sent");
  });
});
