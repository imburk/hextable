// Legendary Resistance, stage L2a (docs/specs/legendary.md, Decisions 6, 7 and 9; tests 8, 10, 11 and 12). Built a part at a time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apply } from "../src/engine.js";
import { failureMatters, resistFailure } from "../src/engine/rolls.js";
import { RESISTANCE } from "../src/reactions.js";
import { newGame } from "../src/scenario.js";

const DM = { role: "dm", userId: "dm" };
const ok = (s, a, ctx = DM) => { const r = apply(s, a, ctx); assert.ok(r.ok, `${a.type}: ${r.error}`); return r; };
const clone = (s) => structuredClone(s);

// A game with an adult green dragon "Verdigris" (3 uses of Legendary Resistance a day, immune to poison) and the party, no fight; `on`: the table setting.
function game({ on = true, monster = "adult-green-dragon" } = {}) {
  const s = newGame(5);
  ok(s, { type: "setting", key: "autoEngage", value: false });
  const f = s.entities.fighter.pos;
  ok(s, { type: "spawn", monster, at: { q: f.q + 3, r: f.r }, name: "Verdigris" });
  if (on) ok(s, { type: "setting", key: "legendaryResistance", value: true });
  const d = Object.values(s.entities).find((e) => e.name === "Verdigris");
  return { s, d };
}
const failed = () => ({ roll: 3, total: 3, success: false, dice: [3], bonus: 0 });

test("1: the setting is off by default and the DM turns it on", () => {
  const { s: a } = game({ on: false });
  assert.notEqual(a.settings?.legendaryResistance, true);
  const { s: b } = game();
  assert.equal(b.settings.legendaryResistance, true);
  const r = apply(b, { type: "setting", key: "legendaryResistance", value: "yes" }, DM);
  assert.equal(r.ok, false);
});

test("1: with the setting off, resistFailure returns at once and changes nothing", () => {
  const { s, d } = game({ on: false });
  ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "always" } });
  const before = clone(s), sv = failed(), ev = [], evt = { type: "save" };
  assert.equal(resistFailure(s, d, sv, { matters: true }, ev, evt), false);
  assert.deepStrictEqual(s, before);
  assert.deepStrictEqual(sv, failed());
  assert.deepStrictEqual(ev, []);
  assert.deepStrictEqual(evt, { type: "save" });
});

test("1: `always` spends a use: the save is a success with its roll kept, the count goes up, the event says so", () => {
  const { s, d } = game();
  ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "always" } });
  const sv = failed(), evt = { type: "save", success: false, total: 3 };
  assert.equal(resistFailure(s, d, sv, { onFail: [] }, [], evt), true);
  assert.equal(sv.success, true); assert.equal(sv.resisted, true); assert.equal(sv.total, 3, "the roll is kept");
  assert.equal(evt.success, true); assert.equal(evt.resisted, true);
  assert.equal(d.legend.resisted, 1);
});

test("1: a success, `never`, no use left, and a creature with no Legendary Resistance: nothing is spent", () => {
  const { s, d } = game();
  ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "always" } });
  const won = { ...failed(), success: true };
  assert.equal(resistFailure(s, d, won, { matters: true }, []), false);
  assert.equal(d.legend.resisted, 0);
  ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "never" } });
  assert.equal(resistFailure(s, d, failed(), { matters: true }, []), false);
  ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "always" } });
  d.legend.resisted = 3;
  const sv = failed();
  assert.equal(resistFailure(s, d, sv, { matters: true }, []), false);
  assert.equal(sv.success, false);
  assert.equal(resistFailure(s, s.entities.fighter, failed(), { matters: true }, []), false);
});

