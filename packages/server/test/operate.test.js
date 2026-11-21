// Operating the data (#662): idle tables leave memory and come back, tables are read lazily, old ones are archived and restored, the
// nightly backup rotates, and /api/health says what address the server sees. The rig below wires createTables to real files the way index.js does.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { after, test } from "node:test";
import { main as backupMain } from "../../../scripts/backup.mjs";
import { backupDue, backupName, listBackups, runBackup } from "../src/backup.js";
import { createJournal } from "../src/journal.js";
import { proxyFromEnv, proxyReport } from "../src/limits.js";
import { createStore } from "../src/store.js";
import { createTables } from "../src/tables.js";
import { startServer, stopAll } from "./helpers.js";

const dirs = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), "hextable-op-")); dirs.push(d); return d; };
after(async () => { await stopAll(); for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

const KEY = "0123456789abcdef".repeat(4);
const MIN = 60_000, DAY = 86_400_000;
function client(tables) {
  const got = [];
  const session = tables.connect({ send: (m) => got.push(JSON.parse(JSON.stringify(m))) });
  return { got, say: (m) => session.receive(m), last: (t) => got.findLast((m) => m.t === t), session };
}
// Tables over real files in `dir`, as index.js does: a debounced save (here: a map of dirty tables) that flushNow writes at once.
function rig(dir, extra = {}) {
  const store = createStore({ dir, log() {} });
  const journal = createJournal({ dir });
  const dirty = new Map(), counts = { loadOne: 0 }, clock = { offset: 0 };
  let tables;
  const flushOne = (code) => {
    const t = dirty.get(code);
    if (!t) return true;
    dirty.delete(code);
    writeFileSync(join(dir, `${code}.json.tmp`), JSON.stringify(t)); renameSync(join(dir, `${code}.json.tmp`), join(dir, `${code}.json`));
    const h = tables.exportHistory(code);
    if (h) writeFileSync(join(dir, `${code}.undo.json`), JSON.stringify(h));
    return true;
  };
  tables = createTables({
    seed: () => 5, key: () => KEY, journal, now: () => Date.now() + clock.offset, save: (t) => dirty.set(t.code, t),
    loadHistory: (code) => { try { return JSON.parse(readFileSync(join(dir, `${code}.undo.json`), "utf8")); } catch { return null; } },
    index: () => store.list(), loadOne: (code) => { counts.loadOne++; return store.read(code); }, archived: () => store.archived(), flushNow: flushOne,
    archive: (code) => { const ok = store.archive(code); if (ok) journal.forget(code); return ok; },
    restore: (code) => { const ok = store.restore(code); if (ok) journal.adopt(code); return ok; },
    ...extra,
  });
  return { dir, store, journal, tables, dirty, counts, clock, flushOne, flush: () => { for (const c of [...dirty.keys()]) flushOne(c); } };
}
// A table with a DM who has chronicled once, a pending player, and everyone gone.
function hostedTable(r, name = "Dana") {
  const dm = client(r.tables);
  dm.say({ t: "host", name });
  const w = dm.last("welcome");
  const p = client(r.tables);
  p.say({ t: "join", code: w.code, name: "Pia" });
  dm.say({ t: "approve", userId: p.last("welcome").userId, ok: true });
  dm.say({ t: "act", action: { type: "chronicle", title: "One" } });
  r.flush();
  dm.session.disconnect(); p.session.disconnect();
  return { code: w.code, token: w.token, pid: p.last("welcome").userId, ptoken: p.last("welcome").token };
}
const tree = (dir) => {
  const out = [];
  const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) walk(p); else out.push(relative(dir, p)); } };
  walk(dir);
  return out;
};
const lines = (dir, name) => readFileSync(join(dir, name), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));

