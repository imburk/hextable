// The homebrew gate and the dice (#408, DEBT T35b and T35c). The gate caps the steps one use of an entry runs; this holds it to
// the dice too, so that nothing it admits meets an engine ceiling (effects.js, WORK). Part 1 is what the SRD pack does.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, PACKS } from "../src/content/index.js";
import { HOMEBREW_DICE, HOMEBREW_ENTRY_KINDS, lintEntry } from "../src/content/schema.js";

const SRD = PACKS[0];
const DICE = /^([+-]?)(?:(\d+)d(\d+))?(?:([+-]\d+))?$/;

// The largest count, sides and flat part in any single roll of any SRD entry (every string that is only dice).
function srdRolls() {
  const most = { count: [0, ""], sides: [0, ""], flat: [0, ""] };
  const walk = (v, where) => {
    if (typeof v === "string") {
      const m = DICE.exec(v);
      if (!m || !v.length || !/d|^[+-]\d+$/.test(v)) return;
      const f = m[4] !== undefined ? Math.abs(+m[4]) : m[2] === undefined ? Math.abs(+v) : 0;
      if (m[2] !== undefined && +m[2] > most.count[0]) most.count = [+m[2], `${where} ${v}`];
      if (m[3] !== undefined && +m[3] > most.sides[0]) most.sides = [+m[3], `${where} ${v}`];
      if (f > most.flat[0]) most.flat = [f, `${where} ${v}`];
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, where));
    else if (v && typeof v === "object") for (const k of Object.keys(v)) walk(v[k], where);
  };
  for (const kind of HOMEBREW_ENTRY_KINDS) for (const e of SRD[kind]) walk(e, `${kind}/${e.id}`);
  return most;
}

test("#408 part 1: the SRD's largest single roll is 26 dice (Ancient Red Dragon, 26d6), 12 sides (a d12) and a flat 70 (Heal)", () => {
  const m = srdRolls();
  if (process.env.HB_PRINT) console.log(m);
  assert.equal(m.count[0], 26);
  assert.match(m.count[1], /ancient-red-dragon/);
  assert.equal(m.sides[0], 12);
  assert.equal(m.flat[0], 70);
});

const SRC = "homebrew:x";
const strict = (kind, e) => lintEntry(kind, e, { pack: "x", srd: CONTENT });
const boom = (damage, over = {}) => ({
  id: "hb-x-boom", name: "Boom", source: SRC, level: 1, school: "evocation", classes: ["wizard"], time: "action", range: 60, components: ["v", "s"], duration: "instant",
  concentration: false, ritual: false, target: { creature: { count: 1 } }, effects: [{ save: "dex", half: true, onFail: [{ damage, type: "fire" }] }], tier: "auto", checked: false, text: "x", ...over,
});
const refused = (problems, re) => { assert.ok(problems.length, "refused"); assert.match(problems.join("\n"), re); };

// ---------- part 2: one roll ----------
test("#408 part 2: one roll has at most about twice the SRD's largest count, sides and flat part, and the SRD sits inside", () => {
  const m = srdRolls();
  assert.ok(HOMEBREW_DICE.count >= m.count[0] && HOMEBREW_DICE.count <= 2 * m.count[0], `${HOMEBREW_DICE.count} dice against the SRD's ${m.count[0]}`);
  assert.ok(HOMEBREW_DICE.sides >= m.sides[0] && HOMEBREW_DICE.sides <= 2 * m.sides[0], `${HOMEBREW_DICE.sides} sides against the SRD's ${m.sides[0]}`);
  assert.ok(HOMEBREW_DICE.flat >= m.flat[0] && HOMEBREW_DICE.flat <= 2 * m.flat[0], `a flat ${HOMEBREW_DICE.flat} against the SRD's ${m.flat[0]}`);
  assert.deepEqual(strict("spells", boom("50d24+140")), []);
  assert.deepEqual(strict("spells", boom("50d6-140")), []);
  refused(strict("spells", boom("51d6")), /rolls 51 dice; the most is 50/);
  refused(strict("spells", boom("1d25")), /dice of 25 sides; they have 2 to 24/);
  refused(strict("spells", boom("50d100")), /dice of 100 sides/);
  refused(strict("spells", boom("1d6+141")), /adds 141; the most is 140/);
  refused(strict("spells", boom("1d6-141")), /adds 141; the most is 140/);
  refused(strict("spells", boom("+141")), /adds 141; the most is 140/);
  // Beside dice in a step that is not damage, and in what grows with a higher slot.
  refused(strict("spells", boom("1d6", { effects: [{ heal: "9d9+999" }] })), /adds 999/);
  refused(strict("spells", boom("1d6", { higher: { slot: { damage: "1d100" } } })), /dice of 100 sides/);
});
