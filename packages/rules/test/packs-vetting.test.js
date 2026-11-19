// What decides whether a homebrew pack may join, change or leave a table, and what a player is sent of one: moved from the server
// into content/packs.js (#428). The server's own tests (packages/server/test/packs.test.js) still pin the messages; these pin the
// functions, with plain data and no table.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT } from "../src/content/index.js";
import { cleanPacks, forPlayers, hashOf, inUse, packForPlayer, PLAYER_PACK_KINDS, usesIn, vetAdd, vetPacks, vetUpdate } from "../src/content/packs.js";
import { installed } from "../src/content/registry.js";

const spell = (pack, name, over = {}) => ({
  id: `hb-${pack}-${name}`, name: "Cinder Lash", source: `homebrew:${pack}`, level: 1, school: "evocation", classes: ["wizard"], time: "action", range: 60,
  components: ["v", "s"], duration: "instant", concentration: false, ritual: false, target: { creature: { count: 1 } },
  effects: [{ save: "dex", half: true, onFail: [{ damage: "3d6", type: "fire" }] }], tier: "auto", checked: false, text: "A lash of embers.", ...over,
});
const monster = (pack, name, over = {}) => ({ ...structuredClone(CONTENT.monsters["goblin-warrior"]), id: `hb-${pack}-${name}`, name: "Zorblax Quillwraith", source: `homebrew:${pack}`, checked: false, text: "Gazeblight spoor", ...over });
const doc = (id, lists = {}, version = 1) => ({ format: "hextable-pack", v: 1, pack: { id, name: `The ${id} pack`, version, license: "CC0, by the author", attribution: "Written for a test." }, ...lists });
const EMBER = (version = 1, more = []) => doc("ember-folk", { spells: [spell("ember-folk", "cinder-lash"), ...more], monsters: [monster("ember-folk", "quillwraith")] }, version);
const FROST = (version = 1) => doc("frost-kin", { spells: [spell("frost-kin", "rime-bolt", { effects: [{ attack: "ranged", kind: "spell", onHit: [{ damage: "2d8", type: "cold" }] }] })] }, version);
const callWraith = (pack, summon) => spell(pack, "call-wraith", { target: { self: true }, effects: [{ summon, bond: { kind: "summon", turn: "after", orders: "free", at0: "vanish" } }] });
const record = (data) => ({ id: data.pack.id, version: data.pack.version, hash: hashOf(data), data });

// ---------- forPlayers ----------
test("forPlayers: never monsters, never dmNotes at any depth, and the hash is of the filtered copy", () => {
  const data = EMBER();
  data.spells[0].dmNotes = "Secret plan";
  data.spells[0].effects[0].onFail[0].dmNotes = "deeper secret";
  data.items = [{ id: "hb-ember-folk-bead", name: "Bead", dmNotes: "cursed" }];
  const f = forPlayers(data);
  assert.deepEqual(Object.keys(f.data).sort(), ["armour", "feats", "id", "items", "name", "objects", "spells", "subclasses", "version", "weapons"]);
  assert.equal(f.data.monsters, undefined);
  const text = JSON.stringify(f.data);
  assert.ok(!text.includes("dmNotes") && !text.includes("Secret plan") && !text.includes("Quillwraith") && !text.includes("Gazeblight"));
  assert.equal(f.hash, hashOf(f.data));
  assert.notEqual(f.hash, hashOf(data), "the whole pack's hash is never a player's");
  assert.deepEqual(f.data, packForPlayer(data));
  assert.equal(data.spells[0].dmNotes, "Secret plan", "the pack itself is not changed");
  assert.deepEqual(PLAYER_PACK_KINDS, ["spells", "items", "feats", "weapons", "armour", "objects", "subclasses"]);
});

test("forPlayers: a pack without a version is sent as version 1", () => {
  const d = EMBER(); delete d.pack.version;
  assert.equal(forPlayers(d).data.version, 1);
});

