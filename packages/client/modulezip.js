// The adventure-module zip, read and written (docs/specs/adventure-module.md, Decision 1 and Decision 5 pass 1).
//
// One wrapper for every reader: the browser (solo and the import dialog), the table server (it imports this file by
// path) and the assemble script. The wrapper holds every safety check of pass 1. The vendored zip.js
// (packages/client/vendor/zip.js, README there) only inflates bytes and writes zips; everything the wrapper refuses, it
// refuses by reading the zip's fixed-size records itself, before the library is even loaded.
//
//   readModuleZip(file, opts)  -> { ok: true, manifest, data, found, missing, pictures, skipped, stripped, inflated }
//                               | { ok: false, problems: [sentence...], inflated }
//     file: Uint8Array, ArrayBuffer or Blob. opts: { limits, timeLimitMs, now, checkManifest, sha256 }.
//     checkManifest(manifest) -> [sentence...]: passes 2 to 4 of the manifest (the rules package's), run after the
//     manifest is inflated and before anything else is.
//   scanZip(bytes, limits)     -> the directory pass alone (sync, no inflating): { problems } or { entries, ... }
//   writeModuleZip({ manifest, data, pictures }) -> Uint8Array   (manifest first, data second, pictures stored)
//   toJsonForm(read)           -> the JSON form { format: 'hextable-adventure-json', v: 1, manifest, data, pictures? }
//
// The library is loaded only by the first read or write (a dynamic import of a fixed path), so a page that imports
// this file and never opens a module fetches none of it. It is configured with web workers off, and no extra codec is
// ever registered, so its one run-time import() (an optional codec's URI) can never run: a read refuses to start if a
// codec has been registered by anybody.

const KB = 1024, MB = 1024 * 1024;

export const ZIP_LIMITS = Object.freeze({
  fileBytes: 100 * MB,        // the zip itself
  unpackedBytes: 95 * MB,     // every entry inflated
  entries: 320,
  nameBytes: 100,
  ratio: 200,                 // one entry's unpacked size to its packed size
  commentBytes: 1 * KB,
  manifestBytes: 128 * KB,    // module.json
  dataBytes: 4 * MB,          // adventure.json
  pictureBytes: 5 * MB,       // one picture
  serverMs: 5000,             // the whole unpack, on the server
  browserMs: 20000,           // and in a browser
  // What the library reads at a time. The platform's DecompressionStream may expand one whole input chunk before the
  // first piece reaches a counter (deflate's ceiling is about 1,032 to 1), so this bounds a bomb's transient memory to
  // about 16 MB. Measured on a 90 MB read of stored pictures in Node 22: 16 KB is as fast as 64 KB; 4 KB is twice slower.
  chunkBytes: 16 * KB,
});

// What the library is told. useWebWorkers: false is the owner's condition (#572); useCompressionStream keeps the
// platform's own DecompressionStream ('deflate-raw'), which Node 22 and current browsers have.
export const LIBRARY_CONFIG = Object.freeze({ useWebWorkers: false, useCompressionStream: true, chunkSize: ZIP_LIMITS.chunkBytes });
const LIBRARY_PATH = './vendor/zip.js/zip-core.js';
const LIBRARY_VERSION = '2.25.0';
const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

let library = null;
/** The vendored zip.js, loaded once, configured with workers off. */
export async function loadZipLibrary() {
  if (!library) {
    const zip = await import(LIBRARY_PATH);
    if (zip.VERSION !== LIBRARY_VERSION) throw new Error(`modulezip: expected zip.js ${LIBRARY_VERSION}, found ${zip.VERSION}`);
    zip.configure(LIBRARY_CONFIG);
    library = zip;
  }
  return library;
}

// ---- small helpers ----------------------------------------------------------------------------------------------

const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const SIG = { eocd: 0x06054b50, cen: 0x02014b50, loc: 0x04034b50, desc: 0x08074b50, z64loc: 0x07064b50 };
const num = (n) => n.toLocaleString('en-GB');
const size = (n) => n >= MB ? `${Math.round((n / MB) * 10) / 10} MB` : n >= KB ? `${Math.round(n / KB)} KB` : `${num(n)} bytes`;
const ascii = (raw) => String.fromCharCode(...raw);

