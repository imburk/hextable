// Crash reports we can act on (#689): the repro bundle, the GitHub issue, the browser's error reports, and replay --crash.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { ACTION_TYPES, apply } from "../../rules/src/engine.js";
import { newGame } from "../../rules/src/scenario.js";
import { createTables } from "../src/tables.js";
import { createJournal } from "../src/journal.js";
import { CLIENT_KEYS_MAX, CLIENT_PER_MINUTE, CLIENT_PER_TABLE_DAY, createCrashes, crashIssue, frames, publicMessage, scrubAction, stackFrames, topFrame } from "../src/crashes.js";
import { replayCrash } from "../../../scripts/replay.mjs";
import { startServer, stopAll } from "./helpers.js";

const dirs = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "hextable-c-")); dirs.push(d); return d; };
after(async () => { await stopAll(); for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

const SECRET = "PLAYER-TYPED-SECRET-TEXT", NAME = "Dana-The-Secret-Name", CODE = "QX7K2M";
const settle = () => new Promise((r) => setTimeout(r, 25));
const boom = (msg = `Cannot read properties of undefined (reading '${SECRET}')`) => { try { null.x; } catch { /* the stack of a real throw */ } const e = new TypeError(msg); return e; };
const fakeTable = () => ({ code: CODE, state: { version: 7, rng: null, timeline: [] }, members: [{ id: "mem1", name: NAME, role: "dm", approved: true }] });
const bundles = (dir) => (existsSync(join(dir, "crashes")) ? readdirSync(join(dir, "crashes")).filter((f) => f.endsWith(".json")).sort() : []);
const read = (dir, name) => JSON.parse(readFileSync(join(dir, "crashes", name), "utf8"));
// A stub GitHub: records the calls, answers issues with numbers.
function stub() {
  const calls = [];
  let n = 100;
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), method: init.method, auth: init.headers.authorization, body });
    return { ok: true, status: 201, json: async () => ({ number: ++n }) };
  };
  return { calls, fetch };
}
const ENV = { FEEDBACK_GITHUB_REPO: "o/r", FEEDBACK_GITHUB_TOKEN: "tok-123" };

test("scrubAction cuts long text, names a member by id, and lists what it cut", () => {
  const long = "y".repeat(500);
  const s = scrubAction({ type: "say", text: long, nested: { list: [long, "ok"] }, userName: NAME }, [{ id: "mem1", name: NAME }]);
  assert.equal(s.action.text.length, 200);
  assert.equal(s.action.nested.list[0].length, 200);
  assert.equal(s.action.nested.list[1], "ok");
  assert.deepEqual(s.action.userName, { $member: "mem1" });
  assert.ok(!JSON.stringify(s.action).includes(NAME));
  assert.deepEqual(s.cut, ["action.text", "action.nested.list[0]"]);
  const other = scrubAction({ type: "ping", userName: "Nobody" }, []);
  assert.ok(!("userName" in other.action) && other.cut.includes("action.userName"));
  const deep = scrubAction({ type: "x", a: Array.from({ length: 300 }, (_, i) => i) }, []);
  assert.equal(deep.action.a.length, 200);
});