// ---------- a homebrew spell that summons a homebrew creature (allowed, #457; it was refused under #400) ----------
test("a pack whose homebrew spell summons a homebrew creature, or names one as a form, is no longer refused", () => {
  const imp = doc("imp-folk", { spells: [callWraith("imp-folk", "hb-imp-folk-imp")], monsters: [monster("imp-folk", "imp")] });
  const v = vetAdd([], imp);
  assert.deepEqual([v.ok, v.problems], [true, []], v.problems.join("; "));
  assert.equal(vetUpdate([record(imp)], { ...structuredClone(imp), pack: { ...imp.pack, version: 2 } }).ok, true);
  assert.equal(vetPacks([record(imp)]).ok, true);
  const forms = doc("imp-folk", { spells: [spell("imp-folk", "call-owl", { target: { self: true }, effects: [{ summon: "form", forms: ["hb-imp-folk-imp"], bond: { kind: "summon", turn: "after", orders: "free", at0: "vanish" } }] })], monsters: [monster("imp-folk", "imp")] });
  const f = vetAdd([], forms);
  assert.equal(f.ok, true, f.problems.join("; "));
});

test("what a player is sent of such a pack is still no monster: the creature's block is not in the pack copy", () => {
  const imp = doc("imp-folk", { spells: [callWraith("imp-folk", "hb-imp-folk-imp")], monsters: [monster("imp-folk", "imp")] });
  const f = forPlayers(imp);
  assert.equal("monsters" in f.data, false);
  assert.equal(JSON.stringify(f.data).includes("Zorblax Quillwraith"), false);
  assert.deepEqual(f.data.spells.map((x) => x.id), ["hb-imp-folk-call-wraith"], "the spell is sent, naming the creature by id as any spell names what it summons");
  assert.equal(f.hash, hashOf(f.data));
});

// ---------- vetAdd / vetUpdate ----------
test("vetAdd: a clean pack passes with its hash and the record to store; nothing is stored or installed", () => {
  const d = EMBER();
  const v = vetAdd([], d);
  assert.equal(v.ok, true);
  assert.deepEqual(v.problems, []);
  assert.equal(v.hash, hashOf(d));
  assert.deepEqual(v.record, { id: "ember-folk", version: 1, hash: hashOf(d), data: d });
  assert.equal(v.pack.id, "ember-folk");
  assert.equal(installed(), null);
});

test("vetAdd: an id already on the table is refused in the server's sentence", () => {
  const v = vetAdd([record(EMBER())], EMBER(2));
  assert.deepEqual([v.ok, v.form], [false, "error"]);
  assert.deepEqual(v.problems, ['The pack "ember-folk" is already on this table (version 1). To change it, update it with a higher version.']);
});

test("vetUpdate: missing, equal and lower versions are refused; a higher one passes", () => {
  const v0 = vetUpdate([], EMBER(2));
  assert.deepEqual(v0.problems, ['The pack "ember-folk" is not on this table. Add it first.']);
  const have = [record(EMBER(3))];
  for (const n of [1, 3]) {
    const v = vetUpdate(have, EMBER(n));
    assert.equal(v.form, "error");
    assert.deepEqual(v.problems, [`The pack "ember-folk" is at version 3 here; an update must be version 4 or higher, and this is ${n}.`]);
  }
  const ok = vetUpdate(have, EMBER(4));
  assert.equal(ok.ok, true);
  assert.equal(ok.record.version, 4);
});

test("vetUpdate: an update may add entries but not drop one", () => {
  const have = [record(EMBER(1, [spell("ember-folk", "ash-veil")]))];
  const v = vetUpdate(have, EMBER(2));
  assert.deepEqual([v.ok, v.form], [false, "refuse"]);
  assert.equal(v.problems[0], 'Version 2 of "ember-folk" drops 1 entry that version 1 had (hb-ember-folk-ash-veil). An update may add and change entries but not drop them: remove the pack (when nothing uses it) and add it again instead.');
  assert.equal(vetUpdate([record(EMBER(1))], EMBER(2, [spell("ember-folk", "ash-veil")])).ok, true);
});

test("vetUpdate: more than five dropped entries are counted and the list cut", () => {
  const many = Array.from({ length: 7 }, (_, i) => spell("ember-folk", `s${i}`));
  const v = vetUpdate([record(EMBER(1, many))], EMBER(2));
  assert.match(v.problems[0], /^Version 2 of "ember-folk" drops 7 entries that version 1 had \((hb-[a-z0-9-]+, ){4}hb-[a-z0-9-]+, and more\)\./);
});

