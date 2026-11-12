// Per-address and per-connection limits for the table server. No network code and no
// timers of its own except an optional sweep; the clock is injectable so tests do not wait.
//
//   const limits = createLimits(limitsFromEnv(process.env));
//   const release = limits.openConnection(addr);    // null when the address has too many open
//   limits.allowHost(addr) / limits.allowJoin(addr) // false when over the window's budget
//   const bucket = limits.messageBucket();          // one per connection; bucket.take() -> boolean
//   limits.allowUpload(addr)                        // false when over the window's budget of uploads

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
    tableAssets: n("LIMIT_TABLE_ASSETS", d.tableAssets),
  };
}

export function createLimits(config = {}, now = Date.now) {
  const c = { ...DEFAULT_LIMITS, ...config };
  const open = new Map();          // address -> open connections
  const hosts = new Map();         // address -> timestamps of recent host messages
  const joins = new Map();         // address -> timestamps of recent join messages
  const uploads = new Map();       // address -> timestamps of recent uploads and deletions

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
    },
    stats: () => ({ addresses: open.size, hosts: hosts.size, joins: joins.size }),
  };
}
