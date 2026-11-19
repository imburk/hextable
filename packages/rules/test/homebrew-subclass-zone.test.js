// Homebrew subclasses, addition D of docs/specs/homebrew-subclasses.md (#518): a feature's action may carry a `zone`, an Emanation that moves with
// its holder and runs the action's steps on a foe that enters it or starts or ends its turn there, exactly as the spell zone does (zones.js).
// The subclass is invented for this test ("Oath of the Ember", a pack "ember-folk"); no published subclass is used.
import assert from "node:assert/strict";
import { test } from "node:test";
import { apply, current, makeEntity } from "../src/engine.js";
import { derive, validate } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { CONTENT } from "../src/content/index.js";
import { loadPack, overlayOf, using } from "../src/content/registry.js";
import { lintEntry } from "../src/content/schema.js";
import { readEntry } from "../src/content/reader.js";
import { forPlayers } from "../src/content/packs.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const PAT = { role: "player", userId: "pat" };
const KIM = { role: "player", userId: "kim" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const no = (r, re) => { assert.equal(r.ok, false, "it was refused"); if (re) assert.match(r.error, re); return r; };
const json = (x) => JSON.stringify(x);

// ---------- the invented pack ----------
const P = "ember-folk", hb = (n) => `hb-${P}-${n}`, SRC = `homebrew:${P}`;
const doc = (lists) => ({ format: "hextable-pack", v: 1, pack: { id: P, name: "Ember Folk", version: 1, license: "CC0, by the author", attribution: "Written for a test." }, ...lists });
const feature = (id, level, grants, more = {}) => ({ id: hb(id), name: id.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()), level, tier: "auto", checked: false, text: `The ${id}, in the pack's own words.`, ...(grants ? { grants } : {}), ...more });
const oath = (id, name, features, more = {}) => ({ id: hb(id), name, class: "paladin", source: SRC, checked: false, text: "Paladins sworn to keep a hearth-fire burning.", features, ...more });
const SAVE = { save: "wis", dc: "cha", onFail: [{ damage: "2d6", type: "fire" }] };
// A zone on a Bonus Action that spends Channel Divinity: 10 feet round the holder for a minute, a Wisdom save on a foe that enters it or ends its turn there, once a turn.
const AURA = (over = {}) => ({ action: { time: "bonus", cost: { resource: "channel-divinity" }, duration: "1 minute", target: { area: { shape: "emanation", size: 10 } },
  zone: { on: ["enter", "turnEnd"], once: "turn" }, effects: [SAVE], ...over } });
// The Pyre uses its own use, spares those the holder names, goes off as it appears and at the start of a turn, and ends if its holder is Incapacitated.
const PYRE = { action: { time: "action", duration: "10 minutes", target: { area: { shape: "emanation", size: 15 } }, zone: { on: ["turnStart"], atCast: true, spare: true }, endsWhenIncapacitated: true,
  effects: [{ save: "con", dc: "cha", onFail: [{ damage: "1d8", type: "radiant" }] }] } };
const EMBER = oath("oath-of-the-ember", "Oath of the Ember", [
  feature("smoulder-aura", 7, AURA()),
  feature("ember-pyre", 9, PYRE, { uses: { max: 1, recharge: "long" } }),
]);
const pack = (d) => { const r = loadPack(d); assert.ok(r.ok, (r.problems ?? []).join("; ")); return r.pack; };
const PACK = pack(doc({ subclasses: [EMBER] })), ON = overlayOf([PACK]), OFF = overlayOf([]);
const problems = (...subs) => (loadPack(doc({ subclasses: subs })).problems ?? []).join("\n");
const one = (grants, level = 7, more = {}) => problems(oath("oath-x", "Oath of X", [feature("x-aura", level, grants, more)]));

// ---------- the table ----------
const A = { str: 16, dex: 10, con: 14, int: 12, wis: 14, cha: 16 };
const paladin = (level = 9, over = {}) => ({ name: "Sir Ember", class: "paladin", level, subclass: hb("oath-of-the-ember"), abilities: A, skills: ["athletics", "religion"], choices: { "fighting-style": "defense" },
  armour: "chain-mail", shield: true, weapons: ["longsword"], spells: ["bless", "cure-wounds", "aid", "find-steed"].slice(0, level >= 5 ? 3 : 2), ...over });
const AURA_ID = hb("smoulder-aura"), PYRE_ID = hb("ember-pyre");
const feat = (r, id) => r.feats.find((f) => f.id === id);

