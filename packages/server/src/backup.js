// Backups of DATA_DIR (#662): a dated folder copy in BACKUP_DIR, the newest few kept. Node built-ins only (there is no tar without a
// dependency), asynchronous file by file so a table is never kept waiting, and it never touches DATA_DIR.
//
//   const r = await runBackup({ dataDir, backupDir });   // -> { ok, name, files, bytes, archive: "included" | "skipped" | "off", removed: [names] }
//
// A backup is written under a name ending `.partial` and renamed when it is whole, so a folder with the usual name is a complete
// copy. Old backups are removed only after a new one is whole, only folders named like ours, and only those past `keep`. A run that
// fails removes its own `.partial` folder and nothing else.
//
// Every save is written whole (a temporary file, then a rename), so each file in a copy is whole; the copy as a whole is not a single
// instant, which the server tolerates (a journal may end mid-line, an undo history for another state is not used).
import { copyFile, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

export const BACKUP_PREFIX = "hextable-backup-";
export const BACKUP_KEEP = 7;
export const ARCHIVE_MAX_BYTES = 500 * 1024 * 1024;     // `archive: "auto"` leaves archive/ out of a backup when it is bigger than this
const NAME = /^hextable-backup-(\d{8})-(\d{6})$/;
const two = (n) => String(n).padStart(2, "0");
// The name for a moment, in UTC so that it sorts as the time does: hextable-backup-20261121-030500.
export function backupName(date) {
  return `${BACKUP_PREFIX}${date.getUTCFullYear()}${two(date.getUTCMonth() + 1)}${two(date.getUTCDate())}-${two(date.getUTCHours())}${two(date.getUTCMinutes())}${two(date.getUTCSeconds())}`;
}
// The dated backups in a folder, oldest first (complete ones only).
export async function listBackups(backupDir) {
  let names = [];
  try { names = await readdir(backupDir); } catch { return []; }
  return names.filter((n) => NAME.test(n)).sort();
}
// Whether a backup is due: none yet today (UTC) and it is at least `hour` o'clock UTC. A restart in the afternoon makes up the night's.
export async function backupDue(backupDir, now = new Date(), hour = 3) {
  if (now.getUTCHours() < hour) return false;
  const last = (await listBackups(backupDir)).at(-1);
  return !last || NAME.exec(last)[1] < backupName(now).slice(BACKUP_PREFIX.length, BACKUP_PREFIX.length + 8);
}

async function sizeOf(dir) {
  let total = 0;
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    if (e.isDirectory()) total += await sizeOf(p);
    else if (e.isFile()) total += (await stat(p).catch(() => ({ size: 0 }))).size;
  }
  return total;
}

let running = false;
export async function runBackup({ dataDir, backupDir, keep = BACKUP_KEEP, archive = "auto", archiveMax = ARCHIVE_MAX_BYTES, now = () => new Date(), log = () => {} } = {}) {
  if (!dataDir || !backupDir) return { ok: false, error: "dataDir and backupDir are both needed" };
  if (running) return { ok: false, error: "a backup is already running" };
  const data = resolve(dataDir), out = resolve(backupDir);
  if (out === data || data.startsWith(out + sep)) return { ok: false, error: "BACKUP_DIR must not be DATA_DIR or a folder that holds it" };
  running = true;
  const name = backupName(now()), partial = join(out, name + ".partial"), final = join(out, name);
  try {
    await mkdir(out, { recursive: true });
    let archiveState = archive === "no" || archive === "off" ? "off" : "included";
    if (archiveState === "included" && archive === "auto" && await sizeOf(join(data, "archive")) > archiveMax) archiveState = "skipped";
    await rm(partial, { recursive: true, force: true });       // a leftover of a run cut short, same minute only
    const stats = { files: 0, bytes: 0 };
    const skip = (rel) => rel === ".write-test" || rel.endsWith(".tmp") || (archiveState !== "included" && rel === "archive");
    async function copyDir(from, to) {
      await mkdir(to, { recursive: true });
      for (const e of await readdir(from, { withFileTypes: true })) {
        const a = join(from, e.name), rel = relative(data, a);
        if (skip(rel) || a === out) continue;
        if (e.isDirectory()) await copyDir(a, join(to, e.name));
        else if (e.isFile()) {
          try { await copyFile(a, join(to, e.name)); stats.files++; stats.bytes += (await stat(join(to, e.name))).size; }
          catch (err) { if (err.code !== "ENOENT") throw err; }       // deleted between the listing and the copy (a table's old journal file)
        }
      }
    }
    await copyDir(data, partial);
    // A name that exists is a backup from this same second: the first is kept and this copy is dropped.
    await rename(partial, final).catch(async (err) => { if (err.code === "ENOTEMPTY" || err.code === "EEXIST") await rm(partial, { recursive: true, force: true }); else throw err; });
    const removed = [];
    const all = await listBackups(out);
    for (const old of all.slice(0, Math.max(0, all.length - Math.max(1, keep)))) { await rm(join(out, old), { recursive: true, force: true }); removed.push(old); }
    log(`backup ${name}: ${stats.files} files, ${stats.bytes} bytes, archive ${archiveState}${removed.length ? `, removed ${removed.join(", ")}` : ""}`);
    return { ok: true, name, ...stats, archive: archiveState, removed };
  } catch (err) {
    await rm(partial, { recursive: true, force: true }).catch(() => {});
    return { ok: false, error: String(err?.code ?? err?.message ?? err) };
  } finally { running = false; }
}
