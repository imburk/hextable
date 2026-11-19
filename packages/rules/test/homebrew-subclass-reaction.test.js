// Homebrew subclasses, addition I of docs/specs/homebrew-subclasses.md: `grants.reaction: { on: 'attacks', of, attack: 'melee' }`, a Reaction when a creature under one of the holder's effects
// (the lasting effect of the feature `of`) makes an attack: one melee weapon attack against it first. The oath is invented for this test (the "Oath of the Quiet Ember", a pack
// "quiet-ember-folk"); no published subclass is used.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { CONTENT } from "../src/content/index.js";
import { loadPack, overlayOf, using } from "../src/content/registry.js";
import { lintEntry, lintRecord } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { forPlayers } from "../src/content/packs.js";
import { effectsOf } from "../src/durations.js";
import { reactionsOf, underEffect } from "../src/reactions.js";
import { view, viewEvents } from "../src/view.js";
import { seesFor, sensesFor } from "../src/engine/resolve.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "it was refused"); if (re) assert.match(r.error, re); return r; };
const json = (x) => JSON.stringify(x);

// ---------- the invented pack ----------
const P = "quiet-ember-folk", hb = (n) => `hb-${P}-${n}`, SRC = `homebrew:${P}`;
const doc = (lists) => ({ format: "hextable-pack", v: 1, pack: { id: P, name: "Quiet Ember Folk", version: 1, license: "CC0, by the author", attribution: "Written for a test." }, ...lists });
const feature = (id, level, grants, more = {}) => ({ id: hb(id), name: id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()), level, tier: "auto", checked: false, text: `The ${id}, in the pack's own words.`, ...(grants ? { grants } : {}), ...more });
const sub = (id, name, cls, features) => ({ id: hb(id), name, class: cls, source: SRC, checked: false, text: `Sworn to the ${id}.`, features });
// The vow: a Bonus Action that spends Channel Divinity and gives the holder Advantage against one creature for a minute (the spec's Kindle shape).
const VOW = { action: { time: "bonus", cost: { resource: "channel-divinity" }, duration: "1 minute", target: { creature: { range: [30, 30] } }, effects: [{ modifier: { on: "attack.roll", op: "advantage", against: "target" }, to: "caster" }] } };
const REPRISAL = { reaction: { on: "attacks", of: hb("quiet-vow"), attack: "melee" } };
const EMBER = sub("oath-of-the-quiet-ember", "Oath of the Quiet Ember", "paladin", [feature("quiet-vow", 3, VOW), feature("quiet-reprisal", 3, REPRISAL)]);
const pack = (d) => { const r = loadPack(d); assert.ok(r.ok, (r.problems ?? []).join("; ")); return r.pack; };
const PACK = pack(doc({ subclasses: [EMBER] })), ON = overlayOf([PACK]), OFF = overlayOf([]);
const problems = (...subs) => (loadPack(doc({ subclasses: subs })).problems ?? []).join("\n");
const palOne = (...features) => problems(sub("oath-x", "Oath of X", "paladin", features));
const withReaction = (r) => palOne(feature("quiet-vow", 3, VOW), feature("quiet-reprisal", 3, { reaction: r }));

// ---------- the table ----------
const A = { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 16 };
const paladin = (level = 5, over = {}) => ({ name: "Sir Ember", class: "paladin", level, subclass: hb("oath-of-the-quiet-ember"), abilities: A, skills: ["athletics", "religion"], choices: { "fighting-style": "defense" },
  armour: "chain-mail", shield: true, weapons: ["longsword"], spells: ["bless", "cure-wounds"], ...over });
const feat = (r, id) => r.feats.find((f) => f.id === id);
const VOW_ID = hb("quiet-vow"), REPRISAL_ID = hb("quiet-reprisal");

