// What a player is sent of a party creature and of the settings is an allow-list (view-fields.js; review R5, imburk/hextable#617). A field that
// a creature or the settings can have and that no table classifies fails here, so a new field is decided on the day it is added and never sent
// by default. The fields are enumerated from: the record format (content/schema.js), a creature made from every pregenerated character, every
// monster, and every class at several levels, the engine's own assignments (a source scan, as hidden-ids.test.js reads its actions), and a
// game played through the engine (a Wild Shape form, a companion, a rider and its mount, a pocket dimension, hiding, a light).
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import { apply, makeEntity, SETTINGS } from "../src/engine.js";
import { CONTENT, MONSTERS, PREGENS } from "../src/content/index.js";
import { derive } from "../src/derive.js";
import { newGame } from "../src/scenario.js";
import { PARTY_FIELDS, SETTING_FIELDS, partyFields, sentFields } from "../src/view-fields.js";
import { view } from "../src/view.js";

const DM = { role: "dm", userId: "dm" }, PAT = { role: "player", userId: "pat" };
const CLASSES = ["sent", "scrubbed", "withheld"];
const rules = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8");
const SRC_FILES = ["engine.js", ...readdirSync(new URL("../src/engine/", import.meta.url)).filter((f) => f.endsWith(".js")).sort().map((f) => `engine/${f}`),
  "durations.js", "zones.js", "scenes.js", "rewards.js", "derive.js", "migrate.js", "scenario.js", "vision.js", "known.js"].filter((f) => { try { rules(f); return true; } catch { return false; } });
const SRC = SRC_FILES.map(rules).join("\n");

// ---------- the creature fields ----------
function creatureFields() {
  const seen = new Map();
  const add = (why, rec) => { for (const k of Object.keys(rec ?? {})) if (!seen.has(k)) seen.set(k, why); };
  // The record format.
  const m = /const RECORD_FIELDS = \[([\s\S]*?)\];/.exec(rules("content/schema.js"));
  for (const k of m[1].replace(/\/\/.*$/gm, "").matchAll(/'([A-Za-z]+)'/g)) if (!seen.has(k[1])) seen.set(k[1], "RECORD_FIELDS");
  // Made creatures: pregenerated characters, monsters, and every class from level 1 to 20.
  for (const [id, t] of Object.entries(PREGENS)) add(`pregen ${id}`, makeEntity(t, { id, kind: "pc", side: "party", pos: { q: 0, r: 0 } }));
  for (const [id, t] of Object.entries(MONSTERS)) add(`monster ${id}`, makeEntity(t, { id, tpl: id, pos: { q: 0, r: 0 } }));
  const abilities = { str: 12, dex: 14, con: 14, int: 12, wis: 14, cha: 14 };
  for (const c of Object.keys(CONTENT.classes)) for (const level of [1, 3, 5, 9, 11, 17, 20]) {
    add(`${c} ${level}`, makeEntity(derive({ name: "X", class: c, level, abilities, skills: [], choices: {}, spells: [] }).record, { id: "x", kind: "pc", side: "party", pos: { q: 0, r: 0 } }));
  }
  add("a multiclass character", makeEntity(derive({ name: "X", classes: [{ class: "fighter", level: 3 }, { class: "wizard", level: 2 }], abilities, skills: [], choices: {}, spells: [] }).record, { id: "x", kind: "pc", side: "party", pos: { q: 0, r: 0 } }));
  // What engine code writes onto a creature: `e.f = `, `fresh.f ??= `, `delete e.f`, `entities[id].f = `, `x['f'] = `, and the keys of
  // `Object.assign(creature, { ... })`, on any variable that holds a creature in the engine's code. In engine.js `e` is an event (a stamp), so
  // only the forms that name a creature itself are read there.
  const CREATURE = "e|fresh|t|rider|caster|master|foe|ally|tgt|target|actor|who|pc|ch|leader|fam|giver|taker|ent|entity|creature|member|steed|familiar|companion|summon|hero";
  const HELD = "(?:s|state|next|copy)?\\.?entities\\[[^\\]]+\\]";
  for (const f of SRC_FILES.filter((x) => x !== "derive.js")) {      // derive.js edits spell and feature data; the records it makes are read above
    const text = rules(f), who = f === "engine.js" ? HELD : `(?:\\b(?:${CREATURE})\\b|${HELD})`;
    const op = "\\s*(?:=(?!=)|\\?\\?=|\\|\\|=|\\+=|-=)";
    const found = [...text.matchAll(new RegExp(`${who}\\.([a-zA-Z]+)${op}`, "g")), ...text.matchAll(new RegExp(`${who}\\[['"]([a-zA-Z]+)['"]\\]${op}`, "g")),
      ...text.matchAll(new RegExp(`delete ${who}\\.([a-zA-Z]+)`, "g"))];
    for (const r of found) if (!seen.has(r[1])) seen.set(r[1], `${f}: ${r[0]}`);
    for (const r of text.matchAll(new RegExp(`Object\\.assign\\(${who}, \\{((?:[^{}]|\\{[^{}]*\\})*)\\}`, "g"))) for (const k of r[1].replace(/\{[^{}]*\}/g, "{}").matchAll(/(?:^|,)\s*([a-zA-Z]+)\s*[:,]/g)) if (!seen.has(k[1])) seen.set(k[1], `${f}: Object.assign`);
  }
  const keep = /for \(const k of \[('cond'[^\]]*)\]\) if \(e\[k\]/.exec(rules("engine/sheets.js"));
  for (const r of keep[1].matchAll(/'([A-Za-z]+)'/g)) if (!seen.has(r[1])) seen.set(r[1], "engine/sheets.js: carryPlay");
  return seen;
}