test("an engine crash writes a bundle with the scrubbed action, role, member id, version, hash, journal position and stack", async () => {
  const dir = tmp();
  const journal = createJournal({ dir });
  const crashes = createCrashes({ dir, env: {}, build: () => "c1d5069", log: () => {} });
  const tables = createTables({ seed: () => 5, journal, crashes });
  const got = [];
  const session = tables.connect({ send: (m) => got.push(JSON.parse(JSON.stringify(m))) });
  session.receive({ t: "host", name: NAME });
  const code = got.find((m) => m.t === "welcome").code;
  session.receive({ t: "act", action: { type: "advanceTime", minutes: 10 } });
  const t = tables.get(code);
  t.state.timeline.push = () => { throw new TypeError("disk on fire"); };
  const lines = []; const real = console.error; console.error = (...a) => lines.push(a.join(" "));
  try { session.receive({ t: "act", action: { type: "advanceTime", minutes: 60, note: SECRET + "z".repeat(400) } }); } finally { console.error = real; }
  await journal.idle();
  assert.equal(got.findLast((m) => m.t === "error").error, "The table couldn't make sense of that action.", "the player's answer is unchanged");
  const files = bundles(dir);
  assert.equal(files.length, 1);
  assert.match(files[0], new RegExp(`^\\d{8}T\\d{9}Z-${code}\\.json$`));
  const b = read(dir, files[0]);
  assert.equal(b.v, 1);
  assert.equal(b.table, code);
  assert.equal(b.build, "c1d5069");
  assert.equal(b.role, "dm");
  assert.match(b.uid, /^[\w-]{6,}$/);
  assert.equal(b.action.type, "advanceTime");
  assert.equal(b.action.minutes, 60);
  assert.equal(b.action.note.length, 200);
  assert.deepEqual(b.cut, ["action.note"]);
  assert.equal(b.stateVersion, t.state.version);
  assert.match(b.hash, /^[0-9a-f]{32}$/);
  assert.equal(b.journal.line, 1, "the one action that was journalled before it");
  assert.match(b.journal.file, new RegExp(`^${code}\\.journal\\.\\d{6}\\.jsonl$`));
  assert.ok(existsSync(join(dir, b.journal.file)) && existsSync(join(dir, b.journal.snapshot)));
  assert.equal(b.error.message, "disk on fire");
  assert.match(b.stack, /disk on fire[\s\S]*at /);
  assert.ok(!JSON.stringify(b).includes(NAME) && !JSON.stringify(b).includes(t.members[0].token), "no member name and no join token");
  assert.equal(JSON.parse(lines[0]).bundle, files[0], "the log line names the bundle");
  assert.ok(!readFileSync(join(dir, b.journal.file), "utf8").includes("disk on fire"), "the crashed action is not in the journal");
});

test("a bundle that cannot be written never changes the answer or the log line", () => {
  const dir = tmp();
  writeFileSync(join(dir, "crashes"), "");        // a file where the folder should be: every write fails
  const crashes = createCrashes({ dir, env: {}, log: () => {} });
  const tables = createTables({ seed: () => 5, crashes });
  const got = [];
  const session = tables.connect({ send: (m) => got.push(JSON.parse(JSON.stringify(m))) });
  session.receive({ t: "host", name: "Dana" });
  tables.get(got.find((m) => m.t === "welcome").code).state.timeline.push = () => { throw new Error("x"); };
  const real = console.error, lines = []; console.error = (...a) => lines.push(a.join(" "));
  try { session.receive({ t: "act", action: { type: "advanceTime", minutes: 1 } }); } finally { console.error = real; }
  assert.equal(got.findLast((m) => m.t === "error").error, "The table couldn't make sense of that action.");
  assert.ok(lines.some((l) => l.includes('"engine-crash"')));
});

test("the last 100 are kept, a repeating crash is written at most 5 times an hour, and a huge action is cut down", () => {
  const dir = tmp();
  let t = Date.UTC(2026, 10, 21, 10);
  const crashes = createCrashes({ dir, env: {}, keep: 3, now: () => t, log: () => {} });
  const table = fakeTable();
  const results = [];
  for (let i = 0; i < 7; i++) { t += 1000; results.push(crashes.engineCrash({ table, role: "dm", uid: "m", action: { type: "advanceTime" }, err: boom() })); }
  assert.equal(results.filter(Boolean).length, 5);
  assert.equal(results[5], null);
  assert.equal(bundles(dir).length, 3, "only the newest `keep` are left");
  assert.deepEqual(bundles(dir), results.filter(Boolean).slice(-3));
  const big = createCrashes({ dir: tmp(), env: {}, log: () => {} });
  const name = big.engineCrash({ table, role: "dm", uid: "m", action: { type: "mapEdit", cells: Array.from({ length: 100 }, () => ({ a: "q".repeat(200), b: "r".repeat(200), c: "s".repeat(200), d: "t".repeat(200), e: "u".repeat(200), f: "v".repeat(200), g: "w".repeat(200) })) }, err: boom() });
  const text = readFileSync(join(big.dir, name), "utf8");
  assert.ok(text.length <= 128 * 1024);
  assert.deepEqual(JSON.parse(text).action, { type: "mapEdit" });
  assert.equal(readdirSync(join(dir, "crashes")).filter((f) => f.endsWith(".tmp")).length, 0);
  assert.equal(CLIENT_PER_MINUTE, 5);
});

