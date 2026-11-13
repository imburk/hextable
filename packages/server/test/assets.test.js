// Table files (task M9): uploads, who may fetch what, and the tricks a request might try.
// The store is tested directly; the HTTP side against the real server.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { startServer, stopAll } from "./helpers.js";
import { createAssets, sniff } from "../src/assets.js";
import { assetRoute } from "../src/assets-http.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64");
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from("JFIF\0\x01\x01\0\0\x01\0\x01\0\0"), Buffer.alloc(32), Buffer.from([0xff, 0xd9])]);
const WEBP = (() => { const body = Buffer.concat([Buffer.from("WEBPVP8 "), Buffer.alloc(24)]); const h = Buffer.from("RIFF\0\0\0\0"); h.writeUInt32LE(body.length, 4); return Buffer.concat([h, body]); })();
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>');
const HTML = Buffer.from("<!DOCTYPE html><html><script>fetch('/steal')</script></html>");

const temp = [];
after(() => { for (const d of temp) rmSync(d, { recursive: true, force: true }); });
const tempDir = () => { const d = mkdtempSync(join(tmpdir(), "hextable-assets-")); temp.push(d); return d; };

test("the type comes from the bytes: PNG, JPEG and WebP only, never SVG, HTML or a renamed file", () => {
  assert.equal(sniff(PNG), "image/png");
  assert.equal(sniff(JPEG), "image/jpeg");
  assert.equal(sniff(WEBP), "image/webp");
  for (const bad of [SVG, HTML, Buffer.from("GIF89a" + "x".repeat(20)), Buffer.alloc(64), PNG.subarray(0, 10), Buffer.concat([Buffer.from(" "), PNG]), Buffer.from("%PDF-1.7 ......................")]) assert.equal(sniff(bad), null);
});

