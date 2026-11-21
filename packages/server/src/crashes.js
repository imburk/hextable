// Crash reports we can act on (#689): a repro bundle for each engine crash, error reports from the browser, and a GitHub issue for each new
// kind of crash. Server-side I/O only: the rules package knows nothing of it.
//
//   const crashes = createCrashes({ dir, env, build: () => "c1d5069" });   // dir: DATA_DIR
//   crashes.engineCrash({ table, role, uid, action, err, journal })        // tables.js, where it logs `engine-crash`; returns the bundle's file name
//   crashes.clientError(report, { conn, table })                           // a browser's report (socket): "ok" | "invalid" | "throttled"
//   crashes.handleHttp(req, res, { addr })                                 // POST /client-error, for a solo game with no socket
//   crashes.stats()                                                        // { clientErrors, clientErrorsByType }, for /api/health
//
// 1. THE BUNDLE. DATA_DIR/crashes/<time>-<table code>.json: the action as the server applied it (text a player typed over 200 characters
//    is cut and the path of each cut is listed; a name an action carries is a member id, as in the journal), the sender's role and member
//    id, the state version and the state's hash, where the table's journal stood (its file, its snapshot and the number of its last line:
//    the state between actions is the state after that line, and a crashed action is never journalled), and the stack. With the journal
//    files, `node scripts/replay.mjs --crash <bundle>` replays to that point and runs the action to see if it still throws. A bundle is
//    private like the table's own save: it lives in the data folder, which is not the folder the server serves (index.js serves dist/ only)
//    and no route reads it. The last KEEP are kept; a crash that repeats is written at most 5 times an hour (200 in all) and counted.
// 2. THE ISSUE. When FEEDBACK_GITHUB_REPO and FEEDBACK_GITHUB_TOKEN are set (the feedback settings), the first time a kind of crash
//    (action type + top stack frame) is seen an issue labelled `crash` is filed: the action type, build, error class, stack frames
//    and the bundle's time. Never player text, a table code, a name or a member id: the error's message is left out unless it is one of a
//    few fixed shapes with their values taken out (`publicMessage`), the action type is left out unless the engine knows it, and the
//    stack is inside a fence no text can close. Later repeats add a count comment at most once an hour. At most 10 issues a day. The
//    kinds seen and their issues are kept in DATA_DIR/crash-issues.json so a restart does not file them again. With no token nothing is filed
//    and the log says so once.
// 3. CLIENT ERRORS. The browser sends { v, kind, message, stack, build, mode, screen, actions } (already scrubbed of names there) when the
//    page raises an error or an unhandled rejection: at most 5 a minute for a connection and 50 a day for a table, each checked against
//    an allow-list, logged as one `client-error` line and counted by kind. Nothing about one is sent to any table or to GitHub.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ACTION_TYPES } from "../../rules/src/engine.js";
import { hashState } from "./journal.js";
import { fence, int, list, oneOf, shape, str } from "./feedback.js";

export const KEEP = 100;                       // bundles kept
export const BUNDLE_MAX = 128 * 1024;          // one bundle's size
export const TEXT_MAX = 200;                   // player-typed text in an action is cut to this
export const BUNDLES_PER_KIND_HOUR = 5;        // bundles for one kind of crash (action type + top frame) in an hour
export const BUNDLES_HOUR = 200;               // bundles in all in an hour
export const ISSUES_DAY = 10;                  // crash issues filed in a UTC day
export const COMMENT_GAP_MS = 3_600_000;       // a count comment on an issue at most this often
export const CLIENT_PER_MINUTE = 5;            // browser reports a connection may send in a minute
export const CLIENT_PER_TABLE_DAY = 50;        // and a table in a UTC day
export const CLIENT_BODY_MAX = 8 * 1024;       // POST /client-error
const KINDS_KEPT = 500;                        // kinds of crash remembered with their issue

