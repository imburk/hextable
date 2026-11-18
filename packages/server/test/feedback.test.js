// POST /feedback against the real server (docs/specs/feedback.md): what is stored, what is refused, the limits, the rotation,
// and the optional GitHub forwarding with a stub server standing in for GitHub.
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, request } from "node:http";
import { join } from "node:path";
import { after, test } from "node:test";
import { startServer, stopAll } from "./helpers.js";
import { issueBody, issueTitle, fence } from "../src/feedback.js";

after(stopAll);
const GOOD = () => ({ v: 1, kind: "bug", comment: "The door will not open.", sentAt: "2026-11-15T10:00:00.000Z", build: "v12", mode: "solo", role: "dm", renderer: "three", theme: "classic", grid: "hex", viewport: { w: 390, h: 844 }, touch: true, ua: "Mozilla/5.0 test", lang: "en-GB",
  context: { log: ["Round 1: Tor's turn"], actions: [{ type: "move", args: { actor: "fighter", to: { q: 1, r: 2 } }, answer: "accepted" }], fight: { on: true, round: 1, turn: "mine" }, character: { cls: "Fighter", level: 1, conditions: [] }, map: "valley", errors: [] } });
const post = (port, body, headers = {}) => fetch(`http://localhost:${port}/feedback`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const lines = (data) => (existsSync(join(data, "feedback.jsonl")) ? readFileSync(join(data, "feedback.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
const until = async (fn, ms = 5000) => { for (const end = Date.now() + ms; Date.now() < end;) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 20)); } throw new Error("timed out"); };

test("a valid report is stored as one line and answered with a reference; CORS is open for this route only", async () => {
  const s = await startServer({ stderr: "pipe" });
  const r = await post(s.port, GOOD(), { origin: "https://example.github.io" });
  assert.equal(r.status, 201);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  assert.equal(r.headers.get("access-control-allow-credentials"), null);
  const { ref } = await r.json();
  assert.match(ref, /^FB-[0-9A-F]{6}$/);
  const l = lines(s.data);
  assert.equal(l.length, 1);
  assert.equal(l[0].ref, ref);
  assert.deepEqual(l[0].report, GOOD());
  const pre = await fetch(`http://localhost:${s.port}/feedback`, { method: "OPTIONS", headers: { origin: "https://x.example", "access-control-request-method": "POST", "access-control-request-headers": "content-type" } });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get("access-control-allow-headers"), /content-type/);
  assert.equal((await fetch(`http://localhost:${s.port}/api/ping`)).headers.get("access-control-allow-origin"), null);
  assert.equal((await fetch(`http://localhost:${s.port}/feedback`)).status, 405);
});

test("refused reports write nothing: oversize, wrong types, unknown fields, bad JSON, wrong content type", async () => {
  const s = await startServer({ env: { LIMIT_FEEDBACK_MINUTE: "1000", LIMIT_FEEDBACK_HOUR: "1000" } });
  const bad = [];
  const mod = (f) => { const g = GOOD(); f(g); return g; };
  bad.push(["not json", "{nope", 400]);
  bad.push(["a list", "[]", 400]);
  bad.push(["unknown field", mod((g) => { g.seed = 123; }), 400]);
  bad.push(["unknown nested field", mod((g) => { g.context.state = {}; }), 400]);
  bad.push(["unknown field in a log entry's action", mod((g) => { g.context.actions[0].name = "x"; }), 400]);
  bad.push(["comment is a number", mod((g) => { g.comment = 5; }), 400]);
  bad.push(["empty comment", mod((g) => { g.comment = ""; }), 400]);
  bad.push(["comment over 2000", mod((g) => { g.comment = "x".repeat(2001); }), 400]);
  bad.push(["bad kind", mod((g) => { g.kind = "rant"; }), 400]);
  bad.push(["31 log lines", mod((g) => { g.context.log = Array(31).fill("x"); }), 400]);
  bad.push(["a log line of 301", mod((g) => { g.context.log = ["x".repeat(301)]; }), 400]);
  bad.push(["action text with spaces", mod((g) => { g.context.actions[0].args.text = "a typed sentence"; }), 400]);
  bad.push(["viewport not whole", mod((g) => { g.viewport.w = 1.5; }), 400]);
  bad.push(["table code instead of a hash", mod((g) => { g.table = "ABC123"; }), 400]);
  bad.push(["control character", mod((g) => { g.ua = "a\u0000b"; }), 400]);
  for (const [what, body, status] of bad) { const r = await post(s.port, body); assert.equal(r.status, status, what); assert.ok((await r.json()).error, what); }
  assert.equal((await post(s.port, "{}", { "content-type": "text/plain" })).status, 415);
  const big = await post(s.port, JSON.stringify({ ...GOOD(), comment: "x".repeat(30 * 1024) }));
  assert.equal(big.status, 413);
  assert.deepEqual(lines(s.data), []);
  assert.equal(existsSync(join(s.data, "feedback.1.jsonl")), false);
});