/** A name as it may be shown: printable ASCII as it is, `"` and `\` escaped, every other byte as \xNN; cut at 120 bytes. */
export function escapeName(raw) {
  let s = '';
  const n = Math.min(raw.length, 120);
  for (let i = 0; i < n; i++) {
    const b = raw[i];
    if (b === 0x22) s += '\\"';
    else if (b === 0x5c) s += '\\\\';
    else if (b >= 0x20 && b < 0x7f) s += String.fromCharCode(b);
    else s += '\\x' + b.toString(16).padStart(2, '0');
  }
  return raw.length > n ? s + '...' : s;
}

// What the bytes are: PNG, JPEG or WebP (the same test as client/assets.js and the server's assets.js).
export function sniff(b) {
  if (b.length < 16) return null;
  const s = (i, j) => String.fromCharCode(...b.subarray(i, j));
  if (b[0] === 0x89 && s(1, 4) === 'PNG' && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a && s(12, 16) === 'IHDR') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff && b[3] >= 0xc0) return 'image/jpeg';
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP' && /^VP8[ LX]$/.test(s(12, 16))) return 'image/webp';
  return null;
}

function capped(problems) {
  return problems.length > 10 ? [...problems.slice(0, 10), `and ${problems.length - 10} more.`] : problems;
}
const refuse = (problems, inflated = 0) => ({ ok: false, problems: capped(Array.isArray(problems) ? problems : [problems]), inflated });

// ---- names ------------------------------------------------------------------------------------------------------

const SKIPPED_CHARS = /^[A-Za-z0-9._\-/]+$/;   // __MACOSX/ and .DS_Store mirror the module's names, with ._ and capitals
const MODULE_CHARS = /^[a-z0-9._\-/]+$/;
const isSkipped = (name) => name === '__MACOSX/' || name.startsWith('__MACOSX/') || name === '.DS_Store' || name.endsWith('/.DS_Store');

// The checks every name passes, before a top folder is stripped. Returns true if the name is one a zip may carry.
function soundName(raw, name, skipped, limits) {
  if (raw.length === 0 || raw.length > limits.nameBytes) return false;
  for (const b of raw) if (b < 0x20 || b > 0x7e) return false;                 // NUL, controls, é, emoji: not ASCII
  if (!(skipped ? SKIPPED_CHARS : MODULE_CHARS).test(name)) return false;     // \, :, spaces, capitals...
  if (name.startsWith('/')) return false;
  const segs = (name.endsWith('/') ? name.slice(0, -1) : name).split('/');
  return segs.every((s) => s !== '' && s !== '.' && s !== '..') && !name.includes('..');
}

// After the strip: what an entry of a module may be. 'manifest' | 'data' | 'pictures-dir' | 'picture' | 'bad' | 'extra'
function roleOf(name, dir) {
  if (dir) return name === 'pictures/' ? 'pictures-dir' : name.includes('/') && name.indexOf('/') < name.length - 1 ? 'bad' : 'extra';
  if (name === 'module.json') return 'manifest';
  if (name === 'adventure.json') return 'data';
  const slash = name.indexOf('/');
  if (slash < 0) return 'extra';
  if (name.slice(0, slash) !== 'pictures' || name.indexOf('/', slash + 1) >= 0 || slash === name.length - 1) return 'bad';
  return 'picture';
}

// ---- the directory pass (pure, synchronous, no inflating) -------------------------------------------------------

/**
 * Reads the end record, the central directory and every local header of `bytes`, and does every check of pass 1 that
 * needs no inflating: the end record, the entry count, names, duplicates, kinds, encryption, methods, ZIP64, disks,
 * the layout (local headers, data descriptors, overlaps), the order, and every declared size against its cap.
 */
