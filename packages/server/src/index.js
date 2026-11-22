// The table server: serves the built game, answers /api/ping, and runs tables
// over a WebSocket at /ws. Start it with `npm start` from the repo root.
//
//   PORT       port to listen on (default 8080; 0 picks a free one, and the start-up line says which)
//   DATA_DIR   where tables are saved between restarts (default ./data)
//   TIMELINE_CAP  timeline entries kept besides chronicle entries (default 5000)
//   TRUST_PROXY, CLIENT_IP_HEADER   how to find the client address behind a proxy (default: socket address only)
//   LIMIT_*    abuse and size limits, see limits.js and the README (defaults are the production values)
//   FEEDBACK_GITHUB_REPO, FEEDBACK_GITHUB_TOKEN   optional: also file player feedback (POST /feedback) as GitHub issues, see feedback.js; the same pair files engine crashes (label `crash`), see crashes.js
//   Crash bundles are kept in DATA_DIR/crashes (the last 100; never served), the kinds of crash filed in DATA_DIR/crash-issues.json.
//   Player feedback is kept in DATA_DIR/feedback.jsonl (five files of 5 MB: FEEDBACK_MAX_BYTES and FEEDBACK_FILES change that; when full, new reports are refused and nothing is deleted).
//   LIMIT_FEEDBACK_FORWARD_HOUR / _DAY   the whole server's cap on feedback issues filed on GitHub (20 an hour, 100 a day)
//   JOURNAL=off, JOURNAL_FILE_BYTES (5 MB), JOURNAL_FILES (5), JOURNAL_TOTAL_BYTES (500 MB)   the per-table action journal beside the table saves (DATA_DIR/ABC123.journal.*), see the README
//   IDLE_EVICT_MINUTES (30; 0 = never)   a table with nobody connected for this long is saved and dropped from memory; the next join loads it. Tables are read lazily: only an index is kept at start.
//   ARCHIVE_DAYS (90; 0 = never)   a table untouched this long moves, files and all, to DATA_DIR/archive/<code>/; joining its code brings it back. Nothing is deleted.
//   BACKUP_DIR (unset = no backups), BACKUP_KEEP (7), BACKUP_HOUR (3, UTC), BACKUP_ARCHIVE (auto | yes | no), BACKUP_ARCHIVE_MAX_MB (500)   a dated copy of DATA_DIR once a night, see the README and scripts/backup.mjs
//   Files DMs upload are kept under DATA_DIR/assets/<table code>/.
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzip } from "node:zlib";
import { promisify } from "node:util";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { clientAddress, createLimits, limitsFromEnv, proxyFromEnv, proxyReport, LIMIT_MESSAGE } from "./limits.js";
import { createTables, MAX_ACTION_BYTES, MAX_MAP_ACTION_BYTES, WORLD_FRAME_BYTES, worldAssets } from "./tables.js";
import { assetRefs } from "../../rules/src/handouts.js";
import { createAssets } from "./assets.js";
import { assetRoute, handleAssets } from "./assets-http.js";
import { acceptWebSocket } from "./ws.js";
import { createFeedback, feedbackRoute } from "./feedback.js";
import { createJournal, journalFromEnv } from "./journal.js";
import { clientErrorRoute, createCrashes } from "./crashes.js";
import { createStore } from "./store.js";
import { backupDue, backupRunning, realish, runBackup } from "./backup.js";
import { buildInfo } from "./build-info.js";

