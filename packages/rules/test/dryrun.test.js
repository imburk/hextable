// The dry run and the sample pack (docs/specs/homebrew.md, Decision 7, row H7, task B6).
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { CONTENT, HOMEBREW_LOOKUPS, SPELLS } from "../src/content/index.js";
import { dryRun, dryRunPack, DRYRUN_LIMITS } from "../src/content/dryrun.js";
import { installed, loadPack } from "../src/content/registry.js";
import { AREA_SHAPES, BRANCHES, STEPS } from "../src/content/schema.js";
import { newGame } from "../src/scenario.js";

const PACK = JSON.parse(readFileSync(new URL("./fixtures/sample-pack.json", import.meta.url), "utf8"));
const byId = (slug) => PACK.spells.find((s) => s.id === `hb-sample-${slug}`);
const TARGETS = [...new Set(Object.values(HOMEBREW_LOOKUPS).flatMap((l) => l.map(([t]) => t)))];
const picture = () => TARGETS.map((t) => Object.keys(t).join("\n"));

// ---------- the sample pack ----------
test("the sample pack passes strict lint through loadPack and holds 12 to 20 spells", () => {
  const r = loadPack(JSON.stringify(PACK));
  assert.ok(r.ok, r.problems?.join("; "));
  assert.ok(PACK.spells.length >= 12 && PACK.spells.length <= 20, `${PACK.spells.length} spells`);
  assert.equal(PACK.spells.length, r.pack.ids.length);
  for (const s of PACK.spells) assert.ok(s.text.length > 20 && s.text.length < 300 && (s.text.match(/\./g) ?? []).length <= 2, `${s.id}: text is one or two plain sentences`);
});

test("the sample pack covers every step kind, every branch it can, every area shape and the named mechanics", () => {
  const steps = new Set(), branches = new Set(), shapes = new Set();
  let half = false, attack = false, ends = false, zone = false, push = false, heal = false, slot = false, level = false, manual = 0, cantrip = false;
  const go = (list) => { for (const st of list) {
    steps.add(STEPS.find((k) => k in st));
    if (st.half) half = true;
    if ("attack" in st) attack = true;
    if (st.ends) ends = true;
    if ("move" in st) push = true;
    if ("heal" in st) heal = true;
    if ("manual" in st) manual++;
    for (const b of BRANCHES) if (st[b]) { branches.add(b); go(st[b]); }
  } };
  for (const sp of PACK.spells) {
    go(sp.effects);
    if (sp.target.area) shapes.add(sp.target.area.shape);
    if (sp.zone) zone = true;
    if (sp.higher?.slot) slot = true;
    if (sp.higher?.level) { level = true; if (sp.level === 0) cantrip = true; }
  }
  // `imbue` is exempt from this coverage check on purpose: a dry run casts in a throw-away game whose caster carries no weapon for it to change,
  // so no sample spell can use it and the dry run only says so; imbue.test.js casts it for real (docs/specs/on-hit.md, O4 build notes).
  assert.deepEqual([...STEPS].filter((k) => k !== "imbue" && !steps.has(k)), [], "a step kind no sample spell uses");
  assert.deepEqual([...AREA_SHAPES].filter((k) => !shapes.has(k)), [], "an area shape no sample spell uses");
  for (const b of ["onHit", "onFail", "onZero", "onKill", "blocked"]) assert.ok(branches.has(b), `branch ${b}`);
  assert.deepEqual({ half, attack, ends, zone, push, heal, slot, level, cantrip, manual: manual === 1 }, { half: true, attack: true, ends: true, zone: true, push: true, heal: true, slot: true, level: true, cantrip: true, manual: true });
});

// ---------- the dry run ----------
test("every sample spell dry-runs, and the same seed twice gives byte-identical output", () => {
  for (const sp of PACK.spells) {
    const a = dryRun("spell", sp, { seed: 11, pack: PACK, runs: 4 }), b = dryRun("spell", sp, { seed: 11, pack: PACK, runs: 4 });
    assert.ok(a.ok, `${sp.id}: ${a.problems}`);
    assert.equal(JSON.stringify(a), JSON.stringify(b), sp.id);
    assert.ok(a.summary.text.length > 10, sp.id);
    if (sp.time !== "reaction") assert.ok(a.ran && a.events.some((e) => e.type === "cast"), `${sp.id} was cast: ${a.summary.text}`);
  }
  const one = dryRun("spell", byId("frost-burst"), { seed: 1, runs: 1 }), two = dryRun("spell", byId("frost-burst"), { seed: 2, runs: 1 });
  assert.notEqual(JSON.stringify(one.events), JSON.stringify(two.events), "another seed rolls other dice");
  assert.equal(JSON.stringify(dryRun("spell", byId("ember-dart"), { runs: 3 })), JSON.stringify(dryRun("spell", byId("ember-dart"), { seed: 1, runs: 3 })), "seed 1 is the default");
});