export function scanZip(bytes, limits = ZIP_LIMITS) {
  const len = bytes.length;
  if (len > limits.fileBytes) return { problems: [`zip: the file is ${size(len)}; a module may be at most ${size(limits.fileBytes)}.`] };
  if (len < 22) return { problems: ['zip: the file is not a zip (it has no end record).'] };

  // The end record: found once, reaching the end of the file exactly.
  const found = [];
  let anySig = false;
  for (let i = len - 22; i >= Math.max(0, len - 22 - 0xffff); i--) {
    if (u32(bytes, i) !== SIG.eocd) continue;
    anySig = true;
    if (i + 22 + u16(bytes, i + 20) === len) found.push(i);
  }
  if (!found.length) return { problems: [anySig ? 'zip: there are bytes after the end record of the zip; the file is refused.' : 'zip: the file is not a zip (it has no end record).'] };
  if (found.length > 1) return { problems: ['zip: the file has more than one end record; the file is refused.'] };
  const e = found[0];
  const disk = u16(bytes, e + 4), cdDisk = u16(bytes, e + 6), onDisk = u16(bytes, e + 8), total = u16(bytes, e + 10);
  const cdSize = u32(bytes, e + 12), cdOffset = u32(bytes, e + 16), commentLen = u16(bytes, e + 20);
  if (total === 0xffff || onDisk === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff || (e >= 20 && u32(bytes, e - 20) === SIG.z64loc))
    return { problems: ['zip: the file has ZIP64 records; a module never needs them, so the file is refused.'] };
  if (disk !== 0 || cdDisk !== 0 || onDisk !== total) return { problems: ['zip: the file is one part of a multi-disk archive; a module is one file.'] };
  if (commentLen > limits.commentBytes) return { problems: [`zip: the archive comment is ${size(commentLen)}; a module may carry at most ${size(limits.commentBytes)}.`] };
  if (total > limits.entries) return { problems: [`zip: the file holds ${num(total)} entries; a module may hold at most ${num(limits.entries)}.`] };
  if (cdOffset + cdSize !== e) return { problems: ['zip: the central directory is not where the end record says; the file is refused.'] };

  // The central directory, record by record.
  const entries = [];
  let p = cdOffset;
  for (let k = 0; k < total; k++) {
    if (p + 46 > e || u32(bytes, p) !== SIG.cen) return { problems: ['zip: the central directory is damaged; the file is refused.'] };
    const nameLen = u16(bytes, p + 28), extraLen = u16(bytes, p + 30), cmtLen = u16(bytes, p + 32);
    const end = p + 46 + nameLen + extraLen + cmtLen;
    if (end > e) return { problems: ['zip: the central directory is damaged; the file is refused.'] };
    const raw = bytes.subarray(p + 46, p + 46 + nameLen);
    entries.push({
      index: k, raw, rawName: ascii(raw), madeBy: u16(bytes, p + 4), flags: u16(bytes, p + 8), method: u16(bytes, p + 10),
      crc: u32(bytes, p + 16), csize: u32(bytes, p + 20), usize: u32(bytes, p + 24), diskStart: u16(bytes, p + 34),
      extAttr: u32(bytes, p + 38), offset: u32(bytes, p + 42), extra: bytes.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen),
    });
    p = end;
  }
  if (p !== e) return { problems: ['zip: the central directory is damaged; the file is refused.'] };

  // Names: every one sound, then the top folder (if every entry sits under one) stripped once.
  const problems = [];
  for (const en of entries) {
    en.skipped = isSkipped(en.rawName);
    if (!soundName(en.raw, en.rawName, en.skipped, limits)) problems.push(`zip: the entry "${escapeName(en.raw)}" is not a name a module may use.`);
  }
  // Duplicates, compared lower-cased, over every entry (a skipped one too). The strip below removes one prefix from
  // every name it touches, so it cannot make two names equal or unequal.
  const seen = new Set();
  for (const en of entries) {
    const key = en.rawName.toLowerCase();
    if (seen.has(key)) problems.push(`zip: two entries are named "${escapeName(en.raw)}" (names are compared without capitals).`);
    seen.add(key);
  }
  if (problems.length) return { problems };
  const kept = entries.filter((en) => !en.skipped);
  let stripped = null;
  const firsts = new Set(kept.map((en) => en.rawName.includes('/') ? en.rawName.slice(0, en.rawName.indexOf('/')) : null));
  if (kept.length && !firsts.has(null)) {           // nothing at the top: everything sits in folders
    if (firsts.size > 1) return { problems: [`zip: the file has ${num(firsts.size)} top-level folders (${[...firsts].map((f) => `"${f}"`).join(', ')}); a module has its files at the top, or in one folder.`] };
    const only = [...firsts][0];
    if (only !== 'pictures') stripped = only;
  }
  for (const en of entries) {
    en.dir = en.rawName.endsWith('/');
    en.name = en.skipped ? en.rawName : stripped && en.rawName.startsWith(stripped + '/') ? en.rawName.slice(stripped.length + 1) : en.rawName;
    en.role = en.skipped ? 'skipped' : en.name === '' ? 'top-dir' : roleOf(en.name, en.dir);
    if (en.role === 'bad') problems.push(`zip: the entry "${escapeName(en.raw)}" is not a name a module may use.`);
    else if (en.role === 'extra') problems.push(`zip: the entry "${escapeName(en.raw)}" is not part of a module (only module.json, adventure.json and pictures/ may be in one).`);
  }
  if (problems.length) return { problems };

  // Kinds, encryption, methods, ZIP64 and disks, record by record.
  for (const en of entries) {
    const n = `"${escapeName(en.raw)}"`;
    const mode = en.extAttr >>> 16, type = mode & 0o170000, dos = en.extAttr & 0xff;
    if (type === 0o120000) { problems.push(`zip: the entry ${n} is a symbolic link; a module holds only files.`); continue; }
    if (type !== 0 && type !== 0o100000 && type !== 0o040000) { problems.push(`zip: the entry ${n} is a device or another special file; a module holds only files.`); continue; }
    if (type !== 0 ? (type === 0o040000) !== en.dir : (dos & 0x10) && !en.dir) { problems.push(`zip: the entry ${n} says it is a folder and a file at once; the file is refused.`); continue; }
    if (dos & 0x08) { problems.push(`zip: the entry ${n} is a volume label; a module holds only files.`); continue; }
    if (en.flags & 0x0001 || en.flags & 0x0040 || en.flags & 0x2000) { problems.push(`zip: the entry ${n} is encrypted; a module is never encrypted.`); continue; }
    if (en.method !== 0 && en.method !== 8) { problems.push(`zip: the entry ${n} uses compression method ${en.method}; a module may use only stored (0) or deflate (8).`); continue; }
    if (en.csize === 0xffffffff || en.usize === 0xffffffff || en.offset === 0xffffffff || hasExtra(en.extra, 0x0001)) { problems.push(`zip: the entry ${n} has a ZIP64 record; a module never needs them, so the file is refused.`); continue; }
    if (en.diskStart !== 0) { problems.push(`zip: the entry ${n} is on another disk; a module is one file.`); continue; }
    if (en.dir && (en.usize !== 0 || en.csize !== 0)) { problems.push(`zip: the folder entry ${n} carries data; the file is refused.`); continue; }
    if (en.method === 0 && en.csize !== en.usize) problems.push(`zip: the entry ${n} is stored but its two sizes differ; the file is refused.`);
  }
  if (problems.length) return { problems };

  // Layout: each local header agrees with its central record; no data overlaps; nothing runs into the directory.
  for (const en of entries) {
    const n = `"${escapeName(en.raw)}"`;
    const o = en.offset;
    if (o + 30 > cdOffset || u32(bytes, o) !== SIG.loc) { problems.push(`zip: the entry ${n} has no local header where the directory says; the file is refused.`); continue; }
    const lFlags = u16(bytes, o + 6), lMethod = u16(bytes, o + 8), lCrc = u32(bytes, o + 14), lC = u32(bytes, o + 18), lU = u32(bytes, o + 22);
    const lName = u16(bytes, o + 26), lExtra = u16(bytes, o + 28);
    const dataStart = o + 30 + lName + lExtra;
    if (dataStart > cdOffset) { problems.push(`zip: the entry ${n} runs into the central directory; the file is refused.`); continue; }
    const localRaw = bytes.subarray(o + 30, o + 30 + lName);
    if (lName !== en.raw.length || localRaw.some((b, i) => b !== en.raw[i])) { problems.push(`zip: the entry ${n} has another name in its local header ("${escapeName(localRaw)}"); the file is refused.`); continue; }
    if (lMethod !== en.method || (lFlags & ~0x0800) !== (en.flags & ~0x0800)) { problems.push(`zip: the local header of ${n} disagrees with the directory (method or flags); the file is refused.`); continue; }
    if (hasExtra(bytes.subarray(o + 30 + lName, dataStart), 0x0001)) { problems.push(`zip: the entry ${n} has a ZIP64 record; a module never needs them, so the file is refused.`); continue; }
    const dataEnd = dataStart + en.csize;
    if (dataEnd > cdOffset) { problems.push(`zip: the data of ${n} runs into the central directory; the file is refused.`); continue; }
    let rangeEnd = dataEnd;
    if (en.flags & 0x0008) {
      if ((lCrc !== 0 && lCrc !== en.crc) || (lC !== 0 && lC !== en.csize) || (lU !== 0 && lU !== en.usize)) { problems.push(`zip: the local header of ${n} disagrees with the directory (sizes or CRC-32); the file is refused.`); continue; }
      const sig = dataEnd + 4 <= cdOffset && u32(bytes, dataEnd) === SIG.desc ? 4 : 0;
      if (dataEnd + sig + 12 > cdOffset) { problems.push(`zip: the data descriptor of ${n} runs into the central directory; the file is refused.`); continue; }
      const d = dataEnd + sig;
      if (u32(bytes, d) !== en.crc || u32(bytes, d + 4) !== en.csize || u32(bytes, d + 8) !== en.usize) { problems.push(`zip: the data descriptor of ${n} disagrees with the directory; the file is refused.`); continue; }
      rangeEnd = d + 12;
    } else if (lCrc !== en.crc || lC !== en.csize || lU !== en.usize) { problems.push(`zip: the local header of ${n} disagrees with the directory (sizes or CRC-32); the file is refused.`); continue; }
    en.start = o; en.dataStart = dataStart; en.end = rangeEnd;
  }
  if (problems.length) return { problems };
  const byOffset = [...entries].sort((a, b) => a.start - b.start);
  for (let i = 1; i < byOffset.length; i++)
    if (byOffset[i].start < byOffset[i - 1].end) problems.push(`zip: the entries "${escapeName(byOffset[i - 1].raw)}" and "${escapeName(byOffset[i].raw)}" share data; the file is refused.`);
  if (problems.length) return { problems };

  // Order: module.json is the first file by offset, adventure.json the second (folders and skipped desktop files aside).
  const files = byOffset.filter((en) => !en.dir && !en.skipped);
  const manifest = files.find((en) => en.role === 'manifest'), data = files.find((en) => en.role === 'data');
  if (!manifest) return { problems: ['zip: the file has no module.json; it is not a module.'] };
  if (files[0] !== manifest) return { problems: [`zip: module.json must be the first entry; the first is "${escapeName(files[0].raw)}".`] };
  if (!data) return { problems: ['zip: the file has no adventure.json; it is not a module.'] };
  if (files[1] !== data) return { problems: [`zip: adventure.json must be the second entry; the second is "${escapeName(files[1].raw)}".`] };

  // Declared sizes against their caps, before anything is inflated.
  let declared = 0;
  for (const en of files) {
    const n = en.name;
    en.cap = en.role === 'manifest' ? limits.manifestBytes : en.role === 'data' ? limits.dataBytes : limits.pictureBytes;
    if (en.usize > en.cap) problems.push(`zip: ${n} unpacks to ${size(en.usize)}; it may be at most ${size(en.cap)}.`);
    else if (en.usize > limits.ratio * en.csize) problems.push(`zip: ${n} unpacks to more than ${limits.ratio} times its size; the file is refused.`);
    declared += en.usize;
  }
  if (problems.length) return { problems };
  if (declared > limits.unpackedBytes) return { problems: [`zip: the entries unpack to ${size(declared)} in all; a module may unpack to at most ${size(limits.unpackedBytes)}.`] };

  return { entries, files, manifest, data, pictures: files.filter((en) => en.role === 'picture'), skipped: entries.filter((en) => en.skipped).map((en) => en.rawName), stripped, cdOffset };
}