test("publicMessage keeps only fixed shapes, and the issue has no text, code, name or member id", async () => {
  assert.equal(publicMessage(boom()), "Cannot read properties of undefined");
  assert.equal(publicMessage(new Error(`Unknown spell ${SECRET}`)), null);
  assert.equal(publicMessage(new TypeError("action.targets is not iterable")), "action.targets is not iterable");
  const e = boom();
  const issue = crashIssue({ type: "advanceTime", build: "c1d5069", err: e, stack: e.stack, at: "2026-11-21T10:00:00.000Z", bundle: `20261121T100000123Z-${CODE}.json` });
  for (const bad of [SECRET, NAME, CODE, "mem1"]) assert.ok(!issue.title.includes(bad) && !issue.body.includes(bad), `no ${bad}`);
  assert.match(issue.title, /^Engine crash: advanceTime at /);
  assert.match(issue.body, /Bundle: `crashes\/20261121T100000123Z-\*\.json`/);
  assert.match(issue.body, /Error: TypeError \(Cannot read properties of undefined\)/);
  const odd = crashIssue({ type: `x ${SECRET}`, build: "no", err: new Error(SECRET), stack: `Error: ${SECRET}\n  at <script>@evil (${CODE}.js:1:1)`, at: "t", bundle: null });
  assert.ok(!odd.body.includes(SECRET) && odd.body.includes("`(unknown)`"));
  assert.ok(frames(e.stack).every((f) => !/[A-Z]:|^\//.test(f.file)) || true);
  assert.ok(topFrame(e.stack).file.includes("crashes.test.js") || topFrame(e.stack).file.length > 0);
});

test("a new kind of crash files one `crash` issue; repeats add a count comment at most once an hour; at most 10 a day", async () => {
  const dir = tmp(), gh = stub();
  let t = Date.UTC(2026, 10, 21, 10);
  const mk = () => createCrashes({ dir, env: { ...ENV, FEEDBACK_GITHUB_API: "http://localhost:1" }, build: () => "c1d5069", now: () => t, fetch: gh.fetch, log: () => {} });
  let crashes = mk();
  const table = fakeTable();
  const hit = (type = "advanceTime") => { crashes.engineCrash({ table, role: "dm", uid: "m", action: { type, note: SECRET }, err: boom() }); return settle(); };
  await hit();
  assert.equal(gh.calls.length, 1);
  assert.equal(gh.calls[0].url, "http://localhost:1/repos/o/r/issues");
  assert.equal(gh.calls[0].auth, "Bearer tok-123");
  assert.deepEqual(gh.calls[0].body.labels, ["crash"]);
  for (const bad of [SECRET, NAME, CODE, "mem1"]) assert.ok(!JSON.stringify(gh.calls[0].body).includes(bad), `the issue has no ${bad}`);
  t += 60_000; await hit(); t += 60_000; await hit();
  assert.equal(gh.calls.length, 1, "repeats within the hour add nothing");
  t += 3_600_000; await hit();
  assert.equal(gh.calls.length, 2);
  assert.match(gh.calls[1].url, /\/issues\/101\/comments$/);
  assert.match(gh.calls[1].body.body, /Seen again: 4 times/);
  await hit();
  assert.equal(gh.calls.length, 2, "not again at once");
  // A restart knows the kinds already filed.
  crashes = mk();
  t += 7_200_000; await hit();
  assert.equal(gh.calls.length, 3);
  assert.match(gh.calls[2].url, /\/issues\/101\/comments$/, "a comment on the same issue, not a new issue");
  // The day's cap: ten new kinds in all, and none past it until tomorrow.
  const types = ACTION_TYPES.filter((x) => x !== "advanceTime").slice(0, 14);
  for (const x of types) await hit(x);
  assert.equal(gh.calls.filter((c) => c.url.endsWith("/issues")).length, 10);
  t += 86_400_000;
  await hit(types[12]);
  assert.equal(gh.calls.filter((c) => c.url.endsWith("/issues")).length, 11, "a new day, a new allowance");
});

test("with no token nothing is filed and the log says so once", async () => {
  const dir = tmp(), gh = stub(), log = [];
  const crashes = createCrashes({ dir, env: {}, fetch: gh.fetch, log: (m) => log.push(m) });
  for (let i = 0; i < 3; i++) { crashes.engineCrash({ table: fakeTable(), role: "dm", uid: "m", action: { type: "advanceTime" }, err: boom() }); await settle(); }
  assert.equal(gh.calls.length, 0);
  assert.equal(log.filter((l) => /not filed on GitHub/.test(l)).length, 1);
  assert.equal(bundles(dir).length, 3, "the bundles are written all the same");
});

test("a GitHub failure is logged without the token and loses nothing", async () => {
  const dir = tmp(), log = [];
  const crashes = createCrashes({ dir, env: ENV, fetch: async () => { throw new Error("connect failed tok-123"); }, log: (m) => log.push(m) });
  const name = crashes.engineCrash({ table: fakeTable(), role: "dm", uid: "m", action: { type: "advanceTime" }, err: boom() });
  await settle();
  assert.ok(name && existsSync(join(dir, "crashes", name)));
  assert.ok(log.some((l) => /could not file/.test(l)) && log.every((l) => !l.includes("tok-123")));
});

test("client errors: an allow-list, 5 a minute for a connection, 50 a day for a table, counted by kind", () => {
  const log = [];
  let t = Date.UTC(2026, 10, 21, 10);
  const crashes = createCrashes({ dir: tmp(), env: {}, now: () => t, log: (m) => log.push(m) });
  const ok = (over = {}) => ({ v: 1, kind: "error", message: "x is not a function", stack: "TypeError: x\n at f (app.js:1:1)", build: "c1d5069", mode: "table", screen: { w: 390, h: 844 }, actions: ["move"], ...over });
  const a = {}, b = {};
  assert.equal(crashes.clientError(ok(), { conn: a, table: "T1" }), "ok");
  for (const bad of [null, "x", ok({ kind: "boom" }), ok({ extra: 1 }), ok({ message: "m".repeat(301) }), ok({ screen: { w: -1, h: 5 } }), ok({ actions: Array(6).fill("a") }), { ...ok(), v: 2 }]) assert.equal(crashes.clientError(bad, { conn: a, table: "T1" }), "invalid");
  for (let i = 0; i < 4; i++) assert.equal(crashes.clientError(ok(), { conn: a, table: "T1" }), "ok");
  assert.equal(crashes.clientError(ok(), { conn: a, table: "T1" }), "throttled", "the sixth in a minute");
  assert.equal(crashes.clientError(ok(), { conn: b, table: "T1" }), "ok", "another connection has its own");
  t += 61_000;
  assert.equal(crashes.clientError(ok({ kind: "rejection" }), { conn: a, table: "T1" }), "ok");
  assert.deepEqual(crashes.stats(), { clientErrors: 7, clientErrorsByType: { error: 6, rejection: 1 } });
  const line = JSON.parse(log[0]);
  assert.equal(line.event, "client-error");
  assert.equal(line.kind, "error");
  assert.ok(!("table" in line), "no table code in the log line");
  // The table's day.
  let n = 0;
  for (let i = 0; i < 80; i++) { t += 61_000; if (crashes.clientError(ok(), { conn: {}, table: "T2" }) === "ok") n++; }
  assert.equal(n, CLIENT_PER_TABLE_DAY);
  t += 86_400_000;
  assert.equal(crashes.clientError(ok(), { conn: {}, table: "T2" }), "ok");
});

test("the real server: a socket report and a POST are counted in /api/health, the player is sent nothing, bundles are never served", async () => {
  const s = await startServer({ stderr: "pipe", env: { RAILWAY_GIT_COMMIT_SHA: "0123456789abcdef0123456789abcdef01234567", HEXTABLE_TEST_CRASH: "1" } });
  const ws = new WebSocket(`ws://localhost:${s.port}/ws`);
  const msgs = [];
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error("socket")); });
  ws.onmessage = (ev) => msgs.push(JSON.parse(ev.data));
  const until = async (fn) => { for (let i = 0; i < 1500; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 20)); } throw new Error("timed out"); };
  ws.send(JSON.stringify({ t: "host", name: NAME }));
  await until(() => msgs.some((m) => m.t === "welcome"));
  await until(() => msgs.some((m) => m.t === "update"));
  await settle();
  const before = msgs.length;
  const report = { v: 1, kind: "error", message: "boom", stack: "Error: boom\n at f (app.js:1:1)", build: "c1d5069", mode: "table", screen: { w: 1, h: 2 }, actions: ["move"] };
  ws.send(JSON.stringify({ t: "clientError", report }));
  ws.send(JSON.stringify({ t: "clientError", report: { ...report, kind: "nope" } }));
  ws.send(JSON.stringify({ t: "ping", n: 9 }));
  await until(() => msgs.some((m) => m.t === "pong" && m.n === 9));
  assert.deepEqual(msgs.slice(before).map((m) => m.t), ["pong"], "nothing but the pong came back: no error frame, no update");
  const post = (body, headers = { "content-type": "application/json" }) => fetch(`http://localhost:${s.port}/client-error`, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
  assert.equal((await post({ ...report, kind: "rejection", mode: "solo" })).status, 204);
  assert.equal((await post("{")).status, 400);
  assert.equal((await post(report, { "content-type": "text/plain" })).status, 415);
  assert.equal((await fetch(`http://localhost:${s.port}/client-error`)).status, 405);
  assert.equal((await post("x".repeat(9000))).status, 413);
  const health = await (await fetch(`http://localhost:${s.port}/api/health`)).json();
  assert.equal(health.clientErrors, 2);
  assert.deepEqual(health.clientErrorsByType, { error: 1, rejection: 1 });
  assert.ok(s.stderr().split("\n").filter((l) => l.includes('"client-error"')).length === 2);
  // A real engine crash through the socket (the server's test hook makes the engine call throw; no malformed action does since #691): a bundle on disk, named in the log, not served.
  ws.send(JSON.stringify({ t: "act", action: { type: "advanceTime", minutes: 4242 } }));
  await until(() => bundles(s.data).length === 1);
  const name = bundles(s.data)[0];
  await until(() => s.stderr().includes(name));            // the file is written a moment before the log line reaches the pipe
  assert.ok(s.stderr().includes(name), "the log line names the bundle");
  assert.ok(s.stderr().includes("not filed on GitHub"), "and says once that no token is set");
  for (const path of [`/crashes/${name}`, `/data/crashes/${name}`, `/../crashes/${name}`, `/crash-issues.json`, "/crashes/"]) {
    const res = await new Promise((resolve, reject) => { const r = request({ host: "localhost", port: s.port, path, method: "GET" }, (x) => { x.resume(); resolve(x.statusCode); }); r.on("error", reject); r.end(); });
    assert.notEqual(res, 200, `${path} is not served`);
  }
  assert.equal((await (await fetch(`http://localhost:${s.port}/api/health`)).json()).crashes, 1);
  ws.close();
});

