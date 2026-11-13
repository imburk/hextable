// What each spell is for (docs/specs/table-ui.md, E12), worked out from its effect steps. The whole list is
// printed (run with --test-reporter=spec, or read the diagnostics) so a person can read it once for mistakes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, SPELLS } from "../src/content/index.js";
import { SPELL_KINDS, spellKinds } from "../src/effects.js";

test("every spell's kinds, listed", (t) => {
  const by = {};
  for (const def of Object.values(CONTENT.spells)) {
    const k = spellKinds(def);
    assert.ok(k.every((x) => SPELL_KINDS.includes(x)), def.id);
    assert.deepEqual(k, SPELL_KINDS.filter((x) => k.includes(x)), "in the fixed order");
    assert.deepEqual(SPELLS[def.id].kinds, k, "spellProfile carries them");
    if (!k.length) assert.ok(def.effects.every((st) => "manual" in st || "save" in st || "attack" in st), `${def.id}: no kind only when the DM applies it`);
    (by[k.join("+") || "(not known: the DM applies it)"] ??= []).push(def.id);
  }
  for (const [k, ids] of Object.entries(by)) t.diagnostic(`${k} (${ids.length}): ${ids.sort().join(" ")}`);
});

test("spell kinds: what a reader would expect of the plain cases", () => {
  const is = (id, kinds) => assert.deepEqual(spellKinds(CONTENT.spells[id]), kinds, id);
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
  is("wish", []);
});