test("the store: random ids, records, limits per file and per table, and no path from outside", () => {
  const dir = tempDir();
  const a = createAssets({ dir, limits: { assetBytes: 4096, tableAssetBytes: 300, tableAssets: 3 } });
  const r = a.put("ABCDEF", PNG, { name: "../../evil<script>.png" });
  assert.ok(r.ok);
  assert.match(r.record.id, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(r.record.mime, "image/png"); assert.equal(r.record.bytes, PNG.length); assert.equal(r.record.kind, "image");
  assert.ok(!r.record.name.includes("/") && !r.record.name.includes("<"), "the name is a label, cleaned");
  assert.deepEqual(readdirSync(join(dir, "ABCDEF")).sort(), [r.record.id, `${r.record.id}.json`].sort());
  assert.notEqual(a.put("ABCDEF", PNG).record.id, r.record.id);
  assert.equal(a.put("ABCDEF", SVG).status, 415);
  assert.equal(a.put("ABCDEF", Buffer.concat([PNG, Buffer.alloc(5000)])).status, 413);
  assert.equal(a.put("ABCDEF", Buffer.concat([PNG, Buffer.alloc(200)])).status, 413, "over the table's bytes");
  a.put("ABCDEF", PNG);
  assert.equal(a.put("ABCDEF", PNG).status, 413, "over the table's count");
  for (const code of ["../x", "ABCDE", "abcdef", "/etc", "ABC/EF", "ABCDE0"]) assert.equal(a.put(code, PNG).ok, false, code);
  for (const id of ["../ABCDEF.json", "..", r.record.id + ".json", "/etc/passwd", r.record.id.slice(1), `${r.record.id}/x`]) assert.equal(a.get("ABCDEF", id), null, id);
  assert.equal(a.get("ABCDEF", r.record.id).record.id, r.record.id);
  // A fresh store reads the records back from disk.
  const again = createAssets({ dir, limits: {} });
  assert.equal(again.list("ABCDEF").length, 3);
  assert.ok(again.remove("ABCDEF", r.record.id));
  assert.equal(again.get("ABCDEF", r.record.id), null);
  assert.equal(again.remove("ABCDEF", r.record.id), false);
  again.removeTable("ABCDEF");
  assert.ok(!existsSync(join(dir, "ABCDEF")));
});

test("routes are matched on the raw path: dots, encoded slashes and absolute paths match no file", () => {
  const id = "A".repeat(22);
  assert.deepEqual(assetRoute(`/assets/ABCDEF/${id}`), { code: "ABCDEF", id, bad: false });
  assert.deepEqual(assetRoute("/assets/ABCDEF"), { code: "ABCDEF", id: undefined, bad: false });
  assert.equal(assetRoute("/index.html"), null);
  for (const p of ["/assets/../data/x.json", `/assets/ABCDEF/..%2F..%2F${id}`, "/assets/%2Fetc%2Fpasswd", "/assets//etc/passwd", `/assets/ABCDEF/${id}/..`,
    "/assets/ABCDEF/", "/assets/ABCDEF/..", "/assets/..%2fABCDEF", `/assets/ABCDEF/%41${id.slice(1)}`, "/assets"]) assert.equal(assetRoute(p).bad, true, p);
});

// ---------- against the real server ----------
let started = [];
async function start(env = {}) {
  const s = await startServer({ env });
  started.push(s);
  return { port: s.port, data: s.data, stop: s.stop };
}
after(stopAll);

const until = async (fn, ms = 10_000) => {
  for (const end = Date.now() + ms; Date.now() < end;) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 10)); }
  throw new Error("timed out");
};
function open(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`), got = [];
    ws.onmessage = (ev) => got.push(JSON.parse(ev.data));
    ws.onopen = () => resolve({ ws, got, send: (m) => ws.send(JSON.stringify(m)) });
    ws.onerror = () => reject(new Error("socket error"));
  });
}
// A DM and two players, let in. Each has { id, token }.
async function table(port) {
  const dm = await open(port);
  dm.send({ t: "host", name: "Dana" });
  const w = await until(() => dm.got.find((m) => m.t === "welcome"));
  Object.assign(dm, { id: w.userId, token: w.token, code: w.code });
  const players = [];
  for (const name of ["Pat", "Sam"]) {
    const p = await open(port);
    p.send({ t: "join", code: dm.code, name });
    const pw = await until(() => p.got.find((m) => m.t === "welcome"));
    Object.assign(p, { id: pw.userId, token: pw.token });
    dm.send({ t: "approve", userId: p.id, ok: true });
    await until(() => p.got.some((m) => m.t === "update"));
    players.push(p);
  }
  return { dm, pat: players[0], sam: players[1], code: dm.code };
}
const act = async (c, action) => {
  const n = c.got.length;
  c.send({ t: "act", action });
  return until(() => c.got.slice(n).find((m) => m.t === "update" || m.t === "error"));
};
const url = (port, path) => `http://localhost:${port}${path}`;
const upload = (port, code, token, body, type = "image/png", extra = {}) =>
  fetch(url(port, `/assets/${code}`), { method: "POST", headers: { "content-type": type, ...(token && { "x-hextable-token": token }), ...extra }, body });
const get = (port, path, token) => fetch(url(port, path), { headers: token ? { "x-hextable-token": token } : {} });
// A request with the path exactly as written: fetch would tidy dots away.
const raw = (port, path, headers = {}) => new Promise((resolve, reject) => {
  const req = request({ port, path, headers }, (res) => { let body = ""; res.on("data", (d) => (body += d)); res.on("end", () => resolve({ status: res.statusCode, body })); });
  req.on("error", reject); req.end();
});

test("only the DM uploads; a player or a stranger is refused; the type is checked from the bytes", async () => {
  const { port } = await start();
  const { dm, pat, code } = await table(port);
  assert.equal((await upload(port, code, pat.token, PNG)).status, 403);
  assert.equal((await upload(port, code, undefined, PNG)).status, 403);
  assert.equal((await upload(port, code, randomBytes(24).toString("base64url"), PNG)).status, 403);
  assert.equal((await upload(port, "ZZZZZZ", dm.token, PNG)).status, 403, "a DM's token is for their own table");
  const ok = await upload(port, code, dm.token, PNG, "image/png", { "x-asset-name": "map.png" });
  assert.equal(ok.status, 201);
  const { asset } = await ok.json();
  assert.equal(asset.mime, "image/png"); assert.equal(asset.name, "map.png");
  // Not an image, whatever the header says.
  for (const [body, type] of [[SVG, "image/png"], [HTML, "image/jpeg"], [SVG, "image/svg+xml"], [PNG, "text/html"], [PNG, "image/gif"], [Buffer.from("hello world, not a picture"), "image/webp"]]) {
    const r = await upload(port, code, dm.token, body, type);
    assert.equal(r.status, 415, `${type} ${body.subarray(0, 8)}`);
  }
  // A JPEG sent as PNG is stored as what it is.
  assert.equal((await (await upload(port, code, dm.token, JPEG, "image/png")).json()).asset.mime, "image/jpeg");
  const list = await (await get(port, `/assets/${code}`, dm.token)).json();
  assert.equal(list.assets.length, 2);
  assert.equal((await get(port, `/assets/${code}`, pat.token)).status, 404, "players do not list the table's files");
  // A page on another site cannot upload with someone's token.
  assert.equal((await upload(port, code, dm.token, PNG, "image/png", { origin: "https://evil.example" })).status, 403);
  for (const c of [dm, pat]) c.ws.close();
});

test("oversize files are refused, by declared length or as they arrive, and a table's limits hold", async () => {
  const { port } = await start({ LIMIT_ASSET_BYTES: "2000", LIMIT_TABLE_ASSETS: "2" });
  const { dm, code } = await table(port);
  const big = Buffer.concat([PNG, Buffer.alloc(5000)]);
  assert.equal((await upload(port, code, dm.token, big)).status, 413);
  // No length given: the body is streamed and cut off when it passes the limit.
  const streamed = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(PNG)); for (let i = 0; i < 4; i++) c.enqueue(new Uint8Array(1000)); c.close(); } });
  const r = await fetch(url(port, `/assets/${code}`), { method: "POST", headers: { "content-type": "image/png", "x-hextable-token": dm.token }, body: streamed, duplex: "half" }).catch((e) => e);
  assert.ok(r instanceof Error || r.status === 413, `got ${r.status}`);
  assert.equal((await upload(port, code, dm.token, PNG)).status, 201);
  assert.equal((await upload(port, code, dm.token, PNG)).status, 201);
  assert.equal((await upload(port, code, dm.token, PNG)).status, 413, "the table has its two files");
  dm.ws.close();
});