function hasExtra(extra, id) {
  for (let i = 0; i + 4 <= extra.length;) {
    if (u16(extra, i) === id) return true;
    i += 4 + u16(extra, i + 2);
  }
  return false;
}

// ---- reading ----------------------------------------------------------------------------------------------------

const isNode = typeof process !== 'undefined' && !!process.versions?.node && typeof window === 'undefined';
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX64 = /^[0-9a-f]{64}$/;
const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

async function defaultSha256(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('modulezip: this page cannot compute SHA-256 (crypto.subtle needs a secure context: https or localhost)');
  const d = new Uint8Array(await subtle.digest('SHA-256', bytes));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

function parseJson(bytes, name) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { return { problem: `zip: ${name} is not UTF-8 text.` }; }
  let v;
  try { v = JSON.parse(text); } catch { return { problem: `zip: ${name} is not JSON.` }; }
  if (!plain(v)) return { problem: `zip: ${name} is not a JSON object.` };
  return { value: v };
}

/**
 * Reads a module zip, doing every check of Decision 5's pass 1. Refuses with sentences; never throws for a bad file
 * (it throws only for a fault of the page: no SHA-256, a wrong library, a codec registered with the library).
 */
export async function readModuleZip(file, opts = {}) {
  const limits = { ...ZIP_LIMITS, ...opts.limits };
  const now = opts.now ?? (() => Date.now());
  const sha256 = opts.sha256 ?? defaultSha256;
  const timeLimit = opts.timeLimitMs ?? (isNode ? limits.serverMs : limits.browserMs);
  const started = now();
  const deadline = started + timeLimit;

  // Size first, on the byte length, before anything is read.
  const length = file?.byteLength ?? file?.size;
  if (typeof length !== 'number') throw new TypeError('modulezip: give a Uint8Array, an ArrayBuffer or a Blob');
  if (length > limits.fileBytes) return refuse(`zip: the file is ${size(length)}; a module may be at most ${size(limits.fileBytes)}.`);
  const bytes = file instanceof Uint8Array ? file : file instanceof ArrayBuffer ? new Uint8Array(file) : new Uint8Array(await file.arrayBuffer());

  const scan = scanZip(bytes, limits);
  if (scan.problems) return refuse(scan.problems);

  const zip = await loadZipLibrary();
  if (zip.getRegisteredCodecs().length) throw new Error('modulezip: a codec is registered with zip.js; the wrapper allows none');
  const ctx = { inflated: 0, total: 0, now, deadline, timeLimit, limits };
  const late = () => refuse(`zip: the file took longer than ${timeLimit / 1000} seconds to unpack; it is refused.`, ctx.inflated);

  // The library lists the same entries the wrapper read, or the file is refused.
  let libEntries;
  const reader = new zip.ZipReader(new zip.Uint8ArrayReader(bytes), { useWebWorkers: false, checkSignature: true });
  try { libEntries = await reader.getEntries(); }
  catch (err) { return refuse(`zip: the file could not be read (${String(err?.message ?? err).slice(0, 120)}).`); }
  const byOffset = new Map(libEntries.map((le) => [le.offset, le]));
  const agree = libEntries.length === scan.entries.length && scan.entries.every((en) => {
    const le = byOffset.get(en.offset);
    return le && le.compressedSize === en.csize && le.uncompressedSize === en.usize && le.compressionMethod === en.method && !le.encrypted &&
      le.rawFilename?.length === en.raw.length && le.rawFilename.every((b, i) => b === en.raw[i]);
  });
  if (!agree) return refuse('zip: the zip library reads this file\'s directory differently from the checks; the file is refused.');
  if (now() > deadline) return late();

  const inflate = (en) => inflateEntry(byOffset.get(en.offset), en, ctx);

  // The manifest, inflated first and checked (passes 2 to 4, by the caller's checkManifest) before anything else.
  let out = await inflate(scan.manifest);
  if (out.problem) return refuse(out.problem, ctx.inflated);
  const m = parseJson(out.bytes, 'module.json');
  if (m.problem) return refuse(m.problem, ctx.inflated);
  const manifest = m.value;
  if (opts.checkManifest) {
    const problems = opts.checkManifest(manifest) ?? [];
    if (problems.length) return refuse(problems, ctx.inflated);
  }

  // Every picture the manifest names is in the zip or missing; every picture in the zip is named by the manifest.
  const lines = manifest.pictures ?? {};
  if (!plain(lines)) return refuse('module.json: pictures is not a list of pictures.', ctx.inflated);
  const problems = [];
  const byFile = new Map();
  for (const [id, line] of Object.entries(lines)) {
    const at = `pictures/${escapeName(new TextEncoder().encode(id))}`;
    if (!KEBAB.test(id) || id.length > 60) { problems.push(`module.json: the picture id "${escapeName(new TextEncoder().encode(id))}" is not a kebab id.`); continue; }
    if (!plain(line) || typeof line.file !== 'string' || !TYPES.includes(line.mime) || !Number.isInteger(line.bytes) || line.bytes < 1 || typeof line.sha256 !== 'string' || !HEX64.test(line.sha256)) {
      problems.push(`${at}: the picture's line needs file, mime (PNG, JPEG or WebP), bytes and sha256.`); continue;
    }
    const raw = new TextEncoder().encode(line.file);
    if (!soundName(raw, line.file, false, limits) || roleOf(line.file, false) !== 'picture') { problems.push(`${at}: the file "${escapeName(raw)}" is not a picture's name in a module.`); continue; }
    if (byFile.has(line.file)) { problems.push(`${at}: the file ${line.file} is named by the picture "${byFile.get(line.file).id}" too.`); continue; }
    byFile.set(line.file, { id, line });
  }
  const inZip = new Map();
  for (const en of scan.pictures) {
    const named = byFile.get(en.name);
    if (!named) { problems.push(`zip: ${en.name} is not named in module.json; a module holds no unnamed files.`); continue; }
    if (en.usize !== named.line.bytes) { problems.push(`pictures/${named.id}: the picture is ${num(en.usize)} bytes, not the ${num(named.line.bytes)} the module names.`); continue; }
    inZip.set(named.id, en);
  }
  if (problems.length) return refuse(problems, ctx.inflated);
  if (now() > deadline) return late();

  // The data.
  out = await inflate(scan.data);
  if (out.problem) return refuse(out.problem, ctx.inflated);
  const d = parseJson(out.bytes, 'adventure.json');
  if (d.problem) return refuse(d.problem, ctx.inflated);

  // The pictures, one at a time, in the order they sit in the zip.
  const pictures = {};
  const order = [...inZip.entries()].sort((a, b) => a[1].offset - b[1].offset);
  for (const [id, en] of order) {
    out = await inflate(en);
    if (out.problem) return refuse(out.problem, ctx.inflated);
    const line = lines[id];
    const mime = sniff(out.bytes);
    if (!mime) return refuse(`pictures/${id}: the file is not a PNG, JPEG or WebP picture.`, ctx.inflated);
    if (mime !== line.mime) return refuse(`pictures/${id}: the file is ${mime}, not the ${line.mime} the module names.`, ctx.inflated);
    if (await sha256(out.bytes) !== line.sha256) return refuse(`pictures/${id}: the picture is not the file the module names (its fingerprint differs).`, ctx.inflated);
    if (now() > deadline) return late();
    pictures[id] = out.bytes;
  }
  const found = Object.keys(lines).filter((id) => inZip.has(id));
  const missing = Object.keys(lines).filter((id) => !inZip.has(id));
  return { ok: true, manifest, data: d.value, found, missing, pictures, skipped: scan.skipped, stripped: scan.stripped, inflated: ctx.inflated };
}