// ---------- eviction ----------
test("an idle table is saved and dropped from memory; resuming it brings back its state, undo history and a new journal file", async () => {
  const r = rig(tmp());
  const { code, token } = hostedTable(r);
  const before = JSON.stringify(r.tables.get(code).state);
  r.clock.offset = 29 * MIN;
  assert.deepEqual(r.tables.sweep().evicted, [], "not yet: 30 minutes");
  r.clock.offset = 31 * MIN;
  assert.deepEqual(r.tables.sweep().evicted, [code]);
  assert.equal(r.tables.size(), 0);
  assert.equal(r.tables.savedSize(), 1);
  assert.ok(existsSync(join(r.dir, `${code}.json`)) && existsSync(join(r.dir, `${code}.undo.json`)));
  await r.journal.idle();
  const first = readdirSync(r.dir).filter((n) => n.endsWith(".jsonl"));
  assert.equal(first.length, 1);
  assert.equal(lines(r.dir, first[0]).at(-1).k, "break", "the journal file was closed on eviction");
  assert.equal(lines(r.dir, first[0]).at(-1).why, "evict");

  const dm = client(r.tables);
  dm.say({ t: "resume", code, token });
  assert.equal(dm.last("welcome").role, "dm");
  assert.equal(JSON.stringify(r.tables.get(code).state), before, "the game is as it was");
  assert.deepEqual(dm.last("undoable").undo, ["Chronicle: One"], "the undo history came back");
  assert.ok(dm.last("history").entries.some((e) => e.title === "One"), "and the record");
  assert.deepEqual(dm.last("lobby").members.map((m) => m.name).sort(), ["Dana", "Pia"], "the player let in is still in");

  dm.say({ t: "act", action: { type: "chronicle", title: "Two" } });
  await r.journal.idle();
  const files = readdirSync(r.dir).filter((n) => n.endsWith(".jsonl")).sort();
  assert.equal(files.length, 2, "a new file, from a snapshot of the reloaded state");
  const [open, act] = lines(r.dir, files[1]);
  assert.equal(open.why, "evict");
  assert.equal(act.action.title, "Two");
});

test("a table with anybody connected is never evicted, even a player still waiting to be let in", () => {
  const r = rig(tmp());
  const dm = client(r.tables); dm.say({ t: "host", name: "D" });
  const code = dm.last("welcome").code;
  r.clock.offset = 5 * 3600_000;
  assert.deepEqual(r.tables.sweep().evicted, []);
  const p = client(r.tables); p.say({ t: "join", code, name: "P" });
  dm.session.disconnect();
  r.clock.offset = 10 * 3600_000;
  assert.deepEqual(r.tables.sweep().evicted, [], "the waiting player is still connected");
  p.session.disconnect();
  assert.deepEqual(r.tables.sweep().evicted, [], "just left: the idle time counts from leaving");
  r.clock.offset = 10 * 3600_000 + 31 * MIN;
  assert.deepEqual(r.tables.sweep().evicted, [code]);
});

test("a join that arrives right after eviction finds the table and is not lost", () => {
  const r = rig(tmp());
  const { code, token } = hostedTable(r);
  r.clock.offset = 31 * MIN;
  r.tables.sweep();
  assert.equal(r.tables.size(), 0);
  const late = client(r.tables);
  late.say({ t: "join", code, name: "Late" });
  assert.equal(late.last("welcome").role, "player", "the code still works");
  assert.equal(r.dirty.size, 1, "and the join is waiting to be saved on the reloaded table");
  r.flush();
  const onDisk = JSON.parse(readFileSync(join(r.dir, `${code}.json`), "utf8"));
  assert.deepEqual(onDisk.members.map((m) => m.name).sort(), ["Dana", "Late", "Pia"]);
  const dm = client(r.tables);
  dm.say({ t: "resume", code, token });
  assert.deepEqual(dm.last("lobby").pending.map((m) => m.name), ["Late"]);
  assert.equal(dm.last("lobby").members.length, 2);
});

test("a table whose save cannot be written stays in memory, and nothing is evicted without a way to write it", () => {
  const r = rig(tmp(), { flushNow: () => false });
  const { code } = hostedTable(r);
  r.clock.offset = 31 * MIN;
  assert.deepEqual(r.tables.sweep().evicted, []);
  assert.equal(r.tables.size(), 1);
  assert.ok(r.tables.get(code).members.length === 2);
  const none = rig(tmp(), { flushNow: null });
  const h = hostedTable(none);
  none.clock.offset = 31 * MIN;
  assert.deepEqual(none.tables.sweep().evicted, []);
  assert.ok(none.tables.get(h.code));
});