test("uploads are rate-limited per address", async () => {
  const { port } = await start({ LIMIT_UPLOADS: "2" });
  const { dm, code } = await table(port);
  assert.equal((await upload(port, code, dm.token, PNG)).status, 201);
  assert.equal((await upload(port, code, dm.token, PNG)).status, 201);
  assert.equal((await upload(port, code, dm.token, PNG)).status, 429);
  dm.ws.close();
});

test("a player fetches a handout's picture only once it is shown to them; strangers never; every refusal looks the same", async () => {
  const { port, data } = await start();
  const { dm, pat, sam, code } = await table(port);
  const { asset } = await (await upload(port, code, dm.token, PNG)).json();
  const path = `/assets/${code}/${asset.id}`;
  const missing = await get(port, `/assets/${code}/${randomBytes(16).toString("base64url")}`, dm.token);
  const refusal = { status: missing.status, body: await missing.text() };
  assert.equal(refusal.status, 404);
  const same = async (res, why) => assert.deepEqual({ status: res.status, body: await res.text() }, refusal, why);

  // The DM sees it at once, with the headers that keep it a picture.
  const mine = await get(port, path, dm.token);
  assert.equal(mine.status, 200);
  assert.deepEqual(Buffer.from(await mine.arrayBuffer()), PNG);
  assert.equal(mine.headers.get("content-type"), "image/png");
  assert.equal(mine.headers.get("x-content-type-options"), "nosniff");
  assert.equal(mine.headers.get("content-disposition"), "inline");
  assert.match(mine.headers.get("cache-control"), /private/);
  assert.match(mine.headers.get("content-security-policy"), /default-src 'none'.*sandbox/);

  // A stranger: no token, a made-up token, a token of another table.
  const other = await table(port);
  await same(await get(port, path), "no token");
  await same(await get(port, path, randomBytes(24).toString("base64url")), "a guessed token");
  await same(await get(port, path, other.dm.token), "the DM of another table");
  await same(await get(port, path, other.pat.token), "a player of another table");
  // A player who has not been let in yet.
  const waiting = await open(port);
  waiting.send({ t: "join", code, name: "Kim" });
  const ww = await until(() => waiting.got.find((m) => m.t === "welcome"));
  await same(await get(port, path, ww.token), "a player still waiting at the door");

  // Players, before and after it is shown. A handout is made, shown to Pat only.
  await same(await get(port, path, pat.token), "not referred to by anything Pat was sent");
  assert.equal((await act(dm, { type: "handout", handout: { title: "Rune wall", asset: asset.id } })).t, "update");
  await same(await get(port, path, pat.token), "made but not shown");
  await act(dm, { type: "showHandout", handout: "h1", to: [pat.id] });
  assert.equal((await get(port, path, pat.token)).status, 200, "shown to Pat");
  await same(await get(port, path, sam.token), "not shown to Sam");
  await until(() => pat.got.some((m) => m.t === "update" && JSON.stringify(m).includes(asset.id)));
  assert.ok(!sam.got.some((m) => JSON.stringify(m).includes(asset.id)), "Sam was never sent the id");
  await act(dm, { type: "hideHandout", handout: "h1" });
  await same(await get(port, path, pat.token), "hidden again");

  // Guessed and malformed ids get the answer a missing one does.
  for (const p of [`/assets/${code}/${"A".repeat(22)}`, `/assets/${code}/nope`, `/assets/${code}/${asset.id}.json`, `/assets/${code}/${asset.id}x`, `/assets/ZZZZZZ/${asset.id}`, `/assets/${code.toLowerCase()}/${asset.id}`])
    await same(await get(port, p, dm.token), p);
  // Path tricks, sent exactly as written.
  writeFileSync(join(data, "secret.txt"), "TOP SECRET");
  for (const p of ["/assets/../secret.txt", `/assets/${code}/..%2F..%2Fsecret.txt`, `/assets/${code}/%2E%2E%2F%2E%2E%2Fsecret.txt`, "/assets/%2Fetc%2Fpasswd", "/assets//etc/passwd",
    `/assets/${code}/${asset.id}/../../../secret.txt`, `/assets/${code}/..`, `/assets/..%2F${code}/${asset.id}`, `/assets/${code}/${asset.id}.json`, `/assets/${code}/C:\\secret.txt`]) {
    const r = await raw(port, p, { "x-hextable-token": dm.token });
    assert.deepEqual(r, refusal, p);
  }
  assert.ok(!(await raw(port, "/../secret.txt")).body.includes("TOP SECRET"));

  // Deleting: the DM only.
  assert.equal((await fetch(url(port, path), { method: "DELETE", headers: { "x-hextable-token": pat.token } })).status, 403);
  assert.equal((await fetch(url(port, path), { method: "DELETE", headers: { "x-hextable-token": dm.token } })).status, 204);
  await same(await get(port, path, dm.token), "deleted");
  for (const c of [dm, pat, sam, waiting, other.dm, other.pat, other.sam]) c.ws.close();
});

