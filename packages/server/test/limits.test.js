import assert from "node:assert/strict";
import { test } from "node:test";
import { clientAddress, createLimits, DEFAULT_LIMITS, limitsFromEnv, normaliseAddress, proxyFromEnv } from "../src/limits.js";

const clock = () => { const c = { t: 1_000_000, now: () => c.t, advance: (ms) => { c.t += ms; } }; return c; };

test("defaults are the ones in the issue", () => {
  assert.deepEqual(limitsFromEnv({}), DEFAULT_LIMITS);
  assert.deepEqual([DEFAULT_LIMITS.connections, DEFAULT_LIMITS.hosts, DEFAULT_LIMITS.joins, DEFAULT_LIMITS.burst, DEFAULT_LIMITS.perSecond], [20, 5, 20, 20, 5]);
  assert.equal(DEFAULT_LIMITS.hostWindowMs, 3_600_000);
  assert.equal(DEFAULT_LIMITS.joinWindowMs, 600_000);
  assert.equal(limitsFromEnv({ LIMIT_HOSTS: "2", LIMIT_RATE: "junk" }).hosts, 2);
  assert.equal(limitsFromEnv({ LIMIT_RATE: "junk" }).perSecond, 5);
});

test("20 open connections per address; closing frees a place; other addresses are unaffected", () => {
  const l = createLimits();
  const open = Array.from({ length: 20 }, () => l.openConnection("1.1.1.1"));
  assert.ok(open.every(Boolean));
  assert.equal(l.openConnection("1.1.1.1"), null);
  assert.ok(l.openConnection("2.2.2.2"));
  open[0]();
  open[0]();                                           // releasing twice frees only one place
  assert.ok(l.openConnection("1.1.1.1"));
  assert.equal(l.openConnection("1.1.1.1"), null);
});

test("5 host messages per address per hour", () => {
  const c = clock(), l = createLimits({}, c.now);
  for (let i = 0; i < 5; i++) assert.equal(l.allowHost("a"), true);
  assert.equal(l.allowHost("a"), false);
  assert.equal(l.allowHost("b"), true);
  c.advance(59 * 60_000);
  assert.equal(l.allowHost("a"), false);
  c.advance(2 * 60_000);
  assert.equal(l.allowHost("a"), true);
});

test("20 join messages per address per 10 minutes", () => {
  const c = clock(), l = createLimits({}, c.now);
  for (let i = 0; i < 20; i++) assert.equal(l.allowJoin("a"), true);
  assert.equal(l.allowJoin("a"), false);
  c.advance(9 * 60_000);
  assert.equal(l.allowJoin("a"), false);
  c.advance(2 * 60_000);
  assert.equal(l.allowJoin("a"), true);
  assert.equal(l.allowHost("a"), true);                // hosts and joins are counted apart
});

test("a connection may burst 20 messages and then sustain 5 a second", () => {
  const c = clock(), l = createLimits({}, c.now), b = l.messageBucket();
  for (let i = 0; i < 20; i++) assert.equal(b.take(), true, `message ${i}`);
  assert.equal(b.take(), false);
  c.advance(1000);
  for (let i = 0; i < 5; i++) assert.equal(b.take(), true);
  assert.equal(b.take(), false);
  c.advance(60_000);                                   // a long rest refills to the burst, not beyond
  let n = 0;
  while (b.take()) n++;
  assert.equal(n, 20);
  assert.equal(l.messageBucket().take(), true);        // each connection has its own bucket
});

test("sweep forgets addresses whose windows have passed", () => {
  const c = clock(), l = createLimits({}, c.now);
  l.allowHost("a"); l.allowJoin("b");
  assert.equal(l.stats().hosts + l.stats().joins, 2);
  c.advance(3_600_001);
  l.sweep();
  assert.deepEqual(l.stats(), { addresses: 0, hosts: 0, joins: 0 });
});

// ---------- uploads and file reads (#143) ----------