test("eviction leaves nothing waiting to overwrite the save with an older copy", () => {
  const r = rig(tmp());
  const { code } = hostedTable(r);
  const t = r.tables.get(code);
  t.members[0].name = "Changed";          // a change nobody has saved yet
  r.dirty.set(code, t);
  r.clock.offset = 31 * MIN;
  r.tables.sweep();
  assert.equal(r.dirty.size, 0);
  assert.equal(JSON.parse(readFileSync(join(r.dir, `${code}.json`), "utf8")).members[0].name, "Changed", "the unsaved change was written first");
});

// ---------- lazy load ----------
test("at start only an index is kept: a table is read when its code is first used", () => {
  const dir = tmp();
  const a = rig(dir);
  const codes = [hostedTable(a, "A"), hostedTable(a, "B"), hostedTable(a, "C")];
  a.clock.offset = 31 * MIN; a.tables.sweep();
  assert.equal(a.tables.size(), 0);
  const b = rig(dir);
  assert.equal(b.tables.size(), 0, "nothing in memory");
  assert.equal(b.tables.savedSize(), 3);
  assert.equal(b.tables.activeSize(), 3, "they still count towards MAX_TABLES");
  assert.equal(b.counts.loadOne, 0, "no save was read");
  const dm = client(b.tables);
  dm.say({ t: "resume", code: codes[1].code, token: codes[1].token });
  assert.equal(dm.last("welcome").role, "dm");
  assert.equal(b.counts.loadOne, 1);
  assert.equal(b.tables.size(), 1);
  const again = client(b.tables);
  again.say({ t: "join", code: codes[1].code, name: "X" });
  assert.equal(b.counts.loadOne, 1, "read once");
  const wrong = client(b.tables);
  wrong.say({ t: "resume", code: "ZZZZZZ", token: "x" });
  assert.equal(wrong.last("error").expired, true);
  assert.equal(b.counts.loadOne, 1, "an unknown code reads nothing");
  assert.equal(b.tables.has(codes[2].code), true);
  const h = client(b.tables); h.say({ t: "host", name: "New" });
  assert.equal(b.tables.savedSize(), 4, "a new table is never given a code a saved one holds");
});

test("a save that cannot be read is skipped and the code answers as unknown, without touching the file", () => {
  const dir = tmp();
  writeFileSync(join(dir, "ABC234.json"), "{ not json");
  const r = rig(dir);
  const c = client(r.tables);
  const orig = console.error; console.error = () => {};
  try { c.say({ t: "join", code: "ABC234", name: "x" }); } finally { console.error = orig; }
  assert.equal(c.last("error").expired, true);
  assert.equal(readFileSync(join(dir, "ABC234.json"), "utf8"), "{ not json");
});

