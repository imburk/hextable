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
import { statfsSync } from "node:fs";
import { copyFile, mkdir, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

export const BACKUP_PREFIX = "hextable-backup-";
export const BACKUP_KEEP = 7;
export const ARCHIVE_MAX_BYTES = 500 * 1024 * 1024;     // `archive: "auto"` leaves archive/ out of a backup when it is bigger than this
let running = false;
const PARTIAL = /^hextable-backup-\d{8}-\d{6}\.partial$/;
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
// The real path of a folder that may not exist yet: the nearest ancestor that exists, resolved (so a symlink is seen through), and the rest appended.
export async function realish(p) {
  let cur = resolve(p), rest = [];
  for (;;) {
    try { return join(await realpath(cur), ...rest.reverse()); }
    catch { const up = dirname(cur); if (up === cur) return resolve(p); rest.push(basename(cur)); cur = up; }
  }
}
// Whether a backup is running now: the server does not move tables to or from the archive meanwhile.
export const backupRunning = () => running;
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

export async function runBackup({ dataDir, backupDir, keep = BACKUP_KEEP, archive = "auto", archiveMax = ARCHIVE_MAX_BYTES, now = () => new Date(), log = () => {} } = {}) {
  if (!dataDir || !backupDir) return { ok: false, error: "dataDir and backupDir are both needed" };
  if (running) return { ok: false, busy: true, error: "a backup is already running" };
  running = true;
  let partial = null;
  try {
    // Real paths, so a symlink cannot hide that the backup folder is the data folder, holds it, or sits inside it.
    const data = await realish(dataDir), out = await realish(backupDir);
    const dataStat = await stat(data).catch(() => null);
    if (!dataStat?.isDirectory()) return { ok: false, error: `${dataDir} is missing: nothing to back up` };
    if (out === data || data.startsWith(out + sep)) return { ok: false, error: "BACKUP_DIR must not be DATA_DIR or a folder that holds it" };
    if ((await readdir(data)).filter((n) => n !== ".write-test").length === 0) return { ok: false, error: `${dataDir} is empty: nothing to back up` };
    const name = backupName(now()), final = join(out, name);
    partial = join(out, name + ".partial");
    let archiveState = archive === "no" || archive === "off" ? "off" : "included";
    const archiveBytes = await sizeOf(join(data, "archive"));
    if (archiveState === "included" && archive === "auto" && archiveBytes > archiveMax) archiveState = "skipped";
    // Room first: a backup that fills the disk would stop the tables from being saved. Needs the size of what is copied and a fifth more.
    const need = Math.ceil(((await sizeOf(data)) - (archiveState === "included" ? 0 : archiveBytes)) * 1.2);
    await mkdir(out, { recursive: true });
    let free = Infinity;
    try { const f = statfsSync(out); free = Number(f.bavail) * Number(f.bsize); } catch { /* unknown: go on */ }
    if (free < need) return { ok: false, error: `not enough free space in ${backupDir} (${free} bytes free, ${need} needed)` };
    for (const n of await readdir(out)) {          // a .partial left by a run that was cut short (an hour old, so never one being written now)
      if (PARTIAL.test(n) && Date.now() - (await stat(join(out, n)).catch(() => ({ mtimeMs: Date.now() }))).mtimeMs > 3600_000) await rm(join(out, n), { recursive: true, force: true });
    }
    await rm(partial, { recursive: true, force: true });       // same name: a leftover of this very minute's earlier run
    const stats = { files: 0, bytes: 0 };
    const skip = (rel) => rel === ".write-test" || rel.endsWith(".tmp") || (archiveState !== "included" && rel === "archive");
    async function copyDir(from, to) {
      let entries;
      try { entries = await readdir(from, { withFileTypes: true }); } catch (err) { if (err.code === "ENOENT") return; throw err; }     // a table folder moved away meanwhile
      await mkdir(to, { recursive: true });
      for (const e of entries) {
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
    partial = null;
    // Rotation: only after a whole new backup, only our folders, and never so far that fewer than `keep` non-empty backups remain.
    const removed = [], all = await listBackups(out), n = Math.max(1, keep);
    const filled = new Set();
    for (const b of all) if ((await sizeOf(join(out, b))) > 0) filled.add(b);
    for (const old of all.slice(0, Math.max(0, all.length - n))) {
      if (filled.has(old) && filled.size - 1 < n) continue;
      await rm(join(out, old), { recursive: true, force: true }); filled.delete(old); removed.push(old);
    }
    log(`backup ${name}: ${stats.files} files, ${stats.bytes} bytes, archive ${archiveState}${removed.length ? `, removed ${removed.join(", ")}` : ""}`);
    return { ok: true, name, ...stats, archive: archiveState, removed };
  } catch (err) {
    if (partial) await rm(partial, { recursive: true, force: true }).catch(() => {});
    return { ok: false, error: String(err?.code ?? err?.message ?? err) };
  } finally { running = false; }
}
