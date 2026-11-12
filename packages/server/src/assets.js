// Files a DM uploads to a table: handout pictures and level backgrounds. No network code here;
// the HTTP side is in assets-http.js. This is the first place the server keeps bytes that people
// send it, so it trusts nothing about them: the type comes from the bytes, the id from
// crypto.randomBytes, and no part of a path ever comes from the client unchecked.
//
//   const assets = createAssets({ dir, limits });   // dir: DATA_DIR/assets
//   assets.put(code, bytes, { name })  -> { ok: true, record } | { ok: false, status, error }
//   assets.get(code, id)               -> { record, path } | null
//   assets.list(code) / assets.remove(code, id) / assets.removeTable(code)
//
// On disk: <dir>/<code>/<id> holds the bytes and <dir>/<code>/<id>.json the record
// { id, kind, mime, bytes, name, when }.
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
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

export function createAssets({ dir, limits = {} }) {
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
      let id = makeId();
      while (recs.has(id)) id = makeId();
      const record = { id, kind: "image", mime, bytes: bytes.length, name: cleanName(name), when: new Date().toISOString() };
      mkdirSync(d, { recursive: true });
      const file = fileOf(code, id);
      writeFileSync(file + ".tmp", bytes); renameSync(file + ".tmp", file);
      writeFileSync(file + ".json.tmp", JSON.stringify(record)); renameSync(file + ".json.tmp", file + ".json");
      recs.set(id, record);
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
      records(code).delete(id);
      return true;
    },
    removeTable(code) {
      const d = tableDir(code);
      if (!d) return;
      rmSync(d, { recursive: true, force: true });
      index.delete(code);
    },
    // Table codes that have a folder of files, for clearing away those of tables that are gone.
    codes: () => readdirSync(root).filter((n) => CODE.test(n)),
    usage: (code) => ({ files: records(code).size, bytes: used(code) }),
  };
}