test("1: `matters` (the default) spends on a failure that matters and lets one that changes nothing stand", () => {
  const { s, d } = game();
  const para = [{ condition: "paralyzed" }], poison = [{ damage: "8d6", type: "poison" }], fire = [{ damage: "8d6", type: "fire" }];
  assert.equal(failureMatters(s, d, { onFail: para }), true);
  assert.equal(failureMatters(s, d, { onFail: fire, half: true }), true);
  assert.equal(failureMatters(s, d, { onFail: poison }), false, "immune to poison");
  assert.equal(failureMatters(s, d, { onFail: [{ condition: "poisoned" }] }), false, "immune to the condition");
  assert.equal(failureMatters(s, d, { onFail: [] }), false);
  assert.equal(failureMatters(s, d, { onFail: [{ heal: "1d4" }] }), false, "nothing that changes it");
  assert.equal(failureMatters(s, d, { onFail: [{ manual: "The DM decides." }] }), null, "a manual step is not read");
  assert.equal(failureMatters(s, d, { onFail: [{ damage: "2d6", type: "chosen" }] }), null);
  assert.equal(failureMatters(s, d, { onFail: [{ kill: true }] }), true);
  assert.equal(failureMatters(s, d, { onFail: [{ save: "con", dc: 15, onFail: [{ condition: "stunned" }] }] }), true, "a step inside a branch");
  assert.equal(failureMatters(s, d, { matters: true }), true);
  assert.equal(failureMatters(s, d, { unread: true }), null);
  d.cond.paralyzed = {};
  assert.equal(failureMatters(s, d, { onFail: para }), false, "already so");
  assert.equal(resistFailure(s, d, failed(), { onFail: poison }, []), false);
  assert.equal(d.legend.resisted, 0);
  delete d.cond.paralyzed;
  const sv = failed();
  assert.equal(resistFailure(s, d, sv, { onFail: para }, []), true);
  assert.equal(sv.success, true);
});

test("1: `matters` on a failure the engine cannot read, and `ask`, apply the failure and tell the DM a use is left", () => {
  const { s, d } = game();
  let ev = [], sv = failed();
  assert.equal(resistFailure(s, d, sv, { onFail: [{ manual: "x" }] }, ev), false);
  assert.equal(sv.success, false);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].type, "manual"); assert.equal(ev[0].actor, d.id);
  assert.match(ev[0].text, /3 uses of Legendary Resistance left/);
  ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "ask" } });
  ev = []; sv = failed();
  assert.equal(resistFailure(s, d, sv, { matters: true }, ev), false);
  assert.equal(ev.length, 1);
  assert.equal(d.legend.resisted, 0);
});

test("1: the instruction is listed with `reactionsOf` and set by the existing `reactions` action; `matters` is the default and not stored", () => {
  const { s, d } = game();
  ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "never" } });
  assert.equal(d.reactions[RESISTANCE], "never");
  ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "matters" } });
  assert.equal(d.reactions, undefined);
  const r = apply(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "sometimes" } }, DM);
  assert.equal(r.ok, false);
  const f = apply(s, { type: "reactions", actor: "fighter", set: { [RESISTANCE]: "always" } }, DM);
  assert.equal(f.ok, false, "a creature with no Legendary Resistance has no such instruction");
});

