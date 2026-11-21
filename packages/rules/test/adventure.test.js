// Modules A1 (docs/specs/adventure-module.md, Decisions 2 to 5; build row A1): the format, the budget, the linter, the
// canonical form, the JSON form and the placing of creatures. No zip: the module is read from the JSON form.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  ADVENTURE_LIMITS as L, budget, canonical, lintAdventure, migrateAdventure, placeIn, readAdventureJson, refusal, SRD_ATTRIBUTION,
} from "../src/adventure.js";
import { b64, PICTURES } from "./fixtures/adventure-pictures.js";
import { EDITS } from "../src/map.js";
import { STOCK_MAPS } from "../src/content/maps/index.js";

const FIXTURE = readFileSync(new URL("./fixtures/adventure-flooded-mill.json", import.meta.url), "utf8");
const sha = (u8) => createHash("sha256").update(u8).digest("hex");
const FOUND = ["a-gate", "a-oswin"];                                  // the example is lean for its ledger picture
const fresh = () => { const r = readAdventureJson(FIXTURE); assert.ok(r.ok, r.problems.join("; ")); const { manifest, data } = r.unpacked; return { manifest, data, found: [...FOUND] }; };
const lint = (u, opts) => lintAdventure(u, opts);
function clean(u, opts) { const r = lint(u, opts); assert.deepEqual(r.problems, []); assert.equal(r.ok, true); return r; }
function refused(u, words, opts) {
  const r = lint(u, opts);
  assert.equal(r.ok, false, "the module should be refused");
  for (const p of r.problems) assert.match(p, /^[A-Za-z"].*[.)]$/s, `a plain sentence: ${p}`);
  if (words) assert.ok(r.problems.some((p) => words.test(p)), `one problem says ${words}: ${r.problems.join(" | ")}`);
  return r;
}
const edit = (f) => { const u = fresh(); f(u.manifest, u.data); return u; };
const str = (n, c = "x") => c.repeat(n);

// ---------- the worked example ----------
test("the worked example (lean, no store) lints clean, with the XP of the SRD's own example", () => {
  const r = clean(fresh());
  assert.deepEqual(r.missing, ["a-ledger"]);                          // lean for one picture: reported, not refused
  assert.deepEqual(r.unused, []);
  assert.deepEqual(r.unsupported, []);
  assert.equal(r.encounters["cellar-rats"].xp, 150);
  assert.equal(r.encounters["loft-goblins"].xp, 200);
});

test("the JSON form with every picture's bytes reads, and each picture is checked against the manifest", () => {
  const doc = JSON.parse(FIXTURE);
  doc.pictures = Object.fromEntries(Object.entries(PICTURES).map(([id, p]) => [id, b64(p.bytes)]));
  const r = readAdventureJson(doc, { sha256: sha });
  assert.ok(r.ok, r.problems.join("; "));
  assert.deepEqual(r.unpacked.found.sort(), ["a-gate", "a-ledger", "a-oswin"]);
  const full = clean(r.unpacked);
  assert.deepEqual(full.missing, []);
});

test("migrateAdventure is safe to repeat and leaves a newer format alone; the linter refuses it by its version", () => {
  const u = fresh(), once = migrateAdventure(u), twice = migrateAdventure(once);
  assert.deepEqual(twice, once);
  const newer = edit((m) => { m.v = 2; });
  assert.equal(migrateAdventure(newer), newer);
  refused(newer, /^v: This module is format 2; this game reads format 1\. Update the game\.$/);
});

test("a module with a store, an atlas or a pack still lints, with each named as not in this game yet", () => {
  const u = edit((m, d) => {
    d.markets = [{ format: "hextable-market", v: 1, id: "mill-goods" }];
    d.shops = [{ id: "miller-stall", market: "mill-goods" }];
    d.world = { format: "hextable-world" };
  });
  const r = clean(u);
  assert.deepEqual(r.unsupported.map((x) => x.section), ["world", "markets", "shops"]);
  for (const x of r.unsupported) assert.match(x.sentence, /not in this game yet/);
  assert.equal(r.encounters["cellar-rats"].creatures, 6);             // the rest is linted as usual
  refused(edit((m, d) => { d.homebrew = []; }), /homebrew: a module that says it is SRD-only/);
  refused(edit((m) => { m.needs.homebrew = [{ id: "ember-folk", version: 2, hash: "sha256:00" }]; }), /needs\/homebrew: .*not in this game yet/);
});

// ---------- canonical ----------
test("canonical gives one string for a full and a lean copy, ignores key order and the data file's own bytes", () => {
  const lean = fresh(), full = fresh();
  full.found = ["a-gate", "a-oswin", "a-ledger"];
  assert.equal(canonical(lean), canonical(full));
  const reordered = { data: lean.data, manifest: Object.fromEntries(Object.entries(lean.manifest).reverse()) };
  assert.equal(canonical(reordered), canonical(lean));
  const rezipped = fresh();
  rezipped.manifest.data = { ...rezipped.manifest.data, bytes: 1, sha256: "f".repeat(64) };
  assert.equal(canonical(rezipped), canonical(lean));
  const text = fresh(); text.data.scenes[0].notes += "!";
  assert.notEqual(canonical(text), canonical(lean));
  const pic = fresh(); pic.manifest.pictures["a-gate"].sha256 = "1".repeat(64);
  assert.notEqual(canonical(pic), canonical(lean), "a changed picture changes the hash");
});

// ---------- the budget: hostile cases 8, 9, 10, 13 ----------
test("not JSON, an array, a string: refused with one sentence", () => {
  for (const bad of ["{", "[]", '"x"', "\ufeff{}", "null"]) {
    const r = readAdventureJson(bad);
    assert.equal(r.ok, false); assert.equal(r.problems.length, 1);
  }
  assert.equal(lint({ manifest: [], data: "x" }).ok, false);
});

test("a depth bomb is refused in bounded time with no stack overflow", () => {
  let deep = [];
  for (let i = 0; i < 10000; i++) deep = [deep];
  const t = Date.now();
  const u = fresh(); u.data.notes = [{ id: "n", at: { map: "mill", region: "cellar" }, title: "t", dm: deep }];
  const r = refused(u, /nests deeper than 16 levels/);
  assert.match(r.problems[0], /^notes\/0\/dm/);
  assert.ok(Date.now() - t < 2000);
  assert.ok(budget(u).length > 0);
});

test("depth 16 passes and 17 fails", () => {
  const nest = (n) => { let v = "x"; for (let i = 0; i < n - 1; i++) v = [v]; return v; };   // a list n-1 deep holding text
  assert.deepEqual(budget({ manifest: { a: nest(16) }, data: {} }), []);      // the root object is level 1, 15 lists inside it are level 16
  assert.ok(budget({ manifest: { a: nest(17) }, data: {} }).some((p) => /nests deeper than 16/.test(p)));
});

test("prototype keys at any depth, in the manifest, the data and a map: refused, and Object.prototype is untouched", () => {
  for (const key of ["__proto__", "constructor", "prototype"]) {
    for (const where of ["manifest", "data", "map"]) {
      const u = fresh();
      const holder = where === "manifest" ? u.manifest.module : where === "data" ? u.data.start : u.data.maps.mill.levels[0];
      Object.defineProperty(holder, key, { value: { x: 1 }, enumerable: true, configurable: true, writable: true });
      refused(u, new RegExp(`key "${key}"`));
    }
  }
  const json = readAdventureJson(FIXTURE.replace('"settings"', '"__proto__": {"polluted": true}, "settings"'));
  assert.ok(json.ok);
  refused(json.unpacked, /key "__proto__"/);
  assert.equal({}.polluted, undefined);
  assert.deepEqual(Object.keys(Object.prototype), []);
});

test("control characters and direction overrides in a name are refused; a line break only in a long text", () => {
  for (const bad of ["a\u202eb", "a\u2066b", "a\u0000b", "a\nb", "a\u2028b", "a\u007fb"]) refused(edit((m, d) => { d.scenes[0].title = bad; }), /scenes\/0\/title: The text has a control character/);
  refused(edit((m, d) => { d.scenes[0].readAloud = "one\u202etwo"; }), /readAloud/);
  clean(edit((m, d) => { d.scenes[0].readAloud = "one\ntwo"; }), { found: FOUND });
  refused(edit((m, d) => { d.scenes[0].title = "ok"; d.scenes[0]["a\u202eb"] = 1; }), /key has a character/);
});

test("a function or a non-finite number is not data", () => {
  refused(edit((m, d) => { d.start.clock = () => 1; }), /not data/);
  refused(edit((m, d) => { d.start.clock = Infinity; }), /A number JSON cannot hold/);
});

// ---------- the byte caps ----------
function sized(n) {                       // a JSON value of exactly n bytes, of strings under the string cap
  const parts = [];
  let left = n - 2 - 1 - 2 - 1;           // {"p":[ ... ]}  minus its punctuation: {"p":[ is 6 bytes, ]} is 2
  left = n - 8;
  while (left > 0) {
    const take = Math.min(L.string, left - 2);                          // "..." is two quotes
    if (take < 0) break;
    parts.push("x".repeat(take)); left -= take + 2 + 1;                 // and the comma
  }
  return { p: parts };
}
test("the manifest passes at 128 KB and fails one byte past; the data likewise at 4 MB", () => {
  for (const [key, most] of [["manifest", L.manifestBytes], ["data", L.dataBytes]]) {
    for (const [extra, ok] of [[0, true], [1, false]]) {
      const doc = { manifest: {}, data: {} };
      let v = sized(most + extra);
      // Trim or pad the last string so the JSON is exactly the size asked for.
      const bytes = () => Buffer.byteLength(JSON.stringify(v));
      const last = v.p.length - 1;
      v.p[last] = "x".repeat(Math.max(0, v.p[last].length + (most + extra - bytes())));
      assert.equal(bytes(), most + extra);
      doc[key] = v;
      const r = budget(doc);
      assert.equal(r.length === 0, ok, `${key} ${most + extra}: ${r.join(" | ")}`);
    }
  }
});
test("a string of 8,000 letters passes and one of 8,001 fails", () => {
  assert.deepEqual(budget({ manifest: {}, data: { a: str(L.string) } }), []);
  assert.ok(budget({ manifest: {}, data: { a: str(L.string + 1) } }).some((p) => /letters long/.test(p)));
});

// ---------- unknown fields: hostile cases 11, 18, 25 ----------
test("unknown fields anywhere are refused with their path", () => {
  refused(edit((m, d) => { d.scenes[0].script = "x"; }), /^scenes\/gate: "script" is not a field a module has here\.$/);
  refused(edit((m, d) => { d.notes[0].public = true; }), /^notes\/n-cellar: "public" is not a field/);
  refused(edit((m, d) => { d.scenes[0].onload = "x"; d.handouts[0].html = "<b>"; }), /handouts\/ledger: "html"/);
  refused(edit((m) => { m.module.eval = 1; }), /^module: "eval"/);
  refused(edit((m, d) => { d.start.expr = "1+1"; }), /^start: "expr"/);
  refused(edit((m) => { m.onload = 1; }), /^: "onload"|"onload" is not a field/);
  refused(edit((m, d) => { d.encounters[0].creatures[0].formula = "1"; }), /creatures\/0: "formula"/);
});
test("progress and a character file inside a module are unknown fields", () => {
  for (const k of ["state", "rng", "key", "history", "delta", "cid", "blocks"]) {
    refused(edit((m, d) => { d[k] = {}; }), new RegExp(`"${k}" is not a field`));
    refused(edit((m, d) => { d.pregens = [{ id: "p", sheet: { ...{ name: "A", class: "fighter", level: 1 }, [k]: {} } }]; }), /pregens\/p\/sheet/);
  }
});
test("settings: an unknown key, a role, dm or members key, and a value outside the choices are refused", () => {
  refused(edit((m, d) => { d.settings.nonsense = true; }), /^settings\/nonsense: is not a table setting/);
  for (const k of ["role", "dm", "members"]) refused(edit((m, d) => { d.settings[k] = "dm"; }), new RegExp(`settings/${k}: is not a table setting`));
  refused(edit((m, d) => { d.settings.cover = "sometimes"; }), /^settings\/cover: can be on, off\.$/);
  clean(edit((m, d) => { d.settings = { diagonals: "srd", cover: "on", away: "dodge", characters: "own", level: 1, takeaway: "everything", autoEngage: false, engageRange: 30 }; }), { found: FOUND });
  refused(edit((m, d) => { d.settings.engageRange = "30"; }), /engageRange/);
  refused(edit((m, d) => { d.settings.takeaway = "all"; }), /takeaway/);
  refused(edit((m, d) => { d.settings.level = 21; }), /settings\/level/);
});

// ---------- text that looks like code (case 12) ----------
test("text that looks like code is accepted as text", () => {
  clean(edit((m, d) => {
    m.module.title = "<img src=x onerror=alert(1)>";
    d.notes[0].dm = "javascript:alert(1)";
    d.scenes[0].readAloud = "<script>alert(1)</script>";
  }), { found: FOUND });
});

// ---------- numbers (case 19) ----------
test("numbers: count 10^9, clock negative or 10^12, version 0 or a fraction", () => {
  refused(edit((m, d) => { d.encounters[0].creatures[0].count = 1e9; }), /creatures\/0: its count is a whole number, 1 to 40/);
  refused(edit((m, d) => { d.encounters[0].creatures[0].count = 0; }), /its count/);
  refused(edit((m, d) => { d.encounters[0].creatures[0].count = 1.5; }), /its count/);
  refused(edit((m, d) => { d.start.clock = -1; }), /^start\/clock/);
  refused(edit((m, d) => { d.start.clock = 1e12; }), /^start\/clock/);
  refused(edit((m, d) => { d.start.clock = 1.5; }), /^start\/clock/);
  clean(edit((m, d) => { d.start.clock = 0; }), { found: FOUND });
  clean(edit((m, d) => { d.start.clock = 1000000; }), { found: FOUND });
  for (const v of [0, 1.5, -1, 1e9]) refused(edit((m) => { m.module.version = v; }), /^module\/version/);
});

// ---------- references (the linter's pass 3) ----------
test("every reference resolves, with the spec's sentences", () => {
  refused(edit((m, d) => { d.start.map = "mil"; }), /^start: the map "mil" is not in this module\.$/);
  refused(edit((m, d) => { d.start.entry = "door"; }), /^start: the entry "door"/);
  refused(edit((m, d) => { d.start.scene = "nowhere"; }), /^start\/scene: the scene "nowhere"/);
  refused(edit((m, d) => { d.start.stage = ["cellar-ratz"]; }), /^start\/stage\/0: the encounter "cellar-ratz"/);
  refused(edit((m, d) => { d.start.light = { attic: "dark" }; }), /^start\/light\/attic: the level "attic"/);
  refused(edit((m, d) => { d.start.light = { cellar: "pitch" }; }), /^start\/light\/cellar: can be bright, dim, dark/);
  refused(edit((m, d) => { d.encounters[0].creatures[0].monster = "giant-ratt"; }), /^encounters\/cellar-rats\/creatures\/0: no such monster "giant-ratt"\.$/);
  refused(edit((m, d) => { d.encounters[0].creatures[0].monster = "hb-ember-folk-scout"; }), /no such monster "hb-ember-folk-scout"/);
  refused(edit((m, d) => { d.encounters[0].creatures[0].monster = "pc1"; }), /no such monster/);
  refused(edit((m, d) => { d.encounters[0].map = "cellar"; }), /^encounters\/cellar-rats\/map: the map "cellar" is not in this module\./);
  refused(edit((m, d) => { d.encounters[0].region = "celar"; }), /^encounters\/cellar-rats\/region: Region "celar" is not a region of this map\.$/);
  refused(edit((m, d) => { d.encounters[0].creatures[0].at = { region: "celar" }; }), /creatures\/0\/at: Region "celar"/);
  refused(edit((m, d) => { d.npcs[0].scenes = ["nowhere"]; }), /^npcs\/miller\/scenes\/0: the scene "nowhere"/);
  refused(edit((m, d) => { d.scenes[0].present = ["nobody"]; }), /^scenes\/gate\/present\/0: the person "nobody"/);
  refused(edit((m, d) => { d.notes[0].at = { map: "mill", region: "attic" }; }), /^notes\/n-cellar\/at: Region "attic"/);
  refused(edit((m, d) => { d.notes[0].at = { map: "mil", region: "cellar" }; }), /^notes\/n-cellar\/at: the map "mil"/);
  refused(edit((m, d) => { d.npcs[0].monster = "nope"; }), /^npcs\/miller\/monster: no such monster/);
  refused(edit((m, d) => { d.npcs[0].portrait = "a-nope"; }), /^npcs\/miller\/portrait: no picture "a-nope"/);
  refused(edit((m, d) => { d.scenes[0].image = "../../x"; }), /^scenes\/gate\/image: no picture "..\/..\/x"/);
  refused(edit((m, d) => { d.handouts[0].asset = "a/b"; }), /^handouts\/ledger\/asset: no picture "a\/b"/);
  refused(edit((m, d) => { delete d.handouts[0].text; delete d.handouts[0].asset; }), /^handouts\/ledger: needs a picture or some text/);
});
test("links need a module id that need not resolve; ids from the campaign's namespace are refused", () => {
  clean(edit((m, d) => { d.links = [{ to: "a-module-nobody-has", text: "Later." }]; }), { found: FOUND });
  refused(edit((m, d) => { d.links = [{ to: "flooded-mill/cellar-rats", text: "x" }]; }), /^links\/0\/to: must be the id of a module/);
  refused(edit((m) => { m.module.id = "flooded-mill/x"; }), /^module\/id/);
  refused(edit((m, d) => { d.encounters[0].id = "flooded-mill/cellar-rats"; d.start.stage = []; }), /^encounters\/0: needs an id/);
  refused(edit((m, d) => { d.scenes[0].id = "a/b"; }), /^scenes\/0: needs an id/);
  refused(edit((m, d) => { d.encounters[1].id = "cellar-rats"; }), /^encounters\/cellar-rats: its id is used twice/);
  clean(edit((m, d) => { d.npcs[0].id = "pc1"; d.encounters[0].id = "m12"; d.start.stage = ["m12"]; d.scenes[0].present = ["pc1"]; }), { found: FOUND });   // case 28
});

// ---------- pictures (case 14, 15) ----------
test("pictures that lie are refused with their id", () => {
  const doc = () => { const d = JSON.parse(FIXTURE); d.pictures = { "a-gate": b64(PICTURES["a-gate"].bytes) }; return d; };
  let r = readAdventureJson(doc(), { sha256: sha }); assert.ok(r.ok);
  const svg = doc(); svg.pictures["a-gate"] = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>').toString("base64");
  const wrongSize = readAdventureJson(svg, { sha256: sha });
  assert.match(wrongSize.problems[0], /^pictures\/a-gate: /);
  const svg2 = doc(); const s = Buffer.from(`<svg>${"x".repeat(100)}</svg>`.slice(0, PICTURES["a-gate"].bytes.length).padEnd(PICTURES["a-gate"].bytes.length, " "));
  svg2.pictures["a-gate"] = s.toString("base64");
  assert.match(readAdventureJson(svg2).problems[0], /^pictures\/a-gate: the picture is not a PNG, JPEG or WebP picture\.$/);
  const png = doc(); png.pictures["a-gate"] = b64(PICTURES["a-ledger"].bytes);
  assert.match(readAdventureJson(png).problems[0], /^pictures\/a-gate: the picture is not the file the module names \(its size differs\)/);
  const wrongMime = doc(); wrongMime.manifest.pictures["a-gate"].mime = "image/png";
  assert.match(readAdventureJson(wrongMime).problems[0], /^pictures\/a-gate: the picture is image\/webp, not the image\/png/);
  const swapped = doc(); const b = Uint8Array.from(PICTURES["a-gate"].bytes); b[20] = 9; swapped.pictures["a-gate"] = b64(b);
  assert.equal(readAdventureJson(swapped).ok, true, "without a hash function the fingerprint is the caller's");
  assert.match(readAdventureJson(swapped, { sha256: sha }).problems[0], /^pictures\/a-gate: the picture is not the file the module names \(its fingerprint differs\)\.$/);
  const unnamed = doc(); unnamed.pictures["a-extra"] = b64(PICTURES["a-gate"].bytes);
  assert.match(readAdventureJson(unnamed).problems[0], /^pictures\/a-extra: the module holds a picture the picture list does not name/);
  const traversal = doc(); traversal.pictures["../../x"] = b64(PICTURES["a-gate"].bytes);
  assert.match(readAdventureJson(traversal).problems[0], /^pictures\/"..\/..\/x"/);
  const notb64 = doc(); notb64.pictures["a-gate"] = "not base64!";
  assert.match(readAdventureJson(notb64).problems[0], /^pictures\/a-gate: the picture is not base64/);
  refused(edit((m) => { m.pictures["../../x"] = { ...m.pictures["a-gate"], file: "pictures/x.webp" }; }), /^pictures\/"..\/..\/x": a picture's id/);
  refused(edit((m) => { m.pictures["a-gate"].sha256 = "xyz"; }), /^pictures\/a-gate: its fingerprint/);
  refused(edit((m) => { m.pictures["a-gate"].mime = "image/svg+xml"; }), /^pictures\/a-gate: its type must be/);
  for (const f of ["../module.json", "pictures/../module.json", "pictures/./x.png", "pictures//x.png", "pictures\\x.png", "/abs.png", "C:\\x.png", "pictures/Gate.webp", "pictures/é.png", `pictures/${"a".repeat(92)}.png`]) {
    refused(edit((m) => { m.pictures["a-gate"].file = f; }), /^pictures\/a-gate: its file must be "pictures\/"/);
  }
  refused(edit((m) => { m.pictures["a-oswin"].file = m.pictures["a-gate"].file; }), /is the file of another picture/);
});
test("a picture in the lean copy's `found` that the list does not name is refused; one no section uses is reported, not stored", () => {
  const u = fresh(); u.found.push("a-extra");
  refused(u, /^pictures\/a-extra: /);
  const unused = edit((m) => { m.pictures["a-spare"] = { file: "pictures/spare.png", mime: "image/png", bytes: 10, sha256: "a".repeat(64) }; });
  assert.deepEqual(clean(unused).unused, ["a-spare"]);
});

// ---------- the picture caps (case 15) ----------
function withPictures(n, bytes = 1) {
  return edit((m) => {
    m.pictures = {};
    for (let i = 0; i < n; i++) m.pictures[`p-${i}`] = { file: `pictures/p${i}.png`, mime: "image/png", bytes, sha256: "b".repeat(64) };
  });
}
const noRefs = (u) => { u.data.scenes[0].image = undefined; delete u.data.scenes[0].image; delete u.data.npcs[0].portrait; delete u.data.handouts[0].asset; u.data.handouts[0].text ??= "x"; return u; };
test("300 pictures pass and 301 fail; 5 MB a picture passes and 5 MB + 1 fails; 90 MB in all passes and 90 MB + 1 fails", () => {
  clean(noRefs(withPictures(L.pictures)), { found: [] });
  refused(noRefs(withPictures(L.pictures + 1)), /^pictures: has 301 pictures; the most is 300/, { found: [] });
  clean(noRefs(withPictures(1, L.pictureBytes)), { found: [] });
  refused(noRefs(withPictures(1, L.pictureBytes + 1)), /^pictures\/p-0: its size/, { found: [] });
  const total = (n, last) => noRefs(edit((m) => {
    m.pictures = {};
    for (let i = 0; i < n; i++) m.pictures[`p-${i}`] = { file: `pictures/p${i}.png`, mime: "image/png", bytes: i === n - 1 ? last : L.pictureBytes, sha256: "c".repeat(64) };
  }));
  assert.equal(L.picturesBytes, 18 * L.pictureBytes);
  clean(total(18, L.pictureBytes), { found: [] });                                  // 18 x 5 MB = 90 MB exactly
  refused(total(19, 1), /^pictures: take 94,371,841 bytes in all; the most is 94,371,840/, { found: [] });
});

// ---------- the section caps ----------
const caps = [
  ["maps", L.maps, (u, n) => { const base = u.data.maps.mill; u.data.maps = {}; for (let i = 0; i < n; i++) u.data.maps[`m${i}`] = structuredClone(base); u.data.start.map = "m0"; u.data.encounters = []; u.data.start.stage = []; u.data.notes = []; }, /^maps: has 61 maps/],
  ["encounters", L.encounters, (u, n) => { u.data.encounters = Array.from({ length: n }, (_, i) => ({ id: `e${i}`, name: "E", map: "mill", creatures: [{ monster: "giant-rat", at: { region: "yard" } }] })); u.data.start.stage = []; }, /^encounters: has 201 encounters/],
  ["npcs", L.npcs, (u, n) => { u.data.npcs = Array.from({ length: n }, (_, i) => ({ id: `n${i}`, name: "N" })); u.data.scenes[0].present = []; }, /^npcs: has 201 NPCs/],
  ["scenes", L.scenes, (u, n) => { u.data.scenes = Array.from({ length: n }, (_, i) => ({ id: `s${i}`, title: "S" })); u.data.start.scene = "s0"; u.data.npcs[0].scenes = []; }, /^scenes: has 101 scenes/],
  ["handouts", L.handouts, (u, n) => { u.data.handouts = Array.from({ length: n }, (_, i) => ({ id: `h${i}`, title: "H", text: "t" })); }, /^handouts: has 201 handouts/],
  ["notes", L.notes, (u, n) => { u.data.notes = Array.from({ length: n }, (_, i) => ({ id: `n${i}`, at: { map: "mill", region: "yard" }, title: "N" })); }, /^notes: has 501 notes/],
  ["links", L.links, (u, n) => { u.data.links = Array.from({ length: n }, (_, i) => ({ to: `m${i}`, text: "t" })); }, /^links: has 21 links/],
  ["pregens", L.pregens, (u, n) => { u.data.pregens = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, sheet: { name: "Brenna", class: "fighter", level: 1, abilities: { str: 17, dex: 13, con: 15, int: 8, wis: 12, cha: 10 }, skills: ["perception", "survival"], extraSkills: ["athletics", "intimidation"], choices: { "fighting-style": "archery" }, armour: "chain-mail", shield: true, weapons: ["longsword", "javelin"] } })); }, /^pregens: has 9 heroes/],
];
for (const [name, most, make, words] of caps) {
  test(`${name}: ${most} pass and ${most + 1} fail`, () => {
    const at = fresh(); make(at, most); clean(at, { found: FOUND });
    const past = fresh(); make(past, most + 1); refused(past, words, { found: FOUND });
  });
}
test("a map passes at 1 MB as JSON and fails one byte past", () => {
  const size = (m) => Buffer.byteLength(JSON.stringify(m));
  for (const [extra, ok] of [[0, true], [1, false]]) {
    const u = fresh(), m = u.data.maps.mill;
    m.levels[1].name = "";
    m.levels[1].name = "x".repeat(L.mapBytes + extra - size(m));
    assert.equal(size(m), L.mapBytes + extra);
    const r = lintAdventure(u, { found: FOUND, limits: { string: 2 * L.mapBytes, dataBytes: 8 * L.mapBytes } });
    assert.equal(r.ok, ok, r.problems.join(" | "));
    if (!ok) assert.match(r.problems[0], /^maps\/mill: is 1,048,577 bytes as JSON; the most for a map is 1,048,576/);
  }
});
function bigYard(d) {                      // one level of 40 x 30 grass with the whole of it a region
  d.maps.mill.levels[0].tiles = Object.fromEntries(Array.from({ length: 40 }, (_, q) => Array.from({ length: 30 }, (__, r) => [`${q},${r}`, { t: "grass" }])).flat());
  d.maps.mill.regions = [{ id: "yard", name: "Yard", level: "ground", hexes: Object.keys(d.maps.mill.levels[0].tiles) }];
  d.maps.mill.objects = []; d.maps.mill.levels.pop(); d.start.light = {}; d.notes = []; d.start.scene = "gate";
}
test("creatures: 40 in an encounter pass and 41 fail; 1,000 in all pass and 1,001 fail", () => {
  const rats = (n) => ({ id: "swarm", name: "Swarm", map: "mill", creatures: [{ monster: "giant-rat", count: n, at: { region: "yard" } }] });
  clean(edit((m, d) => { bigYard(d); d.encounters = [rats(40)]; d.start.stage = []; }), { found: FOUND });
  refused(edit((m, d) => { d.encounters = [rats(41)]; d.start.stage = []; }), /its count/, { found: FOUND });
  refused(edit((m, d) => { d.encounters = [{ ...rats(1), creatures: Array.from({ length: 41 }, () => ({ monster: "giant-rat", at: { region: "yard" } })) }]; d.start.stage = []; }), /creatures: has 41 creatures/, { found: FOUND });
  const many = (n) => edit((m, d) => {
    bigYard(d);
    d.encounters = []; let left = n;
    for (let i = 0; left > 0; i++) { const c = Math.min(40, left); d.encounters.push({ id: `e${i}`, name: "E", map: "mill", creatures: [{ monster: "giant-rat", count: c, at: { region: "yard" } }] }); left -= c; }
    d.start.stage = [];
  });
  assert.equal(L.creaturesTotal, 1000);
  clean(many(1000), { found: FOUND });
  refused(many(1001), /^encounters: hold 1,001 creatures in all; the most is 1,000/, { found: FOUND });
});
test("names 60 and titles 80, texts 2,000, blurb and weather 500, licence text 8,000, by 200", () => {
  const cases = [
    ["name", (d, m, n) => { d.npcs[0].name = str(n); }, L.name], ["encounter name", (d, m, n) => { d.encounters[0].name = str(n); }, L.name],
    ["scene title", (d, m, n) => { d.scenes[0].title = str(n); }, L.title], ["handout title", (d, m, n) => { d.handouts[0].title = str(n); }, L.title],
    ["module title", (d, m, n) => { m.module.title = str(n); }, L.title], ["note title", (d, m, n) => { d.notes[0].title = str(n); }, L.title],
    ["readAloud", (d, m, n) => { d.scenes[0].readAloud = str(n); }, L.text], ["scene notes", (d, m, n) => { d.scenes[0].notes = str(n); }, L.text],
    ["dm", (d, m, n) => { d.notes[0].dm = str(n); }, L.text], ["roleplay", (d, m, n) => { d.npcs[0].roleplay = str(n); }, L.text],
    ["tactics", (d, m, n) => { d.encounters[0].tactics = str(n); }, L.text], ["handout text", (d, m, n) => { d.handouts[0].text = str(n); }, L.text],
    ["link text", (d, m, n) => { d.links[0].text = str(n); }, L.text], ["blurb", (d, m, n) => { m.module.blurb = str(n); }, L.blurb],
    ["weather", (d, m, n) => { d.start.weather = str(n); }, L.weather], ["by", (d, m, n) => { m.module.by = str(n); }, L.by],
    ["licence text", (d, m, n) => { m.module.licence.name = "other"; m.module.licence.text = str(n); }, L.licenceText],
  ];
  for (const [name, set, most] of cases) {
    clean(edit((m, d) => set(d, m, most)), { found: FOUND });
    const r = refused(edit((m, d) => set(d, m, most + 1)), /letters long; the most is/, { found: FOUND });
    assert.ok(r.problems.length >= 1, name);
  }
  clean(edit((m, d) => { d.npcs[0].name = "é".repeat(60); }), { found: FOUND });      // letters, not bytes
});

