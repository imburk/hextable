import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, PACKS, SPELLS } from "../src/content/index.js";
import { spells0 } from "../src/content/srd52/spells-0.js";
import { spells1 } from "../src/content/srd52/spells-1.js";
import { spells2 } from "../src/content/srd52/spells-2.js";
import { spells3 } from "../src/content/srd52/spells-3.js";
import { lintPack } from "../src/content/schema.js";

const [srd] = PACKS;
const lists = [[0, spells0], [1, spells1], [2, spells2], [3, spells3]];

test("every entered spell list lints clean with the rest of the pack", () => {
  assert.deepEqual(lintPack(srd), []);
});

test("spell ids are unique across all files, and every list is in the pack", () => {
  const ids = srd.spells.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, list] of lists) for (const s of list) assert.equal(CONTENT.spells[s.id], s, `${s.id} is not in the pack`);
  for (const s of srd.spells) assert.ok(SPELLS[s.id], `${s.id} has no profile`);
});

test("each spells-N file holds only spells of level N, from the SRD 5.2.1", () => {
  for (const [level, list] of lists) for (const s of list) {
    assert.equal(s.level, level, `${s.id} is in the wrong file`);
    assert.equal(s.source, "SRD 5.2.1");
    assert.ok(s.text.length < 600, `${s.id}: text should be a short description`);
  }
});

test("a manual spell has exactly its manual step, and an assist spell says what it leaves to the DM", () => {
  for (const [, list] of lists) for (const s of list) {
    if (s.tier === "manual") assert.equal(s.effects.length, 1, s.id);
    if (s.tier === "assist") assert.match(s.text, /DM/, `${s.id}: an assist spell's text must say what the DM does`);
  }
});

test("all SRD 5.2.1 cantrips are present (Fire Bolt and Sacred Flame live in spells.js)", () => {
  const expected = ["acid-splash", "chill-touch", "dancing-lights", "druidcraft", "eldritch-blast", "elementalism", "fire-bolt", "guidance", "light", "mage-hand",
    "mending", "message", "minor-illusion", "poison-spray", "prestidigitation", "produce-flame", "ray-of-frost", "resistance", "sacred-flame", "shillelagh",
    "shocking-grasp", "sorcerous-burst", "spare-the-dying", "starry-wisp", "thaumaturgy", "true-strike", "vicious-mockery"];
  const have = srd.spells.filter((s) => s.level === 0).map((s) => s.id).sort();
  assert.deepEqual(have, expected);
});

test("all SRD 5.2.1 1st-level spells are present (five live in spells.js)", () => {
  const expected = ["alarm", "animal-friendship", "bane", "bless", "burning-hands", "charm-person", "chromatic-orb", "color-spray", "command", "comprehend-languages",
    "create-or-destroy-water", "cure-wounds", "detect-evil-and-good", "detect-magic", "detect-poison-and-disease", "disguise-self", "dissonant-whispers", "divine-favor",
    "divine-smite", "ensnaring-strike", "entangle", "expeditious-retreat", "faerie-fire", "false-life", "feather-fall", "find-familiar", "fog-cloud", "floating-disk",
    "goodberry", "grease", "guiding-bolt", "healing-word", "hellish-rebuke", "heroism", "hex", "hideous-laughter", "hunters-mark", "ice-knife", "identify",
    "illusory-script", "inflict-wounds", "jump", "longstrider", "mage-armor", "magic-missile", "protection-from-evil-and-good", "purify-food-and-drink", "ray-of-sickness",
    "sanctuary", "searing-smite", "shield", "shield-of-faith", "silent-image", "sleep", "speak-with-animals", "thunderwave", "unseen-servant"];
  assert.deepEqual(srd.spells.filter((s) => s.level === 1).map((s) => s.id).sort(), expected.sort());
});

