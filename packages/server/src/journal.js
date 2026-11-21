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
// the file (`n`) and a hash of the state after it (`h`: everything but the timeline in full, and of the timeline its length and first and last entry). The one place a name could ride in is an action's `userName` (a claim, a
// spoken line, a ping); it is replaced by `{ "$member": id }` and the name is kept in the snapshot's `members`, which is a file of the
// same kind as the table save. Nothing is journalled that the action itself does not carry.
//
// A write never fails an action and never waits for the disk. Lines go to a queue that one worker writes to the file in order, and every
// error is caught, logged as one JSON line (`journal-error`, like the engine's crash log) and answered by closing that file: the next
// accepted action opens a new one, with a new snapshot, so what is written is always replayable from its own start. After a failure
// nothing is tried again for RETRY_MS, so a full disk costs one log line a minute and not a write per action. The snapshot is the one
// synchronous cost, a JSON.stringify of the state (the table's own save does the same) once per file; the hash of each line is the other.
import { appendFileSync, mkdirSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { appendFile, rename, unlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

export const JOURNAL_VERSION = 1;
export const FILE_MAX_BYTES = 5 * 1024 * 1024;      // a journal file is closed when it passes this
export const FILES_KEPT = 5;                        // journal files kept per table (each with its snapshot)
export const RETRY_MS = 30_000;                     // after a failed write, no new file for this long
export const TOTAL_MAX_BYTES = 500 * 1024 * 1024; // all journals on the server, snapshots included; the oldest closed files go first
export const QUEUE_MAX_BYTES = 32 * 1024 * 1024;    // lines waiting for the disk; past this a file is given up

const FILE = /^([A-Z0-9]{6})\.journal\.(\d{6})\.(jsonl|snapshot\.json|snapshot\.json\.tmp)$/;
const pad = (n) => String(n).padStart(6, "0");
export const journalName = (code, n) => `${code}.journal.${pad(n)}.jsonl`;
export const snapshotName = (code, n) => `${code}.journal.${pad(n)}.snapshot.json`;
// A hash of the state that does not cost the whole timeline on every action: everything but the timeline in full, and of the timeline its
// length, its first entry and its last HASHED_TAIL entries (it only grows at the end and is cut at the front, so the cap and what an action
// just added show). The limit: an entry in the middle, older than the last 20, that changed without the length or the first entry changing
// would not be seen by the hash; the engine only appends to the timeline, so that would be a bug elsewhere.
const HASHED_TAIL = 20;
const sha = (text) => createHash("sha256").update(text).digest("hex");
export function hashState(state) {
  const tl = Array.isArray(state?.timeline) ? state.timeline : null;
  const rest = sha(JSON.stringify(tl ? { ...state, timeline: null } : state));
  return sha(rest + (tl ? `|${tl.length}|${tl.length ? sha(JSON.stringify(tl[0])) + sha(JSON.stringify(tl.slice(-HASHED_TAIL))) : ""}` : "")).slice(0, 32);
}
// The dice counter: a keyed generator's position, or the integer a seeded one has come to.
export const diceOf = (state) => (state?.rng !== null && typeof state?.rng === "object" ? state.rng.n : state?.rng ?? null);

const noop = { setCap() {}, before: () => null, accepted() {}, restored() {}, reset() {}, sweep() {}, close() {}, forget() {}, adopt() {}, flushSync() {}, idle: async () => {} };

export function createJournal({ dir, enabled = true, fileMax = FILE_MAX_BYTES, keep = FILES_KEPT, retryMs = RETRY_MS, queueMax = QUEUE_MAX_BYTES, totalMax = TOTAL_MAX_BYTES, now = Date.now, log = (line) => console.error(line) } = {}) {
  if (!enabled || !dir) return noop;
  const open = new Map();           // table code -> { n, path, bytes, lines, failed, cap }: the file being written
  const wait = new Map();           // table code -> no new file before this time (after a failure)
  const logged = new Map();         // table code -> when an error was last logged
  const lastWhy = new Map();        // table code -> why the next file is a new one (undo, packs, lost, ...), for its header
  const pairs = new Map();          // "CODE n" -> { code, n, bytes, t, live }: every file pair on disk (snapshot and lines), for the caps
  const next = new Map();           // table code -> the number the next file takes
  let timelineCap = null;           // the table's timeline cap: createTables owns it and hands it over (setCap)
  let total = 0, queue = [], pending = 0, running = null, inflight = null;

  // What the folder already holds: so a restart goes on from the highest number, never overwrites a file, and knows what the caps count.
  // `only` limits it to one table (a table restored from the archive, #662).
  const scan = (only) => {
    try {
      for (const name of readdirSync(dir)) {
        const m = FILE.exec(name);
        if (!m || (only && m[1] !== only)) continue;
        const code = m[1], n = Number(m[2]);
        next.set(code, Math.max(next.get(code) ?? 1, n + 1));
        let st; try { st = statSync(join(dir, name)); } catch { continue; }
        const e = pairs.get(`${code} ${n}`) ?? { code, n, bytes: 0, t: 0, live: false };
        e.bytes += st.size; e.t = Math.max(e.t, st.mtimeMs); total += st.size;
        pairs.set(`${code} ${n}`, e);
      }
    } catch { /* an unreadable folder fails again, and is logged, when the first file is made */ }
  };
  scan();

  const fail = (code, op, err) => {
    const t = now();
    wait.set(code, t + retryMs);
    lastWhy.set(code, "lost");            // lines may be missing: the next file's header says so
    const f = open.get(code);
    if (f) { f.failed = true; open.delete(code); const e = pairs.get(`${code} ${f.n}`); if (e) e.live = false; }
    if (t - (logged.get(code) ?? -Infinity) < 60_000) return;
    logged.set(code, t);
    try { log(JSON.stringify({ event: "journal-error", at: new Date(t).toISOString(), table: String(code), op, error: String(err?.code ?? err?.message ?? err).slice(0, 80) })); } catch { /* a log that fails is not a reason to fail */ }
  };
  const gone = { failed: false };

  // The worker: one write at a time, in the order the lines were made. A write for a file that has failed is dropped.
  const run = async (job) => {
    if (job.op === "snapshot") { await writeFile(job.path + ".tmp", job.text); await rename(job.path + ".tmp", job.path); }
    else if (job.op === "append") await appendFile(job.path, job.text);
    else if (job.op === "unlink") await unlink(job.path).catch(() => {});
  };
  const pump = async () => {
    while (queue.length) {
      const job = queue.shift();
      pending -= job.size;
      if (job.file.failed) continue;
      inflight = job;
      try { await run(job); } catch (err) { fail(job.code, job.op, err); }
      inflight = null;
    }
  };
  const kick = () => { running ??= pump().finally(() => { running = null; if (queue.length) kick(); }); };
  const enqueue = (job) => {
    job.size = Buffer.byteLength(job.text ?? "");
    if (job.op !== "unlink" && pending + job.size > queueMax) { fail(job.code, "queue", new Error("too many lines waiting")); return false; }
    queue.push(job); pending += job.size; kick();
    return true;
  };

  // Which files go: a table keeps its last `keep`; and over the server's total the oldest closed files of any table go.
  const drop = (e) => {
    pairs.delete(`${e.code} ${e.n}`); total -= e.bytes;
    for (const path of [join(dir, journalName(e.code, e.n)), join(dir, snapshotName(e.code, e.n)), join(dir, snapshotName(e.code, e.n) + ".tmp")]) enqueue({ op: "unlink", code: e.code, file: gone, path, text: "" });
  };
  const prune = (code, n) => {
    for (const e of [...pairs.values()]) if (e.code === code && !e.live && e.n <= n - keep) drop(e);
    if (total > totalMax) for (const e of [...pairs.values()].filter((x) => !x.live).sort((a, b) => a.t - b.t)) { if (total <= totalMax) break; drop(e); }
  };

  // The file for this table's next line, opened if there is none. The snapshot is the state as it is now, which is the state before
  // the action about to be applied (or just after the one before it): the file always begins from exactly where the last one ended.
  function ensure(t) {
    const code = t.code;
    let f = open.get(code);
    if (f && f.bytes >= f.max) { closeFile(code, f); f = null; }
    if (f) return f;
    if (now() < (wait.get(code) ?? 0)) return null;
    const n = next.get(code) ?? 1;
    const at = new Date(now()).toISOString();
    const hash = hashState(t.state);
    const members = {};
    for (const m of t.members ?? []) if (typeof m.id === "string" && typeof m.name === "string") members[m.id] = m.name;
    const snapshot = JSON.stringify({ journal: JOURNAL_VERSION, table: code, at, stateVersion: t.state.version ?? null, hash, state: t.state, packs: t.packs ?? [], members });
    const sbytes = Buffer.byteLength(snapshot);
    try { mkdirSync(dir, { recursive: true }); } catch { /* the write says so */ }
    // The snapshot counts against the file's cap, but a state bigger than half the cap gets room for its lines too (else every line would be a new file).
    f = { n, path: join(dir, journalName(code, n)), bytes: sbytes, max: Math.max(fileMax, 2 * sbytes), lines: 0, failed: false };
    const why = lastWhy.get(code); lastWhy.delete(code);
    next.set(code, n + 1);
    open.set(code, f);
    const e = { code, n, bytes: sbytes, t: now(), live: true };
    pairs.set(`${code} ${n}`, e); total += sbytes;
    if (!enqueue({ op: "snapshot", code, file: f, path: join(dir, snapshotName(code, n)), text: snapshot })) return null;
    write(code, f, JSON.stringify({ k: "open", v: JOURNAL_VERSION, table: code, file: n, at, sv: t.state.version ?? null, d: diceOf(t.state), h: hash, ...(timelineCap !== null && { cap: timelineCap }), snapshot: snapshotName(code, n), ...(why && { why }) }) + "\n");
    prune(code, n);
    return f;
  }
  const write = (code, f, line) => {
    const size = Buffer.byteLength(line);
    f.bytes += size;
    const e = pairs.get(`${code} ${f.n}`);
    if (e) { e.bytes += size; e.t = now(); total += size; }
    enqueue({ op: "append", code, file: f, path: f.path, text: line });
  };
  const closeFile = (code, f, line) => {
    if (line) write(code, f, line);
    if (open.get(code) === f) open.delete(code);
    const e = pairs.get(`${code} ${f.n}`); if (e) e.live = false;
  };

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
    // The timeline cap createTables applies after each undoable action; every header records it, whichever path opens the file, so that a
    // replay trims the timeline as the server does. One source of truth: the journal does not know the rules package.
    setCap(cap) { if (Number.isInteger(cap) && cap >= 0) timelineCap = cap; },
    // Open the file if need be and note the dice before the action. Null when there is no journal to write to: the action goes on all the same.
    before(t) {
      return guard(() => {
        if (!t?.state || typeof t.state !== "object") return null;
        const f = ensure(t);
        return f ? { t, f, d0: diceOf(t.state) } : null;
      }, t?.code);
    },
    // Call after the server has capped the timeline: the hash is of the state the table now holds.
    accepted(ticket, { role, uid, action }) {
      if (!ticket) return;
      guard(() => {
        const { t, f } = ticket;
        if (f.failed || open.get(t.code) !== f) return;        // the file was closed or failed in between: no line is better than a line out of order
        const s = scrub(t, action);
        write(t.code, f, JSON.stringify({ k: "act", n: ++f.lines, at: new Date(now()).toISOString(), role, uid, action: s.action, ...(s.lossy && { lossy: s.lossy }), d0: ticket.d0, d1: diceOf(t.state), sv: t.state.version ?? null, h: hashState(t.state) }) + "\n");
      }, ticket?.t?.code);
    },
    // Undo, redo and rewind put an earlier tree back; they are not actions the engine can run again. A line says which and where the dice
    // stand, and the file is closed: the next action opens a new one whose snapshot is the state they restored.
    restored(ticket, kind, { role, uid, ...rest } = {}) {
      if (!ticket) return;
      guard(() => {
        const { t, f } = ticket;
        if (f.failed || open.get(t.code) !== f) return;
        closeFile(t.code, f, JSON.stringify({ k: kind, n: ++f.lines, at: new Date(now()).toISOString(), role, uid, ...rest, d0: ticket.d0, d1: diceOf(t.state), sv: t.state.version ?? null, h: hashState(t.state) }) + "\n");
        if (!lastWhy.has(t.code)) lastWhy.set(t.code, kind);
      }, ticket?.t?.code);
    },
    // The table's state changed by something that is not an action (a pack or a world was loaded, someone was let in): the file is closed.
    reset(t, why) {
      guard(() => {
        const f = open.get(t.code);
        if (f) closeFile(t.code, f, JSON.stringify({ k: "break", n: ++f.lines, at: new Date(now()).toISOString(), why }) + "\n");
        if (!lastWhy.has(t.code)) lastWhy.set(t.code, why);
      }, t?.code);
    },
    // The table is leaving memory (#662): its file is ended with a line saying why, nothing more is appended, and the next action after
    // it is loaded again opens a new file from its own snapshot. What is queued is still written, in order.
    close(code, why = "evict") {
      guard(() => {
        const f = open.get(code);
        if (f) closeFile(code, f, JSON.stringify({ k: "break", n: ++f.lines, at: new Date(now()).toISOString(), why }) + "\n");
        if (!lastWhy.has(code)) lastWhy.set(code, why);
      }, code);
    },
    // The table's files were moved to the archive: they no longer count against the caps. `adopt` counts them again when they are back.
    forget(code) { for (const [k, e] of [...pairs]) if (e.code === code) { pairs.delete(k); total -= e.bytes; } },
    adopt(code) { scan(code); },
    // At start: the journals of tables whose save no longer exists are removed (`has(code)` says whether a table is there).
    sweep(has) {
      try {
        for (const name of readdirSync(dir)) {
          const m = /^([A-Z0-9]{6})\.journal\./.exec(name);
          if (!m || has(m[1])) continue;
          try { unlinkSync(join(dir, name)); } catch { continue; }
          const k = FILE.exec(name);
          if (k) { const e = pairs.get(`${k[1]} ${Number(k[2])}`); if (e) { pairs.delete(`${k[1]} ${Number(k[2])}`); total -= e.bytes; } }
        }
      } catch (err) { try { log(JSON.stringify({ event: "journal-error", op: "sweep", error: String(err?.code ?? err?.message).slice(0, 80) })); } catch { /* ignore */ } }
    },
    // At shutdown: the write in flight is done again first (a snapshot is replaced whole; a line that did land is a repeat of the same `n`,
    // which replay skips), then what is still waiting, in order.
    flushSync() {
      const jobs = inflight ? [inflight, ...queue] : queue;
      queue = []; pending = 0; inflight = null;
      const dead = new Set();
      for (const job of jobs) {
        if (job.file.failed || dead.has(job.file)) continue;
        try {
          if (job.op === "snapshot") { writeFileSync(job.path + ".tmp", job.text); renameSync(job.path + ".tmp", job.path); }
          else if (job.op === "append") appendFileSync(job.path, job.text);
          else if (job.op === "unlink") { try { unlinkSync(job.path); } catch { /* already gone */ } }
        } catch (err) { dead.add(job.file); try { log(JSON.stringify({ event: "journal-error", table: job.code, op: job.op, error: String(err?.code ?? err?.message).slice(0, 80) })); } catch { /* going down anyway */ } }
      }
    },
    // Resolves when the queue has been written (tests, and anything that wants to read the files back).
    async idle() { while (running || queue.length) { kick(); await running; } },
    // What the caps count now (tests and the log).
    usage: () => ({ bytes: total, files: pairs.size }),
  };
}

// Settings from the environment (index.js): JOURNAL=off turns it off; JOURNAL_FILE_BYTES, JOURNAL_FILES and JOURNAL_TOTAL_BYTES change the caps.
export function journalFromEnv(env = process.env) {
  const whole = (v) => (/^\d+$/.test(v ?? "") && Number(v) > 0 ? Number(v) : undefined);
  return { enabled: !/^(off|0|false|no)$/i.test(env.JOURNAL ?? ""), ...(whole(env.JOURNAL_FILE_BYTES) && { fileMax: whole(env.JOURNAL_FILE_BYTES) }), ...(whole(env.JOURNAL_FILES) && { keep: whole(env.JOURNAL_FILES) }), ...(whole(env.JOURNAL_TOTAL_BYTES) && { totalMax: whole(env.JOURNAL_TOTAL_BYTES) }) };
}