// ---------- 8: every save site ----------
// A test that reads the sources (as imports.test.js does for import cycles): each call of `savingThrow(` is followed, within the next lines, by `resistFailure`, or is on a
// list of exceptions with its reason. A new save added without either fails here.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const EXCEPTIONS = [
  { file: "engine/rolls.js", line: /return savingThrow\(s, t, abil, dc, null, from, null, r\.name, ev, conds\)/, why: "Countercharm's second roll is not the outcome: it goes back to the save site that asked for it (effects.js), which calls resistFailure on the result of both" },
];
function sources(dir = SRC, out = []) {
  for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) sources(p, out); else if (p.endsWith(".js")) out.push(p); }
  return out.sort();
}
function calls() {
  const found = [];
  for (const p of sources()) {
    const lines = readFileSync(p, "utf8").split("\n");
    lines.forEach((text, i) => {
      const code = text.replace(/\/\/.*$/, "");
      if (!/\bsavingThrow\(/.test(code) || /function\s+savingThrow\(/.test(code)) return;
      found.push({ file: relative(SRC, p).replaceAll("\\", "/"), n: i + 1, text, after: lines.slice(i, i + 12).join("\n") });
    });
  }
  return found;
}

test("8: every `savingThrow(` call is followed by resistFailure or is a listed exception", () => {
  const all = calls();
  assert.ok(all.length >= 11, `the sites were found (${all.length})`);
  const used = new Set();
  const bare = [];
  for (const c of all) {
    if (/\bresistFailure\b/.test(c.after)) continue;
    const ex = EXCEPTIONS.findIndex((x) => x.file === c.file && x.line.test(c.text));
    if (ex < 0) bare.push(`${c.file}:${c.n}: ${c.text.trim()}`);
    else used.add(ex);
  }
  assert.deepEqual(bare, [], "a save with no resistFailure after it and no exception");
  EXCEPTIONS.forEach((x, i) => { assert.ok(used.has(i), `the exception for ${x.file} (${x.why}) names no call any more`); assert.ok(x.why.length > 20); });
});

test("8: the save sites are the ones this stage knows (a new one is told here, with what it does)", () => {
  const sites = calls().map((c) => `${c.file}: ${c.text.trim().replace(/\s+/g, " ").slice(0, 60)}`);
  const files = sites.map((x) => x.split(":")[0]);
  const count = (f) => files.filter((x) => x === f).length;
  assert.deepEqual({ effects: count("effects.js"), durations: count("durations.js"), dm: count("engine/dm.js"), resolve: count("engine/resolve.js"), rolls: count("engine/rolls.js") },
    { effects: 1, durations: 3, dm: 1, resolve: 5, rolls: 1 });
  assert.equal(sites.length, 11);
});

// ---------- the sites played through the engine (tests 8, 10 and 11) ----------
import { KIT } from "../src/engine/resolve.js";
import { startEffect, turnEnded } from "../src/durations.js";

// The dragon fails every save it is not given a way out of: a bonus no roll can make up.
function weak(d) { d.saveBonus = { str: -60, dex: -60, con: -60, int: -60, wis: -60, cha: -60 }; }
const saves = (r) => r.events.filter((e) => e.type === "save");
const manuals = (r) => r.events.filter((e) => e.type === "manual" && e.name === "Legendary Resistance");
const instruct = (s, d, how) => ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: how } });
// A fight, with `id` to act: a spell is cast in turn.
function fight(s, id) { ok(s, { type: "startEncounter", center: s.entities.fighter.pos }); s.encounter.turn = s.encounter.order.findIndex((o) => o.id === id); assert.ok(s.encounter.turn >= 0); }
const call = (s, d, over = {}) => ok(s, { type: "save", who: d.id, ability: "wis", dc: 12, ...over });

test("8: a spell's save: under `always` the dragon succeeds, takes nothing, and the use is counted; under `never` it fails and is hurt", () => {
  const { s, d } = game(); weak(d);
  instruct(s, d, "always"); fight(s, "cleric");
  const hp = d.hp;
  const r = ok(s, { type: "cast", actor: "cleric", spell: "sacred-flame", target: d.id });
  const sv = saves(r).find((e) => e.id === d.id);
  assert.ok(sv, "it saved");
  assert.equal(sv.success, true); assert.equal(sv.resisted, true); assert.ok(sv.total < sv.dc, "the roll that failed is kept");
  assert.equal(d.hp, hp, "no damage: a success");
  assert.equal(d.legend.resisted, 1);
  const t = game(); weak(t.d); instruct(t.s, t.d, "never"); fight(t.s, "cleric");
  const r2 = ok(t.s, { type: "cast", actor: "cleric", spell: "sacred-flame", target: t.d.id });
  const sv2 = saves(r2).find((e) => e.id === t.d.id);
  assert.equal(sv2.success, false); assert.equal(sv2.resisted, undefined);
  assert.ok(t.d.hp < hp);
  assert.equal(t.d.legend.resisted, 0);
});

test("8: the same cast with the setting off plays as it always did", () => {
  const { s, d } = game({ on: false }); weak(d);
  ok(s, { type: "reactions", actor: d.id, set: { [RESISTANCE]: "always" } }); fight(s, "cleric");
  const r = ok(s, { type: "cast", actor: "cleric", spell: "sacred-flame", target: d.id });
  const sv = saves(r).find((e) => e.id === d.id);
  assert.equal(sv.success, false); assert.equal(sv.resisted, undefined);
  assert.equal(d.legend.resisted, 0);
  assert.deepEqual(manuals(r), []);
});

