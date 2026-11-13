// The HTTP side of table files. Routes, all under /assets/<code>:
//
//   POST   /assets/<code>        upload; the DM only. Body: the raw bytes. -> 201 { asset: record }
//   GET    /assets/<code>        the table's files; the DM only.           -> 200 { assets: [record] }
//   GET    /assets/<code>/<id>   one file, to a member allowed to see it.  -> 200 the bytes
//   DELETE /assets/<code>/<id>   the DM only.                              -> 204
//
// Who is asking is the session token from the socket's welcome, in the X-Hextable-Token header. It
// never goes in a URL. A browser fetches a picture with that header and shows it from a blob: URL.
//
// Every refusal to read a file is the same 404, whether the table, the token, the id or the
// permission was wrong, so a request learns nothing about what exists.
//
// Uploads are bounded by the limits in limits.js: a few at a time per address, per table and on the
// whole server; a body must arrive by a deadline and at a minimum rate; the file must fit the room
// left in the table and on the server, checked from Content-Length before the body is read. Reads
// are bounded per address too.
import { createReadStream } from "node:fs";
import { assetRefs } from "../../rules/src/handouts.js";
import { view } from "../../rules/src/view.js";
import { ASSET_TYPES, CODE, ID, SERVER_FULL } from "./assets.js";
import { LIMIT_MESSAGE } from "./limits.js";

export const TOKEN_HEADER = "x-hextable-token";
const NOT_FOUND = "Not found";
const TABLE_BUSY = "Another upload to this table is in progress. Wait for it to finish and try again.";
const TOO_SLOW = "The upload was too slow. Try again on a better connection.";
const TABLE_FULL = "This table has no room left for files. Delete some first.";

// The raw path, never decoded: an encoded slash or dot is not part of any valid code or id, so it
// simply fails to match. Returns null for anything that is not under /assets, else { code, id }
// with either possibly null when malformed.
export function assetRoute(rawUrl) {
  const path = String(rawUrl ?? "").split("?")[0];
  if (path !== "/assets" && !path.startsWith("/assets/")) return null;
  const m = /^\/assets\/([^/]+)(?:\/([^/]+))?$/.exec(path);
  if (!m) return { code: null, id: null, bad: true };
  return { code: CODE.test(m[1]) ? m[1] : null, id: m[2] === undefined ? undefined : ID.test(m[2]) ? m[2] : null, bad: !CODE.test(m[1]) || m[2] === "" || (m[2] !== undefined && !ID.test(m[2])) };
}

// What a member may fetch: the DM, every file of the table; a player, the files that something in
// their own view of the game names (a handout shown to them, the background of a level they are sent).
// What each member may read is worked out once per change of the table (its `seq` and state), not
// once per request: a view of the whole game is costly and a request is cheap to send.
const readable = new WeakMap();          // table -> { seq, state, byMember: Map(member id -> Set of ids) }
export function mayRead(table, member, id) {
  if (member.role === "dm") return true;
  let c = readable.get(table);
  if (!c || c.seq !== (table.seq ?? 0) || c.state !== table.state) readable.set(table, (c = { seq: table.seq ?? 0, state: table.state, byMember: new Map() }));
  let ids = c.byMember.get(member.id);
  if (!ids) c.byMember.set(member.id, (ids = assetRefs(view(table.state, { role: member.role, userId: member.id }))));
  return ids.has(id);
}

const send = (res, status, body, headers = {}) => {
  const json = typeof body === "string" ? JSON.stringify({ error: body }) : JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers }).end(json);
};

