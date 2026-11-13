// Files a DM uploads to a table: handout pictures and level backgrounds. No network code here;
// the HTTP side is in assets-http.js. This is the first place the server keeps bytes that people
// send it, so it trusts nothing about them: the type comes from the bytes, the id from
// crypto.randomBytes, and no part of a path ever comes from the client unchecked.
//
//   const assets = createAssets({ dir, limits });   // dir: DATA_DIR/assets; clears leftovers of a crash
//   assets.put(code, bytes, { name })  -> { ok: true, record } | { ok: false, status, error }
//   assets.get(code, id)               -> { record, path } | null
//   assets.list(code) / assets.remove(code, id) / assets.removeTable(code)
//   assets.room(code)                  -> { bytes, reason: "table" | "server" }: the most one more file may weigh
//   assets.usage(code) / assets.totalUsage()
//   assets.pack(code, { limit, first }) -> { assets: [{ record, data }], skipped: [record], limit }   (for a table export)
//
// On disk: <dir>/<code>/<id> holds the bytes and <dir>/<code>/<id>.json the record
// { id, kind, mime, bytes, name, when }. Disk is bounded per file, per table (bytes and count) and
// for the whole server (totalAssetBytes), so tables left idle cannot fill it over time.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { EXPORT_ASSET_BYTES } from "../../rules/src/handouts.js";
import { DEFAULT_LIMITS } from "./limits.js";

export const ASSET_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const CODE = /^[A-HJKMNP-Z2-9]{6}$/;           // the table code alphabet (tables.js)
export const ID = /^[A-Za-z0-9_-]{22}$/;              // 16 random bytes, base64url
const makeId = () => randomBytes(16).toString("base64url");
const cleanName = (name) => String(name ?? "").replace(/[\u0000-\u001f\u007f<>"'`\\/]/g, "").trim().slice(0, 80) || "image";

// What the bytes say they are, or null. Only the three image formats the game shows; anything else,
// SVG and HTML included, is null whatever it claims to be.
export function sniff(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 16) return null;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && buf.toString("latin1", 12, 16) === "IHDR") return "image/png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff && buf[3] >= 0xc0) return "image/jpeg";
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP" && /^VP8[ LX]$/.test(buf.toString("latin1", 12, 16))
    && buf.readUInt32LE(4) + 8 <= buf.length + 1) return "image/webp";
  return null;
}

// Names of what may sit in a table's folder: a file and its record.
const FILE = /^([A-Za-z0-9_-]{22})(\.json)?$/;
const NO_SPACE = new Set(["ENOSPC", "EDQUOT"]);
export const SERVER_FULL = "The server has no room left for files. Delete some, or ask whoever runs it.";

