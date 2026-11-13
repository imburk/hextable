// Per-address and per-connection limits for the table server. No network code and no
// timers of its own except an optional sweep; the clock is injectable so tests do not wait.
//
//   const limits = createLimits(limitsFromEnv(process.env));
//   const release = limits.openConnection(addr);    // null when the address has too many open
//   limits.allowHost(addr) / limits.allowJoin(addr) // false when over the window's budget
//   const bucket = limits.messageBucket();          // one per connection; bucket.take() -> boolean
//   limits.allowUpload(addr)                        // false when over the window's budget of uploads
//   const slot = limits.uploadSlot(addr, code)      // { release } or { refused: "server" | "address" | "table" }
//   limits.uploadPace(elapsedMs, bytes)             // null, "slow" or "deadline": cut an upload body off?
//   limits.allowAssetRead(addr)                     // false when the address reads files too fast

import { isIP } from "node:net";

export const LIMIT_MESSAGE = "Too many requests. Wait a moment and try again.";


export const DEFAULT_LIMITS = {
  connections: 20,           // open WebSocket connections per address
  hosts: 5,                  // host messages per address per hostWindowMs
  hostWindowMs: 60 * 60 * 1000,
  joins: 20,                 // join messages per address per joinWindowMs
  joinWindowMs: 10 * 60 * 1000,
  burst: 20,                 // messages a connection may send at once
  perSecond: 5,              // and sustain
  uploads: 30,               // asset uploads (and deletions) per address per uploadWindowMs
  uploadWindowMs: 10 * 60 * 1000,
  assetBytes: 5 * 1024 * 1024,         // one uploaded file
  tableAssetBytes: 50 * 1024 * 1024,   // all the files of one table
  tableAssets: 200,                    // how many files one table may have
  totalAssetBytes: 2 * 1024 * 1024 * 1024,   // all the files of every table on the server (2 GiB)
  // Upload bodies are held in memory until checked, so only a few are read at once, and a slow one
  // cannot hold its place: it must finish by uploadBodyMs and, after uploadGraceMs, keep up
  // uploadMinBytesPerSec on average. (5 MB at 32 KiB/s takes 160 s, inside the 180 s deadline.)
  uploadsAtOnce: 8,                    // on the whole server
  addressUploadsAtOnce: 2,             // from one address
  tableUploadsAtOnce: 2,               // to one table
  uploadBodyMs: 180 * 1000,
  uploadGraceMs: 10 * 1000,
  uploadMinBytesPerSec: 32 * 1024,
  assetReadBurst: 120,                 // file reads per address at once
  assetReadsPerSecond: 10,             // and sustained
};

// Each limit can be set from the environment (useful for tests and for unusual hosts).
export function limitsFromEnv(env = {}) {
  const n = (name, fallback) => { const v = Number(env[name]); return Number.isFinite(v) && v > 0 ? v : fallback; };
  const d = DEFAULT_LIMITS;
  return {
    connections: n("LIMIT_CONNECTIONS", d.connections),
    hosts: n("LIMIT_HOSTS", d.hosts), hostWindowMs: n("LIMIT_HOST_WINDOW_MS", d.hostWindowMs),
    joins: n("LIMIT_JOINS", d.joins), joinWindowMs: n("LIMIT_JOIN_WINDOW_MS", d.joinWindowMs),
    burst: n("LIMIT_BURST", d.burst), perSecond: n("LIMIT_RATE", d.perSecond),
    uploads: n("LIMIT_UPLOADS", d.uploads), uploadWindowMs: n("LIMIT_UPLOAD_WINDOW_MS", d.uploadWindowMs),
    assetBytes: n("LIMIT_ASSET_BYTES", d.assetBytes), tableAssetBytes: n("LIMIT_TABLE_ASSET_BYTES", d.tableAssetBytes),
    tableAssets: n("LIMIT_TABLE_ASSETS", d.tableAssets), totalAssetBytes: n("LIMIT_ASSETS_TOTAL_BYTES", d.totalAssetBytes),
    uploadsAtOnce: n("LIMIT_UPLOADS_AT_ONCE", d.uploadsAtOnce), addressUploadsAtOnce: n("LIMIT_ADDRESS_UPLOADS_AT_ONCE", d.addressUploadsAtOnce),
    tableUploadsAtOnce: n("LIMIT_TABLE_UPLOADS_AT_ONCE", d.tableUploadsAtOnce),
    uploadBodyMs: n("LIMIT_UPLOAD_BODY_MS", d.uploadBodyMs), uploadGraceMs: n("LIMIT_UPLOAD_GRACE_MS", d.uploadGraceMs),
    uploadMinBytesPerSec: n("LIMIT_UPLOAD_MIN_RATE", d.uploadMinBytesPerSec),
    assetReadBurst: n("LIMIT_ASSET_READ_BURST", d.assetReadBurst), assetReadsPerSecond: n("LIMIT_ASSET_READ_RATE", d.assetReadsPerSecond),
  };
}