// The hero in a field of grass with Gob beside it (1,0), Bo (2,0) and Cy (4,0); each of 300 Hit Points and Armor Class 1. The hero's own Armor Class is high so that a foe's attack is no matter.
function field(sheet = paladin(), { seed = 7 } = {}) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  s.entities.hero.sheet = structuredClone(sheet);
  Object.assign(s.entities.hero, { hp: 300, maxHp: 300 });
  ok(apply(s, { type: "claim", entity: "hero", user: "pat", userName: "Pat" }, PAT));
  for (const [key, at, name] of [["gob", { q: 1, r: 0 }, "Gob"], ["bo", { q: 2, r: 0 }, "Bo"], ["cy", { q: 4, r: 0 }, "Cy"]]) {
    s[key] = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at, name }, DM)).events[0].id;
    Object.assign(s.entities[s[key]], { hp: 300, maxHp: 300, ac: 1 });
  }
  return s;
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 6 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 60 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const vow = (s, target) => apply(s, { type: "feature", actor: "hero", feature: VOW_ID, target }, PAT);
// The hero marks `target` on its own turn, then the turn passes to the attacker's. Returns nothing: the state is the table.
function marked(s, target = s.gob, attacker = target) {
  fight(s); turnOf(s, "hero");
  ok(vow(s, target));
  turnOf(s, attacker);
}
const stab = (s, who = s.gob, at = "hero", ctx = DM) => apply(s, { type: "attack", actor: who, attack: "scimitar", target: at }, ctx);
const reactions = (r) => r.events.filter((x) => x.type === "reaction" && x.reaction === REPRISAL_ID);
const attacks = (r, actor) => r.events.filter((x) => x.type === "attack" && x.actor === actor);
const order = (r) => r.events.filter((x) => x.type === "attack" || x.type === "reaction").map((x) => `${x.type}:${x.actor ?? x.id}`);