test("vetAdd: the lint comes before the id checks", () => {
  const bad = doc("imp-folk", { spells: [{ id: "nope" }] });
  assert.equal(vetAdd([record(doc("imp-folk"))], bad).form, "refuse");
  const imp = doc("imp-folk", { spells: [callWraith("imp-folk", "hb-imp-folk-imp")], monsters: [monster("imp-folk", "imp")] });
  assert.equal(vetAdd([record(doc("imp-folk"))], imp).form, "error", "a pack that summons one is checked as any other: here the id is taken");
});

test("vetAdd: the cross-pack rules come through overlayOf; four packs at most; ids may not begin with another's", () => {
  const four = ["aa", "bb", "cc", "dd"].map((id) => record(doc(id)));
  const five = vetAdd(four, doc("ee"));
  assert.deepEqual([five.ok, five.form], [false, "refuse"]);
  assert.match(five.problems.join(), /4 homebrew packs/);
  const prefix = vetAdd([record(doc("ember"))], doc("ember-folk"));
  assert.equal(prefix.ok, false);
  assert.match(prefix.problems.join(), /cannot be on one table/);
  assert.equal(installed(), null);
});

test("vetAdd and vetUpdate: a table whose stored packs do not pass counts as holding none, as it always has for the server", () => {
  const broken = [{ ...record(EMBER(1, [spell("ember-folk", "ash-veil")])), hash: "0".repeat(64) }];
  const v = vetUpdate(broken, EMBER(2));
  assert.equal(v.ok, true, "the stored copy is not trusted, so there is nothing to drop from");
});

test("vetAdd: `loaded` from the caller is used as given", () => {
  const stored = [record(EMBER(1, [spell("ember-folk", "ash-veil")]))];
  const loaded = vetPacks(stored).loaded;
  assert.equal(vetUpdate(stored, EMBER(2), { loaded }).ok, false);
  assert.deepEqual(vetUpdate(stored, EMBER(2), { loaded }), vetUpdate(stored, EMBER(2)));
});

test("a hostile pack changes nothing: no throw, nothing stored, nothing installed, the table's packs untouched", () => {
  const tableBefore = JSON.stringify([record(FROST())]);
  const table = JSON.parse(tableBefore);
  const bomb = (n) => { let x = { id: "hb-bad-x" }; for (let i = 0; i < n; i++) x = { onHit: [x] }; return x; };
  const hostile = [
    JSON.parse('{"format":"hextable-pack","v":1,"pack":{"id":"evil","name":"x","version":1},"__proto__":{"polluted":true},"spells":[]}'),
    doc("deep", { spells: [spell("deep", "d", { effects: [bomb(2000)] })] }),
    doc("evil", { spells: [{ ...spell("evil", "f"), run: () => 1 }] }),
    doc("evil", { spells: [spell("evil", "f", { text: "x".repeat(2e6) })] }),
    { format: "hextable-pack", v: 1, pack: { id: "srd52", name: "x", version: 1 } },
    doc("evil", { spells: [spell("evil", "n", { range: NaN })] }),
    doc("evil", { spells: [spell("not-evil", "n")] }),
    doc("evil", { monsters: [monster("evil", "m", { source: "srd" })] }),
    null, [], "text", 7,
  ];
  for (const h of hostile) for (const f of [vetAdd, vetUpdate]) {
    let v;
    assert.doesNotThrow(() => { v = f(table, h); });
    assert.equal(v.ok, false, String(JSON.stringify(h)?.slice(0, 60)));
    assert.ok(Array.isArray(v.problems) && v.problems.length > 0 && ["error", "refuse", "summon"].includes(v.form));
    assert.ok(v.problems.every((p) => typeof p === "string"));
  }
  assert.equal(JSON.stringify(table), tableBefore);
  assert.equal(installed(), null);
  assert.equal({}.polluted, undefined);
});