export function createLimits(config = {}, now = Date.now) {
  const c = { ...DEFAULT_LIMITS, ...config };
  const open = new Map();          // address -> open connections
  const hosts = new Map();         // address -> timestamps of recent host messages
  const joins = new Map();         // address -> timestamps of recent join messages
  const uploads = new Map();       // address -> timestamps of recent uploads and deletions
  const uploading = { all: 0, byAddr: new Map(), byTable: new Map() };   // upload bodies being read now
  const reads = new Map();         // address -> { tokens, last }: file reads
  const bump = (map, key, by) => { const n = (map.get(key) ?? 0) + by; if (n > 0) map.set(key, n); else map.delete(key); };

  // Sliding window: count the events still inside the window, admit this one if there is room.
  function admit(map, addr, max, windowMs) {
    const t = now(), recent = (map.get(addr) ?? []).filter((x) => t - x < windowMs);
    if (recent.length >= max) { map.set(addr, recent); return false; }
    recent.push(t);
    map.set(addr, recent);
    return true;
  }

  return {
    openConnection(addr) {
      const n = open.get(addr) ?? 0;
      if (n >= c.connections) return null;
      open.set(addr, n + 1);
      let done = false;
      return () => {                                   // call once when the connection closes
        if (done) return;
        done = true;
        const left = (open.get(addr) ?? 1) - 1;
        if (left > 0) open.set(addr, left); else open.delete(addr);
      };
    },
    allowHost: (addr) => admit(hosts, addr, c.hosts, c.hostWindowMs),
    allowJoin: (addr) => admit(joins, addr, c.joins, c.joinWindowMs),
    allowUpload: (addr) => admit(uploads, addr, c.uploads, c.uploadWindowMs),
    config: c,
    uploadSlot(addr, code) {
      if (uploading.all >= c.uploadsAtOnce) return { refused: "server" };
      if ((uploading.byAddr.get(addr) ?? 0) >= c.addressUploadsAtOnce) return { refused: "address" };
      if ((uploading.byTable.get(code) ?? 0) >= c.tableUploadsAtOnce) return { refused: "table" };
      uploading.all++; bump(uploading.byAddr, addr, 1); bump(uploading.byTable, code, 1);
      let done = false;
      return { release() { if (done) return; done = true; uploading.all--; bump(uploading.byAddr, addr, -1); bump(uploading.byTable, code, -1); } };
    },
    uploadPace(elapsedMs, bytes) {
      if (elapsedMs >= c.uploadBodyMs) return "deadline";
      if (elapsedMs >= c.uploadGraceMs && bytes < (elapsedMs / 1000) * c.uploadMinBytesPerSec) return "slow";
      return null;
    },
    allowAssetRead(addr) {
      const t = now(), b = reads.get(addr) ?? { tokens: c.assetReadBurst, last: t };
      b.tokens = Math.min(c.assetReadBurst, b.tokens + ((t - b.last) / 1000) * c.assetReadsPerSecond);
      b.last = t;
      reads.set(addr, b);
      if (b.tokens < 1) return false;
      b.tokens -= 1;
      return true;
    },
    // A token bucket: holds `burst` messages, refills `perSecond` a second.
    messageBucket() {
      let tokens = c.burst, last = now();
      return {
        take() {
          const t = now();
          tokens = Math.min(c.burst, tokens + ((t - last) / 1000) * c.perSecond);
          last = t;
          if (tokens < 1) return false;
          tokens -= 1;
          return true;
        },
      };
    },
    // Forget addresses whose windows have passed, so the maps do not grow for ever.
    sweep() {
      const t = now();
      for (const [map, windowMs] of [[hosts, c.hostWindowMs], [joins, c.joinWindowMs], [uploads, c.uploadWindowMs]]) {
        for (const [addr, list] of map) if (!list.some((x) => t - x < windowMs)) map.delete(addr);
      }
      for (const [addr, b] of reads) if (b.tokens + ((t - b.last) / 1000) * c.assetReadsPerSecond >= c.assetReadBurst) reads.delete(addr);
    },
    stats: () => ({ addresses: open.size, hosts: hosts.size, joins: joins.size }),
    uploadStats: () => ({ uploading: uploading.all, reads: reads.size }),
  };
}