const SITE = fileURLToPath(new URL("../../../dist", import.meta.url));
const DATA = process.env.DATA_DIR || join(process.cwd(), "data");
const PORT = /^\d+$/.test(process.env.PORT ?? "") ? Number(process.env.PORT) : 8080;
// TIMELINE_CAP: how many timeline entries other than chronicle entries a table keeps (default 5000).
const capEnv = process.env.TIMELINE_CAP;
const timelineCap = capEnv !== undefined && /^\d+$/.test(capEnv) ? Number(capEnv) : undefined;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml",
};
// Text files of the built game are sent gzipped to a client that accepts it (the vendored Three.js is over 2 MB raw).
// Only these types, and only files over a kilobyte. Each file is compressed once and kept until it changes on disk.
// Uploads and served table files are not here: they go through assets-http.js, which this does not touch.
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".json", ".svg"]);
const GZIP_MIN = 1024;
const gzipAsync = promisify(gzip);
const siteCache = new Map();                 // target path -> { key: "mtimeMs:size", raw: Promise<Buffer>, gz: Promise<Buffer> | null, tag: string | null }

// Validators (#646). Every file of the game is sent with a strong ETag (a hash of its bytes, taken once per read of the file, so a file
// changed on disk, which the cache above notices by mtime and size on every request, gets a new tag) and `Cache-Control: no-cache`: the browser
// keeps its copy and asks each time, and an unchanged file is answered 304 with no body. The gzipped form is other bytes, so its tag ends `-gzip`.
const tagOf = (raw) => `"${createHash("sha256").update(raw).digest("base64url").slice(0, 27)}"`;
// Does an If-None-Match header match this tag? The weak comparison of RFC 9110: `W/` is ignored, and `*` matches any file that exists.
export function noneMatch(header, tag) {
  if (typeof header !== "string") return false;
  return header.split(",").some((x) => { const t = x.trim().replace(/^W\//, ""); return t === "*" || t === tag; });
}

// Does an Accept-Encoding header allow gzip? A listed q of 0 refuses it; "*" allows it unless gzip is listed.
function acceptsGzip(header) {
  if (typeof header !== "string") return false;
  let star = null;
  for (const part of header.split(",")) {
    const [name, ...params] = part.trim().toLowerCase().split(";");
    const q = params.map((x) => /^\s*q\s*=\s*([0-9.]+)\s*$/.exec(x)).find(Boolean);
    const ok = q ? Number(q[1]) > 0 : true;
    if (name === "gzip" || name === "x-gzip") return ok;
    if (name === "*") star = ok;
  }
  return star === true;
}

async function siteFile(target, compress) {
  const st = await stat(target);
  if (!st.isFile()) throw new Error("not a file");
  const key = `${st.mtimeMs}:${st.size}`;
  let e = siteCache.get(target);
  if (!e || e.key !== key) {
    e = { key, raw: readFile(target), gz: null, tag: null };
    siteCache.set(target, e);
    e.raw.catch(() => { if (siteCache.get(target) === e) siteCache.delete(target); });
  }
  const raw = await e.raw;
  e.tag ??= tagOf(raw);
  const tag = e.tag;
  if (!compress || raw.length < GZIP_MIN) return { body: raw, gzipped: false, etag: tag };
  e.gz ??= gzipAsync(raw, { level: 9 });
  try { return { body: await e.gz, gzipped: true, etag: `${tag.slice(0, -1)}-gzip"` }; }
  catch { e.gz = null; return { body: raw, gzipped: false, etag: tag }; }
}

// A frame is an action plus a little envelope. Until someone is seated as the DM, frames are small:
// only the DM may send a whole map document. The DM's frame limit, 1 MiB plus the envelope, is also what bounds a pack message before
// it is parsed: a pack is at most 256 KB of JSON, which as text inside a message is at most twice that once its quotes are escaped,
// well inside 1 MiB (tables.js then reads a pack text only up to 512 KB and the rules' budget holds the pack to 256 KB).
// A world pack (docs/specs/travel.md, Decision 2) is at most 4 MB of JSON, pictures included, so a seated DM's frame is
// bounded at that and an envelope of 64 KB; an action in it is still held to MAX_MAP_ACTION_BYTES by tables.js.
const FRAME_MAX = MAX_ACTION_BYTES + 4096;
const DM_FRAME_MAX = Math.max(MAX_MAP_ACTION_BYTES + 4096, WORLD_FRAME_BYTES);

const limits = createLimits(limitsFromEnv(process.env));
setInterval(() => limits.sweep(), 60_000).unref();

// The address of whoever is connecting, for the per-address limits. By default the socket's own address:
// x-forwarded-for is ignored because a client can forge it. TRUST_PROXY and CLIENT_IP_HEADER say how to
// read it behind a proxy (see limits.js and the README).
const proxy = proxyFromEnv(process.env);
const addressOf = (req) => clientAddress(req, proxy);

// Scripts and connections only from this origin; Google Fonts for styles and fonts. Inline
// styles are allowed because the UI sets style attributes (colours of tokens and swatches).
// Pictures from this origin, data: and blob: (table files are fetched with the session token and
// shown from a blob: URL, since an <img> cannot send a header).
function securityHeaders(req) {
  const host = /^[\w.\-:\[\]]+$/.test(req.headers.host ?? "") ? req.headers.host : "";
  const sockets = host ? ` ws://${host} wss://${host}` : "";
  return {
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
    "content-security-policy": [
      "default-src 'self'", "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com", "img-src 'self' data: blob:",
      `connect-src 'self'${sockets}`,
      "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
    ].join("; "),
  };
}

// ---------- saving tables: one JSON file each, written shortly after a change ----------
// Refuse to start on a data folder the server cannot write: saving would fail quietly and every table would be lost on restart.
try { mkdirSync(DATA, { recursive: true }); writeFileSync(join(DATA, ".write-test"), ""); rmSync(join(DATA, ".write-test")); }
catch (err) { console.error(`DATA_DIR ${DATA} is not writable (${err.code ?? err.message}): refusing to start, because tables could not be saved. Give the user running the server write access to it.`); process.exit(1); }
const file = (code) => join(DATA, `${code}.json`);
// Tables are not read at start: the store lists the saves by their timestamps and a table is read when its code is first used (tables.js).
// First, finish any archiving a crash cut short, so that the journals and files below are counted where they are.
const store = createStore({ dir: DATA });
for (const code of store.repair()) console.error(`Table ${code}: an archive move that was cut short was put back.`);
// The DM's undo history sits beside the table: ABC123.undo.json. Missing or unreadable, the table
// loads all the same with an empty history.
const historyFile = (code) => join(DATA, `${code}.undo.json`);
function loadHistory(code) {
  let text;
  try { text = readFileSync(historyFile(code), "utf8"); } catch { return null; }      // none saved
  try { return JSON.parse(text); }
  catch (err) { console.error(`Ignoring unreadable undo history for table ${code}: ${err.message}`); return null; }
}
const dirty = new Map();
// Write one table's save and undo history now. False if the save itself could not be written (the table must then stay in memory).
function flushOne(code) {
  const t = dirty.get(code);
  if (!t) return true;
  dirty.delete(code);
  let ok = true;
  try { writeFileSync(file(code) + ".tmp", JSON.stringify(t)); renameSync(file(code) + ".tmp", file(code)); }
  catch (err) { ok = false; console.error(`Could not save table ${code}: ${err.message}`); }
  try {
    const h = tables.exportHistory(code);
    if (h) { writeFileSync(historyFile(code) + ".tmp", JSON.stringify(h)); renameSync(historyFile(code) + ".tmp", historyFile(code)); }
  } catch (err) { ok = false; tables.historyFailed(code); console.error(`Could not save undo history for table ${code}: ${err.message}`); }       // false: a table is not evicted with its undo history unwritten
  return ok;
}
function flush() { for (const code of [...dirty.keys()]) flushOne(code); }
let timer = null;
function save(t) {
  dirty.set(t.code, t);
  timer ??= setTimeout(() => { timer = null; flush(); }, 1000);
}

// A world pack's pictures go into the table's file store (tables.js, worldAssets).
const { importAssets, dropAssets } = worldAssets(() => assets);

// The action journal (journal.js, #659): beside each table's save, never in the way of an action.
const journal = createJournal({ dir: DATA, ...journalFromEnv(process.env) });
const whole = (v, dflt) => (/^\d+$/.test(v ?? "") ? Number(v) : dflt);
const evictMinutes = whole(process.env.IDLE_EVICT_MINUTES, 30), archiveDays = whole(process.env.ARCHIVE_DAYS, 90);
// Crash bundles, GitHub crash issues and the browser's error reports (crashes.js, #689). Bundles are in DATA_DIR/crashes, which no route serves.
const crashReports = createCrashes({ dir: DATA, env: process.env, build: () => build.commit });
// Tests only (#691): with HEXTABLE_TEST_CRASH set, an advanceTime of 4242 minutes throws inside the engine call, so the crash path can be tested
// with no malformed action to rely on. Without the variable nothing is hooked.
const crashTest = process.env.HEXTABLE_TEST_CRASH ? (a) => { if (a?.type === "advanceTime" && a.minutes === 4242) throw new TypeError("test crash (HEXTABLE_TEST_CRASH)"); } : null;
const tables = createTables({ journal, crashes: crashReports, crashTest, save, loadHistory, index: () => store.list(), loadOne: (code) => store.read(code), archived: () => store.archived(), flushNow: flushOne,
  evictMs: evictMinutes > 0 ? evictMinutes * 60_000 : Infinity, archiveMs: archiveDays > 0 ? archiveDays * 86_400_000 : Infinity,
  // A table's files and journals leave the counts before they move, and come back after they return.
  archive: (code) => { if (backupRunning()) return false; assets.release(code); const ok = store.archive(code); if (ok) journal.forget(code); else assets.adopt(code); return ok; },
  restore: (code) => { const ok = store.restore(code); if (ok) { assets.adopt(code); journal.adopt(code); } return ok; },
  importAssets, dropAssets, allowPack: (code) => limits.allowPack(code), allowPackData: (id) => limits.allowPackData(id), exportAssets: (code, state, first) => assets.pack(code, { first: first ?? assetRefs(state) }), ...(timelineCap !== undefined && { timelineCap }) });
const archivedAtStart = store.archived();
journal.sweep((code) => existsSync(file(code)) || archivedAtStart.has(code));        // journals of tables whose save file is gone are removed at start; a save that cannot be read still counts as there (its journal is the best evidence)

// Table files. A folder whose table is gone (its file deleted) is cleared away at start.
const assets = createAssets({ dir: join(DATA, "assets"), limits: limits.config });
for (const code of assets.codes()) if (!tables.has(code)) assets.removeTable(code);       // `has`: a table not yet read, or in the archive, still counts as there

// Seats with a live connection: "<code> <token>" -> how many. Changing a table's files needs one, so a
// token alone (kept from an old session) cannot upload.
const live = new Map();
const seatKey = (code, token) => `${code} ${token}`;
const online = (code, token) => typeof token === "string" && live.has(seatKey(code, token));
// Connection quality (issue #246). Each connection can ping the server ({t:"ping",n} -> {t:"pong",n}) to measure its round trip, and a
// seated member reports how their own connection is doing ({t:"link",state,rtt?}). Neither goes near the table: no game state, no
// undo history, no save, no action. The reports are kept here, per table, and relayed by role: a player's goes to the DM (and back to the
// player who sent it), the DM's goes to every player let in. A player is never sent another player's.
const LINK_STATES = new Set(["good", "shaky", "lost"]);
const LINK_MIN_MS = 2000;                   // a connection's reports closer together than this are dropped (the client sends one every 3 s at most)
const peers = new Map();                    // table code -> Set of this server's connections to it: { send, role, userId, approved, report, at }
const linkTo = (peer) => [...(peers.get(peer.code) ?? [])].filter((p) => p === peer || (p.approved && p.role !== peer.role && (peer.role === "dm" || p.role === "dm")));
function relayLink(peer, msg) {
  if (!peer.approved || !LINK_STATES.has(msg.state)) return;
  const t = Date.now();
  if (t - peer.at < LINK_MIN_MS) return;
  peer.at = t;
  const rtt = Number.isFinite(msg.rtt) && msg.rtt >= 0 && msg.rtt <= 60_000 ? Math.round(msg.rtt) : undefined;
  peer.report = { t: "link", from: peer.userId, state: msg.state, ...(rtt !== undefined && { rtt }) };
  const text = JSON.stringify(peer.report);
  for (const p of linkTo(peer)) p.send(text);
}
// A connection that has just been let in is told what the other side last reported (the DM: each player's; a player: the DM's).
function catchUp(peer) {
  const last = new Map();
  for (const p of linkTo(peer)) if (p !== peer && p.report && (!last.has(p.userId) || p.at > last.get(p.userId).at)) last.set(p.userId, p);
  for (const p of last.values()) peer.send(JSON.stringify(p.report));
}
const sit = (key, by) => { const n = (live.get(key) ?? 0) + by; if (n > 0) live.set(key, n); else live.delete(key); };

// Player feedback (feedback.js): kept beside the tables, optionally filed on GitHub too.
const feedback = createFeedback({ dir: DATA, env: process.env, ...(/^\d+$/.test(process.env.FEEDBACK_MAX_BYTES ?? "") && Number(process.env.FEEDBACK_MAX_BYTES) > 0 && { fileMax: Number(process.env.FEEDBACK_MAX_BYTES) }), ...(/^\d+$/.test(process.env.FEEDBACK_FILES ?? "") && Number(process.env.FEEDBACK_FILES) > 0 && { files: Number(process.env.FEEDBACK_FILES) }) });

// Which change this is (build-info.js): from Railway's variables when there are some, else the image's own dist/build.json.
const build = buildInfo({ file: join(SITE, "build.json"), env: process.env });

// ---------- http ----------
const server = createServer(async (req, res) => {
  for (const [k, v] of Object.entries(securityHeaders(req))) res.setHeader(k, v);
  if (feedbackRoute(req.url)) {
    try { return feedback.handle(req, res, { limits, addr: addressOf(req) }); }
    catch (err) { console.error(`Feedback request failed: ${err.message}`); if (!res.headersSent) res.writeHead(500).end(); else res.destroy(); return; }
  }
  if (clientErrorRoute(req.url)) {
    try { return crashReports.handleHttp(req, res, { addr: addressOf(req) }); }
    catch (err) { console.error(`Client error request failed: ${err.message}`); if (!res.headersSent) res.writeHead(500).end(); else res.destroy(); return; }
  }
  const route = assetRoute(/^https?:/i.test(req.url) ? new URL(req.url).pathname : req.url);
  if (route) {
    try { return handleAssets(req, res, route, { assets, tables, limits, addr: addressOf(req), online }); }
    catch (err) { console.error(`Asset request failed: ${err.stack}`); if (!res.headersSent) res.writeHead(500).end(); else res.destroy(); return; }
  }
  let path;
  try { path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)); }
  catch { res.writeHead(400).end(); return; }
  if (path === `${sep}build.json`) {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }).end(JSON.stringify(build));
    return;
  }
  if (path === `${sep}api${sep}ping`) {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end('{"ok":true}');
    return;
  }
  if (path === `${sep}api${sep}health`) {
    if (!limits.allowHealth(addressOf(req))) { res.writeHead(429, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify({ ok: false, error: LIMIT_MESSAGE })); return; }
    // Counts only: nothing about any table, member, code or token. `proxy` is about this one request: the address the server sees for the caller.
    const { crashes, crashesByType } = tables.stats();
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end(JSON.stringify({
      ok: true, uptime: Math.round(process.uptime()), tables: { loaded: tables.size(), saved: tables.savedSize(), archived: tables.archivedSize(), active: tables.activeSize() },
      connections: [...peers.values()].reduce((n, set) => n + set.size, 0), crashes, crashesByType, ...crashReports.stats(), build: build.commit,
      proxy: proxyReport(req, proxy),
    }));
    return;
  }
  const target = join(SITE, path.endsWith(sep) ? path + "index.html" : path);
  if (target !== SITE && !target.startsWith(SITE + sep)) { res.writeHead(403).end(); return; }
  try {
    const ext = extname(target);
    const text = COMPRESSIBLE.has(ext);
    const { body, gzipped, etag } = await siteFile(target, text && req.headers.range === undefined && acceptsGzip(req.headers["accept-encoding"]));
    const headers = { "content-type": TYPES[ext] || "application/octet-stream", etag, "cache-control": "no-cache" };
    if (text) headers.vary = "Accept-Encoding";
    if (noneMatch(req.headers["if-none-match"], etag)) { res.writeHead(304, headers).end(); return; }       // the browser's copy is current: no body
    headers["content-length"] = body.length;
    if (gzipped) headers["content-encoding"] = "gzip";
    res.writeHead(200, headers).end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
  }
});

