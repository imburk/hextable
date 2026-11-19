// Homebrew subclasses, addition C of docs/specs/homebrew-subclasses.md: proficiency for a time. A modifier op `proficient` on `check`, with a `scope` that names one skill or one
// tool, in a modifier step of a subclass feature's action; the Proficiency Bonus once, on a check the creature is not proficient in already; and `choice` on the action, a skill or
// a tool the holder names when it uses the feature (`choice: 'arcana'` on the `feature` action), which the steps that say `chosen` take.
// The subclass is invented for this test ("Domain of the Quiet Library", a pack "quiet-library"); no published subclass is used.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, checkBonus, current, makeEntity, passive } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { CONTENT } from "../src/content/index.js";
import { loadPack, overlayOf, using } from "../src/content/registry.js";
import { lintEntry, lintRecord, OPS } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { forPlayers } from "../src/content/packs.js";
import { newMap } from "../src/map.js";
import * as H from "../src/hex.js";
import { modifiers } from "../src/modifiers.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const KIM = { role: "player", userId: "kim" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "it was refused"); if (re) assert.match(r.error, re); return r; };
const json = (x) => JSON.stringify(x);

// ---------- the invented pack ----------
const P = "quiet-library", hb = (n) => `hb-${P}-${n}`, SRC = `homebrew:${P}`;
const doc = (lists) => ({ format: "hextable-pack", v: 1, pack: { id: P, name: "Quiet Library", version: 1, license: "CC0, by the author", attribution: "Written for a test." }, ...lists });
const feature = (id, level, grants, more = {}) => ({ id: hb(id), name: id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()), level, tier: "auto", checked: false, text: `The ${id}, in the pack's own words.`, ...(grants ? { grants } : {}), ...more });
const sub = (id, name, cls, features) => ({ id: hb(id), name, class: cls, source: SRC, checked: false, text: "Keepers of a hushed archive.", features });
const lend = (scope) => ({ modifier: { on: "check", op: "proficient", scope } });
const act = (steps, more = {}) => ({ action: { time: "action", target: { self: true }, duration: "10 minutes", effects: steps, ...more } });
const CD = { resource: "channel-divinity" };
// Read: a skill of the holder's choice, for 10 minutes, for Channel Divinity. Shelf: a tool of the holder's choice from two, a use of its own. Lore: History, fixed, no choice.
// Narrow: a skill from four. Margin: two modes that each lend the chosen skill. Hour: a fixed tool, for an hour.
const READ = act([lend({ skill: "chosen" })], { cost: CD, choice: { of: "skill" } });
const SHELF = act([lend({ tool: "chosen" })], { choice: { of: "tool", from: ["thieves-tools", "herbalism-kit"] } });
const LORE = act([lend({ skill: "history" })], { duration: "1 hour" });
const NARROW = act([lend({ skill: "chosen" })], { choice: { of: "skill", from: ["arcana", "history", "nature", "religion"] } });
const MARGIN = { action: { time: "action", target: { self: true }, duration: "10 minutes", choice: { of: "skill" }, modes: [{ id: "quick", name: "Quick", effects: [lend({ skill: "chosen" })] }, { id: "slow", name: "Slow", effects: [lend({ skill: "chosen" })] }] } };
const HOUR = act([lend({ tool: "thieves-tools" })], { duration: "1 hour" });
const LIBRARY = sub("domain-of-the-quiet-library", "Domain of the Quiet Library", "cleric", [
  feature("quiet-reading", 3, READ),
  feature("quiet-shelf", 3, SHELF, { uses: { max: 2, recharge: "long" } }),
  feature("quiet-lore", 3, LORE, { uses: { max: 1, recharge: "long" } }),
  feature("quiet-narrow", 3, NARROW, { uses: { max: 3, recharge: "long" } }),
  feature("quiet-margin", 3, MARGIN, { uses: { max: 3, recharge: "long" } }),
  feature("quiet-hour", 3, HOUR, { uses: { max: 1, recharge: "long" } }),
]);
const pack = (d) => { const r = loadPack(d); assert.ok(r.ok, (r.problems ?? []).join("; ")); return r.pack; };
const PACK = pack(doc({ subclasses: [LIBRARY] })), ON = overlayOf([PACK]), OFF = overlayOf([]);
const problems = (...subs) => (loadPack(doc({ subclasses: subs })).problems ?? []).join("\n");
const one = (grants, more = {}) => problems(sub("domain-x", "Domain of X", "cleric", [feature("x-feature", 3, grants, more)]));

