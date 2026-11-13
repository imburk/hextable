// Dice players cannot predict (docs/specs/hidden-information.md, section 7; issue #136, M1):
// `rng: { key, n }` rolls from a ChaCha20 keystream; an integer `rng` keeps rolling as it always did.
import assert from "node:assert/strict";
import { test } from "node:test";
import { aiStep } from "../src/ai.js";
import { apply, current } from "../src/engine.js";
import { migrate, VERSION } from "../src/migrate.js";
import { chachaBlock, keyedRng, rand, roll } from "../src/rng.js";
import { newGame } from "../src/scenario.js";
import { view, viewEvents } from "../src/view.js";

const DM = { role: "dm", userId: "dm" };
const P = { role: "player", userId: "u1" };
const KEY = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";

test("the block function is ChaCha20 (RFC 8439, section 2.3.2)", () => {
  const words = chachaBlock(KEY, 1, [0x09000000, 0x4a000000, 0]);
  assert.deepEqual(words.map((w) => w.toString(16).padStart(8, "0")), [
    "e4e7f110", "15593bd1", "1fdd0f50", "c47120a3", "c7f4d1c7", "0368c033", "9aaa2204", "4e6cd4c3",
    "466482d2", "09aa9f07", "05d7c214", "a2028bd9", "d19c12b5", "b94e16de", "e883d0cb", "4e3c50a2"]);
});

test("a keyed rng rolls word n of the keystream, moves its counter, and is the same from the same state", () => {
  const s = { rng: keyedRng(KEY) };
  assert.deepEqual(s.rng, { key: KEY, n: 0 });
  const block0 = chachaBlock(KEY, 0, [0, 0, 0]), block1 = chachaBlock(KEY, 1, [0, 0, 0]);
  const got = Array.from({ length: 20 }, () => rand(s));
  assert.deepEqual(got, [...block0, ...block1.slice(0, 4)].map((w) => w / 4294967296));
  assert.equal(s.rng.n, 20);
  const t = structuredClone(s);
  assert.deepEqual(roll(s, "8d6"), roll(t, "8d6"));
  assert.ok(got.every((x) => x >= 0 && x < 1));
});

test("an integer rng rolls exactly as before (Mulberry32), so old games replay", () => {
  const s = { rng: 12345 };
  assert.deepEqual(Array.from({ length: 4 }, () => rand(s)).map((x) => Math.floor(x * 1e9)), [979728267, 306752264, 484205421, 817934412]);
});

test("no seed, a malformed key or a bad counter: rand() refuses rather than rolling", () => {
  for (const rng of [undefined, null, "7", {}, { key: KEY }, { key: "zz", n: 0 }, { key: KEY.slice(2), n: 0 }, { key: KEY, n: -1 }, { key: KEY, n: 1.5 }]) {
    assert.throws(() => rand({ rng }), /no dice seed/);
  }
  assert.throws(() => keyedRng("short"), /64 hex/);
});

test("a whole fight on a keyed game: same key, same game; no player view or event holds the key or the counter", () => {
  const play = (key) => {
    const s = newGame(5);
    s.rng = keyedRng(key);
    s.entities.wizard.owner = "u1";
    const leaks = [];
    const check = (x) => { const j = JSON.stringify(x); if (j.includes(key) || /"rng"/.test(j)) leaks.push(j.slice(0, 120)); };
    apply(s, { type: "startEncounter", center: { q: 0, r: 0 } }, DM);
    for (let i = 0; i < 80 && s.encounter; i++) {
      const id = current(s);
      const r = apply(s, aiStep(s, id) ?? { type: "endTurn", actor: id }, DM);
      if (!r.ok) apply(s, { type: "endTurn", actor: id }, DM);
      check(view(s, P)); check(viewEvents(r.events ?? [], s, P));
    }
    check(viewEvents(s.timeline, s, P));
    return { s, leaks };
  };
  const a = play(KEY), b = play(KEY), c = play("ff".repeat(32));
  assert.deepEqual(a.leaks, []);
  assert.equal(JSON.stringify(a.s), JSON.stringify(b.s));
  assert.ok(a.s.rng.n > 10);
  assert.notEqual(JSON.stringify(a.s.timeline), JSON.stringify(c.s.timeline).replaceAll("ff".repeat(32), KEY));
});

test("migration to version 16: an integer rng is kept and rolls the same; a keyed one is kept", () => {
  assert.ok(VERSION >= 16);                   // 17 since forms (#154)
  const s = newGame(9);
  s.version = 15;
  const t = structuredClone(s);
  migrate(t);
  assert.equal(t.version, VERSION);
  assert.equal(t.rng, s.rng);
  const go = (x) => apply(x, { type: "attack", actor: "fighter", target: "m1", attack: "javelin" }, DM);
  for (const x of [s, t]) { x.entities.fighter.pos = { q: 1, r: -1, z: 0 }; }
  assert.deepEqual(go(s).events, go(t).events);
  const k = newGame(9); k.rng = keyedRng(KEY); k.version = 15;
  migrate(k);
  assert.deepEqual(k.rng, { key: KEY, n: 0 });
});
