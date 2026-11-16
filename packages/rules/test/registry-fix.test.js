// The registry after the review of #389 (fix round 1): M1 (an id names one entry), L4 (`using` restores exactly), L5 (the
// packs a table may have). The homebrew here is invented for these tests.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, HOMEBREW_LOOKUPS, SPELLS } from "../src/content/index.js";
import { loadPack, overlayOf, PackError, using } from "../src/content/registry.js";

const sp = (pack, name, nm) => ({ id: `hb-${pack}-${name}`, name: nm, source: `homebrew:${pack}`, level: 1, school: "evocation", classes: ["wizard"], time: "action", range: 60, components: ["v", "s"], duration: "instant", concentration: false, ritual: false, target: { creature: { count: 1 } }, effects: [{ save: "dex", half: true, onFail: [{ damage: "1d6", type: "fire" }] }], tier: "auto", checked: false, text: "x" });
const doc = (id, s) => ({ format: "hextable-pack", v: 1, pack: { id, name: id, version: 1, license: "CC0", attribution: "t" }, spells: s ? [s] : [] });
const load = (d) => { const r = loadPack(d); assert.ok(r.ok, r.problems?.join()); return r.pack; };
const TARGETS = [...new Set(Object.values(HOMEBREW_LOOKUPS).flatMap((l) => l.map(([t]) => t)))];
const keys = () => TARGETS.map((t) => Object.keys(t).join("\n"));

test("M1: the review's case, packs a and a-b both owning hb-a-b-x, is refused whatever the order", () => {
  const a = load(doc("a", sp("a", "b-x", "From pack a"))), ab = load(doc("a-b", sp("a-b", "x", "From pack a-b")));
  for (const order of [[a, ab], [ab, a]]) {
    assert.throws(() => overlayOf(order), (e) => e instanceof PackError && /"a" and "a-b" cannot be on one table/.test(e.message) && /hb-a-b-x: is an entry of both/.test(e.problems.join()));
  }
  // A pack id that begins with another's, ember and ember-folk, is refused even with no entry in common.
  assert.throws(() => overlayOf([load(doc("ember", sp("ember", "one", "One"))), load(doc("ember-folk", sp("ember-folk", "two", "Two")))]), /cannot be on one table/);
  // Packs whose ids do not nest are fine, and each keeps its own entry.
  const b = load(doc("b", sp("b", "x", "From b")));
  const ok = overlayOf([a, b]);
  using(ok, () => { assert.equal(CONTENT.spells["hb-a-b-x"].name, "From pack a"); assert.equal(CONTENT.spells["hb-b-x"].name, "From b"); });
});

test("L4: using restores exactly when fn adds a key to a lookup or deletes an overlay entry", () => {
  const ov = overlayOf([load(doc("ember", sp("ember", "one", "One")))]);
  const before = keys();
  assert.throws(() => using(ov, () => { SPELLS.stray = {}; CONTENT.spells["also-stray"] = {}; }), /changed during the call/);
  assert.deepEqual(keys(), before, "the strays are gone");
  assert.ok(!("stray" in SPELLS) && !("also-stray" in CONTENT.spells));
  // A throw from fn with a stray still restores.
  assert.throws(() => using(ov, () => { SPELLS.stray = {}; throw new Error("boom"); }), /boom/);
  assert.deepEqual(keys(), before);
  // fn deleting an overlay entry: no throw from the restore, and the lookups are as they were.
  using(ov, () => { assert.ok(CONTENT.spells["hb-ember-one"]); delete CONTENT.spells["hb-ember-one"]; delete SPELLS["hb-ember-one"]; });
  assert.deepEqual(keys(), before);
  using(ov, () => assert.ok(CONTENT.spells["hb-ember-one"], "and the overlay still works after"));
  assert.deepEqual(keys(), before);
});

test("L5: overlayOf enforces the packs a table may have", () => {
  const five = ["aa", "bb", "cc", "dd", "ee"].map((id) => load(doc(id, sp(id, "s", `S ${id}`))));
  assert.doesNotThrow(() => overlayOf(five.slice(0, 4)));
  assert.throws(() => overlayOf(five), (e) => e instanceof PackError && /a table may have 4 homebrew packs; this would make 5/.test(e.message));
});

test("round 2, L4: a delete plus an add inside fn leaves nothing behind; the lookups come back in their original order", () => {
  const ov = overlayOf([load(doc("ember", sp("ember", "one", "One")))]);
  const before = keys(), fire = CONTENT.spells["fire-bolt"], order = Object.keys(CONTENT.spells).join();
  assert.throws(() => using(ov, () => { delete CONTENT.spells["fire-bolt"]; CONTENT.spells.zzz = {}; }), /changed during the call/);
  assert.equal(CONTENT.spells["fire-bolt"], fire, "the deleted SRD entry is back");
  assert.ok(!("zzz" in CONTENT.spells));
  assert.equal(Object.keys(CONTENT.spells).join(), order, "in the same order");
  assert.deepEqual(keys(), before);
  // A deleted SRD entry alone, and one replaced by another object, are put back too.
  assert.throws(() => using(ov, () => { delete CONTENT.spells["fire-bolt"]; }), /changed during the call/);
  assert.equal(CONTENT.spells["fire-bolt"], fire);
  assert.throws(() => using(ov, () => { CONTENT.spells["fire-bolt"] = { text: "changed" }; }), /changed during the call/);
  assert.equal(CONTENT.spells["fire-bolt"], fire);
  assert.deepEqual(keys(), before);
});