// ---------- inUse ----------
test("inUse names each way a pack is in use, and nothing when it is not", () => {
  const state = {
    entities: {
      m1: { name: "Cinderling", tpl: "hb-ember-folk-quillwraith" },                       // a creature of the pack
      pc: { name: "Mira", sheet: { spells: ["hb-ember-folk-cinder-lash", "fire-bolt"] } },  // a sheet that knows its spell
    },
    map: { objects: { o1: { kind: "hb-ember-folk-brazier" } } },                           // a map object
    conclusion: { pending: { reward: "hb-ember-folk-bead" } },                              // a pending conclusion
    slots: { "hb-ember-folk-spark": 1 },                                                    // an id as a key
    timeline: [{ text: "hb-ember-folk-quillwraith died" }],                                  // the record, not looked at
    packs: [{ id: "ember-folk", version: 1, hash: "a".repeat(64) }],
  };
  const why = inUse(state, "ember-folk");
  assert.equal(why.length, 5);
  for (const where of ["entities.m1 (Cinderling): hb-ember-folk-quillwraith", "entities.pc (Mira): hb-ember-folk-cinder-lash", "map.objects: hb-ember-folk-brazier", "conclusion.pending: hb-ember-folk-bead", "slots: hb-ember-folk-spark"]) assert.ok(why.includes(where), `${where} in ${why.join(" | ")}`);
  assert.deepEqual(inUse(state, "frost-kin"), []);
  assert.deepEqual(inUse({ entities: {}, timeline: state.timeline, packs: state.packs }, "ember-folk"), []);
  assert.deepEqual(inUse(undefined, "ember-folk"), []);
});

test("usesIn stops at `most` places and says where", () => {
  const entities = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`m${i}`, { name: `N${i}`, tpl: "hb-x-a" }]));
  assert.equal(usesIn({ entities }, (id) => id.startsWith("hb-x-")).length, 8);
  assert.equal(usesIn({ entities }, (id) => id.startsWith("hb-x-"), 3).length, 3);
});

// ---------- cleanPacks / vetPacks ----------
test("cleanPacks keeps the records that pass, drops the rest with a reason, and never throws", () => {
  const good = record(EMBER());
  assert.deepEqual(cleanPacks(undefined), { packs: [], dropped: [] });
  assert.deepEqual(cleanPacks("nope"), { packs: [], dropped: [{ id: null, reason: "the saved packs were not a list" }] });
  const r = cleanPacks([good, { id: "x" }, null, { ...record(FROST()), hash: "f".repeat(64) }]);
  assert.deepEqual(r.packs, [good]);
  assert.notEqual(r.packs[0], good, "new objects");
  assert.deepEqual(r.dropped.map((d) => d.id), ["x", "pack 3", "frost-kin"]);
  assert.equal(r.dropped[0].reason, "it is not a record of an id, a version, a hash and the pack");
  assert.equal(r.dropped[2].reason, "frost-kin: its hash does not match its contents.");
});

test("cleanPacks drops a set the registry refuses, and keeps a pack that summons a homebrew creature", () => {
  const five = ["aa", "bb", "cc", "dd", "ee"].map((id) => record(doc(id)));
  const r = cleanPacks(five);
  assert.deepEqual(r.packs, []);
  assert.equal(r.dropped.length, 5);
  assert.match(r.dropped[0].reason, /^the packs cannot be on one table: .*4 homebrew packs/);
  const imp = record(doc("imp-folk", { spells: [callWraith("imp-folk", "hb-imp-folk-imp")], monsters: [monster("imp-folk", "imp")] }));
  assert.deepEqual(cleanPacks([imp]).dropped, []);
  assert.equal(cleanPacks([imp]).packs.length, 1);
  const hostile = [{ get id() { throw new Error("boom"); } }, Object.create(null)];
  assert.doesNotThrow(() => cleanPacks(hostile));
  assert.equal(installed(), null);
});

test("vetPacks checks a stored list as if it were uploaded", () => {
  assert.equal(vetPacks([record(EMBER()), record(FROST())]).ok, true);
  assert.equal(vetPacks("nope").ok, false);
  assert.deepEqual(vetPacks([null]).problems, ["Pack 1 is not a stored pack."]);
  assert.equal(vetPacks([{ ...record(EMBER()), id: "other" }]).ok, false);
  assert.equal(vetPacks([{ ...record(EMBER()), version: 9 }]).ok, false);
});