test("a level's background is fetched by the players only when that level is sent to them", async () => {
  const { port } = await start();
  const { dm, pat, code } = await table(port);
  const { asset } = await (await upload(port, code, dm.token, PNG)).json();
  const tiles = { "30,0": { t: "stone" }, "31,0": { t: "stone" } };
  const r = await act(dm, { type: "mapEdit", ops: [{ op: "level", level: { id: "cellar", name: "Cellar", z: -20, tiles, image: { asset: asset.id, feet: [20, 10], origin: [0, 0] } } },
    { op: "region", region: { id: "crypt", name: "Crypt", level: "cellar", hexes: Object.keys(tiles) } }] });
  assert.equal(r.t, "update", r.error);
  const path = `/assets/${code}/${asset.id}`;
  assert.equal((await get(port, path, pat.token)).status, 404);
  await act(dm, { type: "revealRegion", region: "crypt", revealed: true });
  assert.equal((await get(port, path, pat.token)).status, 200);
  for (const c of [dm, pat]) c.ws.close();
});

test("a scene's picture and its NPCs' portraits are fetched by players while the scene shows them, and never the DM's notes", async () => {
  const { port } = await start();
  const { dm, pat, sam, code } = await table(port);
  const ids = [];
  for (let i = 0; i < 3; i++) ids.push((await (await upload(port, code, dm.token, PNG)).json()).asset.id);
  const [picture, face, unused] = ids, path = (id) => `/assets/${code}/${id}`;
  for (const id of ids) assert.equal((await get(port, path(id), pat.token)).status, 404);
  // A scene the DM prepares is not the players' yet: nor are its files.
  assert.equal((await act(dm, { type: "scene", scene: { title: "Later", image: unused, open: false } })).t, "update");
  assert.equal((await act(dm, { type: "sceneNpc", npc: { name: "Later NPC", portrait: unused } })).t, "update");
  assert.equal((await get(port, path(unused), pat.token)).status, 404, "a prepared scene's file");
  assert.equal((await act(dm, { type: "endScene" })).t, "update");
  assert.equal((await act(dm, { type: "scene", scene: { title: "The study", image: picture } })).t, "update");
  assert.equal((await act(dm, { type: "sceneNpc", npc: { name: "Ostrin", portrait: face, notes: "PRIVATE-zq he lies" } })).t, "update");
  for (const p of [pat, sam]) {
    assert.equal((await get(port, path(picture), p.token)).status, 200);
    assert.equal((await get(port, path(face), p.token)).status, 200);
    assert.equal((await get(port, path(unused), p.token)).status, 404, "a file nothing they were sent names");
  }
  // Their words go to everyone; a player's line out of character is signed with the name they joined by.
  const n = sam.got.length;
  await act(pat, { type: "say", as: null, text: "brb", userName: "Ostrin" });
  const line = await until(() => sam.got.slice(n).find((m) => m.t === "update" && m.events?.some((e) => e.type === "say")));
  assert.equal(line.events.find((e) => e.type === "say").name, "Pat");
  assert.match((await act(pat, { type: "say", as: "npc1", text: "I am the mayor" })).error, /your own character/);
  // Taken away: the portrait with its NPC, the picture with the scene.
  await act(dm, { type: "sceneNpc", npc: { id: "npc1" }, remove: true });
  assert.equal((await get(port, path(face), pat.token)).status, 404);
  assert.equal((await get(port, path(picture), pat.token)).status, 200);
  await act(dm, { type: "endScene" });
  assert.equal((await get(port, path(picture), pat.token)).status, 404);
  await new Promise((r) => setTimeout(r, 100));
  for (const p of [pat, sam]) {
    assert.ok(!p.got.some((m) => JSON.stringify(m).includes("PRIVATE-zq")));
    p.send({ t: "history", limit: 200 });
    const h = await until(() => p.got.findLast((m) => m.t === "history" && !m.recent));
    assert.ok(!JSON.stringify(h).includes("PRIVATE-zq"));
    assert.ok(h.entries.some((e) => e.type === "say" && e.text === "brb"), "the transcript is in the record players read");
  }
  for (const c of [dm, pat, sam]) c.ws.close();
});

