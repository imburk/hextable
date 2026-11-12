// The abuse limits, origin check and security headers, against the real server.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { request } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

let next = 0;
const running = [];
// Start a server of its own, with these environment settings, and resolve to its port.
async function start(env = {}) {
  const port = 20000 + ((process.pid * 7 + next++ * 13) % 9000);
  const data = mkdtempSync(join(tmpdir(), "hextable-h-"));
  const child = spawn(process.execPath, [fileURLToPath(new URL("../src/index.js", import.meta.url))],
    { env: { ...process.env, PORT: String(port), DATA_DIR: data, ...env }, stdio: ["ignore", "pipe", "inherit"] });
  running.push({ child, data });
  await new Promise((resolve, reject) => {
    child.stdout.once("data", resolve);
    child.once("exit", (code) => reject(new Error(`server exited early with code ${code}`)));
  });
  return port;
}
// Each server is stopped and waited for before its folder goes: a server still saving on its way out
// would otherwise race the removal (ENOTEMPTY under load).
after(async () => {
  for (const { child, data } of running) {
    if (child.exitCode === null && child.signalCode === null) { const gone = new Promise((r) => child.once("exit", r)); child.kill(); await gone; }
    rmSync(data, { recursive: true, force: true, maxRetries: 5 });
  }
});

// A WebSocket that records everything it is sent and how it closed.
function open(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`), got = [];
    const c = { ws, got, closed: new Promise((r) => { ws.onclose = (ev) => r(ev.code); }) };
    ws.onmessage = (ev) => got.push(JSON.parse(ev.data));
    ws.onopen = () => resolve(c);
    ws.onerror = () => reject(new Error("socket error"));
  });
}
const until = async (fn, ms = 3000) => {
  for (const end = Date.now() + ms; Date.now() < end;) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 10)); }
  throw new Error("timed out");
};
const TOO_MANY = { t: "error", error: "Too many requests. Wait a moment and try again." };

// A hand-made upgrade request, to set headers a browser would (Origin) or a proxy would (X-Forwarded-For).
function upgrade(port, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ port, path: "/ws", headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==", ...headers } });
    req.on("upgrade", (res, socket, head) => {
      const c = { status: res.statusCode, socket, text: [], done: () => socket.destroy() };
      const read = (buf) => {                                     // unmasked server frames, short ones only
        while (buf.length >= 2 && buf[1] < 126 && buf.length >= 2 + buf[1]) {
          if ((buf[0] & 15) === 1) c.text.push(JSON.parse(buf.subarray(2, 2 + buf[1]).toString()));
          buf = buf.subarray(2 + buf[1]);
        }
      };
      if (head.length) read(head);
      socket.on("data", read);
      resolve(c);
    });
    req.on("response", (res) => { res.resume(); resolve({ status: res.statusCode, done() {} }); });
    req.on("error", reject);
    req.end();
  });
}

test("security headers are on every response, including errors", async () => {
  const port = await start();
  for (const path of ["/", "/api/ping", "/nothing-here", "/index.html"]) {
    const res = await fetch(`http://localhost:${port}${path}`);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff", path);
    assert.equal(res.headers.get("referrer-policy"), "no-referrer", path);
    assert.equal(res.headers.get("x-frame-options"), "DENY", path);
    const csp = res.headers.get("content-security-policy");
    assert.match(csp, /script-src 'self'(;|$)/, path);
    assert.match(csp, /connect-src 'self' ws:\/\/localhost:\d+ wss:\/\/localhost:\d+/, path);
    assert.match(csp, /https:\/\/fonts\.googleapis\.com/);
    assert.match(csp, /https:\/\/fonts\.gstatic\.com/);
    assert.doesNotMatch(csp, /script-src[^;]*unsafe/);
  }
});

test("origin check: a page on another site is refused, the same site and non-browsers are allowed", async () => {
  const port = await start();
  assert.equal((await upgrade(port, { Host: `localhost:${port}`, Origin: "https://evil.example" })).status, 403);
  assert.equal((await upgrade(port, { Host: `localhost:${port}`, Origin: "null" })).status, 403);
  assert.equal((await upgrade(port, { Host: `localhost:${port}`, Origin: `http://localhost:${port}.evil.example` })).status, 403);
  const same = await upgrade(port, { Host: `localhost:${port}`, Origin: `http://localhost:${port}` });
  assert.equal(same.status, 101); same.done();
  const none = await upgrade(port, { Host: `localhost:${port}` });
  assert.equal(none.status, 101); none.done();
});