// ---------- who is connecting ----------
// The address that per-address limits are keyed on. Safe by default: with no setting the socket's own
// address is used and every forwarding header is ignored, because a client can write whatever it likes
// in x-forwarded-for. Behind a proxy, say how far to trust it:
//   TRUST_PROXY       number of proxies in front of the server that append to x-forwarded-for (default 0).
//                     The Nth entry from the RIGHT is the client; never the leftmost, which the client chose.
//   CLIENT_IP_HEADER  a header the platform sets itself and overwrites (for example x-real-ip). Used in
//                     preference to x-forwarded-for, but only when TRUST_PROXY is above 0.
// Anything that does not parse as an IP address falls back to the socket's address.
export function proxyFromEnv(env = {}) {
  const hops = /^\d{1,2}$/.test(String(env.TRUST_PROXY ?? "").trim()) ? Number(env.TRUST_PROXY) : 0;
  const name = String(env.CLIENT_IP_HEADER ?? "").trim().toLowerCase();
  return { trustProxy: hops, clientIpHeader: /^[a-z0-9-]+$/.test(name) ? name : null };
}

// A valid IPv4 or IPv6 address in a canonical form, or null. IPv4-mapped IPv6 (::ffff:1.2.3.4) becomes
// plain IPv4, so one client is one address whichever way the socket and the proxy wrote it. A port
// ("1.2.3.4:5678", "[::1]:80") is accepted and dropped; a zone ("fe80::1%eth0") is dropped.
export function normaliseAddress(value) {
  let v = String(value ?? "").trim();
  if (!v || v.length > 64) return null;
  const bracket = /^\[([^\]]+)\](?::\d{1,5})?$/.exec(v);
  if (bracket) v = bracket[1];
  else if (/^[\d.]+:\d{1,5}$/.test(v)) v = v.slice(0, v.lastIndexOf(":"));
  v = v.replace(/%[\w.-]+$/, "");
  if (isIP(v) === 0) return null;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(v);
  if (mapped && isIP(mapped[1]) === 4) return mapped[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(v);
  if (hex) { const a = parseInt(hex[1], 16), b = parseInt(hex[2], 16); return `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`; }
  return isIP(v) === 6 ? v.toLowerCase() : v;
}

// req: anything with .headers and .socket. proxy: the result of proxyFromEnv.
export function clientAddress(req, proxy = {}) {
  const socket = normaliseAddress(req.socket?.remoteAddress) ?? "unknown";
  const hops = proxy.trustProxy ?? 0;
  if (!(hops > 0)) return socket;
  const header = (name) => { const v = req.headers?.[name]; return Array.isArray(v) ? v.join(",") : typeof v === "string" ? v : ""; };
  if (proxy.clientIpHeader) {
    const one = header(proxy.clientIpHeader);
    if (!one.includes(",")) { const a = normaliseAddress(one); if (a) return a; }
    return socket;
  }
  const chain = header("x-forwarded-for").split(",");
  if (chain.length < hops) return socket;                          // fewer entries than trusted proxies: not from our proxy
  return normaliseAddress(chain[chain.length - hops]) ?? socket;
}
