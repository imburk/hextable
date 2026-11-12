import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, PACKS, SPELLS } from "../src/content/index.js";
import { spells4 } from "../src/content/srd52/spells-4.js";
import { spells5 } from "../src/content/srd52/spells-5.js";
import { spells6 } from "../src/content/srd52/spells-6.js";
import { spells7 } from "../src/content/srd52/spells-7.js";
import { spells8 } from "../src/content/srd52/spells-8.js";
import { spells9 } from "../src/content/srd52/spells-9.js";
import { lintPack } from "../src/content/schema.js";

const [srd] = PACKS;
const lists = [[4, spells4], [5, spells5], [6, spells6], [7, spells7], [8, spells8], [9, spells9]];

// The SRD 5.2.1 spells of levels 4 to 9, by id. The list was built from the class spell lists and
// cross-checked against the spell descriptions (see the pull request).
const EXPECTED = {
  4: ["arcane-eye","aura-of-life","banishment","black-tentacles","blight","charm-monster","compulsion","confusion","conjure-minor-elementals","conjure-woodland-beings","control-water","death-ward","dimension-door","divination","dominate-beast","fabricate","faithful-hound","fire-shield","freedom-of-movement","giant-insect","greater-invisibility","guardian-of-faith","hallucinatory-terrain","ice-storm","locate-creature","phantasmal-killer","polymorph","private-sanctum","resilient-sphere","secret-chest","stone-shape","stoneskin","vitriolic-sphere","wall-of-fire"],
  5: ["animate-objects","antilife-shell","arcane-hand","awaken","cloudkill","commune","commune-with-nature","cone-of-cold","conjure-elemental","contact-other-plane","contagion","creation","dispel-evil-and-good","dominate-person","dream","flame-strike","geas","greater-restoration","hallow","hold-monster","insect-plague","legend-lore","mass-cure-wounds","mislead","modify-memory","passwall","planar-binding","raise-dead","reincarnate","scrying","seeming","summon-dragon","telekinesis","telepathic-bond","teleportation-circle","tree-stride","wall-of-force","wall-of-stone"],
  6: ["blade-barrier","chain-lightning","circle-of-death","conjure-fey","contingency","create-undead","disintegrate","eyebite","find-the-path","flesh-to-stone","forbiddance","freezing-sphere","globe-of-invulnerability","guards-and-wards","harm","heal","heroes-feast","instant-summons","irresistible-dance","magic-jar","mass-suggestion","move-earth","planar-ally","programmed-illusion","sunbeam","transport-via-plants","true-seeing","wall-of-ice","wall-of-thorns","wind-walk","word-of-recall"],
  7: ["arcane-sword","conjure-celestial","delayed-blast-fireball","divine-word","etherealness","finger-of-death","fire-storm","forcecage","magnificent-mansion","mirage-arcane","plane-shift","prismatic-spray","project-image","regenerate","resurrection","reverse-gravity","sequester","simulacrum","symbol","teleport"],
  8: ["animal-shapes","antimagic-field","antipathy-sympathy","befuddlement","clone","control-weather","demiplane","dominate-monster","earthquake","glibness","holy-aura","incendiary-cloud","maze","mind-blank","power-word-stun","sunburst","tsunami"],
  9: ["astral-projection","foresight","gate","imprisonment","mass-heal","meteor-swarm","power-word-heal","power-word-kill","prismatic-wall","shapechange","storm-of-vengeance","time-stop","true-polymorph","true-resurrection","weird","wish"],
};

test("the whole pack, with levels 4 to 9, lints clean", () => {
  assert.deepEqual(lintPack(srd), []);
});

test("spell ids are unique across all files, and every list is in the pack with a profile", () => {
  const ids = srd.spells.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, list] of lists) for (const s of list) {
    assert.equal(CONTENT.spells[s.id], s, `${s.id} is not in the pack`);
    assert.ok(SPELLS[s.id], `${s.id} has no profile`);
  }
});

test("each spells-N file holds only spells of level N, from the SRD 5.2.1", () => {
  for (const [level, list] of lists) for (const s of list) {
    assert.equal(s.level, level, `${s.id} is in the wrong file`);
    assert.equal(s.source, "SRD 5.2.1");
    assert.ok(s.text.length < 600, `${s.id}: text should be a short description`);
  }
});

test("every SRD 5.2.1 spell of levels 4 to 9 is present, and nothing else", () => {
  for (const [level, list] of lists) assert.deepEqual(list.map((s) => s.id).sort(), EXPECTED[level], `level ${level}`);
  assert.equal(lists.reduce((n, [, l]) => n + l.length, 0), 156);
});

test("a manual spell is one manual step for the DM, an assist spell says what the DM does, an auto spell has no manual step", () => {
  for (const [, list] of lists) for (const s of list) {
    if (s.tier === "manual") { assert.equal(s.effects.length, 1, s.id); assert.match(s.effects[0].manual, /DM/, s.id); }
    if (s.tier === "assist") assert.match(s.text, /DM/, s.id);
    if (s.tier === "auto") assert.ok(!JSON.stringify(s.effects).includes("manual"), s.id);
  }
});

test("a Concentration spell is never instant", () => {
  for (const [, list] of lists) for (const s of list) if (s.concentration) assert.notEqual(s.duration, "instant", s.id);
});