// ---------- the module block ----------
test("the module block: kinds, levels, dates, the licence and the SRD sentence", () => {
  refused(edit((m) => { m.module.kind = "saga"; }), /^module\/kind/);
  refused(edit((m) => { m.module.content = "public"; }), /^module\/content/);
  refused(edit((m) => { m.module.made = "2026-02-30"; }), /^module\/made/);
  refused(edit((m) => { m.module.level = { start: 3, min: 1, max: 2 }; }), /^module\/level/);
  refused(edit((m) => { m.module.licence.srd = `${SRD_ATTRIBUTION} `; }), /^module\/licence\/srd: is not the SRD's attribution sentence exactly/);
  refused(edit((m) => { delete m.module.licence.srd; }), /^module\/licence\/srd/);
  clean(edit((m) => { m.module.content = "private"; delete m.module.licence.srd; m.module.licence.name = "all-rights-reserved"; }), { found: FOUND });
  refused(edit((m) => { m.module.licence.name = "other"; }), /^module\/licence\/text/);
  refused(edit((m) => { m.needs.rules = "srd-5.1"; }), /^needs\/rules/);
  refused(edit((m) => { m.needs.grid = "octagon"; }), /^needs\/grid/);
  refused(edit((m) => { m.needs.grid = "square"; }), /^maps\/mill: is drawn on hexes/);
  clean(edit((m) => { m.needs.grid = "both"; }), { found: FOUND });
  refused(edit((m) => { m.needs.grid = "both"; }), /does not draw/, { found: FOUND, grids: ["hex"] });
  refused(edit((m) => { m.format = "other"; }), /^format:/);
  refused(edit((m) => { m.data.file = "x.json"; }), /^data\/file/);
});

// ---------- maps and where creatures stand (case 17) ----------
test("a map failing lintMap is refused with the map's sentence under its path", () => {
  refused(edit((m, d) => { d.maps.mill.levels[0].tiles["0,0"] = { t: "lava" }; }), /^maps\/mill: The tile at 0,0 on "ground" has unknown terrain "lava"\./);
  refused(edit((m, d) => { d.maps.mill.regions[0].level = "attic"; }), /^maps\/mill: Region "yard" is on a level that does not exist\./);
  refused(edit((m, d) => { d.maps.mill.holding = true; }), /holding map/);
  refused(edit((m, d) => { d.maps.mill.starts = []; }), /^start: the map "mill" has no starts/);
  refused(edit((m, d) => { d.maps.Mill = d.maps.mill; }), /^maps\/"Mill": a map's id/);
  refused(edit((m, d) => { d.maps.mill.levels[0].image = { asset: "a-nope", feet: [10, 10], origin: [0, 0] }; }), /^maps\/mill: level "ground" has a background that names no picture/);
  clean(edit((m, d) => { d.maps.mill.levels[0].image = { asset: "a-gate", feet: [10, 10], origin: [0, 0] }; d.scenes[0].image = "a-oswin"; d.npcs[0].portrait = "a-oswin"; }), { found: FOUND });
});
test("creatures: too few cells, a wall of rock, or a taken cell is a problem, never a quiet move", () => {
  const rats = (n) => (m, d) => { d.encounters[0].creatures[0].count = n; };
  clean(edit((m, d) => rats(12)(m, d)), { found: FOUND });                           // the cellar has 12 cells
  refused(edit((m, d) => rats(13)(m, d)), /^encounters\/cellar-rats\/creatures\/0\/at: The region "cellar" has room for 12 of the 13 creatures/, { found: FOUND });
  refused(edit((m, d) => { for (const k of Object.keys(d.maps.mill.levels[1].tiles).slice(0, 7)) d.maps.mill.levels[1].tiles[k] = { t: "rock" }; rats(6)(m, d); }), /has room for/, { found: FOUND });
  refused(edit((m, d) => { for (const k of Object.keys(d.maps.mill.levels[1].tiles)) d.maps.mill.levels[1].tiles[k] = { t: "rock" }; }), /has room for 0 of the 6/, { found: FOUND });
  // a cell: one creature, on ground
  const cell = (at, count = 1) => (m, d) => { d.encounters[0].creatures = [{ monster: "giant-rat", count, at }]; };
  clean(edit((m, d) => cell({ level: "cellar", q: 0, r: 0 })(m, d)), { found: FOUND });
  refused(edit((m, d) => cell({ level: "cellar", q: 9, r: 9 })(m, d)), /There is no ground at 9,9/, { found: FOUND });
  refused(edit((m, d) => cell({ level: "attic", q: 0, r: 0 })(m, d)), /Level "attic"/, { found: FOUND });
  refused(edit((m, d) => cell({ level: "cellar", q: 0, r: 0 }, 2)(m, d)), /a cell holds one creature/, { found: FOUND });
  refused(edit((m, d) => { d.encounters[0].creatures = [{ monster: "giant-rat", at: { level: "cellar", q: 0, r: 0 } }, { monster: "giant-rat", at: { level: "cellar", q: 0, r: 0 } }]; }), /is taken by another creature/, { found: FOUND });
  refused(edit((m, d) => { d.encounters[0].creatures = [{ monster: "giant-rat", at: { region: "cellar", q: 0 } }]; }), /"q" is not a field/, { found: FOUND });
});
test("placeIn sets creatures down in the order of the region's cells, the same way every time, passing over taken cells", () => {
  const map = fresh().data.maps.mill;
  const a = placeIn(map, "cellar", Array.from({ length: 6 }, () => ({ size: "small" })));
  assert.ok(a.ok);
  assert.deepEqual(a.at.slice(0, 3).map((p) => `${p.q},${p.r},${p.z}`), ["0,0,-10", "0,1,-10", "0,2,-10"]);
  assert.deepEqual(placeIn(map, "cellar", Array.from({ length: 6 }, () => ({ size: "small" }))).at, a.at);
  const more = placeIn(map, "cellar", [{ size: "small" }], [{ size: "small", pos: a.at[0] }]);
  assert.deepEqual(more.at[0], a.at[1], "the first cell is taken, so the next is used");
  const big = placeIn(map, "cellar", [{ size: "large" }, { size: "small" }]);
  assert.ok(big.ok);
  assert.ok(!(big.at[1].q === big.at[0].q && big.at[1].r === big.at[0].r), "a small creature does not stand in the large one's space");
  assert.equal(placeIn(map, "attic", []).ok, false);
  assert.equal(placeIn(map, "cellar", Array.from({ length: 13 }, () => ({ size: "small" }))).placed, 12);
});

// ---------- strings and refusals ----------
test("a refusal reads the first ten problems, then 'and N more.'", () => {
  const u = edit((m, d) => { d.scenes = Array.from({ length: 14 }, (_, i) => ({ id: `s${i}` })); d.start.scene = "s0"; d.npcs[0].scenes = []; });
  const r = lint(u, { found: FOUND });
  assert.equal(r.problems.length, 14);
  const words = refusal(r);
  assert.equal(words.length, 11);
  assert.equal(words[10], "and 4 more.");
  assert.deepEqual(refusal({ problems: ["a."] }), ["a."]);
});
test("a pregen is a sheet the engine's own check passes", () => {
  refused(edit((m, d) => { d.pregens = [{ id: "tamsin", sheet: { name: "Tamsin", class: "bard-of-nothing", level: 1 } }]; }), /^pregens\/tamsin\/sheet: Choose a class/, { found: FOUND });
  refused(edit((m, d) => { d.pregens = [{ id: "tamsin", sheet: { name: "T", class: "fighter", level: 1, cid: "x" } }]; }), /"cid" is not something a sheet has/, { found: FOUND });
});
test("the linter does not change the module it is given", () => {
  const u = fresh(), before = JSON.stringify(u);
  lint(u, { found: FOUND }); canonical(u);
  assert.equal(JSON.stringify(u), before);
});

// ---------- review fixes: B1, B2 ----------
const ODD = [{ toString: 1 }, Object.create(null), [], null, true, 7];
const spots = [
  (d, v) => { d.encounters[0].map = v; }, (d, v) => { d.start.map = v; }, (d, v) => { d.start.entry = v; }, (d, v) => { d.start.scene = v; },
  (d, v) => { d.start.stage[0] = v; }, (d, v) => { d.notes[0].at.map = v; }, (d, v) => { d.notes[0].at.region = v; }, (d, v) => { d.scenes[0].image = v; },
  (d, v) => { d.scenes[0].present[0] = v; }, (d, v) => { d.npcs[0].scenes[0] = v; }, (d, v) => { d.npcs[0].monster = v; },
  (d, v) => { d.encounters[0].creatures[0].monster = v; }, (d, v) => { d.encounters[0].region = v; }, (d, v) => { d.encounters[0].creatures[0].at.region = v; },
  (d, v) => { d.start.light = { cellar: v }; }, (d, v) => { d.settings.cover = v; }, (d, v) => { d.links[0].to = v; }, (d, v) => { d.handouts[0].asset = v; },
];
test("a value of the wrong kind where an id is named is a refusal, never a throw", () => {
  for (const set of spots) for (const v of ODD) {
    const u = fresh(); set(u.data, v);
    let r; assert.doesNotThrow(() => { r = lint(u, { found: FOUND }); }, String(set));
    assert.equal(r.ok, false);
    for (const p of r.problems) assert.equal(typeof p, "string");
  }
  assert.match(refused(edit((m, d) => { d.start.map = { toString: 1 }; }), /^start: the map <object> is not in this module\./).problems[0], /<object>/);
});
test("a map document of the wrong kind is refused with one sentence, whatever is in it", () => {
  const bad = [
    (m) => { m.levels = [null]; }, (m) => { m.grid = { toString: 1 }; }, (m) => { m.levels[0].id = { toString: 1 }; },
    (m) => { m.regions[0].id = { toString: 1 }; }, (m) => { m.regions[0].hexes = [{ toString: 1 }]; }, (m) => { m.objects[0].state = { toString: 1 }; },
    (m) => { m.objects = [null]; }, (m) => { m.walls = [null]; }, (m) => { m.regions = [null]; }, (m) => { m.starts = [null]; }, (m) => { m.levels[0].tiles = null; },
  ];
  for (const f of bad) {
    const u = fresh(); f(u.data.maps.mill);
    let r; assert.doesNotThrow(() => { r = lint(u, { found: FOUND }); });
    assert.equal(r.ok, false);
    assert.ok(r.problems.every((p) => /^[a-z]/.test(p)), r.problems.join(" | "));
  }
  const r = refused(edit((m, d) => { d.maps.mill.levels = [null]; }));
  assert.ok(r.problems.some((p) => /^maps\/mill: /.test(p)));
});

// ---------- M2: a closed list of fields inside a map ----------
test("a map carries no field a map does not have, and no height out of range", () => {
  const map = (f) => edit((m, d) => f(d.maps.mill));
  refused(map((m) => { m.script = "x"; }), /^maps\/mill: The map has "script"/);
  refused(map((m) => { m.levels[0].onload = "x"; }), /Level "ground" has "onload"/);
  refused(map((m) => { m.levels[0].tiles["0,0"] = { t: "stone", evil: 1 }; }), /The tile at "0,0" has "evil"/);
  refused(map((m) => { m.walls = [{ id: "w1", level: "ground", a: 1, b: [0, 0], kind: "wall" }]; }), /Wall "w1" needs two points/);
  refused(map((m) => { m.walls = [{ id: "w1", level: "ground", a: [0, 0], b: [5, 0], kind: "wall", html: "x" }]; }), /Wall "w1" has "html"/);
  refused(map((m) => { m.doors = [null]; }), /The map has "doors"/);
  refused(map((m) => { m.levels[0].tiles["0,0"] = { t: "stone", h: 1e308 }; }), /height is out of range/);
  refused(map((m) => { m.levels[0].z = 1e9; }), /height is out of range/);
  refused(map((m) => { m.objects[0].on = "x"; }), /Object "o1" has "on"/);
  refused(map((m) => { m.regions[0].script = 1; }), /Region "yard" has "script"/);
  refused(map((m) => { m.starts[0].x = 1; }), /A start has "x"/);
  clean(map((m) => { m.levels[0].tiles["0,0"] = { t: "stone", h: 2.5 }; m.regions[0].revealed = true; m.levels[0].light = "dim"; m.entries = [{ id: "door", name: "Door", kind: "gate" }]; m.starts[0].entry = "door"; m.seen = { tiles: {}, objects: {} }; m.areas = [{ id: "stall", name: "Stall", level: "ground", hexes: ["0,0"] }]; }), { found: FOUND });
});

// ---------- H1, M1: placing is bounded, and not read through a stale copy ----------
function hugeYard(d, side = 140) {            // 140 x 140 = 19,600 cells of grass, all one region
  const tiles = {};
  for (let q = 0; q < side; q++) for (let r = 0; r < side; r++) tiles[`${q},${r}`] = { t: "grass" };
  Object.assign(d.maps.mill, { levels: [{ id: "ground", name: "Ground", z: 0, tiles }], objects: [], regions: [{ id: "yard", name: "Yard", level: "ground", hexes: Object.keys(tiles) }] });
  d.start.light = {}; d.notes = []; d.start.stage = [];
}
test("placing on a 19,600-cell region is quick, and stops once the module is over its creature total", () => {
  const lines = (n) => Array.from({ length: n }, () => ({ monster: "giant-rat", at: { region: "yard" } }));
  for (const [encounters, ok] of [[25, true], [200, false]]) {                       // 1,000 creatures; 8,000 creatures
    const u = fresh(); hugeYard(u.data);
    u.data.encounters = Array.from({ length: encounters }, (_, i) => ({ id: `e${i}`, name: "E", map: "mill", creatures: lines(40) }));
    const t = Date.now();
    const r = lintAdventure(u, { found: FOUND, limits: { dataBytes: 8 * L.mapBytes } });
    const ms = Date.now() - t;
    assert.equal(r.ok, ok, r.problems.slice(0, 3).join(" | "));
    assert.ok(ms < 4000, `${ms} ms`);
    if (!ok) assert.match(r.problems[0], /^encounters: hold 8,000 creatures in all; the most is 1,000/);
  }
});
test("placeIn works from the map as it is now: an edited region is placed afresh", () => {
  const map = fresh().data.maps.mill;
  const before = placeIn(map, "cellar", [{ size: "small" }]);
  assert.deepEqual(before.at[0], { q: 0, r: 0, z: -10 });
  map.regions.find((r) => r.id === "cellar").hexes = ["3,2", "2,2"];
  assert.deepEqual(placeIn(map, "cellar", [{ size: "small" }]).at[0], { q: 3, r: 2, z: -10 });
  map.levels[1].tiles["3,2"] = { t: "rock" };
  assert.deepEqual(placeIn(map, "cellar", [{ size: "small" }]).at[0], { q: 2, r: 2, z: -10 });
});

// ---------- M3 policy, L1, L2, L3, L5 ----------
test("a line break, a carriage return and a tab are allowed in long texts, nowhere else", () => {
  clean(edit((m, d) => { d.scenes[0].readAloud = "one\r\ntwo\tthree"; d.notes[0].dm = "a\r\nb"; }), { found: FOUND });
  for (const bad of ["a\rb", "a\tb"]) refused(edit((m, d) => { d.scenes[0].title = bad; }), /scenes\/0\/title: The text has a control character/);
  refused(edit((m, d) => { d.scenes[0].readAloud = "a\u0001b"; }), /readAloud/);
  refused(edit((m, d) => { d.scenes[0].readAloud = "a\u2029b"; }), /readAloud/);
});
test("a link's from and node are read and named as not in this game yet, not refused", () => {
  const r = clean(edit((m, d) => { d.links = [{ to: "drowned-chapel", text: "Downriver.", from: "river-gate", node: "chapel-steps" }]; }), { found: FOUND });
  assert.deepEqual(r.unsupported.map((x) => x.section), ["links/atlas"]);
  assert.match(r.unsupported[0].sentence, /not in this game yet/);
  refused(edit((m, d) => { d.links = [{ to: "x", text: "t", node: "A/B" }]; }), /^links\/0\/node/);
  refused(edit((m, d) => { d.links = [{ to: "x", text: "t", via: "y" }]; }), /"via" is not a field/);
});
test("readAdventureJson: the size is checked on the text, a long problem list is cut, and unchecked fingerprints are said", () => {
  const doc = () => { const d = JSON.parse(FIXTURE); d.pictures = { "a-gate": b64(PICTURES["a-gate"].bytes) }; return d; };
  const plain = readAdventureJson(doc());
  assert.ok(plain.ok);
  assert.deepEqual(plain.notices, ["pictures: no hash was given, so the pictures' fingerprints were not checked."]);
  assert.deepEqual(readAdventureJson(doc(), { sha256: sha }).notices, []);
  const huge = doc(); huge.pictures["a-gate"] = "A".repeat(4 * 1024 * 1024);
  const t = Date.now();
  assert.match(readAdventureJson(huge).problems[0], /^pictures\/a-gate: the picture is not the file the module names \(its size differs\)/);
  assert.ok(Date.now() - t < 500);
  const many = doc(); for (let i = 0; i < 150; i++) many.pictures[`x-${i}`] = "AAAA";
  const r = readAdventureJson(many);
  assert.equal(r.problems.length, 101);
  assert.equal(r.problems[100], "and 50 more.");
});
test("budget does not spread a huge string, and says so", () => {
  const t = Date.now();
  const r = budget({ manifest: {}, data: { a: "é".repeat(2000000) } }, { dataBytes: 1e9 });
  assert.ok(Date.now() - t < 1000);
  assert.match(r[0], /^a: The text is over 8,000 letters long/);
  assert.match(budget({ manifest: {}, data: { ["k".repeat(5000)]: 1 } })[0], /A key is too long/);
});
test("migrateAdventure called alone is safe with a __proto__ map id", () => {
  const u = fresh(); Object.defineProperty(u.data.maps, "__proto__", { value: structuredClone(u.data.maps.mill), enumerable: true, configurable: true, writable: true });
  const out = migrateAdventure(u);
  assert.equal(Object.getPrototypeOf(out.data.maps), Object.prototype);
  assert.ok(Object.hasOwn(out.data.maps, "__proto__"));
  assert.equal({}.format, undefined);
});
test("settings.level as { min, max }", () => {
  clean(edit((m, d) => { d.settings.level = { min: 1, max: 3 }; }), { found: FOUND });
  clean(edit((m, d) => { d.settings.level = { min: 2, max: 2 }; }), { found: FOUND });
  for (const bad of [{ min: 3, max: 1 }, { min: 0, max: 3 }, { min: 1 }, { min: 1, max: 3, x: 1 }, "1", 0]) refused(edit((m, d) => { d.settings.level = bad; }), /^settings\/level: must be a character level 1 to 20, or \{ min, max \}\.$/, { found: FOUND });
});

// ---------- boundaries the first pass left out ----------
test("ids: 40 letters pass and 41 fail; keys 200 and 201; present 20 and 21; the problems cap", () => {
  const id40 = "a".repeat(40);
  clean(edit((m, d) => { d.links = [{ to: id40, text: "t" }]; }), { found: FOUND });
  refused(edit((m, d) => { d.links = [{ to: `${id40}a`, text: "t" }]; }), /^links\/0\/to/, { found: FOUND });
  clean(edit((m) => { m.module.id = id40; }), { found: FOUND });
  refused(edit((m) => { m.module.id = `${id40}a`; }), /^module\/id/, { found: FOUND });
  assert.deepEqual(budget({ manifest: {}, data: { ["k".repeat(200)]: 1 } }), []);
  assert.ok(budget({ manifest: {}, data: { ["k".repeat(201)]: 1 } }).some((p) => /key is too long/.test(p)));
  const crowd = (n) => (m, d) => {
    d.npcs = Array.from({ length: n }, (_, i) => ({ id: `n${i}`, name: "N" })); d.scenes[0].present = d.npcs.map((x) => x.id); d.npcs[0].scenes = [];
  };
  clean(edit((m, d) => crowd(20)(m, d)), { found: FOUND });
  refused(edit((m, d) => crowd(21)(m, d)), /^scenes\/gate\/present: has 21 people; the most is 20/, { found: FOUND });
  const r = lint(edit((m, d) => { d.handouts = Array.from({ length: 150 }, (_, i) => ({ id: `h${i}`, title: "H" })); }), { found: FOUND });
  assert.equal(r.problems.length, 100);
  assert.equal(r.more, 50);
  const words = refusal(r);
  assert.equal(words.length, 11);
  assert.equal(words[10], "and 140 more.");
});
test("attribution 500 and srd 1,000 letters; needs.homebrew 4 and 5 packs; a picture's file name 100 letters", () => {
  const priv = (f) => edit((m) => { m.module.content = "private"; f(m); });
  clean(priv((m) => { m.module.licence.attribution = str(500); m.module.licence.srd = str(1000); }), { found: FOUND });
  refused(priv((m) => { m.module.licence.attribution = str(501); }), /^module\/licence\/attribution: is 501 letters long/, { found: FOUND });
  refused(priv((m) => { m.module.licence.srd = str(1001); }), /^module\/licence\/srd: is 1,001 letters long/, { found: FOUND });
  const packs = (n) => (m) => { m.needs.homebrew = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, version: 1, hash: "sha256:00" })); };
  assert.ok(!lint(edit(packs(4)), { found: FOUND }).problems.some((p) => /has 4 packs/.test(p)));
  refused(edit(packs(5)), /^needs\/homebrew: has 5 packs; the most is 4/, { found: FOUND });
  const name = (n) => edit((m) => { m.pictures["a-gate"].file = `pictures/${"a".repeat(n - 9 - 4)}.png`; });
  clean(name(100), { found: FOUND });
  refused(name(101), /^pictures\/a-gate: its file must be/, { found: FOUND });
});

