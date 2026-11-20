// The module zip wrapper (docs/specs/adventure-module.md, Decision 1, Decision 5 pass 1 and the hostile file tests).
// Every fixture zip is made here, byte by byte, by zipOf() below; nothing is read from disk but the vendored files.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { crc32, deflateRawSync } from "node:zlib";
import { ZIP_LIMITS, LIBRARY_CONFIG, loadZipLibrary, readModuleZip, scanZip, toJsonForm, writeModuleZip } from "../../client/modulezip.js";

const here = dirname(fileURLToPath(import.meta.url));
const client = join(here, "../../client");
const vendor = join(client, "vendor/zip.js");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const MB = 1024 * 1024;

// ---- a zip builder with every knob a hostile file needs ----------------------------------------------------------

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const WEBP = (() => { const body = Buffer.concat([Buffer.from("WEBPVP8 "), Buffer.alloc(24)]); const h = Buffer.from("RIFF\0\0\0\0"); h.writeUInt32LE(body.length, 4); return Buffer.concat([h, body]); })();
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>');

const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };

// One entry: { name, data, method (8 by default), packed (bytes as stored, else made from data), crc, csize, usize,
// flags, extAttr, madeBy, extra, local: { overrides of the local header }, descriptor: true | { crc, csize, usize, sig } }
function prepare(e) {
  const name = Buffer.isBuffer(e.name) ? e.name : Buffer.from(e.name, "latin1");
  const data = e.data ?? Buffer.alloc(0);
  const method = e.method ?? 8;
  const packed = e.packed ?? (method === 8 ? deflateRawSync(data) : data);
  return { ...e, name, data, method, packed, crc: e.crc ?? crc32(data), csize: e.csize ?? packed.length, usize: e.usize ?? data.length, flags: e.flags ?? 0 };
}
function localRecord(p) {
  const l = { name: p.name, method: p.method, flags: p.flags, crc: p.crc, csize: p.csize, usize: p.usize, extra: Buffer.alloc(0), ...p.local };
  if (p.descriptor && !p.local) Object.assign(l, { crc: 0, csize: 0, usize: 0 });
  const head = Buffer.concat([u32(0x04034b50), u16(20), u16(l.flags), u16(l.method), u16(0), u16(0x5c21), u32(l.crc), u32(l.csize), u32(l.usize), u16(l.name.length), u16(l.extra.length), l.name, l.extra]);
  let desc = Buffer.alloc(0);
  if (p.descriptor) {
    const d = { crc: p.crc, csize: p.csize, usize: p.usize, sig: true, ...(p.descriptor === true ? {} : p.descriptor) };
    desc = Buffer.concat([d.sig ? u32(0x08074b50) : Buffer.alloc(0), u32(d.crc), u32(d.csize), u32(d.usize)]);
  }
  return Buffer.concat([head, p.packed, desc]);
}
function centralRecord(p, offset) {
  const extra = p.extra ?? Buffer.alloc(0), comment = p.comment ?? Buffer.alloc(0);
  return Buffer.concat([u32(0x02014b50), u16(p.madeBy ?? (3 << 8) | 20), u16(20), u16(p.flags), u16(p.method), u16(0), u16(0x5c21), u32(p.crc), u32(p.csize), u32(p.usize),
    u16(p.name.length), u16(extra.length), u16(comment.length), u16(p.diskStart ?? 0), u16(0), u32(p.extAttr ?? (p.name.at(-1) === 0x2f ? (0o040755 << 16) | 0x10 : 0o100644 << 16)), u32(p.offset ?? offset), p.name, extra, comment]);
}
function endRecord(count, cdSize, cdOffset, o = {}) {
  const comment = o.comment ?? Buffer.alloc(0);
  return Buffer.concat([u32(0x06054b50), u16(o.disk ?? 0), u16(o.cdDisk ?? 0), u16(o.onDisk ?? count), u16(o.total ?? count), u32(o.cdSize ?? cdSize), u32(o.cdOffset ?? cdOffset), u16(comment.length), comment]);
}
// The whole file. o: { comment, trailing, z64locator, end: { overrides of the end record }, locals: Buffer (raw, instead of the entries' own) }
function zipOf(entries, o = {}) {
  const ps = entries.map(prepare);
  const parts = [];
  let at = 0;
  const offsets = [];
  for (const p of ps) { offsets.push(at); const r = localRecord(p); parts.push(r); at += r.length; }
  const locals = o.locals ?? Buffer.concat(parts);
  const cd = Buffer.concat(ps.map((p, i) => centralRecord(p, offsets[i])));
  const z64 = o.z64locator ? Buffer.concat([u32(0x07064b50), u32(0), Buffer.alloc(8), u32(1)]) : Buffer.alloc(0);
  return new Uint8Array(Buffer.concat([locals, cd, z64, endRecord(ps.length, cd.length, locals.length, { ...o.end, ...(o.z64locator && { cdSize: cd.length + 0 }), comment: o.comment }), o.trailing ?? Buffer.alloc(0)]));
}

