import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CONTENT, MONSTERS, PACKS, PREGENS, SPELLS } from "../src/content/index.js";
import { coverage, lintPack } from "../src/content/schema.js";
import { apply } from "../src/engine.js";
import { migrate } from "../src/migrate.js";
import { newGame } from "../src/scenario.js";

const [srd] = PACKS;
const clone = (x) => structuredClone(x);
// Lint a pack with one entry swapped for a broken copy, and return the problems.
const withSpell = (change) => { const s = clone(srd.spells[0]); change(s); return lintPack({ ...srd, spells: [s] }); };
const withMonster = (change) => { const m = clone(srd.monsters[0]); change(m); return lintPack({ ...srd, monsters: [m] }); };

test("the SRD pack passes the linter", () => {
  assert.deepEqual(lintPack(srd), []);
});

test("content files are data only: no imports, no functions", () => {
  const dir = fileURLToPath(new URL("../src/content/srd52/", import.meta.url));
  const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
  assert.ok(files.length >= 4);
  for (const f of files) {
    const code = readFileSync(dir + f, "utf8").replace(/\/\/.*$/gm, "").replace(/"(?:[^"\\]|\\.)*"/g, '""');
    for (const banned of [/\bimport\b/, /\bfunction\b/, /=>/, /\brequire\b/, /\bnew\b/, /`/]) {
      assert.equal(banned.test(code), false, `${f} contains ${banned}`);
    }
  }
  assert.match(lintPack({ ...srd, spells: [{ ...clone(srd.spells[0]), sneaky: () => 1 }] }).join("\n"), /contains a function/);
});

test("the linter catches broken spells", () => {
  const cases = [
    [(s) => { s.id = "FireBolt"; }, /kebab-case/],
    [(s) => { delete s.text; }, /needs text/],
    [(s) => { s.level = 12; }, /level must be 0 to 9/],
    [(s) => { s.school = "pyromancy"; }, /unknown school/],
    [(s) => { s.range = "far"; }, /range must be/],
    [(s) => { s.components = ["v", "x"]; }, /components/],
    [(s) => { s.tier = "done"; }, /tier must be/],
    [(s) => { delete s.checked; }, /checked/],
    [(s) => { s.target = { area: { shape: "blob", size: 10 } }; }, /unknown area shape/],
    [(s) => { s.effects = []; }, /non-empty list/],
    [(s) => { s.effects = [{ explode: true }]; }, /exactly one of/],
    [(s) => { s.effects = [{ damage: "lots", type: "fire" }]; }, /is not dice/],
    [(s) => { s.effects = [{ damage: "2d6", type: "spicy" }]; }, /unknown damage type/],
    [(s) => { s.effects = [{ save: "luck", onFail: [{ damage: "1d6", type: "fire" }] }]; }, /unknown ability/],
    [(s) => { s.effects[0].onHit.push({ condition: "sleepy" }); }, /unknown condition/],
    [(s) => { s.effects[0].onHit[0].when = ["full.moon"]; }, /unknown situation tag/],
    [(s) => { s.effects[0].onHit.push({ manual: "The DM decides what burns." }); }, /marked auto but contains a manual step/],
    [(s) => { s.tier = "manual"; }, /marked manual but has no manual step/],
  ];
  for (const [change, expected] of cases) assert.match(withSpell(change).join("\n"), expected);
  assert.match(lintPack({ ...srd, spells: [srd.spells[0], srd.spells[0]] }).join("\n"), /duplicate id/);
});

test("the linter catches broken monsters and dangling references", () => {
  const cases = [
    [(m) => { m.size = "enormous"; }, /unknown size/],
    [(m) => { m.speed = { hop: 30 }; }, /speed must give feet/],
    [(m) => { delete m.abilities.cha; }, /all six scores/],
    [(m) => { m.immune = ["sarcasm"]; }, /immune must be a list of damage types/],
    [(m) => { m.actions = []; }, /one or more actions/],
    [(m) => { m.actions[1].id = m.actions[0].id; }, /duplicate action id/],
    [(m) => { m.actions[0].effects[0].bonus = "high"; }, /whole-number bonus/],
    [(m) => { m.actions[0].target = { creature: { range: [320, 80] } }; }, /range must be \[normal, long\]/],
    [(m) => { m.traits[0].modifiers = [{ on: "mood", op: "add", value: 1 }]; }, /unknown hook/],
    [(m) => { m.traits[0].modifiers = [{ on: "ac", op: "double" }]; }, /unknown op/],
    [(m) => { m.traits[0].modifiers = [{ on: "ac", op: "add" }]; }, /needs a number/],
  ];
  for (const [change, expected] of cases) assert.match(withMonster(change).join("\n"), expected);

  const p = clone(srd.pregens[3]); p.spells.push("wish");
  assert.match(lintPack({ ...srd, pregens: [p] }).join("\n"), /knows a spell that is not in the pack: "wish"/);
  assert.match(lintPack({ ...srd, pack: { id: "x" } }).join("\n"), /pack: needs/);
});

test("coverage counts entries by tier and how many are unchecked", () => {
  const c = coverage({ spells: srd.spells, monsters: srd.monsters });
  assert.deepEqual(c.spells, { total: 6, auto: 5, assist: 1, manual: 0, unchecked: 6 });
  assert.deepEqual(c.monsters, { total: 3, auto: 2, assist: 1, manual: 0, unchecked: 3 });
});

test("lookups by id, and the bridge to the engine's current shape", () => {
  assert.equal(CONTENT.spells["burning-hands"].target.area.size, 15);
  assert.equal(CONTENT.monsters["goblin-warrior"].actions.length, 2);
  assert.deepEqual(SPELLS["burning-hands"], { name: "Burning Hands", level: 1, time: "action", range: 0, area: { shape: "cone", size: 15 }, kind: "save", save: "dex", damage: "3d6", dtype: "fire", half: true });
  assert.deepEqual(SPELLS["magic-missile"], { name: "Magic Missile", level: 1, time: "action", range: 120, kind: "auto", damage: "1d4+1", dtype: "force", darts: 3 });
  assert.deepEqual(SPELLS["cure-wounds"], { name: "Cure Wounds", level: 1, time: "action", range: 5, kind: "heal", heal: "2d8" });
  assert.deepEqual(MONSTERS.wolf, { name: "Wolf", ac: 12, hp: 11, speed: 40, abil: { str: 14, dex: 15, con: 12, int: 3, wis: 12, cha: 6 }, prof: 2,
    features: { packTactics: true }, attacks: [{ id: "bite", name: "Bite", type: "melee", bonus: 4, damage: "1d6+2", dtype: "piercing", reach: 5, onHit: "prone" }] });
  assert.equal(MONSTERS["goblin-warrior"].attacks[1].bonusOnAdv, "1d4");
  assert.deepEqual(MONSTERS.skeleton.vuln, ["bludgeoning"]);
  assert.equal("id" in PREGENS.wizard, false);
  // Handing out a record never hands out the pack's own data.
  const s = newGame(5);
  s.entities.wizard.spells.push("x"); s.entities.m1.attacks[0].bonus = 99;
  assert.equal(srd.pregens[3].spells.length, 3);
  assert.equal(newGame(5).entities.m1.attacks[0].bonus, 4);
});

test("a game saved with the old ids is upgraded and still plays", () => {
  const s = newGame(5);
  s.entities.wizard.spells = ["fireBolt", "magicMissile", "burningHands"];
  s.entities.cleric.spells = ["sacredFlame", "cureWounds", "healingWord"];
  for (const e of Object.values(s.entities)) if (e.tpl === "goblin-warrior") e.tpl = "goblin";
  s.timeline.push({ t: 480, type: "cast", actor: "wizard", spell: "fireBolt", name: "Fire Bolt" });
  const saved = JSON.parse(JSON.stringify(s));

  migrate(saved);
  assert.deepEqual(saved.entities.wizard.spells, ["fire-bolt", "magic-missile", "burning-hands"]);
  assert.deepEqual(saved.entities.cleric.spells, ["sacred-flame", "cure-wounds", "healing-word"]);
  assert.equal(saved.entities.m1.tpl, "goblin-warrior");
  assert.equal(saved.timeline.at(-1).spell, "fire-bolt");
  const once = JSON.stringify(saved);
  assert.equal(JSON.stringify(migrate(saved)), once);                      // running it again changes nothing

  const m1 = saved.entities.m1, wiz = saved.entities.wizard;
  apply(saved, { type: "place", actor: "m1", to: { q: wiz.pos.q + 2, r: wiz.pos.r } }, { role: "dm" });
  const res = apply(saved, { type: "cast", actor: "wizard", spell: "magic-missile", target: "m1" }, { role: "dm" });
  assert.ok(res.ok, res.error);
  assert.equal(migrate(null), null);
  assert.deepEqual(migrate({}), {});
});