test("uploads at once: 2 per address, 2 per table, 8 on the whole server; releasing frees the place", () => {
  const l = createLimits();
  assert.deepEqual([DEFAULT_LIMITS.uploadsAtOnce, DEFAULT_LIMITS.addressUploadsAtOnce, DEFAULT_LIMITS.tableUploadsAtOnce], [8, 2, 2]);
  const a1 = l.uploadSlot("a", "AAAAAA"), a2 = l.uploadSlot("a", "BBBBBB");
  assert.equal(typeof a1.release, "function"); assert.equal(typeof a2.release, "function");
  assert.equal(l.uploadSlot("a", "CCCCCC").refused, "address", "a third from one address waits, whatever the table");
  const b1 = l.uploadSlot("b", "AAAAAA");
  assert.ok(b1.release);
  assert.equal(l.uploadSlot("c", "AAAAAA").refused, "table", "a third to one table waits, whatever the address");
  a1.release(); a1.release();                          // releasing twice frees only one place
  assert.ok(l.uploadSlot("c", "AAAAAA").release);
  assert.equal(l.uploadSlot("d", "AAAAAA").refused, "table");
  // The whole server: 8 at once, from 8 addresses and 8 tables.
  const m = createLimits(), held = [];
  for (let i = 0; i < 8; i++) held.push(m.uploadSlot(`x${i}`, `T${i}AAAA`));
  assert.ok(held.every((s) => s.release));
  assert.equal(m.uploadSlot("y", "ZZZZZZ").refused, "server");
  held[3].release();
  assert.ok(m.uploadSlot("y", "ZZZZZZ").release);
});

test("an upload body has a deadline and, after a grace period, a minimum rate", () => {
  const l = createLimits({ uploadBodyMs: 60_000, uploadGraceMs: 10_000, uploadMinBytesPerSec: 1000 });
  assert.equal(l.uploadPace(5_000, 0), null, "nothing yet, but still in the grace period");
  assert.equal(l.uploadPace(10_000, 9_999), "slow");
  assert.equal(l.uploadPace(10_000, 10_000), null);
  assert.equal(l.uploadPace(30_000, 29_000), "slow", "a trickle is cut off");
  assert.equal(l.uploadPace(59_999, 5_000_000), null);
  assert.equal(l.uploadPace(60_000, 5_000_000), "deadline", "even a fast body ends at the deadline");
  const d = DEFAULT_LIMITS;
  // Production: a file at the largest size and the slowest rate allowed still fits inside the deadline.
  assert.ok(d.assetBytes / d.uploadMinBytesPerSec * 1000 <= d.uploadBodyMs, "the slowest allowed rate can finish the largest file");
});

test("file reads: a bucket per address", () => {
  const c = clock(), l = createLimits({ assetReadBurst: 3, assetReadsPerSecond: 1 }, c.now);
  for (let i = 0; i < 3; i++) assert.equal(l.allowAssetRead("a"), true);
  assert.equal(l.allowAssetRead("a"), false);
  assert.equal(l.allowAssetRead("b"), true, "another address has its own");
  c.advance(1000);
  assert.equal(l.allowAssetRead("a"), true);
  assert.equal(l.allowAssetRead("a"), false);
  c.advance(60_000);
  l.sweep();
  assert.equal(l.uploadStats().reads, 0, "full buckets are forgotten");
});

test("the new limits can be set from the environment", () => {
  const l = limitsFromEnv({ LIMIT_UPLOADS_AT_ONCE: "3", LIMIT_ADDRESS_UPLOADS_AT_ONCE: "1", LIMIT_TABLE_UPLOADS_AT_ONCE: "1", LIMIT_UPLOAD_BODY_MS: "500",
    LIMIT_UPLOAD_GRACE_MS: "100", LIMIT_UPLOAD_MIN_RATE: "10", LIMIT_ASSETS_TOTAL_BYTES: "1000", LIMIT_ASSET_READ_BURST: "4", LIMIT_ASSET_READ_RATE: "2" });
  assert.deepEqual([l.uploadsAtOnce, l.addressUploadsAtOnce, l.tableUploadsAtOnce, l.uploadBodyMs, l.uploadGraceMs, l.uploadMinBytesPerSec, l.totalAssetBytes, l.assetReadBurst, l.assetReadsPerSecond],
    [3, 1, 1, 500, 100, 10, 1000, 4, 2]);
});

// ---------- the client address (#205) ----------
const req = (xff, socket = "::ffff:192.0.2.1", extra = {}) => ({ headers: { ...(xff !== undefined && { "x-forwarded-for": xff }), ...extra }, socket: { remoteAddress: socket } });