// One entry through the library, its output counted as it comes and stopped the moment it passes a limit.
async function inflateEntry(libEntry, en, ctx) {
  const { limits } = ctx;
  const out = new Uint8Array(en.usize);
  let n = 0, why = null;
  const ac = new AbortController();
  const stop = (reason) => { why ??= reason; ac.abort(); };
  const timer = setTimeout(() => stop('time'), Math.max(0, ctx.deadline - ctx.now()));
  const sink = new WritableStream({
    write(chunk) {
      const next = n + chunk.length;
      ctx.inflated += chunk.length;
      if (ctx.now() > ctx.deadline) stop('time');
      else if (next > en.usize) stop('declared');
      else if (next > en.cap) stop('cap');
      else if (next > limits.ratio * en.csize) stop('ratio');
      else if (ctx.total + next > limits.unpackedBytes) stop('total');
      if (why) throw new Error(why);
      out.set(chunk, n);
      n = next;
    },
  });
  let err = null;
  try { await libEntry.getData(sink, { useWebWorkers: false, useCompressionStream: true, checkSignature: true, signal: ac.signal }); }
  catch (e) { err = e; }
  finally { clearTimeout(timer); }
  const name = en.name;
  const msg = String(err?.message ?? '');
  if (why === 'time') return { problem: `zip: the file took longer than ${ctx.timeLimit / 1000} seconds to unpack; it is refused.` };
  if (why === 'declared' || msg === 'Invalid uncompressed size') return { problem: `zip: ${name} unpacks to more than its declared size; the file is refused.` };
  if (why === 'cap') return { problem: `zip: ${name} unpacks to more than ${size(en.cap)}; the file is refused.` };
  if (why === 'ratio') return { problem: `zip: ${name} unpacks to more than ${limits.ratio} times its size; the file is refused.` };
  if (why === 'total') return { problem: `zip: the entries unpack to more than ${size(limits.unpackedBytes)} in all; the file is refused.` };
  if (msg === 'Invalid CRC32' || msg === 'Invalid signature') return { problem: `zip: ${name} does not match its CRC-32; the file is damaged or was changed.` };
  if (err) return { problem: `zip: ${name} is damaged; its data does not unpack.` };
  if (n !== en.usize) return { problem: `zip: ${name} unpacks to fewer bytes than it declares; the file is refused.` };
  ctx.total += n;
  return { bytes: out };
}