test("notes: the DM's goes only to a player at this table, and reaches no one else", async () => {
  const { port } = await start();
  const { dm, pat, sam } = await table(port);
  assert.match((await act(dm, { type: "note", to: "someone-else", text: "hi" })).error, /isn't at this table/);
  assert.match((await act(dm, { type: "note", to: dm.id, text: "hi" })).error, /isn't at this table/);
  const n = sam.got.length;
  await act(dm, { type: "note", to: pat.id, text: "Only you smell smoke" });
  await until(() => pat.got.some((m) => JSON.stringify(m).includes("Only you smell smoke")));
  await act(pat, { type: "note", to: "dm", text: "I take the ring" });
  await until(() => dm.got.some((m) => JSON.stringify(m).includes("I take the ring")));
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(!sam.got.slice(n).some((m) => /smell smoke|take the ring/.test(JSON.stringify(m))));
  // Nor in the record Sam can read.
  sam.send({ t: "history", limit: 200 });
  const h = await until(() => sam.got.findLast((m) => m.t === "history" && !m.recent));
  assert.ok(!/smell smoke|take the ring/.test(JSON.stringify(h)));
  for (const c of [dm, pat, sam]) c.ws.close();
});

test("the page may show pictures from blob: URLs, and files of a table that is gone are cleared at start", async () => {
  const { port, data } = await start();
  const res = await fetch(url(port, "/api/ping"));
  assert.match(res.headers.get("content-security-policy"), /img-src 'self' data: blob:/);
  // A folder of files whose table no longer exists.
  const { dm, code } = await table(port);
  await upload(port, code, dm.token, PNG);
  dm.ws.close();
  const orphan = join(data, "assets", "QQQQQQ");
  createAssets({ dir: join(data, "assets") }).put("QQQQQQ", PNG);
  assert.ok(existsSync(orphan));
  await started.at(-1).stop();                                    // saves and exits; its folder is kept for the next one
  const again = await startServer({ data });
  assert.ok(!existsSync(orphan), "the orphan folder is gone");
  assert.ok(existsSync(join(data, "assets", code)), "the live table's files are kept");
});

test("pack: files for an export as base64 with their records, those the game uses first, within a limit", () => {
  const a = createAssets({ dir: tempDir() });
  const one = a.put("ABCDEF", PNG, { name: "one" }).record, two = a.put("ABCDEF", JPEG, { name: "two" }).record, three = a.put("ABCDEF", WEBP, { name: "three" }).record;
  const all = a.pack("ABCDEF");
  assert.deepEqual(all.assets.map((x) => x.record), [one, two, three].sort((x, y) => String(x.when).localeCompare(String(y.when))));
  assert.deepEqual(all.skipped, []);
  assert.ok(Buffer.from(all.assets.find((x) => x.record.id === two.id).data, "base64").equals(JPEG));
  // The one the game refers to goes first, and a file that would pass the limit is left out while a later, smaller one still goes in.
  const tight = a.pack("ABCDEF", { limit: JPEG.length + PNG.length, first: new Set([two.id]) });
  assert.equal(tight.assets[0].record.id, two.id);
  assert.equal(tight.assets.reduce((n, x) => n + Buffer.from(x.data, "base64").length, 0) <= JPEG.length + PNG.length, true);
  assert.deepEqual([...tight.assets.map((x) => x.record.id), ...tight.skipped.map((r) => r.id)].sort(), [one.id, two.id, three.id].sort());
  assert.ok(tight.skipped.length >= 1);
  // Not a table of ours: nothing, and no path from the code.
  assert.deepEqual(a.pack("../etc"), { assets: [], skipped: [], limit: a.pack("../etc").limit });
});