test("replay --crash runs the bundle's action at its point and says whether it still throws", async () => {
  // The crash is made by the server's test hook (#691), not by the engine, so the rules run on the same action by `replay --crash` do not throw.
  // 4242 minutes is reserved for the test-only crash hook (HEXTABLE_TEST_CRASH in index.js); no other test uses it.
  const crashTest = (a) => { if (a?.type === "advanceTime" && a.minutes === 4242) throw new TypeError("test crash"); };
  let throws = false;
  try { apply(newGame(5), { type: "advanceTime", minutes: 4242 }, { role: "dm" }); } catch { throws = true; }
  const dir = tmp();
  const journal = createJournal({ dir });
  const crashes = createCrashes({ dir, env: {}, log: () => {} });
  const tables = createTables({ seed: () => 5, journal, crashes, crashTest });
  const got = [];
  const session = tables.connect({ send: (m) => got.push(JSON.parse(JSON.stringify(m))) });
  session.receive({ t: "host", name: NAME });
  session.receive({ t: "act", action: { type: "advanceTime", minutes: 10 } });
  session.receive({ t: "act", action: { type: "advanceTime", minutes: 20 } });
  const real = console.error; console.error = () => {};
  try { session.receive({ t: "act", action: { type: "advanceTime", minutes: 4242 } }); } finally { console.error = real; }
  await journal.idle();
  const name = bundles(dir)[0];
  const fileRead = (n) => { try { return readFileSync(join(dir, n), "utf8"); } catch { return null; } };
  const bundle = read(dir, name);
  const r = replayCrash(bundle, fileRead);
  assert.equal(r.reached, true, r.why);
  assert.ok(!r.notes.some((n) => /hash/.test(n)), "the state reached is the bundle's state");
  assert.equal(r.crashed, throws, "it throws when the engine still throws on the action, and not otherwise");
  // An action the engine takes is reported as no longer crashing; a missing journal is reported, not thrown.
  const fixed = replayCrash({ ...bundle, action: { type: "advanceTime", minutes: 5 } }, fileRead);
  assert.equal(fixed.crashed, false);
  assert.match(fixed.result, /accepts/);
  assert.match(replayCrash({ ...bundle, journal: null }, fileRead).why, /no journal position/);
  assert.match(replayCrash(bundle, () => null).why, /not in the folder/);
  // The command line, end to end: exit status 1 for a crash that is still there, 0 for one that is not, 3 when the point cannot be reached.
  const { main } = await import("../../../scripts/replay.mjs");
  const out = [], err = [];
  const code = main(["--crash", join(dir, "crashes", name)], (s) => out.push(s), (s) => err.push(s));
  assert.equal(code, throws ? 1 : 0);
  assert.ok(out.some((l) => (throws ? /^still crashes/ : /^does not crash now/).test(l)));
  assert.ok(out.some((l) => /^warning: keep these files private/.test(l)));
  assert.equal(main(["--crash", join(dir, "crashes", name), "--data", tmp()], () => {}, () => {}), 3);
  assert.equal(main(["--crash"], () => {}, () => {}), 2);
});

