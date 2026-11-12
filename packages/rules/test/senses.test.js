// Senses on creature records (task S3 of docs/specs/sight.md).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CONTENT, legacyMonster, MONSTERS, PACKS, PREGENS, SPELLS } from "../src/content/index.js";
import { lintPack, lintRecord } from "../src/content/schema.js";
import { apply, makeEntity } from "../src/engine.js";
import { migrate } from "../src/migrate.js";
import { newGame } from "../src/scenario.js";
import { view } from "../src/view.js";

const srd = PACKS[0];
const DM = { role: "dm", userId: "dm" };
const withMonster = (change) => { const m = structuredClone(srd.monsters[0]); change(m); return lintPack({ ...srd, monsters: [m] }).join(" | "); };
const withRecord = (change) => { const r = structuredClone(Object.values(PREGENS)[0]); change(r); return lintRecord(r, { spells: SPELLS }).join(" | "); };

test("the linter accepts senses in feet and rejects anything else, for monsters and records", () => {
  assert.equal(withMonster((m) => { m.senses = { darkvision: 60, blindsight: 10, tremorsense: 0, truesight: 120 }; }), "");
  assert.equal(withMonster((m) => { m.senses = {}; }), "");
  assert.equal(withRecord((r) => { r.senses = { darkvision: 60 }; }), "");
  for (const bad of [{ darkvision: 62 }, { darkvision: -5 }, { darkvision: 60.5 }, { darkvision: "60" }, { sight: 60 }, { darkvision: 5000 }, [60], null, 60]) {
    assert.match(withMonster((m) => { m.senses = bad; }), /senses must give/, JSON.stringify(bad));
    assert.match(withRecord((r) => { r.senses = bad; }), /senses are feet/, JSON.stringify(bad));
  }
});

test("the three entered monsters have Darkvision 60 from the SRD, and it reaches the engine", () => {
  for (const id of ["goblin-warrior", "wolf", "skeleton"]) assert.deepEqual(CONTENT.monsters[id].senses, { darkvision: 60 }, id);
  assert.deepEqual(MONSTERS.wolf.senses, { darkvision: 60 });
  assert.equal(legacyMonster({ ...structuredClone(srd.monsters[0]), senses: undefined }).senses, undefined);
  const s = newGame(3);
  const id = apply(s, { type: "spawn", monster: "wolf", at: { q: 1, r: 1 } }, DM).events[0].id;
  assert.deepEqual(s.entities[id].senses, { darkvision: 60 });
  assert.deepEqual(makeEntity({ name: "Plain", hp: 1 }).senses, {});
});

test("saved creatures get senses when a table loads", () => {
  const saved = JSON.parse(readFileSync(new URL("./fixtures/table-v1.json", import.meta.url), "utf8")).state;
  const s = migrate(structuredClone(saved));
  for (const e of Object.values(s.entities)) assert.equal(typeof e.senses, "object", e.id);
  assert.deepEqual(Object.values(s.entities).find((e) => e.tpl === "goblin-warrior").senses, { darkvision: 60 });
  const kept = structuredClone(s); Object.values(kept.entities)[0].senses = { truesight: 30 };
  assert.deepEqual(Object.values(migrate(kept).entities)[0].senses, { truesight: 30 });   // never overwritten
});

test("a player's view of a monster does not carry senses", () => {
  const s = newGame(5);
  const id = apply(s, { type: "spawn", monster: "wolf", at: { q: 1, r: 1 } }, DM).events[0].id;
  assert.deepEqual(s.entities[id].senses, { darkvision: 60 });
  const v = view(s, { role: "player", userId: "pat" }).entities[id];
  assert.ok(v, "the player sees the wolf");
  assert.ok(!("senses" in v));
});