test("proxyFromEnv: safe by default, junk means the default", () => {
  assert.deepEqual(proxyFromEnv({}), { trustProxy: 0, clientIpHeader: null });
  assert.equal(proxyFromEnv({ TRUST_PROXY: "2" }).trustProxy, 2);
  for (const v of ["", "-1", "abc", "1.5", "true", "100"]) assert.equal(proxyFromEnv({ TRUST_PROXY: v }).trustProxy, 0, v);
  assert.equal(proxyFromEnv({ CLIENT_IP_HEADER: " X-Real-IP " }).clientIpHeader, "x-real-ip");
  assert.equal(proxyFromEnv({ CLIENT_IP_HEADER: "bad header" }).clientIpHeader, null);
});

test("clientAddress: with no trusted proxy the header is ignored", () => {
  assert.equal(clientAddress(req("6.6.6.6, 10.0.0.1")), "192.0.2.1");
  assert.equal(clientAddress(req("6.6.6.6"), undefined), "192.0.2.1");
  assert.equal(clientAddress(req("6.6.6.6", "::ffff:192.0.2.1", { "x-real-ip": "6.6.6.6" }), { trustProxy: 0, clientIpHeader: "x-real-ip" }), "192.0.2.1");
});

test("clientAddress: the Nth entry from the right, never the leftmost", () => {
  assert.equal(clientAddress(req("6.6.6.6, 10.0.0.1"), { trustProxy: 1 }), "10.0.0.1");
  assert.equal(clientAddress(req("6.6.6.6, 10.0.0.1, 100.64.0.2"), { trustProxy: 2 }), "10.0.0.1");
  assert.equal(clientAddress(req("10.0.0.1"), { trustProxy: 1 }), "10.0.0.1");
  assert.equal(clientAddress(req("10.0.0.1"), { trustProxy: 2 }), "192.0.2.1", "fewer entries than trusted proxies: the request did not come through them");
  assert.equal(clientAddress(req(undefined), { trustProxy: 1 }), "192.0.2.1");
  assert.equal(clientAddress({ headers: { "x-forwarded-for": ["6.6.6.6", "10.0.0.1"] }, socket: { remoteAddress: "192.0.2.1" } }, { trustProxy: 1 }), "10.0.0.1", "repeated header lines count as one chain");
});

test("clientAddress: values that are not IP addresses fall back to the socket", () => {
  for (const bad of ["", "unknown", "999.1.1.1", "1.2.3", "10.0.0.1, not-an-ip", "10.0.0.1, ", "1.2.3.4/24", "<script>", "a".repeat(200)]) {
    assert.equal(clientAddress(req(bad), { trustProxy: 1 }), "192.0.2.1", JSON.stringify(bad));
  }
  assert.equal(clientAddress({ headers: {}, socket: {} }, { trustProxy: 1 }), "unknown");
});

test("clientAddress: CLIENT_IP_HEADER is read instead of x-forwarded-for, and only as a single value", () => {
  const p = { trustProxy: 1, clientIpHeader: "x-real-ip" };
  assert.equal(clientAddress(req("6.6.6.6", "192.0.2.1", { "x-real-ip": "10.0.0.5" }), p), "10.0.0.5");
  assert.equal(clientAddress(req("6.6.6.6"), p), "192.0.2.1", "header missing: the socket, not x-forwarded-for");
  assert.equal(clientAddress(req(undefined, "192.0.2.1", { "x-real-ip": "6.6.6.6, 10.0.0.5" }), p), "192.0.2.1", "a list is not a single address");
  assert.equal(clientAddress(req(undefined, "192.0.2.1", { "x-real-ip": "nope" }), p), "192.0.2.1");
});

test("normaliseAddress: IPv4-mapped IPv6 is plain IPv4; ports and zones are dropped; IPv6 is lower-cased", () => {
  assert.equal(normaliseAddress("::ffff:1.2.3.4"), "1.2.3.4");
  assert.equal(normaliseAddress("::FFFF:102:304"), "1.2.3.4");
  assert.equal(normaliseAddress("1.2.3.4:5678"), "1.2.3.4");
  assert.equal(normaliseAddress("[2001:DB8::1]:443"), "2001:db8::1");
  assert.equal(normaliseAddress("fe80::1%eth0"), "fe80::1");
  assert.equal(normaliseAddress("2001:DB8::1"), "2001:db8::1");
  assert.equal(clientAddress(req("::ffff:10.0.0.1"), { trustProxy: 1 }), "10.0.0.1");
  assert.equal(normaliseAddress("1.2.3.4.5"), null);
  assert.equal(normaliseAddress(undefined), null);
});
