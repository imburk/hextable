import assert from "node:assert/strict";
import { test } from "node:test";
import { createLimits, DEFAULT_LIMITS, limitsFromEnv } from "../src/limits.js";

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