// ---------- the bundle ----------
// A copy of the action that holds no more than a bundle should: strings cut to TEXT_MAX, long lists and objects cut, nesting limited. `cut` lists
// where something was cut ("action.note"), so that a replay that does not crash is explained by it. A name the action carries (`userName`: a
// claim, a spoken line, a ping) is the member's id, as in the journal; a name that is no member's is dropped and listed.
export function scrubAction(action, members = []) {
  const cut = [];
  let nodes = 0;
  const walk = (v, path, depth) => {
    if (++nodes > 5000) { if (!cut.includes("(rest)")) cut.push("(rest)"); return null; }
    if (typeof v === "string") { if (v.length > TEXT_MAX) { cut.push(path); return v.slice(0, TEXT_MAX); } return v; }
    if (v === null || typeof v !== "object") return typeof v === "function" || typeof v === "symbol" || typeof v === "bigint" ? null : v;
    if (depth >= 12) { cut.push(path); return null; }
    if (Array.isArray(v)) {
      if (v.length > 200) cut.push(path);
      return v.slice(0, 200).map((x, i) => walk(x, `${path}[${i}]`, depth + 1));
    }
    const out = {};
    const keys = Object.keys(v);
    if (keys.length > 100) cut.push(path);
    for (const k of keys.slice(0, 100)) out[k] = walk(v[k], `${path}.${k}`, depth + 1);
    return out;
  };
  const copy = action && typeof action === "object" ? { ...action } : {};
  let name;
  if (Object.hasOwn(copy, "userName")) {
    name = copy.userName; delete copy.userName;
  }
  const out = walk(copy, "action", 0);
  if (name !== undefined) {
    const id = typeof name === "string" ? members.find((m) => m.name === name)?.id : undefined;
    if (id !== undefined) out.userName = { $member: id }; else cut.push("action.userName");
  }
  return { action: out, cut };
}