// A small valid module, and its entries, so a test can change one thing.
const line = (file, bytes, mime = "image/png") => ({ file, mime, bytes: bytes.length, sha256: sha(bytes) });
const MANIFEST = { format: "hextable-adventure", v: 1, module: { id: "test-mill", version: 1, title: "The Test Mill" }, pictures: { "a-gate": line("pictures/gate.png", PNG), "a-ledger": line("pictures/ledger.webp", WEBP, "image/webp") } };
const DATA = { maps: { mill: { name: "The mill" } }, notes: [{ id: "n1", text: "<script>alert(1)</script> stays text" }] };
const json = (v) => Buffer.from(JSON.stringify(v));
const base = (over = {}) => [
  { name: "module.json", data: json(over.manifest ?? MANIFEST) },
  { name: "adventure.json", data: json(over.data ?? DATA) },
  { name: "pictures/", method: 0 },
  { name: "pictures/gate.png", data: PNG, method: 0 },
  { name: "pictures/ledger.webp", data: WEBP },
];

async function refused(bytes, pattern, opts) {
  const r = await readModuleZip(bytes, opts);
  assert.equal(r.ok, false, `expected a refusal matching ${pattern}`);
  assert.ok(r.problems.some((p) => pattern.test(p)), `no problem matches ${pattern}: ${JSON.stringify(r.problems)}`);
  return r;
}

// ---- the good file -----------------------------------------------------------------------------------------------

test("a valid module reads: manifest, data, pictures by id, nothing skipped", async () => {
  const r = await readModuleZip(zipOf(base()));
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.deepEqual(r.manifest, MANIFEST);
  assert.deepEqual(r.data, DATA);
  assert.deepEqual(r.found, ["a-gate", "a-ledger"]);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(Buffer.from(r.pictures["a-gate"]), PNG);
  assert.deepEqual(Buffer.from(r.pictures["a-ledger"]), WEBP);
  assert.equal(r.stripped, null);
});

