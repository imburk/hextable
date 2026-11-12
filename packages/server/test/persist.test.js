// End to end through the real server and real files: the undo history sits beside the table file,
// comes back after a restart, and a damaged history file does not stop the table loading.
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { startServer, stopAll } from "./helpers.js";

// A server on a free port over this data folder; stop() lets it save what is waiting, and waits for it.
const start = (dir) => startServer({ data: dir, stderr: "pipe" });
after(stopAll);

// Send messages in turn over one socket; resolve with everything received once `done` says so.
function talk(port, messages, done) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`), got = [];
    const timer = setTimeout(() => { ws.close(); reject(new Error(`timed out: ${JSON.stringify(got.map((m) => m.t))}`)); }, 15_000);
    let i = 0;
    const next = () => { if (i < messages.length) ws.send(JSON.stringify(messages[i++])); };
    ws.onopen = next;
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data); got.push(m);
      if (done(got)) { clearTimeout(timer); ws.close(); resolve(got); }
      else if (["update", "undoable", "history"].includes(m.t) && i < messages.length && got.filter((x) => x.t === "undoable").length >= i) next();
    };
    ws.onerror = () => reject(new Error("socket error"));
  });
}

test("the undo history is written beside the table and used after a restart; a corrupted one is ignored", async () => {
  const dir = mkdtempSync(join(tmpdir(), "hextable-persist-"));
  try {
    let s = await start(dir);
    const got = await talk(s.port, [{ t: "host", name: "Dana" }, { t: "act", action: { type: "chronicle", title: "One" } }],
      (g) => g.some((m) => m.t === "undoable" && m.undo.length === 1));
    const { code, token } = got.find((m) => m.t === "welcome");
    await s.stop();
    assert.ok(readdirSync(dir).includes(`${code}.undo.json`));
    const saved = JSON.parse(readFileSync(join(dir, `${code}.undo.json`), "utf8"));
    assert.equal(saved.undos.length, 1);

    s = await start(dir);
    const back = await talk(s.port, [{ t: "resume", code, token }], (g) => g.some((m) => m.t === "undoable"));
    assert.deepEqual(back.find((m) => m.t === "undoable").undo, ["Chronicle: One"]);
    await s.stop();

    writeFileSync(join(dir, `${code}.undo.json`), '{"seq": 3, "undos": [');     // cut off mid-write
    s = await start(dir);
    const after = await talk(s.port, [{ t: "resume", code, token }], (g) => g.some((m) => m.t === "undoable"));
    assert.equal(after.find((m) => m.t === "welcome").role, "dm");
    assert.deepEqual(after.find((m) => m.t === "undoable").undo, []);
    assert.match(s.stderr(), /Ignoring unreadable undo history/);
    await s.stop();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