// A game played through the engine: what creatures carry once things have happened to them.
function played() {
  const s = newGame(5);
  s.entities.fighter.owner = "pat"; s.entities.rogue.owner = "pat"; s.entities.cleric.owner = "pat"; s.entities.wizard.owner = "pat";
  const druid = derive({ name: "Ven", class: "druid", level: 5, abilities: { str: 10, dex: 14, con: 14, int: 12, wis: 16, cha: 10 }, skills: ["nature", "perception"], choices: {}, spells: ["cure-wounds"] });
  s.entities.druid = makeEntity(druid.record, { id: "druid", kind: "pc", side: "party", owner: "pat", pos: { q: 1, r: 1, z: 0 } });
  const tries = [
    [PAT, { type: "hide", actor: "rogue" }],
    [DM, { type: "spawn", monster: "wolf", name: "Fang", at: { q: 2, r: 2 } }],
    [DM, { type: "bond", actor: "m1", to: "druid", kind: "familiar" }],
    [DM, { type: "setSpeed", actor: "fighter", mode: "walk", feet: 40 }],
    [DM, { type: "setSpeed", actor: "fighter", mode: "fly", feet: 30, hover: true }],
    [PAT, { type: "feature", actor: "druid", feature: "wild-shape", form: "wolf" }],
    [DM, { type: "setLight", actor: "cleric", item: "torch" }],
    [PAT, { type: "follow", actor: "wizard", leader: "fighter" }],
    [DM, { type: "condition", actor: "cleric", condition: "grappled" }],
    [DM, { type: "harm", actor: "cleric", amount: 3 }],
    [DM, { type: "give", actor: "fighter", coins: { gp: 5 } }],
    [DM, { type: "startEncounter", center: { q: 0, r: 0 }, radius: 10 }],
  ];
  for (const [ctx, a] of tries) apply(s, a, ctx);
  return s;
}

test("every field a creature can have is classified in view-fields.js", () => {
  const fields = creatureFields();
  for (const [k, v] of Object.entries(played().entities)) for (const f of Object.keys(v)) if (!fields.has(f)) fields.set(f, `a played game: ${k}`);
  assert.ok(fields.size > 80, `the enumeration found ${fields.size} fields`);
  const loose = [...fields].filter(([k]) => !Object.hasOwn(PARTY_FIELDS, k)).map(([k, why]) => `${k} (${why})`);
  assert.deepEqual(loose, [], "classify these fields in PARTY_FIELDS (view-fields.js): 'sent', 'scrubbed' or 'withheld'");
});

test("every field of a creature that holds another creature in a pocket dimension, or has been in a form, is classified", () => {
  const s = played(), seen = new Set();
  for (const e of Object.values(s.entities)) for (const c of Object.values(e.pocket ?? {})) for (const k of Object.keys(c)) seen.add(k);
  for (const e of Object.values(s.entities)) if (e.form) for (const k of Object.keys(e.form.kept ?? {})) seen.add(k);
  for (const k of seen) assert.ok(Object.hasOwn(PARTY_FIELDS, k), `${k} is not classified`);
});