test("the body is cut off while it is read: a chunked body past 24 KB is refused without a length to go by", async () => {
  const s = await startServer();
  const status = await new Promise((resolve, reject) => {
    const req = request({ port: s.port, path: "/feedback", method: "POST", headers: { "content-type": "application/json", "transfer-encoding": "chunked" } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.on("error", () => resolve("closed"));
    for (let i = 0; i < 10; i++) req.write("x".repeat(4096));
    req.end();
  });
  assert.ok(status === 413 || status === "closed", String(status));
  assert.deepEqual(lines(s.data), []);
});

test("5 a minute and 30 an hour per address; a refused one is not stored", async () => {
  const s = await startServer();
  for (let i = 0; i < 5; i++) assert.equal((await post(s.port, GOOD())).status, 201);
  const r = await post(s.port, GOOD());
  assert.equal(r.status, 429);
  assert.equal(lines(s.data).length, 5);
  const t = await startServer({ env: { LIMIT_FEEDBACK_MINUTE: "100", LIMIT_FEEDBACK_HOUR: "7" } });
  for (let i = 0; i < 7; i++) assert.equal((await post(t.port, GOOD())).status, 201);
  assert.equal((await post(t.port, GOOD())).status, 429);
});

test("the address is the socket's unless TRUST_PROXY says otherwise (the server's own logic)", async () => {
  const s = await startServer();
  for (let i = 0; i < 5; i++) assert.equal((await post(s.port, GOOD(), { "x-forwarded-for": `9.9.9.${i}` })).status, 201);
  assert.equal((await post(s.port, GOOD(), { "x-forwarded-for": "8.8.8.8" })).status, 429);       // a forged header does not buy a new budget
  const p = await startServer({ env: { TRUST_PROXY: "1" } });
  for (let i = 0; i < 5; i++) assert.equal((await post(p.port, GOOD(), { "x-forwarded-for": "7.7.7.7" })).status, 201);
  assert.equal((await post(p.port, GOOD(), { "x-forwarded-for": "7.7.7.7" })).status, 429);
  assert.equal((await post(p.port, GOOD(), { "x-forwarded-for": "7.7.7.8" })).status, 201);
});

test("a full file is kept and a new one started; when every place is taken new reports are refused and nothing older is deleted", async () => {
  const s = await startServer({ stderr: "pipe", env: { FEEDBACK_MAX_BYTES: "3000", FEEDBACK_FILES: "3", LIMIT_FEEDBACK_MINUTE: "1000", LIMIT_FEEDBACK_HOUR: "1000" } });
  const genuine = await post(s.port, { ...GOOD(), comment: "GENUINE first report" });
  assert.equal(genuine.status, 201);
  const codes = [];
  for (let i = 0; i < 30; i++) codes.push((await post(s.port, { ...GOOD(), comment: `junk ${i} ${"y".repeat(300)}` })).status);
  assert.ok(codes.includes(503), "the places run out");
  assert.ok(codes.slice(codes.indexOf(503)).every((c) => c === 503), "and stay out");
  const first = existsSync(join(s.data, "feedback.1.jsonl")) ? readFileSync(join(s.data, "feedback.1.jsonl"), "utf8") : "";
  assert.ok(first.includes("GENUINE first report"), "the earliest report is still there");
  assert.ok(!existsSync(join(s.data, "feedback.3.jsonl")), "no more than 3 files");
  for (const f of ["feedback.jsonl", "feedback.1.jsonl", "feedback.2.jsonl"]) assert.ok(statSync(join(s.data, f)).size <= 3000, f);
  const body = await (await post(s.port, GOOD())).json();
  assert.match(body.error, /Copy it/);
  assert.match(s.stderr(), /are full/);
});

test("junk the headers give away does not spend an address's budget", async () => {
  const s = await startServer();
  for (let i = 0; i < 8; i++) assert.equal((await post(s.port, "{}", { "content-type": "text/plain" })).status, 415);
  assert.equal((await post(s.port, GOOD())).status, 201);
});

test("an unknown field's name is not echoed", async () => {
  const s = await startServer();
  const r = await post(s.port, { ...GOOD(), "<img src=x onerror=alert(1)>": 1 });
  assert.equal(r.status, 400);
  assert.ok(!(await r.text()).includes("img"));
});

test("a /64 of IPv6 addresses is one address for the feedback limit; IPv4 stays one by one", async () => {
  const s = await startServer({ env: { TRUST_PROXY: "1" } });
  const codes = [];
  for (const i of [1, 2, 3, 4, 5, 6, 7, 8]) codes.push((await post(s.port, GOOD(), { "x-forwarded-for": `2001:db8:1:2::${i}` })).status);
  assert.deepEqual(codes, [201, 201, 201, 201, 201, 429, 429, 429]);
  assert.equal((await post(s.port, GOOD(), { "x-forwarded-for": "2001:db8:1:3::1" })).status, 201);       // another /64
  assert.equal((await post(s.port, GOOD(), { "x-forwarded-for": "7.7.7.1" })).status, 201);
});

test("rateKey: an IPv6 address is its /64, however it is written", async () => {
  const { rateKey } = await import("../src/limits.js");
  assert.equal(rateKey("2001:db8:1:2::5"), rateKey("2001:0db8:0001:0002:ffff:0:0:1"));
  assert.notEqual(rateKey("2001:db8:1:2::5"), rateKey("2001:db8:1:3::5"));
  assert.equal(rateKey("::1"), rateKey("0:0:0:0::9"));
  assert.equal(rateKey("1.2.3.4"), "1.2.3.4");
});

test("the server as a whole files at most the hourly cap of issues; the rest are stored and not forwarded", async () => {
  const gh = await stub();
  const s = await startServer({ stderr: "pipe", env: { FEEDBACK_GITHUB_REPO: "owner/repo", FEEDBACK_GITHUB_TOKEN: TOKEN, FEEDBACK_GITHUB_API: `http://127.0.0.1:${gh.port}`, LIMIT_FEEDBACK_FORWARD_HOUR: "3", LIMIT_FEEDBACK_MINUTE: "100", LIMIT_FEEDBACK_HOUR: "100" } });
  for (let i = 0; i < 8; i++) assert.equal((await post(s.port, { ...GOOD(), comment: `n ${i}` })).status, 201);
  await until(() => gh.got.length >= 3);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(gh.got.length, 3);
  assert.equal(lines(s.data).length, 8);
  assert.match(s.stderr(), /limit on GitHub issues/);
  const d = await startServer({ env: { FEEDBACK_GITHUB_REPO: "owner/repo", FEEDBACK_GITHUB_TOKEN: TOKEN, FEEDBACK_GITHUB_API: `http://127.0.0.1:${gh.port}`, LIMIT_FEEDBACK_FORWARD_DAY: "2", LIMIT_FEEDBACK_MINUTE: "100", LIMIT_FEEDBACK_HOUR: "100" } });
  const before = gh.got.length;
  for (let i = 0; i < 5; i++) await post(d.port, GOOD());
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(gh.got.length - before, 2);
  gh.close();
});

test("an issue title loses bidi controls and issue references", () => {
  const t = issueTitle({ kind: "bug", comment: "\u202eGH-9 see \u200bfoo" });
  assert.doesNotMatch(t, /[\u202e\u200b]|GH-9/);
});

// A stub standing in for GitHub: records what it is sent and answers as told.
function stub(answer = (req, res) => res.writeHead(201, { "content-type": "application/json" }).end("{}")) {
  const got = [];
  const server = createServer((req, res) => {
    let body = ""; req.on("data", (d) => (body += d));
    req.on("end", () => { got.push({ url: req.url, auth: req.headers.authorization, body: JSON.parse(body || "{}") }); answer(req, res); });
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r({ got, port: server.address().port, close: () => server.close() })));
}
const HOSTILE = "hi @someone and #12 </details> ```` ```\n```\n## heading [x](http://evil.example) <img src=x onerror=1> `tick`";
const TOKEN = "ghp_SECRETSECRETSECRET1234567890";

test("with a repo and token set, the report is also filed as a labelled issue; hostile text stays inside fenced blocks", async () => {
  const gh = await stub();
  const s = await startServer({ stderr: "pipe", env: { FEEDBACK_GITHUB_REPO: "owner/repo", FEEDBACK_GITHUB_TOKEN: TOKEN, FEEDBACK_GITHUB_API: `http://127.0.0.1:${gh.port}` } });
  const r = await post(s.port, { ...GOOD(), comment: HOSTILE, context: { ...GOOD().context, log: ["@someone </details> ```"] } });
  const text = await r.text();
  assert.equal(r.status, 201);
  await until(() => gh.got.length === 1);
  const g = gh.got[0];
  assert.equal(g.url, "/repos/owner/repo/issues");
  assert.equal(g.auth, `Bearer ${TOKEN}`);
  assert.deepEqual(g.body.labels, ["feedback"]);
  assert.match(g.body.title, /^Bug: hi someone and 12/);
  assert.doesNotMatch(g.body.title, /[@#<>`\[\]]/);
  assert.ok(g.body.title.length <= 6 + 60 + 2);
  // Outside the fenced blocks there is only the report's own fixed text.
  const outside = [], inFence = [];
  let fenceStr = null;
  for (const line of g.body.body.split("\n")) {
    if (fenceStr === null) { const m = /^(`{3,})(\w*)$/.exec(line); if (m) fenceStr = m[1]; else outside.push(line); }
    else if (line === fenceStr) fenceStr = null;
    else inFence.push(line);
  }
  assert.equal(fenceStr, null, "every fence is closed by its own fence");
  const out = outside.join("\n");
  assert.doesNotMatch(out, /someone|evil|onerror|heading|tick/);
  assert.equal((out.match(/<\/details>/g) ?? []).length, 1, "only our own </details>");
  assert.ok(inFence.join("\n").includes("@someone"));
  // The token is in no response and no log line.
  assert.ok(!text.includes(TOKEN));
  await new Promise((r2) => setTimeout(r2, 100));
  assert.ok(!s.stderr().includes(TOKEN));
  assert.equal(lines(s.data).length, 1);
  gh.close();
});

test("a failing, refusing or silent GitHub never loses the local line or reaches the player, and the token is not logged", async () => {
  for (const [what, answer] of [["refuses", (q, res) => res.writeHead(403).end(`bad credentials ${TOKEN}`)], ["hangs", () => {}]]) {
    const gh = await stub(answer);
    const s = await startServer({ stderr: "pipe", env: { FEEDBACK_GITHUB_REPO: "owner/repo", FEEDBACK_GITHUB_TOKEN: TOKEN, FEEDBACK_GITHUB_API: `http://127.0.0.1:${gh.port}`, FEEDBACK_GITHUB_TIMEOUT_MS: "300" } });
    const r = await post(s.port, GOOD());
    const body = await r.text();
    assert.equal(r.status, 201, what);
    assert.ok(!body.includes("GitHub") && !body.includes(TOKEN), what);
    assert.equal(lines(s.data).length, 1, what);
    await until(() => /feedback: .*GitHub/.test(s.stderr()), 4000);
    assert.ok(!s.stderr().includes(TOKEN), what);
    gh.close();
  }
  const dead = await startServer({ stderr: "pipe", env: { FEEDBACK_GITHUB_REPO: "owner/repo", FEEDBACK_GITHUB_TOKEN: TOKEN, FEEDBACK_GITHUB_API: "http://127.0.0.1:1" } });
  assert.equal((await post(dead.port, GOOD())).status, 201);
  await until(() => /could not file/.test(dead.stderr()));
  assert.ok(!dead.stderr().includes(TOKEN));
});

test("nothing is filed when only one of the two settings is given, and the server says so", async () => {
  const gh = await stub();
  const s = await startServer({ stderr: "pipe", env: { FEEDBACK_GITHUB_REPO: "owner/repo", FEEDBACK_GITHUB_API: `http://127.0.0.1:${gh.port}` } });
  assert.equal((await post(s.port, GOOD())).status, 201);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(gh.got.length, 0);
  assert.match(s.stderr(), /set both FEEDBACK_GITHUB_REPO/);
  gh.close();
});

test("issueBody: a comment of backticks cannot close its fence", () => {
  const c = "```\n````\n`````` end";
  const body = issueBody({ ...GOOD(), comment: c }, "FB-000000");
  const f = fence(c, "text");
  assert.ok(f.startsWith("`".repeat(7)));
  assert.ok(body.includes(f));
  assert.equal(issueTitle({ kind: "idea", comment: "@a #1 <b>" + "z".repeat(100) }).length <= 6 + 60, true);
});