test("the library's writer makes a zip that unpacks to the JSON form byte for byte; a lean copy lists what is missing", async () => {
  const form = { format: "hextable-adventure-json", v: 1, manifest: MANIFEST, data: DATA, pictures: { "a-gate": PNG.toString("base64"), "a-ledger": WEBP.toString("base64") } };
  const zip = await writeModuleZip({ manifest: MANIFEST, data: DATA, pictures: { "a-gate": PNG, "a-ledger": WEBP } });
  assert.equal(scanZip(zip).problems, undefined);
  const r = await readModuleZip(zip);
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.equal(JSON.stringify(toJsonForm(r)), JSON.stringify(form));
  assert.deepEqual(Buffer.from(await writeModuleZip({ manifest: MANIFEST, data: DATA, pictures: { "a-gate": PNG, "a-ledger": WEBP } })), Buffer.from(zip), "the same module gives the same bytes");
  for (const file of ["../gate.png", "gate.png", "pictures/sub/gate.png", "pictures/Gate.png"])
    await assert.rejects(writeModuleZip({ manifest: { ...MANIFEST, pictures: { "a-gate": { ...MANIFEST.pictures["a-gate"], file } } }, data: DATA }), /is not a picture's name in a module/);
  await assert.rejects(writeModuleZip({ manifest: { ...MANIFEST, pictures: { "a-gate": MANIFEST.pictures["a-gate"], "a-two": MANIFEST.pictures["a-gate"] } }, data: DATA }), /named twice/);
  const lean = await readModuleZip(await writeModuleZip({ manifest: MANIFEST, data: DATA, pictures: { "a-gate": PNG } }));
  assert.equal(lean.ok, true, JSON.stringify(lean.problems));
  assert.deepEqual(lean.found, ["a-gate"]);
  assert.deepEqual(lean.missing, ["a-ledger"]);
});

test("one top folder is stripped; __MACOSX and .DS_Store are skipped unread and named", async () => {
  const entries = [{ name: "test-mill/", method: 0 }, ...base().map((e) => ({ ...e, name: "test-mill/" + e.name })),
    { name: "test-mill/.DS_Store", data: Buffer.from("junk"), method: 0 }, { name: "__MACOSX/", method: 0 }, { name: "__MACOSX/test-mill/._module.json", data: Buffer.from("x"), method: 0 }];
  const r = await readModuleZip(zipOf(entries));
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.equal(r.stripped, "test-mill");
  assert.deepEqual(r.skipped, ["test-mill/.DS_Store", "__MACOSX/", "__MACOSX/test-mill/._module.json"]);
  await refused(zipOf([...base().map((e) => ({ ...e, name: "a/" + e.name })), { name: "b/x.png", data: PNG, method: 0 }]), /2 top-level folders \("a", "b"\)/);
});

// ---- 1. size and bombs -------------------------------------------------------------------------------------------

test("a file over 100 MB is refused on its length, before a byte is read", async () => {
  let read = false;
  const blob = { size: ZIP_LIMITS.fileBytes + 1, arrayBuffer() { read = true; throw new Error("read"); } };
  await refused(blob, /^zip: the file is 100 MB; a module may be at most 100 MB\.$/);
  assert.equal(read, false);
  assert.match(scanZip({ length: ZIP_LIMITS.fileBytes + 1 }).problems[0], /may be at most/);
});

test("bombs: past 200 times, its own cap, the 95 MB total: refused before inflating; past its declared size: stopped part-way", async () => {
  const zeros = Buffer.alloc(10 * MB);
  // An honest header that says 10 MB from about 10 KB: refused on the directory, nothing inflated.
  let r = await refused(zipOf([{ name: "module.json", data: zeros }, ...base().slice(1)]), /module\.json unpacks to 10 MB; it may be at most 128 KB/);
  assert.equal(r.inflated, 0);
  r = await refused(zipOf([base()[0], { name: "adventure.json", data: Buffer.concat([json(DATA), Buffer.alloc(3 * MB, 0x20)]) }, ...base().slice(2)]), /adventure\.json unpacks to more than 200 times its size/);
  assert.equal(r.inflated, 0);
  await refused(zipOf([base()[0], { name: "adventure.json", data: Buffer.alloc(5 * MB) , method: 0 }]), /adventure\.json unpacks to 5 MB; it may be at most 4 MB/);
  // 20 pictures of 4.9 MB, each well under 200 to 1: 98 MB in all.
  const noise = Buffer.concat(Array.from({ length: 1280 }, (_, i) => createHash("sha256").update(String(i)).digest()));   // 40 KB that does not compress
  const big = Buffer.concat([PNG, noise, Buffer.alloc(Math.round(4.9 * MB) - PNG.length - noise.length)]);
  const many = Array.from({ length: 20 }, (_, i) => ({ name: `pictures/p${i}.png`, data: big }));
  r = await refused(zipOf([...base().slice(0, 2), ...many]), /the entries unpack to 98 MB in all; a module may unpack to at most 95 MB/);
  assert.equal(r.inflated, 0);

  // A header that lies: 100 MB of zeros declared as 50,000 bytes. The inflating stops at once; at most a chunk over.
  const bomb = deflateRawSync(Buffer.alloc(100 * MB), { level: 9 });
  const before = process.memoryUsage();
  const t0 = performance.now();
  r = await refused(zipOf([{ name: "module.json", packed: bomb, usize: 50000, crc: 0 }, ...base().slice(1)]), /module\.json unpacks to more than its declared size/);
  const ms = performance.now() - t0;
  const grew = process.memoryUsage().rss - before.rss;
  assert.ok(r.inflated <= 50000 + 1 * MB, `inflated ${r.inflated} bytes`);
  assert.ok(ms < 2000, `took ${ms} ms`);
  assert.ok(grew < 64 * MB, `memory grew by ${grew} bytes`);
});

test("a zip inside a zip is refused at its first entry; a flat bomb of overlapping entries is refused by the layout", async () => {
  const inner = zipOf(base());
  await refused(zipOf([{ name: "inner.zip", data: Buffer.from(inner), method: 0 }, ...base()]), /"inner\.zip" is not part of a module/);
  const nested = base({ manifest: { ...MANIFEST, pictures: { "a-gate": line("pictures/gate.png", Buffer.from(inner)) } } }).slice(0, 3);
  await refused(zipOf([...nested, { name: "pictures/gate.png", data: Buffer.from(inner), method: 0 }]), /^pictures\/a-gate: the file is not a PNG, JPEG or WebP picture\.$/);
  // Overlap: adventure.json's local header and data sit inside module.json's stored data; both headers agree.
  const adv = prepare({ name: "adventure.json", data: json(DATA), method: 0 });
  const advLocal = localRecord(adv);
  const man = prepare({ name: "module.json", data: Buffer.concat([advLocal]), method: 0 });
  const manLocal = localRecord(man);
  const offAdv = 30 + man.name.length;
  const cd = Buffer.concat([centralRecord(man, 0), centralRecord(adv, offAdv)]);
  const file = new Uint8Array(Buffer.concat([manLocal, cd, endRecord(2, cd.length, manLocal.length)]));
  const r = await refused(file, /the entries "module\.json" and "adventure\.json" share data/);
  assert.equal(r.inflated, 0);
});

// ---- 2. names ----------------------------------------------------------------------------------------------------

test("names a module may not use are refused, shown escaped", async () => {
  const cases = [
    ["../../etc/passwd", '"../../etc/passwd"'], ["/abs.png", '"/abs.png"'], ["C:\\x.png", '"C:\\\\x.png"'], ["pictures\\gate.webp", '"pictures\\\\gate.webp"'],
    ["pictures/../module.json", '"pictures/../module.json"'], ["pictures/./gate.webp", '"pictures/./gate.webp"'], ["pictures//gate.webp", '"pictures//gate.webp"'],
    ["pictures/" + "a".repeat(88) + ".png", null], [Buffer.from("pictures/ga\0te.png", "latin1"), '"pictures/ga\\x00te.png"'],
    [Buffer.from("pictures/caf\u00e9.png", "utf8"), '"pictures/caf\\xc3\\xa9.png"'], [Buffer.from("pictures/\u{1F600}.png", "utf8"), '"pictures/\\xf0\\x9f\\x98\\x80.png"'],
    ["pictures/sub/gate.png", '"pictures/sub/gate.png"'], ["maps/mill.json", '"maps/mill.json"'],
  ];
  for (const [name, shown] of cases) {
    const raw = Buffer.isBuffer(name) ? name : Buffer.from(name, "latin1");
    if (shown === null) assert.equal(raw.length, 101);
    const r = await refused(zipOf([...base(), { name, data: PNG, method: 0 }]), /is not a name a module may use\.$/);
    if (shown) assert.ok(r.problems.some((p) => p.includes(`the entry ${shown} is not a name`)), `${JSON.stringify(r.problems)} should show ${shown}`);
    assert.equal(r.inflated, 0);
  }
});

// ---- 3. duplicates -----------------------------------------------------------------------------------------------

test("duplicates: two module.json, gate.webp and Gate.webp, another name in the local header", async () => {
  await refused(zipOf([...base(), { name: "module.json", data: json(MANIFEST) }]), /two entries are named "module\.json"/);
  const r = await refused(zipOf([...base(), { name: "pictures/Gate.png", data: PNG, method: 0 }]), /two entries are named "pictures\/Gate\.png"/);
  assert.ok(r.problems.some((p) => /"pictures\/Gate\.png" is not a name/.test(p)), "capitals are refused too");
  const lying = base(); lying[1] = { ...lying[1], local: { name: Buffer.from("adventure.jsoN") } };
  await refused(zipOf(lying), /"adventure\.json" has another name in its local header \("adventure\.jsoN"\)/);
});

// ---- 4. kinds and methods ----------------------------------------------------------------------------------------

test("kinds and methods: a symbolic link, an encrypted entry, bzip2, LZMA, AES, ZIP64, multi-disk, data after the end, a 2 KB comment", async () => {
  const with4 = (over) => { const e = base(); e[3] = { ...e[3], ...over }; return zipOf(e); };
  await refused(with4({ extAttr: (0o120777 << 16) >>> 0 }), /"pictures\/gate\.png" is a symbolic link/);
  await refused(with4({ extAttr: (0o020644 << 16) >>> 0 }), /is a device or another special file/);
  await refused(with4({ flags: 1 }), /"pictures\/gate\.png" is encrypted/);
  for (const m of [12, 14, 99]) await refused(with4({ method: m, packed: PNG }), new RegExp(`uses compression method ${m}; a module may use only stored \\(0\\) or deflate \\(8\\)`));
  await refused(with4({ extra: Buffer.concat([u16(1), u16(8), Buffer.alloc(8)]) }), /"pictures\/gate\.png" has a ZIP64 record/);
  await refused(zipOf(base(), { end: { total: 0xffff, onDisk: 0xffff } }), /ZIP64 records/);
  await refused(zipOf(base(), { z64locator: true }), /ZIP64 records|central directory is not where/);
  await refused(zipOf(base(), { end: { disk: 1 } }), /multi-disk archive/);
  await refused(with4({ diskStart: 1 }), /is on another disk/);
  await refused(zipOf(base(), { trailing: Buffer.from("after the end") }), /bytes after the end record/);
  await refused(zipOf(base(), { comment: Buffer.alloc(2048, 0x41) }), /the archive comment is 2 KB; a module may carry at most 1 KB/);
  assert.equal((await readModuleZip(zipOf(base(), { comment: Buffer.from("made by a tool") }))).ok, true, "a short comment is fine");
  await refused(new Uint8Array(Buffer.from("not a zip at all, just text")), /not a zip/);
});

test("more than 320 entries is refused from the end record, before a record is read", async () => {
  const entries = [...base(), ...Array.from({ length: 317 }, (_, i) => ({ name: `pictures/x${i}.png`, data: PNG, method: 0 }))];
  assert.equal(entries.length, 322);
  await refused(zipOf(entries), /the file holds 322 entries; a module may hold at most 320/);
});

test("a central directory padded with extras and comments is refused before the library reads it, quickly", async () => {
  // 320 entries, each with a 65,535-byte extra field and a 65,535-byte comment: a 42 MB directory.
  const pad = Buffer.alloc(0xffff, 0x41);
  const entries = [...base(), ...Array.from({ length: 315 }, (_, i) => ({ name: `pictures/x${i}.png`, data: PNG, method: 0 }))].map((e) => ({ ...e, extra: pad, comment: pad }));
  const file = zipOf(entries);
  assert.ok(file.length > 40 * MB);
  const before = process.memoryUsage().rss;
  const t0 = performance.now();
  const r = await refused(file, /^zip: the central directory is 40 MB; 320 entries need at most 86 KB\.$/);
  assert.ok(performance.now() - t0 < 500, "refused in under half a second");
  assert.ok(process.memoryUsage().rss - before < 32 * MB, "and without the library's hundreds of MB");
  assert.equal(r.inflated, 0);
  // One entry alone: an extra over 128 bytes, a comment, a local extra over 128 bytes.
  const with3 = (over) => { const e = base(); e[3] = { ...e[3], ...over }; return zipOf(e); };
  await refused(with3({ extra: Buffer.concat([u16(0x5455), u16(125), Buffer.alloc(125)]) }), /"pictures\/gate\.png" has an extra field of 129 bytes; a module's entries carry at most 128 bytes/);
  assert.equal((await readModuleZip(with3({ extra: Buffer.concat([u16(0x5455), u16(5), Buffer.alloc(5), u16(0x7875), u16(11), Buffer.alloc(11)]) }))).ok, true, "Info-ZIP's usual extras are fine");
  await refused(with3({ comment: Buffer.from("hi") }), /"pictures\/gate\.png" has a comment; a module's entries carry none/);
  const g = prepare(base()[3]);
  await refused(with3({ local: { name: g.name, method: 0, flags: 0, crc: g.crc, csize: g.csize, usize: g.usize, extra: Buffer.concat([u16(0x5455), u16(200), Buffer.alloc(200)]) } }), /local header of "pictures\/gate\.png" has an extra field of 204 bytes/);
  // A name of 65,535 bytes goes over the directory's ceiling; one of 1,000 that fits under it is refused on its length
  // (and shown cut), never turned into a string.
  await refused(zipOf([...base(), { name: "a".repeat(0xffff), data: PNG, method: 0 }]), /the central directory is 64 KB; 6 entries need at most 2 KB/);
  const long = await refused(zipOf([...base(), { name: "a".repeat(1000), data: PNG, method: 0 }]), /is not a name a module may use/);
  assert.ok(long.problems.some((p) => p.includes('"' + "a".repeat(120) + '..."')));
});

// ---- 5. lying headers --------------------------------------------------------------------------------------------

test("lying headers: a CRC-32 that differs, local sizes that differ, a data descriptor that disagrees, data into the directory", async () => {
  const with1 = (over) => { const e = base(); e[1] = { ...e[1], ...over }; return zipOf(e); };
  const with3 = (over) => { const e = base(); e[3] = { ...e[3], ...over }; return zipOf(e); };
  await refused(with1({ crc: 0x12345678 }), /adventure\.json does not match its CRC-32/);
  await refused(with3({ crc: 0x12345678 }), /pictures\/gate\.png does not match its CRC-32/);
  const adv = prepare(base()[1]);
  await refused(with1({ local: { name: adv.name, method: 8, flags: 0, crc: adv.crc, csize: adv.csize + 1, usize: adv.usize, extra: Buffer.alloc(0) } }), /local header of "adventure\.json" disagrees with the directory \(sizes or CRC-32\)/);
  await refused(with1({ local: { name: adv.name, method: 0, flags: 0, crc: adv.crc, csize: adv.csize, usize: adv.usize, extra: Buffer.alloc(0) } }), /disagrees with the directory \(method or flags\)/);
  assert.equal((await readModuleZip(with1({ flags: 8, descriptor: true }))).ok, true, "a data descriptor that agrees is fine");
  assert.equal((await readModuleZip(with1({ flags: 8, descriptor: { sig: false } }))).ok, true, "and one without its signature");
  await refused(with1({ flags: 8, descriptor: { usize: adv.usize + 5 } }), /data descriptor of "adventure\.json" disagrees/);
  await refused(with3({ csize: 1 << 20, usize: 1 << 20, local: undefined }), /runs into the central directory|share data/);
});

// ---- 6. order and extras -----------------------------------------------------------------------------------------

test("order and extras: adventure.json first, no module.json, a readme.txt or script.js", async () => {
  const e = base();
  await refused(zipOf([e[1], e[0], ...e.slice(2)]), /module\.json must be the first entry; the first is "adventure\.json"/);
  await refused(zipOf(e.slice(1)), /has no module\.json/);
  await refused(zipOf([e[0], e[3], e[1]]), /adventure\.json must be the second entry; the second is "pictures\/gate\.png"/);
  await refused(zipOf([e[0]]), /has no adventure\.json/);
  for (const name of ["readme.txt", "script.js"]) await refused(zipOf([...e, { name, data: Buffer.from("alert(1)") }]), new RegExp(`"${name.replace(".", "\\.")}" is not part of a module`));
});

// ---- 7. time -----------------------------------------------------------------------------------------------------

test("an unpack that runs past the time limit is stopped and refused", async () => {
  let t = 0;
  const now = () => (t += 1000);       // every look at the clock costs a second
  await refused(zipOf(base()), /took longer than 5 seconds to unpack/, { now, timeLimitMs: 5000 });
  assert.equal(ZIP_LIMITS.serverMs, 5000);
  assert.equal(ZIP_LIMITS.browserMs, 20000);
  // And the real clock: a limit of 0 stops the first entry.
  await refused(zipOf(base()), /took longer than 0 seconds/, { timeLimitMs: 0, now: (() => { let c = 0; return () => c++; })() });
});

// ---- 8. not JSON -------------------------------------------------------------------------------------------------

test("module.json or adventure.json that is not a JSON object is refused with one sentence", async () => {
  const cases = [[Buffer.from("not json"), /is not JSON\.$/], [Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), json(MANIFEST)]), /is not JSON\.$/],
    [Buffer.from("[1,2]"), /is not a JSON object\.$/], [Buffer.from('"a string"'), /is not a JSON object\.$/], [Buffer.from([0x7b, 0xff, 0x7d]), /is not UTF-8 text\.$/]];
  for (const [bytes, pattern] of cases) {
    const m = await refused(zipOf([{ name: "module.json", data: bytes }, ...base().slice(1)]), pattern);
    assert.equal(m.problems.length, 1);
    assert.match(m.problems[0], /^zip: module\.json /);
    const d = await refused(zipOf([base()[0], { name: "adventure.json", data: bytes }, ...base().slice(2)]), pattern);
    assert.match(d.problems[0], /^zip: adventure\.json /);
  }
});

