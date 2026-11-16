// The homebrew gate and the dice (#408, DEBT T35b and T35c). The gate caps the steps one use of an entry runs; this holds it to
// the dice too, so that nothing it admits meets an engine ceiling (effects.js, WORK). Part 1 is what the SRD pack does.
import assert from "node:assert/strict";
import { test } from "node:test";
import { PACKS } from "../src/content/index.js";
import { HOMEBREW_ENTRY_KINDS } from "../src/content/schema.js";

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