test("at most N open connections per address; the extra one is told and closed", async () => {
  const port = await start({ LIMIT_CONNECTIONS: "3" });
  const held = [await open(port), await open(port), await open(port)];
  const extra = await open(port);
  assert.deepEqual(await until(() => extra.got[0]), TOO_MANY);
  await extra.closed;
  held[0].ws.close();                                              // a place is freed
  await held[0].closed;
  const again = await until(async () => { try { return await open(port); } catch { return null; } });
  held[0] = again;
  again.ws.send(JSON.stringify({ t: "host", name: "Dana" }));
  await until(() => again.got.some((m) => m.t === "welcome"));
  for (const c of held) c.ws.close();
});

test("the address comes from the first entry of x-forwarded-for", async () => {
  const port = await start({ LIMIT_CONNECTIONS: "1" });
  const a = await upgrade(port, { "X-Forwarded-For": "10.0.0.1, 10.9.9.9" });
  const other = await upgrade(port, { "X-Forwarded-For": "10.0.0.2" });
  const same = await upgrade(port, { "X-Forwarded-For": "10.0.0.1" });
  assert.equal(a.status, 101); assert.equal(other.status, 101);
  assert.deepEqual(await until(() => same.text[0]), TOO_MANY);
  for (const c of [a, other, same]) c.done();
});

test("host messages are limited per address; the connection stays open", async () => {
  const port = await start({ LIMIT_HOSTS: "2" });
  const c = await open(port);
  c.ws.send(JSON.stringify({ t: "host", name: "One" }));
  await until(() => c.got.some((m) => m.t === "welcome"));
  for (let i = 0; i < 2; i++) {                                    // second host from a new connection is allowed, third is not
    const d = await open(port);
    d.ws.send(JSON.stringify({ t: "host", name: "Two" }));
    if (i === 0) await until(() => d.got.some((m) => m.t === "welcome"));
    else assert.deepEqual(await until(() => d.got[0]), TOO_MANY);
    if (i === 1) { d.ws.send(JSON.stringify({ t: "join", code: "NOPE" })); await until(() => d.got.length > 1); assert.equal(d.ws.readyState, WebSocket.OPEN); }
    d.ws.close();
  }
  c.ws.close();
});

test("join messages are limited per address", async () => {
  const port = await start({ LIMIT_JOINS: "2" });
  const replies = [];
  for (let i = 0; i < 3; i++) {
    const c = await open(port);
    c.ws.send(JSON.stringify({ t: "join", code: "ZZZZZZ", name: "Eve" }));
    replies.push(await until(() => c.got[0]));
    c.ws.close();
  }
  assert.match(replies[0].error, /No table has that code/);
  assert.match(replies[1].error, /No table has that code/);
  assert.deepEqual(replies[2], TOO_MANY);
});

test("a connection sending faster than its burst is told and closed", async () => {
  const port = await start({ LIMIT_BURST: "5", LIMIT_RATE: "1" });
  const c = await open(port);
  for (let i = 0; i < 8; i++) c.ws.send(JSON.stringify({ t: "sync" }));
  await c.closed;
  assert.deepEqual(c.got.at(-1), TOO_MANY);
  const ok = await open(port);                                     // others are not affected
  ok.ws.send(JSON.stringify({ t: "host", name: "Dana" }));
  await until(() => ok.got.some((m) => m.t === "welcome"));
  ok.ws.close();
});

test("frames: players are held to a small frame, the DM may send a map-sized one", async () => {
  const port = await start();
  const dm = await open(port);
  dm.ws.send(JSON.stringify({ t: "host", name: "Dana" }));
  const code = (await until(() => dm.got.find((m) => m.t === "welcome"))).code;
  const player = await open(port);
  player.ws.send(JSON.stringify({ t: "join", code, name: "Pip" }));
  await until(() => player.got.some((m) => m.t === "welcome"));
  player.ws.send("p".repeat(40_000));                              // not an action, just too big for a player
  assert.equal(await player.closed, 1009);
  dm.ws.send(JSON.stringify({ t: "sync" }));
  dm.ws.send(JSON.stringify({ t: "act", action: { type: "chronicle", title: "x", text: "q".repeat(40_000) } }));
  assert.deepEqual(await until(() => dm.got.find((m) => m.t === "error")), { t: "error", error: "That action is too large." });
  dm.ws.close();
});