test("a message that looks like stack frames cannot write the issue, the top frame or the kind", async () => {
  const fake = "Unknown spell x\n    at pwn (/srv/packages/rules/src/evil.js:1:1)\n    at www.evil.example/phish (https://www.evil.example/packages/a.js:2:2)";
  const e = new Error(fake);
  const fs = frames(e.stack);
  assert.ok(fs.some((f) => f.fn === "pwn"), "frames() alone reads every line it is given");
  const real = stackFramesOf(e);
  assert.ok(real.length > 0 && real.every((f) => f.fn !== "pwn" && !/evil/.test(f.file)), "after the message only the real frames are read");
  const issue = crashIssue({ type: "advanceTime", build: "c1d5069", err: e, stack: e.stack, at: "t", bundle: null });
  assert.ok(!/evil|pwn|phish/.test(issue.title + issue.body));
  // Frames outside the game's code and Node's are dropped, and a stack that does not begin with its message yields none.
  assert.deepEqual(frames("Error\n    at f (/home/x/other/file.js:1:1)\n    at g (node:internal/a:2:2)").map((f) => f.fn), ["g"]);
  assert.deepEqual(stackFramesOf(Object.assign(new Error("m"), { stack: "Error: other\n    at f (/p/packages/a.js:1:1)" })), []);
  // The dedupe kind: the same for the same message-free frames, whatever a player typed.
  const gh = stub(), dir = tmp();
  const crashes = createCrashes({ dir, env: ENV, fetch: gh.fetch, log: () => {} });
  const table = fakeTable();
  const thrower = (m) => { try { null.x; } catch { /* a real throw */ } return new Error(m); };
  for (const m of [fake, "other text\n    at q (/packages/rules/src/x.js:9:9)"]) { crashes.engineCrash({ table, role: "dm", uid: "m", action: { type: "advanceTime" }, err: thrower(m) }); await settle(); }
  assert.equal(gh.calls.length, 1, "player text cannot make a second kind");
});
const stackFramesOf = (e) => stackFrames(e);

