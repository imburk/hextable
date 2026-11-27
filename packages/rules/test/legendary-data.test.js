// Legendary actions and Legendary Resistance, stage L1a (docs/specs/legendary.md, Decisions 1 and 2): the `legendary` key of a monster,
// its lint (the SRD's and a homebrew pack's), the seven SRD blocks, and the state a creature made from one starts with.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTENT, PACKS } from "../src/content/index.js";
import { makeEntity } from "../src/engine/sheets.js";
import { MONSTERS } from "../src/content/index.js";
import { apply } from "../src/engine.js";
import { migrate, VERSION } from "../src/migrate.js";
import { newGame } from "../src/scenario.js";
import { readEntry } from "../src/content/reader.js";
import { HOMEBREW_LENGTHS, HOMEBREW_RANGES, LEGENDARY_AGAIN, LEGENDARY_LIMITS, LEGENDARY_SPEEDS, lintEntry, lintBaked } from "../src/content/schema.js";

const SRD = PACKS[0].monsters;
const P = "x", SRC = "homebrew:x";
const strict = (e) => lintEntry("monsters", e, { pack: P, srd: CONTENT });
// A monster with a block, made homebrew: the Adult Green Dragon given the block of its stat block (spec Decision 1), which has every part.
const BLOCK = {
  actions: { uses: 3, options: [
    { id: "mind-invasion", name: "Mind Invasion", manual: "Uses Spellcasting to cast Mind Spike (level 3 version).", text: "Casts Mind Spike (level 3 version) with its Spellcasting." },
    { id: "noxious-miasma", name: "Noxious Miasma", again: "nextTurn", target: { area: { shape: "sphere", size: 20, range: 90 } },
      effects: [{ save: "con", dc: 17, half: false, onFail: [{ damage: "2d6", type: "poison" }, { modifier: { on: "ac", op: "add", value: -2 }, ends: { on: "turnEnd" } }] }],
      text: "A 20-foot sphere within 90 feet: Constitution save or poison damage and -2 AC until the end of the target's next turn. Not again before its next turn." },
    { id: "pounce", name: "Pounce", move: { speed: "half" }, use: ["rend"], text: "Moves up to half its Speed, then makes one Rend attack." },
  ] },
  resistance: { day: 3 },
  lair: { uses: 4, resistance: 4, xp: 15000 },
};
const green = (mend = () => {}) => {
  const m = { ...structuredClone(CONTENT.monsters["adult-green-dragon"]), id: "hb-x-green", source: SRC, checked: false, name: "Zz Green", legendary: structuredClone(BLOCK) };
  mend(m.legendary, m);
  return m;
};
const refused = (mend, re) => { const p = strict(green(mend)); assert.ok(p.length, "refused"); assert.match(p.join("\n"), re); };

test("the vocabulary: the limits, the words and the ranges", () => {
  assert.deepEqual(LEGENDARY_AGAIN, ["nextTurn"]);
  assert.deepEqual(LEGENDARY_SPEEDS, ["half", "full"]);
  assert.deepEqual({ ...LEGENDARY_LIMITS }, { uses: 5, options: 8, cost: 3, use: 3, resistance: 10, text: 400 });
  assert.equal(HOMEBREW_LENGTHS["legendary.options"], 8);
  assert.deepEqual(HOMEBREW_RANGES["resistance.day"], [1, 10]);
});

test("a block with every part, in a homebrew pack, is accepted", () => {
  assert.deepEqual(strict(green()), []);
  assert.deepEqual(strict(green((l) => { l.actions.options[0].cost = 2; })), [], "cost is for a pack's older blocks");
  assert.deepEqual(strict(green((l) => { delete l.actions; delete l.lair; })), [], "Legendary Resistance alone");
});