// The hero at the middle of a grass field with an unlinked rogue and monster put away; goblins are put where the test says. No fight yet.
function field(foes = [], sheet = paladin()) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (!["rogue", "m1"].includes(id)) delete s.entities[id];
  for (const t of Object.values(s.map.levels[0].tiles)) t.t = "grass";
  s.settings.autoEngage = false;
  s.entities.hero = makeEntity(derive(sheet).record, { id: "hero", kind: "pc", side: "party", pos: { q: 0, r: 0, z: 0 } });
  s.entities.hero.sheet = structuredClone(sheet);
  ok(apply(s, { type: "claim", entity: "hero", user: "pat", userName: "Pat" }, PAT));
  ok(apply(s, { type: "place", actor: "rogue", to: { q: -6, r: 4 } }, DM));
  ok(apply(s, { type: "place", actor: "m1", to: { q: -7, r: 6 } }, DM));
  const out = {};
  for (const [name, q, r, hidden] of foes) {
    const id = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q, r }, name, ...(hidden ? { hidden: true } : {}) }, DM)).events[0].id;
    Object.assign(s.entities[id], { hp: 300, maxHp: 300 });
    out[name] = id;
  }
  return { s, ids: out };
}
const fight = (s) => ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }, DM));
const turnOf = (s, id) => { for (let i = 0; i < 60 && current(s) !== id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM)); assert.equal(current(s), id); };
const use = (s, f, more = {}, ctx = PAT) => apply(s, { type: "feature", actor: "hero", feature: f, ...more }, ctx);
const walk = (s, q, r) => ok(apply(s, { type: "move", actor: "hero", to: { q, r } }, DM));
const zoneFx = (s) => s.effects.filter((x) => x.zone);
const saves = (events, id) => events.filter((e) => e.type === "save" && e.id === id).length;
const zones = (events, id) => events.filter((e) => e.type === "zone" && e.id === id);
const fxSet = (s) => s.effects.map((x) => x.id).join();

// ---------- the gate and the reading ----------
test("the pack of the invented oath loads in strict mode, its entry lints, and it is read in words", () => {
  assert.deepEqual(lintEntry("subclasses", EMBER, { pack: P, srd: CONTENT }), []);
  const read = readEntry("subclasses", EMBER, { spells: [] });
  assert.deepEqual(read.problems, []);
  const lines = read.lines.join("\n");
  assert.match(lines, /A 10-foot emanation stays for as long as the action lasts\. It moves with the holder and never affects the holder\./);
  assert.match(lines, /As it appears it affects nobody\./);
  assert.match(lines, /the steps below run on a creature each time it enters the area \(or the area reaches it\) or ends its turn there, at most once a turn for each creature/);
  assert.match(lines, /As it appears, the steps below run on each creature in it\./);
  assert.match(lines, /When using it, the holder may name creatures the area leaves alone\./);
  assert.match(lines, /It ends when its duration does, when the holder ends it, and when the holder dies, drops to 0 Hit Points or falls Unconscious\. The holder cannot use it again while it lasts\./);
  assert.match(lines, /or is Incapacitated\. The holder cannot use it again/, "the Pyre says it ends on Incapacitated");
  assert.match(lines, /Each creature rolls its own damage\./);
  assert.match(lines, /That creature/, "the steps are read as done to each creature the zone catches");
});