// ---------- archive ----------
function addFiles(dir, code) {
  const id = "A".repeat(22);
  mkdirSync(join(dir, "assets", code), { recursive: true });
  writeFileSync(join(dir, "assets", code, id), "bytes");
  writeFileSync(join(dir, "assets", code, `${id}.json`), "{}");
}
test("a table untouched for ARCHIVE_DAYS moves everything it has into archive/<code>/ and joining its code brings it back", async () => {
  const r = rig(tmp());
  const young = hostedTable(r, "Young"), old = hostedTable(r, "Old");
  addFiles(r.dir, old.code);
  r.clock.offset = 31 * MIN; r.tables.sweep();
  await r.journal.idle();
  const was = tree(r.dir).sort();
  const usage = r.journal.usage();
  assert.ok(was.some((f) => f.startsWith(`${old.code}.journal.`)) && was.includes(`${old.code}.undo.json`));
  // the young table is touched now, the old one is left
  const touch = client(r.tables); touch.say({ t: "resume", code: young.code, token: young.token }); touch.session.disconnect();
  r.clock.offset = 91 * DAY;
  // the young one was just loaded at 91 days: it is not idle for 90 days, so it stays out of the archive
  r.tables.get(young.code); r.tables.sweep();
  const swept = r.tables.sweep();
  assert.ok(!swept.archived.includes(young.code));
  // age the old one's index entry by its file time: it was written at real time + 31 min offset, now 91 days on
  assert.ok(r.tables.archivedSize() === 1 && !existsSync(join(r.dir, `${old.code}.json`)), "the old table is in the archive");
  const kept = join(r.dir, "archive", old.code);
  assert.ok(existsSync(join(kept, `${old.code}.json`)) && existsSync(join(kept, `${old.code}.undo.json`)));
  assert.ok(readdirSync(kept).some((n) => n.includes(".journal.")), "its journals went too");
  assert.ok(existsSync(join(kept, "assets", "A".repeat(22))), "and its files");
  assert.ok(!existsSync(join(r.dir, "assets", old.code)) || readdirSync(join(r.dir, "assets", old.code)).length === 0);
  assert.equal(r.journal.usage().files, usage.files - readdirSync(kept).filter((n) => n.endsWith(".jsonl")).length, "the journal's caps no longer count them");
  assert.equal(r.tables.has(old.code), true, "its code is still taken");
  const h = client(r.tables); h.say({ t: "host", name: "n" });
  assert.notEqual(h.last("welcome").code, old.code);

  const back = client(r.tables);
  back.say({ t: "resume", code: old.code, token: old.token });
  assert.equal(back.last("welcome").role, "dm", "resuming restores it");
  assert.deepEqual(back.last("undoable").undo, ["Chronicle: One"]);
  assert.ok(existsSync(join(r.dir, "assets", old.code, "A".repeat(22))));
  assert.equal(existsSync(kept), false, "the emptied archive folder is gone");
  r.flush();
  for (const f of was.filter((x) => !x.startsWith(`${young.code}`))) assert.ok(existsSync(join(r.dir, f)), `${f} is back`);
  assert.equal(r.journal.usage().files >= usage.files, true);
  const j = client(r.tables);
  j.say({ t: "join", code: old.code, name: "Again" });
  assert.equal(j.last("welcome").role, "player");
});

test("joining an archived code restores it too", () => {
  const r = rig(tmp());
  const { code } = hostedTable(r);
  r.clock.offset = 31 * MIN; r.tables.sweep();
  r.clock.offset = 100 * DAY; assert.deepEqual(r.tables.sweep().archived, [code]);
  const p = client(r.tables); p.say({ t: "join", code, name: "Returning" });
  assert.equal(p.last("welcome").role, "player");
  assert.equal(r.tables.archivedSize(), 0);
});

test("nothing is deleted by archiving: a move that fails halfway is put back, and a crash is repaired at start", () => {
  const dir = tmp();
  const r = rig(dir);
  const { code } = hostedTable(r);
  r.clock.offset = 31 * MIN; r.tables.sweep();
  const was = tree(dir).sort();
  mkdirSync(join(dir, "archive", code), { recursive: true });
  writeFileSync(join(dir, "archive", code, "assets"), "in the way");      // the assets cannot be moved there
  addFiles(dir, code); was.push(...tree(dir).filter((f) => f.startsWith("assets")));
  const store = createStore({ dir, log() {} });
  assert.equal(store.archive(code), false);
  for (const f of was) assert.ok(existsSync(join(dir, f)), `${f} stayed`);
  assert.equal(store.archived().size, 0);
  rmSync(join(dir, "archive", code, "assets"));
  // a crash after some files moved, before the save did
  renameSync(join(dir, `${code}.undo.json`), join(dir, "archive", code, `${code}.undo.json`));
  assert.deepEqual(store.repair(), [code]);
  assert.ok(existsSync(join(dir, `${code}.undo.json`)));
  assert.equal(existsSync(join(dir, "archive", code)), false);
  // a restore cut short (the save is still in the archive) is left alone, and restore finishes it
  assert.equal(store.archive(code), true);
  mkdirSync(join(dir, `assets`, code), { recursive: true });
  renameSync(join(dir, "archive", code, "assets", "A".repeat(22)), join(dir, "assets", code, "A".repeat(22)));
  assert.deepEqual(store.repair(), []);
  assert.equal(store.restore(code), true);
  for (const f of was) assert.ok(existsSync(join(dir, f)), `${f} is back`);
});