test("a bad block is refused", () => {
  refused((l) => { l.actions.uses = 6; }, /legendary\.actions\.uses: 6 is not allowed; a whole number from 1 to 5/);
  refused((l) => { l.actions.uses = 0; }, /uses: 0 is not allowed; a whole number from 1 to 5/);
  refused((l) => { l.resistance.day = 11; }, /resistance\.day: 11 is not allowed/);
  refused((l) => { l.resistance = { day: 2, more: 1 }; }, /"more" is not something Legendary Resistance has/);
  refused((l) => { l.nope = {}; }, /"nope" is not something a legendary block has|is \{ actions\?, resistance\?, lair\? \}/);
  refused((l) => { l.actions.options = []; }, /options is a list of 1 to 8/);
  refused((l) => { l.actions.options = Array.from({ length: 9 }, (_, i) => ({ id: `o${i}`, name: "O", text: "x", manual: "x" })); }, /a list of 9; the most is 8|options is a list of 1 to 8/);
  refused((l) => { l.actions.options[2].use = ["multiattack"]; }, /a Multiattack: an option makes one attack/);
  refused((l) => { l.actions.options[2].use = ["nothing"]; }, /not an action of this monster/);
  refused((l) => { l.actions.options[2].use = ["rend", "rend"]; }, /different ids/);
  refused((l) => { l.actions.options[2].use = ["rend", "poison-breath", "multiattack", "x"]; }, /a list of 4; the most is 3/);
  refused((l) => { l.actions.options[2].effects = []; }, /use or effects, not both/);
  refused((l) => { l.actions.options[0] = { id: "idle", name: "Idle", text: "x", move: { speed: "half" } }; }, /does nothing/);
  refused((l) => { l.actions.options[0].again = "never"; }, /again is "nextTurn"/);
  refused((l) => { l.actions.options[0].cost = 4; }, /cost: 4 is not allowed; a whole number from 1 to 3/);
  refused((l) => { l.actions.options[0].cost = 3; l.actions.uses = 2; }, /no more than the uses/);
  refused((l) => { l.actions.options[2].move.speed = "fast"; }, /move\.speed is "half" or "full"/);
  refused((l) => { l.actions.options[2].move.mode = "fly"; delete l.actions.options[2].move.speed; }, /move\.speed/);
  refused((l, m) => { l.actions.options[2].move.mode = "burrow"; }, /a way of moving the monster has/);
  refused((l) => { l.actions.options[2].move.provokes = true; }, /provokes is false/);
  refused((l) => { l.actions.options[2].bogus = 1; }, /"bogus" is not something a legendary action has/);
  refused((l) => { l.actions.options[1].id = "mind-invasion"; }, /duplicate option id/);
  refused((l) => { l.actions.options[0].id = "Not Kebab"; }, /id must be a kebab-case name/);
  refused((l) => { l.actions.options[0].text = "x".repeat(401); }, /at most 400 letters/);
  refused((l) => { delete l.actions.options[0].text; }, /needs text/);
  refused((l) => { l.actions.options[1].effects = [{ damage: "1d6" }]; }, /unknown damage type/);
  refused((l) => { l.actions.options[1].target = { area: { shape: "blob", size: 5 } }; }, /unknown area shape/);
  refused((l) => { l.lair.uses = 2; }, /lair uses is a whole number, at least/);
  refused((l) => { l.lair.resistance = 2; }, /lair resistance is a whole number, at least/);
  refused((l) => { l.lair.xp = 100; }, /lair xp is a whole number, at least its plain xp/);
  refused((l) => { l.lair = {}; }, /lair is \{ uses\?, resistance\?, xp\? \}/);
  refused((l) => { delete l.actions; }, /lair uses/);
  refused((l) => { l.lair.xp = 100001; }, /lair\.xp: 100001 is not allowed/);
});

test("a block is not for a baked summon block's lint to trip on, and an entry with none lints as before", () => {
  assert.deepEqual(lintBaked({ ...structuredClone(CONTENT.monsters.goblin), cr: null, xp: 0 }).filter((p) => /legendary/.test(p)), []);
  assert.deepEqual(strict({ ...structuredClone(CONTENT.monsters["goblin-warrior"]), id: "hb-x-gob", source: SRC, checked: false, name: "Zz Gob" }), []);
});