// ---------- the gate and the reading ----------
test("the pack loads in strict mode, its entry lints, and the reaction is read in words", () => {
  assert.deepEqual(lintEntry("subclasses", EMBER, { pack: P, srd: CONTENT }), []);
  const r = readEntry("subclasses", EMBER, { spells: [] });
  assert.deepEqual(r.problems, []);
  const text = r.lines.join("\n");
  assert.match(text, /A Reaction, taken by a standing instruction: when a hostile creature that is under the lasting effect of the feature "hb-quiet-ember-folk-quiet-vow", which this holder made, makes an attack with the Attack action or with one of its own actions/);
  assert.match(text, /the holder makes one melee weapon attack against it first, before that attack is rolled\./);
  assert.match(text, /The holder must sense that creature, and it must be within the reach of one of the holder's melee weapons with no wall between/);
  assert.match(text, /If that attack drops the creature, its attack is not made\. It is not set off by a spell attack, an Opportunity Attack or another Reaction attack, a Grapple or a Shove, or an attack that only starts the fight\./);
});

test("the gate refuses a reaction that is not whole, a sentence for each", () => {
  assert.equal(withReaction(REPRISAL.reaction), "");
  const shape = /an attacks reaction is \{ on: "attacks", of: a feature id, attack: "melee" \}/;
  assert.match(withReaction({ on: "attacks", attack: "melee" }), shape, "no `of`");
  assert.match(withReaction({ on: "attacks", of: hb("quiet-vow") }), shape, "no `attack`");
  assert.match(withReaction({ on: "attacks", of: hb("quiet-vow"), attack: "ranged" }), shape, "ranged");
  assert.match(withReaction({ on: "attacks", of: "Not An Id", attack: "melee" }), shape, "not an id");
  assert.notEqual(withReaction({ on: "attacks", of: hb("quiet-vow"), attack: "melee", within: 5 }), "", "a fourth key");
  assert.match(withReaction({ on: "attacks", of: hb("nowhere"), attack: "melee" }), /neither a feature of the Paladin nor of this subclass/);
  // `of` names a feature whose action lasts and is aimed at a creature
  const instant = feature("quiet-flash", 3, { action: { time: "bonus", target: { creature: { range: [30, 30] } }, effects: [{ damage: "1d4", type: "fire" }] } });
  assert.match(palOne(instant, feature("quiet-reprisal", 3, { reaction: { on: "attacks", of: hb("quiet-flash"), attack: "melee" } })), /reaction\.of names "hb-quiet-ember-folk-quiet-flash", which has no action that lasts and is aimed at a creature/);
  const plain = feature("quiet-plain", 3, { modifiers: [{ on: "ac", op: "add", value: 1 }] });
  assert.match(palOne(plain, feature("quiet-reprisal", 3, { reaction: { on: "attacks", of: hb("quiet-plain"), attack: "melee" } })), /which has no action that lasts and is aimed at a creature/);
  // a class feature of the SRD paladin that is not such an action is no better
  assert.match(palOne(feature("quiet-reprisal", 3, { reaction: { on: "attacks", of: "lay-on-hands", attack: "melee" } })), /which has no action that lasts and is aimed at a creature/);
});

test("only a subclass's feature may state it: a feat and an item are refused", () => {
  const grants = REPRISAL;
  const feat1 = { id: hb("fleet"), name: "Fleet", category: "general", tier: "auto", source: SRC, checked: false, text: "In the pack's own words.", grants };
  const item1 = { id: hb("spurs"), name: "Spurs", category: "wondrous", rarity: "rare", wear: "carried", tier: "auto", source: SRC, checked: false, text: "In the pack's own words.", grants };
  const asPack = (lists) => (loadPack(doc(lists)).problems ?? []).join("\n");
  assert.match(asPack({ feats: [feat1] }), /a feat or an item cannot state a reaction to a creature under its effect/);
  assert.notEqual(asPack({ items: [item1] }), "", "an item");
  assert.match(asPack({ items: [item1] }), /does not grant "reaction"|a feat or an item cannot state a reaction/);
});

test("the record lints with the reaction, and a record whose reaction is not whole is refused", () => {
  using(ON, () => {
    const r = derive(paladin()).record;
    assert.deepEqual(feat(r, REPRISAL_ID).reaction, { on: "attacks", of: VOW_ID, attack: "melee" });
    assert.deepEqual(lintRecord(JSON.parse(json(r)), { spells: CONTENT.spells }), []);
    const bad = JSON.parse(json(r));
    feat(bad, REPRISAL_ID).reaction = { on: "attacks", of: VOW_ID };
    assert.ok(lintRecord(bad, { spells: CONTENT.spells }).some((m) => /its attacks reaction is \{ on: "attacks", of: a feature id, attack: "melee" \}/.test(m)));
  });
});

test("derive: a holder has the reaction at level 3, an SRD paladin is the same as before, and with the pack away the feature is gone", () => {
  using(ON, () => {
    assert.ok(!derive(paladin(2, { subclass: undefined })).record.feats.some((f) => f.reaction?.on === "attacks"));
    assert.ok(feat(derive(paladin(3)).record, REPRISAL_ID));
    const list = reactionsOf(derive(paladin()).record).filter((x) => x.on === "attacks");
    assert.deepEqual(list.map((x) => [x.id, x.kind, x.options, x.dflt]), [[REPRISAL_ID, "feature", ["never", "always", "ask"], "always"]]);
  });
  const srd = derive(paladin(5, { subclass: "oath-of-devotion" })).record;
  assert.ok(!srd.feats.some((f) => f.reaction?.on === "attacks"));
  using(OFF, () => assert.ok(!derive(paladin()).record.feats.some((f) => f.id === REPRISAL_ID)));
});

// ---------- the effect ----------
test("underEffect: the creature the vow was put against, and no other", () => {
  using(ON, () => {
    const s = field();
    fight(s); turnOf(s, "hero");
    assert.equal(underEffect(s, s.entities.hero, VOW_ID, s.entities[s.gob]), false, "before the vow");
    ok(vow(s, s.gob));
    assert.equal(underEffect(s, s.entities.hero, VOW_ID, s.entities[s.gob]), true);
    assert.equal(underEffect(s, s.entities.hero, VOW_ID, s.entities[s.bo]), false, "another foe");
    assert.equal(underEffect(s, s.entities.hero, VOW_ID, s.entities.hero), false, "the holder itself");
    assert.equal(underEffect(s, s.entities.hero, hb("other"), s.entities[s.gob]), false, "another feature's effect");
    assert.equal(underEffect(s, s.entities[s.bo], VOW_ID, s.entities[s.gob]), false, "another holder's");
    const fx = effectsOf(s).find((x) => x.feature === VOW_ID);
    for (const p of fx.parts) p.ended = true;
    assert.equal(underEffect(s, s.entities.hero, VOW_ID, s.entities[s.gob]), false, "an ended part");
  });
});

// ---------- played ----------
test("a creature under the vow attacks: the holder's Reaction is a melee weapon attack against it, first", () => {
  using(ON, () => {
    const s = field();
    marked(s);
    const r = ok(stab(s));
    assert.equal(reactions(r).length, 1);
    assert.deepEqual(reactions(r)[0], { type: "reaction", id: "hero", reaction: REPRISAL_ID, name: "Quiet reprisal", trigger: "attacks", against: s.gob });
    assert.deepEqual(order(r), ["reaction:hero", `attack:hero`, `attack:${s.gob}`]);
    assert.equal(attacks(r, "hero")[0].target, s.gob);
    assert.equal(attacks(r, "hero")[0].name, "Longsword");
    assert.equal(attacks(r, "hero")[0].reaction, REPRISAL_ID, "the attack says what it was made as");
    assert.equal(s.entities.hero.reactionUsed, true);
    // its Reaction is spent: the goblin's next attack the same turn finds none
    s.encounter.budget.action = 1;
    const again = ok(stab(s));
    assert.equal(reactions(again).length, 0);
    assert.equal(attacks(again, s.gob).length, 1);
  });
});

test("a creature not under the vow, an ended vow and a holder with no Reaction left: nothing happens", () => {
  using(ON, () => {
    let s = field();
    marked(s, s.gob, s.bo);
    s.entities[s.bo].pos = { q: 0, r: 1, z: 0 };
    assert.equal(reactions(ok(stab(s, s.bo))).length, 0, "Bo is not under it");
    s = field();
    marked(s);
    for (const p of effectsOf(s).find((x) => x.feature === VOW_ID).parts) p.ended = true;
    assert.equal(reactions(ok(stab(s))).length, 0, "an ended vow");
    s = field();
    marked(s);
    s.entities.hero.reactionUsed = true;
    const r = ok(stab(s));
    assert.equal(reactions(r).length, 0, "no Reaction left");
    assert.equal(attacks(r, s.gob).length, 1);
    s = field();
    marked(s);
    s.entities.hero.cond.incapacitated = {};
    assert.equal(reactions(ok(stab(s))).length, 0, "Incapacitated");
  });
});

test("with no melee weapon that reaches, or only an Unarmed Strike, it is not offered and nothing is spent", () => {
  using(ON, () => {
    let s = field();
    marked(s);
    s.entities.hero.attacks = s.entities.hero.attacks.map((a) => (a.type === "melee" ? { ...a, reach: 0 } : a));
    let r = ok(stab(s));
    assert.equal(reactions(r).length, 0, "its weapons do not reach");
    assert.ok(!s.entities.hero.reactionUsed);
    s = field();
    marked(s);
    s.entities.hero.attacks = s.entities.hero.attacks.filter((a) => a.type !== "melee" || a.id === "unarmed-strike");
    r = ok(stab(s));
    assert.equal(reactions(r).length, 0, "an Unarmed Strike is not a weapon attack");
    assert.ok(!s.entities.hero.reactionUsed);
    s = field();
    marked(s);
    s.entities.hero.attacks = [];
    assert.equal(reactions(ok(stab(s))).length, 0, "no attacks at all");
  });
});

test("a ranged attack by the creature under the vow, from beyond the holder's reach, is not answered", () => {
  using(ON, () => {
    const s = field();
    fight(s); turnOf(s, "hero");
    ok(vow(s, s.cy));
    turnOf(s, s.cy);
    const r = ok(apply(s, { type: "attack", actor: s.cy, attack: "shortbow", target: "hero" }, DM));
    assert.equal(reactions(r).length, 0, "Cy is 20 feet away");
    assert.equal(attacks(r, s.cy).length, 1);
  });
});

test("the instruction: never does nothing, always is the default, and a Reaction is spent once a round", () => {
  using(ON, () => {
    let s = field();
    marked(s);
    ok(apply(s, { type: "reactions", actor: "hero", set: { [REPRISAL_ID]: "never" } }, PAT));
    const r = ok(stab(s));
    assert.equal(reactions(r).length, 0);
    assert.ok(!s.entities.hero.reactionUsed);
    assert.deepEqual(order(r), [`attack:${s.gob}`]);
    s = field();
    marked(s);
    ok(apply(s, { type: "reactions", actor: "hero", set: { [REPRISAL_ID]: "always" } }, PAT));
    assert.equal(reactions(ok(stab(s))).length, 1);
    no(apply(s, { type: "reactions", actor: "hero", set: { [REPRISAL_ID]: "miss" } }, PAT), /can be set to never, always, ask/);
  });
});

test("asked: the player is asked, the question names the attacker, and answering takes or declines it", () => {
  using(ON, () => {
    const asked = () => {
      const s = field();
      ok(apply(s, { type: "reactions", actor: "hero", set: { [REPRISAL_ID]: "ask" } }, PAT));
      marked(s);
      const r = ok(stab(s));
      return { s, r };
    };
    let { s, r } = asked();
    assert.ok(s.pending, "the attack waits for its player");
    assert.equal(s.pending.ask.trigger, "attacks");
    assert.equal(s.pending.ask.reactor, "hero");
    assert.equal(s.pending.ask.by, s.gob);
    assert.deepEqual(s.pending.ask.options, [{ reaction: REPRISAL_ID, name: "Quiet reprisal" }]);
    assert.ok(!r.events.some((x) => x.type === "attack"), "nothing was rolled yet");
    const pv = view(s, PAT).prompt;
    assert.deepEqual([pv.trigger, pv.by, pv.reactor], ["attacks", s.gob, "hero"]);
    const taken = ok(apply(s, { type: "react", prompt: s.pending.n, take: REPRISAL_ID }, PAT));
    assert.equal(s.pending, undefined);
    assert.deepEqual(order(taken), ["reaction:hero", "attack:hero", `attack:${s.gob}`]);
    // declined: the goblin's attack is made, and the hero's Reaction is still its own
    ({ s } = asked());
    const declined = ok(apply(s, { type: "react", prompt: s.pending.n, take: null }, PAT));
    assert.deepEqual(order(declined), [`attack:${s.gob}`]);
    assert.ok(!s.entities.hero.reactionUsed);
    // the DM may answer for the player
    ({ s } = asked());
    assert.deepEqual(order(ok(apply(s, { type: "react", prompt: s.pending.n, take: REPRISAL_ID }, DM))).slice(0, 2), ["reaction:hero", "attack:hero"]);
  });
});

test("declined, or never, changes nothing: the same game as one with no Reaction at all", () => {
  using(ON, () => {
    const run = (how) => {
      const s = field();
      marked(s);
      if (how === "never") ok(apply(s, { type: "reactions", actor: "hero", set: { [REPRISAL_ID]: "never" } }, PAT));
      if (how === "declined") { ok(apply(s, { type: "reactions", actor: "hero", set: { [REPRISAL_ID]: "ask" } }, PAT)); ok(stab(s)); ok(apply(s, { type: "react", prompt: s.pending.n, take: null }, PAT)); }
      else ok(stab(s));
      delete s.entities.hero.reactions; delete s.asked;
      return s;
    };
    const never = run("never"), declined = run("declined");
    assert.equal(json(declined.entities), json(never.entities));
    assert.equal(json(declined.effects), json(never.effects));
    assert.equal(json(declined.encounter), json(never.encounter));
  });
});

test("a reaction attack that drops the creature ends its attack: it is not made", () => {
  using(ON, () => {
    let seen = false;
    for (let seed = 1; seed < 40 && !seen; seed++) {
      const s = field(paladin(), { seed });
      marked(s);
      s.entities[s.gob].hp = 1;
      const r = ok(stab(s));
      if (s.entities[s.gob].dead || s.entities[s.gob].hp <= 0) { seen = true; assert.equal(attacks(r, s.gob).length, 0); assert.ok(s.encounter, "the fight goes on, Bo and Cy stand"); }
    }
    assert.ok(seen, "a reaction attack dropped the goblin");
  });
});

test("a creature with flat attack records (a character) that is under the vow is answered too", () => {
  using(ON, () => {
    const s = field();
    s.entities.foe = makeEntity(derive(paladin(5, { name: "Foe Knight", subclass: "oath-of-devotion" })).record, { id: "foe", kind: "pc", side: "foe", pos: { q: 0, r: 1, z: 0 } });
    Object.assign(s.entities.foe, { hp: 300, maxHp: 300, ac: 1 });
    fight(s); turnOf(s, "hero");
    ok(vow(s, "foe"));
    turnOf(s, "foe");
    const r = ok(apply(s, { type: "attack", actor: "foe", attack: "longsword", target: "hero" }, DM));
    assert.deepEqual(order(r), ["reaction:hero", "attack:hero", "attack:foe"]);
  });
});

test("a Grapple or a Shove is not an attack roll, and the attack that starts a fight is no trigger", () => {
  using(ON, () => {
    const s = field();
    s.entities.foe = makeEntity(derive(paladin(5, { name: "Foe Knight", subclass: "oath-of-devotion" })).record, { id: "foe", kind: "pc", side: "foe", pos: { q: 0, r: 1, z: 0 } });
    Object.assign(s.entities.foe, { hp: 300, maxHp: 300, ac: 1 });
    fight(s); turnOf(s, "hero");
    ok(vow(s, "foe"));
    turnOf(s, "foe");
    const r = ok(apply(s, { type: "attack", actor: "foe", attack: "unarmed-strike", target: "hero", option: "shove", shove: "prone" }, DM));
    assert.equal(reactions(r).length, 0);
  });
  using(ON, () => {
    // out of a fight: the attack only starts one, and rolls no attack
    const s = field();
    const r = ok(apply(s, { type: "attack", actor: "hero", attack: "longsword", target: s.gob }, PAT));
    assert.equal(reactions(r).length, 0);
    assert.ok(s.encounter && !attacks(r, "hero").length, "the fight began and no attack was rolled");
  });
});

test("a hostile holder against a creature of its own side: only a hostile creature is answered", () => {
  using(ON, () => {
    const s = field();
    s.entities.ally = makeEntity(derive(paladin(5, { name: "Ally Knight", subclass: "oath-of-devotion" })).record, { id: "ally", kind: "pc", side: "party", pos: { q: 0, r: 1, z: 0 } });
    Object.assign(s.entities.ally, { hp: 300, maxHp: 300 });
    fight(s); turnOf(s, "hero");
    ok(vow(s, "ally"));                                                  // the DM-legal oddity: a vow put on a friend
    turnOf(s, "ally");
    const r = ok(apply(s, { type: "attack", actor: "ally", attack: "longsword", target: s.gob }, DM));
    assert.equal(reactions(r).length, 0);
  });
});

// ---------- hidden creatures and what players are sent ----------
test("a hiding attacker the holder cannot sense is not answered and no player is asked", () => {
  using(ON, () => {
    const s = field();
    ok(apply(s, { type: "reactions", actor: "hero", set: { [REPRISAL_ID]: "ask" } }, PAT));
    marked(s);
    s.entities[s.gob].hiding = { dc: 30 };
    const r = ok(stab(s));
    assert.equal(s.pending, undefined, "nothing waits");
    assert.equal(reactions(r).length, 0);
    assert.equal(attacks(r, s.gob).length, 1);
    assert.ok(!s.entities.hero.reactionUsed);
    assert.ok(!r.events.some((x) => x.type === "manual" && x.actor === "hero"), "the DM is not told of a Reaction that was never possible");
  });
  using(ON, () => {
    const s = field();
    marked(s);
    s.entities[s.gob].hidden = true;
    const r = ok(stab(s));
    assert.equal(reactions(r).length, 0, "a creature the DM has hidden");
  });
});

test("a hiding attacker the holder's own senses find is found first, and the question does not name one the party is not told of", () => {
  using(ON, () => {
    const s = field();
    s.entities.hero.senses = { ...s.entities.hero.senses, truesight: 60 };
    s.settings.sight = "light"; s.map.levels[0].light = "dark";
    ok(apply(s, { type: "reactions", actor: "hero", set: { [REPRISAL_ID]: "ask" } }, PAT));
    marked(s);
    s.entities[s.gob].hiding = { dc: 30 };
    assert.equal(seesFor(s, s.entities.hero, s.entities[s.gob]), false, "the party is not told of it");
    assert.equal(sensesFor(s, s.entities.hero, s.entities[s.gob]), true, "but the hero's own senses find it");
    ok(stab(s));
    assert.ok(s.pending, "asked");
    assert.equal(s.pending.ask.by, undefined, "an attacker the party is not told of is not named");
    assert.equal(view(s, PAT).prompt.by, undefined);
    const r = ok(apply(s, { type: "react", prompt: s.pending.n, take: REPRISAL_ID }, PAT));
    const found = r.events.findIndex((x) => x.type === "unhidden" && x.id === s.gob && x.why === "found");
    const re = r.events.findIndex((x) => x.type === "reaction" && x.reaction === REPRISAL_ID);
    assert.ok(found >= 0 && found < re, "the attacker is found before the Reaction");
  });
});

test("a foe's holder asked by the DM: the DM alone is told, nothing waits", () => {
  using(ON, () => {
    // the holder is a foe's character; it is not a player's, so `ask` hands the moment to the DM
    const s = field();
    s.entities.foe = makeEntity(derive(paladin()).record, { id: "foe", kind: "pc", side: "foe", pos: { q: 0, r: 1, z: 0 } });
    s.entities.foe.sheet = paladin();
    Object.assign(s.entities.foe, { hp: 300, maxHp: 300, reactions: { [REPRISAL_ID]: "ask" } });
    s.entities.hero.side = "party";
    fight(s); turnOf(s, "foe");
    ok(apply(s, { type: "feature", actor: "foe", feature: VOW_ID, target: "hero" }, DM));
    turnOf(s, "hero");
    const r = ok(apply(s, { type: "attack", actor: "hero", attack: "longsword", target: s.gob }, PAT));
    assert.equal(s.pending, undefined);
    assert.ok(r.events.some((x) => x.type === "manual" && x.actor === "foe" && /instruction for Quiet reprisal is to ask the DM/.test(x.text)));
    assert.ok(!viewEvents(r.events, s, PAT).some((x) => x.type === "manual"), "the party is not sent it");
    assert.equal(reactions(r).length, 0);
    assert.equal(attacks(r, "hero").length, 1);
  });
});

test("what players are sent: the reaction event as any other, and the pack's copy carries `reaction` with `dmNotes` stripped", () => {
  using(ON, () => {
    const s = field();
    marked(s);
    const r = ok(stab(s));
    const ev = viewEvents(r.events, s, PAT).find((x) => x.type === "reaction");
    assert.deepEqual(ev, { type: "reaction", id: "hero", reaction: REPRISAL_ID, name: "Quiet reprisal", trigger: "attacks", against: s.gob });
    const withNotes = { ...EMBER, dmNotes: "for the DM", features: EMBER.features.map((f) => ({ ...f, dmNotes: "for the DM" })) };
    const copy = forPlayers(doc({ subclasses: [withNotes] })).data.subclasses[0];
    assert.deepEqual(copy.features[1].grants.reaction, REPRISAL.reaction);
    assert.ok(!json(copy).includes("dmNotes"));
  });
});

test("the overlay away: a record made before keeps its feature and plays it, and a record made now has none", () => {
  let s;
  using(ON, () => { s = field(); marked(s); });
  using(OFF, () => {
    assert.equal(reactions(ok(stab(s))).length, 1, "the record it was made with plays");
    assert.ok(!derive(paladin(5)).record.feats.some((f) => f.id === REPRISAL_ID), "made now, it has none");
  });
});

test("replay: the same actions give the same game, with a question answered", () => {
  using(ON, () => {
    const run = () => {
      const s = field();
      ok(apply(s, { type: "reactions", actor: "hero", set: { [REPRISAL_ID]: "ask" } }, PAT));
      marked(s);
      ok(stab(s));
      ok(apply(s, { type: "react", prompt: s.pending.n, take: REPRISAL_ID }, PAT));
      return json(s);
    };
    assert.equal(run(), run());
  });
});
