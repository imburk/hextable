// Container entry point. The image starts as root only so this file can hand the data folder to the
// `node` user (a volume is mounted root-owned, and files an older image wrote as root stay root-owned),
// and then it gives up root for good and runs the table server as that user.
// Started as another user already (docker run --user, Kubernetes), it changes nothing and just starts the server.
import { lchownSync, lstatSync, readdirSync, accessSync, constants } from "node:fs";
import { join } from "node:path";

const UID = 1000, GID = 1000;                       // `node` in the official image
const DATA = process.env.DATA_DIR || "/data";

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
  if (ok) {
    process.setgroups([]);
    process.setgid(GID);
    process.setuid(UID);
    process.env.HOME = "/home/node";
  }
}
await import("./packages/server/src/index.js");
