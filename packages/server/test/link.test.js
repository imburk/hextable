// The connection dot's server side (issue #246): the ping reply, the limits on pings, and who is told whose connection state.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { startServer, stopAll, within } from "./helpers.js";

after(stopAll);

function open(port) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`), got = [];
    const closed = new Promise((r) => { ws.onclose = (ev) => r(ev.code); });
    closed.catch(() => {});
    const c = {
      ws, got, closed, send: (m) => ws.send(JSON.stringify(m)),
      until: async (fn, ms = 5000, what = "a message") => { for (const end = Date.now() + ms; Date.now() < end;) { const v = got.find(fn); if (v) return v; await new Promise((r) => setTimeout(r, 10)); } throw new Error(`timed out waiting for ${what}`); },
      count: (t) => got.filter((m) => m.t === t).length,
    };
    ws.onmessage = (ev) => got.push(JSON.parse(ev.data));
    ws.onopen = () => resolve(c);
    ws.onerror = () => reject(new Error("socket error"));
  });
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// A DM and two players let in, each on a connection of its own.
async function table(port) {
  const dm = await open(port);
  dm.send({ t: "host", name: "DM" });
  const w = await dm.until((m) => m.t === "welcome");
  const players = [];
  for (const name of ["Ann", "Bo"]) {
    const p = await open(port);
    p.send({ t: "join", code: w.code, name });
    const pw = await p.until((m) => m.t === "welcome");
    dm.send({ t: "approve", userId: pw.userId, ok: true });
    await p.until((m) => m.t === "welcome" && m.approved, 5000, "approval");
    p.id = pw.userId; players.push(p);
  }
  dm.id = w.userId;
  return { dm, ann: players[0], bo: players[1], code: w.code };
}

test("a ping is answered with a pong carrying the same number, seated or not", async () => {
  const { port } = await startServer();
  const c = await open(port);
  c.send({ t: "ping", n: 7 });
  assert.deepEqual(await c.until((m) => m.t === "pong"), { t: "pong", n: 7 });
  c.send({ t: "ping", n: "x".repeat(100) });                    // anything but a whole number is answered with 0
  await c.until((m) => m.t === "pong" && m.n === 0);
  c.ws.close();
});

test("a flood of pings is limited like any other flood: the connection is told so and closed", async () => {
  const { port } = await startServer();
  const c = await open(port);
  for (let i = 0; i < 200; i++) c.send({ t: "ping", n: i });
  assert.equal(await within(c.closed, 5000, "the close"), 1005);   // closed by the server, no code sent
  assert.ok(c.got.some((m) => m.t === "error" && /Too many requests/.test(m.error)));
  assert.ok(c.count("pong") <= 25, `${c.count("pong")} pongs for 200 pings`);
});

test("a ping a few seconds apart is never limited", async () => {
  const { port } = await startServer({ env: { LIMIT_BURST: "3", LIMIT_RATE: "5" } });
  const c = await open(port);
  for (let i = 0; i < 6; i++) { c.send({ t: "ping", n: i }); await c.until((m) => m.t === "pong" && m.n === i); await pause(250); }
  assert.equal(c.count("error"), 0);
});

test("a player's state goes to the DM and back to that player, never to another player; the DM's goes to every player", async () => {
  const { port } = await startServer();
  const { dm, ann, bo } = await table(port);
  ann.send({ t: "link", state: "shaky", rtt: 1234.4 });
  assert.deepEqual(await dm.until((m) => m.t === "link"), { t: "link", from: ann.id, state: "shaky", rtt: 1234 });
  assert.deepEqual(await ann.until((m) => m.t === "link"), { t: "link", from: ann.id, state: "shaky", rtt: 1234 });
  dm.send({ t: "link", state: "good" });
  assert.deepEqual(await ann.until((m) => m.t === "link" && m.from === dm.id), { t: "link", from: dm.id, state: "good" });
  assert.deepEqual(await bo.until((m) => m.t === "link" && m.from === dm.id), { t: "link", from: dm.id, state: "good" });
  await pause(200);
  assert.equal(bo.got.filter((m) => m.t === "link" && m.from === ann.id).length, 0, "Bo was sent Ann's state");
  assert.equal(ann.got.filter((m) => m.t === "link" && m.from === bo.id).length, 0);
});

test("a state nobody may see goes nowhere: a player not yet let in, a made-up state, a bad number", async () => {
  const { port } = await startServer();
  const { dm, ann, code } = await table(port);
  const late = await open(port);
  late.send({ t: "join", code, name: "Late" });
  await late.until((m) => m.t === "welcome");
  late.send({ t: "link", state: "good" });                      // waiting to be let in
  ann.send({ t: "link", state: "great" });
  await pause(300);
  assert.equal(dm.count("link"), 0);
  ann.send({ t: "link", state: "lost", rtt: "slow" });          // the state is kept, the rtt is not
  assert.deepEqual(await dm.until((m) => m.t === "link"), { t: "link", from: ann.id, state: "lost" });
});

test("reports closer than two seconds on one connection are dropped, so a flood of them reaches nobody", async () => {
  const { port } = await startServer();
  const { dm, ann } = await table(port);
  for (let i = 0; i < 10; i++) ann.send({ t: "link", state: i % 2 ? "good" : "shaky" });
  await pause(400);
  assert.equal(dm.count("link"), 1);
});

test("someone let in later is told what the other side last reported", async () => {
  const { port } = await startServer();
  const { dm, ann, code } = await table(port);
  dm.send({ t: "link", state: "shaky", rtt: 900 });
  ann.send({ t: "link", state: "good", rtt: 40 });
  await dm.until((m) => m.t === "link" && m.from === ann.id);
  const cy = await open(port);
  cy.send({ t: "join", code, name: "Cy" });
  const w = await cy.until((m) => m.t === "welcome");
  dm.send({ t: "approve", userId: w.userId, ok: true });
  assert.deepEqual(await cy.until((m) => m.t === "link"), { t: "link", from: dm.id, state: "shaky", rtt: 900 });
  await pause(200);
  assert.equal(cy.count("link"), 1, "Cy was sent Ann's state");
  const dm2 = await open(port);                                  // the DM comes back on a new connection
  dm2.send({ t: "resume", code, token: dm.got.find((m) => m.t === "welcome").token });
  assert.deepEqual(await dm2.until((m) => m.t === "link" && m.from === ann.id), { t: "link", from: ann.id, state: "good", rtt: 40 });
});

test("pings and states change nothing at the table: no update, no history, the same game, no undo step", async () => {
  const { port } = await startServer();
  const { dm, ann } = await table(port);
  const exported = async () => { const n = dm.count("export"); dm.send({ t: "export" }); await dm.until(() => dm.count("export") > n && true, 5000, "export"); return JSON.stringify(dm.got.filter((m) => m.t === "export").at(-1).table.state); };
  const before = await exported();
  const seen = { updates: dm.count("update") + ann.count("update"), undo: dm.count("undoable"), history: dm.count("history") };
  for (let i = 0; i < 3; i++) { dm.send({ t: "ping", n: i }); ann.send({ t: "ping", n: i }); }
  ann.send({ t: "link", state: "shaky", rtt: 5 });
  dm.send({ t: "link", state: "lost" });
  await dm.until((m) => m.t === "link"); await ann.until((m) => m.t === "link" && m.from === dm.id);
  assert.equal(await exported(), before);
  assert.deepEqual({ updates: dm.count("update") + ann.count("update"), undo: dm.count("undoable"), history: dm.count("history") }, seen);
});
