// The built game's text files are sent gzipped to a client that accepts it (the vendored Three.js is 2 MB raw).
// Against the real server, with files of its own written under dist/ (a folder named for this process, removed after).
// Uploads and table files are not compressed: they go through assets-http.js.
import assert from "node:assert/strict";
import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { gunzipSync } from "node:zlib";
import { startServer, stopAll } from "./helpers.js";

const DIST = fileURLToPath(new URL("../../../dist", import.meta.url));
const NAME = `gzip-test-${process.pid}`;
const DIR = join(DIST, NAME);
const BIG_JS = Buffer.from("export const x = 'hextable';\n".repeat(400));
const files = {
  "big.js": BIG_JS,
  "big.css": Buffer.from("body { color: #123456; }\n".repeat(100)),
  "big.json": Buffer.from(JSON.stringify({ a: "b".repeat(3000) })),
  "big.svg": Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'>" + "<g/>".repeat(500) + "</svg>"),
  "big.html": Buffer.from("<!DOCTYPE html><p>" + "hello ".repeat(500)),
  "tiny.js": Buffer.from("export const y = 1;\n"),
  "photo.png": Buffer.alloc(4000, 7),                       // not a text type, however compressible
};
before(() => { mkdirSync(DIR, { recursive: true }); for (const [n, b] of Object.entries(files)) writeFileSync(join(DIR, n), b); });
after(async () => { await stopAll(); rmSync(DIR, { recursive: true, force: true }); });

