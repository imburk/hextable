// The action journal (#659): for each table, the accepted actions in order, so that a game can be replayed from a snapshot through
// `apply()` and a bug report reproduced (scripts/replay.mjs). Server-side I/O only: the rules package knows nothing of it.
//
//   const journal = createJournal({ dir });                  // dir: where the table saves are (DATA_DIR)
//   const ticket = journal.before(table);                    // after the server has stamped the action, before apply()
//   ...apply...
//   journal.accepted(ticket, { role, uid, action });         // only when apply() accepted it
//   journal.restored(table, "undo", { role, uid, d0, ... });  // undo, redo and rewind put whole trees back: a marker line, then a new file
//   journal.reset(table, "packs");                           // the state changed by a route that is not an action (packs, a world, a join)
//   journal.flushSync();                                     // on shutdown
//
// Files, in `dir`, beside the table's own save (`ABC123.json`):
//   ABC123.journal.000007.snapshot.json   { journal: 1, table, at, stateVersion, hash, state, packs, members: {id: name} }   the state the file begins from
//   ABC123.journal.000007.jsonl           one JSON object a line: an `open` header, then `act` lines, ended by a `restore` or `break` line if the file was closed on purpose
//
// A line holds the action as the server applied it, the sender's role and opaque member id (a random id made when they sat down: no name,
// no email, no address, never the join token), the dice counter before and after (`d0`, `d1`), the state version (`sv`), the line's number in
// the file (`n`) and a hash of the whole state after it (`h`). The one place a name could ride in is an action's `userName` (a claim, a
// spoken line, a ping); it is replaced by `{ "$member": id }` and the name is kept in the snapshot's `members`, which is a file of the
// same kind as the table save. Nothing is journalled that the action itself does not carry.
//
// A write never fails an action and never waits for the disk. Lines go to a queue that one worker writes to the file in order, and every
// error is caught, logged as one JSON line (`journal-error`, like the engine's crash log) and answered by closing that file: the next
// accepted action opens a new one, with a new snapshot, so what is written is always replayable from its own start. After a failure
// nothing is tried again for RETRY_MS, so a full disk costs one log line a minute and not a write per action. The snapshot is the one
// synchronous cost, a JSON.stringify of the state (the table's own save does the same) once per file; so is the hash of each line.
import { appendFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { appendFile, readdir, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

export const JOURNAL_VERSION = 1;
export const FILE_MAX_BYTES = 5 * 1024 * 1024;      // a journal file is closed when it passes this
export const FILES_KEPT = 5;                        // journal files kept per table (each with its snapshot)
export const RETRY_MS = 30_000;                     // after a failed write, no new file for this long
export const QUEUE_MAX_BYTES = 32 * 1024 * 1024;    // lines waiting for the disk; past this a file is given up

const FILE = /^([A-Z0-9]{6})\.journal\.(\d{6})\.(jsonl|snapshot\.json)$/;
const pad = (n) => String(n).padStart(6, "0");
export const journalName = (code, n) => `${code}.journal.${pad(n)}.jsonl`;
export const snapshotName = (code, n) => `${code}.journal.${pad(n)}.snapshot.json`;
export const hashState = (state) => createHash("sha256").update(JSON.stringify(state)).digest("hex").slice(0, 32);
// The dice counter: a keyed generator's position, or the integer a seeded one has come to.
export const diceOf = (state) => (state?.rng !== null && typeof state?.rng === "object" ? state.rng.n : state?.rng ?? null);

const noop = { before: () => null, accepted() {}, restored() {}, reset() {}, flushSync() {}, idle: async () => {} };

export function createJournal({ dir, enabled = true, fileMax = FILE_MAX_BYTES, keep = FILES_KEPT, retryMs = RETRY_MS, queueMax = QUEUE_MAX_BYTES, now = Date.now, log = (line) => console.error(line) } = {}) {
  if (!enabled || !dir) return noop;
  const open = new Map();           // table code -> { n, name, bytes, lines, failed, members }
  const next = new Map();           // table code -> the number the next file takes
  const wait = new Map();           // table code -> no new file before this time (after a failure)
  const logged = new Map();         // table code -> when an error was last logged
  let queue = [], pending = 0, running = null;

  // What the folder already holds, once: so a restart goes on from the highest number and never overwrites a file.
  try { for (const name of readdirSync(dir)) { const m = FILE.exec(name); if (m) next.set(m[1], Math.max(next.get(m[1]) ?? 1, Number(m[2]) + 1)); } } catch { /* an unreadable folder fails again, and is logged, when the first file is made */ }

  const fail = (code, op, err) => {
    const t = now();
    wait.set(code, t + retryMs);
    const f = open.get(code);
    if (f) { f.failed = true; open.delete(code); }
    if (t - (logged.get(code) ?? -Infinity) < 60_000) return;
    logged.set(code, t);
    try { log(JSON.stringify({ event: "journal-error", at: new Date(t).toISOString(), table: String(code), op, error: String(err?.code ?? err?.message ?? err).slice(0, 80) })); } catch { /* a log that fails is not a reason to fail */ }
  };

  // The worker: one write at a time, in the order the lines were made. A write for a file that has failed is dropped.
  const pump = async () => {
    while (queue.length) {
      const job = queue.shift();
      pending -= job.size;
      if (job.file.failed) continue;
      try {
        if (job.op === "snapshot") await writeFile(job.path, job.text);
        else if (job.op === "append") await appendFile(job.path, job.text);
        else if (job.op === "prune") await prune(job.code, job.n);
      } catch (err) { fail(job.code, job.op, err); }
    }
  };
  const kick = () => { running ??= pump().finally(() => { running = null; if (queue.length) kick(); }); };
  const enqueue = (job) => {
    job.size = Buffer.byteLength(job.text ?? "");
    if (pending + job.size > queueMax) { fail(job.code, "queue", new Error("too many lines waiting")); return; }
    queue.push(job); pending += job.size; kick();
  };
  const prune = async (code, n) => {
    const names = await readdir(dir);
    for (const name of names) {
      const m = FILE.exec(name);
      if (m && m[1] === code && Number(m[2]) <= n - keep) await unlink(join(dir, name)).catch(() => {});
    }
  };

  // The file for this table's next line, opened if there is none. The snapshot is the state as it is now, which is the state before
  // the action about to be applied (or just after the one before it): the file always begins from exactly where the last one ended.
  function ensure(t, why) {
    const code = t.code;
    let f = open.get(code);
    if (f && f.bytes >= fileMax) { closeFile(code, f, "size"); f = null; }
    if (f) return f;
    if (now() < (wait.get(code) ?? 0)) return null;
    const n = next.get(code) ?? 1;
    const at = new Date(now()).toISOString();
    const hash = hashState(t.state);
    const members = {};
    for (const m of t.members ?? []) if (typeof m.id === "string" && typeof m.name === "string") members[m.id] = m.name;
    const snapshot = JSON.stringify({ journal: JOURNAL_VERSION, table: code, at, stateVersion: t.state.version ?? null, hash, state: t.state, packs: t.packs ?? [], members });
    try { mkdirSync(dir, { recursive: true }); } catch { /* the write says so */ }
    f = { n, name: journalName(code, n), path: join(dir, journalName(code, n)), bytes: 0, lines: 0, failed: false, members };
    next.set(code, n + 1);
    open.set(code, f);
    enqueue({ op: "snapshot", code, file: f, path: join(dir, snapshotName(code, n)), text: snapshot });
    const header = JSON.stringify({ k: "open", v: JOURNAL_VERSION, table: code, file: n, at, sv: t.state.version ?? null, d: diceOf(t.state), h: hash, snapshot: snapshotName(code, n), ...(why && { why }) }) + "\n";
    write(code, f, header);
    enqueue({ op: "prune", code, file: f, n, text: "" });
    return f;
  }
  const write = (code, f, line) => { f.bytes += line.length; enqueue({ op: "append", code, file: f, path: f.path, text: line }); };
  const closeFile = (code, f, why, line) => {
    if (line) write(code, f, line);
    if (open.get(code) === f) open.delete(code);
    if (why && !line) lastWhy.set(code, why);
  };
  const lastWhy = new Map();

  const guard = (fn, code) => { try { return fn(); } catch (err) { try { fail(code, "journal", err); } catch { /* nothing may escape */ } return null; } };

  // A name may not ride in a line: an action's `userName` becomes a reference to the member whose name it is, which the snapshot holds.
  const scrub = (t, action) => {
    if (!action || typeof action !== "object" || !Object.hasOwn(action, "userName")) return { action };
    const name = action.userName;
    const copy = { ...action };
    const id = typeof name === "string" ? (t.members ?? []).find((m) => m.name === name)?.id : undefined;
    if (id !== undefined) { copy.userName = { $member: id }; return { action: copy }; }
    delete copy.userName;
    return { action: copy, lossy: ["userName"] };
  };

  return {
    // Open the file if need be and note the dice before the action. Null when there is no journal to write to: the action goes on all the same.
    before(t) {
      return guard(() => {
        if (!t?.state || typeof t.state !== "object") return null;
        const f = ensure(t, lastWhy.get(t.code));
        lastWhy.delete(t.code);
        return f ? { t, f, d0: diceOf(t.state) } : null;
      }, t?.code);
    },
    accepted(ticket, { role, uid, action }) {
      if (!ticket) return;
      guard(() => {
        const { t, f } = ticket;
        if (f.failed || open.get(t.code) !== f) return;        // the file was closed or failed in between: no line is better than a line out of order
        const s = scrub(t, action);
        const line = JSON.stringify({ k: "act", n: ++f.lines, at: new Date(now()).toISOString(), role, uid, action: s.action, ...(s.lossy && { lossy: s.lossy }), d0: ticket.d0, d1: diceOf(t.state), sv: t.state.version ?? null, h: hashState(t.state) }) + "\n";
        write(t.code, f, line);
      }, ticket?.t?.code);
    },
    // Undo, redo and rewind put an earlier tree back; they are not actions the engine can run again. A line says which and where the dice
    // stand, and the file is closed: the next action opens a new one whose snapshot is the state they restored.
    restored(ticket, kind, { role, uid, ...rest } = {}) {
      if (!ticket) return;
      guard(() => {
        const { t, f } = ticket;
        if (f.failed || open.get(t.code) !== f) return;
        const line = JSON.stringify({ k: kind, n: ++f.lines, at: new Date(now()).toISOString(), role, uid, ...rest, d0: ticket.d0, d1: diceOf(t.state), sv: t.state.version ?? null, h: hashState(t.state) }) + "\n";
        closeFile(t.code, f, null, line);
        lastWhy.set(t.code, kind);
      }, ticket?.t?.code);
    },
    // The table's state changed by something that is not an action (a pack or a world was loaded, someone sat down): the file is closed.
    reset(t, why) {
      guard(() => {
        const f = open.get(t.code);
        if (f) closeFile(t.code, f, why, JSON.stringify({ k: "break", n: ++f.lines, at: new Date(now()).toISOString(), why }) + "\n");
        lastWhy.set(t.code, why);
      }, t?.code);
    },
    // At shutdown: what is still waiting is written now, in order. The write in flight (if any) is on its own.
    flushSync() {
      const jobs = queue; queue = []; pending = 0;
      const dead = new Set();
      for (const job of jobs) {
        if (job.file.failed || dead.has(job.file)) continue;
        try {
          if (job.op === "snapshot") writeFileSync(job.path, job.text);
          else if (job.op === "append") appendFileSync(job.path, job.text);
        } catch (err) { dead.add(job.file); try { log(JSON.stringify({ event: "journal-error", table: job.code, op: job.op, error: String(err?.code ?? err?.message).slice(0, 80) })); } catch { /* going down anyway */ } }
      }
    },
    // Resolves when the queue has been written (tests, and anything that wants to read the files back).
    async idle() { while (running || queue.length) { kick(); await running; } },
  };
}

// Settings from the environment (index.js): JOURNAL=off turns it off; JOURNAL_FILE_BYTES and JOURNAL_FILES change the cap and the count.
export function journalFromEnv(env = process.env) {
  const whole = (v) => (/^\d+$/.test(v ?? "") && Number(v) > 0 ? Number(v) : undefined);
  return { enabled: !/^(off|0|false|no)$/i.test(env.JOURNAL ?? ""), ...(whole(env.JOURNAL_FILE_BYTES) && { fileMax: whole(env.JOURNAL_FILE_BYTES) }), ...(whole(env.JOURNAL_FILES) && { keep: whole(env.JOURNAL_FILES) }) };
}
