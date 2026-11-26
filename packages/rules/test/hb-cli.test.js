// The command-line tool scripts/hb.mjs (docs/specs/homebrew.md, task B12): each command, run on a sample file.
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HOMEBREW_LIMITS } from "../src/content/schema.js";

const HB = new URL("../../../scripts/hb.mjs", import.meta.url).pathname;
const SAMPLE = new URL("./fixtures/sample-pack.json", import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), "hb-cli-"));
after(() => rmSync(dir, { recursive: true, force: true }));
const hb = (...args) => { const r = spawnSync(process.execPath, [HB, ...args], { encoding: "utf8", timeout: 60000 }); return { code: r.status, out: r.stdout, err: r.stderr }; };
const file = (name, text) => { const p = join(dir, name); writeFileSync(p, text); return p; };
const sample = () => JSON.parse(readFileSync(SAMPLE, "utf8"));

test("lint: a good pack prints ok and exits 0", () => {
  const r = hb("lint", SAMPLE);
  assert.equal(r.code, 0);
  assert.match(r.out, /Sample Pack: ok \(21 spells\)/);
  assert.equal(r.err, "");
});

test("lint: problems go to stderr in plain sentences and the exit is 1", () => {
  const bad = sample(); bad.spells[0].glow = true; bad.spells[1].id = "frost-burst";
  const r = hb("lint", file("bad.json", JSON.stringify(bad)));
  assert.equal(r.code, 1);
  assert.match(r.err, /problem: .*"glow" is not something a spell has/);
  assert.equal(r.out, "");
  const notjson = hb("lint", file("junk.json", "{ nope"));
  assert.equal(notjson.code, 1);
  assert.match(notjson.err, /not JSON/);
  assert.equal(hb("lint", join(dir, "missing.json")).code, 1);
  assert.equal(hb("lint", dir).code, 1);
});

test("a file over the pack byte limit is refused before it is parsed", () => {
  const big = file("big.json", "x".repeat(HOMEBREW_LIMITS.packBytes + 1));
  for (const cmd of ["lint", "read", "dryrun"]) {
    const r = hb(cmd, big);
    assert.equal(r.code, 1, cmd);
    assert.match(r.err, /at most 262144 bytes/);
    assert.doesNotMatch(r.err, /not JSON/, "it was never parsed");
  }
});