// ---------- maps the game itself writes (the editor, the stock maps) ----------
test("every stock map, wrapped as the module's map, lints clean", () => {
  assert.ok(STOCK_MAPS.length >= 5);
  for (const entry of STOCK_MAPS) {
    const u = fresh(), map = structuredClone(entry.map);
    u.manifest.needs.grid = "both";
    Object.assign(u.data, { maps: { stock: map }, encounters: [], notes: [], start: { map: "stock" } });
    u.data.scenes[0].present = []; u.data.npcs = []; u.data.start.scene = "gate";
    const r = lint(u, { found: FOUND, limits: { dataBytes: 8 * L.mapBytes } });
    assert.deepEqual(r.problems, [], `${entry.id ?? entry.map.id}`);
  }
});
test("a map built with the editor's own operations lints clean; a pile's play record does not belong in a module", () => {
  const u = fresh(), map = u.data.maps.mill;
  const op = (name, arg) => { const bad = EDITS[name](map, arg); assert.equal(bad, undefined, bad); };
  op("starts", { starts: [{ q: 0, r: 0, z: 0 }] });                                                   // editor.js: a start with its height
  op("object", { object: { def: "ladder", level: "ground", at: { q: 1, r: 1 }, to: { q: 1, r: 1, z: -10 } } });   // a ladder's `to` with z
  op("object", { object: { def: "door-wooden", level: "ground", at: { q: 2, r: 1 }, edge: 0 } });
  op("object", { object: { def: "pile", level: "ground", at: { q: 2, r: 2 }, contents: [{ id: "a1", name: "Rope" }, { id: "b2", item: "longsword" }] } });
  op("wall", { wall: { level: "ground", a: [0, 0], b: [10, 0], kind: "wall" } });
  op("region", { region: { id: "porch", name: "Porch", level: "ground", hexes: ["6,0", "7,0"] } });
  op("tile", { level: "ground", at: { q: 7, r: 3 }, tile: { t: "grass", h: 2.5 } });
  op("level", { level: { id: "ground", light: "dim" } });
  op("entries", { entries: [{ id: "gate", name: "Gate", kind: "gate" }] });
  map.starts[0].entry = "gate";
  clean(u, { found: FOUND });
  const withPlay = structuredClone(u);
  withPlay.data.maps.mill.objects.find((o) => o.def === "pile").by = "m3";
  refused(withPlay, /Object "[a-z0-9]+" has "by"/);
  const bigPile = structuredClone(u);
  bigPile.data.maps.mill.objects.find((o) => o.def === "pile").contents = Array.from({ length: 41 }, (_, i) => ({ id: `i${i}`, name: "x" }));
  refused(bigPile, /contents are a list of at most 40/);
  const unknown = structuredClone(u);
  unknown.data.maps.mill.objects.find((o) => o.def === "pile").contents = [{ id: "a1", name: "x", evil: 1 }];
  refused(unknown, /has "evil"/);
});
test("a map's own sentences come before the module's field-list ones", () => {
  const r = refused(edit((m, d) => { d.maps.mill.script = 1; d.maps.mill.levels[0].tiles["0,0"] = { t: "lava" }; }));
  assert.match(r.problems[0], /unknown terrain/);
  assert.match(r.problems[1], /has "script"/);
});