// online(code, token): whether that seat has a live connection. Changing files needs one.
export function handleAssets(req, res, route, { assets, tables, limits, addr, online = () => true }) {
  const token = req.headers[TOKEN_HEADER];
  const who = route.code ? tables.member(route.code, typeof token === "string" ? token : "") : null;
  const notFound = () => send(res, 404, NOT_FOUND);

  if (req.method === "GET" || req.method === "HEAD") {
    if (!limits.allowAssetRead(addr)) return send(res, 429, LIMIT_MESSAGE);
    if (route.bad || !who) return notFound();
    if (route.id === undefined) {
      if (who.member.role !== "dm") return notFound();
      return send(res, 200, { assets: assets.list(route.code), usage: assets.usage(route.code), limits: { file: limits.config.assetBytes, table: limits.config.tableAssetBytes, files: limits.config.tableAssets } });
    }
    const found = assets.get(route.code, route.id);
    if (!found || !mayRead(who.table, who.member, route.id)) return notFound();
    res.writeHead(200, {
      "content-type": found.record.mime, "content-length": found.record.bytes,
      "x-content-type-options": "nosniff", "content-disposition": "inline", "cache-control": "private, no-cache",
      "cross-origin-resource-policy": "same-origin",
      // Opened on its own, the file is a picture and nothing else: no scripts, no plugins, no forms.
      "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    });
    if (req.method === "HEAD") return res.end();
    return void createReadStream(found.path).on("error", () => res.destroy()).pipe(res);
  }

  // Changing files: the DM of this table, from this site.
  if (req.method !== "POST" && req.method !== "DELETE") return send(res, 405, "Method not allowed.", { allow: "GET, HEAD, POST, DELETE" });
  if (req.headers.origin !== undefined) {
    let from = null;
    try { from = new URL(req.headers.origin).host; } catch { /* "null" and the like */ }
    if (from === null || from !== req.headers.host) return send(res, 403, "Forbidden");
  }
  if (route.bad || !who || who.member.role !== "dm") return send(res, 403, "Only the DM of this table can change its files.", { connection: "close" });
  if (!online(route.code, token)) return send(res, 403, "Open the table in the game to change its files.", { connection: "close" });
  if (!limits.allowUpload(addr)) return send(res, 429, LIMIT_MESSAGE, { connection: "close" });

  if (req.method === "DELETE") {
    if (!route.id) return notFound();
    return assets.remove(route.code, route.id) ? res.writeHead(204, { "cache-control": "no-store" }).end() : notFound();
  }
  if (route.id !== undefined) return notFound();
  const type = String(req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (!ASSET_TYPES.includes(type)) return send(res, 415, "Upload a PNG, JPEG or WebP picture.", { connection: "close" });
  const max = limits.config.assetBytes;
  const declared = Number(req.headers["content-length"]);
  if (Number.isFinite(declared) && declared > max) return send(res, 413, `A file can be at most ${Math.floor(max / 1048576 * 10) / 10} MB.`, { connection: "close" });
  const room = assets.room(route.code);
  if (Number.isFinite(declared) && declared > room.bytes) return room.reason === "server" ? send(res, 507, SERVER_FULL, { connection: "close" }) : send(res, 413, TABLE_FULL, { connection: "close" });
  const slot = limits.uploadSlot(addr, route.code);
  if (slot.refused) return send(res, 429, slot.refused === "table" ? TABLE_BUSY : LIMIT_MESSAGE, { connection: "close" });
  const parts = [];
  let size = 0, done = false;
  const started = Date.now();
  const c = limits.config;
  const pace = setInterval(() => {
    if (!limits.uploadPace(Date.now() - started, size)) return;
    finish(() => { send(res, 408, TOO_SLOW, { connection: "close" }); req.pause(); setTimeout(() => req.destroy(), 1000).unref(); });
  }, Math.max(25, Math.min(1000, c.uploadGraceMs / 4, c.uploadBodyMs / 4)));
  pace.unref();
  const finish = (fn) => { if (done) return; done = true; clearInterval(pace); slot.release(); fn(); };
  req.on("data", (chunk) => {
    if (done) return;
    size += chunk.length;
    if (size > max) {
      finish(() => { send(res, 413, `A file can be at most ${Math.floor(max / 1048576 * 10) / 10} MB.`, { connection: "close" }); req.pause(); setTimeout(() => req.destroy(), 1000).unref(); });
      return;
    }
    parts.push(chunk);
  });
  req.on("end", () => finish(() => {
    let name = "";
    try { name = decodeURIComponent(String(req.headers["x-asset-name"] ?? "")); } catch { /* a name is only a label */ }
    const r = assets.put(route.code, Buffer.concat(parts), { name });
    if (!r.ok) return send(res, r.status, r.error);
    send(res, 201, { asset: r.record });
  }));
  req.on("error", () => finish(() => res.destroy()));
  req.on("aborted", () => finish(() => {}));
  req.on("close", () => finish(() => {}));               // dropped before the end: give the place back
}