// A request with exactly the headers given (fetch would add and hide some). Resolves to { status, headers, body }.
const get = (port, path, headers = {}, method = "GET") => new Promise((resolve, reject) => {
  const req = request({ port, path, method, headers }, (res) => {
    const chunks = []; res.on("data", (d) => chunks.push(d)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
  });
  req.on("error", reject); req.end();
});
const at = (n) => `/${NAME}/${n}`;

test("gzip is served when the client accepts it, and it is the file", async () => {
  const { port } = await startServer();
  for (const n of ["big.js", "big.css", "big.json", "big.svg", "big.html"]) {
    const r = await get(port, at(n), { "accept-encoding": "gzip, deflate, br" });
    assert.equal(r.status, 200, n);
    assert.equal(r.headers["content-encoding"], "gzip", n);
    assert.equal(r.headers.vary, "Accept-Encoding", n);
    assert.equal(Number(r.headers["content-length"]), r.body.length, `${n}: length is of what is sent`);
    assert.ok(r.body.length < files[n].length / 2, `${n} is smaller`);
    assert.deepEqual(gunzipSync(r.body), files[n], n);
  }
  assert.equal((await get(port, at("big.js"), { "accept-encoding": "gzip, deflate, br" })).headers["content-type"], "text/javascript; charset=utf-8");
  assert.equal((await get(port, at("big.json"), { "accept-encoding": "gzip" })).headers["content-type"], "application/json; charset=utf-8");
  assert.equal((await get(port, at("big.svg"), { "accept-encoding": "gzip" })).headers["content-type"], "image/svg+xml");
  assert.equal((await get(port, at("big.js"), { "accept-encoding": "*" })).headers["content-encoding"], "gzip", "* allows it");
  assert.equal((await get(port, at("big.js"), { "accept-encoding": "br;q=1, GZIP;q=0.5" })).headers["content-encoding"], "gzip");
});

test("identity when the client does not accept gzip, with Vary still set", async () => {
  const { port } = await startServer();
  for (const ae of [undefined, "", "identity", "br", "deflate", "gzip;q=0", "gzip; q=0.0, br", "*;q=0"]) {
    const r = await get(port, at("big.js"), ae === undefined ? {} : { "accept-encoding": ae });
    assert.equal(r.status, 200, String(ae));
    assert.equal(r.headers["content-encoding"], undefined, String(ae));
    assert.equal(r.headers.vary, "Accept-Encoding", String(ae));
    assert.equal(Number(r.headers["content-length"]), BIG_JS.length);
    assert.deepEqual(r.body, BIG_JS);
  }
  assert.equal((await get(port, at("big.js"), { "accept-encoding": "gzip, *;q=0" })).headers["content-encoding"], "gzip");
  assert.equal((await get(port, at("big.js"), { "accept-encoding": "gzip;q=0, *" })).headers["content-encoding"], undefined, "gzip listed with q=0 beats *");
});

test("not compressed: a small file, a file that is not text, a range request; a missing file is still 404", async () => {
  const { port } = await startServer();
  const ae = { "accept-encoding": "gzip" };
  const tiny = await get(port, at("tiny.js"), ae);
  assert.equal(tiny.headers["content-encoding"], undefined); assert.deepEqual(tiny.body, files["tiny.js"]);
  const png = await get(port, at("photo.png"), ae);
  assert.equal(png.headers["content-encoding"], undefined); assert.equal(png.headers.vary, undefined);
  assert.equal(png.headers["content-type"], "application/octet-stream"); assert.deepEqual(png.body, files["photo.png"]);
  const ranged = await get(port, at("big.js"), { ...ae, range: "bytes=0-9" });
  assert.equal(ranged.headers["content-encoding"], undefined);
  assert.deepEqual(ranged.body, BIG_JS, "a range was never honoured here; the whole file, as before, and not gzipped");
  assert.equal((await get(port, at("nope.js"), ae)).status, 404);
  assert.equal((await get(port, `/${NAME}`, ae)).status, 404, "a folder is not a file");
  assert.equal((await get(port, "/..%2f..%2fpackage.json", ae)).status, 404, "a path out of dist finds nothing, as before");
});

test("security headers are intact, on compressed and plain responses and on HEAD", async () => {
  const { port } = await startServer();
  for (const headers of [{ "accept-encoding": "gzip" }, {}]) {
    for (const method of ["GET", "HEAD"]) {
      const r = await get(port, at("big.js"), headers, method);
      assert.equal(r.headers["x-content-type-options"], "nosniff");
      assert.equal(r.headers["x-frame-options"], "DENY");
      assert.equal(r.headers["referrer-policy"], "no-referrer");
      assert.match(r.headers["content-security-policy"], /script-src 'self'/);
      assert.equal(r.headers.vary, "Accept-Encoding");
      if (method === "HEAD") assert.equal(r.body.length, 0);
      assert.ok(Number(r.headers["content-length"]) > 0);
    }
  }
  const ping = await get(port, "/api/ping", { "accept-encoding": "gzip" });
  assert.equal(ping.headers["content-encoding"], undefined); assert.equal(ping.body.toString(), '{"ok":true}');
});

test("compressed once and kept, but a file that changes on disk is sent anew", async () => {
  const { port } = await startServer();
  const ae = { "accept-encoding": "gzip" };
  const a = await get(port, at("big.js"), ae), b = await get(port, at("big.js"), ae);
  assert.deepEqual(a.body, b.body);
  const next = Buffer.from("export const z = 'changed';\n".repeat(500));
  writeFileSync(join(DIR, "changing.js"), BIG_JS);
  assert.deepEqual(gunzipSync((await get(port, at("changing.js"), ae)).body), BIG_JS);
  writeFileSync(join(DIR, "changing.js"), next);
  const later = new Date(Date.now() + 5000); utimesSync(join(DIR, "changing.js"), later, later);
  assert.deepEqual(gunzipSync((await get(port, at("changing.js"), ae)).body), next);
  const many = await Promise.all(Array.from({ length: 8 }, () => get(port, at("big.css"), ae)));
  for (const r of many) assert.deepEqual(gunzipSync(r.body), files["big.css"]);
});

test("a table's uploaded file is sent as it is, whatever the client accepts", async () => {
  const { port } = await startServer();
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
  const ws = new WebSocket(`ws://localhost:${port}/ws`), got = [];
  ws.onmessage = (ev) => got.push(JSON.parse(ev.data));
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("socket error")); });
  ws.send(JSON.stringify({ t: "host", name: "Dana" }));
  let w;
  for (const end = Date.now() + 10_000; !(w = got.find((m) => m.t === "welcome")) && Date.now() < end;) await new Promise((r) => setTimeout(r, 10));
  assert.ok(w, "the table was hosted");
  try {
    const up = await fetch(`http://localhost:${port}/assets/${w.code}`, { method: "POST", headers: { "content-type": "image/png", "x-hextable-token": w.token }, body: PNG });
    assert.equal(up.status, 201);
    const { asset } = await up.json();
    const r = await get(port, `/assets/${w.code}/${asset.id}`, { "accept-encoding": "gzip, br", "x-hextable-token": w.token });
    assert.equal(r.status, 200);
    assert.equal(r.headers["content-encoding"], undefined);
    assert.deepEqual(r.body, PNG);
    assert.equal(r.headers["x-content-type-options"], "nosniff");
  } finally { ws.close(); }
});