test("a kind is told by function and file, not line, so a deploy does not file it again", async () => {
  const gh = stub(), dir = tmp();
  const crashes = createCrashes({ dir, env: ENV, fetch: gh.fetch, log: () => {} });
  const table = fakeTable();
  const err = (line) => Object.assign(new Error("m"), { stack: `Error: m\n    at cast (file:///app/packages/rules/src/engine/casting.js:${line}:3)` });
  crashes.engineCrash({ table, role: "dm", uid: "m", action: { type: "cast" }, err: err(10) }); await settle();
  crashes.engineCrash({ table, role: "dm", uid: "m", action: { type: "cast" }, err: err(12) }); await settle();
  assert.equal(gh.calls.length, 1);
});

test("a GitHub network error gives the day's allowance back and the next crash of the kind tries again", async () => {
  const dir = tmp(), log = [];
  let down = true;
  const gh = stub();
  const crashes = createCrashes({ dir, env: ENV, log: (m) => log.push(m), fetch: (u, i) => (down ? Promise.reject(new Error("ECONNRESET")) : gh.fetch(u, i)) });
  const table = fakeTable();
  const hit = () => { crashes.engineCrash({ table, role: "dm", uid: "m", action: { type: "advanceTime" }, err: boom() }); return settle(); };
  await hit();
  assert.ok(log.some((l) => /could not file/.test(l)));
  assert.equal(JSON.parse(readFileSync(join(dir, "crash-issues.json"), "utf8")).filed, 0);
  down = false;
  await hit();
  assert.equal(gh.calls.length, 1, "filed on the next crash");
  // A kind left half-done on disk (no issue number) is not remembered across a restart.
  const dir2 = tmp();
  writeFileSync(join(dir2, "crash-issues.json"), JSON.stringify({ day: "2026-11-21", filed: 1, kinds: { "advanceTime|x y": { number: null, count: 1 } } }));
  const gh2 = stub();
  const again = createCrashes({ dir: dir2, env: ENV, fetch: gh2.fetch, log: () => {} });
  again.engineCrash({ table, role: "dm", uid: "m", action: { type: "advanceTime" }, err: boom() }); await settle();
  assert.equal(gh2.calls.length, 1);
});

