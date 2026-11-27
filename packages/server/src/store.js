// Where a table lives on disk, and how it is moved to the archive and back (#662). File system only: no tables, no network.
//
//   const store = createStore({ dir });          // dir: DATA_DIR
//   store.list()          -> [{ code, active }]   every saved table, from the file's own timestamp: nothing is read or parsed
//   store.read(code)      -> the parsed save, or null (unreadable: logged)
//   store.archived()      -> Set of codes whose save is in DATA_DIR/archive/<code>/
//   store.archive(code)   -> true when the table's save, undo history, journals and files are now under archive/<code>/
//   store.restore(code)   -> true when they are back where they were
//   store.repair()        -> finishes what a crash left half done (see below)
//
// Nothing here deletes a file. A move is a rename inside DATA_DIR (one volume, so it is atomic for each file), the save itself is moved
// last when archiving and last when restoring, so that at every moment the table is wholly where its save is or the save is still
// where it was and the rest can be moved back. Where a name is already taken at the other end the file is left in place, never overwritten.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, statSync } from "node:fs";
import { join } from "node:path";

export const ARCHIVE_DIR = "archive";
const CODE = /^[A-Z0-9]{6}$/;
const SAVE = /^([A-Z0-9]{6})\.json$/;

export function createStore({ dir, log = (line) => console.error(line) }) {
  const root = join(dir, ARCHIVE_DIR);
  const save = (code) => join(dir, `${code}.json`);
  const kept = (code) => join(root, code);
  const say = (code, op, err) => { try { log(JSON.stringify({ event: "store-error", table: code, op, error: String(err?.code ?? err?.message ?? err).slice(0, 80) })); } catch { /* a log that fails is no reason to fail */ } };

  // Move what is in `from` into `to`, merging folders; a name that is already there is left behind. Returns how many were left.
  function moveTree(from, to) {
    mkdirSync(to, { recursive: true });
    let left = 0;
    for (const name of readdirSync(from)) {
      const a = join(from, name), b = join(to, name);
      if (!existsSync(b)) { renameSync(a, b); continue; }
      if (statSync(a).isDirectory() && statSync(b).isDirectory()) { left += moveTree(a, b); try { rmdirSync(a); } catch { /* not empty: something was left */ } continue; }
      left++;
    }
    return left;
  }
  const tryRmdir = (p) => { try { rmdirSync(p); } catch { /* not empty, or gone */ } };

  // One direction of the move. `toArchive` false is a restore. The save goes last.
  function relocate(code, toArchive) {
    const [src, dst] = toArchive ? [dir, kept(code)] : [kept(code), dir];
    const srcAssets = toArchive ? join(dir, "assets", code) : join(kept(code), "assets");
    const dstAssets = toArchive ? join(kept(code), "assets") : join(dir, "assets", code);
    mkdirSync(dst, { recursive: true });
    for (const name of readdirSync(src)) {
      if (!name.startsWith(`${code}.`) || name === `${code}.json`) continue;
      if (!existsSync(join(dst, name))) renameSync(join(src, name), join(dst, name));
    }
    if (existsSync(srcAssets)) { moveTree(srcAssets, dstAssets); tryRmdir(srcAssets); }
    if (existsSync(join(src, `${code}.json`)) && !existsSync(join(dst, `${code}.json`))) renameSync(join(src, `${code}.json`), join(dst, `${code}.json`));
  }

  return {
    list() {
      const out = [];
      let names = [];
      try { names = readdirSync(dir); } catch (err) { say("-", "list", err); }
      for (const name of names) {
        const m = SAVE.exec(name);
        if (!m) continue;
        try { out.push({ code: m[1], active: statSync(join(dir, name)).mtimeMs }); } catch { /* gone between the two calls */ }
      }
      return out;
    },
    read(code) {
      if (!CODE.test(code)) return null;
      try { return JSON.parse(readFileSync(save(code), "utf8")); }
      catch (err) { console.error(`Skipping unreadable table file ${code}.json: ${err.message}`); return null; }
    },
    archived() {
      const out = new Set();
      let names = [];
      try { names = readdirSync(root); } catch { return out; }
      for (const name of names) if (CODE.test(name) && existsSync(join(kept(name), `${name}.json`))) out.add(name);
      return out;
    },
    archive(code) {
      if (!CODE.test(code) || !existsSync(save(code))) return false;
      try { relocate(code, true); return !existsSync(save(code)); }
      catch (err) {
        say(code, "archive", err);
        try { relocate(code, false); } catch (e) { say(code, "archive-undo", e); }       // put back what moved: the table stays where it was
        return false;
      }
    },
    restore(code) {
      if (!CODE.test(code) || !existsSync(join(kept(code), `${code}.json`))) return false;
      try { relocate(code, false); tryRmdir(kept(code)); return existsSync(save(code)); }
      catch (err) { say(code, "restore", err); return false; }
    },
    // At start. A table with a save in DATA_DIR and a folder in archive/ is one whose archiving was cut short (the save moves last):
    // what had moved is moved back, and it is a live table again. A save in archive/ is left as it is: even if some of its files are
    // already back in DATA_DIR (a cut-short restore), they are still its own and the next restore finishes the move.
    repair() {
      let names = [];
      try { names = readdirSync(root); } catch { return []; }
      const fixed = [];
      for (const code of names) {
        if (!CODE.test(code) || !existsSync(save(code))) continue;
        try { relocate(code, false); tryRmdir(kept(code)); fixed.push(code); } catch (err) { say(code, "repair", err); }
      }
      return fixed;
    },
  };
}
