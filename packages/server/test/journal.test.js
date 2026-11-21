// The per-table action journal (#659): what is written, what is not, rotation, a failed write, and replay through scripts/replay.mjs.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { main as replayMain, replayGame } from "../../../scripts/replay.mjs";
import { createJournal, hashState, journalFromEnv } from "../src/journal.js";
import { createTables } from "../src/tables.js";

const dirs = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "hextable-journal-")); dirs.push(d); return d; };
after(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

const KEY = "0123456789abcdef".repeat(4);
function client(tables) {
  const got = [];
  const session = tables.connect({ send: (m) => got.push(JSON.parse(JSON.stringify(m))) });
  return { got, say: (m) => session.receive(m), last: (t) => got.findLast((m) => m.t === t) };
}
function setup(journalOpts = {}, dir = tmp(), logs = [], tableOpts = {}) {
  const journal = createJournal({ dir, log: (l) => logs.push(l), ...(tableOpts.timelineCap !== undefined && { timelineCap: tableOpts.timelineCap }), ...journalOpts });
  const tables = createTables({ seed: () => 5, key: () => KEY, journal, ...tableOpts });
  const dm = client(tables);
  dm.say({ t: "host", name: "Dana-Secret" });
  const w = dm.last("welcome");
  return { journal, tables, dm, dir, logs, code: w.code, dmToken: w.token, table: tables.get(w.code) };
}
const join_ = (ctx, name) => {
  const p = client(ctx.tables);
  p.say({ t: "join", code: ctx.code, name });
  ctx.dm.say({ t: "approve", userId: p.last("welcome").userId, ok: true });
  return p;
};
const files = (dir, code, ext) => readdirSync(dir).filter((n) => n.startsWith(`${code}.journal.`) && n.endsWith(ext)).sort();
const lines = (dir, name) => readFileSync(join(dir, name), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

test("an accepted action is journalled with its role, member id, dice and state hash; a refused one is not", async () => {
  const c = setup();
  c.dm.say({ t: "act", action: { type: "check", actor: "rogue", skill: "stealth" } });
  c.dm.say({ t: "act", action: { type: "noSuchAction" } });
  c.dm.say({ t: "act", action: { type: "check", actor: "nobody", skill: "stealth" } });
  await c.journal.idle();
  const [name] = files(c.dir, c.code, ".jsonl");
  const [open, act, ...more] = lines(c.dir, name);
  assert.equal(more.length, 0, "only the accepted action");
  assert.equal(open.k, "open");
  assert.equal(act.k, "act");
  assert.equal(act.n, 1);
  assert.equal(act.role, "dm");
  assert.equal(act.uid, c.dm.last("welcome").userId);
  assert.equal(act.action.type, "check");
  assert.ok(act.d1 > act.d0, "the check rolled dice");
  assert.equal(act.sv, c.table.state.version);
  assert.equal(act.h, hashState(c.table.state));
  assert.equal(files(c.dir, c.code, ".snapshot.json").length, 1, "a snapshot beside it");
});

test("replay reproduces a short multiplayer game exactly, across an undo, and finds the first line that differs", async () => {
  const c = setup();
  const pat = join_(c, "Pat-Secret");
  pat.say({ t: "act", action: { type: "claim", entity: "rogue" } });
  c.dm.say({ t: "act", action: { type: "advanceTime", minutes: 30 } });
  pat.say({ t: "act", action: { type: "check", actor: "rogue", skill: "stealth" } });
  const sam = join_(c, "Sam-Secret");               // someone sits down mid-game: a new file, whose snapshot holds the new member
  sam.say({ t: "act", action: { type: "claim", entity: "cleric" } });
  c.dm.say({ t: "act", action: { type: "chronicle", title: "A first night" } });
  c.dm.say({ t: "undo" });
  c.dm.say({ t: "act", action: { type: "check", actor: "fighter", skill: "athletics" } });
  pat.say({ t: "act", action: { type: "check", actor: "rogue", skill: "perception" } });
  await c.journal.idle();
  const jf = files(c.dir, c.code, ".jsonl"), sf = files(c.dir, c.code, ".snapshot.json");
  assert.ok(jf.length >= 3, `a join and an undo each start a file (${jf})`);
  const read = (n) => readFileSync(join(c.dir, n), "utf8");
  const journals = jf.map((name) => ({ name, text: read(name), loadSnapshot: (s) => JSON.parse(read(s)) }));
  const r = replayGame(JSON.parse(read(sf[0])), journals);
  assert.equal(r.ok, true, JSON.stringify(r.diverged));
  assert.ok(r.lines >= 5);
  // Byte for byte: the last line's hash is the table's state now.
  const last = lines(c.dir, jf.at(-1)).at(-1);
  assert.equal(last.h, hashState(c.table.state));
  // The command line agrees.
  const out = [], err = [];
  assert.equal(replayMain([join(c.dir, sf[0]), ...jf.map((n) => join(c.dir, n)), "--quiet"], (s) => out.push(s), (s) => err.push(s)), 0, err.join("\n"));
  assert.ok(out.some((l) => /^ok: \d+ actions? replayed/.test(l)));
  assert.ok(out.some((l) => /^warning: keep these files private/.test(l)), "the privacy warning is printed every time");
  // Change one line's recorded hash: the script names that line.
  const bad = journals.map((j) => ({ ...j }));
  const k = bad.findIndex((j) => j.text.includes('"k":"act"'));
  const ls = bad[k].text.split("\n"), i = ls.findIndex((l) => l.includes('"k":"act"'));
  const o = JSON.parse(ls[i]); o.h = "0".repeat(32); ls[i] = JSON.stringify(o); bad[k].text = ls.join("\n");
  const d = replayGame(JSON.parse(read(sf[0])), bad);
  assert.equal(d.ok, false);
  assert.equal(d.diverged.n, o.n);
  assert.match(d.diverged.why, /state differs/);
});

test("nothing personal is in the lines: no names, no join token, no address", async () => {
  const c = setup();
  const pat = join_(c, "Pat-Secret");
  pat.say({ t: "act", action: { type: "claim", entity: "rogue" } });
  pat.say({ t: "act", action: { type: "check", actor: "rogue", skill: "stealth" } });
  c.dm.say({ t: "act", action: { type: "claim", entity: "fighter", user: pat.last("welcome").userId, userName: "Pat-Secret" } });
  c.dm.say({ t: "act", action: { type: "claim", entity: "wizard", user: "x", userName: "Somebody-Else" } });
  await c.journal.idle();
  const claims = [];
  for (const n of files(c.dir, c.code, ".jsonl")) {
    const text = readFileSync(join(c.dir, n), "utf8");
    for (const secret of ["Pat-Secret", "Dana-Secret", "Somebody-Else", pat.last("welcome").token, c.dmToken, "127.0.0.1", "::1"]) assert.ok(!text.includes(secret), `${n} holds no ${secret}`);
    claims.push(...lines(c.dir, n).filter((l) => l.k === "act" && l.action.type === "claim"));
  }
  assert.deepEqual(claims[0].action.userName, { $member: pat.last("welcome").userId }, "a name is a reference to a member of the snapshot");
  assert.equal(claims[0].action.user, pat.last("welcome").userId);
  assert.ok(claims.some((l) => l.lossy), "a name that is no member's is dropped and the line says so");
  for (const l of claims) assert.deepEqual(Object.keys(l).filter((k) => !["k", "n", "at", "role", "uid", "action", "d0", "d1", "sv", "h", "lossy"].includes(k)), []);
});

test("a file is closed at the size cap, a restart goes on from the next number, and only the last files are kept", async () => {
  const dir = tmp();
  let c = setup({ fileMax: 1, keep: 2 }, dir);        // the snapshot counts against a file, and a state bigger than half the cap gets room for as many lines as it is big
  for (let i = 0; i < 1000; i++) c.dm.say({ t: "act", action: { type: "chronicle", title: `Entry ${i}` } });
  await c.journal.idle();
  let jf = files(dir, c.code, ".jsonl");
  assert.equal(jf.length, 2, `two kept (${jf})`);
  assert.equal(files(dir, c.code, ".snapshot.json").length, 2, "snapshots are pruned with their files");
  const top = Number(/\.(\d{6})\./.exec(jf.at(-1))[1]);
  assert.ok(top > 2, "older ones were rotated out");
  // Every kept file replays from its own snapshot.
  for (const n of jf) {
    const o = lines(dir, n)[0];
    const r = replayGame(JSON.parse(readFileSync(join(dir, o.snapshot), "utf8")), [{ name: n, text: readFileSync(join(dir, n), "utf8") }]);
    assert.equal(r.ok, true, JSON.stringify(r.diverged));
  }
  // A new process: a new file, with a higher number, though no action has yet been taken before it.
  const again = createJournal({ dir, fileMax: 1, keep: 2 });
  const tables = createTables({ seed: () => 5, key: () => KEY, journal: again, load: () => [c.table] });
  const dm = client(tables);
  dm.say({ t: "resume", code: c.code, token: c.dmToken });
  dm.say({ t: "act", action: { type: "chronicle", title: "After restart" } });
  await again.idle();
  jf = files(dir, c.code, ".jsonl");
  assert.equal(Number(/\.(\d{6})\./.exec(jf.at(-1))[1]), top + 1);
  assert.equal(jf.length, 2);
});

test("a failed write does not break the table: the action goes through, one line is logged, and a later write is tried again", async () => {
  const dir = tmp(), blocker = join(dir, "not-a-folder");
  writeFileSync(blocker, "");
  let clock = 1_000_000;
  const logs = [];
  const c = setup({ now: () => clock, retryMs: 30_000 }, join(blocker, "inside"), logs);       // a folder that cannot be made
  const before = c.table.state.timeline.length;
  for (let i = 0; i < 5; i++) c.dm.say({ t: "act", action: { type: "chronicle", title: `Entry ${i}` } });
  await c.journal.idle();
  assert.equal(c.dm.got.filter((m) => m.t === "error").length, 0, "no action was refused");
  assert.ok(c.table.state.timeline.length >= before + 5, "the actions took effect");
  assert.equal(logs.length, 1, `one journal-error line, not one a write: ${logs}`);
  const rec = JSON.parse(logs[0]);
  assert.equal(rec.event, "journal-error");
  assert.equal(rec.table, c.code);
  // The disk comes back (here: the folder is made); after the wait the journal starts a new file.
  rmSync(blocker); writeFileSync(blocker, ""); rmSync(blocker);
  clock += 31_000;
  c.dm.say({ t: "act", action: { type: "chronicle", title: "Later" } });
  await c.journal.idle();
  const [name] = files(join(dir, "not-a-folder", "inside"), c.code, ".jsonl");
  assert.ok(name, "journalling resumed");
  assert.equal(lines(join(dir, "not-a-folder", "inside"), name).filter((l) => l.k === "act").length, 1);
});

test("a journal that throws inside the server's call is swallowed", () => {
  const journal = createJournal({ dir: tmp(), log: () => {} });
  const t = { code: "ABC123", state: { get version() { throw new Error("boom"); } }, members: [] };
  assert.equal(journal.before(t), null);
  assert.doesNotThrow(() => journal.accepted(null, {}));
  assert.doesNotThrow(() => journal.reset(t, "x"));
});

test("settings: JOURNAL=off writes nothing; the cap and count come from the environment", async () => {
  assert.equal(journalFromEnv({ JOURNAL: "off" }).enabled, false);
  assert.deepEqual(journalFromEnv({ JOURNAL_FILE_BYTES: "1000", JOURNAL_FILES: "3" }), { enabled: true, fileMax: 1000, keep: 3 });
  const c = setup({ enabled: false });
  c.dm.say({ t: "act", action: { type: "chronicle", title: "x" } });
  assert.deepEqual(files(c.dir, c.code, ".jsonl"), []);
});

test("flushSync writes what is still waiting", () => {
  const c = setup();
  c.dm.say({ t: "act", action: { type: "chronicle", title: "x" } });
  c.journal.flushSync();                        // the snapshot write is still in flight here: it is done again first
  const [name] = files(c.dir, c.code, ".jsonl"), [snap] = files(c.dir, c.code, ".snapshot.json");
  assert.equal(lines(c.dir, name).filter((l) => l.k === "act").length, 1);
  assert.equal(JSON.parse(readFileSync(join(c.dir, snap), "utf8")).table, c.code);
});

test("end to end: the real server writes the journal beside the table save, flushes it on SIGTERM, and the files replay", async () => {
  const { startServer, stopAll } = await import("./helpers.js");
  const s = await startServer({ stderr: "pipe" });
  try {
    const got = await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${s.port}/ws`), seen = [];
      const timer = setTimeout(() => reject(new Error("timed out")), 10_000);
      ws.onopen = () => ws.send(JSON.stringify({ t: "host", name: "Dana" }));
      ws.onmessage = (ev) => {
        const m = JSON.parse(ev.data); seen.push(m);
        if (m.t === "welcome") ws.send(JSON.stringify({ t: "act", action: { type: "check", actor: "rogue", skill: "stealth" } }));
        if (m.t === "update" && m.events?.some?.((e) => e.type === "check")) { clearTimeout(timer); ws.close(); resolve(seen); }
      };
    });
    const code = got.find((m) => m.t === "welcome").code;
    await s.stop();
    const jf = files(s.data, code, ".jsonl"), sf = files(s.data, code, ".snapshot.json");
    assert.equal(jf.length, 1);
    assert.equal(replayMain([join(s.data, sf[0]), join(s.data, jf[0]), "--quiet"], () => {}, (e) => assert.fail(e)), 0);
    assert.equal(lines(s.data, jf[0]).filter((l) => l.k === "act").length, 1);
  } finally { await stopAll(); }
});

test("the timeline cap: the hash is of the capped state, the header names the cap, and replay trims the same way", async () => {
  const c = setup({}, tmp(), [], { timelineCap: 3 });
  for (let i = 0; i < 8; i++) c.dm.say({ t: "act", action: { type: "check", actor: "rogue", skill: "stealth" } });
  await c.journal.idle();
  const [jf] = files(c.dir, c.code, ".jsonl"), [sf] = files(c.dir, c.code, ".snapshot.json");
  assert.equal(lines(c.dir, jf)[0].cap, 3);
  const nonChron = c.table.state.timeline.filter((e) => e.type !== "chronicle").length;
  assert.ok(nonChron <= 3 + 1, "the table's own timeline was cut");
  const r = replayGame(JSON.parse(readFileSync(join(c.dir, sf), "utf8")), [{ name: jf, text: readFileSync(join(c.dir, jf), "utf8") }]);
  assert.equal(r.ok, true, JSON.stringify(r.diverged));
  assert.equal(r.lines, 8);
  assert.equal(lines(c.dir, jf).at(-1).h, hashState(c.table.state));
});

test("the hash is cheap: it covers the timeline by length and ends, and still tells a changed state from a same one", () => {
  const a = { version: 1, x: 1, timeline: [{ t: 1 }, { t: 2 }, { t: 3 }] };
  assert.equal(hashState(a), hashState(structuredClone(a)));
  assert.notEqual(hashState(a), hashState({ ...a, x: 2 }));
  assert.notEqual(hashState(a), hashState({ ...a, timeline: [...a.timeline, { t: 4 }] }));
  assert.notEqual(hashState(a), hashState({ ...a, timeline: a.timeline.slice(1) }), "cut at the front");
  const big = { ...a, timeline: Array.from({ length: 5000 }, (_, i) => ({ t: i, type: "attack", text: "x".repeat(200) })) };
  const t0 = performance.now(); for (let i = 0; i < 20; i++) hashState(big); const ms = (performance.now() - t0) / 20;
  assert.ok(ms < 3, `a 5000-entry timeline costs ${ms.toFixed(2)} ms`);
});

test("someone waiting to be let in does not close the file; being let in does", async () => {
  const c = setup();
  c.dm.say({ t: "act", action: { type: "chronicle", title: "one" } });
  const p = client(c.tables);
  p.say({ t: "join", code: c.code, name: "Pat" });
  c.dm.say({ t: "act", action: { type: "chronicle", title: "two" } });
  await c.journal.idle();
  assert.equal(files(c.dir, c.code, ".jsonl").length, 1, "an unapproved request writes nothing and closes nothing");
  c.dm.say({ t: "approve", userId: p.last("welcome").userId, ok: true });
  c.dm.say({ t: "act", action: { type: "chronicle", title: "three" } });
  await c.journal.idle();
  assert.equal(files(c.dir, c.code, ".jsonl").length, 2);
  assert.ok(lines(c.dir, files(c.dir, c.code, ".jsonl")[0]).some((l) => l.k === "break" && l.why === "approve"));
});

test("undo, redo and rewind with nothing to take back write nothing", async () => {
  const c = setup();
  c.dm.say({ t: "undo" }); c.dm.say({ t: "redo" }); c.dm.say({ t: "rewind", to: "fight" });
  await c.journal.idle();
  assert.deepEqual(files(c.dir, c.code, ".jsonl"), []);
  assert.equal(c.dm.got.filter((m) => m.t === "error").length, 3, "each was refused as before");
});

test("sizes are counted in bytes, with the snapshot, and the server-wide cap removes the oldest closed files of any table", async () => {
  const dir = tmp();
  const a = setup({ totalMax: 1 << 30 }, dir);
  for (let i = 0; i < 3; i++) a.dm.say({ t: "act", action: { type: "chronicle", title: "é".repeat(100) } });
  await a.journal.idle();
  const [jf] = files(dir, a.code, ".jsonl"), [sf] = files(dir, a.code, ".snapshot.json");
  const onDisk = readFileSync(join(dir, jf)).length + readFileSync(join(dir, sf)).length;
  assert.equal(a.journal.usage().bytes, onDisk, "bytes, not characters, snapshot included");
  // A second table under a small total: closing files makes the older table's files go.
  const j = createJournal({ dir, totalMax: onDisk + 1000, fileMax: 400 });
  const tables = createTables({ seed: () => 5, key: () => KEY, journal: j });
  const dm = client(tables);
  dm.say({ t: "host", name: "Eve" });
  const code = dm.last("welcome").code;
  for (let i = 0; i < 10; i++) dm.say({ t: "act", action: { type: "chronicle", title: `Entry ${i}` } });
  await j.idle();
  assert.ok(j.usage().bytes <= onDisk + 1000 + 40_000, "kept near the total");
  assert.deepEqual(files(dir, a.code, ".jsonl"), [], "the older table's closed file was removed first");
  assert.ok(files(dir, code, ".jsonl").length >= 1, "the open file is never removed");
});

test("the start-up sweep removes journals whose table save is gone", async () => {
  const c = setup();
  c.dm.say({ t: "act", action: { type: "chronicle", title: "x" } });
  await c.journal.idle();
  assert.ok(files(c.dir, c.code, ".jsonl").length);
  const j2 = createJournal({ dir: c.dir });
  j2.sweep((code) => code === c.code);
  assert.ok(files(c.dir, c.code, ".jsonl").length, "a table that exists keeps its journal");
  j2.sweep(() => false);
  assert.deepEqual(readdirSync(c.dir), []);
});

test("a failed write marks the next file's header lost; --strict fails on such a restart; a torn last line is only a note", async () => {
  // The marker a real loss leaves: first the journal's own, after a write that failed.
  const dir = tmp(), blocker = join(dir, "f");
  writeFileSync(blocker, "");
  let clock = 9_000_000;
  const logs = [];
  const bad = setup({ now: () => clock, retryMs: 1000 }, join(blocker, "x"), logs);
  bad.dm.say({ t: "act", action: { type: "chronicle", title: "lost" } });
  await bad.journal.idle();
  clock += 2000;
  rmSync(blocker); mkdirSync(blocker);
  bad.dm.say({ t: "act", action: { type: "chronicle", title: "after" } });
  await bad.journal.idle();
  const [h] = files(join(blocker, "x"), bad.code, ".jsonl");
  assert.equal(lines(join(blocker, "x"), h)[0].why, "lost");
  // The script: a file that restarts from its own snapshot, marked lost, fails --strict and passes without it.
  const c = setup();
  c.dm.say({ t: "act", action: { type: "chronicle", title: "one" } });
  c.dm.say({ t: "act", action: { type: "undo" } });
  c.dm.say({ t: "act", action: { type: "chronicle", title: "two" } });
  c.dm.say({ t: "undo" });
  c.dm.say({ t: "act", action: { type: "chronicle", title: "three" } });
  await c.journal.idle();
  const jf = files(c.dir, c.code, ".jsonl"), sf = files(c.dir, c.code, ".snapshot.json");
  assert.ok(jf.length >= 2);
  const args = [join(c.dir, sf[0]), ...jf.map((n) => join(c.dir, n))];
  assert.equal(replayMain(args, () => {}, () => {}), 0);
  const second = join(c.dir, jf[1]), text = readFileSync(second, "utf8"), [head, ...rest] = text.split("\n");
  assert.equal(JSON.parse(head).why, "undo", "an undo is told from a loss");
  writeFileSync(second, [JSON.stringify({ ...JSON.parse(head), why: "lost" }), ...rest].join("\n"));
  const err = [];
  assert.equal(replayMain([...args, "--strict"], () => {}, (e) => err.push(e)), 1);
  assert.match(err.join("\n"), /lost lines/);
  assert.equal(replayMain(args, () => {}, () => {}), 0, "without --strict it still replays");
  // A torn last line of the last file.
  const last = join(c.dir, jf.at(-1));
  writeFileSync(last, readFileSync(last, "utf8").trimEnd() + '\n{"k":"act","n":9,"act');
  const out = [], e2 = [];
  assert.equal(replayMain(args, (l) => out.push(l), (e) => e2.push(e)), 0, e2.join("\n"));
  assert.ok(out.some((l) => /cut short/.test(l)));
});

test("a file opened by someone leaving (not by an action) carries the cap, and replays", async () => {
  const c = setup({}, tmp(), [], { timelineCap: 3 });
  const pat = join_(c, "Pat");
  pat.say({ t: "act", action: { type: "claim", entity: "rogue" } });
  join_(c, "Sam");                                   // being let in closes the file
  pat.say({ t: "leave" });                           // the release opens file 2
  for (let i = 0; i < 8; i++) c.dm.say({ t: "act", action: { type: "check", actor: "fighter", skill: "athletics" } });
  await c.journal.idle();
  const jf = files(c.dir, c.code, ".jsonl"), sf = files(c.dir, c.code, ".snapshot.json");
  assert.ok(jf.length >= 2);
  for (const n of jf) assert.equal(lines(c.dir, n)[0].cap, 3, `${n} names the cap`);
  assert.ok(lines(c.dir, jf[1]).some((l) => l.k === "act" && l.action.type === "release"), "the release is the file's first action");
  const read = (n) => readFileSync(join(c.dir, n), "utf8");
  const r = replayGame(JSON.parse(read(sf[0])), jf.map((name) => ({ name, text: read(name), loadSnapshot: (x) => JSON.parse(read(x)) })));
  assert.equal(r.ok, true, JSON.stringify(r.diverged));
});

test("the hash sees a change in the last 20 timeline entries, not only the ends", () => {
  const a = { version: 1, timeline: Array.from({ length: 100 }, (_, i) => ({ t: i })) };
  const b = structuredClone(a); b.timeline[90].t = 999;
  assert.notEqual(hashState(a), hashState(b));
});

test("a leftover snapshot .tmp file is counted and removed with its pair", async () => {
  const dir = tmp();
  writeFileSync(join(dir, "ABC123.journal.000001.jsonl"), "x");
  writeFileSync(join(dir, "ABC123.journal.000001.snapshot.json"), "x");
  writeFileSync(join(dir, "ABC123.journal.000001.snapshot.json.tmp"), "xxx");
  const j = createJournal({ dir, keep: 1, log: () => {} });
  assert.equal(j.usage().bytes, 5);
  const tables = createTables({ seed: () => 5, key: () => KEY, journal: j, load: () => [{ code: "ABC123", state: (() => { const t = createTables({ seed: () => 5, key: () => KEY }); const d = client(t); d.say({ t: "host", name: "x" }); return t.get(d.last("welcome").code).state; })(), packs: [], members: [{ id: "m", token: "t".repeat(20), name: "D", role: "dm", approved: true }] }] });
  const dm = client(tables);
  dm.say({ t: "resume", code: "ABC123", token: "t".repeat(20) });
  dm.say({ t: "act", action: { type: "chronicle", title: "a" } });
  await j.idle();
  assert.deepEqual(readdirSync(dir).filter((n) => /000001/.test(n)), [], "the old pair, tmp included, is pruned");
});
