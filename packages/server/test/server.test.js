// End to end: start the real server and talk to it over HTTP and a real WebSocket.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const PORT = 18000 + (process.pid % 2000);
const data = mkdtempSync(join(tmpdir(), "hextable-"));
let child;

before(async () => {
  child = spawn(process.execPath, [fileURLToPath(new URL("../src/index.js", import.meta.url))],
    { env: { ...process.env, PORT: String(PORT), DATA_DIR: data }, stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((resolve, reject) => {
    child.stdout.once("data", resolve);
    child.once("exit", (code) => reject(new Error(`server exited early with code ${code}`)));
  });
});
after(() => { child?.kill(); rmSync(data, { recursive: true, force: true }); });

// Open a socket, send one message, and collect replies until `until` says stop.
function talk(first, until) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`), got = [];
    const timer = setTimeout(() => { ws.close(); reject(new Error(`timed out after ${JSON.stringify(got.map((m) => m.t))}`)); }, 5000);
    ws.onopen = () => ws.send(JSON.stringify(first));
    ws.onmessage = (ev) => {
      got.push(JSON.parse(ev.data));
      if (until(got)) { clearTimeout(timer); resolve({ ws, got }); }
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error("socket error")); };
  });
}

test("ping answers and paths outside the site are refused", async () => {
  const ping = await fetch(`http://localhost:${PORT}/api/ping`);
  assert.deepEqual(await ping.json(), { ok: true });
  const escape = await fetch(`http://localhost:${PORT}/..%2f..%2fpackage.json`);
  assert.ok(escape.status === 403 || escape.status === 404);
});

test("host a table over a real WebSocket and receive the whole game state", async () => {
  const { ws, got } = await talk({ t: "host", name: "Dana" }, (g) => g.some((m) => m.t === "update"));
  const welcome = got.find((m) => m.t === "welcome"), update = got.find((m) => m.t === "update");
  assert.equal(welcome.role, "dm");
  // About 31 KB: exercises WebSocket frames with a 16-bit length.
  assert.ok(JSON.stringify(update).length > 20000);
  assert.ok(Object.keys(update.state.map.levels[0].tiles).length > 400);

  // The lobby message that follows hosting may still be in flight; wait for the next update.
  const next = new Promise((resolve) => {
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.t === "update") resolve(m); };
  });
  ws.send(JSON.stringify({ t: "act", action: { type: "chronicle", title: "x".repeat(70) } }));
  const reply = await next;
  assert.equal(reply.t, "update");
  assert.equal(reply.events[0].type, "chronicle");

  // A 70 KB message each way exercises frames with a 64-bit length, in and out.
  const big = new Promise((resolve) => {
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.t === "update") resolve(m); };
  });
  ws.send(JSON.stringify({ t: "act", action: { type: "chronicle", title: "Long entry", text: "y".repeat(70000) } }));
  const bigReply = await big;
  assert.equal(bigReply.events[0].text.length, 70000);
  assert.ok(JSON.stringify(bigReply).length > 65536);
  ws.close();
});