test("a dry run changes no lookup and no other game, and leaves no overlay installed", () => {
  const other = newGame(9), kept = JSON.stringify(other), keys = picture();
  const before = Object.keys(SPELLS).length;
  for (const sp of PACK.spells) dryRun("spell", sp, { seed: 5, pack: PACK, runs: 2 });
  dryRunPack(PACK, { seed: 5, runs: 2 });
  assert.equal(JSON.stringify(other), kept, "a second game alive beside it is untouched");
  assert.deepEqual(picture(), keys);
  assert.equal(Object.keys(SPELLS).length, before);
  assert.equal(SPELLS["hb-sample-ember-dart"], undefined);
  assert.equal(CONTENT.spells["hb-sample-ember-dart"], undefined);
  assert.equal(installed(), null);
  // And again after a run that is refused part-way (the engine refuses a cast).
  const refused = dryRun("spell", { ...byId("ember-dart"), range: 5 }, { seed: 5 });
  assert.ok(refused.ok);
  assert.deepEqual(picture(), keys);
});

test("a refused entry returns the problems and runs nothing", () => {
  const cases = [
    { ...byId("ember-dart"), glow: true },
    { ...byId("ember-dart"), id: "ember-dart" },
    { ...byId("ember-dart"), source: "the-book" },
    { ...byId("ember-dart"), checked: true },
    { ...byId("ember-dart"), effects: [{ damage: "x", type: "fire" }] },
  ];
  for (const e of cases) {
    const r = dryRun("spell", e, { seed: 1 });
    assert.equal(r.ok, false);
    assert.ok(r.problems.length > 0 && r.problems.every((p) => typeof p === "string"));
    assert.equal(r.events, undefined);
    assert.equal(r.repeated, undefined);
  }
  for (const bad of [null, undefined, 5, "x", [], { __proto__: null }]) { const r = dryRun("spell", bad, {}); assert.equal(r.ok, false); assert.ok(r.problems.length); }
  assert.equal(dryRun("monster", byId("ember-dart")).ok, false);
  for (const o of [{ seed: -1 }, { seed: 1.5 }, { seed: 2 ** 31 }, { runs: 0 }, { runs: DRYRUN_LIMITS.runs + 1 }, { level: 21 }, { slot: 10 }, null]) assert.equal(dryRun("spell", byId("ember-dart"), o).ok, false, JSON.stringify(o));
  assert.equal(dryRun("spell", byId("mending-light"), { slot: 0 }).ok, false);
  assert.match(dryRun("spell", byId("frost-burst"), { slot: 1 }).problems[0], /too low/);
});

test("a spell whose only step is manual returns the manual event and says the DM does it", () => {
  const spell = { ...byId("latch-wisp"), id: "hb-sample-only-manual", name: "Only Manual", effects: [{ manual: "The DM decides what the shadow whispers." }] };
  const r = dryRun("spell", spell, { seed: 3 });
  assert.ok(r.ok && r.ran, r.summary?.text);
  const manual = r.events.filter((e) => e.type === "manual");
  assert.ok(manual.length >= 1);
  assert.ok(manual.some((e) => /shadow whispers/.test(e.text)));
  assert.match(r.summary.text, /The DM does this \(Only Manual\): .*shadow whispers/);
  assert.ok(r.summary.handedToDM.length >= 1);
  assert.equal(r.events.some((e) => ["damage", "heal", "save", "attack"].includes(e.type)), false);
  assert.equal(r.repeated.castsHandedToDM, r.repeated.runs);
});

test("what happens is told: rolls, damage, healing, conditions, a push, a fall", () => {
  const dart = dryRun("spell", byId("ember-dart"), { seed: 3 });
  assert.match(dart.summary.text, /attacks .*against AC \d+: a (hit|miss|critical hit)/);
  assert.ok(dart.repeated.hitRate > 20 && dart.repeated.hitRate < 95);
  const cone = dryRun("spell", byId("gale-cone"), { seed: 3 });
  assert.match(cone.summary.text, /saves on STR/);
  assert.ok(cone.events.some((e) => e.type === "moved" && e.forced), "a creature that failed was pushed");
  assert.ok(cone.summary.targets.length > 1);
  const mend = dryRun("spell", byId("mending-light"), { seed: 3 });
  assert.ok(mend.events.some((e) => e.type === "heal" && e.amount > 0) && mend.repeated.avgHealing > 3);
  const snare = dryRun("spell", byId("gloom-snare"), { seed: 3 });
  assert.ok(snare.repeated.saves === snare.repeated.runs && snare.repeated.saveRate > 5 && snare.repeated.saveRate < 90);
  assert.ok(dryRun("spell", byId("hollow-floor"), { seed: 3 }).events.some((e) => e.type === "fell"));
  assert.ok(dryRun("spell", byId("shifting-step"), { seed: 3 }).events.some((e) => e.type === "moved" && e.teleport));
  const reaction = dryRun("spell", byId("quiet-word"), { seed: 3 });
  assert.ok(reaction.ok && reaction.ran === false && reaction.events.length === 0);
  assert.match(reaction.summary.text, /did not run/);
});

