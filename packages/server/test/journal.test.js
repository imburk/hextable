// The per-table action journal (#659): what is written, what is not, rotation, a failed write, and replay through scripts/replay.mjs.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
function setup(journalOpts = {}, dir = tmp(), logs = []) {
  const journal = createJournal({ dir, log: (l) => logs.push(l), ...journalOpts });
  const tables = createTables({ seed: () => 5, key: () => KEY, journal });
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
  assert.match(out[0], /^ok: \d+ actions? replayed/);
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
  let c = setup({ fileMax: 600, keep: 2 }, dir);
  for (let i = 0; i < 12; i++) c.dm.say({ t: "act", action: { type: "chronicle", title: `Entry ${i}` } });
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
  const again = createJournal({ dir, fileMax: 600, keep: 2 });
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
  c.journal.flushSync();
  const [name] = files(c.dir, c.code, ".jsonl");
  assert.equal(lines(c.dir, name).filter((l) => l.k === "act").length, 1);
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