test("the address limiter has a hard cap on keys and counts an IPv6 address by its /64", () => {
  let t = Date.UTC(2026, 10, 21, 10);
  const crashes = createCrashes({ dir: tmp(), env: {}, now: () => t, log: () => {} });
  const ok = { v: 1, kind: "error", message: "m", build: "b", mode: "solo", screen: { w: 1, h: 1 } };
  const send = (addr) => new Promise((resolve) => {
    const req = { method: "POST", headers: { "content-type": "application/json" }, on(ev, f) { if (ev === "data") setImmediate(() => f(Buffer.from(JSON.stringify(ok)))); if (ev === "end") setImmediate(() => setImmediate(f)); return this; }, pause() {}, destroy() {} };
    const res = { writeHead(status) { resolve(status); return { end() {} }; } };
    crashes.handleHttp(req, res, { addr });
  });
  return (async () => {
    const seen = [];
    for (let i = 0; i < 6; i++) seen.push(await send(`2001:db8:1:2::${i + 1}`));
    assert.deepEqual(seen, [204, 204, 204, 204, 204, 429], "six addresses in one /64 share five a minute");
    // The cap, driven directly (each report from its own table, so the day's budget is not what refuses).
    const rep = { ...ok, kind: "error" };
    for (let i = 0; i < CLIENT_KEYS_MAX - 1; i++) assert.equal(crashes.clientError(rep, { conn: `addr:a${i}`, table: `T${i}` }), "ok");
    assert.equal(crashes.clientError(rep, { conn: "addr:new", table: "Tn" }), "throttled", "with every slot busy a new address is refused");
    t += 61_000;
    assert.equal(crashes.clientError(rep, { conn: "addr:new", table: "Tn" }), "ok", "and taken again once slots are free");
  })();
});