// ---------- the table ----------
const A = { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 };
const cleric = (over = {}) => ({ name: "Ilse", class: "cleric", level: 5, subclass: hb("domain-of-the-quiet-library"), abilities: A, skills: ["religion", "history"], choices: { "divine-order": "protector" },
  armour: "chain-mail", shield: true, weapons: ["mace"], spells: ["guidance", "sacred-flame", "spare-the-dying", "thaumaturgy", "bless", "cure-wounds", "healing-word", "command", "aid"], gear: ["Thieves' Tools"], ...over });
const ID = (n) => hb(n);
const feat = (r, id) => r.feats.find((f) => f.id === id);
const use = (s, f, more = {}, ctx = PAT) => apply(s, { type: "feature", actor: "hero", feature: ID(f), ...more }, ctx);
const check = (s, skill, ctx = PAT) => ok(apply(s, { type: "check", actor: "hero", skill }, ctx)).events.find((x) => x.type === "check");

// The hero alone in a field. Prof +5 at level 5 is +3; Intelligence 12 is +1, so Arcana is +1 and +4 with proficiency; History is proficient, +4, and +7 with Expertise.
function field(sheet = cleric()) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  s.entities.hero.sheet = structuredClone(sheet);
  ok(apply(s, { type: "claim", entity: "hero", user: "pat", userName: "Pat" }, PAT));
  return s;
}
// A locked door and the hero beside it, who carries Thieves' Tools but is not proficient with them (as in rule-fixes.test.js).
function hall() {
  const s = field();
  const tiles = Object.fromEntries(H.range({ q: 0, r: 0 }, 5).map((h) => [H.col(h), { t: "stone" }]));
  ok(apply(s, { type: "loadMap", map: newMap({ id: "hall", name: "Hall", starts: [{ q: -2, r: 0 }], levels: [{ id: "ground", name: "Ground", z: 0, tiles }],
    walls: [{ id: "north", level: "ground", a: [1.25, -100], b: [1.25, -1.5], kind: "wall" }, { id: "south", level: "ground", a: [1.25, 1.5], b: [1.25, 100], kind: "wall" }],
    objects: [{ id: "door", def: "door-wooden", level: "ground", at: { q: 0, r: 0 }, seg: { a: [1.25, -1.5], b: [1.25, 1.5] }, state: "locked" }] }) }, DM));
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  ok(apply(s, { type: "place", actor: "hero", to: { q: 0, r: 0 } }, DM));
  return s;
}
const relock = (s) => { s.map.objects.find((o) => o.id === "door").state = "locked"; };
const pick = (s) => ok(apply(s, { type: "use", actor: "hero", object: "door", verb: "pick" }, PAT)).events[0];
const lentOf = (s, skill, tool) => modifiers(s, s.entities.hero, "check", { target: s.entities.hero, skill, ...(tool ? { tool } : {}), ability: "dex" }, "").lent;
const effectsOf = (s) => (s.effects ?? []).filter((x) => x.feature);