// ---- writing, and the JSON form ---------------------------------------------------------------------------------

const FIXED_DATE = new Date(2026, 0, 1, 0, 0, 0);

/**
 * Writes a module zip: module.json first, adventure.json second (deflated), then the pictures the manifest names and
 * `pictures` holds (stored: pictures barely compress), in the manifest's order. A picture left out is a lean copy.
 * Fixed dates, no ZIP64, no data descriptors, no extra fields, so the same module gives the same bytes.
 */
export async function writeModuleZip({ manifest, data, pictures = {} }) {
  const zip = await loadZipLibrary();
  const writer = new zip.ZipWriter(new zip.Uint8ArrayWriter(), { useWebWorkers: false, zip64: false, dataDescriptor: false, extendedTimestamp: false, lastModDate: FIXED_DATE, keepOrder: true });
  const text = (v) => new zip.TextReader(JSON.stringify(v, null, 2) + '\n');
  await writer.add('module.json', text(manifest), { level: 9 });
  await writer.add('adventure.json', text(data), { level: 9 });
  for (const [id, line] of Object.entries(manifest.pictures ?? {}))
    if (pictures[id]) await writer.add(line.file, new zip.Uint8ArrayReader(pictures[id]), { level: 0 });
  return writer.close();
}

function base64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** The JSON form of a read module (for tests and tools): { format, v, manifest, data, pictures? } with base64 pictures. */
export function toJsonForm(read) {
  const form = { format: 'hextable-adventure-json', v: 1, manifest: read.manifest, data: read.data };
  const ids = Object.keys(read.pictures ?? {});
  if (ids.length) form.pictures = Object.fromEntries(ids.map((id) => [id, base64(read.pictures[id])]));
  return form;
}
