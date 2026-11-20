// `state.packs`, the action `setPacks`, the pack hash and `packsMatch` (docs/specs/homebrew.md, Decision 3, row H5,
// task B5, issue #390). The checks against node:crypto are here and only here: the rules package imports nothing from Node.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { apply } from "../src/engine.js";
import { createHistory, describeStep, mark } from "../src/history.js";
import { migrate, VERSION } from "../src/migrate.js";
import { newGame } from "../src/scenario.js";
import { playerView, view } from "../src/view.js";
import { canonical, hashOf, packsMatch, packsProblem, sha256 } from "../src/content/packs.js";
import { HOMEBREW_LIMITS } from "../src/content/schema.js";

const DM = { role: "dm", userId: "dm" };
const PLAYER = { role: "player", userId: "u1" };
const json = (x) => JSON.stringify(x);
const H1 = "a".repeat(64), H2 = "b".repeat(64);
const pk = (id, version = 1, hash = H1) => ({ id, version, hash });

// ---------- SHA-256 ----------
test("sha256 gives the standard vectors", () => {
  assert.equal(sha256(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(sha256("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"), "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  assert.equal(sha256("a".repeat(1000000)), "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
});

test("sha256 agrees with node:crypto at every length round the padding edges, and on non-ASCII text", () => {
  for (let n = 0; n <= 200; n++) {
    const t = "x".repeat(n);
    assert.equal(sha256(t), createHash("sha256").update(t).digest("hex"), `length ${n}`);
  }
  for (const t of ["é", "Ember Folk — ⚔️ 🔥", "日本語のテキスト".repeat(20), "\u0000\u007f\u0080", "a\ud83d"]) {
    assert.equal(sha256(t), createHash("sha256").update(t).digest("hex"), t);
  }
});

test("the rules package imports nothing from Node in packs.js", () => {
  const src = readFileSync(new URL("../src/content/packs.js", import.meta.url), "utf8");
  assert.ok(!/from ['"]node:|require\(|\bprocess\b|\bBuffer\b/.test(src));
});

// ---------- hashOf ----------
test("hashOf is the SHA-256 of the canonical JSON: keys sorted at every depth, no whitespace", () => {
  const a = { z: 1, a: { y: [3, { d: 1, c: 2 }], x: "é\n" }, m: null, t: true };
  const b = { t: true, m: null, a: { x: "é\n", y: [3, { c: 2, d: 1 }] }, z: 1 };
  assert.equal(canonical(a), '{"a":{"x":"é\\n","y":[3,{"c":2,"d":1}]},"m":null,"t":true,"z":1}');
  assert.equal(hashOf(a), hashOf(b), "key order does not matter");
  assert.equal(hashOf(a), createHash("sha256").update(canonical(a)).digest("hex"));
  assert.match(hashOf(a), /^[0-9a-f]{64}$/);
  assert.notEqual(hashOf(a), hashOf({ ...a, z: 2 }), "a value changes it");
  assert.notEqual(hashOf({ l: [1, 2] }), hashOf({ l: [2, 1] }), "a list's order is part of it");
  assert.equal(hashOf({ a: 1, b: undefined }), hashOf({ a: 1 }), "as JSON leaves out an undefined");
  assert.equal(hashOf({ a: 1 }), createHash("sha256").update('{"a":1}').digest("hex"));
});

test("hashOf refuses what is not plain data", () => {
  assert.throws(() => hashOf({ f() {} }), TypeError);
  assert.throws(() => hashOf({ n: NaN }), TypeError);
  assert.throws(() => hashOf({ d: new Date() }), TypeError);
});

// ---------- packsMatch ----------
test("packsMatch is true only when ids, versions and hashes agree, in any order", () => {
  assert.equal(packsMatch([], []), true);
  assert.equal(packsMatch([pk("a"), pk("b", 2, H2)], [pk("b", 2, H2), pk("a")]), true);
  const say = (s, o) => { const r = packsMatch(s, o); assert.equal(typeof r, "string"); return r; };
  assert.match(say([pk("a")], []), /needs the pack "a".*not installed/);
  assert.match(say([pk("a"), pk("b")], [pk("b")]), /"a"/, "the first in id order");
  assert.match(say([pk("a", 2)], [pk("a", 1)]), /version 2 of the pack "a".*version 1 is installed/);
  assert.match(say([pk("a", 1, H1)], [pk("a", 1, H2)]), /"a".*hashes differ/);
  assert.match(say([], [pk("z")]), /"z" is installed, but the game does not name it/);
  assert.match(say([pk("a")], [pk("a"), pk("z")]), /"z" is installed/);
  assert.match(say("nope", []), /cannot be compared/);
  assert.match(say([], [{ id: "A" }]), /cannot be compared/);
});

// ---------- setPacks ----------
const BAD = [
  ["not a list", { packs: "x" }, /must be a list/],
  ["missing", {}, /must be a list/],
  ["too many", { packs: ["a", "b", "c", "d", "e"].map((i) => pk(i)) }, /at most 4 packs/],
  ["repeated id", { packs: [pk("a"), pk("a", 2, H2)] }, /listed twice/],
  ["an entry that is not a record", { packs: [null] }, /record/],
  ["an entry that is a list", { packs: [[]] }, /record/],
  ["an extra key (pack data)", { packs: [{ ...pk("a"), data: { spells: [] } }] }, /"data".*id, version and hash only/],
  ["id with capitals", { packs: [pk("Ember")] }, /id must be/],
  ["id with a double hyphen", { packs: [pk("a--b")] }, /id must be/],
  ["id with a space", { packs: [pk("a b")] }, /id must be/],
  ["empty id", { packs: [pk("")] }, /id must be/],
  ["id too long", { packs: [pk("a".repeat(HOMEBREW_LIMITS.name + 1))] }, /id must be/],
  ["id not a string", { packs: [pk(5)] }, /id must be/],
  ["version 0", { packs: [pk("a", 0)] }, /whole number of 1 or more/],
  ["version 1.5", { packs: [pk("a", 1.5)] }, /whole number of 1 or more/],
  ["version a string", { packs: [pk("a", "1")] }, /whole number of 1 or more/],
  ["version missing", { packs: [{ id: "a", hash: H1 }] }, /whole number of 1 or more/],
  ["hash too short", { packs: [pk("a", 1, "ab")] }, /64 lowercase hex/],
  ["hash in capitals", { packs: [pk("a", 1, "A".repeat(64))] }, /64 lowercase hex/],
  ["hash not hex", { packs: [pk("a", 1, "g".repeat(64))] }, /64 lowercase hex/],
  ["hash missing", { packs: [{ id: "a", version: 1 }] }, /64 lowercase hex/],
];

test("setPacks by the DM sets the list, as a clean copy that holds only ids, versions and hashes", () => {
  const s = newGame(5), seq = s.seq;
  const packs = [pk("ember-folk", 2, H1), pk("b", 1, H2)];
  const r = apply(s, { type: "setPacks", packs }, DM);
  assert.ok(r.ok, r.error);
  assert.deepEqual(s.packs, [pk("ember-folk", 2, H1), pk("b", 1, H2)]);
  assert.notEqual(s.packs, packs); assert.notEqual(s.packs[0], packs[0]);
  packs[0].id = "changed";
  assert.equal(s.packs[0].id, "ember-folk", "the state shares nothing with the action");
  assert.equal(s.seq, seq);
  assert.ok(apply(s, { type: "setPacks", packs: [] }, DM).ok);
  assert.deepEqual(s.packs, []);
  assert.ok(apply(s, { type: "setPacks", packs: ["a", "b", "c", "d"].map((i) => pk(i)) }, DM).ok, "four is the limit");
});

test("setPacks by a player is refused and changes nothing", () => {
  const s = newGame(5);
  apply(s, { type: "setPacks", packs: [pk("a")] }, DM);
  const before = json(s);
  for (const packs of [[pk("z")], [], "x"]) {
    const r = apply(s, { type: "setPacks", packs }, PLAYER);
    assert.equal(r.ok, false); assert.match(r.error, /Only the DM/);
    assert.equal(json(s), before);
  }
  const r = apply(s, { type: "setPacks", packs: [pk("z")] }, { role: "spectator" });
  assert.equal(r.ok, false); assert.equal(json(s), before);
});

for (const [name, action, why] of BAD) {
  test(`setPacks refuses ${name} with a plain sentence and changes nothing`, () => {
    const s = newGame(5);
    apply(s, { type: "setPacks", packs: [pk("a")] }, DM);
    const before = json(s);
    const r = apply(s, { type: "setPacks", ...action }, DM);
    assert.equal(r.ok, false);
    assert.match(r.error, why);
    assert.deepEqual(r.events, []);
    assert.equal(json(s), before, "not one byte of the state, timeline included");
  });
}

test("one undo step: undo and redo restore state.packs exactly; a game from before has no packs to put back", () => {
  const s = newGame(5), h = createHistory();
  const send = (a) => { const before = mark(s), r = apply(s, a, DM); assert.ok(r.ok, r.error); h.record(before, s, describeStep(a, r.events, before, s)); return json(s); };
  const s0 = json(s);
  assert.deepEqual(s.packs, [], "newGame gives no packs");
  const s1 = send({ type: "setPacks", packs: [pk("a")] });
  const s2 = send({ type: "setPacks", packs: [pk("a", 2, H2), pk("b")] });
  const s3 = send({ type: "setPacks", packs: [] });
  assert.equal(h.list().length, 3, "one undo step each");
  assert.ok(h.undo(s)); assert.equal(json(s), s2);
  assert.ok(h.undo(s)); assert.equal(json(s), s1);
  assert.ok(h.undo(s)); assert.equal(json(s), s0);
  assert.ok(h.redo(s)); assert.equal(json(s), s1);
  assert.ok(h.redo(s)); assert.equal(json(s), s2);
  assert.ok(h.redo(s)); assert.equal(json(s), s3);
  assert.equal(h.undo(s) && json(s), s2);
  assert.equal(JSON.stringify(s.packs), JSON.stringify([pk("a", 2, H2), pk("b")]), "key order too");
});

test("replay: the same actions from the same start give byte-identical states, and one saved and loaded in the middle too", () => {
  const acts = [{ type: "setPacks", packs: [pk("a")] }, { type: "move", actor: "wizard", to: { q: -4, r: 3 } }, { type: "setPacks", packs: [pk("a", 2, H2), pk("b")] }, { type: "setPacks", packs: [] }];
  const run = (s, list) => { for (const a of list) apply(s, a, DM); return json(s); };
  const a = newGame(7), b = newGame(7);
  assert.equal(run(a, acts), run(b, acts));
  const c = newGame(7); run(c, acts.slice(0, 2));
  const loaded = migrate(JSON.parse(json(c)));
  assert.equal(run(loaded, acts.slice(2)), json(a), "the straight run and the one loaded in the middle end alike");
});

// ---------- the migration ----------
test("a version 23 state loads with packs: [] and is otherwise unchanged; migrating again changes nothing", () => {
  const s = newGame(5);
  s.version = 23;
  const was = structuredClone(s);
  migrate(s);
  assert.equal(VERSION, 27);
  assert.equal(s.version, 27);
  assert.deepEqual(s.packs, []);
  assert.equal(s.settings.strikeFirst, true);   // version 27 (#585) adds the table rule `strikeFirst`, as its `autoEngage` was
  const unstruck = (x) => { const { strikeFirst, ...settings } = x.settings; return settings; };
  const places = (x) => ({ ...x, world: undefined, place: undefined, parked: undefined, journey: undefined, settings: unstruck(x) });   // version 26 (#579) adds the places of a world
  assert.equal(json({ ...places(s), version: 23 }), json(was), "newGame already holds packs: [], so nothing moves");
  const old = newGame(5); delete old.packs; old.version = 23;
  migrate(old);
  assert.deepEqual(old.packs, []);
  assert.equal(json({ ...old, packs: undefined, version: 27 }), json({ ...s, packs: undefined }));
  const again = json(s);
  migrate(s);
  assert.equal(json(s), again);
});

test("the migration keeps a whole packs list as a copy and drops one that is not whole", () => {
  const s = newGame(5); s.packs = [pk("a", 3, H2)];
  const keep = migrate(structuredClone(s));
  assert.deepEqual(keep.packs, [pk("a", 3, H2)]);
  for (const bad of [null, "x", {}, [{ id: "a" }], [pk("a"), pk("a")], [{ ...pk("a"), data: {} }], ["a", "b", "c", "d", "e"].map((i) => pk(i))]) {
    const t = newGame(5); t.packs = bad;
    assert.deepEqual(migrate(t).packs, [], JSON.stringify(bad).slice(0, 40));
  }
});

// ---------- what a player is sent ----------
test("a player is sent no packs from the state: neither playerView nor a player's view holds `packs`", () => {
  const s = newGame(5);
  s.entities.wizard.owner = "u1";
  assert.ok(apply(s, { type: "setPacks", packs: [pk("ember-folk-secret-ogre", 1, H2)] }, DM).ok);
  assert.ok(s.packs.length === 1);
  // The DM's view is the whole state (packs included, ids, versions and hashes only); a player's is built field by field.
  assert.deepEqual(view(s, { role: "dm", userId: "dm" }).packs, s.packs);
  for (const v of [playerView(s), view(s, { role: "player", userId: "u1" })]) {
    assert.equal(Object.hasOwn(v, "packs"), false);
    const text = json(v);
    assert.ok(!text.includes("ember-folk-secret-ogre") && !text.includes(H2), "no pack id or hash in what is sent");
  }
  // The events of the action reach a player as they would any DM action: none holds the packs.
  const s2 = newGame(5);
  const r = apply(s2, { type: "setPacks", packs: [pk("ember-folk-secret-ogre")] }, DM);
  assert.ok(!json(r.events).includes("ember-folk-secret-ogre"));
  assert.ok(!json(s2.timeline).includes("ember-folk-secret-ogre"), "the chronicle holds no pack id either");
});

test("the undo label of setPacks is the DM's: players are shown nothing and no pack id is in it", () => {
  const s = newGame(5), before = mark(s), a = { type: "setPacks", packs: [pk("ember-folk-secret-ogre")] };
  const r = apply(s, a, DM), step = describeStep(a, r.events, before, s);
  assert.equal(typeof step, "object");
  assert.equal(step.shown, null);
  assert.ok(!step.label.includes("ember-folk"));
  const h = createHistory(); h.record(before, s, step);
  assert.deepEqual(h.undo(s).shown, null);
});
