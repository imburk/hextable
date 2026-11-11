// The table server: serves the built game, answers /api/ping, and runs tables
// over a WebSocket at /ws. Start it with `npm start` from the repo root.
//
//   PORT       port to listen on (default 8080)
//   DATA_DIR   where tables are saved between restarts (default ./data)
import { createServer } from "node:http";
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createTables } from "./tables.js";
import { acceptWebSocket } from "./ws.js";

const SITE = fileURLToPath(new URL("../../../dist", import.meta.url));
const DATA = process.env.DATA_DIR || join(process.cwd(), "data");
const PORT = Number(process.env.PORT) || 8080;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };

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
const dirty = new Map();
function flush() {
  for (const [code, t] of dirty) {
    try { writeFileSync(file(code) + ".tmp", JSON.stringify(t)); renameSync(file(code) + ".tmp", file(code)); }
    catch (err) { console.error(`Could not save table ${code}: ${err.message}`); }
  }
  dirty.clear();
}
let timer = null;
function save(t) {
  dirty.set(t.code, t);
  timer ??= setTimeout(() => { timer = null; flush(); }, 1000);
}

const tables = createTables({ load, save });

// ---------- http ----------
const server = createServer(async (req, res) => {
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
  const ws = acceptWebSocket(req, socket);
  if (!ws) return;
  const session = tables.connect({ send: (msg) => ws.send(JSON.stringify(msg)) });
  ws.onmessage = (text) => {
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    session.receive(msg);
  };
  ws.onclose = () => session.disconnect();
});

server.listen(PORT, () => console.log(`Hextable table server at http://localhost:${PORT} (${tables.size()} saved tables)`));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { flush(); process.exit(0); });