test("a cantrip grows with the caster's level and a spell with its slot", () => {
  const low = dryRun("spell", byId("ember-dart"), { seed: 1, level: 1 }), high = dryRun("spell", byId("ember-dart"), { seed: 1, level: 17 });
  assert.ok(high.repeated.avgDamage > low.repeated.avgDamage * 2, `${low.repeated.avgDamage} then ${high.repeated.avgDamage}`);
  const s3 = dryRun("spell", byId("frost-burst"), { seed: 1 }), s6 = dryRun("spell", byId("frost-burst"), { seed: 1, slot: 6 });
  assert.ok(s6.repeated.avgDamage > s3.repeated.avgDamage);
  assert.match(s6.summary.lines[0], /level 6 slot/);
});

test("the repeats are bounded, and the result says when a ceiling stopped them", () => {
  const light = dryRun("spell", byId("jarring-note"), { seed: 1 });
  assert.equal(light.repeated.runs, DRYRUN_LIMITS.runs);
  assert.equal(light.repeated.stopped, null);
  assert.equal(dryRun("spell", byId("jarring-note"), { seed: 1, runs: 7 }).repeated.runs, 7);
  assert.equal(dryRun("spell", byId("jarring-note"), { seed: 1, runs: 1 }).repeated.runs, 1);
  // The heaviest spell the checks allow: a sphere with many steps, each rolling for ten creatures.
  const many = Array.from({ length: 4 }, () => ({ save: "dex", half: true, onFail: [{ damage: "10d6", type: "fire" }] }));
  const heavy = { ...byId("frost-burst"), id: "hb-sample-heavy", name: "Heavy", effects: many };
  const r = dryRun("spell", heavy, { seed: 1 });
  assert.ok(r.ok, r.problems?.join("; "));
  assert.ok(r.repeated.stopped, "a ceiling stopped it");
  assert.match(r.repeated.stopped, /ceiling/);
  assert.match(r.summary.text, /ceiling/);
  assert.ok(r.repeated.runs < DRYRUN_LIMITS.runs && r.repeated.runs >= 1);
  assert.ok(r.events.length <= DRYRUN_LIMITS.shown);
  assert.equal(r.truncated, r.events.length === DRYRUN_LIMITS.shown);
  // A spell the checks refuse for its work is never run.
  const toomuch = { ...heavy, effects: [...many, ...many, ...many] };
  assert.equal(dryRun("spell", toomuch, { seed: 1 }).ok, false);
});

test("dryRunPack tries every spell of a pack in order, and a refused pack runs none", () => {
  const r = dryRunPack(PACK, { seed: 2, runs: 2 });
  assert.ok(r.ok);
  assert.deepEqual(r.results.map((x) => x.id), PACK.spells.map((s) => s.id));
  const bad = dryRunPack({ ...PACK, spells: [{ ...PACK.spells[0], glow: 1 }] });
  assert.equal(bad.ok, false);
  assert.deepEqual(bad.results, []);
});

test("dryrun.js is pure: no I/O, clock or Math.random", () => {
  const src = readFileSync(new URL("../src/content/dryrun.js", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
  for (const bad of [/node:/, /Math\.random/, /Date\b/, /performance\./, /process\./, /\bfetch\b/, /setTimeout|setInterval/]) assert.doesNotMatch(src, bad);
});

test("a homebrew spell aimed at an object (a copy of Knock) is tried on a locked chest, and unlocks it", () => {
  const k = structuredClone(SPELLS.knock.def ?? SPELLS.knock);
  Object.assign(k, { id: "hb-t-knock", name: "Zz Knock", source: "homebrew:t", checked: false });
  const r = dryRun("spells", k);
  assert.ok(r.ok, JSON.stringify(r.problems));
  assert.ok(r.events.some((e) => e.type === "cast" && e.object === "dryrun-chest"));
  assert.ok(r.events.some((e) => e.type === "object" && e.object === "dryrun-chest" && e.state === "closed"), "unlocked: locked to closed");
});