// ---------- the vocabulary, the gate and the reading ----------
test("the op is in the vocabulary, the pack loads in strict mode, its entry lints, and it is read in words", () => {
  assert.ok(OPS.includes("proficient"));
  assert.deepEqual(lintEntry("subclasses", LIBRARY, { pack: P, srd: CONTENT }), []);
  const read = readEntry("subclasses", LIBRARY, { spells: [] });
  assert.deepEqual(read.problems, []);
  const lines = read.lines.join("\n");
  assert.match(lines, /gets proficiency in the chosen skill\./);
  assert.match(lines, /gets proficiency with the chosen tool\./);
  assert.match(lines, /gets proficiency in the history skill\./);
  assert.match(lines, /gets proficiency with the tool thieves tools\./);
  assert.match(lines, /a check with that skill or tool adds the Proficiency Bonus, once, if the creature is not proficient in it already \(Expertise included, which is not doubled again\)/);
  assert.match(lines, /it names a skill, in `choice` on the action; each step below that says "chosen" uses it\. A name that is not a skill is refused and nothing is spent\. If none is sent, the use is spent and the DM applies the rest\./);
  assert.match(lines, /it names a tool \(thieves tools or herbalism kit\), in `choice` on the action/);
  assert.match(lines, /it names a skill \(arcana, history, nature or religion\)/);
  assert.match(lines, /spends 1 use of the holder's feature "channel-divinity"/);
});

test("the gate says why for each refusal", () => {
  const a = (steps, more = {}) => one(act(steps, more));
  assert.equal(a([lend({ skill: "arcana" })]), "");
  assert.equal(a([lend({ tool: "thieves-tools" })]), "");
  assert.equal(a([lend({ skill: "chosen" })], { choice: { of: "skill" } }), "");
  assert.equal(a([lend({ tool: "chosen" })], { choice: { of: "tool", from: ["thieves-tools", "herbalism-kit"] } }), "");
  // the modifier
  assert.match(a([{ modifier: { on: "save", op: "proficient", scope: { skill: "arcana" } } }]), /`proficient` is on check/);
  assert.match(a([{ modifier: { on: "check", op: "proficient" } }]), /`proficient` needs a `scope` that names one skill or one tool \(and nothing else\)/);
  assert.match(a([{ modifier: { on: "check", op: "proficient", scope: {} } }]), /`scope` gives a skill, an ability, a tool or a condition|needs a `scope` that names one skill or one tool/);
  assert.match(a([lend({ ability: "int" })]), /`proficient` needs a `scope` that names one skill or one tool/);
  assert.match(a([lend({ skill: "arcana", tool: "thieves-tools" })]), /`proficient` needs a `scope` that names one skill or one tool/);
  assert.match(a([lend({ skill: "arcana", ability: "int" })]), /`proficient` needs a `scope` that names one skill or one tool/);
  assert.match(a([lend({ skill: "lore" })]), /unknown skill "lore" in scope/);
  assert.match(a([lend({ tool: "Thieves Tools" })]), /`scope.tool` is a tool id in kebab-case/);
  assert.match(a([lend({ tool: 7 })]), /`scope.tool` is a tool id in kebab-case|must be text/);
  for (const [k, v] of [["value", 2], ["when", ["within5"]], ["uses", 1], ["types", ["fire"]], ["once", "turn"], ["stack", false], ["against", "target"], ["onFail", true], ["except", "source"], ["spell", "bless"]]) {
    assert.match(a([{ modifier: { on: "check", op: "proficient", scope: { skill: "arcana" }, [k]: v } }]), new RegExp(`\`proficient\` has no \`${k}\``), k);
  }
  // it is a thing that lasts
  assert.match(one({ action: { time: "action", target: { self: true }, effects: [lend({ skill: "arcana" })] } }), /lends proficiency for a time, so it needs a duration that is not `instant`/);
  assert.match(a([lend({ skill: "arcana" })], { duration: "instant" }), /needs a duration that is not `instant`/);
  // a tool scope is for checks
  assert.match(a([{ modifier: { on: "save", op: "add", value: 1, scope: { tool: "thieves-tools" } } }]), /`scope.tool` is for checks/);
  assert.equal(a([{ modifier: { on: "check", op: "add", value: 1, scope: { tool: "thieves-tools" } } }]), "", "a plain add scoped to a tool is allowed: nothing new");
});

test("where it may not be: a feat, an item, a spell, a monster, an always-on grant, an aura", () => {
  const SENT = /the op `proficient` is for a modifier step of a subclass feature's action/;
  const step = lend({ skill: "arcana" });
  const grants = { action: { time: "action", target: { self: true }, duration: "10 minutes", effects: [step] } };
  const f = { id: hb("a-feat"), name: "A Feat", category: "general", tier: "assist", source: SRC, checked: false, text: "t", grants };
  assert.match((loadPack(doc({ feats: [f] })).problems ?? []).join("\n"), SENT);
  const item = { id: hb("a-ring"), name: "A Ring", category: "wondrous", rarity: "rare", wear: "carried", tier: "assist", source: SRC, checked: false, text: "t", grants };
  assert.match((loadPack(doc({ items: [item] })).problems ?? []).join("\n"), SENT);
  assert.match(one({ modifiers: [step.modifier] }), SENT, "an always-on grant");
  assert.match(one({ aura: { range: 10, modifiers: [step.modifier] } }), SENT, "an aura");
  const spell = { id: hb("a-spell"), name: "A Spell", source: SRC, level: 1, school: "divination", classes: ["cleric"], time: "action", range: "self", components: ["v"], duration: "1 hour", concentration: false, target: { self: true }, effects: [step], tier: "auto", checked: false, text: "t" };
  assert.match((loadPack(doc({ spells: [spell] })).problems ?? []).join("\n"), SENT);
  // the strict monster linter refuses it too: a monster's trait or action is not a subclass feature's action
  const mon = { id: hb("a-monster"), name: "A Monster", source: SRC, size: "medium", type: "humanoid", cr: 1, xp: 200, pb: 2, ac: 12, hp: 20, speed: { walk: 30 }, senses: {}, abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    traits: [{ id: "t", name: "T", text: "t", modifiers: [step.modifier] }], actions: [], tier: "auto", checked: false, text: "t" };
  assert.match((loadPack(doc({ monsters: [mon] })).problems ?? []).join("\n"), SENT);
  // a feat or an item cannot ask for a choice either
  const choosing = { action: { ...grants.action, effects: [lend({ skill: "chosen" })], choice: { of: "skill" } } };
  assert.match((loadPack(doc({ feats: [{ ...f, grants: choosing }] })).problems ?? []).join("\n"), /a feat or an item cannot ask its holder to choose a skill or tool when it is used: only a feature of a subclass can/);
  // an option of a subclass's feature may have one
  const opt = (id) => ({ id: hb(id), name: id, text: "An option.", tier: "auto", grants: READ.action ? { action: READ.action } : READ });
  assert.equal(problems(sub("domain-y", "Domain of Y", "cleric", [feature("y-pick", 3, undefined, { tier: "assist", options: [opt("y-one"), opt("y-two")] })])), "");
});

test("the gate says why for each refusal of a choice", () => {
  const c = (choice, steps = [lend({ skill: "chosen" })], more = {}) => one(act(steps, { choice, ...more }));
  assert.equal(c({ of: "skill" }), "");
  assert.equal(c({ of: "skill", from: ["arcana", "history"] }), "");
  assert.match(c({ of: "ability" }), /an action's `choice` is { of: "skill" or "tool", from\? }/);
  assert.match(c("skill"), /an action's `choice` is { of: "skill" or "tool", from\? }/);
  assert.match(c({ of: "skill", n: 2 }), /an action's `choice` is { of: "skill" or "tool", from\? }|"n" is not something a choice has/);
  assert.match(c({ of: "skill", from: ["arcana"] }), /`choice.from` lists two or more different skills/);
  assert.match(c({ of: "skill", from: ["arcana", "arcana"] }), /`choice.from` lists two or more different skills/);
  assert.match(c({ of: "skill", from: ["arcana", "lore"] }), /`choice.from` lists two or more different skills/);
  assert.match(c({ of: "tool", from: ["thieves-tools", "Herbalism Kit"] }, [lend({ tool: "chosen" })]), /`choice.from` lists two or more different tool ids in kebab-case, such as thieves-tools/);
  assert.match(c({ of: "tool" }), /a step uses the chosen skill, but the action's choice is of a tool/);
  assert.match(c({ of: "skill" }, [lend({ tool: "chosen" })]), /a step uses the chosen tool, but the action's choice is of a skill/);
  assert.match(c({ of: "skill" }, [lend({ skill: "arcana" })]), /`choice` of a skill that no step uses/);
  assert.match(c({ of: "tool" }, [lend({ skill: "arcana" })]), /`choice` of a tool that no step uses/);
  assert.match(one(act([lend({ skill: "chosen" })])), /a step uses the chosen skill, but the action has no `choice: { of: "skill" }`/);
  assert.match(one(act([lend({ tool: "chosen" })])), /a step uses the chosen tool, but the action has no `choice: { of: "tool" }`/);
  assert.match(c({ of: "skill" }, undefined, { time: "reaction" }), /an action with a `choice` needs plain `effects` or `modes`/);
  assert.match(c({ of: "skill" }, undefined, { pool: true }), /an action with a `choice` needs plain `effects` or `modes`|pool/);
  // the strict shape: a key a choice does not have
  assert.match(one(act([lend({ skill: "chosen" })], { choice: { of: "skill", all: true } })), /./);
});

// ---------- derive and what players are sent ----------
test("derive: the record's action carries the choice and the modifier as data; the class and an SRD-only sheet are not changed", () => {
  const before = json(CONTENT.classes.cleric);
  using(ON, () => {
    assert.deepEqual(validate(cleric()), []);
    const r = derive(cleric()).record;
    assert.deepEqual(feat(r, ID("quiet-reading")).action.choice, { of: "skill" });
    assert.deepEqual(feat(r, ID("quiet-reading")).action.effects, [lend({ skill: "chosen" })]);
    assert.deepEqual(feat(r, ID("quiet-shelf")).action.choice, { of: "tool", from: ["thieves-tools", "herbalism-kit"] });
    assert.deepEqual(feat(r, ID("quiet-lore")).action.effects, [lend({ skill: "history" })]);
    assert.deepEqual(lintRecord(r, { spells: CONTENT.spells }), []);
  });
  assert.equal(json(CONTENT.classes.cleric), before);
  const plain = derive({ ...cleric(), subclass: "life" }).record;
  using(ON, () => assert.equal(json(derive({ ...cleric(), subclass: "life" }).record), json(plain)));
  for (const c of Object.values(CONTENT.classes)) for (const f of [...c.features, ...(c.subclass?.features ?? [])]) assert.equal(f.grants?.action?.choice, undefined, `${c.id}/${f.id}`);
});

test("what players are sent: the pack's copy carries the choice and the modifier as data, and the view and the events are the kinds a use always makes", () => {
  const withNotes = { ...LIBRARY, dmNotes: "The DM's own note." };
  const copy = forPlayers(doc({ subclasses: [withNotes] })).data.subclasses[0];
  assert.equal(copy.dmNotes, undefined);
  assert.deepEqual(copy.features[0].grants.action.choice, { of: "skill" });
  assert.deepEqual(copy.features[0].grants.action.effects, [lend({ skill: "chosen" })]);
  using(ON, () => {
    const keys = (s) => Object.keys(view(s, PAT).entities.hero).sort();
    const srd = field({ ...cleric(), subclass: "life" });
    const s = field();
    assert.deepEqual(keys(s), keys(srd), "a hero with the pack's subclass is sent the same fields of a creature as one of an SRD subclass");
    const used = ok(use(s, "quiet-reading", { choice: "arcana" }));
    assert.deepEqual(used.events.map((x) => x.type), ["effectStart", "std"], "the kinds any feature that lasts makes: no new event type");
    assert.deepEqual(viewEvents(used.events, s, PAT).map((x) => x.type), ["effectStart", "std"]);
    assert.deepEqual(keys(s), keys(srd));
    // the effect a player is sent is an effect as any other: its name and its parts, the modifier with the skill filled in
    const fx = view(s, PAT).effects.find((x) => x.name === "Quiet reading");
    assert.ok(fx);
    assert.deepEqual(fx.parts.map((p) => p.modifier), [{ on: "check", op: "proficient", scope: { skill: "arcana" } }]);
    // the check event a player gets is the kind a check always is
    assert.deepEqual(Object.keys(viewEvents([check(s, "arcana")], s, PAT)[0]).sort(), Object.keys(check(s, "history")).sort());
  });
});

// ---------- the proficiency played ----------
test("a chosen skill: the Proficiency Bonus on that skill alone, for as long as it lasts, and the sheet is not changed", () => {
  using(ON, () => {
    const s = field();
    const sheet = json(s.entities.hero.sheet), skills = json(s.entities.hero.skills);
    assert.equal(check(s, "arcana").bonus, 1, "Intelligence 12, not proficient");
    assert.equal(check(s, "nature").bonus, 1);
    const used = ok(use(s, "quiet-reading", { choice: "arcana" }));
    assert.equal(s.entities.hero.uses["channel-divinity"], 1, "a use of Channel Divinity (2 at level 5, one spent) is the price");
    assert.equal(used.events.find((x) => x.type === "effectStart").lasts, "10 minutes");
    assert.equal(check(s, "arcana").bonus, 4, "+1 and the Proficiency Bonus (+3)");
    assert.equal(check(s, "nature").bonus, 1, "another skill is as it was");
    assert.equal(check(s, "religion").bonus, 4, "a skill it already has is as it was");
    assert.equal(json(s.entities.hero.sheet), sheet);
    assert.equal(json(s.entities.hero.skills), skills, "the creature's skills are not changed: it is a lasting effect");
    assert.equal(passive(s, s.entities.hero, "arcana"), 10 + 4);
    // ten minutes later, gone
    ok(apply(s, { type: "advanceTime", minutes: 9 }, DM));
    assert.equal(check(s, "arcana").bonus, 4, "nine minutes: still there");
    ok(apply(s, { type: "advanceTime", minutes: 1.5 }, DM));
    assert.equal(check(s, "arcana").bonus, 1, "past ten: gone");
    assert.equal(effectsOf(s).length, 0);
  });
});

test("no double counting: a skill it has is not added again, Expertise is not doubled, a second effect adds nothing, and a monster's listed bonus stands", () => {
  using(ON, () => {
    const s = field();
    const e = s.entities.hero;
    e.expertise = ["history"];
    assert.equal(check(s, "history").bonus, 1 + 6, "Expertise: twice the bonus");
    ok(use(s, "quiet-lore"));
    assert.equal(check(s, "history").bonus, 7, "the fixed History lent changes nothing: proficient already, with Expertise");
    ok(use(s, "quiet-reading", { choice: "history" }));
    assert.equal(check(s, "history").bonus, 7, "two lenders, one skill it has");
    assert.equal(lentOf(s, "history").length, 2, "both are found, and the bonus is still added once");
    // a skill it does not have, lent twice: once
    ok(use(s, "quiet-narrow", { choice: "arcana" }));
    ok(use(s, "quiet-margin", { mode: "quick", choice: "arcana" }));
    assert.equal(lentOf(s, "arcana").length, 2);
    assert.equal(check(s, "arcana").bonus, 1 + 3, "once, not twice");
    // a creature with a listed bonus (a monster) keeps it
    assert.equal(checkBonus({ abil: { dex: 10 }, prof: 3, skillBonus: { stealth: 7 }, skills: [] }, { skill: "stealth" }, [{ skill: "stealth" }]), 7);
    // a skill in `expertise` that the creature is not proficient in (data that is not right) is not doubled by a lent one
    assert.equal(checkBonus({ abil: { int: 12 }, prof: 3, skills: [], expertise: ["arcana"] }, { skill: "arcana" }, [{ skill: "arcana" }]), 1 + 3);
    assert.equal(checkBonus({ abil: { int: 12 }, prof: 3, skills: ["arcana"], expertise: ["arcana"] }, { skill: "arcana" }, [{ skill: "arcana" }]), 1 + 6);
    assert.equal(checkBonus({ abil: { int: 12 }, prof: 3, skills: [] }, { skill: "arcana" }), 1, "no lent list: as it was");
  });
});

test("a choice from a short list, and a choice made through modes", () => {
  using(ON, () => {
    const s = field();
    no(use(s, "quiet-narrow", { choice: "stealth" }), /Quiet narrow lends proficiency with one of arcana, history, nature, religion; stealth is not one\./);
    assert.equal(effectsOf(s).length, 0);
    ok(use(s, "quiet-narrow", { choice: "nature" }));
    assert.equal(check(s, "nature").bonus, 1 + 3);
    ok(use(s, "quiet-margin", { mode: "slow", choice: "arcana" }));
    assert.equal(check(s, "arcana").bonus, 1 + 3, "a mode's steps take the choice too");
    assert.equal(check(s, "stealth").bonus, 2);
  });
});

test("a fixed skill needs no choice, and one sent is refused", () => {
  using(ON, () => {
    const s = field();
    no(use(s, "quiet-lore", { choice: "history" }), /Quiet lore makes no choice of a skill or a tool\./);
    assert.equal(s.entities.hero.uses[ID("quiet-lore")], 1, "nothing was spent");
    ok(use(s, "quiet-lore"));
    assert.equal(s.entities.hero.uses[ID("quiet-lore")], 0);
    s.entities.hero.skills = s.entities.hero.skills.filter((k) => k !== "history");
    assert.equal(check(s, "history").bonus, 1 + 3, "History lent");
  });
});

test("a tool: the Proficiency Bonus on a check made with it, and Advantage when the skill is one it has too", () => {
  using(ON, () => {
    const s = hall();
    const e = s.entities.hero;
    assert.deepEqual(e.tools ?? [], [], "carries Thieves' Tools, is not proficient with them");
    const before = pick(s);
    assert.equal(before.bonus, 2, "Dexterity 14, nothing more");
    assert.equal(before.mode, undefined);
    relock(s);
    ok(use(s, "quiet-shelf", { choice: "thieves-tools" }));
    assert.equal(e.uses[ID("quiet-shelf")], 1);
    relock(s);
    const lent = pick(s);
    assert.equal(lent.bonus, 2 + 3, "the Proficiency Bonus for the tool");
    assert.equal(lent.mode, undefined, "no Advantage: the skill (Sleight of Hand) is not one it has");
    // with the skill as well: Advantage, as a tool and a skill it has give
    e.skills = [...e.skills, "sleight-of-hand"];
    relock(s);
    const both = pick(s);
    assert.equal(both.mode, "adv");
    assert.deepEqual(both.why, ["tool and skill"]);
    assert.equal(both.bonus, 2 + 3, "the skill's bonus, once: a tool and a skill do not add twice");
  });
});

test("a tool scope matches a check made with that tool only, and a skill scope matches a check of that skill only", () => {
  using(ON, () => {
    const s = hall();
    ok(use(s, "quiet-hour"));
    assert.equal(lentOf(s, "sleight-of-hand", "thieves-tools").length, 1);
    assert.equal(lentOf(s, undefined, "thieves-tools").length, 1);
    assert.equal(lentOf(s, "sleight-of-hand").length, 0, "no tool in the check");
    assert.equal(lentOf(s, undefined, "herbalism-kit").length, 0, "another tool");
    assert.equal(lentOf(s, "arcana").length, 0);
    assert.equal(check(s, "sleight-of-hand").bonus, 2, "a skill check with no tool: nothing");
    relock(s);
    assert.equal(pick(s).bonus, 5);
  });
});

test("Reliable Talent counts a lent proficiency: the tag `check.proficient` is true for it, whichever modifier comes first", () => {
  using(ON, () => {
    const s = field();
    const e = s.entities.hero;
    e.feats.push({ id: "steady", name: "Steady hand", modifiers: [{ on: "check", op: "floor", value: 10, when: ["check.proficient"] }] });
    const roll = (skill) => { const seen = []; for (let seed = 1; seed < 400; seed++) { const c = structuredClone(s); c.rng = seed; seen.push(ok(apply(c, { type: "check", actor: "hero", skill }, PAT)).events[0].roll); } return Math.min(...seen); };
    assert.ok(roll("arcana") < 10, "not proficient: the d20 stands");
    ok(use(s, "quiet-reading", { choice: "arcana" }));
    assert.ok(roll("arcana") >= 10, "proficient for a time: no d20 under 10");
    assert.ok(roll("nature") < 10);
    // the other order: the floor listed first
    e.feats.reverse();
    assert.ok(roll("arcana") >= 10);
  });
});

test("the lasting effect belongs to the holder: it ends with the DM or the holder, and another player cannot end it", () => {
  using(ON, () => {
    const s = field();
    ok(use(s, "quiet-reading", { choice: "arcana" }));
    const fx = effectsOf(s)[0];
    no(apply(s, { type: "endEffect", effect: fx.id }, KIM), /isn't yours to end/);
    assert.equal(check(s, "arcana").bonus, 4);
    ok(apply(s, { type: "endEffect", effect: fx.id }, PAT));
    assert.equal(check(s, "arcana").bonus, 1);
  });
});

test("a fight: the action and the use are paid, and the proficiency counts in a fight", () => {
  using(ON, () => {
    const s = field();
    ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 6, r: 0 }, name: "Gob" }, DM));
    ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }, DM));
    for (let i = 0; i < 40 && current(s) !== "hero"; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
    const budget = s.encounter.budget.action;
    ok(use(s, "quiet-reading", { choice: "arcana" }));
    assert.equal(s.encounter.budget.action, budget - 1, "an action");
    assert.equal(check(s, "arcana").bonus, 4);
  });
});

// ---------- refusals ----------
test("a refused use changes nothing: no use, no action, no effect, no event, whatever the reason", () => {
  using(ON, () => {
    const s = field();
    let snap = json(s);
    const refused = (r, re) => { no(r, re); assert.equal(json(s), snap, "the state is exactly as it was"); };
    // the choice
    for (const bad of [7, true, null, ["arcana"], { skill: "arcana" }, "", "Arcana", "lore", "animal handling"]) refused(use(s, "quiet-reading", { choice: bad }), /asks for a skill: name a skill, such as arcana\./);
    refused(use(s, "quiet-shelf", { choice: "arcana" }), /lends proficiency with one of thieves-tools, herbalism-kit; arcana is not one\./);
    for (const bad of [7, "Thieves Tools", "", "x".repeat(41), ["thieves-tools"]]) refused(use(s, "quiet-shelf", { choice: bad }), /asks for a tool: name a tool by its id, such as thieves-tools\./);
    refused(use(s, "quiet-narrow", { choice: "stealth" }), /one of arcana, history, nature, religion/);
    refused(use(s, "quiet-lore", { choice: "history" }), /makes no choice of a skill or a tool/);
    // not the holder's to use
    refused(use(s, "quiet-reading", { choice: "arcana" }, KIM), /./);
    // no Channel Divinity, no uses
    s.entities.hero.uses["channel-divinity"] = 0; snap = json(s);
    refused(use(s, "quiet-reading", { choice: "arcana" }), /no uses of Channel Divinity left/);
    s.entities.hero.uses["channel-divinity"] = 2; s.entities.hero.uses[ID("quiet-lore")] = 0; snap = json(s);
    refused(use(s, "quiet-lore"), /no uses of Quiet lore left/);
    // down
    s.entities.hero.hp = 0; snap = json(s);
    refused(use(s, "quiet-reading", { choice: "arcana" }), /./);
    s.entities.hero.hp = 20;
    // a record whose data skipped the gate: a choice of something else, a form, a step that takes a chosen skill with no choice made
    const e = s.entities.hero, original = structuredClone(feat(e, ID("quiet-reading")).action);
    for (const bad of [{ of: "ability" }, { of: "skill", from: ["arcana"] }, "skill", null]) { feat(e, ID("quiet-reading")).action = { ...original, choice: bad }; snap = json(s); refused(use(s, "quiet-reading", { choice: "arcana" }), /cannot be used: its data for the choice made when it is used is wrong/); }
    feat(e, ID("quiet-reading")).action = { ...original, form: { types: ["beast"], maxCr: 1, fly: 0, hours: 1 } }; snap = json(s);
    refused(use(s, "quiet-reading", { choice: "arcana" }), /./);
    const { choice, ...bare } = original;
    feat(e, ID("quiet-reading")).action = bare; snap = json(s);
    refused(use(s, "quiet-reading"), /a step takes a chosen skill or tool, but its action makes no choice\. The DM can apply it\./);
    // none of it cost anything, and the same action is still fine
    feat(e, ID("quiet-reading")).action = original;
    ok(use(s, "quiet-reading", { choice: "arcana" }));
  });
});

test("no choice sent: as with no mode, the use is spent and the DM is handed the rest; no proficiency is lent", () => {
  using(ON, () => {
    const s = field();
    const used = ok(use(s, "quiet-reading"));
    assert.equal(s.entities.hero.uses["channel-divinity"], 1, "the price is paid");
    const manual = used.events.find((x) => x.type === "manual");
    assert.ok(manual, "the DM is told");
    assert.match(manual.text, /No choice was sent, so the DM applies it\./);
    assert.equal(check(s, "arcana").bonus, 1, "nothing was lent");
    // the players are not sent a manual event meant for the DM's table? they are the holder's own: as every feature with a mode and no mode named
    assert.equal(used.events.some((x) => x.type === "effectStart" && x.name === "Quiet reading"), true);
  });
});

test("a record that skipped the gate with a chosen scope that was never filled in lends nothing", () => {
  using(ON, () => {
    const s = field();
    s.effects = s.effects ?? [];
    s.effects.push({ id: "fx-x", name: "Odd", source: "hero", feature: "odd", parts: [{ target: "hero", modifier: { on: "check", op: "proficient", scope: { skill: "chosen" } } }] });
    s.effects.push({ id: "fx-y", name: "Odd two", source: "hero", feature: "odd", parts: [{ target: "hero", modifier: { on: "check", op: "proficient", scope: { skill: "arcana", tool: "thieves-tools" } } }] });
    s.effects.push({ id: "fx-z", name: "Odd three", source: "hero", feature: "odd", parts: [{ target: "hero", modifier: { on: "check", op: "proficient" } }] });
    s.effects.push({ id: "fx-w", name: "Odd four", source: "hero", feature: "odd", parts: [{ target: "hero", modifier: { on: "save", op: "proficient", scope: { skill: "arcana" } } }] });
    assert.deepEqual(lentOf(s, "arcana"), []);
    assert.equal(check(s, "arcana").bonus, 1);
  });
});

// ---------- the table as it was ----------
test("an SRD-only game is as it was: the same state, the same checks, the same view", () => {
  const sheet = { ...cleric(), subclass: "life" };
  const run = () => { const s = field(sheet); return [s, check(s, "arcana"), check(s, "religion")]; };
  const a = run();
  using(ON, () => { const b = run(); assert.equal(json(b), json(a)); });
  assert.equal(a[1].bonus, 1);
  assert.equal(a[2].bonus, 4);
});

test("replay: the same actions from the same seed give the same state and the same events", () => {
  const run = () => {
    const out = [];
    using(ON, () => {
      const s = field();
      out.push(...ok(use(s, "quiet-reading", { choice: "arcana" })).events);
      out.push(check(s, "arcana"));
      out.push(...ok(use(s, "quiet-margin", { mode: "quick", choice: "nature" })).events);
      out.push(check(s, "nature"));
      out.push(s);
    });
    return out;
  };
  const a = run(), b = run();
  assert.deepEqual(a, b);
  assert.equal(a.filter((x) => x.type === "check").length, 2);
});

test("the overlay away: the feature is not there to use, and the checks are the creature's own", () => {
  const s = newGame(5, { party: [{ sheet: { ...cleric({ level: 4 }), subclass: "life" } }] });
  let hero;
  using(ON, () => { hero = ok(apply(s, { type: "setSheet", sheet: cleric() }, DM)).events.find((x) => x.type === "spawned").id; });
  assert.ok(feat(s.entities[hero], ID("quiet-reading")).action.choice);
  ok(apply(s, { type: "refresh", actor: hero }, DM));
  assert.equal(feat(s.entities[hero], ID("quiet-reading")), undefined);
  using(OFF, () => no(apply(s, { type: "feature", actor: hero, feature: ID("quiet-reading"), choice: "arcana" }, DM), /no such feature/));
});