test("a pile's contents are checked as the engine reads them: records, ids, names, items, charges, and only on a pile", () => {
  const withContents = (contents, def = "pile") => edit((m, d) => {
    const map = d.maps.mill;
    EDITS.object(map, { object: { def, level: "ground", at: { q: 2, r: 2 }, ...(def === "door-wooden" ? { edge: 0 } : {}), contents } });
  });
  const at = { found: FOUND };
  clean(withContents([{ id: "a1", name: "Rope" }, { id: "b2", item: "longsword" }, { id: "c3", item: "wand-of-magic-missiles", charges: 7 }]), at);
  for (const bad of [1, "x", null, [1]]) refused(withContents([bad]), /thing 1 is not a record/, at);
  refused(withContents({ 0: { id: "a1", name: "x" } }), /are a list of at most 40/, at);
  refused(withContents([{ id: "a1", name: { nested: { name: "x" } } }]), /has a name that is not text/, at);
  refused(withContents([{ id: "a1", name: "x".repeat(7999) }]), /has a name that is not text of at most 60 letters/, at);
  refused(withContents([{ id: "a1", name: { toString: 1 } }]), /has a name that is not text/, at);
  refused(withContents([{ id: "a1", name: "x" }], "door-wooden"), /only a pile holds things/, at);
  refused(withContents([{ id: "a1", name: "x" }, { id: "a1", name: "y" }]), /has an id that another thing in the pile has/, at);
  refused(withContents([{ id: "A B", name: "x" }]), /needs an id of 1 to 12/, at);
  refused(withContents([{ id: { toString: 1 }, name: "x" }]), /needs an id/, at);
  refused(withContents([{ id: "a1" }]), /needs a name/, at);
  refused(withContents([{ id: "a1", item: "longsword", name: "x" }]), /is an item and has no name/, at);
  for (const k of ["item", "base", "type", "spell"]) refused(withContents([{ id: "a1", name: "x", [k]: { toString: 1 } }].map((c) => (k === "item" ? { id: "a1", item: c[k] } : c))), new RegExp(`"${k}" that is not text`), at);
  refused(withContents([{ id: "a1", item: "x".repeat(41) }]), /"item" that is not text of at most 40/, at);
  for (const bad of [-1, 1.5, "3", 101, { toString: 1 }]) refused(withContents([{ id: "a1", item: "longsword", charges: bad }]), /charges that are not a whole number/, at);
  clean(withContents([{ id: "a1", item: "longsword", charges: 0 }, { id: "a2", name: "é".repeat(60) }]), at);
});