export function createAssets({ dir, limits = {}, writeFile = writeFileSync }) {
  const lim = { ...DEFAULT_LIMITS, ...limits };
  const root = resolve(dir);
  mkdirSync(root, { recursive: true });
  // Every path is built here from a checked code and id, and checked again to lie inside root.
  const tableDir = (code) => {
    if (typeof code !== "string" || !CODE.test(code)) return null;
    const p = join(root, code);
    return p.startsWith(root + sep) ? p : null;
  };
  const fileOf = (code, id) => {
    const d = tableDir(code);
    if (!d || typeof id !== "string" || !ID.test(id)) return null;
    const p = join(d, id);
    return p.startsWith(d + sep) ? p : null;
  };

  // code -> Map(id -> record), read from disk the first time a table is asked about.
  const index = new Map();
  function records(code) {
    if (index.has(code)) return index.get(code);
    const d = tableDir(code), out = new Map();
    if (d && existsSync(d)) {
      for (const name of readdirSync(d)) {
        const m = /^([A-Za-z0-9_-]{22})\.json$/.exec(name);
        if (!m || !existsSync(join(d, m[1]))) continue;
        try {
          const r = JSON.parse(readFileSync(join(d, name), "utf8"));
          if (r?.id === m[1] && ASSET_TYPES.includes(r.mime)) out.set(r.id, r);
        } catch { /* an unreadable record: the file is not served */ }
      }
    }
    index.set(code, out);
    return out;
  }
  const used = (code) => { let bytes = 0; for (const r of records(code).values()) bytes += r.bytes; return bytes; };
  const codes = () => readdirSync(root).filter((n) => CODE.test(n));

  // At start: clear what a crash or a failed write left in a table's folder (a .tmp, bytes with no
  // record, a record with no bytes, anything else), then count every table's files towards the total.
  for (const code of codes()) {
    const d = tableDir(code);
    let names;
    try { names = readdirSync(d); } catch { continue; }
    const have = new Set(names);
    for (const name of names) {
      const m = FILE.exec(name);
      const keep = m && (m[2] ? have.has(m[1]) : have.has(`${m[1]}.json`));
      if (!keep) rmSync(join(d, name), { recursive: true, force: true });
    }
  }
  let total = 0;
  for (const code of codes()) total += used(code);
  const room = (code) => {
    const table = lim.tableAssetBytes - used(code), server = lim.totalAssetBytes - total;
    return { bytes: Math.max(0, Math.min(table, server)), reason: server < table ? "server" : "table" };
  };

  return {
    put(code, bytes, { name } = {}) {
      const d = tableDir(code);
      if (!d) return { ok: false, status: 404, error: "Not found" };
      if (!Buffer.isBuffer(bytes) || bytes.length === 0) return { ok: false, status: 400, error: "The file is empty." };
      if (bytes.length > lim.assetBytes) return { ok: false, status: 413, error: `A file can be at most ${Math.floor(lim.assetBytes / 1048576 * 10) / 10} MB.` };
      const mime = sniff(bytes);
      if (!mime) return { ok: false, status: 415, error: "That file is not a PNG, JPEG or WebP picture." };
      const recs = records(code);
      if (recs.size >= lim.tableAssets) return { ok: false, status: 413, error: `A table can keep at most ${lim.tableAssets} files. Delete some first.` };
      if (used(code) + bytes.length > lim.tableAssetBytes) return { ok: false, status: 413, error: "This table has no room left for files. Delete some first." };
      if (total + bytes.length > lim.totalAssetBytes) return { ok: false, status: 507, error: SERVER_FULL };
      let id = makeId();
      while (recs.has(id)) id = makeId();
      const record = { id, kind: "image", mime, bytes: bytes.length, name: cleanName(name), when: new Date().toISOString() };
      const file = fileOf(code, id);
      try {
        mkdirSync(d, { recursive: true });
        writeFile(file + ".tmp", bytes); renameSync(file + ".tmp", file);
        writeFile(file + ".json.tmp", JSON.stringify(record)); renameSync(file + ".json.tmp", file + ".json");
      } catch (err) {
        // Nothing half-written stays: not the bytes, not a record, not a .tmp.
        for (const p of [file + ".tmp", file, file + ".json.tmp", file + ".json"]) { try { rmSync(p, { force: true }); } catch { /* best effort */ } }
        return NO_SPACE.has(err?.code) ? { ok: false, status: 507, error: SERVER_FULL } : { ok: false, status: 500, error: "Could not save the file." };
      }
      recs.set(id, record);
      total += record.bytes;
      return { ok: true, record };
    },
    get(code, id) {
      const path = fileOf(code, id);
      const record = path ? records(code).get(id) : undefined;
      return record ? { record, path } : null;
    },
    list: (code) => (tableDir(code) ? [...records(code).values()] : []),
    remove(code, id) {
      const path = fileOf(code, id);
      if (!path || !records(code).has(id)) return false;
      rmSync(path, { force: true }); rmSync(path + ".json", { force: true });
      total -= records(code).get(id).bytes;
      records(code).delete(id);
      return true;
    },
    removeTable(code) {
      const d = tableDir(code);
      if (!d) return;
      total -= used(code);
      rmSync(d, { recursive: true, force: true });
      index.delete(code);
    },
    // The table's files as base64 with their records, for the DM's export, up to `limit` bytes of
    // files. Those in `first` (the ids the game refers to) are taken first, then the rest oldest
    // first; a file that would pass the limit is left out (its record is returned in `skipped`, with
    // no bytes) and later, smaller ones may still go in. A file that cannot be read is skipped too.
    pack(code, { limit = EXPORT_ASSET_BYTES, first = new Set() } = {}) {
      const recs = tableDir(code) ? [...records(code).values()] : [];
      recs.sort((a, b) => (first.has(b.id) - first.has(a.id)) || String(a.when).localeCompare(String(b.when)));
      const assets = [], skipped = [];
      let bytes = 0;
      for (const record of recs) {
        if (bytes + record.bytes > limit) { skipped.push(record); continue; }
        let buf;
        try { buf = readFileSync(fileOf(code, record.id)); } catch { skipped.push(record); continue; }
        if (bytes + buf.length > limit) { skipped.push(record); continue; }
        bytes += buf.length;
        assets.push({ record, data: buf.toString("base64") });
      }
      return { assets, skipped, limit };
    },
    // Table codes that have a folder of files, for clearing away those of tables that are gone.
    codes,
    usage: (code) => ({ files: records(code).size, bytes: used(code) }),
    totalUsage: () => ({ bytes: total }),
    room,
  };
}