test("the tables hold only the three classes, and nothing in them is stale", () => {
  // A key is live when some code reads or writes it as a property (`.key`, `key:` or `'key'`), in the rules or the client: a word in a comment is not enough.
  const code = [SRC, ...["view.js", "vision.js", "sight.js", "scores.js", "market.js", "space.js", "modifiers.js"].map(rules),
    ...readdirSync(new URL("../../client/", import.meta.url)).filter((f) => f.endsWith(".js")).map((f) => readFileSync(new URL(`../../client/${f}`, import.meta.url), "utf8"))]
    .join("\n").replace(/\/\/.*$/gm, "");
  for (const table of [PARTY_FIELDS, SETTING_FIELDS]) for (const [k, v] of Object.entries(table)) {
    assert.ok(CLASSES.includes(v), `${k}: ${v}`);
    assert.ok(new RegExp(`\\.${k}\\b|\\b${k}\\s*:|['"]${k}['"]`).test(code), `${k} is used as a property nowhere: is it a field that has gone?`);
  }
});

// ---------- the settings ----------
test("every setting is classified in view-fields.js", () => {
  const keys = new Map(Object.keys(SETTINGS).map((k) => [k, "SETTINGS in engine/dm.js"]));
  for (const k of Object.keys(newGame(5).settings)) if (!keys.has(k)) keys.set(k, "the settings of a new game");
  for (const f of SRC_FILES.concat(["view.js", "sight.js", "scores.js", "market.js", "space.js"])) {
    for (const r of rules(f).matchAll(/\bsettings\??\.(?!js\b)([a-zA-Z]+)/g)) if (!keys.has(r[1])) keys.set(r[1], `${f}: ${r[0]}`);
  }
  const loose = [...keys].filter(([k]) => !Object.hasOwn(SETTING_FIELDS, k)).map(([k, why]) => `${k} (${why})`);
  assert.deepEqual(loose, [], "classify these settings in SETTING_FIELDS (view-fields.js)");
});

// ---------- what the view does with them ----------
test("a field no table lists is not sent, on a creature, in a pocket, or among the settings", () => {
  const s = newGame(5);
  s.entities.fighter.owner = "pat";
  s.entities.fighter.secretPlan = "ambush the ogre";
  s.entities.fighter.pocket = { owl: { ...s.entities.rogue, id: "owl", secretPlan: "x", reactions: [{ on: "hit" }], speedSet: { walk: 40 } } };
  s.settings.dmMood = "grim";
  const v = view(s, PAT);
  assert.equal(v.entities.fighter.secretPlan, undefined);
  assert.equal(v.entities.fighter.pocket.owl.secretPlan, undefined);
  assert.equal(v.entities.fighter.pocket.owl.reactions, undefined, "a familiar in a pocket is cut by the same table");
  assert.equal(v.entities.fighter.pocket.owl.speedSet, undefined);
  assert.equal(v.settings.dmMood, undefined);
  assert.equal(v.settings.sight, "rooms");
  assert.equal(view(s, DM).entities.fighter.secretPlan, "ambush the ogre", "the DM is sent the state itself");
});

test("a player is sent a party creature as the state has it, but for the fields withheld", () => {
  const s = played();
  const v = view(s, PAT);
  for (const [id, e] of Object.entries(s.entities)) {
    if (e.side !== "party") continue;
    const sent = v.entities[id];
    assert.ok(sent, id);
    for (const k of Object.keys(sent)) assert.ok(k === "heldBy" || PARTY_FIELDS[k] === "sent" || PARTY_FIELDS[k] === "scrubbed", `${id}.${k} is sent but not listed as sent`);
    for (const [k, c] of Object.entries(PARTY_FIELDS)) if (c === "withheld") assert.equal(sent[k], undefined, `${id}.${k}`);
    for (const k of Object.keys(e)) if (PARTY_FIELDS[k] === "sent") assert.deepEqual(sent[k], e[k], `${id}.${k}`);
  }
  // The settings: all of them, in the order the state keeps them.
  assert.deepEqual(v.settings, s.settings);
  assert.deepEqual(Object.keys(v.settings), Object.keys(s.settings));
});

test("sentFields and partyFields leave the record they are given as it was", () => {
  const rec = { ...structuredClone(newGame(5).entities.fighter), speedSet: { walk: 40 }, pocket: { a: { id: "a", reactions: [], name: "A" } } };
  const before = JSON.stringify(rec);
  const out = partyFields(rec);
  assert.equal(JSON.stringify(rec), before);
  assert.equal(out.speedSet, undefined);
  assert.deepEqual(out.pocket, { a: { id: "a", name: "A" } });
  out.abil.str = 99;
  assert.notEqual(rec.abil.str, 99, "a copy");
  assert.deepEqual(sentFields({ sight: "los", nope: 1 }, SETTING_FIELDS), { sight: "los" });
});
