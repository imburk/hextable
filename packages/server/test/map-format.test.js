// Map format 2 and state version 21 (docs/specs/square-grid.md, task S4) on the server: a table file
// and an export written by the server before the change load as hex maps and play.
//
// The fixtures were written by the table server on main at state version 20 (map format 1): it was
// started over an empty data folder, the DM hosted, loaded the stock tavern, spawned a goblin, wrote
// a chronicle entry and exported the table; `v20-table.json` and `v20-table.undo.json` are the files
// it saved on the way out, and `v20-export.json` is the export it sent.
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { moveOptions } from "../../rules/src/engine.js";
import { lintMap } from "../../rules/src/map.js";
import { migrate, VERSION } from "../../rules/src/migrate.js";
import { createTables } from "../src/tables.js";
import { startServer, stopAll } from "./helpers.js";

after(stopAll);
const FIX = (f) => new URL(`./fixtures/${f}`, import.meta.url);
const fixture = (f) => JSON.parse(readFileSync(FIX(f), "utf8"));
const HEADER = ["format", "id", "name", "grid", "cellFeet"];

// What a version 20 state looks like once migrated: the same apart from the version and the map's
// header. Everything else is compared whole.
function sameButHeader(was, now) {
  assert.equal(was.version, 20);
  assert.equal(was.map.format, 1);
  assert.equal(was.map.hexFeet, 5);
  assert.equal(now.version, VERSION);
  assert.equal(VERSION, 22);                          // 21 for map format 2; 22 since, turns named by creature (#300)
  assert.deepEqual(Object.keys(now.map).slice(0, 5), HEADER);
  assert.equal(now.map.format, 2);
  assert.equal(now.map.grid, "hex");
  assert.equal(now.map.cellFeet, 5);
  assert.equal("hexFeet" in now.map, false);
  assert.deepEqual(lintMap(now.map), []);
  const strip = (s) => { const c = structuredClone(s); delete c.version; for (const k of ["format", "grid", "cellFeet", "hexFeet"]) delete c.map[k]; return c; };
  assert.deepEqual(strip(now), strip(was));
}

// Send messages in turn over one socket and collect what comes back until `done` says so.
function talk(port, messages, done) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`), got = [];
    const timer = setTimeout(() => { ws.close(); reject(new Error(`timed out: ${JSON.stringify(got.map((m) => m.t))}`)); }, 15_000);
    let i = 0;
    ws.onopen = () => ws.send(JSON.stringify(messages[i++]));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data); got.push(m);
      if (done(got)) { clearTimeout(timer); ws.close(); resolve(got); }
      else if (m.t === "undoable" && i < messages.length) ws.send(JSON.stringify(messages[i++]));
    };
    ws.onerror = () => reject(new Error("socket error"));
  });
}
const stand = (state, id) => { const [k, v] = [...moveOptions(state, state.entities[id])].find(([, o]) => o.canStop); return v.h; };

test("a table file the server saved at version 20 loads from disk as a hex map at the current version and plays", async () => {
  const saved = fixture("v20-table.json"), { code } = saved, dm = saved.members[0];
  const dir = mkdtempSync(join(tmpdir(), "hextable-249-"));
  try {
    copyFileSync(FIX("v20-table.json"), join(dir, `${code}.json`));
    copyFileSync(FIX("v20-table.undo.json"), join(dir, `${code}.undo.json`));
    let s = await startServer({ data: dir, stderr: "pipe" });
    const first = await talk(s.port, [{ t: "resume", code, token: dm.token }], (g) => g.some((m) => m.t === "undoable"));
    assert.equal(first.find((m) => m.t === "welcome").role, "dm");
    const sent = first.find((m) => m.t === "update").state;
    assert.equal(sent.version, VERSION);
    assert.deepEqual([sent.map.format, sent.map.grid, sent.map.cellFeet, "hexFeet" in sent.map], [2, "hex", 5, false]);
    // As with every version change, the saved undo history no longer fits and is dropped, once.
    assert.deepEqual(first.find((m) => m.t === "undoable").undo, []);
    await s.stop();
    // What the server loaded is the saved state, migrated: the same but for the version and the header.
    const file = () => JSON.parse(readFileSync(join(dir, `${code}.json`), "utf8"));
    sameButHeader(saved.state, migrate(structuredClone(saved.state)));
    for (const k of Object.keys(sent.entities)) assert.deepEqual(sent.entities[k].pos, saved.state.entities[k].pos);
    // It plays: the fighter walks on the tavern's floor.
    s = await startServer({ data: dir, stderr: "pipe" });
    const to = stand(migrate(structuredClone(saved.state)), "fighter");
    const moved = await talk(s.port, [{ t: "resume", code, token: dm.token }, { t: "act", action: { type: "move", actor: "fighter", to } }],
      (g) => g.filter((m) => m.t === "undoable").length >= 2);
    assert.ok(!moved.some((m) => m.t === "error"), JSON.stringify(moved.find((m) => m.t === "error")));
    await s.stop();
    const now = file();
    assert.equal(now.state.version, VERSION);
    assert.equal(now.state.map.grid, "hex");
    assert.deepEqual([now.state.entities.fighter.pos.q, now.state.entities.fighter.pos.r], [to.q, to.r]);
    // Loaded again at the same version, it keeps its undo history this time.
    s = await startServer({ data: dir, stderr: "pipe" });
    const again = await talk(s.port, [{ t: "resume", code, token: dm.token }], (g) => g.some((m) => m.t === "undoable"));
    assert.equal(again.find((m) => m.t === "undoable").undo.length, 1);
    await s.stop();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("an export made at version 20 loads back as a table at the current version, plays, and exports again unchanged", () => {
  const exp = fixture("v20-export.json"), dm = { id: "u1", token: "dm-token", name: "Dana", role: "dm", approved: true };
  assert.equal(exp.state.version, 20);
  const load = (state) => createTables({ seed: () => 5, key: () => null, load: () => [{ code: exp.code, state: structuredClone(state), members: [structuredClone(dm)] }] });
  const tables = load(exp.state);
  const state = tables.get(exp.code).state;
  sameButHeader(exp.state, state);
  // Exported again and loaded again, nothing changes: migrating a current state is a no-op.
  const sent = [];
  const conn = tables.connect({ send: (m) => sent.push(JSON.parse(JSON.stringify(m))) });
  conn.receive({ t: "resume", code: exp.code, token: dm.token });
  conn.receive({ t: "export" });
  const again = sent.find((m) => m.t === "export").table;
  assert.deepEqual(again.state, JSON.parse(JSON.stringify(state)));
  const back = load(again.state).get(exp.code).state;
  assert.deepEqual(back, again.state);
  // And it plays.
  const to = stand(state, "fighter");
  conn.receive({ t: "act", action: { type: "move", actor: "fighter", to } });
  assert.equal(sent.findLast((m) => m.t === "update" || m.t === "error").t, "update");
  assert.equal(state.entities.fighter.pos.q, to.q);
});