test("read: prints each spell's reading, the tier and the author's text, and exits 0", () => {
  const r = hb("read", SAMPLE);
  assert.equal(r.code, 0);
  assert.match(r.out, /^Ember Dart \[auto\]$/m);
  assert.match(r.out, /The caster makes a ranged spell attack roll against one creature within 120 feet\./);
  assert.match(r.out, /^Latch Wisp \[manual\]$/m);
  assert.match(r.out, /The DM does: .*latch, bolt or lock/);
  assert.match(r.out, /Author's text: "A wisp of light/);
  assert.equal(r.out.match(/^[A-Z][A-Za-z' ]+ \[(auto|assist|manual)\]$/gm).length, 21);
  assert.equal(hb("read", file("bad2.json", JSON.stringify({ ...sample(), v: 2 }))).code, 1);
});

test("read: reads the monsters of a pack too, and a problem the reader finds exits 1", () => {
  const PACK = new URL("./fixtures/reader-kinds-pack.json", import.meta.url).pathname;
  const r = hb("read", PACK);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^Cinderjaw Hound \[assist\]$/m);
  assert.match(r.out, /^ {2}Trait "Pack Tactics": the engine runs this\.$/m);
  assert.match(r.out, /^ {2}The DM does: The trait "Ember Memory": text only\.$/m);
  const pack = JSON.parse(readFileSync(PACK, "utf8"));
  // A problem the reader finds that the gate lets through (#421: a creature target with no reach or range is refused by the gate now): exit 1.
  const odd = structuredClone(pack);
  odd.monsters[2].actions.push({ id: "odd-lash", name: "Odd Lash", text: "x", target: { creature: { reach: 5 } }, effects: [{ save: "str", dc: 12, half: true, onFail: [{ damage: "1d6", type: "fire" }], onSuccess: [{ damage: "1d4", type: "fire" }] }] });
  const flagged = hb("read", file("odd.json", JSON.stringify(odd)));
  assert.equal(flagged.code, 1, "the pack holds a monster the reader flags");
  assert.match(flagged.err, /problem: hb-rk-hollow-reaver: .*success steps beside half are never run/);
  pack.monsters = pack.monsters.slice(0, 2); pack.weapons = [{ id: "hb-rk-stick", name: "Stick", category: "simple", kind: "melee", damage: "1d4", type: "bludgeoning", properties: [], mastery: "graze", weight: 4, cost: "2 SP", source: "homebrew:rk", checked: false }];
  const ok = hb("read", file("monsters.json", JSON.stringify(pack)));
  assert.equal(ok.code, 0, ok.err);
  assert.match(ok.out, /^Gloomwing Warden \[assist\]$/m);
  assert.match(ok.out, /^Stick \[no tier\]$/m);
  assert.doesNotMatch(ok.out, /Not read yet/);
  const none = { ...pack, monsters: [], items: [], feats: [], weapons: [], armour: [], objects: [] }; delete none.spells;
  assert.equal(hb("read", file("empty.json", JSON.stringify(none))).code, 1);
});

test("read: reads the items and feats of a pack, in words, and says what the DM does", () => {
  const PACK = new URL("./fixtures/reader-kinds-pack.json", import.meta.url).pathname;
  const r = hb("read", PACK);
  assert.equal(r.code, 0, r.err);
  const pack = JSON.parse(readFileSync(PACK, "utf8"));
  for (const e of [...pack.items, ...pack.feats]) assert.ok(r.out.includes(`${e.name} [${e.tier}]`), `${e.id} is read`);
  assert.match(r.out, /^ {2}Tier: |^Tier: /m);
  assert.doesNotMatch(r.out, /Not read yet.*(items|feats)/);
  assert.match(r.out, /needs attunement/);
  assert.match(r.out, /^ {2}The DM does: /m);
  const only = { ...pack, monsters: [], spells: undefined };
  delete only.spells;
  assert.equal(hb("read", file("itemsfeats.json", JSON.stringify(only))).code, 0);
});

test("read: reads the weapons, armour and objects of a pack, in words, and reads nothing as not read yet", () => {
  const PACK = new URL("./fixtures/reader-kinds-pack.json", import.meta.url).pathname;
  const r = hb("read", PACK);
  assert.equal(r.code, 0, r.err);
  const pack = JSON.parse(readFileSync(PACK, "utf8"));
  for (const e of pack.weapons.concat(pack.armour)) assert.ok(r.out.includes(`${e.name} [no tier]`), `${e.id} is read`);
  for (const e of pack.objects) assert.ok(r.out.includes(`${e.name} [${e.tier}]`), `${e.id} is read`);
  assert.doesNotMatch(r.out, /Not read yet/);
  assert.match(r.out, /Strength modifier/);
  assert.match(r.out, /sets the Armor Class to/);
  assert.match(r.out, /^ {4}State "shut", called "shut"/m);
  assert.match(r.out, /^ {2}The DM does: /m);
  const gear = { ...pack, monsters: [], items: [], feats: [] };
  delete gear.spells;
  assert.equal(hb("read", file("gear.json", JSON.stringify(gear))).code, 0);
  const onlyObjects = { ...gear, weapons: [], armour: [] };
  assert.equal(hb("read", file("objects.json", JSON.stringify(onlyObjects))).code, 0);
  // A weapon the gate refuses is not read as if it passed: the reader says it is refused, and exits 1.
  const refused = { ...gear, weapons: [{ ...pack.weapons[0], properties: ["glows"] }], armour: [], objects: [] };
  const bad = hb("read", file("refused.json", JSON.stringify(refused)));
  assert.notEqual(bad.code, 0);
});

test("dryrun: prints each spell's cast, is the same twice for a seed, and differs for another", () => {
  const a = hb("dryrun", SAMPLE, "--seed", "7", "--runs", "3"), b = hb("dryrun", SAMPLE, "--seed", "7", "--runs", "3"), c = hb("dryrun", SAMPLE, "--seed", "8", "--runs", "3");
  assert.equal(a.code, 0, a.err);
  assert.equal(a.out, b.out);
  assert.notEqual(a.out, c.out);
  assert.match(a.out, /^== Ember Dart \(seed 7\)$/m);
  assert.match(a.out, /Tavin \(level 1\) casts Ember Dart\./);
  assert.match(a.out, /Over 3 casts \(seeds 7 to 9\)/);
  assert.match(a.out, /The DM does this \(Latch Wisp\)/);
  assert.equal((a.out.match(/^== /gm) ?? []).length, 21);
  const ev = hb("dryrun", SAMPLE, "--runs", "1", "--events");
  assert.match(ev.out, /^ {2}\{"type":"cast"/m);
});

test("dryrun: the options are checked, and the default seed is 1", () => {
  assert.equal(hb("dryrun", SAMPLE, "--seed", "x").code, 2);
  assert.equal(hb("dryrun", SAMPLE, "--seed").code, 2);
  assert.equal(hb("dryrun", SAMPLE, "--wat").code, 2);
  const tooMany = hb("dryrun", SAMPLE, "--runs", "999");
  assert.equal(tooMany.code, 1);
  assert.match(tooMany.err, /number of casts/);
  assert.match(hb("dryrun", SAMPLE, "--runs", "1").out, /\(seed 1\)/);
});

test("wrong use prints the usage and exits 2", () => {
  for (const args of [[], ["lint"], ["lint", SAMPLE, SAMPLE], ["shout", SAMPLE], ["lint", SAMPLE, "--seed", "1"]]) {
    const r = hb(...args);
    assert.equal(r.code, 2, args.join(" "));
    assert.match(r.err, /Usage:/);
  }
});

test("read: reads a pack's subclasses (the list is named \"subclasses\", not \"subclasss\")", () => {
  const pack = { format: "hextable-pack", v: 1, pack: { id: "ember-folk", name: "Ember Folk", version: 1, license: "CC0, by the author", attribution: "Written for a test." },
    subclasses: [{ id: "hb-ember-folk-oath-of-the-ember", name: "Oath of the Ember", class: "paladin", source: "homebrew:ember-folk", checked: false, text: "Paladins sworn to keep a hearth-fire burning.",
      features: [{ id: "hb-ember-folk-warm", name: "Warm Heart", level: 3, tier: "manual", checked: false, text: "You do not suffer from cold weather." }] }] };
  const r = hb("read", file("subclasses.json", JSON.stringify(pack)));
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Oath of the Ember/);
  assert.match(r.out, /Warm Heart/);
});