test("the gate refuses a zone that is not whole, each with a sentence", () => {
  assert.equal(one(AURA()), "");
  // an area that is not an Emanation, no area at all, an area with a pick or a count, no duration
  assert.match(one(AURA({ target: { area: { shape: "sphere", size: 10, range: 30 } } })), /the zone of a feature's action is an Emanation, which moves with its holder/);
  assert.match(one(AURA({ target: { creature: { range: [30, 30] } } })), /a zone needs a single area to lay out/);
  assert.match(one(AURA({ target: { self: true } })), /a zone needs a single area to lay out/);
  assert.match(one(AURA({ target: { area: { shape: "emanation", size: 10, choose: 2 } } })), /a zone needs a single area to lay out/);
  assert.match(one(AURA({ duration: undefined })), /a zone needs a duration/);
  assert.match(one(AURA({ duration: "instant" })), /a zone needs a duration/);
  // the zone itself
  assert.match(one(AURA({ zone: {} })), /`zone.on` lists enter, turnStart and\/or turnEnd/);
  assert.match(one(AURA({ zone: { on: [] } })), /`zone.on` lists enter, turnStart and\/or turnEnd/);
  assert.match(one(AURA({ zone: { on: ["enter", "enter"] } })), /`zone.on` lists enter, turnStart and\/or turnEnd/);
  assert.match(one(AURA({ zone: { on: ["leave"] } })), /`zone.on` lists enter, turnStart and\/or turnEnd/);
  assert.match(one(AURA({ zone: { on: ["enter"], once: "round" } })), /`zone.once` is "turn" or left out/);
  assert.match(one(AURA({ zone: { on: ["enter"], atCast: false } })), /`zone.atCast` is true or left out/);
  assert.match(one(AURA({ zone: { on: ["enter"], spare: 1 } })), /zone.spare.* true/);
  assert.match(one(AURA({ zone: { on: ["enter"], follows: "hero" } })), /"follows" is not something a zone has/);
  assert.match(one(AURA({ zone: "yes" })), /`zone` must be an object/);
  assert.match(one(AURA({ zone: [] })), /`zone` must be an object/);
  // the steps: there must be some, and a creature made or moved by the holder cannot be done once for each creature that enters
  assert.match(one(AURA({ effects: undefined })), /an action with a zone has `effects`: the steps that go off on each creature/);
  assert.match(one(AURA({ effects: [{ teleport: 30 }] })), /the steps of a zone run on each creature that enters it: a summon or teleport step cannot be one of them/);
  // what an action with a zone cannot also do
  for (const k of ["renew", "noSpells", "pool", "firstAttack", "after"]) assert.match(one(AURA({ [k]: k === "after" ? "hit" : true })), new RegExp(`an action with a zone cannot also have \`${k}\``), k);
  assert.match(one(AURA({ acts: ["dodge"] })), /an action with a zone cannot also have `acts`/);
  assert.match(one(AURA({ orSlot: true })), /an action with a zone cannot also have `orSlot`/);
  assert.match(one(AURA({ effects: undefined, modes: [{ id: "a", name: "A", effects: [SAVE] }, { id: "b", name: "B", effects: [SAVE] }] })), /an action with a zone cannot also have `modes`/);
  assert.match(one(AURA({ time: "reaction" })), /a zone is set up by an action, a Bonus Action or a free use, not by a Reaction/);
  assert.match(one(AURA({ gain: { action: 1 } })), /an action with a zone cannot also have `gain`/);
  // the key is the vocabulary's, not a free one: an unknown key beside it is still refused
  assert.match(one(AURA({ zones: { on: ["enter"] } })), /"zones" is not something a feature's action has/);
  // a zone that is fine stays fine at the levels of the class, with the other limits of the gate: a very long list of steps is refused by the work estimate
  const many = Array.from({ length: 41 }, () => ({ damage: "1d4", type: "fire" }));
  assert.match(one(AURA({ effects: many })), /steps|too many|the most is/);
});

test("only a subclass's feature may carry a zone: a feat or an item that holds one is refused", () => {
  const plain = AURA({ effects: [{ save: "wis", dc: 14, onFail: [{ damage: "2d6", type: "fire" }] }] });
  const feat = { id: hb("zone-feat"), name: "Zone Feat", category: "general", tier: "assist", source: SRC, checked: false, text: "t", grants: { action: { ...plain.action, cost: undefined } } };
  assert.match((loadPack(doc({ feats: [feat] })).problems ?? []).join("\n"), /a feat or an item cannot carry a zone: only a feature of a subclass can/);
  const item = { id: hb("zone-ring"), name: "Zone Ring", category: "wondrous", rarity: "rare", wear: "carried", tier: "assist", source: SRC, checked: false, text: "t", grants: { action: { ...plain.action, cost: undefined } } };
  assert.match((loadPack(doc({ items: [item] })).problems ?? []).join("\n"), /a feat or an item cannot carry a zone: only a feature of a subclass can/);
  // The same gate holds when the zone sits in an option of a subclass feature: that is a subclass's too.
  const opt = (id) => ({ id: hb(id), name: id, text: "An option.", tier: "auto", grants: AURA() });
  assert.equal(problems(oath("oath-y", "Oath of Y", [feature("y-pick", 7, undefined, { tier: "assist", options: [opt("y-one"), opt("y-two")] })])), "");
});

test("the work of a zone is counted: a zone that rolls too many dice is refused as a spell's is", () => {
  const dice = (n) => one(AURA({ effects: [{ save: "wis", dc: "cha", onFail: [{ damage: `${n}d6`, type: "fire" }] }] }));
  assert.equal(dice(8), "");
  assert.match(dice(2000), /dice|the most is/);
});

// ---------- derive and what players are sent ----------
test("derive: the record's action carries the zone, with the DC and the steps put in; the class's content is not changed", () => {
  const before = json(CONTENT.classes.paladin);
  using(ON, () => {
    assert.deepEqual(validate(paladin()), []);
    const r = derive(paladin()).record, a = feat(r, AURA_ID).action;
    assert.deepEqual(a.zone, { on: ["enter", "turnEnd"], once: "turn" });
    assert.deepEqual(a.target, { area: { shape: "emanation", size: 10 } });
    assert.equal(a.duration, "1 minute");
    assert.equal(a.effects[0].dc, 8 + 4 + 3, "8 + Proficiency Bonus 4 + Charisma modifier 3, put in as for any class feature's save");
    assert.equal(feat(r, PYRE_ID).action.endsWhenIncapacitated, true);
    // Level 7 has the first and not the second; level 6 neither.
    assert.ok(!feat(derive(paladin(7)).record, PYRE_ID) && feat(derive(paladin(7)).record, AURA_ID));
    assert.ok(!feat(derive(paladin(6)).record, AURA_ID));
  });
  assert.equal(json(CONTENT.classes.paladin), before);
});

test("an SRD-only sheet is made as it was, with the pack lent or not, and no record of an SRD class holds a zone", () => {
  for (const sheet of [{ ...paladin(9), subclass: "devotion" }, { ...paladin(5), subclass: "devotion" }]) {
    const plain = derive(sheet).record;
    using(ON, () => assert.equal(json(derive(sheet).record), json(plain)));
    for (const f of plain.feats) assert.equal(f.action?.zone, undefined, f.id);
  }
  for (const c of Object.values(CONTENT.classes)) for (const f of [...c.features, ...(c.subclass?.features ?? [])]) assert.equal(f.grants?.action?.zone, undefined, `${c.id}/${f.id}`);
});

test("what players are sent: the pack's copy has the subclass with its zone and no notes, no view or event changes, and the zone itself is not in the state sent", () => {
  const withNotes = { ...EMBER, dmNotes: "The DM's own note.", features: EMBER.features.map((f, i) => (i === 0 ? { ...f, dmNotes: "More." } : f)) };
  const sub = forPlayers(doc({ subclasses: [withNotes] })).data.subclasses[0];
  assert.equal(sub.dmNotes, undefined); assert.equal(sub.features[0].dmNotes, undefined);
  assert.deepEqual(sub.features[0].grants.action.zone, { on: ["enter", "turnEnd"], once: "turn" }, "the zone is data of the subclass, sent as every other key of it");
  using(ON, () => {
    const { s, ids } = field([["Gob", 3, 0]]);
    fight(s); turnOf(s, "hero");
    const used = ok(use(s, AURA_ID));
    const fx = zoneFx(s)[0], mineView = view(s, PAT).effects.find((x) => x.id === fx.id), dmView = view(s, DM).effects.find((x) => x.id === fx.id);
    assert.ok(mineView && dmView, "the party sees its own effect");
    assert.equal("zone" in mineView, false, "as for a spell zone, a player is not sent the zone");
    assert.deepEqual(Object.keys(mineView).sort(), ["conc", "id", "lasts", "name", "parts", "source", "spell", "until"], "the keys of any effect (a spell's, a feature's)");
    assert.equal(mineView.spell, null); assert.equal(mineView.conc, false);
    const moved = walk(s, 2, 0);
    assert.equal(zones(moved.events, ids.Gob).length, 1, "the DM's events hold the zone going off");
    assert.equal(viewEvents(moved.events, s, PAT).some((e) => e.type === "zone"), false, "a player is sent no `zone` event");
    assert.equal(viewEvents(used.events, s, PAT).some((e) => e.type === "effectStart"), true);
  });
});

// ---------- the zone played ----------
test("the zone moves with the holder: nobody saves as it appears, and a foe it reaches or that walks in saves, once a turn", () => {
  using(ON, () => {
    const { s, ids } = field([["Near", 0, 1], ["Far", 4, 0]]);
    fight(s); turnOf(s, "hero");
    const e = s.entities.hero, cd = e.uses["channel-divinity"], bonus = s.encounter.budget.bonus;
    const used = ok(use(s, AURA_ID));
    assert.equal(e.uses["channel-divinity"], cd - 1, "Channel Divinity, the parent class's pool, is spent");
    assert.equal(s.encounter.budget.bonus, bonus - 1, "and the Bonus Action");
    assert.equal(used.events.filter((x) => x.type === "save").length, 0, "it affects nobody as it appears");
    const fx = zoneFx(s)[0];
    assert.equal(zoneFx(s).length, 1);
    assert.equal(fx.name, "Smoulder aura"); assert.equal(fx.feature, AURA_ID); assert.equal(fx.source, "hero"); assert.equal(fx.conc, false);
    assert.equal(fx.zone.follows, "hero", "an Emanation follows its holder");
    assert.equal(fx.zone.area.size, 10); assert.equal(fx.zone.once, "turn"); assert.deepEqual(fx.zone.on, ["enter", "turnEnd"]);
    assert.equal(fx.zone.src.dc, 15, "the DC it was made with"); assert.equal(fx.zone.src.name, "Smoulder aura");
    assert.deepEqual(fx.zone.last, {});
    // The hero walks two hexes: Far (20 feet away) is now 10 feet off, so the zone has reached it. Near was already in it, and stays in it.
    const first = walk(s, 2, 0);
    assert.equal(saves(first.events, ids.Far), 1, "the zone reached Far");
    assert.equal(zones(first.events, ids.Far)[0].why, "enter");
    assert.equal(saves(first.events, ids.Near), 0, "Near was in it already");
    assert.equal(first.events.filter((x) => x.type === "save").length, 1);
    // Walking back out and in again in the same turn does not go off again.
    walk(s, 0, 0);
    const again = walk(s, 2, 0);
    assert.equal(saves(again.events, ids.Far), 0, "once a turn");
    // Each foe saves when it ends its own turn in the zone: another turn, so another go.
    const lastOf = {};
    for (const who of [ids.Near, ids.Far]) { turnOf(s, who); lastOf[who] = ok(apply(s, { type: "endTurn", actor: who }, DM)).events; }
    assert.equal(saves(lastOf[ids.Near], ids.Near), 1); assert.equal(zones(lastOf[ids.Near], ids.Near)[0].why, "turnEnd");
    assert.equal(saves(lastOf[ids.Far], ids.Far), 1);
    // The holder's own turn end does nothing to the holder: a zone never affects its holder.
    turnOf(s, "hero");
    const mine = ok(apply(s, { type: "endTurn", actor: "hero" }, DM)).events;
    assert.equal(saves(mine, "hero"), 0);
  });
});

test("a foe that fails the save takes the steps, and a foe the zone does not reach takes nothing", () => {
  using(ON, () => {
    const { s, ids } = field([["In", 1, 0], ["Out", 5, 0]]);
    for (const n of ["In", "Out"]) s.entities[ids[n]].abil.wis = 1;      // DC 15 against a Wisdom of 1: it fails on anything but a 20
    fight(s); turnOf(s, "hero");
    ok(use(s, AURA_ID));
    let hurt = null;
    for (let i = 0; i < 12 && !hurt; i++) {
      const events = ok(apply(s, { type: "endTurn", actor: current(s) }, DM)).events;
      hurt = events.find((x) => x.type === "damage" && x.target === ids.In) ?? null;
    }
    assert.ok(hurt, "In failed a save at the end of one of its turns in the zone");
    assert.equal(hurt.dtype, "fire"); assert.equal(hurt.by, "hero"); assert.equal(hurt.dice.length, 2, "2d6");
    assert.equal(s.entities[ids.In].hp, 300 - hurt.amount);
    assert.equal(s.entities[ids.Out].hp, 300, "a foe outside the zone is not touched");
  });
});

test("it is used outside a fight too: no Bonus Action to spend, and the zone fires on the walk", () => {
  using(ON, () => {
    const { s, ids } = field([["Far", 4, 0]]);
    assert.equal(s.encounter, null);
    ok(use(s, AURA_ID));
    assert.equal(zoneFx(s).length, 1);
    const w = walk(s, 2, 0);
    assert.equal(saves(w.events, ids.Far), 1);
    assert.equal(zones(w.events, ids.Far)[0].why, "enter");
    const w2 = walk(s, 0, 0), w3 = walk(s, 2, 0);
    assert.equal(saves(w2.events.concat(w3.events), ids.Far), 1, "outside a fight each entry goes off: there is no turn to count it once in");
  });
});

test("atCast and spare: the Pyre goes off on those in it as it appears, except those the holder spares, and at the start of a turn", () => {
  using(ON, () => {
    const { s, ids } = field([["Foe", 2, 0], ["Pal", 0, 2]]);
    // Pal is a foe of the DM but the holder spares it by name.
    fight(s); turnOf(s, "hero");
    const used = ok(use(s, PYRE_ID, { spare: [ids.Pal] }));
    assert.equal(saves(used.events, ids.Foe), 1, "it goes off as it appears");
    assert.equal(saves(used.events, ids.Pal), 0, "but not on one the holder names");
    assert.equal(s.entities.hero.uses[PYRE_ID], 0, "its own use");
    const fx = zoneFx(s)[0];
    assert.deepEqual(fx.zone.spare, [ids.Pal]); assert.deepEqual(Object.keys(fx.zone.last), [ids.Foe], "appearing counts as this turn's go");
    // The Foe's turn starts: it saves again (turnStart: the zone says no `once`), and a spared creature never does.
    const next = [];
    for (let i = 0; i < 6 && current(s) !== ids.Foe; i++) next.push(...ok(apply(s, { type: "endTurn", actor: current(s) }, DM)).events);
    assert.equal(current(s), ids.Foe);
    assert.deepEqual(zones(next, ids.Foe).map((z) => z.why), ["turnStart"]);
    assert.equal(zones(next, ids.Pal).length, 0);
  });
});

test("a spare list is refused where the zone cannot spare, or is not a list of creatures, and nothing changes", () => {
  using(ON, () => {
    const { s, ids } = field([["Foe", 2, 0]]);
    fight(s); turnOf(s, "hero");
    const before = json(s);
    no(use(s, AURA_ID, { spare: [ids.Foe] }), /Smoulder aura spares nobody by choice/);
    assert.equal(json(s), before);
    no(use(s, PYRE_ID, { spare: "all" }), /No such creature|Name the creatures it spares/);
    no(use(s, PYRE_ID, { spare: ["nobody"] }), /No such creature|Name the creatures it spares/);
    assert.equal(json(s), before, "a refused use changes nothing: no use spent, no Action, no effect");
  });
});

test("it lasts for the action's duration and no longer: ten rounds in a fight, a minute outside one", () => {
  using(ON, () => {
    const { s, ids } = field([["Far", 4, 0]]);
    fight(s); turnOf(s, "hero");
    const r0 = s.encounter.round;
    ok(use(s, AURA_ID));
    let ended = null;
    for (let i = 0; i < 80 && !ended; i++) {
      const out = ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
      assert.equal(zoneFx(s).length === 0, out.events.some((e) => e.type === "effectEnd"), "it is gone exactly when its end is told");
      if (!zoneFx(s).length) ended = { events: out.events };
    }
    assert.ok(ended, "it ended");
    assert.ok(s.encounter.round >= r0 + 10, `it lasted ten rounds (started in ${r0}, ended in ${s.encounter.round})`);
    assert.ok(s.encounter.round <= r0 + 11);
    const gone = ended.events.find((e) => e.type === "effectEnd");
    assert.equal(gone.name, "Smoulder aura");
    // No zone is left to go off.
    const after = walk(s, 2, 0);
    assert.equal(after.events.filter((e) => e.type === "zone").length, 0);
  });
  using(ON, () => {
    const { s, ids } = field([["Far", 4, 0]]);
    ok(use(s, AURA_ID));
    ok(apply(s, { type: "advanceTime", minutes: 0.9 }, DM));
    assert.equal(zoneFx(s).length, 1, "less than a minute: still there");
    ok(apply(s, { type: "advanceTime", minutes: 1 }, DM));
    assert.equal(zoneFx(s).length, 0, "a minute later: gone");
    assert.equal(saves(walk(s, 2, 0).events, ids.Far), 0);
  });
});

test("the holder ends it: the DM or the owner may, another player may not; then it can be used again, and not before", () => {
  using(ON, () => {
    const { s, ids } = field([["Far", 4, 0]]);
    fight(s); turnOf(s, "hero");
    const cd = s.entities.hero.uses["channel-divinity"];
    ok(use(s, AURA_ID));
    // A second use while it goes on is refused with a sentence, and changes nothing (no use spent, no Bonus Action).
    s.encounter.budget.bonus = 1;
    const before = json(s);
    no(use(s, AURA_ID), /Sir Ember's Smoulder aura is already going: end it first to use it again\./);
    assert.equal(json(s), before, "refused, and nothing was spent");
    assert.equal(s.entities.hero.uses["channel-divinity"], cd - 1);
    const fx = zoneFx(s)[0];
    no(apply(s, { type: "endEffect", effect: fx.id }, KIM), /isn't yours to end/);
    assert.equal(zoneFx(s).length, 1);
    const ended = ok(apply(s, { type: "endEffect", effect: fx.id }, PAT));
    assert.ok(ended.events.some((e) => e.type === "effectEnd" && e.fx === fx.id));
    assert.equal(zoneFx(s).length, 0);
    assert.equal(saves(walk(s, 2, 0).events, ids.Far), 0, "an ended zone does not go off");
    // Used again: a new effect, one more use, and it goes off on a foe that walks in as before.
    ok(use(s, AURA_ID));
    assert.equal(s.entities.hero.uses["channel-divinity"], cd - 2);
    assert.equal(zoneFx(s).length, 1); assert.notEqual(zoneFx(s)[0].id, fx.id);
    // The DM may end it too.
    ok(apply(s, { type: "endEffect", effect: zoneFx(s)[0].id }, DM));
    assert.equal(zoneFx(s).length, 0);
  });
});

test("it ends when its holder drops to 0 Hit Points or dies, and is not brought back by healing", () => {
  using(ON, () => {
    const { s } = field([["Far", 4, 0]]);
    ok(use(s, AURA_ID));
    assert.equal(zoneFx(s).length, 1);
    const down = ok(apply(s, { type: "setHp", actor: "hero", hp: 0 }, DM));
    assert.equal(zoneFx(s).length, 0, "ended with the holder");
    assert.ok(down.events.some((e) => e.type === "effectEnd" && e.name === "Smoulder aura"));
    ok(apply(s, { type: "setHp", actor: "hero", hp: 20 }, DM));
    assert.equal(zoneFx(s).length, 0, "healed back up it does not return");
  });
  using(ON, () => {
    const { s } = field([["Far", 4, 0]]);
    ok(use(s, AURA_ID));
    const died = ok(apply(s, { type: "harm", actor: "hero", amount: 9999 }, DM));
    assert.equal(s.entities.hero.dead, true);
    assert.equal(zoneFx(s).length, 0);
    assert.ok(died.events.some((e) => e.type === "effectEnd"));
  });
});

test("Incapacitated ends it only for an action that says so (as Rage does); another condition that does not stop the holder leaves it", () => {
  using(ON, () => {
    // The Smoulder Aura does not say: a Stunned holder still has it.
    const a = field([["Far", 4, 0]]);
    ok(use(a.s, AURA_ID));
    ok(apply(a.s, { type: "condition", actor: "hero", condition: "stunned", on: true }, DM));
    assert.equal(zoneFx(a.s).length, 1, "a holder that is Incapacitated keeps a zone that does not end then");
    // The Pyre says so.
    const b = field([["Far", 4, 0]]);
    ok(use(b.s, PYRE_ID));
    assert.equal(zoneFx(b.s).length, 1);
    ok(apply(b.s, { type: "condition", actor: "hero", condition: "stunned", on: true }, DM));
    assert.equal(zoneFx(b.s).length, 0, "ended when its holder was Incapacitated");
    // And an unconscious holder loses the first kind too.
    const c = field([["Far", 4, 0]]);
    ok(use(c.s, AURA_ID));
    ok(apply(c.s, { type: "condition", actor: "hero", condition: "unconscious", on: true }, DM));
    assert.equal(zoneFx(c.s).length, 0);
  });
});

test("a rejected use changes nothing: no use, no action, no effect, no event, whatever the reason", () => {
  using(ON, () => {
    const { s } = field([["Far", 4, 0]]);
    fight(s); turnOf(s, "hero");
    const snap = json(s);
    // not the holder's to use
    no(use(s, AURA_ID, {}, KIM), /./);
    assert.equal(json(s), snap);
    // a feature the creature does not have, a use that is spent
    no(use(s, hb("no-such")), /no such feature/);
    s.entities.hero.uses["channel-divinity"] = 0;
    const spent = json(s);
    no(use(s, AURA_ID), /no uses of Channel Divinity left/);
    assert.equal(json(s), spent);
    s.entities.hero.uses["channel-divinity"] = 2;
    // out of Bonus Actions
    s.encounter.budget.bonus = 0;
    const noBonus = json(s);
    no(use(s, AURA_ID), /Bonus Action/i);
    assert.equal(json(s), noBonus);
    assert.equal(zoneFx(s).length, 0);
    // a record whose data skipped the gate: no duration is refused with a sentence, not thrown, nothing changes
    s.encounter.budget.bonus = 1;
    delete feat(s.entities.hero, AURA_ID).action.duration;
    const bare = json(s);
    no(use(s, AURA_ID), /makes an area that lasts, but its data gives no duration, area or effects to lay out/);
    assert.equal(json(s), bare);
  });
});

test("hidden creatures: a zone leaves one it does not reach unseen and untold, and one it does reach is revealed by the save, event for event as a spell zone does", () => {
  // A hidden goblin outside the arena of a fight (the DM's hidden creatures are never in one). The holder walks so that it is 10 feet away.
  const featureGame = (q) => using(ON, () => {
    const { s, ids } = field([["Lurker", q, 0, true]]);
    s.encounter = null;
    ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 3 }, DM));
    turnOf(s, "hero");
    ok(use(s, AURA_ID));
    return { s, lurk: ids.Lurker, who: "hero", out: () => walk(s, 2, 0) };
  });
  const spellGame = (q) => {
    const s = newGame(5);
    for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
    for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
    s.settings.autoEngage = false;
    for (const [id, qq, r] of [["wizard", -5, 3], ["fighter", -6, 3], ["rogue", -4, 4], ["cleric", 0, 0]]) ok(apply(s, { type: "place", actor: id, to: { q: qq, r } }, DM));
    Object.assign(s.entities.cleric, { slots: { 1: 4, 2: 3, 3: 3 }, slotsMax: { 1: 4, 2: 3, 3: 3 }, owner: "pat" });
    s.entities.cleric.spells.push("spirit-guardians");
    const lurk = ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q, r: 0 }, name: "Lurker", hidden: true }, DM)).events[0].id;
    Object.assign(s.entities[lurk], { hp: 300, maxHp: 300 });
    ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 3 }, DM));
    turnOf(s, "cleric");
    ok(apply(s, { type: "cast", actor: "cleric", spell: "spirit-guardians", choice: "radiant" }, DM));
    return { s, lurk, out: () => ok(apply(s, { type: "move", actor: "cleric", to: { q: 2, r: 0 } }, DM)) };
  };
  const account = (g) => {
    assert.equal(g.s.entities[g.lurk].hidden, true);
    const w = g.out(), seen = viewEvents(w.events, g.s, PAT);
    // Whether the save is failed is the dice's; the spell's area is 15 feet and the feature's 10, so the walk is told in one step or two.
    const kinds = (list) => list.map((e) => e.type).filter((x) => x !== "damage" && x !== "moved");
    return { dm: kinds(w.events), player: kinds(seen), named: json(seen).includes(g.lurk), hidden: g.s.entities[g.lurk].hidden === true, saves: saves(w.events, g.lurk) };
  };
  // Reached (4 hexes away, so 2 after the walk): the save is rolled, which reveals it, and the player is told of the save and the reveal and never of the zone.
  const feature = account(featureGame(4)), spell = account(spellGame(4));
  assert.deepEqual(feature, spell, "the same events, to the DM and to the player, as Spirit Guardians gives");
  assert.equal(feature.saves, 1);
  assert.ok(feature.dm.includes("zone") && !feature.player.includes("zone"));
  assert.equal(feature.hidden, false, "a save made it known, as it does for a spell");
  // Not reached (7 hexes away): nothing happens to it, it stays hidden, and the player is told nothing of it.
  const far = account(featureGame(7)), farSpell = account(spellGame(7));
  assert.deepEqual(far, farSpell);
  assert.equal(far.saves, 0); assert.equal(far.named, false); assert.equal(far.hidden, true);
  assert.deepEqual(far.player, []);
});