test("checkManifest (passes 2 to 4) runs on the manifest before anything else is inflated", async () => {
  let sawData = false;
  const r = await readModuleZip(zipOf(base()), { checkManifest: (m) => { sawData = "maps" in m; return ["module: no such thing."]; } });
  assert.deepEqual(r.problems, ["module: no such thing."]);
  assert.equal(sawData, false);
  assert.ok(r.inflated <= json(MANIFEST).length, "only module.json was inflated");
});

// ---- 14. pictures that lie ---------------------------------------------------------------------------------------

test("pictures that lie: SVG named .png, a PNG declared WebP, bytes or sha256 that differ, an unnamed picture, bad ids", async () => {
  const withManifest = (pictures, extra = []) => zipOf([...base({ manifest: { ...MANIFEST, pictures } }), ...extra]);
  const P = MANIFEST.pictures;
  // SVG inside gate.png, with the manifest's line made to match it, so only the sniff can catch it.
  const e = base({ manifest: { ...MANIFEST, pictures: { ...P, "a-gate": line("pictures/gate.png", SVG) } } }); e[3] = { ...e[3], data: SVG };
  await refused(zipOf(e), /^pictures\/a-gate: the file is not a PNG, JPEG or WebP picture\.$/);
  await refused(withManifest({ ...P, "a-gate": { ...P["a-gate"], mime: "image/webp" } }), /^pictures\/a-gate: the file is image\/png, not the image\/webp the module names\.$/);
  await refused(withManifest({ ...P, "a-gate": { ...P["a-gate"], bytes: 99 } }), /^pictures\/a-gate: the picture is 68 bytes, not the 99 the module names\.$/);
  await refused(withManifest({ ...P, "a-gate": { ...P["a-gate"], sha256: "0".repeat(64) } }), /^pictures\/a-gate: the picture is not the file the module names \(its fingerprint differs\)\.$/);
  await refused(withManifest(P, [{ name: "pictures/extra.png", data: PNG, method: 0 }]), /^zip: pictures\/extra\.png is not named in module\.json; a module holds no unnamed files\.$/);
  await refused(withManifest({ ...P, "../../x": P["a-gate"] }), /the picture id "\.\.\/\.\.\/x" is not a kebab id/);
  await refused(withManifest({ ...P, "a/b": P["a-gate"] }), /the picture id "a\/b" is not a kebab id/);
  await refused(withManifest({ ...P, "a-two": P["a-gate"] }), /pictures\/a-two: the file pictures\/gate\.png is named by the picture "a-gate" too/);
  await refused(withManifest({ ...P, "a-gate": { ...P["a-gate"], file: "../gate.png" } }), /pictures\/a-gate: the file "\.\.\/gate\.png" is not a picture's name/);
  await refused(withManifest([]), /pictures is not a list of pictures/);
});

// ---- the library: workers off, no codec import, the pinned files ------------------------------------------------

test("web workers are off and no codec is ever imported at run time", async () => {
  assert.equal(LIBRARY_CONFIG.useWebWorkers, false);
  const made = [];
  const had = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  globalThis.Worker = class { constructor(url) { made.push(String(url)); throw new Error("no workers"); } };
  try {
    const r = await readModuleZip(zipOf(base()));
    assert.equal(r.ok, true, JSON.stringify(r.problems));
    await writeModuleZip({ manifest: MANIFEST, data: DATA, pictures: { "a-gate": PNG } });
  } finally { if (had) Object.defineProperty(globalThis, "Worker", had); else delete globalThis.Worker; }
  assert.deepEqual(made, [], "no Worker was constructed");

  const zip = await loadZipLibrary();
  assert.deepEqual(zip.getRegisteredCodecs(), []);
  // Somebody registers a codec whose module, if imported, would leave a mark.
  delete globalThis.__zipCodecImported;
  zip.registerCodec({ compressionMethod: 93, format: "zstd", codecURI: "data:text/javascript,globalThis.__zipCodecImported=1;export class DecompressionStream{}" });
  try {
    const e = base(); e[3] = { ...e[3], method: 93, packed: PNG };
    await refused(zipOf(e), /uses compression method 93/);
    await assert.rejects(readModuleZip(zipOf(base())), /a codec is registered with zip\.js; the wrapper allows none/);
  } finally { zip.unregisterCodec(93); }
  assert.equal(globalThis.__zipCodecImported, undefined, "the codec URI was never imported");
  assert.equal((await readModuleZip(zipOf(base()))).ok, true);
});

test("the wrapper has no static import, and nothing on the default page load imports it or the vendored zip.js", () => {
  const src = readFileSync(join(client, "modulezip.js"), "utf8");
  assert.doesNotMatch(src, /^\s*import\s/m, "modulezip.js loads the library only with a dynamic import");
  assert.doesNotMatch(src, /^\s*export\s+[^;]*\sfrom\s/m);
  const files = readdirSync(client).filter((f) => /\.(js|html)$/.test(f) && f !== "modulezip.js");
  for (const f of files) {
    const text = readFileSync(join(client, f), "utf8");
    assert.doesNotMatch(text, /(?:import\s*\(|from\s+|<script[^>]*src=)\s*['"][^'"]*vendor\/zip\.js/, `${f} imports the vendored zip.js`);
    assert.doesNotMatch(text, /from\s+['"][^'"]*modulezip\.js['"]|<script[^>]*modulezip/, `${f} imports modulezip.js statically`);
  }
});

test("every vendored zip.js file is in the README with its SHA-256, and matches", () => {
  const readme = readFileSync(join(client, "vendor/README.md"), "utf8");
  const section = readme.slice(readme.indexOf("## zip.js"));
  assert.ok(section.length > 100, "the README has a zip.js section");
  const listed = new Map([...section.matchAll(/^\| `([^`]+)` \| [\d,]+ \| [\d,]+ \| `([0-9a-f]{64})` \|$/gm)].map((m) => [m[1], m[2]]));
  const walk = (d) => readdirSync(d).flatMap((f) => statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]);
  const onDisk = walk(vendor).map((f) => relative(vendor, f).split("\\").join("/")).sort();
  assert.equal(onDisk.length, 37, "36 library files and LICENSE");
  assert.deepEqual([...listed.keys()].sort(), onDisk);
  for (const f of onDisk) assert.equal(sha(readFileSync(join(vendor, f))), listed.get(f), f);
  assert.match(readFileSync(join(vendor, "LICENSE"), "utf8"), /^BSD 3-Clause License/);
});