// ---------- backup ----------
function dataFolder() {
  const d = tmp();
  writeFileSync(join(d, "ABC234.json"), '{"code":"ABC234"}');
  writeFileSync(join(d, "ABC234.undo.json"), "{}");
  writeFileSync(join(d, "ABC234.json.tmp"), "half");
  writeFileSync(join(d, ".write-test"), "");
  mkdirSync(join(d, "assets", "ABC234"), { recursive: true });
  writeFileSync(join(d, "assets", "ABC234", "x"), "picture");
  mkdirSync(join(d, "archive", "XYZ234"), { recursive: true });
  writeFileSync(join(d, "archive", "XYZ234", "XYZ234.json"), "{}");
  return d;
}
test("a backup is a dated whole copy of the data; temporary files are left out; the data is untouched", async () => {
  const data = dataFolder(), out = tmp();
  const before = tree(data).sort();
  const r = await runBackup({ dataDir: data, backupDir: out, now: () => new Date(Date.UTC(2026, 10, 21, 3, 5, 9)) });
  assert.equal(r.ok, true);
  assert.equal(r.name, "hextable-backup-20261121-030509");
  assert.deepEqual(readdirSync(out), [r.name], "no .partial left");
  assert.deepEqual(tree(join(out, r.name)).sort(), ["ABC234.json", "ABC234.undo.json", "archive/XYZ234/XYZ234.json", "assets/ABC234/x"].sort());
  assert.equal(readFileSync(join(out, r.name, "assets", "ABC234", "x"), "utf8"), "picture");
  assert.deepEqual(tree(data).sort(), before, "nothing in the data folder changed");
});

test("the last seven backups are kept, the oldest go, and nothing else in the folder is touched", async () => {
  const data = dataFolder(), out = tmp();
  writeFileSync(join(out, "notes.txt"), "mine"); mkdirSync(join(out, "hextable-backup-old-copy"));
  const names = [], removed = [];
  for (let day = 1; day <= 9; day++) { const r = await runBackup({ dataDir: data, backupDir: out, now: () => new Date(Date.UTC(2026, 10, day, 3)) }); assert.equal(r.ok, true); names.push(r.name); removed.push(...r.removed); if (day === 7) assert.deepEqual(r.removed, [], "seven are kept"); }
  assert.deepEqual(removed, names.slice(0, 2));
  assert.deepEqual(await listBackups(out), names.slice(2));
  assert.ok(existsSync(join(out, "notes.txt")) && existsSync(join(out, "hextable-backup-old-copy")));
  const small = await runBackup({ dataDir: data, backupDir: out, keep: 3, now: () => new Date(Date.UTC(2026, 10, 10, 3)) });
  assert.equal((await listBackups(out)).length, 3);
  assert.equal(small.removed.length, 5);
});

test("the archive is left out when it is off, or in auto mode when it is over the limit; a backup folder inside the data is not copied into itself", async () => {
  const data = dataFolder(), out = tmp();
  const at = (n) => () => new Date(Date.UTC(2026, 10, n, 3));
  const off = await runBackup({ dataDir: data, backupDir: out, archive: "no", now: at(1) });
  assert.equal(off.archive, "off"); assert.ok(!existsSync(join(out, off.name, "archive")));
  const big = await runBackup({ dataDir: data, backupDir: out, archive: "auto", archiveMax: 1, now: at(2) });
  assert.equal(big.archive, "skipped"); assert.ok(!existsSync(join(out, big.name, "archive")));
  const yes = await runBackup({ dataDir: data, backupDir: out, archive: "yes", archiveMax: 1, now: at(3) });
  assert.equal(yes.archive, "included"); assert.ok(existsSync(join(out, yes.name, "archive", "XYZ234", "XYZ234.json")));
  const inside = join(data, "backups");
  const a = await runBackup({ dataDir: data, backupDir: inside, now: at(4) });
  const b = await runBackup({ dataDir: data, backupDir: inside, now: at(5) });
  assert.ok(a.ok && b.ok);
  assert.ok(!tree(join(inside, b.name)).some((f) => f.startsWith("backups")), "the earlier backup is not in the later one");
});