// The names below were collected from the SRD 5.2.1 spell descriptions (every "Level 2 ..." and "Level 3 ..." heading, 57 and 42 of them)
// and checked against the class spell lists.
test("all SRD 5.2.1 2nd-level spells are present", () => {
  const expected = [
    "acid-arrow", "aid", "alter-self", "animal-messenger", "arcane-lock", "arcanists-magic-aura", "augury", "barkskin", "blindness-deafness", "blur",
    "calm-emotions", "continual-flame", "darkness", "darkvision", "detect-thoughts", "dragons-breath", "enhance-ability", "enlarge-reduce",
    "enthrall", "find-steed", "find-traps", "flame-blade", "flaming-sphere", "gentle-repose", "gust-of-wind", "heat-metal", "hold-person",
    "invisibility", "knock", "lesser-restoration", "levitate", "locate-animals-or-plants", "locate-object", "magic-mouth", "magic-weapon",
    "mind-spike", "mirror-image", "misty-step", "moonbeam", "pass-without-trace", "phantasmal-force", "prayer-of-healing", "protection-from-poison",
    "ray-of-enfeeblement", "rope-trick", "scorching-ray", "see-invisibility", "shatter", "shining-smite", "silence", "spider-climb", "spike-growth",
    "spiritual-weapon", "suggestion", "warding-bond", "web", "zone-of-truth",
  ];
  assert.equal(expected.length, 57);
  assert.deepEqual(srd.spells.filter((s) => s.level === 2).map((s) => s.id).sort(), expected.sort());
});

test("all SRD 5.2.1 3rd-level spells are present", () => {
  const expected = [
    "animate-dead", "beacon-of-hope", "bestow-curse", "blink", "call-lightning", "clairvoyance", "conjure-animals", "counterspell",
    "create-food-and-water", "daylight", "dispel-magic", "fear", "fireball", "fly", "gaseous-form", "glyph-of-warding", "haste", "hypnotic-pattern",
    "lightning-bolt", "magic-circle", "major-image", "mass-healing-word", "meld-into-stone", "nondetection", "phantom-steed", "plant-growth",
    "protection-from-energy", "remove-curse", "revivify", "sending", "sleet-storm", "slow", "speak-with-dead", "speak-with-plants",
    "spirit-guardians", "stinking-cloud", "tiny-hut", "tongues", "vampiric-touch", "water-breathing", "water-walk", "wind-wall",
  ];
  assert.equal(expected.length, 42);
  assert.deepEqual(srd.spells.filter((s) => s.level === 3).map((s) => s.id).sort(), expected.sort());
});

test("2nd and 3rd-level spells: only the vocabulary, and an honest tier", () => {
  for (const s of [...spells2, ...spells3]) {
    assert.ok(s.classes.length > 0, s.id);
    assert.ok(Object.keys(s.target).length === 1, s.id);
    if (s.tier === "auto") assert.ok(!JSON.stringify(s.effects).includes("manual"), s.id);
    if (s.tier === "assist") assert.ok(s.effects.some((x) => !("manual" in x)), `${s.id}: an assist spell needs at least one real step`);
  }
});

test("the automated parts of 2nd and 3rd-level spells run in a fight", async () => {
  const { apply, current } = await import("../src/engine.js");
  const { newGame } = await import("../src/scenario.js");
  const DM = { role: "dm", userId: "dm" };
  const aimedAtFoe = ["acid-arrow", "blindness-deafness", "hold-person", "mind-spike", "scorching-ray", "suggestion", "vampiric-touch", "moonbeam", "shatter", "call-lightning", "fireball", "fear"];
  for (const id of aimedAtFoe) {
    const s = newGame(5);
    for (const k of Object.keys(s.entities)) if (s.entities[k].side !== "party") delete s.entities[k];
    for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
    apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
    apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM);
    const foe = s.entities[apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 } }, DM).events[0].id];
    Object.assign(foe, { hp: 500, maxHp: 500 });
    Object.assign(s.entities.wizard, { slots: { 3: 9, 4: 9 }, slotsMax: { 3: 9, 4: 9 }, hp: 200, maxHp: 200 });
    s.entities.wizard.spells.push(id);
    assert.ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM).ok);
    for (let i = 0; i < 40 && current(s) !== "wizard"; i++) apply(s, { type: "endTurn", actor: current(s) }, DM);
    const aim = SPELLS[id].aim;
    const r = apply(s, { type: "cast", actor: "wizard", spell: id, slot: 4, ...(aim === "creature" ? { target: foe.id } : { hex: { q: 1, r: 0 } }) }, DM);
    assert.ok(r.ok, `${id}: ${r.error}`);
    assert.ok(r.events.some((e) => e.type === "cast"), id);
  }
});