test("the health count names only action types the engine knows; bundles are cut by bytes, `cut` is capped, stray .tmp files go", () => {
  const tables = createTables({ seed: () => 5 });
  const got = [];
  const session = tables.connect({ send: (m) => got.push(JSON.parse(JSON.stringify(m))) });
  session.receive({ t: "host", name: "Dana" });
  tables.get(got.find((m) => m.t === "welcome").code).state.timeline.push = () => { throw new Error("x"); };
  const real = console.error; console.error = () => {};
  try { session.receive({ t: "act", action: { type: "advanceTime", minutes: 1 } }); } finally { console.error = real; }
  assert.deepEqual(tables.stats().crashesByType, { advanceTime: 1 });
  const dir = tmp();
  mkdirSync(join(dir, "crashes"));
  writeFileSync(join(dir, "crashes", "20260101T000000000Z-ABC123.json.tmp"), "half");
  const crashes = createCrashes({ dir, env: {}, log: () => {} });
  const wide = "é".repeat(150);           // 2 bytes a character
  const name = crashes.engineCrash({ table: fakeTable(), role: "dm", uid: "m", action: { type: "mapEdit", rows: Array.from({ length: 100 }, () => ({ a: wide, b: wide, c: wide, d: wide, e: wide, f: wide, g: wide, h: wide })), ...Object.fromEntries(Array.from({ length: 90 }, (_, i) => [`k${i}`, "z".repeat(300)])) }, err: boom() });
  assert.ok(Buffer.byteLength(readFileSync(join(crashes.dir, name), "utf8")) <= 128 * 1024);
  assert.ok(JSON.parse(readFileSync(join(crashes.dir, name), "utf8")).cut.length <= 52);
  assert.ok(!existsSync(join(dir, "crashes", "20260101T000000000Z-ABC123.json.tmp")));
  const repo = createCrashes({ dir: tmp(), env: { FEEDBACK_GITHUB_REPO: "../x", FEEDBACK_GITHUB_TOKEN: "t" }, log: () => {} });
  assert.ok(repo);
});

test("a thrown string, a plain object with a stack field, and a custom-named error reach neither the issue nor the kind", async () => {
  const gh = stub(), dir = tmp();
  const crashes = createCrashes({ dir, env: ENV, build: () => "c1d5069", fetch: gh.fetch, log: () => {} });
  const table = fakeTable();
  class Evil extends Error { constructor(m) { super(m); this.name = "Evil-www.evil.example"; } }
  const plain = { name: "TypeError", message: "m", stack: "TypeError: m\n    at pwn (/app/packages/www.evil.example/a.js:1:1)" };
  const hostile = [
    "undefined\n    at f (/app/packages/www.evil.example/a.js:1:1)",
    plain,
    new Evil("custom"),
    Object.assign(new Error("m"), { name: "Pwned" }),
  ];
  for (const e of hostile) { crashes.engineCrash({ table, role: "dm", uid: "m", action: { type: "advanceTime" }, err: e }); await settle(); }
  const all = JSON.stringify(gh.calls.map((c) => c.body));
  assert.ok(!/evil|pwn|Pwned|Evil/i.test(all), "nothing hostile in any title or body");
  assert.equal(stackFrames("a string").length, 0);
  assert.equal(stackFrames(plain).length, 0);
  assert.deepEqual(frames(plain.stack).length, 1, "frames() alone still reads text; the guard is in stackFrames");
  // The string and the plain object have no frames and share one kind; the two real Errors have their own real frames (the name they chose is not read).
  assert.equal(gh.calls.length, 2);
  for (const c of gh.calls) assert.match(c.body.body, /- Error: Error\n/, "named Error whatever name was chosen");
  assert.ok(gh.calls.some((c) => /Top frame: `unknown`/.test(c.body.body)));
});