test("a backup refuses to write into the data folder itself, and a failed one leaves no partial folder", async () => {
  const data = dataFolder(), out = tmp();
  assert.equal((await runBackup({ dataDir: data, backupDir: data })).ok, false);
  assert.equal((await runBackup({ dataDir: join(data, "assets"), backupDir: data })).ok, false, "a folder that holds the data");
  const bad = await runBackup({ dataDir: join(data, "nope"), backupDir: out });
  assert.equal(bad.ok, false);
  assert.deepEqual(readdirSync(out), []);
  const first = await runBackup({ dataDir: data, backupDir: out, now: () => new Date(Date.UTC(2026, 10, 1, 3)) });
  const same = await runBackup({ dataDir: data, backupDir: out, now: () => new Date(Date.UTC(2026, 10, 1, 3)) });
  assert.ok(first.ok && same.ok);
  assert.deepEqual(readdirSync(out), [first.name], "the same second keeps the first and leaves no partial");
  const both = await Promise.all([runBackup({ dataDir: data, backupDir: out }), runBackup({ dataDir: data, backupDir: out })]);
  assert.equal(both.filter((x) => x.ok).length, 1);
  assert.match(both.find((x) => !x.ok).error, /already running/);
});

test("a backup is due once a night: after the set hour, and not if there is one for today already", async () => {
  const out = tmp();
  const at = (d, h) => new Date(Date.UTC(2026, 10, d, h, 30));
  assert.equal(await backupDue(out, at(5, 2), 3), false, "before the hour");
  assert.equal(await backupDue(out, at(5, 3), 3), true, "none yet");
  mkdirSync(join(out, backupName(at(5, 3))));
  assert.equal(await backupDue(out, at(5, 15), 3), false, "done today");
  assert.equal(await backupDue(out, at(6, 3), 3), true, "a new day");
  assert.equal(await backupDue(join(out, "missing"), at(5, 4), 3), true, "a folder not made yet");
});

test("scripts/backup.mjs makes a backup from flags or the environment and says what was wrong when it cannot", async () => {
  const data = dataFolder(), out = tmp();
  const log = console.log, err = console.error; console.log = () => {}; console.error = () => {};
  try {
    assert.equal(await backupMain(["--data", data, "--to", out, "--keep", "2"], {}), 0);
    assert.equal(await backupMain([], { DATA_DIR: data, BACKUP_DIR: out, BACKUP_ARCHIVE: "no" }), 0);
    assert.equal(await backupMain([], { DATA_DIR: data }), 1, "no BACKUP_DIR");
  } finally { console.log = log; console.error = err; }
  assert.equal((await listBackups(out)).length >= 1, true);
});

