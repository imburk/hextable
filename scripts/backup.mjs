// Back up the table data now (#662): node scripts/backup.mjs [--data DIR] [--to DIR] [--keep N] [--archive yes|no|auto]
// Defaults come from DATA_DIR, BACKUP_DIR, BACKUP_KEEP and BACKUP_ARCHIVE. The server runs the same code once a night when BACKUP_DIR is set;
// this is for a one-off run or for a scheduler outside the server. Exit code 0 when a backup was made.
import { fileURLToPath } from "node:url";
import { runBackup } from "../packages/server/src/backup.js";

export async function main(argv = process.argv.slice(2), env = process.env) {
  const arg = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
  const keep = Number(arg("keep") ?? env.BACKUP_KEEP);
  const r = await runBackup({
    dataDir: arg("data") ?? env.DATA_DIR ?? "data", backupDir: arg("to") ?? env.BACKUP_DIR,
    ...(Number.isInteger(keep) && keep > 0 && { keep }), archive: arg("archive") ?? env.BACKUP_ARCHIVE ?? "auto", log: (l) => console.log(l),
  });
  if (!r.ok) console.error(`Backup failed: ${r.error}${r.error?.includes("both needed") ? " (set BACKUP_DIR or pass --to)" : ""}`);
  return r.ok ? 0 : 1;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(await main());