// ---------- stacks ----------
const FRAME = /^\s*at (?:(.*?) \()?(.*?):(\d+):(\d+)\)?\s*$/;
const shortPath = (f) => {
  const p = String(f).replace(/^file:\/\//, "").replace(/\\/g, "/");
  const i = p.lastIndexOf("/packages/");
  if (i >= 0) return p.slice(i + 1);
  return p.split("/").slice(-2).join("/");
};
// [{ fn, file, line }]: the frames of a stack, with paths cut to `packages/...` and no columns.
export function frames(stack) {
  const out = [];
  for (const l of String(stack ?? "").split("\n")) {
    const m = FRAME.exec(l);
    if (m) out.push({ fn: (m[1] ?? "(anonymous)").replace(/[^\w$.<> ]/g, "").trim().slice(0, 60) || "(anonymous)", file: shortPath(m[2]).replace(/[^\w$./-]/g, "").slice(0, 80), line: Number(m[3]) });
  }
  return out;
}
const frameText = (f) => `${f.fn} (${f.file}:${f.line})`;
// The frame a kind of crash is told apart by: the first one in the game's own code, else the first.
export const topFrame = (stack) => { const fs = frames(stack); return fs.find((f) => f.file.startsWith("packages/")) ?? fs[0] ?? null; };
// An error's message may hold what a player typed (`Unknown spell ${action.spell}`), so none goes in a public issue except these shapes, with the value left out.
export function publicMessage(err) {
  const m = String(err?.message ?? "");
  if (/^Cannot (read|set) properties of (undefined|null)/.test(m)) return `Cannot ${m.startsWith("Cannot set") ? "set" : "read"} properties of ${/of null/.test(m) ? "null" : "undefined"}`;
  if (/^[A-Za-z_$][\w$.]{0,80} is not (a function|iterable|a constructor|defined)$/.test(m)) return m;
  if (m === "Maximum call stack size exceeded") return m;
  return null;
}
const errorName = (err) => (/^[A-Za-z][A-Za-z0-9]{0,30}$/.test(String(err?.name)) ? String(err.name) : "Error");

// ---------- the issue ----------
const KNOWN_TYPES = new Set([...ACTION_TYPES, "setPacks", "worldIndex"]);
export const publicType = (type) => (typeof type === "string" && KNOWN_TYPES.has(type) ? type : "(unknown)");
export const bundleTime = (name) => /^(\d{8}T\d{9}Z)-/.exec(String(name))?.[1] ?? null;
export function crashIssue({ type, build, err, stack, at, bundle }) {
  const fs = frames(stack), top = topFrame(stack), msg = publicMessage(err);
  const title = `Engine crash: ${publicType(type)}${top ? ` at ${top.file}:${top.line}` : ""}`;
  const body = [
    "An engine crash on the live table server. There is no player text, table code, name or member id in this issue: the repro bundle is on the server.",
    "",
    `- Action type: \`${publicType(type)}\``,
    `- Build: \`${/^[0-9a-f]{7,40}$/i.test(build ?? "") ? build : "unknown"}\``,
    `- Error: ${errorName(err)}${msg ? ` (${msg})` : ""}`,
    `- Top frame: \`${top ? frameText(top) : "unknown"}\``,
    `- First seen: ${at}`,
    `- Bundle: \`crashes/${bundleTime(bundle) ?? "(none written)"}-*.json\` in the server's data directory (the table code is part of the file name and is left out here)`,
    "",
    "<details><summary>Stack frames</summary>",
    "",
    fence(fs.slice(0, 12).map(frameText).join("\n") || "(no frames)", "text"),
    "",
    "</details>",
    "",
    "To reproduce: copy the bundle and the journal files it names, then `node scripts/replay.mjs --crash <bundle> --data <folder>`.",
  ].join("\n");
  return { title, body };
}

// ---------- the client's report ----------
const KIND_LIST = ["error", "rejection"];
export const CLIENT_ERROR = shape({
  v: oneOf([1]),
  kind: oneOf(KIND_LIST),
  message: str(300),
  stack: str(1500, { lines: true }),
  where: str(200),
  build: str(40),
  mode: oneOf(["solo", "table"]),
  screen: shape({ w: int(0, 20000), h: int(0, 20000) }, ["w", "h"]),
  actions: list(5, str(40)),
}, ["v", "kind", "message", "build", "mode", "screen"]);
export const clientErrorRoute = (rawUrl) => String(rawUrl ?? "").split("?")[0] === "/client-error";

const day = (t) => new Date(t).toISOString().slice(0, 10);
const stamp = (t) => new Date(t).toISOString().replace(/[-:.]/g, "");

// options: dir (DATA_DIR), env, build() -> the commit or null, log (console.error), fetch (tests), now, keep.
export function createCrashes({ dir, env = {}, build = () => null, log = (m) => console.error(m), fetch: doFetch = globalThis.fetch, now = Date.now, keep = KEEP } = {}) {
  const crashDir = join(dir, "crashes"), indexFile = join(dir, "crash-issues.json");
  const repo = /^[\w.-]+\/[\w.-]+$/.test(env.FEEDBACK_GITHUB_REPO ?? "") ? env.FEEDBACK_GITHUB_REPO : null;
  const token = typeof env.FEEDBACK_GITHUB_TOKEN === "string" && env.FEEDBACK_GITHUB_TOKEN.trim() ? env.FEEDBACK_GITHUB_TOKEN.trim() : null;
  let api = "https://api.github.com";
  if (env.FEEDBACK_GITHUB_API) {
    try { const u = new URL(env.FEEDBACK_GITHUB_API); if (u.protocol === "https:" || (u.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))) api = u.origin; } catch { /* keep the default */ }
  }
  const timeoutMs = Number(env.FEEDBACK_GITHUB_TIMEOUT_MS) > 0 ? Number(env.FEEDBACK_GITHUB_TIMEOUT_MS) : 10_000;
  const scrub = (s) => { let t = String(s); if (token) t = t.split(token).join("[token]"); return t.slice(0, 300); };
  const safe = (fn) => { try { return fn(); } catch (err) { try { log(`crashes: ${scrub(err?.message ?? err)}`); } catch { /* ignore */ } return null; } };

  // ----- bundles -----
  const hourly = new Map();                       // kind -> [times]
  let allHourly = [];
  const bundleName = /^\d{8}T\d{9}Z-[A-Z0-9]+(-\d+)?\.json$/;
  const fresh = (list, t) => { while (list.length && t - list[0] >= 3_600_000) list.shift(); return list; };
  function writeBundle(code, t, data) {
    mkdirSync(crashDir, { recursive: true });
    let name = `${stamp(t)}-${String(code).replace(/[^A-Z0-9]/gi, "").slice(0, 12) || "X"}.json`;
    for (let n = 2; existsSync(join(crashDir, name)); n++) name = name.replace(/(-\d+)?\.json$/, `-${n}.json`);
    let text = JSON.stringify(data, null, 1);
    if (text.length > BUNDLE_MAX) {                // too big even after scrubbing: keep what is needed to find the action
      data = { ...data, action: { type: data.action?.type ?? null }, cut: [...data.cut, "action (whole: over the bundle's size)"] };
      text = JSON.stringify(data, null, 1);
    }
    writeFileSync(join(crashDir, name) + ".tmp", text);
    renameSync(join(crashDir, name) + ".tmp", join(crashDir, name));
    const all = readdirSync(crashDir).filter((f) => bundleName.test(f)).sort();
    for (const f of all.slice(0, Math.max(0, all.length - keep))) { try { unlinkSync(join(crashDir, f)); } catch { /* already gone */ } }
    return name;
  }

  // ----- issues -----
  let book = { day: "", filed: 0, kinds: {} };     // kinds: key -> { number, count, reported, at, commented }
  try { const j = JSON.parse(readFileSync(indexFile, "utf8")); if (j && typeof j === "object" && j.kinds && typeof j.kinds === "object") book = { day: String(j.day ?? ""), filed: Number(j.filed) || 0, kinds: j.kinds }; } catch { /* none yet */ }
  const saveBook = () => {
    const keys = Object.keys(book.kinds);
    if (keys.length > KINDS_KEPT) for (const k of keys.sort((a, b) => (book.kinds[a].at > book.kinds[b].at ? 1 : -1)).slice(0, keys.length - KINDS_KEPT)) delete book.kinds[k];
    safe(() => { writeFileSync(indexFile + ".tmp", JSON.stringify(book)); renameSync(indexFile + ".tmp", indexFile); });
  };
  let said = { token: false, cap: false }, filing = 0;
  async function gh(method, path, body) {
    const res = await doFetch(`${api}/repos/${repo}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "content-type": "application/json", "user-agent": "hextable-crashes", "x-github-api-version": "2022-11-28" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
    let json = null;
    try { json = await res.json(); } catch { /* no body */ }
    return { ok: res.ok, status: res.status, json };
  }
  async function file(kind, info) {
    if (!repo || !token) { if (!said.token) { said.token = true; log("crashes: FEEDBACK_GITHUB_REPO and FEEDBACK_GITHUB_TOKEN are not both set, so engine crashes are not filed on GitHub; their bundles are kept in the data directory's crashes folder."); } return; }
    const t = now();
    if (book.day !== day(t)) { book.day = day(t); book.filed = 0; said.cap = false; }
    const known = book.kinds[kind];
    if (known) {
      known.count++;
      if (known.number && known.count > known.reported && t - known.commented >= COMMENT_GAP_MS) {
        known.commented = t; known.reported = known.count;
        saveBook();
        const r = await gh("POST", `/issues/${known.number}/comments`, { body: `Seen again: ${known.count} times in all since ${known.at}. Latest at ${new Date(t).toISOString()}, build \`${/^[0-9a-f]{7,40}$/i.test(build() ?? "") ? build() : "unknown"}\`.` });
        if (!r.ok) log(`crashes: GitHub refused the count comment on #${known.number} (status ${r.status}).`);
      } else saveBook();
      return;
    }
    if (book.filed >= ISSUES_DAY) { if (!said.cap) { said.cap = true; log(`crashes: ${ISSUES_DAY} crash issues are filed today; a new kind of crash is kept as a bundle only until tomorrow.`); } return; }
    book.filed++;
    const entry = book.kinds[kind] = { number: null, count: 1, reported: 1, at: new Date(t).toISOString(), commented: t };
    const { title, body } = crashIssue({ ...info, build: build(), at: entry.at });
    const r = await gh("POST", "/issues", { title, body, labels: ["crash"] });
    if (r.ok && Number.isInteger(r.json?.number)) { entry.number = r.json.number; saveBook(); }
    else { delete book.kinds[kind]; saveBook(); log(`crashes: GitHub refused the crash issue (status ${r.status}); the bundle is in ${crashDir}.`); }
  }
  const fileLater = (kind, info) => {
    if (filing >= 3) return;
    filing++;
    file(kind, info).catch((err) => log(`crashes: could not file on GitHub (${scrub(err?.name === "TimeoutError" ? "timed out" : err?.message)}).`)).finally(() => { filing--; });
  };

  // The crash: write the bundle, file or count the issue. Returns the bundle's name, or null when none was written (a kind that repeats too often).
  function engineCrash({ table, role, uid, action, err, journal }) {
    const t = now();
    const stack = String(err?.stack ?? err).slice(0, 4000);
    const type = typeof action?.type === "string" ? action.type : "?";
    const top = topFrame(stack);
    const kind = `${publicType(type)}|${top ? `${top.fn} ${top.file}:${top.line}` : "unknown"}`;
    let name = null;
    const times = fresh(hourly.get(kind) ?? [], t);
    hourly.set(kind, times);
    fresh(allHourly, t);
    if (times.length < BUNDLES_PER_KIND_HOUR && allHourly.length < BUNDLES_HOUR) {
      times.push(t); allHourly.push(t);
      name = safe(() => {
        const s = scrubAction(action, table.members ?? []);
        return writeBundle(table.code, t, {
          v: 1, at: new Date(t).toISOString(), build: build(), table: String(table.code), action: s.action, role: typeof role === "string" ? role.slice(0, 10) : null, uid: typeof uid === "string" ? uid.slice(0, 40) : null,
          stateVersion: table.state?.version ?? null, hash: hashState(table.state), journal: journal ?? null, cut: s.cut,
          error: { name: errorName(err), message: String(err?.message ?? err).slice(0, 300) }, stack,
        });
      });
    }
    fileLater(kind, { type, err, stack, bundle: name });
    return name;
  }

  // ----- the browser's reports -----
  const counts = { total: 0, byKind: new Map() };
  const conns = new WeakMap(), addrs = new Map(), tables = new Map();       // connection -> [times]; address -> [times]; table -> { day, n }
  const perMinute = (key, t) => {
    const map = typeof key === "object" && key !== null ? conns : addrs;
    let l = map.get(key);
    if (!l) { l = []; map.set(key, l); }
    while (l.length && t - l[0] >= 60_000) l.shift();
    if (l.length >= CLIENT_PER_MINUTE) return false;
    l.push(t);
    if (map === addrs && addrs.size > 2000) for (const [k, v] of addrs) if (!v.length || t - v[v.length - 1] >= 60_000) addrs.delete(k);
    return true;
  };
  const perDay = (code, t) => {
    const k = code || "-", d = day(t);
    let e = tables.get(k);
    if (!e || e.day !== d) { if (tables.size > 5000) for (const [x, v] of tables) if (v.day !== d) tables.delete(x); e = { day: d, n: 0 }; tables.set(k, e); }
    if (e.n >= CLIENT_PER_TABLE_DAY) return false;
    e.n++;
    return true;
  };
  // conn: whatever stands for the sender (a connection object, or an address); table: the table code it is seated at, or null.
  function clientError(report, { conn, table = null } = {}) {
    if (CLIENT_ERROR(report)) return "invalid";
    const t = now();
    if (!perMinute(conn ?? "-", t) || !perDay(table, t)) return "throttled";
    counts.total++;
    counts.byKind.set(report.kind, (counts.byKind.get(report.kind) ?? 0) + 1);
    safe(() => log(JSON.stringify({ event: "client-error", at: new Date(t).toISOString(), kind: report.kind, build: report.build, mode: report.mode, message: report.message, ...(report.where && { where: report.where }), ...(report.stack && { stack: report.stack.slice(0, 800) }), screen: report.screen, actions: report.actions ?? [] })));
    return "ok";
  }
  const stats = () => ({ clientErrors: counts.total, clientErrorsByType: Object.fromEntries(counts.byKind) });

  // POST /client-error, for a game with no socket (the solo game): JSON of at most 8 KB. Answers 204 when taken, and a plain refusal otherwise;
  // the page never waits for the answer.
  function handleHttp(req, res, { addr } = {}) {
    const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", "access-control-max-age": "86400", vary: "Origin" };
    const send = (status, extra = {}) => res.writeHead(status, { "cache-control": "no-store", ...cors, ...extra }).end();
    if (req.method === "OPTIONS") return send(204);
    if (req.method !== "POST") return send(405, { allow: "POST, OPTIONS", connection: "close" });
    if (String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase() !== "application/json") return send(415, { connection: "close" });
    const declared = Number(req.headers["content-length"]);
    const tooBig = () => { send(413, { connection: "close" }); req.pause(); setTimeout(() => req.destroy(), 1000).unref(); };
    if (Number.isFinite(declared) && declared > CLIENT_BODY_MAX) return tooBig();
    const parts = [];
    let size = 0, done = false;
    const stop = setTimeout(() => { if (!done) { done = true; send(408, { connection: "close" }); req.pause(); setTimeout(() => req.destroy(), 1000).unref(); } }, 10_000);
    stop.unref();
    req.on("data", (chunk) => { if (done) return; size += chunk.length; if (size > CLIENT_BODY_MAX) { done = true; clearTimeout(stop); parts.length = 0; return tooBig(); } parts.push(chunk); });
    req.on("error", () => { done = true; clearTimeout(stop); });
    req.on("end", () => {
      if (done) return;
      done = true; clearTimeout(stop);
      let report;
      try { report = JSON.parse(Buffer.concat(parts).toString("utf8")); } catch { return send(400); }
      const r = clientError(report, { conn: `addr:${addr}`, table: null });
      send(r === "ok" ? 204 : r === "throttled" ? 429 : 400);
    });
  }

  return { engineCrash, clientError, handleHttp, stats, dir: crashDir };
}