test("a foe that is a creature of a type the zone limits itself to is left alone, as a spell zone does", () => {
  const typed = oath("oath-t", "Oath of T", [feature("t-aura", 7, AURA({ target: { area: { shape: "emanation", size: 10, types: ["undead"] } } }))]);
  assert.equal(problems(typed), "");
  const p = pack(doc({ subclasses: [typed] }));
  using(overlayOf([p]), () => {
    const sheet = { ...paladin(), subclass: hb("oath-t") };
    const { s, ids } = field([["Goblin", 4, 0]], sheet);
    ok(use(s, hb("t-aura")));
    assert.equal(zoneFx(s)[0].zone.area.types[0], "undead");
    assert.equal(saves(walk(s, 2, 0).events, ids.Goblin), 0, "a goblin is not Undead");
  });
});

test("a fight that ends leaves the zone for the minute it has left, as it does any lasting effect, and the clock then ends it", () => {
  using(ON, () => {
    const { s, ids } = field([["Far", 4, 0]]);
    fight(s); turnOf(s, "hero");
    ok(use(s, AURA_ID));
    ok(apply(s, { type: "endEncounter" }, DM));
    assert.equal(zoneFx(s).length, 1);
    assert.equal(typeof zoneFx(s)[0].until.clock, "number", "its end is now told by the clock");
    assert.equal(saves(walk(s, 2, 0).events, ids.Far), 1, "and it still goes off");
    ok(apply(s, { type: "advanceTime", minutes: 2 }, DM));
    assert.equal(zoneFx(s).length, 0);
  });
});

