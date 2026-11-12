// The table server: serves the built game, answers /api/ping, and runs tables
// over a WebSocket at /ws. Start it with `npm start` from the repo root.
//
//   PORT       port to listen on (default 8080; 0 picks a free one, and the start-up line says which)
//   DATA_DIR   where tables are saved between restarts (default ./data)
//   TIMELINE_CAP  timeline entries kept besides chronicle entries (default 5000)
//   LIMIT_*    abuse and size limits, see limits.js and the README (defaults are the production values)
//   Files DMs upload are kept under DATA_DIR/assets/<table code>/.
import { createServer } from "node:http";
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createLimits, limitsFromEnv, LIMIT_MESSAGE } from "./limits.js";
import { createTables, MAX_ACTION_BYTES, MAX_MAP_ACTION_BYTES } from "./tables.js";
import { assetRefs } from "../../rules/src/handouts.js";
import { createAssets } from "./assets.js";
import { assetRoute, handleAssets } from "./assets-http.js";
import { acceptWebSocket } from "./ws.js";

const SITE = fileURLToPath(new URL("../../../dist", import.meta.url));
const DATA = process.env.DATA_DIR || join(process.cwd(), "data");
const PORT = /^\d+$/.test(process.env.PORT ?? "") ? Number(process.env.PORT) : 8080;
// TIMELINE_CAP: how many timeline entries other than chronicle entries a table keeps (default 5000).
const capEnv = process.env.TIMELINE_CAP;
const timelineCap = capEnv !== undefined && /^\d+$/.test(capEnv) ? Number(capEnv) : undefined;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

// A frame is an action plus a little envelope. Until someone is seated as the DM, frames are small:
// only the DM may send a whole map document.
const FRAME_MAX = MAX_ACTION_BYTES + 4096;
const DM_FRAME_MAX = MAX_MAP_ACTION_BYTES + 4096;

const limits = createLimits(limitsFromEnv(process.env));
setInterval(() => limits.sweep(), 60_000).unref();

// The address of whoever is connecting: the first entry of x-forwarded-for when there is one
// (the host's proxy puts it there), else the socket's own. Without a proxy in front, a client
// can forge that header, so only run unproxied if that is acceptable.
const addressOf = (req) => String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket.remoteAddress || "unknown";

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
mkdirSync(DATA, { recursive: true });
const file = (code) => join(DATA, `${code}.json`);
function load() {
  const out = [];
  for (const name of readdirSync(DATA)) {
    if (!/^[A-Z0-9]{6}\.json$/.test(name)) continue;
    try { out.push(JSON.parse(readFileSync(join(DATA, name), "utf8"))); }
    catch (err) { console.error(`Skipping unreadable table file ${name}: ${err.message}`); }
  }
  return out;
}
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
function flush() {
  for (const [code, t] of dirty) {
    try { writeFileSync(file(code) + ".tmp", JSON.stringify(t)); renameSync(file(code) + ".tmp", file(code)); }
    catch (err) { console.error(`Could not save table ${code}: ${err.message}`); }
    try {
      const h = tables.exportHistory(code);
      if (h) { writeFileSync(historyFile(code) + ".tmp", JSON.stringify(h)); renameSync(historyFile(code) + ".tmp", historyFile(code)); }
    } catch (err) { console.error(`Could not save undo history for table ${code}: ${err.message}`); }
  }
  dirty.clear();
}
let timer = null;
function save(t) {
  dirty.set(t.code, t);
  timer ??= setTimeout(() => { timer = null; flush(); }, 1000);
}

const tables = createTables({ load, save, loadHistory, exportAssets: (code, state) => assets.pack(code, { first: assetRefs(state) }), ...(timelineCap !== undefined && { timelineCap }) });

// Table files. A folder whose table is gone (its file deleted) is cleared away at start.
const assets = createAssets({ dir: join(DATA, "assets"), limits: limits.config });
for (const code of assets.codes()) if (!tables.get(code)) assets.removeTable(code);

// ---------- http ----------
const server = createServer(async (req, res) => {
  for (const [k, v] of Object.entries(securityHeaders(req))) res.setHeader(k, v);
  const route = assetRoute(/^https?:/i.test(req.url) ? new URL(req.url).pathname : req.url);
  if (route) {
    try { return handleAssets(req, res, route, { assets, tables, limits, addr: addressOf(req) }); }
    catch (err) { console.error(`Asset request failed: ${err.stack}`); if (!res.headersSent) res.writeHead(500).end(); else res.destroy(); return; }
  }
  let path;
  try { path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)); }
  catch { res.writeHead(400).end(); return; }
  if (path === `${sep}api${sep}ping`) {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }).end('{"ok":true}');
    return;
  }
  const target = join(SITE, path.endsWith(sep) ? path + "index.html" : path);
  if (target !== SITE && !target.startsWith(SITE + sep)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(target);
    res.writeHead(200, { "content-type": TYPES[extname(target)] || "application/octet-stream" }).end(body);
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
  const session = tables.connect({
    send(msg) {
      if (msg.t === "welcome" && msg.role === "dm") ws.maxPayload = DM_FRAME_MAX;
      ws.send(JSON.stringify(msg));
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
    if ((msg?.t === "host" && !limits.allowHost(addr)) || (msg?.t === "join" && !limits.allowJoin(addr))) {
      ws.send(JSON.stringify({ t: "error", error: LIMIT_MESSAGE }));
      return;
    }
    session.receive(msg);
  };
  ws.onclose = () => { release(); session.disconnect(); };
});

server.listen(PORT, () => console.log(`Hextable table server at http://localhost:${server.address().port} (${tables.size()} saved tables)`));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { flush(); process.exit(0); });