test("8: a called save: succeeds under `always`; the old note is replaced by the creature's instruction", () => {
  const { s, d } = game(); weak(d);
  instruct(s, d, "always");
  const r = call(s, d, { damage: { dice: "4d6", type: "fire" } });
  const sv = saves(r)[0];
  assert.deepEqual([sv.success, sv.resisted, sv.called], [true, true, true]);
  assert.equal(r.events.some((e) => e.type === "damage"), false, "a success takes none");
  assert.deepEqual(manuals(r), []);
  assert.equal(d.legend.resisted, 1);
  // `ask` (L2b will ask; until then): the failure applies and the DM is told a use is left.
  instruct(s, d, "ask");
  const r2 = call(s, d, { damage: { dice: "4d6", type: "fire" } });
  assert.equal(saves(r2)[0].success, false);
  assert.equal(manuals(r2).length, 1);
  assert.match(manuals(r2)[0].text, /2 uses of Legendary Resistance left/);
  assert.equal(d.legend.resisted, 1);
  // `never` is the DM's word: no note.
  instruct(s, d, "never");
  assert.deepEqual(manuals(call(s, d, { damage: { dice: "4d6", type: "fire" } })), []);
});

test("8: a repeated save at the end of its turn and a Concentration save: resisted under `always`", () => {
  const { s, d } = game(); weak(d);
  instruct(s, d, "always");
  const fx = startEffect(s, { name: "Hold", spell: null, source: "cleric", conc: false, duration: "special" });
  fx.parts.push({ target: d.id, cond: "paralyzed", ends: { on: "save", at: "turnEnd", save: "wis" }, dc: 14 });
  d.cond.paralyzed = {};
  const ev = [];
  turnEnded(s, ev, d, KIT);
  const sv = ev.find((e) => e.type === "save");
  assert.deepEqual([sv.success, sv.resisted], [true, true]);
  assert.equal(fx.parts[0].ended, true, "a success ends what held it");
  assert.equal(d.legend.resisted, 1);
  // Concentration: a hit that would break it.
  const hold = startEffect(s, { name: "Haste", spell: null, source: d.id, conc: true, duration: "special" });
  hold.parts.push({ target: d.id, modifier: { on: "speed", op: "add", value: 10 } });
  const r = ok(s, { type: "harm", actor: d.id, amount: 30, dtype: "fire" });
  const c = r.events.find((e) => e.type === "concentration");
  assert.ok(c, `a Concentration save was made: ${r.events.map((e) => e.type)}`);
  assert.deepEqual([c.success, c.resisted], [true, true]);
  assert.equal(r.events.some((e) => e.type === "effectEnd" && e.fx === hold.id), false, "the Concentration is kept");
  assert.equal(d.legend.resisted, 2);
});

test("10: `matters`: a failure that changes something is resisted; one that changes nothing is not, and nobody is asked", () => {
  const { s, d } = game(); weak(d);
  // Poison damage: the green dragon is immune.
  let r = call(s, d, { ability: "con", damage: { dice: "4d6", type: "poison" } });
  assert.equal(saves(r)[0].success, false); assert.deepEqual(manuals(r), []); assert.equal(d.legend.resisted, 0);
  // A condition it is immune to.
  r = call(s, d, { ability: "con", condition: "poisoned" });
  assert.equal(saves(r)[0].success, false); assert.deepEqual(manuals(r), []); assert.equal(d.legend.resisted, 0);
  // Damage it does not resist, a condition it can have: spent.
  r = call(s, d, { damage: { dice: "4d6", type: "fire" } });
  assert.deepEqual([saves(r)[0].success, saves(r)[0].resisted], [true, true]);
  r = call(s, d, { condition: "paralyzed" });
  assert.deepEqual([saves(r)[0].success, saves(r)[0].resisted], [true, true]);
  assert.equal(d.cond.paralyzed, undefined);
  assert.equal(d.legend.resisted, 2);
  // A call with neither damage nor condition: the engine cannot read what a failure does. It applies the failure and tells the DM.
  r = call(s, d, {});
  assert.equal(saves(r)[0].success, false); assert.equal(manuals(r).length, 1);
  assert.equal(d.legend.resisted, 2);
});

test("11: Legendary Resistance comes back only when the DM's Long Rest names the creature", () => {
  const { s, d } = game();
  d.legend.resisted = 2;
  ok(s, { type: "rest" });
  assert.equal(d.legend.resisted, 2, "the party's rest does not name it");
  ok(s, { type: "rest", ids: [d.id] });
  assert.equal(d.legend.resisted, 0);
});