server.on("upgrade", (req, socket) => {
  if (new URL(req.url, "http://x").pathname !== "/ws") { socket.end("HTTP/1.1 404 Not Found\r\n\r\n"); return; }
  // Browsers say where the page came from; refuse a page on another site. No Origin: not a browser.
  if (req.headers.origin !== undefined) {
    let from = null;
    try { from = new URL(req.headers.origin).host; } catch { /* "null" and the like */ }
    if (from === null || from !== req.headers.host) { socket.end("HTTP/1.1 403 Forbidden\r\n\r\n"); return; }
  }
  const ws = acceptWebSocket(req, socket, { maxPayload: FRAME_MAX });
  if (!ws) return;
  const addr = addressOf(req);
  const release = limits.openConnection(addr);
  if (!release) {
    ws.send(JSON.stringify({ t: "error", error: LIMIT_MESSAGE }));
    ws.close();
    return;
  }
  const bucket = limits.messageBucket();
  let seat = null;                                         // this connection's seat, for `online`
  const peer = { send: (text) => ws.send(text), code: null, role: null, userId: null, approved: false, report: null, at: 0 };
  const session = tables.connect({
    send(msg) {
      if (msg.t === "welcome") {
        if (seat) sit(seat, -1);
        seat = seatKey(msg.code, msg.token); sit(seat, 1);
      }
      // Only a seated DM's frame is large; any other welcome puts it back (travel W3: the DM's frame holds a 4 MB world pack).
      if (msg.t === "welcome") ws.maxPayload = msg.role === "dm" ? DM_FRAME_MAX : FRAME_MAX;
      ws.send(JSON.stringify(msg));
      if (msg.t === "welcome") {
        if (peer.code && peer.code !== msg.code) peers.get(peer.code)?.delete(peer);
        Object.assign(peer, { code: msg.code, role: msg.role, userId: msg.userId, approved: !!msg.approved });
        if (!peers.has(msg.code)) peers.set(msg.code, new Set());
        peers.get(msg.code).add(peer);
        if (peer.approved) catchUp(peer);
      }
    },
  });
  ws.onmessage = (text) => {
    if (!bucket.take()) {
      ws.send(JSON.stringify({ t: "error", error: LIMIT_MESSAGE }));
      ws.close();
      return;
    }
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    // A ping costs one bucket token like any message (taken above), so a flood of pings is limited and closed like any other flood.
    // It is not exempt: a free message type would be a free way to keep a connection busy. At one every few seconds it costs a
    // legitimate client nothing.
    if (msg?.t === "ping") { ws.send(JSON.stringify({ t: "pong", n: Number.isSafeInteger(msg.n) ? msg.n : 0 })); return; }
    if (msg?.t === "link") { relayLink(peer, msg); return; }
    // A browser's error report touches no table: nothing is sent back, saved or journalled, and a refused or throttled one is dropped silently.
    if (msg?.t === "clientError") { try { crashReports.clientError(msg.report, { conn: peer, table: peer.code }); } catch { /* never in the way of play */ } return; }
    if ((msg?.t === "host" && !limits.allowHost(addr)) || (msg?.t === "join" && !limits.allowJoin(addr))) {
      ws.send(JSON.stringify({ t: "error", error: LIMIT_MESSAGE }));
      return;
    }
    // A handler that throws (a damaged table file, a bug) costs that message an error frame, not the process: the failure is logged
    // with its stack so it is not hidden, and the socket carries on.
    // Leaving puts the socket back to the small frame before anything else runs, so a failure on the way cannot skip it.
    if (msg?.t === "leave") ws.maxPayload = FRAME_MAX;
    try { session.receive(msg); }
    catch (err) {
      console.error(`A "${String(msg?.t).slice(0, 20)}" message failed: ${err?.stack ?? err}`);
      try { ws.send(JSON.stringify({ t: "error", error: "The server could not handle that message." })); } catch { /* the socket is gone */ }
    }
  };
  ws.onclose = () => { release(); if (peer.code) { const set = peers.get(peer.code); set?.delete(peer); if (set && !set.size) peers.delete(peer.code); } if (seat) { sit(seat, -1); seat = null; } session.disconnect(); };
});