// ---------- health ----------
const req = (remote, headers = {}) => ({ socket: { remoteAddress: remote }, headers });
test("proxyReport shows the address seen for this caller and whether TRUST_PROXY is on", () => {
  const off = proxyReport(req("10.1.2.3", { "x-forwarded-for": "203.0.113.9" }), proxyFromEnv({}));
  assert.deepEqual([off.trustProxy, off.address, off.socketAddress, off.sawForwardedFor], [false, "10.1.2.3", "10.1.2.3", true]);
  assert.match(off.note, /TRUST_PROXY is off, but this request came through a proxy.*Set TRUST_PROXY to 1/);
  const direct = proxyReport(req("203.0.113.5"), proxyFromEnv({}));
  assert.match(direct.note, /straight to the server/);
  const on = proxyReport(req("10.1.2.3", { "x-forwarded-for": "198.51.100.1, 203.0.113.9" }), proxyFromEnv({ TRUST_PROXY: "1" }));
  assert.deepEqual([on.trustProxy, on.hops, on.address], [true, 1, "203.0.113.9"]);
  assert.match(on.note, /read from the proxy's header/);
  const noHeader = proxyReport(req("10.1.2.3"), proxyFromEnv({ TRUST_PROXY: "1" }));
  assert.equal(noHeader.address, "10.1.2.3");
  assert.match(noHeader.note, /could not read a visitor address/);
  assert.deepEqual(Object.keys(on).sort(), ["address", "clientIpHeader", "hops", "note", "sawForwardedFor", "socketAddress", "trustProxy"], "nothing else");
});

const health = async (port, headers) => (await fetch(`http://localhost:${port}/api/health`, { headers })).json();
function talk(port, messages, done) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`), got = [];
    const timer = setTimeout(() => { ws.close(); reject(new Error(`timed out: ${JSON.stringify(got.map((m) => m.t))}`)); }, 15_000);
    ws.onopen = () => { for (const m of messages) ws.send(JSON.stringify(m)); };
    ws.onmessage = (ev) => { got.push(JSON.parse(ev.data)); if (done(got)) { clearTimeout(timer); ws.close(); resolve(got); } };
    ws.onerror = () => reject(new Error("socket error"));
  });
}
test("/api/health reports the caller's address and TRUST_PROXY, and nothing of any table or other person", async () => {
  const data = tmp();
  const s = await startServer({ data, env: { TRUST_PROXY: "1" }, stderr: "pipe" });
  const g = await talk(s.port, [{ t: "host", name: "Secretname" }], (x) => x.some((m) => m.t === "welcome"));
  const { code, token } = g.find((m) => m.t === "welcome");
  const h = await health(s.port, { "x-forwarded-for": "203.0.113.77" });
  assert.equal(h.proxy.trustProxy, true);
  assert.equal(h.proxy.address, "203.0.113.77");
  assert.equal(h.proxy.socketAddress, "127.0.0.1");
  const text = JSON.stringify(h);
  for (const secret of [code, token, "Secretname"]) assert.ok(!text.includes(secret), "no table code, token or name");
  assert.equal(typeof h.tables.saved, "number");
  assert.equal(h.tables.archived, 0);
  await s.stop();
  const plain = await startServer({ data: tmp(), stderr: "pipe" });
  const p = await health(plain.port);
  assert.equal(p.proxy.trustProxy, false);
  assert.equal(p.proxy.address, "127.0.0.1");
  const via = await health(plain.port, { "x-forwarded-for": "203.0.113.77" });
  assert.equal(via.proxy.address, "127.0.0.1", "the header is ignored when TRUST_PROXY is off");
  assert.match(via.proxy.note, /Set TRUST_PROXY/);
});

test("the server reads tables lazily at start: files of an unread table are kept and resuming it still works", async () => {
  const data = tmp();
  let s = await startServer({ data, stderr: "pipe" });
  const g = await talk(s.port, [{ t: "host", name: "D" }], (x) => x.some((m) => m.t === "welcome"));
  const { code, token } = g.find((m) => m.t === "welcome");
  await s.stop();
  addFiles(data, code);
  s = await startServer({ data, stderr: "pipe" });
  let h = await health(s.port);
  assert.deepEqual([h.tables.loaded, h.tables.saved], [0, 1]);
  assert.ok(existsSync(join(data, "assets", code, "A".repeat(22))), "the files of a table not yet read are not cleared away");
  const back = await talk(s.port, [{ t: "resume", code, token }], (x) => x.some((m) => m.t === "undoable"));
  assert.equal(back.find((m) => m.t === "welcome").role, "dm");
  h = await health(s.port);
  assert.deepEqual([h.tables.loaded, h.tables.saved], [1, 1]);
  await s.stop();
  assert.ok(existsSync(join(data, "assets", code, "A".repeat(22))));
});

test("a table archived while the server was down is restored by resuming it, and an old archive move is finished at start", async () => {
  const data = tmp();
  let s = await startServer({ data, stderr: "pipe" });
  const g = await talk(s.port, [{ t: "host", name: "D" }], (x) => x.some((m) => m.t === "welcome"));
  const { code, token } = g.find((m) => m.t === "welcome");
  await s.stop();
  const store = createStore({ dir: data, log() {} });
  assert.equal(store.archive(code), true);
  s = await startServer({ data, stderr: "pipe" });
  const h = await health(s.port);
  assert.deepEqual([h.tables.saved, h.tables.archived], [0, 1]);
  const back = await talk(s.port, [{ t: "resume", code, token }], (x) => x.some((m) => m.t === "undoable"));
  assert.equal(back.find((m) => m.t === "welcome").role, "dm");
  assert.ok(existsSync(join(data, `${code}.json`)) && !existsSync(join(data, "archive", code)));
  assert.ok(statSync(join(data, `${code}.json`)).size > 0);
});