// ---------- the overlay and replay ----------
test("the overlay removed: the character has no such feature, so there is nothing to use; the overlay back: it is there", () => {
  const s = newGame(5, { party: [{ sheet: { ...paladin(4), subclass: "devotion" } }] });
  let hero;
  using(ON, () => { hero = ok(apply(s, { type: "setSheet", sheet: paladin() }, DM)).events.find((x) => x.type === "spawned").id; });
  assert.ok(feat(s.entities[hero], AURA_ID).action.zone);
  ok(apply(s, { type: "refresh", actor: hero }, DM));
  assert.equal(feat(s.entities[hero], AURA_ID), undefined, "refreshed with the pack away, the zone feature is gone");
  using(ON, () => { ok(apply(s, { type: "refresh", actor: hero }, DM)); });
  assert.ok(feat(s.entities[hero], AURA_ID).action.zone, "and back with it");
});

test("replay: the same actions from the same seed give the same state and the same events, a zone and all", () => {
  const run = () => {
    const out = [];
    using(ON, () => {
      const { s } = field([["Near", 0, 1], ["Far", 4, 0]]);
      fight(s); turnOf(s, "hero");
      out.push(...ok(use(s, AURA_ID)).events, ...walk(s, 2, 0).events);
      for (let i = 0; i < 12; i++) out.push(...ok(apply(s, { type: "endTurn", actor: current(s) }, DM)).events);
      out.push(...ok(apply(s, { type: "endEffect", effect: zoneFx(s)[0].id }, DM)).events);
      out.push(s);
    });
    return out;
  };
  const a = run(), b = run();
  assert.deepEqual(a, b);
  assert.ok(a.filter((e) => e.type === "zone").length >= 2, "the zone went off more than once in the run");
  assert.ok(a.some((e) => e.type === "save"));
});