server.listen(PORT, () => console.log(`Hextable table server at http://localhost:${server.address().port} (${tables.savedSize()} saved tables)`));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { flush(); journal.flushSync(); process.exit(0); });

// Once a minute: tables nobody is at are saved and dropped from memory, long-untouched ones are archived. Never allowed to throw into the timer.
setInterval(() => {
  try {
    const r = tables.sweep();
    if (r.evicted.length || r.archived.length) console.log(`tables: ${r.evicted.length} evicted from memory, ${r.archived.length} archived`);
  } catch (err) { console.error(`Sweep failed: ${err?.stack ?? err}`); }
}, 60_000).unref();

// Nightly backup (backup.js): only when BACKUP_DIR is set. Checked every ten minutes, so a server that was down at 03:00 makes it up when it is back.
const BACKUP_DIR = (process.env.BACKUP_DIR ?? "").trim();
if (BACKUP_DIR) {
  const hour = Math.min(23, whole(process.env.BACKUP_HOUR, 3));
  // On the same disk as the tables a backup guards against a bad save, not against losing the disk: say so once at start.
  Promise.all([realish(DATA), realish(BACKUP_DIR)]).then(async ([d, b]) => {
    const { statSync } = await import("node:fs");
    const dev = (p) => { for (let x = p; ; x = join(x, "..")) { try { return statSync(x).dev; } catch { if (x === join(x, "..")) return null; } } };
    if (dev(d) !== null && dev(d) === dev(b)) console.error(`BACKUP_DIR ${BACKUP_DIR} is on the same disk as DATA_DIR ${DATA}: backups there help against a bad save but not if the disk is lost. Use the host's volume backups or a different disk as well.`);
  }).catch(() => {});
  let failures = 0, notBefore = 0;
  const nightly = async () => {
    try {
      if (Date.now() < notBefore || !(await backupDue(BACKUP_DIR, new Date(), hour))) return;
      flush();
      const r = await runBackup({ dataDir: DATA, backupDir: BACKUP_DIR, keep: whole(process.env.BACKUP_KEEP, 7) || 7, archive: process.env.BACKUP_ARCHIVE || "auto",
        archiveMax: whole(process.env.BACKUP_ARCHIVE_MAX_MB, 500) * 1024 * 1024, log: (l) => console.log(l) });
      if (r.busy) return;
      if (r.ok) { failures = 0; return; }
      // After a failed run, wait before the next: an hour, then two, then four, at most six, so a full disk costs a log line now and then, not a copy every ten minutes.
      notBefore = Date.now() + Math.min(6, 2 ** failures++) * 3600_000;
      console.error(`Backup failed: ${r.error} (next try in ${Math.min(6, 2 ** (failures - 1))} h)`);
    } catch (err) { console.error(`Backup failed: ${err?.message ?? err}`); }
  };
  setInterval(nightly, 10 * 60_000).unref();
  setTimeout(nightly, 60_000).unref();
}
