// Issue #421, items 2 and 3 (DEBT T54): no number the engine works out is ever NaN. A creature's action has no spell attack bonus and no
// spellcasting modifier: the linter refuses a spell attack, and a heal or Temporary Hit Points that add a modifier, in one; and the
// engine, met with one anyway, makes no roll and applies no amount, and tells the DM.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTENT, PACKS } from "../src/content/index.js";
import { loadPack } from "../src/content/registry.js";
import { lintEntry, lintPack } from "../src/content/schema.js";
import { apply, current } from "../src/engine.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const P = "ember-folk", SRC = `homebrew:${P}`;
const monster = (actions) => ({
  id: `hb-${P}-cinderling`, name: "Cinderling", source: SRC, size: "small", type: "elemental", cr: 0.25, xp: 50, pb: 2, ac: 13, hp: 9, speed: { walk: 30 },
  abilities: { str: 8, dex: 14, con: 10, int: 6, wis: 10, cha: 8 }, resist: [], vulnerable: [], immune: [], traits: [], actions,
  tier: "auto", checked: false, text: "A small spirit of embers.",
});
const act = (effects, id = "ember") => ({ id, name: "Ember", text: "Embers.", target: { creature: { reach: 5 } }, effects });
const DOC = (m) => ({ format: "hextable-pack", v: 1, pack: { id: P, name: "Ember Folk", version: 1, license: "CC0, by the author", attribution: "Written for a test." }, monsters: [m] });
const SPELL_ATTACK = [{ attack: "ranged", kind: "spell", onHit: [{ damage: "2d6", type: "fire" }] }];
const HEAL = (key) => [{ [key]: "1d8", addMod: true }];

test("the linter refuses a spell attack in a creature's action, and a heal or Temporary Hit Points that add a modifier; ordinary, strict, loadPack", () => {
  const cases = [[SPELL_ATTACK, /no spell attack bonus/], [HEAL("heal"), /no spellcasting modifier/], [HEAL("tempHp"), /no spellcasting modifier/],
    [[{ attack: "melee", kind: "weapon", bonus: 4, onHit: [{ heal: "1d4", addMod: false }, { save: "con", dc: 10, onFail: [{ tempHp: "1d4", addMod: true }] }] }], /no spellcasting modifier/]];
  for (const [effects, re] of cases) {
    const m = monster([act(effects)]);
    assert.match(lintEntry("monsters", m, { strict: false }).join("\n"), re);
    assert.match(lintEntry("monsters", m, { pack: P, srd: CONTENT }).join("\n"), re);
    assert.match(lintPack(DOC(m)).join("\n"), re);
    assert.equal(loadPack(DOC(m)).ok, false);
  }
  // What is fine stays fine: a weapon attack, a plain heal and Temporary Hit Points.
  const fine = monster([act([{ attack: "melee", kind: "weapon", bonus: 4, onHit: [{ damage: "1d6", type: "fire" }] }], "a"), act([{ heal: "1d8" }, { tempHp: "1d6" }], "b")]);
  assert.deepEqual(lintEntry("monsters", fine, { pack: P, srd: CONTENT }), []);
  assert.equal(loadPack(DOC(fine)).ok, true);
});
test("the SRD pack passes the new rules", () => { assert.deepEqual(lintPack(PACKS[0]), []); });

function field(actions) {
  const s = newGame(7);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  for (const k of Object.keys(s.map.levels[0].tiles)) s.map.levels[0].tiles[k] = { t: "grass" };
  apply(s, { type: "setting", key: "autoEngage", value: false }, DM);
  apply(s, { type: "place", actor: "wizard", to: { q: 0, r: 0 } }, DM);
  apply(s, { type: "place", actor: "fighter", to: { q: -6, r: 0 } }, DM);
  const g = s.entities[ok(apply(s, { type: "spawn", monster: "goblin-warrior", at: { q: 1, r: 0 } }, DM)).events[0].id];
  g.actions = [...actions, ...g.actions];
  ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 8 }, DM));
  for (let i = 0; i < 20 && current(s) !== g.id; i++) ok(apply(s, { type: "endTurn", actor: current(s) }, DM));
  return { s, g, w: s.entities.wizard };
}
const bad = (x, path = "") => { if (typeof x === "number") return Number.isFinite(x) ? [] : [path]; return x && typeof x === "object" ? Object.entries(x).flatMap(([k, v]) => bad(v, `${path}.${k}`)) : []; };

test("a spell attack in a creature's action makes no roll, never NaN: the DM is told, and the attack does not hit", () => {
  const { s, g, w } = field([act(SPELL_ATTACK, "bolt")]);
  const hp = w.hp, r = ok(apply(s, { type: "act", actor: g.id, action: "bolt", target: "wizard" }, DM));
  assert.deepEqual(bad(r.events), []);
  assert.deepEqual(bad(s.entities), []);
  assert.equal(r.events.some((e) => e.type === "attack"), false, "no attack roll was recorded");
  assert.ok(r.events.some((e) => e.type === "manual" && /no attack bonus/.test(e.text)));
  assert.equal(w.hp, hp, "and nothing was dealt");
});
test("a heal or Temporary Hit Points that add a modifier, in a creature's action, apply nothing and never make Hit Points NaN", () => {
  for (const key of ["heal", "tempHp"]) {
    const { s, g } = field([{ ...act(HEAL(key), "mend"), target: { self: true } }]);
    g.hp = 3;
    const r = ok(apply(s, { type: "act", actor: g.id, action: "mend" }, DM));
    assert.deepEqual(bad(r.events), [], key);
    assert.deepEqual(bad(s.entities), [], key);
    assert.equal(g.hp, 3);
    assert.equal(g.tempHp ?? 0, 0);
    assert.ok(r.events.some((e) => e.type === "manual" && /no amount the engine can work out/.test(e.text)), key);
  }
});
test("a heal and Temporary Hit Points with a plain amount still apply", () => {
  const { s, g } = field([{ ...act([{ heal: "1d4+3" }, { tempHp: "2d4" }], "mend"), target: { self: true } }]);
  g.hp = 1;
  const r = ok(apply(s, { type: "act", actor: g.id, action: "mend" }, DM));
  assert.ok(g.hp > 1 && g.tempHp > 0);
  assert.deepEqual(bad(r.events), []);
});
