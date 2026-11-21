// Engine crashes are logged (review R2, #617), and GET /api/health shows counts and nothing about any table or player.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createTables } from "../src/tables.js";
import { startServer, stopAll } from "./helpers.js";

after(stopAll);

function client(tables) {
  const got = [];
  const session = tables.connect({ send: (m) => got.push(JSON.parse(JSON.stringify(m))) });
  return { got, say: (m) => session.receive(m), last: (t) => got.findLast((m) => m.t === t) };
}

// Run fn with console.error collected.
function capture(fn) {
  const lines = [], real = console.error;
  console.error = (...a) => lines.push(a.join(" "));
  try { fn(); } finally { console.error = real; }
  return lines;
}

const SECRET_TEXT = "PLAYER-TYPED-SECRET-TEXT";

test("a forced engine throw is logged once with table, action type, role and stack, and none of the payload", () => {
  const tables = createTables({ seed: () => 5 });
  const dm = client(tables);
  dm.say({ t: "host", name: "Dana-The-Secret-Name" });
  const welcome = dm.last("welcome");
  const t = tables.get(welcome.code);
  t.state.timeline.push = () => { throw new TypeError("disk on fire"); };
  const lines = capture(() => dm.say({ t: "act", action: { type: "advanceTime", minutes: 60, note: SECRET_TEXT } }));
  assert.equal(dm.last("error").error, "The table couldn't make sense of that action.", "the player's answer is unchanged");
  assert.equal(lines.length, 1, "logged once");
  const rec = JSON.parse(lines[0]);
  assert.equal(rec.event, "engine-crash");
  assert.equal(rec.table, welcome.code);
  assert.equal(rec.action, "advanceTime");
  assert.equal(rec.role, "dm");
  assert.match(rec.stack, /disk on fire/);
  assert.match(rec.stack, /at /, "a stack");
  for (const secret of [SECRET_TEXT, "Dana-The-Secret-Name", welcome.token]) assert.ok(!lines[0].includes(secret), `the line holds no ${secret}`);
  assert.deepEqual(tables.stats(), { crashes: 1, crashesByType: { advanceTime: 1 }, refusals: 0, refusalsByType: {} });
  // A refusal is counted but not logged as a crash.
  const refusals = capture(() => dm.say({ t: "act", action: { type: "noSuchAction" } }));
  assert.equal(refusals.length, 0);
  assert.equal(tables.stats().crashes, 1);
  assert.ok(tables.stats().refusals >= 1);
});

test("an action type that is not a plain name is counted as ? and never logged as sent", () => {
  const tables = createTables({ seed: () => 5 });
  const dm = client(tables);
  dm.say({ t: "host", name: "Dana" });
  const t = tables.get(dm.last("welcome").code);
  t.state.timeline.push = () => { throw new Error("x"); };
  const lines = capture(() => dm.say({ t: "act", action: { type: `advanceTime ${SECRET_TEXT}`, minutes: 1 } }));
  assert.ok(lines.every((l) => !l.includes(SECRET_TEXT)));
  assert.ok(!JSON.stringify(tables.stats()).includes(SECRET_TEXT));
});

test("GET /api/health has the agreed shape and holds no table or player data", async () => {
  const { port, stderr } = await startServer({ env: { RAILWAY_GIT_COMMIT_SHA: "0123456789abcdef0123456789abcdef01234567" }, stderr: "pipe" });
  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  const msgs = [];
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error("socket")); });
  ws.onmessage = (ev) => msgs.push(JSON.parse(ev.data));
  ws.send(JSON.stringify({ t: "host", name: "Dana-The-Secret-Name" }));
  while (!msgs.some((m) => m.t === "welcome")) await new Promise((r) => setTimeout(r, 20));
  const welcome = msgs.find((m) => m.t === "welcome");
  const res = await fetch(`http://localhost:${port}/api/health`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = await res.json();
  assert.deepEqual(Object.keys(body).sort(), ["build", "connections", "crashes", "crashesByType", "ok", "proxy", "tables", "uptime"]);
  assert.equal(body.ok, true);
  assert.ok(Number.isInteger(body.uptime) && body.uptime >= 0);
  assert.deepEqual(body.tables, { loaded: 1, saved: 1, archived: 0, active: 1 });
  assert.equal(body.connections, 1);
  assert.equal(body.crashes, 0);
  assert.deepEqual(body.crashesByType, {});
  assert.equal(body.build, "0123456");
  const text = JSON.stringify(body);
  for (const secret of [welcome.code, welcome.token, "Dana-The-Secret-Name"]) assert.ok(!text.includes(secret), "no table code, token or name");
  ws.close();
  assert.equal(stderr(), "", "nothing logged for a healthy server");
});

test("GET /api/health is rate limited per address", async () => {
  const { port } = await startServer({ env: { LIMIT_HEALTH_MINUTE: "3" } });
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await fetch(`http://localhost:${port}/api/health`)).status);
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
});