test("the reader says a block in plain words, and a bad one with a problem", () => {
  const r = readEntry("monster", green());
  const text = r.lines.join("\n");
  assert.deepEqual(r.problems, []);
  assert.match(text, /Legendary actions, 3 uses a round: "Mind Invasion", "Noxious Miasma" and "Pounce"\./);
  assert.match(text, /Legendary action "Pounce": costs 1 use\./);
  assert.match(text, /It first moves up to half its Speed\./);
  assert.match(text, /Each creature in a 20-foot sphere makes a Constitution saving throw against DC 17\./);
  assert.match(text, /It cannot take this one again until the start of its next turn\./);
  assert.match(text, /All of it is the DM's: "Uses Spellcasting to cast Mind Spike/);
  assert.match(text, /Legendary Resistance, 3 a day: when it fails a saving throw it can choose to succeed instead\./);
  assert.match(text, /In its lair the numbers are: 4 legendary action uses, Legendary Resistance 4 a day, 15000 XP when defeated\./);
  assert.ok(r.doesNot.some((x) => /Legendary Resistance: the choice/.test(x)), "the DM is told what the engine does not do yet");
  for (const n of ["legendary.actions.uses", "legendary.resistance.day", "legendary.lair.xp", "legendary.actions.options.1.effects.0.dc", "legendary.actions.options.1.target.area.range"]) assert.ok(r.numbers.some((x) => x.at === n), n);
  const bad = green((l) => { l.actions.options[2].use = ["multiattack"]; l.actions.options.push({ id: "idle", name: "Idle", text: "x" }); });
  assert.match(readEntry("monster", bad).problems.join("\n"), /names a Multiattack, which an option never uses/);
  assert.match(readEntry("monster", bad).problems.join("\n"), /the option does nothing/);
  assert.match(readEntry("monster", green((l) => { l.nope = 1; })).problems.join("\n"), /has a key "nope" the engine does not use/);
});

test("the seven SRD blocks are entered, checked and lint clean; no other monster has one yet", () => {
  const have = SRD.filter((m) => m.legendary).map((m) => m.id).sort();
  assert.deepEqual(have, ["adult-blue-dragon", "adult-green-dragon", "balor", "lich", "pit-fiend", "unicorn", "vampire"]);
  for (const m of SRD.filter((x) => x.legendary)) assert.equal(m.checked, true, m.id);
  // The numbers, as the SRD 5.2.1 stat blocks print them.
  const L = (id) => CONTENT.monsters[id].legendary;
  assert.deepEqual(L("balor"), { resistance: { day: 3 } });
  assert.deepEqual(L("pit-fiend"), { resistance: { day: 4 } });
  assert.deepEqual([L("unicorn").actions.uses, L("unicorn").resistance.day, L("unicorn").lair], [3, 3, undefined]);
  assert.deepEqual(L("vampire").lair, { uses: 4, resistance: 4, xp: 11500 });
  assert.deepEqual(L("lich").lair, { uses: 4, resistance: 5, xp: 41000 });
  assert.deepEqual(L("adult-green-dragon").lair, { uses: 4, resistance: 4, xp: 15000 });
  assert.deepEqual(L("adult-blue-dragon").lair, { uses: 4, resistance: 4, xp: 18000 });
  assert.deepEqual(L("lich").actions.options.map((o) => o.id), ["deathly-teleport", "disrupt-life", "frightening-gaze"]);
  assert.equal(L("adult-green-dragon").actions.options[1].effects[0].dc, 17);
});

test("a creature made from a monster with a block carries it, and its counters start at nothing spent", () => {
  const e = makeEntity(MONSTERS["adult-green-dragon"], { id: "d1", name: "Dragon", tpl: "adult-green-dragon", side: "foe", pos: { x: 0, y: 0 } });
  assert.deepEqual(e.legendary, CONTENT.monsters["adult-green-dragon"].legendary);
  assert.deepEqual(e.legend, { acts: 0, resisted: 0, again: {}, lair: false, show: false });
  e.legendary.resistance.day = 99;
  assert.equal(CONTENT.monsters["adult-green-dragon"].legendary.resistance.day, 3, "the creature has its own copy");
  const gob = makeEntity(MONSTERS["goblin-warrior"], { id: "g1", name: "Goblin", tpl: "goblin-warrior", side: "foe", pos: { x: 0, y: 0 } });
  assert.equal("legendary" in gob, false);
  assert.equal("legend" in gob, false, "a creature with no block has no counters");
});

const DM = { role: "dm", userId: "dm" };
test("an old save migrates: an SRD monster gets its template's block and a fresh counter record; the rest is left alone", () => {
  assert.equal(VERSION, 32);
  const s = newGame(1);
  const spawn = (monster) => {
    // The first free hex of a row: a creature cannot be put where another stands.
    for (let q = 3; q < 12; q++) if (apply(s, { type: "spawn", monster, at: { q, r: 3 } }, DM).ok) return Object.keys(s.entities).find((k) => s.entities[k].tpl === monster);
    assert.fail("no free hex");
  };
  const dragon = spawn("adult-green-dragon"), gob = spawn("goblin-warrior"), pit = spawn("pit-fiend");
  assert.ok(s.entities[dragon].legendary && s.entities[dragon].legend, "a creature made now has them");
  // The save as version 31 wrote it: none of the two fields, on any creature.
  const old = structuredClone(s);
  for (const e of Object.values(old.entities)) { delete e.legendary; delete e.legend; }
  old.version = 31;
  const saved = structuredClone(old);          // migrate works in place
  const m = migrate(old);
  assert.equal(m.version, 32);
  assert.deepEqual(m.entities[dragon].legendary, CONTENT.monsters["adult-green-dragon"].legendary);
  assert.deepEqual(m.entities[dragon].legend, { acts: 0, resisted: 0, again: {}, lair: false, show: false });
  assert.deepEqual(m.entities[pit].legendary, { resistance: { day: 4 } });
  assert.equal("legendary" in m.entities[gob], false);
  assert.equal("legend" in m.entities[gob], false);
  assert.equal("legendary" in m.entities.fighter, false, "a character has none");
  // It keeps what it has spent, and its own copy of the block; running it again changes nothing.
  m.entities[dragon].legend.resisted = 2; m.entities[dragon].legendary.resistance.day = 5;
  const again = migrate(structuredClone(m));
  assert.deepEqual(again, m);
  // A creature with no template (or a homebrew one) is left as it was.
  const odd = structuredClone(saved); odd.entities[dragon].tpl = "hb-gone-dragon"; delete odd.entities[dragon].legendary;
  assert.equal("legendary" in migrate(odd).entities[dragon], false);
  // A creature parked in another place is brought up too.
  const w = structuredClone(saved); w.parked = { elsewhere: { map: structuredClone(saved.map), entities: { d: structuredClone(saved.entities[dragon]) }, effects: [], since: 0 } };
  assert.deepEqual(migrate(w).parked.elsewhere.entities.d.legendary, CONTENT.monsters["adult-green-dragon"].legendary);
});
