// End to end: start the real server and talk to it over HTTP and a real WebSocket.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startServer, stopAll } from "./helpers.js";

let PORT;
before(async () => { ({ port: PORT } = await startServer()); });
after(stopAll);

// Open a socket, send one message, and collect replies until `until` says stop.
function talk(first, until) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`), got = [];
    const timer = setTimeout(() => { ws.close(); reject(new Error(`timed out after ${JSON.stringify(got.map((m) => m.t))}`)); }, 15_000);
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

  // A 70 KB action is over the 4 KB cap, so it is refused and nothing is recorded.
  const refused = new Promise((resolve) => {
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.t === "error" || m.t === "update") resolve(m); };
  });
  ws.send(JSON.stringify({ t: "act", action: { type: "chronicle", title: "Long entry", text: "y".repeat(70000) } }));
  assert.deepEqual(await refused, { t: "error", error: "That action is too large." });

  // The DM may send a whole map: this one is over 300 KB, so it arrives in frames with a 64-bit
  // length, and the update that follows is large too.
  const map = structuredClone(update.state.map), tile = Object.values(map.levels[0].tiles)[0];
  // (How many bytes a tile takes depends on the scenario's first tile, so widen the map until it is over 300 KB.)
  for (let n = 40; JSON.stringify(map).length < 320000; n += 5)
    for (let q = -n; q < n; q++) for (let r = -n; r < n; r++) map.levels[0].tiles[`${q},${r}`] ??= { ...tile };
  const loaded = new Promise((resolve) => {
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.t === "error" || m.t === "update") resolve(m); };
  });
  const body = JSON.stringify({ t: "act", action: { type: "loadMap", map } });
  assert.ok(body.length > 300000 && body.length < 1024 * 1024, `${body.length} bytes`);
  ws.send(body);
  const loadReply = await loaded;
  assert.equal(loadReply.t, "update", loadReply.error);
  assert.ok(JSON.stringify(loadReply).length > 65536 || loadReply.patch);
  ws.close();
});

test("a message far over any limit closes that connection cleanly and the server carries on", async () => {
  const { ws } = await talk({ t: "host", name: "Dana" }, (g) => g.some((m) => m.t === "update"));
  const closed = new Promise((resolve) => { ws.onclose = (ev) => resolve(ev.code); });
  ws.send("z".repeat(3 * 1024 * 1024));
  assert.equal(await closed, 1009);
  const ping = await fetch(`http://localhost:${PORT}/api/ping`);
  assert.deepEqual(await ping.json(), { ok: true });
});
