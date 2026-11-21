// Container entry point. The image starts as root only so this file can hand the data folder to the
// `node` user (a volume is mounted root-owned, and files an older image wrote as root stay root-owned),
// and then it gives up root for good and runs the table server as that user.
// Started as another user already (docker run --user, Kubernetes), it changes nothing and just starts the server.
import { existsSync, lchownSync, lstatSync, readdirSync, accessSync, constants } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";

const UID = 1000, GID = 1000;                       // `node` in the official image
const DATA = process.env.DATA_DIR || "/data";
const SYSTEM = new Set(["usr", "etc", "proc", "sys", "dev", "bin", "sbin", "lib", "lib64", "boot", "root", "run", "app", "home"]);      // never handed over, whatever BACKUP_DIR says
const BACKUP = (process.env.BACKUP_DIR ?? "").trim();       // a second volume for backups arrives root-owned too (#662)

function chownTree(path) {
  const st = lstatSync(path);
  if (st.uid !== UID || st.gid !== GID) lchownSync(path, UID, GID);
  if (st.isDirectory()) for (const name of readdirSync(path)) chownTree(join(path, name));
}

if (process.getuid() === 0) {
  let ok = true;
  try { chownTree(DATA); }
  catch (err) {
    ok = false;
    console.error(`entrypoint: could not give ${DATA} to user ${UID} (${err.code ?? err.message}). Staying root so the server can still save tables. Fix the volume's ownership, then restart.`);
  }
  // The backup folder (a second disk, or a folder in the first) is handed over by its top directory only, and only for a plain absolute path of
  // at least two parts (/mnt/backups, never / or a relative path). A failure here warns and nothing more: it never keeps the server running as root.
  if (BACKUP) {
    try {
      if (!isAbsolute(BACKUP) || BACKUP !== normalize(BACKUP) || BACKUP.split("/").filter(Boolean).length < 2 || SYSTEM.has(BACKUP.split("/")[1])) console.error(`entrypoint: BACKUP_DIR ${BACKUP} is left as it is (it must be an absolute path with at least two parts, outside system folders, such as /mnt/backups).`);
      else if (existsSync(BACKUP)) { const st = lstatSync(BACKUP); if (st.isDirectory() && (st.uid !== UID || st.gid !== GID)) lchownSync(BACKUP, UID, GID); }
    } catch (err) { console.error(`entrypoint: could not give BACKUP_DIR ${BACKUP} to user ${UID} (${err.code ?? err.message}); backups may fail to write.`); }
  }
  if (ok) {
    process.setgroups([]);
    process.setgid(GID);
    process.setuid(UID);
    process.env.HOME = "/home/node";
  }
}
await import("./packages/server/src/index.js");
