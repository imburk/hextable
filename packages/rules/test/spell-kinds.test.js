// What each spell is for (docs/specs/table-ui.md, E12): its own `kinds`, tagged by hand from the SRD text
// (E12, amended 15 November 2026), or else worked out from its effect steps. The whole list is printed (run
// with --test-reporter=spec, or read the diagnostics) so a person can read it once for mistakes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, SPELLS } from "../src/content/index.js";
import { SPELL_KINDS, derivedKinds, spellKinds, spellProfile } from "../src/effects.js";
import { SPELL_KINDS as SCHEMA_KINDS, lintPack } from "../src/content/schema.js";

const PACK = { id: "test", name: "t", license: "x", attribution: "x" };
const fireball = () => structuredClone(CONTENT.spells.fireball);

test("every spell's kinds, listed", (t) => {
  const by = {}, tagged = [];
  for (const def of Object.values(CONTENT.spells)) {
    const k = spellKinds(def);
    assert.ok(k.every((x) => SPELL_KINDS.includes(x)), def.id);
    assert.deepEqual(k, SPELL_KINDS.filter((x) => k.includes(x)), "in the fixed order");
    assert.deepEqual(SPELLS[def.id].kinds, k, "spellProfile carries them");
    assert.ok(k.length >= 1, `${def.id}: every SRD spell has at least one kind (tag it by hand from its SRD text)`);
    if (def.kinds) tagged.push(def.id);
    (by[k.join("+")] ??= []).push(def.kinds ? `${def.id}*` : def.id);
  }
  for (const [k, ids] of Object.entries(by)) t.diagnostic(`${k} (${ids.length}): ${ids.sort().join(" ")}`);
  t.diagnostic(`* tagged by hand: ${tagged.length} of ${Object.keys(CONTENT.spells).length}`);
});

test("a spell that derives no kind carries its own tag", () => {
  for (const def of Object.values(CONTENT.spells)) {
    if (!derivedKinds(def).length) assert.ok(Array.isArray(def.kinds), `${def.id}: its steps say nothing of what it is for, so it needs \`kinds\``);
  }
});

test("spell kinds: what a reader would expect of the plain cases", () => {
  const is = (id, kinds, why = "") => assert.deepEqual(spellKinds(CONTENT.spells[id]), kinds, `${id} ${why}`);
  is("fireball", ["damage"]);
  is("cure-wounds", ["healing"]);
  is("healing-word", ["healing"]);
  is("lesser-restoration", ["healing"]);
  is("hold-person", ["control"]);
  is("bane", ["control"]);
  is("web", ["control"]);
  is("counterspell", ["control"]);
  is("bless", ["utility"]);
  is("shield-of-faith", ["utility"]);
  is("misty-step", ["utility"]);
  is("invisibility", ["utility"]);
  is("ray-of-frost", ["damage", "control"]);
  is("thunderwave", ["damage", "control"]);
  is("hunters-mark", ["damage"]);
  is("dimension-door", ["utility"]);
  // Tagged by hand from the SRD text (E12, amended).
  is("wish", ["damage", "healing", "control", "utility"]);
  is("mending", ["utility"]);
  is("revivify", ["healing"]);
  is("command", ["control"]);
  is("spiritual-weapon", ["damage"]);
  is("wall-of-fire", ["damage", "control"]);
  is("conjure-celestial", ["damage", "healing"]);
  is("vampiric-touch", ["damage", "healing"], "derives damage only: the healing is the DM's");
  is("contact-other-plane", ["utility"], "derives damage, which falls on the caster");
});

test("the derivation is unchanged for an untagged spell; `wish` derives nothing", () => {
  // The cases above derive their kinds from steps (none of them is tagged), so the derivation is what it was.
  for (const id of ["fireball", "cure-wounds", "hold-person", "bless", "ray-of-frost", "hunters-mark"]) {
    assert.equal(CONTENT.spells[id].kinds, undefined, `${id} is not tagged`);
    assert.deepEqual(spellKinds(CONTENT.spells[id]), derivedKinds(CONTENT.spells[id]), id);
  }
  assert.deepEqual(derivedKinds(CONTENT.spells.wish), []);
  const { kinds, ...untagged } = CONTENT.spells.wish;
  assert.ok(kinds?.length, "wish is tagged by hand");
  assert.deepEqual(spellKinds(untagged), [], "untagged, a manual spell still derives no kind (homebrew can have none)");
});

test("a spell's own tag wins over the derivation", () => {
  const def = { ...fireball(), kinds: ["utility"] };
  assert.deepEqual(derivedKinds(def), ["damage"]);
  assert.deepEqual(spellKinds(def), ["utility"]);
  assert.deepEqual(spellProfile(def).kinds, ["utility"], "sp.kinds keeps its shape: a list in the fixed order");
  assert.deepEqual(spellKinds({ ...fireball(), kinds: ["damage", "control"] }), ["damage", "control"]);
});

test("schema.js holds the list, effects.js re-uses it", () => {
  assert.equal(SPELL_KINDS, SCHEMA_KINDS);
  assert.deepEqual(SCHEMA_KINDS, ["damage", "healing", "control", "utility"]);
});

test("the linter refuses a bad `kinds` and takes a good one", () => {
  const lint = (kinds) => lintPack({ pack: PACK, spells: [{ ...fireball(), kinds }] });
  for (const good of [["damage"], ["utility"], ["damage", "control"], ["damage", "healing", "control", "utility"]]) {
    assert.deepEqual(lint(good), [], good.join("+"));
  }
  assert.deepEqual(lintPack({ pack: PACK, spells: [fireball()] }), [], "the field is optional");
  for (const bad of [[], ["fire"], ["damage", "damage"], ["control", "damage"], ["utility", "healing"], "damage", ["Damage"],
    ["damage", "healing", "control", "utility", "utility"], [null], { damage: true }, null]) {
    assert.ok(lint(bad).some((p) => /`kinds` is a list/.test(p)), `refused: ${JSON.stringify(bad)}`);
  }
});

test("every tag in the pack is a list the linter takes", () => {
  const spells = Object.values(CONTENT.spells).filter((d) => d.kinds);
  assert.ok(spells.length >= 211, "the spells the steps cannot place, and a few where the steps tell only part");
  for (const def of spells) assert.deepEqual(lintPack({ pack: PACK, spells: [def] }).filter((p) => /kinds/.test(p)), [], def.id);
});
