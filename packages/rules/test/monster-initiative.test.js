// Monsters' Initiative modifiers (DEBT M10): the stat block's Initiative, which can differ from Dexterity.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CONTENT, legacyMonster, MONSTERS, PACKS } from "../src/content/index.js";
import { lintPack } from "../src/content/schema.js";
import { apply, makeEntity, mod } from "../src/engine.js";
import { migrate } from "../src/migrate.js";
import { newGame } from "../src/scenario.js";
import { view } from "../src/view.js";

const srd = PACKS[0];
const DM = { role: "dm", userId: "dm" };
const ok = (r) => { assert.ok(r.ok, r.error); return r; };
const withMonster = (change) => { const m = structuredClone(srd.monsters[0]); change(m); return lintPack({ ...srd, monsters: [m] }).join(" | "); };

// The same table, the same dice: start a fight and read what a creature rolled for Initiative.
function initiativeOf(tpl, patch = {}, seed = 11) {
  const s = newGame(seed);
  for (const id of Object.keys(s.entities)) if (s.entities[id].side !== "party") delete s.entities[id];
  const id = ok(apply(s, { type: "spawn", monster: tpl, at: { q: 1, r: 1 } }, DM)).events[0].id;
  Object.assign(s.entities[id], patch);
  if ("initBonus" in patch && patch.initBonus === undefined) delete s.entities[id].initBonus;
  const r = ok(apply(s, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }, DM));
  return r.events.find((e) => e.type === "encounterStart").order.find((o) => o.id === id).init;
}

test("the linter accepts a whole-number initiative and rejects anything else", () => {
  assert.equal(withMonster((m) => { m.initiative = 7; }), "");
  assert.equal(withMonster((m) => { m.initiative = -2; }), "");
  assert.equal(withMonster((m) => { delete m.initiative; }), "");
  for (const bad of ["7", 7.5, null, [7], { dex: 7 }, 400]) assert.match(withMonster((m) => { m.initiative = bad; }), /initiative must be/, JSON.stringify(bad));
});

test("a monster with a listed Initiative rolls with it in place of Dexterity", () => {
  assert.equal(MONSTERS.aboleth.initBonus, 7);                            // Dex 9 (modifier -1), Initiative +7 in the SRD
  assert.equal(mod(CONTENT.monsters.aboleth.abilities.dex), -1);
  const base = initiativeOf("aboleth", { initBonus: 0 });
  assert.equal(initiativeOf("aboleth", { initBonus: 7 }), base + 7);
  assert.equal(initiativeOf("aboleth"), base + 7);                        // the one it was made with
  assert.equal(initiativeOf("aboleth", { initBonus: -3 }), base - 3);
});

test("a creature without one rolls with its Dexterity modifier, as before", () => {
  const e = makeEntity({ name: "Plain", hp: 1, abil: { str: 10, dex: 16, con: 10, int: 10, wis: 10, cha: 10 } });
  assert.equal(e.initBonus, undefined);
  const base = initiativeOf("goblin-warrior", { initBonus: 0 });
  assert.equal(initiativeOf("goblin-warrior", { initBonus: undefined, abil: { ...CONTENT.monsters["goblin-warrior"].abilities, dex: 20 } }), base + 5);
  assert.equal(legacyMonster({ ...structuredClone(srd.monsters[0]), initiative: undefined }).initBonus, undefined);
  assert.equal(legacyMonster({ ...structuredClone(srd.monsters[0]), initiative: 4 }).initBonus, 4);
});

test("every monster's Initiative is its Dexterity modifier plus nothing, once, or twice its Proficiency Bonus", () => {
  for (const m of Object.values(CONTENT.monsters)) {
    assert.ok(Number.isInteger(m.initiative), m.id);
    const extra = m.initiative - mod(m.abilities.dex);
    assert.ok([0, m.pb, 2 * m.pb].includes(extra) || m.id === "archmage", `${m.id}: ${extra}`);   // the SRD gives the Archmage +7 with Dex 14 and PB +2: kept as printed
  }
});

test("saved creatures get their Initiative when a table loads, and keep any they already have", () => {
  const s = newGame(3);
  const id = ok(apply(s, { type: "spawn", monster: "aboleth", at: { q: 1, r: 1 } }, DM)).events[0].id;
  for (const e of Object.values(s.entities)) delete e.initBonus;
  migrate(s);
  assert.equal(s.entities[id].initBonus, 7);
  assert.equal(s.entities.fighter.initBonus, undefined);
  s.entities[id].initBonus = 1;
  assert.equal(migrate(s).entities[id].initBonus, 1);
  const old = migrate(JSON.parse(readFileSync(new URL("./fixtures/table-v1.json", import.meta.url), "utf8")).state);
  assert.equal(Object.values(old.entities).find((e) => e.tpl === "goblin-warrior").initBonus, 2);
});

test("a player's view of a monster does not carry its Initiative modifier", () => {
  const s = newGame(5);
  const id = ok(apply(s, { type: "spawn", monster: "aboleth", at: { q: 1, r: 1 } }, DM)).events[0].id;
  assert.equal(s.entities[id].initBonus, 7);
  const v = view(s, { role: "player", userId: "pat" }).entities[id];
  assert.ok(v, "the player sees the aboleth");
  assert.ok(!("initBonus" in v));
});
