// Validators on the game's static files (#646): a strong ETag, `Cache-Control: no-cache`, 304 on a matching If-None-Match, HEAD alike.
// Files are read per request (the server notices a changed file by its mtime and size), so a changed file gets a new tag without a restart.
import assert from "node:assert/strict";
import { mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { startServer, stopAll } from "./helpers.js";

const DIST = fileURLToPath(new URL("../../../dist", import.meta.url));
const NAME = `etag-test-${process.pid}`;
const DIR = join(DIST, NAME);
const BIG = Buffer.from("export const x = 'hextable';\n".repeat(400));
before(() => { mkdirSync(DIR, { recursive: true }); writeFileSync(join(DIR, "a.js"), BIG); writeFileSync(join(DIR, "index.html"), "<!DOCTYPE html><p>hi</p>"); writeFileSync(join(DIR, "pic.png"), Buffer.alloc(300, 5)); });
after(async () => { await stopAll(); rmSync(DIR, { recursive: true, force: true }); });

const get = (port, path, headers = {}, method = "GET") => new Promise((resolve, reject) => {
  const req = request({ port, path, method, headers }, (res) => {
    const chunks = []; res.on("data", (d) => chunks.push(d)); res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
  });
  req.on("error", reject); req.end();
});
const SECURITY = ["content-security-policy", "x-content-type-options"];
const at = (n) => `/${NAME}/${n}`;

test("a file is sent with a strong ETag and no-cache, and keeps its other headers", async () => {
  const { port } = await startServer();
  for (const n of ["a.js", "index.html", "pic.png"]) {
    const r = await get(port, at(n));
    assert.equal(r.status, 200, n);
    assert.match(r.headers.etag, /^"[A-Za-z0-9_-]{27}"$/, `${n}: strong (no W/), quoted`);
    assert.equal(r.headers["cache-control"], "no-cache", n);
    assert.ok(r.headers["content-type"], n);
    assert.equal(r.headers.vary, n === "pic.png" ? undefined : "Accept-Encoding", `${n}: Vary on the 200`);
    assert.equal(Number(r.headers["content-length"]), r.body.length, n);
    for (const h of SECURITY) assert.ok(r.headers[h], `${n}: ${h} is still there`);
  }
  assert.equal((await get(port, at("a.js"))).headers["content-type"], "text/javascript; charset=utf-8");
  assert.equal((await get(port, at("index.html"))).headers["content-type"], "text/html; charset=utf-8");
  assert.equal((await get(port, at("a.js"))).headers.etag, (await get(port, at("a.js"))).headers.etag, "the same bytes, the same tag");
});

test("a matching If-None-Match is a 304 with no body; a stale or absent one is a 200", async () => {
  const { port } = await startServer();
  const first = await get(port, at("a.js"));
  const etag = first.headers.etag;
  for (const inm of [etag, `W/${etag}`, `"nope", ${etag}`, "*"]) {
    const r = await get(port, at("a.js"), { "if-none-match": inm });
    assert.equal(r.status, 304, inm);
    assert.equal(r.body.length, 0, `${inm}: no body`);
    assert.equal(r.headers.etag, etag, inm);
    assert.equal(r.headers["cache-control"], "no-cache", inm);
    assert.equal(r.headers["content-length"], undefined, inm);
    for (const h of SECURITY) assert.ok(r.headers[h], `${inm}: ${h} kept on a 304`);
    assert.equal(r.headers.vary, "Accept-Encoding", `${inm}: Vary kept on a 304`);
  }
  for (const inm of ['"other"', '"' + etag.slice(1, -1) + 'x"', ""]) {
    const r = await get(port, at("a.js"), { "if-none-match": inm });
    assert.equal(r.status, 200, `[${inm}]`);
    assert.deepEqual(r.body, BIG);
  }
  assert.equal((await get(port, at("index.html"), { "if-none-match": (await get(port, at("index.html"))).headers.etag })).status, 304, "index.html too");
  assert.equal((await get(port, at("a.js"), { "if-none-match": "*", "accept-encoding": "gzip" })).status, 304, "* with the gzip variant");
  assert.equal((await get(port, at("missing.js"), { "if-none-match": "*" })).status, 404, "* does not make a missing file exist");
});

test("gzip has its own tag, and a gzipped tag does not match the plain file", async () => {
  const { port } = await startServer();
  const plain = (await get(port, at("a.js"))).headers.etag;
  const gz = await get(port, at("a.js"), { "accept-encoding": "gzip" });
  assert.equal(gz.headers["content-encoding"], "gzip");
  assert.match(gz.headers.etag, /-gzip"$/);
  assert.notEqual(gz.headers.etag, plain);
  assert.equal((await get(port, at("a.js"), { "accept-encoding": "gzip", "if-none-match": gz.headers.etag })).status, 304);
  assert.equal((await get(port, at("a.js"), { "if-none-match": gz.headers.etag })).status, 200, "a client that now wants the plain file is not told it has it");
  assert.equal((await get(port, at("a.js"), { "accept-encoding": "gzip", "if-none-match": plain })).status, 200);
});

test("HEAD answers as GET does, without a body", async () => {
  const { port } = await startServer();
  const g = await get(port, at("a.js")), h = await get(port, at("a.js"), {}, "HEAD");
  assert.equal(h.status, 200); assert.equal(h.body.length, 0);
  for (const k of ["etag", "cache-control", "content-type", "content-length"]) assert.equal(h.headers[k], g.headers[k], k);
  const gzG = await get(port, at("a.js"), { "accept-encoding": "gzip" }), gzH = await get(port, at("a.js"), { "accept-encoding": "gzip" }, "HEAD");
  assert.equal(gzH.status, 200); assert.equal(gzH.body.length, 0);
  for (const k of ["etag", "cache-control", "content-type", "content-length", "content-encoding", "vary"]) assert.equal(gzH.headers[k], gzG.headers[k], `gzip HEAD ${k}`);
  assert.equal((await get(port, at("a.js"), { "accept-encoding": "gzip", "if-none-match": gzG.headers.etag }, "HEAD")).status, 304);
  const h304 = await get(port, at("a.js"), { "if-none-match": g.headers.etag }, "HEAD");
  assert.equal(h304.status, 304); assert.equal(h304.body.length, 0); assert.equal(h304.headers.etag, g.headers.etag);
});

test("files are read per request: a changed file has a new tag at once, without a restart", async () => {
  const { port } = await startServer();
  const before = (await get(port, at("index.html"))).headers.etag;
  writeFileSync(join(DIR, "index.html"), "<!DOCTYPE html><p>a new deploy</p>");
  const later = new Date(Date.now() + 5000); utimesSync(join(DIR, "index.html"), later, later);      // a coarse clock must not hide the change
  const r = await get(port, at("index.html"), { "if-none-match": before });
  assert.equal(r.status, 200, "the old tag no longer matches");
  assert.notEqual(r.headers.etag, before);
  assert.equal(r.body.toString(), "<!DOCTYPE html><p>a new deploy</p>");
  assert.equal((await get(port, at("index.html"), { "if-none-match": r.headers.etag })).status, 304);
});

test("build.json and the API stay uncached (no-store), as the update check needs", async () => {
  const { port } = await startServer();
  for (const p of ["/build.json", "/api/ping"]) assert.equal((await get(port, p)).headers["cache-control"], "no-store", p);
});

test("a path out of the site is still refused, validators or not", async () => {
  const { port } = await startServer();
  for (const p of ["/%2e%2e/package.json", "/..%2fpackage.json", `/${NAME}/%2e%2e/%2e%2e/package.json`]) {
    for (const h of [{}, { "if-none-match": "*" }]) { const r = await get(port, p, h); assert.ok(r.status === 403 || r.status === 404, `${p}: ${r.status}`); assert.equal(r.headers.etag, undefined, p); }
  }
});
